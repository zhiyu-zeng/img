---
title: frida.re
source: https://frida.re/news/2026/11/02/frida-17-25-2-released/
source_host: frida.re
clip_date: 2026-11-03T05:44:35+08:00
trace_id: 534fe47b-149d-4ebf-9ee0-e237890ea463
content_hash: fede7480d8fb41740916243eae13dd18f108be4a82ca50711314b217e60eb7ce
status: synced
tags:
  - Frida
  - Android逆向
series: null
feed_source: Frida Releases
ai_summary: Frida 17.25.2 修复 Android x86_64 附加崩溃、GumJS 字节码冗余与弱引用复活、Idun 配对迁移与老设备 USB 回退等问题。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40c75244-d011-8177-8d0d-fe356bf52f67
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.25.2 修复 Android x86_64 附加崩溃、GumJS 字节码冗余与弱引用复活、Idun 配对迁移与老设备 USB 回退等问题。
> 
> - **模块基址误判：** 17.25.1 的启发式把“文件偏移为零、可执行”的映射当基址，导致 libdl.so 因代码与头共享首页而被高估一页，x86_64 Android 上 attach 即崩溃；现改按库自身 ELF 布局判定，并移除了 libc 特例。
> - **ABI 匹配：** native bridge 下 arm64 客体库可能先于 x86_64 宿主库映射，按 basename 查依赖会把 agent 错绑到 guest libc；mapper 现仅接受机器类型与指针宽度一致的库。
> - **GumJS 两处修复：** compile_script() 生成的字节码现会剥离源码（QuickJS v5 序列化器默认内嵌函数源片段，曾致嵌套函数体重复）；Script._derefWeak() 对已回收目标直接返回 undefined，避免复活半释放对象。
> - **Idun 配对存储：** 原先急切创建配对存储会在 ~/.config/idun 生成新宿主身份，阻断旧版配对记录迁移并迫使设备重新配对；现仅在进程内路径需要时才创建。
> - **老设备与 Linux：** 不支持 CoreDevice 的设备（如 iOS 15.8.8 的 iPhone SE）隧道查找现回退到 USB 而非报 NOT_SUPPORTED；Linux 上补注册 OpenSSL GIO 后端，修复 PEM TLS 证书加载失败。

## Frida 17.25.2 Released

release

More mapper fallout on Android, this time on x86_64, tracked down by [@leonitousconforti](https://github.com/leonitousconforti), two GumJS fixes from [@esauvisky](https://github.com/esauvisky), and Idun fixes from [@hsorbo](https://twitter.com/hsorbo) and [@miikaoskari](https://github.com/miikaoskari) for those upgrading from an earlier Frida or using an older iPhone.

## Android

Leo found that 17.25.1 crashed on attach on x86_64 Android, one page past *dladdr()* in libdl.so. The heuristic we introduced in that release for picking a library’s base starts a new candidate at every mapping with file offset zero and prefers executable ones, which breaks libraries whose code shares the first file page with their headers, as libdl.so does there: the code mapping was picked as the base, one page too high. The mapper now uses the library’s own ELF layout instead, accepting a mapping at file offset zero as the base only if the code segments are mapped executable where the linker would have put them. That also rejects stray mappings of the file, so the special case for Android’s libc is gone.

He also found that with a native bridge, the arm64 guest libraries may be mapped before the x86_64 host ones, and since the mapper looked up dependencies by basename, the x86_64 agent got bound to the guest libc. It now only accepts libraries whose machine and pointer size match the agent. Thanks for the precise reports!

## GumJS

Emi found that bytecode produced through *compile_script()* still carried the source. Since QuickJS bytecode version 5, the serializer includes each function’s source slice unless source stripping is enabled on the runtime, so nested function bodies were duplicated throughout the blob. The compile task now strips the source, matching what we did for the prebuilt runtime in 17.24.3.

They also found a window where *Script.\_derefWeak()* could resurrect a half-freed object. QuickJS sweeps dead weak references when the scope exits, so a target collected mid-scope lingers in our callback table with its children already freed, and dereferencing it then duplicated the dead value. Dead targets now return *undefined* right away. Thanks!

## Idun

Håvard found that upgrading to 17.25 made paired devices ask to pair again. Idun’s device monitor created its pairing store eagerly, which generated and persisted a fresh host identity under *~/.config/idun* even for clients using *idund*, where the store is never used. That also defeated Frida’s migration of pre-Idun pairing records, which skips when the Idun config directory already exists. The store is now created only on the in-process path that uses it. Thanks!

Miika got Frida working against an iPhone SE on iOS 15.8.8 from Ubuntu. On devices predating CoreDevice, the tunnel lookup reported *NOT_SUPPORTED* as an error rather than falling back to USB, resulting in a misleading complaint about a missing Developer Disk Image. And on Linux, the OpenSSL GIO backend was never registered, so loading a TLS certificate from PEM failed. Thanks!

Enjoy!

### Changelog

-   linux: Find module bases using the ELF layout in the mapper, fixing a crash on x86_64 Android. Thanks [@leonitousconforti](https://github.com/leonitousconforti)!
-   linux: Skip libraries of a foreign ABI in the mapper, fixing a crash on x86_64 Android with a native bridge. Thanks [@leonitousconforti](https://github.com/leonitousconforti)!
-   gumjs: Strip source in bytecode produced by *compile_script()*. Thanks [@esauvisky](https://github.com/esauvisky)!
-   gumjs: Return *undefined* from *Script.\_derefWeak()* for targets already collected. Thanks [@esauvisky](https://github.com/esauvisky)!
-   idun: Only create the pairing store when needed, fixing the migration of pairing records from earlier Frida versions. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   idun: Fall back to USB for devices predating CoreDevice. Thanks [@miikaoskari](https://github.com/miikaoskari)!
-   idun: Register the OpenSSL GIO backend on Linux. Thanks [@miikaoskari](https://github.com/miikaoskari)!
