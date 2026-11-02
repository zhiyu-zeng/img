---
title: "【微信】LogsTotal: 从 EVTX 到 ATT&CK 图谱的自部署分析平台"
source: https://mp.weixin.qq.com/s/N781XK9jmU2jGywwo9Um_w
source_host: mp.weixin.qq.com
clip_date: 2026-11-03T05:21:10+08:00
trace_id: 1a6005eb-15c8-4380-b3ce-218f79b37924
content_hash: 6e86a2f54e6c556b48df7abd895f31394f3dd6be5da455168e89131aa14eab7a
status: synced
tags:
  - 微信
  - 安全工具
  - Sigma规则
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: LogsTotal 将 Hayabusa、Chainsaw 等五个 Sigma 引擎编排进一个自部署 Web 平台，把日志检测结果汇总成 ATT&CK 热图与调查案件，但它不是新检测引擎，也不是 SIEM。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 40c75244-d011-8147-bcd4-c4d0b9ca5de3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> LogsTotal 将 Hayabusa、Chainsaw 等五个 Sigma 引擎编排进一个自部署 Web 平台，把日志检测结果汇总成 ATT&CK 热图与调查案件，但它不是新检测引擎，也不是 SIEM。
> 
> - **核心机制：** 由 Zircolite 作者 wagga40 开发（MIT 协议，v1.2.2），`./logstotal quickstart` 一键部署 Web+Worker+Redis；按日志类型分流工作流——Windows 默认跑 4 个引擎，Linux syslog 只跑 ChopChopGo，journald 只跑 Zircolite。
> 
> - **检测分易误读：** "4/4" 仅表示“有命中的引擎数÷运行引擎数”，不是独立交叉验证。实测 68KB 的 bitsadmin.evtx 得 4/4，但四条 Medium 中三条共用同一 SigmaHQ 规则；Hayabusa 的规则 ID 与其他引擎不同（靠 `related` 字段关联），按 rule_id 写去重脚本会误判。Chainsaw 另有 296 条规则无法加载，各引擎实际规则集并不一致。
> 
> - **Linux 侧边界：** syslog 入侵样本命中 13 次，覆盖 Shellshock、反弹 Shell、持久化等，但 ChopChopGo 偏关键词匹配，漏掉 useradd UID=0 和 /dev/tcp C2 两条已知恶意行；journald 的 45 次命中中 27 次来自一条 Low 广谱规则，命中数不等于威胁数。
> 
> - **上下文与 AI：** 提供 ATT&CK 热图、进程树、实体提取、案件关系图与 STIX/MISP 导出；实测三个 job 汇出 16 个实体、聚成 2 个簇，平台只做共现呈现、不自动关联攻击链。AI 分析只发送裁剪简报（findings+实体+最多 3 条样本）而非原始日志，实测仍把惰性测试文件过度解读为“数据外传”。
> 
> - **安全与适用边界：** 默认匿名可上传、无实例级私有开关，Worker 挂载宿主机 Docker socket 相当于 root 级风险，无多租户；适合蓝队单次日志分流、规则验证与教学，不适合实时 SIEM 场景；公网部署须把边界做在应用外（VPN/反代认证）。

**赛博57库** *2026年11月3日 05:00*

![cover](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2eef97330ce87a4e.jpg)

栏目 · 深度科普 · 威胁情报 / 取证应急

多引擎 Sigma · 自部署 · 证据链 · 案件图谱

一个 68KB 的 `bitsadmin.evtx` ，里面只有 1 条 Sysmon 进程创建事件。

上传到 LogsTotal 后，四个引擎都报了东西：Hayabusa 2 条、Chainsaw 1 条、Zircolite 1 条、RSigma 1 条。页面顶部给出一个很醒目的分数： **4/4**。

这就是 LogsTotal 最直观的价值，也是最容易被误读的地方。它把多个 Sigma 引擎放进同一个 Web 界面，让同一份日志被反复检查，再把结果摆到一张桌子上。但它不是一个“新引擎”，也不是“装了就有人帮你守夜”的 SIEM。

先把三个词说清楚：

• **EVTX**：Windows 事件日志的二进制格式，Sysmon、Security、System 等通道都在里面。

• **Sigma**：一种厂商无关的检测规则写法，用 YAML 描述“什么日志字段出现什么组合，就算命中”。

• **引擎**：真正读取日志、解释 Sigma 规则、输出命中的程序。Chainsaw、Hayabusa、Zircolite、ChopChopGo、RSigma 都是这类工具。

LogsTotal 做的事，是 **编排这些引擎，并把结果整理成一份能继续调查的报告**。

## 01 · 它是什么：五个引擎，一个 Web 界面

LogsTotal 由 Zircolite 的作者 wagga40 开发，2026 年 9 月 27 日发布首个版本，本文测试的是 2026 年 11 月 1 日的 **v1.2.2**。MIT 协议，代码在 GitHub 上，目前 **24 stars / 4 forks**，两位贡献者。

它不发明检测引擎。它把下面五个工具打包进同一个分析流程：

|     |     |     |
| --- | --- | --- |
| 引擎  | 主要场景 | 本次实测规则规模 |
| Hayabusa | Windows EVTX，基于 Sigma 和 Hayabusa 规则 | 4,674 |
| Chainsaw | Windows EVTX，Sigma + Chainsaw 内置规则 | 3,630（另有 296 条该引擎无法加载） |
| Zircolite | Windows EVTX、Linux auditd / Sysmon / journald | 4,535 |
| ChopChopGo | Linux syslog、auditd | 22 条内置规则（仓库文件数） |
| RSigma | Windows EVTX，Rust 实现的 Sigma 引擎 | 2,539 |

这些数字来自本次平台页面，不是 README 里的宣传值。它们说明一件很重要的事： **同一个“Sigma 引擎”标签下，各工具实际加载的规则集并不一样**。后面会看到，这直接影响“命中”和“没命中”的含义。

LogsTotal 的输入输出可以概括成一张表：

|     |     |
| --- | --- |
| 层面  | 它提供什么 |
| 输入  | EVTX、Windows Event XML、Winlogbeat / EVTX JSON、Sysmon for Linux、auditd、syslog、journald；自动识别类型 |
| 检测  | 按日志类型选择工作流，调用一个或多个引擎跑 Sigma 规则 |
| 报告  | 按严重度分组的 findings、规则原文、命中事件样本、ATT&CK 战术热图、活动时间线 |
| 上下文 | 实体提取（用户、主机、IP、哈希、进程、服务、计划任务）、进程树 |
| 调查  | 调查案件（case）、实体关系图、标签、评论、关注 |
| 输出  | findings JSON、analysis JSON、ATT&CK Layer、GraphML、IOC、STIX、MISP、TAXII、Webhook |
| 可选  | AI 分析：把裁剪后的 findings 简报发给本地或托管模型 |

它 **不是** 什么，也要先讲清楚：

• 不是 SIEM：不接实时流量，不做长期日志留存，不做告警值班。

• 不是漏洞扫描器：它不判断“主机有没有 CVE”，只回答“这份日志里有没有命中规则的行为”。

• 不是 SaaS：默认自己部署，日志留在自己的服务器上；只有启用托管 AI 时，才会把证据简报发出去。

• 不是“多引擎一致就自动定性”：检测分只统计“有几个引擎有命中”，不判断它们命中得对不对。

![一份日志在 LogsTotal 里经过什么](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9070ee72af56012a.jpg)

一份日志在 LogsTotal 里经过什么

▲ 图 1：上传、识别类型、按工作流跑引擎、归一化结果，再进入 ATT&CK、实体、案件和导出。

### 它是怎么跑起来的

默认部署是 Docker Compose：一个 Web 容器、一个 Worker 容器、一个 Redis。数据库默认 SQLite，也可以切 PostgreSQL。Worker 负责真正调用引擎；Zircolite 以容器方式运行，所以 Worker 默认挂载宿主机的 Docker socket。

上传后，任务进入队列。页面会轮询状态，每个引擎跑完就落一份结果，不用等最慢的那个。本次 Windows 样本里，Zircolite 用了 5.4 秒，其余三个都在 2 秒左右；四个引擎各自计时，是否并行由管理员的 `parallel_execution` 设置决定。

这套结构的好处是简单：一条 `./logstotal quickstart` 就能把 Web、Worker、Redis、管理员账号和密钥全部准备好。代价也在这里：它假设你有一台能跑 Docker 的 Linux 主机，并且愿意自己管升级、备份和边界。

## 02 · 能做什么：一条从日志到案件的流水线

把功能拆开看，LogsTotal 的核心不是“五个引擎”这个数字，而是它把下面几件事串成了一条线。

**第一段：把日志变成 findings。**

上传后，平台先识别日志类型，再列出兼容的工作流。Windows 默认工作流叫 `Windows Full Analysis` ，实际跑四个引擎：Hayabusa、Chainsaw、Zircolite、RSigma。Linux syslog 走 `Linux Syslog Analysis` ，只跑 ChopChopGo；journald 走 `Linux Journald Analysis` ，只跑 Zircolite；auditd 和 Sysmon for Linux 也各有自己的工作流。

每个 finding 保存：引擎名、规则名、规则 ID、严重度、命中次数、标签、规则原文、若干条命中事件。severity 来自规则作者，不是平台根据你的环境重新判定。平台也记录引擎版本、规则 SHA-256、规则 revision 和配置指纹，这些信息在 `analysis.json` 里还能拿到，方便复现“当时到底用哪套规则跑的”。

**第二段：把 findings 变成上下文。**

• **ATT&CK 热图**：把命中规则映射到战术，按 kill chain 顺序排列。

• **活动直方图**：按小时统计命中，按战术堆叠。

• **事件时间线**：把告警放到可缩放的时间轴上，时间统一到 UTC。

• **实体提取**：用户、主机、IP、哈希、可执行文件、命令行文件、服务、计划任务。

• **进程树**：从进程创建事件重建父子链，命中的节点标 HIT。

• **相似文件**：用 TLSH 找结构相近的上传，适合发现同一传感器、同一批导出或变种。

**第三段：把上下文变成调查材料。**

多个 job 可以放进一个 case；case 有摘要、严重度、时间线、实体列表、关系图、讨论区。关系图支持按类型、严重度、战术、verdict 着色，支持聚类、路径查找、GraphML 导出。再往外，是 IOC 包、STIX 2.1、MISP、TAXII 和 Webhook。

**第四段：可选 AI。**

AI Analysis 默认关闭。管理员先在 `/admin/ai` 加一个 OpenAI 兼容或 Anthropic 端点，再在设置里打开标签页。成员点一次按钮，平台把当前 job 的 findings、实体和最多三条样本事件裁剪成一份简报，发给模型，生成 Verdict、Key Findings、Likely False Positives、Recommended Next Steps。

它发的是简报，不是原始日志。这个区别很重要，后面会单独说。

## 03 · 怎么验证：一台 2 核 7.7GB 的 Ubuntu

本次测试环境：

• Ubuntu 24.04.5 LTS，2 vCPU，7.7GB 内存

• Docker 29.5.2，Docker Compose v5.1.4

• Python 3.12.3（只用于辅助脚本）

• LogsTotal v1.2.2，SQLite 默认库

部署命令就是官方那条：

./logstotal quickstart

它会创建 `.env` 、生成管理员密码、构建镜像、跑部署检查、启动 Web + Worker + Redis，然后等 `/health` 返回。本次镜像约 **655MB**，容器启动后大约 **20 秒** 健康检查通过。构建阶段本机访问 Debian 源不稳定，临时换了一个镜像源；这只影响构建速度，没有改应用逻辑。

上传页会把识别出的日志类型、可选工作流和文件大小放在同一行。类型识别错了可以手动改；工作流只列出与类型兼容的项。确认后点 Analyze，单文件会自动跳到 job 页面。

![上传页：识别类型并选择工作流](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c43cea09e8b4099a.jpg)

上传页：识别类型并选择工作流

▲ 图 2：上传 `syslog_intrusion.log` 后自动识别为 Syslog，工作流只保留 Linux Syslog Analysis。

测试样本全部来自项目仓库：

• `samples/windows/bitsadmin.evtx` ：一条 Sysmon 进程创建，命令行是 `bitsadmin /transfer ...`

• `samples/linux/syslog_intrusion.log` ：一条从 Shellshock 到反弹 Shell、提权、持久化、清日志的入侵时间线

• `samples/linux/syslog_benign.log` ：正常 cron、logrotate、nginx、postfix 流量

• `samples/linux/journald_sample.json` ： `journalctl -o json` 导出，里面是惰性的攻击形状命令

方法很简单：一次只传一个文件，用平台自动识别的工作流，不改规则、不加 `extra_args` ，记录页面上的引擎版本、加载规则数、命中规则数、命中次数和耗时。截图也来自这次实际运行。

需要说明的是，这些样本是项目为测试准备的，攻击地址是文档保留段，命令是惰性的。它们适合验证“平台能不能把已知行为跑出来”，不等于对真实入侵的检出率。

## 04 · Windows 实测：4/4 是怎么来的

先看结果。

|     |     |     |     |
| --- | --- | --- | --- |
| 引擎（版本） | 加载规则 | 命中规则 / 命中数 | 耗时  |
| Hayabusa v4.2.0 | 4,674 | 2 / 2 | 2.07s |
| Chainsaw v2.17.1 | 3,630（296 条未加载） | 1 / 1 | 1.98s |
| Zircolite 4.7.0 | 4,535 | 1 / 1 | 5.4s |
| RSigma v0.25.0 | 2,539 | 1 / 1 | 1.22s |

页面顶部的检测分是 **4/4**，下面按严重度汇总： **Medium 4 条规则、4 次命中；Info 1 条规则、1 次命中**。总共 5 条结果。

![Windows 样本的 job 页面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bece4d020bda4c43.jpg)

Windows 样本的 job 页面

▲ 图 3：一份 68KB 的 EVTX，四个引擎全部有命中，检测分 4/4；每个引擎的耗时和“Analysis details”都在同一屏。

四条 Medium 都是 Bitsadmin 下载行为，分别来自四个引擎；多出来的一条 Info 是 Hayabusa 的 `Proc Exec` ，它只是记录“这个进程执行了”，不是恶意判断。

![四条 Medium 规则](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b5aed2ecc4fcdaa9.jpg)

四条 Medium 规则

▲ 图 4：同一个行为被四个引擎各报一次；Hayabusa 的规则 ID 与另外三个不同，但标题相同。

### 4/4 到底代表什么

平台的实现很直接：有命中的引擎数 / 实际运行的引擎数。四个引擎都至少有一条命中，所以是 4/4。

它 **不** 代表：

• 四条规则都指向同一个攻击行为；

• 四个引擎独立验证了同一个结论；

• 这个文件一定恶意；

• 这个文件一定干净（0/4 也不代表干净）。

这次四条 Medium 确实都指向 Bitsadmin 下载，但其中三条用的是同一个 SigmaHQ 规则，另外一条是 Hayabusa 自己规则集里的版本。它们不是四个独立情报源，而是同一套社区规则在不同引擎里的不同实现。

### 一个容易踩的坑：同一条规则，ID 可能不同

Chainsaw、Zircolite、RSigma 报出的 Bitsadmin 规则 ID 都是：

d059842b-6b9d-4ed1-b5c3-5b89143c6ede

Hayabusa 报出的 ID 是：

aa2cada8-3bc0-05b3-e38c-0cc5c53d019c

它的规则文件里用 `related` 字段保留了上面的原 ID。也就是说， **同一条 Sigma 规则在不同引擎的规则分发里可能被重新编号**。如果你写脚本按 `rule_id` 做跨引擎去重，就会把同一条规则当成两条；如果你按标题精确匹配，Zircolite 的标题又多了一个 `- Sysmon` 后缀，仍然对不上。

更稳的做法是：先按“行为”对齐，再按规则 ID 和标题做辅助校验。比如这次四条都指向 `bitsadmin /transfer` ，事件里的命令行、进程、父进程、哈希都一致，这比“ID 相同”更有意义。

### 规则加载数也不是越多越好

Chainsaw 页面明确写了：加载 3,630 条，另有 **296 条该引擎无法加载**。这不是错误，是引擎对 Sigma 特性的支持差异。它意味着：

• 同一份日志，换一个引擎，可能多出或少掉一批规则；

• “0 命中”只说明“这个引擎、这套规则、这次运行没命中”，不说明日志干净；

• 比较引擎时，要先看它加载了多少规则、哪些规则被跳过，再看命中。

平台把 engine version、rules SHA-256、rules revision 都放在 Analysis details 里， `analysis.json` 也会保存。这一点做得比很多“只给一个结果列表”的工具扎实：至少你能回到当时那套规则。

## 05 · Linux 实测：syslog 和 journald 是两条链路

Linux 侧不能用 Windows 工作流硬套。LogsTotal 把 syslog、auditd、journald、Sysmon for Linux 分开处理，每个类型有独立的工作流和引擎。

|     |     |     |     |     |
| --- | --- | --- | --- | --- |
| 样本  | 工作流 / 引擎 | 规则 / 命中 | 严重度分布 | 耗时  |
| `syslog_intrusion.log` | Linux Syslog / ChopChopGo | 10 / 13 | High 9、Medium 3、Low 1 | 0.04s |
| `syslog_benign.log` | Linux Syslog / ChopChopGo | 0 / 0 | —   | 0.18s |
| `journald_sample.json` | Linux Journald / Zircolite | 7 / 45 | Critical 8、Medium 1、Low 31、Info 5 | 2.74s |

### syslog：有命中，也有已知漏报

入侵样本的 13 条命中覆盖了 Shellshock、反弹 Shell、crontab 修改、 `ld.so.preload` 注入、 `/etc/passwd` 符号链接、 `scp` 外传、清空 history、删除 syslog 等行为。正常样本 0 条命中，作为基线是合格的。

但项目自己的样本说明里写得很清楚：这份 syslog 里还有两条恶意行没有被 ChopChopGo 命中——一条是 `useradd` 创建 UID=0 用户，需要 `all of selection_*` 条件；另一条是备用的 `/dev/tcp` C2。原因是 ChopChopGo 的 syslog 引擎更偏关键词匹配，不会完整解释每一条 Sigma 条件。

这正好说明“多引擎”不是万能药： **引擎的规则解释能力本身有边界**。如果只跑一个 syslog 引擎，这两条就会漏掉；如果换成能完整解释 Sigma 的引擎，又可能带来另一批误报。

### journald：45 条命中，但别被数字吓到

`journald_sample.json` 跑出 7 条规则、45 次命中。分布是：

• Critical 8： `Linux Reverse Shell Indicator`

• Medium 1： `Execution Of Script Located In Potentially Suspicious Directory`

• Low 31： `Local System Accounts Discovery - Linux` 27 条、 `Crontab Enumeration` 2 条、 `Bash Interactive Shell` 2 条

• Info 5： `System Information Discovery` 1 条、 `System Network Discovery` 4 条

45 这个数字听起来很大，但其中 27 条来自一条低严重度的“本地账户发现”规则，属于广谱行为。真正需要先看的是 8 条 Critical 反弹 Shell，以及 Medium 的脚本执行。 **规则命中数量不等于威胁数量**，严重度分布比总数更有用。

journald 还有一个技术细节：Zircolite 原本的 Linux 规则集主要按 Sysmon/auditd 字段名写，journald 的字段是 `_CMDLINE` 、 `_EXE` 、 `_COMM` 。LogsTotal 通过一个字段别名配置，让同一套规则能读到 journald 的字段。项目文档也承认，这种覆盖“good-not-complete”：父进程、哈希、网络五元组这些 journald 导出里没有的字段，规则仍然无法匹配。

所以 Linux 侧的 1/1 也要正确读：它不是“一个引擎一致同意”，而是“这个工作流只有一个引擎在跑”。

## 06 · 从报告到图谱：多引擎之外的部分

单看 findings 列表，LogsTotal 和直接跑 Chainsaw 的差别没有那么大。真正拉开差距的是后面的上下文。

### ATT&CK、时间线、进程树

Bitsadmin 样本的 ATT&CK 热图给出 Execution 3、Persistence 3、Command and Control 3；时间线只有 5 个 marker；进程树只有 `bitsadmin.exe` 一个 HIT 节点。样本太小，这些面板看起来不惊艳，但结构是对的：你可以从一条规则跳到它对应的战术，再跳到同一时间窗内的其他命中。

![案件关系图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1b9c0be3389b13f5.jpg)

▲ 图 5：把 Windows、syslog、journald 三个 job 放进同一个 case，关系图自动分成两个簇；Windows 侧和 Linux 侧没有共享实体，所以没有连在一起。

### 案件：把三个 job 放在一张桌子上

我把三个样本 job 加进同一个 case，平台汇总出 **22 条规则、63 次事件**，提取 **16 个实体**；关系图显示 **13/16 个节点、55/67 条边**，聚成 2 个簇。

这个结果很能说明问题：Windows 的 `swachchhanda` / `bitsadmin.exe` 和 Linux 的 `web01` / `bash` / `curl` 没有共享实体，所以图上分成两个簇。平台不会凭空把它们“关联”成一条攻击链；它只是把同源证据放到一个画布上，让你自己判断。

关系图默认隐藏 “Same job” 边，因为同一份日志里出现的任何东西都会连在一起，反而淹没结构。这个设计是对的： **共现不等于关系**。

### 导出与 API

• `findings.json` ：每条 finding 的引擎、规则、severity、count、tags、样本事件。

• `analysis.json` ：schema version、输入 SHA-256、工作流、每个引擎的版本/规则哈希/revision、完成诊断。

• ATT&CK Layer：可以导入 ATT&CK Navigator。

• GraphML：关系图导出。

• IOC / STIX 2.1 / MISP / TAXII：把实体和案件交给下游。

• Webhook / API Token：脚本化提交、状态轮询、案件创建。

这些接口不算“核心检测能力”，但它们决定了一个平台能不能嵌进现有流程。比如 `analysis.json` 里的规则哈希，就能回答“这次结果是用哪套规则跑出来的”，比只存一个 `rule_name` 有用得多。

### AI 分析：有用，但别把它当第二双眼睛

我配置了一个 OpenRouter 的 DeepSeek Chat 端点，对 Bitsadmin job 跑了一次 AI 分析。平台生成的简报是 **3,568 字符**，模型用了 **111 秒**，输入 **2,164 tokens**、输出 **718 tokens**。

输出结构是完整的：Verdict、Key Findings、Likely False Positives、Recommended Next Steps。它正确指出 `Proc Exec` 是信息级、可能良性；也给出了查哈希、看父进程、隔离主机这些下一步。

但它同时把 `hello.html` 说成 “Data Staging & Exfiltration” 的迹象。实际上那只是 Atomic Red Team 测试里的一个下载文件名，样本本身是惰性的。模型没有原始日志，只看到简报，它把“下载”这个动作往最坏的方向解释了。

![AI 分析结果](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/55027fd5bd23a561.jpg)

▲ 图 6：AI 分析只收到裁剪后的 findings 简报，不接收原始日志；输出可读，但仍可能把测试行为过度解释。

这件事的价值不在于“AI 会不会犯错”，而在于 LogsTotal 的设计把边界摆在了明面上：

• 默认关闭，管理员显式配置 provider 和开关；

• 只发 findings、实体和最多三条样本事件，不发原始日志；

• system prompt 明确把日志内容当作不可信数据，要求模型报告 prompt injection；

• 输出按 Markdown 渲染并转义，不让模型回复变成页面脚本；

• 托管 provider 意味着数据出境，本地 Ollama / LM Studio / vLLM 才是敏感日志的默认选择。

我的建议是：把它当“写第一版 triage 摘要的实习生”，不要当“可以签字的分析结论”。它省的是整理时间，不是判断责任。

## 07 · 边界：哪些能做，哪些别指望

LogsTotal 的能力边界，比它的功能列表更值得先看。

|     |     |
| --- | --- |
| 适合  | 不适合 |
| 蓝队 / IR 团队做单次日志快速分流 | 需要实时接入、长期留存、值班告警的 SIEM |
| 教学、规则验证、引擎对比 | 多租户 MSSP、按客户隔离的托管平台 |
| 单团队内部部署，数据不出网 | 需要 LDAP / SAML / OIDC 的企业统一身份 |
| 把多引擎结果收进一个 case 做复盘 | 超大规模、跨主机的持续关联分析 |

几个必须知道的限制：

• **没有实时采集**：文件是“提交”的，不是“收集”的；没有 watched directory，也没有定时任务。

• **没有真正的跨文件关联**：只有 TLSH 相似度和共享规则签名；case 的关系图是把多个 job 的实体放在一起，不是自动攻击链重建。

• **没有多租户**：角色是实例级的，没有组织或团队边界； `private` 只隐藏一个 job，不隐藏从它提取的实体。

• **没有移动端**：视口固定在 1024px 以上，窄屏是横向滚动，不是响应式重排。

• **SQLite 默认单写**：单机小团队够用，多 worker 或多人并发要上 PostgreSQL。

• **项目很年轻**：5 周、92 次提交、2 位贡献者、24 stars；代码和测试量不小，但真实环境的战斗验证还少。

安全边界也要单独说，因为这东西很容易被“自部署”三个字误导：

• 默认 **匿名可上传、公开结果可读**；应用内没有一个开关能让整个实例变成私有。

• `demo_mode` 只挡上传，不挡读取； `private` 只隐藏 job，不隐藏实体；实体列表是全实例共享的。

• Worker 默认挂载宿主机的 Docker socket；能改工作流的人，实质上能在 worker 主机上拿到 root 级能力。

• 没有多租户；不要把不同客户、不同密级的日志塞进同一个实例。

• 托管 AI 会把 findings、实体、样本事件发到第三方；敏感日志要么用本地模型，要么别开。

所以，公网部署的正确姿势不是“改个密码”，而是： **放在 VPN / 内网 / 反代认证后面，把边界做在应用外面**。如果要给外部演示，用 `demo_mode` 加只读网络，不要直接暴露上传口。

另外，本次测试中，无命中的 job 页控制台出现过 `analysisOpen is not defined` 的前端报错；页面仍能显示 0/1 结果，不影响检测。这类小问题不影响结论，但说明项目还在快速迭代，生产使用要留出升级和回滚的余量。

## 08 · 结论：它补的是哪块拼图

LogsTotal 不是“更强的检测引擎”，也不是“开箱即用的 SOC”。它补的是一块很具体的拼图：

**当你有多个引擎、多个日志格式、多个 job，需要一个地方把它们放在一起看时，它比手工跑命令行省事。**

它适合这样的团队：

• 已经有 Chainsaw / Hayabusa / Zircolite 的使用经验，但结果散落在不同终端；

• 需要把 Windows EVTX 和 Linux syslog / journald 放进同一个案件；

• 想要一个可自部署、能导出 STIX / MISP、能让 AI 读简报的轻量平台；

• 接受它年轻、边界多、需要自己管安全。

它不适合这样的团队：

• 需要实时 SIEM、长期留存、多租户隔离；

• 不愿意维护 Docker 主机和升级；

• 把“4/4”当成“四个独立证据”；

• 把 AI 输出直接当结论。

如果你要试，建议按这个顺序：

1\. 用仓库自带的四个样本跑通，确认引擎、工作流、结果都符合预期；

2\. 拿一份你熟悉的真实 EVTX，和现有工具做对照，重点看“谁漏了、谁多报了”；

3\. 再决定要不要放进内网、要不要开 AI、要不要接 case 和导出；

4\. 公网部署前，先做网络边界、保留策略、Docker socket 和备份这四件事。

## 09 · 留言区：你平时有哪些好用的工具可以推荐下吗？

欢迎在留言区推荐你喜欢的工具。最有用的留言不是“某工具好用”，而是 **什么场景 + 哪个功能 + 踩过什么坑**。我会挑一些有代表性的场景，后续做成实测或对比。

技术内容仅供学习与研究，请勿用于非法用途。

技术内容仅供学习与研究，请勿用于非法用途。

赛博57库 · 2026-11-03
