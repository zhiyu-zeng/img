---
title: "oss-sec: openjpeg 2.4.0 through 2.5.4 and git master: heap buffer overflow in opj_dwt_encode_and_deinterleave_v() (reversible 5/3 forward DWT, encoder)"
source: https://seclists.org/oss-sec/2026/q4/44
source_host: seclists.org
clip_date: 2026-10-06T01:10:20+08:00
trace_id: 7e08ab7a-a47d-4f5c-a198-59c21097d32b
content_hash: 9535e1d7fa556547eec4f0cccb37bcdf6d709be765a9c4c1cec272ea5efc1e1b
status: synced
tags:
  - 漏洞分析
  - 安全工具
series: null
feed_source: oss-security·漏洞披露
ai_summary: OpenJPEG 2.4.0–2.5.4 及 master 的可逆 5/3 正变换垂直通道存在堆越界读写：当某分辨率级高度为 0 且起始坐标为奇数时读写临时缓冲区之外，可导致进程中止（编码器侧 DoS）。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f075244-d011-8179-81c8-e7fe3642ab2a
ioc:
  cves: []
  cwes:
    - CWE-125
    - CWE-787
  hashes:
    - 8314119b067c0fc77834731168daaebd379fdb12
    - a38e970fa59abd796c703ec469e578b09f7ffa33
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> OpenJPEG 2.4.0–2.5.4 及 master 的可逆 5/3 正变换垂直通道存在堆越界读写：当某分辨率级高度为 0 且起始坐标为奇数时读写临时缓冲区之外，可导致进程中止（编码器侧 DoS）。
> 
> - **受影响范围：** `opj_dwt_encode_and_deinterleave_v()`（src/lib/openjp2/dwt.c）的垂直通道，代码自 2020-05-22 的 commit a38e970f（向量化加速）引入，2.4.0 起首发，2.3.1 及更早为另一实现；不可逆 9/7 通道 `opj_dwt_encode_and_deinterleave_v_real()` 不受影响。
> - **触发条件：** 图像尺寸、tile 尺寸与分解层数共同导致某级零高度（`opj_int_ceildivpow2()` 下两个边界落到同一坐标），此时 `sn`/`dn` 均为 0，若 `l_cur_res->y0` 为奇数则走 else 分支，访问 `tmp[8+c]`（dwt.c:1658、1716），而缓冲区仅 32 字节。
> - **影响与证据：** 单次编码退出码 0 且可字节级回环，码流不受影响；无 sanitizer 时同一进程重复编码 8 次触发 glibc `malloc.c:2599 (sysmalloc) assertion failed`、exit=134，说明存在越界写（CWE-787），ASan 另报越界读（CWE-125）。
> - **复现方式：** 用脚本生成 1×6 PGM，执行 `opj_compress -i in1x6.pgm -o out.j2k -t 4,5 -n 3`；PR 附带的回归测试可运行 `ctest -R empty_resolution_encode`。
> - **补丁与状态：** 4 行修复——在函数开头加 `if (height == 0) { return; }`，位置对齐同类函数，同时覆盖 SSE2 与通用路径；与处理水平通道零宽度的 #1657 互不影响，需分别携带。2026-09-27 私下报告，10-04 窗口无回复，10-05 公开 issue #1673 / PR #1674，尚无 CVE；上游 README 已声明项目停止维护。

## oss-sec mailing list archives

## openjpeg 2.4.0 through 2.5.4 and git master: heap buffer overflow in opj_dwt_encode_and_deinterleave_v() (reversible 5/3 forward DWT, encoder)

* * *

*From*: "Security @ Red Eagle Tech" <security () redeagle tech>  
*Date*: Mon, 5 Oct 2026 10:18:03 +0000  

* * *

```swift
Hello,

OpenJPEG's reversible (5/3) forward wavelet transform reads and writes past
the end of a heap allocation when a tile's lower resolution levels have zero
height at an odd start. It is an encoder-side issue, not a decoder one: it is
reached through the encoding parameters, not through a crafted input file.

A single encode usually looks fine. Repeat the same encode in one process, as
any program that encodes more than one image does, and glibc's own heap
checking aborts the process.

Upstream has been given the report and a patch; the four-line patch is below
and in the pull request linked at the end. The repository's README currently
declares the project unmaintained, so packagers may need to carry the patch
themselves.


AFFECTED
========

Function: opj_dwt_encode_and_deinterleave_v(), src/lib/openjp2/dwt.c
Component: libopenjp2, the forward 5/3 (reversible) DWT, vertical pass

Tested: git master at 8314119b067c0fc77834731168daaebd379fdb12
        (git describe: v2.5.4-29-g8314119b), and the same with the open
        pull request #1657 cherry-picked on top -- which does not change
        this behaviour.

Version range, from the repository's history rather than from testing: the
code in question arrived with commit a38e970fa59abd796c703ec469e578b09f7ffa33,
"Forward DWT 5-3: major speed up by vectorizing vertical pass" (2020-05-22),
first released in 2.4.0. Running
"git log -S'if (height == 0)' -- src/lib/openjp2/dwt.c" returns nothing, so no
such guard has ever been in the function. That puts the code
in 2.4.0, 2.5.0, 2.5.1, 2.5.2, 2.5.3, 2.5.4 and current master, and not in
2.3.1 or earlier, where the vertical pass was a different implementation that
we have not examined. We did not build or run any released tarball; every
measurement below is against master at 8314119b.

Not affected: the irreversible (9/7) vertical pass,
opj_dwt_encode_and_deinterleave_v_real(). At height 0 every lifting step there
is inert, and the "-I" route on the same geometry is clean under
AddressSanitizer.


WHAT HAPPENS
============

opj_dwt_encode_procedure() runs the vertical pass once per group of up to
NB_ELTS_V8 (= 8) columns whenever the resolution level has at least one
column, so a level with zero height still reaches the function with
height == 0. A tile's two edges can land on the same coordinate under
opj_int_ceildivpow2() when the tile is short and the number of decomposition
levels is large, which is where a zero-height level comes from.

At height == 0, sn and dn are both 0. At an even start the function does
nothing. At an odd start (cas_col = l_cur_res->y0 & 1) it takes the else
branch and addresses tmp[] for two rows that do not exist -- identically in
the "#ifdef __SSE2__" path and in the generic one. On master:

    /* dwt.c:1657-1659 */
    for (c = 0; c < NB_ELTS_V8; c++) {
        OPJ_Sc(0) -= OPJ_Dc(0);           /* 1658: reads tmp[8 + c] */
    }

    /* dwt.c:1714-1718. (height % 2) == 0 is true at height 0, and i is 0 */
    /* here, because the loop at 1691 is skipped when dn == 0.           */
    if (((height) % 2) == 0) {
        for (c = 0; c < NB_ELTS_V8; c++) {
            OPJ_Dc(i) += (OPJ_Sc(i) + OPJ_Sc(i) + 2) >> 2;
                                          /* 1716: reads and assigns
                                             tmp[8 + c]               */
        }
    }

The scratch buffer is sized opj_dwt_max_resolution(...) * NB_ELTS_V8 *
sizeof(OPJ_INT32) and allocated at dwt.c:1967-1974. Where the tile's largest
resolution level is a single sample, that is 32 bytes, and tmp[8..15] is the
32 bytes immediately after it.

opj_dwt_deinterleave_v_cols() runs zero iterations at sn == dn == 0, so
nothing is written to the tile and the codestream is unaffected. A round-trip
comparison therefore cannot find this.


IMPACT, AS MEASURED
===================

x86-64 Linux 6.6.87 (WSL2), Ubuntu 24.04.2 LTS, gcc 13.3.0.

1. A single encode of such a geometry exits 0 and round-trips byte-exactly.
   Two geometries on each of two trees, 20 runs each: 20/20 exit 0, 20/20
   identical. Nothing visible happens.

2. Under AddressSanitizer (-fsanitize=address -fno-omit-frame-pointer -g,
   RelWithDebInfo), on master and identically with #1657 applied:

     ==451==ERROR: AddressSanitizer: heap-buffer-overflow on address
       0x505000000080
     READ of size 4 at 0x505000000080 thread T0
         #0 in opj_dwt_encode_and_deinterleave_v .../dwt.c:1658
         #1 in opj_dwt_encode_procedure .../dwt.c:2016
         #2 in opj_tcd_dwt_encode .../tcd.c:2574
         #3 in opj_tcd_encode_tile .../tcd.c:1507
         #4 in opj_j2k_write_sod .../j2k.c:4931
         #7 in opj_j2k_encode .../j2k.c:12749
         #8 in main .../src/bin/jp2/opj_compress.c:2288
     0x505000000080 is located 0 bytes after 32-byte region
       [0x505000000060,0x505000000080)
     allocated by thread T0 here:
         #0 in posix_memalign
         #1 in opj_aligned_alloc_n .../opj_malloc.c:61
         #2 in opj_aligned_32_malloc .../opj_malloc.c:218
         #3 in opj_dwt_encode_procedure .../dwt.c:1974

   Rebuilt with -fsanitize-recover=address, so the process continues past the
   first report, it reports two out-of-bounds accesses rather than one -- the
   second at dwt.c:1716 -- both "READ of size 4" at 0x505000000080, the first
   address after the allocation. Both statements sit inside a
   "for (c = 0; c < NB_ELTS_V8; c++)" loop, so on a reading of the source each
   should touch all eight words; we did not get the sanitizer to list them
   individually, and only the two above were observed.

   Read versus write: the sanitizer classes both as reads and never prints a
   write. At 1658 the assignment target is in bounds; at 1716 gcc appears to
   check the read-modify-write once and class it a read. That 1716 also
   assigns to the out-of-bounds element is our reading of the source, and
   point 3 is independent evidence for it.

3. In a plain Release build, with no sanitizer at all, the same encode
   repeated in one process makes glibc abort the process. A program doing the
   1x6 encode below eight times in one process, linked against an ordinary
   Release build:

     master + PR 1657                   master + PR 1657 + the patch
     --------------------------------   ----------------------------
     encode 0 ok                        encode 0 ok
     Fatal glibc error: malloc.c:2599   ... encode 7 ok
       (sysmalloc): assertion failed    all 8 encodes completed
     exit=134 (SIGABRT, core dumped)    exit=0

   The regression test in the pull request does the same thing through ctest
   and reports "corrupted size vs. prev_size", also with no sanitizer
   involved. A read cannot corrupt glibc's heap metadata, so this is
   tool-independent evidence that the branch writes past the allocation,
   which the sanitizer's classification leaves open.

So what is established is: an out-of-bounds read of heap memory immediately
after a 32-byte allocation (CWE-125), an out-of-bounds write to the same
place (CWE-787, from reading the source plus glibc's heap-corruption abort),
and a reachable denial of service in the form of that abort.

WHAT WE DO NOT CLAIM
--------------------

- We have not looked at what the overwritten bytes can be made to contain,
  and we make no claim about exploitability beyond the abort above.
- We did not check whether any real-world encoder configuration reaches this
  geometry in practice; we reached it deliberately. The geometry follows from
  the image dimensions, the tile size and the number of decomposition levels,
  which are parameters the calling application sets. An application that
  encodes attacker-supplied dimensions with fixed tile and resolution
  parameters is the shape of deployment where this would matter, but we have
  not surveyed for one.
- We tested only x86-64 Linux with gcc 13. On MSVC, opj_aligned_32_malloc()
  uses _aligned_malloc() rather than posix_memalign(), and we cannot say how
  the overrun behaves there.
- We looked only at the forward transform, not the decoder.


REPRODUCER
==========

No attachment needed. Sample at (x, y) is (7x + 13y) & 0xff.

    cat > make_pgm.py <<'PY'
    import sys
    w, h, path = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    px = bytes(((7 * x + 13 * y) & 0xFF) for y in range(h) for x in range(w))
    open(path, "wb").write(b"P5\n%d %d\n255\n" % (w, h) + px)
    PY
    python3 make_pgm.py 1 6 in1x6.pgm

    # lossless: no -r, no -q, no -I
    opj_compress -i in1x6.pgm -o out.j2k -t 4,5 -n 3

Against a Release build this exits 0 and the file round-trips. Against a build
with -fsanitize=address it gives the report above. To see the abort with no
sanitizer, do the same encode eight times in one process; the test added by
the pull request does exactly that and can be run with
"ctest -R empty_resolution_encode".


THE PATCH
=========

Four lines, one function. It applies cleanly on plain master and on master
with #1657 applied, checked with "git apply" against two fresh clones, so it
can be taken either before or after #1657.

    --- a/src/lib/openjp2/dwt.c
    +++ b/src/lib/openjp2/dwt.c
    @@ -1573,6 +1573,10 @@ static void opj_dwt_encode_and_deinterleave_v(
         const OPJ_UINT32 sn = (height + (even ? 1 : 0)) >> 1;
         const OPJ_UINT32 dn = height - sn;

    +    if (height == 0) {
    +        return;
    +    }
    +
         opj_dwt_fetch_cols_vertical_pass(arrayIn, tmpIn, height,
                                          stride_width, cols);

At height == 0 there is nothing to transform: sn and dn are both 0, so
opj_dwt_fetch_cols_vertical_pass() copies no rows, every lifting loop is
empty, and opj_dwt_deinterleave_v_cols() runs zero iterations and writes
nothing. Returning immediately is equivalent to the current code in
everything it produces. It is shaped and placed to match the sibling
function, opj_dwt_encode_and_deinterleave_v_real(), which already has
"if (height == 1) { return; }" in that same position. One guard covers both
the SSE2 and the generic path, and it cannot affect a non-empty level because
the condition is exactly height == 0.


RELATION TO #1575 AND #1657
===========================

OpenJPEG issue #1575 and the open pull request #1657 cover the other half of
this, in the two horizontal passes: a reversible encode that does not
round-trip when a resolution level has zero width. #1657 is two lines, by
Nico Weber, and it fixes what it sets out to fix; we confirmed that.

#1657 does not touch opj_dwt_encode_and_deinterleave_v(), and the sanitizer
report above is the same with #1657 applied as without it. #1657 has been
open since 2026-07-12 and is not merged at the time of writing, so a
distribution carrying only #1657 still has the issue described here, and one
carrying neither has both.


UPSTREAM STATUS AND TIMELINE
============================

All dates 2026, times UTC.

  2026-09-27 20:22Z  Reported privately by e-mail, with the analysis above, a
                     transcript of the runs and the patch, to the committer
                     with by far the most commits in the repository's recent
                     history. The project documents no private route: there
                     is no SECURITY.md, and GitHub's private vulnerability
                     reporting is disabled for the repository. The message
                     gave a seven-day window, said it was a default rather
                     than a deadline, offered to wait longer or to move the
                     whole thing into the open immediately if preferred, and
                     said silence would not be read as consent or refusal. It
                     also said what would follow: a public issue, a pull
                     request carrying the patch, and this post.
  2026-10-03         A short correction to one sentence of that report, and a
                     reminder of the planned public disclosure, sent on the
                     same thread.
  2026-10-04         The window closed with no reply.
  2026-10-05         Public issue, pull request and this post.

  Issue:        https://github.com/uclouvain/openjpeg/issues/1673
  Pull request: https://github.com/uclouvain/openjpeg/pull/1674

No CVE ID yet. I am requesting one from MITRE's CNA of Last Resort, which
covers projects that run no numbering authority of their own, and will reply
to this message with the ID when it is assigned -- the order this list's own
guidelines ask for.

The repository's README has declared the project unmaintained since
2026-07-07 ("no committer currently feel responsible to regularly review
tickets or pull requests"), so the pull request may sit for a while. The
patch above is four lines and stands on its own if you would rather not wait.

Regards,

--
Red Eagle Tech
security () redeagle tech

```
