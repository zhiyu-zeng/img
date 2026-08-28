---
title: 【看雪】Intel SDM 第 3C 卷全文中文翻译：VMX 虚拟化 SMM SEAM Intel PT 处理器追踪
source: https://bbs.kanxue.com/thread-292798.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-28T15:13:56+08:00
trace_id: 29a4a083-2f49-4bc3-881e-20c13a9d9610
content_hash: c9150bf8a9c0808a0983cc42eaeb036c8d2f42b6df37bb640444587e0cc26f35
status: summarized
tags:
  - 看雪
  - VMX
  - Intel PT
series: null
feed_source: 看雪·逆向工程
ai_summary: VMX 通过 VMX 根/非根两种操作模式实现硬件虚拟化，由 VMCS 数据结构管理 VM 进入/退出，并支持 EPT、VPID、APIC 虚拟化、Intel PT 追踪等扩展机制。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: null
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> VMX 通过 VMX 根/非根两种操作模式实现硬件虚拟化，由 VMCS 数据结构管理 VM 进入/退出，并支持 EPT、VPID、APIC 虚拟化、Intel PT 追踪等扩展机制。
> 
> - **VMX 生命周期：** 软件通过 VMXON 进入 VMX 操作，VMM 以 VMLAUNCH/VMRESUME 实现 VM 进入，VM 退出将控制转回 VMM，最终用 VMXOFF 退出；CR4.VMXE 与 IA32_FEATURE_CONTROL MSR 锁定位控制启用条件。
> - **VMCS 组织：** VMCS 区域含修订标识符、VMX 中止指示符和实现特定的 VMCS 数据；数据分客户状态、宿主状态、VM 执行控制、VM 退出控制、VM 进入控制、VM 退出信息六组；VMPTRLD/VMCLEAR/VMREAD/VMWRITE 用于管理。
> - **执行控制关键项：** 基于引脚的控制器管理外部中断/NMI/抢占定时器；基于处理器的控制器含 HLT/INVLPG/MWAIT/RDTSC/CR3/IO/MSR 位图等退出条件；二级控制启用 EPT、VPID、unrestricted guest、VMCS shadowing、虚拟中断交付等。
> - **内存虚拟化：** EPTP 指向 EPT 分页结构，支持内存类型、页遍历长度、访问/脏位、子页写权限（SPPTP）；PML 页修改日志记录脏页；VPID 关联线性地址转换缓存。
> - **Intel PT 与 VMX 结合：** IA32_VMX_MISC[14] 控制 PT 是否可用于 VMX；系统级追踪保留 VMX 控制默认值并输出 PIP/TIP/CFE 等数据包区分 VM 转换，仅访客追踪则通过 VMCS 控制切换 IA32_RTIT_CTL.TraceEn；PT 触发器追踪支持性能计数器/DR 断点作为输入，生成 TRIG 数据包并新增 Paused 状态。

## 第 3C 卷：系统编程指南，第 3 部分

> 注：Intel® 64 和 IA-32 架构软件开发手册共包含十卷：基本架构（订单号 253665）；指令集参考 A-L（订单号 253666）；指令集参考 M-U（订单号 253667）；指令集参考 V（订单号 326018）；指令集参考 W-Z（订单号 334569）；系统编程指南第 1 部分（订单号 253668）；系统编程指南第 2 部分（订单号 253669）；系统编程指南第 3 部分（订单号 326019）；系统编程指南第 4 部分（订单号 332831）；模型特定寄存器（订单号 335592）。在评估您的设计需求时，请参考全部十卷。

订单号：326019-092US  
2026 年 6 月

* * *

## 声明与免责条款

Intel 技术可能需要启用硬件、软件或服务激活。

没有任何产品或组件可以做到绝对安全。

您的成本和结果可能会有所不同。

您不得将本文档用于与本手册所述 Intel 产品有关的任何侵权或其他法律分析，也不得促成此类使用。您同意授予 Intel 一份非独占、免版税的许可，许可范围包括此后起草的、包含本文所述主题内容的任何专利申请。

所有产品计划和路线图如有变更，恕不另行通知。

所述产品可能包含设计缺陷或称为 errata（勘误）的错误，这些错误可能导致产品偏离已发布的规格。当前已表征的勘误可应要求提供。

Intel 不承担任何明示或暗示的保证，包括但不限于适销性、特定用途适用性和不侵权的暗示保证，以及由履行过程、交易过程或行业惯例产生的任何保证。

代号（Code names）被 Intel 用来标识正在开发中、尚未公开的产品、技术或服务。这些不是"商业"名称，也不打算作为商标使用。

本文档未授予任何知识产权许可（无论是明示、暗示、通过禁止反言或其他方式），唯一例外是：a) 您可以发布未经修改的副本；b) 本文档中标识为示例代码（Sample Code）的代码，按零条款 BSD 开源许可证（0BSD）授权，https://opensource.org/licenses/0BSD。您可以基于本文档并符合上述要求创建软件实现，这些实现旨在在本文档所引用的 Intel 产品上执行。不授予创建本文档修改版本或衍生版本的权利。

© Intel Corporation。Intel、Intel 徽标和其他 Intel 标志是 Intel Corporation 或其子公司的商标。其他名称和品牌可能是其各自所有者的财产。

* * *

## 第 26 章 虚拟机扩展简介

## 26.1 概述

本章描述虚拟机架构的基础知识，以及支持对多个软件环境进行处理器硬件虚拟化的虚拟机扩展（VMX）的概述。

关于 VMX 指令的信息在《Intel® 64 和 IA-32 架构软件开发手册》第 2B 卷中提供。VMX 的其他方面和系统编程注意事项在《Intel® 64 和 IA-32 架构软件开发手册》第 3C 卷的各章中描述。

## 26.2 虚拟机架构

虚拟机扩展定义了 IA-32 处理器上对虚拟机的处理器级支持。支持两类主要的软件：

-   **虚拟机监视器（VMM）**—— VMM 充当宿主机，对处理器和其他平台硬件拥有完全控制权。VMM 向客户软件（见下一段）提供虚拟处理器的抽象，并允许其直接在逻辑处理器上执行。VMM 能够对处理器资源、物理内存、中断管理和 I/O 保持选择性控制。
-   **客户软件**—— 每个虚拟机（VM）都是一个客户软件环境，支持由操作系统（OS）和应用软件组成的软件栈。每个虚拟机独立于其他虚拟机运行，并使用与物理平台所提供的处理器、内存、存储、图形和 I/O 相同的接口。该软件栈的表现就像运行在没有 VMM 的平台上一样。在虚拟机中执行的软件必须以降低的特权运行，以便 VMM 能够保持对平台资源的控制。

## 26.3 VMX 操作简介

对虚拟化的处理器支持由一种称为 VMX 操作的处理器操作形式提供。VMX 操作有两种：VMX 根操作（VMX root operation）和 VMX 非根操作（VMX non-root operation）。一般来说，VMM 将在 VMX 根操作中运行，客户软件将在 VMX 非根操作中运行。VMX 根操作与 VMX 非根操作之间的转换称为 VMX 转换（VMX transitions）。VMX 转换有两种：进入 VMX 非根操作的转换称为 VM 进入（VM entries）；从 VMX 非根操作到 VMX 根操作的转换称为 VM 退出（VM exits）。

VMX 根操作中的处理器行为与 VMX 操作之外的处理器行为非常相似。主要区别在于：一组新指令（VMX 指令）可用，并且可以加载到某些控制寄存器中的值受到限制（见第 26.8 节）。

VMX 非根操作中的处理器行为受到限制和修改，以促进虚拟化。某些指令（包括新的 VMCALL 指令）和事件不是按其普通操作执行，而是导致 VM 退出到 VMM。由于这些 VM 退出替代了普通行为，VMX 非根操作中软件的功能受到限制。正是这种限制使 VMM 能够保持对处理器资源的控制。

不存在软件可见的位，其设置可指示逻辑处理器是否处于 VMX 非根操作。这一事实可能允许 VMM 防止客户软件确定其正在虚拟机中运行。由于 VMX 操作甚至对以当前特权级（CPL）0 运行的软件施加限制，客户软件可以在其最初设计的特权级上运行。这种能力可能简化 VMM 的开发。

## 26.4 VMM 软件的生命周期

图 26-1 展示了 VMM 及其客户软件的生命周期，以及它们之间的交互。以下条目总结了该生命周期：

-   软件通过执行 VMXON 指令进入 VMX 操作。
-   使用 VM 进入，VMM 随后可以将客户（一次一个）进入虚拟机。VMM 使用 VMLAUNCH 和 VMRESUME 指令实现 VM 进入；它通过 VM 退出重新获得控制。
-   VM 退出将控制转移到 VMM 指定的入口点。VMM 可以根据 VM 退出的原因采取适当措施，然后可以使用 VM 进入返回到虚拟机。
-   最终，VMM 可能决定关闭自己并离开 VMX 操作。它通过执行 VMXOFF 指令来完成此操作。

```python
         Guest 0          Guest 1
           |                |
     VM Exit|          VM Exit|
           |                |
      +----+----------------+----+
      |        VM Monitor       |
      +----+----------------+----+
           ^                ^
           |     VM Entry   |
```

**图 26-1. 虚拟机监视器与客户之间的交互**

## 26.5 虚拟机控制结构

VMX 非根操作和 VMX 转换由一种称为虚拟机控制结构（VMCS）的数据结构控制。

对 VMCS 的访问通过处理器状态的一个组件——VMCS 指针（每个逻辑处理器一个）来管理。VMCS 指针的值是 VMCS 的 64 位地址。VMCS 指针使用 VMPTRST 和 VMPTRLD 指令读取和写入。VMM 使用 VMREAD、VMWRITE 和 VMCLEAR 指令配置 VMCS。

VMM 可以为其支持的每个虚拟机使用不同的 VMCS。对于具有多个逻辑处理器（虚拟处理器）的虚拟机，VMM 可以为每个虚拟处理器使用不同的 VMCS。

## 26.6 发现对 VMX 的支持

在系统软件进入 VMX 操作之前，它必须发现处理器中是否存在 VMX 支持。系统软件可以使用 CPUID 确定处理器是否支持 VMX 操作。如果 CPUID.01H:ECX.VMX\[5\] = 1，则支持 VMX 操作。见《Intel® 64 和 IA-32 架构软件开发手册》第 2A 卷第 3 章"指令集参考 A-L"。

VMX 架构被设计为可扩展的，以便未来在 VMX 操作中的处理器可以支持第一代 VMX 架构实现中不存在的附加功能。可扩展 VMX 功能的可用性通过一组 VMX 能力 MSR 报告给软件（见附录 A"VMX 能力报告设施"）。

## 26.7 启用并进入 VMX 操作

在系统软件能够进入 VMX 操作之前，它通过设置 CR4.VMXE\[第 13 位\] = 1 来启用 VMX。然后通过执行 VMXON 指令进入 VMX 操作。如果在 CR4.VMXE = 0 时执行，VMXON 会导致无效操作码异常（#UD）。一旦进入 VMX 操作，就不可能清除 CR4.VMXE（见第 26.8 节）。系统软件通过执行 VMXOFF 指令离开 VMX 操作。在执行 VMXOFF 之后、VMX 操作之外，可以清除 CR4.VMXE。

VMXON 还受 IA32_FEATURE_CONTROL MSR（MSR 地址 3AH）控制。该 MSR 在逻辑处理器复位时被清零。该 MSR 的相关位是：

-   **第 0 位是锁定位（lock bit）**。如果该位被清除，VMXON 会导致通用保护异常。如果锁定位被设置，对该 MSR 的 WRMSR 会导致通用保护异常；直到上电复位条件之前，该 MSR 无法被修改。系统 BIOS 可以使用该位提供设置选项，让 BIOS 禁用对 VMX 的支持。要在平台上启用 VMX 支持，BIOS 必须设置第 1 位、第 2 位或两者（见下文），以及锁定位。
-   **第 1 位在 SMX 操作中启用 VMXON**。如果该位被清除，在 SMX 操作中执行 VMXON 会导致通用保护异常。在不支持 VMX 操作（见第 26.6 节）和 SMX 操作（见《Intel® 64 和 IA-32 架构软件开发手册》第 2D 卷第 7 章"Safer Mode Extensions 参考"）的逻辑处理器上尝试设置该位会导致通用保护异常。
-   **第 2 位在 SMX 操作之外启用 VMXON**。如果该位被清除，在 SMX 操作之外执行 VMXON 会导致通用保护异常。在不支持 VMX 操作（见第 26.6 节）的逻辑处理器上尝试设置该位会导致通用保护异常。

> **注**  
> 如果自上次执行 GETSEC\[SENTER\] 以来未执行 GETSEC\[SEXIT\]，则逻辑处理器处于 SMX 操作中。如果未执行 GETSEC\[SENTER\]，或者自上次执行 GETSEC\[SENTER\] 之后执行了 GETSEC\[SEXIT\]，则逻辑处理器处于 SMX 操作之外。见《Intel® 64 和 IA-32 架构软件开发手册》第 2D 卷第 7 章"Safer Mode Extensions 参考"。

在执行 VMXON 之前，软件应分配一个自然对齐的 4-KByte 内存区域，逻辑处理器可使用该区域来支持 VMX 操作。¹ 该区域称为 VMXON 区域。VMXON 区域的地址（VMXON 指针）作为 VMXON 的操作数提供。第 27.11.5 节"VMXON Region"详细说明了软件应如何初始化和访问 VMXON 区域。

## 26.8 对 VMX 操作的限制

VMX 操作对处理器操作施加限制。详细如下：

-   在 VMX 操作中，处理器可以固定 CR0 和 CR4 中的某些位为特定值，而不支持其他值。如果这些位中的任何一个包含不支持的值，VMXON 将失败（见第 33 章"VMXON——进入 VMX 操作"）。在 VMX 操作（包括 VMX 根操作）中，使用 CLTS、LMSW 或 MOV CR 指令中的任何一个将这些位设置为不支持值的任何尝试都会导致通用保护异常。VM 进入或 VM 退出不能将这些位中的任何一个设置为不支持的值。软件应查阅 VMX 能力 MSR IA32_VMX_CR0_FIXED0 和 IA32_VMX_CR0_FIXED1，以确定 CR0 中的位是如何固定的（见附录 A.7）。对于 CR4，软件应查阅 VMX 能力 MSR IA32_VMX_CR4_FIXED0 和 IA32_VMX_CR4_FIXED1（见附录 A.8）。

> **注**  
> 首批支持 VMX 操作的处理器要求在 VMX 操作中以下位为 1：CR0.PE、CR0.NE、CR0.PG 和 CR4.VMXE。对 CR0.PE 和 CR0.PG 的限制意味着 VMX 操作仅在分页保护模式（包括 IA-32e 模式）下受支持。因此，客户软件不能在非分页保护模式或实地址模式下运行。
> 
> 后来的处理器支持一种称为"unrestricted guest"（不受限制的客户）的 VM 执行控制（见第 27.6.2 节）。如果该控制为 1，则 CR0.PE 和 CR0.PG 在 VMX 非根操作中可以为 0（即使能力 MSR IA32_VMX_CR0_FIXED0 报告其他情况）。¹ 此类处理器允许客户软件在非分页保护模式或实地址模式下运行。

-   如果逻辑处理器处于 A20M 模式，VMXON 将失败（见第 33 章"VMXON——进入 VMX 操作"）。一旦处理器进入 VMX 操作，A20M 中断被阻止。因此，在 VMX 操作中不可能处于 A20M 模式。
-   只要逻辑处理器处于 VMX 根操作，INIT 信号就被阻止。它在 VMX 非根操作中不被阻止。相反，INIT 会导致 VM 退出（见第 28.2 节"VM 退出的其他原因"）。
-   只有当 IA32_VMX_MISC\[14\] 读取为 1 时，Intel® 处理器追踪（Intel PT）才能在 VMX 操作中使用（见附录 A.6）。在支持 Intel PT 但不允许其在 VMX 操作中使用的处理器上，执行 VMXON 会清除 IA32_RTIT_CTL.TraceEn（见第 33 章"VMXON——进入 VMX 操作"）；在 VMX 操作（包括 VMX 根操作）中任何写入 IA32_RTIT_CTL 的尝试都会导致通用保护异常。

* * *

> **脚注：**
> 
> 1.  未来的处理器可能要求保留不同数量的内存。如果是这样，此事实通过 VMX 能力报告机制报告给软件。
> 2.  "Unrestricted guest"是一个次要的基于处理器的 VM 执行控制。如果主要基于处理器的 VM 执行控制的第 31 位为 0，则 VMX 非根操作的表现就像"unrestricted guest" VM 执行控制为 0 一样。见第 27.6.2 节。

* * *

## 第 27 章 虚拟机控制结构

## 27.1 概述

逻辑处理器在 VMX 操作中使用虚拟机控制数据结构（VMCS）。这些结构管理进入和离开 VMX 非根操作的转换（VM 进入和 VM 退出），以及 VMX 非根操作中的处理器行为。该结构由新指令 VMCLEAR、VMPTRLD、VMREAD 和 VMWRITE 操作。

VMM 可以为其支持的每个虚拟机使用不同的 VMCS。对于具有多个逻辑处理器（虚拟处理器）的虚拟机，VMM 可以为每个虚拟处理器使用不同的 VMCS。

逻辑处理器将内存中的一片区域与每个 VMCS 相关联。该区域称为 VMCS 区域。¹ 软件使用该区域的 64 位物理地址（VMCS 指针）引用特定的 VMCS。VMCS 指针必须在 4-KByte 边界上对齐（第 11:0 位必须为零）。这些指针不得设置超出处理器物理地址宽度的位。²,³

逻辑处理器可以维护多个活动的（active）VMCS。处理器可以通过在内存中、处理器上或两者中维护活动 VMCS 的状态来优化 VMX 操作。在任何给定时间，活动 VMCS 中最多有一个是当前（current）VMCS。（本文档经常使用术语"the VMCS"来指代当前 VMCS。）VMLAUNCH、VMREAD、VMRESUME 和 VMWRITE 指令仅对当前 VMCS 进行操作。

以下条目描述逻辑处理器如何确定哪些 VMCS 是活动的以及哪个是当前的：

-   VMPTRLD 指令的内存操作数是 VMCS 的地址。执行该指令后，该 VMCS 在逻辑处理器上既是活动的又是当前的。任何其他曾经活动的 VMCS 仍然保持活动，但没有其他 VMCS 是当前的。
-   当前 VMCS 中的 VMCS 链接指针字段（见第 27.4.2 节）本身是一个 VMCS 的地址。如果以"VMCS shadowing" VM 执行控制的 1 设置成功执行 VM 进入，则由 VMCS 链接指针字段引用的 VMCS 在逻辑处理器上变为活动。当前 VMCS 的身份不变。
-   VMCLEAR 指令的内存操作数也是一个 VMCS 的地址。执行该指令后，该 VMCS 在逻辑处理器上既不是活动的也不是当前的。如果该 VMCS 在逻辑处理器上曾经是当前的，则该逻辑处理器不再有当前 VMCS。

VMPTRST 指令将逻辑处理器当前 VMCS 的地址存储到指定的内存位置（如果没有当前 VMCS，则存储值 FFFFFFFF_FFFFFFFFH）。

VMCS 的启动状态（launch state）确定应该将哪个 VM 进入指令用于该 VMCS：VMLAUNCH 指令要求其启动状态为"clear"（清除）的 VMCS；VMRESUME 指令要求其启动状态为"launched"（已启动）的 VMCS。逻辑处理器在相应的 VMCS 区域中维护 VMCS 的启动状态。以下条目描述逻辑处理器如何管理 VMCS 的启动状态：

-   如果当前 VMCS 的启动状态是"clear"，则 VMLAUNCH 指令的成功执行会将启动状态改为"launched"。
-   VMCLEAR 指令的内存操作数是 VMCS 的地址。执行该指令后，该 VMCS 的启动状态为"clear"。
-   没有其他方法可以修改 VMCS 的启动状态（不能用 VMWRITE 修改），也没有直接的方法发现它（不能用 VMREAD 读取）。

图 27-1 展示了 VMCS 的不同状态。它使用"X"指代 VMCS，"Y"指代任何其他 VMCS。因此："VMPTRLD X"总是使 X 成为当前且活动；"VMPTRLD Y"总是使 X 不再是当前（因为它使 Y 成为当前）；如果 X 是当前且其启动状态为"clear"，VMLAUNCH 使 X 的启动状态变为"launched"；而"VMCLEAR X"总是使 X 变为不活动、非当前，并使其启动状态为"clear"。

该图未展示不修改这些参数相关 VMCS 状态的操作（例如，当 X 已经是当前时执行 VMPTRLD X）。请注意，即使 X 的当前状态未定义（例如，即使 X 尚未被初始化），VMCLEAR X 也会使 X 变为"不活动、非当前且 clear"。见第 27.11.3 节。

```python
                    VMCLEAR X ──────────► 不活动 / 非当前 / Clear
                     ▲                        │
                     │                        │ VMPTRLD X
                     │                        ▼
             活动 / 非当前 / Clear ◄── VMCLEAR X ── 活动 / 当前 / Clear
                     │  VMPTRLD Y              │  VMLAUNCH
                     │  (或 VMPTRLD X)         ▼
                     ▼                    活动 / 当前 / Launched
              活动 / 非当前 / Launched ◄─ VMCLEAR X ──┘
```

**图 27-1. VMCS X 的状态**

由于影子 VMCS（shadow VMCS，见第 27.10 节）不能用于 VM 进入，影子 VMCS 的启动状态没有意义。图 27-1 未展示影子 VMCS 可能变为活动的所有方式。

## 27.2 VMCS 区域的格式

一个 VMCS 区域由最多 4-KBytes 组成。¹ VMCS 区域的格式见表 27-1。

**表 27-1. VMCS 区域的格式**

| 字节偏移 | 内容  |
| --- | --- |
| 0   | 第 30:0 位：VMCS 修订标识符（revision identifier）；第 31 位：影子 VMCS 指示符（见第 27.10 节） |
| 4   | VMX 中止指示符（VMX-abort indicator） |
| 8   | VMCS 数据（实现特定的格式） |

VMCS 区域的前 4 个字节在第 30:0 位包含 VMCS 修订标识符。¹ 以不同格式（见下文）维护 VMCS 数据的处理器使用不同的 VMCS 修订标识符。这些标识符使软件能够避免在使用不同格式的处理器上使用为一种处理器格式化的 VMCS 区域。² 这 4 字节区域的第 31 位指示该 VMCS 是否是影子 VMCS（见第 27.10 节）。

软件应在将该区域用作 VMCS 之前将 VMCS 修订标识符写入 VMCS 区域。VMCS 修订标识符永远不会被处理器写入；如果 VMPTRLD 的操作数引用的 VMCS 区域的 VMCS 修订标识符与处理器使用的不同，则 VMPTRLD 失败。（如果影子 VMCS 指示符为 1 且处理器不支持"VMCS shadowing" VM 执行控制的 1 设置，VMPTRLD 也会失败；见第 27.6.2 节）软件可以通过读取 VMX 能力 MSR IA32_VMX_BASIC（见附录 A.1）发现处理器使用的 VMCS 修订标识符。

软件应根据 VMCS 是普通 VMCS 还是影子 VMCS（见第 27.10 节）清除或设置影子 VMCS 指示符。如果影子 VMCS 指示符被设置且处理器不支持"VMCS shadowing" VM 执行控制的 1 设置，VMPTRLD 失败。软件可以通过读取 VMX 能力 MSR IA32_VMX_PROCBASED_CTLS2（见附录 A.3.3）发现对该设置的 支持。

VMCS 区域的下 4 个字节用于 VMX 中止指示符。这些位的内容不以任何方式控制处理器操作。如果发生 VMX 中止（见第 30.7 节），逻辑处理器向这些位写入非零值。软件也可以写入该字段。

VMCS 区域的其余部分用于 VMCS 数据（控制 VMX 非根操作和 VMX 转换的 VMCS 部分）。这些数据的格式是实现特定的。VMCS 数据在第 27.3 节至第 27.9 节中讨论。为确保 VMX 操作中的正确行为，软件应维护 VMCS 区域和相关的结构（在第 27.11.4 节中列举）位于写回（writeback）可缓存内存中。未来的实现可能允许或要求不同的内存类型³。软件应查阅 VMX 能力 MSR IA32_VMX_BASIC（见附录 A.1）。

## 27.3 VMCS 数据的组织

VMCS 数据被组织成六个逻辑组：

-   **客户状态区域（Guest-state area）**。处理器状态在 VM 退出时保存到客户状态区域，并在 VM 进入时从那里加载。
-   **宿主状态区域（Host-state area）**。处理器状态在 VM 退出时从宿主状态区域加载。
-   **VM 执行控制字段（VM-execution control fields）**。这些字段控制 VMX 非根操作中的处理器行为。它们部分决定 VM 退出的原因。
-   **VM 退出控制字段（VM-exit control fields）**。这些字段控制 VM 退出。
-   **VM 进入控制字段（VM-entry control fields）**。这些字段控制 VM 进入。
-   **VM 退出信息字段（VM-exit information fields）**。这些字段接收 VM 退出的信息，并描述 VM 退出的原因和性质。在某些处理器上，这些字段是只读的。⁴

VM 执行控制字段、VM 退出控制字段和 VM 进入控制字段有时被统称为 VMX 控制（VMX controls）。

## 27.4 客户状态区域

本节描述 VMCS 客户状态区域中包含的字段。VM 进入从这些字段加载处理器状态，VM 退出将处理器状态存储到这些字段。详见第 29.3.2 节和第 30.3 节。

### 27.4.1 客户寄存器状态

客户状态区域中的以下字段对应于处理器寄存器：

-   控制寄存器 CR0、CR3 和 CR4（各 64 位；在不支持 Intel 64 架构的处理器上为 32 位）。
-   调试寄存器 DR7（64 位；在不支持 Intel 64 架构的处理器上为 32 位）。
-   RSP、RIP 和 RFLAGS（各 64 位；在不支持 Intel 64 架构的处理器上为 32 位）。¹
-   对于寄存器 CS、SS、DS、ES、FS、GS、LDTR 和 TR 中的每一个，以下字段：
    -   选择器（16 位）。
    -   基地址（64 位；在不支持 Intel 64 架构的处理器上为 32 位）。CS、SS、DS 和 ES 的基地址字段只有 32 个架构定义位；尽管如此，在支持 Intel 64 架构的处理器上，相应的 VMCS 字段有 64 位。
    -   段限长（32 位）。限长字段始终以字节为单位度量。
    -   访问权限（32 位）。该字段的格式见表 27-2，详述如下：
        -   低 16 位对应于 64 位段描述符的高 32 位的第 23:8 位。虽然代码段和数据段描述符的第 19:16 位对应于段限长的最高 4 位，但相应的位（第 11:8 位）在此 VMCS 字段中保留。
        -   第 16 位指示不可用的段（unusable segment）。尝试使用此类段会在 64 位模式之外出错。一般来说，如果段寄存器已加载空选择器，则它是不可用的。²
        -   第 31:17 位保留。

**表 27-2. 访问权限的格式**

| 位位置 | 字段  |
| --- | --- |
| 3:0 | 段类型（Segment type） |
| 4   | S —— 描述符类型（0 = 系统；1 = 代码或数据） |
| 6:5 | DPL —— 描述符特权级 |
| 7   | P —— 段存在 |
| 11:8 | 保留  |
| 12  | AVL —— 可供系统软件使用 |
| 13  | 保留（CS 除外）L —— 64 位模式激活（仅 CS） |
| 14  | D/B —— 默认操作大小（0 = 16 位段；1 = 32 位段） |
| 15  | G —— 粒度 |
| 16  | 段不可用（0 = 可用；1 = 不可用） |
| 31:17 | 保留  |

基地址、段限长和访问权限构成每个段寄存器的"隐藏"部分（或"描述符缓存"）。这些数据包含在 VMCS 中，因为段寄存器的描述符缓存有可能与段寄存器选择器引用的内存中（GDT 或 LDT 中）的段描述符不一致。

SS 的 DPL 字段的值始终等于逻辑处理器的当前特权级（CPL）。¹

在某些处理器上，VMWRITE 的执行会忽略对第 11:8 位或第 31:17 位中的任何位写入非零值的尝试。在此类处理器上，VMREAD 对这些位总是返回 0，VM 进入将这些位视为全 0（见第 29.3.1.2 节）。

-   对于寄存器 GDTR 和 IDTR 中的每一个，以下字段：
    -   基地址（64 位；在不支持 Intel 64 架构的处理器上为 32 位）。
    -   限长（32 位）。限长字段包含 32 位，即使在架构中这些字段仅被指定为 16 位。
-   以下 MSR：
    -   IA32_DEBUGCTL（64 位）
        
    -   IA32_SYSENTER_CS（32 位）
        
    -   IA32_SYSENTER_ESP 和 IA32_SYSENTER_EIP（64 位；在不支持 Intel 64 架构的处理器上为 32 位）
        
    -   IA32_PERF_GLOBAL_CTRL（64 位）。仅在支持"load IA32_PERF_GLOBAL_CTRL" VM 进入控制的 1 设置的处理器上支持此字段。
        
    -   IA32_PAT（64 位）。仅在支持"load IA32_PAT" VM 进入控制或"save IA32_PAT" VM 退出控制的 1 设置的处理器上支持此字段。
        
    -   IA32_EFER（64 位）。仅在支持"load IA32_EFER" VM 进入控制或"save IA32_EFER" VM 退出控制的 1 设置的处理器上支持此字段。
        
    -   IA32_BNDCFGS（64 位）。仅在支持"load IA32_BNDCFGS" VM 进入控制或"clear IA32_BNDCFGS" VM 退出控制的 1 设置的处理器上支持此字段。
        
    -   IA32_RTIT_CTL（64 位）。仅在支持"load IA32_RTIT_CTL" VM 进入控制或"clear IA32_RTIT_CTL" VM 退出控制的 1 设置的处理器上支持此字段。
        
    -   IA32_LBR_CTL（64 位）。仅在支持"load guest IA32_LBR_CTL" VM 进入控制或"clear IA32_LBR_CTL" VM 退出控制的 1 设置的处理器上支持此字段。
        
    -   IA32_S_CET（64 位；在不支持 Intel 64 架构的处理器上为 32 位）。仅在支持"load CET state" VM 进入控制的 1 设置的处理器上支持此字段。
        
    -   IA32_INTERRUPT_SSP_TABLE_ADDR（64 位；在不支持 Intel 64 架构的处理器上为 32 位）。仅在支持"load CET state" VM 进入控制的 1 设置的处理器上支持此字段。
        
    -   IA32_PKRS（64 位）。仅在支持"load PKRS" VM 进入控制的 1 设置的处理器上支持此字段。
        
    -   在支持"load FRED" VM 进入控制或"save FRED" VM 退出控制的 1 设置的处理器上，以下 MSR（各 64 位）：
        
        -   IA32_FRED_CONFIG
        -   IA32_FRED_RSP1
        -   IA32_FRED_RSP2
        -   IA32_FRED_RSP3
        -   IA32_FRED_STKLVLS
        -   IA32_FRED_SSP1
        -   IA32_FRED_SSP2
        -   IA32_FRED_SSP3
    -   IA32_SPEC_CTRL（64 位）。仅在支持"load IA32_SPEC_CTRL" VM 进入控制的 1 设置的处理器上支持此字段。
        
-   影子栈指针寄存器 SSP（64 位；在不支持 Intel 64 架构的处理器上为 32 位）。仅在支持"load CET state" VM 进入控制的 1 设置的处理器上支持此字段。
-   寄存器 SMBASE（32 位）。该寄存器包含逻辑处理器 SMRAM 映像的基地址。

### 27.4.2 客户非寄存器状态

除了第 27.4.1 节描述的寄存器状态外，客户状态区域还包括以下表征客户状态但不对应于处理器寄存器的字段：

-   **活动状态（Activity state，32 位）**。该字段标识逻辑处理器的活动状态。当逻辑处理器正常执行指令时，它处于活动（active）状态。某些指令的执行和某些事件的发生可能导致逻辑处理器转换到不活动（inactive）状态，在该状态下它停止执行指令。
    
    定义了以下活动状态：¹
    
    -   **0：Active（活动）**。逻辑处理器正常执行指令。
    -   **1：HLT**。逻辑处理器因执行了 HLT 指令而处于不活动状态。
    -   **2：Shutdown（关闭）**。逻辑处理器因遭遇三重故障² 或其他严重错误而处于不活动状态。
    -   **3：Wait-for-SIPI**。逻辑处理器因正在等待启动 IPI（SIPI）而处于不活动状态。
    
    未来的处理器可能包含对其他活动状态的支持。软件应读取 VMX 能力 MSR IA32_VMX_MISC（见附录 A.6）以确定支持哪些活动状态。
    
-   **中断性状态（Interruptibility state，32 位）**。IA-32 架构包含允许某些事件在一段时间内被阻止的功能。该字段包含关于此类阻止的信息。该字段的详细信息和格式见表 27-3。
    
-   **待处理调试异常（Pending debug exceptions，64 位；在不支持 Intel 64 架构的处理器上为 32 位）**。IA-32 处理器可以识别一个或多个调试异常而不立即交付它们。³ 该字段包含关于此类异常的信息。该字段在表 27-4 中描述。
    

**表 27-3. 中断性状态的格式**

| 位位置 | 位名称 | 说明  |
| --- | --- | --- |
| 0   | 由 STI 阻止 | 见《Intel® 64 和 IA-32 架构软件开发手册》第 2B 卷第 4 章"STI——设置中断标志"部分。在 RFLAGS.IF = 0 时执行 STI 会在其执行后的指令边界上阻止可屏蔽中断。¹ 设置该位表示此阻止生效。 |
| 1   | 由 MOV SS 阻止 | 见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 7.8.3 节"切换栈时屏蔽异常和中断"。对 SS 执行 MOV 或对 SS 执行 POP 会在其执行后的指令边界上阻止或抑制某些调试异常以及中断（可屏蔽和不可屏蔽）。² 设置该位表示此阻止生效。本文档使用术语"由 MOV SS 阻止"，但它同样适用于 POP SS。 |
| 2   | 由 SMI 阻止 | 见第 34.2 节"系统管理中断（SMI）"。当处理器处于系统管理模式（SMM）时，系统管理中断（SMI）被禁用。设置该位表示 SMI 的阻止生效。 |
| 3   | 由 NMI 阻止 | 见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 7.7.2 节"NMI 阻止"以及第 34.8 节"SMM 中的 NMI 处理"。非可屏蔽中断（NMI）或系统管理中断（SMI）的交付会阻止后续 NMI，直到下一次执行 IRET。关于 IRET 的此行为在 VMX 非根操作中可能如何变化，见第 28.3 节。设置该位表示 NMI 的阻止生效。清除该位并不意味着 NMI 不会因其他原因被（暂时）阻止。如果"virtual NMIs" VM 执行控制（见第 27.6.1 节）为 1，该位不控制 NMI 的阻止。相反，它指的是"virtual-NMI blocking"（虚拟 NMI 阻止）（即客户软件尚未准备好接收 NMI 的事实）。 |
| 4   | 飞地中断（Enclave interruption） | 如果 VM 退出发生在逻辑处理器处于飞地模式（enclave mode）时，则设置为 1。此类 VM 退出包括在飞地模式中发生的中断、非可屏蔽中断、系统管理中断、INIT 信号和异常所导致的 VM 退出，以及在交付此类事件过程中遇到的、与飞地模式相关的异常。如果 VM 退出是由于或伴随交付以下事件而发生，也会设置该位：（1）在客户中断性状态字段设置该位时，由 VM 进入使其挂起或被注入的事件；或（2）在执行 RSM 之后挂起的事件，且该 RSM 执行时 SMRAM 中状态保存映像中偏移 7EE0H 处的字节的第 1 位被设置。 |
| 31:5 | 保留  | 如果这些位不为 0，VM 进入将失败。见第 29.3.1.5 节。 |

> **注：**
> 
> 1.  在如此执行 STI 后的指令边界上，非可屏蔽中断和系统管理中断也可能被抑制。
> 2.  在如此执行 MOV 或 POP 后的指令边界上，系统管理中断也可能被抑制。

-   **VMCS 链接指针（VMCS link pointer，64 位）**。如果"VMCS shadowing" VM 执行控制为 1，VMREAD 和 VMWRITE 指令访问此指针引用的 VMCS（见第 27.10 节）。否则，软件应将该字段设置为 FFFFFFFF_FFFFFFFFH 以避免 VM 进入失败（见第 29.3.1.5 节）。

**表 27-4. 待处理调试异常的格式**

| 位位置 | 位名称 | 说明  |
| --- | --- | --- |
| 3:0 | B3 – B0 | 设置时，这些位中的每一位指示相应的断点条件已满足。即使 DR7 中相应的启用位未被设置，这些位中的任何一个也可以被设置。 |
| 10:4 | 保留  | 如果这些位不为 0，VM 进入失败。见第 29.3.1.5 节。 |
| 11  | BLD | 设置时，该位指示在启用 OS 总线锁检测且 CPL > 0 时断言了总线锁（见第 20.3.1.6 节"OS 总线锁检测"）。¹ |
| 12  | 已启用的断点（Enabled breakpoint） | 设置时，该位指示至少满足了一个数据或 I/O 断点且在 DR7 中已启用；在 VM 退出之前立即执行了 XBEGIN 指令且已启用 RTM 事务区域的进阶调试；或在 CPL > 0 且已启用 OS 总线锁检测时断言了总线锁。 |
| 13  | 保留  | 如果该位不为 0，VM 进入失败。见第 29.3.1.5 节。 |
| 14  | BS  | 设置时，该位指示单步执行模式本会触发调试异常。 |
| 15  | 保留  | 如果该位不为 0，VM 进入失败。见第 29.3.1.5 节。 |
| 16  | RTM | 设置时，该位指示在已启用 RTM 事务区域的进阶调试时，调试异常（#DB）或断点异常（#BP）发生在 RTM 区域内（见《Intel® 64 和 IA-32 架构软件开发手册》第 1 卷第 17.3.7 节"支持 RTM 的调试器支持"）。² |
| 63:17 | 保留  | 如果这些位不为 0，VM 进入失败。见第 29.3.1.5 节。第 63:32 位仅存在于支持 Intel 64 架构的处理器上。 |

> **注：**
> 
> 1.  一般来说，该字段的格式与 DR6 匹配。但是，DR6 清除第 11 位以指示检测到总线锁，而该字段设置该位以指示该条件。
> 2.  一般来说，该字段的格式与 DR6 匹配。但是，DR6 清除第 16 位以指示与 RTM 相关的异常，而该字段设置该位以指示该条件。

-   **VMX 抢占定时器值（VMX-preemption timer value，32 位）**。仅在支持"activate VMX-preemption timer" VM 执行控制的 1 设置的处理器上支持此字段。该字段包含 VMX 抢占定时器在下一次以该设置进行 VM 进入后将使用的值。见第 28.5.1 节和第 29.7.4 节。
    
-   **页目录指针表项（Page-directory-pointer-table entries，PDPTE；各 64 位）**。这四个（4）字段（PDPTE0、PDPTE1、PDPTE2 和 PDPTE3）仅在支持"enable EPT" VM 执行控制的 1 设置的处理器上受支持。它们对应于使用 PAE 分页时 CR3 引用的 PDPTE（见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 5.4 节）。仅在"enable EPT" VM 执行控制为 1 时使用它们。
    
-   **客户中断状态（Guest interrupt status，16 位）**。仅在支持"virtual-interrupt delivery" VM 执行控制的 1 设置的处理器上支持此字段。它表征客户虚拟 APIC 状态的一部分，不对应于任何处理器或 APIC 寄存器。它由两个 8 位子字段组成：
    
    -   **请求虚拟中断（Requesting virtual interrupt，RVI）**。这是客户中断状态的低字节。处理器将此值视为请求服务的最高优先级虚拟中断的向量。（值 0 意味着不存在此类中断。）
    -   **服务中虚拟中断（Servicing virtual interrupt，SVI）**。这是客户中断状态的高字节。处理器将此值视为正在服务中的最高优先级虚拟中断的向量。（值 0 意味着不存在此类中断。）
    
    关于此字段使用的更多信息见第 32 章。
    
-   **PML 索引（PML index，16 位）**。仅在支持"enable PML" VM 执行控制的 1 设置的处理器上支持此字段。它包含页修改日志（page-modification log）中下一个条目的逻辑索引。由于页修改日志包含 512 个条目，PML 索引通常是一个 0–511 范围内的值。页修改日志和 PML 索引使用的详细信息见第 31.3.6 节。
    
-   **客户截止时间（Guest deadline，64 位）**。仅在支持"APIC-timer virtualization" VM 执行控制的 1 设置的处理器上支持此字段。它包含客户定时器将被配置的值。见第 28.5.10 节。
    

## 27.5 宿主状态区域

本节描述 VMCS 宿主状态区域中包含的字段。如前所述，在每次 VM 退出时从这些字段加载处理器状态（见第 30.5 节）。

宿主状态区域中的所有字段都对应于处理器寄存器：

-   CR0、CR3 和 CR4（各 64 位；在不支持 Intel 64 架构的处理器上为 32 位）。
-   RSP 和 RIP（各 64 位；在不支持 Intel 64 架构的处理器上为 32 位）。
-   段寄存器 CS、SS、DS、ES、FS、GS 和 TR 的选择器字段（各 16 位）。宿主状态区域中没有 LDTR 选择器的字段。
-   FS、GS、TR、GDTR 和 IDTR 的基地址字段（各 64 位；在不支持 Intel 64 架构的处理器上为 32 位）。
-   以下 MSR：
    -   IA32_SYSENTER_CS（32 位）
    -   IA32_SYSENTER_ESP 和 IA32_SYSENTER_EIP（64 位；在不支持 Intel 64 架构的处理器上为 32 位）。
    -   IA32_PERF_GLOBAL_CTRL（64 位）。仅在支持"load IA32_PERF_GLOBAL_CTRL" VM 退出控制的 1 设置的处理器上支持此字段。
    -   IA32_PAT（64 位）。仅在支持"load IA32_PAT" VM 退出控制的 1 设置的处理器上支持此字段。
    -   IA32_EFER（64 位）。仅在支持"load IA32_EFER" VM 退出控制的 1 设置的处理器上支持此字段。
    -   IA32_S_CET（64 位；在不支持 Intel 64 架构的处理器上为 32 位）。仅在支持"load CET state" VM 退出控制的 1 设置的处理器上支持此字段。
    -   IA32_INTERRUPT_SSP_TABLE_ADDR（64 位；在不支持 Intel 64 架构的处理器上为 32 位）。仅在支持"load CET state" VM 退出控制的 1 设置的处理器上支持此字段。
    -   IA32_PKRS（64 位）。仅在支持"load PKRS" VM 退出控制的 1 设置的处理器上支持此字段。
    -   在支持"load FRED" VM 退出控制的 1 设置的处理器上，以下 MSR（各 64 位）：
        -   IA32_FRED_CONFIG
        -   IA32_FRED_RSP1
        -   IA32_FRED_RSP2
        -   IA32_FRED_RSP3
        -   IA32_FRED_STKLVLS
        -   IA32_FRED_SSP1
        -   IA32_FRED_SSP2
        -   IA32_FRED_SSP3
    -   IA32_SPEC_CTRL（64 位）。仅在支持"load IA32_SPEC_CTRL" VM 退出控制的 1 设置的处理器上支持此字段。
-   影子栈指针寄存器 SSP（64 位；在不支持 Intel 64 架构的处理器上为 32 位）。仅在支持"load CET state" VM 退出控制的 1 设置的处理器上支持此字段。

除此处标识的状态外，一些处理器状态组件在每次 VM 退出时以固定值加载，

VM 退出；宿主状态区域中没有对应于这些组件的字段。关于 VM 退出时状态如何加载的详细信息见第 30.5 节。

## 27.6 VM 执行控制字段

VM 执行控制字段管理 VMX 非根操作。这些字段在第 27.6.1 节至第 27.6.8 节中描述。

### 27.6.1 基于引脚的 VM 执行控制（Pin-Based VM-Execution Controls）

基于引脚的 VM 执行控制构成一个 32 位向量，管理异步事件（例如：中断）的处理。¹ 表 27-5 列出了这些控制。关于这些控制如何影响 VMX 非根操作中的处理器行为，见第 29 章。

**表 27-5. 基于引脚的 VM 执行控制的定义**

| 位位置 | 名称  | 描述  |
| --- | --- | --- |
| 0   | External-interrupt exiting（外部中断退出） | 如果此控制为 1，外部中断导致 VM 退出。否则，它们正常交付。如果此控制为 1，RFLAGS.IF 的值不影响中断阻止。 |
| 3   | NMI exiting | 如果此控制为 1，非可屏蔽中断（NMI）导致 VM 退出。否则，它们使用向量 2 正常交付。此控制还决定 IRET 与 NMI 阻止之间的交互（见第 28.3 节）。 |
| 5   | Virtual NMIs | 如果此控制为 1，NMI 永远不会被阻止，中断性状态字段中的"blocking by NMI"位（第 3 位）指示"virtual-NMI blocking"（虚拟 NMI 阻止）（见表 27-3）。此控制还与"NMI-window exiting" VM 执行控制交互（见第 27.6.2 节）。 |
| 6   | Activate VMX-preemption timer | 如果此控制为 1，VMX 抢占定时器在 VMX 非根操作中倒计时；见第 28.5.1 节。当定时器倒计时到零时发生 VM 退出；见第 28.2 节。 |
| 7   | Process posted interrupts | 如果此控制为 1，处理器将具有 posted-interrupt 通知向量（见第 27.6.8 节）的中断特殊处理，用 posted-interrupt 请求更新虚拟 APIC 页（见第 32.6 节）。 |

此字段中的所有其他位保留，有些固定为 0，有些固定为 1。软件应查阅 VMX 能力 MSR IA32_VMX_PINBASED_CTLS 和 IA32_VMX_TRUE_PINBASED_CTLS（见附录 A.3.1）以确定如何设置保留位。未能正确设置保留位会导致后续 VM 进入失败（见第 29.2.1.1 节）。

首批支持虚拟机扩展的处理器仅支持位 1、2 和 4 的 1 设置。VMX 能力 MSR IA32_VMX_PINBASED_CTLS 将始终报告这些位必须为 1。支持这些位中任何一个的 0 设置的逻辑处理器将支持 VMX 能力 MSR IA32_VMX_TRUE_PINBASED_CTLS MSR，软件应查阅此 MSR 以发现这些位的 0 设置的支持。不了解这些位中任何一个功能的软件应将该位设置为 1。

### 27.6.2 基于处理器的 VM 执行控制

基于处理器的 VM 执行控制构成三个向量，管理同步事件的处理，主要是由特定指令的执行引起的事件。² 它们是主要基于处理器的 VM 执行控制（32 位）、次要基于处理器的 VM 执行控制（32 位）和三级 VM 执行控制（64 位）。

表 27-6 列出了主要基于处理器的 VM 执行控制。关于这些控制如何影响 VMX 非根操作中的处理器行为的更多详细信息，见第 27 章。

**表 27-6. 主要基于处理器的 VM 执行控制的定义**

| 位位置 | 名称  | 描述  |
| --- | --- | --- |
| 2   | Interrupt-window exiting | 如果此控制为 1，当 RFLAGS.IF = 1 且没有其他中断阻止（见第 27.4.2 节）时，在任何指令的开头发生 VM 退出。 |
| 3   | Use TSC offsetting | 此控制决定执行 RDTSC、执行 RDTSCP 以及从 IA32_TIME_STAMP_COUNTER MSR 读取的 RDMSR 执行是否返回由 TSC offset 字段修改的值（见第 27.6.5 节和第 28.3 节）。 |
| 7   | HLT exiting | 此控制决定 HLT 的执行是否导致 VM 退出。 |
| 9   | INVLPG exiting | 此控制决定 INVLPG 和 INVPCID 的执行是否导致 VM 退出。 |
| 10  | MWAIT exiting | 此控制决定 MWAIT 的执行是否导致 VM 退出。 |
| 11  | RDPMC exiting | 此控制决定 RDPMC 的执行是否导致 VM 退出。 |
| 12  | RDTSC exiting | 此控制决定 RDTSC 和 RDTSCP 的执行是否导致 VM 退出。 |
| 15  | CR3-load exiting | 与 CR3-target 控制（见第 27.6.7 节）结合，此控制决定对 CR3 的 MOV 执行是否导致 VM 退出。见第 28.1.3 节。首批支持虚拟机扩展的处理器仅支持此控制的 1 设置。 |
| 16  | CR3-store exiting | 此控制决定从 CR3 的 MOV 执行是否导致 VM 退出。首批支持虚拟机扩展的处理器仅支持此控制的 1 设置。 |
| 17  | Activate tertiary controls | 此控制决定是否使用三级基于处理器的 VM 执行控制。如果此控制为 0，逻辑处理器的表现就像所有三级基于处理器的 VM 执行控制也为 0。 |
| 19  | CR8-load exiting | 此控制决定对 CR8 的 MOV 执行是否导致 VM 退出。 |
| 20  | CR8-store exiting | 此控制决定从 CR8 的 MOV 执行是否导致 VM 退出。 |
| 21  | Use TPR shadow | 将此控制设置为 1 启用 TPR 虚拟化和其它 APIC 虚拟化功能。见第 32 章。 |
| 22  | NMI-window exiting | 如果此控制为 1，当没有 virtual-NMI 阻止（见第 27.4.2 节）时，在任何指令的开头发生 VM 退出。 |
| 23  | MOV-DR exiting | 此控制决定 MOV DR 的执行是否导致 VM 退出。 |
| 24  | Unconditional I/O exiting | 此控制决定 I/O 指令（IN、INS/INSB/INSW/INSD、OUT 和 OUTS/OUTSB/OUTSW/OUTSD）的执行是否导致 VM 退出。 |
| 25  | Use I/O bitmaps | 此控制决定是否使用 I/O 位图来限制 I/O 指令的执行（见第 27.6.4 节和第 28.1.3 节）。对于此控制，"0"表示"不使用 I/O 位图"，"1"表示"使用 I/O 位图"。如果使用 I/O 位图，则忽略"unconditional I/O exiting"控制的设置。 |
| 27  | Monitor trap flag | 如果此控制为 1，监视器陷阱标志（monitor trap flag）调试功能被启用。见第 28.5.2 节。 |
| 28  | Use MSR bitmaps | 此控制决定是否使用 MSR 位图来控制 RDMSR 和 WRMSR 指令的执行（见第 27.6.9 节和第 28.1.3 节）。对于此控制，"0"表示"不使用 MSR 位图"，"1"表示"使用 MSR 位图"。如果不使用 MSR 位图，RDMSR 和 WRMSR 指令的所有执行都导致 VM 退出。 |
| 29  | MONITOR exiting | 此控制决定 MONITOR 的执行是否导致 VM 退出。 |
| 30  | PAUSE exiting | 此控制决定 PAUSE 的执行是否导致 VM 退出。 |
| 31  | Activate secondary controls | 此控制决定是否使用次要基于处理器的 VM 执行控制。如果此控制为 0，逻辑处理器的表现就像所有次要基于处理器的 VM 执行控制也为 0。 |

此字段中的所有其他位保留，有些固定为 0，有些固定为 1。软件应查阅 VMX 能力 MSR IA32_VMX_PROCBASED_CTLS 和 IA32_VMX_TRUE_PROCBASED_CTLS（见附录 A.3.2）以确定如何设置保留位。未能正确设置保留位会导致后续 VM 进入失败（见第 29.2.1.1 节）。

首批支持虚拟机扩展的处理器仅支持位 1、4–6、8、13–16 和 26 的 1 设置。VMX 能力 MSR IA32_VMX_PROCBASED_CTLS 将始终报告这些位必须为 1。支持这些位中任何一个的 0 设置的逻辑处理器将支持 VMX 能力 MSR IA32_VMX_TRUE_PROCBASED_CTLS MSR，软件应查阅此 MSR 以发现这些位的 0 设置的支持。不了解这些位中任何一个功能的软件应将该位设置为 1。

主要基于处理器的 VM 执行控制的第 31 位决定是否使用次要基于处理器的 VM 执行控制。如果该位为 0，VM 进入和 VMX 非根操作的表现就像所有次要基于处理器的 VM 执行控制都为 0。仅支持主要基于处理器的 VM 执行控制的第 31 位的 0 设置的处理器不支持次要基于处理器的 VM 执行控制。

表 27-7 列出了次要基于处理器的 VM 执行控制。关于这些控制如何影响 VMX 非根操作中的处理器行为的更多详细信息，见第 27 章。

**表 27-7. 次要基于处理器的 VM 执行控制的定义**

| 位位置 | 名称  | 描述  |
| --- | --- | --- |
| 0   | Virtualize APIC accesses | 如果此控制为 1，逻辑处理器特殊处理对具有 APIC-access 地址的页的访问。见第 32.4 节。 |
| 1   | Enable EPT | 如果此控制为 1，启用扩展页表（EPT）。见第 31.3 节。 |
| 2   | Descriptor-table exiting | 此控制决定 LGDT、LIDT、LLDT、LTR、SGDT、SIDT、SLDT 和 STR 的执行是否导致 VM 退出。 |
| 3   | Enable RDTSCP | 如果此控制为 0，RDTSCP 的任何执行都导致无效操作码异常（#UD）。 |
| 4   | Virtualize x2APIC mode | 如果此控制为 1，逻辑处理器特殊处理对 APIC MSR（范围 800H–8FFH）的 RDMSR 和 WRMSR。见第 32.5 节。 |
| 5   | Enable VPID | 如果此控制为 1，线性地址的缓存转换与虚拟处理器标识符（VPID）相关联。见第 31.1 节。 |
| 6   | WBINVD exiting | 此控制决定 WBINVD 和 WBNOINVD 的执行是否导致 VM 退出。 |
| 7   | Unrestricted guest | 此控制决定客户软件是否可以在非分页保护模式或实地址模式下运行。 |
| 8   | APIC-register virtualization | 如果此控制为 1，逻辑处理器虚拟化某些 APIC 访问。见第 32.4 节和第 32.5 节。 |
| 9   | Virtual-interrupt delivery | 此控制启用对挂起的虚拟中断的评估和交付，以及对控制中断优先级的 APIC 寄存器写入的模拟。 |
| 10  | PAUSE-loop exiting | 此控制决定一系列 PAUSE 的执行是否会导致 VM 退出（见第 27.6.13 节和第 28.1.3 节）。 |
| 11  | RDRAND exiting | 此控制决定 RDRAND 的执行是否导致 VM 退出。 |
| 12  | Enable INVPCID | 如果此控制为 0，INVPCID 的任何执行都导致 #UD。 |
| 13  | Enable VM functions | 将此控制设置为 1 启用 VMX 非根操作中 VMFUNC 指令的使用。见第 28.5.7 节。 |
| 14  | VMCS shadowing | 如果此控制为 1，VMX 非根操作中 VMREAD 和 VMWRITE 的执行可能访问影子 VMCS（而不是导致 VM 退出）。见第 27.10 节和第 33.3 节。 |
| 15  | Enable ENCLS exiting | 如果此控制为 1，ENCLS 的执行查阅 ENCLS-exiting 位图以确定该指令是否导致 VM 退出。见第 27.6.16 节和第 28.1.3 节。 |
| 16  | RDSEED exiting | 此控制决定 RDSEED 的执行是否导致 VM 退出。 |
| 17  | Enable PML | 如果此控制为 1，对设置 EPT 脏位的客户物理地址的访问首先向页修改日志添加一个条目。见第 31.3.6 节。 |
| 18  | EPT-violation #VE | 如果此控制为 1，EPT 违规可能导致虚拟化异常（#VE）而不是 VM 退出。见第 28.5.8 节。 |
| 19  | Conceal VMX from PT | 如果此控制为 1，Intel 处理器追踪从 PIP 中抑制处理器处于 VMX 非根操作的指示，并从 VMX 非根操作中产生的任何 PSB+ 中省略 VMCS 包（见第 36 章）。 |
| 20  | Enable XSAVES/XRSTORS | 如果此控制为 0，XSAVES 或 XRSTORS 的任何执行都导致 #UD。 |
| 21  | PASID translation | 如果此控制为 1，对 ENQCMD 和 ENQCMDS 的执行执行 PASID 转换。见第 28.5.9 节。如果此控制为 1，EPT 执行权限基于所访问的线性地址是管理模式还是用户模式。见第 31 章。 |
| 22  | Mode-based execute control for EPT | 如果此控制为 1，EPT 写权限可以以 128 字节的粒度指定。见第 31.3.4 节。 |
| 23  | Sub-page write permissions for EPT | —（续见下方） |
| 24  | Intel PT uses guest physical addresses | 如果此控制为 1，Intel 处理器追踪使用的所有输出地址都被视为客户物理地址并使用 EPT 转换。见第 28.5.4 节。 |
| 25  | Use TSC scaling | 此控制决定执行 RDTSC、执行 RDTSCP 以及（续见下方） |

从 IA32_TIME_STAMP_COUNTER MSR 读取的 RDMSR 执行是否返回由 TSC multiplier 字段修改的值（见第 27.6.5 节和第 28.3 节）。 |  
| 26 | Enable user wait and pause | 如果此控制为 0，TPAUSE、UMONITOR 或 UMWAIT 的任何执行都导致 #UD。 |  
| 27 | Enable PCONFIG | 如果此控制为 0，PCONFIG 的任何执行都导致 #UD。 |  
| 30 | VMM bus-lock detection | 此控制决定总线锁的断言是否导致 VM 退出。见第 28.2 节。 |  
| 31 | Instruction timeout | 如果此控制为 1，当某些操作阻止处理器在指定时间内到达指令边界时发生 VM 退出。见第 27.6.24 节和第 28.2 节。 |

此字段中的所有其他位保留为 0。软件应查阅 VMX 能力 MSR IA32_VMX_PROCBASED_CTLS2（见附录 A.3.3）以确定哪些位可以被设置为 1。未能清除保留位会导致后续 VM 进入失败（见第 29.2.1.1 节）。

主要基于处理器的 VM 执行控制的第 17 位决定是否使用三级基于处理器的 VM 执行控制。如果该位为 0，VM 进入和 VMX 非根操作的表现就像所有三级基于处理器的 VM 执行控制都为 0。仅支持主要基于处理器的 VM 执行控制的第 17 位的 0 设置的处理器不支持三级基于处理器的 VM 执行控制。

表 27-8 列出了三级基于处理器的 VM 执行控制。关于这些控制如何影响 VMX 非根操作中的处理器行为的更多详细信息，见第 27 章。

**表 27-8. 三级基于处理器的 VM 执行控制的定义**

| 位位置 | 名称  | 描述  |
| --- | --- | --- |
| 0   | LOADIWKEY exiting | 此控制决定 LOADIWKEY 的执行是否导致 VM 退出。 |
| 1   | Enable HLAT | 此控制启用虚拟机管理程序管理的线性地址转换（hypervisor-managed linear-address translation）。见第 5.5.1 节。 |
| 2   | EPT paging-write control | 如果此控制为 1，可以指定 EPT 权限仅允许与分页相关的更新进行写入。见第 31.3.3.2 节。 |
| 3   | Guest-paging verification | 如果此控制为 1，可以指定 EPT 权限以阻止使用其转换具有某些属性的线性地址进行访问。见第 31.3.3.2 节。 |
| 4   | IPI virtualization | 如果此控制为 1，启用处理器间中断（IPI）的虚拟化。见第 32.1.6 节。 |
| 5   | SEAM guest-physical address width | 此控制决定 SEAM 非根操作中 EPT 的操作。见第 35.3.2 节。 |
| 6   | Enable MSR-list instructions | 如果此控制为 0，RDMSRLIST 或 WRMSRLIST 的任何执行都导致 #UD。 |
| 7   | Virtualize IA32_SPEC_CTRL | 如果此控制为 1，访问 IA32_SPEC_CTRL MSR 时 RDMSR 和 WRMSR 指令的操作被改变。见第 26.3 节。 |
| 8   | APIC-timer virtualization | 如果此控制为 1，启用客户定时器事件，并且对 IA32_TSC_DEADLINE MSR 的访问被虚拟化。 |
| 9   | Enable PBNDKB | 如果此控制为 0，PBBNDKB 的任何执行都导致 #UD。 |
| 12  | PEBS uses guest physical addresses | 如果此控制为 1，架构 PEBS 使用的所有输出地址都被视为客户物理地址并使用 EPT 转换。见第 28.5.5 节。 |

此字段中的所有其他位保留为 0。软件应查阅 VMX 能力 MSR IA32_VMX_PROCBASED_CTLS3（见附录 A.3.4）以确定哪些位可以被设置为 1。未能清除保留位会导致后续 VM 进入失败（见第 29.2.1.1 节）。

### 27.6.3 异常位图

异常位图是一个 32 位字段，每个异常对应一位。当异常发生时，其向量用于选择此字段中的位。如果该位为 1，异常导致 VM 退出。如果该位为 0，异常使用异常的向量正常交付。

页故障（向量为 14 的异常）是否导致 VM 退出由异常位图中的第 14 位以及页故障产生的错误码和 VMCS 中的两个 32 位字段（页故障错误码掩码 page-fault error-code mask 和页故障错误码匹配 page-fault error-code match）决定。详见第 28.2 节。

### 27.6.4 I/O 位图地址

VM 执行控制字段包括 I/O 位图 A 和 B 的 64 位物理地址（每个大小为 4 KBytes）。I/O 位图 A 为范围 0000H 至 7FFFH 的每个 I/O 端口包含一位；I/O 位图 B 为范围 8000H 至 FFFFH 的端口包含位。

当且仅当"use I/O bitmaps"控制为 1 时，逻辑处理器使用这些位图。如果使用位图，当 I/O 位图中对应于其访问的端口的任何位为 1 时，I/O 指令的执行导致 VM 退出。详见第 28.1.3 节。如果使用位图，它们的地址必须 4-KByte 对齐。

### 27.6.5 时间戳计数器偏移和倍率

VM 执行控制字段包括一个 64 位 TSC-offset 字段。如果"RDTSC exiting"控制为 0 且"use TSC offsetting"控制为 1，此字段控制 RDTSC 和 RDTSCP 指令的执行。它还控制从 IA32_TIME_STAMP_COUNTER MSR 读取的 RDMSR 指令的执行。对于所有这些，TSC offset 的值被加到时间戳计数器的值上，和在 EDX:EAX 中返回给客户软件。

支持"use TSC scaling"控制的 1 设置的处理器也支持 64 位 TSC-multiplier 字段。如果此控制为 1（且"RDTSC exiting"控制为 0 且"use TSC offsetting"控制为 1），此字段也影响上述标识的 RDTSC、RDTSCP 和 RDMSR 指令的执行。具体来说，时间戳计数器的内容在加上 TSC offset 之前先乘以 TSC multiplier。

关于 RDTSC、RDTSCP 和 RDMSR 在 VMX 非根操作中的行为的详细处理，见第 27 章。

### 27.6.6 CR0 和 CR4 的客户/宿主掩码和读阴影

VM 执行控制字段包括 CR0 和 CR4 寄存器的客户/宿主掩码（guest/host masks）和读阴影（read shadows）。这些字段控制访问这些寄存器的指令的执行（包括 CLTS、LMSW、MOV CR 和 SMSW）。在支持 Intel 64 架构的处理器上它们是 64 位，在不支持的处理器上是 32 位。

一般来说，客户/宿主掩码中设置为 1 的位对应于宿主"拥有"的位：

-   客户（使用 CLTS、LMSW 或 MOV 到 CR）尝试将它们设置为与相应读阴影中相应位不同的值的操作导致 VM 退出。
-   客户读取（使用 MOV 从 CR 或 SMSW）为这些位从相应的读阴影返回值。

清除为 0 的位对应于客户"拥有"的位；客户修改它们的尝试成功，客户读取为这些位从控制寄存器本身返回值。

关于这些字段如何影响 VMX 非根操作的详细信息，见第 29 章。

### 27.6.7 CR3 目标控制

VM 执行控制字段包括一组 4 个 CR3-target 值和一个 CR3-target 计数。在支持 Intel 64 架构的处理器上，每个 CR3-target 值有 64 位，在不支持的处理器上有 32 位。CR3-target 计数在所有处理器上都有 32 位。

如果 VMX 非根操作中对 CR3 的 MOV 执行的源操作数与这些值之一匹配，则不会导致 VM 退出。如果 CR3-target 计数为 n，只考虑前 n 个 CR3-target 值；如果 CR3-target 计数为 0，对 CR3 的 MOV 总是导致 VM 退出。

可以写入的 CR3-target 值没有限制。如果 CR3-target 计数大于 4，VM 进入失败（见第 29.2 节）。

未来的处理器可能支持不同数量的 CR3-target 值。软件应读取 VMX 能力 MSR IA32_VMX_MISC（见附录 A.6）以确定支持的值数量。

### 27.6.8 APIC 虚拟化的控制

软件访问逻辑处理器本地 APIC 寄存器有三种机制：

-   如果本地 APIC 处于 xAPIC 模式，它可以对 IA32_APIC_BASE MSR 中物理地址引用的 4-KByte 页中的地址执行内存映射访问（见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 13.4.4 节"本地 APIC 状态和位置"以及《Intel® 64 架构处理器拓扑枚举技术论文》）。¹
-   如果本地 APIC 处于 x2APIC 模式，它可以使用 RDMSR 和 WRMSR 指令访问本地 APIC 的寄存器（见《Intel® 64 架构处理器拓扑枚举技术论文》）。
-   在 64 位模式下，它可以使用 MOV CR8 指令访问本地 APIC 的任务优先级寄存器（TPR）。

几个基于处理器的 VM 执行控制（见第 27.6.2 节）控制此类访问。它们是"use TPR shadow"、"virtualize APIC accesses"、"virtualize x2APIC mode"、"virtual-interrupt delivery"、"APIC-register virtualization"和"IPI virtualization"。这些控制与以下字段交互：

-   **APIC-access 地址（64 位）**。此字段包含 4-KByte APIC-access 页的物理地址。如果"virtualize APIC accesses" VM 执行控制为 1，对此页的访问可能导致 VM 退出或由处理器虚拟化。见第 32.4 节。  
    APIC-access 地址仅存在于支持"virtualize APIC accesses" VM 执行控制的 1 设置的处理器上。
-   **Virtual-APIC 地址（64 位）**。此字段包含 4-KByte virtual-APIC 页的物理地址。处理器使用 virtual-APIC 页来虚拟化对 APIC 寄存器的某些访问并管理虚拟中断；见第 32 章。  
    取决于前面指示的控制的设置，virtual-APIC 页可能被以下操作访问：
    -   MOV CR8 指令（见第 32.3 节）。
    -   如果此外"virtualize APIC accesses" VM 执行控制为 1，对 APIC-access 页的访问（见第 32.4 节）。
    -   如果此外 ECX 的值在 800H–8FFH 范围内（指示 APIC MSR）且"virtualize x2APIC mode" VM 执行控制为 1，RDMSR 和 WRMSR 指令（见第 32.5 节）。  
        如果"use TPR shadow" VM 执行控制为 1，VM 进入确保 virtual-APIC 地址是 4-KByte 对齐的。virtual-APIC 地址仅存在于支持"use TPR shadow" VM 执行控制的 1 设置的处理器上。
-   **TPR 阈值（32 位）**。此字段的第 3:0 位确定 VTPR 的第 7:4 位（见第 32.1.1 节）不能低于的阈值。如果"virtual-interrupt delivery" VM 执行控制为 0，在将这些位的值降低到 TPR 阈值以下的操作（例如，对 CR8 的 MOV 执行）之后发生 VM 退出。见第 32.1.2 节。  
    TPR 阈值仅存在于支持"use TPR shadow" VM 执行控制的 1 设置的处理器上。
-   **EOI-exit 位图（4 个字段；各 64 位）**。仅在支持"virtual-interrupt delivery" VM 执行控制的 1 设置的处理器上支持这些字段。它们用于确定对 APIC 的 EOI 寄存器的哪些虚拟化写入导致 VM 退出：
    -   EOI_EXIT0 包含向量 0（位 0）至 63（位 63）的位。
    -   EOI_EXIT1 包含向量 64（位 0）至 127（位 63）的位。
    -   EOI_EXIT2 包含向量 128（位 0）至 191（位 63）的位。
    -   EOI_EXIT3 包含向量 192（位 0）至 255（位 63）的位。  
        关于此字段使用的更多信息见第 32.1.4 节。
-   **Posted-interrupt 通知向量（16 位）**。仅在支持"process posted interrupts" VM 执行控制的 1 设置的处理器上支持此字段。其低 8 位包含用于通知逻辑处理器虚拟中断已被 posted 的中断向量。关于此字段使用的更多信息见第 32.6 节。
-   **Posted-interrupt 描述符地址（64 位）**。仅在支持"process posted interrupts" VM 执行控制的 1 设置的处理器上支持此字段。它是 64 字节对齐的 posted interrupt 描述符的物理地址。关于此字段使用的更多信息见第 32.6 节。
-   **PID-pointer 表地址（64 位）**。此字段包含 PID-pointer 表的物理地址。如果"IPI virtualization" VM 执行控制为 1，逻辑处理器使用此表中的条目来虚拟化 IPI。见第 32.1.6 节。
-   **最后 PID-pointer 索引（16 位）**。此字段包含 PID-pointer 表中最后一个条目的索引。

### 27.6.9 MSR 位图地址

在支持"use MSR bitmaps" VM 执行控制的 1 设置的处理器上，VM 执行控制字段包括四个连续 MSR 位图的 64 位物理地址，每个位图大小为 1-KByte。此字段不存在于不支持该控制的 1 设置的处理器上。这四个位图是：

-   **低 MSR 的读取位图（位于 MSR 位图地址）**。它为范围 00000000H 至 00001FFFH 的每个 MSR 地址包含一位。该位决定应用于该 MSR 的 RDMSR 执行是否导致 VM 退出。
-   **高 MSR 的读取位图（位于 MSR 位图地址加 1024）**。它为范围 C0000000H 至 C0001FFFH 的每个 MSR 地址包含一位。该位决定应用于该 MSR 的 RDMSR 执行是否导致 VM 退出。
-   **低 MSR 的写入位图（位于 MSR 位图地址加 2048）**。它为范围 00000000H 至 00001FFFH 的每个 MSR 地址包含一位。该位决定应用于该 MSR 的 WRMSR 执行是否导致 VM 退出。
-   **高 MSR 的写入位图（位于 MSR 位图地址加 3072）**。它为范围 C0000000H 至 C0001FFFH 的每个 MSR 地址包含一位。该位决定应用于该 MSR 的 WRMSR 执行是否导致 VM 退出。

当且仅当"use MSR bitmaps"控制为 1 时，逻辑处理器使用这些位图。如果使用位图，当 RCX 的值不在位图覆盖的两个范围内，或者 MSR 位图中适当的位（对应于指令和 RCX 值）为 1 时，RDMSR 或 WRMSR 的执行导致 VM 退出。详见第 28.1.3 节。如果使用位图，它们的地址必须 4-KByte 对齐。

### 27.6.10 Executive-VMCS 指针

executive-VMCS 指针是一个 64 位字段，用于系统管理中断（SMI）和系统管理模式（SMM）的双监视器处理。SMM VM 退出按第 34.15.2 节所述保存此字段。从 SMM 返回的 VM 进入按第 34.15.4 节所述使用此字段。

### 27.6.11 扩展页表指针（EPTP）

扩展页表指针（EPTP）包含控制客户物理地址转换的结构层级根部的 EPT 分页结构地址（见第 31.3.2 节），以及其他 EPT 配置信息。此字段的格式见表 27-9。

**表 27-9. 扩展页表指针的格式**

| 位位置 | 字段  |
| --- | --- |
| 2:0 | EPT 分页结构内存类型（见第 31.3.7 节）：0 = 不可缓存（UC）；6 = 写回（WB）。其他值保留。¹ |
| 5:3 | 此值比 EPT 页遍历长度小 1（见第 31.3.2 节） |
| 6   | 将此控制设置为 1 为 EPT 启用访问和脏标志（见第 31.3.5 节）² |
| 7   | 将此控制设置为 1 为管理模式影子栈页启用访问权限的强制执行（见第 31.3.3.2 节）³ |
| 11:8 | 保留  |
| M–1:12 | 4-KByte 对齐的 EPT 分页结构物理地址的第 M–1:12 位（4 级 EPT 时为 EPT PML4 表，5 级 EPT 时为 EPT PML5 表）⁴ |
| 63:M | 保留  |

> **注：**
> 
> 1.  软件应读取 VMX 能力 MSR IA32_VMX_EPT_VPID_CAP（见附录 A.10）以确定支持哪些 EPT 分页结构内存类型。
> 2.  并非所有处理器都支持 EPT 的访问和脏标志。软件应读取 VMX 能力 MSR IA32_VMX_EPT_VPID_CAP（见附录 A.10）以确定处理器是否支持此功能。
> 3.  并非所有处理器都为影子栈页强制执行访问权限。软件应读取 VMX 能力 MSR IA32_VMX_EPT_VPID_CAP（见附录 A.10）以确定处理器是否支持此功能。
> 4.  M 是 MAXPHYADDR 的缩写。见第 27-1 页的脚注 2。

EPTP 仅存在于支持"enable EPT" VM 执行控制的 1 设置的处理器上。

### 27.6.12 虚拟处理器标识符（VPID）

虚拟处理器标识符（VPID）是一个 16 位字段。它仅存在于支持"enable VPID" VM 执行控制的 1 设置的处理器上。关于此字段使用的详细信息见第 31.1 节。

### 27.6.13 PAUSE 循环退出的控制

在支持"PAUSE-loop exiting" VM 执行控制的 1 设置的处理器上，VM 执行控制字段包括以下 32 位字段：

-   **PLE_Gap**。软件可以将此字段配置为循环中两次连续 PAUSE 执行之间的时间上限。
-   **PLE_Window**。软件可以将此字段配置为客户被允许在 PAUSE 循环中执行的时间上限。

这些字段基于与时间戳计数器（TSC）相同速率运行的计数器来度量时间。关于 PAUSE-loop exiting 的更多详细信息见第 28.1.3 节。

### 27.6.14 VM 函数控制

VM 函数控制构成一个 64 位向量，管理 VMX 非根操作中 VMFUNC 指令的使用。此字段仅在支持"activate secondary controls"主要基于处理器的 VM 执行控制和"enable VM functions"次要基于处理器的 VM 执行控制的 1 设置的处理器上受支持。

表 27-10 列出了 VM 函数控制。关于这些控制如何影响 VMX 非根操作中的处理器行为的更多详细信息，见第 28.5.7 节。

**表 27-10. VM 函数控制的定义**

| 位位置 | 名称  | 描述  |
| --- | --- | --- |
| 0   | EPTP switching | EPTP-switching VM 函数将 EPT 指针改为从 EPTP 列表中选择的值。见第 28.5.7.3 节。 |

此字段中的所有其他位保留为 0。软件应查阅 VMX 能力 MSR IA32_VMX_VMFUNC（见附录 A.11）以确定哪些位被保留。未能清除保留位会导致后续 VM 进入失败（见第 29.2.1.1 节）。

支持"EPTP switching" VM 函数控制的 1 设置的处理器还支持一个称为 EPTP-list 地址的 64 位字段。此字段包含 4-KByte EPTP 列表的物理地址。EPTP 列表包含 512 个 8 字节条目（每个都是一个 EPTP 值），由 EPTP-switching VM 函数使用（见第 28.5.7.3 节）。

### 27.6.15 VMCS 影子位图地址

在支持"VMCS shadowing" VM 执行控制的 1 设置的处理器上，VM 执行控制字段包括 VMREAD 位图和 VMWRITE 位图的 64 位物理地址。每个位图大小为 4 KBytes，因此包含 32 KBits。这些地址是 VMREAD-bitmap 地址和 VMWRITE-bitmap 地址。

如果"VMCS shadowing" VM 执行控制为 1，VMREAD 和 VMWRITE 的执行可能查阅这些位图（见第 27.10 节和第 33.3 节）。

### 27.6.16 ENCLS-Exiting 位图

ENCLS-exiting 位图是一个 64 位字段。如果"enable ENCLS exiting" VM 执行控制为 1，当此字段中对应于 EAX 值的位为 1 时，ENCLS 的执行导致 VM 退出。如果该位为 0，指令正常执行。更多信息见第 28.1.3 节。

### 27.6.17 PCONFIG-Exiting 位图

PCONFIG-exiting 位图是一个 64 位字段。如果"enable PCONFIG" VM 执行控制为 1，当此字段中对应于 EAX 值的位为 1 时，PCONFIG 的执行导致 VM 退出。如果控制为 0，PCONFIG 的任何执行都导致 #UD。更多信息见第 28.1.3 节。

### 27.6.18 页修改日志的控制字段

PML 地址是一个 64 位字段。它是页修改日志的 4-KByte 对齐地址。页修改日志由 512 个 64 位条目组成。它用于页修改日志功能。页修改日志的详细信息见第 31.3.6 节。

如果"enable PML" VM 执行控制为 1，VM 进入确保 PML 地址是 4-KByte 对齐的。PML 地址仅存在于支持"enable PML" VM 执行控制的 1 设置的处理器上。

### 27.6.19 虚拟化异常的控制

在支持"EPT-violation #VE" VM 执行控制的 1 设置的处理器上，VM 执行控制字段包括以下内容：

-   **虚拟化异常信息地址（Virtualization-exception information address，64 位）**。此字段包含虚拟化异常信息区域的物理地址。当逻辑处理器遇到虚拟化异常时，它将虚拟化异常信息保存在虚拟化异常信息地址处；见第 28.5.8.2 节。
-   **EPTP 索引（EPTP index，16 位）**。当 EPT 违规导致虚拟化异常时，处理器将此字段的值写入虚拟化异常信息区域。EPTP-switching VM 函数更新此字段（见第 28.5.7.3 节）。

### 27.6.20 XSS-Exiting 位图

在支持"enable XSAVES/XRSTORS" VM 执行控制的 1 设置的处理器上，VM 执行控制字段包括一个 64 位 XSS-exiting 位图。如果"enable XSAVES/XRSTORS" VM 执行控制为 1，XSAVES 和 XRSTORS 的执行可能查阅此位图（见第 28.1.3 节和第 28.3 节）。

### 27.6.21 子页权限表指针（SPPTP）

如果启用 EPT 的子页写权限功能，EPT 写权限可以以 128 字节的粒度确定（见第 31.3.4 节）。这些权限使用内存中的子页权限结构层级确定。

此层级的根部由一个称为子页权限表指针（SPPTP）的 VM 执行控制字段引用。SPPTP 包含根 SPP 表基址的地址（见第 31.3.4.2 节）。此字段的格式见表 27-9（应为表 27-11）。

**表 27-11. 子页权限表指针的格式**

| 位位置 | 字段  |
| --- | --- |
| 11:0 | 保留  |
| M–1:12 | 4-KByte 对齐的根 SPP 表的物理地址的第 M–1:12 位¹ |
| 63:M | 保留  |

> **注：**
> 
> 1.  M 是 MAXPHYADDR 的缩写。见第 27-1 页的脚注 2。

SPPTP 仅存在于支持"sub-page write permissions for EPT" VM 执行控制的 1 设置的处理器上。

### 27.6.22 与虚拟机管理程序管理的线性地址转换相关的字段

当"enable HLAT" VM 执行控制为 1 时使用两个字段，启用 HLAT 分页：

-   **虚拟机管理程序管理的线性地址转换指针（HLAT pointer 或 HLATP）**。HLAT 分页使用它来定位和访问用于线性地址转换的第一个分页结构（见第 5.5 节）。此字段的格式见表 27-12。

**表 27-12. 虚拟机管理程序管理的线性地址转换指针的格式**

| 位位置 | 字段  |
| --- | --- |
| 2:0 | 保留  |
| 3（PWT） | 页级写穿（page-level write-through）；间接确定线性地址转换期间用于访问第一个 HLAT 分页结构的内存类型。 |
| 4（PCD） | 页级缓存禁用（page-level cache disable）；间接确定线性地址转换期间用于访问第一个 HLAT 分页结构的内存类型。 |
| 11:5 | 保留  |
| M–1:12 | 线性地址转换期间第一个 HLAT 分页结构的客户物理地址（4KB 对齐）。¹ |
| 63:M | 保留  |

> **注：**
> 
> 1.  M 是 MAXPHYADDR 的缩写。见第 27-1 页的脚注 2。

-   **HLAT 前缀大小**。此字段的值决定哪些线性地址受 HLAT 分页约束。见第 5.5.1 节。

这些字段仅存在于支持"enable HLAT" VM 执行控制的 1 设置的处理器上。

### 27.6.23 与 PASID 转换相关的字段

当"PASID translation" VM 执行控制为 1（为 ENQCMD 和 ENQCMDS 的执行启用 PASID 转换）时，使用两个 64 位 VM 执行控制字段：低 PASID 目录地址和高 PASID 目录地址。它们分别是低 PASID 目录和高 PASID 目录的物理地址。这些字段仅存在于支持"PASID translation" VM 执行控制的 1 设置的处理器上。

关于 ENQCMD 和 ENQCMDS 的 PASID 转换过程的信息，见第 28.5.9 节。

### 27.6.24 指令超时控制

在支持"instruction timeout" VM 执行控制的 1 设置的处理器上，VM 执行控制字段包括一个 32 位指令超时控制。处理器将此字段的值解释为以晶振时钟周期为单位度量的时间量。¹ 如果"instruction timeout" VM 执行控制为 1，当某些操作阻止处理器在此时间内到达指令边界时发生 VM 退出。

### 27.6.25 控制 IA32_SPEC_CTRL MSR 虚拟化的字段

在支持"virtualize IA32_SPEC_CTRL" VM 执行控制的 1 设置的处理器上，VM 执行控制字段包括以下 64 位字段：

-   **IA32_SPEC_CTRL 掩码**。在此字段中设置一位会阻止客户软件修改 IA32_SPEC_CTRL MSR 中的相应位。
-   **IA32_SPEC_CTRL 阴影**。此字段包含客户软件期望在 IA32_SPEC_CTRL MSR 中的值。

第 28.3 节讨论这些字段如何在 VMX 非根操作中使用。

### 27.6.26 控制 SEAM 非根操作的字段

在支持"SEAM guest-physical address width" VM 执行控制的 1 设置的处理器上，VM 执行控制字段包括以下字段：

-   **SEAM-guest KeyID**。此 32 位字段包含与用于为当前 SEAM 客户加密 SEAM 私有内存的密钥相关联的密钥标识符。
-   **SEAM 共享 EPT 指针**。此 64 位字段包含控制共享客户物理地址转换的结构层级根部的 EPT 分页结构地址。此字段的格式见表 27-13。

**表 27-13. SEAM 共享 EPT 指针的格式**

| 位位置 | 字段  |
| --- | --- |
| 11:0 | 保留  |
| M–1:12 | 4-KByte 对齐的 EPT 分页结构（4 级 EPT 时为 EPT PML4 表，5 级 EPT 时为 EPT PML5 表）的物理地址的第 M–1:12 位¹ |
| 63:M | 保留  |

> **注：**
> 
> 1.  M 是 CPUID.80000008H:EAX\[7:0\] 枚举的值。

这些字段控制 SEAM 非根操作。它们在 SEAM 之外被忽略。

### 27.6.27 控制 APIC 定时器虚拟化的字段

在支持"APIC-timer virtualization" VM 执行控制的 1 设置的处理器上，VM 执行控制字段包括以下字段：

-   **客户截止时间阴影（Guest deadline shadow）**。此 64 位字段包含相对于客户对时间戳计数器的虚拟化视图的客户截止时间。
-   **虚拟定时器向量（Virtual timer vector，16 位）**。此字段的低 8 位包含用于虚拟定时器中断的向量。

## 27.7 VM 退出控制字段

VM 退出控制字段管理 VM 退出的行为。它们在第 27.7.1 节和第 27.7.2 节中讨论。

### 27.7.1 VM 退出控制

VM 退出控制构成两个向量，管理 VM 退出的基本操作。它们是主要 VM 退出控制（32 位）和次要 VM 退出控制（64 位）。

表 27-14 列出了主要 VM 退出控制。关于这些控制如何影响 VM 退出的完整详细信息，见第 29 章。

**表 27-14. 主要 VM 退出控制的定义**

| 位位置 | 名称  | 描述  |
| --- | --- | --- |
| 2   | Save debug controls | 此控制决定 DR7 和 IA32_DEBUGCTL MSR 是否在 VM 退出时保存。首批支持虚拟机扩展的处理器仅支持此控制的 1 设置。 |
| 9   | Host address-space size | 在支持 Intel 64 架构的处理器上，此控制决定逻辑处理器在下一次 VM 退出后是否处于 64 位模式。它的值在每次 VM 退出时被加载到 CS.L、IA32_EFER.LME 和 IA32_EFER.LMA。¹ 在不支持 Intel 64 架构的处理器上，此控制必须为 0。 |
| 12  | Load IA32_PERF_GLOBAL_CTRL | 此控制决定 IA32_PERF_GLOBAL_CTRL MSR 是否在 VM 退出时加载。 |
| 15  | Acknowledge interrupt on exit | 此控制影响由外部中断导致的 VM 退出：  <br>• 如果发生此类 VM 退出且此控制为 1，逻辑处理器确认中断控制器，获取中断的向量。向量存储在退出事件标识字段中，该字段被标记为有效。  <br>• 如果发生此类 VM 退出且此控制为 0，中断不被确认，退出事件标识字段被标记为无效。 |
| 18  | Save IA32_PAT | 此控制决定 IA32_PAT MSR 是否在 VM 退出时保存。 |
| 19  | Load IA32_PAT | 此控制决定 IA32_PAT MSR 是否在 VM 退出时加载。 |
| 20  | Save IA32_EFER | 此控制决定 IA32_EFER MSR 是否在 VM 退出时保存。 |
| 21  | Load IA32_EFER | 此控制决定 IA32_EFER MSR 是否在 VM 退出时加载。 |
| 22  | Save VMX-preemption timer value | 此控制决定 VMX 抢占定时器的值是否在 VM 退出时保存。 |
| 23  | Clear IA32_BNDCFGS | 此控制决定 IA32_BNDCFGS MSR 是否在 VM 退出时清除。 |
| 24  | Conceal VMX from PT | 如果此控制为 1，Intel 处理器追踪在 VM 退出时不产生分页信息包（PIP），在 SMM VM 退出时不产生 VMCS 包（见第 36 章）。 |
| 25  | Clear IA32_RTIT_CTL | 此控制决定 IA32_RTIT_CTL MSR 是否在 VM 退出时清除。 |
| 26  | Clear IA32_LBR_CTL | 此控制决定 IA32_LBR_CTL MSR 是否在 VM 退出时清除。 |
| 27  | Clear UINV | 此控制决定 UINV 是否在 VM 退出时清除。 |
| 28  | Load CET state | 此控制决定与 CET 相关的 MSR 和 SSP 是否在 VM 退出时加载。 |
| 29  | Load PKRS | 此控制决定 IA32_PKRS MSR 是否在 VM 退出时加载。 |
| 30  | Save IA32_PERF_GLOBAL_CTL | 此控制决定 IA32_PERF_GLOBAL_CTL MSR 是否在 VM 退出时保存。 |
| 31  | Activate secondary controls | 此控制决定是否使用次要 VM 退出控制。如果此控制为 0，逻辑处理器的表现就像所有次要 VM 退出控制也为 0。 |

> **注：**
> 
> 1.  由于 Intel 64 架构规定 IA32_EFER.LMA 总是设置为 CR0.PG 和 IA32_EFER.LME 的逻辑与，且由于 CR0.PG 在 VMX 根操作中总是为 1，IA32_EFER.LMA 在 VMX 根操作中总是与 IA32_EFER.LME 相同。

此字段中的所有其他位保留，有些固定为 0，有些固定为 1。软件应查阅 VMX 能力 MSR IA32_VMX_EXIT_CTLS 和 IA32_VMX_TRUE_EXIT_CTLS（见附录 A.4）以确定应如何设置保留位。未能正确设置保留位会导致后续 VM 进入失败（见第 29.2.1.2 节）。

首批支持虚拟机扩展的处理器仅支持位 0–8、10、11、13、14、16 和 17 的 1 设置。VMX 能力 MSR IA32_VMX_EXIT_CTLS 总是报告这些位必须为 1。支持这些位中任何一个的 0 设置的逻辑处理器将支持 VMX 能力 MSR IA32_VMX_TRUE_EXIT_CTLS MSR，软件应查阅此 MSR 以发现这些位的 0 设置的支持。不了解这些位中任何一个功能的软件应将该位设置为 1。

主要基于处理器的 VM 退出控制的第 31 位决定是否使用次要 VM 退出控制。如果该位为 0，VM 进入和 VM 退出的表现就像所有次要 VM 退出控制都为 0。仅支持主要 VM 退出控制的第 31 位的 0 设置的处理器不支持次要 VM 退出控制。

表 27-15 列出了次要 VM 退出控制。关于这些控制如何影响 VM 退出的更多详细信息，见第 29 章。

**表 27-15. 次要 VM 退出控制的定义**

| 位位置 | 名称  | 描述  |
| --- | --- | --- |
| 0   | Save FRED | 此控制决定 FRED MSR 是否在 VM 退出时保存。 |
| 1   | Load FRED | 此控制决定 FRED MSR 是否在 VM 退出时加载。 |
| 2   | Load IA32_SPEC_CTRL | 此控制决定 IA32_SPEC_CTRL MSR 是否在 VM 退出时加载。 |
| 3   | Prematurely busy shadow stack | 如果此控制为 1，导致影子栈过早繁忙（prematurely busy）的 VM 退出（见《Intel® 64 和 IA-32 架构（续） |

软件开发手册》第 1 卷）指示此事实并将额外信息保存到 VMCS。 |

此字段中的所有其他位保留为 0。软件应查阅 VMX 能力 MSR IA32_VMX_EXIT_CTLS2（见附录 A.4.2）以确定哪些位可以被设置为 1。未能清除保留位会导致后续 VM 进入失败（见第 29.2.1.2 节）。

### 27.7.2 MSR 的 VM 退出控制

VMM 可以指定要在 VM 退出时存储和加载的 MSR 列表。以下 VM 退出控制字段决定 MSR 在 VM 退出时如何存储：

-   **VM-exit MSR-store 计数（32 位）**。此字段指定要在 VM 退出时存储的 MSR 数量。建议此计数不超过 512。¹ 否则，VM 退出期间可能导致不可预测的处理器行为（包括机器检查）。
-   **VM-exit MSR-store 地址（64 位）**。此字段包含 VM-exit MSR-store 区域的物理地址。该区域是一个条目表，每个条目 16 字节，条目数由 VM-exit MSR-store 计数给出。每个条目的格式见表 27-16。如果 VM-exit MSR-store 计数不为零，地址必须 16 字节对齐。

**表 27-16. MSR 条目的格式**

| 位位置 | 内容  |
| --- | --- |
| 31:0 | MSR 索引 |
| 63:32 | 保留  |
| 127:64 | MSR 数据 |

关于此区域在 VM 退出时如何使用，见第 30.4 节。

以下 VM 退出控制字段决定 MSR 在 VM 退出时如何加载：

-   **VM-exit MSR-load 计数（32 位）**。此字段包含要在 VM 退出时加载的 MSR 数量。建议此计数不超过 512。否则，VM 退出期间可能导致不可预测的处理器行为（包括机器检查）。²
-   **VM-exit MSR-load 地址（64 位）**。此字段包含 VM-exit MSR-load 区域的物理地址。该区域是一个条目表，每个条目 16 字节，条目数由 VM-exit MSR-load 计数给出（见表 27-16）。如果 VM-exit MSR-load 计数不为零，地址必须 16 字节对齐。

关于此区域在 VM 退出时如何使用，见第 30.6 节。

## 27.8 VM 进入控制字段

VM 进入控制字段管理 VM 进入的行为。它们在第 27.8.1 节至第 27.8.3 节中讨论。

### 27.8.1 VM 进入控制

VM 进入控制构成一个 32 位向量，管理 VM 进入的基本操作。表 27-17 列出了支持的控制。关于这些控制如何影响 VM 进入，见第 27 章。

此字段中的所有其他位保留，有些固定为 0，有些固定为 1。软件应查阅 VMX 能力 MSR IA32_VMX_ENTRY_CTLS 和 IA32_VMX_TRUE_ENTRY_CTLS（见附录 A.5）以确定应如何设置保留位。未能正确设置保留位会导致后续 VM 进入失败（见第 29.2.1.3 节）。

首批支持虚拟机扩展的处理器仅支持位 0–8 和 12 的 1 设置。VMX 能力 MSR IA32_VMX_ENTRY_CTLS 总是报告这些位必须为 1。支持这些位中任何一个的 0 设置的逻辑处理器将支持 VMX 能力 MSR IA32_VMX_TRUE_ENTRY_CTLS MSR，软件应查阅此 MSR 以发现这些位的 0 设置的支持。不了解这些位中任何一个功能的软件应将该位设置为 1。

**表 27-17. VM 进入控制的定义**

| 位位置 | 名称  | 描述  |
| --- | --- | --- |
| 2   | Load debug controls | 此控制决定 DR7 和 IA32_DEBUGCTL MSR 是否在 VM 进入时加载。首批支持虚拟机扩展的处理器仅支持此控制的 1 设置。 |
| 9   | IA-32e mode guest | 在支持 Intel 64 架构的处理器上，此控制决定逻辑处理器在 VM 进入后是否处于 IA-32e 模式。它的值作为 VM 进入的一部分被加载到 IA32_EFER.LMA。¹ 在不支持 Intel 64 架构的处理器上，此控制必须为 0。 |
| 10  | Entry to SMM | 此控制决定逻辑处理器在 VM 进入后是否处于系统管理模式（SMM）。对于任何从 SMM 外部进行的 VM 进入，此控制必须为 0。 |
| 11  | Deactivate dual-monitor treatment | 如果设置为 1，VM 进入后 SMI 和 SMM 的默认处理生效（见第 34.15.7 节）。对于任何从 SMM 外部进行的 VM 进入，此控制必须为 0。此控制决定 IA32_PERF_GLOBAL_CTRL MSR 是否在 VM 进入时加载。 |
| 13  | Load IA32_PERF_GLOBAL_CTRL | 此控制决定 IA32_PERF_GLOBAL_CTRL MSR 是否在 VM 进入时加载。 |
| 14  | Load IA32_PAT | 此控制决定 IA32_PAT MSR 是否在 VM 进入时加载。 |
| 15  | Load IA32_EFER | 此控制决定 IA32_EFER MSR 是否在 VM 进入时加载。 |
| 16  | Load IA32_BNDCFGS | 此控制决定 IA32_BNDCFGS MSR 是否在 VM 进入时加载。 |
| 17  | Conceal VMX from PT | 如果此控制为 1，Intel 处理器追踪在 VM 进入时不产生分页信息包（PIP），在从 SMM 返回的 VM 进入时不产生 VMCS 包（见第 36 章）。 |
| 18  | Load IA32_RTIT_CTL | 此控制决定 IA32_RTIT_CTL MSR 是否在 VM 进入时加载。 |
| 19  | Load UINV | 此控制决定 UINV 是否在 VM 进入时加载。 |
| 20  | Load CET state | 此控制决定与 CET 相关的 MSR 和 SSP 是否在 VM 进入时加载。 |
| 21  | Load guest IA32_LBR_CTL | 此控制决定 IA32_LBR_CTL MSR 是否在 VM 进入时加载。 |
| 22  | Load PKRS | 此控制决定 IA32_PKRS MSR 是否在 VM 进入时加载。 |
| 23  | Load FRED | 此控制决定 FRED MSR 是否在 VM 进入时加载。 |
| 24  | Load IA32_SPEC_CTRL | 此控制决定 IA32_SPEC_CTRL MSR 是否在 VM 进入时加载。 |
| 25  | Allow SEAM-guest telemetry | 如果设置为 1，在进入 SEAM 非根操作的 VM 进入时可以启用核心带外遥测。见第 20.21.1 节。 |

> **注：**
> 
> 1.  在任何支持"unrestricted guest" VM 执行控制的 1 设置的逻辑处理器上，IA32_VMX_MISC MSR 的第 5 位读取为 1。如果它读取为 1，每次 VM 退出都将 IA32_EFER.LMA 的值存储到"IA-32e mode guest" VM 进入控制（见第 30.2 节）。

MSR，软件应查阅此 MSR 以发现这些位的 0 设置的支持。不了解这些位中任何一个功能的软件应将该位设置为 1。

### 27.8.2 MSR 的 VM 进入控制

VMM 可以指定要在 VM 进入时加载的 MSR 列表。以下 VM 进入控制字段管理此功能：

-   **VM-entry MSR-load 计数（32 位）**。此字段包含要在 VM 进入时加载的 MSR 数量。建议此计数不超过 512。否则，VM 进入期间可能导致不可预测的处理器行为（包括机器检查）。¹
-   **VM-entry MSR-load 地址（64 位）**。此字段包含 VM-entry MSR-load 区域的物理地址。该区域是一个条目表，每个条目 16 字节，条目数由 VM-entry MSR-load 计数给出。条目的格式在表 27-16 中描述。如果 VM-entry MSR-load 计数不为零，地址必须 16 字节对齐。

关于此区域在 VM 进入时如何使用的详细信息，见第 29.4 节。

### 27.8.3 事件注入的 VM 进入控制

可以将 VM 进入配置为以交付一个事件结束（在所有客户状态和 MSR 已加载之后）。此过程称为事件注入（event injection），由以下三个 VM 进入控制字段控制：

-   **注入事件标识字段（Injected-event identification field，32 位）**。此字段提供关于要注入的事件的详细信息。表 27-18 描述了该字段。¹

**表 27-18. 注入事件标识字段的格式**

| 位位置 | 内容  |
| --- | --- |
| 7:0 | 中断或异常的向量 |
| 10:8 | 事件类型：¹  <br>0：外部中断  <br>1：保留  <br>2：非可屏蔽中断（NMI）  <br>3：硬件异常（例如，#PF）  <br>4：软件中断（INT n）  <br>5：特权软件异常（INT1）  <br>6：软件异常（INT3 或 INTO）  <br>7：其他事件 |
| 11  | 交付错误码（0 = 不交付；1 = 交付） |
| 12  | 保留  |
| 13  | 嵌套异常（仅当 IA32_VMX_BASIC\[58\] = 1 时才可以设置） |
| 30:14 | 保留  |
| 31  | 有效（Valid） |

> **注：**
> 
> 1.  本文档的旧版本将此子字段称为中断类型（interruption type）。

-   向量（第 7:0 位）标识被注入的中断或异常，或标识注入的是哪个其他事件。
-   事件类型（第 10:8 位）决定注入执行的详细信息。一般来说，对于除以下异常之外的所有异常，VMM 应使用硬件异常类型：
    -   断点异常（#BP；VMM 应使用软件异常类型）；
    -   溢出异常（#OF；VMM 应使用软件异常类型）；以及
    -   由 INT1 生成的调试异常（#DB）（VMM 应使用特权软件异常类型）。²  
        其他事件（other event）类型用于注入不通过 IDT 交付的事件。³
-   对于异常，交付错误码位（第 11 位）决定交付是否将错误码压入客户栈。

> **注：**  
> 2\. 所有其他调试异常应使用硬件异常类型。  
> 3\. INT1 和 INT3 分别指操作码为 F1 和 CC 的指令，而不是指 n 的值为 1 或 3 的 INT n。

-   对于异常，嵌套异常位（第 13 位）指示 VM 进入应将注入的事件视为在交付另一个事件时嵌套的异常。仅当 IA32_VMX_BASIC\[58\] = 1 时才可以设置此位。
    
-   当且仅当有效位（第 31 位）为 1 时，VM 进入注入事件。此字段中的有效位在每次 VM 退出时被清除（见第 30.2 节）。
    
-   **注入事件异常错误码（Injected-event exception error code，32 位）**。当且仅当注入事件标识字段中的有效位（第 31 位）和交付错误码位（第 11 位）都被设置时使用此字段。¹
    
-   **注入事件数据（Injected-event data，64 位）**。当且仅当注入事件标识字段中的有效位被设置且 VM 进入后 FRED 转换将被启用时使用此字段。
    
-   **VM-entry 指令长度（32 位）**。对于事件类型为软件中断、软件异常或特权软件异常的注入，此字段用于确定压入栈的 RIP 的值。当 FRED 转换将被启用时，它也用于 SYSCALL 和 SYSEXIT 的注入。
    

关于事件注入机制的详细信息（包括事件类型、嵌套异常位和 VM-entry 指令长度的使用），见第 29.6 节。

VM 退出清除注入事件标识字段中的有效位（第 31 位）。

## 27.9 VM 退出信息字段

VMCS 包含一组包含最近一次 VM 退出信息的字段。

在某些处理器上，使用 VMWRITE 写入这些字段的尝试会失败（见第 32 章"VMWRITE——向虚拟机控制结构写入字段"）。²

### 27.9.1 基本 VM 退出信息

以下 VM 退出信息字段提供关于 VM 退出的基本信息：

-   **退出原因（Exit reason，32 位）**。此字段编码 VM 退出的原因，其结构见表 27-19。

**表 27-19. 退出原因的格式**

| 位位置 | 内容  |
| --- | --- |
| 15:0 | 基本退出原因。 |
| 16  | 总是清除为 0。 |
| 24:17 | 当前未定义。 |
| 25  | VM 退出保存此位为 1 以指示该 VM 退出导致影子栈过早繁忙。 |
| 26  | VM 退出保存此位为 1 以指示该 VM 退出发生在"VMM bus-lock detection" VM 执行控制为 1 时断言总线锁之后。 |
| 27  | VM 退出保存此位为 1 以指示该 VM 退出与飞地模式相关。 |
| 28  | 挂起的 MTF VM 退出。 |
| 29  | 从 VMX 根操作退出。 |
| 30  | 当前未定义。 |
| 31  | VM 进入失败（0 = 真正的 VM 退出；1 = VM 进入失败） |

-   第 15:0 位提供关于 VM 退出原因（如果第 31 位清除）或 VM 进入失败原因（如果第 31 位设置）的基本信息。附录 C 列举了基本退出原因。
-   第 16 位总是清除为 0。
-   如果"prematurely busy shadow stack" VM 退出控制为 1 且 VM 退出导致影子栈过早繁忙（见第 28.4.3 节），第 25 位被设置为 1。否则，该位被清除。
-   如果 VM 退出发生在"VMM bus-lock detection" VM 执行控制为 1 时断言总线锁之后，第 26 位被设置为 1。此类 VM 退出包括由于该控制的 1 设置而发生的 VM 退出，以及可能在断言了总线锁的指令执行期间发生的其他 VM 退出。
-   如果 VM 退出发生在逻辑处理器处于飞地模式时，第 27 位被设置为 1。详见第 30.2.1 节。
-   第 28 位仅由优先于 MTF VM 退出（见第 28.5.2 节）的 SMM VM 退出（见第 34.15.2 节）设置——如果 SMM VM 退出没有发生，该 MTF VM 退出本会发生。见第 34.15.2.3 节。
-   当且仅当 VM 退出发生时处理器处于 VMX 根操作时，第 29 位被设置。这种情况只能发生在 SMM VM 退出。见第 34.15.2 节。

由于某些 VM 进入失败从宿主状态区域加载处理器状态（见第 29.8 节），软件必须能够区分此类情况与真正的 VM 退出。第 31 位用于此目的。

-   **退出资格（Exit qualification，64 位；在不支持 Intel 64 架构的处理器上为 32 位）**。此字段包含关于以下原因导致的 VM 退出的附加信息：调试异常；页故障异常；启动 IPI（SIPI）；任务切换；INVEPT；INVLPG；INVVPID；LGDT；LIDT；LLDT；LTR；SGDT；SIDT；SLDT；STR；VMCLEAR；VMPTRLD；VMPTRST；VMREAD；VMWRITE；VMXON；XRSTORS；XSAVES；控制寄存器访问；MOV DR；I/O 指令；以及 MWAIT。该字段的格式取决于 VM 退出的原因。详见第 30.2.1 节。
-   **客户线性地址（Guest-linear address，64 位；在不支持 Intel 64 架构的处理器上为 32 位）**。此字段用于以下情况：
    -   由于尝试使用内存操作数执行 LMSW 导致的 VM 退出。
    -   由于尝试执行 INS 或 OUTS 导致的 VM 退出。
    -   由于在 I/O 指令退休后立即到达的系统管理中断（SMI）导致的 VM 退出。
    -   某些由 EPT 违规导致的 VM 退出。  
        关于此字段何时以及如何使用，见第 30.2.1 节和第 34.15.2.3 节。
-   **客户物理地址（Guest-physical address，64 位）**。此字段用于由 EPT 违规和 EPT 误配置导致的 VM 退出。关于此字段何时以及如何使用的详细信息，见第 30.2.1 节。

### 27.9.2 由向量事件导致的 VM 退出的信息

对于由以下向量事件导致的 VM 退出，提供事件特定信息：异常（包括由指令 INT3、INTO、INT1、BOUND、UD0、UD1、UD2 和 UDB 生成的异常）；在"acknowledge interrupt on exit" VM 退出控制为 1 时发生的外部中断；以及非可屏蔽中断（NMI）。此信息在以下字段中提供：

-   **退出事件标识（Exiting-event identification，32 位）**。此字段接收与导致 VM 退出的事件相关联的基本信息。表 27-20 描述了此字段。¹

**表 27-20. 退出事件标识字段的格式**

| 位位置 | 内容  |
| --- | --- |
| 7:0 | 中断或异常的向量 |
| 10:8 | 事件类型：¹  <br>0：外部中断  <br>1：不使用  <br>2：非可屏蔽中断（NMI）  <br>3：硬件异常  <br>4：不使用  <br>5：特权软件异常  <br>6：软件异常  <br>7：不使用 |
| 11  | 错误码有效（0 = 无效；1 = 有效） |
| 12  | 由 IRET 导致的 NMI 解除阻止 |
| 13  | 嵌套异常（在 FRED 事件交付期间） |
| 30:14 | 当前未定义 |
| 31  | 有效  |

> **注：**
> 
> 1.  本文档的旧版本将此子字段称为中断类型（interruption type）。

-   **退出事件错误码（Exiting-event error code，32 位）**。对于由本会在栈上交付错误码的硬件异常导致的 VM 退出，此字段接收该错误码。¹

第 30.2.2 节提供了这些字段在 VM 退出时如何保存的详细信息。

### 27.9.3 在事件交付期间发生的 VM 退出的信息

对于在 VMX 非根操作中事件交付期间发生的 VM 退出，提供附加信息。² 此信息在以下字段中提供：

-   **原始事件标识（Original-event identification，32 位）**。此字段接收与 VM 退出发生时正在被交付的事件相关联的基本信息。表 27-21 描述了此字段。³

**表 27-21. 原始事件标识字段的格式**

| 位位置 | 内容  |
| --- | --- |
| 7:0 | 中断或异常的向量 |
| 10:8 | 事件类型：¹  <br>0：外部中断  <br>1：不使用  <br>2：非可屏蔽中断（NMI）  <br>3：硬件异常  <br>4：软件中断  <br>5：特权软件异常  <br>6：软件异常  <br>7：不使用 |
| 11  | 错误码有效（0 = 无效；1 = 有效） |
| 12  | 当前未定义 |
| 13  | 在 FRED 事件交付上嵌套的异常 |
| 30:14 | 当前未定义 |
| 31  | 有效  |

> **注：**
> 
> 1.  本文档的旧版本将此子字段称为中断类型（interruption type）。

-   **原始事件错误码（Original-event error code，32 位）**。对于在本会在栈上交付错误码的硬件异常交付期间发生的 VM 退出，此字段接收该错误码。¹
-   **原始事件数据（Original-event data，64 位）**。对于在 FRED 事件交付期间发生的 VM 退出，此字段接收该交付本会保存到栈上的事件数据。

第 30.2.4 节提供了这些字段在 VM 退出时如何保存的详细信息。

### 27.9.4 由指令执行导致的 VM 退出的信息

以下字段用于由在 VMX 非根操作中尝试执行某些指令导致的 VM 退出：

-   **VM-exit 指令长度（VM-exit instruction length，32 位）**。对于由指令执行导致的 VM 退出，此字段接收其执行导致 VM 退出的指令的字节长度。² 关于此字段何时以及如何使用的详细信息，见第 30.2.5 节。
-   **VM-exit 指令信息（VM-exit instruction information，32 位）**。此字段用于由尝试执行 INS、INVEPT、INVVPID、LIDT、LGDT、LLDT、LTR、OUTS、SIDT、SGDT、SLDT、STR、VMCLEAR、VMPTRLD、VMPTRST、VMREAD、VMWRITE 或 VMXON 导致的 VM 退出。³ 该字段的格式取决于 VM 退出的原因。详见第 30.2.5 节。

以下字段（各 64 位；在不支持 Intel 64 架构的处理器上为 32 位）仅用于由在 I/O 指令退休后立即到达的 SMI 导致的 VM 退出。它们提供关于该 I/O 指令的信息：

-   **I/O RCX**。I/O 指令开始前 RCX 的值。
-   **I/O RSI**。I/O 指令开始前 RSI 的值。
-   **I/O RDI**。I/O 指令开始前 RDI 的值。
-   **I/O RIP**。I/O 指令开始前 RIP 的值（寻址 I/O 指令的 RIP）。

如果 WRMSRLIST 的执行写入一个由于 MSR 位图内容而不能写入的 MSR（见第 28.1.3 节），则导致 VM 退出。此类 VM 退出将本会写入 MSR 的数据保存在一个称为 MSR data 的 64 位字段中。此字段仅在支持"enable MSR-list instructions" VM 执行控制的 1 设置的处理器上受支持。

### 27.9.5 VM 指令错误字段

32 位 VM 指令错误字段不提供关于最近一次 VM 退出的信息。事实上，它在 VM 退出时不被修改。相反，它提供关于 VMX 指令之一的无故障执行所遇到的错误的信息。

## 27.10 VMCS 类型：普通和影子

每个 VMCS 要么是普通 VMCS，要么是影子 VMCS。VMCS 的类型由 VMCS 区域中的影子 VMCS 指示符确定（即 VMCS 区域前 4 个字节的第 31 位的值；见表 27-1）：0 表示普通 VMCS，1 表示影子 VMCS。影子 VMCS 仅在支持"VMCS shadowing" VM 执行控制的 1 设置的处理器上受支持（见第 27.6.2 节）。

影子 VMCS 在两个方面与普通 VMCS 不同：

-   普通 VMCS 可以用于 VM 进入，但影子 VMCS 不能。当当前 VMCS 是影子 VMCS 时尝试执行 VM 进入会失败（见第 29.1 节）。
-   VMREAD 和 VMWRITE 指令可以在 VMX 非根操作中使用来访问影子 VMCS，但不能访问普通 VMCS。此事实源于以下原因：
    -   如果"VMCS shadowing" VM 执行控制为 0，VMX 非根操作中 VMREAD 和 VMWRITE 指令的执行总是导致 VM 退出（见第 28.1.3 节）。
    -   如果"VMCS shadowing" VM 执行控制为 1，VMX 非根操作中 VMREAD 和 VMWRITE 指令的执行可以访问 VMCS 链接指针引用的 VMCS（见第 33.3 节）。
    -   如果"VMCS shadowing" VM 执行控制为 1，VM 进入确保 VMCS 链接指针引用的任何 VMCS 都是影子 VMCS（见第 29.3.1.5 节）。

在 VMX 根操作中，两种类型的 VMCS 都可以使用 VMREAD 和 VMWRITE 指令访问。

软件不应修改活动的 VMCS 的 VMCS 区域中的影子 VMCS 指示符。这样做可能导致 VMCS 损坏（见第 27.11.1 节）。在修改影子 VMCS 指示符之前，软件应对该 VMCS 执行 VMCLEAR 以确保它不是活动的。

## 27.11 软件对 VMCS 及相关结构的使用

本节详述软件在使用 VMCS 和相关结构时应遵守的准则。它还提供了不遵守准则的后果描述。

### 27.11.1 软件对虚拟机控制结构的使用

为确保正确的处理器行为，软件在使用活动 VMCS 时应遵守某些准则。

任何 VMCS 都不应在多个逻辑处理器上同时活动。如果要将 VMCS 从一个逻辑处理器"迁移"到另一个，第一个逻辑处理器应对该 VMCS 执行 VMCLEAR（使其在该逻辑处理器上不活动，并确保所有 VMCS 数据在内存中），然后另一个逻辑处理器再对该 VMCS 执行 VMPTRLD（使其在第二个逻辑处理器上活动）。¹ 在多个逻辑处理器上变为活动的 VMCS 可能损坏（见下文）。

软件不应修改活动的 VMCS 的 VMCS 区域中的影子 VMCS 指示符（见表 27-1）。这样做可能导致 VMCS 损坏。在修改影子 VMCS 指示符之前，软件应对该 VMCS 执行 VMCLEAR 以确保它不是活动的。

软件应使用 VMREAD 和 VMWRITE 指令访问当前 VMCS 中的不同字段（见第 27.11.2 节）。软件绝不应使用普通内存操作访问或修改活动 VMCS 的 VMCS 数据，部分原因是用于存储 VMCS 数据的格式是实现特定的且未经架构定义，还因为逻辑处理器可能在处理器上维护活动 VMCS 的某些 VMCS 数据而不是在 VMCS 区域中。以下条目详述了使用普通内存操作访问 VMCS 数据的一些危害：

-   使用普通内存读取从 VMCS 读取的任何数据都不能可靠地反映 VMCS 的状态。结果可能因时而异或因逻辑处理器而异。
-   使用普通内存写入向 VMCS 写入不能保证对 VMCS 具有确定性的影响。这样做可能导致 VMCS 损坏（见下文）。

（软件可以通过在对 VMCS 区域执行 VMPTRLD 之前移除对该区域的任何线性地址映射，并在对该区域执行 VMCLEAR 之后才重新映射来避免这些危害。）

如果逻辑处理器离开 VMX 操作，该逻辑处理器上活动的任何 VMCS 都可能损坏（见下文）。为防止可能在返回 VMX 操作后或另一个逻辑处理器上使用的 VMCS 发生此类损坏，软件应在执行 VMXOFF 指令或移除处理器电源（例如，作为转换到 S3 和 S4 电源状态的一部分）之前对该 VMCS 执行 VMCLEAR。

本节已标识了可能导致 VMCS 损坏的操作。这些操作可能导致 VMCS 的数据变得未定义。如果该 VMCS 随后在任何逻辑处理器上使用，行为可能不可预测。以下条目详述了 VMCS 损坏的一些危害：

-   VM 进入可能因无法解释的原因失败，或可能加载不期望的处理器状态。
-   处理器可能无法正确支持第 27 章所述文档化的 VMX 非根操作，并可能生成意外的 VM 退出。
-   VM 退出可能加载不期望的处理器状态、将错误状态保存到 VMCS，或导致逻辑处理器转换到关闭状态。

### 27.11.2 VMREAD、VMWRITE 和 VMCS 字段的编码

VMCS 的每个字段都关联一个 32 位值，即其编码。当软件希望读取或写入该字段时，编码作为操作数提供给 VMREAD 和 VMWRITE。在 64 位模式下，如果给这些指令提供设置编码位超出第 32 位的操作数，它们会失败。关于这些指令的描述见第 32 章。

VMCS 组件的 32 位编码的结构主要由字段的宽度及其在 VMCS 中的功能决定。见表 27-22。

**表 27-22. VMCS 组件编码的结构**

| 位位置 | 内容  |
| --- | --- |
| 0   | 访问类型（0 = full（完整）；1 = high（高））；对于 16 位、32 位和自然宽度字段必须为 full |
| 9:1 | 索引  |
| 11:10 | 类型：  <br>0：控制  <br>1：VM 退出信息  <br>2：客户状态  <br>3：宿主状态 |
| 12  | 保留（必须为 0） |
| 14:13 | 宽度：  <br>0：16 位  <br>1：64 位  <br>2：32 位  <br>3：自然宽度 |
| 31:15 | 保留（必须为 0） |

以下条目详述每个编码中各位的含义：

-   **字段宽度**。第 14:13 位编码字段的宽度。
    
    -   值 0 表示 16 位字段。
    -   值 1 表示 64 位字段。
    -   值 2 表示 32 位字段。
    -   值 3 表示自然宽度字段。在支持 Intel 64 架构的处理器上此类字段有 64 位，在不支持的处理器上有 32 位。
    
    编码使用值 1 的字段被特殊处理，以允许 32 位软件访问字段的全部 64 位。通过为每个此类字段定义一个允许直接访问字段高 32 位的编码来允许此类访问。见下文。
    
-   **字段类型**。第 11:10 位编码 VMCS 字段的类型：控制、客户状态、宿主状态或 VM 退出信息。（最后一类还包括 VM 指令错误字段。）
    
-   **索引**。第 9:1 位区分具有相同字段宽度和类型的组件。
    
-   **访问类型**。除 64 位字段（宽度为 1 的字段；见上文）外，所有字段的第 0 位必须为 0。使用此位清除为 0 的编码的 VMREAD 或 VMWRITE 访问整个字段。对于宽度为 1 的 64 位字段，使用此位设置为 1 的编码的 VMREAD 或 VMWRITE 仅访问字段的高 32 位。
    

附录 B 给出了 VMCS 中所有字段的编码。

以下根据处理器模式、VMCS 字段宽度和访问类型描述 VMREAD 和 VMWRITE 的操作：

-   **16 位字段**：
    -   VMREAD 在目标操作数的第 15:0 位返回字段的值；目标操作数的其他位被清除为 0。
    -   VMWRITE 将源操作数的第 15:0 位的值写入 VMCS 字段；源操作数的其他位不被使用。
-   **32 位字段**：
    -   VMREAD 在目标操作数的第 31:0 位返回字段的值；在 64 位模式下，目标操作数的第 63:32 位被清除为 0。
    -   VMWRITE 将源操作数的第 31:0 位的值写入 VMCS 字段；在 64 位模式下，源操作数的第 63:32 位不被使用。
-   **使用完整访问类型的 64 位字段和自然宽度字段（IA-32e 模式之外）**。
    -   VMREAD 在其目标操作数中返回字段的第 31:0 位的值；字段的第 63:32 位被忽略。
    -   VMWRITE 将其源操作数的值写入字段的第 31:0 位并清除字段的第 63:32 位。
-   **使用完整访问类型的 64 位字段和自然宽度字段（64 位模式下，仅在不支持 Intel 64 架构的处理器上除外）**。
    -   VMREAD 在目标操作数的第 63:0 位返回字段的值。
    -   VMWRITE 将源操作数的第 63:0 位的值写入 VMCS 字段。
-   **使用高访问类型的 64 位字段**。
    -   VMREAD 在目标操作数的第 31:0 位返回字段的第 63:32 位的值；在 64 位模式下，目标操作数的第 63:32 位被清除为 0。
    -   VMWRITE 将源操作数的第 31:0 位的值写入字段的第 63:32 位；在 64 位模式下，源操作数的第 63:32 位不被使用。

寻求在 IA-32e 模式之外读取 64 位字段的软件可以使用完整访问类型的 VMREAD（读取字段的第 31:0 位）和高访问类型的 VMREAD（读取字段的第 63:32 位）；两次 VMREAD 执行的顺序不重要。寻求在 IA-32e 模式之外修改 64 位字段的软件应首先使用完整访问类型的 VMWRITE（建立字段的第 31:0 位，同时清除第 63:32 位），然后使用高访问类型的 VMWRITE（建立字段的第 63:32 位）。

### 27.11.3 初始化 VMCS

软件应在使用 VMCS 进行 VM 进入之前（使用 VMWRITE）初始化 VMCS 中的字段。否则可能导致不可预测的行为；例如，VM 进入可能因无法解释的原因失败，或者成功的转换（VM 进入或 VM 退出）可能加载具有意外值的处理器状态。

没有必要初始化逻辑处理器不会使用的字段。（例如，如果"use MSR bitmaps" VM 执行控制为 0，则没有必要初始化 MSR 位图地址。）

处理器维护一些不能用 VMWRITE 指令修改的 VMCS 信息；这包括 VMCS 的启动状态（见第 27.1 节）。此类信息可以存储在 VMCS 区域的 VMCS 数据部分中。由于此信息的格式是实现特定的，软件在首次分配内存区域用作 VMCS 区域时，无法知道处理器将如何从内存区域的内容确定此信息。

除了其其他功能外，VMCLEAR 指令还初始化其操作数引用的 VMCS 区域中的任何实现特定信息。为避免实现特定行为的不确定性，软件应在使用 VMPTRLD 首次使相应 VMCS 活动之前对 VMCS 区域执行 VMCLEAR。（图 27-1 展示了执行 VMCLEAR 如何将 VMCS 置于明确定义的状态。）

以下软件使用方式与这些限制一致：

-   在 VMCS 首次用于 VM 进入之前，应对其执行 VMCLEAR。
-   在已对该 VMCS 执行 VMCLEAR 之后，首次使用该 VMCS 进行 VM 进入应使用 VMLAUNCH。
-   任何后续使用 VMCS 进行的 VM 进入应使用 VMRESUME（直到下一次对该 VMCS 执行 VMCLEAR）。

预计一般来说，VMRESUME 的延迟将低于 VMLAUNCH。由于将 VMCS 从一个逻辑处理器"迁移"到另一个需要使用 VMCLEAR（见第 27.11.1 节），这会将 VMCS 的启动状态设置为"clear"，此类迁移要求下一次 VM 进入使用 VMLAUNCH 执行。软件开发人员可以通过避免将 VMCS 从一个逻辑处理器不必要地迁移到另一个来避免 VM 进入延迟增加的性能成本。

### 27.11.4 软件对相关结构的访问

除了 VMCS 区域本身的数据外，VMX 非根操作还可以由 VMCS 中指针引用的数据结构控制（例如，I/O 位图）。虽然指向这些数据结构的指针是 VMCS 的一部分，但数据结构本身不是。它们不能使用 VMREAD 和 VMWRITE 访问，而只能通过普通内存写入访问。

软件应确保每个此类数据结构仅在没有具有引用它的当前 VMCS 的逻辑处理器处于 VMX 非根操作时才被修改。否则可能导致不可预测的行为（包括第 27.11.1 节中标识的行为）。以下数据结构例外（受指示章节中的详细讨论约束）：EPT 分页结构和用于定位 SPP 向量的数据结构（第 31.4.3 节）；虚拟 APIC 页（第 32.1 节）；posted interrupt 描述符（第 32.6 节）；以及虚拟化异常信息区域（第 28.5.8.2 节）。

### 27.11.5 VMXON 区域

在执行 VMXON 之前，软件分配一个内存区域（称为 VMXON 区域）¹，逻辑处理器使用它来支持 VMX 操作。此区域的物理地址（VMXON 指针）作为操作数提供给 VMXON。VMXON 指针受适用于 VMCS 指针的限制约束：

-   VMXON 指针必须 4-KByte 对齐（第 11:0 位必须为零）。
-   VMXON 指针不得设置超出处理器物理地址宽度的任何位。²,³

在执行 VMXON 之前，软件应将 VMCS 修订标识符（见第 27.2 节）写入 VMXON 区域。（具体来说，它应将 31 位 VMCS 修订标识符写入 VMXON 区域前 4 个字节的第 30:0 位；第 31 位应清除为 0。）它不需要以任何其他方式初始化 VMXON 区域。软件应为每个逻辑处理器使用单独的区域，并且不应在该逻辑处理器上执行 VMXON 和 VMXOFF 之间访问或修改逻辑处理器的 VMXON 区域。否则可能导致不可预测的行为（包括第 27.11.1 节中标识的行为）。

* * *

> **脚注：**
> 
> 1.  VMXON 区域所需的内存量与 VMCS 区域所需的内存量相同。此大小是实现特定的，可以通过查阅 VMX 能力 MSR IA32_VMX_BASIC（见附录 A.1）确定。
> 2.  CPUID.80000008H:EAX\[7:0\] 报告处理器支持的物理地址宽度。它用于确定 MAXPHYADDR 的值，该值约束 VMXON 指针。如果 IA32_TME_ACTIVATE\[0\] = 1（指示 TME 已配置），MAXPHYADDR 减少 IA32_TME_ACTIVATE\[39:36\] 的值。（这在安全仲裁模式——SEAM 中不同，但 VMXON 不能在 SEAM 中使用。）IA32_TME_ACTIVATE\[39:36\] 是保留用于编码 SEAM 私有密钥标识符的物理地址位数。此数字从不大于 IA32_TME_ACTIVATE\[35:32\]，后者是通常用于 KeyID 的物理地址位数。
> 3.  如果 IA32_VMX_BASIC\[48\] 读取为 1，VMXON 指针不得设置范围 63:32 中的任何位；见附录 A.1。

* * *

## 第 28 章 VMX 非根操作

在使用 VMX 的虚拟化环境中，客户软件栈通常在 VMX 非根操作中的逻辑处理器上运行。此操作模式类似于虚拟化环境之外的普通处理器操作。本章描述 VMX 非根操作与普通处理器操作之间的差异，特别关注 VM 退出的原因（VM 退出使逻辑处理器从 VMX 非根操作回到根操作）。VMX 非根操作与普通处理器操作之间的差异在以下各节中描述：

-   第 28.1 节"导致 VM 退出的指令"。
-   第 28.2 节"VM 退出的其他原因"。
-   第 28.3 节"VMX 非根操作中指令行为的变化"。
-   第 28.4 节"VMX 非根操作中的其他变化"。
-   第 28.5 节"VMX 非根操作特有的功能"。
-   第 28.6 节"不受限制的客户（Unrestricted Guests）"。

第 28 章"VMX 非根操作"描述了管理 VMX 非根操作的数据控制结构。第 28 章"VMX 非根操作"描述了 VM 进入的操作，处理器通过它从 VMX 根操作转换到 VMX 非根操作。第 28 章"VMX 非根操作"描述了 VM 退出的操作，处理器通过它从 VMX 非根操作转换到 VMX 根操作。

第 31 章"VMX 对地址转换的支持"描述了支持 VMX 非根操作中地址转换的两个功能。第 32 章"APIC 虚拟化和虚拟中断"描述了支持 VMX 非根操作中中断和高级可编程中断控制器（APIC）虚拟化的功能。

## 28.1 导致 VM 退出的指令

某些指令如果在 VMX 非根操作中执行可能导致 VM 退出。除非另有说明，此类 VM 退出是"类故障"（fault-like）的，意味着导致 VM 退出的指令不执行，指令也不更新任何处理器状态。第 30.1 节详述了 VM 退出上下文中的架构状态。

第 28.1.1 节定义了同时受故障和 VM 退出影响的指令的故障与 VM 退出之间的优先级。第 28.1.2 节标识了在 VMX 非根操作中只要执行就导致 VM 退出的指令（因此它们永远不能在 VMX 非根操作中执行）。第 28.1.3 节标识了根据某些 VM 执行控制字段（见第 27.6 节）的设置导致 VM 退出的指令。

### 28.1.1 故障和 VM 退出的相对优先级

以下原则描述现有故障与 VM 退出之间的顺序：

-   某些异常优先于 VM 退出。这些包括无效操作码异常、基于特权级的故障¹ 和基于检查任务状态段（TSS）中 I/O 权限位的通用保护异常。例如，在 CPL = 3 时执行 RDMSR 会生成通用保护异常而不是 VM 退出。²
-   获取指令操作数时发生的故障优先于基于这些操作数内容的条件 VM 退出（见第 28.1.3 节中的 LMSW）。
-   由 INS 和 OUTS 指令的执行导致的 VM 退出（由于"unconditional I/O exiting" VM 执行控制为 1 或"use I/O bitmaps"控制为 1）优先于以下故障：
    -   由于相关段（INS 为 ES；OUTS 为 DS，除非被指令前缀覆盖）不可用而导致的通用保护故障
    -   由于偏移超出相关段的限长而导致的通用保护故障
    -   对齐检查异常
-   类故障的 VM 退出优先于上述提到的异常之外的异常。例如，在 CPL = 0 时对不存在的 MSR 执行 RDMSR 会生成 VM 退出而不是通用保护异常。

当第 28.1.2 节或第 28.1.3 节（下文）标识可能导致 VM 退出的指令执行时，假定该指令不会发生优先于 VM 退出的故障。

### 28.1.2 无条件导致 VM 退出的指令

以下指令在 VMX 非根操作中执行时导致 VM 退出：CPUID、GETSEC、¹ INVD 和 XSETBV。随 VMX 引入的指令也是如此：INVEPT、INVVPID、SEAMCALL、TDCALL、VMCALL、² VMCLEAR、VMLAUNCH、VMPTRLD、VMPTRST、VMRESUME、VMXOFF 和 VMXON。

### 28.1.3 有条件导致 VM 退出的指令

某些指令在 VMX 非根操作中根据 VM 执行控制的设置导致 VM 退出。以下指令可以基于所述条件导致"类故障"VM 退出：³

-   **CLTS**。如果 CR0 客户/宿主掩码和 CR0 读阴影中的第 3 位位置（对应于 CR0.TS）的位都被设置，CLTS 指令导致 VM 退出。
    
-   **ENCLS**。如果"enable ENCLS exiting" VM 执行控制为 1 且以下之一为真，ENCLS 指令导致 VM 退出：
    
    -   EAX 的值小于 63 且 ENCLS-exiting 位图中对应的位为 1（见第 27.6.16 节）。
    -   EAX 的值大于或等于 63 且 ENCLS-exiting 位图中的第 63 位为 1。
-   **ENQCMD、ENQCMDS**。这些指令中每一个的行为由"PASID translation" VM 执行控制的设置决定。如果该控制为 0，指令正常执行。如果控制为 1，指令行为被修改并可能导致 VM 退出。见第 28.5.9 节。
    
-   **HLT**。如果"HLT exiting" VM 执行控制为 1，HLT 指令导致 VM 退出。
    
-   **IN、INS/INSB/INSW/INSD、OUT、OUTS/OUTSB/OUTSW/OUTSD**。这些指令中每一个的行为由"unconditional I/O exiting"和"use I/O bitmaps" VM 执行控制的设置决定：
    
    -   如果两个控制都为 0，指令正常执行。
    -   如果"unconditional I/O exiting" VM 执行控制为 1 且"use I/O bitmaps" VM 执行控制为 0，指令导致 VM 退出。
    -   如果"use I/O bitmaps" VM 执行控制为 1，当指令尝试访问对应于适当 I/O 位图中设置为 1 的位的 I/O 端口时导致 VM 退出（见第 27.6.4 节）。如果 I/O 操作在 16 位 I/O 端口空间上"环绕"（访问端口 FFFFH 和 0000H），I/O 指令导致 VM 退出（如果"use I/O bitmaps" VM 执行控制为 1，则忽略"unconditional I/O exiting" VM 执行控制）。
    
    关于 INS 和 OUTS 指令可能导致的故障相对于 VM 退出的优先级的更多信息，见第 28.1.1 节。
    
-   **INVLPG**。如果"INVLPG exiting" VM 执行控制为 1，INVLPG 指令导致 VM 退出。
    
-   **INVPCID**。如果"INVLPG exiting"和"enable INVPCID" VM 执行控制都为 1，INVPCID 指令导致 VM 退出。
    
-   **LGDT、LIDT、LLDT、LTR、SGDT、SIDT、SLDT、STR**。如果"descriptor-table exiting" VM 执行控制为 1，这些指令导致 VM 退出。
    
-   **LMSW**。一般来说，如果对于 CR0 客户/宿主掩码低 4 位中设置的任何位，LMSW 指令会写入与 CR0 读阴影中对应位不同的值，则导致 VM 退出。LMSW 从不清除 CR0 的第 0 位（CR0.PE）；因此，如果以下任一为真，LMSW 导致 VM 退出：
    
    -   CR0 客户/宿主掩码和源操作数中的第 0 位位置（对应于 CR0.PE）的位都被设置，且 CR0 读阴影中的第 0 位位置被清除。
    -   对于范围 3:1 中的任何位位置，该位置在 CR0 客户/宿主掩码中被设置，且源操作数和 CR0 读阴影中对应位的值不同。
-   **LOADIWKEY**。如果"LOADIWKEY exiting" VM 执行控制为 1，LOADIWKEY 指令导致 VM 退出。
    
-   **MONITOR**。如果"MONITOR exiting" VM 执行控制为 1，MONITOR 指令导致 VM 退出。
    
-   **从 CR3 的 MOV**。如果"CR3-store exiting" VM 执行控制为 1，从 CR3 的 MOV 指令导致 VM 退出。首批支持虚拟机扩展的处理器仅支持此控制的 1 设置。
    
-   **从 CR8 的 MOV**。如果"CR8-store exiting" VM 执行控制为 1，从 CR8 的 MOV 指令导致 VM 退出。
    
-   **到 CR0 的 MOV**。除非其源操作数的值对于 CR0 客户/宿主掩码中设置的每个位的位置都与 CR0 读阴影中的对应位匹配，否则到 CR0 的 MOV 指令导致 VM 退出。（如果 CR0 客户/宿主掩码中的每个位都被清除，到 CR0 的 MOV 不能导致 VM 退出。）
    
-   **到 CR3 的 MOV**。除非"CR3-load exiting" VM 执行控制为 0 或其源操作数的值等于 VMCS 中指定的 CR3-target 值之一，否则到 CR3 的 MOV 指令导致 VM 退出。只考虑前 n 个 CR3-target 值，其中 n 是 CR3-target 计数。如果"CR3-load exiting" VM 执行控制为 1 且 CR3-target 计数为 0，到 CR3 的 MOV 总是导致 VM 退出。
    
    首批支持虚拟机扩展的处理器仅支持"CR3-load exiting" VM 执行控制的 1 设置。这些处理器总是查阅 CR3-target 控制以确定到 CR3 的 MOV 执行是否导致 VM 退出。
    
-   **到 CR4 的 MOV**。除非其源操作数的值对于 CR4 客户/宿主掩码中设置的每个位的位置都与 CR4 读阴影中的对应位匹配，否则到 CR4 的 MOV 指令导致 VM 退出。
    
-   **到 CR8 的 MOV**。如果"CR8-load exiting" VM 执行控制为 1，到 CR8 的 MOV 指令导致 VM 退出。
    
-   **MOV DR**。如果"MOV-DR exiting" VM 执行控制为 1，MOV DR 指令导致 VM 退出。此类 VM 退出代表第 28.1.1 节中标识的原则的一个例外，因为它们优先于：基于特权级的通用保护异常；以及由于 CR4.DE=1 且指令指定访问 DR4 或 DR5 而发生的无效操作码异常。
    
-   **MWAIT**。如果"MWAIT exiting" VM 执行控制为 1，MWAIT 指令导致 VM 退出。如果此控制为 0，MWAIT 指令的行为可能被修改（见第 28.3 节）。
    
-   **PAUSE**。此指令中每一个的行为取决于 CPL 以及"PAUSE exiting"和"PAUSE-loop exiting" VM 执行控制的设置：
    
    -   **CPL = 0**。
        
        -   如果"PAUSE exiting"和"PAUSE-loop exiting" VM 执行控制都为 0，PAUSE 指令正常执行。
            
        -   如果"PAUSE exiting" VM 执行控制为 1，PAUSE 指令导致 VM 退出（如果 CPL = 0 且"PAUSE exiting" VM 执行控制为 1，则忽略"PAUSE-loop exiting" VM 执行控制）。
            
        -   如果"PAUSE exiting" VM 执行控制为 0 且"PAUSE-loop exiting" VM 执行控制为 1，应用以下处理。
            
            处理器确定此次 PAUSE 执行与上一次在 CPL 0 的 PAUSE 执行之间的时间量。如果此时间量超过 VM 执行控制字段 PLE_Gap 的值，处理器认为此次执行是循环中 PAUSE 的第一次执行。（对于 VM 进入后第一次在 CPL 0 执行 PAUSE 也是如此。）
            
            否则，处理器确定自被认为循环中第一次的最近一次 PAUSE 执行以来的时间量。如果此时间量超过 VM 执行控制字段 PLE_Window 的值，则发生 VM 退出。
            
            出于这些计算的目的，时间基于与时间戳计数器（TSC）相同速率运行的计数器度量。
            
    -   **CPL > 0**。
        
        -   如果"PAUSE exiting" VM 执行控制为 0，PAUSE 指令正常执行。
        -   如果"PAUSE exiting" VM 执行控制为 1，PAUSE 指令导致 VM 退出。
        
        如果 CPL > 0，则忽略"PAUSE-loop exiting" VM 执行控制。
        
-   **PCONFIG**。如果"enable PCONFIG" VM 执行控制为 1 且以下之一为真，PCONFIG 指令导致 VM 退出：
    
    -   EAX 的值小于 63 且 PCONFIG-exiting 位图中对应的位为 1（见第 27.6.17 节）。
    -   EAX 的值大于或等于 63 且 PCONFIG-exiting 位图中的第 63 位为 1。  
        如果"enable PCONFIG" VM 执行控制为 1 且前两个条目都不成立，PCONFIG 指令正常执行。
-   **RDMSR**。如果以下任一为真，RDMSR 指令导致 VM 退出：
    
    -   "use MSR bitmaps" VM 执行控制为 0。
    -   MSR 地址不在范围 00000000H – 00001FFFH 和 C0000000H – C0001FFFH 内。
    -   MSR 地址 X 在范围 00000000H – 00001FFFH 内且读取位图中的第 X 位为 1。
    -   MSR 地址 X 在范围 C0000000H – C0001FFFH 内且高 MSR 的读取位图中的第 n 位为 1，其中 n 是 X & 00001FFFH 的值。  
        关于如何标识这些位图的详细信息，见第 27.6.9 节。请注意，对于 RDMSR 的隐式形式，MSR 地址在 ECX 中；对于立即数形式，MSR 地址在立即数中。
-   **RDMSRLIST**。如果"enable MSR-list instructions" VM 执行控制为 1 且"use MSR bitmaps" VM 执行控制为 0，RDMSRLIST 指令导致 VM 退出。如果两个控制都为 1，指令一次正常读取一个 MSR，将读取的值存储到内存并清除 RCX 中的相应位。如果以下任一为真，读取地址为 X 的 MSR 的尝试导致 VM 退出：
    
    -   X 不在范围 00000000H – 00001FFFH 和 C0000000H – C0001FFFH 内。
    -   X 在范围 00000000H – 00001FFFH 内且低 MSR 的读取位图中的第 X 位为 1。
    -   X 在范围 C0000000H – C0001FFFH 内且高 MSR 的读取位图中的第 n 位为 1，其中 n 是 X & 00001FFFH 的值。  
        如果读取 MSR 的尝试导致 VM 退出，RCX 中的相应位不被清除，MSR 不被读取，也不向内存存储任何值。
-   **RDPMC**。如果"RDPMC exiting" VM 执行控制为 1，RDPMC 指令导致 VM 退出。
    
-   **RDRAND**。如果"RDRAND exiting" VM 执行控制为 1，RDRAND 指令导致 VM 退出。
    
-   **RDSEED**。如果"RDSEED exiting" VM 执行控制为 1，RDSEED 指令导致 VM 退出。
    
-   **RDTSC**。如果"RDTSC exiting" VM 执行控制为 1，RDTSC 指令导致 VM 退出。
    
-   **RDTSCP**。如果"RDTSC exiting"和"enable RDTSCP" VM 执行控制都为 1，RDTSCP 指令导致 VM 退出。
    
-   **RSM**。如果在系统管理模式（SMM）中执行，RSM 指令导致 VM 退出。¹
    
-   **TPAUSE**。如果"RDTSC exiting"和"enable user wait and pause" VM 执行控制都为 1，TPAUSE 指令导致 VM 退出。
    
-   **UMWAIT**。如果"RDTSC exiting"和"enable user wait and pause" VM 执行控制都为 1，UMWAIT 指令导致 VM 退出。
    
-   **URDMSR**。如果以下任一为真，VMX 非根操作中 URDMSR 的执行导致 VM 退出：
    
    -   "use MSR bitmaps" VM 执行控制为 0。
    -   MSR 地址 n 在范围 00000000H – 00001FFFH 内且低 MSR 的读取位图中（由 VMCS 中的地址引用）的第 n 位为 1。
    -   MSR 地址在范围 00002000H – 00003FFFH 内。  
        此类 VM 退出的优先级低于由于 MSR 地址超出用户 MSR 位图范围（00000000H – 00003FFFH）或其在用户 MSR 位图的较低（读取）一半中的位被清除而导致的 #GP。
-   **UWRMSR**。如果以下任一为真，VMX 非根操作中 UWRMSR 的执行导致 VM 退出：
    
    -   "use MSR bitmaps" VM 执行控制为 0。
    -   MSR 地址 n 在范围 00000000H – 00001FFFH 内且低 MSR 的写入位图中（由 VMCS 中的地址引用）的第 n 位为 1。
    -   MSR 地址在范围 00002000H – 00003FFFH 内。  
        此类 VM 退出的优先级低于由于 MSR 地址超出用户 MSR 位图范围（00000000H – 00003FFFH）或其在用户 MSR 位图的较高（写入）一半中的位被清除而导致的 #GP。
-   **VMREAD**。如果以下任一为真，VMREAD 指令导致 VM 退出：
    
    -   "VMCS shadowing" VM 执行控制为 0。
    -   寄存器源操作数的第 63:15 位（64 位模式之外为第 31:15 位）不全为 0。
    -   VMREAD 位图中的第 n 位为 1，其中 n 是寄存器源操作数的第 14:0 位的值。关于如何标识 VMREAD 位图的详细信息，见第 27.6.15 节。
    
    如果 VMREAD 指令不导致 VM 退出，它从 VMCS 链接指针引用的 VMCS 读取。关于 VMREAD 指令操作的详细信息，见第 33 章"VMREAD——从虚拟机控制结构读取字段"。
    
-   **VMWRITE**。如果以下任一为真，VMWRITE 指令导致 VM 退出：
    
    -   "VMCS shadowing" VM 执行控制为 0。
    -   寄存器源操作数的第 63:15 位（64 位模式之外为第 31:15 位）不全为 0。
    -   VMWRITE 位图中的第 n 位为 1，其中 n 是寄存器源操作数的第 14:0 位的值。关于如何标识 VMWRITE 位图的详细信息，见第 27.6.15 节。
    
    如果 VMWRITE 指令不导致 VM 退出，它写入 VMCS 链接指针引用的 VMCS。关于 VMWRITE 指令操作的详细信息，见第 33 章"VMWRITE——向虚拟机控制结构写入字段"。
    
-   **WBINVD**。如果"WBINVD exiting" VM 执行控制为 1，WBINVD 指令导致 VM 退出。
    
-   **WBNOINVD**。如果"WBINVD exiting" VM 执行控制为 1，WBNOINVD 指令导致 VM 退出。
    
-   **WRMSR、WRMSRNS**。如果以下任一为真，这些指令之一的执行导致 VM 退出：
    
    -   "use MSR bitmaps" VM 执行控制为 0。
    -   MSR 地址不在范围 00000000H – 00001FFFH 和 C0000000H – C0001FFFH 内。
    -   MSR 地址 X 在范围 00000000H – 00001FFFH 内且低 MSR 的写入位图中的第 X 位为 1，其中 n 是 ECX 的值。
    -   MSR 地址 X 在范围 C0000000H – C0001FFFH 内且高 MSR 的写入位图中的第 n 位为 1，其中 n 是 X & 00001FFFH 的值。
    
    关于如何标识这些位图的详细信息，见第 27.6.9 节。请注意，对于 WRMSR 和 WRMSRNS 的隐式形式，MSR 地址在 ECX 中；对于 WRMSRNS 的立即数形式，MSR 地址在立即数中。
    
-   **WRMSRLIST**。如果"enable MSR-list instructions" VM 执行控制为 1 且"use MSR bitmaps" VM 执行控制为 0，WRMSRLIST 指令导致 VM 退出。在这种情况下，指令的寄存器操作数不被使用，内存不被读取，也不修改任何 MSR。
    
    如果两个控制都为 1，指令一次正常写入一个 MSR，使用从内存读取的值并清除 RCX 中的相应位。如果以下任一为真，写入地址为 X 的 MSR 的尝试导致 VM 退出：
    
    -   X 不在范围 00000000H – 00001FFFH 和 C0000000H – C0001FFFH 内。
    -   X 在范围 00000000H – 00001FFFH 内且低 MSR 的写入位图中的第 X 位为 1。
    -   X 在范围 C0000000H – C0001FFFH 内且高 MSR 的写入位图中的第 n 位为 1，其中 n 是 X & 00001FFFH 的值。
    
    此类 VM 退出发生在本会写入 MSR 的数据从内存读取之后，但 RCX 中的相应位不被清除且 MSR 不被写入。本会写入 MSR 的数据被保存到 VMCS 的 MSR-data 字段（见第 30.2.5 节）。
    
-   **XRSTORS**。如果"enable XSAVES/XRSTORS" VM 执行控制为 1 且以下三个值的逻辑与中设置了任何位，XRSTORS 指令导致 VM 退出：EDX:EAX、IA32_XSS MSR 和 XSS-exiting 位图（见第 27.6.20 节）。
    
-   **XSAVES**。如果"enable XSAVES/XRSTORS" VM 执行控制为 1 且以下三个值的逻辑与中设置了任何位，XSAVES 指令导致 VM 退出：EDX:EAX、IA32_XSS MSR 和 XSS-exiting 位图（见第 27.6.20 节）。
    

## 28.2 VM 退出的其他原因

除了由指令执行导致的 VM 退出外，以下事件可能导致 VM 退出：¹

-   **异常**。异常（故障、陷阱和中止）基于异常位图导致 VM 退出（见第 27.6.3 节）。如果发生异常，其向量（范围 0–31）用于选择异常位图中的一位。如果该位为 1，发生 VM 退出；如果该位为 0，异常正常交付。异常位图的这种使用也适用于由指令 INT1、INT3、INTO、BOUND、UD0、UD1、UD2 和 UDB 生成的异常。²
    
    页故障（向量为 14 的异常）被特殊处理。当页故障发生时，处理器查阅（1）异常位图的第 14 位；（2）随页故障产生的错误码 \[PFEC\]；（3）页故障错误码掩码字段 \[PFEC_MASK\]；以及（4）页故障错误码匹配字段 \[PFEC_MATCH\]。它检查 PFEC & PFEC_MASK = PFEC_MATCH 是否成立。如果相等，遵循异常位图中第 14 位的规范（例如，如果该位被设置则发生 VM 退出）。如果不相等，该位的含义被反转（例如，如果该位被清除则发生 VM 退出）。
    
    因此，如果软件希望所有页故障都导致 VM 退出，它可以将异常位图中的第 14 位设置为 1，并将页故障错误码掩码和匹配字段都设置为 00000000H。如果软件希望没有页故障导致 VM 退出，它可以将异常位图中的第 14 位设置为 1，将页故障错误码掩码字段设置为 00000000H，并将页故障错误码匹配字段设置为 FFFFFFFFH。
    
-   **三重故障**。如果逻辑处理器在尝试调用双故障处理程序时遇到异常，且该异常本身不会由于异常位图导致 VM 退出，则发生 VM 退出。这适用于双故障异常在 VMX 非根操作内生成的情况、双故障异常在 VM 进入的事件注入期间生成的情况，以及 VM 进入正在注入双故障异常的情况。
    
-   **外部中断**。如果"external-interrupt exiting" VM 执行控制为 1，外部中断导致 VM 退出（例外见第 32.6 节）。否则，处理器正常处理该中断。¹（如果逻辑处理器处于关闭状态或 wait-for-SIPI 状态，外部中断被阻止。处理器不处理该中断，也不发生 VM 退出。）
    
-   **非可屏蔽中断（NMI）**。如果"NMI exiting" VM 执行控制为 1，NMI 导致 VM 退出。否则，它使用向量 2 交付。（如果逻辑处理器处于 wait-for-SIPI 状态，NMI 被阻止。NMI 不被交付，也不发生 VM 退出。）
    
-   **INIT 信号**。INIT 信号导致 VM 退出。逻辑处理器不执行通常与这些事件相关的任何操作。此类退出不会像在 VMX 操作之外那样修改寄存器状态或清除挂起的事件。（如果逻辑处理器处于 wait-for-SIPI 状态，INIT 信号被阻止。在这种情况下它们不会导致 VM 退出。）
    
-   **启动 IPI（SIPI）**。SIPI 导致 VM 退出。如果 SIPI 到达时逻辑处理器不处于 wait-for-SIPI 活动状态，则不会发生 VM 退出且 SIPI 被丢弃。由 SIPI 导致的 VM 退出不执行通常与这些事件相关的任何正常操作：它们不会像在 VMX 操作之外那样修改寄存器状态。（如果逻辑处理器不处于 wait-for-SIPI 状态，SIPI 被阻止。在这种情况下它们不会导致 VM 退出。）
    
-   **任务切换**。VMX 非根操作中不允许任务切换。在 VMX 非根操作中尝试实现任务切换的任何行为都会导致 VM 退出。见第 28.4.2 节。
    
-   **系统管理中断（SMI）**。如果逻辑处理器使用 SMI 和系统管理模式（SMM）的双监视器处理，SMI 导致 SMM VM 退出。见第 34.15.2 节。²
    
-   **VMX 抢占定时器**。当定时器倒计时到零时发生 VM 退出。VMX 抢占定时器的操作细节见第 28.5.1 节。
    
    调试陷阱异常和更高优先级事件优先于由 VMX 抢占定时器导致的 VM 退出。由 VMX 抢占定时器导致的 VM 退出优先于由"NMI-window exiting" VM 执行控制导致的 VM 退出和更低优先级事件。
    
    这些 VM 退出会像非可屏蔽中断一样将逻辑处理器从相同的不活动状态唤醒。具体来说，它们将逻辑处理器从关闭状态以及使用 HLT 和 MWAIT 指令进入的状态唤醒。如果逻辑处理器处于 wait-for-SIPI 状态，这些 VM 退出不会发生。
    
-   **总线锁**。如果"VMM bus-lock detection" VM 执行控制为 1，总线锁的断言（见第 11.1.2 节）导致 VM 退出。此类 VM 退出是类陷阱（trap-like）的，因为它是在执行断言总线锁的指令之后生成的。因此 VM 退出不会阻止总线锁的断言。这些 VM 退出优先于系统管理中断（SMI）、INIT 信号和更低优先级事件。
    
-   **指令超时**。如果"instruction timeout" VM 执行控制为 1，当某些操作阻止处理器在指令超时控制 VM 执行控制字段（见第 27.6.24 节）指定的时间内到达指令边界时发生 VM 退出。
    

此外，还有基于客户软件接收中断的准备程度导致 VM 退出的控制：

-   如果"interrupt-window exiting" VM 执行控制为 1，当 RFLAGS.IF = 1 且没有由 STI 或 MOV SS 引起的事件阻止（见表 27-3）时，在任何指令执行之前发生 VM 退出。
    
    非可屏蔽中断（NMI）和更高优先级事件优先于由此控制导致的 VM 退出。由此控制导致的 VM 退出优先于外部中断和更低优先级事件。
    
    这些 VM 退出会像外部中断一样将逻辑处理器从相同的不活动状态唤醒。具体来说，它们将逻辑处理器从使用 HLT 和 MWAIT 指令进入的状态唤醒。如果逻辑处理器处于关闭状态或 wait-for-SIPI 状态，这些 VM 退出不会发生。
    
-   如果"NMI-window exiting" VM 执行控制为 1，当没有 virtual-NMI 阻止、没有由 MOV SS 引起的事件阻止且没有由 STI 引起的事件阻止时（见表 27-3），在任何指令执行之前发生 VM 退出。
    
    由 VMX 抢占定时器导致的 VM 退出和更高优先级事件优先于由此控制导致的 VM 退出。由此控制导致的 VM 退出优先于非可屏蔽中断（NMI）和更低优先级事件。
    
    这些 VM 退出会像 NMI 一样将逻辑处理器从相同的不活动状态唤醒。具体来说，它们将逻辑处理器从关闭状态以及使用 HLT 和 MWAIT 指令进入的状态唤醒。如果逻辑处理器处于 wait-for-SIPI 状态，这些 VM 退出不会发生。
    

本节中标识的某些 VM 退出所需的条件可能在 VM 进入后立即成立。如果确实如此，相应的 VM 退出会在那时发生。

## 28.3 VMX 非根操作中指令行为的变化

某些指令的行为在 VMX 非根操作中发生变化。其中一些变化由某些 VM 执行控制字段的设置决定。以下条目详述了此类变化：¹

-   **CLTS**。CLTS 指令的行为由 CR0 客户/宿主掩码和 CR0 读阴影中的第 3 位位置（对应于 CR0.TS）的位决定：
    
    -   如果 CR0 客户/宿主掩码中的第 3 位为 0，CLTS 正常清除 CR0.TS（在这种情况下 CR0 读阴影中的第 3 位的值无关紧要），除非 CR0.TS 在 VMX 操作中被固定为 1（见第 26.8 节），在这种情况下 CLTS 导致通用保护异常。
    -   如果 CR0 客户/宿主掩码中的第 3 位为 1 且 CR0 读阴影中的第 3 位为 0，CLTS 完成但不改变 CR0.TS 的内容。
    -   如果 CR0 客户/宿主掩码和 CR0 读阴影中的第 3 位位置都为 1，CLTS 导致 VM 退出。
-   **ENQCMD、ENQCMDS**。这些指令中的每一个都执行一个 64 字节的入队存储（enqueue store），在第 19:0 位包含一个 PASID 值。对于 ENQCMD，PASID 通常是 IA32_PASID\[19:0\] 的值，而对于 ENQCMDS，PASID 通常从内存读取。
    
    这些指令中每一个的行为（特别是用于入队存储的 PASID 值）由"PASID translation" VM 执行控制的设置决定：
    
    -   如果"PASID translation" VM 执行控制为 0，指令正常操作。
    -   如果"PASID translation" VM 执行控制为 1，用于入队存储的 PASID 值由第 28.5.9 节描述的 PASID 转换过程决定。（注意 PASID 转换可能导致 VM 退出，在这种情况下不执行入队存储。）
    
    ENQCMD 或 ENQCMDS 的执行仅在检查可能导致通用保护异常的条件（ENQCMD 检查 IA32_PASID.Valid；ENQCMDS 进行特权级检查）、从内存加载指令的源操作数之后（因此在该加载可能导致的任何故障或 VM 退出（例如，页故障或 EPT 违规）之后）才执行 PASID 转换。PASID 转换发生在实际入队存储之前，因此在其可能导致的任何故障或 VM 退出之前。
    
-   **ERETS、ERETU**。如果栈上返回状态中增强 SS（augmented SS）的第 18 位被设置，这些指令中的每一个都解除 NMI 阻止。以下条目详述了此行为在 VMX 非根操作中如何根据某些 VM 执行控制的设置被修改：
    
    -   如果"NMI exiting" VM 执行控制为 0，ERETS 和 ERETU 的此行为不被修改（它们如上所述解除 NMI 阻止）。（如果"NMI exiting" VM 执行控制为 0，"virtual NMIs"控制必须为 0；见第 29.2.1.1 节。）
    -   如果"NMI exiting" VM 执行控制为 1，无论栈上的返回状态如何，ERETS 和 ERETU 都不解除物理 NMI 阻止。如果此外"virtual NMIs" VM 执行控制为 1，逻辑处理器跟踪 virtual-NMI 阻止。在这种情况下，如果返回状态中增强 SS 的第 18 位被设置，ERETS 和 ERETU 各自解除 virtual-NMI 阻止。
    -   如果"NMI exiting" VM 执行控制为 1 且"virtual NMIs" VM 执行控制为 0，ERETS 和 ERETU 忽略增强 SS 的第 18 位。
-   **INVPCID**。INVPCID 指令的行为首先由"enable INVPCID" VM 执行控制的设置决定：
    
    -   如果"enable INVPCID" VM 执行控制为 0，INVPCID 导致无效操作码异常（#UD）。此异常优先于指令可能发生的任何其他异常。
    -   如果"enable INVPCID" VM 执行控制为 1，处理基于"INVLPG exiting" VM 执行控制的设置：
        -   如果"INVLPG exiting" VM 执行控制为 0，INVPCID 正常操作。
        -   如果"INVLPG exiting" VM 执行控制为 1，INVPCID 导致 VM 退出。
-   **IRET**。IRET 关于 NMI 阻止（见表 27-3）的行为由"NMI exiting"和"virtual NMIs" VM 执行控制的设置决定：
    
    -   如果"NMI exiting" VM 执行控制为 0，IRET 正常操作并解除 NMI 阻止。（如果"NMI exiting" VM 执行控制为 0，"virtual NMIs"控制必须为 0；见第 29.2.1.1 节。）
    -   如果"NMI exiting" VM 执行控制为 1，IRET 不影响 NMI 的阻止。如果此外"virtual NMIs" VM 执行控制为 1，逻辑处理器跟踪 virtual-NMI 阻止。在这种情况下，IRET 移除任何 virtual-NMI 阻止。
    
    上面指定的 NMI 或虚拟 NMI 的解除阻止即使在 IRET 导致故障时也会发生。
    
-   **LMSW**。在 VMX 非根操作之外，LMSW 将其源操作数加载到 CR0\[3:0\]，但如果 CR0.PE 被设置则不清除它。在 VMX 非根操作中，不会导致 VM 退出的 LMSW 执行（见第 28.1.3 节）保持 CR0\[3:0\] 中对应于 CR0 客户/宿主掩码中设置的位的任何位不变。尝试将 CR0\[3:0\] 中的任何其他位设置为 VMX 操作不支持的值（见第 26.8 节）会导致通用保护异常。尝试清除 CR0.PE 被无故障地忽略。
    
-   **从 CR0 的 MOV**。从 CR0 的 MOV 的行为由 CR0 客户/宿主掩码和 CR0 读阴影决定。对于对应于 CR0 客户/宿主掩码中被清除的位的每个位置，目标操作数被加载 CR0 中对应位的值。对于对应于 CR0 客户/宿主掩码中被设置的位的每个位置，目标操作数被加载 CR0 读阴影中对应位的值。因此，如果 CR0 客户/宿主掩码中的每个位都被清除，从 CR0 的 MOV 正常从 CR0 读取；如果 CR0 客户/宿主掩码中的每个位都被设置，从 CR0 的 MOV 返回 CR0 读阴影的值。
    
    根据 CR0 客户/宿主掩码和 CR0 读阴影的内容，目标中可能设置直接读取 CR0 时永远不会设置的位。
    
-   **从 CR3 的 MOV**。如果"enable EPT" VM 执行控制为 1 且从 CR3 的 MOV 执行不会导致 VM 退出（见第 28.1.3 节），从 CR3 加载的值是客户物理地址；见第 31.3.1 节。
    
-   **从 CR4 的 MOV**。从 CR4 的 MOV 的行为由 CR4 客户/宿主掩码和 CR4 读阴影决定。对于对应于 CR4 客户/宿主掩码中被清除的位的每个位置，目标操作数被加载 CR4 中对应位的值。对于对应于 CR4 客户/宿主掩码中被设置的位的每个位置，目标操作数被加载 CR4 读阴影中对应位的值。因此，如果 CR4 客户/宿主掩码中的每个位都被清除，从 CR4 的 MOV 正常从 CR4 读取；如果 CR4 客户/宿主掩码中的每个位都被设置，从 CR4 的 MOV 返回 CR4 读阴影的值。
    
    根据 CR4 客户/宿主掩码和 CR4 读阴影的内容，目标中可能设置直接读取 CR4 时永远不会设置的位。
    
-   **从 CR8 的 MOV**。如果从 CR8 的 MOV 指令不会导致 VM 退出（见第 28.1.3 节），当"use TPR shadow" VM 执行控制为 1 时其行为被修改；见第 32.3 节。
    
-   **到 CR0 的 MOV**。不会导致 VM 退出的到 CR0 的 MOV 执行（见第 28.1.3 节）保持 CR0 中对应于 CR0 客户/宿主掩码中设置的位的任何位不变。对其他位的修改尝试的处理取决于"unrestricted guest" VM 执行控制的设置：
    
    -   如果控制为 0，当到 CR0 的 MOV 尝试将 CR0 中的任何位设置为 VMX 操作不支持的值（见第 26.8 节）时，导致通用保护异常。
    -   如果控制为 1，当到 CR0 的 MOV 尝试将 CR0 中除第 0 位（PE）或第 31 位（PG）之外的任何位设置为 VMX 操作不支持的值时，导致通用保护异常。然而，如果到 CR0 的 MOV 会导致 CR0.PE = 0 和 CR0.PG = 1，或者会导致 CR0.PG = 1、CR4.PAE = 0 和 IA32_EFER.LME = 1，则到 CR0 的 MOV 仍然导致通用保护异常。
-   **到 CR3 的 MOV**。如果"enable EPT" VM 执行控制为 1 且到 CR3 的 MOV 执行不会导致 VM 退出（见第 28.1.3 节），加载到 CR3 的值被视为客户物理地址；见第 31.3.1 节。以下细节适用：
    
    -   尝试设置 CR3\[63:M\] 中的保留位导致 #GP(0)，其中 M 是 CPUID.80000008H:EAX\[7:0\] 中枚举的值。（与其他情况不同，M 的值在 SEAM 之外不被减少。）
    -   如果未使用 PAE 分页，指令不使用客户物理地址访问内存，也不会使其通过 EPT 转换。¹
    -   如果正在使用 PAE 分页，指令通过 EPT 转换客户物理地址并使用结果加载四个（4）页目录指针表项（PDPTE）。指令不使用 PDPTE 的客户物理地址访问内存，也不会使它们通过 EPT 转换。尝试设置第 63:M 位位置中的 PDPTE 位导致 #GP(0)，其中 M 如上定义（M 在 SEAM 之外不被减少）。
-   **到 CR4 的 MOV**。不会导致 VM 退出的到 CR4 的 MOV 执行（见第 28.1.3 节）保持 CR4 中对应于 CR4 客户/宿主掩码中设置的位的任何位不变。此类执行如果尝试将 CR4 中的任何位（不对应于 CR4 客户/宿主掩码中设置的位）设置为 VMX 操作不支持的值（见第 26.8 节），则导致通用保护异常。
    
-   **到 CR8 的 MOV**。如果到 CR8 的 MOV 指令不会导致 VM 退出（见第 28.1.3 节），当"use TPR shadow" VM 执行控制为 1 时其行为被修改；见第 32.3 节。
    
-   **MWAIT**。MWAIT 指令的行为（如果 CPL > 0，它总是导致无效操作码异常——#UD）由"MWAIT exiting" VM 执行控制的设置决定：
    
    -   如果"MWAIT exiting" VM 执行控制为 1，MWAIT 导致 VM 退出。
    -   如果"MWAIT exiting" VM 执行控制为 0，当以下之一为真时 MWAIT 正常操作：（1）ECX\[0\] 为 0；（2）RFLAGS.IF = 1；或以下两者都为真：（a）"interrupt-window exiting" VM 执行控制为 0；且（b）逻辑处理器尚未识别挂起的虚拟中断（见第 29.2.1 节）。
    -   如果"MWAIT exiting" VM 执行控制为 0、ECX\[0\] = 1 且 RFLAGS.IF = 0，当"interrupt-window exiting" VM 执行控制为 1 或逻辑处理器已识别挂起的虚拟中断时，MWAIT 不会使处理器进入实现相关的优化状态；相反，控制传递到 MWAIT 指令之后的指令。
-   **PBNDKB**。PBNDKB 指令的行为由"enable PBNDKB" VM 执行控制的设置决定：
    
    -   如果"enable PBNDKB" VM 执行控制为 0，PBNDKB 导致无效操作码异常（#UD）。此异常优先于指令可能发生的任何异常。
    -   如果"enable PBNDKB" VM 执行控制为 1，PBNDKB 正常操作。
-   **PCONFIG**。PCONFIG 指令的行为由"enable PCONFIG" VM 执行控制的设置决定：
    
    -   如果"enable PCONFIG" VM 执行控制为 0，PCONFIG 导致无效操作码异常（#UD）。此异常优先于指令可能发生的任何异常。
    -   如果"enable PCONFIG" VM 执行控制为 1，PCONFIG 可能如第 28.1.3 节规定的那样导致 VM 退出；如果它不导致此类 VM 退出，则正常操作。
-   **RDMSR**。第 28.1.3 节标识了 RDMSR 指令的执行何时导致 VM 退出。如果此类执行既不因 CPL > 0 导致故障也不导致 VM 退出，指令的行为可能对某些 MSR 地址被修改：
    
    -   如果 MSR 地址为 10H（IA32_TIME_STAMP_COUNTER），指令返回的值由"use TSC offsetting" VM 执行控制的设置决定：
        -   如果控制为 0，RDMSR 正常操作，返回 IA32_TIME_STAMP_COUNTER MSR 的值。
        -   如果控制为 1，返回的值由"use TSC scaling" VM 执行控制的设置决定：
            -   如果控制为 0，RDMSR 返回 IA32_TIME_STAMP_COUNTER MSR 的值与 TSC offset 的值之和。
            -   如果控制为 1，RDMSR 首先计算 IA32_TIME_STAMP_COUNTER MSR 的值与 TSC multiplier 的值的乘积。然后将乘积的值右移 48 位，并返回该移位值与 TSC offset 的值之和。
    -   "use TSC-offsetting" VM 执行控制的 1 设置不影响 MSR 地址为 6E0H（IA32_TSC_DEADLINE）时的 RDMSR 执行。此类执行返回相对于实际时间戳计数器的 APIC 定时器截止时间，而不考虑 TSC offset。
    -   如果 MSR 地址为 48H（IA32_SPEC_CTRL），指令返回的值由"virtualize IA32_SPEC_CTRL" VM 执行控制的设置决定：
        -   如果控制为 0，RDMSR 正常操作，返回 IA32_SPEC_CTRL MSR 的值。
        -   如果控制为 1，返回的值是 VMCS 中 IA32_SPEC_CTRL shadow 字段的值。
    -   如果 MSR 地址为 6E0H（IA32_TSC_DEADLINE），指令返回的值由"APIC-timer virtualization" VM 执行控制的设置决定：
        -   如果控制为 0，RDMSR 正常操作，返回 IA32_TSC_DEADLINE MSR 的值。
        -   如果控制为 1，返回的值是 VMCS 中 guest-deadline shadow 字段的值。
    -   如果 MSR 地址在范围 800H–8FFH 内（指示 APIC MSR），当"virtualize x2APIC mode" VM 执行控制为 1 时指令行为可能被修改；见第 32.5 节。
-   **RDMSRLIST**。RDMSRLIST 指令的行为首先由"enable MSR-list instructions" VM 执行控制的设置决定：
    
    -   如果"enable MSR-list instructions" VM 执行控制为 0，RDMSRLIST 导致无效操作码异常（#UD）。此异常优先于指令可能发生的任何其他异常。
    -   如果"enable MSR-list instructions" VM 执行控制为 1，如果 CPL > 0，指令通常导致通用保护异常（#GP）。否则，其操作取决于"use MSR bitmaps" VM 执行控制的设置：
        -   如果控制为 0，指令导致 VM 退出。
        -   如果控制为 1，指令正常开始，一次读取一个 MSR。对某些 MSR 的读取如上面对 RDMSR 所述特殊处理。此外，访问特定 MSR 的尝试可能导致 VM 退出；详见第 28.1.3 节。
-   **RDPID**。RDPID 指令的行为首先由"enable RDTSCP" VM 执行控制的设置决定：
    
    -   如果"enable RDTSCP" VM 执行控制为 0，RDPID 导致无效操作码异常（#UD）。
    -   如果"enable RDTSCP" VM 执行控制为 1，RDPID 正常操作。
-   **RDTSC**。RDTSC 指令的行为由"RDTSC exiting"和"use TSC offsetting" VM 执行控制的设置决定：
    
    -   如果两个控制都为 0，RDTSC 正常操作。
    -   如果"RDTSC exiting" VM 执行控制为 0 且"use TSC offsetting" VM 执行控制为 1，返回的值由"use TSC scaling" VM 执行控制的设置决定：
        -   如果控制为 0，RDTSC 用 IA32_TIME_STAMP_COUNTER MSR 的值与 TSC offset 的值之和加载 EAX:EDX。
        -   如果控制为 1，RDTSC 首先计算 IA32_TIME_STAMP_COUNTER MSR 的值与 TSC multiplier 的值的乘积。然后将乘积的值右移 48 位，并用该移位值与 TSC offset 的值之和加载 EAX:EDX。
    -   如果"RDTSC exiting" VM 执行控制为 1，RDTSC 导致 VM 退出。
-   **RDTSCP**。RDTSCP 指令的行为首先由"enable RDTSCP" VM 执行控制的设置决定：
    
    -   如果"enable RDTSCP" VM 执行控制为 0，RDTSCP 导致无效操作码异常（#UD）。此异常优先于指令可能发生的任何其他异常。
    -   如果"enable RDTSCP" VM 执行控制为 1，处理基于"RDTSC exiting"和"use TSC offsetting" VM 执行控制的设置：
        -   如果两个控制都为 0，RDTSCP 正常操作。
        -   如果"RDTSC exiting" VM 执行控制为 0 且"use TSC offsetting" VM 执行控制为 1，返回的值由"use TSC scaling" VM 执行控制的设置决定：
            -   如果控制为 0，RDTSCP 用 IA32_TIME_STAMP_COUNTER MSR 的值与 TSC offset 的值之和加载 EAX:EDX。
            -   如果控制为 1，RDTSCP 首先计算 IA32_TIME_STAMP_COUNTER MSR 的值与 TSC multiplier 的值的乘积。然后将乘积的值右移 48 位，并用该移位值与 TSC offset 的值之和加载 EAX:EDX。  
                在任一情况下，RDTSCP 还用 IA32_TSC_AUX MSR 的第 31:0 位的值加载 ECX。
        -   如果"RDTSC exiting" VM 执行控制为 1，RDTSCP 导致 VM 退出。
-   **SMSW**。SMSW 的行为由 CR0 客户/宿主掩码和 CR0 读阴影决定。对于对应于 CR0 客户/宿主掩码中被清除的位的每个位置，目标操作数被加载 CR0 中对应位的值。对于对应于 CR0 客户/宿主掩码中被设置的位的每个位置，目标操作数被加载 CR0 读阴影中对应位的值。因此，如果 CR0 客户/宿主掩码中的每个位都被清除，SMSW 正常从 CR0 读取；如果 CR0 客户/宿主掩码中的每个位都被设置，SMSW 返回 CR0 读阴影的值。
    
    请注意以下事项：（1）对于任何内存目标或 16 位寄存器目标，只使用 CR0 客户/宿主掩码和 CR0 读阴影的低 16 位（寄存器目标的第 63:16 位保持不变）；（2）对于 32 位寄存器目标，只使用 CR0 客户/宿主掩码和 CR0 读阴影的低 32 位（目标的第 63:32 位被清除）；以及（3）根据 CR0 客户/宿主掩码和 CR0 读阴影的内容，目标中可能设置直接读取 CR0 时永远不会设置的位。
    
-   **TPAUSE**。TPAUSE 指令的行为首先由"enable user wait and pause" VM 执行控制的设置决定：
    
    -   如果"enable user wait and pause" VM 执行控制为 0，TPAUSE 导致无效操作码异常（#UD）。此异常优先于指令可能发生的任何异常。
    -   如果"enable user wait and pause" VM 执行控制为 1，处理基于"RDTSC exiting" VM 执行控制的设置：
        -   如果"RDTSC exiting" VM 执行控制为 0，指令延迟一段时间，此处称为物理延迟（physical delay）。物理延迟首先通过确定虚拟延迟（相对于客户时间戳计数器的延迟时间）来计算。  
            如果 IA32_UMWAIT_CONTROL\[31:2\] 为零，虚拟延迟是 EDX:EAX 中的值减去 RDTSC 将返回的值（见上文）；如果 IA32_UMWAIT_CONTROL\[31:2\] 不为零，虚拟延迟是该差值与 AND(IA32_UMWAIT_CONTROL,FFFFFFFCH) 的最小值。  
            物理延迟取决于"use TSC offsetting"和"use TSC scaling" VM 执行控制的设置：
            -   如果任一控制为 0，物理延迟就是虚拟延迟。
            -   如果两个控制都为 1，虚拟延迟乘以 2⁴⁸（使用移位）以产生 128 位整数。然后该乘积除以 TSC multiplier 以产生 64 位整数。物理延迟就是该商。
        -   如果"RDTSC exiting" VM 执行控制为 1，TPAUSE 导致 VM 退出。
-   **UMONITOR**。UMONITOR 指令的行为由"enable user wait and pause" VM 执行控制的设置决定：
    
    -   如果"enable user wait and pause" VM 执行控制为 0，UMONITOR 导致无效操作码异常（#UD）。此异常优先于指令可能发生的任何异常。
    -   如果"enable user wait and pause" VM 执行控制为 1，UMONITOR 正常操作。
-   **UMWAIT**。UMWAIT 指令的行为首先由"enable user wait and pause" VM 执行控制的设置决定：
    
    -   如果"enable user wait and pause" VM 执行控制为 0，UMWAIT 导致无效操作码异常（#UD）。此异常优先于指令可能发生的任何异常。
    -   如果"enable user wait and pause" VM 执行控制为 1，处理基于"RDTSC exiting" VM 执行控制的设置：
        -   如果"RDTSC exiting" VM 执行控制为 0，且如果指令导致延迟，延迟的时间量此处称为物理延迟。物理延迟首先通过确定虚拟延迟（相对于客户时间戳计数器的延迟时间）来计算。  
            如果 IA32_UMWAIT_CONTROL\[31:2\] 为零，虚拟延迟是 EDX:EAX 中的值减去 RDTSC 将返回的值（见上文）；如果 IA32_UMWAIT_CONTROL\[31:2\] 不为零，虚拟延迟是该差值与 AND(IA32_UMWAIT_CONTROL,FFFFFFFCH) 的最小值。  
            物理延迟取决于"use TSC offsetting"和"use TSC scaling" VM 执行控制的设置：
            -   如果任一控制为 0，物理延迟就是虚拟延迟。
            -   如果两个控制都为 1，虚拟延迟乘以 2⁴⁸（使用移位）以产生 128 位整数。然后该乘积除以 TSC multiplier 以产生 64 位整数。物理延迟就是该商。
        -   如果"RDTSC exiting" VM 执行控制为 1，UMWAIT 导致 VM 退出。
-   **URDMSR**。第 28.1.3 节标识了 URDMSR 指令的执行何时导致 VM 退出。如果在飞地模式中 URDMSR 的执行本会导致此类 VM 退出，则改为发生 #GP(0) 异常。如果 URDMSR 的执行（无论在飞地模式与否）既不导致故障也不导致 VM 退出，指令的行为对某些 MSR 地址以与 RDMSR 相同的方式被修改（见上文）。
    
-   **UWRMSR**。第 28.1.3 节标识了 UWRMSR 指令的执行何时导致 VM 退出。如果在飞地模式中 UWRMSR 的执行本会导致此类 VM 退出，则改为发生 #GP(0) 异常。
    
-   **WRMSR、WRMSRNS**。第 28.1.3 节标识了 WRMSR 或 WRMSRNS 的执行何时会导致 VM 退出。如果此类执行既不因 CPL > 0 导致故障也不导致 VM 退出，指令的行为可能对某些 MSR 地址被修改：
    
    -   如果 MSR 地址为 48H（IA32_SPEC_CTRL），指令行为取决于"virtualize IA32_SPEC_CTRL" VM 执行控制的设置：
        
        -   如果控制为 0，WRMSR 和 WRMSRNS 正常操作，用指令的源操作数加载 IA32_SPEC_CTRL MSR。
            
        -   如果控制为 1，指令将尝试使用指令的源操作数写入 IA32_SPEC_CTRL MSR，但它只尝试修改与 VMCS 中 IA32_SPEC_CTRL mask 字段中被清除的位对应的位置上的位。
            
            具体来说，指令尝试使用以下值写入 MSR：  
            (MSR_VAL & ISC_MASK) OR (SRC & NOT ISC_MASK)  
            其中 MSR_VAL 是 MSR 的原始值，ISC_MASK 是 IA32_SPEC_CTRL mask，SRC 是指令的源操作数。
            
            将那个值写入 MSR 导致的任何故障（例如，由于保留位违规）正常发生。否则，该值被写入 MSR。
            
            对 MSR 的此类写入将具有正常使用上述指示的值写入 MSR 时会发生的任何副作用（包括向被掩码的位写入未改变的值可能导致的任何副作用）。
            
            如果写入无故障完成，源操作数的未修改值被写入 VMCS 中的 IA32_SPEC_CTRL shadow 字段。
            
    -   如果 MSR 地址为 79H（IA32_BIOS_UPDT_TRIG），不加载微码更新，控制传递到下一条指令。这意味着微码更新不能在 VMX 非根操作中加载。
        
    -   在支持 Intel PT 但不允许其在 VMX 操作中使用的处理器上，如果 MSR 地址为 570H（IA32_RTIT_CTL），指令导致通用保护异常。¹
        
    -   如果 MSR 地址为 6E0H（IA32_TSC_DEADLINE），指令行为取决于"APIC-timer virtualization" VM 执行控制的设置：
        
        -   如果控制为 0，WRMSR 和 WRMSRNS 正常操作，用指令的源操作数加载 IA32_TSC_DEADLINE MSR。
        -   如果控制为 1，源操作数被写入 VMCS 中的 guest-deadline shadow 字段。  
            如果源操作数为零，客户截止时间被清除为零，解除客户定时器的武装（见第 28.5.10.1 节）。  
            如果源操作数不为零，它与虚拟 TSC（基于 TSC offsetting 和 TSC scaling 的当前配置，RDTSC 将返回的值）进行比较：
            -   如果源操作数超过虚拟 TSC（截止时间在未来），按如下方式计算新的客户截止时间。源操作数被解释为虚拟截止时间。处理器基于 TSC offsetting 和 TSC scaling 的当前配置转换该值。转换后的值被加载到客户截止时间中，武装客户定时器（见第 28.5.10.1 节）。
            -   否则，截止时间已到达。在这种情况下，逻辑处理器执行第 28.5.10.2 节中详述的处理客户定时器事件时执行的操作（挂起虚拟定时器中断并清除客户截止时间）。  
                注意当"APIC-timer virtualization" VM 执行控制为 1 时，这些 WRMSR 和 WRMSRNS 执行不访问 IA32_TSC_DEADLINE MSR，也不以任何方式与 APIC 定时器交互。
    -   如果 MSR 地址为 808H（IA32_X2APIC_TPR）、80BH（IA32_X2APIC_EOI）、830H（IA32_X2APIC_ICR）或 83FH（IA32_X2APIC_SELF_IPI），当"virtualize x2APIC mode" VM 执行控制为 1 时指令行为可能被修改；见第 32.5 节。
        
-   **WRMSRLIST**。WRMSRLIST 指令的行为首先由"enable MSR-list instructions" VM 执行控制的设置决定：
    
    -   如果"enable MSR-list instructions" VM 执行控制为 0，WRMSRLIST 导致无效操作码异常（#UD）。此异常优先于指令可能发生的任何其他异常。
    -   如果"enable MSR-list instructions" VM 执行控制为 1，如果 CPL > 0，指令通常导致通用保护异常（#GP）。否则，其操作取决于"use MSR bitmaps" VM 执行控制的设置：
        -   如果控制为 0，指令导致 VM 退出。
        -   如果控制为 1，指令正常开始，一次写入一个 MSR。对某些 MSR 的写入如上面对 WRMSR 和 WRMSRNS 所述特殊处理。此外，访问特定 MSR 的尝试可能导致 VM 退出；详见第 28.1.3 节。
-   **XRSTORS**。XRSTORS 指令的行为首先由"enable
    

XSAVES/XRSTORS" VM 执行控制：

-   如果"enable XSAVES/XRSTORS" VM 执行控制为 0，XRSTORS 导致无效操作码异常（#UD）。
-   如果"enable XSAVES/XRSTORS" VM 执行控制为 1，处理基于 XSS-exiting 位图的值（见第 27.6.20 节）：
    -   如果以下三个值的逻辑与中设置了任何位，XRSTORS 导致 VM 退出：EDX:EAX、IA32_XSS MSR 和 XSS-exiting 位图。
    -   否则，XRSTORS 正常操作。

> **注：**
> 
> 1.  软件应读取 VMX 能力 MSR IA32_VMX_MISC 以确定处理器是否允许 Intel PT 在 VMX 操作中使用（见附录 A.6）。

-   **XSAVES**。XSAVES 指令的行为首先由"enable XSAVES/XRSTORS" VM 执行控制的设置决定：
    -   如果"enable XSAVES/XRSTORS" VM 执行控制为 0，XSAVES 导致无效操作码异常（#UD）。
    -   如果"enable XSAVES/XRSTORS" VM 执行控制为 1，处理基于 XSS-exiting 位图的值（见第 27.6.20 节）：
        -   如果以下三个值的逻辑与中设置了任何位，XSAVES 导致 VM 退出：EDX:EAX、IA32_XSS MSR 和 XSS-exiting 位图。
        -   否则，XSAVES 正常操作。

## 28.4 VMX 非根操作中的其他变化

事件阻止、任务切换和某些影子栈更新的处理在 VMX 非根操作中可能不同，如下面各节所述。

### 28.4.1 事件阻止

事件阻止在 VMX 非根操作中按如下方式修改：

-   如果"external-interrupt exiting" VM 执行控制为 1，RFLAGS.IF 不控制外部中断的阻止。在这种情况下，未因其他原因被阻止的外部中断导致 VM 退出（即使 RFLAGS.IF = 0）。
-   如果"external-interrupt exiting" VM 执行控制为 1，外部中断可能被 STI 或 MOV SS 阻止，也可能不被阻止（行为是实现特定的）。
-   如果"NMI exiting" VM 执行控制为 1，非可屏蔽中断（NMI）可能被 STI 或 MOV SS 阻止，也可能不被阻止（行为是实现特定的）。

### 28.4.2 任务切换的处理

VMX 非根操作中不允许任务切换。在 VMX 非根操作中尝试实现任务切换的任何行为都会导致 VM 退出。然而，在由于任务切换导致 VM 退出的任何可能性之前，按（指示的顺序）执行以下检查，可能产生故障：

1.  如果正在使用任务门（task gate），对其 P 位和相关特权字段的正确值进行适当检查。以下情况详述执行的特权检查：  
    a. 如果 CALL、INT n、INT1、INT3、INTO 或 JMP 在 IA-32e 模式中访问任务门，发生通用保护异常。  
    b. 如果 CALL、INT n、INT3、INTO 或 JMP 在 IA-32e 模式之外访问任务门，对任务门执行特权级检查，但如果它们通过，则不对所引用的任务状态段（TSS）描述符检查特权级。  
    c. 如果 CALL 或 JMP 在 IA-32e 模式中直接访问 TSS 描述符，发生通用保护异常。  
    d. 如果 CALL 或 JMP 在 IA-32e 模式之外直接访问 TSS 描述符，对 TSS 描述符检查特权级。  
    e. 如果非可屏蔽中断（NMI）、异常或外部中断在 IA-32e 模式中访问 IDT 中的任务门，发生通用保护异常。  
    f. 如果非可屏蔽中断（NMI）、除断点异常（#BP）和溢出异常（#OF）之外的异常或外部中断在 IA-32e 模式之外访问 IDT 中的任务门，不执行特权检查。  
    g. 如果在 IA-32e 模式中以 RFLAGS.NT = 1 执行 IRET，发生通用保护异常。  
    h. 如果在 IA-32e 模式之外以 RFLAGS.NT = 1 执行 IRET，直接访问 TSS 描述符且不进行特权检查。
2.  对新 TSS 选择器进行检查（例如，在 GDT 限长内）。
3.  读取新 TSS 描述符。（如果相关 GDT 页不存在，产生页故障。）
4.  检查 TSS 描述符的类型（取决于任务切换的类型）、P 位、S 位和限长的适当值。

只有检查 1–4 全部通过（不产生故障）时，才可能发生 VM 退出。然而，由于任务切换导致的 VM 退出与访问旧 TSS 或新 TSS 导致的页故障之间的顺序是实现特定的。如果访问任一 TSS 会导致页故障，某些处理器可能生成页故障（而不是由于任务切换导致的 VM 退出）。其他处理器可能生成由于任务切换导致的 VM 退出，即使访问任一 TSS 会导致页故障。

如果通过 IDT 中的任务门尝试任务切换引起异常（在生成由于任务切换导致的 VM 退出之前），且该异常导致 VM 退出，则关于其交付访问了任务门的事件的信息记录在原始事件字段中，关于导致 VM 退出的异常的信息记录在退出事件字段中。见第 30.2 节。访问任务门的事实不记录在 VMCS 中。

如果通过 IDT 中的任务门尝试任务切换导致由于任务切换的 VM 退出，则关于其交付访问了任务门的事件的信息记录在 VMCS 的原始事件字段中。由于此类 VM 退出的原因是任务切换而不是其他事件，退出事件标识字段的有效位为 0。见第 30.2 节。

### 28.4.3 影子栈更新

如《Intel® 64 和 IA-32 架构软件开发手册》第 1 卷第 18.2.3 节"管理影子栈令牌"所述，影子栈的切换可能作为 IDT 事件交付的一部分或改变 CPL 的远 CALL 执行的一部分发生，或作为使用中断栈表（IST）的 IDT 事件交付的一部分发生。

作为影子栈切换的一部分，处理器通过操作位于新影子栈基址的管理影子栈令牌获得对新栈的独占访问。处理器读取令牌并确认令牌的第 0 位（其忙位）为 0（此外还有其他确认）。如果忙位已经为 1，转换（事件交付或远 CALL）导致通用保护故障且不完成。如果忙位为 0，转换通过向内存中的令牌写入来设置忙位。（该更新与令牌的原始读取是原子的。）

如果转换以 CPL < 3 开始，它将在令牌更新之后向新影子栈压入三个项目（对应 CS 选择器、指令指针和影子栈指针的旧值）。如《Intel® 64 和 IA-32 架构软件开发手册》第 1 卷第 18.2.3 节所述，如果任何压入导致 VM 退出，处理器将恢复到旧影子栈，且新影子栈令牌中的忙位保持被设置。称新影子栈为过早繁忙（prematurely busy）。

如果"prematurely busy shadow stack" VM 退出控制为 1，导致影子栈过早繁忙的 VM 退出将通过保存在 VMCS 中的信息指示该事实。见第 30.2.1 节。

## 28.5 VMX 非根操作特有的功能

某些 VM 执行控制支持 VMX 非根操作特有的功能。它们是 VMX 抢占定时器（第 28.5.1 节）和监视器陷阱标志（第 28.5.2 节）、客户物理地址的转换（第 28.5.3 节和第 28.5.4 节）、APIC 虚拟化（第 28.5.6 节）、VM 函数（第 28.5.7 节）、虚拟化异常（第 28.5.8 节）、PASID 转换（第 28.5.9 节）和客户定时器（第 28.5.10 节）。

### 28.5.1 VMX 抢占定时器

如果最后一次 VM 进入是以"activate VMX-preemption timer" VM 执行控制的 1 设置执行的，VMX 抢占定时器在 VMX 非根操作中倒计时（从 VM 进入加载的值开始；见第 29.7.4 节）。当定时器倒计时到零时，它停止倒计时并发生 VM 退出（见第 28.2 节）。

VMX 抢占定时器以与时间戳计数器（TSC）成比例的速率倒计时。具体来说，每次 TSC 中的第 X 位由于 TSC 递增而变化时，定时器递减 1。X 的值在 0–31 范围内，可以通过查阅 VMX 能力 MSR IA32_VMX_MISC（见附录 A.6）确定。

VMX 抢占定时器在 C 状态 C0、C1 和 C2 中运行；它也在关闭和 wait-for-SIPI 状态中运行。如果定时器在任何非 wait-for-SIPI 状态倒计时到零，逻辑处理器转换到 C0 C 状态并导致 VM 退出；如果定时器在 wait-for-SIPI 状态倒计时到零，它不导致 VM 退出。定时器在比 C2 更深的 C 状态中不递减。

系统管理中断（SMI）和系统管理模式（SMM）情况下定时器的处理取决于 SMI 和 SMM 的处理方式：

-   如果 SMI 和 SMM 的默认处理（见第 34.14 节）处于活动状态，VMX 抢占定时器跨 SMI 到 VMX 非根操作、随后在 SMM 中的执行以及通过 RSM 指令从 SMM 的返回进行计数。然而，定时器只能从 VMX 非根操作导致 VM 退出。如果定时器在 SMI 期间、SMM 中或 RSM 期间到期，定时器诱导的 VM 退出在 RSM 之后立即以其正常优先级发生，除非它基于活动状态被阻止（第 28.2 节）。
-   如果 SMI 和 SMM 的双监视器处理（见第 34.15 节）处于活动状态，进入和离开 SMM 分别是 VM 退出和 VM 进入。那些转换对 VMX 抢占定时器的处理与普通 VM 退出和 VM 进入基本相同；第 34.15.2 节和第 34.15.4 节详述了一些差异。

### 28.5.2 监视器陷阱标志

监视器陷阱标志是一个调试功能，使 VM 退出在 VMX 非根操作中的某些指令边界上发生。此类 VM 退出称为 MTF VM 退出。MTF VM 退出可以在 VMX 非根操作中的指令边界上按如下方式发生：

-   如果"monitor trap flag" VM 执行控制为 1 且 VM 进入正在注入向量事件（见第 29.6.1 节），MTF VM 退出在 VM 进入之后的第一个指令之前的指令边界上挂起。
-   如果 VM 进入正在注入挂起的 MTF VM 退出（见第 29.6.2 节），MTF VM 退出在 VM 进入之后的第一个指令之前的指令边界上挂起。即使"monitor trap flag" VM 执行控制为 0，也是如此。
-   如果"monitor trap flag" VM 执行控制为 1、VM 进入没有注入事件，且在指令可以执行之前交付了挂起的事件（例如，调试异常或中断），MTF VM 退出在事件（或任何嵌套异常）交付之后的指令边界上挂起。
-   假设"monitor trap flag" VM 执行控制为 1、VM 进入没有注入事件，且 VM 进入之后的第一个指令是 REP 前缀的字符串指令：
    -   如果指令的第一次迭代导致故障，MTF VM 退出在故障（或任何嵌套异常）交付之后的指令边界上挂起。
    -   如果指令的第一次迭代不导致故障，MTF VM 退出在该迭代之后的指令边界上挂起。
-   假设"monitor trap flag" VM 执行控制为 1、VM 进入没有注入事件，且 VM 进入之后的第一个指令是 XBEGIN 指令。在这种情况下，MTF VM 退出在 XBEGIN 指令的回退指令地址处挂起。无论是否已启用 RTM 事务区域的进阶调试（见《Intel® 64 和 IA-32 架构软件开发手册》第 1 卷第 17.3.7 节"支持 RTM 的调试器支持"），此行为都适用。
-   假设"monitor trap flag" VM 执行控制为 1、VM 进入没有注入事件，且 VM 进入之后的第一个指令既不是 REP 前缀的字符串指令也不是 XBEGIN 指令：
    -   如果指令导致故障，MTF VM 退出在故障（或任何嵌套异常）交付之后的指令边界上挂起。¹
    -   如果指令不导致故障，MTF VM 退出在该指令执行之后的指令边界上挂起。如果指令是 INT1、INT3 或 INTO，该边界在任何软件异常交付之后。如果指令是 INT n，该边界在软件中断交付之后。如果指令是 HLT，MTF VM 退出将来自 HLT 活动状态。

如果在到达 MTF VM 退出本会挂起的指令边界之前发生另一个 VM 退出（例如，由于异常或三重故障），则不发生 MTF VM 退出。

MTF VM 退出在其挂起的指令边界上发生，除非更高优先级事件优先或 MTF VM 退出由于活动状态被阻止：

-   系统管理中断（SMI）、INIT 信号和更高优先级事件优先于 MTF VM 退出。MTF VM 退出优先于调试陷阱异常和更低优先级事件。
-   如果处理器处于关闭活动状态或 wait-for-SIPI 活动状态，则不发生 MTF VM 退出。如果随后非可屏蔽中断在不导致 VM 退出的情况下将逻辑处理器带出关闭活动状态，MTF VM 退出在该中断交付之后挂起。

Intel SGX 指令或逻辑处理器处于飞地模式时可能适用特殊处理。详见第 43.2 节。

### 28.5.3 使用 EPT 转换客户物理地址

扩展页表机制（EPT）是一个可以用于支持物理内存虚拟化的功能。当 EPT 在使用中时，某些物理地址被视为客户物理地址，不直接用于访问内存。相反，客户物理地址通过遍历一组 EPT 分页结构来转换，以产生用于访问内存的物理地址。

EPT 机制的详细信息见第 31.3 节。

### 28.5.4 Intel 处理器追踪使用的客户物理地址的转换

如第 36 章所述，Intel® 处理器追踪（Intel PT）使用专用硬件设施捕获关于软件执行的信息。

Intel PT 可以配置为使用物理地址将追踪输出写入内存。例如，当使用 ToPA（物理地址表）输出机制时，IA32_RTIT_OUTPUT_BASE MSR 包含当前 ToPA 基址的物理地址。该表中的每个条目包含内存中输出区域的物理地址。当输出区域变满时，ToPA 输出机制将后续追踪输出引导到 ToPA 中指示的下一个输出区域。

当"Intel PT uses guest physical addresses" VM 执行控制为 1 时，逻辑处理器将 Intel PT 使用的地址（输出地址以及用于发现输出地址的地址）视为客户物理地址，在追踪输出写入内存之前使用 EPT 转换为物理地址。

通过 EPT 转换这些地址意味着追踪输出机制可能导致 EPT 违规和 VM 退出；第 28.5.4.1 节提供了详细信息。第 28.5.4.2 节描述了一种确保这些 VM 退出不会导致追踪数据丢失的机制。

#### 28.5.4.1 Intel PT 的客户物理地址转换：细节

当"Intel PT uses guest physical addresses" VM 执行控制为 1 时，Intel PT 使用的地址被视为客户物理地址并使用 EPT 转换。这些地址包括输出区域的地址以及包含输出区域地址的 ToPA 条目的地址。

追踪输出过程对访问的转换可能导致 EPT 违规或 EPT 误配置（第 31.3.3 节），导致 VM 退出。由追踪输出过程产生的 EPT 违规总是导致 VM 退出，永远不会转换为虚拟化异常（第 28.5.8.1 节）。

如果未发生 EPT 违规或 EPT 误配置，且已启用页修改日志（第 31.3.6 节），输出区域的地址可能被添加到页修改日志。如果日志已满，发生页修改日志已满事件，导致 VM 退出。

如果"virtualize APIC accesses" VM 执行控制为 1，追踪输出过程使用的客户物理地址可能被转换为 APIC-access 页上的地址。在这种情况下，追踪输出过程的访问导致如第 32.4.6.1 节所讨论的 APIC-access VM 退出。

#### 28.5.4.2 追踪地址预转换（TAPT）

由于处理器在将 Intel PT 产生的追踪数据写入内存之前对其进行缓冲，处理器确保当 VM 退出禁用 Intel PT 时缓冲的数据不会丢失。具体来说，处理器确保当前输出页中为缓冲数据留有足够的空间。如果不这样做，缓冲的追踪数据可能丢失，产生的追踪被破坏。

为防止缓冲追踪数据的丢失，处理器使用一种称为追踪地址预转换（trace-address pre-translation，TAPT）的机制。使用 TAPT，处理器在该地址本会用于将缓冲的追踪数据写入内存之前，使用 EPT 转换当前输出区域的客户物理地址。

由于 TAPT，在输出写入内存时不会发生转换（因此不会发生 EPT 违规）；对内存的写入使用作为 TAPT 的一部分缓存的转换。（第 28.5.4.1 节给出的细节适用于 TAPT。）TAPT 确保，如果对输出区域的写入本会导致 EPT 违规，所产生的 VM 退出在 TAPT 时交付，在该区域本会被使用之前。这允许软件在那时解决 EPT 违规，并确保当需要将缓冲的追踪数据写入内存时，那些数据不会由于 EPT 违规而丢失。

TAPT（以及产生的 VM 退出）可以在以下任何时间发生：

-   当 VMX 非根操作中的软件通过使用 WRMSR 指令或 XRSTORS 指令加载 IA32_RTIT_CTL MSR 来设置 TraceEn 位以启用追踪时。
    
    在这种情况下由 TAPT 产生的任何 VM 退出都是类陷阱的：WRMSR 或 XRSTORS 在 VM 退出发生之前完成（例如，保存在 VMCS 客户状态区域中的 CS:RIP 的值引用下一条指令）。
    
-   在一个输出区域变满且 Intel PT 转换到下一个输出区域时，在指令边界上。
    
    在这种情况下由 TAPT 产生的 VM 退出优先于任何挂起的调试异常。此类 VM 退出将在 VMCS 的客户状态区域中保存关于此类异常的信息。
    
-   作为启用 Intel PT 的 VM 进入的一部分。详见第 29.5 节。
    

TAPT 不仅可以转换当前输出区域的客户物理地址，还可以转换后续输出区域的客户物理地址。（这样做可以为追踪数据提供更好的保护。）这意味着由 TAPT 产生的任何 VM 退出可能来自对非当前输出区域的输出区域地址的转换。

### 28.5.5 架构 PEBS 使用的客户物理地址的转换

如第 22.10 节"架构 PEBS"所述，架构 PEBS 响应性能监视计数器的溢出记录采样信息。

架构 PEBS 通常配置为使用物理地址将记录写入内存。IA32_PEBS_BASE MSR 包含 PEBS 缓冲区基址的物理地址。然而，当"PEBS uses guest physical addresses" VM 执行控制为 1 时，逻辑处理器将 PEBS 使用的地址视为客户物理地址，在 PEBS 记录写入内存之前使用 EPT 转换为物理地址。

通过 EPT 转换这些地址意味着 PEBS 记录的写入可能导致 EPT 违规或 EPT 误配置（第 31.3.3 节），导致 VM 退出。由 PEBS 产生的 EPT 违规总是导致 VM 退出，永远不会转换为虚拟化异常（第 28.5.8.1 节）。

如果未发生 EPT 违规或 EPT 误配置，且已启用页修改日志（第 31.3.6 节），PEBS 缓冲区的地址可能被添加到页修改日志。如果日志已满，发生页修改日志已满事件，导致 VM 退出。

如果"virtualize APIC accesses" VM 执行控制为 1，PEBS 使用的客户物理地址可能被转换为 APIC-access 页上的地址。在这种情况下，PEBS 的访问导致如第 32.4.6.1 节所讨论的 APIC-access VM 退出。

以下条目指定了当 PEBS 的内存访问导致上述标识的 VM 退出之一时 PEBS 处理的细节：

-   生成 PEBS 记录的任何性能监视计数器的溢出位不被重置。
    
-   生成 PEBS 记录的性能监视计数器不被重新加载。
    
-   IA32_PEBS_INDEX MSR 中的 WR_OFFSET 字段不被递增以指示 PEBS 记录的写入。
    

### 28.5.6 APIC 虚拟化

APIC 虚拟化是一组可以用于支持中断和高级可编程中断控制器（APIC）虚拟化的功能。当启用 APIC 虚拟化时，处理器模拟对 APIC 的许多访问、跟踪虚拟 APIC 的状态并交付虚拟中断——所有这些都在 VMX 非根操作中完成，无需 VM 退出。

APIC 虚拟化的详细信息见第 32 章。

### 28.5.7 VM 函数

VM 函数是处理器提供的一种操作，可以在 VMX 非根操作中调用而无需 VM 退出。VM 函数通过 VMCS 中不同字段的设置启用和配置。VMX 非根操作中的软件使用 VMFUNC 指令调用 VM 函数；EAX 的值选择正在调用的特定 VM 函数。

第 28.5.7.1 节解释如何启用 VM 函数。第 28.5.7.2 节规定 VMFUNC 指令的行为。第 28.5.7.3 节描述一个称为 EPTP switching 的特定 VM 函数。

#### 28.5.7.1 启用 VM 函数

软件通过设置"enable VM functions" VM 执行控制来总体上启用 VM 函数。特定 VM 函数通过设置相应的 VM 函数控制启用。

例如，假设软件想要启用 EPTP switching（VM 函数 0；见第 27.6.14 节）。为此，它必须设置"activate secondary controls" VM 执行控制（主要基于处理器的 VM 执行控制的第 31 位）、"enable VM functions" VM 执行控制（次要基于处理器的 VM 执行控制的第 13 位）和"EPTP switching" VM 函数控制（VM 函数控制的第 0 位）。

#### 28.5.7.2 VMFUNC 指令的一般操作

如果"enable VM functions" VM 执行控制为 0¹ 或 EAX 的值大于 63（只能启用 VM 函数 0–63），VMFUNC 指令导致无效操作码异常（#UD）。否则，如果 VM 函数控制中位置 EAX 处的位为 0（所选 VM 函数未启用），指令导致 VM 退出。如果发生此类 VM 退出，使用的基本退出原因是 59（3BH），指示"VMFUNC"，并且 VMFUNC 指令的长度被保存到 VM-exit 指令长度字段。如果指令既不导致无效操作码异常也不由于禁用的 VM 函数导致 VM 退出，它执行 EAX 中的值指定的 VM 函数的功能。

单个 VM 函数可以执行额外的故障检查（例如，如果 CPL > 0，一个函数可能导致通用保护异常）。此外，特定 VM 函数可以包括可能导致 VM 退出的检查。如果发生此类 VM 退出，VM 退出信息按上一段所述保存。VM 函数的规范可以指示提供附加的 VM 退出信息。

EPTP-switching VM 函数的特定行为（包括导致 VM 退出的检查）在第 28.5.7.3 节中给出。

#### 28.5.7.3 EPTP 切换

EPTP switching 是 VM 函数 0。此 VM 函数允许 VMX 非根操作中的软件加载 EPT 指针（EPTP）的新值，从而建立不同的 EPT 分页结构层级（EPT 操作细节见第 31.3 节）。软件仅限于从由 VMX 根操作中的软件预先配置的潜在 EPTP 值列表中选择。

具体来说，ECX 的值用于从 EPTP 列表中选择一个条目，EPTP 列表是 EPTP-list 地址引用的 4-KByte 结构（见第 27.6.14 节；由于此结构包含 512 个 8 字节条目，如果 ECX ≥ 512，VMFUNC 导致 VM 退出）。评估所选条目中的 EPTP 值以确定它对于 EPTP switching 是否有效：如果（1）它在第 5:3 位与当前 EPTP 值相同（这些位指定 EPT 页遍历长度）；且（2）它不会导致 VM 进入失败（见第 29.2.1.1 节），则该值有效。如果该值无效，发生 VM 退出。否则，该值被存储在当前 VMCS 的 EPTP 字段中，并用于后续使用客户物理地址的访问。以下伪代码提供了细节：

```python
IF ECX ≥ 512
THEN VM exit;
ELSE
  tent_EPTP := 从 EPTP-list 地址 + 8 * ECX 处读取的 8 字节;
  IF tent_EPTP 不是有效的 EPTP 值（如果在 EPTP 中会导致 VM 进入失败或改变 EPT 页遍历长度）
  THEN VM exit;
  ELSE
    将 tent_EPTP 写入当前 VMCS 中的 EPTP 字段;
    使用 tent_EPTP 作为地址转换的新 EPTP 值;
    IF 处理器支持"EPT-violation #VE" VM 执行控制的 1 设置
    THEN
      将 ECX[15:0] 写入当前 VMCS 中的 EPTP-index 字段;
      使用 ECX[15:0] 作为后续 EPT 违规虚拟化异常的 EPTP 索引（见第 28.5.8.2 节）;
    FI;
  FI;
FI;
```

EPTP-switching VM 函数的执行不修改任何寄存器的状态；不修改任何标志。

如果"Intel PT uses guest physical addresses" VM 执行控制为 1 且 IA32_RTIT_CTL.TraceEn = 1，EPTP-switching VM 函数的任何执行都会导致 VM 退出。¹

如第 28.5.7.2 节所述，导致 VM 退出的 EPTP-switching VM 函数的执行（如上所述）使用基本退出原因 59，指示"VMFUNC"。VMFUNC 指令的长度被保存到 VM-exit 指令长度字段。不提供附加的 VM 退出信息。

从 EPTP 列表加载 EPTP（因此不导致故障或 VM 退出）的 VMFUNC 执行称为 EPTP-switching VMFUNC。在 EPTP-switching VMFUNC 之后，控制传递到下一条指令。逻辑处理器开始创建和使用与 EPTP 第 51:12 位的新值相关联的客户和组合映射；创建和使用的组合映射与当前 VPID 和 PCID 相关联（这些不被 VMFUNC 改变）。² 如果"enable VPID" VM 执行控制为 0，EPTP-switching VMFUNC 使与 VPID 0000H 相关联的组合映射失效（对所有 PCID 和所有 EPTRTA 值，其中 EPTRTA 是 EPTP 第 51:12 位的值）。

由于 EPTP-switching VMFUNC 可能改变客户物理地址的转换，它可能影响 CR3 中客户物理地址的使用。EPTP-switching VMFUNC 本身不能由于通过新 EPT 分页结构转换该客户物理地址时的 EPT 违规或 EPT 误配置导致 VM 退出。以下条目提供了在 CR0.PG = 1 时适用的细节：

-   如果正在使用 32 位分页或 4 级分页¹（CR4.PAE = 0 或 IA32_EFER.LMA = 1），下一次使用线性地址的内存访问使用通过新 EPT 分页结构的 CR3 中客户物理地址的转换。因此，此访问可能由于该转换期间遇到的 EPT 违规或 EPT 误配置导致 VM 退出。
    
-   如果正在使用 PAE 分页（CR4.PAE = 1 且 IA32_EFER.LMA = 0），EPTP-switching VMFUNC 不从 CR3 中的客户物理地址加载四个页目录指针表项（PDPTE）。逻辑处理器继续使用 PDPTE 中已存在的四个客户物理地址。CR3 中的客户物理地址不通过新 EPT 分页结构转换（直到某个本会加载 PDPTE 的操作）。
    
    EPTP-switching VMFUNC 本身不能由于在转换任何 PDPTE 中的客户物理地址时遇到的 EPT 违规或 EPT 误配置导致 VM 退出。后续使用线性地址的内存访问使用通过新 EPT 分页结构的适当 PDPTE 中客户物理地址的转换。因此，此类访问可能由于该转换期间遇到的 EPT 违规或 EPT 误配置导致 VM 退出。
    

如果 EPTP-switching VMFUNC 建立一个启用 EPT 访问和脏标志（通过设置第 6 位）的 EPTP 值，如果自上次使用一个不启用 EPT 访问和脏标志（因为第 6 位被清除）且在第 51:12 位与新值相同的 EPTP 值以来没有适当执行 INVEPT，后续内存访问可能无法按指定设置那些标志。

如果处理器支持"EPT-violation #VE" VM 执行控制的 1 设置，EPTP-switching VMFUNC 将 ECX\[15:0\] 中的值加载到当前 VMCS 中的 EPTP-index 字段。后续 EPT 违规虚拟化异常将此值保存到虚拟化异常信息区域（见第 28.5.8.2 节）。

### 28.5.8 虚拟化异常

虚拟化异常（virtualization exception）是一种新的处理器异常。它使用向量 20，缩写为 #VE。

虚拟化异常只能在 VMX 非根操作中发生。虚拟化异常仅在具有某些 VM 执行控制的某些设置时发生。一般来说，这些设置意味着某些通常会导致 VM 退出的条件反而导致虚拟化异常。

特别是，"EPT-violation #VE" VM 执行控制的 1 设置导致一些 EPT 违规生成虚拟化异常而不是 VM 退出。第 28.5.8.1 节提供了处理器如何确定 EPT 违规导致虚拟化异常还是 VM 退出的细节。

当处理器遇到虚拟化异常时，它将关于异常的信息保存到虚拟化异常信息区域；见第 28.5.8.2 节。

在保存虚拟化异常信息之后，处理器像交付任何其他异常一样交付虚拟化异常；详见第 28.5.8.3 节。

#### 28.5.8.1 可转换的 EPT 违规

如果"EPT-violation #VE" VM 执行控制为 0（例如，在不支持此功能的处理器上），EPT 违规总是导致 VM 退出。如果相反控制为 1，某些 EPT 违规可能被转换以改为导致虚拟化异常；此类 EPT 违规是可转换的（convertible）。

某些 EPT 分页结构条目的值决定哪些 EPT 违规是可转换的。具体来说，某些 EPT 分页结构条目的第 63 位可以被定义为表示 suppress #VE：

-   如果 EPT 分页结构条目的第 2:0 位全为 0，条目不存在。² 如果处理器在转换客户物理地址时遇到此类条目，它导致 EPT 违规。当且仅当条目的第 63 位为 0 时，该 EPT 违规是可转换的。
-   如果 EPT 分页结构条目存在，应用以下情况：
    -   如果 EPT 分页结构条目的值不受支持，条目被误配置。如果处理器在转换客户物理地址时遇到此类条目，它导致 EPT 误配置（而不是 EPT 违规）。EPT 误配置总是导致 VM 退出。
    -   如果 EPT 分页结构条目的值受支持，应用以下情况：
        -   如果条目的第 7 位为 1，或如果条目是 EPT PTE，条目映射一页。如果处理器使用此类条目转换客户物理地址，且如果对该地址的访问导致 EPT 违规，当且仅当条目的第 63 位为 0 时，该 EPT 违规是可转换的。
        -   如果条目的第 7 位为 0 且条目不是 EPT PTE，条目引用另一个 EPT 分页结构。处理器不使用条目的第 63 位的值来确定任何后续 EPT 违规是否可转换。

如果对客户物理地址的访问导致 EPT 违规，用于转换该地址的 EPT 分页结构条目中恰好一个的第 63 位用于确定 EPT 违规是否可转换：一个不存在的条目（如果客户物理地址不转换到物理地址）或一个映射页的条目（如果它转换）。

如果以下所有条件都成立，可转换的 EPT 违规反而导致虚拟化异常：

-   CR0.PE = 1；
-   逻辑处理器不在交付事件的过程中；
-   EPT 违规没有导致影子栈过早繁忙（见第 28.4.3 节）；
-   EPT 违规不是由 Intel 处理器追踪的输出过程产生的（第 28.5.4 节）；且
-   EPT 违规不是由 PEBS 产生的（第 28.5.5 节）；且
-   虚拟化异常信息区域中偏移 4 处的 32 位全为 0。

虚拟化异常的交付将值 FFFFFFFFH 写入虚拟化异常信息区域中的偏移 4 处（见第 28.5.8.2 节）。因此，一旦发生虚拟化异常，只有软件清除此字段后才能再次发生。

#### 28.5.8.2 虚拟化异常信息

虚拟化异常将数据保存到虚拟化异常信息区域（见第 27.6.19 节）。表 28-23 列举了保存的数据和该区域的格式。

**表 28-23. 虚拟化异常信息区域的格式**

| 字节偏移 | 内容  |
| --- | --- |
| 0   | 如果发生 VM 退出而不是虚拟化异常，本会被保存到 VMCS 中作为退出原因的 32 位值。对于 EPT 违规，此值为 48（00000030H）。 |
| 4   | FFFFFFFFH |
| 8   | 如果发生 VM 退出而不是虚拟化异常，本会被保存到 VMCS 中作为退出资格的 64 位值 |
| 16  | 如果发生 VM 退出而不是虚拟化异常，本会被保存到 VMCS 中作为客户线性地址的 64 位值 |
| 24  | 如果发生 VM 退出而不是虚拟化异常，本会被保存到 VMCS 中作为客户物理地址的 64 位值 |
| 32  | EPTP 索引 VM 执行控制的当前 16 位值（见第 27.6.19 节和第 28.5.7.3 节） |

VMM 可以允许客户软件访问虚拟化异常信息区域。如果它这样做，客户软件可以修改该内存（例如，清除偏移 4 处的 32 位值；见第 28.5.8.1 节）。（这是第 27.11.4 节给出的一般要求的例外。）

#### 28.5.8.3 虚拟化异常的交付

在保存虚拟化异常信息之后，处理器像处理其他异常一样处理虚拟化异常：

-   如果 VMCS 中异常位图的第 20 位（#VE）为 1，虚拟化异常导致 VM 退出（见下文）。如果该位为 0，虚拟化异常使用向量 20 交付。
-   虚拟化异常不产生错误码。虚拟化异常的交付不向栈压入错误码。
-   关于双故障，虚拟化异常具有与页故障相同的严重性。如果虚拟化异常的交付遇到一个既是促成性（contributory）又是页故障的嵌套故障，则生成双故障（#DF）。见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 7 章"事件 8——双故障异常（#DF）"。

在交付另一个异常时不可能遇到虚拟化异常（见第 28.5.8.1 节）。

如果虚拟化异常直接导致 VM 退出（因为异常位图中的第 20 位为 1），关于异常的信息正常保存在 VMCS 中的退出事件标识字段中（见第 30.2.2 节）。具体来说，事件被报告为向量 20 且无错误码的硬件异常。字段的第 12 位（由 IRET 导致的 NMI 解除阻止）正常设置。

如果虚拟化异常间接导致 VM 退出（因为异常位图中的第 20 位为 0 且异常的交付生成一个导致 VM 退出的事件），关于异常的信息正常保存在 VMCS 中的原始事件标识字段中（见第 30.2.4 节）。具体来说，事件被报告为向量 20 且无错误码的硬件异常。

### 28.5.9 PASID 转换

ENQCMD 和 ENQCMDS 指令各自执行一个 64 字节的入队存储，在第 19:0 位包含一个 20 位 PASID 值。对于 ENQCMD，PASID 通常是 IA32_PASID\[19:0\] 的值，而对于 ENQCMDS，PASID 通常从内存读取。

如果"PASID translation" VM 执行控制为 1，上一段标识的 PASID 值被视为客户 PASID。PASID 转换将此客户 PASID 转换为 20 位宿主 PASID。在此转换之后，执行入队存储，使用宿主 PASID 代替客户 PASID。

PASID 转换由 VMM 配置的两个数据结构层级（PASID 转换层级）实现。客户 PASID 00000H 至 7FFFFH 通过低 PASID 转换层级转换，而客户 PASID 80000 至 FFFFFH 通过高 PASID 转换层级转换。

每个 PASID 转换层级的根部是一个 4-KByte PASID 目录。低 PASID 目录位于低 PASID 目录地址，高 PASID 目录位于高 PASID 目录地址（这些物理地址是 VMCS 中的 VM 执行控制字段）。PASID 目录包含 512 个 8 字节条目，每个条目具有以下格式：

-   第 0 位是条目的存在位（present bit）。仅当此位为 1 时使用该条目。
-   第 11:1 位保留且必须为 0。
-   第 MAXPHYADDR–1:12 位指定 4-KByte 对齐的 PASID 表地址（见下文），其中 MAXPHYADDR 定义如下：
    -   通常，MAXPHYADDR 是 CPUID.80000008H:EAX\[7:0\] 中枚举的处理器支持的物理地址宽度（此宽度最多为 52）。
    -   如果 IA32_TME_ACTIVATE\[0\] = 1（指示 TME 已配置），当逻辑处理器在安全仲裁模式（SEAM；见第 35 章）之外时，MAXPHYADDR 减少 IA32_TME_ACTIVATE\[39:36\] 的值；在 SEAM 中该值不减少。¹
-   第 63:MAXPHYADDR 位保留且必须为 0。

PASID 转换层级还包括最多 512 个 4-KByte PASID 表；每个表由 PASID 目录条目引用（见上文）。PASID 表包含 1024 个 4 字节条目，每个条目具有以下格式：

-   第 19:0 位是条目指定的宿主 PASID。
-   第 30:20 位保留且必须为 0。
-   第 31 位是条目的有效位（valid bit）。仅当此位为 1 时使用该条目。

当启用 PASID 转换时，由指令确定的客户 PASID（见上文）使用以下过程转换为宿主 PASID：

-   如果客户 PASID 的第 19 位被清除，使用低 PASID 目录；否则，使用高 PASID 目录。
-   客户 PASID 的第 18:10 位从 PASID 目录中选择一个条目。如果条目的存在位被清除或任何保留位被设置，发生 VM 退出。否则，条目的第 MAXPHYADDR-1:0 位（第 0 位被清除）包含 PASID 表的物理地址。
-   客户 PASID 的第 9:0 位从 PASID 表中选择一个条目。如果条目的有效位被清除或任何保留位被设置，发生 VM 退出。否则，条目的第 19:0 位是宿主 PASID。

如果 PASID 转换导致 VM 退出（由于存在位或有效位被清除，或保留位被设置），指令不完成且不执行入队存储。

### 28.5.10 客户定时器

支持"APIC-timer virtualization" VM 执行控制的 1 设置的逻辑处理器包括一个称为客户定时器（guest timer）的资源。本节描述客户定时器以及它如何用于 APIC 定时器虚拟化。

类似于在 TSC-deadline 模式下运行的 APIC 定时器，客户定时器使用相对于时间戳计数器（TSC）的 64 位客户截止时间值配置。当 TSC 到达 APIC 定时器的截止时间时，该定时器产生中断；当 TSC 到达客户定时器的截止时间时，客户定时器产生客户定时器事件。如后面将详述的，逻辑处理器通过挂起虚拟定时器中断来响应客户定时器事件。

第 28.5.10.1 节描述对客户截止时间的更新。第 28.5.10.2 节呈现新的客户定时器事件的细节。

#### 28.5.10.1 更新客户截止时间

以下操作可以更新客户截止时间：

-   在"APIC-timer virtualization" VM 执行控制为 1 时，VMX 非根操作中对 IA32_TSC_DEADLINE MSR 的写入（第 28.3 节解释了写入的值如何确定）。
-   在"APIC-timer virtualization" VM 执行控制为 1 时的 VM 进入（第 29.3.2.5 节解释了写入的值如何确定）。
-   VM 退出、客户定时器事件的处理（第 28.5.10.2 节）和处理器复位都会清除客户截止时间。

处理器强制执行以下事项：

-   将客户截止时间更新为零会解除客户定时器的武装，禁用客户定时器事件。在此之后，在下一次修改客户截止时间之前不会有客户定时器事件挂起。
-   将客户截止时间更新为小于或等于 TSC 的非零值会在下一个指令边界上使客户定时器事件挂起。
-   将客户截止时间更新为大于 TSC 的非零值会武装客户定时器。在此之后，在 TSC 到达客户截止时间之前不会有客户定时器事件挂起（除非客户截止时间再次被修改）。当 TSC 到达客户截止时间时，客户定时器事件将变为挂起。

如果客户截止时间在 TSC 的值接近客户截止时间时被更新，可能会发生竞争。在这种情况下，可能发生以下任一情况：

-   TSC 可能在客户截止时间被更新之前到达原始客户截止时间，导致客户定时器事件被挂起。然后可能发生以下任一情况：
    -   如果在客户截止时间被更新之前处理客户定时器事件，逻辑处理器将在截止时间被更新之前清除截止时间（作为事件处理的一部分）。新截止时间可能导致第二个客户定时器事件稍后发生。
    -   如果在客户定时器事件可以被处理之前更新客户截止时间，不会发生基于原始截止时间的客户定时器事件，任何后续客户定时器事件将基于新客户截止时间。
-   客户截止时间可能在 TSC 到达原始客户截止时间之前被更新。在这种情况下，不会发生基于原始客户截止时间的客户定时器事件，任何后续客户定时器事件将基于新客户截止时间。

#### 28.5.10.2 客户定时器事件

当客户截止时间非零且小于或等于 TSC 时，客户定时器事件变为挂起。以下条目提供了细节：

-   当逻辑处理器处于 wait-for-SIPI 状态或关闭状态时，客户定时器事件被抑制。
-   客户定时器事件的优先级低于外部中断，高于虚拟中断或 interrupt-window exiting。
-   逻辑处理器确保客户截止时间在 VMX 非根操作之外总是为零。¹ 因此，客户定时器事件只能在 VMX 非根操作中挂起。

未被抑制或未被更高优先级事件抢占的挂起客户定时器事件由逻辑处理器按如下方式处理：

```python
// 挂起虚拟定时器中断
V := 虚拟定时器向量;          // 来自 VMCS
VIRR[V] := 1;                  // 更新虚拟 APIC 页上的虚拟 IRR 字段
RVI := max{RVI, V};            // 更新 VMCS 中的客户中断状态字段
评估挂起的虚拟中断;            // 虚拟中断可能在此处理之后立即交付
// 清除客户截止时间和阴影
Guest deadline := 0;           // 解除客户定时器的武装
Guest deadline shadow := 0;    // 更新 VMCS 中的字段
```

（如果对 IA32_TSC_DEADLINE MSR 的虚拟化写入本会建立一个已过去的截止时间，也会执行这些步骤。）

以下条目考虑某些特殊情况：

-   如果在 REP 前缀指令的迭代之间（至少一次迭代已完成但并非所有迭代都已完成时）处理客户定时器事件，以下条目表征在上述步骤之后和执行恢复之前的处理器状态：
    -   RIP 引用 REP 前缀指令；
    -   RCX、RSI 和 RDI 被更新以反映已完成的迭代；且
    -   RFLAGS.RF = 1。
-   如果在收集指令或散布指令的部分执行之后处理客户定时器事件，目标寄存器和掩码操作数被部分更新且 RFLAGS.RF = 1。
-   如果在逻辑处理器处于 HLT 进入的状态时处理客户定时器事件，处理器在上述步骤之后返回 HLT 状态（如果识别了挂起的虚拟中断，逻辑处理器可能立即从 HLT 状态唤醒）。
-   如果在逻辑处理器处于 MWAIT、TPAUSE 或 UMWAIT 进入的状态时处理客户定时器事件，处理器在上述步骤之后将处于活动状态。
-   在事务执行期间变为挂起的客户定时器事件可能中止事务并导致转换到非事务执行。如果它这样做，事务中止像它由于中断导致那样加载 EAX。
-   在逻辑处理器处于飞地模式时发生的客户定时器事件导致异步飞地退出（AEX）在上述步骤之前发生。

## 28.6 不受限制的客户

首批支持 VMX 操作的处理器要求在 VMX 操作中 CR0.PE 和 CR0.PG 为 1（见第 26.8 节）。此限制意味着客户软件不能在非分页保护模式或实地址模式下运行。后来的处理器支持一个称为"unrestricted guest"的 VM 执行控制。¹ 如果此控制为 1，CR0.PE 和 CR0.PG 在 VMX 非根操作中可以为 0。此类处理器允许客户软件在非分页保护模式或实地址模式下运行。以下条目描述此类软件的行为：

-   MOV CR0 指令不会仅仅因为会将 CR0.PE 和 CR0.PG 中的任一个设置为 0 而导致通用保护异常。详见第 28.3 节。
-   逻辑处理器在 VMX 非根操作中处理 CR0.PE 和 CR0.PG 的值就像它在 VMX 操作之外那样。因此，如果 CR0.PE = 0，处理器像通常在实地址模式下那样操作（例如，它使用 16 位中断表交付中断和异常）。如果 CR0.PG = 0，处理器像通常在分页被禁用时那样操作。
-   处理器操作由于处理器处于 VMX 非根操作这一事实以及 VM 执行控制的设置而被修改，就像它在保护模式中或分页被启用时那样。在保护模式中或分页被启用时导致 VM 退出的指令、中断和异常在实地址模式中或分页被禁用时也如此。应注意以下示例：
    -   如果 CR0.PG = 0，页故障不发生，因此不能导致 VM 退出。
    -   如果 CR0.PE = 0，无效 TSS 异常不发生，因此不能导致 VM 退出。
    -   如果 CR0.PE = 0，以下指令导致无效操作码异常且不导致 VM 退出：INVEPT、INVVPID、LLDT、LTR、SLDT、STR、VMCLEAR、VMLAUNCH、VMPTRLD、VMPTRST、VMREAD、VMRESUME、VMWRITE、VMXOFF 和 VMXON。
-   如果 CR0.PG = 0，每个线性地址被直接传递给 EPT 机制以转换为物理地址。² 传递给 EPT 机制的客户内存类型是 WB（写回）。

* * *

> **脚注：**
> 
> 1.  "Unrestricted guest"是一个次要基于处理器的 VM 执行控制。如果主要基于处理器的 VM 执行控制的第 31 位为 0，VMX 非根操作的表现就像"unrestricted guest" VM 执行控制为 0。见第 27.6.2 节。
> 2.  如第 29.2.1.1 节所述，如果"unrestricted guest" VM 执行控制为 1，"enable EPT" VM 执行控制必须为 1。

* * *

## 第 29 章 VM 进入

软件可以使用 VM 进入指令 VMLAUNCH 和 VMRESUME 中的任一个进入 VMX 非根操作。VMLAUNCH 只能用于启动状态为 clear 的 VMCS，VMRESUME 只能用于启动状态为 launched 的 VMCS。VMLAUNCH 应用于 VMCLEAR 之后的第一次 VM 进入；VMRESUME 应用于同一 VMCS 的后续 VM 进入。

每次 VM 进入按指示的顺序执行以下步骤：

1.  执行基本检查以确保 VM 进入可以开始（第 29.1 节）。
2.  检查 VMCS 的控制和宿主状态区域，以确保它们适合支持 VMX 非根操作，且 VMCS 被正确配置以支持下一次 VM 退出（第 29.2 节）。
3.  并行或以任何顺序执行以下操作（第 29.3 节）：
    -   检查 VMCS 的客户状态区域，以确保 VM 进入完成后逻辑处理器的状态与 IA-32 和 Intel 64 架构一致。
    -   从客户状态区域加载处理器状态，并基于 VMCS 中的控制。
    -   清除地址范围监视（address-range monitoring）。
4.  从 VM-entry MSR-load 区域加载 MSR（第 29.4 节）。
5.  如果正在执行 VMLAUNCH，将 VMCS 的启动状态设置为"launched"。
6.  如果"Intel PT uses guest physical addresses" VM 执行控制为 1，可能发生追踪地址预转换（TAPT）（见第 28.5.4 节和第 29.5 节）。
7.  可以在客户上下文中注入事件（第 29.6 节）。

上述步骤 1–4 执行可能导致 VM 进入失败的检查。此类失败以下三种方式之一发生：

-   第 29.1 节中的某些检查可能生成普通故障（例如，无效操作码异常）。此类故障正常交付。
-   第 29.1 节中的某些检查和第 29.2 节中的所有检查导致控制传递到 VM 进入指令之后的指令。通过设置 RFLAGS.ZF¹（如果有当前 VMCS）或 RFLAGS.CF（如果没有当前 VMCS）指示失败。如果有当前 VMCS，指示失败原因的错误号被存储在 VM 指令错误字段中。错误号见第 32 章。
-   第 29.3 节和第 29.4 节中的检查导致处理器状态从 VMCS 的宿主状态区域加载（就像 VM 退出时那样）。关于失败的信息被存储在 VM 退出信息字段中。详见第 29.8 节。

EFLAGS.TF = 1 仅在 VM 进入指令失败（第 29.1 节和第 29.2 节中的检查之一导致控制传递到后续指令）时使其生成单步调试异常。在以下任何情况下 VM 进入都不生成单步调试异常：（1）指令生成故障；（2）第 29.3 节中的检查之一或加载 MSR 中的失败导致处理器状态从 VMCS 的宿主状态区域加载；或（3）指令通过第 29.1 节、第 29.2 节和第 29.3 节中的所有检查且加载 MSR 中没有失败。

第 34.15 节描述了系统管理中断（SMI）和系统管理模式（SMM）的双监视器处理。在此处理下，SMM 中运行的代码使用 VM 进入而不是 RSM 指令返回。如果 VM 进入在 SMM 中执行且"entry to SMM" VM 进入控制为 0，则该 VM 进入从 SMM 返回。从 SMM 返回的 VM 进入与普通 VM 进入在第 34.15.4 节详述的方面有所不同。

## 29.1 基本 VM 进入检查

在 VM 进入开始之前，按以下顺序检查逻辑处理器的当前状态：

1.  如果逻辑处理器处于 virtual-8086 模式或兼容模式，生成无效操作码异常。
2.  如果当前特权级（CPL）不为零，生成通用保护异常。
3.  如果没有当前 VMCS，RFLAGS.CF 被设置为 1 且控制传递到下一条指令。
4.  如果有当前 VMCS 但当前 VMCS 是影子 VMCS（见第 27.10 节），RFLAGS.CF 被设置为 1 且控制传递到下一条指令。
5.  如果有不是影子 VMCS 的当前 VMCS，按顺序评估以下条件；其中任何一个都导致 VM 进入失败：  
    a. 如果存在 MOV-SS 阻止（见表 27-3）。  
    b. 如果 VM 进入由 VMLAUNCH 调用且 VMCS 启动状态不是 clear。  
    c. 如果 VM 进入由 VMRESUME 调用且 VMCS 启动状态不是 launched。  
    如果这些检查中任何一个失败，RFLAGS.ZF 被设置为 1 且控制传递到下一条指令。指示失败原因的错误号被存储在 VM 指令错误字段中。错误号见第 32 章。

## 29.2 对 VMX 控制和宿主状态区域的检查

如果第 29.1 节中的检查不导致 VM 进入失败，则检查 VMCS 的控制和宿主状态区域，以确保它们适合支持 VMX 非根操作、VMCS 被正确配置以支持下一次 VM 退出，且在下一次 VM 退出之后处理器的状态与 Intel 64 和 IA-32 架构一致。

如果这些检查中任何一个失败，VM 进入失败。当此类失败发生时，控制传递到下一条指令，RFLAGS.ZF 被设置为 1 以指示失败，VM 指令错误字段被加载一个指示失败是由于控制还是宿主状态区域的错误号（见第 32 章）。

这些检查可以以任何顺序执行。因此，一个原因（例如，宿主状态）的错误号指示并不意味着没有其他错误。因此，不同处理器可能对同一 VMCS 给出不同的错误号。某些检查防止建立当前保留的设置（或设置的组合）。未来的处理器可能允许此类设置（或组合）且可能不执行相应的检查。软件的正确性不应依赖于本节文档化检查导致的 VM 进入失败。

对控制和宿主状态区域的检查在第 29.2.1 节至第 29.2.4 节中呈现。这些节引用对应于处理器状态的 VMCS 字段。除非另有说明，这些引用是对宿主状态区域中的字段。

### 29.2.1 对 VMX 控制的检查

本节标识对 VMX 控制字段的 VM 进入检查。

其中一些字段包含物理地址。这些字段针对允许的地址宽度进行检查：

-   如果 IA32_VMX_BASIC\[48\] 读取为 1（暗示处理器不支持 Intel 64 架构；见第 A.1 节"基本 VMX 信息"），这些地址不得设置范围 63:32 中的任何位。
-   否则，物理地址的宽度受 MAXPHYADDR 限制，MAXPHYADDR 是从 CPUID.80000008H:EAX\[7:0\] 中枚举的值（最多 52）推导出的值。如果 TME_ACTIVATE\[0\] = 1（指示 TME 已配置），当逻辑处理器在安全仲裁模式（SEAM；见第 35 章）之外时，MAXPHYADDR 减少 IA32_TME_ACTIVATE\[39:36\] 的值；在 SEAM 中该值不减少。¹ 物理地址不应设置范围 63:MAXPHYADDR 中的位。

#### 29.2.1.1 VM 执行控制字段

VM 进入对 VM 执行控制字段执行以下检查：¹

-   基于引脚的 VM 执行控制中的保留位必须正确设置。软件可以查阅 VMX 能力 MSR 以确定正确的设置（见附录 A.3.1）。
-   主要基于处理器的 VM 执行控制中的保留位必须正确设置。软件可以查阅 VMX 能力 MSR 以确定正确的设置（见附录 A.3.2）。
-   如果"activate secondary controls"主要基于处理器的 VM 执行控制为 1，次要基于处理器的 VM 执行控制中的保留位必须被清除。软件可以查阅 VMX 能力 MSR 以确定哪些位被保留（见附录 A.3.3）。  
    如果"activate secondary controls"主要基于处理器的 VM 执行控制为 0（或如果处理器不支持该控制的 1 设置），则不对次要基于处理器的 VM 执行控制执行检查。逻辑处理器的表现就像所有次要基于处理器的 VM 执行控制都为 0。
-   如果"activate tertiary controls"主要基于处理器的 VM 执行控制为 1，三级基于处理器的 VM 执行控制中的保留位必须被清除。软件可以查阅 VMX 能力 MSR 以确定哪些位被保留（见附录 A.3.4）。  
    如果"activate tertiary controls"主要基于处理器的 VM 执行控制为 0（或如果处理器不支持该控制的 1 设置），则不对三级基于处理器的 VM 执行控制执行检查。逻辑处理器的表现就像所有三级基于处理器的 VM 执行控制都为 0。
-   CR3-target 计数不得大于 4。未来的处理器可能支持不同数量的 CR3-target 值。软件应读取 VMX 能力 MSR IA32_VMX_MISC 以确定支持的值数量（见附录 A.6）。
-   以下字段的第 11:0 位必须为 0，且这些字段还受上面第 28.2.1 节描述的物理地址宽度检查的约束：
    -   如果"use I/O bitmaps" VM 执行控制为 1，每个 I/O 位图地址。
    -   如果"use MSR bitmaps" VM 执行控制为 1，MSR 位图地址。
    -   如果"use TPR shadow" VM 执行控制为 1，virtual-APIC 地址。  
        如果对该地址的检查得到满足，VTPR 的字节 3:1（见第 31.1.1 节）可能被清除（行为可能为实现特定的）。  
        即使 VM 进入失败，也可能发生这些字节的清除。无论失败是导致控制传递到 VM 进入指令之后的指令还是导致处理器状态从 VMCS 的宿主状态区域加载，都是如此。
    -   如果"virtualize APIC-accesses" VM 执行控制为 1，APIC-access 地址。
    -   如果"enable PML" VM 执行控制为 1，PML 地址。
    -   如果"sub-page write permissions for EPT" VM 执行控制为 1，SPPTP VM 执行控制字段（见第 26.6.21 节的表 26-11）。
    -   如果"enable VM functions"基于处理器的 VM 执行控制为 1 且"EPTP switching" VM 函数控制为 1，EPTP-list 地址。
    -   如果"VMCS shadowing" VM 执行控制为 1，VMREAD 位图和 VMWRITE 位图地址。
    -   如果"EPT-violation #VE" VM 执行控制为 1，虚拟化异常信息地址。
    -   如果"PASID translation" VM 执行控制为 1，低 PASID 目录地址和高 PASID 目录地址。
-   如果"use TPR shadow" VM 执行控制为 1 且"virtual-interrupt delivery" VM 执行控制为 0，TPR 阈值 VM 执行控制字段的第 31:4 位必须为 0。
-   如果"use TPR shadow" VM 执行控制为 1 且"virtualize APIC accesses"和"virtual-interrupt delivery" VM 执行控制都为 0，执行以下检查：TPR 阈值 VM 执行控制字段的第 3:0 位的值不应大于 VTPR 的第 7:4 位的值（见第 32.1.1 节）。
-   如果"NMI exiting" VM 执行控制为 0，"virtual NMIs" VM 执行控制必须为 0。
-   如果"virtual NMIs" VM 执行控制为 0，"NMI-window exiting" VM 执行控制必须为 0。
-   如果"use TPR shadow" VM 执行控制为 0，以下 VM 执行控制也必须为 0："virtualize x2APIC mode"、"APIC-register virtualization"、"virtual-interrupt delivery"和"IPI virtualization"。
-   如果"virtualize x2APIC mode" VM 执行控制为 1，"virtualize APIC accesses" VM 执行控制必须为 0。
-   如果"virtual-interrupt delivery" VM 执行控制为 1，"external-interrupt exiting" VM 执行控制必须为 1。
-   如果"process posted interrupts" VM 执行控制为 1，以下必须为真：
    -   "virtual-interrupt delivery" VM 执行控制为 1。
    -   "acknowledge interrupt on exit" VM 退出控制为 1。
    -   posted-interrupt 通知向量的值在 0–255 范围内（第 15:8 位全为 0）。
    -   posted-interrupt 描述符地址的第 5:0 位全为 0。
    -   posted-interrupt 描述符地址满足上面第 29.2.1 节描述的物理地址宽度检查。
-   如果"IPI virtualization" VM 执行控制为 1，以下必须为真：
    -   PID-pointer 表地址的第 2:0 位全为 0。
    -   PID-pointer 表地址满足上面第 29.2.1 节描述的物理地址宽度检查。
    -   PID-pointer 表中最后一个条目的地址满足上面描述的物理地址宽度检查。（此地址是 PID-pointer 表地址加 8 乘以最后 PID-pointer 索引。）
-   如果"enable VPID" VM 执行控制为 1，VPID VM 执行控制字段的值不得为 0000H。
-   如果"enable EPT" VM 执行控制为 1，EPTP VM 执行控制字段（见第 27.6.11 节的表 27-9）必须满足以下检查：
    -   EPT 内存类型（第 2:0 位）必须是处理器支持的值，如 IA32_VMX_EPT_VPID_CAP MSR 中所指示（见附录 A.10）。
    -   第 5:3 位必须包含一个比处理器支持的 EPT 页遍历长度小 1 的值，如 IA32_VMX_EPT_VPID_CAP MSR 中所指示（见第 31.3.2 节和附录 A.10）。
    -   如果 IA32_VMX_EPT_VPID_CAP MSR 的第 21 位（见附录 A.10）读取为 0（指示处理器不支持 EPT 的访问和脏标志），第 6 位（EPT 访问和脏标志的启用位）必须为 0。
    -   保留位 11:7 必须全为 0。
    -   由第 63:12 位定义的 4-KByte 对齐地址必须满足上面第 29.2.1 节描述的物理地址宽度检查。
-   如果以下 VM 执行控制中的任何一个为 1，"enable EPT" VM 执行控制必须为 1："enable PML"、"unrestricted guest"、"mode-based execute control for EPT"、"sub-page write permissions for EPT"、"Intel PT uses guest physical addresses"、"PEBS uses guest physical addresses"、"enable HLAT"、"EPT paging-write control"或"guest-paging verification"。
-   如果逻辑处理器在 VM 进入时处于 SEAM，应用以下检查：
    -   "enable EPT" VM 执行控制必须为 1。
    -   SEAM 共享 EPT 指针中的第 11:0 位和第 63:M 位必须为零，其中 M 是 CPUID.80000008H:EAX\[7:0\] 中枚举的值。
-   如果"enable VM functions"基于处理器的 VM 执行控制为 1，VM 函数控制中的保留位必须被清除。软件可以查阅 VMX 能力 MSR 以确定哪些位被保留（见附录 A.11）。此外，基于 VM 函数控制中位的设置执行以下检查（见第 27.6.14 节）：
    -   如果"EPTP switching" VM 函数控制为 1，"enable EPT" VM 执行控制也必须为 1。  
        如果"enable VM functions"基于处理器的 VM 执行控制为 0，则不对 VM 函数控制执行检查。
-   如果逻辑处理器在 VM 进入时以 Intel PT 启用（IA32_RTIT_CTL.TraceEn = 1）操作，"load IA32_RTIT_CTL" VM 进入控制必须为 0。
-   如果"Intel PT uses guest physical addresses" VM 执行控制为 1，"load IA32_RTIT_CTL" VM 进入控制和"clear IA32_RTIT_CTL" VM 退出控制都必须为 1。
-   如果"use TSC scaling" VM 执行控制为 1，TSC-multiplier 不得为零。
-   如果"enable HLAT" VM 执行控制为 1，HLATP VM 执行控制字段（见第 27.6.22 节的表 27-12）中的以下位必须为零：第 2:0 位、第 11:5 位。此外，由第 63:12 位定义的 4-KByte 对齐地址必须满足上面第 29.2.1 节描述的物理地址宽度检查。
-   如果"APIC-timer virtualization" VM 执行控制为 1，以下必须为真：
    -   "virtual-interrupt delivery" VM 执行控制必须为 1。
    -   "RDTSC exiting" VM 执行控制必须为 0。
    -   虚拟定时器向量的值必须在 0–255 范围内（第 15:8 位全为 0）。

#### 29.2.1.2 VM 退出控制字段

VM 进入对 VM 退出控制字段执行以下检查。

-   主要 VM 退出控制中的保留位必须正确设置。软件可以查阅 VMX 能力 MSR 以确定正确的设置（见附录 A.4.1）。
-   如果"activate secondary controls"主要 VM 退出控制为 1，次要 VM 退出控制中的保留位必须被清除。软件可以查阅 VMX 能力 MSR 以确定哪些位被保留

（见附录 A.4.2）。

-   如果"activate secondary controls"主要 VM 退出控制为 0（或如果处理器不支持该控制的 1 设置），则不对次要 VM 退出控制执行检查。逻辑处理器的表现就像所有次要 VM 退出控制都为 0。
-   如果"activate VMX-preemption timer" VM 执行控制为 0，"save VMX-preemption timer value" VM 退出控制也必须为 0。
-   如果 VM-exit MSR-store 计数字段非零，对 VM-exit MSR-store 地址执行以下检查：
    -   VM-exit MSR-store 地址的低 4 位必须为 0。该地址必须满足上面第 29.2.1 节描述的物理地址宽度检查。
    -   VM-exit MSR-store 区域中最后一个字节的地址必须满足上面描述的物理地址宽度检查。此最后一个字节的地址是 VM-exit MSR-store 地址 +（MSR 计数 \* 16）– 1。（用于计算的算术使用的位比处理器的物理地址宽度多。）
-   如果 VM-exit MSR-load 计数字段非零，对 VM-exit MSR-load 地址执行以下检查：
    -   VM-exit MSR-load 地址的低 4 位必须为 0。该地址必须满足上面描述的物理地址宽度检查。
    -   VM-exit MSR-load 区域中最后一个字节的地址必须满足上面描述的物理地址宽度检查。此最后一个字节的地址是 VM-exit MSR-load 地址 +（MSR 计数 \* 16）– 1。（用于计算的算术使用的位比处理器的物理地址宽度多。）

#### 29.2.1.3 VM 进入控制字段

VM 进入对 VM 进入控制字段执行以下检查。

-   VM 进入控制中的保留位必须正确设置。软件可以查阅 VMX 能力 MSR 以确定正确的设置（见附录 A.5）。
    
-   与 VM 进入事件注入相关的字段必须正确设置。这些字段是注入事件标识字段（见第 27.8.3 节"事件注入的 VM 进入控制"的表 27-18）、注入事件错误码和 VM-entry 指令长度。如果注入事件标识字段中的有效位（第 31 位）为 1，以下必须成立：
    
    -   字段的事件类型（第 10:8 位）未被设置为保留值。值 1 在所有逻辑处理器上保留；值 7（其他事件）在不支持"monitor trap flag" VM 执行控制的 1 设置也不支持 FRED 转换的逻辑处理器上保留。
    -   字段的向量（第 7:0 位）与事件类型一致：
        -   如果事件类型是非可屏蔽中断（NMI），向量为 2。
        -   如果事件类型是硬件异常，向量最多为 31。
        -   如果事件类型是其他事件，向量为 0（指示挂起的 MTF VM 退出，仅在支持"monitor trap flag"时）或，如果 VM 进入后 FRED 转换将被启用（客户状态区域中 CR4 字段的第 32 位——FRED——为 1），向量为 1（指示 SYSCALL）或 2（指示 SYSENTER）。
    -   如果以下每个都成立，字段的交付错误码位（第 11 位）为 1：（1）事件类型是硬件异常；（2）（a）"unrestricted guest" VM 执行控制为 0；或（b）客户状态区域中 CR0 字段的第 0 位（对应于 CR0.PE）被设置；（3）IA32_VMX_BASIC\[56\] 读取为 0（见附录 A.1）；且（4）向量指示以下异常之一：#DF（向量 8）、#TS（10）、#NP（11）、#SS（12）、#GP（13）、#PF（14）或 #AC（17）。
    -   如果以下任一成立，字段的交付错误码位为 0：（1）事件类型不是硬件异常；（2）（a）"unrestricted guest" VM 执行控制为 1 且（b）客户状态区域中 CR0 字段的第 0 位被清除；或（3）IA32_VMX_BASIC\[56\] 读取为 0 且向量在以下范围之一：0–7、9、15、16 或 18–31。
    
    > **注**  
    > 在任何支持 FRED 转换的处理器上，IA32_VMX_BASIC\[56\] 将读取为 1。
    
    -   如果以下任一成立，字段的嵌套异常位（第 13 位）为 0：（1）事件类型不是硬件异常；或（2）IA32_VMX_BASIC\[58\] 读取为 0。
    -   字段中的保留位（30:14 和 12）为 0。
    -   如果交付错误码位（第 11 位）为 1，注入事件错误码字段的第 31:16 位为 0。
    -   如果事件类型是软件中断、软件异常或特权软件异常，VM-entry 指令长度字段在 0–15 范围内；或者如果事件类型是其他事件且向量为 1（SYSCALL）或 2（SYSENTER），也是如此。仅当 IA32_VMX_MISC\[30\] 读取为 1 时才允许 VM-entry 指令长度为 0；见附录 A.6。
-   如果 VM-entry MSR-load 计数字段非零，对 VM-entry MSR-load 地址执行以下检查：
    
    -   VM-entry MSR-load 地址的低 4 位必须为 0。该地址必须满足上面第 29.2.1 节描述的物理地址宽度检查。
    -   VM-entry MSR-load 区域中最后一个字节的地址必须满足上面描述的物理地址宽度检查。此最后一个字节的地址是 VM-entry MSR-load 地址 +（MSR 计数 \* 16）– 1。（用于计算的算术使用的位比处理器的物理地址宽度多。）  
        如果 IA32_VMX_BASIC\[48\] 读取为 1，两个地址都不应设置范围 63:32 中的任何位；见附录 A.1"基本 VMX 信息"。
-   如果处理器不在 SMM 中，"entry to SMM"和"deactivate dual-monitor treatment" VM 进入控制必须为 0。
    
-   "entry to SMM"和"deactivate dual-monitor treatment" VM 进入控制不能都为 1。
    

### 29.2.2 对宿主控制寄存器、MSR 和 SSP 的检查

对宿主状态区域中对应于控制寄存器和 MSR 的字段执行以下检查：

-   CR0 字段不得将任何位设置为 VMX 操作不支持的值（见第 26.8 节）。¹
-   CR4 字段不得将任何位设置为 VMX 操作不支持的值（见第 26.8 节）。
-   如果 CR4 字段中的第 23 位（对应于 CET）为 1，CR0 字段中的第 16 位（WP）也必须为 1。
-   在支持 Intel 64 架构的处理器上，CR3 字段必须使得 CR3 中保留的位为 0。² 特别是，检查第 63:32 位以确定允许的地址宽度：
    -   如果 IA32_VMX_BASIC\[48\] 读取为 1（暗示处理器不支持 Intel 64 架构；见附录 A.1"基本 VMX 信息"），字段不得设置第 63:32 位中的任何位。
    -   否则，字段的宽度受 MAXPHYADDR 限制，MAXPHYADDR 是从 CPUID.80000008H:EAX\[7:0\] 中枚举的值（最多 52）推导出的。如果 IA32_TME_ACTIVATE\[0\] = 1（指示 TME 已配置），当逻辑处理器在安全仲裁模式（SEAM；见第 35 章）之外时，MAXPHYADDR 减少 IA32_TME_ACTIVATE\[39:36\] 的值；在 SEAM 中该值不减少。字段不应设置范围 63:MAXPHYADDR 中的位。
-   在支持 Intel 64 架构的处理器上，IA32_SYSENTER_ESP 字段和 IA32_SYSENTER_EIP 字段必须各自包含规范地址（canonical address）。
-   如果"load IA32_PERF_GLOBAL_CTRL" VM 退出控制为 1，该寄存器字段中 IA32_PERF_GLOBAL_CTRL MSR 中保留的位必须为 0（见图 22-3）。
-   如果"load IA32_PAT" VM 退出控制为 1，IA32_PAT MSR 的字段值必须是可以在 CPL 0 下无故障地由 WRMSR 写入的值。具体来说，字段中的 8 个字节每个都必须具有值 0（UC）、1（WC）、4（WT）、5（WP）、6（WB）或 7（UC-）之一。
-   如果"load IA32_EFER" VM 退出控制为 1，该寄存器字段中 IA32_EFER MSR 中保留的位必须为 0。此外，字段中 LMA 和 LME 位的值必须各自与"host address-space size" VM 退出控制相同。
-   如果"load CET state" VM 退出控制为 1，IA32_S_CET 字段不得设置 IA32_S_CET MSR 中保留的任何位，且字段中的第 10 位（对应于 SUPPRESS）和第 11 位（TRACKER）不能都被设置。
-   如果"load CET state" VM 退出控制为 1，SSP 字段中的第 1:0 位必须为 0。
-   如果"load PKRS" VM 退出控制为 1，IA32_PKRS 字段中的第 63:32 位必须为 0。
-   如果"load FRED" VM 退出控制为 1，对指示的字段必须成立以下事项：
    -   IA32_FRED_CONFIG：字段的第 2 位、第 5:4 位和第 11 位必须为零。字段的高位必须使得字段的值是 CPU 规范的（见第 4.5 节）。
    -   IA32_FRED_RSP1–IA32_FRED_RSP3：这些字段中每一个的值必须是 CPU 规范的，且每个字段的第 5:0 位必须为零。
    -   IA32_FRED_SSP1–IA32_FRED_SSP3：这些字段中每一个的值必须是 CPU 规范的，且每个字段的第 2:0 位必须为零。
-   如果"load IA32_SPEC_CTRL" VM 退出控制为 1，该寄存器字段中 IA32_SPEC_CTRL MSR 中保留的位必须为 0。

### 29.2.3 对宿主段和描述符表寄存器的检查

对宿主状态区域中对应于段和描述符表寄存器的字段执行以下检查：

-   在 CS、SS、DS、ES、FS、GS 和 TR 中每一个的选择器字段中，RPL（第 1:0 位）和 TI 标志（第 2 位）必须为 0。
-   CS 和 TR 的选择器字段不能为 0000H。
-   如果"host address-space size" VM 退出控制为 0，SS 的选择器字段不能为 0000H。
-   在支持 Intel 64 架构的处理器上，FS、GS、GDTR、IDTR 和 TR 的基地址字段必须包含规范地址。

### 29.2.4 与地址空间大小相关的检查

在支持 Intel 64 架构的处理器上，对 VMX 控制和宿主状态区域中的字段执行以下与地址空间大小相关的检查：

-   如果逻辑处理器在 VM 进入时在 IA-32e 模式之外（IA32_EFER.LMA = 0），以下必须成立：
    -   "IA-32e mode guest" VM 进入控制为 0。
    -   "host address-space size" VM 退出控制为 0。
-   如果逻辑处理器在 VM 进入时处于 IA-32e 模式（IA32_EFER.LMA = 1），"host address-space size" VM 退出控制必须为 1。
-   如果"host address-space size" VM 退出控制为 0，以下必须成立：
    -   "IA-32e mode guest" VM 进入控制为 0。
    -   CR4 字段的第 17 位（对应于 CR4.PCIDE）为 0。
    -   CR4 字段的第 32 位（对应于 CR4.FRED）为 0。
    -   RIP 字段中的第 63:32 位为 0。
    -   如果"load CET state" VM 退出控制为 1，IA32_S_CET 字段和 SSP 字段中的第 63:32 位为 0。
-   如果"host address-space size" VM 退出控制为 1，以下必须成立：
    -   CR4 字段的第 5 位（对应于 CR4.PAE）为 1。
    -   RIP 字段包含规范地址。
    -   如果"load CET state" VM 退出控制为 1，IA32_S_CET 字段和 SSP 字段包含规范地址。
-   如果"load CET state" VM 退出控制为 1，IA32_INTERRUPT_SSP_TABLE_ADDR 字段包含规范地址。

在不支持 Intel 64 架构的处理器上，执行检查以确保"IA-32e mode guest" VM 进入控制和"host address-space size" VM 退出控制都为 0。

## 29.3 检查和加载客户状态

如果对 VMX 控制和宿主状态区域的所有检查都通过（见第 29.2 节），同时发生以下操作：（1）检查 VMCS 的客户状态区域，以确保 VM 进入完成后逻辑处理器的状态与 IA-32 和 Intel 64 架构一致；（2）从客户状态区域或按 VM 进入控制字段指定加载处理器状态；且（3）清除地址范围监视。

由于检查和加载同时发生，可能只在一些状态已被加载之后才发现失败。因此，逻辑处理器通过从宿主状态区域加载状态来响应此类失败，就像它会在 VM 退出时那样。见第 29.8 节。

### 29.3.1 对客户状态区域的检查

本节描述对客户状态区域中字段执行的检查。这些检查可以以任何顺序执行。某些检查防止建立当前保留的设置（或设置的组合）。未来的处理器可能允许此类设置（或组合）且可能不执行相应的检查。软件的正确性不应依赖于本节文档化检查导致的 VM 进入失败。以下小节引用对应于处理器状态的字段。除非另有说明，这些引用是对客户状态区域中的字段。

#### 29.3.1.1 对客户控制寄存器、调试寄存器和 MSR 的检查

对客户状态区域中对应于控制寄存器、调试寄存器和 MSR 的字段执行以下检查：

-   CR0 字段不得将任何位设置为 VMX 操作不支持的值（见第 26.8 节）。以下例外：
    
    -   如果"unrestricted guest" VM 执行控制为 1，不检查第 0 位（对应于 CR0.PE）和第 31 位（PG）。¹
    -   第 29 位（对应于 CR0.NW）和第 30 位（CD）从不检查，因为这些位的值不被 VM 进入改变；见第 29.3.2.1 节。
-   如果 CR0 字段中的第 31 位（对应于 PG）为 1，该字段中的第 0 位（PE）也必须为 1。²
    
-   CR4 字段不得将任何位设置为 VMX 操作不支持的值（见第 26.8 节）。
    
-   如果 CR4 字段中的第 23 位（对应于 CET）为 1，CR0 字段中的第 16 位（WP）也必须为 1。
    
-   如果"load debug controls" VM 进入控制为 1，该寄存器字段中 IA32_DEBUGCTL MSR 中保留的位必须为 0。首批支持虚拟机扩展的处理器仅支持此控制的 1 设置，因此无条件执行此检查。
    
-   在支持 Intel 64 架构的处理器上执行以下检查：
    
    -   如果"IA-32e mode guest" VM 进入控制为 1，CR0 字段中的第 31 位（对应于 CR0.PG）和 CR4 字段中的第 5 位（对应于 CR4.PAE）必须各自为 1。³
    -   如果"IA-32e mode guest" VM 进入控制为 0，CR4 字段中的第 17 位（对应于 CR4.PCIDE）必须为 0。
    -   如果"IA-32e mode guest" VM 进入控制为 0，CR4 字段中的第 32 位（对应于 CR4.FRED）必须为 0。
    -   CR3 字段必须使得 CR3 中保留的位为 0。⁴ 特别是，字段的宽度受 MAXPHYADDR 限制，MAXPHYADDR 是从 CPUID.80000008H:EAX\[7:0\] 中枚举的值（最多 52）推导出的。如果"enable EPT" VM 执行控制为 0（暗示逻辑处理器不在 SEAM 中）且 IA32_TME_ACTIVATE\[0\] = 1（指示 TME 已配置），MAXPHYADDR 减少 IA32_TME_ACTIVATE\[39:36\] 的值。CR3 字段不应设置第 63:MAXPHYADDR 位中的任何位。
    -   如果"load debug controls" VM 进入控制为 1，DR7 字段中的第 63:32 位必须为 0。首批支持虚拟机扩展的处理器仅支持此控制的 1 设置，因此无条件执行此检查（如果它们支持 Intel 64 架构）。
    -   IA32_SYSENTER_ESP 字段和 IA32_SYSENTER_EIP 字段必须各自包含规范地址。
    -   如果"load CET state" VM 进入控制为 1，IA32_S_CET 字段和 IA32_INTERRUPT_SSP_TABLE_ADDR 字段必须包含规范地址。
-   如果"load IA32_PERF_GLOBAL_CTRL" VM 进入控制为 1，该寄存器字段中 IA32_PERF_GLOBAL_CTRL MSR 中保留的位必须为 0（见图 22-3）。
    
-   如果"load IA32_PAT" VM 进入控制为 1，IA32_PAT MSR 的字段值必须是可以在 CPL 0 下无故障地由 WRMSR 写入的值。具体来说，字段中的 8 个字节每个都必须具有值 0（UC）、1（WC）、4（WT）、5（WP）、6（WB）或 7（UC-）之一。
    
-   如果"load IA32_EFER" VM 进入控制为 1，对 IA32_EFER MSR 的字段执行以下检查：
    
    -   IA32_EFER MSR 中保留的位必须为 0。
    -   第 10 位（对应于 IA32_EFER.LMA）必须等于"IA-32e mode guest" VM 进入控制的值。如果 CR0 字段中的第 31 位（对应于 CR0.PG）为 1，它还必须与第 8 位（LME）相同。¹
-   如果"load IA32_BNDCFGS" VM 进入控制为 1，对 IA32_BNDCFGS MSR 的字段执行以下检查：
    
    -   IA32_BNDCFGS MSR 中保留的位必须为 0。
    -   第 63:12 位中的线性地址必须是规范的。
-   如果"load IA32_RTIT_CTL" VM 进入控制为 1，该寄存器字段中 IA32_RTIT_CTL MSR 中保留的位必须为 0（见表 36-6）。
    
-   如果"load CET state" VM 进入控制为 1，IA32_S_CET 字段不得设置 IA32_S_CET MSR 中保留的任何位，且字段的第 10 位（对应于 SUPPRESS）和第 11 位（TRACKER）不能都被设置。
    
-   如果"load guest IA32_LBR_CTL" VM 进入控制为 1，该寄存器字段中 IA32_LBR_CTL MSR 中保留的位必须为 0。
    
-   如果"load PKRS" VM 进入控制为 1，IA32_PKRS 字段中的第 63:32 位必须为 0。
    
-   如果"load UINV" VM 进入控制为 1，客户 UINV 字段中的第 15:8 位必须为 0。
    
-   如果"load FRED" VM 进入控制为 1，对指示的字段必须成立以下事项：
    
    -   IA32_FRED_CONFIG：字段的第 2 位、第 5:4 位和第 11 位必须为零。字段的高位必须使得字段的值是 CPU 规范的（见第 4.5 节）。
    -   IA32_FRED_RSP1–IA32_FRED_RSP3：这些字段中每一个的值必须是 CPU 规范的，且每个字段的第 5:0 位必须为零。
    -   IA32_FRED_SSP1–IA32_FRED_SSP3：这些字段中每一个的值必须是 CPU 规范的，且每个字段的第 2:0 位必须为零。
-   如果"load IA32_SPEC_CTRL" VM 进入控制为 1，该寄存器字段中 IA32_SPEC_CTRL MSR 中保留的位必须为 0。
    

#### 29.3.1.2 对客户段寄存器的检查

本节规定对 CS、SS、DS、ES、FS、GS、TR 和 LDTR 字段的检查。以下术语用于定义这些检查：

-   如果客户状态区域中 RFLAGS 字段中的 VM 标志（第 17 位）为 1，客户将是 virtual-8086。
-   如果"IA-32e mode guest" VM 进入控制为 1，客户将是 IA-32e 模式。（这仅在支持 Intel 64 架构的处理器上可能。）
-   如果客户状态区域中 CR4 字段中的 FRED 位（第 32 位）为 1，客户将使用 FRED 转换。
-   如果该寄存器访问权限字段中的不可用位（第 16 位）为 0，这些寄存器中的任何一个被称为可用（usable）。

以下是对这些字段的检查：

-   **选择器字段**。
    -   TR。TI 标志（第 2 位）必须为 0。
    -   LDTR。如果 LDTR 可用，TI 标志（第 2 位）必须为 0。
    -   SS。如果客户不会是 virtual-8086 且"unrestricted guest" VM 执行控制为 0，RPL（第 1:0 位）必须等于 CS 选择器字段的 RPL。¹
-   **基地址字段**。
    -   CS、SS、DS、ES、FS、GS。如果客户将是 virtual-8086，地址必须是选择器字段左移 4 位（乘以 16）。
    -   在支持 Intel 64 架构的处理器上执行以下检查：
        -   TR、FS、GS。地址必须是规范的。
        -   LDTR。如果 LDTR 可用，地址必须是规范的。
        -   CS。地址的第 63:32 位必须为零。
        -   SS、DS、ES。如果寄存器可用，地址的第 63:32 位必须为零。
-   **CS、SS、DS、ES、FS、GS 的限长字段**。如果客户将是 virtual-8086，字段必须是 0000FFFFH。
-   **访问权限字段**。
    -   CS、SS、DS、ES、FS、GS。
        -   如果客户将是 virtual-8086，字段必须是 000000F3H。这意味着以下事项：
            -   第 3:0 位（Type）必须为 3，指示向上扩展的读/写已访问数据段。
            -   第 4 位（S）必须为 1。
            -   第 6:5 位（DPL）必须为 3。
            -   第 7 位（P）必须为 1。
            -   第 11:8 位（保留）、第 12 位（软件可用）、第 13 位（保留/L）、第 14 位（D/B）、第 15 位（G）、第 16 位（不可用）和第 31:17 位（保留）必须都为 0。
        -   如果客户不会是 virtual-8086，单独考虑不同的子字段：
            -   第 3:0 位（Type）。
                -   CS。允许的值取决于"unrestricted guest" VM 执行控制的设置：
                    -   如果控制为 0，Type 必须为 9、11、13 或 15（已访问代码段）。
                    -   如果控制为 1，Type 必须为 3（读/写已访问向上扩展数据段）或 9、11、13、15 之一（已访问代码段）。
                -   SS。如果 SS 可用，Type 必须为 3 或 7（读/写、已访问数据段）。
                -   DS、ES、FS、GS。如果寄存器可用，应用以下检查：
                    -   Type 的第 0 位必须为 1（已访问）。
                    -   如果 Type 的第 3 位为 1（代码段），Type 的第 1 位必须为 1（可读）。
            -   第 4 位（S）。如果寄存器是 CS 或如果寄存器可用，S 必须为 1。
            -   第 6:5 位（DPL）。
                -   CS。
                    -   如果 Type 为 3（读/写已访问向上扩展数据段），DPL 必须为 0。仅当"unrestricted guest" VM 执行控制为 1 时 Type 才能为 3。
                    -   如果 Type 为 9 或 11（非一致代码段），DPL 必须等于 SS 访问权限字段中的 DPL。
                    -   如果 Type 为 13 或 15（一致代码段），DPL 不能大于 SS 访问权限字段中的 DPL。
                -   SS。
                    -   如果"unrestricted guest" VM 执行控制为 0，DPL 必须等于选择器字段中的 RPL。
                    -   如果 CS 访问权限字段中的 Type 为 3（读/写已访问向上扩展数据段）或 CR0 字段中的第 0 位（对应于 CR0.PE）为 0，DPL 必须为 0。¹
                    -   如果客户将使用 FRED 转换，应用以下检查：
                        -   DPL 必须为 0 或 3。
                        -   如果 DPL 为 0，CS 访问权限字段中的 L 位（第 13 位）必须为 1。
                        -   如果 DPL 为 3，RFLAGS 字段中的 IOPL 值（第 13:12 位）和中断性状态字段中的"blocking by STI"位（第 0 位）必须都为 0。
                -   DS、ES、FS、GS。如果（1）"unrestricted guest" VM 执行控制为 0；（2）寄存器可用；且（3）访问权限字段中的 Type 在 0–11 范围内（数据段或非一致代码段），DPL 不能小于选择器字段中的 RPL。
            -   第 7 位（P）。如果寄存器是 CS 或如果寄存器可用，P 必须为 1。
            -   第 11:8 位（保留）。如果寄存器是 CS 或如果寄存器可用，这些位必须都为 0。
            -   第 14 位（D/B）。对于 CS，如果客户将是 IA-32e 模式且 L 位（第 13 位）为 1，D/B 必须为 0。
            -   第 15 位（G）。如果寄存器是 CS 或如果寄存器可用，应用以下检查：
                -   如果限长字段中范围 11:0 的任何位为 0，G 必须为 0。
                -   如果限长字段中范围 31:20 的任何位为 1，G 必须为 1。
            -   第 31:17 位（保留）。如果寄存器是 CS 或如果寄存器可用，这些位必须都为 0。
    -   TR。单独考虑不同的子字段：
        -   第 3:0 位（Type）。
            -   如果客户不会是 IA-32e 模式，Type 必须为 3（16 位忙 TSS）或 11（32 位忙 TSS）。
            -   如果客户将是 IA-32e 模式，Type 必须为 11（64 位忙 TSS）。
        -   第 4 位（S）。S 必须为 0。
        -   第 7 位（P）。P 必须为 1。
        -   第 11:8 位（保留）。这些位必须都为 0。
        -   第 15 位（G）。
            -   如果限长字段中范围 11:0 的任何位为 0，G 必须为 0。
            -   如果限长字段中范围 31:20 的任何位为 1，G 必须为 1。
        -   第 16 位（不可用）。不可用位必须为 0。
        -   第 31:17 位（保留）。这些位必须都为 0。
    -   LDTR。以下对不同子字段的检查仅在 LDTR 可用时适用：
        -   第 3:0 位（Type）。Type 必须为 2（LDT）。
        -   第 4 位（S）。S 必须为 0。
        -   第 7 位（P）。P 必须为 1。
        -   第 11:8 位（保留）。这些位必须都为 0。
        -   第 15 位（G）。
            -   如果限长字段中范围 11:0 的任何位为 0，G 必须为 0。
            -   如果限长字段中范围 31:20 的任何位为 1，G 必须为 1。
        -   第 31:17 位（保留）。这些位必须都为 0。

#### 29.3.1.3 对客户描述符表寄存器的检查

对 GDTR 和 IDTR 的字段执行以下检查：

-   在支持 Intel 64 架构的处理器上，基地址字段必须包含规范地址。
-   每个限长字段的第 31:16 位必须为 0。

#### 29.3.1.4 对客户 RIP、RFLAGS 和 SSP 的检查

对客户状态区域中对应于 RIP、RFLAGS 和 SSP（影子栈指针）的字段执行以下检查：

-   **RIP**。在支持 Intel 64 架构的处理器上执行以下检查：
    -   如果"IA-32e mode guest" VM 进入控制为 0 或 CS 访问权限字段中的 L 位（第 13 位）为 0，第 63:32 位必须为 0。
    -   如果处理器支持 N < 64 个线性地址位，且"IA-32e mode guest" VM 进入控制为 1 且 CS 访问权限字段中的 L 位为 1，第 63:N 位必须相同。¹（如果处理器支持 64 个线性地址位，则不适用检查。）客户 RIP 值不需要是规范的；第 N-1 位的值可能不同于第 N 位的值。
-   **RFLAGS**。
    -   保留位 63:22（在不支持 Intel 64 架构的处理器上为第 31:22 位）、第 15 位、第 5 位和第 3 位在字段中必须为 0，保留位第 1 位必须为 1。
    -   如果"IA-32e mode guest" VM 进入控制为 1 或 CR0 字段中的第 0 位（对应于 CR0.PE）为 0，VM 标志（第 17 位）必须为 0。²
    -   如果注入事件标识字段中的有效位（第 31 位）为 1 且事件类型（第 10:8 位）是外部中断，IF 标志（RFLAGS\[第 9 位\]）必须为 1。
-   **SSP**。如果"load CET state" VM 进入控制为 1，执行以下检查：
    -   第 1:0 位必须为 0。
    -   如果处理器支持 Intel 64 架构，第 63:N 位必须相同，其中 N 是 CPU 的最大线性地址宽度。（如果处理器支持 64 个线性地址位，此检查不适用。）客户 SSP 值不需要是规范的；第 N-1 位的值可能不同于第 N 位的值。

#### 29.3.1.5 对客户非寄存器状态的检查

对客户状态区域中对应于非寄存器状态的字段执行以下检查：

-   **活动状态**。
    
    -   活动状态字段必须包含 0–3 范围内的值，指示实现支持的活动状态（见第 27.4.2 节）。未来的处理器可能包含对其他活动状态的支持。软件应读取 VMX 能力 MSR IA32_VMX_MISC（见附录 A.6）以确定支持哪些活动状态。
    -   如果 SS 访问权限字段中的 DPL（第 6:5 位）不为 0，活动状态字段不得指示 HLT 状态。¹
    -   如果中断性状态字段指示由 MOV-SS 或 STI 阻止（如果该字段中的第 0 位或第 1 位为 1），活动状态字段必须指示活动状态。
    -   如果注入事件标识字段中的有效位（第 31 位）为 1，要交付的事件（由事件类型和向量定义）不得是当逻辑处理器处于与活动状态字段内容对应的活动状态时通常会阻止的事件。以下条目枚举对于不同活动状态允许注入的事件（按注入事件标识字段中指定的）：
        -   **Active（活动）**。允许任何事件。
        -   **HLT**。只允许以下事件：
            -   事件类型为外部中断或非可屏蔽中断（NMI）的那些。
            -   事件类型为硬件异常且向量为 1（调试异常）或向量为 18（机器检查异常）的那些。
            -   事件类型为其他事件且向量为 0（挂起的 MTF VM 退出）的那些。  
                关于注入事件标识字段格式的详细信息，见第 27.8.3 节的表 27-18。
        -   **Shutdown（关闭）**。只允许 NMI 和机器检查异常。
        -   **Wait-for-SIPI**。不允许任何事件。
    -   如果"entry to SMM" VM 进入控制为 1，活动状态字段不得指示 wait-for-SIPI 状态。
-   **中断性状态**。
    
    -   保留位（第 31:5 位）必须为 0。
    -   字段不能指示由 STI 和 MOV SS 两者阻止（第 0 位和第 1 位不能都为 1）。
    -   如果 RFLAGS 字段中的 IF 标志（第 9 位）为 0，第 0 位（由 STI 阻止）必须为 0。
    -   如果注入事件标识字段中的有效位（第 31 位）为 1 且该字段中的事件类型（第 10:8 位）的值为 0（指示外部中断）或 2（指示非可屏蔽中断（NMI）），第 0 位（由 STI 阻止）和第 1 位（由 MOV-SS 阻止）必须都为 0。
    -   如果处理器不在 SMM 中，第 2 位（由 SMI 阻止）必须为 0。
    -   如果"entry to SMM" VM 进入控制为 1，第 2 位（由 SMI 阻止）必须为 1。
    -   如果"virtual NMIs" VM 执行控制为 1、注入事件标识字段中的有效位（第 31 位）为 1 且该字段中的事件类型（第 10:8 位）的值为 2（指示 NMI），第 3 位（由 NMI 阻止）必须为 0。
    -   如果第 4 位（飞地中断）为 1，第 1 位（由 MOV-SS 阻止）必须为 0，且处理器必须通过枚举 CPUID.07H.00H:EBX.SGX\[2\] 为 1 来支持 SGX。
    
    > **注**  
    > 如果"virtual NMIs" VM 执行控制为 0，则不存在要求：如果注入事件标识字段中的有效位为 1 且该字段中的事件类型值为 2，第 3 位必须为 0。
    
-   **待处理调试异常**。
    
    -   第 11:4 位、第 13 位、第 15 位和第 63:17 位（在不支持 Intel 64 架构的处理器上为第 31:17 位）必须为 0。
    -   如果以下任一成立，执行以下检查：（1）中断性状态字段指示由 STI 阻止（该字段中的第 0 位为 1）；（2）中断性状态字段指示由 MOV SS 阻止（该字段中的第 1 位为 1）；或（3）活动状态字段指示 HLT：
        -   如果 RFLAGS 字段中的 TF 标志（第 8 位）为 1 且 IA32_DEBUGCTL 字段中的 BTF 标志（第 1 位）为 0，第 14 位（BS）必须为 1。
        -   如果 RFLAGS 字段中的 TF 标志（第 8 位）为 0 或 IA32_DEBUGCTL 字段中的 BTF 标志（第 1 位）为 1，第 14 位（BS）必须为 0。
    -   如果第 16 位（RTM）为 1，执行以下检查：
        -   第 11:0 位、第 15:13 位和第 63:17 位（在不支持 Intel 64 架构的处理器上为第 31:17 位）必须为 0；第 12 位必须为 1。
        -   处理器必须通过枚举 CPUID.07H.00H:EBX\[11\] 为 1 来支持 RTM。
        -   中断性状态字段不得指示由 MOV SS 阻止（该字段中的第 1 位必须为 0）。
-   **VMCS 链接指针**。如果字段包含 FFFFFFFF_FFFFFFFFH 以外的值，应用以下检查：
    
    -   第 11:0 位必须为 0。
    -   字段的宽度受 MAXPHYADDR 限制，MAXPHYADDR 是从 CPUID.80000008H:EAX\[7:0\] 中枚举的值（最多 52）推导出的。如果 IA32_TME_ACTIVATE\[0\] = 1（指示 TME 已配置），当逻辑处理器在安全仲裁模式（SEAM；见第 35 章）之外时，MAXPHYADDR 减少 IA32_TME_ACTIVATE\[39:36\] 的值；在 SEAM 中该值不减少。VMCS 链接指针不应设置范围 63:MAXPHYADDR 中的位。
    -   字段值（作为物理地址）引用的内存中位于的 4 个字节必须满足以下事项：
        -   第 30:0 位必须包含处理器的 VMCS 修订标识符（见第 27.2 节）。¹
        -   第 31 位必须包含"VMCS shadowing" VM 执行控制的设置。² 这意味着当且仅当"VMCS shadowing" VM 执行控制为 1 时，引用的 VMCS 是影子 VMCS（见第 27.10 节）。
    -   如果处理器不在 SMM 中或"entry to SMM" VM 进入控制为 1，字段不得包含当前 VMCS 指针。
    -   如果处理器在 SMM 中且"entry to SMM" VM 进入控制为 0，字段必须与 executive-VMCS 指针不同。

#### 29.3.1.6 对客户页目录指针表项的检查

如果 CR0.PG = 1、CR4.PAE = 1 且 IA32_EFER.LME = 0，逻辑处理器使用 PAE 分页（见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 5.4 节）。³ 当使用 PAE 分页时，CR3 中的物理地址引用页目录指针表项（PDPTE）的表。当使用 PAE 分页时，到 CR3 的 MOV 检查 PDPTE 的有效性。

如果（1）客户状态区域中 CR0 字段中的第 31 位（对应于 CR0.PG）被设置；（2）CR4 字段中的第 5 位（对应于 CR4.PAE）被设置；且（3）"IA-32e mode guest" VM 进入控制为 0，则 VM 进入到使用 PAE 分页的客户。此类 VM 进入检查 PDPTE 的有效性：

-   如果"enable EPT" VM 执行控制为 0，如果（1）VM 进入前未使用 PAE 分页；或（2）CR3 的值由于 VM 进入而改变，VM 进入检查客户状态区域中 CR3 字段引用的 PDPTE 的有效性。即使（1）和（2）都不成立，VM 进入也可能检查它们的有效性。⁴
-   如果"enable EPT" VM 执行控制为 1，VM 进入检查客户状态区域中 PDPTE 字段的有效性（见第 27.4.2 节）。

到不使用 PAE 分页的客户的 VM 进入不检查任何 PDPTE 的有效性。

检查 PDPTE 有效性的 VM 进入使用与使用 PAE 分页时用 MOV 到 CR3 加载 CR3 所使用的相同检查。¹ 如果由于本会加载的 PDPTE（例如，因为设置保留位）MOV 到 CR3 本会导致通用保护异常，VM 进入失败。

### 29.3.2 加载客户状态

VM 进入按以下方式更新处理器状态：

-   某些状态从客户状态区域加载。
-   某些状态由 VM 进入控制决定。
-   页目录指针基于某些控制寄存器的值加载。

此加载可以以任何顺序执行，并与 VMCS 内容的检查（见第 29.3.1 节）并行。

客户状态的加载在第 29.3.2.1 节至第 29.3.2.4 节中详述。这些节引用对应于处理器状态的 VMCS 字段。除非另有说明，这些引用是对客户状态区域中的字段。

除了本节描述的状态加载外，VM 进入可以从 VM-entry MSR-load 区域加载 MSR（见第 29.4 节）。此加载仅在本节描述的状态加载和第 29.3.1 节描述的 VMCS 内容检查之后发生。

#### 29.3.2.1 加载客户控制寄存器、调试寄存器和 MSR

以下条目描述 VM 进入时如何加载客户控制寄存器、调试寄存器和 MSR：

-   CR0 从 CR0 字段加载，但以下位除外，它们在 VM 进入时从不修改：ET（第 4 位）；保留位 15:6、17 和 28:19；NW（第 29 位）和 CD（第 30 位）。² CR0 字段中这些位的值被忽略。
-   CR3 和 CR4 分别从 CR3 字段和 CR4 字段加载。
-   如果"load debug controls" VM 进入控制为 1，DR7 从 DR7 字段加载，但第 12 位和第 15:14 位总是为 0 且第 10 位总是为 1 除外。DR7 字段中这些位的值被忽略。  
    首批支持虚拟机扩展的处理器仅支持"load debug controls" VM 进入控制的 1 设置，因此总是从 DR7 字段加载 DR7。
-   以下描述如何使用客户状态区域中的字段加载某些 MSR：
    -   如果"load debug controls" VM 进入控制为 1，IA32_DEBUGCTL MSR 从 IA32_DEBUGCTL 字段加载。首批支持虚拟机扩展的处理器仅支持此控制的 1 设置，因此总是从 IA32_DEBUGCTL 字段加载 IA32_DEBUGCTL MSR。
    -   IA32_SYSENTER_CS MSR 从 IA32_SYSENTER_CS 字段加载。由于此字段只有 32 位，MSR 的第 63:32 位被清除为 0。
    -   IA32_SYSENTER_ESP 和 IA32_SYSENTER_EIP MSR 分别从 IA32_SYSENTER_ESP 字段和 IA32_SYSENTER_EIP 字段加载。在不支持 Intel 64 架构的处理器上，这些字段只有 32 位；MSR 的第 63:32 位被清除为 0。
    -   在支持 Intel 64 架构的处理器上执行以下操作：
        -   MSR FS.base 和 GS.base 分别从 FS 和 GS 的基地址字段加载（见第 29.3.2.2 节）。
        -   如果"load IA32_EFER" VM 进入控制为 0，IA32_EFER MSR 中的位按如下方式修改：
            -   IA32_EFER.LMA 用"IA-32e mode guest" VM 进入控制的设置加载。
            -   如果正在加载 CR0 使得 CR0.PG = 1，IA32_EFER.LME 也用"IA-32e mode guest" VM 进入控制的设置加载。¹ 否则，IA32_EFER.LME 不被修改。  
                对于"load IA32_EFER" VM 进入控制为 1 的情况见下文。
    -   如果"load IA32_PERF_GLOBAL_CTRL" VM 进入控制为 1，IA32_PERF_GLOBAL_CTRL MSR 从 IA32_PERF_GLOBAL_CTRL 字段加载。
    -   如果"load IA32_PAT" VM 进入控制为 1，IA32_PAT MSR 从 IA32_PAT 字段加载。
    -   如果"load IA32_EFER" VM 进入控制为 1，IA32_EFER MSR 从 IA32_EFER 字段加载。
    -   如果"load IA32_BNDCFGS" VM 进入控制为 1，IA32_BNDCFGS MSR 从 IA32_BNDCFGS 字段加载。
    -   如果"load IA32_RTIT_CTL" VM 进入控制为 1，IA32_RTIT_CTL MSR 从 IA32_RTIT_CTL 字段加载。
    -   如果"load CET" VM 进入控制为 1，IA32_S_CET 和 IA32_INTERRUPT_SSP_TABLE_ADDR MSR 分别从 IA32_S_CET 字段和 IA32_INTERRUPT_SSP_TABLE_ADDR 字段加载。在不支持 Intel 64 架构的处理器上，这些字段只有 32 位；MSR 的第 63:32 位被清除为 0。
    -   如果"load guest IA32_LBR_CTL" VM 进入控制为 1，IA32_LBR_CTL MSR 从 IA32_LBR_CTL 客户状态字段加载。
    -   如果"load PKRS" VM 进入控制为 1，IA32_PKRS MSR 从 IA32_PKRS 字段加载。
    -   如果"load UINV" VM 进入控制为 1，UINV 用 UINV 字段的低 8 位加载。UINV 表示在 IA32_UINTR_MISC MSR 的第 39:32 位。MSR 的其余部分不被修改。
    -   如果"load FRED" VM 进入控制为 1，以下 MSR 从相应字段加载：IA32_FRED_CONFIG、IA32_FRED_RSP1、IA32_FRED_RSP2、IA32_FRED_RSP3、IA32_FRED_STKLVLS、IA32_FRED_SSP1、IA32_FRED_SSP2 和 IA32_FRED_SSP3。
    -   如果"load IA32_SPEC_CTRL" VM 进入控制为 1，IA32_SPEC_CTRL MSR 从 IA32_SPEC_CTRL 字段加载。  
        对 MSR 的此加载将具有正常使用正在加载的值写入 MSR 时会发生的任何副作用。  
        除 FS.base 和 GS.base 外，如果这些 MSR 中的任何一个出现在 VM-entry MSR-load 区域中，它随后会被覆盖。见第 29.4 节。
-   SMBASE 寄存器不被所有 VM 进入修改，除了从 SMM 返回的那些。

#### 29.3.2.2 加载客户段寄存器和描述符表寄存器

对于 CS、SS、DS、ES、FS、GS、TR 和 LDTR 中的每一个，按如下方式从客户状态区域加载字段：

-   不可用位从访问权限字段加载。对于 TR，此位永远不会被设置（见第 29.3.1.2 节）。如果它为其他寄存器之一设置，应用以下事项：
    -   对于 CS、SS、DS、ES、FS 和 GS 中的每一个，在 64 位模式之外对段的使用会导致故障（通用保护异常或栈故障异常），就像该段使用空选择器加载一样。此位在 64 位模式中不导致访问出错。
    -   如果此位为 LDTR 设置，在所有模式中对 LDTR 的使用导致通用保护异常，就像 LDTR 使用空选择器加载一样。  
        如果此位为 CS、SS、DS、ES、FS、GS、TR 和 LDTR 中的任何一个清除，空选择器值不导致故障（通用保护异常或栈故障异常）。
-   **TR**。加载选择器、基址、限长和访问权限字段。
-   **CS**。
    -   总是加载以下字段：选择器、基地址、限长和（来自访问权限字段的）L、D 和 G 位。
    -   对于其他字段，查阅访问权限字段的不可用位：
        -   如果不可用位为 0，加载整个访问权限字段。
        -   如果不可用位为 1，VM 进入后 CS 访问权限的其余部分未定义。
-   **SS、DS、ES、FS、GS 和 LDTR**。
    -   加载选择器字段。
    -   对于其他字段，查阅相应访问权限字段的不可用位：
        -   如果不可用位为 0，加载基地址、限长和访问权限字段。
        -   如果不可用位为 1，VM 进入后基地址、段限长和访问权限的其余部分未定义，但以下例外：
            -   SS 基地址的第 3:0 位被清除为 0。
            -   SS.DPL 总是从 SS 访问权限字段加载。这将是 VM 进入完成后的当前特权级（CPL）。
            -   SS.B 总是被设置为 1。
            -   FS 和 GS 的基地址从 VMCS 中的相应字段加载。在支持 Intel 64 架构的处理器上，为 FS 和 GS 加载的基地址值也体现在 FS.base 和 GS.base MSR 中。
            -   在支持 Intel 64 架构的处理器上，SS、DS 和 ES 基地址的第 63:32 位被清除为 0。

GDTR 和 IDTR 使用基址和限长字段加载。

#### 29.3.2.3 加载客户 RIP、RSP、RFLAGS 和 SSP

RSP、RIP 和 RFLAGS 分别从 RSP 字段、RIP 字段和 RFLAGS 字段加载。

如果"load CET" VM 进入控制为 1，SSP（影子栈指针）从 SSP 字段加载。

以下条目涉及不在 64 位模式的 VM 进入上这些字段的高 32 位：

-   RSP 的第 63:32 位在 64 位模式之外未定义。因此，在不在 64 位模式的 VM 进入上，逻辑处理器可以忽略 RSP 字段的第 63:32 位的内容。
-   如第 29.3.1.4 节所述，在不在 64 位模式的 VM 进入上，RIP 和 RFLAGS 字段的第 63:32 位必须为 0。（当"load CET" VM 进入控制为 1 时，对于不在 64 位模式的 VM 进入，SSP 也是如此。）

#### 29.3.2.4 加载页目录指针表项

如第 29.3.1.6 节所述，如果 CR0.PG = 1、CR4.PAE = 1 且 IA32_EFER.LME = 0，逻辑处理器使用 PAE 分页。到使用 PAE 分页的客户的 VM 进入基于"enable EPT" VM 执行控制的设置将 PDPTE 加载到内部、非架构寄存器中：

-   如果控制为 0，PDPTE 从 VM 进入正在加载的 CR3 值中物理地址引用的页目录指针表加载（见第 29.3.2.1 节）。加载的值在 VMX 非根操作中被视为物理地址。
-   如果控制为 1，PDPTE 从客户状态区域中的相应字段加载（见第 27.4.2 节）。加载的值在 VMX 非根操作中被视为客户物理地址。

#### 29.3.2.5 更新非寄存器状态

第 31.4 节描述 VMX 架构如何控制逻辑处理器管理 TLB 和分页结构缓存中的信息。以下条目详述 VM 进入如何使缓存的映射失效：

-   如果"enable VPID" VM 执行控制为 0，逻辑处理器使与 VPID 0000H 相关联的线性映射和组合映射失效（对所有 PCID）；VPID 0000H 的组合映射对所有 EPTRTA 值失效（EPTRTA 是 EPTP 第 51:12 位的值）。
-   如果"enable VPID" VM 执行控制为 1，VM 进入不需要使任何客户物理映射失效，也不需要使任何线性映射或组合映射失效。

如果"virtual-interrupt delivery" VM 执行控制为 1，VM 进入从 VMCS 中的客户中断状态字段加载 RVI 和 SVI 的值（见第 27.4.2 节）。这样做之后，逻辑处理器首先使 PPR

虚拟化（第 32.1.3 节），然后评估挂起的虚拟中断（第 32.2.1 节）。  
如果识别到虚拟中断，它可能在 VM 进入（包括任何指定的事件注入）完成后立即在 VMX 非根操作中交付；见第 29.7.5 节。关于虚拟中断交付的详细信息，见第 32.2.2 节。  
如果"APIC-timer virtualization" VM 执行控制为 1，VM 进入从 VMCS 客户状态区域中的相应字段加载客户截止时间。客户截止时间更新的操作见第 28.5.10.1 节。

### 29.3.3 清除地址范围监视

Intel 64 和 IA-32 架构允许软件使用 MONITOR 和 MWAIT 指令监视指定地址范围。见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 11.10.4 节。VM 进入清除可能生效的任何地址范围监视。

## 29.4 加载 MSR

VM 进入可以从 VM-entry MSR-load 区域加载 MSR（见第 27.8.2 节）。具体来说，该区域中的每个条目（最多为 VM-entry MSR-load 计数中指定的数量）按顺序处理，用第 127:64 位的内容按 WRMSR 会写入的方式加载由第 31:0 位索引的 MSR。¹

在以下任一情况下，条目的处理失败：

-   第 31:0 位的值是 C0000100H（IA32_FS_BASE MSR）或 C0000101（IA32_GS_BASE MSR）。
-   第 31:8 位的值是 000008H，意味着索引的 MSR 是当本地 APIC 处于 x2APIC 模式时允许访问 APIC 寄存器的 MSR。
-   第 31:0 位的值指示只能在系统管理模式（SMM）中写入的 MSR，且 VM 进入不是在 SMM 中开始的。（IA32_SMM_MONITOR_CTL 是只能在 SMM 中写入的 MSR。）
-   第 31:0 位的值指示由于特定于型号的原因不能在 VM 进入时加载的 MSR。即使 MSR 通常可以由 WRMSR 写入，处理器也可能阻止加载某些 MSR。这种特定于型号的行为在《Intel® 64 和 IA-32 架构软件开发手册》第 4 卷第 2 章"特定型号寄存器（MSR）"中记录。
-   第 63:32 位不全部为 0。
-   如果通过 WRMSR 在 CPL = 0 下执行，将第 127:64 位写入由条目第 31:0 位索引的 MSR 的尝试会导致通用保护异常。²

如果任何条目的处理失败，VM 进入失败。逻辑处理器通过从宿主状态区域加载状态来响应此类失败，就像它会为 VM 退出那样。见第 29.8 节。

如果任何 MSR 正以在架构上需要 TLB 刷新的方式加载，TLB 被更新，以便在 VM 进入后，逻辑处理器不会使用转换前缓存过的任何转换。

如果 IA32_SPEC_CTRL MSR 包含在 VM-entry MSR-load 区域中，当"virtualize IA32_SPEC_CTRL" VM 执行控制被设置为 1 时，加载到 MSR 的值未定义。如果"virtualize IA32_SPEC_CTRL" VM 执行控制为 1，软件应避免将 IA32_SPEC_CTRL MSR 包含在 VM-entry MSR-load 区域中。

## 29.5 追踪地址预转换（TAPT）

当"Intel PT uses guest physical addresses" VM 执行控制为 1 时，Intel PT 使用的地址被视为客户物理地址，这些地址使用 EPT 转换为物理地址。

VM 进入使用追踪地址预转换（TAPT）以防止缓冲的追踪数据因 EPT 违规而丢失；见第 28.5.4.2 节。仅当 Intel PT 将在 VM 进入后启用（IA32_RTIT_CTL.TraceEn = 1）且仅当"Intel PT uses guest physical addresses" VM 执行控制为 1 时，VM 进入才使用 TAPT。

如第 28.5.4 节所述，TAPT 可能因 EPT 违规、EPT 误配置、页修改日志已满事件或 APIC 访问而导致 VM 退出。如果 VM 进入期间 TAPT 导致此类 VM 退出，VM 退出的运行方式就像它在 VM 进入完成后（在客户上下文中）的 VMX 非根操作中发生一样。

如果 VM 进入期间 TAPT 导致 VM 退出，VM 进入不执行事件注入（第 29.6 节），即使注入事件标识字段中的有效位为 1。此类 VM 退出将注入事件标识和注入事件错误码字段的内容分别保存到原始事件标识和原始事件错误码字段中。

## 29.6 事件注入

如果注入事件标识字段（见第 27.8.3 节）中的有效位为 1，VM 进入在客户状态的所有组件已被加载（包括 MSR）且 VM 执行控制字段已被确立之后，引起事件被交付（或在一种情况下，被挂起）。

-   如果字段中的事件类型为 0（外部中断）、2（非可屏蔽中断）、3（硬件异常）、4（软件中断）、5（特权软件异常）或 6（软件异常），事件按第 29.6.1 节所述交付。如果事件类型为 7（其他事件）且向量字段为 1（SYSCALL）或 2（SYSENTER），也这样做。
-   如果字段中的事件类型为 7（其他事件）且向量字段为 0，MTF VM 退出在 VM 进入后挂起。见第 29.6.2 节。

### 29.6.1 中断和异常的注入

VM 进入在 VM 进入建立的客户上下文中交付注入的事件。这意味着交付发生在客户状态的所有组件已被加载（包括 MSR）且 VM 执行控制字段已被确立之后：¹

-   如果 FRED 转换未启用，事件使用该字段中的向量选择 IDT 中的描述符来交付。（由于事件注入发生在从客户状态区域加载 IDTR 之后，这是客户 IDT。）
-   如果 FRED 转换已启用，事件使用 FRED 事件交付来交付。（由于事件注入发生在对控制 FRED 转换的 MSR 的任何可选加载之后，那些 MSR 控制此事件交付。）

第 29.6.1.1 节提供事件注入的细节。一般来说，事件的交付方式与它正常生成时完全一样。

如果以下所有都成立，则存在例外：客户 CR4 字段中的第 25 位（UINTR）被设置为 1 且"IA-32e mode guest" VM 进入控制为 1，且 VM 进入正在注入向量为 UINV 在 VM 进入后将具有的值的注入外部中断。在这种情况下，逻辑处理器不交付中断，而是按第 9.5.2 节指定执行用户中断通知处理。（如果客户活动状态字段指示 HLT 状态，逻辑处理器在用户中断通知处理之后进入 HLT 状态。）

如果事件交付（或用户中断通知处理；见上文）遇到嵌套异常（例如，由于向量指示超出 IDT 限长的描述符而导致的通用保护异常），使用该异常的向量查阅异常位图：

-   如果嵌套异常的位为 0，嵌套异常被正常处理。如果嵌套异常是良性的，它被正常交付。如果它是贡献性的或页错误，根据其交付遇到嵌套异常的事件性质，可能生成双错误。见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 7 章"事件 8——双错误异常（#DF）"。¹
-   如果嵌套异常的位为 1，发生 VM 退出。第 29.6.1.2 节详述事件注入导致 VM 退出的情况。

#### 29.6.1.1 事件注入的细节

事件注入过程由注入事件标识字段（格式见表 27-18）、注入事件错误码字段、注入事件数据字段（用于 FRED 事件交付）和 VM-entry 指令长度字段的内容控制。以下条目提供过程的细节：

-   为 RFLAGS 推入栈的值一般是那个从客户状态区域加载的值。为 RF 标志推入的值不基于正在交付的事件类型修改。然而，如果软件中断正被注入到将处于 virtual-8086 模式的客户中，推入的 RFLAGS 值可能被修改（见下文）。在 RFLAGS 被推入栈后，RFLAGS 寄存器中的值按正常交付事件时那样修改。
-   推入栈的指令指针取决于事件类型以及其交付期间是否发生嵌套异常。术语 **当前客户 RIP** 指要从客户状态区域加载的值。推入的值按如下确定：²
    -   如果 VM 进入成功注入（无嵌套异常）事件类型为外部中断、NMI 或硬件异常的事件，当前客户 RIP 被推入栈。
    -   如果 VM 进入成功注入（无嵌套异常）事件类型为软件中断、特权软件异常或软件异常的事件，当前客户 RIP 在推入栈前递增 VM-entry 指令长度。此条目也适用于 VM 进入正在注入 SYSCALL 或 SYSENTER（使用 FRED 事件交付）的情况。
    -   如果 VM 进入在注入事件时遇到异常且该异常不导致 VM 退出，无论事件类型或 VM-entry 指令长度如何，当前客户 RIP 被推入栈。如果遇到的异常确实导致保存 RIP 的 VM 退出，保存的 RIP 是当前客户 RIP。
-   如果注入事件标识字段中的交付错误码位（第 11 位）被设置，注入事件错误码字段的内容作为错误码被推入栈，就像在异常交付期间错误码会被推入一样。如果此位被清除，FRED 事件交付为错误码推入零。
-   DR6、DR7 和 IA32_DEBUGCTL MSR 不被事件注入修改，即使事件具有向量 1（向量为 1 的调试异常的正常交付确实更新这些寄存器）。
-   如果 VM 进入正在注入软件中断且客户将处于 virtual-8086 模式（RFLAGS.VM = 1），由于 RFLAGS.IOPL < 3 不能发生通用保护异常。VM 监视器应在注入此类事件前检查 RFLAGS.IOPL，并且如果需要，注入通用保护异常而不是软件中断。
-   如果 VM 进入正在注入软件中断且客户将处于带 virtual-8086 模式扩展的 virtual-8086 模式（RFLAGS.VM = CR4.VME = 1），事件交付受基于任务状态段（TSS）中软件中断重定向位图的 VME 中断重定向，按如下方式：
    -   如果位图中的位 n 被清除（其中 n 是软件中断的编号），中断被导向 8086 程序中断处理程序：处理器使用位于线性地址零处的 16 位中断向量表（IVT）。如果 RFLAGS.IOPL 的值小于 3，对推入栈的 RFLAGS 值做以下修改：IOPL 被设置为 3，IF 被设置为 VIF 的值。
    -   如果位图中的位 n 被设置（其中 n 是软件中断的编号），中断被导向保护模式中断处理程序。（换句话说，注入按下一条目描述的方式处理。）在这种情况下，如果 RFLAGS.IOPL < 3，软件中断不调用此类处理程序（改为发生通用保护异常）。然而，如上所述，RFLAGS.IOPL 不能使注入的软件中断导致此类异常。因此，在这种情况下，注入独立于 RFLAGS.IOPL 的值调用保护模式中断处理程序。  
        其他类型的事件的注入不受此重定向的影响。
-   如果 VM 进入正在注入软件中断（未按上述重定向）或软件异常，对正在访问的 IDT 描述符执行特权检查，就像执行 INT n、INT3 或 INTO 那样（描述符的 DPL 不能小于 CPL）。不检查 RFLAGS.IOPL，即使客户将处于 virtual-8086 模式。此检查失败可能导致嵌套异常。事件类型为外部中断、NMI、硬件异常和特权软件异常，或事件类型为软件中断且按上述重定向的事件注入，不执行这些检查。
-   如果 VM 进入正在注入非可屏蔽中断（NMI）且"virtual NMIs" VM 执行控制为 1，虚拟 NMI 阻止在 VM 进入后生效。
-   如果 IA32_DEBUGCTL MSR 中的 LBR 位被设置，转换导致记录最后分支记录。这对即使调试异常等事件也为真，调试异常通常会在交付前清除 LBR 位。
-   最后异常记录 MSR（LER）可以基于 IA32_DEBUGCTL MSR 中 LBR 位的设置更新。调试异常等事件通常会在交付前清除 LBR 位，因此通常不更新 LER，但可能作为 VM 进入事件注入的一部分这样做。
-   如果事件注入遇到嵌套异常，该嵌套异常的任何错误码中 EXT 位（第 0 位）的值按如下确定：
    -   如果正在注入的事件事件类型为外部中断、NMI、硬件异常或特权软件异常且遇到嵌套异常（但不产生双错误），该异常的错误码设置 EXT 位。
    -   如果正在注入的事件是软件中断、软件异常或（对于 FRED 事件交付）SYSCALL 或 SYSENTER，且遇到嵌套异常，该异常的错误码清除 EXT 位。
    -   如果事件交付遇到嵌套异常且该异常的交付遇到另一异常（但不产生双错误），该异常的错误码设置 EXT 位。
    -   如果产生双错误，双错误的错误码是 0000H（EXT 位被清除）。
-   以下条目专门适用于注入的事件使用 FRED 事件交付交付的情况（因为 FRED 转换将在 VM 进入后启用）：
    -   FRED 事件交付的部分依赖于事件发生时 CPL。对于 VM 进入注入的事件，用于 CPL 的值是 VM 进入为 SS 访问权限字段中的 DPL 加载的值。
    -   如果注入事件标识字段的第 13 位为 1，FRED 事件交付确定栈级，就像正在交付的事件是在另一事件交付期间遇到的异常。（否则，它不这样做。）FRED 事件交付为此位保存"嵌套异常"指示，保存在栈上保存的事件信息中（具体来说，这是栈上增强 SS 字段的第 58 位）。此位不用于使用 IDT 事件交付注入的事件。
    -   FRED 事件交付建立的栈帧包括为某些事件定义的 64 位事件数据栈。对于 VM 进入注入的事件，保存的事件数据是 VMCS 中注入事件数据字段的值。这是为所有注入事件完成的（即使那些通常不定义事件数据的事件）。
    -   某些事件的 FRED 事件交付保存指令长度作为事件信息的一部分。对于 VM 进入注入的此类事件，保存的指令长度是 VM-entry 指令长度字段的值。
    -   FRED 事件交付作为事件信息的一部分保存一个指示事件是否在逻辑处理器处于飞地模式时发生的位。对于 VM 进入注入的事件，保存的值是客户中断性状态字段第 4 位的值（指示"enclave interruption"）。
    -   以下条目提供 VM 进入注入事件的 FRED 事件交付如何设置栈上保存的增强 CS 和增强 SS 中的位的细节：¹
        -   增强 CS 的第 17:16 位（栈级）被设置为依赖于事件正从其中交付的 CPL 的值（关于如何确定此 CPL 见上文）：
            -   如果 CPL 为 0，第 17:16 位被设置为如果 VM 进入在未注入事件的情况下完成本会在 IA32_FRED_CONFIG\[1:0\] 中的值。²
            -   如果 CPL 为 3，第 17:16 位为零。
        -   增强 CS 的第 18 位（间接分支跟踪器）被设置为依赖于事件正从其中交付的 CPL 和客户 CR4 字段中第 23 位（CET）的值的值：
            -   如果 CPL 为 3 或客户 CR4.CET 为 0，第 18 位为 0。
            -   如果 CPL 为 0 且客户 CR4.CET 为 1，该位被设置为 IA32_S_CET.ENDBR 与 IA32_S_CET.TRACKER 的值，指 VM 进入后 IA32_S_CET MSR 将具有的值。
        -   增强 SS 的第 16 位（由 STI 阻止）被设置为客户中断性状态第 0 位的值（该位指示由 STI 阻止）。（事件注入后没有由 STI 阻止。）
        -   当且仅当注入事件标识字段中第 10:8 位的值为 4（指示事件类型软件中断）或 7（指示事件类型"other event"，用于 SYSCALL 和 SYSENTER）时，增强 SS 的第 17 位（软件中断或系统调用）被设置。³
        -   当且仅当 VMCS 中注入事件标识字段第 10:8 位的值为 2（指示事件类型 NMI）时，增强 SS 的第 18 位（NMI）被设置。

#### 29.6.1.2 事件注入期间的 VM 退出

正在注入的事件无论 VM 执行控制的设置如何，永远不直接导致 VM 退出。例如，将" NMI exiting" VM 执行控制设置为 1 不会因 NMI 的注入导致 VM 退出。

然而，事件交付过程可能导致 VM 退出：

-   如果注入事件标识字段中的向量标识 IDT 中的任务门，尝试的任务切换可能导致 VM 退出，就像注入的事件在 VMX 非根操作中正常执行期间发生那样（见第 28.4.2 节）。
-   如果事件交付遇到嵌套异常，根据异常位图的内容可能发生 VM 退出（见第 28.2 节）。
-   如果事件交付生成双错误异常（由于嵌套异常）；逻辑处理器在尝试调用双错误处理程序时遇到另一嵌套异常；且该异常不因异常位图导致 VM 退出；则因三错误发生 VM 退出（见第 28.2 节）。
-   如果事件交付注入双错误异常且遇到不因异常位图导致 VM 退出的嵌套异常，则因三错误发生 VM 退出（见第 28.2 节）。
-   如果"virtualize APIC accesses" VM 执行控制为 1 且事件交付生成对 APIC-access 页的访问，该访问按第 32.4 节所述处理且可能导致 VM 退出。⁴

如果事件交付过程确实导致 VM 退出，VM 退出前的处理器状态按注入的事件在 VMX 非根操作中正常执行期间发生的确定方式确定。如果注入的事件直接访问导致 VM 退出的任务门或如果遇到的第一个嵌套异常导致 VM 退出，关于注入事件的信息保存在原始事件标识字段中（见第 30.2.4 节）。

如果外部中断的注入导致用户中断通知处理而不是事件交付（见前面第 29.6.1 节），本节材料也适用。

#### 29.6.1.3 到实地址模式的 VM 进入的事件注入

如果 VM 进入正在用 0 加载 CR0.PE，任何注入的事件按实地址模式中正常会做的方式交付。¹ 具体来说，VM 进入使用注入事件标识字段中提供的向量选择 IDTR.base 中线性地址处中断向量表中的 4 字节条目。进一步细节见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 16.1.4 节。

由于如果 VM 进入后 CR0.PE 将为 0，注入事件标识字段中的第 11 位（交付错误码）必须为 0（见第 29.2.1.3 节），用 CR0.PE = 0 注入的事件不向栈推入错误码。这是

与实地址模式中的事件交付一致。  
如果事件交付遇到故障（由于违反 IDTR.limit 或 SS.limit），故障被视为就像它在 VMX 非根操作中的事件交付期间发生那样。此类故障可能导致 VM 退出，如第 29.6.1.2 节所述。

### 29.6.2 挂起 MTF VM 退出的注入

如果注入事件标识字段中的事件类型为 7（其他事件）且向量字段为 0，VM 进入引起 MTF VM 退出在 VM 进入后的指令边界上挂起。即使"monitor trap flag" VM 执行控制为 0，也是这种情况。挂起 MTF VM 退出的处理见第 28.5.2 节。

## 29.7 VM 进入的特殊特性

本节详述 VM 进入的各种特性。它使用以下术语：如果注入事件标识的有效位（第 31 位）为 1 且字段中的事件类型为 0（外部中断）、2（非可屏蔽中断）、3（硬件异常）、4（软件中断）、5（特权软件异常）或 6（软件异常），VM 进入正在注入。

### 29.7.1 中断性状态

客户状态区域中的中断性状态字段（见表 27-3）包含控制由 STI 阻止、由 MOV SS 阻止和由 NMI 阻止的位。此字段按如下方式影响 VM 进入后的事件阻止：

-   如果 VM 进入正在注入，无论中断性状态字段的内容如何，VM 进入后没有由 STI 或由 MOV SS 阻止。
-   如果 VM 进入未在注入，应用以下事项：
    -   当且仅当中断性状态字段中的第 0 位为 1 时，事件被 STI 阻止。在客户执行一条指令或招致异常（包括由 VM 进入挂起的调试异常；见第 29.7.3 节）后，此阻止被清除。
    -   当且仅当中断性状态字段中的第 1 位为 1 时，事件被 MOV SS 阻止。这可能影响待处理调试异常的处理；见第 29.7.3 节。在客户执行一条指令或招致异常（包括由 VM 进入挂起的调试异常）后，此阻止被清除。
-   非可屏蔽中断（NMI）的阻止按如下确定：
    -   如果"virtual NMIs" VM 执行控制为 0，当且仅当中断性状态字段中的第 3 位（由 NMI 阻止）为 1 时，NMI 被阻止。如果"NMI exiting" VM 执行控制为 0，IRET 指令的执行移除此阻止（即使指令生成故障）。如果"NMI exiting"控制为 1，IRET 不影响此阻止。
    -   以下条目描述如果"virtual NMIs" VM 执行控制为 1，中断性状态字段中第 3 位（由 NMI 阻止）的使用：
        -   位的值不影响 VM 进入后 NMI 的阻止。NMI 在 VMX 非根操作中不被阻止（除了因其他原因的普通阻止，如由 MOV SS 指令、wait-for-SIPI 状态等）。
        -   位的值确定 VM 进入后是否存在虚拟 NMI 阻止。如果位为 1，虚拟 NMI 阻止在 VM 进入后生效。如果位为 0，VM 进入后没有虚拟 NMI 阻止，除非 VM 进入正在注入 NMI（见第 29.6.1.1 节）。IRET 的执行移除虚拟 NMI 阻止（即使指令生成故障）。

如果"NMI exiting" VM 执行控制为 0，"virtual NMIs"控制必须为 0；见第 29.2.1.1 节。

-   系统管理模式中断（SMI）的阻止按如下确定：
    -   如果 VM 进入不是在系统管理模式（SMM）中执行的，SMI 阻止不被 VM 进入改变。
    -   如果 VM 进入是在 SMM 中执行的，当且仅当中断性状态字段中的第 2 位为 1 时，SMI 在 VM 进入后被阻止。

### 29.7.2 活动状态

客户状态区域中的活动状态字段控制 VM 进入后逻辑处理器是活动的还是处于第 27.4.2 节中标识的非活动状态之一。此字段的使用按如下确定：

-   如果 VM 进入正在注入，逻辑处理器在 VM 进入后处于活动状态。虽然第 29.3.1.5 节描述的对活动状态字段的一致性检查在这种情况下确实适用，但活动状态字段的内容不决定 VM 进入后的活动状态。
-   如果 VM 进入未在注入，逻辑处理器以客户状态区域中指定的活动状态结束 VM 进入。如果 VM 进入以逻辑处理器处于非活动活动状态结束，VM 进入生成从活动状态进入该活动状态时正常生成的任何特殊总线周期。如果 VM 进入将导致逻辑处理器处于关闭状态且逻辑处理器处于 SMX 操作中，¹ 发生 Intel® TXT 关闭条件。见《Intel® 可信执行技术测量启动环境开发者指南》。使用的错误码是 0000H，指示"legacy shutdown"。
-   某些活动状态无条件阻止某些事件。在把处理器置于指示状态的任何 VM 进入之后，以下阻止生效：
    -   **活动状态** 阻止启动 IPI（SIPI）。当逻辑处理器处于活动状态且在 VMX 非根操作中时到达的 SIPI 被丢弃且不导致 VM 退出。
    -   **HLT 状态** 阻止启动 IPI（SIPI）。当逻辑处理器处于 HLT 状态且在 VMX 非根操作中时到达的 SIPI 被丢弃且不导致 VM 退出。
    -   **关闭状态** 阻止外部中断和 SIPI。当逻辑处理器处于关闭状态且在 VMX 非根操作中时到达的外部中断不导致 VM 退出，即使"external-interrupt exiting" VM 执行控制为 1。当逻辑处理器处于关闭状态且在 VMX 非根操作中时到达的 SIPI 被丢弃且不导致 VM 退出。
    -   **wait-for-SIPI 状态** 阻止外部中断、非可屏蔽中断（NMI）、INIT 信号和系统管理模式中断（SMI）。如果当逻辑处理器处于 wait-for-SIPI 状态且在 VMX 非根操作中时到达，此类事件不导致 VM 退出。

### 29.7.3 VM 进入后待处理调试异常的交付

客户状态区域中的待处理调试异常字段指示是否存在尚未交付的调试异常（见第 27.4.2 节）。本节描述这些在 VM 进入时如何处理。

如果以下任一为真，VM 进入后没有待处理调试异常：

-   VM 进入使用 FRED 事件交付或以下事件类型之一注入：外部中断、非可屏蔽中断（NMI）、硬件异常或特权软件异常。
-   中断性状态字段不指示由 MOV SS 阻止且 VM 进入使用以下事件类型之一注入：软件中断或软件异常。
-   VM 进入未在注入且活动状态字段指示关闭或 wait-for-SIPI。

如果以上都不成立，待处理调试异常字段指定对客户挂起的调试异常。如果 BS 位（第 14 位）或启用断点位（第 12 位）为 1，存在有效待处理调试异常。如果存在有效待处理调试异常，它们按如下处理：

-   如果 VM 进入未在注入，待处理调试异常按它们本会在客户执行中正常遇到的方式处理：
    -   如果逻辑处理器未阻止此类异常（中断性状态字段不指示由 MOV SS 阻止），调试异常在 VM 进入后交付（见下文）。
    -   如果逻辑处理器阻止此类异常（由于由 MOV SS 阻止），待处理调试异常按正常情况被保持挂起或丢失。
-   如果 VM 进入正在注入（使用 IDT 事件交付，事件类型为软件中断或软件异常，且由 MOV SS 阻止），应用以下条目：
    -   对于软件中断或向量为 3（#BP）或向量为 4（#OF）的软件异常的注入——或向量为 1（#DB）的特权软件异常——如果相应指令（INT1、INT3 或 INTO）在遇到调试陷阱的 MOV SS 之后执行，待处理调试异常按它们本会在客户执行中正常遇到的方式处理。
    -   对于向量不是 3 和 4 的软件异常的注入，待处理调试异常可能丢失或在注入后交付（见下文）。

如果没有有效待处理调试异常（如上定义），VM 进入后不交付待处理调试异常。

如果在 VM 进入后交付待处理调试异常，它具有"前一条指令上的陷阱"的优先级（见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 7.9 节）。因此，INIT 信号和系统管理模式中断（SMI）优先于此类异常，由 TPR 阈值引起的 VM 退出（见第 29.7.7 节）和挂起 MTF VM 退出（见第 29.7.8 节）也是如此。异常优先于任何待处理的非可屏蔽中断（NMI）或外部中断，也优先于由"interrupt-window exiting"和"NMI-window exiting" VM 执行控制的 1 设置导致的 VM 退出。

FRED 事件交付作为事件信息的一部分保存一个指示事件是否在逻辑处理器处于飞地模式时发生的位。对于 VM 进入后交付的待处理调试异常，保存的值是客户中断性状态字段第 4 位的值（指示"enclave interruption"）。

如果在 VM 进入后交付的待处理调试异常导致 VM 退出，异常位图中位 1（#DB）为 1。如果它不导致 VM 退出，它正常更新 DR6。

### 29.7.4 VMX 抢占计时器

如果"activate VMX-preemption timer" VM 执行控制为 1，VM 进入用 VMX-preemption timer-value 字段中的无符号值启动 VMX 抢占计时器。

VMX 抢占计时器在 VM 进入期间可能到期（例如，如果 VMX-preemption timer-value 字段中的值为零）。如果发生这种情况（且如果 VM 进入不是到 wait-for-SIPI 状态），在任何事件注入之后和 VM 进入后的任何指令执行之前，以正常优先级发生 VM 退出。例如，由 VM 进入建立的任何待处理调试异常（见第 29.7.3 节）优先于计时器引起的 VM 退出。（计时器引起的 VM 退出将在调试异常交付后发生，除非该异常或其交付导致不同的 VM 退出。）

VMX 抢占计时器在 VMX 非根操作中操作的详细信息，包括它引起的 VM 退出的阻止和优先级，见第 28.5.1 节。

### 29.7.5 中断窗口退出和虚拟中断交付

如果"interrupt-window exiting" VM 执行控制为 1，打开的中断窗口可能导致 VM 退出在 VM 进入后立即发生（详细信息见第 28.2 节）。如果"interrupt-window exiting" VM 执行控制为 0 但"virtual-interrupt delivery" VM 执行控制为 1，虚拟中断可能在 VM 进入后立即交付（见第 29.3.2.5 节和第 32.2.1 节）。

以下条目详述这些事件的处理：

-   这些事件在任何为 VM 进入指定的事件注入之后发生。
-   非可屏蔽中断（NMI）和更高优先级事件优先于这些事件。这些事件优先于外部中断和更低优先级事件。
-   如果逻辑处理器刚刚由于 VM 进入进入 HLT 状态（见第 29.7.2 节），这些事件唤醒逻辑处理器。如果逻辑处理器刚刚进入关闭状态或 wait-for-SIPI 状态，它们不发生。

### 29.7.6 NMI 窗口退出

"NMI-window exiting" VM 执行控制可能导致 VM 退出在 VM 进入后立即发生（详细信息见第 28.2 节）。

以下条目详述这些 VM 退出的处理：

-   如果为 VM 进入指定了事件注入，这些 VM 退出跟随事件注入。
-   调试陷阱异常（见第 29.7.3 节）和更高优先级事件优先于由此控制引起的 VM 退出。由此控制引起的 VM 退出优先于非可屏蔽中断（NMI）和更低优先级事件。
-   如果逻辑处理器刚刚由于 VM 进入进入 HLT 状态或关闭状态（见第 29.7.2 节），由此控制引起的 VM 退出唤醒逻辑处理器。如果逻辑处理器刚刚进入 wait-for-SIPI 状态，它们不发生。

### 29.7.7 由 TPR 阈值引起的 VM 退出

如果"use TPR shadow"和"virtualize APIC accesses" VM 执行控制都为 1 且"virtual-interrupt delivery" VM 执行控制为 0，如果 TPR threshold VM 执行控制字段的第 3:0 位的值大于 VTPR 的第 7:4 位的值，VM 退出在 VM 进入后立即发生（见第 32.1.1 节）。¹

以下条目详述这些 VM 退出的处理：

-   如果 RFLAGS.IF = 0 或通过设置客户状态区域中中断性状态字段中的位，VM 退出不被阻止。
-   如果为 VM 进入指定了事件注入，VM 退出跟随事件注入。
-   由此控制引起的 VM 退出优先于系统管理模式中断（SMI）、INIT 信号和更低优先级事件。因此，它们优先于第 29.7.5 节、第 29.7.6 节和第 29.7.8 节描述的 VM 退出，以及任何在 VM 进入时可能挂起的中断或调试异常。
-   如果逻辑处理器刚刚作为 VM 进入的一部分进入 HLT 状态（见第 29.7.2 节），这些 VM 退出唤醒逻辑处理器。如果逻辑处理器刚刚进入关闭状态或 wait-for-SIPI 状态，它们不发生。  
    如果此类 VM 退出由于处理器刚刚进入关闭状态而被抑制，它在引起逻辑处理器在仍处于 VMX 非根操作中时离开关闭状态的任何事件交付后发生（例如，由于"NMI-exiting" VM 执行控制为 0 时发生的 NMI）。
-   基本退出原因是"TPR below threshold"。

### 29.7.8 挂起 MTF VM 退出

如第 29.6.2 节所述，VM 进入可能引起 MTF VM 退出在 VM 进入后立即挂起。以下条目详述这些 VM 退出的处理：

-   系统管理模式中断（SMI）、INIT 信号和更高优先级事件优先于这些 VM 退出。这些 VM 退出优先于调试陷阱异常和更低优先级事件。
-   如果逻辑处理器刚刚由于 VM 进入进入 HLT 状态（见第 29.7.2 节），这些 VM 退出唤醒逻辑处理器。如果逻辑处理器刚刚进入关闭状态或 wait-for-SIPI 状态，它们不发生。

### 29.7.9 VM 进入和高级调试特性

VM 进入不用最后分支记录记录，不产生分支追踪消息，不更新分支追踪存储。

### 29.7.10 VM 进入后的用户中断识别

如果 VM 进入以 CR4.UINTR = IA32_EFER.LMA = 1 且 UIRR ≠ 0 完成，VM 进入导致识别挂起的用户中断；否则，不识别挂起的用户中断。

## 29.8 在加载客户状态期间或之后的 VM 进入失败

由于第 29.3.1 节标识的检查导致的 VM 进入失败和第 29.4 节标识的 MSR 加载期间的失败，与 VM 进入中更早发生的失败处理方式不同。在这些情况下，采取以下步骤：

1.  **关于 VM 进入失败的信息记录在 VM-exit 信息字段中**：
    -   **退出原因**。
        -   此字段的第 15:0 位包含基本退出原因。它被加载为指示 VM 进入失败的一般原因的数字。使用以下数字：
            -   1.  由于无效客户状态导致 VM 进入失败。VM 进入未通过第 29.3.1 节标识的检查之一。
            -   1.  由于 MSR 加载导致 VM 进入失败。VM 进入在尝试加载 MSR 时失败（见第 29.4 节）。
            -   1.  由于机器检查事件导致 VM 进入失败。VM 进入期间发生机器检查事件（见第 29.9 节）。
        -   第 31 位被设置为 1 以指示 VM 进入失败。
        -   字段的其余部分（第 30:16 位）被清除。
    -   **退出资格**。此字段基于退出原因设置。
        -   由于无效客户状态导致 VM 进入失败。在大多数情况下，退出资格被清除为 0。在指示的情况下使用以下非零值：
            1.  不使用。
            2.  失败是由于加载 PDPTE 的问题（见第 29.3.1.6 节）。
            3.  失败是由于尝试向通过中断性状态字段中 STI 阻止位阻止事件的客户注入非可屏蔽中断（NMI）。
            4.  失败是由于无效的 VMCS 链接指针（见第 29.3.1.5 节）。  
                VM 进入对客户状态字段的检查可以以任何顺序执行。因此，退出资格指示一种原因并不意味着不存在其他错误。不同处理器可能对同一 VMCS 给出不同的退出资格。
        -   由于 MSR 加载导致 VM 进入失败。退出资格被加载以指示 VM-entry MSR-load 区域中哪个条目引起问题（第一个条目为 1，第二个为 2，等等）。
    -   **所有其他 VM-exit 信息字段不被修改**。
2.  处理器状态按 VM 退出时那样加载（见第 30.5 节）。如果这导致 \[CR4.PAE & CR0.PG & ~IA32_EFER.LMA\] = 1，可能检查和加载页目录指针表项（PDPTE）（见第 30.5.4 节）。
3.  由 NMI 阻止的状态是 VM 进入前的状态。
4.  按 VM-exit MSR-load 区域中指定的加载 MSR（见第 30.6 节）。

虽然此过程类似于 VM 退出，但 VM 退出期间采取的许多步骤不为此类 VM 进入失败发生：

-   大多数 VM-exit 信息字段不被更新（见上面步骤 1）。
-   注入事件标识字段中的有效位不被清除。
-   客户状态区域不被修改。
-   没有 MSR 被保存到 VM-exit MSR-store 区域。

## 29.9 VM 进入期间的机器检查事件

如果机器检查事件在 VM 进入期间发生，以下之一发生：

-   机器检查事件按它发生在 VM 进入之前的方式处理：
    -   如果 CR4.MCE = 0，逻辑处理器的操作取决于逻辑处理器是否处于 SMX 操作中：¹
        -   如果逻辑处理器处于 SMX 操作中，发生 Intel® TXT 关闭条件。使用的错误码是 000CH，指示"unrecoverable machine-check condition"。
        -   如果逻辑处理器在 SMX 操作之外，它进入关闭状态。
    -   如果 CR4.MCE = 1，机器检查异常（#MC）被正常交付。
-   机器检查事件在 VM 进入完成后处理：
    -   如果 VM 进入以 CR4.MCE = 0 结束，逻辑处理器的操作取决于逻辑处理器是否处于 SMX 操作中：
        -   如果逻辑处理器处于 SMX 操作中，发生带错误码 000CH（不可恢复的机器检查条件）的 Intel® TXT 关闭条件。
        -   如果逻辑处理器在 SMX 操作之外，它进入关闭状态。
    -   如果 VM 进入以 CR4.MCE = 1 结束，生成机器检查异常（#MC）：
        -   如果异常位图的第 18 位（#MC）为 0，异常在 VM 进入后被正常交付。
        -   如果异常位图的第 18 位为 1，异常导致 VM 退出。
-   发生如第 29.8 节所述的 VM 进入失败。基本退出原因是 41，为"VM-entry failure due to machine-check event"。

如果机器检查事件在任何客户状态已被加载之后发生，不使用第一个选项。仅当 VM 进入能够加载所有客户状态时使用第二个选项。

## 第 30 章 VM 退出

VM 退出响应 VMX 非根操作中的某些指令和事件而发生，如第 28.1 节至第 28.2 节详述。VM 退出执行以下操作：

1.  关于 VM 退出原因的信息记录在 VM-exit 信息字段中，VM-entry 控制字段按第 30.2 节所述修改。
2.  处理器状态保存在客户状态区域中（第 30.3 节）。
3.  MSR 可以保存在 VM-exit MSR-store 区域中（第 30.4 节）。此步骤不为激活 SMI 和 SMM 双监视器处理的 SMM VM 退出执行。
4.  以下可以并行且以任何顺序执行（第 30.5 节）：
    -   处理器状态部分基于宿主状态区域和一些 VM-exit 控制加载。此步骤不为激活 SMI 和 SMM 双监视器处理的 SMM VM 退出执行。此类 VM 退出如何加载处理器状态的信息见第 34.15.6 节。
    -   清除地址范围监视。
5.  可以从 VM-exit MSR-load 区域加载 MSR（第 30.6 节）。此步骤不为激活 SMI 和 SMM 双监视器处理的 SMM VM 退出执行。

VM 退出不用最后分支记录记录，不产生分支追踪消息，不更新分支追踪存储。

第 30.1 节阐明 VM 退出开始前架构状态的性质。上述步骤在第 30.2 节至第 30.6 节中详述。

第 34.15 节描述系统管理模式中断（SMI）和系统管理模式（SMM）的双监视器处理。在此处理下，到 SMM 的普通转换被到单独 SMM 监视器的 VM 退出替代。称为 SMM VM 退出，它们由 SMI 的到达或在 VMX 根操作中执行 VMCALL 引起。SMM VM 退出与在其他 VM 退出不同的方式在第 34.15.2 节中详述。

## 30.1 VM 退出前的架构状态

本节描述 VM 退出前存在的架构状态，尤其是对于由正常会交付给客户软件的事件引起的 VM 退出。注意以下事项：

-   如果异常位图中设置了与该异常对应的位，异常直接导致 VM 退出。如果"NMI exiting" VM 执行控制为 1，非可屏蔽中断（NMI）直接导致 VM 退出。如果"external-interrupt exiting" VM 执行控制为 1，外部中断直接导致 VM 退出。当逻辑处理器处于 wait-for-SIPI 活动状态时到达的启动 IPI（SIPI）直接导致 VM 退出。当处理器不处于 wait-for-SIPI 活动状态时到达的 INIT 信号直接导致 VM 退出。
-   异常、NMI、外部中断或软件中断如果不直接导致 VM 退出，但事件的交付导致导致 VM 退出的嵌套异常、双错误、任务切换、APIC 访问（见第 32.4 节）、EPT 违规、EPT 误配置、页修改日志已满事件（见第 31.3.6 节）或 SPP 相关事件（见第 31.3.4 节），则间接导致 VM 退出。
-   事件如果导致 VM 退出（直接或间接），则结果是 VM 退出。

以下条目详述架构状态何时响应 VM 退出而更新和何时不更新：

-   如果事件直接导致 VM 退出，它不像未导致 VM 退出那样更新架构状态：
    
    -   调试异常不更新 DR6、DR7 或 IA32_DEBUGCTL。（关于调试异常性质的信息保存在退出资格字段中。）
    -   页错误不更新 CR2。（导致页错误的线性地址保存在退出资格字段中。）
    -   NMI 导致后续 NMI 被阻止，但仅在 VM 退出完成后。
    -   外部中断不确认中断控制器且中断保持挂起，除非"acknowledge interrupt on exit" VM-exit 控制为 1。在这种情况下，中断控制器被确认且中断不再挂起。
    -   当任务切换导致 VM 退出时，DR7 中的标志 L0–L3（第 0 位、第 2 位、第 4 位和第 6 位）不被清除。
    -   如果任务切换导致 VM 退出，以下都不被任务切换修改：旧任务状态段（TSS）；新 TSS；旧 TSS 描述符；新 TSS 描述符；RFLAGS.NT；¹ 或 TR 寄存器。
    -   如果本会直接导致 VM 退出的事件不产生最后异常记录。
    -   如果机器检查异常直接导致 VM 退出，这不阻止机器检查 MSR 被更新。它们由机器检查事件本身更新，而不是由产生的机器检查异常更新。
    -   如果逻辑处理器处于非活动状态（见第 27.4.2 节）且未执行指令，某些事件可能被阻止但其他事件可能使逻辑处理器返回活动状态。未阻止的事件可能导致 VM 退出。² 如果未阻止的事件直接导致 VM 退出，仅在 VM 退出完成后发生返回到活动状态。³ VM 退出生成从该活动状态进入活动状态时正常生成的任何特殊总线周期。  
        MTF VM 退出（见第 28.5.2 节和第 29.7.8 节）在 HLT 活动状态中不被阻止。如果 MTF VM 退出在 HLT 活动状态中发生，逻辑处理器仅在 VM 退出完成后返回活动状态。MTF VM 退出在关闭状态和 wait-for-SIPI 状态中被阻止。
-   如果事件间接导致 VM 退出，事件确实更新架构状态：
    
    -   调试异常更新 DR6、DR7 和 IA32_DEBUGCTL MSR。没有调试异常被认为是挂起的。
    -   页错误更新 CR2。
    -   NMI 在 VM 退出开始前导致后续 NMI 被阻止。
    -   外部中断确认中断控制器且中断不再挂起。
    -   如果逻辑处理器一直处于非活动状态，它进入活动状态且在 VM 退出开始前生成从该活动状态进入活动状态时正常生成的任何特殊总线周期。
    -   VM 退出开始时没有由 STI 或由 MOV SS 阻止。
    -   正常作为通过 IDT 交付的一部分更新的处理器状态（CS、RIP、SS、RSP、RFLAGS）不被修改。然而，事件的未完成交付可能写入栈。
    -   最后异常记录的处理是实现相关的：
        -   某些处理器在开始交付事件时（在它能遇到嵌套异常之前）做最后异常记录。即使事件遇到导致 VM 退出的嵌套异常（包括嵌套异常导致三错误的情况），此类处理器也执行此更新。
        -   其他处理器延迟做最后异常记录，直到事件交付已成功到达某个事件处理程序（可能在一个或多个嵌套异常之后）。如果在到达事件处理程序前发生 VM 退出或三错误，此类处理器不更新最后异常记录。
-   如果"virtual NMIs" VM 执行控制为 1、VM 进入注入 NMI 且 NMI 的交付导致导致 VM 退出的嵌套异常、双错误、任务切换、EPT 违规、EPT 误配置、页修改日志已满事件、SPP 相关事件或 APIC 访问，虚拟 NMI 阻止在 VM 退出开始前生效。
    
-   如果 VM 退出由在 IRET 执行期间遇到的故障、EPT 违规、EPT 误配置、页修改日志已满事件或 SPP 相关事件引起且"NMI exiting" VM 执行控制为 0，任何由 NMI 阻止在 VM 退出开始前被清除。然而，由 NMI 阻止的先前状态可能记录在退出资格或退出事件标识字段中；见第 30.2.3 节。
    
-   如果 VM 退出由在 IRET 执行期间遇到的故障、EPT 违规、EPT 误配置、页修改日志已满事件或 SPP 相关事件引起且"virtual NMIs" VM 执行控制为 1，虚拟 NMI 阻止在 VM 退出开始前被清除。然而，由 NMI 阻止的先前状态可能记录在退出资格或退出事件标识字段中；见第 30.2.3 节。
    
-   假设 VM 退出由 x87 FPU 浮点错误（#MF）直接引起，或由以下任何事件引起（如果事件由于 x87 FPU 浮点错误而未阻止并给予优先级）：INIT 信号、外部中断、NMI、SMI；或机器检查异常。在这些情况下，VM 退出开始时没有由 STI 或由 MOV SS 阻止。
    
-   正常来说，事件交付时可能做最后分支记录。然而，如果此类事件在交付完成前导致 VM 退出，不做最后分支记录。
    
-   如果机器检查异常导致 VM 退出，处理器状态可疑且可能导致可疑状态保存到客户状态区域。VM 监视器在恢复导致由机器检查异常引起的 VM 退出的客户前，应查阅 IA32_MCG_STATUS MSR 中的 RIPV 和 EIPV 位。
    
-   如果 VM 退出由在执行指令时遇到的故障、APIC 访问（见第 32.4 节）、EPT 违规、EPT 误配置、页修改日志已满事件或 SPP 相关事件引起，由该指令导致的数据断点可能已被识别且关于它们的信息可能保存在待处理调试异常字段中（除非 VM 退出清除该字段；见第 30.3.4 节）。
    
-   以下 VM 退出被认为是发生在指令执行后：
    
    -   由调试陷阱（单步、I/O 断点和数据断点）引起的 VM 退出。
    -   由识别被 MOV SS 阻止延迟的调试异常（数据断点）引起的 VM 退出。
    -   由某些机器检查异常引起的 VM 退出。
    -   当"CR8-load exiting" VM 执行控制为 0 且"use TPR shadow" VM 执行控制为 1 时，由 MOV 到 CR8 的执行引起的陷阱类 VM 退出（见第 32.3 节）。（此类 VM 退出只能从 64 位模式发生，因此只在支持 Intel 64 架构的处理器上。）
    -   当"use MSR bitmaps" VM 执行控制为 1、ECX 的值在 800H–8FFH 范围内、低 MSR 写位图中与 ECX 值对应的位为 0 且"virtualize x2APIC mode" VM 执行控制为 1 时，由 WRMSR 的执行引起的陷阱类 VM 退出。见第 32.5 节。
    -   由作为指令执行一部分的 APIC 访问导致的 APIC 写仿真（见第 32.4.3.2 节）引起的 VM 退出。  
        对于这些 VM 退出，指令对架构状态的修改在 VM 退出发生前完成。此类修改包括对逻辑处理器中断性状态的那些（见表 27-3）。如果指令执行前有由 MOV SS、POP SS 或 STI 阻止，此类阻止不再生效。

在飞地模式中发生的 VM 退出设置退出原因字段的第 27 位和客户中断性状态字段的第 4 位。在此类 VM 退出交付前，发生异步飞地退出（AEX）（见第 40 章"飞地退出事件"）。AEX 修改架构状态（第 40.3 节）。特别是，处理器按指示建立以下架构状态：

-   RFLAGS 中的以下位被清除：CF、PF、AF、ZF、SF、OF 和 RF。
-   FS 和 GS 被恢复到它们在最近一次飞地进入之前具有的值。
-   RIP 用被中断飞地线程的 AEP 加载。
-   RSP 从飞地状态保存区域（SSA）中的 URSP 字段加载。

## 30.2 记录 VM 退出信息和更新 VM 进入控制字段

VM 退出通过把关于 VM 退出的性质和原因的信息记录在 VM-exit 信息字段中来开始。第 30.2.1 节至第 30.2.5 节详述这些字段的使用。

除了更新 VM-exit 信息字段外，注入事件标识字段中的有效位（第 31 位）被清除。如果 IA32_VMX_MISC MSR（索引 485H）的第 5 位被读取为 1（见附录 A.6），IA32_EFER.LMA 的值被存储到"IA-32e mode guest" VM 进入控制中。¹

### 30.2.1 基本 VM 退出信息

第 27.9.1 节定义基本 VM-exit 信息字段。以下条目详述它们的使用。

-   **退出原因**。
    -   此字段的第 15:0 位包含基本退出原因。它被加载为指示 VM 退出一般原因的数字。附录 C 列出使用的数字及其含义。  
        未来的处理器可能引入带新基本退出原因的新的 VM 退出。任何此类 VM 退出将仅在由同一处理器引入的 VM 执行控制设置下发生，或由于执行在先前处理器上会导致无效操作码异常（#UD）的指令而发生。为特定处理器代编写的软件应意识到，如果在更晚的处理器代上运行，它可能经历带新基本退出原因的 VM 退出；它还应该意识到，此类 VM 退出将仅由执行在较早处理器代上本会导致 #UD 的指令引起。
    -   如果"prematurely busy shadow stack" VM-exit 控制为 1 且 VM 退出导致影子栈变得过早忙碌（见第 28.4.3 节），第 25 位被设置。否则，该位被清除。
    -   如果 VM 退出发生在"VMM bus-lock detection" VM 执行控制为 1 时总线锁定断言后，此字段的第 26 位被设置为 1。此类 VM 退出包括那些由于该控制的 1 设置发生的，以及可能在断言总线锁定的指令执行期间发生的其他退出。
    -   如果 VM 退出发生在逻辑处理器处于飞地模式时，此字段的第 27 位被设置为 1。此类 VM 退出包括由在飞地模式中发生的中断、非可屏蔽中断、系统管理模式中断、INIT 信号和异常，以及在飞地模式下交付此类事件的附带期间遇到的异常引起的那些。  
        如果 VM 退出是由于或附带了交付以下事件的交付，它也设置此位：（1）在客户中断性状态字段指示飞地中断（字段第 4 位为 1）时由 VM 进入挂起或注入的事件；或（2）在 SMRAM 中状态保存图像偏移 7EE0H 处的字节中第 1 位被设置时发生的 RSM 执行之后挂起的事件。
    -   字段的其余部分（第 31:28 位和第 24:16 位）被清除为 0（某些 SMM VM 退出可能设置其中一些位；见第 34.15.2.3 节）。²
-   **退出资格**。此字段为由于以下原因导致的 VM 退出保存：调试异常；页错误异常；非可屏蔽中断（NMI）；启动 IPI（SIPI）；在 I/O 指令执行后立即到达的系统管理模式中断（SMI）；任务切换；INVEPT；INVLPG；INVPCID；INVVPID；LGDT；LIDT；LLDT；LTR；RDMSRLIST；SGDT；SIDT；SLDT；STR；VMCLEAR；VMPTRLD；VMPTRST；VMREAD；VMWRITE；VMXON；WBINVD；WBNOINVD；WRMSR；WRMSRLIST；WRMSRNS；XRSTORS；XSAVES；控制寄存器访问；MOV DR；I/O 指令；MWAIT；对 APIC-access 页的访问（见第 32.4 节）；EPT 违规（见第 31.3.3.2 节）；EOI 虚拟化（见第 32.1.4 节）；APIC 写仿真（见第 32.4.3.3 节）；页修改日志已满（见第 31.3.6 节）；SPP 相关事件（见第 31.3.4 节）；和指令超时（见第 28.2 节）。对于所有其他 VM 退出，此字段被清除。以下条目提供细节：
    -   对于调试异常，退出资格包含关于调试异常的信息。信息具有表 30-1 中给出的格式。

**表 30-1. 调试异常的退出资格**

| 位位置 | 内容  |
| --- | --- |
| 3:0 | B3 – B0。设置时，这些位中的每一个指示满足相应的断点条件。即使其对应的 DR7 中的启用位未被设置，这些位中的任何一个也可能被设置。 |
| 10:4 | 当前未定义。 |
| 11  | BLD。设置时，此位指示在启用 OS 总线锁定检测且 CPL > 0 时断言了总线锁定（见第 20.3.1.6 节"OS Bus-Lock Detection"）。¹ |
| 12  | 当前未定义。 |
| 13  | BD。设置时，此位指示调试异常的原因是"detected debug register access"（检测到调试寄存器访问）。 |
| 14  | BS。设置时，此位指示调试异常的原因是单条指令的执行（如果 RFLAGS.TF = 1 且 IA32_DEBUGCTL.BTF = 0）或已采取的分支（如果 RFLAGS.TF = DEBUGCTL.BTF = 1）。 |
| 15  | 当前未定义。 |
| 16  | RTM。设置时，此位指示在启用 RTM 事务区域高级调试时，RTM 区域内发生了调试异常（#DB）或断点异常（#BP）（见《Intel® 64 和 IA-32 架构软件开发手册》第 1 卷第 17.3.7 节"RTM-Enabled Debugger Support"）。² |
| 63:17 | 当前未定义。第 63:32 位仅存在于支持 Intel 64 架构的处理器上。 |

注：

1.  一般来说，此字段的格式与 DR6 匹配。然而，DR6 清除第 11 位以指示检测到总线锁定，而此字段设置该位以指示该条件。
2.  一般来说，此字段的格式与 DR6 匹配。然而，DR6 清除第 16 位以指示 RTM 相关异常，而此字段设置该位以指示该条件。

-   对于页错误异常，退出资格包含导致页错误的线性地址。如果线性地址掩码一直生效（第 4.4 节），记录的地址反映该掩码的结果且不包含任何掩码的元数据。在支持 Intel 64 架构的处理器上，如果 VM 退出前逻辑处理器不在 64 位模式，第 63:32 位被清除。  
    如果页错误异常发生在飞地模式下执行指令期间（且不在飞地模式附带的事件交付期间），退出资格的第 11:0 位被清除。
    
-   对于 NMI，退出资格取决于处理器是否支持 NMI 源报告：
    
    -   如果处理器支持 NMI 源报告，退出资格包含关于 NMI 的源信息（见第 7.7.3 节"NMI-Source Reporting"）。
    -   如果处理器不支持 NMI 源报告，退出资格为零。  
        如果 CPUID.07H.01H:EAX.NMI_SRC\[20\] 被枚举为 1，处理器支持 NMI 源报告。
-   对于启动 IPI（SIPI），退出资格在第 7:0 位包含 SIPI 向量信息。退出资格的第 63:8 位被清除为 0。
    
-   对于任务切换，退出资格包含关于任务切换的细节，按表 30-2 所示编码。
    
-   对于 INVLPG，退出资格包含指令的线性地址操作数。
    
    -   在支持 Intel 64 架构的处理器上，如果 VM 退出前逻辑处理器不在 64 位模式，第 63:32 位被清除。
    -   如果 INVLPG 源操作数指定不可用的段，退出资格中指定的线性地址将匹配如果未发生 VM 退出 INVLPG 本会使用的线性地址。此地址在架构上未定义且可能为特定于实现的。

**表 30-2. 任务切换的退出资格**

| 位位置 | 内容  |
| --- | --- |
| 15:0 | 客户尝试切换到的任务状态段（TSS）的选择器 |
| 29:16 | 当前未定义 |
| 31:30 | 任务切换发起的来源：  <br>0：CALL 指令  <br>1：IRET 指令  <br>2：JMP 指令  <br>3：IDT 中的任务门 |
| 63:32 | 当前未定义。这些位仅存在于支持 Intel 64 架构的处理器上。 |

-   对于 INVEPT、INVPCID、INVVPID、LGDT、LIDT、LLDT、LTR、SGDT、SIDT、SLDT、STR、VMCLEAR、VMPTRLD、VMPTRST、VMREAD、VMWRITE、VMXON、XRSTORS 和 XSAVES，退出资格接收指令位移字段的值，必要时符号扩展到 64 位（在不支持 Intel 64 架构的处理器上为 32 位）。如果指令没有位移（例如，具有寄存器操作数），零被存储到退出资格中。  
    在支持 Intel 64 架构的处理器上，为 RIP 相对寻址（仅在 64 位模式中使用）作出例外。此类寻址使指令使用位移字段与引用下一条指令的 RIP 值之和的地址。在这种情况下，退出资格用位移字段与适当 RIP 值之和加载。  
    在所有情况下，超出指令地址大小的此字段的位未定义。例如，假设 VM-exit 指令信息字段（见第 27.9.4 节和第 30.2.5 节）中的地址大小字段报告 n 位地址大小。那么指令位移的第 63:n 位（在不支持 Intel 64 架构的处理器上为第 31:n 位）未定义。
-   对于控制寄存器访问，退出资格包含关于访问的信息且具有表 30-3 中给出的格式。
-   对于 MOV DR，退出资格包含关于指令的信息且具有表 30-4 中给出的格式。
-   对于 I/O 指令，退出资格包含关于指令的信息且具有表 30-5 中给出的格式。
-   对于 MWAIT，退出资格包含指示地址范围监视硬件是否已布防的值。退出资格被设置为 0（如果地址范围监视硬件未布防）或 1（如果地址范围监视硬件已布防）。
-   对于 RDMSRLIST 和 WRMSRLIST，退出资格取决于"use MSR bitmaps" VM 执行控制的设置。如果控制为 0，退出资格为零。如果控制为 1，退出资格是访问导致 VM 退出的 MSR 的索引（见第 28.1.3 节）。
-   WBINVD 和 WBNOINVD 使用相同的基本退出原因（见附录 C）。对于 WBINVD，退出资格为 0，而对于 WBNOINVD 为 1。
-   WRMSR 和 WRMSRNS 使用相同的基本退出原因（见附录 C）。对于 WRMSR，退出资格为 0，而对于 WRMSRNS 为 1。
-   对于由对 APIC-access 页的线性访问或客户物理访问引起的 APIC-access VM 退出（见第 32.4 节），退出资格包含关于访问的信息且具有表 30-6 中给出的格式。¹  
    如果对 APIC-access 页的访问发生在飞地模式下执行指令期间（且不在飞地模式附带的事件交付期间），退出资格的第 11:0 位被清除。

**表 30-3. 控制寄存器访问的退出资格**

| 位位置 | 内容  |
| --- | --- |
| 3:0 | 控制寄存器编号（对于 CLTS 和 LMSW 为 0）。在不支持 Intel 64 架构的处理器上第 3 位总是为 0，因为它们不支持 CR8。 |
| 5:4 | 访问类型：  <br>0 = MOV 到 CR  <br>1 = MOV 从 CR  <br>2 = CLTS  <br>3 = LMSW |
| 6   | LMSW 操作数类型：  <br>0 = 寄存器  <br>1 = 内存  <br>对于 CLTS 和 MOV CR，清除为 0 |
| 7   | 当前未定义 |
| 11:8 | 对于 MOV CR，通用寄存器：  <br>0 = RAX  <br>1 = RCX  <br>2 = RDX  <br>3 = RBX  <br>4 = RSP  <br>5 = RBP  <br>6 = RSI  <br>7 = RDI  <br>8–15 分别表示 R8–R15（仅在支持 Intel 64 架构的处理器上使用）  <br>对于 CLTS 和 LMSW，清除为 0 |
| 15:12 | 当前未定义 |
| 31:16 | 对于 LMSW，LMSW 源数据  <br>对于 CLTS 和 MOV CR，清除为 0 |
| 63:32 | 当前未定义。这些位仅存在于支持 Intel 64 架构的处理器上。 |

-   对于由 MASKMOVQ 指令或 MASKMOVDQU 指令引起的 APIC-access VM 退出，访问类型为"instruction execution during data write"（指令执行期间的数据写）。
-   对于由 MONITOR 指令引起的 APIC-access VM 退出，访问类型为"instruction execution during data read"（指令执行期间的数据读）。

以下条目指定如何为某些由指令执行产生的访问确定访问类型：

-   对于由对 DS 保存区域中线性地址的访问（BTS 或旧版 PEBS）直接引起的 APIC-access VM 退出，访问类型为"linear access asynchronous to instruction execution"（与指令执行异步的线性访问）。
-   对于由为访问 DS 保存区域而执行的客户物理访问（例如，访问分页结构以转换线性地址）引起的 APIC-access VM 退出，访问类型为"guest-physical access asynchronous to instruction execution"（与指令执行异步的客户物理访问）。
-   对于当"Intel PT uses guest physical addresses" VM 执行控制为 1 时由追踪地址预转换（TAPT）引起的 APIC-access VM 退出，访问类型为"guest-physical access asynchronous to instruction execution"（与指令执行异步的客户物理访问）。
-   对于当"PEBS uses guest physical addresses" VM 执行控制为 1 时由架构 PEBS 引起的 APIC-access VM 退出，访问类型为"guest-physical access asynchronous to instruction execution"（与指令执行异步的客户物理访问）。

当且仅当此类 VM 退出将退出资格的第 15:12 位设置为 0011b（事件交付期间的线性访问）或 1010b（事件交付期间的客户物理访问）时，它在原始事件标识字段中为第 31 位存储 1（见第 30.2.4 节）。

这些指令和 APIC-access VM 退出的进一步讨论见第 32.4.4 节。

对于由对 APIC-access 页的物理访问产生的 APIC-access VM 退出（见第 32.4.6 节），退出资格未定义。

-   对于 EPT 违规，退出资格包含关于导致 EPT 违规的访问的信息且具有表 30-7 中给出的格式。  
    如该表所述，退出资格的格式和含义取决于"mode-based execute control for EPT" VM 执行控制的设置以及处理器是否支持 EPT 违规的高级 VM 退出信息。¹  
    由于读-修改-写操作执行而发生的 EPT 违规设置第 1 位（数据写）。它是否也设置第 0 位（数据读）是实现相关的，且对于给定实现，可能因不同类型的读-修改-写操作而异。

**表 30-4. MOV DR 的退出资格**

| 位位置 | 内容  |
| --- | --- |
| 2:0 | 调试寄存器编号 |
| 3   | 当前未定义 |
| 4   | 访问方向（0 = MOV 到 DR；1 = MOV 从 DR） |
| 7:5 | 当前未定义 |
| 11:8 | 通用寄存器：  <br>0 = RAX  <br>1 = RCX  <br>2 = RDX  <br>3 = RBX  <br>4 = RSP  <br>5 = RBP  <br>6 = RSI  <br>7 = RDI  <br>8–15 分别表示 R8–R15 |
| 63:12 | 当前未定义。第 63:32 位仅存在于支持 Intel 64 架构的处理器上。 |

**表 30-5. I/O 指令的退出资格**

| 位位置 | 内容  |
| --- | --- |
| 2:0 | 访问大小：  <br>0 = 1 字节  <br>1 = 2 字节  <br>3 = 4 字节  <br>其他值不使用 |
| 3   | 尝试访问的方向（0 = OUT，1 = IN） |
| 4   | 字符串指令（0 = 非字符串；1 = 字符串） |
| 5   | REP 前缀（0 = 非 REP；1 = REP） |
| 6   | 操作数编码（0 = DX，1 = 立即数） |
| 15:7 | 当前未定义 |
| 31:16 | 端口号（按 DX 或立即数操作数中指定的） |
| 63:32 | 当前未定义。这些位仅存在于支持 Intel 64 架构的处理器上。 |

**表 30-6. 来自线性访问和客户物理访问的 APIC-Access VM 退出的退出资格**

| 位位置 | 内容  |
| --- | --- |
| 11:0 | 如果 APIC-access VM 退出是由于线性访问，APIC 页内访问的偏移。  <br>如果 APIC-access VM 退出是由于客户物理访问，未定义 |
| 15:12 | 访问类型：  <br>0 = 指令执行期间数据读的线性访问  <br>1 = 指令执行期间数据写的线性访问  <br>2 = 指令获取的线性访问  <br>3 = 事件交付期间的线性访问（读或写）  <br>4 = 与指令执行异步的线性访问  <br>10 = 事件交付期间的客户物理访问  <br>11 = 与指令执行异步的客户物理访问  <br>15 = 指令获取或指令执行期间的客户物理访问  <br>其他值不使用 |
| 16  | 此位为某些与指令执行异步且不是事件交付一部分的访问设置。这些包括与 Intel PT 追踪输出相关的客户物理访问（见第 28.5.4 节）、在带"EPT-friendly"增强的处理器上与旧版 PEBS 相关的访问（见第 22.9.5 节）、与架构 PEBS 相关的访问（见第 28.5.5 节）以及在用户中断交付期间发生的访问（见第 9.4.2 节）。 |
| 63:17 | 当前未定义。第 63:32 位仅存在于支持 Intel 64 架构的处理器上。 |

第 12 位报告"due to IRET 的 NMI 解除阻止"；见第 30.2.3 节。  
第 16 位为某些与指令执行异步且不是事件交付一部分的访问设置。这些包括 Intel PT 的追踪地址预转换（TAPT）（见第 28.5.4 节）、在带"EPT-friendly"增强的处理器上与 PEBS 相关的访问（见第 22.9.5 节）、与架构 PEBS 相关的访问（见第 28.5.5 节）以及作为用户中断交付一部分的访问（见第 9.4.2 节）。

-   对于作为 EOI 虚拟化一部分引起的 VM 退出（第 32.1.4 节），退出资格的第 7:0 位被设置为由 EOI 虚拟化解除的虚拟中断的向量。第 7 位以上的位被清除。
-   对于 APIC 写 VM 退出（第 32.4.3.3 节），退出资格的第 11:0 位被设置为导致 VM 退出的写访问的页偏移。¹ 第 11 位以上的位被清除。
-   对于由于页修改日志已满事件（第 31.3.6 节）的 VM 退出，退出资格的第 12 位报告"due to IRET 的 NMI 解除阻止"（见第 30.2.3 节）。如果 VM 退出发生在 TAPT、EPT-friendly PEBS、由于架构 PEBS 的写或在用户中断交付期间，第 16 位被设置。退出资格的所有其他位未定义。
-   对于由于 SPP 相关事件（第 31.3.4 节）的 VM 退出，退出资格的第 11 位指示事件类型：0 指示 SPP 误配置，1 指示 SPP 未命中。退出资格的第 12 位报告"due to IRET 的 NMI 解除阻止"（见第 30.2.3 节）。如果 VM 退出发生在 TAPT、EPT-friendly PEBS、由于架构 PEBS 的写或在用户中断交付期间，第 16 位被设置。退出资格的所有其他位未定义。
-   如果"PASID translation" VM 执行控制被设置，为 ENQCMD 和 ENQCMDS 指令的执行执行 PASID 转换（见第 28.5.9 节）。PASID 转换可能失败，导致 VM 退出。此类 VM 退出保存在以下条目中指定的退出资格：
    -   对于 ENQCMD，退出资格是 IA32_PASID\[19:0\]。
    -   对于 ENQCMDS，退出资格包含指令源操作数的低 32 位（它在 PASID 转换前已从内存读取）。
-   对于由于指令超时（第 28.2 节）的 VM 退出，第 0 位指示（如果设置）虚拟机的上下文无效且 VM 不应被恢复。退出资格的第 12 位报告"due to IRET 的 NMI 解除阻止"（见第 30.2.3 节）。退出资格的所有其他位未定义。
-   **客户线性地址**。对于某些 VM 退出，此字段接收与 VM 退出有关的线性地址。字段为不同的 VM 退出按如下设置：
    -   由于尝试用内存操作数执行 LMSW 的 VM 退出。在这些情况下，此字段接收该操作数的线性地址。如果 VM 退出前逻辑处理器不在 64 位模式，第 63:32 位被清除。如果线性地址掩码一直生效（第 4.4 节），记录的地址反映该掩码的结果且不包含任何掩码的元数据。
    -   由于尝试执行相关段可用的 INS 或 OUTS 的 VM 退出（如果相关段不可用，值未定义）。（对于 INS，ES 总是相关段；对于 OUTS，除非被指令前缀覆盖，相关段是 DS。）线性地址是相关段的基地址加（E）DI（对于 INS）或（E）SI（对于 OUTS）。如果 VM 退出前逻辑处理器不在 64 位模式，第 63:32 位被清除。如果线性地址掩码一直生效（第 4.4 节），记录的地址是任何掩码前的原始地址（因此可能包含任何元数据）。
    -   由于设置退出资格第 7 位的 EPT 违规的 VM 退出（见表 30-7；这些都是 EPT 违规，除了那些由于执行 MOV CR 指令时尝试加载 PDPTE 的和由于 TAPT 的）。线性地址可能转换到其访问导致 EPT 违规的客户物理地址。或者，线性地址的转换可能引用其访问导致 EPT 违规的分页结构条目。如果 VM 退出前逻辑处理器不在 64 位模式，第 63:32 位被清除。如果线性地址掩码一直生效（第 4.4 节），记录的地址反映该掩码的结果且不包含任何掩码的元数据。  
        如果 EPT 违规发生在飞地模式下执行指令期间（且不在飞地模式附带的事件交付期间），此字段的第 11:0 位被清除。
    -   由于 SPP 相关事件的 VM 退出。如果线性地址掩码一直生效（第 4.4 节），记录的地址反映该掩码的结果且不包含任何掩码的元数据。
    -   如果"prematurely busy shadow stack" VM-exit 控制为 1，如果 VM 退出导致影子栈变得

过早忙碌（见第 28.4.3 节）。这对于由于以下原因的 VM 退出为真：EPT 误配置、页修改日志已满事件和指令超时。（由于设置退出资格第 0 位指示 VM 上下文无效的指令超时的 VM 退出不保存有效线性地址。）如果线性地址掩码一直生效（第 4.4 节），记录的地址反映该掩码的结果且不包含任何掩码的元数据。

-   对于所有其他 VM 退出，字段未定义。
-   **客户物理地址**。对于由于 EPT 违规、EPT 误配置或 SPP 相关事件的 VM 退出，此字段接收导致 EPT 违规或 EPT 误配置的客户物理地址。对于所有其他 VM 退出，字段未定义。  
    如果 EPT 违规或 EPT 误配置发生在飞地模式下执行指令期间（且不在飞地模式附带的事件交付期间），此字段的第 11:0 位被清除。

**表 30-7. EPT 违规的退出资格**

| 位位置 | 内容  |
| --- | --- |
| 0   | 如果导致 EPT 违规的访问是数据读，设置。¹ |
| 1   | 如果导致 EPT 违规的访问是数据写，设置。¹ |
| 2   | 如果导致 EPT 违规的访问是指令获取，设置。 |
| 3   | 用于转换导致 EPT 违规的访问的客户物理地址的 EPT 分页结构条目中第 0 位的逻辑与（指示客户物理地址是否可读）。² |
| 4   | 用于转换导致 EPT 违规的访问的客户物理地址的 EPT 分页结构条目中第 1 位的逻辑与（指示客户物理地址是否可写）。² |
| 5   | 用于转换导致 EPT 违规的访问的客户物理地址的 EPT 分页结构条目中第 2 位的逻辑与。²  <br>如果"mode-based execute control for EPT" VM 执行控制为 0，这指示客户物理地址是否可执行。如果该控制为 1，这指示客户物理地址对于监管者模式线性地址是否可执行。 |
| 6   | 如果"mode-based execute control" VM 执行控制为 0，此位的值未定义。如果该控制为 1，此位是用于转换导致 EPT 违规的访问的客户物理地址的 EPT 分页结构条目中第 10 位的逻辑与。在这种情况下，它指示客户物理地址对于用户模式线性地址是否可执行。³ |
| 7   | 如果客户线性地址字段有效，设置。  <br>客户线性地址字段对所有 EPT 违规有效，除了那些由于执行 MOV CR 指令时尝试加载客户 PDPTE 的、由于追踪地址预转换（TAPT；第 28.5.4 节）的和由于架构 PEBS（第 28.5.5 节）的。 |
| 8   | 如果第 7 位为 1：  <br>如果导致 EPT 违规的访问是对作为线性地址转换的客户物理地址，设置。  <br>如果导致 EPT 违规的访问是作为页遍历或已访问或脏位更新一部分对分页结构条目的，清除。  <br>如果第 7 位为 0，保留（清除为 0）。 |
| 9   | 如果第 7 位为 1、第 8 位为 1 且处理器支持 EPT 违规的高级 VM 退出信息，⁴ 如果线性地址是监管者模式线性地址，此位为 0，如果是用户模式线性地址为 1。（如果 CR0.PG = 0，每个线性地址的转换都是用户模式线性地址，因此此位将为 1。）否则，此位未定义。 |
| 10  | 如果第 7 位为 1、第 8 位为 1 且处理器支持 EPT 违规的高级 VM 退出信息，⁴ 如果分页将线性地址转换为只读页，此位为 0，如果转换为读/写页为 1。（如果 CR0.PG = 0，每个线性地址都是读/写，因此此位将为 1。）否则，此位未定义。 |
| 11  | 如果第 7 位为 1、第 8 位为 1 且处理器支持 EPT 违规的高级 VM 退出信息，⁴ 如果分页将线性地址转换为可执行页，此位为 0，如果转换为执行禁用页为 1。（如果 CR0.PG = 0、CR4.PAE = 0 或 IA32_EFER.NXE = 0，每个线性地址都是可执行的，因此此位将为 0。）否则，此位未定义。 |
| 12  | 因 IRET 的 NMI 解除阻止（见第 30.2.3 节）。 |
| 13  | 如果导致 EPT 违规的访问是影子栈访问，设置。 |
| 14  | 如果监管者影子栈控制已启用（通过设置 EPTP 的第 7 位），此位与映射导致 EPT 违规的访问的客户物理地址页的 EPT 分页结构条目中第 60 位相同。否则（或如果客户物理地址的转换在到达映射页的 EPT 分页结构条目之前终止），此位未定义。 |
| 15  | 如果 EPT 违规是由客户分页验证导致的，此位被设置。见第 31.3.3.2 节。 |
| 16  | 如果访问与指令执行异步且不是事件交付的结果，此位被设置。如果访问与 Intel PT 的追踪输出相关（见第 28.5.4 节）、与带"EPT-friendly"增强的处理器上的旧版 PEBS 相关的访问（见第 22.9.5 节）、与架构 PEBS 相关的访问（见第 28.5.5 节）或与用户中断交付相关（见第 9.4.2 节），该位被设置。否则，此位被清除。 |
| 63:17 | 当前未定义。第 63:32 位仅存在于支持 Intel 64 架构的处理器上。 |

注：

1.  如果为 EPT 启用了已访问和脏标志，处理器对客户分页结构条目的访问在 EPT 违规方面被视为写（见第 31.3.3.2 节）。如果此类访问导致 EPT 违规，处理器设置退出资格的第 0 位和第 1 位。
2.  如果（1）用于转换导致 EPT 违规的访问的客户物理地址的任何 EPT 分页结构条目不存在；或（2）正在使用 4 级 EPT 且客户物理地址设置范围 51:48 中的任何位（见第 31.3.2 节），第 5:3 位被清除为 0。
3.  如果（1）"mode-based execute control" VM 执行控制为 1；且（2）（a）用于转换导致 EPT 违规的访问的客户物理地址的任何 EPT 分页结构条目不存在；或（b）正在使用 4 级 EPT 且客户物理地址设置范围 51:48 中的任何位（见第 31.3.2 节），第 6 位被清除为 0。
4.  软件可以通过查阅 VMX 能力 MSR IA32_VMX_EPT_VPID_CAP（见附录 A.10）来确定是否支持 EPT 违规的高级 VM 退出信息。

### 30.2.2 向量事件的 VM 退出信息

第 27.9.2 节定义包含由于以下事件的 VM 退出信息的字段：异常（包括由指令 INT1、INT3、INTO、BOUND、UD1、UD2 和 UDB 生成的）；在"acknowledge interrupt on exit" VM-exit 控制为 1 时发生的外部中断；和非可屏蔽中断（NMI）。¹ 此类 VM 退出包括在产生导致 VM 退出的任务切换的 VM 退出之前尝试任务切换引起异常时发生的那些。

以下条目详述这些字段的使用：

-   **退出事件标识** （格式见表 27-20）。以下条目详述如何为由于这些事件的 VM 退出建立此字段：
    -   对于异常，第 7:0 位接收异常向量（最多 31）。对于 NMI，第 7:0 位被设置为 2。对于外部中断，第 7:0 位接收向量。
    -   第 10:8 位被设置为 0（外部中断）、2（非可屏蔽中断）、3（硬件异常）、5（特权软件异常）或 6（软件异常）。硬件异常包括所有异常，除了以下：
        -   由 INT1 指令生成的调试异常（#DB）；这些是特权软件异常。（其他调试异常被认为是硬件异常，在飞地模式下执行 INT1 引起的那些也是如此。）
        -   断点异常（#BP；由 INT3 生成）和溢出异常（#OF；由 INTO 生成）；这些是软件异常。（在飞地模式中发生的 #BP 被认为是硬件异常。）  
            BOUND 范围超限异常（#BR；由 BOUND 生成）和由 UD0、UD1、UD2 和 UDB 生成的无效率代码异常（#UD）是硬件异常。
    -   如果 VM 退出由本会在栈上交付错误码的硬件异常引起，第 11 位被设置为 1；否则为 0。¹ 如果 VM 退出发生在逻辑处理器处于实地址模式（CR0.PE=0）时，此位总是为 0。² 如果第 11 位被设置为 1，错误码被放置在退出事件错误码中（见下文）。
    -   第 12 位报告"因 IRET 的 NMI 解除阻止"；见第 30.2.3 节。如果 VM 退出是由于双错误（事件类型是硬件异常且向量为 8），此位的值未定义。
    -   如果 VM 退出由在某个其他事件的 FRED 事件交付期间遇到的硬件异常引起，第 13 位（嵌套异常）被设置为 1；对于由于 #DF 的 VM 退出或对于在 IDT 事件交付期间遇到的那些，不设置。字段有效的其他 VM 退出（包括由于 #DF 的 VM 退出）将第 13 位保存为 0。
    -   第 30:14 位总是被设置为 0。
    -   第 31 位总是被设置为 1。  
        对于其他 VM 退出（包括当"acknowledge interrupt on exit" VM-exit 控制为 0 时由于外部中断的那些），字段被标记为无效（通过清除第 31 位）且字段的其余部分未定义。
-   **退出事件错误码**。
    -   对于在退出事件标识字段中同时设置第 31 位（有效）和第 11 位（错误码有效）的 VM 退出，此字段接收如果导致 VM 退出的事件被正常交付本会被推入栈的错误码。EXT 位在此字段中正好在正常会被设置时设置。对于在双错误交付期间发生的异常（如果原始事件标识字段指示双错误），假设（1）异常正常会产生错误码（如果不是双错误交付附带的）且（2）错误码使用 EXT 位（对于页错误不适用，页错误使用不同格式），EXT 位被设置为 1。
    -   对于其他 VM 退出，此字段的值未定义。

### 30.2.3 关于因 IRET 的 NMI 解除阻止的信息

VM 退出可能由于包括以下在内的原因在 IRET 指令执行期间发生：故障、EPT 违规、页修改日志已满事件、SPP 相关事件或指令超时。

在非可屏蔽中断（NMI）被阻止时开始的 IRET 执行将解除阻止 NMI，即使发生故障或 VM 退出；此类 VM 退出保存的状态将指示 NMI 未被阻止。

对于上述枚举原因的 VM 退出通过保存称为"因 IRET 的 NMI 解除阻止"的位向软件提供更多信息。如果（1）"NMI exiting" VM 执行控制为 0 或"virtual NMIs" VM 执行控制为 1；（2）VM 退出未设置原始事件标识字段中的有效位（见第 30.2.4 节）；且（3）VM 退出不是由于双错误，此位被定义。在这些情况下，该位定义如下：

-   如果 VM 退出由作为 IRET 指令执行一部分的内存访问引起且以下之一成立，该位为 1：
    -   "virtual NMIs" VM 执行控制为 0 且由 NMI 阻止（见表 27-3）在 IRET 执行前生效。
    -   "virtual NMIs" VM 执行控制为 1 且虚拟 NMI 阻止在 IRET 执行前生效。
-   对于所有其他相关 VM 退出，该位为 0。

对于由于故障的 VM 退出，因 IRET 的 NMI 解除阻止保存在退出事件标识字段的第 12 位（第 30.2.2 节）。对于由于 EPT 违规、页修改日志已满事件、SPP 相关事件和指令超时的 VM 退出，因 IRET 的 NMI 解除阻止保存在退出资格的第 12 位（第 30.2.1 节）。

（IRET 的执行也可能招致由于 APIC 访问和 EPT 误配置的 VM 退出。这些 VM 退出不报告关于因 IRET 的 NMI 解除阻止的信息。）

### 30.2.4 事件交付期间的 VM 退出信息

第 27.9.3 节定义包含在交付事件时发生的以及由于以下任一情况而发生的 VM 退出信息的原始事件字段：¹

-   事件交付期间发生异常且导致 VM 退出（因为与异常关联的位在异常位图中被设置为 1）。
-   通过 IDT 中的任务门调用任务切换。VM 退出仅在任务切换的初始检查通过后由于任务切换发生（见第 28.4.2 节）。
-   事件交付导致 APIC-access VM 退出（见第 32.4 节）。
-   事件交付期间发生的 EPT 违规、EPT 误配置、页修改日志已满事件或 SPP 相关事件。
-   用户中断通知处理期间发生的上述任何 VM 退出（见第 9.5.2 节）。此类 VM 退出将被视为就像它们发生在向量为 UINV 的外部中断交付期间一样。

> **注**  
> 当启用 FRED 转换时，SYSCALL 和 SYSENTER 使用 FRED 事件交付交付。这些指令的执行可能导致上述枚举的 VM 退出（除了任务切换和用户中断通知处理）。因此，当启用 FRED 转换时，原始事件字段可能记录关于 SYSCALL 和 SYSENTER 的信息。

这些字段用于在作为 VM 进入一部分注入的事件交付期间发生的 VM 退出（见第 29.6.1.2 节）。

在以下任何情况下，VM 退出不被认为发生在事件交付期间：

-   原始事件直接导致 VM 退出（例如，因为原始事件是非可屏蔽中断（NMI）且"NMI exiting" VM 执行控制为 1）。
-   原始事件导致直接引起 VM 退出的双错误异常。
-   VM 退出作为获取事件交付调用的处理程序第一条指令的结果发生。
-   VM 退出由三错误引起。
-   原始事件是在 EFLAGS.IOPL < 3 的 virtual-8086 模式下执行的软件中断（INT n），且 VM 退出是由于因为 CR4.VME = 0 或 TSS 中软件中断重定向位图的位 n 被设置而发生的通用保护异常（#GP）。

以下条目详述这些字段的使用：

-   **原始事件标识** （格式见表 27-21）。以下条目详述如何为在事件交付期间发生的 VM 退出建立此字段：
    -   如果 VM 退出发生在异常交付期间，第 7:0 位接收异常向量（最多 31）。如果 VM 退出发生在 NMI 交付期间，第 7:0 位被设置为 2。如果 VM 退出发生在外部中断交付期间，第 7:0 位接收向量。
    -   第 10:8 位被设置为指示 VM 退出发生时正在交付的事件类型：0（外部中断）、2（非可屏蔽中断）、3（硬件异常）、4（软件中断）、5（特权软件中断）或 6（软件异常）。  
        硬件异常包括所有异常，除了以下：¹
        -   由 INT1 指令生成的调试异常（#DB）；这些是特权软件异常。（其他调试异常被认为是硬件异常，在飞地模式下执行 INT1 引起的那些也是如此。）
        -   断点异常（#BP；由 INT3 生成）和溢出异常（#OF；由 INTO 生成）；这些是软件异常。（在飞地模式中发生的 #BP 被认为是硬件异常。）  
            BOUND 范围超限异常（#BR；由 BOUND 生成）和由 UD0、UD1、UD2 和 UDB 生成的无效率代码异常（#UD）是硬件异常。
    -   如果 VM 退出发生在交付本会在栈上交付错误码的硬件异常期间，第 11 位被设置为 1；否则为 0。² 如果 VM 退出发生在逻辑处理器处于实地址模式（CR0.PE=0）时，此位总是为 0。³ 如果第 11 位被设置为 1，错误码被放置在原始事件错误码中（见下文）。
    -   第 12 位未定义。
    -   如果 VM 退出发生在交付在某个其他事件的 FRED 事件交付期间遇到的硬件异常时，第 13 位（嵌套异常）被设置为 1；对于由于 #DF 的 VM 退出或对于在 IDT 事件交付期间遇到的那些，不设置。原始事件标识字段有效的其他 VM 退出（包括在 #DF 交付期间发生的 VM 退出）将第 13 位保存为 0。
    -   第 30:14 位总是被设置为 0。
    -   第 31 位总是被设置为 1。  
        对于其他 VM 退出，字段被标记为无效（通过清除第 31 位）且字段的其余部分未定义。
-   **原始事件错误码**。
    -   对于在原始事件标识字段中同时设置第 31 位（有效）和第 11 位（错误码有效）的 VM 退出，此字段接收 VM 退出时正在交付的事件本会被推入栈的错误码。EXT 位在此字段中正常会被设置时设置。
    -   对于其他 VM 退出，此字段的值未定义。
-   **原始事件数据**。
    -   对于在 FRED 事件交付期间发生的 VM 退出，此字段接收 VM 退出时正在交付的事件本会被推入栈的事件数据。这是为所有事件完成的（如果 FRED 事件交付本会为事件数据保存零，保存该值）。
    -   对于其他 VM 退出（包括未启用 FRED 转换时发生的那些），此字段的值未定义。

### 30.2.5 指令执行导致的 VM 退出信息

第 27.9.4 节定义包含由于指令执行而发生的 VM 退出信息的字段。（VM-exit 指令长度也用于在软件中断或软件异常交付期间发生的 VM 退出。）以下条目详述它们的使用。

-   **VM-exit 指令长度**。此字段在以下情况下使用：
    -   对于由于尝试执行以下无条件（见第 28.1.2 节）或基于 VM 执行控制设置（见第 28.1.3 节）导致 VM 退出的指令之一的故障类 VM 退出：CLTS、CPUID、ENCLS、GETSEC、HLT、IN、INS、INVD、INVEPT、INVLPG、INVPCID、INVVPID、LGDT、LIDT、LLDT、LMSW、LOADIWKEY、LTR、MONITOR、MOV CR、MOV DR、MWAIT、OUT、OUTS、PAUSE、PCONFIG、RDMSR、RDPMC、RDRAND、RDSEED、RDTSC、RDTSCP、RSM、SEAMCALL、SGDT、SIDT、SLDT、STR、TDCALL、TPAUSE、UMWAIT、VMCALL、VMCLEAR、VMLAUNCH、VMPTRLD、VMPTRST、VMREAD、VMRESUME、VMWRITE、VMXOFF、VMXON、WBINVD、WBNOINVD、WRMSR、XRSTORS、XSETBV 和 XSAVES。¹
    -   对于由于软件异常（由 INT3 或 INTO 的执行生成的）或特权软件异常（由 INT1 的执行生成的）的 VM 退出。
    -   对于由于在软件中断、特权软件异常、软件异常或（如果启用 FRED 转换）SYSCALL 或 SYSENTER 交付期间遇到的故障的 VM 退出。
    -   对于由于尝试通过指令执行实现任务切换的 VM 退出。这些是产生指示任务切换的退出原因且以下任一成立的 VM 退出：
        -   指示 CALL、IRET 或 JMP 指令执行的退出资格。
        -   指示 IDT 中任务门且指示在软件中断、特权软件异常或软件异常交付期间遇到任务门的原始事件标识字段的退出资格。
    -   对于在软件中断、特权软件异常或软件异常交付期间遇到的 APIC-access VM 退出以及由 EPT 违规、页修改日志已满事件和 SPP 相关事件引起的 VM 退出。²
    -   对于由于 VMFUNC 执行失败且以下之一为真的 VM 退出：
        -   EAX 指示未启用的 VM 函数（VM 函数控制中位置 EAX 处的位为 0；见第 28.5.7.2 节）。
        -   EAX = 0 且 ECX ≥ 512 或 ECX 的值选择无效的暂定 EPTP 值（见第 28.5.7.3 节）。  
            在上述所有情况下，此字段接收其执行导致 VM 退出的指令的长度（1–15 字节）（包括任何指令前缀）（下一个段落有一个例外）。  
            在软件中断、特权软件异常或软件异常交付期间遇到的 VM 退出情况包括在作为 VM 进入一部分注入的事件交付期间遇到的（见第 29.6.1.2 节）。如果原始事件作为 VM 进入一部分被注入，此字段接收 VM-entry 指令长度的值。  
            所有未在上面的条目中列出的 VM 退出使此字段未定义。  
            如果 VM 退出发生在飞地模式中，此字段被清除（前面的条目都不适用）。

**表 30-8. 用于 INS 和 OUTS 的 VM-Exit 指令信息字段的格式**

| 位位置 | 内容  |
| --- | --- |
| 6:0 | 未定义。 |
| 9:7 | 地址大小：  <br>0：16 位  <br>1：32 位  <br>2：64 位（仅在支持 Intel 64 架构的处理器上使用）  <br>其他值不使用。 |
| 14:10 | 未定义。 |
| 17:15 | 段寄存器：  <br>0：ES  <br>1：CS  <br>2：SS  <br>3：DS  <br>4：FS  <br>5：GS  <br>其他值不使用。对于由于 INS 执行的 VM 退出未定义。 |
| 31:18 | 未定义。 |

-   **VM-exit 指令信息**。对于由于尝试执行 INS、INVEPT、INVPCID、INVVPID、LIDT、LGDT、LLDT、LOADIWKEY、LTR、OUTS、RDRAND、RDSEED、SIDT、SGDT、SLDT、STR、TPAUSE、UMWAIT、VMCLEAR、VMPTRLD、VMPTRST、VMREAD、VMWRITE、VMXON、XRSTORS 或 XSAVES 的 VM 退出，此字段接收关于导致 VM 退出的指令的信息。字段的格式取决于导致 VM 退出的指令的身份：
    -   对于由于尝试执行 INS 或 OUTS 的 VM 退出，字段具有表 30-8 中给出的格式。¹
    -   对于由于尝试执行 INVEPT、INVPCID 或 INVVPID 的 VM 退出，字段具有表 30-9 中给出的格式。
    -   对于由于尝试执行 LIDT、LGDT、SIDT 或 SGDT 的 VM 退出，字段具有表 30-10 中给出的格式。
    -   对于由于尝试执行 LLDT、LTR、SLDT 或 STR 的 VM 退出，字段具有表 30-11 中给出的格式。
    -   对于由于尝试执行 RDRAND 或 RDSEED 的 VM 退出，字段具有表 30-12 中给出的格式。
    -   对于由于尝试执行 TPAUSE 或 UMWAIT 的 VM 退出，字段具有表 30-13 中给出的格式。
    -   对于由于尝试执行 VMCLEAR、VMPTRLD、VMPTRST、VMXON、XRSTORS 或 XSAVES 的 VM 退出，字段具有表 30-14 中给出的格式。
    -   对于由于尝试执行 VMREAD 或 VMWRITE 的 VM 退出，字段具有表 30-15 中给出的格式。
    -   对于由于尝试执行 LOADIWKEY 的 VM 退出，字段具有表 30-16 中给出的格式。  
        对于所有其他 VM 退出，字段未定义，除非 VM 退出发生在飞地模式中，在这种情况下字段被清除。
-   **I/O RCX、I/O RSI、I/O RDI、I/O RIP**。这些字段未定义，除了对于在 I/O 指令退休后立即到达的系统管理模式中断（SMI）引起的 SMM VM 退出。见第 34.15.2.3 节。注意，如果 VM 退出发生在飞地模式中，这些字段都被清除。
-   **MSR 数据**。如果 WRMSRLIST 的执行将写入 MSR 位图不允许写入的 MSR，它可能导致 VM 退出（见第 28.1.3 节）。此类 VM 退出将本会写入 MSR 的 64 位数据保存到 VMCS 中的此字段。

**表 30-9. 用于 INVEPT、INVPCID 和 INVVPID 的 VM-Exit 指令信息字段的格式**

| 位位置 | 内容  |
| --- | --- |
| 1:0 | 缩放：  <br>0：无缩放  <br>1：按 2 缩放  <br>2：按 4 缩放  <br>3：按 8 缩放（仅在支持 Intel 64 架构的处理器上使用）  <br>对于无索引寄存器的指令未定义（第 22 位被设置）。 |
| 6:2 | 未定义。 |
| 9:7 | 地址大小：  <br>0：16 位  <br>1：32 位  <br>2：64 位（仅在支持 Intel 64 架构的处理器上使用）  <br>其他值不使用。 |
| 10  | 清除为 0。 |
| 14:11 | 未定义。 |
| 17:15 | 段寄存器：  <br>0：ES  <br>1：CS  <br>2：SS  <br>3：DS  <br>4：FS  <br>5：GS  <br>其他值不使用。 |
| 21:18 | IndexReg：  <br>0 = RAX  <br>1 = RCX  <br>2 = RDX  <br>3 = RBX  <br>4 = RSP  <br>5 = RBP  <br>6 = RSI  <br>7 = RDI  <br>8–15 分别表示 R8–R15（仅在支持 Intel 64 架构的处理器上使用）  <br>对于无索引寄存器的指令未定义（第 22 位被设置）。 |
| 22  | IndexReg 无效（0 = 有效；1 = 无效） |
| 26:23 | BaseReg（编码如上面的 IndexReg）  <br>对于无基址寄存器的内存指令未定义（第 27 位被设置）。 |
| 27  | BaseReg 无效（0 = 有效；1 = 无效） |
| 31:28 | Reg2（编码与上面的 IndexReg 相同） |

**表 30-10. 用于 LIDT、LGDT、SIDT 或 SGDT 的 VM-Exit 指令信息字段的格式**

| 位位置 | 内容  |
| --- | --- |
| 1:0 | 缩放：  <br>0：无缩放  <br>1：按 2 缩放  <br>2：按 4 缩放  <br>3：按 8 缩放（仅在支持 Intel 64 架构的处理器上使用）  <br>对于无索引寄存器的指令未定义（第 22 位被设置）。 |
| 6:2 | 未定义。 |
| 9:7 | 地址大小：  <br>0：16 位  <br>1：32 位  <br>2：64 位（仅在支持 Intel 64 架构的处理器上使用）  <br>其他值不使用。 |
| 10  | 清除为 0。 |
| 11  | 操作数大小：  <br>0：16 位  <br>1：32 位  <br>对于来自 64 位模式的 VM 退出未定义。 |
| 14:12 | 未定义。 |
| 17:15 | 段寄存器：  <br>0：ES  <br>1：CS  <br>2：SS  <br>3：DS  <br>4：FS  <br>5：GS  <br>其他值不使用。 |
| 21:18 | IndexReg：  <br>0 = RAX  <br>1 = RCX  <br>2 = RDX  <br>3 = RBX  <br>4 = RSP  <br>5 = RBP  <br>6 = RSI  <br>7 = RDI  <br>8–15 分别表示 R8–R15（仅在支持 Intel 64 架构的处理器上使用）  <br>对于无索引寄存器的指令未定义（第 22 位被设置）。 |
| 22  | IndexReg 无效（0 = 有效；1 = 无效） |
| 26:23 | BaseReg（编码如上面的 IndexReg）  <br>对于无基址寄存器的指令未定义（第 27 位被设置）。 |
| 27  | BaseReg 无效（0 = 有效；1 = 无效） |
| 29:28 | 指令身份：  <br>0：SGDT  <br>1：SIDT  <br>2：LGDT  <br>3：LIDT |
| 31:30 | 未定义。 |

**表 30-11. 用于 LLDT、LTR、SLDT 和 STR 的 VM-Exit 指令信息字段的格式**

| 位位置 | 内容  |
| --- | --- |
| 1:0 | 缩放：  <br>0：无缩放  <br>1：按 2 缩放  <br>2：按 4 缩放  <br>3：按 8 缩放（仅在支持 Intel 64 架构的处理器上使用）  <br>对于寄存器指令（第 10 位被设置）和对于无索引寄存器的内存指令（第 10 位被清除且第 22 位被设置）未定义。 |
| 2   | 未定义。 |
| 6:3 | Reg1：  <br>0 = RAX  <br>1 = RCX  <br>2 = RDX  <br>3 = RBX  <br>4 = RSP  <br>5 = RBP  <br>6 = RSI  <br>7 = RDI  <br>8–15 分别表示 R8–R15（仅在支持 Intel 64 架构的处理器上使用）  <br>对于内存指令（第 10 位被清除）未定义。 |
| 9:7 | 地址大小：  <br>0：16 位  <br>1：32 位  <br>2：64 位（仅在支持 Intel 64 架构的处理器上使用）  <br>其他值不使用。对于寄存器指令（第 10 位被设置）未定义。 |
| 10  | Mem/Reg（0 = 内存；1 = 寄存器）。 |
| 14:11 | 未定义。 |
| 17:15 | 段寄存器：  <br>0：ES  <br>1：CS  <br>2：SS  <br>3：DS  <br>4：FS  <br>5：GS  <br>其他值不使用。对于寄存器指令（第 10 位被设置）未定义。 |
| 21:18 | IndexReg（编码如上面的 Reg1）  <br>对于寄存器指令（第 10 位被设置）和对于无索引寄存器的内存指令（第 10 位被清除且第 22 位被设置）未定义。 |
| 22  | IndexReg 无效（0 = 有效；1 = 无效）  <br>对于寄存器指令（第 10 位被设置）未定义。 |
| 26:23 | BaseReg（编码如上面的 Reg1）  <br>对于寄存器指令（第 10 位被设置）和对于无基址寄存器的内存指令（第 10 位被清除且第 27 位被设置）未定义。 |
| 27  | BaseReg 无效（0 = 有效；1 = 无效）  <br>对于寄存器指令（第 10 位被设置）未定义。 |
| 29:28 | 指令身份：  <br>0：SLDT  <br>1：STR  <br>2：LLDT  <br>3：LTR |
| 31:30 | 未定义。 |

**表 30-12. 用于 RDRAND 和 RDSEED 的 VM-Exit 指令信息字段的格式**

| 位位置 | 内容  |
| --- | --- |
| 2:0 | 未定义。 |
| 6:3 | 操作数寄存器（目标寄存器）：  <br>0 = RAX  <br>1 = RCX  <br>2 = RDX  <br>3 = RBX  <br>4 = RSP  <br>5 = RBP  <br>6 = RSI  <br>7 = RDI  <br>8–15 分别表示 R8–R15（仅在支持 Intel 64 架构的处理器上使用） |
| 10:7 | 未定义。 |
| 12:11 | 操作数大小：  <br>0：16 位  <br>1：32 位  <br>2：64 位  <br>值 3 不使用。 |
| 31:13 | 未定义。 |

**表 30-13. 用于 TPAUSE 和 UMWAIT 的 VM-Exit 指令信息字段的格式**

| 位位置 | 内容  |
| --- | --- |
| 2:0 | 未定义。 |
| 6:3 | 操作数寄存器（源寄存器）：  <br>0 = RAX  <br>1 = RCX  <br>2 = RDX  <br>3 = RBX  <br>4 = RSP  <br>5 = RBP  <br>6 = RSI  <br>7 = RDI  <br>8–15 分别表示 R8–R15（仅在支持 Intel 64 架构的处理器上使用） |
| 31:7 | 未定义。 |

**表 30-14. 用于 VMCLEAR、VMPTRLD、VMPTRST、VMXON、XRSTORS 和 XSAVES 的 VM-Exit 指令信息字段的格式**

| 位位置 | 内容  |
| --- | --- |
| 1:0 | 缩放：  <br>0：无缩放  <br>1：按 2 缩放  <br>2：按 4 缩放  <br>3：按 8 缩放（仅在支持 Intel 64 架构的处理器上使用）  <br>对于无索引寄存器的指令未定义（第 22 位被设置）。 |
| 6:2 | 未定义。 |
| 9:7 | 地址大小：  <br>0：16 位  <br>1：32 位  <br>2：64 位（仅在支持 Intel 64 架构的处理器上使用）  <br>其他值不使用。 |
| 10  | 清除为 0。 |
| 14:11 | 未定义。 |
| 17:15 | 段寄存器：  <br>0：ES  <br>1：CS  <br>2：SS  <br>3：DS  <br>4：FS  <br>5：GS  <br>其他值不使用。 |
| 21:18 | IndexReg：  <br>0 = RAX  <br>1 = RCX  <br>2 = RDX  <br>3 = RBX  <br>4 = RSP  <br>5 = RBP  <br>6 = RSI  <br>7 = RDI  <br>8–15 分别表示 R8–R15（仅在支持 Intel 64 架构的处理器上使用）  <br>对于无索引寄存器的指令未定义（第 22 位被设置）。 |
| 22  | IndexReg 无效（0 = 有效；1 = 无效） |
| 26:23 | BaseReg（编码如上面的 IndexReg）  <br>对于无基址寄存器的指令未定义（第 27 位被设置）。 |
| 27  | BaseReg 无效（0 = 有效；1 = 无效） |
| 31:28 | 未定义。 |

## 30.3 保存客户状态

VM 退出将处理器状态的某些组件保存到 VMCS 客户状态区域中的相应字段（见第 27.4 节）。在支持 Intel 64 架构的处理器上，无论 VM 退出前后逻辑处理器的模式如何，每个自然宽度字段（见第 27.11.2 节）的完整值都被保存。

**表 30-15. 用于 VMREAD 和 VMWRITE 的 VM-Exit 指令信息字段的格式**

| 位位置 | 内容  |
| --- | --- |
| 1:0 | 缩放：  <br>0：无缩放  <br>1：按 2 缩放  <br>2：按 4 缩放  <br>3：按 8 缩放（仅在支持 Intel 64 架构的处理器上使用）  <br>对于寄存器指令（第 10 位被设置）和对于无索引寄存器的内存指令（第 10 位被清除且第 22 位被设置）未定义。 |
| 2   | 未定义。 |
| 6:3 | Reg1：  <br>0 = RAX  <br>1 = RCX  <br>2 = RDX  <br>3 = RBX  <br>4 = RSP  <br>5 = RBP  <br>6 = RSI  <br>7 = RDI  <br>8–15 分别表示 R8–R15（仅在支持 Intel 64 架构的处理器上使用）  <br>对于内存指令（第 10 位被清除）未定义。 |
| 9:7 | 地址大小：  <br>0：16 位  <br>1：32 位  <br>2：64 位（仅在支持 Intel 64 架构的处理器上使用）  <br>其他值不使用。对于寄存器指令（第 10 位被设置）未定义。 |
| 10  | Mem/Reg（0 = 内存；1 = 寄存器）。 |
| 14:11 | 未定义。 |
| 17:15 | 段寄存器：  <br>0：ES  <br>1：CS  <br>2：SS  <br>3：DS  <br>4：FS  <br>5：GS  <br>其他值不使用。对于寄存器指令（第 10 位被设置）未定义。 |
| 21:18 | IndexReg（编码如上面的 Reg1）  <br>对于寄存器指令（第 10 位被设置）和对于无索引寄存器的内存指令（第 10 位被清除且第 22 位被设置）未定义。 |
| 22  | IndexReg 无效（0 = 有效；1 = 无效）  <br>对于寄存器指令（第 10 位被设置）未定义。 |
| 26:23 | BaseReg（编码如上面的 Reg1）  <br>对于寄存器指令（第 10 位被设置）和对于无基址寄存器的内存指令（第 10 位被清除且第 27 位被设置）未定义。 |
| 27  | BaseReg 无效（0 = 有效；1 = 无效）  <br>对于寄存器指令（第 10 位被设置）未定义。 |
| 31:28 | Reg2（与上面的 Reg1 编码相同） |

一般来说，保存的状态是 VM 退出开始时逻辑处理器中的状态。关于此时发生哪些架构更新，见第 30.1 节的讨论。

**表 30-16. 用于 LOADIWKEY 的 VM-Exit 指令信息字段的格式**

| 位位置 | 内容  |
| --- | --- |
| 2:0 | 未定义。 |
| 6:3 | Reg1：标识第一个 XMM 寄存器操作数（XMM0–XMM15；值 8–15 仅在支持 Intel 64 架构的处理器上使用）。 |
| 30:7 | 未定义。 |
| 31:28 | Reg2：标识第二个 XMM 寄存器操作数（见上文）。 |

第 30.3.1 节至第 30.3.4 节提供如何保存处理器状态的各种组件的细节。这些节引用对应于处理器状态的 VMCS 字段。除非另有说明，这些引用是对客户状态区域中的字段。

### 30.3.1 保存控制寄存器、调试寄存器和 MSR

某些控制寄存器、调试寄存器和 MSR 的内容按如下方式保存：

-   CR0、CR3、CR4 和 IA32_SYSENTER_CS、IA32_SYSENTER_ESP 和 IA32_SYSENTER_EIP MSR 的内容被保存到相应字段中。IA32_SYSENTER_CS MSR 的第 63:32 位不被保存。在不支持 Intel 64 架构的处理器上，IA32_SYSENTER_ESP 和 IA32_SYSENTER_EIP MSR 的第 63:32 位不被保存。
-   如果"save debug controls" VM-exit 控制为 1，DR7 和 IA32_DEBUGCTL MSR 的内容被保存到相应字段中。首批支持虚拟机扩展的处理器仅支持此控制的 1 设置，因此总是把数据保存到这些字段中。
-   如果"save IA32_PAT" VM-exit 控制为 1，IA32_PAT MSR 的内容被保存到相应字段中。
-   如果"save IA32_EFER" VM-exit 控制为 1，IA32_EFER MSR 的内容被保存到相应字段中。
-   如果处理器支持"load IA32_BNDCFGS" VM 进入控制的 1 设置或"clear IA32_BNDCFGS" VM-exit 控制的 1 设置任一，IA32_BNDCFGS MSR 的内容被保存到相应字段中。
-   如果处理器支持"load IA32_RTIT_CTL" VM 进入控制的 1 设置或"clear IA32_RTIT_CTL" VM-exit 控制的 1 设置任一，IA32_RTIT_CTL MSR 的内容被保存到相应字段中。
-   如果处理器支持"load CET" VM 进入控制的 1 设置，IA32_S_CET 和 IA32_INTERRUPT_SSP_TABLE_ADDR MSR 的内容被保存到相应字段中。在不支持 Intel 64 架构的处理器上，这些 MSR 的第 63:32 位不被保存。
-   如果处理器支持"load guest IA32_LBR_CTL" VM 进入控制的 1 设置或"clear IA32_LBR_CTL" VM-exit 控制的 1 设置任一，IA32_LBR_CTL MSR 的内容被保存到相应字段中。
-   如果处理器支持"load PKRS" VM 进入控制的 1 设置，IA32_PKRS MSR 的内容被保存到相应字段中。
-   如果处理器支持用户中断，每个 VM 退出把 UINV 保存到 VMCS 中的客户 UINV 字段（字段的第 15:8 位被清除）。
-   如果"save IA32_PERF_GLOBAL_CTL" VM-exit 控制为 1，IA32_PERF_GLOBAL_CTL MSR 的内容被保存到相应字段中。
-   如果"save FRED" VM-exit 控制为 1，以下 MSR 的内容被保存到相应字段中：IA32_FRED_CONFIG、IA32_FRED_RSP1、IA32_FRED_RSP2、IA32_FRED_RSP3、IA32_FRED_STKLVLS、IA32_FRED_SSP1、IA32_FRED_SSP2 和 IA32_FRED_SSP3。
-   除了 SMM VM 退出外，所有 VM 退出后 SMBASE 字段的值未定义。见第 34.15.2 节。
-   如果处理器支持"load IA32_SPEC_CTRL" VM 进入控制的 1 设置，IA32_SPEC_CTRL MSR 的内容被保存到客户状态区域中的相应字段中。

### 30.3.2 保存段寄存器和描述符表寄存器

对于每个段寄存器（CS、SS、DS、ES、FS、GS、LDTR 或 TR），为基地址、段限长和访问权限保存的值基于寄存器在 VM 退出前是否不可用（见第 27.4.1 节）：

-   如果寄存器不可用，保存到以下字段的值未定义：（1）基地址；（2）段限长；和（3）访问权限字段中的第 7:0 位和第 15:12 位。以下例外适用：
    -   CS。
        -   基地址和段限长字段被保存。
        -   L、D 和 G 位在访问权限字段中被保存。
    -   SS。
        -   DPL 在访问权限字段中被保存。
        -   在支持 Intel 64 架构的处理器上，为基地址保存的值的第 63:32 位总是为零。
    -   DS 和 ES。在支持 Intel 64 架构的处理器上，为基地址保存的值的第 63:32 位总是为零。
    -   FS 和 GS。基地址字段被保存。
-   如果寄存器不可用，保存到以下字段的值是 VM 退出前寄存器中的值：（1）基地址；（2）段限长；和（3）访问权限中的第 7:0 位和第 15:12 位。
-   访问权限字段中的第 31:17 位和第 11:8 位总是被清除。当且仅当段不可用时，第 16 位被设置为 1。

GDTR 和 IDTR 寄存器的内容被保存到相应的基地址和限长字段中。

### 30.3.3 保存 RIP、RSP、RFLAGS 和 SSP

RIP、RSP、RFLAGS 和 SSP（影子栈指针）寄存器的内容按如下方式保存：

-   **RIP 字段中保存的值** 由 VM 退出的性质和原因决定：
    -   如果 VM 退出发生在飞地模式中，保存的值是被中断飞地线程的 AEP（剩余条目不适用）。
        
    -   如果 VM 退出由于尝试执行无条件导致 VM 退出或已通过 VM 执行控制配置为导致 VM 退出的指令而发生，保存的值引用该指令。
        
    -   如果 VM 退出由 INIT 信号、启动 IPI（SIPI）或系统管理模式中断（SMI）的发生引起，保存的值是事件发生前 RIP 中的值。
        
    -   如果 VM 退出由于"interrupt-window exiting" VM 执行控制或"NMI-window exiting" VM 执行控制的 1 设置而发生，保存的值是如果 VM 退出未发生寄存器中本会有的值。
        
    -   如果 VM 退出由于外部中断、非可屏蔽中断（NMI）或硬件异常（按第 30.2.2 节定义）引起，保存的值是如果事件已通过陷阱或中断门交付本会被保存的返回指针（在栈上），¹ 或如果事件已通过任务门交付本会被保存到旧任务状态段中的返回指针。
        
    -   如果 VM 退出由于三错误引起，保存的值是如果双错误的交付未遇到导致三错误的嵌套异常本会被保存的返回指针（如果事件已通过陷阱或中断门交付在栈上，或如果事件已通过任务门交付到旧任务状态段中）。
        
    -   如果 VM 退出由于软件异常（由于 INT3 或 INTO 的执行）或特权软件异常（由于 INT1 的执行）引起，保存的值引用导致该异常的 INT3、INTO 或 INT1 指令。
        
    -   假设 VM 退出由于由 CALL、IRET 或 JMP 的执行或由遇到 IDT 中任务门的软件中断（INT n）、软件异常（由于 INT3 或 INTO 的执行）或特权软件异常（由于 INT1 的执行）引起的任务切换。保存的值引用导致任务切换的指令（CALL、IRET、JMP、INT n、INT3、INTO、INT1）。
        
    -   假设 VM 退出由于因除软件中断或软件异常直接访问外的任何原因遇到的 IDT 中任务门引起的任务切换。保存的值是如果任务切换正常完成本会被保存在旧任务状态段中的值。
        
    -   如果 VM 退出由于将 VTPR 的第 7:4 位的值减少到 TPR threshold VM 执行控制字段（见第 32.1.2 节）以下（见第 32.1.1 节）的 MOV 到 CR8 或 WRMSR 的执行引起，保存的值引用 MOV 到 CR8 或 WRMSR 之后的指令。
        
    -   如果 VM 退出由作为指令执行一部分的 APIC 访问导致的 APIC 写仿真（见第 32.4.3.2 节）引起，保存的值引用其执行导致 APIC 写仿真的指令之后的指令。
        
-   **RSP 寄存器的内容** 被保存到 RSP 字段中。
-   **除恢复标志（RF；第 16 位）外，RFLAGS 寄存器的内容** 被保存到 RFLAGS 字段中。RFLAGS.RF 按如下保存：
    -   如果 VM 退出发生在飞地模式中，保存的值是 0（剩余条目不适用）。
    -   如果 VM 退出由正常会交付给软件的事件直接引起，保存的值是如果事件已交付给客户软件，保存的 RFLAGS 图像中本会出现（如果事件已通过陷阱或中断门交付在栈上¹ 或如果事件已通过任务门交付在旧任务状态段中）的值。对于由 IDT 中任务门引起的任务切换导致的 VM 退出见下文。
    -   如果 VM 退出由三错误引起，保存的值是如果三错误使逻辑处理器进入关闭状态，逻辑处理器在 RFLAGS 寄存器中 RF 中本会有的值。
    -   如果 VM 退出由任务切换（包括由 IDT 中任务门引起的）引起，保存的值是如果任务切换在无异常的情况下正常完成，本会被保存在旧任务状态段（TSS）中 RFLAGS 图像中的值。
    -   如果 VM 退出由尝试执行无条件导致 VM 退出或通过 VM 执行控制配置为这样做的指令引起，保存的值是 0。²
    -   对于 APIC-access VM 退出以及由 EPT 违规、EPT 误配置、页修改日志已满事件或 SPP 相关事件引起的 VM 退出，保存的值取决于 VM 退出是否发生在事件交付期间：
        -   如果 VM 退出为原始事件标识字段的第 31 位存储 0（因为 VM 退出未发生在事件交付期间；见第 30.2.4 节），保存的值是 1。
        -   如果 VM 退出为原始事件标识字段的第 31 位存储 1（因为 VM 退出确实发生在事件交付期间），保存的值是如果事件已交付保存的 RFLAGS 图像中本会出现的值（见上文）。
    -   对于所有其他 VM 退出，保存的值是 VM 退出发生前 RFLAGS.RF 的值。
-   如果处理器支持"load CET" VM 进入控制的 1 设置，SSP 寄存器的内容被保存到 SSP 字段中。

### 30.3.4 保存非寄存器状态

与客户非寄存器状态对应的信息按如下方式保存：

-   **活动状态字段** 用 VM 退出前逻辑处理器的活动状态保存。¹ 关于导致 VM 退出的事件如何影响活动状态的细节，见第 30.1 节。如果 VM 退出发生在用户中断通知处理期间（见第 9.5.2 节）且逻辑处理器在用户中断通知处理之后本会进入 HLT 状态，保存的活动状态是"HLT"。
-   **中断性状态字段** 被保存以反映 VM 退出前逻辑处理器的中断性。
    -   关于导致 VM 退出的事件如何影响此状态的细节，见第 30.1 节。
    -   在系统管理模式（SMM）之外结束的 VM 退出将第 2 位（由 SMI 阻止）保存为 0，无论 VM 退出前此类阻止的状态如何。
    -   如果"virtual NMIs" VM 执行控制为 1，第 3 位（由 NMI 阻止）被特殊处理。在这种情况下，为此字段保存的值不指示 NMI 的阻止，而是指示虚拟 NMI 阻止的状态。
    -   如果 VM 退出发生在逻辑处理器处于飞地模式时，第 4 位（飞地中断）被设置为 1。  
        此类 VM 退出包括由在飞地模式中发生的中断、非可屏蔽中断、系统管理模式中断、INIT 信号和异常，以及在飞地模式下交付此类事件的附带期间遇到的异常引起的那些。  
        如果 VM 退出是由于或附带了交付以下事件的交付，它也设置此位：（1）在客户中断性状态字段设置此位时由 VM 进入挂起或注入的事件；或（2）在 SMRAM 中状态保存图像偏移 7EE0H 处的字节中第 1 位被设置时发生的 RSM 执行之后挂起的事件。
-   **待处理调试异常字段** 为所有 VM 退出保存为清除，除了以下：
    -   由 INIT 信号、机器检查异常或系统管理模式中断（SMI）引起的 VM 退出。
    -   基本退出原因"TPR below threshold"²、"virtualized EOI"、"APIC write"、"monitor trap flag"或"bus-lock detected"的 VM 退出。
    -   由于追踪地址预转换（TAPT；见第 28.5.4 节）、带"EPT-friendly"增强的处理器上与旧版 PEBS 相关的访问（见第 22.9.5 节）或架构 PEBS（见第 28.5.5 节）的 VM 退出。此类 VM 退出可以具有基本退出原因"APIC access"、"EPT violation"、"EPT misconfiguration"、"page-modification log full"或"SPP-related event"。当由于 TAPT 或任一形式的 PEBS 时，这些 VM 退出（除了由于 EPT 误配置的那些）设置退出资格的第 16 位，指示它们与指令执行异步且不是事件交付的一部分。
    -   不是由调试异常引起且在存在调试异常的 MOV-SS 阻止时发生的 VM 退出。  
        对于不清除字段的 VM 退出，保存的值按如下确定：
    -   第 3:0 位中的每一个如果对应于匹配的断点可能被设置。即使 DR7 中未启用相应断点，这也可能为真。
    -   假设 VM 退出由于 INIT 信号、机器检查异常或 SMI；或 VM 退出具有基本退出原因"TPR below threshold"或"monitor trap flag"。在这种情况下，保存的值设置对应于 VM 退出时挂起的任何调试异常的原因的位。  
        如果 VM 退出在 VM 进入后立即发生，保存的值可能匹配 VM 进入时加载的值（见第 29.7.3 节）。否则，应用以下条目：
        -   在以下任何情况下，第 12 位（启用断点）被设置为 1：
            -   如果存在至少一个在 DR7 中启用的匹配数据或 I/O 断点。
            -   如果它已在 VM 进入时被设置，导致存在有效待处理调试异常（见第 29.7.3 节）且 VM 退出发生在这些异常被交付或丢失之前。
            -   如果 XBEGIN 指令在 VM 退出前立即执行且已启用 RTM 事务区域的高级调试（见《Intel® 64 和 IA-32 架构软件开发手册》第 1 卷第 17.3.7 节"RTM-Enabled Debugger Support"）。（这不适用于基本退出原因"monitor trap flag"的 VM 退出。）
            -   如果在 CPL > 0 且启用 OS 总线锁定检测时断言了总线锁定。  
                在其他情况下，第 12 位被清除为 0。
        -   在以下任一情况下，如果 RFLAGS.TF = 1，第 14 位（BS）被设置：
            -   IA32_DEBUGCTL.BTF = 0 且待处理调试异常的原因是单条指令的执行。
            -   IA32_DEBUGCTL.BTF = 1 且待处理调试异常的原因是已采取的分支。
        -   如果在启用 RTM 事务区域高级调试时，RTM 区域内发生了调试异常（#DB）或断点异常（#BP），第 16 位（RTM）被设置。（这不适用于基本退出原因"monitor trap flag"的 VM 退出。）
    -   假设 VM 退出由于其他原因（但不是调试异常）且在存在调试异常的 MOV-SS 阻止时发生。在这种情况下，保存的值设置对应于 VM 退出时挂起的任何调试异常的原因的位。如果 VM 退出在 VM 进入后立即发生（在 VMX 非根操作中未执行指令），保存的值可能匹配 VM 进入时加载的值（见第 29.7.3 节）。否则，应用以下条目：
        -   如果存在至少一个在 DR7 中启用的匹配数据或 I/O 断点，第 12 位（启用断点）被设置为 1。如果它已在 VM 进入时被设置，导致存在有效待处理调试异常（见第 29.7.3 节）且 VM 退出发生在这些异常被交付或丢失之前，第 12 位也被设置。在其他情况下，第 12 位被清除为 0。
        -   第 14 位（BS）的设置是实现相关的。然而，如果 RFLAGS.TF = 0 或 IA32_DEBUGCTL.BTF = 1，它不被设置。
    -   字段中的保留位被清除。
-   如果"save VMX-preemption timer value" VM-exit 控制为 1，计时器的值被保存到 VMX-preemption timer-value 字段中。这是 VM 进入时从该字段加载的值，随后递减（见第 28.5.1 节）。由于计时器到期的 VM 退出保存值 0。如果计时器在 VM 退出期间到期，其他 VM 退出也可能保存值 0。（如果"save VMX-preemption timer value" VM-exit 控制为 0，VM 退出不修改 VMX-preemption timer-value 字段的值。）
-   如果逻辑处理器支持"enable EPT" VM 执行控制的 1 设置，值按如下方式保存到四个（4）PDPTE 字段中：
    -   如果"enable EPT" VM 执行控制为 1 且逻辑处理器在 VM 退出时正在使用 PAE 分页，当前正在使用的 PDPTE 值被保存：¹
        -   每个字段的第 11:9 位中保存的值未定义。
        -   如果保存到其中一个字段的值第 0 位（存在）被清除，该字段第 63:1 位中保存的值未定义。该值不需要对应于 VM 进入加载的值或可能已在 VMX 非根操作中加载的任何值。
        -   如果保存到其中一个字段的值第 0 位（存在）被设置，字段第 63:12 位中保存的值是客户物理地址。
    -   如果"enable EPT" VM 执行控制为 0 或逻辑处理器在 VM 退出时未使用 PAE 分页，保存的值未定义。
-   如果"virtual-interrupt delivery" VM 执行控制为 1，RVI 和 SVI 的值被保存到 VMCS 中的客户中断状态字段中（见第 27.4.2 节）。
-   如果处理器支持"APIC-timer virtualization" VM 执行控制的 1 设置，客户截止时间被保存到相应字段中。

## 30.4 保存 MSR

在处理器状态被保存到客户状态区域后，MSR 的值可以被存储到 VM-exit MSR-store 区域（见第 27.7.2 节）。具体来说，该区域中的每个条目（最多为 VM-exit MSR-store 计数中指定的数量）按顺序处理，把由第 31:0 位索引的 MSR 的值（按 RDMSR 会读取的方式）存储到第 127:64 位中。在以下任一情况下，条目的处理失败：

-   第 31:8 位的值是 000008H，意味着索引的 MSR 是当本地 APIC 处于 x2APIC 模式时允许访问 APIC 寄存器的 MSR。
-   第 31:0 位的值指示只能在系统管理模式（SMM）中读取的 MSR，且 VM 退出不会在 SMM 中结束。（IA32_SMBASE 是只能在 SMM 中读取的 MSR。）
-   第 31:0 位的值指示由于特定于型号的原因不能在 VM 退出时保存的 MSR。即使 MSR 通常可以由 RDMSR 读取，处理器也可能阻止某些 MSR（基于第 31:0 位的值）在 VM 退出时被存储。这种特定于型号的行为在《Intel® 64 和 IA-32 架构软件开发手册》第 4 卷第 2 章"特定型号寄存器（MSR）"中记录。
-   条目的第 63:32 位不全部为 0。
-   如果通过 RDMSR 在 CPL = 0 下执行，读取由第 31:0 位索引的 MSR 的尝试会导致通用保护异常。

如果任何条目的处理失败，发生 VMX 中止。见第 30.7 节。

如果 IA32_SPEC_CTRL MSR 包含在 VM-exit MSR-store 区域中，当"virtualize IA32_SPEC_CTRL" VM 执行控制被设置为 1 时，为 MSR 存储的值未定义。如果"virtualize IA32_SPEC_CTRL" VM 执行控制为 1，软件应避免将 IA32_SPEC_CTRL MSR 包含在 VM-exit MSR-store 区域中。

## 30.5 加载宿主状态

VM 退出按以下方式更新处理器状态：

-   某些状态从宿主状态区域的内容加载或以其他方式由它决定。
-   某些状态由 VM-exit 控制决定。
-   某些状态在每次 VM 退出时以相同方式建立。
-   页目录指针基于某些控制寄存器的值加载。

此加载可以以任何顺序执行。

在支持 Intel 64 架构的处理器上，无论 VM 退出前后逻辑处理器的模式如何，每个加载的 64 位字段的完整值（例如，GDTR 的基地址）都被加载。

宿主状态的加载在第 30.5.1 节至第 30.5.5 节中详述。这些节引用对应于处理器状态的 VMCS 字段。除非另有说明，这些引用是对宿主状态区域中的字段。

仅当"host address-space size" VM-exit 控制为 1 时，逻辑处理器在 VM 退出后处于 IA-32e 模式。如果逻辑处理器在 VM 退出前处于 IA-32e 模式且此控制为 0，发生 VMX 中止。见第 30.7 节。

除了加载宿主状态外，VM 退出清除地址范围监视（第 30.5.6 节）。

在本节描述的状态加载之后，VM 退出可以从 VM-exit MSR-load 区域加载 MSR（见第 30.6 节）。此加载仅在本节描述的状态加载之后发生。

### 30.5.1 加载宿主控制寄存器、调试寄存器、MSR

VM 退出为控制寄存器、调试寄存器和某些 MSR 加载新值：

-   CR0、CR3 和 CR4 分别从 CR0 字段、CR3 字段和 CR4 字段加载，但以下例外：
    -   以下位不被修改：
        -   对于 CR0，ET、CD、NW；第 63:32 位（在支持 Intel 64 架构的处理器上）、28:19、17 和 15:6；以及在 VMX 操作中固定的任何位（见第 26.8 节）。¹
        -   对于 CR3，第 63:MAXPHYADDR 位，其中 MAXPHYADDR 定义如下：
            -   通常，MAXPHYADDR 是处理器在 CPUID.80000008H:EAX\[7:0\] 中枚举的支持物理地址宽度（此宽度最多为 52）。
            -   如果 IA32_TME_ACTIVATE\[0\] = 1（指示 TME 已配置），当逻辑处理器在安全仲裁模式（SEAM；见第 35 章）之外时，MAXPHYADDR 减少 IA32_TME_ACTIVATE\[39:36\] 的值；在 SEAM 中该值不减少。²  
                此条目仅适用于支持 Intel 64 架构的处理器。
        -   对于 CR4，在 VMX 操作中固定的任何位（见第 26.8 节）。
    -   如果"host address-space size" VM-exit 控制为 1，CR4.PAE 被设置为 1。
    -   如果"host address-space size" VM-exit 控制为 0，CR4.PCIDE 被设置为 0。
    -   如果"host-address-space size" VM-exit 控制为 0，CR4.FRED 被设置为 0。
-   DR7 被设置为 400H。
-   如果"clear UINV" VM-exit 控制为 1，VM 退出清除 UINV。
-   以下 MSR 按如下方式建立：
    -   IA32_DEBUGCTL MSR 被清除为 00000000_00000000H。
    -   IA32_SYSENTER_CS MSR 从 IA32_SYSENTER_CS 字段加载。由于该字段只有 32 位，MSR 的第 63:32 位被清除为 0。
    -   IA32_SYSENTER_ESP 和 IA32_SYSENTER_EIP MSR 分别从 IA32_SYSENTER_ESP 和 IA32_SYSENTER_EIP 字段加载。  
        如果处理器不支持 Intel 64 架构，这些字段只有 32 位；MSR 的第 63:32 位被清除为 0。  
        如果处理器支持带 N < 64 个线性地址位的 Intel 64 架构，第 63:N 位中的每一个被设置为第 N-1 位的值。³
    -   在支持 Intel 64 架构的处理器上执行以下步骤：
        -   MSR FS.base 和 GS.base 分别从 FS 和 GS 的基地址字段加载（见第 30.5.2 节）。
        -   IA32_EFER MSR 中的 LMA 和 LME 位各自用"host address-space size" VM-exit 控制的设置加载。
    -   如果"load IA32_PERF_GLOBAL_CTRL" VM-exit 控制为 1，IA32_PERF_GLOBAL_CTRL MSR 从 IA32_PERF_GLOBAL_CTRL 字段加载。该 MSR 中保留的位保持其保留值。
    -   如果"load IA32_PAT" VM-exit 控制为 1，IA32_PAT MSR 从 IA32_PAT 字段加载。该 MSR 中保留的位保持其保留值。
    -   如果"load IA32_EFER" VM-exit 控制为 1，IA32_EFER MSR 从 IA32_EFER 字段加载。该 MSR 中保留的位保持其保留值。
    -   如果"clear IA32_BNDCFGS" VM-exit 控制为 1，IA32_BNDCFGS MSR 被清除为 00000000_00000000H；否则，它不被修改。
    -   如果"clear IA32_RTIT_CTL" VM-exit 控制为 1，IA32_RTIT_CTL MSR 被清除为 00000000_00000000H；否则，它不被修改。
    -   如果"load CET" VM-exit 控制为 1，IA32_S_CET 和 IA32_INTERRUPT_SSP_TABLE_ADDR MSR 分别从 IA32_S_CET 和 IA32_INTERRUPT_SSP_TABLE_ADDR 字段加载。  
        如果处理器不支持 Intel 64 架构，这些字段只有 32 位；MSR 的第 63:32 位被清除为 0。  
        如果处理器支持带 N < 64 个线性地址位的 Intel 64 架构，第 63:N 位中的每一个被设置为第 N-1 位的值。
    -   如果"load PKRS" VM-exit 控制为 1，IA32_PKRS MSR 从 IA32_PKRS 字段加载。该 MSR 的第 63:32 位保持为零。
    -   如果"load FRED" VM-exit 控制为 1，以下 MSR 从相应字段加载：IA32_FRED_CONFIG、IA32_FRED_RSP1、IA32_FRED_RSP2、IA32_FRED_RSP3、IA32_FRED_STKLVLS、IA32_FRED_SSP1、IA32_FRED_SSP2 和 IA32_FRED_SSP3。  
        除 FS.base 和 GS.base 外，如果这些 MSR 中的任何一个出现在 VM-exit MSR-load 区域中，它随后会被覆盖。见第 30.6 节。
-   如果"load IA32_SPEC_CTRL" VM-exit 控制为 1，IA32_SPEC_CTRL MSR 从 IA32_SPEC_CTRL 字段加载。  
    对 MSR 的此加载将具有正常使用正在加载的值写入 MSR 时会发生的任何副作用。

### 30.5.2

### 30.5.2 加载宿主段和描述符表寄存器

寄存器 CS、SS、DS、ES、FS、GS 和 TR 中的每一个按如下方式加载（对 LDTR 的处理见下文）：

-   选择器从选择器字段加载。如果其选择器加载为零，段不可用。第 29.2.3 节指定的检查限制可以加载的选择器值。特别是，CS 和 TR 永远不用零加载，因此永远不会不可用。仅当支持 Intel 64 架构的处理器上且仅当 VM 退出到 64 位模式时，SS 可以用零加载（64 位模式允许使用标记为不可用的段）。
-   基地址按如下设置：
    -   CS。清除为零。
    -   SS、DS 和 ES。如果段不可用，未定义；否则，清除为零。
    -   FS 和 GS。如果段不可用且 VM 退出不是到 64 位模式，未定义（但在支持 Intel 64 架构的处理器上是规范的）；否则，从基地址字段加载。  
        如果处理器支持 Intel 64 架构且处理器支持 N < 64 个线性地址位，第 63:N 位中的每一个被设置为第 N-1 位的值。¹ 为 FS 和 GS 加载的基地址值也体现在 FS.base 和 GS.base MSR 中。
    -   TR。从宿主状态区域加载。如果处理器支持 Intel 64 架构且处理器支持 N < 64 个线性地址位，第 63:N 位中的每一个被设置为第 N-1 位的值。
-   段限长按如下设置：
    -   CS。设置为 FFFFFFFFH（对应于描述符限长 FFFFFH 和 G 位设置 1）。
    -   SS、DS、ES、FS 和 GS。如果段不可用，未定义；否则，设置为 FFFFFFFFH。
    -   TR。设置为 00000067H。
-   类型字段和 S 位按如下设置：
    -   CS。Type 设置为 11，S 设置为 1（执行/读、已访问、非一致代码段）。
    -   SS、DS、ES、FS 和 GS。如果段不可用，未定义；否则，type 设置为 3，S 设置为 1（读/写、已访问、向上扩展数据段）。
    -   TR。Type 设置为 11，S 设置为 0（忙 32 位任务状态段）。
-   DPL 按如下设置：
    -   CS、SS 和 TR。设置为 0。VM 退出完成后当前特权级（CPL）将为 0。
    -   DS、ES、FS 和 GS。如果段不可用，未定义；否则，设置为 0。
-   P 位按如下设置：
    -   CS、TR。设置为 1。
    -   SS、DS、ES、FS 和 GS。如果段不可用，未定义；否则，设置为 1。
-   在支持 Intel 64 架构的处理器上，CS.L 用"host address-space size" VM-exit 控制的设置加载。由于此控制的值也被加载到 IA32_EFER.LMA 中（见第 30.5.1 节），没有 VM 退出是到兼容模式的（兼容模式需要 IA32_EFER.LMA = 1 和 CS.L = 0）。
-   D/B。
    -   CS。用"host address-space size" VM-exit 控制的设置的逆加载。例如，如果该控制为 0，指示 32 位客户，CS.D/B 被设置为 1。
    -   SS。设置为 1。
    -   DS、ES、FS 和 GS。如果段不可用，未定义；否则，设置为 1。
    -   TR。设置为 0。
-   G。
    -   CS。设置为 1。
    -   SS、DS、ES、FS 和 GS。如果段不可用，未定义；否则，设置为 1。
    -   TR。设置为 0。

宿主状态区域不包含 LDTR 的选择器字段。LDTR 在所有 VM 退出上按如下方式建立：选择器被清除为 0000H，段被标记为不可用且否则未定义。

GDTR 和 IDTR 的基地址分别从 GDTR 基地址字段和 IDTR 基地址字段加载。如果处理器支持 Intel 64 架构且处理器支持 N < 64 个线性地址位，每个基地址的第 63:N 位中的每一个被设置为该基地址第 N-1 位的值。GDTR 和 IDTR 限长各自被设置为 FFFFH。

### 30.5.3 加载宿主 RIP、RSP、RFLAGS 和 SSP

RIP 和 RSP 分别从 RIP 字段和 RSP 字段加载。RFLAGS 被清除，除了总是被设置的第 1 位。

如果"load CET" VM-exit 控制为 1，SSP（影子栈指针）从 SSP 字段加载。

### 30.5.4 检查和加载宿主页目录指针表项

如果 CR0.PG = 1、CR4.PAE = 1 且 IA32_EFER.LMA = 0，逻辑处理器使用 PAE 分页。见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 5.4 节。¹ 当使用 PAE 分页时，CR3 中的物理地址引用页目录指针表项（PDPTE）的表。当使用 PAE 分页时，到 CR3 的 MOV 检查 PDPTE 的有效性，如果它们有效，把它们加载到处理器中（到内部、非架构寄存器）。

如果（1）VMCS 宿主状态区域中 CR4 字段中的第 5 位（对应于 CR4.PAE）被设置；且（2）"host address-space size" VM-exit 控制为 0，VM 退出到使用 PAE 分页的 VMM。此类 VM 退出可以检查 VMCS 宿主状态区域中 CR3 字段引用的 PDPTE 的有效性。如果（1）VM 退出前未使用 PAE 分页；或（2）CR3 的值由于 VM 退出而改变，此类 VM 退出必须检查它们的有效性。到不使用 PAE 分页的 VMM 的 VM 退出不得检查 PDPTE 的有效性。

检查 PDPTE 有效性的 VM 退出使用与使用 PAE 分页时用 MOV 到 CR3 加载 CR3 所使用的相同检查。如果由于本会加载的 PDPTE（例如，因为设置保留位）MOV 到 CR3 本会导致通用保护异常，发生 VMX 中止（见第 30.7 节）。如果到使用 PAE 的 VMM 的 VM 退出不导致 VMX 中止，PDPTE 使用 VM 退出正在加载的 CR3 的值按 MOV 到 CR3 那样加载到处理器中。

### 30.5.5 更新非寄存器状态

VM 退出按如下方式影响逻辑处理器的非寄存器状态：

-   逻辑处理器在 VM 退出后总是处于活动状态。
-   事件阻止按如下方式受影响：
    -   VM 退出后没有由 STI 或由 MOV SS 阻止。
    -   由非可屏蔽中断（NMI）直接引起的 VM 退出导致由 NMI 阻止（见表 27-3）。其他 VM 退出不影响由 NMI 阻止。（NMI 间接导致 VM 退出的情况见第 30.1 节。）
-   VM 退出后没有待处理调试异常。
-   如果处理器支持"APIC-timer virtualization" VM 执行控制的 1 设置，客户截止时间被清除，解除客户计时器的布防。

第 31.4 节描述 VMX 架构如何控制逻辑处理器管理 TLB 和分页结构缓存中的信息。以下条目详述 VM 退出如何使缓存的映射失效：

-   如果"enable VPID" VM 执行控制为 0，逻辑处理器使与 VPID 0000H 相关联的线性映射和组合映射失效（对所有 PCID）；VPID 0000H 的组合映射对所有 EPTRTA 值失效（EPTRTA 是 EPTP 第 51:12 位的值）。
-   如果"enable VPID" VM 执行控制为 1，VM 退出不需要使任何客户物理映射失效，也不需要使任何线性映射或组合映射失效。

### 30.5.6 清除地址范围监视

Intel 64 和 IA-32 架构允许软件使用 MONITOR 和 MWAIT 指令监视指定地址范围。见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 11.10.4 节。VM 退出清除可能生效的任何地址范围监视。

## 30.6 加载 MSR

VM 退出可以从 VM-exit MSR-load 区域加载 MSR（见第 27.7.2 节）。具体来说，该区域中的每个条目（最多为 VM-exit MSR-load 计数中指定的数量）按顺序处理，用第 127:64 位的内容按 WRMSR 会写入的方式加载由第 31:0 位索引的 MSR。

在以下任一情况下，条目的处理失败：

-   第 31:0 位的值是 C0000100H（IA32_FS_BASE MSR）或 C0000101H（IA32_GS_BASE MSR）。
-   第 31:8 位的值是 000008H，意味着索引的 MSR 是当本地 APIC 处于 x2APIC 模式时允许访问 APIC 寄存器的 MSR。
-   第 31:0 位的值指示只能在系统管理模式（SMM）中写入的 MSR，且 VM 退出不会在 SMM 中结束。（IA32_SMM_MONITOR_CTL 是只能在 SMM 中写入的 MSR。）
-   第 31:0 位的值指示由于特定于型号的原因不能在 VM 退出时加载的 MSR。即使 MSR 通常可以由 WRMSR 写入，处理器也可能阻止加载某些 MSR。这种特定于型号的行为在《Intel® 64 和 IA-32 架构软件开发手册》第 4 卷第 2 章"特定型号寄存器（MSR）"中记录。
-   第 63:32 位不全部为 0。
-   如果通过 WRMSR 在 CPL = 0 下执行，将第 127:64 位写入由条目第 31:0 位索引的 MSR 的尝试会导致通用保护异常。¹

如果任何条目的处理失败，发生 VMX 中止。见第 30.7 节。

如果任何 MSR 正以在架构上需要 TLB 刷新的方式加载，TLB 被更新，以便在 VM 退出后，逻辑处理器不会使用转换前缓存过的任何转换。

## 30.7 VMX 中止

VM 退出期间遇到的问题导致 VMX 中止。VMX 中止使逻辑处理器进入关闭状态，如下所述。

VMX 中止不修改任何活动 VMCS 的 VMCS 区域中的 VMCS 数据。因此 VMX 中止后这些数据的内容可疑。

在 VMX 中止时，逻辑处理器在其误配置导致失败的 VMCS 的 VMCS 区域中字节偏移 4 处保存非零 32 位 VMX-abort 指示符字段（见第 27.2 节）。使用以下值：

1.  保存客户 MSR 时失败（见第 30.4 节）。
2.  页目录指针表项（PDPTE）的宿主检查失败（见第 30.5.4 节）。
3.  当前 VMCS 已（通过对相应 VMCS 区域的写入）被破坏，使得逻辑处理器无法正确完成 VM 退出。
4.  加载宿主 MSR 时失败（见第 30.6 节）。
5.  VM 退出期间有机器检查事件（见第 30.8 节）。
6.  VM 退出前逻辑处理器处于 IA-32e 模式且"host address-space size" VM-exit 控制为 0（见第 30.5 节）。

其中一些原因对应于从宿主状态区域加载状态期间的失败。由于此类状态的加载可以以任何顺序完成（见第 30.5 节），VM 退出可能因多个原因导致 VMX 中止（例如，当前 VMCS 可能已损坏且宿主 PDPTE 可能未正确配置）。在这种情况下，VMX-abort 指示符可能对应于其中任何一个原因。

逻辑处理器从不读取 VMCS 区域中的 VMX-abort 指示符，且仅用上述非零值之一写入它。VMX-abort 指示符允许一个逻辑处理器上的软件诊断另一个逻辑处理器上的 VMX 中止。因此，建议在 VMX 根操作中运行的软件将其使用的任何 VMCS 的 VMCS 区域中的 VMX-abort 指示符清零。

保存 VMX-abort 指示符后，经历 VMX 中止的逻辑处理器的操作取决于逻辑处理器是否处于 SMX 操作中：²

-   如果逻辑处理器处于 SMX 操作中，发生 Intel® TXT 关闭条件。使用的错误码是 000DH，指示"VMX abort"。见《Intel® 可信执行技术测量启动环境编程指南》。
-   如果逻辑处理器在 SMX 操作之外，它发出特殊总线周期（以通知芯片组）并进入 VMX-abort 关闭状态。RESET 是唤醒逻辑处理器离开 VMX-abort 关闭状态的唯一事件。以下事件不影响处于此状态的逻辑处理器：机器检查事件；INIT 信号；外部中断；非可屏蔽中断（NMI）；启动 IPI（SIPI）；和系统管理模式中断（SMI）。

## 30.8 VM 退出期间的机器检查事件

如果机器检查事件在 VM 退出期间发生，以下之一发生：

-   机器检查事件按它发生在 VM 退出之前的方式处理：
    -   如果 CR4.MCE = 0，逻辑处理器的操作取决于逻辑处理器是否处于 SMX 操作中：²
        -   如果逻辑处理器处于 SMX 操作中，发生 Intel® TXT 关闭条件。使用的错误码是 000CH，指示"unrecoverable machine-check condition"。
        -   如果逻辑处理器在 SMX 操作之外，它进入关闭状态。
    -   如果 CR4.MCE = 1，生成机器检查异常（#MC）：
        -   如果异常位图的第 18 位（#MC）为 0，异常被正常交付给客户。
        -   如果异常位图的第 18 位为 1，异常导致 VM 退出。
-   机器检查事件在 VM 退出完成后处理：
    -   如果 VM 退出以 CR4.MCE = 0 结束，逻辑处理器的操作取决于逻辑处理器是否处于 SMX 操作中：
        -   如果逻辑处理器处于 SMX 操作中，发生带错误码 000CH（不可恢复的机器检查条件）的 Intel® TXT 关闭条件。
        -   如果逻辑处理器在 SMX 操作之外，它进入关闭状态。
    -   如果 VM 退出以 CR4.MCE = 1 结束，机器检查异常（#MC）被正常交付给宿主。
-   生成 VMX 中止（见第 30.7 节）。逻辑处理器按 VMX 中止中正常方式阻止事件。VMX 中止指示符为 5，为"machine-check event during VM exit"（VM 退出期间的机器检查事件）。

如果机器检查事件在任何宿主状态已被加载之后发生，不使用第一个选项。仅当 VM 进入能够加载所有宿主状态时使用第二个选项。

## 30.9 VM 退出后的用户中断识别

如果 VM 退出以 CR4.UINTR = IA32_EFER.LMA = 1 且 UIRR ≠ 0 完成，VM 退出导致识别挂起的用户中断；否则，不识别挂起的用户中断。

## 第 31 章 VMX 对地址转换的支持

VMX 操作的架构包括两个支持地址转换的特性：虚拟处理器标识符（VPID）和扩展页表机制（EPT）。VPID 是用于管理线性地址转换的机制。EPT 定义了一层增强线性地址转换的地址转换层。

第 31.1 节详述 VPID 的架构。第 31.3 节提供 EPT 的细节。第 31.4 节解释逻辑处理器如何缓存来自分页结构的信息、它如何使用该缓存信息以及软件如何管理缓存信息。

## 31.1 虚拟处理器标识符（VPID）

VMX 操作的原始架构要求 VMX 转换刷新 TLB 和分页结构缓存。这确保为旧线性地址空间缓存的转换不会在转换后被使用。

虚拟处理器标识符（VPID）向 VMX 操作引入逻辑处理器可以为多个线性地址空间缓存信息的设施。当使用 VPID 时，VMX 转换可以保留缓存信息，且逻辑处理器切换到不同的线性地址空间。

第 31.4 节详述逻辑处理器管理为多个地址空间缓存的信息的机制。逻辑处理器可以用 16 位 VPID 标记某些缓存信息。本节指定在任何时间点如何确定当前 VPID：

-   在以下情况下，当前 VPID 是 0000H：
    -   在 VMX 操作之外。（这包括在 SMI 和 SMM 的默认处理下处于系统管理模式且带 VMX 操作；见第 34.14 节。）
    -   在 VMX 根操作中。
    -   当"enable VPID" VM 执行控制为 0 时，在 VMX 非根操作中。
-   如果逻辑处理器处于 VMX 非根操作且"enable VPID" VM 执行控制为 1，当前 VPID 是 VMCS 中 VPID VM 执行控制字段的值。（VM 进入确保此值永远不会是 0000H；见第 29.2.1.1 节。）

VPID 和 PCID（见第 5.10.1 节）可以同时使用。当这样做时，处理器将缓存信息与 VPID 和 PCID 都关联。仅当当前 VPID 和 PCID 都与缓存信息关联的那些匹配时，此类信息才被使用。

支持安全仲裁模式（见第 35 章"安全仲裁模式（SEAM）"）的处理器隐式支持 17 位 VPID。在 SEAM 之外缓存和使用的转换使用如上所述的 VPID 0000H–FFFFH。在 SEAM 中缓存和使用的那些使用设置第 16 位的 VPID，因此在 10000H–1FFFFH 范围内（例如，SEAM 根操作使用 VPID 10000H）。此使用是隐式的，因为即使在 SEAM 中，VMCS 中的 VPID VM 执行控制字段仍为 16 位。

## 31.2 虚拟机管理程序管理的线性地址转换（HLAT）

虚拟机管理程序管理的线性地址转换（HLAT）是改变 VMX 非根操作中线性地址转换方式的特性。转换不使用普通分页，而是使用称为 HLAT 分页的修改过程。

仅当"enable HLAT" VM 执行控制为 1 时，才使用 HLAT 分页。HLAT 分页仅用于 4 级分页和 5 级分页的分页模式。由于 HLAT 分页是普通分页的修改，特性的细节在第 5.5 节中给出，该节描述 4 级分页和 5 级分页的操作。

## 31.3 扩展页表机制（EPT）

扩展页表机制（EPT）是可用于支持物理内存虚拟化的特性。当使用 EPT 时，某些正常会被视为物理地址（并用于访问内存）的地址改为被视为客户物理地址。客户物理地址通过遍历一组 EPT 分页结构来转换，以产生用于访问内存的物理地址。

-   第 31.3.1 节给出 EPT 的概述。
-   第 31.3.2 节描述基于 EPT 的地址转换的操作。
-   第 31.3.3 节讨论可能由 EPT 引起的 VM 退出。
-   第 31.3.7 节描述 EPT 与内存类型化之间的交互。

### 31.3.1 EPT 概述

当"enable EPT" VM 执行控制为 1 时使用 EPT。¹ 它转换 VMX 非根操作中使用的客户物理地址以及 VM 进入用于事件注入使用的那些地址。

从客户物理地址到物理地址的转换由一组 EPT 分页结构决定。EPT 分页结构与处理器处于 IA-32e 模式时用于转换线性地址的那些类似。第 31.3.2 节给出 EPT 分页结构的细节。

如果 CR0.PG = 1，线性地址通过控制寄存器 CR3 引用的分页结构转换。² 当"enable EPT" VM 执行控制为 1 时，这些称为客户分页结构。如果 CR0.PG = 0，没有客户分页结构。³

当"enable EPT" VM 执行控制为 1 时，客户物理地址的身份取决于 CR0.PG 的值：

-   如果 CR0.PG = 0，每个线性地址被视为客户物理地址。
-   如果 CR0.PG = 1，客户物理地址是从控制寄存器 CR3 和客户分页结构的内容推导出的那些。（这包括逻辑处理器存储在内部、非架构寄存器中的 PDPTE 的值。）后者包括（在页表条目和位 7——PS——为 1 的其他分页结构条目中）线性地址被客户分页结构转换到的地址。

如果 CR0.PG = 1，线性地址到物理地址的转换需要使用 EPT 多次转换客户物理地址。例如，假设 CR4.PAE = CR4.PSE = 0。那么 32 位线性地址的转换按如下操作：

-   线性地址的第 31:22 位选择位于 CR3 中客户物理地址处的客户页目录中的条目。客户页目录条目（PDE）的客户物理地址通过 EPT 转换以确定客户 PDE 的物理地址。
-   线性地址的第 21:12 位选择位于客户 PDE 中客户物理地址处的客户页表中的条目。客户页表条目（PTE）的客户物理地址通过 EPT 转换以确定客户 PTE 的物理地址。
-   线性地址的第 11:0 位是位于客户 PTE 中客户物理地址处的页帧中的偏移。由此偏移确定的客户物理地址通过 EPT 转换以确定原始线性地址转换到的物理地址。

除了将客户物理地址转换为物理地址外，EPT 指定软件访问该地址时允许的特权。对不允许访问的尝试称为 EPT 违规并导致 VM 退出。见第 31.3.3 节。

仅当客户物理地址用于访问内存时，处理器才使用 EPT 转换它们。此原则意味着以下事项：

-   MOV 到 CR3 指令用客户物理地址加载 CR3。该地址是否通过 EPT 转换取决于是否正在使用 PAE 分页。¹
    -   如果未使用 PAE 分页，指令不使用该地址访问内存且不导致它通过 EPT 转换。（如果 CR0.PG = 1，该地址将在下一次使用线性地址访问内存时通过 EPT 转换。）
    -   如果正在使用 PAE 分页，指令从该地址加载四个（4）页目录指针表项（PDPTE）且它确实导致该地址通过 EPT 转换。
-   第 5.4.1 节标识从 CR3 中客户物理地址加载 PDPTE 的 MOV 到 CR0 和 MOV 到 CR4 的执行。此类执行导致该地址通过 EPT 转换。
-   PDPTE 包含客户物理地址。加载 PDPTE 的指令（见上文）不使用那些地址访问内存且不导致它们通过 EPT 转换。PDPTE 中的地址将在下一次使用使用该 PDPTE 的线性地址访问内存时通过 EPT 转换。

物理和客户物理地址的宽度是有限的。CPUID.80000008H:EAX\[7:0\] 报告处理器支持的物理地址宽度。此宽度最多为 52，限制物理和客户物理地址两者的宽度：

-   **物理地址**。对物理地址的限制表示为 MAXPHYADDR，从 CPUID.80000008H:EAX\[7:0\] 推导。如果 IA32_TME_ACTIVATE\[0\] = 1（指示 TME 已配置），当逻辑处理器在安全仲裁模式（SEAM；见第 35 章）之外时，MAXPHYADDR 减少 IA32_TME_ACTIVATE\[39:36\] 的值；在 SEAM 中该值不减少。²  
    例如，如果 CPUID.80000008H:EAX\[7:0\] = 48、IA32_TME_ACTIVATE\[39:36\] = 4 且 TME 已配置，MAXPHYADDR 在 SEAM 之外为 44（但在 SEAM 中保持 48）。
-   **客户物理地址**。这些地址的宽度受 CPUID.80000008H:EAX\[7:0\] 枚举的值限制，不考虑 TME 或 SEAM。

### 31.3.2 EPT 转换机制

EPT 转换机制可以按两种模式之一配置：4 级 EPT 或 5 级 EPT。4 级 EPT 访问最多 4 个 EPT 分页结构条目（EPT 页遍历长度为 4）以转换客户物理地址，且仅使用每个客户物理地址的第 47:0 位。相比之下，5 级 EPT 可能访问最多 5 个 EPT 分页结构条目（EPT 页遍历长度为 5）且使用客户物理地址位 56:0。³

EPT 页遍历长度使用扩展页表指针（EPTP）配置，EPTP 是 VM 执行控制字段（见第 27.6.11 节中的表 27-9）。具体来说，第 5:3 位包含比 EPT 页遍历长度小一的值。因此，值 3 配置 4 级 EPT，而值 4 配置 5 级 EPT。⁴

本节剩余部分描述 4 级 EPT 和 5 级 EPT 使用的转换过程。由于两种 EPT 模式使用的过程相似，它们在以下条目中一起描述（标识任何差异）：

-   使用 5 级 EPT，4 KByte 自然对齐的 EPT PML5 表位于 EPTP 第 51:12 位中指定的物理地址处。EPT PML5 表包括 512 个 64 位条目（EPT PML5E）。使用按如下定义的物理地址选择 EPT PML5E：
    -   第 63:52 位全部为 0。
    -   第 51:12 位来自 EPTP。
    -   第 11:3 位是客户物理地址的第 56:48 位。¹
    -   第 2:0 位全部为 0。  
        由于 EPT PML5E 使用客户物理地址的第 56:48 位标识，它控制对客户物理地址空间 256-TByte 区域的访问。引用 EPT PML4 表的 EPT PML5E 的格式见表 31-1。

**表 31-1. 引用 EPT PML4 表的 EPT PML5 条目（PML5E）的格式**

| 位位置 | 内容  |
| --- | --- |
| 0   | 读访问；指示是否允许从此条目控制的 256-TByte 区域读。 |
| 1   | 写访问；指示是否允许向此条目控制的 256-TByte 区域写。 |
| 2   | 如果"mode-based execute control for EPT" VM 执行控制为 0，执行访问；指示是否允许从此条目控制的 256-TByte 区域进行指令获取。  <br>如果该控制为 1，监管者模式线性地址的执行访问；指示是否允许从监管者模式线性地址在此条目控制的 256-TByte 区域中进行指令获取。 |
| 7:3 | 保留（必须为 0）。 |
| 8   | 如果 EPTP 的第 6 位为 1，EPT 的已访问标志；指示软件是否已访问此条目控制的 256-TByte 区域（见第 31.3.5 节）。如果 EPTP 的第 6 位为 0，忽略。 |
| 9   | 忽略。 |
| 10  | 用户模式线性地址的执行访问。如果"mode-based execute control for EPT" VM 执行控制为 1，指示是否允许从用户模式线性地址在此条目控制的 256-TByte 区域中进行指令获取。如果该控制为 0，此位被忽略。 |
| 11  | 忽略。 |
| M–1:12 | 此条目引用的 4-KByte 对齐 EPT PML4 表的物理地址。¹ |
| 51:M | 保留（必须为 0）。 |
| 63:52 | 忽略。 |

注：

1.  M 是 MAXPHYADDR 的缩写。见第 31.3.1 节。

-   使用 4 级 EPT，客户物理地址的第 51:48 位必须全部为零；否则，发生 EPT 违规（见第 31.3.3 节）。
-   4-KByte 自然对齐的 EPT PML4 表位于 EPTP（对于 4 级 EPT）或 EPT PML5E（对于 5 级 EPT）中指定的物理地址处。EPT PML4 表包括 512 个 64 位条目（EPT PML4E）。使用按如下定义的物理地址选择 EPT PML4E：
    -   第 63:52 位全部为 0。
    -   第 51:12 位来自 EPTP（对于 4 级 EPT）或来自 EPT PML4E 的第 51:12 位（对于 5 级 EPT）。
    -   第 11:3 位是客户物理地址的第 47:39 位。
    -   第 2:0 位全部为 0。  
        由于 EPT PML4E 使用客户物理地址的第 47:39 位标识，它控制对客户物理地址空间 512-GByte 区域的访问。引用 EPT 页目录指针表的 EPT PML4E 的格式见表 31-2。

**表 31-2. 引用 EPT 页目录指针表的 EPT PML4 条目（PML4E）的格式**

| 位位置 | 内容  |
| --- | --- |
| 0   | 读访问；指示是否允许从此条目控制的 512-GByte 区域读。 |
| 1   | 写访问；指示是否允许向此条目控制的 512-GByte 区域写。 |
| 2   | 如果"mode-based execute control for EPT" VM 执行控制为 0，执行访问；指示是否允许从此条目控制的 512-GByte 区域进行指令获取。  <br>如果该控制为 1，监管者模式线性地址的执行访问；指示是否允许从监管者模式线性地址在此条目控制的 512-GByte 区域中进行指令获取。 |
| 7:3 | 保留（必须为 0）。 |
| 8   | 如果 EPTP 的第 6 位为 1，EPT 的已访问标志；指示软件是否已访问此条目控制的 512-GByte 区域（见第 31.3.5 节）。如果 EPTP 的第 6 位为 0，忽略。 |
| 9   | 忽略。 |
| 10  | 用户模式线性地址的执行访问。如果"mode-based execute control for EPT" VM 执行控制为 1，指示是否允许从用户模式线性地址在此条目控制的 512-GByte 区域中进行指令获取。如果该控制为 0，此位被忽略。 |
| 11  | 忽略。 |
| M–1:12 | 此条目引用的 4-KByte 对齐 EPT 页目录指针表的物理地址。¹ |
| 51:M | 保留（必须为 0）。 |
| 63:52 | 忽略。 |

注：

1.  M 是 MAXPHYADDR 的缩写。见第 31.3.1 节。

-   4-KByte 自然对齐的 EPT 页目录指针表位于 EPT PML4E 第 51:12 位中指定的物理地址处。EPT 页目录指针表包括 512 个 64 位条目（EPT PDPTE）。使用按如下定义的物理地址选择 EPT PDPTE：
    -   第 63:52 位全部为 0。
    -   第 51:12 位来自 EPT PML4E。
    -   第 11:3 位是客户物理地址的第 38:30 位。
    -   第 2:0 位全部为 0。  
        由于 EPT PDPTE 使用客户物理地址的第 47:30 位标识，它控制对客户物理地址空间 1-GByte 区域的访问。EPT PDPTE 的使用取决于该条目中第 7 位的值：¹
    -   如果 EPT PDPTE 的第 7 位为 1，EPT PDPTE 映射 1-GByte 页。最终物理地址按如下计算：
        -   第 63:52 位全部为 0。
        -   第 51:30 位来自 EPT PDPTE。
        -   第 29:0 位来自原始客户物理地址。  
            映射 1-GByte 页的 EPT PDPTE 的格式见表 31-3。

**表 31-3. 映射 1-GByte 页的 EPT 页目录指针表条目（PDPTE）的格式**

| 位位置 | 内容  |
| --- | --- |
| 0   | 读访问；指示是否允许从此条目引用的 1-GByte 页读。 |
| 1   | 写访问；指示是否允许向此条目引用的 1-GByte 页写。 |
| 2   | 如果"mode-based execute control for EPT" VM 执行控制为 0，执行访问；指示是否允许从此条目控制的 1-GByte 页进行指令获取。 |

如果该控制为 1，监管者模式线性地址的执行访问；指示是否允许从监管者模式线性地址在此条目控制的 1-GByte 页中进行指令获取。 |  
| 5:3 | 此 1-GByte 页的 EPT 内存类型（见第 31.3.7 节）。 |  
| 6 | 为此 1-GByte 页忽略 PAT 内存类型（见第 31.3.7 节）。 |  
| 7 | 必须为 1（否则，此条目引用 EPT 页目录）。 |  
| 8 | 如果 EPTP 的第 6 位为 1，EPT 的已访问标志；指示软件是否已访问此条目引用的 1-GByte 页（见第 31.3.5 节）。如果 EPTP 的第 6 位为 0，忽略。 |  
| 9 | 如果 EPTP 的第 6 位为 1，EPT 的脏标志；指示软件是否已写入此条目引用的 1-GByte 页（见第 31.3.5 节）。如果 EPTP 的第 6 位为 0，忽略。 |  
| 10 | 用户模式线性地址的执行访问。如果"mode-based execute control for EPT" VM 执行控制为 1，指示是否允许从用户模式线性地址在此条目控制的 1-GByte 页中进行指令获取。如果该控制为 0，此位被忽略。 |  
| 11 | 忽略。 |  
| 29:12 | 保留（必须为 0）。 |  
| M–1:30 | 此条目引用的 1-GByte 页的物理地址。¹ |  
| 51:M | 保留（必须为 0）。 |  
| 56:52 | 忽略。 |  
| 57 | 验证客户分页。如果"guest-paging verification" VM 执行控制为 1，指示用于访问此条目控制的 1-GByte 页的客户分页结构的限制（见第 31.3.3.2 节）。如果该控制为 0，此位被忽略。 |  
| 58 | 分页写访问。如果"EPT paging-write control" VM 执行控制为 1，指示客户分页可以更新此条目控制的 1-GByte 页（见第 31.3.3.2 节）。如果该控制为 0，此位被忽略。 |  
| 59 | 忽略。 |  
| 60 | 监管者影子栈。如果 EPTP 的第 7 位为 1，指示是否允许监管者影子栈访问此条目映射的 1-GByte 页中的客户物理地址（见第 31.3.3.2 节）。如果 EPTP 的第 7 位为 0，忽略。 |  
| 62:61 | 忽略。 |  
| 63 | 抑制 #VE。如果"EPT-violation #VE" VM 执行控制为 1，仅当此位为 0 时，由对此页的访问引起的 EPT 违规才能转换为虚拟化异常（见第 28.5.8.1 节）。如果"EPT-violation #VE" VM 执行控制为 0，此位被忽略。 |

注：

1.  M 是 MAXPHYADDR 的缩写。见第 31.3.1 节。

-   如果 EPT PDPTE 的第 7 位为 0，4-KByte 自然对齐的 EPT 页目录位于 EPT PDPTE 第 51:12 位中指定的物理地址处。引用 EPT 页目录的 EPT PDPTE 的格式见表 31-4。

**表 31-4. 引用 EPT 页目录的 EPT 页目录指针表条目（PDPTE）的格式**

| 位位置 | 内容  |
| --- | --- |
| 0   | 读访问；指示是否允许从此条目控制的 1-GByte 区域读。 |
| 1   | 写访问；指示是否允许向此条目控制的 1-GByte 区域写。 |
| 2   | 如果"mode-based execute control for EPT" VM 执行控制为 0，执行访问；指示是否允许从此条目控制的 1-GByte 区域进行指令获取。  <br>如果该控制为 1，监管者模式线性地址的执行访问；指示是否允许从监管者模式线性地址在此条目控制的 1-GByte 区域中进行指令获取。 |
| 7:3 | 保留（必须为 0）。 |
| 8   | 如果 EPTP 的第 6 位为 1，EPT 的已访问标志；指示软件是否已访问此条目控制的 1-GByte 区域（见第 31.3.5 节）。如果 EPTP 的第 6 位为 0，忽略。 |
| 9   | 忽略。 |
| 10  | 用户模式线性地址的执行访问。如果"mode-based execute control for EPT" VM 执行控制为 1，指示是否允许从用户模式线性地址在此条目控制的 1-GByte 区域中进行指令获取。如果该控制为 0，此位被忽略。 |
| 11  | 忽略。 |
| M–1:12 | 此条目引用的 4-KByte 对齐 EPT 页目录的物理地址。¹ |
| 51:M | 保留（必须为 0）。 |
| 63:52 | 忽略。 |

注：

1.  M 是 MAXPHYADDR 的缩写。见第 31.3.1 节。

EPT 页目录包括 512 个 64 位条目（PDE）。使用按如下定义的物理地址选择 EPT PDE：

-   第 63:52 位全部为 0。
-   第 51:12 位来自 EPT PDPTE。
-   第 11:3 位是客户物理地址的第 29:21 位。
-   第 2:0 位全部为 0。

由于 EPT PDE 使用客户物理地址的第 47:21 位标识，它控制对客户物理地址空间 2-MByte 区域的访问。EPT PDE 的使用取决于该条目中第 7 位的值：

-   如果 EPT PDE 的第 7 位为 1，EPT PDE 映射 2-MByte 页。最终物理地址按如下计算：
    -   第 63:52 位全部为 0。
    -   第 51:21 位来自 EPT PDE。
    -   第 20:0 位来自原始客户物理地址。  
        映射 2-MByte 页的 EPT PDE 的格式见表 31-5。
-   如果 EPT PDE 的第 7 位为 0，4-KByte 自然对齐的 EPT 页表位于 EPT PDE 第 51:12 位中指定的物理地址处。引用 EPT 页表的 EPT PDE 的格式见表 31-6。

**表 31-5. 映射 2-MByte 页的 EPT 页目录条目（PDE）的格式**

| 位位置 | 内容  |
| --- | --- |
| 0   | 读访问；指示是否允许从此条目引用的 2-MByte 页读。 |
| 1   | 写访问；指示是否允许向此条目引用的 2-MByte 页写。 |
| 2   | 如果"mode-based execute control for EPT" VM 执行控制为 0，执行访问；指示是否允许从此条目控制的 2-MByte 页进行指令获取。  <br>如果该控制为 1，监管者模式线性地址的执行访问；指示是否允许从监管者模式线性地址在此条目控制的 2-MByte 页中进行指令获取。 |
| 5:3 | 此 2-MByte 页的 EPT 内存类型（见第 31.3.7 节）。 |
| 6   | 为此 2-MByte 页忽略 PAT 内存类型（见第 31.3.7 节）。 |
| 7   | 必须为 1（否则，此条目引用 EPT 页表）。 |
| 8   | 如果 EPTP 的第 6 位为 1，EPT 的已访问标志；指示软件是否已访问此条目引用的 2-MByte 页（见第 31.3.5 节）。如果 EPTP 的第 6 位为 0，忽略。 |
| 9   | 如果 EPTP 的第 6 位为 1，EPT 的脏标志；指示软件是否已写入此条目引用的 2-MByte 页（见第 31.3.5 节）。如果 EPTP 的第 6 位为 0，忽略。 |
| 10  | 用户模式线性地址的执行访问。如果"mode-based execute control for EPT" VM 执行控制为 1，指示是否允许从用户模式线性地址在此条目控制的 2-MByte 页中进行指令获取。如果该控制为 0，此位被忽略。 |
| 11  | 忽略。 |
| 20:12 | 保留（必须为 0）。 |
| M–1:21 | 此条目引用的 2-MByte 页的物理地址。¹ |
| 51:M | 保留（必须为 0）。 |
| 56:52 | 忽略。 |
| 57  | 验证客户分页。如果"guest-paging verification" VM 执行控制为 1，指示用于访问此条目控制的 2-MByte 页的客户分页结构的限制（见第 31.3.3.2 节）。如果该控制为 0，此位被忽略。 |
| 58  | 分页写访问。如果"EPT paging-write control" VM 执行控制为 1，指示客户分页可以更新此条目控制的 2-MByte 页（见第 31.3.3.2 节）。如果该控制为 0，此位被忽略。 |
| 59  | 忽略。 |
| 60  | 监管者影子栈。如果 EPTP 的第 7 位为 1，指示是否允许监管者影子栈访问此条目映射的 2-MByte 页中的客户物理地址（见第 31.3.3.2 节）。如果 EPTP 的第 7 位为 0，忽略。 |
| 62:61 | 忽略。 |
| 63  | 抑制 #VE。如果"EPT-violation #VE" VM 执行控制为 1，仅当此位为 0 时，由对此页的访问引起的 EPT 违规才能转换为虚拟化异常（见第 28.5.8.1 节）。如果"EPT-violation #VE" VM 执行控制为 0，此位被忽略。 |

注：

1.  M 是 MAXPHYADDR 的缩写。见第 31.3.1 节。

EPT 页表包括 512 个 64 位条目（PTE）。使用按如下定义的物理地址选择 EPT PTE：

-   第 63:52 位全部为 0。
    
-   第 51:12 位来自 EPT PDE。
    
-   第 11:3 位是客户物理地址的第 20:12 位。
    
-   第 2:0 位全部为 0。
    
-   由于 EPT PTE 使用客户物理地址的第 47:12 位标识，每个 EPT PTE 映射 4-KByte 页。最终物理地址按如下计算：
    
    -   第 63:52 位全部为 0。
    -   第 51:12 位来自 EPT PTE。
    -   第 11:0 位来自原始客户物理地址。  
        EPT PTE 的格式见表 31-7。

如果第 2:0 位中的任何一个为 1，EPT 分页结构条目存在；否则，条目不存在。处理器忽略第 62:3 位，且不使用该条目引用另一 EPT 分页结构条目或产生物理地址。使用其转换遇到不存在的 EPT 分页结构的客户物理地址的引用导致 EPT 违规（见第 31.3.3.2 节）。（如果"EPT-violation #VE" VM 执行控制为 1，仅当第 63 位为 0 时，EPT 违规才能转换为虚拟化异常；见第 28.5.8.1 节。如果"EPT-violation #VE" VM 执行控制为 0，此位被忽略。）

**表 31-6. 引用 EPT 页表的 EPT 页目录条目（PDE）的格式**

| 位位置 | 内容  |
| --- | --- |
| 0   | 读访问；指示是否允许从此条目控制的 2-MByte 区域读。 |
| 1   | 写访问；指示是否允许向此条目控制的 2-MByte 区域写。 |
| 2   | 如果"mode-based execute control for EPT" VM 执行控制为 0，执行访问；指示是否允许从此条目控制的 2-MByte 区域进行指令获取。  <br>如果该控制为 1，监管者模式线性地址的执行访问；指示是否允许从监管者模式线性地址在此条目控制的 2-MByte 区域中进行指令获取。 |
| 6:3 | 保留（必须为 0）。 |
| 7   | 必须为 0（否则，此条目映射 2-MByte 页）。 |
| 8   | 如果 EPTP 的第 6 位为 1，EPT 的已访问标志；指示软件是否已访问此条目控制的 2-MByte 区域（见第 31.3.5 节）。如果 EPTP 的第 6 位为 0，忽略。 |
| 9   | 忽略。 |
| 10  | 用户模式线性地址的执行访问。如果"mode-based execute control for EPT" VM 执行控制为 1，指示是否允许从用户模式线性地址在此条目控制的 2-MByte 区域中进行指令获取。如果该控制为 0，此位被忽略。 |
| 11  | 忽略。 |
| M–1:12 | 此条目引用的 4-KByte 对齐 EPT 页表的物理地址。¹ |
| 51:M | 保留（必须为 0）。 |
| 63:52 | 忽略。 |

注：

1.  M 是 MAXPHYADDR 的缩写。见第 31.3.1 节。

> **注**  
> 如果"mode-based execute control for EPT" VM 执行控制为 1，如果第 2:0 位或第 10 位中的任何一个为 1，EPT 分页结构条目存在。如果第 2:0 位全部为 0 但第 10 位为 1，条目被正常用于引用另一 EPT 分页结构条目或产生物理地址。

上面的讨论描述 EPT 分页结构如何互相引用以及逻辑处理器在转换客户物理地址时如何遍历那些结构。它不涵盖转换过程的所有细节。额外细节按如下提供：

-   转换过程可能导致 VM 退出（有时在过程完成前）的情况在第 31.3.3 节中描述。
-   EPT 转换机制与内存类型化之间的交互在第 31.3.7 节中描述。

图 31-1 给出 EPTP 和 EPT 分页结构条目格式的总结。对于 EPT 分页结构条目，它分别标识映射页的条目、引用其他 EPT 分页结构的条目以及因不存在而两者都不做的条目的格式；第 2:0 位和第 7 位被突出显示，因为它们决定如何使用分页结构条目。（图 31-1 未考虑如果"mode-based execute control for EPT" VM 执行控制为 1，如果第 2:0 位或第 10 位中的任何一个为 1 条目存在的事实。）

### 31.3.3 EPT 引起的 VM 退出

使用客户物理地址的访问可能由于 EPT 误配置、EPT 违规和页修改日志已满事件导致 VM 退出。当在转换客户物理地址的过程中，逻辑处理器遇到包含不受支持值的 EPT 分页结构条目时，发生 EPT 误配置（见第 31.3.3.1 节）。当没有 EPT 误配置但 EPT 分页结构条目不允许使用客户物理地址的访问时，发生 EPT 违规（见第 31.3.3.2 节）。当逻辑处理器确定需要创建页修改日志条目且当前日志已满时，发生页修改日志已满事件（见第 31.3.6 节）。

这些事件仅由于尝试用客户物理地址访问内存而发生。用 MOV 到 CR3 指令用客户物理地址加载 CR3 直到该地址被用于访问分页结构前，都不能导致 EPT 配置或 EPT 违规。¹

如果"EPT-violation #VE" VM 执行控制为 1，某些 EPT 违规可能导致虚拟化异常而不是 VM 退出。见第 28.5.8.1 节。

#### 31.3.3.1 EPT 误配置

如果客户物理地址的转换遇到满足以下任何条件的 EPT 分页结构条目，发生 EPT 误配置：

-   条目的第 0 位被清除（指示不允许数据读）且以下任一成立：
    -   第 1 位被设置（指示允许数据写）。
    -   处理器不支持仅执行转换且以下任一成立：
        -   第 2 位被设置（指示允许指令获取）。²
        -   "mode-based execute control for EPT" VM 执行控制为 1 且第 10 位被设置（指示允许从用户模式线性地址进行指令获取）。  
            软件应读取 VMX 能力 MSR IA32_VMX_EPT_VPID_CAP 以确定是否支持仅执行转换（见附录 A.10）。

**表 31-7. 映射 4-KByte 页的 EPT 页表条目的格式**

| 位位置 | 内容  |
| --- | --- |
| 0   | 读访问；指示是否允许从此条目引用的 4-KByte 页读。 |
| 1   | 写访问；指示是否允许向此条目引用的 4-KByte 页写。 |
| 2   | 如果"mode-based execute control for EPT" VM 执行控制为 0，执行访问；指示是否允许从此条目控制的 4-KByte 页进行指令获取。  <br>如果该控制为 1，监管者模式线性地址的执行访问；指示是否允许从监管者模式线性地址在此条目控制的 4-KByte 页中进行指令获取。 |
| 5:3 | 此 4-KByte 页的 EPT 内存类型（见第 31.3.7 节）。 |
| 6   | 为此 4-KByte 页忽略 PAT 内存类型（见第 31.3.7 节）。 |
| 7   | 忽略。 |
| 8   | 如果 EPTP 的第 6 位为 1，EPT 的已访问标志；指示软件是否已访问此条目引用的 4-KByte 页（见第 31.3.5 节）。如果 EPTP 的第 6 位为 0，忽略。 |
| 9   | 如果 EPTP 的第 6 位为 1，EPT 的脏标志；指示软件是否已写入此条目引用的 4-KByte 页（见第 31.3.5 节）。如果 EPTP 的第 6 位为 0，忽略。 |
| 10  | 用户模式线性地址的执行访问。如果"mode-based execute control for EPT" VM 执行控制为 1，指示是否允许从用户模式线性地址在此条目控制的 4-KByte 页中进行指令获取。如果该控制为 0，此位被忽略。 |
| 11  | 忽略。 |
| M–1:12 | 此条目引用的 4-KByte 页的物理地址。¹ |
| 51:M | 保留（必须为 0）。 |
| 56:52 | 忽略。 |
| 57  | 验证客户分页。如果"guest-paging verification" VM 执行控制为 1，指示用于访问此条目控制的 4-KByte 页的客户分页结构的限制（见第 31.3.3.2 节）。如果该控制为 0，此位被忽略。 |
| 58  | 分页写访问。如果"EPT paging-write control" VM 执行控制为 1，指示客户分页可以更新此条目控制的 4-KByte 页（见第 31.3.3.2 节）。如果该控制为 0，此位被忽略。 |
| 59  | 忽略。 |
| 60  | 监管者影子栈。如果 EPTP 的第 7 位为 1，指示是否允许监管者影子栈访问此条目映射的 4-KByte 页中的客户物理地址（见第 31.3.3.2 节）。如果 EPTP 的第 7 位为 0，忽略。 |
| 61  | 子页写权限。如果"sub-page write permissions for EPT" VM 执行控制为 1，即使页正常不可写，也可能允许对此条目引用的 4-KByte 页的单独 128 字节区域的写（见第 31.3.4 节）。如果"sub-page write permissions for EPT" VM 执行控制为 0，此位被忽略。 |
| 62  | 忽略。 |
| 63  | 抑制 #VE。如果"EPT-violation #VE" VM 执行控制为 1，仅当此位为 0 时，由对此页的访问引起的 EPT 违规才能转换为虚拟化异常（见第 28.5.8.1 节）。如果"EPT-violation #VE" VM 执行控制为 0，此位被忽略。 |

注：

1.  M 是 MAXPHYADDR 的缩写。见第 31.3.1 节。

-   "EPT paging-write control" VM 执行控制为 1、条目映射页且第 58 位被设置（指示允许分页写）。
-   条目存在（见第 31.3.2 节）且以下任一成立：
    -   设置了保留位。这包括在 MAXPHYADDR 或以上位置（见第 31.3.1 节）设置范围 51:12 中的位。哪些位在哪些 EPT 分页结构条目中保留的细节见第 31.3.2 节。
    -   条目是用于转换客户物理地址的最后一个条目（位 7 设置为 1 的 EPT PDE 或 EPT PTE）且第 5:3 位（EPT 内存类型）的值为 2、3 或 7（这些值被保留）。

当 EPT 分页结构条目配置有保留用于未来功能性的设置时，导致 EPT 误配置。软件开发人员应意识到此类设置可能在未来被使用，且在一个处理器上导致 EPT 误配置的 EPT 分页结构条目在未来可能不这样做。

#### 31.3.3.2 EPT 违规

在使用其转换不导致 EPT 误配置的客户物理地址的访问期间，可能发生 EPT 违规。在以下任何情况下发生 EPT 违规：

-   客户物理地址的转换遇到不存在的 EPT 分页结构条目（见第 31.3.2 节）。
-   访问是数据读，且对于要读取的任何字节，用于转换该字节的客户物理地址的任何 EPT 分页结构条目中第 0 位（读访问）被清除。逻辑处理器为转换线性地址而对客户分页结构的读取被认为是数据读。

**图 31-1. EPTP 和 EPT 分页结构条目的格式**

（图注：图 31-1 给出 EPTP 和 EPT 分页结构条目的格式图示，包括 PML5E、PML4E、PDPTE（1GB 页 / 页目录）、PDE（2MB 页 / 页表）、PTE（4KB 页）的存在/不存在变体。以下注释放置）

注：

1.  M 是 MAXPHYADDR 的缩写。见第 31.3.1 节。
2.  监管者影子栈控制。
3.  EPTP 的细节见第 27.6.11 节。
4.  用户模式线性地址的执行访问。如果"mode-based execute control for EPT" VM 执行控制为 0，此位被忽略。
5.  执行访问。如果"mode-based execute control for EPT" VM 执行控制为 1，此位控制监管者模式线性地址的执行访问。
6.  如果"mode-based execute control for EPT" VM 执行控制为 1，如果第 2:0 位或第 10 位中的任何一个为 1，EPT 分页结构条目存在。此表未考虑该事实。
7.  抑制 #VE。如果"EPT-violation #VE" VM 执行控制为 0，此位被忽略。
8.  监管者影子栈页。如果 EPTP 的第 7 位为 0，此位被忽略。
9.  分页写访问。如果"EPT paging-write control" VM 执行控制为 0，此位被忽略。
10.  验证客户分页。如果"guest-paging verification" VM 执行控制为 0，此位被忽略。
11.  子页写权限。如果"sub-page write permissions for EPT" VM 执行控制为 0，此位被忽略。

-   访问是数据写，且对于要写入的任何字节，用于转换该字节的客户物理地址的任何 EPT 分页结构条目中第 1 位（写访问）被清除。逻辑处理器为更新已访问和脏标志而对客户分页结构的写被认为是数据写。  
    如果 EPT 指针（EPTP）的第 6 位为 1（为 EPT 启用已访问和脏标志），处理器对客户分页结构条目的访问在 EPT 违规方面被视为写。因此，如果用于转换客户分页结构条目的客户物理地址的任何 EPT 分页结构条目中第 1 位被清除，使用该条目转换线性地址的尝试导致 EPT 违规。  
    （这不适用于为 PAE 分页用 MOV 到 CR 指令加载 PDPTE 寄存器；见第 5.4.1 节。那些客户 PDPTE 的加载被视为读且不因客户物理地址不可写而导致的 EPT 违规。）  
    处理器为更新已访问和脏标志而对客户分页结构的写被称为分页写。（当为 EPT 启用已访问和脏标志时，处理器对客户分页结构的所有访问都被视为分页写。）如果"EPT paging-write control" VM 执行控制为 1，如果映射页的 EPT 分页结构条目中第 58 位（分页写访问）为 1，清除该条目中的写访问位不阻止分页写。（引用其他 EPT 分页结构的 EPT 分页结构条目不使用第 58 位，且仍然必须设置写访问位以允许分页写。）  
    如果"sub-page write permissions for EPT" VM 执行控制为 1，在某些情况下，会导致 EPT 违规（如上指示）的对客户物理地址的数据写不这样做。如果客户物理地址使用 4-KByte 页映射且用于映射该页的 EPT PTE 的第 61 位（子页写权限）为 1，可能允许对某些 128 字节子页的写。细节见第 31.3.4 节。
-   访问是指令获取且 EPT 分页结构阻止对所获取任何字节的执行访问。这是否发生取决于"mode-based execute control for EPT" VM 执行控制的设置：
    -   如果控制为 0，如果用于转换该字节的客户物理地址的任何 EPT 分页结构条目中第 2 位（执行访问）被清除，阻止从字节进行指令获取。
    -   如果控制为 1，在以下任一情况下阻止从字节进行指令获取：
        -   分页将字节的线性地址映射为监管者模式地址且用于转换该字节的客户物理地址的任何 EPT 分页结构条目中第 2 位（监管者模式线性地址的执行访问）被清除。  
            如果在控制线性地址转换的至少一个分页结构条目中 U/S 标志（第 2 位）为 0，分页将线性地址映射为监管者模式地址。
        -   分页将字节的线性地址映射为用户模式地址且用于转换该字节的客户物理地址的任何 EPT 分页结构条目中第 10 位（用户模式线性地址的执行访问）被清除。  
            如果在控制线性地址转换的所有分页结构条目中 U/S 标志为 1，分页将线性地址映射为用户模式地址。如果分页被禁用（CR0.PG = 0），每个线性地址都是用户模式地址。
-   如果监管者影子栈控制已启用（通过设置 EPTP 的第 7 位）、访问是监管者影子栈访问且用于转换访问的客户物理地址的 EPT 分页结构条目不允许监管者影子栈访问。如果以下任一成立，此类访问不被允许：
    -   用于转换访问的客户物理地址的任何 EPT 分页结构条目中第 0 位（读访问）被清除。
    -   在客户物理地址的转换中引用 EPT 分页结构的任何 EPT 分页结构条目中第 1 位（写访问）被清除。（清除映射客户物理地址页的 EPT 分页结构条目中的第 1 位不允许影子栈读和写。）
    -   映射客户物理地址页的 EPT 分页结构条目中第 60 位（监管者影子栈访问）被清除。  
        监管者影子栈控制和 EPT 分页结构条目中的监管者影子栈访问位不影响其他访问（包括用户影子栈访问）。
-   如果"guest-paging verification"和"EPT paging-write control" VM 执行控制都为 1，为与线性地址转换相关的某些访问执行客户分页验证。  
    具体来说，客户分页验证可能适用于使用客户物理地址访问为线性地址映射页的客户分页结构条目（见第 5 章"Paging"）。如果为该客户物理地址映射页的 EPT 分页结构条目中第 57 位（验证客户分页）被设置，它适用。  
    当发生客户分页验证时，如果在转换原始线性地址期间使用的任何客户分页结构条目的客户物理地址用于映射页的 EPT 分页结构条目中第 58 位（分页写访问）被清除，存在 EPT 违规。¹  
    关于此类 EPT 违规相对于由于对被转换线性地址的原始引用可能发生的任何页错误的优先级的细节，见第 31.3.3.3 节。

#### 31.3.3.3 EPT 误配置和 EPT 违规的优先级

线性地址到物理地址的转换需要使用 EPT 一次或多次转换客户物理地址（见第 31.3.1 节）。本节指定 EPT 引起的 VM 退出相对于彼此以及相对于使用线性地址访问内存时可能遇到的其他事件的相对优先级。

对于对客户物理地址的访问，是否发生 EPT 误配置或 EPT 违规基于迭代过程确定：²

1.  读取 EPT 分页结构条目（最初，这是 EPT PML5 条目或 EPT PML4 条目）：  
    a. 如果条目不存在（见第 31.3.2 节），发生 EPT 违规。  
    b. 如果条目存在但其内容未正确配置（见第 31.3.3.1 节），发生 EPT 误配置。  
    c. 如果条目存在且其内容正确配置，操作取决于条目是否引用另一 EPT 分页结构（或者它反而是位 7 设置为 1 的 EPT PDPTE 或 EPT PDE，或 EPT PTE）：  
    i) 如果条目确实引用另一 EPT 分页结构，访问来自该结构的条目；为该其他条目执行步骤 1。  
    ii) 否则，条目被用于产生最终物理地址（原始客户物理地址的转换）；执行步骤 2。
2.  一旦确定最终物理地址，评估由 EPT 分页结构条目确定的特权：  
    a. 如果这些特权不允许对客户物理地址的访问（见第 31.3.3.2 节），发生 EPT 违规。  
    b. 如果这些特权允许对客户物理地址的访问，使用最终物理地址访问内存。

如果 CR0.PG = 1，线性地址的转换也是迭代过程，处理器首先访问由 CR3 中客户物理地址引用的客户分页结构中的条目，³ 然后访问由第一个客户分页结构条目中客户物理地址引用的另一客户分页结构中的条目，等等。每个客户物理地址本身使用 EPT 转换且可能引起 EPT 引起的 VM 退出。以下条目详述在此迭代过程中如何识别页错误和 EPT 引起的 VM 退出：

1.  尝试用客户物理地址访问客户分页结构条目（最初，CR3 中的地址）：  
    a. 如果访问因 EPT 误配置或 EPT 违规（见上文）而失败，发生 EPT 引起的 VM 退出。  
    b. 如果访问不引起 EPT 引起的 VM 退出，转换继续。如果客户分页验证已启用（见第 31.3.3.2 节），处理器注意用于为客户物理地址映射页的 EPT 分页结构条目是否设置第 58 位（分页写）。然后，查阅客户分页结构条目的第 0 位（存在标志）：  
    i) 如果存在标志为 0 或设置了任何保留位，发生页错误。  
    ii) 如果存在标志为 1、没有设置保留位，操作取决于条目是否引用另一客户分页结构（它是否是 PS = 1 的客户 PDE 或客户 PTE）：  
    \- 如果条目确实引用另一客户分页结构，访问来自该结构的条目；为该其他条目执行步骤 1。  
    \- 否则，条目被用于产生最终客户物理地址（原始线性地址的转换）；执行步骤 2。
2.  一旦确定最终客户物理地址，评估由客户分页结构条目确定的特权：  
    a. 如果这些特权不允许对线性地址的访问（例如，它是对只读页的写），发生页错误。  
    b. 如果这些特权允许对线性地址的访问，尝试在最终客户物理地址处访问内存：  
    i) 如果访问因 EPT 误配置或 EPT 违规（见上文）而失败，发生 EPT 引起的 VM 退出。正是在此时，使用在上面步骤 1b 的发生时注意到的分页写位执行客户分页验证（如果启用）（客户分页验证的细节见第 31.3.3.2 节）。  
    ii) 如果访问不引起 EPT 引起的 VM 退出，使用最终物理地址（最终客户物理地址使用 EPT 的转换）访问内存。

如果 CR0.PG = 0，线性地址被视为客户物理地址并使用 EPT 转换（见上文）。此过程如果无 EPT 违规或 EPT 误配置地完成，产生物理地址并确定 EPT 分页结构条目允许的特权。如果这些特权不允许对物理地址的访问（见第 31.3.3.2 节），发生 EPT 违规。否则，使用物理地址访问内存。

### 31.3.4 子页写权限

第 31.3.3.2 节解释 EPT 如何使用 EPT 违规实施对客户物理地址的访问权。由于这些访问权使用用于转换客户物理地址的 EPT 分页结构条目确定，它们的粒度限于用于映射页（1-GByte、2-MByte 或 4-KByte）的粒度。

子页写权限特性允许以更细的粒度控制对客户物理地址的写访问。子页写权限允许以自然对齐的 128 字节子页的粒度控制写访问。具体来说，该特性允许对本来不可写的 4-KByte 页的选定子页的写。

子页写权限通过将"sub-page write permissions for EPT" VM 执行控制设置为 1 启用。本节剩余部分描述使用此控制设置时处理器操作的变化。

第 31.3.4.1 节标识有资格进行子页写权限的数据访问。第 31.3.4.2 节解释处理器如何确定是否允许此类访问。

#### 31.3.4.1 有资格进行子页写权限的写访问

如果对客户物理地址的写按第 31.3.3.2 节会被不允许（用于转换客户物理地址的任何 EPT 分页结构条目中第 1 位（写访问）被清除），该地址有资格进行子页写权限。因其他原因写会被不允许的客户物理地址（例如，转换遇到不存在的 EPT 分页结构条目）没有资格进行子页写权限。

此外，仅当客户物理地址使用 4-KByte 页映射且用于映射该页的 EPT PTE 的第 61 位（子页写权限）为 1 时，它才有资格进行子页写权限。（用更大页映射的客户物理地址没有资格进行子页写权限。）

对于某些内存访问，处理器忽略用于映射 4-KByte 页的 EPT PTE 中的第 61 位且不向访问应用子页写权限。（在这种情况下，当第 31.3.3.2 节给出的条件指示时，访问导致 EPT 违规。）子页写权限从不适用于以下访问：

-   事务区域内执行的写访问。
-   飞地对 ELRANGE 内地址的写访问。（子页写权限可能适用于飞地对 ELRANGE 外地址的写访问。）
-   Intel SGX 指令对飞地页缓存（EPC）的写访问。
-   为架构 PEBS 执行的写访问。
-   为更新已访问或脏标志而对客户分页结构的写访问。
-   当为 EPT 启用已访问和脏标志时，处理器对客户分页结构条目的访问（此类访问在 EPT 违规方面被视为写）。

还有可能不应用子页写权限的额外访问（行为是特定于型号的）。以下条目枚举示例：

-   跨越两个 4-KByte 页的写访问。在这种情况下，子页权限可能应用于两个页中的任何一个或都不应用。（除非写对两个页都被允许，否则没有对任一页的写。）
-   执行多个写访问的指令的写访问（子页写权限主要旨在用于基本指令，如 AND、MOV、OR、TEST、XCHG 和 XOR）。

如果客户物理地址有资格进行子页写权限，处理器使用第 31.3.4.2 节描述的过程确定是否允许对地址的写。

如果客户物理地址有资格进行子页写权限且该地址转换到 APIC-access 页上的地址（见第 32.4 节），处理器可能将对地址的写访问视为"virtualize APIC accesses" VM 执行控制为 0。因此，建议软件不要配置任何转换到 APIC-access 页上地址的客户物理地址有资格进行子页写权限。

#### 31.3.4.2 确定访问的子页写权限

子页写权限单独控制对 4-KByte 页的 32 个 128 字节子页中的每一个的写访问。客户物理地址的第 11:7 位标识子页。

对于每个有资格进行子页写权限的客户物理地址，有 64 位子页权限向量（SPP 向量）。4-KByte 页上的所有地址使用相同的 SPP 向量。如果地址的子页号（地址的第 11:7 位）为 S，当且仅当子页权限的第 2S 位被设置为 1 时，允许对地址的写。（SPP 向量中奇数位置的位不被使用且必须为零。）

每个页的 SPP 向量位于内存中。对于对有资格进行子页写权限的客户物理地址的写，处理器使用以下过程定位地址的 SPP 向量：

1.  SPPTP（子页权限表指针）VM 执行控制字段包含 4-KByte 根 SPP 表（SSPL4 表）的物理地址。客户物理地址的第 47:39 位标识该表中的 64 位条目，称为 SPPL4E。
2.  4-KByte SPPL3 表位于所选 SPPL4E 中的物理地址处。客户物理地址的第 38:30 位标识该表中的 64 位条目，称为 SPPL3E。
3.  4-KByte SPPL2 表位于所选 SPPL3E 中的物理地址处。客户物理地址的第 29:21 位标识该表中的 64 位条目，称为 SPPL2E。
4.  4-KByte SPP 向量表（SSPL1 表）位于所选 SPPL2E 中的物理地址处。客户物理地址的第 20:12 位标识地址的 64 位 SPP 向量。如前所述，子页权限向量的第 2S 位确定地址是否可以被写入，其中 S 是地址第 11:7 位的值。

（用于访问这些表的内存类型在 IA32_VMX_BASIC MSR 的第 53:50 位中报告。见附录 A.1。）

对单个 4-KByte 页上多个 128 字节子页的写访问仅当页的 SPP 向量中那些子页中每一个的指示位被设置为 1 时才被允许。以下条目适用于访问写入两个 4-KByte 页的情况：

-   如果对任一页的写按第 31.3.3.2 节会被不允许，即使该页的客户物理地址有资格进行子页写权限，访问也可能被不允许。（此行为是特定于型号的。）
-   仅当对于每个页，（1）对页的写按第 31.3.3.2 节会被允许；或（2）（a）该页的客户物理地址有资格进行子页写权限；且（b）页的子页向量允许写（如上所述），访问才被允许。

每个条目（SPPL4E、SPPL3E 或 SPPL2E）的第 0 位是条目的有效位。如果上面的过程访问此位为 0 的条目，过程停止且逻辑处理器招致 SPP 未命中。

在每个条目（SPPL4E、SPPL3E 或 SPPL2E）中，第 11:1 位被保留，第 63:MAXPHYADDR 位也被保留（见第 31.3.1 节）。如果上面的过程访问有效位为 1 且设置了某些保留位的条目，过程停止且逻辑处理器招致 SPP 误配置。SPP 向量中奇数位置的位

也被保留；如果最终 SPP 向量中设置了其中任何一个位，也发生 SPP 误配置。  
SPP 未命中和 SPP 误配置被称为 SPP 相关事件并导致 VM 退出。

### 31.3.5 EPT 的已访问和脏标志

Intel 64 架构在普通分页结构条目中支持已访问和脏标志（见第 5.8 节）。某些处理器也在 EPT 分页结构条目中支持相应的标志。软件应读取 VMX 能力 MSR IA32_VMX_EPT_VPID_CAP（见附录 A.10）以确定处理器是否支持此特性。

软件可以使用扩展页表指针（EPTP）的第 6 位（VM 执行控制字段，见第 27.6.11 节中的表 27-9）为 EPT 启用已访问和脏标志。如果此位为 1，处理器将如下所述设置 EPT 的已访问和脏标志。此外，设置此标志导致处理器对客户分页结构条目的访问被视为写（见下文和第 31.3.3.2 节）。

对于在客户物理地址转换期间使用的任何 EPT 分页结构条目，第 8 位是已访问标志。对于映射页（相对于引用另一 EPT 分页结构）的 EPT 分页结构条目，第 9 位是脏标志。

每当处理器使用 EPT 分页结构条目作为客户物理地址转换的一部分时，它设置该条目中的已访问标志（如果尚未设置）。

每当对客户物理地址有写时，处理器在标识客户物理地址的最终物理地址的 EPT 分页结构条目（EPT PTE 或位 7 为 1 的 EPT 分页结构条目）中设置脏标志（如果尚未设置）。

当为 EPT 启用已访问和脏标志时，处理器对客户分页结构条目的访问被视为写（见第 31.3.3.2 节）。因此，此类访问将导致处理器在标识客户分页结构条目的最终物理地址的 EPT 分页结构条目中设置脏标志。

（这不适用于为 PAE 分页用 MOV 到 CR 指令加载 PDPTE 寄存器；见第 5.4.1 节。那些客户 PDPTE 的加载被视为读且不导致处理器在任何 EPT 分页结构条目中设置脏标志。）

这些标志是"粘性的"，意味着一旦设置，处理器不清除它们；只有软件可以清除它们。

处理器可以在 TLB 和分页结构缓存中缓存来自 EPT 分页结构条目的信息（见第 31.4 节）。此事实意味着，如果软件将已访问标志或脏标志从 1 改为 0，处理器可能不会在后续使用受影响客户物理地址的访问时在内存中设置相应位。

### 31.3.6 页修改日志记录

当为 EPT 启用已访问和脏标志时，软件可以使用称为页修改日志记录的特性跟踪对客户物理地址的写。

软件可以通过设置"enable PML" VM 执行控制（见第 27.6.2 节中的表 27-7）启用页修改日志记录。当此控制为 1 时，处理器如下所述向页修改日志添加条目。页修改日志是位于 PML address VM 执行控制字段中物理地址处的 4-KByte 内存区域。页修改日志由 512 个 64 位条目组成；PML index VM 执行控制字段指示下一个要使用的条目。

在允许客户物理访问之前，处理器可能确定它首先需要为 EPT 设置已访问或脏标志（见第 31.3.5 节）。当发生这种情况时，处理器检查 PML 索引。如果 PML 索引不在 0–511 范围内，存在页修改日志已满事件且发生 VM 退出。在这种情况下，已访问或脏标志不被设置，且触发该事件的客户物理访问不发生。

如果 PML 索引在 0–511 范围内，处理器继续按第 31.3.5 节所述更新 EPT 的已访问或脏标志。如果处理器更新了 EPT 的脏标志（将其从 0 改为 1），它然后按如下操作：

1.  访问的客户物理地址被写入页修改日志。具体来说，客户物理地址被写入由将 PML 索引的 8 倍加到 PML 地址确定的物理地址。写入值的第 11:0 位总是为 0（因此写入的客户物理地址是 4-KByte 对齐的）。
2.  PML 索引减 1（这可能导致值从 0 转换到 FFFFH）。

由于处理器随每个日志条目递减 PML 索引，值可能从 0 转换到 FFFFH。在那时，不会发生进一步日志记录，因为处理器将确定 PML 索引不在 0–511 范围内并将生成页修改日志已满事件（见上文）。

### 31.3.7 EPT 和内存类型化

本节指定当使用 EPT 时逻辑处理器如何确定内存访问使用的内存类型。（Intel 64 架构中内存类型化的细节见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 14 章"Memory Cache Control"。）第 31.3.7.1 节解释如何为对 EPT 分页结构的访问确定内存类型。第 31.3.7.2 节解释如何为使用使用 EPT 转换的客户物理地址的访问确定内存类型。

#### 31.3.7.1 用于访问 EPT 分页结构的内存类型

本节解释如何为对 EPT 分页结构的访问确定内存类型。确定首先基于控制寄存器 CR0 中第 30 位（缓存禁用——CD）的值：

-   如果 CR0.CD = 0，用于任何此类引用的内存类型是 EPT 分页结构内存类型，它在扩展页表指针（EPTP）的第 2:0 位中指定（VM 执行控制字段，见第 27.6.11 节）。值 0 指示不可缓存类型（UC），而值 6 指示写回类型（WB）。其他值被保留。
-   如果 CR0.CD = 1，用于任何此类引用的内存类型是不可缓存（UC）。

MTRR 对用于访问 EPT 分页结构的内存类型没有影响。

#### 31.3.7.2 用于转换的客户物理地址的内存类型

使用客户物理地址的内存访问（使用 EPT 转换的访问）的有效内存类型是用于访问内存的内存类型。有效内存类型基于控制寄存器 CR0 中第 30 位（缓存禁用——CD）的值；用于转换客户物理地址的最后一个 EPT 分页结构条目（位 7 设置为 1 的 EPT PDE 或 EPT PTE）；和 PAT 内存类型（见下文）：

-   **PAT 内存类型** 取决于 CR0.PG 的值：
    -   如果 CR0.PG = 0，PAT 内存类型是 WB（写回）。¹
    -   如果 CR0.PG = 1，PAT 内存类型是从 IA32_PAT MSR 按第 14.12.3 节"Selecting a Memory Type from the PAT"指定的选择的内存类型。²
-   **EPT 内存类型** 在最后一个 EPT 分页结构条目的第 5:3 位中指定：0 = UC；1 = WC；4 = WT；5 = WP；和 6 = WB。其他值被保留并导致 EPT 误配置（见第 31.3.3 节）。
-   如果 CR0.CD = 0，有效内存类型取决于最后一个 EPT 分页结构条目中第 6 位的值：
    -   如果值为 0，有效内存类型是第 14.5.2.2 节中表 14-7 指定的 EPT 内存类型和 PAT 内存类型的组合，使用 EPT 内存类型代替 MTRR 内存类型。
    -   如果值为 1，用于访问的内存类型是 EPT 内存类型。PAT 内存类型被忽略。
-   如果 CR0.CD = 1，有效内存类型是 UC。

MTRR 对用于访问客户物理地址的内存类型没有影响。

## 31.4 缓存转换信息

支持 Intel® 64 和 IA-32 架构的处理器可以通过在处理器上缓存来自控制该过程的内存中结构的数据来加速地址转换过程。此类缓存在《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 5.10 节"Caching Translation Information"中讨论。当前节描述此缓存如何与 VMX 架构交互。

VMX 操作架构的 VPID 和 EPT 特性增强此缓存架构。EPT 定义客户物理地址空间并定义到该地址空间（来自线性地址空间）和从该地址空间（到物理地址空间）的转换。两个特性都控制逻辑处理器可以创建和使用从分页结构缓存的信息的方式。

第 31.4.1 节描述可以被缓存的不同种类信息。第 31.4.2 节指定何时可以缓存此类信息以及如何使用它。第 31.4.3 节详述软件如何使缓存的信息无效。

### 31.4.1 可以被缓存的信息

《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 5.10 节"Caching Translation Information"标识逻辑处理器可以缓存的两种与转换相关的信息：转换（从线性页号到物理页帧的映射）和分页结构缓存（将线性页号的高位映射到用于转换匹配那些高位的线性地址的分页结构条目中的信息）。

当使用 VPID 和 EPT 时，可以缓存相同种类的信息。逻辑处理器可以基于其功能缓存和使用此类信息。具有不同功能的信息标识如下：

-   **线性映射**。¹ 有两种：
    -   **线性转换**。每一个是从线性页号到其转换到的物理页帧的映射，以及关于访问特权和内存类型化的信息。
    -   **线性分页结构缓存条目**。每一个是从线性地址的高部分到用于转换线性地址空间相应区域的分页结构的物理地址的映射，以及关于访问特权的信息。例如，线性地址的第 47:39 位将映射到相关页目录指针表的地址。  
        线性映射不包含来自任何 EPT 分页结构的信息。
-   **客户物理映射**。² 有两种：
    -   **客户物理转换**。每一个是从客户物理页号到其转换到的物理页帧的映射，以及关于访问特权和内存类型化的信息。
    -   **客户物理分页结构缓存条目**。每一个是从客户物理地址的高部分到用于转换客户物理地址空间相应区域的 EPT 分页结构的物理地址的映射，以及关于访问特权的信息。  
        客户物理映射中关于访问特权和内存类型化的信息来自 EPT 分页结构。
-   **组合映射**。³ 有两种：
    -   **组合转换**。每一个是从线性页号到其转换到的物理页帧的映射，以及关于访问特权和内存类型化的信息。
    -   **组合分页结构缓存条目**。每一个是从线性地址的高部分到用于转换线性地址空间相应区域的分页结构的物理地址的映射，以及关于访问特权的信息。  
        组合映射中关于访问特权和内存类型化的信息来自客户分页结构和 EPT 分页结构两者。

客户物理映射和组合映射也可能包括 SPP 向量和关于用于定位 SPP 向量的数据结构的信息（见第 31.3.4.2 节）。

### 31.4.2 创建和使用缓存的转换信息

以下条目详述前节描述的映射的创建：⁴

-   以下条目描述在未使用 EPT 时（包括在 VMX 非根操作之外执行）映射的创建：
    -   可以创建线性映射。它们来自（直接或间接）由 CR3 当前值引用的分页结构，且与当前 VPID 和当前 PCID 关联。
    -   不使用来自不存在（第 0 位为 0）或设置保留位的分页结构条目推导的信息创建线性映射。例如，如果 PTE 不存在，不为任何其转换会使用该 PTE 的线性页号创建线性映射。
    -   在未使用 EPT 时不创建客户物理或组合映射。
-   以下条目描述在使用 EPT 时映射的创建：
    -   可以创建客户物理映射。它们来自（直接或间接）由当前 EPTP 第 51:12 位引用的 EPT 分页结构。这 40 位包含 EPT 根表（使用 4 级 EPT 为 EPT PML4 表或使用 5 级 EPT 为 EPT PML5 表）的地址；记号 EPTRTA 指那 40 位。新创建的客户物理映射与当前 EPTRTA 关联。
    -   可以创建组合映射。它们来自（直接或间接）由当前 EPTRTA 引用的 EPT 分页结构。如果 CR0.PG = 1，它们也来自（直接或间接）由 CR3 当前值引用的分页结构。它们与当前 VPID、当前 PCID 和当前 EPTRTA 关联。¹ 如果 CR0.PG = 0，不创建组合分页结构缓存条目。²
    -   不使用来自不存在（见第 31.3.2 节）或误配置（见第 31.3.3.1 节）的 EPT 分页结构条目推导的信息创建客户物理映射或组合映射。
    -   不使用来自不存在或设置保留位的客户分页结构条目推导的信息创建组合映射。
    -   在使用 EPT 时不创建线性映射。

如第 35.3.2 节所解释，SEAM 非根操作中的地址转换不同：SEAM 客户私有地址的转换使用 EPTP（如 VMX 非根操作中所做）；SEAM 客户共享地址的转换使用 SEAM 共享 EPT 指针（不同的 VMCS 字段）。尽管如此，在 SEAM 非根操作中创建和使用的所有客户物理映射和组合映射（包括 SEAM 客户共享地址的那些）与当前 EPTRTA（从 EPTP 推导）关联。

以下条目详述各种映射的使用：

-   如果未使用 EPT（例如，在 VMX 非根操作之外），逻辑处理器可以按如下方式使用缓存的映射：
    -   对于使用线性地址的访问，它可以用于当前 VPID 和当前 PCID 关联的线性映射。它也可以用于当前 VPID 和任何 PCID 关联的全局 TLB 条目（线性映射）。
    -   在未使用 EPT 时不使用客户物理或组合映射。
-   如果使用 EPT，逻辑处理器可以按如下方式使用缓存的映射：
    -   对于使用线性地址的访问，它可以用于当前 VPID、当前 PCID 和当前 EPTRTA 关联的组合映射。它也可以用于当前 VPID、当前 EPTRTA 和任何 PCID 关联的全局 TLB 条目（组合映射）。
    -   对于使用客户物理地址的访问，它可以用于当前 EPTRTA 关联的客户物理映射。
    -   在使用 EPT 时不使用线性映射。

### 31.4.3 使缓存的转换信息无效

软件对分页结构（包括 EPT 分页结构和用于定位 SPP 向量的数据结构）的修改可能导致那些结构与逻辑处理器缓存的映射之间的不一致。某些操作使逻辑处理器缓存的信息无效，可以用于消除此类不一致。

#### 31.4.3.1 使缓存映射无效的操作

以下操作按指示使缓存的映射无效：

-   独立于 VMX 操作在架构上使 TLB 或分页结构缓存中的条目无效的操作（例如，INVLPG 和 INVPCID 指令）使线性映射和组合映射无效。³ 它们只需要为当前 VPID 这样做（但对于组合映射，为所有 EPTRTA）。即使使用 EPT，当前 VPID 的线性映射也被使无效。¹ 即使未使用 EPT，当前 VPID 的组合映射也被使无效。²
-   EPT 违规使任何本会用于转换导致 EPT 违规的客户物理地址的客户物理映射（与当前 EPTRTA 关联的）无效。如果该客户物理地址是线性地址的转换，EPT 违规也使与当前 PCID、当前 VPID 和当前 EPTRTA 关联的该线性地址的任何组合映射无效。
-   如果"enable VPID" VM 执行控制为 0，VM 进入和 VM 退出使与 VPID 0000H 关联的线性映射和组合映射无效（对所有 PCID）。VPID 0000H 的组合映射对所有 EPTRTA 无效。³
-   INVVPID 指令的执行使线性映射和组合映射无效。无效基于指令操作数，称为 INVVPID 类型和 INVVPID 描述符。当前定义了四种 INVVPID 类型：
    -   **单地址（Individual-address）**。如果 INVVPID 类型为 0，逻辑处理器使与 INVVPID 描述符中指定的 VPID 关联且本会用于转换 INVVPID 描述符中指定的线性地址的线性映射和组合映射无效。该 VPID 和线性地址的线性映射和组合映射对所有 PCID 且对于组合映射对所有 EPTRTA 无效。（指令也可能使与其他 VPID 关联和用于其他线性地址的映射无效。）
    -   **单上下文（Single-context）**。如果 INVVPID 类型为 1，逻辑处理器使与 INVVPID 描述符中指定的 VPID 关联的所有线性映射和组合映射无效。该 VPID 的线性映射和组合映射对所有 PCID 且对于组合映射对所有 EPTRTA 无效。（指令也可能使与其他 VPID 关联的映射无效。）
    -   **全上下文（All-context）**。如果 INVVPID 类型为 2，逻辑处理器使与除 VPID 0000H 外的所有 VPID 和所有 PCID 关联的线性映射和组合映射无效。（指令也可能使 VPID 0000H 的线性映射无效。）组合映射对所有 EPTRTA 无效。
    -   **保留全局的单上下文（Single-context-retaining-globals）**。如果 INVVPID 类型为 3，逻辑处理器使与 INVVPID 描述符中指定的 VPID 关联的线性映射和组合映射无效。该 VPID 的线性映射和组合映射对所有 PCID 且对于组合映射对所有 EPTRTA 无效。逻辑处理器不需要使用于全局转换的信息无效（虽然它可以这样做）。全局转换的细节见第 5.10 节"Caching Translation Information"。（指令也可能使与其他 VPID 关联的映射无效。）  
        INVVPID 指令的细节见第 33 章。此指令使用指南见第 31.4.3.3 节。⁴
-   INVEPT 指令的执行使客户物理映射和组合映射无效。无效基于指令操作数，称为 INVEPT 类型和 INVEPT 描述符。当前定义了两种 INVEPT 类型：
    -   **单上下文（Single-context）**。如果 INVEPT 类型为 1，逻辑处理器使与 INVEPT 描述符中指定的 EPTRTA 关联的所有客户物理映射和组合映射无效。该 EPTRTA 的组合映射对所有 VPID 和所有 PCID 无效。（指令可能使与其他 EPTRTA 关联的映射无效。）
        
    -   **全上下文（All-context）**。如果 INVEPT 类型为 2，逻辑处理器使与所有 EPTRTA 关联的客户物理映射和组合映射无效（且对于组合映射，为所有 VPID 和 PCID）。  
        INVEPT 指令的细节见第 33 章。此指令使用指南见第 31.4.3.4 节。¹
        
-   上电或复位使所有线性映射、客户物理映射和组合映射无效。

#### 31.4.3.2 不需要使缓存映射无效的操作

以下条目详述不需要使某些缓存映射无效的操作情况：

-   独立于 VMX 操作在架构上使 TLB 或分页结构缓存中的条目无效的操作不需要使任何客户物理映射无效。
-   INVVPID 指令不需要使任何客户物理映射无效。
-   INVEPT 指令不需要使任何线性映射无效。
-   VMX 转换不需要使任何客户物理映射无效。如果"enable VPID" VM 执行控制为 1，VMX 转换不需要使任何线性映射或组合映射无效。
-   VMXOFF 和 VMXON 指令不需要使任何线性映射、客户物理映射或组合映射无效。

逻辑处理器可以在任何时间使任何缓存的映射无效。因此，上面标识的操作可能使指示的映射无效，尽管不需要这样做。

#### 31.4.3.3 INVVPID 指令使用指南

VMM 软件使用 INVVPID 指令的需要取决于该软件如何虚拟化内存。如果未使用 EPT，VMM 很可能在虚拟化客户分页结构。此类 VMM 可以配置 VMCS，使得使 TLB 和分页结构缓存中的条目无效的所有或某些操作（例如，INVLPG 指令）导致 VM 退出。如果 VMM 软件正在仿真这些操作，可能需要使用 INVVPID 指令以确保逻辑处理器的 TLB 和分页结构缓存被适当地使无效。

软件何时应使用 INVVPID 指令的要求取决于用于页表虚拟化的特定算法。以下条目为软件开发人员提供指南：

-   INVLPG 指令的仿真可能需要如下执行 INVVPID 指令：
    -   INVVPID 类型为单地址（0）。
    -   INVVPID 描述符中的 VPID 是分配给其执行正被仿真的虚拟处理器的那个。
    -   INVVPID 描述符中的线性地址是被仿真的 INVLPG 指令的操作数的那一个。
-   某些指令使 TLB 和分页结构缓存中的所有条目无效——除了全局转换。一个例子是 MOV 到 CR3 指令。（全局转换的细节见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 5.10 节"Caching Translation Information"。）此类指令的仿真可能需要如下执行 INVVPID 指令：
    -   INVVPID 类型为保留全局的单上下文（3）。
    -   INVVPID 描述符中的 VPID 是分配给其执行正被仿真的虚拟处理器的那个。
-   某些指令使 TLB 和分页结构缓存中的所有条目无效——包括全局转换。一个例子是如果第 4 位（页全局启用——PGE）的值正在改变的 MOV 到 CR4 指令。此类指令的仿真可能需要如下执行 INVVPID 指令：
    -   INVVPID 类型为单上下文（1）。
    -   INVVPID 描述符中的 VPID 是分配给其执行正被仿真的虚拟处理器的那个。

如果未使用 EPT，逻辑处理器将其创建的所有映射与当前 VPID 关联，且它将使用此类映射转换线性地址。因此，VMM 不应为使用不同页表的不同非 EPT 客户使用相同的 VPID。这样做可能导致一个客户使用与另一个相关的转换。

如果使用 EPT，上面枚举的指令可能未被配置为导致 VM 退出且 VMM 可能未在仿真它们。在这种情况下，客户软件对指令的执行正确使 TLB 和分页结构缓存中的所需条目无效（见第 31.4.3.1 节）；不需要执行 INVVPID 指令。

如果使用 EPT，逻辑处理器将其创建的所有映射与当前 EPTP 第 51:12 位的值关联。如果 VMM 为不同客户使用不同 EPTP 值，它可以为那些客户使用相同的 VPID。这样做不能导致一个客户使用与另一个相关的转换。

以下指南更普遍适用，且即使使用 EPT 也合适：

-   如第 32.4.5 节详述，如果软件不适当使可能从分页结构缓存的信息无效，对 APIC-access 页的访问可能不导致 APIC-access VM 退出。如果在一时间逻辑处理器上的当前 VPID 是非零值 X，建议软件在同一个逻辑处理器上建立 VPID X 且（a）"virtualize APIC accesses" VM 执行控制从 0 改为 1；或（b）APIC-access 地址的值被改变的 VM 进入之前，使用带"single-context" INVVPID 类型且 INVVPID 描述符中 VPID X 的 INVVPID 指令。
-   软件可以在 VMXON 指令执行后立即或 VMXOFF 指令执行前立即使用带"all-context" INVVPID 类型的 INVVPID 指令。两者都防止在 VMX 操作的单独使用之间可能不希望地从分页结构缓存的信息保留。

#### 31.4.3.4 INVEPT 指令使用指南

以下条目提供使用 INVEPT 指令使从 EPT 分页结构缓存的信息无效的指南。

-   软件在以下任一更改之后应使用带"single-context" INVEPT 类型的 INVEPT 指令（INVEPT 描述符应包含——直接或间接——引用被修改 EPT 分页结构的 EPTP 值）：
    -   将特权位 2:0 中的任何一个从 1 改为 0。¹
    -   更改第 51:12 位中的物理地址。
    -   如果将为 EPT 启用已访问和脏标志，清除第 8 位（已访问标志）。
    -   对于 EPT PDPTE 或 EPT PDE，更改第 7 位（确定条目是否映射页）。
    -   对于用于转换客户物理地址的最后一个 EPT 分页结构条目（位 7 设置为 1 的 EPT PDPTE、位 7 设置为 1 的 EPT PDE 或 EPT PTE），更改第 5:3 位或第 6 位。（这些位确定使用该 EPT 分页结构条目的访问的有效内存类型；见第 31.3.7 节。）
    -   对于用于转换客户物理地址的最后一个 EPT 分页结构条目（位 7 设置为 1 的 EPT PDPTE、位 7 设置为 1 的 EPT PDE 或 EPT PTE），如果将为 EPT 启用已访问和脏标志，清除第 9 位（脏标志）。
-   软件应在带 EPTP 值 X 的 VM 进入之前使用带"single-context" INVEPT 类型的 INVEPT 指令，如果逻辑处理器早些时候在带 EPTP 值 Y 的 VMX 非根操作中且 Y\[6\] = 0（未为 EPT 启用已访问和脏标志）且 Y\[51:12\] = X\[51:12\]，使得 X\[6\] = 1（为 EPT 启用已访问和脏标志）。
-   软件应在带 EPTP 值 X 的 VM 进入之前使用带"single-context" INVEPT 类型的 INVEPT 指令，如果逻辑处理器早些时候在带 EPTP 值 Y 的 VMX 非根操作中且 Y\[5:3\] ≠ X\[5:3\]（不同 EPT 页遍历长度）且 Y\[51:12\] = X\[51:12\]。
-   软件可以在修改存在的 EPT 分页结构条目（见第 31.3.2 节）以将特权位 2:0 中的任何一个从 0 改为 1 之后使用 INVEPT 指令。¹ 不这样做可能导致本来不会发生的 EPT 违规。由于 EPT 违规使任何本会由导致 EPT 违规的访问使用的映射无效（见第 31.4.3.1 节），即使不执行 INVEPT 指令，如果原始访问再次执行，EPT 违规也不会复发。
-   由于逻辑处理器不缓存来自不存在（见第 31.3.2 节）或误配置（见第 31.3.3.1 节）的 EPT 分页结构条目推导的任何信息，在修改一直不存在或误配置的 EPT 分页结构条目后没有必要执行 INVEPT。
-   如第 32.4.5 节详述，如果软件不适当使可能从 EPT 分页结构缓存的信息无效，对 APIC-access 页的访问可能不导致 APIC-access VM 退出。如果 EPT 在一时间在带 EPTP X 的逻辑处理器上使用，建议软件在同一个逻辑处理器上用 EPTP X 启用 EPT 且（a）"virtualize APIC accesses" VM 执行控制从 0 改为 1；或（b）APIC-access 地址的值被改变的 VM 进入之前，使用带"single-context" INVEPT 类型且 INVEPT 描述符中 EPTP X 的 INVEPT 指令。
-   软件可以在 VMXON 指令执行后立即或 VMXOFF 指令执行前立即使用带"all-context" INVEPT 类型的 INVEPT 指令。两者都防止在 VMX 操作的单独使用之间可能不希望地从 EPT 分页结构缓存的信息保留。

在包含多个逻辑处理器的系统中，软件必须考虑到来自 EPT 分页结构条目的信息可能缓存在除修改该条目的那个之外的其他逻辑处理器上。将分页结构条目的更改传播到多个处理器的过程通常称为"TLB shootdown"。TLB shootdown 的讨论见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 5.10.5 节"Propagation of Paging-Structure Changes to Multiple Processors"。

## 第 32 章 APIC 虚拟化和虚拟中断

VMCS 包括启用中断和高级可编程中断控制器（APIC）虚拟化的控制。

当使用这些控制时，处理器将在 VMX 非根操作中无 VM 退出地仿真对 APIC 的许多访问、跟踪虚拟 APIC 的状态并交付虚拟中断。¹

处理器使用由虚拟机监视器（VMM）标识的虚拟 APIC 页跟踪虚拟 APIC 的状态。第 32.1 节讨论虚拟 APIC 页以及处理器如何使用它跟踪虚拟 APIC 的状态。

以下是与 APIC 虚拟化和虚拟中断相关的 VM 执行控制（这些控制的位置信息见第 27.6 节）：

-   **Virtual-interrupt delivery（虚拟中断交付）**。此控制启用挂起的虚拟中断的评估和交付（第 32.2 节）。它还启用对控制中断优先级的 APIC 寄存器的写（按启用的，内存映射或基于 MSR）的仿真。
-   **Use TPR shadow（使用 TPR 影子）**。此控制启用通过 CR8（第 32.3 节）以及（如果启用）通过内存映射或基于 MSR 的接口对 APIC 任务优先级寄存器（TPR）的访问的仿真。
-   **Virtualize APIC accesses（虚拟化 APIC 访问）**。此控制通过引起对 VMM 指定的 APIC-access 页的访问上的 VM 退出启用对 APIC 的内存映射访问的虚拟化（第 32.4 节）。如果设置，其他一些控制可能导致这些访问中的一些被仿真而不是导致 VM 退出。
-   **Virtualize x2APIC mode（虚拟化 x2APIC 模式）**。此控制启用对 APIC 的基于 MSR 的访问的虚拟化（第 32.5 节）。
-   **APIC-register virtualization（APIC 寄存器虚拟化）**。此控制允许通过从虚拟 APIC 页满足对大多数 APIC 寄存器的内存映射和基于 MSR 的读（按启用的）。它将对 APIC-access 页的内存映射写导向虚拟 APIC 页，随后为 VMM 仿真进行 VM 退出。
-   **Process posted interrupts（处理投递中断）**。此控制允许软件在数据结构中投递虚拟中断并向另一逻辑处理器发送通知；收到通知后，目标处理器将通过把它们复制到虚拟 APIC 页来处理投递的中断（第 32.6 节）。
-   **IPI virtualization（IPI 虚拟化）**。此控制启用处理器间中断的虚拟化（第 32.1.6 节）。

"Virtualize APIC accesses"、"virtualize x2APIC mode"、"virtual-interrupt delivery"和"APIC-register virtualization"都是次要基于处理器的 VM 执行控制；如果主要基于处理器的 VM 执行控制的第 31 位为 0，处理器按这些控制都为 0 操作。"IPI virtualization"是第三级基于处理器的 VM 执行控制；如果主要基于处理器的 VM 执行控制的第 17 位为 0，处理器按"IPI virtualization"为 0 操作。见第 27.6.2 节。

## 32.1 虚拟 APIC 状态

虚拟 APIC 页是处理器用于虚拟化对 APIC 寄存器的某些访问和管理虚拟中断的 4-KByte 内存区域。虚拟 APIC 页的物理地址是虚拟 APIC 地址，VMCS 中的 64 位 VM 执行控制字段（见第 27.6.8 节）。

根据某些 VM 执行控制的设置，处理器可以用与本地 APIC 执行的功能类似的功能虚拟化虚拟 APIC 页上的某些字段。第 32.1.1 节标识并定义这些字段。第 32.1.2 节、第 32.1.3 节、第 32.1.4 节和第 32.1.5 节详述为虚拟化对其中一些字段的更新所采取的操作。

除了与虚拟化 APIC 寄存器对应的字段（在第 32.1.1 节中定义）外，软件可以修改 VMX 非根操作中逻辑处理器当前 VMCS 引用的虚拟 APIC 页。（这是第 27.11.4 节给出的一般要求的例外。）

### 32.1.1 虚拟化 APIC 寄存器

根据某些 VM 执行控制的设置，逻辑处理器可以使用虚拟 APIC 页上的以下字段虚拟化对 APIC 寄存器的某些访问：

-   **虚拟任务优先级寄存器（VTPR）**：位于虚拟 APIC 页偏移 080H 处的 32 位字段。
-   **虚拟处理器优先级寄存器（VPPR）**：位于虚拟 APIC 页偏移 0A0H 处的 32 位字段。
-   **虚拟中断结束寄存器（VEOI）**：位于虚拟 APIC 页偏移 0B0H 处的 32 位字段。
-   **虚拟中断服务寄存器（VISR）**：包含位于虚拟 APIC 页偏移 100H、110H、120H、130H、140H、150H、160H 和 170H 处的八个不连续 32 位字段的 256 位值。VISR 的位 x 位于偏移（100H | ((x & E0H) » 1)）处的位位置（x & 1FH）。处理器仅使用偏移 100H、110H、120H、130H、140H、150H、160H 和 170H 处 16 字节字段中每一个的低 4 字节。
-   **虚拟中断请求寄存器（VIRR）**：包含位于虚拟 APIC 页偏移 200H、210H、220H、230H、240H、250H、260H 和 270H 处的八个不连续 32 位字段的 256 位值。VIRR 的位 x 位于偏移（200H | ((x & E0H) » 1)）处的位位置（x & 1FH）。处理器仅使用偏移 200H、210H、220H、230H、240H、250H、260H 和 270H 处 16 字节字段中每一个的低 4 字节。
-   **虚拟中断命令寄存器（VICR_LO）**：位于虚拟 APIC 页偏移 300H 处的 32 位字段。
-   **虚拟中断命令寄存器（VICR_HI）**：位于虚拟 APIC 页偏移 310H 处的 32 位字段。

当"use TPR shadow" VM 执行控制为 1 时，VTPR 字段虚拟化 TPR。当"virtual-interrupt delivery" VM 执行控制为 1 时，上面指示的其他字段虚拟化相应的 APIC 寄存器。（当"IPI virtualization" VM 执行控制为 1 时，VICR_LO 和 VICR_HI 也虚拟化 ICR。）

### 32.1.2 TPR 虚拟化

处理器响应以下操作执行 TPR 虚拟化：（1）MOV 到 CR8 指令的虚拟化；（2）对 APIC-access 页偏移 080H 的写的虚拟化；和（3）ECX = 808H 的 WRMSR 指令的虚拟化。何时执行 TPR 虚拟化的细节见第 32.3 节、第 32.4.3 节和第 32.5 节。

以下伪代码详述 TPR 虚拟化的行为：

```python
IF "virtual-interrupt delivery" 为 0
THEN
  IF VTPR[7:4] < TPR threshold（见第 27.6.8 节）
  THEN 导致因 TPR below threshold 的 VM 退出；
  FI；
ELSE
  执行 PPR 虚拟化（见第 32.1.3 节）；
  评估挂起的虚拟中断（见第 32.2.1 节）；
FI；
```

由 TPR 虚拟化引起的任何 VM 退出是陷阱类的：引起 TPR 虚拟化的指令在 VM 退出发生前完成（例如，保存在 VMCS 客户状态区域中的 CS:RIP 的值引用下一条指令）。

### 32.1.3 PPR 虚拟化

处理器响应以下操作执行 PPR 虚拟化：（1）VM 进入；（2）TPR 虚拟化；和（3）EOI 虚拟化。何时执行 PPR 虚拟化的细节见第 29.3.2.5 节、第 32.1.2 节和第 32.1.4 节。

PPR 虚拟化使用客户中断状态（具体来说，SVI；见第 27.4.2 节）和 VTPR。以下伪代码详述 PPR 虚拟化的行为：

```python
IF VTPR[7:4] ≥ SVI[7:4]
THEN VPPR := VTPR & FFH；
ELSE VPPR := SVI & F0H；
FI；
```

PPR 虚拟化总是清除 VPPR 的字节 3:1。

PPR 虚拟化仅由 TPR 虚拟化、EOI 虚拟化和 VM 进入引起。虚拟中断的交付也修改 VPPR，但方式不同（见第 32.2.2 节）。没有其他操作修改 VPPR，即使它们修改 SVI、VISR 或 VTPR。

### 32.1.4 EOI 虚拟化

处理器响应以下操作执行 EOI 虚拟化：（1）对 APIC-access 页偏移 0B0H 的写的虚拟化；和（2）ECX = 80BH 的 WRMSR 指令的虚拟化。何时执行 EOI 虚拟化的细节见第 32.4.3 节和第 32.5 节。仅当"virtual-interrupt delivery" VM 执行控制为 1 时，EOI 虚拟化才发生。

EOI 虚拟化使用并更新客户中断状态（具体来说，SVI；见第 27.4.2 节）。以下伪代码详述 EOI 虚拟化的行为：

```python
Vector := SVI；
VISR[Vector] := 0；（VISR 的定义见第 32.1.1 节）
IF VISR 中设置了任何位
THEN SVI := VISR 中设置位的最高索引
ELSE SVI := 0；
FI；
执行 PPR 虚拟化（见第 32.1.3 节）；
IF EOI_exit_bitmap[Vector] = 1（EOI_exit_bitmap 的定义见第 27.6.8 节）
THEN 导致以 Vector 作为退出资格的 EOI 引起的 VM 退出；
ELSE 评估挂起的虚拟中断；（见第 32.2.1 节）
FI；
```

由 EOI 虚拟化引起的任何 VM 退出是陷阱类的：引起 EOI 虚拟化的指令在 VM 退出发生前完成（例如，保存在 VMCS 客户状态区域中的 CS:RIP 的值引用下一条指令）。

### 32.1.5 自 IPI 虚拟化

处理器响应以下操作执行自 IPI 虚拟化：（1）对 APIC-access 页偏移 300H 的写的虚拟化；和（2）ECX = 83FH 的 WRMSR 指令的虚拟化。何时执行自 IPI 虚拟化的细节见第 32.4.3 节和第 32.5 节。仅当"virtual-interrupt delivery" VM 执行控制为 1 时，自 IPI 虚拟化才发生。

导致自 IPI 虚拟化的每个操作提供 8 位向量（见第 32.4.3 节和第 32.5 节）。自 IPI 虚拟化更新客户中断状态（具体来说，RVI；见第 27.4.2 节）。以下伪代码详述自 IPI 虚拟化的行为：

```python
VIRR[Vector] := 1；（VIRR 的定义见第 32.1.1 节）
RVI := max{RVI, Vector}；
评估挂起的虚拟中断；（见第 32.2.1 节）
```

### 32.1.6 IPI 虚拟化

处理器响应以下操作执行 IPI 虚拟化：（1）对 APIC-access 页偏移 300H 的写的虚拟化（第 32.4.3 节）；（2）ECX = 830H 的 WRMSR 指令的虚拟化（第 32.5 节）；和（3）SENDUIPI 的某些执行的虚拟化（第 32.7 节）。仅当"IPI virtualization" VM 执行控制为 1 时，IPI 虚拟化才发生。

IPI 虚拟化使用虚拟中断投递，它在第 32.1.6.1 节中描述。第 32.1.6.2 节给出 IPI 虚拟化操作的细节。

#### 32.1.6.1 虚拟中断投递

IPI 虚拟化基于虚拟中断投递，一种可以将虚拟中断导向特定虚拟处理器的过程。使用虚拟中断投递，硬件或软件代理在数据结构（投递中断描述符或 PID）中"投递"虚拟中断，然后向目标虚拟处理器运行所在的逻辑处理器发送中断（通知）。当该逻辑处理器收到通知时，它使用 PID 中的信息将虚拟中断交付给虚拟处理器（见第 32.6 节）。

PID 是 64 字节数据结构。在预期使用中，每个虚拟处理器有一个 PID；虚拟处理器的 VMCS 包含指向其 PID 的指针。PID 具有表 32-1 中显示的格式。

**表 32-1. 投递中断描述符（PID）的格式**

| 位位置 | 名称  | 描述  |
| --- | --- | --- |
| 255:0 | 投递中断请求（PIR） | 每个中断向量一位。如果相应位为 1，存在向量的投递中断请求。 |
| 256 | 未完成通知（ON） | 如果此位被设置，对第 255:0 位中一个或多个投递中断有未完成的通知。 |
| 257 | 抑制通知（SN） | 设置此位指示代理不发送通知。 |
| 271:258 | 保留  | 保留。 |
| 279:272 | 通知向量（NV） | 通知将使用此向量。 |
| 287:280 | 保留  | 保留。 |
| 319:288 | 通知目标（NDST） | 通知将被导向此物理 APIC ID。 |
| 511:320 | 保留  | 保留。 |

硬件或软件代理按以下步骤向虚拟处理器投递虚拟中断：

1.  读取虚拟处理器 PID 中的 PIR 字段并原子地写回它，设置与虚拟中断向量对应的位。
2.  读取 PID 中的通知信息字段并原子地写回它，如果在读取的值中 ON 和 SN 位都为 0，设置 ON 位。（步骤 #2 可以与步骤 #1 原子地完成。）
3.  如果步骤 #2 将 ON 位从 0 改为 1，发送通知。通知是发送到物理 APIC ID NDST 且带向量 NV 的普通中断。

处理器对通知交付的响应在第 32.6 节中详述。

用于 IPI 虚拟化的虚拟中断投递的使用在第 32.1.6.2 节中解释。

#### 32.1.6.2 使用虚拟中断投递的 IPI 虚拟化

导致 IPI 虚拟化的每个操作提供 8 位虚拟向量 V 和 32 位虚拟 APIC ID T。IPI 虚拟化使用那些值使用 PID 指针表发起指示的虚拟 IPI。

PID 指针表是由 PID 指针表地址（VMCS 中的字段）引用的数据结构。PID 指针表中的每个条目包含以下信息：

-   第 63:6 位包含 PID 的 64 位物理地址的第 63:6 位（见第 32.1.6.1 节）。
-   第 5:1 位被保留且必须为 0。
-   第 0 位是有效位。

每个此类地址必须 64 字节对齐。表中最后一个条目的索引也是 VMCS 中的字段。

当虚拟化 IPI 时，CPU 使用虚拟 APIC ID T 从 PID 指针表选择条目。它使用该条目中的地址定位投递中断描述符（PID），然后在该 PID 中投递带向量 V 的虚拟中断。以下伪代码详述 IPI 虚拟化的行为：

```python
IF V < 16
THEN APIC-write VM 退出；
// 非法向量
ELSE IF T ≤ 最后一个 PID 指针索引
// VMCS 中的字段
THEN
  PID_ADDR := （PID 指针表地址 + （T « 3））处的 8 字节；
  IF PID_ADDR 设置超出处理器物理地址宽度的位¹ 或
  PID_ADDR[5:0] ≠ 000001b
  // PID 指针无效或设置了保留位
  THEN APIC-write VM 退出；
  // 见第 32.4.3.3 节
  ELSE
    PID_ADDR[0] := 0；
    // 用作地址前清除有效位
    PIR := PID_ADDR 处的 32 字节；
    // 在锁下
    PIR[V] := 1；
    在 PID_ADDR 处存储 PIR；
    // 释放锁；对应于第 32.1.6.1 节中的步骤 #1
    NotifyInfo := PID_ADDR + 32 处的 8 字节；
    // 在锁下
    IF NotifyInfo.ON = 0 且 NotifyInfo.SN = 0
    THEN
      NotifyInfo.ON := 1；
      SendNotify := 1；
    ELSE SendNotify := 0；
    FI；
    在 PID_ADDR + 32 处存储 NotifyInfo；
    // 释放锁；对应于第 32.1.6.1 节中的步骤 #2
    IF SendNotify = 1
    THEN 发送由 NotifyInfo.NDST 和 NotifyInfo.NV 指定的 IPI；// 第 32.1.6.1 节中的步骤 #3
    FI；
  FI；
ELSE APIC-write VM 退出；
// 虚拟 APIC ID 超出表末尾
FI；
```

通知 IPI 的发送由所选 PID 中的字段指示：NDST（PID\[319:288\]）和 NV（PID\[279:272\]）：

-   如果本地 APIC 处于 xAPIC 模式，这是将 NDST\[15:8\]（PID\[303:296\]）写入 ICR_HI\[31:24\]（从 IA32_APIC_BASE 偏移 310H）然后向 ICR_LO（从 IA32_APIC_BASE 偏移 300H）写入 NV 会生成的 IPI。
-   如果本地 APIC 处于 x2APIC 模式，这是执行 ECX = 830H（ICR）、EAX = NV 且 EDX = NDST 的 WRMSR 会生成的 IPI。

如果伪代码指定 APIC-write VM 退出，此 VM 退出发生的方式就像对 APIC-access 页上页偏移 300H 有过写访问一样（见第 32.4.3.3 节）。

## 32.2 虚拟中断的评估和交付

如果"virtual-interrupt delivery" VM 执行控制为 1，VMX 非根操作中或 VM 进入期间的某些操作导致处理器评估和交付虚拟中断。

虚拟中断的评估由改变虚拟 APIC 页状态的某些操作触发，在第 32.2.1 节中描述。此评估可能导致识别虚拟中断。一旦识别虚拟中断，处理器可以在 VMX 非根操作中无 VM 退出地交付它。虚拟中断交付在第 32.2.2 节中描述。

### 32.2.1 待处理虚拟中断的评估

如果"virtual-interrupt delivery" VM 执行控制为 1，某些操作导致逻辑处理器评估待处理的虚拟中断。

以下操作导致待处理虚拟中断的评估：VM 进入；TPR 虚拟化；EOI 虚拟化；自 IPI 虚拟化；和投递中断处理。何时执行待处理虚拟中断评估的细节见第 29.3.2.5 节、第 32.1.2 节、第 32.1.4 节、第 32.1.5 节和第 32.6 节。没有其他操作导致待处理虚拟中断的评估，即使它们修改 RVI 或 VPPR。

待处理虚拟中断的评估使用客户中断状态（具体来说，RVI；见第 27.4.2 节）。以下伪代码详述待处理虚拟中断的评估：

```python
IF 逻辑处理器在 SEAM 中且 RVI < 31
THEN RVI := 0；
FI；
IF "interrupt-window exiting" 为 0 且
RVI[7:4] > VPPR[7:4]（VPPR 的定义见第 32.1.1 节）
THEN 识别挂起的虚拟中断；
ELSE
  不识别挂起的虚拟中断；
FI；
```

一旦识别，虚拟中断可以在 VMX 非根操作中交付；见第 32.2.2 节。注意，在 SEAM 中，不会有向量低于 31 的虚拟中断被交付。

待处理虚拟中断的评估仅由 VM 进入、TPR 虚拟化、EOI 虚拟化、自 IPI 虚拟化和投递中断处理引起。没有其他操作这样做，即使它们修改 RVI 或 VPPR。逻辑处理器在虚拟中断交付后停止识别挂起的虚拟中断。

### 32.2.2

### 32.2.2 虚拟中断交付

如果已识别虚拟中断（见第 32.2.1 节），当以下条件全部成立时，它在指令边界交付：（1）RFLAGS.IF = 1；（2）没有由 STI 阻止；（3）没有由 MOV SS 或由 POP SS 阻止；且（4）"interrupt-window exiting" VM 执行控制为 0。

虚拟中断交付具有与由于"interrupt-window exiting" VM 执行控制 1 设置的 VM 退出相同的优先级。¹ 因此，非可屏蔽中断（NMI）和更高优先级事件优先于虚拟中断的交付；虚拟中断的交付优先于外部中断和更低优先级事件。

虚拟中断交付从与外部中断相同的非活动活动状态唤醒逻辑处理器。具体来说，它从使用 HLT 和 MWAIT 指令进入的状态唤醒逻辑处理器。它不唤醒关闭状态或 wait-for-SIPI 状态中的逻辑处理器。

虚拟中断交付更新客户中断状态（RVI 和 SVI 两者；见第 27.4.2 节）并在 VMX 非根操作中无 VM 退出地交付事件。以下伪代码详述虚拟中断交付的行为（VISR、VIRR 和 VPPR 的定义见第 32.1.1 节）：

```python
Vector := RVI；
VISR[Vector] := 1；
SVI := Vector；
VPPR := Vector & F0H；
VIRR[Vector] := 0；
IF VIRR 中设置了任何位
THEN RVI := VIRR 中设置位的最高索引
ELSE RVI := 0；
FI；
IF 逻辑处理器在 SEAM 中且 RVI < 31
THEN RVI := 0；
FI；
停止识别任何挂起的虚拟中断；
IF 事务执行生效
THEN 中止事务执行并转换到非事务执行；
FI；
IF 逻辑处理器处于飞地模式
THEN 导致异步飞地退出（AEX）（见第 40 章"飞地退出事件"）
FI；
IF CR4.UINTR = 1 且 IA32_EFER.LMA = 1 且 Vector = UINV
THEN 虚拟化用户中断通知识别和处理（见第 32.2.3 节）
ELSE 向客户软件交付带 Vector 的中断；
FI；
```

### 32.2.3 虚拟化用户中断通知

第 9.5 节描述用户中断通知识别和处理的过程。如果"virtual-interrupt delivery" VM 执行控制为 1，此过程按以下段落中描述的修改。

虚拟化形式的用户中断通知识别按第 32.2.2 节所述开始。在此之后，逻辑处理器不向本地 APIC 中的 EOI 寄存器写入零，而是执行 EOI 虚拟化的初始步骤：

```python
VISR[V] := 0；
IF VISR 中设置了任何位
THEN SVI := VISR 中设置位的最高索引
ELSE SVI := 0；
FI；
执行 PPR 虚拟化（第 32.1.3 节）；
```

与由客户对 EOI 寄存器的写导致的 EOI 虚拟化（如虚拟中断交付所定义的）不同，逻辑处理器不作为此修改形式的用户中断通知识别的一部分检查 EOI-exit 位图，且相应的 VM 退出不能发生。

在此修改形式的用户中断通知识别之后，逻辑处理器然后按第 9.5.2 节指定的执行用户中断通知处理。

逻辑处理器在此修改形式的用户中断通知识别期间或在其与任何后续用户中断通知处理之间不可中断。

如果在用户中断通知处理之前的用户中断通知识别发生在逻辑处理器处于 HLT 状态时，逻辑处理器在用户中断通知处理之后返回 HLT 状态。

## 32.3 虚拟化基于 CR8 的 TPR 访问

在 64 位模式中，软件可以通过 CR8 访问本地 APIC 的任务优先级寄存器（TPR）。具体来说，软件使用 MOV from CR8 和 MOV to CR8 指令（见第 13.8.6 节"Task Priority in IA-32e Mode"）。本节描述如何虚拟化这些访问。

虚拟机监视器可以通过设置"CR8-load exiting"和"CR8-store exiting" VM 执行控制来虚拟化这些基于 CR8 的 APIC 访问，确保访问导致 VM 退出（见第 28.1.3 节）。或者，存在无 VM 退出地虚拟化某些基于 CR8 的 APIC 访问的方法。

正常来说，不故障或导致 VM 退出的 MOV from CR8 或 MOV to CR8 的执行访问 APIC 的 TPR。然而，如果"use TPR shadow" VM 执行控制为 1，此类执行被特殊处理。以下条目提供细节：

-   **MOV from CR8**。指令用 VTPR 的第 7:4 位加载其目标操作数的第 3:0 位（见第 32.1.1 节）。目标操作数的第 63:4 位被清除。
-   **MOV to CR8**。指令将其源操作数的第 3:0 位存储到 VTPR 的第 7:4 位；VTPR 的其余部分（第 3:0 位和第 31:8 位）被清除。在此之后，处理器执行 TPR 虚拟化（见第 32.1.2 节）。

## 32.4 虚拟化内存映射 APIC 访问

当本地 APIC 处于 xAPIC 模式时，软件使用内存映射接口访问本地 APIC 的控制寄存器。具体来说，软件使用转换到 IA32_APIC_BASE MSR 中基地址指示的页帧上物理地址的线性地址（见第 13.4.4 节"Local APIC Status and Location"）。本节描述如何虚拟化这些访问。

虚拟机监视器（VMM）可以通过确保任何会访问本地 APIC 的线性地址的访问反而导致 VM 退出，来虚拟化这些内存映射 APIC 访问。这可以使用分页或扩展页表机制（EPT）完成。另一种方式是使用"virtualize APIC accesses" VM 执行控制的 1 设置。

如果"virtualize APIC accesses" VM 执行控制为 1，逻辑处理器特殊处理使用转换到 4-KByte APIC-access 页中物理地址的线性地址的内存访问。¹,² （APIC-access 页由 APIC-access 地址标识，它是 VMCS 中的字段；见第 27.6.8 节。）

一般来说，对 APIC-access 页的访问导致 APIC-access VM 退出。APIC-access VM 退出向 VMM 提供关于导致 VM 退出的访问的信息。第 32.4.1 节讨论 APIC-access VM 退出的优先级。

某些 VM 执行控制使处理器能够无 VM 退出地虚拟化对 APIC-access 页的某些访问。一般来说，此虚拟化导致这些访问被对虚拟 APIC 页进行，而不是对 APIC-access 页。

> **注**  
> 除非另有说明，本节仅描述对 APIC-access 页的线性访问；如果（1）它由使用线性地址的内存访问产生；且（2）访问的物理地址是该线性地址的转换，对 APIC-access 页的访问是线性访问。第 32.4.6 节讨论不是线性访问的对 APIC-access 页的访问。  
> APIC-access 页与虚拟 APIC 页之间的区分允许 VMM 在虚拟机各虚拟处理器之间共享分页结构或 EPT 分页结构（共享的分页结构引用相同的 APIC-access 地址，它出现在所有虚拟处理器的 VMCS 中），同时给每个虚拟处理器自己的虚拟 APIC（每个虚拟处理器的 VMCS 将有唯一的虚拟 APIC 地址）。

第 32.4.2 节讨论处理器何时以及如何虚拟化从 APIC-access 页的读访问。第 32.4.3 节对写访问做同样的事。当虚拟化对 APIC-access 页的写时，处理器通常在把写传递到虚拟 APIC 页之外还采取额外操作。

那些节中的讨论使用这些内存访问可能在其中发生的操作的概念。对于那些讨论，"操作"可以是 REP 前缀字符串指令的一次迭代、任何其他指令的执行或通过 IDT 或使用 FRED 的事件交付。

"virtualize APIC accesses" VM 执行控制的 1 设置也可能影响不直接由线性地址产生的对 APIC-access 页的访问。这在第 32.4.6 节中讨论。

Intel SGX 指令或逻辑处理器处于飞地模式时可能适用特殊处理。细节见第 42.5.3 节。

### 32.4.1 APIC-access VM 退出的优先级

以下条目指定 APIC-access VM 退出相对于其他事件的优先级。

-   由于内存访问的 APIC-access VM 退出的优先级低于该访问可能招致的任何页错误或 EPT 违规。也就是说，如果访问会导致页错误或 EPT 违规，它不导致 APIC-access VM 退出。
-   内存访问直到已访问标志在分页结构（如果启用，包括 EPT 分页结构）中被设置之后才导致 APIC-access VM 退出。
-   写访问直到脏标志在适当的分页结构和 EPT 分页结构（如果启用）中被设置之后才导致 APIC-access VM 退出。
-   关于所有其他事件，由于内存访问的任何 APIC-access VM 退出具有与访问可能导致任何页错误或 EPT 违规相同的优先级。（此条目适用于访问可能生成的其他事件以及可能由同一操作的其他访问生成的事件。）

这些原则意味着，除其他事项外，APIC-access VM 退出可能在重复字符串指令（包括 INS 和 OUTS）执行期间发生。例如，假设此类指令的前 n 次迭代（n 可以为 0）不访问 APIC-access 页且下一次迭代确实访问该页。结果，前 n 次迭代可能完成且随后是 APIC-access VM 退出。VMCS 中保存的指令指针引用重复字符串指令且通用寄存器的值反映 n 次迭代的完成。

### 32.4.2 虚拟化从 APIC-access 页的读

如果以下任一为真，从 APIC-access 页的读访问导致 APIC-access VM 退出：

-   "use TPR shadow" VM 执行控制为 0。
-   访问是指令获取。
-   访问大于 32 位。
-   访问是处理器已为其虚拟化了对 APIC-access 页的写的操作的一部分。
-   访问不完全包含在自然对齐的 16 字节区域的低 4 字节内。也就是说，访问地址的第 3:2 位为 0，访问的最高字节的地址也是如此。
-   （可选）访问的目标是通用寄存器以外的寄存器。

如果以上都不为真（可能除了最后一项），读访问是否被虚拟化取决于"APIC-register virtualization"和"virtual-interrupt delivery" VM 执行控制的设置：

-   如果其页偏移为 080H（任务优先级），读访问被虚拟化，无论"APIC-register virtualization"和"virtual-interrupt delivery" VM 执行控制的设置如何。
-   如果"virtual-interrupt delivery" VM 执行控制为 1，如果其页偏移为 0B0H（中断结束）或 300H（中断命令——低），读访问被虚拟化。
-   如果"APIC-register virtualization"为 1，如果读访问完全在以下偏移范围之一内，它被虚拟化：
    -   020H–023H（本地 APIC ID）；
    -   030H–033H（本地 APIC 版本）；
    -   080H–083H（任务优先级）；
    -   0B0H–0B3H（中断结束）；
    -   0D0H–0D3H（逻辑目标）；
    -   0E0H–0E3H（目标格式）；
    -   0F0H–0F3H（伪中断向量）；
    -   100H–103H、110H–113H、120H–123H、130H–133H、140H–143H、150H–153H、160H–163H 或 170H–173H（服务中）；
    -   180H–183H、190H–193H、1A0H–1A3H、1B0H–1B3H、1C0H–1C3H、1D0H–1D3H、1E0H–1E3H 或 1F0H–1F3H（触发模式）；
    -   200H–203H、210H–213H、220H–223H、230H–233H、240H–243H、250H–253H、260H–263H 或 270H–273H（中断请求）；
    -   280H–283H（错误状态）；
    -   300H–303H 或 310H–313H（中断命令）；
    -   320H–323H、330H–333H、340H–343H、350H–353H、360H–363H 或 370H–373H（LVT 条目）；
    -   380H–383H（初始计数）；或
    -   3E0H–3E3H（分频配置）。

在所有其他情况下，访问导致 APIC-access VM 退出。

从 APIC-access 页被虚拟化的读访问返回来自虚拟 APIC 页上相应页偏移的数据。¹

### 32.4.3 虚拟化对 APIC-access 页的写

对 APIC-access 页的写访问是否被虚拟化取决于 VM 执行控制的设置和访问的页偏移。第 32.4.3.1 节详述何时发生 APIC 写虚拟化。

与读不同，对本地 APIC 的写有副作用；因此，对 APIC-access 页的写的虚拟化可能需要特定于访问页偏移（标识被访问的 APIC 寄存器）的仿真。第 32.4.3.2 节描述此 APIC 写仿真。

对于某些页偏移，软件有必要在写完成后完成虚拟化。在这些情况下，处理器导致 APIC-write VM 退出以调用 VMM 软件。第 32.4.3.3 节讨论 APIC-write VM 退出。

#### 32.4.3.1 确定写访问是否被虚拟化

如果以下任一为真，对 APIC-access 页的写访问导致 APIC-access VM 退出：

-   "use TPR shadow" VM 执行控制为 0。
-   访问大于 32 位。
-   访问是处理器已为其虚拟化了对 APIC-access 页的写（带不同页偏移或不同大小）的操作的一部分。
-   访问不完全包含在自然对齐的 16 字节区域的低 4 字节内。也就是说，访问地址的第 3:2 位为 0，访问的最高字节的地址也是如此。
-   （可选）访问的源是通用寄存器以外的寄存器。

如果以上都不为真（可能除了最后一项），写访问是否被虚拟化取决于"APIC-register virtualization"、"virtual-interrupt delivery"和"IPI virtualization" VM 执行控制的设置：

-   如果其页偏移为 080H（任务优先级），写访问被虚拟化，无论"APIC-register virtualization"和"virtual-interrupt delivery" VM 执行控制的设置如何。
-   如果"virtual-interrupt delivery" VM 执行控制为 1，如果其页偏移为 0B0H（中断结束）或 300H（中断命令——低），写访问被虚拟化。
-   如果"IPI virtualization" VM 执行控制为 1，如果其页偏移为 300H，写访问被虚拟化。
-   如果"APIC-register virtualization" VM 执行控制为 1，如果写访问完全在以下偏移范围之一内，它被虚拟化：
    -   020H–023H（本地 APIC ID）；
    -   080H–083H（任务优先级）；
    -   0B0H–0B3H（中断结束）；
    -   0D0H–0D3H（逻辑目标）；
    -   0E0H–0E3H（目标格式）；
    -   0F0H–0F3H（伪中断向量）；
    -   280H–283H（错误状态）；
    -   300H–303H 或 310H–313H（中断命令）；
    -   320H–323H、330H–333H、340H–343H、350H–353H、360H–363H 或 370H–373H（LVT 条目）；
    -   380H–383H（初始计数）；或
    -   3E0H–3E3H（分频配置）。

在所有其他情况下，访问导致 APIC-access VM 退出。

处理器通过向虚拟 APIC 页上相应页偏移写入数据来虚拟化对 APIC-access 页的写访问。¹ 在此之后，处理器在访问所在的操作完成后执行某些操作。² APIC 写仿真在第 32.4.3.2 节中描述。

#### 32.4.3.2 APIC 写仿真

如果处理器虚拟化对 APIC-access 页的写访问，它在访问所在的操作完成后执行额外操作。这些操作称为 APIC 写仿真。

APIC 写仿真的细节取决于被虚拟化的写访问的页偏移：³

-   **080H（任务优先级）**。处理器清除 VTPR 的字节 3:1，然后导致 TPR 虚拟化（第 32.1.2 节）。
-   **0B0H（中断结束）**。如果"virtual-interrupt delivery" VM 执行控制为 1，处理器清除 VEOI，然后导致 EOI 虚拟化（第 32.1.4 节）；否则，处理器导致 APIC-write VM 退出（第 32.4.3.3 节）。
-   **300H（中断命令——低）**。如果"virtual-interrupt delivery" VM 执行控制为 1，处理器检查 VICR_LO 的值以确定以下是否全部为真：
    -   保留位（31:20、17:16、13）和第 12 位（交付状态）都为 0。
    -   第 19:18 位（目标简写）为 01B（自）。
    -   第 15 位（触发模式）为 0（边沿）。
    -   第 10:8 位（交付模式）为 000B（固定）。
    -   第 7:4 位（向量的上半部分）不为 0000B。  
        如果上面的所有条目都为真，处理器使用字节 0 中的 8 位向量执行自 IPI 虚拟化  
        （第 32.1.5 节）。

如果"virtual-interrupt delivery" VM 执行控制为 0，或如果上面的任何条目为假，行为取决于"IPI virtualization" VM 执行控制的设置：

-   如果"IPI virtualization" VM 执行控制为 1，处理器检查 VICR_LO 的值以确定以下是否全部为真：
    -   保留位（31:20、17:16、13）和第 12 位（交付状态）都为 0。
    -   第 19:18 位（目标简写）为 00B（无简写）。
    -   第 15 位（触发模式）为 0（边沿）。
    -   第 11 位（目标模式）为 0（物理）。
    -   第 10:8 位（交付模式）为 000B（固定）。  
        如果上面的所有条目都为真，处理器使用 VICR_LO 字节 0 中的 8 位向量和 VICR_HI\[31:24\] 中的 8 位 APIC ID 执行 IPI 虚拟化（第 32.1.6 节）；否则，处理器导致 APIC-write VM 退出。
-   如果"IPI virtualization" VM 执行控制为 0，处理器导致 APIC-write VM 退出。
-   **310H–313H（中断命令——高）**。处理器清除 VICR_HI 的字节 2:0。不发生其他虚拟化或 VM 退出。
-   **任何其他页偏移**。处理器导致 APIC-write VM 退出。

APIC 写仿真优先于系统管理模式中断（SMI）、INIT 信号和更低优先级事件。APIC 写仿真不被 RFLAGS.IF = 0 或由 MOV SS、POP SS 或 STI 指令阻止。

如果操作在对 APIC-access 页的写访问之后且在 APIC 写仿真之前导致故障，且该故障无 VM 退出地交付，APIC 写仿真在故障交付之后且故障处理程序可以执行之前发生。如果操作在对 APIC-access 页的写访问之后且在 APIC 写仿真之前导致 VM 退出（可能由于故障），APIC 写仿真不发生。

#### 32.4.3.3 APIC-write VM 退出

在某些情况下，必须调用 VMM 软件来完成对 APIC-access 页的写访问的虚拟化。在这种情况下，APIC 写仿真导致 APIC-write VM 退出。（第 32.4.3.2 节详述导致 APIC-write VM 退出的情况。）

APIC-write VM 退出由 APIC 写仿真调用，且 APIC 写仿真在对 APIC-access 页执行写访问的操作之后发生。因此，每个 APIC-write VM 退出是陷阱类的：它在包含导致 VM 退出的写访问的操作完成之后发生（例如，VMCS 客户状态区域中保存的 CS:RIP 的值引用下一条指令）。

APIC-write VM 退出的基本退出原因是"APIC write"。退出资格是导致 VM 退出的写访问的页偏移。

如第 32.5 节所述，如果"virtual-interrupt delivery" VM 执行控制为 1，ECX = 83FH（self-IPI MSR）的 WRMSR 执行可以导致 APIC-write VM 退出；APIC-write VM 退出的退出资格是 3F0H。如第 32.1.6 节和第 32.7 节所述，IPI 虚拟化和 SENDUIPI 的执行可能导致 APIC-write VM 退出；这些 VM 退出产生 300H 的退出资格。

### 32.4.4 指令特定考虑

某些使用线性地址的指令可能引起页错误，即使它们不使用那些地址访问内存。APIC 虚拟化特性也可能影响这些指令：

-   **CLFLUSH、CLFLUSHOPT**。关于故障，处理器按这些指令中的每一个从源操作数中的线性地址读取来操作。如果该地址转换到 APIC-access 页上的一个，指令可能导致 APIC-access VM 退出。如果它不，它将刷新虚拟 APIC 页上的相应缓存行而不是 APIC-access 页。
-   **ENTER**。关于故障，处理器按 ENTER 写入栈指针最终值引用的字节来操作（即使在其大小操作数非零时它不这样做）。如果该值转换到 APIC-access 页上的地址，指令可能导致 APIC-access VM 退出。如果它不，它将导致适用于地址页偏移的 APIC 写仿真。
-   **MASKMOVQ 和 MASKMOVDQU**。即使指令的掩码为零，处理器关于故障可能按 MASKMOVQ 或 MASKMOVDQU 写入内存来操作（行为是实现特定的）。在此类情况下，可能发生 APIC-access VM 退出。
-   **MONITOR**。关于故障，处理器按 MONITOR 从 RAX 中的有效地址读取来操作。如果产生的线性地址转换到 APIC-access 页上的一个，指令可能导致 APIC-access VM 退出。¹ 如果它不，它将监视虚拟 APIC 页上的相应地址而不是 APIC-access 页。
-   **PREFETCH**。会导致对 APIC-access 页的访问的 PREFETCH 指令的执行不导致 APIC-access VM 退出。此类访问可以预取数据；如果是这样，它来自虚拟 APIC 页上的相应地址。

对 APIC-access 页的访问的虚拟化主要面向基本指令，如 AND、MOV、OR、TEST、XCHG 和 XOR。使用通常对浮点、SSE、AVX 或 AVX-512 寄存器操作的指令可能无条件导致 APIC-access VM 退出，无论它访问 APIC-access 页上的什么页偏移。

### 32.4.5 与页大小和 TLB 管理相关的问题

"virtualize APIC accesses" VM 执行的 1 设置仅在到 APIC-access 地址的转换使用 4-KByte 页时保证适用。以下条目提供细节：

-   如果未使用 EPT，任何转换到 APIC-access 页上地址的线性地址应使用 4-KByte 页。任何对使用更大页转换到 APIC-access 页的线性地址的访问可能按"virtualize APIC accesses" VM 执行控制为 0 来操作。
-   如果使用 EPT，任何转换到 APIC-access 页上地址的客户物理地址应使用 4-KByte 页。任何对使用更大页转换到依次转换到 APIC-access 页的客户物理地址的线性地址的访问可能按"virtualize APIC accesses" VM 执行控制为 0 来操作。（对 APIC-access 页的客户物理访问也是如此；见第 32.4.6.1 节。）

此外，软件在做出可能影响 APIC 虚拟化的更改时应执行适当的 TLB 使无效。具体细节取决于是否使用 VPID 或 EPT：

-   **使用 VPID 但未使用 EPT**。假设存在一个之前使用过的 VPID 且软件此后做了以下任一更改：（1）在它之前为 0 时设置"virtualize APIC accesses" VM 执行控制；或（2）更改分页结构，使得某些线性地址在之前不转换到 APIC-access 地址时现在转换到它。在这种情况下，软件应在同一个逻辑处理器上用相同的 VPID 执行之前执行 INVVPID（见第 33.3 节中的"INVVPID——Invalidate Translations Based on VPID"）。²
-   **使用 EPT**。假设存在一个之前使用过的 EPTP 值且软件此后做了以下任一更改：（1）在它之前为 0 时设置"virtualize APIC accesses" VM 执行控制；或（2）更改 EPT 分页结构，使得某些客户物理地址在之前不转换到 APIC-access 地址时现在转换到它。在这种情况下，软件应在同一个逻辑处理器上用相同的 EPTP 值执行之前执行 INVEPT（见第 33.3 节中的"INVEPT——Invalidate Translations Derived from EPT"）。³
-   **既不使用 VPID 也不使用 EPT**。不需要使无效。

不执行适当的 TLB 使无效可能导致逻辑处理器在响应受影响地址的访问时按"virtualize APIC accesses" VM 执行控制为 0 来操作。（如果既不使用 VPID 也不使用 EPT，没有必要使无效。）

### 32.4.6 不直接由线性地址产生的 APIC 访问

第 32.4 节已描述使用转换到 APIC-access 页上地址的线性地址的访问的处理。本节考虑不直接由线性地址产生的内存访问。

-   如果（1）CR0.PG = 1；¹ （2）"enable EPT" VM 执行控制为 1；² （3）访问的物理地址是 EPT 转换的结果；且（4）（a）访问不是由线性地址生成的；或（b）访问的客户物理地址不是访问线性地址的转换，访问被称为客户物理访问。第 32.4.6.1 节讨论对 APIC-access 页的客户物理访问的处理。
-   如果（1）（a）"enable EPT" VM 执行控制为 0；或（b）访问的物理地址不是通过 EPT 分页结构转换的结果；且（2）（a）访问不是由线性地址生成的；或（b）访问的物理地址不是其线性地址的转换，访问被称为物理访问。第 32.4.6.2 节讨论对 APIC-access 页的物理访问的处理。

#### 32.4.6.1 对 APIC-access 页的客户物理访问

当使用 EPT 转换客户物理地址时，客户物理访问包括以下：

-   转换线性地址时从客户分页结构的读（此类访问使用不是该线性地址转换的客户物理地址）。
-   当逻辑处理器正在使用（或导致逻辑处理器使用）PAE 分页时，MOV to CR 对页目录指针表条目的加载（见第 5.4 节）。
-   使用线性地址时对客户分页结构中已访问和脏标志的更新（此类访问使用不是该线性地址转换的客户物理地址）。
-   当"Intel PT uses guest physical addresses" VM 执行控制为 1 时，Intel Processor Trace 的内存访问（见第 28.5.4 节）。
-   当"PEBS uses guest physical addresses" VM 执行控制为 1 时，架构 PEBS 的写（见第 28.5.5 节）。

每个使用转换到 APIC-access 页上地址的客户物理地址的客户物理访问导致 APIC-access VM 退出。此类访问无论页偏移如何从不被虚拟化。

以下条目指定由对 APIC-access 页的客户物理访问引起的 APIC-access VM 退出相对于其他事件的优先级。

-   由对内存的客户物理访问引起的 APIC-access VM 退出的优先级低于该访问可能招致的任何 EPT 违规。也就是说，如果客户物理访问会导致 EPT 违规，它不导致 APIC-access VM 退出。
-   关于所有其他事件，由客户物理访问引起的任何 APIC-access VM 退出具有与客户物理访问可能导致任何 EPT 违规相同的优先级。

#### 32.4.6.2 对 APIC-access 页的物理访问

物理访问包括以下：

-   如果"enable EPT" VM 执行控制为 0：
    -   转换线性地址时从分页结构的读。
    -   当逻辑处理器正在使用（或导致逻辑处理器使用）PAE 分页时，MOV to CR 对页目录指针表条目的加载（见第 5.4 节）。
    -   对分页结构中已访问和脏标志的更新。
-   如果"enable EPT" VM 执行控制为 1，对 EPT 分页结构的访问（包括对 EPT 已访问和脏标志的更新）。
-   处理器为支持 VMX 非根操作所做的以下任何访问：
    -   对 VMCS 区域的访问。
    -   对由 VMCS 中 VM 执行控制字段中的物理地址（直接或间接）引用的数据结构的访问。这些包括 I/O 位图、MSR 位图和虚拟 APIC 页。
-   实现进出 SMM 的转换的访问。¹ 这些包括以下：
    -   SMI 交付期间和 RSM 执行期间对 SMRAM 的访问。
    -   SMM VM 退出期间（包括对 MSEG 的访问）和从 SMM 返回的 VM 进入期间的访问。

对 APIC-access 页的物理访问可能或可能不导致 APIC-access VM 退出。如果它不导致 APIC-access VM 退出，它可能访问 APIC-access 页或虚拟 APIC 页。对 APIC-access 页的物理写访问可能或可能不导致 APIC 写仿真或 APIC-write VM 退出。

由物理访问引起的 APIC-access VM 退出的优先级相对于访问可能导致的其他事件未定义。

建议软件不将 APIC-access 地址设置为物理内存访问（上面标识的）使用的任何地址。例如，如果"enable EPT" VM 执行控制为 0，它不应将 APIC-access 地址设置为任何活动分页结构的物理地址。

## 32.5 虚拟化基于 MSR 的 APIC 访问

当本地 APIC 处于 x2APIC 模式时，软件使用 MSR 接口访问本地 APIC 的控制寄存器。具体来说，软件使用 RDMSR 和 WRMSR 指令，将 ECX（标识被访问的 MSR）设置为 800H–8FFH 范围内的值（见第 13.12 节"Extended XAPIC (x2APIC)"）。本节描述如何虚拟化这些访问。

虚拟机监视器可以通过配置 MSR 位图（见第 27.6.9 节）确保访问导致 VM 退出来虚拟化这些基于 MSR 的 APIC 访问（见第 28.1.3 节）。或者，存在无 VM 退出地虚拟化某些基于 MSR 的 APIC 访问的方法。

正常来说，不故障或导致 VM 退出的 RDMSR 或 WRMSR 的执行访问 ECX 中指示的 MSR。然而，如果"virtualize x2APIC mode" VM 执行控制为 1，此类执行特殊处理 800H–8FFH 范围内 ECX 的某些值。以下条目提供细节：

-   **RDMSR**。指令的行为取决于"APIC-register virtualization" VM 执行控制的设置。
    -   如果"APIC-register virtualization" VM 执行控制为 0，行为取决于 ECX 的值。
        -   如果 ECX 包含 808H（指示 TPR MSR），指令将虚拟 APIC 页上偏移 080H 处的 8 字节（VTPR 和其上面的 4 字节）读入 EDX:EAX。这甚至发生在本地 APIC 不处于 x2APIC 模式时（不会因为本地 APIC 不处于 x2APIC 模式而发生一般保护故障）。
        -   如果 ECX 包含 800H–8FFH 范围内任何其他值，指令正常操作。如果本地 APIC 处于 x2APIC 模式且 ECX 指示可读 APIC 寄存器，EDX 和 EAX 被加载该寄存器的值。如果本地 APIC 不处于 x2APIC 模式或 ECX 不指示可读 APIC 寄存器，发生一般保护故障。
    -   如果"APIC-register virtualization"为 1 且 ECX 包含 800H–8FFH 范围内的值，指令将虚拟 APIC 页上偏移 X 处的 8 字节读入 EDX:EAX，其中 X = (ECX & FFH) « 4。这甚至发生在本地 APIC 不处于 x2APIC 模式时（不会因为本地 APIC 不处于 x2APIC 模式而发生一般保护故障）。
-   **WRMSR**。指令的行为取决于 ECX 的值和"virtual-interrupt delivery"和"IPI virtualization" VM 执行控制的设置。

在以下情况下适用特殊处理：（1）ECX 包含 808H（指示 TPR MSR）；（2）ECX 包含 80BH（指示 EOI MSR）且"virtual-interrupt delivery" VM 执行控制为 1；（3）ECX 包含 83FH（指示 self-IPI MSR）且"virtual-interrupt delivery" VM 执行控制为 1；且（4）ECX 包含 830H（指示 ICR MSR）且"IPI virtualization" VM 执行控制为 1。

如果适用特殊处理，不会因本地 APIC 处于 xAPIC 模式而产生一般保护异常。然而，WRMSR 确实执行正常的保留位检查：

-   如果 ECX 包含 808H 或 83FH，如果 EDX 或 EAX\[31:8\] 任一非零，发生一般保护故障。
-   如果 ECX 包含 80BH，如果 EDX 或 EAX 任一非零，发生一般保护故障。
-   如果 ECX 包含 830H，如果 EAX 的第 31:20、17:16 或 13 位中的任何非零，发生一般保护故障。

如果没有故障，WRMSR 将 EDX:EAX 存储在虚拟 APIC 页上偏移 X 处，其中 X = (ECX & FFH) « 4。在此之后，处理器根据 ECX 的值执行操作：

-   如果 ECX 包含 808H，处理器执行 TPR 虚拟化（见第 32.1.2 节）。
-   如果 ECX 包含 80BH，处理器执行 EOI 虚拟化（见第 32.1.4 节）。
-   如果 ECX 包含 83FH，处理器然后检查 EAX\[7:4\] 的值并按如下继续：
    -   如果值非零，逻辑处理器用 EAX\[7:0\] 中的 8 位向量执行自 IPI 虚拟化（见第 32.1.5 节）。
    -   如果值为零，逻辑处理器导致 APIC-write VM 退出，就像对 APIC-access 页上页偏移 3F0H 有过写访问一样（见第 32.4.3.3 节）。
-   如果 ECX 包含 830H，处理器然后检查 VICR 的值以确定以下是否全部为真：
    -   第 19:18 位（目标简写）为 00B（无简写）。
    -   第 15 位（触发模式）为 0（边沿）。
    -   第 12 位（未使用）为 0。
    -   第 11 位（目标模式）为 0（物理）。
    -   第 10:8 位（交付模式）为 000B（固定）。  
        如果上面的所有条目都为真，处理器使用 VICR 字节 0 中的 8 位向量和 VICR\[63:32\] 中的 32 位 APIC ID 执行 IPI 虚拟化（见第 32.1.6 节）。否则，逻辑处理器导致 APIC-write VM 退出（见第 32.4.3.3 节）。

如果特殊处理不适用，指令正常操作。如果本地 APIC 处于 x2APIC 模式且 ECX 指示可写 APIC 寄存器，EDX:EAX 中的值被写入该寄存器。如果本地 APIC 不处于 x2APIC 模式或 ECX 不指示可写 APIC 寄存器，发生一般保护故障。

## 32.6 投递中断处理

投递中断处理是一种处理器通过将它们记录为虚拟 APIC 页上挂起来处理虚拟中断的特性。

通过设置"process posted interrupts" VM 执行控制来启用投递中断处理。该处理响应带投递中断通知向量的中断的到达而执行。响应此类中断，处理器处理记录在称为投递中断描述符（PID）的数据结构中的虚拟中断。投递中断通知向量和 PID 的地址是 VMCS 中的字段；见第 27.6.8 节。

如果"process posted interrupts" VM 执行控制为 1，逻辑处理器使用位于投递中断描述符地址处的 64 字节投递中断描述符。表 32-2 给出 PID 的格式：¹

**表 32-2. 投递中断描述符（PID）的格式**

| 位位置 | 名称  | 描述  |
| --- | --- | --- |
| 255:0 | 投递中断请求（PIR） | 每个中断向量一位。如果相应位为 1，存在向量的投递中断请求。 |
| 256 | 未完成通知（ON） | 如果此位被设置，对第 255:0 位中一个或多个投递中断有未完成的通知。 |
| 511:257 | 保留或用于虚拟中断投递 | 其中一些位被虚拟中断投递使用（第 32.1.6.1 节）。投递中断处理不使用或修改这些位。 |

如果"external-interrupt exiting" VM 执行控制为 1，任何未屏蔽的外部中断导致 VM 退出（见第 28.2 节）。如果"process posted interrupts" VM 执行控制也为 1，此行为被更改且处理器按如下处理外部中断：¹

1.  本地 APIC 被确认；这为处理器核心提供中断向量，此处称为物理向量。
2.  如果物理向量等于投递中断通知向量，逻辑处理器继续下一步。否则，像通常因外部中断一样发生 VM 退出；向量被保存在退出事件标识字段中。
3.  处理器清除投递中断描述符中的未完成通知位。这被原子地完成以保持描述符的其余部分不被修改（例如，使用锁定的 AND 操作）。
4.  处理器向本地 APIC 中的 EOI 寄存器写入零；这从本地 APIC 消除带投递中断通知向量的中断。
5.  逻辑处理器将 PIR 逻辑或到 VIRR 中并清除 PIR。在读取 PIR（以确定要或入 VIRR 的内容）与清除之间，没有其他代理可以读或写 PIR 位（或位组）。
6.  逻辑处理器将 RVI 设置为 RVI 的旧值和 PIR 中设置的所有位的最高索引的最大值；如果 PIR 中没有位被设置，RVI 保持不变。
7.  逻辑处理器按第 32.2.1 节所述评估待处理的虚拟中断。

逻辑处理器以不可中断的方式执行以上步骤。如果步骤 #7 导致识别虚拟中断，处理器可以立即交付该中断。

当中断控制器向 CPU 核心交付未屏蔽的外部中断时，发生以上步骤 #1 到 #7。以下条目考虑中断交付的某些情况：

-   中断交付可以发生在 REP 前缀指令的迭代之间（在至少一次迭代已完成之后但在所有迭代完成之前）。如果发生这种情况，以下条目描述投递中断处理完成后且客户执行恢复前的处理器状态：
    -   RIP 引用 REP 前缀指令；
    -   RCX、RSI 和 RDI 被更新以反映已完成的迭代；且
    -   RFLAGS.RF = 1。
-   中断交付可以发生在逻辑处理器处于活动、HLT 或 MWAIT 状态时。如果逻辑处理器在中断到达前处于活动或 MWAIT 状态，它在步骤 #7 完成后处于活动状态；如果它在 HLT 状态，它在步骤 #7 后返回 HLT 状态（如果识别了挂起的虚拟中断，逻辑处理器可以立即从 HLT 状态唤醒）。
-   中断交付可以发生在逻辑处理器处于飞地模式时。如果逻辑处理器在中断到达前处于飞地模式，异步飞地退出（AEX）可以在步骤 #1 到 #7 之前发生（见第 40 章"飞地退出事件"）。如果在步骤 #1 前没有发生 AEX 且在步骤 #2 发生 VM 退出，AEX 在 VM 退出被交付之前发生。

## 32.7 虚拟化 SENDUIPI

用户中断特性包括 SENDUIPI 指令，CPL = 3 操作的系统软件可以使用它向另一软件线程发送用户中断（"用户 IPI"）。SENDUIPI 指令具有以下高级操作：

```python
从用户中断目标表读取所选条目；
使用条目中的地址读取被引用的用户投递中断描述符（UPID）；
更新 UPID 中的某些字段；
如果必要，发送 UPID 通知信息中指示的普通 IPI；
```

最后一步使用 UPID 中的两个字段：8 位通知向量（UPID.NV）和 32 位通知目标（APIC ID，UPID.NDST）。在 VMX 非根操作之外，处理器按如下实现最后一步：

-   如果本地 APIC 处于 xAPIC 模式，它将 UPID.NDST\[15:8\] 写入 ICR_HI\[31:24\]（从 IA32_APIC_BASE 偏移 310H），然后将 UPID.NV 写入 ICR_LO（偏移 300H）。
-   如果本地 APIC 处于 x2APIC 模式，它执行 ECX = 310H（ICR）、EAX = UPID.NV 且 EDX = UPID.NDST 的 WRMSR 执行会做的控制寄存器写。

在 VMX 非根操作中，该步骤的实现取决于"use TPR shadow"、"virtualize APIC accesses"和"IPI virtualization" VM 执行控制的设置：¹

1.  如果"use TPR shadow" VM 执行控制为 0，行为不被修改：逻辑处理器通过按上述（基于本地 APIC 的当前模式）向本地 APIC 的 ICR 写入来发送指定的 IPI。
2.  如果"use TPR shadow" VM 执行控制为 1 且"virtualize APIC accesses" VM 执行控制为 0，逻辑处理器按以下步骤虚拟化 x2APIC 模式 IPI 的发送：  
    a. 将 64 位值 Z 写入虚拟 APIC 页上偏移 300H（VICR），其中 Z\[7:0\] = UPID.NV（8 位虚拟向量），Z\[63:32\] = UPID.NDST（32 位虚拟 APIC ID）且 Z\[31:8\] = 000000H（指示物理寻址的固定模式 IPI）。  
    b. 如果"IPI virtualization" VM 执行控制为 1，使用向量 UPID.NV 和 32 位虚拟 APIC ID UPID.NDST 执行 IPI 虚拟化（第 32.1.6 节）。
3.  如果"use TPR shadow"和"virtualize APIC accesses" VM 执行控制都为 1，逻辑处理器按以下步骤虚拟化 xAPIC 模式 IPI 的发送：  
    a. 将 32 位值 X 写入虚拟 APIC 页上偏移 310H（VICR_HI），其中 X\[31:24\] = UPID.NDST\[15:8\]（8 位虚拟 APIC ID）且 X\[23:0\] = 000000H。²  
    b. 将 32 位值 Y 写入虚拟 APIC 页上偏移 300H（VICR_LO），其中 Y\[7:0\] = UPID.NV（8 位虚拟向量）且 Y\[31:8\] = 000000H（指示物理寻址的固定模式 IPI）。  
    c. 如果"IPI virtualization" VM 执行控制为 1，使用向量 UPID.NV 和 APIC ID UPID.NDST\[15:8\] 执行 IPI 虚拟化。IPI 虚拟化将仅使用来自 UPID 目标字段第 15:8 位的 8 位 APIC ID（早些时候写入 VICR_HI 第 31:24 位的 8 位值）。
4.  如果"use TPR shadow" VM 执行控制为 1 且"IPI virtualization" VM 执行控制为 0，发生 APIC-write VM 退出，就像对 APIC-access 页上页偏移 300H 有过写访问一样（见第 32.4.3.3 节）。

## 第 33 章 VMX 指令参考

## 33.1 概述

本章描述 Intel 64 和 IA-32 架构的虚拟机扩展（VMX）。VMX 旨在支持处理器硬件的虚拟化和充当多个客户软件环境主机的系统软件层。虚拟机扩展（VMX）包括五个管理虚拟机控制结构（VMCS）的指令、四个管理 VMX 操作的指令、两个 TLB 管理指令和两个供客户软件使用的指令。VMX 的额外细节在第 26 章到第 32 章中描述。

VMCS 维护指令的行为总结如下：

-   **VMPTRLD**——此指令接受内存中的单个 64 位源操作数。它使被引用的 VMCS 活动和当前，用此操作数加载 current-VMCS 指针并基于被引用 VMCS 区域中 VMCS-data 区的内容建立当前 VMCS。因为这样使被引用的 VMCS 活动，逻辑处理器可以开始在处理器上维护该 VMCS 的一些 VMCS 数据。
-   **VMPTRST**——此指令接受内存中的单个 64 位目标操作数。current-VMCS 指针被存储到目标操作数中。
-   **VMCLEAR**——此指令接受内存中的单个 64 位操作数。指令将被操作数引用的 VMCS 的启动状态设置为"clear"、使该 VMCS 不活动，并确保该 VMCS 的数据已被写入被引用 VMCS 区域中的 VMCS-data 区。如果操作数与 current-VMCS 指针相同，该指针被使无效。
-   **VMREAD**——此指令从 VMCS 读取组件（该字段的编码在寄存器操作数中给出）并将其存储到可能是寄存器或内存中的目标操作数中。
-   **VMWRITE**——此指令从可能是寄存器或内存中的源操作数向 VMCS 写入组件（该字段的编码在寄存器操作数中给出）。

VMX 管理指令的行为总结如下：

-   **VMLAUNCH**——此指令启动由 VMCS 管理的虚拟机。发生 VM 进入，将控制转移给 VM。
-   **VMRESUME**——此指令恢复由 VMCS 管理的虚拟机。发生 VM 进入，将控制转移给 VM。
-   **VMXOFF**——此指令使处理器离开 VMX 操作。
-   **VMXON**——此指令接受内存中的单个 64 位源操作数。它使逻辑处理器进入 VMX 根操作并使用操作数引用的内存支持 VMX 操作。

VMX 特定 TLB 管理指令的行为总结如下：

-   **INVEPT**——此指令使从扩展页表（EPT）推导的 TLB 和分页结构缓存中的条目无效。
-   **INVVPID**——此指令基于虚拟处理器标识符（VPID）使 TLB 和分页结构缓存中的条目无效。

以上指令都不能在兼容模式中执行；如果在兼容模式中执行，它们生成无效操作码异常。

客户可用指令的行为总结如下：

-   **VMCALL**——此指令允许 VMX 非根操作中的软件为服务调用 VMM。发生 VM 退出，将控制转移给 VMM。
-   **VMFUNC**——此指令允许 VMX 非根操作中的软件无 VM 退出地调用 VM 函数（由 VMX 根操作中的软件启用和配置的处理器功能）。

## 33.2 约定

第 33.3 节中 VMX 指令的操作部分使用伪函数 VMexit，它指示逻辑处理器执行 VM 退出。

操作部分还使用伪函数 VMsucceed、VMfail、VMfailInvalid 和 VMfailValid。这些伪函数通过设置或清除 RFLAGS 中的位以及在某些情况下写入 VM-instruction error 字段来发信号指示指令成功或失败。以下伪代码片段详述这些函数：

```python
VMsucceed:
CF := 0；
PF := 0；
AF := 0；
ZF := 0；
SF := 0；
OF := 0；

VMfail(ErrorNumber):
IF VMCS 指针有效
THEN VMfailValid(ErrorNumber)；
ELSE VMfailInvalid；
FI；

VMfailInvalid:
CF := 1；
PF := 0；
AF := 0；
ZF := 0；
SF := 0；
OF := 0；

VMfailValid(ErrorNumber):  // 仅当存在当前 VMCS 时执行
CF := 0；
PF := 0；
AF := 0；
ZF := 1；
SF := 0；
OF := 0；
将 VM-instruction error 字段设置为 ErrorNumber；
```

不同的 VM-instruction error 编号在第 33.4 节"VM Instruction Error Numbers"中枚举。

## 33.3 VMX 指令

本节提供 VMX 指令的详细描述。

支持 SEAM 的处理器还支持以下 SEAM 指令：SEAMCALL、SEAMOPS、SEAMRET 和 TDCALL。这些指令在第 35.5 节"SEAM Instruction Reference"中规定。

* * *

### INVEPT——使从 EPT 推导的转换无效

| 操作码/指令 | Op/En | 描述  |
| --- | --- | --- |
| 66 0F 38 80 INVEPT r64, m128 | RM  | 使 TLB 和分页结构缓存中 EPT 推导的条目无效（在 64 位模式中）。 |
| 66 0F 38 80 INVEPT r32, m128 | RM  | 使 TLB 和分页结构缓存中 EPT 推导的条目无效（在 64 位模式之外）。 |

**指令操作数编码**

| Op/En | 操作数 1 | 操作数 2 | 操作数 3 | 操作数 4 |
| --- | --- | --- | --- | --- |
| RM  | ModRM:reg (r) | ModRM:r/m (r) | NA  | NA  |

**描述**

使从扩展页表（EPT）推导的转换后备缓冲器（TLB）和分页结构缓存中的映射无效。（见第 31 章"VMX Support for Address Translation"。）使无效基于寄存器操作数中指定的 INVEPT 类型和内存操作数中指定的 INVEPT 描述符。

在 IA-32e 模式之外，寄存器操作数总是 32 位，无论 CS.D 的值如何；在 64 位模式中，寄存器操作数为 64 位（指令不能在兼容模式中执行）。

逻辑处理器支持的 INVEPT 类型在 IA32_VMX_EPT_VPID_CAP MSR 中报告（见附录 A"VMX Capability Reporting Facility"）。当前定义了两个 INVEPT 类型：

-   **单上下文使无效**。如果 INVEPT 类型为 1，逻辑处理器使与 INVEPT 描述符中指定的 EPT 指针（EPTP）第 51:12 位关联的所有映射无效。它也可能使其他映射无效。
-   **全局使无效**。如果 INVEPT 类型为 2，逻辑处理器使与所有 EPTP 关联的映射无效。

如果指定了不支持的 INVEPT 类型，指令失败。

INVEPT 使指示 EPTP 的所有指定映射无效，无论那些映射可能与哪些 VPID 和 PCID 值关联。

INVEPT 描述符包含 128 位，在第 63:0 位包含 64 位 EPTP 值（见图 33-1）。

```python
127                                    64  63                              0
┌─────────────────────────────────────┬───────────────────────────────────┐
│ 保留（必须为零）                      │ EPT 指针（EPTP）                   │
└─────────────────────────────────────┴───────────────────────────────────┘
```

**图 33-1. INVEPT 描述符**

**操作**

```python
IF（不在 VMX 操作中）或（CR0.PE = 0）或（RFLAGS.VM = 1）或（IA32_EFER.LMA = 1 且 CS.L = 0）
THEN #UD；
ELSIF 在 VMX 非根操作中
THEN VM exit；
ELSIF CPL > 0
THEN #GP(0)；
ELSE
  INVEPT_TYPE := 寄存器操作数的值；
  IF IA32_VMX_EPT_VPID_CAP MSR 指示处理器不支持 INVEPT_TYPE
  THEN VMfail(Invalid operand to INVEPT/INVVPID)；
  ELSE
    // INVEPT_TYPE 必须为 1 或 2
    INVEPT_DESC := 内存操作数的值；
    EPTP := INVEPT_DESC[63:0]；
    CASE INVEPT_TYPE OF
      1:
        // 单上下文使无效
        IF 带"enable EPT" VM 执行控制设置为 1（见第 29.2.1.1 节）的 VM 进入会因 EPTP 值失败
        THEN VMfail(Invalid operand to INVEPT/INVVPID)；
        ELSE
          使与 EPTP[51:12] 关联的映射无效；
          VMsucceed；
        FI；
        BREAK；
      2:
        // 全局使无效
        使与所有 EPTP 关联的映射无效；
        VMsucceed；
        BREAK；
    ESAC；
  FI；
FI；
```

**影响的标志**

见操作部分和第 33.2 节。

**保护模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果内存操作数有效地址在 CS、DS、ES、FS 或 GS 段限制之外。如果 DS、ES、FS 或 GS 寄存器包含不可用段。如果源操作数位于只执行代码段中。
-   #PF(fault-code)：如果在访问内存操作数时发生页错误。
-   #SS(0)：如果内存操作数有效地址在 SS 段限制之外。如果 SS 寄存器包含不可用段。
-   #UD：如果不在 VMX 操作中。如果逻辑处理器不支持 EPT（IA32_VMX_PROCBASED_CTLS2\[33\]=0）。如果逻辑处理器支持 EPT（IA32_VMX_PROCBASED_CTLS2\[33\]=1）但不支持 INVEPT 指令（IA32_VMX_EPT_VPID_CAP\[20\]=0）。

**实地址模式异常**

-   #UD：INVEPT 指令在实地址模式中不被识别。

**虚拟 8086 模式异常**

-   #UD：INVEPT 指令在虚拟 8086 模式中不被识别。

**兼容模式异常**

-   #UD：INVEPT 指令在兼容模式中不被识别。

**64 位模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果内存操作数在 CS、DS、ES、FS 或 GS 段中且内存地址为非规范形式。
-   #PF(fault-code)：如果在访问内存操作数时发生页错误。
-   #SS(0)：如果内存操作数在 SS 段中且内存地址为非规范形式。
-   #UD：如果不在 VMX 操作中。如果逻辑处理器不支持 EPT（IA32_VMX_PROCBASED_CTLS2\[33\]=0）。如果逻辑处理器支持 EPT（IA32_VMX_PROCBASED_CTLS2\[33\]=1）但不支持 INVEPT 指令（IA32_VMX_EPT_VPID_CAP\[20\]=0）。

* * *

### INVVPID——基于 VPID 使转换无效

| 操作码/指令 | Op/En | 描述  |
| --- | --- | --- |
| 66 0F 38 81 INVVPID r64, m128 | RM  | 基于 VPID 使 TLB 和分页结构缓存中的条目无效（在 64 位模式中）。 |
| 66 0F 38 81 INVVPID r32, m128 | RM  | 基于 VPID 使 TLB 和分页结构缓存中的条目无效（在 64 位模式之外）。 |

**指令操作数编码**

| Op/En | 操作数 1 | 操作数 2 | 操作数 3 | 操作数 4 |
| --- | --- | --- | --- | --- |
| RM  | ModRM:reg (r) | ModRM:r/m (r) | NA  | NA  |

**描述**

基于虚拟处理器标识符（VPID）使转换后备缓冲器（TLB）和分页结构缓存中的映射无效。（见第 31 章"VMX Support for Address Translation"。）使无效基于寄存器操作数中指定的 INVVPID 类型和内存操作数中指定的 INVVPID 描述符。

在 IA-32e 模式之外，寄存器操作数总是 32 位，无论 CS.D 的值如何；在 64 位模式中，寄存器操作数为 64 位（指令不能在兼容模式中执行）。

逻辑处理器支持的 INVVPID 类型在 IA32_VMX_EPT_VPID_CAP MSR 中报告（见附录 A"VMX Capability Reporting Facility"）。当前定义了四个 INVVPID 类型：

-   **单地址使无效**。如果 INVVPID 类型为 0，逻辑处理器使 INVVPID 描述符中指定的线性地址和 VPID 的映射无效。在某些情况下，它也可能使其他线性地址（或其他 VPID）的映射无效。
-   **单上下文使无效**。如果 INVVPID 类型为 1，逻辑处理器使带有 INVVPID 描述符中指定的 VPID 标记的所有映射无效。在某些情况下，它也可能使其他 VPID 的映射无效。
-   **全上下文使无效**。如果 INVVPID 类型为 2，逻辑处理器使带有除 VPID 0000H 之外的所有 VPID 标记的所有映射无效。在某些情况下，它也可能使带 VPID 0000H 的转换无效。
-   **保留全局转换的单上下文使无效**。如果 INVVPID 类型为 3，逻辑处理器使带有 INVVPID 描述符中指定的 VPID 标记的所有映射无效，除了全局转换。在某些情况下，它也可能使全局转换（和带其他 VPID 的映射）无效。全局转换的信息见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷第 5 章的"Caching Translation Information"部分。

如果指定了不支持的 INVVPID 类型，指令失败。

INVVPID 使指示 VPID 的所有指定映射无效，无论那些映射可能与哪些 EPTP 和 PCID 值关联。

INVVPID 描述符包含 128 位，由 VPID 和线性地址组成，如图 33-2 所示。

```python
127                                    64  63        48 47                      16  15        0
┌─────────────────────────────────────┬─────────────┬───────────────────────────┬─────────────┐
│ 保留（必须为零）                      │ 保留（必须为零）│ 线性地址                    │ VPID        │
└─────────────────────────────────────┴─────────────┴───────────────────────────┴─────────────┘
                                    63          16  15                        0
```

**图 33-2. INVVPID 描述符**

**操作**

```python
IF（不在 VMX 操作中）或（CR0.PE = 0）或（RFLAGS.VM = 1）或（IA32_EFER.LMA = 1 且 CS.L = 0）
THEN #UD；
ELSIF 在 VMX 非根操作中
THEN VM exit；
ELSIF CPL > 0
THEN #GP(0)；
ELSE
  INVVPID_TYPE := 寄存器操作数的值；
  IF IA32_VMX_EPT_VPID_CAP MSR 指示处理器不支持 INVVPID_TYPE
  THEN VMfail(Invalid operand to INVEPT/INVVPID)；
  ELSE
    // INVVPID_TYPE 必须在 0–3 范围内
    INVVPID_DESC := 内存操作数的值；
    IF INVVPID_DESC[63:16] ≠ 0
    THEN VMfail(Invalid operand to INVEPT/INVVPID)；
    ELSE
      CASE INVVPID_TYPE OF
        0:
          // 单地址使无效
          VPID := INVVPID_DESC[15:0]；
          IF VPID = 0
          THEN VMfail(Invalid operand to INVEPT/INVVPID)；
          ELSE
            GL_ADDR := INVVPID_DESC[127:64]；
            IF（GL_ADDR 不是规范形式）
            THEN
              VMfail(Invalid operand to INVEPT/INVVPID)；
            ELSE
              使带 VPID 标记的 GL_ADDR 的映射无效；
              VMsucceed；
            FI；
          FI；
          BREAK；
        1:
          // 单上下文使无效
          VPID := INVVPID_DESC[15:0]；
          IF VPID = 0
          THEN VMfail(Invalid operand to INVEPT/INVVPID)；
          ELSE
            使带 VPID 标记的所有映射无效；
            VMsucceed；
          FI；
          BREAK；
        2:
          // 全上下文使无效
          使带所有非零 VPID 标记的所有映射无效；
          VMsucceed；
          BREAK；
        3:
          // 保留全局的单上下文使无效
          VPID := INVVPID_DESC[15:0]；
          IF VPID = 0
          THEN VMfail(Invalid operand to INVEPT/INVVPID)；
          ELSE
            使带 VPID 标记的所有映射无效，除了全局转换；
            VMsucceed；
          FI；
          BREAK；
      ESAC；
    FI；
  FI；
FI；
```

**影响的标志**

见操作部分和第 33.2 节。

**保护模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果内存操作数有效地址在 CS、DS、ES、FS 或 GS 段限制之外。如果 DS、ES、FS 或 GS 寄存器包含不可用段。如果源操作数位于只执行代码段中。
-   #PF(fault-code)：如果在访问内存操作数时发生页错误。
-   #SS(0)：如果内存操作数有效地址在 SS 段限制之外。如果 SS 寄存器包含不可用段。
-   #UD：如果不在 VMX 操作中。如果逻辑处理器不支持 VPID（IA32_VMX_PROCBASED_CTLS2\[37\]=0）。如果逻辑处理器支持 VPID（IA32_VMX_PROCBASED_CTLS2\[37\]=1）但不支持 INVVPID 指令（IA32_VMX_EPT_VPID_CAP\[32\]=0）。

**实地址模式异常**

-   #UD：INVVPID 指令在实地址模式中不被识别。

**虚拟 8086 模式异常**

-   #UD：INVVPID 指令在虚拟 8086 模式中不被识别。

**兼容模式异常**

-   #UD：INVVPID 指令在兼容模式中不被识别。

**64 位模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果内存操作数在 CS、DS、ES、FS 或 GS 段中且内存地址为非规范形式。
-   #PF(fault-code)：如果在访问内存操作数时发生页错误。
-   #SS(0)：如果内存目标操作数在 SS 段中且内存地址为非规范形式。
-   #UD：如果不在 VMX 操作中。如果逻辑处理器不支持 VPID（IA32_VMX_PROCBASED_CTLS2\[37\]=0）。如果逻辑处理器支持 VPID（IA32_VMX_PROCBASED_CTLS2\[37\]=1）但不支持 INVVPID 指令（IA32_VMX_EPT_VPID_CAP\[32\]=0）。

* * *

### VMCALL——调用 VM 监视器

| 操作码/指令 | Op/En | 描述  |
| --- | --- | --- |
| 0F 01 C1 VMCALL | ZO  | 通过引起 VM 退出调用 VM 监视器。 |

**指令操作数编码**

| Op/En | 操作数 1 | 操作数 2 | 操作数 3 | 操作数 4 |
| --- | --- | --- | --- | --- |
| ZO  | NA  | NA  | NA  | NA  |

**描述**

此指令允许客户软件向底层 VM 监视器发起服务调用。此类调用的编程接口的细节是 VMM 特定的；此指令除了引起 VM 退出、注册适当的退出原因外不做任何事。

此指令在 VMX 根操作中的使用调用 SMM 监视器（见第 34.15.2 节）。如果尚未活动，此调用将激活系统管理模式中断（SMI）和系统管理模式（SMM）的双监视器处理（见第 34.15.6 节）。

**操作**

```python
IF 不在 VMX 操作中
THEN #UD；
ELSIF 在 VMX 非根操作中
THEN VM exit；
ELSIF（RFLAGS.VM = 1）或（IA32_EFER.LMA = 1 且 CS.L = 0）
THEN #UD；
ELSIF CPL > 0 或在 SEAM 根操作中
THEN #GP(0)；
ELSIF 在 SMM 中或逻辑处理器不支持 SMI 和 SMM 的双监视器处理或 IA32_SMM_MONITOR_CTL MSR 中的有效位被清除
THEN VMfail（VMCALL executed in VMX root operation）；
ELSIF SMI 和 SMM 的双监视器处理活动
THEN 执行 SMM VM 退出（见第 34.15.2 节）；
ELSIF current-VMCS 指针无效
THEN VMfailInvalid；
ELSIF 当前 VMCS 的启动状态不是 clear
THEN VMfailValid（VMCALL with non-clear VMCS）；
ELSIF VM-exit 控制字段无效（见第 34.15.6.1 节）
THEN VMfailValid（VMCALL with invalid VM-exit control fields）；
ELSE
  进入 SMM；
  读取 MSEG 中的版本标识符；
  IF 版本标识符与处理器支持的不匹配
  THEN
    离开 SMM；
    VMfailValid（VMCALL with incorrect MSEG revision identifier）；
  ELSE
    读取 MSEG 中的 SMM 监视器特性字段（见第 34.15.6.1 节）；
    IF 特性字段无效
    THEN
      离开 SMM；
      VMfailValid（VMCALL with invalid SMM-monitor features）；
    ELSE 激活 SMI 和 SMM 的双监视器处理（见第 34.15.6 节）；
    FI；
  FI；
FI；
```

**影响的标志**

见操作部分和第 33.2 节。

**保护模式异常**

-   #GP(0)：如果当前特权级别不为 0 且逻辑处理器在 VMX 根操作中。如果在 SEAM 根操作中。
-   #UD：如果在 VMX 操作之外执行。

**实地址模式异常**

-   #UD：如果在 VMX 操作之外执行。

**虚拟 8086 模式异常**

-   #UD：如果在 VMX 非根操作之外执行。

**兼容模式异常**

-   #UD：如果在 VMX 非根操作之外执行。

**64 位模式异常**

-   #UD：如果在 VMX 操作之外执行。

* * *

### VMCLEAR——清除虚拟机控制结构

| 操作码/指令 | Op/En | 描述  |
| --- | --- | --- |
| 66 0F C7 /6 VMCLEAR m64 | M   | 将 VMCS 数据复制到内存中的 VMCS 区域。 |

**指令操作数编码**

| Op/En | 操作数 1 | 操作数 2 | 操作数 3 | 操作数 4 |
| --- | --- | --- | --- | --- |
| M   | ModRM:r/m (r) | NA  | NA  | NA  |

**描述**

此指令应用于 VMCS 区域位于指令操作数包含的物理地址处的 VMCS。指令确保该 VMCS 的 VMCS 数据（其中一些数据可能当前在处理器上维护）被复制到内存中的 VMCS 区域。它还初始化 VMCS 区域的部分（例如，它将 VMCS 的启动状态设置为 clear）。见第 27 章"Virtual Machine Control Structures"。

此指令的操作数总是 64 位且总是在内存中。如果操作数是 current-VMCS 指针，则该指针被使无效（设置为 FFFFFFFF_FFFFFFFFH）。

注意 VMCLEAR 指令可能不显式地将任何 VMCS 数据写入内存；数据可能在 VMCLEAR 被执行前已经驻留在内存中。

**操作**

```python
IF（寄存器操作数）或（不在 VMX 操作中）或（CR0.PE = 0）或（RFLAGS.VM = 1）或（IA32_EFER.LMA = 1 且 CS.L = 0）
THEN #UD；
ELSIF 在 VMX 非根操作中
THEN VM exit；
ELSIF CPL > 0
THEN #GP(0)；
ELSE
  addr := 64 位内存操作数的内容；
  IF addr 未 4KB 对齐 或
  addr 设置超出处理器物理地址宽度的任何位¹,²
  THEN VMfail（VMCLEAR with invalid physical address）；
  ELSIF addr = VMXON 指针
  THEN VMfail（VMCLEAR with VMXON pointer）；
  ELSE
    确保操作数引用的 VMCS 的数据在内存中；
    初始化 VMCS 区域中的实现特定数据；
    操作数引用的 VMCS 的启动状态 := "clear"
    IF 操作数 addr = current-VMCS 指针
    THEN current-VMCS 指针 := FFFFFFFF_FFFFFFFFH；
    FI；
    VMsucceed；
  FI；
FI；
```

**影响的标志**

见操作部分和第 33.2 节。

**保护模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果内存操作数有效地址在 CS、DS、ES、FS 或 GS 段限制之外。如果 DS、ES、FS 或 GS 寄存器包含不可用段。如果操作数位于只执行代码段中。
-   #PF(fault-code)：如果在访问内存操作数时发生页错误。
-   #SS(0)：如果内存操作数有效地址在 SS 段限制之外。如果 SS 寄存器包含不可用段。
-   #UD：如果操作数是寄存器。如果不在 VMX 操作中。

**实地址模式异常**

-   #UD：VMCLEAR 指令在实地址模式中不被识别。

**虚拟 8086 模式异常**

-   #UD：VMCLEAR 指令在虚拟 8086 模式中不被识别。

**兼容模式异常**

-   #UD：VMCLEAR 指令在兼容模式中不被识别。

**64 位模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果源操作数在 CS、DS、ES、FS 或 GS 段中且内存地址为非规范形式。
-   #PF(fault-code)：如果在访问内存操作数时发生页错误。
-   #SS(0)：如果源操作数在 SS 段中且内存地址为非规范形式。
-   #UD：如果操作数是寄存器。如果不在 VMX 操作中。

* * *

### VMFUNC——调用 VM 函数

| 操作码/指令 | Op/En | 描述  |
| --- | --- | --- |
| NP 0F 01 D4 VMFUNC | ZO  | 调用 EAX 中指定的 VM 函数。 |

**指令操作数编码**

| Op/En | 操作数 1 | 操作数 2 | 操作数 3 | 操作数 4 |
| --- | --- | --- | --- | --- |
| ZO  | NA  | NA  | NA  | NA  |

**描述**

此指令允许 VMX 非根操作中的软件调用 VM 函数，它是 VMX 根操作中的软件启用和配置的处理器功能。EAX 的值选择被调用的特定 VM 函数  
。

每个 VM 函数的行为（包括任何额外故障检查）在第 28.5.7 节"VM Functions"中规定。

**操作**

```python
执行 EAX 中指定的 VM 函数的功能；
```

**影响的标志**

取决于 EAX 中指定的 VM 函数。见第 28.5.7 节"VM Functions"。

**保护模式异常（不包括特定 VM 函数定义的）**

-   #UD：如果在 VMX 非根操作之外执行。如果"enable VM functions" VM 执行控制为 0。如果 EAX ≥ 64。

**实地址模式异常**

与保护模式中的异常相同。

**虚拟 8086 异常**

与保护模式中的异常相同。

**兼容模式异常**

与保护模式中的异常相同。

**64 位模式异常**

与保护模式中的异常相同。

* * *

### VMLAUNCH/VMRESUME——启动/恢复虚拟机

| 操作码/指令 | Op/En | 描述  |
| --- | --- | --- |
| 0F 01 C2 VMLAUNCH | ZO  | 启动由当前 VMCS 管理的虚拟机。 |
| 0F 01 C3 VMRESUME | ZO  | 恢复由当前 VMCS 管理的虚拟机。 |

**指令操作数编码**

| Op/En | 操作数 1 | 操作数 2 | 操作数 3 | 操作数 4 |
| --- | --- | --- | --- | --- |
| ZO  | NA  | NA  | NA  | NA  |

**描述**

实现由当前 VMCS 管理的 VM 进入。

-   如果当前 VMCS 的启动状态不是"clear"，VMLAUNCH 失败。如果指令成功，它将启动状态设置为"launched"。
-   如果当前 VMCS 的启动状态不是"launched"，VMRESUME 失败。

如果尝试 VM 进入，逻辑处理器执行一系列一致性检查，如第 29 章"VM Entries"所详述。VMX 控制或主机状态区域检查失败将控制传递给 VMLAUNCH 或 VMRESUME 指令之后的指令。如果这些通过但客户状态区域检查失败，逻辑处理器从 VMCS 的主机状态区域加载状态，将控制传递给主机状态区域中 RIP 字段引用的指令。

当事件被 MOV SS 或 POP SS 阻止时，不允许 VM 进入。VMLAUNCH 和 VMRESUME 都不应在 MOV to SS 或 POP to SS 之后立即使用。

**操作**

```python
IF（不在 VMX 操作中）或（CR0.PE = 0）或（RFLAGS.VM = 1）或（IA32_EFER.LMA = 1 且 CS.L = 0）
THEN #UD；
ELSIF 在 VMX 非根操作中
THEN VMexit；
ELSIF CPL > 0
THEN #GP(0)；
ELSIF current-VMCS 指针无效
THEN VMfailInvalid；
ELSIF 事件被 MOV SS 阻止
THEN VMfailValid（VM entry with events blocked by MOV SS）；
ELSIF（VMLAUNCH 且当前 VMCS 的启动状态不是"clear"）
THEN VMfailValid（VMLAUNCH with non-clear VMCS）；
ELSIF（VMRESUME 且当前 VMCS 的启动状态不是"launched"）
THEN VMfailValid（VMRESUME with non-launched VMCS）；
ELSE
  检查 VMX 控制和主机状态区域的设置；
  IF 无效设置
  THEN VMfailValid（VM entry with invalid VMX-control field(s)）或
    VMfailValid（VM entry with invalid host-state field(s)）或
    VMfailValid（VM entry with invalid executive-VMCS pointer）或
    VMfailValid（VM entry with non-launched executive VMCS）或
    VMfailValid（VM entry with executive-VMCS pointer not VMXON pointer）或
    VMfailValid（VM entry with invalid VM-execution control fields in executive VMCS）
  视情况而定；
  ELSE
    按适当方式尝试加载客户状态和 PDPTR；
    清除地址范围监视；
    IF 检查客户状态或 PDPTR 失败
    THEN VM 进入失败（见第 29.8 节）；
    ELSE
      尝试从 VM-entry MSR-load 区域加载 MSR；
      IF 失败
      THEN VM 进入失败（见第 29.8 节）；
      ELSE
        IF VMLAUNCH
        THEN VMCS 的启动状态 := "launched"；
        FI；
        IF 在 SMM 中且"entry to SMM" VM-entry 控制为 0
        THEN
          IF "deactivate dual-monitor treatment" VM-entry 控制为 0
          THEN SMM-transfer VMCS 指针 := current-VMCS 指针；
          FI；
          IF executive-VMCS 指针是 VMXON 指针
          THEN current-VMCS 指针 := VMCS-link 指针；
          ELSE current-VMCS 指针 := executive-VMCS 指针；
          FI；
          离开 SMM；
        FI；
        VM 进入成功；
      FI；
    FI；
  FI；
FI；
```

VM 进入操作的进一步细节出现在第 29 章。

**影响的标志**

见操作部分和第 33.2 节。

**保护模式异常**

-   #GP(0)：如果当前特权级别不为 0。
-   #UD：如果在 VMX 操作之外执行。

**实地址模式异常**

-   #UD：VMLAUNCH 和 VMRESUME 指令在实地址模式中不被识别。

**虚拟 8086 模式异常**

-   #UD：VMLAUNCH 和 VMRESUME 指令在虚拟 8086 模式中不被识别。

**兼容模式异常**

-   #UD：VMLAUNCH 和 VMRESUME 指令在兼容模式中不被识别。

**64 位模式异常**

-   #GP(0)：如果当前特权级别不为 0。
-   #UD：如果在 VMX 操作之外执行。

* * *

### VMPTRLD——加载虚拟机控制结构指针

| 操作码/指令 | Op/En | 描述  |
| --- | --- | --- |
| NP 0F C7 /6 VMPTRLD m64 | M   | 从内存加载当前 VMCS 指针。 |

**指令操作数编码**

| Op/En | 操作数 1 | 操作数 2 | 操作数 3 | 操作数 4 |
| --- | --- | --- | --- | --- |
| M   | ModRM:r/m (r) | NA  | NA  | NA  |

**描述**

将 current-VMCS 指针标记为有效并用指令操作数中的物理地址加载它。如果操作数未正确对齐、设置不支持的物理地址位或等于 VMXON 指针，指令失败。此外，如果操作数引用的内存中的 32 位与此处理器支持的 VMCS 版本标识符不匹配，指令失败。¹

此指令的操作数总是 64 位且总是在内存中。

**操作**

```python
IF（寄存器操作数）或（不在 VMX 操作中）或（CR0.PE = 0）或（RFLAGS.VM = 1）或（IA32_EFER.LMA = 1 且 CS.L = 0）
THEN #UD；
ELSIF 在 VMX 非根操作中
THEN VMexit；
ELSIF CPL > 0
THEN #GP(0)；
ELSE
  addr := 64 位内存源操作数的内容；
  IF addr 未 4KB 对齐 或
  addr 设置超出物理地址宽度的任何位²,³
  THEN VMfail（VMPTRLD with invalid physical address）；
  ELSIF addr = VMXON 指针
  THEN VMfail（VMPTRLD with VMXON pointer）；
  ELSE
    rev := 位于物理地址 addr 处的 32 位；
    IF rev[30:0] ≠ 处理器支持的 VMCS 版本标识符 或
    rev[31] = 1 且处理器不支持"VMCS shadowing"的 1 设置
    THEN VMfail（VMPTRLD with incorrect VMCS revision identifier）；
    ELSE
      current-VMCS 指针 := addr；
      VMsucceed；
    FI；
  FI；
FI；
```

**影响的标志**

见操作部分和第 33.2 节。

**保护模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果内存源操作数有效地址在 CS、DS、ES、FS 或 GS 段限制之外。如果 DS、ES、FS 或 GS 寄存器包含不可用段。如果源操作数位于只执行代码段中。
-   #PF(fault-code)：如果在访问内存源操作数时发生页错误。
-   #SS(0)：如果内存源操作数有效地址在 SS 段限制之外。如果 SS 寄存器包含不可用段。
-   #UD：如果操作数是寄存器。如果不在 VMX 操作中。

**实地址模式异常**

-   #UD：VMPTRLD 指令在实地址模式中不被识别。

**虚拟 8086 模式异常**

-   #UD：VMPTRLD 指令在虚拟 8086 模式中不被识别。

**兼容模式异常**

-   #UD：VMPTRLD 指令在兼容模式中不被识别。

**64 位模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果源操作数在 CS、DS、ES、FS 或 GS 段中且内存地址为非规范形式。
-   #PF(fault-code)：如果在访问内存源操作数时发生页错误。
-   #SS(0)：如果源操作数在 SS 段中且内存地址为非规范形式。
-   #UD：如果操作数是寄存器。如果不在 VMX 操作中。

* * *

### VMPTRST——存储虚拟机控制结构指针

| 操作码/指令 | Op/En | 描述  |
| --- | --- | --- |
| NP 0F C7 /7 VMPTRST m64 | M   | 将当前 VMCS 指针存储到内存中。 |

**指令操作数编码**

| Op/En | 操作数 1 | 操作数 2 | 操作数 3 | 操作数 4 |
| --- | --- | --- | --- | --- |
| M   | ModRM:r/m (w) | NA  | NA  | NA  |

**描述**

将 current-VMCS 指针存储到指定内存地址。此指令的操作数总是 64 位且总是在内存中。

**操作**

```python
IF（寄存器操作数）或（不在 VMX 操作中）或（CR0.PE = 0）或（RFLAGS.VM = 1）或（IA32_EFER.LMA = 1 且 CS.L = 0）
THEN #UD；
ELSIF 在 VMX 非根操作中
THEN VMexit；
ELSIF CPL > 0
THEN #GP(0)；
ELSE
  64 位内存目标操作数 := current-VMCS 指针；
  VMsucceed；
FI；
```

**影响的标志**

见操作部分和第 33.2 节。

**保护模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果内存目标操作数有效地址在 CS、DS、ES、FS 或 GS 段限制之外。如果 DS、ES、FS 或 GS 寄存器包含不可用段。如果目标操作数位于只读数据段或任何代码段中。
-   #PF(fault-code)：如果在访问内存目标操作数时发生页错误。
-   #SS(0)：如果内存目标操作数有效地址在 SS 段限制之外。如果 SS 寄存器包含不可用段。
-   #UD：如果操作数是寄存器。如果不在 VMX 操作中。

**实地址模式异常**

-   #UD：VMPTRST 指令在实地址模式中不被识别。

**虚拟 8086 模式异常**

-   #UD：VMPTRST 指令在虚拟 8086 模式中不被识别。

**兼容模式异常**

-   #UD：VMPTRST 指令在兼容模式中不被识别。

**64 位模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果目标操作数在 CS、DS、ES、FS 或 GS 段中且内存地址为非规范形式。
-   #PF(fault-code)：如果在访问内存目标操作数时发生页错误。
-   #SS(0)：如果目标操作数在 SS 段中且内存地址为非规范形式。
-   #UD：如果操作数是寄存器。如果不在 VMX 操作中。

* * *

### VMREAD——从虚拟机控制结构读取字段

| 操作码/指令 | Op/En | 描述  |
| --- | --- | --- |
| NP 0F 78 VMREAD r/m64, r64 | MR  | 读取指定的 VMCS 字段（在 64 位模式中）。 |
| NP 0F 78 VMREAD r/m32, r32 | MR  | 读取指定的 VMCS 字段（在 64 位模式之外）。 |

**指令操作数编码**

| Op/En | 操作数 1 | 操作数 2 | 操作数 3 | 操作数 4 |
| --- | --- | --- | --- | --- |
| MR  | ModRM:r/m (w) | ModRM:reg (r) | NA  | NA  |

**描述**

从 VMCS 读取指定字段并将其存储到指定目标操作数（寄存器或内存）。在 VMX 根操作中，指令从当前 VMCS 读取。如果在 VMX 非根操作中执行，指令从当前 VMCS 中 VMCS link pointer 字段引用的 VMCS 读取。

VMCS 字段由寄存器源操作数包含的 VMCS 字段编码指定。在 IA-32e 模式之外，源操作数为 32 位，无论 CS.D 的值如何。在 64 位模式中，源操作数为 64 位。

目标操作数（可能是寄存器或内存）的有效大小在 IA-32e 模式之外总是 32 位（关于操作数大小，CS.D 的设置被忽略）且在 64 位模式中为 64 位。如果源操作数指定的 VMCS 字段短于此有效操作数大小，目标操作数的高位被清除为 0。如果 VMCS 字段更长，则字段的高位不被读取。

注意，由访问内存目标操作数产生的任何故障只能在确定相关 VMCS 指针有效且指定 VMCS 字段受支持之后发生（在下面的操作部分中）。

**操作**

```python
IF（不在 VMX 操作中）或（CR0.PE = 0）或（RFLAGS.VM = 1）或（IA32_EFER.LMA = 1 且 CS.L = 0）
THEN #UD；
ELSIF 在 VMX 非根操作中 且（"VMCS shadowing"为 0 或 源操作数设置 63:15 范围内的位 或
与源操作数第 14:0 位对应的 VMREAD 位为 1）¹
THEN VMexit；
ELSIF CPL > 0
THEN #GP(0)；
ELSIF（在 VMX 根操作中 且 current-VMCS 指针无效）或
（在 VMX 非根操作中 且 VMCS link 指针无效）
THEN VMfailInvalid；
ELSIF 源操作数不对应任何 VMCS 字段
THEN VMfailValid（VMREAD/VMWRITE from/to unsupported VMCS component）；
ELSE
  IF 在 VMX 根操作中
  THEN 目标操作数 := 当前 VMCS 中源操作数索引的字段的内容；
  ELSE 目标操作数 := VMCS link 指针引用的 VMCS 中源操作数索引的字段的内容；
  FI；
  VMsucceed；
FI；
```

**影响的标志**

见操作部分和第 33.2 节。

**保护模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果内存目标操作数有效地址在 CS、DS、ES、FS 或 GS 段限制之外。如果 DS、ES、FS 或 GS 寄存器包含不可用段。如果目标操作数位于只读数据段或任何代码段中。
-   #PF(fault-code)：如果在访问内存目标操作数时发生页错误。
-   #SS(0)：如果内存目标操作数有效地址在 SS 段限制之外。如果 SS 寄存器包含不可用段。
-   #UD：如果不在 VMX 操作中。

**实地址模式异常**

-   #UD：VMREAD 指令在实地址模式中不被识别。

**虚拟 8086 模式异常**

-   #UD：VMREAD 指令在虚拟 8086 模式中不被识别。

**兼容模式异常**

-   #UD：VMREAD 指令在兼容模式中不被识别。

**64 位模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果内存目标操作数在 CS、DS、ES、FS 或 GS 段中且内存地址为非规范形式。
-   #PF(fault-code)：如果在访问内存目标操作数时发生页错误。
-   #SS(0)：如果内存目标操作数在 SS 段中且内存地址为非规范形式。
-   #UD：如果不在 VMX 操作中。

* * *

### VMRESUME——恢复虚拟机

见 VMLAUNCH/VMRESUME——启动/恢复虚拟机。

* * *

### VMWRITE——向虚拟机控制结构写入字段

| 操作码/指令 | Op/En | 描述  |
| --- | --- | --- |
| NP 0F 79 VMWRITE r64, r/m64 | RM  | 写入指定的 VMCS 字段（在 64 位模式中）。 |
| NP 0F 79 VMWRITE r32, r/m32 | RM  | 写入指定的 VMCS 字段（在 64 位模式之外）。 |

**指令操作数编码**

| Op/En | 操作数 1 | 操作数 2 | 操作数 3 | 操作数 4 |
| --- | --- | --- | --- | --- |
| RM  | ModRM:reg (r) | ModRM:r/m (r) | NA  | NA  |

**描述**

将主源操作数（寄存器或内存）的内容写入 VMCS 中的指定字段。在 VMX 根操作中，指令写入当前 VMCS。如果在 VMX 非根操作中执行，指令写入当前 VMCS 中 VMCS link pointer 字段引用的 VMCS。

VMCS 字段由寄存器次级源操作数包含的 VMCS 字段编码指定。在 IA-32e 模式之外，次级源操作数总是 32 位，无论 CS.D 的值如何。在 64 位模式中，次级源操作数为 64 位。

主源操作数（可能是寄存器或内存）的有效大小在 IA-32e 模式之外总是 32 位（关于操作数大小，CS.D 的设置被忽略）且在 64 位模式中为 64 位。如果次级源操作数指定的 VMCS 字段短于此有效操作数大小，主源操作数的高位被忽略。如果 VMCS 字段更长，则字段的高位被清除为 0。

注意，由访问内存源操作数产生的任何故障发生在确定相关 VMCS 指针有效之后但在确定目标 VMCS 字段受支持之前。

**操作**

```python
IF（不在 VMX 操作中）或（CR0.PE = 0）或（RFLAGS.VM = 1）或（IA32_EFER.LMA = 1 且 CS.L = 0）
THEN #UD；
ELSIF 在 VMX 非根操作中 且（"VMCS shadowing"为 0 或 次级源操作数设置 63:15 范围内的位 或
与次级源操作数第 14:0 位对应的 VMWRITE 位为 1）¹
THEN VMexit；
ELSIF CPL > 0
THEN #GP(0)；
ELSIF（在 VMX 根操作中 且 current-VMCS 指针无效）或
（在 VMX 非根操作中 且 VMCS-link 指针无效）
THEN VMfailInvalid；
ELSIF 次级源操作数不对应任何 VMCS 字段
THEN VMfailValid（VMREAD/VMWRITE from/to unsupported VMCS component）；
ELSIF 次级源操作数索引的 VMCS 字段是 VM-exit 信息字段 且
处理器不支持写入此类字段²
THEN VMfailValid（VMWRITE to read-only VMCS component）；
ELSE
  IF 在 VMX 根操作中
  THEN 当前 VMCS 中次级源操作数索引的字段 := 主源操作数；
  ELSE VMCS link 指针引用的 VMCS 中次级源操作数索引的字段 := 主源操作数；
  FI；
  VMsucceed；
FI；
```

**影响的标志**

见操作部分和第 33.2 节。

**保护模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果内存源操作数有效地址在 CS、DS、ES、FS 或 GS 段限制之外。如果 DS、ES、FS 或 GS 寄存器包含不可用段。如果源操作数位于只执行代码段中。
-   #PF(fault-code)：如果在访问内存源操作数时发生页错误。
-   #SS(0)：如果内存源操作数有效地址在 SS 段限制之外。如果 SS 寄存器包含不可用段。
-   #UD：如果不在 VMX 操作中。

**实地址模式异常**

-   #UD：VMWRITE 指令在实地址模式中不被识别。

**虚拟 8086 模式异常**

-   #UD：VMWRITE 指令在虚拟 8086 模式中不被识别。

**兼容模式异常**

-   #UD：VMWRITE 指令在兼容模式中不被识别。

**64 位模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果内存源操作数在 CS、DS、ES、FS 或 GS 段中且内存地址为非规范形式。
-   #PF(fault-code)：如果在访问内存源操作数时发生页错误。
-   #SS(0)：如果内存源操作数在 SS 段中且内存地址为非规范形式。
-   #UD：如果不在 VMX 操作中。

* * *

### VMXOFF——离开 VMX 操作

| 操作码/指令 | Op/En | 描述  |
| --- | --- | --- |
| 0F 01 C4 VMXOFF | ZO  | 离开 VMX 操作。 |

**指令操作数编码**

| Op/En | 操作数 1 | 操作数 2 | 操作数 3 | 操作数 4 |
| --- | --- | --- | --- | --- |
| ZO  | NA  | NA  | NA  | NA  |

**描述**

使逻辑处理器脱离 VMX 操作、解除 INIT 信号的阻塞、有条件地重新启用 A20M 并清除任何地址范围监视。¹

**操作**

```python
IF（不在 VMX 操作中）或（CR0.PE = 0）或（RFLAGS.VM = 1）或（IA32_EFER.LMA = 1 且 CS.L = 0）
THEN #UD；
ELSIF 在 VMX 非根操作中
THEN VMexit；
ELSIF CPL > 0 或在 SEAM 根操作中
THEN #GP(0)；
ELSIF SMI 和 SMM 的双监视器处理活动
THEN VMfail（VMXOFF under dual-monitor treatment of SMIs and SMM）；
ELSE
  离开 VMX 操作；
  解除 INIT 阻塞；
  IF IA32_SMM_MONITOR_CTL[2] = 0²
  THEN 解除 SMI 阻塞；
  IF 在 SMX 操作之外³
  THEN 解除阻塞并启用 A20M；
  FI；
  IF 处理器支持 SEAM
  THEN 确保每个活动 SEAM VMCS 的数据在相应 VMCS 区域的内存中；
  FI；
  清除地址范围监视；
  VMsucceed；
FI；
```

**影响的标志**

见操作部分和第 33.2 节。

**保护模式异常**

-   #GP(0)：如果在 VMX 根操作中以 CPL > 0 执行。如果在 SEAM 根操作中。
-   #UD：如果在 VMX 操作之外执行。

**实地址模式异常**

-   #UD：VMXOFF 指令在实地址模式中不被识别。

**虚拟 8086 模式异常**

-   #UD：VMXOFF 指令在虚拟 8086 模式中不被识别。

**兼容模式异常**

-   #UD：VMXOFF 指令在兼容模式中不被识别。

**64 位模式异常**

-   #GP(0)：如果在 VMX 根操作中以 CPL > 0 执行。如果在 SEAM 根操作中。
-   #UD：如果在 VMX 操作之外执行。

* * *

### VMXON——进入 VMX 操作

| 操作码/指令 | Op/En | 描述  |
| --- | --- | --- |
| F3 0F C7 /6 VMXON m64 | M   | 进入 VMX 根操作。 |

**指令操作数编码**

| Op/En | 操作数 1 | 操作数 2 | 操作数 3 | 操作数 4 |
| --- | --- | --- | --- | --- |
| M   | ModRM:r/m (r) | NA  | NA  | NA  |

**描述**

使逻辑处理器进入无当前 VMCS 的 VMX 操作、阻塞 INIT 信号、禁用 A20M 并清除由 MONITOR 指令建立的任何地址范围监视。¹

此指令的操作数是引用 VMXON 区域的 4KB 对齐物理地址（VMXON 指针），逻辑处理器可以使用它支持 VMX 操作。此操作数总是 64 位且总是在内存中。

**操作**

```python
IF（寄存器操作数）或（CR0.PE = 0）或（CR4.VMXE = 0）或（RFLAGS.VM = 1）或（IA32_EFER.LMA = 1 且 CS.L = 0）
THEN #UD；
ELSIF 不在 VMX 操作中
THEN
  IF（CPL > 0）或（在 A20M 模式中）或
  （CR0 和 CR4 的值在 VMX 操作中不受支持；见第 26.8 节）或
  （IA32_FEATURE_CONTROL MSR 的第 0 位（锁定位）被清除）或
  （在 SMX 操作中² 且 IA32_FEATURE_CONTROL MSR 的第 1 位被清除）或
  （在 SMX 操作之外 且 IA32_FEATURE_CONTROL MSR 的第 2 位被清除）
  THEN #GP(0)；
  ELSE
    addr := 64 位内存源操作数的内容；
    IF addr 未 4KB 对齐 或
    addr 设置超出物理地址宽度的任何位³,⁴
    THEN VMfailInvalid；
    ELSE
      rev := 位于物理地址 addr 处的 32 位；
      IF rev[30:0] ≠ 处理器支持的 VMCS 版本标识符 或 rev[31] = 1
      THEN VMfailInvalid；
      ELSE
        current-VMCS 指针 := FFFFFFFF_FFFFFFFFH；
        进入 VMX 操作；
        阻塞 INIT 信号；
        阻塞并禁用 A20M；
        清除地址范围监视；
        IF 处理器支持 Intel PT 但不允许在 VMX 操作中使用它¹
        THEN IA32_RTIT_CTL.TraceEn := 0；
        FI；
        VMsucceed；
      FI；
    FI；
  FI；
ELSIF 在 VMX 非根操作中
THEN VMexit；
ELSIF CPL > 0
THEN #GP(0)；
ELSE VMfail（"VMXON executed in VMX root operation"）；
FI；
```

**影响的标志**

见操作部分和第 33.2 节。

**保护模式异常**

-   #GP(0)：如果在 VMX 操作之外以 CPL > 0 或无效 CR0 或 CR4 固定位执行。如果在 A20M 模式中执行。如果内存源操作数有效地址在 CS、DS、ES、FS 或 GS 段限制之外。如果 DS、ES、FS 或 GS 寄存器包含不可用段。如果源操作数位于只执行代码段中。如果 IA32_FEATURE_CONTROL MSR 的值不支持在当前处理器模式中进入 VMX 操作。
-   #PF(fault-code)：如果在访问内存源操作数时发生页错误。
-   #SS(0)：如果内存源操作数有效地址在 SS 段限制之外。如果 SS 寄存器包含不可用段。
-   #UD：如果操作数是寄存器。如果以 CR4.VMXE = 0 执行。

**实地址模式异常**

-   #UD：VMXON 指令在实地址模式中不被识别。

**虚拟 8086 模式异常**

-   #UD：VMXON 指令在虚拟 8086 模式中不被识别。

**兼容模式异常**

-   #UD：VMXON 指令在兼容模式中不被识别。

**64 位模式异常**

-   #GP(0)：如果在 VMX 操作之外以 CPL > 0 或无效 CR0 或 CR4 固定位执行。如果在 A20M 模式中执行。如果源操作数在 CS、DS、ES、FS 或 GS 段中且内存地址为非规范形式。如果 IA32_FEATURE_CONTROL MSR 的值不支持在当前处理器模式中进入 VMX 操作。
-   #PF(fault-code)：如果在访问内存源操作数时发生页错误。
-   #SS(0)：如果源操作数在 SS 段中且内存地址为非规范形式。
-   #UD：如果操作数是寄存器。如果以 CR4.VMXE = 0 执行。

## 33.4 VM 指令错误编号

对于某些错误条件，VM-instruction error 字段被加载错误编号以指示错误的来源。表 33-1 列出 VM 指令错误编号。

**表 33-1. VM 指令错误编号**

| 错误编号 | 描述  |
| --- | --- |
| 1   | 在 VMX 根操作中执行的 VMCALL |
| 2   | 带无效物理地址的 VMCLEAR |
| 3   | 带 VMXON 指针的 VMCLEAR |
| 4   | 带非 clear VMCS 的 VMLAUNCH |
| 5   | 带非 launched VMCS 的 VMRESUME |
| 6   | VMXOFF 后的 VMRESUME（在 VMLAUNCH 和 VMRESUME 之间的 VMXOFF 和 VMXON）a |
| 7   | 带无效控制字段的 VM 进入b,c |
| 8   | 带无效主机状态字段的 VM 进入b |
| 9   | 带无效物理地址的 VMPTRLD |
| 10  | 带 VMXON 指针的 VMPTRLD |
| 11  | 带错误 VMCS 版本标识符的 VMPTRLD |
| 12  | 从不支持的 VMCS 组件读取的 VMREAD/向不支持的 VMCS 组件写入的 VMWRITE |
| 13  | 向只读 VMCS 组件写入的 VMWRITE |
| 15  | 在 VMX 根操作中执行的 VMXON |
| 16  | 带无效 executive-VMCS 指针的 VM 进入b |
| 17  | 带非 launched executive VMCS 的 VM 进入b |
| 18  | 带不是 VMXON 指针的 executive-VMCS 指针的 VM 进入（当尝试停用 SMI 和 SMM 的双监视器处理时）b |
| 19  | 带非 clear VMCS 的 VMCALL（当尝试激活 SMI 和 SMM 的双监视器处理时） |
| 20  | 带无效 VM-exit 控制字段的 VMCALL |
| 22  | 带错误 MSEG 版本标识符的 VMCALL（当尝试激活 SMI 和 SMM 的双监视器处理时） |
| 23  | SMI 和 SMM 的双监视器处理下的 VMXOFF |
| 24  | 带无效 SMM 监视器特性的 VMCALL（当尝试激活 SMI 和 SMM 的双监视器处理时） |
| 25  | 带 executive VMCS 中无效 VM 执行控制字段的 VM 进入（当尝试从 SMM 返回时）b,c |
| 26  | 带由 MOV SS 阻止的事件的 VM 进入 |
| 28  | INVEPT/INVVPID 的无效操作数 |

**注：**

a. 本手册的早期版本将此错误描述为"带损坏 VMCS 的 VMRESUME"。  
b. 对控制字段和主机状态字段的 VM 进入检查可以按任何顺序执行。因此，由一个错误编号指示一种原因不意味着不存在其他错误。不同处理器可能对相同 VMCS 给出不同错误编号。  
c. 错误编号 7 不用于由于 executive VMCS 中无效 VM 执行控制字段而失败的从 SMM 返回的 VM 进入。错误编号 25 用于这些情况。

## 第 34 章 系统管理模式

本章描述用于系统管理模式（SMM）的 IA-64 和 IA-32 架构的方面。

SMM 提供一种备用的操作环境，可用于监视和管理各种系统资源以实现更高效的能源使用、控制系统硬件和/或运行专有代码。它是在 Intel386 SL 处理器（Intel386 处理器的移动专用版本）中引入 IA-32 架构的。它也可用于 Pentium M、Pentium 4、Intel Xeon、P6 系列以及 Pentium 和 Intel486 处理器（从增强版 Intel486 SL 和 Intel486 处理器开始）。

## 34.1 系统管理模式概述

SMM 是为处理系统级功能（如电源管理、系统硬件控制或专有 OEM 设计代码）提供的专用操作模式。它仅供系统固件使用，不供应用软件或通用系统软件使用。SMM 的主要好处是它提供一种独特且易于隔离的处理器环境，该环境对操作系统或执行程序以及软件应用透明地操作。

当通过系统管理中断（SMI）调用 SMM 时，处理器保存处理器的当前状态（处理器上下文），然后切换到由新地址空间定义的独立操作环境。系统管理软件执行程序（SMI 处理程序）在该环境中开始执行，且 SMI 处理程序的关键代码和数据驻留在该地址空间内的物理内存区域（SMRAM）中。

在 SMM 中，处理器执行 SMI 处理程序代码以执行诸如关闭未使用的磁盘驱动器或监视器、执行专有代码或将整个系统置于挂起状态等操作。当 SMI 处理程序完成其操作时，它执行恢复（RSM）指令。此指令使处理器重新加载处理器的已保存上下文、切换回保护或实模式，并恢复执行被中断的应用或操作系统程序或任务。

以下 SMM 机制使其对应用程序和操作系统透明：

-   进入 SMM 的唯一方式是通过 SMI。
-   处理器在可从其他操作模式访问的独立地址空间中执行 SMM 代码。
-   进入 SMM 时，处理器保存被中断程序或任务的上下文。
-   所有通常由操作系统处理的中断在进入 SMM 时被禁用。
-   RSM 指令只能在 SMM 中执行。

第 34.3 节描述进出 SMM 的转换。进入 SMM 后的执行环境是禁用分页的实地址模式（CR0.PE = CR0.PG = 0）。在此初始执行环境中，SMI 处理程序可以寻址最多 4 GBytes 的内存并可执行所有 I/O 和系统指令。第 34.5 节详细描述 SMI 处理程序的初始 SMM 执行环境以及该环境内的操作。SMI 处理程序随后可以在保持 SMM 的同时切换到其他操作模式。

> **注**  
> 软件开发人员应该知道，即使在 SMI 之前逻辑处理器正在使用物理地址扩展（PAE）机制（在 P6 系列处理器中引入）或处于 IA-32e 模式，在 SMI 交付之后情况将不再如此。这是因为 SMI 的交付禁用分页（见表 34-4）。（如果 SMI 和 SMM 的双监视器处理活动，这不适用；见第 34.15 节。）

### 34.1.1 系统管理模式和 VMX 操作

传统上，SMM 服务系统管理中断，然后恢复程序执行（回到由执行程序和应用程序组成的软件栈；见第 34.2 节到第 34.13 节）。

使用 VMX 的虚拟机监视器（VMM）可以充当多个虚拟机的主机，且每个虚拟机可以支持自己的执行程序和应用程序软件栈。在支持 VMX 的处理器上，虚拟机扩展可以以下两种方式之一使用系统管理中断（SMI）和系统管理模式（SMM）：

-   **默认处理**。系统固件处理 SMI。处理器在进入 SMM 时保存架构状态和与 VMX 操作相关的关键状态。当固件完成服务 SMI 时，它使用 RSM 恢复 VMX 操作。
-   **双监视器处理**。两个 VM 监视器协作控制 SMI 的服务：一个 VMM 在 SMM 之外操作以提供支持客户的基本虚拟化；另一个 VMM 在 SMM 内部（在 VMX 操作中）操作以支持系统管理功能。前者被称为执行监视器，后者被称为 SMM 转移监视器（STM）。¹

默认处理在第 34.14 节"Default Treatment of SMIs and SMM with VMX Operation and SMX Operation"中描述。SMM 的双监视器处理在第 34.15 节"Dual-Monitor Treatment of SMIs and SMM"中描述。

## 34.2 系统管理中断（SMI）

进入 SMM 的唯一方式是通过处理器上的 SMI# 引脚发信号或通过 APIC 总线接收的 SMI 消息发信号 SMI。SMI 是非可屏蔽外部中断，独立于处理器的中断和异常处理机制以及本地 APIC 操作。SMI 优先于 NMI 和可屏蔽中断。SMM 不可重入；也就是说，处理器在 SMM 中时 SMI 被禁用。

> **注**  
> 在 Pentium 4、Intel Xeon 和 P6 系列处理器中，当在 MP 初始化序列期间被指定为应用处理器的处理器正在等待启动 IPI（SIPI）时，它处于 SMI 被屏蔽的模式。然而，如果在应用处理器处于 wait for SIPI 模式时接收到 SMI，SMI 将被挂起。处理器然后在收到 SIPI 时立即服务挂起的 SMI 并在处理 SIPI 之前进入 SMM。  
> 在 STI、MOV to SS 或 POP into SS 执行后的一条指令，SMI 可能被阻塞。

## 34.3 在 SMM 和其他处理器操作模式之间切换

图 2-3 显示处理器如何在 SMM 和其他处理器操作模式（保护、实地址和虚拟 8086）之间移动。当处理器处于实地址、保护或虚拟 8086 模式时发信号 SMI 总是使处理器切换到 SMM。执行 RSM 指令时，处理器总是返回发生 SMI 时它所处的模式。

### 34.3.1 进入 SMM

处理器总是在程序执行的架构定义"可中断"点（通常位于 IA-32 架构指令边界）处理 SMI。当处理器接收 SMI 时，它等待所有指令退役且所有存储完成。处理器然后在 SMRAM 中保存其当前上下文（见第 34.4 节）、进入 SMM 并开始执行 SMI 处理程序。

进入 SMM 时，处理器向外部硬件发信号指示 SMI 处理已开始。使用的发信号机制是实现相关的。对于 P6 系列处理器，在系统总线上生成 SMI 确认事务，且每当处理器在 SMM 中生成总线事务时，复用状态信号 EXF4 被断言。对于 Pentium 和 Intel486 处理器，SMIACT# 引脚被断言。

SMI 具有比调试异常和外部中断更高的优先级。因此，如果 NMI、可屏蔽硬件中断或调试异常与 SMI 一起发生在指令边界，只处理 SMI。处理器在 SMM 中时，后续 SMI 请求不被确认。处理器在 SMM 中时发生的第一个 SMI 中断请求（即，在 SMM 已向外部硬件确认之后）被锁存并在处理器用 RSM 指令退出 SMM 时被服务。处理器在 SMM 中只锁存一个 SMI。

SMM 中执行环境的详细描述见第 34.5 节。

### 34.3.2 退出 SMM

退出 SMM 的唯一方式是执行 RSM 指令。RSM 指令仅对 SMI 处理程序可用；如果处理器不在 SMM 中，尝试执行 RSM 指令导致生成无效操作码异常（#UD）。

RSM 指令通过将状态保存映像从 SMRAM 加载回处理器的寄存器来恢复处理器上下文。处理器然后在系统总线上返回 SMIACK 事务并将程序控制返回给被中断的程序。

> **注**  
> 在支持影子栈特性的处理器上，RSM 从 SMRAM 中的状态保存映像加载 SSP 寄存器（见表 34-3）。在加载到 SSP 之前，该值通过符号扩展成为规范的。  
> 在支持 Intel® SGX 的处理器上，RSM 查看 SMRAM 中的"incident to enclave mode"位（见表 34-3）。如果它被设置，RSM 之后挂起事件的 FRED 事件交付或后续 VM 退出将指示它是飞地模式偶发的。细节见第 8.3.2.1 节和第 30.2.1 节。

在 RSM 指令成功完成后，处理器向外部硬件发信号指示 SMM 已被退出。对于 P6 系列处理器，在系统总线上生成 SMI 确认事务，且总线周期上不再生成复用状态信号 EXF4。对于 Pentium 和 Intel486 处理器，SMIACT# 引脚被释放。

如果处理器检测到 SMRAM 中保存的无效状态信息，它进入关闭状态并生成特殊总线周期以指示已进入关闭状态。关闭只在以下情况下发生：

-   对 CR4 的写上控制寄存器 CR4 中的保留位被设置为 1。除非 SMI 处理程序代码修改 SMRAM 保存状态映射的保留区域（见第 34.4.1 节），此错误不应发生。CR4 保存在状态映射中的保留位置且不能在其保存状态中被读取或修改。
-   无效位组合被写入控制寄存器 CR0，特别是 PG 设置为 1 且 PE 设置为 0，或 NW 设置为 1 且 CD 设置为 0。
-   CR4.PCIDE 将被设置为 1 且 IA32_EFER.LMA 为 0。
-   （仅适用于 Pentium 和 Intel486 处理器。）如果执行 RSM 指令时 SMBASE 寄存器中存储的地址未在 32-KByte 边界对齐。此限制不适用于 P6 系列处理器。
-   CR4.CET 将被设置为 1 且 CR0.WP 为 0。
-   CR4.FRED 将被设置为 1 且以下任一适用：
    -   IA32_EFER.LMA 将为 0。
    -   CPL 将为 1 或 2。
    -   CPL 将为 0，且逻辑处理器将处于兼容模式。
    -   CPL 将为 3，且 IOPL 将非零。

在关闭状态中，Intel 处理器停止执行指令直到断言 RESET#、INIT# 或 NMI#。虽然 Pentium 系列处理器在关闭状态识别 SMI# 信号，P6 系列和 Intel486 处理器不识别。Intel 不支持使用 SMI# 从关闭状态恢复任何处理器系列；处理器在此情况下的响应没有明确定义。在 Pentium 4 及更高处理器上，关闭将抑制 INTR 和 A20M 但不会更改任何其他抑制。在这些处理器上，如果未在 SMI 处理程序中采取行动解除抑制，NMI 将被抑制（见第 34.8 节）。

如果在接收 SMI 时处理器处于 HALT 状态，处理器处理从 SMM 的返回略有不同（见第 34.10 节）。此外，SMBASE 地址可以在从 SMM 返回时被更改（见第 34.11 节）。

## 34.4 SMRAM

进入 SMM 时，处理器切换到新地址空间。因为进入 SMM 时分页被禁用，此初始地址空间将所有内存访问映射到处理器物理地址空间的低 4 GBytes。SMI 处理程序的关键代码和数据驻留在称为系统管理 RAM（SMRAM）的内存区域中。处理器使用 SMRAM 内预定义的区域保存处理器的 SMI 前上下文。SMRAM 也可用于存储系统管理信息（如系统配置和关于断电设备的特定信息）和 OEM 特定信息。

默认 SMRAM 大小为 64 KBytes，从物理内存中称为 SMBASE 的基础物理地址开始（见图 34-1）。硬件复位后 SMBASE 的默认值是 30000H。处理器在地址 \[SMBASE + 8000H\] 寻找 SMI 处理程序的第一条指令。它将处理器状态存储在从 \[SMBASE + FE00H\] 到 \[SMBASE + FFFFH\] 的区域中。状态保存区域的映射描述见第 34.4.1 节。

系统逻辑最少需要解码从 \[SMBASE + 8000H\] 到 \[SMBASE + FFFFH\] 的 SMRAM 物理地址范围。如果需要可以解码更大的区域。此 SMRAM 的大小可以在 32 KBytes 到 4 GBytes 之间。

可以通过更改 SMBASE 值来更改 SMRAM 的位置（见第 34.11 节）。应该注意，多处理器系统中的所有处理器都初始化为相同的 SMBASE 值（30000H）。初始化软件必须依次将每个处理器置于 SMM 并更改其 SMBASE，使其不与其他处理器的重叠。

SMRAM 的实际物理位置可以在系统内存中或在独立 RAM 内存中。处理器在接收 SMI 时生成 SMI 确认事务（P6 系列处理器）或断言 SMIACT# 引脚（Pentium 和 Intel486 处理器）（见第 34.3.1 节）。

系统逻辑可以使用 SMI 确认事务或 SMIACT# 引脚的断言来解码对 SMRAM 的访问并在（如果需要）时将它们重定向到特定 SMRAM 内存。如果为 SMRAM 使用独立 RAM 内存，系统逻辑应提供可编程的方法，在处理器不在 SMM 时将 SMRAM 映射到系统内存空间。此机制将使启动过程能够在 SMM 期间执行 SMI 处理程序之前初始化 SMRAM 空间（即，加载 SMI 处理程序）。

### 34.4.1 SMRAM 状态保存映射

当不支持 Intel 64 架构的 IA-32 处理器最初进入 SMM 时，它将状态写入 SMRAM 的状态保存区域。状态保存区域从 \[SMBASE + 8000H + 7FFFH\] 开始并向下延伸到 \[SMBASE + 8000H + 7E00H\]。表 34-1 显示状态保存映射。第 1 列中的偏移是相对于 SMBASE 值加 8000H 的。保留空间不应被软件使用。

SMRAM 状态保存区域中的一些寄存器（第 3 列标记为 YES 的）可以被 SMI 处理程序读取和更改，更改后的值由 RSM 指令恢复到处理器寄存器。一些寄存器映像是只读的，且不得被修改（修改这些寄存器将导致不可预测的行为）。SMI 处理程序不应依赖存储在标记为保留的区域中的任何值。

**SMRAM 使用**

```python
SMBASE + FFFFH  ←  状态保存区域开始
...
SMBASE + 8000H  ←  SMI 处理程序入口点
...
SMBASE
```

**图 34-1. SMRAM 使用**

**表 34-1. SMRAM 状态保存映射**

| 偏移（加到 SMBASE + 8000H） | 寄存器 | 可写？ |
| --- | --- | --- |
| 7FFCH | CR0 | 否   |
| 7FF8H | CR3 | 否   |
| 7FF4H | EFLAGS | 是   |
| 7FF0H | EIP | 是   |
| 7FECH | EDI | 是   |
| 7FE8H | ESI | 是   |
| 7FE4H | EBP | 是   |
| 7FE0H | ESP | 是   |
| 7FDCH | EBX | 是   |
| 7FD8H | EDX | 是   |
| 7FD4H | ECX | 是   |
| 7FD0H | EAX | 是   |
| 7FCCH | DR6 | 否   |
| 7FC8H | DR7 | 否   |
| 7FC4H | TR1 | 否   |
| 7FC0H | 保留  | 否   |
| 7FBCH | GS¹ | 否   |
| 7FB8H | FS¹ | 否   |
| 7FB4H | DS¹ | 否   |
| 7FB0H | SS¹ | 否   |
| 7FACH | CS¹ | 否   |
| 7FA8H | ES¹ | 否   |
| 7FA4H | I/O 状态字段，见第 34.7 节 | 否   |
| 7FA0H | I/O 内存地址字段，见第 34.7 节 | 否   |
| 7F9FH–7F03H | 保留  | 否   |
| 7F02H | 自动 HALT 重启字段（字） | 是   |
| 7F00H | I/O 指令重启字段（字） | 是   |
| 7EFCH | SMM 版本标识符字段（双字） | 否   |
| 7EF8H | SMBASE 字段（双字） | 是   |
| 7EF7H–7E00H | 保留  | 否   |

**注：**

1.  两个最高有效字节被保留。

以下寄存器被保存（但不可读）并在退出 SMM 时恢复：

-   控制寄存器 CR4。（进入 SMM 时此寄存器被清除为全 0。）
-   存储在段寄存器 CS、DS、ES、FS、GS 和 SS 中的隐藏段描述符信息。

如果为断电处理器而发出 SMI 请求，SMM 状态保存中所有保留位置的值必须保存到非易失性内存。

以下状态分别不随 SMI 和 RSM 指令自动保存和恢复：

-   调试寄存器 DR0 到 DR3。
-   x87 FPU 寄存器。
-   MTRR。
-   控制寄存器 CR2。
-   型号特定寄存器（对于 P6 系列和 Pentium 处理器）或测试寄存器 TR3 到 TR7（对于 Pentium 和 Intel486 处理器）。
-   陷阱控制器的状态。
-   机器检查架构寄存器。
-   APIC 内部中断状态（ISR、IRR 等）。
-   微码更新状态。

如果使用 SMI 断电处理器，在返回 SMM 之前将需要上电复位，它将把大部分此状态重置回其默认值。因此，将要触发断电的 SMI 处理程序应首先直接读取上面列出的这些寄存器，并将它们（连同 RAM 的其余部分）保存到非易失性存储。上电复位后，SMI 处理程序的继续应恢复这些值以及系统状态的其余部分。每当 SMI 处理程序更改处理器中的这些寄存器时，它也必须保存和恢复它们。

> **注**  
> MSR 的一小部分子集（例如，时间戳计数器和性能监视计数器）不是任意可写的，因此不能被保存和恢复。基于 SMM 的断电和恢复只应使用不使用或不依赖这些寄存器值的操作系统执行。  
> 操作系统开发人员应该意识到此事实，并确保其操作系统辅助的断电和恢复软件不受这些寄存器值意外更改的影响。

### 34.4.1.1 SMRAM 状态保存映射和 Intel 64 架构

当处理器最初进入 SMM 时，它将状态写入 SMRAM 的状态保存区域。Intel 64 处理器上状态保存区域位于 \[SMBASE + 8000H + 7FFFH\] 并延伸到 \[SMBASE + 8000H + 7C00H\]。

对 Intel 64 架构的支持由 CPUID.80000001:EDX\[29\] = 1 报告。SMRAM 状态保存映射的布局如表 34-3 所示。

此外，表 34-3 中显示的 SMRAM 状态保存映射也适用于表 34-2 中列出的具有以下 CPUID 签名的处理器，无论 CPUID.80000001H:EDX\[29\] 中的值如何。

**表 34-2. 处理器签名和 64 位 SMRAM 状态保存映射格式**

| DisplayFamily_DisplayModel | 处理器系列/处理器型号系列 |
| --- | --- |
| 06_17H | Intel Xeon 处理器 5200、5400 系列，Intel Core 2 Quad 处理器 Q9xxx，Intel Core 2 Duo 处理器 E8000、T9000 |
| 06_0FH | Intel Xeon 处理器 3000、3200、5100、5300、7300 系列，Intel Core 2 Quad、Intel Core 2 Extreme、Intel Core 2 Duo 处理器，Intel Pentium 双核处理器 |
| 06_1CH | 45 nm Intel Atom® 处理器 |

**表 34-3. Intel 64 架构的 SMRAM 状态保存映射**

| 偏移（加到 SMBASE + 8000H） | 寄存器 | 可写？ |
| --- | --- | --- |
| 7FF8H | CR0 | 否   |
| 7FF0H | CR3 | 否   |
| 7FE8H | RFLAGS | 是   |
| 7FE0H | IA32_EFER | 是   |
| 7FD8H | RIP | 是   |
| 7FD0H | DR6 | 否   |
| 7FC8H | DR7 | 否   |
| 7FC4H | TR SEL¹ | 否   |
| 7FC0H | LDTR SEL¹ | 否   |
| 7FBCH | GS SEL¹ | 否   |
| 7FB8H | FS SEL¹ | 否   |
| 7FB4H | DS SEL¹ | 否   |
| 7FB0H | SS SEL¹ | 否   |
| 7FACH | CS SEL¹ | 否   |
| 7FA8H | ES SEL¹ | 否   |
| 7FA4H | IO_MISC | 否   |
| 7F9CH | IO_MEM_ADDR | 否   |
| 7F94H | RDI | 是   |
| 7F8CH | RSI | 是   |
| 7F84H | RBP | 是   |
| 7F7CH | RSP | 是   |
| 7F74H | RBX | 是   |
| 7F6CH | RDX | 是   |
| 7F64H | RCX | 是   |
| 7F5CH | RAX | 是   |
| 7F54H | R8  | 是   |
| 7F4CH | R9  | 是   |
| 7F44H | R10 | 是   |
| 7F3CH | R11 | 是   |
| 7F34H | R12 | 是   |
| 7F2CH | R13 | 是   |
| 7F24H | R14 | 是   |
| 7F1CH | R15 | 是   |
| 7F1BH–7F04H | 保留  | 否   |
| 7F02H | 自动 HALT 重启字段（字） | 是   |
| 7F00H | I/O 指令重启字段（字） | 是   |
| 7EFCH | SMM 版本标识符字段（双字） | 否   |
| 7EF8H | SMBASE 字段（双字） | 是   |
| 7EF7H–7EE4H | 保留  | 否   |
| 7EE0H | 如果 SMI 偶发于 VMX 非根操作且"enable EPT" VM 执行控制为 1，位 0 被设置。如果 SMI 偶发于飞地模式，位 1 被设置。 | 否   |
| 7ED8H | EPTP VM 执行控制字段的值 | 否   |
| 7ED7H–7ECCH | 保留  | 否   |
| 7EC8H | SSP | 是   |
| 7EC7H–7EA0H | 保留  | 否   |
| 7E9CH | LDT 基址（低 32 位） | 否   |
| 7E98H | 保留  | 否   |
| 7E94H | IDT 基址（低 32 位） | 否   |
| 7E90H | 保留  | 否   |
| 7E8CH | GDT 基址（低 32 位） | 否   |
| 7E8BH–7E48H | 保留  | 否   |
| 7E40H | CR4（64 位） | 否   |
| 7E3FH–7DF0H | 保留  | 否   |
| 7DE8H | IO_RIP | 是   |
| 7DE7H–7DDCH | 保留  | 否   |
| 7DD8H | IDT 基址（高 32 位） | 否   |
| 7DD4H | LDT 基址（高 32 位） | 否   |
| 7DD0H | GDT 基址（高 32 位） | 否   |
| 7DCFH–7C00H | 保留  | 否   |

**注：**

1.  两个最高有效字节被保留。

### 34.4.2 SMRAM 缓存

IA-32 处理器在进入 SMM 前或退出 SMM 前不会自动写回并使缓存无效。由于此行为，必须注意 SMRAM 在系统内存中的放置和 SMRAM 的缓存，以防止在 SMM 和保护模式操作之间来回切换时缓存不一致。以下三种在系统内存中定位 SMRAM 的方法中的任何一种将保证缓存一致性。

-   将 SMRAM 放置在操作系统和应用被阻止访问的系统内存专用部分中。这里，SMRAM 可以被指定为可缓存的（WB、WT 或 WC）以获得最佳处理器性能，而不必冒进入或退出 SMM 时缓存不一致的风险。
-   将 SMRAM 放置在内存中与操作系统使用区域（如视频内存）重叠的部分，但将 SMRAM 指定为不可缓存的（UC）。此方法在 SMM 中防止缓存访问以保持缓存一致性，但使用不可缓存内存降低了 SMM 代码的性能。
-   将 SMRAM 放置在系统内存中与操作系统和/或应用代码使用区域重叠的部分，但在进入和退出 SMM 模式时显式刷新（写回并使无效）缓存。此方法保持缓存一致性，但招致两次完整缓存刷新的开销。

对于 Pentium 4、Intel Xeon 和 P6 系列处理器，建议使用前两种定位 SMRAM 方法的组合。这里 SMRAM 被分割在重叠和专用内存区域之间。进入 SMM 时，被访问的 SMRAM 空间与视频内存（通常位于低内存）重叠。此 SMRAM 部分被指定为 UC 内存。初始 SMM 代码然后跳转到位于系统内存专用区域（通常在高内存）的第二个 SMRAM 部分。此 SMRAM 部分可以被缓存以获得最佳处理器性能。

对于在进入 SMM 时显式刷新缓存的系统（上面描述的第三种方法），可以通过在请求进入 SMM（通常通过断言 SMI# 引脚发起）的同时断言 FLUSH# 引脚来完成缓存刷新。FLUSH# 和 SMI# 引脚的优先级使得 FLUSH# 首先被服务。为保证此行为，处理器要求满足 FLUSH# 和 SMI# 交互的以下约束。在 FLUSH# 和 SMI# 引脚同步且建立和保持时间被满足的系统中，FLUSH# 和 SMI# 引脚可以在同一时钟中断言。在异步系统中，FLUSH# 引脚必须在 SMI# 引脚之前至少一个时钟断言以保证 FLUSH# 引脚首先被服务。

离开 SMM 时（对于显式刷新缓存的系统），应在离开 SMM 之前执行 WBINVD 指令以刷新缓存。

> **注**  
> 在基于 Pentium 处理器且使用 FLUSH# 引脚在进入 SMM 前写回并使缓存内容无效的系统中，处理器将在 Flush Acknowledge 周期运行与随后识别 SMI# 和断言 SMIACT# 之间预取至少一个缓存行。  
> 系统有义务通过向 Pentium 处理器返回 KEN# 不活动来确保这些行不被缓存。

#### 34.4.2.1 系统管理范围寄存器（SMRR）

由 SMM 代码存储的 SMI 处理程序代码和数据驻留在 SMRAM 中。SMRR 接口是 Intel 64 架构中的增强，将 SMRAM 中地址的可缓存引用限制为在 SMM 中运行的代码。SMRR 接口只能由在 SMM 中运行的代码配置。SMRR 的细节在第 14.11.2.4 节中描述。

## 34.5 SMI 处理程序执行环境

第 34.5.1 节描述 SMI 处理程序的初始执行环境。SMI 处理程序可以将其执行环境重新配置为其他支持的操作模式。第 34.5.2 节讨论 SMI 处理程序可以对其执行环境做的修改。第 34.5.3 节讨论环境中控制流强制技术（CET）的交互。

### 34.5.1 初始 SMM 执行环境

保存处理器当前上下文后，处理器将其核心寄存器初始化为表 34-4 中显示的值。进入 SMM 时，控制寄存器 CR0 中的 PE 和 PG 标志被清除，这使处理器处于类似于实地址模式的环境。SMM 执行环境与实地址模式执行环境的差异如下：

-   可寻址地址空间范围从 0 到 FFFFFFFFH（4 GBytes）。
-   实地址模式的正常 64-KByte 段限制增加到 4 GBytes。
-   默认操作数和地址大小被设置为 16 位，这将本地实地址模式代码的可寻址 SMRAM 地址空间限制为 1-MByte 实地址模式限制。然而，可以使用操作数大小和地址大小覆盖前缀来访问 1-MByte 之外的地址空间。

**表 34-4. SMM 中的处理器寄存器初始化**

| 寄存器 | 内容  |
| --- | --- |
| 通用寄存器 | 未定义 |
| EFLAGS | 00000002H |
| EIP | 00008000H |
| CS 选择器 | SMM 基址右移 4 位（默认 3000H） |
| CS 基址 | SMM 基址（默认 30000H） |
| DS、ES、FS、GS、SS 选择器 | 0000H |
| DS、ES、FS、GS、SS 基址 | 000000000H |
| DS、ES、FS、GS、SS 限制 | 0FFFFFFFFH |
| CR0 | PE、EM、TS 和 PG 标志设置为 0；其他不变 |
| CR4 | 清除为零 |
| DR6 | 未定义 |
| DR7 | 00000400H |

-   如果使用 32 位操作数大小覆盖前缀，可以对 4-GByte 地址空间中任何地方进行近跳转和调用。由于实地址模式风格的基址形成，远调用或跳转不能将控制转移到基址超过 20 位（1 MByte）的段。然而，由于 SMM 中的段限制为 4 GBytes，当使用 32 位操作数大小覆盖前缀时，允许进入超出 1-MByte 限制的段偏移。任何没有 32 位操作数大小覆盖前缀的程序控制转移将 EIP 值截断到 16 个低位。
-   数据和栈可以位于 4-GByte 地址空间中任何地方，但如果它们位于 1 MByte 之上，只能使用 32 位地址大小覆盖访问。与代码段一样，数据或栈段的基址不能超过 20 位。

段寄存器 CS 中的值自动设置为 SMBASE 右移 4 位的默认值 30000H；即 3000H。EIP 寄存器被设置为 8000H。当 EIP 值加上移位的 CS 值（SMBASE）时，产生的线性地址指向 SMI 处理程序的第一条指令。

其他段寄存器（DS、SS、ES、FS 和 GS）被清除为 0 且其段限制被设置为 4 GBytes。在此状态下，SMRAM 地址空间可以被视为单个平坦的 4-GByte 线性地址空间。如果段寄存器被加载 16 位值，该值然后左移 4 位并被加载到段基址（段寄存器的隐藏部分）。限制和属性不被修改。

可屏蔽硬件中断、异常、NMI 中断、SMI 中断、A20M 中断、单步陷阱、断点陷阱和 INIT 操作在处理器进入 SMM 时被抑制。如果 SMM 执行环境提供并初始化中断表和必要的中断和异常处理程序，可屏蔽硬件中断、异常、单步陷阱和断点陷阱可以在 SMM 中启用（见第 34.6 节）。

### 34.5.2 SMI 处理程序操作模式切换

在 SMM 内，SMI 处理程序可以在做出适当准备和初始化之后更改处理器的操作模式（例如，启用 PAE 分页、进入 64 位模式等）。例如，如果切换到 32 位保护模式，SMI 处理程序应遵循第 12 章"Processor Management and Initialization"中提供的指南。如果 SMI 处理程序确实希望更改操作模式，它有责任在每次 SMI 之后执行适当的模式转换代码。

建议 SMI 处理程序使用所有可用手段保护其关键代码和数据的完整性。特别是，如果可用，它应使用系统管理范围寄存器（SMRR）接口（见第 11.11.2.4 节）。SMRR 接口只能保护物理地址空间的前 4 GBytes。如果 SMI 处理程序使用允许访问超出该 4-GByte 限制的物理地址的操作模式（例如，PAE 分页或 64 位模式），它应考虑到此事实。

RSM 指令的执行从 SMRAM 状态保存映射（见第 34.4.1 节）恢复 SMI 前处理器状态，处理器进入 SMM 时状态被存储到该映射中。（SMRAM 状态保存映射中的 SMBASE 字段不决定 RSM 之后的状态，而是决定下次进入 SMM 后的初始环境。）对操作模式的任何所需更改由 RSM 指令执行；SMI 处理程序无需在执行 RSM 之前显式更改模式。

### 34.5.3 控制流强制技术交互

在支持 CET 影子栈的处理器上，当处理器进入 SMM 时，处理器将 SSP 寄存器保存到 SMRAM 状态保存区域（见表 34-3）并将 CR4.CET 清除为 0。因此，SMI 处理程序的初始执行环境具有 CET 禁用且被中断程序的所有 CET 状态仍在机器中。使用 CET 的 SMM 需要保存被中断程序的 CET 状态并在退出 SMM 之前恢复 CET 状态。

## 34.6 SMM 中的异常和中断

当处理器进入 SMM 时，所有硬件中断按以下方式禁用：

-   EFLAGS 寄存器中的 IF 标志被清除，这抑制可屏蔽硬件中断的生成。
-   EFLAGS 寄存器中的 TF 标志被清除，这禁用单步陷阱。
-   调试寄存器 DR7 被清除，这禁用断点陷阱。（此操作防止调试器在正常地址空间中设置与 SMRAM 中代码或数据重叠的调试断点时意外闯入 SMI 处理程序。）
-   NMI、SMI 和 A20M 中断被内部 SMM 逻辑阻塞。（NMI 在 SMM 中如何处理的信息见第 34.8 节。）

软件调用的中断和异常仍可发生，且可屏蔽硬件中断可以通过设置 IF 标志来启用。Intel 建议 SMM 代码被编写为不调用软件中断（使用 INT n、INTO、INT1、INT3 或 BOUND 指令）或生成异常。

如果 SMI 处理程序需要中断和异常处理，必须从 SMM 内创建和初始化 SMM 中断表和必要的异常和中断处理程序。在中断表被正确初始化（使用 LIDT 指令）之前，异常和软件中断将导致不可预测的处理器行为。

设计 SMM 中断和异常处理设施时适用以下限制：

-   中断表应位于线性地址 0，且必须包含实地址模式风格的中断向量（包含 CS 和 IP 的 4 字节）。
-   由于实地址模式风格的基址形成，中断或异常不能将控制转移到基址超过 20 位的段。
-   中断或异常不能将控制转移到超过 16 位（64 KBytes）的段偏移。
-   当异常或中断发生时，只有返回地址（EIP）的 16 个最低有效位被压入栈。如果被中断过程的偏移大于 64 KBytes，中断/异常处理程序不可能将控制返回给该过程。（此问题的一个解决方案是处理程序调整栈上的返回地址。）
-   SMBASE 重定位特性影响处理器从 SMI 处理程序执行期间生成的中断或异常返回的方式。例如，如果 SMBASE 被重定位到 1 MByte 之上，但异常处理程序在 1 MByte 之下，正常返回到 SMI 处理程序是不可能的。一个解决方案是为异常处理程序提供一种机制，从栈上的 16 位返回地址计算 1 MByte 之上的返回地址，然后使用 32 位远调用返回到被中断的过程。
-   如果 SMI 处理程序需要访问调试陷阱设施，它必须确保 SMM 可访问的调试处理程序可用，并保存调试寄存器 DR0 到 DR3 的当前内容（以便稍后恢复）。然后必须用适当的值初始化调试寄存器 DR0 到 DR3 和 DR7。
-   如果 SMI 处理程序需要访问单步机制，它必须确保 SMM 可访问的单步处理程序可用，然后设置 EFLAGS 寄存器中的 TF 标志。
-   如果 SMI 设计要求处理器在 SMM 中响应可屏蔽硬件中断或软件生成的中断，它必须确保 SMM 可访问的中断处理程序可用，然后设置 EFLAGS 寄存器中的 IF 标志（使用 STI 指令）。软件中断在进入 SMM 时不被阻塞，因此它们不需要被启用。

## 34.7 管理同步和异步系统管理中断

为多处理器系统或具有 Intel HT 技术的系统编码时，SMI 处理程序并不总是能够区分同步 SMI（在 I/O 指令期间触发）和异步 SMI。为便于区分这两个事件，增量状态信息已被添加到 SMM 状态保存映射。

具有 SMM 版本 ID 为 30004H 或更高的处理器具有下面描述的增量状态信息。

### 34.7.1 I/O 状态实现

在扩展 SMM 状态保存映射内，提供了一个位（IO_SMI），仅当 SMI 是在成功 I/O 指令之后立即被接受或是在 REP I/O 指令的成功迭代之后被接受时被设置（成功的概念涉及处理器观点；不一定涉及相应平台功能）。当被设置时，IO_SMI 位提供相应 SMI 是同步的强烈指示。在这种情况下，SMM 状态保存映射还提供 I/O 操作的端口地址。IO_SMI 位和 I/O 端口地址可以与平台记录的信息结合使用以确认 SMI 确实是同步的。

IO_SMI 位本身是 SMI 同步的强烈指示，而不是保证。这是因为异步 SMI 可能碰巧在 I/O 指令之后被接受。在这种情况下，IO_SMI 位仍将在 SMM 状态保存映射中被设置。

表征 I/O 指令的信息被保存在 SMM 状态保存映射中的两个位置（表 34-5）。IO_SMI 位还充当其余 I/O 信息字段的有效位。当 IO_SMI 位未被设置时，这些 I/O 信息字段的内容未被定义。

**表 34-5. SMM 状态保存映射中的 I/O 指令信息**

| 状态（SMM 修订 ID：30004H 或更高） | 格式  |
| --- | --- |
| I/O 状态字段（SMRAM 偏移 7FA4H） | 位 31：IO_SMI；位 30:16：I/O 端口；位 15:8：I/O 类型；位 7:4：保留；位 3:0：I/O 长度 |
| I/O 内存地址字段（SMRAM 偏移 7FA0H） | 位 31:0：I/O 内存地址 |

当 IO_SMI 被设置时，其他字段可以按如下解释：

-   I/O 长度：
    -   001——字节
    -   010——字
    -   100——双字
-   I/O 指令类型（表 34-6）

**表 34-6. I/O 指令类型编码**

| 指令  | 编码  |
| --- | --- |
| IN Immediate | 1001 |
| IN DX | 0001 |
| OUT Immediate | 1000 |
| OUT DX | 0000 |
| INS | 0011 |
| OUTS | 0010 |
| REP INS | 0111 |
| REP OUTS | 0110 |

## 34.8 SMM 中的 NMI 处理

NMI 中断在进入 SMI 处理程序时被阻塞。如果 NMI 请求在 SMI 处理程序期间发生，它被锁存并在处理器退出 SMM 后被服务。在 SMI 处理程序期间只锁存一个 NMI 请求。如果处理器执行 RSM 指令时有 NMI 请求挂起，NMI 在被中断代码序列的下一条指令之前被服务。这假设 NMI 在 SMI 发生前未被阻塞。如果 NMI 在 SMI 发生前被阻塞，它们在 RSM 执行后也被阻塞。

虽然 NMI 请求在处理器进入 SMM 时被阻塞，它们可以通过软件执行 IRET 指令来启用。如果 SMI 处理程序需要使用 NMI 中断，它应调用虚拟中断服务例程以执行 IRET 指令。一旦执行 IRET 指令，NMI 中断请求以与 SMM 之外处理相同的"实模式"方式被服务。

此外，对于 Pentium 处理器，调用陷阱或故障处理程序的异常将从 SMM 内部启用 NMI 中断。此行为对于 Pentium 处理器是实现特定的，且不是 IA-32 架构的一部分。

## 34.9 SMM 版本标识符

SMM 版本标识符字段用于指示处理器支持的 SMM 版本和 SMM 扩展（见图 34-2）。SMM 版本标识符在 SMM 进入期间被写入，可以在 SMRAM 空间偏移 7EFCH 处检查。SMM 版本标识符的低字指基础 SMM 架构的版本。

```python
寄存器偏移 7EFCH
31               18 17 16 15             0
┌────────────────┬────┬────┬─────────────┐
│ SMM 版本标识符   │保留 │SMBASE重定位 │I/O指令重启 │
└────────────────┴────┴────┴─────────────┘
```

**图 34-2. SMM 版本标识符**

SMM 版本标识符的高字指可用的扩展。如果 I/O 指令重启标志（位 16）被设置，处理器支持 I/O 指令重启（见第 34.12 节）；如果 SMBASE 重定位标志（位 17）被设置，支持 SMRAM 基址重定位（见第 34.11 节）。

## 34.10 自动 HALT 重启

如果处理器在接收 SMI 时处于 HALT 状态（由于之前执行 HLT 指令），处理器在保存的处理器状态中的自动 HALT 重启标志记录此事实（见图 34-3）。（此标志位于 SMRAM 状态保存区域中的偏移 7F02H 和位 0。）

如果处理器在进入 SMM 时设置自动 HALT 重启标志（指示 SMI 发生在处理器处于 HALT 状态时），SMI 处理程序有两个选项：

-   它可以保持自动 HALT 重启标志被设置，这指示 RSM 指令将程序控制返回到 HLT 指令。此选项实际上使处理器在处理 SMI 后重新进入 HALT 状态。（这是默认操作。）
-   它可以清除自动 HALT 重启标志，这指示 RSM 指令将程序控制返回到 HLT 指令之后的指令。

```python
寄存器偏移 7F02H
15                    1  0
┌──────────────────────┬──┐
│ 保留                  │自动 HALT 重启 │
└──────────────────────┴──┘
```

**图 34-3. 自动 HALT 重启字段**

这些选项总结在表 34-7 中。如果在接收 SMI 时处理器未处于 HALT 状态（自动 HALT 重启标志被清除），执行 RSM 指令时将该标志设置为 1 将导致不可预测的行为。

**表 34-7. 自动 HALT 重启标志值**

| 进入 SMM 后的标志值 | 退出 SMM 时的标志值 | 处理器退出 SMM 时的动作 |
| --- | --- | --- |
| 0   | 0   | 返回到被中断程序或任务中的下一条指令。 |
| 1   | 0   | 不可预测。 |
| 0   | 1   | 返回到 HLT 指令之后的下一条指令。 |
| 1   | 1   | 返回到 HALT 状态。 |

如果 HLT 指令被重启，处理器将生成内存访问以获取 HLT 指令（如果它不在内部缓存中），并执行 HLT 总线事务。此行为导致同一 HLT 指令的多个 HLT 总线事务。

### 34.10.1 在 SMM 中执行 HLT 指令

HLT 指令不应在 SMM 期间执行，除非通过设置 EFLAGS 寄存器中的 IF 标志启用了中断。如果处理器在 SMM 中被暂停，唯一可以将处理器从该状态移除的事件是可屏蔽硬件中断或硬件复位。

## 34.11 SMBASE 重定位

SMRAM 的默认基址是 30000H。此值包含在称为 SMBASE 寄存器的内部处理器寄存器中。软件可以通过将保存状态映射中的 SMBASE 字段（在偏移 7EF8H 处）设置为新值来重定位 SMRAM（见图 34-4）。RSM 指令每次退出 SMM 时用 SMBASE 字段中的值重新加载内部 SMBASE 寄存器。所有后续 SMI 请求将使用新的 SMBASE 值寻找 SMI 处理程序的起始地址（在 SMBASE + 8000H）和 SMRAM 状态保存区域（从 SMBASE + FE00H 到 SMBASE + FFFFH）。（处理器在 RESET 时将其内部 SMBASE 寄存器中的值重置为 30000H，但在 INIT 时不更改它。）

```python
寄存器偏移 7EF8H
31                      0
┌───────────────────────┐
│ SMM 基址               │
└───────────────────────┘
```

**图 34-4. SMBASE 重定位字段**

在多处理器系统中，初始化软件必须调整每个处理器的 SMBASE 值，使每个处理器的 SMRAM 状态保存区域不重叠。（对于 Pentium 和 Intel486 处理器，SMBASE 值必须在 32-KByte 边界对齐，否则处理器将在 RSM 指令执行期间进入关闭状态。）

如果 SMM 版本标识符字段中的 SMBASE 重定位标志被设置，它指示重定位 SMBASE 的能力（见第 34.9 节）。

## 34.12 I/O 指令重启

如果 SMM 版本标识符字段中的 I/O 指令重启标志被设置（见第 34.9 节），I/O 指令重启机制存在于处理器上。此机制允许被中断的 I/O 指令在从 SMM 模式返回时被重新执行。例如，如果 I/O 指令用于访问已断电的 I/O 设备，支持此设备的芯片组可以拦截访问并通过断言 SMI# 来响应。此操作调用 SMI 处理程序为设备加电。从 SMI 处理程序返回时，I/O 指令重启机制可用于重新执行导致 SMI 的 I/O 指令。

I/O 指令重启字段（在 SMM 状态保存区域中的偏移 7F00H，见图 34-5）控制 I/O 指令重启。当执行 RSM 指令时，如果此字段包含值 FFH，则 EIP 寄存器被修改为指向接收 SMI 请求的 I/O 指令。处理器然后将自动重新执行 SMI 陷阱的 I/O 指令。（处理器保存必要的机器状态以确保指令的重新执行被一致地处理。）

```python
寄存器偏移 7F00H
15                                   0
┌────────────────────────────────────┐
│ I/O 指令重启字段                     │
└────────────────────────────────────┘
```

**图 34-5. I/O 指令重启字段**

如果执行 RSM 指令时 I/O 指令重启字段包含值 00H，则处理器从 I/O 指令之后的指令开始程序执行。（当使用重复前缀时，下一条指令可能是重复循环中的下一个 I/O 指令。）不重新执行被中断的 I/O 指令是默认行为；处理器在进入 SMM 时自动将 I/O 指令重启字段初始化为 00H。表 34-8 总结 I/O 指令重启字段的状态。

**表 34-8. I/O 指令重启字段值**

| 进入 SMM 后的标志值 | 退出 SMM 时的标志值 | 处理器退出 SMM 时的动作 |
| --- | --- | --- |
| 00H | 00H | 不重新执行被陷阱的 I/O 指令。 |
| 00H | FFH | 重新执行被陷阱的 I/O 指令。 |

I/O 指令重启机制不指示 SMI 的原因。SMI 处理程序有责任检查处理器状态以确定 SMI 的原因并确定 I/O 指令是否被中断且应在退出 SMM 时被重启。如果在非 I/O 指令边界上发信号 SMI 中断，在执行 RSM 指令之前将 I/O 指令重启字段设置为 FFH 很可能导致程序错误。

### 34.12.1 使用 I/O 指令重启时的背靠背 SMI 中断

如果处理器正在服务发生在 I/O 指令边界的 SMI 中断时发信号 SMI 中断，处理器将在重启最初被中断的 I/O 指令之前服务新的 SMI 请求。如果在从第二个 SMI 处理程序返回之前将 I/O 指令重启字段设置为 FFH，EIP 将指向与最初被中断的 I/O 指令不同的地址，这很可能导致程序错误。为避免此情况，SMI 处理程序必须能够在使用 I/O 指令重启时识别背靠背 SMI 中断的发生，并确保处理程序在从 SMI 处理程序的第二次调用返回之前将 I/O 指令重启字段设置为 00H。

## 34.13 SMM 多处理器考虑

设计多处理器系统时应注意以下事项：

-   多处理器系统中的任何处理器都可以响应 SMI。
-   每个处理器需要自己的 SMRAM 空间。此空间可以在系统内存中或在独立 RAM 中。
-   不同处理器的 SMRAM 可以在相同内存空间中重叠。唯一的规定是每个处理器需要自己的状态保存区域和自己的动态数据存储区域。（此外，对于 Pentium 和 Intel486 处理器，SMBASE 地址必须位于 32-KByte 边界。）代码和静态数据可以在处理器之间共享。重叠 SMRAM 空间可以用 P6 系列处理器更有效地完成，因为它们不要求 SMBASE 地址在 32-KByte 边界上。
-   SMI 处理程序将需要为每个处理器初始化 SMBASE。
-   处理器可以通过其 SMI# 引脚响应本地 SMI，或响应通过 APIC 接口接收的 SMI。APIC 接口可以将 SMI 分发到不同处理器。
-   两个或更多处理器可以同时在 SMM 中执行。
-   在双处理（DP）模式操作 Pentium 处理器时，SMIACT# 引脚仅由 MRM 处理器驱动，且应与 ADS# 一起采样。额外细节见《Pentium 处理器系列用户手册》第 1 卷第 14 章。

SMM 不可重入，因为 SMRAM 状态保存映射相对于 SMBASE 是固定的。如果需要在 SMM 模式中同时支持两个或更多处理器，则每个处理器应有专用的 SMRAM 空间。这可以使用 SMBASE 重定位特性完成（见第 34.11 节）。

## 34.14 VMX 操作和 SMX 操作下 SMI 和 SMM 的默认处理

在默认处理下，SMI 和 SMM 与 VMX 操作的交互很少。本节详述那些交互。它还解释此处理如何影响 SMX 操作。

### 34.14.1 SMI 交付的默认处理

普通 SMI 交付将处理器状态保存到 SMRAM 中，然后基于架构定义加载状态。在默认处理下，支持 VMX 操作的处理器按如下执行 SMI 交付：

```python
进入 SMM；
在处理器内部保存：
  CR4.VMXE
  逻辑处理器是否处于 VMX 操作（根或非根）的指示
IF 逻辑处理器处于 VMX 操作中
THEN
  在处理器内部保存当前 VMCS 指针；
  离开 VMX 操作；
  保存下面定义的 VMX 关键状态；
FI；
IF 逻辑处理器支持 SMX 操作
THEN
  在逻辑处理器内部保存 Intel® TXT 私有空间是否被锁定的指示；
  IF TXT 私有空间未锁定
  THEN 锁定 TXT 私有空间；
  FI；
FI；
CR4.VMXE := 0；
执行普通 SMI 交付：
  在 SMRAM 中保存处理器状态；
  将处理器状态设置为标准 SMM 值；¹
  使与 VPID 0000H 关联的线性映射和组合映射无效（对于所有 PCID）；VPID 0000H 的组合映射对所有 EPTRTA 值被使无效（EPTRTA 是 EPTP 第 51:12 位的值；见第 31.4 节）；
```

上面的伪代码引用 VMX 关键状态的保存。此状态由以下组成：（1）SS.DPL（当前特权级别）；（2）RFLAGS.VM；² （3）由 STI 和由 MOV SS 的阻止状态（见表 27-3 第 27.4.2 节）；（4）虚拟 NMI 阻止状态（仅当处理器处于 VMX 非根操作且"virtual NMIs" VM 执行控制为 1 时）；和（5）MTF VM 退出是否挂起的指示（见第 28.5.2 节）。这些数据可以保存在处理器内部或当前 VMCS 的 VMCS 区域中。不支持在 STI 或 MOV SS 阻止时识别 SMI 的处理器不需要保存此类阻止的状态。

如果逻辑处理器支持"enable EPT" VM 执行控制的 1 设置且逻辑处理器在 SMI 时处于 VMX 非根操作，它将该控制的值保存到偏移 SMBASE + 8000H + 7EE0H（SMBASE + FEE0H；见表 34-3）处的 32 位字段的位 0。¹ 如果逻辑处理器在 SMI 时未处于 VMX 非根操作，它保存 0 到该位。如果逻辑处理器保存 1 到该位（它处于 VMX 非根操作且"enable EPT" VM 执行控制为 1），它将 EPT 指针（EPTP）的值保存到偏移 SMBASE + 8000H + 7ED8H（SMBASE + FED8H）处的 64 位字段。

因为 SMI 交付使逻辑处理器离开 VMX 操作，所有与 VMX 非根操作关联的控制在 SMM 中被禁用，因此不能在逻辑处理器处于 SMM 时导致 VM 退出。

### 34.14.2 RSM 的默认处理

RSM 的普通执行从 SMRAM 恢复处理器状态。在默认处理下，支持 VMX 操作的处理器按如下执行 RSM：

```python
IF SMRAM 中 CR4 映像中的 VMXE = 1
THEN 失败并进入关闭状态；
ELSE
  正常从 SMRAM 恢复状态；
  使与所有 VPID 和所有 PCID 关联的线性映射和组合映射无效；组合映射对所有 EPTRTA 值被使无效（EPTRTA 是 EPTP 第 51:12 位的值；见第 31.4 节）；
  IF 逻辑处理器支持 SMX 操作 且 Intel® TXT 私有空间在最后一次 SMI 时未锁定（如保存的）
  THEN 解锁 TXT 私有空间；
  FI；
  CR4.VMXE := 内部存储的值；
  IF 内部存储指示逻辑处理器曾在 VMX 操作中（根或非根）
  THEN
    进入 VMX 操作（根或非根）；
    恢复第 34.14.1 节定义的 VMX 关键状态；
    将 CR0 和 CR4 中在 VMX 操作中必须固定的任何位设置为它们的固定值（见第 26.8 节）；²
    IF RFLAGS.VM = 0 且（在 VMX 根操作中 或 "unrestricted guest" VM 执行控制为 0）³
    THEN
      CS.RPL := SS.DPL；
      SS.RPL := SS.DPL；
    FI；
    恢复当前 VMCS 指针；
  FI；
  离开 SMM；
  IF RSM 之后逻辑处理器将处于 VMX 操作或 SMX 操作中
  THEN 阻塞 A20M 并离开 A20M 模式；
  FI；
FI；
```

RSM 解除 SMI 的阻塞。它按如下恢复由 NMI 的阻止状态（见第 27.4.2 节中的表 27-3）：

-   如果 RSM 不是到 VMX 非根操作或如果"virtual NMIs" VM 执行控制将为 0，NMI 阻止状态被正常恢复。
-   如果 RSM 到 VMX 非根操作且"virtual NMIs" VM 执行控制将为 1，NMI 在 RSM 后不被阻塞。虚拟 NMI 阻止状态作为 VMX 关键状态的一部分被恢复。

当且仅当逻辑处理器将处于 VMX 根操作时，INIT 信号在 RSM 后被阻塞。

如果 RSM 将逻辑处理器返回到 VMX 非根操作，它重新建立与当前 VMCS 关联的控制。如果"interrupt-window exiting" VM 执行控制为 1，如果启用条件适用，VM 退出在 RSM 后立即发生。对于"NMI-window exiting" VM 执行控制也是如此。此类 VM 退出以其正常优先级发生。见第 28.2 节。

如果在先前 SMI 时 MTF VM 退出挂起，MTF VM 退出在 RSM 执行后的指令边界挂起。以下条目详述 RSM 之后可能挂起的 MTF VM 退出的处理：

-   系统管理中断（SMI）、INIT 信号和更高优先级事件优先于这些 MTF VM 退出。这些 MTF VM 退出优先于调试陷阱异常和更低优先级事件。
-   如果 RSM 使逻辑处理器进入 HLT 状态（见第 34.10 节），这些 MTF VM 退出唤醒逻辑处理器。如果逻辑处理器刚进入关闭状态，它们不发生。

### 34.14.3 SMM 中 CR4.VMXE 的保护

在默认处理下，CR4.VMXE 在逻辑处理器处于 SMM 时被视为保留位。在 SMM 中运行的软件对此位的任何设置尝试导致一般保护异常。此外，软件不能在 SMM 中使用 VMX 指令或进入 VMX 操作。

### 34.14.4 VMXOFF 和 SMI 解除阻塞

VMXOFF 指令只能在默认处理下（见第 34.15.1 节）且只能在 SMM 之外执行。如果执行 VMXOFF 时 SMI 被阻塞，VMXOFF 解除它们的阻塞，除非 IA32_SMM_MONITOR_CTL\[bit 2\] 为 1（此 MSR 的细节见第 34.15.5 节）。¹ 第 34.15.7 节标识执行 VMXOFF 时 SMI 可能被阻塞的情况。

并非所有处理器都允许此位被设置为 1。软件应查阅 VMX 能力 MSR IA32_VMX_MISC（见附录 A.6）以确定是否允许。

## 34.15 SMI 和 SMM 的双监视器处理

双监视器处理通过执行监视器（在 SMM 之外操作以提供基本虚拟化的 VMM）和 SMM 转移监视器（STM；在 SMM 内部——在 VMX 操作中——操作以支持系统管理功能的 VMM）的合作激活。控制通过 VM 退出转移到 STM；VM 进入用于从 SMM 返回。

双监视器处理可能不被所有处理器支持。软件应查阅 VMX 能力 MSR IA32_VMX_BASIC（见附录 A.1）以确定是否支持。

### 34.15.1 双监视器处理概述

双监视器处理使用执行监视器和 SMM 转移监视器（STM）。从执行监视器或其客户到 STM 的转换称为 SMM VM 退出，在第 34.15.2 节中讨论。SMM VM 退出由 SMI 以及 VMX 根操作中 VMCALL 的执行引起。后者允许执行监视器为服务调用 STM。

STM 在 VMX 根操作中运行，并使用 VMX 指令建立 VMCS 并对其自己的客户执行 VM 进入。这全部在 SMM 内部完成（见第 34.15.3 节）。STM 不使用 RSM 指令从 SMM 返回，而是使用从 SMM 返回的 VM 进入。此类 VM 进入在第 34.15.4 节中描述。

最初，没有 STM 且使用默认处理（第 34.14 节）。双监视器处理在启用和激活之前不被使用。执行此操作的步骤在第 34.15.5 节和第 34.15.6 节中描述。

在双监视器处理下不可能离开 VMX 操作；执行时 VMXOFF 将失败。必须先停用双监视器处理。STM 使用带"deactivate dual-monitor treatment" VM-entry 控制设置为 1 的从 SMM 返回的 VM 进入来停用双监视器处理（见第 34.15.7 节）。

执行监视器配置它用于到执行监视器的 VM 退出的任何 VMCS。将控制转移到 STM 的 SMM VM 退出使用不同的 VMCS。在双监视器处理下，每个逻辑处理器使用称为 SMM 转移 VMCS 的单独 VMCS。当双监视器处理活动时，逻辑处理器维护另一个称为 SMM 转移 VMCS 指针的 VMCS 指针。SMM 转移 VMCS 指针在双监视器处理被激活时建立。

### 34.15.2 SMM VM 退出

SMM VM 退出是在 SMM 之外开始并在 SMM 中结束的 VM 退出。

与其他 VM 退出不同，SMM VM 退出可以在 VMX 根操作中开始。SMM VM 退出由 SMM 之外 SMI 的到达或 SMM 之外 VMX 根操作中 VMCALL 的执行产生。仅当 IA32_SMM_MONITOR_CTL MSR 中设置了有效位（见第 34.15.5 节）时，VMX 根操作中 VMCALL 的执行才导致 SMM VM 退出。

即使在默认处理下，VMX 根操作中 VMCALL 的执行也导致 SMM VM 退出。此 SMM VM 退出激活双监视器处理（见第 34.15.6 节）。

SMM VM 退出与其他 VM 退出之间的差异在第 34.15.2.1 节到第 34.15.2.5 节中详述。激活双监视器处理的 SMM VM 退出与其他 SMM VM 退出之间的差异在第 34.15.6 节中描述。

#### 34.15.2.1 VM 退出前的架构状态

导致 SMM VM 退出的系统管理中断（SMI）总是直接这样做。它们不像在默认处理下那样将状态保存到 SMRAM。

#### 34.15.2.2 更新 current-VMCS 和 executive-VMCS 指针

SMM VM 退出通过执行以下步骤开始：

1.  SMM 转移 VMCS 中的 executive-VMCS 指针字段按如下加载：
    -   如果 SMM VM 退出在 VMX 非根操作中开始，它接收 current-VMCS 指针。
    -   如果 SMM VM 退出在 VMX 根操作中开始，它接收 VMXON 指针。
2.  current-VMCS 指针被加载 SMM 转移 VMCS 指针的值。

最后一步确保当前 VMCS 是 SMM 转移 VMCS。VM 退出信息被记录在该 VMCS 中，且该 VMCS 中的 VM-entry 控制字段被更新。状态被保存到该 VMCS 的客户状态区域。该 VMCS 的 VM-exit 控制和主机状态区域确定 VM 退出如何操作。

#### 34.15.2.3 记录 VM 退出信息

SMM VM 退出在记录 VM 退出信息的方式上与其他 VM 退出不同。差异如下。

-   **退出原因**。
    -   此字段的第 15:0 位包含基本退出原因。字段被加载 SMM VM 退出的原因：I/O SMI（SMI 在 I/O 指令退役后立即到达）、其他 SMI 或 VMCALL。见附录 C"VMX Basic Exit Reasons"。
    -   SMM VM 退出是可能在 VMX 根操作中发生的唯一 VM 退出。因为 SMM 转移监视器可能需要知道它是从 VMX 根还是 VMX 非根操作被调用的，此信息存储在退出原因字段的第 29 位（见第 27.9.1 节中的表 27-19）。该位由来自 VMX 根操作的 SMM VM 退出设置。
    -   如果 SMM VM 退出发生在 VMX 非根操作中且 MTF VM 退出挂起，退出原因字段的第 28 位被设置；否则，它被清除。
    -   第 27:16 位和第 31:30 位被清除。
-   **退出资格**。对于由于在 I/O 指令退役后立即到达的 SMI 的 SMM VM 退出，退出资格包含关于在 SMI 之前立即退役的 I/O 指令的信息。它具有表 34-9 中给出的格式。

**表 34-9. 在 I/O 指令退役后立即到达的 SMI 的退出资格**

| 位位置 | 内容  |
| --- | --- |
| 2:0 | 访问大小：0 = 1 字节；1 = 2 字节；3 = 4 字节。其他值不使用。 |
| 3   | 尝试访问的方向（0 = OUT，1 = IN） |
| 4   | 字符串指令（0 = 非字符串；1 = 字符串） |
| 5   | REP 前缀（0 = 非 REP；1 = REP） |
| 6   | 操作数编码（0 = DX，1 = 立即数） |
| 15:7 | 保留（清除为 0） |
| 31:16 | 端口号（按 I/O 指令中指定的） |
| 63:32 | 保留（清除为 0）。这些位仅存在于支持 Intel 64 架构的处理器上。 |

-   **客户线性地址**。此字段用于由于在 INS 或 OUTS 指令（相关段（对于 INS 为 ES；对于 OUTS 为 DS，除非被指令前缀覆盖）可用）退役后立即到达的 SMI 的 VM 退出。字段接收指令开始时 ES:(E)DI（对于 INS）或 segment:(E)SI（对于 OUTS；默认段为 DS 但可以被段覆盖前缀覆盖）生成的线性地址的值。如果相关段不可用，该值未定义。在支持 Intel 64 架构的处理器上，如果逻辑处理器在 VM 退出前不在 64 位模式中，第 63:32 位被清除。
-   **I/O RCX、I/O RSI、I/O RDI 和 I/O RIP**。对于由于在 I/O 指令退役后立即到达的 SMI 的 SMM VM 退出，这些字段接收在 I/O 指令执行前 RCX、RSI、RDI 和 RIP 中分别存在的值。因此，为 I/O RIP 保存的值寻址 I/O 指令。

#### 34.15.2.4 保存客户状态

SMM VM 退出将 SMBASE 寄存器的内容保存到客户状态区域中的相应字段。

如果"save VMX-preemption timer value" VM-exit 控制为 1，VMX 抢占定时器的值被保存到客户状态区域中的相应字段。如果另外 SMM VM 退出来自 VMX 根操作或 SMM VM 退出来自 VMX 非根操作且"activate VMX-preemption timer" VM 执行控制为 0，该字段变为未定义。

#### 34.15.2.5 更新状态

如果 SMM VM 退出来自 VMX 非根操作且"Intel PT uses guest physical addresses" VM 执行控制为 1，IA32_RTIT_CTL MSR 被清除为 00000000_00000000H。¹ 即使"clear IA32_RTIT_CTL" VM-exit 控制为 0，这也被完成。

SMM VM 退出按如下影响逻辑处理器的非寄存器状态：

-   SMM VM 退出导致非可屏蔽中断（NMI）被阻塞；它们可以通过执行 IRET 或通过 VM 进入解除阻塞（取决于为可中断性状态加载的值和"virtual NMIs" VM 执行控制的设置）。
-   SMM VM 退出导致 SMI 被阻塞；它们可以通过从 SMM 返回的 VM 进入解除阻塞（见第 34.15.4 节）。

SMM VM 退出使与 VPID 0000H 关联的线性映射和组合映射对于所有 PCID 无效。VPID 0000H 的组合映射对所有 EPTRTA 值被使无效（EPTRTA 是 EPTP 第 51:12 位的值；见第 31.4 节）。（如果"enable VPID" VM 执行控制为 1，普通 VM 退出不需要执行此类使无效；见第 30.5.5 节。）

### 34.15.3 SMM 转移监视器的操作

一旦被调用，SMM 转移监视器（STM）处于 VMX 根操作中，并可以使用 VMX 指令配置 VMCS 并对由那些结构支持的虚拟机引起 VM 进入。如第 34.15.1 节所述，VMXOFF 指令不能在双监视器处理下使用，因此不能被 STM 使用。

RSM 指令也不能在双监视器处理下使用。如第 28.1.3 节所述，如果在 SMM 中的 VMX 非根操作中执行，它导致 VM 退出。如果在 VMX 根操作中执行，它导致无效操作码异常。STM 使用 VM 进入从 SMM 返回（见第 34.15.4 节）。

### 34.15.4 从 SMM 返回的 VM 进入

SMM 转移监视器（STM）使用带"entry to SMM" VM-entry 控制清除的 VM 进入从 SMM 返回。从 SMM 返回的 VM 进入反转 SMM VM 退出的效果（见第 34.15.2 节）。

从 SMM 返回的 VM 进入可能与其他 VM 进入不同，因为它们不一定进入 VMX 非根操作。如果当前 VMCS 中的 executive-VMCS 指针字段包含 VMXON 指针，逻辑处理器在 VM 进入后保持在 VMX 根操作中。

从 SMM 返回的 VM 进入与其他 VM 进入之间的差异见第 34.15.4.1 节到第 34.15.4.10 节。

#### 34.15.4.1 对 executive-VMCS 指针字段的检查

从 SMM 返回的 VM 进入对当前 VMCS 中的 executive-VMCS 指针字段执行以下检查：

-   第 11:0 位必须为 0。
-   指针不得设置超出处理器物理地址宽度的任何位。²,³
-   指针中物理地址引用的内存中的 32 位必须包含处理器的 VMCS 版本标识符（见第 27.2 节）。

上面的检查在第 34.15.4.2 节中描述的检查之前且在任何以下检查之前执行：

-   如果"deactivate dual-monitor treatment" VM-entry 控制为 0 且 executive-VMCS 指针字段不包含 VMXON 指针，executive VMCS（executive-VMCS 指针字段引用的 VMCS）的启动状态必须是 launched（见第 27.11.3 节）。
-   如果"deactivate dual-monitor treatment" VM-entry 控制为 1，executive-VMCS 指针字段必须包含 VMXON 指针（见第 34.15.7 节）。¹

#### 34.15.4.2 对 VM 执行控制字段的检查

从 SMM 返回的 VM 进入在检查第 29.2.1.1 节中指定的 VM 执行控制字段的方式上与其他 VM 进入不同。它们不将检查应用于当前 VMCS。相反，VM 进入行为取决于 executive-VMCS 指针字段是否包含 VMXON 指针：

-   如果 executive-VMCS 指针字段包含 VMXON 指针（VM 进入保持在 VMX 根操作中），根本不执行检查。
-   如果 executive-VMCS 指针字段不包含 VMXON 指针（VM 进入进入 VMX 非根操作），对 executive VMCS（当前 VMCS 中 executive-VMCS 指针字段引用的 VMCS）中的 VM 执行控制字段执行检查。这些检查在检查 executive-VMCS 指针字段本身（对于适当对齐）之后执行。

其他 VM 进入确保，如果"activate VMX-preemption timer" VM 执行控制为 0，"save VMX-preemption timer value" VM-exit 控制也为 0。此检查不由从 SMM 返回的 VM 进入执行。

#### 34.15.4.3 对 VM-entry 控制字段的检查

从 SMM 返回的 VM 进入在检查第 29.2.1.3 节中指定的 VM-entry 控制字段的方式上与其他 VM 进入不同。

具体来说，如果 executive-VMCS 指针字段包含 VMXON 指针（VM 进入保持在 VMX 根操作中），注入事件标识字段不得指示注入挂起的 MTF VM 退出（见第 29.6.2 节）。具体来说，该字段以下不能全部为真：

-   有效位（位 31）为 1
-   事件类型（第 10:8 位）为 7（其他事件）；且
-   向量（第 7:0 位）为 0（挂起的 MTF VM 退出）。

#### 34.15.4.4 对客户状态区域的检查

第 29.3.1 节指定对 VMCS 客户状态区域中字段执行的检查。其中一些检查以某些 VM 执行控制的设置（例如，"virtual NMIs"或"unrestricted guest"）为条件。

从 SMM 返回的 VM 进入基于 executive-VMCS 指针字段是否包含 VMXON 指针修改这些检查：²

-   如果 executive-VMCS 指针字段包含 VMXON 指针（VM 进入保持在 VMX 根操作中），检查按所有相关 VM 执行控制为 0 执行。（结果，一些检查可能根本不执行。）
-   如果 executive-VMCS 指针字段不包含 VMXON 指针（VM 进入进入 VMX 非根操作），此检查基于 executive VMCS（当前 VMCS 中 executive-VMCS 指针字段引用的 VMCS）中 VM 执行控制的设置执行。

对于从 SMM 返回的 VM 进入，如果 executive-VMCS 指针字段包含 VMXON 指针（VM 进入是到 VMX 根操作），活动状态字段不得指示 wait-for-SIPI 状态。

#### 34.15.4.5 加载客户状态

从 SMM 返回的 VM 进入从 SMBASE 字段加载 SMBASE 寄存器。

从 SMM 返回的 VM 进入使与所有 VPID 关联的线性映射和组合映射无效。组合映射对所有 EPTRTA 值被使无效（EPTRTA 是 EPTP 第 51:12 位的值；见第 31.4 节）。（普通 VM 进入仅需要对 VPID 0000H 执行此类使无效，且如果"enable VPID" VM 执行控制为 1，甚至不需要那样做；见第 29.3.2.5 节。）

#### 34.15.4.6 VMX 抢占定时器

仅当 executive-VMCS 指针字段不包含 VMXON 指针（VM 进入进入 VMX 非根操作）且 executive VMCS（executive-VMCS 指针字段引用的 VMCS）中"activate VMX-preemption timer" VM 执行控制为 1 时，从 SMM 返回的 VM 进入才激活 VMX 抢占定时器。在这种情况下，VM 进入用当前 VMCS 中 VMX 抢占定时器值字段中的值启动 VMX 抢占定时器。

#### 34.15.4.7 更新 current-VMCS 和 SMM 转移 VMCS 指针

成功的 VM 进入（从 SMM 返回）用 current-VMCS 指针加载 SMM 转移 VMCS 指针。在此之后，它们从当前 VMCS 中的字段加载 current-VMCS 指针：

-   如果 executive-VMCS 指针字段包含 VMXON 指针（VM 进入保持在 VMX 根操作中），current-VMCS 指针从 VMCS-link 指针字段加载。
-   如果 executive-VMCS 指针字段不包含 VMXON 指针（VM 进入进入 VMX 非根操作），current-VMCS 指针被加载 executive-VMCS 指针字段的值。

如果 VM 进入成功进入 VMX 非根操作，VM 进入后生效的 VM 执行控制来自新的当前 VMCS。这包括由 VM 执行控制字段引用的 VMCS 外部的任何结构。

这些 VMCS 指针的更新发生在事件注入之前。然而，事件注入由 VM 进入开始时是当前的 VMCS 中的 VM-entry 控制字段确定。

#### 34.15.4.8 VM 进入诱导的 VM 退出

第 29.6.1.2 节描述事件注入调用的事件交付过程如何可能导致 VM 退出。第 29.7.3 节到第 29.7.7 节描述可能导致 VM 退出在 VM 进入后立即发生的其他情况。

这些 VM 退出是否发生由当前 VMCS 中的 VM 执行控制字段确定。对于从 SMM 返回的 VM 进入，仅当 executive-VMCS 指针字段不包含 VMXON 指针（VM 进入进入 VMX 非根操作）时它们才能发生。

在这种情况下，确定基于 VM 进入后为当前的 VMCS 中的 VM 执行控制字段。这是 VM 进入时 executive-VMCS 指针字段的值引用的 VMCS（见第 34.15.4.7 节）。此 VMCS 也控制此类 VM 退出的交付。因此，由从 SMM 返回的 VM 进入诱导的 VM 退出是到执行监视器而不是到 STM。

#### 34.15.4.9 SMI 阻塞

从 SMM 返回的 VM 进入按如下确定系统管理中断（SMI）的阻塞：

-   如果"deactivate dual-monitor treatment" VM-entry 控制为 0，当且仅当可中断性状态字段中的位 2 为 1 时，SMI 在 VM 进入后被阻塞。
-   如果"deactivate dual-monitor treatment" VM-entry 控制为 1，SMI 的阻塞取决于逻辑处理器是否处于 SMX 操作：¹
    -   如果逻辑处理器处于 SMX 操作中，SMI 在 VM 进入后被阻塞。
    -   如果逻辑处理器在 SMX 操作之外，SMI 在 VM 进入后被解除阻塞。

不停止双监视器处理的从 SMM 返回的 VM 进入可能使 SMI 保持阻塞。此特性存在是为了允许 STM 在不解除 SMI 阻塞的情况下调用 SMM 之外的功能。

#### 34.15.4.10 从 SMM 返回的 VM 进入的失败

第 29.8 节描述在加载客户状态期间或之后失败的 VM 进入的处理。此类失败在 VM 退出信息字段中记录信息并像 VM 退出时会做的那样加载处理器状态。使用的 VMCS 是 VM 进入开始前为当前的那个。控制因此被转移到 STM 且逻辑处理器保持在 SMM 中。

### 34.15.5 启用双监视器处理

SMM 转移监视器（STM）的代码和数据驻留在 SMRAM 中称为监视器段（MSEG）的区域。在 SMM 中运行的代码确定 MSEG 的位置并建立其内容。此代码还负责启用双监视器处理。

SMM 代码通过向 IA32_SMM_MONITOR_CTL MSR（索引 9BH）写入来启用双监视器处理并指定 MSEG 的位置。MSR 具有以下格式：

-   位 0 是寄存器的有效位。仅当此位为 1 时，STM 可以使用 VMCALL 被调用。因为 VMCALL 用于激活双监视器处理（见第 34.15.6 节），如果此位为 0，双监视器处理不能被激活。当逻辑处理器被复位时此位被清除。
-   位 1 被保留。
-   位 2 确定在 SMI 和 SMM 的默认处理下 VMXOFF 的执行是否解除 SMI 的阻塞。VMXOFF 的执行解除 SMI 的阻塞，除非位 2 为 1（位 0 的值无关紧要）。见第 34.14.4 节。GETSEC 指令的某些叶函数清除此位（见《Intel® 64 和 IA-32 架构软件开发手册》第 2D 卷第 7 章"Safer Mode Extensions Reference"）。
-   位 11:3 被保留。
-   位 31:12 包含一个值，当左移 12 位时，是 MSEG 的物理地址（MSEG 基址）。
-   位 63:32 被保留。

以下条目详述此 MSR 的使用：

-   IA32_SMM_MONITOR_CTL MSR 仅在支持双监视器处理的处理器上受支持。¹ 在其他处理器上，使用 RDMSR 或 WRMSR 对 MSR 的访问生成一般保护故障（#GP(0)）。
-   如果在 SMM 之外执行或尝试设置任何保留位，使用 WRMSR 对 IA32_SMM_MONITOR_CTL MSR 的写生成一般保护故障（#GP(0)）。如果作为不在 SMM 中结束的 VM 退出的一部分或不在 SMM 中开始的 VM 进入的一部分进行，对 IA32_SMM_MONITOR_CTL MSR 的写尝试失败。
-   只要允许 RDMSR，使用 RDMSR 从 IA32_SMM_MONITOR_CTL MSR 的读就被允许。MSR 可以作为任何 VM 退出的一部分被读取。
-   仅当 MSR 中的有效位被设置为 1 时，双监视器处理才能被激活。

位于 MSEG 基址处的 32 字节称为 MSEG 头。MSEG 头的格式在表 34-10 中给出（每个字段为 32 位）。

**表 34-10. MSEG 头的格式**

| 字节偏移 | 字段  |
| --- | --- |
| 0   | MSEG 头版本标识符 |
| 4   | SMM 转移监视器特性 |
| 8   | GDTR 限制 |
| 12  | GDTR 基址偏移 |
| 16  | CS 选择器 |
| 20  | EIP 偏移 |
| 24  | ESP 偏移 |
| 28  | CR3 偏移 |

为确保在 VMX 操作中的适当行为，软件应将 MSEG 头保持在写回可缓存内存中。未来的实现可能允许或要求不同的内存类型。¹ 软件应查阅 VMX 能力 MSR IA32_VMX_BASIC（见附录 A.1）。

SMM 代码应仅在按如下建立 MSEG 头的内容之后启用双监视器处理（通过设置 IA32_SMM_MONITOR_CTL MSR 中的有效位）：

-   字节 3:0 包含 MSEG 版本标识符。不同处理器可能使用不同的 MSEG 版本标识符。这些标识符使软件能够避免在使用不同格式的处理器上使用为一个处理器格式化的 MSEG 头。软件可以通过读取 VMX 能力 MSR IA32_VMX_MISC（见附录 A.6）发现处理器使用的 MSEG 版本标识符。
-   字节 7:4 包含 SMM 转移监视器特性字段。此字段的第 31:1 位被保留且必须为零。字段的位 0 是 IA-32e 模式 SMM 特性位。它指示 STM 被激活后逻辑处理器是否将处于 IA-32e 模式（见第 34.15.6 节）。
-   字节 31:8 包含确定 STM 被激活时如何加载处理器状态的字段（见第 34.15.6.5 节）。SMM 代码应建立这些字段，使 STM 的激活调用 STM 的初始化代码。

### 34.15.6 激活双监视器处理

双监视器处理可以由 SMM 代码按第 34.15.5 节所述启用。双监视器处理仅在它被启用时且仅由执行监视器激活。执行监视器通过在 VMX 根操作中执行 VMCALL 来激活双监视器处理。

当 VMCALL 激活双监视器处理时，它导致 SMM VM 退出。此 SMM VM 退出与其他 SMM VM 退出之间的差异在第 34.15.6.1 节到第 34.15.6.6 节中讨论。另见第 33 章中的"VMCALL——Call to VM Monitor"。

#### 34.15.6.1 初始检查

如果（1）处理器支持双监视器处理；² （2）逻辑处理器处于 VMX 根操作中；（3）逻辑处理器在 SMM 之外且 IA32_SMM_MONITOR_CTL MSR 中设置了有效位；（4）逻辑处理器不在虚拟 8086 模式中且不在兼容模式中；（5）CPL = 0；且（6）双监视器处理不活动，VMCALL 的执行尝试激活双监视器处理。

此类 VMCALL 执行以一些初始检查开始。这些检查在更新 current-VMCS 指针和 executive-VMCS 指针字段（见第 34.15.2.2 节）之前执行。

管理由此 VMCALL 引起的 SMM VM 退出的 VMCS 是由执行监视器建立的当前 VMCS。VMCALL 按指示的顺序对当前 VMCS 执行以下检查：

1.  必须存在当前 VMCS 指针。
2.  当前 VMCS 的启动状态必须是 clear。
3.  当前 VMCS 中的 VM-exit 控制必须被适当设置：
    -   主要 VM-exit 控制中的保留位必须被适当设置。软件可以查阅 VMX 能力 MSR 以确定适当设置（见附录 A.4.1）。
    -   如果"activate secondary controls"主要 VM-exit 控制为 1，次要 VM-exit 控制中的保留位必须被清除。软件可以查阅 VMX 能力 MSR 以确定哪些位被保留（见附录 A.4.2）。

-   如果"activate secondary controls"主要 VM-exit 控制为 0（或如果处理器不支持该控制的 1 设置），不对次要 VM-exit 控制执行检查。逻辑处理器按所有次要 VM-exit 控制为 0 操作。

如果这些检查中的任何一个失败，跳过后续检查且 VMCALL 失败。如果所有这些检查成功，逻辑处理器使用 IA32_SMM_MONITOR_CTL MSR 确定 MSEG 的基址。按指示的顺序执行以下检查：

1.  逻辑处理器读取 MSEG 基址处的 32 位并将它们与处理器的 MSEG 版本标识符比较。
2.  逻辑处理器读取 SMM 转移监视器特性字段：
    -   字段的位 0 是 IA-32e 模式 SMM 特性位，它指示 SMM 转移监视器（STM）被激活后逻辑处理器是否将处于 IA-32e 模式。
        -   如果在不支持 Intel 64 架构的处理器上执行 VMCALL，IA-32e 模式 SMM 特性位必须为 0。
        -   如果在 64 位模式中执行 VMCALL，IA-32e 模式 SMM 特性位必须为 1。
    -   此字段的第 31:1 位当前被保留且必须为零。

如果这些检查中的任何一个失败，跳过后续检查且 VMCALL 失败。

#### 34.15.6.2 更新 current-VMCS 和 executive-VMCS 指针

在执行第 34.15.2.2 节中的步骤之前，激活双监视器处理的 SMM VM 退出通过用 current-VMCS 指针的值加载 SMM 转移 VMCS 指针开始。

#### 34.15.6.3 保存客户状态

如第 34.15.2.4 节所述，SMM VM 退出将 SMBASE 寄存器的内容保存到客户状态区域中的相应字段。虽然这对于激活双监视器处理的 SMM VM 退出也是如此，用于那些 VM 退出的 VMCS 存在于 SMRAM 之外。

SMM 转移监视器（STM）还可以通过使用 RDMSR 指令读取 IA32_SMBASE MSR（MSR 地址 9EH）来发现 SMBASE 寄存器的当前值。以下条目详述此 MSR 的使用：

-   仅当 IA32_VMX_MISC\[15\] = 1 时，此 MSR 才受支持（见附录 A.6）。
-   使用 WRMSR 对 IA32_SMBASE MSR 的写生成一般保护故障（#GP(0)）。如果作为 VM 退出或 VM 进入的一部分进行，对 IA32_SMBASE MSR 的写尝试失败。
-   如果在 SMM 之外执行，使用 RDMSR 从 IA32_SMBASE MSR 的读生成一般保护故障（#GP(0)）。如果作为不在 SMM 中结束的 VM 退出的一部分进行，从 IA32_SMBASE MSR 的读尝试失败。

#### 34.15.6.4 保存 MSR

VM-exit MSR-store 区域不被激活双监视器处理的 SMM VM 退出使用。没有 MSR 被保存到该区域。

#### 34.15.6.5 加载主机状态

在激活双监视器处理的 SMM VM 退出期间为当前的 VMCS 由执行监视器建立。它不包含初始化 STM 所需的 VM-exit 控制和主机状态。因此，此类 SMM VM 退出不像第 30.5 节所述加载处理器状态。相反，状态被设置为固定值或基于 MSEG 头的内容加载（见表 34-10）：

-   CR0 按如下设置：
    -   PG、NE、ET、MP 和 PE 都被设置为 1。
    -   CD 和 NW 保持不变。
    -   所有其他位被清除为 0。
-   CR3 按如下设置：
    -   在支持 IA-32e 模式的处理器上，第 63:32 位被清除。
    -   第 31:12 位被设置为 MSEG 基址与 MSEG 头中 CR3-offset 字段之和的第 31:12 位。
    -   第 11:5 位和第 2:0 位被清除（MSEG 头中 CR3-offset 字段中的相应位被忽略）。
    -   第 4:3 位被设置为 MSEG 头中 CR3-offset 字段的第 4:3 位。
-   CR4 按如下设置：
    -   MCE、PGE、CET、PCIDE、LA57 和 FRED 被清除。
    -   PAE 被设置为 IA-32e 模式 SMM 特性位的值。
    -   如果 IA-32e 模式 SMM 特性位被清除，如果处理器支持，PSE 被设置为 1；如果该位被设置，PSE 被清除。
    -   所有其他位不变。
-   DR7 被设置为 400H。
-   IA32_DEBUGCTL MSR 被清除为 00000000_00000000H。
-   寄存器 CS、SS、DS、ES、FS 和 GS 按如下加载：
    -   所有寄存器可用。
    -   CS.selector 从 MSEG 头中的相应字段加载（高 16 位被忽略），第 2:0 位被清除为 0。如果结果为 0000H，CS.selector 被设置为 0008H。
    -   SS、DS、ES、FS 和 GS 的选择器被设置为 CS.selector+0008H。如果结果为 0000H（如果 CS 选择器为 FFF8H），这些选择器改为被设置为 0008H。
    -   所有寄存器的基址被清除为零。
    -   所有寄存器的段限制被设置为 FFFFFFFFH。
    -   寄存器的 AR 字节按如下设置：
        -   CS.Type 被设置为 11（执行/读、已访问、非一致代码段）。
        -   对于 SS、DS、ES、FS 和 GS，Type 被设置为 3（读/写、已访问、向上扩展数据段）。
        -   所有寄存器的 S 位被设置为 1。
        -   每个寄存器的 DPL 被设置为 0。
        -   所有寄存器的 P 位被设置为 1。
        -   在支持 Intel 64 架构的处理器上，CS.L 被加载 IA-32e 模式 SMM 特性位的值。
        -   CS.D 被加载 IA-32e 模式 SMM 特性位值的反值。
        -   对于 SS、DS、ES、FS 和 GS 中的每一个，D/B 位被设置为 1。
        -   所有寄存器的 G 位被设置为 1。
-   LDTR 不可用。LDTR 选择器被清除为 0000H，且寄存器其他方面未定义（尽管基址总是规范的）。
-   GDTR.base 被设置为 MSEG 基址与 MSEG 头中 GDTR base-offset 字段之和（在支持 IA-32e 模式的处理器上第 63:32 位总是被清除）。GDTR.limit 被设置为 MSEG 头中的相应字段（高 16 位被忽略）。
-   IDTR.base 不变。IDTR.limit 被清除为 0000H。
-   RIP 被设置为 MSEG 基址与 MSEG 头中 RIP-offset 字段值之和（在支持 IA-32e 模式的逻辑处理器上第 63:32 位总是被清除）。
-   RSP 被设置为 MSEG 基址与 MSEG 头中 RSP-offset 字段值之和（在支持 IA-32e 模式的逻辑处理器上第 63:32 位总是被清除）。
-   RFLAGS 被清除，除了位 1，它总是被设置。
-   逻辑处理器保持在活动状态。
-   SMM VM 退出后的事件阻塞如下：
    -   没有由 STI 或由 MOV SS 的阻止。
    -   存在由非可屏蔽中断（NMI）和由 SMI 的阻止。
-   SMM VM 退出后没有挂起的调试异常。
-   对于支持 IA-32e 模式的处理器，IA32_EFER MSR 被修改，使 LME 和 LMA 都包含 IA-32e 模式 SMM 特性位的值。

如果 CR3\[63:5\]、CR4.PAE、CR4.PSE 或 IA32_EFER.LMA 中的任何在改变，TLB 被更新，使 VM 退出后逻辑处理器不使用转换前缓存过的转换。对于由于其他位的设置而不影响分页的更改（例如，如果 IA32_EFER.LMA 在转换前和转换后都为 1，对 CR4.PSE 的更改），这不是必要的。

#### 34.15.6.6 加载 MSR

VM-exit MSR-load 区域不被激活双监视器处理的 SMM VM 退出使用。没有 MSR 从该区域加载。

### 34.15.7 停用双监视器处理

SMM 转移监视器可以停用双监视器处理并将处理器返回到 SMI 和 SMM 的默认处理（见第 34.14 节）。它通过执行带"deactivate dual-monitor treatment" VM-entry 控制设置为 1 的 VM 进入来做到这一点。

如第 29.2.1.3 节和第 34.15.4.1 节所述，在以下情况下停用双监视器处理的尝试失败：（1）处理器不在 SMM 中；（2）"entry to SMM" VM-entry 控制为 1；或（3）executive-VMCS 指针不包含 VMXON 指针（VM 进入是到 VMX 非根操作）。

如第 34.15.4.9 节所述，停用双监视器处理的 VM 进入忽略客户状态区域中可中断性状态字段的 SMI 位。相反，此类 VM 进入后 SMI 的阻塞取决于逻辑处理器是否处于 SMX 操作：¹

-   如果逻辑处理器处于 SMX 操作中，SMI 在 VM 进入后被阻塞。SMI 可以稍后由 VMXOFF 指令（见第 34.14.4 节）或由 GETSEC 指令的某些叶函数（见《Intel® 64 和 IA-32 架构软件开发手册》第 2D 卷第 7 章"Safer Mode Extensions Reference"）解除阻塞。
-   如果逻辑处理器在 SMX 操作之外，SMI 在 VM 进入后被解除阻塞。

## 34.16 SMI 和处理器扩展状态管理

在支持使用 XSAVE/XRSTOR 的处理器扩展状态（见《Intel® 64 和 IA-32 架构软件开发手册》第 1 卷第 13 章"Managing State Using the XSAVE Feature Set"）的处理器上，处理器在 SMI 上不保存任何 XSAVE/XRSTOR 相关状态。SMI 处理程序代码有责任适当保存状态信息（包括 CR4.OSXSAVE、XCR0 以及可能使用 XSAVE/XRSTOR 的处理器扩展状态）。因此，SMI 处理程序必须遵循《Intel® 64 和 IA-32 架构软件开发手册》第 1 卷第 13 章"Managing State Using the XSAVE Feature Set"中描述的规则。

## 34.17 型号特定系统管理增强

本节描述仅适用于第 4 代 Intel Core 处理器的系统管理特性的增强。这些特性是型号特定的。使用这些接口编程时，BIOS 和 SMM 处理程序必须使用 CPUID 枚举 DisplayFamily_DisplayModel 签名。

### 34.17.1 SMM 处理程序代码访问控制

BIOS 可以选择限制 SMM 处理程序执行的代码的地址范围。当启用 SMM 处理程序代码执行检查时，SMM 处理程序在 SMRR 指定的范围之外（见第 34.4.2.1 节）执行的尝试将导致断言不可恢复的机器检查异常（MCE）。

启用 SMM 处理程序代码访问检查的接口驻留在地址 4E0H 的每包作用域型号特定寄存器 MSR_SMM_FEATURE_CONTROL 中。在 SMM 之外对 MSR_SMM_FEATURE_CONTROL 的访问尝试将导致 #GP。对 MSR_SMM_FEATURE_CONTROL 的写进一步受地址 17DH 处 MSR_SMM_MCA_CAP 的配置接口保护。

MSR_SMM_FEATURE_CONTROL 和 MSR_SMM_MCA_CAP 接口的细节在《Intel® 64 和 IA-32 架构软件开发手册》第 4 卷第 2 章"Model-Specific Registers (MSRs)"的表 2-29 中描述。

### 34.17.2 SMI 交付延迟报告

进入系统管理模式发生在指令边界。在逻辑处理器正在执行涉及长内部操作流的指令的情况下，该逻辑处理器对 SMI 的服务将被延迟。由于在物理处理器中执行长内部操作流导致的每个逻辑处理器 SMI 的延迟服务可以通过包作用域寄存器 MSR_SMM_DELAYED（地址 4E2H）查询。

启用由于长内部流导致的 SMI 交付延迟报告的接口驻留在每包作用域型号特定寄存器 MSR_SMM_DELAYED 中。在 SMM 之外对 MSR_SMM_DELAYED 的访问尝试将导致 #GP。MSR_SMM_DELAYED 的可用性受地址 17DH 处 MSR_SMM_MCA_CAP 的配置接口保护。

MSR_SMM_DELAYED 和 MSR_SMM_MCA_CAP 接口的细节在《Intel® 64 和 IA-32 架构软件开发手册》第 4 卷第 2 章"Model-Specific Registers (MSRs)"的表 2-29 中描述。

### 34.17.3 阻塞 SMI 报告

逻辑处理器可能已进入状态并被阻止服务其他中断（包括 SMI）。物理处理器中在服务 SMI 上被阻塞的逻辑处理器可以在包作用域寄存器 MSR_SMM_BLOCKED（地址 4E3H）中查询。在 SMM 之外对 MSR_SMM_BLOCKED 的访问尝试将导致 #GP。

MSR_SMM_BLOCKED 接口的细节在《Intel® 64 和 IA-32 架构软件开发手册》第 4 卷第 2 章"Model-Specific Registers (MSRs)"的表 2-29 中描述。

## 第 35 章 安全仲裁模式（SEAM）

本章规定安全仲裁模式（SEAM），虚拟机扩展架构（VMX）的扩展，允许运行安全虚拟机。

SEAM 架构用作受信任域扩展（TDX）架构的基础。TDX 的细节见《Intel® Trust Domain Extensions (Intel® TDX)——An overview of the Intel TDX technology》。

## 35.1 操作模式

SEAM 架构定义称为 SEAM 的保护操作模式，它是 VMX 操作的扩展。与 VMX 操作一样，SEAM 包括根和非根操作：

-   **SEAM 根操作** 是 VMX 根操作的 SEAM 扩展。在 SEAM 根操作中运行的软件称为 SEAM 模块。SEAM 根操作有两个子模式：
    -   **加载器模式**：任何时间至多一个逻辑处理器可以在此子模式中执行。
    -   **模块模式**：多个逻辑处理器可以并行在此子模式中执行。
-   **SEAM 非根操作** 是 VMX 非根操作的 SEAM 扩展。在此 SEAM 非根操作中运行的软件称为 SEAM 客户。多个逻辑处理器可以并发在此模式中执行。

启用 SEAM 可能需要某些平台操作；在它们被执行之前，SEAM 未被启用。一旦 SEAM 被启用，它可能或可能未准备好用于加载器模式或模块模式中的执行（再次，可能基于某些平台操作）。关于此启用的细节在《Intel® Trust Domain CPU Architectural Extensions》中提供。

以下图表显示 VMX 和 SEAM 软件组件、它们操作的模式以及这些执行模式之间的转换。

**图 35-1. SEAM 操作模式**

### 35.1.1 SEAM 调用

处理器从 VMX 根操作到 SEAM 根操作的转换称为 SEAM 调用。SEAM 调用通过执行 SEAMCALL 指令发起。SEAM 调用以类似于响应 VMX 根操作中 VMCALL 指令执行的 SMM VM 退出（见第 34.15.2 节）的方式操作。SEAM 调用使用驻留在物理地址空间 SEAM 范围内（见第 35.4.1 节）的 SEAM 转移 VMCS。

SEAM 调用使用 RAX\[63\] 确定要进入的 SEAM 根操作子模式。当 RAX\[63\] 为 0 时，转换是进入模块模式 SEAM 根操作；否则，进入加载器模式 SEAM 根操作。如果另一个逻辑处理器在加载器模式中进入的 SEAM 中，进入加载器模式 SEAM 根操作的尝试失败。

### 35.1.2 SEAM 返回

处理器从 SEAM 根操作回到 VMX 根操作的转换称为 SEAM 返回。SEAM 返回通过执行 SEAMRET 指令发起。SEAM 返回以类似于从 SMM 返回的 VM 进入（见第 34.15.4 节）的方式操作。与 SEAM 调用一样，SEAM 返回使用 SEAM 转移 VMCS。

从加载器模式 SEAM 根操作的 SEAM 返回确保逻辑处理器在 SEAM 中使用的任何 VMCS（包括 SEAM 转移 VMCS）的所有数据在内存中；此外，此类 SEAM 返回后没有当前 VMCS。

### 35.1.3 SEAM 主机-客户转换

处理器在 SEAM 根操作和 SEAM 非根操作之间的转换类似于处理器在 VMX 根操作和 VMX 非根操作之间的转换。用于在 SEAM 根和非根操作之间转换并控制 SEAM 非根操作的 VMCS 称为 SEAM 客户 VMCS。

SEAM 客户 VMCS 支持 SEAM 特定字段和控制。一般来说，那些字段和控制被忽略在 SEAM 之外。

SEAM 特定 VMCS 字段如下：

-   **SEAM 客户 KeyID**。这是 VM 执行控制字段，包含为 SEAM 客户的私有页在内存中加密的密钥分配的密钥标识符（KeyID）。
-   **SEAM 共享 EPT 指针**。这是 VM 执行控制字段，包含共享 EPT PML4 表或 PML5 表基址的物理地址（取决于 EPT 如何配置）。

SEAM 特定 VMX 控制如下：

-   **SEAM 客户物理地址宽度**。这是 VM 执行控制，为 SEAM 非根操作确定由 EPT 转换的客户物理地址的宽度以及客户物理地址中 SHARED 位的位置。见第 35.4 节。
-   **允许 SEAM 客户遥测**。这是 VM-entry 控制，允许在 SEAM 非根操作中收集核心遥测。

任何支持 SEAM 的处理器也支持上面标识的 SEAM 特定 VMCS 字段和控制。上面 SEAM 特定 VMX 控制的支持通常由 IA32_VMX_PROCBASED_CTLS3 MSR（对于"SEAM guest-physical address width"）和 IA32_VMX_ENTRY_CTLS MSR（对于"allow SEAM-guest telemetry"）枚举。

SEAM 客户必须启用 EPT 运行。如果 SEAM 客户 VMCS 中未设置"enable EPT" VM 执行控制，SEAM 根操作中的 VM 进入将失败。

## 35.2 SEAM 和 TME-MK

SEAM 与多密钥全内存加密（TME-MK）互操作。本节解释与该互操作相关的 TME-MK 的具体细节。

TME-MK 的当前配置可以从 IA32_TME_ACTIVATE MSR（MSR 地址 982H）的内容推断。以下字段相关：

-   如果 IA32_TME_ACTIVATE\[1:0\] = 11B，全内存加密（TME）活动。
-   IA32_TME_ACTIVATE.MK_TME_KEYID_BITS\[35:32\] 指定物理地址中被解释为密钥标识符（KeyID）的位数。如果 TME 活动且此值大于 0，TME-MK 活动。
-   IA32_TME_ACTIVATE.TDX_RESERVED_KEYID_BITS\[39:36\] 指定只能在 SEAM 私有 KeyID 中使用的 KeyID 位数（见第 35.3.2 节）。此值从不超过 IA32_TME_ACTIVATE.MK_TME_KEYID_BITS。

设 m 为 CPUID.80000008H:EAX\[7:0\] 枚举的值；k = IA32_TME_ACTIVATE.MK_TME_KEYID_BITS；且 p = IA32_TME_ACTIVATE.TDX_RESERVED_KEYID_BITS。然后在任何物理地址中，位 m–1:m–k 形成用于选择加密密钥的密钥标识符（只有位 (m–k)–1:0 用于寻址内存）。PCONFIG 指令可用于指定与每个密钥标识符关联的加密密钥。

IA32_MKTME_KEYID_PARTITIONING MSR（MSR 地址 87H）枚举可用于的密钥标识符数量：

-   IA32_MKTME_KEYID_PARTITIONING.NUM_MKTME_KIDS\[31:0\] 枚举可用于一般使用的 TME-MK 密钥标识符数量。它们编号为 1 到 NUM_MKTME_KIDS（0 不被视为 TME-MK 密钥标识符）。
-   IA32_MKTME_KEYID_PARTITIONING.NUM_TDX_PRIV_KIDS\[63:32\] 枚举 SEAM 私有密钥标识符数量。它们编号为 NUM_MKTME_KIDS + 1 到 NUM_MKTME_KIDS + NUM_TDX_PRIV_KIDS。

## 35.3 SEAM 中的操作

本节提供 SEAM 根操作和 SEAM 非根操作的细节。

### 35.3.1 SEAM 根操作

SEAM 根操作中的处理器行为类似于 VMX 根操作中的处理器行为，但有以下差异：

-   软件可以执行 SEAMRET 和 SEAMOPS 指令。（在 SEAM 根操作之外执行这些指令导致 #UD 异常。）如第 35.1.2 节所述，SEAMRET 的执行导致到 VMX 根操作的 SEAM 返回。SEAMRET 和 SEAMOPS 指令在《Intel® Trust Domain CPU Architectural Extensions》中描述。
-   软件可以访问特殊的一组 SEAM 专用 MSR。在 SEAM 之外对 SEAM 专用 MSR 的访问尝试导致 #GP(0) 异常。（一些可能仅在 SEAM 根操作中可访问。）SEAM 专用 MSR 的完整集合在《Intel® Trust Domain CPU Architectural Extensions》中规定。
-   在 SEAM 根操作中执行 VMXOFF 指令或 VMCALL 指令的尝试导致 #GP(0) 异常。SEAM 中的软件不能离开 VMX 操作，也不能使用 SMM VM 退出调用 SMM 转移监视器。
-   进入 SEAM 根操作（通过 SEAM 调用或从 SEAM 非根操作的 VM 退出）阻塞 NMI。在 SEAM 根操作中执行 IRET 正常解除 NMI 的阻塞。
-   系统管理中断（SMI）、非核心机器检查和机器检查 SMI（MSMI）在 SEAM 根操作中被屏蔽。如果挂起，它们在离开 SEAM 根操作后被交付。
-   在 SEAM 根操作中由中毒缓存行消耗引起的三重故障和机器检查导致不可破坏的关闭。
-   缓存地址转换的 TLB 条目被标记"in SEAM"位，以将它们与 VMX 非根操作中缓存的地址转换分开。在 VMX 根操作中运行的软件可以使用 INVEPT 指令但不能使用 INVVPID 指令使它们无效。

### 35.3.2 SEAM 非根操作

SEAM 非根操作中的处理器行为大体上与 VMX 非根操作中的相同。

在 SEAM 非根操作中发生的系统管理中断（SMI）和机器检查 SMI（MSMI）导致 VM 退出而不是被正常交付。SMI 或 MSMI 保持挂起并将在下一次 SEAM 返回后交付。

本节的其余部分解释 SEAM 非根操作中关于客户物理地址使用的更改。

如第 35.1.3 节所述，到 SEAM 非根操作的 VM 进入要求启用 EPT。因此，客户软件用作物理地址的所有地址（例如，客户分页结构中的地址）被视为客户物理地址并因此由 EPT 转换。SEAM 非根操作中 EPT 的转换与普通 VMX 非根操作中的有些不同。

在 VMX 非根操作中，客户物理地址的宽度为 48 位（如果使用 4 级 EPT）或 52 位（对于 5 级 EPT）。在 SEAM 非根操作中，如果"SEAM guest-physical address width" VM 执行控制为 0（即使使用 5 级 EPT），客户物理地址宽度为 48 位。

如果客户物理地址宽度为 48，对设置 51:48 范围内位的客户物理地址的访问导致 EPT 违规。（这在 SEAM 之外的 5 级 EPT 中不是这种情况。在 SEAM 中，只要"SEAM guest-physical address width" VM 执行控制为 0，这在 5 级分页中发生。）

客户物理地址中的最高位（按适当的位 47 或位 51）被定义为地址的"SHARED"位。清除此位的客户物理地址是 SEAM 客户私有地址；设置此位的那些是 SEAM 客户共享地址。

SEAM 非根操作中的某些情况需要 SEAM 客户私有地址：

-   指令获取限于 SEAM 客户私有地址。从 SEAM 客户共享地址获取指令的尝试导致一般保护异常（#GP(0)）。
-   CR3 必须包含 SEAM 客户私有地址。用 SEAM 客户共享地址加载 CR3 的尝试导致 #GP(0)。
-   使用 PAE 分页时，每个 PDPTE 寄存器必须包含 SEAM 客户私有地址。用 SEAM 客户共享地址加载任何 PDPTE 寄存器的尝试导致 #GP(0)。
-   客户分页结构必须位于 SEAM 客户私有地址。如果线性地址转换遇到引用带 SEAM 客户共享地址的分页结构的分页结构条目，发生页错误（#PF）。错误码将设置位 3，指示设置了保留位。

客户物理地址的转换对于私有和共享地址不同：

-   SEAM 客户私有地址的转换使用使用 VMCS 中 EPTP 字段定位的 EPT 分页结构。
    -   用于访问 EPT 分页结构的任何物理地址按如下修改。设 k 为 IA32_TME_ACTIVATE.MK_TME_KEYID_BITS\[35:32\] 的值且 M 为 CPUID.80000008H:EAX\[7:0\] 枚举的值。在用于访问内存之前，物理地址的位 M–1:M–k 被替换为 VMCS 中 SEAM 客户 KeyID 字段的位 k–1:0。
    -   最终物理地址（原始 SEAM 客户私有地址正被转换到的）也按上一段描述的方式修改。
-   SEAM 客户共享地址的转换使用使用 VMCS 中 SEAM 共享 EPT 指针定位的 EPT 分页结构。
    -   EPTP 字段（不是 SEAM 共享 EPT 指针）的第 7:0 位控制客户物理地址的转换。
    -   用于访问 EPT 分页结构的任何物理地址不应使用 SEAM 私有 KeyID（见第 35.2 节）。如果 SEAM 客户共享地址的转换将访问带 SEAM 私有 KeyID 的 EPT 分页结构，发生 EPT 误配置。
    -   最终物理地址（原始 SEAM 客户共享地址正被转换到的）也不得包含 SEAM 私有 KeyID；否则，发生 EPT 误配置。

## 35.4 内存保护

本节规定应用于保护在 SEAM 根操作（SEAM 模块）和 SEAM 非根操作（SEAM 客户）中运行的软件的访问控制和加密措施。

### 35.4.1 SEAM 范围

SEAM 范围是为 SEAM 模块隔离的物理内存范围。该范围使用范围寄存器 MSR IA32_SEAMRR_BASE（索引 1400H）和 IA32_SEAMRR_MASK（索引 1401H）分配。这些 MSR 的存在由 IA32_MTRRCAP（MSR 地址 FEH）的位 15 枚举。支持 SEAM 架构的处理器返回 IA32_MTRRCAP 位 15 为 1。这些 MSR 的更多信息见《Intel® 64 和 IA-32 架构软件开发手册》第 4 卷第 2 章。

SEAM 范围被划分为模块子范围和加载器子范围。

IA32_SEAMRR_MASK MSR 的位 11 指示 SEAM 范围是否有效且受保护。当此位为 1 时，处理器按如下为 SEAM 范围提供加密和访问控制保护：

-   在 SEAM 根操作之外，对 SEAM 范围内物理地址的访问被中止，意味着写被忽略且读返回所有位设置为 1 的值。
-   以下条目适用于 SEAM 根操作：
    -   允许对 SEAM 范围模块子范围的访问。
    -   对 SEAM 范围加载器子范围的访问仅在加载器模式 SEAM 根操作中允许；否则它们被中止（见上文）。
    -   处理器阻止从 SEAM 范围之外物理地址的指令获取（对此类尝试的响应是实现特定的）。
-   SEAM 范围的内容由 TME-MK 引擎加密。加密密钥是机器特定的。它通常是每次平台重启时生成的"临时"密钥。

当 CR0.CD = 0 时，对 SEAM 范围的访问使用写回（WB）内存类型，无论 MTRR 和 PAT 寄存器如何。如果 CR0.CD = 1，访问使用不可缓存（UC）内存类型。

### 35.4.2 内存保护

在 SEAM 之外，持有物理地址的寄存器不能被加载带 SEAM 私有 KeyID 的物理地址（见第 35.3.2 节）：

-   用带 SEAM 私有 KeyID 的物理地址加载控制寄存器和 MSR 的尝试导致一般保护异常（#GP(0)）。这不适用于 IA32_RTIT_OUTPUT_BASE MSR 的加载（使用 WRMSR、WRMSRLIST、WRMSRNS 或 XRSTORS），因为该 MSR 在另一个时间被检查（见下文）。
-   遇到带 SEAM 私有 KeyID 的物理地址的分页结构条目的无 EPT 线性地址转换导致页错误。
-   遇到带 SEAM 私有 KeyID 的物理地址的 EPT 分页结构条目的带 EPT 客户物理地址转换导致 EPT 误配置。
-   如果 VM 进入将使用或加载包含 SEAM 私有 KeyID 的物理地址（来自除 SEAM 共享 EPT 指针之外的 VMCS 字段），它失败。
-   当处理器跟踪被启用（IA32_RTIT_CTL.TraceEn 被设置为 1）时，正被加载到 IA32_RTIT_OUTPUT_BASE MSR 的物理地址的值被检查，从物理地址表（ToPA）加载新输出缓冲区的物理地址也是如此。用带 SEAM 私有 KeyID 的物理地址加载这些之一的尝试导致机器相关行为：要么处理器跟踪被禁用并记录错误，要么后续跟踪输出被丢弃。
-   用带非零 KeyID 的物理地址加载 IA32_APIC_BASE 的尝试导致 #GP(0)。
-   带 SEAM 私有 KeyID 的物理地址操作数的 VMX 指令失败，就像物理地址设置了保留位为 1。

如果尽管上面标识的限制，存在使用带 SEAM 私有 KeyID 的物理地址的访问（可能因为 MSR 在 TME 被激活前已被加载），访问被中止，意味着写被忽略且读返回所有位设置为 1 的值。

用带 SEAM 私有 KeyID 的物理地址写入的缓存行不能使用带不同 KeyID 的物理地址读取。特定处理器支持的内存保护模式是机器相关的。内存保护模式的信息见《Intel® Architecture Memory Protections for Confidential Compute Usages》。

## 35.5 SEAM 指令参考

SEAM 架构包括以下指令：

-   **SEAMCALL**。执行导致进入 SEAM 根操作的 SEAM 调用（见第 35.1.1 节）。它可以被虚拟机监视器（在 VMX 根操作中操作）用来调用 SEAM 模块服务。
-   **TDCALL**。执行导致从 SEAM 非根操作到 SEAM 根操作的 VM 退出。它可以被 SEAM 客户用来请求 SEAM 模块服务。
-   **SEAMOPS**。执行调用 SEAM 特定操作。它被 SEAM 模块用来执行此类操作。
-   **SEAMRET**。执行导致离开 SEAM 根操作的 SEAM 返回（第 35.1.2 节）。它被 SEAM 模块用来返回到调用虚拟机监视器。

SEAMCALL 和 TDCALL 在本节后面描述。SEAMOPS 和 SEAMRET 只能在 SEAM 根操作中执行。细节在《Intel® Trust Domain CPU Architectural Extensions》中给出，而以下条目提供高级信息：

-   **SEAMOPS**。SEAMOPS 指令允许在 SEAM 根操作中运行的软件调用 SEAM 特定操作。其中一些操作只能在加载器模式中调用。
-   **SEAMRET**。
    -   SEAMRET 是特权指令，允许在 SEAM 根操作中运行的软件返回到 VMX 根操作。
    -   指令使用 SEAM 转移 VMCS 导致 SEAM 返回（见第 35.1.2 节）。此转换类似于从 SMM 返回的 VM 进入（见第 34.15.4 节）。

在不支持 SEAM 的处理器上执行 SEAM 指令的尝试导致无效操作码异常（#UD）。

* * *

### SEAMCALL——进入 SEAM 根操作

| 操作码 | 指令  | Op/En | 64 位模式 | 兼容/传统模式 | 描述  |
| --- | --- | --- | --- | --- | --- |
| 66 0F 01 CF | SEAMCALL | ZO  | 有效  | 无效  | 转换到 SEAM 根操作。 |

**指令操作数编码**

| Op/En | 操作数 1 | 操作数 2 | 操作数 3 | 操作数 4 |
| --- | --- | --- | --- | --- |
| ZO  | N/A | N/A | N/A | N/A |

**描述**

SEAMCALL 是特权指令，将控制传递给在 SEAM 根操作中运行的软件。指令只能在 SEAM 之外和 SMM 之外的 VMX 操作中的 64 位模式中执行。在 VMX 非根操作中，执行导致带退出原因 76（SEAMCALL）的 VM 退出。

当 SEAM 范围无效（IA32_SEAMRR_MASK MSR\[11\] = 0）时或紧接 MOV to SS 或 POP SS 指令执行之后的执行导致一般保护异常（#GP）。

指令使用 RAX\[63\] 选择 SEAM 根操作的子模式：如果此值为 1，指令转换到加载器模式 SEAM 根操作；否则，它转换到模块模式 SEAM 根操作。如果 SEAM 被全局禁用；或如果另一个逻辑处理器在加载器模式中进入的 SEAM 中时调用加载器模式 SEAM 根操作，指令以 VMFailInvalid 指示失败（见第 33.2 节）。

如果没有失败，SEAMCALL 使用 SEAM 转移 VMCS 实现 SEAM 调用（见第 35.1.1 节）。此类转换的细节在《Intel® Trust Domain CPU Architectural Extensions》中规定。

**操作**

```python
IF 不在 VMX 操作中 或在 SMM 中 或在 SEAM 中 或 IA32_EFER.LMA = 0 或 CS.L = 0
THEN #UD；
ELSIF CPL > 0
THEN #GP(0)；
ELSIF 在 VMX 非根操作中
THEN VM exit；
ELSIF IA32_SEAMRR_MASK.VALID = 0 或 事件被 MOV SS 阻止
THEN #GP(0)；
ELSIF SEAM 被全局禁用
THEN VMFailInvalid；
ELSIF RAX[63] = 0
THEN
  IF 模块模式 SEAM 根操作未准备好执行
  THEN VMFailInvalid；
  ELSE
    进入模块模式 SEAM 根操作；
  FI；
ELSE
  IF 加载器模式 SEAM 根操作未准备好执行 或
  另一个逻辑处理器在加载器模式中进入的 SEAM 中执行
  THEN VMFailInvalid；
  ELSE
    进入加载器模式 SEAM 根操作；
  FI；
FI；
```

**影响的标志**

见上面的操作部分和第 33.2 节。

**保护模式异常**

-   #UD：SEAMCALL 在保护模式中不被识别。

**实地址模式异常**

-   #UD：SEAMCALL 在实地址模式中不被识别。

**虚拟 8086 模式异常**

-   #UD：SEAMCALL 在虚拟 8086 模式中不被识别。

**兼容模式异常**

-   #UD：SEAMCALL 在兼容模式中不被识别。

**64 位模式异常**

-   #GP(0)：如果当前特权级别不为 0。如果 SEAM 范围无效。如果事件被 MOV SS 阻止。
-   #UD：如果在 VMX 操作之外执行。如果在系统管理模式（SMM）中执行。如果在 SEAM 中执行。

* * *

### TDCALL——调用 SEAM 模块

| 操作码 | 指令  | Op/En | 64 位模式 | 兼容/传统模式 | 描述  |
| --- | --- | --- | --- | --- | --- |
| 66 0F 01 CC | TDCALL | ZO  | 有效  | 有效  | 从 SEAM 客户调用 SEAM 监视器。 |

**指令操作数编码**

| Op/En | 操作数 1 | 操作数 2 | 操作数 3 | 操作数 4 |
| --- | --- | --- | --- | --- |
| ZO  | N/A | N/A | N/A | N/A |

**描述**

TDCALL 是特权指令，允许在 SEAM 非根操作中运行的软件调用在 SEAM 根操作中运行的软件。指令只能在 SEAM 非根操作或 VMX 非根操作中执行。

在 SEAM 非根操作或 VMX 非根操作中，执行导致带退出原因 77（TDCALL）的 VM 退出。

**操作**

```python
IF 不在 SEAM 非根操作中 且 不在 VMX 非根操作中
THEN #UD；
ELSIF CPL > 0
THEN #GP(0)；
ELSE VM exit；
FI；
```

**影响的标志**

无。

**保护模式异常**

-   #UD：如果在 VMX 非根操作之外且 SEAM 非根操作之外执行。
-   #GP(0)：如果当前特权级别不为 0。

**实地址模式异常**

-   #UD：如果在 VMX 非根操作之外且 SEAM 非根操作之外执行。

**虚拟 8086 模式异常**

-   #UD：如果在 VMX 非根操作之外且 SEAM 非根操作之外执行。
-   #GP(0)：如果在 VMX 非根操作中或 SEAM 非根操作中执行。

**兼容模式异常**

与保护模式异常相同。

**64 位模式异常**

与保护模式异常相同。

## 第 36 章 Intel® 处理器追踪

## 36.1 概述

Intel® 处理器追踪（Intel PT）是 Intel® 架构的扩展，使用专用硬件设施捕获关于软件执行的信息，仅对正被追踪的软件造成最小性能扰动。此信息被收集在数据包中。Intel PT 的初始实现提供控制流追踪，它生成各种由软件解码器处理的数据包。数据包包括定时、程序流信息（例如，分支目标、分支采取/未采取指示）和程序引起模式相关信息（例如，Intel TSX 状态转换、CR3 更改）。这些数据包可以在被发送到内存子系统或平台中可用的其他输出机制之前在内部缓冲。调试软件可以处理追踪数据并重构程序流。

Intel 处理器追踪首先在基于 Broadwell 微架构的 Intel® 处理器和基于 Goldmont 微架构的 Intel Atom® 处理器中引入。后来的几代包括额外的追踪源，包括使用 PTWRITE 的软件追踪插桩和电源事件追踪。

### 36.1.1 特性和能力

Intel PT 的控制流追踪生成各种数据包，当与程序的二进制由后处理工具组合时，可以用来产生精确的执行追踪。数据包记录流信息，如指令指针（IP）、间接分支目标以及连续代码区域（基本块）内条件分支的方向。

Intel PT 也可以被配置为使用 PTWRITE 记录软件生成的数据包，以及描述处理器电源管理事件的数据包。此外，精确事件采样（PEBS）可以被配置为在 Intel PT 追踪中记录 PEBS 记录；见第 22.5.5.2 节。

此外，数据包记录其他上下文、定时和簿记信息，使得应用的功能和性能调试成为可能。Intel PT 有几个控制和过滤能力可用于定制收集的追踪信息并追加其他处理器状态和定时信息以支持调试。例如，有允许基于当前特权级别（CPL）或 CR3 的值过滤数据包的模式。

数据包生成和过滤能力的配置通过一组 MSR 编程。MSR 通常遵循 IA32_RTIT\_\* 命名约定。这些配置 MSR 提供的能力由 CPUID 枚举，见第 36.3 节。配置 Intel PT 的 MSR 的细节在第 36.2.8 节中描述。

#### 36.1.1.1 数据包总结

在追踪工具已启用并配置适当的 MSR 之后，处理器将收集并生成以下类别的数据包中的追踪信息（数据包的更多细节见第 36.4 节）：

-   关于程序执行基本信息的数据包；这些包括：
    -   **数据包流边界（PSB）数据包**：PSB 数据包充当以规则间隔（例如，每 4K 追踪数据包字节）生成的"心跳"。这些数据包允许数据包解码器在输出数据流内找到数据包边界；PSB 数据包应是解码器开始解码追踪时寻找的第一个数据包。
    -   **分页信息数据包（PIP）**：PIP 记录对 CR3 寄存器的修改。此信息连同操作系统提供的每个进程 CR3 值的信息，允许调试器将线性地址归因于其正确的应用源代码。
    -   **时间戳计数器（TSC）数据包**：TSC 数据包帮助跟踪挂钟时间，并包含软件可见时间戳计数器的一些部分。
    -   **核心总线比率（CBR）数据包**：CBR 数据包包含核心:总线时钟比率。
    -   **迷你时间计数器（MTC）数据包**：MTC 数据包提供挂钟时间经过的周期性指示。
    -   **周期计数（CYC）数据包**：CYC 数据包提供数据包之间经过的处理器核心时钟周期数的指示。
    -   **溢出（OVF）数据包**：当处理器经历导致数据包被丢弃的内部缓冲区溢出时发送 OVF 数据包。此数据包通知解码器丢失并可以帮助解码器响应此情况。
-   关于控制流信息的数据包：
    -   **采取/未采取（TNT）数据包**：TNT 数据包跟踪直接条件分支的"方向"（采取或未采取）。
    -   **目标 IP（TIP）数据包**：TIP 数据包记录间接分支、异常、中断和其他分支或事件的目标 IP。这些数据包可以包含 IP，尽管该 IP 值可以通过消除与最后一个 IP 匹配的高位字节来压缩。有各种类型的 TIP 数据包；它们在 36.4.2.2 节中更详细地覆盖。
    -   **流更新数据包（FUP）**：FUP 为异步事件（中断和异常）提供源 IP 地址，以及其他源地址不能从二进制确定的情况。
    -   **MODE 数据包**：这些数据包为解码器提供重要的处理器执行信息，使它能够适当解释反汇编的二进制和追踪日志。MODE 数据包有指示细节如执行模式（16 位、32 位或 64 位）的各种格式。
-   由软件插入的数据包：
    -   **PTWRITE（PTW）数据包**：包含传递给 PTWRITE 指令的操作数的值（见《Intel® 64 和 IA-32 架构软件开发手册》第 2B 卷中的"PTWRITE——Write Data to a Processor Trace Packet"）。
-   关于处理器电源管理事件的数据包：
    -   **MWAIT 数据包**：指示 MWAIT 操作成功完成到比 C0.0 更深的 C 状态。
    -   **电源状态进入（PWRE）数据包**：指示进入比 C0.0 更深的 C 状态。
    -   **电源状态退出（PWRX）数据包**：指示从比 C0.0 更深的 C 状态退出，返回到 C0。
    -   **执行停止（EXSTOP）数据包**：指示软件执行已停止，由于诸如 P 状态更改、C 状态更改或热节流等事件。
-   包含处理器状态值组的数据包：
    -   **块开始数据包（BBP）**：指示以下组中持有的状态类型。
    -   **块项数据包（BIP）**：指示组中持有的状态值。
    -   **块结束数据包（BEP）**：指示当前组的结束。

## 36.2 Intel® 处理器追踪操作模型

本节描述整体 Intel 处理器追踪机制和与其操作方式相关的必要概念。

### 36.2.1 流改变指令（COFI）追踪

基本程序块是没有跳转或分支发生的代码段。此代码块中的指令指针（IP）不需要被追踪，因为处理器将从头到尾执行它们而不重定向代码流。诸如分支的指令和诸如异常或中断的事件可以更改程序流。这些更改程序流的指令和事件称为流改变指令（COFI）。COFI 有三个类别：

-   直接转移 COFI。
-   间接转移 COFI。
-   远转移 COFI。

以下小节描述导致追踪数据包生成的 COFI 事件。表 36-1 按 COFI 类型列出分支指令。特定指令的详细描述见《Intel® 64 和 IA-32 架构软件开发手册》。

**表 36-1. 分支指令的 COFI 类型**

| COFI 类型 | 指令  |
| --- | --- |
| 条件分支 | JA, JAE, JB, JBE, JC, JCXZ, JECXZ, JRCXZ, JE, JG, JGE, JL, JLE, JNA, JNAE, JNB, JNBE, JNC, JNE, JNG, JNGE, JNL, JNLE, JNO, JNP, JNS, JNZ, JO, JP, JPE, JPO, JS, JZ, LOOP, LOOPE, LOOPNE, LOOPNZ, LOOPZ |
| 无条件直接分支 | JMP (E9 xx, EB xx), CALL (E8 xx) |
| 间接分支 | JMP (FF /4), CALL (FF /2), RET (C3, C2 xx) |
| 远转移 | ERETS, ERETU, INT1, INT3, INT n, INTO, IRET, IRETD, IRETQ, JMP (EA xx, FF /5), CALL (9A xx, FF /3), RET (CB, CA xx), SYSCALL, SYSRET, SYSENTER, SYSEXIT, VMLAUNCH, VMRESUME |

#### 36.2.1.1 直接转移 COFI

直接转移 COFI 是相对分支。这意味着它们的目标是其与当前 IP 的偏移嵌入在指令字节中的 IP。没有必要在追踪输出中指示这些指令的目标，因为它可以通过源代码反汇编获得。条件分支只需要指示分支是否被采取。无条件分支不需要在追踪输出中记录任何内容。有两个子类别：

-   **条件分支（Jcc、J*CXZ）和 LOOP**  
    为追踪此类指令，处理器编码单个位（采取或未采取——TNT）以指示指令后的程序流。  
    Jcc、J*CXZ 和 LOOP 可以用 TNT 位追踪。为提高追踪数据包输出效率，处理器将把几个 TNT 位压缩到单个数据包中。
-   **无条件直接跳转**  
    直接无条件跳转（如 JMP near relative 或 CALL near relative）不需要追踪输出，因为它们可以直接从应用汇编推断。直接无条件跳转不生成 TNT 位或目标 IP 数据包，尽管切换 Intel PT 使能的无条件直接跳转可以生成 TIP.PGD 和 TIP.PGE 数据包（见第 36.2.6 节）。

#### 36.2.1.2 间接转移 COFI

间接转移指令涉及从寄存器或内存位置更新 IP。由于寄存器或内存内容可以在执行期间的任何时间变化，在寄存器或内存内容被读取之前无法知道间接转移的目标。因此，反汇编的代码不足以确定此类 COFI 的目标。因此，追踪硬件必须在追踪数据包中发送出目标 IP 供调试软件确定 COFI 的目标地址。注意此 IP 可以是线性或有效地址（见第 36.3.1.1 节）。

间接转移指令生成包含分支目标地址的目标 IP 数据包（TIP）。有两个子类别：

-   **近 JMP 间接和近 CALL 间接**  
    如前所述，间接 COFI 的目标驻留在寄存器或内存位置的内容中。因此，处理器必须生成包含此目标地址的数据包以允许解码器确定程序流。
-   **近 RET**  
    当 CALL 指令执行时，它将 CALL 之后的下一条指令的地址压入栈。调用过程完成后，RET 指令通常用于从调用栈弹出返回地址并将代码流重定向回 CALL 之后的指令。  
    RET 指令简单地将程序流转移到它从栈弹出的地址。因为被调用过程可以在执行 RET 指令之前更改栈上的返回地址，如果调试软件假设代码流将返回到最后一个 CALL 之后的指令，它可能被误导。因此，即使对于近 RET，也可能发送目标 IP 数据包。
    -   **RET 压缩**  
        如果 RET 的目标与跟踪调用栈所期望的一致，应用特殊情况。如果确保解码器已看到相应的 CALL（"相应"定义为具有匹配栈深度的 CALL），且 RET 目标是该 CALL 之后的指令，RET 目标可以被"压缩"。在这种情况下，只生成单个"taken"的 TNT 位而不是目标 IP 数据包。为确保解码器在 RET 压缩情况下不会混淆，在给定逻辑处理器中，只有对应于自最后一个 PSB 数据包以来已看到的 CALL 的 RET 可以被压缩。细节见第 36.4.2.2 节中的"Indirect Transfer Compression for Returns (RET)"。

#### 36.2.1.3 远转移 COFI

所有更改指令指针且不是近跳转的操作是"远转移"。这包括异常、中断、陷阱、TSX 中止和执行远转移的指令。

所有远转移将产生提供目标 IP 地址的目标 IP（TIP）数据包。对于不能从二进制源推断的那些远转移（例如，诸如异常和中断的异步事件），TIP 将由提供事件被采取处源 IP 地址的流更新数据包（FUP）先行。表 36-23 指示远转移生成的 FUP 中将确切包含哪个 IP。

### 36.2.2 使用 PTWRITE 的软件追踪插桩

PTWRITE 提供软件可以对 Intel PT 追踪插桩的机制。PTWRITE 是 ring3 可访问的指令，可以传递寄存器或内存变量，细节见《Intel® 64 和 IA-32 架构软件开发手册》第 2B 卷中的"PTWRITE——Write Data to a Processor Trace Packet"。假设 PTWRITE 被启用且所有其他过滤条件被满足，该变量的内容将在 PTWRITE 退役时用作插入的 PTW 数据包的载荷（见表 36-40"PTW Packet Definition"）。解码和分析软件然后将能够基于关联 PTWRITE 指令的 IP 确定 PTWRITE 数据包的含义。

PTWRITE 通过 IA32_RTIT_CTL.PTWEn\[12\] 启用（见表 36-6）。可选地，用户可以使用 IA32_RTIT_CTL.FUPonPTW\[5\] 启用 PTW 数据包后跟包含关联 PTWRITE 指令 IP 的 FUP 数据包。对 PTWRITE 的支持在基于 Goldmont Plus 微架构的 Intel Atom 处理器中引入。

### 36.2.3 电源事件追踪

电源事件追踪是暴露核心和线程级睡眠状态和断电转换信息的能力。当此能力被启用时，追踪将暴露关于以下的信息：

-   软件执行停止的场景。
    -   由于睡眠状态进入、频率更改或其他断电。
    -   包括 IP，当在追踪上下文中时。
-   请求和解决的硬件线程 C 状态。
    -   包括硬件自主 C 状态进入的指示。
-   睡眠会话期间实现的最大和最深核心 C 状态。
-   C 状态唤醒的原因。

此信息是任何断电后默认提供的总线比率（CBR）信息和断电状态期间或之后提供的定时信息（TSC、TMA、MTC、CYC）的补充。

电源事件追踪通过 IA32_RTIT_CTL.PwrEvtEn\[4\] 启用。对电源事件追踪的支持在基于 Goldmont Plus 微架构的 Intel Atom 处理器中引入。

### 36.2.4 事件追踪

事件追踪是暴露异步事件、它们何时生成以及其相应软件事件处理程序何时完成执行的细节的能力。这些包括：

-   中断，包括 NMI 和 SMI，包括（当定义时）中断向量。
-   故障、异常，包括故障向量。
    -   页错误在上下文中时额外包括页错误地址。
-   事件处理程序返回，包括 ERETS、ERETU、IRET 和 RSM。
-   VM 退出和 VM 进入。¹
    -   VM 退出包括写入"exit reason"和"exit qualification" VMCS 字段的值。
-   INIT 和 SIPI 事件。
-   TSX 中止，包括为 RTM 指令返回的中止状态。
-   关闭。

此外，它提供中断标志（IF）状态的指示，以指示中断何时被屏蔽。

事件追踪通过 IA32_RTIT_CTL.EventEn\[31\] 启用。事件追踪信息在控制流事件（CFE）和事件数据（EVD）数据包以及传统 MODE.Exec 数据包中传达。数据包细节见第 36.4.2 节。对事件追踪的支持在基于 Gracemont 微架构的 Intel® 处理器中引入。

### 36.2.5 追踪过滤

Intel 处理器追踪提供过滤能力，通过它们调试/性能分析工具可以控制什么代码被追踪。

#### 36.2.5.1 按当前特权级别（CPL）过滤

Intel PT 提供配置逻辑处理器仅在 CPL = 0、CPL > 0 或无论 CPL 如何时生成追踪数据包的能力。

CPL 过滤确保与过滤的 CPL 关联的任何 IP 或其他架构状态信息不能在日志中看到。例如，如果处理器被配置为仅在 CPL > 0 时追踪，且软件执行 SYSCALL（将 CPL 更改为 0），SYSCALL 的目标 IP 将从生成的数据包中抑制（见第 36.4.2.5 节中 TIP.PGD 的讨论）。

应该注意，在实地址模式中 CPL 总是 0，且在虚拟 8086 模式中 CPL 总是 3。要追踪这些模式中的代码，应相应配置过滤。

当软件在非启用 CPL 中执行时，ContextEn 被清除。细节见第 36.2.6.1 节。

#### 36.2.5.2 按 CR3 过滤

Intel PT 支持 CR3 过滤机制，通过它基于 CR3 的值可以启用或禁用包含架构状态的数据包的生成。调试器可以使用 CR3 过滤仅追踪单个应用而不上下文切换 RTIT MSR 的状态。对于来自多线程软件的重建追踪，调试软件可能希望上下文切换 RTIT MSR 的状态（如果操作系统不提供上下文切换支持）以分离不同线程的输出（见第 36.3.5 节"Context Switch Consideration"）。

要仅为单个 CR3 值追踪，软件可以将该值写入 IA32_RTIT_CR3_MATCH MSR，并设置 IA32_RTIT_CTL.CR3Filter。当 CR3 值不匹配 IA32_RTIT_CR3_MATCH 且 IA32_RTIT_CTL.CR3Filter 为 1 时，ContextEn 被强制为 0，且包含架构状态的数据包将不被生成。当 ContextEn 为 0 时，可以生成一些其他数据包；细节见第 36.2.6.3 节。当 CR3 确实匹配 IA32_RTIT_CR3_MATCH（或当 IA32_RTIT_CTL.CR3Filter 为 0）时，CR3 过滤不强制 ContextEn 为 0（尽管由于其他过滤器或模式它可以是 0）。

如果两个寄存器在第 63:12 位，或在 PAE 分页模式中第 63:5 位相同，CR3 匹配 IA32_RTIT_CR3_MATCH；CR3 和 IA32_RTIT_CR3_MATCH 的低 5 位被忽略。CR3 过滤独立于 CR0.PG 的值。

当使用 CR3 过滤时，如果处理器被配置为在 CPL = 0 时追踪（IA32_RTIT_CTL.OS = 1），PIP 数据包可能仍在日志中看到。如果不是，将不会看到 PIP 数据包。

#### 36.2.5.3 按 IP 过滤

如果 CPUID.14H.00H:EBX\[2\] = 1，支持带按 IP 可配置过滤的追踪数据包生成。Intel PT 可以被配置为仅当处理器正在执行某些 IP 范围内的代码时启用包含架构状态的数据包的生成。如果 IP 在这些范围之外，一些数据包的生成被阻止。

使用 IA32_RTIT_CTL MSR 中的 ADDRn_CFG 字段启用 IP 过滤（第 36.2.8.2 节），其中数字'n'是选择正被配置的地址范围的零基编号。每个 ADDRn_CFG 字段配置  
寄存器对 IA32_RTIT_ADDRn_A 和 IA32_RTIT_ADDRn_B 的使用（第 36.2.8.5 节）。IA32_RTIT_ADDRn_A 定义基址且 IA32_RTIT_ADDRn_B 指定启用追踪的范围的限制。因此每个范围（称为 ADDRn 范围）由 \[IA32_RTIT_ADDRn_A, IA32_RTIT_ADDRn_B\] 定义。可以有多个此类范围，软件可以查询 CPUID（第 36.3.1 节）获取处理器上支持的范围数量。

默认行为（ADDRn_CFG=0）定义无 IP 过滤范围，意味着 FilterEn 总是被设置。在这种情况下，任何 IP 的代码都可以被追踪，尽管其他过滤器（如 CR3 或 CPL）可以限制追踪。当 ADDRn_CFG 被设置为启用 IP 过滤（见第 36.3.1 节）时，当看到目标地址在 ADDRn 范围内的采取分支或事件时，追踪将开始。

当在追踪区域内且 FilterEn 被设置时，只有在目标在范围之外的采取分支或事件退役后，才可能检测到离开追踪区域。如果 ADDRn 范围通过执行下一个顺序指令而不是通过控制流转移被进入或退出，FilterEn 可能不会立即切换。FilterEn 的更多细节见第 36.2.6.5 节。

注意这些地址范围基址和限制值是包含性的，使得范围包括其第一条指令字节在 ADDRn 范围内的第一条和最后一条指令。

取决于处理器实现，IP 过滤可以基于线性或有效地址。如果 CSbase 不等于零或在实模式中，这可能导致实现之间的不同行为。细节见第 36.3.1.1 节。软件可以查询 CPUID 确定过滤器基于线性还是有效地址（第 36.3.1 节）。

注意一些数据包，如 MTC（第 36.3.7 节）和其他定时数据包，不依赖 FilterEn。哪些数据包依赖 FilterEn 且因此受 IP 过滤影响的细节见第 36.4.1 节。

**TraceStop**

ADDRn 范围也可以被配置为在进入指定区域时导致追踪被禁用。这用于执行意外代码的情况，用户希望立即停止生成数据包以避免覆盖之前写入的数据包。

TraceStop 机制的工作方式与 IP 过滤大致相同，并使用相同的地址比较逻辑。TraceStop 区域基址和限制值被编程到一个或多个 ADDRn 范围，但 IA32_RTIT_CTL.ADDRn_CFG 被配置为 TraceStop 编码。与 FilterEn 一样，当采取分支或事件落在 TraceStop 区域时检测到 TraceStop。

此外，TraceStop 要求 TriggerEn=1 在分支/事件开始时，且 ContextEn=1 在分支/事件完成时。当发生这种情况时，CPU 将设置 IA32_RTIT_STATUS.Stopped，从而清除 TriggerEn 并因此禁用数据包生成。这可以生成带进入 TraceStop 区域的分支或事件的目标 IP 的 TIP.PGD 数据包。最后，将插入 TraceStop 数据包以指示条件被命中。

如果在缓冲区溢出（第 36.3.8 节）期间遇到 TraceStop 条件，它不会被丢弃，而是在溢出解决后被发信号。

注意 TraceStop 事件不保证所有内部缓冲的数据包被刷新出内部缓冲区。为确保这已发生，用户应清除 TraceEn。

要在 TraceStop 事件后恢复追踪，用户必须首先通过清除 IA32_RTIT_CTL.TraceEn 禁用 Intel PT，然后才能清除 IA32_RTIT_STATUS.Stopped 位。此时 Intel PT 可以被重新配置，且追踪恢复。

注意 IA32_RTIT_STATUS.Stopped 位也可以使用 ToPA STOP 位设置。见第 36.2.7.2 节。

**IP 过滤示例**

以下表给出 IP 过滤行为的示例。假设 IA32_RTIT_ADDRn_A = RangeBase 的 IP，且 IA32_RTIT_ADDRn_B = RangeLimit 的 IP，而 IA32_RTIT_CTL.ADDRn_CFG = 0x1（启用 ADDRn 范围作为 FilterEn 范围）。

**表 36-2. IP 过滤数据包示例**

| 代码流 | 数据包 |
| --- | --- |
| Bar: jmp RangeBase // 跳入过滤范围 | TIP.PGE(RangeBase) |
| RangeBase: jcc Foo // 未采取 | TNT(0) |
| add eax, 1 |     |
| Foo: jmp RangeLimit+1 // 跳出过滤范围 | TIP.PGD(RangeLimit+1) |
| RangeLimit: nop |     |
| jcc Bar |     |

**IP 过滤和 TraceStop**

用户可以配置重叠的 IP 过滤范围和 TraceStop 范围。在这种情况下，在任一范围非重叠部分中执行的代码将按该范围所期望的行为。在重叠范围中执行的代码将获得 TraceStop 行为。

### 36.2.6 数据包生成启用控制

Intel 处理器追踪包括确定是否生成数据包的各种控制。一般来说，仅当设置数据包启用（PacketEn）时才发送大多数数据包。PacketEn 是响应软件可配置启用控制在硬件中维护的内部状态，PacketEn 不直接对软件可见。PacketEn 与配置 MSR 中软件可见控制的关系在本节中描述。

#### 36.2.6.1 数据包启用（PacketEn）

当设置 PacketEn 时，处理器处于 Intel PT 监视的模式中。PacketEn 根据此关系由其他状态组成：

```python
PacketEn := TriggerEn AND ContextEn AND FilterEn AND BranchEn
```

这些组成控制在以下小节中详述。

PacketEn 最终确定处理器何时追踪。当设置 PacketEn 时，所有控制流数据包被启用。当 PacketEn 被清除时，不生成控制流数据包，尽管其他数据包（定时和簿记数据包）可能仍被发送。PacketEn 和数据包生成的细节见第 36.2.7 节。

注意，在不支持 IP 过滤的处理器上（即，CPUID.14H.00H:EBX\[2\] = 0），FilterEn 被视为总是被设置。

#### 36.2.6.2 触发启用（TriggerEn）

触发启用（TriggerEn）是追踪数据包生成活动的首要指示器。当设置 IA32_RTIT_CTL.TraceEn 时设置 TriggerEn，且由以下任何条件清除：

-   TraceEn 被软件清除。
-   遇到 TraceStop 条件且设置 IA32_RTIT_STATUS.Stopped。
-   由于操作错误设置 IA32_RTIT_STATUS.Error（见第 36.3.10 节）。

软件可以通过读取 IA32_RTIT_STATUS.TriggerEn 位发现当前 TriggerEn 值。当 TriggerEn 被清除时，追踪不活动且不生成数据包。

#### 36.2.6.3 上下文启用（ContextEn）

上下文启用（ContextEn）指示处理器是否处于软件配置硬件追踪的状态或模式。例如，如果 CPL = 0 代码的执行不被追踪（IA32_RTIT_CTL.OS = 0），那么当处理器处于 CPL0 时 ContextEn 将为 0。

软件可以通过读取 IA32_RTIT_STATUS.ContextEn 位发现当前 ContextEn 值。ContextEn 定义如下：

```python
ContextEn = !((IA32_RTIT_CTL.OS = 0 且 CPL = 0) 或
（IA32_RTIT_CTL.USER = 0 且 CPL > 0）或（在生产飞地中¹）或
（IA32_RTIT_CTL.CR3Filter = 1 且 IA32_RTIT_CR3_MATCH 不匹配 CR3））
```

如果 ContextEn 的清除导致 PacketEn 被清除，生成数据包生成禁用（TIP.PGD）数据包，但其 IP 载荷被抑制。如果 ContextEn 的设置导致 PacketEn 被设置，生成数据包生成启用（TIP.PGE）数据包。

当 ContextEn 为 0 时，不生成控制流数据包（TNT、FUP、TIP.*、MODE.*），且不暴露线性指令指针（LIP）。然而，当 ContextEn 为 0 时，一些数据包（如 MTC 和 PSB）（见第 36.4.2.16 节和第 36.4.2.17 节）可能仍被生成。哪些数据包仅在设置 ContextEn 时生成的细节见第 36.4.1 节。

当 TriggerEn = 0 时，处理器不更新 ContextEn。仅当 TriggerEn = 1 时，ContextEn 的值才会切换。

#### 36.2.6.4 分支启用（BranchEn）

此值纯粹基于 IA32_RTIT_CTL.BranchEn 值。如果未设置 BranchEn，则相关的 COFI 数据包（TNT、TIP\*、FUP、MODE.\*）被抑制。与定时相关的其他数据包（TSC、TMA、MTC、CYC）以及 PSB 将不受影响地正常生成。此外，PIP 和 VMCS 继续生成，作为正在运行什么软件的指示器。

#### 36.2.6.5 过滤启用（FilterEn）

过滤启用指示指令指针（IP）在 Intel PT 被配置监视的 IP 范围内。软件可以通过对 IA32_RTIT_STATUS.FilterEn 的 RDMSR 获取过滤启用的状态。IP 过滤的配置和使用细节见第 36.2.5.3 节。

在也清除 PacketEn 的 FilterEn 清除时，将生成数据包生成禁用（TIP.PGD），但与 ContextEn 情况不同，IP 载荷可能不被抑制。对于直接无条件分支以及间接分支（包括 RET），由离开追踪区域并清除 FilterEn 生成的 PGD 将包含目标 IP。这意味着只要在上下文中，配置范围之外的 IP 可以被暴露在追踪中。

当 FilterEn 为 0 时，不生成控制流数据包（例如，TNT、TIP）。然而，当 FilterEn 被清除时，一些数据包（如 PIP、MTC 和 PSB）可能仍被生成。数据包启用依赖的细节见第 36.4.1 节。

设置 TraceEn 后，如果软件未配置 IP 过滤范围（对所有 n，IA32_RTIT_CTL.ADDRn_CFG!= 1），或如果处理器不支持 IP 过滤（即，CPUID.14H.00H:EBX\[2\] = 0），FilterEn 在所有时间被设置为 1。仅当 TraceEn=1 且 ContextEn=1，且至少一个范围被配置为 IP 过滤时，FilterEn 才会切换。

### 36.2.7 追踪输出

Intel PT 输出应独立于追踪内容和过滤机制查看。可用于追踪输出的选项可以跨处理器代和平台变化。

追踪输出使用由 IA32_RTIT_CTL 的 ToPA 和 FabricEn 位字段（见第 36.2.8.2 节）配置的以下输出方案之一写出：

-   物理地址空间的单个连续区域。
-   物理内存的可变大小区域的集合。这些区域由指向那些区域的指针表（称为物理地址表（ToPA））链接在一起。追踪输出存储绕过缓存和 TLB，但不可序列化。这旨在最小化输出的性能影响。
-   平台特定追踪传输子系统。

无论选择何种输出方案，Intel PT 存储默认绕过处理器缓存。这确保它们不消耗宝贵的缓存空间，但它们不具有与不可缓存（UC）存储关联的序列化方面。软件应避免使用 MTRR 将 Intel PT 输出区域的任何部分标记为 UC，因为这可能覆盖上面描述的行为并强制 Intel PT 存储为 UC，从而招致严重的性能影响。

不保证数据包在产生数据包的指令执行后的某个固定周期数后被写入内存或其他追踪端点。确保所有生成的数据包已达到其端点的唯一方式是清除 TraceEn 并随后进行存储、围栏或序列化指令；这样做确保所有缓冲的数据包被刷新出处理器。

#### 36.2.7.1 单范围输出

当 IA32_RTIT_CTL.ToPA 和 IA32_RTIT_CTL.FabricEn 位被清除时，追踪数据包输出被发送到由 IA32_RTIT_OUTPUT_BASE（第 36.2.8.7 节）中的基址和 IA32_RTIT_OUTPUT_MASK_PTRS（第 36.2.8.8 节）中的掩码值定义的单个连续内存（或如果 DRAM 不可用则 MMIO）范围。此范围中的当前写指针也存储在 IA32_RTIT_OUTPUT_MASK_PTRS 中。此输出范围是循环的，意味着当写环绕缓冲区末尾时它们再次从基址开始。

此输出方法最适合于 Intel PT 输出被以下情况：

-   配置为导向足够大的 DRAM 连续区域。
-   配置为到 MMIO 调试端口，以将 Intel PT 输出路由到平台特定追踪端点（例如，JTAG）。在此场景中，特定范围的地址以循环方式被写入，且 SoC 将拦截这些写并将它们导向适当设备。对相同地址的重复写不相互覆盖，而是由调试器累积，因此不会因缓冲区的循环性质丢失数据。

处理器将按如下确定写入下一个追踪数据包输出字节的地址：

```python
OutputBase[63:0] := IA32_RTIT_OUTPUT_BASE[63:0]
OutputMask[63:0] := ZeroExtend64(IA32_RTIT_OUTPUT_MASK_PTRS[31:0])
OutputOffset[63:0] := ZeroExtend64(IA32_RTIT_OUTPUT_MASK_PTRS[63:32])
trace_store_phys_addr := (OutputBase & ~OutputMask) + (OutputOffset & OutputMask)
```

**单范围输出错误**

如果输出基址和掩码未被软件适当配置，将发信号操作错误（见第 36.3.10 节）且追踪被禁用。单范围输出的错误场景是：

-   掩码值不连续。IA32_RTIT_OUTPUT_MASK_PTRS.MaskOrTablePointer 值在比包含 1 的最高有效位位置更低的有效位位置有 0。
-   基址和掩码错位，且有重叠位被设置。IA32_RTIT_OUTPUT_BASE 与 IA32_RTIT_OUTPUT_MASK_PTRS\[31:0\] 的按位与 > 0。
-   非法输出偏移。IA32_RTIT_OUTPUT_MASK_PTRS.OutputOffset 大于掩码值 IA32_RTIT_OUTPUT_MASK_PTRS\[31:0\]。

另注意，由于追踪数据包输出与受限内存重叠，可以发信号错误，见第 36.2.7.4 节。

#### 36.2.7.2 物理地址表（ToPA）

当设置 IA32_RTIT_CTL.ToPA 且清除 IA32_RTIT_CTL.FabricEn 时，使用 ToPA 输出机制。ToPA 机制使用表的链接列表；示例见图 36-1。表中的每个条目包含一些属性位、指向输出区域的指针和区域的大小。表中的最后一个条目可以持有指向下一个表的指针。此指针可以指向当前表的顶部（对于循环数组）或另一个表的基址。表大小不固定，因为到下一个表的链接可以存在于任何条目。

处理器将 ToPA 表引用的各种输出区域视为统一缓冲区。这意味着单个数据包可以跨越一个输出区域与下一个之间的边界。

ToPA 机制由处理器维护的三个值控制：

-   **proc_trace_table_base**。  
    这是当前 ToPA 表基址的物理地址。当启用追踪时，处理器从 IA32_RTIT_OUTPUT_BASE MSR 加载此值。当启用追踪时，处理器用对 proc_trace_table_base 的更改更新 IA32_RTIT_OUTPUT_BASE MSR，但这些更新可能与软件执行不同步。当禁用追踪时，处理器确保 MSR 包含 proc_trace_table_base 的最新值。
-   **proc_trace_table_offset**。  
    这指示当前表的当前正在使用的条目。（此条目包含当前输出区域的地址。）当启用追踪时，处理器将 IA32_RTIT_OUTPUT_MASK_PTRS 的第 31:7 位（MaskOrTableOffset）的值加载到 proc_trace_table_offset 的第 27:3 位。当启用追踪时，处理器用对 proc_trace_table_offset 的更改更新 IA32_RTIT_OUTPUT_MASK_PTRS.MaskOrTableOffset，但这些更新可能与软件执行不同步。当禁用追踪时，处理器确保 MSR 包含 proc_trace_table_offset 的最新值。
-   **proc_trace_output_offset**。  
    这是当前输出区域中的指针并指示下一个写的位置。当启用追踪时，处理器从 IA32_RTIT_OUTPUT_MASK_PTRS 的第 63:32 位（OutputOffset）加载此值。当启用追踪时，处理器用对 proc_trace_output_offset 的更改更新 IA32_RTIT_OUTPUT_MASK_PTRS.OutputOffset，但这些更新可能与软件执行不同步。当禁用追踪时，处理器确保 MSR 包含 proc_trace_output_offset 的最新值。

图 36-1 提供表和关联指针的图示（不按比例）。

```python
0FF_FFFF_FFFFH   物理内存
                 proc_trace_output_offset: IA32_RTIT_OUTPUT_MASK_PTRS.OutputOffset
   OutputRegionX  END=1  TableBaseB  4K  OutputBaseY
                 proc_trace_table_offset: IA32_RTIT_OUTPUT_MASK_PTRS.MaskOrTableOffset<<3
   64K  OutputBaseX  ToPA 表 A
   proc_trace_table_base: IA32_RTIT_OUTPUT_BASE
   OutputRegionY  STOP=1  ToPA 表 B
0
```

**图 36-1. ToPA 内存图示**

使用 ToPA 机制，处理器将数据包写入当前输出区域（由 proc_trace_table_base 和 proc_trace_table_offset 标识）。该区域内下一个字节将被写入的偏移由 proc_trace_output_offset 标识。当该区域被数据包输出填满时（因此 proc_trace_output_offset = RegionSize–1），proc_trace_table_offset 被移动到下一个 ToPA 条目，proc_trace_output_offset 被设置为 0，且数据包写开始填充由 proc_trace_table_offset 指定的新输出区域。

随着数据包被写出，每个存储按如下推导其物理地址：

```python
trace_store_phys_addr := 当前 ToPA 表条目的基址 + proc_trace_output_offset
```

最终，表中所有条目表示的区域可能变满，且达到表的最后一个条目。条目可以被标识为最后条目，因为它具有 END 或 STOP 属性。END 属性指示条目中的地址不指向另一个输出区域，而是指向另一个 ToPA 表。STOP 属性指示一旦相应区域被填满，追踪将被禁用。STOP 的细节见表 36-3 和后续部分。

当达到 END 条目时，处理器用此 END 条目中持有的基址加载 proc_trace_table_base，从而将当前表指针移动到此新表。proc_trace_table_offset 被重置为 0，proc_trace_output_offset 也是如此，且数据包写将在第一个条目中指示的基址恢复。

如果表没有 STOP 或 END 条目，且追踪数据包生成保持启用，最终将达到最大表大小（proc_trace_table_offset = 0FFFFFF8H）。在这种情况下，一旦最后一个输出区域被填满，proc_trace_table_offset 和 proc_trace_output_offset 被重置为 0（环绕回当前表的开始）。

重要的是要注意，处理器对 IA32_RTIT_OUTPUT_BASE 和 IA32_RTIT_OUTPUT_MASK_PTRS MSR 的更新与指令执行异步。因此，在启用 Intel PT 时对这些 MSR 的读可能返回陈旧值。与所有 IA32_RTIT\_\* MSR 一样，除非首先通过清除 IA32_RTIT_CTL.TraceEn 禁用追踪数据包生成，否则不应信任或保存这些 MSR 的值。这确保输出 MSR 值计入到那时生成的所有数据包，之后处理器将停止更新输出 MSR 值直到追踪恢复。¹

处理器可以在内部缓存来自当前表或其（直接或间接）引用的表的任意数量的条目。如果启用追踪，处理器可能忽略或延迟检测对这些表的修改。为确保处理器以可预测方式检测表更改，软件应在修改当前表（或其引用的表）之前清除 TraceEn，且仅然后重新启用数据包生成。

**单输出区域 ToPA 实现**

实现 Intel PT 的第一代处理器仅支持带单个 ToPA 条目后跟指向回第一个条目的 END 条目的 ToPA 配置（创建一个循环输出缓冲区）。此类处理器枚举 CPUID.14H.00H:ECX.MENTRY\[1\] = 0 且 CPUID.14H.00H:ECX.TOPAOUT\[0\] = 1。

如果 CPUID.14H.00H:ECX.MENTRY\[1\] = 0，ToPA 表只能持有单个输出条目，其后必须跟指向回表基址的 END=1 条目。因此只能使用一个连续块作为输出。

该唯一输出条目可以设置 INT 或 STOP，但如上面所述仍必须后跟 END 条目。注意，如果 INT=1，PMI 实际上将在区域被填满之前被交付。

**ToPA 表条目格式**

ToPA 表条目的格式显示在图 36-2 中。地址字段的大小由处理器的物理地址宽度 MAXPHYADDR 确定。²

```python
63  MAXPHYADDR–1                     12  11  10  9     6  5  4  3  2  1  0
┌────────────────────────────────────┬───┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐
│ 输出区域基址物理地址                    │保留│4:STOP│2:INT │0:END│
│                                    │   │  │  │9:6 大小  │   │  │  │  │  │
└────────────────────────────────────┴───┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘
```

**图 36-2. ToPA 表条目布局**

表 36-3 描述 ToPA 表条目字段的细节。如果保留位被设置为 1，发信号错误。

**表 36-3. ToPA 表条目字段**

| ToPA 条目字段 | 描述  |
| --- | --- |
| 输出区域基址物理地址 | 如果 END=0，这是此条目指定的输出区域的基址物理地址。注意所有区域必须基于其大小对齐。因此 2M 区域必须具有清除的第 20:12 位。如果区域未适当对齐，达到条目时将发信号操作错误。如果 END=1，这是下一个 ToPA 表的 4K 对齐基址物理地址（可以是当前表的基址，或如果希望循环缓冲区，链接列表中第一个表的基址）。如果处理器仅支持单个 ToPA 输出区域（见上文），此地址必须是 IA32_RTIT_OUTPUT_BASE MSR 中当前的值。 |
| 大小  | 指示关联输出区域的大小。编码为：0: 4K，1: 8K，2: 16K，3: 32K，4: 64K，5: 128K，6: 256K，7: 512K，8: 1M，9: 2M，10: 4M，11: 8M，12: 16M，13: 32M，14: 64M，15: 128M。如果 END=1，此字段被忽略。 |
| STOP | 当此条目指示的输出区域被填满时，软件应禁用数据包生成。这将通过设置清除 TriggerEn 的 IA32_RTIT_STATUS.Stopped 来完成。如果 END=1，此位必须为 0；否则被视为保留位违规（见 ToPA 错误）。 |
| INT | 当此条目指示的输出区域被填满时，发信号 PerfMon LVT 中断。注意如果在同一条目中设置 INT 和 STOP 两者，STOP 将发生在 INT 之前。因此中断处理程序应预期 IA32_RTIT_STATUS.Stopped 位将被设置，且在恢复追踪前需要被重置。如果 END=1，此位必须为 0；否则被视为保留位违规（见 ToPA 错误）。 |
| END | 如果被设置，指示这是 END 条目，因此地址字段指向表基址而不是输出区域基址。如果 END=1，INT 和 STOP 必须被设置为 0；否则被视为保留位违规（见 ToPA 错误）。在此情况下 Size 字段被忽略。如果处理器仅支持单个 ToPA 输出区域（见上文），END 必须在第二个表条目中设置。 |

**ToPA STOP**

每个 ToPA 条目有 STOP 位。如果此位被设置，当相应追踪输出区域被填满时，处理器将设置 IA32_RTIT_STATUS.Stopped 位。这将清除 TriggerEn 并从而停止数据包生成。IA32_RTIT_STATUS.Stopped 的细节见第 36.2.8.4 节。此序列称为"ToPA Stop"。

当发生 ToPA 停止时，在输出中不会看到 TIP.PGD 数据包，因为禁用仅发生在区域已满时。当发生这种情况时，输出在区域的最后一个字节被填满后停止，这可能意味着数据包在中间被切断。内部缓冲区中剩余的任何数据包丢失且无法恢复。

当发生 ToPA 停止时，IA32_RTIT_OUTPUT_BASE MSR 将持有其条目具有 STOP=1 的表的基址。IA32_RTIT_OUTPUT_MASK_PTRS.MaskOrTableOffset 将持有该条目的索引值，且 IA32_RTIT_OUTPUT_MASK_PTRS.OutputOffset 应被设置为区域大小减一。

注意这意味着偏移指针指向区域末尾之后的下一个字节，如果配置在 IA32_RTIT_STATUS.Stopped 被清除且追踪被重新启用时保持，该配置将产生操作错误。

**ToPA PMI**

每个 ToPA 条目有 INT 位。如果此位被设置，当相应追踪输出区域被填满时，处理器将发信号性能监视中断（PMI）。此中断不精确，因此在取得中断时很可能已发生对下一区域的写。

应采取以下步骤配置此中断：

1.  通过 LVT Performance Monitor 寄存器（在 xAPIC 模式中 MMIO 偏移 340H；在 x2APIC 模式中通过 MSR 834H）启用 PMI。此寄存器的更多细节见《Intel® 64 和 IA-32 架构软件开发手册》第 3B 卷。对于 ToPA PMI，将所有字段设置为 0，除中断向量外，它可以由软件选择。
2.  设置中断处理程序以服务 ToPA PMI 可以引发的中断向量。
3.  通过执行 STI 设置中断标志。
4.  在感兴趣的 ToPA 条目中设置 INT 位并使用 ToPA 输出选项启用数据包生成。因此，IA32_RTIT_CTL MSR 中 TraceEn=ToPA=1。

一旦 INT 区域已被数据包输出数据填满，将发信号中断。此 PMI 可以通过检查 IA32_PERF_GLOBAL_STATUS MSR（MSR 38EH）的位 55（Trace_ToPA_PMI）与其他区分。一旦 ToPA PMI 处理程序已服务相关缓冲区，向地址 390H（IA32_GLOBAL_STATUS_RESET）的 MSR 位 55 写入 1 清除 IA32_PERF_GLOBAL_STATUS.Trace_ToPA_PMI。

Intel PT 在 PMI 上不被冻结，因此中断处理程序将被追踪（尽管过滤可以防止这）。IA32_DEBUGCTL 中的 Freeze_PerfMon_on_PMI 和 Freeze_LBRs_on_PMI 设置将像在其他 PMI 上一样应用于 ToPA PMI，因此 PerfMon 计数器被冻结。

假设 PMI 处理程序希望读取任何缓冲的数据包以持久输出，或希望修改任何 Intel PT MSR，软件应首先通过清除 TraceEn 禁用数据包生成。这确保所有缓冲的数据包被写入内存并避免追踪 PMI 处理程序。然后可以使用配置 MSR 确定追踪已停止的位置。如果处理程序禁用数据包生成，如果希望继续追踪，它应在 IRET、ERETS 或 ERETU 之前手动重新启用。

在罕见情况下，可能在第一个 PMI 被处理之前触发第二个 ToPA PMI。如果另一个带 INT=1 的 ToPA 区域在第一个 PMI 被取得之前或之后不久被填满（可能由于 EFLAGS.IF 被清除一段长时间），这可能发生。这可以以两种方式显现：要么第二个 PMI 在第一个被取得之前被触发，因此只取得一个 PMI；要么第二个在第一个被取得之后被触发，因此将在第一个的处理程序完成时被取得。软件可以通过在 PMI 处理程序开头清除 TraceEn 最小化第二种情况的可能性。此外，它可以通过然后检查中断请求寄存器（IRR）是否有 PMI 挂起，并检查 ToPA 表基址和偏移指针（在 IA32_RTIT_OUTPUT_BASE 和 IA32_RTIT_OUTPUT_MASK_PTRS 中）看是否有多个带 INT=1 的条目已被填满来检测此类情况。

**PMI 保留**

在某些情况下，ToPA PMI 可以在保存 Intel PT 状态的 XSAVES 指令完成后被取得，且在此类情况下，当保存的 Intel PT 上下文稍后用 XRSTORS 恢复时，PMI 处理程序内对 Intel PT MSR 的任何修改将不持久。为应对此类场景，已添加 PMI 保留特性。对此特性的支持由 CPUID.14H.00H:EBX\[6\] 指示。

当 IA32_RTIT_CTL.InjectPsbPmiOnEnable\[56\] = 1 时，PMI 保留被启用。当带 INT=1 的 ToPA 区域被填满时，PMI 被挂起且新的 IA32_RTIT_STATUS.PendToPAPMI\[7\] 被设置为 1。如果在启用 Intel PT 时此位被设置，使得 IA32_RTIT_CTL.TraceEn\[0\] 从 0 转换到 1，ToPA PMI 被挂起。此行为确保在 XSAVES 期间被挂起且因此无法被适当处理的任何 ToPA PMI 将在保存的 PT 状态被恢复时被重新挂起。

当此特性被启用时，PMI 处理程序应采取以下操作：

1.  忽略在 TraceEn = 0 时取得的 ToPA PMI。这指示 PMI 在 Intel PT 禁用期间被挂起，且 PendToPAPMI 标志将确保一旦 Intel PT 在相同上下文中被重新启用，PMI 被重新挂起。因此，PendToPAPMI 位应保持设置为 1。
2.  如果 TraceEn=1 且 PMI 可以被适当处理，清除新的 PendToPAPMI 位。这将确保不取得额外、虚假的 ToPA PMI。要求 PendToPAPMI 在 APIC 中清除 PMI LVT 掩码之前，以及在清除 IA32_PERF_GLOBAL_STATUS 中的 LBRS_FROZEN 或 COUNTERS_FROZEN 任一之前被清除。

**ToPA PMI 和单输出区域 ToPA 实现**

仅支持单输出区域 ToPA 实现（使得仅支持一个输出区域；见上文）的处理器将在输出环绕并覆盖缓冲区顶部之前尝试发信号 ToPA PMI 中断。为支持此功能，PMI 处理程序应尽快禁用数据包生成。

由于 PMI 滑移，在罕见情况下，环绕可能在 PMI 被交付之前已发生。软件可以通过在 ToPA 条目中设置 STOP 位（见表 36-3）避免此情况；这将一旦区域被填满就禁用追踪，且不发生环绕。此方法有禁用数据包生成的缺点，使得导致 PMI 的一些指令将不被追踪。如果 PMI 滑移足够大以导致区域填满且追踪被禁用，PMI 处理程序将需要在追踪可以恢复之前清除 IA32_RTIT_STATUS.Stopped 指示。

**ToPA PMI 和 XSAVES/XRSTORS 状态处理**

在某些情况下，ToPA PMI 可以在切换 Intel PT 状态的 XSAVES 指令完成后被取得，且在此类情况下，当保存的 Intel PT 上下文稍后用 XRSTORS 恢复时，PMI 处理程序内对 Intel PT MSR 的任何修改将不持久。为应对此类场景，建议通过修改 ToPA 表本身而不是 Intel PT 输出 MSR 来修改 Intel PT 输出配置。在支持 PMI 保留（CPUID.14H.00H:EBX\[6\] = 1）的处理器上，设置 IA32_RTIT_CTL.InjectPsbPmiOnEnable\[56\] = 1 将确保在 PT 被禁用时挂起的 PMI 将通过设置 IA32_RTIT_STATUS.PendTopaPMI\[7\] = 1 被记录。然后当保存的 PT 上下文稍后被恢复时 PMI 将被挂起。

表 36-4 描述推荐的 PMI 处理程序算法，用于管理多区域 ToPA 输出并处理可能在 XSAVES 和 XRSTORS 之间到达的 ToPA PMI（如果不使用 PMI 保留）。此算法灵活，允许软件选择向当前 ToPA 表添加条目、添加新 ToPA 表或使用当前 ToPA 表作为循环缓冲区。它假设触发 PMI 的 ToPA 条目不是表中的最后一个条目，这是推荐的处理方式。

**表 36-4. 管理 Intel PT ToPA PMI 和 XSAVES/XRSTORS 的算法**

| 伪代码流 |
| --- |
| IF（IA32_PERF_GLOBAL_STATUS.ToPA）  <br>　　保存 IA32_RTIT_CTL 值；  <br>　　IF（IA32_RTIT_CTL.TraceEn）  <br>　　　　通过清除 TraceEn 禁用 Intel PT；  <br>　　FI；  <br>　　IF（有空间扩展当前 ToPA 表）  <br>　　　　在 ToPA 表中最后一个条目之后添加一个或多个 ToPA 条目；  <br>　　　　将新 ToPA 条目地址字段指向新输出区域基址；  <br>　　ELSE  <br>　　　　修改当前表中的后续 ToPA 条目使其具有 END=1；  <br>　　　　IF（输出应转换到新 ToPA 表）  <br>　　　　　　将当前表的"END=1"条目的地址指向新表基址；  <br>　　　　ELSE  <br>　　　　　　/\* 继续使用当前 ToPA 表，使其循环。 */  <br>　　　　　　将"END=1"条目的地址指向当前表的基址；  <br>　　　　　　修改已填满输出区域的 ToPA 条目地址字段以指向新的未使用输出区域；  <br>　　　　　　/* 已填满区域是索引在 0 到（IA32_RTIT_MASK_PTRS.MaskOrTableOffset -1）范围内的那些。\*/  <br>　　　　FI；  <br>　　FI；  <br>　　恢复保存的 IA32_RTIT_CTL 值；  <br>FI； |

**ToPA 错误**

当找到格式错误的 ToPA 条目时，产生操作错误（见第 36.3.10 节）。格式错误的条目可以是以下任何：

1.  ToPA 条目保留位违规。这描述上面第 36.2.7.2 节标记为保留的位被设置为 1 的情况。
2.  ToPA 对齐违规。这包括非法 ToPA 条目基址位被设置为 1 的情况：  
    a. ToPA 表基址未 4KB 对齐。表基址可以来自对 IA32_RTIT_OUTPUT_BASE 的 WRMSR，或来自带 END=1 的 ToPA 条目。  
    b. ToPA 条目基址未与 ToPA 条目大小对齐（例如，带基址\[20:12\]不等于 0 的 2MB 区域），对于带 END=0 的 ToPA 条目。  
    c. ToPA 条目基址设置 63:MAXPHYADDR 范围内的物理地址位。¹
3.  非法 ToPA 输出偏移。IA32_RTIT_OUTPUT_MASK_PTRS.OutputOffset 大于或等于当前 ToPA 输出区域大小。
4.  ToPA 规则违规。这些类似于 ToPA 条目保留位违规；它们是遇到带非法字段组合的 ToPA 条目时的情况。它们包括以下：  
    a. 在带 END=1 的条目上设置 STOP 或 INT 位。  
    b. 在 ToPA 表的条目 0 中设置 END 位。  
    c. 在仅支持单个 ToPA 条目的处理器上（见上文），两个额外非法设置适用：  
    i) ToPA 表条目 1 带 END=0。  
    ii) ToPA 表条目 1 带与表基址不匹配的基址。

在所有情况下，错误将通过设置 IA32_RTIT_STATUS.Error 记录，从而在到达有问题的 ToPA 条目时（当 proc_trace_table_offset 指向包含错误的条目时）禁用追踪。检测到错误时内部缓冲的任何数据包字节可能丢失。

注意由于尝试访问受限内存也可能发信号操作错误。细节见第 36.2.7.4 节。

追踪软件使用 ToPA 管理 Intel PT 与应用缓冲区的交互有一定灵活性，见第 36.4.2.26 节。

#### 36.2.7.3 追踪传输子系统

当设置 IA32_RTIT_CTL.FabricEn 时，IA32_RTIT_CTL.ToPA 位被忽略，且追踪输出被写入追踪传输子系统。此传输的端点是平台特定的，配置选项的细节应参考特定平台文档。如果 CPUID.14H.00H:EBX\[3\] = 1，FabricEn 位可用于设置。

#### 36.2.7.4 受限内存访问

数据包输出不能导向平台限制的任何内存区域。特别是，代表数据包输出的所有内存访问都对照 SMRR、PRMRR 和 SEAMRR 保护区域检查。如果与这些区域有任何重叠，追踪数据收集将不能正常功能。确切处理器行为是实现相关的；表 36-5 总结几个场景。

**表 36-5. 受限内存访问的行为**

| 场景  | 描述  |
| --- | --- |
| ToPA 输出区域与 SMRR、PRMRR 和 SEAMRR 保护区域重叠 | 对受限内存区域的存储将被丢弃，且该数据包数据将丢失。任何从该受限区域读取的尝试将返回全 1。当输出指针到达受限区域时，处理器也可能发信号错误（第 36.3.10 节）并禁用追踪。如果数据包生成保持启用，那么一旦存储不再导向受限内存（在环绕时，或如果输出区域大于受限内存区域），数据包输出可能继续。 |
| ToPA 表与 SMRR、PRMRR 和 SEAMRR 保护区域重叠 | 当 ToPA 写指针（IA32_RTIT_OUTPUT_BASE + proc_trace_table_offset）进入受限区域时，处理器将发信号错误（第 36.3.10 节）并禁用追踪。 |

还应注意到数据包输出不应路由到由 IA32_APIC_BASE MSR 定义的 4KB APIC MMIO 区域。APIC 的细节参见《Intel® 64 和 IA-32 架构软件开发手册》第 3A 卷。对此情况不发信号错误。

**对受限内存区域的修改**

建议软件在修改 SMRR 以更改 SMRR 区域范围之前禁用数据包生成。这是因为处理器保留在对照受限内存范围检查它们之后内部缓存任意数量 ToPA 表条目的权利。一旦缓存，条目将不再被检查，意味着人们可能潜在地将数据包输出路由到新受限区域。软件可以通过清除 IA32_RTIT_CTL.TraceEn 确保任何缓存条目被写入内存。

### 36.2.8 启用和配置 MSR

#### 36.2.8.1 一般考虑

追踪数据包生成由一组型号特定寄存器（MSR）启用和配置，下面详述。配置 MSR 行为的一些注意：

-   如果处理器不支持 Intel 处理器追踪（见第 36.3.1 节），对 IA32_RTIT\_\* MSR 的 RDMSR 或 WRMSR 将导致 #GP。
-   在数据包生成被启用（IA32_RTIT_CTL.TraceEn=1）时对任何 IA32_RTIT\_\* 配置 MSR 的 WRMSR 将生成 #GP 异常。在配置 MSR 可以被更改之前，必须禁用数据包生成。  
    注：软件可以在没有 #GP 的情况下将相同的值写回 IA32_RTIT_CTL，即使 TraceEn=1。
-   Intel PT 的所有配置 MSR 按逻辑处理器复制。
-   对于每个配置 MSR，任何试图更改标记为保留的位或利用标记为保留的编码的 MSR 写将导致 #GP 故障。
-   Intel PT 的所有配置 MSR 在热或冷 RESET 时被清除。
    -   如果 CPUID.14H.00H:EBX\[2\] = 1，在热 RESET 时仅清除 TraceEn 位；尽管这可能具有清除 IA32_RTIT_STATUS 中其他位的影响。追踪配置 MSR 的其他 MSR 值在热 RESET 时被保留。
-   本章中对追踪配置 MSR 的 MSR 写语义通常适用于对这些寄存器的显式 WRMSR、使用到这些 MSR 的 VMexit 或 VM 进入 MSR 加载列表、带包括 state_8 的 XSAVE 映射组件（对应于 IA32_XSS\[bit 8\]）的请求特性位图的 XRSTORS，以及 XSAVES 对 IA32_RTIT_CTL.TraceEn 的写（第 36.3.5.2 节）。

#### 36.2.8.2 IA32_RTIT_CTL MSR

地址 570H 的 IA32_RTIT_CTL 是追踪数据包生成的主要启用和控制 MSR。位位置列在表 36-6 中。

**表 36-6. IA32_RTIT_CTL MSR**

| 位置  | 位名称 | 复位时 | 位描述 |
| --- | --- | --- | --- |
| 0   | TraceEn | 0   | 如果为 1，启用追踪；否则追踪被禁用。当此位从 1 转换到 0 时，所有缓冲的数据包被刷新出内部缓冲区。可能需要额外的存储、围栏或架构序列化指令以确保数据包数据可以在追踪端点被观察到。启用和禁用数据包生成的细节见第 36.2.8.3 节。注意处理器将在 #SMI（第 36.2.9.3 节）和热复位时清除此位。IA32_RTIT_CTL 的其他 MSR 位（和其他追踪配置 MSR）不受这些事件影响。 |
| 1   |     |     |     |
| 1   | CYCEn | 0   | 0：禁用 CYC 数据包（见第 36.4.2.14 节）。1：启用 CYC 数据包。如果 CPUID.14H.00H:EBX\[1\] = 0，此位被保留。 |
| 2   | OS  | 0   | 0：当 CPL = 0 时数据包生成被禁用。1：当 CPL = 0 时数据包生成可以被启用。 |
| 3   | User | 0   | 0：当 CPL > 0 时数据包生成被禁用。1：当 CPL > 0 时数据包生成可以被启用。 |
| 4   | PwrEvtEn | 0   | 0：电源事件追踪数据包被禁用。1：电源事件追踪数据包被启用（见第 36.2.3 节"Power Event Tracing"）。 |
| 5   | FUPonPTW | 0   | 0：PTW 数据包后不跟 FUP。1：PTW 数据包后跟 FUP。当 CPUID.14H.00H:EBX\[4\]（"PTWRITE Supported"）为 0 时，此位被保留。 |
| 6   | FabricEn | 0   | 0：追踪输出导向内存子系统，机制取决于 IA32_RTIT_CTL.ToPA。1：追踪输出导向追踪传输子系统，IA32_RTIT_CTL.ToPA 被忽略。如果 CPUID.14H.00H:ECX\[3\] = 0，此位被保留。 |
| 7   | CR3Filter | 0   | 0：禁用 CR3 过滤。1：启用 CR3 过滤。如果 CPUID.14H.00H:EBX\[0\]（"CR3 Filtering Support"）为 0，此位被保留。 |
| 8   | ToPA | 0   | 0：如果 CPUID.14H.00H:ECX.SNGL_RNG_OUT\[2\] = 1 且 IA32_RTIT_CTL.FabricEn=0，启用单范围输出方案。1：如果 CPUID.14H.00H:ECX.TOPAOUT\[0\] = 1 且 IA32_RTIT_CTL.FabricEn=0，启用 ToPA 输出方案（见第 36.2.7.2 节）。注：如果 CPUID.14H.00H:ECX.SNGL_RNG_OUT\[2\] = 0，设置 TraceEn 但清除此位和 FabricEn 的对 IA32_RTIT_CTL 的 WRMSR 将导致 #GP。如果 CPUID.14H.00H:ECX.TOPAOUT\[0\] = 0，设置此位的对 IA32_RTIT_CTL 的 WRMSR 导致 #GP。 |
| 9   | MTCEn | 0   | 0：禁用 MTC 数据包（见第 36.4.2.16 节）。1：启用 MTC 数据包。如果 CPUID.14H.00H:EBX\[3\] = 0，此位被保留。 |
| 10  | TSCEn | 0   | 0：禁用 TSC 数据包。1：启用 TSC 数据包（见第 36.4.2.11 节）。 |
| 11  | DisRETC | 0   | 0：启用 RET 压缩。1：禁用 RET 压缩（见第 36.2.1.2 节）。 |
| 12  | PTWEn | 0   | 0：PTWRITE 数据包生成禁用。1：PTWRITE 数据包生成启用（见表 36-40"PTW Packet Definition"）。当 CPUID.14H.00H:EBX\[4\]（"PTWRITE Supported"）为 0 时，此位被保留。 |
| 13  | BranchEn | 0   | 0：禁用基于 COFI 的数据包。1：启用基于 COFI 的数据包：FUP、TIP、TIP.PGE、TIP.PGD、TNT、MODE.Exec、MODE.TSX。BranchEn 的细节见第 36.2.6.4 节。 |
| 17:14 | MTCFreq | 0   | 定义基于核心晶体时钟或 Always Running Timer（ART）的 MTC 数据包频率。每次所选 ART 位切换时将发送 MTC。定义以下编码：0: ART(0), 1: ART(1), 2: ART(2), 3: ART(3), 4: ART(4), 5: ART(5), 6: ART(6), 7: ART(7), 8: ART(8), 9: ART(9), 10: ART(10), 11: ART(11), 12: ART(12), 13: ART(13), 14: ART(14), 15: ART(15)。软件必须使用 CPUID 查询处理器中支持的编码，见第 36.3.1 节。使用不支持的编码将导致 #GP 故障。如果 CPUID.14H.00H:EBX\[3\] = 0，此字段被保留。 |
| 18  | 保留  | 0   | 必须为 0。 |
| 22:19 | CycThresh | 0   | CYC 数据包阈值，细节见第 36.3.6 节。自最后一个 CYC 数据包以来经过 N 个周期后，CYC 数据包将随第一个合格数据包发送。如果 CycThresh 为 0 则 N=0，否则 N 定义为 2^(CycThresh-1)。定义以下编码：0: 0, 1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32, 7: 64, 8: 128, 9: 256, 10: 512, 11: 1024, 12: 2048, 13: 4096, 14: 8192, 15: 16384。软件必须使用 CPUID 查询处理器中支持的编码，见第 36.3.1 节。使用不支持的编码将导致 #GP 故障。如果 CPUID.14H.00H:EBX\[1\] = 0，此字段被保留。 |
| 23  | 保留  | 0   | 必须为 0。 |
| 27:24 | PSBFreq | 0   | 指示 PSB 数据包的频率。PSB 数据包频率基于输出的 Intel PT 数据包字节数，因此此字段允许用户确定应导致生成 PSB 的 IA32_RTIT_STATUS.PacketByteCnt 的增量。注意 PSB 插入不精确，但每个 PSB 的平均输出字节应近似 SW 选择的周期。定义以下编码：0: 2K, 1: 4K, 2: 8K, 3: 16K, 4: 32K, 5: 64K, 6: 128K, 7: 256K, 8: 512K, 9: 1M, 10: 2M, 11: 4M, 12: 8M, 13: 16M, 14: 32M, 15: 64M。软件必须使用 CPUID 查询处理器中支持的编码，见第 36.3.1 节。使用不支持的编码将导致 #GP 故障。如果 CPUID.14H.00H:EBX\[1\] = 0，此字段被保留。 |
| 30:28 | 保留  | 0   | 必须为 0。 |
| 31  | EventEn | 0   | 0：事件追踪数据包被禁用。1：事件追踪数据包被启用。当 CPUID.14H.00H:EBX\[7\]（"Event Trace Supported"）为 0 时，此位被保留。 |
| 35:32 | ADDR0_CFG | 0   | 基于以下编码配置基址/限制寄存器对 IA32_RTIT_ADDR0_A/B：0：ADDR0 范围未使用。1：\[IA32_RTIT_ADDR0_A..IA32_RTIT_ADDR0_B\] 范围定义 FilterEn 范围。仅当 IP 在此范围内时 FilterEn 将被设置，尽管可以额外使用其他 FilterEn 范围。IP 过滤的细节见第 36.2.5.3 节。2：\[IA32_RTIT_ADDR0_A..IA32_RTIT_ADDR0_B\] 范围定义 TraceStop 范围。如果代码分支到此范围，将断言 TraceStop。TraceStop 的细节见第 36.4.2.10 节。3..15：保留（#GP）。如果 CPUID.14H.01H:EAX.RANGECNT\[2:0\] < 1，此字段被保留。 |
| 39:36 | ADDR1_CFG | 0   | 基于以下编码配置基址/限制寄存器对 IA32_RTIT_ADDR1_A/B：0：ADDR1 范围未使用。1：\[IA32_RTIT_ADDR1_A..IA32_RTIT_ADDR1_B\] 范围定义 FilterEn 范围。仅当 IP 在此范围内时 FilterEn 将被设置，尽管可以额外使用其他 FilterEn 范围。IP 过滤的细节见第 36.2.5.3 节。2：\[IA32_RTIT_ADDR1_A..IA32_RTIT_ADDR1_B\] 范围定义 TraceStop 范围。如果代码分支到此范围，将断言 TraceStop。TraceStop 的细节见第 36.4.2.10 节。3..15：保留（#GP）。如果 CPUID.14H.01H:EAX.RANGECNT\[2:0\] < 2，此字段被保留。 |
| 43:40 | ADDR2_CFG | 0   | 基于以下编码配置基址/限制寄存器对 IA32_RTIT_ADDR2_A/B：0：ADDR2 范围未使用。1：\[IA32_RTIT_ADDR2_A..IA32_RTIT_ADDR2_B\] 范围定义 FilterEn 范围。仅当 IP 在此范围内时 FilterEn 将被设置，尽管可以额外使用其他 FilterEn 范围。IP 过滤的细节见第 36.2.5.3 节。2：\[IA32_RTIT_ADDR2_A..IA32_RTIT_ADDR2_B\] 范围定义 TraceStop 范围。如果代码分支到此范围，将断言 TraceStop。TraceStop 的细节见第 36.4.2.10 节。3..15：保留（#GP）。如果 CPUID.14H.01H:EAX.RANGECNT\[2:0\] < 3，此字段被保留。 |
| 47:44 | ADDR3_CFG | 0   | 基于以下编码配置基址/限制寄存器对 IA32_RTIT_ADDR3_A/B：0：ADDR3 范围未使用。1：\[IA32_RTIT_ADDR3_A..IA32_RTIT_ADDR3_B\] 范围定义 FilterEn 范围。仅当 IP 在此范围内时 FilterEn 将被设置，尽管可以额外使用其他 FilterEn 范围。IP 过滤的细节见第 36.2.5.3 节。2：\[IA32_RTIT_ADDR3_A..IA32_RTIT_ADDR3_B\] 范围定义 TraceStop 范围。如果代码分支到此范围，将断言 TraceStop。TraceStop 的细节见第 36.4.2.10 节。3..15：保留（#GP）。如果 CPUID.14H.01H:EAX.RANGECNT\[2:0\] < 4，此字段被保留。 |
| 54:48 | 保留  | 0   | 仅为未来追踪内容启用或地址过滤配置启用保留。必须为 0。 |
| 55  | DisTNT | 0   | 0：在控制流追踪中包括 TNT 数据包。1：从控制流追踪中省略 TNT 数据包。当 CPUID.14H.00H:EBX\[8\]（"TNT Disable Supported"）为 0 时，此位被保留。细节见第 36.3.9 节。 |
| 56  | InjectPsbPmiOnEnable | 0   | 1：启用 IA32_RTIT_STATUS 位 PendPSB\[6\] 和 PendTopaPMI\[7\] 的使用，这些位的行为见第 36.2.8.4 节"IA32_RTIT_STATUS MSR"。0：IA32_RTIT_STATUS 位 6 和 7 被忽略。如果 CPUID.14H.00H:EBX\[6\] = 0，此字段被保留。 |
| 59:57 | 保留  | 0   | 仅为未来追踪内容启用或地址过滤配置启用保留。必须为 0。 |
| 63:60 | 保留  | 0   | 必须为 0。 |

#### 36.2.8.3 使用 TraceEn 启用和禁用数据包生成

当 TraceEn 从 0 转换到 1 时，Intel 处理器追踪被启用，且可以生成一系列数据包。这些数据包帮助确保解码器在追踪开始时知道处理器的状态，且它可以跟踪数据包生成被禁用期间可能发生的任何定时或状态更改。如果 IA32_RTIT_STATUS.PacketByteCnt=0，将生成完整 PSB+（见第 36.4.2.17 节），且在其他情况下也可能生成。否则，将生成定时数据包，包括 TSC、TMA 和 CBR（见第 36.4.1.1 节）。

除上面讨论的数据包外，如果且当 PacketEn（第 36.2.6.1 节）从 0 转换到 1（这可能立即发生，取决于过滤设置），将生成 TIP.PGE 数据包（第 36.4.2.3 节）。

当设置 TraceEn 时，处理器可以从内存读取 ToPA 条目并在内部缓存它们。因此，软件应在对 ToPA 表进行修改（或更改受限内存区域的配置）之前禁用数据包生成。对 TraceEn 的修改可能生成的数据包的更多细节见第 36.8 节。

**禁用数据包生成**

清除 TraceEn 导致逻辑处理器内缓冲的任何数据包数据被刷新出，之后输出 MSR（IA32_RTIT_OUTPUT_BASE 和 IA32_RTIT_OUTPUT_MASK_PTRS）将具有稳定值。当输出导向内存时，可能需要存储、围栏或架构序列化指令以确保数据包数据被全局观察到。禁用数据包生成不生成特殊数据包，尽管如果禁用时 PacketEn=1，可能导致 TIP.PGD。

**对 IA32_RTIT_CTL 的其他写**

在设置 TraceEn 时对 IA32_RTIT_CTL 的任何修改尝试将导致一般保护故障（#GP），除非相同的写也清除 TraceEn。然而，不修改任何位的对 IA32_RTIT_CTL 的写不会导致 #GP，即使 TraceEn 保持设置。

#### 36.2.8.4 IA32_RTIT_STATUS MSR

IA32_RTIT_STATUS MSR 可被软件读写，尽管一些字段不能被软件修改。细节见表 36-7。WRMSR 指令忽略源操作数中的这些位（修改这些位的尝试被忽略且不导致 WRMSR 故障）。

此 MSR 只能在 IA32_RTIT_CTL.TraceEn 为 0 时被写入；否则 WRMSR 导致一般保护故障（#GP）。当 TraceEn 为 0 时，处理器不修改此 MSR 的值（软件可以用 WRMSR 修改它）。

**表 36-7. IA32_RTIT_STATUS MSR**

| 位置  | 位名称 | 复位时 | 位描述 |
| --- | --- | --- | --- |
| 0   | FilterEn | 0   | 此位由处理器写入，指示对当前 IP 允许追踪，见第 36.2.6.5 节。写被忽略。 |
| 1   | ContextEn | 0   | 处理器设置此位以指示对当前上下文允许追踪。见第 36.2.6.3 节。写被忽略。 |
| 2   | TriggerEn | 0   | 处理器设置此位以指示追踪被启用。见第 36.2.6.2 节。写被忽略。 |
| 3   | 保留  | 0   | 必须为 0。 |
| 4   | Error | 0   | 处理器设置此位以指示已遇到操作错误。当设置此位时，TriggerEn 被清除为 0 且数据包生成被禁用。细节见第 36.2.7.2 节中的"ToPA Errors"。当 TraceEn 被清除时，软件可以写此位。一旦它被设置，只有软件可以清除它。 |
| 不建议软件曾设置此位，除非在恢复先前保存状态的场景中。 |     |     |     |
| 5   | Stopped | 0   | 处理器设置此位以指示已遇到 ToPA 停止条件。当设置此位时，TriggerEn 被清除为 0 且数据包生成被禁用。细节见第 36.2.7.2 节中的"ToPA STOP"。当 TraceEn 被清除时，软件可以写此位。一旦它被设置，只有软件可以清除它。不建议软件曾设置此位，除非在恢复先前保存状态的场景中。 |
| 6   | PendPSB | 0   | 如果 IA32_RTIT_CTL.InjectPsbPmiOnEnable\[56\] = 1，当达到要插入 PSB+ 的阈值时，处理器设置此位。当 PSB+ 已被插入到追踪中时，处理器将清除此位。如果 PendPSB = 1 且 InjectPsbPmiOnEnable = 1 时 IA32_RTIT_CTL.TraceEn\[0\] 从 0 转换到 1，将向追踪中插入 PSB+。如果 CPUID.14H.00H:EBX\[6\] = 0，此字段被保留。 |
| 7   | PendTopaPMI | 0   | 如果 IA32_RTIT_CTL.InjectPsbPmiOnEnable\[56\] = 1，当达到要插入 ToPA PMI 的阈值时，处理器设置此位。一旦 ToPA PMI 已被处理，软件应清除此位，细节见"ToPA PMI"。如果 PendTopaPMI = 1 且 InjectPsbPmiOnEnable = 1 时 IA32_RTIT_CTL.TraceEn\[0\] 从 0 转换到 1，将挂起 PMI。如果 CPUID.14H.00H:EBX\[6\] = 0，此字段被保留。 |
| 31:8 | 保留  | 0   | 必须为 0。 |
| 48:32 | PacketByteCnt | 0   | 此字段由处理器写入，持有已发送的数据包字节计数。处理器也使用此字段确定何时应插入下一个 PSB 数据包。注意当 IA32_RTIT_CTL.TraceEn=1 时，处理器可以随时清除或修改此字段。当 IA32_RTIT_CTL.TraceEn=0 时，它将具有稳定值。细节见第 36.4.2.17 节。当 CPUID.14H.00H:EBX\[1\]（"Configurable PSB and CycleAccurate Mode Supported"）为 0 时，此字段被保留。 |
| 63:49 | 保留  | 0   | 必须为 0。 |

#### 36.2.8.5 IA32_RTIT_ADDRn_A 和 IA32_RTIT_ADDRn_B MSR

对于每个 n，IA32_RTIT_ADDRn_A/B 寄存器对的作用由 IA32_RTIT_CTL 中的相应 ADDRn_CFG 字段（见第 36.2.8.2 节）确定。这些寄存器对的数量由 CPUID.14H.01H:EAX.RANGECNT\[2:0\] 枚举。

-   枚举支持 1 个范围的处理器支持：
    -   IA32_RTIT_ADDR0_A、IA32_RTIT_ADDR0_B
-   枚举支持 2 个范围的处理器支持：
    -   IA32_RTIT_ADDR0_A、IA32_RTIT_ADDR0_B
    -   IA32_RTIT_ADDR1_A、IA32_RTIT_ADDR1_B
-   枚举支持 3 个范围的处理器支持：
    -   IA32_RTIT_ADDR0_A、IA32_RTIT_ADDR0_B
    -   IA32_RTIT_ADDR1_A、IA32_RTIT_ADDR1_B
    -   IA32_RTIT_ADDR2_A、IA32_RTIT_ADDR2_B
-   枚举支持 4 个范围的处理器支持：
    -   IA32_RTIT_ADDR0_A、IA32_RTIT_ADDR0_B
    -   IA32_RTIT_ADDR1_A、IA32_RTIT_ADDR1_B
    -   IA32_RTIT_ADDR2_A、IA32_RTIT_ADDR2_B
    -   IA32_RTIT_ADDR3_A、IA32_RTIT_ADDR3_B

每个寄存器有持有线性地址值的单个 64 位字段。写必须确保地址为规范形式，否则将导致一般保护故障（#GP）。

每个 MSR 只能在 IA32_RTIT_CTL.TraceEn 为 0 时被写入；否则 WRMSR 导致一般保护故障（#GP）。

#### 36.2.8.6 IA32_RTIT_CR3_MATCH MSR

当 IA32_RTIT_CTL.CR3Filter 为 1 时，将 IA32_RTIT_CR3_MATCH 寄存器与 CR3 比较。第 63:5 位持有要匹配的 CR3 地址值，第 4:0 位保留为 0。CR3 过滤和此寄存器处理的更多细节见第 36.2.5.2 节。

如果 CPUID.14H.00H:EBX\[0\]（"CR3 Filtering Support"）为 1，此 MSR 可访问。此 MSR 只能在 IA32_RTIT_CTL.TraceEn 为 0 时被写入；否则 WRMSR 导致一般保护故障（#GP）。IA32_RTIT_CR3_MATCH\[4:0\] 被保留且必须为 0；使用 WRMSR 设置这些位的尝试导致 #GP。

#### 36.2.8.7 IA32_RTIT_OUTPUT_BASE MSR

当输出导向内存（IA32_RTIT_CTL.FabricEn = 0）时，此 MSR 用于配置追踪输出目标。地址字段的大小由与处理器物理地址宽度 MAXPHYADDR 相关的两个值确定：

-   M 是 CPUID.80000008H:EAX\[7:0\] 中枚举的值（至多 52）。
-   MAXPHYADDR 通常与 M 相同。然而，如果 IA32_TME_ACTIVATE\[0\] = 1（指示 TME 已被配置），当逻辑处理器在安全仲裁模式（SEAM；见第 35 章）之外时，MAXPHYADDR 被减少 IA32_TME_ACTIVATE\[39:36\] 的值；在 SEAM 中该值不被减少。

细节见表 36-8。

如果位 63:M 中任何将被设置为 1，WRMSR 和 XRSTORS 将故障；它们允许设置位 M-1:MAXPHYADDR；然而，如果在 SEAM 之外设置那些位中的任何，追踪输出可能以型号特定方式失败。

当使用 ToPA 输出方案时，处理器可以在数据包生成被启用时更新此 MSR，且那些更新与指令执行异步。因此，除非禁用数据包生成（IA32_RTIT_CTL.TraceEn = 0），否则此 MSR 中的值应被视为不可靠。

仅当支持到内存的 Intel PT 输出时（即当 CPUID.14H.00H:ECX\[0\] 或 CPUID.14H.00H:ECX\[2\] 被设置时），才支持对此 MSR 的访问。否则 WRMSR 或 RDMSR 导致一般保护故障（#GP）。如果支持，此 MSR 只能在 IA32_RTIT_CTL.TraceEn 为 0 时被写入；否则 WRMSR 导致一般保护故障（#GP）。

**表 36-8. IA32_RTIT_OUTPUT_BASE MSR**

| 位置  | 位名称 | 复位时 | 位描述 |
| --- | --- | --- | --- |
| 6:0 | 保留  | 0   | 必须为 0。 |
| MAXPHYADDR-1:7 | BasePhysAddr | 0   | 基址物理地址。此地址如何使用取决于 IA32_RTIT_CTL.ToPA 的值：0：这是单个连续物理输出区域的基址物理地址。取决于值，这可以映射到 DRAM 或 MMIO。基址应对齐区域的大小，使得掩码值（第 36.2.8.8 节）中的 1 都不与基址中的 1 重叠。如果基址未对齐，将产生操作错误（见第 36.3.10 节）。1：当前 ToPA 表的基址物理地址。地址必须 4K 对齐。写入位 11:7 非零的地址不会导致 #GP，但一旦设置 TraceEn 将发信号操作错误。见第 36.2.7.2 节中的"ToPA Errors"以及第 36.3.10 节。 |
| M-1:MAXPHYADDR | 保留  | 0   | 当启用处理器追踪时应为 0。 |
| 63:M | 保留  | 0   | 必须为 0。 |

#### 36.2.8.8 IA32_RTIT_OUTPUT_MASK_PTRS MSR

此 MSR 持有指示追踪输出的下一个字节应写入何处的任何掩码或指针值。此 MSR 中持有的值的含义取决于是否使用 ToPA 输出机制。细节见第 36.2.7.2 节。

当数据包生成被启用时处理器更新此 MSR，且那些更新与指令执行异步。因此，除非禁用数据包生成（IA32_RTIT_CTL.TraceEn = 0），否则此 MSR 中的值应被视为不可靠。

仅当支持到内存的 Intel PT 输出时（即当 CPUID.14H.00H:ECX\[0\] 或 CPUID.14H.00H:ECX\[2\] 被设置时），才支持对此 MSR 的访问。否则 WRMSR 或 RDMSR 导致一般保护故障（#GP）。如果支持，此 MSR 只能在 IA32_RTIT_CTL.TraceEn 为 0 时被写入；否则 WRMSR 导致一般保护故障（#GP）。

**表 36-9. IA32_RTIT_OUTPUT_MASK_PTRS MSR**

| 位置  | 位名称 | 复位时 | 位描述 |
| --- | --- | --- | --- |
| 6:0 | LowerMask | 7FH | 强制为 1，写被忽略。 |
| 31:7 | MaskOrTableOffset | 0   | 此字段的使用取决于 IA32_RTIT_CTL.ToPA 的值：0：此字段持有单个连续物理输出区域的掩码值的第 31:7 位。此字段的大小指示区域可以为 128B 到 4GB 的大小。此值（与保留为 1 的低 7 位组合）将与 OutputOffset 字段按位与以确定下一个写地址。此字段中的所有 1 应为连续的且从位 7 开始，否则区域将不连续，且设置 TraceEn 时将发信号操作错误（第 36.3.10 节）。1：此字段持有当前 ToPA 表中偏移指针的第 27:3 位。此值可以加到 IA32_RTIT_OUTPUT_BASE 值产生指向当前 ToPA 表条目的指针，其本身是指向当前输出区域的指针。在此场景中，低 7 保留位被忽略。此字段支持至多 256 MB 大小的表。 |
| 63:32 | OutputOffset | 0   | 此字段的使用取决于 IA32_RTIT_CTL.ToPA 的值：0：这是单个连续物理输出区域中偏移指针的第 31:0 位。此值将加到 IA32_RTIT_OUTPUT_BASE 值形成下一个数据包输出数据字节将被写入的物理地址。此值必须小于或等于 MaskOrTableOffset 字段，否则设置 TraceEn 时将发信号操作错误（第 36.3.10 节）。1：此字段持有当前 ToPA 输出区域中偏移指针的第 31:0 位。此值将加到在当前 ToPA 表条目中找到的输出区域基址字段，形成下一个追踪输出数据字节将被写入的物理地址。此值必须小于 ToPA 条目大小，否则设置 TraceEn 时将发信号操作错误（第 36.3.10 节）。 |

### 36.2.9 Intel® 处理器追踪与其他处理器特性的交互

#### 36.2.9.1 Intel® 事务同步扩展（Intel® TSX）

Intel TSX 的操作在《Intel® 64 和 IA-32 架构软件开发手册》第 1 卷第 14 章中描述。为追踪目的，数据包生成不区分硬件锁消除（HLE）和受限事务内存（RTM），但推测执行确实对追踪输出有影响。具体来说，数据包在指令完成时生成，即使对于稍后中止的事务区域中的指令也是如此。因此，调试软件将需要事务区域开始和结束的指示；这将允许软件理解指令何时是事务区域的一部分以及该区域是否已被提交。

为启用此功能，TSX 信息被包括在 MODE 数据包叶中。叶中的模式位是：

-   **InTX**：在 TSX 事务开始时设置为 1，在事务提交或中止时清除。
-   **TXAbort**：仅当 InTX 在中止时从 1 转换到 0 时设置为 1。否则清除。

如果 BranchEn=1，每次事务状态更改时都将发送此 MODE 数据包。细节见表 36-10。

**表 36-10. BranchEn=1 时的 TSX 数据包场景**

| TSX 事件 | 指令  | 数据包 |
| --- | --- | --- |
| 事务开始 | XBEGIN 或 XACQUIRE 锁（后者如果以事务方式执行） | MODE(TXAbort=0, InTX=1), FUP(CurrentIP) |
| 事务提交 | XEND 或 XRELEASE 锁，如果事务执行结束。这仅在最外层提交时发生 | MODE(TXAbort=0, InTX=0), FUP(CurrentIP) |
| 事务中止 | XABORT 或其他事务中止 | MODE(TXAbort=1, InTX=0), FUP(CurrentIP), TIP(TargetIP) |
| 其他。这些情况不更改 TSX 模式位 | 以下之一：嵌套 XBEGIN 或 XACQUIRE 锁；不开始事务的外层 XACQUIRE 锁（InTX 未设置）；非最外层 XEND 或 XRELEASE 锁 | 无   |

上面列出的 CurrentIP 是关联指令的 IP。TargetIP 是下一条要执行指令的 IP；对于 HLE，这是 XACQUIRE 锁；对于 RTM，这是回退处理程序。

Intel PT 存储是非事务性的，因此数据包写不会在 TSX 中止时回滚。

#### 36.2.9.2 TSX 和 IP 过滤

跟踪事务的复杂性在于处理在追踪区域外开始或结束的事务。事务不能跨 ContextEn 更改，因为 CPL 更改和 CR3 更改各自导致中止。但事务可以在 IP 过滤区域内开始并在其外结束。

为帮助解码器处理此情况，即使 FilterEn=0 也可以发送 MODE.TSX 数据包，尽管不会有附着的 FUP。相反，它们将仅用于向解码器指示事务何时活动以及何时不活动。当追踪恢复（由于 PacketEn=1）时，TIP.PGE 之前的最后一个 MODE.TSX 将指示当前事务状态。

#### 36.2.9.3 系统管理模式（SMM）

SMM 代码具有非 SMM 代码没有的特殊权限。Intel 处理器追踪可以用于追踪 SMM 代码，但采取特殊注意以确保 SMM 处理程序上下文不在任何非 SMM 追踪收集中暴露。此外，追踪非 SMM 代码的数据包输出不能写入由 SMRR 保护或由 SMM 处理程序使用的内存空间。

SMM 通过系统管理中断（SMI）进入。SMI 交付将 IA32_RTIT_CTL.TraceEn 的值保存到 SMRAM 然后清除它，从而禁用数据包生成。

保存和清除 IA32_RTIT_CTL.TraceEn 确保两件事：

1.  所有内部缓冲的数据包数据在进入 SMM 之前被刷新（见第 36.2.8.2 节）。
2.  数据包生成在进入 SMM 之前停止，因此在 SMM 外部配置的任何追踪不会继续进入 SMM。非 SMM 追踪中不会暴露任何 SMM 指令指针或其他状态。

当执行 RSM 指令从 SMM 返回时，SMI 交付保存的 TraceEn 值被恢复，允许追踪恢复。如任何时候启用数据包生成所做的那样，基于 RSM 建立的 CPL、CR3 等值重新评估 ContextEn。

像其他中断一样，SMI 的交付产生包含下一条要执行指令 IP 的 FUP。通过切换 TraceEn，SMI 和 RSM 可以分别产生 TIP.PGD 和 TIP.PGE 数据包，指示追踪被禁用或重新启用。进入和离开 SMM 的数据包更多信息见表 36.8。

尽管 #SMI 和 RSM 更改 CR3，这些情况下不生成 PIP 数据包。对于 #SMI，追踪在 CR3 更改之前被禁用；对于 RSM，TraceEn 在 CR3 被写入之后被恢复。

必须在执行 RSM 之前清除 TraceEn，否则将导致关闭。此外，在限制 Intel PT 与 LBR 一起使用的处理器上（见第 36.3.1.2 节），任何导致两者都被启用的 RSM 将导致关闭。

Intel PT 可以支持追踪在 SMM 中操作的系统转移监视器，见第 36.6 节。

#### 36.2.9.4 虚拟机扩展（VMX）

Intel 处理器追踪的初始实现不支持 VMX 操作中的追踪。此类处理器通过为 IA32_VMX_MISC\[bit 14\] 返回 0 指示此情况。在这些处理器上，VMXON 指令的执行清除 IA32_RTIT_CTL.TraceEn，且任何在 VMX 操作中写入 IA32_RTIT_CTL 的尝试导致一般保护异常（#GP）。

支持 VMX 操作中 Intel 处理器追踪的处理器为 IA32_VMX_MISC\[bit 14\] 返回 1。VMX 操作中追踪的细节在第 36.4.2.26 节中描述。

#### 36.2.9.5 Intel® 软件防护扩展（Intel® SGX）

Intel SGX 为应用程序提供实例化具有机密性和完整性的保护容器（飞地）的能力（见《Intel® 64 和 IA-32 架构软件开发手册》第 3D 卷）。在同时启用 Intel PT 和 Intel SGX 的处理器上，当在生产飞地内执行代码时，Intel PT 不产生控制流数据包。飞地进入将清除 ContextEn，从而阻止控制流数据包生成。如果进入时 PacketEn=1，将生成 TIP.PGD 数据包。

在飞地退出时，ContextEn 不再被强制为 0。如果此时设置其他启用，可以生成 TIP.PGE 以指示追踪恢复。

在飞地执行期间，Intel PT 保持启用，且仍可生成 PSB、TSC、MTC 或 CBR 等周期或定时数据包。不暴露 IP 或其他架构状态。

飞地进入或退出的数据包生成示例见第 36.8 节。

**调试飞地**

Intel SGX 允许飞地为调试目的配置放宽的机密性保护，见《Intel® 64 和 IA-32 架构软件开发手册》第 3D 卷。在调试飞地中，Intel PT 继续正常功能。具体来说，ContextEn 不受飞地进入或退出影响。因此，允许在调试飞地内生成依赖 ContextEn 的数据包。

#### 36.2.9.6 SENTER/ENTERACCS 和 ACM

GETSEC\[SENTER\] 和 GETSEC\[ENTERACCS\] 指令清除 TraceEn，且当那些指令完成时不被恢复。SENTER 也导致其他逻辑处理器在它们会合并进入 SENTER 睡眠状态时清除 TraceEn。在这两种情况下，禁用数据包生成不保证刷新内部缓冲的数据包。一些数据包可能被丢弃。

当执行认证代码模块（ACM）时，数据包生成在 ACRAM 设置期间被静默禁用。TraceEn 将被清除，但不生成 TIP.PGD 数据包。模块完成后，TraceEn 值将被恢复。不会有 TIP.PGE 数据包，但可以产生 TSC 和 CBR 等定时数据包。

#### 36.2.9.7 Intel® 内存保护扩展（Intel® MPX）

由 Intel MPX 导致的边界异常（#BR）像其他异常一样处理，产生指示源和目标 IP 的 FUP 和 TIP 数据包。

## 36.3 配置和编程指南

### 36.3.1 检测 Intel 处理器追踪和能力枚举

处理器对 Intel 处理器追踪的支持由 CPUID.07H.00H:EBX\[25\]= 1 指示。CPUID 功能 14H 专用于枚举报告 CPUID.07H.00H:EBX\[25\]= 1 的处理器的资源和能力。不同处理器代可能在能力上具有架构定义的变化。表 36-11 描述软件必须在支持 Intel 处理器追踪的处理器代中使用的可枚举能力的细节。

**表 36-11. CPUID.14H 对 Intel 处理器追踪能力的枚举**

| CPUID.14H.00H 寄存器/位 | 名称  | 描述行为 |
| --- | --- | --- |
| EAX 31:0 | 最大有效子叶索引 | 指定此 CPUID 叶的最大有效子叶的索引。 |
| EBX 0 | CR3 过滤支持 | 1：指示 IA32_RTIT_CTL.CR3Filter 可以被设置为 1，且 IA32_RTIT_CR3_MATCH MSR 可以被访问。见第 36.2.8 节。0：指示将 IA32_RTIT_CTL.CR3Filter 设置为 1 的写，或对 IA32_RTIT_CR3_MATCH 的任何访问，将生成 #GP 异常。 |
| EBX 1 | 可配置 PSB 和周期精确模式支持 | 1：（a）IA32_RTIT_CTL.PSBFreq 可以被设置为非零值，以选择首选 PSB 频率（允许值见下文）。（b）IA32_RTIT_STATUS.PacketByteCnt 可以被设置为非零值，且当追踪时将处理器递增以指示向下一个 PSB 的进展。如果通过设置 TraceEn 启用追踪数据包生成，仅当 PacketByteCnt=0 时才会生成 PSB。（c）IA32_RTIT_CTL.CYCEn 可以被设置为 1 以启用周期精确模式。见第 36.2.8 节。0：（a）对 IA32_RTIT_CTL.PSBFreq 或 IA32_RTIT_STATUS.PacketByteCnt 写入非零值的任何尝试将生成 #GP 异常。（b）如果通过设置 TraceEn 启用追踪数据包生成，总是生成 PSB。（c）对 IA32_RTIT_CTL.CYCEn 或 IA32_RTIT_CTL.CycThresh 写入非零值的任何尝试将生成 #GP 异常。 |
| EBX 2 | 支持 IP 过滤和 TraceStop，且在热复位时保留 Intel PT MSR | 1：（a）IA32_RTIT_CTL 提供一个或多个 ADDRn_CFG 字段以配置用于 IP 过滤或 IP TraceStop 的相应地址范围 MSR。每个 ADDRn_CFG 字段接受 0:2 范围内的值（含）。ADDRn_CFG 字段的数量由 CPUID.14H.01H:EAX.RANGECNT\[2:0\] 报告。（b）提供至少一个寄存器对 IA32_RTIT_ADDRn_A 和 IA32_RTIT_ADDRn_B 以配置用于 IP 过滤或 IP TraceStop 的地址范围。（c）在热复位时，所有 Intel PT MSR 将保留其复位前值，尽管 IA32_RTIT_CTL.TraceEn 将被清除。Intel PT MSR 列在第 36.2.8 节中。0：（a）用非零编码值写 IA32_RTIT_CTL.ADDRn_CFG 的尝试将导致 #GP。（b）对 IA32_RTIT_ADDRn_A 和 IA32_RTIT_ADDRn_B 的任何访问将生成 #GP 异常。（c）在热复位时，所有 Intel PT MSR 将被清除。 |
| EBX 3 | MTC 支持 | 1：IA32_RTIT_CTL.MTCEn 可以被设置为 1，且将生成 MTC 数据包。见第 36.2.8 节。0：将 IA32_RTIT_CTL.MTCEn 或 IA32_RTIT_CTL.MTCFreq 设置为非零值的尝试将生成 #GP 异常。 |
| EBX 4 | PTWRITE 支持 | 1：写可以设置 IA32_RTIT_CTL\[12\]（PTWEn）和 IA32_RTIT_CTL\[5\]（FUPonPTW），且 PTWRITE 可以生成数据包。0：设置 IA32_RTIT_CTL\[12\] 或 IA32_RTIT_CTL\[5\] 的写将生成 #GP 异常，且 PTWRITE 将 #UD 故障。 |
| EBX 5 | 电源事件追踪支持 | 1：写可以设置 IA32_RTIT_CTL\[4\]（PwrEvtEn），启用电源事件追踪数据包生成。0：设置 IA32_RTIT_CTL\[4\] 的写将生成 #GP 异常。 |
| EBX 6 | PSB 和 PMI 保留支持 | 1：写可以设置 IA32_RTIT_CTL\[56\]（InjectPsbPmiOnEnable），启用处理器设置 IA32_RTIT_STATUS\[7\]（PendTopaPMI）和/或 IA32_RTIT_STATUS\[6\]（PendPSB）以保留否则因 Intel PT 禁用而丢失的 ToPA PMI 和/或 PSB。写也可以设置 PendToPAPMI 和 PendPSB。0：设置 IA32_RTIT_CTL\[56\]、IA32_RTIT_STATUS\[7\] 或 IA32_RTIT_STATUS\[6\] 的写将生成 #GP 异常。 |
| EBX 7 | 事件追踪支持 | 1：写可以设置 IA32_RTIT_CTL\[31\]（EventEn），启用事件追踪数据包生成。0：设置 IA32_RTIT_CTL\[31\] 的写将生成 #GP 异常。 |
| EBX 8 | TNT 禁用支持 | 1：写可以设置 IA32_RTIT_CTL\[55\]（DisTNT），禁用 TNT 数据包生成。0：设置 IA32_RTIT_CTL\[55\] 的写将生成 #GP 异常。 |
| EBX 31:9 | 保留  |     |
| ECX 0 | ToPA 输出支持 | 1：可以用 IA32_RTIT_CTL.ToPA = 1 启用追踪，从而利用 ToPA 输出方案（第 36.2.7.2 节）。IA32_RTIT_OUTPUT_BASE 和 IA32_RTIT_OUTPUT_MASK_PTRS MSR 可以被访问。0：除非 CPUID.14H.00H:ECX.SNGL_RNG_OUT\[2\] = 1，对 IA32_RTIT_OUTPUT_BASE 或 IA32_RTIT_OUTPUT_MASK_PTRS MSR 的写将生成 #GP 异常。 |
| ECX 1 | ToPA 表允许多个输出条目 | 1：ToPA 表可以持有任意数量的输出条目，直至 IA32_RTIT_OUTPUT_MASK_PTRS 的 MaskOrTableOffset 字段允许的最大值。（此外，不会产生延迟 TIP；见第 36.4.2.3 节。）0：ToPA 表只能持有单个输出条目，其后必须跟指向回表基址的 END=1 条目。（此外，可能产生延迟 TIP。）此外，ToPA PMI 将在区域被填满之前被交付。见第 36.2.7.2 节中的 ToPA PMI。如果在 END 条目之前有多个输出条目，或如果 END 条目具有错误的基址，将发信号操作错误（见第 36.2.7.2 节中的"ToPA Errors"）。 |
| ECX 2 | 单范围输出支持 | 1：支持用 IA32_RTIT_CTL.ToPA=0 启用追踪（TraceEn=1）。0：除非 CPUID.14H.00H:ECX.TOPAOUT\[0\] = 1，对 IA32_RTIT_OUTPUT_BASE 或 IA32_RTIT_OUTPUT_MASK_PTRS MSR 的写将生成 #GP 异常。 |
| ECX 3 | 输出到追踪传输子系统支持 | 1：支持将 IA32_RTIT_CTL.FabricEn 设置为 1。0：IA32_RTIT_CTL.FabricEn 被保留。向 IA32_RTIT_CTL.FabricEn 写 1 将生成 #GP 异常。 |
| ECX 30:4 | 保留  |     |
| ECX 31 | IP 载荷为 LIP | 1：包含 IP 载荷的生成数据包具有 LIP 值，其包括 CS 基址分量。0：包含 IP 载荷的生成数据包具有 RIP 值，其是从 CS 基址的偏移。 |
| EDX 31:0 | 保留  |     |

如果 CPUID.14H.00H:EAX 报告非零值，Intel 处理器追踪的额外能力在 CPUID.14H 的子叶中描述。

**表 36-12. CPUID.14H.01H 对 Intel 处理器追踪能力的枚举**

| CPUID.14H.01H 寄存器/位 | 名称  | 描述行为 |
| --- | --- | --- |
| EAX 2:0 | 地址范围数 | 非零值指定 IA32_RTIT_CTL 中支持的 ADDRn_CFG 字段数量以及为 IP 过滤和 IP TraceStop 支持的寄存器对 IA32_RTIT_ADDRn_A/IA32_RTIT_ADDRn_B 的数量。注：目前，没有处理器支持超过 4 个地址范围。 |
| EAX 15:3 | 保留  |     |
| EBX 31:16 | 支持的 MTC 周期编码位图 | 非零位指示 IA32_RTIT_CTL.MTCFreq 字段支持的编码值的映射。这仅适用于 CPUID.14H.00H:EBX\[3\] = 1（支持 MTC 数据包生成），否则 MTCFreq 字段保留为 0。此字段中的每个位位置代表 4 位 MTCFreq 字段中的 1 个编码值（即，位 0 与编码值 0 关联）。对于每个位：1：MTCFreq 可以被赋予关联的编码值。0：MTCFreq 不能被赋予关联的编码值。用不支持的编码写 IA32_RTIT_CTL.MTCFreq 将导致 #GP 故障。 |
| EBX 15:0 | 支持的周期阈值值位图 | 非零位指示 IA32_RTIT_CTL.CycThresh 字段支持的编码值的映射。这仅适用于 CPUID.14H.00H:EBX\[1\] = 1（支持周期精确模式），否则 CycThresh 字段保留为 0。见第 36.2.8 节。此字段中的每个位位置代表 4 位 CycThresh 字段中的 1 个编码值（即，位 0 与编码值 0 关联）。对于每个位：1：CycThresh 可以被赋予关联的编码值。0：CycThresh 不能被赋予关联的编码值。用不支持的编码写 CycThresh 将导致 #GP 故障。 |
| ECX 31:16 | 支持的可配置 PSB 频率编码位图 | 非零位指示 IA32_RTIT_CTL.PSBFreq 字段支持的编码值的映射。这仅适用于 CPUID.14H.00H:EBX\[1\] = 1（支持可配置 PSB），否则 PSBFreq 字段保留为 0。见第 36.2.8 节。此字段中的每个位位置代表 4 位 PSBFreq 字段中的 1 个编码值（即，位 0 与编码值 0 关联）。对于每个位：1：PSBFreq 可以被赋予关联的编码值。0：PSBFreq 不能被赋予关联的编码值。用不支持的编码写 PSBFreq 将导致 #GP 故障。 |
| ECX 31:0 | 保留  |     |
| EDX 31:0 | 保留  |     |

#### 36.3.1.1 RIP 对 LIP 的数据包解码

FUP、TIP、TIP.PGE 和 TIP.PGE 数据包可以包含指令指针（IP）载荷。在一些处理器代上，此载荷将是有效地址（RIP），而在其他上这将是线性地址（LIP）。在前者情况下，载荷是从当前 CS 基址的偏移，而在后者中它是偏移和 CS 基址的和（注意在实模式中，CS 基址是 CS<<4 的值，而在保护模式中 CS 基址是 CS 寄存器指示的段的基础线性地址。）。使用哪种 IP 类型由枚举指示（见表 36-11 中的 CPUID.14H.00H:ECX.LIP\[31\]）。

对于在 CS 基址为 0 时执行的软件（包括在 64 位模式中执行的所有软件），差异不可区分。追踪解码器必须考虑 CS 基址不为 0 的情况，且解析的 LIP 在枚举使用 RIP 的 CPU 上生成的追踪中将不明显。这在尝试将追踪与关联二进制链接时可能导致问题。

注意 IP 比较逻辑（用于 IP 过滤和 TraceStop 范围计算）基于与这些 IP 数据包相同的 IP 类型。对于输出 RIP 的处理器，IP 比较机制也基于 RIP，因此在那些处理器上应将 RIP 值写入 IA32_RTIT_ADDRn\_\[AB\] MSR。如果相同的追踪配置设置在报告不同 IP 类型（即，CPUID.14H.00H:ECX.LIP\[31\]）的处理器上运行，这可以产生不同行为。配置 IP 过滤器时应小心检查 CPUID。

#### 36.3.1.2 型号特定能力限制

一些处理器代施加限制，防止软件启用 Intel 处理器追踪追踪时使用 LBR/BTS/BTM/LER。在这些处理器上，当设置 TraceEn 时，LBR、BTS、BTM、LER 的更新被挂起，但相应 IA32_DEBUGCTL 控制字段的状态保持不变，仿佛它仍被启用。当清除 TraceEn 时，LBR 数组被重置，且 LBR/BTS/BTM/LER 更新将恢复。此外，对这些寄存器的读将返回 0，写将被丢弃。

其更新/访问受限制的 MSR 列表如下：

-   MSR_LASTBRANCH_x_TO_IP、MSR_LASTBRANCH_x_FROM_IP、MSR_LBR_INFO_x、MSR_LASTBRANCH_TOS
-   MSR_LER_FROM_LIP、MSR_LER_TO_LIP
-   MSR_LBR_SELECT

对于 CPUID DisplayFamily_DisplayModel 签名为 06_3DH、06_47H、06_4EH、06_4FH、06_56H 和 06_5EH 的处理器，Intel PT 和 LBR 的使用互斥。

### 36.3.2 启用和配置追踪数据包生成

要配置追踪数据包、启用数据包生成并捕获数据包，软件首先使用 CPUID 指令检测其特性标志，CPUID.07H.00H:EBX\[25\]= 1；然后枚举第 36.3.1 节中描述的能力。

基于从第 36.3.1 节查询的能力，软件必须配置多个型号特定寄存器。本节描述与那些 MSR 相关的编程考虑。

#### 36.3.2.1 启用数据包生成

当配置和启用数据包生成时，应在任何其他 Intel PT MSR 已被写入之后写入 IA32_RTIT_CTL MSR，因为如果 TraceEn = 1，对其他配置 MSR 的写导致一般保护故障（#GP）。如果先前追踪收集上下文不被恢复，软件应首先清除 IA32_RTIT_STATUS。这很重要，因为 Stopped 和 Error 字段是可写的；清除 MSR 清除可能从先前追踪数据包收集上下文持续的任何值。将 TraceEn 设置为 1 生成的数据包细节见第 36.2.8.2 节。

如果设置 TraceEn 为 1 导致操作错误（见第 36.3.10 节），在 WRMSR 完成后到错误在 IA32_RTIT_STATUS MSR 中被发信号之前可能有延迟。

当数据包生成被启用时，一些配置 MSR（例如，IA32_RTIT_STATUS 和 IA32_RTIT_OUTPUT\_\*）的值是瞬态的，且读可能返回过时的值。仅在数据包生成被禁用（通过清除 TraceEn）之后，对这些 MSR 的读才返回可靠值。

#### 36.3.2.2 禁用数据包生成

通过清除 IA32_RTIT_CTL 禁用数据包生成后，建议读取 IA32_RTIT_STATUS MSR（第 36.2.8.4 节）：

-   如果设置 Error 位，遇到操作错误，且追踪很可能受损。软件应通过检查输出 MSR 值检查错误源，纠正问题源，然后再次尝试收集追踪。操作错误的细节见第 36.3.10 节。软件应在重新启用数据包生成之前清除 IA32_RTIT_STATUS.Error。
-   如果设置 Stopped 位，软件执行在数据包生成被禁用之前遇到 IP TraceStop（见第 36.2.5.3 节）或 ToPA 停止条件（见第 36.2.7.2 节中的"ToPA STOP"）。

### 36.3.3 刷新追踪输出

数据包首先被内部缓冲然后异步写出。要收集数据包输出用于后处理，收集器首先需要确保所有数据包数据已从内部缓冲区刷新。软件可以通过清除 IA32_RTIT_CTL.TraceEn 停止数据包生成来确保此情况（见第 36.2.8.2 节中的"Disabling Packet Generation"）。

当软件清除 IA32_RTIT_CTL.TraceEn 以刷新出内部缓冲的数据包时，逻辑处理器发出 SFENCE 操作，确保 WC 追踪输出存储相对于下一个存储或序列化操作有序。来自同一逻辑处理器的后续读将看到刷新的追踪数据，而来自另一个逻辑处理器的读应在追踪逻辑处理器上进行存储、围栏或架构序列化操作之后。

当刷新操作完成时，IA32_RTIT_OUTPUT\_\* MSR 值指示追踪结束位置。当设置 TraceEn 时，这些 MSR 可能持有陈旧值。此外，如果带 INT=1 的 ToPA 区域被填满（意味着已触发 ToPA PMI），在刷新完成时 IA32_PERF_GLOBAL_STATUS.Trace_ToPA_PMI\[55\] 将被设置。

### 36.3.4 热复位

软件用于编程 Intel 处理器追踪的 MSR 在上电复位（或冷复位）后被清除。在热复位时，那些 MSR 的内容可以保留热复位前的值，但 IA32_RTIT_CTL.TraceEn 将被清除（这可能有清除 IA32_RTIT_STATUS 中一些位的副作用）。

### 36.3.5 上下文切换考虑

为便于在软件进程或线程上下文的粒度上构造指令执行追踪，软件可以在进程或线程上下文切换边界保存和恢复追踪配置 MSR 的状态。原则与跨上下文切换保存和恢复典型架构处理器状态相同。

#### 36.3.5.1 手动追踪配置上下文切换

配置可以通过 RDMSR、MSR 内容管理和 WRMSR 的指令序列保存和恢复。要停止追踪并确保所有配置 MSR 包含稳定值，软件必须在读取任何其他追踪配置 MSR 之前清除 IA32_RTIT_CTL.TraceEn。手动保存追踪配置上下文的推荐方法如下：

1.  RDMSR IA32_RTIT_CTL，将值保存到内存
2.  用上面 RDMSR 的保存值且 TraceEn 被清除来 WRMSR IA32_RTIT_CTL
3.  RDMSR 其值从先前保存值更改的所有其他配置 MSR，将更改的值保存到内存

恢复追踪配置上下文时，IA32_RTIT_CTL 应最后恢复：

1.  从内存读取除 IA32_RTIT_CTL 外的保存配置 MSR 值，并用 WRMSR 恢复它们
2.  从内存读取保存的 IA32_RTIT_CTL 值，并用 WRMSR 恢复。

#### 36.3.5.2 使用 XSAVES/XRSTORS 的追踪配置上下文切换

在其 XSAVE 特性集支持 XSAVES 和 XRSTORS 的处理器上，追踪配置状态可以使用 XSAVES 保存并由 XRSTORS 恢复，与 IA32_XSS 中监督状态组件关联的位字段结合使用。见《Intel® 64 和 IA-32 架构软件开发手册》第 1 卷第 13 章"使用 XSAVE 特性集管理状态"。

### 36.3.6 周期精确模式

Intel PT 可以在启用 CYC 数据包（见第 36.4.2.14 节）的周期精确模式中运行，该数据包在处理器核心时钟域中提供低级信息。CYC 数据包中的此周期计数器数据可以用于计算 IPC（每周期指令数），或在细粒度级别跟踪挂钟时间。

要启用周期精确模式数据包生成，软件应设置 IA32_RTIT_CTL.CYCEn=1。建议软件在任何使用周期精确模式时也设置 TSCEn=1。这样，所有 CYC 合格数据包将前有 CYC 数据包，其载荷指示自最后一个 CYC 数据包以来的核心时钟周期数。在单个周期中生成多个 CYC 合格数据包的情况下，在 CYC 合格数据包之前将仅生成单个 CYC，否则每个 CYC 合格数据包将前有其自己的 CYC。CYC 合格数据包是：

-   TNT、TIP、TIP.PGE、TIP.PGD、MODE.EXEC、MODE.TSX、PIP、VMCS、OVF、MTC、TSC、PTWRITE、EXSTOP

当由于追踪被禁用（TriggerEn=0）或断电场景（如转换到深睡眠 MWAIT C 状态）而没有足够信息重建挂钟时间时，生成 TSC 数据包。在此情况下，与 TSC 一起生成的 CYC 将指示在最后一个 CYC 数据包和 TSC 数据包之间主动追踪（那些上电的，带 TriggerEn=1）执行的周期数。因此，追踪不活动时花费的时间量可以从基于 CYC 值预期的时间与实际 TSC 指示的时间之间的差异推断。

可以单独发送额外的 CYC 数据包，以便处理器可以确保解码器知道在内部硬件计数器环绕或由于其他微架构条件被重置之前已过去的周期数。不保证这些独立 CYC 数据包将以什么间隔发送，除了它们将在环绕发生之前被发送。下面给出一个图示。

**示例 36-1. 说明性 CYC 数据包示例**

| 时间（周期） | 指令快照 | 生成的数据包 | 注释  |
| --- | --- | --- | --- |
| x   | call %eax | CYC(?), TIP | 距前一个 CYC 的已过周期数未知 |
| x + 2 | call %ebx | CYC(2), TIP | 1 字节 CYC 数据包；自前一个 CYC 以来已过 2 个周期 |
| x + 8 | jnz Foo（未采取） | CYC(6) | 1 字节 CYC 数据包 |
| x + 9 | ret（压缩） |     |     |
| x + 12 | jnz Bar（采取） |     |     |
| x + 16 | ret（非压缩） | TNT, CYC(8), TIP | 1 字节 CYC 数据包 |
| x + 4111 |     | CYC(4095) | 2 字节 CYC 数据包 |
| x + 12305 |     | CYC(8194) | 3 字节 CYC 数据包 |
| x + 16332 | mov cr3, %ebx | CYC(4027), PIP | 2 字节 CYC 数据包 |

#### 36.3.6.1 周期计数器

周期计数器在硬件中实现（独立于时间戳计数器或性能监视计数器），是一个简单的递增计数器，不饱和而是环绕。计数器的大小是实现特定的。

周期计数器在任何时候 TriggerEn 被清除以及发送 CYC 数据包时被重置为零。当 ContextEn 或 FilterEn 被清除时，周期计数器将继续计数，且周期数据包仍将被生成。在导致 Intel PT 逻辑断电的睡眠状态中它不会计数，但将计数到时钟被禁用的点，且一旦它们被重新启用就恢复计数。

#### 36.3.6.2 周期数据包语义

周期精确模式遵守以下协议：

-   CYC 数据包之前的所有数据包代表在 CYC 时间之前发生的事件或指令。
-   CYC 数据包之后的所有数据包代表在 CYC 时间同时或之后发生的事件或指令。
-   紧接 CYC 数据包之后的 CYC 合格数据包代表在 CYC 时间同时发生的事件或指令。

上面这些项给解码器提供将 CYC 数据包应用于汇编流中特定指令的手段。大多数数据包代表单个指令或事件，因此每个那些数据包之前的 CYC 数据包代表该指令或事件的退役时间。对于 TNT 数据包，数据包中可以包含至多 6 个条件分支和/或压缩 RET。在此情况下，前面的 CYC 数据包提供数据包中第一个分支的退役时间。多个分支可能在 TNT 中第一个分支的相同周期退役，但协议不会使这明显。另注意 MTC 数据包可以在 TNT 数据包中第一个 JCC 的相同周期生成。在此情况下，CYC 将先于 MTC 和 TNT 两者，并适用于两者。

注意有时周期计数器将停止计数，尽管启用了周期精确模式。在任何此类场景之后，将发送后跟 TSC 数据包的 CYC 数据包。见第 36.9.3.2 节以了解如何解释载荷值。

**多数据包指令或事件**

一些操作（如中断或任务切换）生成多个数据包。在这些情况下，可以为操作发送多个 CYC 数据包，先于操作中的每个 CYC 合格数据包。下面给出一个示例，使用软件中断上的任务切换。

**示例 36-2. 多数据包操作存在时的 CYC 示例**

| 时间（周期） | 指令快照 | 生成的数据包 |
| --- | --- | --- |
| x   | jnz Foo（未采取） | CYC(?) |
| x + 2 | ret（压缩） |     |
| x + 8 | jnz Bar（采取） |     |
| x + 9 | jmp %eax | TNT, CYC(9), TIP |
| x + 12 | jnz Bar（未采取） | CYC(3) |
| x + 32 | int3（任务门） | TNT, FUP, CYC(10), PIP, CYC(20), MODE.Exec, TIP |

#### 36.3.6.3 周期阈值

软件可以选择减少周期数据包的频率，这是以精度为代价节省带宽和侵扰的权衡。这通过利用周期阈值（见第 36.2.8.2 节）来完成。

IA32_RTIT_CTL.CycThresh 向处理器指示在发送下一个 CYC 数据包之前必须经过的最小周期数。如果此值为 0，不使用阈值，且可以在生成 CYC 合格数据包的每个周期中发送 CYC 数据包。如果此值大于 0，硬件将等待自最后一个 CYC 数据包以来经过关联的周期数后才发送另一个。CPUID 提供 CycThresh 的阈值选项，见第 36.3.1 节。

注意周期阈值不规定 CYC 数据包将多么频繁地发布，它仅分配最大频率。如果周期阈值为 16，CYC 数据包每 16 个周期不多于一次地发布。然而，一旦该 16 个周期的阈值已过，仍需要在插入 CYC 之前生成新的 CYC 合格数据包。表 36-13 说明阈值行为。

**表 36-13. 说明性 CYC 数据包示例**

| 时间（周期） | 指令快照 | 阈值 0 | 阈值 16 | 阈值 32 | 阈值 64 |
| --- | --- | --- | --- | --- | --- |
| x   | jmp %eax | CYC, TIP | CYC, TIP | CYC, TIP | CYC, TIP |
| x + 9 | call %ebx | CYC, TIP | TIP | TIP | TIP |
| x + 15 | call %ecx | CYC, TIP | TIP | TIP | TIP |
| x + 30 | jmp %edx | CYC, TIP | CYC, TIP | TIP | TIP |
| x + 38 | mov cr3, %eax | CYC, PIP | PIP | CYC, PIP | PIP |
| x + 46 | jmp \[%eax\] | CYC, TIP | CYC, TIP | TIP | TIP |
| x + 64 | call %edx | CYC, TIP | CYC, TIP | TIP | CYC,TIP |
| x + 71 | jmp %edx | CYC, TIP | TIP | CYC,TIP | TIP |

### 36.3.7 解码器同步（PSB+）

PSB 数据包（第 36.4.2.17 节）作为追踪数据包解码器的同步点。它是追踪日志中的一种模式，解码器可以快速扫描以对齐数据包边界。没有合法的数据包组合可以导致这样的字节序列。因此，它作为数据包解码的起点。要正确解码追踪日志，解码器需要的不仅仅是简单对齐：它需要知道一些状态以及潜在地一些定时信息。解码器绝不应需要跨 PSB 保留任何信息（例如，LastIP、调用栈、复合数据包事件）；所有复合数据包事件将在 PSB 之前完成，且任何压缩状态将被重置。

当生成 PSB 数据包时，它后跟 PSBEND 数据包（第 36.4.2.18 节）。在那两个数据包之间可以生成一个或多个数据包，这些告知解码器处理器的当前状态。这些数据包（统称为 PSB+）应被解释为"仅状态"，因为它们不暗示在 PSB 时任何状态更改，也不与任何指令或事件直接关联。因此，适用于 PSB+ 外部这些数据包的正常绑定和排序规则可以在这些数据包位于 PSB 和 PSBEND 之间时被忽略。它们告知解码器在 PSB 时处理器的状态。

PSB+ 可以包括：

-   时间戳（TSC），如果 IA32_RTIT_CTL.TSCEn=1。
-   时间戳-MTC 对齐（TMA），如果 IA32_RTIT_CTL.TSCEn=1 且 IA32_RTIT_CTL.MTCEn=1。
-   分页信息数据包（PIP），如果 ContextEn=1 且 IA32_RTIT_CTL.OS=1。如果逻辑处理器在 VMX 非根操作且"conceal VMX from PT" VM 执行控制为 0，则设置非根位（NR）。
-   VMCS 数据包，如果逻辑处理器在 VMX 根操作，或逻辑处理器在 VMX 非根操作且"conceal VMX from PT" VM 执行控制为 0。
-   核心总线比率（CBR）。
-   MODE.TSX，如果 ContextEn=1 且 BranchEn = 1。
-   MODE.Exec，如果 PacketEn=1 或（ContextEn=1 且 IA32_RTIT_CTL.EventEn=1）。
-   流更新数据包（FUP），如果 PacketEn=1。

PSB 仅在 TriggerEn=1 时生成；因此 PSB+ 具有相同的依赖。PSB+ 内数据包的排序不固定。可以在 PSB 和 PSBEND 之间生成 CYC 和 MTC 等定时数据包，且它们的含义与 PSB+ 外部相同。

PSB+ 可以在一些场景中丢失。如果 IA32_RTIT_STATUS.TriggerEn 恰好在达到 PSB 阈值时被清除（例如，由于 TraceEn 被清除），PSB+ 可能不被生成。在支持 PSB 保留（CPUID.14H.00H:EBX\[6\] = 1）的处理器上，设置 IA32_RTIT_CTL.InjectPsbPmiOnEnable\[56\] = 1 将确保在 PT 被禁用时挂起的 PSB+ 将通过设置 IA32_RTIT_STATUS.PendPSB\[6\] = 1 被记录。当稍后在 PendPSB = 1 时重新启用 PT，将插入 PSB，且清除 PendPSB。

注意溢出可以在 PSB+ 期间发生，这可能导致 PSBEND 数据包丢失。因此，OVF 数据包也应被视为终止 PSB+。如果 IA32_RTIT_STATUS.TriggerEn 恰好在达到 PSB 阈值时被清除，PSB+ 可能不被生成。TriggerEn 可以由清除 IA32_RTIT_CTL.TraceEn 的 WRMSR、清除 IA32_RTIT_CTL.TraceEn 的 VM 退出、#SMI、或任何设置 IA32_RTIT_STATUS.Stopped（例如，由 TraceStop 或 ToPA 停止条件）或设置 IA32_RTIT_STATUS.Error（例如，由 Intel PT 输出错误）的时间清除。在支持 PSB 保留（CPUID.14H.00H:EBX\[6\] = 1）的处理器上，设置 IA32_RTIT_CTL.InjectPsbPmiOnEnable\[56\] = 1 将确保在 PT 被禁用时挂起的 PSB+ 将通过设置 IA32_RTIT_STATUS.PendPSB\[6\] = 1 被记录。然后当保存的 PT 上下文稍后被恢复时 PSB 将被挂起。

### 36.3.8 内部缓冲区溢出

在罕见情况下，当需要生成新数据包但处理器的专用内部缓冲区都满了时，发生"内部缓冲区溢出"。在此类溢出时数据包生成停止（因为数据包需要进入处理器的内部缓冲区）直到溢出解决。一旦解决，数据包生成恢复。

当缓冲区溢出被清除时，生成 OVF 数据包（第 36.4.2.16 节），且处理器确保 OVF 之后的数据包不针对丢失的数据包压缩（IP 压缩或 RET 压缩）。

如果 IA32_RTIT_CTL.BranchEn = 1，如果溢出在 PacketEn=1 时解决，OVF 数据包将后跟 FUP。如果溢出在 PacketEn = 0 时解决，不生成数据包，但一旦 PacketEn = 1，稍后将自然生成 TIP.PGE。FUP 或 TIP.PGE 的载荷将是溢出被清除后追踪恢复的第一条指令的当前 IP。如果溢出在 PacketEn=1 时解决，仅定时数据包可以在 OVF 和 FUP 之间。如果溢出在 PacketEn=0 时解决，任何不依赖 PacketEn 的其他数据包可以在 OVF 和 TIP.PGE 之间。

#### 36.3.8.1 溢出对启用的影响

对 ADDRn 范围的地址比较（用于 IP 过滤和 TraceStop）（第 36.2.5.3 节）在缓冲区溢出期间继续，且 TriggerEn、ContextEn 和 FilterEn 可以在缓冲区溢出期间更改。然而，像其他数据包一样，将已生成的任何 TIP.PGE 或 TIP.PGD 数据包将丢失。此外，IA32_RTIT_STATUS.PacketByteCnt 将不递增，因为它仅在生成数据包时递增。

如果在缓冲区溢出期间发生 TraceStop 事件，IA32_RTIT_STATUS.Stopped 仍将被设置，追踪将因此停止。然而，TraceStop 数据包和由 TraceStop 导致的任何 TIP.PGD 可能被丢弃。

#### 36.3.8.2 溢出对定时数据包的影响

在缓冲区溢出期间生成的任何定时数据包将被丢弃。如果仅丢弃几个 MTC 数据包，解码器应能够通过注意到缓冲区溢出后第一个 MTC 数据包中的时间值递增超过一来检测此情况。如果缓冲区溢出持续足够长以至于丢失 256 个 MTC 数据包（因此 MTC 数据包"环绕"其 8 位 CTC 值），则解码器可能无法正确理解追踪。这不是预期场景。即使在周期计数器环绕时，溢出期间也不生成 CYC 数据包。

注意，如果启用周期精确模式，OVF 数据包将生成 CYC 数据包。因为周期计数器在溢出期间计数，此 CYC 数据包可以提供溢出的持续时间。然而，存在周期计数器在溢出期间环绕的风险，这可能使此 CYC 误导。

### 36.3.9 TNT 禁用

软件可以通过设置 IA32_RTIT_CTL.DisTNT\[bit 55\] 选择从控制流追踪（BranchEn=1）中省略 TNT 数据包。这可以大幅减少追踪大小。结果随工作负载变化，但追踪大小减少 40-75% 是典型的，这将相应减少来自 Intel PT 的性能开销和内存带宽消耗。然而，省略 TNT 数据包意味着解码器不能跟随完整控制流追踪，因为条件分支和压缩 RET 结果将未知。因此，TNT 禁用应仅用于不依赖完整控制流追踪的用途。

**注**

为避免 TNT 禁用时丢失 RET 结果，软件可能希望设置 IA32_RTIT_CTL.DisRETC\[bit 11\] 禁用 RET 压缩。

### 36.3.10 操作错误

错误作为数据包输出配置问题的结果被检测到，其可以包括输出对齐问题、ToPA 保留位违规或数据包输出与受限内存重叠。见第  
36.2.7.2 节了解 ToPA 错误的细节，见第 36.2.7.4 节了解受限内存错误的细节。仅当 TraceEn=1 时检测和发信号操作错误。

当检测到操作错误时，追踪被禁用且错误被记录。具体来说，设置 IA32_RTIT_STATUS.Error，这将导致 IA32_RTIT_STATUS.TriggerEn 为 0。这将禁用所有数据包的生成。操作错误的一些原因可能导致数据包字节被丢弃。

应注意错误检测的时机可能不可预测。错误在处理器遇到有问题的配置时发信号。这可能是在数据包生成被启用时很快发生，但也可能稍后当有问题的条目或字段需要被使用时发生。

一旦发信号错误，软件应通过清除 TraceEn 禁用数据包生成，诊断并修复错误条件，并清除 IA32_RTIT_STATUS.Error。此时，数据包生成可以重新启用。

## 36.4 追踪数据包和数据类型

本节详述由 Intel 处理器追踪生成的数据包。它对编写将解码数据包并将其应用于被追踪源代码的解释代码的开发人员有用。

### 36.4.1 数据包关系和排序

本节介绍数据包"绑定"的概念，其涉及确定二进制反汇编中给定数据包指示的更改所适用的 IP。一些数据包将关联 IP 作为载荷（FUP、TIP），而对于其他，解码器仅需搜索特定指令（或指令）的下一个实例以绑定数据包（TNT）。然而，在许多情况下，解码器将需要考虑数据包之间的关系，并使用此数据包上下文确定如何绑定数据包。

下面第 36.4.1.1 节提供数据包的详细描述，包括数据包如何绑定到反汇编中的 IP、其他数据包或什么也不绑定。列出的许多数据包易于绑定，因为它们仅在少数场景中生成。那些需要更多考虑的通常是"复合数据包事件"的一部分，如中断、异常和一些指令，其中单个操作（指令或事件）生成多个数据包。这些复合数据包事件经常以 FUP 开始以指示源地址（如果从反汇编中不清楚），并由指示目标地址（如果提供）的 TIP 或 TIP.PGD 数据包结束。在此场景中，FUP 被称为与 TIP 数据包"耦合"。

其他数据包可以在耦合的 FUP 和 TIP 数据包之间。TSC、MTC、CYC 或 CBR 等定时数据包可以随时到达，因此可以在复合数据包事件中插入。如果操作更改 CR3 或处理器的执行模式，生成状态更新数据包（即，PIP 或 MODE）。这些中间数据包指示的状态更改应在 TIP\* 数据包的 IP 处应用。复合数据包事件的总结在表 36-14 中提供；每个数据包的更多细节见第 36.4.1.1 节，更详细的数据包生成示例见第 36.8 节。

**表 36-14. 复合数据包事件总结**

| 事件类型 | 开始  | 中间  | 结束  | 注释  |
| --- | --- | --- | --- | --- |
| 无条件、非压缩控制流转移 | FUP 或无 | PIP、VMCS、MODE.Exec 的任何组合或无 | TIP 或 TIP.PGD | FUP 仅用于异步事件。中间数据包的顺序可能变化。PIP/VMCS/MODE 仅当操作修改由这些相应数据包跟踪的状态时。 |
| TSX 更新 | MODE.TSX，和（FUP 或无） | 无   | TIP、TIP.PGD 或无 | FUP。TIP/TIP.PGD 仅用于 TSX 中止情况。 |
| 溢出  | OVF | PSB、PSBEND 或无 | FUP 或 TIP.PGE | 如果溢出在 ContextEn=1 时解决则 FUP，否则 TIP.PGE。 |

#### 36.4.1.1 数据包块

数据包块是转储一个或多个状态值组的手段。数据包块以块开始数据包（BBP）开始，其指示块内持有的状态类型。在每个 BBP 之后可以有一个或多个块项数据包（BIP），其包含状态值。块由块结束数据包（BEP）或指示新块开始的另一个 BBP 终止。

BIP 数据包包括 ID 值，当与先于它的 BBP 中的 Type 字段组合时，唯一标识 BIP 载荷中持有的状态值。每个 BIP 数据包载荷的大小由前面 BBP 数据包中的 Size 字段提供。

每个块类型可以为它定义至多 32 个项目。然而，不保证该类型的每个块将持有所有 32 个项目。期望哪些项目的更多细节见感兴趣的特定块类型的文档。

数据包块生成场景的细节见 BBP 数据包描述（第 36.4.2.26 节）。

数据包块完全在指令内或指令之间生成，这规定了在数据包块内可能看到的（除 BIP 外的）数据包类型。指示控制流更改或其他指令完成指示的数据包不能在块内生成。这些列在下表中。包括定时数据包在内的其他数据包可以在 BBP 和 BEP 之间发生。

**表 36-15. BBP 和 BEP 之间禁止的数据包**

|     |
| --- |
| TNT |
| TIP、TIP.PGE、TIP.PGD |
| MODE.Exec、MODE.TSX |
| PIP、VMCS |
| TraceStop |
| PSB、PSBEND |
| PTW |
| MWAIT |

可能在块中间遇到内部缓冲区溢出。在此类情况下，保证数据包生成不会在块中间恢复，因此 OVF 数据包终止当前块。取决于溢出的持续时间，后续块也可能丢失。

**解码器影响**

当遇到块开始数据包（BBP）时，解码器将需要与块外不同的方式解码块内的一些数据包。块项数据包（BIP）头字节与块外 TNT 数据包具有相同编码，但在块内必须被处理为 BIP 头（带后续载荷）。

当遇到 OVF 数据包时，解码器应将其视为块结束条件。数据包生成不会在块内恢复。

### 36.4.2 数据包定义

以下数据包定义的描述采用表格格式。图 36-3 解释如何解释它们。列为"RSVD"的数据包位不保证为 0。

**图 36-3. 解释数据包格式的表格式定义**

```python
名称：数据包名称
格式：
  字节号 位号  7  6  5  4  3  2  1  0
  0           0  1  0  1  0  1  0  1    ← 头位为绿色
  1           0  1  1  1  0  0  0  1    ← 载荷为白色
  2           0  1  0  0  0  1  1  0
字段描述
依赖：取决于数据包生成配置启用控制或其他位（第 36.2.6 节）。
生成场景：哪些指令、事件或其他场景可以导致生成此数据包。
描述：数据包的描述，包括其服务的目的、信息或载荷的含义等。
应用：解码器应如何应用此数据包。它可以绑定到来自二进制的特定指令，或流中的另一个数据包，或对解码有其他影响。
```

#### 36.4.2.1 采取/未采取（TNT）数据包

**表 36-16. TNT 数据包定义**

| 名称  | 采取/未采取（TNT）数据包 |
| --- | --- |
| 格式  | 短 TNT：字节 0：0 1 B1 B2 B3 B4 B5 B6。长 TNT：字节 0-7（见下图）。 |
| 字段描述 | B1…BN 表示最后 N 个条件分支或压缩 RET（第 36.4.2.2 节）的结果，使得 B1 最旧且 BN 最新。短 TNT 数据包可以包含 1 到 6 个 TNT 位。长 TNT 数据包可以包含 1 到 47 个 TNT 位。 |

```python
短 TNT：
  位号 7  6  5  4  3  2  1  0
  字节0  0  1  B1 B2 B3 B4 B5 B6

长 TNT：
  位号 7  6  5  4  3  2  1  0
  字节0  0  0  0  0  0  0  0  1
  字节1  1  0  1  0  0  0  1  1
  字节2  B40 B41 B42 B43 B44 B45 B46 B47
  字节3  B32 B33 B34 B35 B36 B37 B38 B39
  字节4  B24 B25 B26 B27 B28 B29 B30 B31
  字节5  B16 B17 B18 B19 B20 B21 B22 B23
  字节6  B8  B9  B10 B11 B12 B13 B14 B15
  字节7  1   B1  B2  B3  B4  B5  B6  B7
```

无论数据包中有多少个 TNT 位，最后一个有效 TNT 位后跟尾部 1，或停止位，如上所示。如果 TNT 数据包不满（短 TNT 少于 6 个 TNT 位，或长 TNT 少于 47 个 TNT 位），停止位移上，且数据包的尾部位被 0 填充。这些"部分 TNT"的示例如下所示。实现可以选择使用长 TNT、短 TNT或两者。

```python
部分短 TNT：
  位号 7  6  5  4  3  2  1  0
  字节0  0  0  0  1  B1 B2 B3 B4

部分长 TNT：
  位号 7  6  5  4  3  2  1  0
  字节0  0  0  0  0  0  0  0  1
  字节1  1  0  1  0  0
```

```python
  位号 7  6  5  4  3  2  1  0
  字节0  0  0  0  0  0  0  0  1
  字节1  1  0  1  0  0  0  1  1
  字节2  B24 B25 B26 B27 B28 B29 B30 B31
  字节3  B16 B17 B18 B19 B20 B21 B22 B23
  字节4  B8  B9  B10 B11 B12 B13 B14 B15
  字节5  1   B1  B2  B3  B4  B5  B6  B7
  字节6  0  0  0  0  0  0  0  0
  字节7  0  0  0  0  0  0  0  0
```

| 依赖  | PacketEn 且非 IA32_RTIT_CTL.DisTNT |
| --- | --- |
| 生成场景 | 在条件分支或压缩 RET 上，如果它填满 TNT。此外，部分 TNT 可以在任何时间生成，作为生成其他数据包或某些微架构条件在 TNT 被填满之前发生的结果。 |
| 描述  | 提供最后 1..6（短 TNT）或 1..47（长 TNT）个条件分支（Jcc、J*CXZ 或 LOOP）或压缩 RET（第 36.4.2.2 节）的采取/未采取结果。TNT 载荷位应被解释如下：1 指示采取的条件分支或压缩 RET；0 指示未采取的条件分支。TNT 载荷位被存储在处理器内部的 TNT 缓冲区中，直到缓冲区被填满或另一个数据包将被生成。在任一情况下，将发出持有缓冲位的 TNT 数据包，且 TNT 缓冲区将被标记为空。 |
| 应用  | 每个有效载荷位（即，头位和尾部停止位之间的位）适用于即将到来的条件分支或 RET 指令。一旦解码器消费带 N 个有效载荷位的 TNT 数据包，这些位应被应用于（从而为）接下来的 N 个条件分支或 RET 提供目标。 |

#### 36.4.2.2 目标 IP（TIP）数据包

**表 36-17. TIP 数据包定义**

| 名称  | 目标 IP（TIP）数据包 |
| --- | --- |
| 格式  | 字节 0：IPBytes 0 1 1 0 1 1；字节 1：TargetIP\[7:0\]；字节 2：TargetIP\[15:8\]；字节 3：TargetIP\[23:16\]；字节 4：TargetIP\[31:24\]；字节 5：TargetIP\[39:32\]；字节 6：TargetIP\[47:40\]；字节 7：TargetIP\[55:48\]；字节 8：TargetIP\[63:56\] |
| 依赖  | PacketEn |
| 生成场景 | 间接分支（包括非压缩 RET）、远分支、中断、异常、INIT、SIPI、VM 退出、VM 进入、TSX 中止、EENTER、EEXIT、ERESUME、AEX¹。 |
| 描述  | 为一些控制流转移提供目标。 |
| 应用  | 任何时候遇到 TIP，它指示控制被转移到载荷中提供的 IP。此控制流更改的源（以及因此它绑定的 IP 或指令）取决于先于 TIP 的数据包。如果遇到 TIP 且所有先前数据包已被绑定，则 TIP 将适用于即将到来的间接分支、远分支或 VMRESUME。然而，如果存在保持未绑定的先前 FUP，它将绑定到 TIP。这里，TIP 提供在 FUP 载荷中给定的 IP 处发生的异步事件或 TSX 中止的目标。注意除了 FUP 外，可以有将绑定到 TIP 数据包的其他数据包。细节见其他数据包的数据包应用描述。 |

**注：**

1.  EENTER、EEXIT、ERESUME、AEX 仅对于调试飞地可能。

**IP 压缩**

TIP、FUP、TIP.PGE 或 TIP.PGD 数据包中的 IP 载荷可以根据执行模式和使用 IP 压缩而变化大小。IP 压缩是处理器可以选择采用以减少带宽的可选压缩技术。使用 IP 压缩，要表示在载荷中的 IP 与最后发送出的 IP（通过 FUP、TIP、TIP.PGE 或 TIP.PGD 任何）比较。如果那个先前 IP 具有相同的上部（最高有效）地址字节，那些匹配字节可以在当前数据包中被抑制。处理器维护已编码在追踪数据包中的"Last IP"的内部状态，因此解码器将需要在软件中跟踪"Last IP"状态，以匹配硬件生成的数据包的保真度。"Last IP"被初始化为零，因此如果追踪中第一个 IP 的上部字节为零，它可能被压缩。

IP 数据包（FUP、TIP、TIP.PGE、TIP.PGD）的"IPBytes"字段用于指示提供了多少字节的载荷，以及解码器应如何填充任何被抑制的字节。为 TIP/FUP 数据包重建 IP 的算法如下表所示。

**表 36-18. FUP/TIP IP 重建**

| IPBytes | 非压缩 IP 值 |
| --- | --- |
|     | 63:56 |
| 000b | 无，IP 在上下文外 |
| 001b | Last IP\[63:16\] |
| 010b | Last IP\[63:32\] |
| 011b | IP 载荷\[47\] 扩展 |
| 100b | Last IP\[63:48\] |
| 101b | 保留  |
| 110b | IP 载荷\[63:0\] |
| 111b | 保留  |

当发送出 PSB 时，保证处理器内部 Last IP 状态被重置为零。这意味着 PSB 之后的 IP 要么非压缩（011b 或 110b，见表 36-18），要么针对零压缩。

有时，"IPBytes"将具有值 0。如上所示，这并不意味着 IP 载荷匹配最后一个 IP 的完整地址，而是此数据包的 IP 被抑制。这用于适用于数据包的 IP 在上下文外的情况。一个例子是仅追踪 USR 代码时在 SYSCALL 上发送的 TIP.PGD。在此情况下，数据包中将不包含 TargetIP，因为那将暴露 CPL = 0 的指令点。当 IP 载荷以此方式被抑制时，Last IP 不被清除，而是指具有非零 IPBytes 字段的最后一个 IP 数据包。

在支持最大线性地址大小为 32 位的处理器上，IP 载荷可能永不超32位（IPBytes <= 010b）。

**返回的间接转移压缩（RET）**

除 IP 压缩外，近返回（RET）指令的 TIP 数据包也可以被压缩。如果 RET 目标匹配相应 CALL 的下一个 IP，则不需要 TIP 数据包，因为解码器可以通过维护自己的 CALL/RET 栈推断目标 IP。

当压缩 RET 时，将采取指示添加到 TNT 缓冲区。因为 RET 不生成 TIP 数据包，它也不更新内部 Last IP 值，因此解码器应以相同方式处理它。如果 RET 不被压缩，它将生成 TIP 数据包（就像通过 IA32_RTIT_CTL.DisRETC 禁用 RET 压缩时一样）。

解码器可以通过以下维护 CALL/RET 栈：

1.  分配空间存储 64 个 RET 目标。
2.  对于近 CALL，将 Next IP 推入栈。一旦栈满，新 CALL 将强制最旧条目从栈尾出栈，使得仅存储最新的 64 个条目。注意这排除零长度 CALL，即位移为零（到下一个 IP）的直接近 CALL。这些 CALL 通常没有匹配的 RET。
3.  对于近 RET，从栈弹出顶部（最新）条目。这将是 RET 的预期目标。

在压缩 RET 的情况下，RET 目标保证匹配上面 3）的预期目标。如果目标不被压缩，将生成带 RET 目标的 TIP 数据包，在某些情况下其可能不同于预期目标。

硬件确保解码器读取的数据包将总是已看到与任何压缩 RET 对应的 CALL。处理器将永不在 PSB、缓冲区溢出或 PacketEn=0 的场景中跨这些压缩 RET。这意味着其对应 CALL 在 PacketEn=0 时或最后一个 PSB 之前等执行的 RET 将不被压缩。

如果 CALL/RET 栈被软件操纵或破坏，从而导致 RET 将控制转移到与 CALL/RET 栈不一致的目标，则 RET 将不被压缩，并将产生 TIP 数据包。例如，如果软件执行 PUSH 指令将目标推入栈，且稍后 RET 使用此目标，这可能发生。

对于采用延迟 TIP（第 36.4.2.3 节）的处理器，非压缩 RET 将不被延迟，因此将强制输出任何累积的 TNT 或 TIP。这用于避免歧义，并向解码器明确近 RET 是否被压缩（因此应消费进行中 TNT 中的位），或非压缩（在此情况下将没有进行中 TNT，因此应消费 TIP）。

注意在 RET 在与关联 CALL 不同的执行模式中执行的罕见情况下，解码器将需要用其 CALL 栈模拟相同行为。例如，如果 CALL 在 64 位模式中执行，64 位 IP 值将被推入软件栈。如果相应 RET 在 32 位模式中执行，那么仅较低 32 个目标位将从栈弹出，这可能意味着 RET 不到 CALL 的 Next IP。这是架构正确行为，且此 RET 可以被压缩，因此解码器应匹配此行为。

#### 36.4.2.3 延迟 TIP

如果 CPUID.14H.00H:ECX\[1\] 被枚举为 0，处理器可以选择在生成 TIP 时延迟发送 TNT。因此，不是发送部分 TNT 后跟 TIP，两个数据包都将在 TNT 累积更多 Jcc/RET 结果时被延迟。可以以此方式累积任意数量的 TIP 数据包，使得仅当 TNT 被填满，或生成另一个数据包（例如，FUP）时，TNT 才被发送，后跟所有延迟的 TIP 数据包，最后被强制输出 TNT 和 TIP 数据包的其他数据包终止。许多其他数据包（见下面列表）的生成将强制输出 TNT 和任何累积的 TIP 数据包。这是硬件中的可选优化，以减少追踪招致的带宽消耗以及因此的性能影响。

如果 CPUID.14H.00H:ECX\[1\] 被枚举为 1，处理器将不产生延迟 TIP。

**表 36-19. 带延迟 TIP 的 TNT 示例**

| 代码流 | 非延迟 TIP 的数据包 | 延迟 TIP 的数据包 |
| --- | --- | --- |
| 0x1000 cmp %rcx, 0  <br>0x1004 jnz Foo // 未采取  <br>0x1008 jmp %rdx  <br>0x1308 cmp %rcx, 1  <br>0x130c jnz Bar // 未采取  <br>0x1310 cmp %rcx, 2  <br>0x1314 jnz Baz // 采取  <br>0x1500 cmp %eax, 7  <br>0x1504 jg Exit // 未采取  <br>0x1508 jmp %r15  <br>0x1100 cmp %rbx, 1  <br>0x1104 jg Start // 未采取  <br>0x1108 add %rcx, %eax  <br>0x110c … // 异步中断到达  <br>INThandler:  <br>0xcc00 pop %rdx | TNT(0b0), TIP(0x1308)  <br>TNT(0b010), TIP(0x1100)  <br>TNT(0b0), FUP(0x110c), TIP(0xcc00) | TNT(0b00100), TIP(0x1308), TIP(0x1100), FUP(0x110c), TIP(0xcc00) |

#### 36.4.2.4 数据包生成启用（TIP.PGE）数据包

**表 36-20. TIP.PGE 数据包定义**

| 名称  | 目标 IP - 数据包生成启用（TIP.PGE）数据包 |
| --- | --- |
| 格式  | 字节 0：IPBytes 1 0 0 0 1 1；字节 1：TargetIP\[7:0\]；字节 2：TargetIP\[15:8\]；字节 3：TargetIP\[23:16\]；字节 4：TargetIP\[31:24\]；字节 5：TargetIP\[39:32\]；字节 6：TargetIP\[47:40\]；字节 7：TargetIP\[55:48\]；字节 8：TargetIP\[63:56\] |
| 依赖  | PacketEn 转换到 1 |
| 生成场景 | 设置 PacketEn 的任何分支指令、控制流转移或 MOV CR3，启用数据包生成并设置 PacketEn 的 WRMSR |
| 描述  | 指示 PacketEn 已转换到 1。它提供追踪开始的 IP。这可以由于组成 PacketEn 的任何启用从 0 转换到 1（只要所有其他被断言）而发生。示例： |

-   **TriggerEn**：只要 IA32_RTIT_STATUS 中的 Stopped 和 Error 位被清除，这通过软件写设置 IA32_RTIT_CTL.TraceEn 时被设置。IP 载荷将是 WRMSR 的下一个 IP。
-   **FilterEn**：当软件跳入追踪区域时设置。此区域通过在 IA32_RTIT_CTL.ADDRn_CFG 中启用 IP 过滤并在 IA32_RTIT_ADDRn\_\[AB\] 中定义范围来定义，见第 36.2.5.3 节。IP 载荷将是分支的目标。
-   **ContextEn**：这在 CPL 更改、CR3 写或更改 ContextEn 的任何其他手段时设置。如果更改上下文的指令不是分支，IP 载荷将是该指令的下一个 IP，否则将是分支的目标。

**应用**：TIP.PGE 数据包绑定到载荷中给定 IP 处的指令。

#### 36.4.2.5 数据包生成禁用（TIP.PGD）数据包

**表 36-21. TIP.PGD 数据包定义**

| 名称  | 目标 IP - 数据包生成禁用（TIP.PGD）数据包 |
| --- | --- |
| 格式  | 字节 0：IPBytes 0 0 0 0 1 1；字节 1：TargetIP\[7:0\]；字节 2：TargetIP\[15:8\]；字节 3：TargetIP\[23:16\]；字节 4：TargetIP\[31:24\]；字节 5：TargetIP\[39:32\]；字节 6：TargetIP\[47:40\]；字节 7：TargetIP\[55:48\]；字节 8：TargetIP\[63:56\] |
| 依赖  | PacketEn 转换到 0 |
| 生成场景 | 清除 PacketEn 的任何分支指令、控制流转移或 MOV CR3，禁用数据包生成并清除 PacketEn 的 WRMSR |
| 描述  | 指示 PacketEn 已转换到 0。它将包括追踪结束的 IP，除非在清除 PacketEn 的指令或事件结束时 ContextEn= 0 或 TraceEn=0。 |

PacketEn 可以由于组成 PacketEn 的任何启用从 1 转换到 0 而被清除。示例：

-   **TriggerEn**：这在软件写清除 IA32_RTIT_CTL.TraceEn 时，或当设置 IA32_RTIT_STATUS.Stopped 时，或在操作错误时被清除。在此情况下 IP 载荷将被抑制，且"IPBytes"字段将具有值 0。
-   **FilterEn**：当软件跳出追踪区域时清除。此区域通过在 IA32_RTIT_CTL.ADDRn_CFG 中启用 IP 过滤并在 IA32_RTIT_ADDRn\_\[AB\] 中定义范围来定义，见第 36.2.5.3 节。IP 载荷将取决于分支的类型。对于条件分支，载荷被抑制（IPBytes = 0），且在此情况下可以从反汇编推断目的地。对于任何其他类型的分支，IP 载荷将是分支的目标。
-   **ContextEn**：这可以在 CPL 更改、CR3 写或更改 ContextEn 的任何其他手段时发生。细节见第 36.2.5.3 节。在此情况下，当 ContextEn 被清除时，将没有 IP 载荷。"IPBytes"字段将具有值 0。

注意，在通常会产生 TIP 数据包（即，远转移、间接分支、中断等）或 TNT 更新（条件分支或压缩 RET）的分支导致 PacketEn 从 1 转换到 0 的情况下，TIP 或 TNT 位将被 TIP.PGD 替换。TIP.PGD 的载荷将是分支的目标，除非指令的结果导致 TraceEn 或 ContextEn 被清除（即，当 IA32_RTIT_CTL.OS=0 时的 SYSCALL）。在条件分支清除 FilterEn 且因此清除 PacketEn 的情况下，此分支将没有 TNT 位，而是被 TIP.PGD 替换。

**应用**：TIP.PGD 可以由清除 PacketEn 的任何分支指令以及一些非分支指令产生。当由分支产生时，它替换分支通常产生的任何 TIP 或 TNT 更新。在 TIP.PGD 之前有未绑定 FUP 的情况下，TIP.PGD 是清除 PacketEn 的复合操作（即，异步事件或 TSX 中止）的一部分。对于大多数此类情况，TIP.PGD 只是替换 TIP，且应以相同方式处理。TIP.PGD 可以有或没有 IP 载荷，取决于操作是否清除 ContextEn。如果没有关联的 FUP，绑定将取决于是否有 IP 载荷。如果有 IP 载荷，则 TIP.PGD 应应用于其目标匹配 TIP.PGD 载荷的下一个直接分支，或下一个通常生成 TIP 或 TNT 数据包的分支。如果没有 IP 载荷，则 TIP.PGD 应适用于下一个分支或 MOV CR3 指令。

#### 36.4.2.6 流更新（FUP）数据包

**表 36-22. FUP 数据包定义**

| 名称  | 流更新（FUP）数据包 |
| --- | --- |
| 格式  | 字节 0：IPBytes 1 1 1 0 1 1；字节 1：IP\[7:0\]；字节 2：IP\[15:8\]；字节 3：IP\[23:16\]；字节 4：IP\[31:24\]；字节 5：IP\[39:32\]；字节 6：IP\[47:40\]；字节 7：IP\[55:48\]；字节 8：IP\[63:56\] |
| 生成场景 | 异步事件（中断、异常、INIT、SIPI、SMI、VM 退出、#MC）、PSB+、XBEGIN、XEND、XABORT、XACQUIRE、XRELEASE、EENTER、EEXIT、ERESUME、EEE、AEX¹、INTO、INT1、INT3、INT n、禁用数据包生成的 WRMSR。此外，当启用 FRED 转换时，SYSCALL 和 SYSENTER。 |
| 依赖  | TriggerEn 且 ContextEn。（通常也取决于 BranchEn 和 FilterEn，细节见第 36.2.5 节、第 36.4.2.21 节和第 36.4.2.22 节。） |
| 描述  | 为异步事件和一些其他指令提供源地址。永不单独发送，总是与关联的 TIP 或 MODE 数据包以及潜在地其他一起发送。 |
| 应用  | FUP 数据包提供它们绑定的 IP。然而，它们永不是独立的，而是与其他数据包耦合。在 TSX 情况下，FUP 立即前有绑定到相同 IP 的 MODE.TSX。仅在 TSX 中止的情况下将跟随 TIP，细节见第 36.4.2.8 节。否则，FUP 是复合数据包事件（见第 36.4.1 节）的一部分。在这些复合情况下，FUP 为指令或事件提供源 IP，而后续 TIP（或 TIP.PGD）数据包将提供目标 IP。复合事件中可以在 FUP 和 TIP 之间包括其他数据包。 |

**注：**

1.  EENTER、EEXIT、ERESUME、EEE、AEX 仅当支持 Intel 软件防护扩展时适用。

**FUP IP 载荷**

流更新数据包在需要时给出指令的源地址。一般来说，分支指令不需要 FUP，因为源地址从反汇编中清晰。然而，对于异步事件，源地址不能从源推断，因此将发送 FUP。表 36-23 说明发送 FUP 的情况，以及那些情况中可以预期的 IP。

**表 36-23. FUP 情况和 IP 载荷**

| 事件  | 流更新 IP | 注释  |
| --- | --- | --- |
| 外部中断、NMI/SMI、陷阱、机器检查（陷阱类）、INIT/SIPI | 本将被执行的下一条指令（Next IP）的地址 | 功能上，这匹配 LBR FROM 字段值，也匹配被保存到栈上的 EIP 值。 |
| 异常/故障、机器检查（故障类） | 采取异常/故障的指令的地址（当前 IP） | 这匹配 LBR FROM 字段值的类似功能，也匹配被保存到栈上的 EIP 值。 |
| 软件中断（以及启用 FRED 转换时的 SYSCALL 和 SYSENTER） | 软件中断指令的地址（当前 IP） | 这匹配 LBR FROM 字段值的类似功能，但不匹配被保存到栈上的 EIP 值（下一个线性指令指针 - NLIP）。 |
| EENTER、EEXIT、ERESUME、飞地退出事件（EEE）、AEX¹ | 指令的当前 IP | 这匹配 LBR FROM 字段值，也匹配被保存到栈上的 EIP 值。 |
| XACQUIRE | X\* 指令的地址 |     |
| XRELEASE、XBEGIN、XEND、XABORT、其他事务中止 | 当前 IP |     |
| #SMI | 被保存到 SMRAM 的 IP |     |
| 清除 TraceEn 的 WRMSR、PSB+ | 当前 IP |     |

**注：**

1.  EENTER、EEXIT、ERESUME、EEE、异步飞地退出（AEX）的信息可以在《Intel® 64 和 IA-32 架构软件开发手册》第 3D 卷中找到。

在由于顺序获取非规范空间中的指令（而不是跳转到非规范空间）导致的规范故障上，故障的 IP（以及因此 FUP 的载荷）将是非规范地址。这与此类故障情况推入栈的内容一致。

如果有提交后任务切换故障，FUP 的 IP 值将是任务切换开始时的原始 IP。这与 LBR_FROM 字段中看到的值相同。但它是与保存在栈或 VMCS 上不同的值。

#### 36.4.2.7 分页信息（PIP）数据包

**表 36-24. PIP 数据包定义**

| 名称  | 分页信息（PIP）数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 0 1 0 0 0 0；字节 2：CR3\[11:5\] 或 0, RSVD/NR；字节 3：CR3\[19:12\]；字节 4：CR3\[27:20\]；字节 5：CR3\[35:28\]；字节 6：CR3\[43:36\]；字节 7：CR3\[51:44\] |
| 依赖  | TriggerEn 且 ContextEn 且 IA32_RTIT_CTL.OS |
| 生成场景 | MOV CR3、任务切换、INIT、SIPI、PSB+、VM 退出、VM 进入 |
| 描述  | 所示 CR3 载荷仅包括 CR3 值的地址部分。对于 PAE 分页，因此包括 CR3\[11:5\]。对于其他分页模式（32 位和 4 级分页¹），这些位为 0。 |

此数据包持有 CR3 地址值。它将在修改 CR3 的操作上生成：

-   MOV CR3 操作
-   任务切换
-   INIT 和 SIPI
-   VM 退出，如果"conceal VMX from PT" VM 退出控制为 0（见第 36.5.1 节）
-   VM 进入，如果"conceal VMX from PT" VM 进入控制为 0

尽管 CR3 更改，在 SMI 和 RSM 上不生成 PIP。这是由于这些操作的特殊行为，细节见第 36.2.9.3 节。注意，对于不修改 CR3 的一些任务切换情况，将不产生 PIP。

PIP 的目的是向解码器指示正在运行哪个应用程序，以便它可以对正在被追踪的线性地址应用正确的二进制。

当写入 CR3 时，PIP 数据包包含新的 CR3 值。

VM 进入生成的 PIP 设置 NR 位。在 VMX 非根操作中生成的 PIP 在"conceal VMX from PT" VM 执行控制为 0 时设置 NR 位（见第 36.5.1 节）。所有其他 PIP 清除 NR 位。

**应用**：PIP 数据包的目的是帮助解码器在任何给定时间唯一标识正在运行的软件。当遇到 PIP 时，解码器应执行以下操作：1）如果存在先前的未绑定 FUP（即，前面没有消费它的数据包（如 MODE.TSX），且因此它与尚未看到的 TIP 配对），则此 PIP 是复合数据包事件（第 36.4.1 节）的一部分。找到结束 TIP 并将新的 CR3/NR 值应用于 TIP 载荷 IP。2）否则，在反汇编中查找下一个 MOV CR3、远分支或 VMRESUME/VMLAUNCH，并将新 CR3 应用于下一个（或目标）IP。这些流生成的数据包示例见第 36.8 节。

**注：**

1.  本手册的早期版本使用术语"IA-32e paging"标识 4 级分页。

#### 36.4.2.8 MODE 数据包

MODE 数据包让解码器了解它需要知道的各处理器模式，以便正确管理数据包输出或正确反汇编关联二进制。MODE 数据包包括头和模式字节，如下所示。

**表 36-25. MODE 数据包的一般形式**

```python
  位号 7  6  5  4  3  2  1  0
  字节0  1  0  0  1  1  0
```

```python
  字节0  1  0  0  1  1  0  0  1
  字节1  1  叶 ID  模式
```

MODE 叶 ID 指示低比特位中持有哪组模式位。

**MODE.Exec 数据包**

**表 36-26. MODE.Exec 数据包定义**

| 名称  | MODE.Exec 数据包 |
| --- | --- |
| 格式  | 字节 0：1 0 0 1 1 0 0 1；字节 1：1 0 0 0 保留 IF CS.D (CS.L & LMA)。MODE 叶 ID 为 '000。 |
| 依赖  | TriggerEn 且 ContextEn 且 FilterEn |
| 生成场景 | 如果 IA32_RTIT_CTL.BranchEn=1，更改 CS.L、CS.D 或 EFER.LMA 的任何操作。如果 IA32_RTIT_CTL.EventEn=1，更改 RFLAGS.IF 的任何操作。任何 TIP.PGE 场景，使得自最后一个 MODE.Exec 以来任何被跟踪的模式位可能已更改。 |
| 描述  | 通过提供 CS.D 和 (CS.L & IA32_EFER.LMA) 值指示软件是在 16、32 或 64 位模式。对解码器正确反汇编关联二进制至关重要。此外，如果 CPUID.14H.00H:EBX\[7\]=1（"Event Trace Support"），它通过提供 RFLAGS.IF 值指示中断何时被屏蔽。 |

MODE.Exec 在模式更改时发送，如果那时满足依赖，否则在追踪恢复时发送。在前者情况下，MODE.Exec 数据包与由更改模式的操作产生的其他数据包一起生成，且保证对于分支操作后跟 TIP 或 TIP.PGE，或对于非分支操作（CLI、STI 或如果 EventEn=1 时的 POPF）后跟 FUP。在过滤依赖不满足时模式更改的情况下，处理器通过一旦追踪恢复（在 TIP.PGE 之前，如果 BranchEn=1）发送任何需要的 MODE.Exec 确保解码器不丢失模式的跟踪。如果模式匹配最后一个 MODE.Exec 数据包的模式，处理器可以选择在追踪恢复时抑制 MODE.Exec。

仅当启用控制流追踪（BranchEn=1）时，在 CS.L、CS.D 或 EFER.LMA 更改时生成 MODE.Exec 数据包。这对解码器正确反汇编关联二进制至关重要。

| CS.D | (CS.L & IA32_EFER.LMA) | 寻址模式 |
| --- | --- | --- |
| 1   | 1   | N/A |
| 0   | 1   | 64 位模式 |
| 1   | 0   | 32 位模式 |
| 0   | 0   | 16 位模式 |

仅当启用事件追踪（EventEn=1）时，在中断标志（RFLAGS.IF）更改时生成 MODE.Exec 数据包。仅当 EventEn=1 时填充 MODE.Exec 数据包中的 IF 字段（IF = EFLAGS.IF & EventEn）。

**应用**：MODE.Exec 总是先于 IP 数据包（TIP、TIP.PGE 或 FUP）。模式更改适用于 IP 数据包载荷中的 IP 地址。当 MODE.Exec 后跟 FUP 时，它是独立 FUP 且应由 MODE.Exec 消费。

**MODE.TSX 数据包**

**表 36-27. MODE.TSX 数据包定义**

| 名称  | MODE.TSX 数据包 |
| --- | --- |
| 格式  | 字节 0：1 0 0 1 1 0 0 1；字节 1：1 0 0 1 0 0 0 0；字节 2：TXAbort InTX（保留填充）。 |
| 依赖  | TriggerEn 且 ContextEn |
| 生成场景 | XBEGIN、XEND、XABORT、XACQUIRE、XRELEASE（如果 InTX 更改）、异步 TSX 中止、PSB+ |
| 描述  | 指示 TSX 事务（HLE 或 RTM）何时开始、提交或中止。如果事务被中止，以事务方式执行的指令将被"回滚"。 |

| TXAbort | InTX | 含义  |
| --- | --- | --- |
| 1   | 1   | N/A |
| 0   | 1   | 事务开始，或以事务方式执行 |
| 1   | 0   | 事务中止 |
| 0   | 0   | 事务提交，或不以事务方式执行 |

**应用**：如果 PacketEn=1，MODE.TSX 总是立即先于 FUP。如果 TXAbort 位为零，则模式更改适用于 FUP 载荷中的 IP 地址。如果 TXAbort=1，则 FUP 后将跟 TIP，且模式更改将适用于 TIP 载荷中的 IP 地址。MODE.TSX 数据包可以在 PacketEn=0 时生成，由于 FilterEn=0。在此情况下，仅需应用在 TIP.PGE 之前生成的最后一个 MODE.TSX。

#### 36.4.2.9 TraceStop 数据包

**表 36-28. TraceStop 数据包定义**

| 名称  | TraceStop 数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 1 0 0 0 0 0；字节 2：0 1。 |
| 依赖  | TriggerEn 且 ContextEn |
| 生成场景 | 目标在 TraceStop IP 区域中的采取分支，在 TraceStop IP 区域中的 MOV CR3，或在 TraceStop IP 区域中设置 TraceEn 的 WRMSR。 |
| 描述  | 指示软件何时进入用户配置的 TraceStop 区域。当 IP 在设置 ContextEn 和 TriggerEn 时匹配 TraceStop 范围，发生 TraceStop 动作。这通过设置 IA32_RTIT_STATUS.Stopped 禁用追踪，从而清除 TriggerEn，并导致生成 TraceStop 数据包。TraceStop 动作也强制 FilterEn 为 0。注意 TraceStop 可能不强制刷新内部缓冲的数据包，因此在检查输出之前仍应通过清除 IA32_RTIT_CTL.TraceEn 手动禁用追踪数据包生成。更多细节见第 36.2.5.3 节。 |

**应用**：如果 TraceStop 后跟 TIP.PGD（在下一个 TIP.PGE 之前），那么它由清除 PacketEn 的指令触发，或由在 FilterEn=0 时执行的某个稍后指令触发。在任一情况下，TraceStop 可以在 TIP.PGD 的 IP（如果有）处应用。如果 TraceStop 后跟 TIP.PGE（在下一个 TIP.PGD 之前），它应在最后已知 IP 处应用。

#### 36.4.2.10 核心:总线比率（CBR）数据包

**表 36-29. CBR 数据包定义**

| 名称  | 核心:总线比率（CBR）数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 0 0 0 0 0 0；字节 2：核心:总线比率；字节 3：保留。 |
| 依赖  | TriggerEn |
| 生成场景 | 在任何频率更改后、在 C 状态唤醒时、PSB+ 之后，以及在启用追踪数据包生成之后。 |
| 描述  | 指示处理器核心的核心:总线比率。对关联挂钟时间和周期时间有用。 |
| 应用  | CBR 数据包指示追踪中发生频率转换的点。在一些实现上，软件执行将在转换到新频率期间继续，而在其他上软件执行在频率转换期间停止。不提供精确 IP 以绑定 CBR 数据包。 |

#### 36.4.2.11 时间戳计数器（TSC）数据包

**表 36-30. TSC 数据包定义**

| 名称  | 时间戳计数器（TSC）数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 1 1 0 0；字节 1：SW TSC\[7:0\]；字节 2：SW TSC\[15:8\]；字节 3：SW TSC\[23:16\]；字节 4：SW TSC\[31:24\]；字节 5：SW TSC\[39:32\]；字节 6：SW TSC\[47:40\]；字节 7：SW TSC\[55:48\] |
| 依赖  | IA32_RTIT_CTL.TSCEn 且 TriggerEn |
| 生成场景 | 在导致处理器时钟或 Intel PT 定时数据包（如 MTC 或 CYC）停止的任何事件后发送。这可以包括 P 状态更改、从 C 状态唤醒或时钟调制。也在 TraceEn 从 0 转换到 1 时。 |
| 描述  | 当软件启用时，TSC 数据包提供由 RDTSC 指令返回的当前 TSC 值的较低 7 个字节。这对跟踪挂钟时间以及将日志中的数据包与其他带时间戳日志同步有用。 |
| 应用  | TSC 数据包提供生成它的事件（数据包生成启用、睡眠状态唤醒等）的挂钟代理。在所有情况下，TSC 不精确指示任何控制流数据包的时间；然而，所有先前数据包代表在指示的 TSC 时间之前执行的指令，且所有后续数据包代表在它之后执行的指令。没有精确 IP 以绑定 TSC 数据包。 |

#### 36.4.2.12 迷你时间计数器（MTC）数据包

**表 36-31. MTC 数据包定义**

| 名称  | 迷你时间计数器（MTC）数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 1 0 1 1 0 |

```python
  字节0  0  0  1  0  1  1  0  1
  字节1  1  CTC[N+7:N]
```

| 依赖  | IA32_RTIT_CTL.MTCEn 且 TriggerEn |
| --- | --- |
| 生成场景 | 基于核心晶体时钟或 Always Running Timer（ART）的周期。 |
| 描述  | 当软件启用时，MTC 数据包提供挂钟时间的周期指示。8 位 CTC（公共时间戳副本）载荷值被设置为 (ART >> N) & FFH。ART 的频率与最大非 Turbo 频率相关，比率可以从 CPUID.15H 确定，如第 36.9.3 节所述。软件可以通过使用 CPUID 枚举的查找表（见第 36.3.1 节）将 IA32_RTIT_CTL.MTCFreq 字段（见第 36.2.8.2 节）设置为支持的值来选择阈值 N，其确定 MTC 频率。如何使用 MTC 载荷跟踪 TSC 时间的细节见第 36.9.3 节。 |

MTC 从 ART 提供 8 位，从由 MTCFreq 选择的位开始以规定数据包的频率。每当被监视的 8 位范围更改时，将发送带该 8 位范围新值的 MTC 数据包。这允许解码器通过跟踪发送了多少 MTC 数据包以及它们的值是什么来跟踪自最后一个 TSC 数据包被发送以来已过多少挂钟时间。解码器可以推断被截断的位 CTC\[N-1:0\] 在 MTC 数据包时为 0。

存在 MTC 数据包可能由于溢出或其他微架构条件被丢弃的情况。解码器应能够通过检查下一个 MTC 数据包的 8 位载荷（以确定丢弃了多少 MTC 数据包）从此类情况恢复。不期望曾经丢弃 >256 个连续 MTC 数据包。

**应用**：MTC 不精确指示任何其他数据包的时间，也不绑定到任何 IP。然而，所有先前数据包代表在指示的 ART 时间之前执行的指令或事件，且所有后续数据包代表在 ART 时间之后或同时执行的指令。

#### 36.4.2.13 TSC/MTC 对齐（TMA）数据包

**表 36-32. TMA 数据包定义**

| 名称  | TSC/MTC 对齐（TMA）数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 0 1 1 1 0 0；字节 2：CTC\[7:0\]；字节 3：CTC\[15:8\]；字节 4：保留 0；字节 5：FastCounter\[7:0\]；字节 6：保留 FC\[8\]。 |
| 依赖  | IA32_RTIT_CTL.MTCEn 且 IA32_RTIT_CTL.TSCEn 且 TriggerEn |
| 生成场景 | 与任何 TSC 数据包一起发送。 |
| 描述  | TMA 数据包用于提供允许解码器将 MTC 数据包与 TSC 数据包关联所需的信息。使用此数据包，当遇到 MTC 数据包时，解码器可以确定自最后一个 TSC 或 MTC 数据包以来已过多少时间戳计数器滴答。如何进行此计算的细节见第 36.9.3.2 节。 |
| 应用  | TMA 总是紧接 TSC 数据包后发送，且载荷值与 TSC 载荷值一致。因此 TMA 的应用匹配 TSC 的应用。 |

#### 36.4.2.14 周期计数（CYC）数据包

**表 36-33. 周期计数数据包定义**

| 名称  | 周期计数（CYC）数据包 |
| --- | --- |
| 格式  | 字节 0：Cycle Counter\[4:0\] Exp；字节 1：Cycle Counter\[11:5\] Exp；字节 2：Cycle Counter\[18:12\] Exp；……（如果前一个字节中 Exp = 1） |
| 依赖  | IA32_RTIT_CTL.CYCEn 且 TriggerEn |
| 生成场景 | 可以在任何时间发送，尽管每个核心时钟周期最多发送一个 CYC 数据包。CYC 合格数据包见第 36.3.6 节。 |
| 描述  | Cycle Counter 字段以与处理器核心时钟滴答相同的速率递增，但使用可变长度格式（使用尾部 EXP 位字段）和范围封顶的字节长度。如果 CYC 值小于 32，将生成带 Exp=0 的 1 字节 CYC。如果 CYC 值在 32 和 4095 之间（含），将生成 2 字节 CYC，字节 0 Exp=1 且字节 1 Exp=0。依此类推。 |

CYC 提供自最后一个 CYC 数据包以来已过的核心时钟数。CYC 可以被配置为在生成合格数据包的每个周期中发送，或软件可以选择使用阈值限制 CYC 数据包的数量，以一些精度为代价。这些设置使用 IA32_RTIT_CTL.CycThresh 字段（见第 36.2.8.2 节）配置。周期精确模式、IPC 计算等细节见第 36.3.6 节。

当 CycThresh=0（因此不使用阈值）时，将在生成任何 CYC 合格数据包的任何周期中生成 CYC 数据包。CYC 数据包将先于周期中生成的其他数据包，并提供后面数据包的精确周期时间。

除这些与其他数据包一起生成的 CYC 数据包外，CYC 数据包可以单独发送。这些数据包仅用于以已过周期数更新解码器，用于确保处理器内部周期计数器的环绕不导致周期信息丢失。这些独立 CYC 数据包不指示任何其他数据包或操作的周期时间，且将在看到任何其他 CYC 合格数据包之前后跟另一个 CYC 数据包。

当 CycThresh>0 时，仅自最后一个 CYC 数据包以来经过最小周期数后才生成 CYC 数据包。一旦此阈值已过，上面行为恢复，其中 CYC 将在产生其他 CYC 合格数据包的下一个周期中发送，或可以单独发送。

当使用 CYC 阈值时，仅生成 CYC 数据包的操作（指令或事件）的周期时间被真正知道。其他操作仅具有其执行时间有界：它们在最后 CYC 时间或之后完成，且在下一次 CYC 时间之前。

**应用**：CYC 为后面的 CYC 合格数据包提供偏移周期时间（自最后一个 CYC 数据包以来）。如果在下一个 CYC 合格数据包之前遇到另一个 CYC，周期值应被累积并应用于下一个 CYC 合格数据包。如果 CYC 数据包由 TNT 生成，注意 CYC 数据包提供的周期时间适用于 TNT 数据包中的第一个分支。

#### 36.4.2.15 VMCS 数据包

**表 36-34. VMCS 数据包定义**

| 名称  | VMCS 数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 1 1 0 0 1 0；字节 2：VMCS 指针\[19:12\]；字节 3：VMCS 指针\[27:20\]；字节 4：VMCS 指针\[35:28\]；字节 5：VMCS 指针\[43:36\]；字节 6：VMCS 指针\[51:44\]。 |
| 依赖  | TriggerEn 且 ContextEn；也在 VMX 操作中。 |
| 生成场景 | 在成功的 VMPTRLD 上生成，以及可选地在 PSB+、SMM VM 退出和从 SMM 返回的 VM 进入上（见第 36.6 节）。 |
| 描述  | VMCS 数据包为解码器提供 VMCS 指针以确定代码上下文的转换：在成功的 VMPTRLD（即，不故障、不失败或 VM 退出的 VMPTRLD）上，VMCS 数据包包含由 VMPTRLD 建立的逻辑处理器的 VMCS 指针（用于后续 VM 客户上下文的执行）。SMM VM 退出用 SMM 转移 VMCS 指针加载逻辑处理器的 VMCS 指针。如果"conceal VMX from PT" VM 退出控制为 0（见第 36.5.1 节），VMCS 数据包提供此指针。STM 内外追踪见第 36.6 节。从 SMM 返回的 VM 进入从 SMM 转移 VMCS 中的字段加载逻辑处理器的 VMCS 指针。如果"conceal VMX from PT" VM 进入控制为 0，VMCS 数据包提供此指针。VM 进入是到 VMX 根操作还是 VMX 非根操作由 PIP.NR 位指示。在 VMCS 指针已被加载之前或在 VMCS 指针已被清除之后生成的 VMCS 数据包将设置 VMCS 指针字段中的所有 64 位。VMCS 数据包在带 IA32_VMX_MISC\[bit 14\]=0 的处理器上不会被看到，因为这些处理器不允许在 VMX 操作中设置 TraceEn。 |
| 应用  | VMCS 数据包的目的是帮助解码器在 CR3 可能不唯一的情况下唯一标识执行软件上下文中的更改。当遇到 VMCS 数据包时，解码器应执行以下操作：如果有先前的未绑定 FUP（即，前面没有消费它的数据包（如 MODE.TSX），且因此它与尚未看到的 TIP 配对），则此 VMCS 是复合数据包事件（第 36.4.1 节）的一部分。找到结束 TIP 并将新 VMCS 基址指针值应用于 TIP 载荷 IP。否则，在反汇编中查找下一个 VMPTRLD、VMRESUME 或 VMLAUNCH，并在下一个 VM 进入时应用新 VMCS 基址指针。这些流生成的数据包示例见第 36.8 节。 |

#### 36.4.2.16 溢出（OVF）数据包

**表 36-35. OVF 数据包定义**

| 名称  | 溢出（OVF）数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 1 1 1 1 0 0；字节 2：0 1。 |
| 依赖  | TriggerEn |
| 生成场景 | 在内部缓冲区溢出解决时 |
| 描述  | OVF 仅向解码器指示发生内部缓冲区溢出，且数据包很可能丢失。如果 BranchEn= 1，OVF 后跟将提供数据包生成恢复 IP 的 FUP 或 TIP.PGE。见第 36.3.8 节。 |
| 应用  | 当遇到 OVF 数据包时，解码器应跳到后续 FUP 或 TIP.PGE 中给定的 IP。发送 OVF 数据包时，CYC 数据包的周期计数器将被重置。软件应在溢出时重置其调用栈深度，因为不允许跨溢出进行 RET 压缩。类似地，保证 OVF 之后的任何 IP 压缩使用溢出之前 IP 数据包的 IP 载荷作为参考 LastIP。 |

#### 36.4.2.17 数据包流边界（PSB）数据包

**表 36-36. PSB 数据包定义**

| 名称  | 数据包流边界（PSB）数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 1 0 0 0 0 0；字节 2：0 0 0 0 |

```python
  字节0  0  0  0  0  0  0  1
  字节1  0  1  1  0  0  0  0  0
  字节2  0  0  1  0  0  0  0  0
  字节3  1  0  0  0  0  0  1  0
  字节4  0  0  0  0  0  0  1  0
  字节5  1  0  0  0  0  0  1  0
  字节6  0  0  0  0  0  0  1  0
  字节7  1  0  0  0  0  0  1  0
  字节8  0  0  0  0  0  0  1  0
  字节9  1  0  0  0  0  0  1  0
  字节10 0  0  0  0  0  0  1  0
  字节11 1  0  0  0  0  0  1  0
  字节12 0  0  0  0  0  0  1  0
  字节13 1  0  0  0  0  0  1  0
  字节14 0  0  0  0  0  0  1  0
  字节15 1  0  0  0  0  0  1  0
```

| 依赖  | TriggerEn |
| --- | --- |
| 生成场景 | 基于追踪时生成的输出字节数的周期。当 IA32_RTIT_STATUS.PacketByteCnt=0 时以及每次在其后跨越软件选择的阈值时发送 PSB。也可以为其他微架构条件发送。 |
| 描述  | PSB 是数据包输出日志中的唯一模式，因此作为解码器的同步点。它是解码器可以搜索以在数据包边界上对齐的模式。此数据包基于输出字节数是周期的，如 IA32_RTIT_STATUS.PacketByteCnt 指示。周期由软件通过 IA32_RTIT_CTL.PSBFreq（见第 36.2.8.2 节）选择。然而注意 PSB 周期不精确，它仅反映应在 PSB 之间经过的平均输出字节数。处理器将尽最大努力在达到所选阈值后尽快插入 PSB。处理器也可以为一些微架构条件发送额外 PSB 数据包。PSB 也作为统称为 PSB+（第 36.3.7 节）的一组"仅状态"数据包的前导数据包。 |
| 应用  | 当看到 PSB 时，解码器应将所有后续数据包解释为"仅状态"，直到遇到 PSBEND 或 OVF 数据包。"仅状态"意味着这些数据包通常遵守的绑定和排序规则被忽略，且它们携带的状态可以改为应用于包括的 FUP 数据包中的 IP 载荷。 |

#### 36.4.2.18 PSBEND 数据包

**表 36-37. PSBEND 数据包定义**

| 名称  | PSBEND 数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 0 0 1 0 0 0；字节 2：1。 |
| 依赖  | TriggerEn |
| 生成场景 | 总是跟在 PSB 数据包后，由 PSB+ 数据包分隔 |
| 描述  | PSBEND 仅是跟随 PSB（第 36.3.7 节）的"仅状态"（PSB+）数据包系列的终止符。 |
| 应用  | 当看到 PSBEND 数据包时，解码器应停止将数据包视为"仅状态"。 |

#### 36.4.2.19 维护（MNT）数据包

**表 36-38. MNT 数据包定义**

| 名称  | 维护（MNT）数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 1 1 0 0 0 0；字节 2：1 0 0 0 1 0 0 0；字节 3：Payload\[7:0\]；字节 4：Payload\[15:8\]；字节 5：Payload\[23:16\]；字节 6：Payload\[31:24\]；字节 7：Payload\[39:32\]；字节 8：Payload\[47:40\]；字节 9：Payload\[55:48\]；字节 10：Payload\[63:56\]。 |
| 依赖  | TriggerEn |
| 生成场景 | 实现特定。 |
| 描述  | 此数据包由硬件生成，载荷含义是型号特定的。 |
| 应用  | 除非解码器已为特定家族/型号/步进扩展以解释 MNT 数据包载荷，否则此数据包应被简单地忽略。它不绑定到任何 IP。 |

#### 36.4.2.20 PAD 数据包

**表 36-39. PAD 数据包定义**

| 名称  | PAD 数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 0 0 |
| 依赖  | TriggerEn |
| 生成场景 | 实现特定 |
| 描述  | PAD 仅是 NOP 数据包。处理器实现可以选择添加填充数据包以改善数据包对齐或出于实现特定原因。 |
| 应用  | 忽略 PAD 数据包。 |

#### 36.4.2.21 PTWRITE（PTW）数据包

**表 36-40. PTW 数据包定义**

| 名称  | PTW 数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 IP PayloadBytes；字节 2：Payload\[7:0\]；字节 3：Payload\[15:8\]；字节 4：Payload\[23:16\]；字节 5：Payload\[31:24\]；字节 6：Payload\[39:32\] |

```python
  字节7  Payload[47:40]
  字节8  Payload[55:48]
  字节9  Payload[63:56]
```

PayloadBytes 字段指示跟在头字节后的载荷字节数。编码如下：

| PayloadBytes | 载荷字节数 |
| --- | --- |
| '00 | 4   |
| '01 | 8   |
| '10 | 保留  |
| '11 | 保留  |

IP 位指示是否将有 FUP 跟随，其载荷将是 PTWRITE 指令的 IP。

| 依赖  | TriggerEn 且 ContextEn 且 FilterEn 且 PTWEn |
| --- | --- |
| 生成场景 | PTWRITE 指令 |
| 描述  | 包含 PTWRITE 操作数中持有的值。此数据包是 CYC 合格的，因此如果 IA32_RTIT_CTL.CYCEn=1 且已到达任何 CYC 阈值，将生成 CYC 数据包。 |
| 应用  | 绑定到关联的 PTWRITE 指令。当 PTW.IP=1 时，PTWRITE 的 IP 将由后续 FUP 提供。 |

#### 36.4.2.22 执行停止（EXSTOP）数据包

**表 36-41. EXSTOP 数据包定义**

| 名称  | EXSTOP 数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 IP 1 1 0 0 0。IP 位指示是否将有 FUP 跟随。 |
| 依赖  | TriggerEn 且 PwrEvtEn |
| 生成场景 | C 状态进入、P 状态更改或其他处理器时钟断电。包括：进入比 C0.0 更深的 C 状态；TM1/2；STPCLK#；由于 IA32_CLOCK_MODULATION、Turbo 导致的频率更改。 |
| 描述  | 此数据包指示由于处理器时钟断电，软件执行已停止。稍后数据包将指示执行何时恢复。如果在设置 ContextEn 时生成 EXSTOP，IP 位将被设置，且 EXSTOP 将后跟包含执行停止 IP 的 FUP 数据包。更精确地说，这将是尚未完成的最旧指令的 IP。此数据包是 CYC 合格的，因此如果 IA32_RTIT_CTL.CYCEn=1 且已到达任何 CYC 阈值，将生成 CYC 数据包。 |
| 应用  | 如果 FUP 跟随 EXSTOP（因此设置 IP 位），EXSTOP 可以绑定到 FUP IP。否则 IP 未知。如果 CYCEn=1，可以从前面的 CYC 推断断电时间。与唤醒时的 TSC（如果 TSCEn=1）组合，这可以用于确定断电的持续时间。 |

#### 36.4.2.23 MWAIT 数据包

**表 36-42. MWAIT 数据包定义**

| 名称  | MWAIT 数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 1 1 0 0 0 0；字节 2：MWAIT Hints\[7:0\]；字节 3：保留；字节 4：保留；字节 5：保留；字节 6：保留 EXT\[1:0\]；字节 7：保留；字节 8：保留；字节 9：保留。 |
| 依赖  | TriggerEn 且 PwrEvtEn 且 ContextEn |
| 生成场景 | MWAIT、UMWAIT 或 TPAUSE 指令，或不故障或 VMexit 的到 MWAIT 的 I/O 重定向。 |
| 描述  | 指示到比 C0.0 更深的 C 状态的 MWAIT 操作完成。软件传入的 MWAIT 提示和扩展被暴露在载荷中。对于 UMWAIT 和 TPAUSE，EXT 字段持有确定请求的优化状态的输入寄存器值。对于进入一些高度优化的 C0 子 C 状态（如 C0.1），不生成 MWAIT 数据包。此数据包是 CYC 合格的，因此如果 IA32_RTIT_CTL.CYCEn=1 且已到达任何 CYC 阈值，将生成 CYC 数据包。 |
| 应用  | 即将到来的 EXSTOP 数据包的绑定也适用于 MWAIT 数据包。见第 36.4.2.22 节。 |

#### 36.4.2.24 电源进入（PWRE）数据包

**表 36-43. PWRE 数据包定义**

| 名称  | PWRE 数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 0 0 1 0 0 0；字节 2：HW 保留；字节 3：解析线程 C 状态 解析线程子 C 状态。 |
| 依赖  | TriggerEn 且 PwrEvtEn |
| 生成场景 | 转换到比 C0.0 更深的 C 状态。 |
| 描述  | 指示处理器进入指示的解析线程 C 状态和子 C 状态。处理器将保持在此 C 状态，直到另一个 PWRE 指示处理器已移动到比 C0.0 更深的 C 状态，或 PWRX 数据包指示返回 C0.0。对于进入一些高度优化的 C0 子 C 状态（如 C0.1），不生成 PWRE 数据包。注意一些 CPU 可能允许 MWAIT 请求比核心支持的更深的 C 状态。这些更深的 C 状态可能具有区分它们的平台级影响。然而，PWRE 数据包将仅提供解析线程 C 状态，其将不超过核心支持的状态。如果 C 状态进入由硬件发起，而不是直接软件请求（如 MWAIT、UMWAIT、TPAUSE、HLT 或关闭），将设置 HW 位以指示此情况。硬件占空循环（HDC）（见《Intel® 64 和 IA-32 架构软件开发手册》第 3B 卷第 17.5 节"Hardware Duty Cycling (HDC)"）是此类情况的示例。 |
| 应用  | 当从 C0.0 转换到更深的 C 状态时，PWRE 数据包后将跟 EXSTOP。如果该 EXSTOP 数据包具有设置的 IP 位，则后续 FUP 将提供发生 C 状态进入的 IP。在下一个 PWRX 之前生成的后续 PWRE 数据包应绑定到相同 IP。 |

#### 36.4.2.25 电源退出（PWRX）数据包

**表 36-44. PWRX 数据包定义**

| 名称  | PWRX 数据包 |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 1 0 1 0 0 0；字节 2：最后核心 C 状态 最深核心 C 状态；字节 3：保留 唤醒原因；字节 4：保留；字节 5：保留；字节 6：保留。 |
| 依赖  | TriggerEn 且 PwrEvtEn |
| 生成场景 | 从比 C0.0 更深的 C 状态转换到 C0。 |
| 描述  | 指示处理器从比 C0.0 更深的 C 状态返回到线程 C0。对于从一些高度优化的 C0 子 C 状态（如 C0.1）返回，不生成 PWRX 数据包。Last Core C-State 字段提供唤醒时核心 C 状态的 MWAIT 编码。Deepest Core C-State 提供睡眠会话期间或自离开线程 C0 以来实现的最深核心 C 状态的 MWAIT 编码。C 状态的 MWAIT 编码可以在《Intel® 64 和 IA-32 架构软件开发手册》第 2B 卷的表 4-11 中找到。注意这些值仅反映核心 C 状态，因此将不超过最大支持核心 C 状态，即使可以请求更深的 C 状态。 |

Wake Reason 字段是单热的，编码如下：

| 位   | 字段  | 含义  |
| --- | --- | --- |
| 0   | 中断  | 由于收到外部中断而唤醒。 |
| 1   | 计时器截止 | 由于计时器到期而唤醒，如 UMWAIT/TPAUSE TSC 量子。 |
| 2   | 对被监视地址的存储 | 由于对被监视地址的存储而唤醒。 |
| 3   | 硬件唤醒 | 由于硬件自主条件（如 HDC）而唤醒。 |

**应用**：PWRX 将总是适用于与 PWRE 相同的 IP。唤醒时间可以从 PWRX 之前的（可选）定时数据包辨别。

#### 36.4.2.26 块开始数据包（BBP）

**表 36-45. 块开始数据包定义**

| 名称  | BBP |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 0 1 |

```python
  字节1  0  0  0  1  1
  字节2  SZ 保留 Type[4:0]
```

| 依赖  | TriggerEn |
| --- | --- |
| 生成场景 | PEBS 事件，如果 IA32_PEBS_ENABLE.OUTPUT=1。 |
| 描述  | 此数据包指示一个块开始，该块中的一系列数据包共同绑定到单个事件或指令。此块内块项载荷的大小由 Size（SZ）位提供：SZ=0：8 字节块项；SZ=1：4 字节块项。BIP 载荷的含义由 Type 字段提供： |

| BBP.Type | 块名称 |
| --- | --- |
| 0x00 | 保留  |
| 0x01 | 通用寄存器 |
| 0x02..0x03 | 保留  |
| 0x04 | PEBS Basic |
| 0x05 | PEBS Memory |
| 0x06..0x07 | 保留  |
| 0x08 | LBR 块 0 |
| 0x09 | LBR 块 1 |
| 0x0A | LBR 块 2 |
| 0x0B..0x0F | 保留  |
| 0x10 | XMM 寄存器 |
| 0x11..0x1F | 保留  |

**应用**：BBP 将总是后跟块结束数据包（BEP），且当在 ContextEn=1 时生成块时，该 BEP 将具有 IP=1 并后跟提供块应绑定到的 IP 的 FUP。注意除 BEP 外，块可以由 BBP（指示新块的开始）或 OVF 数据包终止。

#### 36.4.2.27 块项数据包（BIP）

**表 36-46. 块项数据包定义**

| 名称  | BIP |
| --- | --- |
| 格式  | 如果前面的 BBP.SZ=0：字节 0：ID\[5:0\]；字节 1：1 0 0 1 Payload\[7:0\]；字节 2：Payload\[15:8\]；字节 3：Payload\[23:16\]；字节 4：Payload\[31:24\]；字节 5：Payload\[39:32\]；字节 6：Payload\[47:40\]；字节 7：Payload\[55:48\]；字节 8：Payload\[63:56\]。如果前面的 BBP.SZ=1：字节 0：ID\[5:0\]；字节 1：1 0 0 1 Payload\[7:0\]；字节 2：Payload\[15:8\]；字节 3：Payload\[23:16\]；字节 4：Payload\[31:24\]。 |
| 依赖  | TriggerEn |
| 生成场景 | 见 BBP。 |
| 描述  | BIP 载荷的大小由前面 BBP 数据包中的 Size 字段确定。BIP 头提供 ID 值，当与前面 BBP 的 Type 字段组合时，唯一标识 BIP 载荷中持有的状态值。完整列表见下面表 36-47。 |
| 应用  | 见 BBP。 |

**BIP 状态值编码**

下面表提供所有已定义块项的编码值。大于 8 字节的状态项（如 XMM 寄存器值）被拆分为多个 8 字节组件。带 Size=1（4 字节载荷）的 BIP 数据包将仅提供关联状态值的较低 4 字节。

**表 36-47. BIP 编码**

| BBP.Type | BIP.ID | 状态值 |
| --- | --- | --- |
| 通用寄存器 0x01 | 0x00 | R/EFLAGS |
| 0x01 | 0x01 | R/EIP |
| 0x01 | 0x02 | R/EAX |
| 0x01 | 0x03 | R/ECX |
| 0x01 | 0x04 | R/EDX |
| 0x01 | 0x05 | R/EBX |
| 0x01 | 0x06 | R/ESP |
| 0x01 | 0x07 | R/EBP |
| 0x01 | 0x08 | R/ESI |
| 0x01 | 0x09 | R/EDI |
| 0x01 | 0x0A | R8  |
| 0x01 | 0x0B | R9  |
| 0x01 | 0x0C | R10 |
| 0x01 | 0x0D | R11 |
| 0x01 | 0x0E | R12 |
| 0x01 | 0x0F | R13 |
| 0x01 | 0x10 | R14 |
| 0x01 | 0x11 | R15 |
| PEBS 基本信息（第 22.9.2.2.1 节）0x04 | 0x00 | 指令指针 |
| 0x04 | 0x01 | 适用计数器 |
| 0x04 | 0x02 | 时间戳 |
| PEBS 内存信息（第 22.9.2.2.2 节）0x05 | 0x00 | MemAccessAddress |
| 0x05 | 0x01 | MemAuxInfo |
| 0x05 | 0x02 | MemAccessLatency |
| 0x05 | 0x03 | TSXAuxInfo |
| LBR_0 0x08 | 0x00 | LBR\[TOS-0\]\_FROM_IP |
| 0x08 | 0x01 | LBR\[TOS-0\]\_TO_IP |
| 0x08 | 0x02 | LBR\[TOS-0\]\_INFO |
| 0x08 | 0x03 | LBR\[TOS-1\]\_FROM_IP |
| 0x08 | 0x04 | LBR\[TOS-1\]\_TO_IP |
| 0x08 | 0x05 | LBR\[TOS-1\]\_INFO |
| 0x08 | 0x06 | LBR\[TOS-2\]\_FROM_IP |
| 0x08 | 0x07 | LBR\[TOS-2\]\_TO_IP |
| 0x08 | 0x08 | LBR\[TOS-2\]\_INFO |
| 0x08 | 0x09 | LBR\[TOS-3\]\_FROM_IP |
| 0x08 | 0x0A | LBR\[TOS-3\]\_TO_IP |
| 0x08 | 0x0B | LBR\[TOS-3\]\_INFO |
| 0x08 | 0x0C | LBR\[TOS-4\]\_FROM_IP |
| 0x08 | 0x0D | LBR\[TOS-4\]\_TO_IP |
| 0x08 | 0x0E | LBR\[TOS-4\]\_INFO |
| 0x08 | 0x0F | LBR\[TOS-5\]\_FROM_IP |
| 0x08 | 0x10 | LBR\[TOS-5\]\_TO_IP |
| 0x08 | 0x11 | LBR\[TOS-5\]\_INFO |
| 0x08 | 0x12 | LBR\[TOS-6\]\_FROM_IP |
| 0x08 | 0x13 | LBR\[TOS-6\]\_TO_IP |
| 0x08 | 0x14 | LBR\[TOS-6\]\_INFO |
| 0x08 | 0x15 | LBR\[TOS-7\]\_FROM_IP |
| 0x08 | 0x16 | LBR\[TOS-7\]\_TO_IP |
| 0x08 | 0x17 | LBR\[TOS-7\]\_INFO |
| 0x08 | 0x18 | LBR\[TOS-8\]\_FROM_IP |
| 0x08 | 0x19 | LBR\[TOS-8\]\_TO_IP |
| 0x08 | 0x1A | LBR\[TOS-8\]\_INFO |
| 0x08 | 0x1B | LBR\[TOS-9\]\_FROM_IP |
| 0x08 | 0x1C | LBR\[TOS-9\]\_TO_IP |
| 0x08 | 0x1D | LBR\[TOS-9\]\_INFO |
| 0x08 | 0x1E | LBR\[TOS-10\]\_FROM_IP |
| 0x08 | 0x1F | LBR\[TOS-10\]\_TO_IP |
| LBR_1 0x09 | 0x00 | LBR\[TOS-10\]\_INFO |
| 0x09 | 0x01 | LBR\[TOS-11\]\_FROM_IP |
| 0x09 | 0x02 | LBR\[TOS-11\]\_TO_IP |
| 0x09 | 0x03 | LBR\[TOS-11\]\_INFO |
| 0x09 | 0x04 | LBR\[TOS-12\]\_FROM_IP |
| 0x09 | 0x05 | LBR\[TOS-12\]\_TO_IP |
| 0x09 | 0x06 | LBR\[TOS-12\]\_INFO |
| 0x09 | 0x07 | LBR\[TOS-13\]\_FROM_IP |
| 0x09 | 0x08 | LBR\[TOS-13\]\_TO_IP |
| 0x09 | 0x09 | LBR\[TOS-13\]\_INFO |
| 0x09 | 0x0A | LBR\[TOS-14\]\_FROM_IP |
| 0x09 | 0x0B | LBR\[TOS-14\]\_TO_IP |
| 0x09 | 0x0C | LBR\[TOS-14\]\_INFO |
| 0x09 | 0x0D | LBR\[TOS-15\]\_FROM_IP |
| 0x09 | 0x0E | LBR\[TOS-15\]\_TO_IP |
| 0x09 | 0x0F | LBR\[TOS-15\]\_INFO |
| 0x09 | 0x10 | LBR\[TOS-16\]\_FROM_IP |
| 0x09 | 0x11 | LBR\[TOS-16\]\_TO_IP |
| 0x09 | 0x12 | LBR\[TOS-16\]\_INFO |
| 0x09 | 0x13 | LBR\[TOS-17\]\_FROM_IP |
| 0x09 | 0x14 | LBR\[TOS-17\]\_TO_IP |
| 0x09 | 0x15 | LBR\[TOS-17\]\_INFO |
| 0x09 | 0x16 | LBR\[TOS-18\]\_FROM_IP |
| 0x09 | 0x17 | LBR\[TOS-18\]\_TO_IP |
| 0x09 | 0x18 | LBR\[TOS-18\]\_INFO |
| 0x09 | 0x19 | LBR\[TOS-19\]\_FROM_IP |
| 0x09 | 0x1A | LBR\[TOS-19\]\_TO_IP |
| 0x09 | 0x1B | LBR\[TOS-19\]\_INFO |
| 0x09 | 0x1C | LBR\[TOS-20\]\_FROM_IP |
| 0x09 | 0x1D | LBR\[TOS-20\]\_TO_IP |
| 0x09 | 0x1E | LBR\[TOS-20\]\_INFO |
| 0x09 | 0x1F | LBR\[TOS-21\]\_FROM_IP |
| LBR_2 0x0A | 0x00 | LBR\[TOS-21\]\_TO_IP |
| 0x0A | 0x01 | LBR\[TOS-21\]\_INFO |
| 0x0A | 0x02 | LBR\[TOS-22\]\_FROM_IP |
| 0x0A | 0x03 | LBR\[TOS-22\]\_TO_IP |
| 0x0A | 0x04 | LBR\[TOS-22\]\_INFO |
| 0x0A | 0x05 | LBR\[TOS-23\]\_FROM_IP |
| 0x0A | 0x06 | LBR\[TOS-23\]\_TO_IP |
| 0x0A | 0x07 | LBR\[TOS-23\]\_INFO |
| 0x0A | 0x08 | LBR\[TOS-24\]\_FROM_IP |
| 0x0A | 0x09 | LBR\[TOS-24\]\_TO_IP |
| 0x0A | 0x0A | LBR\[TOS-24\]\_INFO |
| 0x0A | 0x0B | LBR\[TOS-25\]\_FROM_IP |
| 0x0A | 0x0C | LBR\[TOS-25\]\_TO_IP |
| 0x0A | 0x0D | LBR\[TOS-25\]\_INFO |
| 0x0A | 0x0E | LBR\[TOS-26\]\_FROM_IP |
| 0x0A | 0x0F | LBR\[TOS-26\]\_TO_IP |
| 0x0A | 0x10 | LBR\[TOS-26\]\_INFO |
| 0x0A | 0x11 | LBR\[TOS-27\]\_FROM_IP |
| 0x0A | 0x12 | LBR\[TOS-27\]\_TO_IP |
| 0x0A | 0x13 | LBR\[TOS-27\]\_INFO |
| 0x0A | 0x14 | LBR\[TOS-28\]\_FROM_IP |
| 0x0A | 0x15 | LBR\[TOS-28\]\_TO_IP |
| 0x0A | 0x16 | LBR\[TOS-28\]\_INFO |
| 0x0A | 0x17 | LBR\[TOS-29\]\_FROM_IP |
| 0x0A | 0x18 | LBR\[TOS-29\]\_TO_IP |
| 0x0A | 0x19 | LBR\[TOS-29\]\_INFO |
| 0x0A | 0x1A | LBR\[TOS-30\]\_FROM_IP |
| 0x0A | 0x1B | LBR\[TOS-30\]\_TO_IP |
| 0x0A | 0x1C | LBR\[TOS-30\]\_INFO |
| 0x0A | 0x1D | LBR\[TOS-31\]\_FROM_IP |
| 0x0A | 0x1E | LBR\[TOS-31\]\_TO_IP |
| 0x0A | 0x1F | LBR\[TOS-31\]\_INFO |
| XMM 寄存器 0x10 | 0x00 | XMM0_Q0 |
| 0x10 | 0x01 | XMM0_Q1 |
| 0x10 | 0x02 | XMM1_Q0 |
| 0x10 | 0x03 | XMM1_Q1 |
| 0x10 | 0x04 | XMM2_Q0 |
| 0x10 | 0x05 | XMM2_Q1 |
| 0x10 | 0x06 | XMM3_Q0 |
| 0x10 | 0x07 | XMM3_Q1 |
| 0x10 | 0x08 | XMM4_Q0 |
| 0x10 | 0x09 | XMM4_Q1 |
| 0x10 | 0x0A | XMM5_Q0 |
| 0x10 | 0x0B | XMM5_Q1 |
| 0x10 | 0x0C | XMM6_Q0 |
| 0x10 | 0x0D | XMM6_Q1 |
| 0x10 | 0x0E | XMM7_Q0 |
| 0x10 | 0x0F | XMM7_Q1 |
| 0x10 | 0x10 | XMM8_Q0 |
| 0x10 | 0x11 | XMM8_Q1 |
| 0x10 | 0x12 | XMM9_Q0 |
| 0x10 | 0x13 | XMM9_Q1 |
| 0x10 | 0x14 | XMM10_Q0 |
| 0x10 | 0x15 | XMM10_Q1 |
| 0x10 | 0x16 | XMM11_Q0 |
| 0x10 | 0x17 | XMM11_Q1 |
| 0x10 | 0x18 | XMM12_Q0 |
| 0x10 | 0x19 | XMM12_Q1 |
| 0x10 | 0x1A | XMM13_Q0 |
| 0x10 | 0x1B | XMM13_Q1 |
| 0x10 | 0x1C | XMM14_Q0 |
| 0x10 | 0x1D | XMM14_Q1 |
| 0x10 | 0x1E | XMM15_Q0 |
| 0x10 | 0x1F | XMM15_Q1 |

#### 36.4.2.28 块结束数据包（BEP）

**表 36-48. 块结束数据包定义**

| 名称  | BEP |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 IP 0 1 |

```python
  字节1  0  0  1  1
```

| 依赖  | TriggerEn |
| --- | --- |
| 生成场景 | 见 BBP。 |
| 描述  | 指示数据包块的结束。IP 位指示是否将有 FUP 跟随，且如果 ContextEn=1 将被设置。 |
| 应用  | 从初始 BBP 到 BEP 的块绑定到 FUP IP（如果 IP=1），并消费该 FUP。 |

#### 36.4.2.29 控制流事件（CFE）数据包

**表 36-49. 控制流事件数据包定义**

| 名称  | CFE |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 0 0 0 1 0 0；字节 2：IP 保留 Type\[4:0\]；字节 3：Vector\[7:0\]。IP 位指示是否将有独立 FUP 跟随。 |
| 生成场景 | 软件中断（包括启用 FRED 转换时的 SYSCALL 和 SYSENTER）、外部中断、用户中断或异常，包括 VM 进入时注入的那些。INIT、SIPI、SMI、RSM、ERETS、ERETU、IRET、关闭。VM 退出，如果"Conceal VMX in PT" VMCS 退出控制为 0。VM 进入，如果"Conceal VMX in PT" VMCS 进入控制为 0。TSX 中止。 |
| 依赖  | IA32_RTIT_CTL.EventEn 且 TriggerEn 且 ContextEn。在 ContextEn 转换时，无论方向（1→0 或 0→1）都将生成 CFE。VM 退出是例外，其中 CFE.VMEXIT 仅取决于 ContextEn 的先前值。 |
| 描述  | 此数据包指示已发生异步事件或相关事件（见上面列表）。事件的类型在数据包中提供（见下面表 36-50），且如果设置 IP 位，事件发生的 IP 在跟随的独立 FUP 数据包中提供。此外，在中断或异常的情况下，vector 字段提供事件的向量。仅当在事件被采取之前 ContextEn=1 时设置 IP 位，且要么 BranchEn=0，要么 BranchEn=1 不为该事件生成 FUP。有一些情况（如 SIPI 和 RSM）不生成 FUP。注意未交付给软件的事件（如嵌套事件或导致 VM 退出的事件）不生成 CFE 数据包。 |
| 应用  | 如果设置 IP 位，将跟随独立的（不是复合数据包事件的一部分）FUP，且 CFE 消费该 FUP。如果未设置 IP 位，如果 PacketEn=1，CFE 绑定到下一个 FUP（因此 CFE 在 TIP.PGE 之后但在下一个 TIP.PGD 之前），且如果 PacketEn=0 则是独立的。 |

**CFE 数据包类型和向量字段**

每个 CFE 具有 Type 字段，其提供生成数据包的事件类型。对于 CFE 类型的子集，CFE.Vector 字段可能有效。这些字段的细节以及任何后续 FUP 数据包中预期的 IP 在下面表中提供。

**表 36-50. CFE 数据包类型和向量字段细节**

| CFE 子类型 | Type | Vector | FUP IP | 细节  |
| --- | --- | --- | --- | --- |
| INTR | 0x1 | 事件向量 | 变化  | 用于中断（外部和软件）、异常、故障和 NMI。FUP 包含尚未完成指令的地址（陷阱事件为 NLIP，故障事件为 CLIP）。启用 FRED 转换时不用于 INT n、INT3、INTO 或 INT1。 |
| IRET | 0x2 | 无效  | CLIP | 由 ERETS 和 ERETU 以及 IRET 使用。 |
| SMI | 0x3 | 无效  | NLIP |     |
| RSM | 0x4 | 无效  | 无   |     |
| SIPI | 0x5 | SIPI 向量 | 无   |     |
| INIT | 0x6 | 无效  | NLIP |     |
| VMENTRY | 0x7 | 无效  | CLIP | FUP 包含 VMLAUNCH/VMRESUME 的 IP。 |
| VMEXIT | 0x8 | 无效  | 变化  | FUP IP 取决于 VM 退出的类型而变化，但将是尚未完成指令的地址。将与保存在 VMCS 中的客户 IP 一致。 |
| VMEXIT_INTR | 0x9 | 事件向量 | 变化  | 在 VM 退出由 INTR 事件（中断、异常、故障或 NMI）导致的情况下发送。提供的向量用于导致 VM 退出的事件。FUP IP 行为匹配上面 INTR 类型。 |
| SHUTDOWN | 0xa | 无效  | 变化  | FUP IP 取决于导致关闭的事件类型而变化，但将是尚未完成指令的地址。 |
| 保留  | 0xb | N/A | N/A |     |
| UINTR | 0xc | 用户中断向量 | NLIP | 用户中断已交付。 |
| UIRET | 0xd | 无效  | CLIP | 从用户中断例程退出。 |
| SWINTR | 0xe | 事件向量 | CLIP | 启用 FRED 转换时用于软件中断（INT n、INT3、INTO 和 INT1）。 |
| SYSCALL | 0xf | 无效  | CLIP | 用于 SYSCALL 和 SYSENTER，但仅当启用 FRED 转换时。 |
| 保留  | 0x10–0x1f | N/A | N/A | 保留  |

#### 36.4.2.30 事件数据（EVD）数据包

**表 36-51. 事件数据数据包定义**

| 名称  | EVD |
| --- | --- |
| 格式  | 字节 0：0 0 0 0 0 0 1；字节 1：0 1 0 1 0 1 0 0；字节 2：保留 Type\[5:0\]；字节 3：Payload\[7:0\]；字节 4：Payload\[15:8\]；字节 5：Payload\[23:16\]；字节 6：Payload\[31:24\]；字节 7：Payload\[39:32\]；字节 8：Payload\[47:40\]；字节 9：Payload\[55:48\]；字节 10：Payload\[63:56\]。 |
| 依赖  | IA32_RTIT_CTL.EventEn 且 TriggerEn 且 ContextEn |
| 生成场景 | 页故障，包括 VM 进入时注入的那些。VM 退出，如果"Suppress VMX packets on exit" VMCS 退出控制为 0。 |
| 描述  | 提供关于导致后续 CFE 的事件的额外数据。Payload 字段由 Type 规定。 |

| Type | 载荷  |
| --- | --- |
| '000000 | 页故障线性地址，与 CR2 相同（PFA） |
| '000001 | VMX 退出资格（VMXQ） |
| '000010 | VMX 退出原因（VMXR） |
| '000011 - '111111 | 保留  |

EVD 数据包在不生成 CFE 的情况下永不生成。

**应用**：EVD 数据包绑定到与后续 CFE 数据包相同的 IP（如果有）。

## 36.5 VMX 操作中的追踪

在 IA32_VMX_MISC\[bit 14\] 报告 1 的处理器上，可以在 VMX 操作中设置 TraceEn。VMM 可以配置特定 VMX 控制以控制追踪数据包中包括哪些虚拟化特定数据（细节见第 36.5.1 节）。VMM 也可以配置 VMCS 以将追踪限制到非根操作，或跨根和非根操作追踪。VMCS 控制存在以简化为访客使用虚拟化 Intel PT，包括"Clear IA32_RTIT_CTL"退出控制（见第 27.7.1 节）、"Load IA32_RTIT_CTL"进入控制（见第 27.8.1 节）和"Intel PT uses guest physical addresses"执行控制（见第 28.5.3 节）。

对于不支持这些 VMCS 控制的较旧处理器，VMM 可以使用 VMX 转换使用的 MSR 加载区域将追踪限制到期望上下文。细节见第 36.5.2 节。带 SMM 转移监视器的追踪在第 36.6 节中描述。

### 36.5.1 VMX 特定数据包和 VMCS 控制

在 VMX 和 Intel PT 的所有用法中，主机或 VMM 上下文中的解码器可以借助 VMX 特定数据包标识 VMX 转换的发生。与 VMX 相关的数据包有四种：

-   **VMCS 数据包**。个体 VM 的 VMX 转换可以由解码器使用 VMCS 数据包中的 VMCS 指针字段区分。VMCS 数据包在成功执行 VMPTRLD 时发送，且其 VMCS 指针字段存储由该执行加载的 VMCS 指针。细节见第 36.4.2.15 节。
-   **PIP 数据包中的 NR（非根）位**。通常，在 VMX 非根操作中生成的任何 PIP 数据包中设置 NR 位。此外，每次 VM 进入和 VM 退出都生成 PIP 数据包。因此 NR 位从 0 到 1 的转换指示 VM 进入的发生，而 1 到 0 的转换指示 VM 退出的发生。
-   **CFE 数据包**。标识 VM 退出和 VM 进入操作。
-   **EVD 数据包**。为 VM 退出提供退出原因和退出资格。

有 VMM 可以设置的 VMX 控制以隐藏一些此 VMX 特定信息（通过抑制其记录）并从而防止其跨虚拟化边界泄漏。每种类型的 VMX 控制中有一个这样的控制（每个称为"conceal VMX from PT"）。

**表 36-52. Intel 处理器追踪的 VMX 控制**

| 值   | 行为  | VMX 控制类型 | 位位置¹ |
| --- | --- | --- | --- |
| 0   | 在 VM 非根操作中生成的每个 PIP 将设置 NR 位。VMX 非根操作中的 PSB+ 将包括 VMCS 数据包，以确保解码器知道当前正在使用哪个访客。 | 次级基于处理器的 VM 执行控制 | 19  |
| 1   | 在 VMX 非根操作中生成的每个 PIP 将清除 NR 位。VMX 非根操作中的 PSB+ 将不包括 VMCS 数据包。 | 同上  | 19  |
| 0   | 每次 VM 退出生成 NR 位被清除的 PIP，以及（如果启用事件追踪）CFE/EVD。此外，SMM VM 退出生成 VMCS 数据包。 | VM 退出控制 | 24  |
| 1   | VM 退出不生成 PIP、CFE 或 EVD，且 SMM VM 退出时不生成 VMCS 数据包。 | 同上  | 24  |
| 0   |     | VM 进入控制 | 17  |
| 0   | 每次 VM 进入生成 NR 位被设置的 PIP（从 SMM 返回到 VMX 根操作的 VM 进入除外），以及（如果启用事件追踪）CFE。此外，从 SMM 返回的 VM 进入生成 VMCS 数据包。 | VM 进入控制 | 17  |
| 1   | VM 进入不生成 PIP 或 CFE，且从 SMM 返回的 VM 进入时不生成 VMCS 数据包。 | 同上  | 17  |

**注：**

1.  这些是相关 VMX 控制字段中控制位的位置。

这些 VMX 控制的 0 设置启用所有 VMX 特定数据包信息。使用这些默认设置的场景也不需要 VMM 使用 VMX MSR 加载区域跨 VMX 转换启用和禁用追踪数据包生成。

如果 IA32_VMX_MISC\[bit 14\] 报告 0，表 36-52 中 VMX 控制的 1 设置不被支持，且任何设置它们的尝试将使 VM 进入失败。

### 36.5.2 跨 VMX 转换管理追踪数据包生成

在为 VMX 根操作和 VMX 非根操作都收集数据包的追踪场景中，主机执行体可以直接管理与追踪数据包生成关联的 MSR。这些 MSR 的状态无需跨 VMX 转换修改。

对于仅在 VMX 根操作内或仅在 VMX 非根操作内收集数据包的追踪场景，VMM 可以在 VMX 转换时切换 IA32_RTIT_CTL.TraceEn。

#### 36.5.2.1 系统级追踪

当主机或 VMM 配置 Intel PT 收集整个系统的追踪数据包时，它可以让相关 VMX 控制保持清除，以允许 VMX 特定数据包跨 VMX 转换提供信息。

解码器将希望标识 VMX 转换的发生。解码器感兴趣的数据包在表 36-53 中显示。

**表 36-53. VMX 转换上的数据包（系统级追踪）**

| 事件  | 数据包 | 启用  | 描述  |
| --- | --- | --- | --- |
| VM 退出 | EVD.VMXR、EVD.VMXQ、CFE.VMEXIT\* | EventEn | CFE 将转移标识为 VM 退出，而关联的 EVD 提供退出原因和退出资格。 |
|     | FUP(GuestIP) | BranchEn 或 EventEn | FUP 指示 VM 退出在访客流中的哪个点发生。这很重要，因为 VM 退出可以是异步事件。IP 将匹配写入 VMCS 的值。 |
|     | PIP(HostCR3, NR=0) | BranchEn | PIP 数据包提供新的主机 CR3 值，以及逻辑处理器进入 VMX 根操作的指示。这允许解码器标识从访客到主机的执行上下文更改并加载适当的二进制集以继续解码。 |
|     | TIP(HostIP) | BranchEn | TIP 指示目标 IP，即要在 VMX 根操作中执行的第一条指令的 IP。注意此数据包可以由 MODE.Exec 数据包（第 36.4.2.8 节）先导。这仅在转换期间 CS.D 或 (CS.L & EFER.LMA) 更改的情况下生成。 |
| VM 进入 | CFE.VMENTRY、FUP(CLIP) | EventEn | CFE 将转移标识为 VM 进入，而 FUP 标识 VMLAUNCH/VMRESUME IP。 |
|     | PIP(GuestCR3, NR=1) | BranchEn | PIP 数据包提供新的访客 CR3 值，以及逻辑处理器进入 VMX 非根操作的指示。这允许解码器标识从主机到访客的执行上下文更改并加载适当的二进制集以继续解码。 |
|     | TIP(GuestIP) | BranchEn | TIP 指示目标 IP，即要在 VMX 非根操作中执行的第一条指令的 IP。这应匹配从 VMCS 加载的 RIP。注意此数据包可以由 MODE.Exec 数据包（第 36.4.2.8 节）先导。这仅在转换期间 CS.D 或 (CS.L & EFER.LMA) 更改的情况下生成。 |

由于抑制数据包生成的 VMX 控制被清除，此使用场景中的所有 PSB+ 将包括 VMCS 数据包。此外，VMPTRLD 将生成此类数据包。因此解码器可以区分不同 VM 的执行上下文。

当主机 VMM 配置系统在此场景中收集追踪数据包时，它应向访客模拟 CPUID 报告 CPUID.07H.00H:EBX\[26\] 为 0，向访客指示 Intel PT 不可用。

**VMX TSC 操纵**

在 VMX 非根操作中生成的 TSC 数据包将包括使用 VMM 的 TSC 偏移或 TSC 缩放 VMX 控制（见第 28 章"VMX Non-Root Operation"）导致的任何更改。在此系统级使用模型中，解码器可能需要考虑 VMX 非根操作中生成的 TSC 数据包中每 VM 调整的影响以及 VMX 根操作中生成的 TSC 数据包中没有 TSC 调整。VMM 可以将此信息提供给解码器。

#### 36.5.2.2 仅访客追踪

VMM 可以为正常执行的访客配置在 VMX 非根操作中的追踪数据包生成。这通过利用 VMCS 控制在 VMX 转换时操纵访客 IA32_RTIT_CTL 值来完成。对于不支持这些 VMCS 控制的较旧处理器，VMM 可以使用 VM 退出（见第 27.7.2 节"VM-Exit Controls for MSRs"）和 VM 进入（见第 27.8.2 节"VM-Entry Controls for MSRs"）上的 VMX MSR 加载区域将追踪数据包生成限制到访客环境。

对于此使用，VM 进入被编程为启用追踪数据包生成，而 VM 退出被编程为清除 IA32_RTIT_CTL.TraceEn 以在主机中禁用追踪数据包生成。此外，如果希望访客数据包流不包含在 VMX 非根操作中执行的指示，VMM 应将表 36-52 中枚举的所有 VMX 控制设置为 1。

#### 36.5.2.3 模拟 Intel PT 追踪状态

如果 VMM 通过对该状态位的读和/或写采取 VM 退出模拟处理器状态元素，且该状态元素影响 Intel PT 数据包生成或值，VMM 可能有责任插入或修改输出追踪数据。

如果对访客写 CR3（包括"MOV CR3"以及任务切换）采取 VM 退出，通常在 CR3 写上生成的 PIP 数据包将缺失。

为避免解码访客追踪时的解码器混淆，VMM 应通过将缺失的 PIP 写入访客输出缓冲区模拟它。如果访客 CR3 值被操纵，VMM 可能还需要操纵 IA32_RTIT_CR3_MATCH 值，以确保追踪行为匹配访客的期望。

类似地，如果 VMM 通过对 RDTSC 采取 VM 退出模拟 TSC 值，追踪中生成的 TSC 数据包可能与 VMM 在 RDTSC 上返回的 TSC 值不匹配。为确保追踪可以基于 RDTSC 与软件日志正确对齐，VMM 应对访客追踪中的 TSC 数据包值进行相应修改，或使用 TSC 偏移或 TSC 缩放等机制代替退出。

#### 36.5.2.4 TSC 缩放

当为使用 Intel PT 的访客启用 TSC 缩放时，VMM 应确保 MSR_PLATFORM_INFO（MSR 0CEH）中的 Maximum Non-Turbo Ratio\[15:8\] 值和 CPUID.15H 中的 TSC/"core crystal clock" 比率（EBX/EAX）以与 VM 将看到的所得 TSC 速率一致的方式设置。这将允许解码器正确应用 TSC 数据包、MTC 数据包（基于核心晶体时钟或 ART，其频率由 CPUID.15H 指示）和 CBR 数据包（其指示处理器频率与 Max Non-Turbo 频率的比率）。没有此或缩放因子的单独指示，解码器将无法在追踪中正确跟踪时间。在 Intel PT 追踪内跟踪时间的细节见第 36.9.3 节。

#### 36.5.2.5 失败的 VM 进入

失败 VM 进入生成的数据包取决于 VMCS 配置以及失败的类型。要预期的结果显示在下面表中。注意斜体数据包可能生成也可能不生成，取决于实现选择和失败点。

**表 36-54. 失败 VM 进入上的数据包**

| 使用模型 | 进入配置 | 早期失败（落入下一个 IP） | 晚期失败（类 VM 退出） |
| --- | --- | --- | --- |
| 系统级 | 不使用"Load IA32_RTIT_CTL"进入控制或 VM 进入 MSR 加载区域 | TIP(NextIP) | CFE.VMENTRY, FUP(CLIP)（如果 EventEn=1） |
|     |     |     | PIP(Guest CR3, NR=1), TraceEn 0→1 数据包（见第 36.2.8.3 节）, PIP(HostCR3, NR=0), TIP(HostIP) |
| 仅 VMM | "Load IA32_RTIT_CTL"进入控制或 VM 进入 MSR 加载区域用于清除 TraceEn | TIP(NextIP) | TraceEn 0→1 数据包（见第 36.2.8.3 节）, TIP(HostIP) |
| 仅 VM | "Load IA32_RTIT_CTL"进入控制或 VM 进入 MSR 加载区域用于设置 TraceEn | 无   | 无   |

#### 36.5.2.6 VMX 中止

VMX 中止条件将处理器带入关闭状态。在导致 VMX 中止的 VM 退出上，可以生成一些数据包（FUP、PIP），但任何预期的 TIP、TIP.PGE 或 TIP.PGD 可能被丢弃。

## 36.6 追踪和 SMM 转移监视器（STM）

SMM 转移监视器（STM）是在 VMX 根操作中于 SMM 内部操作的 VMM。STM 与执行监视器结合操作。后者在 SMM 外部且处于 VMX 根操作。从执行监视器或其 VM 到 STM 的转换称为 SMM VM 退出。STM 通过 VM 进入到 VMX 非根操作中的 VM 或 VMX 根操作中的执行监视器从 SMM 返回。

Intel PT 支持 STM 中的追踪，类似于上面第 36.5 节描述的 VMX 操作追踪支持。因此，在由 #SMI 导致的 SMM VM 退出上，TraceEn 默认既不被保存也不被清除。软件可以使用 MSR 加载/保存列表保存追踪配置 MSR 的状态并清除 TraceEn。

在事件追踪内，SMM VM 退出生成指示 #SMI 和 VM 退出两者的数据包。类似地，从 SMM 返回的 VM 进入生成指示 RSM 和 VM 进入两者的数据包。由 VMCALL 指令发起的 SMM VM 退出不生成任何 CFE 数据包，尽管从 SMM 返回的后续 VM 进入将生成 CFE.RSM。

## 36.7 Intel® PT 触发器追踪

本节记录 Intel® 处理器追踪（Intel® PT）触发器追踪的架构，这是 Intel® PT 特性的补充，捕获关于软件执行的信息。

Intel PT 触发器追踪通过将性能监视计数器和调试断点等其他特性与处理器追踪链接，帮助软件更容易进行功能调试。它通过允许那些其他特性导致处理器追踪动作（如生成数据包或恢复/暂停追踪）来实现。这可以带来各种好处，从断点或性能事件的较低开销日志记录到仅基于内存访问模式或性能活动追踪期望块（例如，当每周期指令数降至 1 以下时追踪）。

PT 触发器追踪通过允许性能监视事件递增、溢出或调试断点匹配等输入导致"触发器事件"来实现此目标。当触发器事件发生时，硬件生成称为 TRIG 数据包的新 PT 数据包，其包含关于触发事件的信息。逻辑处理器可以实现许多触发器输入/动作（触发器单元）硬件单元，每个可以独立编程。PT 触发器追踪特性的存在、逻辑处理器中实现的触发器单元数量及其支持的能力使用 CPUID 叶 14H 枚举。

### 36.7.1 处理器追踪触发器追踪概述

处理器对 PT 触发器追踪的支持由 CPUID.14H.00H:EBX.PTTT\[9\] 枚举。当设置此位时，软件可以通过枚举 CPUID.14H.01H 子叶查询支持能力的细节。在 CPUID 叶 14H 中枚举的 PT 触发器追踪能力在系统中所有逻辑处理器之间一致。

#### 36.7.1.1 触发器单元

PT 触发器追踪特性包含多个触发器单元。每个触发器单元可以独立配置以选择用于触发器的输入和触发器事件发生时硬件要采取的动作。触发器单元可以使用第 36.7.2.1 节中描述的触发器配置 IA32_RTIT_TRIGGERx_CFG MSR 配置。每个触发器单元使用 IA32_RTIT_TRIGGERx_CFG MSR 中的 16 位配置。每个触发器配置 MSR 允许配置四个触发器单元。逻辑处理器中存在的 IA32_RTIT_TRIGGERx_CFG MSR 数量使用 CPUID.14H.01H:EAX\[10:8\] 枚举。

#### 36.7.1.2 触发器输入

在每个触发器单元的 16 位内，前七位（即，\[6:0\]、\[22:16\] 等）用于选择触发器输入。表 36-55 描述支持的触发器输入。

**表 36-55. 支持的触发器输入**

| 触发器输入编码 | 描述  |
| --- | --- |
| 00H—07H | PMC\[0..7\] 事件递增。如果 IA32_PERFEVTSELx_MSR.EN_PT_LOG = 1，每当所选性能计数器递增时，它将被视为 PT 触发器事件。 |
| 20H—27H | PMC\[0..7\] 溢出。如果 IA32_PERFEVTSELx_MSR.EN_PT_LOG = 1，每当所选性能计数器溢出时，它将被视为 PT 触发器事件。 |
| 40H—43H | DR\[0..3\] 断点匹配。如果 DR7.DRx_PT_LOG = 1，每当所选代码或数据断点匹配时，它将被视为 PT 触发器事件。这仅当 CPUID.14H.01H:ECX\[15\] = 1 时支持。 |
| 08H—1FH, 28H—3FH, 44H—7FH | 保留。 |

如果检测到 PT 触发器追踪能力（CPUID.14H.00H:EBX\[9\] = 1），则 PMC 事件递增和 PMC 溢出都被支持为有效触发器输入。

DRx 断点匹配能力由 CPUID.14H.01H:ECX\[15\] = 1 枚举。仅支持代码和数据断点匹配，不支持 I/O 断点。可以延迟数据断点（MOV/POP SS）的操作也延迟断点触发器事件。当设置相应 DRx_PT_LOG 位时，该断点将仅被识别为触发器事件（当正确启用时）且不挂起 #DB 异常或陷阱。

将保留触发器输入编码编程到触发器配置 MSR 不生成一般保护异常 #GP(0)，但何时以及是否导致触发器事件是未定义的。

#### 36.7.1.3 触发器动作

表 36-56 定义触发器动作。触发器输入可以有多个触发器动作。

**表 36-56. 触发器动作**

| 触发器单元中的位位置 | 描述  |
| --- | --- |
| 12  | TRACE_RESUME。当此位为 1 时，在触发器事件上恢复 PT 追踪。这仅当 CPUID.14H.01H:ECX\[1\] = 1 时支持。 |
| 13  | TRACE_PAUSE。当此位为 1 时，在触发器事件上暂停 PT 追踪。这仅当 CPUID.14H.01H:ECX\[1\] = 1 时支持。 |
| 14  | EN_ICNT。当此位=1 时，退役指令计数信息在 TRIG 数据包中将有效。这仅当 CPUID.14H.01H:ECX\[0\] = 1 时支持。 |
| 15  | EN。触发器单元启用。仅当此位为 1 时，触发器动作将发生。 |

当触发器单元的配置事件发生时，硬件为启用的触发器输入采取请求的触发器动作。如果请求 TRACE_PAUSE 触发器动作，则追踪被暂停，且设置新定义的 IA32_RTIT_STATUS.Paused\[8\] MSR 位（第 36.7.2.4 节）。如果请求 TRACE_RESUME 触发器动作，则追踪恢复且清除 IA32_RTIT_STATUS.Paused\[8\] MSR 位。如果请求 TRACE_PAUSE 和 TRACE_RESUME 动作两者，则硬件不采取任何动作且 IA32_RTIT_STATUS.Paused\[8\] 位保持不变。EN_ICNT 触发器动作允许追踪解码器确定导致触发器事件的指令的指令指针。来自相同触发器单元或不同触发器单元的多个触发器事件可能同时发生。在此情况下，恢复或暂停动作由导致触发器的最年轻指令的动作确定。

#### 36.7.1.4 编程考虑

软件应遵循这些编程指南以启用 PT 触发器追踪特性：

-   在配置触发器单元之前，软件应确保 IA32_RTIT_TRIGGERx_CFG MSR 中的触发器动作 EN 位保持清除。
-   软件应配置相应的性能监视计数器或调试寄存器，并在写入触发器输入以设置 EN 位之前设置相应的 IA32_PERFEVTSELx_MSR.EN_PT_LOG 或 DR7.DRx_PT_LOG 位。
-   软件应仅在触发器输入的所有字段（触发器输入和触发器动作两者）被填充时才设置 EN 位。
-   由于不支持的编码可能不生成故障，软件应特别小心仅使用支持的编码。

#### 36.7.1.5 触发器（TRIG）数据包

当启用的触发器单元的触发器事件发生时，如果 IA32_RTIT_STATUS.TriggerEn=1 且 IA32_RTIT_STATUS.FilterEn=1 且 IA32_RTIT_STATUS.Paused=0，将生成称为'TRIG 数据包'的新 PT 数据包。"Paused"是在第 36.7.2.4 节中定义的 IA32_RTIT_STATUS MSR 中添加的新状态位。

TRIG 数据包的格式在表 36-58 中定义。TRIG 数据包提供关于在一个周期中发生了哪些触发器（可能多个）的信息。

TRIG 数据包中的 ICNTV 位指示数据包是否包含 ICNT 字段。如果为该触发器单元请求 ICNT 触发器动作，TRIG 数据包将设置 ICNTV 为 1 并包括可用于确定哪个指令导致触发器的 ICNT 字段。ICNT 字段指示自上次 IP 指示（稍早发送，例如较早的 FUP、TIP、TIP.PGE、TNT、TRIG+ICNT 数据包）以来已退役的指令数。ICNT 字段是 16 位无符号值。ICNT 指令计数器可能溢出（即，当自上次 IP 指示以来已退役 2^16 条指令时）。在此溢出情况下，下一个触发器事件将生成带 ICNT 为 0 和 IP 为 1 的 TRIG 数据包，且其后跟包含与触发器链接的指令的指令指针的 FUP 数据包。像溢出情况一样，当 BranchEn=0 时，硬件将指示带 ICNT 为 0 和 IP 为 1 的后续 TRIG 数据包，后跟包含与触发器链接的指令的指令指针的 FUP 数据包。当 ContextEn=0 时，TRIG 数据包将具有 ICNTV=0，指示没有有效 ICNT 信息可用。如果 TNT 被用作最后 IP 指示，锚 IP 是最后 TNT 位的目标 IP，如果分支被采取则是分支目标，如果分支未被采取则是下一个 IP。当触发器是精确事件的 PMC 事件递增、对精确事件计数的 PDIR 计数器的 PMC 溢出或 DRx 断点匹配时，ICNT 信息将指示导致触发器的指令。当触发器由于非精确 PMC 事件递增或 PMC 溢出时，ICNT 信息将指示在事件发生后不久退役的指令。当触发器由于对精确事件计数的非 PDIR 计数器的 PMC 溢出时，ICNT 信息将指示在计数器溢出时或之后不久递增事件的指令（例如，可能有一些滑移）。此行为对应于 PEBS 如何为 PMC 溢出事件归属指令指针。

TRIG 数据包中的 TRBV 字段是位图，指示哪些触发器触发（可能多个）。每个触发器单元在 TRBV 中具有相应位。例如，如果触发器单元 3 的触发器事件触发并导致 TRIG 数据包，则 TRBV 的位 3 将在该 TRIG 数据包中被设置。如果多个触发器单元在相同周期触发，TRBV 中可能设置多个位。TRIG 数据包中的 MULT 字段允许追踪解码器识别 ICNT 字段适用于的指令（可能多个）。表 36-57 描述各种场景以及软件应如何解释 ICNT 字段。

**表 36-57. 多个触发器事件上的 ICNT**

| TRBV（位图） | MULT | ICNTV | 事件描述 |
| --- | --- | --- | --- |
| 无关  | 无关  | 0   | ICNT 字段不在 TRIG 数据包中，因为它未为任何触发器事件启用，或追踪在上下文外。如果 ContextEn=0，TRIG 数据包将具有 ICNTV = 0。 |
| 一位  | 0   | 1   | 来自单个指令的单个触发器触发。ICNT 值指导致触发器事件的指令。 |
| 一位  | 1   |     |     |
| 一位  | 1   | 1   | 单个触发器从相同周期退役的多个指令触发多次。ICNT 值指触发触发器的第一条指令。 |
| 多位  | 0   | 1   | 来自相同指令的多个触发器触发。ICNT 值指导致触发器事件的指令。 |
| 多位  | 1   | 1   | 来自相同周期退役的多个指令的多个触发器触发。ICNT 值指从最低数值顺序触发器触发的周期中的第一条指令。 |

TRIG 数据包是 CYC 合格的。此外，如果生成 TRIG 数据包时 TNT 缓冲区不为空，将在 TRIG 数据包之前生成 TNT 数据包。这允许追踪解码器识别导致触发器的指令而无需等待未来 TNT 数据包。

**表 36-58. TRIG 数据包定义**

| 名称  | 触发器（TRIG）数据包 |
| --- | --- |
| 格式  | 字节 0：1 1 0 1 1 0 0 1；字节 1：IP ICNTV MULT 保留；字节 2：TRBV；字节 3：ICNT\[7:0\]；字节 4：ICNT\[15:8\]。 |
| 生成场景 | 当触发器事件发生时生成 TRIG 数据包。 |
| 依赖  | TriggerEn 且 FilterEn 且 ~Paused 且 TriggerCfg.Action.En 且 TriggerInputEnabled。对于 PerfMon 触发器，TriggerInputEnabled = PMC Enabled 且 PERFEVTSELx.EN_PT_LOG。对于调试断点触发器，TriggerInputEnabled = DRx Enabled 且 DR7.DRx_PT_LOG。 |
| 描述  | 此数据包指示一个或多个触发器在相同周期发生。IP− 设置以指示此触发器数据包是否消费下面的 FUP 数据包。ICNTV− 设置指示 ICNT 字段存在且有效。仅当启用 EN_ICNT 触发器动作时设置。ICNT− 仅当 ICNTV=1 时存在。指示自上次 IP 指示参考数据包（FUP、TIP\*、TNT、TRIG+ICNT）以来已退役的指令数。它是 16 位无符号值。MULT− 指示多个指令导致触发器。当设置时，ICNT 值指从最低阶触发器单元触发的周期中的第一条指令。TRBV− 触发器位向量。指示触发并由此数据包表示的所有触发器（可能多个）。 |
| 应用  | TRIG 数据包指示触发器事件何时发生。如果设置 IP 位，将跟随独立的 FUP，且 TRIG 消费该 FUP。FUP 数据包提供触发器事件的精确 IP，且在此情况下 ICNT 将为零。如果未设置 IP 位，TRIG 是独立的，且 ICNT 指示自最后一个锚数据包（是前面的 TIP、TIP.PGE、FUP、TNT 或带 ICNTV=1 的 TRIG）以来已退役的指令数。在 TNT 的情况下，锚 IP 是最后 TNT 位的目标 IP，如果分支被采取则是分支目标，如果分支未被采取则是下一个 IP。当 ContextEn=0 时，ICNTV 被清除为 0。当 BranchEn=0 时，ICNTV=1、IP=1、ICNT=0，指向导致触发器的指令。 |

### 36.7.2 MSR 更改

新和当前 MSR 更改在下面的小节中描述。

#### 36.7.2.1 IA32_RTIT_TRIGGERx_CFG

IA32_RTIT_TRIGGERx_CFG MSR 允许配置单个触发器单元。具体来说，它允许用户选择触发器的输入以及触发器事件发生时采取的动作。支持的 IA32_RTIT_TRIGGERx_CFG MSR 数量在 CPUID.14H.01H:EAX\[10:8\] 字段中指示。

#### 36.7.2.2 IA32_PERFEVTSELx MSR 更改

IA32_PERFEVTSELx MSR 是描述性能计数器配置的现有 MSR。当支持 PT 触发器追踪时，新位 38 被定义为 EN_PT_LOG。如果 EN_PT_LOG 被设置为 1，该性能计数器可以用作 IA32_RTIT_TRIGGERx_CFG.Input 字段中的触发器输入。

```python
63                                         38        31             24 23 22 21 20 19 18 17 16 15        8  7            0
┌─────────────────────────────────────────┬───────┬─────────────────┬────────────────────────────┬───────────────┬───────────────┐
│ 计数器掩码 (CMASK)                        │EN_PT_LOG│ 事件选择          │ 单元掩码 (UMASK)             │ INV  ANY INT  USR │ OS            │
└─────────────────────────────────────────┴───────┴─────────────────┴────────────────────────────┴───────────────┴───────────────┘
EN_PT_LOG—启用为触发器输入
INV—反转计数器掩码
EN—启用计数器
ANY—任何线程
INT—APIC 中断启用
PC—引脚控制
E—边沿检测
保留
OS—操作系统模式
USR—用户模式
```

**图 36-4. IA32_PERFEVTSELx MSR 布局**

#### 36.7.2.3 DR7 更改

DR7 调试控制寄存器是可用于启用调试断点匹配的现有架构寄存器。如果实现支持 DR 断点匹配作为 PT 触发器追踪触发器输入（由 CPUID.14H.01H:ECX\[15\]=1 指示），则 DR7 的第 \[35:32\] 位被描述为 DRx_PT_LOG 位，四位对应 DR0-3。注意仅在 64 位模式中，对 DR7 的 MOV 更改 DR7 的上部。

#### 36.7.2.4 IA32_RTIT_STATUS 更改

作为 PT 触发器追踪的一部分，向 IA32_RTIT_STATUS 寄存器添加新的"Paused"位。当发生 PT 触发器追踪暂停触发器动作时，硬件设置此位。当发生 PT 触发器追踪恢复触发器动作时，硬件清除此位。Paused 位具有读/写语义。希望在到达触发器后才开始追踪的软件可以在设置 TraceEn 位之前手动设置 Paused=1。当 Paused=1 时，依赖 FilterEn=1 的数据包将被抑制。PacketEn 具有以下更新语义：

```python
PacketEn := BranchEn AND TriggerEn AND ContextEn AND FilterEn AND !Paused
```

注意，如第 36.2.6.3 节中定义，导致 PacketEn 转换的 Paused 位转换也将导致硬件生成 PGE/PGD 数据包。此类 PGE/PGD 数据包可能具有小滑移。

## 36.8 数据包生成场景

以下表为各种操作提供数据包生成的示例。以下缩写用于下面的数据包示例：

-   CLIP - 当前 LIP
-   NLIP - 下一个顺序 LIP
-   BLIP - 分支目标 LIP

表 36-59 说明由一系列示例操作生成的数据包，假设在操作之前和之后设置 PacketEn（TriggerEn 且 ContextEn 且 FilterEn 且 BranchEn）。

**表 36-59. 不同示例操作下的数据包生成**

| 案例  | 操作  | 细节  | 数据包 |
| --- | --- | --- | --- |
| 1   | 正常非跳转操作 |     | 无   |
| 2   | 条件分支 | 内部 TNT 缓冲区中的第 6 个分支 | TNT |
| 3   | 条件分支 | 内部 TNT 缓冲区中的第 1..5 个分支 | 无   |
| 4   | 近间接 JMP 或 CALL |     | TIP(BLIP) |
| 5   | 直接近 JMP 或 CALL |     | 无   |
| 6   | 近 RET | 非压缩 | TIP(BLIP) |
| 7   | 近 RET | 压缩，内部 TNT 缓冲区中的第 6 个分支 | TNT |
| 8   | 远分支 | 假设不更新 CR3、CS.L 或 CS.D | TIP(BLIP) |
| 9   | 远分支 | 假设更新 CR3 | PIP(NewCR3), TIP(BLIP) |
| 10  | 远分支 | 假设更新 CR3 和 CS.D/CS.L | PIP(NewCR3), MODE.Exec, TIP(BLIP) |
| 11  | 外部中断或 NMI | 假设不更新 CR3、CS.D 或 CS.L | FUP(NLIP), TIP(BLIP) |
| 12  | 外部中断或 NMI | 假设更新 CR3 和 CS.D/CS.L | FUP(NLIP), PIP(NewCR3), MODE.Exec, TIP(BLIP) |
| 13  | 异常/故障或软件中断 | 假设不更新 CR3、CS.D 或 CS.L | FUP(CLIP), TIP(BLIP) |
| 14  | MOV 到 CR3 |     | PIP(NewCR3, NR) |
| 15  | VM 退出 | 假设系统级追踪，见第 36.5.2.1 节 | 见表 36-53 |
| 16  | VM 进入 | 假设系统级追踪，见第 36.5.2.1 节 | 见表 36-53 |
| 17  | ENCLU\[EENTER\] / ENCLU\[ERESUME\] / ENCLU\[EEXIT\] / AEX/EEE | 仅调试飞地允许在飞地执行期间设置 PacketEn。假设 CS.L 或 CS.D 不变。 | FUP(CLIP), TIP(BLIP) |
| 18  | XBEGIN/XACQUIRE/XEND/XRELEASE | 不开始/结束事务执行 | 无   |
| 19  | XBEGIN/XACQUIRE | 假设事务执行开始 | MODE.TSX(InTX=1, TXAbort=0), FUP(CLIP) |
| 20  | XEND/XRELEASE | 完成事务 | MODE.TSX(InTX=0, TXAbort=0), FUP(CLIP) |
| 21  | XABORT 或异步中止 | 中止事务执行 | MODE.TSX(InTX=0, TXAbort=1), FUP(CLIP), TIP(BLIP) |
| 22  | INIT | 在 BSP 上。假设无 CR3、CS.D 或 CS.L 更新。 | FUP(NLIP), TIP(ResetLIP) |
| 23  | INIT | 在 AP 上，进入等待-SIPI。假设无 CR3 更新。 | FUP(NLIP) |
| 24  | SIPI | 假设无 CS.D 或 CS.L 更新 | TIP.PGE(SIPI.LIP) |
| 25  | 从比 C0.1 更深的唤醒、P 状态更改或定时数据包（MTC、CYC）可能已停止的其他场景 | 如果 TSCEn=1 则 TSC；如果 TSCEn=MTCEn=1 则 TMA | TSC?, TMA?, CBR |
| 26  | UINTR | 用户中断处理程序进入。 | FUP(NLIP), TIP(BLIP) |
| 27  | UIRET | 从用户中断处理程序退出。 | TIP(BLIP) |

表 36-60 说明操作改变 PacketEn 值的示例场景中生成的数据包。注意这里不包括 PSB+ 的插入，尽管它可以与 Intel PT 的初始启用同时发生。细节见第 36.3.7 节。

**表 36-60. 改变 PacketEn 值的操作的数据包生成**

| 案例  | 操作  | PktEn 之前 | PktEn 之后 | CntxEn 之后 | 细节  | 数据包 |
| --- | --- | --- | --- | --- | --- | --- |
| 1   | 改变 TraceEn 0 → 1 的 WRMSR/XRSTORS | 0   | 1   | 0   | 如果 TSCEn=1 则 TSC；如果 TSCEn=MTCEn=1 则 TMA | TSC?, TMA?, CBR, MODE.Exec |
| 2   | 改变 TraceEn 0 → 1 的 WRMSR/XRSTORS | 0   | 1   | 1   | 如果 TSCEn=1 则 TSC；如果 TSCEn=MTCEn=1 则 TMA | TSC?, TMA?, CBR, MODE.Exec, TIP.PGE(NLIP) |
| 3   | 改变 TraceEn 1 → 0 的 WRMSR | 1   | 0   |     |     |     |
| 3   | 改变 TraceEn 1 → 0 的 WRMSR | 1   | 0   | D.C. |     | FUP(CLIP), TIP.PGD() |
| 4   | 采取分支 | 1   | 0   | 1   | 源在 IP 过滤区域中。目标在 IP 过滤区域外。 | TIP.PGD(BLIP) |
| 5   | 采取分支、中断、EEXIT 等 | 0   | 1   | 1   | 源在 IP 过滤区域外。目标在 IP 过滤区域中。 | TIP.PGE(BLIP) |
| 6   | 远分支、中断、EENTER 等 | 1   | 0   | 0   | 要求更改 CPL 或 CR3，或进入选择退出飞地。 | TIP.PGD() |
| 7   | 陷阱类事件（外部中断、NMI、VM 退出/进入等） | 1   | 0   | 0   | 要求更改 CPL 或 CR3。 | FUP(NLIP), TIP.PGD() |
| 8   | 故障类事件（异常/故障、软件中断、VM 退出/进入等） | 1   | 0   | 0   | 要求更改 CPL 或 CR3。 | FUP(CLIP), TIP.PGD() |
| 9   | SMI、VM 退出/进入 | 1   | 0   | 0   | TraceEn 被清除。 | FUP(NLIP), TIP.PGD() |
| 10  | RSM、VM 退出/进入 | 0   | 1   | 1   | TraceEn 被设置。启用的数据包见案例 2。FUP/TIP.PGE IP 是 BLIP。 | FUP(VMCSg.RIP), TIP.PGD() |
| 11  | VM 退出 | 1   | 0   | 0   | 假设仅访客追踪，见第 36.5.2.2 节。TraceEn 被清除。 | TIP.PGE(VMCSg.RIP) |
| 12  | VM 进入 | 0   | 1   | 1   | 假设仅访客追踪，见第 36.5.2.2 节。TraceEn 被设置。 |     |

表 36-61 说明假设 TriggerEn 且 PTWEn 为真时的 PTWRITE 示例。

**表 36-61. TriggerEn 且 PTWEn 为真时 PTWRITE 的示例**

| 案例  | 操作  | ContextEn | 细节  | 数据包 |
| --- | --- | --- | --- | --- |
| 1   | PTWRITE rm32/64 | 0   |     | 无   |
| 2   | PTWRITE rm32 | 1   | 如果 FUPonPTW=1，FUP、PTW.IP=1 | PTW(IP=1?, 4B, rm32_value), FUP(CLIP)? |
| 3   | PTWRITE rm64 | 1   | 如果 FUPonPTW=1，FUP、PTW.IP=1 | PTW(IP=1?, 8B, rm64_value), FUP(CLIP)? |

表 36-62 说明假设 TriggerEn 且 PwrEvtEn 为真时的电源事件追踪示例。

**表 36-62. TriggerEn 且 PwrEvtEn 为真时电源事件追踪的示例**

| 案例  | 操作  | ContextEn 且 FilterEn | 细节  | 数据包 |
| --- | --- | --- | --- | --- |
| 1   | MWAIT/UMWAIT 获得故障或 VM 退出。 | D.C. | 无。其他追踪源可以在故障或 VM 退出时生成数据包。 | 无   |
| 2   | MWAIT/UMWAIT 请求 C0，或监视器未武装，或 VMX 虚拟中断交付。 | D.C. |     | 无   |
| 3   | MWAIT/UMWAIT 进入比 C0.1 更深的 C 状态。 | 0   |     | PWRE(Cx), EXSTOP |
| 4   | MWAIT/UMWAIT 进入比 C0.1 更深的 C 状态。 | 1   |     | MWAIT(Cy), PWRE(Cx), EXSTOP(IP), FUP(CLIP) |
| 5   | HLT、三重故障关闭、进入 C1 的其他操作。 | 1   |     | PWRE(C1), EXSTOP(IP), FUP(CLIP) |
| 6   | 硬件占空循环（HDC）。 | 1   | 如果 TSCEn=1 则 TSC；如果 TSCEn=MTCEn=1 则 TMA | PWRE(HW, C6), EXSTOP(IP), FUP(NLIP), TSC?, TMA?, CBR, PWRX(CC6, CC6, 0x8) |
| 7   | Cx 期间的唤醒事件（x > 0）。 | D.C. | 如果 TSCEn=1 则 TSC；如果 TSCEn=MTCEn=1 则 TMA。其他追踪源可以为唤醒操作（例如，中断）生成数据包。 | TSC?, TMA?, CBR, PWRX(LCC, DCC, 0x1) |

表 36-63 说明假设 TriggerEn 且 ContextEn 且 EventEn 为真时的事件追踪示例。在所有情况下，其他追踪源（例如，BranchEn），如果启用，可以生成额外数据包。细节见本节其他表。

**表 36-63. TriggerEn 且 ContextEn 且 EventEn 为真时的事件追踪示例**

| 案例  | 操作  | ContextEn 之前 | ContextEn 之后 | 细节  | 数据包 |
| --- | --- | --- | --- | --- | --- |
| 1   | IRET、ERETS、ERETU | 1   | D.C. |     | CFE.IRET(IP=1), FUP(CLIP) |
| 2   | IRET、ERETS、ERETU | 0   | 1   |     | CFE(IRET) |
| 3   | 外部中断，包括 NMI | 1   | D.C. |     | CFE.INTR(IP=1, Vector), FUP(NLIP) |
| 4   | 外部中断，包括 NMI | 1   | 1   | 假设 BranchEn=1，说明共享 FUP。 | CFE.INTR(IP=0, Vector), FUP(NLIP), TIP(BLIP) |
| 5   | 软件中断（无 FRED）、#PF 以外的异常/故障 | 1   | D.C. |     | CFE.INTR(IP=1, Vector), FUP(CLIP) |
| 6   | 页故障（#PF） | 1   | D.C. |     | EVD.PFA, CFE.INTR(IP=1,14), FUP(CLIP) |
| 7   | 页故障（#PF） | 0   | D.C. |     | 无   |
| 10  | SMI | 1   | D.C. |     | CFE.SMI(IP=1), FUP(NLIP) |
| 11  | RSM，TraceEn 恢复到 1 | D.C. | 1   |     | CFE.RSM(IP=0) |
| 12  | 进入关闭 | 1   | D.C. |     | CFE.SHUTDOWN(IP=1), FUP(CLIP) |
| 13  | 由中断、故障或 SMI 导致的 VM 退出 | 1   | D.C. | 假设"Conceal VMX in PT"退出控制为 0。 | EVD.VMXQ, EVD.VMXR, CFE.VMEXIT_INTR(IP=1, Vector), FUP(VMCSg.LIP) |
| 14  | 由中断、故障或 SMI 以外导致的 VM 退出 | 1   | D.C. | 假设"Conceal VMX in PT"退出控制为 0。 | EVD.VMXQ, EVD.VMXR, CFE.VMEXIT(IP=1), FUP(VMCSg.LIP) |
| 15  | 由中断、故障或 SMI 以外导致的 VM 退出 | 0   | 1   | 假设"Conceal VMX in PT"退出控制为 0。 | CFE.VMEXIT(IP=0) |
| 16  | VM 进入 | 1   | D.C. | 假设"Conceal VMX in PT"进入控制为 0。 | CFE.VMENTRY(IP=1), FUP(VMCSh.LIP) |
| 17  | AEX/EEE，来自选择退出（非调试）飞地 | 0   | 0   |     | 无   |
| 18  | AEX/EEE，来自选择退出（非调试）飞地 | 0   | 1   |     | CFE.INTR(IP=0) |
| 19  | AEX，来自选择进入（调试）飞地 | 1   | D.C. |     | CFE.INTR(IP=1, Vec), FUP(AEP LIP) |
| 20  | INIT | 1   | D.C. |     | CFE.INIT(IP=1), FUP(NLIP) |
| 21  | SIPI | 1   | D.C. |     | CFE.SIPI(IP=0) |
| 22  | STI/CLI/POPF | 1   | 1   | 假设更改 RFLAGS.IF。 | MODE.Exec, FUP(NLIP) |
| 23  | 软件中断（带 FRED） | 1   | D.C. |     | CFE.SWINTR(IP=1, Vector), FUP(CLIP) |
| 24  | SYSCALL、SYSENTER（带 FRED） | 1   | D.C. |     | CFE.SYSCALL(IP=1), FUP(CLIP) |

## 36.9

## 36.9 软件考虑

### 36.9.1 追踪 SMM 代码

没有什么阻止 SMM 处理程序为自身使用配置和启用数据包生成。如第 36.2.9.3 节所述，SMI 将总是清除 TraceEn，因此 SMM 处理程序将不得不设置 TraceEn 以启用追踪。涉及追踪 SMM 代码有一些独特方面和指南，如下：

1.  SMM 应保存 SMM 打算为追踪修改的任何配置 MSR 的现有值。这将允许在 RSM 之前恢复非 SMM 追踪上下文。
2.  建议 SMM 等到将 CSbase 设置为 0 后才启用数据包生成，以避免可能的 LIP 对 RIP 混淆。
3.  即使在 SMM 中追踪时，数据包输出也不能导向 SMRR 内存。
4.  在执行 RSM 之前，SMM 应小心将修改的配置 MSR 恢复到它们在 #SMI 之后立即具有的值。这涉及首先通过清除 TraceEn 禁用数据包生成，然后恢复任何其他被修改的配置 MSR。
5.  RSM
    -   软件必须确保 RSM 时 TraceEn=0。追踪 RSM 不是受支持的使用模型，且 RSM 生成的数据包是未定义的。
    -   对于 Intel PT 和 LBR 使用互斥的处理器（见第 36.3.1.2 节），在 TraceEn 被恢复到 1 的任何 RSM 期间将挂起任何 LBR 或 BTS 日志记录。

### 36.9.2 多个追踪收集代理的协作转换

第三方追踪收集工具应考虑其可能部署在支持 Intel PT 但可能在任何操作系统下运行的处理器上的事实。

在此类部署场景中，Intel 建议工具代理遵循单次使用硬件资源的协作转换的类似原则，类似于性能监视工具如何处理性能监视硬件：

-   尊重已配置追踪配置 MSR 的代理的"使用中"所有权，见《Intel® 64 和 IA-32 架构软件开发手册》第 4 卷第 2 章"Model-Specific Registers (MSRs)"中带前缀"IA32_RTIT\_"的架构 MSR，其中"使用中"可以通过读取配置 MSR 中的"启用位"确定。
-   通过清除那些配置 MSR 的"启用位"放弃追踪配置 MSR 的所有权。

### 36.9.3 跟踪时间

本节描述几个时钟计数器的关系，其更新频率位于馈入定时数据包的不同域。要跟踪时间，解码器还需要知道存储那些时钟计数器的各种定时数据包出现的规律性或不规律性。

Intel PT 为三个不同但相关的域提供时间信息：

-   **处理器时间戳计数器**  
    此计数器以最大非 Turbo 或 P1 频率递增，且其值在 RDTSC 上返回。其频率固定。TSC 数据包持有时间戳计数器值的较低 7 个字节。TSC 数据包偶尔发生，远不如时间戳计数器的频率频繁。时间戳计数器在处理器处于深度 C 状态时将继续递增，报告 CPUID.80000007H:EDX.TSC_INVARIANT\[8\] =0 的处理器除外。
-   **核心晶体时钟**  
    核心晶体时钟与时间戳计数器频率的比率称为 P，可以计算为 CPUID.15H:EBX\[31:0\] / CPUID.15H:EAX\[31:0\]。核心晶体时钟的频率固定且低于时间戳计数器。周期 MTC 数据包基于软件选择的晶体时钟频率倍数生成。MTC 数据包预期比 TSC 数据包更频繁发生。
-   **处理器核心时钟**  
    处理器核心时钟频率可以由于 P 状态和热条件变化。CYC 数据包提供相对于最后一个 CYC 数据包以处理器核心时钟周期测量的已过时间。

解码器可以使用这些数据包的全部或某些组合在整个追踪数据包中以不同分辨率跟踪时间。

#### 36.9.3.1 时间域关系

三个域由以下公式相关：

```python
TimeStampValue = (CoreCrystalClockValue * P) + AdjustedProcessorCycles + Software_Offset
```

CoreCrystalClockValue（也称为 Always Running Timer（ART）值）可以提供 TSC 值的粗粒度分量。P 或 TSC/ART 比率可以从 CPUID.15H 推导，如第 36.9.3 节所述。

AdjustedProcessorCycles 分量提供距最后一个核心晶体时钟上升沿的细粒度距离。具体来说，它是从最后一个晶体时钟上升沿以来以与时间戳计数器相同频率的周期计数。该值基于处理器核心时钟频率与最大非 Turbo（或 P1）频率的比率调整。

Software_Offsets 分量包括计入时间戳值的软件偏移，如 IA32_TSC_ADJUST。

#### 36.9.3.2 在 Intel PT 内估计 TSC

对于许多用途，为追踪中的所有点具有估计的时间戳值可能有用。上面第 36.9.3.1 节提供的公式提供如何从追踪中存在的各种定时数据包计算此类估计的框架。

TSC 数据包在生成时提供精确时间戳值；然而，TSC 数据包不频繁，且纯粹基于 TSC 数据包的当前时间戳值估计很可能因此非常不准确。为在 TSC 数据包之间获得更精确的定时信息，应启用 CYC 数据包和/或 MTC 数据包。

MTC 数据包提供 CoreCrystalClockValue 的增量更新。在支持 CPUID.15H 的处理器上，时间戳计数器和核心晶体时钟的频率固定，因此 MTC 数据包提供更新运行中时间戳估计的手段。在两个 MTC 数据包 A 和 B 之间，已过的晶体时钟周期数从相应 MTC 数据包的 8 位载荷计算：

```python
(CTCB - CTCA)，其中 CTCi = MTCi[15:8] << IA32_RTIT_CTL.MTCFreq 且 i = A, B。
```

从 TSC 数据包到后续 MTC 数据包的时间可以使用跟随 TSC 数据包的 TMA 数据包计算。TMA 数据包提供晶体时钟值（较低 16 位，在 CTC 字段中）和可用于计算 TSC 数据包的相应核心晶体时钟值的 AdjustedProcessorCycles 值（在 FastCounter 字段中）。

当看到 TSC/TMA 对之后的下一个 MTC 时，自 TSC 数据包以来已过的晶体时钟数可以通过从 MTCNext 数据包指示的时间减去 TMA.CTC 值计算：

```python
CTCDelta[15:0] = (CTCNext[15:0] - TMA.CTC[15:0])，其中 CTCNext = MTCPayload << IA32_RTIT_CTL.MTCFreq。
```

TMA.FastCounter 字段提供自最后一个晶体时钟上升沿以来的 AdjustedProcessorCycles 数，从中可以确定 TSC 数据包时下一个晶体时钟周期已过的百分比。

CYC 数据包可以通过提供其他定时数据包（MTC 或 TSC）之间已过时间的指示，为许多非定时数据包提供估计时间戳值的进一步精度。

当启用时，CYC 数据包在每个 CYC 合格数据包之前发送，并提供自最后一个 CYC 数据包以来已过的处理器核心时钟周期数。因此在 MTC 和 TSC 之间，累积的 CYC 值可以用于估计时间戳值的 AdjustedProcessorCycles 分量。累积的 CPU 周期将需要调整以考虑处理器核心时钟与 P1 频率之间的频率差异。必要的调整可以使用 CBR 数据包中给出的核心:总线比率值估计，通过将累积周期计数值乘以 P1/CBRpayload。

注意独立 TSC 数据包（即，不是 PSB+ 一部分的 TSC 数据包）通常仅在其他定时数据包（MTC 和 CYC）的生成已停止一段时间时生成。示例场景包括当 Intel PT 被重新启用时，或在睡眠状态后唤醒时。因此任何对 TSC 数据包之前时间戳值的计算估计很可能导致差异，TSC 数据包用于纠正该差异。

通过计算 CPU 时钟频率可以实现更高水平的精度，下面第 36.9.3.4 节提供使用 Intel PT 数据包这样做的方法。

即使没有 MTC，CYC 也可以用于估计 TSC 之间的时间，尽管这很可能导致估计 TSC 精度的降低。

#### 36.9.3.3 VMX TSC 操纵

当软件在非根操作中执行时，额外的偏移和缩放因子可以应用于 TSC 值。这些是可选的，但可以通过 VMCS 控制按每 VM 启用。VMX TSC 偏移和 TSC 缩放的细节见第 28 章"VMX Non-Root Operation"。

像 RDTSC 返回的值一样，TSC 数据包将包括这些调整，但其他定时数据包（如 MTC、CYC 和 CBR）不受影响。为了在使用 TSC 缩放时使用上面算法估计 TSC 值，软件将需要考虑缩放因子。细节见第 36.5.2.4 节。

#### 36.9.3.4 用 Intel PT 计算频率

因为 Intel PT 可以提供挂钟时间和处理器时钟周期时间两者，它可以用于测量处理器核心时钟频率。TSC 或 MTC 数据包都可以用于跟踪挂钟时间。通过使用 CYC 数据包计数一对挂钟时间数据包之间经过的处理器核心周期数，可以推导处理器核心时钟频率与 TSC 频率之间的比率。如果知道 P1 频率，可以应用它确定 CPU 频率。TSC、MTC 和 CYC 之间关系的细节见上面第 36.9.3.1 节。

（第 36 章完）
