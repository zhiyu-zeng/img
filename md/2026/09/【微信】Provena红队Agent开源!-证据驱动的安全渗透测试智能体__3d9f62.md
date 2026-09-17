---
title: 【微信】Provena红队Agent开源! 证据驱动的安全渗透测试智能体
source: https://mp.weixin.qq.com/s/aqCYllVA0yqSg62grs-6gg
source_host: mp.weixin.qq.com
clip_date: 2026-09-17T15:25:08+08:00
trace_id: 642f8926-4c92-4f0c-9587-f3d433a86b77
content_hash: 2e789f3abac55c1086b3ab93eb412d97339369b93e954e3c3d52cb4722ca1ded
status: synced
tags:
  - 微信
  - 漏洞分析
  - AI应用
series: null
feed_source: null
ai_summary: Provena 是开源的红队 AI Agent（CLI 形态），在自建 DVWA 靶机上无人工干预、约 30 分钟跑完全流程渗透测试，靠"只追加证据图 + 允许自我修正"提升结论可信度。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3de75244-d011-8137-9534-f8f0f67d2f7f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Provena 是开源的红队 AI Agent（CLI 形态），在自建 DVWA 靶机上无人工干预、约 30 分钟跑完全流程渗透测试，靠"只追加证据图 + 允许自我修正"提升结论可信度。
> 
> - **运行数据：** 命令为 `provena run`，无浏览器/Web 界面；6 轮模型调用、耗时约 30 分钟，产出 56 条事件、32 个节点（10 step、18 fact、1 finding、1 sub_goal）、18 条事实、3 条结构化漏洞记录，覆盖 SQLi（含盲注）、XSS、命令注入、文件包含、上传、CSRF、弱会话 ID、爆破、验证码、JS 攻击、CSP。
> - **过程可回放：** 状态被外置为只追加的 FGS 图，56 条事件没有任何一条改动过先前节点，可原样回放决策路径；第 6 步 AI 自行临时拆出"CSP Bypass 测试"子目标，测完回到主线。
> - **证据与自我推翻：** 每条事实都附完整请求、响应片段、命令回显、前后对比；先证伪再确认（80 端口只是无关的默认 Apache 测试页，DVWA 实际在 8080）；并在报告中公开纠正此前"allow_url_include 未启用故 php:// 不可用"的结论——php://filter 不依赖该配置，可 base64 读源码。
> - **攻击链串联：** 链 A 为 SQLi 导出 users 表全部凭据 → 5 个 MD5 全部字典破解成明文 → 以普通用户 gordonb 实际登录成功；链 B 为命令注入 → cat 配置文件取得数据库账密 → 直连 MySQL 查询；另实测 Medium 级别绕过（数字型注入不受转义影响、管道符绕过命令注入黑名单、反射型 XSS）。
> - **限制与获取：** 控制轮数的 `max_activities` 达上限即中断，默认值下超时任务会失败（真实项目可调大）；项目地址 github.com/youki992/Provena，Releases 提供 provena-v0.1.0 的 windows-amd64 与 linux-amd64 包，仅限已授权目标使用。

**C4安全** *2026年9月17日 10:29*

GRAPHITE MINIMAL · ARTICLE

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9d84635d7c331db6.jpg)

QUOTE

Provena是从Code4Hack智能体中，抽离出来的轻量版本cli，没有交互界面。  
  
此处测试过程中，我们使用了一台自建的 DVWA 靶机（公网 IP 已隐去），整个过程中都由AI接管，无任何人工干预。

01

SECTION 01

### 一、测试数据

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fd48917707501caa.png)

| 项目  | 数值  |
| --- | --- |
| 目标  | DVWA v1.10 Development / Apache 2.4.25 (Debian) / MariaDB 10.1.26 |
| 形态  | cli命令行（provena run），无浏览器、无 Web 界面 |
| 模型活动轮数 | 6   |
| 耗时  | 约 **30 分钟** （完整流程） |
| 图事件 | **56**<br><br>条 |
| 图节点 | **32**<br><br>个 |
| 事实（Fact） | 18 条 |
| 智能体主动标记的发现 | 1 条 |
| 结构化漏洞记录 | 3 条 |

本次完整测试消耗 30 分钟、6 轮模型调用，完整将 DVWA 靶场的页面都跑了一遍：SQL 注入（含盲注）、XSS（反射 / 存储 / DOM）、命令注入、文件包含、文件上传、CSRF、弱会话 ID、爆破、不安全验证码、JavaScript 攻击、CSP。

**以下是Provena测试的几个角度解析。**

02

SECTION 02

### 二、角度一：把"过程"变成可回放的FGS图

Provena实测DVWA靶场，渗透测试前只提供了一个网址、用户名、密码，后续测试都由他自己完成，中间无中断。

这次运行产生 32 个 **FGS节点**，分五类：

origin —— 1 个，起点

goal —— 1 个，本次目标

step —— **10 个**，每一步动作

sub_goal —— 1 个，临时拆出的子目标

fact —— **18 个**，客观观察

finding —— 1 个，值得追的线索

完整的 10 个 step 连接起来，就是这次测试的真实决策路径：

CODE

端口扫描发现服务

→ 登录 DVWA 并设置安全级别

→ SQL Injection 测试

→ XSS 测试

→ File Upload / CSRF / Weak Session IDs 等测试

→ Insecure CAPTCHA 与 JavaScript Security

→ 破解 SQLi 提取的密码哈希

→ 验证破解凭据可实际登录

→ 命令注入 + 配置文件提取 + MySQL 直连的数据窃取链验证

→ Medium 安全级别绕过验证

注意第 6 步那个 sub_goal：智能体在测 CAPTCHA 模块时，临时拆出一个"CSP Bypass 测试"的子目标，测完才回到主线。 **这是AI运行时自己决定的。**

整张图是 **只追加** 的——56 条事件，没有任何一条修改过前面的节点。这意味着你可以把任意一次运行原样回放出来，能够完整看到AI的思考过程。

03

SECTION 03

### 三、角度二：每条结论都要有证据依据，而且它会推翻自己的结论

最终生成的报告里有 18 条事实， **每一条都带可复现证据**——包含完整请求、响应片段、命令回显、前后对比。

随便挑几条看一下：

**目标主机可达性**—— 目标主机可达（Ping 36ms）。但 8080 端口连接超时，80 端口开放且是 Apache/2.4.6 (CentOS)， **显示的是默认 Apache 测试页，不是 DVWA**。

**DVWA 实际运行端口**—— DVWA v1.10 实际在 8080，Apache/2.4.25 (Debian)。80 端口那个是完全无关的另一台服务。

这条很值得说一下：工具没有"假设 80 就是目标"，而是先证伪再确认。

更关键的是下面这条：

「**LFI+php://filter 读取 PHP 源码（源代码泄露）**—— ……此前结论"allow_url_include 未启用，因此 php:// 伪协议不可用" **已修正**——php://filter 不依赖 allow_url_include，通过 base64 编码读取源码成功。」

**它在报告里公开写下了自己前面的认知错误在哪里。**

一个会自我否定、并且把否定过程留档的工具，比一个永远"我很确定"的工具可信得多。

04

SECTION 04

### 四、角度三：单点发现如何被串成攻击链

整个测试流程共发现 11 个模块有漏洞。

工具真正体现能力的是 **把孤立的事实串成链**。这次跑出了两条完整的链：

**链路 A：从注入到身份接管**

CODE

SQL 注入导出 users 表全部凭据

→ 拿到 5 个 MD5 哈希

→ 离线字典破解，5 个全部还原为明文

→ 用其中的普通用户凭据实际登录成功

→ 页面确认 "You have logged in as 'gordonb'"

**链路 B：从命令注入到数据库直连**

CODE

命令注入

→ cat 配置文件拿到数据库账号密码

→ 用该凭据直连 MySQL 查询

另外还验证了 Medium 安全级别的绕过：SQL 注入绕过（数字型注入不受转义影响）、命令注入用管道符绕过黑名单、以及反射型 XSS 的绕过——同样是读源码 + 实测双重确认。

05

SECTION 05

### 五、角度四：超时任务失败

**流程中控制运行的状态参数是 \`max\_activities\`——如果它达到了活动轮数上限，还没有"跑完"的话，就会中断。**

一次测试必须可预期地结束，不能无限烧 token。真实项目里可以把这个上限调大即可，但 **默认值下它就是会被中断**。

∞

THE END

### 写在最后

Provena的工作流程：

1

**把状态外置成图**——模型的每一轮决策都写进一个只追加的结构里

2

**让结论必须挂证据**——没有请求/响应/回显的结论，进不了事实列表

3

**允许它认错**——修正留痕，而不是悄悄覆盖

**项目地址**：

https://github.com/youki992/Provena

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5c4ea7aaaed6daea.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d62d6e5f6c0a0d69.png)

**发布包**：

Releases 页面的 provena-v0.1.0-windows-amd64.zip 、provena-v0.1.0-linux-amd64.tar.gz

「⚠️ **合规声明**  
Provena 仅可用于 **你拥有或已获得明确书面授权** 的系统。本文所有测试均在一台自建的 DVWA 靶机上、在授权范围内完成。请勿将任何工具用于未授权的目标——这既违法，也违背这个工具存在的意义。」

END

我是墨格，专注于让文章更清晰地抵达读者。

如果你觉得今天这篇有收获，欢迎 **点赞、在看、转发** 三连，我们下篇见。

官网：https://moyufang.cn
