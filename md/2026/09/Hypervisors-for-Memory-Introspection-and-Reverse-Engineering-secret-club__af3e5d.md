---
title: Hypervisors for Memory Introspection and Reverse Engineering | secret club
source: https://secret.club/2025/06/02/hypervisors-for-memory-introspection-and-reverse-engineering.html
source_host: secret.club
clip_date: 2026-09-09T00:17:35+08:00
trace_id: b282e0c5-5066-4410-8099-6e07abaea0ff
content_hash: 149c6c9c049275d7489411e0de100776eeb128c5dade4879f19d410568c0124a
status: synced
tags:
  - Windows逆向
  - 内核
series: null
feed_source: secret.club
ai_summary: 基于Rust的两个Windows hypervisor项目（illusion-rs与matrix-rs）利用EPT影子页和VM-exit，在不修改guest内存的情况下实现隐蔽的内核函数钩取与内存内省。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 3d575244-d011-810f-9bd5-def730cf1646
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 基于Rust的两个Windows hypervisor项目（illusion-rs与matrix-rs）利用EPT影子页和VM-exit，在不修改guest内存的情况下实现隐蔽的内核函数钩取与内存内省。
> 
> - **两大项目定位：** illusion-rs是UEFI固件级hypervisor，使用单EPT/每逻辑处理器，早期boot阶段以`VMCALL`+MTF单步回放做syscall hook；matrix-rs是Windows内核驱动级hypervisor，使用双EPT模型，通过`INT3`断点与动态EPTP切换重定向执行。
> - **Hook安装时机：** 必须先等SSDT初始化完成，才能安全安装hook；原文以Windows 11 build 26100上`KiInitializeKernel -> KeCompactServiceTable -> KiSetCacheInformation -> CPUID`调用链作为可靠触发点，Intel走`cpuid(4,0)`，AMD依TopologyExtensions条件走`cpuid(0x8000001D,0)`，两个项目现有实现误用`cpuid(2,0)`。
> - **EPT hook主流程：** 把目标函数所在的2MB大页拆成4KB页，分配shadow page并复制原页，在shadow副本的函数偏移处写入`VMCALL`/`INT3`等内联detour，再将原guest页EPT权限置为只读写、去除执行位，执行`INVEPT`刷新缓存；访问原页触发EPT violation后，由hypervisor把执行切到shadow副本并将RIP交给handler。
> - **架构取舍：** per-core EPT（Illusion）提供细粒度每CPU控制，但每次hook变化都需在各逻辑处理器执行`INVEPT`且维护复杂；共享EPT（Matrix）实现简单、全局一致，但跨CPU存在race条件；Matrix示例展示hook执行结束通过trampoline把控制流还给`MmIsAddressValid`/`NtCreateFile`原函数。
> - **对抗与可用性：** 这种技术不修改guest内存、不依赖未文档化内部，可规避PatchGuard；但可从用户态用RDTSC计时、CPUID执行耗时、CR3 trashing、页表一致性检查等手段检测；VBS/Intel VT-rp等防御会显著提高自建hypervisor做EPT hook的难度。

## Introduction

In this article, we explore the design and implementation of Rust-based hypervisors for memory introspection and reverse engineering on Windows. We cover two projects - [illusion-rs](https://github.com/memN0ps/illusion-rs), a UEFI-based hypervisor, and [matrix-rs](https://github.com/memN0ps/matrix-rs), a Windows kernel driver-based hypervisor. Both leverage Extended Page Tables (EPT) to implement stealthy control flow redirection without modifying guest memory.

We begin by identifying how to reliably detect when the System Service Descriptor Table (SSDT) is fully initialized within `ntoskrnl.exe`, allowing hooks to be safely installed without risking a system crash. Illusion and Matrix differ in how they trigger and redirect execution. Illusion uses a single EPT and in-place patching with VM-exit instructions like `VMCALL`, combined with `Monitor Trap Flag (MTF)` stepping to replay original bytes safely. In contrast, Matrix uses a dual-EPT model where the primary EPT maps read/write memory and the secondary EPT remaps execute-only shadow pages containing trampoline hooks. Execution is redirected using `INT3` breakpoints and dynamic EPTP switching during EPT violations. Both approaches hide inline hooks from guest virtual memory and redirect execution flow to attacker-controlled code - such as shellcode or handler functions - using EPT-based remapping and VM-exits triggered by CPU instructions like `INT3`, `VMCALL`, or `CPUID`.

In hypervisor development, shadowing refers to creating a second, hypervisor-controlled view of guest memory. When a page is shadowed, the hypervisor creates a duplicate of the original page - typically referred to as a shadow page - and updates the EPT to redirect access to this copy. This allows the hypervisor to intercept, monitor, or redirect memory accesses without modifying the original guest memory. Shadowing is commonly used to inject hooks, conceal modifications, or control execution flow at a fine-grained level. The guest and shadow pages remain distinct: the guest believes it is accessing its own memory, while the hypervisor controls what is actually seen or executed.

We demonstrate how to use execute-only permissions to trap instruction fetches, read/write-only permissions to catch access violations, and shadow pages to inject trampoline redirections. For introspection and control transfer, we rely on instruction-level traps such as `VMCALL`, `CPUID`, and `INT3`, depending on the context. In Illusion, instruction replay is handled via `Monitor Trap Flag (MTF)` single-stepping to safely restore overwritten bytes.

While these techniques are well-known in the game hacking community, they remain underutilized in infosec. This article aims to bridge that gap by providing a practical, reproducible walkthrough of early boot-time and kernel-mode EPT hooking techniques. All techniques used are public, stable, and do not rely on undocumented internals or privileged SDKs.

The approach taken prioritizes minimalism and reproducibility. We assume readers have a working understanding of paging, virtual memory, and the basics of Intel VT-x and EPT. While some concepts may apply to AMD SVM and NPT, this article focuses exclusively on Intel platforms. Both hypervisors avoid modifying guest memory entirely, preserving system integrity and navigating around kernel protections like PatchGuard. This enables stealth monitoring of functions like `NtCreateFile` and `MmIsAddressValid` from outside the guest’s control using EPT-backed remapping.

### Table of Contents

-   [Illusion: UEFI-Based Hypervisor with EPT-Based Hooking](#illusion-uefi-based-hypervisor-with-ept-based-hooking)
    -   [Setting up IA32_LSTAR MSR hook during Initialization (`initialize_shared_hook_manager()`)](#setting-up-ia32_lstar-msr-hook-during-initialization-initialize_shared_hook_manager)
    -   [Setting Kernel Image Base Address and Size (`set_kernel_base_and_size()`)](#setting-kernel-image-base-address-and-size-set_kernel_base_and_size)
    -   [Detecting When SSDT Is Loaded Inside `ntoskrnl.exe`](#detecting-when-ssdt-is-loaded-inside-ntoskrnlexe)
        -   [On Intel processors, the execution path is reliable (verified via Binary Ninja analysis on Windows 11 build 26100):](#on-intel-processors-the-execution-path-is-reliable-verified-via-binary-ninja-analysis-on-windows-11-build-26100)
        -   [On AMD processors, the path is conditional (verified via Binary Ninja analysis on Windows 11 build 26100):](#on-amd-processors-the-path-is-conditional-verified-via-binary-ninja-analysis-on-windows-11-build-26100)
    -   [Setting Up EPT Hooks (`handle_cpuid()`)](#setting-up-ept-hooks-handle_cpuid)
    -   [Resolving Targets and Dispatching Hooks (`manage_kernel_ept_hook()`)](#resolving-targets-and-dispatching-hooks-manage_kernel_ept_hook)
    -   [Second-Level Address Translation (SLAT): EPT (Intel) and NPT (AMD)](#second-level-address-translation-slat-ept-intel-and-npt-amd)
    -   [EPT Hooking Overview (`build_identity()`)](#ept-hooking-overview-build_identity)
        -   [Installing the Hook Payload (`ept_hook_function()`)](#installing-the-hook-payload-ept_hook_function)
        -   [Mapping the Large Page (`map_large_page_to_pt()`)](#mapping-the-large-page-map_large_page_to_pt)
        -   [Step 1 - Splitting the Page (`is_large_page()` -> `split_2mb_to_4kb()`)](#step-1---splitting-the-page-is_large_page---split_2mb_to_4kb)
        -   [Shadowing the Page (`is_guest_page_processed()` -> `map_guest_to_shadow_page()`)](#shadowing-the-page-is_guest_page_processed---map_guest_to_shadow_page)
        -   [Step 2 - Cloning the Code (`unsafe_copy_guest_to_shadow()`)](#step-2---cloning-the-code-unsafe_copy_guest_to_shadow)
        -   [Step 3 - Installing the Inline Hook](#step-3---installing-the-inline-hook)
        -   [Step 4 - Revoking Execute Rights (`modify_page_permissions()`)](#step-4---revoking-execute-rights-modify_page_permissions)
        -   [Step 5 - Invalidating TLB and EPT Caches (`invept_all_contexts()`)](#step-5---invalidating-tlb-and-ept-caches-invept_all_contexts)
        -   [Step 6 and 7 - Catching Execution with EPT Violations (`handle_ept_violation()`)](#step-6-and-7---catching-execution-with-ept-violations-handle_ept_violation)
        -   [Step 8 - Handling VMCALL Hooks (`handle_vmcall()`)](#step-8---handling-vmcall-hooks-handle_vmcall)
        -   [Step 9 - Single-Stepping with Monitor Trap Flag (`handle_monitor_trap_flag()`)](#step-9---single-stepping-with-monitor-trap-flag-handle_monitor_trap_flag)
        -   [Catching Read/Write Violations (`handle_ept_violation()`)](#catching-readwrite-violations-handle_ept_violation)
    -   [Illusion Execution Trace: Proof-of-Concept Walkthrough](#illusion-execution-trace-proof-of-concept-walkthrough)
        -   [Controlling EPT Hooks via Hypercalls](#controlling-ept-hooks-via-hypercalls)
-   [Matrix: Windows Kernel Driver-Based Hypervisor Using Dual EPT](#matrix-windows-kernel-driver-based-hypervisor-using-dual-ept)
    -   [Initializing Primary and Secondary EPTs (`virtualize_system()`)](#initializing-primary-and-secondary-epts-virtualize_system)
    -   [Step 1 and 2 - Creating Shadow Hooks and Setting Up Trampolines (`hook_function_ptr()`)](#step-1-and-2---creating-shadow-hooks-and-setting-up-trampolines-hook_function_ptr)
    -   [Step 3, 4, 5 and 6 - Dual-EPT Remapping for Shadow Execution (`enable_hooks()`)](#step-3-4-5-and-6---dual-ept-remapping-for-shadow-execution-enable_hooks)
    -   [Step 7 - Configuring VMCS for Breakpoint VM-Exits (`setup_vmcs_control_fields()`)](#step-7---configuring-vmcs-for-breakpoint-vm-exits-setup_vmcs_control_fields)
    -   [Step 8 - Handling EPT Violations with Dynamic EPTP Switching (`handle_ept_violation()`)](#step-8---handling-ept-violations-with-dynamic-eptp-switching-handle_ept_violation)
    -   [Step 9 - Redirecting Execution via Breakpoint Handlers (`handle_breakpoint_exception()`)](#step-9---redirecting-execution-via-breakpoint-handlers-handle_breakpoint_exception)
    -   [Step 10 - Returning via Trampoline to Original Guest Function (`mm_is_address_valid()` and `nt_create_file()`)](#step-10---returning-via-trampoline-to-original-guest-function-mm_is_address_valid-and-nt_create_file)
    -   [Matrix Execution Trace: Proof-of-Concept Walkthrough](#matrix-execution-trace-proof-of-concept-walkthrough)
-   [Hook Redirection Techniques: INT3, VMCALL, and JMP](#hook-redirection-techniques-int3-vmcall-and-jmp)
-   [Hypervisor Detection Vectors](#hypervisor-detection-vectors)
-   [Appendix](#appendix)
-   [Conclusion](#conclusion)
    -   [Acknowledgments, References, and Inspirations](#acknowledgments-references-and-inspirations)
        -   [Articles, Tools, and Research References](#articles-tools-and-research-references)
        -   [Community Research and Inspirations](#community-research-and-inspirations)
        -   [Acknowledgments](#acknowledgments)
        -   [Documentation and Specifications](#documentation-and-specifications)

## Illusion: UEFI-Based Hypervisor with EPT-Based Hooking

[Illusion](https://github.com/memN0ps/illusion-rs) is a UEFI-based hypervisor designed for early boot-time memory introspection and syscall hooking. It was developed after [matrix-rs](https://github.com/memN0ps/matrix-rs), with a simpler design, better structure, and a focus on controlling execution without touching guest memory.

Unlike matrix, which operates from kernel mode with dual-EPT support shared across all logical processors, illusion runs from UEFI firmware and uses a single EPT per-logical processor to shadow and detour guest execution. Some hypervisors extend this design further by using one, two, three, or more EPTs - for example, maintaining separate EPTs for different execution stages or process contexts. Others also implement per-logical processor EPT isolation for tighter control. Hooks in illusion are applied using execute-only shadow pages combined with `VMCALL` and `Monitor Trap Flag (MTF)` single-stepping for memory introspection. While Illusion prioritizes early boot visibility and minimal guest interference, it also supports runtime control via user-mode `CPUID` hypercalls. As with all EPT-based hooking techniques, the architecture comes with trade-offs in design, maintainability, complexity, and detection risk - but those nuances are out of scope for this post.

The following diagram shows how this technique is implemented in the [illusion-rs](https://github.com/memN0ps/illusion-rs) hypervisor, specifically how EPT is used to hook kernel memory. While in this example it’s applied early in the boot process, the same hooking logic can also be triggered later - such as from user-mode - if the hypervisor is signaled to enable or disable the hooks.

![EPT Hooking Flow Diagram - Illusion Hypervisor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d5784631dce52e55.png) **Figure 1: Control flow of EPT-based function hooking in the Illusion UEFI hypervisor**

Each step shown in the diagram is explained in detail in the sections below.

## Setting up IA32_LSTAR MSR hook during Initialization (initialize_shared_hook_manager())

To resolve the physical and virtual base addresses and the size of the Windows kernel, we intercept writes to the `IA32_LSTAR` MSR. This register holds the address of the syscall handler, which Windows sets to its kernel-mode dispatcher, `KiSystemCall64`. When a `WRMSR` VM-exit occurs, we check if the MSR ID corresponds to `IA32_LSTAR`. If so, we extract the MSR value and scan memory backwards from that address to locate the `MZ` signature, which marks the start of the `ntoskrnl.exe` PE image, thereby determining its base virtual address. The purpose of intercepting `IA32_LSTAR` is not to modify syscall behavior, but to reliably extract the kernel’s loaded base address during early boot. It’s a reliable anchor point because Windows always writes to this MSR during early boot to set up `KiSystemCall64`.

It’s important to note that this is not an inline hook - rather, it’s a VM-exit-based intercept triggered by MSR writes. The following code shows how `IA32_LSTAR` interception is applied during hypervisor initialization:

[Code Reference (`hook_manager.rs`)](https://github.com/memN0ps/illusion-rs/blob/3627895c28e271c0b300aa4b363b3d62bd1a407e/hypervisor/src/intel/hooks/hook_manager.rs#L112-L114)

```rust
trace!("Modifying MSR interception for LSTAR MSR write access");
hook_manager
    .msr_bitmap
    .modify_msr_interception(msr::IA32_LSTAR, MsrAccessType::Write, MsrOperation::Hook);
```

## Handling WRMSR to IA32_LSTAR in \[handle_msr_access()\]: Unhook and Call \[set_kernel_base_and_size()\]

When a `WRMSR` VM-exit is triggered by the `IA32_LSTAR` hook during early kernel setup, the `handle_msr_access()` function unhooks the MSR and calls `set_kernel_base_and_size()` to resolve the kernel’s base addresses and size.

[Code Reference (`msr.rs`)](https://github.com/memN0ps/illusion-rs/blob/3627895c28e271c0b300aa4b363b3d62bd1a407e/hypervisor/src/intel/vmexit/msr.rs#L117-L133)

```rust
if msr_id == msr::IA32_LSTAR {
    trace!("IA32_LSTAR write attempted with MSR value: {:#x}", msr_value);
    hook_manager.msr_bitmap.modify_msr_interception(
        msr::IA32_LSTAR,
        MsrAccessType::Write,
        MsrOperation::Unhook,
    );

    hook_manager.set_kernel_base_and_size(msr_value)?;
}
```

At this point in boot, the syscall entry point (`KiSystemCall64`) has been fully resolved by the kernel. We use its address as a scanning base to locate the start of the PE image and compute the physical base of `ntoskrnl.exe`.

## Setting Kernel Image Base Address and Size (set_kernel_base_and_size())

We pass the MSR value to `set_kernel_base_and_size`, which internally calls `get_image_base_address` to scan memory backwards for the `MZ` (`IMAGE_DOS_SIGNATURE`) header. It then uses `pa_from_va_with_current_cr3` to translate the virtual base address to a physical address using the guest’s `CR3`, and finally calls `get_size_of_image` to retrieve the size of `ntoskrnl.exe` from the `OptionalHeader.SizeOfImage` field. These operations are inherently unsafe, so it’s crucial that the correct values are passed in - otherwise, they may lead to a system crash.

[Code Reference (`hook_manager.rs`)](https://github.com/memN0ps/illusion-rs/blob/3627895c28e271c0b300aa4b363b3d62bd1a407e/hypervisor/src/intel/hooks/hook_manager.rs#L149-L155)

```rust
self.ntoskrnl_base_va = unsafe { get_image_base_address(guest_va)? };
self.ntoskrnl_base_pa = PhysicalAddress::pa_from_va_with_current_cr3(self.ntoskrnl_base_va)?;
self.ntoskrnl_size = unsafe { get_size_of_image(self.ntoskrnl_base_pa as _).ok_or(HypervisorError::FailedToGetKernelSize)? } as u64;
```

## Detecting When SSDT Is Loaded Inside ntoskrnl.exe

Before performing EPT-based hooks on kernel functions like `NtCreateFile`, it is important to ensure that the System Service Descriptor Table (SSDT) has been fully initialized by the Windows kernel. Otherwise, a race condition is introduced: if hooks are applied too early, there’s a risk of targeting invalid memory when the hypervisor attempts to resolve function addresses via syscall numbers through the SSDT - a fallback used only when the function is missing from `ntoskrnl.exe` ’s export table. This can result in a system crash. Analysis of execution paths inside `ntoskrnl.exe` revealed a reliable point after SSDT initialization, but still early enough in kernel setup to monitor other software invoking those functions.

Analysis of `KiInitializeKernel` - the core routine responsible for initializing the kernel on each processor - shows that it finalizes the SSDT by invoking `KeCompactServiceTable`. From this point onward, it becomes safe to install hooks. However, a reliable and repeatable trigger is still needed - ideally, any unconditional VM-exit that occurs shortly after `KeCompactServiceTable` is called.

![Call to KeCompactServiceTable and KiSetCacheInformation](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4df6978b143d9ca0.png) **Figure 2: `KeCompactServiceTable()` and `KiSetCacheInformation()` observed in `KiInitializeKernel()` using Binary Ninja, confirming the post-SSDT call sequence.**

This is where `KiSetCacheInformation` becomes useful. It is invoked immediately after SSDT setup and triggers a well-defined sequence that includes `CPUID` instructions. On Intel CPUs, `KiSetCacheInformation` calls `KiSetStandardizedCacheInformation`, which begins issuing `cpuid(4, 0)` to query cache topology. The `CPUID` instruction unconditionally causes a VM-exit on Intel processors, and may cause a VM-exit on AMD processors depending on the intercept configuration, offering a reliable and deterministic point to synchronize EPT hook installation. This makes `CPUID` a convenient instruction to synchronize state transitions or trigger early hypervisor logic without guest cooperation.

![Intel and AMD call paths into KiSetStandardizedCacheInformation with CPUID](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c5185adb6b51a71f.png) **Figure 3: `KiSetCacheInformation()` and `KiSetCacheInformationAmd()` observed in Binary Ninja, both invoking `KiSetStandardizedCacheInformation()` which executes `CPUID` after SSDT setup.**

Historically, Intel systems used the path `KiSetCacheInformation -> KiSetCacheInformationIntel -> KiSetStandardizedCacheInformation`. On recent Windows 10 and 11 builds, the intermediate call to `KiSetCacheInformationIntel` appears to have been removed - `KiSetCacheInformation` now calls `KiSetStandardizedCacheInformation` directly on Intel platforms.

### On Intel processors, the execution path is reliable (verified via Binary Ninja analysis on Windows 11 build 26100):

```
KiInitializeKernel
-> KeCompactServiceTable
-> KiSetCacheInformation
-> KiSetStandardizedCacheInformation
-> cpuid(4, 0)
```

### On AMD processors, the path is conditional (verified via Binary Ninja analysis on Windows 11 build 26100):

-   If bit 22 (`TopologyExtensions`) in `CPUID(0x80000001).ECX` is set:

```
KiInitializeKernel
-> KeCompactServiceTable
-> KiSetCacheInformation
-> KiSetCacheInformationAmd
-> KiSetStandardizedCacheInformation
-> cpuid(0x8000001D, 0)
```

This bit indicates that the processor supports `CPUID(0x8000001D)`, which enumerates cache and topology info in a standardized way. If unset, the OS must fall back to `0x80000005 / 0x80000006`.

-   Otherwise (fallback path without `TopologyExtensions` support):

```
KiInitializeKernel
-> KeCompactServiceTable
-> KiSetCacheInformation
-> KiSetCacheInformationAmd
-> cpuid(0x80000005) and cpuid(0x80000006)
```

Although `cpuid(4, 0)` on Intel and `cpuid(0x8000001D, 0)` on AMD are executed shortly after SSDT setup in tested Windows builds, this hypervisor uses `cpuid(2, 0)` instead. This was a mistake carried over from early development - `cpuid(0x2)` is not part of the same `KiSetCacheInformation()` path and isn’t a deterministic indicator of SSDT completion. It happened to fire reliably during boot on test systems, which made it “good enough” at the time. Since the project is no longer actively maintained, the code was left as-is - but for anyone adapting this for production use, hooking `cpuid(4, 0)` or `cpuid(0x8000001D)` is the correct path.

## Setting Up EPT Hooks (handle_cpuid())

The `CPUID` instruction executes multiple times during early boot, which can lead to redundant VM-exits. To avoid repeated hook setup, the hypervisor uses a `has_cpuid_cache_info_been_called` flag. The hook only needs to run once, after SSDT initialization, making this a straightforward and stable timing marker.

[Code Reference (`cpuid.rs`)](https://github.com/memN0ps/illusion-rs/blob/3627895c28e271c0b300aa4b363b3d62bd1a407e/hypervisor/src/intel/vmexit/cpuid.rs#L126-L148)

```rust
match leaf {
    leaf if leaf == CpuidLeaf::CacheInformation as u32 => {
        trace!("CPUID leaf 0x2 detected (Cache Information).");
        if !hook_manager.has_cpuid_cache_info_been_called {
            hook_manager.manage_kernel_ept_hook(
                vm,
                crate::windows::nt::pe::djb2_hash("NtCreateFile".as_bytes()),
                0x0055,
                crate::intel::hooks::hook_manager::EptHookType::Function(
                    crate::intel::hooks::inline::InlineHookType::Vmcall
                ),
                true,
            )?;
            hook_manager.has_cpuid_cache_info_been_called = true;
        }
    }
}
```

This ensures that we only apply our EPT function hook after the SSDT has been initialized and guarantees that subsequent `CPUID` calls won’t re-trigger the hook logic.

## Resolving Targets and Dispatching Hooks (manage_kernel_ept_hook())

Let’s break down what the `manage_kernel_ept_hook` function does. It manages the installation or removal of an Extended Page Table (EPT) hook on a target kernel function, such as `NtCreateFile`.

The logic is straightforward: given a hashed function name and a syscall number, it first tries to resolve the function’s virtual address using `get_export_by_hash`, which checks the export table of `ntoskrnl.exe`. If that fails, it falls back to resolving the function using its syscall number through the System Service Descriptor Table (SSDT).

If `enable == true`, it calls `ept_hook_function()`, which installs the hook by shadowing the guest memory and modifying EPT permissions - more on this later. If `enable == false`, it calls `ept_unhook_function()` to restore the original mapping and unhook the function.

[Code Reference (`hook_manager.rs`)](https://github.com/memN0ps/illusion-rs/blob/3627895c28e271c0b300aa4b363b3d62bd1a407e/hypervisor/src/intel/hooks/hook_manager.rs#L174-L209)

```rust
pub fn manage_kernel_ept_hook(
    &mut self,
    vm: &mut Vm,
    function_hash: u32,
    syscall_number: u16,
    ept_hook_type: EptHookType,
    enable: bool,
) -> Result<(), HypervisorError> {
    let action = if enable { "Enabling" } else { "Disabling" };
    debug!("{} EPT hook for function: {:#x}", action, function_hash);

    trace!("Ntoskrnl base VA: {:#x}", self.ntoskrnl_base_va);
    trace!("Ntoskrnl base PA: {:#x}", self.ntoskrnl_base_pa);
    trace!("Ntoskrnl size: {:#x}", self.ntoskrnl_size);

    let function_va = unsafe {
        if let Some(va) = get_export_by_hash(self.ntoskrnl_base_pa as _, self.ntoskrnl_base_va as _, function_hash) {
            va
        } else {
            let ssdt_function_address =
                SsdtHook::find_ssdt_function_address(syscall_number as _, false, self.ntoskrnl_base_pa as _, self.ntoskrnl_size as _);
            match ssdt_function_address {
                Ok(ssdt_hook) => ssdt_hook.guest_function_va as *mut u8,
                Err(_) => return Err(HypervisorError::FailedToGetExport),
            }
        }
    };

    if enable {
        self.ept_hook_function(vm, function_va as _, function_hash, ept_hook_type)?;
    } else {
        self.ept_unhook_function(vm, function_va as _, ept_hook_type)?;
    }

    Ok(())
}
```

## Second-Level Address Translation (SLAT): EPT (Intel) and NPT (AMD)

Before we get into the specifics of syscall hooks and memory interception, it’s worth covering how this all works under the hood - especially for readers who aren’t already familiar with memory virtualization.

**Second-Level Address Translation (SLAT)** - also known as nested paging - is a hardware virtualization feature that allows the hypervisor to define a second layer of page translation. The CPU then uses this hypervisor-defined mapping to translate guest physical addresses to host physical addresses without requiring software intervention on each memory access. Second-Level Address Translation (SLAT) introduces an additional layer of address translation between guest physical addresses (GPAs) and host physical addresses (HPAs).

The guest OS configures its own page tables to translate guest virtual addresses (GVAs) to guest physical addresses (GPAs), while the hypervisor configures extended or nested page tables (e.g., EPT or NPT) to translate those GPAs to HPAs. Both stages are carried out by the hardware MMU during memory access, not by software.

The two most common SLAT implementations are Intel’s Extended Page Tables (EPT) under VT-x, and AMD’s Nested Page Tables (NPT) under SVM. These technologies allow guest operating systems to manage their own page tables independently, while the hypervisor handles the second level of memory translation.

To illustrate the first stage of this process - from guest virtual address (GVA) to guest physical address (GPA) - the diagram below shows how a 48-bit x64 virtual address is resolved using traditional paging inside the guest. This is exactly what the guest OS configures, regardless of whether SLAT is enabled.

![x64 Virtual Address Translation](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dbe5a4790fe0f03d.png) **Figure 4: Traditional x64 virtual address translation as performed by the guest OS (source: [Guided Hacking](https://guidedhacking.com/threads/x64-virtual-address-translation.20416/), [YouTube](https://www.youtube.com/watch?v=W3o5jYHMh8s))**

## EPT Hooking Overview (build_identity())

When the hypervisor starts, it sets up Extended Page Tables (EPT) to create a `1:1` identity map - guest physical addresses are mapped directly to the same host physical addresses. This identity mapping allows the guest to run normally, while the hypervisor controls memory access at the page level without interfering with the guest’s own page tables.

The function responsible for setting this up is `build_identity()`. The first 2MB of memory is mapped using 4KB EPT page tables. All remaining guest physical addresses are mapped using 2MB large pages, unless finer granularity is required - such as when placing hooks.

While it’s also possible to use 1GB pages, `illusion-rs` opts for 2MB mappings to simplify EPT management and ensure compatibility with platforms like VMware, which do not support 1GB EPT pages. Since Illusion was tested under VMware, 2MB pages were the most practical choice for early boot introspection and syscall hooking.

[Code Reference (`ept.rs`)](https://github.com/memN0ps/illusion-rs/blob/3627895c28e271c0b300aa4b363b3d62bd1a407e/hypervisor/src/intel/ept.rs#L61-L122)

```rust
/// Represents the entire Extended Page Table structure.
///
/// EPT is a set of nested page tables similar to the standard x86-64 paging mechanism.
/// It consists of 4 levels: PML4, PDPT, PD, and PT.
///
/// Reference: Intel® 64 and IA-32 Architectures Software Developer's Manual: 29.3.2 EPT Translation Mechanism
#[repr(C, align(4096))]
pub struct Ept {
    /// Page Map Level 4 (PML4) Table.
    pml4: Pml4,
    /// Page Directory Pointer Table (PDPT).
    pdpt: Pdpt,
    /// Array of Page Directory Table (PDT).
    pd: [Pd; 512],
    /// Page Table (PT).
    pt: Pt,
}

pub fn build_identity(&mut self) -> Result<(), HypervisorError> {
    let mut mtrr = Mtrr::new();
    trace!("{mtrr:#x?}");
    trace!("Initializing EPTs");

    let mut pa = 0u64;

    self.pml4.0.entries[0].set_readable(true);
    self.pml4.0.entries[0].set_writable(true);
    self.pml4.0.entries[0].set_executable(true);
    self.pml4.0.entries[0].set_pfn(addr_of!(self.pdpt) as u64 >> BASE_PAGE_SHIFT);

    for (i, pdpte) in self.pdpt.0.entries.iter_mut().enumerate() {
        pdpte.set_readable(true);
        pdpte.set_writable(true);
        pdpte.set_executable(true);
        pdpte.set_pfn(addr_of!(self.pd[i]) as u64 >> BASE_PAGE_SHIFT);

        for pde in &mut self.pd[i].0.entries {
            if pa == 0 {
                pde.set_readable(true);
                pde.set_writable(true);
                pde.set_executable(true);
                pde.set_pfn(addr_of!(self.pt) as u64 >> BASE_PAGE_SHIFT);

                for pte in &mut self.pt.0.entries {
                    let memory_type = mtrr
                        .find(pa..pa + BASE_PAGE_SIZE as u64)
                        .ok_or(HypervisorError::MemoryTypeResolutionError)?;
                    pte.set_readable(true);
                    pte.set_writable(true);
                    pte.set_executable(true);
                    pte.set_memory_type(memory_type as u64);
                    pte.set_pfn(pa >> BASE_PAGE_SHIFT);
                    pa += BASE_PAGE_SIZE as u64;
                }
            } else {
                let memory_type = mtrr
                    .find(pa..pa + LARGE_PAGE_SIZE as u64)
                    .ok_or(HypervisorError::MemoryTypeResolutionError)?;

                pde.set_readable(true);
                pde.set_writable(true);
                pde.set_executable(true);
                pde.set_memory_type(memory_type as u64);
                pde.set_large(true);
                pde.set_pfn(pa >> BASE_PAGE_SHIFT);
                pa += LARGE_PAGE_SIZE as u64;
            }
        }
    }

    Ok(())
}
```

This identity map is later used when installing EPT hooks. It allows the hypervisor to shadow guest memory, modify EPT permissions (like making a page execute-only), and safely redirect execution to hook logic - all without modifying guest memory directly.

### Installing the Hook Payload (ept_hook_function())

The `ept_hook_function()` is the heart of the EPT-based function hooking logic in Illusion. This is where a selected guest function is shadowed, modified, and hooked - all without touching the original memory. Execution is redirected by changing EPT permissions to point to a modified shadow page instead of the original, allowing introspection and control without altering guest state.

This section explains what the function does, which internal calls it makes, and why each step is necessary. `Steps 1` through `Step 9` correspond to the diagram shown earlier in the article.

[Code Reference (`hook_manager.rs`)](https://github.com/memN0ps/illusion-rs/blob/3627895c28e271c0b300aa4b363b3d62bd1a407e/hypervisor/src/intel/hooks/hook_manager.rs#L321-L415)

### Mapping the Large Page (map_large_page_to_pt())

We begin by ensuring the 2MB large page that contains the target function is registered in the hypervisor’s internal memory management structures. The `illusion-rs` hypervisor operates with a `1:1` identity mapping between Guest Physical Addresses (GPA) and Host Physical Addresses (HPA), but before any manipulation or permission control can occur, we must first associate this large page with a pre-allocated page table.

These pre-allocated page tables are not allocated dynamically at runtime - instead, a fixed-size pool is reserved at hypervisor startup as part of a pre-allocated heap defined by the user. This memory is shared across all logical processors and is used to back internal structures such as shadow pages and page tables. The heap uses a linked list-based allocator (similar to a classic free-list strategy, not slab or buddy), with allocations performed from a contiguous block of memory (defaulting to 64MB). While the exact number of supported allocations depends on user-defined sizing and workload patterns, all allocations are strictly bounded. If the pool is exhausted, further allocations will fail at the point of use, likely triggering a panic unless explicitly handled.

By calling `map_large_page_to_pt()`, we link the GPA of the large page to a known internal structure, allowing for controlled splitting, shadowing, and permission enforcement. This also makes it easier to track and restore the original page mappings when hooks need to be removed or toggled later.

```rust
self.memory_manager.map_large_page_to_pt(guest_large_page_pa.as_u64())?;
```

### Step 1 - Splitting the Page (is_large_page() -> split_2mb_to_4kb())

When a target function resides within a 2MB large page, changing its permissions would affect the entire region - potentially disrupting unrelated code and triggering VM-exits across the full range. To avoid this, we check if the region is backed by a large page and, if so, split it into 512 individual 4KB entries using a pre-allocated page table. This provides the fine-grained control necessary for isolated function hooking, ensuring only the targeted page generates VM-exits.

```rust
if vm.primary_ept.is_large_page(guest_page_pa.as_u64()) {
    let pre_alloc_pt = self
        .memory_manager
        .get_page_table_as_mut(guest_large_page_pa.as_u64())
        .ok_or(HypervisorError::PageTableNotFound)?;

    vm.primary_ept.split_2mb_to_4kb(guest_large_page_pa.as_u64(), pre_alloc_pt)?;
}
```

### Shadowing the Page (is_guest_page_processed() -> map_guest_to_shadow_page())

Before installing any detours, we first check whether a shadow page has already been allocated and mapped for the target guest page. If a mapping already exists, it means this page was previously processed and no further action is needed. Otherwise, we pull a shadow page from our pre-allocated pool and associate it with the guest page using `map_guest_to_shadow_page()`. This ensures hooks aren’t redundantly reinstalled and prevents multiple shadow pages from being created for the same target. It’s essential for correctness: when a VM-exit occurs due to an EPT violation, we must be able to reliably retrieve the shadow page associated with the faulting guest page.

```rust
if !self.memory_manager.is_guest_page_processed(guest_page_pa.as_u64()) {
    self.memory_manager.map_guest_to_shadow_page(
        guest_page_pa.as_u64(),
        guest_function_va,
        guest_function_pa.as_u64(),
        ept_hook_type,
        function_hash,
    )?;
}
```

### Step 2 - Cloning the Code (unsafe_copy_guest_to_shadow())

Once the shadow page has been allocated and mapped, we clone the guest’s original 4KB page into it using `unsafe_copy_guest_to_shadow()`. This creates a byte-for-byte replica of the guest memory that we can safely modify. Because we perform all modifications in this isolated shadow copy - rather than directly in guest memory - we avoid detection by integrity verification checks like PatchGuard and preserve the original code for future restoration.

```rust
let shadow_page_pa = PAddr::from(
    self.memory_manager
        .get_shadow_page_as_ptr(guest_page_pa.as_u64())
        .ok_or(HypervisorError::ShadowPageNotFound)?,
);

Self::unsafe_copy_guest_to_shadow(guest_page_pa, shadow_page_pa);
```

### Step 3 - Installing the Inline Hook

Once the shadow page is prepared, we compute the exact offset where the target function resides relative to the start of the page. This ensures the hook is applied at the correct instruction boundary. At that offset, we insert an inline detour - typically using a `VMCALL` opcode - which causes a controlled VM-exit whenever the hooked function is executed. This redirection is handled entirely within the hypervisor.

Traditional `JMP` -based hooks are avoided here because the hypervisor operates outside the guest’s address space in a UEFI context. While it is technically possible to inject hook logic into guest memory (as explored in early versions of `illusion-rs`), the EPT + `VMCALL` approach was chosen to keep logic fully on the host side and as a learning experience. For more background on the guest-assisted design, see [Appendix: Guest-Assisted Hooking Model](#appendix-guest-assisted-hooking-model).

```rust
let shadow_function_pa = PAddr::from(Self::calculate_function_offset_in_host_shadow_page(shadow_page_pa, guest_function_pa));

InlineHook::new(shadow_function_pa.as_u64() as *mut u8, inline_hook_type).detour64();
```

### Step 4 - Revoking Execute Rights (modify_page_permissions())

To ensure our detour is triggered, we revoke execute permissions on the guest’s original page via the EPT. This causes any instruction fetch from that page to generate a VM-exit due to an EPT violation. The hypervisor can then handle this event and reroute execution to the shadow page where our hook is installed. Importantly, we retain read and write permissions on the original page to maintain system stability and avoid triggering protection features like PatchGuard.

```rust
vm.primary_ept.modify_page_permissions(
    guest_page_pa.as_u64(),
    AccessType::READ_WRITE,
    pre_alloc_pt,
)?;
```

### Step 5 - Invalidating TLB and EPT Caches (invept_all_contexts())

Once the execute permission is removed from the original guest page and replaced with a shadowed hook, the CPU’s internal caches may still contain stale translations. To ensure the updated EPT mappings take effect immediately, the hypervisor flushes the virtualization translation caches using the `INVEPT` instruction.

```rust
invept_all_contexts();
```

This call performs an `All Contexts` invalidation, instructing the CPU to discard all EPT-derived translations for the current EPT pointer (EPTP). Per Intel’s SDM, this ensures that stale mappings are removed regardless of any associated `VPID` or `PCID` values.

Because EPT translations are cached per logical processor, `INVEPT` must be executed on each vCPU, regardless of whether the hypervisor uses shared or per-core EPTs. Without proper synchronization, race conditions may occur during thread migration or instruction replay, potentially leading to stale mappings and inconsistent hook behavior across cores.

> `INVVPID` is not necessary here. It’s used to invalidate guest-virtual mappings tied to VPIDs, which is unrelated to EPT-based translation. For our use case - modifying guest-physical EPT mappings - `INVEPT` alone is sufficient.

This step completes the hook installation pipeline. From this point forward, the guest kernel continues to operate normally, but any attempt to execute the hooked function will trigger an EPT violation, allowing the hypervisor to intercept the execution path - all without modifying guest memory.

### Step 6 and 7 - Catching Execution with EPT Violations (handle_ept_violation())

After an EPT violation VM-exit occurs, the first step is identifying which page triggered the fault. We read the faulting Guest Physical Address (GPA) from the VMCS and align it to the 4KB and 2MB page boundaries. This lets us resolve which specific page was accessed and prepares us to look it up in the shadow page tracking structures.

[Code Reference (`ept_violation.rs`)](https://github.com/memN0ps/illusion-rs/blob/3627895c28e271c0b300aa4b363b3d62bd1a407e/hypervisor/src/intel/vmexit/ept_violation.rs#L34-L103)

```rust
let guest_pa = vmread(vmcs::ro::GUEST_PHYSICAL_ADDR_FULL);
let guest_page_pa = PAddr::from(guest_pa).align_down_to_base_page();
let guest_large_page_pa = guest_page_pa.align_down_to_large_page();
```

Once we have the faulting guest page address, we retrieve the corresponding shadow page that was previously mapped and prepared during hook installation. This page contains our modified copy of the function with a `VMCALL` detour inserted. Shadow page lookup failures indicate unexpected guest behavior - such as an EPT execute violation without a corresponding shadow mapping - and are treated as fatal errors. If no shadow page is found for the faulting guest page, it likely indicates an unexpected EPT violation not associated with an installed hook. In `illusion-rs`, this condition is treated as a fatal error and terminates VM-exit handling. In a production-grade hypervisor, such cases should be logged and handled more gracefully to detect guest misbehavior, memory tampering, or logic errors in hook tracking.

```rust
let shadow_page_pa = PAddr::from(
    hook_manager
        .memory_manager
        .get_shadow_page_as_ptr(guest_page_pa.as_u64())
        .ok_or(HypervisorError::ShadowPageNotFound)?
);
```

Before deciding how to respond, we inspect the cause of the violation by reading the `EXIT_QUALIFICATION` field. This tells us what kind of access the guest attempted - whether it was trying to read, write, or execute memory - and lets us act accordingly.

```rust
let exit_qualification_value = vmread(vmcs::ro::EXIT_QUALIFICATION);
let ept_violation_qualification = EptViolationExitQualification::from_exit_qualification(exit_qualification_value);
```

If the violation indicates an attempt to execute a non-executable page (i.e., it’s `readable` and `writable` but not `executable`), we swap in our shadow page and mark it as execute-only. This redirects execution to our tampered memory, where the inline hook (e.g., `VMCALL`) resides, allowing the hypervisor to take control.

```rust
if ept_violation_qualification.readable && ept_violation_qualification.writable && !ept_violation_qualification.executable {
    vm.primary_ept.swap_page(guest_page_pa.as_u64(), shadow_page_pa.as_u64(), AccessType::EXECUTE, pre_alloc_pt)?;
}
```

This redirection hands execution over to our shadow page - a byte-for-byte clone of the original memory - where the first few instructions have been overwritten with a `VMCALL`. At this point, guest execution resumes without advancing `RIP`, meaning the CPU re-executes the same instruction - but now from the shadow page. When the CPU reaches the `VMCALL` instruction, it triggers another VM-exit. Because we’ve displaced the function’s original prologue, those instructions must later be restored and replayed under `Monitor Trap Flag (MTF)` single-stepping. In the Matrix Windows kernel driver-based hypervisor, the shadow page contains an `INT3` hook that triggers a VM-exit; the hypervisor sets the guest RIP to the hook handler, performs introspection, and then returns execution via a trampoline. In illusion (a UEFI-based hypervisor), EPT + `MTF` was chosen instead. This allowed execution redirection to occur entirely from host-side logic, as a simpler and educational approach, without requiring guest-mode memory allocation or in-guest control flow setup. (For alternative designs involving guest memory injection, see [Appendix: Guest-Assisted Hooking Model](#appendix-guest-assisted-hooking-model).)

### Step 8 - Handling VMCALL Hooks (handle_vmcall())

The `VMCALL` instruction is inserted by our inline hook as the first instruction in the shadowed function. When executed, it causes an unconditional VM-exit, transferring control to the hypervisor. This lets us detect exactly when the guest invokes the hooked function.

[Code Reference (`vmcall.rs`)](https://github.com/memN0ps/illusion-rs/blob/3627895c28e271c0b300aa4b363b3d62bd1a407e/hypervisor/src/intel/vmexit/vmcall.rs#L37-L99)

We begin by resolving the guest physical page that triggered the `VMCALL`, and check whether it belongs to a shadow page previously registered by the hook manager. If the page is found in our shadow mapping infrastructure, we know execution originated from a function we’ve hooked. This conditional check ensures we’re handling a legitimate hook-triggered exit before proceeding with further memory transitions and state changes. At this point, we know exactly which function was called, and with full control in the hypervisor, we can inspect its arguments, trace its execution, and introspect guest memory or registers as needed.

```rust
let exit_type = if let Some(shadow_page_pa) = hook_manager.memory_manager.get_shadow_page_as_ptr(guest_page_pa.as_u64()) {
    let pre_alloc_pt = hook_manager
        .memory_manager
        .get_page_table_as_mut(guest_large_page_pa.as_u64())
        .ok_or(HypervisorError::PageTableNotFound)?;
```

After completing any introspection or analysis - such as inspecting arguments, tracing execution, or examining guest memory - in the hypervisor, we begin restoring guest state. Specifically, we swap back the original (unmodified) guest page and temporarily restore `READ_WRITE_EXECUTE` permissions. This is required to safely execute the instructions that were originally overwritten by our inline `VMCALL` detour (typically 2 - 5 bytes at the prologue of the target function).

```rust
vm.primary_ept.swap_page(guest_page_pa.as_u64(), guest_page_pa.as_u64(), AccessType::READ_WRITE_EXECUTE, pre_alloc_pt)?;
```

Before enabling `MTF`, we retrieve the hook metadata and determine how many instructions were displaced by the inline `VMCALL`. Simply restoring the page and continuing execution would risk a crash - since the prologue was never executed - and leave the function unmonitored. To prevent this, we need to single-step through the displaced instructions using `MTF`. Before resuming the guest, we initialize a replay counter, set the `Monitor Trap Flag (MTF)`, and disable guest interrupts to prevent unexpected interrupt handling during single-stepping, instruction-by-instruction re-execution. This step sets up the replay process that continues in the next section.

```rust
let instruction_count = HookManager::calculate_instruction_count(...);
vm.mtf_counter = Some(instruction_count);
set_monitor_trap_flag(true);
update_guest_interrupt_flag(vm, false)?;
```

If no shadow mapping is found for the faulting guest page, the `VMCALL` is assumed to be invalid or executed from an unexpected context. To emulate expected CPU behavior, `illusion-rs` injects a `#UD` (undefined instruction) exception, consistent with how the processor handles `VMCALL` outside VMX operation.

### Step 9 - Single-Stepping with Monitor Trap Flag (handle_monitor_trap_flag())

`Monitor Trap Flag (MTF)` enables the hypervisor to single-step through the instructions that were displaced by the inline `VMCALL`. Each instruction executed by the guest causes a VM-exit, at which point we decrement the instruction replay counter.

[Code Reference (`mtf.rs`)](https://github.com/memN0ps/illusion-rs/blob/3627895c28e271c0b300aa4b363b3d62bd1a407e/hypervisor/src/intel/vmexit/mtf.rs#L28-L79)

```rust
*counter = counter.saturating_sub(1);
```

Execution continues one instruction at a time under hypervisor supervision until all overwritten bytes have been replayed. Once the counter reaches zero, we know the prologue has been fully restored. At this point, we reapply the hook by swapping the shadow page back in and setting it as execute-only, ensuring the next invocation of this function once again triggers a `VMCALL`.

```rust
vm.primary_ept.swap_page(guest_pa.align_down_to_base_page().as_u64(), shadow_page_pa.as_u64(), AccessType::EXECUTE, pre_alloc_pt)?;
```

Finally, we disable MTF - by simply omitting `set_monitor_trap_flag(true)` - and re-enable guest interrupts, allowing the guest to resume execution cleanly.

```rust
restore_guest_interrupt_flag(vm)?;
```

This completes the detour cycle. The guest continues uninterrupted, unaware that its control flow was temporarily redirected through our hypervisor.

### Catching Read/Write Violations (handle_ept_violation())

Sometimes, the guest may attempt to read or write from a page that’s currently marked as execute-only. Since EPT enforces strict access permissions, this triggers an EPT violation VM-exit - this time due to a read or write on a page that lacks the appropriate permissions.

[Code Reference (`ept_violation.rs`)](https://github.com/memN0ps/illusion-rs/blob/3627895c28e271c0b300aa4b363b3d62bd1a407e/hypervisor/src/intel/vmexit/ept_violation.rs#L69-L97)

```rust
if ept_violation_qualification.executable && !ept_violation_qualification.readable && !ept_violation_qualification.writable {
    vm.primary_ept.swap_page(guest_page_pa.as_u64(), guest_page_pa.as_u64(), AccessType::READ_WRITE_EXECUTE, pre_alloc_pt)?;
    vm.mtf_counter = Some(1);
    set_monitor_trap_flag(true);
    update_guest_interrupt_flag(vm, false)?;
}
```

To handle this safely, we temporarily restore the original guest page with full read, write, and execute access. This ensures the instruction executes successfully - even if it uses RIP-relative addressing or accesses data on the same page - preventing a VM-exit loop, system crashes, or exposure of the hook. We then enable `Monitor Trap Flag (MTF)` and step forward a single instruction before reapplying the original hook, preserving stealth and stability.

## Illusion Execution Trace: Proof-of-Concept Walkthrough

This Proof-of-Concept (PoC) demonstrates how the Illusion hypervisor integrates early boot-time EPT hooking with a user-mode control channel. After initializing the hypervisor from UEFI, a command-line utility communicates using intercepted `CPUID` instructions to toggle kernel hooks in real-time - without requiring kernel-mode drivers or directly modifying guest virtual or physical memory.

### Controlling EPT Hooks via Hypercalls

Before testing the hook logic, we first launch the hypervisor directly from the UEFI shell. This ensures that the hypervisor is loaded at boot and remains isolated from the Windows kernel.

![Booting Illusion Hypervisor from UEFI Shell](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0bcd75cc9314f7fd.png) **Figure 5: Booting the Illusion hypervisor directly from the UEFI shell**

Once loaded, we can issue commands from user-mode using a simple client. This CLI utility interfaces with a password-protected backdoor exposed by the hypervisor. The communication channel is implemented using the `CPUID` instruction - a widely used and unprivileged x86 instruction that reliably causes a VM-exit when intercepted. Since `CPUID` is an unprivileged instruction available to user-mode, this allows us to implement stealthy hypercalls without needing any kernel-mode components.

![Command-Line Utility Controlling Kernel Hooks](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/22219a0ad1c616cf.png) **Figure 6: Command-line utility controlling kernel hooks via `CPUID` hypercalls**

The client can enable or disable hooks for specific syscall functions (like `NtCreateFile`) in real-time. This is especially useful for introspection tools where the hook lifecycle must be externally controlled.

The image below demonstrates a live EPT hook in action. On the left, we see the hypervisor logs tracking the hook process: the 2MB page is first associated with a pre-allocated page table, then split into 512 individual 4KB entries. A shadow page is pulled from a pre-allocated pool and mapped to the target guest page. The guest’s original 4KB memory is cloned into the shadow page, a `VMCALL` inline hook is inserted, and execute permissions are revoked on the original page. This detour is used to trigger a VM-exit when the function executes. On the right, WinDbg confirms that the shadow-mapped address (`0xab0c360`) correctly contains the `VMCALL` opcode (`0f01c1`), and that the original `NtCreateFile` at `0xfffff8005de16360` remains untouched.

This keeps the hook invisible at the virtual memory level: the original GVA still resolves to the same GPA, but the hypervisor rewires the final mapping to the HPA of the shadow page. From the guest’s typical perspective (unless inspecting physical memory), the memory appears unmodified - yet the hook is live.

![Debug Logs and WinDbg Output Demonstrating Stealth EPT Hook Execution](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e47d05a19ae1d6d5.png) **Figure 7: Debug logs and WinDbg output demonstrating stealth EPT hook execution**

## Matrix: Windows Kernel Driver-Based Hypervisor Using Dual EPT

[Matrix](https://github.com/memN0ps/matrix-rs) is a Windows kernel driver-based hypervisor built for runtime introspection and syscall redirection. It was developed before [illusion-rs](https://github.com/memN0ps/illusion-rs), but explores a different approach: instead of running from firmware, Matrix installs as a Windows driver and operates from kernel mode, leveraging two Extended Page Table (EPT) contexts - one for the original memory and another for shadowed pages that contain hook logic.

Unlike Illusion, which sets up a single EPT and uses MTF-based control at boot, Matrix uses dual EPTs to trap execution dynamically. This allows us to configure execute-only hooks, remap guest pages without modifying them, and control function redirection at runtime. Our implementation toggles between the two EPTs - the primary EPT for normal guest execution, and the secondary EPT for redirected flows - using dynamic EPTP switching triggered by VM-exits. Some hypervisors extend this design by using one, two, three, or more EPTs - for example, maintaining separate EPTs for different execution stages or process contexts. Some implementations also opt for per-logical processor EPT isolation. In contrast, matrix uses a minimal dual-EPT setup shared across all logical processors, focusing on simplicity and testability to demonstrate the core concept.

The diagram below shows how this works in Matrix: original pages lose execute permissions in the primary EPT, and are mirrored in the secondary EPT with `EXECUTE` -only rights, pointing to trampoline logic in a shadow copy. Runtime execution of the target function triggers a VM-exit, which we use to switch contexts and reroute control to the hook handler.

![EPT Hooking Flow Diagram - Illusion Hypervisor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e30f9dac558cd969.png) **Figure 8: Control flow of dual-EPT based function hooking in the Matrix Windows kernel driver-based hypervisor**

Each step shown in the diagram is explained in detail in the sections below.

### Initializing Primary and Secondary EPTs (virtualize_system())

When our kernel-mode driver is loaded, we initialize virtualization by allocating and identity-mapping (`1:1`) two separate EPT contexts: one primary and one secondary. Both are initially set up with full `READ_WRITE_EXECUTE` permissions to mirror guest memory. The primary EPT provides a clean view of guest memory without interference, while the secondary EPT is where we apply shadowed pages for hooks. This dual mapping allows us to selectively redirect execution without touching the original memory, switching between EPTs as needed to trap and analyze function calls.

[Code Reference (`lib.rs`)](https://github.com/memN0ps/matrix-rs/blob/309ac2a0322be5320c80c34f2a631e21a05fcb74/driver/src/lib.rs#L177-L181)

```rust
primary_ept.identity_2mb(AccessType::READ_WRITE_EXECUTE)?;
secondary_ept.identity_2mb(AccessType::READ_WRITE_EXECUTE)?;
```

### Step 1 and 2 - Creating Shadow Hooks and Setting Up Trampolines (hook_function_ptr())

Before enabling virtualization, we prepare our hooks by resolving target functions and setting up detours. We hook two kernel functions: `MmIsAddressValid`, resolved from the export table, and `NtCreateFile`, resolved from the SSDT by syscall number. For each, we create a trampoline to preserve the original prologue and allow clean return after our hook logic executes.

To do this, we copy the page containing the target function into a shadow region, calculate the function’s location within the copied page, and insert an inline `INT3` breakpoint to trigger VM-exits. These hooks are added to our internal hook manager and remain dormant until the dual-EPT remapping is configured. While `illusion-rs` could have used the same approach, it instead uses `VMCALL` - partly to avoid breakpoint exceptions and partly just to try something different from what was already done in `matrix-rs`.

```rust
let mm_is_address_valid =
    Hook::hook_function("MmIsAddressValid", hook::mm_is_address_valid as *const ())
        .ok_or(HypervisorError::HookError)?;

if let HookType::Function { ref inline_hook } = mm_is_address_valid.hook_type {
    hook::MM_IS_ADDRESS_VALID_ORIGINAL
        .store(inline_hook.trampoline_address(), Ordering::Relaxed);
}

let ssdt_nt_create_file_addy = SsdtHook::find_ssdt_function_address(0x0055, false)?;

let nt_create_file_syscall_hook = Hook::hook_function_ptr(
    ssdt_nt_create_file_addy.function_address as _,
    hook::nt_create_file as *const (),
)
.ok_or(HypervisorError::HookError)?;

if let HookType::Function { ref inline_hook } = nt_create_file_syscall_hook.hook_type {
    hook::NT_CREATE_FILE_ORIGINAL.store(inline_hook.trampoline_address(), Ordering::Relaxed);
}

let hook_manager = HookManager::new(vec![mm_is_address_valid, nt_create_file_syscall_hook]);
```

We support hook creation using either a function name (`hook_function`) or a raw pointer (`hook_function_ptr`). The name-based method resolves a function from the kernel export table, while the pointer-based method is used for syscalls or undocumented routines where we locate the address via the SSDT. Internally, `hook_function_ptr` clones the 4KB page containing the target function into a shadow region, calculates the function’s offset within that page, and injects an inline `INT3` (`0xCC`) breakpoint to trigger a VM-exit. To safely return to the original logic, `FunctionHook::new` builds a trampoline - a small stub that restores the overwritten bytes and performs a RIP-relative indirect jump (`jmp qword ptr [rip+0]`) back to the remainder of the original function. This ensures control flow resumes cleanly after our handler executes, without modifying guest memory.

[Code Reference (`hooks.rs`)](https://github.com/memN0ps/matrix-rs/blob/309ac2a0322be5320c80c34f2a631e21a05fcb74/hypervisor/src/intel/ept/hooks.rs#L126-L162)

```rust
let original_pa = PhysicalAddress::from_va(function_ptr);
let page = Self::copy_page(function_ptr)?;

let page_va = page.as_ptr() as *mut u64 as u64;
let page_pa = PhysicalAddress::from_va(page_va);

let hook_va = Self::address_in_page(page_va, function_ptr);
let hook_pa = PhysicalAddress::from_va(hook_va);

let inline_hook = FunctionHook::new(function_ptr, hook_va, handler)?;
```

### Step 3, 4, 5 and 6 - Dual-EPT Remapping for Shadow Execution (enable_hooks())

[Code Reference (`hooks.rs`)](https://github.com/memN0ps/matrix-rs/blob/309ac2a0322be5320c80c34f2a631e21a05fcb74/hypervisor/src/intel/ept/hooks.rs#L270-L323)

After preparing our hooks, we configure the dual-EPT mappings to support shadow execution. For each hooked address, we split the containing 2MB page into 4KB entries in both EPTs. In the primary EPT, we mark the page as `READ_WRITE`, explicitly removing execute permissions. In the secondary EPT, we mark the same page as `EXECUTE` only and remap it to our shadow copy containing the inline hook and trampoline logic. This dual-view setup ensures that read and write accesses go through the original mapping in the primary EPT, while instruction fetches trigger execution from our detoured shadow page once we switch to the secondary EPT during an EPT violation later on.

```rust
primary_ept.split_2mb_to_4kb(original_page, AccessType::READ_WRITE_EXECUTE)?;
secondary_ept.split_2mb_to_4kb(original_page, AccessType::READ_WRITE_EXECUTE)?;

primary_ept.change_page_flags(original_page, AccessType::READ_WRITE)?;
secondary_ept.change_page_flags(original_page, AccessType::EXECUTE)?;

secondary_ept.remap_page(original_page, hooked_copy_page, AccessType::EXECUTE)?;
```

### Step 7 - Configuring VMCS for Breakpoint VM-Exits (setup_vmcs_control_fields())

During VMCS setup, we configure the `EXCEPTION_BITMAP` to trap `INT3` instructions, ensuring that breakpoint exceptions trigger a VM-exit. Execution starts with the `primary_eptp` loaded, providing the initial read/write view of guest memory.

[Code Reference (`vmcs.rs`)](https://github.com/memN0ps/matrix-rs/blob/309ac2a0322be5320c80c34f2a631e21a05fcb74/hypervisor/src/intel/vmcs.rs#L270-L306)

```rust
vmwrite(vmcs::control::EXCEPTION_BITMAP, 1u64 << (ExceptionInterrupt::Breakpoint as u32));
vmwrite(vmcs::control::EPTP_FULL, shared_data.primary_eptp);
```

### Step 8 - Handling EPT Violations with Dynamic EPTP Switching (handle_ept_violation())

When the guest attempts to execute a page that has been marked non-executable in the primary EPT, we receive a VM-exit due to an EPT violation. In response, we switch to the secondary EPTP, which remaps the same GPA to an `EXECUTE` -only shadow page containing our detour. This allows the guest to continue executing from the hooked version of the function.

[Code Reference (`ept.rs`)](https://github.com/memN0ps/matrix-rs/blob/309ac2a0322be5320c80c34f2a631e21a05fcb74/hypervisor/src/intel/vmexit/ept.rs#L16-L60)

```rust
let guest_physical_address = vmread(vmcs::ro::GUEST_PHYSICAL_ADDR_FULL);
let exit_qualification_value = vmread(vmcs::ro::EXIT_QUALIFICATION);
let ept_violation_qualification = EptViolationExitQualification::from_exit_qualification(exit_qualification_value);

if ept_violation_qualification.readable && ept_violation_qualification.writable && !ept_violation_qualification.executable {
    let secondary_eptp = unsafe { vmx.shared_data.as_mut().secondary_eptp };
    vmwrite(vmcs::control::EPTP_FULL, secondary_eptp);
}
```

If the guest later accesses the same page with a read or write operation - which is not permitted in the secondary EPT - we detect the violation and switch back to the primary EPTP, restoring full `READ_WRITE` access for data operations.

```rust
if !ept_violation_qualification.readable && !ept_violation_qualification.writable && ept_violation_qualification.executable {
    let primary_eptp = unsafe { vmx.shared_data.as_mut().primary_eptp };
    vmwrite(vmcs::control::EPTP_FULL, primary_eptp);
}
```

Matrix doesn’t currently handle mixed access patterns like `RWX` or `RX` within the same page, unlike Illusion which uses MTF to safely replay displaced instructions.

### Step 9 - Redirecting Execution via Breakpoint Handlers (handle_breakpoint_exception())

When the guest executes the `INT3` instruction embedded in the shadow page, a VM-exit is triggered due to the breakpoint exception. We resolve the guest’s current RIP and check if it matches any registered hook in our internal manager. If found, we redirect RIP to our hook handler, placing us in full control of execution. From here, we can inspect arguments, log activity, or introspect guest memory before returning to the original function using the preserved trampoline.

[Code Reference (`exceptions.rs`)](https://github.com/memN0ps/matrix-rs/blob/309ac2a0322be5320c80c34f2a631e21a05fcb74/hypervisor/src/intel/vmexit/exception.rs#L87-L121)

```rust
if let Some(Some(handler)) = hook_manager.find_hook_by_address(guest_registers.rip).map(|hook| hook.handler_address()) {
    guest_registers.rip = handler;
    vmwrite(vmcs::guest::RIP, guest_registers.rip);
}
```

### Step 10 - Returning via Trampoline to Original Guest Function (mm_is_address_valid() and nt_create_file())

After our hook logic runs, we forward execution back to the original kernel function using a trampoline. The handler retrieves the preserved entry point from an atomic global and safely casts it to the correct signature. This handoff ensures the guest continues as if uninterrupted, maintaining guest illusion.

[Code Reference (`hook.rs`)](https://github.com/memN0ps/matrix-rs/blob/309ac2a0322be5320c80c34f2a631e21a05fcb74/driver/src/hook.rs#L45-L120)

```rust
let fn_ptr = MM_IS_ADDRESS_VALID_ORIGINAL.load(Ordering::Relaxed);
let fn_ptr = unsafe { mem::transmute::<_, MmIsAddressValidType>(fn_ptr) };
fn_ptr(virtual_address as _)
```

```rust
let fn_ptr = NT_CREATE_FILE_ORIGINAL.load(Ordering::Relaxed);
let fn_ptr = unsafe { mem::transmute::<_, NtCreateFileType>(fn_ptr) };
fn_ptr(...)
```

## Matrix Execution Trace: Proof-of-Concept Walkthrough

This screenshot captures a live EPT violation triggered when the guest executes `MmIsAddressValid`. The debug output (left) shows that an `EXECUTE` access on the original guest physical page at `0xfffff801695ad370` caused a VM-exit, as it had been stripped of execute permissions in the primary EPT. We respond by switching to the secondary EPT, where the guest physical address is remapped to a shadow copy located at `0x239d38370`.

In the shadow page, we overwrite the function prologue with a single-byte `INT3` instruction, causing a breakpoint exception. This results in another VM-exit, where we locate the hook, redirect guest RIP to the handler, and resume execution. After the handler completes, execution is transferred to a trampoline located at `0xffffdb0620809f90`, which continues the original function. The trampoline performs this redirection via an indirect `jmp qword ptr [0xffffdb0620809f9a]`, which resolves to `0xffffdb0620809f9a` - the address immediately after the overwritten instruction - restoring execution flow.

![Matrix Hook Setup and Trampoline Redirection](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/863e81f151e3f4d1.png) **Figure 9: Shadow Page Redirection and Trampoline Setup for `MmIsAddressValid`**

The debug logs confirm that the `MmIsAddressValid` hook handler was successfully invoked, and its first parameter was printed, demonstrating that the redirection and handler execution worked as intended.

![Matrix EPT Violation and Handler Execution Flow](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/939dc9af2f91c32e.png) **Figure 10: EPT Violation Handling and Hook Invocation for `MmIsAddressValid`**

Unlike Illusion, we don’t currently support user-mode communication in Matrix, though adding it would be straightforward. What we demonstrate instead is a complete proof-of-concept for redirecting kernel execution using EPTP swaps, instruction trapping, and memory virtualization - all without modifying guest memory. This enables stealth introspection, syscall monitoring, and control flow redirection from a kernel driver-based hypervisor on Windows. While not hardened for real-world deployment, Matrix lays the foundation for advancing EPT-based evasion techniques, dynamic analysis, and memory protection research.

## Hook Redirection Techniques: INT3, VMCALL, and JMP

While the use of `INT3` -based hooks offers a lightweight and minimally invasive method for redirecting control flow, it introduces two VM-exits per hook: one on the EPT violation and another on the breakpoint exception. This tradeoff, also seen in Illusion (which uses `VMCALL`), introduces an extra VM-exit during hook execution. An alternative is to use a 14-byte indirect jump, such as `jmp qword ptr [rip+0]`, which performs an absolute jump by reading the target address from memory immediately following the instruction. This avoids the breakpoint entirely and reduces VM-exits to just one - from the EPT violation alone.

Matrix supports this form of `JMP` hook via a `jmp [rip+0]` stub, followed by an 8-byte target address. This method avoids clobbering registers (unlike the `mov rax, addr; jmp rax` sequence) and reduces the likelihood of introducing side effects. The implementation avoids using general-purpose registers by embedding the jump target inline, which simplifies redirection logic and maintains guest register integrity. By default, Matrix uses `INT3` hooks for simplicity and reduced shellcode size.

However, the larger shellcode required for either `JMP` approach means overwriting more of the original function prologue, increasing complexity around instruction alignment and relative addressing. Other instructions like `CPUID`, `VMCALL`, or even undefined opcodes can also be used to trap into the hypervisor, offering future directions for configurable or hybrid hook techniques in Matrix or Illusion.

## Hypervisor Detection Vectors

While this article focuses on EPT-based function redirection and stealth memory manipulation for memory introspection, it’s important to acknowledge that hypervisor-assisted hooks can be detected from usermode, even without elevated privileges. These detection techniques typically rely on timing discrepancies, fault-triggering behavior, or instruction-level profiling - usually caused by VM exits during memory access or privileged instruction handling.

Although out-of-scope for this post, here’s a non-exhaustive list of some known detection methods:

-   Write-checks to unused code padding (e.g., `0xCC` -> `0xC3`)
-   `RDTSC` -based timing checks to detect EPT page swaps
-   Thread-based timing discrepancies across CPU cores
-   `CPUID` execution profiling (e.g., latency measurement and vendor ID leaks)
-   `Instruction Execution Time (IET)` divergence using `APERF` or similar counters
-   Fault injection via invalid `XSETBV`, `MSR`, or `control register (CR)` access
-   Synthetic `MSR` probing (e.g., reads to the `0x40000000` range)
-   `SIDT` / `SGDT` descriptor length checks in WoW64 mode
-   `LBR` stack mismatches during forced VM exits
-   `INVD` / `WBINVD` misuse to test caching consistency
-   `VMCALL` exception handling behavior (e.g., improper `#GP` injection)
-   `CR0` / `CR4` shadow mismatch or `VMXE` bit exposure
-   Unusual exception/ `NMI` delivery paths (e.g., unexpected `#PF` or `#UD` behavior)
-   UEFI memory map analysis to reveal hidden hypervisor regions
-   `CR3` trashing to disrupt hypervisors that track or isolate memory mappings per process
-   Descriptor table (`GDT` / `IDT`) integrity checks to detect hypervisors that fail to isolate or emulate guest-accessible structures correctly
-   Page table consistency checks targeting hypervisors that do not fully separate guest and host memory contexts (e.g., shared `CR3` or improper shadow paging)

For detailed explorations of these techniques (and many others), see:

-   [**BattlEye Hypervisor Detection** - @vmcall, @daax](https://secret.club/2020/01/12/battleye-hypervisor-detection.html)
-   [**How Anti-Cheats Detect System Emulation** - @daax, @iPower, @ajkhoury, @drew](https://secret.club/2020/04/13/how-anti-cheats-detect-system-emulation.html)
-   [**PatchGuard: Hypervisor-Based Introspection \[Part 1\]** - Nick Peterson (@everdox), Aidan Khoury (@ajkhoury)](https://revers.engineering/patchguard-detection-of-hypervisor-based-instrospection-p1/)
-   [**PatchGuard: Hypervisor-Based Introspection \[Part 2\]** - Nick Peterson (@everdox), Aidan Khoury (@ajkhoury)](https://revers.engineering/patchguard-detection-of-hypervisor-based-instrospection-p2/)
-   [**Syscall Hooking via Extended Feature Enable Register (EFER)** - Nick Peterson (@everdox)](https://revers.engineering/syscall-hooking-via-extended-feature-enable-register-efer/)
-   [**Detecting Hypervisor-Assisted Hooking** - Maurice Heumann (@momo5502)](https://momo5502.com/posts/2022-05-02-detecting-hypervisor-assisted-hooking/)

While some of these resources are older, many of the underlying concepts remain valid. The broader topics of evasion, stealth, and hypervisor detection are left as an exercise to the reader.

## Appendix

## Guest-Assisted Hooking Model

During early development of `illusion-rs`, a guest-assisted hooking model was implemented and tested. This technique involved allocating memory in the guest, injecting helper code, and redirecting execution (`RIP`) to a payload from the hypervisor. While technically viable, it introduced additional complexity and detection risk.

Traditional `JMP` -based inline hooks were avoided because the hypervisor operates outside the guest’s address space in a UEFI context. Implementing them would have required modifying guest memory, resolving APIs manually, coordinating execution context, and managing synchronization across early kernel stages - all of which added exposure and fragility.

This model was similar to the approach explored by [Satoshi Tanda](https://github.com/tandasat/MiniVisorPkg/issues/4#issuecomment-664030968), who implemented a [GuestAgent in C](https://gist.github.com/tandasat/bf0189952f113518f75c4f008c1e8d04) to hijack control from within the guest during kernel initialization and perform in-guest syscall hooking.

Although functional, this technique complicated recovery and required delicate coordination with guest state. Ultimately, it was removed from `illusion-rs` in favor of a cleaner design: EPT shadowing combined with inline `VMCALL` detours and `MTF` single-stepping for restoration. This approach avoids modifying guest memory entirely by redirecting execution through hypervisor-controlled shadow pages, simplifying control flow and enabling precise redirection without in-guest code.

## Comparing EPT Hooking Models: Per-Core vs Shared

The two hypervisors presented in this article - `illusion-rs` and `matrix-rs` - implement different EPT-based hooking models, each chosen to explore trade-offs in design, implementation complexity, and control granularity.

Use `illusion-rs` if you need precise control and fully host-side introspection without relying on in-guest code or memory allocation. It’s also ideal for scenarios requiring early boot-time visibility - such as monitoring or hijacking kernel behavior - before any drivers or security controls are initialized.

Use `matrix-rs` if you prefer a dynamically loadable Windows kernel driver-based hypervisor with a shared EPT model and no reliance on UEFI or firmware-level integration.

### Matrix (Shared EPT Across All Logical Processors)

`matrix-rs` is a Windows kernel driver-based hypervisor that uses a single EPT shared across all logical processors. This design was inspired by [not-matthias’s AMD hypervisor](https://github.com/not-matthias/amd_hypervisor), and development began in late 2022 as a learning project. The shared EPT model made implementation simpler - EPT violations can trigger EPTP switching, and hook state is globally consistent.

**Pros:**

-   Fewer EPT contexts to manage (single EPTP per system)
-   Simpler hook setup - updates apply globally
-   Only one `INVEPT` needed per hook change (such as adding or removing a hook)

**Cons:**

-   Race conditions can occur across processors
-   Harder to manage per-core or dynamic hook states
-   Less precise control over per-CPU redirection

> While both models require EPT cache invalidation during hook changes (such as adding or removing a hook), `INVEPT` must be issued on each logical processor because TLBs are per-logical processor. This applies whether the hypervisor uses per-core EPTs like `illusion-rs` or a shared EPT like `matrix-rs`.

### Illusion (Per-Logical-Processor EPTs with MTF)

`illusion-rs` is a UEFI-based hypervisor that uses a separate EPT for each logical processor. Development began in late 2023 to explore a boot-time introspection model using `Monitor Trap Flag (MTF)` stepping for displaced instruction replay. This approach avoids allocating memory or injecting trampoline code into the guest entirely - everything remains under hypervisor control.

**Pros:**

-   Hook logic remains fully on the host - no in-guest code needed
-   Enables clean replay of overwritten instructions via MTF
-   Fine-grained redirection per logical processor

**Cons:**

-   Hook updates must be replicated to all EPT contexts
-   Requires issuing `INVEPT` on each logical processor on every hook change (such as adding or removing a hook)
-   Increased complexity from maintaining consistent hook state across processors
-   MTF stepping incurs additional VM-exits per instruction replay, which may introduce performance overhead depending on the number of overwritten instructions, hook frequency, and placement

> Unlike traditional hook models that resume immediately after a detour, the MTF-based approach introduces one VM-exit per replayed instruction. This may be negligible for single hooks but becomes measurable if hooking frequently-executed code paths or system-wide targets.

There are many additional trade-offs - such as design constraints, integration complexity, and guest compatibility - that are beyond the scope of this article and left as an exercise for the reader.

While `illusion-rs` introduces a cleaner memory manager with pre-allocated page tables and shadow pages, both hypervisors remain proof-of-concept designs. Each offers a foundation for low-level memory introspection and control flow redirection, and can serve as a starting point for deeper research or production-quality development.

> For most dynamic or runtime hooking scenarios, the shared EPT model in `matrix-rs` may be easier to integrate. For firmware-level introspection and early boot control, `illusion-rs` offers tighter control over execution at the cost of added complexity.

## Conclusion

This post covered how to build Rust-based hypervisors for stealth kernel introspection and function hooking using Extended Page Tables (EPT). We explored two proof-of-concept implementations: [illusion-rs](https://github.com/memN0ps/illusion-rs), a UEFI-based hypervisor that hooks syscalls during early boot, and [matrix-rs](https://github.com/memN0ps/matrix-rs), a Windows kernel driver-based hypervisor that uses dual-EPT context switching to redirect execution at runtime.

We demonstrated how to detect when the SSDT is fully initialized inside `ntoskrnl.exe`, how to install execute-only shadow pages, and how to safely redirect execution using `VMCALL`, `CPUID`, or `INT3` without modifying guest memory. In Illusion, we relied on `Monitor Trap Flag (MTF)` single-stepping to replay displaced instructions, while Matrix used breakpoint exceptions and trampoline logic to forward control.

Both approaches preserve guest memory integrity and operate without triggering PatchGuard by relying on EPT-backed remapping instead of patching the kernel directly. The result is syscall hooking with fine-grained execution control, suitable for implants, introspection, or security research.

The examples shown here are not groundbreaking - they’re simply a reproducible starting point. Once control is established, these techniques can be extended to conceal threads, processes, handles, memory regions, or embed payloads like shellcode or reflective DLLs - all without modifying guest memory. However, Virtualization-Based Security (VBS) makes custom hypervisor-based hooking significantly harder - from preventing third-party hypervisors from loading at all, to disrupting EPT-based redirection techniques. Defenses like [Intel VT-rp](https://tandasat.github.io/blog/2023/07/05/intel-vt-rp-part-1.html), nested virtualization barriers, and integrity enforcement make it difficult to establish control below or alongside Hyper-V - unless you’re prepared to pivot into hyperjacking Hyper-V at boot-time or run your own hypervisor on top of Hyper-V via nested virtualization. Still, building your own hypervisor offers greater control, flexibility, and understanding - and it’s often where the truly novel work begins.

Everything demonstrated was implemented using publicly documented techniques - no NDAs, no private SDKs, and no reliance on undocumented internals. These techniques have long been used in the game hacking scene and are increasingly adopted in security research and commercial products. However, practical guides and open-source implementations remain relatively uncommon, especially for early boot-time hypervisors.

Both [illusion-rs](https://github.com/memN0ps/illusion-rs) and [matrix-rs](https://github.com/memN0ps/matrix-rs) are open-source and available for experimentation. For those looking to explore more minimal or educational examples, [barevisor](https://github.com/tandasat/barevisor) by Satoshi Tanda provides a clean starting point for hypervisor development across Intel and AMD platforms - for both Windows kernel driver-based and UEFI-based hypervisors.

However, if you’re looking for a pre-built, modular, and extensible library for Virtual Machine Introspection, check out the recent project [vmi-rs](https://github.com/vmi-rs/vmi-rs) by [Petr Beneš (@wbenny)](https://github.com/wbenny).

## Acknowledgments, References, and Inspirations

### Articles, Tools, and Research References

-   **[Daax (@daaximus)](https://github.com/daaximus)**
    
    -   [7 Days to Virtualization](https://revers.engineering/7-days-to-virtualization-a-series-on-hypervisor-development/)
    -   [MMU Virtualization via Intel EPT](https://revers.engineering/mmu-virtualization-via-intel-ept-index/)
-   **[Satoshi Tanda (@tandasat)](https://github.com/tandasat)**
    
    -   [Hypervisor Development for Security Researchers](https://tandasat.github.io/Hypervisor_Development_for_Security_Researchers.html)
    -   [Hypervisor 101 in Rust](https://github.com/tandasat/Hypervisor-101-in-Rust)
    -   [barevisor](https://github.com/tandasat/barevisor/)
    -   [Hello-VT-rp](https://github.com/tandasat/Hello-VT-rp)
    -   [MiniVisorPkg](https://github.com/tandasat/MiniVisorPkg)
    -   [Intel VT-rp - Part 1. remapping attack and HLAT](https://tandasat.github.io/blog/2023/07/05/intel-vt-rp-part-1.html)
    -   [Intel VT-rp - Part 2. paging-write and guest-paging verification](https://tandasat.github.io/blog/2023/07/31/intel-vt-rp-part-2.html)
-   **[Sina Karvandi (@Intel80x86)](https://github.com/SinaKarvandi)**
    
    -   [Hypervisor Development Tutorials](https://rayanfam.com/tutorials/)
    -   [Hypervisor From Scratch (GitHub)](https://github.com/SinaKarvandi/Hypervisor-From-Scratch/)
-   **[Matthias (@not-matthias)](https://github.com/not-matthias)**
    
    -   [amd_hypervisor](https://github.com/not-matthias/amd_hypervisor)
-   **[Nick Peterson (@everdox)](https://github.com/everdox)** and **[Aidan Khoury (@ajkhoury)](https://github.com/ajkhoury)**
    
    -   [PatchGuard: Hypervisor-Based Introspection \[Part 1\]](https://revers.engineering/patchguard-detection-of-hypervisor-based-instrospection-p1/)
    -   [PatchGuard: Hypervisor-Based Introspection \[Part 2\]](https://revers.engineering/patchguard-detection-of-hypervisor-based-instrospection-p2/)
    -   [Syscall Hooking via Extended Feature Enable Register (EFER)](https://revers.engineering/syscall-hooking-via-extended-feature-enable-register-efer/)
-   **[Maurice Heumann (@momo5502)](https://github.com/momo5502)**
    
    -   [Detecting Hypervisor-Assisted Hooking](https://momo5502.com/posts/2022-05-02-detecting-hypervisor-assisted-hooking/)
-   **[Alex Ionescu](https://github.com/ionescu007)**
    
    -   [SimpleVisor (Minimal x64 Hypervisor)](https://github.com/ionescu007/SimpleVisor)
-   **[Back Engineering (@\_xeroxz / IDontCode)](https://github.com/backengineering)**
    
    -   [AMD-V Hypervisor Development by Back Engineering](https://blog.back.engineering/04/08/2022)
    -   [bluepill (GitHub)](https://git.back.engineering/_xeroxz/bluepill)
-   **[Guided Hacking](https://guidedhacking.com/)**
    
    -   [x64 Virtual Address Translation (YouTube)](https://www.youtube.com/watch?v=W3o5jYHMh8s)
-   **[Namazso (@namazso)](https://github.com/namazso)**
    -   [UnKnoWnCheaTs forum post](https://www.unknowncheats.me/forum/2779560-post4.html)
-   [Petr Beneš (@wbenny)](https://github.com/wbenny)
    -   [vmi-rs](https://github.com/vmi-rs/vmi-rs)

### Community Research and Inspirations

-   **[The Secret Club](https://github.com/thesecretclub)**
    
-   **[DarthTon’s HyperBone](https://github.com/DarthTon/HyperBone)** Based on [Alex Ionescu’s](https://github.com/ionescu007/SimpleVisor) version, as shared on [UnknownCheats](https://www.unknowncheats.me/forum/c-and-c-/173560-hyperbone-windows-hypervisor.html)
    
-   **[Joanna Rutkowska](https://blog.invisiblethings.org/2006/06/22/introducing-blue-pill.html)**
    
    -   [Introducing Blue Pill](https://blog.invisiblethings.org/2006/06/22/introducing-blue-pill.html)

### Acknowledgments

-   [Daax](https://revers.engineering/)
-   [Satoshi Tanda (@tandasat)](https://github.com/tandasat)
-   [Drew (@drew)](https://github.com/drew-gpf)
-   [iPower (@iPower)](https://github.com/iPower)
-   [Namazso (@namazso)](https://github.com/namazso)
-   [Jess (@jessiep\_)](https://github.com/Intege-rs)
-   [Feli (@vmctx)](https://github.com/vmctx)
-   [Matthias @not-matthias](https://github.com/not-matthias/)
-   [Ryan McCrystal / @rmccrystal](https://github.com/rmccrystal)
-   [Wcscpy (@Azvanzed)](https://github.com/Azvanzed/)

### Documentation and Specifications

-   [Intel 64 and IA-32 Architectures Software Developer’s Manual](https://www.intel.com/sdm)
