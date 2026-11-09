---
title: 【微信】The Gentlemen 勒索团伙正以史上最快速度扩张
source: https://mp.weixin.qq.com/s/rd50I4QRDfIiEGIHUnQjyQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:35:18+08:00
trace_id: 6857461a-8141-4ed1-898e-9c382da33954
content_hash: 56b2df71fc57f394c22acc7dbc05ddcfea25e9c4496869ef7d9a21c32e53b71b
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41375244-d011-81d4-9725-fccafd06ec8a
ioc:
  cves:
    - CVE-2024-55591
    - CVE-2025-32433
    - CVE-2025-33073
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**网络与信息安全参考** *2026年11月9日 08:00*

威胁评估 · THREAT ASSESSMENT

The Gentlemen 勒索团伙正以史上最快速度扩张

自 2025 年年中现身以来，它已在 66 个国家声称近 300 家受害者

Halcyon 勒索软件研究中心（Halcyon Ransomware Research Center）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c3b878c3d4e9c0fd.png)

— 图 1｜Halcyon RRC 报告封面：The Gentlemen 勒索软件威胁评估

“

它不是在复制某个前身，而是在拼装一个更强的自己：加密流程、代码混淆、EDR 规避，全部择优而取。

—— 摘译自 Halcyon RRC 报告

📌 本文看点

01

90/10 分成

02

1.47 万台 FortiGate

03

泄露的内部谈判

01

SUMMARY

### 摘要

Halcyon 正在持续跟踪一个快速升级的分裂团伙——它出自高产的 Qilin 勒索软件即服务（Ransomware-as-a-Service，RaaS）行动，名为 The Gentlemen。自 2025 年年中浮出水面以来，该团伙已声称攻击 近 300 家组织，横跨 66 个以上国家与 20 个行业垂直领域，成为我们跟踪过的 扩张最快的勒索威胁 之一。

The Gentlemen 似乎是在与 Qilin 勒索软件发生支付纠纷之后组建的。Halcyon 估计其核心团队约 20 名成员，其中多人此前已在成熟的勒索生态中积累了经验。该团伙从一开始就表现出成熟的运营能力：其增长很大程度上得益于两项优势——向附属成员支付 90% 赎金收益 的慷慨分成，以及一套持续开发中的多操作系统代码库。

近 300 家

声称攻击的组织

66+

国家与地区

20

行业垂直领域

The Gentlemen 的受害者声明中，有 200 余起发生在 2026 年 1 月至 3 月之间；其攻击数量仅次于 Qilin，并超过 Cl0p、RansomHub 和 LockBit 等老牌行为体。在该团伙运作的 前五个月 里，其公布的受害者数量，相当于 Akira 用十二个月、Qilin 用十八个月才达到的水平。

应将 The Gentlemen 视为全球企业环境中的 最高优先级威胁。运行 Fortinet 边缘设备、高度依赖 Active Directory 的组织，以及制造业、科技业和医疗健康领域的实体，面临的风险最高。

02

BACKGROUND

### 背景

The Gentlemen 的前身是 ArmCorp——Qilin 勒索项目中一个高产量的附属成员。ArmCorp 与 Qilin 的决裂由 2025 年 7 月 22 日 的一场支付纠纷引发：威胁行为体 “hastalamuerte” 在 RAMP 地下论坛上公开发帖投诉，称 Qilin 的运营方拖欠 约 48,000 美元 的未付佣金。

就在几天前的 2025 年 7 月 17 日，首个 The Gentlemen 勒索软件样本出现在 VirusTotal 上，其二进制文件中已内嵌该团伙专属泄露网站的 URL——这表明在纠纷公开之前，分裂已经在进行中。到 2025 年 9 月，该 RaaS 已在犯罪论坛上公开招揽生意，受害者数据也开始出现在泄露网站上。

The Gentlemen 运营着一个功能完备的 RaaS 平台，为附属成员提供完整的攻击工具包。给附属成员 90% 的收益分成，也是当前地下市场中最高的一档，目的是把有经验的操盘者从竞争对手那里吸引过来。

多数 RaaS 项目给附属成员的分成为赎金的 70% 至 80%；此前只有 RansomHub 提供过与 The Gentlemen 相同的 90/10 分成。这一策略看来奏效了。2026 年观察到的多数感染事件由附属成员而非核心团队实施，这清楚地表明该项目已经具备可观的规模。

赎金谈判通过各附属成员独立的 Tox ID 进行，而非经由统一的泄露门户，从而在平台与其运营者之间留出一层缓冲。这对附属成员也是一种保护：它使平台运营方 无法将他们排除在正在进行的谈判之外。除数据泄露网站外，该团伙还运营一个 X/Twitter 账号，公开点名受害者——这是一种通过声誉损害施压、推动付款的策略。

The Gentlemen 的开发人员还在系统性地逆向分析 Babuk、Qilin、LockBit 5.0 与 Medusa 的样本，择优取用其中最强大的加密流程、代码混淆技术和 EDR 规避手法，整合进自家代码库，进一步印证了其运营深度。其结果是 经过刻意设计的复合式工程成果，而非对任何单一前身的简单分叉（fork）。

03

INITIAL ACCESS

### 初始访问

The Gentlemen 的主要入口途径是利用 CVE-2024-55591——FortiOS/FortiProxy 中一个 严重的身份认证绕过漏洞，可让未认证的攻击者绕过登录控制。进入系统后，攻击者可以提升权限、创建管理员账户，并在网络中建立持久化访问。

研究人员近期披露，该运营方维护着一份约 14,700 台 全球范围内已被攻陷的 FortiGate 设备清单，另有近千条通过爆破获取的 FortiGate VPN 凭据作为补充。对单个勒索行动而言，这种 预置访问权限的储备规模异常庞大，使其无需每次重新建立立足点，即可发动持续性攻击。

约 14,700 台

已被攻陷的 FortiGate 设备

近 1,000 条

爆破获取的 VPN 凭据

除利用 Fortinet 之外，附属成员还通过面向互联网的 RDP、SSL VPN 端点以及远程管理工具进入目标网络。进入之后，他们借助 AnyDesk、PsExec 等 合法管理工具 进行横向移动，使恶意活动混入正常的网络运维之中。

该团伙的初始访问策略并非一成不变。2026 年 5 月泄露的内部通信 显示，The Gentlemen 正在积极跟踪和评估更新的漏洞，包括 CVE-2025-32433 与 CVE-2025-33073；同时仍在持续利用 Cisco 边缘设备、NTLM 中继攻击，以及从 OWA/M365 中窃取的凭据日志。这表明其正有意识地 拓展 Fortinet 基础设施之外的入口。

04

DATA ENCRYPTION

### 数据加密

The Gentlemen 勒索软件以 Go 语言编写，目标涵盖 Windows、Linux、NAS 与 CSD 环境，并针对 ESXi 配备了一个专门的 C 语言加密器（locker）。每个文件都会生成独立的临时密钥（ephemeral key），以防止在某一密钥被还原后出现 批量解密。1 MB 及以下的文件被完整加密；更大的文件则采用 间歇加密（intermittent encryption），只对部分数据段加密——这种方法在速度与破坏效果之间取得平衡。运行时必须提供与特定构建版本绑定的密码参数，这既限制了自动化分析，也为运营者增加了一层访问控制。

其命令行接口提供了相当高的操作灵活性，包括可设定每个文件的加密比例、从默认到“超快（ultrafast）”的速度模式（速度越快，加密的文件片段越小），以及用于优化打击目标的路径参数。默认情况下，Windows 变体会递归遍历从 A:\\ 到 Z:\\ 的所有本地盘符；Linux 变体则从指定的根目录开始遍历文件系统。Linux 变体还提供一个额外的 擦除（wipe）标志，用于覆写磁盘空闲空间，以阻碍恢复工作。

在加密开始之前，The Gentlemen 会有条不紊地对目标环境进行预处理。

Windows

终止与数据库、备份方案、虚拟化平台及生产力应用相关的进程与服务；删除卷影副本和回收站内容；关闭 Windows Defender 实时保护，同时为其自身二进制文件添加排除项。

Linux

清除回收站内容；销毁文件系统快照（包括 NAS 与虚拟化环境所使用的快照）；删除 VMware 虚拟机快照；终止虚拟化与数据库服务，以最大化可访问文件的数量。

ESXi

通过“先尝试正常关机、再强制终止”的两步流程关闭虚拟机，降低缓存效率、刷新磁盘缓冲区，并禁用虚拟机自动恢复机制。

各变体均会执行 反取证操作 以阻碍调查，包括清除日志、擦除命令历史，以及删除其他系统痕迹。Linux 变体还会建立持久化机制，以便在重启后继续存活。在 ESXi 系统上，勒索信会在登录时显示。所有被加密的文件都会追加一个 唯一的六字符扩展名，并在受影响的目录中投放名为 README-GENTLEMEN.txt 的勒索信。

05

VICTIMOLOGY

### 受害者画像

The Gentlemen 常常选择那些“集中式身份系统 + 持续运营压力”能在 赎金谈判中提供最大杠杆 的组织作为目标。与俄语系网络犯罪团伙的一贯做法一致，该运营方也严格禁止攻击 俄罗斯及独立国家联合体（CIS） 国家。

泰国是受攻击最多的国家，有 27 家受害者；其次是美国、法国和巴西。仅 7% 的受害者位于美国——这与更广泛的勒索生态形成显著偏离：在后者中，约半数受害者为美国组织。这一地域异常或许说明，其附属成员基础大量来自 东南亚与拉美 的操盘者。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3a486eaacab4215e.png)

— 图 2｜Halcyon 威胁报告页面的世界地图头图，红色标记示意攻击落点

受害者遍布六大洲的 66 个国家，既有中小规模企业，也有政府、能源和关键基础设施领域的 大型实体。

受攻击最多的行业依次为 IT 服务、建筑、制造、金融服务和医疗健康。

06

VULNERABILITY

### 关键脆弱性因素

多种相互叠加的因素会提高组织的暴露程度：

Active Directory 被利用

该团伙最具破坏性的投递战术是劫持 AD 组策略，在每一台加入域的终端上 同时引爆 勒索软件。层级隔离薄弱的 扁平化 AD 架构 尤其容易中招。

虚拟化成为目标

以 C 语言专门编写的 ESXi 加密器瞄准虚拟机管理程序（hypervisor）——单台机器上可能承载 数十个关键业务负载。

远程访问被滥用

面向互联网的 RDP、SSL VPN 和远程管理工具构成附属成员利用的 主要入口。由于该团伙依赖 AnyDesk、PsExec 等合法管理工具，恶意流量得以混入正常运维。

供应链暴露面

一些规模较小的厂商与供应商，虽与大型合作伙伴之间存在 特权网络连接，却缺乏部署高级防御的预算，从而在相互关联的商业关系中制造额外的连锁风险。

07

COMPARISON

### 横向对比

The Gentlemen 的扩张速度，几乎超过所有有记录以来的现代勒索行动。该团伙在 2026 年 1 月制造了 48 起攻击，2 月为 91 起，环比几乎翻倍。其增长曲线，可与 LockBit 3.0 的早期崛起相比——后者被广泛视为 RaaS 规模化扩张的最高标杆。

48 起

2026 年 1 月攻击数

91 起

2026 年 2 月攻击数

≈ 2×

环比增幅

不应将 The Gentlemen 当作一个孤立的行动来评估。其附属成员接入的是一个更广阔的攻防生态：来自多家供应商的 初始访问工具、后渗透框架与加密载荷 在此混合使用。持续借用竞争对手勒索代码库的做法，进一步印证了这是一个为 长期存续 而构建的行动。

08

INTERNAL LEAKS

### 内部泄露

2026 年 5 月 4 日，The Gentlemen 的管理员在地下论坛公开承认，其内部后端数据库已被入侵并泄露。次日，一个账号开始以 10,000 美元（比特币结算）叫卖这批窃得的数据，并发布部分证明文件，其中包含服务器账户凭据与密码哈希。该批数据随后被完整公开，暴露了 九个内部账号，其中包括 zeta88——这一账号与 hastalamuerte 相关联，也是该 RaaS 项目的核心管理员。

10,000 美元

泄露数据叫价

250,000 美元

单次谈判开价

190,000 美元

最终实收金额

泄露材料为了解该团伙的日常运作打开了一扇窗：被攻陷的 VPN 与群晖（Synology）账号被不断分享，随后由运营者接手，用于进一步的利用。内部频道还显示，附属成员与运营者如何共享 禁用终端安全的工具与手法、搭建 C2 基础设施、协调正在进行的入侵，并追踪各次行动的分成支付——清楚地展现出一个 高效运转的团队。

泄露的聊天记录还曝光了谈判细节，其中一例是 The Gentlemen 以 250,000 美元开价，最终成功收取 190,000 美元。在另一例中，该团伙在与一家土耳其受害者谈判时，复用了从英国一家软件咨询公司窃得的数据，把这家英国公司 包装成入侵源头，并鼓动土耳其企业对其提起法律诉讼。

作为对泄露事件的回应，管理员宣布全面重建团伙的 通信基础设施、部署新的存储系统，并对加密器进行多项技术升级。这一回应表明，该团伙有意 强化自身运营，并继续扩大规模。

09

MITIGATIONS

### 缓解措施

部署专用反勒索解决方案

部署专用反勒索防御，能够在加密开始之前发现并阻断威胁。有效的方案应识别勒索投递之前的行为模式，包括网络扫描、凭据窃取、通过 PsExec、AnyDesk 和 PowerShell Remoting 进行的横向移动，以及借助 PowerRun 等工具实施的权限提升。方案还应能发现晚期指标，例如为在全域范围投递勒索软件而 修改 GPO、内核级终止 EDR/AV，以及删除卷影副本（MITRE ATT&CK 缓解措施 M1038、M1040）。

边界与边缘设备加固

立即在所有 FortiOS/FortiProxy 设备上修复 CVE-2024-55591。The Gentlemen 手中掌握着约 14,700 台已被攻陷的 FortiGate 设备，因此在漏洞窗口期内 未打补丁的任何设备，都应视为可能已被入侵。审计是否存在此前的利用迹象，并将加固范围扩展至 Cisco 边缘设备与面向互联网的 RDP 端点——这两类目标都出现在该团伙泄露的内部作战手册中。同时密切监视 CVE-2025-32433 与 CVE-2025-33073，该团伙正在积极评估这两个漏洞。优先级排序可参考 CISA 的 已知被利用漏洞（KEV）目录。

加固 Active Directory 与组策略

实施 AD 分层（tiering）模型，限制对 NETLOGON 与 SYSVOL 共享的写入权限，监视未经授权的 GPO 修改与计划任务创建，并对新建域管理员账户进行告警。层级隔离薄弱的扁平化 AD 架构对该团伙 尤为脆弱（M1026、M1018）。

凭据卫生与身份控制

在所有系统中部署 抗钓鱼的多因素认证（MFA），并特别关注 FortiGate VPN、远程访问与特权账户（M1032）。The Gentlemen 泄露的通信显示，其正在积极使用从 OWA/M365 窃取的凭据日志和爆破获取的 VPN 凭据，因此应立即审计所有第三方访问，并 轮换任何遗留或可能已暴露的凭据（M1018）。

备份韧性与恢复演练

维护与加入域的系统隔离的、不可变的离线备份，并定期测试恢复流程（M1053）。The Gentlemen 会在加密前专门攻击 NAS 系统、Exchange 服务器、存储阵列和备份基础设施，以阻断恢复。知道“存在备份”并不等于知道“备份可用”。

供应链风险治理

The Gentlemen 已表现出从一个被入侵的组织 转向其客户 的意愿，并以窃取的凭据和基础设施文档作为跳板。应为关键供应商、软件提供商和第三方服务伙伴建立基线安全要求（M1013）。主动监视组织范围内在用的第三方工具与平台是否遭到入侵（M1047）。

10

REFERENCES

### 参考资料

01

Group-IB｜Hasta la vista, Hastalamuerte: An Overview of The Gentlemen's TTPs（2026 年 4 月）

02

Check Point Research｜DFIR Report: The Gentlemen & SystemBC（2026 年 5 月）

03

Cybereason｜License to Encrypt: The Gentlemen Make Their Move（2026 年）

04

SOCRadar｜Dark Web Profile: The Gentlemen Ransomware（2026 年 2 月）

05

Fortinet FortiGuard｜The Gentlemen Ransomware Threat Actor Profile（2026 年 3 月）

06

Blackpoint Cyber｜The Gentlemen Ransomware Threat Profile（2025 年 11 月）

07

KPMG｜CTIP: Gentlemen Ransomware（2025 年 11 月）

08

Dark Reading｜The Gentlemen Rapidly Rises to Ransomware Prominence（2026 年 4 月）

09

Ransomware.live｜The Gentlemen Group Tracking Data

10

Check Point Research｜Thus Spoke...The Gentlemen

11

SOURCE SUMMARY

### 来源说明

本警报基于 Halcyon 的观测、开源信息与持续研究。相关结论反映我们当前对威胁行为体活动的认知，并可能随新证据出现而更新。评估意见可能 在新证据到位后修订。

Halcyon 勒索软件研究中心（Halcyon Ransomware Research Center）汇聚专家、推动明智政策，并提供可落地的情报，以 发现、打断和击败 勒索软件。可在此浏览该中心最新的报告、分析与资源。

12

APPENDIX

### 附录：RaaS 经济生态

勒索软件即服务（RaaS）团伙的兴起，在每一个实质意义上都模仿了更为传统的“软件即服务”商业模式。勒索经济由多个参与者构成，他们分别专注于勒索攻击这一更大链条中的不同环节，包括以下几类。

初始访问代理（Initial Access Brokers）

初始访问代理（IAB）是技术高超的专家，极擅长渗透安全网络并 建立立足点。IAB 常将被攻陷网络的访问权限出售给其他威胁行为体，包括勒索软件附属成员。IAB 能渗透得越深，其服务就越值钱。购买凭据和访问权限 出人意料地容易，且价格相对低廉。

RaaS 平台运营方（RaaS Platform Providers）

RaaS 运营方提供用于发动攻击的 软件平台与后端。他们拥有持续改进功能集的开发团队，在攻击得手后协助谈判，管理客服人员，向新的附属成员做推广，诸如此类——一切只为分得一杯羹。

RaaS 附属成员（RaaS Affiliates）

真正的勒索攻击由附属成员管理与执行——即策划并实施攻击行动的个人或团队。他们通过 IAB 获取访问权限（或自行建立），使用 RaaS 运营方提供的平台或工具包，实施攻击，随后将赎金资金 腾挪转移，以躲避监测。

命令与控制服务提供商（C2Ps）＊

C2P 是合法的 ISP，它们将攻击基础设施出租给威胁行为体，同时以 隐私政策为挡箭牌，对滥用行为视而不见。＊这类“C2P”是 RaaS 经济中一个全新的面向，由 Halcyon Research 在《Cloudzy with a Chance of Ransomware》中发现并报告。

勒索经济整体的成熟度、组织化程度与专业化分工意味着，我们面对的是一个战术、技术与程序（TTP）正在逼近某些国家背景攻击者 的对手。在许多案例中，已有记录显示国家背景攻击要素与网络犯罪勒索团伙之间存在重叠。今天的勒索攻击比以往任何时候都 更复杂、更难防御。

END

原文出处 / SOURCE

原文标题：The Gentlemen Ransomware Group Is Scaling Faster Than Any Other Group on Record

作者 / 发布机构：Halcyon Ransomware Research Center（Halcyon 勒索软件研究中心）

来源链接：https://www.halcyon.ai/ransomware-research-reports/threat-assessment-the-gentlemen-ransomware-group

本文为原文的完整中文翻译，仅供安全研究与防护参考。译文保留原文术语、数据与判断，未作删减或改写。

如果这篇内容对你有帮助，欢迎 **点赞、在看、转发** 三连。
