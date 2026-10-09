---
title: Frida 17.23.2 Released | Frida • A world-class dynamic instrumentation toolkit
source: https://frida.re/news/2026/10/09/frida-17-23-2-released/
source_host: frida.re
clip_date: 2026-10-09T22:35:14+08:00
trace_id: 3d6c20f4-0a37-468b-b6ba-7ca0e823f716
content_hash: 9480429c367af4919965124ece38c2ee4d0ada6f27dc33278dfff4c815a5402a
status: synced
tags:
  - Frida
  - Hook
series: null
feed_source: Frida Releases
ai_summary: Frida 17.23.2 发布，修掉 Linux 模块枚举地址误判、Sqlite 整数绑定截断，以及 agent 卸载后 hook 残留导致的崩溃。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f475244-d011-8152-bb45-e20f21c54892
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.23.2 发布，修掉 Linux 模块枚举地址误判、Sqlite 整数绑定截断，以及 agent 卸载后 hook 残留导致的崩溃。
> 
> - **Linux 模块枚举：** 从 `r_debug` 同步模块时把 `l_addr` 当成 ELF 头地址，实际它是 load bias。二者仅在首个 `PT_LOAD` 位于虚拟地址 0 时才一致；对 `-Ttext-segment` 链接的镜像会报地址 0 空范围，或读未映射内存而崩溃。现仅在 `l_addr` 指向含该模块动态段的 ELF 头时才采信，否则改用持有该镜像的映射定位。
> - **Sqlite 绑定：** `SqliteStatement.bindInteger()` 原先先按 32 位解析再交给 SQLite 的 64 位绑定，QuickJS 会把 4294967301 静默截断成 5，V8 则直接拒绝调用。现按 64 位解析，并支持传入 `Int64`、`BigInt`。
> - **Interceptor 泄漏：** 自 17.19.0 起 interceptor 与 unwind broker 互相持有引用，全平台上 agent 卸载时两者都不释放，broker 放置的 hook 活得比 agent 更久。Windows 上残留的是 `RtlVirtualUnwind` 实现上的 hook，目标下次异常展开会跳进已卸载的 agent 并崩溃。修法是让 interceptor 自己激活 unwind 后端、在 dispose 时停用，从而打破引用环。
> - **社区贡献：** 三个修复全部来自外部——新贡献者 @Cassian433 一天内交了两个 PR；@alex19EP 的报告已自行二分定位到具体 commit，并附复现、残留 hook 快照与引用环说明。

## Frida 17.23.2 Released

release

Three fixes, and all three thanks to contributors: two well-researched pull requests from [@Cassian433](https://github.com/Cassian433), a new contributor who showed up with both in one day, and a bug report from [@alex19EP](https://github.com/alex19EP) that had already done the detective work.

The first is for Linux module enumeration. When syncing modules from the dynamic linker’s *r_debug* list, we treated *l_addr* as the address of the ELF header, when it is actually the load bias. The two coincide for the vast majority of images, but not for one whose first *PT_LOAD* segment isn’t at virtual address zero, such as a binary linked with *\-Ttext-segment*. For those we either reported the module at address zero with an empty range, or read unmapped memory and crashed. We now only trust *l_addr* when it holds an ELF header describing an image that contains the module’s dynamic section, and otherwise locate the image through the mapping that holds it.

The second is for *SqliteStatement.bindInteger()*, which parsed its value as a 32-bit integer before handing it to SQLite’s 64-bit binding. QuickJS silently truncated 4294967301 to 5, while V8 refused the call. It now parses a 64-bit value, which also means you can pass an *Int64* or a *BigInt*.

The third fixes a leak that kept Interceptor hooks alive past script unload. Since 17.19.0, the interceptor and its unwind broker kept each other alive, so neither was disposed when the agent unloaded, on any platform, and the hooks the broker had placed outlived the agent. On Windows that was our hook on *RtlVirtualUnwind* ’s implementation, so the target’s next exception unwound into the unloaded agent and crashed it. [@alex19EP](https://github.com/alex19EP) ran into this while inspecting a game for an accessibility mod, and filed a report that bisected it to the exact commit, with a repro, snapshots of the leftover hook, and the reference cycle spelled out: the unwind broker’s backend held a reference to the interceptor, which held the broker. All I had to do was break the cycle. Thanks!

Enjoy!

### Changelog

-   linux: Stop taking *l_addr* for the ELF header when syncing modules from *r_debug*, fixing images whose first *PT_LOAD* isn’t at virtual address zero. Thanks [@Cassian433](https://github.com/Cassian433)!
-   gumjs: Support 64-bit values in *SqliteStatement.bindInteger()*, including *Int64* and *BigInt*. Thanks [@Cassian433](https://github.com/Cassian433)!
-   interceptor: Fix a leak that kept hooks alive past unload, by letting the interceptor activate the unwind backend and deactivate it on dispose. Thanks for the stellar bug report, [@alex19EP](https://github.com/alex19EP)!
