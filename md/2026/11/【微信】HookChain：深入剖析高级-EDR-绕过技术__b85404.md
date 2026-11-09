---
title: 【微信】HookChain：深入剖析高级 EDR 绕过技术
source: https://mp.weixin.qq.com/s/BxTK9it52oJw3EfaoPv8KQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T11:02:37+08:00
trace_id: 66217b87-cd4b-440e-8b3f-deb60928142d
content_hash: 9fb1272265e6942d1ecc9f2526b208125c6daa2d8cf3af1b97e20bfcac816e92
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 41375244-d011-81a6-b501-d379d05e5859
ioc: null
---

**红队工坊** *2026年11月9日 09:48*

> 原文标题： HookChain: A Deep Dive into Advanced EDR Bypass Techniques

**HookChain** 是一种新技术，思路是利用 Windows 底层 API，并操纵系统调用与用户态 Hook 的交互方式，来绕过端点检测与响应（EDR，Endpoint Detection and Response）方案。为了更好理解 HookChain 的工作原理，我们用真实案例深入技术细节。

## ■函数 Hook 与 EDR 监控的机制

现代 EDR 方案通常在 `NTDLL.DLL` 这一层监控 Windows API 调用，因为这个 DLL 是用户态应用程序与内核之间的桥梁。举例来说，当应用程序需要分配内存时，它会调用 `NtAllocateVirtualMemory` ，而 EDR 可以 Hook 这个函数来监控或阻断恶意行为。

### 示例：传统 EDR 的 Hook 方式

在典型的 EDR 监控环境中，会发生以下过程：

1\. 恶意软件样本尝试通过调用 `NtAllocateVirtualMemory` 分配内存。

2\. EDR 已经 Hook 了 `NTDLL.DLL` 中的 `NtAllocateVirtualMemory` 。这个 Hook 拦截函数调用，并把它转交给 EDR 检查。

3\. 如果 EDR 发现可疑行为，它可以阻断该函数调用，或允许调用但施加限制。

4\. 之后函数继续进入内核，并返回结果。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1e29264af56c977c.png) \[1\]

image

而 **HookChain** 会操纵这条调用流程，从而打破它。

## ■HookChain 实战：绕过 Hook

在 HookChain 中，攻击者不会直接调用被 EDR 监控的 `NtAllocateVirtualMemory` 。他们改用 **间接系统调用** （indirect syscall）和 **动态 SSN 映射** 来绕过被 Hook 的 API，从而规避检测。

### 第一步：SSN（系统服务号）映射

Windows 中的每个系统调用都有一个关联的系统服务号（SSN，System Service Number），用于在系统服务分发表（SSDT）中标识该调用。HookChain 会动态地映射这些 SSN。

举例来说：

• `NtAllocateVirtualMemory` 有一个对应的 SSN（这里假设是 `0x18` ）。

• HookChain 不直接调用该 API，而是映射这个 SSN，并查出真正的内核函数地址。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cf3377c50d98f5c0.png) \[2\]

image

### 第二步：使用间接系统调用

在这个阶段，HookChain 通过 **Halo's Gate** 或其他技术，在 `NTDLL` 中找到未被 Hook 的邻近函数，从而跳过已被 Hook 的 `NTDLL` 函数。

#### 示例：Halo's Gate

假设攻击者想绕过已被 EDR Hook 的 `NtAllocateVirtualMemory` 。HookChain 会这样做：

1\. **逐字节扫描检测 Hook**：读取 `NtAllocateVirtualMemory` 的前 32 个字节，判断它是否被 Hook。如果原始指令序列（ `mov r10, rcx; mov eax, SSN` ）被改动，就认为该函数已被 Hook。

2\. **搜索邻近函数**：HookChain 在 `NTDLL` 中寻找一个相邻且未被 Hook 的函数，比如 `NtQueryInformationProcess` 。找到之后，它计算从 `NtAllocateVirtualMemory` 到这个未 Hook 函数的相对距离，并借助该邻近函数的地址间接发起系统调用。

3\. **执行系统调用**：现在攻击者可以通过这个未被 Hook 的邻近函数执行系统调用，彻底绕过 EDR。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/caf262799eca35ee.png) \[3\]

image

### 第三步：修改 IAT（导入地址表）

HookChain 的核心策略之一，是修改 `kernel32.dll` 、 `kernelbase.dll` 等关键 DLL 的 **导入地址表** （IAT，Import Address Table）。IAT 存放着导入函数的指针，通过覆写这些指针，HookChain 确保 API 调用绕过 EDR 的 Hook。

#### 示例：IAT Hook

1\. **识别目标 DLL**：假设攻击者知道目标应用程序通过 `kernel32.dll` 发起 `ReadFile` 或 `WriteFile` 这类系统调用，而这些调用最终会调用 `NTDLL` 中的函数（例如 `NtReadFile` 和 `NtWriteFile` ）。

2\. **Hook IAT**：HookChain 修改 `kernel32.dll` 中 `ReadFile` 的 IAT 条目，使其指向 HookChain 自己的处理器，而不是原函数。这个处理器随后对原始的 `NTDLL` 函数发起间接系统调用（绕过 EDR）。

3\. **执行攻击**：应用程序继续调用 `ReadFile` ，完全不知道自己的 IAT 条目已被 Hook。被 Hook 的 IAT 条目把函数重定向到 HookChain 的处理器，从而确保系统调用执行时不会被 EDR 拦截。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4c77fa2d733069b7.png) \[4\]

image

## ■HookChain 执行流程技术拆解

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/25da39a3d372d655.jpg) \[5\]

image

我们走一个具体的攻击场景：

1\. **植入 HookChain**：

• 攻击者首先把必要的 DLL 加载进进程空间（例如 `kernel32.dll` 和 `ntdll.dll` ）。

• HookChain 通过读取 `NTDLL` 内的函数字节来检查是否被 Hook，从而发现任何 EDR Hook。

• 它使用动态映射，为 `NtAllocateVirtualMemory` 这类关键系统调用映射 SSN。

2\. **构建 SYSCALL_LIST**：HookChain 构建一个数组 **SYSCALL_LIST**，其中每个条目包含：

• 每个关键函数对应的 SSN（系统服务号）。

• `NTDLL` 中对应函数的虚拟地址。

• 用于间接系统调用的 SYSCALL 指令地址。

3\. **通过 IAT 重定向**：一旦 IAT 中的函数指针被 Hook，HookChain 就确保之后所有对 `ReadFile` 、 `VirtualAlloc` 这类关键 API 的调用都被重定向到它自己的处理器。该处理器保证系统调用以间接方式执行，不再经过原本被 Hook 的 `NTDLL` 函数。

4\. **透明的执行流**：HookChain 植入生效之后，EDR 看到的是一条正常的执行流。举例来说：

• 一次函数调用看起来就像照常从 `kernel32.dll` 走到了 `ntdll.dll` 。

• 但实际上，HookChain 拦截了这次调用，绕过了 `NTDLL` Hook，并通过一个相邻的未 Hook 函数执行了系统调用。

按照这些步骤，我们成功实现了 shellcode 注入。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/11d976587971e9cd.jpg) \[6\]

image

## ■真实环境测试

**以下是我们使用 HookChain 技术的 shellcode 注入器跑出的结果**

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2dd59cb103e47b25.jpg) \[7\]

image

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3daa0609dc36aa05.jpg) \[8\]

image

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/946495bac6e90763.jpg) \[9\]

image

## ■真实案例研究：Lazarus 组织与 HookChain 类技术

像 **Lazarus 组织** 这样的高级持续性威胁（APT）组织，已知使用过与 HookChain 有相似之处的技术。在 2021 年的一次攻击中，Lazarus 使用其恶意软件工具包的某个变种，通过直接系统调用绕过了内核态与用户态的 EDR 监控。

HookChain 在此基础上更进一步，利用 **动态系统调用映射** 和 **邻近函数调用** 来规避检测。 **在部署了 CrowdStrike 或 SentinelOne 等 EDR 产品的环境中** HookChain 绕开 NTDLL Hook 的能力已被证明能有效逃避检测，让攻击者可以不受干扰地执行其操作。

## ■进阶绕过机制：HookChain 与 SysWhispers 对比

**SysWhispers** 是另一种旨在通过直接调用系统调用来绕过被 Hook 的 Windows API 的技术。但 HookChain 的不同之处在于 **动态 SSN 映射** 和 **邻近函数重定向**，这让它在多个函数同时被 Hook、或系统调用号在不同 Windows 版本间发生变化的场景下适应性更强。

SysWhispers 依赖预定义的系统调用号和静态系统调用桩，而 HookChain 会实时动态调整策略。因此，当 EDR 监控多个 API 或 Hook 内核态函数时，HookChain 更具韧性。

## ■EDR 与 HookChain 的未来

随着 **HookChain** 被越来越多的威胁行为者采用，EDR 方案也必须演进。一个很有前景的发展方向是 **基于虚拟机监控器（hypervisor）的监控**，它可以在系统调用抵达操作系统内核之前就拦截并分析它们。 **人工智能（AI） **和** 机器学习** 模型也将变得至关重要，因为它们能学习基于细微异常来识别可疑的系统调用行为 —— 这些异常是静态检测方法会漏掉的。

此外， **行为驱动的系统调用分析** 可能成为关键防御手段，让 EDR 不仅能跟踪系统调用，还能理解其上下文与流程。这会让 HookChain 这类技术在逃避检测时不引起警觉变得困难得多。

## ■对 EDR 方案的挑战

EDR 系统通常依赖放在 NTDLL 这类用户态 API 中的 Hook 来监控和阻断恶意活动。然而许多 EDR 对 NTDLL 的监控并不够全面，使得某些 Hook 容易被 HookChain 这类绕过技术攻破。 **在被分析的 EDR 方案中，94% 没有在 NTDLL 之上的子系统层设置 Hook**。

这留下了一个攻击者可以利用的巨大缺口。

![EDRs](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/176e97d05ab427de.png) \[10\]

EDRs

**注**：出自 Helvio Carvalho Junior 的论文。

## ■结语：军备竞赛仍在继续

HookChain 是 **EDR 规避** 的下一次演进，展示了攻击者如何持续创新新手法，绕过即便最精密的防御。随着组织对高级安全方案的依赖日益加深，领先于这些新兴技术的需求从未如此迫切。防守方必须把 **内核态监控**、 **行为分析** 和持续的威胁情报结合起来，才能在这场不断变化的战场上保持领先。

归根结底，网络安全是一场猫鼠游戏。当防守方适应了 HookChain 这类技术，攻击者无疑会想出更具创意的方法来达成目标。

## ■参考文献

\[Helvio Carvalho Junior. 2024. HookChain\] https://arxiv.org/abs/2404.16856：我在这项奠基性工作上做了扩展，添加了更多实现和改进，以增强该研究提出的方法。 \[11\]

**注**：本工作建立在 \[Helvio Carvalho Junior. 2024. HookChain\] https://arxiv.org/abs/2404.16856 \[12\] 所提出的基础概念之上，同时引入了若干改进和额外实现来增强原始方法。这些改进包括：

• **增强的 Hook 规避技术**：在导入地址表（IAT）操纵和间接系统调用之外继续扩展，我们探索了更多针对内核态检查的规避战术 —— 那是某些 EDR 方案潜在的盲点。

• **用替代方法动态解析被 Hook 的函数**：在利用 Halo's Gate 的同时，我们还引入了额外的 SSN（系统服务号）解析方法，例如自定义哈希和 Heaven's Gate，以进一步降低被检测的可能。

• **进阶的 DLL 加载机制**：引入交错或随机化加载技术以避开基于行为的检测，通过时机与变化来增强规避能力。

• **API 层混淆增强**：在间接系统调用之上，本工作包含多层混淆，例如参数加密，为对抗函数调用监控提供额外的韧性。

• **实时 Hook 校验与恢复**：包含一种机制，可实时周期性校验并恢复未被 Hook 的地址，使方案能够适应运行时的 EDR 监控。

• **扩展的注入技术**：在 IAT Hook 之外，本工作探索了进程镂空（process hollowing）、DLL 镂空（DLL hollowing）和反射式 DLL 注入等方法，把原始研究扩展到更广的规避技术范围。

这些扩展体现了突破初始方法局限的追求，使该技术在面对不断演进的端点检测策略时更加稳健、更具韧性。

**如果你对网络安全、红队攻防技术充满热情，渴望学习更多实战技巧，例如渗透测试、自动化脚本编写、免杀技术等， 欢迎关注我的公众号**

**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d1378fc15719cfc5.jpg)

在这里，我会持续分享更多高质量的技术文章，与你一同探索网络安全的奥秘，提升实战技能！ 让我们一起在队攻防的道路上，不断精进，突破边界！**

免杀 · 目录
