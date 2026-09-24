---
title: The futex READ_ONCE
source: https://guysrd.github.io/futex-read-once
source_host: guysrd.github.io
clip_date: 2026-09-24T10:21:58+08:00
trace_id: 9a362613-76eb-4fa1-a9ac-dbe969463fa6
content_hash: 9c6cc222a3677a3dccc668cf6f7f78a5a14a4f4a231854c5bede9fcc23565e8c
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: guysrd·Android/Linux内核
ai_summary: 内核 futex 子系统的 `requeue_pi_wake_futex` 少了一个 `READ_ONCE`，重排者会读取已返回线程留在内核栈上的 `futex_q`，构成栈上的释放后使用，可被非特权用户竞态触发。
ai_summary_style: key-points:weak
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-81b0-b4e6-cb925a74ea7a
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> 内核 futex 子系统的 `requeue_pi_wake_futex` 少了一个 `READ_ONCE`，重排者会读取已返回线程留在内核栈上的 `futex_q`，构成栈上的释放后使用，可被非特权用户竞态触发。
> 
> - **缺陷点：** `futex_requeue_pi_complete(q, 1)` 原子置位 `Q_REQUEUE_PI_LOCKED` 告知等待者"锁已到手"，紧接着才读取 `q->task`；而 `q` 是等待者 `futex_wait_requeue_pi` 内核栈上的局部 `struct futex_q`。
> - **快速返回路径：** 原子 trylock 路径下 `pi_state` 为 NULL，等待者看到 LOCKED 后整段 PI fixup 被跳过、不取任何锁即可从系统调用返回；只有取锁才会与重排者串行化，因此它总能在栈帧回收后领先一步。
> - **竞态窗口：** 仅一条指令宽。需在原子存储与指针加载之间打断重排者所在 CPU，常用手法是第三个 CPU 上的线程循环 `mprotect` 触发 TLB shootdown IPI，可换来 1–10 微秒延迟。
> - **栈喷射与控制流：** 系统调用返回后内核栈数据仍留在物理页，等待者须立刻再发系统调用，在旧 `q->task` 偏移写入伪造 `task_struct`（Lu NDSS 2017 称精选系统调用可覆盖栈顶 1KB 约 91%）；若未覆盖成功，读到的原值是 `current`，只会重复唤醒。
> - **写入原语：** 伪造结构需 `pi_lock` 为 0、`__state` 含 0x1/0x2 位才能通过两道门，进而走到 `enqueue_task_fair` → `account_entity_enqueue`，执行 `cfs_rq->load.weight += se->load.weight`，即受控指针上加受控 8 字节值；作者止步于此，未做成任意读写，且仍需一个信息泄露。
> - **修复：** 在原子存储前加 `task = READ_ONCE(q->task)`，在栈帧仍存活时捕获指针，再 `wake_up_state(task, TASK_NORMAL)`。

A futex is a 32b integer in userspace memory. Uncontended operations are pure userspace atomic ops the kernel is only involved when someone needs to sleep or wake up. PI futexes add priority inheritance, futex word stores the owner’s TID, and the kernel boosts the holder’s priority when a higher priority thread is waiting.

If you’ve ever done pwnable.kr and worked on towelroot, you probably remember `FUTEX_CMP_REQUEUE_PI`. This is how `pthread_cond_signal` works under the hood. The `FUTEX_CMP_REQUEUE_PI` syscall takes two userspace addresses: `uaddr1` is the condition variable’s futex and `uaddr2` is the PI mutex’s futex. A waiter sleeps on `uaddr1` and when signaled the kernel moves it to the wait queue behind `uaddr2`. If the mutex is uncontested, the kernel can acquire it atomically on behalf of the waiter and skip the requeue entirely. That fast path “lock acquired atomically, just wake the waiter” is where the bug is.

It is very rare to see any bugs in this subsystem, having great maintainers like Thomas Gleixner that understand the mechanism deep enough requires deep understanding of futex itself. it took me months to dive into them and I sometime just gave up.

LLM Technical summary A stack use after free caused by a missing \`READ\_ONCE\` in \`requeue\_pi\_wake\_futex\` in the Linux kernel futex subsystem. The function signals the waiter via \`futex\_requeue\_pi\_complete(q, 1)\` (atomic store) then reads \`q->task\` on the next line, but \`q\` is a \`struct futex\_q\` on the waiter's kernel stack. After the atomic store the waiter can see the LOCKED state, skip PI fixup (because \`q->pi\_state\` is NULL on the atomic trylock path), and return from its syscall before the requeuer reads \`q->task\`. The requeuer then dereferences a dead stack frame. The race is one instruction wide. Triggerable from unprivileged userspace using TLB shootdown IPIs via \`mprotect\` on a third CPU to interrupt the requeuer between the atomic store and the pointer load. The waiter's next syscall can spray controlled data at the old \`q->task\` offset. \`wake\_up\_state\` calls \`try\_to\_wake\_up\` on the fake \`task\_struct\` pointer, which under the right field layout reaches \`enqueue\_task\_fair\` and performs \`cfs\_rq->load.weight += se->load.weight\`, an 8 byte addition through a controlled pointer with a controlled value. The fix adds \`task = READ\_ONCE(q->task)\` before the \`futex\_requeue\_pi\_complete\` store, capturing the pointer while the stack frame is still live.

## The bug

Our post today focuses on a bug that is caused by a missing `READ_ONCE` in a function called `requeue_pi_wake_futex`, however, unlike classical use after free bugs that are on the heap our bug is caused by an esoteric state on the stack.

Here is what happens during a `pthread_cond_signal` with a PI mutex. Two threads are involved, a waiter and a requeuer:

```
  waiter                                    requeuer
  ──────                                    ────────
  pthread_cond_wait(cond, mutex)
    futex(FUTEX_WAIT_REQUEUE_PI,
          cond, mutex)
      enqueue on cond's wait queue
      go to sleep, blocked in kernel
      ...                                   pthread_cond_signal(cond)
      ...                                     futex(FUTEX_CMP_REQUEUE_PI,
      ...                                           cond, mutex)
      ...                                       try to acquire mutex for waiter
      ...                                       if acquired:
      ...                                         requeue_pi_wake_futex(q)
      ...                                           signal waiter, wake it up
      wakes up, returns to userspace
```

The waiter is the thread that called `pthread_cond_wait`. It enters the kernel and goes to sleep on the condition variable’s futex. The requeuer is the thread that called `pthread_cond_signal`. It enters the kernel and tries to move the waiter onto the mutex. If the mutex is free the requeuer acquires it on behalf of the waiter and calls `requeue_pi_wake_futex` to let the waiter know.

The bug is in `requeue_pi_wake_futex` and hard to spot, `q` is a variable on the stack of the waiter’s call, it occurs exactly when you signal the waiter that the lock is acquired and then try to read from `q` on the next line but the waiter already saw the signal returned from its syscall and its stack frame is gone. The function is called by the requeuer when the PI lock was acquired atomically on behalf of the waiter its job is to clean up the queue entry and wake the waiter Given all this information, can you spot the bug?:’)

```rust
/**
 * requeue_pi_wake_futex() - Wake a task that acquired the lock during requeue
 * @q:		the futex_q
 * @key:	the key of the requeue target futex
 * @hb:		the hash_bucket of the requeue target futex
 *
 * During futex_requeue, with requeue_pi=1, it is possible to acquire the
 * target futex if it is uncontended or via a lock steal.
 *
 * 1) Set @q::key to the requeue target futex key so the waiter can detect
 *    the wakeup on the right futex.
 *
 * 2) Dequeue @q from the hash bucket.
 *
 * 3) Set @q::rt_waiter to NULL so the woken up task can detect atomic lock
 *    acquisition.
 *
 * 4) Set the q->lock_ptr to the requeue target hb->lock for the case that
 *    the waiter has to fixup the pi state.
 *
 * 5) Complete the requeue state so the waiter can make progress. After
 *    this point the waiter task can return from the syscall immediately in
 *    case that the pi state does not have to be fixed up.
 *
 * 6) Wake the waiter task.
 *
 * Must be called with both q->lock_ptr and hb->lock held.
 */
static inline
void requeue_pi_wake_futex(struct futex_q *q, union futex_key *key,
			   struct futex_hash_bucket *hb)
{
	q->key = *key;

	__futex_unqueue(q);

	WARN_ON(!q->rt_waiter);
	q->rt_waiter = NULL;

	q->lock_ptr = &hb->lock;

	/* Signal locked state to the waiter */
	futex_requeue_pi_complete(q, 1);
	wake_up_state(q->task, TASK_NORMAL);
}

```

If you did not find it, that’s OK. This isn’t a classical allocate, free, use bug pattern. There is no `kmalloc` here or `kfree` at all.

CPU1 (the requeuer) is running `requeue_pi_wake_futex`. CPU0 (the waiter) called `futex_wait_requeue_pi` and is blocked in the kernel waiting for someone to signal it, with `struct futex_q q` declared as a local variable on its kernel stack.

1.  `q->key = *key` the requeuer overwrites the waiter’s futex key to point at the requeue target (`uaddr2`) instead of the original condition variable (`uaddr1`). When the waiter eventually wakes up it checks this key to know which futex it was moved to.
    
2.  `__futex_unqueue(q)` removes `q` from the hash bucket’s wait queue. After this no other `futex_wake` call can find this waiter. It’s the requeuer’s responsibility to wake it.
    
3.  `q->rt_waiter = NULL` clears the RT waiter pointer. The waiter checks this field when it wakes up, if it’s NULL the waiter knows the lock was acquired atomically and there’s no `rt_mutex_waiter` to clean up.
    
4.  `q->lock_ptr = &hb->lock` points the waiter’s lock pointer at the target hash bucket’s lock. If the waiter needs to do PI state fixup later it will take this lock to serialize with the requeuer. The waiter is still asleep through all of this. These four steps are safe.
    
5.  `futex_requeue_pi_complete(q, 1)` is an atomic store that sets `q->requeue_state = Q_REQUEUE_PI_LOCKED`. The waiter on CPU0 is spinning on that field with `atomic_cond_read_relaxed`. The moment it sees LOCKED it can proceed. The comment in the source says it plainly: “After this point the waiter task can return from the syscall immediately.”
    
6.  `wake_up_state(q->task, TASK_NORMAL)` the requeuer reads `q->task` and wakes the task.
    

Now read step 5 and step 6 again:’) Step 5 tells the waiter “you have the lock” with an atomic store. The waiter on CPU0 is spinning on that field, the moment it sees LOCKED it can return from its syscall. Step 6 reads `q->task` but `q` lives on the WAITER’s kernel stack and if the waiter already returned that stack frame is gone the requeuer is reading from an unknown memory. Boom.

* * *

## The fast return path

The previous section showed the requeuer’s side what `requeue_pi_wake_futex` does, but this is only part of the magic, Why can the waiter return so fast that it beats the requeuer to step 6?

The race only works because the waiter can return *without acquiring any locks* this happens when `q->pi_state` is NULL.

The requeuer calls `futex_requeue_pi_prepare(top_waiter, NULL)` NULL because this is the atomic trylock path, no `pi_state` was created. When the waiter sees LOCKED:

```c
case Q_REQUEUE_PI_LOCKED:
    if (q.pi_state && (q.pi_state->owner != current)) {
        spin_lock(q.lock_ptr);        // would serialize with requeuer
        ret = fixup_pi_owner(uaddr2, &q, true);
        put_pi_state(q.pi_state);
        spin_unlock(q.lock_ptr);
    }
    break;
```

`pi_state` is NULL. The entire block is skipped. The waiter cancels its timer and returns.

* * *

## The race

So now we have a clear understanding of the bug itself in both the requeuer and the waiter, here is what actually happens with 2 CPUs.

```cpp
CPU0 (waiter)                          CPU1 (requeuer)
──────────────                          ────────────────
futex_wait_requeue_pi():
  struct futex_q q;       ← ON STACK
  q.task = current;
  enqueue on uaddr1, sleep
                                        futex_requeue():
                                          lock both hash buckets
                                          futex_proxy_trylock_atomic()
                                            requeue_pi_prepare(q, NULL)
                                              q->pi_state = NULL
  *timeout fires*
  sees IN_PROGRESS → WAIT
  spins on requeue_state
                                            PI lock acquired (ret=1)
                                          requeue_pi_wake_futex(q):
                                            unqueue, clear rt_waiter
                                            requeue_pi_complete(q, 1)
                                              → atomic store: LOCKED
  sees LOCKED, exits spin             ←───┘
  pi_state == NULL → skip fixup
  hrtimer_cancel, return
  ← stack frame gone →                   wake_up_state(q->task, TASK_NORMAL)
                                                        ↑
                                          reading from a dead stack frame
```

On ARM64, the waiter’s spinloop uses `atomic_cond_read_relaxed`, which compiles to a `WFE` (Wait For Event) loop. When the requeuer’s atomic store fires an exclusive monitor event, the waiter wakes within 1-3 cycles. Tight af, but the requeuer’s very next instruction is `ldr` of `q->task` also fast.

* * *

## Winning the race

The race is one instruction wide, that is tight af. You need an interrupt on the requeuer’s CPU between the atomic store and the pointer load. That buys you 1-10 microseconds of delay more than enough for the waiter to return and free the stack.

The standard trick from unprivileged userspace is a TLB shootdown IPI. A third thread on a third CPU calls `mprotect` on a shared mapping in a tight loop. Each `mprotect` sends an IPI to every CPU that has the page in its TLB. If the requeuer’s CPU has it cached, it takes the interrupt. Most calls miss the one-instruction window, but eventually you manage to win the race.

```
  waiter sleeping            waiter returned             spray
  ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
  │futex_wait_requeue│       │  (returned)       │       │                  │
  │                  │       │                   │       │                  │
  │ struct futex_q   │       │ struct futex_q    │       │ spray data       │
  │  q.task = current│ ───→  │  q.task = stale   │ ───→  │  fake task_struct*│
  │                  │       │                   │       │                  │
  │ rt_waiter        │       │ garbage           │       │ controlled       │
  │ timeout          │       │ garbage           │       │ controlled       │
  └──────────────────┘       └──────────────────┘       └──────────────────┘
  q is alive                 q is dead                   old q.task overwritten
  requeuer can read          data still in memory         requeuer reads fake ptr

  ─────────────────────────────────────────────────────────────────────────→
  requeuer: complete(q,1)    requeuer: INTERRUPTED        requeuer: wake_up_state(q->task)
                             ← interrupt window: 1-10μs →
```

However, when the interrupt lands the dead stack frame still contains the **original valid** `q->task` value `current`, set by `__futex_queue` when the waiter first enqueued. If the requeuer reads that `wake_up_state` just wakes the waiter again.

To actually do something useful, the waiter needs to overwrite its own dead stack frame before the requeuer reads it. The waiter returns from the syscall and comes back to userspace and immediately starts spraying for objects, if the spray succeeds it we land on `task_struct*` at the old `q->task` offset before the requeuer’s interrupt handler return you win (this was proven by Lu NDSS 2017).

The insight is that kernel stack data persists after a syscall returns the next syscall on the same thread reuses the same physical stack pages. By profiling which syscalls write user controlled data at which stack depths, you build a map of what you can control. Lu’s success said 91% coverage of the top 1KB with the right syscall selection, actual numbers can vary depending on the model you work on.

Do remember, you still need an infoleak.

* * *

## try_to_wake_up internals

`wake_up_state` calls `try_to_wake_up(p, TASK_NORMAL, 0)` where `p` is now your fake pointer. Here’s what the kernel does with it (from `kernel/sched/core.c`):

```cpp
int try_to_wake_up(struct task_struct *p, unsigned int state, int wake_flags)
{
	guard(preempt)();
	int cpu, success = 0;

	if (p == current) {
		...
	}

	scoped_guard (raw_spinlock_irqsave, &p->pi_lock) {
		smp_mb__after_spinlock();
		if (!ttwu_state_match(p, state, &success))
			break;

		smp_rmb();
		if (READ_ONCE(p->on_rq) && ttwu_runnable(p, wake_flags))
			break;

		WRITE_ONCE(p->__state, TASK_WAKING);

		smp_cond_load_acquire(&p->on_cpu, !VAL);

		cpu = select_task_rq(p, p->wake_cpu, wake_flags | WF_TTWU);
		...
		ttwu_queue(p, cpu, wake_flags);
	}  // ← scoped_guard: raw_spin_unlock_irqrestore(&p->pi_lock)
	...
}
```

What is interesting here is something I watched being committed but never used, the kernel finally has a somewhat close ability to scope lifetime of objects, `scoped_guard` is a lock guard introduced by Peter Zijlstra in kernel in 2023. It uses gcc’s `__attribute__((cleanup))` to automatically release a lock when execution leaves the block, just like RAII in C++:’) who would have thought such things exist in the kernel. For `raw_spinlock_irqsave` it expands to:

```
// defined in include/linux/spinlock.h
DEFINE_LOCK_GUARD_1(raw_spinlock_irqsave, raw_spinlock_t,
		    raw_spin_lock_irqsave(_T->lock, _T->flags),
		    raw_spin_unlock_irqrestore(_T->lock, _T->flags),
		    unsigned long flags)
```

So `scoped_guard(raw_spinlock_irqsave, &p->pi_lock)` calls `raw_spin_lock_irqsave(&p->pi_lock)` at entry, and `raw_spin_unlock_irqrestore(&p->pi_lock)` at every exit. The unlock itself boils down to `queued_spin_unlock`:

```
// include/asm-generic/qspinlock.h
static __always_inline void queued_spin_unlock(struct qspinlock *lock)
{
	smp_store_release(&lock->locked, 0);
}
```

Let’s go back to our primitive, `p` is under our control, `p->pi_lock` must be zero at entry or `raw_spin_lock` spins forever. `ttwu_state_match` calls `__task_state_match`:

```cpp
// kernel/sched/core.c
int __task_state_match(struct task_struct *p, unsigned int state)
{
	if (READ_ONCE(p->__state) & state)
		return 1;

	if (READ_ONCE(p->saved_state) & state)
		return -1;

	return 0;
}
```

`state` is `TASK_NORMAL` which is `TASK_INTERRUPTIBLE | TASK_UNINTERRUPTIBLE` (0x3). So `p->__state` must have bit 0x1 or 0x2 set. If not, the match fails, the scoped_guard breaks out early, fires the unlock, and `raw_spin_unlock_irqrestore` writes zero to `p->pi_lock->locked`.

If both gates pass, the deeper path writes `TASK_WAKING` (0x200) to `p->__state`, reads `on_cpu`, `wake_cpu`, calls `ttwu_queue` which eventually calls `ttwu_do_wakeup` writing `TASK_RUNNING` (0) to `p->__state`.

Eventually, `scoped_guard` exits and performs the unlock atomically with `smp_store_release`. Unlike `mutex_unlock` which is not atomic, spinlocks are atomic, providing us just a write, the careful reader would notice that the real primitive is not in the unlock itself, but what happens before it. If both gates pass, the deeper path reaches `ttwu_queue` → `ttwu_do_activate` → `activate_task` → `enqueue_task`:

```cpp
// kernel/sched/core.c
static inline void enqueue_task(struct rq *rq, struct task_struct *p, int flags)
{
	...
	p->sched_class->enqueue_task(rq, p, flags);
}
```

With `p->sched_class` pointing at the real `fair_sched_class` (address known from KASLR), this calls `enqueue_task_fair`. Inside, `se = &p->se` is our embedded sched_entity, and `cfs_rq = se->cfs_rq` is a pointer we control:

```javascript
// kernel/sched/fair.c
enqueue_task_fair(struct rq *rq, struct task_struct *p, int flags)
{
	struct sched_entity *se = &p->se;
	...
	for_each_sched_entity(se) {
		cfs_rq = cfs_rq_of(se);           // returns se->cfs_rq
		enqueue_entity(cfs_rq, se, flags);
		...
	}
}
```

`enqueue_entity` calls `account_entity_enqueue`:

```rust
// kernel/sched/fair.c
account_entity_enqueue(struct cfs_rq *cfs_rq, struct sched_entity *se)
{
	update_load_add(&cfs_rq->load, se->load.weight);
	...
	cfs_rq->nr_running++;
}

static inline void update_load_add(struct load_weight *lw, unsigned long inc)
{
	lw->weight += inc;
	lw->inv_weight = 0;
}
```

`cfs_rq->load.weight += se->load.weight` — an 8-byte controlled addition through a pointer we control, with a value (`se->load.weight`) we fully control in our sprayed fake `task_struct`.

I did not turn this primitive into an arbitrary read / write primitives, I only got far as to getting the write, but I believe that with the right effort it is doable, but I might be wrong as I’m just a pleb.

* * *

## The fix

```rust
 void requeue_pi_wake_futex(struct futex_q *q, union futex_key *key,
                            struct futex_hash_bucket *hb)
 {
+    struct task_struct *task;
+
     q->key = *key;
     __futex_unqueue(q);
     WARN_ON(!q->rt_waiter);
     q->rt_waiter = NULL;
     q->lock_ptr = &hb->lock;
+    task = READ_ONCE(q->task);

     futex_requeue_pi_complete(q, 1);
-    wake_up_state(q->task, TASK_NORMAL);
+    wake_up_state(task, TASK_NORMAL);
 }
```

The fix is pretty simple but requires deep understanding to spot it, the `READ_ONCE` prevents the kernel from reading `q` after the syscall returned.

* * *

## Conclusions

This is an unusual bug because it works on stack frames rather than heap objects, we don’t see those often, if at all. Nobody calls `kfree`. The waiter just returns from a function and the data ceases to be meaningful, the alloc was a local variable the “free” was a `ret` instruction:’) You can’t spray a live thread’s kernel stack the way you spray a slab freelist, you have to wait for the function to return and then immediately spike the kernel with a syscall that writes controlled data at the right depth.

The race itself is one instruction which makes it non-trivial to exploit and trigger, however with careful planning it is doable. The only issue that remains is an infoleak, which I do not think is possible to achieve with this bug, that is up to the user to achieve one.

I found this bug pretty interesting and insightful, I hope you would too.
