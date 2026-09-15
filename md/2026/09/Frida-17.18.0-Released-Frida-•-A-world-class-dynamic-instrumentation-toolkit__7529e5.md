---
title: Frida 17.18.0 Released | Frida • A world-class dynamic instrumentation toolkit
source: https://frida.re/news/2026/09/09/frida-17-18-0-released/
source_host: frida.re
clip_date: 2026-09-15T10:23:17+08:00
trace_id: 00c62f03-dc49-429f-bb50-f188b42c7921
content_hash: 4421529cc9ccb59a5b44422958fafc5d736e61302173830be047cd68b40f3a38
status: synced
tags:
  - Frida
  - 内核
series: null
feed_source: Frida Releases
ai_summary: Frida 17.18.0 发布，Barebone 后端大扩展：新增 XNU 内核扩展加载、Linux 内核注入与 BTF 类型查询，并支持多平台内核与用户态进程插桩。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3dc75244-d011-81d3-8cf6-d8bffffe9f4d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.18.0 发布，Barebone 后端大扩展：新增 XNU 内核扩展加载、Linux 内核注入与 BTF 类型查询，并支持多平台内核与用户态进程插桩。
> 
> - **XNU kext 加载：** XNU agent 可直接编译为 `.kext` 由 macOS 自行载入，通过 `/dev/frida` 配置通信，不再依赖 GDB 远程桩或 JTAG/SWD 硬件调试器；但用户进程内仍需注入式 agent。
> - **注入覆盖范围：** 注入 agent 支持枚举进程、附加、跑脚本、Hook 与启动前插桩，覆盖 Linux、XNU、Windows NT（32/64 位）及 32 位 Windows 9x；Linux 侧支持 x86、x86-64、Arm、Arm64，既可注入运行中的内核，也可作为内核模块加载。
> - **Linux BTF：** 脚本可查询内核模块及其符号，新增 `Btf` 命名空间读取结构体大小、字段偏移与类型、枚举、常量、函数签名，避免硬编码偏移；底层是新的 GumJS 原生 API 注册表。
> - **编译器与 LSP：** `Frida.Compiler` 升级到 TypeScript 7.0，新增 `Frida.LanguageServer` API，走 LSP 协议提供补全等编辑器能力，并与编译器共享解析缓存。
> - **修复与体积：** Arm trampoline 地址、arm64 BTI 与重定位跳转检测、ELF 程序头读取、Windows ACL 注入成功率等修复；Capstone 归档从约 29 MB 缩减至 4.4 MB。

## Frida 17.18.0 Released

release

Frida 17.18.0 is here, and Barebone takes a big step forward. Our XNU agent can now be loaded as a macOS kernel extension, Linux agent gains broader architecture support and access to the kernel’s own type information, and the backend can instrument both the kernel itself as well as user mode processes across Linux, XNU, Windows NT, and even Windows 9x. We have also upgraded `Frida.Compiler` to TypeScript 7.0 and added a new `Frida.LanguageServer` API alongside it.

## XNU kext 支持

One of the exciting additions is the ability to build the XNU agent as a `.kext`. Previously, getting it into the kernel meant injecting it from the outside through a GDB-compatible remote stub, such as QEMU’s, or through a hardware debugger using JTAG/SWD. Now macOS can load the agent itself, and `/dev/frida` provides the channel for configuring and communicating with it. This opens up another way to use Frida for kernel instrumentation. The kext currently supports the kernel side; placing agent copies into user processes still requires the injected XNU agent.

## 注入覆盖范围

There is a lot more to Barebone in this release. The injected agents now bring familiar Frida workflows into guest processes: enumerate them, attach, run scripts, hook functions, and spawn programs with instrumentation in place before they start running. This work spans Linux, XNU, Windows NT in both word sizes, and 32-bit Windows 9x. Linux agent injection now covers x86, x86-64, Arm, and Arm64, and the Linux agent can be injected into a running kernel as well as loaded as a kernel module.

## Linux BTF 类型信息

On Linux, scripts can now discover loaded kernel modules and their symbols, with the module registry tracking drivers as they come and go. The new `Btf` namespace also lets scripts query the kernel’s BTF type information, where available. Structure sizes, field offsets and types, enums, constants, and function signatures are available directly from JavaScript. For example:

```javascript
if (Btf.available) {
  const module = Btf.getStruct('module');
  console.log('struct module size:', module.size);
  console.log('name offset:', module.getOffsetOf('name'));
  console.log('name field:', JSON.stringify(module.fields.name));
  console.log('MODULE_STATE_LIVE:', Btf.getConstant('MODULE_STATE_LIVE'));
}
```

This means scripts can ask the kernel how its structures are laid out, avoiding hard-coded offsets tied to a particular build. Underneath it is a new GumJS native API registry, which lets embedders expose namespaces of native functions independently of the JavaScript runtime in use.

## 编译器与语言服务器

Meanwhile, `Frida.Compiler` has been upgraded to TypeScript 7.0. The new [`Frida.LanguageServer`](https://github.com/frida/frida-core/commit/a987284afa0bd0868a6b65160ff01471b71d10a3) API brings the same compiler’s language services to tools embedding Frida. It speaks the Language Server Protocol for TypeScript and JavaScript projects: create a server for a project directory, start it, send JSON-RPC messages through `post()`, and receive replies and notifications through its `message` signal. This makes it possible to integrate editor features such as completion with Frida’s bundled typings and compiler configuration. The compiler and language server also share a parse cache, so the same file contents do not have to be parsed separately for each.

Other highlights and fixes:

## 其他改进与修复

-   barebone: Add public APIs for adding and removing Barebone devices, with caller-supplied IDs, names, and icons. Expose configuration for injected and resident agents, including explicit hostlink addresses.
-   barebone: Add process spawning and spawn gating across the Linux, XNU, and Windows agents, plus application enumeration on XNU and Windows and application launching on XNU.
-   barebone: Improve module and thread observation, fault recovery, process cleanup, and cloaking of the agent’s own threads and mappings.
-   barebone: Improve transport delivery and wakeups across the agents, including large messages and binary script-message payloads. Keep resident agents alive when a session detaches.
-   barebone: Add XNU kernel text patching through writable aliases, and improve code allocation and pointer authentication at the kernel boundary.
-   barebone: Expose Linux kernel-module symbols from kallsyms and export tables, and unregister APIs and module observers during teardown.
-   barebone: Move Linux memory operations into the guest, with proper handling of writable and executable mappings. Extend remapping and patching across x86, x86-64, Arm, and Arm64.
-   barebone: Halt the guest while accessing QEMU’s physical-memory mode, and fix kernel text patches being silently dropped when shadow pages originated in Linux’s linear map.
-   barebone: Place x86 aliases in kernel space, fixing CModules faulting when accessing their data. Allow virtual-memory scans to span multiple leaf tables.
-   barebone: Add Arm address translation and kernel-space aliases, widen page addresses in 32-bit remapping requests, and flush Arm instruction caches directly instead of attempting a userspace syscall from the kernel.
-   barebone: Report the actual stack space available to the JavaScript runtime, preventing ordinary script recursion from overflowing a Linux kernel stack.
-   barebone: Size the Linux kernel using `_end`, avoiding unrelated mappings that could make a 32-bit kernel appear gigabytes larger. Read copied kernel images through `GumElfModule` without dereferencing pointers into the live kernel.
-   barebone: Fix and complete the Linux kernel-module build, including constructor array boundaries and flavor-specific runtime dependencies.
-   linux: Add kernel-assisted injection when the Frida kernel module is loaded, falling back to the existing injection paths when it is absent.
-   gdb: Use binary packets for memory writes and honor the target’s register sizes.
-   interceptor: Fix Arm trampoline addressing when writable and executable views use different mappings.
-   memory: Skip bad pages when finding pointers. Thanks [@IPMegladon](https://github.com/IPMegladon)!
-   memory: Allow wildcards at scan pattern edges, including in Barebone. Thanks [@Xoffio](https://github.com/Xoffio)!
-   arm64: Avoid BTI where no landing pad is available. Thanks [@inforcqb](https://github.com/inforcqb)!
-   arm64: Detect branches into the instructions being relocated, so Interceptor can choose a smaller redirect instead of branching into overwritten code and crashing. Thanks [@WHW0x455](https://github.com/WHW0x455)!
-   cmodule: Move CModule from GumJS into Gum, making it available independently of the JavaScript bindings. Thanks [@cputnam-a11y](https://github.com/cputnam-a11y)!
-   elf-module: Read program headers from the file, fixing modules whose headers have been moved by tools such as `patchelf`. Bound the fallback read when only a live mapping is available. Thanks [@tracyliving](https://github.com/tracyliving)!
-   windows: Tweak ACLs to improve injection success rate. Thanks [@jamiechapmanbrn](https://github.com/jamiechapmanbrn)!
-   python: Fix typing imports on Python versions older than 3.11.
-   ci: Build the XNU kernel extension, additional Linux agents, and the required Barebone SDKs and devkits. Enable the Barebone backend on Android.
-   deps: Slim down Capstone in Barebone SDKs, reducing its archive from roughly 29 MB to 4.4 MB. Let freestanding GLib builds use the C library’s smaller `printf` implementation, and trim locale and filename-conversion support.
-   deps: Optimize QuickJS to reduce its stack consumption, and tweak GLib to reduce our footprint in Barebone scenarios.
