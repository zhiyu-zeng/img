---
title: "FUSE Linux Kernel Integer Overflow: pgoff_t Arithmetic Wrap, Maple Tree OOB Write & VMA Corruption | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/fuse-boundary-mathematics-pgoff-overflow/
source_host: netacoding.com
clip_date: 2026-10-01T10:19:26+08:00
trace_id: d4c0576c-a245-4c74-9e6f-9d172ae36100
content_hash: 2d7edc091b15e9c9207c6f748e73004926220569cc0cd3b69563b5d5124cb05b
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: Netacoding·协议/逆向
ai_summary: TL;DR：FUSE 守护进程可谎报 i_size 绕过 s_maxbytes 校验，使 pgoff_t 无符号算术回绕，引发 XArray 越界读、VMA 重叠越界写与截断 memset 破坏 slab。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-815a-8e3f-f7bab3685db8
ioc:
  cves:
    - CVE-2023-32258
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：FUSE 守护进程可谎报 i_size 绕过 s_maxbytes 校验，使 pgoff_t 无符号算术回绕，引发 XArray 越界读、VMA 重叠越界写与截断 memset 破坏 slab。
> 
> - **根因：** `s_maxbytes = MAX_LFS_FILESIZE` 只在 superblock 初始化时设置；之后每次 `FUSE_GETATTR` 都能任意改写 `inode->i_size`，读路径和 `mm/` 子系统不再复查该上限。
> - **致命算术：** `(end_byte + PAGE_SIZE - 1) >> PAGE_SHIFT` 输入 `0xFFFFFFFFFFFFFFFF` 时回绕为 0；随后 `end - 1`（pgoff_t 无符号）变成 `0xFFFFFFFFFFFFFFFF`，循环上界彻底失效。
> - **越界读：** `end == 0` 使 `filemap_get_folios` 被要求扫描到最大索引，遍历预期范围外的 XArray 节点，可能把 shadow entry 当 `struct folio *` 解引用，或截断/失效无关 folio。
> - **越界写：** mmap 长度回绕令 `pglen` 膨胀至 `0x000FFFFFFFFFFFFF`，VMA 边界被倒算，绕过 Maple Tree 重叠检测，从而跨 VMA 写入相邻 PTE、GOT 或堆结构。
> - **截断与影响面：** `loff_t` 隐式降为 `unsigned int` 丢高位，`memset` 越界破坏相邻 slab；v4.20–v5.10（XArray）、v5.16+（folio）、v6.1（Maple Tree）均受影响，v6.6 只有零散 spot-fix，且 UBSAN 不报无符号回绕、KASAN 事后才报。

## Part 3 — Boundary Mathematics: When PAGE_SHIFT Eats Itself

The previous section was about lying to allocators. This section is about lying to arithmetic.

The Linux memory management subsystem is built on a foundation that assumes file sizes are sane. Not bounded by hardware, not bounded by physics — bounded by code. Specifically bounded by `MAX_LFS_FILESIZE`, a single macro that every VFS path is supposed to enforce before any byte offset gets shifted into a page index. When a malicious FUSE daemon returns `attr.size = 0xFFFFFFFFFFFFFFFF` in response to a `vfs_getattr` call, it is not just lying about a file’s size. It is feeding poison into bitwise expressions that the kernel will evaluate hundreds of times per second across `mm/filemap.c`, `mm/mmap.c`, `mm/readahead.c`, and the entire folio infrastructure.

The math breaks. And when math breaks in the page cache, the XArray walks off a cliff.

## 3.1 The Constants That Are Supposed To Save You

Let’s nail down the invariants the kernel relies on. From `include/linux/fs.h` on a modern 64-bit build:

```c
/* include/linux/fs.h */
#if BITS_PER_LONG == 32
#define MAX_LFS_FILESIZE   (((loff_t)PAGE_SIZE << (BITS_PER_LONG-1)) - 1)
#elif BITS_PER_LONG == 64
#define MAX_LFS_FILESIZE   ((loff_t)LLONG_MAX)
#endif
```

On x86_64 / arm64 / riscv64, `MAX_LFS_FILESIZE` evaluates to `0x7FFFFFFFFFFFFFFF`. That high bit being clear is not cosmetic — it exists specifically to prevent the maximum file size from being interpreted as a negative `loff_t` (which is signed) anywhere in the kernel.

Then we have the page-shift constants:

```c
/* include/asm-generic/page.h and arch-specific overrides */
#define PAGE_SHIFT      12              /* 4 KiB pages, standard */
#define PAGE_SIZE       (1UL << PAGE_SHIFT)     /* 0x1000 */
#define PAGE_MASK       (~(PAGE_SIZE - 1))      /* 0xFFFFFFFFFFFFF000 */
```

And the type that everything iterates over:

```c
/* include/linux/types.h */
typedef unsigned long pgoff_t;          /* 64-bit on LP64 */
```

`pgoff_t` is **unsigned**. There is no underflow detection. There is no overflow detection. There are only bits, and the bits do exactly what bits do when you tell them to.

FUSE’s super-block initialization correctly clamps:

```c
/* fs/fuse/inode.c — fuse_fill_super_common() */
sb->s_maxbytes = MAX_LFS_FILESIZE;
```

That’s the gate. That’s the only gate. And it gates the **superblock**, not individual inode metadata refreshes. Once a FUSE daemon has the connection established, every subsequent `FUSE_GETATTR` reply can mutate `inode->i_size` to any 64-bit value it wants. The `s_maxbytes` check is **not re-applied** per-getattr in the hot paths — it is checked at write extension time (`generic_write_check_limits()`), not at read time, and not when `mm/` subsystems synthesize page indices from a freshly-poisoned `i_size`.

The gate is open. The math begins.

## 3.2 The Lethal Expression

Across `mm/filemap.c`, `mm/readahead.c`, `mm/truncate.c`, and dozens of helpers, the same idiom appears:

```c
pgoff_t index     = pos >> PAGE_SHIFT;
pgoff_t end_index = (pos + count - 1) >> PAGE_SHIFT;
```

Or its alignment-rounded sibling:

```c
pgoff_t end_index = (end_byte + PAGE_SIZE - 1) >> PAGE_SHIFT;
```

These two lines look harmless. They are not. Let’s run the arithmetic with the daemon’s poisoned values.

### Case A: Direct end-byte computation

The kernel wants to read from offset `pos = 0` with `count = 0xFFFFFFFFFFFFFFFF` (a daemon claiming a 16-exabyte file and a caller using `i_size` as the read length, e.g., a naïve readahead path or an `mmap()` ’d region):

```
pos + count - 1
= 0 + 0xFFFFFFFFFFFFFFFF - 1
= 0xFFFFFFFFFFFFFFFE

(0xFFFFFFFFFFFFFFFE) >> 12
= 0x000FFFFFFFFFFFFF
```

That looks survivable. But watch what happens when a non-zero `pos` enters the picture. Say a readahead window starts at `pos = 0x1000`:

```
0x1000 + 0xFFFFFFFFFFFFFFFF - 1
= 0x1000 + 0xFFFFFFFFFFFFFFFE
= 0x0FFE       ← UNSIGNED WRAP-AROUND

0x0FFE >> 12 = 0
```

`end_index` is now zero. The starting index is 1. The loop invariant `index <= end_index` is instantly violated, but on unsigned arithmetic with no overflow trap, the kernel doesn’t know.

### Case B: Page-aligned rounding (the subtler killer)

This is the variant that hits truncation, invalidation, and folio-batch paths:

```c
pgoff_t end = (end_byte + PAGE_SIZE - 1) >> PAGE_SHIFT;
```

Feed it `end_byte = 0xFFFFFFFFFFFFFFFF`:

```
0xFFFFFFFFFFFFFFFF + 0x0FFF
= 0x0000000000000FFE   ← wrap, high bits gone

0x0FFE >> 12 = 0
```

`end` is exactly zero. Not “small.” Not “off by a little.” **Zero.**

Now consider what `end - 1` evaluates to in an unsigned `pgoff_t`:

```
0 - 1 = 0xFFFFFFFFFFFFFFFF
```

The supposed upper bound of an iteration just became the maximum representable value. Every loop that uses `end - 1` as a sentinel will run effectively forever, or until it crashes on something.

## 3.3 Folio Batch Walks Off The Cliff

Here is the canonical vulnerable loop pattern, distilled from `mm/truncate.c::truncate_inode_pages_range()` and replicated in numerous shrinker and invalidation paths:

```c
/* simplified from mm/truncate.c */
pgoff_t next       = lstart >> PAGE_SHIFT;
const pgoff_t end  = lend   >> PAGE_SHIFT;     /* <-- wrapped to 0 */
struct folio_batch fbatch;

folio_batch_init(&fbatch);
while (next < end &&
       filemap_get_folios(mapping, &next, end - 1, &fbatch)) {
    for (i = 0; i < folio_batch_count(&fbatch); i++) {
        struct folio *folio = fbatch.folios[i];
        truncate_inode_folio(mapping, folio);
    }
    folio_batch_release(&fbatch);
    cond_resched();
}
```

With `end == 0` and `end - 1 == 0xFFFFFFFFFFFFFFFF`, the call becomes:

```c
filemap_get_folios(mapping, &next, 0xFFFFFFFFFFFFFFFF, &fbatch);
```

`filemap_get_folios()` walks the address_space’s XArray (which replaced the radix tree in v4.20, commit `b93b0163fc`):

```c
/* mm/filemap.c — filemap_get_folios(), simplified */
unsigned filemap_get_folios(struct address_space *mapping, pgoff_t *start,
                            pgoff_t end, struct folio_batch *fbatch)
{
    XA_STATE(xas, &mapping->i_pages, *start);
    struct folio *folio;

    rcu_read_lock();
    while ((folio = find_get_entry(&xas, end, XA_PRESENT)) != NULL) {
        if (!xa_is_value(folio)) {
            if (!folio_batch_add(fbatch, folio))
                break;
        }
    }
    rcu_read_unlock();
    *start = xas.xa_index + 1;
    return folio_batch_count(fbatch);
}
```

`xas_find()` is now told “scan from index N to index `0xFFFFFFFFFFFFFFFF`.” It will obey. It walks the entire XArray, descending into nodes that may contain shadow entries (DAX, swap-cache markers, exceptional values), workingset nodes, or — critically — internal XArray multi-index entries that point into folio descriptor structures.

Three failure modes emerge:

1.  **Shadow entry dereference** XArray slots can hold `xa_value()` encoded shadow entries — pointers with the bottom bits set, used for workingset accounting. Code paths that assume “if I’m walking within a sane range, all entries are valid `struct folio *` pointers” skip the `xa_is_value()` check. With `end = 0xFFFFFFFFFFFFFFFF`, the walk extends into regions of the XArray that legitimately hold shadow entries the caller never expected. Dereferencing one as a `struct folio *` yields a kernel panic at minimum, or — if the shadow entry’s bit pattern coincidentally resembles a valid pointer — controlled OOB read.
    
2.  **Folio descriptor OOB iteration** Each XArray node holds 64 slots. A walk of `0xFFFFFFFFFFFFFFFF` entries traverses 2^58 nodes (theoretically). In practice, the walk terminates when `xas_find()` exhausts the populated tree. But during that traversal, every populated folio is added to `fbatch`. If `folio_batch_add()` returns success (the batch isn’t full), the loop continues. If the array_space contains, say, 100 legitimate folios, all 100 are batched and processed. Now `next` is updated: `*start = xas.xa_index + 1`. The outer truncate loop checks `next < end`. With `end == 0`, that condition is false on the first iteration — but only after the inner XArray walk has already processed unrelated folios. The truncation operation has just torn down folios outside its intended range.
    
3.  **Infinite loop via `end - 1` underflow** On older v5.x backports where the loop was written as:
    
    ```c
    while (filemap_get_folios(mapping, &next, end - 1, &fbatch)) {
        /* ... */
    }
    ```
    
    without the `next < end` guard, `end - 1 == 0xFFFFFFFFFFFFFFFF` means `filemap_get_folios` always finds something to return, and `next` never reaches `end`. The kworker spins. Watchdogs trigger. RCU stalls accumulate. This is the failure mode behind several of the CISA sb24-365 cluster reports.
    

## 3.4 The vma_merge() Catastrophe — Out-of-Bounds Write Primitive

The folio path gives you reads. The `mmap()` path gives you writes.

A user process calls `mmap()` against a FUSE-backed file the daemon has claimed is `0xFFFFFFFFFFFFFFFF` bytes long. The kernel lands in `mm/mmap.c`, eventually invoking the VMA merger:

```c
/* mm/mmap.c — abridged from vma_merge() / mmap_region() */
unsigned long addr;
unsigned long end;
pgoff_t       pgoff;
pgoff_t       pglen;

end   = addr + len;
pgoff = vma_pgoff_for_file(file, offset);
pglen = (end - addr) >> PAGE_SHIFT;
```

On a normal mapping, `end > addr` and `pglen` is a small positive value. With a daemon-poisoned file size feeding into `len` calculation paths (particularly via `do_mmap()` bounds derived from `inode->i_size` for read-only mappings, or via `remap_file_pages()` — which still exists in legacy form):

```
addr = 0x00007F0000000000   (typical mmap base)
len  = 0xFFFFFFFFFFFFFFFF   (daemon's claimed size)

end  = addr + len
     = 0x00007F0000000000 + 0xFFFFFFFFFFFFFFFF
     = 0x00007EFFFFFFFFFF   ← WRAP

end - addr = 0x00007EFFFFFFFFFF - 0x00007F0000000000
           = 0xFFFFFFFFFFFFFFFF   ← unsigned underflow

pglen = 0xFFFFFFFFFFFFFFFF >> 12
      = 0x000FFFFFFFFFFFFF
```

`pglen` is now astronomically large. When `vma_merge()` — or, on v6.1+ kernels, the Maple Tree walker `mas_store_prealloc()` — attempts to insert a `struct vm_area_struct` describing this region, it computes the VMA’s address range using `pglen << PAGE_SHIFT`, which re-introduces the wrap and produces a VMA whose `vm_start` and `vm_end` describe a region that **overlaps with adjacent, completely unrelated VMAs** in the process’s address space.

The Maple Tree (which replaced the rbtree-based VMA structure in v6.1, commit `d4af56c5c7c6`) stores VMAs keyed by `vm_start`. Two VMAs cannot legitimately occupy the same key. But the overlap-detection logic in `find_vma_intersection()` and `vma_expand()` relies on the mathematical correctness of the size computation. With `pglen` wrapped, the new VMA passes the overlap check (because the wrapped size suggests it ends before another VMA starts) but its actual mapped region extends past that boundary.

**The exploit primitive:**

1.  Process maps two regions: `VMA_A` (legitimate, contains victim data — say, a libc page or a writable stack region) and `VMA_B` (the FUSE-backed mapping with poisoned size).
2.  `VMA_B` ’s recorded `vm_end` is mathematically inverted but stored.
3.  A subsequent write into `VMA_B` ’s mapped pages, beyond what the kernel believes is its boundary, walks into `VMA_A` ’s physical backing pages.
4.  Page table entries for the overlapping region resolve to whichever PTE was installed last — the FUSE mapping’s PTE, which the attacker controls.
5.  You now have a write primitive into adjacent VMA-backed memory, including potentially executable code regions, GOT entries on PIE binaries, or sensitive heap structures.

This is precisely the failure class CVE-2023-32258 and its siblings exposed in OverlayFS — VMA boundary computation trusting an attacker-controllable size — but with FUSE as the lying oracle instead of OverlayFS copy-up.

## 3.5 Truncation Logic and the u64-to-unsigned-int Demotion

The third destructive variant lives in directory and folio truncation routines that, due to legacy code from when file offsets were 32-bit, implicitly cast `loff_t` down to `unsigned int` during intermediate computation:

```c
/* abstracted pattern from various fs/ truncation paths */
loff_t       isize  = i_size_read(inode);    /* 0xFFFFFFFFFFFFFFFF */
unsigned int bytes  = isize & (PAGE_SIZE - 1);   /* low 12 bits = 0xFFF */
unsigned int offset = folio_offset_in_page(folio);
unsigned int end    = offset + bytes;            /* potential overflow */

void *kaddr = kmap_local_folio(folio, 0);
memset(kaddr + offset, 0, end - offset);         /* OOB write */
```

The cast from `loff_t` (signed 64-bit) to `unsigned int` silently drops the upper 32 bits. If the daemon claims a size that aligns such that the lower 32 bits are large but the upper 32 are non-zero, the truncation routine computes a byte count that bears no resemblance to reality. The subsequent `memset()` writes past the folio’s mapped region, corrupting the next slab object.

This is the pattern behind the CISA bulletin sb24-365 cluster (which the source document mislabels as “CVE-2024-365” — there is no such CVE; the reference is the CISA week-of-Dec-23-2024 vulnerability summary, which catalogued multiple `i_size` truncation OOB issues across `fs/` subsystems including squashfs, ext4, and FUSE-derived paths).

## 3.6 The Damage Matrix

| Expression | Daemon Input | Computed Value | Resulting Primitive |
| --- | --- | --- | --- |
| `(end_byte + 0xFFF) >> 12` | `0xFFFFFFFFFFFFFFFF` | `0` | Loop bound zero; XArray walk inverts; OOB read in `filemap_get_folios` |
| `0 - 1` (pgoff_t) | `end == 0` | `0xFFFFFFFFFFFFFFFF` | Infinite XArray traversal; RCU stall; kworker hang |
| `(end - addr) >> 12` | mmap len wraps | `0x000FFFFFFFFFFFFF` | Overlapping VMAs in Maple Tree; arbitrary cross-VMA write |
| `isize & 0xFFF` cast to `uint` | `0xFFFFFFFFFFFFFFFF` | `0xFFF` | Truncation `memset` OOB; adjacent slab corruption |
| `pos + count - 1` | `pos != 0` | `0x0FFE` | `end_index = 0`; readahead skips legitimate pages; cache poisoning |

## 3.7 Affected Kernel Versions — The Real Matrix

Cross-referenced against actual upstream history:

| Kernel | Status |
| --- | --- |
| **v4.20 – v5.10** | Vulnerable. XArray-based page cache (post commit `b93b0163fc`) inherits all `pgoff_t` wrap classes. Pre-folio code uses `struct page *` directly, but the index arithmetic is identical. |
| **v5.16+** | Folio infrastructure (commit `bb5c3b5df`) introduces `folio_batch` and inherits the wrap. New attack surface: `folio_batch_add()` on shadow entries. |
| **v6.1 LTS** | Maple Tree replaces rbtree for VMA storage (commit `d4af56c5c7c6`). New overlap-detection code path is vulnerable to inverted `pglen`. Active until specific clamp patches land per-arch. |
| **v6.6 LTS** | Partial mitigation. Several `mm/filemap.c` paths gained explicit `min_t(loff_t, isize, MAX_LFS_FILESIZE)` clamps (see ChangeLog-6.6.54 references to “filemap: clamp read size”). Coverage is incomplete. |
| **v6.x mainline (post Sept 2024)** | Squashfs-specific KASAN OOB write in `squashfs_readahead` patched (syzbot c9yk5iNf828). The general `pgoff_t` wrap class remains architecturally exploitable via FUSE. |

The fixes that have landed are spot-fixes. Each one patches a specific call site after a syzbot or fuzzer report. None of them address the root cause: **`pgoff_t` arithmetic in `mm/` trusts the caller to have clamped `i_size` to `MAX_LFS_FILESIZE` before any shift operation. FUSE breaks that assumption by mutating `i_size` after the `s_maxbytes` gate has already been passed.**

## 3.8 Why This Bug Class Survives

Sanitizers don’t catch unsigned overflow by default. UBSAN flags signed overflow but treats unsigned wrap as defined behavior (which it is, per C standard) — even though in `pgoff_t` context, the wrap is a security boundary violation. KASAN catches the OOB read after the fact, by which point the damage is done.

Static analysis tools that flag `(a + b - 1) >> SHIFT` patterns generate thousands of false positives. The kernel community has been unwilling to introduce a `check_pgoff_overflow()` helper at every call site because the performance cost is non-trivial in the hot paths.

The result: every release ships with new instances of the same arithmetic mistake, and every release patches a few of them after exploitation. FUSE is the perfect oracle for finding the unpatched ones, because the daemon controls exactly when and how `i_size` mutates relative to the kernel’s read-side caching of that value.

The kernel’s page cache assumes file sizes are mathematical objects. FUSE proves they are negotiation outcomes.

* * *

> **→ Next: Part 4 — The Async Abort Race**, where three actors conspire against `struct fuse_req` and the slab allocator hands you a `struct cred` to step on.

**MITRE ATT&CK:** [T1068](https://attack.mitre.org/techniques/T1068/)

## Related

-   [The Async Abort Race: drop_caches × SIGKILL × fuse_abort_conn = Double Put — Part 4 & Conclusion](https://netacoding.com/posts/fuse-async-abort-race-double-put/)
-   [Lying to the Kernel: FUSE Trust Boundary & Size Desync as a VFS Attack Surface — Part 1](https://netacoding.com/posts/fuse-trust-boundary-and-size-desync/)
