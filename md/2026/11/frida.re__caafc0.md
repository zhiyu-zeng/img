---
title: frida.re
source: https://frida.re/news/2026/11/23/frida-17-27-5-released/
source_host: frida.re
clip_date: 2026-11-26T11:55:12+08:00
trace_id: 1d4fe4dc-6901-42ae-b1c5-c7c7ff37661f
content_hash: 69e7233529b4625918387b1a4564a2673f06700d55a51de084afae4223d61749
status: synced
tags:
  - Frida
  - 安全工具
series: null
feed_source: Frida Releases
ai_summary: Frida 17.27.5 是一个以修复泄漏、挂起和崩溃为主的版本，核心是让映射式注入（mapper）在 Windows/macOS/iOS/Android 上更稳定。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42475244-d011-8124-bd99-ef10b1e12f23
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.27.5 是一个以修复泄漏、挂起和崩溃为主的版本，核心是让映射式注入（mapper）在 Windows/macOS/iOS/Android 上更稳定。
> 
> - **Windows 线程句柄泄漏：** 自 17.25.0 起 agent 以映射方式注入，每次 attach 会在目标进程留下 7–8 个已退出线程的句柄；因 GLib 仅依赖 loader 的线程 detach 通知（映射镜像收不到），现改为线程自行清理，非 GLib 启动线程的私有数据改走 fiber-local storage。
> - **attach 相关修复：** 映射失败时 `attach()` 永久不返回（错误域未传播，任务被丢弃）；对已退出但仍有句柄的进程按 PID attach 报 “Unable to allocate target memory”，现统一按“进程不存在”上报。
> - **ARM64 / TLS 与 dbghelp：** Windows 11 26H1 ARM64 上静态 TLS 镜像映射失败，改为按行为识别 loader TLS 例程（与 x86 17.26.0 思路一致，同一解码器覆盖原生与模拟进程）；映射的 dbghelp 现重定向 `GetModuleFileNameW()`，使 symsrv.dll 可加载符号。
> - **移动端与其他：** iOS 修复设备开机后一直不可达（未关闭废弃的 NCM 驱动，重试不断新建）；Android 修复关闭本地会话后重开崩溃（ART 不能同进程建第二个 VM，helper 改为每进程一次并共享）；macOS 目录监控改用 FSEvents，gadget/inject 用 FileMonitor 监听脚本变更。
> - **拆除与编译：** 断开连接时 pending-call 计数下溢导致 DeviceManager 关闭永久挂起，已修复；CModule 外部工具链不再把编译错误包装成链接错误。

## Frida 17.27.5 Released

release

A bug-fix release, with [@kkuehl](https://github.com/kkuehl) behind most of it: a leak of thread handles in every Windows process we attach to, an attach that never returned, a crash on Android when opening a second local session, and a rare hang on teardown. Windows 11 26H1 on ARM64 works with our mapper, our mapped dbghelp can reach symbol servers thanks to [@mochaaP](https://github.com/mochaaP), and [@mrmacete](https://twitter.com/bezjaje) fixed iOS devices that stayed unreachable after booting.

## Windows

Since 17.25.0 our agent is mapped into the target rather than loaded by the system’s loader. Kirby found that every attach then left seven to eight thread handles open in the target, each to a thread that had already exited. GLib only cleaned up a thread on the thread-detach notification, which the loader never sends to an image it doesn’t know about. A thread GLib started now cleans up on its own way out. Threads GLib didn’t start had the same problem with their private data, which stayed allocated and fragmented the heap of a long-lived agent in a process that keeps creating threads. Those are now cleaned up through a fiber-local storage slot, which is how the POSIX backend has always done it with a pthread key.

Kirby also fixed two issues around attaching:

-   When the mapper couldn’t map the agent, *attach()* never returned. The error arrived in a domain that wasn’t propagated, so the task was dropped without being completed.
-   A process that has exited can still be opened by PID for as long as anyone holds a handle to it. Attaching to one failed with “Unable to allocate target memory”. It is now reported the same way as a PID that no longer exists, with and without the mapper.

On ARM64, mapping an image with static TLS aborted on Windows 11 26H1, as [@januwA](https://github.com/januwA) reported. The heuristics for finding the loader’s TLS routines expected fixed registers and a flags check, and the compiler had laid them out differently. They are now recognized by what they do, as on x86 since 17.26.0, with the same decoder used for native and emulated processes. This was validated against ntdll from Windows 10 19041 and Windows 11 22000, 22621, 26100, 26200 and 28000, in their native, ARM64EC and CHPE flavors.

And [@mochaaP](https://github.com/mochaaP) noticed that our mapped dbghelp never got as far as loading symsrv.dll. Being unknown to the loader, it failed to look up its own path. We now answer with the main executable’s path, so the path it derives still hits our redirects. Thanks, all three!

## macOS

Gadget and frida-inject can watch scripts and reload them when they change. In a watched directory on macOS, a write to an existing file went unnoticed, as GLib’s kqueue backend only diffs directory listings. Our *FileMonitor*, which both now use, watches directories through FSEvents there.

## iOS

Francesco fixed devices staying unreachable until *idund* was restarted. When a device didn’t reveal its IPv6 address within two seconds, as while still booting after an erase or after enabling developer mode, the NCM driver was left running. Every retry opened another one, and with several of them consuming frames from the device, the datagram carrying the address almost always ended up in an abandoned one. Abandoned drivers are now closed. Thanks!

## Android

Kirby found that closing the local session and opening another crashed. The local backend runs its helper in a Java VM that it creates inside the host process, and destroyed it when the session closed, but ART can’t create a second VM in the same process. frida-server never sees this, as it keeps one session for its whole life, but an embedder does. The helper is now started once per process and shared between sessions.

Process enumeration also failed altogether when a process ran as a uid without a passwd entry. The user is now left out for such a process, and the uid is always provided, as on Linux.

## Teardown

Kirby also tracked down a rare hang when closing a *DeviceManager*, seen on macOS. A reply queued just before the peer vanished could pass through the agent’s message filter after the connection had closed, wrapping its count of pending calls below zero. Unload then waited forever for calls that would never complete. Thanks for all of these, Kirby!

## CModule

With the external toolchain, compile errors read “Linking failed: Compilation failed: …”, as that toolchain compiles while linking. Each backend now picks its own prefix.

Enjoy!

### Changelog

-   glib: Clean up threads without relying on thread-detach on Windows, fixing leaked thread handles and private data in mapped agents. Thanks [@kkuehl](https://github.com/kkuehl)!
-   glib: Don’t wait forever when a D-Bus client rejects the server’s authentication data. Thanks [@DJm00n](https://github.com/DJm00n)!
-   windows: Fix *attach()* hanging when mapping fails. Thanks [@kkuehl](https://github.com/kkuehl)!
-   windows: Report exited processes as not found, with and without the mapper. Thanks [@kkuehl](https://github.com/kkuehl)!
-   pe-mapper: Find the ARM64 loader TLS routines robustly, fixing Windows 11 26H1. Thanks [@januwA](https://github.com/januwA)!
-   dbghelp: Redirect *GetModuleFileNameW()*, so symsrv.dll gets loaded. Thanks [@mochaaP](https://github.com/mochaaP)!
-   file-monitor: Use FSEvents for macOS directories.
-   gadget: Watch scripts with *FileMonitor*.
-   inject: Watch the script with *FileMonitor*.
-   agent: Fix a pending-call underflow on disconnect, which could hang teardown. Thanks [@kkuehl](https://github.com/kkuehl)!
-   idun: Close abandoned NCM drivers. Thanks [@mrmacete](https://twitter.com/bezjaje)!
-   android: Share the in-process helper between sessions. Thanks [@kkuehl](https://github.com/kkuehl)!
-   android: Omit the user when a uid has no passwd entry. Thanks [@kkuehl](https://github.com/kkuehl)!
-   cmodule: Don’t wrap compile errors as link errors.
