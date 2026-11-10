---
title: 【微信】今日速递｜看雪无痕Hook、DisplayLink、微软FORGE
source: https://mp.weixin.qq.com/s/NJsDud_HoJJ9UEXTXTP8lA
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T13:34:29+08:00
trace_id: 442acf22-2671-4513-9ad1-21a8bc857af3
content_hash: 794bec1776b1fd8d7e76c5d527d00a2dc9c17185d7aeded878f27429205c69cc
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41475244-d011-81ea-8d87-da6f78f2819e
ioc:
  cves:
    - CVE-2026-123158
  cwes:
    - CWE-532
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**小瑶在工地** *2026年11月10日 10:50*

各位工友早。今天主线是看雪上的无痕 Hook 检测讨论、用 Claude 和 Rust 做开源 DisplayLink 驱动后收到律师函，以及微软 FORGE 实验室用 Agent 去找 Rust 标准库里的内存安全问题；昨稿 Liter8、PairIP、ARTEX 等不重复。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9799a81f229ef53b.jpg)

PART 1

第一部分｜国内安全厂商 · 安全网站 · 安全论坛热点

本层以看雪窗口内新帖为主（顺序号 293463 起已能打开真实正文），加上先知对 OpenSSH/musl 认证绕过的补分析。游戏加固绕过长文、DexProtector 静态还原、路由刷机教程等不进主条；PairIP / x32dbg MCP 等昨稿不重复。

1\. 看雪｜无痕 Hook 检测：对着已公开的几种手法

看雪 Android 安全区用户 Yangser 约 16 小时前（北京时间）发帖《无痕 hook 检测方案》，并被顶上首页。作者开篇写明：只针对已经公开的几种无痕 Hook 手法谈检测思路；正文和项目地址需登录回复后可见。帖子热度很高，点赞已经过九十。适合做 Android 运行时完整性、想分清「无痕 Hook 大概在防什么」的人当索引；这里只记议题和取向，不写检测实现或对抗步骤。

来源

https://bbs.kanxue.com/thread-293473.htm

工地点评：检测贴比绕过贴更值得收藏。正文在登录墙后面，先看作者限定的范围——只谈已公开手法——再决定要不要点进去。

2\. 看雪｜APP 常见加固识别小工具（PC）

同一版块约 10 小时前，用户 wx_kx68010 分享《APP常见加固识别小工具（pc）》。从标题能确定的是：跑在电脑上、用来识别安卓包常见加固品牌/形态的辅助小工具。详细说明和下载同样需要回复可见。适合做加固分类、日常分拣样本的人记一笔「社区又多了一个识别器用」；不是脱壳工具介绍，这里也不写识别规则。

来源

https://bbs.kanxue.com/thread-293479.htm

工地点评：识别和脱壳是两件事。这种小工具的价值是帮你先给样本贴标签，别指望它代替后面的分析。

3\. 看雪｜Polaris RE 后续：官方示例被指写进日志

约 20 小时前，Polaris RE 作者「数字幽灵」发帖：用这套自研的 Rust 审计工具去扫 OpenHarmony 官方 Sample，在 VideoPlayer 示例里标出一处 CWE-532（敏感信息写入日志）的证据链，并按流程向 OpenHarmony 安全响应工作组报告。官方确认问题存在，同时说明示例代码不在社区漏洞奖励范围内，建议去代码仓提 issue。作者称在 Gitee 遇到新账号风控后，改为邮件提交了把公开格式符改成私有格式符的修复建议。11-08 稿写过 Polaris RE 这套鸿蒙逆向工具本身，今天是它扫官方示例并拿到确认的后续，不重复工具介绍。文中还提到工具已扩展到 ELF / Python / JS / Go 审计，并带 MCP 接口；具体能力以仓库说明为准。

来源

https://bbs.kanxue.com/thread-293467.htm

工地点评：官方示例被扫出日志问题，说明「演示代码」也会被照抄进真实应用。做鸿蒙开发的，日志里别把外部传入的内容原样打成公开字符串。

4\. 看雪｜Themida TIGER：虚拟指令研究的中译

外文翻译区用户 zZhouQing 约 14 小时前 放出《Themida TIGER 系列虚拟机的虚拟命令提取方案研究》中译，附件包括韩文原文 PDF、译文和一份 FISH VM 结构笔记。公开取向是：把 Themida TIGER / FISH 这类保护虚拟机的工作模型（虚拟总线、字节码取出、handler 分发等）整理成可对照的研究材料，并写明「这不是完整规范」。适合做保护虚拟机、已在看 Themida 公开资料的人当翻译索引；此处只记「有这篇译文和研究对象」，不写提取或还原步骤。

来源

https://bbs.kanxue.com/thread-293475.htm

工地点评：看保护虚拟机，先有一份别人整理过的名词和结构图，会比直接对着混淆代码瞎转轻松。把它当论文笔记即可，不是通用一键解。

5\. 看雪｜Windows 文件所有权：夺权之后 DACL 为什么又能改

编程技术区「幸运三叶草」发帖讨论一个常见直觉：文件所有者是 SYSTEM、DACL 又拒绝「所有者」修改权限时，管理员 takeown 之后为什么又能改 DACL。作者在 Windows 11 24H2 上用访问检查和安全描述符对照，观察到 takeown 成功后，原来的 OWNER RIGHTS ACE 被加上了「只继承」标志，不再参与当前对象的检查，所有者又拿回隐式的 WRITE_DAC。环境写得很清楚，适合做 Windows 权限模型、访问控制实验的人对照；不是提权操作手册。

来源

https://bbs.kanxue.com/thread-293461.htm

工地点评：Windows 权限经常「表面上拒绝了，实际还有隐式权利」。做权限加固的，值得把 OWNER RIGHTS 和继承标志搞清楚，别只看一眼 icacls 的输出。

6\. 先知｜OpenSSH/musl 认证绕过补分析，同日进了 KEV

先知「高音召华」于 2026-11-09 14:01 发文，梳理 CVE-2026-123158（社区多称 SSHole）：在使用 musl、且密码验证不走 PAM 的 OpenSSH（典型如部分 Alpine / 嵌入式镜像）上，认证路径可能把错误返回值和锁定账户的密码字段比成「匹配」。影响版本公开表述为 10.6p2 之前；OpenSSH 已在 10.6p2 修复，Alpine 也发过对应包。11-06 / 11-07 稿已经写过披露和蜜罐里的利用尝试，本条不重复细节。值得记的新进展是：同日 CISA KEV 把该 CVE 和另外三条（GPUStack 错误认证、SignalWire FreeSwitch 代码注入、IBM Aspera Faspex 授权问题）一起列入，修复截止日期写到 2026-11-12。看雪资讯区亦有转述 SANS 蜜罐监测的稿子。

来源

https://xz.aliyun.com/news/93220  
https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json  
https://bbs.kanxue.com/thread-293474.htm

工地点评：跑 Alpine 或 musl 镜像、还开着密码登录的，先核对发行版补丁并重启 sshd。glibc 那一套（Ubuntu / RHEL）不在这条影响画像里，但密码登录能关还是关更稳。

7\. 看雪｜有人用 AI 写了个壳，发上来求还原

加壳脱壳区用户 jerrynpc 约 23 小时前 发短帖《自己用AI写了个壳，不知哪位大佬可以还原》，正文几乎只有「AS title」，并附了一个约 6MB 的 exe 样本。这更像一次「AI 生成保护」的社区挑战，而不是完整技术文。适合对加壳样本、AI 辅助保护感兴趣的人知道有这么一帖；不建议随便下载来路不明的附件，更不要把别人的挑战包当通用脱壳教材。

来源

https://bbs.kanxue.com/thread-293464.htm

工地点评：AI 写壳已经有人拿来发挑战了，说明保护侧也会用模型堆复杂度。看看热闹可以，附件还是在隔离环境里碰。

补查：安全客首页多为活动征稿与旧闻综述，无强新 KEEP；嘶吼偏厂商资讯；Seebug Paper 521；FreeBuf 首页与 RSS 均 405。看雪 293477 游戏加固绕过长文、293472 DexProtector 静态还原、293463 路由刷机、293478 FPS 壳（下）、293465 改密码登录等不进主条。PairIP / x32dbg MCP / HexScan / AntiVmp / 外挂驱动 / IDA 9.5 转帖等昨稿不重复。

PART 2

第二部分｜X 上的二进制 / 安全 / OS 逆向热点 + 越狱工具

窗内主钩是 DisplayLink 开源驱动 Vino 用 Claude + Rust 做协议逆向后收到 Synaptics 律师函；另有苹果 11-09 安全更新、MCP 桥横评、Darling 的 AI 贡献政策、AWS Nitro Sandboxes，以及昨稿未用的 Hermes Security 插件。Frida 仍停在 17.26.2；Liter8 / FilzaSlop / phoneuse / BLA / Eleven 等昨稿不重复。

1\. DisplayLink｜用 Claude 和 Rust 写出开源驱动，收到律师函

Tom's Hardware、Phoronix、VideoCardz 近窗报道：Linux 开发者 Mike Lothian 以爱好者身份，用 Claude 订阅辅助、以 Rust 实现名为 Vino 的开源 DisplayLink 驱动，公开说法是干净室逆向协议、而不是抄官方驱动代码。他曾在 2026 年 7 月联系 Synaptics 工程师讨论问题，随后公司法律部门发来停止侵权函，要求撤下 GitHub 仓库，并威胁把整理专利对照文档的费用开给他；信里甚至写「如果你想通知媒体或公开我们的回复，我鼓励你这么做」。目前公开仓库已看不到。Synaptics 主张的是专利权，不是版权抄袭；法院尚未就此作出侵权认定。这件事在 X 上被广泛转述，核心争议是：个人用消费级 AI 把 USB 扩展坞协议做出来之后，厂商会不会用专利律师函把开源实现按回去。

来源

https://www.tomshardware.com/peripherals/docking-stations-hubs/synaptics-sends-cease-and-desist-order-to-creator-of-open-source-displaylink-driver-dares-him-to-publicize-its-threats-dev-reverse-engineers-displaylink-using-claude-ai-and-rust-synaptics-threatens-to-bill-creator-for-legal-documentation  
https://www.phoronix.com/news/Synaptics-Blocks-Vino-Driver  
https://x.com/tomshardware/status/2119747592682979388  
https://x.com/VideoCardz/status/2119812340052795831

工地点评：这不是「AI 一键破解驱动」的爽文，而是专利和开源碰在一起的现实版。想跟协议逆向的，看公开报道和双方信函即可；仓库已经不在了，也别去找来路不明的镜像包。

2\. 苹果｜iOS 27.2.1 等安全更新在 11-09 落地

苹果安全更新页显示，2026-11-09 放出一批补丁：iOS / iPadOS 27.2.1（iPhone 11 及更新机型）、旧线的 iOS 26.7.3 与 iOS 18.7.12，以及 macOS Golden Gate 27.2.1、Tahoe 26.7.3、Sequoia 15.8.3，还有 watchOS 27.2.1 / 26.6.1 和 visionOS 27.2.1。iOS 27.2.1 的安全内容页列出约 9 个 CVE，公开影响描述包括蓝牙范围内可能绕过配对码尝试频率限制、应用可能访问敏感用户数据等，属于漏洞修复而不是功能更新。X 上多家科技账号同步了「无新功能、请走系统更新」的说明。想留越狱空间的读者，可以先别急着点 27.2.1，等 Dopamine 等作者表态；普通用户按官方安全页升级即可。

来源

https://support.apple.com/en-us/100100  
https://support.apple.com/en-us/149715  
https://x.com/ApplesClubs/status/2119875853257756740

工地点评：安全补丁和越狱窗口常常打架。主力机建议跟上官方更新；备用机如果还想留玩越狱的机会，先看作者怎么说，再决定升不升。

3\. MCP 桥｜REA、Ghidra、IDA、Binary Ninja 怎么选

X 中文圈 @ThreeAAOfficial 近窗发了一组横评：想让 Claude Code / Codex 做逆向，先得选一座桥——REA 一条命令接 Hopper / Ghidra / IDA，还能拆 Electron、.NET、APK 和固件；GhidraMCP 全套免费、可无界面运行；IDA Pro MCP 功能最全但年费高；Binary Ninja MCP 能同时打开多个程序，个人版收费、免费版不支持插件。另一条帖还把路线分成「开放派」（Ghidra / IDA 把接口交给外部 Agent）和「自营派」（Binary Ninja 自己的 Sidekick，可本地部署）。@i_am_wami 补充了一个很实用的观察：有的 Ghidra 桥一次塞给模型 219 个工具，那是上下文账单而不是能力；IDA 9.5 和 Binary Ninja 6.0 自己带 MCP，竞争已经变成「哪 12 个工具」而不是「堆多少个」。11-08 写过 REA 本身，本条只记选桥和工具数量的讨论。

来源

https://x.com/ThreeAAOfficial/status/2119796362003058697  
https://x.com/ThreeAAOfficial/status/2119799672244248754  
https://x.com/i_am_wami/status/2119762081142415566

工地点评：工具不是越多越好，模型挑花眼反而更慢。已经有 IDA 或 Binary Ninja 的，优先用官方/原厂 MCP；零成本入门可以先看 GhidraMCP。只分析自己有权看的程序。

4\. Darling｜允许用 AI 帮着在 Linux 上跑 macOS 程序

Phoronix 于 2026-11-09 报道：做了十多年的 macOS-on-Linux 兼容层 Darling，正式接纳 AI 辅助贡献。项目 Q4 博客写得很清楚：谁提交 PR，谁就要对每一行负责，并且能用自己的话解释；维护者的问题由人回答，不是由机器人代答。规则还强调干净室约束——实现文档里的契约、尊重 macOS 分层、隔离并标注未文档化的怪癖；禁止使用泄露材料或 Apple 受限源码（如 corecrypto），也不应用反汇编去生成匹配代码。报道称 AI 辅助补丁已经让 macOS 版英雄联盟在 Linux 上跑起来，项目还加入了初步的 ARM64 支持。社区里同时有人提到部分原作者转向 NoAiDarling，担心质量。政策原文以官方博客为准。

来源

https://www.phoronix.com/news/Darling-Using-AI-macOS-Linux  
https://blog.darlinghq.org/2026/11/08/development-update-q4-2026/

工地点评：小团队用模型加速兼容层，方向能理解，关键还是那句「人必须能解释每一行」。这类项目最怕的不是用不用 AI，而是没人审查就往主线合。

5\. AWS｜Nitro Sandboxes：给 Pod / 任务单独一间硬件隔离房

AWS 于 2026-11（KubeCon 同期）宣布 Nitro Sandboxes：在同一台 EC2 上，为 Amazon EKS 的 Pod、ECS 的任务以及 EC2 上的轻量虚拟机提供基于 Nitro 虚拟化的硬件级隔离，工作负载各自使用独立的 Linux 内核，官方写明不额外收费，并兼容 EBS / EFS / CloudWatch 等现有能力。公开定位很明确——多租户和不信任代码（包括 AI Agent）需要比普通容器更硬的边界。X 新闻汇总亦在 11-09 传播此事。细节以 AWS 公告和文档为准。

来源

https://aws.amazon.com/about-aws/whats-new/2026/11/nitro-sandboxes-eks-ecs-ec2/  
https://aws.amazon.com/blogs/containers/aws-nitro-sandboxes-hardware-enforced-workload-isolation-on-amazon-eks/

工地点评：让 Agent 跑代码，容器同内核已经不够安心。用云的可以看这层硬件隔离怎么收费为「不另计」；自己建沙箱的，至少把「别和业务机共用一个内核」记在心上。

6\. Hermes｜官方 Security 插件：先画攻击路径再验证

Nous Research 在 11-08 为 Hermes Agent 上架官方插件 hermes-security（昨稿候选未写入正文，近窗 X 新闻仍在转）。公开说明是：对本地仓库做安全评审——标出攻击入口和信任边界、拆给子 Agent 并行查看，并在临时副本里确认发现是否真能被攻击者触达；结果可导出 Markdown / JSON / CSV / SARIF。官方写明需要 Hermes 0.21.5+ 和 Python 3.11+；可选的测试确认会以当前用户身份运行，并不是沙箱。面向的是自己有权审计的代码，不是拿来对外打点。

来源

https://hermes-agent.nousresearch.com/marketplace/hermes-security

工地点评：和「扫一遍就报警」的工具相比，它强调要验证发现能不能真被够到，这点更有用。注意官方自己写了：确认步骤不在沙箱里，先拿不重要的仓库试。

工具箱补充｜版本与窗口内更新

和今天新闻相关的工具，版本信息以官方页面为准。有新 tag 的单独标出；无更新的也列一行方便对照。

Frida 17.26.2（相对昨日无新正式 tag）

·仍为 2026-11-07 发布的 17.26.2；新闻页最新仍为 17.26.2。

·官方：

·https://github.com/frida/frida/releases/tag/17.26.2

Vector canary-3118／Ghidra 12.2／jadx v1.5.6／Dopamine 3.0.13

·相对昨日无新正式 tag。

·Vector：

·https://github.com/JingMatrix/Vector/releases/tag/canary-3118

·Ghidra：

·https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.2_build

·jadx：

·https://github.com/skylot/jadx/releases/tag/v1.5.6

·Dopamine：

·https://github.com/opa334/Dopamine/releases/tag/3.0.13

Magisk v31.1／KernelSU v3.3.1／APatch 11282

·相对昨日无新正式 tag。

·Magisk：

·https://github.com/topjohnwu/Magisk/releases/tag/v31.1

·KernelSU：

·https://github.com/tiann/KernelSU/releases/tag/v3.3.1

·APatch：

·https://github.com/bmax121/APatch/releases/tag/11282

palera1n v3.0.0-beta.3／TrollStore 2.1.1／LSPosed v1.9.2

·相对昨日无新正式 tag。

·palera1n：

·https://github.com/palera1n/palera1n/releases/tag/v3.0.0-beta.3

·TrollStore：

·https://github.com/opa334/TrollStore/releases/tag/2.1.1

·LSPosed：

·https://github.com/LSPosed/LSPosed/releases/tag/v1.9.2

PART 3

第三部分｜事件热点

优先微软 FORGE 用 Agent 查 Rust 标准库、N-able 在公开披露后把云上 N-central 下线，以及 Acronis 披露的 BOSSAI 智能体网打到台北应急调度记录。ARTEX / Storm-3358 / Aur0ra 等昨稿不重复。

1\. 微软｜FORGE：用 Agent 在 Rust 标准库里找内存安全问题

微软安全博客于 2026-11-09 发文：FORGE 实验室在 Rust 标准库（std / core）里发现多处内存安全问题，其中包含「完全用 safe Rust 写成的代码也能触发未定义行为」的情形。研究借助了名为 Hyenas 的系统——它是 FORGE 前沿研究版的 MDASH（一套用模型辅助找漏洞的扫描器）。文章把根因归纳成三类对 unsafe 代码的误信：相信代码不会 panic、相信用户提供的实现一定正确、相信底层系统。作者强调 Rust 的所有权模型仍然挡掉了很大一类问题，但标准库的安全 API 下面仍有 unsafe；契约一破，上层的 safe 代码也会踩坑。团队把问题报给了 Rust 议题跟踪器，文中写到发布时仍有两项未关闭。研究员负责复查、评估影响并与维护者沟通，而不是把模型输出直接当结论。

来源

https://www.microsoft.com/en-us/security/blog/2026/11/09/forge-lab-uses-agentic-tools-to-identify-memory-safety-issues-in-rust/

工地点评：Rust 不是魔法盾，标准库里的 unsafe 一样会写错。这条对写底层库的人更有用：模型可以帮忙找，但最终还得人把「安全契约」讲清楚。

2\. N-able｜公开三十多个问题后，云上 N-central 被紧急下线

BleepingComputer 等于 2026-11-09 报道：研究员 Sean Bales 在 11-08 晚间公开披露远程监控管理平台 N-central 上三十多个号称零日的问题，测试环境写的是预发布版 Appliance 2026.4.0.31，并认为多数也会影响更早版本。Bales 向媒体确认发现过程有 AI 辅助。N-able 称这是「未负责任的披露」，作为预防措施在 11-09 把美洲、欧洲和亚太的托管 N-central 环境全部下线，并强烈建议本地部署客户暂时关闭服务器，等待官方确认后再恢复；同时表示当时未见活跃利用，正在制作热修复。N-able Login 名下的部分 Ecoverse 功能仍可从 n-able.app 访问。MSP 和 IT 团队应以厂商状态页为准，不要去跟公开的概念验证仓库。

来源

https://www.bleepingcomputer.com/news/security/n-able-takes-cloud-platform-offline-after-30-plus-zero-days-published/

工地点评：管着客户机器的 RMM 一出问题，影响面比普通网站大得多。用 N-central 的先看官方状态页，托管的等恢复、本地的先按厂商要求停机，别自行试验那些公开材料。

3\. BOSSAI｜一个人带着 12 个 Agent，碰到了台北应急调度记录

The Hacker News 于 2026-11-09 转述 Acronis Threat Research Unit：一名研究者高度确信位于台湾花莲的单人操作者，搭了一套名为 BOSSAI 的智能体网（12 个 Agent，调查时 9 个在活动），对至少 11 个国家的应急服务、银行、大学和军事相关系统做扫描和尝试。已确认的伤害包括：智能体从一个城市的 119 调度系统接口拉取了台北七个行政区的案件记录（时间、响应类型、状态、街道级位置——研究人员特别写明不是救护车实时 GPS）；另外发现台北消防部门一套 2018 年的患者护理平台在无需登录的情况下暴露了心电图、随车视频和生命体征等数据。商业云端模型大多拒绝直接参与进攻性操作，操作者转而使用本地去安全对齐的模型，效果更差、也更容易出错。证据来自操作者自己暴露的服务器，内含大量对话、命令历史和工具。报告没有说明相关机构是否已被通知。

来源

https://thehackernews.com/2026/11/taiwan-based-hacker-used-bossai-ai.html  
https://www.acronis.com/en/tru/posts/bossai-inside-the-ai-attack-mesh-that-targeted-taiwans-emergency-services/

工地点评：一个人配上一组 Agent，就能把应急接口和裸奔的旧平台摸一遍。对做政务和急救系统的人，先检查对外接口要不要登录、老数据还在不在公网，比再买一个「反 AI」产品更要紧。
