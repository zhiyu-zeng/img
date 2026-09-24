---
title: The epoll uaf
source: https://guysrd.github.io/epoll-uaf
source_host: guysrd.github.io
clip_date: 2026-09-24T10:21:29+08:00
trace_id: c841c1f1-a23a-45da-9948-ea2e371aba77
content_hash: 7c30c42d8286b84c5c70b693651c87a4363281ffd52c95024f1a5f101bbfc485
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: guysrd·Android/Linux内核
ai_summary: epoll 图遍历与 ep_free 竞态导致 eventpoll 被 UAF；任意非特权进程可触发，官方把 kfree 改成 kfree_rcu 修复，跨缓存打到 PTE 的尝试失败。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3e575244-d011-8183-80ea-f5107339a790
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> epoll 图遍历与 ep_free 竞态导致 eventpoll 被 UAF；任意非特权进程可触发，官方把 kfree 改成 kfree_rcu 修复，跨缓存打到 PTE 的尝试失败。
> 
> - **根因：** 2023 年移除全局 epmutex 的优化只把加锁范围收窄到图遍历，`ep_get_upwards_depth_proc`/`reverse_path_check_proc` 在 `rcu_read_lock()` 下遍历 `ep->refs` 并解引用 `epi->ep`，而 `ep_free` 用 `kfree()` 立即释放目标 eventpoll（epitem 自身由 `call_rcu()` 保护）。
> - **触发条件：** 从 hlist 取出 epi 到跟踪 `epi->ep` 只有几条 ARM64 指令，跨 CPU 双线程无效；需要 `CONFIG_PREEMPT=y` 与 `PREEMPT_RCU` 下的同 CPU 抢占。约 8000 个父节点时遍历耗时 ~2ms，能稳定撞上 4ms 的 tick，约 4% 命中率；closer 线程用 `usleep(1000)` 循环等待才会被调度器优先抢占。
> - **写入原语：** `struct eventpoll` 落在 kmalloc-256，`refs` 偏移 176、`gen` 偏移 168、`loop_check_depth` 偏移 184。偏移 176 为 0（init_on_free 情况）时静默写 9 字节；非 0 则被当作指针跟随递归，形成任意/受限写原语，写入内容为全局递增的 `loop_check_gen` 和 0 字节。
> - **跨缓存利用失败：** kmalloc-256 用 order-1 slab，PTE 页是 order-0，需 PCP 溢出让 buddy 拆分；slab→buddy 和 buddy→PTE 各自可复现，但约 2ms 的竞态窗口与约 100ms 的迁移流水线不重叠，不借助 SCHED_FIFO 无法拉长。同缓存回收则因 SLUB 每 CPU freelist 为 LIFO 而很容易。
> - **修复与影响：** commit 07712db80857 把 `kfree(ep)` 改为 `kfree_rcu(ep, rcu)`（需给结构体加 rcu_head）；影响 6.6+ 内核及 Android，作者在 Pixel 10 上实测。

A couple of weeks ago Nicholas Carlini burned an epoll uaf race in `fs/eventpoll.c`. [Commit 07712db80857](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/commit/?id=07712db80857d5d09ae08f3df85a708ecfc3b61f) changed a `kfree()` to `kfree_rcu()`. The commit message says: “eventpoll: defer struct eventpoll free to RCU grace period.”

That one call fixed a uaf that had been reachable from any unprivileged process for a few years on any Linux / Android running a 6.6 and above kernel with the affected optimization. This post is the story about the bug itself, what it gives you and my (failed) attepmts at exploiting this on a real modern device.

LLM Technical summary A use after free in the epoll graph walker in \`fs/eventpoll.c\`. A 2023 optimization (removing the global \`epmutex\`) left the RCU read side walkers \`ep\_get\_upwards\_depth\_proc\` and \`reverse\_path\_check\_proc\` racing against \`ep\_free\`, which frees \`struct eventpoll\` with \`kfree()\` (no RCU grace period). The walker follows \`epi->ep\` into a freed \`eventpoll\` in \`kmalloc-256\`. The walker writes \`loop\_check\_gen\` (u64 at offset 168) and \`loop\_check\_depth\` (u8 at offset 184) into the freed object, giving a constrained write primitive. Discovered by Nicholas Carlini. Fixed in commit \`07712db80857\` by changing \`kfree(ep)\` to \`kfree\_rcu(ep, rcu)\`. Affects Linux 6.6+ kernels with the \`epmutex\` removal optimization (March 2023). Triggerable from any unprivileged process via nested epoll instances and same CPU preemption under \`CONFIG\_PREEMPT=y\` and \`CONFIG\_PREEMPT\_RCU=y\`. Tested on Pixel 10 (Frankel). Cross cache exploitation to PTE pages was not achieved due to timing constraints between the 2ms race window and the 100ms slab to PTE transition pipeline. Same cache reclaim in \`kmalloc-256\` is straightforward via LIFO SLUB freelist.

I spent a bit on a Pixel 10 working on this bug and in the process learned more about CFS vruntime tricks, SLUB internals, and the ARM64 memory model than I probably needed to.

## epoll in 2 seconds

If you’ve run a Linux server you’ve used epoll indirectly. It’s the kernel’s scalable I/O notification mechanism the thing that lets nginx watch tens of thousands of sockets without blocking a thread per connection. Three syscalls: `epoll_create()` makes an instance, `epoll_ctl()` adds or removes watched file descriptors, `epoll_wait()` blocks until something happens.

Linux manages everything as file, so epoll fd is itself a file descriptor. You can add an epoll to another epoll. This creates a directed graph of instances watching instances, and the kernel has validation code inside `epoll_ctl(ADD)` that walks this graph to check for cycles and depth violations, that validation code is where the bug lives.

epoll has a history of cves [history of](https://lore.kernel.org/all/20240527185634.056918751@linuxfoundation.org/) [CVEs](https://lore.kernel.org/all/20250714230744.3710270-3-sashal@kernel.org/) however, their exploitation is not documented and is very scarce.

* * *

## Structures

![epoll data structures and the UAF](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a613160059ebbd36.svg)

**`struct eventpoll`**: one per `epoll_create()`. Has the wait queue, the RB tree of items being watched, and `refs` at offset 176: an hlist head that links every `epitem` pointing back at this instance from somewhere else. It’s the incoming-edges list in the graph.

**`struct epitem`**: one per (epoll instance, watched fd) pair. Has `epi->ep`, a pointer to its owning `eventpoll`. If the watched fd is itself an epoll, this epitem is also linked into *that* epoll’s `refs` hlist via `fllink`.

The graph walker iterates `ep->refs`, follows `epi->ep` for each entry to reach a parent `eventpoll`, and recurses. That `epi->ep` dereference is the UAF.

* * *

## The 2023 Optimization

Before March 2023, every `epoll_ctl(ADD)` with a nested target acquired a global mutex called `epmutex`. Under HTTP benchmarks, 58% of CPU time was lost to contention on it.

A patch replaced `epmutex` with a per-instance `refcount_t`, added a `dying` flag to `struct epitem`, and narrowed the remaining lock to only be held during actual graph walks. Throughput went up 60%.

The race happens in the graph walkers `ep_get_upwards_depth_proc` and `reverse_path_check_proc`. Both functions iterate `ep->refs` under `rcu_read_lock()` while other threads tear down the structures they’re pointing at. The old `epmutex` had been incidentally serializing this, but the new optimization was too open and nobody noticed the walkers race. The reason is they don’t touch any of the data the mutex was nominally protecting, they were only reading data.

* * *

## The Bug

```cpp
static int ep_loop_check(struct eventpoll *ep, struct eventpoll *to)
{
	int depth, upwards_depth;

	inserting_into = ep;
	/*
	 * Check how deep down we can get from @to, and whether it is possible
	 * to loop up to @ep.
	 */
	depth = ep_loop_check_proc(to, 0);
	if (depth > EP_MAX_NESTS)
		return -1;
	/* Check how far up we can go from @ep. */
	rcu_read_lock();
	upwards_depth = ep_get_upwards_depth_proc(ep, 0);
	rcu_read_unlock();

	return (depth+1+upwards_depth > EP_MAX_NESTS) ? -1 : 0;
}

..
snip
..


static int ep_get_upwards_depth_proc(struct eventpoll *ep, int depth)
{
    int result = 0;
    struct epitem *epi;

    if (ep->gen == loop_check_gen)
        return ep->loop_check_depth;

    hlist_for_each_entry_rcu(epi, &ep->refs, fllink)
        result = max(result, ep_get_upwards_depth_proc(epi->ep, depth + 1) + 1);
    ep->gen = loop_check_gen;
    ep->loop_check_depth = result;
    return result;
}
```

`ep_get_upwards_depth_proc` runs under `rcu_read_lock()`. Each `epitem` is safe when unlinked, it’s freed via `call_rcu()`, so RCU keeps it alive through the read-side critical section. There’s even a comment in the source that acknowledges the RCU reader:

```c
/* The rcu read side, reverse_path_check_proc(), does not make
 * use of the rbn field.
 */
call_rcu(&epi->rcu, epi_rcu_free);
```

That comment is correct about the `epitem`. It says nothing about what `epi->ep` points to.

Now look at the teardown path:

```c
static void ep_free(struct eventpoll *ep)
{
    mutex_destroy(&ep->mtx);
    free_uid(ep->user);
    wakeup_source_unregister(ep->ws);
    kfree(ep);
}
```

`kfree()`. Immediate. No RCU grace period.

The walker loads `epi->ep` a pointer read, then dereferences the target but that `eventpoll` may have already been freed and reused by a completely different `kmalloc-256` allocation.

* * *

## Triggering it

![The race timeline](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5dceeb13f883c317.svg)

I initially tried two threads on different CPUs, one walking the graph one closing an epoll fd, it didn’t work. The window between loading `epi` from the hlist and following `epi->ep` is a handful of ARM64 instructions. What does work is same-CPU preemption. The Frankel device I was testing on runs `CONFIG_PREEMPT=y` and `CONFIG_PREEMPT_RCU=y`, which means `rcu_read_lock()` just bumps a per-task counter it doesn’t disable preemption. A timer tick during the walk can yield the CPU to the closer thread even though the walker is mid-RCU.

Just to give you a sense on numbers (`CONFIG_HZ=250`, tick every 4 ms):

-   4,096 parents: walk takes ~400 us. Rarely overlaps a tick.
-   8,000 parents: ~2 ms. Overlaps reliably. About 4% hit rate per attempt.

If the closer thread busy waits for the trigger signal, the scheduler treats it the same priority as the walker and never switches, but if you add the closer `usleep(1000)` in a loop while waiting. Sleeping threads get scheduling priority when they wake and the scheduler preempts the walker immediately.

The Pixel’s default governor throttles to 729 MHz at idle, at that frequency the traversal timing shifts enough that the race stops firing entirely:’)

* * *

## What Gets Written

```cpp
struct eventpoll {
    struct mutex               mtx;                  /*     0    48 */
    wait_queue_head_t          wq;                   /*    48    24 */
    wait_queue_head_t          poll_wait;            /*    72    24 */
    struct list_head           rdllist;              /*    96    16 */
    rwlock_t                   lock;                 /*   112     8 */
    struct rb_root_cached      rbr;                  /*   120    16 */
    struct epitem *            ovflist;              /*   136     8 */
    struct wakeup_source *     ws;                   /*   144     8 */
    struct user_struct *       user;                 /*   152     8 */
    struct file *              file;                 /*   160     8 */
    u64                        gen;                  /*   168     8 */ /* read, then WRITE loop_check_gen */
    struct hlist_head          refs;                 /*   176     8 */ /* READ as hlist pointer           */
    u8                         loop_check_depth;     /*   184     1 */ /* WRITE 0 or a kernel pointer     */
    refcount_t                 refcount;             /*   188     4 */
    unsigned int               napi_id;             /*   192     4 */

    /* size: 200, cachelines: 4, members: 15 */
};
```

`struct eventpoll` lives in `kmalloc-256` (order-1 slabs, 32 objects per slab, `cpu_partial=52` on this device). `init_on_free=1` is set by default on Frankel devices and Android adds custom padding at the end of each object therefore the structure is different from mainline linux a bit.

Since the traversal of `refs.first` is at offset 176, this is our target offset, which is critical as my main attempt to exploit this as a one shot w/o any infoleaks:

If it’s **zero** (the `init_on_free` case), the hlist looks empty. The walker skips the loop, writes `loop_check_gen` at 168 and a zero byte at 184, returns. Silent corruption of 9 bytes in whatever object gets reused.

If it’s **nonzero**, the walker follows it as a pointer to an `epitem`, computes `container_of()`, dereferences `epi->ep`, and recurses into wherever that points. This is an arbitrary write primitive.

If you can grab the object where you control offset 176, you steer the recursion. Each level writes `loop_check_gen` (a global u64 counter that increments per `epoll_ctl(ADD)`) and a zero byte at fixed offsets from the pointer target. That’s a constrained write primitive. What you do with it from there depends on what `kmalloc-256` object you use for reclaim, and how creative you’re feeling.

Note: There are other paths I did not include in this blog. One of them leads to `mutex_unlock` that if you are careful and brave enough to walk into. They require tremendous memory pressure and some of them might be fruitful. Trivia: We also control and `gen` and `loop_check_depth` which allows to zero out (or write somewhat deterministically yet very slowly) a controlled value to the freed chunk.

* * *

## Can You Cross Cache This?

I wanted to exploit this vuln as one shot primitive and wanted to do this using PTE corruption, my attempts failed, but this was my strategy. If I were to infoleak, I’d use a different primitive and then solve everything pretty easily with `refs.first` as a pointer. Note: This part is technical. If you are not familiar with PCPs, Page Table Entries or SLUB / Buddy internals, I encourage you to read about them before you try reading this part.

The freed objects goes into `kmalloc-256` and uses order-1 slabs. ARM64 PTE pages are order-0 (4 KB). These sit on different PCP freelists. The order-1 page freed from the slab cache won’t satisfy an order-0 PTE request unless PCP overflows and buddy splits it. Arranging that overflow during the narrow race window turned out to be non-trivial. It was possible to perform the split w/o invoking the race, however, integrating both pieces together was never a succeess.

These pieces work separately. Shaping 244 out of 250 slab pages go to buddy with 16 children forking and faulting 8 GB each, all available UNMOVABLE order-1 gets split for PTE allocations. The slab2buddy transition works, the buddy2PTE transition works, the problem is combining them with the race. The walker finishes in about 2 ms. The full cross cache pipeline, SLUB discard, PCP drain, buddy insertion, PTE allocation with `__GFP_ZERO` takes on the order of 100 ms. The gen write needs to land on a physical page that has *already* completed the transition from slab to PTE, and those timelines don’t overlap. I couldn’t find a way to stretch the walk long enough without resorting to `SCHED_FIFO` or similar privileged tricks, which defeats the purpose.

Same-cache reclaim ignores this entirely. SLUB’s per-CPU freelist is LIFO: last freed, first allocated. An immediate `kmalloc(256)` on the same CPU gets you the exact slot. The hard part is finding a `kmalloc-256` object with a useful layout at offsets 168 and 176, I did not invest too much time into this.

* * *

## The Fix

[Commit 07712db80857](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/commit/?id=07712db80857d5d09ae08f3df85a708ecfc3b61f):

```
 static void ep_free(struct eventpoll *ep)
 {
     mutex_destroy(&ep->mtx);
     free_uid(ep->user);
     wakeup_source_unregister(ep->ws);
-    kfree(ep);
+    kfree_rcu(ep, rcu);
 }
```

The fix adds a `struct rcu_head` to `eventpoll`. `kfree_rcu()` defers the free until the RCU grace period ends. Since the walker holds `rcu_read_lock()`, the grace period can’t complete until it’s done.

* * *

## Closing Thoughts

What stays with me about this bug isn’t the race condition or the allocator internals. It’s how much work it takes to understand which code paths in epoll are protected by what. Wait queue locks serialize callbacks file refcounts gate `ep_free`. `__fput` sequences cleanup. `call_rcu` defers `epitem` frees. Each mechanism covers something. You have to hold all of them in your head at once before you can point at `epi->ep` and be sure that nothing is keeping the target alive. I spent several days just on that part.

I encourage anyone to try to exploit this on a modern Android system, it sounds fun and I’d be interested to see how u managed to get a stable arb read and write primitives based on this bug.
