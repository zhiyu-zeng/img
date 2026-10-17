---
title: Frida 17.24.1 Released | Frida • A world-class dynamic instrumentation toolkit
source: https://frida.re/news/2026/10/17/frida-17-24-1-released/
source_host: frida.re
clip_date: 2026-10-17T19:14:43+08:00
trace_id: 5fe84ee3-8c4d-4eca-be13-40bdba57c4bf
content_hash: 9e3cd4f3083383b659ed6cd3875e72ce9ee096b27081792a2baee2d6f52a0f13
status: synced
tags:
  - Frida
  - 安全工具
series: null
feed_source: Frida Releases
ai_summary: Frida 17.24.1 是面向 17.24.0 的快速修复版本，重点提升 Frida.Compiler 的 Node.js 兼容性，并补全 Swift ApiResolver 的符号表解析和 .NET 包内置编译器。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fc75244-d011-81f6-a058-f8e404cdee33
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.24.1 是面向 17.24.0 的快速修复版本，重点提升 Frida.Compiler 的 Node.js 兼容性，并补全 Swift ApiResolver 的符号表解析和 .NET 包内置编译器。
> 
> - **require() 语义修正：** 现在 `require()` 返回 default export 并合并具名导出，使 CommonJS 风格的包（如 `require("events")` 得到 EventEmitter 构造器）与 ES 模块两种写法都可用；这正是 FTP、Koa HTTP 服务、IRC 客户端等 `@frida/net` 示例恢复运行的关键。
> - **不支持的 Node 内建模块：** `child_process`、`zlib`、`tls`、`worker_threads` 等改为解析为空模块（沿用旧 frida-compile 行为），避免仅可选路径引用它们的包在打包阶段报错；同时注入 `global`、`Blob`、`ReadableStream`、`Response` 等全局对象。
> - **shim 新增与升级：** 新增 `stream/web`（基于 `@frida/web-streams`）、无警告版 `depd`、`@frida/fetch`；`crypto` 升至 1.1.0，加入 `randomBytes()`、`randomFillSync()`、`getRandomValues()`、`Hash.copy()`，并修复 `Hash.update()` 对视图与输入编码的处理；`http-parser-js`、`process`（加 stdin/stdout/stderr）、`buffer`（加 Blob）也同步更新。
> - **Swift ApiResolver：** 此前只收集模块导出与类 vtable，导致 `functions:` 查询看不到内部方法、自由函数与值类型初始化器；现在会遍历符号表，重复地址只列一次。
> - **.NET 与 Darwin：** frida-net CI 启用编译器后端，NuGet 上的 `Frida.NET.Runtime` 包开始暴露 `Frida.Compiler`（Linux mips64 与 Windows arm64 除外）；Darwin 上 V8 不再链接 CoreFoundation，改为读取 `/etc/localtime`。

## Frida 17.24.1 Released

release

A quick follow-up to yesterday’s release. Frida.Compiler got a lot better at running code written for Node.js, [@hsorbo](https://twitter.com/hsorbo) taught the Swift ApiResolver to read symbol tables, and the.NET packages now ship with the compiler built in.

## Node.js compatibility

Getting the [@frida/net examples](https://github.com/frida/gumjs-net/tree/main/examples) working again turned into a tour of what Frida.Compiler’s Node.js shims were missing. Those examples run an FTP server, a Koa-based HTTP server and an IRC client inside the target process, built on packages written for Node.js that know nothing about Frida. They all work now, and the fixes benefit any agent that pulls in such packages.

The biggest one is *require()*. Node hands it *module.exports*, which for a module like *events* is *EventEmitter* itself, so *require(“events”)* is expected to return a constructor. We returned the ES module namespace, and anything written in CommonJS style got an object with a *default* property instead. The named exports are now merged into the default export, so both styles work.

Builtins we don’t support, such as *child_process*, *zlib*, *tls* and *worker_threads*, now resolve to an empty module, like the old frida-compile did, so a package that only touches them on an optional path loads instead of failing at bundle time. And the globals that Node code tends to assume are injected: *global* as an alias for *globalThis*, *Blob*, *ReadableStream* and *Response*.

A few shims are new. *stream/web* is backed by *@frida/web-streams*, *depd* by a version without the deprecation warnings, as the real one needs V8 stack traces, and *@frida/fetch* provides the Fetch API classes so code can probe for them. The existing ones got updates too. *crypto* now has *randomBytes()*, *randomFillSync()* and *getRandomValues()*, drawing from the OS CSPRNG, and *Hash.update()* honors views into a larger buffer along with the input encoding, thanks to [@Furtif](https://github.com/Furtif) and [@Flechaa](https://github.com/Flechaa), and validates hex input, thanks to Håvard. *Hash.copy()* is there as well. *http-parser-js* is synced with upstream and no longer trips strict mode, thanks to [@thinhbuzz](https://github.com/thinhbuzz). *process* grew *stdin*, *stdout* and *stderr*, which packages like *debug* check for, and *buffer* provides *Blob*.

## Swift

Håvard found that the Swift ApiResolver only collected functions from a module’s exports and its class vtables, never from its symbol table. A module that keeps its symbols thus still listed only its exported functions, leaving internal methods, free functions and value type initializers invisible to *functions:* queries. The symbol table is now walked as well, with an address already seen through the exports listed once.

## .NET

17.24.0 made it to NuGet, and the frida-net CI now builds frida-core with the compiler backend enabled, so from this release the *Frida.NET.Runtime* packages expose *Frida.Compiler*, except on Linux mips64 where Go cannot cross-compile with cgo. Windows arm64 is built on a native runner for the same reason.

## Darwin

Our V8 build linked CoreFoundation for abseil’s time zone support, which made the V8-flavored agent depend on more than libSystem. The few calls involved are now stubbed, with the local time zone read from */etc/localtime* instead.

Enjoy!

### Changelog

-   compiler: Return the default export from *require()*, with the named exports merged into it, so CommonJS-style code gets what Node gives it.
-   compiler: Stub out unsupported Node builtins as empty modules.
-   compiler: Inject *global*, *Blob*, *ReadableStream* and *Response* as globals.
-   compiler: Add *stream/web*, *depd* and *@frida/fetch* shims.
-   compiler: Bump *@frida/crypto* to 1.1.0, adding *randomBytes()*, *randomFillSync()*, *getRandomValues()* and *Hash.copy()*, and fixing *Hash.update()* for views and input encodings. Thanks [@Furtif](https://github.com/Furtif), [@Flechaa](https://github.com/Flechaa) and [@hsorbo](https://twitter.com/hsorbo)!
-   compiler: Bump *@frida/http-parser-js* to 1.1.0, syncing with upstream and fixing a strict mode violation. Thanks [@thinhbuzz](https://github.com/thinhbuzz)!
-   compiler: Bump *@frida/process* to 1.3.0, adding *stdin*, *stdout* and *stderr*.
-   compiler: Bump *@frida/buffer* to 7.1.0, adding *Blob*.
-   swift-api-resolver: List functions from the symbol table, so internal methods, free functions and value type initializers show up in *functions:* queries. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   net: Enable the compiler backend in CI, so the NuGet packages expose *Frida.Compiler*.
-   v8: Stop linking CoreFoundation on Darwin.
-   process: Fix glib-mkenums warnings.
