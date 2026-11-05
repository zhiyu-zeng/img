---
title: frida.re
source: https://frida.re/news/2026/11/05/frida-17-26-0-released/
source_host: frida.re
clip_date: 2026-11-06T07:47:19+08:00
trace_id: b66b1b79-652d-486b-b07b-02eeef3e6531
content_hash: c5aeb68b68edf7b5a00257e4569f2c34d29c9a2783da7f876940d76ce8e66c7d
status: synced
tags:
  - Frida
  - 风控对抗
series: null
feed_source: Frida Releases
ai_summary: Frida 17.26.0 发布：Stalker 暂存寄存器不再写入目标栈以增强隐蔽性，Android 原生桥模拟环境多项修复，Windows 映射器支持 Vista 至 11 及 XP。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40f75244-d011-8129-8024-f6503e246dee
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.26.0 发布：Stalker 暂存寄存器不再写入目标栈以增强隐蔽性，Android 原生桥模拟环境多项修复，Windows 映射器支持 Vista 至 11 及 XP。
> 
> - **Stalker 反检测改进：** 寄存器暂存从目标栈（栈指针下方，可被 RASP 检测）移至 Stalker 自己的每上下文栈，覆盖 x86/x86_64/ARM/ARM64；TLS 中的执行上下文指针改用随机进程级 cookie 掩码；Linux arm64 通过 HWCAP_PACA 检测指针认证，去除链式返回地址的 PAC 残留位。
> - **新 API 与 RASP 策略：** transform 迭代器新增 `getUserDataReg()`，返回已加载 `Stalker.follow()` data 值的专属寄存器；官方明确不针对特定 RASP 产品做规避，而是通过 `scratchRegister`、`writeRedirect()` 等选项实现“碎片化”，让每个用户的 Frida 行为各异，无法被统一指纹识别。
> - **Android 模拟环境修复：** 原生桥下 `enumerateThreads()` 改为遍历宿主 Bionic 线程列表并结合 Berberis TLS 槽中的 guest CPU 上下文；`findExportByName()` 无句柄时回退到导出表解析；通过新 `ThreadProvider`/`CloakObserver` 接口让模拟 agent 共享原生 agent 的线程注册表与 cloak；Houdini v3 改用扩展入口点 `LoadLibraryExt()` 重试。
> - **Windows/Linux 修复：** PE 映射器改按行为特征定位 `LdrpHandleTlsData()` 等例程，经 XP 至 76 个 Win10/11 构建验证，并在 XP 上手动设置静态 TLS；`/proc/<pid>/maps` 按原始字节解析，修复 Zygisk 场景下非 UTF-8 映射名导致 attach 失败；另修复 memfd 代码交换回退与 syscall 跟踪字符串崩溃。
> - **其他平台：** Idun USB 设备关闭后传输报错而非崩溃，lwIP 改为立即 ACK，省去每层隧道 250ms 的 Nagle 延迟；QNX 修复 `vfork()` 子进程内回调引发的死锁。

## Frida 17.26.0 Released

release

Stalker no longer writes below the target’s stack pointer, and lends transforms a register of its own. The emulated realm on Android’s native bridge got a thorough going-over after [@leonitousconforti](https://github.com/leonitousconforti) ’s reports, and our Windows mapper now works on every Windows from Vista to 11, with XP thrown in, thanks to a report by [@liufeias](https://github.com/liufeias). Add Linux hardening from [@washedbeast](https://github.com/washedbeast), a round of Idun fixes by [@mrmacete](https://twitter.com/bezjaje), and QNX fixes, and it adds up to a minor bump.

## Stalker

Stalker has always spilled its scratch registers to the target’s stack, below the stack pointer and past the red zone. That was a shortcut I took when designing it, and one I have been meaning to fix for a long time, as it breaks an invariant Stalker is otherwise careful to uphold: it must have the same side effects on the target’s stack as the original code would have had. A *CALL* is rewritten into a push of the return address that the original would have pushed, which is what lets a thread unfollow deep in a call chain without repairing the stack. [Romain Thomas](https://www.romainthomas.fr/post/26-10-frida-stalker-detection/) published a post on detecting Stalker through those spills, which was the nudge I needed. Stalker now keeps them in its own per-context stack on x86, x86_64, ARM and ARM64, and the ARM and Thumb writers emit far branches through the literal pool rather than pushing a scratch register. This also made the arm64 emulation of instructions that misaligned the stack pointer before a branch, there only to avoid the crash our spills caused, unnecessary, so it is gone. Thanks, Romain!

Once spills moved off the stack, Stalker needed scratch registers of its own, and now controls them on every backend. That made a long-standing wish cheap: *getUserDataReg()* on the transform iterator returns a register that has been loaded with the *data* value given to *Stalker.follow()*, picked so that it doesn’t clash with the instruction being transformed. CModule transforms get it too, as an architecture-neutral *GumCpuReg*. Tools like frida-itrace used to track which registers were free at each instruction themselves. That logic now lives in Stalker, which makes such tools simpler. The typings in *@types/frida-gum* 19.13.0 cover it.

Two smaller Stalker changes. The pointer to the execution context that we keep in thread-local storage is now masked with a random per-process cookie, so walking the TLS slots no longer finds it. Romain documented [that technique](https://www.romainthomas.fr/post/22-08-singpass-rasp-analysis/#code-tracing) being used in the wild back in 2022, in his analysis of the SingPass app’s RASP. And Linux arm64 never detected pointer authentication, so return addresses on the chained-return path kept their PAC bits; we now query *HWCAP_PACA* from the auxiliary vector.

A word on how we approach RASP, since these two changes are a good illustration. Frida will never mitigate a specific RASP product, as that only leads to a never-ending escalation, cat-and-mouse style. What we will do is keep improving our stealth, as above, where the fix is a better Stalker regardless of who is looking. For everything else, we make sure you have the APIs to change Frida’s behavior and bypass whatever you are dealing with yourself. That is why Interceptor lets you pick the scratch register it clobbers to reach its trampoline, through the *scratchRegister* option, and even lets you write the redirect yourself, through *writeRedirect()*. Fragmentation is the goal: when every user can make Frida look and behave differently, there is no single Frida for a RASP vendor to fingerprint, and each bypass is one of many. And with our [Barebone](https://frida.re/#kernel) agents running in kernel mode, Frida’s user-mode threads, memory ranges and the rest are hidden from inside the process, so a RASP looking from there finds nothing to see.

## Android

Leo kept digging into the emulated realm on x86_64 Android with a native bridge, and found that *Process.enumerateThreads()* aborted the target. Under a native bridge, the guest Bionic’s pthread functions are trampolines into the host’s, so the guest has no thread list of its own, and our detection of the pthread internals failed. We now walk the host Bionic’s thread list, and for threads inside a guest call, take the CPU context from the guest state that Berberis publishes through a TLS slot.

He also found that *findExportByName()* returned *null* for the app’s own libraries, while *enumerateExports()* listed them. The emulated agent’s *dlopen()* runs in a namespace that can’t see the app’s classloader namespace, so the module ended up without a handle. Exports are now resolved through the export table whenever there is no handle, which also covers the linker, so its special case is gone. Thanks for the reports!

Thread observers didn’t work in the emulated realm either, as threads are created and torn down by the host’s Bionic, which the emulated agent’s Interceptor can’t hook. The native agent now feeds its thread registry to the emulated one, as a snapshot followed by added, removed and renamed events, and shares its cloak the same way, so the emulated agent doesn’t see the native agent’s threads when it walks the host’s list. Both go through new Gum interfaces, *ThreadProvider* and *CloakObserver*, for embedders in the same situation. Along the way, Frida’s own threads are now hidden from observers from the start, rather than announced and then cloaked.

[@tubibibo](https://github.com/tubibibo) found that Houdini v3 rejects the deprecated *NativeBridgeLoadLibrary()* entrypoint, which surfaced as “Process is not using emulation”. We now retry through the extended entrypoint. Thanks!

## Windows

liufeias reported that spawning on Windows 10 failed with “Unable to locate the ntdll loader TLS routines”. The mapper’s heuristics for finding *LdrpHandleTlsData()* and *LdrpReleaseTlsEntry()* only matched recent Windows 11 builds, so mapping any image with static TLS aborted elsewhere. They are now recognized by what they do: the former queries the TLS directory of the entry’s base, and the latter looks up the entry’s TLS record, unlinks it, and frees its index. The matcher follows branches, since some builds split the bodies into chunks, and tracks arguments passed on the stack, as 32-bit Vista and 7 use stdcall for these. This was validated against ntdll from XP, Vista, 7, 8.1, and 76 Windows 10 and 11 builds, both x86 and x64, and by running the mapper tests on Vista through

1.  Thanks for the report!

XP’s loader can’t set up static TLS for modules loaded at runtime, so the mapper does it by hand there, registering the module in ntdll’s TLS list and growing the TLS arrays of existing threads under the loader lock. And *GetThreadId()*, which XP lacks, is now resolved dynamically, as importing it kept anything linking Gum from loading.

Going back in time turned up more. On Vista, 7, 8.1 and Windows 10 up to 1909, *RtlVirtualUnwind()* is the implementation itself rather than a thunk, so the unwind broker crashed as soon as it got activated. The PE module parser now skips chained function entries and ARM function fragments, which are not function starts, and parses every field as little-endian, so PE images load correctly on big-endian hosts. And the x86 writer didn’t set *REX.R* for *r8* through *r15* in RIP-relative and absolute moves, nor emit the SIB byte for *r12*.

## Linux

washedbeast sent three fixes from the Android trenches. Mapping names in */proc/<pid>/maps* aren’t always valid UTF-8, and on kernels before 5.17 an anonymous mapping’s name is read from a user pointer every time, so a name whose string got unmapped shows up as garbage, which is what happens to apps that inherit a mapping from Zygote under Zygisk. Our regex refused the line, the iterator yielded no mappings at all, and attach failed. The maps are now parsed as raw bytes. Next, the code swap fallback used when libc can’t be found in the target never recognized memfd mappings, as the path reads */memfd:…*, so it picked ART’s read-only JIT zygote cache and the first write failed. And strings from syscall tracing could hold any byte, which crashed frida-server when they went into a GVariant. Thanks!

[@adilalperenciftci](https://github.com/adilalperenciftci) fixed a crash reported by [@merrygreek](https://github.com/merrygreek) when an ELF module has no accessible backing file. The live mapping then stands in, but the section header offsets are not covered by any loadable segment, so they often land in an unmapped gap. Those ranges are now probed first, and the module loads without section details instead. Thanks!

## Idun

Francesco went through Idun with a USB device in hand. Transfers now fail once the device is closed, rather than crashing when the NCM driver flushes after the fact. Devices are keyed by ID so that reconnecting doesn’t leave a stale transport behind, a device leaving while settling, as during boot, no longer does either, and the UDID is still known by the time detachment is reported. The daemon closes relays when either side closes, as keeping the device side open blocked single-client services. And two lwIP fixes: received data is acknowledged immediately, as delayed ACKs held back by Nagle on the device side cost 250 ms per round trip on each tunnel layer, and a close racing with connect no longer leaves a stream claiming to be readable and writable while all I/O would block.

Two frida-core fixes came out of the same session. Channel streams nobody else owns, such as one relayed by *idund*, were gone before being linked, as the registry only holds a weak reference. And *kill()* didn’t fall back to the process control service for non-debuggable apps, as LLDB errors have been *Efni.Error* since the move to Idun. Thanks!

## QNX

Following a blocked thread from script deadlocked on QNX. Modifying a thread ran its callback inside a *vfork()* child, which runs on the calling thread but in a different process, so a lock the parent already holds can’t be re-acquired there, and a JS transform takes GumJS’s mutex. Only the register transfer runs in the child now. And on QNX 6.5SP1 the program path lacked its leading slash when launched through an absolute path, so we resolved it against the current directory. Reported by [@KazWolfe](https://github.com/KazWolfe), thanks!

Enjoy!

### Changelog

-   stalker: Keep register spills off the target’s stack on x86, x86_64, ARM and ARM64.
-   stalker: Add *getUserDataReg()* to the transform iterator and CModule callouts.
-   stalker: Mask the execution context pointer stored in TLS.
-   stalker: Detect PAC support on Linux arm64.
-   stalker: Set V8’s stack limit while callbacks run on the Stalker stack.
-   arm-writer: Avoid the stack for far branches.
-   thumb-writer: Avoid the stack for far branches.
-   x86-relocator: Allow saving the scratch register to a slot.
-   x86-writer: Encode extended registers in near pointer moves.
-   linux: Use the host’s thread list under a native bridge. Thanks [@leonitousconforti](https://github.com/leonitousconforti)!
-   elf: Fall back to the export table when a module has no handle. Thanks [@leonitousconforti](https://github.com/leonitousconforti)!
-   thread-registry: Add the *ThreadProvider* interface, and hide GLib threads from the start.
-   cloak: Add the *CloakObserver* interface.
-   agent: Feed the emulated thread registry and cloak from the native agent.
-   agent: Retry an emulated load through *LoadLibraryExt()*. Thanks [@tubibibo](https://github.com/tubibibo)!
-   pe-mapper: Find the loader TLS routines by behavior, fixing static TLS on Windows older than recent 11 builds. Thanks [@liufeias](https://github.com/liufeias)!
-   pe-mapper: Support static TLS on Windows XP.
-   thread-registry: Resolve *GetThreadId()* dynamically, so Gum loads on XP.
-   unwind-broker: Handle an unthunked *RtlVirtualUnwind()*.
-   pe-module: Skip chained function entries and ARM function fragments.
-   pe-module: Parse PE fields as little-endian.
-   windows: Add missing includes, fixing the MinGW build.
-   linux: Parse */proc/<pid>/maps* as raw bytes. Thanks [@washedbeast](https://github.com/washedbeast)!
-   linux: Fix the memfd check in the code swap fallback. Thanks [@washedbeast](https://github.com/washedbeast)!
-   linux: Make syscall-trace strings valid UTF-8. Thanks [@washedbeast](https://github.com/washedbeast)!
-   elf-module: Skip unreadable section data in online modules. Thanks [@adilalperenciftci](https://github.com/adilalperenciftci) and [@merrygreek](https://github.com/merrygreek)!
-   idun: Fail USB transfers once the device is closed. Thanks [@mrmacete](https://twitter.com/bezjaje)!
-   idun: Key usbmux transports by device ID, handle USB removal while settling, and store the device’s UDID. Thanks [@mrmacete](https://twitter.com/bezjaje)!
-   idun: Close relays when either side closes. Thanks [@mrmacete](https://twitter.com/bezjaje)!
-   idun: ACK received data immediately, and fix close racing with connect. Thanks [@mrmacete](https://twitter.com/bezjaje)!
-   idun: Rename the QML module from Quickshell, add its Qt Multimedia dependencies to the packaging, and only use gioopenssl with a static GLib.
-   channel: Keep streams alive until linked. Thanks [@mrmacete](https://twitter.com/bezjaje)!
-   fruity: Fix the *kill()* fallback for non-debuggable apps. Thanks [@mrmacete](https://twitter.com/bezjaje)!
-   qnx: Run thread callbacks in the parent, fixing a deadlock when following a blocked thread.
-   qnx: Use *\_cmdname()* to query the program path. Thanks [@KazWolfe](https://github.com/KazWolfe)!
-   cmodule: Fix the bundled Capstone header on 32-bit ARM.
-   compiler: Bump *@types/frida-gum* to 19.13.0.
