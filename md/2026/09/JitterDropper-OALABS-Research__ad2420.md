---
title: JitterDropper | OALABS Research
source: https://research.openanalysis.net/jitterdropper/dropper/rust/srdi/donut/pixeldrain/2026/04/13/jitterdropper.html
source_host: research.openanalysis.net
clip_date: 2026-09-28T10:21:13+08:00
trace_id: 8f2e377e-c59e-4d96-905d-6f7557a75a03
content_hash: 55de16e2b8d0d93306a673cacb23a528315d25be04fa5c6edda740867260da1b
status: synced
tags:
  - 恶意样本
  - 反调试
series: null
feed_source: OALabs·恶意软件逆向
ai_summary: JitterDropper 是自 2026-03-18 起持续开发的 Rust/MSVC Windows 下载器，分两条变体线共九个样本，靠"每 API 固定睡眠抖动预算"把全部样本归到同一开发者名下。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 0
  failed_urls:
    - https://imgur.com/uaGaOQ9.png
notion_page_id: 3e975244-d011-81cf-8f6f-c379411e4034
ioc:
  cves: []
  cwes: []
  hashes:
    - 2ef28834f30d3fd881f8c3004ab67c01e2ec283c03d57e173e43a7b30d52f97b
    - 4e57a67bf5a1dfa198bafc192ed47016f1a043c0c8ae0349f32c02ed17d296d4
    - 5605f711e9c256b09dcf06c4f39851545dbfc05c1c5b3e5f3129b16506e7df19
    - 812d2d8436985fc8531315970b2af6bcdd697f9033bc12841ce467e6fda94408
    - 9957bf9bc95be77c84f83546d37ec3bd81877872f2e18e54adc014c541da3c6a
    - 9e714ba3e2f8fe053550bb0234fc7e3fa64ce41e601bff83f0f47822245312fc
    - cb7264735e38f2575a354762c122a90d8994ea406f4911a42d8fa45d397fc4ff
    - ded5c06cf21d2b93bffd5d884aa6e96934ee4234
    - e8082e3c0d63f83ad95af88f50e9ae26512e89113339b66b24068648363d676e
    - eede257690bdc8c0668c3bef1e394a6c1e50980ba237647fb36c26f46557a450
  domains:
    - pixeldrain.com
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> JitterDropper 是自 2026-03-18 起持续开发的 Rust/MSVC Windows 下载器，分两条变体线共九个样本，靠"每 API 固定睡眠抖动预算"把全部样本归到同一开发者名下。
> 
> - **家族构成与分工：** 九个样本两条线，全部用 Rust 1.92.0 MSVC 工具链（rustc `ded5c06c…`）编译；变体 I 在 `.rdata` 嵌入密文做多轮解密，输出约 675 KB 的 Donut/sRDI 反射加载器加内层 PE；变体 II 是从 `pixeldrain[.]com` 取 122 字节 shellcode 的轻量 stager，用单条 SSE 32 字节重复 XOR 密钥解密。
> - **作者指纹：** 抖动字节窗口（Lemire mod 1000 加 `imul edx, eax, 0xF4240`）本身是 rustc 输出，不具辨识度；真正独特的是每 API 固定除数——InternetOpenA 60 ms、StringFromGUID2 150 ms、CoGetObject 100 ms、CoUninitialize 120 ms，各样本一致，且 GetTickCount 配对率 80–100%，无关 Rust 程序为 0%。
> - **反分析手段：** `CheckRemoteDebuggerPresent` 紧跟 `IsDebuggerPresent`，命中即静默退出；随机类名/标题的 GUI 掩护窗口不泵消息；21–27 次空转 `EnumWindows` 作纯耗时填充；各检查点用 GetTickCount 前后配对设阈值（如 1153 ms）超时退出，专门反制压缩或跳过 Sleep 的沙箱（Rust `thread::sleep` 实际降到 `CreateWaitableTimerExW`）。
> - **执行链与演化：** 流程为 `VirtualAlloc` → `VirtualProtect` → `call rbx`，除 2026-04-11 版退回直接 RWX 外均保持 W^X；变体 I 解密迭代 10→9→8 且 s-box 增删，内层 PE 见过未知 .NET stealer 与 Vidar；2026-04-09 并行分叉出 AES-256-GCM 封装（`BCryptDecrypt` + `ChainingModeGCM`）与注入 `explorer.exe` 加 `%APPDATA%` 自复制持久化两支。
> - **溯源工具：** 可用 UnpacMe-IDA-Byte-Search 插件按抖动实现的特征字节搜索关联样本；变体 II 的 pixeldrain 链接在采集时已失效，未能取得其二级载荷。

## Overview

We have observed a new Rust/MSVC Windows dropper under active development since at least 2026-03-18 with nine builds observed across two variant lines. Currently the name is unknown so we will dubbing it `JitterDropper`.

**Variant I** embeds the payload in `.rdata` and runs a multi-pass decryption algorithm producing a Donut shellcode loader with an embeded PE. **Variant II** ships a smaller stager that downloads a 122 byte encrypted shellcode blob from `pixeldrain[.]com` and decrypts it with a single SSE-32 repeating XOR key. Every build is compiled against the same Rust 1.92.0 MSVC toolchain (`rustc/ded5c06cf21d2b93bffd5d884aa6e96934ee4234`).

Though there are multiple variants the use of a specific sleep-jitter to obfuscate API calls ties all samples to the same developer. The following specific jitter bounds are used for each API across all samples: 60 ms before InternetOpenA, 150 ms before StringFromGUID2, 100 ms before CoGetObject, 120 ms before CoUninitialize. All nine samples contain the same 32 bytes that rustc emits for `Duration::from_millis(variable)` a fixed Lemire mod 1000 reduction followed by `imul edx, eax, 0xF4240` to convert milliseconds to nanoseconds before the sleep call. An example of UnpacMe IDA plugin [UnpacMe-IDA-Byte-Search](https://github.com/OALabs/UnpacMe-IDA-Byte-Search) identifying related samples based on this jitter implementation is shown below.

![⚠️ 图片托管失败](https://imgur.com/uaGaOQ9.png)

## Samples

### Variant I — embedded multi-pass decrypt, sRDI/Donut second stage

-   `812d2d8436985fc8531315970b2af6bcdd697f9033bc12841ce467e6fda94408` — I-8iter+sbox
-   `cb7264735e38f2575a354762c122a90d8994ea406f4911a42d8fa45d397fc4ff` — I-10iter+sbox, 2026-03-23
-   `e8082e3c0d63f83ad95af88f50e9ae26512e89113339b66b24068648363d676e` — I-9iter+mod24, 2026-03-27

### Variant II — SSE-32 XOR, pixeldrain-fetched 122-byte hop-loader

-   `9957bf9bc95be77c84f83546d37ec3bd81877872f2e18e54adc014c541da3c6a` — II baseline, 2026-04-06
-   `eede257690bdc8c0668c3bef1e394a6c1e50980ba237647fb36c26f46557a450` — II + AES-256-GCM wrap, 2026-04-09
-   `4e57a67bf5a1dfa198bafc192ed47016f1a043c0c8ae0349f32c02ed17d296d4` — II + `CreateRemoteThread` into `explorer.exe` + `%APPDATA%` persistence, 2026-04-09
-   `9e714ba3e2f8fe053550bb0234fc7e3fa64ce41e601bff83f0f47822245312fc` — II + RWX regression, 2026-04-11
-   `2ef28834f30d3fd881f8c3004ab67c01e2ec283c03d57e173e43a7b30d52f97b`
-   `5605f711e9c256b09dcf06c4f39851545dbfc05c1c5b3e5f3129b16506e7df19`

## Analysis

JitterDropper performs anti-analysis hecks, decrypts or downloads a second-stage shellcode, and transfers control via `VirtualAlloc` -> `VirtualProtect` -> `call rbx`. All builds except 2026-04-11 use `W^X`; the regressed build allocates `RWX` directly. The stager imports Rust's standard library and `VCRUNTIME140.dll` and is built as a GUI executable whose cover window never pumps messages.

### Anti-Analysis

Every build carries the same authored anti-analysis features:

-   **Inline anti-debug pair**— `CheckRemoteDebuggerPresent` immediately followed by `IsDebuggerPresent`. A detection causes a silent exit.
-   **GUI cover window**— `RegisterClassExA` + `CreateWindowExA` with randomised class/title strings (observed: `ZiEXzryWwge` / `QlUTPX`, `TYiYiIqIRv`). No message pump.
-   **`EnumWindows` stall loop**— 21–27 iterations of `EnumWindows` whose callback only calls `GetClassNameA` into a stack buffer and discards the result. A wall-clock padder with no semantic payload.
-   **`GetTickCount` -> randomised `Sleep` -> `GetTickCount` -> elapsed-check gates** at each stager checkpoint. When the elapsed delta exceeds the author's threshold (e.g. 1153 ms in `e8082e3c`), the stager exits. This defeats sandboxes that time-compress or skip `Sleep` calls. On Windows the Rust `thread::sleep` call lowers to `CreateWaitableTimerExW` + `SetWaitableTimer` rather than `Sleep`.

### The jitter-budget-per-API fingerprint

The 32-byte Lemire-x1 000 000 byte window that scales milliseconds to nanoseconds for `Duration::from_millis(var)` is rustc-emitted and appears in unrelated Rust programs that call `thread::sleep` on a variable millisecond argument. It is not on its own a developer fingerprint. What is unique to JitterDropper is the author's per-API choice of **Lemire divisor** (the upper bound of each randomised sleep in milliseconds) which is unchanged across every build where that API appears.

| Gated API | Divisor (ms) | Coverage |
| --- | --- | --- |
| `InternetOpenA` | 60  | 6 of 6 network-bearing builds |
| `StringFromGUID2` | 150 | 4 of 4 COM-bearing builds |
| `CoGetObject` | 100 | 4 of 4 COM-bearing builds |
| `CoUninitialize` | 120 | 4 of 4 COM-bearing builds |
| `memcpy` / `memset` (pre-payload copy) | 1000 | 6 of 6 sites |
| `GetCurrentProcess` (pre anti-debug) | 1000 | 5 of 5 sites |
| `EnumWindows` (stall-loop pad) | 1000 | 5 of 5 sites |
| `VirtualProtect` (RW -> RX transition) | 49–99 | 7 of 7 sites (narrow cleanup band) |
| `QueryPerformanceCounter` (elapsed-check gate) | 521–770 | 9 of 9 samples |

The `GetTickCount` before jitter pairing rate is 80 to 100% per sample across the corpus. Unrelated Rust samples that happen to share the rustc-emitted x1 000 000 byte window show 0% `GetTickCount` pairing and a single uniform `/1000` budget. The per-API divisor table is what distinguishes JitterDropper from compiler-output coincidences.

### Decryption

**Variant I** decrypts an embedded `.rdata` ciphertext in three passes: a byte-XOR chain, 8–10 iterations of an SSE permutation driven by an XMM constant table (with buffer rotation between iterations — in-place would alias and corrupt), and a final repeating-key XOR using either a 16-byte table (`cb7264`), a 24-byte key with `i mod 24` indexing (`e8082e`), or a similar variant. The output is a ~675 KB raw shellcode.

**Variant II** decrypts a 122-byte blob downloaded from pixeldrain\[.\]com with a single SSE 32-byte repeating XOR key (`xorps xmm2, xmm0 / xorps xmm3, xmm1 / movups [r13+rcx], xmm2 / movups [r13+rcx+0x10], xmm3 / add rcx, 0x20 / cmp rax, rcx / jne`).

The AES-GCM fork (`eede2576`) wraps this primitive with a `BCryptDecrypt` call using the literal UTF-16 string `ChainingModeGCM` and a key supplied in a separate 122-byte pixeldrain\[.\]com download.

### Second stage

All three retrievable Variant I shellcodes share a identical **222 byte sRDI/Donut reflective loader** at the call-target of the `call rel32` at offset 0, followed by an encrypted inner PE. Two distinct inner PE families have been observed in the decrypted shellcodes, an unknown.NET stealer, and Vidar.

Variant II second stages are 122-byte shellcodes hosted on `pixeldrain[.]com/api/file/<id>`; these links were dead at the time of sample collection so no shellcode was retrieved for analysis.

### Evolution

Timestamps and feature deltas are consistent with a single developer or small team iterating over five weeks. The Variant I decrypt iteration count drops 10 to 9 to 8 across builds and the s-box substitution pass is added and removed; Variant II is introduced on 2026-04-06 as a simpler network-fetching fork; on 2026-04-09 two parallel forks appear. One adds AES-256-GCM wrapping with dynamically-resolved BCrypt, the other adds `CreateRemoteThread` injection into `explorer.exe` and `%APPDATA%` self-copy persistence. The 2026-04-11 build regresses to `RWX`, suggesting a branch off the tree before `W^X` was merged in.
