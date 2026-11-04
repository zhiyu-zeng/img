---
title: 【微信】内存马应急响应查杀全流程分析-Listener型
source: https://mp.weixin.qq.com/s/4NPYwXXotsR8I0989GOkmg
source_host: mp.weixin.qq.com
clip_date: 2026-11-04T18:16:34+08:00
trace_id: 483b0a22-760e-4cfb-80ea-1816757ca8ff
content_hash: 58eaf2e657a9effa568095089fa948d9da46a475af5aad8b92e114f80d780614
status: synced
tags:
  - 微信
  - Java安全
  - 内存马
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 哥斯拉/冰蝎不支持Listener型内存马，文章用MemShellParty复现其注入与隐蔽机制，验证主流查杀工具只能检测无法kill，最终以Arthas vmtool过滤监听器数组完成摘除。
ai_summary_style: key-points
images_status:
  total: 22
  succeeded: 22
  failed_urls: []
notion_page_id: 40e75244-d011-817d-a78c-f40ef080cfb3
ioc:
  cves: []
  cwes: []
  hashes:
    - ca95e057749859cc9d68eddacf7cc328
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 哥斯拉/冰蝎不支持Listener型内存马，文章用MemShellParty复现其注入与隐蔽机制，验证主流查杀工具只能检测无法kill，最终以Arthas vmtool过滤监听器数组完成摘除。
> 
> - **注入机制：** 注入器EncryptionUtils遍历所有线程找到ContainerBackgroundProcessor，沿children下钻到StandardContext，用setApplicationEventListeners()将ErrorListener追加进监听器数组，本身无攻击性、执行即结束。
> - **隐蔽设计：** 马只在User-Agent等于wanfenganquan时放行，不匹配的流量正常放给业务（OPSEC伪装）；连接可走任意404路径——Listener拦截所有请求不区分路由；注入成功后删除落盘JSP不影响连接，但会使暴露面更隐蔽。
> - **检测信号：** Tomcat memshell scanner可扫出该Listener；Arthas用`sc javax.servlet.ServletRequestListener`精准检索，`sc -d`发现code-source为空（磁盘无文件）是强检测特征；jad反编译可见key/pass/md5/UA字符串及md5头尾夹AES密文的三段式响应封装。
> - **重复类成因：** 代码每次执行都new新ClassDefiner实例，defineClass仅在同加载器内查重，故JSP每被访问一次就多定义一个同名class（文中重复5次）；静默无回显会诱导应急/攻击方反复访问。
> - **查杀结论：** c0ny1查杀工具遗漏了Listener型的kill功能；改用vmtool取StandardContext实例，经OGNL过滤剔除ErrorListener、toArray转Object[]后setApplicationEventListeners写回即完成摘除，复查扫描无果且连接失败。

## Java安全 | 内存马应急响应查杀全流程分析-Listener型

**挽风安全** *2026年11月4日 17:04*

内存马应急响应查杀全流程分析-Listener型

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2299b974013afd87.png)

因为哥斯拉和冰蝎貌似都没有Listener型的内存马打入的功能，所以这里用开源项目MemShellParty去生成Listener型的内存马

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8ff199452463c198.png)

说一说这里选择ClassLoaderJSP的原因，这是这几种的用途，我这里不考虑免杀所以就不选择免杀的内存马了，直接用经典的ClassLoaderJSP就好了

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4cfe480fd0b0d15f.png)

这里涉及到生成的三个文件：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f3667ec3b65124c1.png)

注入器（EncryptionUtils）只干一件事：遍历所有线程（getAllStackTraces）→ 找 ContainerBackgroundProcessor 线程 → 沿 children 一路下钻到 StandardContext → 用 getApplicationEventListeners() / setApplicationEventListeners() 把 ErrorListener 追加进去 → 打印 \[/\*\] ready。它本身没有攻击性，干完活就结束。

内存马（ErrorListener）才是后门：pass="wanfenganquan"（哥斯拉密码参数名）、key="83bc456416c87677"（AES 密钥材料，md5 前十六位做 key，这是哥斯拉的约定）、headerName/headerValue（UA 触发门）、requestInitialized() 里的校验逻辑和 Cipher AES 解密调用。

随后注意看这里的请求头：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e8d36a36b6a4405d.png)

这不是普通配置—— **这是马的触发开关**，Listener 只处理 User-Agent 头等于User-Agent: wanfenganquan才会放行，不匹配的请求直接放行给业务（这就是它 OPSEC 上的伪装设计——没有正确头的流量“看起来”完全正常）。

不加这条，哥斯拉发的请求 UA 是它自己的默认值（Mozilla/xxx），Listener 一看头不匹配 → 直接放过 →无法连接上

哥斯拉 **文件管理** 上传 JSP 到 webapps 根目录 → curl 访问 或者 Get请求访问 一次 → 看到成功回显 → **删除 JSP**

先把这个内存马下载下来到本地：ErrorListener.jsp

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6eb27dd324f3f43b.png)

现在把这个jsp文件上传到网站根路径，跟后门webshell同一个路径之下

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/53d8aff2a17aaaac.png)

然后这个时候去curl或者访问一下这个地址，内存马就会注入

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/548a3d16a723f3b5.png)

这个时候就可以去连接了，配置一下连接的路由，任意一个404的路由都可以，比如我这里：http://192.168.139.128:8080/aaa.html

全部能连 = Listener “拦截所有请求、不看路径” 的特性实证。

在哥斯拉里面来配置

```makefile
URL:     http://192.168.139.128:8080/aaa.html    ← 任意路径，404 也行
密码:    wanfenganquan
密钥:    wanfenganquan
加密器:  JAVA_AES_BASE64
请求头:  User-Agent: wanfenganquan    ← ★ 必加，触发门
Cookie:  留空
```

如果User-Agent不是wanfenganquan的话是无法连接上去的

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1643f0b3ece519c1.png)

这个时候去配置一下User-Agent: wanfenganquan

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b973a0e95d7ab62a.png)

可以发现连接成功了，这就是配置User-Agent的作用

这个时候我们就可以去删除掉ErrorListener.jsp文件都不会影响后续内存马的连接，此时已经不需要ErrorListener.jsp这个文件了

因为内存马已打入内存，落盘文件只会增加暴露面

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7dd5b611c441f631.png)

这个时候内存马照常连接，不会收到影响

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bc4f4570fe091826.png)

## 工具扫描发现

可以看到Tomcat memshell scanner照样扫描出来了这个Listener型的内存马

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/75cfe88782b59528.png)

Arthas分析一下这个内存马，这个命令跟之前的不太一样，是ServletRequestListener字符串才能检索出来

```nginx
sc javax.servlet.ServletRequestListener
```

或者(不推荐，检索范围过于广，导致很多干扰的信息)

```nginx
sc *Listener
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/05c6d5a1c58a978e.png)

可以看到org.apache.http.web.handlers.JKJjE.ErrorListener，与内存马查杀工具扫描出来的是同一个class

随后sc -d org.apache.http.web.handlers.JKJjE.ErrorListener

看到code-source为空，可能为内存马：“磁盘无文件、来源不明”的类，这也是很强的蓝队检测信号。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7daabc90b5c091ca.png)

这里解释一下为什么出现了五次，因为我之前访问JSP访问了五次，每次访问 JSP 都会产生一个新的类，代码内有：

```java
Class clazz = new ClassDefiner(Thread.currentThread().getContextClassLoader()).defineClass(bytecode);
```

**每次执行这行，都 `new` 一个全新的 ClassDefiner 实例**。 `defineClass` 只在同一加载器内查重（重复定义才抛 LinkageError），换一个加载器实例，同样的字节码就又得到一个全新的 Class 对象。

所以： **JSP 被执行了几次，ErrorListener 就被定义几次**。我在部署时刷新/重访了它五次——空白页没有回显，看不出成败，多试几次是很自然的反应。成功的那次之后应该又访问了若干次，累计 5 次。（这也印证了“静默注入器的坑：无回显会诱导重复操作”。）

这里反编译看一下代码，因为这里有多个重名的类，所以需要指定某一个类

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e6863345a087a3ce.png)

jad -c hash 类名

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/148dbdda45894bcb.png)

```javascript
key    = "83bc456416c87677"          // AES 密钥（协议约定：md5(pass) 前 16 位）
pass   = "wanfenganquan"             // 参数名（客户端 POST 这个参数传 payload）
md5    = "CA95E057749859CC9D68EDDACF7CC328"  // 响应包夹常量（见第 4 点）
headerName/headerValue = "User-Agent" / "wanfenganquan"  // 触发门
```

看到了定义的String有key，pass，md5，UA头，payload这些关键词，大概率判定为内存马

##### 响应三段式封装：

```kotlin
printWriter.write(md5.substring(0, 16));   // CA95E057749859CC（头标记）
printWriter.write(base64Encode(this.x(..., true)));  // AES 加密 + base64 的执行结果
printWriter.write(md5.substring(16));      // 9D68EDDACF7CC328（尾标记）
```

## 工具kill失效

最后一步就是kill掉这个内存马了，突发意外，这里实际上并没有kill掉这个Linstener型的内存马

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4684f0ff2a248d52.png)

重新打开一看还是存在，内存马还是可以连接上

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fa2c06a9c0670482.png)

貌似是没实现 Listener 的 kill的原因。这里 **只加了检测和展示**，没有kill的功能。c0ny1 佬的查杀工具中 **遗漏了对 listener 型内存马的 kill 功能**。

## vmtool摘除方案

那这里就用Arthas的vmtool来删除内存马

```apache
vmtool --action getInstances --className org.apache.catalina.core.StandardContext --limit 5 \
  --express 'instances[0].setApplicationEventListeners(instances[0].getApplicationEventListeners().{? #this.getClass().getName()!="org.apache.http.web.handlers.JKJjE.ErrorListener"}.toArray(new java.lang.Object[0]))'
```

这条命令的含义是：

##### 第一层：vmtool --action getInstances —— 从堆里捞对象

```css
vmtool --action getInstances --className org.apache.catalina.core.StandardContext --limit 5
```

##### 第二层：instances\[0\] —— 选中 ROOT 应用的上下文

```bash
vmtool --action getInstances --className org.apache.catalina.core.StandardContext --limit 5 \
  --express 'instances.{
#this
.getPath()}'
```

##### 第三层：getApplicationEventListeners() —— 读注册表

```css
就是之前反复跑的那条读命令。返回 Object[]：当前所有已注册的请求事件监听器。您的环境里这个数组只有一个元素——ErrorListener（基线为空）。
```

##### 第四层：.{? #this.getClass().getName()!="..."} —— OGNL 过滤（核心语法点）

```powershell
.{ #this.getClass().getName() }      ← 投影（map）：对每个元素做变换，输出变换结果
.{? 条件 }                            ← 过滤（filter）：对每个元素做判断，留下条件为真的
```

`this` 是 OGNL 的内置变量，指 **当前正在被遍历处理的那个元素**——即数组里的每个监听器对象。

所以整段的执行过程：

```kotlin
对数组里每个监听器：  
#this.getClass()      → 拿到它的 Class
  .getName()            → 全限定名，如 "org.apache.http.web.handlers.JKJjE.ErrorListener"
  != "..."              → 和马的全限定名比较
  不等于 → 留下；等于 → 剔除
输出：一个 java.util.List，里面是"剔除了马之后剩下的监听器"
```

##### 第五层：.toArray(new java.lang.Object\[0\]) —— 类型对齐

过滤输出的是 **List**，但下一环节 `setApplicationEventListeners` 的形参是 **Object\[\]**——类型对不上。`.toArray(new Object[0])` 是 Java 里 List 转数组的标准写法（传一个长度为 0 的目标类型数组，让 JVM 按实际元素个数分配）。缺了这步会报类型不匹配。

##### 第六层：setApplicationEventListeners(...) —— 写回，完成“摘除”

把过滤后的数组写回 StandardContext。 **这一写就是马的死刑判决**——Tomcat 处理每个请求时，触发 `requestInitialized` 事件的唯一依据就是这个数组。

或者是用其他师傅二开版本的scanner来kill掉内存马也行。

## 摘除结果验证

再去看一下就没有扫描出来了

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/76cfa74155a4920b.png)

同样的内存马此时就连接不上了，证明内存马已经被删除掉了

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4c5f823b30cd6d7d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b9edfa80ea7f000c.png)

Kill！
