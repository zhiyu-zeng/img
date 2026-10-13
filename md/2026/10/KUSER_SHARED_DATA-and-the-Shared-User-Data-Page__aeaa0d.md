---
title: KUSER_SHARED_DATA and the Shared User Data Page
source: https://blog.yunolay.com/kuser-shared-data-shared-user-data-page/
source_host: blog.yunolay.com
clip_date: 2026-10-13T10:18:45+08:00
trace_id: 6bc885e6-c234-4a53-8830-5adc29242ce5
content_hash: 55ee0e16684a609a88040535432bb9b39c0c886937bef1ea83b5bc6c2d511d76
status: synced
tags:
  - Windows逆向
  - 内核
series: null
feed_source: Yunolay·Windows内核/逆向
ai_summary: Windows 用固定地址 0x7FFE0000 的一页只读内核维护内存，把时间、系统版本与 CPU 特性查询从系统调用降为一次普通内存读取。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f875244-d011-8183-bb4a-d5afd6f17851
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Windows 用固定地址 0x7FFE0000 的一页只读内核维护内存，把时间、系统版本与 CPU 特性查询从系统调用降为一次普通内存读取。
> 
> - **固定地址与权限：** 用户态恒映射在 0x7FFE0000，x64 内核态映射在 0xFFFFF78000000000，同一物理页但内核可写、用户只读；该地址不受 ASLR 影响。
> - **关键字段：** SystemTime、InterruptTime/TickCount、TimeZoneBias、ProcessorFeatures、NtSystemRoot、NtMajorVersion/NtMinorVersion/NtBuildNumber、SafeBootMode、KdDebuggerEnabled。
> - **性能动机：** 内核按时钟节拍刷新这些值，GetTickCount 等直接读内存，避免 ring0 切换；用户无需加锁即可读。
> - **调试方法：** WinDbg 中 `dt nt!_KUSER_SHARED_DATA 0x7ffe0000` 可整体查看，也可附加字段名只看 NtBuildNumber、SystemTime、SafeBootMode 等。
> - **安全意义：** 固定地址曾是攻击者的可靠参照点，部分旧版可写内核映射被微软逐步加固；恶意代码常直接读调试器与安全模式标志做反调试/环境检测，并借版本字段免 API 指纹识别。

Crossing from user mode into the kernel is expensive. A system call has to trap into ring 0, save state, dispatch, and return — worthwhile when real work needs doing, but wasteful for a program that just wants to know the current time or the OS build number. Windows solves this with a clever shortcut: a single page of memory that the kernel keeps up to date and maps, read-only, into every process. That page is `KUSER_SHARED_DATA`, the shared user data page, and it lets user-mode code read a curated set of kernel-maintained values with an ordinary memory load — no syscall required. It is a small structure, but its fixed placement and contents make it one of the more interesting corners of the Windows architecture.

## The Fixed Address

The defining characteristic of `KUSER_SHARED_DATA` is that it lives at a **constant, well-known virtual address in every process**. From user mode it is always mapped at `0x7FFE0000`; the kernel sees the same physical page through its own mapping at `0xFFFFF78000000000` on x64. The two mappings point at the same underlying page, but with different permissions: the kernel mapping is writable, while the user-mode mapping is strictly **read-only**. User code can look but never touch.

Crucially, this address is **not subject to ASLR**. While nearly everything else in a modern process — image bases, stacks, heaps, and most kernel allocations — is randomized to frustrate exploitation, `KUSER_SHARED_DATA` is deliberately pinned to `0x7FFE0000` so that compilers and the runtime can emit code that reads it without any relocation or lookup. That predictability is precisely what makes the page both useful to the system and, as we will see later, historically attractive to attackers.

## What It Contains

The page is described by the `nt!_KUSER_SHARED_DATA` structure, and its fields are the values that user mode wants to read often and cheaply. Among the most important:

-   **`SystemTime`**— the current system time, updated by the kernel so that time queries need not trap.
-   **`InterruptTime`** and **`TickCount`**— the monotonic time since boot; `GetTickCount` / `GetTickCount64` read straight from here rather than issuing a syscall.
-   **`TimeZoneBias`**— the offset used to convert system (UTC) time to local time.
-   **`ProcessorFeatures`**— an array of flags indicating which CPU instruction-set features are available, so runtime code can branch to optimized paths without executing `cpuid` itself.
-   **`NtSystemRoot`**— the path to the Windows directory.
-   **`NtMajorVersion`**, **`NtMinorVersion`**, and **`NtBuildNumber`**— the running OS version and build.
-   **`SafeBootMode`**— whether the system booted into safe mode.
-   **`KdDebuggerEnabled`**— a flag reflecting whether a kernel debugger is enabled, alongside related debug-state bits.

None of these are secrets — they are exactly the kind of ambient, read-mostly state that every process legitimately needs and that changes slowly (or is maintained by the kernel on a regular tick).

## Why a Shared Page

The motivation is pure performance. Consider a program that calls `GetTickCount` thousands of times in a loop, or a media library that checks the current time on every frame. If each of those queries required a full user-to-kernel transition, the overhead would dwarf the actual work. By having the kernel publish these values into a page that every process can read directly, Windows turns a syscall into a single memory access.

The kernel holds up its end by keeping the values fresh. On each clock tick, for example, it updates `SystemTime`, `InterruptTime`, and `TickCount`. Because only the kernel can write the page, user code can trust that what it reads is authoritative without any locking on its side — it simply reads the current published value.

## Version and Feature Detection

Two of the page’s uses show up constantly in real code. First, **version detection**: rather than calling an API that itself has to consult the kernel, low-level runtime code can read `NtBuildNumber`, `NtMajorVersion`, and `NtMinorVersion` directly from `0x7FFE0000` to decide which behavior a given OS build supports. This is why ntdll and other core components can make version decisions extremely early in process startup, before much of the normal API surface is available.

Second, **feature detection**: the `ProcessorFeatures` array records whether the CPU supports particular instruction-set extensions. Runtime libraries consult it to select vectorized or accelerated code paths. Reading a byte from the shared page is far cheaper than issuing `cpuid` and interpreting the result on every decision, and it gives a consistent, OS-sanctioned view of what is available.

## Inspecting KUSER_SHARED_DATA

Because the structure and its address are both public, the page is easy to examine in a debugger. In WinDbg you can overlay the type onto the fixed address and read individual fields:

```python
# Dump the whole structure at the user-mode fixed address
dt nt!_KUSER_SHARED_DATA 0x7ffe0000

# In kernel mode, the same page is visible at its kernel address
dt nt!_KUSER_SHARED_DATA 0xFFFFF78000000000

# Read specific fields of interest
dt nt!_KUSER_SHARED_DATA 0x7ffe0000 NtBuildNumber NtMajorVersion NtMinorVersion
dt nt!_KUSER_SHARED_DATA 0x7ffe0000 SystemTime InterruptTime TickCount
dt nt!_KUSER_SHARED_DATA 0x7ffe0000 KdDebuggerEnabled SafeBootMode
```

Running these against a live target shows the build number that matches `winver`, a `SystemTime` that advances as you re-issue the command, and the debug/safe-boot flags reflecting the machine’s current state. Reading the page from a normal user-mode process is equally simple — dereferencing `0x7FFE0000` as a `KUSER_SHARED_DATA` pointer works from any process, which is exactly the point.

## Security Relevance

The very property that makes the shared page convenient — a **fixed, non-randomized address**— has also made it a recurring point of interest in offensive research, which is worth understanding from a defender’s perspective.

-   **A known-address landmark.** In an era of pervasive ASLR, a page that is guaranteed to sit at `0x7FFE0000` in user mode (and at a fixed kernel address on older builds) was a rare reliable reference point. Historically, the kernel-side mapping on some Windows versions was writable and predictably located, which made it a tempting target for kernel exploitation primitives. Microsoft progressively hardened this — making the user view strictly read-only and randomizing/limiting the writable kernel mapping — precisely to remove it as a dependable exploitation aid.
-   **Anti-analysis and environment checks.** Malware and packers frequently read fields such as `KdDebuggerEnabled` to notice a kernel debugger, or `SafeBootMode` to detect an analysis environment, without calling any API that a monitoring tool might hook. Because it is a plain memory read, this check is quiet by design.
-   **API-free OS fingerprinting.** Reading `NtBuildNumber` and the version fields straight from the shared page lets code identify the exact OS build without invoking version APIs, which malware uses to select build-specific offsets or behavior while staying off the usual telemetry paths.

For defenders, the takeaway is not that the page is dangerous — it is a normal, essential part of the OS — but that reads of specific fields (debugger and safe-boot flags in particular) are a recognizable ingredient of evasion logic, and that the platform’s hardening of the writable mapping is one more reason modern kernels are harder to exploit than older ones. Understanding what legitimately lives at `0x7FFE0000` is what lets you tell an ordinary time query from an environment probe.

## Conclusion

`KUSER_SHARED_DATA` is a small but elegant piece of the Windows design: one kernel-maintained page, mapped read-only into every process at a fixed address, that turns common time, version, and feature queries into cheap memory reads. Its fixed placement is both its strength — enabling syscall-free access — and the reason it has drawn security attention over the years. With this, our Windows Internals series has traced the system from firmware and the boot path, through processes, threads, memory, objects, and the kernel’s protection mechanisms, all the way down to the humble shared page that sits at the boundary between user and kernel worlds.

## You Might Also Like

This article is part of the Windows Internals series. These related deep-dives cover adjacent parts of the system:

-   [System Calls and the User-to-Kernel Transition](https://blog.yunolay.com/system-calls-user-to-kernel-transition/)
-   [Windows Virtual Memory: Page Tables, PTEs, and Working Sets](https://blog.yunolay.com/windows-virtual-memory-page-tables-ptes-working-sets/)
-   [TEB and PEB: A Deep Dive](https://blog.yunolay.com/teb-and-peb-deep-dive/)
-   [Modern Windows Kernel Protections: PatchGuard, DSE, and HVCI](https://blog.yunolay.com/modern-windows-kernel-protections-patchguard-dse-hvci/)

投稿 [KUSER_SHARED_DATA and the Shared User Data Page](https://blog.yunolay.com/kuser-shared-data-shared-user-data-page/) は [Yunolay's Blog](https://blog.yunolay.com/) に最初に表示されました。
