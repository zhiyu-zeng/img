---
title: 【GitHub】google-ctf/2025/quals/pwn-webz at main
source: https://github.com/google/google-ctf/tree/main/2025/quals/pwn-webz
source_host: github.com
clip_date: 2026-10-31T05:13:49+08:00
trace_id: b31d7d1e-a7e8-48e1-8020-bfb1759da379
content_hash: fb54569f8e450d4b4bad416de1ec0f6dc7d529ab953a1cc596873ff13080830a
status: synced
tags:
  - GitHub
  - 漏洞分析
  - CTF
series: null
feed_source: Brendon Tiszka·V8/浏览器
ai_summary: Google CTF 2025 pwn 题 webz 针对删除了 oversubscribed/incomplete 树检查的 google-zlib，用 LEN/DIST 类型混淆破坏 inffast 不变量实现利用。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40975244-d011-81c3-8c2e-cc0bdf3b6f95
ioc:
  cves: []
  cwes: []
  hashes:
    - 2c282408771115b3cf80eeb9572927b796ddea79
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Google CTF 2025 pwn 题 webz 针对删除了 oversubscribed/incomplete 树检查的 google-zlib，用 LEN/DIST 类型混淆破坏 inffast 不变量实现利用。
> 
> - **漏洞根源：** google-zlib 沿 2023 年 WebP 0day 的思路，从 inftrees.c 中移除了对 oversubscribed（过度订阅）与 incomplete（不完整）Huffman 树的检查，并把 ENOUGH_LENS/ENOUGH_DISTS 从 852/592 扩到 `1<<15`，以省去 inflate 流程中的表溢出检查。
> - **既有防御：** google-zlib 额外分配了可容纳 210 个表项的大缓冲区，使非法树无法像 WebP 0day 那样直接对 Huffman 表本身造成越界写。
> - **利用路径：** 不完整树会让 Huffman 表槽位保持未初始化，导致 LEN 码与 DIST 码之间的类型混淆，进而打破 inffast 的不变量，触发线性缓冲区溢出。
> - **利用链收尾：** 溢出 z_stream 对象 → 相对地址泄露 → 任意读 → 覆写 zalloc 函数指针 → ret2libc 拿到执行流。

### webz

So you are pretty good at browser pwn. Let's try something new. Maybe [The WebP 0day](https://blog.isosceles.com/the-webp-0day) inspired you too?

### Exploitation

google-zlib removes the [oversubscribed & incomplete](https://github.com/madler/zlib/blob/develop/inftrees.c#L125-L133) tree checks from zlib (similar to the bug that led to the webp [0day from 2023](https://blog.isosceles.com/the-webp-0day/)).

```objectivec
From 2c282408771115b3cf80eeb9572927b796ddea79 Mon Sep 17 00:00:00 2001
From: Brendon Tiszka <tiszka@google.com>
Date: Wed, 21 May 2025 15:11:52 +0000
Subject: [PATCH] [google-zlib] Increase Huffman Table Size

The basic idea is to use a bigger root & secondary table for both
dists and lens, allowing us to avoid oversubscription chekcs.
---
 inftrees.c | 18 ------------------
 inftrees.h | 18 +++++-------------
 2 files changed, 5 insertions(+), 31 deletions(-)

diff --git a/inftrees.c b/inftrees.c
index a127e6b..7a8dd2e 100644
--- a/inftrees.c
+++ b/inftrees.c
@@ -122,16 +122,6 @@ int ZLIB_INTERNAL inflate_table(codetype type, unsigned short FAR *lens,
         if (count[min] != 0) break;
     if (root < min) root = min;
 
-    /* check for an over-subscribed or incomplete set of lengths */
-    left = 1;
-    for (len = 1; len <= MAXBITS; len++) {
-        left <<= 1;
-        left -= count[len];
-        if (left < 0) return -1;        /* over-subscribed */
-    }
-    if (left > 0 && (type == CODES || max != 1))
-        return -1;                      /* incomplete set */
-
     /* generate offsets into symbol table for each length for sorting */
     offs[1] = 0;
     for (len = 1; len < MAXBITS; len++)
@@ -200,11 +190,6 @@ int ZLIB_INTERNAL inflate_table(codetype type, unsigned short FAR *lens,
     used = 1U << root;          /* use root table entries */
     mask = used - 1;            /* mask for comparing low */
 
-    /* check available table space */
-    if ((type == LENS && used > ENOUGH_LENS) ||
-        (type == DISTS && used > ENOUGH_DISTS))
-        return 1;
-
     /* process all codes and make table entries */
     for (;;) {
         /* create table entry */
@@ -270,9 +255,6 @@ int ZLIB_INTERNAL inflate_table(codetype type, unsigned short FAR *lens,
 
             /* check for enough space */
             used += 1U << curr;
-            if ((type == LENS && used > ENOUGH_LENS) ||
-                (type == DISTS && used > ENOUGH_DISTS))
-                return 1;
 
             /* point entry in root table to sub-table */
             low = huff & mask;
diff --git a/inftrees.h b/inftrees.h
index 396f74b..42c2c44 100644
--- a/inftrees.h
+++ b/inftrees.h
@@ -35,19 +35,11 @@ typedef struct {
     01000000 - invalid code
  */
 
-/* Maximum size of the dynamic table.  The maximum number of code structures is
-   1444, which is the sum of 852 for literal/length codes and 592 for distance
-   codes.  These values were found by exhaustive searches using the program
-   examples/enough.c found in the zlib distribution.  The arguments to that
-   program are the number of symbols, the initial root table size, and the
-   maximum bit length of a code.  "enough 286 9 15" for literal/length codes
-   returns 852, and "enough 30 6 15" for distance codes returns 592. The
-   initial root table size (9 or 6) is found in the fifth argument of the
-   inflate_table() calls in inflate.c and infback.c.  If the root table size is
-   changed, then these maximum sizes would be need to be recalculated and
-   updated. */
-#define ENOUGH_LENS 852
-#define ENOUGH_DISTS 592
+/* Memory/speed tradeoff. Alocate more-than-ENOUGH space for LENS and
+   DISTS so we can remove overflow checks from `inflate`.
+*/
+#define ENOUGH_LENS (1 << 15)
+#define ENOUGH_DISTS (1 << 15)
 #define ENOUGH (ENOUGH_LENS+ENOUGH_DISTS)
 
 /* Type of code to build for inflate_table() */
-- 
2.50.0.rc0.642.g800a2b2222-goog
```

google-zlib also allocates a large enough buffer to account for oversubscribed & incomplete trees – 210 entries – so that oversubscribed & incomplete tree combinations cannot result in OOB writes in the huffman table itself, like the webp 0day from 2023 did.

However, there are other methods for exploiting incorrect oversubscribed & incomplete tree checks. In zlib specifically, incomplete trees can leave the huffman table slots uninitialized, which can result in a type confusion between LEN and DIST codes, which then can be used to break the inffast invariant and trigger linear buffer overflow.

From there, exploitation is easy, overflow z_stream object -> relative infoleak -> arb read -> overwrite `zalloc` function pointer -> ret2libc.
