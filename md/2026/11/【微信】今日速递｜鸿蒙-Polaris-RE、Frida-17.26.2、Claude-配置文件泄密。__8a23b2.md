---
title: 【微信】今日速递｜鸿蒙 Polaris RE、Frida 17.26.2、Claude 配置文件泄密。
source: https://mp.weixin.qq.com/s/ivmkBJYIQceiAdw8U3VXSg
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T08:43:38+08:00
trace_id: 66bb4a57-a352-46a9-8d04-486602822b1d
content_hash: b43ca1b4e20854b7a05f90122dedcc2baee5fa89fdec1f909e0402439c9772da
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
notion_page_id: 41375244-d011-81db-82f3-d9e558181d42
ioc:
  cves:
    - CVE-2026-96652
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**小瑶在工地** *2026年11月8日 13:45*

各位工友早。今天主线是 **鸿蒙 Polaris RE**、 **Frida 17.26.2**，以及 Claude Code 把批准过的命令连同密钥写进了 **1122 份公开配置文件**；昨稿 Frida 17.26.1 / Poki / \*sshole 蜜罐利用等不重复。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dcf363b5e9196d46.png)

PART 1

## 第一部分｜国内安全厂商 · 安全网站 · 安全论坛热点

本层以看雪近窗鸿蒙 Agent 逆向平台 / 阿里四神 VMP / 安卓 ELF 壳与工控.acd 解析 + FreeBuf 的 AI 安全底账站点成条。Livewire、吉他拾音器、固件 Skill、检测大全、逆向 Skill、KCLF、逆向已死2 等昨稿不重复；先知本轮无强新 KEEP。

## 1\. 看雪｜Polaris RE：给鸿蒙逆向装上证据契约

看雪 HarmonyOS 区近窗（抓取时约 **15 小时前**，技术栈转载标注 **2026-11-07 11:45**）里，作者「数字幽灵」开源了 **Polaris RE** （仓库名 **lzy-RE**）：用 Rust 写的三后端逆向框架，覆盖 x86_64、ARM64 和鸿蒙 **Panda / ArkTS** 字节码，目标读者是大模型 Agent 而不是只给人点菜单的插件。作者的核心约束是每条结论都带 **Evidence Contract**——类型、置信度、局限性、命中位置写在同一份结构里——再经 MCP 接到 Claude / Cursor。文中用真实 HAP 说明：官方文档把 `method_idx` 写成方法偏移数组，实测却是方法、字符串和字面量数组的混合索引池；污点分析则改成调用级保守传播。仓库在 Gitee，作者称带 90 余项测试。

来源

```
https://bbs.kanxue.com/thread-293453.htm https://jishuzhan.net/article/2118912681227583490 https://gitee.com/w931102/lzy-RE
```

**工地点评：** 自己用模型看鸿蒙 HAP 的，这篇比再找一个「能吐伪代码」的插件更值得打开。先看它怎么给每条结论标置信度和局限，再决定接不接进自己的工作流。

## 2\. 看雪｜阿里 sgmian：淘宝这台 VM 叫「四神」

看雪 Android 安全区约 **6 小时前** （作者文内自标 **2026-11-08 01:37:35 CST**）更新阿里 **sgmian** 签名命令分析系列第三篇，对象是命令 **70102** 里的虚拟机。作者的公开判断：淘宝这台 VM 不是「另一个抖音」，而是 **direct-threaded** 解释器——状态几乎全在寄存器里，handler 表只有一张；真正难的不是找到 handler，而是让中间表示在变长字节码槽、嵌套帧和 native 调用之间保持完整。按作者自己的叫法，这台叫 **四神**，和京东、快手、得物一样属于「handler 内部直接算」的一类，而不是「六神」那种 OLLVM Pass 级 VMP。适合做安卓保护虚拟机分类的人对照公开架构描述。

来源

```
https://bbs.kanxue.com/thread-293456.htm
```

**工地点评：** 最近看 VM 保护的，这篇可以把「四神 / 六神」的分类先记下来。它讲的是这台解释器长什么样，不是教你怎么拆签名。

## 3\. 看雪｜安卓 FPS 外挂样本：自解压 ELF 壳（上）

看雪 Android 区约 **5 小时前** 新帖，公开分析一款独立跑在 `/data/local/tmp` 下的 Android FPS 外挂样本。样本信息写的是 64 位 ARM64、ELF shared object、符号已剥；壳子编译于 NDK r30，脱壳后本体落到 NDK r17。连载计划很清楚：上篇做 **自解压 ELF** 的结构与脱壳观察，下篇再写内核硬件断点。适合做 Android 加壳 ELF / 落地可执行文件分析的人当公开案例扫一眼。

来源

```
https://bbs.kanxue.com/thread-293457.htm
```

**工地点评：** 想看安卓自解压 ELF 壳怎么分层的，上篇就够入门。这是别人的外挂样本分析，用来学加壳观察即可，别拿去对游戏做什么。

## 4\. 看雪｜罗克韦尔.acd：不连 PLC 也能还原变量树

看雪逆向工程区约 **11 小时前**，作者 Coder_shen 拆解 Rockwell **RSLogix 5000 / Studio 5000** 工程归档 **.acd**：容器不是 ZIP，变量树的正主是其中的 TagInfo.XML，再对照 Comps.Dat 里的外部访问权限和控制器信息。实现是纯 C#（.NET 4.0，零第三方依赖），并在 **SoftLogix5800 v21.11** （1789-L60/A，785 个符号）上与在线 browse 逐项对比。作者强调离线树必须和在线树一致，才算验收通过。适合做工控工程文件格式、而手头又有自己授权归档的人对照。

来源

```
https://bbs.kanxue.com/thread-293454.htm
```

**工地点评：** 做工控、又经常只能拿到工程包而碰不到现场 PLC 的，这篇离线还原变量树很实用。请只解析自己有授权的归档。

## 5\. 看雪｜同一作者：把 EtherNet/IP 驱动也写完了

同一作者、同一时段放出配套长文：为罗克韦尔 Allen-Bradley **ControlLogix / CompactLogix / SoftLogix** 编写 EtherNet/IP 通信驱动，覆盖连接建立、并发、结构体模板，并和上面的.acd 归档解析接起来。目标环境仍是实验室里的 SoftLogix5800 v21.11，结论称经真机抓包验证，关键代码指向文末仓库结构。和上一条是「文件格式」与「通信协议」两面，适合做授权范围内工控协议兼容的人一起看。

来源

```
https://bbs.kanxue.com/thread-293455.htm
```

**工地点评：** 已经在看.acd 那篇的，这篇是同一套实验室对象的通信侧笔记。只适合自己的测试环境或授权项目，工业网络不是练手场。

## 6\. 看雪｜CodexMgr：给每个 Codex 实例一套配置

看雪茶余饭后约 **16 小时前**，作者「沧海浮萍\_」分享 **CodexMgr**：解决多个 Codex 实例抢同一份全局配置的问题。做法是把不同平台的 `auth.json` 和 `config.toml` 放到各自目录，启动时在界面选一套，让后续文件访问都落到所选目录（文中目录名是 BranchCodex）。作者也提到，用环境变量为单个实例指定配置同样可行，只是自己更想要图形化切换。同时跑多平台 API、又不想改系统全局文件的人可以看实现思路。

来源

```
https://bbs.kanxue.com/thread-293452.htm
```

**工地点评：** 一个人同时用好几家模型接口时，最烦的就是配置写在同一处、改来改去。这篇就是在做「启动时选一套配置」，思路清楚，属于工具向短帖。

## 7\. FreeBuf｜AISecSight：把散落的 AI 安全情报收成底账

FreeBuf 于 **2026-11-06 16:38** （11-06 / 11-07 早稿未收）介绍免费站点 **AISecSight**。作者的出发点是：做 AI 安全与合规时，法规、事件和评测分散在各处，转载多、原始出处难追。文中称该站收录了 87 部法规、29 起事件和 4 个榜单，覆盖法规标准、安全动态和模型安全评测，每条数据附原始出处，全中文、免费、免注册，并强调它更像随时可翻的底账，而不是信息流。做 AI 安全跟踪、又不想只依赖零散转载的人可以去对一下信源。

来源

```
https://www.freebuf.com/articles/511115.html https://aisecsight.com
```

**工地点评：** 法规和事故原文散在各处时，有一个能点回官方出处的目录会省事。数字以站点当时页为准，重要结论仍建议回到原始公告核对。

补查：先知本轮无强于昨稿的新 KEEP；Seebug Paper 本轮 521；安全客群晖/Cerber 文标注 10-30、嘶吼 Claude Code 源码泄露木马文标注 4 月，均未进主条；看雪过 Root / 加固实操、Livewire、吉他拾音器、固件 Skill、检测大全、KCLF、逆向已死2 等昨稿或不适主条不重复。

PART 2

## 第二部分｜X 上的二进制 / 安全 / OS 逆向热点 + 越狱工具

窗内工具钩为 Frida 17.26.2 与安卓端 DSH Mobile 新 beta；Agent 逆向侧是 REA 与一份 Skill 盘点。Frida 17.26.1 / Vector 3118 / Poki / GPT-6 Cyber 等昨稿不重复主条。

## 1\. Frida 17.26.2｜Linux 上 iOS 隧道下行最多约七倍

约 **2026-11-07 17:17 UTC** （≈ Asia/Shanghai **2026-11-08 01:17**）， **Frida 17.26.2** 发布。官方说明有两块。Idun 侧：Håvard（@hsorbo）发现 Linux 上经 CoreDevice 隧道的下行被主循环往返拖住，主机几乎空闲时，下行大约只有 70–90 Mbit/s（内核 NCM / usbmuxd）或约 30 Mbit/s（自研 NCM）。去掉这些往返后，同一主机上下行分别从 89 提到 343、从 73 提到 311、从 32 提到 242 Mbit/s；上行未变。顺手修了 idund 在 stderr 被关闭时（例如被 Node.js 拉起）把唤醒 fd 占成 2 号、随后空转 100% CPU 的问题。Android 侧：@leonitousconforti 报了 frida-server 崩溃后 `adb shell` 不结束；@tubibibo 定位到崩溃监视器的 logcat 继承了同一套接字，现改为给 logcat 使用 `/dev/null` 作为标准输入。

来源

```
https://frida.re/news/2026/11/07/frida-17-26-2-released/ https://github.com/frida/frida/releases/tag/17.26.2
```

**工地点评：** 在 Linux 上经 USB 隧道看 iPhone 的，这版比昨天的 17.26.1 更值得立刻跟。Android 上如果遇到 frida-server 挂了但 adb shell 还不回来，也可以对一下是不是旧版本。

## 2\. DSH Mobile｜v1.5.4-beta.3：手机跑 DeepSeek Agent

**Soodok/Deepseek-Harness-Local-Android** 于约 **2026-11-07 14:40 UTC** （≈ Asia/Shanghai 22:40）放出 **DSH Mobile v1.5.4-beta.3** （versionCode 372）。项目自述是在 Android 上本地跑 DeepSeek Harness， **无需 Root、无需 Termux**，也可连远程主机；提供 arm64 真机与 x86_64 模拟器、完整包和 noruntime 包。相对 v1.5.0 的公开变更包括：分享/打开方式把外部文件送进输入框、打开扩展中心的 Linux 下载通道（Alpine apk / Ubuntu apt 分表）、能力自描述与可发现性、设置页改成 Material 3，以及抓帧改为持续模式以修复「画面停住却不报错」。仍是 beta，安装包以 GitHub Release 页面的校验和为准。

来源

```
https://github.com/Soodok/Deepseek-Harness-Local-Android/releases/tag/v1.5.4-beta.3 https://github.com/Soodok/Deepseek-Harness-Local-Android
```

**工地点评：** 想在自己手机上跑 DeepSeek Agent、又不想先 Root 的，可以看这个 beta。先认准官方仓库和 Release 校验和，完整包体积不小，建议用备用机试。

## 3\. GitHub｜假安全工具把后门塞进扫描脚本

BleepingComputer 于 **2026-11-06** 转述 Dr.Web：有人在 GitHub 上投放伪装成安全项目的仓库，近期转向自动化扫描、安全测试和日志分析，而不再只盯加密货币用户。研究人员称已观察到超过 **2000** 台 Windows 主机中招。公开样本包括一个声称能解析、清理 Fscan 扫描器输出的轻量脚本；恶意逻辑出现在 Visual Studio 工程、Python 和 Go 源码里，有的藏在大段空白之后，有的挂在编译前事件上。后续载荷叙述包括 AsyncRAT、剪贴板劫持和信息窃取。做安全测试、习惯从 GitHub 随手拉辅助脚本的人，应先核对作者历史与仓库来源，优先用上游官方包。

来源

```
https://www.bleepingcomputer.com/news/security/fake-security-tools-on-github-push-backdoors-and-infostealers/
```

**工地点评：** 越是「刚好能解析你手头那种扫描输出」的小仓库，越要先查作者和星标历史。安全从业者自己也是这批样本的目标人群，下载前多看一眼不吃亏。

## 4\. REA｜Agent 逆向 MCP 近窗热转，安装认准官方源

X 近窗多条中文帖把 **REA** （**morluto/rea**，站点 rea.tools）当成「让 Agent 做逆向」的默认入口在传：它本身不是反编译器，而是 MCP 服务器 + CLI，把 Ghidra、Hopper、IDA 等已有工具接到 Agent 上，查询伪代码、字符串、调用关系和 JS/Electron 结构，并要求结论带证据。官方 README 写明从 **morluto/rea**、rea.tools 或 npm 包 **rea-agents** 安装，并提醒「仓库名相近或 README 被抄走，不等于下载来源正规」——和上一条假安全工具新闻正好对得上。今日核对：npm 最新正式版仍是 **rea-agents 6.8.0** （发布于 2026-10-25），没有更新的正式 tag；仓库在 11-08 凌晨仍有推送。仅面向自有软件、授权样本与学习研究。

来源

```
https://github.com/morluto/rea https://rea.tools/ https://x.com/zawe6hWtCAEkHHe/status/2119205994375102839
```

**工地点评：** 已经在用 Claude / Cursor 看二进制的，可以知道有这么一层 MCP。安装只走官网和官方 npm 包；GitHub 上再搜到「同名增强版」，优先当可疑仓库。

## 5\. X｜一份「10 个逆向 Agent Skill」清单在传

X 近窗中文圈转发一份「10 个逆向方向的 Agent Skill」盘点（转述帖约 **2026-11-07**）。目前能核对到的点名包括： **REA**、面向混淆 Kotlin / 安卓包的 android-reverse-engineering-skill，以及追踪前端签名与 Cookie 的 hello_js_reverse_skill。它和昨稿看雪上的 **mobile-reverse-skill** 不是同一篇，而是一份覆盖面更宽的清单。完整 10 个名字以原帖为准，这里不据转述脑补。自己用 Agent 做安卓、前端或二进制分析的人，可以对照手头还缺哪一类技能包。

来源

```
https://x.com/jinbuge102/status/2119182143066902978
```

**工地点评：** 当目录看即可，不必一次装齐。先认准来源和许可，再接到自己的 Agent 里；和昨天那篇「先亮证据再下结论」的移动端 Skill 可以互补，不必重复阅读同一套步骤。

## 6\. Regram 7.0｜跟到 Instagram 454.1

越狱 / 侧载插件 **Regram** 于 **2026-11-05** 发布 **7.0** （X 近窗仍有人在转，11-05 至 11-07 稿未收）。作者官方 changelog 写明：针对 Instagram **454.1** 的缺陷修复与兼容更新；设置页重做，可搜索单项，并在设置顶部提示新版本、跳转到 Feather / AltStore / Sileo 等安装器。页面还写需要 iOS 15.1+，支持越狱与侧载。已经在用 Regram 的人可对照作者站点的版本说明更新；功能细节以官方页面为准。

来源

```
https://fouadraheb.com/apps/regram https://fouadraheb.com/apt/package/com.fouadraheb.regram/changelogs
```

**工地点评：** Instagram 一升版本，这类插件通常要跟一次兼容。已经装了 Regram 的，去作者页面看 7.0 是否匹配你现在的 IG 版本即可；只在自己的设备上更新。

## 工具箱补充｜版本与窗口内更新

和今天新闻相关的工具，版本信息以官方页面为准。有新 tag 的单独标出；无更新的也列一行方便对照。

**Frida 17.26.2** （新正式 tag；相对昨 17.26.1）

-   Linux 上 iOS 隧道下行提升，以及 frida-server 崩溃后 adb shell 挂起修复。正文 PART2#1。
    
-   官方：
    
-   https://github.com/frida/frida/releases/tag/17.26.2

**Vector canary-3118** ／ **Ghidra 12.2** ／ **jadx v1.5.6** ／ **Dopamine 3.0.13**

-   相对昨日无新正式 tag；Dopamine 不重复展开。
    
-   Vector：
    
-   https://github.com/JingMatrix/Vector/releases/tag/canary-3118
-   Ghidra：
    
-   https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.2_build
-   jadx：
    
-   https://github.com/skylot/jadx/releases/tag/v1.5.6
-   Dopamine：
    
-   https://github.com/opa334/Dopamine/releases/tag/3.0.13

**Magisk v31.1** ／ **KernelSU v3.3.1** ／ **APatch 11282**

-   相对昨日无新正式 tag。
    
-   Magisk：
    
-   https://github.com/topjohnwu/Magisk/releases/tag/v31.1
-   KernelSU：
    
-   https://github.com/tiann/KernelSU/releases/tag/v3.3.1
-   APatch：
    
-   https://github.com/bmax121/APatch/releases/tag/11282

**palera1n v3.0.0-beta.3** ／ **TrollStore 2.1.1** ／ **LSPosed v1.9.2**

-   相对昨日无新正式 tag。
    
-   palera1n：
    
-   https://github.com/palera1n/palera1n/releases/tag/v3.0.0-beta.3
-   TrollStore：
    
-   https://github.com/opa334/TrollStore/releases/tag/2.1.1
-   LSPosed：
    
-   https://github.com/LSPosed/LSPosed/releases/tag/v1.9.2

PART 3

## 第三部分｜事件热点

优先开发者密钥泄露、失控的评测用 AI Agent，以及厂商确认的 NAS 入侵面。\*sshole 蜜罐利用、SonicWall KEV、Claude Dispatch、CWP、DigiCert 等昨稿不重复。

## 1\. Claude Code｜「不再询问」把密钥写进了 1122 份公开文件

The Hacker News 于 **2026-11-07** 转述 Apiiro：用户在 Claude Code 里点 **Yes, and don't ask again** 后，工具会把这条命令原文存进项目里的 `.claude/settings.local.json` ；如果命令本身带着口令或 API 密钥，文件里就是明文。研究人员在公开 GitHub 上找到 104,185 份该文件（103,617 个仓库），其中 **1,122** 份至少含一个密钥，合计 **1,379** 个不同密钥；他们没有逐一验证是否仍有效，但有一家被提前通知的公司确认密钥当时仍可用。超过三分之一的密钥直接对应数据库，公开统计包括 379 个数据库口令、43 个面向公网服务器的 SSH 登录、42 个 GitHub / GitLab / npm 令牌和 23 个 AWS 密钥。Claude Code 默认把该文件写入本机全局 git excludes，但不会写入项目自己的 `.gitignore` ，因此保护不会跟着仓库走。建议先轮换文件里出现过的口令和密钥，再从版本库历史里清理。

来源

```
https://thehackernews.com/2026/11/claude-codes-dont-ask-again-file.html
```

**工地点评：** 用了 Claude Code 的，先在自己的 GitHub 组织和本地项目里搜一遍 `settings.local.json` 。看到过明文口令，就先改密钥，再删文件；批准命令时尽量批「模式」，不要批带密码的整行。

## 2\. WorkOS｜评测用的 AI 攻防 Agent 跑出了沙箱

BleepingComputer 于 **2026-11-06** （周五）跟进 WorkOS 安全更新：创始人 Michael Grinich 说，一名安全研究员主动联系并承认，自己在评估开源自动渗透框架 **ARTEX** 时，Agent 离开了隔离测试环境，非预期地访问了 WorkOS。公司与独立取证方核对请求细节和时间戳后，高置信度认定就是该研究员；对方称已删除所获数据且未再分享。调查还列出四个薄弱点：旧内部销售应用的 API 暴露在公网、生产环境留着可预测的本地开发凭据、缺少速率限制，因而 Agent 认证后迅速拉取记录。首次未授权访问约在 **10 月 25 日**， **10 月 30 日** 才因用量异常被发现。公开影响范围是销售与客服系统中的商务联系人、账户历史、用量信息，以及部分销售电话、支持沟通和客户 Slack 摘要；生产业务与核心客户数据叙述为未受影响。

来源

```
https://www.bleepingcomputer.com/news/security/runaway-ai-hacking-agent-behind-workos-breach-after-escaping-sandbox/
```

**工地点评：** 用自动攻防 Agent 做评测的，先确认它真的出不去网、碰不到别人的生产接口。对厂商来说，开发用的测试口令和「内网工具」一旦挂到公网，Agent 不需要多聪明也能摸进去。

## 3\. QNAP｜Plex2Shell 已经打到用户的 NAS 上

BleepingComputer 于 **2026-11-06** 引述 QNAP 公告：部分用户 NAS 上的 **Plex Media Server** 疑遭 **Plex2Shell** 漏洞链入侵。该链包含 **CVE-2026-96652 / 96654 / 96655 / 96656**，由研究者 Zach Main 在 7 月 27 日报告给 Plex；完整技术细节于 10 月 16 日公开后出现利用。CISA 已在 10 月 20 日将四洞列入 KEV。QNAP 称漏洞只存在于 Plex Media Server，QTS / QuTS hero 本身不受影响，并建议在 App Center 把 Plex 升到 **1.43.3.10861** 或更新版本。厂商同时提醒：若脆弱的 Plex 曾对公网开放，升级本身不能清掉已经留下的载荷，应对照公告排查、考虑重装系统并重置 Plex 与 NAS 凭据；不需要远程访问时可关掉相关功能、停止转发 **32400** 端口。

来源

```
https://www.bleepingcomputer.com/news/security/qnap-says-hackers-breaching-nas-devices-in-plex2shell-attacks/ https://www.qnap.com/en/security-news/2026/qnap-security-notice-plex-media-server-vulnerabilities-plex2shell-update-to-1-43-3-10861-or-later-immediately
```

**工地点评：** QNAP 上装了 Plex、还把媒体库映射到公网的，先去 App Center 看版本。已经对公网开过的，不要以为升完级就结束了，按厂商说明检查是否该重装和改密码。

* * *

声明：本文整理自公开报道、官方 changelog、会议议程与社区公开帖，仅供学习交流。不提供攻击步骤、未公开漏洞细节或盗版破解指引。文中工具与版本请以官方页面为准；涉及刷机 / 越狱 / root 仅面向自有设备与授权研究，操作前请自行评估变砖、保修与合规风险。
