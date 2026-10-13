---
title: "The win32k GUI Subsystem: USER, GDI, and the Kernel Attack Surface"
source: https://blog.yunolay.com/win32k-gui-subsystem-user-gdi-kernel-attack-surface/
source_host: blog.yunolay.com
clip_date: 2026-10-13T10:18:57+08:00
trace_id: 159b5f8a-4b16-4383-938a-28056f1c9559
content_hash: 321288c4019a668754246cfc7c58c0d5f1b470889422189ba121cc8c08816073
status: synced
tags:
  - Windows逆向
  - 内核
series: null
feed_source: Yunolay·Windows内核/逆向
ai_summary: Windows 的图形子系统 USER 与 GDI 自 NT 4.0 起被下沉到内核，组成 win32k，成为 Windows 上最大的本地提权攻击面。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f875244-d011-81e5-b068-eb0289d67f75
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Windows 的图形子系统 USER 与 GDI 自 NT 4.0 起被下沉到内核，组成 win32k，成为 Windows 上最大的本地提权攻击面。
> 
> - **架构演进：** NT 3.51 时 USER/GDI 运行在用户态 `csrss.exe`，跨进程往返开销高；NT 4.0 将其移入内核 `win32k.sys`，现代拆分为 `win32kbase`（基础）、`win32kfull`（完整桌面/GDI）、`win32kmin`（精简/无头）。
> - **影子 SSDT：** GUI 服务不经 `KiServiceTable`，而由 `W32pServiceTable` 派发；线程首次发起图形调用即被提升为 GUI 线程，获得更大内核栈与 `THREADINFO`（`W32THREAD`）结构。
> - **内核对象与配额：** 窗口对应 `tagWND`，GDI/USER 对象存于共享句柄表（只读映射进用户地址空间），默认每进程约 1 万 GDI + 1 万 USER 句柄，泄漏会导致句柄耗尽、创建窗口或绘图失败。
> - **安全边界：** 窗口站/桌面是带 DACL 的可保护对象，仅 `WinSta0` 能显示 UI 并接收输入；Session 0 隔离使服务无交互桌面，阻断 "shatter" 式跨权限窗口消息攻击。
> - **漏洞根因与缓解：** 影子 SSDT 暴露上千个 `NtUser*`/`NtGdi*` 入口，`KeUserModeCallback` 的回调重入易致状态失步与 UAF；缓解手段为 win32k lockdown（系统调用过滤）、字体解析移出内核至 AppContainer、win32k 类型隔离。

When you think of “the Windows kernel,” you probably picture `ntoskrnl.exe` — the process manager, the memory manager, the scheduler. But there is a second, enormous slab of kernel-mode code that most people forget about entirely: the one that draws every window, tracks every mouse move, and paints every menu. The graphical subsystem — window management, message dispatch, and 2D drawing — does not live in `ntoskrnl`. It lives in `win32k`, a kernel-mode component that has, for two decades, been the single largest local attack surface on Windows. If you have ever wondered why so many “local privilege escalation” CVEs point at a file called `win32kfull.sys`, this article is the map.

## How USER and GDI Ended Up in the Kernel

It was not always this way. In Windows NT 3.51, the two halves of the graphical world — **USER** (the window manager: windows, menus, input, messaging) and **GDI** (the Graphics Device Interface: device contexts, bitmaps, brushes, fonts, drawing) — ran in *user mode*, inside the `csrss.exe` subsystem process. Every window creation and every drawing call from an application meant a round-trip to another user-mode process, which is expensive: context switches, message marshalling, and scheduling overhead on the hottest path in an interactive OS.

With NT 4.0, Microsoft moved USER and GDI down into kernel mode as `win32k.sys`. The graphical code now ran in ring 0, reachable through fast system calls instead of cross-process messages, and interactive performance improved dramatically. The trade was made deliberately, and it is the reason the GUI is a kernel concern today. `csrss.exe` did not disappear — it still handles console windows, some process and thread bookkeeping, shutdown, and other subsystem duties — but the window manager and graphics engine became kernel components.

## Architecture

On modern Windows, the old monolithic `win32k.sys` has been refactored into several modules, primarily:

-   **`win32kbase.sys`**— the base functionality shared across editions.
-   **`win32kfull.sys`**— the full desktop window manager and GDI implementation.
-   **`win32kmin.sys`**— a minimal variant for MinWin/headless configurations where the full desktop surface is unnecessary.

Conceptually the code still divides into the **USER** half — windows, the message system, keyboard and mouse input, window stations and desktops — and the **GDI** half — device contexts (DCs), bitmaps, brushes, pens, regions, and font/text rendering. Applications never call `win32k` directly; they call the user-mode fronts `user32.dll` and `gdi32.dll`, which thunk down into the kernel. That split — a thin user-mode DLL over a fat kernel implementation — is exactly what makes the boundary interesting.

## The Shadow SSDT and GUI Threads

In the earlier article on system calls, we saw that a syscall number indexes the **System Service Descriptor Table** to find the kernel routine to run, with the core services in `KiServiceTable`. GUI services are dispatched through a *second* table that belongs to `win32k`: **`W32pServiceTable`**, commonly called the **shadow SSDT**. A range/bit in the system service number selects between the native table and the win32k table, so a call like `NtUserCreateWindowEx` or `NtGdiCreateBitmap` routes into `win32k` rather than `ntoskrnl`.

Threads are not born GUI-capable. A thread that makes its first graphical system call is promoted to a **GUI thread**: the kernel gives it a *larger kernel stack* (GUI call paths are deep) and allocates a win32k-specific per-thread information structure, **`THREADINFO`** (also seen as `W32THREAD`), which holds its message queue linkage, its desktop association, and other window-manager state. There is a matching per-process structure for win32k state. This promotion is why a purely computational service has a small stack while anything touching the UI carries the heavier GUI thread context.

## Window Stations and Desktops

The UI has its own object hierarchy, and it is secured like the rest of the system. **Window stations** are kernel objects living under `\Windows\WindowStations` in the object namespace (tie back to the Object Manager article). A window station contains a set of **desktops**, a **clipboard**, and an **atom table**. The interactive window station is `WinSta0`; only it can display UI and receive user input. Typical desktops include `Default` (the normal user desktop), `Winlogon` (the secure desktop used for the logon UI and UAC prompts), and the screen-saver desktop.

Crucially, window stations and desktops are **securable objects with DACLs** (tie to the access-tokens/security article). They form a genuine security boundary: a process attached to a non-interactive window station cannot post messages to windows on `WinSta0`. This is the mechanism behind **Session 0 isolation**— since Windows Vista, services run in session 0 with no interactive desktop, so they cannot be reached by the “shatter” style message attacks that plagued earlier Windows, where a low-privileged process sent crafted window messages to a high-privileged service’s window.

## Windows, Messages, and the WND Object

Every window you see is more than an `HWND` handle in user mode. Behind that handle sits a kernel structure, **`tagWND`**, allocated by `win32k` and holding the window’s style, rectangle, parent/child/sibling links, the pointer to its window procedure, and window-specific data. The `HWND` is an index into a **shared USER handle table** that maps handles to these kernel objects.

Input and communication flow through **messages**. Each GUI thread owns a **message queue**; window managers dispatch `WM_*` messages (paint, input, timers, and thousands of others) to the target window’s **window procedure**. Because the window procedure is a code pointer associated with a kernel-tracked object, and because messages carry parameters that the kernel and user mode both interpret, the window/message system is a rich and stateful interface — which is exactly what makes it both powerful and, historically, fragile.

## GDI and USER Handle Tables

GDI has its own object model. Device contexts, bitmaps, brushes, pens, fonts, and regions are all kernel-tracked **GDI objects**, referenced through the **GDI handle table**. This table is notable: it is maintained by `win32k` and mapped *read-only* into every process’s address space as a shared section, so user mode can quickly look up object metadata (each slot is a `GDICELL` -style entry recording the object type, owning process, and a pointer to the kernel object) without a syscall for read access. USER objects (windows, menus, hooks, cursors) are tracked in an analogous shared handle table.

Both tables are subject to **per-process and per-session quotas**— by default on the order of 10,000 GDI and 10,000 USER handles per process. A program (or a bug) that leaks handles can hit the limit and start failing to create windows or drawing objects; **handle exhaustion** is a classic cause of a GUI application mysteriously failing to render. The object-count columns in Task Manager exist precisely so you can watch for this.

## Inspecting win32k State

Because the GUI is kernel code, a kernel debugger sees straight into it, and user-mode tools expose the window/handle view:

```
# Kernel debugger (WinDbg), with win32k symbols loaded:

# Inspect the kernel window structure behind an HWND
dt win32k!tagWND

# The win32k per-thread and per-process info structures
!w32thread <THREADINFO-address>
!w32process <W32PROCESS-address>
dt win32k!_THREADINFO

# Enumerate the win32k system service table (the shadow SSDT)
dps win32k!W32pServiceTable

# --- User mode ---
# Spy++ (spyxx.exe): live tree of windows, classes, and the
# messages flowing to any window.

# Task Manager: add the "GDI objects" and "USER objects"
# columns to watch per-process handle usage and leaks.
```

`dt win32k!tagWND` reveals how much state hangs off a single window. `!w32thread` ties a thread to its message queue and desktop. `dps win32k!W32pServiceTable` lists the GUI service routines — the same table the shadow SSDT dispatches through. On a live system without a debugger, **Spy++** is the fastest way to explore the window hierarchy and watch messages, and the GDI/USER object columns in Task Manager turn abstract handle tables into a number you can trend.

## Security Relevance

`win32k` has produced a strikingly large share of all Windows **local privilege-escalation** vulnerabilities. That is not bad luck; it is structural, and understanding *why* is more useful than memorizing any single CVE:

-   **An enormous syscall surface.** The shadow SSDT exposes well over a thousand `NtUser*` and `NtGdi*` entry points, each taking attacker-controllable parameters directly into ring 0. More reachable kernel code means more room for validation mistakes.
-   **Kernel-to-user callbacks.** `win32k` uses `KeUserModeCallback` to call *back down* into user mode mid-operation (for example, to invoke a window procedure while a kernel operation is in progress). This re-entrancy has repeatedly produced **state-desynchronization** bugs: user-mode code, invoked during the callback, frees or alters an object the kernel still assumes is valid, leading to use-after-free.
-   **Object type confusion.** The many window, menu, and GDI object types, cross-linked and reference-counted, have historically enabled type-confusion and reference-count errors.
-   **Historical in-kernel font parsing.** Complex font-file parsing once ran inside `win32k`, turning a malicious font into a kernel bug.

The defensive response has been layered. **Win32k syscall filtering** (often called *win32k lockdown*) lets a process opt out of the shadow SSDT almost entirely — modern browsers and AppContainer-sandboxed processes enable it so a compromised renderer cannot reach the GUI attack surface at all. **Font parsing was moved out of the kernel** into an isolated user-mode `AppContainer` process. The **MinWin/ `win32kmin`** reduction removes GUI code from configurations that do not need it, and **Win32k type isolation** and additional integrity checks harden the remaining surface. For defenders and researchers, the takeaway is architectural: the size and re-entrant nature of this interface is the root cause, and attack-surface reduction (lockdown, isolation) is the most effective mitigation. Everything here is for defensive understanding and authorized testing only.

## Conclusion

The GUI is not a user-mode veneer on top of the kernel — it *is* kernel code, dispatched through its own shadow SSDT, backed by kernel objects like `tagWND` and the GDI/USER handle tables, and secured by window stations and desktops. That design bought Windows its responsive interface at the cost of an immense ring-0 attack surface, which is why `win32k` lockdown and font isolation are now standard hardening. Alongside the kernel-focused articles in this series — processes, memory, the object manager, syscalls — `win32k` is the other half of the picture: the part of the kernel that most users literally look at every day.

## You Might Also Like

This article is part of the Windows Internals series. These related deep-dives cover adjacent parts of the system:

-   [System Calls and the User-to-Kernel Transition](https://blog.yunolay.com/system-calls-user-to-kernel-transition/)
-   [The Windows Object Manager and Handle Tables](https://blog.yunolay.com/windows-object-manager-and-handle-tables/)
-   [Windows Security Internals: Access Tokens, SIDs, and DACLs](https://blog.yunolay.com/windows-access-tokens-sids-and-dacls/)
-   [Threads, KTHREAD, and the Windows Scheduler](https://blog.yunolay.com/threads-kthread-and-the-windows-scheduler/)

投稿 [The win32k GUI Subsystem: USER, GDI, and the Kernel Attack Surface](https://blog.yunolay.com/win32k-gui-subsystem-user-gdi-kernel-attack-surface/) は [Yunolay's Blog](https://blog.yunolay.com/) に最初に表示されました。
