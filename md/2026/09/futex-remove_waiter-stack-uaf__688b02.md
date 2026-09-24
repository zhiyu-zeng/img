---
title: "futex: remove_waiter stack uaf"
source: https://guysrd.github.io/rtmutex
source_host: guysrd.github.io
clip_date: 2026-09-24T10:22:22+08:00
trace_id: 5c727008-9f24-4dbd-b90d-a4908449a34e
content_hash: 90074a95d30a2d62a4223bc8a5e31123cbcac1007cfd54f03af8d26c9d971fea
status: synced
tags:
  - 漏洞分析
  - 内核
series: null
feed_source: guysrd·Android/Linux内核
ai_summary: Linux futex 子系统中 `remove_waiter()` 存在栈上 use-after-free：`FUTEX_CMP_REQUEUE_PI` 代理路径下误用 `current`（requeuer）而非 `waiter->task`，导致 waiter 的 `pi_blocked_on` 悬空指向已弹出的内核栈帧，可被后续 PI 链遍历解引用。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-81f6-87cf-f0baadbb3acb
ioc:
  cves:
    - CVE-2014-3153
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Linux futex 子系统中 `remove_waiter()` 存在栈上 use-after-free：`FUTEX_CMP_REQUEUE_PI` 代理路径下误用 `current`（requeuer）而非 `waiter->task`，导致 waiter 的 `pi_blocked_on` 悬空指向已弹出的内核栈帧，可被后续 PI 链遍历解引用。
> 
> - **引入与修复：** 2011 年 1 月随 `8161239a8bcc`（v2.6.38）进入内核；2026 年 4 月由 Keenan Dong 修复于 `3bfdc63936dd`，Thomas Gleixner 提交，稳定版 6.1.175 / 6.6.140 / 6.12.86 / 6.18.27 回合，5.15 与 5.10 未回合；Android GKI android14 6.1、android15 6.6 于 2026-06-08 修复，android13 5.10/5.15 仍未修复。
> - **触发条件：** 至少三个线程 + 两个 PI futex：Holder 持 `target`、Waiter 持 `other`、Holder 阻塞在 `other`、Waiter 停在 `FUTEX_WAIT_REQUEUE_PI`，Requeuer 调 `FUTEX_CMP_REQUEUE_PI` 触发 PI 环 `Waiter→target→Holder→other→Waiter`，链路判环返回 `-EDEADLK`，于是 `remove_waiter()` 在 requeuer 上下文执行。
> - **错误点：** `remove_waiter` 清的是 `current->pi_blocked_on`（requeuer 的），waiter 的 `pi_blocked_on` 仍指向其栈上的 `rt_mutex_waiter`；waiter 从 `futex_wait_requeue_pi` 返回后栈帧弹出，该地址继续被后续系统调用复用。
> - **利用原语：** 任何经由 Waiter 走 PI 链的任务（如对 Waiter 持有的锁调 `FUTEX_LOCK_PI`）会调用 `task_blocked_on_lock(Waiter)` 读取 `pi_blocked_on->lock`（`struct rt_mutex_waiter` 偏移 88，结构共 112 字节），得到攻击者可控的 `next_lock`；再用栈喷射把下次系统调用的用户数据铺到旧 `rt_waiter` 槽位（6.6.138 上该字段位于 `THREAD_TOP - 0x208`）。
> - **实测与限制：** QEMU 上 KASAN 报 `do_raw_spin_trylock` 通配内存访问，非 KASAN 构建以 `0x4141414141414141` 触发 GPF；作者仅做到触发，未实现代码执行，指出还需信息泄露才能稳定取胜；`pi_blocked_on->lock` 前 4 字节为 0 时 trylock 会成功并继续读 `waiters`/`owner`，地址未映射则 Probe 进程 oops。

This post describes a stack uaf in the Linux futex subsystem, sitting in the code since 2011 and patched in April 2026. It allowed any adversary with an untrusted SELinux context to elevate privileges with the right magic. I did not reach code execution with it, I only managed to trigger it and shared my thoughts on the journey, I hope you’d like it.

LLM Technical summary A stack use after free in \`remove\_waiter()\` in \`kernel/locking/rtmutex.c\`. The function clears \`current->pi\_blocked\_on\` but on the proxy lock path (via \`FUTEX\_CMP\_REQUEUE\_PI\`), \`current\` is the requeuer, not the waiter. The waiter's \`pi\_blocked\_on\` is left dangling into a popped stack frame. Any subsequent PI chain walk through the waiter dereferences the stale pointer. Introduced in v2.6.38 (commit \`8161239a8bcc\`, January 2011). Fixed in commit \`3bfdc63936dd\` (April 2026), authored by Keenan Dong, committed by Thomas Gleixner. Backported to stable 6.1.175, 6.6.140, 6.12.86, 6.18.27. Not backported to 5.15 or 5.10. Android GKI android14 6.1 and android15 6.6 patched June 8, 2026. Android13 5.10 and 5.15 remain unpatched. Trigger: three threads, two PI futexes, force a deadlock cycle via requeue so \`task\_blocks\_on\_rt\_mutex\` returns \`-EDEADLK\` and \`remove\_waiter\` runs in the requeuer's context. The dangling \`pi\_blocked\_on->lock\` (offset 88 in \`struct rt\_mutex\_waiter\`, 112 bytes total) is read by \`task\_blocked\_on\_lock\` during any future chain walk. Stack spray controls the data.

Following my last post on [the requeue_pi_wake_futex](https://guysrd.github.io/futex) I kept staring at the same code. If you need more information about futex, I encourage you to read my previous post, [Elon’s towleroot posts](https://elongl.github.io/exploitation/2021/01/08/cve-2014-3153.html) and futex internals. PI futex requeue is one of those weird kernel wizards where a single helper has two completely different kinds of callers: the task itself on the slowlock path, and *somebody else* acting on the task’s behalf on the proxy path. Any time you see `current` variable referenced inside a helper that’s reachable from both, you’re looking at a candidate bug.

So I tried my luck:’) I once again ask you to read your internals about the futex subsystem before diving into this post. I found one candidate in the cleanup path of `rt_mutex_start_proxy_lock` that fits the pattern exactly, it was fixed upstream in commit [`3bfdc63936dd`](https://github.com/torvalds/linux/commit/3bfdc63936dd) “rtmutex: Use waiter::task instead of current in remove_waiter()”, authored by Keenan Dong and committed by Thomas Gleixner.

The bug is a stack uaf, `task_struct->pi_blocked_on` gets left pointing at a `struct rt_mutex_waiter` that lives on the waiter task’s kernel stack. When the waiter returns from its syscall the stack frame is popped, but `pi_blocked_on` keeps pointing at the slot and the slot’s bytes are immediately reusable by the task’s next syscall. Any future PI chain walk through the task dereferences the dangling pointer. I fiddled a bit with this bug.

## rt_mutex and PI futexes in 30 seconds

A PI futex is a futex with an rt_mutex stapled to it. The userspace word holds the owner TID the kernel-side `struct futex_pi_state` wraps an `rt_mutex_base` and keeps it in sync with the user word.

`rt_mutex` is the kernel’s priority inheritance mutex implementation. When a high priority waiter blocks on a lock held by a lower priority owner, the owner gets boosted to the waiter’s priority until it releases. The boost walks the chain: if the owner is itself waiting on another lock, that lock’s owner gets boosted too, all the way until we hit a runnable task. Honestly, `rt_mutex_adjust_prio_chain` — this code is very complex and I had a very hard time reading it, to this day I don’t understand it.

This is where the proxy pattern enters. `FUTEX_CMP_REQUEUE_PI` is the op that `pthread_cond_broadcast` and `pthread_cond_signal` use under the hood. Their POSIX declarations:

```c
#include <pthread.h>

int pthread_cond_broadcast(pthread_cond_t *cond);
int pthread_cond_signal(pthread_cond_t *cond);
```

`pthread_cond_broadcast` unblocks all threads waiting on the condvar, `pthread_cond_signal` unblocks at least one. Under the hood glibc’s NPTL (`nptl/pthread_cond_signal.c`) maps these onto the futex syscall:

```c
/* include/uapi/linux/futex.h */
#define FUTEX_WAIT_REQUEUE_PI   11
#define FUTEX_CMP_REQUEUE_PI    12
```

`FUTEX_WAIT_REQUEUE_PI` is the waiter side — sleep on the condvar futex, expecting to be requeued onto a PI mutex later. `FUTEX_CMP_REQUEUE_PI` is the broadcaster side — atomically move waiters from the condvar to the PI mutex.

A thread that called `pthread_cond_wait` is asleep on the condvar’s futex. When somebody calls broadcast, the kernel has to move that waiter onto the condvar’s associated PI mutex’s wait queue without waking it first. The requeuer does that work, in its own context, on the waiter’s behalf:

```css
KernelRequeuerWaiterKernelRequeuerWaiter#mermaid-1790216545727{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;fill:#333;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#mermaid-1790216545727 .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#mermaid-1790216545727 .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#mermaid-1790216545727 .error-icon{fill:#552222;}#mermaid-1790216545727 .error-text{fill:#552222;stroke:#552222;}#mermaid-1790216545727 .edge-thickness-normal{stroke-width:1px;}#mermaid-1790216545727 .edge-thickness-thick{stroke-width:3.5px;}#mermaid-1790216545727 .edge-pattern-solid{stroke-dasharray:0;}#mermaid-1790216545727 .edge-thickness-invisible{stroke-width:0;fill:none;}#mermaid-1790216545727 .edge-pattern-dashed{stroke-dasharray:3;}#mermaid-1790216545727 .edge-pattern-dotted{stroke-dasharray:2;}#mermaid-1790216545727 .marker{fill:#333333;stroke:#333333;}#mermaid-1790216545727 .marker.cross{stroke:#333333;}#mermaid-1790216545727 svg{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;}#mermaid-1790216545727 p{margin:0;}#mermaid-1790216545727 .actor{stroke:#9370DB;fill:#ECECFF;stroke-width:1;}#mermaid-1790216545727 rect.actor.outer-path[data-look="neo"]{filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216545727 rect.note[data-look="neo"]{stroke:#aaaa33;fill:#fff5ad;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216545727 text.actor>tspan{fill:black;stroke:none;}#mermaid-1790216545727 .actor-line{stroke:#9370DB;}#mermaid-1790216545727 .innerArc{stroke-width:1.5;stroke-dasharray:none;}#mermaid-1790216545727 .messageLine0{stroke-width:1.5;stroke-dasharray:none;stroke:#333;}#mermaid-1790216545727 .messageLine1{stroke-width:1.5;stroke-dasharray:2,2;stroke:#333;}#mermaid-1790216545727 [id$="-arrowhead"] path{fill:#333;stroke:#333;}#mermaid-1790216545727 .sequenceNumber{fill:white;}#mermaid-1790216545727 [id$="-sequencenumber"]{fill:#333;}#mermaid-1790216545727 [id$="-crosshead"] path{fill:#333;stroke:#333;}#mermaid-1790216545727 .messageText{fill:#333;stroke:none;}#mermaid-1790216545727 .labelBox{stroke:#9370DB;fill:#ECECFF;filter:none;}#mermaid-1790216545727 .labelText,#mermaid-1790216545727 .labelText>tspan{fill:black;stroke:none;}#mermaid-1790216545727 .loopText,#mermaid-1790216545727 .loopText>tspan{fill:black;stroke:none;}#mermaid-1790216545727 .sectionTitle,#mermaid-1790216545727 .sectionTitle>tspan{fill:black;stroke:none;}#mermaid-1790216545727 .loopLine{stroke-width:2px;stroke-dasharray:2,2;stroke:#9370DB;fill:#9370DB;}#mermaid-1790216545727 .note{stroke:#aaaa33;fill:#fff5ad;}#mermaid-1790216545727 .noteText,#mermaid-1790216545727 .noteText>tspan{fill:black;stroke:none;font-weight:normal;}#mermaid-1790216545727 .activation0{fill:#f4f4f4;stroke:#666;}#mermaid-1790216545727 .activation1{fill:#f4f4f4;stroke:#666;}#mermaid-1790216545727 .activation2{fill:#f4f4f4;stroke:#666;}#mermaid-1790216545727 .actorPopupMenu{position:absolute;}#mermaid-1790216545727 .actorPopupMenuPanel{position:absolute;fill:#ECECFF;box-shadow:0px 8px 16px 0px rgba(0,0,0,0.2);filter:drop-shadow(3px 5px 2px rgb(0 0 0 / 0.4));}#mermaid-1790216545727 .actor-man circle,#mermaid-1790216545727 line{fill:#ECECFF;stroke-width:2px;}#mermaid-1790216545727 g rect.rect{filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));stroke:#9370DB;}#mermaid-1790216545727 .node .neo-node{stroke:#9370DB;}#mermaid-1790216545727 [data-look="neo"].node rect,#mermaid-1790216545727 [data-look="neo"].cluster rect,#mermaid-1790216545727 [data-look="neo"].node polygon{stroke:#9370DB;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216545727 [data-look="neo"].swimlane.cluster rect{filter:none;}#mermaid-1790216545727 [data-look="neo"].node path{stroke:#9370DB;stroke-width:1px;}#mermaid-1790216545727 [data-look="neo"].node .outer-path{filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216545727 [data-look="neo"].node .neo-line path{stroke:#9370DB;filter:none;}#mermaid-1790216545727 [data-look="neo"].node circle{stroke:#9370DB;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216545727 [data-look="neo"].node circle .state-start{fill:#000000;}#mermaid-1790216545727 [data-look="neo"].icon-shape .icon{fill:#9370DB;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216545727 [data-look="neo"].icon-shape .icon-neo path{stroke:#9370DB;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216545727 :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}parked on condvar futex, asleepstill asleep,now a waiter on mutexpthread_cond_wait → FUTEX_WAIT_REQUEUE_PI(condvar, mutex)pthread_cond_broadcast → FUTEX_CMP_REQUEUE_PI(condvar, mutex)rt_mutex_start_proxy_lock(mutex, waiter):enqueue Waiter on mutex->waiters(Requeuer's context, Waiter's behalf)return
```

The kernel helper for “do an rt_mutex enqueue on another task’s behalf” is `rt_mutex_start_proxy_lock`:

```c
int rt_mutex_start_proxy_lock(struct rt_mutex_base *lock,
                              struct rt_mutex_waiter *waiter,
                              struct task_struct *task)
{
    int ret;
    raw_spin_lock_irq(&lock->wait_lock);
    ret = __rt_mutex_start_proxy_lock(lock, waiter, task);
    if (unlikely(ret))
        remove_waiter(lock, waiter);
    raw_spin_unlock_irq(&lock->wait_lock);
    return ret;
}
```

`task` is the waiter, passed explicitly. `current` is whoever is calling the requeuer in the futex path. The whole story is what happens when `task != current` and the cleanup code forgets which one it’s supposed to be touching.

* * *

## Triggering

This is confusing and techie, so bear with me. I hope the drawing can help you. In order to trigger this bug we spawn (at least) three threads with two PI futexes:

-   `Holder` owns the `target` rt_mutex (the one behind `uaddr2`).
-   `Waiter` owns a second PI futex called `other`.
-   `Holder` is blocked on `other` so the kernel’s PI graph already knows “Holder wants other, owned by Waiter”.
-   `Waiter` is parked in `FUTEX_WAIT_REQUEUE_PI(uaddr1, ..., uaddr2)`, sleeping until somebody moves it onto `target`.
-   `Requeuer` calls `FUTEX_CMP_REQUEUE_PI(uaddr1, ..., uaddr2)` to do the move.

When the kernel enqueues Waiter on `target` and walks the PI chain `Waiter → target → Holder → other → Waiter` it spots the cycle, returns `-EDEADLK` and that’s the path that calls `remove_waiter()` with the wrong `current`.

```haskell
Requeuer (CPU 1)Waiter (CPU 0)Requeuer (CPU 1)Waiter (CPU 0)#mermaid-1790216546750{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;fill:#333;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#mermaid-1790216546750 .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#mermaid-1790216546750 .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#mermaid-1790216546750 .error-icon{fill:#552222;}#mermaid-1790216546750 .error-text{fill:#552222;stroke:#552222;}#mermaid-1790216546750 .edge-thickness-normal{stroke-width:1px;}#mermaid-1790216546750 .edge-thickness-thick{stroke-width:3.5px;}#mermaid-1790216546750 .edge-pattern-solid{stroke-dasharray:0;}#mermaid-1790216546750 .edge-thickness-invisible{stroke-width:0;fill:none;}#mermaid-1790216546750 .edge-pattern-dashed{stroke-dasharray:3;}#mermaid-1790216546750 .edge-pattern-dotted{stroke-dasharray:2;}#mermaid-1790216546750 .marker{fill:#333333;stroke:#333333;}#mermaid-1790216546750 .marker.cross{stroke:#333333;}#mermaid-1790216546750 svg{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;}#mermaid-1790216546750 p{margin:0;}#mermaid-1790216546750 .actor{stroke:#9370DB;fill:#ECECFF;stroke-width:1;}#mermaid-1790216546750 rect.actor.outer-path[data-look="neo"]{filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216546750 rect.note[data-look="neo"]{stroke:#aaaa33;fill:#fff5ad;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216546750 text.actor>tspan{fill:black;stroke:none;}#mermaid-1790216546750 .actor-line{stroke:#9370DB;}#mermaid-1790216546750 .innerArc{stroke-width:1.5;stroke-dasharray:none;}#mermaid-1790216546750 .messageLine0{stroke-width:1.5;stroke-dasharray:none;stroke:#333;}#mermaid-1790216546750 .messageLine1{stroke-width:1.5;stroke-dasharray:2,2;stroke:#333;}#mermaid-1790216546750 [id$="-arrowhead"] path{fill:#333;stroke:#333;}#mermaid-1790216546750 .sequenceNumber{fill:white;}#mermaid-1790216546750 [id$="-sequencenumber"]{fill:#333;}#mermaid-1790216546750 [id$="-crosshead"] path{fill:#333;stroke:#333;}#mermaid-1790216546750 .messageText{fill:#333;stroke:none;}#mermaid-1790216546750 .labelBox{stroke:#9370DB;fill:#ECECFF;filter:none;}#mermaid-1790216546750 .labelText,#mermaid-1790216546750 .labelText>tspan{fill:black;stroke:none;}#mermaid-1790216546750 .loopText,#mermaid-1790216546750 .loopText>tspan{fill:black;stroke:none;}#mermaid-1790216546750 .sectionTitle,#mermaid-1790216546750 .sectionTitle>tspan{fill:black;stroke:none;}#mermaid-1790216546750 .loopLine{stroke-width:2px;stroke-dasharray:2,2;stroke:#9370DB;fill:#9370DB;}#mermaid-1790216546750 .note{stroke:#aaaa33;fill:#fff5ad;}#mermaid-1790216546750 .noteText,#mermaid-1790216546750 .noteText>tspan{fill:black;stroke:none;font-weight:normal;}#mermaid-1790216546750 .activation0{fill:#f4f4f4;stroke:#666;}#mermaid-1790216546750 .activation1{fill:#f4f4f4;stroke:#666;}#mermaid-1790216546750 .activation2{fill:#f4f4f4;stroke:#666;}#mermaid-1790216546750 .actorPopupMenu{position:absolute;}#mermaid-1790216546750 .actorPopupMenuPanel{position:absolute;fill:#ECECFF;box-shadow:0px 8px 16px 0px rgba(0,0,0,0.2);filter:drop-shadow(3px 5px 2px rgb(0 0 0 / 0.4));}#mermaid-1790216546750 .actor-man circle,#mermaid-1790216546750 line{fill:#ECECFF;stroke-width:2px;}#mermaid-1790216546750 g rect.rect{filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));stroke:#9370DB;}#mermaid-1790216546750 .node .neo-node{stroke:#9370DB;}#mermaid-1790216546750 [data-look="neo"].node rect,#mermaid-1790216546750 [data-look="neo"].cluster rect,#mermaid-1790216546750 [data-look="neo"].node polygon{stroke:#9370DB;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216546750 [data-look="neo"].swimlane.cluster rect{filter:none;}#mermaid-1790216546750 [data-look="neo"].node path{stroke:#9370DB;stroke-width:1px;}#mermaid-1790216546750 [data-look="neo"].node .outer-path{filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216546750 [data-look="neo"].node .neo-line path{stroke:#9370DB;filter:none;}#mermaid-1790216546750 [data-look="neo"].node circle{stroke:#9370DB;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216546750 [data-look="neo"].node circle .state-start{fill:#000000;}#mermaid-1790216546750 [data-look="neo"].icon-shape .icon{fill:#9370DB;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216546750 [data-look="neo"].icon-shape .icon-neo path{stroke:#9370DB;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216546750 :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}parked in futex_wait_requeue_pirt_waiter lives on Waiter's kstackWaiter.pi_blocked_on STILL = &rt_waiterWaiter.pi_blocked_on danglesinto freed stack framefutex_requeue / proxy_lock for Waitertask_blocks_on_rt_mutex:Waiter.pi_blocked_on = &rt_waiterchain walk → cycle → -EDEADLKremove_waiter():clears current.pi_blocked_oncurrent == Requeuer (wrong task)wakes, takes IGNORE path,returns from syscall, kstack pops
```

A few moments later any other thread (`Probe`) that blocks on a lock Waiter owns will trigger the chain walker to call `task_blocked_on_lock(Waiter)` which dereferences `Waiter.pi_blocked_on->lock`. The shtick is that the address itself is still valid because the Waiter’s stack is allocated for as long as Waiter is alive but the data isn’t `rt_mutex_waiter`:’) That frame got popped when Waiter returned from `futex_wait_requeue_pi`, and the same stack region is now scratch space for whatever syscall Waiter has run since, this is crucial to understand and remember. Here’s how these structures actually look (`pahole`, v6.6.138, x86_64):

```cpp
struct rt_mutex_waiter {
    struct rt_waiter_node  tree;           /*     0    40 */
    struct rt_waiter_node  pi_tree;        /*    40    40 */
    struct task_struct *   task;           /*    80     8 */
    struct rt_mutex_base * lock;           /*    88     8 */  /* ← the UAF read */
    unsigned int           wake_state;     /*    96     4 */
    /* 4 bytes hole */
    struct ww_acquire_ctx * ww_ctx;        /*   104     8 */

    /* size: 112, cachelines: 2 */
};

struct rt_mutex_base {
    raw_spinlock_t         wait_lock;      /*     0     4 */
    /* 4 bytes hole */
    struct rb_root_cached  waiters;        /*     8    16 */
    struct task_struct *   owner;          /*    24     8 */

    /* size: 32 */
};
```

The chain walker dereferences these bytes as if they were still a `struct rt_mutex_waiter` and takes the `lock` field at offset 88, and that becomes the `next_lock` it follows:’) Spray the Waiter’s “next syscall” at one whose kernel frame plants attacker bytes at the rt_waiter offset, and you control what the chain walker reads. You need an infoleak to win here, or be smarter in turning this bug into an infoleak primitive.

```c
int __rt_mutex_start_proxy_lock(struct rt_mutex_base *lock,
                                struct rt_mutex_waiter *waiter,
                                struct task_struct *task)
{
    int ret;
    lockdep_assert_held(&lock->wait_lock);

    if (try_to_take_rt_mutex(lock, task, NULL))
        return 1;

    ret = task_blocks_on_rt_mutex(lock, waiter, task, NULL,
                                  RT_MUTEX_FULL_CHAINWALK);

    if (ret && !rt_mutex_owner(lock)) {
        /* the owner went away while we were chain walking — call it success */
        ret = 0;
    }

    return ret;
}
```

The interesting call is `task_blocks_on_rt_mutex` when `FULL_CHAINWALK` is set, several things happen:

1.  Set `task->pi_blocked_on = waiter` and `waiter->task = task`.
2.  Enqueue the waiter into `lock->waiters` (rbtree).
3.  Walk the PI chain, if a cycle is detected return `-EDEADLK`.

Step 1 is where the dangling pointer originates. Step 3 is where it goes wrong.

When the chain walk returns `-EDEADLK`, the wrapper takes the cleanup branch (v6.6.138, `kernel/locking/rtmutex_api.c:339`):

```cpp
int __sched rt_mutex_start_proxy_lock(struct rt_mutex_base *lock,
				      struct rt_mutex_waiter *waiter,
				      struct task_struct *task)
{
	int ret;

	raw_spin_lock_irq(&lock->wait_lock);
	ret = __rt_mutex_start_proxy_lock(lock, waiter, task);
	if (unlikely(ret))
		remove_waiter(lock, waiter);
	raw_spin_unlock_irq(&lock->wait_lock);

	return ret;
}
```

and calls `remove_waiter` (v6.6.138, `kernel/locking/rtmutex.c:1515`):

```rust
static void __sched remove_waiter(struct rt_mutex_base *lock,
				  struct rt_mutex_waiter *waiter)
{
	bool is_top_waiter = (waiter == rt_mutex_top_waiter(lock));
	struct task_struct *owner = rt_mutex_owner(lock);
	struct rt_mutex_base *next_lock;

	lockdep_assert_held(&lock->wait_lock);

	raw_spin_lock(&current->pi_lock);
	rt_mutex_dequeue(lock, waiter);
	current->pi_blocked_on = NULL;
	raw_spin_unlock(&current->pi_lock);

	/*
	 * Only update priority if the waiter was the highest priority
	 * waiter of the lock and there is an owner to update.
	 */
	if (!owner || !is_top_waiter)
		return;

	raw_spin_lock(&owner->pi_lock);

	rt_mutex_dequeue_pi(owner, waiter);

	if (rt_mutex_has_waiters(lock))
		rt_mutex_enqueue_pi(owner, rt_mutex_top_waiter(lock));

	rt_mutex_adjust_prio(lock, owner);

	/* Store the lock on which owner is blocked or NULL */
	next_lock = task_blocked_on_lock(owner);

	raw_spin_unlock(&owner->pi_lock);

	/*
	 * Don't walk the chain, if the owner task is not blocked
	 * itself.
	 */
	if (!next_lock)
		return;

	/* gets dropped in rt_mutex_adjust_prio_chain()! */
	get_task_struct(owner);

	raw_spin_unlock_irq(&lock->wait_lock);

	rt_mutex_adjust_prio_chain(owner, RT_MUTEX_MIN_CHAINWALK, lock,
				   next_lock, NULL, current);

	raw_spin_lock_irq(&lock->wait_lock);
}
```

`current` here is the requeuer. We’re locking the requeuer’s `pi_lock` and clearing the requeuer’s `pi_blocked_on`. The waiter’s `pi_blocked_on` keeps pointing at the on-stack `rt_waiter` that the wrapper just dequeued.

When does this matter? When the waiter task returns from its syscall, its kernel stack rewinds. The `rt_waiter` is gone `task->pi_blocked_on` is now pointing into undefined memory:’)

The fix is simple, but requires understanding this whole clusterfuck. They replace `current` with `waiter->task`:

```c
struct task_struct *waiter_task = waiter->task;
...
raw_spin_lock(&waiter_task->pi_lock);
rt_mutex_dequeue(lock, waiter);
waiter_task->pi_blocked_on = NULL;
raw_spin_unlock(&waiter_task->pi_lock);
```

* * *

## Gaining primitives

`pi_blocked_on` is read by anything that walks the PI chain through Waiter.

The most direct consumer is `task_blocked_on_lock`:

```c
static struct rt_mutex_base *task_blocked_on_lock(struct task_struct *p)
{
    return p->pi_blocked_on ? p->pi_blocked_on->lock : NULL;
}
```

Called from `task_blocks_on_rt_mutex` and `rt_mutex_adjust_prio_chain`. Everytime some new task (`Probe`) blocks on a rt_mutex whose owner is Waiter, the chain walk reads `Waiter->pi_blocked_on->lock` to figure out where to walk next. That’s the use-after-free read.

```haskell
Waiter (stale pi_blocked_on)Kernel (chain walk)Probe (new blocker)Waiter (stale pi_blocked_on)Kernel (chain walk)Probe (new blocker)#mermaid-1790216546768{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;fill:#333;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#mermaid-1790216546768 .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#mermaid-1790216546768 .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#mermaid-1790216546768 .error-icon{fill:#552222;}#mermaid-1790216546768 .error-text{fill:#552222;stroke:#552222;}#mermaid-1790216546768 .edge-thickness-normal{stroke-width:1px;}#mermaid-1790216546768 .edge-thickness-thick{stroke-width:3.5px;}#mermaid-1790216546768 .edge-pattern-solid{stroke-dasharray:0;}#mermaid-1790216546768 .edge-thickness-invisible{stroke-width:0;fill:none;}#mermaid-1790216546768 .edge-pattern-dashed{stroke-dasharray:3;}#mermaid-1790216546768 .edge-pattern-dotted{stroke-dasharray:2;}#mermaid-1790216546768 .marker{fill:#333333;stroke:#333333;}#mermaid-1790216546768 .marker.cross{stroke:#333333;}#mermaid-1790216546768 svg{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;}#mermaid-1790216546768 p{margin:0;}#mermaid-1790216546768 .actor{stroke:#9370DB;fill:#ECECFF;stroke-width:1;}#mermaid-1790216546768 rect.actor.outer-path[data-look="neo"]{filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216546768 rect.note[data-look="neo"]{stroke:#aaaa33;fill:#fff5ad;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216546768 text.actor>tspan{fill:black;stroke:none;}#mermaid-1790216546768 .actor-line{stroke:#9370DB;}#mermaid-1790216546768 .innerArc{stroke-width:1.5;stroke-dasharray:none;}#mermaid-1790216546768 .messageLine0{stroke-width:1.5;stroke-dasharray:none;stroke:#333;}#mermaid-1790216546768 .messageLine1{stroke-width:1.5;stroke-dasharray:2,2;stroke:#333;}#mermaid-1790216546768 [id$="-arrowhead"] path{fill:#333;stroke:#333;}#mermaid-1790216546768 .sequenceNumber{fill:white;}#mermaid-1790216546768 [id$="-sequencenumber"]{fill:#333;}#mermaid-1790216546768 [id$="-crosshead"] path{fill:#333;stroke:#333;}#mermaid-1790216546768 .messageText{fill:#333;stroke:none;}#mermaid-1790216546768 .labelBox{stroke:#9370DB;fill:#ECECFF;filter:none;}#mermaid-1790216546768 .labelText,#mermaid-1790216546768 .labelText>tspan{fill:black;stroke:none;}#mermaid-1790216546768 .loopText,#mermaid-1790216546768 .loopText>tspan{fill:black;stroke:none;}#mermaid-1790216546768 .sectionTitle,#mermaid-1790216546768 .sectionTitle>tspan{fill:black;stroke:none;}#mermaid-1790216546768 .loopLine{stroke-width:2px;stroke-dasharray:2,2;stroke:#9370DB;fill:#9370DB;}#mermaid-1790216546768 .note{stroke:#aaaa33;fill:#fff5ad;}#mermaid-1790216546768 .noteText,#mermaid-1790216546768 .noteText>tspan{fill:black;stroke:none;font-weight:normal;}#mermaid-1790216546768 .activation0{fill:#f4f4f4;stroke:#666;}#mermaid-1790216546768 .activation1{fill:#f4f4f4;stroke:#666;}#mermaid-1790216546768 .activation2{fill:#f4f4f4;stroke:#666;}#mermaid-1790216546768 .actorPopupMenu{position:absolute;}#mermaid-1790216546768 .actorPopupMenuPanel{position:absolute;fill:#ECECFF;box-shadow:0px 8px 16px 0px rgba(0,0,0,0.2);filter:drop-shadow(3px 5px 2px rgb(0 0 0 / 0.4));}#mermaid-1790216546768 .actor-man circle,#mermaid-1790216546768 line{fill:#ECECFF;stroke-width:2px;}#mermaid-1790216546768 g rect.rect{filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));stroke:#9370DB;}#mermaid-1790216546768 .node .neo-node{stroke:#9370DB;}#mermaid-1790216546768 [data-look="neo"].node rect,#mermaid-1790216546768 [data-look="neo"].cluster rect,#mermaid-1790216546768 [data-look="neo"].node polygon{stroke:#9370DB;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216546768 [data-look="neo"].swimlane.cluster rect{filter:none;}#mermaid-1790216546768 [data-look="neo"].node path{stroke:#9370DB;stroke-width:1px;}#mermaid-1790216546768 [data-look="neo"].node .outer-path{filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216546768 [data-look="neo"].node .neo-line path{stroke:#9370DB;filter:none;}#mermaid-1790216546768 [data-look="neo"].node circle{stroke:#9370DB;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216546768 [data-look="neo"].node circle .state-start{fill:#000000;}#mermaid-1790216546768 [data-look="neo"].icon-shape .icon{fill:#9370DB;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216546768 [data-look="neo"].icon-shape .icon-neo path{stroke:#9370DB;filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));}#mermaid-1790216546768 :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}read Waiter->pi_blocked_on->lockpi_blocked_on dangles into Waiter's freed stack slotchain walk follows the fake rt_mutexFUTEX_LOCK_PI on a lock Waiter ownstask_blocks_on_rt_mutex → walk the PI chainowner is Waiter → task_blocked_on_lock(Waiter)returns attacker-controlled next_lock
```

We can spray and grab this object. When Waiter returns, the stack rewinds without zeroing any variable. Waiter’s next syscall starts from the same stack top and depending on the syscall, the scratch space in that new frame overlaps the old `rt_waiter` slot with bytes the user supplies.

On a 6.6.138 build (`CONFIG_INIT_STACK_ALL_ZERO=y`, `CONFIG_VMAP_STACK=n`), the `lock` field of the on-stack `rt_waiter` lands at a fixed offset: `THREAD_TOP - 0x208`. The layout is deterministic per build. I encourage you to shape your layout and land on this field, rest is up to you to continue:’)

I tested this on Qemu and on a Frankel device, here’s the panic I received on Qemu:

```
BUG: KASAN: wild-memory-access in do_raw_spin_trylock+0x69/0x120
Read of size 4 at addr 1ffff1100167efa3 by task poc/61
CPU: 0 PID: 61 Comm: poc Not tainted 6.6.138 #4
Call Trace:
 <TASK>
 kasan_report+0xd8/0x110
 kasan_check_range+0x105/0x1b0
 do_raw_spin_trylock+0x69/0x120
 ? task_blocks_on_rt_mutex.constprop.0.isra.0+0x29d/0xb10
 _raw_spin_trylock+0x19/0x70
 rt_mutex_adjust_prio_chain.isra.0+0x120/0x1640
 task_blocks_on_rt_mutex.constprop.0.isra.0+0x390/0xb10
 __rt_mutex_start_proxy_lock+0x61/0xa0
 futex_lock_pi+0x31f/0x5a0
 do_futex+0xa6/0x230
 __x64_sys_futex+0x1b8/0x2b0
 do_syscall_64+0x39/0x90
 entry_SYSCALL_64_after_hwframe+0x78/0xe2
```

The call chain is exactly the chain walker reaching `Waiter->pi_blocked_on->lock->wait_lock`. KASAN flags it wild memory access because the freed-stack address has no shadow.

Same call chain on the non-KASAN build oopses at `_raw_spin_trylock` with the planted sentinel in the registers:

```yaml
general protection fault, probably for non-canonical address 0x4141414141414141: 0000 [#1] PREEMPT SMP NOPTI
RIP: 0010:_raw_spin_trylock+0x10/0x50
RAX: 0000000000000078 RBX: ffff888043211040 RCX: 4141414141414141
RDX: 0000000000000001 RSI: 0000000000000400 RDI: 4141414141414141
R15: 4141414141414141
 rt_mutex_adjust_prio_chain+0x9a/0x8f0
 task_blocks_on_rt_mutex.constprop.0+0x1c4/0x3c0
 __rt_mutex_start_proxy_lock+0x4d/0x70
 futex_lock_pi+0x25d/0x480
```

* * *

## Unusual primitive ideas

The web is filled with a few `rt_mutex_base` exploitation techniques, these are my thoughts. `rt_mutex_base` looks as follows:

```c
struct rt_mutex_base {
    raw_spinlock_t  wait_lock;   /* offset 0 */
    struct rb_root_cached waiters; /* offset 8..23 */
    struct task_struct *owner;   /* offset 24 */
};
```

If the chunk’s first 4 bytes are zero (looks like an unlocked spinlock), the trylock succeeds and the walk proceeds reads `waiters` (rb tree), reads `owner` (next task to walk into). If they’re non-zero, trylock fails and the walk exits cleanly. If the address is unmapped, Probe (the task triggering the chain walk) takes a page fault, oopses, you die.

* * *

## The fix

```rust
 static void __sched remove_waiter(struct rt_mutex_base *lock,
                                   struct rt_mutex_waiter *waiter)
 {
+    struct task_struct *waiter_task = waiter->task;
     bool is_top_waiter = (waiter == rt_mutex_top_waiter(lock));
     struct task_struct *owner = rt_mutex_owner(lock);
     struct rt_mutex_base *next_lock;

     lockdep_assert_held(&lock->wait_lock);

-    raw_spin_lock(&current->pi_lock);
+    raw_spin_lock(&waiter_task->pi_lock);
     rt_mutex_dequeue(lock, waiter);
-    current->pi_blocked_on = NULL;
-    raw_spin_unlock(&current->pi_lock);
+    waiter_task->pi_blocked_on = NULL;
+    raw_spin_unlock(&waiter_task->pi_lock);
     ...
 }
```

* * *

## Conclusions

This is a very rare and interesting bug imo, a helper gets written first for the obvious caller, where “the task we’re operating on” and `current` happen to coincide. Later someone adds a proxy callsite a function that does the operation on behalf of *someone else* and the helper keeps reaching for `current` because nobody flagged it. Lockdep is happy: it cares about the spinlock, not whose `pi_lock` it actually is. The function still does *something* when called, and on the slowlock path that something is correct. It’s only on the proxy path that the wrong `pi_lock` and the wrong `pi_blocked_on` quietly get written.

The previous bug in this same neighborhood the missing `READ_ONCE(q->task)` in `requeue_pi_wake_futex` was the same family. There “the task that owns the `q` ” was conflated with “the task currently reading `q` ”. Here it’s “the task we’re cleaning up after” conflated with “current”. Both load assumptions, both invisible until you ask the question explicitly.

I find this bug pretty unusual and novel, to whoever managed to exploit this reliably:’) Identifying the confused `current` in such a complex environment and triggering this path to grab the object and reach an arbitrary read and write is novel to me.

If anyone takes it further I’d love to hear your opinion about this bug. I hope you enjoyed this post.
