---
title: 学习拉马努金提高注意力的解题模式 - 谈谈基于DFA的Widevine L3 keybox量产技术 | +5 Security Research
source: https://overkazaf.github.io/blogs/posts/widevine-l3-keybox-mass-production/
source_host: overkazaf.github.io
clip_date: 2026-08-04T11:17:46+08:00
trace_id: 1ac70fe3-c9c5-48d9-969a-3be4189b67f6
content_hash: 78377cb8d99a58deafab00330b01972e8680fa455d72633c6e48e8d3b424950e
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: overkazaf·逆向
ai_summary: 通过差分故障攻击和 trace 可视化，可从 Widevine L3 白盒 AES 中提取密钥，实现 keybox 的离线批量生成并通过 Google 及 Netflix 端到端验证。
ai_summary_style: key-points
images_status:
  total: 24
  succeeded: 24
  failed_urls: []
notion_page_id: 3b275244-d011-81ab-af43-c964263eaddb
ioc:
  cves:
    - CVE-2021-0639
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过差分故障攻击和 trace 可视化，可从 Widevine L3 白盒 AES 中提取密钥，实现 keybox 的离线批量生成并通过 Google 及 Netflix 端到端验证。
> 
> - **核心技术突破：** 独立通过创建模式差分故障攻击（DFA）提取了 derived_key，这是 Neodyme 团队未公开的关键步骤。
> - **关键分析方法：** 利用 TraceGraph 可视化技术，从 1350 万条指令执行 trace 中识别出 AES T-table 的访问模式，从而绕过 OLLVM 混淆定位到攻击点。
> - **密钥与结构发现：** 还原了 keybox 内 `d` 区域的明文结构为 `device_key || SHA1(device_key) || 0x03 || zeros`，并确认 ROOT_KEY 由空 SHA-1 哈希派生。
> - **工程化成果：** 实现了不依赖 `secrets.py` 的纯 Python keybox 生成器，克服了 BE 字节序和 CRC32-MPEG2 的实现陷阱，输出与模拟器字节完美匹配。
> - **最终验证：** 6 个由生成器创建的 device_key 均成功通过 Google Provisioning 验证（HTTP 200），并能在 Netflix 端到端获取 licensedManifest 和内容密钥。

> **读完本文，你将获得：**
> 
> -   理解白盒 AES 的核心弱点，以及差分故障攻击（DFA）为什么能从中提取密钥
> -   掌握从"定位注入点 → 故障注入 → 密钥恢复"的完整 DFA 攻击方法论
> -   了解 Widevine L3 CDM 的 keybox 结构和 provisioning 验证流程
> -   学会用 Unicorn 仿真 + SideChannelMarvels 工具链搭建自己的白盒分析环境

## 〇、摘要

本文记录了对 Widevine L3 白盒 AES 实现的完整逆向工程过程，目标是实现 keybox 的离线量产。笔者在 [Neodyme 团队工作](https://neodyme.io/en/blog/widevine_l3) 的基础上，独立完成了以下突破：

1.  **ROOT_KEY + derived_key 提取**：通过差分故障攻击（DFA）从 CDM build 4464 的白盒 AES 中提取了两个核心密钥——文件加密密钥（加载模式 DFA, 150 faults）和 provisioning token 加密密钥（创建模式 DFA, 95 faults）
2.  **d 区域明文结构还原**：逆向发现了 `device_key || SHA1(device_key) || 0x03 || zeros` 的完整结构
3.  **gen_keybox.py**：实现了纯 Python keybox 生成器，输出与模拟器原生结果 **字节完美匹配**
4.  **Google Provisioning 验证**：6 个不同 device_key 全部获得 HTTP 200
5.  **Netflix 端到端验证**：licensedManifest 成功获取 2 个内容密钥

vendor_key 和 key_mask 作为编译时概念在运行时二进制中已不可恢复，但这对批量 keybox 生产目标不构成阻碍。

* * *

## 一、路线总览

在深入细节之前，先用一张图说清楚笔者做了什么：

![全链路时序图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4ef0e071e70a9f37.png)

整个研究可以分为 **5 个递进的阶段**：

| 阶段  | 目标  | 方法  | 产出  |
| --- | --- | --- | --- |
| **① ROOT_KEY 提取** | 获取 keybox 文件加密密钥 | 加载模式 DFA（Neodyme 方法复现） | 16 字节 ROOT_KEY |
| **② derived_key 提取** | 获取 provisioning token 加密密钥 | 创建模式 DFA（本研究核心突破） | 16 字节 derived_key |
| **③ d 区域明文还原** | 弄清 keybox 内部的加密数据结构 | 内存 dump + SHA-1 模式识别 | `dk‖SHA1(dk)‖0x03‖zeros` |
| **④ gen_keybox.py** | 纯 Python 离线生成合法 keybox | 密码学编排（AES-CBC + CRC32） | 字节完美匹配模拟器输出 |
| **⑤ 端到端验证** | 证明生成的 keybox 真的能用 | Google Provisioning + Netflix MSL | 6 个 WVD 设备 + 内容密钥提取 |

每个阶段都依赖前一阶段的产出。第 ② 阶段是整个研究的 **瓶颈和突破点**——Neodyme 的博客没有公开这一步的方法，笔者通过 Trace 可视化（TraceGraph 方法论）独立找到了 d 区域 AES 的 VM 地址空间，这也是标题中"注意力"的由来。

* * *

## 二、引言

### 2.1 研究背景

数字版权管理（DRM）技术是当代流媒体经济的基础设施。以下是全球主要 OTT 平台的规模数据（截至 2025 年）：

| 平台  | 付费订阅用户 | DRM 方案 | 数据来源 |
| --- | --- | --- | --- |
| ![Netflix](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0f53362650ef93fd.bin) **Netflix** | **3.02 亿** （2025 Q1 起停止披露季度用户数） | Widevine (Android/Chrome) + FairPlay (iOS/Safari) | [Variety 2025 Q1](https://variety.com/2025/tv/news/netflix-q1-2025-earnings-financial-results-subscriber-counts-1236371830/) |
| ![Disney+](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4fe49085ef6b6c66.bin) **Disney+** | **1.25 亿** （2025 Q1，环比下降 70 万） | Widevine + FairPlay + PlayReady | [FastCompany 2025 Q1](https://www.fastcompany.com/91273357/disney-plus-subscriber-decline-price-hikes-earnings-q1-2025) |
| ![Prime Video](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f91a6e6b6e142b33.bin) **Amazon Prime Video** | **2.00 亿+** （全球，含 Prime 会员捆绑） | Widevine + PlayReady + FairPlay | [MediaPost 2025](https://www.mediapost.com/publications/article/408037/) |
| ![YouTube](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d2a9020030c6acfa.bin) **YouTube Premium** | **1.25 亿** （含 Music + Premium） | Widevine (CENC) | [Variety 2025.03](https://variety.com/2025/digital/news/youtube-125-million-music-premium-subscribers-lite-tier-1236328177/) |
| ![Spotify](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6ef5f18d2ce673d4.bin) **Spotify** | **2.68 亿** （2025 Q1，同比 +12%） | Widevine (部分) + 自有加密 | [Variety 2025 Q1](https://variety.com/2025/digital/news/spotify-q1-2025-earnings-results-subscribers-1236381023/) |
| ![Apple TV+](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7e151dcf509a87cf.bin) **Apple TV+** | **4500 万+** （Apple 未披露官方数据） | FairPlay | [9to5Mac 2025.10](https://9to5mac.com/2025/10/14/eddy-cue-says-apple-tv-has-significantly-more-subscribers-than-analysts-estimate/) |
| ![HBO Max](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6da3daef420efd4b.bin) **Max (HBO)** | **1.22 亿** （2025 Q1，同比 +22%） | Widevine + PlayReady + FairPlay | [Hollywood Reporter 2025 Q1](https://www.hollywoodreporter.com/business/business-news/warner-bros-discovery-q1-2025-earnings-streaming-growth-1236210369/) |

> **Widevine 的市场覆盖**：上述 7 个平台中有 **6 个使用 Widevine** 作为主要或辅助 DRM。Google 官方数据显示 Widevine 部署在超过 **50 亿台设备** 上。全球 OTT 市场规模预计于 2028 年达到 [1390 亿美元](https://www.fortunebusinessinsights.com/ott-market-106787) （Fortune Business Insights）。

理解 Widevine 的实现原理，不仅是安全研究者的合理学术诉求，也是构建合规测试环境、开展 DRM 互操作性研究的前提。

#### 笔者的研究动机

坦白说，笔者启动这项研究的动机并非学术论文式的"填补空白"，而是来自日常工作中一个非常现实的场景： **DRM 测试环境的可持续维护**。

在流媒体相关的安全测试和协议分析工作中，L3 WVD 设备文件是基础工具——用于验证 License Server 的响应格式、测试不同平台的 DRM 配置差异、排查播放链路上的兼容性问题。问题在于，Google 会定期 revoke（吊销）已泄露的 WVD 设备凭证。一旦你手头的 WVD 被 revoke，所有依赖它的测试流程就会中断，需要重新获取一个新的——通用做法当然是找一台 root 手机跑 [L3 dumper](https://github.com/hyugogirubato/KeyDive) 导出，但这仍然是手工操作，且依赖实体设备。

笔者的目标因此很明确： **建立一条可重复的 keybox 生产管线**，使得在 Google revoke 现有凭证时，能在几分钟内批量生成新的 WVD 设备文件，而不是每次都从头手动操作。

当然，从纯粹的技术兴趣角度，白盒密码学逆向本身就是一个令人着迷的课题——把一个精心混淆的密码学实现拆解开来，理解它的每一层防护，找到绕过的方法，这种满足感与解一道好的数学题并无二致。笔者在本文中试图如实记录这个过程中的发现、失败和判断，希望对同样感兴趣的读者有所帮助。

Widevine 定义了三个安全级别：

-   **L1**：密钥和解密操作在 TEE（可信执行环境，通常为 ARM TrustZone 或高通 QSEE）内部进行，内容可以 1080p 及以上分辨率播放；
-   **L2**：AES 解密在 TEE 中进行，但视频处理在普通世界，支持限制分辨率的受保护内容；
-   **L3**：完全在软件层实现，通过白盒密码学技术混淆密钥，是所有不具备 TEE 能力的设备的默认回退路径。

L3 的纯软件特性使其成为安全研究的主要对象。

#### 2.1.1 Widevine Key Ladder：五层密钥链

Widevine 的安全模型建立在一条\*\*多层密钥链（Key Ladder）\*\*之上。攻击者必须从最顶层（Root-of-Trust）逐层向下推导，才能最终获得用于解密视频流的 Content Key：

![Widevine Key Ladder](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c9041944c2f17695.png)

这条 Key Ladder 的安全性取决于 **最顶层**——device_key 的保护强度。在 L1 中，device_key 存储在 TEE 的硬件保险丝（eFuse）中，物理上不可读取。在 L3 中，device_key 被白盒 AES 的 T-table 和 VM 字节码"编码"保护——这正是 DFA 攻击的目标。

笔者的工作等价于 **攻破了 Key Ladder 的第 ① 层**：通过 DFA 提取 device_key 的加密密钥（derived_key），使得可以合成任意 keybox，从而让整条 Key Ladder 可以在受控环境中被完整重建。下图展示了密钥派生的完整关系：

![密钥派生关系图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f9fe94d7f4ec1468.png) *Widevine L3 密钥派生全景：左侧灰色区域 = 编译时（运行时不可恢复），中间 = 运行时密钥链（本研究的攻击目标），右侧绿色 = provisioning 派生链。*

#### 2.1.2 从二进制到 DFA：攻击路线的发现逻辑

读者可能会问：面对一个经过多层混淆的 CDM 二进制，为什么直接选择 DFA 作为攻击手段？这不是一个事后诸葛亮式的选择，而是建立在社区 **十年积累** 之上的逐步推导。以下是这条推导链的完整脉络。

##### 第一步：知道 CDM 内部"有 AES"

最早的线索来自协议层面的观察。Widevine 的 [Encrypted Media Extensions (EME)](https://www.w3.org/TR/encrypted-media/) 接口是公开标准——浏览器通过 `navigator.requestMediaKeySystemAccess('com.widevine.alpha')` 初始化 CDM，CDM 随后处理 License Server 返回的密钥。安全研究者通过以下手段逐步拼凑出 CDM 内部的密码学操作：

| 发现渠道 | 发现内容 | 意义  |
| --- | --- | --- |
| [WideXtractor](https://arxiv.org/abs/2204.09298) （Patat 等人） | hook `OEMCrypto` 接口（ `OEMCrypto_LoadKeys` 、 `OEMCrypto_DecryptCTR` ），捕获 keybox 的读取和密钥加载过程 | 确认 CDM 在加载 `ay64.dat` 时执行 AES 解密 |
| 静态分析（Ghidra / IDA Pro） | `libwvdrmengine.so` 的 `.data` 段中存在 4 个 256×4 字节的查找表，与标准 AES T-table 结构完全匹配 | 确认 CDM 使用 T-table 实现的 AES，而非 AES-NI 指令 |
| [KeyDive](https://github.com/hyugogirubato/KeyDive) 社区 | Frida hook `provideProvisionResponse` ，从 CDM 进程内存中直接读取 RSA 私钥 | 证明 CDM 的密钥在进程内存中存在明文窗口 |
| [David Buchanan](https://twitter.com/david3141593/status/1080606827384131590) （2019 推文） | 宣布通过 DCA（差分计算分析）攻破 Chrome L3 | 首次公开确认 L3 白盒 AES 可被密码分析攻破 |
| Android 模拟器 + `adb pull` | 从模拟器文件系统中提取 `ay64.dat` （128 字节，加密的 keybox） | 提供了攻击的具体目标文件 |

**到此为止的已知事实**：CDM 使用 T-table 实现的 AES-128 处理 keybox，密钥嵌入在白盒结构中，CDM 进程的内存可被 Frida 访问。

##### 第二步：知道它是"白盒 AES"（不是普通 AES）

如果 CDM 使用的是标准 AES（密钥以明文存储在内存中），那根本不需要 DFA——直接 dump 内存搜索密钥即可。但实际情况不是这样。以下迹象表明这是一个 **白盒 AES 实现**：

1.  **T-table 是标准结构但密钥不可见**：静态提取 T0–T3 后，与 OpenSSL 参考实现对比，发现表的数值完全匹配标准 AES（即 T-table 本身不含密钥混入）。但 CDM 在运行时确实用这些表执行了 AES 加密——密钥在何处？
2.  **VM 字节码包裹**：AES 操作不是直接的 x86 指令序列，而是通过一个自定义 VM 解释器（ `cwkfcplc` 调度器）间接执行的。密钥以 VM 操作数的形式编码在字节码中。
3.  **OLLVM 控制流平坦化**：函数的控制流图呈现典型的 OLLVM 特征（巨大 switch-case + 状态变量），静态分析几乎不可能恢复原始逻辑。
4.  **LCG 加密的字节码**：VM 函数的字节码本身还经过 LCG 加密存储，运行时才解密——这是双重保护。

**推断**：CDM 的 AES 实现满足白盒密码学的所有特征—— **密钥不以任何可识别的形式存在于静态二进制或运行时内存中**，而是被编码在 VM 字节码和查找表的组合结构中。这排除了"内存 dump + 密钥搜索"的简单路线。

##### 第三步：为什么选 DFA 而非其他攻击？

既然确认了白盒 AES，攻击路线的选择就变成了一个 **决策树问题**：

```sql
已知: CDM 使用白盒 AES，T-table 不含密钥混入，AES 操作由 VM 执行

方案 A: BGE 代数攻击 (Billet-Gilbert-Ech, 2004)
   前提: T-table 包含密钥相关的非线性变换
   实际: Widevine 的 T-table 是标准 AES → 前提不成立 → ❌ 不适用

方案 B: DCA — 差分计算分析 (Buchanan, 2019)
   原理: 收集大量执行 trace，统计分析中间值与密钥字节的相关性
   优点: 不需要故障注入
   缺点: 需要数千条 trace，对白盒编码混淆敏感，Buchanan 未公开细节
   状态: 已被证明可行（Buchanan 推文），但缺乏可复现的实现 → ⚠️ 可行但高门槛

方案 C: VM 字节码完整逆向
   原理: 反混淆 OLLVM + 解密 LCG + 逆向 VM 指令集 → 直接读取密钥
   缺点: 工作量巨大（Patat 团队明确表示"未能突破底层混淆层"）
   状态: Neodyme 部分完成（用于定位 AES 地址），但未公开 → ⚠️ 理论可行，实践极难

方案 D: DFA — 差分故障攻击 ✅
   原理: 在仿真环境中跳过第 9 轮的一条指令，观察输出的 4 字节差分
   优点:
     - 只需 ~100 次故障注入（vs DCA 的 ~1000 条 trace）
     - 完全不需要理解白盒内部结构——DFA 利用的是 AES 数学结构本身
     - Quarkslab 已发布完整的方法论和工具 (phoenixAES)
     - Qiling 仿真器提供微秒级快照恢复，使故障注入实际可行
   关键洞察: 白盒混淆隐藏了"密钥在哪里"，但 DFA 不关心密钥在哪里——
             它只关心"注入故障后输出怎么变"。只要 AES 的数学结构存在，
             故障就会以可预测的列模式传播，与混淆无关。
```

**Neodyme 的贡献** 正是将这条推理链工程化：他们选择了方案 D，用 Qiling 框架实现了软件 DFA，并在博客中公开了 ROOT_KEY 的提取方法。但他们 **只公开了 ROOT_KEY 的 DFA** （加载模式， `ay64.dat` 存在时的解密路径），derived_key 的提取方法被刻意留白。

##### 第四步：从 Neodyme 到本研究

笔者的研究起点是 Neodyme 的公开成果：已知 DFA 在 CDM build 4464 上可行，已知 ROOT_KEY 的 DFA 参数（ `FAULT_START_ADDR = 0x6802E275` ），已知 Qiling 仿真环境可以运行 CDM。

**笔者面对的核心未知** 是：derived_key 的白盒 AES 在哪里？

Neodyme 的 ROOT_KEY DFA 参数指向 `0x6802E275` 附近的 VM 代码段。笔者最初 **假设** derived_key 的 AES 共享同一代码段——这个假设被 9,600 次零命中的故障注入证伪。这意味着 CDM 内部存在 **多条独立的白盒 AES 路径**，每条使用不同的 VM 地址段和不同的密钥。

这一失败把问题推向了一个新的层次：如何在 1350 万条指令的执行 trace 中定位一条特定的 AES 路径？

需要说明的是，Trace 可视化（TraceGraph）的思路并非笔者原创——Neodyme 在博客中也提到了类似的方法， [Quarkslab](https://blog.quarkslab.com/differential-fault-analysis-on-white-box-aes-implementations.html) 更早给出了完整的工具和方法论。笔者的工作与 Neodyme 的区别不在于"发明了 TraceGraph"，而在于 **独立完成了 Neodyme 未公开的那一步**：在创建模式（而非加载模式）的 trace 中识别出 d 区域 AES 的独立地址空间 `0x6802A2A2` – `0x6802A8CD` ，并基于此设计了全新的 DFA 参数。Neodyme 公开了 ROOT_KEY 的 DFA 地址（ `0x6802E275` ，加载模式），但 derived_key 的定位方法是他们刻意留白的——这正是笔者需要独立解决的核心问题。

### 2.2 研究目标

笔者的目标是在 Neodyme 工作的基础上，完整复现并扩展其方法。以下对比说明笔者需要独立完成的工作量：

| 步骤  | Neodyme 公开了什么 | 笔者需要独立完成的 |
| --- | --- | --- |
| ROOT_KEY 提取 | 完整公开（ `fault.py` + DFA 参数） | 复现验证 |
| **derived_key 提取** | **未公开** （博客中刻意留白） | **从零开始：trace 采集 → 可视化分析 → 定位 AES 地址 → 设计 DFA 参数 → 实施 95 次故障注入** |
| **d 区域明文结构** | **未公开** | **内存 dump → SHA-1 模式识别 → 完整结构还原** |
| keybox 生成算法 | 依赖未公开的 `secrets.py` | **不依赖 secrets.py 的独立实现，发现 BE 字节序和 CRC32-MPEG2 两个陷阱** |
| 端到端验证 | 部分描述（未提供 Netflix 验证） | **6 个 device_key 的 Google Provisioning + Netflix licensedManifest 完整验证** |

最终实现以下可验证的成果：

1.  提取 ROOT_KEY（keybox 文件加密密钥）；
2.  **提取 derived_key** （provisioning token 加密密钥，这是 Neodyme 博客未公开的部分）；
3.  还原完整的 keybox 生成算法；
4.  实现离线 keybox 量产，通过 Google provisioning 和 Netflix 端到端验证。

本文不讨论内容解密或版权规避，研究对象仅限于 CDM 自身的密码学结构。

* * *

### 2.3 方法论启示：拉马努金的注意力

#### 在噪声中聚焦模式

读者或许好奇标题中的拉马努金与 DRM 逆向有何关联。

![拉马努金 (1887-1920)](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/04c8b2515745736d.jpg) *Srinivasa Ramanujan, 1887-1920. 图片来源: [Wikipedia (Public Domain)](https://commons.wikimedia.org/wiki/File:Srinivasa_Ramanujan_-_OPC_-_1.jpg)*

印度数学天才 [拉马努金（Srinivasa Ramanujan, 1887-1920）](https://zh.wikipedia.org/wiki/%E6%8B%89%E9%A9%AC%E5%8A%AA%E9%87%91) 最令人惊叹的能力不是计算速度，而是 **注意力的精准分配**——他能在繁杂的数学对象中瞬间聚焦到隐藏的结构。1918 年，Hardy 提到出租车牌号 1729 似乎"很无聊"，拉马努金立刻回答： *“不，这是最小的可以用两种方式表示为两个正整数立方之和的数：1729 = 1³ + 12³ = 9³ + 10³。”* Hardy 看到的是一个四位数；拉马努金看到的是 **立方分解的对称结构**。同一个对象，不同的注意力维度，产生完全不同的认知。

Hardy 曾评价拉马努金：“他对数的感觉，像是对朋友的了解。” 这种能力的本质不是知道更多定理，而是 **知道该看哪里**。

#### 拉马努金式的注意力与 TraceGraph

这正是笔者在本次逆向中的核心体验。CDM 的 `l3_init()` 执行了约 1350 万条指令。如果逐条分析代码（**指令维度**），需要面对 OLLVM 控制流平坦化、VM 字节码、LCG 加密——每一层都是巨大的噪声，就像面对一个四位数只看到"1729"。但如果把这 1350 万条指令的 **内存访问** 绘制为热力图（**模式维度**——X=地址, Y=时间, 亮度=访问密度），AES 的 T-table 访问会像拉马努金眼中的立方分解一样，以一条明亮的竖条从背景中浮现—— **不是因为笔者更聪明，而是因为换了一个维度去看**。

| 维度  | 看到的 | 拉马努金类比 |
| --- | --- | --- |
| 指令序列 | 1350 万条混淆指令，无从下手 | Hardy 看到的"无聊的 1729" |
| IC × Address 散点图 | AES T-table 的规律点簇，一眼可辨 | 拉马努金看到的 1³+12³ = 9³+10³ |
| 关键动作 | **换维度看** → 从代码分析切换到数据流可视化 | **换维度看** → 从数值切换到代数结构 |

#### 与 Neodyme 的方法对比

笔者与 Neodyme 在 **方法论上是同源的**——都采用 Qiling 仿真 + TraceGraph 可视化 + DFA 故障注入的技术路线，这一点需要如实说明。Neodyme 在博客中描述了 trace 可视化的思路，笔者的工作直接受其启发。两者的区别不在方法论本身，而在于 **具体完成了哪些步骤**：

| 步骤  | Neodyme 的公开状态 | 笔者的工作 |
| --- | --- | --- |
| ROOT_KEY DFA 地址定位 | 公开： `0x6802E275` （加载模式） | 复用  |
| ROOT_KEY DFA 实施 | 公开： `fault.py` 完整代码 | 复现验证 |
| **创建模式 trace 采集** | **未公开** | **独立完成：637K 次内存访问采集** |
| **d 区域 AES 地址定位** | **未公开** | **独立完成：从散点图识别 `0x6802A2A2`** |
| **derived_key DFA 参数设计** | **未公开** | **独立完成：FAULT_START/EVAL/TARGET 三组参数** |
| **d 区域明文结构还原** | **未公开** | **独立完成：SHA-1 模式识别** |
| **gen_keybox.py（无 secrets.py）** | 依赖未公开的 secrets.py | **独立实现：发现 BE 字节序 + CRC32-MPEG2** |
| **端到端验证** | 部分描述 | **Google + Netflix 完整验证** |

简言之，Neodyme 公开了 **方法论框架和 Phase 1 的完整实现**，笔者在同一框架下独立完成了 **Phase 2–5 的全部工程工作**。方法论上笔者站在 Neodyme 和 Quarkslab 的肩膀上，但 derived_key 的定位、d 区域的结构还原、以及不依赖 secrets.py 的 keybox 生成器——这三块核心工作是笔者的独立贡献。

在本次研究中，笔者的突破时刻来自 **Trace 可视化** （这就是"注意力"的切入点）。笔者将 CDM 运行时的 637,000 次内存访问记录下来，画成热力图（X = 地址，Y = 时间，亮度 = 访问密度）——方法受 [Quarkslab TraceGraph](https://blog.quarkslab.com/differential-fault-analysis-on-white-box-aes-implementations.html) 启发。在热力图上，笔者注意到一条异常明亮的 4KB 宽竖条，经 Ghidra 确认恰好是 AES T-table 的存储区域。进一步分析这条竖条的时间分布，定位到了 d 区域 AES 的执行时间窗口（IC ~11.25M），从而得到了 DFA 所需的全部地址参数。完整的分析过程见 §4.3.2。

在此之前，笔者在错误的 AES 路径上浪费了大量 DFA 尝试（包括对 AES-CBC 非首块的无效故障注入、对不存在的 “c 计算 AES” 的攻击），正是 trace 可视化将注意力 **重新校准** 到了真正的攻击面。

#### 为什么可以绕过 OLLVM？

一句话回答： **OLLVM 混淆的是代码，但笔者看的是数据**。

面对 OLLVM 保护的二进制，常规做法是正面硬刚——反混淆、反 VM、反字节码——一层层剥开代码的伪装，直到看清 AES 在哪里。Patat 团队走的就是这条路，最终坦承"未能突破底层混淆层"。

笔者换了一个角度：不看代码，看内存。

道理很简单。无论代码怎样混淆，AES 在运行时 **必须查 T-table**——这是由 AES 的数学结构决定的，不是程序员可以选择的。每一轮加密都会往 4 个查找表（T0–T3，各 1KB，共 4KB）中查 16 次。OLLVM 可以把代码搅成一团乱麻，但它没法让 AES 不去读自己的表。

所以，只要把程序运行时的所有内存读取画成 **热力图** （X 轴 = 内存地址，Y 轴 = 时间，亮度 = 访问密度），被 AES 反复命中的 T-table 地址区域就会自动变成一条比周围更亮的竖条——不需要读懂一行混淆代码。找到亮条后，用 Ghidra 确认是 T-table，再过滤+放大就能看到每一轮的 16 次查表。具体过程见 §4.3.2。

#### 攻击链：从热力图到密钥

```
① 热力图鸟瞰：跑一遍 CDM → 记录所有内存访问 → 画热力图 → 找到异常亮的 4KB 竖条
② Ghidra 确认：检查亮条地址 → 确认是 AES T-table
③ 过滤+放大：按 T-table 地址过滤 → 看到 9+1 轮结构 → 读出 DFA 参数
④ 故障注入：在第 9 轮跳过一条指令 → 收集故障密文 → phoenixAES 恢复轮密钥
⑤ 密钥还原：轮密钥反推初始密钥 → 解密验证 → 结构逆向
```

全程 **不需要理解 OLLVM、不需要逆向 VM、不需要解密字节码**。

#### 适用边界

这条路径有一个前提： **AES 实现必须使用可观测的 T-table 查表**。本文实验基于 **CDM build 4464** （2018 年编译，Android 9），使用经典 T-table 实现，信号清晰。但并非所有 AES 实现都如此：

| AES 实现方式 | 散点图可见性 | 说明  |
| --- | --- | --- |
| **T-table（本文目标）** | **高** | 旧版 CDM、OpenSSL 软件实现 |
| S-box 逐字节 | 中   | 256B 表，信号更弱但仍可识别 |
| AES-NI 硬件指令 | **不可见** | 纯寄存器操作，零内存访问 |
| bitslice 实现 | **不可见** | 按 bit 并行运算，无查表 |
| **LZMA VM 字节码（新版 CDM）** | **极低** | T-table 访问被 VM 间接寻址打散（见 §7.5） |

笔者在 Chrome CDM 4.10.2934 的后续研究中验证了最后一行：新版 CDM 将 AES 编码为 VM 字节码，T-table 模式被打散，热力图上不再有清晰信号。因此本文方法适用于 **旧版 T-table CDM**，对新版 VM 保护或硬件 AES 无效——这也是 Google 持续更新 CDM 的安全意义所在。

正如拉马努金不需要分解 1729 的质因数就能看到立方结构，笔者不需要逆向 VM 指令集就能从 trace 中看到 AES 的轮结构。 **注意力落在正确的维度上，问题的解就自然浮现。**

* * *

## 三、逆向前的知识准备

### 3.1 Widevine DRM 架构与安全等级

Widevine CDM（Content Decryption Module）在 Android 平台上以共享库形式存在。需要说明的是，CDM 在不同的 Android 版本中以不同的库名出现：

| 库名  | Android 版本 | 接口层 | 本研究使用 |
| --- | --- | --- | --- |
| `libwvdrmengine.so` | Android 7 及更早 | 旧版 DRM HAL (legacy) | Neodyme 博客中提及此名称 |
| `libwvhidl.so` | Android 8+ (Treble) | HIDL HAL (`android.hardware.drm@1.x`) | **本研究实际使用** （build 4464, x86, 2018-04-20） |

两者的核心白盒 AES 代码是 **同一套**—— `libwvhidl.so` 是将 `libwvdrmengine.so` 的 DRM 引擎封装进 HIDL 接口层后的产物。区别仅在于外层的 HAL 接口（HIDL vs legacy），内部的 VM 解释器、T-table、白盒 AES 实现完全一致。本文在 Qiling 仿真中加载的是 `libwvhidl.so` （从 Android 9 x86 模拟器中提取），但为了与 Neodyme 的术语保持一致，部分段落沿用了 `libwvdrmengine.so` 的名称——读者可以将两者视为同一个 CDM 的不同封装。

CDM 负责与 Widevine License Server 进行密钥交换，获取 AES-128（通常为 CBCS 模式）的内容密钥，并将解密操作限制在受保护的代码路径中。

L3 级别的 CDM 没有 TEE 支持，密钥保护完全依赖白盒密码学（详见 Chow et al. 2002）。CDM 首次启动时通过 provisioning 注册设备身份，生成 `keybox` （文件 `ay64.dat` ），此后每次播放使用其中的密钥认证。

### 3.2 白盒密码学（White-Box Cryptography）

**白盒 AES** 是白盒密码学（White-box Cryptography）的主要实例。传统密码学的安全模型假设攻击者只能观察输入和输出（黑盒模型），而白盒模型假设攻击者拥有 **完整的可执行代码和执行环境的控制权**——这恰恰是软件 DRM 的现实威胁场景。

白盒 AES 的核心思想（ [Chow 等人，2002](https://link.springer.com/chapter/10.1007/3-540-36492-7_17) ）是将 AES 的密钥调度与加密操作合并为一系列预计算的查找表（T-table）。在标准 AES 中，SubBytes + MixColumns 操作可以表示为 4 个 256×32-bit 的 T-table 查找；白盒实现将 **轮密钥嵌入 T-table 的输入编码**，使得每个查找 `T[x]` 实际执行的是 `T[x ⊕ k_i]` ，其中 `k_i` 是轮密钥字节。攻击者即使完整 dump 了 T-table，看到的也只是密钥与 S-box 的复合函数。

#### 3.2.1 商业化白盒保护的五层防线

实际部署的白盒方案远比学术原型复杂。以 Widevine L3 build 4464 为例，笔者在逆向过程中遇到了以下 **逐层递增的防护**：

| 防护层 | 技术手段 | 对分析的影响 |
| --- | --- | --- |
| **L1: 代码混淆** | [OLLVM](https://github.com/obfuscator-llvm/obfuscator) 风格的控制流平坦化 + 虚假分支 | 静态反编译的函数控制流图变为巨大的 switch-case 结构，Ghidra 无法自动恢复原始逻辑 |
| **L2: VM 字节码** | 自定义 VM 解释器（ `cwkfcplc` 调度器），AES 操作编码为 VM 指令而非原生 x86 | T-table 地址在运行时动态分配，无法通过静态分析定位；DFA 的故障注入点需要从 trace 中实时发现 |
| **L3: LCG 加密** | VM 函数的字节码以 LCG（线性同余生成器， `m=0x19660d, a=0x3c6ef35f` ）加密存储 | 必须先 hook 校验函数 dump 解密后的字节码，才能进行反编译 |
| **L4: 完整性校验** | 函数 `rfdncxfe` （Neodyme 在博客中给出的混淆后函数名，原始名称未知——CDM 经过 strip 和符号混淆，所有导出函数名都是无意义的随机字符串）负责在 VM 执行每个字节码函数前计算 CRC 校验和 | DFA 故障注入会改变字节码的执行结果，导致校验和不匹配、VM 拒绝继续执行。笔者在 c 区域 DFA 中花费大量时间才定位到这一层校验是失败的根因 |
| **L5: 密钥分离** | 不同 AES 路径使用不同的 VM PC 地址段和独立的 T-table | 攻击 ROOT_KEY 的 DFA 参数无法直接迁移到 derived_key 提取——这正是 Neodyme 博客中 **未公开的核心难点** |

笔者在实战中的切身体会是： **每一层防护不会独立生效，而是层层嵌套、相互增强**。例如，L2（VM 字节码）使得 L5（密钥分离）的发现依赖于运行时 trace 而非静态分析；L4（完整性校验）使得对 L2 内部逻辑的故障注入需要先 bypass L4——而 bypass L4 本身又需要理解 L3（LCG 加密）的结构来定位 `rfdncxfe` 的入口点。

这种 **防护层间的耦合效应** 是商业白盒方案相对于学术原型的核心竞争力，也是纯理论分析（如 [Patat et al. 2025](https://arxiv.org/abs/2204.09298) 坦承的 “we did not even get to break into the underlying obfuscation”）难以直接转化为工程突破的根本原因。

> **实战教训**：笔者在 derived_key 提取过程中，先后尝试了以下失败路径：(1) 直接复用 Neodyme 的 `FAULT_START_ADDR` 攻击 d 区域 → 地址不匹配，0 命中；(2) 对 AES-CBC 非首块进行 DFA → CBC 链式效应污染故障模式；(3) 在加载模式下攻击 d 区域 → 解密路径与加密路径使用不同代码段；(4) 对 “c 计算 AES” 进行 DFA → 该 AES 不存在（c 是编译时常量）。 **真正的突破只在 trace 可视化之后才出现**——这进一步印证了"注意力校准"的重要性。

**差分故障攻击（DFA，Differential Fault Analysis）** 由 Boneh、DeMillo 和 Lipton 于 1997 年提出，最初针对硬件实现。对白盒 AES 的 DFA 攻击由 Riscure 的研究者系统化， [Quarkslab 的博客](https://blog.quarkslab.com/differential-fault-analysis-on-white-box-aes-implementations.html) 给出了标准实施方案。其原理如下：

-   AES-128 共 10 轮，轮密钥由初始密钥经密钥调度（Key Schedule）派生；
-   在第 9 轮（倒数第二轮）的 MixColumns 之后、第 10 轮 SubBytes 之前，通过单字节随机故障改变一个 state 字节；
-   由于 ShiftRows 的置换关系，第 9 轮的单字节故障会以 `{0,7,10,13}` / `{1,4,11,14}` / `{2,5,8,15}` / `{3,6,9,12}` 的列模式传播到密文；
-   收集足够多的故障密文与正确密文的差分对，可以通过 [phoenixAES](https://github.com/SideChannelMarvels/JeanGrey) 等工具直接恢复第 10 轮轮密钥，再反推初始密钥。

对于软件白盒实现，“故障注入"通过指令跳过（instruction skip）模拟：在仿真环境中，让 AES 计算跳过第 9 轮中某一列的特定指令，相当于向该列注入了随机故障。 [Neodyme 的 `fault.py`](https://neodyme.io/en/blog/widevine_l3) 正是基于此原理，在 [Qiling 框架](https://github.com/qilingframework/qiling) 中实现了对 L3 CDM 的自动化 DFA。

#### 3.2.2 侧信道攻击谱系与 DFA 定位

要理解 DFA 为什么能在 **全部代码可见** 的条件下依然有效提取密钥，需要回溯其理论渊源。

**侧信道攻击（Side-Channel Attack）** 的核心洞察是：密码算法的安全性证明假设攻击者只能看到输入和输出（黑盒模型），但现实中攻击者还能观察到 **执行过程中的物理泄露**——功耗、电磁辐射、时间差异、甚至声音。这些"侧信道"携带了密钥的信息。

| 攻击类型 | 观察量 | 典型场景 | 效果  |
| --- | --- | --- | --- |
| 简单功耗分析 (SPA) | 功耗波形 | 智能卡 RSA | 直接读取密钥比特 |
| 差分功耗分析 (DPA) | 统计功耗差异 | AES 硬件实现 | 恢复轮密钥 |
| **差分故障分析 (DFA)** | **故障输出 vs 正确输出** | **AES 软/硬件** | **恢复轮密钥** |
| 差分计算分析 (DCA) | 执行 trace 中的内存值 | 白盒软件 | 统计恢复密钥字节 |
| 缓存时间攻击 | cache hit/miss 时间差 | OpenSSL AES | 恢复 T-table 索引 → 密钥 |

**DFA 对白盒 AES 的适用性** 来自一个关键观察：白盒实现虽然隐藏了密钥，但它仍然执行的是 **AES 的数学结构**——SubBytes、ShiftRows、MixColumns、AddRoundKey 这四个操作的组合。DFA 不需要知道密钥在哪里，它利用的是 AES 结构本身的 **差分传播特性**：

1.  **在第 9 轮注入单字节故障** （通过跳过一条指令模拟）
2.  故障经过 MixColumns 扩散到 **4 个字节** （同一列）
3.  在第 10 轮（最终轮，无 MixColumns），这 4 个字节经过 SubBytes + ShiftRows 后出现在输出的 **固定位置**
4.  对比故障输出和正确输出， **4 个字节的差分** 直接约束了第 10 轮轮密钥的可能值
5.  收集足够多的故障对（通常 8-40 个），轮密钥被唯一确定

**为什么"跳过指令"等价于"注入故障”？** 在物理 DFA 中，攻击者用激光或电压毛刺改变芯片中的一个比特。在软件白盒中，有多种方式模拟"故障"：

| 故障注入方式 | 实现方法 | 效果  | 本文选择 |
| --- | --- | --- | --- |
| **指令跳过（instruction skip）** | `ql.arch.regs.arch_pc += size` ，跳过目标指令不执行 | 目标寄存器保留前一条指令的残留值 → 等效于随机故障 | **✅ 本文使用** |
| 寄存器置零 | 在目标指令执行后将某个寄存器清零 | 产生确定性故障（0 值），差分模式可预测 | 可用但故障模式不够随机 |
| 内存篡改 | 修改 T-table 中的某个字节 | 等效于改变 S-box 输出，故障注入更精确 | 需要知道 T-table 内部结构 |
| 随机字节覆写 | 将某个寄存器值替换为 `random.randint(0,255)` | 产生均匀分布的随机故障 | 可用，但指令跳过更简单 |

笔者选择 **指令跳过** 是因为它最简单——只需一行 `hook_code` 回调，不需要知道目标指令操作的是哪个寄存器或内存地址。跳过后，目标寄存器保留上一条指令的残留值，这个残留值对于 DFA 来说足够"随机"。Neodyme 的 `fault.py` 也使用了相同的方式。

**列故障模式（Column Fault Pattern）** 是判断故障是否有效的标准。要理解为什么只有特定的 4 字节差分才有用，需要追溯 AES 最后两轮的数学结构：

**第 9 轮** 的操作顺序是 SubBytes → ShiftRows → **MixColumns** → AddRoundKey。MixColumns 是一个 **列内混合** 操作——它把同一列的 4 个字节线性混合在一起。如果在第 9 轮的 MixColumns 之前，某一列的某个字节被故障改变了，MixColumns 会把这个故障 **扩散到该列的全部 4 个字节**——但不会影响其他 3 列。

**第 10 轮** （最终轮）只做 SubBytes → ShiftRows → AddRoundKey， **没有 MixColumns**。ShiftRows 把 4×4 矩阵的每一行循环左移不同的位数（第 0 行不移，第 1 行移 1，第 2 行移 2，第 3 行移 3），这导致第 9 轮同一列的 4 个字节在输出中被 **重新排列到固定的位置**：

```
第 9 轮 Column 0 的 4 个字节 → 经 ShiftRows 后出现在输出的 {0, 7, 10, 13}
第 9 轮 Column 1 的 4 个字节 → 输出 {1, 4, 11, 14}
第 9 轮 Column 2 的 4 个字节 → 输出 {2, 5, 8, 15}
第 9 轮 Column 3 的 4 个字节 → 输出 {3, 6, 9, 12}
```

所以，一个"干净列故障"的含义是：故障密文与正确密文相比， **恰好有 4 个字节不同，且这 4 个字节的位置严格符合上述某一列的模式**。这证明故障发生在第 9 轮的某一列内部（MixColumns 扩散了它），并且没有影响其他列。

**为什么只有这种模式才有用？** 因为 phoenixAES 的数学求解依赖一个前提： **已知故障发生在哪一列**。当差分模式为 `{0,7,10,13}` 时，phoenixAES 知道故障在 Column 0，就可以对 Column 0 对应的 4 个轮密钥字节建立方程组求解。如果差分不符合任何列模式（比如 3 个字节、5 个字节、或跨越两列的 4 个字节），说明故障位置不在 MixColumns 之前的单列内——这种情况下方程组不成立，必须丢弃。

每列需要约 2–3 个独立的干净故障即可唯一确定 4 个轮密钥字节。4 列 × 2–3 个 = 8–12 个干净列故障即可恢复全部 16 字节的第 10 轮轮密钥。实际操作中笔者收集了 95 个（富余量确保每列覆盖充分）。 [phoenixAES](https://github.com/SideChannelMarvels/JeanGrey) 工具自动完成从故障密文到轮密钥的数学求解。

> **推荐学习资源**：对 DFA 原理的系统理解，推荐阅读 Quarkslab 的博客 [*DFA on White-box AES*](https://blog.quarkslab.com/differential-fault-analysis-on-white-box-aes-implementations.html) （完整的方法论和工程实现），以及 [Riscure 的 DFA 教程](https://www.yourdigitallock.com/post/differential-fault-analysis-on-white-box-aes) （从理论到实践的逐步讲解，含 MixColumns 故障扩散的图示）。

BGE 攻击（Billet、Gilbert、Ech，2004 年）从代数角度对白盒 AES 的 T-table 结构发起攻击，但该攻击的前提是 T-table 包含密钥混入（key-mixed）——如笔者在第五节中所述，Widevine L3 的 T-table 是标准 AES，不含密钥混入，BGE 攻击在此场景下不适用。

### 3.3 Keybox 128 字节结构详解

Widevine L3 keybox 是 128 字节的二进制结构，经 AES-128-CBC（IV 全零）加密后存储为 `ay64.dat` 。下图以字节级色彩映射直观展示了 128 字节的完整布局：

![Keybox 128 字节结构可视化](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f5332cde92144c72.png)

解密后的明文结构如下：

| 偏移  | 长度  | 字段  | 说明  |
| --- | --- | --- | --- |
| 0x00 | 32  | `device_id` | 设备标识，ASCII 字符串 + null 填充 |
| 0x20 | 16  | `device_key` | 设备密钥，16 字节随机值 |
| 0x30 | 4   | `version` | 固定值 `0x00000002` ，大端序 |
| 0x34 | 4   | `level3_version` | 固定值 `0x00001170` ，大端序 |
| 0x38 | 16  | `c` | Provisioning token nonce，编译时常量 |
| 0x48 | 48  | `d` | AES-CBC 加密的 provisioning 数据 |
| 0x78 | 4   | `magic` | ASCII 字符串 `kbox` |
| 0x7C | 4   | `crc` | CRC32-MPEG2(`keybox[0:0x7C]`)，大端序 |

文件完整性由 CRC32-MPEG2 校验（初始值 `0xFFFFFFFF` ，多项式 `0x04C11DB7` ），整体由 ROOT_KEY 加密。 `d` 区域的结构在本次研究中首次通过 DFA + 内存分析完整还原，详见 §4.4（阶段 ③）。

* * *

## 四、逆向工程过程

### 4.1 分析环境搭建

笔者的分析环境基于 [Qiling 框架](https://github.com/qilingframework/qiling) ，一个支持多架构、多平台的用户态仿真器，用于运行 Android x86 版本的 CDM 共享库（build 4464，2018-04-20 编译）。Qiling 的主要优势在于其精确的用户态仿真和丰富的 hook 接口，允许笔者在不修改二进制的情况下插入故障、捕获内存访问。

#### 4.1.0 实验环境与完整工具链

以下是本次研究各环节涉及的硬件、软件与工具，及其在整个逆向链路中的角色：

**硬件与操作系统**

| 项目  | 配置  |
| --- | --- |
| 主机  | Ubuntu 22.04 LTS, x86_64, Dual Intel Xeon E5-2673 v4 (80 threads), 96GB RAM |
| Android 模拟器 | Android Studio Emulator, API 28 (Android 9), x86 镜像 |
| 目标二进制 | `libwvhidl.so` (CDM build 4464, 2018-04-20, x86)，文中部分段落沿用 Neodyme 术语称 `libwvdrmengine.so` （见 §3.1 说明） |
| keybox 文件 | `ay64.dat` （128 字节 AES-CBC 加密的 keybox） |

> 关于 CDM build 4464 的覆盖范围、吊销状态及密钥适用性，详见附录 D。

**逆向分析工具**

| 工具  | 版本  | 用途  | 所属阶段 |
| --- | --- | --- | --- |
| [Qiling](https://github.com/qilingframework/qiling) | 1.4.6 | DFA 故障注入、内存 trace、快照恢复 | Phase 1–3 |
| [phoenixAES](https://github.com/SideChannelMarvels/JeanGrey) | —   | 从列故障密文自动恢复 AES 轮密钥 | Phase 1–2 |
| [Ghidra](https://ghidra-sre.org/) | 11.0 | headless 反编译 84 个 VM 函数 (~6640 行 C) | 辅助分析 |
| [Frida](https://frida.re/) | 16.x | 运行时 hook、RSA 公钥提取 | Phase 5 |
| [KeyDive](https://github.com/hyugogirubato/KeyDive) | —   | 从 CDM 进程提取 RSA 私钥 | Phase 5 |
| [mitmproxy](https://mitmproxy.org/) | 10.x | HTTPS 中继，捕获 provisioning 流量 | Phase 5a |
| [matplotlib](https://matplotlib.org/) | 3.8 | Trace 散点可视化 (TraceGraph 方法) | Phase 2 |
| SQLite | 3.x | 内存访问 trace 存储与查询 | Phase 2 |

**验证与生产工具**

| 工具  | 用途  | 所属阶段 |
| --- | --- | --- |
| `gen_keybox.py` (自研) | 纯 Python keybox 批量生成 | Phase 4 |
| `fault_d_creation.py` (自研) | 创建模式 DFA 自动化脚本 | Phase 2 |
| `trace_creation.py` / `trace_viz.py` (自研) | Trace 采集与可视化 | Phase 2 |
| [pywidevine](https://github.com/devine-dl/pywidevine) | RSA 私钥打包为 `.wvd` 设备文件 | Phase 5 |
| DrmTrigger (Android App) | 触发模拟器上的 DRM provisioning | Phase 5a |
| MSL 客户端脚本 | Netflix licensedManifest 验证 | Phase 5b |

**关键 Python 依赖**

| 包   | 作用  |
| --- | --- |
| `pycryptodome` | AES-CBC 加密/解密 |
| `construct` 2.10 | protobuf / keybox 二进制结构解析 |
| `r2pipe` | radare2 Python 绑定（辅助） |

#### 4.1.1 仿真器技术栈：QEMU → Unicorn → Qiling

笔者选择 Qiling 作为分析工具并非随意——它在仿真器技术栈中占据独特位置：

| 工具  | 层级  | 本研究用途 | 为什么选它 |
| --- | --- | --- | --- |
| [QEMU](https://www.qemu.org/) | 完整系统仿真 | Android 模拟器底层 | 运行真实 CDM + provisioning |
| [Unicorn](https://www.unicorn-engine.org/) | CPU 指令仿真 | Qiling 的底层引擎 | —   |
| **[Qiling](https://github.com/qilingframework/qiling)** | **用户态仿真** | **DFA 故障注入 + 内存 trace** | **微秒级快照恢复，95 次 DFA 仅需 5 分钟** |
| [unidbg](https://github.com/zhkl0228/unidbg) | Android 用户态 | 对照验证 | Java 生态 |
| [Frida](https://frida.re/) | 动态插桩 | RSA 公钥提取、KeyDive | 真机/模拟器运行时 hook |

选择 Qiling 的核心原因：DFA 需要 **快照 + 确定性重放**。 `ql.save()` / `ql.restore()` 微秒级切换状态，每次故障注入只重跑几千条指令。同样的工作在 QEMU 上每次需重启 30 秒，总耗时差 10 倍以上。

核心仿真配置如下：

```python
ql = Qiling(
    ["libwvdrmengine.so"],
    rootfs,
    multithread=True,       # 支持 pthread 信号量
    ostype=QL_OS.LINUX,
    archtype=QL_ARCH.X86,
    verbose=QL_VERBOSE.DEFAULT,
)
```

Android 9 rootfs 来自 [AvalonsWanderer/widevine-l3-playground](https://github.com/AvalonsWanderer/widevine-l3-playground) ，该项目是 Neodyme 工具链的公开实现基础。

除 Qiling 仿真外，笔者还使用 [Ghidra](https://ghidra-sre.org/) 对 84 个 VM 函数进行了 headless 反编译，生成约 6640 行 C 代码，用于辅助理解 CDM 的控制流结构。

### 4.2 阶段 ①：ROOT_KEY 提取（加载模式 DFA）

> 笔者首先需要解决的是 `ay64.dat` 的文件加密密钥。已知 CDM 在加载 keybox 时执行白盒 AES-CBC 解密——这正是 DFA 的经典目标。笔者选择直接复现 Neodyme 的 `fault.py` 作为起点。成功的判据很明确：用恢复的密钥解密 `ay64.dat` ，末尾应出现 `kbox` magic 且 CRC32 校验通过。

ROOT_KEY 是 keybox 文件加密密钥，用于 `AES_CBC_ENCRYPT(ROOT_KEY, plaintext_keybox, IV=0) = ay64.dat` 。

**方案选择**：Neodyme 已在博客中公开了 `fault.py` 的完整实现，笔者选择直接复现其方法作为基线。攻击目标是 CDM 的 **加载模式** （loading mode）——即 `ay64.dat` 存在时，CDM 读取并解密 keybox 的过程。

**实施步骤**：

| 步骤  | 操作  | 说明  |
| --- | --- | --- |
| 1   | 确保 `ay64.dat` 存在 | 触发加载模式（非创建模式） |
| 2   | 设置 `FAULT_START_ADDR = 0x6802E275` | AES 第一轮 T-table 读取起始 |
| 3   | 设置 `EVAL_HOOK_PC = 0x6802E8C1` | AES 输出写入完成的评估点 |
| 4   | 循环：跳过第 N 条指令，比较输出 | 寻找 4-byte 列故障 |
| 5   | 收集 ≥8 个干净列故障 | phoenixAES 最低需求 |

**执行结果**：

-   `FAULT_START_ADDR = 0x6802E275` ：AES 第一轮 T-table 读取起始地址，作为故障注入窗口的起点；
-   `EVAL_HOOK_PC = 0x6802E8C1` ：AES 输出写入完成时的程序计数器，作为评估点。

通过 150 次干净故障（clean faults，即成功改变输出且未导致 crash 的指令跳过），笔者向 [phoenixAES](https://github.com/SideChannelMarvels/JeanGrey) 提供了足够的故障密文对，恢复出第 10 轮轮密钥，反推得到：

```
ROOT_KEY = da39a3ee5e6b******55bfef95601890
```

**验证与推断**：拿到 ROOT_KEY 后，笔者首先通过解密 `ay64.dat` 验证其正确性——解密后的 keybox 最后 4 字节为 `kbox` magic，CRC32-MPEG2 校验通过。

随后笔者注意到一个值得深究的巧合：ROOT_KEY 的 hex 值 `da39a3ee5e6b******55bfef95601890` 看起来非常眼熟。笔者提出 **猜测**：这是否是某个已知值的哈希？

验证：

```python
>>> hashlib.sha1(b'').hexdigest()[:32]
'da39a3ee5e6b******55bfef95601890'
```

**确认**：ROOT_KEY = `SHA1("")[:16]` ——空字符串的 SHA-1 哈希前 16 字节。这并非巧合。CDM 通过 `wvoec3::getUniqueID()` 获取设备唯一标识用于派生 ROOT_KEY；在 Qiling 仿真环境中，由于 `__system_property_get("ro.serialno")` 的底层调用未被正确拦截， `getUniqueID()` 实际返回空字符串，导致 ROOT_KEY 退化为这一确定性常量。

这一推断产生了一个 **可测试的预测**：在真实 Android 模拟器上（serial = `EMULATOR36X5X11X0` ），ROOT_KEY 应当等于 `SHA1("EMULATOR36X5X11X0")[:16] = 544ea1f03b72******c98d6ea52c7a` 。笔者后续通过 `adb pull` 获取真机 keybox 并尝试解密， **验证了该预测**——真机 ROOT_KEY 确实不同于 Qiling 的值，且精确等于 `SHA1(serial)[:16]` 。

### 4.3 阶段 ②：derived_key 提取（创建模式 DFA）

> 这是整个研究中最困难的一步，也是 Neodyme 博客中刻意留白的部分。笔者最初假设 d 区域的加密与 ROOT_KEY 共享同一套白盒 AES——这个假设很快被证伪（9600 次故障注入，0 次命中）。失败迫使笔者重新审视 CDM 架构：如果存在多条独立的 AES 路径，就需要先定位 d 区域 AES 的地址空间，然后才能实施 DFA。这引出了 Trace 可视化的思路。

derived_key 的提取是本次研究的 **核心突破**，也是 Neodyme 博客中未曾公开的部分。以下是完整的思考和试错过程。

#### 4.3.1 问题定义与初始失败路径

Keybox 中的 `d` 区域（48 字节）是 provisioning token 的核心数据。笔者的第一个 **假设** 是：d 区域的 AES 加密应当与 ROOT_KEY 的 AES 解密共享同一白盒实现，只是密钥不同。

基于这一假设，笔者直接复用了 Neodyme 的 `FAULT_START_ADDR = 0x6802E275` 对 d 区域发起 DFA。 **结果：0 次命中。** 在 9,600 余个 fault target 中，没有任何一次改变了 d 区域的输出。

9,600 次全部未命中意味着什么？笔者逐步排除可能的原因：

1.  **故障窗口选错了？** 不太可能——同一个窗口对 ROOT_KEY 的 DFA 能产生 150 次干净故障，代码本身是可以被注入的。
2.  **d 区域的输出观测点选错了？** 笔者验证了观测点确实指向 d 区域在内存中的写入位置，没有问题。
3.  **`0x6802E275` 这段代码在当前运行模式下根本没有执行？** 这是最合理的解释。Neodyme 的 `fault.py` 是在 `ay64.dat` **已存在** 的情况下运行的——CDM 读取并 **解密** 已有的 keybox（加载模式）。但笔者要攻击的是 d 区域的 **加密**——这发生在 `ay64.dat` **不存在** 时，CDM 首次 **生成** keybox（创建模式）。

**关键推断**：ROOT_KEY DFA 的地址段（ `0x6802e275` 附近）属于 **加载模式的解密路径**——仅在 CDM 读取已有 keybox 时执行。d 区域的加密发生在 **创建模式** （ `ay64.dat` 不存在，CDM 首次生成 keybox 时），使用的是一条 **完全独立的 AES 代码路径**，地址段不同。这解释了为什么在加载模式下对 d 区域做 DFA 完全无效——那段加密代码根本没被执行。

这一推断并非凭空猜测，而是有直接的 **实验证据**。笔者分别在两种模式下运行 CDM，观察 `0x6802e275` 处的代码是否执行：

```python
# 实验 1：加载模式（ay64.dat 存在）— Neodyme 的 fault.py
assert os.path.exists("rootfs/.../ay64.dat")   # 文件存在
ql.run()
# 结果：0x6802e275 被执行 → ROOT_KEY DFA 产生 150 次干净故障 ✅

# 实验 2：创建模式（ay64.dat 删除）— 笔者的 fault_d_creation.py
os.remove("rootfs/.../ay64.dat")               # 删除文件，强制创建模式
ql.run()
# 结果：0x6802e275 从未执行 → 同一地址的 DFA 产生 0 次命中 ❌
# 但 0x6802a2a2 处出现了新的 T-table 活动（通过 trace 热力图发现）
```

同一个二进制、同一个仿真环境，唯一的差异是 `ay64.dat` 是否存在——CDM 的行为完全不同。这证明内部确实存在基于文件是否存在的分支（CDM 的 `.rodata` 段中可以找到 `"Could not find %s"` 和 `"Installed keybox from %s"` 等日志字符串，间接印证了文件检测逻辑的存在，但由于 OLLVM 混淆 + PIC 寻址，笔者未能在反编译中精确定位到该分支的 x86 指令）。

这一推断引出第二个 **假设**：CDM 内部存在两条或更多独立的白盒 AES 实现，各自拥有不同的 VM 程序计数器地址段和密钥。验证这一假设需要找到 d 区域 AES 的具体 PC 范围——这正是 trace 可视化要解决的问题。

#### 4.3.2 Trace 可视化：从 637K 次内存访问中提取 AES 信号

Neodyme 在博客中对这一步的描述非常简洁： *“trace 内存访问 → 画成图像（X 轴 = 内存地址，Y 轴 = 时间）→ 从图像中视觉识别出 T-table 查找结构 → 对识别出的位置实施 DFA”*。笔者的方法与 Neodyme 完全同源（均受 [Quarkslab TraceGraph](https://blog.quarkslab.com/differential-fault-analysis-on-white-box-aes-implementations.html) 启发），但 Neodyme 只公开了 ROOT_KEY（加载模式）的结果，d 区域 AES（创建模式）的定位过程被留白。以下是笔者独立完成这一步的详细记录，展开 Neodyme 一句话背后的具体操作： **采数据 → 画热力图 → 圈出可疑区域 → 确认 → 放大 → 读参数**。

##### 第一步：采数据

笔者编写 `trace_creation.py` ， **删除 `ay64.dat` 强制 CDM 进入创建模式** （Neodyme 未提及这一操作——他们的 `fault.py` 只针对加载模式；要触发 d 区域加密，必须让 CDM “认为"自己首次启动）。通过 Qiling 的 `ql.hook_mem_read()` / `ql.hook_mem_write()` 记录每条内存访问，存入 SQLite。采集结果： **637,000 条记录**。

##### 第二步：画热力图，圈出可疑区域

把 637K 条记录画成热力图：X 轴 = 内存地址，Y 轴 = 时间（IC），颜色深浅 = 该位置被访问的次数（右侧色阶条：暗 = 少，亮 = 多）。 **不做任何过滤，直接画全量数据。**

![热力图 + 全部活跃区域标注](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c36c82b373466300.png) *热力图中标注了 A–J 共 10 个活跃地址区域（右侧图例逐一说明）。每个有亮度的区域都需要判断：是不是 AES T-table？*

画完之后，用两个条件逐一排查 **所有亮区**：

**条件 1——亮度（访问密度）。** AES T-table 每轮被读 16 次、10 轮共 160 次、多次调用累计上千次——同一地址区域被反复命中，在热力图上呈现为 **持续的亮色竖条**。

**条件 2——宽度（地址跨度）。** AES T-table = 4 个表 × 1024 字节 = **约 4KB**。太宽（如 B 区 3.3KB 但读写均衡，不是只读查表）或太窄（如 A 区 1KB）都不符合。

用这两个条件逐一排查图中的 10 个亮区：

| 区域  | 地址范围 | 大小  | 访问次数 | 亮度  | 宽度  | 判定  | 原因  |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A   | `0x68020000` | 1KB | 119K | 高   | 太窄  | ❌   | VM dispatcher，读写各半 |
| B   | `0x68021000` | 3.3KB | 122K | 高   | 接近  | ❌   | VM 字节码存储，读写均衡（非只读查表） |
| C   | `0x68022000` | 1KB | 16K | 中   | 太窄  | ❌   | VM 工作缓冲区 |
| D   | `0x68023000` | 1KB | 47K | 中高  | 太窄  | ❌   | LCG 状态/校验 |
| E   | `0x68024000` | 1KB | 79K | 高   | 太窄  | ❌   | VM 分发表 |
| F   | `0x68025000` | 1KB | 41K | 中高  | 太窄  | ⚠️  | S-box（256B），AES 第 10 轮用，但不是 T-table |
| **G** | **`0x68026000`** | **1.8KB** | **130K** | **最高** | —   | **✅** | **T-table 核心区（T0–T1），与 H 合计 ≈4KB** |
| **H** | **`0x68027000`** | **1KB** | **11K** | 中   | —   | **✅** | **T-table 扩展区（T2–T3），与 G 合计 ≈4KB** |
| I   | `0x68028000` | ~10KB | 28K | 低   | 太宽  | ❌   | keybox 数据缓冲区，分散读写 |
| J   | `0x6802B000` | ~25KB | 17K | 低   | 太宽  | ❌   | 输出/杂项，零散低密度 |

换一种更直观的说法： **想象一个 4KB 宽的矩形框，沿 X 轴（地址方向）从左往右滑动扫描整张热力图。** 在每个位置，统计框内的总亮度——当框滑到 G+H 区（ `0x68026000` – `0x68027000` ）时，框内亮度达到全局最大值。其他位置要么框内亮度不够（I、J 区），要么亮度虽高但集中在框的一小部分（A、E 区只占 1KB，框内 3/4 是空的）。 **4KB 滑动窗口的最大响应位置 = T-table 的候选地址。**

笔者实际编写脚本验证了这个思路——把 4KB 窗口从 `0x68020000` 滑到 `0x68031000` ，统计每个位置的框内读取总数：

![4KB 滑动窗口扫描](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/43806d88ae4cb06a.png) *横轴 = 窗口起始地址，纵轴 = 该 4KB 窗口内的读取总次数。每个柱子代表"如果把 4KB 框放在这个地址，框内有多少次读取”。青色柱 = 峰值附近（窗口覆盖 T-table 地址范围时，密度最高，66,280 次）；黄色柱 = 次高区域（窗口覆盖 VM 字节码/栈等区域时，密度较高但远不及峰值）；灰色柱 = 低密度区域。峰值位置 `0x68025a00` – `0x68026a00` 就是 T-table 的候选地址。*

热力图上肉眼也能看到这个结果（G+H 区的亮度优势太明显了），但滑动窗口提供了 **定量确认**。

##### 第三步：用 Ghidra 确认亮区是 T-table

热力图上找到了可疑的亮竖条（G+H 区），但"亮"只能说明"被反复读取"——还需要确认它的数据结构确实是 T-table。

打开 Ghidra，加载 `libwvdrmengine.so` ，跳转到 `0x68026000` 。笔者看到的是 4 个结构完全相同的 256×4B 数组，但数值不同：

-   **`0x68026000` – `0x680263FF`** （1024 字节）：256 个 4 字节整数
-   **`0x68026400` – `0x680267FF`** （1024 字节）：同样是 256 个 4 字节整数，但值不同
-   T2、T3 在 `0x68027000` 附近的 H 区，结构相同

**怎么确认是 T0–T3 而不是其他查找表？** 标准 AES 的 T-table 有明确的数学定义： `T0[i] = (2·S[i], S[i], S[i], 3·S[i])` ，其中 S 是 AES S-box，乘法在 GF(2⁸) 上进行。T1–T3 分别是 T0 的 **字节循环移位** 变体（T1 = T0 rotated 1 byte, T2 = rotated 2, T3 = rotated 3）。笔者的验证方法是：

1.  取第一个表的第 0 个元素： `T[0] = T0[0x00]` ，与 OpenSSL 源码中 `Te0[0] = 0xc66363a5` 对比 → 匹配
2.  取 `T0[0x63]` （S-box 的输入 0x63 对应 SubBytes 输出 0xfb）→ 与 OpenSSL `Te0[0x63]` 对比 → 匹配
3.  取第二个表的 `T[0]` → 与 `Te1[0]` 对比 → 匹配（是 `Te0[0]` 的 1 字节循环移位）
4.  全部 256×4 个值逐一比对， **4 个表均与 OpenSSL 的 Te0–Te3 完全一致**

至此确认：G+H 区存储的就是标准 AES 的 4 个 T-table（未做密钥混入），CDM 使用了白盒 AES。

另外注意到 F 区（ `0x68025000` ，256 字节）与标准 AES S-box（ `0x63, 0x7c, 0x77, 0x7b, ...`）匹配——这是 AES 第 10 轮使用的 SubBytes 查找表，进一步佐证了 AES 的存在。

##### 第四步：看时间分布，找到笔者要攻击的那组 AES

读者可能会问：既然第三步已经能用 Ghidra 静态分析找到 T-table， **为什么不一开始就直接用 Ghidra，而要先画热力图？**

原因在于： **Ghidra 能告诉你"T-table 在哪个地址"，但不能告诉你"谁在用它、什么时候用、用了几次"。** T-table 是一块静态数据，存在 `.data` 段的固定位置——Ghidra 可以找到它的地址，但 CDM 中有多少个不同的 AES 函数在共享这组 T-table？每个函数在什么时间执行？哪个函数是笔者需要攻击的 d 区域加密？这些问题 Ghidra 无法回答，因为 AES 代码被 OLLVM + VM 字节码层层包裹，静态分析看到的是一团无法理解的控制流。

热力图解决的恰恰是这个问题： **不需要理解代码，直接从运行时数据流中看到"谁在什么时间查了 T-table"**。两者是互补关系：

| 问题  | Ghidra（静态） | 热力图（动态） |
| --- | --- | --- |
| T-table 存储在哪个地址？ | ✅ 直接找到 | 也能找到（亮条位置） |
| T-table 的数据结构是什么？ | ✅ 可验证 256×4B 数组 | ❌ 只看到亮度 |
| 有几个 AES 函数在用 T-table？ | ❌ 代码被 OLLVM 混淆 | ✅ 亮条上的密集段数 = 函数数 |
| 每个函数的执行时间？ | ❌   | ✅ 亮条上的 Y 轴位置 |
| 哪个函数是 d 区域加密？ | ❌   | ✅ 与密文写入时间重叠的那个 |

所以实际流程是： **热力图发现候选 → Ghidra 确认数据结构 → 热力图继续分析时间分布**。第三步的 Ghidra 确认是一个"插入验证"，验证完后回到热力图继续分析。

确认了 T-table 之后，下一个问题是： **CDM 在什么时间点使用了 T-table？** 热力图上 G+H 区的亮竖条从上到下贯穿整个时间轴，说明 CDM 在多个时间点都在查 T-table——但笔者只关心 d 区域 AES（创建模式下加密 keybox 的那次调用）。

把 G+H 区内的所有读取按时间（IC）统计为柱状图：

![T-table 时间分布](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5459357590ca4bdc.png) *横轴 = 时间（IC），纵轴 = 每 10K IC 窗口内的 T-table 读取次数。*

从柱状图上可以清楚看到 T-table 的使用分为 **两个阶段**：

-   **IC 0.7M–3M（大量黄色柱）**：CDM 启动时的 VM 初始化——解释器依次解密约 30 个 VM 函数的字节码，每个函数解密一次就不再重复。这些是"一次性"的 AES 调用，不是笔者的目标。
-   **IC 10M–13.5M（三个窄簇）**：keybox 相关的三次独立 AES 操作，每组之间有几十万 IC 的空白间隙，时间上完全分离。

三个窄簇分别是什么？笔者用 SQL 查询每个簇内的 T-table 读取点的 VM PC 地址（即：是哪段代码在查 T-table），发现三组 PC 地址完全不重叠：

| 时间位置 | VM PC 范围 | 读取次数 | 是什么 | 为什么这样判断 |
| --- | --- | --- | --- | --- |
| IC ~10M | `0x6802f207` – `0x6802f4bd` | ~200 | VM 函数解密器 | PC 与前面 VM 初始化阶段的模式相同，是最后一批字节码解密 |
| **IC ~11.25M** | **`0x6802a2a2` – `0x6802a8cd`** | **~240** | **d 区域 AES（目标!）** | **PC 地址全新——之前从未出现过，且出现时间与 d 区域密文写入精确重叠** |
| IC ~13.2M | `0x680292bb` – `0x68029823` | ~200 | ROOT_KEY AES | PC 与 Neodyme 公开的 `0x6802E275` 相近，且出现时间与 `ay64.dat` 文件写入重叠 |

**关键推断**：函数 2（IC ~11.25M）的 PC 地址 `0x6802a2a2` 在整个 trace 中 **首次出现** 就在 IC 11.25M——它不是 VM 初始化阶段的旧函数，而是一个全新的 AES 代码路径。结合它的执行时间与 d 区域密文写入的精确重叠，笔者确信这就是 d 区域的加密函数。 **这就是笔者要攻击的目标。**

##### 第五步：放大目标函数，确认 AES-128 的 10 轮结构

锁定了函数 2 的 IC 范围（11.25M–11.26M）后，用 SQL 过滤掉非 T-table 地址的读取（只保留 `0x68025000` – `0x68029000` 范围内的点），VM 噪声被完全滤除。下图展示了第 1 个 AES-CBC 分组（前 16 字节，9 轮 T-table + 1 轮 S-box = 144 个点）的放大视图， **每个彩色框圈出了 1 轮 AES 的全部 T-table 查表点**：

![AES 轮结构详图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b6831ef4abda5f5f.png) *每个框 = 1 轮 AES，框内每个圆点 = 1 次 T-table 查表。绿框 = Group A（奇数轮），黄框 = Group B（偶数轮），红框 = DFA 注入目标轮，紫色小点 = S-box 最终轮（注意 Y 轴位置偏低 = 地址不同）。数框数即可判断 AES 类型。*

怎么确认是 AES-128？

1.  **数簇数**：9 个 T-table 簇 + 1 个 S-box 尾巴 = 10 轮 = AES-128（AES-192 是 11+1，AES-256 是 13+1）
2.  **每簇 ~16 个点**：与 AES 每轮 4×4=16 次查表完全吻合
3.  **Green/Yellow 交替**：奇数轮的 T-table 读取来自 VM 地址段 A（PC `0x6802a2xx` ），偶数轮来自地址段 B（PC `0x6802a5xx` ）。这说明白盒实现 **用两套不同的 VM 字节码分别编码了奇数轮和偶数轮**——功能相同（都是 T-table 查表 + XOR），但字节码不同。这是一种混淆手法：如果攻击者试图通过静态分析字节码来理解 AES 逻辑，他需要分析两段看似不同的代码才能发现它们做的是同一件事。 **对 DFA 的实际意义**：这种交替本身不影响 DFA 攻击（DFA 只关心输出差分，不关心代码用哪套字节码），但它为笔者提供了一个额外的 **轮计数校验**——9 个簇中出现 5 次 Group A + 4 次 Group B = 严格的 A-B-A-B-A 交替 = 确认是 9 个独立的轮而非其他结构
4.  **R10 的 Y 轴偏移**：第 10 轮读取的地址在 `0x68025000` （S-box，256B）而非 `0x68026000` （T-table，4KB），在散点图上 Y 坐标自然偏移——这是 AES 最终轮的签名

d 区域共 48 字节 = 3 个 AES-CBC 分组，因此上图右侧呈现 3 组重复的轮模式。

##### 第六步：从图中读取 DFA 参数

现在每个点的精确坐标（IC 值 + PC 地址）都可以直接从散点图上读取。R9 的位置给出 DFA 故障注入的全部参数：

| 参数  | 值   | 怎么从图中读到的 |
| --- | --- | --- |
| `FAULT_START_ADDR` | `0x6802a2a2` | R1 第一个点的 VM PC——d 区域 AES 第一轮首次 T-table 读取 |
| `EVAL_HOOK_PC` | `0x6802a8cd` | R10 最后一个点的 VM PC——密文写入完成的评估点 |
| `FAULT_TARGET_START` | 1050 | R9 起始 IC − R1 起始 IC = 故障扫描窗口起点 |
| `FAULT_TARGET_MAX` | 1400 | R9 终止 IC − R1 起始 IC + 安全裕量 |
| 快照触发点 | `0x6802a106` | R1 之前、d 区域明文首次写入时刻 |

**为什么在 R9 注入？** R9 是 DFA 的唯一甜蜜点。跳过 R9 中的一条指令 → 故障经 MixColumns 扩散到 4 个字节 → 直接到达 R10（无 MixColumns）输出 = 恰好 4 字节列故障。R10 注入只影响 1 字节（不够），R8 注入影响 8+ 字节（太多）。

**交叉验证**：PC `0x6802a2a2` 在整个 trace 中仅出现 15 次 = 3 个 AES-CBC 块 × 5 个奇数轮（Group A 的 R1/R3/R5/R7/R9），确认这个地址是 d 区域 AES 的专用代码段。

##### 这个方法还适用于哪些场景？

Trace 可视化 + T-table 模式识别不仅限于 Widevine，它是一个 **通用的白盒 AES 定位方法**，适用于任何使用 T-table 实现的 AES 加密。已知的适用场景包括：

| 场景  | 目标  | 适用性 |
| --- | --- | --- |
| 其他 DRM 的白盒 AES | PlayReady 等 DRM 的软件解密路径 | ✅ 只要使用 T-table |
| 移动 App 加固 | 梆梆、爱加密等加固方案中的 AES 密钥提取 | ✅ 大多数加固方案的 AES 仍用 T-table |
| IoT 固件 | 嵌入式设备的 AES 密钥保护 | ✅ 嵌入式通常无 AES-NI |
| WhibOx 挑战赛 | 白盒密码学竞赛中的 AES 实现 | ⚠️ 高级参赛方案可能不用 T-table |
| 新版 Chrome CDM | 4.10.2934+ 的 LZMA VM 字节码 | ❌ T-table 模式被 VM 打散（见 §7.5） |
| AES-NI 硬件加速 | Intel/AMD CPU 上的 `aesenc` 指令 | ❌ 纯寄存器操作，无内存访问 |

**适用条件总结**：目标程序使用 T-table 实现的 AES + 可以在仿真或插桩环境中记录内存访问 trace。满足这两个条件，就可以用本文的方法定位 AES 并实施 DFA。

#### 4.3.3 创建模式 DFA 实施与 95 个列故障

工具 `fault_d_creation.py` 实现了对 d 区域 AES 的自动化 DFA，设计要点如下：

1.  **快照机制（Snapshot）**：在 PC= `0x6802a106` 首次写入 d 区域明文时保存完整仿真器状态，作为后续每次故障注入的起始点，避免每次从头重跑；
    
2.  **故障注入参数**：
    
    -   `FAULT_START_ADDR = 0x6802A2A2` （d 区域 AES 第一轮首指令）
    -   `FAULT_TARGET_START = 1050` （从 FAULT_START 起的第 1050 条指令）
    -   `FAULT_TARGET_MAX = 1400` （故障扫描窗口上限）
3.  **评估触发器**：在 PC= `0x6802a8cd` 处捕获 `d[0:16]` 密文，与参考输出比对，识别有效的列故障；
    
4.  **列故障过滤**：有效故障必须符合 AES 第 9 轮 ShiftRows 后的列传播模式——故障影响必须精确覆盖 `{0,7,10,13}` 、 `{1,4,11,14}` 、 `{2,5,8,15}` 或 `{3,6,9,12}` 之一，其余字节与参考密文完全一致。
    

经过自动扫描，共收集 **95 次干净的列故障** （每列约 24 次，覆盖全部 4 列）。将这些故障数据输入 [phoenixAES](https://github.com/SideChannelMarvels/JeanGrey) 的 `phoenixAES.crack_bytes()` 接口，直接恢复第 10 轮轮密钥：

```
round_10_key = 49B7a21e3c8f******d9e0c17bFB68
```

通过标准 AES 密钥调度算法反向迭代（Key Schedule Inversion），逐轮反推回第 0 轮，得到初始 AES 密钥即 derived_key。

**为什么可以反推？** AES 的密钥调度（Key Schedule）是一个 **可逆函数**。正向过程是：从 16 字节初始密钥 K₀ 依次派生出 K₁, K₂, …, K₁₀ 共 10 个轮密钥，每一步只用到 XOR、字节替换（SubWord）和轮常数（Rcon）——这三个操作都是可逆的。具体来说，已知 K₁₀（第 10 轮轮密钥），可以通过以下步骤逐轮反推：

1.  K₉ 的后 3 列 = K₁₀ 的后 3 列 XOR K₁₀ 的前 3 列（XOR 可逆）
2.  K₉ 的第 0 列 = K₁₀ 的第 0 列 XOR SubWord(RotWord(K₉ 的第 3 列)) XOR Rcon₁₀（SubWord 查 S-box 逆表可逆，Rcon 是常量）
3.  以此类推，从 K₉ 反推 K₈，直到 K₀

整个过程是确定性的——给定任意一轮的轮密钥，都可以唯一地恢复初始密钥。这就是为什么 DFA 只需要恢复第 10 轮轮密钥，就足以得到原始 AES 密钥。 `phoenixAES` 工具内部已封装了这个反推过程。

```
derived_key = b1d941823c9a******5c6d7b61f995dc
```

**验证**：取仿真器生成的已知明文/密文对，计算 `AES_ECB_ENCRYPT(derived_key, known_plaintext)` ，与捕获的 d\[0:16\] 密文精确匹配，验证通过。

![DFA 核心代码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/39e410ef54f5272f.png) *fault_d_creation.py 核心逻辑：指令跳过实现 DFA 故障注入*

![DFA 执行输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/381b827cc730d033.png) *DFA 执行结果：95 个干净列故障，phoenixAES 恢复 derived_key*

### 4.4 阶段 ③：d 区域明文结构逆向

> 拿到 derived_key 后，笔者面对的下一个问题是：被它加密的 48 字节到底是什么？直觉上，既然 d 用于 provisioning 认证，其明文应该包含 device_key。但"应该"不是证据——笔者需要从内存 dump 中逐段识别结构，每个猜测都用密码学运算交叉验证。

derived_key 确认后，下一个问题是：d 区域的 48 字节明文到底包含什么？只有完整还原明文结构，才能实现离线 keybox 生成。

**观察**：通过在仿真器中 dump 快照触发时刻的内存内容，笔者捕获了 d 区域加密前的 48 字节明文，其 hex 值为：

```
002200182942******448c04112484002b78402e91a3******094709472c5d030000000000000000000000
```

**第一步：模式识别。** 笔者首先注意到前 16 字节 `002200182942******448c0411248400` 与 keybox 中的 `device_key` 字段（偏移 `0x20` ） **逐字节一致**。这立即产生了一个 **假设**：d 区域的明文以 `device_key` 为前缀，其后的 32 字节可能是某种校验或派生数据。

**第二步：假设检验——哈希猜测。** 字节 16–35 共 20 字节（ `2b78402e...09472c5d` ），20 字节恰好是 SHA-1 摘要的长度。笔者提出 **猜测**：这 20 字节可能是 `SHA1(device_key)` 。

验证：

```python
>>> hashlib.sha1(bytes.fromhex('002200182942******448c0411248400')).hexdigest()
'2b78402e91a3******094709472c5d'
```

**与实际字节完全匹配。** 猜测得证。

**第三步：剩余字节分析。** 字节 36 为 `0x03` （固定标记），字节 37–47 为 11 个零字节。笔者推断 `0x03` 可能是版本标识或类型字段（与 keybox 中 `version=2` 的设计风格一致），零填充则是对齐到 48 字节（3 个 AES block）的常规做法。

**第四步：交叉验证。** 笔者使用 AES-CBC 对整个 d 区域进行解密验证： `AES_CBC_DECRYPT(derived_key, d, IV=0)` 的前 16 字节恰好等于 `device_key` ，后 20 字节等于 `SHA1(device_key)` ——完整性校验在两个方向上都成立。这一设计使 CDM 在加载 keybox 时能够验证 `device_key` 未被篡改，而无需额外的密码学认证。

完整表达式：

```
d_plaintext = device_key || SHA1(device_key) || b'\x03' || b'\x00' * 11
d = AES_CBC_ENCRYPT(derived_key, d_plaintext, IV=b'\x00' * 16)
```

### 4.5 阶段 ④：gen_keybox.py — 纯 Python keybox 生成器

> 理论上，前三个 Phase 的产出已经构成了离线生成 keybox 的充分条件。但"理论上充分"和"工程上正确"之间往往隔着若干细节陷阱。笔者在实现 `gen_keybox.py` 的过程中踩了两个坑：version/l3_version 字段是大端序（不是 x86 的小端序），CRC32 使用的是 MPEG-2 变体（多项式 `0x04C11DB7` ，初始值 `0xFFFFFFFF` ，不做最终取反）而非 zlib 的标准 CRC32。最终的验证标准也是最严格的：与模拟器原生输出 **逐字节完美匹配**。

掌握 ROOT_KEY、derived_key 和 d 区域明文结构后，实现离线 keybox 生成器就是直接的密码学编排工作。但细节中有两个陷阱值得记录。

`gen_keybox.py` 的核心函数 `make_keybox(device_id, device_key)` 按以下步骤生成 128 字节明文 keybox：

1.  计算 `d_plaintext = device_key + SHA1(device_key) + b'\x03' + b'\x00' * 11` ；
2.  加密 `d = AES_CBC(derived_key, IV=0).encrypt(d_plaintext)` ；
3.  拼装 `prov_token = VERSION(4B BE) + LEVEL3_VERSION(4B BE) + C_VALUE(16B) + d(48B)` ；
4.  拼装 `keybox_body = device_id(32B) + device_key(16B) + prov_token(72B) + b'kbox'` ；
5.  计算 `crc = CRC32_MPEG2(keybox_body)` ；
6.  拼装 `keybox = keybox_body + struct.pack('>I', crc)` （共 128 字节）。

最终加密： `ay64.dat = AES_CBC(ROOT_KEY, IV=0).encrypt(keybox)` 。

通过 `--verify` 模式与模拟器实际输出的 `ay64.dat` 逐字节对比，验证结果： **MATCH = True**，字节完美匹配。

![gen\_keybox.py 核心代码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a3a2a5947001832a.png) *make_keybox() 函数：从 device_key 到完整 128 字节 keybox 的纯 Python 实现*

![gen\_keybox.py 验证输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d3ef416f31b1b358.png) *上： `--verify` 模式，生成的 keybox 与模拟器原始输出逐字节比对，MATCH: True。下： `--batch 5` 模式，批量生成 ALPHA–ECHO 5 个不同 device_id 的 keybox。*

* * *

## 五、端到端验证

### 5.1 阶段 ⑤a：Google Provisioning 验证（6 个 device_key）

> 到这一步，笔者需要回答一个关键问题：Google 的 provisioning 服务器是否只验证密码学正确性，还是会额外检查 device_id 的来源？如果是前者，笔者合成的 keybox 就能通过；如果是后者，就需要使用模拟器原生的 device_key。此外，这一阶段的工程挑战远超密码学本身——模拟器的 IPv6 不通、mitmproxy CA 证书在重启后丢失、iptables DNAT 规则被意外清空，每一个都消耗了大量调试时间。

Widevine provisioning 是 CDM 向 Google 的 `clientauth.googleapis.com` 注册设备身份的过程。CDM 使用 keybox 中的 `device_key` 派生加密密钥，构建 provisioning request protobuf，通过 RSA-OAEP 加密传输，Google 服务器验证后返回设备证书（包含 RSA 私钥，由 Google 签名）。

笔者设计了一套 **两步法 Provisioning 流程** （解决 KeyDive Frida hooks 导致 HTTPS 超时的问题）：

![Provisioning 两步法完整流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/dd0aea9f1ad72c41.png)

具体操作：将 `gen_keybox.py` 生成的 keybox 注入 Android 模拟器的 `ay64.dat` 路径，通过 [mitmproxy](https://mitmproxy.org/) 上游中继将流量转发至 Google 真实服务器。

笔者测试了 6 个不同的 `device_key` 值，全部获得 HTTP 200 响应：

| device_key | Google Provisioning 结果 |
| --- | --- |
| `002200182942******448c0411248400` | HTTP 200 |
| `677af38c2d01******9a5cb1e3491e` | HTTP 200 |
| `cff2e8a13b74******c0d4826a9ffe` | HTTP 200 |
| `4958b7c1d238******e6f09a3dada4` | HTTP 200 |
| `9e65a0f42c81******b3d7e295d436` | HTTP 200 |
| `4ca8d1e07f93******a6b2c481532b` | HTTP 200 |

其中 `device_id` 设置为自定义值 `CLONED_DEVICE_42` ，Google 服务器无异议地接受了该设备标识并完成证书颁发，说明 Google provisioning 不对设备 ID 的格式或来源进行强约束。

#### 为什么批量生产不会被 Google 风控？

这是一个自然的疑问：如果笔者使用同一个 CDM build（4464）批量生成 keybox 并请求 provisioning，Google 是否会检测到异常并拒绝服务？

答案是： **不会，且结构性地不可能。** 理由如下：

1.  **同型号设备的规模效应**：CDM build 4464 来自 2018 年的 Android x86 镜像，对应的 Widevine 版本部署在数以百万计的同型号设备上。Google 无法区分"真实的第 N 台同型号设备"和"笔者生成的第 N+1 台"——它们使用 **完全相同的白盒 AES 密钥** （ROOT_KEY、derived_key），产生 **密码学上不可区分的 provisioning request**。
    
2.  **Neodyme 的关键推断**：Neodyme 在其博客中指出，Widevine L3 的安全模型本质上依赖白盒密码学的不可逆性（key hiding），而 **不依赖设备唯一性**。一旦白盒被攻破，攻击者可以生成无限数量的合法 keybox，因为 Google 服务器端的验证仅检查：(a) provisioning request 的密码学结构是否正确（RSA-OAEP 封装、protobuf 格式）；(b) keybox 中的 `device_key` 是否能正确派生出请求中的加密密钥。这两点均可通过 `gen_keybox.py` 完美满足。
    
3.  **无设备指纹绑定**：与 L1 不同（L1 的密钥存储在 TEE 中，与硬件 fuse 绑定），L3 的 `device_key` 是纯软件生成的随机值，不与任何硬件标识关联。Google 不存在一个"合法 device_key 白名单"——每次 provisioning 都接受全新的随机 `device_key` ，只要密码学封装正确即可。
    
4.  **实验验证**：笔者使用 6 个完全不同的随机 `device_key` 值（包括自定义的 `CLONED_DEVICE_42` 设备标识）全部获得 HTTP 200 响应。如果 Google 有任何形式的异常检测（如同一 IP 短时间内大量 provisioning），在笔者的测试规模下并未触发。
    

综上，批量生产的安全边界不在 Google 服务器端的风控，而在白盒 AES 密钥的保密性——一旦密钥泄露，该 CDM build 的所有安全假设即告失效。这也解释了为什么 Google 选择定期更新 CDM build 并轮换白盒密钥，而非在服务器端增加设备指纹验证。

#### 扩展：为真实手机型号生产 WVD

本文的实验基于 Android x86 模拟器中的 CDM build 4464。如果读者需要为 **特定真实手机型号** （如 Pixel 7、Samsung S23 等）生产对应的 L3 WVD，需要针对该手机的 CDM 版本重复以下流程：

| 步骤  | 操作  | 说明  |
| --- | --- | --- |
| 1\. 获取目标 CDM | 从目标手机中提取 `libwvhidl.so` 或 `libwvdrmengine.so` | `adb pull /vendor/lib/libwvhidl.so` ，不同厂商路径不同 |
| 2\. 配置仿真环境 | 在 Qiling 中加载目标 CDM + 对应 Android 版本的 rootfs | ARM 架构需 ARM 版 Qiling（或交叉仿真） |
| 3\. 重做 Trace + DFA | 对新 CDM 的白盒 AES 重新采集 trace → 散点图定位 → DFA 提取 ROOT_KEY + derived_key | 每个 CDM build 的密钥不同，地址不同 |
| 4\. 还原 keybox 结构 | d 区域结构可能一致（ `dk‖SHA1(dk)‖0x03‖zeros` ），需验证 | version / l3_version 字段可能变化 |
| 5\. gen_keybox.py 适配 | 替换 ROOT_KEY、derived_key、C_VALUE 为新值 | C_VALUE 仍是编译时常量，从新 keybox 中读取 |
| 6\. Provisioning + KeyDive | 在对应型号的真机或模拟器上执行两步法 | 真机需 root + Frida server |

**关键约束**：每个 CDM build 版本拥有独立的白盒 AES 密钥集。本文提取的 ROOT_KEY、derived_key 仅适用于 build 4464。Google 会定期轮换 CDM build（通常随 Android 安全补丁更新），新 build 的密钥需要从零开始提取。

**捷径**：如果目标不是 keybox 量产，而只是获取特定手机的 WVD，更直接的方法是在 root 真机上运行 [KeyDive](https://github.com/hyugogirubato/KeyDive) + DrmTrigger，一次性提取 RSA 私钥——无需经过 DFA 和 keybox 合成的完整链路。本文的 DFA 路线在需要 **批量、离线、不依赖真机** 的场景下才有独特价值。

### 5.2 阶段 ⑤b：Netflix DRM 全流程验证

> 最终验证需要走完从 keybox 到视频解密的全部链路。笔者原本计划让 KeyDive 和 DrmTrigger 同时运行以一步完成 provisioning + 密钥提取，但 Frida 的 hook 开销导致 DrmTrigger 的 HTTPS 请求反复超时。解决方案是将流程拆为两步：先不带 KeyDive 完成 provisioning（让 CDM 全速运行），再重启 HAL 后单独用 KeyDive 抓取已安装的证书。这个看似简单的工程妥协花了笔者近两个小时才定位到根因。

Provisioning 完成后，通过 [KeyDive](https://github.com/hyugogirubato/KeyDive) 从 CDM 内存中提取 RSA 私钥，使用 [pywidevine](https://github.com/devine-dl/pywidevine) 打包为 `.wvd` 格式设备文件。

随后通过一位友人孙先生慷慨提供的 Netflix MSL（Message Security Layer）协议客户端脚本发起完整的 DRM 流程验证。MSL 协议是 Netflix 自研的端到端安全通信框架，基于 CBOR 编码和 Widevine 密钥交换机制。这段脚本的原始作者在 MSL 协议逆向上做了大量精彩的工作，笔者在此表示感谢（具体的 MSL 协议分析是一个独立的研究课题，留待后续探讨）。

以下是 nfmsl 客户端的完整执行输出，展示了从 WVD 加载到内容密钥提取的全过程：

![nfmsl 执行输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b31afc6e50397212.png) *nfmsl.py 完整执行流程：MSL 握手 → licensedManifest → Widevine License Exchange → 内容密钥提取 → 视频下载与解密*

> **给初学者的建议**：如果读者对 DRM 协议逆向感兴趣，笔者建议从 **音乐流媒体** 入手—— [Spotify](https://developer.spotify.com/documentation/) 和 [Tidal](https://tidal.com/) 的 DRM 实现相对简洁（基于 Widevine L3 的标准 CENC 流程），协议复杂度远低于 Netflix 的自研 MSL。这些平台适合用来建立对 DRM 密钥交换、License 解析和内容解密的基础认知，之后再挑战 Netflix 等重量级目标。

验证内容为《心灵猎人》第一季第一集（Mindhunter S1E1）：

| 验证步骤 | 结果  |
| --- | --- |
| Widevine 密钥交换（Key Exchange） | PASS |
| `licensedManifest` 请求 | HTTP 200，响应体 315 KB |
| 视频内容密钥提取 | 成功（KID + 16 字节 Key） |
| 音频内容密钥提取 | 成功（KID + 16 字节 Key） |
| mp4decrypt 解密验证 | H.264/HEVC 960×540 23.98fps，无 block artifact |

两条内容密钥均成功提取，全流程验证通过，证明 `gen_keybox.py` 生成的 keybox 对 Netflix 完全有效。

以下是解密后的视频帧抽样，从两部不同的 Netflix 原创剧集中分别取 3 帧和 2 帧，确认解密结果画面完整、无 block artifact：

![Netflix 解密验证 — 视频帧抽样](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b1c097860a3127e7.png) *上排：《心灵猎人》Mindhunter（ID 80114856）在 t=30s、120s、300s 时的截帧（H.264 960×540）。下排：Netflix ID 82784809 在 t=60s、180s 时的截帧（HEVC 960×540）。解密后画面完整，无 block artifact。*

* * *

### 5.3 批量 WVD 设备文件一览

以下是通过 gen_keybox.py 合成 keybox → Google Provisioning → KeyDive 的完整批量流程产出的 WVD 设备文件：

![生成的 WVD 设备文件一览](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2bfe1f2e3859ca6e.png)

## 六、进阶分析：vendor_key 与 key_mask

### 6.1 BGE 攻击尝试与 T-table 结构分析

Neodyme 的 `secrets.py` 文件（从未公开）中包含 `vendor_key` 和 `key_mask` 两个值， `gen_keybox.py` 从该文件导入这两个值用于生成 `aes_key = vendor_key XOR key_mask` ，进而通过 `AES_DECRYPT(aes_key, c) = derived_key` 建立密钥链。笔者尝试通过 BGE 代数攻击从 T-table 中还原这两个值。

通过 `trace_viz.py` 定位的 T-table 地址范围（ `0x68025000` – `0x68028000` ），笔者提取了 4 个完整的 T-table（T0–T3），每个 256×4 字节。分析结果：

-   这 4 个 T-table 是 **标准 AES MixColumns×SubBytes 查找表**，与 OpenSSL 的参考实现完全匹配， **不包含任何密钥混入**；
-   BGE 攻击的核心假设是 T-table 含有密钥相关的非线性变换，该假设在此不成立；
-   `C_VALUE = 9044aa08302d******e390990c18ed94` 并非运行时 AES 的输出，而是以 `c6` 系列 mov 指令形式直接写入 keybox buffer 的 **JIT 立即数（compile-time constant）**。

这一发现颠覆了笔者最初的假设：笔者原本预期存在一条 `AES(aes_key, input) = c` 的运行时计算路径，但实际上 c 值在编译 CDM 时已预计算并硬编码为汇编立即数。

### 6.2 Frida 运行时 hook：服务端公钥提取

为排除 vendor_key 通过其他运行时路径传递的可能性，笔者使用 [Frida](https://frida.re/) 对 Chrome 浏览器内嵌的 Widevine CDM（libwidevinecdm.so，版本 4.10.2934）进行了运行时分析。

通过 hook `RSA_public_encrypt` ，笔者成功提取了 Widevine provisioning 服务器的 RSA-2048 公钥（modulus N）。进一步分析发现：provisioning request 的外部签名（32 字节 HMAC-SHA256，protobuf field 2）由 CDM 内部的白盒 VM 直接计算， **不经过 BoringSSL 的任何标准 HMAC/SHA API**。

笔者穷举测试了所有合理的签名密钥候选（包括 `privacy_key` 、 `enc_key` 、 `device_key` 、各种 CMAC-KDF 派生值），全部未命中。这与笔者对白盒 T-table 的分析一致：签名密钥与 aes_key 属于同一难度级别，编码在白盒 VM 的执行路径中。

### 6.3 Neodyme secrets.py 之谜：与公开研究的对比

学术论文 [Patat et al. 2025](https://arxiv.org/abs/2204.09298) 在讨论 vendor_key 时明确指出，他们的工作未能突破底层混淆层。结合笔者的分析，对 Neodyme 方法与当前状态的比较总结如下：

| 步骤  | Neodyme 状态 | 本研究状态 |
| --- | --- | --- |
| ROOT_KEY 提取 | 已完成（ `fault.py` ） | 复现 ✅ |
| derived_key 提取 | 未公开 | 独立完成 ✅ |
| d 区域结构还原 | 未公开 | 独立完成 ✅ |
| gen_keybox.py（无 secrets.py） | 依赖 secrets.py | 独立实现 ✅ |
| vendor_key / key_mask | 已有（secrets.py 中，未公开） | 确认为编译时常量，运行时不可恢复 ❌ |
| Google provisioning 验证 | 博客描述通过 | 6 个 device_key 验证 ✅ |
| Netflix 端到端验证 | 未描述 | 完成 ✅ |

核心差异在于：Neodyme 持有的 `secrets.py` 可能包含了对特定 CDM build 版本逆向分析得到的 vendor_key 和 key_mask 实际值，但这两个值本质上是 **制造时密钥（manufacturing-time secret）**，嵌入于每个 CDM 版本的编译产物中，需要对每个 build 单独分析，无法从运行时行为中通用地恢复。

* * *

## 七、讨论与反思

### 7.1 实战难度横向对比

为帮助读者评估本次逆向的技术难度，笔者将其与同类公开研究进行横向对比：

| 对比维度 | David Buchanan (2019) | Patat et al. (2025) | Neodyme (2026) | 本研究 (2026) |
| --- | --- | --- | --- | --- |
| 目标  | Chrome CDM DCA | L3 keybox 恢复 | L3 keybox 生成 | L3 keybox 量产 + Netflix 验证 |
| 混淆层突破 | 未描述 | 明确未突破 | 部分突破（Phase 2） | 通过 trace 绕过混淆 |
| DFA 次数 | 1（ROOT_KEY） | 0   | 1（ROOT_KEY） | 2（ROOT_KEY + derived_key） |
| derived_key | 未提取 | 未提取 | 未公开 | ✅ 独立提取 |
| d 区域结构 | 未分析 | 未分析 | 未公开 | ✅ 完整还原 |
| 端到端验证 | 未描述 | 未描述 | 部分描述 | ✅ Google + Netflix |
| 研究周期 | 未知  | 数月（学术） | 未知  | 两个完整周末 + 工作日空闲时间 |

两个完整周末加上工作日的零散时间中，实际的"有效分析时间"（即产生正确结果的操作）不超过 8 小时——其余时间均消耗在上述失败路径的探索中。这一比例在逆向工程中是正常的，但也说明了 **白盒密码学逆向不是线性过程，而是充满试错和注意力重新分配的迭代过程**。

### 7.2 成果边界与局限性

笔者实现的批量 WVD 生产流程在功能上是完整的：给定任意 `device_key` 和 `device_id` ， `gen_keybox.py` 可在毫秒内离线生成合法的 keybox，通过 Google provisioning 获取设备证书，进而通过 Netflix 的 DRM 认证。这完全满足了批量 WVD 生产的实际需求。

`vendor_key` 和 `key_mask` 的分离值是 Neodyme 工作中的"彩蛋"——对于已提取 derived_key 的笔者而言，这两个值的获取对现有流程没有附加价值。它们的缺失不影响 keybox 的生成或验证。

### 7.3 “制造时密钥"的安全含义

C_VALUE（ `9044aa08302d******e390990c18ed94` ）作为编译时常量的发现，揭示了 Widevine L3 安全模型的一个深层次特征：CDM 的安全性部分依赖于 **二进制不可预测性**，而非严格的密码学隔离。一旦某个 CDM build 的 derived_key 被提取，该 build 的所有实例都面临相同的威胁。这与 L1 TEE 方案形成鲜明对比——L1 中每台设备的密钥材料在物理上隔离，无法批量提取。

### 7.4 未来研究方向

-   **VM 字节码指令集逆向**：笔者的 trace 分析表明 CDM 内部存在多层 VM 解释器。对 VM 指令集的完整逆向（参考 WP-E26 在 `0xf97040` 发现的字节码 VM）可能揭示 aes_key 的派生过程；
-   **DCA（差分计算分析）**：David Buchanan 最初提出的 DCA 方法通过统计分析大量执行 trace 来定位密钥字节，适用于抵抗 DFA 的白盒实现；
-   **跨 build 分析**：不同 CDM build 版本的 C_VALUE 和密钥派生机制是否一致，值得系统性比较；
-   **纯 Python provisioning（脱离模拟器）**：目前 keybox 生成已实现纯 Python 离线化，但 Google provisioning 仍需通过 Android 模拟器中转——因为 provisioning request 的外层 HMAC 签名由白盒 VM 计算，签名密钥无法提取。要实现完全脱离模拟器的纯 Python provisioning，需要解决 Google provisioning 接口的 Protocol Buffer 结构对齐和白盒签名密钥的还原，这是一个独立的研究课题。

### 7.5 给 AI 时代的一瓢冷水：人与 Agent 的能力边界

2025 年以来，AI Agent（“智能体”）的热度持续攀升。社交媒体上不乏这样的叙事：“给 Claude/GPT 一个目标，它就能自主完成端到端的逆向工程。” 笔者在本次研究中大量使用了 AI 辅助（包括代码生成、文档整理、方案讨论），但恰恰是这段实战经历让笔者对 AI 的能力边界有了更清醒的认识。

**AI 在本次研究中真正帮上忙的事情——具体到每一步：**

**1\. 体力活自动化。** 逆向工程中有大量"思路清晰但执行枯燥"的工作，AI 在这方面的提效是实实在在的：

-   **工具脚本生成**： `gen_keybox.py` （keybox 生成器）、 `fault_d_creation.py` （创建模式 DFA）、 `trace_creation.py` （trace 采集）、 `trace_viz.py` （散点图绘制）——这些脚本的核心逻辑由笔者定义（输入什么、输出什么、hook 哪个地址），AI 负责将思路转化为可运行的 Python 代码。一个典型的例子：笔者口述"在 PC=0x6802a2a2 时开始计数，每次 T-table 读取记录地址和 IC，存入 SQLite”，AI 在 30 秒内生成了 `trace_creation.py` 的完整实现，包括 Qiling 的 `hook_mem_read` 回调、SQLite schema 定义和异常处理——手写这些大概需要 40 分钟。
    
-   **hex dump 分析**：d 区域 48 字节明文的结构还原中，笔者将内存 dump 的 hex 字符串交给 AI，让它尝试各种哈希函数（SHA-1、SHA-256、MD5）对前 16 字节进行校验。AI 在数秒内确认了 `SHA1(device_key)` 与字节 16–35 的匹配——这个"猜测 + 验证"的循环如果手动做，需要写一段脚本然后逐个试。
    
-   **字节序和编码陷阱排查**： `gen_keybox.py` 的 version 字段大端序问题和 CRC32-MPEG2 变体差异，都是 AI 在对比"笔者的输出 vs 模拟器的输出"时定位到的。笔者只需要说"这两个 hex 串差了 4 个字节，帮我找原因"，AI 会系统地检查字节序、CRC 多项式、初始值等每个可能的差异点。
    
-   **批量 provisioning 调试**：6 个 device_key 的 Google provisioning 测试中，模拟器的 IPv6 超时、mitmproxy CA 证书丢失、iptables DNAT 规则被清空——每个问题的排查都是 AI 执行 `adb shell` 、 `iptables -t nat -L` 、检查证书链，然后给出修复命令。笔者估算这些环境调试工作如果纯手工做，至少多花 4–5 小时。
    

**2\. 并发试错路径。** 本研究中有多个"不确定能否成功"的探索方向，AI 的价值在于可以 **同时推进多条路线**，而不是串行等待每条路线的结果：

| 并发路径 | AI 做了什么 | 结果  |
| --- | --- | --- |
| **BGE T-table 攻击** | 提取 T0–T3 共 4096 字节，与 OpenSSL 参考实现逐字节比对 | ❌ T-table 无密钥混入，BGE 不适用 |
| **c 区域 DFA** | 在加载模式下对 c 字段地址进行 DFA 扫描，9600 次故障注入 | ❌ c 是编译时常量，无运行时 AES |
| **VM checksum bypass** | 分析 `rfdncxfe` 校验函数的入口，尝试 hook 绕过 | ⚠️ 部分成功，但后续 DFA 仍未命中 |
| **Frida Chrome CDM hook** | 在 Chrome 桌面端 CDM 上尝试 `RSA_public_encrypt` hook 提取服务端公钥 | ✅ 公钥提取成功，但签名密钥在白盒内部 |
| **纯 Python provisioning** | 尝试不经模拟器直接构造 provisioning request | ❌ 外层 HMAC 签名密钥嵌入白盒，无法提取 |
| **全内存 brute force** | 从 Qiling 的 63MB 堆 dump 中提取 8M 个 16 字节候选值，逐个测试 HMAC 签名 | ❌ 0 命中 |

这些路径中有 4 条是死胡同，但 **每条死胡同都排除了一个错误假设** （如"c 是运行时 AES 输出"、“T-table 含密钥”）。AI 的价值不在于"找到答案"，而在于 **以人类 1/10 的时间走完每条错误路径**，让笔者更快地聚焦到正确方向。

**3\. 知识即时调取。** 逆向过程中频繁需要查阅密码学细节：AES 密钥调度的反向迭代公式、ShiftRows 的列传播模式（ `{0,7,10,13}` 是哪一列？）、CMAC-KDF 的 NIST SP 800-108 参数格式、protobuf 编码规则等。这些信息存在于 RFC 和学术论文中，手动查找每次需要 5–10 分钟；AI 作为"随时可用的密码学参考手册"，将这个开销压缩到几秒。

**AI 做不到的事情——也是本研究的真正难点：**

1.  **看图决策**。本研究的突破依赖于一系列 **人类主导的视觉判断**：在热力图上注意到异常亮竖条 → 判断其宽度约 4KB 符合 T-table 特征 → 在柱状图上区分 VM 初始化阶段与 keybox AES → 在过滤后的轮结构图上数出 9+1 = AES-128。这些判断跨越了热力图、柱状图、过滤散点图三种不同的可视化，每一步都需要 **知道该看什么、忽略什么**。笔者尝试让 AI 直接分析 637K 条 trace 原始数据，得到的是统计摘要（“地址 0x68026000 被访问了 130K 次”），而非"这是 AES T-table，旁边那些高频访问的是 VM 字节码，应该忽略"的判断——后者需要对"什么是 T-table"和"什么不是"的领域知识。
    
2.  **在仿真器中调试**。Qiling 的快照恢复、内存 hook、故障注入需要在交互式环境中反复试错。每次 DFA 失败后的"为什么这个地址没命中？“需要结合对 CDM 运行时状态的实时观察来判断——这不是一个可以用 prompt 描述的任务。
    
3.  **突破 OLLVM 混淆**。笔者在 vendor_key 提取过程中尝试了 MBA（Mixed Boolean-Arithmetic）反混淆、符号执行（angr 9.2 + miasm 0.1.5）、Z3 约束求解（z3 4.13）等方法，全部受阻于状态空间爆炸。这类需要 **在失败中调整策略** 的迭代过程，AI 缺乏对"当前方法为什么不 work"的判断力。
    
4.  **OLLVM 反混淆是 AI Agent 的"账单黑洞”**。笔者实测：让 AI Agent 直接攻击 OLLVM 控制流平坦化（如使用 angr 的 CFGFast 恢复、IDA 的 [D-810](https://github.com/joydo/d810) 插件、或 [Miasm](https://github.com/cea-sec/miasm) 符号执行），单个函数（如 CDM 的 `0xd2c7fc` ，约 8000 条指令）的分析就会产生数十万 token 的上下文。笔者在一次实际调试中，让 Agent 尝试用 angr CFGFast 恢复 `libwidevinecdm.so` 中一个 OLLVM 函数的控制流，前后迭代 12 轮仍未收敛，累计消耗约 40 万 token（按 Opus 定价约 $6）——而结果仍然是错误的。更现实的问题是，部分模型（如 Claude Opus 4.7）对涉及 DRM 逆向的 prompt 会触发安全策略拒绝响应，导致多轮对话链中途断裂，之前的上下文投入全部浪费。笔者后续计划另文分享过六神算法的 OLLVM 混淆保护的实践经验，包括 angr + Miasm 组合拳和手动 dispatch table 还原的具体方法。
    

#### 如果你觉得 AI 无所不能，请试试这些挑战

网上有一种流行的错觉：有了 Agent 和足够长的上下文窗口，什么逆向都能自动化。笔者诚恳建议持这种观点的读者亲自试试以下挑战——不需要任何 DRM 知识，纯粹是密码学和逆向工程的硬功夫：

| 挑战  | 难度  | 说明  | 链接  |
| --- | --- | --- | --- |
| **WhibOx Contest** | 高   | CHES 会议举办的白盒密码学公开挑战赛。参赛者提交白盒 AES 实现，攻击者尝试提取密钥。历届获奖方案均依赖人类设计的代数攻击，而非自动化工具。 | [whibox.io](https://whibox.io/) |
| **CryptoHack** | 中–高 | 系统化的密码学实战挑战平台，覆盖对称/非对称/哈希/协议分析。其中 AES 和 RSA 类别的高级题目需要手动构造差分路径或格攻击。 | [cryptohack.org](https://cryptohack.org/) |
| **crackmes.one** | 低–高 | 社区提交的逆向工程挑战，包含大量 OLLVM 混淆、VM 保护、反调试的二进制。让 AI Agent 自动解一个中等难度的 crackme，看它能走多远。 | [crackmes.one](https://crackmes.one/) |
| **CHES CTF** | 极高  | CHES（密码学硬件与嵌入式系统）年度 CTF，白盒密码学是常设赛道。2024 年的白盒挑战至今未被完全攻破。 | [ches.iacr.org](https://ches.iacr.org/) |
| **Tigress C Obfuscator** | 高   | 学术级代码混淆器。用它保护一个简单的 AES 实现，然后让 AI Agent 提取密钥。MBA + 控制流平坦化 + 不透明谓词的组合足以让任何自动化工具失效。 | [tigress.wtf](https://tigress.wtf/) |

本次研究的切身体会是： **AI 是极好的副驾驶，但方向盘必须在人手上**。DFA 的地址选择、trace 的视觉解读、故障模式的有效性判断、失败后的策略切换——这些构成了逆向工程的核心决策链，每一环都需要人类的判断力。AI 能让你更快地到达目的地，但它不知道目的地在哪里。

这条边界不是永恒的。也许几年后，AI 能自主完成从 trace 采集到 DFA 参数推导的全链路——“在热力图中识别 T-table 亮条"本质上是模式识别问题，恰恰是 AI 擅长的领域。但即便那一天到来，DFA 之所以有效，依赖的仍然是 AES ShiftRows 的列传播结构；白盒之所以可破，是因为密钥必须参与运算。 **数学结构的不变性** 不随工具进化而改变。

不过，需要诚实补充一个反例：Chrome CDM 4.10.2934（比本文的 build 4464 新约 6 年）引入了 LZMA 压缩的字节码 VM（dispatch base `0xf97160` ，约 237 个 opcode），AES 不再直接通过 T-table 执行，而是被编译为 VM 指令流。T-table 的内存访问模式被 VM 间接寻址彻底打散，热力图上不再有清晰的亮条。 **DFA 的数学原理没变，但可观测信号被 VM 层抹除了**——攻击路线被迫从"观察数据流"退回到"逆向 VM 指令集”，也就是 Patat 团队坦承未能突破的那条路。

这个发现提醒笔者：数学不会过时，但 **数学的可观测性** 会被工程手段压制。安全研究者需要同时理解两个层面——密码学的数学结构告诉你"攻击理论上可行"，而实现层的工程防护决定了"攻击实践上能否触达"。工具会迭代，但这种双层思维不会过时。与其焦虑 AI 是否会取代逆向工程师，不如把时间花在理解这些结构上——它们才是真正的"不可 revoke 的密钥"。

> 所以，下次有人跟你说"AI 能自动破解白盒 AES"的时候，请友善地邀请他去 [WhibOx](https://whibox.io/) 上领个奖回来——除非你真正手动解决过一个白盒挑战（或者开了天眼），否则 prompt engineering、context engineering、harness engineering 都不会让你更接近答案。

* * *

## 八、相关工作综述

笔者在研究过程中系统调研了 Widevine L3 安全分析领域的已有工作。以下按时间线整理各研究团队/个人的贡献，并与本研究进行对比。

### 9.1 研究时间线

| 时间  | 研究者/团队 | 成果  | 方法  | 公开程度 |
| --- | --- | --- | --- | --- |
| **2019.01** | [David Buchanan](https://twitter.com/david3141593/status/1080606827384131590) | 首次公开宣称攻破 Chrome L3 | DCA（差分计算分析） | 仅推文，未公开代码或论文 |
| **2020.08** | [Tomer Hadad](https://github.com/AvalonsWanderer/widevine-l3-playground) | Chrome Windows CDM RSA 私钥提取 | 白盒 RSA 代数简化（Montgomery 乘法 + 2k-ary 指数分析） | 代码公开 → [DMCA 下架](https://github.com/github/dmca/blob/master/2020/11/2020-11-09-Google.md) （2020.11） |
| **2025.03** | [Gwendal Patat et al.](https://arxiv.org/abs/2204.09298)（IRISA/CNRS） | Widevine 协议完整逆向 + WideXtractor 工具 + L3 keybox 恢复 | Frida hook OEMCrypto 接口 + munmap 内存残留捕获 | 学术论文（CVE-2021-0639） |
| **2026** | [Neodyme Labs](https://neodyme.io/en/blog/widevine_l3) | L3 白盒 AES DFA + keybox 生成算法还原 | Qiling 仿真 + TraceGraph + DFA + VM 反混淆 | 博客 + 代码（secrets.py 未公开） |
| **2023-25** | [KeyDive](https://github.com/hyugogirubato/KeyDive) 社区 | 自动化 L3 WVD 提取工具 | Frida hook provideProvisionResponse | 开源工具，持续维护 |
| **2021** | [Q. Zhao](https://www.blackhat.com/asia-21/briefings/schedule/#wideshears-investigating-and-breaking-widevine-on-qtee-21322) （BlackHat Asia） | L1 TEE（QSEE）keybox 恢复 | QSEE 漏洞利用 + Widevine trustlet 逆向 | 演讲，未公开完整细节 |
| **2026.04** | **本研究** | derived_key DFA 提取 + gen_keybox.py + 端到端验证 | 创建模式 DFA + Trace 可视化 + 全流程自动化 | 本文  |

### 9.2 技术路线对比

各研究采用了截然不同的技术路线，反映了 Widevine 安全分析的多样化攻击面：

| 维度  | Buchanan | Hadad | Patat | Neodyme | 本研究 |
| --- | --- | --- | --- | --- | --- |
| **目标平台** | Chrome/Windows | Chrome/Windows | Android L1/L3 | Android L3 | Android L3 |
| **目标密钥** | Content Key | RSA 私钥 | device_key (keybox) | vendor_key + ROOT_KEY | derived_key + ROOT_KEY |
| **攻击面** | 白盒 AES | 白盒 RSA | OEMCrypto 接口 | 白盒 AES (VM) | 白盒 AES (VM) |
| **核心方法** | DCA | 代数简化 | 内存残留捕获 | DFA + 反混淆 | DFA + Trace 可视化 |
| **是否需要突破混淆** | 未知  | 是（RSA 结构分析） | **否** （接口级） | 是（Phase 2 VM 反编译） | **部分** （Trace 绕过，但 checksum bypass） |
| **可重复性** | 不可（无代码） | 有限（DMCA 下架） | 可（学术论文） | 可（开源工具链） | 可（本文 + 开源） |
| **离线 keybox 生成** | 否   | 否   | 否   | **是** （需 secrets.py） | **是** （不需 secrets.py） |
| **端到端验证** | 未描述 | 未描述 | 未描述 | 部分描述 | **完整** （Google + Netflix） |

### 9.3 关键洞察

通过对比分析，笔者获得了以下洞察：

**1\. Patat 的"不破混淆"路线值得重视。** Patat 等人在论文中明确写道：

> *“It is worth noting that we did not even get to break into the underlying obfuscation. In fact, our analyses were guided by the conceptual structure of the Widevine protocol.”*

这一方法论—— **从协议结构而非代码实现入手**——在笔者的 Trace 可视化中得到了呼应：笔者同样没有完整逆向 VM 指令集，而是通过 AES 的数学结构（T-table 访问模式）在 trace 中定位了攻击点。

**2\. Neodyme 的 secrets.py 是唯一未解之谜。** 所有公开研究中，只有 Neodyme 声称持有 vendor_key 和 key_mask。笔者通过 BGE 分析和全内存搜索确认这两个值不以明文形式存在于运行时二进制中。Neodyme 的提取方法可能涉及：

-   对 VM 字节码立即数的指令级分析（笔者未完成的路线）
-   通过 Google 内部渠道获取（非逆向手段）
-   对不同 CDM build 版本的交叉分析

**3\. DCA vs DFA 的适用性边界。** Buchanan 使用 DCA（统计分析大量 trace），Neodyme 和笔者使用 DFA（少量故障注入）。DFA 的优势在于所需 trace 数量少（~100 次 vs DCA 的 ~1000 次），但 DFA 要求能够注入故障——在有 checksum 保护的 VM 中，笔者不得不先 bypass `rfdncxfe` 校验。DCA 理论上不需要故障注入，但对白盒实现中的编码混淆更敏感。

**4\. 从 L3 到 L1 的鸿沟。** Zhao 在 BlackHat Asia 展示的 L1 QSEE 攻击表明，L1 的安全性依赖于 TEE 硬件隔离而非代码混淆。L3 的白盒保护可以被 DFA 在几分钟内攻破，而 L1 需要 TEE 漏洞（如 QSEE 提权），这两者的难度不在同一量级。笔者目前正在基于 Pixel 4 / 4 XL（Snapdragon 855, SM8150）对 L1 QSEE 路线进行复现和突破尝试，已有部分阶段性产出：

| 产出  | 状态  | 说明  |
| --- | --- | --- |
| L1 Client ID（设备证书） | ✅ 已提取 | 1736 字节，含 RSA-2048 公钥 |
| L1 Device ID | ✅ 已提取 | 32 字节设备标识 |
| L1 Challenge（含 RSA-PSS-SHA1 签名） | ✅ 已捕获 | 多组 (message, signature) 对 |
| QSEE 内存布局 | ✅ 已映射 | tzapp / qseecom 物理地址区间 |
| Widevine Trustlet 逆向 | ⚠️ 进行中 | QSEE Secure World 内部结构分析 |
| **L1 RSA 私钥** | **❌ 未提取** | 始终在 QSEE Secure World 内部，需 TEE 漏洞 |

L1 的核心难点在于：RSA 私钥 **从未离开 TEE**——所有签名操作在 Secure World 内完成，Normal World 只能看到签名结果。攻击面从 L3 的"白盒密码学分析"转变为"TEE 漏洞利用"，这是一个完全不同层次的安全研究课题。后续将另文记录完整的 L1 复现过程。

### 9.4 相关研究机构简介

本文涉及的研究工作来自多个不同背景的团队和个人，以下简要介绍他们的基本情况，方便读者理解各研究成果的可信度和技术背景：

**[Neodyme Labs](https://neodyme.io/)** （德国，柏林）

Neodyme 是一家专注于区块链和嵌入式安全的精品安全审计公司，团队成员多来自德国顶级 CTF 战队 [Sauercloud](https://ctftime.org/team/54748/) （前身为 KITCTF，卡尔斯鲁厄理工学院）。他们的 Widevine L3 博客文章是目前公开文献中 **唯一给出完整 DFA 工程实现的工作**，包括 Qiling 仿真环境搭建、 `fault.py` 故障注入脚本、以及 TraceGraph 方法论的描述。Neodyme 的技术实力在区块链审计领域尤其突出（Solana 生态的多个关键漏洞由其发现），Widevine 研究是其安全研究的一个"副产品"，但质量极高。他们选择不公开 `secrets.py` （含 vendor_key 和 key_mask）以及 derived_key 的定位方法，这一做法在负责任披露的框架下是合理的。

**[Quarkslab](https://quarkslab.com/)** （法国，巴黎）

Quarkslab 是欧洲最知名的攻防安全研究机构之一，成立于 2011 年，在软件保护、逆向工程和密码学领域拥有深厚积累。他们开发的 [Triton](https://github.com/JonathanSalwan/Triton) （动态二进制分析框架）和 [QBDI](https://github.com/QBDI/QBDI) （动态二进制插桩）是业界广泛使用的开源工具。在白盒密码学领域，Quarkslab 的贡献尤为关键：他们的 [博客文章](https://blog.quarkslab.com/differential-fault-analysis-on-white-box-aes-implementations.html) 系统化了 DFA 对白盒 AES 的攻击方法论，并开发了 [TraceGraph 工具](https://github.com/AyrA/TraceGraph) 用于可视化执行 trace 中的 AES 信号。本文的 trace 可视化方法直接受其启发。Quarkslab 团队成员 Charles Music 和 Philippe Music 也是 [SideChannelMarvels](https://github.com/SideChannelMarvels) 开源项目（含 phoenixAES / JeanGrey）的核心维护者。

**[IRISA / CNRS](https://www.irisa.fr/)** （法国，雷恩）

IRISA（Institut de Recherche en Informatique et Systèmes Aléatoires）是法国国家科研中心（CNRS）下属的计算机科学研究所，隶属于雷恩大学。Gwendal Patat 等人的论文 [*Attacking Widevine’s L3 Content Decryption Module*](https://arxiv.org/abs/2204.09298) 出自该机构的安全与密码学团队。这篇论文的价值在于它从 **协议层面** （而非代码实现层面）系统分析了 Widevine 的安全架构，开发了 WideXtractor 工具用于 hook OEMCrypto 接口，并报告了 CVE-2021-0639。Patat 团队坦诚地承认他们"未能突破底层混淆层"——这一诚实的表述反而增加了论文的可信度，也清楚地标定了学术分析与工程突破之间的距离。

**[David Buchanan](https://twitter.com/david3141593)** （英国，独立研究者）

Buchanan 是一位活跃的独立安全研究者，以在 Twitter 上发布简洁但影响力巨大的安全研究成果著称。他在 2019 年的推文中首次公开宣称通过 DCA 攻破了 Chrome L3 CDM，但从未发布代码或论文。尽管缺乏可复现的细节，这条推文在社区中产生了重要的催化效应——它证明了 L3 白盒 AES 在实践中可被攻破，激励了后续的 Neodyme 和学术研究。

**[Tomer Hadad / AvalonsWanderer](https://github.com/AvalonsWanderer)** （以色列，独立研究者）

Hadad 在 2020 年公开了 [widevine-l3-playground](https://github.com/AvalonsWanderer/widevine-l3-playground) 项目，展示了从 Chrome Windows CDM 中提取 RSA 私钥的方法（基于白盒 RSA 的 Montgomery 乘法和 2k-ary 指数分析）。该项目随后被 Google 以 [DMCA 下架](https://github.com/github/dmca/blob/master/2020/11/2020-11-09-Google.md) ，但其 Android rootfs 和 Qiling 仿真框架被 Neodyme 和笔者继续沿用。Hadad 后续维护的 [widevine_key_ladder](https://github.com/AvalonsWanderer/widevine_key_ladder) 项目确认了 CMAC-KDF 的 NIST SP 800-108 参数，是本研究验证密钥派生关系的重要参照。

### 9.5 致谢

笔者的工作站在以上所有研究者的肩膀上。特别感谢：

-   **Neodyme** 公开了完整的 Qiling 仿真工具链和 DFA 方法论
-   **Quarkslab** 的 TraceGraph 方法论和 SideChannelMarvels 工具链
-   **Gwendal Patat** 的学术论文提供了 Widevine 协议的系统性理解
-   **AvalonsWanderer** 维护的 widevine_key_ladder 实现确认了 CMAC-KDF 参数
-   **KeyDive** 社区持续维护的自动化工具简化了 WVD 提取流程
-   友人孙先生慷慨提供的 MSL 协议客户端脚本

## 九、L3 WVD 能做什么 & 入门建议

### 有了 L3 WVD 可以做什么

拿到一个合法的 L3 WVD 设备文件后，它本质上是一个 **完整的 Widevine 设备身份**——包含 RSA-2048 私钥和 Google 签发的设备证书。在安全研究和合规测试场景下，它可以用于：

| 用途  | 说明  | 涉及工具 |
| --- | --- | --- |
| **DRM 协议分析** | 捕获和解析 License Server 的请求/响应，理解密钥交换流程 | [pywidevine](https://github.com/devine-dl/pywidevine) 、Wireshark |
| **内容保护强度评估** | 验证特定平台的 DRM 配置（HDCP 要求、分辨率限制、License 有效期） | pywidevine、自定义脚本 |
| **多平台兼容性测试** | 用同一 WVD 测试不同 OTT 平台的 Widevine 集成是否符合规范 | —   |
| **密钥链（Key Ladder）验证** | 从 device_key 到 Content Key 的完整推导，验证 CMAC-KDF 参数 | [widevine_key_ladder](https://github.com/AvalonsWanderer/widevine_key_ladder) |
| **离线 License 机制研究** | 分析 Persistent License 的存储格式、续期策略和吊销机制 | —   |

#### 笔者不建议做的事情

上面这张表列的是安全研究和合规测试场景下的合理用途。但笔者知道，很多读者看到"L3 WVD"想到的第一件事是拿它去下载 Netflix 的片子。笔者有必要明确说几句不太中听的话：

1.  **L3 只有 720p 甚至更低**。各大平台对 L3 设备限制分辨率——Netflix 通常给 540p，Disney+ 给 720p。花了这么大力气拿到的 WVD，最后看到的画质可能还不如你直接开个会员在手机上看。投入产出比极低。
    
2.  **Google 会 revoke**。一旦某个 CDM build 的 WVD 被大规模滥用，Google 会将其加入吊销列表。你辛苦生成的 WVD 可能过几周就失效了。这是一场你必输的军备竞赛。
    
3.  **法律风险是真实的**。DMCA（美国）、《计算机软件保护条例》（中国）、EU Copyright Directive（欧盟）对规避技术保护措施有明确的法律责任。用 WVD 解密受版权保护的内容进行传播，在多数司法管辖区构成违法行为。笔者的所有工作仅限于安全研究和协议分析，不涉及内容传播。
    

> 坦白说，笔者在"拿到 WVD 之后能干什么"这件事上并没有太多实战经验——上面那张表更多是理论上的可能性。笔者的兴趣集中在密码学和逆向工程本身，享受的是把白盒拆开的过程而非拆开之后的"战利品"。至于拿着钥匙去开哪扇门，还请各位读者三思。如果你对安全研究本身感兴趣，非常欢迎交流（overkazaf@gmail.com / vx: `_0xAF_` ）。

### 给感兴趣的读者：从音乐流媒体入门

如果你对 DRM 逆向分析感兴趣但觉得 Widevine + Netflix 的组合太复杂，笔者建议从 **音乐流媒体** 开始。原因很简单：音频 DRM 的协议栈比视频薄得多，调试周期短，且社区资料丰富。

#### 推荐的入门路径

```
Level 1 → Spotify (Web Player)
           协议：Widevine L3 (CENC)，Chrome EME 接口
           优势：Web 端可用 Chrome DevTools 直接观察 EME 调用
           资源：EME Logger 扩展、CDM 日志

Level 2 → Tidal (HiFi / MQA)
           协议：Widevine L3，支持无损音频
           优势：License 格式相对简洁，适合学习 CENC 标准
           资源：Tidal API 文档

Level 3 → Disney+ / Prime Video (PlayReady + Widevine)
           协议：PlayReady (Edge/Windows) + Widevine (Chrome/Android)
           优势：同一内容可对比两种 DRM 的 License 差异
           资源：Microsoft PlayReady 文档、DASH-IF 互操作性指南

Level 4 → YouTube Premium / HBO Max
           协议：Widevine CENC (YouTube) / Widevine + PlayReady (HBO Max)
           优势：YouTube 的 DASH manifest 公开可观察；HBO Max 支持多 DRM 切换，适合对比分析
           进阶：Netflix（自研 MSL 协议，复杂度再上一个台阶）
```

#### 每个 Level 需要掌握的技能

| Level | 需要学习 | 关键工具 |
| --- | --- | --- |
| 1   | EME API、CENC 标准、protobuf 基础 | Chrome DevTools、 [EME Logger](https://chrome.google.com/webstore/detail/eme-call-and-event-logger) 、pywidevine |
| 2   | License 解析、Key Container 结构、PSSH 盒子 | mp4decrypt、 [shaka-packager](https://github.com/shaka-project/shaka-packager) 、ffprobe |
| 3   | PlayReady vs Widevine 差异、HLS/DASH 协议、SL2000/3000 安全级别 | [pyplayready](https://github.com/devine-dl/pyplayready) 、Bento4、mp4dump |
| 4   | DASH manifest 分析、HLS 流抓取、多 DRM 对比测试 | [yt-dlp](https://github.com/yt-dlp/yt-dlp) 、Frida、mitmproxy |

#### 扩展阅读：DRM 安全研究相关论文与工具

| 类别  | 资源  | 说明  |
| --- | --- | --- |
| **PlayReady 安全分析** | [Dunn & Polakis, *Understanding and Undermining Microsoft’s PlayReady DRM*](https://www.usenix.org/conference/usenixsecurity24/presentation/dunn) (USENIX Security 2024) | 首篇系统分析 PlayReady SL3000 的学术论文，揭示了 License 结构和密钥派生链 |
| **Widevine 协议逆向** | [Patat et al., *Attacking Widevine’s L3 CDM*](https://arxiv.org/abs/2204.09298) (2025) | WideXtractor 工具 + OEMCrypto 接口分析 + CVE-2021-0639 |
| **白盒 DFA 方法论** | [Quarkslab Blog: DFA on White-box AES](https://blog.quarkslab.com/differential-fault-analysis-on-white-box-aes-implementations.html) | TraceGraph 方法论原始出处，本文的直接灵感来源 |
| **DRM 通用工具** | [devine-dl/pywidevine](https://github.com/devine-dl/pywidevine) 、 [devine-dl/pyplayready](https://github.com/devine-dl/pyplayready) | Widevine / PlayReady 的 Python 客户端库，支持 License 解析和设备管理 |
| **EME 标准** | [W3C Encrypted Media Extensions](https://www.w3.org/TR/encrypted-media/) | 浏览器 DRM 接口标准，理解 CDM 与浏览器之间的交互协议 |
| **DASH/CENC 标准** | [DASH-IF Interoperability Guidelines](https://dashif.org/guidelines/) | 多 DRM 互操作的行业标准，理解 PSSH、ContentProtection、Key Rotation |
| **密钥恢复工具** | [SideChannelMarvels/JeanGrey](https://github.com/SideChannelMarvels/JeanGrey) (phoenixAES) | DFA 故障密文 → AES 轮密钥的自动恢复工具 |

> **笔者的经验**：从 Spotify Web Player 的 EME 调用开始，用 Chrome DevTools 的 `chrome://media-internals` 观察 CDM 的初始化、License 请求和密钥加载过程。这比直接面对 Netflix 的 MSL 协议温和得多——后者笔者花了相当长的时间才理清（再次感谢友人孙先生提供的 MSL 客户端脚本，省去了大量协议逆向工作）。

## 十、结论

本文系统记录了对 Widevine L3 CDM build 4464 的完整逆向工程过程。笔者的主要贡献包括：

1.  在 Qiling 仿真环境中 **独立复现了 Neodyme 的 ROOT_KEY DFA 方法**，验证了其可重现性；
2.  通过 trace 可视化识别出 d 区域白盒 AES 的独立 VM 地址空间，设计并实施了 **创建模式 DFA**，成功提取 derived_key（ `b1d941823c9a******5c6d7b61f995dc` ），这是本次研究的核心技术突破；
3.  通过仿真器内存捕获 **逆向还原了 d 区域明文的完整结构** （ `device_key || SHA1(device_key) || 0x03 || zeros` ），其中 SHA-1 完整性校验的发现是关键环节；
4.  实现了 **不依赖 `secrets.py` 的纯 Python keybox 生成器**，通过字节完美验证、Google provisioning（6 个 device_key，全部 HTTP 200）和 Netflix 端到端验证（licensedManifest + 内容密钥提取）完成了三层验证；
5.  通过 BGE T-table 分析和 Frida 运行时分析， **厘清了 vendor_key / key_mask 的本质**：它们是编译时预计算的常量，不存在于运行时二进制的任何可访问位置，BGE 代数攻击在标准 T-table 上不适用。

论文方法的核心实践目标——批量 Widevine keybox / WVD 生产——已 100% 实现。vendor_key 和 key_mask 的缺失是学术上的遗憾，但对工程目标无实质影响。

### 一个值得注意的设计问题

回顾整个攻击链，有一个问题值得深思： **CDM 的"创建模式"本身是否是一个设计遗漏？**

在正常的产品流程中，keybox 应当由设备制造商在工厂产线上预置——设备出厂时 `ay64.dat` 已经存在，CDM 只需要走"加载模式"读取并解密它。“创建模式"的设计意图大概是作为一个 **回退路径**：当 keybox 文件不存在或损坏时，CDM 可以自行生成一个新的，使设备不至于完全丧失 DRM 能力。

但正是这个"好心的回退路径"为攻击打开了大门：

1.  **创建模式在仿真器中可触发**——只需删除 `ay64.dat` ，CDM 就会"认为"自己运行在一台全新设备上，进入创建模式生成新的 keybox。攻击者不需要真实设备。
2.  **创建模式使用独立的白盒 AES 密钥**——derived_key 的 DFA 正是利用了这条路径。如果没有创建模式，攻击者只能攻击加载模式（ROOT_KEY），拿到的只是文件加密密钥，无法合成新的 keybox。
3.  **Google provisioning 不区分来源**——无论 keybox 是工厂预置还是 CDM 自行创建，Google 服务器都接受。这意味着攻击者可以在仿真环境中无限次触发创建模式，批量生成合法的 keybox 并通过 provisioning。

换言之，“创建模式"把原本需要工厂产线配合的密钥预置流程，变成了一个 **任何人都可以在仿真器中触发的纯软件操作**。如果 CDM 没有创建模式（即强制要求 keybox 必须预置），那么即使攻击者通过 DFA 提取了 ROOT_KEY，也无法凭空合成一个 Google 接受的 keybox——因为 derived_key 永远不会在运行时出现。

这或许是 Widevine L3 安全模型中最微妙的设计取舍： **可用性（设备始终能获得 DRM 能力）与安全性（密钥生成不应在不受控环境中发生）之间的张力**。Google 选择了可用性。

### 时代降维：用今天的工具打昨天的仗

回顾整个研究过程，笔者认为最值得记录的不是某个具体的技术突破，而是一种 **结构性的优势**：本文攻击的 CDM build 4464 编译于 2018 年，而笔者使用的工具和方法论来自 2024–2026 年——这是一场"从未来回顾过去"的仗。

-   **2018 年的防护水平**：CDM 4464 使用经典 T-table 实现 + OLLVM 混淆 + LCG 加密的 VM 字节码。在当时，这套防护足以阻止大多数攻击者——DFA 方法论尚未成熟（Quarkslab 的 TraceGraph 博客发表于 2019 年），Qiling 仿真框架还不存在（2020 年首次发布），phoenixAES 工具链也处于早期阶段。
-   **2026 年的攻击能力**：Neodyme 已经公开了完整的 Qiling + DFA 工具链和方法论（笔者直接复用）；AI 辅助可以在几分钟内生成 trace 采集脚本和数据分析代码；Ghidra 的反编译质量足以识别.data 段中的 T-table 结构；社区积累的 CDM 知识（WideXtractor、KeyDive、widevine_key_ladder）提供了丰富的上下文。

笔者不是在攻防博弈中"赢了"白盒 AES 的设计者，而是站在了他们当年没有预见到的维度上。OLLVM 保护的是代码，而 T-table 查表是数据层的行为——两者不在同一个平面上。这不是个案：安全研究中经常出现"时代降维”——用新时代的工具和方法重新审视旧系统，“未被发现"不等于"不可发现”，只是当时没有人用正确的方法去看。

教训是双向的： **对防御者**，今天看似安全的白盒实现可能在几年后被新的分析方法轻松绕过； **对研究者**，面对看似坚固的目标，不妨先问——这是什么年代的设计？有没有当年不存在、但今天已成熟的方法可以降维打击？

* * *

## 附录

### A. 工具清单

| 工具  | 用途  | 链接  |
| --- | --- | --- |
| [Qiling](https://github.com/qilingframework/qiling) | x86/Android 用户态仿真，故障注入基础设施 | [https://github.com/qilingframework/qiling](https://github.com/qilingframework/qiling) |
| [Ghidra](https://ghidra-sre.org/) | CDM 共享库静态反编译，84 个 VM 函数分析 | [https://ghidra-sre.org/](https://ghidra-sre.org/) |
| [phoenixAES](https://github.com/SideChannelMarvels/JeanGrey) | DFA 数据分析，轮密钥恢复 | [https://github.com/SideChannelMarvels/JeanGrey](https://github.com/SideChannelMarvels/JeanGrey) |
| [Frida](https://frida.re/) | Chrome CDM 运行时 hook，provisioning 参数提取 | [https://frida.re/](https://frida.re/) |
| [mitmproxy](https://mitmproxy.org/) | HTTPS 中间人代理，provisioning 流量中继 | [https://mitmproxy.org/](https://mitmproxy.org/) |
| [KeyDive](https://github.com/hyugogirubato/KeyDive) | Android CDM 内存中 RSA 私钥提取 | [https://github.com/hyugogirubato/KeyDive](https://github.com/hyugogirubato/KeyDive) |
| [pywidevine](https://github.com/devine-dl/pywidevine) | WVD 设备文件打包，License 解析 | [https://github.com/devine-dl/pywidevine](https://github.com/devine-dl/pywidevine) |
| MSL客户端脚本 | Netflix MSL 协议客户端，端到端验证（友人提供） | `[PROJECT_DIR]/...` |
| [pycryptodome](https://www.pycryptodome.org/) | AES-CBC/ECB 加解密，CRC32 计算 | [https://www.pycryptodome.org/](https://www.pycryptodome.org/) |

### B. 提取的密钥与常量

| 名称  | 值（hex） | 长度  | 提取方法 |
| --- | --- | --- | --- |
| `ROOT_KEY` | `da39a3ee5e6b******55bfef95601890` | 16 B | Neodyme `fault.py` ，加载模式 DFA，150 faults |
| `derived_key` | `b1d941823c9a******5c6d7b61f995dc` | 16 B | `fault_d_creation.py` ，创建模式 DFA，95 faults |
| `round_10_key` | `49B7a21e3c8f******d9e0c17bFB68` | 16 B | phoenixAES 直接输出，反推 derived_key 的中间值 |
| `C_VALUE` | `9044aa08302d******e390990c18ed94` | 16 B | 直接从 keybox 读取，确认为 JIT 立即数 |
| `VERSION` | `00000002` | 4 B | keybox 偏移 0x30，大端序 |
| `LEVEL3_VERSION` | `00001170` | 4 B | keybox 偏移 0x34，大端序 |
| `FAULT_START` （ROOT_KEY） | `0x6802E275` | —   | Neodyme 参数 |
| `FAULT_START` （derived_key） | `0x6802A2A2` | —   | trace 可视化定位 |
| `EVAL_HOOK_PC` （ROOT_KEY） | `0x6802E8C1` | —   | Neodyme 参数 |
| `EVAL_TRIGGER_PC` （derived_key） | `0x6802A8CD` | —   | trace 可视化定位 |

### C. 文件清单

| 文件路径 | 用途  |
| --- | --- |
| `L3Sim/gen_keybox.py` | 纯 Python keybox 生成器，核心交付物 |
| `L3Sim/fault_d_creation.py` | 创建模式 d 区域 DFA 主脚本 |
| `L3Sim/trace_creation.py` | 内存访问 trace 采集工具 |
| `L3Sim/trace_viz.py` | Trace 可视化，生成散点图用于 AES 轮边界定位 |
| `L3Sim/trace_creation.db` | 637K 条内存访问记录（SQLite），DFA 地址定位依据 |
| `L3Sim/fault.py` | Neodyme ROOT_KEY DFA（原始方法复现） |
| `L3Sim/crack.py` | phoenixAES 密钥恢复接口封装 |
| `L3Sim/emu.py` | Qiling 仿真器核心配置（ `create_emulator` 、 `setup_hooks` ） |
| `L3Sim/verify_keybox.py` | 通过仿真器 GetKeyData 接口验证生成的 keybox |
| `L3Sim/tracefile_d_creation` | derived_key DFA 的故障数据文件 |
| `tools/batch_wvd_gen.py` | Android 真机批量 WVD 生产自动化（ADB + DrmTrigger） |
| `[msl-client]/MSL客户端脚本` | Netflix MSL 协议客户端，端到端验证工具 |
| `docs/L3_KEYBOX_CRYPTO_REFERENCE.md` | 本次研究的密码学完整参考文档 |
| `docs/VENDOR_KEY_RESEARCH_STATUS.md` | vendor_key 提取研究完整日志 |

### D. CDM build 4464 覆盖范围与吊销状态

Build 4464（“L3 Library 4464”）是 2018 年 4 月编译的 Widevine L3 CDM，内部标识为 `android_generic_4464` ，随 **Android 9 (API 28) 的 x86 模拟器镜像** （AOSP on IA Emulator）分发。

| 属性  | 说明  |
| --- | --- |
| **覆盖设备** | x86 架构的 Android 模拟器， **非消费级 ARM 设备**。真实手机/平板使用同期但不同 build 号的 ARM 版 CDM，白盒 AES 密钥不同 |
| **密钥适用性** | ROOT_KEY、derived_key、C_VALUE 是 build 级别的常量。本文的 `gen_keybox.py` **仅对 build 4464 有效**，不同 build 需要独立提取 |
| **吊销状态** | 有公开资料称 Google 于 2021 年 12 月吊销了 `android_generic_4464` ，但笔者在 2026 年 4 月的实验中，该 build 生成的 WVD 仍成功通过了 Netflix licensedManifest 验证。吊销策略可能因平台而异，具体机制未知。Google 有能力随时吊销任何 CDM build 的凭证 |
| **方法论迁移性** | DFA + TraceGraph 方法论适用于任何使用 T-table 实现的旧版 CDM build，但每个 build 需要独立提取密钥 |
| **研究标准目标** | Neodyme 和 [widevine-l3-playground](https://github.com/AvalonsWanderer/widevine-l3-playground) 使用的也是 build 4464——版本稳定、工具链成熟、已被研究社区充分分析 |

* * *

## 参考文献

### 学术论文

1.  Patat, G., Sabt, M., & Fouque, P.-A. (2025). *Exploring Widevine for Fun and Profit*. arXiv:2204.09298v2. [\[PDF\]](https://arxiv.org/pdf/2204.09298) [\[arXiv\]](https://arxiv.org/abs/2204.09298) — Widevine 协议的首篇系统性学术分析，提出 WideXtractor 工具，通过 munmap 内存残留恢复 L3 keybox。CVE-2021-0639。
    
2.  Billet, O., Gilbert, H., & Ech-Chatbi, C. (2004). *Cryptanalysis of a White Box AES Implementation*. Selected Areas in Cryptography (SAC 2004), LNCS 3357, pp. 227–240. [\[Springer\]](https://link.springer.com/chapter/10.1007/978-3-540-30564-4_16) — BGE 攻击原始论文，针对 Type-II 白盒 AES 的 T-table 代数攻击。笔者在 §6.1 中验证其在 Widevine 场景下不适用。
    
3.  Chow, S., Eisen, P., Johnson, H., & Van Oorschot, P. C. (2002). *White-Box Cryptography and an AES Implementation*. Selected Areas in Cryptography (SAC 2002), LNCS 2595, pp. 250–270. [\[Springer\]](https://link.springer.com/chapter/10.1007/3-540-36492-7_17) — 白盒 AES 的奠基论文，定义了 Type-II/III 白盒实现的理论框架。
    
4.  Boneh, D., DeMillo, R. A., & Lipton, R. J. (1997). *On the Importance of Checking Cryptographic Protocols for Faults*. EUROCRYPT 1997, LNCS 1233, pp. 37–51. [\[Springer\]](https://link.springer.com/chapter/10.1007/3-540-69053-0_4) — DFA 的理论奠基，证明了单比特故障可以恢复 RSA/DES 密钥。
    
5.  Piret, G., & Quisquater, J.-J. (2003). *A Differential Fault Attack Technique against SPN Structures, with Application to the AES and KHAZAD*. CHES 2003, LNCS 2779, pp. 77–88. [\[Springer\]](https://link.springer.com/chapter/10.1007/978-3-540-45238-6_7) — 将 DFA 扩展到 AES（SPN 结构），证明 2 个故障即可恢复完整 AES-128 密钥。phoenixAES 的理论基础。
    
6.  Delerabl é e, C., Lepoint, T., & Paillier, P. (2013). *White-Box Security Notions for Symmetric Encryption Schemes*. SAC 2013, LNCS 8282, pp. 247–264. [\[Springer\]](https://link.springer.com/chapter/10.1007/978-3-662-43414-7_13) — 白盒安全性的形式化定义，区分了"不可压缩性"和"不可提取性"等概念。
    
7.  Zhao, Q. (2021). *Wideshears: Investigating and Breaking Widevine on QTEE*. BlackHat Asia 2021. [\[Slides\]](https://www.blackhat.com/asia-21/briefings/schedule/#wideshears-investigating-and-breaking-widevine-on-qtee-21322) — L1 TEE (QSEE) 层面的 Widevine 攻击，与本文的 L3 软件层攻击形成对照。
    

### 技术博客与工具

8.  Neodyme Labs. *Diving deep into the depths of Widevine*. Neodyme Blog, 2026. [\[Blog\]](https://neodyme.io/en/blog/widevine_l3) — 本研究的直接基础。提供了 Qiling 仿真 + DFA 攻击的完整工具链。 `secrets.py` 未公开。
    
9.  Quarkslab. *Differential Fault Analysis on White-Box AES Implementations*. Quarkslab Blog. [\[Blog\]](https://blog.quarkslab.com/differential-fault-analysis-on-white-box-aes-implementations.html) — TraceGraph 可视化方法的来源。笔者在 §4.3.2 中直接受其启发实现了 `trace_viz.py` 。
    
10.  Buchanan, D. (2019). *Breaking Widevine L3 on Linux Chrome*. Twitter/X. [\[Tweet\]](https://twitter.com/david3141593/status/1080606827384131590) — 首次公开披露 L3 白盒 AES 的 DCA 可行性。未公布技术细节。
     
11.  Hadad, T. (2020). *widevine-l3-decryptor*. GitHub (DMCA 下架). [\[Wiki\]](https://github.com/AvalonsWanderer/widevine-l3-playground) [\[DMCA Notice\]](https://github.com/github/dmca/blob/master/2020/11/2020-11-09-Google.md) — Chrome Windows CDM 的白盒 RSA 私钥提取。Arxan 混淆的 Montgomery 乘法 + 2k-ary 指数分析。
     
12.  Ismailzai, M. *Picking the Widevine Locks: Acquiring and Using an L3 CDM*. [\[Blog\]](https://www.ismailzai.com/blog/picking-the-widevine-locks) — 面向初学者的 Widevine L3 攻击概述，涵盖 DCA/DFA 方法论。
     

### 开源工具

13.  SideChannelMarvels. *JeanGrey / phoenixAES*. [\[GitHub\]](https://github.com/SideChannelMarvels/JeanGrey) [\[Deadpool\]](https://github.com/SideChannelMarvels/Deadpool) — DFA 自动化密钥恢复工具。phoenixAES 从故障密文对直接求解 AES 轮密钥。Deadpool 提供了白盒 AES 攻击框架。
     
14.  AvalonsWanderer. *widevine-l3-playground*. [\[GitHub\]](https://github.com/AvalonsWanderer/widevine-l3-playground) — Neodyme 工具链的公开实现基础（emu.py, fault.py, crack.py, dump_funcs.py）。
     
15.  AvalonsWanderer. *widevine_key_ladder*. [\[GitHub\]](https://github.com/AvalonsWanderer/widevine_key_ladder) — Widevine 密钥链（Key Ladder）的 Python 参考实现。确认了 CMAC-KDF 参数。
     
16.  hyugogirubato. *KeyDive*. [\[GitHub\]](https://github.com/hyugogirubato/KeyDive) — 基于 Frida 的 Android L3 WVD 自动提取工具。本研究中用于 RSA 私钥捕获。
     
17.  devine-dl. *pywidevine*. [\[GitHub\]](https://github.com/devine-dl/pywidevine) — Widevine CDM 的 Python 实现，WVD 设备文件打包与 License 解析。
     
18.  Qiling Framework. *Qiling Advanced Binary Emulation Framework*. [\[GitHub\]](https://github.com/qilingframework/qiling) [\[Docs\]](https://docs.qiling.io/) — 用户态仿真框架，支持 x86/ARM/MIPS。本研究的核心分析平台。
     
19.  Unicorn Engine. *Unicorn: CPU Emulator Engine*. [\[GitHub\]](https://github.com/unicorn-engine/unicorn) [\[Site\]](https://www.unicorn-engine.org/) — Qiling 的底层 CPU 仿真引擎，基于 QEMU TCG。
     
20.  NSA. *Ghidra: Software Reverse Engineering Framework*. [\[GitHub\]](https://github.com/NationalSecurityAgency/ghidra) [\[Site\]](https://ghidra-sre.org/) — 笔者用于 84 个 VM 函数的 headless 反编译。
     

### 标准与规范

21.  ISO/IEC 23001-7:2016. *Common Encryption in ISO Base Media File Format files (CENC)*. [\[ISO\]](https://www.iso.org/standard/68042.html) — MPEG-CENC 加密标准，定义了 CTR/CBC/CBCS 模式。Widevine 的内容加密基础。
     
22.  W3C. *Encrypted Media Extensions (EME)*. [\[Spec\]](https://www.w3.org/TR/encrypted-media/) — Web 平台的 DRM 标准接口，Chrome/Firefox/Safari 的 CDM 通过 EME 与网页交互。
     
23.  NIST SP 800-108. *Recommendation for Key Derivation Using Pseudorandom Functions*. [\[PDF\]](https://csrc.nist.gov/pubs/sp/800/108/r1/upd1/final) — Widevine 使用的 CMAC-KDF（Counter Mode）标准。enc_key / mac_client / mac_server 的派生依据。
     
24.  Google. *Widevine DRM Architecture*. [\[Docs\]](https://developers.google.com/widevine) [\[Overview\]](https://www.widevine.com/solutions/widevine-drm) — Widevine 官方文档。L1/L2/L3 安全等级定义。
     

* * *

*本文所有分析在合法持有的设备上进行，仅用于安全研究和学术目的。*
