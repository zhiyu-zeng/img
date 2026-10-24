---
title: "oss-sec: jxrlib: memory bugs on damaged JPEG XR files, fixed in mircomir/jxrlib 1.4.4, still in most distributions"
source: https://seclists.org/oss-sec/2026/q4/368
source_host: seclists.org
clip_date: 2026-10-24T17:31:59+08:00
trace_id: f282c9ae-d1c8-48bf-8049-578bace808d9
content_hash: f527333d985bb3a35967ff18e4d2c88c831544dbca72ffb9f2cfd6fe265f8155
status: synced
tags:
  - 漏洞分析
  - 安全工具
series: null
feed_source: oss-security·漏洞披露
ai_summary: "**TL;DR：** 被上游放弃的 jxrlib 处理受损 JPEG XR 文件时会触发 6 个内存错误（含堆写溢出），镜像分支 mircomir/jxrlib 1.4.4 已全部修复，但 Debian/Ubuntu/Fedora/Homebrew/vcpkg/conda-forge/Wine 等仍发布旧代码。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40375244-d011-81d1-8f08-d3fca5802700
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 被上游放弃的 jxrlib 处理受损 JPEG XR 文件时会触发 6 个内存错误（含堆写溢出），镜像分支 mircomir/jxrlib 1.4.4 已全部修复，但 Debian/Ubuntu/Fedora/Homebrew/vcpkg/conda-forge/Wine 等仍发布旧代码。
> 
> - **触发条件：** 仅需几百字节的损坏 JPEG XR 文件；第 2–5 项在 AddressSanitizer 下用官方 JxrDecApp（`-i case.jxr -o out.bmp`）可复现，并在 Tom94 0e1337d 与 Debian 1.2~git20170615 上验证。
> - **漏洞清单：** `ReadBinaryData`（JXRMeta.c:677）以 `uCount + 2` 分配导致 32 位整数溢出，形成堆写溢出；`ReadWMIHeader`（strdec.c:2965）对未终止的 8 字节签名调用 strstr，造成栈越界读；`DecodeSignificantRun`（segdec.c:362）与 `initLookupTables`（strdec.c:2617）分别以文件中的 run length 和位深索引表，导致全局越界读；`ImageStrDecDecode`（strdec.c:3536）对未分配行缓冲执行 memset，造成 NULL 写崩溃；`ParsePFDEntry`（JXRGlueJxr.c:1573）的 orientation assert 只在启用断言时触发。
> - **影响面：** Calibre、ImageMagick（经 JxrDecApp）、FreeImage 及其下游看图工具、KDE kimageformats 的 JXR 插件（Arch、Fedora 43 kf6-kimageformats 6.18.0）、Wine 的 WIC 解码器（内置 jxrlib 1.1）均受影响；作者未见代码执行证据。
> - **修复状态：** mircomir 1.4.4（2026-10-09 发布）以 `-DNDEBUG` 构建后，1101+ 个 fuzzing 崩溃样本全部通过；Arch、openSUSE Tumbleweed、MacPorts 已跟进，其余发行版仍用 1.1 或 1.2~git 旧版。
> - **建议：** 升级到 mircomir/jxrlib 1.4.4；目前无 CVE 编号，修复未经安全公告、部分来自 OSS-Fuzz 报告，作者呼吁 CNA 补号以便发行版追踪。

## oss-sec mailing list archives

## jxrlib: memory bugs on damaged JPEG XR files, fixed in mircomir/jxrlib 1.4.4, still in most distributions

* * *

*From*: "Joachim Rütter" <mynetx1 () gmail com>  
*Date*: Sat, 24 Oct 2026 07:52:46 +0000  

* * *

```sql
Hello,

jxrlib, Microsoft's JPEG XR library (abandoned upstream), has memory bugs that a damaged
JPEG XR file of a few hundred bytes triggers, including a heap buffer overflow write. All of
them are fixed in public in the maintained fork github.com/mircomir/jxrlib (1.4.4, released
2026-10-09), but most distributions still ship older code. I found them while fuzzing the
decoders in my image viewer, Featherview.

Bugs (line numbers from github.com/Tom94/jxrlib 0e1337d, the same code as Debian's
1.2~git20170615.f752187-5.3), and where mircomir fixed each:

1. ReadBinaryData, jxrgluelib/JXRMeta.c:677. A metadata count from the file is allocated as
   uCount + 2, which overflows 32 bits, so a tiny buffer is allocated and then written past
   (the uCount-byte read for a file stream, and the pbData[uCount] terminator in any case).
   Heap buffer overflow, write. Shown by source review and an allocation-intercept harness,
   not by an end-to-end crashing file. Fixed in cb97e6d (2024-12-16).
2. ReadWMIHeader, image/decode/strdec.c:2965. strstr on an unterminated 8-byte signature
   buffer. Stack buffer over-read. Fixed in d6e5f8d (2026-05-05).
3. DecodeSignificantRun, image/decode/segdec.c:362. Run length from the file indexes
   gSignificantRunBin unchecked. Global buffer over-read. Fixed in debe47a (2024-10-10).
4. initLookupTables, image/decode/strdec.c:2617. Bit depth from the file indexes a table
   unchecked. Global buffer over-read. Fixed in ba86c04 (2024-11-08).
5. ImageStrDecDecode, image/decode/strdec.c:3536. memset on a row buffer never allocated
   (colour format with no channels). NULL write, crash. Fixed in 190078d (2024-06-13).
6. ParsePFDEntry, jxrgluelib/JXRGlueJxr.c:1573. assert on the orientation tag; only builds
   with asserts enabled. Fixed in 7d2d462 (2026-05-13).

Items 2 to 5 reproduce under AddressSanitizer with upstream's own JxrDecApp
(JxrDecApp -i case.jxr -o out.bmp) on both Tom94 0e1337d and Debian's 1.2~git20170615.f752187-5.3.
mircomir 1.4.4 built with -DNDEBUG, as its Makefile and the Arch, MacPorts and openSUSE
packages build it, survives all 1,201 crash files from my fuzzing under AddressSanitizer.

Impact: a crash in any program that decodes an untrusted JPEG XR file, a few bytes of
adjacent memory possibly in the decoded output (items 2 to 4), and a heap overflow write
(item 1). I have no evidence of code execution. Exposure includes Calibre and ImageMagick
(through JxrDecApp), FreeImage and the image viewers built on it, KDE's kimageformats JXR
plugin where enabled (Arch, Fedora 43's kf6-kimageformats 6.18.0), and Wine's WIC decoder
(its bundled copy of jxrlib 1.1).

Still on unfixed code, as far as I can see:
- Debian (all releases) and Ubuntu: 1.2~git20170615.f752187
- Fedora, EPEL, openSUSE Leap: 1.1 (codeplex)
- Homebrew: Debian's orig tarball without Debian's patches
- vcpkg (4creators f7521879), conda-forge (1.1)
- Wine: bundled jxrlib 1.1 in libs/jxr
Already on 1.4.4: Arch, openSUSE Tumbleweed, MacPorts.
I reproduced the bugs on the Tom94 fork and on Debian's build only; the others are
inferred from their version.

Recommendation: move to mircomir/jxrlib 1.4.4. Test files and sanitizer logs are available
on request.

I don't know of CVE IDs for these; the fixes went in without advisories, several from
OSS-Fuzz reports. If someone with a CNA can assign them, that would help the distributions
track this.

Joachim Ruetter
https://featherview.mynetx.net

```
