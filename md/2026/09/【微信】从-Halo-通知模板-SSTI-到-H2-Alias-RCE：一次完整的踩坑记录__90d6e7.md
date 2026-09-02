---
title: 【微信】从 Halo 通知模板 SSTI 到 H2 Alias RCE：一次完整的踩坑记录
source: https://mp.weixin.qq.com/s/NFfmCp0_uMpccxUc-9DSLw
source_host: mp.weixin.qq.com
clip_date: 2026-09-02T11:50:36+08:00
trace_id: 9b759ad2-fb84-4ebb-86ff-5d881c9680c3
content_hash: c9c64d5ac719302700ee82540271f4fd2b1fd936e4a5a0a9532cf7b1e5ad60c6
status: synced
tags:
  - 微信
  - 漏洞分析
  - 代码审计
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 通过修改 Halo 通知模板注入 SpringEL，再组合 H2 数据库 CREATE ALIAS/RUNSCRIPT 与附件上传接口，可在 Halo 2.26.0 上实现 RCE（成功弹出 calc.exe）。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3cf75244-d011-81ff-9d0f-eb851278b40d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过修改 Halo 通知模板注入 SpringEL，再组合 H2 数据库 CREATE ALIAS/RUNSCRIPT 与附件上传接口，可在 Halo 2.26.0 上实现 RCE（成功弹出 calc.exe）。
> 
> - **漏洞入口：** 管理员可向 `/apis/notification.halo.run/v1alpha1/notificationtemplates/template-new-device-login` 发 PUT 请求，把任意字符串写入模板 title/rawBody/htmlBody；渲染时 title 中的 `[[${...}]]` 会被 Thymeleaf 当作 SpringEL 执行。
> - **黑名单绕过：** Thymeleaf 3.1.3 ACL 封禁了 java.lang.Runtime、ProcessBuilder、javax.script、Spring spel 等常规 RCE 路径；转而使用 `org.springframework.jdbc.datasource.SimpleDriverDataSource` 构造 H2 JDBC URL，利用 H2 的 CREATE ALIAS 机制在 JVM 内动态编译 Java 代码执行命令。
> - **H2 截断问题：** 直接在 URL 的 INIT 参数里写 `CREATE ALIAS ...; CALL ...` 会被按分号截断，只保留首条语句；因此改用 `RUNSCRIPT FROM '文件路径'` 加载完整多语句 SQL 脚本。
> - **文件上传载体：** Halo 默认附件接口 `/apis/api.console.halo.run/v1alpha1/attachments/upload` 不校验后缀，可上传 poc.sql 到 `~/.halo2/attachments/upload/poc.sql`，H2 再用本地文件 URL 读取。
> - **触发与修复：** 完整利用需先取 CSRF token/RSA 公钥并登录，上传 SQL、修改模板，再用不同 UA 和 X-Forwarded-For 绕过 IP 限流并触发 new-device-login；修复思路包括附件后缀白名单、禁止 .sql/.sh/.bat/.class 等文件、隔离附件存储目录与 JDBC 工作目录。

# 从 Halo 通知模板 SSTI 到 H2 Alias RCE：一次完整的踩坑记录

一寸灰 一寸灰 进击安全

_2026年9月2日 11:24_

在小说阅读器读本章

去阅读

在公众号小说中沉浸阅读

> 本文来自一次真实代码审计与漏洞复现。目标环境为本地 localhost:8090，Halo 版本 2.26.0，项目源码 2.26.0-SNAPSHOT。最终成功弹出 calc.exe。

## 一、前言：为什么会盯上通知模板

Halo 是一款基于Spring Boot WebFlux + R2DBC + Thymeleaf的开源 CMS。在审计过程中，我们发现后台允许管理员自定义通知模板（NotificationTemplate），而这些模板最终会被 Thymeleaf 渲染成通知标题、正文等内容。

直觉上，如果模板内容没有经过任何过滤，就存在SSTI（Server-Side Template Injection）的风险。于是沿着这条线往下挖，最终形成了一条完整的 RCE 链：

```
管理员登录
```

下面会把整个过程中的关键点、踩坑点和修复思路逐一展开。

* * *

## 二、漏洞定位：Source 与 Sink

### 2.1 Source：管理员能把任意字符串写进模板

Halo 的扩展资源通过统一的 CRD API 暴露。通知模板作为一种 Extension，更新入口在：

```
@Override
```

攻击者向下面这个地址发送 PUT 请求：

```
/apis/notification.halo.run/v1alpha1/notificationtemplates/template-new-device-login
```

就能把 spec.template.title、rawBody、htmlBody 替换成任意字符串，而且这些内容会被原封不动地存进数据库。

### 2.2 Sink：模板内容被 Thymeleaf 直接渲染

真正执行模板的地方是：

```
@Component
```

注意两个重点：

也就是说，title 字段里写 \[\[${...}\]\]，Thymeleaf 就会把它当 SpringEL 表达式执行。

### 2.3 触发路径：新设备登录通知

new-device-login 通知的触发点在：

```
@EventListener
```

最终 DefaultNotificationCenter.inferenceTemplate() 会把 title、rawBody、htmlBody 三处都送进 DefaultNotificationTemplateRender.render()：

```
var titleMono = notificationTemplateRender
```

所以只要改 title，就能在通知触发时执行任意 SpEL。

* * *

## 三、第一道坎：Thymeleaf 的 ACL 黑名单

如果只是简单的 SSTI，第一反应肯定是：

```
[[${T(java.lang.Runtime).getRuntime().exec(”calc”)}]]
```

但在 Thymeleaf 3.1.3 里，这招走不通。

Thymeleaf 在 org.thymeleaf.util.ExpressionUtils 里维护了一套 ACL，反编译后可以看到它把常见的高危包都拉黑了：

```
// 全局黑名单
```

判断逻辑大致是：先查白名单，再查黑名单。于是 java.lang.Runtime、java.lang.ProcessBuilder、javax.script._、org.springframework.expression.spel._ 等常规 RCE 路径全部被堵死。

* * *

## 四、第二道坎：H2 URL 里写多语句会被截断

既然直接调 Runtime.exec 不行，就要找一个不在黑名单里、又能触发代码执行的类。

这里用到两个关键点：

于是可以构造：

```
new org.springframework.jdbc.datasource.SimpleDriverDataSource(
```

H2 的 INIT 参数会在建立连接时执行一条 SQL。我们本来希望直接写：

```
jdbc:h2:mem:rcepoc;INIT=CREATE ALIAS calc AS '...'; CALL calc()
```

但实测发现 H2 URL 解析器会按 ; 切分 key/value，INIT 的值会被截断成只有 CREATE ALIAS calc AS '...'，后面的 CALL calc() 直接丢掉。

解决办法：用 RUNSCRIPT FROM '<文件路径>'，让 H2 去读一个完整的 SQL 脚本，脚本内部可以写多条语句。

poc.sql 内容：

```
DROP ALIAS IF EXISTS calc;
```

* * *

## 五、第三道坎：文件怎么送上去

早期版本为了把 poc.sql 传给 H2，需要在本机起一个 HTTP 服务，让 H2 通过 RUNSCRIPT FROM 'http://127.0.0.1:18080/poc.sql' 下载。但这样依赖额外服务，不够优雅。

后来发现 Halo 默认的附件上传接口不做后缀白名单，可以直接把 poc.sql 上传到：

```
~/.halo2/attachments/upload/poc.sql
```

上传端点：

```
POST /apis/api.console.halo.run/v1alpha1/attachments/upload
```

表单字段：

-   file：要上传的文件

-   policyName：default-policy


Node.js 上传代码：

```
const PAYLOAD_SQL = fs.readFileSync('poc.sql', 'utf8');
```

H2 在 Windows 下也能正确解析 ~ 为用户主目录，所以本地文件 URL 写成：

```
file:~/.halo2/attachments/upload/poc.sql
```

即可。

* * *

## 六、PoC 构造：一步步拼起来

### 6.1 构造 Thymeleaf payload

```
const LOCAL_SQL_URL = 'file:~/.halo2/attachments/upload/poc.sql';
```

最终写入 NotificationTemplate.title 的字符串：

```
[[${new org.springframework.jdbc.datasource.SimpleDriverDataSource(
```

可以直接用于 curl 的请求体（payload.json）：

```
{
```

### 6.2 完整执行流程

rce_poc.js 的完整流程如下：

```
// 1. 获取 CSRF token 和 RSA 公钥
```

### 6.3 为什么第二次登录要换 UA 和 X-Forwarded-For

-   Halo 登录接口有基于 IP 的限流，同一 IP 频繁登录会被拦截；

-   IpAddressUtils 会优先读取 X-Forwarded-For 作为客户端 IP，所以每次换这个头就能拿到新的限流桶；

-   new-device-login 的设备识别依赖 User-Agent 和 IP，第二次用不同 UA/IP 会被识别为新设备，从而触发通知渲染。


* * *

## 七、验证结果

执行：

```
node rce_poc.js
```

输出：

```
[*] GET /login
```

计算器出来了，RCE 验证成功。

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

* * *

## 八、修复思路

-   默认策略不应允许 ALL 类型，要加后缀白名单；

-   禁止上传 .sql、.sh、.bat、.class 等可解释/可执行文件；

-   附件存储目录与 H2/JDBC 工作目录隔离。


* * *

## 九、写在最后

这条链的有趣之处在于：

-   它不是简单的 SSTI 直接 RCE；

-   Thymeleaf 黑名单把常见绕过都堵了，但漏掉了 Spring JDBC + H2 这个利用链；

-   H2 的 CREATE ALIAS 机制相当于在 JVM 内部提供了一个“动态编译器”，让我们绕过了 Thymeleaf 对 java.lang.Runtime 的直接限制；

-   最后通过一个不起眼的附件上传功能，把外部 payload 送到了 H2 能读取的位置。


希望对大家做代码审计和漏洞挖掘有所启发。最后就是AI审洞真jb牛逼。

**代码审计培训介绍&广告区域**

二、第五期课程

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

    第五期课程仍然是以代码审计为主，本次课程还是为三个语言的代码审计0-1讲解，目的为帮助学员完成0-1+1的白盒（代码审计）漏洞挖掘，并且在出货的基础上再+1去出高质量的漏洞（例如组合拳RCE、前台相关漏洞等）。

1

课程周期

开课周期预计到：三个月左右（直播+录播）

**课程大纲**

    本次课程分为PHP、JAVA、NET代码审计为直播+录播，为了照顾一些基础较为薄弱的师傅新增基础~技巧~番外（录播课程）。

01

PHP&JAVA&NET代码审计 (直播+录播)

    之前课程大纲主要为xxx实战案例，本次课程大纲着重体现思路方向，并非取消了实战部分，实战部分之多不减。

PHP课程目录

✅  第一节课：多框架初识&路由认识&参数传递

✅  第二节课：多框架&鉴权分析&认证与鉴权&鉴权方式

✅  第三节课：多框架&常见漏洞函数&回显&非回显

✅  第四节课：注入漏洞&常见位置&实战审计注入类漏洞

✅  第五节课：前台RCE漏洞审计&漏洞案例技巧讲解

✅  第六节课：门户网站CMS&网络设备&审计经验讲解

✅  第七节课：多框架&鉴权对抗&权限绕过技巧&案例分析

✅  第八节课：组合拳RCE漏洞分析&漏洞组合拳利用&案例

✅  第九节课：PHP下反序列化漏洞&魔术方法&pop链分析

✅  第十节课：PHP下反序列化漏洞实战&phar协议RCE案例

JAVA课程目录

✅  第一节课：Servlet&Spring Boot&Spring MVC&Struts2

✅  第二节课：多框架下&拦截器&认证鉴权&组件鉴权分析

✅  第三节课：多框架下&权限绕过&鉴权对抗&案例分析

✅  第四节课：常见漏洞函数&案例分析&审计技巧

✅  第五节课：前台漏洞审计&组合拳rce漏洞&技巧&案例

✅  第六节课：反序列化&CC链利用&反序列化漏洞利用

✅  第七节课：Ognl&SpEl&EL表达式注入&漏洞案例

✅  第八节课：内存马简介&内存马原理分析&内存马注入方式

✅  第九节课：RMI&JNDI注入&JNDI注入漏洞利用&案例

✅  第十节课：组件漏洞&shiro&fastjson&log4j分析&利用

.NET课程目录

✅  第一节课：初识.NET&Web From & MVC架构框架分析

✅  第二节课：Web From&MVC框架&鉴权分析&认证方式

✅  第三节课：多框架下&鉴权对抗&权限绕过分析&案例

✅  第四节课：注入漏洞分析&文件操作类漏洞&实战分析

✅  第五节课：常见漏洞位置&前台漏洞审计&漏洞案例讲解

✅  第六节课：组合拳RCE漏洞分析&组合拳RCE案例讲解

✅  第七节课：.NET反序列化漏洞初识&反序列化漏洞原理

✅  第八节课：.NET安全反序列化链&反序列化触发场景

✅  第九节课：.NET反序列化漏洞案例&反序列化漏洞分析

02

基础~技巧~番外（录播)

该篇章为长期更新

1

基础篇章

1、由于之前上课时部分师傅存在一定基础，刚开始的课程部分师傅认为自己可以跟的上等问题，导致时间的浪费。

2、同时有一定的师傅存在无法搭建源码，以及软件下载等问题，于是将这种基础问题，统一归纳为基础篇章，供师傅们学习，节省师傅们时间提升学习效率及课程质量

3、同时面对部分学员频繁提出的一些问题，针对该问题同样会进行解答，并且进行录制上传至基础篇章中。

2

技巧篇章

1、随着自己技术的进步也了解到了一些新型的技巧或者手法，例如sql注入的某一个技巧，但是重新讲解又浪费大量时间，特地新增了技巧篇章，将单独的技巧进行讲解。

3

番外篇章

1、自己在第四期讲过一些逆向相关，并且还存在相关的一些好的案例，得到了挺多师傅的认可，例如某APP接管存储桶等案例，于是之后在有好的案例将进行上传更新。

**课程思维导图**

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

**常见疑问&课程讲解**

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

第五期课程收费多少？

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

本次课程收费仍然是1688，并且还是承诺一次报名后续不再进行任何二次收费保障（包含内部平台，以及后续推出一系列内容均可观看）。

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

什么时间段上课，上课周期是多长时间？

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

第五期课程【直播+录播】上课周期为三个月，一般集中在周五六日这三天，一周保持2～3节课，每节课1小时左右。

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

作为学员，我们都有哪些权益？

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

首先最关键的就是课程内容是可以一直学习的，同时内部报告平台也可进行观看，答疑是不限时长，不限类型方向，任何方向均可，再次同时代码审计最关键的就是源码，源码&课件&视频都是给兄弟们配套的，当然无聊找小朋友聊天一起打游戏也可以哦。

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

学完之后可以达到什么水平？

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

学完之后可以达到可以进行独立审计的水平，在面对php、JAVA、NET主流语言的源码，可以进行独立审计，验证漏洞，对于一些JAVA安全内容例如：反序列化，内存马等也有一定的理解，可以进行打反序列化漏洞、注入内存马等操作，同时PHP的反序列化、pop链，phar协议等利用也有一定理解，且此类漏洞导致RCE均有案例。

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

0基础可以学吗？

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

1、这是大家最常问的一个问题，0基础是可以的，我的代码审计课程一直秉持着帮助大家完成代码审计0-1的目标，同时往期（第四期）课程新增了进阶课，其目的也是帮助大家完成0-1出洞到0-1出有质量的漏洞。

2、另外考虑到有的学员基础较为薄弱，本期同时也开了番外篇&基础篇，师傅们可以观看这块分区课程内容，此类分块课程目的就是为协助到一些基础比较薄弱的师傅们。

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

是那种读PPT拿着靶场讲解吗？

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

不会，课程均使用一些0Day&1Day&Nday优质漏洞来进行授课，且本期案例均为从简-难漏洞案例，深度体验代码审计当中的难易区分，完全杜绝靶场以及去读PPT的，从培训第一期开始到现在，基本为上课开始看几眼课件，让学员熟悉这节课的大概内容等信息，然后直接实操到下课，这一点也是我干培训五期以来一直使用的授课方式。

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

是否有简历修改&内推等福利？

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

有的兄弟，有的，不介意小朋友的指导简历这类的话，随时欢迎大家来骚扰我。

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

为什么你不新增AI方向的内容？

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

目前我个人认为AI可以帮助我们提升很大的效率，但是前提是AI的使用者本身要懂这个技术，才可以利用AI来降低该技术门槛，提升效率，完全自动化目前感觉还是无法做到，包括课程当中也会使用AI会顺带着给师傅讲了如何用ai来提升效率，同时如果反馈不会使用的师傅较多，会考虑后续在基础～技巧～番外来更新该方向内容。

**联系方式**

![图片](<data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate\(-249.000000, -126.000000\)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E>)

预览时标签不可点

留言

暂无留言

1条留言

发消息

  写留言:

微信扫一扫
关注该公众号

知道了

 微信扫一扫
使用小程序

取消 允许

取消 允许

取消 允许

![⚠️ 图片托管失败 · 作者头像](http://mmbiz.qpic.cn/mmbiz_png/ZRKuxIKRyhVONQYJ0JqHiaReMdL4U96Os4cyUtkHlTE3MlhsRYqjMyXJ3ia1N3EwFOX1HFsmvoVGibXFKFKqLZicaw/0?wx_fmt=png)

微信扫一扫可打开此内容，
使用完整服务

![⚠️ 图片托管失败](https://mmbiz.qpic.cn/mmbiz_png/ZRKuxIKRyhVONQYJ0JqHiaReMdL4U96Os4cyUtkHlTE3MlhsRYqjMyXJ3ia1N3EwFOX1HFsmvoVGibXFKFKqLZicaw/300?wx_fmt=png&wxfrom=18)

进击安全

,

选择留言身份
