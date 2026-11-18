---
title: "Divining vulnerabilities: powered by the Hex-Rays Contributor Program"
source: https://hex-rays.com/blog/divining-vulnerabilities-contributor-program
source_host: hex-rays.com
clip_date: 2026-11-18T08:55:24+08:00
trace_id: 1935bacd-d4a8-48b2-9d99-6164a24bbbc1
content_hash: e0e64c8aa5f79b01bcd77e750d560fc540f1ef860c56ef2b56794fb7d7885072
status: synced
tags:
  - IDA插件
  - 漏洞分析
series: null
feed_source: Hex-Rays Blog
ai_summary: 作者基于 idalib Rust 绑定构建的"漏洞占卜"三件套已发布 v1，完全兼容 IDA 9.5，并通过 Hex-Rays 贡献者计划获得免费 IDA 许可证。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 0
  failed_urls:
    - https://hex-rays.com/hubfs/guest-blog-header-divining-vulnerabilities.png
notion_page_id: 41c75244-d011-818d-8693-ee909ae80e05
ioc:
  cves:
    - CVE-2025-1731
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 作者基于 idalib Rust 绑定构建的"漏洞占卜"三件套已发布 v1，完全兼容 IDA 9.5，并通过 Hex-Rays 贡献者计划获得免费 IDA 许可证。
> 
> - **工具三件套：** haruspex 无头提取 IDA 反编译伪代码到逐函数文件；rhabdomancer 在 IDB 中标记对危险 API 的调用；augur 按需提取字符串及相关伪代码，输出交由 Semgrep/weggli 规则与 LLM 分诊。
> - **性能数据：** 在 MacBook Air M3 上，haruspex 可在约 20 秒内处理含 7436 个函数的 19 MB MIPS 二进制；基准测试中 augur 从 39.3 分钟降至 124 秒，提速 19 倍（+1802%），Semgrep 可解析约 99.1% 的伪代码行。
> - **idalib-rs 贡献：** 作者向 Rust 绑定贡献了全局/函数级类型提取（生成 .h 文件）、Hex-Rays 反编译器与 IDA 内核配置修改 API、Linux/Windows AArch64 支持与交叉编译，分别随 v0.10.x/v0.11.x 发布。
> - **兼容性修复：** 针对IDA 9.4/9.5 的参数名提示、verbatim 名称等破坏模式匹配的变化，通过禁用提示和恢复旧命名行为解决；rhabdomancer 修复了 PE 静态链接、glibc 别名、ARM64EC、Apple 变体后缀等场景漏报调用的问题。
> - **计划与机制：** Hex-Rays 贡献者计划要求在每版 IDA 发布后 4 个月内保持 SDK 兼容并提供产品反馈，换取免费许可证；后续路线图包括更紧密的 LLM 集成和基于 LibAFL 的下游自动模糊测试确认。

[![⚠️ 图片托管失败 · Divining vulnerabilities: powered by the Hex-Rays Contributor Program](https://hex-rays.com/hubfs/guest-blog-header-divining-vulnerabilities.png)](https://hex-rays.com/blog/divining-vulnerabilities-contributor-program)

> *"Real hackers were so multi-lingual they often knew more platforms than they had pants."  
> \-- Dave Aitel*

## About the guest author

Marco Ivaldi ([raptor](https://0xdeadbeef.info/)) is a seasoned security researcher and tech leader with over 25 years of experience in offensive security. He is the technical director and co-founder of [HN Security](https://hnsecurity.it/), a boutique firm specializing in tailored offensive security services. A prolific exploit writer, Marco is also a Phrack author and a core developer of the OSSTMM, the open methodology for security testing. He has been recognized as one of Microsoft's Most Valuable Security Researchers and was selected to compete in its Zero Day Quest. He is a member of the [Hex-Rays Contributor Program](https://hex-rays.com/contributor-program). His career began in the '90s, when he co-founded Linux&C, the first Italian magazine dedicated to Linux and open source.

## TL;DR

In a hurry? I got you. Here's what's new in my *vulnerability divination* 🔮 suite:

-   Last May, I joined the [Hex-Rays Contributor Program](https://hex-rays.com/contributor-program), which is supporting the development of my idalib-based tools with a **free IDA license**.
-   [rhabdomancer](https://github.com/0xdea/rhabdomancer), [haruspex](https://github.com/0xdea/haruspex), and [augur](https://github.com/0xdea/augur) have reached **v1**, with full **IDA 9.5 compatibility**, new features such as **type definitions extraction**, substantial **performance optimizations**, and a number of **important fixes**.
-   I've contributed **type extraction**, **decompiler and IDA configuration**, and **Linux/Windows AArch64** support to the [idalib Rust bindings](https://github.com/idalib-rs/idalib) 🦀, with more pull requests on the way.
-   I've **benchmarked** the old and new releases against real-world targets, and the results speak for themselves.

As usual, you can get the latest releases from , [crates.io](https://crates.io/users/0xdea), or [GitHub](https://github.com/0xdea).

## A headless IDA-powered binary audit pipeline

First, a quick recap of my previous work, for those who missed the earlier episodes.

I've been doing **binary vulnerability research against closed-source targets** since the '90s, both [professionally](https://hnsecurity.it/) and as a [hobby](https://0xdeadbeef.info/). Over the past couple of years, I've built a pipeline around IDA Pro's **GUI-free automation capabilities** to audit binaries **at scale**, across architectures. I described its building blocks in my [previous article](https://hex-rays.com/blog/streamlining-vulnerability-research-idalib-rust-bindings) on this topic.

*Still waiting for the "automation takes over" part to kick in (https://xkcd.com/1319/)*

The centerpiece is [haruspex](https://github.com/0xdea/haruspex), an [idalib-rs](https://github.com/idalib-rs/idalib) based headless plugin that **extracts IDA's decompiler pseudocode into per-function flat files**. It's fast enough to process a **19 MB MIPS binary encompassing 7436 functions in less than 20 seconds** (including the initial analysis stage) on my MacBook Air M3. Not bad!

That output feeds a **layered static analysis stack**. My custom [Semgrep C/C++ ruleset](https://github.com/0xdea/semgrep-rules) and [weggli patterns](https://github.com/0xdea/weggli-patterns) treat the pseudocode as source code, **flagging candidate vulnerability hotspots** automatically. Interesting hits then go to **LLM agents for deeper triage**, before I move to manual static and dynamic confirmation. Its siblings [rhabdomancer](https://github.com/0xdea/rhabdomancer) and [augur](https://github.com/0xdea/augur) complete my *vulnerability divination* suite, by marking calls to potentially insecure API functions in the IDB and extracting strings and related pseudocode as needed, respectively.

Why IDA? Because of **decompiler quality, performance, and integration capabilities**, the latter courtesy of the [award-winning](https://hex-rays.com/blog/2024-plugin-contest-winners) idalib Rust bindings. Across x86, ARM, MIPS, and other architectures, the output is **clean enough for pattern-matching tools to work on it reliably**. Just last July, I [batch-decompiled 280 binaries](https://hnsecurity.it/blog/my-semgrep-c-cpp-ruleset-is-ready-for-prime-time-again/) in less than 14 minutes, and Semgrep parsed more than 98% of the resulting pseudocode lines. Meanwhile, the idalib headless API lets Rust drive the whole analysis without a GUI in the loop.

This pipeline **finds real bugs**, such as the [Zyxel local privilege escalation](https://hnsecurity.it/blog/local-privilege-escalation-on-zyxel-usg-flex-h-series-cve-2025-1731/) I covered last year. And I've spoken with other researchers who use a similar setup to hunt for vulnerabilities at scale, so I guess I'm not the only haruspex in town. 🐑

## A license to divine

Last May, I joined the [Hex-Rays Contributor Program](https://hex-rays.com/contributor-program). In a nutshell, the program aims to recognize and support people who **design, build, and maintain IDA plugins, applications, and content**, idalib-based tools explicitly included. Contributors may get a **free IDA license** that includes all decompilers and dedicated support from the Hex-Rays team.

For me, this means that I can **keep developing my tools** against the latest IDA releases on macOS, Windows, and Linux, without worrying about how to keep my license current. In return, contributors must keep their projects **compatible with the latest IDA SDK** within four months of each release. They must also maintain good installation, quality, and documentation standards, support their users, and provide **product feedback** to Hex-Rays. Sounds like a fair deal to me, especially since I was already doing most of these things anyway. 🤷

The first tangible result of this collaboration is a major release of my **cross-platform** *vulnerability divination* suite, which is now **fully compatible with IDA 9.5**. If you're building something cool on top of IDA, I encourage you to [apply](https://hex-rays.com/contributor-program) as well!

*The new haruspex running on Windows 11*

## Giving back to idalib-rs

As customary, while working on my tools I kept **contributing new features** to the idalib Rust bindings, which in the meantime moved to their own home under the [idalib-rs](https://github.com/idalib-rs/idalib) GitHub organization. My most relevant contributions since my last article are listed below:

-   **Global and function-level type extraction** (released in idalib-rs v0.10.0, alongside IDA 9.4 compatibility). This is the feature that powers the new `.h` files generated by haruspex and augur. It allows idalib-rs based tools to dump the type definitions that IDA has recovered or that you've applied to the IDB, both globally and for the types used by a specific decompiled function. Ever tried to make sense of a pile of pseudocode full of `*(_DWORD *)(a1 + 0x48)` without the corresponding struct definition? Well, me too 😵💫
-   **Support for modifying the Hex-Rays decompiler configuration** (released in idalib-rs v0.10.1). This is what allows haruspex and augur to turn off IDA 9.4's new argument name hints programmatically, without asking you to edit any configuration files by hand. This way, static analysis tools such as Semgrep can directly parse the generated pseudocode.
-   **Support for modifying the IDA configuration** (released in idalib-rs v0.11.1). It's the counterpart of the previous feature for IDA's kernel settings. This is what allows haruspex and augur to make IDA 9.5's verbatim names valid C identifiers again in the pseudocode (more on this below).
-   **Support for Linux and Windows AArch64 targets and cross-compilation** (released in idalib-rs v0.11.0, alongside IDA 9.5 compatibility). I've tested this patch with my tools on **Linux/AArch64**. Windows/AArch64 is also supported, but it's still untested (volunteers welcome).

You can find the full history in the official [changelog](https://github.com/idalib-rs/idalib/blob/master/CHANGELOG.md) of the project. As always, I **encourage you to contribute** to idalib-rs!

*A sneak peek of rhabdomancer doing its magic on Linux/AArch64*

## One year of divination

A lot has happened since my [last article on IDA 9.2](https://hex-rays.com/blog/streamlining-vulnerability-research-idalib-rust-bindings). Back then, my tools were at v0.7.x. One year, a few hundred commits, and more than a dozen releases later, [rhabdomancer](https://github.com/0xdea/rhabdomancer), [haruspex](https://github.com/0xdea/haruspex), and [augur](https://github.com/0xdea/augur) have **all reached v1**. Yes, I'm finally confident enough to call them stable. 🎉

The full details are in each project's changelog ([rhabdomancer](https://github.com/0xdea/rhabdomancer/blob/master/CHANGELOG.md), [haruspex](https://github.com/0xdea/haruspex/blob/master/CHANGELOG.md), [augur](https://github.com/0xdea/augur/blob/master/CHANGELOG.md)). Here are the highlights.

### IDA 9.5 compatibility

All three tools now **officially support IDA 9.5**, via the v0.11.x releases of the idalib Rust bindings. Along the way, they also tracked IDA 9.3, 9.3sp1, 9.3sp2, 9.4, and 9.4sp1, with a **compatibility matrix** in each `README.md` that maps every IDA build to the latest compatible release of each tool.

**IDA 9.4** brought a couple of decompiler changes that directly affected my pipeline:

-   The Hex-Rays decompiler now generates **argument name hints**. They're great for humans reading pseudocode in the GUI, but they break pattern-matching tools such as Semgrep and weggli. Therefore, haruspex and augur **disable them** before decompiling, and a regression test makes sure they never sneak back into the extracted pseudocode.
-   The decompiler can now [recover additional strings](https://docs.hex-rays.com/release-notes/9_4#decompiler-strings) that the initial auto-analysis misses. To take full advantage of this, augur now **decompiles all functions upfront**, before it walks the string list.

**IDA 9.5** kept me busy as well. It [no longer garbles names by default](https://docs.hex-rays.com/core/user-interface/concepts/configuration-files/legacy-name-character-restrictions), so names that aren't valid C identifiers are kept verbatim, and the decompiler wraps them in backticks. That's more faithful to the binary, but once again it breaks Semgrep and weggli. I dealt with it by restoring IDA 9.4's behavior in haruspex and augur, via a **new IDA configuration API** I contributed to idalib-rs. In rhabdomancer, I handled the breaking change by improving the function name matching logic.

### New features

-   **Type definitions extraction** in haruspex (and augur), as [requested](https://github.com/0xdea/haruspex/issues/3) by a user. Global and per-function type definitions are now dumped to `.h` header files alongside the pseudocode. This means that structs, enums, and typedefs recovered by IDA are available to downstream tools and LLM agents, which makes their analysis more accurate.
-   A **stable public API** for haruspex as a library. The new `decompile` function tells apart functions that can't be decompiled from errors that affect all functions, `decompile_to_file` now returns a `DumpedFunction` with the paths of the files it wrote, and `DumpedFunction::copy_to` copies the output elsewhere without decompiling again. augur is built entirely on top of this API.
-   A **much smarter rhabdomancer**. Calls through ELF `.plt` stubs are traced back to their callers, and calls in library code recognized by IDA (e.g., via FLIRT signatures) are labeled `(lib)`. Function names are now matched regardless of platform decorations (e.g., the ARM64EC `#memcpy` kept by IDA 9.5, Apple's `stat$INODE64`, or 32-bit `_WinExec@8`), glibc aliases (e.g., `__libc_system`, `__isoc23_sscanf`), Universal CRT wrappers (e.g., `__o_malloc`), and IDA's numeric suffixes (e.g., `memset_0`).
-   A **richer known bad API function list** in rhabdomancer, with dozens of new entries, such as `wordexp`, `chroot`, `syscall`, `ioctl`, the `*spawn*`, `CreateProcess`, and `LoadLibrary` families, and many more. The default configuration is now embedded in the binary, and you can point the `RHABDOMANCER_CONFIG` environment variable to your own customized copy.
-   **Elapsed time** reporting in every tool, which came in handy for the benchmarks below.

### Performance optimizations

-   augur now **decompiles each function only once**, reusing its output files for any further strings it references. This is by far the biggest performance improvement of the bunch, especially on large binaries where a handful of functions reference hundreds of strings.
-   augur also stops retrying functions that already failed to decompile, and avoids repeated calls to the IDA strings API.
-   rhabdomancer uses a **single lookup table** for known bad functions, caches `.plt` segment address ranges to avoid repeated FFI round trips, and fetches each function's name only once.

### Important fixes

-   rhabdomancer **no longer misses calls** in PE binaries (import stubs with numeric suffixes and Universal CRT wrappers) and in statically linked binaries (glibc aliases). The same goes for ARM64EC binaries analyzed with IDA 9.5, macOS binaries (Apple's variant suffixes), and 32-bit Windows binaries (`stdcall` names). Turns out these were hiding in plain sight 🙈
-   rhabdomancer runs are now **idempotent**, even when a call site already has a bookmark of its own, and instructions that merely fall through into a bad function (e.g., alignment padding) are no longer marked as call locations.
-   XREF traversal in rhabdomancer and augur is now **iterative**, to avoid potential stack overflows with large XREF chains, and rhabdomancer's is hardened against cyclic `.plt` references in crafted or unusual binaries.
-   Function names that come from the analyzed binary are now **escaped** before they are printed to the terminal, and file names built from the binary's names and strings go through an **allowlist**. After all, these tools are meant to be pointed at potentially hostile binaries.

Under the hood, I also enabled **clippy restriction lints**, added `semver-checks` to CI to enforce semantic versioning, pinned GitHub Actions to hashes, and wrote (with Claude's help) **a lot of new unit, integration, and regression tests**, with dedicated test binaries for edge cases such as binaries without functions, binaries without a decompiler, and functions too big to decompile.

## Benchmarks, or it didn't happen

Talk is cheap, so I've put my claims to the test. I ran the **old v0.9.3 releases on IDA 9.3** and the **new v1.2.0 releases on IDA 9.5** against the same set of real-world targets, on the same MacBook Air M3. Times include IDA's initial auto-analysis, and each run started from a clean state, without any pre-existing IDB.

| Tool | Target | Arch | Size | v0.9.3 on IDA 9.3 | v1.2.0 on IDA 9.5 | Speedup |
| --- | --- | --- | --- | --- | --- | --- |
| rhabdomancer | 280 ELF binaries (batch) | AArch64 | 14 MB | 356 secs | 342 secs | +4% |
| haruspex | 280 ELF binaries (batch) | AArch64 | 14 MB | 827 secs | 744 secs | +11% |
| augur | 36 ELF binaries (batch) | AArch64 | 2.2 MB | 39.3 mins | 124 secs | +1802% |

The last figure in the table is especially remarkable: a staggering +1802% speedup means that **augur is now 19x faster**, thanks to single-pass decompilation.

Finally, Semgrep 1.183.0 **parses about 99.1% of lines** in the pseudocode generated by haruspex v1.2.0, which marks a slight increase compared to the 98.3% measured with the older haruspex/IDA version.

*A word of caution: these numbers measure the* *combined effect* *of my code changes and of the IDA upgrade, so they don't tell you which side deserves the credit. Also note that augur now decompiles every function upfront to recover more strings, which costs some time on binaries with few string references, but pays off handsomely on large ones. Your mileage may vary, so please run your own benchmarks and let me know how they fare!*

## Looking ahead

The v1 milestone is by no means the end of the road. My TODO list is as long as ever, and the most ambitious goals on my roadmap are **tighter LLM integration**, to make the triage of static analysis findings even smoother, and a [LibAFL](https://crates.io/crates/libafl) **fuzzing stage** downstream of static analysis, to confirm candidate vulnerabilities automatically.

Meanwhile, you can **download my updated tools** from , [crates.io](https://crates.io/users/0xdea), or [GitHub](https://github.com/0xdea). Take them for a spin against your favorite targets, open issues, and submit pull requests!

## Acknowledgments

I'd like to thank **Hex-Rays** for welcoming me into their [Contributor Program](https://hex-rays.com/contributor-program) and for inviting me to write on their blog once again. It's been an honor.

As always, huge thanks to **idalib-rs's maintainers**, and especially to Sam L. Thomas ([@xorpse](https://github.com/xorpse/)), for reviewing my pull requests and for keeping this awesome project alive and kicking. ✊
![](https://track-eu1.hubspot.com/__ptq.gif?a=143552897&k=14&r=https%3A%2F%2Fhex-rays.com%2Fblog%2Fdivining-vulnerabilities-contributor-program&bu=https%253A%252F%252Fhex-rays.com%252Fblog&bvt=rss)
