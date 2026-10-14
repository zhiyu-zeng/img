---
title: "oss-sec: Godot 4.x: heap out-of-bounds write in Radiance HDR image loader"
source: https://seclists.org/oss-sec/2026/q4/160
source_host: seclists.org
clip_date: 2026-10-15T00:14:53+08:00
trace_id: 2349654a-3ae1-45a6-890f-e98a4baad67d
content_hash: 20703d0d495d2b1269d188a39324484fade5951f20a8466e52b4117c023dc0f9
status: synced
tags:
  - 漏洞分析
  - 游戏安全
series: null
feed_source: oss-security·漏洞披露
ai_summary: Godot 4.x 的 Radiance HDR 加载器信任文件中的 RLE 计数，导致攻击者可构造 `.hdr` 触发堆越界写，官方 4.7 正式版已验证崩溃，截至 2026-10-13 仍未修复。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f975244-d011-81ad-aa6b-cf956c93f4f2
ioc:
  cves: []
  cwes: []
  hashes:
    - 604982a1d0f8b0b7f19ec9a75d565f51a7879f2cdddf898c58234bef6e54f380
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Godot 4.x 的 Radiance HDR 加载器信任文件中的 RLE 计数，导致攻击者可构造 `.hdr` 触发堆越界写，官方 4.7 正式版已验证崩溃，截至 2026-10-13 仍未修复。
> 
> - **受影响范围：** Godot 4.7-stable 官方构建（commit 5b4e0cb0f）已验证，更早 4.x 推测受影响；该加载器 2017 年 5 月引入（commit bb20f230ad），master、4.7.2、4.7.1、4.7 均未修补。
> - **漏洞位置：** `ImageLoaderHDR::load_image`（`modules/hdr/image_loader_hdr.cpp` 第 104–118 行）解码 Radiance HDR 的 run-length 数据时，未将文件中读到的 run/dump 计数与预留图像缓冲区校验。
> - **影响与触发：** 攻击者可控堆越界写，导入恶意 `.hdr` 即可触发；在 Windows 官方 4.7 构建上表现为 `STATUS_HEAP_CORRUPTION`（0xC0000374）。HDR 加载器随导出模板分发，加载玩家/社区提供 `.hdr`（mod、下载、上传）的导出游戏会以不可信输入执行该代码。
> - **复现与处置：** PoC 归档含 evil4ch.hdr、ok.hdr、repro.gd、verify.ps1、project.godot，原包 SHA-256 为 604982a1…f380；`verify.ps1` 下恶意文件退出码 0xC0000374、正常文件退出 0。厂商在 2026-09-19 将问题定性为非安全问题；CVE 于 2026-09-20 向 CNA-LR 申请，至 10-14 未分配。
> - **来源：** 由 Tomasz Kaye 主导的 LLM 自动化源码审计发现（Claude Code，Opus 4.8 定位、Sonnet 4.6 出报告与复现），复现均在官方发布二进制上验证。

## oss-sec mailing list archives

## Godot 4.x: heap out-of-bounds write in Radiance HDR image loader

* * *

*From*: Tomasz Kaye <tomasz.brain () gmail com>  
*Date*: Wed, 14 Oct 2026 17:27:33 +0200  

* * *

```swift
Three memory-safety bugs in Godot 4's untrusted-file parsers were
publicly disclosed on 2026-09-21 [1]. This thread covers the HDR
loader bug.

Affected versions:
Godot 4.7-stable, official release build (commit 5b4e0cb0f), verified.
Earlier 4.x presumed affected. The loader was added in May 2017
(commit bb20f230ad). Unpatched as of 2026-10-13 (checked on master,
4.7.2, 4.7.1, 4.7).

Description:
ImageLoaderHDR::load_image (modules/hdr/image_loader_hdr.cpp, lines
104-118) decodes Radiance HDR run-length data. Run and dump counts
read from the file are trusted without checking them against the
reserved image buffer. A crafted .hdr file directs the decoder to
write attacker-controlled data past the end of the heap buffer.

Impact:
Attacker-controlled heap out-of-bounds write, confirmed by
heap-corruption crash on the official 4.7 release build
(STATUS_HEAP_CORRUPTION, 0xC0000374). Reachable when Godot imports a
malicious .hdr file. The HDR loader ships in export templates; an
exported game that loads player- or community-supplied .hdr files
(mods, downloads, uploads) runs this code on untrusted input.

Reproduction:
Archive (evil4ch.hdr, ok.hdr, repro.gd, verify.ps1, project.godot),
with extracted contents and per-bug README:
https://github.com/bitbutter/godot-security-pocs/tree/main/2026-09-untrusted-file-parsers/hdr
SHA-256 of the original archive (godot47_hdr_oob_repro.zip):
604982a1d0f8b0b7f19ec9a75d565f51a7879f2cdddf898c58234bef6e54f380
verify.ps1 runs both files through an official 4.7 build; the crafted
file exits with STATUS_HEAP_CORRUPTION (0xC0000374), the valid
baseline exits 0. The same archive was distributed with the original
report and is linked from the correspondence section of the disclosure
post [1].

Fix status:
Unpatched as of 2026-10-13 (master, 4.7.2, 4.7.1, 4.7).

CVE status:
Requested from MITRE's CVE Numbering Authority of Last Resort (CNA-LR)
on 2026-09-20, prior to publication. No IDs assigned as of 2026-10-14;
this thread will be self-replied when IDs arrive.

Timeline (dates and links only):
2026-06-22 — reported privately to security () godotengine org with
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
