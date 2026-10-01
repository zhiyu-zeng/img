---
title: "FUSE Trust Boundary Attack: Malicious Daemon i_size Desync → Kernel Heap Overflow via finit_module & kexec | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/fuse-trust-boundary-and-size-desync/
source_host: netacoding.com
clip_date: 2026-10-01T10:20:06+08:00
trace_id: b707a26b-54d3-47b5-94da-e7c0c7b48bc0
content_hash: 281264dad464036bec63999db7f497b6e6c685219129b6e26fbd102921269fd3
status: synced
tags:
  - Linux安全
  - 漏洞分析
series: null
feed_source: Netacoding·协议/逆向
ai_summary: FUSE 守护进程在 getattr 阶段谎报 attr.size，内核据此分配 4KB 缓冲区后，守护进程在读取阶段回传 4MB，直接越界覆写 kmalloc-4k 堆块，成为提权原语。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-81e1-bbb3-ffe2274cf9f3
ioc:
  cves:
    - CVE-2023-0386
    - CVE-2025-6019
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> FUSE 守护进程在 getattr 阶段谎报 attr.size，内核据此分配 4KB 缓冲区后，守护进程在读取阶段回传 4MB，直接越界覆写 kmalloc-4k 堆块，成为提权原语。
> 
> - **信任边界反转：** FUSE 把"我是文件系统"的语义权威交给无特权用户态守护进程，内核必须默认其恶意；VFS 与 mm 层却假设"操作开始读到的元数据仍然有效"。
> - **三阶段攻击链：** 特权方调用 `finit_module` / 固件加载 / `kexec_file_load` → `kernel_read_file` 经 `vfs_getattr` 取到被篡改的 `i_size` → `kvmalloc(i_size)` 定容 → `FUSE_READ` 回传超长数据线性溢出；`fuse_dev_do_write` 摄入端不复核原始分配长度。
> - **分块闸门失效：** 守护进程置 `FOPEN_DIRECT_IO` 走 `fuse_direct_io`，唯一节流点 `fc->max_read` 在 virtio-fs 上被设为 `UINT_MAX`，任意长度可一次成事务接收。
> - **利用后果：** 溢出可命中相邻 kmalloc-4k 对象与 SLUB freelist 指针，实现 freelist 投毒、覆盖函数指针或 cred；非破坏路径下 bounce buffer 申请超 `MAX_PAGE_ORDER`，kworker 无限重试、`finit_module` 永久阻塞的 DoS。
> - **影响与修复：** v5.x–v6.6.x 该类问题存活，消费方还包括 `load_elf_binary`、eBPF map、OverlayFS；修复须在每个 `iov_iter` 完成点把字节数硬性钳回原分配大小，违反即返回 `-EFBIG`。

## Lying to the Kernel: FUSE Daemon Desynchronization as a VFS Attack Surface

*Part 1 & 2 of a deep-dive series on weaponizing the userspace filesystem trust boundary against modern Linux kernels (v5.x – v6.x).*

* * *

## Part 1 — The FUSE Trust Boundary: Where the Kernel Drinks Poison

The Linux Virtual File System is a masterpiece of pragmatic engineering. It abstracts away the brutal differences between ext4’s extent trees, XFS’s B+trees, NFS’s RPC plumbing, and tmpfs’s pure-RAM gymnastics behind four sacred objects:

```c
struct super_block;   // the mount
struct inode;         // the metadata
struct dentry;        // the path cache
struct file;          // the open fd
```

For a real on-disk filesystem, the kernel trusts these structures absolutely. Why wouldn’t it? They’re populated by code the kernel itself compiled, operating on bytes pulled from a block device the kernel owns. The integrity chain is monolithic: block layer → fs driver → VFS → syscall return. There is no adversary in that pipeline that isn’t already root.

Then there is FUSE.

### The Inversion

`fuse.ko` is a proxy. When a process calls `read(2)` on a FUSE-backed file, the kernel does not resolve the request itself. Instead:

1.  VFS dispatches into the FUSE `file_operations` vtable (`fuse_file_read_iter`, `fuse_getattr`, `fuse_lookup`, …).
2.  FUSE marshals the request into a `struct fuse_req`, wraps it in a header, and pushes it onto `/dev/fuse`.
3.  An **unprivileged userspace daemon**— running as a regular UID with no special capabilities — `read(2)` s the request from `/dev/fuse`, processes it however it likes, and `write(2)` s a reply back.
4.  FUSE parses the reply, populates kernel structures, and returns to VFS as if a real filesystem had answered.

Read that again. The semantic authority of “I am the filesystem” has been delegated to an unprivileged process that the kernel must assume is hostile.

The FUSE daemon can:

-   Lie about a file’s size, owner, mode, mtime, or inode number on every `vfs_getattr` call.
-   Return different data on every `read_iter` for the same offset.
-   Block forever, ignoring `FUSE_INTERRUPT` requests.
-   Crash mid-transaction, leaving in-flight `struct fuse_req` objects pinning kernel state.
-   Configure connection parameters (`fc->max_read`, `fc->max_write`, `FOPEN_DIRECT_IO`) that disable kernel-side chunking and caching invariants.

### The Cardinal Sin: Cached Metadata Optimism

Every desync vulnerability we’re about to dissect descends from one assumption baked deep into VFS and `mm/`:

> **“Metadata I read at the start of an operation is still valid by the time I act on it.”**

For ext4 backed by an SSD that nobody is hot-swapping, that’s true. For FUSE, it is a lie that the daemon controls the truth value of. The kernel queries `i_size` to size a `kmalloc`, then trusts that buffer is large enough when the actual bytes arrive milliseconds later. It calls `vfs_getattr` to check ownership, then trusts those credentials when `do_open` fires. It computes a `pgoff_t end_index` from `i_size`, then trusts the loop bounds it just derived.

A malicious daemon violates each of these between the check and the use.

### The Subsystems That Drink From This Well

The damage radius is enormous because privileged kernel paths happily ingest FUSE-backed files without re-validation:

| Subsystem | Entry Point | What It Trusts |
| --- | --- | --- |
| Module loader | `finit_module(2)` → `kernel_read_file_from_fd()` | `i_size` for `kmalloc` sizing |
| Firmware loader | `request_firmware()` → `kernel_read_file()` | Same |
| Kexec | `kexec_file_load(2)` | ELF segment offsets/sizes from FUSE bytes |
| ELF binfmt | `execve(2)` → `load_elf_binary()` | Program headers from `kernel_read` |
| eBPF | map blob initializers reading from FUSE-backed fds | Map size arithmetic |
| OverlayFS | copy-up from FUSE `lowerdir` | Owner/mode metadata (CVE-2023-0386) |
| Page cache / mmap | `filemap_get_folios()`, `vma_merge()` | `(pos + count) >> PAGE_SHIFT` arithmetic |

### Version Scope

FUSE entered mainline in 2.6.14 (2005). The modern attack surface — the one this series targets — crystallized later:

-   **v4.20**— Page cache migrated from radix tree to XArray (`xas_find` loop semantics now central to wrap-around bugs).
-   **v5.1**— io_uring async fops give FUSE more in-flight `fuse_req` lifetime corners.
-   **v5.4**— virtio-fs lands. `fc->max_read` can be configured to `UINT_MAX` for direct host↔guest memory access. **This single design choice neuters the kernel’s last line of defense against size desync.**
-   **v6.1**— VMA storage migrated from RB-tree to Maple Tree (`vma_merge` overlap semantics shift; new OOB-write primitives become viable).
-   **v6.x mainline**— Multiple FUSE interrupt-path UAFs patched iteratively (see ChangeLog-5.13.2, ChangeLog-6.6.54), but residual stalled-request edge cases survive.

Everything from here is the consequence of the kernel drinking what the daemon pours.

* * *

## Part 2 — Size Desync: Lying About attr.size to Smash the Kernel Heap

This is the cleanest, most weaponizable bug class in the FUSE adversarial model. It’s a classical metadata TOCTOU — but instead of the usual symlink-swap parlor trick, the “Check” and “Use” phases are separated by an entire kernel subsystem boundary, and the attacker controls the response to both phases independently.

The target: any privileged caller of `kernel_read_file()` or `kernel_read_file_from_fd()`. The most attractive ones are `finit_module(2)`, the firmware loader, and `kexec_file_load(2)` — all of which run as root (`CAP_SYS_MODULE` / `CAP_SYS_BOOT`), and all of which load the file’s contents directly into kernel-resident buffers that subsequently get executed or interpreted.

### The Three-Phase Execution Flow

#### Phase 1 — Time-of-Check: vfs_getattr and the Strategic Lie

When a privileged process calls `finit_module(fd, ...)` against a FUSE-backed `fd`, the kernel must size the buffer it will load the module into. It does this via:

```c
// fs/kernel_read_file.c (simplified)
ssize_t kernel_read_file(struct file *file, loff_t offset,
                         void **buf, size_t buf_size,
                         size_t *file_size, ...)
{
    struct kstat stat;
    ...
    ret = vfs_getattr(&file->f_path, &stat, STATX_SIZE, 0);
    if (ret)
        goto out;

    i_size = stat.size;          // <-- attacker-controlled value
    if (i_size > buf_size) ...
    ...
    *buf = kvmalloc(i_size, GFP_KERNEL);   // <-- allocation sized by the lie
```

`vfs_getattr` walks into the FUSE getattr op, which dispatches a `FUSE_GETATTR` request over `/dev/fuse`. The daemon replies with a `struct fuse_attr`:

```c
struct fuse_attr {
    uint64_t ino;
    uint64_t size;       // <-- we own this field
    uint64_t blocks;
    uint64_t atime;
    uint64_t mtime;
    uint64_t ctime;
    ...
    uint32_t mode;
    uint32_t nlink;
    uint32_t uid;
    uint32_t gid;
    ...
};
```

The malicious daemon sets `attr.size = 4096`. Exactly one page. A trivial, unsuspicious kernel module size. The kernel happily caches this into `inode->i_size` and propagates it back up the call stack as `stat.size`.

The Check is complete. The kernel now believes the file is 4 KB.

#### Phase 2 — Allocation: kvmalloc Pins a 4KB Buffer in the Kernel Heap

With `i_size = 4096` in hand, `kernel_read_file()` allocates:

```c
*buf = kvmalloc(4096, GFP_KERNEL);
```

For 4 KB this falls firmly into `kmalloc` territory — specifically the `kmalloc-4k` slab cache (or `kmalloc-cg-4k` under memcg). A single slab object is carved out. Its physical neighbors in that slab page are other live kernel allocations: credential structures, `struct file` objects, network buffers, `struct cred`, anything else the kernel happens to be allocating from the 4 KB bucket.

This is the canvas the overflow will paint on. The kernel hands this buffer down the stack, expecting to fill exactly 4096 bytes.

#### Phase 3 — Time-of-Use: The Daemon Reneges

`kernel_read_file()` now constructs a `kvec` iterator and issues the read:

```c
struct kvec kv = { .iov_base = *buf, .iov_len = i_size };
struct iov_iter iter;
iov_iter_kvec(&iter, ITER_DEST, &kv, 1, i_size);

bytes = kernel_read(file, ...);   // ultimately calls ->read_iter
```

This routes through the FUSE `file_operations` vtable:

```c
const struct file_operations fuse_file_operations = {
    .read_iter      = fuse_file_read_iter,
    .write_iter     = fuse_file_write_iter,
    ...
};
```

`fuse_file_read_iter()` branches based on cache mode:

```c
static ssize_t fuse_file_read_iter(struct kiocb *iocb, struct iov_iter *to)
{
    struct file *file = iocb->ki_filp;
    struct fuse_file *ff = file->private_data;

    if (ff->open_flags & FOPEN_DIRECT_IO)
        return fuse_direct_read_iter(iocb, to);
    else
        return fuse_cache_read_iter(iocb, to);
}
```

Here is the first attacker lever: the daemon set `FOPEN_DIRECT_IO` in its `FUSE_OPEN` reply. The kernel routes into `fuse_direct_read_iter()` → `fuse_direct_io()`, bypassing the page cache entirely. Direct I/O is supposed to chunk the read according to `fc->max_read`, the per-connection ceiling negotiated at `FUSE_INIT`:

```c
// fs/fuse/file.c — fuse_direct_io (simplified)
while (count) {
    size_t nbytes = min(count, fc->max_read);   // <-- the only chunking gate
    ...
    fuse_send_read(req, ...);
    count -= nbytes;
}
```

For a stock FUSE mount, `fc->max_read` defaults to a sane value (typically `FUSE_DEFAULT_MAX_PAGES_PER_REQ * PAGE_SIZE`). But this is negotiable, and **on virtio-fs it is routinely cranked to `UINT_MAX`** to enable zero-copy DMA between guest and host. From the openEuler-SA-2025-1035 advisory chain and the upstream virtiofs source:

> `fc->max_read = UINT_MAX;`

The chunking gate is now wide open. `min(count, UINT_MAX) == count`. Whatever the daemon ships gets accepted in one transaction.

Now the daemon ships the payload.

Instead of 4 KB, the FUSE reply to the `FUSE_READ` request carries **4 MB** of data. The kernel’s `fuse_dev_do_write()` (the path that ingests daemon replies) copies the bytes into the buffer pointed to by the `struct fuse_req` ’s `out_args` — which is the very same `*buf` from Phase 2, the 4 KB slab object.

There is no re-validation. No `if (returned_bytes > original_alloc_size) abort;` gate exists at this boundary. The original allocation length lives in `kernel_read_file()` ’s stack frame; the ingestion machinery in `fuse_dev_do_write()` trusts the iterator length, which was set from the daemon’s reply header.

The 4 MB payload writes linearly past the 4 KB slab object into:

-   Adjacent `kmalloc-4k` slab objects (other live allocations — `struct cred`, `struct file`, eBPF maps, `struct sk_buff` frags…).
-   SLUB freelist pointers (`void *next` embedded in free objects), enabling controlled freelist poisoning.
-   Slab page metadata if the overflow runs long enough to hit the next page boundary.

**Classic kernel heap corruption.** From here, the standard SLUB exploitation playbook applies: spray the target slab with controllable objects (`msg_msg`, `pipe_buffer`, `user_key_payload`), arrange one adjacent to the 4 KB victim, overwrite a function pointer or freelist next-pointer, get arbitrary write or RIP control. DirtyCred-style cred-struct overwrites are particularly attractive given the privileged caller context (we’re already in a `finit_module` syscall path).

### The virtio-fs Bounce-Buffer DoS Variant

Even when memory corruption isn’t reachable, the same desync produces a guaranteed unrecoverable kernel hang. When `virtio_fs_enqueue_req()` prepares a request for the virtio queue, it allocates a DMA-capable bounce buffer sized by the daemon’s claimed payload:

```c
// drivers/virtio/virtio_fs.c (simplified)
bounce = kmalloc(req_size, GFP_KERNEL);   // req_size = 10 MB, attacker-controlled
if (!bounce)
    goto retry;
```

`req_size = 10 MB` blows past `MAX_PAGE_ORDER` (typically order-10, i.e. 4 MB on x86_64). The page allocator triggers:

```c
WARN_ON_ONCE_GFP(order > MAX_PAGE_ORDER, gfp);
return NULL;
```

`kmalloc` returns NULL. The virtio-fs kworker thread loops, retries, fails identically, loops again. The original `finit_module(2)` syscall sits in `wait_event_interruptible()` forever. `kworker/u8:N` pegs a CPU. The mount cannot be torn down because requests are still “in flight.” **Total denial of service from an unprivileged FUSE daemon against a root-privileged caller.**

### Variant Targets Beyond Module Loading

The same primitive aimed at different consumers yields different exploitation flavors:

-   **`load_elf_binary()`**— `execve(2)` against a FUSE-backed binary. Daemon advertises an undersized `i_size`, then ships oversized program headers. `kernel_read` into the ELF header buffer overflows; subsequent parsing of `e_phnum` / `e_phoff` reads OOB or treats attacker-controlled bytes as program-header offsets, yielding controlled `mmap` placement of attacker-chosen content into the new process’s address space.
-   **eBPF map loaders**— Map size arithmetic from FUSE-backed blobs has wrapped before (cf. GHSA-fphp-6498-x998). Combined with desync, you get arbitrary kernel writes into adjacent map metadata.
-   **kexec payloads**— `kexec_file_load` interprets the loaded blob as the next kernel. Heap corruption here is “next boot is yours.”

### Affected Kernel Versions — Size Desync Class

| Vector | First Vulnerable | Last Confirmed Vulnerable | Notes |
| --- | --- | --- | --- |
| `kernel_read_file` size trust | v5.x baseline | v6.6.x | No byte-for-byte re-validation against original alloc size at the `iov_iter` ingestion boundary |
| virtio-fs `fc->max_read = UINT_MAX` chunking bypass | v5.4 (virtiofs intro) | v6.6.x | Tracked in openEuler-SA-2025-1035 |
| virtio-fs bounce-buffer DoS (`MAX_PAGE_ORDER` infinite retry) | v5.4 | v6.6.x | kworker hang, `finit_module` blocks forever |
| `load_elf_binary` size desync via FUSE | v5.x | v6.x | No upstream CVE; class is live |

### The Architectural Lesson

The kernel’s bounds-checking philosophy here is **temporally fragmented**. The check happens in `kernel_read_file()`. The use happens in `fuse_dev_do_write()`. Between those two stack frames lies a userspace round-trip, an iterator object that gets re-derived from daemon-supplied lengths, and a chunking gate that the daemon configured. Each of these is a re-entry point at which the original `i_size` constraint could be reasserted — and at none of them is it.

The fix is not subtle: `kernel_read_file()` must clamp the ingested byte count to the original allocation size, byte-for-byte, at every `iov_iter` completion, with a hard `BUG_ON` or `-EFBIG` return on violation. Anything less is gambling that the daemon told the truth.

It didn’t.

* * *

> **Next up — Part 3:** Boundary Mathematics. We feed the daemon’s `attr.size = 0xFFFFFFFFFFFFFFFF` into `(pos + count - 1) >> PAGE_SHIFT`, watch the page cache’s loop invariants invert, and turn `vma_merge()` on the Maple Tree into an arbitrary OOB-write primitive.

**MITRE ATT&CK:** [T1068](https://attack.mitre.org/techniques/T1068/) · [T1211](https://attack.mitre.org/techniques/T1211/)

## Related

-   [The Async Abort Race: drop_caches × SIGKILL × fuse_abort_conn = Double Put — Part 4 & Conclusion](https://netacoding.com/posts/fuse-async-abort-race-double-put/)
-   [Boundary Mathematics: Weaponizing PAGE_SHIFT Arithmetic via FUSE — Part 3](https://netacoding.com/posts/fuse-boundary-mathematics-pgoff-overflow/)
-   [CVE-2025-6019: udisks2 XFS Resize Vulnerability](https://netacoding.com/posts/udisks2-cve_lpe/)
