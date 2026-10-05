---
title: Frida 17.22.2 Released | Frida • A world-class dynamic instrumentation toolkit
source: https://frida.re/news/2026/10/05/frida-17-22-2-released/
source_host: frida.re
clip_date: 2026-10-05T16:29:50+08:00
trace_id: becb9927-6f5a-45ec-bc9d-a18d880e7e79
content_hash: f4892352dbb03ca4e80cfa512e5b7d58370801696a42945e7b2418ae6dba67f2
status: synced
tags:
  - Frida
  - Android逆向
series: null
feed_source: Frida Releases
ai_summary: Frida 17.22.2 修复 17.22.1 引入的线程退出崩溃，并修正 QuickJS 循环回收与新版 ART 启动镜像的 spawn 定位。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f075244-d011-813b-aed2-e4e910f0586b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.22.2 修复 17.22.1 引入的线程退出崩溃，并修正 QuickJS 循环回收与新版 ART 启动镜像的 spawn 定位。
> 
> - **glibc 崩溃修复：** 17.22.1 为 glibc 添加的栈丢弃逻辑假设所有退出线程都由 Frida 创建；GLib 被动接纳的外部 pthread 线程从未被实现化，退出时丢弃操作解引用 NULL 导致进程 SIGSEGV，现改为无可处理对象时跳过丢弃，并新增收养外部线程后任其退出的测试（由 @hsorbo 修复）。
> - **QuickJS 循环回收：** 循环收集器释放对象时，会释放以该对象为键的 WeakMap 条目所存的值；若这些存活值引用计数归零会被忽略，一直滞留到运行时销毁，其 finalizer 可能访问已不存在的状态。现在这类对象进入延迟列表，待循环移除结束后再释放。
> - **Android spawn 适配：** 新版 ART 会把启动映像的方法区复制到自己的 memfd 映射中，Frida 的 Android spawn 支持现在也会在 *boot-image-methods.art* 中查找 *setArgV0()* JNI 槽位（由 @mbv06 发现）。
> - **版本定位：** 这是 17.22.1 的快速跟进版本，除上述回归修复外还包含同期合入的其他修复。

## Frida 17.22.2 Released

release

A quick follow-up to fix a regression in 17.22.1, plus a couple of other fixes that landed in the meantime.

The stack discard we added for glibc in 17.22.1 assumed every exiting thread had been set up by us. Threads that GLib merely adopted, because a foreign pthread called into it, are still finalized on exit but were never realized, so the discard dereferenced NULL and took the process down with it. A frida-node consumer that attached, loaded a script and exited died with SIGSEGV, and so did a long test run once one of these threads went away mid-run. [@hsorbo](https://twitter.com/hsorbo) fixed it to skip the discard when there is nothing to work from, and added a test that adopts a foreign thread and lets it exit.

Håvard also fixed a long-standing issue in our QuickJS fork. When the cycle collector frees an object, it releases the values of any WeakMap entries keyed by it. Those values are live objects that survived the scan, and if such a release dropped one’s refcount to zero, it was ignored because the runtime was busy removing cycles, and nothing ever revisited it. It sat there with a zero refcount until runtime teardown, by which time its finalizer might touch state that no longer existed. Such objects are now collected on a deferred list and freed once cycle removal has finished, like any other object whose refcount reaches zero.

Finally, [@mbv06](https://github.com/mbv06) noticed that newer ART copies the boot image’s methods section into its own memfd mapping, so our Android spawn support now also looks for the *setArgV0()* JNI slot in *boot-image-methods.art*.

Enjoy!

### Changelog

-   glibc: Skip the stack discard for adopted threads, fixing a crash on thread exit introduced in 17.22.1. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   quickjs: Free live objects released while removing cycles, so values released through WeakMap entries during cycle collection get their finalizers run instead of lingering until runtime teardown. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   android: Scan *boot-image-methods.art* for the *setArgV0()* JNI slot, as newer ART maps the boot image’s methods section separately. Thanks [@mbv06](https://github.com/mbv06)!
