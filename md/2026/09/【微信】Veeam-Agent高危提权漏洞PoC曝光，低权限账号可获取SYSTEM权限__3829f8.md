---
title: 【微信】Veeam Agent高危提权漏洞PoC曝光，低权限账号可获取SYSTEM权限
source: https://mp.weixin.qq.com/s?__biz=MjM5NjA0NjgyMA==&mid=2651347618&idx=4&sn=26d5d5c0cfcc53bb34fffb4c92ba29d8&chksm=bc1b8291e2d78df81907e3a2e643f8fd20b3643cf6523b75a17fe29e31bf7f30e7e087a474fb
source_host: mp.weixin.qq.com
clip_date: 2026-09-24T23:21:58+08:00
trace_id: 7de0ad30-c67d-475b-8739-6c88595a71f8
content_hash: f26277b5e68aef819b730eb11d600b3f52f3df17abbcd1c4fef2f73e67b6f10c
status: synced
tags:
  - 微信
  - 漏洞分析
  - 提权漏洞
series: null
feed_source: 公众号·FreeBuf（weread）
ai_summary: Veeam Agent Windows版曝本地提权漏洞CVE-2026-32996，PoC已公开，低权限用户可提权至SYSTEM，需尽快升级修复。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-81d4-86d8-dd5899121d9b
ioc:
  cves:
    - CVE-2026-32996
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Veeam Agent Windows版曝本地提权漏洞CVE-2026-32996，PoC已公开，低权限用户可提权至SYSTEM，需尽快升级修复。
> 
> - **漏洞概要：** CVE-2026-32996 影响 Windows 版 Veeam Agent 13.0.1.2067 及更早 13.x；本地低权限用户可提权至 NT AUTHORITY\SYSTEM，PoC 于 2026-09-14 公开。
> - **根因：** Endpoint Backup 服务通过本地 gRPC 命名管道处理高权限会话，将管理员身份与用户可控会话 UID 缓存绑定，但不校验 UID 是否属于请求者。
> - **利用路径：** 高权限会话 UID 写入 C:\ProgramData\Veeam\Endpoint\Svc.VeeamEndpointBackup.log，标准用户可读；读取后即可借其以 SYSTEM 执行命令，GitHub PoC 用 whoami 验证。
> - **修复：** 将 Veeam Backup & Replication 升级至 13.0.2.29+，会同步更新 Agent 至 13.0.3.1220；优先修复共享工作站、服务器、管理员工作站及多本地用户设备。
> - **缓解与检测：** 官方暂无正式规避方案，临时可限制本地/交互式访问和特权分配；AWN Agent/Aurora Focus 可检测多阶段利用，但不能替代补丁。

Veeam Agent存在一处严重提权漏洞，本地用户可借此获取SYSTEM最高权限。目前该漏洞的PoC已对外公开，多用户共享的Windows系统面临极高的被利用风险。

Part01

CVE-2026-32996 PoC公开

如果Windows端点上部署了Veeam Agent，且设备存在多个本地用户，管理员应当立刻核查版本，切勿拖延。

2026年9月14日，外界公开了CVE-2026-32996的完整技术细节与PoC利用代码，攻击者在野利用该漏洞的概率随之大幅上升。毕竟可运行的利用代码已经上传到GitHub，任何人花一个下午就能复制、改造出可用的攻击工具。

Arctic Wolf已在安全公告中对该风险作出预警，该机构警告称：“2026年9月14日，CVE-2026-32996的公开技术细节与PoC利用代码发布，受影响的Microsoft Windows版Veeam Agent部署遭遇利用尝试的可能性随之上升。”

## 影响范围与提权危害

该漏洞影响Microsoft Windows平台的Veeam Agent，波及13.0.1.2067及所有更早的13系列版本。这是一个本地提权漏洞，攻击者首先需要获得设备的本地访问权限，但漏洞危害十分严重：低权限用户可以直接提权至NT AUTHORITY\\SYSTEM权限。

在多用户共享的端点上，攻击者只要完成这一提权步骤，就能完全控制整台设备。

Part02

会话校验逻辑存在缺陷

漏洞根源在于Veeam Endpoint Backup服务通过本地gRPC命名管道处理高权限客户端会话的逻辑存在问题。

Arctic Wolf在报告中解释道：“问题出在Veeam Endpoint Backup服务通过本地gRPC命名管道

\\.\\pipe\\Veeam\\VAW\\ServiceConnectionPipe处理高权限客户端会话的逻辑上。服务会将高权限管理员身份与用户可控的会话UID绑定缓存，但该UID并未与发起请求的用户或连接做绑定校验。”

简单来说，服务完全信任用户可控的会话ID，不会校验该ID是否真的属于发起请求的用户。这种逻辑相当于只因为对方知道你的住址，就直接把家门钥匙交出去，完全不核实对方身份。

## 利用难度与读取日志

这种攻击的实施难度极低。高权限会话ID存储在日志文件中，所有标准用户都有权限读取该文件。只要获得设备的基础访问权限，攻击者就能打开文件复制有效ID，利用该ID以SYSTEM权限运行命令。

Arctic Wolf在报告中进一步指出：“高权限会话UID会写入路径C:\\ProgramData\\Veeam\\Endpoint\\Svc.VeeamEndpointBackup.log的日志文件，标准用户可读取该文件。

攻击者可以获取有效UID并滥用其权限，以SYSTEM身份执行命令。公开的GitHub PoC已验证这一攻击路径，代码通过运行whoami命令并将输出写入文件完成验证。”

公开的GitHub PoC仅通过运行whoami命令、将输出写入文件就完成了验证，足以证明漏洞真实可用。整个利用过程不需要复杂的攻击链，读取文本文件就是全部利用步骤。

Part03

官方已推送修复版本

## 修复优先级与建议

Arctic Wolf建议，企业应当优先修补共享工作站、服务器、管理员工作站，以及所有开放本地用户访问权限的系统。如果某台设备上的低权限账号被攻破后，攻击者就能完全控制端点，这类设备也要优先修复。简单来说，所有多人共用的设备都要第一时间打补丁。

漏洞的修复方案十分明确，但在大规模设备上推送补丁可能需要一定工作量。用户需要将Veeam Backup & Replication升级至13.0.2.29或更高版本，升级过程会同步将Veeam Agent更新至包含补丁的13.0.3.1220版本。

升级前，管理员需要排查所有仍运行13.0.1.2067及更早版本的端点，优先处理存在多本地用户或运行特权任务的系统。升级完成后，要检查服务和托盘组件是否都运行在已修复的版本上，未完成全量更新的系统无法获得有效防护。

对于无法立即安装补丁的系统，官方暂未提供正式的规避方案。作为临时缓解措施，管理员应当限制受影响设备的本地访问和交互式访问权限，仅向确有需求的用户开放本地管理员和备份操作员权限。

Arctic Wolf表示，其产品可以检测该漏洞利用链的多个阶段，部署AWN Agent或Aurora Focus的客户可以获得端点多阶段攻击检测覆盖。但检测只是安全兜底措施，不能替代补丁修复。

Arctic Wolf明确指出，升级仍是最核心的修复手段，在等待其他防护措施落地的过程中，任何用户都不应该跳过升级步骤。

参考来源：

Public PoC Exposes Critical Veeam Agent Privilege Escalation

https://securityaffairs.com/199532/security/public-poc-exposes-critical-veeam-agent-privilege-escalation.html
