---
title: 【微信】Java安全 | 内存马应急响应查杀全流程分析-Filter型
source: https://mp.weixin.qq.com/s/KTrzn9keYpHUAABEOtXy7g
source_host: mp.weixin.qq.com
clip_date: 2026-10-20T13:11:59+08:00
trace_id: e7b1c0db-e1d6-430f-b59b-ec2449237e2f
content_hash: 8e1da2825d682be7036b29e47c7351d4240882e31611ffdcddf3065f7b67c46a
status: synced
tags:
  - 微信
  - Java内存马
  - 应急响应
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 用 memshell-scanner 初筛、Arthas 枚举可疑 Filter 类、vmtool 反查 InvocationHandler 真身、jad 取证，最后 kill 内存马并删除 JSP 落地文件，构成 Filter 型内存马的完整查杀流程。
ai_summary_style: key-points
images_status:
  total: 29
  succeeded: 29
  failed_urls: []
notion_page_id: 3ff75244-d011-8109-a946-e973580b6370
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 用 memshell-scanner 初筛、Arthas 枚举可疑 Filter 类、vmtool 反查 InvocationHandler 真身、jad 取证，最后 kill 内存马并删除 JSP 落地文件，构成 Filter 型内存马的完整查杀流程。
> 
> - **测试环境与注入：** Kali 上把 Tomcat 9 解压到 `/opt/tomcat9`，默认监听 8080；用哥斯拉上传 JSP 马后注入 Filter 型内存马，Pattern 为 `/*` 拦截全部请求，URL 可随意填，加密器选 AES_BASE64。
> - **先做基线对比：** 注入前后各访问一次 `tomcat-memshell-scanner.jsp`；哥斯拉自带功能注入的马容易被扫出。蓝队应先 dump class 再做人工确认，真实业务中不能贸然 kill 不确定对象。
> - **可疑类特征：** `sc javax.servlet.Filter` 枚举后，`jdk.proxy3.$Proxy10` 无包名归属；`sc -d` 显示 `code-source` 为空、父类为 `java.lang.reflect.Proxy`、实现了 `javax.servlet.Filter`，三条即定性。
> - **反查真身：** `vmtool --action getInstances --className jdk.proxy3.$Proxy10 --express 'instances[0].h.getClass().getName()' --limit 1` 拿到伪装成 `org.apache.coyote.deser.std.AtomicReferenceDeserializer` 的 InvocationHandler；jad 后可见 pass/secretKey 及 `md5(pass+key)` 的哥斯拉密钥派生特征。
> - **溯源与清除：** ClassLoader 层级暴露 `wanfenganquan.jsp` 内部类 X（伪装为 ClassLoader）经 defineClass 加载；kill 内存马后必须同步删除 JSP 落地文件，否则可被再次注入。

## Java安全 | 内存马应急响应查杀全流程分析-Filter型

**挽风安全** *2026年10月20日 12:52*

#### 从搭建环境到应急排查内存马全流程分析

首先在Kali中搭建Tomcat环境

```apache
wget https://mirrors.tuna.tsinghua.edu.cn/apache/tomcat/tomcat-9/v9.0.123/bin/apache-tomcat-9.0.123.tar.gz
```

安装Tomcat9，随后解压到opt目录下，赋予脚本执行权限

```bash
tar -zxf apache-tomcat-9.0.123.tar.gz
sudo mv apache-tomcat-9.0.123 /opt/tomcat9
sudo chmod +x /opt/tomcat9/bin/*.sh
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/312d8f6baf22d6ee.png)

默认配置开启的是8080端口，可以查看一下是否成功开启

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/16bddf18d45c9645.png)

```apache
ss -tlnp | grep 8080
```

因为这里的主题是排查内存马，所以上传webshell的步骤就不演示了，这里直接用哥斯拉生成木马（不考虑免杀情况），直接开始排查内存马的过程，我就直接把webshell放在网站根目录下用哥斯拉连接了

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cd8b73887e01e85b.png)

**我是用Kali 默认以 root 运行 Tomcat**：所以内存马执行命令的权限就是 root，whoami 直接出 root，这是靶场环境的特点，真实场景中 Tomcat 一般是低权限用户。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f8f5d1bee4483aa4.png)

哥斯拉直接进行连接

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d0703fd2952f932c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7666cb774fc9adb5.png)

这里先从基础的Filter型内存马开始，过两天再更新另外两种(Servlet/Listener)

## 注入前基线扫描

为了突出前后的不同，我这里先上传tomcat-memshell-scanner.jsp文件到网站根路径访问查看一下是否有异常的类或者是否有异常被判定为内存马的class。

```javascript
tomcat-memshell-scanner.jsp是公开的一款用于查杀内存马的工具，互联网直接Download即可
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f0e182968afb9ea4.png)

可以看到这里没有异常的Filter类型的class

下一步我开始注入Filter类型的内存马进入到容器中，如图显示注入成功

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c4e77ad3f9aeab15.png)

我先尝试连接一下，看看内存马是否能够连接。

这里 **URL 可以随便填写**，因为 Filter 型内存马的 URL Pattern 是 `/*` ，拦截所有请求。哥斯拉会向这个 URL 发加密 Payload，Filter 拦截后识别并执行，注入内存马加密器是AES_BASE64，这里连接也选择AES_BASE64的加密器

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/323b48c37f1aa507.png)

已经证明内存马已经注入成功了，此时功能也是一样的可以执行命令等等

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4cd4b5dc5d3fbdf1.png)

此时再去回头看看tomcat-memshell-scanner.jsp页面是否能查杀出来这个Filter类型的内存马

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6b9f37e0a6bbe641.png)

如果是哥斯拉自带功能的载入内存马很容易被查杀出来，但是从蓝队来看这是个好事(bushi),可以判定出来这个大概率是打入的内存马，如果为了保存环境第一时间可以先dump出来这个class，我们自己详细的去分析一下，有人工的分析+工具那么肯定是能够确认是内存马，如果不确定是不是，直接dump下来，毕竟真实业务中不能这么贸然的去kill掉不确定的东西

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cd21d353961c7969.png)

这里直接用Arthas去dump这个疑似为内存马的类分析一下

```nginx
Arthas 是阿里巴巴开源的 Java 诊断工具，可用于检测和查杀内存马。以下是使用 Arthas 查杀内存马的具体步骤。
直接Download:curl -O https://arthas.aliyun.com/arthas-boot.jar
运行：java -jar arthas-boot.jar
```

启动后会列出 Kali 上所有 Java 进程，提供给我们选择：

```markdown
[1]: 1234 org.apache.catalina.startup.Bootstrap /opt/tomcat9
[2]: 5678 ...
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5e470078cfb15d0f.png)

**这里选带 `org.apache.catalina.startup.Bootstrap` 的那个** （这就是 Tomcat 主进程），输入序号回车。attach 成功后提示符变成 `arthas@xxx` ，可以输入命令了。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dbbdcec8ad62a31e.png)

## Arthas枚举可疑Filter

因为有memshell-scanner的初步判断，所以这里先去检索Filter类型的类，看看是否有可疑类

思路是： **按"容器组件类型"枚举，再用"异常特征"过滤**。

```powershell
内存马类型	必须注册到哪	                 枚举命令
Filter 型	FilterChain/FilterConfig	sc javax.servlet.Filter
Servlet 型	ServletContext/Wrapper	        sc javax.servlet.Servlet
Listener 型	ServletContext 事件监听器	 sc javax.servlet.ServletRequestListener
```

先检索一下Filter型的类看一下：sc javax.servlet.Filter

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dfa2e49962221d96.png)

这里找到了 **唯一可疑项**：这个特征包名不符合任何已知来源（不是 `org.apache.*` 、不是 `filters.*` 、不是 JDK 接口）、动态代理命名格式—— **在一片"有明确归属"的类名里，它就是那个没有归属的**：jdk.proxy3.$Proxy10

-   `CsrfPreventionFilter` → Tomcat 官方 jar，能解释 ✅
    
-   `ExampleFilter` → examples 应用自带，能解释 ✅
    
-   `jdk.proxy3.$Proxy10` → 动态代理 + 无包名归属 + 之前没见过 → **解释不了** ❌
    

接下来就拿这个可以的去跟正常的去做一下比较

```powershell
# 正常类的标准档案（拿 WsFilter 做对照）
sc -d org.apache.tomcat.websocket.server.WsFilter

# 可疑类的档案
sc -d jdk.proxy3.$Proxy10
```

重点关注code-source这个字段的内容：

WsFilter（预期）回显：file:/opt/tomcat9/lib/tomcat-websocket.jar

$Proxy10（预期）回显为空

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5c75de9a1b6ffdd2.png)

事实证明确实如此，这里说一下为什么code-source是空，因为马没有磁盘来源，是凭空出现的

另外三条铁证 = 定性完成

1.  **code-source 为空** → 磁盘上没有这个类的.class 文件
    
2.  **super-class 是 `java.lang.reflect.Proxy`** → JVM 运行时动态生成的代理类
    
3.  **interfaces 实现了 `javax.servlet.Filter`** → 它以 Filter 身份注册进了 Tomcat
    

```bash
一个值得注意的细节：ClassLoader 为什么不同
WsFilter 在 tomcat-websocket.jar（Tomcat 的 lib/ 目录）→ 由 Tomcat 公共的 URLClassLoader 加载
$Proxy10 的加载器是 ROOT 应用的 ParallelWebappClassLoader → 因为哥斯拉是从您部署在 ROOT 里的 JSP 文件马注入的，代理类继承了 webapp 的加载器
这条线索实战里还有个用途：ClassLoader 的 context 指向哪个 webapp，就说明攻击者当时是通过哪个应用的入口打进来的——我这里是 context: ROOT，对应溯源时去查 ROOT 应用的访问日志。这对后续的应急响应的溯源也有一定的帮助。
```

## dump与反编译代理壳

**① dump 代理壳字节码**

```bash
dump -d /tmp/memshell jdk.proxy3.$Proxy10
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2a9968d0925e8b77.png)

**② 反编译代理壳（能确认它把调用转发给了 InvocationHandler）**

```nginx
jad jdk.proxy3.$Proxy10
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a8215c3f23e82936.png)

这里反编译$Proxy10没有看到任何的恶意逻辑代码，它唯一的作用是“合法地站在 FilterChain 里”，把所有经过 ROOT 应用的 HTTP 请求转发给 `h` 指向的对象，壳是 JVM 标准机制生成的，静态扫描器看到的是“标准代理类”，恶意代码全藏在 InvocationHandler 里

下一步开始取证！代理只是壳，真正的恶意逻辑藏在 `h` （InvocationHandler）字段指向的对象里。

实战里面如果分析到了这个代码可能没有什么风险，那么可以让AI分析一下这个代码的作用，这里下面截图的作用就是把功能转发到h（InvocationHandler），所以再去看h（InvocationHandler）这里面的代码是否为恶意代码，也就是下一步用vmtool拿到真正的类

只要能够应急出来，借用AI是很正常的操作！并且从语言规范：代理类必然全是转发壳。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0e0e4704b4d1fd8d.png)

拿到代理类后用 `instances[0].h.getClass().getName()` 反查真身，万能套路！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d83db3cddb251343.png)

```cpp
public final void doFilter(ServletRequest servletRequest, ServletResponse servletResponse, FilterChain filterChain) throws IOException, ServletException {
    try {
        this.h.invoke(this, m5, new Object[]{servletRequest, servletResponse, filterChain});
        //     ↑ 全部逻辑就这一行：把请求转发给 h（InvocationHandler）
        //       m5 = doFilter 方法对象，参数原样打包传递
        return;
    }
    catch (IOException | Error | RuntimeException | ServletException throwable) {
        throw throwable;                      // 异常处理，无业务逻辑
    }
    catch (Throwable throwable) {
        throw new UndeclaredThrowableException(throwable);
    }
}
```

**③ 用 vmtool 直接拿实例、反查真身（关键一步）**

## vmtool反查真身

这条命令是整个取证里 **证据层级最高** 的一条——它读的不是“代码写了什么”，而是“运行时对象被改成了什么样”

```bash
vmtool --action getInstances --className jdk.proxy3.$Proxy10 --express 'instances[0].h.getClass().getName()' --limit 1
```

命令解释：

```sql
vmtool                          ← Arthas 的"运行时对象查询"工具
  --action getInstances         ← 动作：从 JVM 堆里捞出目标类的存活实例
  --className org.apache.catalina.valves.AccessLogValve
                                ← 目标类：Tomcat 负责写访问日志的阀门组件
  --limit 1                     ← 最多取 1 个实例
  --express 'instances[0].getCondition()'
                                ← 对取到的实例执行的表达式：
                                  instances = 捞到的实例数组
                                  instances[0] = 第一个实例（活对象本身）
                                  .getCondition() = 调用它真实的 getter 方法
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f032f0348ccbbf25.png)

可以看到这个类名是org.apache.coyote.deser.std.AtomicReferenceDeserializer，

整体的内存马走的网络流程如下：这个类名是 **精心伪装的**，是 Tomcat 真实的核心包名（负责 HTTP 连接器）， `deser.std` 伪装成“标准反序列化器”。部分扫描可能会认为这是Tomcat自带的组件。

这下子梳理一下内存马的整体网络通信流程：

```bash
      整体流程
      ↓
浏览器/哥斯拉客户端发起 HTTP 请求
        ↓
Tomcat FilterChain（内存马 Pattern = /*，拦截所有请求）
        ↓
$Proxy10.doFilter(req, resp, chain)          ← 代理壳，我们刚 dump 的类
        ↓  this.h.invoke(this, m5, {req, resp, chain})
AtomicReferenceDeserializer.invoke(...)      ← 真身（伪装成 Tomcat coyote 包名）
        ↓  AES 解密请求 → 校验 pass/key → 执行功能
Runtime.getRuntime().exec(...) 等            ← 恶意行为（jad 真身后可见）
```

接下来就是去反编译这个真正的类

看看类的详细信息，conde-source为空

sc -d org.apache.coyote.deser.std.AtomicReferenceDeserializer

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c56f45b81e7e2e47.png)

反编译这个类：jad org.apache.coyote.deser.std.AtomicReferenceDeserializer

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b723b5e7354ad2ad.png)

至此到这里才拿到了内存马的真实代码，很明显的可以看到代码中涉及到一些敏感的关键词，比如import了一些加密类

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/75b3fc5d6f4d4a5e.png)

常见后门的关键词：password,secretKey,md5,payload等等信息

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c823af87981338c1.png)

```kotlin
this.parameterMap = (HashMap)obj;
this.password   = this.get("pass");        // ← 取"密码"
this.secretKey  = this.get("secretKey");   // ← 取"密钥"
this.md5 = AtomicReferenceDeserializer.md5(String.valueOf(this.password) + this.secretKey);
// ↑ md5(pass+key) —— 哥斯拉标准密钥派生算法
```

由此可以完全判定为内存马，这里还有一个价值点是：看 `jad` 开头那段 ClassLoader 层级

```perl
+-org.apache.coyote.util.ArrayIterator@3e28646a        ← ①伪装成Tomcat类的自定义ClassLoader
  +-org.apache.jsp.wanfenganquan_jsp$X@7dc2876c        ← ②JSP文件里声明的内部类X！
    +-org.apache.jasper.servlet.JasperLoader@6e016040  ← ③JSP编译类加载器
      +-ParallelWebappClassLoader context: ROOT
```

**磁盘上存在一个 JSP 落地文件 `wanfenganquan.jsp`** （Jasper 命名规则： `wanfenganquan.jsp` → 编译类 `wanfenganquan_jsp` ， `$X` 是 JSP 里 `<%! class X ... %>` 声明的内部类）。

这完全表明了完整攻击链：

```php
wanfenganquan.jsp（磁盘落地，JSP一句话/注入马）
   ↓ POST 传入 AES 加密的 AtomicReferenceDeserializer 字节码 + pass/secretKey
内部类 X（伪装 org.apache.coyote.util.ArrayIterator，extends ClassLoader）
   ↓ defineClass 加载真身
AtomicReferenceDeserializer
   ↓ equals() 配置密钥 → toString() 触发
Proxy.newProxyInstance(Filter) → addFilter() 注册 → $Proxy10 常驻内存
```

## 清除内存马与后门文件

如果在真实应急事件中先清除完这个内存马之后还需要去清除掉JSP后门文件，防止再次打入内存马。

现在回到开始，使用tomcat-memshell-scanner.jsp把这个kill掉的话就防止攻击者连接了，这里kill掉试一试呢

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e2614a59014c52a3.png)

可以看到已经kill掉了

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/789c3b8be3712ebb.png)

然后我在用哥斯拉尝试连接一下看看能否连接成功

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cb360d72570eb3c9.png)

可以看到已经无法连接上去，内存马已经被清除掉了！至此完成了Filter类型的内存马查杀应急响应流程。
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8cbf69abadb31532.png)
