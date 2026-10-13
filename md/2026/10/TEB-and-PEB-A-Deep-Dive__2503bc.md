---
title: "TEB and PEB: A Deep Dive"
source: https://blog.yunolay.com/teb-and-peb-deep-dive/
source_host: blog.yunolay.com
clip_date: 2026-10-13T10:18:13+08:00
trace_id: 845558f5-6634-454e-aa6e-6dec5d097e48
content_hash: cbd3e1781c530f3f376bc06dc34dacc92b699b868a5f0ecdb80152093f0979a8
status: synced
tags:
  - Windows逆向
  - 反调试
series: null
feed_source: Yunolay·Windows内核/逆向
ai_summary: PEB 与 TEB 是内核 EPROCESS/ETHREAD 的用户态镜像，无需系统调用即可直接读取，既是 Windows 加载器的工作台账，也是无导入 shellcode 自举、反调试与模块隐藏的立足点——但因其可写，据此得出的结论必须与内核侧数据交叉验证。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f875244-d011-813a-8f02-fec4edd36bdb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> PEB 与 TEB 是内核 EPROCESS/ETHREAD 的用户态镜像，无需系统调用即可直接读取，既是 Windows 加载器的工作台账，也是无导入 shellcode 自举、反调试与模块隐藏的立足点——但因其可写，据此得出的结论必须与内核侧数据交叉验证。
> 
> - **定位方式：** x64 下 `gs` 段基址指向当前线程 TEB，`gs:[0x30]` 为 TEB 自指针、`gs:[0x60]` 为 PEB 指针；x86 用 `fs`，对应 `fs:[0x18]` 与 `fs:[0x30]`。TEB 开头是 `NT_TIB`，存放自身地址、用户态栈基址/界限，x86 上还有 SEH 链头 `ExceptionList`。
> - **PEB 关键字段：** `BeingDebugged`（偏移 0x2，`IsDebuggerPresent` 就是读它）、主模块基址 `ImageBaseAddress`、指向模块链表的 `Ldr`、含命令行/镜像路径/环境块/标准句柄的 `ProcessParameters`、带堆调试位的 `NtGlobalFlag`、`ProcessHeap`、以及解析 `api-ms-win-*` 虚拟名到真实宿主 DLL 的 `ApiSetMap`。
> - **TEB 关键字段：** 内嵌 `NtTib`、支撑 `TlsAlloc`/`TlsGetValue` 的 `ThreadLocalStoragePointer` 与 `TlsSlots`、`LastErrorValue`（`GetLastError`）、系统调用原始返回码 `LastStatusValue`、`CurrentLocale`、以及进程 ID + 线程 ID 组合 `ClientId`。
> - **加载器数据与查看：** `PEB_LDR_DATA` 用三条 `LIST_ENTRY` 按加载顺序、内存基址顺序、初始化顺序串起同一批模块，节点 `LDR_DATA_TABLE_ENTRY` 含 `DllBase`、`EntryPoint`、`SizeOfImage` 和 `FullDllName`/`BaseDllName`——这是进程内免 API 枚举已加载 DLL 的标准做法。WinDbg 可用 `!peb`、`!teb`、`dt ntdll!_PEB @$peb`、`dt ntdll!_TEB @$teb`、`!gle` 观察原始布局与最后错误码。
> - **攻防意义：** shellcode 常以 `gs:[0x60]` 取 PEB、走 `Ldr` 找 `kernel32`/`ntdll` 再手工解析导出表定位 `LoadLibrary`/`GetProcAddress`；直接读 `BeingDebugged`、`NtGlobalFlag` 堆位可绕过被 hook 的检测 API；把自身 `LDR_DATA_TABLE_ENTRY` 从三条链表摘除可对 PEB 枚举隐身（但内存管理器 VAD 树仍可见映射）；启动后覆写 `ProcessParameters.CommandLine` 可伪造命令行，故防御方应在进程创建时从内核侧采集命令行并做 VAD 与模块链表交叉比对。

Earlier in this series we met the kernel’s view of a process and a thread — the `EPROCESS` and `ETHREAD` structures that live in protected kernel memory. But every process and every thread also has a **user-mode** control structure that mirrors and complements that kernel state: the **Process Environment Block (PEB)** and the **Thread Environment Block (TEB)**. Because they sit in the process’s own address space, code can read them directly — no system call, no transition to ring 0. That single property is why the PEB and TEB sit at the center of two very different worlds: the Windows image loader relies on them for normal operation, and position-independent shellcode relies on them to bootstrap itself. This article is a field-by-field tour of both structures and why they matter for offense and defense alike.

## Locating Them

The structures are reachable through the CPU’s segment registers, which Windows repurposes to point at per-thread data. On **x64**, the `gs` segment base points at the current thread’s TEB, so `gs:[0x30]` reads the TEB’s self-pointer and `gs:[0x60]` reads the PEB pointer stored inside the TEB. On **x86**, the `fs` segment plays the same role: `fs:[0x18]` is the TEB self-pointer and `fs:[0x30]` is the PEB pointer.

The very start of the TEB is an `NT_TIB` (Thread Information Block): it holds the thread’s own address (a self-pointer used to translate a relative offset into a linear address), the **stack base and stack limit** that bound the user-mode stack, and — on x86 — the head of the structured-exception-handling chain (`ExceptionList`). Because the TIB is at a fixed, well-known location, a few bytes of assembly can find everything else from it.

```
; x64: load the PEB pointer into rax with no API call
mov rax, gs:[0x60]          ; rax = PEB

; x86 equivalent
mov eax, fs:[0x30]          ; eax = PEB
```

## The PEB Field Tour

The PEB is the per-process store of everything user mode needs to know about itself. The fields that matter most in practice are:

-   **`BeingDebugged`** (offset `0x2`) — a single byte set to 1 when a user-mode debugger is attached. `IsDebuggerPresent` literally just reads this byte.
-   **`ImageBaseAddress`**— where the main executable image is mapped, the starting point for parsing the process’s own PE headers.
-   **`Ldr`**— a pointer to a `PEB_LDR_DATA` structure holding the three loaded-module lists (covered in detail below). This is the loader’s index of every DLL in the process.
-   **`ProcessParameters`**— an `RTL_USER_PROCESS_PARAMETERS` block containing the **command line**, the image path, the current directory, the environment block, and the standard handles. This is what `GetCommandLineW` reads.
-   **`NtGlobalFlag`**— a set of global flags; several heap-debugging bits get set when a process is launched under a debugger, making this a classic anti-debug tell.
-   **`ProcessHeap`** and the heap list — the default process heap and an array of all heaps in the process (tie-in to the heap-internals article in this series).
-   **`ApiSetMap`**— the API Set schema used to resolve virtual “API set” DLL names (like `api-ms-win-*`) to real host DLLs during import resolution.

## The TEB Field Tour

Where the PEB is per-process, the TEB is per-thread and holds the fast-access state a thread needs constantly:

-   **`NtTib`**— the embedded TIB: stack base/limit and, on x86, the `ExceptionList` that heads the SEH chain (see the exception-handling article for why x64 abandoned this stack-based approach in favor of table-based unwinding).
-   **`ThreadLocalStoragePointer`**— points at the array backing per-thread TLS; combined with the `TlsSlots` array (and the expansion slots for indices beyond the fixed set) this implements `TlsAlloc` / `TlsGetValue`.
-   **`LastErrorValue`**— the thread’s last-error code, returned by `GetLastError` and set by `SetLastError`.
-   **`LastStatusValue`**— the last `NTSTATUS` a system call returned for this thread, before it was translated to a Win32 error.
-   **`CurrentLocale`**— the thread’s locale identifier.
-   **`ClientId`**— the process ID and thread ID pair identifying this thread (mirrors the kernel’s `Cid` from the threads article).

## The Loader Data (PEB_LDR_DATA)

The single most consequential thing the PEB points at is the loader data. `PEB_LDR_DATA` contains three `LIST_ENTRY` heads that thread the same set of modules in three different orders:

-   **`InLoadOrderModuleList`**— modules in the order they were loaded.
-   **`InMemoryOrderModuleList`**— modules ordered by base address in memory.
-   **`InInitializationOrderModuleList`**— modules in the order their `DllMain` initialization ran.

Each node is an `LDR_DATA_TABLE_ENTRY` describing one module: its `DllBase` (load address), `EntryPoint`, `SizeOfImage`, and both the `FullDllName` and `BaseDllName` as counted Unicode strings. Walking one of these lists is the canonical, API-free way for in-process code to enumerate every loaded DLL — which is exactly how a loader (or a piece of shellcode) finds the base address of `ntdll.dll` or `kernel32.dll` so it can then parse their export tables and resolve functions by hand.

## Inspecting Them

Both structures are trivial to inspect in a debugger, which is the fastest way to build intuition for them:

```
# WinDbg: high-level dumps of the current process/thread blocks
!peb
!teb

# Overlay the raw types onto the live blocks (@$peb and @$teb are
# pseudo-registers pointing at the current PEB/TEB)
dt ntdll!_PEB @$peb
dt ntdll!_TEB @$teb

# Follow the loader data and walk the in-load-order module list
dt ntdll!_PEB_LDR_DATA @$peb->Ldr

# Decode the current thread's last Win32 error
!gle
```

`!peb` and `!teb` pretty-print the important fields (image path, command line, loaded modules, TLS, last error), while `dt` gives you the raw layout with offsets — useful when you need to reference a specific field like `BeingDebugged` at `0x2` or resolve an offset that some code reads directly. `!gle` decodes `LastErrorValue` and `LastStatusValue` into readable messages.

## Security Relevance

Few structures are as heavily used by low-level offensive tooling as the PEB and TEB — and understanding them is what lets a defender recognize the abuse:

-   **API-free resolution.** Position-independent shellcode almost universally starts by reading `gs:[0x60]` to reach the PEB, walking `Ldr` to find `kernel32` / `ntdll`, then parsing their export tables to locate `LoadLibrary` / `GetProcAddress`. No imports, no static addresses — this is the bootstrap for most in-memory payloads.
-   **Anti-debugging.** Reading `BeingDebugged`, the `NtGlobalFlag` heap bits, or the heap’s own debug flags directly from the PEB lets code detect a debugger while sidestepping the APIs (`IsDebuggerPresent`, `CheckRemoteDebuggerPresent`) that an analyst might hook.
-   **Module hiding via PEB unlinking.** Malware can unlink its own `LDR_DATA_TABLE_ENTRY` from the three loader lists so that anything enumerating modules through the PEB no longer sees it. Crucially, this does not remove the mapping — the memory manager’s **VAD tree** (see the virtual-memory article) still shows the region, which is exactly why memory-forensics tools cross-check the VAD view against the loader list to surface hidden modules.
-   **Command-line spoofing.** Because `ProcessParameters` lives in writable user memory, a process can overwrite its own `CommandLine` after startup so that tools reading it (including many EDRs) report a benign command line that differs from what actually launched — a well-known argument-spoofing technique. Defenders counter it by capturing the command line at process-creation time from the kernel rather than reading it back later.

All of this is described for defensive understanding and authorized testing only. The common thread is that the PEB and TEB are authoritative-looking but *user-writable*: they can be read without permission and, within the process, rewritten — so anything derived solely from them should be corroborated with kernel-sourced telemetry.

## Conclusion

The PEB and TEB are the user-mode mirror of the kernel’s process and thread objects — the loader’s working notebook and every thread’s scratchpad, laid out in memory the process can read at will. That accessibility makes them indispensable to normal execution and equally indispensable to shellcode, anti-analysis tricks, and stealth techniques, while their user-writability is precisely why defenders treat data drawn from them with suspicion. Next in the series we turn to how threads coordinate with one another: the kernel’s **synchronization primitives** and dispatcher objects.

## You Might Also Like

This article is part of the Windows Internals series. These related deep-dives cover adjacent parts of the system:

-   [Processes and the EPROCESS Structure](https://blog.yunolay.com/processes-and-the-eprocess-structure/)
-   [Threads, KTHREAD, and the Windows Scheduler](https://blog.yunolay.com/threads-kthread-and-the-windows-scheduler/)
-   [The Windows DLL Loader and the PE File Format](https://blog.yunolay.com/windows-dll-loader-and-pe-file-format/)
-   [System Calls and the User-to-Kernel Transition](https://blog.yunolay.com/system-calls-user-to-kernel-transition/)

投稿 [TEB and PEB: A Deep Dive](https://blog.yunolay.com/teb-and-peb-deep-dive/) は [Yunolay's Blog](https://blog.yunolay.com/) に最初に表示されました。
