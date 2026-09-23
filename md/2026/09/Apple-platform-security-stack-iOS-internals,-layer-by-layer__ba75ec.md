---
title: "Apple platform security stack: iOS internals, layer by layer"
source: https://sigreturn.com/blog/apple-security-stack/
source_host: sigreturn.com
clip_date: 2026-09-23T10:08:26+08:00
trace_id: 9b01d70a-ed93-4b07-a5a6-de28b8e2f6cd
content_hash: a3e00b22c591290598fbde302bd4af3bfb1cb17d6ddd7c7b6ce8135742e27301
status: synced
tags:
  - iOS逆向
  - 内核
series: null
feed_source: Sigreturn Labs·Apple internals
ai_summary: 一份十篇系列索引，按设备启动顺序逐层拆解 Apple 平台安全栈，从 Boot ROM 到用户态，说明同一内存破坏漏洞落在哪一层，往往比破坏本身更能决定它的价值。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e475244-d011-8147-8b87-f34d1b34df6d
ioc:
  cves:
    - CVE-2022-32832
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 一份十篇系列索引，按设备启动顺序逐层拆解 Apple 平台安全栈，从 Boot ROM 到用户态，说明同一内存破坏漏洞落在哪一层，往往比破坏本身更能决定它的价值。
> 
> - **六层栈：** 自下而上为 Boot chain、XNU 内核、代码签名（AMFI/CoreTrust/cdhash）与沙箱（MACF/SBPL）、IOKit 与 IPC（Mach 消息/MIG/XPC）、加固层（kalloc_type、PAC、SPTM/TXM、内存标记）、用户态（Objective-C runtime、dyld 共享缓存）；验证自顶向下运行，攻击者则从首个 bug 所在层向上。
> - **依赖链：** 第三方 App 与其他应用共用同一容器沙箱 profile，能否扩大取决于 entitlements；entitlements 有效只因 AMFI 验过其签名，而签名有效又只因内核来自验证过的启动链。
> - **2021 年后的五处变化：** kalloc_type 按分配类型签名隔离堆，使"释放后占位"默认失效；SPTM/TXM 自 iOS 17、macOS 14 起取代 PPL；2025 年 9 月公布的 Memory Integrity Enforcement 同步内存标记随 A19/A19 Pro、M5 出货；credentials 已移入只读 proc_ro 与只读分配器；iOS 16 的 launch constraints 废掉了复用特权 helper、复用旧 Apple 签名二进制两种手法。
> - **动手条件：** 十篇中九篇带 Hands-on 小节，无需越狱设备或 Corellium，Apple 芯片 Mac 加原版 macOS（保留 SIP）、Xcode 命令行工具及 ipsw、pyimg4 即可，转录环境为 macOS 26.4.1。
> - **范围边界：** 只讨论本地场景（已有代码执行、从沙箱走向内核），不含 WebKit/JavaScriptCore、iMessage/BlastDoor/图像解析器等远程入口，也不含 Secure Enclave。

An iOS app that reaches memory corruption still has almost nothing. It runs inside a profile that names every service it may talk to, its binary was checked against a signature before it started, and the kernel it wants sits behind entry points that validate their arguments. Each of those is a different subsystem, decided at a different moment, and the bug is worth nothing until you know all three.

Ten posts take them one at a time, in the order the device builds them. This page is the index.

Note

Everything in this article is public. It contains no exploit and no 0day.

The Apple security stack, layer by layer Six layers stacked top to bottom, each a link to the post in the series that covers it. Boot chain, post 1. Kernel, post 2. Code signing, post 3, beside sandbox, post 4. IOKit, post 5, beside IPC, post 6. Zone allocator, post 7, beside pointer authentication, post 8, beside the SPTM and TXM monitors and memory tagging, post 9. Userland, post 10. Verification runs down the stack, and an attacker works up it from wherever the first bug lands. Boot chain SecureROM verifies iBoot, then the kernelcache, as Image4 #1 Kernel XNU: a Mach core with BSD on top, ports as capabilities #2 Code signing AMFI, CoreTrust, trust caches, cdhash #3 Sandbox MACF policy, SBPL profile #4 IOKit user clients, external methods #5 IPC Mach messages, MIG, XPC #6 Zone allocator kalloc_type #7 PAC arm64e signing #8 Monitors SPTM, TXM, tagging #9 Userland Objective-C runtime, dyld shared cache #10 Verification runs down the stack. An attacker works up it, from wherever the first bug lands.

## What each layer decides

The boot chain decides which kernel runs at all. The SoC leaves reset into a mask ROM written when the chip was fabricated, and from there each stage validates the Image4 signature on the next before handing it control. That is why a Boot ROM bug like checkm8 invalidates every later check on the main processor, though not the Secure Enclave, which boots from a ROM of its own.

XNU is what the chain hands control to: a Mach core for inter-process communication, virtual memory and scheduling, with a BSD layer above it for processes, files and sockets. A Mach port is an unforgeable reference to a kernel object, and holding a send right to the right one is what privilege means here.

AMFI, the AppleMobileFileIntegrity policy module, decides what is allowed to execute, and its answer turns on a 20-byte hash of the code directory called the cdhash. The sandbox decides what an already-running process may touch, and its answer is the profile it was launched with. Both are MACF policies, the Mandatory Access Control Framework XNU inherited from TrustedBSD, and the kernel enforces them, not the process being checked.

Then come the surfaces a confined process can still reach. IOKit is the widest: hundreds of drivers, many of them vending a user client you open and call into with a selector and a buffer. Mach messages, MIG (the Mach Interface Generator, which produces the marshalling code) and XPC, the higher-level framework layered on top of them, are the other, and they lead into a more privileged daemon that may or may not check who is calling.

The hardening layer decides what a bug is worth once you have one. The zone allocator sorts allocations into buckets by the layout signature of the type, which fixes what may take a slot once it is freed. Pointer authentication signs the pointers worth hijacking with a key no memory write can reach. SPTM and TXM (Secure Page Table Monitor, Trusted Execution Monitor) took page-table writes and code-signing decisions out of the kernel’s privilege level, and memory tagging on the newest silicon makes the corrupting write itself fault.

Userland is where the reversing happens. An Objective-C object begins with a word you have to decode before it means anything, and the framework it belongs to is a range inside one merged image rather than a file on disk.

## The ten posts

1.  [The iOS chain of trust](https://sigreturn.com/blog/ios-chain-of-trust/). The Boot ROM verifies iBoot, iBoot verifies the kernelcache, and Image4 is the container all of it is signed in. Then checkm8.
2.  [XNU under the hood](https://sigreturn.com/blog/xnu-under-the-hood/). Mach and BSD side by side, the port as the unit of capability, and what `tfp0` actually is once you go looking for it.
3.  [The iOS code-signing pipeline](https://sigreturn.com/blog/ios-code-signing-pipeline/). Which binaries are allowed to execute: one MACF policy module and a verdict keyed on the cdhash, from the trust cache through CoreTrust to `amfid`.
4.  [The iOS sandbox](https://sigreturn.com/blog/ios-sandbox/). What a running process may touch. The profile is the exact list, so reading it is usually how you pick the next target.
5.  [IOKit up close](https://sigreturn.com/blog/iokit-attack-surface/). How a userland call lands in a driver’s dispatch table, and CVE-2022-32832, which needs root before it is reachable at all, walked from the selector to the corruption.
6.  [Mach messages, MIG and XPC](https://sigreturn.com/blog/mach-mig-xpc/). How a process asks a more privileged one to do something, and the three functions that decide whether the callee knows who it is answering.
7.  [The zone allocator up close](https://sigreturn.com/blog/zone-allocator/). What a memory-corruption bug is worth after `kalloc_type`, and why the exploits moved down to physical pages.
8.  [Pointer authentication](https://sigreturn.com/blog/pointer-authentication-arm64e/). What arm64e signs, and what a bypass has to look like when the key is out of reach.
9.  [SPTM, TXM and memory tagging](https://sigreturn.com/blog/sptm-txm-memory-tagging/). The two monitors that took page tables and code-signing decisions away from the kernel, and the tagging that rests on them.
10.  [The Objective-C runtime and the shared cache](https://sigreturn.com/blog/objc-runtime-shared-cache/). One word to decode before an object means anything, and libraries that live inside the shared cache.

## How to read it

In order it is one argument, built the way the device is. Out of order works too: each post stands on its own, glosses its terms, and links back to the one that introduced them. It assumes C, enough ARM64 assembly to read a function, and a disassembler you are comfortable in. It assumes nothing about Apple platforms.

Nine of the ten carry a section headed *Hands-on*, and none of them needs a jailbroken device or a Corellium instance. They run on an Apple silicon Mac with stock macOS and System Integrity Protection left on, plus the Xcode command line tools, and [`ipsw`](https://github.com/blacktop/ipsw) and [`pyimg4`](https://github.com/m1stadev/PyIMG4) for the firmware side. The transcripts were taken on macOS 26.4.1, so re-run them rather than quote them.

## What changed since 2021

If your model of this stack dates from iOS 14 or 15, five things have changed under it.

-   **`kalloc_type`** (#7), iOS 15 and wider in iOS 16, sorts the heap by the type signature of each allocation, so freeing an object and taking its slot with a different one stops working by default.
-   **SPTM and TXM** (#9) replaced PPL, the Page Protection Layer, from iOS 17 and macOS 14, on A15 and later and on every Mac except the one built around the base M1. The kernel now calls two monitors instead of doing that work itself.
-   **Memory Integrity Enforcement** (#9), the synchronous memory tagging announced in September 2025, ships on the A19 and A19 Pro from iOS 26 and on the M5 from macOS 26. Many linear overflows and use-after-frees now fault at the write.
-   **Credentials** (#2) are out of reach of a plain write. The pointer to them moved into the read-only `proc_ro` back in the iOS 15 and macOS 12 generation, and the credential itself now comes from the read-only allocator.
-   **Launch constraints** (#3), iOS 16, bind each system binary to the one context it may be launched from, which killed two old signing tricks: repurposing a privileged helper, and reusing an old Apple-signed binary.

## What is out of scope

This is the local story: an attacker who already has code running on the device, working from a sandbox towards the kernel.

The remote entry points are deliberately absent. WebKit and JavaScriptCore for the one-click case, iMessage, BlastDoor and the image parsers for the zero-click case, baseband and Wi-Fi for the over-the-air case. So is the Secure Enclave, which is closed enough to want a post to itself. They are a second season. The closest thing already here is the post on [JavaScript engine exploitation](https://sigreturn.com/blog/exploiting-javascript-engines/), which works at engine level rather than on iOS.

## Where this leaves us

One dependency runs through all of it. A third-party app gets the same container profile as every other one, and what widens it is entitlements that only mean anything because AMFI validated the signature carrying them, which in turn only means anything because the kernel enforcing it booted from a verified chain. That is why the layer a bug lands in usually says more about what it is worth than the corruption does.

An index is a menu. The parts that matter are the details it leaves out: which field of which struct, which OS version turned a technique off. [The chain of trust](https://sigreturn.com/blog/ios-chain-of-trust/) is where that starts.

## Notes and sources

Everything in the series is drawn from open source, vendor documentation, published research, and a Mac running a stock, unmodified macOS. Four references sit behind all ten posts.

-   Apple, [Apple Platform Security](https://support.apple.com/guide/security/welcome/web), the vendor’s description of the boot chain, code signing and the hardware mitigations, and the only source for intent as opposed to behaviour.
-   Apple, [the XNU source](https://github.com/apple-oss-distributions/xnu), where a question about a struct layout, a return value or a version boundary gets settled. Several corrections in this series came from a header rather than a write-up.
-   Jonathan Levin, [*\*OS Internals*](https://newosxbook.com/index.php), Volume II for kernel mode and Volume III for security, at a depth no blog post reaches.
-   [`ipsw`](https://github.com/blacktop/ipsw) by blacktop and [`pyimg4`](https://github.com/m1stadev/PyIMG4) by m1stadev, which turn an Apple firmware image into files you can read, and where the firmware-side hands-on sections start.
