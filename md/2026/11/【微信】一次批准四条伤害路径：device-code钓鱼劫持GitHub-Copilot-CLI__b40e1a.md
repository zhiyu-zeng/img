---
title: 【微信】一次批准四条伤害路径：device code钓鱼劫持GitHub Copilot CLI
source: https://mp.weixin.qq.com/s/V-qPgXAQ11uRl5EHdGr1dw
source_host: mp.weixin.qq.com
clip_date: 2026-11-22T16:33:48+08:00
trace_id: 79736b09-87f0-486c-b031-3118d4b8e32d
content_hash: 65b559a954209ec5049415fd2a14c40839eb3239a4d6ae50616498539be463a7
status: synced
tags:
  - 微信
  - AI辅助逆向
  - 风控对抗
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 攻击者用真实的 github.com device-code 页面骗取一次授权后，就能操控受害者本机的 Copilot CLI 远程会话、向 Copilot Memory 写入误导项、读取云同步会话历史和私有仓库；微软已发布两条 Defender XDR 检测与 EMU 身份冻结处置。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 42075244-d011-8191-b155-f5497d703f15
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 攻击者用真实的 github.com device-code 页面骗取一次授权后，就能操控受害者本机的 Copilot CLI 远程会话、向 Copilot Memory 写入误导项、读取云同步会话历史和私有仓库；微软已发布两条 Defender XDR 检测与 EMU 身份冻结处置。
> 
> - **攻击链：** 攻击者发起 device flow 拿到短代码，以“IT请求/许可证检查”名义发给用户，用户部署在真 GitHub 页面上批准，攻击者客户端即自动登录；页面与域名均为合法，无法自证请求归属。
> - **四条伤害路径：** ① 远程操控已开启 remote control 的活跃会话，在会话审批与本机权限内执行命令（非未认证 RCE）；② 经 `/memory` 写入误导条目，影响后续交互；③ 读取云端同步的历史会话，含代码片段、文件路径、架构讨论；④ 按请求 scope（含 repo、read:user、read:org、gist、codespace）访问账号可达私有仓库。
> - **检测与处置：** Defender XDR 两条检测（邮件/Teams 投递的疑似 device code 钓鱼，映射 Initial Access / Credential Access）把可疑消息、点击与后续 GitHub OAuth token 创建/再生事件关联；对 GitHub EMU 可通过 IdP 挂起受影响托管身份；需 Defender for Cloud Apps 的 GitHub Enterprise Cloud 连接器提供活动遥测。
> - **防护要点：** 只为自己发起的登录输入 device code；配置 Office 365/Teams Safe Links；按“Store local sessions in the Cloud”策略选最小权限；定期吊销异常 OAuth 授权；关闭 Copilot Memory 不会删除存量条目，须人工审查。
> - **现状：** 结论来自受控实验室 PoC，未见在野利用；对应 MITRE T1566.002 与 T1528。

**赛博生存指南** *2026年11月18日 18:48*

> 原文：https://www.microsoft.com/en-us/security/blog/2026/11/17/the-risks-of-device-code-authentication-for-ai-coding-agents  
> 作者：Uri Oren、Dor Edry（Microsoft Security Research）  
> 发布时间：2026-11-17  
> 翻译模型：GLM-5.3  
> 质量评分：★★★★☆（4/5） ｜ 标签：AI×安全 · 凭据访问 · 检测基础设施

**AI 摘要**：微软安全研究在受控实验室演示了 device code 钓鱼对 AI 编码代理的迁移：受害者批准一个攻击者发起的 GitHub device-code 请求后，攻击者拿到四条影响路径——远程操控开启 remote control 的 Copilot CLI 活跃会话（在本机以会话权限执行命令）、向 Copilot Memory 写入误导条目影响后续交互、读取云同步的历史会话（含代码片段与架构讨论）、访问账号可达的私有仓库。全程页面是真的 github.com，域名无法自证请求归属。微软同步发布两条 Defender XDR 检测（邮件/Teams 投递 + GitHub OAuth token 创建关联分析）和 GitHub EMU 身份冻结处置动作。目前为 PoC 结果，未见在野。

Device code 钓鱼是老技术，新意在于「token 背后挂的东西变了」：过去偷的是邮箱，现在偷的是一个能在本机执行命令、带跨会话记忆、可远程遥控的 agent。这对每天开着 Claude Code / Copilot CLI 的读者是最切身的一篇——GTIG 前一天的报告刚披露 `.claude/settings.json` 投毒（见今日第 2 篇），本篇从认证侧补上了另一条对 AI 编码工具的入口路径，两篇正好构成「AI 编码代理攻击面」的上下两半。微软给的检测思路（把钓鱼信号与 OAuth token 创建事件关联）是检测工程可直接落地的样板。

## 从熟悉的钓鱼技术到 AI 编码代理

Device code 钓鱼已成为账号接管的常见路径。攻击者不偷密码，而是说服别人在合法网站上输入一个代码、批准一次登录。得到的访问权限视账号与授权范围而定，可以触达邮件、文件或其他云服务。早前的 EvilTokens 战役展示了这种技术规模化后的实际破坏力——2026 年 9 月微软与业界及执法伙伴协作将其瓦解。

由此引出一个不同的问题：钓来的 device code 授权还能干什么？同样的套路打 AI agent 而不是邮箱，会发生什么？

我们用 GitHub Copilot CLI 做演示。视配置而定，它能操作代码、在用户机器上执行命令、跨会话保留上下文，并允许活跃会话被远程操控。与许多命令行工具一样，它用 OAuth device flow 登录。钓鱼技术本身不限于 GitHub 或 Copilot CLI：任何支持 device flow 的 public client 都可能被同样滥用，攻击者在发起流程时自行选择请求的 scope。

我们在受控实验室模拟中探索了这一场景。一个受害者测试账号批准了由我们控制的攻击者客户端发起的 GitHub device-code 请求。基于这次批准，我们分析了四种可能的后果：

-   远程操控开启 remote control 的活跃 Copilot CLI 会话（需用户已启用远程控制且组织策略允许），并在本地权限与审批设置允许的范围内让 agent 在用户机器上执行命令。
    
-   向 agent 的 memory 写入误导条目，影响后续交互。
    
-   读取已同步到云端的 Copilot CLI 会话。
    
-   访问该账号可达的私有仓库。
    

以上是展示「现有功能按设计运行如何在钓来的授权后被滥用」的概念验证结果，不是我们在野外观察到的攻击。这些后果都要求受害者批准攻击者发起的 device code 请求，且各自取决于下文说明的账号权限与功能开关。

本文后半部分展示 Microsoft Defender 如何把钓鱼尝试与 GitHub 认证活动关联起来检测这类攻击，以及组织如何阻断可疑访问、保护受影响身份。

## 攻击怎么运作

![用户批准了攻击者客户端发起的合法 GitHub device-code 请求（示意）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/01d7ee152cfb9ca3.jpg)

1.  **发起**
    
    ：攻击者发起一个 device-code 登录请求。模拟中我们用了 Copilot CLI 客户端，但任何 device-flow 客户端都可以。
    
2.  **诱饵**
    
    ：攻击者把短代码和 GitHub 验证链接发给用户，比如借「IT 请求」或「Copilot 许可证检查」的名义。验证页面确实由 GitHub 托管——合法域名本身并不能说明是谁发起的请求。
    
3.  **批准**
    
    ：用户打开 GitHub 页面，按需登录，批准请求。这是社工步骤。
    

![批准后攻击者客户端自动完成登录（示意）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a80e22a59b66e3a4.jpg)

4.  **登录**
    
    ：批准后，攻击者控制的客户端自动完成登录。
    
5.  **操作**
    
    ：攻击者可在授予应用程序的权限和该账号可达资源范围内行动。
    

### 代码背后的请求

下面的例子展示了发往 GitHub device authorization endpoint 的初始 HTTP 请求。Copilot CLI 的 client identifier 是公开的，不是 client secret。攻击者把 GitHub 返回的短代码发给用户；用户一旦批准，发起请求的客户端无需再经任何手动步骤即可登录。

```
GitHub Device Code Authentication (Simplified)
Endpoint: GitHub Device Authorization Endpoint
Client ID:
Requested scopes:
```

#### 请求看起来是合法的

用户在真正的 GitHub 网站上登录，不是仿冒页面。所以「熟悉的域名」无法告诉用户这个请求是不是自己发起的。授权记录也会以合法应用名出现——应用名本身无法区分攻击者控制的客户端和预期中的登录。

## 一次批准，四种影响扩散方式

device code 批准只是起点。攻击者接下来能做什么，取决于账号权限、已启用的功能、memory 设置，以及活跃会话能否被远程控制。

![实验室中的四种可能后果，各自受账号权限与功能开关约束（示意）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/32280fbf3d679c89.jpg)

### 1\. 攻击者可以操控已开启的远程会话

用户为会话启用 remote control 且组织策略允许时，Copilot CLI 支持对活跃交互会话的远程操控。实验室里，攻击者控制的客户端用测试账号的授权与一个可远程控制的会话交互，agent 在测试机器上执行了一条命令——受会话审批提示和本地操作系统权限约束。这演示的是对「已授权远程会话能力」的滥用，不是未认证 RCE；remote control 关闭、会话未运行或机器离线时不适用。

![远程会话滥用受本机权限与审批控制约束（示意）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8084cf13b3a86f78.jpg) ![远程会话滥用的边界（示意）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/706cefb25828f2d7.jpg)

### 2\. Memory 把攻击带向未来

Copilot Memory 可以保留仓库事实和用户偏好。模拟中我们用 agent 的 /memory 命令写入了误导条目。若这些条目被后续交互使用，影响可以超出初始登录的时长。具体行为取决于启用的 memory 功能与策略。

![误导性 memory 影响后续 agent 交互（示意）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/19f211b90302c2e4.jpg)

### 3\. 同步会话泄露早前上下文

启用云会话存储时，我们能读取测试账号同步的 Copilot CLI 会话，包括模拟开始之前的会话。其中可能包含代码片段、文件路径、架构讨论和其他工作上下文。Copilot Business 与 Enterprise 的可用性取决于组织的会话存储策略；同步会话本身并不开启 remote control。

### 4\. 仓库访问随账号走

实验室里，这次授权让我们访问了测试账号可达的私有仓库。请求包含 repo scope，外加 read:user、read:org、gist 和 codespace。这些 scope 由发起流程的客户端选择；产生的仓库访问反映所请求的 scope 和账号权限，不是 Copilot CLI 自身的属性。潜在暴露以账号的仓库访问范围为界——可能包括应用代码和基础设施定义。

一条钓鱼消息、一次点击、一次 GitHub 授权，各自看起来都毫不起眼。防守方的难点在于识别它们同属一次接管尝试。合法验证页是故事的一部分，而不是请求安全的证据。

## 把钓鱼尝试变成 Defender 信号

Microsoft Defender 帮助组织检测和响应针对 GitHub 账号的 device code 钓鱼。启用 Microsoft Defender for Cloud Apps 的 GitHub Enterprise Cloud 连接器后，组织可获得 GitHub 活动可见性，支撑对可疑授权模式的调查。

作为本次研究的一部分，我们为疑似 GitHub Copilot CLI device code 钓鱼开发了两条检测，覆盖经邮件和 Microsoft Teams 投递的攻击。

这些检测把可疑消息与点击同后续 GitHub OAuth token 创建与再生事件关联，帮助识别可能未授权的 Copilot CLI 授权——它们原本看起来完全合法。Microsoft Defender XDR 客户可参考下列检测：

| Microsoft Defender 覆盖 | 观察到的活动 | 战术  |
| --- | --- | --- |
| Suspected GitHub Copilot CLI device code phishing via email | 经邮件投递的疑似 device code 钓鱼，可能导致未授权 GitHub Copilot CLI 访问 | Initial Access / Credential Access |
| Suspected GitHub Copilot CLI device code phishing via Microsoft Teams | 经 Teams 投递的疑似 device code 钓鱼，可能导致未授权 GitHub Copilot CLI 访问 | Initial Access / Credential Access |

检测之外，我们还为 GitHub Enterprise Managed Users（EMU）开发了处置动作：通过组织的身份提供方挂起受影响的托管身份，切断攻击者访问。该能力已在研究环境验证。

响应者还应审查并吊销异常的 OAuth 授权、确认访问已被阻断、调查可能受影响的会话、仓库和已保存的 memory。

检测与处置的可用性取决于支持的配置、所需遥测、身份集成与部署前提。

![疑似 Copilot CLI device code 钓鱼（邮件）触发的 Defender 告警](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f2f612b4d7cbc665.jpg) ![识别并冻结受影响托管身份的研究模型（示意）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0f9e81184fb7c6ad.jpg)

## 缓解与防护指引

-   给所有使用开发者和 AI 工具的人立一条明确规矩： **只为自己发起的登录输入 device code**。突如其来的「验证 GitHub」或「激活 Copilot」请求应按钓鱼处理——哪怕页面就在 github.com 上。GitHub 自己的验证页也警告用户永远不要使用别人发来的代码。
    
-   在 Microsoft Defender for Office 365 配置 Safe Links 策略并确认 Teams 的 Safe Links 保护。这些防护能拦截恶意链接并提供调查上下文；但合法的 GitHub 验证 URL 仍然需要用户自己识别「不请自来的代码请求」。
    
-   **审查 GitHub Copilot CLI 会话设置。**
    
    组织分配的席位受 GitHub「Store local sessions in the Cloud」策略约束，该策略决定会话能否被存储和远程控制。选支持工作流的最小权限设置。远程控制还需要活跃、在线的交互会话。
    
-   在 GitHub 账号设置里审查已授权的 OAuth 应用，吊销异常或不再需要的授权。用组织角色收敛仓库访问，让单个失陷账号够不到超出其工作所需的代码。
    
-   若启用 Copilot Memory，用 GitHub 的 memory 管理控件审查并移除可疑的仓库事实或用户偏好。 **关闭 memory 不会自动删除已存条目**，事件响应时要手动审查存量内容。
    
-   把 GitHub Enterprise Cloud 接入 Defender for Cloud Apps，在依赖它做调查前先验证环境里可用的活动数据。
    

### 记住：合法登录也可能是错的那次

这次模拟最扎心的地方是：几乎没有哪一步看起来可疑。用户访问的是真 GitHub，批准的是一个长相正常的请求——但批准给了一个自己从未启动的客户端。之后的后果有多大，取决于那个身份能触达什么、Copilot CLI 的哪些能力开着。

所以这不只是一个关于代码的故事。随着 AI agent 拿到仓库、会话历史和本地工具的访问权，一次钓来的授权的影响，越来越取决于这些 agent 能摸到什么。

合法验证页不代表请求安全。用户只应批准自己发起的 device code 请求。组织应定期审查并吊销异常 GitHub OAuth 授权，把 Copilot 会话与 memory 设置收敛到工作所需，并在 Defender for Cloud Apps 里验证 GitHub 活动可见性。

归根结底，防 device code 钓鱼既需要用户意识，也需要把可疑授权活动与前置钓鱼尝试关联起来的能力。

### 观察到的 MITRE ATT&CK 技术

以下映射描述 PoC 模拟中演示的行为，不指向任何已归因战役。

-   T1566.002 – Phishing: Spearphishing Link（Initial Access）：测试的邮件投递中，链接把用户带到 device authorization 页面并诱导批准。
    
-   T1528 – Steal Application Access Token（Credential Access）：测试账号批准请求后，攻击者控制的客户端获得 OAuth token。
    

## 参考

-   The risks of device code authentication for AI coding agents（原文）：https://www.microsoft.com/en-us/security/blog/2026/11/17/the-risks-of-device-code-authentication-for-ai-coding-agents
    
-   Authorizing OAuth apps（GitHub Docs）：https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
    
-   Remote control of GitHub Copilot CLI sessions（GitHub Docs）：https://docs.github.com/en/copilot/how-tos/copilot-cli/remote-control
    
-   Managing Copilot Memory for an enterprise（GitHub Docs）：https://docs.github.com/en/copilot/how-tos/setup/copilot-memory/managing-copilot-memory
    
-   Protect your GitHub Enterprise environment（Microsoft Learn）：https://learn.microsoft.com/en-us/defender-cloud-apps/protect-github
    

前沿资讯 · 目录
