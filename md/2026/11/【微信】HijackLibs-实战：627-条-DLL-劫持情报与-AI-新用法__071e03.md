---
title: 【微信】HijackLibs 实战：627 条 DLL 劫持情报与 AI 新用法
source: https://mp.weixin.qq.com/s/T_lpNd7osf9oQK09BE8K2A
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T06:01:53+08:00
trace_id: 5f1af788-b540-476f-8aa7-48a262a1260c
content_hash: 1b1e5bf0510b85fa6acbc7626ad9733e28480ad3bc9d3deaa85f2e636a11d1c4
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: TL;DR：HijackLibs 收录 627 条公开披露的 DLL 劫持候选（2,403 个 EXE 组合），其价值在"合法程序+异常路径"的配对关系，而非可直接利用的漏洞或能直接上线的检测规则。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 40b75244-d011-8190-9822-d37e0fb287d1
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：HijackLibs 收录 627 条公开披露的 DLL 劫持候选（2,403 个 EXE 组合），其价值在"合法程序+异常路径"的配对关系，而非可直接利用的漏洞或能直接上线的检测规则。
> 
> - **核心数据：** 截至 2026-11-01，站点含 627 条目、2,403 个 EXE 组合、117 个厂商，分侧加载（1,907）、环境变量（459）、幻影（20）、搜索顺序（17）四类；配套 Sigma feed 合计 1,678 条规则。
> - **实战案例：** Bumblebee 借签名 consent.exe 加载同目录 msimg32.dll 入侵，约 44 小时演变为 Akira 勒索并外传 75GB；FudCrypt 已把侧加载做成 800–2,000 美元/月的商品化服务，其 20 个载体发布时均未被 HijackLibs 收录，体现知识库"追着攻击者跑"的滞后性。
> - **红队方法：** 正确顺序是先盘点目标软件版本与路径，再按 Vendor/EXE 名回库筛配对；优先级为"预期位置在用户可写目录 > AutoElevate > 签名/版本匹配"，且必须在主机上验证文件存在、签名与实际加载行为。
> - **蓝队要点：** 自动生成的 Sigma 有三大缺陷——不绑宿主 EXE、不校验签名/版本/Condition、签名字段位置与布尔语义错误；可靠检测需"宿主+DLL+路径"三件套加上下文信号，通过文件写入、镜像加载、进程上下文三条线在短时间窗内关联。
> - **AI 用法：** HijackLibs 结构化数据适合封装成 MCP 只读工具（已有 Harris HawkEye、edge-soc-mcp 两个早期项目），护栏包括强制引用条目 URL、核对 Condition、固定 Git 快照、主机验证与防投毒，阻断决策仍需人工。

**赛博57库** *2026年11月2日 05:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b5972083c11edd91.png)

深度科普· 威胁情报/ 攻防安全 / AI安全

劫持候选库 · 配对检测 · Agent 工具化 ·

2025 年 7 月，一起最终演变成 Akira 勒索的入侵，起点不是 0day，也不是什么新漏洞。

攻击者先做 SEO 投毒：把“ManageEngine OpManager”的搜索结果引到仿冒下载站，再投递一个伪装成安装包的 MSI。MSI 落地后，真正执行的是两个文件——微软签名的 `consent.exe` ，和旁边一个同名的 `msimg32.dll` 。前者是合法系统程序，后者是恶意载荷。 `consent.exe` 启动时按 Windows 的 DLL 搜索顺序，从自己所在目录加载了 `msimg32.dll` ，恶意代码就这样跑进了签名进程。

从初始执行到 Akira 加密，大约 44 小时；外传数据超过 75GB。

这件事最值得复盘的地方，不是“攻击者用了 DLL 侧加载”——这技术已经不算新——而是： **为什么一个签名程序、一个合法加载动作、一个用户目录，能让应用白名单和 EDR 同时不舒服？**

HijackLibs 记录的，正是这种“合法程序 + 非法邻居”的组合。

## 01 · 先把网站拆开：它到底记录了什么

HijackLibs\[.\]net 由 Wietze Beukema 在 2021 年 2 月发起，GPLv3 开源，社区贡献，目前仍在活跃更新。它的自我定位很克制： **“公开披露的 DLL 劫持机会”**，不是漏洞库，也不是利用框架。

网站把 DLL 劫持分成四类，这个分类比很多文章都清楚：

|     |     |     |     |
| --- | --- | --- | --- |
| 类型  | 机制  | 利用前提 | 数据里的组合数 |
| DLL 侧加载（Sideloading） | 把合法 EXE 复制到用户可写目录，旁边放恶意 DLL；EXE 启动时从自己目录加载 | 能找到签名 EXE，且它按名字加载 DLL | 1,907 |
| 幻影 DLL（Phantom） | 应用会加载一个“本来不存在”的 DLL；把恶意 DLL 放到它预期的位置 | 通常需要写 System32/受保护目录，常伴随管理员权限 | 20  |
| 搜索顺序劫持（Search Order） | DLL 只写文件名，系统按固定顺序搜索；把恶意 DLL 放到更靠前的位置 | 依赖当前目录、PATH 或旧版应用行为 | 17  |
| 环境变量劫持（Environment Variable） | 修改 `SYSTEMROOT` / `WINDIR` 等变量，让应用从攻击者目录解析系统 DLL | 能控制目标进程的启动环境 | 459 |

![四种 DLL 劫持类型](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c51f11f822fab47e.jpg)

四种 DLL 劫持类型

▲ 图 1：四种 DLL 劫持类型。侧加载、幻影、搜索顺序、环境变量，前置条件和暴露面完全不同。

注意最后一行： **459 个环境变量组合**，数量仅次于侧加载。它经常被忽略，因为它不像“把 EXE 复制到临时目录”那么直观。它的核心是：应用用 `%SYSTEMROOT%` 解析 DLL 路径，而进程环境变量可以被快捷方式、计划任务、服务或父进程改写。只要目标进程继承了被改过的变量，它就会去攻击者指定的目录找 DLL。

一个条目长什么样？以 `msimg32.dll` 为例：

|     |     |     |
| --- | --- | --- |
| 字段  | 含义  | 实战用途 |
| `Name` | DLL 名 | 查询主键 |
| `Vendor` | 所属厂商 | 按目标软件筛选 |
| `ExpectedLocations` | DLL 正常应该在哪 | 检测时做路径白名单 |
| `VulnerableExecutables[].Path` | 哪个 EXE 会加载它 | 红队选宿主，蓝队绑进程 |
| `Type` | 四类之一 | 决定利用方式 |
| `SHA256` | 已知样本/宿主哈希 | 版本比对、样本关联 |
| `ExpectedSignatureInformation` | 宿主/DLL 的预期签名 | 判断“签名对不对” |
| `Condition` | 版本、OS、触发方式 | 决定这条还成不成立 |
| `AutoElevate` | 宿主是否带自动提权属性 | 优先级信号，不等于 UAC 绕过 |
| `PrivilegeEscalation` | 是否明确标记提权 | 高价值条目 |
| `Resources` | 公开报告/样本链接 | 追溯证据 |

截至 2026-11-01 抓取，站点有 **627 条条目、2,403 个 EXE 组合、117 个厂商**。其中 Microsoft 内置组件 443 条、Microsoft 外部组件 28 条、第三方软件 156 条。第三方里排在前面的有 McAfee、Oracle、Trend Micro、Adobe、Asus、Canon、HP、Python、Qt、Symantec、VMware。

![627 条数据的真实分布](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ac77bde223eb6b2b.jpg)

627 条数据的真实分布

▲ 图 2：627 条条目、2,403 个 EXE 组合的真实分布，以及决定检测上限的质量缺口。

这组数字说明两件事：

1.**它不是“小众漏洞列表”**。Microsoft 内置组件占了大头，意味着大量条目是 Windows 自带程序的行为，而不是某个冷门软件。

2.**它也不是“627 个漏洞”**。条目是“公开披露的候选”，不是“可利用性证明”；同一个 DLL 可能对应多个 EXE，一个 EXE 也可能有多个版本/条件。真正的组合数是 2,403。

网站提供 JSON、CSV、YAML 三种数据格式，以及三类 Sigma feed：镜像加载、文件写入、签名校验。三个 feed 分别是 627、627、424 条，合计 **1,678 条规则**。签名规则少 203 条，主要因为并非每个条目都有可用的预期签名信息。

数据里还有三个容易被忽略的信号：

• **30 条没有 `ExpectedLocations`**：没法直接做路径过滤，只能靠 EXE/DLL 配对和主机上下文；

• **141 个 EXE 组合带 `Condition`**：版本、OS、触发方式都会影响成立与否，自动规则没有编码这些条件；

• **20 条条目的预期位置落在用户可写目录**： `%LOCALAPPDATA%` 、 `%APPDATA%` 、 `%TEMP%` 、 `%USERPROFILE%` 。这类条目最危险，因为攻击者可能不需要复制 EXE，直接替换用户目录里的 DLL 就行。

还有一个数据质量点：条目页的“Last updated”经常显示为 Unknown，JSON 里只有 `Created` ，没有 `Updated` 。这意味着你无法从数据字段判断“这条最近有没有被重新验证”。红队和蓝队都不能把“在库里”当成“现在还能用”。

## 02 · 红队视角：从软件清单到候选宿主

红队最容易犯的错，是打开 HijackLibs，搜一个熟悉的 DLL，然后硬套目标。正确顺序反过来： **先看目标装了什么，再回到库里找配对**。

### 第一步：盘点，不先找 DLL

你要回答四个问题：

1\. 目标装了哪些第三方软件？版本是多少？装在 `Program Files` 还是用户目录？

2\. 哪些程序会开机自启、常驻、被用户频繁打开？

3\. 哪些安装目录当前用户可写？哪些 EXE 有签名？

4\. 哪些软件面向外网、处理邮件/文档/IM，容易被钓鱼触发？

盘点不需要复杂工具：卸载注册表、 `Program Files` / `Program Files (x86)` 、用户 `AppData` 、进程列表、EDR 软件清单都能用。重点是 **版本和路径**，因为 HijackLibs 的条目经常带版本条件。

### 第二步：把候选筛出来

不要只刷网页。下载 JSON/CSV，本地过滤更快：

• 按 `Vendor` 筛目标厂商；

• 按 `VulnerableExecutables.Path` 里的 EXE 名筛；

• 按 `Type` 筛侧加载/环境变量；

• 按 `ExpectedLocations` 是否落在用户可写目录排序；

• 按 `AutoElevate` 、 `PrivilegeEscalation` 、 `Condition` 做优先级标记。

一个实用的优先级顺序是：

**预期位置本身在用户可写目录 > AutoElevate > 签名/版本匹配 > 网络暴露 > 其他。**

第一类为什么最高？因为 `basicnetutils.dll` 这种条目，易受攻击的 EXE 本身就在 `%LOCALAPPDATA%\Temp\...\Application2\XLGameUpdate.exe` 。如果目标机器上这个程序存在，EXE 和 DLL 已经在用户可写路径里，攻击者可能不需要“复制宿主”这一步。

### 第三步：在主机上验证

库里的条目是“公开候选”，不是“目标主机事实”。至少验证：

• EXE 是否存在，路径是否与条目一致；

• 文件版本、签名主体、签名状态是否匹配；

• DLL 是否真的从 EXE 所在目录加载（可以用 Process Monitor 看 `Load Image` 事件）；

• 目录当前用户是否可写（ `icacls` ）；

• 进程以什么权限运行，是否受 AppLocker/WDAC/EDR 限制；

• 目标版本是否落在 `Condition` 范围内。

这一步不做，后面全是赌博。

### 第四步：选入口

四种类型不是随便挑，前置条件和暴露面不一样：

|     |     |     |     |
| --- | --- | --- | --- |
| 入口  | 适合场景 | 优点  | 风险/限制 |
| 侧加载 | 有签名 EXE、用户目录可写 | 成功率高，宿主可信 | EXE 从异常路径启动，容易被 Hunt |
| 幻影  | 应用会加载缺失 DLL，能写预期目录 | 不改变宿主路径 | 常需管理员权限，写入 System32 显眼 |
| 搜索顺序 | 旧应用/相对路径加载 | 不复制 EXE 也可能成立 | 受 SafeDllSearchMode、KnownDLLs 限制 |
| 环境变量 | 能控制进程启动环境 | 宿主路径可以保持“正常” | 需要快捷方式/计划任务/服务等载体，变量继承要验证 |

侧加载的核心不是“DLL 放哪”，而是“ **宿主从哪启动** ”。把签名 EXE 复制到 `%TEMP%` 、 `Downloads` 、 `ProgramData` 下的某个“安装目录”，再放一个同名 DLL，是最常见的形态。Bumblebee 用的是 `consent.exe` + `msimg32.dll` ；SilkParasite 轮换的是 FineReader、Mp3tag、Calibre 这些正常软件；FudCrypt 干脆把 20 个载体做成商品。

### 第五步：打包与投递

红队视角只需要理解结构，不需要在文章里写武器化代码：

• 一个签名宿主 EXE；

• 一个与它加载名一致的 DLL；

• 一个用户可写、看起来合理的目录；

• 一个让用户/系统愿意执行的载体：LNK、ISO、MSI、计划任务、服务、钓鱼附件。

真正决定成败的是“宿主是否可信、路径是否自然、执行上下文是否合理”，而不是 DLL 写得多花哨。

### 三个案例，三种打法

**Bumblebee：用系统程序做“合法外壳”。** `consent.exe` 是 Windows 的 UAC 同意进程，正常在 `System32` 。攻击者把它复制到安装目录，旁边放 `msimg32.dll` ，签名还在，进程名还可信，但加载路径已经变了。DFIR Report 的记录显示，这套链最终落到 AdaptixC2 和 Akira。

**SilkParasite：轮换宿主，避免单点检测。** Bitdefender 的报告里，攻击者针对不同 RAT 家族换不同宿主：Calibre 的 `ebook-edit.exe` 加载 `calibre-launcher.dll` ，ABBYY FineReader 加载 `dsp_ippv2_x64.dll` ，Mp3tag 加载 `tak_deco_lib.dll` 。报告给防守方的结论很直接： **可靠信号是“签名程序 + 旁边 DLL + 异常路径”的配对，不是单个 DLL 名。**

**FudCrypt：把侧加载做成订阅服务。** 2026 年 4 月的分析显示，这个 Cryptor-as-a-Service 有 200 个注册用户、334 次构建、20 个载体组合，价格 800–2,000 美元/月。它用 ProtonVPN、CCleaner、Zoom、SharePoint、OneDrive 等正常软件做宿主，把客户 payload 包成“签名 EXE + 恶意 DLL”的压缩包。更值得防守方注意的是： **发布时这 20 个 EXE/DLL 组合没有一个出现在 HijackLibs**， `nethost.dll` 甚至完全不在库中。HijackLibs 在 2026-04-19 同一天新增了 `nethost.dll` 条目，记录“167 个 FUDCrypt 侧加载包”。

这就是知识库的真实节奏： **它是在追着攻击者跑。**

### 红队最容易犯的四个错

1.**把“在库里”当成“还能用”**：厂商修补后条目仍保留，必须看 `Condition` 和版本。

2.**把 `AutoElevate` 当成 UAC 绕过**：173 个组合带这个标记，但复制 EXE 到用户目录后是否仍自动提权，取决于 Windows 的信任路径校验，必须实测。

3.**忽视环境变量条目**：459 个组合，很多不需要复制 EXE，隐蔽性更好。

4.**路径太“脏”**： `%TEMP%\aaaa\` 这种目录，EDR 和猎人一眼就能看出问题；真实案例里攻击者会用“ApplicationInstallationFolder_11”这类看起来像安装目录的名字。

![红蓝双线作战图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4a4013518a96cc9f.jpg)

▲ 图 3：同一份数据，红队找宿主，蓝队找配对；交点是可验证的关系。

## 03 · 蓝队视角：自动 Sigma 为什么不能直接上线

蓝队拿到 HijackLibs，最自然的动作是把 1,678 条 Sigma 导入 SIEM。然后，告警会淹过来。

自动生成的规则天生缺少三个上下文，和写得好不好没关系。

### 失效点一：只匹配 DLL 名，不绑定易受攻击的 EXE

以 `sas.dll` 的镜像加载规则为例，逻辑是：

• 任何进程加载 `sas.dll` ；

• 路径不在 `System32` / `SysWOW64` ；

• 就告警。

问题是，很多正常软件也会自带 `sas.dll` ，或者从自己的安装目录加载。规则不知道“哪个 EXE 才是易受攻击的宿主”，也不知道“这个 EXE 是否应该出现在这个路径”。它只能告诉你“有个叫 sas.dll 的东西从奇怪的地方加载了”，不能告诉你“这是不是 HijackLibs 里描述的那条链”。

### 失效点二：只过滤预期路径，不校验签名、版本、Condition

自动规则的过滤器通常只包含 `ExpectedLocations` 的路径展开。它不检查：

• 加载的 DLL 签名主体是否匹配；

• 宿主 EXE 的版本是否落在 `Condition` 范围；

• 当前系统版本是否满足条件；

• 写入 DLL 的进程是谁。

结果就是：安装器、更新器、便携软件、测试环境都可能触发；真正恶意的组合反而可能因为路径“看起来像预期位置”被放过。

### 失效点三：签名规则的字段位置和布尔语义都不对

这是最具体、也最容易被忽略的问题。自动生成的签名规则长这样：

filter:

ImageLoaded:

\- Signed: 'true'

\- SignatureStatus: 'signed'

\- Signature|contains:

\- 'CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US'

按 Sigma 的语义， `ImageLoaded` 是一个字段，下面的列表是它的候选值。也就是说，规则会把 `Signed` 、 `SignatureStatus` 、 `Signature` 当成 `ImageLoaded` 的匹配值，而不是独立的签名字段。正确的写法应该把签名条件拆成独立字段，并且明确布尔关系：

filter_main:

Signed: true

SignatureStatus: 'signed'

Signature|contains:

\- 'CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US'

即使拆开，也要注意：Sigma 里多个字段默认是 AND，而原规则想表达的很可能是“签名有效 OR 签名状态为 signed OR 证书主体匹配”的 OR 关系。 **字段位置、布尔语义、后端映射，三者都要在落地前重写。**

### 正确的模型：六要素配对

DLL 劫持的可靠检测，靠的是六个要素同时成立：

|     |     |     |
| --- | --- | --- |
| 要素  | 要问的问题 | 典型字段 |
| 宿主 EXE | 这是不是一个已知会被劫持的签名程序？ | `Image`<br><br>、 `FileName` 、签名、版本 |
| 候选 DLL | 这个 DLL 是否在 HijackLibs 里与该 EXE 配对？ | `ImageLoaded`<br><br>、 `FileName` |
| 路径对 | EXE 和 DLL 是否在同一异常目录？是否偏离预期位置？ | `Image`<br><br>、 `ImageLoaded` 、 `FolderPath` |
| 签名/版本 | DLL 是否未签名/签名不符？宿主版本是否在条件内？ | `Signed`<br><br>、 `SignatureStatus` 、 `FileVersion` |
| 写入行为 | DLL 是否刚被写入用户可写/暂存目录？ | `TargetFilename`<br><br>、 `Image` |
| 进程上下文 | 宿主是否从临时目录启动？父进程是否可疑？ | `ParentImage`<br><br>、 `User` 、 `IntegrityLevel` |

这六要素不需要一次全部命中，但至少要有“宿主 + DLL + 路径”三件套，再加上一个上下文信号，才值得升级。

### 修正版 Sigma：以 consent.exe + msimg32.dll 为例

title: Signed consent.exe sideloads msimg32.dll from non-system path

id: 5b1d0f7a-6c2e-4a9b-9d3e-7f0c1a2b3c4d

status: experimental

description: Detects consent.exe running outside System32 loading msimg32.dll from a non-system path, consistent with Bumblebee-style sideloading.

references:

\- https://hijacklibs.net/entries/microsoft/built-in/msimg32.html

\- https://thedfirreport.com/2026/06/29/from-bing-search-to-ransomware-bumblebee-and-adaptixc2-deliver-akira-3/

author: Cyber57

date: 2026/11/01

tags:

\- attack.defense_evasion

\- attack.t1574.001

logsource:

product: windows

category: image_load

detection:

selection:

Image|endswith: '\\consent.exe'

ImageLoaded|endswith: '\\msimg32.dll'

filter_main:

Image|startswith:

\- 'C:\\Windows\\System32\\'

\- 'C:\\Windows\\SysWOW64\\'

ImageLoaded|startswith:

\- 'C:\\Windows\\System32\\'

\- 'C:\\Windows\\SysWOW64\\'

condition: selection and not filter_main

falsepositives:

\- Rare legitimate consent.exe outside System32

level: high

这条规则的价值不在“覆盖所有 DLL 劫持”，而在“覆盖一个真实案例的完整配对”：宿主是 `consent.exe` ，DLL 是 `msimg32.dll` ，两者都必须不在系统目录。它比“任何进程加载 msimg32.dll 就告警”精准得多。

同样的模板可以按 HijackLibs 的配对批量生成，但要注意： **一条规则只绑定一个宿主/DLL 对**，不要试图用一条规则覆盖 627 条。

### KQL 示例：把“配对”写成查询

以下按常见 EDR 表名写，字段名需要按你的平台调整：

DeviceImageLoadEvents

| where FileName =~ "msimg32.dll"

| where FolderPath!startswith @"C:\\Windows\\System32\\"

| join kind=inner (

DeviceProcessEvents

| where FileName =~ "consent.exe"

| where FolderPath!startswith @"C:\\Windows\\System32\\"

) on DeviceId, $left.InitiatingProcessId == $right.ProcessId

| project

Timestamp = $left.Timestamp,

DeviceName = $left.DeviceName,

DllPath = $left.FolderPath,

ProcessPath = InitiatingProcessFolderPath,

Account = InitiatingProcessAccountName

这条查询的意图是： **同一个进程，既运行了不在 System32 的 `consent.exe` ，又加载了不在 System32 的 `msimg32.dll` 。** 它把“DLL 名”升级成了“进程 + 路径对”。

### 三条检测线

1.**文件写入线**：监控 `msimg32.dll` 、 `sas.dll` 等候选 DLL 被写入用户可写目录/暂存目录，尤其是与签名 EXE 同目录。Sysmon 11 / EDR 文件创建事件都可用。

2.**镜像加载线**：监控签名宿主从异常路径加载候选 DLL。Sysmon 7 / EDR image load 事件。

3.**进程上下文线**：监控已知宿主 EXE 从 `%TEMP%` 、 `%APPDATA%` 、 `Downloads` 、 `ProgramData` 启动，父进程是 Office、浏览器、压缩包、IM 等。

三条线单独看都有误报，合在一起才有说服力： **写入 → 加载 → 执行**，同一主机、短时间窗。

### 误报治理

• 建立软件基线：哪些签名 EXE 正常会从用户目录启动？哪些 DLL 是便携软件自带的？

• 对安装器/更新器单独放行：它们本来就会写 DLL、从临时目录启动；

• 用签名和版本收窄：未签名 DLL + 签名宿主 + 异常路径，优先级最高；

• 对 `Condition` 做版本判断：不要对已经修补的版本继续告警；

• 定期复核：HijackLibs 条目会新增，也会因为厂商修补而“失效但保留”。

### 暴露面评估：比逐条告警更治本

把 HijackLibs 的 `VulnerableExecutables.Path` 和企业软件资产做 join，你会得到一张“哪些已安装软件是已知候选宿主”的清单。再按以下维度排序：

1.`ExpectedLocations` 是否落在用户可写目录；

2\. 是否带 `AutoElevate` / `PrivilegeEscalation` ；

3\. 是否签名、签名主体是否可信；

4\. 是否常驻、是否网络暴露、是否处理敏感文档；

5\. 版本是否在 `Condition` 范围内。

重点看那 20 条“预期位置在用户可写目录”的条目。比如：

• `basicnetutils.dll` ：易受攻击的 `XLGameUpdate.exe` 本身就在 `%LOCALAPPDATA%\Temp\...\Application2` ；

• `libcares-2.dll` ：GitKraken 的 `ahost.exe` 在 `%LOCALAPPDATA%\GitKraken\app-...`；

• `goopdate.dll` ：Dropbox 更新器的预期位置包含 `%LOCALAPPDATA%\DropboxUpdate\Update` ；

• `python310.dll` ：Python 的预期位置包含 `%LOCALAPPDATA%\Temp` 和 `%USERPROFILE%\anaconda3` 。

这类条目的处置优先级应该高于“需要管理员写 System32”的幻影条目。修复手段也很具体：升级/移除不用的软件、收紧用户目录执行、WDAC/AppLocker 规则、DLL 签名策略、对用户可写目录的加载行为加监控。

## 04 · AI 时代：从查询网站到 Agent 工具层

先说结论： **AI 不会让 HijackLibs 过时，反而会让它从“查询网站”变成“Agent 的工具层”。**

但前提是，你得把它当“结构化事实”，而不是“让 LLM 自由发挥的语料”。

### LLM 在 DLL 劫持上的三个失败模式

1.**幻觉条目**：LLM 能编出一个看起来很像的 DLL/EXE 配对，但它没有查过库。

2.**数据滞后**：模型训练数据有截止时间，HijackLibs 每周都在更新；FudCrypt 的 20 个载体就是现成例子。

3.**脱离主机**：LLM 不知道目标机器上装的是哪个版本、路径是否可写、EDR 是否拦截；它只能给“可能性”，不能给“结论”。

所以，AI 的正确角色是把手上的查询、关联、验证串起来，而不是替代查询。

### 为什么 HijackLibs 适合做工具语料

• 结构化：JSON/YAML 字段稳定，适合检索和函数调用；

• 可引用：每条有 `url` ，能回溯到公开证据；

• 有上下文： `ExpectedLocations` 、 `Condition` 、签名信息，不是光秃秃的 DLL 名；

• 有检测内容：Sigma feed 可以直接做二次开发；

• 有版本：Git 仓库可以固定 commit，避免“今天查的和明天查的不一样”。

![AI Agent 工具层](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/35a0b54f347a2032.jpg)

AI Agent 工具层

▲ 图 4：HijackLibs 作为 Agent 工具层的三层结构，以及五个必须的护栏。

### 已经发生的接入：两个早期 MCP 项目

这不是纯推测。2026 年已经出现把 HijackLibs 接进 MCP 的第三方项目：

• **Harris HawkEye MCP**：面向检测工程的 MCP，README 记录索引 609 条 HijackLibs，提供 `lookup_hijacklib` / `list_hijacklibs` 两个工具，返回易受攻击的 EXE、劫持类型、预期 DLL 位置，面向 T1574.001/002 检测工程。项目 2026-09-08 创建，属于早期实验。

• **edge-soc-mcp**：Cloudflare Workers 上的 SOC MCP，18 个工具，内置 HijackLibs 语料，提供 `dll_hijack_lookup` ，并与 Sigma、ATT&CK、LOLBAS 放在同一个调查入口。

两者都不是官方能力，成熟度也有限，但它们证明了一件事： **HijackLibs 的数据形状，天然适合做 Agent 的只读工具。**

### 三种接入模式

|     |     |     |     |
| --- | --- | --- | --- |
| 模式  | 怎么做 | 适合  | 不适合 |
| RAG 知识库 | 把条目嵌入向量库，按问题召回，附引用 | 问答、培训、快速查 | 多步调查、精确过滤 |
| MCP 工具 | 把查询封装成函数，输入 DLL/EXE，返回结构化结果 | 告警 triage、检测工程 | 需要复杂推理的开放问题 |
| Agent 工作流 | 工具 + 主机验证 + 工单/响应 | 暴露面评估、自动化狩猎 | 无护栏的全自动阻断 |

### 工具契约：让 Agent 说“人话”，也说“证据”

一个最小可用的 `lookup_hijacklib` 应该这样定义：

{

"name": "lookup_hijacklib",

"description": "Look up DLL hijacking candidates by DLL or EXE name; return expected locations, vulnerable executables, type, condition, and entry URL.",

"input_schema": {

"type": "object",

"properties": {

"query": {"type": "string"},

"type": {"enum": \["Sideloading", "Phantom", "Search Order", "Environment Variable"\]}

},

"required": \["query"\]

}

}

返回结果至少包含 `entry_url` 、 `condition` 、 `snapshot_date` 和 `disclaimer` 。其中 `disclaimer` 必须写明： **“未收录不等于安全。”**

注意 `disclaimer` ：这是防止 Agent 把“没查到”说成“安全”的关键。

### 三个场景

**场景一：告警 triage。** EDR 报“签名进程从用户目录加载未签名 DLL”。Agent 查库，确认这对组合是否在 HijackLibs；核对 `ExpectedLocations` ；检查宿主版本/签名；输出“命中/排除/待验证”，并附条目 URL。人只需要看证据，不用从零查。

**场景二：检测工程。** 检测工程师选一对宿主/DLL，Agent 生成 Sigma，翻译成 KQL/SPL，按后端字段模型改写，再用测试数据验证。这里的关键在“校验”，不在“生成”：字段是否存在、布尔关系对不对、版本条件有没有编码。

**场景三：暴露面评估。** 把软件清单喂给 Agent，Agent 与 HijackLibs 做 join，按“用户可写路径、AutoElevate、签名、常驻、网络暴露”排序，输出修复清单。这比“逐条告警”更接近治本，也是 AI 最能放大的地方。

### 护栏：五个“必须”

1.**必须引用条目 URL**：没有 URL 的回答，视为幻觉。

2.**必须核对 `Condition`**：版本、OS、触发方式不满足，就不要下结论。

3.**必须做主机验证**：文件存在、版本、签名、路径、权限，至少验证两项。

4.**必须固定快照**：用 Git commit 或 JSON 哈希，避免“今天和明天答案不一样”。

5.**必须防投毒**：社区贡献的 YAML 要过 schema、来源、复核；不要把未经验证的条目直接喂给自动阻断。

### 攻击侧：AI 让“选宿主”更容易，防守要换赛道

FudCrypt 已经把侧加载做成商品：800–2,000 美元/月，20 个载体，334 次构建。LLM 再把“写一个能用的 proxy DLL”“选一个不在库里的宿主”“生成一个看起来像安装包的 LNK/ISO”这些步骤的门槛降低，结果就是： **未知配对会越来越多，名单匹配会越来越不够用。**

防守方该做的，不是再买一份更大的名单：

• 用配对检测替代单 DLL 名检测；

• 用签名/版本/路径上下文替代静态黑名单；

• 用暴露面评估替代“告警-driven”的被动响应；

• 用 Agent 做“查证 + 关联”，但把“阻断”留给有证据的人。

### 已发生 / 可推断 / 待验证

|     |     |     |
| --- | --- | --- |
| 层级  | 内容  | 证据强度 |
| 已发生 | 第三方 MCP 已把 HijackLibs 封装成工具；自动 Sigma 已存在；FudCrypt 已商品化 | 强   |
| 可推断 | SOC copilot 会内置“DLL 劫持候选”工具；暴露面管理会 join 软件资产；红队 Agent 会用它做宿主筛选 | 中   |
| 待验证 | 厂商是否官方集成；Agent 查证的准确率；数据投毒的实际风险；自动阻断的合规边界 | 弱/需实验 |

## 05 · 边界与争议：别把候选库当扫描器

HijackLibs 很好用，但它有三个硬边界。

### 边界一：627 条不是 627 个漏洞

条目是“公开披露的候选”，不是“可利用性证明”。只有 4 个条目带 CVE；大多数是设计缺陷/加载顺序问题，不进入 CVE。厂商修补后条目仍保留，因为旧版本仍然存在。你看到一条条目，只能说明“历史上有人披露过这个组合”，不能说明“目标机器现在一定可利用”。

### 边界二：数据质量决定检测质量

|     |     |     |
| --- | --- | --- |
| 问题  | 数量  | 影响  |
| 缺少预期位置 | 30 条 | 无法做路径过滤，只能靠配对/上下文 |
| 带条件 | 141 个组合 | 自动规则未编码版本/OS/触发条件 |
| 带 CVE | 4 个条目 | 不能把它当 CVE 库 |
| 无更新字段 | 全量  | 无法判断条目最近是否复验 |
| 自动提权标记 | 173 个组合 | 不等于 UAC 绕过，需实测 |
| 权限提升标记 | 4 个组合 | 高价值但数量少 |

### 边界三：覆盖滞后是常态

FudCrypt 发布时，20 个载体组合没有一个在 HijackLibs； `nethost.dll` 完全不在库中。HijackLibs 在同一天新增了 `nethost.dll` 条目。这不是黑点，而是所有公开知识库的共同节奏： **攻击者先跑，社区再追。**

所以，正确的心态是：

• 查到：作为“假设”，去主机验证；

• 没查到：不能判定“安全”，只能判定“暂无公开记录”；

• 条目失效：看 `Condition` 和版本，不要直接删规则，改成狩猎。

### 错误用法 vs 正确用法

|     |     |
| --- | --- |
| 错误用法 | 正确用法 |
| 把 627 条当 627 个漏洞 | 把 627 条当候选，按 2,403 个 EXE 组合筛 |
| 直接导入 1,678 条 Sigma | 选配对，重写字段/布尔/版本条件 |
| 只查 DLL 名 | 查 EXE + DLL + 路径 + 签名 |
| 没查到就说安全 | 没查到只说“暂无公开记录” |
| 把 AutoElevate 当 UAC 绕过 | 实测复制后是否仍自动提权 |
| 让 Agent 直接阻断 | Agent 查证，人做阻断决策 |

### 合规边界

HijackLibs 是 GPLv3 的公开数据，但“公开”不等于“可以随便用”。红队测试必须在授权范围内；不要用文章里的检测规则去扫描不属于你的资产；不要把条目改造成武器化教程。站方自己也不提供 PoC、代码模板或教程，这个边界值得尊重。

## 06 · 30 分钟落地清单

### 红队：30–60 分钟短名单

1\. 导出目标软件清单（名称、版本、路径、是否用户可写）。

2\. 用 JSON/CSV 按厂商/EXE 名筛 HijackLibs，标出用户可写路径、AutoElevate、Condition。

3\. 在主机上验证 EXE 存在、版本、签名、DLL 加载行为。

4\. 选入口：侧加载/幻影/搜索顺序/环境变量，记录前置条件。

5\. 设计载体与路径，避开 `%TEMP%\random` 这类高噪声目录。

### 蓝队：一天内的三个动作

1\. 建软件基线：哪些签名 EXE 会从用户目录启动，哪些 DLL 是便携软件自带。

2\. 写 3 条配对规则： `consent.exe` + `msimg32.dll` 、FineReader+ `dsp_ippv2_x64.dll` 、Mp3tag+ `tak_deco_lib.dll` ，再按模板扩展。

3\. 跑一次暴露面 join：把 HijackLibs 的 EXE 清单与资产清单比对，先处置 20 条用户可写路径条目。

### AI 团队：最小可用 MCP 五步

1\. 固定快照（JSON + commit/hash）。

2\. 定义 `lookup_hijacklib` / `list_hijacklibs` 两个只读工具。

3\. 返回值强制带 `entry_url` 、 `condition` 、 `snapshot_date` 、 `disclaimer` 。

4\. 加主机验证工具（文件/签名/路径/权限），不让 LLM 直接下结论。

5\. 加护栏：引用、条件核对、人工审批、防投毒。

## 07 · 结语：项目是地图不是武器

HijackLibs 最容易被误读的地方，是它的数字：627 条、2,403 个组合、1,678 条 Sigma。数字很抓眼，但数字不是价值本身。

它的价值在于： **把“合法程序愿意从哪加载 DLL”这件事，变成了可查询、可验证、可自动化的关系。**

红队用它找宿主，但不能把它当“可用性保证”；蓝队用它写检测，但不能把它当“生产规则包”；AI 用它做工具，但不能把它当“事实本身”。

真正危险的不是 DLL，而是合法程序愿意从哪加载它。

这句话，才是 HijackLibs 给红蓝双方最重要的提醒。

### 主要资料来源

• HijackLibs 官网与 API：https://hijacklibs.net/ 、https://hijacklibs.net/api/

• HijackLibs GitHub：https://github.com/wietze/HijackLibs

• Microsoft DLL search order：https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order

• DFIR Report（Bumblebee / AdaptixC2 / Akira，2026-06-29）：https://thedfirreport.com/2026/06/29/from-bing-search-to-ransomware-bumblebee-and-adaptixc2-deliver-akira-3/

• Bitdefender（SilkParasite，2026-08-19）：https://businessinsights.bitdefender.com/silkparasite-tracking-china-nexus-apt-across-central-asia

• Ctrl-Alt-Intel（FudCrypt，2026-04-19）：https://ctrlaltintel.com/research/FudCrypt-analysis-1/

• Microsoft Security Blog（NeedyMantis，2026-09-28）：https://www.microsoft.com/en-us/security/blog/2026/09/28/needymantis-unpacking-a-post-compromise-malware-family-used-in-targeted-operations/

• Harris HawkEye MCP：https://glama.ai/mcp/servers/legionultramax/Detection-Engineering-MCP/tools/lookup_hijacklib

• edge-soc-mcp：https://himcp.ai/server/edge-soc-mcp

数据统计口径：截至 2026-11-01 抓取 `hijacklibs.json` ；条目数、EXE 组合数、类型分布、Sigma 数量、Condition/AutoElevate/用户可写路径等均基于该快照。发布前会复核一次。

技术内容仅供学习与研究，请勿用于非法用途。

赛博57库 · 2026-11-01
