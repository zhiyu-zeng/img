---
title: 【微信】逆向工程：HyperGuard 在 ntoskrnl 中监控了什么
source: https://mp.weixin.qq.com/s/mJ1LkTfyA-EQ8-hbX-73ww
source_host: mp.weixin.qq.com
clip_date: 2026-07-31T11:01:37+08:00
trace_id: eedfd4ab-5fd6-427b-bc27-fcda95416e7f
content_hash: 5eb40772dd4e00bb69b3b4ebd192661def0df94b8719faea75e2c8eb53724f92
status: synced
tags:
  - 微信
  - Windows逆向
  - 内核
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: HyperGuard 在 VTL1 安全内核中监控 ntoskrnl 的关键内存区域和函数指针，以此抵御 Infinity Hook 等攻击，弥补传统 PatchGuard 的同级对抗缺陷。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3ae75244-d011-814f-b07d-fd4a58d1aadc
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> HyperGuard 在 VTL1 安全内核中监控 ntoskrnl 的关键内存区域和函数指针，以此抵御 Infinity Hook 等攻击，弥补传统 PatchGuard 的同级对抗缺陷。
> 
> - **保护范围：** HyperGuard 将 ntoskrnl 划分为 5 个连续保护区，涵盖镜像头、只读数据（.rdata）、异常处理表（.pdata）、全部 .text 代码段（最大 0x4E9000 字节），以及 POOLCODE、TRACESUP、KVASCODE 等特殊节。
> - **系统调用完整性监控：** 直接监控 `KeServiceDescriptorTable`、`KeServiceDescriptorTableFilter` 等高层指针，实际的 SSDT 表因位于受保护的 .rdata 节内而间接得到保护。
> - **Infinity Hook 防御：** 监控 `PsAltSystemCallHandlers`、`HalDispatchTable+0x8`、`EtwpGetHostPerfCounter+7` 等函数指针，防止攻击者通过修改 HAL/ETW 回调实现系统调用挂钩。
> - **Hypercall 桩保护：** 跟踪 `HvcallCodeVa`、`HvlpHypercallCodeVa` 等地址，阻止篡改通往 Hypervisor 的调用入口，防止 hypervisor 级挂钩。
> - **调试发现：** 通过 Windbg 遍历 `SkpgContext` 中的 `SKPG_EXTENT` 记录，结合 `ln` 与 Ida 手动解析，确认上述受保护地址及 Alt Syscalls 在 25H2 中已转向 HVCI 的 SLAT 保护。

**securitainment** *2026年7月31日 10:50*

| 原文链接 | 作者  |
| --- | --- |
| https://fluxsec.red/what-does-hyperguard-skpg-monitor-vtl1-windows-internals-secure-kernel-patch-guard | fluxsec |

让 HyperGuard 措手不及

\---

## 引言

我之前简要讨论过将代码加载到 `VTL1` （Virtual Trust Level 1，虚拟信任级别 1）中。这是 Windows VBS 使用的更高特权虚拟信任级别，承载着安全内核和隔离的用户态组件，这些组件的内存可以受到保护，免受常规 VTL0 内核的影响。

虚拟信任级别在互联网上已有深入讲解，安全内核也已被多位研究者讨论（1、2、3、4，等等..）。

HyperGuard，又称安全内核补丁保护（Secure Kernel Patch Guard），通过将选定的完整性检查和强制执行移入更高特权的 VTL1 安全内核，来补充传统的 PatchGuard。PatchGuard 对许多人来说无需赘述，但简而言之，微软引入它是为了保护某些敏感的内核结构、函数等，以防止 rootkit 修改它们。不幸的是，这种方法存在一个缺陷——如果你与对手运行在同一特权级别，他们在欺骗你方面拥有的控制力，与你保护系统免受其侵害的控制力一样大。

后来，基于虚拟化的安全（VBS）出现了，它利用 Hyper-V hypervisor 引入了两个信任级别： `VTL0` （常规信任级别）和 `VTL1` （安全信任级别）。我不会自称是 hypervisor 方面的专家，事实上，探索它们正是我自身学习旅程的一部分。那里的技术 **非常** 酷。

关键在于， `VTL0` 代码不能直接触碰 `VTL1` 中的内容，必须通过预定义的 secure-call/hypercall 接口来进行。

因为运行在 `VTL0` 的代码，即便是 rootkit，也无法触碰 `VTL1` 中的函数，微软引入了 SKPG / HyperGuard，从一个受保护的安全堡垒中扫描内存，以做出权威判定——rootkit 是否篡改了操作系统中涉及安全与完整性的关键部分。

撰写本文的动机有三：

1.  我想更深入地研究安全内核，并调试它
    
2.  我对 Alt Syscalls 感到好奇——我之前在此讨论过，它与 SKPG 的关系又是如何。继续阅读便知分晓！
    
3.  我好奇 SKPG 实际上在 `ntoskrnl` 中监控了什么，与常规 Patch Guard 有何不同？
    

## 调试安全内核

安全内核与常规内核一样，是一个可执行文件——它主要存在于 `securekernel.exe` 中，还有少量 DLL 依赖。该镜像在启动时被加载到 `VTL1` 中，随后 HyperGuard 被初始化。我还没有（亲自）逆向分析初始化过程，不过 Yarden Shafir 有一个出色的博客系列专门讨论这个话题，你可以在这里找到。

由于安全内核运行在 `VTL1` 中，我们无法用常规设置来调试它。为此，我使用了：

-   Hyper-V 虚拟机客户机——运行 Windows Server 2022。这是 **调试器机器** ，我在上面运行工具。从这个客户机，我通过 Hyper-V 透传在其中运行第二个虚拟机：
    
-   Windows 11 企业版，这是 **我们要调试的虚拟机** ，运行 25H2 版本。
    

我现在不打算详细讲述设置过程，将留到后续博客文章中再讲。

## 检查 HyperGuard

`securekernel!SkpgContext` 是一个在运行时被大量使用的符号：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e6e81befdc5a9a4d.png)

这是一个指向 SKPG 运行时状态对象的全局指针，它是一个在堆上分配的状态块，由 `securekernel!SkpgConnect` 在 HyperGuard 激活时构建，供回调/运行时代码查询使用。我们可以看到这个标签持有一个地址。在本文中，我们只关注 HyperGuard 在 `NTOSKRNL` 中保护了什么。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/82c73385fb7d8565.png)

`SkpgContext` 指向一个在 `SkpgConnect` 期间分配的动态大小运行时上下文。该上下文包含全局 `SKPG` 状态，后跟一个 `SKPG_EXTENT` 记录数组。在这篇博客中，Yarden 解释了 `context` 结构体用于所有 SKPG 检查。它们包括：

-   Hash（受保护区域的哈希值）
    
-   Base（受保护对象的基地址）
    
-   Size（保护覆盖的字节数）
    
-   Type & flags（类型与标志）
    

因此，我们大致了解了布局，知道了它在运行时的位置，而且我的调试器已正确附加，所以我们可以开始 dump 内存并编写脚本来遍历它了！

首先，我们需要知道 NTOSKRNL 的地址起止范围，这可以通过 `lm m nt` 获取：

现在我们可以过滤落在该范围内的任何地址，并使用 `logopen` 将输出写入文件，以便更容易地逐条查看：

```powershell
r @$t0 = poi(securekernel!SkpgContext); r @$t1 = dwo(@$t0+0x28); r @$t2 = @$t0+dwo(@$t0+0x2c); .for (r @$t3=0; @$t3<@$t1; r @$t3=@$t3+1) { r @$t4=@$t2+@$t3*0x30; r @$t5=poi(@$t4+0x8); .if (@$t5 >= fffff802`a8a00000) { .if (@$t5 < fffff802`a9e4f000) { .printf "\n[%04x] type=%04x flags=%04x size=%08x base=%p end=%p hash=%p\n", @$t3, wo(@$t4), wo(@$t4+0x2), dwo(@$t4+0x4), @$t5, @$t5+dwo(@$t4+0x4)-1, poi(@$t4+0x10); ln @$t5; } } }
```

我们在其中添加了 `ln` ，它有助于解析一些符号，但并非全部——少数需要在 Ida 中手动调查。

## 总体发现

我开始逐条手动检查与 `ntoskrnl` 虚拟地址空间匹配的条目，然而，绝大多数是单页（0x1000） `SKPG_EXTENT` 条目的连续区域；我推测这样组织是为了更快地进行哈希计算，同时也更容易确定哪个页面发生了意外修改。

简而言之， `ntoskrnl` 中受连续监控的区域可以归结为（地址已转换为 Ida 基址，而非真实虚拟地址基址）：

-   range_0 = 0x140000000 - 0x14016BFFF
    
-   range_1 = 0x140200000 - 0x1406E8FFF
    
-   range_2 = 0x140B62000 - 0x140B64FFF
    
-   range_3 = 0x140BA7000 - 0x140BA8FFF
    
-   range_4 = 0x140BAA000 - 0x140BC9FFF
    

### Range 0

这一区域从 `NTOSKRNL` 的基地址开始，你可以在这里看到：

它还连续覆盖了镜像基址、镜像头、`.rdata` 、`.pdata` 、两个 `.idata` 映射以及 `PROTDATA` 的第一个页面。

该区域保护 `0x16C000` 字节。

### Range 1

这一区域保护 `ntoskrnl` 内的可执行代码，从 `_tlgWriteTemplate` 开始，一直延伸到 `.text` 节的末尾，如下所示：

该区域保护 `0x4E9000` 字节，是最大的连续保护范围。

### Range 2

这一区域保护一个较小的区域，共 `0x3000` 字节，即 `POOLCODE` 节。

其中包含的一些函数有：

-   `ExAllocatePoolWithTag`
-   `ExAllocatePool3`
-   `ExpPoolTypeToPoolFlags`
-   `ExpPoolFlagsToPoolType`
-   `ExFreePoolWithTag`

等等..

### Range 3

这一区域包含 `TRACESUP` 节，更多可执行代码。该区域保护 `0x2000` 字节。

包含的函数如：

-   `KiTpCompletion`
-   `KiTpWriteRegisterValue`
-   `KiTpSignExtendOperandValue`
-   `KiTpSetImmediateOperandSize`
-   `RtlpIcSetFlagsZeroSignParity`
-   `KiTpSetFlagsSub`
-   等等
    

这些不是我熟悉的函数。

### Range 4

更多可执行代码，这次起始位于 `KVASCODE` 节并延伸到 `INITKDBG` 节，不是我所熟悉的内容。

包含的函数如：

-   `KiDivideErrorFaultShadow`
-   `RtlMinimalBarrier`
-   `RtlInitMinimalBarrier`
-   `KiTimerDispatch`
-   `KeGuardCheckICall`
-   `KeGuardDispatchICall`
-   `KiMceLinkage`
-   `KiMceThunk`
-   `FsRtlUninitializeSmallMcb`
-   `RtlLookupFunctionEntryEx`
-   `KiAccessPage`
-   `KiErrata704Present`
-   等等等等
    

### 扫描式保护总结

对于这些单页保护范围，可以合理地得出结论：它保护的是早期镜像区域和可执行代码，`.pdata` 用于防止攻击者修改 unwind 信息，`.rdata` 用于保护内核只读值的完整性，等等。

## 特定发现

在这些大型连续保护条目之上，我们还有若干个被特别监控的地址（从研究角度来看更有趣）。我将先列出全部地址的清单，然后探索一些引起我注意的有趣条目。我尽量按相关功能进行了分组。

### 系统调用完整性

-   `KeServiceDescriptorTable`
-   `KeServiceDescriptorTable+0x20`
-   `KeServiceDescriptorTableFilter`
-   `KeServiceDescriptorTableShadow`

### 系统调用挂钩

-   `PsAltSystemCallHandlers`
    
    （咳咳）
    
-   `HalDispatchTable+0x8`
-   `PspPicoProviderRoutines`
-   `HalPerformEndOfInterruptAtController`
-   `HalpProfileInterface`
-   `HalpProfileFeatures`
-   `EtwpGetHostPerfCounter+7`
-   `MmUserProbeAddress`
-   `MmBadPointer`

### 杂项

-   `InitSafeBootMode`
-   `RtlpUnwindHistoryTable`
-   `PsInvertedFunctionTable+0x10`
-   `xref to global in MmQueryApiSetSchema`
-   `KiDebugTraps`
-   `MmSystemRangeStart`
-   `MmHighestUserAddress`
-   `HvcallCodeVa`
-   `PsWin32NullCallBack`
-   `PspSystemMitigationOptions`
-   `KdpBootedNodebug`
-   `KiDynamicTraceEnabled`
-   `KiDynamicTraceCallouts`
-   `HvlpHypercallCodeVa`
-   `HvlpVsmVtlCallVa`
-   `MaxDataSize`
    
    （通过 Ida 解析，在 windbg 中无法解析，位于名字奇特的 `ALMOSTRO` 节中，almost read-only？差不多只读？:D:D）
    
-   `xref in nt!KiSwInterruptDispatch`
    
    （未标注符号）
    

### Alt Syscalls

看到 Alt Syscalls 出现在列表中，着实令人高兴！我之前逆向分析过 Windows 11 上 Alt Syscalls 的变更，当时我还不太确定 HVCI 如何与它们交互。多亏了我的朋友 Xacone，他发现我的新技术中使用的地址受 HVCI 保护，这意味着当 HVCI 启用时，它阻止你写入 `PspServiceDescriptorGroupTable` ——然而，微软在这里保护的是 `PsAltSystemCallHandlers` ，这是旧（25H2 之前）用于 Alt Syscalls 的地址；因此我的推测是：

使用 `PspServiceDescriptorGroupTable` 的旧技术， **我怀疑** 已被回溯移植了保护（即我们这里讨论的这个）（或者也许它早就存在了），通过 `securekernel.exe` 中的 HyperGuard 来监控该地址是否被篡改..而新技术则通过 HVCI 来保护，这确实很巧妙！ *干得漂亮，微软* ！

如果我没记错的话，我在这里看不到 HyperGuard 为 Alt Syscalls（25H2）保护的任何回调，所以 SLAT 保护应该已经足够了，但这绝对是一个值得进一步研究的领域，既然我们现在能在 HyperGuard 中看到它。我想我会花些时间逆向分析 `securekernel.exe` 中的 Alt Syscalls，看看能发现什么！上次我研究时，你可以注册一个驱动程序成为 Alt Syscall 提供者，但这需要微软的某种形式的认证（超出常规驱动认证之上），而且无法通过 Vsl 调用安全内核来禁用完整性检查等以完成注册。具体细节我记不清了，但安全内核侧确实运行着某种代码完整性检查。

### 系统调用表

不出所料，NT 系统服务分发表（SSDT）受 HyperGuard 保护，首先是表的高层指针：

-   `KeServiceDescriptorTable`
-   `KeServiceDescriptorTable+0x20`
-   `KeServiceDescriptorTableFilter`

我还没有研究 `win32k!W32pServiceTable` 是否受保护。

眼尖的读者可能注意到 SSDT 表 **本身** 并不在列表中，这是设计使然，因为实际的表位于我们上面发现的受保护 `.rdata` 节内，所以它们已被 HyperGuard 妥善保护：

### Infinity Hook 相关

我们还可以看到一些与 Infinity Hook 相关的函数——一个例子是 `nt!EtwpGetHostPerfCounter` 内部的回调，实际上在虚拟地址 `0xfffff802a9800c20` 处有一个 HyperGuard **SKPG_EXTENT** 目标，我在 Ida 中应用了几次偏移计算后，得到了一个未标注的符号： `off_140E00C20` ，它在 `EtwpGetHostPerfCounter` 中有一个交叉引用。该地址在我的实时镜像中存储的值为：

```
kd> dqs fffff802a9800c20
fffff802`a9800c20  fffff802`a8f38eb0 nt!HalpTimerQueryHostPerformanceCounter
```

我们可以看到它在 `EtwpGetHostPerfCounter` 中的相关性：

覆盖此指针可能允许攻击者将代码执行重定向到自己的回调，从而实现内核系统调用挂钩。

我们上面的列表中还有一些其他被监控的地址，它们在某种程度上也交织在 **Infinity Hook** 式的系统调用挂钩中，所以我 *认为* 这就是他们从 `VTL1` 保护该攻击面的实现方式（那些与 `Hal` 等相关的地址）。仅个人观点^^。

最初的 Infinity Hook 实现使用的是 `GetCpuClock` ，后来被封堵，随后演变为 HAL 计时回调成为后继攻击面。因此 SKPG 的保护与针对 **InfinityHook** 类型攻击的加固是一致的。也许这些保护还有其他我不知道的原因，如果你知道其他利用这些机制的酷方法，请告诉我！

### Hv 系列

最后，还有一些与 `Hv*` 函数相关的被监控地址，这些函数涉及内核需要发起 Hyper-V hypercall 时使用的 hypercall 桩。如果这些地址被篡改，攻击者可能将间接通过被篡改的 hypercall 指针的调用点重定向到任意代码。所以，这与系统调用挂钩确实类似。Hypervisor 挂钩不是我有经验的领域，但我很乐意了解更多。在这里，你可以看到被监控的 `HvcallCodeVa` 的交叉引用：

`HvcallCodeVa` 在我的实时快照中为 `zero` 。因为一些调用点间接通过它，这些路径必须要么被门控，要么仅在特定配置下初始化，要么被另一个 hypercall 指针取代，例如 `HvlpHypercallCodeVa` 。

## 疑问

因此，关于 HyperGuard 的内部机制，我还有一些想在运行时尝试验证的问题：

1.  当我们写入受 HyperGuard 保护的内容时会发生什么？每个受保护的地址是否都需要一个门控来询问"HVCI 是否启用？"，然后如果你想修改它，修改操作是否在安全内核中进行？实际上，这样它就可以重新计算哈希？
    
2.  我们能否通过伪装成合法调用者来有效篡改受 HyperGuard 保护的内容？这需要大量工作来试图混淆 `securekernel` 中的某些函数，这只是我写文章时的一个假设性想法。我确信这个边界非常安全，但尝试一下也无妨！
    

## 结语

这是一次探索 HyperGuard 并尝试记录它所监控内容的小型远征，同时也对能够读取 `securekernel` 内部的调试器进行了常规使用。我想回过头来继续研究 Alt Syscalls，看看是否有什么变化，特别是它如何与 `securekernel` 关联。

如果这里有任何不准确之处，请联系我以便我修正——这篇博客是我学习过程的反映，并非旨在学术上严谨。希望你喜欢这次阅读 <3.

下次再见，拜拜 xo.

\---

Research · 目录
