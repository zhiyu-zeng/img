---
title: "Exploring macOS Sandbox Profiles: Pre-Defined Rules | Reverse Society"
source: https://blog.reversesociety.co/blog/2025/how-to-find-pre-defined-rules-in-macos-sandbox-profiles
source_host: blog.reversesociety.co
clip_date: 2026-09-22T10:21:52+08:00
trace_id: 3df5d3cd-4c2e-4938-90df-2c5d5c6f8d00
content_hash: 08f914120bd01ccd4de0ca2bb67a56b002b6290c1cb54a7747184b19432799a5
status: synced
tags:
  - macos
  - 反调试
series: null
feed_source: Reverse Society·iOS/macOS
ai_summary: macOS 的沙箱配置用 Scheme 类语言编写，`(network-client)` 这类"魔法"符号其实是 `define` 定义的宏，可在系统沙箱配置目录中 grep 到其展开的具体规则。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3e375244-d011-8145-94ec-ef94984fbbb6
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> macOS 的沙箱配置用 Scheme 类语言编写，`(network-client)` 这类"魔法"符号其实是 `define` 定义的宏，可在系统沙箱配置目录中 grep 到其展开的具体规则。
> 
> - **配置文件位置：** 系统沙箱策略源码分两处，`/System/Library/Sandbox/Profiles`（应用级，如 `application.sb`）与 `/usr/share/sandbox/`（底层或系统服务级，如 `bluetoothd.sb`）。
> - **宏定义形式：** 宏由 `(define (<macro-name>) ...)` 声明，例如 entitlements 中调用的 `(network-client)` 并非内置原语。
> - **定位方法：** 用 `grep -R --line-number '(define (network-client)' /System/Library/Sandbox/Profiles /usr/share/sandbox/` 搜索定义位置。
> - **实际定义：** 该宏位于 `appsandbox-common.sb:415`，展开为 `(system-network)`、`allow network-outbound (remote ip)`，以及一系列 `mach-lookup` 的 `global-name` 白名单（如 `com.apple.airportd`、`com.apple.nsurlsessiond` 等）。
> - **分析价值：** 与其凭直觉认为"某 entitlement 允许联网"，不如直接查看宏展开后精确授予的 `allow` 子句集合。

[](https://blog.reversesociety.co/blog?tag=macos)

[macos](https://blog.reversesociety.co/blog?tag=macos)

[

sandbox

](https://blog.reversesociety.co/blog?tag=sandbox)[

reverse engineering

](https://blog.reversesociety.co/blog?tag=reverse%20engineering)

## Context

When examining Apple’s sandbox profiles you’ll often encounter “mystery” symbols such as:

```scheme
(when (entitlement "com.apple.security.network.client")
  (network-client))
```

At first glance `(network-client)` seems magical — but it’s simply a macro defined elsewhere. So, where do these definitions actually live?

* * *

## System Sandbox Profiles

The answer is in the system’s sandbox policy sources, which macOS ships in two main locations:

-   `/System/Library/Sandbox/Profiles` → high-level application profiles (e.g. `application.sb`).
-   `/usr/share/sandbox/` → lower-level or system service profiles (e.g. `bluetoothd.sb`).

These files use a Scheme-like language. Knowing where they are is the first step—but how do we trace what a macro like `(network-client)` really means?

* * *

## Tracing a Macro

To answer that, remember that macros are declared with the `define` form:

```scheme
(define (<macro-name>) ...)
```

To locate the definition of `(network-client)`, search for it within the system profiles:

```bash
grep -R --line-number '(define (network-client)' \
  /System/Library/Sandbox/Profiles /usr/share/sandbox/
```

Example output:

```
/System/Library/Sandbox/Profiles/appsandbox-common.sb:415:(define (network-client)
```

Opening the file reveals the full macro definition:

```scheme
(define (network-client)
  (system-network)
  (allow network-outbound (remote ip))
  (allow mach-lookup
         (global-name
           "com.apple.NetworkDiagnostic.agent"
           "com.apple.WebKit.PluginAgent"
           "com.apple.airportd"
           "com.apple.cfnetwork.AuthBrokerAgent"
           "com.apple.cfnetwork.cfnetworkagent"
           "com.apple.corewlan-xpc"
           "com.apple.nesessionmanager.content-filter"
           "com.apple.networkserviceproxy.fetch-token"
           "com.apple.nsurlsessiond")))
```

Understanding these macros shows how Apple translates simple entitlements into very concrete sets of rules. Instead of thinking “this entitlement allows networking,” you can see the precise `allow` clauses that are granted.

Hope it helps!
![Tony Gorez, Offensive Security Researcher](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e518e176c75b8261.png)
