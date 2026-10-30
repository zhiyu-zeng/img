---
title: Frida 17.25.0 Released | Frida • A world-class dynamic instrumentation toolkit
source: https://frida.re/news/2026/10/30/frida-17-25-0-released/
source_host: frida.re
clip_date: 2026-10-31T02:49:15+08:00
trace_id: 9e18b75c-1b32-410d-9dd5-88b07e805af1
content_hash: 99fd138e248a2f101c4e3b4fd4827c658a60af93cec94b5bb8e99a5bf8d14b97
status: synced
tags:
  - Frida
  - 安全工具
series: null
feed_source: Frida Releases
ai_summary: Frida 17.25.0 把 Darwin 的进程外手动映射器推广到 Windows/Linux，实现无文件注入，并拆分出 Efni、Idun 两个子项目。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40975244-d011-81a6-b648-ec4c046508a7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.25.0 把 Darwin 的进程外手动映射器推广到 Windows/Linux，实现无文件注入，并拆分出 Efni、Idun 两个子项目。
> 
> - **跨平台 GumMapper：** 原本仅服务 Darwin 的 Mach-O 映射器抽象为 GumMapper 接口，新增 PE 与 ELF 实现，全程不在目标内执行代码，支持静态 TLS；ELF 覆盖 x86、ARM、AArch64、MIPS（含 GOT 与 RELR 重定位）。
> - **无文件注入：** Windows 上 agent 经 pagefile-backed section 映射，代码页跨目标共享，不再写临时 DLL 或调 LoadLibrary，dbghelp/symsrv 一并映射并 cloak，文件系统零触碰；Linux 经 ptrace/procmem/kernel 注入器映射，只读段直接从文件映射共享。
> - **ACG 支持：** 进程开启 Arbitrary Code Guard 无法自建可执行内存时，agent 通过内存 hook 让宿主代为分配并保护代码页。
> - **Efni/Idun 拆分：** frida-core 拆出通用构建块库 Efni 与 Apple 设备栈 Idun；Windows/Linux 由 idund 守护进程共享 CoreDevice 隧道（Linux 走 D-Bus，Windows 走 loopback），配对记录自动迁移；Idun 新增剪贴板、截屏、触控注入、H.264 屏幕串流等服务。
> - **稳定性修复：** Darwin 检测 MTE、改从 dyld 信息数组读镜像名以消除 attach 崩溃，arm64e 剥离指针签名；Windows 订阅 loader DLL 通知捕捉延迟加载模块并修 Process.mainModule 顺序；Linux 修 unwind broker 竞态与 arm64 重定位器覆盖 X0–X8；MIPS 条件分支重定位等多处编码修复。

## Frida 17.25.0 Released

release

This is a big one. The out-of-process mapper that has carried our Darwin injection for years is now cross-platform, so agents are mapped straight into the target on Windows and Linux too, without a file on disk or a *dlopen()* in the target. Two libraries were split out of frida-core: Efni, the building blocks for protocol-heavy GLib code, and Idun, our Apple device stack, which now shares its tunnel through a daemon on Windows and Linux. Memory Tagging on Darwin is handled, arm64e got a round of fixes from [@hsorbo](https://twitter.com/hsorbo), and there’s a long tail of fixes with contributions from [@Cassian433](https://github.com/Cassian433), [@tpetsas](https://github.com/tpetsas), [@Flechaa](https://github.com/Flechaa), [@borgCode](https://github.com/borgCode), [@leonitousconforti](https://github.com/leonitousconforti) and [@esauvisky](https://github.com/esauvisky).

## A mapper for every platform

Frida’s Darwin backend has long had its own dynamic linker: a mapper that parses a Mach-O, resolves its imports against the target’s libraries, and maps it into the target from the outside, so the target never has to call *dlopen()*, which a sandbox may not allow. That mapper is now a generic *GumMapper* interface, with a Mach-O, a PE and an ELF implementation behind it, each built where its format is native.

The mappers never run code in the target. Everything that must execute there is emitted into a small runtime that runs when the consumer calls the constructor. Target memory goes through a *GumProcessMemory* interface, which the native implementation backs for the local process and for remote ones where the OS allows, and symbols are resolved through a *GumModuleResolver*, which has out-of-process implementations too. On Windows, exports are parsed from each module’s file on disk, so nothing is read from the target unless the file is missing or doesn’t match the loaded image. On Linux, the target’s libraries are opened through */proc/<pid>/map_files* when permitted, then through */proc/<pid>/root* with an inode check, so a target in a container resolves against its own files, and when neither works the image is copied from the target’s memory.

Both new mappers support static TLS. The PE runtime registers its TLS with the loader, which for x64 and x86 processes on ARM64 means locating the loader’s native TLS routines, and it seeds the */GS* security cookie like the loader does. The ELF runtime carries its own *\__tls_get_addr*, plus a TLS descriptor resolver on AArch64, and the ELF mapper covers x86, ARM, AArch64 and MIPS, including the MIPS GOT and RELR-packed relocations.

### Windows

Agents are now injected filelessly. Rather than writing a temporary DLL and loading it through *LoadLibrary()*, the agent is copied once into a pagefile-backed section per architecture, whose handle is duplicated into each target so the code pages are shared across all of them. A small stub runs the mapped images’ constructors, calls the agent’s entrypoint, and runs the destructors when it is not staying resident, after which the mapper unmaps it. The dbghelp and symsrv DLLs are mapped alongside and handed to the agent, so symbolication doesn’t load them through the loader either, and the agent cloaks all of these mappings. Nothing touches the filesystem anymore. The *LoadLibrary()* path remains for builds with the mapper disabled.

Processes with Arbitrary Code Guard are now within reach too. When the process can’t create code itself, the agent plugs in memory hooks that have the host allocate and protect code pages on its behalf, and the host session keeps serving such agents while they revert their instrumentation on unload.

### Linux

Agents are mapped out-of-process instead of having the target *dlopen()* them. A loader stub in the target loads any of the agent’s dependencies the target lacks, reserves memory, and reports back, after which it is sent a plan to apply: the read-only segments are mapped straight from the agent’s file, so their pages are shared across targets, while the rest is streamed over the control socket. The loader applies protections, runs the constructor, and on unload runs the destructor and unmaps. This is used by the ptrace, procmem and kernel injectors alike.

### CModule

CModule’s external toolchain backends are now one, loading the compiled shared library through the mapper. Only the compile step differs: clang on Darwin, gcc on ELF platforms, and on Windows MSVC, or MinGW gcc when *cl* isn’t on *PATH*. This means Windows, Linux and Android now accept prebuilt shared libraries, which only Darwin did before, and external compilation on Windows now works in static builds, as the toolchain is spawned without GLib’s spawn helper. The Windows backend also parses modules through the new portable PE parser, so dependencies are enumerated and imports include delay-loaded ones.

## Efni and Idun

frida-core has grown a lot of code that isn’t about instrumentation: binary serialization, promises, a GDB remote protocol client, and the whole Apple device protocol stack from usbmuxd to CoreDevice. That code is now two libraries of its own, consumed as subprojects. [Efni](https://github.com/frida/efni) holds the generic building blocks, and [Idun](https://github.com/frida/idun) the Apple device stack: discovery over USB and the network, pairing, lockdown and the CoreDevice tunnel, service clients for installation proxy, SpringBoard services, DTX instruments, RemoteXPC and LLDB, and codecs for property lists, keyed archives, OPACK, kcdata, kdebug and kperfdata. Both build as shared libraries against system dependencies, Idun comes with packaging recipes for Arch, Fedora and Debian, and frida-core’s Fruity backend is now a thin layer of Gum-dependent injection and host session on top of libidun.

The user-visible change is *idund*. A device only allows one CoreDevice tunnel per host, so on Windows and Linux the tunnel now lives in a per-user daemon that every process on the desktop shares. Linux clients reach it over D-Bus, and Windows clients over loopback through a control file under the user’s local application data. A client that finds no daemon starts one, and the daemon exits once it has been idle for a while. On macOS the system’s own tunnel is used, as before. Frida ships the daemon inside the library when assets are embedded, and existing pairing records are moved over on first use, so pairings survive the upgrade. Leo Conforti noticed that starting the daemon from Node.js stopped libuv from reaping child processes, as GLib’s child watch installed its own *SIGCHLD* handler, and fixed it from both ends: the daemon is now spawned without a child watch, and our GLib uses pidfd even when the kernel headers it is built against predate it, so spawning any process from Frida no longer disturbs the host’s signal handling. Thanks!

Idun also picked up CoreDevice services that a desktop integration needs: pasteboard access, screenshots, display geometry, touch injection, a live H.264 screen feed through a GStreamer element and a Qml module, launching an app with a URL, and Darwin notifications. There’s also early work on talking to Apple’s push and identity services. Expect more on that in a later Idun release.

## Darwin

Memory Tagging is now detected, and the code paths that dereference caller-supplied addresses suspend tag checks while doing so: *Memory.scan()*, the pointer scanner, *NativePointer* ’s read and write accessors, and *Memory.copy()*. Attaching to a process with tagged memory also used to get the target killed, as the resident-notifier scan probed heap pages through untagged addresses.

An attach-time crash is gone. Modern dyld runs the image-added notifier under its loaders write lock, where our *dladdr()* call re-entered dyld and aborted, so the image name is now read from dyld’s published info array, with dyld itself, which keeps out of that array and exposes its path separately, handled as well. Region queries for unmapped addresses now fail instead of describing the next region, as on every other backend, and the 32-bit ARM mapper runtime creates its TLV key before the initializers run, like x86 and arm64 already did.

Håvard made Gum behave on arm64e, where code pointers carry signatures: *find_module_by_address()*, *Stalker.invalidate()* and hardware breakpoints now strip the address before comparing, which also fixes the exceptor’s lookup of *signal()*. CI now runs on macOS 27 as arm64e.

## Windows

The module registry hooked *LdrLoadDll()* and synchronized against the loaded modules whenever it returned, but system DLLs resolve their delay-loaded imports through *LdrResolveDelayLoadedAPI()*, which maps the DLL without going through it. DLLs pulled in that way, like those loaded inside *SHGetKnownFolderPath()*, stayed invisible until the next *LdrLoadDll()* happened to synchronize them in. The registry now subscribes to the loader’s DLL notifications, keeping the hooks as the fallback for Windows versions without them. Thanks to [@Albasha0x0](https://github.com/Albasha0x0) for the report!

Shilkey found that *gum_memory_allocate_near()* could return memory outside the requested range, or memory it had already freed, and that the distance check overflowed for far-apart addresses. Both are fixed. Module enumeration also preserves the loader’s order now, on all backends, which on Windows means *Process.mainModule* is no longer whichever module happened to hash first. And dbghelp symbols resolved through exports are attributed to the right module instead of the main executable.

## Linux

Thanos Petsas tracked down a race in the unwind broker, which replaced *\__gxx_personality_v0* before *\_Unwind_GetIP*, so a C++ exception unwinding on another thread in between jumped through *NULL*. The hooks are now installed in the right order, and come with a test that keeps several threads throwing while the backend is toggled. The broker is also only active while the Interceptor has hooks or a broker is obtained, its deactivation is reentrant, and code allocation failures surface as policy violations instead of crashes.

Flechaa fixed the arm64 relocator picking an argument register as scratch. When a function doesn’t read its arguments at entry, such as Android’s libsigchain stubs, the Interceptor’s context and next hop overwrote them, so both *onEnter* and replacements saw garbage. X0 through X8 are now excluded from entry scratch candidates.

MIPS got a thorough pass, starting from a crash when hooking glibc’s *free()*: the relocator now handles conditional branches, which asserted or, for *BEQZ* and *BNEZ*, were copied verbatim and branched relative to the trampoline; the module registry finds *r_debug* through *DT_MIPS_RLD_MAP* as MIPS keeps *.dynamic* read-only; MIPS64 ucontext registers are no longer truncated to 32 bits when resuming from a signal; the exceptor reports stores as writes; and the MIPS writer’s *LD*, *BEQ* and 64-bit *ADDU* encodings are fixed, along with how it stores trampoline addresses.

## Other fixes

-   *Interceptor.obtain()* could hand out an instance being torn down, whose unwind backend was already deactivated, so dropping it deactivated the backend twice while another thread was activating it. Showed up as sporadic crashes tearing down V8 isolates.
-   Stalker no longer faults when infecting a thread whose PC sits at the start of a mapping preceded by an inaccessible page, on x86 and arm64, and on arm64 it keeps X16 and X17 intact when unfollowing in the middle of an import thunk.
-   The QuickJS event sink’s drain raced with *Stalker.flush()* from another thread, removing the same events twice. Thanks [@Cassian433](https://github.com/Cassian433) for the fix and [@v-p-b](https://github.com/v-p-b) for the report!
-   The WebSocket transport read from its connection on the wrong thread when resuming input, which crashed in libsoup, and now caps the total size of fragmented messages like it does individual payloads. Thanks Håvard!
-   Our libffi could crash in *ffi_deinit()* when three or more code segments were live. Thanks [@esauvisky](https://github.com/esauvisky)!
-   Vala’s GIR writer now hoists delegates nested in classes and fixes references to nested namespaces, which the bindings generators rely on.

## Build

Apple OSes can now be targeted from Linux through [Limbo](https://github.com/oleavr/limbo), an XNU emulator for Linux userspace: point *LIMBO_SYSROOT* at a sysroot containing Xcode and configure with an Apple host as usual. Release tarballs honor *FRIDA_VERSION* instead of reporting 0.0.0, system builds link libstdc++ dynamically, and dpkg-buildflags’ *%* -containing flags are accepted, all in service of distro packaging.

Enjoy!

### Changelog

-   mapper: Add a cross-platform manual mapper, with PE, Mach-O and ELF implementations behind a *GumMapper* interface, out-of-process module resolvers, and static TLS support.
-   windows: Inject agents filelessly through the mapper, sharing the agent’s code pages across targets, with dbghelp and symsrv mapped alongside.
-   linux: Inject agents through the mapper instead of *dlopen()*, sharing read-only pages across targets, without needing memfd.
-   agent: Delegate code memory to the host when the process can’t create code itself, such as under Arbitrary Code Guard.
-   cmodule: Load PE and ELF through the mapper, accepting prebuilt shared libraries on Windows, Linux and Android, and spawning the Windows toolchain without GLib’s helper so static builds can compile externally.
-   windows: Parse modules through the new portable PE parser, enumerating dependencies and delay-loaded imports.
-   Split out Efni and Idun as subprojects, with distro packaging for both.
-   fruity: Share the CoreDevice tunnel through *idund* on Windows and Linux, embedding it when assets are embedded, and migrate pairing records.
-   idun: Spawn *idund* without a child watch, and glib: use pidfd even with old kernel headers, so Node.js keeps reaping its children. Thanks [@leonitousconforti](https://github.com/leonitousconforti)!
-   idun: Add pasteboard, screenshot, display, HID, display stream, app launching and notification proxy services, plus a GStreamer element and a Qml module for screen mirroring.
-   darwin: Detect MTE and suspend tag checks in *Memory.scan()*, the pointer scanner, *NativePointer* accessors and *Memory.copy()*, and fix the resident-notifier scan getting MTE targets killed on attach.
-   darwin: Resolve image names without *dladdr()*, fixing a crash on attach with modern dyld.
-   darwin: Fail region queries for unmapped addresses.
-   macho-mapper: Create the TLV key before initializers on 32-bit ARM, and cloak image copies.
-   arm64e: Strip addresses in *find_module_by_address()*, *Stalker.invalidate()* and hardware breakpoints. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   windows: Track modules through DLL notifications, so delay-loaded DLLs are registered. Thanks for reporting, [@Albasha0x0](https://github.com/Albasha0x0)!
-   windows: Bound nearby allocation searches, and fix the address spec distance overflow. Thanks [@borgCode](https://github.com/borgCode)!
-   module-registry: Preserve module load order, fixing *Process.mainModule* on Windows.
-   dbghelp: Look up symbol modules by address.
-   unwind-broker: Fix the activation race on Linux. Thanks [@tpetsas](https://github.com/tpetsas)!
-   unwind-broker: Only activate while needed, and make deactivation reentrant.
-   interceptor: Handle code allocation failures, and fix *obtain()* racing with teardown.
-   relocator-arm64: Don’t clobber arguments with scratch registers. Thanks [@Flechaa](https://github.com/Flechaa)!
-   stalker: Avoid reading before PC on infect, on x86 and arm64, and preserve IP registers on unfollow on arm64.
-   mips: Relocate conditional branches, find *r_debug* via the RLD map, keep ucontext registers full width, infer memory operations in the exceptor, parse MIPS64 relocation info, and fix the writer’s *LD*, *BEQ* and 64-bit *ADDU* encodings.
-   gumjs: Fix the event sink drain racing with *Stalker.flush()*. Thanks [@Cassian433](https://github.com/Cassian433) and [@v-p-b](https://github.com/v-p-b)!
-   socket: Resume WebSocket input on its own thread, and cap the total message size. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   libffi: Fix a use-after-free in *ffi_deinit()*. Thanks [@esauvisky](https://github.com/esauvisky)!
-   vala: Fix GIR output for nested delegates and namespaces.
-   releng: Support building for Apple OSes on Linux through Limbo.
-   releng: Honor *FRIDA_VERSION*, link libstdc++ dynamically in system builds, allow *%* in flags, accept POSIX-style prefix paths, and reject a pkg-config that ignores *PKG_CONFIG_LIBDIR*.
-   python: Narrow factory marshals for mypy.
