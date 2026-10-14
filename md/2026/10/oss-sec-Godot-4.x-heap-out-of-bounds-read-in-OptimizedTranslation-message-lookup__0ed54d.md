---
title: "oss-sec: Godot 4.x: heap out-of-bounds read in OptimizedTranslation message lookup"
source: https://seclists.org/oss-sec/2026/q4/157
source_host: seclists.org
clip_date: 2026-10-14T23:09:29+08:00
trace_id: 2ecdabeb-91a1-4bd2-a73d-318d6a35303f
content_hash: 8d2c15f734c5b7a5b51568c4ae19e4a28c87d4c454968a5500e0770f2f27dd86
status: synced
tags:
  - 漏洞分析
  - AI辅助逆向
series: null
feed_source: oss-security·漏洞披露
ai_summary: Godot 4.x 的 OptimizedTranslation 消息查找缺少边界检查，特制翻译资源即可触发堆越界读取，导致崩溃或堆内存泄露，且截至 2026-10-13 仍未修复。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f975244-d011-812d-b241-fe1eceb44d45
ioc:
  cves: []
  cwes: []
  hashes:
    - 19cc54698b40c15e214ce310307fc854b58e631e577c61647aca12ab442d0a70
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Godot 4.x 的 OptimizedTranslation 消息查找缺少边界检查，特制翻译资源即可触发堆越界读取，导致崩溃或堆内存泄露，且截至 2026-10-13 仍未修复。
> 
> - **漏洞位置：** `core/string/optimized_translation.cpp` 的 `get_message()` —— 4.7-stable 中第 259 行桶索引与第 277 行字符串偏移均无边界校验，`get_translated_message_list()`（第 299 行）模式相同。
> - **触发条件：** 加载特制的 `.translation` 或 `.tres` 资源；仅哨兵值 `0xFFFFFFFF` 被拒绝，uint32_t 表项被直接用作桶表下标。该加载器存在于导出模板中，因此加载玩家/社区翻译资源的已导出游戏会处理不可信输入。
> - **影响：** 确定性崩溃（首个 `tr()` 调用在官方 64 位二进制上即触发）；信息泄露——`tr()` 会把字符串缓冲区之外的堆字节作为翻译结果返回，可流向 GDScript 调用方、UI、日志或网络输出。
> - **修复与披露：** 2026-06-23 私下报告；厂商 2026-09-19 将其归为非安全问题；截至 2026-10-13（master、4.7.2、4.7.1、4.7）未修补；CVE 于 2026-09-20 向 CNA-LR 申请，2026-10-14 仍未分配。
> - **复现与来源：** POC 归档含崩溃与泄露两个变体，ASan 在 `optimized_translation.cpp:277` 报 heap-buffer-overflow READ；漏洞由 LLM 驱动的自动化审计发现（Claude Code）。

## oss-sec mailing list archives

## Godot 4.x: heap out-of-bounds read in OptimizedTranslation message lookup

* * *

*From*: Tomasz Kaye <tomasz.brain () gmail com>  
*Date*: Wed, 14 Oct 2026 12:11:48 +0200  

* * *

```sql
Three memory-safety bugs in Godot 4's untrusted-file parsers were
publicly disclosed on 2026-09-21 [1]. This thread covers the
OptimizedTranslation bug.

Affected versions:
Godot 4.7-stable, official release build, verified. Earlier versions
presumed affected. The loader has been in the engine since 2014
(commit 0b806ee0fc). Unpatched as of 2026-10-13 (master, 4.7.2, 4.7.1,
4.7).

Description:
OptimizedTranslation::get_message
(core/string/optimized_translation.cpp) looks up strings through a
hash table read verbatim from the compiled translation resource. A
crafted .translation or .tres resource of this type is a full control
surface: the uint32_t table entry is used as an index into the bucket
table with no bounds check — only the sentinel 0xFFFFFFFF is rejected
— and the bucket's string offset is used against the strings array
without a bounds check. As of 4.7-stable the unchecked bucket load is
at line 259 and the unchecked string read at line 277; the identical
pattern is present in get_translated_message_list() (line 299).

Impact:
Crash: the first tr() call through a far out-of-range entry faults,
deterministically on stock 64-bit binaries, editor and export
templates. Information disclosure: tr() returns bytes read from an
attacker-chosen offset past the end of the strings buffer reaching
GDScript callers, game UI, logs, or network output. The translation
loader ships in export templates; an exported game that loads player-
or community-supplied translation resources runs this code on
untrusted input.

Reproduction:
Archive godot47_optimized_translation_oob_repro.zip (README,
bug_analysis.md, make_repro.py; crash and info-leak variants of the
crafted resource), with extracted contents and per-bug README:
https://github.com/bitbutter/godot-security-pocs/tree/main/2026-09-untrusted-file-parsers/optimized-translation
SHA-256: 19cc54698b40c15e214ce310307fc854b58e631e577c61647aca12ab442d0a70
Crash variant: the first tr() call faults on a stock 64-bit binary.
Leak variant: tr() returns heap bytes as the translated string;
confirmed during the audit on an official 4.7 build without
instrumentation. Under AddressSanitizer the leak variant reports
heap-buffer-overflow READ at optimized_translation.cpp:277. The same
archive was distributed with the original report and is linked from
the correspondence section of the disclosure post [1].

Fix status:
Unpatched as of 2026-10-13 (master, 4.7.2, 4.7.1, 4.7).

CVE status:
Requested from MITRE's CVE Numbering Authority of Last Resort (CNA-LR)
on 2026-09-20, prior to publication. No IDs assigned as of 2026-10-14;
this thread will be self-replied when IDs arrive.

Timeline
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
