---
title: Frida 17.23.1 Released | Frida • A world-class dynamic instrumentation toolkit
source: https://frida.re/news/2026/10/08/frida-17-23-1-released/
source_host: frida.re
clip_date: 2026-10-08T22:38:13+08:00
trace_id: bcb4073a-e863-4be3-9016-faef2f4de222
content_hash: 9fa88fa344c558caa0879c7eeabd43e92de3da23ef47ef89702a40b765bd16a3
status: synced
tags:
  - Frida
  - 安全工具
series: null
feed_source: Frida Releases
ai_summary: Frida 17.23.1 以 Barebone 后端补强为主，并把 frida-fs 升到 7.1.1 修掉 17.20.0 引入的 stat() 崩溃——凡在 agent 里访问文件系统的项目都需用本版重新构建。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f375244-d011-8131-8fde-e7e748eb911d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.23.1 以 Barebone 后端补强为主，并把 frida-fs 升到 7.1.1 修掉 17.20.0 引入的 stat() 崩溃——凡在 agent 里访问文件系统的项目都需用本版重新构建。
> 
> - **frida-fs 故障根因：** 17.20.0 给 `NativePointer#read*()` 增加可选 offset 参数后，`stat()` 误把路径当偏移，导致读取字段错乱；7.0.1 修复，本版捆绑 7.1.1。
> - **7.1.1 附带改进：** 列目录时跳过 `.` 与 `..`，支持 Windows 9x，导入时缺失的包装函数保留为 `null` 而非抛异常。
> - **Barebone 新增能力：** Windows NT/9x 与 Linux 注入的 agent 支持流对象（`Win32InputStream`/`Win32OutputStream` 及 UNIX 对应物），ANSI 字符串按进程代码页转换。
> - **错误字段上报：** `SystemFunction` 与 `Interceptor` 在 Windows 返回 `lastError`，Linux 侧读取 C 库线程局部 `errno`（不再恒为 0）。
> - **Windows 与稳定性修复：** `Module.enumerateImports()` 不再为空、`Process.getModuleByName()` 忽略模块名大小写，另修 Linux 内核符号过早释放的 use-after-free、Windows 9x 空闲循环无法唤醒等问题。

## Frida 17.23.1 Released

release

Mostly a Barebone release, teaching the agents it injects into user processes a few things that regular agents take for granted, but also with a frida-fs fix that anyone using it should know about.

## frida-fs

[frida-fs](https://github.com/nowsecure/frida-fs) is our implementation of Node.js’ *fs* module for GumJS, which is what makes *import fs from “fs”* work in an agent. It’s there so that code can be written once and run both in Node.js and inside a process, and so that packages written for Node.js can be used by Frida users as well. Frida.Compiler bundles it, and its *stat()* read each field by passing the path to *NativePointer#read\*()*, which has been fine for years, until 17.20.0 gave those readers an optional offset argument. The path was then taken as that offset, and *stat()* broke. frida-fs 7.0.1 fixes it, and this release bundles 7.1.1, which also skips the *.* and *..* entries when listing a directory, works on Windows 9x, and leaves a missing wrapped function as *null* instead of throwing at import. If your agent touches the filesystem, rebuild it with this release.

## Barebone

The agents that the Barebone backend injects into user processes, on Windows NT, Windows 9x and Linux, now back a few more of the APIs that scripts expect. Streams are there, so *Win32InputStream* and *Win32OutputStream*, and their UNIX counterparts, work in such a process, with the agent handing Gum the poll, read, write and close it needs. ANSI strings are converted through the code page of the process. *SystemFunction* and *Interceptor* report *lastError* on Windows and *errno* on Linux, where the agent reads the C library’s thread-local errno rather than returning zero. And on Windows, *Module.enumerateImports()* no longer comes back empty, while *Process.getModuleByName(“kernel32.dll”)* finds its module regardless of the case the guest uses.

A number of fixes came along with that work, listed below, from kernel symbols being freed too early on Linux to the Windows 9x main loop not being wakeable while idle.

Enjoy!

### Changelog

-   compiler: Bump frida-fs to 7.1.1, fixing *stat()* on 17.20.0 and later, skipping *.* and *..* in directory listings, supporting Windows 9x, and leaving a missing wrapped function as *null*.
-   barebone: Back streams and ANSI strings in the agents injected into user processes, so *Win32InputStream*, *Win32OutputStream* and their UNIX counterparts work there, with ANSI strings converted through the code page of the process.
-   barebone: Report *lastError* on Windows and *errno* on Linux through *SystemFunction* and *Interceptor*.
-   barebone: Enumerate the imports of Windows modules, so *Module.enumerateImports()* works on Windows 9x and NT.
-   barebone: Let the agent decide module name case, so *Process.getModuleByName()* finds modules in Windows guests.
-   barebone: Resolve a Linux agent’s own exports, so userspace names like *opendir* no longer fall through to the kernel symbol table.
-   barebone: Keep the Linux kernel symbols alive, fixing a use-after-free once the config was parsed.
-   barebone: Enable GLib’s IO features for the agent, and warm async I/O before the loop runs, so the first GIO user neither faults nor wedges the loop.
-   barebone: Give the Windows 9x loop its own wake event, so it can be woken while sleeping with nothing to watch.
-   barebone: Drop the Linux copy-status logging, as the kernel half already detects an agent’s exit.
-   gumjs: Build the stream module everywhere, and pick the system error field at runtime, so one Barebone build serves every flavor of agent.
