---
title: "oss-sec: Godot 4.x: heap out-of-bounds write via negative string length in binary resource loader"
source: https://seclists.org/oss-sec/2026/q4/159
source_host: seclists.org
clip_date: 2026-10-15T00:00:50+08:00
trace_id: 788299d3-db86-47ce-a302-dd630e293d29
content_hash: f6434388c775ccb991e91057328a1e0e6601cb0d5e826f2f297cc1eec0a71c33
status: synced
tags:
  - 漏洞分析
  - 游戏安全
series: null
feed_source: oss-security·漏洞披露
ai_summary: Godot 4.x 二进制资源加载器未校验带符号位为 1 的字符串长度，负值被当作超大无符号尺寸复制，造成堆越界写，截至 2026-10-13 各版本仍未修复。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f975244-d011-8150-a5ec-ceed2a2fc503
ioc:
  cves: []
  cwes: []
  hashes:
    - 920daf712f53fd8e0085bfc148c5ea5c6839d4136bf6e0d13a14a3e4385a4620
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Godot 4.x 二进制资源加载器未校验带符号位为 1 的字符串长度，负值被当作超大无符号尺寸复制，造成堆越界写，截至 2026-10-13 各版本仍未修复。
> 
> - **漏洞位置：** `ResourceLoaderBinary::get_unicode_string`（core/io/resource_format_binary.cpp:864 附近），读取 32 位字符串长度后未拦截负值，长度校验失效；ASan 在 872 行报 heap-buffer-overflow WRITE。
> - **影响面：** 该解析器随导出模板发布，导出的游戏若加载玩家或社区提供的 .res 文件，即会在不可信输入上执行此代码，实现攻击者可控的堆越界写。
> - **触发方式（Windows）：** 把构造的 .res 放入工程目录，编辑器启动时的资源依赖扫描即崩溃（无需用户操作）；无头脚本加载则以 STATUS_HEAP_CORRUPTION（0xC0000374）退出；4 KiB 载荷在 ASan/PageHeap 下立即触发越界写。
> - **波及版本与时间线：** 解析器自 2014 年开源起即存在；4.7-stable 实测可复现，更早版本推定受影响。2026-06-23 私报厂商，2026-09-18 公开，2026-09-19 厂商认定"非安全问题"，未修复版本含 master、4.7.2、4.7.1、4.7。
> - **复现材料与归属：** PoC 归档 godot47_binres_oob_repro.zip（含 README、bug_analysis.md、make_repro.py），SHA-256 `920daf712f53fd8e0085bfc148c5ea5c6839d4136bf6e0d13a14a3e4385a4620`；同日披露的还有该系列另外两个内存安全漏洞；CVE 于 2026-09-20 申请，至 10-14 尚未分配。发现过程为 LLM 驱动的自动化源码审计。

## oss-sec mailing list archives

## Godot 4.x: heap out-of-bounds write via negative string length in binary resource loader

* * *

*From*: Tomasz Kaye <tomasz.brain () gmail com>  
*Date*: Wed, 14 Oct 2026 17:27:18 +0200  

* * *

```swift
Three memory-safety bugs in Godot 4's untrusted-file parsers were
publicly disclosed on 2026-09-21 [1]. This thread covers the binary
resource loader bug.

Affected versions:
Godot 4.7-stable, official release build, verified. Earlier versions
presumed affected. The parser has been in the engine since the day it
was open-sourced in 2014 (commit 0b806ee0fc). Unpatched as of
2026-10-13 (master, 4.7.2, 4.7.1, 4.7).

Description:
ResourceLoaderBinary::get_unicode_string
(core/io/resource_format_binary.cpp:864) reads a 32-bit string length
from the file. A length with the high bit set is negative; the size
guard does not catch the negative value, and the subsequent copy uses
the value as a huge unsigned size, writing past the end of the
undersized heap buffer. AddressSanitizer reports heap-buffer-overflow
WRITE at resource_format_binary.cpp:872.

Impact:
Attacker-controlled heap out-of-bounds write on load. The binary
resource loader ships in export templates; an exported game that loads
player- or community-supplied .res files runs this code on untrusted
input.

Reproduction:
Archive godot47_binres_oob_repro.zip (README, bug_analysis.md,
make_repro.py regenerates the crafted resource), with extracted
contents and per-bug README:
https://github.com/bitbutter/godot-security-pocs/tree/main/2026-09-untrusted-file-parsers/binres
SHA-256: 920daf712f53fd8e0085bfc148c5ea5c6839d4136bf6e0d13a14a3e4385a4620
Trigger paths (Windows): placing the crafted .res in a project folder
crashes the editor on startup (resource-dependency scan, no user
action); a headless script load exits with STATUS_HEAP_CORRUPTION
(0xC0000374). Under AddressSanitizer or PageHeap, a 4 KiB payload
yields an immediate heap-buffer-overflow WRITE at
resource_format_binary.cpp:872. The same archive was distributed with
the original report and is linked from the correspondence section of
the disclosure post [1].

Fix status:
Unpatched as of 2026-10-13 (master, 4.7.2, 4.7.1, 4.7).

CVE status:
Requested from MITRE's CVE Numbering Authority of Last Resort (CNA-LR)
on 2026-09-20, prior to publication. No IDs assigned as of 2026-10-14;
this thread will be self-replied when IDs arrive.

Timeline (dates and links only):
2026-06-23 — reported privately to security () godotengine org with
reproduction and suggested patch.
2026-09-18 — public notice: https://github.com/godotengine/godot/issues/123608
2026-09-19 — vendor response classifying the issues as not security
issues: https://github.com/godotengine/godot/issues/123608

Credit:
Found during an automated audit directed by the reporter (LLM-driven
source analysis; Claude Code — discovery by Opus 4.8, report and
reproduction by Sonnet 4.6). Reproductions verified against official
release binaries. Reported and disclosed by Tomasz Kaye.

[1] https://axeghost.offprint.app/a/3mvs6zo4blo23-three-memory-safety-bugs-in-godots-untrusted-file-parsers

```
