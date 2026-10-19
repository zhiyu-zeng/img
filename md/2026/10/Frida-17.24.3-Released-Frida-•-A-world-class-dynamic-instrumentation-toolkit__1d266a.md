---
title: Frida 17.24.3 Released | Frida • A world-class dynamic instrumentation toolkit
source: https://frida.re/news/2026/10/19/frida-17-24-3-released/
source_host: frida.re
clip_date: 2026-10-19T17:45:46+08:00
trace_id: 145f233f-e306-4012-b1eb-19b4855ad744
content_hash: b4bf0a4f82536c6d455af1d52e830523e259782b83a152b748cf1b4d8bd25224
status: synced
tags:
  - Frida
  - 安全工具
series: null
feed_source: Frida Releases
ai_summary: TL;DR：Frida 17.24.3 修复了 QuickJS 分配器钩子未更新堆统计、导致循环垃圾只能靠显式 gc() 回收的问题，修正了 V8 在 arm64e 指针认证下的栈扫描回调调用方式，并改善 Linux 上的 iOS 设备发现。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fe75244-d011-81be-ae20-d3a11de29d59
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：Frida 17.24.3 修复了 QuickJS 分配器钩子未更新堆统计、导致循环垃圾只能靠显式 gc() 回收的问题，修正了 V8 在 arm64e 指针认证下的栈扫描回调调用方式，并改善 Linux 上的 iOS 设备发现。
> 
> - **QuickJS 堆统计：** 分配器钩子此前从不更新堆用量，计数器始终为 0；由于 QuickJS 根据已分配内存量决定何时回收循环垃圾，这些垃圾会一直保留到显式调用 gc()。现在钩子会跟踪堆用量，自动回收重新生效（由 @ShenKecyes 报告）。
> - **运行时字节码：** 新版 QuickJS 默认同时保留源码和字节码；预编译运行时已剥离源码、保留调试信息，因此堆栈帧仍能解析，体积从 71 KB 降至 28 KB。
> - **采样器泄漏：** QuickJS finalizer 以类为单位注册，此前只有基类 Sampler 有 finalizer，因此 JS 创建的每个 sampler 都会泄漏；CallCountSampler 在 unload 后仍保持挂接，后续 Stalker 测试跟踪线程、穿过陈旧钩子时，在分配器锁上死锁。
> - **arm64e 指针认证：** 首次扫描栈的 GC 中，V8 栈遍历器用普通 BLR 调用回调，而回调是以 IA key 签名的 C 函数指针，于是分支落在签名值上；主机启用指针认证时，现在改用 BLRAAZ 调用。
> - **其它修复：** Linux 上发现 iOS 设备时，若 systemd-resolved 不可用或关闭 mDNS，则回退到 D-Bus 上的 Avahi；mDNS 响应超时的错误提示会指向 netfilter 丢包规则。XPC 修复了大于 HTTP/2 窗口的回复卡住（此前只补充连接级窗口，未补充流级窗口）的问题，double 与 date 对象现在会被解码。macOS 上 OpenSSL 版 glib-networking 每次查询信任库都崩溃；原因是有两个 Security 框架常量是 CFSTR() 宏而非导出符号，dlsym() 返回 NULL，现在改为构造字符串。

## Frida 17.24.3 Released

release

Fallout from the QuickJS rebase, found by [@ShenKecyes](https://github.com/ShenKecyes), a V8 fix for pointer authentication by [@hsorbo](https://twitter.com/hsorbo), and better iOS device discovery on Linux.

## QuickJS

ShenKecyes read our allocator hooks and noticed that they never updated the heap statistics QuickJS keeps. QuickJS decides when to collect cycles based on the amount of memory allocated, so with that counter stuck at zero, cyclic garbage lived until an explicit *gc()*. The hooks now track usage, and collection kicks in on its own again.

They also spotted that current QuickJS keeps the source along with the bytecode by default, which the old version never did. Our precompiled runtime is now stripped of its source, while the debug info stays so that stack frames in it still resolve. The runtime bytecode went from 71 to 28 KB. Thanks for the thorough report!

Along the way I found that QuickJS finalizers are per class, and only the base *Sampler* had one, so every sampler created from JS leaked. A *CallCountSampler* thus stayed attached after unload, and a later Stalker test following a thread through the stale hook deadlocked on the allocator lock.

## V8 on arm64e

Håvard tracked down a fault in the first garbage collection that scanned the stack, in processes using pointer authentication. V8’s register-pushing stack walker calls its callback through a plain *BLR*, but the callback arrives as a C function pointer signed with the IA key, so the branch landed on the signed value. It now branches through *BLRAAZ* when the host authenticates pointers. Thanks!

## iOS devices on Linux

Discovering an iOS device over the network on Linux relied on systemd-resolved for mDNS browsing. Where it isn’t running, or has multicast DNS turned off, we now fall back to Avahi over D-Bus, resolving the pairing service the same way. And if the mDNS reply never arrives, the timeout error now suggests that a netfilter rule may be dropping it, as that is what it usually turns out to be.

Two XPC fixes came out of the same session. Replies larger than the HTTP/2 window stalled, as only the connection-level window was replenished and never the stream’s. And *double* and *date* objects are now decoded instead of being rejected.

## macOS

Our OpenSSL-backed glib-networking crashed on every macOS trust store lookup. Mistakes were made when porting our existing patch to the new glib-networking: two of the Security framework constants it looked up are *CFSTR()* macros rather than exported symbols, so *dlsym()* returned *NULL*. They are now created as strings.

Enjoy!

### Changelog

-   gumjs: Track QuickJS heap usage in the allocator hooks, so cycles are collected without an explicit *gc()*. Thanks [@ShenKecyes](https://github.com/ShenKecyes)!
-   gumjs: Strip the source from the QuickJS runtime bytecode, keeping debug info, shrinking it from 71 to 28 KB. Thanks [@ShenKecyes](https://github.com/ShenKecyes)!
-   gumjs: Finalize QuickJS sampler subclasses, fixing a leak that kept samplers attached after unload.
-   v8: Authenticate the stack scan callback on arm64e. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   fruity: Fall back to Avahi for mDNS browsing when systemd-resolved isn’t available or has multicast DNS disabled.
-   fruity: Suggest a firewall rule as the cause when an mDNS reply times out.
-   fruity: Fix XPC flow control for replies larger than the HTTP/2 window.
-   fruity: Decode *double* and *date* XPC objects.
-   glib-networking: Fix the macOS trust store lookup, which crashed since the last SDK bump.
