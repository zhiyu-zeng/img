---
title: "Tutorial: unpacking executables with TinyTracer + PE-sieve | hasherezade's 1001 nights"
source: https://hshrzd.wordpress.com/2025/03/22/unpacking-executables-with-tinytracer-pe-sieve/
source_host: hshrzd.wordpress.com
clip_date: 2026-10-16T10:20:49+08:00
trace_id: 2436cffc-0332-4439-869e-bcf685d99d4a
content_hash: 10f1e8e5d91019ecbeb005d6de24fbe4fd79902d0d4f500d5c313f5773606bf5
status: synced
tags:
  - 脱壳与加固
  - 安全工具
series: null
feed_source: hasherezade·恶意软件逆向
ai_summary: 被改过的 UPX 壳可用 TinyTracer 定位 OEP、PE-sieve 重建 IAT 完成脱壳，全程无需调试器。
ai_summary_style: key-points
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 3fb75244-d011-819e-8d44-deb0bd8a4242
ioc:
  cves: []
  cwes: []
  hashes:
    - 8f661f16c87169fefc4dc7e612521ad8498c016a0153c51dae67af0b984adaac
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 被改过的 UPX 壳可用 TinyTracer 定位 OEP、PE-sieve 重建 IAT 完成脱壳，全程无需调试器。
> 
> - **工具与适用性：** PE-bear 看结构、TinyTracer(基于 Intel PIN) 追踪、HollowsHunter/PE-sieve 转储并重建导入表；适用于经典单 stub 壳，虚拟化壳（VMProtect、Themida 等）得不到完整可运行结果，只能作为静态分析素材。
> - **PE 结构线索：** 该样本有 "0000"（Raw size 0、带可执行属性、预留原始代码写入）与 "1111"（stub 所在）两节；编译目标为旧版 XP，现代 Windows 会施加 apphelp 兼容性 shim，干扰 IAT 重建。
> - **去 shim 与绕反调试：** 把 Optional Header 的 OS Version 改为 0xA(Win10)，被 apphelp 劫持的调用即回到 user32/gdi32 等原模块；PIN 不是调试器，天然避开多数反调试检测。
> - **OEP 定位：** 日志中 `[1111] -> [0000]` 节切换后的首个地址即 OEP（本例 RVA 0x1d14b0），此前常伴随大量 LoadLibrary+GetProcAddress 调用用于在内存重建导入表；把该 RVA 写入 TinyTracer 的 stop_offsets.txt（默认暂停 30 秒，可用 TinyTracer.ini 延长）。
> - **转储与收尾：** 暂停期间执行 `hollows_hunter.exe /pname packed.exe /hooks /imp A`；随后用 PE-bear 将 Entry Point 改为 OEP，并把内存中被改写的节属性还原为原样本的 rwx，否则报错无法运行。

*Covers: automatic OEP finding, reconstructing IAT, avoiding antidebugs and fixing imports broken by shims*

In this short blog I would like to demonstrate you how to unpack an executable with [PE-sieve](https://github.com/hasherezade/pe-sieve/) and [Tiny Tracer](https://github.com/hasherezade/tiny_tracer/). As an example, let’s use the executable that was packed with a modified UPX:

-   [8f661f16c87169fefc4dc7e612521ad8498c016a0153c51dae67af0b984adaac](https://malshare.com/sample.php?action=detail&hash=8f661f16c87169fefc4dc7e612521ad8498c016a0153c51dae67af0b984adaac)

Usually, when dealing with UPX-packed cases, we can use the original [original UPX executable](https://upx.github.io/) to unpack it. But since it is a modified version, it was not possible:

```
./upx -d ~/packed.exe 
                       Ultimate Packer for eXecutables
                          Copyright (C) 1996 - 2020
UPX 3.96        Markus Oberhumer, Laszlo Molnar & John Reiser   Jan 23rd 2020

        File size         Ratio      Format      Name
   --------------------   ------   -----------   -----------
upx: /home/tester/packed.exe: CantUnpackException: file is modified/hacked/protected; take care!!!

Unpacked 0 files.
```

The most known way to tackle such cases is by using [x64dbg](https://x64dbg.com/) and [Scylla](https://github.com/NtQuery/Scylla). The classic pathway was described many years ago in the [series of tutorials “Unpacking with Antracene”](https://forum.tuts4you.com/files/file/2040-unpacking-with-anthracene/) \[1\]. This method requires opening the main executable under the debugger, setting appropriate breakpoints, and following the execution till it hits the Original Entry Point (OEP). After we found the OEP, we dump the unpacked version of the PE from memory, then fix the dump by searching and reconstructing the IAT. The details of what breakpoints to set, and how the execution should be followed, depend on the specific packer. In some cases, the stub may contain some anti-debug measures that have to be defeated additionally.

Here I will demonstrate how the similar effect can be achieved with the help of my tools. This alternative way is more generic, and does not depend on the details of the stub implementation. We can also avoid using a debugger altogether, and not be bothered by any additional inconveniences created by evasion techniques. For the dumping purpose, we use [PE-sieve with `/imp` argument](https://github.com/hasherezade/pe-sieve/wiki/4.3.-Import-table-reconstruction-\(imp\)), that automatically finds the new IAT and reconstruct the import table.

To keep this demo simple, I have chosen an example of a custom UPX. But this method of unpacking can work well for variety of packers: as long as we are dealing with the classic type, that involve use of a single unpacking stub. It won’t produce complete and runnable results when packers using virtualization were applied (i.e. [VMProtect](https://vmpsoft.com/vmprotect/overview/), Themida, etc) – yet, even then, it can help us obtain a useful material for static analysis.

## Used tools

-   [PE-bear](https://github.com/hasherezade/pe-bear) – for PE overview, and modification
-   [TinyTracer](https://github.com/hasherezade/tiny_tracer) – for tracing
-   [HollowsHunter](https://github.com/hasherezade/hollows_hunter) (or [PE-sieve](https://github.com/hasherezade/pe-sieve)) – for dumping and Import Table reconstruction

## Overview of the sample (PE-bear)

Let’s start by opening the sample in [PE-bear](https://github.com/hasherezade/pe-bear/), to have a brief overview.

The first thing that stands out is that our PE has sections with atypical names. There are two sections created by the packer: “0000” and “1111”. The execution starts in the second one, “1111”. So, we can suspect that this is where the unpacking stub is located.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/db83bf44db837bfd.png)

The first section, “0000” has the executable characteristics set, but it is empty in the file (notice the `Raw size: 0`). We can predict that this is where the original code will be filled in.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2742d4b6d58775d0.png)

Moving on to look at different headers, we can see that the sample is compiled for an old version of Windows: XP.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f22ee5fb0f4c6766.png)

This can cause some problems further on in the unpacking process. Oftentimes, on modern Windows, the executables compiled for old versions are run with [compatibility shims](https://techcommunity.microsoft.com/blog/askperf/demystifying-shims---or---using-the-app-compat-toolkit-to-make-your-old-stuff-wo/374947) applied. This can corrupt the process of dumping imports (see more details [here](https://hshrzd.wordpress.com/2019/06/27/application-shimming-vs-import-table-recovery/)).

## Running the sample via Pin (TinyTracer)

First, we will run our sample under the control of the Dynamic Binary Instrumentation platform, [Intel PIN](https://www.intel.com/content/www/us/en/developer/articles/tool/pin-a-dynamic-binary-instrumentation-tool.html). As a tracing tool, we will use [TinyTracer](https://github.com/hasherezade/tiny_tracer/). You can find the detailed [installation instructions on Wiki](https://github.com/hasherezade/tiny_tracer/wiki/Installation).

Running a sample via TinyTracer gives several benefits:

-   It produces a tracelog that can help us pinpoint the Original Entry Point of the sample very quickly
-   Intel PIN is not a debugger, so it won’t be affected by most of the antidebug checks that the packer’s stub may contain (a good explanation provided [here](https://youtu.be/1-q7LaNhGVM?t=768)). Additionally, TinyTracer allows to [bypass multiple AntiVm and AntiDebug checks](https://github.com/hasherezade/tiny_tracer/wiki/The-INI-file#antidebug).
-   By tracing an executable via Pin we can easily check if any of the APIs are run with the compatibility shims applied. It helps us prevent the problems with dumping of the import table, that were mentioned earlier ([shims may interfere with it, making the reconstruction harder](https://hshrzd.wordpress.com/2019/06/27/application-shimming-vs-import-table-recovery/)).
-   It lets us pause the execution at the given offset (without a need to set a breakpoint in a debugger)

So, let’s start by tracing the executable with Tiny Tracer (the full produced tracelog is available [here](https://gist.github.com/hasherezade/eb09bd747208c2aee9b281d5ed6e66b2)).

### Preventing the compatibility shims

By having a complete tracelog we can first see if any of the functions have been called via [compatibility shims](https://reactos.org/wiki/User:Learn_more/Appcompat). We can recognize them as the calls done via `apphelp` module. For example, this fragment of the tracelog contains shims:

```css
[...]
1307c;apphelp.[SE_GetProcAddressForCaller+710]*
12cb4;apphelp.[SdbGetNthUserSdb+2e0]*
132f4;apphelp.[SE_GetProcAddressForCaller+620]*
1307c;apphelp.[SE_GetProcAddressForCaller+710]*
12cb4;apphelp.[SdbGetNthUserSdb+2e0]*
132f4;apphelp.[SE_GetProcAddressForCaller+620]*
12bfc;apphelp.[SdbFindNextStringIndexedTag+4d0]*
```

We can try to prevent it by changing the OS Version in the Optional Header, as described in [the related blog](https://hshrzd.wordpress.com/2019/06/27/application-shimming-vs-import-table-recovery/). In case of the currently analyzed application, I changed the OS to Windows 10 (0xA):

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9919d2a8de94a985.png)

We can see that the bypass was successful when the functions called at the same offsets are finally referenced by their original DLLs:

```
[...]
1307c;user32.GetDC
12cb4;gdi32.GetDeviceCaps
132f4;user32.ReleaseDC
1307c;user32.GetDC
12cb4;gdi32.GetDeviceCaps
132f4;user32.ReleaseDC
12bfc;gdi32.CreatePalette
```

If we have a bad luck, we may encounter a sample that won’t load correctly without the compatibility shims, and then to bypass them we are forced to execute it on the dedicated version of Windows, and dump from there.

### Pinpointing the Original Entry Point (OEP)

As we know, in order to unpack the application, we need to find its OEP (this concept has been described many times in classic tutorials, i.e. \[1\]). It is the best point to dump the application. The unpacking stub finished its execution, and the original code is ready in memory, but didn’t execute yet. Locating the OEP is very easy when we have a tracelog.

What we concluded from the overview, the section “0000” is where the original code is going to be uncompressed to. So, the first address in this section that is hit will be our Original Entry Point.

Searching for the transitions between the stub section, and the newly unpacked code section, is a general rule that we can apply for the classic type of packers. In case of more complex packers, there may be multiple back and forth jumps between sections. Usually we should focus on the last one. To be extra sure that we are at the point where the original code got unpacked, we can also look for some other patterns in the tracelog. It is very common that the Import Table of the packed application is also compressed or otherwise destroyed, and it has to be manually loaded in memory by the unpacking stub. So, when we see in the log a lot of calls of the import loading functions (`LoadLibrary` + `GetProcAddress` or their low-level equivalents), this is where those preparations happens.

Fragment of the tracelog:

```plain
[...]
44c3e7;kernel32.GetProcAddress
GetProcAddress:
	Arg[0] = ptr 0x72980000 -> {MZ\x90\x00\x03\x00\x00\x00}
	Arg[1] = ptr 0x0084b15b -> "ClosePrinter"

44c3d2;kernel32.LoadLibraryA
LoadLibraryA:
	Arg[0] = ptr 0x008a7ed4 -> "winspool.drv"

44c3e7;kernel32.GetProcAddress
GetProcAddress:
	Arg[0] = ptr 0x72980000 -> {MZ\x90\x00\x03\x00\x00\x00}
	Arg[1] = ptr 0x0084b172 -> "GetDefaultPrinterW"

44c415;kernel32.VirtualProtect
44c42a;kernel32.VirtualProtect
44c43b;[1111] -> [0000]
1d14b0;section: [0000]
e538;kernel32.GetModuleHandleW
4d84;kernel32.SetThreadLocale
```

Seeing this tracelog, especially the sections transition at:

```
44c43b;[1111] -> [0000]
1d14b0;section: [0000]
```

\-we can conclude with a high confidence that the OEP is at the RVA = 0x1d14b0 (the first address in the newly unpacked section, “0000”, that was hit). So this is where we need to set a breakpoint (or a [pseudo-breakpoint in case of TinyTracer](https://github.com/hasherezade/tiny_tracer/wiki/Stop-offsets)) in order to dump valid, unpacked binary.

### Setting the stop offset

Having the Original Entry Point noted from the first tracing session, we can run the sample once again, this time pausing at this particular point, so that we can dump the unpacked sample.

In order to pause the execution at the offset, we can use a classic debugger, i.e. [x64dbg](https://x64dbg.com/). But in some cases, the stub may be sprinkled with antidebug techniques, that will cause additional problems, and i.e. make the sample exit prematurely.

Those problems will not occur while running the sample via PIN tracer, since PIN is not a debugger and can’t be detected in the same ways. But PIN does not allow for setting breakpoints… Still we can emulate the breakpoint behavior. In TinyTracer, there is a possibility to define stop offsets. The details are described at TinyTracer’s Wiki \[[here](https://github.com/hasherezade/tiny_tracer/wiki/Stop-offsets)\].

We just write down the stop RVA into the `stop_offsets.txt` file in the TinyTracer’s installation directory. By default, the execution will pause at the defined offset for 30 seconds. If it is not enough to dump the sample, we can increase this time by changing the relevant settings in [TinyTracer.ini](https://github.com/hasherezade/tiny_tracer/wiki/The-INI-file). When the execution has paused, we will see an information about it in the tracelog (we can preview it in real time using [baretail](https://www.baremetalsoft.com/baretail/) tool).

## Dumping the sample (with PE-sieve/HollowsHunter)

For this part we gonna use PE-sieve’s wrapper, [HollowsHunter](https://github.com/hasherezade/hollows_hunter). It has [all the features of PE-sieve](https://github.com/hasherezade/pe-sieve/wiki), plus additional ones, i.e. it allows to scan the process selected by the name (not just by the PID).

There are [some subtle differences](https://github.com/hasherezade/pe-sieve/wiki/1.-FAQ#pe-sieve-vs-hollowshunter---what-is-the-difference) between the default options that are set in both. For example, by default, PE-sieve scans for hooks and patches in the loaded modules, while with HollowsHunter you have to request it manually, using the argument `/hooks`. In the currently analyzed case, we are dealing with a packed executable, that overwrites one of its section, and fills it with a new content, so it is a form of binary patching. That’s why, in order to have it detected by the scan, we have to enable the “hooks” option in Hollows Hunter.

Another important option that should be set is [import reconstruction (enabled with `/imp`)](https://github.com/hasherezade/pe-sieve/wiki/4.3.-Import-table-reconstruction-\(imp\)). We will be sufficient with an automatic mode of import recovery, enabled by `/imp A`.

The full commandline required to do the dump:

```
hollows_hunter.exe /pname packed.exe /hooks /imp A
```

The only thing we need to ensure is that the dump was made at the exact moment when the Pin Tracer paused at the Original Entry Point.

While running the sample via Tiny Tracer, and watching the tracelog via Baretail, we should see the following entry:

```
1d14b0;section: [0000]
# Stop offset reached: RVA = 0x1d14b0. Sleeping 60 s.
```

This is the moment to scan the process with Hollows Hunter. We should get the dumped saved to the dedicated directory.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9e32dcb9590175d4.png)

## Final tweaks – changing the Entry Point (with PE-bear)

While the unpacked binary is dumped, we still need to postprocess it a bit before it becomes runnable.

To do:

-   changing the Entry Point
-   changing the sections characteristics

First of all, the dumped binary still has the previous Entry Point saved in its headers – leading to the stub, rather than to the unpacked section. We can change it quickly just by opening the dumped executable with PE-bear and editing the value in the Optional Header:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a18986c28541686d.png)

An alternative way to do it is by jumping to that RVA:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0ec6a5b704326e55.png)

Then, in the disasm view, we can select it as a new Entry Point.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/57726753467c92a2.png)

Yet, if we save the modified executable, and try to run it, we encounter an error:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0afcdf1bc199e227.png)

The reason if it can be guessed if we look again at the sections characteristics of the dump:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/087b7f7428e968cc.png)

As we can see, they have been modified in memory. In the original executable each of the sections had rwx characteristic. We can copy those characteristics from the initial sample, and change them back in our dumped executable.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ae1b91679f0bf1cf.png)

After those few tweaks, all runs fine, and we can finally enjoy our unpacked executable!

## References

\[1\] [“Unpacking with Anthracene”](https://forum.tuts4you.com/files/file/2040-unpacking-with-anthracene/) \[mirror: [Unpacking With Anthracene.zip](https://drive.google.com/file/d/13Bnw0AvIsJmezuJl31EhGmzNZYDitErw/view?usp=sharing), pass: `tuts4you`\],
