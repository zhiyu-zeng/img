---
title: "oss-sec: OpenJPEG: heap-buffer-overflow write fixed on master since Feb 2026, still present in every release (2.5.3, 2.5.4)"
source: https://seclists.org/oss-sec/2026/q4/100
source_host: seclists.org
clip_date: 2026-10-08T19:23:11+08:00
trace_id: ddc52b85-9b71-4a59-84de-d23266fb4f37
content_hash: ae313abe9dbfbd4ba3d41cd4b668694ba0a0e82abdc237a8fe7d898edb0d84c5
status: synced
tags:
  - 漏洞分析
  - 供应链安全
series: null
feed_source: oss-security·漏洞披露
ai_summary: OpenJPEG 的堆缓冲区溢出写漏洞已在 master 修复数月却从未进入任何发行版，2.5.3/2.5.4 及下游发行版仍受影响，建议回植三行守卫补丁。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f375244-d011-8108-a6de-f75517eced98
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> OpenJPEG 的堆缓冲区溢出写漏洞已在 master 修复数月却从未进入任何发行版，2.5.3/2.5.4 及下游发行版仍受影响，建议回植三行守卫补丁。
> 
> - **根因：** j2k.c 的 `opj_j2k_read_sod()` 对 `tp_index` 既不判空也不查越界，索引直接取自 SOT 的 TPsot 单字节；同文件 `opj_j2k_add_tlmarker()` 已有等效守卫。
> - **触发条件：** 码流含有效 TLM 标记（`tp_index` 按 TLM 条目数一次性分配），且每个 SOT 的 TNsot=0，使 TPsot 越界；最多越界 255×24=6120 字节，写入值来自可控的 32 位 Psot。
> - **版本状态：** 954c6e3c（2024-06-25）引入，2.5.2 及更早不受影响；OSV-2025-219 追踪；91d08b11（2026-02-10）修复，但无任何发行版包含，最新 v2.5.4 仍存在。
> - **影响面：** PDF 的 /JPXDecode 对象可经 Poppler、MuPDF、Ghostscript、ImageMagick 触发，6.5 KB PDF 在 ASan 下即可复现；Pillow 自带 libopenjp2 已自行打补丁。
> - **建议动作：** 回植 91d08b11；该缺陷无 CVE、无发行版公告，维护者未回应私下询问。

## oss-sec mailing list archives

## OpenJPEG: heap-buffer-overflow write fixed on master since Feb 2026, still present in every release (2.5.3, 2.5.4)

* * *

*From*: TheSecguy <thesecguy45 () gmail com>  
*Date*: Thu, 8 Oct 2026 00:51:41 -0700  

* * *

```
Hello,

Short version: OpenJPEG has had a heap-buffer-overflow WRITE fixed on
master since
2026-02-10 that has never appeared in a release. Every released version
containing the
affected code -- v2.5.3 and v2.5.4 -- is still vulnerable, and
distributions are
shipping it. There is no CVE and no advisory mapped to distro packages, so
it is
unlikely to be on packagers' radars.


THE DEFECT

src/lib/openjp2/j2k.c, in opj_j2k_read_sod():

OPJ_UINT32 l_current_tile_part =
l_cstr_index->tile_index[p_j2k->m_current_tile_number].current_tpsno;
l_cstr_index->tile_index[...].tp_index[l_current_tile_part].end_header =
l_current_pos;
l_cstr_index->tile_index[...].tp_index[l_current_tile_part].end_pos =
l_current_pos + p_j2k->m_specific_param.m_decoder.m_sot_length + 2;

tp_index is neither null-checked nor bounds-checked, and
l_current_tile_part comes
directly from the one-byte TPsot field of the SOT marker.

The correct guard already exists a few lines away in the same file, in
opj_j2k_add_tlmarker() (j2k.c:8459), writing the same array at the same
index behind

if (tp_index && l_current_tile_part < nb_tps)

One writer checked, its sibling not.

Reached by giving the codestream a valid TLM marker -- so tp_index is
allocated once by
opj_j2k_build_tp_index_from_tlm(), sized to the TLM entry count, and
opj_j2k_read_sot()
then skips all resizing -- while setting TNsot = 0 in every SOT. That keeps
the TLM
"valid" and lets TPsot walk past the allocation. TPsot is one byte, so the
ceiling is
255 * 24 = 6120 bytes past a 24-byte allocation, with the written value
derived from
the attacker-controlled 32-bit Psot field.


STATUS

introduced : 954c6e3c (2024-06-25, a TLM optimisation)
-- note 2.5.2 and earlier are NOT affected
tracked : OSV-2025-219, published 2025-03-18, from OSS-Fuzz issue 403673832
fixed : 91d08b11 (2026-02-10, PR #1621), merged as d33cbecc
released : nowhere. Newest tag is v2.5.4 (2025-09-20);
`git compare v2.5.4...91d08b11` reports ahead 6, behind 0.


DOWNSTREAM REACH

A /JPXDecode image XObject in a PDF reaches this through Poppler (pdftoppm,
pdfimages,
pdftocairo), MuPDF (mutool draw), Ghostscript and ImageMagick -- all
reproduced here
under ASan from a single 6.5 KB PDF.

Pillow's wheels bundle their own libopenjp2 and were affected independently
of the host
package. They have now applied 91d08b11 as a wheel-build patch
(python-pillow/Pillow
PR #10156, merged) because they did not expect an OpenJPEG release in time.


SUGGESTED ACTION

Backport 91d08b11. It is a three-line guard, identical to one already
present a few
lines away in the same file.


I contacted the OpenJPEG maintainer privately on 2026-10-06 asking for a
release and
have had no reply. I am posting here rather than to distros@ precisely
because the
issue is already public -- OSV has tracked it since March 2025 and the fix
is public on
master.

Regards,
Owais
```
