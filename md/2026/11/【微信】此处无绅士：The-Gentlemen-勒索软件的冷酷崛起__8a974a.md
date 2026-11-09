---
title: 【微信】此处无绅士：The Gentlemen 勒索软件的冷酷崛起
source: https://mp.weixin.qq.com/s/m4pvs72LkkbVEl87D0msmA
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:34:34+08:00
trace_id: 8b71bc88-190f-4505-ab7a-659de015286d
content_hash: c7cad1cd587f62bf659995f31e26040c11433f3dd4406ee35fdf79fcd1a3e8f9
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41375244-d011-810c-9640-f88e852861e3
ioc:
  cves:
    - CVE-2024-55591
    - CVE-2025-32433
    - CVE-2025-33073
    - CVE-2025-55182
    - CVE-2025-7771
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**网络与信息安全参考** *2026年11月9日 08:00*

UNIT 42 · 威胁情报

此处无绅士：The Gentlemen 勒索软件的冷酷崛起

“

把 90% 的赎金分成 写进招募公告，再用一年时间，把自己做成了 2026 年按受害者数量计第二活跃的 RaaS 项目——这更像是 **商业模式上的碾压**。

—— 译者

编者按

本文完整译自 Palo Alto Networks Unit 42 于 2026 年 7 月 10 日发布的威胁情报分析，作者 Matt Brady。文章以数据泄露站点的统计数据为切口，复盘 The Gentlemen 如何从 Qilin 的附属成员起步，在一年多时间里跃升为 2026 年声称受害者数量第二的 RaaS 项目，并在文末按攻击链阶段给出可直接落地的处置建议。译文保留原文全部章节、图注、数据与术语，未作删减。

本文看点

01

90% 分成改写行规

02

半年增长逾 6 倍

03

九阶段处置清单

01

EXECUTIVE SUMMARY

### 执行摘要

The Gentlemen（又名 Storm-2697）是一个至少自 2025 年 7 月起活跃的 勒索软件即服务（RaaS）项目 。公开报告显示，其运营者很可能早在此前数月，就已作为 Qilin RaaS 的附属成员（代号 ArmCorp）展开活动——Qilin 被 Unit 42 追踪为 Spikey Scorpius。该组织的勒索软件变种同时使用 C 与 Go 两种编程语言编写，使威胁行为者能够把加密器铺开到不同的操作系统与虚拟化基础设施之上。

图 1 展示了该勒索软件部署后所使用的桌面壁纸。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/80bc976daa55c0c4.png)

— 图 1：The Gentlemen 勒索软件部署后替换的桌面壁纸，画面中五位戴礼帽与面具的“绅士”下方，用红字写着 “YOUR NETWORK IS LOCKED BY THE GENTLEMEN”（你的网络已被 The Gentlemen 锁定）。来源：Krebs on Security。

更多公开报告显示，这些运营者（约 20 人）很可能在 2025 年 9 月前后，从私有团体转型为 RaaS 模式。传统 RaaS 模式通常向附属成员提供已付赎金的 70% 至 80% 作为分成，而 The Gentlemen 给出的分成比例高达 90%，前所未有 。

02

BACKGROUND

### 背景

自 The Gentlemen 出现以来，Unit 42 及其他安全研究人员观察到，其使用了与其他 RaaS 运营者类似、种类繁多的初始访问手法，包括利用边缘设备（防火墙、VPN）中的漏洞、暴力破解、获取泄露和/或被盗凭据，以及与 初始访问代理（IAB） 合作。

近期，研究人员已确认 The Gentlemen 使用了一款定制的、基于 Go 的后门，一个名为 “GentleKiller” 的 EDR 杀手框架 ，并怀疑其使用了一个尚未明确披露的零日漏洞利用，以强化自身的防御规避能力。

2026 年 5 月，The Gentlemen 宣布与 HasanBroker 旗下的 BreachForums 建立合作，以此招募附属成员、渗透测试人员与 IAB。图 2 即为该公告的画面。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5ff11a7743074108.png)

— 图 2：BreachForums 与 The Gentlemen 的合作公告。公告宣布双方建立“官方合作”，并列出三个招募卖点：附属成员可获 90% 分成、自行掌控赎金谈判、加密器覆盖 Windows / Linux / ESXi 跨平台。来源：Gurucul。

2026 年 5 月，一名据称是内部人员的人泄露了一份内部数据库，此后数月间，关于 The Gentlemen 及其运作架构的更多信息陆续浮出水面。

03

DATA LEAK SITE INSIGHTS

### 数据泄露站点洞察

2026 年迄今，Unit 42 及其他安全研究人员观察到的最令人警觉的趋势之一，是 The Gentlemen 声称的受害者总量相比 2025 年出现了 绝对量级的增长 。截至 7 月 7 日，一个可信来源的统计显示，自该组织出现以来，其在 77 个国家累计声称 580 名受害者。在这 580 名受害者中，有 103 家属于制造业——由于企业必须维持运营不中断，该行业历来是常见的攻击目标。

580

累计声称受害者（名）

77

涉及国家（个）

103

制造业受害者（家）

图 3 展示了 2025 年 The Gentlemen 与 Qilin、Akira 声称的受害者总数对比。Akira 被 Unit 42 追踪为 Howling Scorpius，它在去年声称的受害者数量超过了所有其他 RaaS 项目。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c880cc59850562b1.png)

— 图 3：2025 年主要 RaaS 项目声称的受害者总数对比，Qilin 1,024 名、Akira 687 名、The Gentlemen 73 名。来源：Unit 42。

作为对照，图 4 展示了 2026 年截至目前（截至 7 月 3 日）The Gentlemen 与 Qilin、Akira 声称的受害者总数。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f83753973f67c726.png)

— 图 4：2026 年（截至 7 月 3 日）主要 RaaS 项目声称的受害者总数对比，Qilin 648 名、The Gentlemen 451 名、Akira 334 名。来源：Unit 42。

将 2025 年最后六个月与 2026 年前六个月相比，The Gentlemen 声称的受害者数量 增长了略高于 6 倍 。而更令人担忧的是，这些威胁行为者在 2025 年仅在最后四个月里处于活跃状态。

划重点

6 倍的增幅，对应的只是 2025 年最后四个月的有效活跃期。

图 5 进一步呈现了自 2025 年 8 月以来 The Gentlemen 每月声称的受害者数量——2025 年 8 月正是其 RaaS 模式正式上线的前一个月。2026 年 6 月是其迄今声称受害者最多的月份，达 117 名，较 2026 年 1 月增长了接近 4 倍 。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/120ae4ca2d3c01c0.png)

— 图 5：2025 年 8 月以来 The Gentlemen 每月声称的受害者数量，2026 年 6 月达到峰值 117 名。来源：Ransomware.live。

04

CONCLUSION

### 结论

尽管 Qilin、Akira 这类传统的大猎物狩猎（big-game hunting）RaaS 项目仍凭借既定战术持续制造大量受害者，但就已声称的受害者数量而言，The Gentlemen 已坐稳 2026 年第二大活跃 RaaS 项目 的位置。用以招募附属成员的高额分成机制，加上在攻击生命周期各阶段使用定制工具，使 The Gentlemen 成为企业组织在中短期内都必须认真对待的强劲威胁。

05

RECOMMENDATIONS

### 处置建议

初始访问（Initial Access）

立即排查并修复以下已知被利用的漏洞：

CVE-2024-55591（Fortinet 的 FortiOS 与 FortiProxy）

CVE-2025-32433（Erlang/OTP SSH 服务器）

CVE-2025-33073（Windows SMB 客户端）

CVE-2025-55182（React2Shell）

对防火墙、VPN、远程访问网关等面向互联网的系统与应用，建立并维持可靠的可见性。

审计边缘设备与面向互联网的 RDP 端点，查找此前是否留有被利用的迹象。

为第三方依赖与供应商设定严格的安全要求，并监控任何第三方工具或平台是否遭到入侵。

执行（Execution）

针对任何匹配字符串 gentlemen\* 的计划任务的创建、删除或执行，立即建立高优先级 SIEM 告警。

权限提升（Privilege Escalation）

立即排查并修复以下已知被利用的漏洞：

CVE-2025-7771（ThrottleStop.sys 驱动）

防御削弱（Defense Impairment）

启用 EDR 防篡改保护，并监控未经签名或已知存在漏洞的驱动是否被异常加载。

针对执行 wevtutil 清除安全日志/系统日志的系统，建立行为告警。

凭据访问（Credential Access）

在所有系统上部署防钓鱼的多因素认证（MFA）。

定期审计并轮换凭据。

发现（Discovery）

监控 Advanced IP Scanner 这类工具的内部使用情况——威胁行为者频繁使用此类工具进行内网侦察与测绘。

横向移动（Lateral Movement）

强制启用严格的 SMB 签名，彻底禁用 SMBv1，并限制内部网段之间的横向网络移动，以遏制其自我传播机制。

确保 ESXi 主机默认关闭 SSH，仅在明确的维护窗口内临时开启。

将虚拟化环境视为零级（Tier-0）基础设施，并把 ESXi 管理接口限制在专用、隔离的管理 VLAN 中。

命令与控制（Command and Control）

监控经非标准端口外发的异常流量，或与已知 SystemBC 通信特征相匹配的流量。

影响（Impact）

维护并验证离线备份与恢复能力。

针对使用 vssadmin 与 wmic 删除卷影副本的系统，建立行为告警。

原文信息

标题：No Manners Here: The Ruthless Rise of The Gentlemen Ransomware

作者：Matt Brady

发布：2026 年 7 月 10 日（更新于同日 12:08 PDT）

来源：https://unit42.paloaltonetworks.com/the-gentlemen-ransomware/

原文标签

Howling Scorpius RaaS Spikey Scorpius

END
