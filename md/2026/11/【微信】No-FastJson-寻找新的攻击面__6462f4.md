---
title: "【微信】No FastJson: 寻找新的攻击面"
source: https://mp.weixin.qq.com/s/m8Hc0q8qDCBMsMdRVREh3g
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T13:23:19+08:00
trace_id: 5da25e79-88e2-46d2-8ae6-7776c56c8a4f
content_hash: 4a83e055c6e94420b2150c2c1b5fcbffc0bdff395f310be179211536286eff85
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 31
  succeeded: 31
  failed_urls: []
notion_page_id: 41175244-d011-810b-b2f7-f32a93a4e004
ioc: null
---

**红细胞安全实验室** *2026年11月6日 22:09*

## 前景回顾

在《FastJson 1.2.83 远程代码执行分析》一文中，我们简要分析了 `fastjson 1.2.83` 下无 `gadget` 的代码执行原理，其本质是由于双亲委派机制导致的。我们在前文分析的过程中，已经明白了为什么默认的 `springboot fatjar` 场景下无法打成单 `http` 实现代码执行的原因，是因为在走进 `com.alibaba.fastjson.util.TypeUtils#loadClass(java.lang.String, java.lang.ClassLoader, boolean)` 的时候，由于传入的 `defaultClassLoader` 为 `null` ，转而选用了 `Thread.currentThread().getContextClassLoader()` 来获取当前上下文类加载器，也就是内置的 `TomcatEmbeddedWebappClassLoader` ，其 `loadClass` 方法调用了 `Class.forName` ，然后在 `forName0` 校验的过程中对类名做了限制，导致无法实现单 `http` 的情况下 `RCE` 。只有当设置了 `ParserConfig` 的 `defaultClassLoader` 或者在其他中间件环境下其不为空的情况下，才能正常走进 `URLClassLoader#loadClass` ，这样才不会存在前置的 `forName0` 校验类名。

## No FastJson

眼尖的读者可能发现了其中的问题，在 `TomcatEmbeddedWebappClassLoader` 当中最终是通过 `org.springframework.boot.web.embedded.tomcat.TomcatEmbeddedWebappClassLoader#loadFromParent` 来加载我们的 `payload`

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f8ff3bcbfa370a20.png)

当中关键的是这个传入的 `payload` 并没有经过任何变化，最终保持了原始输入走到了这里，通过 `Class.forName` 触发了后续的类加载，而由于这里设置了第二个参数为 `false` ，导致在这里并不会执行类加载的初始化行为。

是不是可以有一个大胆的猜想，无需 `fastjson` ，仅通过 `Class.forName` 就能够触发呢？我们编写如下测试控制器来验证

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fa9ecace93d97df7.png)

这在很多产品业务代码里是一个很常见的场景，甚至在不少组件状态传递的过程中也有这种场景。

前面我们说了，由于 `Class.forName` 的第二个参数为 `false` ，不会执行初始化行为，也就是在这里不会执行类当中的静态代码块，只有等到被主动触发的时候才会执行。所以这里我们的 `payload` 需要改动一下，不再使用 `@JsonType` 注解：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/72246471b448f969.png)

通过 `javaassit` 修改成特定类名后如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6257a9aa42537f46.png)

接着构造请求来验证猜想：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/113f6105c797216b.png)

这里其实也不能使用 `http` 的方式来加载，因为走的还是 `forName0` ，会校验类名的合法性。

我们下断点来回顾一下这个过程

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ee32b859f74dc4b5.png)

这里通过 `ClassLoader.getClassLoader(caller)` 拿到了调用当前方法的类的类加载器（传入的 `caller` 就是调用 `Class.forName` 的类）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3c9a1414a1dd96f6.png)

接着往下走

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c51c515e55b757da.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9180e1101778e45b.png)

到这里的后续逻辑和前文基本一致了

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aee617146bb5dd2f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c548b7ac9d087cf4.png)

在 `findClass` 的过程中， `jdk` 本身也会通过 `getResource` 来查找资源，而前文我们说过， `getResource` 本质是通过 `new URL` 来实现的，自然支持 `jar:`来加载资源。

所以到这里这个由于类加载导致的问题已经可以完全脱离 `fastjson` 本身，将漏洞利用的条件下降至只需要 `fatjar + jdk` ，且仅需要 `Class.forName` 可控即可，而实战场景中能够控制 `Class.forName` 的场景足够多，以历年最经典的 `jdbc attack` 来举例：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6c5bf1b9b4b3d150.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fcf2dfee5e18db8a.png)

引入的均为最新版依赖， `mysql-connector-java 8.0.33` 已经修复 `getConnection` 阶段触发的反序列化，而 `postgresql 42.7.13` 也早已修复 `socketFactory` ，将其限制在了期望类内。

而在目前仅需 `Class.forName` 可控就能 `RCE` 的加持下，这些限制都不再是问题，我们先以 `mysql-connector-java 8.0.33` 为例，其触发类加载的在 `8.x` 从 `statementInterceptors` 变为了 `queryInterceptors`

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/91c16bef0c199efc.png)

指定该参数后，传入的类名会通过 `com.mysql.cj.jdbc.ConnectionImpl#initializeSafeQueryInterceptors` 当中的 `Util.loadClasses` 进行加载，但是这里限制了类型必须是 `QueryInterceptor.class`

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f5fd8216a7c0353f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/df810a1703495dda.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3e67f898c239584c.png)

也就是如果类型不匹配，其不会继续构造实例。解决办法也很简单，给我们的恶意类加上实现 `QueryInterceptor` 接口即可，这里可以选择在其初始化的时候植入恶意代码或是无参构造等都可以

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a7c70ab0df26b86c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1e52bb5565bdc35e.png)

接着同样修改为特殊类名

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/17615661fdf5d864.png)

然后构造请求验证：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/60b6aed1c5d7c8e1.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8b199c43dd3c7e52.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1b1e702b670574c5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9ad79fcf654170cf.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/714b7041ac3e9285.png)

接下来换 `PostgreSQL` ，同样的也在之前的修复里判断了期望类

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cff5d8be3e80a139.png)

我们只需要给我们的恶意类继承至 `SocketFactory` 即可

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/025c9b2187ffaccf.png)

修改为特殊类名后：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/09d5eb5dfa65eb20.png)

接着构造请求继续验证：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db73a3891281ef7d.png)

## 最后

`jdbc` 场景只是抛砖引玉，相信未来会有更多姿势来利用这个点。目前实测很多产品在此基础上可以老洞开新花，剩下的玩法留给读者自行探索了。

本文当中所提及知识来自实战代码审计班课程内容，关于该产品更加深入利用手法可以咨询课程。

顺便再推荐一下我师傅的代码审计课程。近期某报表的课程章节已结束，马上开启新的章节，感兴趣的朋友可以尽快加入。课程中包含各类产品最新补丁对应的 0day 漏洞（非水洞） 的挖掘与分析；过往课程也涵盖多款市面产品的 0day / 1day / nday 漏洞案例讲解。课程后续会持续更新推进，支持一次报名长期学习与答疑。适合真正对代码审计感兴趣、或想系统学习但缺少思路与方法体系的同学（如有其他目的请勿打扰）。对基础要求不高，能读懂代码即可，真正帮助你从只能读懂代码到找到问题。个人学习过程中受益良多，特此分享推荐给希望提升自己的朋友（非广告）。若有打扰，敬请见谅。

下方是进阶班课表

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/26bc98589ca00142.webp)

下方是基础班课表
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f13dbd3c76cbf27a.webp)
