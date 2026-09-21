---
title: "IonStack part II: GhostLock, a stack-UAF that has existed in ALL Linux distributions for 15 years | NebuSec"
source: https://nebusec.ai/research/ionstack-part-2/
source_host: nebusec.ai
clip_date: 2026-09-21T11:43:59+08:00
trace_id: 029cf2fb-dc94-492a-9627-a9233b67cd93
content_hash: b876e3cbb9e39eaf2c1542e8db88991720717a9827a74bec162d45bd98db7df7
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: NebuSec
ai_summary: Linux 内核 rtmutex 的 `remove_waiter()` 误用 `current` 清空 `pi_blocked_on`，留下内核栈悬垂指针，可无特权提权与容器逃逸（CVE-2026-43499）。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3e275244-d011-8114-a1e8-e026a2073fc1
ioc:
  cves:
    - CVE-2022-42703
    - CVE-2026-43499
    - CVE-2026-53166
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Linux 内核 rtmutex 的 `remove_waiter()` 误用 `current` 清空 `pi_blocked_on`，留下内核栈悬垂指针，可无特权提权与容器逃逸（CVE-2026-43499）。
> 
> - **影响范围：** v2.6.39-rc1 至 v7.1-rc1，仅需 `CONFIG_FUTEX_PI=y`，无需特殊配置或特权；2011 年起影响所有未打补丁的发行版。
> - **触发条件：** 三个 futex 与三个线程构造 PI 依赖环，`FUTEX_WAIT_REQUEUE_PI` + `FUTEX_CMP_REQUEUE_PI` 触发 `-EDEADLK` 回滚，代理路径清除的是 requeuer 而非 waiter 的 `pi_blocked_on`；环形一成立便无时间压力，单核也可利用。
> - **栈回收：** 用 `prctl(PR_SET_MM_MAP)` 的 `user_auxv` 栈缓冲覆盖同深度旧帧，伪造 `rt_mutex_waiter`；辅以 `fallocate(PUNCH_HOLE)` 拉长 `copy_from_user` 竞态窗口。
> - **写原语与 CFH：** `rt_mutex_dequeue()` 即 rb_erase，只能向 target 写一个指针，要求 target-8 低 4 字节为 0、target+8/+16 可控；选 `inet6_protos[IPPROTO_UDP]` 为目标，写入指向 CPU entry area 的指针，再伪装 `inet6_protocol`，由回环 IPv6 UDP 包夺取 PC。
> - **提权与缓解：** ROP 翻转 `core_pattern` 的 mode 位（DirtyMode），随后纯用户态提权，kernelCTF 奖金 $92,337；修复改为锁 `waiter->task`，`RANDOMIZE_KSTACK_OFFSET` 可把栈复用降为约 1/32 猜测，`STATIC_USERMODE_HELPER` 可堵该路径。

Need something less technical? Take a quick look at our bug summary.

[Read the bug summary →](https://nebusec.ai/buglist/CVE-2026-43499/)

> GhostLock (CVE-2026-43499) is a Linux kernel vulnerability found by [Nebu](https://nebusec.ai/) that exists in every major distribution since 2011. Triggering the bug does not require any special kernel config or privilege. By turning it into a 97% stable privilege escalation and container escape, Google has rewarded us $92,337 in kernelCTF. This writeup covers the technical details of the exploit.

## Vulnerability Summary

GhostLock (CVE-2026-43499) lets an unprivileged local attacker:

-   Get a dangling kernel pointer to kernel stack memory with only regular threading syscalls.
-   Write a pointer to an almost arbitrary address.
-   Hijack a function table to get control flow hijack and eventually get root access.

GhostLock was introduced in Linux 2.6.39 and fixed in Linux 7.1. It has existed in the Linux kernel for more than 15 years. **Every Linux distribution** without the patch is affected and should consider upgrading to the latest LTS version.

Your browser does not support the video tag.

## Vulnerability Analysis

### Overview

GhostLock was introduced with the rtmutex rework in [`8161239a8bcc`](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=8161239a8bcc) (“rtmutex: Simplify PI algorithm and make highest prio task get lock”), and sat untouched for about fifteen years until the April 2026 fix in [`3bfdc63936dd`](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/commit/?id=3bfdc63936dd4773109b7b8c280c0f3b5ae7d349) (“rtmutex: Use waiter::task instead of current in remove_waiter()”). The affected range is `v2.6.39-rc1` to `v7.1-rc1`, with `CONFIG_FUTEX_PI=y` the only requirement and no capabilities or user namespaces needed.

`remove_waiter()` in `kernel/locking/rtmutex.c` clears `current->pi_blocked_on`. That is correct on the normal slow path, where `current` is the task that owns the waiter. It is wrong on the proxy path. `rt_mutex_start_proxy_lock()` enqueues, and on error rolls back, an `rt_mutex_waiter` on behalf of another task, so `current` is the requeuer rather than the waiter.

The waiter object lives on the stack of a task sleeping in `FUTEX_WAIT_REQUEUE_PI`. A `FUTEX_CMP_REQUEUE_PI` then proxies that waiter onto the target PI futex. When the rtmutex chain walk reports a deadlock, the rollback dequeues the waiter from the lock but clears `pi_blocked_on` on the requeuer. The waiter task keeps `pi_blocked_on` pointing at its own stack frame, which is popped the moment the waiter returns to userspace. Any later PI chain walk through that task follows the dangling pointer.

### Root cause

Like other lifecycle bugs, this occurs when a function is used by a caller it was never designed to support.

The helper function `remove_waiter()` was originally written for exactly one scenario: a thread blocks on its own, then cleans up after itself. So it has always assumed that `current` (whichever thread happens to be running) is the `waiter` it needs to clean up, and clears `current->pi_blocked_on` accordingly.

However, Requeue-PI breaks that assumption. Through `rt_mutex_start_proxy_lock()`, this helper is now used to clean up on behalf of a different, sleeping thread. In that path, `current` is the thread that issued `FUTEX_CMP_REQUEUE_PI` rather than the actual `waiter`.

When `__rt_mutex_start_proxy_lock()` returns `-EDEADLK`, it rolls back via `remove_waiter()`, the misused helper.

```c
int __sched rt_mutex_start_proxy_lock(struct rt_mutex_base *lock,
                                      struct rt_mutex_waiter *waiter,
                                      struct task_struct *task)
{
    int ret;
    raw_spin_lock_irq(&lock->wait_lock);
    ret = __rt_mutex_start_proxy_lock(lock, waiter, task);
    if (unlikely(ret))
        remove_waiter(lock, waiter);          // ret == -EDEADLK
    raw_spin_unlock_irq(&lock->wait_lock);
    return ret;
}
```

`remove_waiter()` then scrubs the wrong task.

```c
static void __sched remove_waiter(struct rt_mutex_base *lock,
                                  struct rt_mutex_waiter *waiter)
{
    ...
    raw_spin_lock(&current->pi_lock);
    rt_mutex_dequeue(lock, waiter);
    current->pi_blocked_on = NULL;            // should be waiter->task
    raw_spin_unlock(&current->pi_lock);
    ...
}
```

`waiter` is the object that lives on the sleeping thread’s own stack, while `current` here is the thread that requested the requeue. The fix locks `waiter->task->pi_lock` and clears `waiter->task->pi_blocked_on` instead. This issue slips past lockdep, which only checks that a `pi_lock` is held but not whose it is.

**Triggering the -EDEADLK Path.** Reaching the `-EDEADLK` rollback needs a PI dependency cycle built from three futex words and three threads.

-   `f_pi_chain`, a PI futex, locked first by the **waiter** thread.
-   `f_pi_target`, a PI futex, locked first by the **owner** thread. This is the requeue target.
-   `f_wait`, the plain futex the waiter blocks on with `FUTEX_WAIT_REQUEUE_PI`.

The sequence is:

1.  The waiter takes `f_pi_chain`, then blocks in `FUTEX_WAIT_REQUEUE_PI(f_wait -> f_pi_target)`. Its `rt_mutex_waiter` is now on its stack.
2.  The owner takes `f_pi_target`, then blocks on `f_pi_chain`, which the waiter holds.
3.  The main thread calls `FUTEX_CMP_REQUEUE_PI(f_wait -> f_pi_target)`.

![Race window](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/384f865342a34006.svg)

![Race window](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e36b5b44e04e97f2.svg)

The requeue tries to proxy the waiter onto `f_pi_target`. The owner of `f_pi_target` is already blocked behind the waiter through `f_pi_chain`, so the chain walk closes the loop `waiter -> f_pi_target -> owner -> f_pi_chain -> waiter`. It returns `-EDEADLK` and takes the buggy rollback. The waiter wakes with a dangling `pi_blocked_on`.

Here the only ordering that matters is the requeuer rolling back the waiter while the waiter still owns the soon-to-be-freed object, and once the cycle is staged that happens on its own. After it resolves there is no time pressure at all. The waiter sits in userspace with a dangling `pi_blocked_on`, and the follow-up `sched_setattr()` that walks the chain can fire whenever it likes. The UAF window is wide open.

The catch is where the freed object lives on the kernel stack (stack-UAF if we call `ret` out of the futex syscall a “free”). To reclaim it, we need to find a syscall that can land controlled bytes back on the same stack at the same depth (offset).

### Triggering the stack-UAF

Staging the three-futex cycle leaves the waiter task in userspace with `pi_blocked_on` dangling into its old `FUTEX_WAIT_REQUEUE_PI` frame. Everything below rides on that one pointer.

> Note that three threads is for better understanding. To win the race and trigger UAF, you only need one CPU core.

#### The initial primitive from GhostLock

By now we hold a pointer into freed kernel stack, and we can trigger, at will, a kernel access that dereferences it as an `rt_mutex_waiter`. We can spray controlled bytes onto that stack and forge the `rt_mutex_waiter` outright. Depending on the layout we forge, this one access yields several primitives, two main ones:

-   write a pointer to an arbitrary (but constrained) address
-   write 8 bytes of zero to an arbitrary (but constrained) address

Several pointer dereferences and integrity checks run before the primitive fires, and after it fires the kernel returns normally, no crash.

So our main questions, each answered in a section below:

-   how do we get the freed stack memory back (spray)? [\-> Reusing the stack](#reusing-the-stack-forging-the-waiter-with-pr_set_mm_map)
-   how do we get the fake `rt_mutex_waiter` past its built-in structural checks, and forge pointers that read as valid? [\-> From fake waiter to a write](#from-fake-waiter-to-one-controlled-limited-write)
-   which write primitive, and what do we write where? what does the primitive constrain about the “arbitrary” address? [\-> Use inet6_protos](#use-inet6_protosipproto_udp-to-help)

## Exploit Details

### Exploit Summary

-   **prefetch** -> Leak the kernel image slide and the physmap base.
-   **GhostLock** -> Leave a dangling `rt_mutex_waiter` in the waiter task’s `pi_blocked_on`.
-   **(stack-)UAF Reclaim** -> Use `PR_SET_MM_MAP` to reclaim the waiter’s own kernel stack and forge a fake `rt_mutex_waiter` over the freed frame.
-   **Arb address writer** -> Rtmutex rb-tree erase: one constrained pointer write (which we can reclaim its content), overwrite struct which contains a function table: `inet6_protos[IPPROTO_UDP] = <CEA pointer>`.
-   **CPU entry area** -> Host {fake `inet6_protocol`, pivot slots, ROP stack} all together at a known direct-map address.
-   **Trigger CFH** -> Trigger a loopback IPv6 UDP packet calls through the overwritten handler and pivots.
-   **DirtyMode** -> One write flips `core_pattern` ’s mode bits, then the rest LPE is pure userspace.

What about Android?

This part we are focusing on basic exploit steps of generic x86 Linux systems, our next blog will discuss how to exploit GhostLock on Android, reclaiming stack frame, bypassing both ASLR and CFI.

### Background of used tricks

#### Prefetch ASLR Leak

A `prefetch` on a given address runs in a different number of cycles depending on whether that address is mapped in the current page tables, so an unprivileged process can time `prefetch` across the kernel range and read off which addresses are mapped (the [prefetch paper](https://gruss.cc/files/prefetch.pdf) has the details).

It works here as Linux barely randomizes the base of its default kernel image (~9 bits of entropy for text base), so a little averaging can recover the KASLR base with near 100% reliability.

In theory any CPU with `prefetch` and without proper Kernel Page-Table Isolation is affected. But in practice it is more of an x86 technique (unless the ARM target runs KPTI off). kernelCTF images keep KPTI disabled.

> kernelCTF images keep KPTI disabled, but even with KPTI on, `prefetch` paired with [EntryBleed](https://www.willsroot.io/2022/12/entrybleed.html) can still recover the kernel image base through the trampoline.

#### CEA spray and randomization bypass

The CEA (CPU entry area) is a per-CPU x86 structure holding the stacks and register context used for entry and exception handling: on an exception, interrupt, or syscall the CPU switches to a stack that lives in the CEA, and the entry code spills the register frame (`pt_regs`) there. An unprivileged userspace program can trigger a software exception and write its own register context into the `pt_regs` saved on a CEA exception stack. Before `6.2` the CEA sat at a completely fixed address, so we can place about 120 bytes of contiguous controlled memory at a known kernel address, which is very handy for forging structures, for absorbing the side effects of the pointer dereferences along the way, and for staging a ROP stack.

After Project Zero’s [Bringing back the stack attack](https://googleprojectzero.blogspot.com/2022/12/exploiting-CVE-2022-42703-bringing-back-the-stack-attack.html) writeup, the kernel started strongly randomizing the CEA’s virtual address (since `6.2`). But the virtual address of the CPU entry area is never needed, as the CEA’s physical offset is fixed, so its direct-map alias follows from the physmap base (same observation [@kqx](https://kqx.io/writeups/zenerational/) used).

That direct-map address is easy to leak with `prefetch`, plus candidate-edge normalization and a check against the predicted CEA page to reject neighbouring aliases. (The direct-map leak is noisier than the text one and may need a little more tuning, but it lands at very high accuracy on the target in the end.) So we can always compute the CEA’s other virtual-address mapping:

```plaintext
cea_direct = physmap_base + CPU1_CEA_BASE
```

Note that each CPU’s CEA virtual address is randomized to a different place. Their physical addresses are all fixed, though, and this offset depends mainly on the target’s kernel version and boot memory size. In the kernelCTF LTS `6.12.80` 3.5G-boot environment, it is `0x11c517000(+0x1f58)`.

### Reusing the stack: forging the waiter with PR_SET_MM_MAP

The dangling object is the waiter’s own stack `rt_mutex_waiter`.

```c
struct rt_mutex_waiter {
    struct rt_waiter_node tree;     // rb node, lives in lock->waiters
    struct rt_waiter_node pi_tree;
    struct task_struct *task;
    struct rt_mutex_base *lock;
    unsigned int wake_state;
    struct ww_acquire_ctx *ww_ctx;
};
```

Controlled bytes have to land back over that exact frame, on the waiter thread’s own stack, and stay there long enough to be read. The waiter thread returns from the futex syscall and immediately calls `prctl(PR_SET_MM, PR_SET_MM_MAP, ...)`. Inside, `prctl_set_mm_map()` copies a user-supplied auxv into a fixed-size `unsigned long user_auxv[AT_VECTOR_SIZE]` stack buffer. That buffer sits at roughly the same stack depth as the freed waiter, so it is a large, naturally-aligned, namespace-free block of controlled qwords landing right on top of the old object.

The auxv is laid out so the overlapping qwords become:

-   `tree`, an rb node crafted so erasing it promotes one chosen child pointer (`W0_BASE`, below) into the tree root.
-   `task`, set to `&init_task`, a valid `task_struct` so the chain walk’s task derefs are safe.
-   `lock`, set to `&inet6_protos[IPPROTO_UDP] - 8`, the write target.
-   `wake_state`, set to `0`.

The auxv is backed by a memfd and positioned so the copy straddles a page boundary. A sibling thread races `fallocate(PUNCH_HOLE)` on the trailing page during the `prctl`, which stretches the `copy_from_user` window. The forged waiter stays live on the stack while, on another CPU, a consumer thread fires `sched_setattr()` on the waiter to walk the PI chain.  
The race window is wide and we believe GhostLock is also exploitable on a single-core CPU.

> `clone` / `setsockopt` / `pselect` / `keyctl` and other syscalls with large controlled stack locals work the same way. `prctl` is just convenient here. The buffer is large, aligned, and needs no namespace.  
> Here’s more useful syscalls that can reclaim the stack frame in our [open-sourced PoC code](https://github.com/NebuSec/CyberMeowfia/blob/main/IonStack/CVE-2026-43499/poc/poc.c).

### From fake waiter to one controlled (limited) write

Controlling the waiter does not give an arbitrary write. The chain walk only does:

```plaintext
task->pi_blocked_on -> fake waiter
fake waiter->lock    -> fake rt_mutex_base
rt_mutex_dequeue(lock, waiter)        // rb_erase on lock->waiters
```

`rt_mutex_dequeue()` is an rb-tree erase, and erasing a single-child root writes that child into the root slot. Pointing `lock` at `target - 8` lines the `rt_mutex_base` fields up over the data around the target pointer.

```plaintext
target - 8  ->  raw_spinlock_t wait_lock        (must read as "unlocked")
target      ->  waiters.rb_root.rb_node          (this slot gets written)
target + 8  ->  waiters.rb_leftmost
target + 16 ->  owner
```

The fake waiter’s rb node is crafted so the erase writes exactly one child pointer into `rb_root.rb_node`. The write primitive itself is a single constrained store: `*(uint64_t *)target = W0_BASE`.

**The constraints are also highly strict**: The qword before the target must read as an unlocked spinlock, meaning zero in the low 4 bytes, or the trylock fails and the walk exits without writing. The qwords after it (`rb_leftmost`, `owner`) must not steer the walk into an uncontrolled top waiter or owner. An unmapped value there faults and panics the box. The equivalent target address constraint is roughly as follows (\*target will be written to a pointer):

```c
*(u32 *)(target - 0x08) == 0
*(u64 *)(target + 0x08) == 0 // simplified
((*(u64 *)(target + 0x10)) & ~1ULL) == 0
// Then we can do:
*(u64 *)target = &W0->tree.entry  // W0_BASE
```

Here the `W0_BASE` has to point at something that stays valid through the comparisons and the no-owner wakeup later in the same `rt_mutex_adjust_prio_chain()`. We point it at the direct-map alias of the CPU entry area, which pays off twice:

-   Before the write: the CEA is controllable memory at a known address, so we can forge a self-consistent fake waiter and lock at `W0` that survives the walk.
-   After the write: the target now points into the CEA. Once the walk is over, `W0` no longer has to look like a waiter at all, so we can re-spray the CEA with whatever the kernel expects the target to point at (if we overwritten a function table pointer with `W0`, we can now fake function pointer in CEA to get Control Flow Hijack).

Why the CEA?

There’s several ways to spray controlled memory at a fixed (knowned) kernel address. The CEA is one of the more efficient, and its main limit is the ~120-byte small size. NPerm, kernelsnitch and other tricks can do the same job with more room.

Before the trigger, `W0` is spraied as that fake waiter and lock pair: `task = &init_task`, a legit `prio`, and a `lock` whose `wait_lock` reads unlocked and whose owner is benign, so the dequeue, re-enqueue, priority update and wakeup all survive.

The following figure shows how CPU entry area is used to first hold fake `rt_mutex_waiter` and `lock` structures, then serve `inet6` (next section), ROP stack and JOP gadgets for stack pivoting at the same time, and eventually use a very short ROP to perform the DirtyMode and safely halt the core.

![Dual use of the CEA, with three data structures overlapped within 104 bytes](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c36bcf919b8a4608.svg)

![Dual use of the CEA, with three data structures overlapped within 104 bytes](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6f1f592ef35ef8f8.svg)

### Use inet6_protos\[IPPROTO_UDP\] to help

Start from now the exploit path would differ from targets, as of regular x86_64 Linux kernel, we can pick a shorter path by just overwriting some function table (or any object that contains one), as we already have KASLR leaked and ready to get a CFH.

A scan of writable data turns up many pointer tables whose neighbours satisfy the layout above. `inet6_protos[IPPROTO_UDP]` is a nice one. The neighbours fall out for free, and the trigger is a trivial unprivileged loopback packet.

```plaintext
inet6_protos[16]  == NULL              // fake wait_lock -> unlocked
inet6_protos[17]  == &udpv6_protocol   // <- target (IPPROTO_UDP)
inet6_protos[18]  == NULL              // fake rb_leftmost
inet6_protos[19]  == NULL              // fake owner
```

After the write, `inet6_protos[IPPROTO_UDP]` points into the CEA page, where the kernel expects an `inet6_protocol`.

```c
struct inet6_protocol {
    int (*handler)(struct sk_buff *skb);
    int (*err_handler)(...);
    unsigned int flags;
};
```

So `W0` is re-spraied as a fake `inet6_protocol`. `handler` is the first pivot gadget, `err_handler` is unused, and `flags` is `INET6_PROTO_NOPOLICY | INET6_PROTO_FINAL`. Once we send a loopback IPv6 UDP (`connect` then `write` to `::1`), the kernel will dereference the `handler` and give us a PC control.

### The pivot and DirtyMode

We use the same compact CEA window to holds multiple objects: {the fake `inet6_protocol`, a few JOP/pivot slots, the final ROP stack}. On Google’s lts-6.12.80 kernel target we are not lucky enough to find a nice single stack pivot target, so the chain takes one extra load/call to land the CEA address in `rbp`, then pivots with `mov rsp, rbp; pop rbp; ret`.

A `ret2usr` or a full `/proc/%P/fd/x` overwrite would run to around ten gadget qwords, which is too long. So we use **DirtyMode** as the final exploit stage: a single write, with an almost-garbage value, that flips a permission bit. After it, LPE can be done purely in userspace.

Here we target at the `core_pattern` sysctl’s mode flags:

```c
static struct ctl_table coredump_sysctls[] = {
    ...
    { .procname     = "core_pattern",
      .data         = core_pattern,
      .maxlen       = CORENAME_MAX_SIZE,
      .mode         = 0644,
      .proc_handler = proc_dostring_coredump },
    ...
};
```

`coredump_sysctls` lives in writable kernel data (share same KASLR slide with kernel image). The ROP writes a permissive value to `coredump_sysctls[1].mode`. Any value with the write bit (2nd LSB) set is enough.

Here we uses a short `pop reg; mov [reg], reg; ret` plus an `msleep` to park the hijacked thread safely. And now `/proc/sys/kernel/core_pattern` is now world-writable, so an unprivileged process opens it, writes `|/proc/%P/fd/666 %P`, and crashes a helper to trick kernel runs our binary as root.

> The initial write primitive (the rb-tree write) cannot reach `coredump_sysctls[1].mode` directly because of where it lands, so the mode flip is done from the short ROP stage.

## Appendix

The full exploit code can be found in our [open source security research project, CyberMeowfia](https://github.com/NebuSec/CyberMeowfia/tree/main/IonStack/CVE-2026-43499).

### bigger ROP or NPerm

kernelCTF is a race, and the shortest reliable chain wins. [NPerm](https://github.com/google/security-research/pull/268) -backed memory makes a fine large fake stack after the hijack, and there are heavier routes that would also work, including [Lukas Maar’s heap-KASLR leak](https://lukasmaar.github.io/posts/heap-kaslr-leak/index.html). Each adds another stage and increases time cost. CEA plus DirtyMode is the shortest path to a one-write win, and on the remote it win us the flag in about 5 seconds.

### Mitigation

#### The patch

```diff
diff --git a/kernel/locking/rtmutex.c b/kernel/locking/rtmutex.c
--- a/kernel/locking/rtmutex.c
+++ b/kernel/locking/rtmutex.c
@@ -1544,6 +1544,8 @@ static bool rtmutex_spin_on_owner(struct rt_mutex_base *lock,
  *
  * Must be called with lock->wait_lock held and interrupts disabled. It must
  * have just failed to try_to_take_rt_mutex().
+ *
+ * When invoked from rt_mutex_start_proxy_lock() waiter::task != current !
  */
 static void __sched remove_waiter(struct rt_mutex_base *lock,
                   struct rt_mutex_waiter *waiter)
@@ -1551,14 +1553,15 @@ static void __sched remove_waiter(struct rt_mutex_base *lock,
 {
     bool is_top_waiter = (waiter == rt_mutex_top_waiter(lock));
     struct task_struct *owner = rt_mutex_owner(lock);
+    struct task_struct *waiter_task = waiter->task;
     struct rt_mutex_base *next_lock;

     lockdep_assert_held(&lock->wait_lock);

-    raw_spin_lock(&current->pi_lock);
-    rt_mutex_dequeue(lock, waiter);
-    current->pi_blocked_on = NULL;
-    raw_spin_unlock(&current->pi_lock);
+    scoped_guard(raw_spinlock, &waiter_task->pi_lock) {
+        rt_mutex_dequeue(lock, waiter);
+        waiter_task->pi_blocked_on = NULL;
+    }

     /*
      * Only update priority if the waiter was the highest priority
@@ -1594,7 +1597,7 @@ static void __sched remove_waiter(struct rt_mutex_base *lock,
     raw_spin_unlock_irq(&lock->wait_lock);

     rt_mutex_adjust_prio_chain(owner, RT_MUTEX_MIN_CHAINWALK, lock,
-                   next_lock, NULL, current);
+                   next_lock, NULL, waiter_task);
```

This patch is effective at mitigating the exploit, though it missed a scenario that produces an NPD: a non-top requeue waiter that already owns the target PI futex hits `-EDEADLK` before `waiter->task` is set, so the new `remove_waiter()` then dereferences a NULL `waiter->task`.

That NPD was fixed by [`40a25d59e85b`](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=40a25d59e85b).

We had also sent a fix to `security@kernel.org` before v1 landed. Its core:

```diff
static void __sched remove_waiter(struct rt_mutex_base *lock,
                  struct rt_mutex_waiter *waiter)
                  struct rt_mutex_waiter *waiter,
                  struct task_struct *task)
{
    ...
    raw_spin_lock(&current->pi_lock);
    raw_spin_lock(&task->pi_lock);
    rt_mutex_dequeue(lock, waiter);
    current->pi_blocked_on = NULL;
    raw_spin_unlock(&current->pi_lock);
    if (task->pi_blocked_on == waiter)
        task->pi_blocked_on = NULL;
    raw_spin_unlock(&task->pi_lock);
    ...
    rt_mutex_adjust_prio_chain(owner, RT_MUTEX_MIN_CHAINWALK, lock,
                   next_lock, NULL, current);
                   next_lock, NULL, task);
}
```

Instead of reading the task out of `waiter->task`, the callers pass in the owning task (`current` on the self-blocking path, the proxied `task` on the `rt_mutex_start_proxy_lock()` rollback), and `pi_blocked_on` is cleared only when it still points at this waiter. `task` is always a valid task and the clear is guarded.

#### RANDOMIZE_KSTACK_OFFSET

The stack-reuse step relies on the freed waiter frame and the later `user_auxv` frame overlapping deterministically. With `RANDOMIZE_KSTACK_OFFSET` on they no longer do, and the step becomes a roughly 1/32 (5-bit) stack-offset guess. Both submitted targets leave it off by default. The mitigation target turns it on, so this path was not used there.

#### STATIC_USERMODE_HELPER

`STATIC_USERMODE_HELPER` would close this particular DirtyMode path. But the same idea can be generalized to any `/proc/sys` knob whose `ctl_table::mode` gates access and whose table sits in predictable writable kernel data.

### Timeline

-   2026-04-18: We reported the bug and sent a draft patch to [security@kernel.org](mailto:security@kernel.org).
-   2026-04-20: The bug was fixed with another patch.
-   2026-05-04: The fix v1 was backported.
-   2026-06-30: Google acknowledged our kernelCTF submission and rewarded us $92,337.
-   2026-07-03: CVE-2026-53166 introduced by fix v1 was patched.
-   2026-07-07: We published this blog post.
