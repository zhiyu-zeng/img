---
title: frida.re
source: https://frida.re/news/2026/11/13/frida-17-26-3-released/
source_host: frida.re
clip_date: 2026-11-18T12:57:22+08:00
trace_id: bf2c7f7d-cfa8-4706-8e70-3d6a0d9871b5
content_hash: 76ffc49ee900224854f249bc02698e2e0e9436cf587345ddaa5728e3034dc46c
status: synced
tags:
  - Frida
  - Linux内核
series: null
feed_source: Frida Releases
ai_summary: |-
  - **Linux 内核模块重构：** 内核模块变为小加载器，加载与 GDB stub 上传相同的 agent 镜像（映射、重定位、经 kallsyms 填充内核地址）；原模块内注入器移入共享 agent，结构体偏移取自内核头文件并回退到 BTF。
  - **Linux 6.15 内核 panic 修复：** Pixel 7（6.1 内核）注入 panic 由 *detach_pid()* 签名在 6.15 变更引起，agent 现按 *free_pids()* 是否存在在运行时选择正确 ABI；另修复 6.2–6.14 x86 的 *pcpu_hot* per-CPU 变量、arm64 SVE/SME 向量长度继承、栈对齐（musl *fstatat()* 崩溃）及 *fixup_exception()* prologue 误恢复。
  - **空闲 agent 优化：** 之前所有等待者共享一个等待队列，Android 上每秒约 90 次无谓唤醒；现在按 token 精确唤醒，无超时等待改为 *TASK_IDLE* 持续睡眠。
  - **Windows/QNX/iOS 修复：** Parallels 下 arm64 Windows 地址翻译改为完整页表遍历并读取 access flag 为 0 的页；支持 Windows 95 与 Windows 模块 *Module.version*；QNX 获得一轮 Interceptor/注入器/配置 fixes；iOS debugserver 内存读超时由首字节为 S/T/W/X/O 的二进制回复被误判为通知导致。
  - **Stalker 与工具链：** arm64 修复 glibc 2.38+ 的 *clone3* 线程创建及 q8–q31 向量寄存器保存；x86 修复 LOOP 类指令与跳转下一指令的重定位；包管理器修复新项目安装失败（Efni 错误未被捕获），构建修复顶层选项（如 strip）未传入 compat 构建。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41c75244-d011-817b-a251-cb25d608b384
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> - **Linux 内核模块重构：** 内核模块变为小加载器，加载与 GDB stub 上传相同的 agent 镜像（映射、重定位、经 kallsyms 填充内核地址）；原模块内注入器移入共享 agent，结构体偏移取自内核头文件并回退到 BTF。
> - **Linux 6.15 内核 panic 修复：** Pixel 7（6.1 内核）注入 panic 由 *detach_pid()* 签名在 6.15 变更引起，agent 现按 *free_pids()* 是否存在在运行时选择正确 ABI；另修复 6.2–6.14 x86 的 *pcpu_hot* per-CPU 变量、arm64 SVE/SME 向量长度继承、栈对齐（musl *fstatat()* 崩溃）及 *fixup_exception()* prologue 误恢复。
> - **空闲 agent 优化：** 之前所有等待者共享一个等待队列，Android 上每秒约 90 次无谓唤醒；现在按 token 精确唤醒，无超时等待改为 *TASK_IDLE* 持续睡眠。
> - **Windows/QNX/iOS 修复：** Parallels 下 arm64 Windows 地址翻译改为完整页表遍历并读取 access flag 为 0 的页；支持 Windows 95 与 Windows 模块 *Module.version*；QNX 获得一轮 Interceptor/注入器/配置 fixes；iOS debugserver 内存读超时由首字节为 S/T/W/X/O 的二进制回复被误判为通知导致。
> - **Stalker 与工具链：** arm64 修复 glibc 2.38+ 的 *clone3* 线程创建及 q8–q31 向量寄存器保存；x86 修复 LOOP 类指令与跳转下一指令的重定位；包管理器修复新项目安装失败（Efni 错误未被捕获），构建修复顶层选项（如 strip）未传入 compat 构建。

## Frida 17.26.3 Released

release

Mostly a Barebone release: the Linux kernel module now loads the same agent that we upload through a GDB stub, Windows on arm64 under Parallels got a thorough going-over, and the original Windows 95 works. Beyond that there are Stalker fixes for recent glibc on arm64 from [@cpruijsen](https://github.com/cpruijsen), x86 relocation fixes from [@tubibibo](https://github.com/tubibibo), module versions on Windows from [@nblog](https://github.com/nblog), a round of QNX work from [@KazWolfe](https://github.com/KazWolfe), and a fix from [@mrmacete](https://twitter.com/bezjaje) for memory reads on iOS timing out. The package manager also installs into fresh projects again.

## Barebone

### Linux

There used to be two Linux kernel agents: the image that the host uploads through a GDB stub, and the kernel module, which was a build of its own with its own injector. The module is now a small in-kernel loader for that very same image. It maps and relocates it, fills in the kernel addresses from kallsyms, and hands it the configuration the host would.

The injector that lived in the module moved into the shared agent, with its *prctl()* channel, process memory operations, thread spawning into a target’s thread group, and cloaking with its */proc* hooks, so both ways into the kernel get all of it. Struct offsets come from the kernel headers, falling back to BTF.

[@dystopia4096](https://github.com/dystopia4096) reported that injecting into a process panicked the kernel on a Pixel 7 running a 6.1 kernel, with an analysis tracing it to the *detach_pid()* signature that changed in Linux 6.15. The agent now picks the right one at runtime, from whether *free_pids()* exists. Thanks for the excellent report!

More kernels and configurations work as a result of this round:

-   On x86 kernels from 6.2 to 6.14, the current task, preempt count and top of the stack are members of *struct pcpu_hot* rather than per-CPU variables of their own, which left the agent without a current task.
-   On arm64, a thread started from the kernel side kept the vector lengths of the kernel thread it began as, so once it used SVE the kernel killed its thread group. It now gets the SVE and SME lengths of the leader.
-   Wherever the agent is entered without a call, the stack now looks the way a call would have left it. Code relying on alignment used to fault, such as musl’s *fstatat()* on x86_64 Alpine, which made every *lstat()* from an injected agent crash.
-   Stopping the agent could corrupt the kernel, as the fault handler’s uninstall wrote back the expected prologue of *fixup_exception()* even when install had found a different one and left it alone.

An idle agent is now actually idle. Every waiter shared one wait queue and every wake woke them all, so each GLib lock released in a hook on a hot kernel path woke the idle worker, some ninety times a second on Android. Wakes now only reach the waiters of their token. And a wait without a timeout gave up after a second, and GLib’s lock waits after a millisecond; they now sleep until woken, as *TASK_IDLE*, so a long sleep neither adds to the load nor looks hung.

### Windows

Windows on arm64 under Parallels took a string of fixes. Windows leaves *T1SZ* at 17, making the first translation table 2 KiB, so its address need not be aligned to a granule, and our mask assumed it was. Address translation stopped at level 3, misreading blocks and returning an address for an unmapped page. The Parallels stub refuses to read a mapped page whose access flag is clear, which Windows leaves that way on pages it has not touched in a while, such as the kernel’s export directory, so those are now read through the page tables, using the stub’s monitor for the MMU registers and physical memory. The stub also single-steps a processor told to continue alone, without ever reporting the stop, so we continue all of them.

On the agent side, the process list is found from the loaded modules where the host hasn’t named the list head, the agent injected into a process can start threads there and not only in the kernel, and its fault handler is aligned so that a process with Control Flow Guard doesn’t end itself when calling it. *Module.version* now works for modules in Windows processes.

And at the other end of the timeline, the original release of Windows 95 hung, as the address of VWIN32’s thread slot was that of OSR2. It is now read out of *VWIN32_GetContextHandle()*, like we already did for KERNEL32.

### GDB

Stops are handled asynchronously, so one that arrived just before the target was resumed could finish being handled afterward, and mark the running target as stopped. Such stops are now dropped.

## Stalker

Christopher found that following a thread that calls *pthread_create()* crashed on arm64 Linux with glibc 2.38 or newer. glibc starts threads with *clone3* there, which the arm64 backend didn’t know about, so the new thread kept running with its parent’s execution context and stack. With that fixed, the next thread creation aborted in *free()*: the minimal prolog only saved *q0* through *q7*, while delivering a compile event clobbered *q31*, which glibc’s TLS setup keeps a constant in. All 32 vector registers are now saved, as on x86. Thanks!

## x86

tubibibo fixed two relocation issues. *LOOP*, *LOOPE* and *LOOPNE* were copied verbatim, leaving their displacement relative to the wrong address, and Stalker lost control when they were taken. They are now rewritten like *JECXZ*, which also no longer turns into *JRCXZ* on x86_64. And a jump to the very next instruction ended relocation, so *Interceptor.attach()* failed on a short block ending in one, as [@astro3141](https://github.com/astro3141) reported. Relocation now continues past it. Thanks!

## Windows

*Module.version* was always *null* on Windows. [@nblog](https://github.com/nblog) implemented it by parsing the file version out of the module’s version resource, without relying on version.dll. Thanks! While in there, I hardened the PE parser against truncated and malformed files, which could make it read past the end of the data.

## QNX

Kaz has been testing Frida on QNX, on both a physical ARM device and an x86 VM, and sent a round of fixes:

-   Interceptor on ARM now honors the function’s size, so a 4-byte function such as *\_exit()*, a lone *BL* into *\__exit()*, no longer gets an 8-byte redirect that clobbers the function following it. It also prefers a trampoline within reach of a 4-byte branch over a code deflector, which patches a module’s ELF header, in line with x86 and arm64.
-   Replacing an execute-in-place page with a private copy now clears the cache before resuming, as threads could otherwise fetch stale instructions, and keeps signals masked meanwhile.
-   The injector’s ARM payload encoded calls relative to the local buffer rather than where it would run in the target.
-   Enumerating sections and relocations no longer walks past the section details when loading them failed, as for an execute-in-place image.
-   The injector supports x86, with GLib and libunwind changes to match.

Thanks!

## iOS

Francesco tracked down memory reads through debugserver that timed out after 30 seconds. Replies are told apart from asynchronous notifications by their first byte, so a binary reply starting with *S*, *T*, *W*, *X* or *O* was taken for a stop, exit or console output notification, and the read never got its answer. A memory read’s reply is now claimed by the read while it is the oldest request awaiting one. Thanks!

## Package manager

Every install into a fresh project failed with a complaint about a missing *package.json*, before downloading anything. The probe for an existing installation didn’t catch the error type that file operations throw since the Efni split in 17.25.0.

## Build

Francesco found that top-level builtin options such as *strip* never reached our compat builds, resulting in a stripped arm64 Gadget slice despite *–enable-symbols*. A related spelling quirk in Meson’s option store kept the resolved version from being passed along, and made the parent’s *assets* option replace the sub-build’s. And in a shared build, *idund* is now installed beside the other assets, where the daemon locator looks for it.

Enjoy!

### Changelog

-   barebone: Load the injected agent from the Linux kernel module, and move the module’s injector into the shared agent.
-   barebone: Choose the *detach_pid()* ABI at runtime, fixing a kernel panic on injection before Linux 6.15. Thanks [@dystopia4096](https://github.com/dystopia4096)!
-   barebone: Find x86 per-CPU variables in *pcpu_hot* on Linux 6.2 to 6.14.
-   barebone: Give injected Linux threads the SVE and SME vector lengths.
-   barebone: Enter agent code with an aligned stack.
-   barebone: Only restore an overwritten *fixup_exception()* prologue.
-   barebone: Wake only the waiters of a token, and wait without a time limit.
-   barebone: Mask *TTBR1* by its first table’s size, and translate arm64 addresses by full walk.
-   barebone: Walk page tables through Parallels, read pages its stub refuses, and continue every processor.
-   barebone: Read the NT layout through the machine, find the process list from modules, and pass kernel notes by value.
-   barebone: Spawn threads in NT process agents, and align the NT fault handler for CFG.
-   barebone: Read versions of Windows process modules.
-   barebone: Find VWIN32’s thread slot on any Windows 95 build.
-   gdb: Drop stops overtaken by a resumption, and let subclasses provide memory access.
-   gdb: Let binary replies reach their query. Thanks [@mrmacete](https://twitter.com/bezjaje)!
-   lldb: Don’t mistake memory reads for notifications. Thanks [@mrmacete](https://twitter.com/bezjaje)!
-   stalker: Handle the *clone3* syscall on arm64. Thanks [@cpruijsen](https://github.com/cpruijsen)!
-   stalker: Save *q8* through *q31* in the arm64 minimal prolog. Thanks [@cpruijsen](https://github.com/cpruijsen)!
-   x86: Relocate and virtualize *LOOP* instructions. Thanks [@tubibibo](https://github.com/tubibibo)!
-   x86: Handle jumps to the next instruction. Thanks [@tubibibo](https://github.com/tubibibo) and [@astro3141](https://github.com/astro3141)!
-   windows: Implement *Module.version*. Thanks [@nblog](https://github.com/nblog)!
-   pe-module: Validate headers of offline images, and bound directory parsing to the image.
-   interceptor: Honor the redirect space hint and prefer nearby trampolines on ARM. Thanks [@KazWolfe](https://github.com/KazWolfe)!
-   qnx: Make in-place page replacement safe on ARM. Thanks [@KazWolfe](https://github.com/KazWolfe)!
-   qnx: Set PC when emitting the injector’s ARM payload, and add x86 support. Thanks [@KazWolfe](https://github.com/KazWolfe)!
-   exit-monitor: Pass function sizes to Interceptor. Thanks [@KazWolfe](https://github.com/KazWolfe)!
-   elf-module: Fix section lookups past loaded details. Thanks [@KazWolfe](https://github.com/KazWolfe)!
-   glib: Align *gint64* to *int64_t* if they differ. Thanks [@KazWolfe](https://github.com/KazWolfe)!
-   libunwind: Add support for x86 QNX. Thanks [@KazWolfe](https://github.com/KazWolfe)!
-   package-manager: Catch Efni errors, fixing installs into fresh projects.
-   compat: Forward top-level builtin options. Thanks [@mrmacete](https://twitter.com/bezjaje)!
-   compat: Always pass the resolved version, and stop forwarding the parent’s *assets* option.
-   fruity: Install *idund* beside other assets in shared builds.
