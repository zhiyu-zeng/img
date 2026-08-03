---
title: 谁在铸造破解白盒的武器？ - Quarkslab 十年开源攻防全纪实 | +5 Security Research
source: https://overkazaf.github.io/blogs/posts/quarkslab-drm-whitebox-cryptanalysis-arsenal/
source_host: overkazaf.github.io
clip_date: 2026-08-03T16:32:50+08:00
trace_id: fed2db4b-4927-4572-8537-12a68176b5be
content_hash: 728ae6026dde0aefc59fd51e780fabf582a89c4a1d18406dd033ce71c469b11d
status: synced
tags:
  - 密码学
  - 模拟执行
series: null
feed_source: null
ai_summary: Quarkslab 通过「论文→开源工具→实战」循环，系统化地将白盒密码分析从理论发展为可自动化执行的武器库，并推动 TEE 攻击成为 DRM 防护失效后的下一跳。
ai_summary_style: key-points
images_status:
  total: 18
  succeeded: 18
  failed_urls: []
notion_page_id: 3b175244-d011-819a-b4db-c9d9c1e544f5
ioc:
  cves:
    - CVE-2022-20233
    - CVE-2023-32835
    - CVE-2024-20021
    - CVE-2024-20820
    - CVE-2024-20832
    - CVE-2024-20865
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Quarkslab 通过「论文→开源工具→实战」循环，系统化地将白盒密码分析从理论发展为可自动化执行的武器库，并推动 TEE 攻击成为 DRM 防护失效后的下一跳。
> 
> - **核心突破：** CHES 2016 DCA 论文首次将硬件侧信道统计方法移植到软件白盒，证明仅隐藏白盒设计不足以抵抗攻击，动摇其安全根基。
> - **完整工具链：** SideChannelMarvels 组织提供了 Deadpool → Tracer → Daredevil → JeanGrey → Stark 的模块化攻击套件，并通过 LIEF 实现 Android SO 到 Linux 环境的无缝跨平台攻击。
> - **TEE 实战突破：** 三人团队公开了 Samsung TrustZone 攻击链，从 S-EL0 一路打到 EL3 代码执行，证明 TEE 并非不可攻破，且 EL3 控制可直接威胁 Widevine L1 信任根。
> - **攻击范式迭代：** 针对外部编码与 shuffled states 等第 3 代防护，DarkPhoenix 和 BlueGalaxyEnergy 将 DFA 与首个开源 BGE 实现武器化，使攻击能力同步演进。
> - **方法提炼：** 研究者可按「DCA 做统计定位 → DFA 注入故障速攻 → BGE 代数提取静态表」的三板斧决策流复用，或从 Boot Chain 等底层硬件接口另辟突破路径。

> **读完本文，你将获得：**
> 
> -   一张完整的白盒密码攻击工具地图：DFA / DCA / BGE 各自的适用条件和局限
> -   理解 SideChannelMarvels 开源武器库的设计脉络，知道何时该用哪个工具
> -   看清白盒防护从第一代到第三代的演进路线，以及每一代被攻破的根本原因
> -   了解为什么 TEE/TrustZone 攻击成为密码分析失效后的"下一跳"

## 〇、摘要

本文并非一篇逆向工程实录，而是一份 **技术考古报告** 。笔者系统梳理了法国安全公司 Quarkslab 在白盒密码学攻击与 DRM 安全领域的完整研究脉络，试图回答一个问题： **当我们使用 DFA/DCA 去攻击白盒 AES 时，这些武器从哪里来，经历了怎样的锻造过程？**

核心发现：

1.  **理论奠基（2016）** ：DCA 论文（CHES 2016 最佳论文）将硬件侧信道分析移植到软件白盒，从根本上证明了「隐藏白盒设计是不够的」
2.  **工具武器化（2016–2020）** ：围绕 SideChannelMarvels 组织，构建了 Deadpool → JeanGrey → Daredevil → Tracer → Stark 完整攻击工具链，并通过 LIEF 实现跨平台（Android → Linux）无缝迁移
3.  **TEE 实战突破（2019–2020）** ：三人团队在 Black Hat USA 2019 公开 Samsung TrustZone 攻击链，从 S-EL0 一路打到 EL3 代码执行——这层 TEE 正是 Widevine L1 DRM 的信任根基
4.  **新一代工具（2023–2024）** ：DarkPhoenix（带外部编码的 DFA）和 BlueGalaxyEnergy（首个开源 BGE 实现）将攻击能力推进到下一代白盒防护

笔者在前两篇文章中对 [Widevine L3 keybox 的 DFA 提取](https://overkazaf.github.io/blogs/posts/widevine-l3-keybox-mass-production/) 和 [Chrome CDM 白盒 AES 的 13 次碰壁](https://overkazaf.github.io/blogs/posts/chrome-cdm-stream-dump-widevine-vtable-hook/) 做了亲身实战，本文则退后一步，把镜头对准这些武器背后的铸剑者。

* * *

## 一、路线总览

十年的研究不是一条直线，而是四个彼此叠加的阶段。下面这张管线图从左到右展示了 Quarkslab 如何从一篇学术论文出发，逐步构建出完整的白盒攻击生态——每个阶段的产出都是下一个阶段的输入：

![Quarkslab 四阶段攻击管线](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/afbb135bf032b494.png) *四个阶段的递进关系：Phase 1 的 DCA/DFA 理论催生了 Phase 2 的工具链（Deadpool/JeanGrey/Daredevil）；工具链的成熟使 Phase 3 的 TEE 实战成为可能（Samsung TrustZone EL3 代码执行）；而实战中暴露的新防护手段（外部编码、shuffled states）反过来驱动了 Phase 4 的新一代工具（DarkPhoenix/BlueGalaxyEnergy）。注意管线不是单向的——右侧的「新一代工具」又会被未来的研究者用于攻击下一代 DRM 实现。*

如果把这四个阶段展开到具体年份，就形成了下面这条时间线。每个节点标注了产出类型——绿色是论文/理论突破，黄色是工具发布，红色是漏洞利用实战，紫色是博客/教程。可以看到 Quarkslab 的节奏非常规律： **每 2–3 年完成一次「理论 → 工具 → 实战」的完整循环** 。

![Quarkslab 时间线 2015–2024](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/178912689b6ac1c1.png) *2015–2024 完整时间线。两个密集产出期清晰可见：2016 年（CHES Best Paper + SideChannelMarvels 五件套同年发布）和 2023–2024 年（DarkPhoenix + BlueGalaxyEnergy 双工具接力）。中间的 2019–2020 年则是 TEE 实战的爆发期——Black Hat 演讲、三篇深度博客、CVE 补丁，全部压缩在 18 个月内完成。*

将管线图和时间线结合起来，Quarkslab 的 DRM 相关工作可以概括为以下四个阶段：

| 阶段  | 时间  | 里程碑 | 核心人物 | 产出  |
| --- | --- | --- | --- | --- |
| **① 理论突破** | 2015–2016 | CHES 2016 DCA 最佳论文 | Charles Hubain, Philippe Teuwen | 证明 DCA 可攻破任意白盒 AES |
| **② 工具武器化** | 2016–2018 | SideChannelMarvels + LIEF 集成 | Philippe Teuwen, Romain Thomas | Deadpool / JeanGrey / Daredevil / Stark |
| **③ TEE 实战** | 2019–2020 | Samsung TrustZone 全链漏洞 | Adamski, Guilbon, Peterlin | EL3 代码执行（SVE-2019-16665） |
| **④ 新一代工具** | 2020–2024 | QBDI 碰撞攻击 + DarkPhoenix + BGE | Paul Hernault, Nicolas Surbayrole | 破解带外部编码 + shuffled states 的白盒 |
| **⑤ 全栈纵深** | 2023–2024 | Android FBE + Boot Chain 4 CVE | Rossi Bellom, Melotti, Neveu | 从 USB 接口到 Secure World 全内存泄露 |

> 一条贯穿始终的线索：Quarkslab 的研究者总是先 **发表理论** ，再 **开源工具** ，最后在 **真实系统上实战验证** 。这种「论文 → 代码 → 漏洞」的三拍节奏，使他们的工作具有极强的可复现性和工程影响力。

* * *

## 二、引言

### 2.1 Quarkslab 是谁

![Quarkslab](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/875776a4d7f57991.bin) 成立于 2011 年，总部巴黎，创始人 **Fred Raynal** （法国安全社区元老，MISC 杂志创始人之一）。公司定位于「进攻性安全研究 + 防护产品」双轮驱动——既发布攻击工具（SideChannelMarvels），也售卖白盒保护方案（QShield）。

这种「既做矛又做盾」的模式在安全行业并不罕见，但 Quarkslab 做到了极致： **他们用自己开源的攻击工具来测试自己卖的防护产品** 。

| 关键研究员 | 方向  | 代表作 |
| --- | --- | --- |
| **Philippe Teuwen** | 白盒密码学 · 侧信道 | DCA 论文（CHES 2016）、DFA blog、BGE 工具 |
| **Charles Hubain** | 白盒密码学 · DBI | DCA 论文、DFA blog、Tracer |
| **Romain Thomas** | 二进制分析 · 可执行格式 | LIEF 库创始人、QBDL |
| **Adrien Guinet** | 符号执行 · 密码学 | WannaKey（WannaCry 密钥恢复）、Triton 贡献、QBDL |
| **Maxime Peterlin** | TEE 安全 | Samsung TrustZone 攻击（Black Hat 2019） |
| **Alexandre Adamski** | TEE 安全 · 逆向 | Samsung TrustZone 系列（3 篇博客 + BH） |
| **Joffrey Guilbon** | TEE 安全 · fuzzing | Samsung TrustZone + AFL×Unicorn |
| **Paul Hernault** | DBI · 密码分析 | QBDI 碰撞攻击 |
| **Nicolas Surbayrole** | 白盒密码学 | BlueGalaxyEnergy |

### 2.2 为什么笔者要写这篇文章

笔者在做 Widevine L3 DFA 时，核心工具链就是 SideChannelMarvels 的 `phoenixAES` （JeanGrey 里的模块）和 `aes_keyschedule` （Stark）——它们把 DFA 从「论文里的概念」变成了「终端里的 one-liner」。当笔者碰壁于 Chrome CDM 4.10.2934 的白盒 AES 时，又是 Quarkslab 的 DCA/collision 相关论文帮助笔者理解了「为什么这个实现不可被 DFA 攻破」。

换句话说， **Quarkslab 的工作是笔者前两篇文章的学术上游** 。不把这条脉络理清楚，整个系列就缺了地基。

### 2.3 与本博客其他文章的关系

| 本博客文章 | Quarkslab 直接关联 |
| --- | --- |
| [Widevine L3 keybox 量产](https://overkazaf.github.io/blogs/posts/widevine-l3-keybox-mass-production/) | 使用 JeanGrey/phoenixAES + Stark/aes_keyschedule 做 DFA |
| [Chrome CDM 流捕获](https://overkazaf.github.io/blogs/posts/chrome-cdm-stream-dump-widevine-vtable-hook/) | DCA/collision 理论帮助理解白盒 AES 为何不可提取密钥 |
| [抖音六神签名](https://overkazaf.github.io/blogs/posts/douyin-sixgod-metasec-unidbg-reverse-engineering/) | OLLVM 去混淆思路借鉴 Triton DSE |
| **本文** | 系统梳理上述工具和理论的源头 |

* * *

## 三、知识准备

### 3.1 白盒密码学的困境

传统密码学假设攻击者只能看到输入和输出（黑盒）；硬件侧信道分析假设攻击者能观测功耗/电磁（灰盒）；而白盒场景假设攻击者拥有 **完整的执行环境控制权** ——可以调试、dump 内存、注入错误、修改代码。

DRM 恰恰是白盒密码学最重要的应用场景：Widevine CDM 跑在用户的手机/浏览器里，攻击者拥有 root 权限和任意调试能力。白盒 AES 的任务是： **即使攻击者能看到每一条指令的执行，也无法提取出密钥** 。

截至 2026 年，学术界的共识是： **没有公开的、已被证明安全的白盒 AES 设计** 。所有已知方案都已被攻破——很大程度上归功于 Quarkslab。

### 3.2 三种核心攻击范式

Quarkslab 的工作围绕三种攻击展开：

| 攻击  | 全称  | 原理  | 需要的条件 | Quarkslab 工具 |
| --- | --- | --- | --- | --- |
| **DCA** | Differential Computation Analysis | 收集大量执行 trace → 对每个内存地址做统计相关性分析 → 定位密钥相关操作 | 能运行目标程序 ~1000 次，能收集内存 trace | Daredevil, Tracer |
| **DFA** | Differential Fault Analysis | 在 AES 倒数第二轮注入单字节错误 → 从正确/错误输出对推导密钥 | 能修改执行（注入 fault），能看到密文 | JeanGrey (phoenixAES), DarkPhoenix |
| **BGE** | Billet-Gilbert-Ech-Chatbi | 分析白盒 T-table 的代数结构 → 恢复仿射等价关系 → 提取密钥 | 能读取白盒查找表 | BlueGalaxyEnergy |

> 这三种攻击的难度和适用范围递进：DCA 最通用但需要大量 trace；DFA 更快但需要 fault 注入能力；BGE 最精准但需要识别出 T-table 结构。Quarkslab 按这个顺序逐步开源了对应工具。

### 3.3 DBI 技术栈对比：Valgrind 及其替代品

DCA 和 DFA 攻击的前提是 **能够观测或修改白盒程序的内部执行状态** ——这依赖于 DBI（Dynamic Binary Instrumentation，动态二进制插桩）技术。DBI 的基本原理是：在目标程序运行时，动态插入监控代码，记录每一条指令的执行、每一次内存读写的地址和值，而不需要目标程序的源码。

Quarkslab 的 Tracer 工具提供了两个 DBI 后端： **TracerGrind** （基于 Valgrind）和 **TracerPin** （基于 Intel PIN）。理解它们的差异以及与其他 DBI 方案的关系，有助于你根据目标平台选择正确的工具。

**Valgrind** 是什么：Valgrind 是一个开源的指令级仿真框架，最初为 C/C++ 程序内存调试而生（最知名的用途是 `memcheck` 检测内存泄漏）。它通过将目标程序的机器码\*\*翻译为中间表示（VEX IR）\*\*再重新编译执行来实现插桩——相当于一个 JIT 编译器。这种「翻译执行」的架构使得 Valgrind 可以在每条指令前后插入任意监控逻辑，而无需修改目标二进制。TracerGrind 就是一个 Valgrind 插件，在每次内存读写时记录地址和值，生成 DCA/DFA 需要的 trace 文件。

以下是 Quarkslab 研究中涉及的所有 DBI 方案的横向对比：

| 特性  | **Valgrind** | **Intel PIN** | **QBDI** | **Frida** | **DynamoRIO** | **Unicorn/unidbg** |
| --- | --- | --- | --- | --- | --- | --- |
| **原理** | VEX IR 翻译执行 | JIT 编译插桩 | LLVM-based JIT | JavaScript 注入 + inline hook | 翻译执行 | CPU 仿真（QEMU 后端） |
| **平台** | Linux, macOS | Linux, Windows, macOS | Linux, macOS, Android, iOS, Windows | 全平台 | Linux, Windows | 跨平台（仿真，不依赖目标 OS） |
| **架构** | x86, x86_64, ARM, AArch64 | x86, x86_64 | x86, x86_64, ARM, AArch64 | x86, x86_64, ARM, AArch64 | x86, x86_64, AArch64 | x86, x86_64, ARM, AArch64, MIPS |
| **性能** | 极慢（20–50× 减速） | 中等（2–5× 减速） | 中等（3–10× 减速） | 中等（取决于 hook 密度） | 中等（3–8× 减速） | 慢（仿真器开销，但可控） |
| **trace 粒度** | 指令级 + 内存级 | 指令级 + 内存级 | 指令级 + 内存级 | 函数级（默认）/ 指令级（Stalker） | 指令级 + 内存级 | 完全可控（内存回调） |
| **Android SO 支持** | 需 LIEF 迁移 | ✗（仅 x86） | ✓（原生支持） | ✓（原生支持） | 有限  | ✓（unidbg 专为此设计） |
| **适合场景** | DCA trace 收集（Quarkslab 首选） | DCA trace（Windows 目标） | 跨平台 DCA + 碰撞攻击 | Hook 单个函数、在线调试 | 大规模 fuzzing | Android SO 仿真 + DFA fault 注入 |
| **Quarkslab 使用** | TracerGrind（Tracer 项目） | TracerPin（Tracer 项目） | 碰撞攻击（§4.4） | 与 QBDI 集成 | —   | —   |

**选型建议** ：

-   **首次尝试白盒攻击** ：先用 **Valgrind + TracerGrind** ，虽然最慢但最稳定、trace 最完整，且 Deadpool 的示例脚本默认就是基于它的
-   **攻击 Android SO** ：如果目标是 `.so` 库且有 JNI 依赖， **unidbg** 是最实用的选择（笔者在 Widevine L3 和抖音六神中都使用了它）；如果依赖不复杂，用 **LIEF 迁移到 Linux + Valgrind** 更快
-   **需要在真机上动态分析** ： **Frida + QBDI** 组合——Frida 注入进程，QBDI 做指令级 trace
-   **Windows 上的白盒** ： **Intel PIN + TracerPin** 是唯一的选择

### 3.4 DCA 算法伪代码

上面的表格告诉你 DCA/DFA/BGE 各需要什么条件，但没有告诉你它们 **怎么工作** 。如果你想复刻 Quarkslab 的研究——而不仅仅是当工具的使用者——必须理解核心算法。以下三节分别给出每种攻击的伪代码，按「能直接改写成 Python 脚本」的粒度来写。

DCA 的核心思想可以压缩成不到 30 行 Python：

```python
# DCA 攻击核心算法
def dca_attack(traces, plaintexts, byte_index):
    """
    traces:     N × T 矩阵 (N 次执行, T 个采样点/内存地址)
    plaintexts: N × 16 矩阵 (N 个明文)
    byte_index: 攻击的密钥字节位置 (0-15)
    """
    best_corr = 0
    best_key = 0
    
    for key_guess in range(256):
        # 假设密钥字节 = key_guess
        # 计算每个明文通过 S-box 后的中间值
        hypothetical = [
            SBOX[plaintexts[i][byte_index] ^ key_guess]
            for i in range(N)
        ]
        # Hamming weight 作为功耗/内存泄露模型
        hw = [bin(v).count('1') for v in hypothetical]
        
        # 对 trace 矩阵的每一列计算 Pearson 相关系数
        for t in range(T):
            column = traces[:, t]
            corr = pearson(hw, column)
            if abs(corr) > best_corr:
                best_corr = abs(corr)
                best_key = key_guess
    
    return best_key  # 最可能的密钥字节值
```

**关键参数** ：

-   **N（trace 数量）** ：越多统计越可靠，通常 1000–5000
-   **T（采样点数）** ：等于 trace 中记录的内存地址/值总数，越多搜索空间越大但不影响攻击成功率
-   **泄露模型** ：Hamming Weight（默认）、Hamming Distance、Identity 等

**扩展点 1 — 高阶 DCA** ：当白盒实现使用了 masking（每个中间值被随机掩码保护），单字节相关性消失。此时需要 **高阶 DCA** ——对两个采样点做联合统计（例如 `traces[:,t1] ⊕ traces[:,t2]` ），代价是 $O(T^2)$ 复杂度。Daredevil 支持高阶 CPA。

### 3.5 DFA 算法伪代码

如果说 DCA 是「观察大量执行 trace 然后做统计」，DFA 则是一种更具侵入性的方法——主动修改白盒的内部状态（注入 fault），然后从正确输出和错误输出的 **差异** 中推导密钥。DFA 的优势是速度快（通常只需要 8–200 个 fault，而不是 2000 次完整执行），代价是需要找到注入 fault 的位置。以下伪代码展示了核心推导逻辑：

```python
# DFA 攻击核心流程
def dfa_attack(correct_ciphertext, faulty_ciphertexts):
    """
    correct_ciphertext:  正确执行的 16 字节密文
    faulty_ciphertexts:  注入故障后的密文列表 (至少 8 个)
    """
    # 对于每一对 (correct, faulty)
    for faulty in faulty_ciphertexts:
        diff = xor(correct_ciphertext, faulty)
        
        # AES 最后一轮: SubBytes → ShiftRows → AddRoundKey (无 MixColumns)
        # 如果 fault 注入在第 9 轮的 MixColumns 之前:
        #   → 影响最终密文的 4 个字节 (由 MixColumns 扩散)
        #   → 不受影响的 12 字节 = 0x00
        
        affected = count_nonzero_bytes(diff)
        if affected == 4:
            # 4 字节差分 → 可以定位 fault 在哪一列
            column = identify_column(diff)
            
            # 对该列的 4 个密钥字节穷举
            for k0, k1, k2, k3 in product(range(256), repeat=4):
                # 验证: InvSubBytes(c[i] ⊕ ki) ⊕ InvSubBytes(f[i] ⊕ ki)
                # 是否满足 MixColumns 的线性扩散关系
                if verify_mixcolumn_constraint(correct, faulty, column, k0, k1, k2, k3):
                    candidates.add((k0, k1, k2, k3))
        
        # 多个 fault 的候选集取交集 → 唯一解
    
    round_key_10 = intersect_all_candidates()
    original_key = aes_key_schedule_inverse(round_key_10)
    return original_key
```

**关键参数** ：

-   **Fault 位置** ：必须在第 8 轮 MixColumns 之后、第 9 轮 MixColumns 之前（对 AES-128）
-   **Fault 数量** ：理论最少 2 个（每个 fault 恢复 4 字节密钥），实际通常需要 4–200 个（因为 fault 位置不精确）
-   **Fault 模型** ：单字节随机故障（random byte fault）→ 改变一个 T-table 条目的一个字节

**扩展点 2 — Fault 位置自动定位** ：在白盒实现中，AES 轮次被编码到查找表里，很难手动确定「第 9 轮在哪里」。Quarkslab 的方法是 **暴力搜索** ——修改每个表的每个字节，检查输出是否产生 4 字节差分。如果是 → 该表位于倒数第二轮 MixColumns 区域。

### 3.6 BGE 攻击原理（代数视角）

DCA 和 DFA 都需要 **执行** 白盒程序——要么跑很多次收集 trace，要么注入 fault 比较输出。但有一种场景它们都无能为力：如果你只拿到了白盒实现的 **静态查找表数据** （例如从固件 dump 中提取），无法执行程序怎么办？BGE 攻击正是为这种场景设计的——它不需要执行目标程序，只需要 **读取白盒查找表的内容** ，通过代数分析直接恢复密钥。

BGE 攻击的数学比 DCA/DFA 更深。核心思想：

白盒 AES 的 T-table 可以表示为：

```
T_i(x) = L_i · S(x ⊕ k_i) ⊕ c_i
```

其中 $L_i$ 是线性变换，$S$ 是 AES S-box，$k_i$ 是密钥字节，$c_i$ 是常数。

**BGE 的三步法** ：

1.  **仿射等价检测** ：对两个 T-table $T_i, T_j$，计算 $T_i^{-1} \\circ T_j$。如果它们编码了相同的 S-box，则结果是仿射函数
2.  **线性部分提取** ：利用仿射函数的线性性质，通过选取特定输入来分离 $L_i$ 和 $c_i$
3.  **密钥恢复** ：知道 $L_i$ 后，$k_i = T_i^{-1}(c_i)$（简化表述）

**扩展点 3 — 非标准 S-box** ：如果白盒实现替换了 AES 的 S-box（用自定义非线性函数），BGE 的仿射等价检测仍然有效——因为它检测的是结构相似性，不依赖于具体的 S-box 值。BlueGalaxyEnergy v2 正是利用了这一点。

* * *

## 四、技术突破全纪录

### 4.1 CHES 2016：DCA — 把硬件侧信道搬进软件

> 这是整个故事的起点。2016 年 8 月，在圣巴巴拉的 CHES 会议上，Quarkslab 的两位研究员与 NXP 的两位密码学家联手发表了一篇改变白盒密码学研究格局的论文。

📺 **演讲视频** ： [CHES 2016 — Differential Computation Analysis: Hiding Your White-Box Designs is Not Enough](https://www.youtube.com/watch?v=Zuhapyo7qFQ)

**问题** ：白盒 AES 实现越来越复杂（代码混淆、指令替换、虚拟机保护），传统逆向分析成本极高。能否有一种 **不需要理解实现细节** 的通用攻击？

**思路** ：硬件 DPA（Differential Power Analysis）通过统计功耗曲线与密钥假设的相关性来提取密钥——它完全不需要知道芯片的内部结构。软件白盒的执行 trace（内存地址访问序列）在统计意义上等价于功耗曲线。

**关键洞察** ：

```
硬件 DPA:   功耗轨迹 W(t)    ↔   密钥假设 K    → 相关系数 ρ
软件 DCA:   内存地址 M(addr)  ↔   密钥假设 K    → 相关系数 ρ
```

如果某个内存地址的值与 `Sbox[plaintext[i] ⊕ key[i]]` 高度相关，那么这个地址就泄露了密钥信息——无论白盒实现如何混淆，只要它执行的是 AES，就 **必然** 存在与密钥相关的中间值。

**方法** ：

1.  用 DBI（Intel PIN / Valgrind）跑目标程序 ~2000 次，每次不同明文
2.  记录所有内存读写地址和值 → 生成 trace 矩阵
3.  对 trace 矩阵的每一列，计算它与 256 个密钥假设下的 S-box 输出的 Pearson 相关系数
4.  相关系数最高的假设 = 正确的密钥字节

**结果** ：攻破了 CHES 2016 白盒挑战赛的所有提交方案。 **获得当年 CHES 最佳论文奖** 。

**论文** ：Bos J.W., Hubain C., Michiels W., Teuwen P. “Differential Computation Analysis: Hiding Your White-Box Designs is Not Enough.” CHES 2016, LNCS vol. 9813, pp. 215–236. ([Springer](https://link.springer.com/chapter/10.1007/978-3-662-53140-2_11))

**对 DRM 的影响** ：这篇论文意味着—— **任何基于标准 AES 的白盒实现，只要攻击者能执行它并收集 trace，就可以被自动化攻破** 。Widevine L3 的白盒 AES 正属于此类。

#### 动手复现 DCA

用 Deadpool 仓库中的 `wbs_aes_ches2016` 示例即可在 30 分钟内走完整个流程：

```bash
# 1. 克隆工具链
git clone https://github.com/SideChannelMarvels/Deadpool.git
git clone https://github.com/SideChannelMarvels/Tracer.git
git clone https://github.com/SideChannelMarvels/Daredevil.git

# 2. 编译 tracer (Valgrind 插件)
cd Tracer/TracerGrind && make && cd ../..

# 3. 编译 Daredevil
cd Daredevil && make && cd ..

# 4. 进入 CHES 2016 白盒挑战
cd Deadpool/wbs_aes_ches2016

# 5. 收集 trace (ValgrindGrind 跑 2000 次, 每次不同明文)
python3 trace_it.py

# 6. 用 Daredevil 做 CPA/DCA 分析
daredevil -c mem_addr1_rw1_128_2000.config

# 输出: 16 字节密钥 + 每字节的相关系数
# 典型结果: 所有字节相关系数 > 0.9 → 攻击成功
```

**扩展点 4 — 对你自己目标的适用** ：把上面的 `wbs_aes_ches2016` 替换为你想攻击的白盒 SO。关键步骤是写一个 `trace_it.py` wrapper，让 Tracer 知道怎么喂明文、从哪里读密文。笔者在 Widevine L3 DFA 中就是这个思路——只不过用 Unicorn 替代了 Valgrind 做 DBI。

* * *

### 4.2 DFA on White-Box AES（2016 年 12 月）

> 如果说 DCA 是「观察」，DFA 就是「干预」——通过主动注入错误来加速密钥恢复。

**博客原文** ： [Differential Fault Analysis on White-box AES Implementations](https://blog.quarkslab.com/differential-fault-analysis-on-white-box-aes-implementations.html) （Philippe Teuwen & Charles Hubain，2016-12-19）

**问题** ：DCA 需要 ~2000 次执行来收集足够的 trace 做统计分析，执行次数多、分析时间长。能否更快？

**思路** ：经典 DFA（Dusart, Letourneux, Vivolo 2002）只需要 ~8 对正确/错误密文就能恢复整个 AES-128 密钥。关键是在第 8 轮或第 9 轮的特定位置注入 **单字节** 故障。

**在白盒上的适配** ：

-   白盒 AES 把 AES 轮操作编码进查找表
-   修改查找表中的 **一个字节** = 注入了一个 fault
-   对比修改前后的输出 = 得到 (correct, faulty) 密文对
-   用 `phoenixAES.crack_bytes()` 从密文对推导第 10 轮密钥
-   用 `aes_keyschedule` 从第 10 轮密钥反推原始密钥

**开源工具链** ：

| 工具  | 仓库  | 作用  |
| --- | --- | --- |
| **Deadpool** | [SideChannelMarvels/Deadpool](https://github.com/SideChannelMarvels/Deadpool) | 白盒实现集合 + DCA/DFA 攻击脚本 |
| **JeanGrey** | [SideChannelMarvels/JeanGrey](https://github.com/SideChannelMarvels/JeanGrey) | DFA 密钥恢复（phoenixAES 模块） |
| **Stark** | [SideChannelMarvels/Stark](https://github.com/SideChannelMarvels/Stark) | AES 密钥调度反推（aes_keyschedule） |
| **Daredevil** | [SideChannelMarvels/Daredevil](https://github.com/SideChannelMarvels/Daredevil) | CPA 高阶相关功率分析 |
| **Tracer** | [SideChannelMarvels/Tracer](https://github.com/SideChannelMarvels/Tracer) | DBI trace 收集（PIN/Valgrind/可视化） |

**对 DRM 的影响** ：笔者在 [Widevine L3 keybox 文章](https://overkazaf.github.io/blogs/posts/widevine-l3-keybox-mass-production/) 中正是使用 `phoenixAES` 从 150 次 fault 中恢复了 ROOT_KEY。DFA 的速度（秒级）远超 DCA（分钟级），是实际攻击白盒 DRM 的首选。

#### 动手复现 DFA

```bash
# 1. 安装 JeanGrey
pip install phoenixAES

# 2. 准备 fault 数据 (格式: 每行一个 hex 密文对)
# fault_data.txt 内容:
#   正确密文 (hex)
#   错误密文1 (hex)
#   错误密文2 (hex)
#   ...

# 3. 一行恢复密钥
python3 -c "
import phoenixAES
with open('fault_data.txt') as f:
    lines = [l.strip() for l in f if l.strip()]
phoenixAES.crack_file('fault_data.txt')
# 输出: Last round key #N found:
#       AES-128 key: da39a3ee5e6b******55bfef95601890
"

# 4. 如果只得到第 10 轮密钥，反推原始密钥
# 编译 Stark
cd Stark && make
./aes_keyschedule <round10_key_hex> 10
# 输出: 原始 AES-128 密钥
```

**扩展点 5 — 自动化 fault 注入框架** ：在实际白盒中，最大挑战不是 DFA 分析（phoenixAES 秒级搞定），而是 **如何高效注入 fault** 。笔者在 Widevine 研究中的方案是用 Unicorn/unidbg hook 内存写入回调，在 T-table 的特定偏移注入随机字节。一个更通用的框架可以：

1.  自动枚举所有 `.data` 段的字节
2.  逐个翻转每个字节执行一次
3.  检查输出密文的 diff 是否为 4 字节模式
4.  符合的 fault → 收集到 `fault_data.txt`
5.  攒够 8–16 个 fault → 调用 `phoenixAES.crack_bytes()`

这就是 Deadpool 中 `attack_*` 脚本的核心逻辑。

* * *

### 4.3 LIEF × SideChannelMarvels（2018）

> 白盒实现往往是 Android SO 库——但 DFA/DCA 工具链运行在 Linux x86_64 上。怎么跨平台？

**博客原文** ： [When SideChannelMarvels meet LIEF](https://blog.quarkslab.com/when-sidechannelmarvels-meet-lief.html) （Romain Thomas，2018-05-18）

**问题** ：SECCON 2016 CTF 的一道白盒 AES 题目以 **Android x86_64 共享库** 形式发布。SideChannelMarvels 的 Tracer（基于 Valgrind）只能在 Linux 上运行。如何让 Android SO 在 Linux 上可执行？

**LIEF 的解法** ：

LIEF（Library to Instrument Executable Formats）是 Romain Thomas 在 Quarkslab 创建的跨平台二进制操作库，支持 ELF/PE/Mach-O/DEX/OAT 解析与修改。([GitHub](https://github.com/lief-project/LIEF))

```python
import lief

lib = lief.parse("target.so")
# 1. 移除 Android 特有依赖
lib.remove_library("liblog.so")
# 2. 修复 libc 名称 (Android bionic → glibc)
lib.get_library("libc.so").name = "libc.so.6"
# 3. 处理符号版本
for sym in lib.imported_symbols:
    if sym.has_version and sym.symbol_version.symbol_version_auxiliary:
        sym.symbol_version.symbol_version_auxiliary.name = ""
lib.write("target_linux.so")
```

**结果** ：修改后的 SO 在 Linux 上用 Valgrind trace 收集 → DFA 攻击 → **10.2 秒内恢复密钥，仅 3300 次执行** 。

**为什么这很重要** ：几乎所有移动端 DRM（Widevine、PlayReady、FairPlay 的部分实现）都以 Android/iOS native 库的形式存在。LIEF 让 SideChannelMarvels 的全套攻击工具可以 **直接作用于移动平台的白盒实现** ，不需要在真机上跑。笔者做 Widevine DFA 时用的 Unicorn/unidbg 仿真本质上也是同一思路——把目标代码搬到可控环境执行。

#### 扩展点 6 — 跨平台迁移决策树

当你拿到一个 DRM 的 native 库时，选择哪种「搬运」方式取决于目标的依赖复杂度：

```
目标 SO 依赖复杂度？
├── 低 (纯算法, 无 JNI/系统调用)
│   └── LIEF 修改 → Linux 直接跑 → Tracer/Valgrind 做 DCA/DFA
│       最快, 笔者推荐对 CTF 题和独立白盒库使用
│
├── 中 (有 JNI, 少量系统调用)
│   └── unidbg/Unicorn 仿真 → Hook JNI + 桩系统调用
│       笔者在 Widevine L3 和抖音六神中使用的方案
│
├── 高 (大量系统调用, 依赖 framework)
│   └── Frida + QBDI on device → 真机 DBI
│       目标跑在真机上, 通过 Frida 注入 QBDI
│
└── 极高 (需要 TEE 环境)
    └── Quarkslab 路线: 逆向 TEE OS → 仿真 TA → 攻击
        参考 Samsung TrustZone 研究方法论
```

* * *

### 4.4 QBDI 碰撞攻击（2020）

> DCA 需要统计，DFA 需要注入——有没有一种更轻量的攻击？碰撞攻击只需要找到两个产生相同输出字节的输入。

📺 **相关视频** ： [Unboxing The White-Box: Practical Attacks Against Obfuscated Ciphers](https://www.youtube.com/watch?v=A9md7ONv7tI)

📺 **教程系列** ： [White Box Unboxing — Software Side-Channel attack on AES (Part 4/4)](https://www.youtube.com/watch?v=7KS3XHP35QY)

**博客原文** ： [Introduction to Whiteboxes and Collision-Based Attacks With QBDI](https://blog.quarkslab.com/introduction-to-whiteboxes-and-collision-based-attacks-with-qbdi.html) （Paul Hernault，2020-08-18）

**问题** ：某些白盒实现使用了「输出编码」（output encoding），DCA 的统计模型基于 Hamming weight/distance，遇到非标准编码后相关系数下降到噪声水平。

**思路** ：AES 的 MixColumns 操作具有一个代数性质——如果只改变输入的第 $i$ 字节（$i \\in {0,1,2,3}$），那么输出中只有 4 个字节会变化。利用这个性质：

1.  固定 15 字节明文，只变化第 $i$ 字节
2.  用 QBDI 插桩执行，记录每次执行中所有内存地址的读写值
3.  找到两个不同输入在 **同一内存地址** 产生 **相同值** 的情况 = **碰撞**
4.  碰撞意味着 `Sbox[p1 ⊕ k] = Sbox[p2 ⊕ k]` ，由 S-box 的非线性性可以推导密钥字节

**QBDI 的作用** ：

QBDI（QuarkslaB Dynamic Binary Instrumentation）是 Quarkslab 开发的跨平台 DBI 框架（ [GitHub](https://github.com/QBDI/QBDI) ），支持 x86/x64/ARM/AArch64，集成 Frida，相当于 Intel PIN 的跨平台替代品。在碰撞攻击中用于高效收集内存 trace。

**结果** ：成功攻破了 GreHack 2019 CTF 的白盒挑战，恢复密钥 `GH19{AES is FUN}` 。

**与 DCA 的互补关系** ：

| 维度  | DCA | 碰撞攻击 |
| --- | --- | --- |
| 统计模型 | Pearson/CPA | 等值比较 |
| 对抗输出编码 | 效果下降 | **不受影响** |
| 执行次数 | ~2000 | ~256×16 |
| 实现复杂度 | 低   | 中   |

* * *

### 4.5 Samsung TrustZone 攻击链（2019–2020）

> 前面的工作都在攻击 **软件白盒** ——但 Widevine L1/PlayReady SL3000 把密码学操作放进了 **TEE（可信执行环境）** 。能攻破 TEE，就能攻破最高安全等级的 DRM。

📺 **Black Hat 2019 演讲** ： [Breaking Samsung’s ARM TrustZone](https://www.youtube.com/watch?v=uXH5LJGRwXI)

**幻灯片** ： [Black Hat USA 2019 PDF](https://i.blackhat.com/USA-19/Thursday/us-19-Peterlin-Breaking-Samsungs-ARM-TrustZone.pdf)

**博客系列** （三篇，递进阅读）：

-   [Part 1: Components](https://blog.quarkslab.com/a-deep-dive-into-samsungs-trustzone-part-1.html) （2019-12-10）— Kinibi OS 架构、Trustlet 格式（MCLF）、安全驱动、ARM Trusted Firmware
-   [Part 2: Tools](https://blog.quarkslab.com/a-deep-dive-into-samsungs-trustzone-part-2.html) （2019-12-17）— Ghidra MCLF loader、AFL×Unicorn fuzzer、Manticore 符号执行
-   [Part 3: Exploits](https://blog.quarkslab.com/a-deep-dive-into-samsungs-trustzone-part-3.html) （2020-07-02）— 三个漏洞的完整利用链

**研究工具开源** ： [quarkslab/samsung-trustzone-research](https://github.com/quarkslab/samsung-trustzone-research)

**目标** ：Samsung Galaxy S6–S9 设备上的 **Kinibi** TEE 实现（基于 ARM TrustZone）。

**为什么与 DRM 相关** ：Widevine L1 和 PlayReady SL3000 都以 **Trusted Application（TA）** 的形式运行在 TEE 中。攻破 TEE = 攻破 DRM 的信任根基。Samsung 设备上的 Widevine L1 TA 就跑在这个 Kinibi OS 里。

**攻击链** ：

从用户态到 EL3 的利用路径跨越了 ARM 的全部四个异常等级。理解这条链需要知道：TrustZone 把 CPU 分为 Normal World（EL0/EL1）和 Secure World（S-EL0/S-EL1/EL3），Trustlet 运行在 S-EL0（受限安全模式），而 ARM Trusted Firmware 运行在 EL3（最高特权）。Quarkslab 的攻击需要连续穿透三道边界，每一步都需要前一步提供的能力：

```
用户态 (EL0)
   │  发送精心构造的命令
   ▼
Trustlet SEM (S-EL0)          ← 漏洞 1: 栈溢出
   │  内存拷贝越界
   ▼
Secure Driver VALIDATOR (S-EL0) ← 漏洞 2: 特权上下文代码执行
   │  利用 mmap 映射
   ▼
Kinibi Micro-Kernel (S-EL1)    ← 漏洞 3: SVE-2019-16665
   │  映射 EL3 代码页，修改 ATF
   ▼
ARM Trusted Firmware (EL3)     ← 最终: 任意代码执行
```

下表对应上图的三个漏洞，分别说明攻击的组件、漏洞类型和利用方式。注意漏洞 1 和 2 本身并不罕见（栈溢出 + 命令注入），真正精妙的是漏洞 3——利用 Kinibi 内核的 mmap 实现缺陷，把 EL3 的代码页映射为可写，然后直接修改 ARM Trusted Firmware 的代码：

**三个漏洞详解** ：

| #   | 组件  | 类型  | 利用方式 | CVE |
| --- | --- | --- | --- | --- |
| 1   | SEM Trustlet | 栈缓冲区溢出 | 精心构造的命令 → 内存拷贝越界 → 控制 PC | —   |
| 2   | VALIDATOR 安全驱动 | 特权代码执行 | 从 Trustlet 发送命令到 Secure Driver → 在特权上下文执行 | —   |
| 3   | Kinibi mmap | 内存映射缺陷 | 映射 Kinibi 和 EL3 的代码页 → 修改 ARM Trusted Firmware | **SVE-2019-16665** |

**补丁时间线** ：Samsung 在 2020 年 2 月至 6 月陆续推送补丁。

**对 DRM 的意义** ：这项研究证明了 **TEE 并非不可攻破的黑箱** 。虽然 Quarkslab 没有公开针对 Widevine L1 TA 的具体攻击，但他们展示的 EL3 代码执行能力意味着：攻击者在获得 EL3 控制后，可以读取任何 TA 的内存——包括 Widevine L1 TA 中的设备私钥。这也解释了为什么 Google 后来要求 L1 设备必须通过更严格的硬件安全认证（如 StrongBox Keymaster、Android Hardware Attestation）。

#### 动手复现 Samsung TrustZone 分析

```bash
# 1. 克隆工具
git clone https://github.com/quarkslab/samsung-trustzone-research.git
cd samsung-trustzone-research

# 2. 获取旧版 Samsung 固件（Galaxy S7, Android 8.0）
#    从 samfw.com 或 samfrew.com 下载
#    解压获得 system.img → 提取 /vendor/app/mcRegistry/ 下的 Trustlet 文件

# 3. 用 Ghidra 加载 Trustlet (MCLF 格式)
#    安装 Quarkslab 提供的 MCLF loader:
cp ghidra/mclf_loader.py ~/.ghidra/.ghidra_*/Extensions/

# 4. 用 Unicorn 仿真 TA
cd emulator
python3 emulator.py --ta ../samples/widevine.tlbin --cmd 0x1

# 5. 用 AFL×Unicorn fuzz TA 命令处理
cd ../tainting
# 按 README 配置 AFL 输入格式 → fuzz 目标 TA 的 command handler
```

**扩展点 7 — 从 Samsung 迁移到 Qualcomm** ：360 Alpha Lab 的 [Wideshears](https://www.youtube.com/watch?v=0oWFJq6tLe4) 做的正是这件事。Qualcomm QTEE 的 TA 格式（标准 ELF + QSEE 特定 header）比 Kinibi 的 MCLF 更接近常规逆向分析。关键差异在于 QTEE 的内存共享机制（ION buffer → TA mmap）和 ASLR 实现——360 找到了 info leak 绕过 ASLR 的方法，这是整个利用链的核心。

#### 2024 年后续：GlobalConfusion — 用设计缺陷批量制造 TEE 0-day

Quarkslab 在 2019–2020 年的 Samsung TrustZone 攻击是「一次一个漏洞」的手工艺——逆向特定 TA、找到特定溢出、构造特定利用链。但 2024 年 8 月，EPFL HexHive 实验室的 Marcel Busch、Philipp Mao 和 Mathias Payer 在 USENIX Security 2024 上发表的 [GlobalConfusion](https://www.usenix.org/conference/usenixsecurity24/presentation/busch-globalconfusion) 将这种攻击从手工推进到了 **工业化** 。

**核心发现** ：GlobalPlatform TEE Internal Core API（所有 TrustZone TA 的事实标准接口）存在一个 **设计层面的缺陷** ——它将参数类型检查设为 **可选的预处理器宏** （fail-open design），而非强制的运行时校验。这意味着每当 TA 开发者忘记调用 `TEE_PARAM_TYPE_GET` 检查 `paramTypes` 时，就会产生一个 type-confusion 漏洞：攻击者可以把 `value` 类型的参数（两个 32-bit 整数）伪装成 `memref` 类型（指针 + 大小），从而获得 **在 TA 地址空间内任意读写** 的能力。

**规模** ：

| 指标  | 数据  |
| --- | --- |
| 扫描 TA 总数 | **14,777** 个（来自 5 家厂商的固件镜像） |
| 覆盖 TEE 平台 | BeanPod、MiTEE、QSEE、Kinibi、 **TEEGRIS** |
| 确认已知漏洞 | 9 个 |
| 发现静默修复漏洞 | 10 个 |
| 发现 **0-day** | **14 个** |
| 分配 CVE | **4 个** （含 CVE-2023-32835，MediaTek TA0811） |
| Bug bounty | $12,000 |
| 受影响 OEM | Samsung、Xiaomi、Oppo、Vivo、华为 |

**Samsung TEEGRIS 的数据最触目惊心** ：在 4,589 个 TEEGRIS TA 中，有 **291 个漏洞实例** （#Vuln 列），17 个唯一受影响的 TA，其中 **7 个是 0-day** 。受影响的 TA 包括 `tz_kg.elf` （密钥生成）和 `secstor2.elf` （安全存储）——这些正是 Widevine L1 DRM 信任链的底层依赖。

**实战利用示例** ：研究者在 Xiaomi Redmi 设备上演示了两个利用：

1.  **TA1449** （小米，BeanPod）：type-confusion → 任意内存读取 → 泄露 TA 内存中的认证密钥
2.  **TA0811** （MediaTek，CVE-2023-32835）：type-confusion → 利用 `query_drmkey_impl` 函数 → 覆盖返回地址 → **TA 内代码执行**

**工具开源** ： [HexHive/GlobalConfusion](https://github.com/HexHive/GlobalConfusion) （GPCheck 静态分析器 + TIPI 污点分析框架）

**与 Quarkslab 工作的关系** ：

```
Quarkslab (2019)                    GlobalConfusion (2024)
───────────────                     ─────────────────────
手动逆向特定 TA                      自动化扫描 14,777 个 TA
找 1 个栈溢出                        发现 1 类设计缺陷 → 批量 0-day
攻击 Kinibi (Galaxy S6–S9)           覆盖 5 种 TEE + 5 家 OEM
3 个漏洞 → EL3 代码执行               14 个 0-day → 4 CVE
```

两项工作是 **互补的** ：Quarkslab 证明了 TEE 可以被攻破（深度），GlobalConfusion 证明了这种脆弱性是 **系统性的、跨厂商的** （广度）。对于 DRM 安全研究者来说，GlobalConfusion 的意义在于： **即使 Widevine L1 TA 本身没有漏洞，它运行在同一 TEE 中的其他 TA 可能有 type-confusion 漏洞——攻破任何一个 TA 就能读取整个 TEE 的内存，包括 Widevine 的私钥** 。

* * *

### 4.6 DarkPhoenix（2023）

> 实际的白盒实现往往不是「裸 AES」，而是在 AES 的输入和输出端加上了额外的编码层（external encodings）。传统 DFA 只能恢复带编码的密钥，还需要额外步骤去除编码。DarkPhoenix 把这两步合二为一。

**博客原文** ： [Dark Phoenix: a new White-box Cryptanalysis Open Source Tool](https://blog.quarkslab.com/dark-phoenix-a-new-white-box-cryptanalysis-open-source-tool.html) （2023-02-28）

**仓库** ： [SideChannelMarvels/DarkPhoenix](https://github.com/SideChannelMarvels/DarkPhoenix)

**问题** ：带外部编码的白盒 AES 看起来像这样：

```
明文 → [外部编码 F] → [白盒 AES] → [外部编码 G] → 密文
```

传统 DFA（JeanGrey/phoenixAES）恢复的是 `G⁻¹ ∘ AES_K ∘ F` 的等价密钥，而非真正的 K。要获得 K，还需要单独破解 F 和 G。

**DarkPhoenix 的解法** ：基于 Amadori, Michiels, Roelse (2020) 的论文，通过注入 **超过 100 万次 fault** ，利用 DFA 错误传播的统计特征同时恢复密钥和外部编码。

**与 JeanGrey 的区别** ：

| 维度  | JeanGrey (phoenixAES) | DarkPhoenix |
| --- | --- | --- |
| 处理外部编码 | ✗   | ✓   |
| 所需 fault 数 | ~8–200 | ~1,000,000+ |
| 速度  | 秒   | 分钟–小时 |
| 适用场景 | 无外部编码的白盒 | 有/无外部编码的白盒 |

* * *

### 4.7 BlueGalaxyEnergy（2023–2024）

> BGE 攻击的理论在 2004 年就提出了（Billet, Gilbert, Ech-Chatbi），但 19 年来没有公开的开源实现——直到 Quarkslab 的 Nicolas Surbayrole 和 Philippe Teuwen 填补了这个空白。

**博客系列** ：

-   [Blue Galaxy Energy: a new White-box Cryptanalysis Open Source Tool](https://blog.quarkslab.com/blue-galaxy-energy-a-new-white-box-cryptanalysis-open-source-tool.html) （2023-12-21，v1）
-   [BGE Attack on AES White-Boxes: Extending Blue Galaxy Energy for Decryption and Shuffled States](https://blog.quarkslab.com/bge-attack-on-aes-white-boxes-extending-blue-galaxy-energy-for-decryption-and-shuffled-states.html) （2024-02-29，v2）

**仓库** ： [SideChannelMarvels/BlueGalaxyEnergy](https://github.com/SideChannelMarvels/BlueGalaxyEnergy)

**问题** ：DFA 和 DCA 都需要 **执行** 白盒程序（注入 fault 或收集 trace）。如果攻击者只能 **读取白盒查找表** （例如从固件中提取），但无法执行怎么办？

**BGE 的思路** ：白盒 AES 的核心是将 AES 轮操作编码为查找表 $T_i$。BGE 利用这些表的代数结构：

1.  每个 $T_i$ 可以分解为 $T_i(x) = M_i \\cdot \\text{Sbox}(x \\oplus k_i) \\oplus c_i$（仿射等价）
2.  分析多个表之间的关系 → 建立约束方程组
3.  解方程组 → 恢复密钥

**v2 的改进** ：

-   支持 **解密方向** 的白盒（不仅仅是加密）
-   处理 **shuffled states** （状态字节被打乱的实现）
-   设置 `shuffle=True` 参数即可

**三种攻击的完整对比** ：

| 维度  | DCA | DFA | BGE |
| --- | --- | --- | --- |
| 需要执行目标 | ✓   | ✓   | ✗   |
| 需要注入错误 | ✗   | ✓   | ✗   |
| 需要读取查找表 | ✗   | ✗   | ✓   |
| 处理外部编码 | △   | △ (DarkPhoenix ✓) | ✓   |
| 处理 shuffled states | ✗   | ✗   | ✓ (v2) |
| 攻击速度 | 分钟  | 秒   | 毫秒–秒 |
| 自动化程度 | 高   | 高   | 高   |
| Quarkslab 工具 | Daredevil | JeanGrey / DarkPhoenix | BlueGalaxyEnergy |

* * *

### 4.8 Quarkslab 2023–2024 新战线：从白盒密码到 Boot Chain

> 2022 年之后，Quarkslab 的攻击面从「白盒 AES」和「TEE Trustlet」进一步扩展到了 **整个 Android 安全栈** ——从启动链底层到数据加密上层。这两项新研究与 DRM 的关联比表面看起来更深：Boot Chain 攻击可以泄露 Keystore 密钥（DRM 私钥的存放地），而 FBE 攻击直接涉及 Gatekeeper TA（与 Widevine 运行在同一 TEE 中）。

#### 4.8.1 Android 数据加密深度研究（2023）

**博客原文** ： [Android Data Encryption in Depth](https://blog.quarkslab.com/android-data-encryption-in-depth.html) （Maxime Rossi Bellom & Damiano Melotti，2023-08-14）

**会议发表** ：REcon 2023 — [Dissecting the Modern Android Data Encryption Scheme](https://cfp.recon.cx/2023/talk/3NQUNN/)

**研究目标** ：评估 Android 文件级加密（FBE）在攻击者拥有高级软件漏洞时的抗性。

**两条攻击路径** ：

| 路径  | 目标机制 | 利用的漏洞 | 设备  | 结果  |
| --- | --- | --- | --- | --- |
| **路径 A** | Gatekeeper TA（TrustZone 内） | MediaTek SoC 漏洞 via MTKClient → patch TA 绕过凭据验证 | Samsung Galaxy A226B (MT6833V) | 提取加密材料 |
| **路径 B** | Weaver（Titan M 安全芯片） | CVE-2022-20233 → Titan M 代码执行 | Samsung Galaxy A225F (MT6769V) | 直接从芯片内存提取 Weaver 密钥 |

**与 DRM 的关联** ：路径 A 攻击的 Gatekeeper TA 和 Widevine L1 TA **运行在同一个 TEE 中** 。如果 Gatekeeper 可以被 patch（绕过凭据验证），同样的技术路径可以用来 patch Widevine TA——或者利用已获得的 TEE 执行权限直接读取 Widevine 的内存空间。

**关键结论** ：Android FBE 的设计是扎实的——即使攻破了 Gatekeeper/Weaver，攻击者仍然需要暴力破解用户密码（通过 scrypt 慢散列保护）。但对于 DRM 研究者来说，重要的启示是： **MediaTek SoC 的 bootrom 漏洞可以作为进入 TEE 的跳板** 。

#### 4.8.2 Samsung Galaxy A\* Boot Chain 攻击（2024）

**博客原文** ： [Attacking the Samsung Galaxy A\* Boot Chain](https://blog.quarkslab.com/attacking-the-samsung-galaxy-a-boot-chain.html) （Maxime Rossi Bellom & Raphaël Neveu，2024-10-15）

**会议发表** ： **Black Hat USA 2024** + SSTIC 2024

**四个 CVE 构成的攻击链** ：

这是你提到的 4 个 CVE 攻击。它们针对 Samsung Galaxy A225F（MediaTek SoC），从 USB 接口一路打到 Secure World 内存泄露：

| CVE | 组件  | 类型  | 利用方式 | 效果  |
| --- | --- | --- | --- | --- |
| **CVE-2024-20865** | Odin (USB 刷机协议) | 认证绕过 | GPT 分区可通过 USB 无认证写入 → 修改 PIT 表绕过签名验证 | 获得 bootloader 级别的代码注入能力 |
| **CVE-2024-20832** | Little Kernel (引导程序) | 堆溢出 | Samsung 自定义 JPEG 解析器未校验文件大小 → 堆溢出 → 代码执行 | 在 bootloader 中执行任意代码 |
| **CVE-2024-20820** | Secure Monitor (EL3) | 越界读取 | 特定 SMC handler 存在 OOB read | 泄露完整的 Secure Monitor 内存 |
| **CVE-2024-20021** | MediaTek TEE 驱动 | 任意物理内存映射 | 将任意物理地址映射到虚拟地址（限 8MB 连续） | **泄露 Secure World 全部内存** |

**攻击链总览** ：

```
USB 接口
   │  CVE-2024-20865: Odin 认证绕过 → 写入恶意分区
   ▼
Little Kernel (Bootloader)
   │  CVE-2024-20832: JPEG 解析堆溢出 → 代码执行
   ▼
Secure Monitor (EL3)
   │  CVE-2024-20820: OOB read → 泄露 Monitor 内存
   ▼
TEE 驱动 (内核)
   │  CVE-2024-20021: 任意物理内存映射
   ▼
Secure World 全部内存
   → Android Keystore 密钥泄露
   → 所有 TA 内存可读（包括 Widevine L1 TA）
```

**对 DRM 的直接影响** ：最终效果是「泄露任何来自 Secure World 内存的数据，包括 **Android Keystore 密钥** 」。Android Keystore 是 Widevine L1 设备私钥的存放位置——这意味着 Quarkslab 的 2024 攻击链从理论上可以直接提取 Widevine L1 的设备凭证，而不需要攻击 Widevine TA 本身。

**受影响范围** ：基于 MediaTek SoC 的 **大部分 Samsung 设备** 至少受一个 CVE 影响。Samsung 已推送补丁。

**PoC 代码** ：Quarkslab 在 GitHub 发布了四个 CVE 的概念验证代码。

**Quarkslab TEE 研究的演进脉络** ：

```
2019: Kinibi 逆向 (Galaxy S6–S9)
        │  手动逆向 → 3 个漏洞 → EL3 代码执行
        │
2023: Android FBE 研究 (Galaxy A22x)
        │  Gatekeeper TA 攻击 + Weaver 攻击
        │  重点: MediaTek bootrom 作为 TEE 入口
        │
2024: Boot Chain 攻击 (Galaxy A225F)  ★ 4 CVE
        │  USB → Bootloader → EL3 → Secure World 全内存
        │  重点: 不攻击 TA，从底层硬件接口绕过
        │
趋势: 从攻击 TA 本身 → 攻击 TA 运行的基础设施
```

> Quarkslab 的研究路径清晰地展示了一个趋势： **随着 TA 自身的加固越来越强（加密、签名、anti-rollback），攻击者开始转向攻击 TEE 的「地基」——bootloader、secure monitor、物理内存映射驱动** 。这与白盒密码学的演进逻辑完全一致：当白盒 AES 变得不可攻破时（第 3 代），攻击者转向攻击协议层或 TEE 层。

* * *

## 五、武器库全景

前面逐个介绍了 Quarkslab 的每项研究突破，但这些工具并不是散落的独立项目——它们构成了一个 **联动的攻击平台** ，设计上可以像 Unix 管道一样串接。下图按「收集 → 分析 → 恢复 → 辅助 → 靶场」五层功能来组织，帮助读者快速理解：当你要攻击一个白盒实现时，应该从哪个工具开始，数据流向何处，最终在哪里拿到密钥。

```
┌─────────────────────────────────────────────────────────────────┐
│                    SideChannelMarvels 武器库                      │
├─────────┬──────────────┬──────────────┬──────────────┬──────────┤
│ 收集层   │ 分析层        │ 恢复层        │ 工具层        │ 靶场     │
│         │              │              │              │          │
│ Tracer  │ Daredevil    │ JeanGrey     │ Stark        │ Deadpool │
│ (DBI    │ (CPA/DCA     │ (DFA → key)  │ (key sched   │ (白盒    │
│  trace) │  统计分析)    │  phoenixAES  │  反推)        │  实现集) │
│         │              │              │              │          │
│ QBDI    │ DarkPhoenix  │ BlueGalaxy   │ LIEF         │          │
│ (跨平台 │ (DFA+外部    │ Energy       │ (二进制      │          │
│  DBI)   │  编码)       │ (BGE 代数)   │  移植)       │          │
└─────────┴──────────────┴──────────────┴──────────────┴──────────┘
```

一个典型的攻击流水线是这样的：先用 **LIEF** 把 Android SO 迁移到 Linux → 用 **Tracer** (或 **QBDI**) 跑 2000 次收集内存 trace → 用 **Daredevil** 做 DCA 统计分析定位密钥相关地址 → 如果 DCA 失败则切 DFA 路线：修改查找表注入 fault → 用 **JeanGrey** 从密文对恢复第 10 轮密钥 → 用 **Stark** 反推原始密钥 → 完成。 **Deadpool** 则是上述全过程的练兵场，里面有十几个不同难度的白盒实现可供练手。

下表列出每个工具的仓库地址和基本信息，方便直接 clone 使用：

| 仓库  | Stars | 语言  | 首次发布 | 最近更新 |
| --- | --- | --- | --- | --- |
| [Deadpool](https://github.com/SideChannelMarvels/Deadpool) | 700+ | Python/C | 2016 | 持续  |
| [JeanGrey](https://github.com/SideChannelMarvels/JeanGrey) | —   | Python | 2016 | 持续  |
| [Daredevil](https://github.com/SideChannelMarvels/Daredevil) | —   | C++ | 2016 | 持续  |
| [Tracer](https://github.com/SideChannelMarvels/Tracer) | —   | C/Python | 2016 | 持续  |
| [Stark](https://github.com/SideChannelMarvels/Stark) | —   | C   | 2016 | 持续  |
| [DarkPhoenix](https://github.com/SideChannelMarvels/DarkPhoenix) | —   | Python | 2023-02 | 持续  |
| [BlueGalaxyEnergy](https://github.com/SideChannelMarvels/BlueGalaxyEnergy) | —   | Python | 2023-12 | 2024-02 (v2) |
| [QBDI](https://github.com/QBDI/QBDI) | 1500+ | C++ | 2017 | 持续  |
| [LIEF](https://github.com/lief-project/LIEF) | 4000+ | C++/Python/Rust | 2017 | 持续  |
| [Triton](https://github.com/JonathanSalwan/Triton) | 3000+ | C++/Python | 2015 | 持续  |
| [samsung-trustzone-research](https://github.com/quarkslab/samsung-trustzone-research) | —   | Python | 2019 | 2020 |

* * *

## 六、讨论与反思

### 6.1 Quarkslab 的方法论

回顾十年研究，Quarkslab 的工作有几个显著特征：

**1\. 理论先行，工具跟进** 。不是先写 exploit 再补论文，而是先在顶级密码学会议（CHES）发表理论突破，再围绕理论构建工程化工具。这让他们的工作既有学术引用价值，又有实际攻击效力。

**2\. 模块化、可组合的工具链** 。Tracer 收集 → Daredevil 分析 → JeanGrey 恢复 → Stark 反推——每个工具做且只做一件事，通过文件格式（trace 文件、密文对）松耦合。这与 Unix 哲学一脉相承。

**3\. 攻防同体** 。他们一边开源攻击工具（SideChannelMarvels），一边售卖白盒保护产品（QShield）。攻击工具是产品的 benchmark；产品的防护等级就是「自己的工具攻不破」。

### 6.2 QShield 深度拆解：Quarkslab 的「盾」长什么样

前面九成篇幅都在讲 Quarkslab 的「矛」——DCA/DFA/BGE 攻击工具和 TEE 漏洞利用。但理解他们的「盾」（ [QShield](https://www.quarkslab.com/software-protection-qshield/) ）同样重要：它揭示了 Quarkslab 认为 **什么样的防护能扛住自己的攻击** 。

#### QShield 的三层防护架构

QShield 不是单一工具，而是一个三层防护栈——分别保护 **代码** 、 **密钥** 和 **数据** 。对应了攻击者在逆向过程中需要突破的三个维度：

| 层   | 组件  | 保护目标 | 对抗的攻击 | 技术手段 |
| --- | --- | --- | --- | --- |
| **① 代码层** | Quarks App Protect | 应用逻辑 | 静态分析、反编译、调试 | 30+ 混淆 pass + RASP |
| **② 密钥层** | Quarks Keys Protect | 密码学密钥 | DCA、DFA、BGE、内存 dump | 白盒密码学 + device binding |
| **③ 数据层** | Quarks Digital Vault | 敏感数据（token、PII） | 文件系统提取、运行时 dump | 安全存储 + 远程监控 |

#### ① 代码层：30+ 混淆 pass

Quarks App Protect 提供了 **30 种以上** 的代码混淆变换，覆盖 C/C++/Java/Kotlin/ObjC/Swift，可以通过策略文件或内联注释精细控制每个函数的保护级别。核心混淆类别：

```
代码混淆 pass 分类:
┌─────────────────────────────────────────────────────────┐
│ 控制流变换                                                │
│  ├── 控制流平坦化 (CFF)    ← 与 OLLVM 同源但自研实现        │
│  ├── 虚假控制流 (BCF)      ← 插入不可达分支, 干扰反编译     │
│  └── 不透明谓词            ← 看似条件跳转, 实际恒真/恒假     │
│                                                         │
│ 数据变换                                                  │
│  ├── 字符串加密            ← 常量字符串运行时解密            │
│  ├── 常量替换              ← 立即数 → 运算表达式            │
│  └── 全局变量打散           ← 结构体拆分为散落的局部变量      │
│                                                         │
│ 指令变换                                                  │
│  ├── 指令替换              ← a+b → a-(-b), xor 变换等     │
│  ├── 指令合并/拆分          ← 改变指令粒度                  │
│  └── MBA (Mixed Boolean-Arithmetic) ← 算术+布尔混合表达式  │
│                                                         │
│ 运行时保护 (RASP)                                         │
│  ├── Root/Jailbreak 检测   ← su, Magisk, Cydia            │
│  ├── 调试器检测            ← ptrace, lldb, Frida          │
│  ├── 仿真器检测            ← QEMU, unidbg, BlueStacks     │
│  ├── Hook 框架检测          ← Frida, Xposed, Substrate    │
│  └── 代码完整性校验         ← .text 段运行时哈希比对         │
└─────────────────────────────────────────────────────────┘
```

**关键特性——构建多样性（Build Diversification）** ：每次编译使用不同的随机种子，确保 **每个发布版本的混淆结果都不同** 。这意味着攻击者对 v1.0 的逆向成果不能直接复用到 v1.1——即使源代码没有变化。

**与 OLLVM 的关系** ：QShield 的控制流平坦化与 OLLVM 的 CFF 概念类似，但 Quarkslab 有一个 OLLVM 没有的优势——他们知道 DCA/Triton 如何绕过 CFF（因为他们自己开源了绕过工具），所以 QShield 的 CFF 实现会刻意规避已知的自动化去混淆路径。

#### ② 密钥层：白盒密码学 + Device Binding

Quarks Keys Protect 是 QShield 的密码学核心。它提供白盒实现的标准密码算法（AES、RSA、ECC 等），但有几个关键的工程设计使其比普通白盒更难攻破：

**每客户唯一实现** ：

```
传统白盒:
  所有用户使用相同的白盒 AES 实现
  攻击者只需攻破一次 → 适用于所有用户

QShield Keys Protect:
  每个客户的白盒实现是独立生成的
  不同客户的 T-table 结构、编码方式、混淆层都不同
  攻击者必须对每个客户单独分析
```

**抗已知攻击** ：根据 Quarkslab 官方文档，QShield 的白盒实现经过定期审计，声称 **对已知的 DCA、DFA 和 BGE 攻击具有抵抗力** 。

这是一个值得深思的声明——因为 DCA/DFA/BGE 正是 Quarkslab 自己开源的攻击工具。这意味着他们的防护设计是在 **知道自己的攻击手段的前提下** 构建的。可能的抗性来源：

| 攻击  | 可能的防御手段 | 原理  |
| --- | --- | --- |
| DCA | 高阶 masking + 随机化中间值 | 单字节相关性被掩码消除 |
| DFA | fault detection + 冗余计算 | 每次执行两次，比对结果，不一致则拒绝输出 |
| BGE | 非标准 T-table 结构 + 编码打散 | BGE 依赖 T-table 的代数结构，打散后无法识别 |
| DCA + DFA | 密钥 blinding | 密钥与随机掩码异或后参与运算，裸密钥从不出现 |

**Device Binding** ：将白盒密钥与设备硬件特征绑定——即使攻击者提取了整个白盒实现的二进制，在另一台设备上也无法正确解密。绑定因子可能包括：CPU ID、IMEI hash、SoC fuse 值、TEE attestation token 等。

#### ③ 数据层：Quarks Digital Vault

保护运行时敏感数据（API token、session key、用户凭据），功能类似 Android Keystore 但在应用层实现，不依赖 TEE：

-   数据加密存储在应用沙箱内
-   密钥由 Keys Protect 的白盒加密保护
-   远程监控（Remote Monitoring）：实时上报设备的安全状态——是否被 root、是否被调试、是否被 hook

#### QShield 的应用场景

| 场景  | 客户类型 | QShield 保护的内容 | 对应的攻击威胁 |
| --- | --- | --- | --- |
| **移动支付** | 银行/支付 SDK | 交易签名密钥、PIN 加密 | 密钥提取 → 伪造交易 |
| **DRM** | 流媒体平台 | 内容解密密钥 (CEK)、License 处理 | 密钥提取 → 盗版 |
| **IoT 固件** | 工业设备 / 智能家居 | OTA 验证密钥、设备认证 | 固件逆向 → 伪造设备 |
| **AI 模型** | AI 厂商 | 模型权重加密、推理逻辑 | 模型窃取 |
| **游戏** | 手游厂商 | 反作弊逻辑、内购验证 | 外挂 / 免费内购 |
| **军事/国防** | 国防承包商 | 通信加密、指控系统 | 信号情报 |

**EMVCo 认证** （2021）：QShield 是全球 **第一个** 通过 EMVCo Software-Based Mobile Payment (SBMP) 认证的白盒密码学方案。EMVCo 是 Visa/Mastercard/UnionPay 等卡组织联合成立的技术标准体，SBMP 认证意味着 QShield 的白盒实现被认为足以保护手机端的银行卡交易——这是白盒密码学商业化的最高背书。

**与 STMicroelectronics 的合作** ：QShield 是 STM32 芯片的官方安全合作伙伴（ [ST Partner Page](https://www.st.com/en/partner-products-and-services/qshield.html) ），为 STM32 嵌入式设备提供源码级混淆和白盒加密。

#### 攻防闭环：SideChannelMarvels × QShield

这是 Quarkslab 最独特的商业模式——用同一批研究员维护的攻击工具来测试防护产品：

```
QShield 开发团队提交新版白盒实现
          │
          ▼
SideChannelMarvels 团队发起攻击:
  1. DCA (Daredevil): 收集 trace → 统计分析 → 检查是否有密钥泄露
  2. DFA (JeanGrey/DarkPhoenix): 注入 fault → 检查是否能恢复密钥
  3. BGE (BlueGalaxyEnergy): 提取 T-table → 检查代数攻击是否生效
  4. Collision (QBDI): 碰撞分析 → 检查输出编码是否被绕过
          │
          ▼
    攻击成功？
    ├── 是 → 打回修改，加强防护层
    └── 否 → 通过内部审计 → 提交 EMVCo 评估
```

> 这种「用自己的矛刺自己的盾」的模式，使 QShield 的安全基线天然高于不做攻击研究的白盒厂商（如纯学术背景的创业公司）。当然，这并不意味着 QShield 不可攻破——它意味着 **已知的公开攻击方法对它无效** ，但未知的零日攻击始终是悬在头上的达摩克利斯之剑。

### 6.3 连接笔者的 DRM 研究

| Quarkslab 工具/理论 | 笔者的实际使用 | 效果  |
| --- | --- | --- |
| JeanGrey/phoenixAES | Widevine L3 ROOT_KEY 提取 | ✅ 150 faults → 密钥恢复 |
| Stark/aes_keyschedule | Round key → 原始密钥反推 | ✅ 秒级完成 |
| DCA 理论 | 理解 Chrome CDM 白盒 AES 的不可提取性 | ✅ 帮助判断攻击方向 |
| LIEF 思路 | 启发 unidbg/Unicorn 仿真链路设计 | ✅ 跨平台执行白盒 |
| Samsung TZ 研究 | 理解 Widevine L1 信任模型的脆弱性 | ✅ 认知提升 |

### 6.4 白盒密码学的未来

Quarkslab 的十年工作实质上证明了一个 **悲观结论** ： **基于查找表的白盒 AES 在理论上不安全** 。无论是 DCA、DFA 还是 BGE，总有一种攻击可以恢复密钥。这正是笔者在 Chrome CDM 文章中观察到的：Google 的最新 CDM 已经 **放弃了经典查找表方案** ，转向了「密钥从不以可观测形式存在」的全新白盒设计。

这是一场攻防的代际跃迁：

| 白盒防护世代 | 典型代表 | 可用攻击 | Quarkslab 工具可攻破？ |
| --- | --- | --- | --- |
| **第 0 代** | 明文密钥 | 内存搜索 | 无需工具 |
| **第 1 代** | 经典 T-table | DCA, DFA, BGE | **✓ 全部** |
| **第 2 代** | T-table + 外部编码 | DCA△, DarkPhoenix, BGE v2 | **✓ 大部分** |
| **第 3 代** | 非标准白盒（密钥 blinding、无 T-table） | ?   | ✗ （DCA/DFA 信号消失） |

Chrome CDM 4.10.2934 属于第 3 代——笔者的 [13 次碰壁](https://overkazaf.github.io/blogs/posts/chrome-cdm-stream-dump-widevine-vtable-hook/) 从侧面佐证了这一判断。

* * *

## 七、技术路线全景图与可复用知识点

前面六章按时间顺序逐项展开了 Quarkslab 的研究，但读完之后一个自然的问题是： **这些碎片化的技术点之间有什么结构性联系？如果我要复用他们的方法论，应该怎么组织自己的知识体系？**

这一章试图回答这个问题。先用两张图建立全局视角，再逐一展开五条可复用的攻击范式。

### 7.1 技术路线全景图

下面这张五泳道图（Crypto / Tooling / TEE Exploit / Full Stack / Reusable）展示了 Quarkslab 十年间五条攻击向量的 **独立演进与最终汇聚** 。左侧四条泳道是研究历程，右侧「知识复用出口」泳道是可以直接迁移到你自己研究中的五个模块化能力：

![技术路线全景图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d22e094f881217fa.png) *五条攻击向量的演进与汇聚：白盒密码分析（绿）和二进制工具链（黄）在 2016–2018 年平行发展，2019 年汇入 TEE 攻击（红），2023–2024 年进一步扩展到 Android 全栈（紫）。最右侧的「可复用出口」是每条路线沉淀下来的、可以直接用于你自己研究的模块化能力。注意这些向量并非替代关系——2024 年的 Boot Chain 攻击依赖 2017 年的 LIEF/QBDI 做前期分析，而 2023 年的 DarkPhoenix 依赖 2016 年的 DFA 理论。十年积累是叠加的，不是替换的。*

### 7.2 可复用知识点矩阵

如果说上图回答了「Quarkslab 做了什么」，下面这张思维导图则回答了「 **你能从中拿走什么** 」。每个叶子节点都标注了输入（你需要准备什么）、产出（你能得到什么）、适用场景和对应工具——可以当作一张「攻击菜单」来用：

![可复用知识点矩阵](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/32a024fab189edd5.png) *五大攻击范式的知识树：从白盒密码分析（3 种攻击方法）到跨平台迁移（2 种方案）、TEE TA 逆向（3 个 TEE 平台）、Boot Chain 攻击（3 层入口）、自动化漏洞发现（GPCheck 静态分析）。每个末端节点都是一个可以独立使用的「技能模块」。*

### 7.3 五条可复用攻击范式详解

下面逐一展开这五条范式。对每条范式，笔者回答三个问题： **它解决什么问题？它从 Quarkslab 的哪些研究中提炼而来？你怎么在自己的项目中复用它？**

#### 范式一：白盒密码分析（DCA / DFA / BGE 三板斧）

**解决什么问题** ：从受保护的白盒 AES 实现中提取密钥。

**提炼自** ：CHES 2016 DCA → DFA blog 2016 → DarkPhoenix 2023 → BGE v2 2024

**复用方式** ：面对一个白盒 AES 目标时，按以下决策流选择工具：

```
目标可以执行吗？
├── 是 → 能注入 fault 吗？
│   ├── 是 → 有外部编码吗？
│   │   ├── 是 → DarkPhoenix (100万+ faults)
│   │   └── 否 → JeanGrey/phoenixAES (8-200 faults) ← 最快路径
│   └── 否 → DCA (Tracer + Daredevil, 2000 traces)
│       └── DCA 失败(输出编码) → Collision attack (QBDI)
└── 否 → 能读取查找表数据吗？
    ├── 是 → BGE (BlueGalaxyEnergy, 毫秒级)
    └── 否 → 需要先解决执行/提取问题（见范式二）
```

**你的收获** ：这棵决策树不是 Quarkslab 直接画的——它是笔者从他们十年间发布的不同工具的适用条件中 **反向推导** 出来的。实际操作中，笔者在 Widevine L3 研究中走的是「是 → 是 → 否 → JeanGrey」这条路径，150 个 fault 秒级出密钥。

#### 范式二：跨平台二进制迁移（LIEF + 仿真器）

**解决什么问题** ：把目标代码从「只能在真机上跑」搬到「本地可控环境中跑」，为范式一创造前提条件。

**提炼自** ：LIEF 2017 → LIEF×SCM 2018 → QBDI 2017/2020

**复用方式** ：

| 目标依赖复杂度 | 方案  | 时间成本 | 适用  |
| --- | --- | --- | --- |
| 纯算法（无 JNI、无系统调用） | LIEF 修改 SO → Linux 直接执行 | 小时级 | CTF 白盒、独立加密库 |
| 中等（有 JNI，少量系统调用） | unidbg/Unicorn 仿真 + JNI 桩 | 天级  | Widevine CDM、抖音 MetaSec |
| 复杂（依赖 Android framework） | Frida attach 真机 + QBDI 插桩 | 天级  | 需要完整运行环境的目标 |
| 极复杂（TEE 内执行） | 提取 TA → Unicorn 仿真 TEE 环境 | 周级  | Widevine L1 TA、Keymaster |

**你的收获** ：笔者在抖音六神研究中用 unidbg 仿真 `libmetasec_ml.so` ，在 Widevine 研究中用 Unicorn 仿真白盒 AES 函数—— **本质上都是范式二的应用** 。关键不是选哪个仿真器，而是理解「把目标搬到可控环境 → 注入 fault / 收集 trace → 范式一攻击」这条链路。

#### 范式三：TEE Trusted Application 逆向

**解决什么问题** ：理解 Secure World 中 TA 的内部逻辑——command handler、密钥存储、权限检查。

**提炼自** ：Samsung TrustZone Part 1-3（2019-2020）→ Android FBE（2023，Gatekeeper TA）

**复用方式** ：

```bash
1. 获取 TA 二进制
   Samsung Kinibi: /vendor/app/mcRegistry/*.tlbin (MCLF 格式)
   Qualcomm QSEE: /vendor/firmware_mnt/*.mbn (签名 ELF)
   OP-TEE:        /lib/optee_armtz/*.ta (标准 ELF)

2. 反编译
   Kinibi:  Ghidra + Quarkslab MCLF loader
   QSEE:    IDA + QSEE 脚本（处理签名头）
   OP-TEE:  标准 ELF，Ghidra/IDA 直接加载

3. 定位攻击面
   入口: TA_InvokeCommandEntryPoint → switch(commandID)
   每个 case 是一个 command handler
   检查: params[i] 的 paramTypes 校验是否遗漏
   
4. 仿真 + Fuzz
   Unicorn 加载 TA → hook SMC → 桩 TEE API
   AFL×Unicorn 变异 command 输入 → 找 crash
```

**你的收获** ：这套范式的核心洞察来自 Quarkslab 和 GlobalConfusion 的共同发现—— **TA 的攻击面是 `TA_InvokeCommandEntryPoint` 函数中的 command handler，漏洞通常出在 `paramTypes` 缺少类型检查** 。知道了这一点，即使没有 GPCheck，你也可以手动审计 TA 的反编译代码。

#### 范式四：Boot Chain 攻击（从硬件接口到 Secure World）

**解决什么问题** ：当 TA 本身没有软件漏洞时，从更底层（bootloader / secure monitor）突破进入 TEE。

**提炼自** ：Boot Chain 4 CVE（2024）

**复用方式** ：

| 攻击层 | 入口点 | 典型漏洞类型 | 工具  |
| --- | --- | --- | --- |
| **bootrom** | USB（MTKClient / EDL） | 已知 bootrom 漏洞（芯片级） | MTKClient, edl.py |
| **bootloader** | 刷机协议（Odin / fastboot） | 解析器漏洞（JPEG/PNG/PIT）、认证绕过 | 自定义 USB 工具 |
| **secure monitor** | SMC 调用 | OOB read/write、整数溢出 | Fuzzer + SMC wrapper |
| **TEE 驱动** | /dev/tz_device 等 | mmap 越权、ioctl 缺陷 | 内核模块 + PoC |

**你的收获** ：Quarkslab 2024 年的研究证明了一个关键路径—— **USB → Odin 绕过 → bootloader 代码执行 → EL3 内存泄露 → Secure World 全部内存可读** 。这条链路的每一环都可以独立复用：即使你不追求 Secure World 泄露，单独的 bootloader 代码执行就足以 dump 出 Android Keystore 密钥。

#### 范式五：自动化 TA 漏洞发现（GPCheck 模式）

**解决什么问题** ：从「手动审计一个 TA」升级到「批量扫描数千个 TA」。

**提炼自** ：GlobalConfusion（USENIX Security 2024，与 Quarkslab 方法论的融合）

**复用方式** ：

```python
# GPCheck 核心思路（伪代码）
def check_ta(ta_binary):
    # 1. 反编译为 IR（Ghidra P-code 或 Binary Ninja BNIL）
    ir = decompile(ta_binary)
    
    # 2. 定位 TA_InvokeCommandEntryPoint
    entry = find_function(ir, "TA_InvokeCommandEntryPoint")
    
    # 3. 污点分析：params[] 是 source，memcpy/指针解引用是 sink
    taints = taint_propagate(
        source=entry.params["params"],
        sink_patterns=["memcpy", "*(type_cast)params[i]"]
    )
    
    # 4. 检查 paramTypes 校验是否存在于 source → sink 路径上
    for path in taints:
        if not has_type_check(path, "TEE_PARAM_TYPE_GET"):
            report_vulnerability(path)  # type-confusion!
```

**你的收获** ：即使你不实现完整的 GPCheck，这个思路也可以简化为一个 Ghidra 脚本——在 `TA_InvokeCommandEntryPoint` 中搜索 `params[i].memref.buffer` 的使用，检查前面是否有 `paramTypes` 比较。GlobalConfusion 论文表明， **23% 的 GP-compliant TA 遗漏了这个检查** 。

### 7.4 五条范式的协同关系

这五条范式不是孤立的选择题，而是一个 **工具箱** ——真正的攻击通常需要组合使用：

```
实际攻击中的范式组合示例:

场景 A: 攻破 Widevine L3 白盒 AES
  范式② (unidbg 仿真 SO) → 范式① (DFA 提取密钥)

场景 B: 从 Samsung Galaxy A 设备泄露 Widevine L1 私钥
  范式④ (Boot Chain 4 CVE → Secure World 内存) → 直接读取

场景 C: 批量检测某厂商 TEE 中所有 TA 的漏洞
  范式③ (提取 TA 二进制) → 范式⑤ (GPCheck 批量扫描)

场景 D: 攻破未知白盒 AES + 解密 DRM 内容
  范式② (LIEF 迁移) → 范式① (先 DCA 定位, 再 DFA 提取)
  → 如果 DCA/DFA 均失败 → 范式③/④ (转向 TEE 层面突破)
```

> **核心原则** ：当某一层的防护变得太强时，不要在同一层面加大力度—— **切换到另一层面** 。白盒打不穿就打 TEE，TEE 打不穿就打 Boot Chain。这就是 Quarkslab 十年研究路径的本质逻辑，也是笔者在 Chrome CDM 文章中从「13 次密钥提取失败」转向「流捕获」的同一思路。

* * *

## 八、相关工作综述

### 8.1 完整时间线

| 年份  | 事件  | 类型  | 来源  |
| --- | --- | --- | --- |
| 2002 | Dusart/Letourneux/Vivolo 提出 DFA on AES | 理论  | 学术论文 |
| 2004 | Billet/Gilbert/Ech-Chatbi 提出 BGE 攻击 | 理论  | 学术论文 |
| 2011 | Quarkslab 成立（Fred Raynal） | 里程碑 | —   |
| 2014 | Kocher 等提出基于 trace 的侧信道分析 | 理论  | 学术论文 |
| 2015 | Triton DSE 框架发布（SSTIC 2015） | 工具  | [GitHub](https://github.com/JonathanSalwan/Triton) |
| **2016.08** | **DCA 论文获 CHES 2016 最佳论文** | **理论** | [Springer](https://link.springer.com/chapter/10.1007/978-3-662-53140-2_11) |
| 2016.08 | SideChannelMarvels 组织成立，Deadpool/JeanGrey/Daredevil/Stark/Tracer 发布 | 工具  | [GitHub](https://github.com/SideChannelMarvels) |
| 2016.12 | DFA on White-Box AES 博客发布 | 博客  | [Quarkslab](https://blog.quarkslab.com/differential-fault-analysis-on-white-box-aes-implementations.html) |
| 2017.04 | LIEF v1 发布 | 工具  | [GitHub](https://github.com/lief-project/LIEF) |
| 2017 | QBDI v1 发布 | 工具  | [GitHub](https://github.com/QBDI/QBDI) |
| 2018.05 | LIEF × SideChannelMarvels 集成博客 | 博客  | [Quarkslab](https://blog.quarkslab.com/when-sidechannelmarvels-meet-lief.html) |
| **2019.01** | **David Buchanan 用 DFA 破解 Widevine L3** （直接受益于 Quarkslab 工具链） | 实战  | [Media](https://sudonull.com/post/232829) |
| **2019.08** | **Black Hat USA — Breaking Samsung’s ARM TrustZone** | 实战  | [YouTube](https://www.youtube.com/watch?v=uXH5LJGRwXI) |
| 2019.10 | Journal of Cryptology — Grey-Box Attacks 论文 | 论文  | [Springer](https://link.springer.com/article/10.1007/s00145-019-09315-1) |
| 2019.12 | Samsung TrustZone Part 1-2 博客 | 博客  | [Quarkslab](https://blog.quarkslab.com/a-deep-dive-into-samsungs-trustzone-part-1.html) |
| 2020.02-06 | Samsung 推送 TrustZone CVE 补丁 | 补丁  | Samsung Security Updates |
| 2020.07 | Samsung TrustZone Part 3（漏洞详情）博客 | 博客  | [Quarkslab](https://blog.quarkslab.com/a-deep-dive-into-samsungs-trustzone-part-3.html) |
| 2020.08 | QBDI 碰撞攻击博客 | 博客  | [Quarkslab](https://blog.quarkslab.com/introduction-to-whiteboxes-and-collision-based-attacks-with-qbdi.html) |
| **2023.02** | **DarkPhoenix 发布** （DFA + 外部编码） | 工具  | [GitHub](https://github.com/SideChannelMarvels/DarkPhoenix) |
| **2023.12** | **BlueGalaxyEnergy v1 发布** （首个开源 BGE） | 工具  | [GitHub](https://github.com/SideChannelMarvels/BlueGalaxyEnergy) |
| **2024.02** | **BlueGalaxyEnergy v2** （解密 + shuffled states） | 工具  | [Quarkslab](https://blog.quarkslab.com/bge-attack-on-aes-white-boxes-extending-blue-galaxy-energy-for-decryption-and-shuffled-states.html) |

### 8.2 借鉴与独立贡献

| 来源  | 笔者借鉴的内容 | 本文的独立贡献 |
| --- | --- | --- |
| Quarkslab 全部公开博客和论文 | 时间线、技术原理、工具功能 | 将分散的博客/论文/GitHub 仓库整合为面向 DRM 研究者的单一叙事 |
| 笔者前两篇 Widevine 文章 | 实战经验与工具验证 | 建立 Quarkslab 工具链 → DRM 攻击的因果映射 |
| Neodyme Widevine L3 博客 | David Buchanan 的 DFA 实战参考 | 定位 Quarkslab 为 DFA 工具链上游 |
| Wikipedia/学术论文 | 基础密码学概念 | —   |

* * *

### 8.3 业界科研团队横向对比

Quarkslab 并非孤军作战。全球有十余支团队在白盒密码学 / DRM 安全 / TEE 攻防的不同维度上展开研究。下表从 **攻击侧** 和 **防御侧** 两个阵营，对比他们的定位、代表作、强项与 Quarkslab 的交集。

#### 攻击侧团队

| 团队  | 国家  | 核心方向 | 代表作 | 与 Quarkslab 的关系 |
| --- | --- | --- | --- | --- |
| ![Quarkslab](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/875776a4d7f57991.bin) **Quarkslab** | 🇫🇷 法国 | 白盒密码分析 + TEE 逆向 + 开源工具链 | CHES 2016 DCA、SideChannelMarvels、Samsung TrustZone EL3 exploit | — (本文主角) |
| ![Neodyme](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/13d65532ff73f4dd.bin) **Neodyme** | 🇩🇪 德国 | 漏洞研究 + DRM 实战 + 仿真 | Widevine L3 DFA 实战（Qiling 仿真）; Hack.lu 2025 “Revisiting Widevine L3” | **直接使用** Quarkslab 的 DFA 理论和 phoenixAES 工具 |
| ![Project Zero](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1a677c457a8dbfc6.bin) **Google Project Zero** | 🇺🇸 美国 | 漏洞研究 + 0-day | Gal Beniamini 2017: [Trust Issues — Exploiting TrustZone TEEs](https://projectzero.google/2017/07/trust-issues-exploiting-trustzone-tees.html) （首次公开 Widevine TA 漏洞利用 + QSEE/Kinibi 攻击） | **互补** ：Project Zero 侧重 0-day 发现，Quarkslab 侧重系统性逆向和工具化 |
| ![360](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ed4771a55fb5570f.bin) **360 Alpha Lab** | 🇨🇳 中国 | TEE 漏洞挖掘 + DRM 实战 | Qi Zhao: [Wideshears — Breaking Widevine on QTEE](https://www.youtube.com/watch?v=0oWFJq6tLe4) （Black Hat Asia 2021）— 首次公开 Qualcomm QTEE 上 Widevine L1 TA 的完整利用链 | **平行路线** ：360 攻 Qualcomm QTEE，Quarkslab 攻 Trustonic Kinibi；两支团队覆盖了 Android TEE 的两大主流实现 |
| ![Synacktiv](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a32f3652d1a981f6.bin) **Synacktiv** | 🇫🇷 法国 | 渗透 + TEE + 移动安全 | [Kinibi TEE: Trusted Application Exploitation](https://www.synacktiv.com/en/publications/kinibi-tee-trusted-application-exploitation) （Samsung TA 新漏洞） | **同赛道竞争** ：同样攻 Kinibi/Samsung TrustZone；Quarkslab 更早（2019），Synacktiv 补充了后续补丁绕过 |
| ![David Buchanan](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/45058cc595b7f800.bin) **David Buchanan** （个人） | 🇬🇧 英国 | DRM 破解 + 逆向 | 2019 年 1 月首次用 DFA 攻破 Widevine L3 白盒 AES（ [报道](https://sudonull.com/post/232829) ），引发 Google 补丁 | **直接受益于** Quarkslab 的 DFA 博客和 JeanGrey 工具；他的工作促使 Google 升级白盒实现 |
| ![EPFL HexHive](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9e1f4177e5037a92.bin) **EPFL HexHive** | 🇨🇭 瑞士 | TEE 漏洞自动化发现 + 静态分析 | [GlobalConfusion](https://www.usenix.org/conference/usenixsecurity24/presentation/busch-globalconfusion) （USENIX Security 2024）— 扫描 14,777 TA，发现 14 个 0-day，获 4 CVE | **规模化升级** ：Quarkslab 做深度（手动逆向 → EL3），HexHive 做广度（自动化扫描 → 批量 0-day）；两者联合说明 TEE 安全既有深度漏洞也有系统性设计缺陷 |
| ![Meituan](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5f12e1600ec12825.bin) **美团安全团队** | 🇨🇳 中国 | iOS 逆向 + DRM | [Research on Fairplay DRM and Obfuscation Realization](https://segmentfault.com/a/1190000041023774/en) — Apple FairPlay DRM 混淆分析 | **独立赛道** ：专注 Apple 生态，与 Quarkslab（主攻 Android/Linux）互不重叠 |

#### 学术 / 理论侧团队

| 团队  | 国家  | 核心方向 | 代表作 | 与 Quarkslab 的关系 |
| --- | --- | --- | --- | --- |
| ![NXP](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7fcfac9f7844082d.bin) **NXP + TU/e** | 🇳🇱 荷兰 | 白盒密码学理论 | Wil Michiels: DCA 论文合著者（CHES 2016）; Grey-Box Attacks (J.Cryptol 2019); [On the Security Goals of WBC](https://tches.iacr.org/index.php/TCHES/article/view/8554) (TCHES 2020) | **深度合作** ：DCA 论文 = Quarkslab × NXP 联合成果；Michiels 是白盒理论的学术支柱 |
| ![CryptoExperts](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4a6b5b0c5891741b.bin) **CryptoExperts** | 🇫🇷 法国 | 白盒密码学 + 竞赛组织 | 组织 [WhibOx Contest](https://whibox.io/) （2017/2019/2021/2024）— 白盒攻防的「DEFCON CTF」; Louis Goubin, Pascal Paillier, Matthieu Rivain | **生态共建** ：WhibOx 提供了 Quarkslab 工具的标准化测试靶场；攻击者用 SideChannelMarvels 工具破解 WhibOx 提交 |

#### 防御侧团队

| 团队  | 国家  | 核心方向 | 代表作 | 与 Quarkslab 的关系 |
| --- | --- | --- | --- | --- |
| ![Irdeto](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/958d09979b95c043.bin) **Irdeto (Cloakware)** | 🇳🇱🇨🇦 荷兰/加拿大 | 白盒密码商业防护 | 2002 年发明商业白盒 AES ([Chow et al.](https://link.springer.com/chapter/10.1007/978-3-540-44993-5_1))；收购 Philips 白盒专利组合； [ActiveCloak for Media](https://irdeto.com/cloakware-software-protection/) | **对立面** ：Irdeto 是白盒密码学的「发明者 + 第一大商业玩家」；Quarkslab 的攻击工具本质上是在持续检验 Irdeto 式防护的有效性 |
| ![Quarkslab QShield](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5592b246a62f1e20.bin) **Quarkslab QShield** | 🇫🇷 法国 | 白盒保护 + 代码混淆 | [QShield](https://www.quarkslab.com/white-box-cryptography/) — 面向 STM32 嵌入式设备的白盒保护方案（EMVCo 认证） | **自己的另一面** ：用 SideChannelMarvels 攻击工具做产品的安全基线测试 |
| ![Riscure](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ab4cb7ff1912545a.bin) **Riscure** | 🇳🇱 荷兰 | 硬件侧信道 + DRM 评估 | Black Hat 2009: Side Channel Analysis training；DRM 安全评估（付费电视、DRM SDK 认证） | **上游理论** ：DCA 的灵感来源于硬件 DPA——Riscure 是硬件 DPA 商业工具的主要供应商 |

#### 核心洞察

从对比中可以看出几个格局性的事实：

**1\. Quarkslab 的独特定位是「工具化 × 开源 × 跨栈」** 。Project Zero 找 0-day 但不做工具化；360 Alpha Lab 做实战但不开源；NXP/CryptoExperts 做理论但不落地到实战。只有 Quarkslab 在三个维度上同时发力——这也是为什么他们的工具链被全球研究者广泛使用。

**2\. TEE 攻击形成了「三极格局」** ：

```
Qualcomm QSEE
├── Google Project Zero (Beniamini, 2017) — 首次攻破
└── 360 Alpha Lab (Qi Zhao, 2021) — Widevine L1 TA 利用

Trustonic Kinibi (Samsung)
├── Quarkslab (2019) — 系统性逆向 + EL3 利用
└── Synacktiv (持续) — 补丁绕过

OP-TEE / 其他
└── 学术界零星研究
```

**3\. 白盒攻防的「矛盾同源」** 。Irdeto 发明了白盒密码学，Quarkslab（间接继承 NXP 的理论资源）开发了破解工具，而 Quarkslab 自己又用这些工具来测试自己的 QShield 产品。整个生态形成了闭环： **防护方案的安全性 = 自己的攻击工具攻不破它** 。

**4\. 中国团队在 TEE 实战上有独特优势** 。360 Alpha Lab 的 Wideshears 是迄今唯一公开的 Qualcomm QTEE Widevine L1 完整利用链。美团在 FairPlay 方向也有独立产出。国内安全社区在移动 DRM 领域的能力不容忽视。

#### 如果你想进入这个领域

不同团队的研究风格决定了不同的学习路径：

| 你的兴趣 | 对标团队 | 入手方向 |
| --- | --- | --- |
| 白盒密码分析 + 工具开发 | Quarkslab | 本文 §九 的 Level 0→5 路径 |
| TEE 漏洞挖掘 + 0-day | Project Zero / 360 Alpha Lab | 从 Beniamini 2017 博客开始 → QEMU 仿真 TA → fuzz |
| DRM 协议分析 + 实战破解 | Neodyme / David Buchanan | 从 Widevine L3 DFA（笔者的 [第一篇](https://overkazaf.github.io/blogs/posts/widevine-l3-keybox-mass-production/) ）开始 |
| 白盒理论研究 + 新方案设计 | NXP + CryptoExperts | 从 WhibOx Contest 参赛开始（每届 CHES 配套） |
| 硬件侧信道 + 芯片安全 | Riscure | 买一块 ChipWhisperer → 做 CPA → 迁移到软件 DCA |

* * *

## 九、演讲视频资源

为方便读者深入学习，笔者整理了 Quarkslab 公开的全部核心演讲视频：

| 演讲  | 会议  | 年份  | 链接  |
| --- | --- | --- | --- |
| Differential Computation Analysis: Hiding Your White-Box Designs is Not Enough | CHES 2016 | 2016 | [YouTube](https://www.youtube.com/watch?v=Zuhapyo7qFQ) |
| Breaking Samsung’s ARM TrustZone | Black Hat USA 2019 | 2019 | [YouTube](https://www.youtube.com/watch?v=uXH5LJGRwXI) |
| Unboxing The White-Box: Practical Attacks Against Obfuscated Ciphers | 安全会议 | 2019 | [YouTube](https://www.youtube.com/watch?v=A9md7ONv7tI) |
| White Box Unboxing 1/4: Understanding the Execution Flow | 教程系列 | 2020 | [YouTube](https://www.youtube.com/watch?v=84Pp9CBjgd8) |
| White Box Unboxing 4/4: Software Side-Channel Attack on AES | 教程系列 | 2020 | [YouTube](https://www.youtube.com/watch?v=7KS3XHP35QY) |

> 笔者建议的观看顺序：先看 CHES 2016 理解 DCA 理论，再看 White Box Unboxing 系列理解实操，最后看 Black Hat 2019 理解 TEE 攻击如何将白盒破译延伸到硬件隔离边界之外。

* * *

## 十、进阶推荐

如果你读到这里，想法不只是「了解」Quarkslab 的工作，而是 **复刻他们的研究能力** ——以下是笔者整理的一条从「能用工具」到「能造工具」的进阶路径。不是学院派的课程表，而是从实战反推出来的技能树。

### Level 0 → 1：能跑通 Deadpool 里的示例

**你需要掌握的** ：

-   Linux 开发环境（gcc / make / Python 3）
-   AES 基础：S-box、MixColumns、轮密钥加，不需要自己实现，但需要理解每一步做了什么
-   能编译 Tracer/Daredevil，能跑通 `wbs_aes_ches2016` 的完整 DCA 攻击

**具体动作** ：

1.  花 2 小时读完 [NIST FIPS 197](https://csrc.nist.gov/publications/detail/fips/197/final) （AES 标准），只看 §5 算法描述
2.  克隆 Deadpool，按 README 跑一遍 DCA（§4.1 的命令）
3.  克隆 JeanGrey，用 Deadpool 里的 DFA 示例跑一遍密钥恢复
4.  **验证步** ：自己写一个最简单的白盒 AES（用查找表实现，不做任何混淆），用 Deadpool 攻击它。如果能恢复密钥 → Level 1 达成

**预计时间** ：1 个周末

### Level 1 → 2：能攻击真实的白盒实现

**你需要掌握的** ：

-   unidbg 或 Unicorn 仿真框架（笔者推荐 unidbg，Java 生态，Android SO 支持好）
-   LIEF 库的基本用法（解析 ELF、修改依赖、导出符号）
-   Frida 基础（hook native 函数、读写内存）
-   如何识别 AES T-table 在二进制中的位置（特征：256 × 4 字节的只读数据段，共 4 组）

**具体动作** ：

1.  找一个开源的白盒 AES 实现（推荐 [WhibOx Contest](https://whibox-contest.github.io/) 的历届提交，难度分级明确）
2.  用 LIEF 把它从编译目标平台迁移到你的 Linux 环境
3.  用 Tracer 收集 trace → Daredevil 做 DCA → 如果失败（输出编码干扰）→ 切 DFA
4.  如果目标有 JNI 依赖，用 unidbg 搭建仿真环境，在仿真器中注入 fault
5.  **验证步** ：成功从一个非 Deadpool 内置的白盒中提取密钥 → Level 2 达成

**预计时间** ：2–3 个周末

### Level 2 → 3：能对付带保护的白盒

**你需要掌握的** ：

-   OLLVM 去混淆（控制流平坦化、虚假控制流、指令替换）
-   Triton DSE（符号执行定位条件分支、约束求解）
-   DarkPhoenix（处理外部编码）
-   BlueGalaxyEnergy（处理 shuffled states）
-   TraceGraph 或自己写的 trace 可视化工具（笔者在 Widevine 文章中详述了 scatter plot 方法论）

**具体动作** ：

1.  在 unidbg 里跑通一个 OLLVM 保护的白盒（先用 Frida attach，定位入口/出口地址）
2.  收集 fault → DarkPhoenix 分析（处理外部编码）
3.  如果目标是静态查找表 → BlueGalaxyEnergy 代数攻击（不需要执行目标）
4.  写一个 trace 可视化脚本（matplotlib scatter plot，x=指令偏移，y=内存地址，color=值），人眼识别 AES 轮次结构
5.  **验证步** ：攻破一个商业级 DRM 的白盒模块（L3 级别）→ Level 3 达成

**预计时间** ：1–2 个月

### Level 3 → 4：能攻击 TEE 级目标

**你需要掌握的** ：

-   ARM 架构（AArch64 指令集、异常等级 EL0–EL3、TrustZone 基本概念）
-   Ghidra/IDA 逆向（能看懂反编译输出，能写分析脚本）
-   AFL/libFuzzer 变异策略（Quarkslab 用 AFL×Unicorn fuzzing Trustlet）
-   TEE TA 格式（Samsung Kinibi 的 MCLF、Qualcomm QSEE 的 ELF、OP-TEE 的标准格式）

**具体动作** ：

1.  读完 Quarkslab Samsung TrustZone 三篇博客，用他们的 [开源工具](https://github.com/quarkslab/samsung-trustzone-research) 复现对旧 Galaxy 固件的分析
2.  用他们的 Ghidra MCLF loader 加载一个 Samsung Trustlet
3.  用 Unicorn 仿真一个简单 TA（输入 → 处理 → 输出），在仿真器中 fuzz
4.  阅读 [Wideshears（360 Alpha Lab, Black Hat Asia 2021）](https://i.blackhat.com/asia-21/Thursday-Handouts/as-21-Zhao-Wideshears-Investigating-And-Breaking-Widevine-On-QTEE.pdf) 了解 QTEE 上 Widevine L1 TA 的攻击面
5.  **验证步** ：在仿真器中找到一个 TA 的 crash（不一定可利用）→ Level 4 达成

**预计时间** ：3–6 个月

### Level 4 → 5：能造新工具

**标志** ：你开始觉得现有工具不够用了。DarkPhoenix 的 fault 数量太大？BlueGalaxyEnergy 对某种编码不适用？DCA 对你的目标噪声太高？

**这个阶段没有固定路径** 。但 Quarkslab 的研究员在到达这个阶段时，做了这些事：

-   Philippe Teuwen 阅读了所有已发表的白盒攻击论文（他维护了一份 [bibliography](https://github.com/doegox/bibliography) ），找到了 BGE 论文从未被开源实现的空白
-   Charles Hubain 意识到 DPA 的统计方法可以直接移植到软件 trace 上，而学术界此前只关注硬件
-   Romain Thomas 发现现有 ELF 解析库都不支持修改，于是从零造了 LIEF

笔者的经验是： **工具创新来自于实战中的「最后一公里」问题** ——当你反复手动做同一件事的时候，就是该把它自动化的时候。

### 阅读清单（按优先级排序）

| 优先级 | 材料  | 预计时间 | 收益  |
| --- | --- | --- | --- |
| P0  | [DFA blog (2016)](https://blog.quarkslab.com/differential-fault-analysis-on-white-box-aes-implementations.html) | 1h  | 理解 DFA 全流程 |
| P0  | [CHES 2016 DCA video](https://www.youtube.com/watch?v=Zuhapyo7qFQ) | 30min | 理解 DCA 理论 |
| P0  | Deadpool repo README + 跑一个示例 | 2h  | 动手验证 |
| P1  | [LIEF × SCM blog (2018)](https://blog.quarkslab.com/when-sidechannelmarvels-meet-lief.html) | 1h  | 理解跨平台迁移 |
| P1  | [QBDI collision blog (2020)](https://blog.quarkslab.com/introduction-to-whiteboxes-and-collision-based-attacks-with-qbdi.html) | 1.5h | 理解碰撞攻击 |
| P1  | [Black Hat 2019 TrustZone video](https://www.youtube.com/watch?v=uXH5LJGRwXI) | 40min | 理解 TEE 攻击面 |
| P2  | [DarkPhoenix blog (2023)](https://blog.quarkslab.com/dark-phoenix-a-new-white-box-cryptanalysis-open-source-tool.html) | 1.5h | 理解外部编码破解 |
| P2  | [BGE blog (2023)](https://blog.quarkslab.com/blue-galaxy-energy-a-new-white-box-cryptanalysis-open-source-tool.html) | 2h  | 理解代数攻击 |
| P2  | Samsung TZ Part 1-3 系列 | 3h  | 完整 TEE 逆向方法论 |
| P3  | [Grey-Box Attacks (J.Cryptol 2019)](https://link.springer.com/article/10.1007/s00145-019-09315-1) | 4h  | 学术深度，中间态攻击模型 |
| P3  | [Wideshears (BH Asia 2021)](https://i.blackhat.com/asia-21/Thursday-Handouts/as-21-Zhao-Wideshears-Investigating-And-Breaking-Widevine-On-QTEE-wp.pdf) | 2h  | Widevine L1 TA 真实攻击面 |

* * *

## 十一、结论

Quarkslab 对白盒密码学和 DRM 安全的贡献可以归纳为 **四个递进层次** ：

1.  **理论层** ：DCA（CHES 2016 最佳论文）证明了软件白盒实现可以像硬件芯片一样被侧信道攻击，且 **不需要了解实现细节** ——这是白盒密码学安全性假设的根本性动摇
2.  **工具层** ：SideChannelMarvels 组织将 DCA/DFA/CPA/BGE 从论文变成了 `pip install` 可用的攻击工具链，将白盒攻击的门槛从「密码学博士」降到了「会写 Python 的安全工程师」
3.  **实战层** ：Samsung TrustZone 攻击链证明了即使把密码学操作放进 TEE，也无法绝对安全——TEE 本身的实现缺陷会成为新的攻击面
4.  **演进层** ：DarkPhoenix 和 BlueGalaxyEnergy 把攻击能力推进到带外部编码和 shuffled states 的新一代白盒—— **每当防护者发明一种新的混淆手段，Quarkslab 就开源一个对应的破解工具**

这种「攻防螺旋上升」的模式，既是 Quarkslab 商业模式的核心（用攻击验证防护），也是整个白盒密码学领域发展的缩影。

最后留一个开放性问题供读者思考：

> 当第 3 代白盒（密钥 blinding、无 T-table）让 DCA/DFA/BGE 全部失效时，下一代攻击范式会是什么？ **符号执行** 、 **机器学习辅助侧信道** 、还是 **绕过白盒直接攻击协议层** （正如笔者在 Chrome CDM 文章中被迫做的那样）？
> 
> 也许答案不在密码学里，而在系统设计里——就像 Quarkslab 最终选择攻击 TrustZone 而不是攻击 Widevine L1 的白盒 AES。
> 
> **维度的选择比力度的加大更重要。**

* * *

*本文参考的所有 Quarkslab 博客、论文、GitHub 仓库和演讲视频均为公开可访问资源。全部 URL 已嵌入正文供读者自行验证。*
