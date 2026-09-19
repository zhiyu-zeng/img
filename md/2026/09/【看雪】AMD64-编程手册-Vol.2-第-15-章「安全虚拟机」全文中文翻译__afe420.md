---
title: 【看雪】AMD64 编程手册 Vol.2 第 15 章「安全虚拟机」全文中文翻译
source: https://bbs.kanxue.com/thread-292992.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-19T23:31:29+08:00
trace_id: ee4e7fe3-ec95-4ba8-bc16-d56b4d3636ac
content_hash: 2c2492b99042508e69c85e39b68d4231ecd13617a79b4bbe263721a1c06bfab7
status: synced
tags:
  - 看雪
  - AMD SVM
  - SEV
series: null
feed_source: 看雪·逆向工程
ai_summary: AMD SVM通过VMRUN/#VMEXIT、VMCB拦截等硬件机制实现高效虚拟化，并以SEV/SEV-SNP扩展提供内存加密与完整性保护，防止恶意hypervisor攻击。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e075244-d011-81cf-8485-e684b65eb049
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> AMD SVM通过VMRUN/#VMEXIT、VMCB拦截等硬件机制实现高效虚拟化，并以SEV/SEV-SNP扩展提供内存加密与完整性保护，防止恶意hypervisor攻击。
> 
> - **状态切换：** VMRUN从VMCB加载客户状态进入客户模式，#VMEXIT在拦截触发时保存客户状态并返回主机；VMSAVE/VMLOAD补充完整上下文切换。
> - **拦截机制：** 通过VMCB控制位拦截敏感操作（CR/DR访问、IOIO、MSR、异常、中断等），VMM可模拟；指令拦截优先级有明确定义。
> - **安全扩展：** SEV加密客户内存，SEV-ES额外加密寄存器状态，SEV-SNP引入反向映射表（RMP）验证页归属并支持安全嵌套分页，防止hypervisor篡改。
> - **辅助功能：** TLB控制支持ASID标记与选择性刷新；全局中断标志GIF（STGI/CLGI）控制中断接收；VMMCALL供客户主动调用VMM。
> - **高级虚拟化：** AVIC/Secure AVIC虚拟化中断控制器，支持直接中断投递；IBS/PMC虚拟化允许客户使用性能监控；推测控制与侧信道保护（BTB隔离等）。

> 来源：AMD64 Architecture Programmer's Manual, Volume 2: System Programming（24593—Rev. 3.45—July 2026），第 15 章，第 519–649 页。  
> 翻译说明：指令助记符（如 VMRUN）、寄存器/位域名（如 EFER.SVME）、专用术语保留英文原文；正文译为中文。

AMD 虚拟化™（AMD-V™）架构旨在支持企业级服务器虚拟化软件技术，并通过安全虚拟机（Secure Virtual Machine，SVM）扩展，促进虚拟化在任何类型系统上的开发与部署。支持 SVM 的虚拟机架构提供了硬件资源，使单台物理机器能够高效运行多个操作系统，同时维持安全、由硬件强制执行的隔离。

## 15.1 虚拟机监视器（The Virtual Machine Monitor）

虚拟机监视器（virtual machine monitor，VMM），又称 hypervisor，由在单台物理机器上控制多个客户操作系统执行的软件组成。VMM 为每个客户呈现其对完整计算机系统（内存、CPU 及所有外设）拥有完全控制权的假象。术语 host（主机）指 VMM 的执行上下文。World switch（世界切换）指在主机与客户之间切换的操作。与未虚拟化的系统一样，一个客户可以拥有一个或多个由客户 OS 管理的虚拟 CPU（vCPU），VMM 可以在不同逻辑处理器上同时运行来自同一或不同客户的任意 vCPU 组合，不受硬件强加的任何约束。

从根本上说，VMM 的工作方式是以安全方式拦截并模拟客户中的敏感操作（例如修改页表——这可能使客户访问到其无权访问的内存，或访问多个客户共享的外设）。AMD SVM 架构提供了硬件辅助，以提高性能并促进虚拟化的实现。

## 15.2 SVM 硬件概述（SVM Hardware Overview）

SVM 处理器支持提供了一组硬件扩展，旨在实现经济高效的虚拟机系统。一般而言，硬件支持分为两个互补的类别：虚拟化支持与安全支持。

### 15.2.1 虚拟化支持（Virtualization Support）

AMD 虚拟机架构旨在提供：

-   客户/主机标记的 TLB，以减少虚拟化开销
-   针对内存的外部（DMA）访问保护
-   中断处理辅助、虚拟中断支持以及增强的暂停过滤器（pause filter）
-   拦截客户中选定指令或事件的能力
-   在 VMM 与客户之间快速世界切换的机制

### 15.2.2 客户模式（Guest Mode）

这种新的处理器模式通过 VMRUN 指令进入。在客户模式下，某些 x86 指令的行为会发生变化，以促进虚拟化。

CPUID 功能号 4000_0000h–4000_00FFh 已保留供软件使用。Hypervisor 可以使用这些功能号提供接口，将信息从 hypervisor 传递给客户。这类似于使用 CPUID 提取物理 CPU 的信息。Hypervisor 使用 CPUID Fn 400000\[FF:00\] 位来指示虚拟平台。

功能位 CPUID Fn0000_0001_ECX\[31\] 已保留供 hypervisor 使用，以指示 hypervisor 的存在。Hypervisor 将该位设为 1，物理 CPU 将该位设为零。客户软件可以探测该位，以检测其是否运行在虚拟机内部。

### 15.2.3 外部访问保护（External Access Protection）

客户可以被授予对选定 I/O 设备的直接访问权。硬件支持旨在防止一个客户拥有的设备访问另一个客户（或 VMM）拥有的内存。

### 15.2.4 中断支持（Interrupt Support）

为促进中断的高效虚拟化，在 VMCB 标志的控制下提供以下支持：

**拦截物理中断投递。** VMM 可以请求物理中断导致正在运行的客户退出，从而允许 VMM 处理该中断。

**虚拟中断。** VMM 可以向客户注入虚拟中断。在 VMM 的控制下，EFLAGS.IF 中断屏蔽位的虚拟副本以及 APIC 任务优先级寄存器的虚拟副本被客户透明地使用，而非使用物理资源。

**共享物理 APIC。** SVM 允许多个客户共享一个物理 APIC，同时将每个客户对 APIC 状态的操作与其他客户对其自身 APIC 状态的视图相隔离，从而使任何客户都无法干扰向另一个客户的中断投递。

**直接中断投递。** 在支持该功能的型号上，高级虚拟中断控制器（Advanced Virtual Interrupt Controller，AVIC）扩展虚拟化了 APIC 的中断投递功能。这支持将设备中断或处理器间中断直接投递到目标 vCPU 或 vCPUs，避免了 VMM 确定中断路由的开销，并加快了中断投递速度。（见第 15.29 节。）

### 15.2.5 可重启指令（Restartable Instructions）

SVM 设计为在拦截之后安全地重启任何被拦截的指令（原子性或幂等性指令），任务切换除外。

### 15.2.6 安全支持（Security Support）

为进一步支持安全初始化和执行，SVM 通过多种扩展提供额外的系统支持。

**认证（Attestation）。** SKINIT 指令及相关的系统支持（可信平台模块，即 TPM）允许基于安全哈希比较对受信任软件（如 hypervisor 或本机操作系统）进行可验证的启动。（第 15.27 节。）

**加密内存（Encrypted memory）。** 在支持该功能的型号上，安全加密虚拟化（Secure Encrypted Virtualization，SEV）和 SEV 加密状态（SEV Encrypted State，SEV-ES）扩展通过对客户内存和寄存器内容进行加密，防止恶意 hypervisor 代码、内存总线跟踪或内存设备移除对客户内存及（对于 SEV-ES）客户寄存器状态的窥探（第 15.34 节和第 15.35 节）。

**安全嵌套分页（Secure Nested Paging）。** 在支持该功能的型号上，SEV-SNP 扩展为客户内存提供额外保护，防止 hypervisor 代码对地址转换机制进行恶意篡改。（第 15.36 节。）

## 15.3 SVM 处理器与平台扩展（SVM Processor and Platform Extensions）

SVM 硬件扩展可分为以下类别：

-   **状态切换**——VMRUN、VMSAVE、VMLOAD 指令、全局中断标志（GIF）以及操作后者的指令（STGI、CLGI）。（第 15.5 节、第 15.5.2 节、第 15.17 节）
-   **拦截（Intercepts）**——允许 VMM 拦截客户中的敏感操作。（第 15.7 节至第 15.14 节）
-   **中断与 APIC 辅助**——物理中断拦截、虚拟中断支持、APIC.TPR 虚拟化。（第 15.17 节和第 15.21 节）
-   **SMM 拦截与辅助** （第 15.22 节）
-   **外部（DMA）访问保护** （第 15.24 节）
-   **支持两级地址转换的嵌套分页** （第 15.25 节）
-   **安全**——SKINIT 指令。（第 15.27 节）

## 15.4 启用 SVM（Enabling SVM）

当 EFER.SVME 置 1 时，可以使用 VMRUN、VMLOAD、VMSAVE、CLGI、VMMCALL 和 INVLPGA 指令；否则，这些指令会产生 #UD 异常。当 EFER.SVME 位置 1 或功能标志 CPUID Fn8000_0001_ECX\[SKINIT\] 置 1 时，可以使用 SKINIT 和 STGI 指令；否则，这些指令会产生 #UD 异常。

在启用 SVM 之前，软件应使用以下算法检测 SVM 是否可被启用：

```c
if (CPUID Fn8000_0001_ECX[SVM] == 0)
  return SVM_NOT_AVAIL;

if (VM_CR.SVMDIS == 0)
  return SVM_ALLOWED;

if (CPUID Fn8000_000A_EDX[SVML]==0)
  return SVM_DISABLED_AT_BIOS_NOT_UNLOCKABLE
  // 用户必须更改平台固件设置以启用 SVM
else return SVM_DISABLED_WITH_KEY;
  // SVMLock 可能可解锁；请咨询平台固件或 TPM 获取密钥。
```

有关使用 CPUID 指令获取处理器能力信息的更多信息，请参见第 3.3 节"处理器特性识别"（第 72 页）。

## 15.5 VMRUN 指令（VMRUN Instruction）

VMRUN 指令是 SVM 的基石。VMRUN 以单个参数接受一个 4KB 对齐页的物理地址，即虚拟机控制块（virtual machine control block，VMCB），该控制块描述了要执行的虚拟机（客户）。VMCB 包含：

-   客户中要拦截的指令或事件（例如写入 CR3）列表，
-   指定客户执行环境或指示在运行客户代码之前要执行的特定操作的各种控制位，以及
-   客户处理器状态（如控制寄存器等）。

注意：VMRUN 在 SMM handler 内部不受支持，其行为未定义。

### 15.5.1 基本操作（Basic Operation）

VMRUN 指令具有隐式寻址模式 \[rAX\]。软件必须将 RAX（32 位模式下为 EAX）加载为 VMCB 的物理地址，VMCB 是描述要执行的虚拟机的一个 4-Kbyte 对齐页。用于形成地址的 RAX 部分由当前有效地址大小决定。

VMCB 通过物理地址访问，应映射为写回（WB）内存。VMRUN 仅在 CPL 0 下可用。如果 CPL 大于 0，则引发 #GP(0) 异常。此外，处理器必须处于保护模式且 EFER.SVME 必须置 1，否则会引发 #UD 异常。

VMRUN 指令将一些主机处理器状态信息保存在主内存中由 VM_HSAVE_PA MSR 指定的物理地址处的主机状态保存区中；然后从 VMCB 状态保存区加载相应的客户状态。VMRUN 还从 VMCB 读取额外的控制位，这些控制位允许 VMM 刷新客户 TLB、向客户注入虚拟中断等。

然后，VMRUN 指令检查刚加载的客户状态。如果加载了非法状态，处理器将退出回主机（第 15.6 节）。

否则，处理器现在运行客户代码，直到发生拦截事件，此时处理器挂起客户执行，并在 VMRUN 之后的下一条指令处恢复主机执行。这称为 #VMEXIT，在第 15.6 节中有详细描述。

VMRUN 保存或恢复最少量的状态信息，以允许 VMM 在客户退出后恢复执行。这使 VMM 能够快速处理简单的拦截条件。如果需要保存或恢复额外的客户状态信息（例如，处理更复杂的拦截或切换到不同的客户），VMM 必须使用 VMLOAD 和 VMSAVE 指令来处理额外的客户状态（第 15.5.2 节）。

**保存主机状态（Saving Host State）。** 为确保主机在 #VMEXIT 后能够恢复操作，VMRUN 至少保存以下主机状态信息：

-   **CS.SEL、NEXT_RIP**——VMRUN 之后下一条指令的 CS 选择子和 rIP。在 #VMEXIT 时，主机从该地址恢复运行。
-   **RFLAGS、RAX**——主机处理器模式和 VMRUN 用于寻址 VMCB 的寄存器。
-   **SS.SEL、RSP**——主机堆栈指针。
-   **CR0、CR3、CR4、EFER**——主机的分页/操作模式。
-   **IDTR、GDTR**——伪描述符。VMRUN 不保存或恢复主机 LDTR。
-   **ES.SEL 和 DS.SEL**。

处理器实现可能只在 VM_HSAVE_PA MSR 指向的内存区域中存储部分或全部主机状态，也可能在隐藏的片上内存中存储部分或全部主机状态。不同实现可能选择保存主机段寄存器的隐藏部分以及选择子。出于这些原因，软件不得依赖主机状态保存区的格式或内容，也不得试图通过修改主机保存区的内容来改变主机状态。

**加载客户状态（Loading Guest State）。** 保存主机状态后，VMRUN 从 VMCB 加载以下客户状态：

-   **CS、rIP**——客户从此地址开始执行。CS 段寄存器的隐藏状态也从 VMCB 加载。
-   **RFLAGS、RAX**。
-   **SS、RSP**——包括 SS 段寄存器的隐藏状态。
-   **CR0、CR2、CR3、CR4、EFER**——客户分页模式。由于地址空间被切换，用 VMRUN 写入与分页相关的控制寄存器不会刷新 TLB。（第 15.16 节）
-   **INTERRUPT_SHADOW**——该标志指示客户当前是否处于中断锁定阴影（interrupt lockout shadow）中；（第 15.21.5 节）
-   **IDTR、GDTR**。
-   **ES 和 DS**——包括段寄存器的隐藏状态。
-   **DR6 和 DR7**——客户的断点状态。
-   **V_TPR**——客户的虚拟 TPR。
-   **V_IRQ**——指示客户中是否有虚拟中断待处理的标志。
-   **CPL**——如果客户处于实模式，CPL 被强制为 0；如果客户处于 v86 模式，CPL 被强制为 3。否则，使用 VMCB 中保存的 CPL。

处理器检查所加载客户状态的一致性。如果在加载客户状态时一致性检查失败，处理器执行 #VMEXIT。更多信息请参见"规范化与一致性检查"（第 525 页）。

如果根据刚加载的寄存器客户处于 PAE 分页模式且未启用嵌套分页，处理器还将读取由新加载的 CR3 值指向的四个 PDPE；在 PDPE 中设置任何保留位也会导致 #VMEXIT。

VMRUN 指令可能加载超出客户代码段限制或非规范（如果运行在长模式下）的客户 rIP。如果发生这种情况，会在客户内部投递 #GP 故障；rIP 超出客户代码段限制不被视为非法客户状态。

在加载完所有客户状态并设置好拦截和其他控制位之后，处理器通过将 GIF 置 1 重新启用中断。假设 VMM 软件在执行 VMRUN 指令之前的某个时刻清除了 GIF，以确保原子状态切换。

某些处理器型号允许 VMM 将特定客户 VMCB 字段指定为"clean"（干净），这意味着它们相对于硬件的当前状态未被修改。这允许硬件优化 VMRUN 的执行。有关哪些字段可能受此影响的详细信息，请参见第 15.15 节。以下描述假定所有字段都被加载。

**控制位（Control Bits）。** 除了加载客户状态外，VMRUN 指令还从 VMCB 读取各种控制字段；这些字段中的大多数在 #VMEXIT 时不会写回 VMCB，因为它们在客户执行期间不会改变：

-   **TSC_OFFSET**——客户读取 TSC（时间戳计数器）时要添加的偏移量。客户对 TSC 的写入可以被拦截，并通过更改偏移量来模拟（而不写入物理 TSC）。当客户退出回主机时，该偏移量被清除。
-   **V_INTR_PRIO、V_INTR_VECTOR、V_IGN_TPR**——用于描述客户虚拟中断的字段（见"注入虚拟（INTR）中断"，第 555 页）。
-   **V_INTR_MASKING**——控制是否将中断屏蔽（在 EFLAGS.IF 和 TPR 中）虚拟化（第 15.21 节）。
-   **运行客户时使用的地址空间 ID（ASID）**。
-   **控制 VMRUN 期间 TLB 刷新的字段** （见第 15.16 节）。
-   **描述客户活动拦截的拦截向量**。从客户退出时，内部拦截寄存器被清除，因此不会有主机操作被拦截。

处理器支持的最大 ASID 值是实现相关的。执行 CPUID Fn8000_000A 后 EBX 中返回的值是处理器支持的 ASID 数量。有关使用 CPUID 指令的更多信息，请参见第 3.3 节"处理器特性识别"（第 72 页）。

**VMCB 中的段状态（Segment State in the VMCB）。** 段寄存器以与 SMM 类似的格式存储在 VMCB 中：基址和限长均完全展开；段属性存储为 12 位值，由原始 64 位（内存中）段描述符的第 55:52 位和第 47:40 位拼接而成；描述符的"P"位用于指示 NULL 段（P=0）（在允许和/或相关的情况下）。从 VMCB 加载段属性（可能已被软件覆盖）可能导致属性位值在其他情况下不被允许。然而，根据所涉及的段寄存器，硬件实际上只观察部分属性位：

-   **CS**——D、L、P 和 R。
-   **SS**——B、P、E、W 和 Code/Data（代码/数据）。
-   **DS、ES、FS、GS**——D、P、DPL、E、W 和 Code/Data。
-   **LDTR**——P、S 和 Type（LDT）。
-   **TR**——P、S 和 Type（32 位或 16 位 TSS）。

注意：对于堆栈段属性，在传统模式（legacy mode）和兼容模式（compatibility mode）下会观察 P。在 64 位模式下忽略 P，因为所有堆栈段都被视为存在（present）。

VMM 在向 VMCB 存储段属性时应遵循以下规则：

-   对于 NULL 段，将所有属性位设为零；否则，写入原始 64 位（内存中）段描述符的第 55:52 位和第 47:40 位的拼接结果。
-   处理器从 VMCB 中的 CPL 字段读取当前特权级别。CS.DPL 将与 CPL 字段匹配。
-   在虚拟 x86 或实模式下，处理器忽略 VMCB 中的 CPL 字段，并分别强制值为 3 和 0。

在 #VMEXIT 之后检查段属性时：

-   测试存在（P）位以检查段是否为 NULL；注意 CS 和 TR 从不包含 NULL 段，因此忽略它们的 P 位；
-   从 VMCB 中的 CPL 字段获取 CPL，而不是从任何段 DPL 获取。

**规范化与一致性检查（Canonicalization and Consistency Checks）。** VMRUN 指令对客户状态执行一致性检查，#VMEXIT 对主机状态执行这些一致性检查的适当子集。非法的客户状态组合会导致 #VMEXIT，错误代码为 VMEXIT_INVALID。

以下条件被视为非法状态组合（注意某些检查可能受 VMCB Clean 字段设置的影响，见下文）：

-   EFER.SVME 为零。
-   CR0.CD 为零且 CR0.NW 置位。
-   CR0\[63:32\] 不为零。
-   CR3 的任何 MBZ 位置位。
-   CR4 的任何 MBZ 位置位。
-   DR6\[63:32\] 不为零。
-   DR7\[63:32\] 不为零。
-   EFER 的任何 MBZ 位置位。
-   EFER.LMA 或 EFER.LME 非零，且此处理器不支持长模式。
-   EFER.LME 和 CR0.PG 均置位且 CR4.PAE 为零。
-   EFER.LME 和 CR0.PG 均非零且 CR0.PE 为零。
-   EFER.LME、CR0.PG、CR4.PAE、CS.L 和 CS.D 均非零。
-   VMRUN 拦截位被清除。
-   MSR 或 IOIO 拦截表延伸到大于或等于最大受支持物理地址的物理地址。
-   非法事件注入（第 15.20 节）。
-   ASID 等于零。
-   S_CET 中设置了任何保留位。
-   CR4.CET=1 且 CR0.WP=0。
-   CR4.CET=1 且 U_CET.SS=1 且 EFLAGS.VM=1。
-   U_CET 中设置了任何保留位（仅 SEV-ES）：
    -   VMRUN 导致 VMEXIT(INVALID)
    -   VMEXIT 强制保留位为 0

VMRUN 可以加载 CR0 的客户值，其中 PE = 0 但 PG = 1，这种组合在其他情况下是非法的（见第 15.19 节）。

除一致性检查外，VMRUN 和 #VMEXIT 还规范化（即符号扩展到第 63 位）：

-   已加载的段寄存器中的所有基地址。
-   SSP
-   ISST_ADDR
-   PL0_SSP、PL1_SSP、PL2_SSP、PL3_SSP

VMCB Clean 字段行为：在支持指定干净字段的处理器型号上，最终合并的硬件状态用于一致性检查。如果处理器选择忽略该指示，这可能包括来自标记为 clean 字段的状态。

**VMRUN 与 EFLAGS 中的 TF/RF 位（VMRUN and TF/RF Bits in EFLAGS）。** 在考虑 VMRUN 与 EFLAGS 中 TF 和 RF 位的交互时，必须区分主机的行为与客户的行为。

从主机的角度来看，VMRUN 表现得像一条指令，尽管在 #VMEXIT 有效完成 VMRUN 之前可能执行任意数量的客户指令。作为一条主机指令，VMRUN 与 EFLAGS.RF 和 EFLAGS.TF 的交互方式与普通指令相同。EFLAGS.RF 抑制 VMRUN 上任何潜在的指令断点匹配，EFLAGS.TF 在主机侧 VMRUN 完成后（即从客户 #VMEXIT 之后）产生 #DB 陷阱。与任何正常指令一样，VMRUN 指令的完成会清除主机 EFLAGS.RF 位。

来自 VMCB 的 EFLAGS.RF 值影响第一条客户指令。当 VMRUN 为 EFLAGS.RF 加载客户值 1 时，该值生效并抑制第一条客户指令上任何潜在的（客户）指令断点。当 VMRUN 在 EFLAGS.TF 中加载客户值 1 时，该值不会在 VMRUN 与第一条客户指令之间产生跟踪陷阱，而是在第一条客户指令完成之后产生。

主机 EFLAGS 值对客户没有影响，客户 EFLAGS 值对主机没有影响。

另请参见第 15.7.1 节中关于 #VMEXIT 时保存的 EFLAGS.RF 值的内容。

### 15.5.2 VMSAVE 和 VMLOAD 指令（VMSAVE and VMLOAD Instructions）

这些指令在处理器与客户的 VMCB 之间传输额外的客户寄存器上下文，包括否则无法访问的隐藏上下文，以实现比 VMRUN 和 #VMEXIT 更完整的上下文切换。VMCB 的系统物理地址在 rAX 中指定。当需要这些操作时，可在执行 VMRUN 之前根据需要执行 VMLOAD，并在 #VMEXIT 之后的任意所需点执行 VMSAVE。

VMSAVE 和 VMLOAD 指令在 rAX 中接受 VMCB 的物理地址。这些指令补充了 VMRUN 指令和 #VMEXIT 的状态保存/恢复能力。它们提供对软件否则无法访问的隐藏处理器状态的访问，以及额外的特权状态。

这些指令处理以下寄存器状态：

-   FS、GS、TR、LDTR（包括所有隐藏状态）
-   KernelGsBase
-   STAR、LSTAR、CSTAR、SFMASK
-   SYSENTER_CS、SYSENTER_ESP、SYSENTER_EIP

与 VMRUN 一样，这些指令仅在 CPL0 下可用（否则导致 #GP(0) 异常），并且仅在通过 EFER.SVME 启用 SVM 的保护模式下有效（否则导致 #UD 异常）。

## 15.6 #VMEXIT

当拦截触发时，处理器执行 #VMEXIT（即从客户退出到主机上下文）。

在 #VMEXIT 时，处理器：

-   通过清除 GIF 禁用中断，以便在 #VMEXIT 之后，VMM 软件可以原子地完成状态切换。
-   将当前客户状态写回 VMCB——与 VMRUN 指令加载的处理器状态子集相同，包括 V_IRQ、V_TPR 和 INTERRUPT_SHADOW 位。
-   在 VMCB 的 EXITCODE 字段中保存退出客户的原因；根据拦截的不同，附加信息可能保存在 EXITINFO1 或 EXITINFO2 字段中。注意：对于未指示使用这些字段的拦截，EXITINFO1 和 EXITINFO2 字段的内容是未定义的。
-   清除所有拦截。
-   将当前 ASID 寄存器重置为零（主机 ASID）。
-   清除处理器内部的 V_IRQ 和 V_INTR_MASKING 位。
-   清除处理器内部的 TSC_OFFSET。
-   重新加载先前由 VMRUN 指令保存的主机状态。处理器重新加载主机的 CS、SS、DS 和 ES 段寄存器，并根据实现情况，在需要时从主机的段描述符表重新读取描述符。段描述符表必须由主机页表映射为存在且可写。软件在执行 VMRUN 指令时应保持主机的段描述符表与段寄存器一致。在 #VMEXIT 之后立即，处理器仍包含客户的 LDTR 值。因此，对于 CS、SS、DS 和 ES，VMM 只能使用全局描述符表中的段描述符。（VMSAVE 指令可用于更完整的上下文切换，允许 VMM 随后以所需值加载 LDTR 以及 #VMEXIT 未保存的其他寄存器；详见第 15.5.2 节。）重新加载主机段时遇到的任何异常都会导致 shutdown（关闭）。
-   如果主机处于 PAE 模式，处理器从主机 CR3 指示的页表重新加载主机的 PDPE。如果 PDPE 包含非法状态，处理器会导致 shutdown。
-   强制 CR0.PE = 1、RFLAGS.VM = 0。
-   将主机 CPL 设置为零。
-   禁用主机 DR7 寄存器中的所有断点。
-   检查重新加载的主机状态的一致性；任何错误都会导致处理器 shutdown。如果 #VMEXIT 重新加载的主机 rIP 超出主机代码段限制或非规范（在长模式的情况下），则在主机内部投递 #GP 故障。

## 15.7 拦截操作（Intercept Operation）

客户中的各种指令和事件（如异常）可以通过 VMCB 中的控制位进行拦截（"VMCB 布局"，第 763 页）。SVM 支持的两类主要拦截是指令拦截和异常拦截。

**异常拦截（Exception intercepts）。** 当正常指令处理必须引发异常时，在解析可能发生的双重故障（double-fault）条件之前、以及尝试投递异常（包括压入异常帧、访问 IDT 等）之前，会检查异常拦截。

对于某些异常，即使异常被拦截，处理器仍会写入某些特定于异常的寄存器。（详见第 15.12 节及后续各节的描述。）当外部或虚拟中断被拦截时，该中断保持挂起状态。

当客户正在使用 IDT 投递未被拦截的中断或异常的过程中发生拦截时，SVM 会在 #VMEXIT 时提供附加信息（见第 15.7.2 节）。

**指令拦截（Instruction intercepts）。** 这些拦截发生在指令执行的明确定义点——在指令结果提交之前，但相对于指令的异常检查按拦截特定的优先级排序。一般而言，指令拦截在简单异常（如 #GP——当 CPL 不正确时——或 #UD）检查之后、但在与内存访问相关的异常（如页故障）以及基于特定操作数值的异常之前检查。该准则有若干例外，例如 RSM 指令。当前指令的指令断点以及来自前一条指令的挂起数据断点陷阱被设计为在指令拦截之前检查。

### 15.7.1 退出时保存的状态（State Saved on Exit）

触发时，拦截将 EXITCODE 写入 VMCB，标识拦截的原因。EXITINTINFO 字段指示拦截是否发生在客户尝试通过 IDT 投递中断或异常时；VMM 可以使用此信息透明地完成投递（第 15.20 节）。某些拦截在 VMCB 的 EXITINFO1 和 EXITINFO2 字段中提供附加信息；详见各拦截描述。

VMCB 中保存的客户状态是拦截触发瞬间的处理器状态。在 x86 架构中，陷阱（trap，与故障 fault 相对）在触发它们的指令完成执行后被检测并投递。因此，陷阱拦截发生在最初触发陷阱的指令执行之后。保存的客户状态因此包括执行该指令的效果。

示例：假设客户指令触发数据断点（#DB）陷阱，而该陷阱又被拦截。VMCB 记录该指令执行后的客户状态，因此保存的 CS:rIP 指向下一条指令，且保存的 DR7 包括匹配数据断点的效果。

对于因指令拦截（如第 15.9 节所定义）以及 MSR 和 IOIO 拦截以及由 INT3、INTO 和 BOUND 指令引起的异常而导致的所有 #VMEXIT，下一条顺序指令指针（nRIP）保存在客户 VMCB 控制区的 C8h 位置。对于所有其他拦截，nRIP 被重置为零。

nRIP 是：如果当前指令遭受陷阱式调试异常，且被拦截的指令不导致控制流改变时，将被压入堆栈的 RIP。如果被拦截的指令本会导致控制流改变，则 nRIP 指向下一条顺序指令而不是目标指令。

某些异常即使在被拦截时也会写入特殊寄存器；详见第 15.12 节中的各描述。

#VMEXIT 时 NRIP 保存的支持由 CPUID Fn8000_000A_EDX\[NRIPS\] 指示。有关使用 CPUID 指令的更多信息，请参见第 3.3 节"处理器特性识别"（第 72 页）。

### 15.7.2 IDT 中断投递期间的拦截（Intercepts During IDT Interrupt Delivery）

客户在尝试通过 IDT 投递异常或中断时可能发生拦截（例如，因为 VMM 已将客户的异常堆栈换出而导致 #PF）。在某些情况下，这种拦截可能导致透明恢复客户所需信息的丢失。例如，对于外部中断，处理器将已经与 PIC 或 APIC 执行了中断确认周期以获得中断类型和向量，因此该中断不再处于挂起状态。

为从这种情况中恢复，所有拦截都在 VMCB 的 EXITINTINFO 字段中指示它们是否发生在通过 IDT 的异常或中断投递期间。该机制允许 VMM 完成被拦截的中断投递，即使已不可能重新创建所述事件。

```python
 63                                 32 31    30                             12   11   10          8    7            0
┌────────────────────────────────────┬─────┬─────────────────────────────┬──────┬───────────┬──────────────┐
│            ERRORCODE               │  V  │          Reserved           │  EV  │   TYPE    │    VECTOR    │
└────────────────────────────────────┴─────┴─────────────────────────────┴──────┴───────────┴──────────────┘
```

| 位   | 助记符 | 描述  |
| --- | --- | --- |
| 63:32 | ERRORCODE | 错误代码 |
| 31  | V   | 有效（Valid） |
| 30:12 | —   | 保留  |
| 11  | EV  | 错误代码有效（Error Code Valid） |
| 10:8 | TYPE | 限定客户异常或中断。表 15-1 显示了可能返回的值及其对应的中断或异常类型。未指示的值未使用且保留。 |
| 7:0 | VECTOR | 中断或异常的 8 位 IDT 向量。 |

**图 15-1. EXITINTINFO**

**表 15-1. 客户异常或中断类型**

| 值   | 类型  |
| --- | --- |
| 0   | 外部或虚拟中断（INTR） |
| 2   | NMI |
| 3   | 异常（故障或陷阱） |
| 4   | 软件中断（由 INTn 指令引起） |

尽管指令名称如此，但由 INT1（又称 ICEBP）、INT3 和 INTO 指令（操作码 F1h、CCh 和 CEh）引发的事件在 EXITINTINFO 的目的下被视为异常，而非软件中断。只有由 INTn 指令（操作码 CDh）引发的事件被视为软件中断。

-   **错误代码有效（Error Code Valid）——位 11。** 如果客户异常本会压入错误代码，则置 1；否则清零。
-   **有效（Valid）——位 31。** 如果拦截发生在客户尝试通过 IDT 投递异常时，则置 1；否则清零。
-   **错误代码（Errorcode）——位 63:32。** 如果 EV 置 1，保存客户异常本会压入的错误代码；否则未定义。

在多重异常的情况下，EXITINTINFO 记录除最后一个（被拦截的）异常之外所有异常的聚合信息。

示例：客户引发 #GP，在其投递过程中又引发 #NP（根据 x86 规则，这种情况解析为 #DF），并且在尝试投递 #DF 期间发生被拦截的 #PF。在拦截 #PF 时，EXITINTINFO 指示客户在 #PF 发生时正在投递 #DF。被拦截页故障本身的信息编码在 EXITCODE、EXITINFO1 和 EXITINFO2 字段中。如果 VMM 决定修复并消除 #PF，它可以通过重新注入（见第 15.20 节）EXITINTINFO 中记录的故障来恢复客户执行。如果 VMM 决定应将 #PF 反映回客户，则必须根据 x86 规则将 EXITINTINFO 中的事件与被拦截的异常合并。在这种情况下，#DF 加上 #PF 将导致三重故障或 shutdown。

### 15.7.3 EXITINTINFO 伪代码（EXITINTINFO Pseudo-Code）

在客户中投递异常或中断时，处理器检查异常拦截，如果在异常投递期间发生拦截，则更新 EXITINTINFO 的值。以下伪代码概述了处理器如何投递事件（异常或中断）E。

```python
if E is an exception and is intercepted:
    #VMEXIT(E)
E = (result of combining E with any prior events)

if (result was #DF and #DF is intercepted):
    #VMEXIT(#DF)
if (result was shutdown and shutdown is intercepted):
    #VMEXIT(#shutdown)
EXITINTINFO = E // 记录客户正在投递的事件。

Attempt delivery of E through the IDT
// 注意：这可能导致次级异常

Once an exception has been successfully taken in the guest:

EXITINTINFO.V = 0 // 投递成功；无 #VMEXIT。
Dispatch to first instruction of handler
```

当异常触发拦截时，EXITCODE 以及可选地 EXITINFO1 和 EXITINFO2 字段始终反映被拦截的异常，而 EXITINTINFO（如果标记为有效）指示发生拦截时客户正在尝试投递的先前异常。

## 15.8 解码辅助（Decode Assists）

提供解码辅助是为了让 hypervisor 更高效地解码客户指令。CPUID Fn8000_000A_EDX\[DecodeAssists\] = 1 指示支持此功能。有关使用 CPUID 指令的更多信息，请参见第 3.3 节"处理器特性识别"（第 72 页）。

### 15.8.1 MOV CRx/DRx 拦截（MOV CRx/DRx Intercepts）

EXITINFO1 字段保存一个标志，指示该指令是否为 MOV CRx 以及 GPR 操作数的编号。MOV-to-CR 指令总是设置位 63 并提供 GPR 编号，但如下文所述的 CR0 除外。

**表 15-2. MOV CRx 的 EXITINFO1**

| 位偏移 | 字段内容 |
| --- | --- |
| 3:0 | GPR 编号 |
| 62:4 | 0   |
| 63  | 指令为 MOV CRx——如果指令是 MOV CRx 指令则置 1；否则清零。 |

**表 15-3. MOV DRx 的 EXITINFO1**

| 位偏移 | 字段内容 |
| --- | --- |
| 3:0 | GPR 编号 |
| 63:4 | 0   |

**MOV-to-CR0 特例。** 如果指令是 MOV-to-CR，则提供 GPR 编号。如果指令是 LMSW 或 CLTS，则不提供附加信息且位 63 不置位。

**MOV-from-CR0 特例。** 如果指令是 MOV-from-CR，则提供 GPR 编号且位 63 置位。如果指令是 SMSW，则不提供信息且位 63 不置位。

### 15.8.2 INTn 拦截（INTn Intercepts）

EXITINFO1 为 INT n 指令记录中断编号的立即值。见表 15-4。

**表 15-4. INTn 的 EXITINFO1**

| 位偏移 | 字段内容 |
| --- | --- |
| 7:0 | 软件中断编号 |
| 63:8 | 0   |

### 15.8.3 INVLPG 和 INVLPGA 拦截（INVLPG and INVLPGA Intercepts）

对于 INVLPG 拦截，EXITINFO1 提供段基址加法和地址大小掩码产生有效地址大小之后的线性地址。见表 15-5。对于 INVLPGA 拦截，线性地址可直接从客户 rAX 寄存器获得，不在 EXITINFO1 中提供。

**表 15-5. INVLPG 的 EXITINFO1**

| 位偏移 | 字段内容 |
| --- | --- |
| 63:0 | 线性地址 |

### 15.8.4 嵌套和被拦截的 #PF（Nested and Intercepted #PF）

在嵌套页故障或被拦截 #PF 的情况下，客户 CS:RIP 处的客户指令字节被存储到 VMCB 中偏移 0D0h 处的 16 字节宽字段 Guest Instruction Bytes（客户指令字节）中。该字段的格式总结于下表 15-6。最多记录 15 个字节，从客户 CS:RIP 读取。如果发生故障条件（如页面不存在或超过 CS 限长），则 Guest Instruction Bytes 字段记录尽可能多已获取的字节。获取的字节数放入该字段的第一个字节。零表示未获取任何字节。默认字节数始终为 15。仅当获取过程中发生故障时才返回较少字节。

该字段仅在数据页故障期间填写。指令获取页故障不提供附加信息。

所有其他拦截将该字段的位 7:0 清零（以指示无效条件）；实现可以保留其他字节不变。

**表 15-6. Guest Instruction Bytes（客户指令字节）**

| 位偏移 | 字段内容 |
| --- | --- |
| 3:0 | 获取的字节数 |
| 7:4 | 0   |
| 127:8 | 指令字节 |

## 15.9 指令拦截（Instruction Intercepts）

表 15-7 指定了检查给定拦截的指令，以及（在相关情况下）拦截相对于异常的优先级。

**表 15-7. 指令拦截**

| 指令拦截 | 检查者 | 优先级 |
| --- | --- | --- |
| 读写 CR0 | MOV TO/FROM CR0、LMSW、SMSW、CLTS | 在拦截之前检查非内存异常（CPL、非法位组合等）。对于 LMSW 和 SMSW，在检查内存异常之前检查 SVM 拦截。 |
| 读写 CR3（不包括任务切换） | MOV TO/FROM CR3（不由任务切换操作检查） | 先检查非内存异常，然后检查拦截。如果拦截在写入时触发，则拦截发生在 TLB 刷新之前。如果启用了 PAE，加载四个 PDPE 可能导致 #GP；该异常在拦截检查之后检查，因此处理 CR3 拦截的 VMM 不能依赖 PDPE 是合法的；如有必要，必须在软件中检查它们。VMRUN、#VMEXIT 或任务切换中发生的 CR3 读写不受此拦截检查的约束。 |
| 读写其他 CR | MOV TO/FROM CRn | 所有正常异常检查优先于 SVM 拦截。 |
| 读写调试寄存器 DRn | MOV TO/FROM DRn（不由隐式 DR6/DR7 写入检查） | 所有正常异常检查优先于 SVM 拦截。 |
| 选择性 CR0 写拦截 | MOV TO CR0、LMSW | 在拦截之前检查非内存异常（CPL、非法位组合等）。对于 LMSW 和 SMSW，在检查内存异常之前检查 SVM 拦截。CR0 上的选择性写拦截仅在写入改变除 CR0.TS 或 CR0.MP 之外的位时触发。特别是，这意味着 CLTS 不检查此拦截。当选择性和非选择性 CR0 写拦截同时激活时，非选择性拦截优先。关于异常，此拦截的优先级与通用 CR0 写拦截相同。LMSW 指令将选择性 CR0 写拦截视为非选择性拦截（即无论写入什么值都会拦截）。 |
| 读写 IDTR、GDTR、LDTR、TR | LIDT、SIDT、LGDT、SGDT、LLDT、SLDT、LTR、STR | SVM 拦截在 #UD 和 #GP 异常检查之后、但在任何内存访问执行之前检查。 |
| RDTSC | RDTSC | 在 SVM 拦截之前检查所有异常。 |
| RDPMC | RDPMC | 在 SVM 拦截之前检查所有异常。 |
| PUSHF | PUSHF | 拦截优先于任何异常。 |
| POPF | POPF | 拦截优先于任何异常。 |
| CPUID | CPUID | 拦截优先于任何异常。 |
| RSM | RSM | 拦截优先于任何异常。 |
| IRET | IRET | 拦截优先于任何异常。 |
| 软件中断 | INTn | 拦截在任何异常检查之前发生。#VMEXIT 上报的 CS:rIP 是被拦截 INTn 指令的 CS:rIP。虽然 INTn 指令可能通过 0–31 范围内的 IDT 向量分派，但这些事件不能通过异常拦截被拦截（见"异常拦截"，第 540 页）。 |
| INVD | INVD | 异常（#GP）在拦截之前检查。 |
| PAUSE | PAUSE | 没有要检查的异常。VMRUN 将 VMCB.PauseFilterCount 复制到内部计数器。每条 PAUSE 指令递减计数器，并且仅在计数器降至零以下且 PAUSE 拦截启用时发生 PAUSE 拦截。处理器不写 VMCB.PauseFilterCount 字段。某些事件（包括 SMI）可导致内部计数从 VMCB 重新加载。VMCB.PauseFilterCount 支持由 CPUID 扩展功能 8000_000A 返回的 EDX\[10\] 指示。如果不支持此功能或 VMCB.PauseFilterCount = 0，则可以拦截第一条 PAUSE 指令。 |
| HLT | HLT | 在检查此拦截之前检查所有异常。 |
| IDLE_HLT | HLT | 此拦截仅在虚拟中断未挂起（V_INTR 或 V_NMI）时发生。当 HLT 和 Idle HLT 拦截同时激活时，HLT 拦截优先。 |
| INVLPG | INVLPG | 在拦截之前检查所有异常（#GP）。 |
| INVLPGA | INVLPGA | 在拦截之前检查所有异常（#GP）。 |
| VMRUN | VMRUN | 在拦截之前检查异常（#GP）。当前实现要求 VMRUN 拦截始终在 VMCB 中设置。 |
| VMLOAD | VMLOAD | 在拦截之前检查异常（#GP）。 |
| VMSAVE | VMSAVE | 在拦截之前检查异常（#GP）。 |
| VMMCALL | VMMCALL | 拦截优先于异常。如果 VMMCALL 未被拦截，则在客户中导致 #UD。 |
| STGI | STGI | 在拦截之前检查异常（#GP）。 |
| CLGI | CLGI | 在拦截之前检查异常（#GP）。 |
| SKINIT | SKINIT | 在拦截之前检查异常（#GP）。 |
| RDTSCP | RDTSCP | 在 SVM 拦截之前检查所有异常。 |
| ICEBP | ICEBP（操作码 F1h） | 尽管 ICEBP 指令通过 IDT 向量 1 分派，但该事件不能通过 #DB 异常拦截被拦截。 |
| WBINVD | WBINVD、WBNOINVD | 在拦截之前检查异常（#GP）。 |
| MONITOR | MONITOR、MONITORX | 在拦截之前检查所有异常。 |
| MWAIT | MWAIT、MWAITX | 在拦截之前检查所有异常。有条件和无条件 MWAIT 拦截。条件 MWAIT 拦截在无条件 MWAIT 拦截之前检查。当条件和无条件 MWAIT 拦截同时激活时，先检查条件拦截。同时设置两个拦截的 hypervisor 对于本会进入低功耗状态的客户 MWAIT 指令将收到条件 MWAIT 拦截退出代码，对于本不会进入低功耗状态的客户 MWAIT 指令将收到无条件 MWAIT 拦截退出代码。这些检查也适用于 MWAITX。 |
| XSETBV | XSETBV | 在异常（#GP）之前检查拦截。 |
| RDPRU | RDPRU | 在拦截之前检查所有异常。 |
| INVLPGB | INVLPGB | 拦截优先于除 CPL<>0 的 #GP 之外的所有异常。 |
| INVLPGB_ILLEGAL | INVLPGB 异常情形 | 拦截优先于除 CPL<>0 的 #GP 之外的所有异常。 |
| INVPCID | INVPCID | 拦截优先于除 CPL<>0 的 #GP 之外的所有异常。 |
| TLBSYNC | TLBSYNC | 在拦截之前检查异常（#GP）。 |

## 15.10 IOIO 拦截（IOIO Intercepts）

VMM 可以通过 SVM I/O 权限映射按端口拦截 IOIO 指令（IN、OUT、INS、OUTS）。

### 15.10.1 I/O 权限映射（I/O Permissions Map）

I/O 权限映射（IOPM）占用 12 Kbytes 连续物理内存。该映射结构为 64K+3 位的线性数组（两个 4-Kbyte 页，以及第三个 4-Kbyte 页的前三个位），且必须按 4-Kbyte 边界对齐；IOPM 的物理基地址在 VMCB 的 IOPM_BASE_PA 字段中指定，并由 VMRUN 指令加载到处理器中。

VMRUN 指令忽略 VMCB 中指定地址的低 12 位。如果 IOPM 中最后一个字节的地址大于或等于最大受支持物理地址，则视为非法 VMCB 状态，导致 #VMEXIT(VMEXIT_INVALID)。

IOPM 中的每个位对应一个 8 位 I/O 端口。表中的位 0 对应 I/O 端口 0，位 1 对应 I/O 端口 1，依此类推。置 1 的位表示应拦截对相应端口的访问。IOPM 通过物理地址访问，应驻留在映射为写回（WB）的内存中。

### 15.10.2 IN 和 OUT 行为（IN and OUT Behavior）

如果设置了 IOIO_PROT 拦截位，则 IOPM 控制端口访问。对于访问多于单个字节的 IN/OUT 指令，检查所有字节的权限位；如果任何位置 1，则 I/O 操作被拦截。

与虚拟 x86 模式、IOPL 或 TSS 位图相关的异常在 SVM 拦截检查之前检查。所有其他异常在 SVM 拦截检查之后检查。

**I/O 拦截信息（I/O Intercept Information）。** 当 IOIO 拦截触发时，以下描述被拦截操作的信息（为便于模拟）保存在 VMCB 的 EXITINFO1 字段中：

```python
 31                                      16 15      13 12   10 9    8    7    6    5    4    3    2    1    0
┌──────────────────────────────────────────┬─────────┬───────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│                  PORT                     │ Reserved│  SEG  │ A64 │ A32 │ A16 │SZ32 │SZ16 │ SZ8 │ REP │ STR │ RSD │TYPE│
└──────────────────────────────────────────┴─────────┴───────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
```

| 位   | 助记符 | 描述  |
| --- | --- | --- |
| 31:16 | PORT | 被拦截的 I/O 端口 |
| 15-13 | —   | 保留  |
| 12:10 | SEG | 有效段编号 |
| 9   | A64 | 64 位地址 |
| 8   | A32 | 32 位地址 |
| 7   | A16 | 16 位地址 |
| 6   | SZ32 | 32 位操作数大小 |
| 5   | SZ16 | 16 位操作数大小 |
| 4   | SZ8 | 8 位操作数大小 |
| 3   | REP | 重复端口访问 |
| 2   | STR | 基于字符串的端口访问（INS、OUTS） |
| 1   | —   | 保留  |
| 0   | TYPE | 访问类型（0 = OUT 指令，1 = IN 指令） |

**图 15-2. IOIO 拦截的 EXITINFO1**

IN/OUT 之后下一条指令的 rIP 保存在 EXITINFO2 中，以便 VMM 在 I/O 模拟后可以轻松恢复客户。

### 15.10.3 (REP) OUTS 和 INS

EXITINFO1 字段的位 12:10 提供有效段编号（默认段为 DS）。（有关段寄存器编码，请参见 AMD64 Architecture Programmer's Manual Volume 3: General-Purpose and System Instructions 第 478 页的表 A-32"16 位寄存器和内存引用"。）

INS 提供有效段（始终为 ES，编码为 0）。

对于被拦截的 I/O 上的 SMI，EXITINFO1 的位 12:10 编码该段。有关该字段其余位的定义，请参见（第 15.13.3 节）。

## 15.11 MSR 拦截（MSR Intercepts）

VMM 可以通过 SVM MSR 权限映射（MSRPM）按 MSR 拦截 RDMSR 和 WRMSR 指令。

**MSR 权限映射（MSR Permissions Map）。** MSR 权限位图由四个独立的 16 Kbit（2 Kbytes）位向量组成。每个 16 Kbit 向量控制客户对定义范围的 8K 个 MSR 的访问。每个 MSR 由两位覆盖，定义客户读和写访问权限。两位中的 lsb 控制对 MSR 的读访问，msb 控制写访问。值为 1 表示该操作被拦截。四个独立的位向量必须打包在一起，位于内存的两个连续物理页中。如果 MSR_PROT 拦截激活，任何读取或写入 MSRPM 未覆盖的 MSR 的尝试将自动导致拦截。

下表定义了 MSR 权限映射所覆盖的 MSR 范围。注意 MSR 范围不是连续的。

**表 15-8. MSRPM 覆盖的 MSR 范围**

| MSRPM 字节偏移 | MSR 范围 |
| --- | --- |
| 000h–7FFh | 0000_0000h–0000_1FFFh |
| 800h–FFFh | C000_0000h–C000_1FFFh |
| 1000h–17FFh | C001_0000h–C001_1FFFh |
| 1800h–1FFFh | 保留  |

MSRPM 通过物理地址访问，应驻留在映射为写回（WB）的内存中。MSRPM 必须按 4KB 边界对齐。MSRPM 的物理基地址在 VMCB 的 MSRPM_BASE_PA 字段中指定，并由 VMRUN 指令加载到处理器中。VMRUN 指令忽略 VMCB 中指定地址的低 12 位，如果表中最后一个字节的地址大于或等于最大受支持物理地址，则视为非法 VMCB 状态，导致 #VMEXIT(VMEXIT_INVALID)。

**RDMSR 和 WRMSR 行为（RDMSR and WRMSR Behavior）。** 如果 VMCB 拦截向量中的 MSR_PROT 位被清除，则不拦截 RDMSR/WRMSR 指令。

RDMSR 和 WRMSR 指令按以下顺序检查异常和拦截：

-   所有 MSR 共有的异常（例如，不在 CPL 0 时的 #GP）
-   如果请求了 MSR_PROT 拦截，则在 MSR 权限映射中检查 SVM 拦截。
-   特定于给定 MSR 的异常（包括密码保护、未实现的 MSR、保留位等）

**MSR 拦截信息（MSR Intercept Information）。** 在 #VMEXIT 时，处理器在 VMCB 的 EXITINFO1 中指示被拦截的是 RDMSR（EXITINFO1 = 0）还是 WRMSR（EXITINFO1 = 1）。

## 15.12 异常拦截（Exception Intercepts）

当拦截定义错误代码（通常压入异常堆栈）的异常时，SVM 硬件在 VMCB 的 EXITINFO1 字段中投递该错误代码；异常向量编号可以从 EXITCODE 推导。异常拦截时保存在 VMCB 中的 CS.SEL 和 rIP 与否则会被压入异常堆栈帧的值匹配，但基于中断的指令导致拦截时除外——此时指令的 rIP 存储在 VMCB 中，而非下一条指令的 rIP。基于中断的指令是 INT3（操作码 CC）、INTO 和 BOUND。

除非下文另有说明，在异常被拦截之前不写入特殊寄存器。有关保存在 VMCB 中的客户状态的详细信息，请参见第 15.7.1 节。

外部中断和软件中断（INTn 指令）不检查异常拦截，即使它们使用 0 到 31 范围内的向量。

在处理先前异常期间发生的异常，在与先前异常合并（例如，合并为双重故障）之前会检查拦截。如果异常合并的结果是双重故障或 shutdown，处理器在尝试投递之前检查这些是否被拦截。

示例：假设 VMM 拦截 #GP 和 #DF 异常，客户引发（未被拦截的）#NP，在其投递过程中又收到 #GP（例如由于非法的 IDT 条目）——根据 x86 语义，这种情况导致 #DF。在这种情况下，#VMEXIT 指示被拦截的 #GP，而非被拦截的 #DF，并用 #NP 故障填充 EXITINTINFO。另一方面，如果在此场景中只有 #DF 拦截激活，#VMEXIT 将指示被拦截的 #DF。

以下小节详述各个拦截。

### 15.12.1 #DE（除零，Divide By Zero）

EXITINFO1 和 EXITINFO2 字段未定义。

### 15.12.2 #DB（调试，Debug）

#DB 异常可以具有故障型（例如指令断点）或陷阱型（例如数据断点）行为；因此拦截时保存在 VMCB 中的状态有所不同（见第 15.7.1 节）。但无论哪种情况，为 DR6 和 DR7 保存的值与 #DB 异常处理程序可见的值匹配（即 #DB 故障和陷阱都允许在拦截之前写 DR6 和 DR7）。EXITINFO1 和 EXITINFO2 字段未定义。

故障型 #DB 异常（无论是在 EXITCODE 还是 EXITINTINFO 中指示）使保存在 VMCB 中的 CS:rIP 指示引起 #DB 异常的指令。陷阱型 #DB 异常使 VMCB 的 CS:rIP 指示引起异常的指令之后的下一条指令。由单字节 INT1 指令（又称 ICEBP）生成的向量 1 异常不触发 #DB 拦截。软件应使用专用 ICEBP 拦截来拦截 ICEBP（见第 15.9 节）。

### 15.12.3 向量 2（保留）

此拦截位未实现；请改用 NMI 拦截（第 15.13.2 节）。设置此位的效果未定义。

### 15.12.4 #BP（断点，Breakpoint）

此拦截适用于单字节 INT3（操作码 CCh）指令引发的陷阱。EXITINFO1 和 EXITINFO2 字段未定义。#VMEXIT 上报的 CS:rIP 是 INT3 指令的 CS:rIP。

### 15.12.5 #OF（溢出，Overflow）

此拦截适用于 INTO（操作码 CEh）指令引发的陷阱。EXITINFO1 和 EXITINFO2 字段未定义。

### 15.12.6 #BR（边界范围，Bound-Range）

此拦截适用于 BOUND 指令引发的故障。EXITINFO1 和 EXITINFO2 字段未定义。

### 15.12.7 #UD（无效操作码，Invalid Opcode）

EXITINFO1 和 EXITINFO2 字段未定义。

### 15.12.8 #NM（设备不可用，Device-Not-Available）

EXITINFO1 和 EXITINFO2 字段未定义。

### 15.12.9 #DF（双重故障，Double Fault）

EXITINFO1 和 EXITINFO2 字段未定义。VMCB 中保存的 rIP 值未定义（与 #DF 异常压入堆栈的 rIP 值情况相同）。如果双重故障被拦截，导致双重故障的异常将已写入这些异常通常写入的任何状态寄存器。

### 15.12.10 向量 9（保留）

此拦截未实现。设置此位的效果未定义。

### 15.12.11 #TS（无效 TSS，Invalid TSS）

EXITINFO1 和 EXITINFO2 字段未定义。VMCB 中保存的 rIP 值可以指向引起任务切换的指令，或指向进入任务的第一个指令。有关 EXITINFO1 和 EXITINFO2 字段的信息，请参见第 15.14.1 节。

### 15.12.12 #NP（段不存在，Segment Not Present）

EXITINFO1 字段包含 #NP 异常本会压入堆栈的错误代码。EXITINFO2 字段未定义。

### 15.12.13 #SS（堆栈故障，Stack Fault）

EXITINFO1 字段包含 #SS 异常本会压入堆栈的错误代码。EXITINFO2 字段未定义。

### 15.12.14 #GP（通用保护，General Protection）

EXITINFO1 字段包含 #GP 异常本会压入堆栈的错误代码。

### 15.12.15 #PF（页故障，Page Fault）

此拦截在异常写入 CR2 之前测试。保存在 EXITINFO1 中的错误代码与保护模式中未被拦截的 #PF 异常本会压入堆栈的错误代码相同。故障地址保存在 VMCB 的 EXITINFO2 字段中。即使客户运行在分页实模式下，处理器也会在 EXITINFO1 中投递（保护模式的）页故障错误代码，供 VMM 用于分析被拦截的 #PF。处理器可能提供额外的指令解码辅助信息。（见第 15.8.4 节。）

### 15.12.16 #MF（X87 浮点，X87 Floating Point）

此拦截在浮点状态字已写入之后测试，与正常 FP 异常的情况相同。EXITINFO1 和 EXITINFO2 字段未定义。

### 15.12.17 #AC（对齐检查，Alignment Check）

EXITINFO1 字段包含 #AC 异常本会压入堆栈的错误代码。EXITINFO2 字段未定义。

### 15.12.18 #MC（机器检查，Machine Check）

SVM 拦截在所有 #MC 特定寄存器已写入之后、但在其他客户状态被修改之前检查。当 #MC 被拦截时，机器检查在尽可能的情况下退出到 VMM，仅在此不是合理选项时才关闭处理器。EXITINFO1 和 EXITINFO2 字段未定义。

注意：在某些处理器中，如果客户 VM 禁用了机器检查处理（CR4.MCE=0），则客户中发生的所有机器检查错误都会导致 shutdown 事件。然而，在 CPUID Fn8000_000A_EDX\[HOST_MCE_OVERRIDE\]（位 23）= 1 的处理器中，VMM 可以通过在主机中设置 CR4.MCE=1 来覆盖此行为。在此场景下，客户中发生的且处理器可以包含的机器检查错误将总是导致 #VMEXIT(MC)。

### 15.12.19 #XF（SIMD 浮点，SIMD Floating Point）

此拦截在 SIMD 状态字（MXCSR）已写入之后测试，与正常 FP 异常的情况相同。EXITINFO1 和 EXITINFO2 字段未定义。

### 15.12.20 #SX（安全异常，Security Exception）

EXITINFO1 字段包含 #SX 异常本会压入堆栈的错误代码。EXITINFO2 字段未定义。

### 15.12.21 #CP（控制保护，Control Protection）

EXITINFO1 字段包含 #CP 异常本会压入堆栈的错误代码。EXITINFO2 字段未定义。

## 15.13 中断拦截（Interrupt Intercepts）

外部中断在被拦截时导致 #VMEXIT；中断保持挂起状态，以便最终可以在 VMM 中取得该中断。异常拦截不适用于外部或软件中断，因此不可能通过异常拦截拦截中断，即使该中断恰好使用 0 到 31 范围内的向量。

### 15.13.1 INTR 拦截（INTR Intercept）

此拦截影响物理（而非虚拟）可屏蔽中断。可屏蔽中断的虚拟化请参见"虚拟中断拦截"（第 556 页）。

### 15.13.2 NMI 拦截（NMI Intercept）

此拦截影响不可屏蔽中断。NMI 中断（和 SMI）在 STI 之后的一条指令内可能被屏蔽。

### 15.13.3 SMI 拦截（SMI Intercept）

此拦截影响系统管理模式中断（SMI）；SMI 处理的详细信息请参见"SMM 支持"（第 558 页）。

当此拦截触发时，EXITINFO1 字段的位 0 区分 SMI 是由 I/O 陷阱内部引起（位 0 = 0）还是外部断言（位 0 = 1）。

如果 SMI 是在客户执行 I/O 指令时断言的，则描述 I/O 指令的附加信息保存在 EXITINFO1 的高 32 位中，I/O 指令的 rIP 保存在 EXITINFO2 中。当 VALID 位置位时，EXITINFO1 指示 SMI 是在 I/O 指令期间断言的。

如果 SMI 不是在 I/O 指令期间断言的，则附加的 EXITINFO1 和 EXITINFO2 位未定义。

当 HWCR\[SMMLOCK\] 置位时，忽略 SMI 拦截。

```python
 63                                      48 47    44 43 42 41 40 39 38 37 36 35 34 33 32
┌──────────────────────────────────────────┬───────┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐
│                  PORT                    │  BRP  │TF│— │A64│A32│A16│SZ32│SZ16│SZ8│REP│STR│VAL│TYPE│
└──────────────────────────────────────────┴───────┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘
 31                                         12 10   9                             2    1    0
┌───────────────────────────────────────────┬───────┬──────────────────────────────┬──────┬──────┐
│             Reserved, RAZ                 │  SEG  │         Reserved, RAZ         │MCREDIR│SMISRC│
└───────────────────────────────────────────┴───────┴──────────────────────────────┴──────┴──────┘
```

| 位   | 助记符 | 描述  |
| --- | --- | --- |
| 63:48 | PORT | 被拦截的 I/O 端口 |
| 47:44 | BRP | I/O 断点匹配 |
| 43  | TF  | EFLAGS TF 值 |
| 42  | —   | 保留，RAZ |
| 41  | A64 | 64 位地址 |
| 40  | A32 | 32 位地址 |
| 39  | A16 | 16 位地址 |
| 38  | SZ32 | 32 位操作数大小 |
| 37  | SZ16 | 16 位操作数大小 |
| 36  | SZ8 | 8 位操作数大小 |
| 35  | REP | 重复端口访问 |
| 34  | STR | 基于字符串的端口访问（INS、OUTS） |
| 33  | VAL | 有效（SMI 在 I/O 指令期间被检测到） |
| 32  | TYPE | 访问类型（0 = OUT 指令，1 = IN 指令） |
| 31:13 | —   | 保留，RAZ |
| 12:10 | SEG | 有效段编号（见第 15.9 节） |
| 9:2 | —   | 保留，RAZ |
| 1   | MCREDIR | SMI 是由于重定向的机器检查错误（见"与 SMI 和 #MC 的交互"，第 623 页） |
| 0   | SMISRC | SMI 来源（0 = 内部，1 = 外部） |

**图 15-3. SMI 拦截的 EXITINFO1**

### 15.13.4 INIT 拦截（INIT Intercept）

INIT 拦截允许 VMM 在客户运行时拦截 INIT 的断言。被拦截的 INIT 保持挂起，直到 VMM 设置 GIF（见"全局中断标志、STGI 和 CLGI 指令"，第 551 页），此时它要么生效要么被重定向。INIT 重定向特性的讨论请参见第 15.21.8 节。

### 15.13.5 虚拟中断拦截（Virtual Interrupt Intercept）

此拦截在客户取得虚拟中断之前立即发生。当拦截触发时，虚拟中断尚未被取得，并保持挂起在客户的 VMCB V_IRQ 字段中。处理固定本地 APIC 中断不需要此拦截，但可用于模拟 ExtINT 中断投递模式（该模式不被 TPR 屏蔽）或自动 EOI 模式下的传统 PIC。

## 15.14 其他拦截（Miscellaneous Intercepts）

SVM 架构包括用于处理任务切换、由于 FERR 导致的处理器冻结以及 shutdown 操作的拦截。

### 15.14.1 任务切换拦截（Task Switch Intercept）

**检查者**——任何导致任务切换的指令或事件（例如 JMP、CALL、异常、中断、软件中断）。

**优先级**——拦截在任务切换发生之前检查，但在进入的 TSS 和任务门（如果涉及）正确性检查之后。

任务切换可以修改 VMM 可能希望保护的多个资源（CR3、EFLAGS、LDT）。然而，任务切换不是分别检查各种拦截（例如 CR3 写、LDTR 写），而是只检查单个拦截位。

在 #VMEXIT 时，以下信息在 VMCB 中投递：

-   EXITINFO1\[15:0\] 保存标识进入 TSS 的段选择子。
-   EXITINFO2\[31:0\] 保存要在新任务中压入的错误代码（如果适用）；否则该字段未定义。
-   EXITINFO2\[63:32\] 保存供 VMM 使用的辅助信息：
    -   EXITINFO2\[36\]——如果任务切换由 IRET 引起则置 1；否则清零。
    -   EXITINFO2\[38\]——如果任务切换由远跳转引起则置 1；否则清零。
    -   EXITINFO2\[44\]——如果任务切换有错误代码则置 1；否则清零。
    -   EXITINFO2\[48\]——如果任务切换未被拦截，将保存在退出 TSS 中的 EFLAGS.RF 值。

### 15.14.2 Ferr_Freeze 拦截（Ferr_Freeze Intercept）

当处理器由于 FERR 断言而冻结时（在 IGNNE 取消断言、且在 CR0.NE 中选择传统 FERR 处理时），即在处理器等待外部中断解冻时检查。

### 15.14.3 Shutdown 拦截（Shutdown Intercept）

当发生此拦截时，任何通常导致 shutdown 的条件都会改为导致 #VMEXIT 到 VMM。被拦截的 shutdown 之后，VMCB 控制区有效（偏移 60h、61h 和 68h 除外），VMCB 状态保存区未定义。

### 15.14.4 暂停拦截过滤（Pause Intercept Filtering）

在支持暂停过滤的处理器上（由 CPUID Fn8000_000A_EDX\[PauseFilter\] = 1 指示），VMCB 提供 16 位 PAUSE Filter Count（暂停过滤计数）值。在 VMRUN 时，该值被加载到内部计数器。每执行一次 PAUSE 指令，此计数器递减，直到达到零，此时如果 PAUSE 拦截启用，则生成 #VMEXIT。如果 PAUSE Filter Count 设为零且 PAUSE Intercept 启用，则每条 PAUSE 指令都将导致 #VMEXIT。

此外，某些处理器系列支持高级暂停过滤（由 CPUID Fn8000_000A_EDX\[PauseFilterThreshold\] = 1 指示）。在此模式下，VMCB 中增加了 16 位 PAUSE Filter Threshold（暂停过滤阈值）字段。阈值是用于重置暂停计数器的周期计数。

与简单暂停过滤一样，VMRUN 将 VMCB 中的 PAUSE 计数值加载到内部计数器。然后，在每条 PAUSE 指令上，处理器将自最近一条 PAUSE 指令以来经过的周期数与 PAUSE Filter Threshold 比较。如果经过的周期数大于 PAUSE Filter Threshold，则内部暂停计数从 VMCB 重新加载并继续执行。如果经过的周期数小于 PAUSE Filter Threshold，则内部暂停计数递减。如果计数值小于零且 PAUSE 拦截启用，则触发 #VMEXIT。

如果支持高级暂停过滤且 PAUSE Filter Threshold 字段设为零，则过滤器将以更简单的仅计数模式运行。

有关使用 CPUID 指令的更多信息，请参见第 3.3 节"处理器特性识别"（第 72 页）。

### 15.14.5 总线锁定阈值（Bus Lock Threshold）

在支持总线锁定阈值的处理器上（由 CPUID Fn8000_000A_EDX\[29\] BusLockThreshold=1 指示），VMCB 提供总线锁定阈值启用位和一个无符号 16 位总线锁定阈值计数。在 VMRUN 时，该值被加载到内部计数寄存器中。在处理器于客户中执行总线锁定之前，它检查此寄存器的值。如果值大于 0，处理器成功执行总线锁定并递减计数。如果值为 0，则不执行总线锁定并发生到 VMM 的 #VMEXIT。总线锁定阈值 #VMEXIT 以 VMEXIT 代码 A5h（VMEXIT_BUSLOCK）报告给 VMM。在 VMEXIT_BUSLOCK 时 EXITINFO1 和 EXITINFO2 设为 0。

在 #VMEXIT 时，处理器将总线锁定阈值计数器的当前值写入 VMCB。

第 196 页第 7.3.3 节描述了执行总线锁定的条件。

如果页表内存类型不是 WB，则总线锁定阈值 #VMEXIT 可能由于表遍历 A/D 位更新而发生。在这种情况下，总线锁定阈值 #VMEXIT 仍报告为 VMEXIT_BUSLOCK，而非嵌套页故障。

## 15.15 VMCB 状态缓存（VMCB State Caching）

VMCB 状态缓存允许处理器在 #VMEXIT 与后续 VMRUN 指令之间将某些客户寄存器值缓存在硬件中，并使用缓存值提高上下文切换性能。根据特定处理器实现，VMRUN 根据 VMCB 中 VMCB Clean 字段的值，从 VMCB 或 VMCB 状态缓存加载每个客户寄存器值。VMCB 状态缓存的支持由 CPUID Fn8000_000A_EDX\[VmcbClean\] = 1 指示。

SVM 架构使用 VMCB 的物理地址作为客户虚拟 CPU 的唯一标识符，以决定缓存副本是否属于该客户。就 VMCB 状态缓存而言，ASID 不是客户虚拟 CPU 的唯一标识符。

### 15.15.1 VMCB Clean 位（VMCB Clean Bits）

VMCB Clean 字段（VMCB 偏移 0C0h，位 31:0）控制 VMRUN 时从 VMCB 状态缓存加载哪些客户寄存器值。VMCB Clean 字段中每个置位的位允许处理器从硬件缓存加载一个客户寄存器或一组寄存器；每个清零的位要求处理器从 VMCB 加载客户寄存器。clean 位是一个提示，因为任何给定的处理器实现都可能在任何给定的 VMRUN 上忽略置 1 的位，无条件地从 VMCB 加载相关的寄存器值。清零的 clean 位始终被遵守。

该字段向后兼容不支持 VMCB 状态缓存的 CPU；较旧的 CPU 既不缓存 VMCB 状态，也不读取 VMCB Clean 字段。

不了解 VMCB 状态缓存并遵守未定义 VMCB 字段 SBZ 属性的旧版 hypervisor 将不会启用 VMCB 状态缓存。

### 15.15.2 清除 VMCB Clean 位的准则（Guidelines for Clearing VMCB Clean Bits）

每次 hypervisor 显式修改 VMCB 中相关客户状态时，必须清除 VMCB Clean 字段中的特定位。客户的执行可能导致缓存状态被更新，但 hypervisor 不负责设置与客户执行引起的任何状态变化相对应的 VMCB Clean 位。

在以下情况下，hypervisor 必须将客户的整个 VMCB Clean 字段清除为 0：

-   这是特定客户第一次运行。
-   hypervisor 在与上次执行该客户所用的不同 CPU 核上执行该客户。
-   自上次执行该客户以来，hypervisor 已将客户的 VMCB 移动到不同的物理页。

在这些情况下未能将 VMCB Clean 位清零可能导致未定义行为。

当 hypervisor 执行当前未缓存的客户时，CPU 自动将当前 VMRUN 上的 VMCB Clean 字段视为零。CPU 将 VMCB 物理地址与所有缓存的 VMCB 物理地址比较，如果没有匹配的缓存 VMCB 地址，则将 VMCB Clean 字段视为零。

更改 VMCB 内容的 SMM 软件（或任何其他可访问 VMCB 的 hypervisor 外部代理）需要理解 clean 位并相应调整；否则客户可能无法按预期运行。

### 15.15.3 VMCB Clean 字段（VMCB Clean Field）

VMCB Clean 字段的布局如下图 15-4 所示。

```python
 31                                         13    12    11    10     9     8    7     6     5    4     3     2     1     0
┌───────────────────────────────────────────┬──────┬─────┬─────┬─────┬─────┬────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│                 Reserved                  │ CET  │ AVIC│ LBR │ CR2 │ SEG │ DT │ DRx │ CRx │ NP  │ TPR │ ASID│ IOPM│  I  │
└───────────────────────────────────────────┴──────┴─────┴─────┴─────┴─────┴────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
```

| 位   | 助记符 | 描述  |
| --- | --- | --- |
| 31:13 | —   | 保留  |
| 12  | CET | S_CET、SSP、ISST_ADDR |
| 11  | AVIC | AVIC APIC_BAR；AVIC APIC_BACKING_PAGE、AVIC PHYSICAL_TABLE 和 AVIC LOGICAL_TABLE 指针 |
| 10  | LBR | DebugCtl MSR、br_from/to、lastint_from/to |
| 9   | CR2 | CR2 |
| 8   | SEG | CS/DS/SS/ES 选择子/基址/限长/属性、CPL |
| 7   | DT  | GDT/IDT 限长和基址 |
| 6   | DRx | DR6、DR7 |
| 5   | CRx | CR0、CR3、CR4、EFER |
| 4   | NP  | 嵌套分页：NCR3、G_PAT |
| 3   | TPR | V_TPR、V_IRQ、V_INTR_PRIO、V_IGN_TPR、V_INTR_MASKING、V_INTR_VECTOR（偏移 60h–67h） |
| 2   | ASID | ASID |
| 1   | IOPM | IOMSRPM：IOPM_BASE、MSRPM_BASE |
| 0   | I   | 拦截：所有拦截向量、TSC 偏移、Pause Filter Count |

**图 15-4. VMCB Clean 字段**

为向前兼容，如果 hypervisor 未修改 VMCB，hypervisor 可以写入 FFFF_FFFFh 到 VMCB Clean 字段，以指示除下文描述为显式未缓存的字段外，它未更改任何 VMCB 内容。hypervisor 应写入 0h 以指示 VMCB 是新的或可能与 CPU 的缓存副本不一致，例如当 hypervisor 从空闲页列表为现有 VMCB 分配了新位置且不跟踪该页最近是否曾被用作另一个客户的 VMCB 时。如果任何 VMCB 字段（显式未缓存字段除外）被修改，则所有（在 hypervisor 范围内的）未定义的 clean 位必须清零。

位 31 是为主机保留的特殊位，CPU 永远不会将其用作 clean 位。

以下内容显式不缓存，且不由 Clean 位表示：

-   TLB_Control
-   中断阴影（Interrupt shadow）
-   VMCB 状态字段（Exitcode、EXITINFO1、EXITINFO2、EXITINTINFO、Decode Assist 等）
-   事件注入
-   RFLAGS、RIP、RSP、RAX

## 15.16 TLB 控制（TLB Control）

TLB 条目用地址空间标识符（ASID）位标记，以在使用影子页表时区分不同的客户虚拟地址空间，或在使用嵌套页表时区分不同的客户物理地址空间。VMM 可以选择一种软件策略，保持多个影子页表和/或在支持嵌套分页的处理器上保持多个嵌套页表为最新状态；VMM 可以为每个影子或嵌套页表分配不同的 ASID。这允许在影子分页下切换到客户中的新进程（更改 CR3 内容），或在嵌套分页下切换到新客户（更改 nCR3 内容），而无需刷新 TLB。（嵌套分页操作的完整说明见第 15.25 节。）

使用影子分页时，VMM 负责为每个客户线性地址空间设置一个影子页表，将其映射到系统物理地址。这些用作活动页表，代替客户 OS 的页表。VMM 将客户 VMCB 中的 CR3 字段设置为指向所需影子页表的系统物理地址。当客户更改其页表或分页控制状态时，VMM 负责更新影子页表，并且 VMM 更新客户页表的访问和脏位。

VMRUN 指令和 #VMEXIT 写入 CR0、CR3、CR4 和 EFER 寄存器，但这些写入不刷新 TLB。VMM 负责显式使无效任何可能受其操作影响的客户转换。接下来两节描述了可用于此的两种机制。

在启用 SVM 运行时，全局页表条目（PTE）仅在 ASID 内部是全局的，跨 ASID 则不是。

**软件规则。** 当 VMM 通过更改客户 VMCB 中的条目来更改客户的分页模式时，VMM 必须确保客户的 TLB 条目从 TLB 中刷新。相关的 VMCB 状态包括：

-   CR0——PG、WP、CD、NW。
-   CR3——任何位。
-   CR4——PGE、PAE、PSE。
-   EFER——NXE、LMA、LME。

### 15.16.1 TLB 刷新（TLB Flush）

无论是否启用 SVM，TLB 刷新操作的功能都相同（例如，MOV CR3 指令刷新非全局映射，而 MOV CR4 指令刷新全局和非全局映射）。不得假设 TLB 刷新操作会影响所有 ASID。如果 VMM 为任何本会刷新 TLB 的客户操作设置了拦截位，则 #VMEXIT 拦截发生且 TLB 不被刷新；VMM 有责任适当地刷新 TLB。在不提供选择性刷新单个指定 ASID 的所有转换的实现中，软件可以通过为客户分配新 ASID 且不复用旧 ASID（直到整个 TLB 至少被刷新一次）来有效刷新客户的 TLB 条目。

VMCB 中的 TLB_CONTROL 字段提供表 15-9 所示的控制字节编码指定的命令。前两个命令在所有支持 SVM 的处理器上可用；其他命令的支持是可选的，由 CPUID Fn8000_000A_EDX\[FlushByAsid\] = 1 指示。

**表 15-9. TLB 控制字节编码**

| 编码  | 功能定义 |
| --- | --- |
| 00h | 不刷新 |
| 01h | 刷新整个 TLB（应仅在传统硬件上使用。） |
| 03h | 刷新此客户的 TLB 条目 |
| 07h | 刷新此客户的非全局 TLB 条目 |

注意：此表中未定义的所有编码均保留。

当 VMM 将 TLB_CONTROL 字段设置为 1 时，VMRUN 指令刷新所有 ASID 的 TLB，包括全局和非全局页。VMRUN 指令读取但不更改 TLB_CONTROL 字段的值。

MOV CR3 指令、更改 CR3 的任务切换，或清除/设置 CR0.PG 或 CR4 的 PGE、PAE、PSE 位，仅影响属于当前 ASID 的 TLB 条目，无论该操作发生在主机模式还是客户模式。当 CPU 不在客户上下文内时，当前 ASID 为 0。

属于所有 ASID 的所有 TLB 条目会被 SMI、RSM、MTRR 修改、IORR 修改以及访问其他影响地址转换的系统 MSR 刷新。

如果 hypervisor 通过降低权限级别、清除存在位或更改地址转换来修改嵌套页表，并打算返回到同一 ASID，则应使用 TLB 命令 011b 或 001b。

### 15.16.2 无效页，备用 ASID（Invalidate Page, Alternate ASID）

INVLPGA 指令允许 VMM 在给定 ASID 内选择性地使无效给定客户虚拟页的 TLB 映射。线性地址在隐式寄存器操作数 rAX 中指定；ASID 在 ECX 中指定。输入地址总是被解释为客户虚拟地址，因此 INVLPGA 通常仅在与影子页表一起使用时才有意义；它不提供按客户物理地址使无效嵌套转换的方法。

## 15.17 全局中断标志、STGI 和 CLGI 指令（Global Interrupt Flag, STGI and CLGI Instructions）

全局中断标志（GIF）是一个控制处理器是否可以接受中断和其他事件的位。STGI 和 CLGI 指令分别设置和清除 GIF。表 15-10 显示了 GIF 的值如何影响中断和异常的处理。实现可以在嵌套虚拟化场景中提供 GIF 虚拟化的硬件支持；详见第 15.33 节。

**表 15-10. GIF 对中断处理的影响**

| 中断源 | GIF==0 | GIF==1 |
| --- | --- | --- |
| 由断点寄存器匹配导致的调试异常或陷阱 | 忽略并丢弃 | 正常操作 |
| 由 EFLAGS.TF 导致的调试跟踪陷阱 | 正常操作 | 正常操作 |
| RESET | 正常操作 | 正常操作 |
| INIT | 保持挂起直到 GIF==1 | 正常操作，见表 15-12 |
| NMI | 保持挂起直到 GIF==1 | 正常操作，见表 15-13 |
| 外部 SMI | 保持挂起直到 GIF==1 | 正常操作，见表 15-14 |
| 内部 SMI（I/O 陷阱） | 忽略并丢弃 | 正常操作，见表 15-14 |
| INTR 和 vINTR | 保持挂起直到 GIF==1 | 正常操作 |
| #SX（安全异常） | 不适用¹ | 正常操作 |
| 机器检查 | 如果可能（实现相关），保持挂起直到 GIF==1，否则 shutdown。 | 正常操作 |
| A20M | 正常操作（VM_CR.DIS_A20M 控制 A20 屏蔽） | 正常操作 |
| 其他实现特定但架构不可见的中断（STPCLK、IGNNE 翻转、ECC scrub） | 正常操作 | 正常操作 |

注意：

1.  #SX 仅由已被"重定向"（即转换为 #SX；见第 15.28 节）的 INIT 信号引起；转换仅在 GIF==1 时发生，因为否则 INIT 仅保持挂起。

## 15.18 VMMCALL 指令（VMMCALL Instruction）

该指令旨在让客户显式调用 VMM。不执行 CPL 检查，因此 VMM 可以决定是否在用户级使此指令合法。

如果 VMMCALL 指令未被拦截，则该指令引发 #UD 异常。

## 15.19 分页实模式（Paged Real Mode）

为促进实模式的虚拟化，VMRUN 指令可以合法地加载 PE = 0 但 PG = 1 的客户 CR0 值。同样，RSM 指令被允许返回到分页实模式。这种处理器模式在所有方面表现得与实模式相同，只是应用了分页。其意图是让 VMM 在 CPL0 下以分页实模式运行客户，并拦截页故障。

VMM 负责设置一个影子页表，将客户物理内存映射到适当的系统物理地址。

在不将页故障拦截到 VMM 的情况下以分页实模式运行客户的行为未定义。

## 15.20 事件注入（Event Injection）

VMM 可以在执行 VMRUN 指令之前通过设置 VMCB 的 EVENTINJ 字段中的位，将异常或中断（统称为事件）注入客户。该字段的格式如图 15-5 所示。编码与 EXITINTINFO 字段匹配。通过此机制注入事件时，VMRUN 指令使客户在执行第一条客户指令之前无条件取得指定的异常或中断。

注入的事件在所有方面都被视为如同它们在客户中正常发生一样（特别是，它们被记录在 EXITINTINFO 中），但以下情况除外：

-   注入的事件不受拦截检查的约束。（但注意，如果在注入事件的投递期间发生次级异常，这些异常受异常拦截的约束。）
-   注入的 NMI 不会阻止进一步 NMI 的投递。
-   如果 VMM 尝试注入对客户模式不可能的事件（例如，客户处于 64 位模式时注入 #BR 异常），事件注入将失败且不执行任何客户状态指令；VMRUN 将立即以 VMEXIT_INVALID 错误代码退出。
-   注入向量为 3 或 4 的异常（TYPE = 3）分别表现得像 INT3 和 INTO 指令引发的陷阱，此时处理器在分派到处理程序之前检查 IDT 描述符的 DPL。
-   如果处理器不支持 NextRIP 字段，则无法正确注入软件中断。支持由 CPUID Fn8000_000A_EDX\[NRIPS\] = 1 指示。如果不支持 NextRIP，hypervisor 软件应模拟软件中断的事件注入。
-   事件注入不支持注入作为客户 ICEBP 指令结果的被拦截 #DB 故障。ICEBP 不像 INTn 注入那样执行 DPL 检查。hypervisor 软件应模拟 ICEBP 的注入。

```python
 63                                             32 31 30                   12 11 10 8    7          0
┌───────────────────────────────────────────────┬──┬───────────────────────┬──┬──────┬───────────────┐
│                  ERRORCODE                    │V │     Reserved, SBZ     │EV│ TYPE │    VECTOR     │
└───────────────────────────────────────────────┴──┴───────────────────────┴──┴──────┴───────────────┘
```

**图 15-5. VMCB 中的 EVENTINJ 字段**

EVENTINJ 中的字段如下：

-   **VECTOR——位 7:0。** 中断或异常的 8 位 IDT 向量。如果 TYPE 为 2（NMI），则忽略 VECTOR 字段。
-   **TYPE——位 10:8。** 限定要生成的客户异常或中断。表 15-11 显示了可能的值及其对应的中断或异常类型。未指示的值未使用且保留。

**表 15-11. 客户异常或中断类型**

| 值   | 类型  |
| --- | --- |
| 0   | 外部或虚拟中断（INTR） |
| 2   | NMI |
| 3   | 异常（故障或陷阱） |
| 4   | 软件中断（INTn 指令） |

-   **EV（错误代码有效）——位 11。** 如果异常应将错误代码压入堆栈则置 1；否则清零。
-   **V（有效）——位 31。** 如果要将事件注入客户则置 1；否则清零。
-   **ERRORCODE——位 63:32。** 如果 EV 置 1，为要压入堆栈的错误代码，否则忽略。

如果满足以下任一条件，VMRUN 以 VMEXIT_INVALID 错误代码退出：

-   指定了保留的 TYPE 值，或
-   指定了 TYPE = 3（异常）且向量不对应于异常（这包括向量 2，它是 NMI，而非异常）。

## 15.21 中断与本地 APIC 支持（Interrupt and Local APIC Support）

SVM 硬件支持旨在确保中断的高效虚拟化。

### 15.21.1 EFLAGS 中的物理（INTR）中断屏蔽（Physical (INTR) Interrupt Masking in EFLAGS）

为防止客户屏蔽可屏蔽中断（INTR），SVM 提供 VMCB 控制位 V_INTR_MASKING，它改变 EFLAGS.IF 的操作以及通过 CR8 寄存器对 TPR 的访问。

在 V_INTR_MASKING 清零时运行客户：

-   EFLAGS.IF 同时控制虚拟和物理中断。

在 V_INTR_MASKING 置 1 时运行客户：

-   VMRUN 时主机的 EFLAGS.IF 被保存，并在客户运行时控制物理中断。
-   客户的 EFLAGS.IF 值仅控制虚拟中断。

### 15.21.2 虚拟化 APIC.TPR（Virtualizing APIC.TPR）

SVM 提供一个虚拟 TPR 寄存器 V_TPR 供客户使用；其值由 VMRUN 从 VMCB 加载并由 #VMEXIT 写回 VMCB。APIC 的 TPR 始终控制物理中断的任务优先级，V_TPR 始终控制虚拟中断。

在 V_INTR_MASKING 清零时运行客户：

-   对 CR8 的写入同时影响 APIC 的 TPR 和 V_TPR 寄存器。
-   对 CR8 的读取与没有 SVM 时的操作相同。

在 V_INTR_MASKING 置 1 时运行客户：

-   对 CR8 的写入仅影响 V_TPR 寄存器。
-   对 CR8 的读取返回 V_TPR。

### 15.21.3 32 位模式下的 TPR 访问（TPR Access in 32-Bit Mode）

第 15.21.2 节描述的 TPR 虚拟化机制仅适用于使用 CR8 寄存器执行的访问。然而，在 32 位模式下，传统上只能使用内存映射寄存器访问 TPR。通常，VMM 通过不在客户中映射 APIC 页地址来虚拟化此类 TPR 访问。客户对该区域的访问随后导致到 VMM 的 #PF 拦截，VMM 检查客户页表以确定物理地址，并在识别出该物理地址属于 APIC 后，最终调用软件模拟代码。

为提高 32 位模式下 TPR 访问的效率，SVM 通过 MOV TO/FROM CR8 的备用编码（即带 LOCK 前缀的 MOV TO/FROM CR0）使 CR8 对 32 位代码可用。为获得更好的性能，应修改 32 位客户以使用此访问方法，而非内存映射 TPR。（详细信息，请参见 AMD64 Programmer's Reference Volume 3: General Purpose and System Instructions（订单号 24594）第 377 页的"MOV CRn"。）

即使 EFER.SVME 中禁用了 SVM，MOV TO/FROM CR8 指令的备用编码也可用。它们在 64 位和 32 位模式下均可用。

### 15.21.4 注入虚拟（INTR）中断（Injecting Virtual (INTR) Interrupts）

虚拟中断允许主机将中断（#INTR）传递给客户。在客户内部，虚拟中断遵循与真实中断相同的规则（虚拟 #INTR 直到 EFLAGS.IF 为 1 且客户的 TPR 已启用与挂起虚拟中断相同优先级的中断时才被取得）。

SVM 提供了一种高效机制，VMM 可以通过它向客户注入虚拟中断：

-   如第 15.13.1 节所述，VMM 可以通过在 VMCB 中激活 INTR 拦截来拦截客户运行时到达的物理中断。
-   如第 15.21.4 节所述，VMM 可以通过在 VMCB 中设置 V_INTR_MASKING 位来虚拟化中断屏蔽逻辑。
-   三个 VMCB 字段 V_IRQ、V_INTR_PRIO 和 V_INTR_VECTOR 指示是否有虚拟中断挂起，以及如果是，其向量号和优先级。VMRUN 指令将该信息加载到相应的片上寄存器。
-   如果满足以下条件，处理器取得虚拟 INTR 中断：
    -   V_IRQ 和 V_INTR_PRIO 指示存在优先级大于 V_TPR 中值的挂起虚拟中断，
    -   EFLAGS.IF 中启用了中断，
    -   使用 VGIF 启用了虚拟中断，且
    -   处理器不处于中断阴影中（见第 15.21.5 节）。  
        虚拟 INTR 处理与正常中断处理之间唯一其他区别是：在后一种情况下，中断向量从 V_INTR_VECTOR 寄存器获得（而非对本地 APIC 运行 INTACK 周期）。
-   VMCB 中的 V_IGN_TPR 字段可以设置以指示当前挂起的虚拟中断不受 TPR 屏蔽。在这种情况下省略与 V_TPR 的优先级比较。此机制可用于将 ExtINT 类型的中断注入客户。
-   当处理器分派虚拟中断（通过 IDT）时，在检查虚拟中断拦截之后、访问 IDT 之前清除 V_IRQ。
-   在 #VMEXIT 时，V_IRQ 写回 VMCB，允许 VMM 跟踪虚拟中断是否已被取得。
-   物理中断优先于虚拟中断，无论它们是直接取得还是通过 #VMEXIT 取得。
-   在 #VMEXIT 时，处理器清除其 V_IRQ 和 V_INTR_MASKING 的内部副本，因此虚拟中断不会在 VMM 中保持挂起，并且中断控制恢复到正常状态。

### 15.21.5 中断阴影（Interrupt Shadows）

x86 架构定义了中断阴影的概念——一个单指令窗口，在此期间不识别中断。例如，将 EFLAGS.IF（从零到一）置位的 STI 指令之后的那条指令不识别中断或某些调试陷阱。VMCB INTERRUPT_SHADOW 字段指示客户当前是否处于中断阴影中。该信息在 #VMEXIT 时保存并在 VMRUN 时加载。

### 15.21.6 虚拟中断拦截（Virtual Interrupt Intercept）

虚拟化中断处理时，VMM 通常只需要在客户的新的中断到达或生成时，以及客户发出 EOI（中断结束）时获得控制。在某些情况下，VMM 可能还需要在客户中启用中断的时刻（即恰好在客户取得虚拟中断之前）获得控制。VMM 可以通过启用 VINTR 拦截来做到这一点。

### 15.21.7 本地 APIC 中的中断屏蔽（Interrupt Masking in Local APIC）

当客户可以直接访问设备时，到达本地 APIC 的中断通常只能由拥有导致中断的设备的客户清除。为防止一个客户屏蔽其他客户的中断（通过从不处理自己的中断），VMM 可以屏蔽本地 APIC 中的挂起中断，使它们不参与其他中断的优先级确定。

SVM 引入了以下 APIC 特性：

-   本地 APIC 中增加了一个 256 位 IER（中断使能）寄存器。该寄存器重置为全 1（使能全部 256 个向量）。软件可以通过内存映射的 APIC 页读写 IER。
-   只有 IER 中使能的向量参与 APIC 对最高优先级挂起中断的计算。
-   VMM 可以向本地 APIC 发出特定的中断结束（EOI）命令，允许 VMM 以任意顺序清除挂起中断，而不是总是针对最高优先级的中断。

### 15.21.8 INIT 支持（INIT Support）

INIT 信号在下一条指令边界中断处理器并导致无条件控制转移。INIT 以类似于 RESET 的方式重新初始化控制寄存器、段寄存器和通用寄存器，但不改变大多数 MSR、缓存或数字协处理器（x87 或 SSE）状态的内容，然后将控制转移到与 RESET 相同的指令地址（物理地址 FFFFFFF0h）。与 RESET 不同，INIT 预期对内存控制器不可见，因此不会触发内存控制器硬件自动清除受信任内存页。

为维护此类页的安全性，VMM 可以通过设置 VM_CR MSR 中的 R_INIT 位来请求将 INIT 重定向并转换为 #SX 异常（见第 15.30.1 节）。这允许 VMM 在请求 INIT 时获得控制并清理任何敏感上下文。VMM 随后可以禁用 INIT 的重定向并使平台重新断言 INIT（详细信息请参见适用的 BIOS 和 Kernel Developer's Guide 或 Processor Programming Reference Manual），此时处理器将以正常方式响应。由 INIT 引脚发起的操作也可以由传入的 APIC INIT 中断发起；此处描述的机制在两种情况下都适用。

表 15-12 总结了 INIT 的处理。

**表 15-12. 不同操作模式下的 INIT 处理**

| GIF | INIT 拦截 | INIT 重定向 | 处理器对 INIT 的响应 |
| --- | --- | --- | --- |
| 0   | X   | X   | 保持挂起直到 GIF = 1。 |
| 1   | 1   | X   | #VMEXIT(INIT)，INIT 仍挂起。 |
| 1   | 0   | 0   | 正常取得。 |
| 1   | 0   | 1   | #SX，INIT 不再挂起。 |

如果在未启用 INIT 拦截的情况下启用重定向，则在客户执行期间断言的 INIT 将导致在客户内断言 #SX，同时 INIT 被清除。VMM 可以如"拦截操作"（第 529 页）所述拦截 #SX 的断言。注意，当 VMM 已拦截 INIT 断言时，它可以在设置 GIF 之前的任何时间修改 R_INIT 以控制最终设置 GIF 时的行为，或者 VMM 可以以禁用拦截并启用重定向的方式返回到客户 VM，以将 INIT 有效地作为 #SX 异常移交给客户。

### 15.21.9 NMI 支持（NMI Support）

VMM 可以使用 VMCB 控制位拦截不可屏蔽中断（NMI）（见表 15-13）。被拦截时，NMI 导致从客户退出并保持挂起。

**表 15-13. 不同操作模式下的 NMI 处理**

| GIF | NMI 拦截 | 处理器对 NMI 的响应 |
| --- | --- | --- |
| 0   | X   | 保持挂起直到 GIF=1。 |
| 1   | 1   | #VMEXIT(NMI)，NMI 仍挂起。 |
| 1   | 0   | 正常取得。 |

### 15.21.10 NMI 虚拟化（NMI Virtualization）

NMI 虚拟化允许主机将 NMI（#NMI）注入客户。在客户内部，虚拟 NMI 遵循与物理 NMI 相同的规则。借助 NMI 虚拟化，处理器虚拟化 NMI 的屏蔽状态，这防止客户在 IRET 指令执行之前取得第二个虚拟 NMI。

NMI 虚拟化支持由 CPUID Fn8000_000A_EDX\[VNMI\] = 1 指示。

NMI 虚拟化通过设置 V_NMI_ENABLE（VMCB 偏移 60h 中的位 26）启用。启用 NMI 虚拟化需要设置 NMI 拦截位。尝试在未设置 NMI 拦截位的情况下以 V_NMI_ENABLE 运行客户会导致 #VMEXIT(INVALID)。当启用 NMI 虚拟化时，NMI 拦截仅适用于物理 NMI，不适用于虚拟 NMI。

VMCB 偏移 60h 处的字段中增加了三个新位，以提供 NMI 虚拟化硬件支持：

-   **V_NMI**：指示客户中是否有虚拟 NMI 挂起。处理器在取得虚拟 NMI 后清除 V_NMI。
-   **V_NMI_MASK**：指示虚拟 NMI 是否被屏蔽。处理器在取得虚拟 NMI 后设置 V_NMI_MASK。当客户成功完成 IRET 指令或在投递虚拟 NMI 期间发生 #VMEXIT 时，V_NMI_MASK 被清除。
-   **V_NMI_ENABLE**：启用 NMI 虚拟化。

SVM 提供了一种高效机制，VMM 可以通过它向客户注入虚拟 NMI：

-   VMM 可以通过在 VMCB 中设置 V_NMI_ENABLE 和 V_NMI 将 NMI 注入客户。
-   当设置 V_NMI_ENABLE 时，VMRUN 从 VMCB 将 V_NMI 和 V_NMI_MASK 加载到内部寄存器。
-   如果满足以下条件，处理器取得虚拟 NMI：
    -   虚拟 NMI 未被屏蔽，
    -   使用 VGIF 启用了虚拟中断，且
    -   处理器不处于中断阴影中。
-   当处理器识别虚拟 NMI 时，在访问 IDT 之前清除 V_NMI 并设置 V_NMI_MASK。
-   在 #VMEXIT 时，V_NMI 和 V_NMI_MASK 写回 VMCB。
-   如果在虚拟 NMI 投递期间发生 #VMEXIT，则适当地设置 EXITINTINFO，并将 V_NMI_MASK 保存为 0。
-   如果启用 NMI 虚拟化时使用事件注入注入 NMI，VMRUN 在客户状态中设置 V_NMI_MASK。
-   物理 NMI 优先于虚拟 NMI。

## 15.22 SMM 支持（SMM Support）

本节描述 SVM 对系统管理模式（SMM）虚拟化的支持。

### 15.22.1 SMI 的来源（Sources of SMI）

各种事件可以导致系统管理中断（SMI）的断言；它们分为三类：

-   **内部、同步（又称 I/O 陷阱）**——CPU 自身中的实现特定 IOIO 或配置空间陷阱；总是响应 IN 或 OUT 指令而同步发生。I/O 陷阱通过 MSR 设置，可以通过拦截客户对这些 MSR 的访问来置于 VMM 控制之下。
-   **外部、同步**——响应（并与）IN 或 OUT 指令同步的 IOIO 陷阱，但由外部代理（通常是南桥）生成。
-   **外部、异步**——响应外部物理事件而外部生成，例如合上笔记本电脑盖子、温度传感器触发等。

### 15.22.2 对 SMI 的响应（Response to SMI）

硬件如何响应 SMI 取决于是否拦截 SMM 中断以及中断是否全局启用，如表 15-14 所示。

**表 15-14. 不同操作模式下的 SMI 处理**

| GIF | SMI 拦截 | 内部 SMI | 外部 SMI |
| --- | --- | --- | --- |
| 0   | x   | 丢失。 | 保持挂起直到 GIF=1。 |
| 1   | 1   | 退出客户代码 #VMEXIT(SMI)，SMI 不挂起。 | #VMEXIT(SMI)，SMI 仍挂起。 |
| 1   | 0   | 正常取得。 | 正常取得。 |

通过拦截 SMI，VMM 可以在处理器进入 SMM 之前获得控制。

### 15.22.3 容器化平台 SMM（Containerizing Platform SMM）

在某些使用场景中，VMM 可能不信任现有的平台 SMM 代码，或者可能希望确保 SMM 不在某些客户或 hypervisor 的上下文中运行。为处理这些情况，SVM 提供了容器化 SMM 代码的能力，即在客户内部运行它，并带有 VMM 的完整保护机制。在其他场景中，VMM 可能不想对 SMM 施加控制。

VMM 控制 SMM handler 有三种解决方案：

-   **最简单的解决方案是不拦截 SMI 信号。** 在客户上下文中遇到的 SMI 从客户上下文内取得。在这种情况下，SMM handler 不受 VMM 设置的任何拦截的约束，因此在虚拟化控制之外运行。SMM handler 看到的 SMM 状态保存区中保存的状态反映了遇到 SMI 时正在运行的客户的状态。当 SMM handler 执行 RSM 指令时，处理器返回到客户上下文中执行，SMM handler 对 SMM 状态保存区所做的任何修改都反映在客户状态中。
-   **hypervisor 可能希望为客户模拟所有基于 SMI 的 I/O 拦截，并且只在 hypervisor 上下文中取得 SMI 信号。** hypervisor 应为客户设置所有 IOIO 拦截位和 SMI 拦截位，以确保在运行客户时不可能遇到同步（内部或外部）SMI 信号。此时遇到的任何 #VMEXIT(SMI) 都已知是由于外部、异步 SMI。hypervisor 可以通过执行 STGI 指令响应 #VMEXIT(SMI)，这将导致挂起的 SMI 立即被取得。当由于 I/O 指令导致的 SMI 挂起时，在 hypervisor 中执行 STGI 的效果未定义。为处理由于 I/O 指令导致的挂起 SMI，hypervisor 必须要么容器化 SMM，要么不拦截 SMI。
-   **最复杂的解决方案是通过将 SMM 放入客户中来容器化 SMM。** 容器化使 VMM 完全控制 SMM handler 可以访问的状态。

**容器化平台 SMM。** VMM 可以通过创建自己的受信任 SMM hypervisor，并使用该 handler 在容器中运行平台 SMM 代码来容器化 SMM。SMM hypervisor 可以与 VMM 本身是同一代码，也可以是完全不同的一组代码。受信任的 SMM hypervisor 设置一个客户上下文以将平台 SMM 作为客户运行。客户上下文由 VMCB 和相关状态以及客户的（真实或虚拟）SMM 保存区组成。SMM hypervisor 模拟 SMM 进入（包括 SMM 保存区的设置），并在 SMM 操作结束时模拟 RSM。客户以分页实模式运行平台 SMM 代码，并启用适当的 SVM 拦截，从而确保安全。

为使此方法有效，VMM 可能需要写入 SMM_BASE MSR 以及相关的 SMM 控制寄存器。作为 SMM 进入和 RSM 模拟的一部分，VMM 需要访问 SMM_CTL MSR（见第 15.30.3 节）。然而，这些操作与任何锁定 SMM 控制寄存器的平台固件冲突。

VMM 可以通过检查 HWCR MSR 中的 SMMLOCK 位（在适用于您产品的 BIOS 和 Kernel Developer's Guide（BKDG）或 Processor Programming Reference Manual（PPR）中描述）来确定其是否在兼容的固件设置下运行。如果该位为 1，则固件已锁定 SMM 控制寄存器，VMM 无法移动它们或插入自己的 SMM hypervisor。

当处理器物理进入 SMM 时，SMRAM 区域被重新映射。VMM 设计必须确保在映射或取消映射 SMRAM 区域时，其任何代码或数据都不会消失。另请注意，SMRAM 的 ASEG 区域与视频内存的一部分重叠，因此 SMM hypervisor 不应尝试向屏幕写入诊断消息。客户将任何 SMRAM 区域重新定位（通过某些 MSR 写入）的任何尝试也必须被拦截，以防止恶意 SMM 代码干扰 VMM 操作。

如果固件已锁定 SMM 控制寄存器，则对 SMM_CTL MSR 的写入会导致 #GP。

## 15.23 最后分支记录虚拟化（Last Branch Record Virtualization）

调试控制 MSR（DebugCtl）提供控制转移记录和其他调试设施的控制。（有关使用调试控制 MSR 的更多信息，请参见第 391 页第 13 章"软件调试与性能资源"。）软件将最后分支记录（DebugCtl\[LBR\]）位设置为 1，使处理器记录在调试异常之前执行的最后一次控制转移的源地址和目标地址。这些控制转移包括分支指令、中断和异常。记录的信息存储在四个 MSR 中：

-   LastBranchFromIP
-   LastBranchToIP
-   LastIntFromIP
-   LastIntToIP

在 SVM 下，为虚拟化这些 MSR 的功能，VMM 必须在 #VMEXIT 时保存控制转移记录 MSR 的内容，并在每个客户的 VMRUN 之前恢复它们。如果主机状态也要使用控制转移记录，则必须在这些寄存器的主机和客户跟踪值之间交换值。

### 15.23.1 LBR 虚拟化的硬件加速（Hardware Acceleration for LBR Virtualization）

处理器可选地支持 LBR 虚拟化的硬件加速。以下字段分配在 VMCB 状态保存区中，用于保存 DebugCtl 和控制转移记录 MSR 的内容：

-   **DBGCTL**——保存 DebugCtl MSR 的客户值。
-   **BR_FROM**——保存 LastBranchFromIP MSR 的客户值。
-   **BR_TO**——保存 LastBranchToIP MSR 的客户值。
-   **LASTEXCPFROM**——保存 LastIntFromIP MSR 的客户值。
-   **LASTEXCPTO**——保存 LastIntToIP MSR 的客户值。

当设置 VMCB.LBR_VIRTUALIZATION_ENABLE 时，VMRUN 将所有五个主机控制转移 MSR 保存在主机保存区中，然后从 VMCB 保存区为客户加载相同的五个 MSR。类似地，#VMEXIT 将客户的 MSR 保存到各自的保存区并加载主机的 MSR。

在支持 LBR Stack 的处理器上，VMCB.LBR_VIRTUALIZATION_ENABLE 还控制 VMCB 状态保存区中以下字段的保存和恢复：

-   **DBGEXTNCTL**——保存 DebugExtnCtl MSR 的客户值。
-   **LBR_STACK_FROM**——保存 LastBranchStackFromIp MSR 的客户值。
-   **LBR_STACK_TO**——保存 LastBranchStackToIp MSR 的客户值。
-   **LBR_SELECT**——保存 LastBranchStackSelect MSR 的客户值。

VMRUN 保存主机状态并恢复客户状态，#VMEXIT 保存客户状态并恢复 DebugExtnCtl MSR 的主机状态。VMRUN 仅恢复客户状态，#VMEXIT 仅保存 LastBranchStackFromIp、LastBranchStackToIp 和 LastBranchStackSelect MSR 的客户状态。对于 SEV-ES 客户，#VMEXIT 在保存客户状态后清除 LastBranchStackFromIp、LastBranchStackToIp 和 LastBranchStackSelect MSR 的内容。

### 15.23.2 LBR 虚拟化 CPUID 特性检测（LBR Virtualization CPUID Feature Detection）

CPUID Fn8000_000A_EDX\[LbrVirt\] = 1 指示 AMD64 处理器上支持 LBR 虚拟化加速特性。有关使用 CPUID 指令的更多信息，请参见第 3.3 节"处理器特性识别"（第 72 页）。

## 15.24 外部访问保护（External Access Protection）

通过保护虚拟地址转换机制，VMM 可以限制客户 CPU 对内存的访问。然而，如果客户可以直接访问支持 DMA 的设备，则需要额外的保护机制。SVM 提供多个保护域，可以按页限制设备对物理内存的访问。这是通过北桥的主机桥中的控制逻辑实现的，该逻辑管辖任何外部访问端口（例如 PCI 或 HyperTransport™ 技术接口）。

### 15.24.1 设备 ID 和保护域（Device IDs and Protection Domains）

北桥的主机桥提供多个保护域。每个保护域关联一个设备排除向量（DEV），指定该域中设备的按页访问权限。设备通过 HyperTransport™ 总线/unitID（设备 ID）标识，主机桥包含一个固定大小的查找表，将设备 ID 映射到保护域。

### 15.24.2 设备排除向量（Device Exclusion Vector，DEV）

DEV 是物理内存中连续的位数组；DEV 中的每个位（小端顺序）对应物理内存中的一个 4-Kbyte 页。

DEV 基址的物理地址必须 4-Kbyte 对齐，并存储在 DEVBASE 寄存器之一中，这些寄存器通过主机桥 DEVCTL PCI 配置空间功能块中的间接机制访问（见"DEV 控制和状态寄存器"，第 566 页）。DEV 保护硬件在通过 DEVCTL 功能块中 DEV Control Register 设置控制位启用之前不工作。

DEV 可能必须覆盖 DRAM 之外的 MMIO 空间的一部分。特别是在 64 位系统中，操作系统应从 DRAM 区域之后立即开始并向上构建 MMIO 空间映射，而不是从最大物理地址开始向下。

**主机桥和处理器 DEV 缓存（Host Bridge and Processor DEV Caching）。** 为提高性能，主机桥可以缓存 DEV 的部分内容。任何此类缓存信息可以通过将 DEV 控制寄存器中的 DEV_FLUSH 标志设置为 1 来使无效。软件在修改 DEV 内容后必须设置此标志，以确保保护逻辑使用更新后的值。当刷新操作完成时，主机桥自动清除此标志。设置此标志后，软件应监视它直到其清除，以便将 DEV 更新与后续活动同步。

默认情况下，主机桥在访问 DRAM 中的 DEV 时会探测处理器缓存以获取最新数据。然而，可以通过 DEV_CR 寄存器（"DEV_CR 寄存器"，第 566 页）禁用探测；在统一内存架构（UMA）图形系统的情况下建议这样做。如果禁用缓存探测，则主机桥对 DEV 的读取不会检查处理器缓存中是否有更新的副本。这要求 CPU 上的软件将包含 DEV 的内存映射为不可缓存（UC）或写通（WT）。或者，软件必须执行 CLFLUSH，之后才能预期对 DEV 的更改被北桥看到（以及在软件刷新主机控制器中的 DEV 缓存之前）。

**多处理器问题（Multiprocessor Issues）。** 设备发起的内存请求在进入系统的点——设备物理连接的北桥——与 DEV 检查。每个北桥可以有自己的域集合、设备到域映射和 DEV 表（例如，一个节点上的域 #2 可以包含不同的设备，并且可以具有与另一个节点上的域 #2 不同的访问权限）。因此，软件可用的保护域数量可以随系统中北桥的数量扩展。

### 15.24.3 访问检查（Access Checking）

**内存空间访问（Memory Space Accesses）。** 当在外部主机桥端口上接收到内存空间读或写请求时，主机桥将 HyperTransport 总线设备 ID 映射到保护域编号，该编号进而选择定义设备访问权限的 DEV（见图 15-6）。然后，主机桥通过使用地址的 PFN 部分（位 39:12）索引到 DEV 中来检查内存地址与 DEV 内容。PFN 用作 DEV 内的位索引。如果从 DEV 读取的位置 1，则主机桥通过为读请求返回全 1 数据或为写请求抑制存储操作来阻止访问。将向请求设备返回 Master Abort 错误响应。

路由到主机桥的对等（peer-to-peer）内存访问也受到对 DEV 的检查。可能在桥后面发生的对等传输不受检查。

DEV 检查在地址被 GART 转换之前应用。DEV 表永远不会被源自 CPU 的访问查阅。

**I/O 空间访问（I/O Space Accesses）。** 主机桥可以通过在 DEV_CR 控制寄存器中设置 IOSPE 位（见"DEV_CR 寄存器"，第 566 页）配置为拒绝来自设备的所有 I/O 空间访问。桥后面的 I/O 空间对等传输不受检查。

**配置空间访问（Config Space Accesses）。** 主机桥功能的主要方面通过 PCI 配置空间访问的控制寄存器配置。由于这可能通过设备对等传输访问，主机桥总是阻止除 CPU 之外的任何事物访问此空间。

**图 15-6. 主机桥 DMA 检查** （原图为物理地址 → HyperTransport 总线/设备 ID 到域号映射 → DEV 表遍历器 → DEV 缓存按域号标记的示意图，见原手册第 563 页）

### 15.24.4 DEV 能力块（DEV Capability Block）

DEV 支持的存在通过一个新的 PCI 能力块指示。能力块还提供对控制 DEV 特性操作的寄存器的访问。

PCI 空间中的 DEV 能力块包含三个 32 位字：能力头（DEV_HDR）和两个寄存器（DEV_OP 和 DEV_DATA），它们作为访问实际 DEV 控制和状态寄存器的间接机制。

**表 15-15. DEV 能力块，总体布局**

| 字节偏移 | 寄存器 | 注释  |
| --- | --- | --- |
| 0   | DEV_HDR | 能力块头 |
| 4   | DEV_OP | 选择要访问的控制/状态寄存器 |
| 8   | DEV_DATA | 读/写以访问 DEV_OP 中选择的寄存器 |

**DEV 能力头（DEV Capability Header）。** DEV 能力头（DEV_HDR）定义于表 15-16。

**表 15-16. DEV 能力头（DEV_HDR）（在 PCI 配置空间中）**

| 位   | 定义  |
| --- | --- |
| 31:22 | 保留，MBZ |
| 21  | 中断报告能力 |
| 20  | 机器检查异常报告能力 |
| 19  | 保留，MBZ |
| 18:16 | DEV 能力块类型；硬连线为 000b。 |
| 15:8 | PCI 能力指针；指向列表中的下一个能力 |
| 7:0 | PCI 能力 ID；硬连线为 0x0F |

### 15.24.5 DEV 寄存器访问机制（DEV Register Access Mechanism）

北桥的 DEV 控制和状态寄存器通过间接机制访问：写入 DEV_OP 寄存器选择要访问的内部寄存器，可以读取或写入 DEV_DATA 寄存器以访问所选寄存器。

图 15-7 显示了 DEV_OP 寄存器的格式。DEV_DATA 寄存器反映 DEV_OP 中选择的 DEV 寄存器的格式。

```python
 31                                                        16    15              8   7           0
┌──────────────────────────────────────────────────────────┬──────────────────┬─────────────────┐
│                      Reserved, MBZ                       │    FUNCTION      │      INDEX      │
└──────────────────────────────────────────────────────────┴──────────────────┴─────────────────┘
```

**图 15-7. DEV_OP 寄存器格式（在 PCI 配置空间中）**

DEV_OP 寄存器中的 FUNCTION 字段根据表 15-17 的编码选择要读取或写入的功能/寄存器；对于具有多个实例的寄存器块（例如多个 DEV_BASE_HI/LO 寄存器），INDEX 字段选择实例；否则忽略。

**表 15-17. DEV_OP 寄存器中 Function 字段的编码**

| 功能代码 | 寄存器类型 | 实例数 |
| --- | --- | --- |
| 0   | DEV_BASE_LO | 多个  |
| 1   | DEV_BASE_HI | 多个  |
| 2   | DEV_MAP | 多个  |
| 3   | DEV_CAP | 单个  |
| 4   | DEV_CR | 单个  |
| 5   | DEV_ERR_STATUS | 单个  |
| 6   | DEV_ERR_ADDR_LO | 单个  |
| 7   | DEV_ERR_ADDR_HI | 单个  |

例如，要为保护域编号 2 写入 DEV_BASE_HI 寄存器，软件设置 DEV_OP.FUNCTION 为 1、DEV_OP.INDEX 为 2，然后将所需的 32 位值写入 DEV_DATA。由于 DEV_OP 和 DEV_DATA 寄存器通过 PCI 配置空间（端口 0CF8h–0CFFh）访问，可以通过 SVM I/O 保护位图中的适当设置来保护它们免遭处理器上执行的软件的未授权访问。这些寄存器也由主机桥按"配置空间访问"（第 563 页）所述防止外部访问。

### 15.24.6 DEV 控制和状态寄存器（DEV Control and Status Registers）

DEV 控制和状态寄存器可以通过间接机制访问；这些寄存器在 PCI 配置空间中不直接可见。

**DEV_CAP 寄存器。** 只读寄存器；保存实现特定信息：支持的域保护数量、DEV_MAP 寄存器（将设备/单元 ID 映射到域编号）的数量以及修订 ID。

```python
 31                                      24   23             16    15              8   7              0
┌────────────────────────────────────────┬──────────────────┬──────────────────┬──────────────────┐
│              Reserved, RAZ             │      N_MAPS      │    N_DOMAINS     │     REVISION     │
└────────────────────────────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

**图 15-8. DEV_CAP 寄存器格式（在 PCI 配置空间中）**

初始实现提供四个域和三个映射寄存器。

**DEV_CR 寄存器。** 这是 DEV 机制的主要控制寄存器；RESET 将其清零。

**表 15-18. DEV_CR 控制寄存器**

| 位   | 定义  |
| --- | --- |
| 31:7 | 保留，MBZ |
| 6   | DEV 表遍历探测禁用。0 = 在 DEV 遍历上使用探测；1 = 不使用探测 |
| 5   | SL_DEV_EN。有限内存保护的使能位，见第 568 页第 15.24.8 节。由 SKINIT 指令置"1"，软件可以清除。 |
| 4   | 使无效 DEV 缓存。软件必须将此位设置为 1 以使无效 DEV 缓存；使无效完成时由硬件清除。 |
| 3   | 启用 MCE 报告。0 = 不生成 MCE；1 = 出错时生成 MCE。 |
| 2   | I/O 空间保护使能（IOSPEN）。0 = 允许上行 I/O 周期；1 = 阻止。 |
| 1   | 内存清除禁用。如果非零，则禁用复位时的内存清除。此位在内存使能之前不可写。 |
| 0   | DEV 全局使能位。如果为零，则 DEV 保护关闭。 |

**DEV_BASE 地址/限长寄存器（DEV_BASE Address/Limit Registers）。** DEV 基址寄存器（每个域一组）各自指向对应于一个保护域的 DEV 表的物理地址。地址和大小编码在一对（高/低）32 位寄存器中。DEV_CAP 中的 N_DOMAINS 字段指示实现了多少（对）DEV_BASE 寄存器。寄存器格式如图 15-9 和 15-10 所示。

```python
 31                                                            8   7                               0
┌──────────────────────────────────────────────────────────────┬───────────────────────────────────┐
│                        Reserved, MBZ                         │         BASEADDRESS[39:32]        │
└──────────────────────────────────────────────────────────────┴───────────────────────────────────┘
```

**图 15-9. DEV_BASE_HI\[n\] 寄存器格式**

```python
 31                                          12 11              7     6            2   1   0
┌─────────────────────────────────────────────┬──────────────────┬──────────────┬─────┬────┬───┐
│              BASEADDRESS[31:12]             │   Reserved, MBZ  │     SIZE     │  P  │ V  │
└─────────────────────────────────────────────┴──────────────────┴──────────────┴─────┴────┴───┘
```

**图 15-10. DEV_BASE_LO\[n\] 寄存器格式**

DEV_BASE_HI 和 DEV_BASE_LO 寄存器的字段定义如下：

-   **有效（Valid，V）——位 0。** 指示是否为给定保护域定义了 DEV 表；如果此位被清除，软件可以将其余字段留作未定义，且不对此域中的内存引用执行保护检查。
-   **保护（Protect，P）——位 1。** 指示对超出 DEV 覆盖地址范围之外的地址的访问是合法的（P=0）还是非法的（P=1）。
-   **SIZE——位 6:2。** 指定 DEV 覆盖多少内存，以 4GB \* 2^SIZE^ 的增量表示。换言之，DEV 表最小覆盖 4GB，并可以按 2 的幂扩展。

**DEV_MAP 寄存器（DEV_MAP Registers）。** DEV_MAP 寄存器通过将请求关联的设备 ID（HT 总线和单元编号）与寄存器中的总线和单元编号匹配，为设备发起的请求分配保护域编号。如果在任何寄存器中都未找到匹配，则返回域编号零。芯片实现的 DEV_MAP 寄存器数量由 DEV_CAP 中的 N_MAPS 字段指示。

DEV_MAP 寄存器的格式如图 15-11 所示。

```python
 31         26 25      20 19              12 11 10          6   5    4          0
┌────────────┬──────────┬──────────────────┬───┬──────────────┬───┬──────────────┐
│    DOM1    │   DOM0   │      BUSNO       │ V1│    UNIT1     │ V0│     UNIT0     │
└────────────┴──────────┴──────────────────┴───┴──────────────┴───┴──────────────┘
```

**图 15-11. DEV_MAP\[n\] 寄存器格式**

DEV_MAP\[n\] 寄存器的字段定义如下：

-   **UNIT0——位 4:0。** 指定 BUSNO 字段指定的总线号上两个 HyperTransport 链路单元编号中的第一个。
-   **V0——位 5。** 指示 UNIT0 是否有效（无效条目上不发生匹配）。
-   **UNIT1——位 10:6。** 指定 BUSNO 字段指定的总线号上两个 HyperTransport 链路单元编号中的第二个。
-   **V1——位 11。** 指示 UNIT1 是否有效（无效条目上不发生匹配）。
-   **BUSNO——位 19:12。** 指定 HyperTransport 链路总线号。
-   **DOM0——位 25:20。** 指定第一个 HyperTransport 链路单元的保护域。
-   **DOM1——位 31:26。** 指定第二个 HyperTransport 链路单元的保护域。

### 15.24.7 未授权访问记录（Unauthorized Access Logging）

设备对 DEV 保护内存的任何未授权访问尝试都由主机桥记录在 DEV_Error_Status 和 DEV_Error_Address 寄存器中，供 VMM 检查。

### 15.24.8 安全初始化支持（Secure Initialization Support）

主机桥包含额外的逻辑，与 SKINIT 指令协同工作，在安全启动协议期间提供有限形式的内存保护。这为内存中的 Secure Loader 映像提供保护，使其能够（除其他事项外）建立完整的 DEV 保护。（SKINIT 的详细操作见第 15.27 节。）

主机桥逻辑包括一个隐藏的（软件不可访问的）SL_DEV_BASE 地址寄存器。SL_DEV_BASE 指向物理内存中一个 64KB 对齐的 64KB 区域。当 SL_DEV_EN 为 1 时，SL_DEV_BASE 定义的 64KB 区域受到外部访问保护（如同由 DEV 保护一样），以及通过 GART 转换地址的任何访问（CPU 和外部访问）的保护。此外，SL_DEV 机制在启用时会阻止所有设备对 PCI 配置空间的访问。

## 15.25 嵌套分页（Nested Paging）

可选的 SVM 嵌套分页特性提供两级地址转换，从而消除了 VMM 维护影子页表的需要。

### 15.25.1 传统分页与嵌套分页（Traditional Paging versus Nested Paging）

图 15-12 显示了在传统（单级）地址转换中，线性地址空间中的页如何映射到物理地址空间中的页。控制寄存器 CR3 包含页表（PT，图中阴影框表示）基址的物理地址，该基址管辖地址转换。

**图 15-12. 传统分页的地址转换** （线性空间 → 由 CR3 指向的页表 PT → 物理空间的示意图，见原手册第 568 页）

启用嵌套分页后，应用两级地址转换；请参阅下面的图 15-13。

-   客户和主机级别各有自己的 CR3 副本，分别称为 gCR3 和 nCR3。
-   客户页表（gPT）将客户线性地址映射到客户物理地址。客户页表位于客户物理内存中，由 gCR3 指向。
-   嵌套页表（nPT）将客户物理地址映射到系统物理地址。嵌套页表位于系统物理内存中，由 nCR3 指向。
-   最近使用的从客户线性到系统物理地址的转换缓存在 TLB 中，并在后续客户访问中使用。

重要的是要注意 gCR3 和客户页表条目包含客户物理地址，而非系统物理地址。因此，在访问客户页表条目之前，表遍历器首先将该条目的客户物理地址转换为系统物理地址。

**图 15-13. 嵌套分页的地址转换** （gCR3 → gPT → 客户物理空间 → nCR3 → nPT → 系统物理空间；VMM 使用自己的 CR3 → PT 的示意图，见原手册第 569 页）

VMM 可以给每个客户不同的 ASID，因此来自不同客户的 TLB 条目可以共存于 TLB 中。ASID 值零为主机保留；如果 VMM 尝试以客户 ASID 为零执行 VMRUN，结果是 #VMEXIT(VMEXIT_INVALID)。注意，由于 ASID 与客户的物理地址空间关联，它在处理器内所有客户虚拟地址空间中是通用的。这与影子页表不同，影子页表中 ASID 标记单个客户虚拟地址空间。还要注意，在多处理器系统中，对于嵌套表或影子表，相同的 ASID 可以在所有处理器上关联相同或不相同的地址空间；这取决于 VMM 如何管理 ASID 分配。

### 15.25.2 复制状态（Replicated State）

影响分页的大部分处理器状态为主机和客户复制。这包括分页寄存器 CR0、CR3、CR4、EFER 和 PAT。CR2 不被复制，但由 VMRUN 加载。MTRR 不被复制。

启用嵌套分页时，x86 代码对分页寄存器状态的所有（客户）引用（MOV to/from CRn 等）读取和写入寄存器的客户副本；VMM 的寄存器版本不受影响，并继续控制从客户物理到系统物理地址的第二级转换。相反，禁用嵌套分页时，VMM 的分页控制寄存器存储在主机的状态保存区中，客户 VMCB 中的分页控制寄存器是这些寄存器的唯一活动版本。

### 15.25.3 启用嵌套分页（Enabling Nested Paging）

当 VMCB 中的 NP_ENABLE 位置 1 时，VMRUN 指令启用嵌套分页。VMCB 包含额外转换页表的 hCR3 值。额外转换使用与 VMM 执行最近一次 VMRUN 时相同的分页模式。

嵌套分页由 #VMEXIT 自动禁用。

仅当主机已启用分页时才允许嵌套分页。嵌套分页的支持由 CPUID Fn8000_000A_EDX\[NP\] = 1 指示。如果 hCR0.PG 清零且 NP_ENABLE 置 1 时执行 VMRUN，则 VMRUN 以 #VMEXIT(VMEXIT_INVALID) 终止。有关使用 CPUID 指令的更多信息，请参见第 3.3 节"处理器特性识别"（第 72 页）。

### 15.25.4 嵌套分页与 VMRUN/#VMEXIT（Nested Paging and VMRUN/#VMEXIT）

当启用嵌套分页（NP_ENABLE = 1）执行 VMRUN 时，分页寄存器受影响如下：

-   VMRUN 将 VMM 的 CR3 保存在主机保存区中。
-   VMRUN 从客户 VMCB 将客户分页状态加载到客户寄存器中（即 VMRUN 用 VMCB CR3 字段加载 CR3 等）。客户 PAT 寄存器从 VMCB 中的 G_PAT 字段加载。
-   VMRUN 从 VMCB 中的 N_CR3 字段加载 nCR3，即嵌套分页客户运行时使用的 CR3 版本。其他主机分页控制位（hCR4.PAE 等）保持与执行 VMRUN 时 VMM 中的状态相同。

当启用嵌套分页（NP_ENABLE = 1）执行 VMRUN 时，除"规范化与一致性检查"（第 525 页）中提到的条件外，以下条件被视为非法状态组合：

-   nCR3 的任何 MBZ 位置位。
-   任何 G_PAT.PA 字段具有不支持的类型编码，或 G_PAT 中任何保留字段具有非零值。（见第 7.8.1 节"PAT 寄存器"，第 228 页。）

当启用嵌套分页发生 #VMEXIT 时：

-   #VMEXIT 将客户分页状态（gCR3、gCR0 等）写回 VMCB。nCR3 不保存回 VMCB。
-   #VMEXIT 除 CR3 外无需从主机保存区重新加载任何主机分页状态，尽管实现可以自由这样做。

### 15.25.5 嵌套表遍历（Nested Table Walk）

当客户在启用嵌套分页的情况下运行时，TLB 未命中导致多次嵌套表遍历：

-   **客户页表**——gCR3 寄存器指定一个客户物理地址，客户页表中的条目也是如此。这些客户物理地址必须使用嵌套页表转换为系统物理地址。这些访问可能发生嵌套页表级故障，包括由于在客户页表中设置访问和脏位而导致的写故障。
-   **最终客户物理页**——一旦已知客户线性到客户物理的映射，就可以检查客户权限。如果客户页表允许该访问，则在嵌套页表中遍历客户物理地址以找到系统物理地址。

除非为客户启用了只读客户页表（Read Only Guest Page Tables），否则客户页表的表遍历在嵌套页表级别总是被视为用户写入。因此：

-   该页在嵌套页表级别必须可由用户写入，否则引发 #VMEXIT(NPF)，并且
-   在针对客户页表条目的嵌套页表遍历期间接触到的嵌套页表条目中，脏位和访问位总是被设置。

客户页本身的表遍历在嵌套页表级别总是被视为用户访问，但根据客户访问被视为数据读取、数据写入或代码读取。

CPUID Fn8000000A_EDX\[ROGPT\]（位 21）= 1 指示支持只读客户页表。通过设置 VMCB 偏移 90h 处的位 6 为客户启用只读客户页表。启用只读客户页表时，仅当需要更新客户页表中的访问或脏位时，客户页表访问才在嵌套页表级别被视为写入，从而允许 hypervisor 将客户页表映射到只读嵌套页中。

如果客户禁用了分页（gCR0.PG = 0），则没有要在嵌套页表中转换的客户页表条目。在这种情况下，最终客户物理地址等于客户线性地址，并且仍在嵌套页表中转换。

### 15.25.6 嵌套页故障与客户页故障、故障排序（Nested versus Guest Page Faults, Fault Ordering）

在嵌套分页中，页故障可以在客户或嵌套页表级别引发。嵌套遍历按以下顺序进行；故障按相同顺序生成：

1.  在嵌套页表中遍历客户页表条目。根据需要设置嵌套页表中的脏/访问位。任何嵌套页表故障导致 #VMEXIT(NPF)。
2.  随着客户页表遍历从页表顶部进行到最后一个条目，客户遍历每一级中客户页表条目的任何不存在条目或保留位导致客户中的 #PF。在遍历期间根据需要设置客户页表中的客户脏位和访问位。对于所遍历的客户页表的每一级，重复步骤 1 和 2。
3.  一旦确定了客户访问的客户物理地址，检查客户权限；此时任何故障导致客户中的 #PF。
4.  使用嵌套页表执行从客户物理到系统物理的最终转换；此转换期间的任何故障导致 #VMEXIT(NPF)。

嵌套页故障完全是嵌套页表和 VMM 处理器模式的函数。嵌套故障导致到 VMM 的 #VMEXIT(NPF)。故障的客户物理地址保存在 VMCB 的 EXITINFO2 字段中；EXITINFO1 提供类似于 #PF 错误代码的错误代码：

-   **位 0（P）**——如果嵌套页不存在则清零为 0，否则为 1
-   **位 1（RW）**——如果嵌套页表级访问是写入则置 1。注意，针对客户页表的主机表遍历总是被视为数据写入。
-   **位 2（US）**——如果嵌套页表级访问是用户访问则置 1。注意，由 MMU 执行的嵌套页表访问被视为用户访问，除非启用了覆盖此行为的特性。
-   **位 3（RSV）**——如果相应嵌套页表条目中设置了保留位则置 1
-   **位 4（ID）**——如果嵌套页表级访问是代码读取则置 1。注意，客户页表的嵌套表遍历总是被视为数据写入，即使访问本身是代码读取
-   **位 6（SS）**——如果故障由影子堆栈访问引起则置 1

此外，嵌套页故障的 VMCB 内容指示页故障是在针对客户页 TLB 条目的嵌套页表遍历期间遇到的，还是在客户物理地址的最终嵌套遍历期间遇到的，如 EXITINFO1\[33:32\] 所示：

-   **位 32**——如果在转换客户的最终物理地址时发生嵌套页故障则置 1
-   **位 33**——如果在转换客户页表时发生嵌套页故障则置 1
-   **位 37**——如果该页在嵌套页表的叶节点中标记为管理程序影子堆栈页，且在 VMCB 偏移 90h 中启用了影子堆栈检查特性则置 1

客户故障完全是客户页表和处理器模式的函数；除非 VMM 正在拦截客户 #PF 异常，否则它们作为正常 #PF 异常投递给客户，无需任何 VMM 干预。EXITINFO1 的位 32 和 33 在嵌套页故障期间写入，以指示页故障是在针对客户页表条目的嵌套页表遍历期间遇到的，还是在最终客户物理地址转换的嵌套页表遍历期间遇到的。

有关 #VMEXIT(NPF) EXITINFO1 字段的更多定义，请参见第 630 页第 15.36.10 节"RMP 和 VMPL 访问检查"。

处理器可能提供额外的指令解码辅助信息。见第 15.10 节。

### 15.25.7 组合嵌套和客户属性（Combining Nested and Guest Attributes）

对客户物理内存的任何访问都通过检查客户物理地址在嵌套页表中的映射来执行权限检查。

只有当页在客户和嵌套页表级别都被标记为可写时，该页才被视为客户可写。注意，客户的 gCR0.WP 仅影响客户页表条目的解释；如果页在嵌套页表中被标记为只读，则设置 gCR0.WP 不能使该页在客户中的任何 CPL 下可写。主机 hCR0.WP 位在嵌套分页下被忽略。

只有当页在客户和嵌套页表级别都被标记为可执行时，该页才被视为客户可执行。如果客户的 EFER.NXE 位被清除，则所有客户页在客户级别可执行。类似地，如果主机的 EFER.NXE 位被清除，则所有嵌套页表映射在底层嵌套级别可执行。

某些属性仅取自客户页表和操作模式。只有当页在客户页表中被标记为全局时，它才被视为客户内的全局页；嵌套页表条目和主机 hCR4.PGE 无关。全局页仅在其 ASID 内是全局的。

只有当页在客户级别被标记为用户时，它才被视为客户中的用户页。该页必须在嵌套页表中被标记为用户，才能允许任何客户访问。

### 15.25.8 组合内存类型、MTRR（Combining Memory Types, MTRRs）

当禁用嵌套分页时，处理器表现得如同没有 gPAT 寄存器。主机 PAT MSR 确定当前 VM 的内存类型属性，客户对 PAT MSR 的未被 VMM 拦截的写入将改变主机 PAT MSR。hypervisor 负责在 VM 之间的世界切换时上下文切换 PAT MSR 内容。

启用嵌套分页时，处理器组合客户和嵌套页表内存类型。影响内存类型的寄存器包括：

-   嵌套和客户页表条目中的 PCD/PWT/PATi 位。
-   嵌套 CR3 和客户 CR3 寄存器中的 PCD/PWT 位。
-   客户 PAT 类型（通过适当地索引 gPAT 寄存器获得）。
-   主机 PAT 类型（通过适当地索引主机的 PAT 寄存器获得）。
-   MTRR（仅基于系统物理地址引用）。
-   gCR0.CD 和 hCR0.CD。

注意，没有支持客户 MTRR 的硬件；VMM 可以通过改变嵌套页表中的内存类型来模拟其效果。注意，MTRR 仅应用于系统物理地址。

构造客户 TLB 条目时组合内存类型的规则是：

-   根据表 15-19 组合嵌套和客户 PAT 类型，产生"组合 PAT 类型"。
-   根据表 15-20 将组合 PAT 类型进一步与 MTRR 类型组合，其中相关 MTRR 由系统物理地址确定。
-   gCR0.CD 或 hCR0.CD 都可以禁用缓存。

**内存一致性（Memory Consistency）问题。** 由于客户使用额外字段确定内存类型，VMM 访问给定内存时使用的内存类型可能与客户不同。如果一个访问可缓存而另一个不可缓存，VMM 和客户可能观察到不同的内存映像，这是不期望的。（当 VMM 希望将虚拟处理器从一个物理处理器迁移到另一个时，MP 系统对此问题特别敏感。）

为解决此问题，提供了以下机制：

-   VMRUN 和 #VMEXIT 刷新写组合器。这确保客户对 WC 内存的所有写入无论内存类型如何都对主机可见（反之亦然）。（这不确保一个代理的可缓存写入被另一个代理的 WC 读取或写入正确观察到。）
-   引入了新的内存类型 WC+。WC+ 是不可缓存内存类型，并像 WC 一样在写组合缓冲区中组合写入。与 WC 不同（但像 CD 内存类型），对 WC+ 内存的访问也探测所有处理器上的缓存（包括自探测发出请求的处理器的缓存）以维持一致性。这确保可缓存写入被 WC+ 访问观察到。
-   当组合在缓存方面不兼容的嵌套和客户内存类型时，使用 WC+ 内存类型代替 WC（并且表 15-20 确保无论主机 MTRR 设置如何都保留探测行为）。参考表 15-19 了解详情。

表 15-19 显示了客户和主机 PAT 类型如何组合为有效 PAT 类型。解释此表时，请记住 (a) 禁用嵌套分页时不组合客户和主机 PAT 类型，以及 (b) 意图是让 VMM 使用其 PAT 类型模拟客户 MTRR。

**表 15-19. 组合客户和主机 PAT 类型**

| 客户 PAT 类型 | 主机 UC | 主机 UC– | 主机 WC | 主机 WP | 主机 WT | 主机 WB |
| --- | --- | --- | --- | --- | --- | --- |
| UC  | UC  | UC  | UC  | UC  | UC  | UC  |
| UC– | UC  | UC– | WC  | UC  | UC  | UC  |
| WC  | WC  | WC  | WC  | WC+ | WC+ | WC+ |
| WP  | UC  | UC  | UC  | WP  | UC  | WP  |
| WT  | UC  | UC  | UC  | UC  | WT  | WT  |
| WB  | UC  | UC  | WC  | WP  | WT  | WB  |

现有的 AMD64 表（定义 PAT 类型如何与物理 MTRR 组合）被扩展以处理 CD 和 WC+ PAT 类型，如表 15-20 所示。

**表 15-20. 组合 PAT 和 MTRR 类型**

| 有效 PAT 类型 | MTRR UC | MTRR WC | MTRR WP | MTRR WT | MTRR WB |
| --- | --- | --- | --- | --- | --- |
| UC  | UC  | CD  | CD  | CD  | CD  |
| UC– | UC  | WC  | CD  | CD  | CD  |
| WC  | WC  | WC  | WC  | WC  | WC  |
| WC+ | WC  | WC  | WC+ | WC+ | WC+ |
| WP  | UC  | CD  | WP  | CD  | WP  |
| WT  | UC  | CD  | CD  | WT  | WT  |
| WB  | UC  | WC  | WP  | WT  | WB  |

### 15.25.9 页分裂（Page Splintering）

当地址被具有不同页大小的客户和嵌套页表条目映射时，创建的 TLB 条目匹配较小页的大小。

### 15.25.10 传统 PAE 模式（Legacy PAE Mode）

嵌套分页客户中 PAE 模式的行为与（仅主机）传统 PAE 模式的行为略有不同，因为客户的四个 PDPE 在写入 CR3 时不会被加载到处理器中。相反，PDPE 作为表遍历的一部分按需访问。这产生的副作用是 PDPE 中的非法位组合不是在写入 CR3 时发出信号，而是在故障的 PDPE 作为表遍历的一部分被访问时发出信号。

这意味着操作系统不能依赖内存中 PDPE 与处理器内副本不同时的行为。

### 15.25.11 A20 屏蔽（A20 Masking）

没有对客户物理地址应用 A20 屏蔽的规定；VMM 可以通过相应地更改嵌套页映射来模拟 A20 屏蔽。

### 15.25.12 检测嵌套分页支持（Detecting Nested Paging Support）

嵌套分页是 SVM 的可选特性，并非在所有支持 SVM 的处理器实现中都可用。应使用 CPUID 指令检测特定处理器上的嵌套分页支持。有关使用 CPUID 指令的更多信息，请参见第 3.3 节"处理器特性识别"（第 72 页）。

### 15.25.13 客户模式执行陷阱扩展（Guest Mode Execute Trap Extension）

客户模式执行陷阱（GMET）扩展允许 hypervisor 在客户尝试从 hypervisor 指定的页以 CPL0、1 或 2 执行代码时导致嵌套页故障。GMET 扩展的存在由 CPUID Fn8000_000A EDX\[17\]=1 指示。通过将 VMCB 偏移 090h 的位 3 设置为 1 为目标客户选择 GMET 模式。对于不支持 GMET 的处理器，此位被忽略。

在支持 GMET 的处理器上，当 VMRUN 时此位设置为 1 时，处理器改变嵌套页表中 U/S 位的解释方式。NX 位置 1 时仍禁止在任何特权级别执行代码。然而，启用 GMET 且有效 NX 位 = 0 时，如果有效 U/S 位 = 1 且该页正被 CPL0、1 或 2 执行访问，则生成嵌套页故障 #VMEXIT(NPF)。如果有效 NX 位 = 0 且有效 U/S 位 = 0，则允许代码页的转换。下表总结了启用 GMET 时的行为。

**表 15-21. GMET 页配置**

| nPT NX 位 | nPT U/S 位 | 客户用户模式代码 | 客户管理程序模式代码 |
| --- | --- | --- | --- |
| 1   | X   | 禁止执行 | 禁止执行 |
| 0   | 1   | 允许执行 | 禁止执行 |
| 0   | 0   | 允许执行 | 允许执行 |

嵌套页故障的 EXITINFO1 字段包含描述导致故障的尝试转换属性的页故障错误代码。GMET 违规不通过单独的位显式指示。由软件通过检查此错误代码以及故障页的有效 NX 和 U/S 设置来确定它是基于 NX 还是基于 GMET。¹

¹ 客户用户/管理程序指示通常提供在 ExitInfo1 中，但在某些实现上，GMET 勘误可能要求从客户 VMCB 读取 CPL。

### 15.25.14 管理程序影子堆栈（Supervisor Shadow Stacks）

管理程序影子堆栈（SSS）特性是嵌套分页的扩展，允许 hypervisor 限制哪些客户物理地址可以用于客户管理程序影子堆栈。客户对嵌套页表中未指定为 SSS 页的页进行的管理程序影子堆栈访问导致 #VMEXIT(NPF)。

**确定对 SSS 的支持。** SSS 特性的支持由 CPUID Fn8000_000A_EDX\[19\]（SupervisorShadowStack）= 1 指示。

**启用 SSS。** SSS 特性通过设置 VMCB 偏移 90h 的位 4 启用（见表 B-1. VMCB 布局，控制区）。仅当 VMCB 中启用了嵌套分页且主机中启用了 PAE 和禁止执行分页模式（EFER.NXE=1）时，才能启用 SSS 特性。尝试在启用 SSS 且禁用嵌套分页的情况下执行 VMRUN 会导致 VMEXIT(INVALID)。如果主机不是传统非 PAE 模式或 EFER.NXE=0，则静默忽略启用 SSS 特性的尝试。

无论客户是否已启用影子堆栈，都可以启用 SSS 特性。

**指定 SSS 页（Designating SSS Pages）。** 启用 SSS 特性时，hypervisor 使用以下嵌套页表位组合指示某个页可以用于管理程序影子堆栈：

-   用于转换地址的最终嵌套页表条目中 NX=1 且 U/S=0。
-   通向最终嵌套页表条目的所有其他嵌套非叶页表条目中 R/W=1。

虽然 SSS 特性不强制执行，但为了实现期望的安全功能，最终嵌套页表条目中 R/W 应为 0。

**SSS 访问检查（SSS Access Checking）。** 启用 SSS 特性时，仅允许客户管理程序影子堆栈访问嵌套页表中指定为 SSS 页的物理页。注意，即使最终嵌套页表条目中 R/W=0，对 SSS 页的管理程序影子堆栈写入也允许完成。

以下对 SSS 页的访问是不允许的：

-   对非 SSS 页的管理程序影子访问。这导致 #VMEXIT(NPF)，并在 EXITINFO1 错误代码中设置 SS 位。
-   尝试从 SSS 页执行代码。这导致 #VMEXIT(NPF)，与任何 NX=1 的页相同。

有关嵌套页故障 EXITINFO1 错误代码的更多信息，请参见第 572 页第 15.25.6 章"嵌套页故障与客户页故障、故障排序"。

### 15.25.15 页修改记录（Page Modification Logging）

设置 CPUID Fn8000_0000A_ECX\[PML\]（位 4）= 1 的处理器支持页修改记录（PML）。借助 PML，处理器记录设置嵌套页表条目脏位的客户物理地址。

当 VMCB 控制区偏移 90h 的位 11 置位且启用了嵌套分页时，PML 在 VMRUN 时启用。当客户内存写访问设置嵌套页表条目的脏位时，处理器将 4-Kbyte 对齐的客户物理地址（位 11:0 清零）写入 PML 缓冲区。PML 缓冲区是位于 VMCB 控制区偏移 1C8h 配置的 PML_BASE 地址处的 4-Kbyte 内存区域。处理器维护一个 PML 缓冲区索引，指向要写入的下一个 PML 缓冲区条目。在允许写访问并设置嵌套页表脏位之前，处理器检查 PML 缓冲区索引是否在 0 和 1FFh 之间的范围内。如果是，处理器允许写访问、设置脏位并将客户物理地址（如上指定）写入 PML 缓冲区。具体来说，寻址 PML_BASE + PML_INDEX \* 8。然后递减 PML 索引。在 #VMEXIT 时，当前 PML 索引写入 VMCB 控制区的 PML_INDEX（偏移 1D0h）。

如果 PML 缓冲区索引超出 0 到 1FFh 之间的范围，则不执行写访问，也不设置脏位。相反，处理器以退出代码 VMEXIT_PML_FULL（407h）执行 #VMEXIT。VMEXIT_PML_FULL 不推进客户中的 rIP，并且对于 SEV-ES 和 SEV-SNP 客户是 AE（自动退出）。

处理 VMEXIT_PML_FULL 事件后以及配置 PML 时，hypervisor 软件应将 1FFh 写入 PML_INDEX（VMCB 控制区偏移 1D0h）以清空缓冲区。

由于 PML 还跟踪对客户页表条目的写入，单个客户写访问可能导致记录多个客户物理地址。

## 15.26 安全（Security）

SVM 提供了额外的硬件支持，旨在促进受信任软件系统的构建。虽然本节描述的安全特性与 SVM 的虚拟化支持正交（并且不是处理器虚拟化所必需的），但两者构成受信任系统的构建块。

**SKINIT 指令。** SKINIT 指令及相关的系统支持（可信平台模块或 TPM）旨在允许基于安全哈希比较对受信任软件（如 VMM）进行可验证的启动。

**安全异常。** 安全异常（#SX）用于发信号通知某些安全关键事件。

## 15.27 使用 SKINIT 的安全启动（Secure Startup with SKINIT）

SKINIT 指令是创建"信任根"的关键之一，从最初不受信任的操作模式开始。SKINIT 重新初始化处理器，为称为安全加载器（secure loader，SL）的软件组件建立安全执行环境，并以无法被篡改的方式开始 SL 的执行。SKINIT 还将安全加载器可执行映像复制到外部设备（如可信平台模块 TPM）进行验证，使用独特的总线事务，防止 SKINIT 操作被软件以 TPM 不易检测的方式模拟。（详细操作在第 15.27.4 节中描述。）

### 15.27.1 安全加载器（Secure Loader）

安全加载器（SL）通常初始化 SVM 硬件机制和相关数据结构，并在首先验证受信任软件（本文档中称为安全内核 Security Kernel，或 SK）的身份后，启动该软件的受信任部分（如 VMM）的执行。

SKINIT 允许在系统已经以不受信任模式启动并运行之后可靠地启用 SVM 保护——无需更改典型的 x86 平台引导流程。

从 SL 到 SK 移交的确切细节取决于 SL、SK 和初始不受信任操作环境的特性。然而，SL 映像有特定要求，如第 15.27.2 节所述。

### 15.27.2 安全加载器映像（Secure Loader Image）

安全加载器（SL）映像包含安全加载器的所有代码和已初始化数据段。此代码和初始数据用于以完全安全的方式初始化和启动安全内核，包括为 SL 和 SK 使用而分配的内存设置 DEV 保护。SL 映像加载到称为安全加载器块（SLB）的内存区域中，最大不能超过 64Kbyte（见第 15.27.3 节）。SL 映像定义为从 SLB 中的字节偏移 0 开始。

SL 映像的第一个字（16 位）必须将 SL 入口点指定为 SL 映像中的无符号偏移。第二个字必须包含映像的字节长度；允许的最大长度为 65535 字节。SKINIT 指令使用这两个值。映像其余部分的布局由软件约定确定。映像通常包含用于验证的数字签名。数字签名哈希必须包括入口点和长度字段。SKINIT 在开始 SL 执行之前将 SL 映像传输到 TPM 进行验证（此传输的更多细节见第 15.27.6 节）。计算哈希的 SL 映像必须准备好无需事先操作即可执行。

### 15.27.3 安全加载器块（Secure Loader Block）

安全加载器块是 64Kbyte 范围的物理内存，可以位于 4Gbyte 以下任何 64Kbyte 对齐的地址。在执行 SKINIT 之前，SL 映像必须已从偏移 0 开始加载到 SLB 中。SLB 的物理地址作为输入操作数（在 EAX 寄存器中）提供给 SKINIT，SKINIT 为 SLB 设置针对设备访问的特殊保护（即 DEV 尚不需要激活）。

SL 必须编写为最初以禁用分页的平坦 32 位保护模式执行。可以从 EAX 中的值推导基地址，使用 base+displacement 寻址访问 SL 映像内的数据区域，使 SL 代码位置无关。

SL 映像结束与 SLB 结束之间的内存可以在进入时立即由 SL 用作安全暂存空间，例如作为初始堆栈，在为内存其余部分设置 DEV 保护之前。所需空间量将限制 SL 映像的最大大小，并取决于 SL 实现。SKINIT 将 ESP 寄存器设置为适当的栈顶值（EAX + 10000h）。

图 15-14 说明了 SLB 的布局，显示 SKINIT 执行后 EAX 和 ESP 指向的位置。斜体标签表示建议用途；其他标签反映必需项。

**图 15-14. SLB 示例布局** （64 KB SLB：SL 头（EP Offset、Length）→ SL 入口点 → SL 代码和静态数据（SL 映像/哈希区）→ SL 栈 → SL 运行时数据区；SKINIT 后 EAX 指向 SL 映像起始，ESP 指向 SLB 之后第一个字节，见原手册第 580 页）

### 15.27.4 可信平台模块（Trusted Platform Module）

可信平台模块（TPM）是完整可信系统初始化的重要组成部分。该设备连接到系统 I/O hub 之外的 LPC 链路。它识别特殊的 SKINIT 事务，接收 SKINIT 发送的 SL 映像并验证签名。基于结果，设备决定是否与 SL 或后续 SK 协作。TPM 通常包含密封存储，其中包含可能特定于平台的加密密钥和其他高安全性信息。

### 15.27.5 系统接口、内存控制器和 I/O hub 逻辑（System Interface, Memory Controller and I/O Hub Logic）

SKINIT 使用处理器系统接口单元、内部控制器以及 TPM 所连接的 I/O hub 中的特殊支持逻辑。SKINIT 使用 SKINIT 独有的特殊事务，连同此支持逻辑，旨在安全地将 SL 映像传输到 TPM 进行验证。使用此特殊协议旨在允许 TPM 检测受信任安全加载器的真实执行（而非模拟），这进而提供了验证后续加载和启动受信任安全内核的手段。

### 15.27.6 SKINIT 操作（SKINIT Operation）

SKINIT 指令旨在主要在正常模式下、VMM 取得控制之前使用。

SKINIT 在 EAX 中将其唯一输入操作数 SLB 的物理基地址，并执行以下步骤：

1.  以与 INIT 信号相同的方式重新初始化处理器状态，然后进入分页关闭的平坦 32 位保护模式。CS 选择子设置为 8h，CS 为只读。SS 选择子设置为 10h，SS 为读/写且向上扩展。CS 和 SS 基址清零，限长设置为 4G。DS、ES、FS 和 GS 保留为 16 位实模式段，SL 必须在使用它们之前使用具有适当 GDT 条目的保护模式选择子重新加载它们。在重新加载 DS 之前，可以使用 SS 段覆盖前缀引用 SLB 中的已初始化数据。通用寄存器被清除，但 EAX（指向安全加载器的开始）、EDX（包含型号、系列和步进信息）和 ESP（包含安全加载器的初始堆栈指针）除外。缓存内容保持完整，x87 和 SSE 控制寄存器也是如此。大多数 MSR 也保留其值，但可能危及 SVM 保护的那些除外。然而，EFER MSR 被清除。VM_CR 寄存器中的 DPD、R_INIT 和 DIS_A20M 标志被无条件设置为 1。
2.  通过清除 EAX 的位 15:0 形成 SLB 基地址（EAX 被更新），并启用 SL_DEV 保护机制（见第 15.24.8 节），以保护从 SLB 基地址开始的 64-Kbyte 物理内存区域免受任何设备访问。
3.  在多处理器操作中，按第 15.27.8 节所述执行处理器间握手。
4.  从内存读取 SL 映像并以软件无法模拟的方式传输到 TPM。
5.  发信号通知 TPM 完成哈希并验证签名。如果在此过程中发生任何失败，TPM 将断定没有启动有效的 SL。
6.  清除全局中断标志。这会禁用所有中断，包括 NMI、SMI 和 INIT，并确保后续代码可以原子执行。如果处理器在 GIF 清除时进入 shutdown 状态（例如由于三重故障），则只能通过 RESET 重新启动。
7.  更新 ESP 寄存器以指向 SLB 末尾之后的第一个字节（SLB 基址 + 65536），以便 SL 压入堆栈的第一项将位于 SLB 顶部。
8.  将 SLB 中的无符号 16 位入口点偏移值与 SLB 基地址相加形成 SL 入口点地址，并跳转到它。

就 SKINIT 而言，TPM 对 SL 映像的验证是单向事务。它在跳转到 SL 入口点之前不依赖 TPM 在传输 SL 映像后的任何响应，并无条件地启动安全加载器的执行。由于执行的处理器初始化，SKINIT 不响应指令或数据断点陷阱，也不响应由 EFLAGS.TF 导致的跟踪陷阱。

**挂起中断（Pending interrupts）。** 由于 EFLAGS.IF 被清除而在 SKINIT 执行之前可能挂起的设备中断，或在 SKINIT 执行期间断言的设备中断，将保持挂起直到软件随后将 GIF 设置为 1。类似地，在 SKINIT 执行开始后断言的 SMI、INIT 和 NMI 中断也将保持挂起直到 GIF 设置为 1。

**调试注意事项（Debug Considerations）。** SKINIT 自动禁用各种实现特定的硬件调试特性。SL 的调试版本可以通过在进入时立即清除 VM_CR.DPD 标志来重新启用这些特性。

### 15.27.7 SL 中止（SL Abort）

如果 SL 确定它无法正确初始化有效的 SK，则必须使 GIF 设置为 1 并清除 VM_CR MSR，以重新启用正常处理器操作。

### 15.27.8 安全多处理器初始化（Secure Multiprocessor Initialization）

以下标准 APIC 特性用于安全 MP 初始化：

-   单个引导处理器（BSP）和多个应用处理器（AP）的概念。
-   INIT 处理器间中断（IPI），将目标处理器置于仅响应后续 Startup IPI 的暂停状态（INIT 状态）。
-   Startup IPI 使目标处理器在由 Boot Processor 指定并与 Startup IPI 一起传达的内存位置开始执行。处理器对 Startup IPI 的响应操作略有修改以支持安全初始化，如下所述。

Startup IPI 通常使 AP 在 IPI 提供的位置开始执行。为支持安全 MP 启动，每个 AP 响应 startup IPI 时，当且仅当 BSP 已指示其执行了 SKINIT，才额外清除其 GIF 并设置 VM_CR 寄存器中的 DPD、R_INIT 和 DIS_A20M 标志。Startup IPI 行为的所有其他方面保持不变。

**安全 MP 初始化的软件要求（Software Requirements for Secure MP initialization）。** 启动 SL 的驱动程序必须在 BSP 上执行。在执行 SKINIT 指令之前，驱动程序必须将任何处理器特定的系统寄存器内容保存到内存中，以便在 AP 重新初始化后恢复。驱动程序还应将所有 AP 置于空闲状态。驱动程序必须首先确认所有 AP 都空闲，然后必须向所有 AP 发出 INIT IPI 并等待其本地 APIC 忙指示清除。这使 AP 进入仅响应后续 Startup IPI 的暂停状态。AP 仍将响应缓存一致性探测。驱动程序可以在此时点之后的任何时间执行 SKINIT。根据处理器实现，在执行 SKINIT 之前可能需要不超过 1000 个处理器周期的固定延迟，以确保 SKINIT 可靠地感应 APIC INIT 状态。

**AP 启动序列（AP Startup Sequence）。** 当 SL 开始在 BSP 上执行时，AP 保持暂停在 APIC INIT 状态。SL 或 SK 可以在认为适当的任何时点发出 AP 的 Startup IPI。Startup IPI 传达由发出 IPI 的软件指定给 AP 的 8 位向量。此向量提供 20 位物理地址的高 8 位。因此，AP 启动代码必须驻留在物理内存的低 1 Mbyte 中——入口点位于该特定页的偏移 0 处。

响应 Startup IPI 时，AP 以 16 位实模式在指定位置开始执行。此 AP 启动代码必须按 SL 或 SK 确定的在每个处理器上设置保护。它还必须设置 GIF 以重新启用中断，并在恢复正常系统操作之前恢复 SKINIT 前的系统上下文（按 BSP 上执行的 SL 或 SK 的指示）。

SL 必须确保 AP 启动序列的完整性，例如通过将启动代码包含在哈希的 SL 映像中，并在将其复制到所需区域之前为其设置 DEV 保护。AP 启动代码不需要（也不应该）执行 SKINIT。还必须注意避免在 BSP 执行 SKINIT 之后、所有 AP 收到 Startup IPI 之前从任何处理器发出另一个 INIT IPI，因为这可能危及 AP 初始化的完整性。

**挂起中断（Pending interrupts）。** 由于 EFLAGS.IF 被清除而在 APIC INIT IPI 之前可能挂起的设备中断，或在处理器接受 INIT IPI 之后的任何时间断言的设备中断，将通过后续 Startup IPI 保持挂起，并保持挂起直到软件在该 AP 上将 GIF 设置为 1。类似地，在处理器接受 INIT IPI 之后断言的 SMI、INIT 和 NMI 中断也将保持挂起直到 GIF 设置为 1。

**中止 MP 初始化（Aborting MP initialization）。** 如果 BSP 上的 SL 或 SK 决定因任何原因中止 SVM 系统初始化，则在将控制返回原始操作环境之前，必须在每个处理器上执行的 SL 代码执行以下清理操作：

-   响应 Startup IPI 的 BSP 和所有 AP 必须恢复 GIF 并清除每个处理器上的 VM_CR 以恢复正常操作。
-   对于每个具有关联的不同内存控制器的处理器，必须清除 DEV 控制寄存器中的 SL_DEV_EN 标志，以恢复对 64KB SL 内存范围的正常设备可访问性。

SL 创建的任何不应暴露给不受信任代码的安全上下文，应在采取这些步骤之前适当地清理。

## 15.28 安全异常（#SX，Security Exception）

安全异常故障以异常形式发信号通知执行 VMM 时发生的安全敏感事件，以便 VMM 可以采取适当行动。（VMM 通常会拦截客户中的类似敏感事件。）目前，#SX 的唯一用途是将外部 INIT 重定向为异常，以便 VMM 可以——除其他可能性外——在重新发出 INIT（这次不重定向）之前销毁敏感信息。INIT 重定向由 VM_CR.R_INIT 位控制。（INIT 和 #SX 行为的更多细节见"INIT 支持"，第 556 页。）注意 INIT 受全局中断标志（GIF）门控，因此如果在 GIF 为 0 时断言将保持挂起。当 GIF 转换为 1 时，INIT 将根据 R_INIT 的状态生效或被重定向到 #SX。

#SX 异常分派到向量 30，行为与其他故障类异常（如通用保护故障 #GP）类似。#SX 异常压入错误代码。当前唯一定义的错误代码是 1，表示发生了 INIT 重定向。

#SX 异常是促成性（contributory）故障。

## 15.29 高级虚拟中断控制器（Advanced Virtual Interrupt Controller）

AMD 高级虚拟中断控制器（AVIC）是对 AMD 虚拟化™技术（AMD-V）的重要增强。在虚拟化环境中，AVIC 向每个客户呈现符合本地高级可编程中断控制器（APIC）架构的虚拟中断控制器。APIC 的详细描述见第 650 页第 16 章"高级可编程中断控制器（APIC）"。

### 15.29.1 引言（Introduction）

在虚拟化计算机系统中，每个客户操作系统都需要访问中断控制器，以发送和接收设备和处理器间中断。在没有硬件加速时，由虚拟机监视器（VMM）拦截客户发起的访问中断控制器寄存器的尝试，并提供控制器系统编程接口的直接模拟，允许客户发起和处理中断。VMM 使用系统的底层物理和虚拟中断投递机制，将来自 I/O 设备和虚拟处理器的中断投递到目标客户虚拟处理器，并处理任何所需的结束中断处理。

考虑到在某些场景中（尤其是服务器级系统上）设备和处理器间中断生成的高速率，本地 APIC 的模拟可能是 VMM 的显著负担。AVIC 架构通过对中断处理的以下组件应用硬件加速来解决虚拟化环境中客户中断处理的开销：

-   为客户操作系统提供对性能关键的中断控制器寄存器的访问
-   在客户中的虚拟处理器内部和之间发起处理器内和处理器间中断（IPI）

**软件发起的中断（Software-initiated Interrupts）。** 现代操作系统使用软件中断（self-IPI）实现软件事件发信号、进程间通信和延迟处理的调度。系统软件通过写入本地 APIC 的控制寄存器来设置和发起这些中断。AVIC 硬件通过为许多这些操作提供硬件辅助来减少 VMM 开销。

**处理器间中断（Inter-processor Interrupts）。** 现代操作系统广泛使用处理器间中断（IPI）来处理机器内处理器核之间的通信（或在虚拟化环境中，虚拟机内虚拟处理器之间的通信）。IPI 还用于为跨处理器 TLB 无效（又称 TLB shootdown）等操作提供发信号和同步。AVIC 提供硬件机制，将中断投递到目标虚拟处理器的虚拟中断控制器，无需 VMM 干预。

**设备中断（Device Interrupts）。** 从 I/O 设备到虚拟处理器的虚拟中断投递的加速不直接由 AVIC 硬件解决。此加速将由 I/O 内存管理单元（IOMMU）提供。AVIC 架构与 AMD I/O 内存管理单元（IOMMU）兼容。有关 IOMMU 架构的更多信息，请参见 AMD I/O Virtualization Technology (IOMMU) Specification（订单号 48882）。AVIC 扩展下设备中断处理的更多细节见"设备中断"（第 599 页）。

以下小节详细描述 AVIC 架构。

### 15.29.2 本地 APIC 寄存器虚拟化（Local APIC Register Virtualization）

本地 APIC 的系统编程接口由一组内存映射寄存器组成。在非虚拟化环境中，系统软件直接读写这些寄存器以配置中断控制器并发起和处理中断。在虚拟化环境中，每个客户操作系统仍然需要访问此系统编程接口，但不拥有底层中断处理硬件。为向客户操作系统提供此设施，VMM 级软件为每个客户虚拟处理器模拟本地 APIC。

AVIC 架构在客户的虚拟机实例化时，在客户物理地址（GPA）空间中为每个虚拟处理器提供本地 APIC 的映像，称为客户虚拟 APIC（guest vAPIC）。此映像由系统物理地址（SPA）空间中的一页支持，称为 vAPIC 后备页（backing page）。只要虚拟机持续存在，后备页就保持固定在系统内存中，即使与后备页关联的特定虚拟处理器未运行也是如此。客户对内存映射寄存器集的访问由 AVIC 硬件重定向到此后备页。

VMM 从后备页读取客户写入的配置、控制和命令信息，并将状态信息写入此页供客户读取。允许客户直接读取大多数寄存器，无需 VMM 干预。大多数写入被拦截，允许 VMM 处理并作用于来自客户的配置、控制和命令数据。然而，对于某些频繁使用的命令和控制操作，特定的硬件支持允许客户直接发起中断并完成结束中断处理，从而无需 VMM 干预性能关键操作的执行。

### 15.29.3 AVIC 后备页（AVIC Backing Page）

AVIC 硬件检测客户尝试访问其本地 APIC 寄存器集，并将这些访问重定向到 vAPIC 后备页。如下图所示。

**图 15-15. vAPIC 后备页访问** （vAPIC 后备页（仿真 vAPIC 寄存器）← 允许/陷阱/故障 寄存器级权限过滤器 → 客户 vAPIC 寄存器（内存映射映像，客户物理地址空间中的客户 vAPIC 页 GPA）→ GPA 到 SPA 映射（AVIC 硬件，V_APIC_BAR 和 AVIC_BACKING_PAGE 指针）→ 系统物理地址空间中的后备页 SPA / VMCB，见原手册第 587 页）

为正确地将客户对客户 vAPIC 寄存器的访问重定向到 vAPIC 后备页，硬件需要两个地址。它们是：

-   SPA 空间中的 vAPIC 后备页地址
-   GPA 空间中的客户 vAPIC 基地址（APIC BAR）

系统软件负责在嵌套页表中设置转换，授予客户对 SPA 空间中 vAPIC 后备页访问的读写权限。AVIC 硬件遍历嵌套页表以检查权限，但不使用叶页表条目中指定的 SPA 地址。相反，AVIC 硬件在 VMCB 的 AVIC_BACKING_PAGE 指针字段中找到此地址。

VMM 使用适当的默认 APIC 寄存器值初始化后备页，包括 APIC 版本号等项目。vAPIC 后备页地址和客户 vAPIC 基地址分别存储在 VMCB 字段 AVIC_BACKING_PAGE 指针和 V_APIC_BAR 中。

系统固件将客户 vAPIC 基地址（和 VMCB.V_APIC_BAR）的值初始化为 FEE0_0000h。这是客户操作系统引导时期望找到本地 APIC 寄存器集的地址。如果客户尝试通过写入 APIC 基地址寄存器（MSR 0000_001Bh）在 GPA 空间中重新定位本地 APIC 寄存器基地址，VMM 应拦截该写入以更新客户 VMCB 的 V_APIC_BAR 字段以及虚拟机嵌套页表中转换的 GPA 部分。

vAPIC 后备页必须在客户 VM 的生命周期内存在于系统物理内存中，因为即使客户未运行时某些字段也会被更新。

#### 15.29.3.1 虚拟 APIC 寄存器访问（Virtual APIC Register Accesses）

AVIC 硬件检测客户对后备页中 vAPIC 寄存器的尝试访问。这些尝试访问由寄存器级权限过滤器以三种方式之一处理：

-   **允许（Allow）**——允许对后备页的访问完成。写入更新后备页值，读取返回当前值。在某些情况下，写入导致特定的基于硬件的加速操作（总结于表 15-22 并在下文描述）。
-   **故障（Fault）**——处理器在访问之前执行 SVM 拦截。导致 #VMEXIT。
-   **陷阱（Trap）**——处理器在访问完成后立即执行 SVM 拦截。导致 #VMEXIT。

这些寄存器中每一个的行为细节总结于下表。

**表 15-22. 客户 vAPIC 寄存器访问行为**

| xAPIC 寄存器偏移 | x2APIC MSR 地址 | 寄存器名称 | xAVIC 和 x2AVIC 寄存器访问行为 |
| --- | --- | --- | --- |
| 20h | 802h | APIC ID 寄存器 | 读：允许；写：#VMEXIT（陷阱） |
| 30h | 803h | APIC 版本寄存器 | 读：允许；写：#VMEXIT（故障） |
| 80h | 808h | 任务优先级寄存器（TPR） | 读：允许；写：由 AVIC 加速 |
| 90h | 809h | 仲裁优先级寄存器（APR） | 读：#VMEXIT（故障）；写：#VMEXIT（故障） |
| A0h | 80Ah | 处理器优先级寄存器（PPR） | 读：允许；写：#VMEXIT（故障） |
| B0h | 80Bh | 中断结束寄存器（EOI） | 读：允许；写：边沿触发中断由 AVIC 加速，电平触发中断 #VMEXIT（陷阱） |
| C0h | \-  | 远程读取寄存器 | 读：允许；写：#VMEXIT（陷阱） |
| D0h | 80Dh | 逻辑目标寄存器 | 读：允许；写：#VMEXIT（陷阱） |
| E0h | \-  | 目标格式寄存器 | 读：允许；写：#VMEXIT（陷阱） |
| F0h | 80Fh | 伪中断向量寄存器 | 读：允许；写：#VMEXIT（陷阱） |
| 100h–170h | 810h-817h | 服务中寄存器（ISR） | 读：允许；写：#VMEXIT（故障） |
| 180h–1F0h | 818h-81Fh | 触发模式寄存器（TMR） | 读：允许；写：#VMEXIT（故障） |
| 200h–270h | 820h-827h | 中断请求寄存器（IRR） | 读：允许；写：#VMEXIT（故障） |
| 280h | 828h | 错误状态寄存器（ESR） | 读：允许；写：#VMEXIT（陷阱） |
| 300h | 830h | 中断命令寄存器低（ICRL） | 读：允许；写：由 AVIC 加速，高级功能 #VMEXIT（陷阱） |
| 310h | \-  | 中断命令寄存器高（ICRH） | 读：允许（xAVIC）；写：允许（xAVIC） |
| 320h | 832h | 定时器本地向量表条目 | 读：允许；写：#VMEXIT（陷阱） |
| 330h | 833h | 热本地向量表条目 | 读：允许；写：#VMEXIT（陷阱） |
| 340h | 834h | 性能计数器本地向量表条目 | 读：允许；写：#VMEXIT（陷阱） |
| 350h | 835h | 本地中断 0 向量表条目 | 读：允许；写：#VMEXIT（陷阱） |
| 360h | 836h | 本地中断 1 向量表条目 | 读：允许；写：#VMEXIT（陷阱） |
| 370h | 837h | 错误向量表条目 | 读：允许；写：#VMEXIT（陷阱） |
| 380h | 838h | 定时器初始计数寄存器 | 读：允许；写：#VMEXIT（陷阱） |
| 390h | 839h | 定时器当前计数寄存器 | 读：#VMEXIT（故障）；写：#VMEXIT（故障） |
| 3E0h | 83Eh | 定时器分频配置寄存器 | 读：允许；写：#VMEXIT（陷阱） |
| \-  | 83Fh | 自 IPI 寄存器（仅 x2APIC） | 写：允许（x2AVIC） |
| 400h | 840h | 扩展 APIC 特性寄存器 | 读：#VMEXIT（故障）；写：#VMEXIT（故障） |
| 410h | 841h | 扩展 APIC 控制寄存器 | 读：#VMEXIT（故障）；写：#VMEXIT（故障） |
| 420h | 842h | 特定中断结束寄存器（SEOI） | 读：#VMEXIT（故障）；写：#VMEXIT（故障） |
| 480h–4F0h | 848h-84Fh | 中断使能寄存器（IER） | 读：#VMEXIT（故障）；写：#VMEXIT（故障） |
| 500h-570h | 850h-857h | 扩展中断 \[7:0\] 本地向量表寄存器 | CPUID Fn8000_000A_EDX\[27\]=1：读：允许；写：#VMEXIT（陷阱）。CPUID Fn8000_000A_EDX\[27\]=0：读：#VMEXIT（故障）；写：#VMEXIT（故障） |
| 580h-FFFh | \-  | 保留  | 读：#VMEXIT（故障）；写：#VMEXIT（故障） |

对此表中未明确定义的任何其他寄存器位置的访问允许读写后备页。

所有 vAPIC 寄存器宽 32 位，位于 16 字节对齐的偏移处。尝试读或写 \[register_offset + 4:register_offset + 15\] 范围内任何字节的结果未定义。

客户对任务优先级寄存器（TPR）的写入，以及对中断结束（EOI）寄存器和中断命令寄存器低（ICRL）写入的特定使用情形，导致特定的硬件操作。AVIC 硬件允许客户写入中断命令寄存器高（ICRH），因为写入此寄存器没有直接的硬件副作用。AVIC 硬件维护并使用处理器优先级寄存器（PPR）中的值来控制向客户虚拟处理器的中断投递。以下各节讨论客户对后备页中这些寄存器访问的处理。

**任务优先级寄存器（TPR）。** 当客户操作系统写入 TPR 时，该值在后备页中更新，硬件自动将该值的高 4 位复制到 VMCB 中的 V_TPR 值。从 TPR 位置的所有读取都返回 vAPIC 后备页中的值。此外，任何使用 MOV CR8 语义的 TPR 访问都会更新后备页和 V_TPR 值。

存储在 CR8 和 V_TPR 中的优先级值与 APIC TPR 寄存器的格式不同。CR8 和 V_TPR 的低 4 位仅维护任务优先级位。任务优先级子类（Task Priority Subclass）值不存储。对内存映射 TPR 寄存器的写入更新 CR8 和 V_TPR 的位 3:0，对 CR8 的写入更新 TPR 后备页值的位 7:4，同时位 3:0 设为零。

```python
 TPR     [7:4] 任务优先级      [3:0] 任务优先级子类
 CR8 / V_TPR    [7:4] 保留      [3:0] 任务优先级
```

**图 15-16. 虚拟 APIC 任务优先级寄存器同步**

TPR 的任务优先级字段与 CR8 的任务优先级字段之间的同步是正常的本地 APIC 行为，由 AVIC 模拟。有关 APIC 的更多信息，请参见第 650 页第 16 章"高级可编程中断控制器（APIC）"。

**处理器优先级寄存器（PPR）。** 客户对处理器优先级寄存器的写入导致 #VMEXIT，而不更新后备页中的值。AVIC 硬件在后备页中维护 PPR 值。当 TPR 值或最高服务中中断改变时，AVIC 硬件更新后备页中的 PPR 值。此值用于控制向客户的虚拟中断投递。允许客户读取 PPR。

**中断结束（EOI）寄存器。** 当客户写入 EOI 寄存器地址时，AVIC 硬件清除后备页中最高优先级服务中中断（ISR）位，并重新评估中断状态以确定是否应投递另一个挂起中断。如果最高优先级服务中中断设置为电平模式（在相应的 TMR 位中），则 EOI 写入导致 #VMEXIT，以允许 VMM 模拟电平触发行为。

**中断命令寄存器低（ICRL）。** 对 ICRL 寄存器的写入具有发起生成处理器间中断（IPI）的副作用，基于写入 ICRL 和 ICRH 寄存器中字段的值。当指定的消息类型为 Fixed（又称固定投递模式）且触发模式为边沿触发时，AVIC 硬件处理 IPI 的生成。硬件还支持通过 ICRL 的目标简写（DSH）字段指定的自投递和广播投递模式。支持逻辑和物理 APIC ID 格式。所有其他 IPI 类型导致 #VMEXIT。有关 AVIC 处理 IPI 命令的更多信息，请参见"处理器间中断"（第 586 页）。

### 15.29.4 AVIC 的 VMCB 更改（VMCB Changes for AVIC）

以下段落概述了作为 AVIC 架构一部分定义的新 VMCB 字段。

#### 15.29.4.1 VMCB 虚拟中断控制字（VMCB Virtual Interrupt Control Word）

AVIC 在偏移 60h 处的 VMCB 虚拟中断控制字中添加了 AVIC Enable 位。第 604 页第 15.29.10 节描述的 x2AVIC 模式添加了 x2AVIC Mode Enable。

**AVIC Enable——虚拟中断控制，位 31。** AVIC 硬件支持可以按虚拟处理器启用。此位确定是否对特定虚拟处理器启用 AVIC。任何配置为使用 AVIC 的客户还必须启用嵌套分页。启用 AVIC 隐式禁用 VMCB 控制字中的 V_IRQ、V_INTR_PRIO、V_IGN_TPR 和 V_INTR_VECTOR 字段。启用 AVIC 还独立于 V_INTR_MASKING 使能（位 24）影响 CR8 行为：对 CR8 的写入影响 V_TPR 并更新后备页，对 CR8 的读取返回 V_TPR。

**x2AVIC Mode Enable——虚拟中断控制，位 30。** x2APIC MSR 接口虚拟化使能。当 VMRUN 时此位设置为 1，AVIC Enable 也必须设置为 1。否则 VMRUN 以 VMEXIT_INVALID 错误代码失败。

当启用 AVIC（位 31 置 1）时，x2AVIC Mode Enable（位 30）确定 AVIC 模式。如果 x2AVIC 位清零为 0，则启用 xAVIC 虚拟化模式（用于 MMIO 本地 APIC 寄存器接口）。如果 x2AVIC 位置 1，则启用 x2AVIC 虚拟化模式（用于 MSR 本地 APIC 寄存器接口）。

#### 15.29.4.2 AVIC VMCB 字段（AVIC VMCB Fields）

AVIC 利用 VMCB 中许多以前保留的位置。

**V_APIC_BAR——VMCB，偏移 098h。** 此条目用于保存客户本地 APIC 寄存器块的客户物理基地址的副本。客户可以通过写入客户版本的 APIC 基地址寄存器（MSR 0000_001Bh）更改其本地 APIC 寄存器块的 GPA。对此 MSR 的写入由 VMM 拦截，并使用该值更新 vAPIC 后备页嵌套页表条目中的 GPA 以及保存在 VMCB 此字段中的值。

**APIC_BACKING_Page 指针——VMCB，偏移 0E0h。** 这是指向此虚拟处理器 vAPIC 后备页的 52 位 HPA 指针。vAPIC 后备页在下一节中更详细地描述。

**Logical APIC Table 指针——VMCB，偏移 0F0h。** 这是指向包含此虚拟处理器的虚拟机 Logical APIC ID Table 的 52 位 HPA 指针。此表在下一节中更详细地描述。

**Physical APIC Table 指针——VMCB，偏移 0F8h。** 这是指向包含此虚拟处理器的虚拟机 Physical APIC ID Table 的 52 位 HPA 指针。此表在下一节中更详细地描述。

**AVIC_PHYSICAL_MAX_INDEX——VMCB，偏移 0F8h。** 位 11:0。此值提供此客户最后一个客户物理核 ID 的索引。

#### 15.29.4.3 物理地址指针限制（Physical Address Pointer Restrictions）

前几节中的所有物理地址都必须指向合法的、实现支持的物理地址范围。这些指针在 VMRUN 时评估，如果超出合法范围则导致 #VMEXIT。这些内存范围必须映射为写回可缓存内存类型。

所有地址都指向 4-Kbyte 对齐的数据结构。位 11:0 保留（偏移 0F8h 除外），应设为零。偏移 0F8h 的低 12 位用于 AVIC_PHYSICAL_MAX_INDEX 字段。如果 AVIC_PHYSICAL_MAX_INDEX 在 xAVIC 模式下大于 255，或在 CPUID Fn8000_000A_ECX\[x2AVIC_EXT\]（位 6）= 0 时 x2AVIC 模式下大于 511，则 VMRUN 以 #VMEXIT(VMEXIT_INVALID) 失败。

**多处理器 VM 要求（Multiprocessor VM requirements）。** 当运行具有多个虚拟 CPU 且启用 xAVIC 模式的 VM 时，如果 VMM 在最后一次运行同一 VM 不同虚拟 CPU 的核上运行虚拟 CPU（无论各自的 ASID 值如何），必须注意在 VMRUN 上使用 TLB_CONTROL 值 3h 刷新 TLB。否则可能导致过时映射将虚拟 APIC 访问错误定向到先前虚拟 CPU 的 APIC 后备页。

### 15.29.5 AVIC 内存数据结构（AVIC Memory Data Structures）

AVIC 架构定义了三个新的内存驻留数据结构。每个结构都定义为恰好适合一个 4-Kbyte 页。未来实现可能扩展大小。

#### 15.29.5.1 虚拟 APIC 后备页（Virtual APIC Backing Page）

系统中的每个虚拟处理器都分配一个虚拟 APIC 后备页（vAPIC 后备页）。客户对客户物理地址空间中本地 APIC 寄存器块的访问被重定向到系统内存中的 vAPIC 后备页。AVIC 硬件和 VMM 使用 vAPIC 后备页模拟本地 APIC。详细描述见"虚拟 APIC 寄存器访问"（第 588 页）。

#### 15.29.5.2 物理 APIC ID 表（Physical APIC ID Table）

物理 APIC ID 表由 VMM 设置和维护，硬件使用它来定位用于基于客户物理 APIC ID 投递中断的适当 vAPIC 后备页。每个虚拟机必须提供一个物理 APIC ID 表。

客户物理 APIC ID 用作此表的索引。每个条目包含指向虚拟处理器 vAPIC 后备页的指针、指示虚拟处理器当前是否调度在物理核上的位，以及如果是，该核的物理 APIC ID。

如果 CPUID Fn8000_000A_ECX\[x2AVIC_EXT\]（位 6）= 0，此表的长度固定为 4 Kbytes，允许每个虚拟机最多 512 个虚拟处理器。如果 CPUID Fn8000_000A_ECX\[x2AVIC_EXT\]（位 6）= 1，此表的长度最多为八个连续的 4-Kbyte 页，页数等于 AVIC_PHYSICAL_MAX_INDEX\[11:9\] 加 1。

物理 ID 表可以使用有效位以稀疏方式填充，以指示已分配的 ID。最后一个有效条目的索引存储在 VMCB AVIC_PHYSICAL_MAX_INDEX 字段中。

指向此表的指针维护在 VMCB 中。由于每个虚拟机只有一个 Physical APIC ID Table，此指针的值对于虚拟机内的每个虚拟处理器都相同。

表中的每个条目具有以下格式：

```python
 63 62 61                                   52 51                                            32
┌──┬──┬──────────────────────────────────────┬───────────────────────────────────────────────┐
│V │IR│              Reserved               │              Backing Page Pointer[51:32]        │
└──┴──┴──────────────────────────────────────┴───────────────────────────────────────────────┘
 31                                                                     12 11                 0
┌─────────────────────────────────────────────────────────────────────────┬───────────────────┐
│                           Backing Page Pointer[31:12]                    │ Host Physical APIC ID │
└─────────────────────────────────────────────────────────────────────────┴───────────────────┘
```

**图 15-17. 物理 APIC ID 表条目**

**表 15-23. 物理 APIC ID 表条目字段**

| 位   | 字段名 | 描述  |
| --- | --- | --- |
| 63  | V   | 有效位。置位时指示此条目包含有效的 vAPIC 后备页指针。如果清除，此表条目不包含信息。 |
| 62  | IR  | IsRunning。此位指示相应的客户虚拟处理器当前由 VMM 调度在物理核上运行。 |
| 61:52 | —   | 保留，SBZ。应始终设为零。 |
| 51:12 | Backing Page Pointer | 此虚拟处理器 vAPIC 后备页的 4-Kbyte 对齐 HPA。 |
| 11:0 | Host Physical APIC ID | VMM 分配来托管客户虚拟处理器的物理核的物理 APIC ID。除非 IsRunning 位置位，否则此字段无效。 |

注意，IR 位置位时指示 VMM 已分配物理核来托管此虚拟处理器。该位不区分物理处理器是在客户模式（积极执行客户软件）还是主机模式（已挂起客户软件的执行）运行。

在 xAVIC 模式下，物理 APIC ID 表占据单个 4-Kbyte 内存页的下半部分，格式如下：

```python
 物理 APIC ID 255:2048-2040（保留）… 
 客户物理 APIC ID 254 → 物理 APIC 条目 254（字节 2032）
 客户物理 APIC ID 253 → 物理 APIC 条目 253（字节 2024）
 …
 客户物理 APIC ID 2 → 物理 APIC 条目 2（字节 16）
 客户物理 APIC ID 1 → 物理 APIC 条目 1（字节 8）
 客户物理 APIC ID 0 → 物理 APIC 条目 0（字节 0）
 （表的上半部分：字节 2048-4095 保留）
```

**图 15-18. 内存中的物理 APIC 表**

由于目的地 FFh 用于指定广播，物理 APIC ID FFh 被保留。表的上 2048 字节保留，应设为零。

#### 15.29.5.3 逻辑 APIC ID 表（Logical APIC ID Table）

除物理 APIC ID 表外，每个客户 VM 还分配一个逻辑 APIC ID 表。此表用于查找逻辑寻址中断请求的客户物理 APIC ID。此表的每个条目提供与单个逻辑寻址 APIC 对应的客户物理 APIC ID。注意，这暗示每个 vAPIC 的逻辑 ID 必须是唯一的。此表的条目使用逻辑 ID 选择，并根据客户的逻辑 APIC 寻址模式以不同方式解释。

如果客户尝试更改其 APIC 的逻辑 ID，VMM 必须在逻辑 APIC ID 表中反映此更改。AVIC 硬件支持针对一个或多个逻辑目的地的固定中断消息类型。硬件还支持通过 ICRL 的目标简写（DSH）字段指定的自投递和广播投递模式。任何其他消息类型必须通过 VMM 的模拟支持。

指向此表的指针维护在 VMCB 中。由于每个虚拟机只有一个 Logical APIC ID Table，此指针的值对于虚拟机内的每个虚拟处理器都相同。

对于所有逻辑目标模式，表条目具有以下格式：

```python
 31 30                                      8    7                             0
┌──┬─────────────────────────────────────────┬─────────────────────────────────┐
│V │               Reserved                 │        Guest Physical APIC ID    │
└──┴─────────────────────────────────────────┴─────────────────────────────────┘
```

**图 15-19. 逻辑 APIC ID 表条目**

**表 15-24. 逻辑 APIC ID 表条目字段**

| 位   | 字段名 | 描述  |
| --- | --- | --- |
| 31  | V   | 有效位。置位时指示此表条目包含有效的物理 APIC ID。如果清除，此表条目不包含信息。 |
| 30:8 | —   | 保留，SBZ。应始终设为零。 |
| 7:0 | Guest Physical APIC ID | 逻辑寻址时选中的本地 APIC 对应的客户物理 APIC ID。 |

**平坦模式的逻辑 APIC ID 表格式（Logical APIC ID Table Format for Flat Mode）。** 在平坦模式运行时，AVIC 期望逻辑 APIC ID 表格式如下图 15-20 所示。此模式仅使用表的前 8 个条目。虽然逻辑 APIC ID 是八位值，但支持的编码必须为 2^i^ 形式，其中 i = 0 到 7。图中使用值 i，表示表的索引。给定逻辑 APIC ID l_apic_id 的表中的实际字节偏移为 4 \* log2(l_apic_id)。

在 x2AVIC 模式下，AVIC 硬件不使用逻辑 APIC ID 表。相反，目标逻辑 ID 从目标 x2APIC ID 推导如下：Logical x2APICID = (X2APICID\[19:4\] << 16) | (1 << x2APICID\[3:0\])。

```python
 逻辑 APIC ID 索引 7 → 逻辑 APIC 7 的条目（字节 28）
 逻辑 APIC ID 索引 6 → 逻辑 APIC 6 的条目（字节 24）
 …
 逻辑 APIC ID 索引 1 → 逻辑 APIC 1 的条目（字节 4）
 逻辑 APIC ID 索引 0 → 逻辑 APIC 0 的条目（字节 0）
 （其余空间保留）
```

**图 15-20. 逻辑 APIC ID 表格式，平坦模式**

**集群模式的逻辑 APIC ID 表格式（Logical APIC ID Table Format for Cluster Mode）。** 在集群模式中，逻辑 APIC ID 的位 7:4 表示集群编号，位 3:0 表示 APIC 索引（位编码）。集群编号 Fh（15）保留。由于 APIC 索引字段是四位，APIC 索引值支持四种编码。

给定集群 c 和 APIC 索引 apic_ix 的表中的实际字节偏移为 (16 \* c) + 4 \* log2(apic_ix)。

在集群模式运行时，AVIC 期望逻辑 APIC ID 表格式如下图 15-21 所示。

```python
 集群 14, 逻辑 APIC 3 的条目（字节 236）… 集群 14, 逻辑 APIC 0 的条目（字节 224）
 …
 集群 1, 逻辑 APIC 3 的条目（字节 28）… 集群 1, 逻辑 APIC 0 的条目（字节 16）
 集群 0, 逻辑 APIC 3 的条目（字节 12）
 集群 0, 逻辑 APIC 2 的条目（字节 8）
 集群 0, 逻辑 APIC 1 的条目（字节 4）
 集群 0, 逻辑 APIC 0 的条目（字节 0）
 （其余空间保留）
```

**图 15-21. 逻辑 APIC ID 表格式，集群模式**

### 15.29.6 中断投递（Interrupt Delivery）

虚拟中断有两种基本类型——处理器间中断（IPI）和 I/O 设备中断（设备中断）。IPI 在客户系统软件写入 ICRL 寄存器时发起。设备中断由 I/O 设备发起，该设备已由客户系统软件（通常是设备驱动程序）编程，向特定客户物理处理器发送发信号通知事件的消息。此消息通常包括指示事件性质的中断向量号。

以下各节讨论虚拟处理器发信号通知 IPI 时 AVIC 硬件采取的操作，以及设备发信号通知虚拟中断时 I/O 虚拟化硬件采取的操作。

#### 15.29.6.1 处理器间中断（Interprocessor Interrupts）

为处理 IPI，AVIC 硬件执行以下步骤：

1.  如果命令中编码的目标简写为 01b（即 self，自身），则更新后备页中的 IRR，向自身发信号通知 doorbell，并跳过其余步骤。
2.  如果目标简写非零，或目标字段为 FFh（即广播），则跳转到步骤 4。
3.  如果目标是逻辑寻址，则使用逻辑 APIC ID 表查找每个逻辑 ID 的客户物理 APIC ID。  
    如果条目无效（V 位被清除），则导致 #VMEXIT。  
    如果条目有效，但客户物理 APIC ID 大于 255，则导致 #VMEXIT（xAVIC）。  
    如果条目有效，但包含无效的后备页指针，则导致 #VMEXIT。
4.  使用客户物理 APIC ID 作为表的索引，在物理 APIC 表中查找 vAPIC 后备页地址。  
    对于定向中断，如果选中的表条目无效，则导致 #VMEXIT。对于广播 IPI，忽略无效条目。
5.  对于每个有效目的地：
    -   原子地在每个目的地的 vAPIC 后备页中设置适当的 IRR 位。
    -   检查每个目的地的 IsRunning 状态。
    -   如果目的地 IsRunning 位置位，使用物理 APIC ID 表中的主机物理核编号发送 doorbell 消息。
6.  如果任何目的地被识别为当前未调度在物理核上（即该虚拟处理器的 IsRunning 位未置位），则导致 #VMEXIT。

参考第 602 页第 15.29.9.1 节"AVIC IPI 投递未完成"了解与上述 #VMEXIT 异常关联的新退出代码。

#### 15.29.6.2 设备中断（Device Interrupts）

将 I/O 设备中断投递到虚拟处理器由具有虚拟中断能力的 IOMMU 处理。为投递虚拟中断，I/O 虚拟化硬件执行以下步骤：

1.  中断消息从 I/O 设备到达，标识源设备和中断向量号。
2.  I/O 虚拟化硬件使用设备 ID 确定作为设备中断目标的核的客户物理 APIC ID。
3.  I/O 虚拟化硬件使用客户物理 APIC ID 索引到物理 APIC ID 表中，找到 vAPIC 后备页的 SPA。如果 I/O 虚拟化硬件访问物理 APIC ID 表中的无效条目（V 位被清除），则 I/O 虚拟化硬件中止虚拟中断投递并记录错误。
4.  I/O 虚拟化硬件执行任何所需的向量号转换。
5.  I/O 虚拟化硬件原子地设置 vAPIC 后备页中 IRR 中对应于向量的位。
6.  如果作为中断目标的虚拟处理器当前未在其分配的物理核上运行，则虚拟中断将在虚拟处理器再次变为活动时呈现。I/O 虚拟化硬件可以向 VMM 提供有关设备中断的附加信息，以帮助虚拟处理器调度决策。  
    如果作为中断目标的虚拟处理器调度在物理处理器上（由物理 APIC ID 表条目的 IsRunning 位置位指示），则 I/O 虚拟化硬件使用表条目中的主机物理 APIC ID 向相应的处理器核发送 doorbell 信号，以发信号通知需要处理中断。

### 15.29.7 AVIC CPUID 特性标志（AVIC CPUID Feature Flags）

CPUID 特性位用于指示特定硬件实现上对 AVIC 的支持。CPUID Fn8000_000A_EDX\[AVIC\]（位 13）= 1 指示该硬件上支持 AVIC 架构。此外，CPUID Fn8000_000A_EDX\[x2AVIC\]（位 18）= 1 指示客户使用 x2APIC MSR 接口时支持 AVIC 架构。

有关使用 CPUID 指令的更多信息，请参见第 3.3 节"处理器特性识别"（第 72 页）。

### 15.29.8 新处理器机制（New Processor Mechanisms）

为支持将中断直接注入客户并加速关键 vAPIC 功能，处理器中实现了新的硬件机制。

#### 15.29.8.1 vAPIC 访问的特殊陷阱/故障处理（Special Trap/Fault Handling for vAPIC Accesses）

为虚拟化客户用于生成和处理中断的本地 APIC，客户虚拟处理器对其本地 APIC 寄存器的所有读写访问都被重定向到 vAPIC 后备页。对该客户物理地址范围的大多数读取和许多写入，在相应偏移处读取或写入 vAPIC 后备页内的内存位置内容。

为支持客户本地 APIC 的正确处理和模拟，处理器提供权限过滤硬件（参考图 15-15），检测并拦截对 vAPIC 后备页内特定偏移（表示 APIC 寄存器）的访问。此硬件要么允许访问，要么阻止访问并导致 #VMEXIT（故障行为），要么允许访问然后导致 #VMEXIT（陷阱行为）。

硬件直接处理客户对 TPR 和 EOI 寄存器写入的副作用。对 ICRL 寄存器的具有简单功能副作用的写入（例如生成定向 IPI 或自 IPI 请求）被直接处理。定义为发起更复杂行为而写入 ICRL 的值导致 #VMEXIT，以允许 VMM 模拟该功能。客户对 ICRH 寄存器的写入没有直接的硬件副作用，被允许。

在 vAPIC 寄存器地址范围内的其他大多数写访问尝试导致具有陷阱或故障行为的 #VMEXIT，允许 VMM 模拟该寄存器的功能。更多细节见表 15-22。

对 vAPIC 后备页内、但超出已定义 vAPIC 寄存器偏移范围的位置的读写允许完成。

#### 15.29.8.2 Doorbell 机制（Doorbell Mechanism）

每个核提供 doorbell 机制，其他核（用于 IPI）和 IOMMU（用于设备中断）使用它向目标物理核的 VMM 发信号通知需要处理虚拟中断。确切机制是实现特定的，但必须保护免受其他核上运行的非特权软件以及外部设备直接访问。

在客户模式收到 doorbell 时，接收核上的硬件评估当前运行虚拟处理器的 vAPIC 后备页中的 vAPIC 状态，并适当地将中断注入客户。

**Doorbell 寄存器（Doorbell Register）。** doorbell 机制的系统编程接口通过 MSR 提供。通过将对应于该核的物理 APIC ID 写入 Doorbell 寄存器（MSR C001_011Bh）来发起向另一个核发送 doorbell 信号。此寄存器的格式如下图 15-22 所示。

```python
 63                                                                    8   7                    0
┌───────────────────────────────────────────────────────────────────────┬───────────────────────┐
│                            Reserved, MBZ                             │    Physical APIC ID   │
└───────────────────────────────────────────────────────────────────────┴───────────────────────┘
```

**图 15-22. Doorbell 寄存器，MSR C001_011Bh**

写入此寄存器导致向指定物理核发送 doorbell 信号。写入 Doorbell 寄存器时放宽了 WRMSR 的串行化语义。任何尝试读取此寄存器都会导致 #GP。

**Doorbell 信号的处理（Processing of Doorbell Signals）。** 投递给运行中客户的 doorbell 信号由硬件识别，无论它是否可以立即作为虚拟中断注入客户。在下一次 VMRUN 时，虚拟中断投递机制评估客户 vAPIC 后备页的 IRR 寄存器状态，以找到最高优先级挂起中断，并在中断屏蔽和优先级允许时注入它。

#### 15.29.8.3 额外的 VMRUN 处理（Additional VMRUN Handling）

除正常 VMRUN 操作外，核在进入客户时重新评估 vAPIC 后备页中的 APIC 状态，并根据需要处理挂起中断。具体来说：

-   在 VMRUN 时评估中断状态，如果中断屏蔽和优先级允许，则投递 IRR 中指示的最高优先级挂起中断
-   在 VMRUN 处理期间收到的任何 doorbell 信号在进入客户后立即被识别
-   当为虚拟处理器启用 AVIC 模式时，忽略 VMCB 中的 V_IRQ、V_INTR_PRIO、V_INTR_VECTOR 和 V_IGN_TPR 字段。

### 15.29.9 AVIC 退出代码（AVIC Exit Codes）

AVIC 架构定义了两个新的 AVIC 相关 #VMEXIT 事件。这些情形在以下各节中描述。分配的 EXITCODE 值在第 784 页表 C-1 中给出。

#### 15.29.9.1 AVIC IPI 投递未完成（AVIC IPI Delivery Not Completed）

IPI 无法投递到所有目标客户虚拟处理器，因为至少一个客户虚拟处理器当时未分配到物理核。这导致退出代码为 AVIC_INCOMPLETE_IPI 的 #VMEXIT。与此 #VMEXIT 事件关联的附加数据在 EXITINFO1 和 EXITINFO2 字段中返回。

**EXITINFO1。** 此字段包含写入 vAPIC ICRH 和 ICRL 寄存器的值。

```python
 63                                             32 31                                      0
┌───────────────────────────────────────────────┬─────────────────────────────────────────┐
│                     ICRH                      │                   ICRL                   │
└───────────────────────────────────────────────┴─────────────────────────────────────────┘
```

**图 15-23. AVIC_INCOMPLETE_IPI 的 EXITINFO1**

**表 15-25. AVIC_INCOMPLETE_IPI 的 EXITINFO1 字段**

| 位   | 字段名 | 描述  |
| --- | --- | --- |
| 63:32 | ICRH | 写入 vAPIC ICRH 寄存器的值。 |
| 31:0 | ICRL | 写入 vAPIC ICRL 寄存器的值。 |

**EXITINFO2。** 此字段包含描述 IPI 投递失败具体原因的信息。

```python
 63                                             32 31                        12 11           0
┌───────────────────────────────────────────────┬───────────────────────────┬───────────────┐
│                      ID                       │         Reserved          │     Index     │
└───────────────────────────────────────────────┴───────────────────────────┴───────────────┘
```

**图 15-24. AVIC_INCOMPLETE_IPI 的 EXITINFO2**

**表 15-26. AVIC_INCOMPLETE_IPI 的 EXITINFO2 字段**

| 位   | 字段名 | 描述  |
| --- | --- | --- |
| 63:32 | ID  | 投递失败的具体原因。定义值见表 15-27。 |
| 31:12 | —   | 保留  |
| 11:0 | Index | 对于 ID = 1 – 3，此字段提供逻辑或物理表条目的索引。所有其他 ID 值保留。 |

ID 字段标识 IPI 投递失败的原因：

**表 15-27. ID 字段——IPI 投递失败原因**

| ID  | 原因  | 描述  | 索引  |
| --- | --- | --- | --- |
| 0   | 无效中断类型 | 指定 IPI 的触发模式设置为电平，或目的地类型不受支持。 | 保留。 |
| 1   | IPI 目标未运行 | 单播/广播/多播 IPI 的目标的 IsRunning 位未在物理 APIC ID 表中设置。 | 未调度在物理核上的目标虚拟处理器的物理或逻辑 APIC ID 表条目的索引。 |
| 2   | 无效 IPI 目标 | 目标 ID 无效。目标不在物理或逻辑 ID 表的覆盖范围内。 | 无效目标的物理或逻辑表条目的索引。 |
| 3   | 无效后备页指针 | 物理 APIC ID 表的 vAPIC Backing Page Pointer 字段包含无效物理地址。 | 对于简写或广播投递模式，包含无效地址的物理 APIC ID 表的索引。对于定向 IPI，取决于目标模式为逻辑或物理 APIC ID 表的索引。 |
| 4   | 无效 IPI 向量 | 指定 IPI 的向量设置为非法值（VEC < 16）。 | 保留  |
| 5   | 未加速 IPI | 目标简写未设置为 Self（安全 AVIC）。 | 保留  |
| \> 5 | 保留  | —   | 保留  |

#### 15.29.9.2 AVIC 访问未加速的 vAPIC 寄存器（AVIC Access to Un-accelerated vAPIC register）

客户对 AVIC 未加速的 APIC 寄存器的访问导致退出代码为 AVIC_NOACCEL 的 #VMEXIT。当最高优先级服务中中断设置为电平触发模式时尝试 EOI，也会生成此故障。与此 #VMEXIT 事件关联的附加数据在 EXITINFO1 和 EXITINFO2 字段中返回。

**EXITINFO1。** 此字段包含未加速虚拟 APIC 寄存器的偏移以及指示尝试的是读还是写操作的位。

```python
 63                                         33 32 31                        12 11          4    3   0
┌────────────────────────────────────────────┬──┬───────────────────────────┬────────────────┬──────┐
│                 Reserved                   │R/W│         Reserved         │ APIC Offset[11:4]│Reserved │
└────────────────────────────────────────────┴──┴───────────────────────────┴────────────────┴──────┘
```

**图 15-25. AVIC_NOACCEL 的 EXITINFO1**

**表 15-28. AVIC_NOACCEL 的 EXITINFO1 字段**

| 位   | 字段名 | 描述  |
| --- | --- | --- |
| 63:33 | —   | 保留。 |
| 32  | R/W | 如果置位，尝试的是写入。如果清除，尝试的是读取。 |
| 31:12 | —   | 保留。 |
| 11:4 | APIC_Offset\[11:4\] | 尝试读或写的虚拟 vAPIC 后备页内的偏移。APIC_Offset\[3:0\] = 0，因为所有寄存器都按 16 字节边界对齐。 |
| 3:0 | —   | 保留。 |

**EXITINFO2。** 此字段包含未加速操作的额外信息。如果 EXITINFO1 字段指示对 vAPIC EOI 寄存器（偏移 = B0h）的写入，则此值的位 7:0 包含虚拟 APIC ISR 中找到的最高服务中向量的编号。

```python
 63                                                                        8   7                0
┌───────────────────────────────────────────────────────────────────────────┬───────────────────┐
│                                Reserved                                   │      Vector       │
└───────────────────────────────────────────────────────────────────────────┴───────────────────┘
```

**图 15-26. AVIC_NOACCEL 的 EXITINFO2**

**表 15-29. AVIC_NOACCEL 的 EXITINFO2 字段**

| 位   | 字段名 | 描述  |
| --- | --- | --- |
| 63:8 | —   | 保留  |
| 7:0 | Vector | 尝试 EOI 的向量；否则未定义。 |

### 15.29.10 x2AVIC

x2AVIC 虚拟化特性在客户操作系统使用 x2APIC MSR 接口时，为性能敏感的 APIC 访问提供硬件加速。x2AVIC 支持由 Fn8000000A_EDX\[X2AVIC\]（位 18）= 1 报告。

x2AVIC 模式通过将 VMCB 偏移 60h 中的 AVIC Enable（位 31）和 x2AVIC Mode Enable（位 30）设置为 1 来启用。启用 x2AVIC 模式时，x2APIC MSR 访问以与 xAVIC 模式中 MMIO 访问类似的方式被虚拟化。x2APIC MSR 拦截检查和访问检查的优先级高于 AVIC 访问权限检查。启用 x2AVIC 时的 x2APIC 寄存器访问行为见第 15.29.3.1 节。

在 x2APIC 模式中，中断命令寄存器低（ICRL）和中断命令寄存器高（ICRH）寄存器合并为 64 位寄存器，通过 ICR MSR（830h）访问。在 x2AVIC 模式中，ICR MSR 位 31:0 和 63:32 映射到后备页中的 ICRL（偏移 300h）和 ICRH（偏移 310h）。SELF_IPI MSR（83Fh）加速与 ICR MSR 加速的处理方式相同。

V_APIC_BAR 和逻辑目标表在 x2AVIC 模式中不使用。

新的 x2AVIC 模式错误条件记录在第 15.29.4.1 节、第 15.29.4.3 节和表 15-28 中。

## 15.30 SVM 相关 MSR（SVM Related MSRs）

SVM 使用以下 MSR 用于各种控制目的。无论 EFER.SVME 中是否启用 SVM，这些 MSR 都可用。有关实现特定特性的详细信息，请参见适用于您产品的 BIOS and Kernel Developer's Guide（BKDG）或 Processor Programming Reference Manual（PPR）。

### 15.30.1 VM_CR MSR（C001_0114h）

VM_CR MSR 控制 SVM 的某些全局方面。VM_CR MSR 布局如图 15-27 所示。

```python
 63                                                        5    4       3       2       1     0
┌──────────────────────────────────────────────────────────┬───┬───────┬───────┬───────┬─────┬───┐
│                        Reserved, MBZ                     │SVMDIS│ LOCK │DIS_A20M│ R_INIT │ DPD │
└──────────────────────────────────────────────────────────┴───┴───────┴───────┴───────┴─────┴───┘
```

**图 15-27. VM_CR MSR（C001_0114h）**

各个字段如下：

-   **DPD——位 0。** 如果置位，禁用外部硬件调试端口和某些内部调试特性。
-   **R_INIT——位 1。** 如果置位，未被拦截的 INIT 信号转换为 #SX 异常。
-   **DIS_A20M——位 2。** 如果置位，禁用 A20 屏蔽。
-   **LOCK——位 3。** 当此位置位时，对 LOCK 和 SVMDIS 的写入被静默忽略。当此位清除时，可以写入 VM_CR 位 3 和 4。一旦设置，LOCK 只能使用 SVM_KEY MSR 清除（见第 15.31 节）。此位不受 INIT 或 SKINIT 影响。
-   **SVMDIS——位 4。** 当此位置位时，对 EFER 的写入将 SVME 位视为 MBZ。当此位清除时，可以正常写入 EFER.SVME。此位不阻止 CPUID 报告 SVM 可用。当 EFER.SVME 为 1 时设置 SVMDIS 会生成 #GP 故障，无论 VM_CR.LOCK 的当前状态如何。此位不受 SKINIT 影响。当 LOCK 清零为 0 时，它被 INIT 清除；否则不受影响。

### 15.30.2 IGNNE MSR（C001_0115h）

读写 IGNNE MSR 用于直接设置处理器内部 IGNNE 信号的状态。仅当在 HW_CR MSR 中启用了 IGNNE 模拟时（因此外部信号被忽略），这才有用。位 0 指定 IGNNE 的当前值；所有其他位 MBZ。

### 15.30.3 SMM_CTL MSR（C001_0116h）

只写 SMM_CTL MSR 提供对 SMM 信号的软件控制。当 CPUID Fn8000_0021\[NoSmmCtlMSR\] 置位时不支持 SMM_CTL MSR。

```python
 63                                                5    4       3      2        1      0
┌──────────────────────────────────────────────────┬───┬───────┬──────┬────────┬───────┬────────┐
│                   Reserved, MBZ                  │RSM_CYCLE│ EXIT │SMI_CYCLE│ ENTER │ DISMISS│
└──────────────────────────────────────────────────┴───┴───────┴──────┴────────┴───────┴────────┘
```

**图 15-28. SMM_CTL MSR（C001_0116h）**

写入各个位导致以下操作：

-   **DISMISS——位 0。** 清除处理器内部"SMI 挂起"标志。
-   **ENTER——位 1。** 进入 SMM：映射 SMRAM 内存区域，记录 NMI 当前是否被屏蔽，并阻止进一步的 NMI 和 SMI 中断。
-   **SMI_CYCLE——位 2。** 发送 SMI 特殊周期。
-   **EXIT——位 3。** 退出 SMM：取消映射 SMRAM 内存区域，恢复 NMI 先前的屏蔽状态并无条件重新启用 SMI。
-   **RSM_CYCLE——位 4。** 发送 RSM 特殊周期。

如果平台固件通过设置 HWCR\[SMMLOCK\] 锁定了 SMM 控制寄存器，则对 SMM_CTL MSR 的写入导致 #GP。

概念上，这些位按 ENTER、SMI_CYCLE、DISMISS、RSM_CYCLE、EXIT 的顺序处理，但单次写入中只能一起设置以下位组合（对于多于一位的所有其他组合，行为未定义）：

-   ENTER + SMI_CYCLE
-   DISMISS + ENTER
-   DISMISS + ENTER + SMI_CYCLE
-   EXIT + RSM_CYCLE

VMM 必须确保 ENTER 和 EXIT 操作正确匹配且不嵌套，否则处理器行为未定义。处理器已在 SMM 中时的 ENTER，以及处理器不在 SMM 中时的 EXIT，也是未定义的。

### 15.30.4 VM_HSAVE_PA MSR（C001_0117h）

64 位读写 VM_HSAVE_PA MSR 保存 4KB 内存块的物理地址，VMRUN 将主机状态保存在其中，#VMEXIT 从其中重新加载主机状态。VMM 软件应在发出第一条 VMRUN 指令之前设置此寄存器。

如果满足以下任一条件，写入此 MSR 会导致 #GP：

-   写入的地址的任何低 12 位非零，或
-   写入的地址大于或等于此实现的最大受支持物理地址。

### 15.30.5 TSC Ratio MSR（C000_0104h）

写入 TSC Ratio MSR 允许 hypervisor 控制客户对时间戳计数器的视图。TSC Ratio MSR 的内容设置 TSCRatio 的值。此常量缩放客户通过 RDTSC 或 RDTSCP 指令读取 TSC 时返回的时间戳值，或虚拟化下运行的客户通过 RDMSR 指令读取 TSC、MPERF 或 MPerfReadOnly MSR 时返回的值。

此设施允许 hypervisor 在将客户进程移动到具有不同 P0 频率的核之间时，为该客户进程提供一致的 TSC、MPERF 和 MPerfReadOnly 速率。TSCRatio 不影响主机模式或禁用虚拟化时从 TSC、MPERF 和 MPerfReadOnly MSR 读取的值。系统管理模式（SMM）代码看到未缩放的 TSC、MPERF 和 MPerfReadOnly 值，除非 SMM 代码在客户容器内执行。TSCRatio 值不影响底层 TSC、MPERF 和 MPerfReadOnly 计数器的速率，也不影响主机或客户写入 TSC、MPERF 和 MPerfReadOnly MSR 计数器时写入的值。

TSC Ratio MSR 将 TSCRatio 值指定为 8.32 格式的定点二进制数，由 8 位整数和 32 位小数组成。此数字是相对于核的 P0 频率呈现给客户的期望 P0 频率之比（见第 687 页第 17.1 节"P-State 控制"）。TSCRatio 的复位值为 1.0，它将客户 P0 频率设置为匹配核 P0 频率。

注意：

```python
TSCFreq = Core P0 frequency * TSCRatio，因此 TSCRatio = (期望 TSCFreq) / Core P0 frequency。
```

客户读取的 TSC 值使用 TSC Ratio MSR 以及 VMCB 中的 TSC_OFFSET 字段计算，因此实际返回的值为：

```python
TSC 值（客户中）= (P0 frequency * TSCRatio * t) + VMCB.TSC_OFFSET + (Last Value Written to TSC) * TSCRatio
其中 t 是自 TSC 上次通过 TSC MSR 写入以来（或自复位以来，如果未写入）的时间
```

TSC Ratio MSR 的布局如下图所示。

```python
 63                       40   39          32    31                                    0
┌───────────────────────────┬──────────────────┬──────────────────────────────────────────┐
│        Reserved           │       INT        │                   FRAC                    │
└───────────────────────────┴──────────────────┴──────────────────────────────────────────┘
```

| 位   | 助记符 | 描述  | 访问类型 |
| --- | --- | --- | --- |
| 63:40 | Reserved | —   | MBZ |
| 39:32 | INT | 整数部分 | R/W |
| 31:0 | FRAC | 小数部分 | R/W |

**图 15-29. TSC Ratio MSR（C000_0104h）**

**INT。整数部分。** 位 39:32。TSCRatio 的整数部分。

**FRAC。小数部分。** 位 39:32。TSCRatio 的小数部分。

TSCRatio = INT + FRAC × 2⁻³²

CPUID Fn8000_000A_EDX\[TscRateMsr\] = 1 指示支持 TSC Ratio MSR。有关使用 CPUID 指令的更多信息，请参见第 3.3 节"处理器特性识别"（第 72 页）。

## 15.31 SVM-Lock

SVM-Lock 特性允许软件阻止 EFER.SVME 被设置，可以无条件阻止，或使用 64 位密钥重新启用 SVM 功能。

SVM-Lock 的支持由 CPUID Fn8000_000A_EDX\[SVML\] = 1 指示。在支持 SVM-Lock 特性的处理器上，即使 EFER.SVME=0 也可以执行 SKINIT 和 STGI。见第 15.30.1 节中 LOCK 和 SVMDIS 位的描述。当 SVM-Lock 特性不可用时，hypervisor 可以使用只读的 VM_CR.SVMDIS 位检测 SVM（见第 15.4 节）。

### 15.31.1 SVM_KEY MSR（C001_0118h）

只写 SVM_KEY MSR 用于创建密码保护机制来清除 VM_CR.LOCK。

当 VM_CR.LOCK 为零时，对 SVM_KEY MSR 的写入设置 64 位 SVM Key 值。

当 VM_CR.LOCK 为一时，对 SVM_KEY MSR 的写入将写入值与 SVM Key 值比较；如果值匹配且非零，则清除 VM_CR.LOCK 位。如果值不匹配或 SVM Key 值为零，则忽略对 SVM_KEY 的写入，且 VM_CR.LOCK 不被修改。软件应在写入 SVM_KEY 后读取 VM_CR.LOCK 以确定解锁是否成功。

如果 VM_CR.LOCK 为一时 SVM Key 为零，则 VM_CR.LOCK 只能通过处理器复位清除。

为保护 SVM 密钥的安全性，读取 SVM_KEY MSR 总是返回零。

## 15.32 SMM-Lock

SMM-Lock 特性允许平台固件阻止系统管理中断（SMI）在 SVM 中被拦截。SmmLock 位位于 HWCR MSR 寄存器中。

### 15.32.1 SmmLock 位——HWCR\[0\]

SmmLock 位（位 0）位于 HWCR MSR（C001_0015h）中。当 SmmLock 清除时，可以将其设置为 1。一旦设置，该位不能被软件清除，对它的写入被忽略。SmmLock 只能使用 SMM_KEY MSR（见第 15.32.2 节）或通过处理器复位清除。此位不受 INIT 或 SKINIT 影响。当 SmmLock 置位时，其他 SMM 配置寄存器不能被写入。有关 HWCR 寄存器的完整信息，请参见适用于您产品的 BIOS and Kernel Developer's Guide（BKDG）或 Processor Programming Reference Manual（PPR）。

### 15.32.2 SMM_KEY MSR（C001_0119h）

只写 SMM_KEY MSR 用于创建密码保护机制来清除 SmmLock。

当 SmmLock 为零时，对 SMM_KEY MSR 的写入设置 64 位 SMM Key 值。

当 SmmLock 为一时，对 SMM_KEY MSR 的写入将写入值与 SMM Key 值比较；如果值匹配且非零，则清除 SmmLock 位。如果值不匹配或 SMM Key 值为零，则忽略对 SMM_KEY 的写入，且 SmmLock 不被修改。软件应在写入 SMM_KEY 后读取 SmmLock 以确定解锁是否成功。

如果 SmmLock 为一时 SMM_KEY MSR 等于零，则 SmmLock 只能通过处理器复位清除。

为保护 SMM 密钥的安全性，读取 SMM_KEY MSR 总是返回零。

## 15.33 嵌套虚拟化（Nested Virtualization）

为改善嵌套虚拟化（即将 hypervisor 作为客户在更高级 hypervisor 下运行的行为）的性能，通过此处描述的特性提供硬件支持。这些特性减轻了顶层 hypervisor 执行嵌套虚拟化时可能发生的某些常见、高开销操作的负担。

### 15.33.1 VMSAVE 和 VMLOAD 虚拟化（VMSAVE and VMLOAD Virtualization）

VMSAVE 和 VMLOAD 虚拟化特性允许这些指令在客户模式下执行，此时客户在 RAX 中指定 VMCB 地址为客户物理地址。VMCB 地址被转换为主机物理地址，用于保存或加载寄存器状态。VMSAVE 和 VMLOAD 虚拟化支持由 CPUID Fn8000_000A_EDX\[15\]=1 指示。

VMSAVE 和 VMLOAD 虚拟化通过设置 VMCB 偏移 0B8h 的位 1 为 1 来启用。当启用 VMSAVE 和 VMLOAD 虚拟化且未设置相应的指令拦截位时，客户执行 VMSAVE 或 VMLOAD 时执行以下检查：

-   必须启用嵌套分页
-   hypervisor 必须处于 64 位模式
-   必须禁用安全加密虚拟化

如果上述任何检查失败，则生成 VMEXIT_VMSAVE 或 VMEXIT_VMLOAD。如果设置了 VMSAVE 或 VMLOAD 拦截位，则无论是否启用 VMSAVE 和 VMLOAD 虚拟化，相应指令都会被拦截。

在虚拟化 VMSAVE 和 VMLOAD 执行期间，VMCB 地址被转换为主机物理地址。如果转换期间发生页故障，则生成 #VMEXIT(NPF)。

### 15.33.2 虚拟 GIF（Virtual GIF）

Virtual GIF 特性允许 STGI 和 CLGI 指令在客户模式下执行并控制虚拟中断。Virtual GIF 支持由 CPUID Fn8000_000A_EDX\[16\]=1 指示。

Virtual GIF 通过设置 VMCB 偏移 60h 的位 25（VGIF_EN）启用。Virtual GIF（VGIF）在 VMRUN 时从 VMCB 偏移 60h 的位 9 加载，并在 #VMEXIT 时保存。当 VGIF 为 0 时虚拟中断被屏蔽，VGIF 为 1 时允许取得。当启用 Virtual GIF 且客户执行的 STGI 和 CLGI 指令未被拦截时，VGIF 分别被设置或清除。

如果设置了 STGI 或 CLGI 拦截位，则无论是否启用 Virtual GIF，相应指令都会被拦截。

## 15.34 安全加密虚拟化（Secure Encrypted Virtualization）

当 CPU 利用 AMD-V 虚拟化特性在客户模式下运行时，安全加密虚拟化（SEV）可用。SEV 支持运行加密虚拟机（VM），其中虚拟机的代码和数据受到保护，解密版本仅在 VM 本身内可用。每个虚拟机可以关联唯一的加密密钥，因此如果不同的实体使用不同的密钥访问数据，SEV 加密 VM 的数据将被错误密钥解密，导致数据不可理解。

重要的是要注意，SEV 模式因此代表了与标准 x86 虚拟化安全模型的背离，因为 hypervisor 不再能够检查或更改所有客户代码或数据。由客户管理的客户页表可以将数据内存页标记为私有或共享，从而允许选定页在客户外部共享。私有内存使用客户特定密钥加密，而共享内存对 hypervisor 可访问。

### 15.34.1 确定对 SEV 的支持（Determining Support for SEV）

内存加密特性的支持在 CPUID 8000_001F\[EAX\] 中报告，如第 239 页第 7.10.1 节"确定对安全内存加密的支持"所述。位 1 指示支持安全加密虚拟化。

当存在内存加密特性时，CPUID 8000_001F\[EBX\] 和 8000_001F\[ECX\] 提供有关内存加密使用的附加信息，例如同时支持的密钥数量以及用于将页标记为加密的页表位。此外，在某些实现中，启用内存加密特性时处理器的物理地址大小可能减小，例如从 48 位减到 43 位。在此示例中，物理地址位 47:43 将被视为保留，除非另有说明。当实现支持内存加密时，CPUID 8000_001F\[EBX\] 报告存在的任何物理地址大小缩减。此模式下保留的位与其他页表保留位处理方式相同，如果在用于地址转换时发现非零，将生成页故障。

内存加密特性的完整 CPUID 详情可以在第 3 卷第 E.4.17 节中找到。

### 15.34.2 密钥管理（Key Management）

在此处定义的内存加密扩展下，每个启用 SEV 的客户虚拟机关联一个内存加密密钥，SME 模式（如果使用，见第 239 页第 7.10 节）关联一个单独的密钥。SEV 特性的密钥管理不由 CPU 处理，而是由称为 AMD 安全处理器（AMD-SP）的独立处理器处理，该处理器存在于 AMD SOC 上。AMD-SP 操作的详细讨论超出了本手册的范围。

CPU 软件不知道这些密钥的值，但 hypervisor 应通过 AMD-SP 驱动程序协调虚拟机密钥的加载。此协调还将确定 hypervisor 应为特定客户使用哪个 ASID。在 SEV 下，ASID 用作密钥索引，标识用于加密/解密与该启用 SEV 客户关联的内存流量的加密密钥。加密密钥本身对 CPU 软件永不可见，并且永远不会以明文存储在片外。

### 15.34.3 启用 SEV（Enabling SEV）

在启动加密 VM 之前，软件必须按第 239 页第 7.10.2 节"启用内存加密扩展"所述将 SYSCFG MSR 中的 MemEncryptionModEn 设置为 1。如果 hypervisor 在 VMCB 偏移 090h 中设置 SEV enable（位 1），则可以在 VMRUN 指令期间在特定虚拟机上启用 SEV。

当 VMCB 中启用 SEV 时，VMRUN 期间执行以下额外一致性检查：

-   必须启用嵌套分页
-   HWCR MSR 中的 SmmLock 位必须置位
-   ASID 不得大于 CPUID Fn8000_001F_ECX\[NumEncryptedGuests\] 定义的最大值

如果上述任何一致性检查失败，VMRUN 指令将以 VMEXIT_INVALID 错误代码终止。如果 MemEncryptionModEn 为 0，则无法启用 SEV，并忽略 SEV 的 VMCB 控制位。

注意，在 CPUID Fn8000_001F_EAX\[64BitHost\] 设置为 1 的系统上，hypervisor 必须处于 64 位模式才能执行到启用 SEV 客户的 VMRUN。否则，VMRUN 以 VMEXIT_INVALID 错误代码失败。

### 15.34.4 支持的操作模式（Supported Operating Modes）

安全加密虚拟化可以在任何操作模式下运行的客户上启用。然而，客户仅在长模式或传统 PAE 模式下运行时才能控制内存加密。在所有其他模式下，所有客户内存访问都被无条件视为私有，并使用客户特定密钥加密。

### 15.34.5 SEV 加密行为（SEV Encryption Behavior）

当启用 SEV 执行客户时，客户页表用于确定内存页的 C 位，从而确定该内存页的加密状态。这允许客户确定哪些页是私有或共享的，但此控制仅对数据页可用。代表指令获取和客户页表遍历的内存访问总是被视为私有，无论 C 位的软件值如何。此行为确保非客户实体（如 hypervisor）不能将自己的代码或数据注入启用 SEV 的客户。如果客户确实希望使指令页或页表中的数据可供客户外部的代码访问，则必须将此数据显式复制到共享数据页。

注意，虽然客户可以选择在指令页和页表地址上显式设置 C 位，但在这种情况下此位的值无关紧要，因为硬件总是将这些作为私有访问执行。

### 15.34.6 页表支持（Page Table Support）

启用 SEV 的客户使用 CPUID 8000_001F\[EBX\] 定义的 C 位控制其自身客户页表中的加密。此位置与非虚拟化模式下 SME（第 239 页第 7.10 节"安全内存加密"）定义的 C 位位置相同。如果 C 位是地址位，则当它通过嵌套页表转换时，此位从客户物理地址中屏蔽。因此，hypervisor 不需要知道客户选择标记为私有的页。

例如，如果 C 位是地址位 47，当客户访问虚拟地址 0x54321 时，它可能被转换为客户物理地址 0x8000_00AB_C321，指示该页应使用私有客户密钥加密。当此客户物理地址通过嵌套页表转换时，主机虚拟地址 0xAB_C321 用于转换。来自客户物理地址的 C 位值被保存，并在嵌套表转换后的最终系统物理地址上使用，如图 15-30 所示。

注意，由于客户物理地址总是通过嵌套页表转换，客户物理地址空间的大小不受 CPUID 8000_001F\[EBX\] 中指示的任何物理地址空间缩减的影响。然而，如果 C 位是物理地址位，则客户物理地址空间有效地减少 1 位。

**图 15-30. 客户数据请求** （客户页表地址 → 客户物理地址（带 C 位）→ 嵌套页表地址 → 系统物理地址（带 C 位）的流程示意图，见原手册第 612 页）

### 15.34.7 限制（Restrictions）

与 SME 一样，某些硬件实现可能不强制同一物理页在不同加密启用或密钥下的映射之间的一致性。在这样的系统中，当要更改特定内存页的加密启用或密钥时，软件必须首先确保该页从所有 CPU 缓存中刷新。然而，某些常规缓存刷新技术可能不起作用；更多细节见第 15.34.9 节。

注意，如果硬件实现按 CPUID Fn8000_001F_EAX\[10\] 指示强制跨加密域的一致性，则不需要此刷新。

### 15.34.8 SEV 与 SME 的交互（SEV Interaction with SME）

SEV 可以与 SME 模式结合使用。在此场景中，客户页表控制客户内存的加密，主机（嵌套）页表控制共享内存的加密。此行为总结于表 15-30。当 CPU 处于客户模式且客户在 VMCB 中启用了 SEV 时，SEV 被视为活动。

**表 15-30. 加密控制**

| 访问类型 | MemEncryptionModEn | 客户模式 | SEV 模式活动 | 加密  | 加密密钥 | 备注  |
| --- | --- | --- | --- | --- | --- | --- |
| 所有  | 0   | X   | X   | 否   | 不适用 | 传统模式（禁用内存加密） |
| 所有  | 1   | 0   | X   | 可选  | 主机密钥 | 由页表（CR3）确定 |
| 所有  | 1   | 1   | 0   | 可选  | 主机密钥 | 由嵌套页表（hCR3）确定 |
| 指令获取 | 1   | 1   | 1   | 是   | 客户密钥 | 安全加密虚拟化模式 |
| 客户页表访问 | 1   | 1   | 1   | 是   | 客户密钥 |     |
| 嵌套页表访问 | 1   | 1   | 1   | 可选  | 主机密钥 | 由嵌套页表（hCR3）确定 |
| 数据访问 | 1   | 1   | 1   | 可选¹ | 见表 15-31：SEV/SME 交互 | 由客户页表（gCR3）和嵌套页表（hCR3）确定 |

注意：

1.  加密仅在长模式和传统 PAE 模式下由客户控制。在所有其他模式下，这些访问总是被视为私有，并使用客户密钥加密。

注意，在嵌套页表遍历期间，客户页表和嵌套页表都可能被加密。在此场景中，客户页表使用客户私有加密密钥解密，嵌套页表使用主机（SME）加密密钥解密。

客户标记为共享（C=0）的数据访问，如果页在嵌套表中标记为加密，仍可以可选地使用主机（SME）密钥加密。如果页在客户和嵌套表中都标记为加密，则客户表优先，页将使用客户密钥加密。此行为总结于表 15-31。

**表 15-31. SEV/SME 交互**

|     | 嵌套页表 C=0 | 嵌套页表 C=1 |
| --- | --- | --- |
| 客户页表 C=0 | 不加密 | 使用主机密钥加密 |
| 客户页表 C=1 | 使用客户密钥加密 | 使用客户密钥加密 |

### 15.34.9 页刷新 MSR（Page Flush MSR）

如果不支持跨加密域的一致性（见"限制"，第 613 页），且 hypervisor 希望读取加密页，它必须首先将客户对该页的视图从所有 CPU 缓存中刷新，以确保能够查看该数据的最新副本。这可以通过在客户运行过的所有核上发出 WBINVD 指令来实现，或使用 VMPAGE_FLUSH MSR（C001_011E）。VMPAGE_FLUSH MSR 的支持在 CPUID 8000_001F\[EAX\] 位 2 中指示。

VMPAGE_FLUSH MSR 是只写寄存器，可用于代表客户刷新 4KB 数据。hypervisor 将页的主机线性地址和客户 ASID 写入 MSR，然后硬件将执行页的写回无效，导致系统任何 CPU 缓存中存在的任何脏数据被加密并写入 DRAM。注意，VMPAGE_FLUSH MSR 使用标准主机页表执行页转换。Page Flush MSR 操作将命中并逐出客户缓存的该内存实例，而使用相同转换的 CLFLUSH 指令则不会。

| 位   | 描述  |
| --- | --- |
| 63:12 | VirtualAddr：只写。要刷新的页的主机虚拟地址 |
| 11:0 | ASID：只写。用于刷新的客户 ASID |

VMPAGE_FLUSH MSR 仅刷新客户标记为私有的内存页。如果 hypervisor 不知道内存页是否标记为私有但希望将页从缓存逐出，它应在使用 VMPAGE_FLUSH MSR 之外执行标准 CLFLUSH。

尝试刷新未映射到物理地址的主机虚拟地址，或使用 ASID=0，将导致 #GP(0) 故障。如果启用了 SMAP，输入地址需要在页表中映射为管理程序地址。

如果支持跨加密域的一致性，则无论客户是否将客户页标记为私有，都可以使用 CLFLUSH 指令将客户页从缓存逐出。

### 15.34.10 SEV_STATUS MSR

客户可以通过读取 SEV_STATUS MSR（C001_0131）确定当前活动的 SEV 特性。此 MSR 指示该客户在最后一次 VMRUN 中启用的 SEV 特性，如表 15-32 所示。SEV_STATUS MSR 是只读的，hypervisor 无法拦截对 SEV_STATUS MSR 的访问。SEV_STATUS MSR 在支持 SEV 的处理器上可用。

**表 15-32. SEV_STATUS MSR 字段**

| 位   | 描述  |
| --- | --- |
| 63:24 | 保留  |
| 23  | IbpbOnEntry_Active：在 SEV_FEATURES\[21\] 中启用 IBPB on Entry 特性 |
| 22-18 | 保留  |
| 18  | SecureAVIC_Active：在 SEV_FEATURES\[16\] 中启用 Secure AVIC 特性 |
| 17  | SmtProtection_Active：在 SEV_FEATURES\[15\] 中启用 SMT Protection 特性 |
| 16  | VmsaRegProt_Active：在 SEV_FEATURES\[14\] 中启用 VMSA Register Protection 特性 |
| 15  | GuestInterceptCtl_Active：在 SEV_FEATURES\[13\] 中启用 Guest Intercept Control 特性 |
| 14  | IbsVirtualization_Active：在 SEV_FEATURES\[12\] 中启用 IBS Virtualization 特性 |
| 13  | PmcVirtualization_Active：在 SEV_FEATURES\[11\] 中启用 PMC Virtualization 特性 |
| 12  | VmgexitParameter_Active：在 SEV_FEATURES\[10\] 中启用 VMGEXIT Parameter 特性 |
| 11  | SecureTsc_Active：在 SEV_FEATURES\[9\] 中启用 Secure TSC 特性 |
| 10  | VmplSSS_Active：在 SEV_FEATURES\[8\] 中启用 VMPL SSS 特性 |
| 9   | SNPBTBIsolation_Active：在 SEV_FEATURES\[7\] 中启用 BTB 隔离特性 |
| 8   | PreventHostIBS_Active：在 SEV_FEATURES\[6\] 中启用 PreventHostIBS 特性 |
| 7   | DebugVirtualization_Active：在 SEV_FEATURES\[5\] 中启用 Debug Virtualization 特性 |
| 6   | AlternateInjection_Active：在 SEV_FEATURES\[4\] 中启用 Alternate Injection 特性 |
| 5   | RestrictedInjection_Active：在 SEV_FEATURES\[3\] 中启用 Restricted Injection 特性 |
| 4   | ReflectVC_Active：在 SEV_FEATURES\[2\] 中启用 ReflectVC 特性 |
| 3   | vTOM_Active：在 SEV_FEATURES\[1\] 中启用 Virtual TOM 特性 |
| 2   | SNP_Active：由 SEV_FEATURES\[0\] 选择 SNP-Active 模式 |
| 1   | SEV_ES_Enabled：在 VMCB 偏移 90h 中启用 SEV-ES 特性 |
| 0   | SEV_Enabled：在 VMCB 偏移 90h 中启用 SEV 特性 |

### 15.34.11 虚拟透明加密（Virtual Transparent Encryption，VTE）

可以启用虚拟透明加密特性，强制 SEV 客户内的所有内存访问使用客户密钥加密。此特性的支持在 CPUID Fn8000_001F\[EAX\] 位 16 中指示。

为启用此特性，hypervisor 必须设置 VMCB 偏移 90h 的位 5。仅当 SEV（位 1）也设置为 1 且 SEV-ES（位 2）清零为 0 时才观察到位 5。在这些位的所有其他配置中（即 SEV 禁用或 SEV-ES 启用），硬件忽略位 5。

启用此特性时，CPU 硬件对所有客户内存引用将客户 C 位视为 1。客户页表中的实际 C 位被硬件忽略。

客户地址转换不变，因此客户物理地址（不带 C 位）用于嵌套页表中的转换。

## 15.35 加密状态（SEV-ES，Encrypted State）

使用第 15.34 节所述 SEV 特性的加密 VM 还可以使用 SEV-ES 特性保护客户寄存器状态免受 hypervisor 的影响。SEV-ES VM 的 CPU 寄存器状态在世界切换期间被加密，hypervisor 无法直接访问或修改。这是为抵御诸如外泄（未授权读取 VM 状态）和控制流攻击（修改 VM 状态）等攻击而设计的，包括回滚攻击（恢复较早的 VM 寄存器状态）。

SEV-ES 包括架构支持，在即将发生某些类型的世界切换时通知 VM 的操作系统，允许 VM 在功能需要时有选择地与 hypervisor 共享信息。

### 15.35.1 确定对 SEV-ES 的支持（Determining Support for SEV-ES）

SEV-ES 支持可以通过读取 CPUID Fn8000_001F\[EAX\] 确定，如第 15.34.1 节所述。EAX 的位 3 指示对 SEV-ES 的支持。

### 15.35.2 启用 SEV-ES（Enabling SEV-ES）

可以通过设置 VMCB 偏移 90h 的位 2，按 VM 启用 SEV-ES。启用 SEV-ES 时，hypervisor 还必须启用 SEV（偏移 90h 位 1）和 LBR 虚拟化（偏移 B8h 位 0）。此外，运行 SEV-ES 客户时，与启用 SEV 相关的所有其他编程要求（见第 15.34.3 节）都必须满足。

在某些系统上，对于以禁用 SEV-ES 运行的 SEV 客户，可以使用的 ASID 值有限制。虽然 SEV-ES 可以在任何有效的 SEV ASID（由 CPUID Fn8000_001F\[ECX\] 定义）上启用，但对于禁用 SEV-ES 的 SEV 客户可以使用的 ASID 有限制。CPUID Fn8000_001F\[EDX\] 指示启用 SEV、禁用 SEV-ES 的客户必须使用的最小 ASID 值。例如，如果 CPUID Fn8000_001F\[EDX\] 返回值 5，则任何使用 ASID 1-4 且启用 SEV 的 VM 也必须启用 SEV-ES。

注意，在首次运行 SEV-ES VM 之前，hypervisor 必须与 AMD 安全处理器协调，为客户 VM 创建初始加密状态映像。

### 15.35.3 SEV-ES 概述（SEV-ES Overview）

SEV-ES 架构旨在默认保护客户 VM 寄存器状态，只允许客户 VM 本身按需授予选择性访问。此额外安全保护功能以两种方式实现。首先，所有 VM 寄存器状态在发生 VM 退出事件（#VMEXIT）时被保存并加密。此状态仅在 VMRUN 时解密和恢复。其次，某些类型的 #VMEXIT 事件导致在客户 VM 内取得新异常。此新异常（#VC，见第 15.35.5 节）指示客户 VM 执行了需要 hypervisor 参与的操作，例如 VM 的 I/O 访问。客户 #VC handler 负责确定为模拟此操作而需要向 hypervisor 暴露哪些寄存器状态。#VC handler 还检查 hypervisor 返回的值，如果输出被认为可接受，则更新客户状态。

需要暴露的寄存器状态利用称为 Guest-Hypervisor Communication Block（GHCB）的新结构。GHCB 的位置由客户选择，客户将页映射为共享内存页，从而允许 hypervisor 直接访问。只有位于 GHCB 中的状态才能被 hypervisor 读取，因为存储在传统 VMCB 保存状态结构中的所有状态都使用客户内存加密密钥加密并受到完整性保护。

在 #VC handler 中，客户可以利用新指令（第 15.35.6 节）执行世界切换并调用 hypervisor。响应此操作，hypervisor 可以检查 GHCB 并确定客户请求的服务。

### 15.35.4 退出类型（Types of Exits）

启用 SEV-ES 时，所有 #VMEXIT 事件分为自动退出（Automatic Exits，AE）或非自动退出（Non-Automatic Exits，NAE）。AE 事件通常是相对于客户执行异步发生的事件（例如中断）或不需要暴露任何客户寄存器状态的事件。所有其他 #VMEXIT 事件归类为 NAE 事件，对于 NAE 事件，允许客户确定在 GHCB 中暴露哪些寄存器状态（如果有）。在客户执行期间，仅当 VMCB 控制区中相应的拦截位置位时，才取得 #VMEXIT 事件（AE 和 NAE）。

hypervisor 仅通过 VMCB 控制区 EXITCODE 字段中的 #VMEXIT 代码获知特定 AE 事件。NAE 事件导致由客户处理的 #VC 异常。表 15-33 列出了可能的 AE 事件，所有其他事件被视为 NAE 事件。

**表 15-33. AE 退出代码**

| 代码  | 名称  | 备注  | HW 推进 RIP |
| --- | --- | --- | --- |
| 52h | VMEXIT_MC | 机器检查异常 | 否   |
| 60h | VMEXIT_INTR | 物理 INTR | 否   |
| 61h | VMEXIT_NMI | 物理 NMI | 否   |
| 62h | VMEXIT_SMI | 物理 SMI | 否   |
| 63h | VMEXIT_INIT | 物理 INIT | 否   |
| 64h | VMEXIT_VINTR | 虚拟 INTR | 否   |
| 77h | VMEXIT_PAUSE | PAUSE 指令 | 是   |
| 78h | VMEXIT_HLT | HLT 指令 | 是   |
| 7Fh | VMEXIT_SHUTDOWN | Shutdown | 否   |
| 8Fh | VMEXIT_EFER_WRITE_TRAP | 见第 15.35.10 节 | 是   |
| 90h | VMEXIT_CR0_WRITE_TRAP | 见第 15.35.10 节 | 是   |
| 93h | VMEXIT_CR3_WRITE_TRAP | 见第 15.35.10 节 | 是   |
| 94h | VMEXIT_CR4_WRITE_TRAP | 见第 15.35.10 节 | 是   |
| A5h | VMEXIT_BUSLOCK | 总线锁定阈值 | 否   |
| A6h | VMEXIT_IDLE_HLT | 如果空闲则 HLT 指令 | 是   |
| 400h | VMEXIT_NPF | 仅当 PFCODE\[3\]=0 时 | 否   |
| 403h | VMEXIT_VMGEXIT | VMGEXIT 指令 | 是   |
| 407h | VMEXIT_PML_FULL | PML 缓冲区溢出 | 否   |
| –1  | VMEXIT_INVALID | 无效客户状态 | –   |
| –2  | VMEXIT_BUSY | VMSA 中设置了 BUSY 位 | –   |
| \-3 | VMEXIT_IDLE_REQUIRED | 兄弟线程不空闲 | –   |
| \-4 | VMEXIT_INVALID_PMC | 无效 PMC 状态 | –   |

对于由于特定指令导致的退出，CPU 将自动推进客户 RIP 以响应 AE，以便执行在后续 VMRUN 时从下一条指令恢复。

对于嵌套页故障，仅当没有保留位错误时它们才被视为 AE。这旨在帮助区分由于按需缺失（hypervisor 需要分配页）导致的嵌套页故障与 MMIO 模拟（hypervisor 需要模拟设备）导致的嵌套页故障。因此，hypervisor 应在其打算模拟的所有 MMIO 页上设置保留页表位（如保留地址位）。（这可以包括启用 SEV 时可能变为保留的地址位；见第 15.34.1 节。）这将确保 MMIO 页故障成为 NAE 事件，这对于调用客户 #VC handler 协助 MMIO 模拟至关重要。作为 AE 事件的嵌套页故障不调用任何客户 handler，hypervisor 应按需分配内存然后恢复客户。

注意，当客户启用 SEV-ES 运行时，指令字节（VMCB 偏移 D0h）永远不会在嵌套页故障时保存到 VMCB。

### 15.35.5 #VC 异常（#VC Exception）

当启用 SEV-ES 的客户正在运行且发生 NAE 事件时，硬件总是生成 VMM 通信异常（#VC）。#VC 异常是利用异常向量 29 的精确、促成性、故障型异常。此异常不能被屏蔽。#VC 异常的错误代码等于导致 NAE 的事件的 #VMEXIT 代码（见附录 C）。

响应 #VC 异常，典型流程将涉及客户 handler 检查错误代码以确定异常原因，并决定必须将哪些寄存器状态复制到 GHCB 以便处理该事件。handler 然后应执行 VMGEXIT 指令以创建 AE 并调用 hypervisor。在稍后的 VMRUN 之后，客户执行将在 VMGEXIT 指令之后恢复，handler 可以在那里查看来自 hypervisor 的结果，并根据需要将状态从 GHCB 复制回其内部状态。此流程如图 15-31 所示。

注意，不建议 hypervisor 设置 #VC 异常的 VMCB 拦截位，因为这会阻止客户正确处理 NAE。类似地，hypervisor 应避免为会在 #VC handler 中发生的事件（如 IRET）设置拦截位。

**图 15-31. 示例 #VC 流程** （客户触发 VMEXIT 条件 → AMD64 硬件向客户发送 #VC 异常 → #VC handler 按需将状态复制到 GHCB → VMGEXIT → 硬件将客户状态保存到受保护内存并加载 HV 状态 → hypervisor 处理退出 → VMRUN → 硬件从受保护内存加载客户状态 → 返回到 #VC handler → handler 按需修改状态 → IRET，见原手册第 619 页）

### 15.35.6 VMGEXIT

VMGEXIT 指令创建 AE，旨在允许客户 #VC handler 在需要时调用 hypervisor。VMGEXIT 以 VMEXIT_VMGEXIT 代码导致 AE，行为类似陷阱，因此在后续 VMRUN 时，执行在 VMGEXIT 之后恢复。VMGEXIT 没有 hypervisor 拦截位，因为该指令在 SEV-ES 客户中执行时无条件导致 AE。

VMGEXIT 操作码仅在 SEV-ES 模式活动运行时在客户内有效。如果客户未在 SEV-ES 模式活动下运行，则 VMGEXIT 操作码将被视为 VMMCALL 操作码，行为与 VMMCALL 完全相同。

客户 #VC handler 可以使用 VMGEXIT Parameter 特性原子地向 hypervisor 传递一个参数。VMGEXIT Parameter 特性的支持由 CPUID Fn8000_001F_EAX\[VmgexitParameter\]（位 17）= 1 指示。VMGEXIT Parameter 特性通过设置 VMSA 中的 SEV_FEATURES 位 10（VmgexitParameter）启用。启用此特性时，VMGEXIT 时 RAX 和 CPL 值写入 VMCB 控制区偏移 110h（VMGEXIT_RAX）和 118h（VMGEXIT_CPL）。

### 15.35.7 GHCB

GHCB 是未加密的内存页，用于在 SEV-ES 客户与 hypervisor 之间通信寄存器状态。客户 VM 可以通过 GHCB MSR（C001_0130）设置 GHCB 的位置。此值也包含在 VMCB 中，并分别在 VMRUN/#VMEXIT 时保存/恢复。

GHCB MSR 用于设置 GHCB 内存页的位置。此 MSR 的格式定义如下：

| 位   | 功能  |
| --- | --- |
| 63:0 | GHCB 的客户物理地址 |

此 MSR 的值从 VMCB 偏移 0A0h 保存/恢复。建议软件使用页对齐地址写入此 MSR。GHCB MSR 只能在客户模式下读/写，在主机模式下尝试访问此 MSR 将导致 #GP。

硬件从不直接访问 GHCB，因此 GHCB 的格式不固定。

### 15.35.8 VMRUN

启用 SEV-ES 时，VM 保存状态区不位于 VMCB 页的偏移 400h。相反，它位于称为 VM 保存区（VMSA）的单独页的偏移 0h 处开始，如偏移 108h 处的 VMSA 指针所示。VMSA 指针值存储为主机物理地址。

硬件总是使用利用客户内存加密密钥的加密内存访问来访问 VMSA 保存状态区。

当硬件执行 VMRUN 指令且 VMCB 指示为客户启用了 SEV-ES 时，硬件从 VMSA 指针指示的加密保存状态区加载客户状态。此外，除标准 VMRUN 行为外，VMRUN 指令还将执行以下操作：

-   计算客户状态的校验和以验证完整性
-   执行 VMLOAD 以加载额外的客户寄存器状态
-   加载客户 GPR 状态
-   加载客户 FPU 状态

当客户启用 SEV-ES 时，加密 VM 状态保存区定义扩展为包括所有 GPR 和 FPU 状态（见附录 B）。如果 VMRUN 流程的任何部分出错，或完整性校验和不匹配，则生成 #VMEXIT(VMEXIT_INVALID)。

如果启用了 SEV-ES，VMRUN 指令忽略 VMCB clean 位的位 10:5，并总是重新加载完整客户状态。

对于 SEV-ES 客户，虽然 VMRUN 时加载完整客户状态，但仅将传统 VMRUN 指令（见第 15.5.1 节）定义的最小 hypervisor 状态保存到主机保存区。hypervisor 本身应将其期望的额外段状态和 GPR 值保存到主机保存区，因为这些值将在后续 VMEXIT 时由硬件恢复。硬件不会在 VMRUN 时自动保存来自 hypervisor 的 FS、STAR 或 GPR 值等主机状态。VMCB 状态每一部分的详细分解见附录 B。

软件中断以及异常向量 3 和 4 不能注入 SEV-ES 客户。如果尝试这样做，VMRUN 将以 VMEXIT_INVALID 错误代码失败。

### 15.35.9 自动退出（Automatic Exits）

当启用 SEV-ES 的客户执行期间发生自动退出事件时，硬件自动将客户状态保存到加密保存状态区，并从主机保存区恢复 hypervisor 状态。具体来说，除 VMEXIT 流程保存/恢复的标准状态外，硬件还将执行以下步骤：

-   执行 VMSAVE 以保存额外的客户寄存器状态
-   保存客户 GPR 状态
-   保存客户 FPU 状态
-   计算并存储客户状态的校验和，供后续 VMRUN 使用
-   执行 VMLOAD 以加载额外的主机寄存器状态
-   加载主机 GPR 状态
-   将 FPU 状态重新初始化为其复位值

从主机保存区加载主机 GPR 状态使用附录 B 中描述的扩展 VMCB 格式。所有寄存器状态要么从此位置加载，要么重新初始化为默认值，因此 hypervisor 看不到任何客户寄存器状态。

### 15.35.10 控制寄存器写陷阱（Control Register Write Traps）

CR0、CR3、CR4 和 EFER MSR 写陷阱拦截（VMCB 偏移 10h，分别位 16、19、20 和 15）允许 hypervisor 跟踪客户模式并验证客户是否启用了期望的特性。这些拦截在控制寄存器被修改后导致 AE。控制寄存器的新值保存在 VMCB 的 EXITINFO1 中。控制寄存器写陷阱仅对 SEV-ES 客户支持。

### 15.35.11 与 SMI 和 #MC 的交互（Interaction with SMI and #MC）

如果 SEV-ES 客户执行期间发生 SMI，平台 SMI handler 不会立即执行。相反，SMI 将保持挂起并生成 #VMEXIT(SMI)。然后 SMI 将在执行 STGI 后在 hypervisor 上下文中取得。注意，无论 VMCB 中 SMI 拦截位的值如何，都会发生此行为。

在某些系统中，机器检查错误首先作为 SMI 投递。如果在 SEV-ES 客户执行期间发生这种情况，将生成 #VMEXIT(SMI)，且 EXITINFO1\[MCREDIR\] 将设置为 1（"SMI 拦截"，第 543 页）。如上所述，SMI 将保持挂起直到执行 STGI。在平台 SMI handler 于 STGI 之后执行后，hypervisor 应检查 MCREDIR 位以确定 #VMEXIT(SMI) 是否由于客户中的机器检查错误，并适当处理。

## 15.36 安全嵌套分页（SEV-SNP，Secure Nested Paging）

SEV-SNP 特性为加密 VM 提供额外保护，旨在实现与 hypervisor 更强的隔离。SEV-SNP 与第 15.34 节和第 15.35 节分别描述的 SEV 和 SEV-ES 特性一起使用，并要求启用和使用这些特性。

主要地，SEV-SNP 提供 VM 内存的完整性保护，帮助防止依赖客户数据损坏、别名（aliasing）、重放（replay）和各种其他攻击向量的基于 hypervisor 的攻击。为实现此目标，使用称为反向映射表（Reverse Map Table，RMP）的新系统级数据结构对内存访问执行额外的安全检查，如第 15.36.3 节所述。

除内存保护外，SEV-SNP 还包括几个安全特性，包括新的虚拟机特权级别（VMPL）架构、中断注入限制和侧信道保护。这些特性旨在支持额外的使用模型和增强的安全保护。

虽然本章描述了 SEV-SNP 的 CPU 硬件行为，但该技术还需要使用 AMD 安全处理器（AMD-SP）SEV-SNP 应用二进制接口（ABI）来管理 SEV-SNP VM 的生命周期事件。更多详情请参见 AMD 网站上的 SEV-SNP ABI 规范（PID#56860）。

### 15.36.1 确定对 SEV-SNP 的支持（Determining Support for SEV-SNP）

SEV-SNP 的支持可以通过读取 CPUID Fn8000_001F\[EAX\] 确定，如第 15.34.1 节所述。位 4 指示对 SEV-SNP 的支持，位 5 指示对 VMPL 的支持。实现中可用的 VMPL 数量在 CPUID Fn8000_001F\[EBX\] 的位 15:12 中指示。

CPUID Fn8000_001F\[EAX\] 还指示对用于 SEV-SNP 客户的其他安全特性的支持，这些特性在以下各节中描述。

### 15.36.2 启用 SEV-SNP（Enabling SEV-SNP）

SEV-SNP 依赖 SEV 提供机密性保护。在启用 SEV-SNP 之前，必须设置 MSR C001_0010（SYSCFG）中的 MemEncryptionModEn 位，并且必须满足第 15.34.3 节描述的所有编程要求。在 MSR C001_0010 中将 SecureNestedPagingEn 设置为 1 后，某些 MSR 可能不再被修改。这包括固定范围 MTRR 寄存器（见第 7.7.2 节）、IORR 寄存器（见第 7.9.2 节）、TOP_MEM 和 TOP_MEM2 寄存器（见第 7.9.4 节）、SMM_KEY 寄存器（见第 15.32.2 节）以及 SYSCFG MSR。在 SecureNestedPagingEn 设置为 1 后尝试写入 SYSCFG MSR 将被忽略，而尝试写入提到的其他 MSR 将导致 #GP(0)。

启用 SEV-SNP 需要两步初始化过程：

1.  按第 15.36.4 节所述构造反向映射表（RMP）。
2.  在系统中的每个核上设置 MSR C001_0010（SYSCFG）中的 VMPLEn 和 SecureNestedPagingEn。

在 SEV-SNP 特性全局启用后，可以在 VM 创建期间通过设置 VMSA 偏移 3B0h 处 SEV_FEATURES 字段的位 0，按 VM 激活 SEV-SNP。激活 SNP 的 VM 还必须按第 15.35.2 节所述启用 SEV-ES，并按第 15.34.3 节所述启用 SEV。

在本章中，术语 SNP-enabled 表示 SEV-SNP 在 SYSCFG MSR 中全局启用。术语 SNP-active 表示 SEV-SNP 在其 VMSA 的 SEV_FEATURES 字段中为特定 VM 启用。虽然 SNP-enabled 系统同时支持 SNP-active 和非 SNP-active VM，但 SNP-active VM 只能在 SNP-enabled 系统上运行。

### 15.36.3 反向映射表（Reverse Map Table）

反向映射表（RMP）是所有逻辑处理器全局共享的结构，驻留在系统内存中，用于确保系统物理地址与客户物理地址之间的一对一映射。物理内存中每个可能分配给客户的页在 RMP 中都有一个条目。RMP 条目包含系统物理页的安全属性，如表 15-34 所述。

**表 15-34. RMP 条目的字段**

| 名称  | 备注  |
| --- | --- |
| Assigned | 指示系统物理页已分配给客户或 AMD-SP 的标志。0：由 hypervisor 拥有；1：由客户或 AMD-SP 拥有 |
| Page_Size | 页大小的编码。0：4KB 页；1：2MB 页 |
| Immutable | 指示软件是否可以经由 x86 RMP 操作指令更改条目的标志。0：软件可以更改 RMP 条目；1：软件不能更改 RMP 条目 |
| Guest_Physical_Address | 与该页关联的客户物理地址 |
| ASID | 页所分配给的客户的 ASID |
| VMSA | 指示该页是否为 VMSA 页的标志。0：非 VMSA 页；1：VMSA 页 |
| Validated | 指示客户是否已验证该页的标志。见第 15.36.6 节详情。0：客户尚未验证该页；1：客户使用 PVALIDATE 验证了该页 |
| Permissions\[0\]... Permissions\[n-1\] | 该页的 VMPL 权限掩码。见第 15.36.7 节详情。 |

RMP 的完整性通过将软件对其的操作限制为以下专用指令来维护：

-   **RMPUPDATE**：hypervisor 可用它更改 RMP 条目的 Guest_Physical_Address、Assigned、Page_Size、Immutable 和 ASID 字段。详见第 15.36.5 节。
-   **PSMASH**：允许 hypervisor 将 RMP 中的 2MB 条目拆分为 RMP 中的 512 个 4KB 条目。详见第 15.36.11 节。
-   **RMPADJUST**：允许客户更改 RMP 条目的 VMPL 权限掩码。详见第 15.36.7 节。
-   **PVALIDATE**：允许客户写入 RMP 条目中的 Validated 标志。详见第 15.36.6 节。

当 SEV-SNP 全局启用时，它向页访问控制添加更多限制。hypervisor 和客户使用上述指令对内存访问执行这些限制。违反 RMP 指示的内存访问限制将导致异常。详见第 15.36.10 节。

### 15.36.4 初始化 RMP（Initializing the RMP）

本节描述单级 RMP 初始化。两级 RMP 在第 643 页第 15.36.22 节"分段 RMP"中描述。

MSR C001_0132（RMP_BASE）定义 RMP 第一个字节的系统物理地址。MSR C001_0133（RMP_END）定义 RMP 最后一个字节的系统物理地址。软件必须在全局启用 SEV-SNP 之前，为系统中的每个核以相同方式编程 RMP_BASE 和 RMP_END。

RMP_BASE 和（RMP_END+1）必须 8KB 对齐。AMD-SP 可能对这些寄存器提出进一步的对齐要求。请参阅最新的 AMD-SP 规范以确定所需的对齐。

RMP_BASE 和 RMP_END 之间的内存区域包含一个用于处理器簿记的 16KB 区域，后跟 RMP 条目，每个条目 16B 大小。RMP 的大小决定了 hypervisor 在运行时可以分配给 SNP-active 虚拟机的物理内存范围。RMP 覆盖从地址 0h 到以下公式计算的地址的系统物理地址空间：

((RMP_END + 1 – RMP_BASE – 16KB) / 16B) x 4KB

例如，如果 RMP_BASE 等于 10_0000h，则要覆盖前 4GB 物理内存，RMP_END 必须设置为 110_3FFFh，这使得 RMP 略大于 16MB。

一旦 SEV-SNP 全局启用，内存访问受 RMP 检查限制。为确保 RMP 以已知且非限制状态开始，软件应在设置 SYSCFG MSR 中的 SecureNestedPagingEn 位之前，将 RMP_BASE 到 RMP_END 之间的所有内存写入零。然后 hypervisor 请求 AMD-SP 完成 RMP 的初始化。AMD-SP 初始化 RMP 以防止所有软件直接写入 RMP_BASE 和 RMP_END 之间的内存。所有后续 RMP 条目操作必须通过 x86 RMP 操作指令或与 AMD-SP 交互进行。

### 15.36.5 Hypervisor RMP 管理（Hypervisor RMP Management）

hypervisor 通过更改分配给 SNP-active 客户的页的 RMP 条目，来管理这些页的 SEV-SNP 安全属性。由于 AMD-SP 初始化 RMP 以防止直接访问 RMP，hypervisor 必须使用 RMPUPDATE 指令更改 RMP 的条目。RMPUPDATE 允许 hypervisor 更改 RMP 条目的 Guest_Physical_Address、Assigned、Page_Size、Immutable 和 ASID 字段。

SEV-SNP 通过页的 RMP 条目的 Assigned、ASID 和 Immutable 字段的设置，将所有者与每个系统物理页关联，如表 15-35 所示。页可以由 hypervisor、客户或 AMD-SP 拥有。

**表 15-35. RMP 页分配设置**

| 所有者 | Assigned | ASID | Immutable |
| --- | --- | --- | --- |
| Hypervisor | 0   | 0   | \-  |
| Guest | 1   | 客户的 ASID | \-  |
| AMD-SP | 1   | 0   | 1   |

当 hypervisor 将页分配给客户时，它还必须设置 Guest_Physical_Address 和 Page_Size 以匹配客户的嵌套页表映射。否则，客户对页的访问将导致故障。RMP 访问检查的详情见第 15.36.10 节。

hypervisor 可以通过使用 RMPUPDATE 将 Assigned 设置为 0 并将 ASID 设置为 0，将任何 Immutable 设置为 0 的页转换为 hypervisor 拥有的页。要将 Immutable 设置为 1 的页转换，hypervisor 必须请求 AMD-SP 转换该页。

向 RMP 写入零的 RMP 初始化要求（见第 15.36.4 节）导致系统中的所有页最初属于 hypervisor。任何未被 RMP 覆盖的内存页被视为永久 hypervisor 页。例如，如果 RMP 配置为仅覆盖前 4GB 内存，则出于 RMP 访问检查的目的，4GB 以上的所有内存被视为 hypervisor 内存。

### 15.36.6 页验证（Page Validation）

分配给 VM 的每个页要么已验证要么未验证，如页的 RMP 条目中的 Validated 标志所示。VM 对未验证的私有页的内存访问生成 #VC。所有页最初分配为未验证。

VM 可以使用 PVALIDATE 指令设置或清除页的 Validated 标志。预期 VM 将在 VM 启动期间使用 PVALIDATE 设置 Validated 标志，以获得对 hypervisor 分配的内存的访问。VM 可以稍后在其内存空间缩减时（例如内存热插拔事件之后）使用 PVALIDATE 清除 Validated 标志。

页验证允许 VM 检测 hypervisor 对其页的意外重新映射。在访问页之前，VM 必须验证该页。一旦验证，hypervisor 使用 RMPUPDATE 取消分配、重新分配或重新映射该页的任何使用都将导致该页变为未验证。VM 然后可以通过访问未验证页时发生的 #VC 检测对页映射的篡改。

PVALIDATE 将页大小作为输入参数，指示应验证 4KB 或 2MB 页。如果 VM 尝试在嵌套页表中映射到 2MB 或 1GB 页的 4KB 页上使用 PVALIDATE，则 PVALIDATE 生成 #VMEXIT(NPF)。在这种情况下，hypervisor 可以使用 PSMASH 指令按第 15.36.11 节所述将较大页拆分为 4KB 页。如果 VM 尝试在映射到 4KB 嵌套页的 2MB 客户页上使用 PVALIDATE，则 PVALIDATE 向 VM 返回错误指示。VM 可以改为尝试对每个 4KB 页单独执行 PVALIDATE。

### 15.36.7 虚拟机特权级别（Virtual Machine Privilege Levels）

典型的客户 VM 可能由多个 vCPU 组成。SEV-SNP 通过使 vCPU 能够以不同的虚拟机特权级别（VMPL）运行来扩展此能力。在 vCPU 内，不同的 VMPL 由唯一的 VMSA 表示，预期以互斥方式运行。每个 VMSA 分配一个 VMPL，如 VMSA 中的 VMPL 字段所示。

VMPL 从 0 开始以数字标识，VMPL0 是最高特权。实现中可用的 VMPL 数量在 CPUID Fn8000_001F\[EBX\] 的位 15:12 中指示。VMPL 特性使客户能够细分其地址空间，并逐页实现特定于 vCPU 的访问控制。

处理器基于 RMP 条目中的 VMPL 权限掩码限制客户内存访问。每个 RMP 条目包含一组权限掩码，为每个实现的 VMPL 一个掩码。在内存访问时，处理器检查页的当前 VMPL 权限掩码以确定是否允许访问。权限掩码位定义于表 15-36。

**表 15-36. VMPL 权限掩码定义**

| 位   | 名称  | 设置  |
| --- | --- | --- |
| 0   | Read（RD） | 0：读取导致 #VMEXIT(NPF)；1：允许读取 |
| 1   | Write（WR） | 0：写入导致 #VMEXIT(NPF)；1：允许写入 |
| 2   | Execute-User（XU） | 0：CPL 3 执行导致 #VMEXIT(NPF)；1：允许 CPL 3 执行 |
| 3   | Execute-Supervisor（XS） | 0：CPL < 3 执行导致 #VMEXIT(NPF)；1：允许 CPL < 3 执行 |
| 4   | Supervisor-Shadow-Stack（SSS） | 0：SSS 访问导致 #VMEXIT(NPF)；1：允许 SSS 访问 |
| 5-7 | 保留  | SBZ |

当客户访问由于 VMPL 权限违规导致 #VMEXIT(NPF) 时，按第 15.36.10 节所述在 EXITINFO1 中设置错误代码位。

当 hypervisor 使用 RMPUPDATE 将页分配给客户时，为 VMPL0 启用全部权限，并为所有其他 VMPL 禁用权限。VM 然后可以使用 RMPADJUST 指令修改数值上高于自身的 VMPL 的权限。例如，在 VMPL0 执行的 vCPU 可以使用 RMPADJUST 将内存页限制为在 VMPL1 只读-写但不可执行。然而，在 VMPL1 执行的 vCPU 不能更改其自身权限或 VMPL0 的权限。

RMPADJUST 不能用于授予超过当前 VMPL 权限掩码允许的更大权限。例如，如果 VMPL1 尝试向 VMPL2 授予页的写权限，但 VMPL1 对该页没有写权限，则 RMPADJUST 将失败。

当尝试授予架构不支持权限时发生 VMPL 权限错误配置，并导致 RMPADJUST 指令失败。VMPL 错误配置条件定义于表 15-37。

**表 15-37. VMPL 错误配置条件**

| VMPL 权限 | 描述  |
| --- | --- |
| (R==0) && (Permissions\[7:1\]!= 0) | 不可读页不得有任何其他权限。 |
| (SSS==1) && ((XU==1) \| (XS==1)) | 管理程序影子堆栈页不得可执行。 |
| (XS==1) && (XU==0) | 管理程序可执行页也必须用户可执行。 |

**VMPL 管理程序影子堆栈（VMPL Supervisor Shadow Stack）。** VMPL 管理程序影子堆栈（VMPL SSS）特性允许 SNP-active 客户（而非 hypervisor，见第 15.25.14 节）通过使用 VMPL SSS 权限位指定 SSS 页，限制哪些客户物理地址可以用于客户管理程序影子堆栈。客户对 VMPL Permissions 中未指定为 SSS 页的页进行的管理程序影子堆栈访问导致 #VMEXIT(NPF)。

VMPL SSS 特性的支持由 CPUID Fn8000_001F_EAX\[VmplSSS\]（位 7）= 1 指示。VMPL SSS 特性通过设置 VMSA 中的 SEV_FEATURES 位 8（VmplSSS）启用。VMPL SSS 和嵌套页控制的 SSS 特性互斥。如果 SEV_FEATURES\[VmplSSS\] = 1 且 VMCB\[SSS\] = 1，则 VMRUN 以 #VMEXIT(VMEXIT_INVALID) 失败。

如果启用了 VMPL SSS 特性，则管理程序和用户影子堆栈访问都必须指向私有内存页。否则，在客户中生成带有保留（RSV）错误代码位置位的 #PF 异常。

### 15.36.8 虚拟内存顶部（Virtual Top-of-Memory）

在 SNP-active 客户的 VMSA 中，VIRTUAL_TOM 字段指定一个 2MB 对齐的客户物理地址，称为虚拟内存顶部。当 SNP-active VM 的 VMSA 中设置 SEV_FEATURES 的位 1（vTOM）时，VIRTUAL_TOM 字段用于确定数据访问的 C 位，而不是客户页表内容。VIRTUAL_TOM 以下的所有数据访问以有效 C 位 1 访问，VIRTUAL_TOM 处或以上的所有地址以有效 C 位 0 访问。注意，页表访问和指令获取总是具有有效 C 位 1，无论 VIRTUAL_TOM 的值或是否启用该特性。

Virtual TOM MSR（C001_0135）可用于更改 VIRTUAL_TOM 值。CPUID Fn8000_001F_EAX\[VirtualTom\]（位 18）= 1 指示支持 Virtual TOM MSR。此 MSR 寄存器在 Virtual TOM 活动时读-写，在 Virtual TOM 不活动时尝试访问它将导致 #GP(0) 异常。Virtual TOM MSR 位 63:52 和 20:0 为保留，RAZ。对此寄存器的 WRMSR 刷新属于当前 ASID 的 TLB 条目。

当在 SEV_FEATURES 中启用虚拟内存顶部时，客户页表条目中的 C 位必须为零以进行所有访问。客户页表中 C 位设置为 1 的任何客户内存访问将由于保留位错误导致 #PF。

### 15.36.9 反映 #VC（Reflect #VC）

运行 SEV-SNP VM 时，CPU 响应可能需要 hypervisor 交互的事件生成 #VC 异常。#VC 异常以及可能导致它们的事件在第 15.35.5 节中讨论。SEV-SNP VM 可以选择在其当前客户上下文中直接处理 #VC 异常，或将 #VC 异常转换为自动退出。此行为由 SEV_FEATURES 的位 2（ReflectVC）控制。如果此位设置为 1，则任何否则会导致 #VC 异常的事件都改为转换为自动退出。

当 #VC 转换为自动退出时，客户 VM 以退出代码 VMEXIT_VC 终止。#VC 的错误代码（反映导致 #VC 的事件，例如 VMEXIT_CPUID）保存到 VMSA 中的 GUEST_EXITCODE 字段。关于导致 #VC 的事件的附加信息保存到 VMSA 中的 GUEST_EXITINFO1、GUEST_EXITINFO2、GUEST_EXITINTINFO 和 GUEST_NRIP 字段。保存到这些字段的信息与为发生的事件提供的标准退出信息相同。例如，如果 VM 执行标记为拦截的端口 I/O 指令，GUEST_EXITCODE 字段将设置为 VMEXIT_IOIO，GUEST_EXITINFO1 字段将包含关于 I/O 端口访问的信息，如第 15.10.2 节所定义。

Reflect #VC 特性使 #VC 事件能够由不同于发起它们的 VMPL 的 vCPU 处理。例如，客户可以包含由两个不同 VMSA 组成的 vCPU。一个 VMSA 定义为在 VMPL0 执行，而另一个启用 ReflectVC 并定义为在 VMPL3 执行。当在 VMPL3 运行的 vCPU 遇到 #VC 条件时，信息保存到其 VMSA，控制返回 hypervisor。hypervisor 然后可以在 VMPL0 运行 vCPU，该 vCPU 可以读取保存到 VMPL3 VMSA 的退出信息、按需与 hypervisor 交互、将适当的响应数据写回 VMPL3 VMSA，并指示 hypervisor 恢复 vCPU 在 VMPL3 的执行。

如果在处理中断或异常期间发生 #VC 事件，则 GUEST_EXITINTINFO.V 位将被设置。如果启用了 Alternate Injection 特性（见第 15.36.15 节），硬件将自动在 VMSA 中设置 VINTR_CTRL\[BUSY\] 位。这使更高特权的 VMPL 能够重新注入导致 #VC 的事件。

GUEST_EXITCODE、GUEST_EXITINFO1、GUEST_EXITINFO2、GUEST_EXITINTINFO 和 GUEST_NRIP 字段由硬件在每次自动退出时填充，无论 ReflectVC 特性如何。对于反映 #VC 之外的自动退出，这些字段设置为与 VMCB 中设置的值相同的值。

### 15.36.10 RMP 和 VMPL 访问检查（RMP and VMPL Access Checks）

当 SEV-SNP 全局启用时，处理器基于 RMP 的内容对所有内存访问施加限制，无论访问由 hypervisor、传统客户 VM、非 SNP 客户 VM 还是 SNP-active 客户 VM 执行。根据访问的上下文，处理器可以执行以下一项或多项检查：

-   **RMP-Covered**：检查目标页是否被 RMP 覆盖。如果页的相应 RMP 条目低于 RMP_END，则该页被 RMP 覆盖。任何未被 RMP 覆盖的页被视为 Hypervisor-Owned 页。
-   **Hypervisor-Owned**：检查如果目标页被 RMP 覆盖，则目标页的 Assigned 位是否为 0。如果指定 sPA 的页表条目指示目标页大小为 2MB，则目标页的所有 4KB 组成页的 RMP 条目的 Assigned 位必须设置为 0。对 1GB 页的访问在启用 SEV-SNP 时仅安装 2MB TLB 条目，因此出于此检查的目的，此检查将 1GB 访问视为 2MB 访问。
-   **Guest-Owned**：检查目标页的 RMP 条目的 ASID 字段是否与当前 VM 的 ASID 匹配。
-   **Reverse-Map**：检查目标页的 RMP 条目的 Guest_Physical_Address 是否与转换的客户物理地址匹配。
-   **Validated**：检查目标页的 RMP 条目的 Validated 字段是否为 1。
-   **Mutable**：检查目标页的 RMP 条目的 Immutable 字段是否为 0。
-   **Page-Size**：检查是否满足以下条件：
    -   如果嵌套页表指示 2MB 或 1GB 页大小，则目标页的 RMP 条目的 Page_Size 字段为 1。
    -   如果嵌套页表指示 4KB 页大小，则目标页的 RMP 条目的 Page_Size 字段为 0。
-   **VMPL**：检查 VMPL 权限掩码是否允许访问。详见第 15.36.7 节。

表 15-38 描述了在哪些条件下执行每项检查以及失败时产生什么故障。

**表 15-38. RMP 内存访问检查**

| 主机/客户 | SNP-Active | 访问类型 | C 位 | 检查  | 故障  |
| --- | --- | --- | --- | --- | --- |
| 主机  | \-  | 数据写、页表访问 | \-  | Hypervisor-Owned | #PF |
| 客户  | 否   | 数据写、页表访问 | \-  | Hypervisor-Owned | #VMEXIT(NPF) |
| 客户  | 是   | 指令获取、页表访问 | \-  | RMP-Covered、Guest-Owned、Reverse-Map、Mutable、Page-Size | #VMEXIT(NPF) |
| 客户  | 是   | 指令获取、页表访问 | \-  | Validated | #VC |
| 客户  | 是   | 指令获取、页表访问 | \-  | VMPL | #VMEXIT(NPF) |
| 客户  | 是   | 数据写 | 0   | Hypervisor-Owned | #VMEXIT(NPF) |
| 客户  | 是   | 数据写、数据读 | 1   | RMP-Covered、Guest-Owned、Reverse-Map、Mutable、Page-Size | #VMEXIT(NPF) |
| 客户  | 是   | 数据写、数据读 | 1   | Validated | #VC |
| 客户  | 是   | 数据写、数据读 | 1   | VMPL | #VMEXIT(NPF) |

此外，任何导致 RMP 检查的内存访问，如果被访问的 RMP 条目正在被其他逻辑处理器使用，可能导致 RMP 违规（#PF 或 #VMEXIT(NPF)）。在这种情况下，软件应重试访问。

如果内存访问导致页表条目中 Accessed 或 Dirty 位的修改，则此页表修改被 SEV-SNP 视为类似于数据写访问。对于任何此类页表修改访问，访问的页大小固有地为 4KB。

如果启用了虚拟 TOM 特性（见第 15.36.8 节），则使用 Virtual TOM 设置确定给定客户访问的 C 位。Virtual TOM 以下的客户物理地址被视为 C 位设置为 1。

以下页故障错误位在 RMP 检查相关的 #PF 上设置：

-   **位 31（RMP）**：如果故障是由于 RMP 检查或 VMPL 检查失败导致则置 1，否则为 0。本节描述的所有 RMP 违规都会将此位设置为 1。

此外，以下页故障错误位可以在 EXITINFO1 中的 #VMEXIT(NPF) 上设置：

-   **位 34（ENC）**：如果客户的有效 C 位为 1 则置 1，否则为 0。
-   **位 35（SIZEM）**：如果故障是由 PVALIDATE 或 RMPADJUST 与 RMP 之间的大小不匹配导致则置 1，否则为 0。
-   **位 36（VMPL）**：如果故障是由 VMPL 权限检查失败导致则置 1，否则为 0。
-   **位 37（SSS）**：如果启用了 VmplSSS，则设置为 VMPL 权限掩码 SSS（位 4）值。

在任何客户指令获取、页表访问或对私有（C=1）内存的数据写入上，有效 C 位总是 1。

本节描述的所有 RMP 检查发生在页表和嵌套页表访问检查之后，优先级低于现有分页检查。表 15-38 反映了 RMP 检查的相对优先级。即，VMPL 检查优先级最低，前面是页验证检查。例如，如果客户访问未通过 Page-Size 检查和 Validated 检查，将发生 #VMEXIT(NPF) 而不是 #VC，因为 Page-Size 检查优先于页验证检查。

页验证检查失败导致错误代码为 PAGE_NOT_VALIDATED（0x404）的 #VC。发生此错误时，故障客户虚拟地址保存到 CR2。

### 15.36.11 大页管理（Large Page Management）

hypervisor 可能需要将分配给客户的 2MB 页转换为 4KB 页。此转换称为页粉碎（page smashing），需要 hypervisor 更改 RMP。hypervisor 可以使用 RMPUPDATE 更改 RMP 中页的大小，但这将清除已验证位。

要在不更改区域验证状态的情况下将 2MB 页转换为 4KB 页，hypervisor 可以使用 PSMASH 指令。PSMASH 接受 2MB 对齐的系统物理地址并粉碎该页，同时保留 RMP 中的 Validated 位。PSMASH 成功完成后，所得 4KB 页的 RMP 条目具有以下内容：

-   Guest_Physical_Address 字段中的连续值
-   Page_Size 设置为 0，指示 4KB 页
-   从原始 2MB 页 RMP 条目复制的所有其他 RMP 字段

hypervisor 可能需要粉碎 2MB 页的一个原因是客户在由 2MB 页支持的 4KB 页上执行 PVALIDATE 或 RMPADJUST。在这种情况下，指令生成带有 EXITINFO1 中 SIZEM 位设置的 #VMEXIT(NPF)。为解决此问题，hypervisor 可以粉碎该页，然后让客户重新启动指令。

如果客户希望验证 2MB 对齐区域，客户应首先尝试以 2MB 大小执行 PVALIDATE。如果该页由 4KB 页支持，PVALIDATE 以 FAIL_SIZEMISMATCH 错误终止。在这种情况下，客户应随后对每个 4KB 页单独执行 PVALIDATE。这允许客户利用更高效的 2MB 映射，并避免 hypervisor 不必要地粉碎页。

表 15-39 总结了潜在的页大小不匹配以及如何解决。

**表 15-39. PVALIDATE/RMPADJUST 页大小不匹配组合**

| 请求的页大小 | RMP 中的页大小 | 错误条件 | 推荐处理 |
| --- | --- | --- | --- |
| 4KB | 2MB | #VMEXIT(NPF) | PSMASH |
| 2MB | 4KB | FAIL_SIZEMISMATCH | 客户在每个 4KB 组成页上重试 |

将一组连续的 4KB 页转换为单个 2MB 页的逆向操作需要客户或 AMD-SP 的协助，以确保执行该操作是安全的。

### 15.36.12 运行 SNP-Active 虚拟机（Running SNP-Active Virtual Machines）

与 SEV-ES 客户一样，SNP-active 客户由 hypervisor 控制的 VMCB 和客户加密的 VMSA 描述。SNP-active 客户的初始 VMSA 必须通过与 AMD-SP 协调设置，其细节超出了本手册的范围。这包括 VMSA 中 SEV_FEATURES 字段的初始配置，该字段指示为特定 VM 实例启用了哪些客户安全特性。如果 SEV-SNP 未全局启用，则对 SNP-active 客户的 VMRUN 将以 VMEXIT_INVALID 错误代码失败。

**VMRUN 检查（VMRUN Checks）。** 当系统上全局启用 SEV-SNP 时，VMRUN 指令对各种内存页执行额外安全检查。这些检查类似于第 15.36.10 节描述的检查。注意，对于依赖页大小的检查，使用 4KB 页大小。除该节描述的检查外，还存在一项额外检查：

-   **VMSA**：检查 RMP 条目中的 VMSA 字段是否等于 1。

RMP 条目中的 VMSA 字段可以由 AMD-SP 设置，或由在 VMPL0 运行的 vCPU 使用 RMPADJUST 指令设置。

VMRUN 时执行的检查如下：

**表 15-40. VMRUN 页检查**

| 页类型 | SNP-Active | 检查  | 故障  |
| --- | --- | --- | --- |
| VMCB | \-  | Hypervisor-Owned | #GP(0) |
| AVIC Backing Page | \-  | Hypervisor-Owned | #VMEXIT(VMEXIT_INVALID) |
| PML Buffer | \-  | Hypervisor-Owned | #VMEXIT(VMEXIT_INVALID) |
| IBS Buffer | \-  | Hypervisor-Owned | #VMEXIT(VMEXIT_INVALID) |
| VMSA | 否   | Hypervisor-Owned | #VMEXIT(VMEXIT_INVALID) |
| VMSA | 是   | RMP-Covered、Guest-Owned、Reverse-Map、Mutable、VMSA | #VMEXIT(VMEXIT_INVALID) |

AVIC Logical Table、AVIC Physical Table、IOPM_BASE_PA 和 MSRPM_BASE_PA 不由 VMRUN 检查，因为这些结构仅由硬件读取。

VMRUN 成功后，VMCB 页以及表 15-39 中列出的处理器在 VMRUN 和 VMEXIT 之间使用的任何页被硬件标记为使用中，任何通过 RMPUPDATE 等指令修改这些页 RMP 条目的尝试将导致 FAIL_INUSE 响应。使用中标记在 #VMEXIT 事件后由硬件自动清除。

**其他检查（Other Checks）。** 除 VMRUN 执行的 RMP 检查外，其他几个与 VM 相关的操作执行特殊 RMP 检查。

写入 VM_HSAVE_PA MSR 的地址（保存 VMRUN 时用于保存主机状态的页的地址）必须指向 hypervisor 拥有的页。如果此检查失败，WRMSR 将以 #GP(0) 异常失败。注意，值 0 不被视为 VM_HSAVE_PA MSR 的有效值，在 HSAVE_PA 为 0 时尝试的 VMRUN 将以 #GP(0) 异常失败。

VMSAVE 指令也执行检查以确保目标页是 hypervisor 拥有的。如第 15.36.8 节所述，预期 VMSAVE 指令不用于 SEV-ES 和 SNP-active 客户，但可以与其他客户一起使用。

如果在主机模式执行 VMSAVE 且目标页未通过 RMP 检查，则生成 #GP(0) 异常。如果在 VMSAVE 指令被虚拟化时（见第 15.33.1 节）在客户中执行 VMSAVE，且目标页未通过 RMP 检查，则生成指示 RMP 权限错误的 #VMEXIT(NPF)。在支持 SEV-SNP 的处理器中，不支持在 SEV-ES 或 SNP-active 客户内执行 VMSAVE 指令，将导致 #VMEXIT(VMSAVE)。

**拦截行为（Intercept Behavior）。** SNP-Active 客户执行的所有端口 I/O（IN、INS、OUT、OUTS）和 CPUID 指令都被视为被拦截，无论 VMCB 和 IOPM 中设置的拦截位如何。在 SNP-Active 客户中执行这些指令将无条件生成非自动退出。

### 15.36.13 调试寄存器（Debug Registers）

SEV-ES 和 SNP-active 客户可以选择通过 SEV_FEATURES 位 5（DebugVirtualization）启用 CPU 调试寄存器的完整虚拟化。

启用时，DR\[0-3\] 寄存器和 DR\[0-3\]\_ADDR_MASK 寄存器作为类型 'B' 状态交换（见附录 B）。

### 15.36.14 内存类型（Memory Types）

当 SNP-active 客户访问内存时，硬件强制使用一致内存类型。这防止 hypervisor 尝试通过为客户的访问使用非一致内存类型来损坏客户内存。

如果在第 15.25.8 节描述的内存类型确定逻辑之后确定客户内存访问是非一致的，则硬件按表 15-41 所述强制使用一致类型。

**表 15-41. 非一致内存类型转换**

| 非一致内存类型 | 强制一致内存类型 |
| --- | --- |
| UC  | CD  |
| WC  | WC+ |

### 15.36.15 TLB 管理（TLB management）

对于非 SNP-active 客户，当 hypervisor 将 VMSA 移动到新的逻辑处理器时，它必须确保 VMSA 不能使用任何过时（错误）的 TLB 转换，以防止客户损坏。对于 SNP-active 客户，为避免对 hypervisor 正确管理客户 TLB 内容的任何依赖，硬件检测 VMSA 何时被移动并自动管理该客户的 TLB。硬件使用两个 VMSA 字段跟踪此信息：TLB_ID（字节偏移 3D0h）和 PCPU_ID（字节偏移 3D8h）。

在客户创建期间，软件应将 TLB_ID 和 PCPU_ID 都初始化为零。硬件随后在该 VMSA 的整个生命周期内管理两个字段中的值。

在操作期间，如果希望，软件可以显式将 PCPU_ID 写入 0，以强制在下一次对该 VMSA 的 VMRUN 时刷新 TLB。如果发生这种情况，硬件在刷新 TLB 时将 PCPU_ID 字段设置为非零值。

例如，当客户软件执行 RMPADJUST 以更改 VMPL 的权限时，它可能需要确保在目标 VMPL 执行的所有 vCPU 的现有 TLB 条目不再被使用。客户软件可以通过将受影响 VMSA 的 PCPU_ID 写入零来实现此目的。当这些 VMSA 使用 VMRUN 重新进入时，硬件将确保现有 TLB 条目不再使用，并将 PCPU_ID 设置为非零值。客户软件可以检查此值非零，以确保操作在继续之前已完成。

与任何客户一样，hypervisor 可以在需要时使用 VMCB 中的 TLB_CONTROL 字段强制刷新 TLB。当 hypervisor 将 3h 或 7h 写入 TLB_CONTROL 时，客户的全局和非全局 TLB 条目都被使无效。

### 15.36.16 中断注入限制（Interrupt Injection Restrictions）

SNP-active 客户可以选择通过 SEV_FEATURES 位 3 和 4 分别启用 Restricted Injection 或 Alternate Injection 特性。这些特性强制实施额外的中断和事件注入安全保护，旨在帮助防止恶意注入攻击。这两个特性对于特定 VMSA 互斥，尝试同时启用两者将在执行 VMRUN 指令时导致 #VMEXIT(VMEXIT_INVALID)。

**受限注入（Restricted Injection）。** 此特性禁用除新异常向量 #HV（28）之外所有向量的基于 hypervisor 的中断排队和事件注入，#HV 保留供 SNP 客户使用，但从未由硬件生成。#HV 仅允许注入到使用 Restricted Injection 执行的 VMSA 中。#HV 是良性异常，只能作为异常注入（VMCB.EVENTINJ\[Type\]=3）且不带错误代码。使用 Restricted Injection 运行的客户预期通过软件管理的半虚拟化接口与 hypervisor 通信事件。此接口可以使用 #HV 注入作为 doorbell，通知客户已添加新事件。

启用 Restricted Injection 的 VMRUN 指令，如果 hypervisor 尝试注入任何不受支持的事件，或尝试在启用 AVIC 的情况下运行客户，将以 VMEXIT_INVALID 错误代码失败。

**交替注入（Alternate Injection）。** 此特性将所有基于 hypervisor 的中断排队和事件注入替换为客户控制的排队和注入。当在 VMSA 中启用 Alternate Injection 时，VMRUN 上的事件注入信息从 VMSA 中的 EventInjCtrl 字段（偏移 3E0h）读取，中断排队信息从 VMSA 中的 VIntrCtrl 字段（偏移 3B8h）读取。此特性旨在用于多 VMPL 架构，其中高特权 VMSA 将事件和中断直接注入低特权 VMSA。

启用 Alternate Injection 时，VMRUN 上忽略 VMCB 中的 EventInjCtlr 字段（偏移 A8h）。VMCB 中的 VIntrCtrl 字段（偏移 60h）被处理，但只使用 V_INTR_MASKING、Virtual GIF Mode 和 AVIC Enable 位。如果客户使用 Alternate Injection 运行，AVIC Enable 位必须为 0，否则 VMRUN 将以 VMEXIT_INVALID 错误代码失败。

VIntrCtrl 的其余字段（V_TPR、V_IRQ、VGIF、V_INTR_PRIO、V_IGN_TPR、V_INTR_VECTOR、V_NMI、V_NMI_MASK、V_NMI_EN）从 VMSA 读取。此外，加密 VIntrCtrl 字段的位 10 定义为 INT_SHADOW 位，VMCB 偏移 68h 位 0 的未加密 INT_SHADOW 位被忽略。在 VMEXIT 时，V_TPR、V_IRQ、V_NMI、V_NMI_MASK 和 INT_SHADOW 值仅写回加密 VIntrCtrl。

在使用 Alternate Injection 运行的客户中，加密 VIntrCtrl 字段的位 63 定义为 BUSY 位。在 VMRUN 时，如果 VIntrCtrl\[BUSY\] 设置为 1，则 VMRUN 以 VMEXIT_BUSY 错误代码失败。BUSY 位使 VMSA 能够在软件修改进行期间被临时标记为不可运行。

**额外拦截行为（Additional Intercept Behavior）。** 在启用这两个特性之一的客户中存在额外硬件强制拦截行为：

-   对于任一特性，硬件都将物理 INTR、NMI、INIT 和 #MC 事件视为被拦截，无论 VMCB 中设置的拦截位如何。
-   在 Alternate Injection 下，客户对 x2APIC MSR 范围（MSR 0x800-0x8FF）的任何 MSR 访问都被拦截，无论 MSR_PROT 拦截和 MSR 保护位图如何。在这种情况下，拦截行为与 MSR 位图指示对应 MSR 被拦截时会发生的行为相同。

### 15.36.17 侧信道保护（Side-Channel Protection）

SEV-SNP 针对某些侧信道攻击提供可选保护。

**分支目标缓冲隔离（Branch Target Buffer Isolation）。** SNP-active 客户可以选择通过 SEV_FEATURES 位 7（BTBIsolation）启用分支目标缓冲隔离模式。分支目标缓冲（BTB）是预测间接分支时使用的内部 CPU 结构，SNP-active 客户可以选择对其施加额外限制，以帮助防止某些类型的基于推测执行的侧信道。

当启用 BTB Isolation 执行 SNP-active 客户时，CPU 硬件将确保该客户上下文之外的任何代码不能影响硬件在客户内执行的基于 BTB 的预测。硬件跟踪 BTB 中预测信息的来源，并可在需要维护此隔离时刷新 BTB 内容。

在支持 BTB Isolation 的硬件中，如果当前上下文中启用了 SPEC_CTRL\[IBRS\]，则永远不会写入新的 BTB 预测信息。因此，建议临时执行的非客户软件（例如 hypervisor 退出处理代码）在 SPEC_CTRL\[IBRS\] 设置为 1 的情况下运行。这确保来自该上下文的间接分支信息不会存储在 BTB 中，并可避免在恢复客户执行时需要进行 BTB 刷新。

**入口间接分支预测屏障（Indirect Branch Prediction Barrier on Entry）。** SNP-active 客户可以选择通过 SEV_FEATURES 位 21（IbpbOnEntry）启用入口间接分支预测屏障（IBPB）。对入口 IBPB 的支持由 CPUID Fn8000_001F\[IbpbOnEntry\] 位 31 指示。当启用 IbpbOnEntry 进入客户上下文时，CPU 硬件在执行客户指令之前写入 PRED_CMD\[IBPB\]=1。

**基于指令的采样（Instruction Based Sampling）。** SEV-ES 和 SNP-active 客户可以选择不允许 hypervisor 使用基于指令的采样（IBS），以限制可能收集到的关于其执行的信息。客户可以通过 SEV_FEATURES 位 6（PreventHostIBS）启用此限制。当对已启用此保护的客户执行 VMRUN 时，IbsFetchCtl\[IbsFetchEn\] 和 IbsOpCtl\[IbsOpEn\] MSR 位必须为 0。如果这些位中任一不为 0，则 VMRUN 将以 VMEXIT_INVALID 错误代码失败。

**VMSA 寄存器保护（VMSA Register Protection）。** SNP-active 客户可以选择通过 SEV_FEATURES 位 14（VmsaRegProt）启用 VMSA 寄存器保护特性。当发生自动退出且启用此特性时，CPU 硬件在将某些寄存器的值写入 VMSA 之前对其进行混淆。硬件随后在后续 VMRUN 时对这些值去混淆。此混淆可能有助于防止对加密 VMSA 密文的某些类型的侧信道攻击。

混淆通过寄存器值与 8B nonce 之间的按位 XOR 操作执行。nonce 值存储在 VMSA 中，并在每次自动退出时由 CPU 硬件以伪随机方式更新。初始化新 VMSA 时，建议将 nonce 设置为随机值。

启用此特性时被混淆的具体 VMSA 字段可能因实现而异。有关此的更多信息可在 AMD-SP SEV-SNP ABI 规范中找到。

**SMT 保护（SMT Protection）。** SMT 保护特性允许 SEV-SNP VM 要求兄弟线程在 VM 运行期间空闲。这确保恶意代码不会被兄弟线程执行，从而为与共享核心资源相关的潜在侧信道攻击提供缓解。hypervisor 必须执行 HLT 指令或在兄弟线程上请求 I/O C 状态，然后才能执行 VMRUN 指令以运行启用 SMT 保护特性的 SEV-SNP vCPU。

SNP-active 客户可以选择通过 SEV_FEATURES 位 15（SmtProtection）启用 SMT 保护特性。SMT 保护特性的支持由 CPUID Fn8000_001F_EAX [25](https://bbs.kanxue.com/SmtProtection) =1 指示。

当 hypervisor 执行 VMRUN 以运行启用 SMT 保护的 SNP-active 客户时，处理器检查兄弟线程是否处于空闲状态且处于主机模式。如果不是，则 VMRUN 以 VMEXIT_IDLE_REQUIRED 错误代码失败。

当线程处于空闲状态且兄弟线程处于启用 SMT 保护的客户模式时，空闲状态的线程在接收到唤醒事件（如中断）时不会立即退出空闲状态。相反，处理器使用 IDLE_WAKEUP_ICR MSR 值写入 APIC ICR 寄存器，并保持空闲状态直到兄弟线程进入主机模式。写入只执行一次，且仅在启用 x2APIC 模式时。建议 hypervisor 软件编程 IDLE_WAKEUP_ICR 值以向兄弟线程发送 IPI，从而强制其进入主机模式。

IDLE_WAKEUP_ICR MSR（C001_0137h）与 x2APIC 中断命令寄存器（ICR）MSR 具有相同的布局和访问属性（见第 16.13 节）。

### 15.36.18 安全 TSC（Secure TSC）

SNP-active 客户可以选择通过 SEV_FEATURES 位 9（SecureTscEn）启用安全 TSC 特性。启用后，Secure TSC 改变客户通过 TSC MSR、RDTSC 或 RDTSCP 指令读取时间戳计数器时的客户视图。TSC 值首先使用 VMSA 中的 GUEST_TSC_SCALE 值缩放，然后与 VMSA GUEST_TSC_OFFSET 值相加。P0 频率、TSC_RATIO（C001_0104h）和 TSC_OFFSET（VMCB 偏移 50h）值不用于计算。

GUEST_TSC_SCALE 是 8.32 定点二进制数，由 8 位整数和 32 位小数组成。AMD-SP SEV-SNP ABI 规范提供有关 Secure TSC 特性和 GUEST_TSC_SCALE 初始化的附加信息。

启用 Secure TSC 运行的客户可以读取 GUEST_TSC_FREQ MSR（C001_0134h），它返回客户 TSC 视图的有效频率（MHz）。此 MSR 是只读的，在启用 Secure TSC 的客户之外写入 MSR 或读取它会导致 #GP(0) 异常。

启用 Secure TSC 运行的客户预期不执行对 TSC MSR（10h）的写入。如果发生此类写入，后续读取的 TSC 值未定义。

### 15.36.19 SEV-SNP 指令虚拟化（SEV-SNP Instruction Virtualization）

启用 SEV-SNP 时，hypervisor 使用 RMPUPDATE 和 PSMASH 指令修改 RMP。在嵌套虚拟化用例中，当 hypervisor 作为客户运行时，这些指令应分别替换为 WRMSR VIRT_RMPUPDATE MSR（C001_F001h）和 WRMSR VIRT_PSMASH MSR（C001_F002h）。VIRT_RMPUPDATE MSR、VIRT_PSMASH MSR 和报告 VIRT_RMPUPDATE 与 VIRT_PSMASH MSR 支持的 CPUID Fn8000_001F_EAX\[NestedVirtSnpMsr\]（位 29）不在处理器中实现，预期由顶级 hypervisor 模拟。

VIRT_RMPUPDATE MSR 输入约定：

-   RAX：4KB 对齐的 GPA
-   RDX：新 RMP 条目，字节 7:0
-   R8：新 RMP 条目，字节 15:8

VIRT_RMPUPDATE MSR 输出约定：

-   RAX：RMPUPDATE 返回代码

VIRT_PSMASH MSR 输入约定：

-   RAX：2MB 对齐的 GPA

VIRT_PSMASH MSR 输出约定：

-   RAX：PSMASH 返回代码

### 15.36.20 允许的 SEV 特性（Allowed SEV Features）

hypervisor 可以使用 Allowed SEV Features 强制在 SEV-SNP VM 中可以启用哪些 SEV 特性。Allowed SEV Features 支持由 CPUID Fn8000_001F_EAX\[AllowedSevFeatures\]（位 27）= 1 指示。当 VMCB 中偏移 138h 的位 63 设置为 1 时，启用 Allowed SEV Features Mask。hypervisor 可以通过将相应的 ALLOWED_SEV_FEATURES_MASK 位设置为 1 来允许特定特性，通过将相应位设置为 0 来禁止特定特性，其中 ALLOWED_SEV_FEATURES_MASK 位 61:0 对应于 VMSA SEV_FEATURES 位 61:0。

某些 SEV 特性只有在 Allowed SEV Features Mask 启用且掩码配置为允许相应特性时才能使用。如果未启用 Allowed SEV Features Mask，这些特性不可用（见附录 B 表 B-4 中的 SEV_FEATURES）。

启用 Allowed SEV Features Mask 时，VMRUN 指令检查在 VMSA 偏移 3B0h 中设置的所有 SEV_FEATURES 位是否也在 ALLOWED_SEV_FEATURES_MASK 中设置。如果不是，VMRUN 以 VMEXIT_INVALID 错误代码失败。在 #VMEXIT 时，SEV_FEATURES 保存到 VMCB 偏移 140h 的 GUEST_SEV_FEATURES 字段。

### 15.36.21 安全 AVIC（Secure AVIC）

Secure AVIC 特性为性能敏感的 APIC 访问提供硬件加速，并支持管理 SEV-SNP 客户的客户拥有的 APIC 状态。Secure AVIC 还通过限制可以注入 SEV-SNP 客户的事件，提供旨在帮助防止恶意注入攻击的安全保护。

#### 15.36.21.1 启用 Secure AVIC（Enabling Secure AVIC）

Secure AVIC 的硬件支持由 CPUID Fn8000_001F_EAX\[SecureAvic\]（位 26）= 1 指示。当设置 SecureAvic（SEV_FEATURES 中的位 16）时选择 Secure AVIC 模式。在 Secure AVIC 模式下，客户可以设置 SecureAvicEn（Secure AVIC Control MSR 中的位 0）以启用客户 APIC 后备页和完整 Secure AVIC 能力。此特性的启用还额外取决于 VMCB 中 ALLOWED_SEV_FEATURES_MASK 的值（见第 N 页"允许的 SEV 特性"第 15.36.20 节）。

Secure AVIC 特性仅支持 x2APIC MSR 接口。

#### 15.36.21.2 VMRUN 和 #VMEXIT

Secure AVIC 模式与 Restricted Injection、Alternate Injection 和 hypervisor 控制的 AVIC 模式互斥。如果 SecureAvic 位设置为 1，且 VMCB 中的 AVIC Enable 位设置为 1，或 SEV_FEATURES 中的 RestrictedInjection 或 AlternateInjection 位设置为 1，则 VMRUN 将以 #VMEXIT(VMEXIT_INVALID) 失败。

VMRUN 指令从 VMSA 偏移 320h 加载 Secure AVIC Control MSR。如果 SecureAvicEn 设置为 1 且 GuestApicBackingPagePtr 不是有效的客户物理地址，则 VMRUN 将以 #VMEXIT(VMEXIT_INVALID) 失败。

为 Secure AVIC 模式操作从 VMCB 和 VMSA 加载的中断控制信息与 Alternate Injection 模式加载的信息相同。当 SecureAvicEn 位设置为 1 时，从 VMSA 加载的虚拟 INTR 和虚拟 VNMI 信息被忽略，而是按如下方式确定：

-   Guest APIC Backing 页中的 IRR 字段更新为 hypervisor 希望注入的 IRR。如果设置了 UpdateIRR 位，则客户控制的 AllowedIRR 掩码与主机控制的 RequestedIRR 进行逻辑与，然后逻辑或到 Guest APIC Backing 页中的 IRR 字段。256 位 AllowedIRR 向量在客户后备页中以八个 32 位寄存器指定，其中 Guest Allowed IRR 位 n 位于偏移（204h + n / 32）处的位位置（n modulo 32）。RequestedIRR 在 VMCB 偏移 150h 指定。
-   评估 Guest AVIC Backing 页，并在硬件中更新 V_IRQ、V_INTR_PRIO、V_IGN_TPR 和 V_INTR_VECTOR 字段。
-   如果 VMSA 中客户控制的 V_NMI 位已设置，或 VMCB 中客户控制的 AllowedNMI 和主机控制的 V_NMI 均已设置，或 Guest APIC Backing 页中的 NmiReq（偏移 278h，位 0）已设置，则在硬件中设置 V_NMI 位。

设置 SecureAvicEn 时，Guest APIC Backing 页中的 NmiReq 被清除，VMCB 中的 UpdateIRR 和 RequestedIRR 字段被 VMRUN 指令清除为 0。

在指示支持 Secure AVIC 的处理器上，如果 VIntrCtrl VMSA 字段中的 BUSY 位设置为 1，则对 SEV-ES 或 SEV-SNP 客户的 VMRUN 将以 VMEXIT_BUSY 错误代码失败。

在 Secure AVIC 模式下发生 VMEXIT 时，客户虚拟中断状态（VIntrCtrl 位 15:0）和 Secure AVIC Control MSR 保存在 VMSA 中。此外，对于向量 3、4 或 29 的软件中断和异常，EXITINTINFO 写入 VMSA 的 EVENTINJ 字段。这使处理器在下一次 VMRUN 时自动重新注入被中断的事件。

在 Secure AVIC 模式下，硬件将物理 INTR、NMI、INIT 和 #MC 事件视为被拦截，无论 VMCB 中相应拦截位的值如何。

#### 15.36.21.3 Secure AVIC Control MSR

Secure AVIC Control MSR 用于在客户中配置 Secure AVIC 特性。Secure AVIC Control MSR（C001_0138）的字段定义如下：

| 位   | 助记符 | 描述  | 访问类型 |
| --- | --- | --- | --- |
| 63:52 | Reserved | 保留  | MBZ |
| 51:12 | GuestApicBackingPagePtr | Guest APIC Backing Page 指针 | R/W |
| 11:2 | Reserved | 保留  | MBZ |
| 1   | AllowedNmi | 允许主机注入 NMI | R/W |
| 0   | SecureAvicEn | Secure Avic 启用 | R/W |

**图 15-32. Secure AVIC Control MSR**

Secure AVIC Control MSR 只能在 Secure AVIC 模式下访问。在非 Secure AVIC 模式下尝试访问它将导致 #GP(0) 异常。

如果写入此 MSR 时 SecureAvicEn 设置为 1 且 Guest APIC Backing Page Pointer 不是有效的客户物理地址，则生成 #GP(0) 异常。

#### 15.36.21.4 Guest APIC Backing Page

客户对本地 APIC 寄存器的访问被重定向到系统内存中的客户 APIC 后备页。客户后备页的 GPA 保存在 VMSA 中，可由客户使用 Secure AVIC Control MSR 控制。

要求在 VMRUN 和 VMEXIT 之间将 vCPU 的客户 APIC 后备页固定在系统内存中，因为启用 secure AVIC 时某些 AVIC 硬件加速序列可能不可重新启动。如果 AVIC 硬件对客户自身后备页的访问导致嵌套页故障，则设置 EXITINFO1 位 63（Not Restartable）（这是自动退出）并设置 VMSA 中的 BUSY 位。如果客户 APIC 后备页未验证（RMP 条目中的 Validated 位为 0），则生成错误代码为 NOT_RESTARTABLE（0x406）的 #VC。此外，如果启用了 ReflectVC，则设置 VMSA 中的 BUSY 位。

出于安全考虑，客户应确保 Guest Backing Page Pointer 映射到加密的客户页。

#### 15.36.21.5 Guest APIC 访问（Guest APIC Accesses）

Secure AVIC 硬件按如下方式处理客户 APIC 访问：

-   **Allow（允许）**：执行后备页访问。
-   **Fault（故障）**：不访问后备页并生成 #VC（NAE）。
-   **Trap（陷阱）**：执行后备页访问并生成 #VC（NAE）。

除中断命令寄存器（ICR）访问外（见表 15-22），APIC 寄存器访问行为对于 Secure AVIC 和 x2AVIC 相同。

当生成 VMEXIT_AVIC_INCOMPLETE_IPI 或 VMEXIT_AVIC_NOACCEL 且启用 ReflectVC 时，设置 VMSA 中的 BUSY 位。

在 Secure AVIC 模式下，MSRPM 中的 x2APIC MSR 拦截被忽略。启用 Secure AVIC 时 x2APIC MSR 访问不被拦截，禁用 Secure AVIC 时总是被拦截。

#### 15.36.21.6 ICR、TPR 和 EOI 访问（ICR, TPR and EOI Accesses）

Secure AVIC 硬件加速自 IPI，特别是 Destination Shorthand（DSH）字段等于 self（01b）的 ICR MSR（830h）写入和 SELF_IPI MSR（83Fh）写入。它更新后备页中的 IRR、评估新 IRR、在中断屏蔽和优先级允许时注入 VINTR，并继续客户代码执行。DSH 字段等于 all including self（10b）、all excluding self（11b）或 target 的 ICR 写入将以非自动退出和 Reason ID 为 Unaccelerated IPI（5）的 AVIC_INCOMPLETE_IPI 退出代码陷阱。在 Secure AVIC 模式下，不使用 Physical APIC ID 和 Logical APIC ID 表。

Secure AVIC 硬件还按 APM 第 2 卷所述加速对 TPR 和 EOI APIC 寄存器的访问。Secure AVIC 对这些寄存器的加速与传统 AVIC 加速相同。

### 15.36.22 分段 RMP（Segmented RMP）

分段 RMP 特性提供一种分配非连续 RMP 内存的方式，以实现更高效的 RMP 布局，并降低 NUMA 系统中的 RMP 访问延迟。

RMP 段对应于系统物理地址范围以及覆盖该段中部分或全部地址的 RMP。RMP 段大小可编程，为各种系统配置提供灵活性。RMP Segment Table 用于指定每个段的 RMP 基址和 RMP 覆盖的内存大小。

#### 15.36.22.1 确定对分段 RMP 的支持（Determining Support for Segmented RMP）

分段 RMP 的硬件支持由 CPUID Fn8000_001F_EAX\[SegmentedRmp\]（位 23）= 1 指示。当支持分段 RMP 时，CPUID Fn8000_0025_EAX 和 CPUID Fn8000_0025_EBX 提供附加的分段 RMP 信息。

段大小指 RMP Segment Table 中一个条目映射的系统物理地址量。（见第 645 页第 15.36.22.3 节"RMP Segment Table"。）最小和最大 RMP 段大小分别从 CPUID Fn8000_0025_EAX\[MinRmpSegSize\]（位 5:0）和 CPUID Fn8000_0025_EAX\[MaxRmpSegSize\]（位 11:6）计算，为 2^(MinRmpSegSize) 和 2^(MaxRmpSegSize) MB。

CPUID Fn8000_0025_EBX\[NumCachedSegments\]（位 9:0）指示硬件缓存的 RMP 段定义数。为获得最佳性能，RMP 段数应小于或等于 NumCachedSegments。

CPUID Fn8000_0025_EBX\[NumSegReduction\]（位 10）指示 RMP Segment Table 定义的 RMP 段数减少。当 NumSegReduction 等于 0 时，最多可以定义 512 个 RMP 段。当 NumSegReduction 等于 1 时，最多可以定义 NumCachedSegments 个段。

#### 15.36.22.2 启用分段 RMP（Enabling Segmented RMP）

Segmented RMP Configuration MSR（C001_0136）用于配置分段 RMP。Segmented RMP Configuration MSR 的字段定义如下：

| 位   | 助记符 | 描述  | 访问类型 |
| --- | --- | --- | --- |
| 63:14 | Reserved | 保留  | MBZ |
| 13:8 | RmpSegSize | RMP 段大小 | R/W |
| 7:1 | Reserved | 保留  | MBZ |
| 0   | SegRmpEn | 分段 RMP 启用 | R/W |

**图 15-33. Segmented RMP Configuration Register**

此寄存器可以在 SYSCFG MSR 中 SecureNestedPagingEn 为 0 时写入。当 SecureNestedPagingEn 为 1 时尝试写入它将导致 #GP(0) 异常。当 SecureNestedPagingEn 为 1 时，此 MSR 为只读。

RmpSegSize 用于确定 RMP 段大小，等于 2^(RmpSegSize)。当 SegRmpEn 为 1 时，RmpSegSize 必须介于 MinRmpSegSize 和 MaxRmpSegSize 之间（含）。尝试将 RmpSegSize 写入不在允许范围内的值将导致 #GP(0) 异常。

启用分段 RMP 时，RMP_BASE MSR 指向 1MB 对齐的内存区域。此区域的前 16KB 用于处理器簿记。此区域的下一个 4KB 包含 RMP Segment Table。此表必须在 SecureNestedPagingEn 设置为 1 之前填充。在 AMD-SP 为 SNP 初始化系统后，软件不能再修改 RMP Segment Table。

当 SecureNestedPagingEn 设置为 1 时检查 RMP_BASE 对齐。如果 SegRmpEn 为 1 且 RMP_BASE 的值不是 1MB 对齐，则生成 #GP(0)。

#### 15.36.22.3 RMP Segment Table

RMP Segment Table（RST）指定每个段的 RMP 以及 RMP 覆盖的系统内存量。

每个 RST 条目具有以下格式：

| 63:52 | 51:20 | 19:0 |
| --- | --- | --- |
| Reserved, MBZ | SegRmpBase | CoveredSize |

**图 15-34. RMP Segment Table Entry**

SegRmpBase 指定此段中 RMP 覆盖内存的 RMP 指针。CoveredSize 字段指示 RMP 覆盖的段大小。RMP 覆盖的段大小以 GB 表示。如果 CoveredSize 等于 0，则此段对应的内存不被 RMP 覆盖。如果覆盖的段大小大于 RMP 段大小，则整个段被 RMP 覆盖。该段的 RMP 大小等于 4MB × CoveredSize。

当 NumSegReduction 等于 0 时，如果表遍历期间相应 RST 条目中的保留位被设置，则生成 #PF 或 VMEXIT_NPF 保留位错误。

当 NumSegReduction 等于 1 且 SecureNestedPagingEn 从 0 变为 1 时，如果定义的 RST 条目的 RMP 不在有效物理地址空间中，则生成 #GP(0)。

启用分段 RMP 时，系统内存中的页在以下情况下具有 RMP 条目：

1.  页地址存在 RST 条目。
2.  RST 条目中的 CoveredSize 不等于 0。
3.  页地址被 SegRmpBase 和 CoveredSize 定义的 RMP 覆盖。

如果页没有 RMP 条目，则它是 Hypervisor-Owned 页。启用分段 RMP 时如何确定 RMP 条目地址的更多详情，请参见 APM 第 3 卷中的 GET_RMP_ENTRY_ADDR 函数。

### 15.36.23 客户拦截控制（Guest Intercept Control）

Guest Intercept Control 特性允许在更高特权 VMPL 执行的 vCPU 拦截并为在更低特权 VMPL 运行的 vCPU 模拟特定事件。

Guest Intercept Control 支持由 CPUID Fn8000_001F\[GuestInterceptCtl\]（位 22）= 1 指示。SEV_FEATURES\[GuestInterceptCtl\]（位 13）可用于在 SEV-SNP 客户中启用 Guest Intercept Control 特性。

指令、异常和中断事件的客户控制拦截由 VMSA 中从偏移 900h 开始的八个 4 字节拦截向量定义。这些字段与 VMCB 中从偏移 0h 开始的主机控制拦截向量具有相同的布局。当 SEV_FEATURES 中设置 GuestInterceptCtl 位时，如果相应的主机控制拦截或客户控制拦截被设置，则指令、异常或中断事件将被拦截。注意，在 SEV-ES 和 SEV-SNP 客户中，CPUID 指令和所有 IO 端口访问被无条件拦截。

特定 MSR 的客户控制 MSR 拦截由 VMSA 中从偏移 920h 开始的四个 8 字节拦截向量定义。（见第 769 页表 B-2。）对于每个 MSR，为读和写访问定义两位，其中两位的 lsb 是读 MSR 拦截，msb 是写 MSR 拦截。（见附录 B.1"Guest MSR Intercepts"第 780 页。）如果给定 MSR 设置了相应拦截位，则 RDMSR 或 WRMSR 指令将被拦截。除非另有明确说明，如果 MSR 在这些 VMSA 向量中没有定义的拦截位，则 RDMSR 或 WRMSR 指令将被无条件拦截。客户控制的 MSR 拦截独立于第 539 页第 15.11 节"MSR 拦截"中定义的主机控制 MSR 拦截。RDMSR 或 WRMSR 指令将按相应主机控制或客户控制拦截的指示被拦截。任何未定义的客户控制 MSR 拦截位应在 VM 创建期间初始化为 1。

在 Secure AVIC 模式下，x2APIC MSR 不受客户拦截控制特性约束。

## 15.37 推测控制虚拟化（Speculation Control Virtualization）

本节描述 SVM 对推测控制虚拟化的支持。

### 15.37.1 SPEC_CTRL 虚拟化（SPEC_CTRL Virtualization）

hypervisor 可以对客户执行施加推测控制，或者客户可以施加自己的推测控制。因此，处理器实现主机和客户 SPEC_CTRL 寄存器。SPEC_CTRL 虚拟化的支持由 CPUID Fn8000_000A_EDX\[SpecCtrl\]（位 20）= 1 指示。

在主机模式下，主机 SPEC_CTRL 值生效，写入更新主机 SPEC_CTRL 寄存器。在 VMRUN 时，处理器从 VMCB 或 VMSA 加载客户 SPEC_CTRL 寄存器值。对于大多数客户，处理器行为由两个寄存器的逻辑或控制。当客户写入 SPEC_CTRL 时，客户寄存器被更新。在 VMEXIT 时，客户值保存到 VMCB 或 VMSA，只有主机 SPEC_CTRL 生效。

对于启用 BTB 隔离的 SNP-active 客户（见第 637 页"侧信道保护"第 15.36.17 节），由 SPEC_CTRL\[IBRS\] 或 EFER\[AIBRSE\] 控制的主机 IBRS 值不影响客户 IBRS。

### 15.37.2 ERAPS 虚拟化（ERAPS Virtualization）

如果 CPUID Fn8000_0021_EAX\[ERAPS\]（位 24）= 1，hypervisor 可以控制客户中的返回地址预测器配置。

VMCB 中的 ALLOW_LARGER_RAP 位（偏移 58h，位 40）控制客户中的返回地址预测器大小。如果设置为 0，客户中的返回地址预测器大小为 32。如果 ALLOW_LARGER_RAP 设置为 1，客户中的返回地址预测器大小具有默认值，等于 CPUID Fn8000_0021_EBX\[RapSize\]。RapSize 总是等于或大于 32。

VMCB 中的 CLEAR_RAP 位（偏移 58h，位 41）控制返回地址预测器清除。如果在 VMRUN 时设置为 1，处理器在进入客户模式之前清除返回地址预测器。

## 15.38 基于指令的采样虚拟化（Instruction-Based Sampling Virtualization）

基于指令的采样（IBS）虚拟化的硬件支持，对 SEV-ES 和 SEV-SNP 客户由 CPUID Fn8000_001F_EAX\[IbsVirtGuestCtl\]（位 19）= 1 报告，对所有其他客户由 CPUID Fn8000_000A_EDX\[IbsVirt\]（位 26）= 1 报告。对于 SEV-ES 和 SEV-SNP 客户，当 VMSA 中 SEV_FEATURES 的位 12 设置为 1 时启用 IBS 虚拟化；对于所有其他客户，当 VMCB 中偏移 B8h 的位 2 设置为 1 时启用。

当对启用 IBS 虚拟化的 SEV-ES 或 SEV-SNP 客户执行 VMRUN 时，IbsFetchCtl\[IbsFetchEn\] 和 IbsOpCtl\[IbsOpEn\] MSR 位必须为 0。如果这些位中任一不为 0，则 VMRUN 将以 VMEXIT_INVALID 错误代码失败。对于所有其他客户，如果启用了 IBS 虚拟化，IbsFetchCtl\[IbsFetchEn\] 和 IbsOpCtl\[IbsOpEn\] MSR 位应为零，以防止主机 IBS 中断在跨世界切换时泄漏。

启用 IBS 虚拟化时，VMCB 和 VMSA 状态保存区中的以下字段保存客户 fetch 和 op IBS 寄存器值：

-   IBS_FETCH_CTL — IbsFetchCtl MSR
-   IBS_FETCH_LINADDR — IbsFetchLinAd MSR
-   IBS_OP_CTL — IbsOpCtl MSR
-   IBS_OP_RIP — IbsOpRip MSR
-   IBS_OP_DATA — IbsOpData1 MSR
-   IBS_OP_DATA2 — IbsOpData2 MSR
-   IBS_OP_DATA3 — IbsOpData3 MSR
-   IBS_DC_LINADDR — IbsDcLinAd MSR
-   IBS_BRTGT_RIP — IbsBrTarget MSR
-   IBS_FETCH_EXTD_CTL — IbsFetchExtdCtl MSR
-   IBS_FETCH_CTL2 — IbsFetchCtl2 MSR
-   IBS_OP_CTL2 — IbsOpCtl2 MSR
-   IBS_BUFFER_BASE — IbsBufferBase MSR
-   IBS_BUFFER_SIZE — IbsBufferSize MSR
-   IBS_BUFFER_TAIL — IbsBufferTail MSR

启用 IBS 虚拟化时，客户不能从 IbsFetchPhysAd MSR 或 IbsDcPhysAd MSR 读取物理地址。两个寄存器在客户读取时都返回零，相应的有效位 IbsFetchCtl\[IbsPhyAddrValid\] 和 IbsOpData3\[IbsDcPhyAddrValid\] 分别返回零。客户内对 IbsFetchPhysAd MSR 和 IbsDcPhysAd MSR 的写入被忽略。

IBS 虚拟化需要使用 AVIC（见第 585 页"高级虚拟中断控制器"第 15.29 节）或 NMI 虚拟化（见第 557 页"NMI 虚拟化"第 15.21.10 节）来在客户中投递来自 IBS 硬件的虚拟化中断。没有虚拟化中断投递，客户中发生的 IBS 中断将不会投递给客户或 hypervisor。启用 AVIC 时，IBS LVT 条目（Extended Interrupt 0 LVT）的消息类型应编程为 INTR 或 NMI。

## 15.39 性能监控计数器虚拟化（Performance Monitoring Counter Virtualization）

性能监控计数器（PMC）虚拟化的硬件支持，对 SEV-ES 和 SEV-SNP 客户由 CPUID Fn8000_001F_EAX\[PmcVirtGuestCtl\]（位 20）= 1 报告，对所有其他客户由 CPUID Fn8000_000A_EDX\[PmcVirt\]（位 8）= 1 报告。对于 SEV-ES 和 SEV-SNP 客户，当 VMSA 中 SEV_FEATURES 的位 11 设置为 1 时启用 PMC 虚拟化；对于所有其他客户，当 VMCB 中偏移 B8h 的位 3 设置为 1 时启用。此特性的启用还额外取决于 VMCB 中 ALLOWED_SEV_FEATURES_MASK 的值（见第 N 页"允许的 SEV 特性"第 15.36.20 节）。

启用 PMC 虚拟化时，VMCB 和 VMSA 状态保存区中分配以下字段以保存客户 PMC 寄存器值：

-   PERF_CTLn — PerfEvtSeln MSR，n = 0 到 5
-   PERF_CTRn — PerfCtrn MSR，n = 0 到 5
-   INSTR_RETIRED_CTR — IRPerfCount MSR
-   PERF_CTR_GLOBAL_STS — PerfCntGlobalStatus MSR
-   PERF_CNT_GLOBAL_CTL — PerfCntGlobalCtl MSR

如果 hypervisor 未在 VMCB 中启用 PMC 虚拟化，但 SEV-ES 或 SEV-SNP 客户在 VMSA 中启用了它，则 VMSA 中每个 PERF_CTRn 位 22（PMC 启用）和 PERF_CNT_GLOBAL_CTL 位 5:0（全局 PMC 启用）必须为 0。如果这些位中任一不为 0，则 VMRUN 将以 VMEXIT_INVALID_PMC 错误代码失败。

PMC 虚拟化需要使用 AVIC（见第 562 页"高级虚拟中断控制器"第 15.29 节）或 NMI 虚拟化（见第 535 页"NMI 虚拟化"第 15.21.10 节）来在客户中投递来自 PMC 硬件的虚拟化中断。没有虚拟化中断投递，客户中发生的 PMC 中断将不会投递给客户或 hypervisor。启用 AVIC 时，Performance Counter LVT 条目的消息类型应编程为 INTR 或 NMI。

[回复或点赞可查看完整内容](#quick_reply_form)
