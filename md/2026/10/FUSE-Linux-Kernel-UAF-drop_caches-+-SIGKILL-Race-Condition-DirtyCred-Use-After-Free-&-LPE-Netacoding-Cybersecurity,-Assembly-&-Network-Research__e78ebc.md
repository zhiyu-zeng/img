---
title: "FUSE Linux Kernel UAF: drop_caches + SIGKILL Race Condition | DirtyCred Use-After-Free & LPE | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/fuse-async-abort-race-double-put/
source_host: netacoding.com
clip_date: 2026-10-01T10:19:46+08:00
trace_id: 9e2c7dc7-727f-4b48-a01c-54b39c46e56a
content_hash: 44a969b2c56434c26e69379fd4fa3d2679db5bd344a1231bfa0b0faf5aaf6cfd
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: Netacoding·协议/逆向
ai_summary: FUSE 的 `struct fuse_req` 只"借用"inode 引用却不增加 `i_count`，当 SIGKILL 滞留请求、`drop_caches` 驱逐 inode、`fuse_abort_conn` 延迟拆解三方并发时，形成 DirtyCred 级 UAF 与本地提权原语。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-81e8-9cae-e5ea423300d1
ioc:
  cves:
    - CVE-2022-2602
    - CVE-2025-6019
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> FUSE 的 `struct fuse_req` 只"借用"inode 引用却不增加 `i_count`，当 SIGKILL 滞留请求、`drop_caches` 驱逐 inode、`fuse_abort_conn` 延迟拆解三方并发时，形成 DirtyCred 级 UAF 与本地提权原语。
> 
> - **触发链：** 用户 `read()` 阻塞于 `fpq->processing` → SIGKILL 使 `wait_event_interruptible` 返回 `-ERESTARTSYS` → 内核排入 `FUSE_INTERRUPT` 并转入 killable 等待；恶意守护进程只要不回应（仅"停顿"），请求便永久滞留且带 `FR_SENT|FR_INTERRUPTED`。
> - **核心缺陷：** 请求依赖的 inode/dentry 靠已死 `struct file` 的借用引用支撑；进程被回收后 `fput→iput` 使 `i_count` 归零，`evict_inodes()` 的 `atomic_read(&inode->i_count)` 检查判定"无引用"，随即 `I_FREEING` → `shrink_dcache_sb` → `destroy_inode` → slab 释放。
> - **两种原语：** ①双重 put——对已重分配为 `struct cred` 的 slab 执行 `iput()`，把其 `usage` 计数减到错误值，后续 `put_cred()` 提前释放活凭据（DirtyCred）；②UAF 读——`fuse_dentry_revalidate()` 读取已释放 dentry 的 `d_name.name`，泄露内核指针/凭据（Project Zero #381448451），攻击者可用 `add_key()`、`msgsnd()` 等重占该槽位。
> - **二次 UAF：** `fuse_abort_conn()` 在 `list_splice_tail_init(&fpq->processing)` 与 `end_requests()` 之间放开了 `fpq->lock`；此时 virtio-fs 的迟到回复或 `fuse_dev_do_write()` 会再次 `fuse_put_request`，对 `fuse_req` 自身的 refcount 双重递减。
> - **版本与利用：** v5.0–v5.12、v5.15–v6.1 LTS 默认配置均受影响，5.13.2 仅部分缓解 `FR_FINISHED` 同步，6.6.54 与 #381448451 的修复只治症状；可用 EXPRACE 的 IPI 洪泛、`sched_setaffinity` 抢占和锁竞争把概率赛跑变成确定性原语。

## Part 4 — The Async Abort Race: drop_caches × SIGKILL × fuse_abort_conn = Double Put

The first two vulnerability classes are loud. Heap overflows trip KASAN. Page cache wrap-arounds spray panics. They’re surgical, but they scream.

This one is silent.

This is the bug class that survives fuzzers, hides behind three independent kernel actors that never interact in unit tests, and detonates in the slab allocator hours after the malicious daemon has already exited. Three actors — a dying userspace process, a janitor sysctl, and a delayed FUSE teardown thread — race over a single `struct fuse_req`. None of them know the others exist. The `struct inode` they’re all silently fighting over gets freed, reallocated, and stomped.

This is the **DirtyCred-class primitive** of the FUSE subsystem.

* * *

## 4.1 The struct fuse_req Lifecycle: Borrowed References and Atomic Lies

Every kernel-to-daemon round-trip is encapsulated in a `struct fuse_req`. Stripped down, the relevant fields look like this across v5.x – v6.x:

```c
struct fuse_req {
    struct list_head    list;          /* fpq->processing / fpq->io linkage */
    struct fuse_args   *args;
    refcount_t          count;         /* atomic_t in pre-v5.7 */
    unsigned long       flags;         /* FR_PENDING, FR_SENT, FR_FINISHED,
                                          FR_INTERRUPTED, FR_ASYNC, FR_LOCKED */
    struct fuse_in_header  in;
    struct fuse_out_header out;
    struct fuse_mount  *fm;
    /* request payload — implicitly tied to the originating inode */
    /* prior to v5.4: explicit struct inode *inode pointer */
    /* post-v5.4: implicit via fm->sb and args */
};
```

The `refcount_t count` (formerly `atomic_t` before commit `ec99f6d3` hardened the type) is the only thing standing between this object and the SLUB allocator. When it hits zero in `fuse_put_request()`, the request is freed via `kmem_cache_free(fuse_req_cachep, req)`.

**Here is the architectural sin.** A `fuse_req` carrying an in-flight read or write implicitly depends on the originating `struct inode` and `struct dentry` remaining live for the duration of the request. But the request structure does not bump `i_count` on the inode. It operates on a **borrowed reference**— the assumption being that the `struct file` held by the user process will pin the inode via `fput()` semantics, and the `struct file` won’t be released until the I/O completes.

That assumption is a lie the moment a `SIGKILL` enters the picture.

## 4.2 Step 1 — The Stall: SIGKILL, FUSE_INTERRUPT, and the Hostage Request

The execution sequence begins with a perfectly normal synchronous read against a FUSE-backed file:

```
[user] read(fd, buf, 4096)
   → vfs_read()
   → fuse_file_read_iter()
   → fuse_simple_request()
   → request_wait_answer()
   → wait_event_interruptible(req->waitq, test_bit(FR_FINISHED, &req->flags))
```

The request is now sitting on `fpq->processing` (the per-connection processing queue), waiting for the userspace daemon to deliver a reply via `/dev/fuse`.

A second process delivers `SIGKILL` to the reader. The signal wakes `wait_event_interruptible()`, which returns `-ERESTARTSYS`. The kernel cannot simply abandon `req` — the daemon still holds its ID and will eventually reply into the same memory. Instead, FUSE escalates:

```c
/* fs/fuse/dev.c — request_wait_answer(), simplified */
err = wait_event_interruptible(req->waitq,
                               test_bit(FR_FINISHED, &req->flags));
if (!err)
    return;

set_bit(FR_INTERRUPTED, &req->flags);
/* Queue a FUSE_INTERRUPT op carrying req->in.h.unique */
queue_interrupt(req);

/* Now wait UNINTERRUPTIBLY for the daemon to acknowledge */
err = wait_event_killable(req->waitq,
                          test_bit(FR_FINISHED, &req->flags));
```

A `struct fuse_interrupt_in { uint64_t unique; }` is queued to the daemon. The kernel is now committed: it must wait for the daemon to either complete the original op or acknowledge the interrupt before the `fuse_req` can be reaped.

**A malicious daemon simply ignores the `FUSE_INTERRUPT`.** No reply, no acknowledgment. The `wait_event_killable()` returns when the task is reaped, the user process exits, `do_exit()` calls `exit_files()`, which calls `fput()` on the file descriptor — and the `struct file` is released.

But `req` is still parked on `fpq->processing`, still flagged `FR_SENT | FR_INTERRUPTED`, still carrying implicit references to the inode whose backing `struct file` just died.

The hostage situation is established.

## 4.3 Step 2 — The Eviction: drop_caches Walks Into the Crime Scene

Enter actor #2: a completely unrelated sysctl write, often issued by automated tooling, monitoring agents, or a sysadmin trying to “free up some memory”:

```bash
echo 3 > /proc/sys/vm/drop_caches
```

This routes through `drop_caches_sysctl_handler()` → `iterate_supers()` → for each mounted filesystem:

```c
/* mm/drop_caches.c */
static void drop_pagecache_sb(struct super_block *sb, void *unused)
{
    struct inode *inode, *toput_inode = NULL;

    spin_lock(&sb->s_inode_list_lock);
    list_for_each_entry(inode, &sb->s_inodes, i_sb_list) {
        spin_lock(&inode->i_lock);
        /* skip inodes that are referenced or being freed */
        if ((inode->i_state & (I_FREEING|I_WILL_FREE|I_NEW)) ||
            (mapping_empty(inode->i_mapping) && !need_resched())) {
            spin_unlock(&inode->i_lock);
            continue;
        }
        __iget(inode);
        spin_unlock(&inode->i_lock);
        spin_unlock(&sb->s_inode_list_lock);

        invalidate_mapping_pages(inode->i_mapping, 0, -1);
        iput(toput_inode);
        toput_inode = inode;
        ...
    }
    iput(toput_inode);
}
```

Then `evict_inodes()` is called from the unmount/shrink paths or via memory pressure shrinkers, walking `sb->s_inodes`:

```c
/* fs/inode.c — evict_inodes(), simplified */
list_for_each_entry_safe(inode, next, &sb->s_inodes, i_sb_list) {
    spin_lock(&inode->i_lock);
    if (atomic_read(&inode->i_count)) {           /* <-- THE CHECK */
        spin_unlock(&inode->i_lock);
        continue;
    }
    inode->i_state |= I_FREEING;
    inode_lru_list_del(inode);
    spin_unlock(&inode->i_lock);

    list_add(&inode->i_lru, &dispose);
}

dispose_list(&dispose);     /* → evict() → destroy_inode() → SLAB free */
```

**Here is the catastrophic interaction.** `evict_inodes()` checks `atomic_read(&inode->i_count) == 0` — but the stalled `fuse_req` never bumped `i_count` in the first place. It was operating on the borrowed reference held by the now-dead `struct file`. When the user process was reaped in Step 1, `fput()` → `dput()` → `iput()` already decremented `i_count` to zero.

From `evict_inodes()` ’s perspective, this inode has zero references. It is unreferenced, unreachable, and ripe for reaping.

`I_FREEING` is set. `shrink_dcache_sb()` runs in parallel, acquiring `dentry->d_lock`, finding `d_count == 0`, calling `__dentry_kill()`. The `struct dentry` is freed to the dentry SLAB. The `struct inode` is passed to `destroy_inode()` → `call_rcu(&inode->i_rcu, i_callback)` → eventually `kmem_cache_free(inode_cachep, inode)`.

Both objects are now in the SLAB freelist. `req` still holds raw, dangling pointers to both.

Within microseconds on a busy system, those slab chunks get reallocated. To a `struct cred`. To a `struct file`. To a `struct task_struct` ’s sub-allocations. To anything that fits the same `kmalloc-N` bucket or `inode_cachep` slab.

## 4.4 Step 3 — The Detonation: fuse_abort_conn Walks the Corpse Pile

Eventually — minutes later, hours later, doesn’t matter — the malicious daemon exits, crashes, or the filesystem is force-unmounted (`umount -l`). This triggers:

```c
/* fs/fuse/dev.c — fuse_abort_conn() */
void fuse_abort_conn(struct fuse_conn *fc)
{
    struct fuse_iqueue *fiq = &fc->iq;

    spin_lock(&fc->lock);
    if (fc->connected) {
        struct fuse_dev *fud;
        struct fuse_req *req, *next;
        LIST_HEAD(to_end);
        ...
        list_for_each_entry(fud, &fc->devices, entry) {
            struct fuse_pqueue *fpq = &fud->pq;

            spin_lock(&fpq->lock);
            fpq->connected = 0;
            list_for_each_entry_safe(req, next, &fpq->io, list) {
                req->out.h.error = -ECONNABORTED;
                spin_lock(&req->waitq.lock);
                set_bit(FR_ABORTED, &req->flags);
                if (!test_bit(FR_LOCKED, &req->flags))
                    set_bit(FR_PRIVATE, &req->flags);
                spin_unlock(&req->waitq.lock);
                list_move(&req->list, &to_end);
            }
            list_splice_tail_init(&fpq->processing, &to_end);   /* (*) */
            spin_unlock(&fpq->lock);
        }
        ...
        end_requests(&to_end);                  /* → fuse_request_end() per req */
    }
    spin_unlock(&fc->lock);
}
```

`end_requests()` iterates the captured list, calling `fuse_request_end()` on each. That path eventually dereferences the `args` payload, which on certain op classes — directory operations, dentry revalidation, attribute callbacks — touches the originating dentry/inode to update caches, log errors, or release per-request state.

**The dereference lands on freed slab memory.**

### Primitive A — The Double Put (privesc-grade)

If the teardown path on the specific request class executes an `iput()` against the implicit inode reference (as occurs in directory and attr operations across several backported FUSE codepaths):

```c
/* Pseudo-reconstruction of the doomed teardown */
fuse_request_end(req)
  → if (req->args->end)
        req->args->end(fm, req->args, req->out.h.error);
  → fuse_release_end()           /* or analogous op-specific endcall */
  → iput(implicit_inode);        /* <-- DECREMENT ON FREED SLAB CHUNK */
```

The slab chunk that was `struct inode` has, by this point, been reallocated. On a system under realistic load and a same-sized slab cache (`inode_cachep` is its own cache, but cross-cache merging via SLUB’s `slab_merge` brings `struct cred`, `struct file`, and others into play depending on size class and kernel config), the freed memory is now backing some other object.

`iput()` performs `atomic_dec_and_test(&inode->i_count)` against memory that isn’t an inode anymore. It decrements whatever 4-byte field lives at `offset offsetof(struct inode, i_count)` of the new occupant.

If the new occupant is a `struct cred`, that offset overlaps with `usage` (refcount). The cred’s refcount is now off-by-one downward. A subsequent `put_cred()` on what should be a still-live credential structure frees it prematurely while another task still holds a pointer — and we are now in classic **DirtyCred** territory (CVE-2022-2602’s exploitation pattern, applied here with FUSE as the desync engine instead of Unix SCM GC).

### Primitive B — The UAF Read (info leak / KASLR break / cred theft)

Confirmed in the wild as Project Zero issue #381448451 (Sept 2024, `fuse_dentry_revalidate`):

```c
/* fs/fuse/dir.c — fuse_dentry_revalidate(), abridged */
static int fuse_dentry_revalidate(struct dentry *entry, unsigned int flags)
{
    struct inode *inode;
    ...
    inode = d_inode_rcu(entry);
    ...
    if (inode && fuse_is_bad(inode))
        goto invalid;
    ...
    /* failure path logs entry->d_name.name */
    pr_warn("...%s\n", entry->d_name.name);   /* <-- READ FROM FREED DENTRY */
    ...
}
```

`entry->d_name.name` is read from a `struct dentry` whose backing slab chunk was reaped by `shrink_dcache_sb()` in Step 2. The read returns whatever bytes now occupy that offset — credentials, key material, kernel pointers leaking KASLR base, or attacker-controlled data if the attacker has spray-reallocated the slot via `add_key()`, `msgsnd()`, or `setxattr()` heap massage primitives.

This is a textbook UAF read with attacker-controlled reoccupation.

## 4.5 The Race Diagram

```rust
T0: User process issues read() on FUSE fd
    ─► fuse_req allocated
    ─► req placed on fpq->processing
    ─► req borrows inode reference (NO i_count bump)

T1: SIGKILL delivered to user process
    ─► wait_event_interruptible returns -ERESTARTSYS
    ─► FUSE_INTERRUPT queued to daemon
    ─► daemon IGNORES interrupt
    ─► do_exit() → exit_files() → fput()
    ─► i_count drops toward 0
    ─► req remains on fpq->processing (FR_SENT|FR_INTERRUPTED)

──────── arbitrary time delta ────────

T2: echo 3 > /proc/sys/vm/drop_caches
    ─► drop_pagecache_sb() invalidates pages
    ─► evict_inodes() sees i_count == 0
    ─► I_FREEING set
    ─► shrink_dcache_sb() reaps dentry
    ─► destroy_inode() → kmem_cache_free()
    ─► slab chunks now in freelist
    ─► req->{implicit inode/dentry pointers} = DANGLING

T3: Heap massage (attacker controls timing via syscall pressure)
    ─► dangling slab chunk REALLOCATED
    ─► new occupant: struct cred / struct file / attacker spray

T4: Daemon exits OR umount -l OR connection abort
    ─► fuse_abort_conn()
    ─► spin_lock(&fpq->lock)
    ─► list_splice_tail_init(&fpq->processing, &to_end)
    ─► spin_unlock(&fpq->lock)
    ─► end_requests(&to_end)
    ─► dereferences/iputs against freed-and-reoccupied memory
    ─► DOUBLE PUT  /  UAF READ
```

## 4.6 The Lock-Drop Window: A Secondary UAF on fuse_req Itself

The picture above is bad enough. It gets worse on SMP.

`fuse_abort_conn()` does **not** hold `fpq->lock` for the duration of `end_requests()`. The lock is dropped between list capture and iteration, specifically to avoid latency spikes on busy connections (see ChangeLog-5.13.2, multiple FUSE abort-path patches). During that window, a concurrent kernel thread can complete the same request:

-   **virtio-fs path:** `virtio_fs_complete_req_work()` (a kworker draining the virtqueue) processes a late reply and calls `fuse_request_end()` on `req`.
-   **Generic path:** `fuse_dev_do_write()` from a still-attached daemon connection processes a stale reply.

Both paths invoke `fuse_put_request()`. Combined with the abort path’s own `fuse_put_request()`, the `refcount_t count` is decremented twice on the same `fuse_req`. If `FR_FINISHED` is checked-then-acted-upon non-atomically across the two contexts (as it was in pre-5.13.2 codepaths and persists in some virtio-fs-specific edge cases), the second decrement frees `req` while the first context is still dereferencing it.

This is a **secondary UAF**, this time on the `fuse_req` slab object itself, layered on top of the primary inode/dentry UAF.

## 4.7 Race Widening: EXPRACE and Engineered Determinism

Naïve attackers will tell you these races are “too tight to exploit.” They are wrong.

The window between Step 2 (drop_caches freeing the inode) and Step 3 (slab reallocation) is the controlled variable. The window between Step 3 and Step 4 (`fuse_abort_conn`) is the timing target. Both can be widened arbitrarily using techniques from EXPRACE (Lee et al., USENIX Security ‘21):

-   **IPI flooding** via `membarrier(MEMBARRIER_CMD_GLOBAL_EXPEDITED)` to inject preemption points into the abort thread mid-iteration
-   **`sched_setaffinity()`** to pin the abort kworker to a CPU saturated with high-priority RT tasks
-   **Forcing `fpq->lock` contention** by issuing parallel benign FUSE ops on the same connection

With these, the race is no longer probabilistic. It is a deterministic primitive.

## 4.8 Affected Kernel Versions

Cross-referenced against actual upstream commit history:

| Kernel | Status |
| --- | --- |
| **v5.0 – v5.12** | Vulnerable. Original `fuse_abort_conn` lock-drop semantics + pre- `refcount_t` `atomic_t count`. |
| **v5.13.2** | Partial mitigation. ChangeLog explicitly notes FUSE abort-path race fixes around `FR_FINISHED` synchronization. Edge cases remain. |
| **v5.15 LTS – v6.1 LTS** | Vulnerable to interrupt-stall + drop_caches + abort race in default configs. |
| **v6.6.54** | Backported fixes for related FUSE eviction-path races (per ChangeLog-6.6.54). The core borrowed-reference architecture remains. |
| **v6.x mainline (pre Sept 2024)** | Confirmed exploitable per Project Zero #381448451 (`fuse_dentry_revalidate` UAF on `d_name`). |
| **v6.x post fix for #381448451** | Specific dentry-revalidate path patched. The general lifecycle ambiguity — borrowed inode references in stalled `fuse_req` — is architecturally unresolved. |

The fix Project Zero pushed addressed the symptom (the specific `d_name` read), not the disease (the borrowed-reference model).

## 4.9 Why This Is The Crown Jewel

Sections 2 and 3 give you memory corruption. **This section gives you DirtyCred.**

The Double Put primitive against a reallocated `struct cred` is the entire kill chain in three syscalls, one signal, and one sysctl write — all of which are individually unprivileged or admin-routine. The attacker doesn’t need to ship shellcode. They don’t need to defeat SMEP, SMAP, or KPTI. They need to convince the kernel to decrement a refcount on memory that is no longer what the kernel thinks it is.

The FUSE daemon never has to do anything overtly malicious. It just has to **stall**. The kernel does the rest of the exploitation work itself.

This is the bug class that should keep VFS maintainers awake. The fix isn’t another patch on `fuse_dentry_revalidate`. The fix is converting `struct fuse_req` lifecycle from `atomic_t` / `refcount_t` borrowed references to **RCU-grace-period-synchronized teardown**, gating every `fuse_abort_conn` dereference behind `synchronize_rcu()` against `evict_inodes()`. Until that lands upstream, the trust boundary leaks.

* * *

## Conclusion — The Architectural Verdict

Across four parts we’ve dissected what is, structurally, the same vulnerability class viewed through three different lenses:

1.  **Trust boundary inversion**— FUSE delegates filesystem semantic authority to an unprivileged process the kernel is forced to treat as authoritative.
2.  **Temporal fragmentation**— Every check-then-use pattern in VFS, `mm/`, and the privileged loaders separates the “check” stack frame from the “use” stack frame across a userspace round-trip the daemon controls.
3.  **Lifecycle ambiguity**— Borrowed references, optimistic refcounting, and lock-drop windows turn benign concurrent kernel actors into unwitting accomplices.

The fixes that have shipped — `min_t` clamps in `filemap.c`, the squashfs readahead patch, the Project Zero dentry-revalidate fix, the 5.13.2 abort-path synchronization tweaks — are **spot-fixes against a class problem**. Each addresses one syscall site after a fuzzer or researcher has already weaponized it.

**The architectural fixes that haven’t shipped:**

-   Re-validation of daemon-supplied lengths against original allocation sizes at every `iov_iter` ingestion boundary (`fuse_dev_do_write` hard clamp).
-   A `check_pgoff_overflow()` helper, mandatory at every `(pos + count) >> PAGE_SHIFT` site in `mm/`, with `BUG_ON` on wrap.
-   Conversion of `struct fuse_req` to RCU-grace-period-synchronized teardown, with explicit `i_count` bumps for in-flight I/O.
-   A `fc->max_read` upper ceiling enforced kernel-side, regardless of virtio-fs negotiation, capped at a sane `FUSE_DEFAULT_MAX_PAGES_PER_REQ * PAGE_SIZE`.

Until these land, every Linux system mounting a FUSE filesystem under attacker control — whether via `user_allow_other`, virtio-fs in a multi-tenant cloud, sshfs in CI runners, or container `lowerdir` paths — is operating one stalled request, one wrong shift, one borrowed reference away from a kernel-side primitive.

The kernel trusts that filesystems do not lie.

FUSE proves they do.

* * *

> **Series complete.** All technical content reflects upstream Linux behavior as of the v6.6 LTS line and v6.x mainline through Q3 2024 patch state. Subsequent stable point releases may resolve specific call sites referenced; the architectural classes documented here remain live.

**MITRE ATT&CK:** [T1068](https://attack.mitre.org/techniques/T1068/) · [T1499.004](https://attack.mitre.org/techniques/T1499/004/)

## Related

-   [Boundary Mathematics: Weaponizing PAGE_SHIFT Arithmetic via FUSE — Part 3](https://netacoding.com/posts/fuse-boundary-mathematics-pgoff-overflow/)
-   [Lying to the Kernel: FUSE Trust Boundary & Size Desync as a VFS Attack Surface — Part 1](https://netacoding.com/posts/fuse-trust-boundary-and-size-desync/)
-   [CVE-2025-6019: udisks2 XFS Resize Vulnerability](https://netacoding.com/posts/udisks2-cve_lpe/)
