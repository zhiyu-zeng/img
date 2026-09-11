---
title: 【先知】Arthas查杀Agent内存马的一次实践
source: https://xz.aliyun.com/news/92797
source_host: xz.aliyun.com
clip_date: 2026-09-11T13:40:37+08:00
trace_id: cdb983b5-287d-4c9a-be5e-541584356fe3
content_hash: ebe7e3ad4f7a63d3e774d70c573799bc6f0841d9d1494f8e6f85f0b9993deec1
status: synced
tags:
  - 先知
  - 内存马查杀
  - Arthas
series: null
feed_source: 先知安全技术社区
ai_summary: Arthas 定位并摘除 JVM 中恶意的 retransformable transformer，再用 dump 触发 retransform 还原字节码，可在 JDK 8/17 下清除 Agent 内存马且不影响业务。
ai_summary_style: key-points
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 3d875244-d011-8141-a635-d9748154d4aa
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Arthas 定位并摘除 JVM 中恶意的 retransformable transformer，再用 dump 触发 retransform 还原字节码，可在 JDK 8/17 下清除 Agent 内存马且不影响业务。
> 
> - **两类内存马：** redefine 型用 `redefineClasses` 一次性替换字节码、无法复用（如 Weblogic404Memshell）；transformer 型注册 `canRetransform=true`，每次 define/redefine/retransform 都会重跑 `transform`，是 memshellparty、jmg 等主流工具的做法，KMBA 只兼容后者。
> - **缓存字节规律：** `redefineClasses` 不改写缓存，缓存只在 `transform` 回调返回非 null 字节时定格，因此首次 retransform 前做过 redefine，retransform 拿到的就是被改过的字节。实验（ApplicationFilterChain，SEED-A/B）三次回调依次输出 SEED-A、SEED-BB、SEED-A。
> - **检测思路：** 用 Arthas vmtool 取 `sun.instrument.InstrumentationImpl` 实例，读其 `mRetransfomableTransformerManager.mTransformerList`（`canRetransform=false` 时写入 `mTransformerManager`），再用 jad 反编译 transformer 确认改写逻辑。
> - **卸载顺序：** 先 vmtool 调 `InstrumentationImpl#removeTransformer` 摘掉恶意 transformer，再用 Arthas dump（内部触发 `retransformClasses`）还原目标类；只还原不摘 transformer，后续 define/redefine 仍会被重新污染。常改类如 `ApplicationFilterChain`、`StandardContextValve` 做定点修复。
> - **JDK 9+ 与实测：** `sun.instrument` 归入 `java.instrument` 模块且默认不 opens，普通反射被模块化拦截，需改用 `sun.misc.Unsafe` 读私有字段；10 组环境（Tomcat 9/10.1、Jetty、WebLogic、Spring Boot、Solr、Y4er、自建 HttpServlet 钩子）卸载均成功，耗时约 10–25 秒，JDK 17 下字节级还原仅执行未做比对。

## 前置知识

Agent内存马简单来说，就是通过JavaAgent技术，调用VirtualMachine.attach到指定jvm中，再调用ASM或者是javassist去修改类的字节码，达到篡改内部类而不被发现的目的。

在已经武器化（memshellparty，jmg等）的工具中，最常用的Agent注入方式就是transformer，简单代码如下：

```java
======== method Agent.agentmain
inst.addTransformer(new Filter_Transform(),true); # 注册transformer
inst.retransformClasses(className); # 立即触发一次Filter_Transform.transform方法
======== method Filter_Transform.transform # transformer需要实现transform方法，在其中写入修改字节码的恶意逻辑
javassist.classPool.get(className)
javassist.getDeclaredMethod("doFilter")
```

transformer类内存马简单来说就是通过调用 `InstrumentationImpl#addTransformer` 注册transformer，再调用 `InstrumentationImpl#retransformClasses` 方法，而调用 `retransformClasses` 方法的时候，又会遍历调用JVM中已经注册transformer中的transform方法，而修改字节码的恶意逻辑就在这个transform中。

可以看前辈们的文章看具体分析。

[DrunkBaby](https://drun1baby.top/2023/12/07/Java-Agent-%E5%86%85%E5%AD%98%E9%A9%AC%E5%AD%A6%E4%B9%A0/) [su18](https://su18.org/post/memory-shell/#java-agent-%E5%86%85%E5%AD%98%E9%A9%AC)

## redefine类与transformer类Agent内存马

从查杀角度可以分成 `redefine` 类与 `transformer` 类。

### redefine类

只有很少一部分内存马是redefine类，他是用到了 `redefineClasses` 方法，例如 [Weblogic404Memshell](https://github.com/flowerwind/Weblogic404Memshell)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ca18c5dacde50c5d.png)

`redefineClasses` 方法的部分官方注释如下：

```plain
/**
 * Redefine the supplied set of classes using the supplied class files.
 *
 * <P>
 * This method is used to replace the definition of a class without reference
 * to the existing class file bytes, as one might do when recompiling from source
 * for fix-and-continue debugging.
 * Where the existing class file bytes are to be transformed (for
 * example in bytecode instrumentation)
 * {@link #retransformClasses retransformClasses}
 * should be used.
 * @param definitions array of classes to redefine with corresponding definitions;
 *                    a zero-length array is allowed, in this case, this method does nothing
**/
void
redefineClasses(ClassDefinition... definitions)
    throws  ClassNotFoundException, UnmodifiableClassException;
```

读 `redefineClasses` 方法的官方注释，再结合他引入的参数分析，其实 `redefineClasses` 就是对已经存在的类进行一次重新定义。

但是这种方式是一次性的，也就是说 `redefineClasses` 之后，用修改后的字节码替换原本的字节码。若是字节码又被改回去了，就只能再调用一次 `redefineClasses` 再改了，但是 `transformer` 类就没有这个烦恼。

### transformer类

`transformer` 类前面已经解释过了注册的原理，他和 `redefine` 类内存马最大的区别就是， `transformer` 是可以复用的，每次调用 `retransformClasses` 方法，都会遍历执行 `canRetransform=true` 的 `ClassFileTransformer#transform` ，官方注释：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9a232553c8134682.png)

值得注意的是，这里注释中写到了一个 `initial class file bytes` ，名字有点长，我这里暂且将其命名为初始字节。

注释中写的初始字节可以简单解释为内存中缓存的原始字节，但是在某个条件下，缓存字节可能不会是原始字节， [classFileParser.cpp](https://github.com/bpupadhyaya/openjdk-8/blob/master/hotspot/src/share/vm/classfile/classFileParser.cpp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fc834872bb6ad1e3.png)

其中的 `retransformable agent` 就是指 `canRetransform=true的transformer` ，这段注释其实就是在说：如果在第一次调用 `retransformClasses` 之前，调用了 `redefineClasses` 的话，那么缓存的字节可能就不会是初始字节了。

在 `retransformClasses` 执行的时候，获取的其实就是缓存字节而不是原始字节。当缓存字节为空的时候，JVM就会从当前类还原出字节出来，充当后续的缓存字节。

并且在 `retransformClasses` 的注释中有这样一句话 `This function reruns the transformation process (whether or not a transformation has previously occurred)` ，这句话的意思就是说，这个函数会重新执行转换进程，无论是否进行过转换过程。也就是说，无论是否进行过转换， `transformer` 都会重新进行一次转换。

这个过程在我实际感受下来，简单描述一下就是： `retransformClasses` 会把 `redefineClasses` 改过的字节还原为缓存字节。但有个前提：缓存字节在这次 `redefineClasses` 之前就已经实际落定了。 `redefineClasses` 本身从头到尾都不会修改缓存字节，它只改写当前类；缓存只会在 `transform` 被调用且返回了字节（而不是null）的那一刻落定。所以在 `redefineClasses` 之前只要发生过一次这样的调用，缓存里存的就是 redefine 之前的字节。

证明之前明确一点，无论获取的是缓存字节还是原始字节， `transformer` 都能改。那在这个基础上，设置这种测试逻辑，测试类为常用的 `ApplicationFilterChain` ：

1.  在任何 `transformer` 操作之前，先 `redefineClasses` ，写入字符串A。
2.  注册 `transformer` ，执行 `transform` 方法，看获取到的类有无字符串A。
3.  第二次 `redefineClasses` ，写入字符串B。
4.  调用之前注册的 `transformer` ，看获取到的类有无字符串B。

AI实现后的代码如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e802ced3e022fc40.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/75d3db1ec50410fb.png)

按照我们的理论：第一次 `redefineClasses` 时缓存还是空的，它写入的字节此时只是“当前类字节”；到第2步第一次 `retransformClasses` ， `transformer` 收到的是从当前类还原出来的字节（含SEED-A），并原样返回——正是这次“返回了字节”的回调，让JVM把这份字节定格成缓存。之后 `transformer` 再被调用，拿到的就都是缓存字节， `redefineClasses` 再写什么也改变不了它。

注册 `transformer` 之后，每次新类的define与redefine都会遍历执行一次 `transformer#transform` ；当 `transformer#transform` 方法返回null时，JVM就原样使用这次喂进来的字节——define/redefine场景是传入的定义字节， `retransform` 场景是缓存字节。

那么按照我们的结论，运行的结果就应该产生三次回调：

1.  第一次调用 `retransformClasses` ，获取到的是被 `redefineClasses` 修改过后的字节码，就应该含有SEED-A。
2.  第二次：调用 `redefineClasses` ，会遍历执行 `transformer#transform` ，这个时候传给 `transformer` 的字节码就是传给 `redefineClasses` 的字节码，所以现在应该输出SEED-BB。
3.  第三次：调用 `retransformClasses` ，这个时候不管中间进行了几次 `redefineClasses` ，传给 `transformer` 的都是缓存字节，而缓存字节在第一次 `retransformClasses` 的时候就已经确定好了，缓存字节为第一次 `redefineClasses` 传入的字节。所以这一步应该要输出SEED-A。

看一下输出，如我们所料。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c7af00ef9b7c8712.png)

## 查杀Agent内存马的理论基础

GitHub中绝大部分的开源的Agent注入工具，都是 `transformer` 型的。那么在KMBA中更多的也是兼容这类。

### 检测

前面提到了Agent需要注册 `canRetransform=true的transformer` 来执行恶意逻辑，那么在注册过程就会留下痕迹，如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/714c9c179b678e01.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/517c15c7513cfa47.png)

这里正常就会进入到 `this.mRetransfomableTransformerManager.addTransformer(var1);`，跟进一下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/00c1aaa1a4738d00.png)

逻辑很简单，这个复杂的 `TransformerManager#addTransformer` ，其实就是在做 `mTransformerList.add(var1)` ，var1就是恶意的transformer。

那么我们就可以通过Arthas来获取 `sun.instrument.InstrumentationImpl` 的实例，再获取其中的存储transformer的变量，也就是 `mRetransfomableTransformerManager.mTransformerList` ，写成伪java代码，就差不多是这样。

```java
// instances数组由Arthas获取，获取sun.instrument.InstrumentationImpl
for (InstrumentationImpl ins : instances) {
    TransformerManager tm1 = ins.mTransformerManager;
    TransformerManager tm2 = ins.mRetransfomableTransformerManager;

    List<String> r1 = new ArrayList<>();
    if (tm1 != null) {
        for (TransformerInfo ti : tm1.mTransformerList) {
            r1.add(ti.mTransformer.getClass().getName());
        }
    }
    List<String> r2 = new ArrayList<>();
    if (tm2 != null) {
        for (TransformerInfo ti : tm2.mTransformerList) {
            r2.add(ti.mTransformer.getClass().getName());
        }
    }
    System.out.println("inst[0]/normal:" + r1 + "|inst[0]/retransformable:" + r2);
}
```

这里还获取了 `mTransformerManager` ，当 `canRetransform=false` 的时候， `addTransformer` 方法就会写入到 `mTransformerManager` 。

那么现在获取到的其实就是 `transformer` ，其中的 `transform` 方法就是修改字节码逻辑所在地方，那么现在获取到 `transformer` 的className后，那么就可以通过Arthas的jad命令反编译出来它的源码，看是不是真的在写入内存马。

### 卸载

卸载其实不是特别好弄，我想过通过 `Class.getProtectionDomain().getCodeSource()` 获取到源class文件，再调用Arthas的 [retransform](https://arthas.aliyun.com/doc/retransform.html) 或者是 [redefine](https://arthas.aliyun.com/doc/redefine.html) 命令去重新加载一下class，但是这个其实在逻辑上不好实现。因为涉及到要解jar拿class，逻辑上不是特别好弄，也不是特别友好。我也想过自己用OGNL去实现retransform，但是逻辑太过复杂，要涉及到大量的反射，如果有lambda类还要专门做适配，如果遇到高版本，还要专门做高版本适配，太麻烦了。

于是让AI去审计Arthas源码和读javadoc，看能不能找到好办法或者能不能自己实现个Arthas的命令，幸运的是，两个地方都有丰厚的成果。

在Arthas源码中，发现 [dump](https://arthas.aliyun.com/doc/dump.html) 命令里面居然有这样一段逻辑。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/375b7d9a44d5a6a0.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/836d2c56eac5318e.png)

而前文提到 `retransformClasses` 方法会直接将现有的字节还原为缓存字节的状态。恰好dump命令就替我们做了这件事。

Arthas的dump命令，帮我做了一次 `retransformClasses` ，而 `retransformClasses` 又会对目标类进行一次还原，把缓存字节交给JVM，经过现有 `transformer` 处理后再布置回去。

假如注入的是 `ApplicationFilterChain` ，如果恶意的 `transformer` 不给它删掉的话，就算你调用 `retransformClasses` 还原了字节码，那么在之后业务上如果有任何的 `define class` 或者 `redefine class` 的操作的话，那么就会遍历所有 `transformer` 执行 `transform` 方法，还是会被恶意的 `transformer` 给修改掉。

所以卸载步骤应该是需要先移除掉恶意的 `transformer` ，再还原字节码，移除 `transformer` 很简单，有现成的方法 `sun.instrument.InstrumentationImpl#removeTransformer` ，直接vmtool直接调就可以。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/36d18a313633eb11.png)

这个过程等价成java伪代码应该是

```java
=== 第一步，通过Arthas的vmtool移除恶意的transformer
// instances数组由Arthas获取，获取sun.instrument.InstrumentationImpl
for (InstrumentationImpl ins : instances) {
    List<TransformerInfo> m1 = new ArrayList<>();
    for (TransformerInfo ti : lst1) {                          // OGNL 选择体 {?} 的过滤语义
        if (ti.mTransformer.getClass().getName()
                .equals("注入器className")) {
            m1.add(ti);
        }
    }
    List<TransformerInfo> m2 = /* 同上对 lst2 */;

    int c = m1.size() + m2.size();
    if (c > 0) {
        if (!m1.isEmpty()) ins.removeTransformer(m1.get(0).mTransformer);
        if (!m2.isEmpty()) ins.removeTransformer(m2.get(0).mTransformer);
        return "removed";
    }
}
=== 第二步，通过Arthas的dump命令，还原目标类。
# 由于无法通过代码直接定位到注入器修改了哪些类的字节码，且无法retransform所有的类。
# 故而让AI收集了一些Agent内存马注入工具常改的类，定点修复。
private String[] dumpTargetClasses = {
        "org.apache.catalina.core.ApplicationFilterChain",
        "org.apache.catalina.core.StandardContextValve",
        ...
};
for (Class c : dumpTargetClasses)
    java.lang.instrument.Instrumentation#retransformClasses(c) # 这个步骤由Arthas完成
```

最后都要把这些java代码给转为OGNL表达式。

由于redefine类内存马太小众了，在KMBA中暂时不做实现。

## jdk 9+ 环境下的Agent查杀

这个是在测试高版本Springboot环境下的时候发现的问题。

高版本jdk模块化后， `sun.instrument` 放到了于 `java.instrument` 模块，默认不 opens 给 unnamed module，用Arthas相同的命令在高版本jdk就会出现如下错误：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/57f804a9b0071c7c.png)

既然直接获取不行，那就只能通过反射来拿了，但是常规的 `class.getDeclaredField` 也同样会被模块化拦住。

这里参考了这两篇文章的思路 [浅析高版本JDK反射类加载问题](https://blog.csdn.net/2401_83799022/article/details/140687476) 、 [JDK17+反射限制绕过](https://pankas.top/2023/12/05/jdk17-%E5%8F%8D%E5%B0%84%E9%99%90%E5%88%B6%E7%BB%95%E8%BF%87) ，通过 `sun.misc.Unsafe`

让AI把原本的语句简单改一下后，转成java伪代码，如下：

```java
// ===== Unsafe 版读私有字段（OGNL → Java 伪代码）=====

// vmtool --action getInstances → 拿所有 InstrumentationImpl 实例
InstrumentationImpl[] instances = getAllInstances(InstrumentationImpl.class);
InstrumentationImpl ins = instances[0];

Class<?> uc = Class.forName("sun.misc.Unsafe");

Field uf = uc.getDeclaredField("theUnsafe");
uf.setAccessible(true);
Unsafe u = (Unsafe) uf.get(null);              // 拿 Unsafe 单例

Field f = ins.getClass().getDeclaredField("mTransformerManager");
long off = u.objectFieldOffset(f);
TransformerManager tm = (TransformerManager) u.getObject(ins, off);
String result = (tm == null) ? "null" : tm.getClass().getName();
```

同样的，在卸载的逻辑里面也要把原本的反射逻辑改成 `sun.misc.Unsafe` 。这里节省篇幅，就不再说。

就算是高版本jdk，他跑的也是Tomcat，在类Tomcat容器中，适合写入字节码的就那几个类。

## 验证查杀效果

将相应的逻辑，写到KMBA里面后，让AI自己去起相应的环境去测。msp=memshellparty

**① MSP TomcatFilterChain（** `ApplicationFilterChain.doFilter` **）— Tomcat 9.0.97（JDK 8）**

|     |     |
| --- | --- | 
| 步骤  | 实测结果 |
| <0> | ✅ `curl -H "User-Agent: QIIEpvLN" ".../?FFFsHHii=id"` → `uid=0(root)` |
| <1> | ✅ `inst[1]/retransformable org.apache.nZcPC.HttpClientUtil` |
| <2> | ✅ `[+] unload success` （13.8s，含字节还原） |
| <3> | ✅ list 只剩 arthas 的 transformer |
| <4> | ✅ 带触发头返回 Tomcat 首页（命令失效） |

**② MSP TomcatContextValve（** `StandardContextValve.invoke` **）— Tomcat 9.0.97（JDK 8）**

|     |     |
| --- | --- | 
| 步骤  | 实测结果 |
| <0> | ✅ 触发头执行命令 → `uid=0(root)` |
| <1> | ✅ `inst[x]/retransformable org.apache.nZcPC.HttpClientUtil` |
| <2> | ✅ `[+] unload success` （14.2s） |
| <3> | ✅ list 只剩 arthas 的 transformer |
| <4> | ✅ 带触发头返回 Tomcat 首页（命令失效） |

**③ MSP JettyHandler（** `ServletHandler.doHandle` **）— Jetty 9.4（JDK 8）**

|     |     |
| --- | --- | 
| 步骤  | 实测结果 |
| <0> | ✅ 注入器 transform 生效（日志 `MemShell Agent is working at org.eclipse.jetty.servlet.ServletHandler.doHandle` ）；命令回显不可用（Jetty 无根应用，请求 404） |
| <1> | ✅ `inst[1]/retransformable org.apache.nZcPC.HttpClientUtil` |
| <2> | ✅ `[+] unload success` （23.1s，含字节还原） |
| <3> | ✅ list 只剩 arthas 的 transformer |
| <4> | ✅ 马已移除且 ServletHandler 字节还原（dump 产物与磁盘原始字节一致） |

**④ MSP WebLogicServletContext（** `WebAppServletContext.securedExecute` **）— WebLogic 12.2.1.3（JDK 8）**

|     |     |
| --- | --- | 
| 步骤  | 实测结果 |
| <0> | ✅ 注入器 transform 生效（日志 `working at weblogic.servlet.internal.WebAppServletContext.securedExecute` ）；命令回显不可用（控制台返回部署页） |
| <1> | ✅ `inst[1]/retransformable org.apache.nZcPC.HttpClientUtil` |
| <2> | ✅ `[+] unload success` （14.3s，含字节还原） |
| <3> | ✅ list 只剩 arthas 的 transformer |
| <4> | ✅ 马已移除且 WebAppServletContext 字节还原 |

**⑤ JMG TomcatAgentTransformer（** `ApplicationFilterChain.doFilter` **）— Tomcat 9.0.97（JDK 8）**

|     |     |
| --- | --- | 
| 步骤  | 实测结果 |
| <0> | ✅ 注入器 transform 生效（日志 working 于 doFilter；JMG shell 为简化验证类，无命令回显） |
| <1> | ✅ `inst[0]/retransformable jmg.core.template.TomcatAgentTransformer` |
| <2> | ✅ `[+] unload success` （16.2s，含字节还原） |
| <3> | ✅ list 只剩 arthas 的 transformer |
| <4> | ✅ 马已移除且字节还原 |

**⑥ MSP TomcatFilterChain — Spring Boot 2.7 内嵌 Tomcat（JDK 8）**

|     |     |
| --- | --- | 
| 步骤  | 实测结果 |
| <0> | ✅ 触发头执行命令 → `uid=0(root)` |
| <1> | ✅ `inst[1]/retransformable org.apache.nZcPC.HttpClientUtil` |
| <2> | ✅ `[+] unload success` （13.9s） |
| <3> | ✅ list 只剩 arthas 的 transformer |
| <4> | ✅ 带触发头返回 `spring-boot-ok` （命令失效，应用正常） |

**⑦ MSP TomcatFilterChain — Tomcat 10.1（JDK 17，Unsafe 路径）**

|     |     |
| --- | --- | 
| 步骤  | 实测结果 |
| <0> | ✅ 注入器 transform 生效（transformer 注册到 retransformable 列表） |
| <1> | ✅ `inst[1]/retransformable org.apache.nZcPC.HttpClientUtil` （Unsafe 绕模块 fallback） |
| <2> | ✅ `[+] unload success` （10.8s；后续两轮复测一次成功，早期 retransform 卡死未再复现） |
| <3> | ✅ list 只剩 arthas 的 transformer |
| <4> | ✅ 命令失效，业务正常（后续两轮复测五步全过；restoreBytecode 在 JDK17 实际执行，字节级比对未做，还原效果待补证） |

**⑧ MSP JettyHandler（** `ServletHandler.handle` **）— Solr 8.11.0（Jetty 9.4.44，JRE 8u102）**

|     |     |
| --- | --- | 
| 步骤  | 实测结果 |
| <0> | ✅ `GET /solr/?cmd=id` → `uid=0(root)` |
| <1> | ✅ 检出 `JettyHandlerAgentInjector` （TARGET_CLASSES 覆盖 ee8~ee11/mortbay 等 6 个 ServletHandler 变体，另定义伪装类 `OAuthAgentHandler` ） |
| <2> | ✅ `[+] unload success` （早期版本 Web 通道曾复现单次 not-found、二次 success 的卸载窗口，重试通过） |
| <3> | ✅ list 只剩 arthas 的 transformer |
| <4> | ✅ 命令失效， `/solr/admin/cores?action=STATUS` 200 正常 |

**⑨ Y4er javaagent-tomcat-memshell（** `ApplicationFilterChain.doFilter` **）— Tomcat 9.0.97（JDK 8）**

|     |     |
| --- | --- | 
| 步骤  | 实测结果 |
| <0> | ✅ `?cmd=id` → `uid=0(root)` |
| <1> | ✅ 检出 `org.chabug.MyTransformer` （独立开源实现，Javassist insertBefore，与 MSP 的 ASM 实现完全不同——验证检测模型不依赖特定字节码库/类名） |
| <2> | ✅ `[+] unload success` |
| <3> | ✅ list 恶意项消失（ `agent (0)` ，无常驻 arthas 会话时连自噪音都没有） |
| <4> | ✅ 命令失效，业务正常 |

**⑩ 自建 HttpServlet#service 钩子（公开文章手法，** `HttpServlet.service` **）— Tomcat 9.0.97（JDK 8）**

|     |     |
| --- | --- | 
| 步骤  | 实测结果 |
| <0> | ✅ `?cmd=id` → `uid=0(root)` （HttpServlet 层钩子，全部请求生效） |
| <1> | ✅ 检出 `self.HttpServletTransformer` （同名双实例 javax/jakarta 变体，列表显示一条；jad 可见 insertBefore 到 service 的完整源码） |
| <2> | ✅ `[+] unload success` （首个实例即活跃钩子，首次卸载即死亡） |
| <3> | ⚠️ 列表残留一条同名条目：单次卸载只移除一个匹配实例，二次 unload 清零 |
| <4> | ✅ 命令失效，业务正常 |

## 结语

致此，内存马查杀三部曲就已经完成了，若文章有误，欢迎指正批评。

目前 [https://github.com/y1shiny1shin/KMBA](https://github.com/y1shiny1shin/KMBA) 稳中向好，在靶场环境都做过全量测试，在生产环境做过实测，能对内存马进行查杀的同时，而不影响业务。

欢迎大家应用到实战中去，若有问题，欢迎提issue，若有建议，欢迎发邮件y1shin@163.com
