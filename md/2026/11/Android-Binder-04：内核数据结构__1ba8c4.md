---
title: Android Binder 04：内核数据结构
source: https://akjoson.github.io/2026/11/11/04-%E5%86%85%E6%A0%B8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/
source_host: akjoson.github.io
clip_date: 2026-11-27T10:52:02+08:00
trace_id: 26f0c552-f2e0-436d-93ad-e525e5e0ebb1
content_hash: 21553a58aec33f658a14ed25d90139de38177c925b6f998f2752925d91a7845a
status: synced
tags: []
series: null
feed_source: 殷仔·Android Binder
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 42575244-d011-8181-9252-fe946ae91a16
ioc: null
---

> **Android Binder 消息流转全解**
> 
> [导读 消息流转全解：系列导读](https://akjoson.github.io/2026/11/11/00-android-binder%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC%E5%85%A8%E8%A7%A3/) · [01 架构总览](https://akjoson.github.io/2026/11/11/01-%E6%9E%B6%E6%9E%84%E6%80%BB%E8%A7%88/) · [02 消息封装](https://akjoson.github.io/2026/11/11/02-%E6%B6%88%E6%81%AF%E5%B0%81%E8%A3%85/) · [03 RPC 原理](https://akjoson.github.io/2026/11/11/03-rpc%E5%8E%9F%E7%90%86/) · [04 内核数据结构](https://akjoson.github.io/2026/11/11/04-%E5%86%85%E6%A0%B8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/) · [05 完整消息流转](https://akjoson.github.io/2026/11/11/05-%E5%AE%8C%E6%95%B4%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC/) · [06 进阶专题](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) · [07 源码索引与调试](https://akjoson.github.io/2026/11/11/07-%E6%BA%90%E7%A0%81%E7%B4%A2%E5%BC%95%E4%B8%8E%E8%B0%83%E8%AF%95/)

这一章回答： **当内核收到 `BC_TRANSACTION` 时，它是靠什么数据结构找到目标进程、找到目标对象、把数据送过去的？**

内核里只有 5 个核心结构体：

| 结构体 | 数量级 | 一句话 |
| --- | --- | --- |
| `binder_proc` | 每个使用 Binder 的 **进程** 一个 | 「这个进程是谁，它有哪些线程/对象/引用」 |
| `binder_thread` | 每个参与 Binder 的 **线程** 一个 | 「这个线程在等什么/有什么待办」 |
| `binder_node` | 每个 **服务端对象** 一个 | 「这个对象的实现在哪个进程的哪个地址」 |
| `binder_ref` | 每个 **跨进程引用** 一个 | 「某个进程用句柄 N 指向某个 node」 |
| `binder_buffer` | 每个 **进行中的事务** 一个 | 「这次事务的数据放在哪」 |

* * *

## 1\. 整体关系图

**先记住这张图，后面每个结构体都是它的一个角**：

![1\. 整体关系图（图 1）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/40bbee1e353f4b5a.png)

**核心关系**：

```
binder_ref.proc      → 谁持有这个引用（Client 进程）
binder_ref.node      → 引用的是哪个对象
binder_ref.desc      → Client 进程看到的句柄号
binder_node.proc     → 对象实现在哪个进程（Server 进程）
binder_node.ptr      → 对象在 Server 进程的用户态地址
binder_node.cookie   → 对象的"私有数据"（BBinder 自身或 JavaBBinderHolder 地址）
```

* * *

## 2\. binder_proc：一个进程的 Binder 状态

```c
/* drivers/android/binder.c */
struct binder_proc {
	struct hlist_node proc_node;        /* 挂到全局 binder_procs 链表 */
	struct rb_root threads;             /* 本进程所有 binder_thread，key = pid */
	struct rb_root nodes;               /* 本进程"拥有"的所有 binder_node，key = ptr */
	struct rb_root refs_by_desc;        /* 本进程持有的 binder_ref，key = desc(句柄) */
	struct rb_root refs_by_node;        /* 同一批 ref，key = node 指针 */

	struct list_head waiting_threads;   /* 空闲等待任务的线程 (LRU) */
	int pid;
	struct task_struct *tsk;
	const struct cred *cred;
	struct hlist_node deferred_work_node;
	int deferred_work;
	bool is_dead;                       /* 进程是否已死 */

	struct list_head todo;              /* 进程级待处理工作队列 */
	struct binder_stats stats;
	struct list_head delivered_death;   /* 待处理的死亡通知 */
	int max_threads;                    /* Binder 线程池上限，默认 15 */
	int requested_threads;              /* 已请求但还没起来的线程数 */
	int requested_threads_started;
	int tmp_ref;
	long default_priority;
	struct dentry *debugfs_entry;
	struct binder_alloc alloc;          /* ★ 缓冲区分配器（每个进程一份） */
	struct binder_context *context;     /* 指向 binder 域（binder/hwbinder/vndbinder） */
	spinlock_t inner_lock;
	spinlock_t outer_lock;
	struct dentry *proc_log_dir;        /* 事务日志（debugfs） */
};
```

**为什么 `binder_proc` 是核心？** 因为它把「进程」和「Binder 资源」绑定了：

-   `nodes` = 这个进程 **提供的** 服务
-   `refs_by_desc` = 这个进程 **引用的** 服务
-   `alloc` = 这个进程的 Binder 缓冲区（**关键**：是 **接收方** 的缓冲区）

全局链表 `static HLIST_HEAD(binder_procs);` 保存所有 `binder_proc` 。

* * *

## 3\. binder_thread：一个线程的 Binder 状态

```c
struct binder_thread {
	struct binder_proc *proc;
	struct rb_node rb_node;                 /* 在 proc->threads 里的节点 */
	struct list_head waiting_thread_node;   /* 在 proc->waiting_threads 里的节点 */
	int pid;
	int looper;              /* 见下面 looper 状态机 */
	bool looper_need_return;
	struct binder_transaction *transaction_stack;  /* ★ 事务栈 */
	struct list_head todo;                  /* ★ 线程级待办队列 */
	u32 return_error;
	u32 return_protocol;
	struct binder_stats stats;
};
```

### looper 状态机

![looper 状态机（图 2）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/612bf4036ac38412.png)

| 常量  | 值   | 含义  |
| --- | --- | --- |
| `BINDER_LOOPER_STATE_REGISTERED` | 0x01 | 线程池注册线程 |
| `BINDER_LOOPER_STATE_ENTERED` | 0x02 | 已进入主循环 |
| `BINDER_LOOPER_STATE_EXITED` | 0x04 | 已退出 |
| `BINDER_LOOPER_STATE_INVALID` | 0x08 | 状态非法 |
| `BINDER_LOOPER_STATE_WAITING` | 0x10 | 正在等待工作 |

### transaction_stack：处理嵌套调用的关键

当线程 T 正在处理一个事务，而这个事务里又发起了一次 **同步调用** 时，内核需要记录「我在为谁干活」。这就是 `transaction_stack` ：

```
T 处理事务 X（来自 A）→ 又调 B → 阻塞
    transaction_stack: X → (T 等 B 的回复)

B 反过来回调 T → 内核从栈中找到 X 的 context，允许嵌套
```

**规则**：同步调用可以 **嵌套** （栈式），但不能形成环（A→B→A 用同一个线程会死锁，需要靠 `BR_SPAWN_LOOPER` 开新线程）。

* * *

## 4\. binder_node：服务端对象在内核里的「户口」

```c
struct binder_node {
	int debug_id;
	struct binder_work work;
	union {
		struct rb_node rb_node;     /* 活着时：挂在 proc->nodes */
		struct hlist_node dead_node;/* 死了时：挂在全局 binder_dead_nodes */
	};
	struct binder_proc *proc;       /* ★ 拥有这个对象的进程 */
	struct hlist_head refs;         /* 所有指向它的 binder_ref 链表 */

	int internal_strong_refs;       /* 有强引用指向它的 ref 数量(内核自己维护) */
	int local_weak_refs;            /* 用户态自己发的弱引用 (BC_INCREFS) */
	int local_strong_refs;          /* 用户态自己发的强引用 (BC_ACQUIRE) */
	int tmp_refs;

	binder_uintptr_t ptr;           /* ★ 对象在 proc 里的用户态地址 (BBinder*) */
	binder_uintptr_t cookie;        /* ★ 对象的附加信息 (JavaBBinderHolder* / this) */

	struct {
		uint8_t has_strong_ref : 1;
		uint8_t pending_strong_ref : 1;
		uint8_t has_weak_ref : 1;
		uint8_t pending_weak_ref : 1;
	};
	/* 版本不同字段不同 */
	int min_priority;
	bool accept_fds;
	bool oneway_spam_detected;

	int has_async_transaction;      /* ★ 是否已有 oneway 事务在排队 */
	struct list_head async_todo;    /* ★ oneway 事务的排队区 */
};
```

### ptr 和 cookie 的区别（容易搞混）

|     | `ptr` | `cookie` |
| --- | --- | --- |
| 用户态对应 | `BBinder*` （对象地址） | `JavaBBinderHolder*` 或 `this` |
| 用途  | 内核用它做 **去重**：同一个地址只建一个 node | 内核原样存着，创建事务时回传给用户态 |
| 用户态怎么用 cookie | —   | `BBinder::onTransact` 里 `IBinder::getCookie()` ，用于 `JavaBBinder` 找回 Java 对象 |

对于 Java 对象：

```
Java:  MyServiceImpl extends IMyService.Stub extends android.os.Binder
   ↓ JNI 创建
Native: JavaBBinderHolder  ←──────────── cookie 指向这里
             └─ JavaBBinder : BBinder  ←── ptr 指向这里（的 weakref）
                   └─ jobject mObject  ←─ 真正的 Java Binder 实例
```

* * *

## 5\. binder_ref：客户端进程对某个对象的「引用记录」

```c
struct binder_ref {
	int debug_id;
	struct binder_work work;
	struct rb_node rb_node_desc;    /* 挂在 proc->refs_by_desc，key = desc */
	struct rb_node rb_node_node;    /* 挂在 proc->refs_by_node，key = node */
	struct hlist_node node_entry;   /* 挂在 node->refs */
	struct binder_proc *proc;       /* ★ 引用持有者 (Client) */
	struct binder_node *node;       /* ★ 被引用的对象 */
	u32 desc;                       /* ★ 句柄号 */
	struct binder_ref_data data;    /* { int strong; int weak; } 引用计数 */
	/* ... */
};
```

**`desc` 就是客户端看到的 handle。** 一个 `binder_ref` 同时挂在两棵红黑树上（ `refs_by_desc` 和 `refs_by_node` ），因为内核需要 **双向查找**：

-   收到 `BC_TRANSACTION` 带 handle → 查 `refs_by_desc` （O(log n)）
-   收到一个 node，要检查「这个进程是否已经有引用」→ 查 `refs_by_node`

* * *

## 6\. binder_buffer 与 binder_alloc：内存模型

### 6.1 binder_buffer

```c
/* drivers/android/binder_alloc.h */
struct binder_buffer {
	struct list_head entry;    /* 按地址序挂在 alloc->buffers */
	struct rb_node rb_node;    /* 空闲时挂在 alloc->free_buffers（按大小） */
	unsigned free:1;
	unsigned clear_on_free:1;
	unsigned allow_user_free:1;   /* 是否允许用户态 BC_FREE_BUFFER 回收 */
	unsigned async_transaction:1;
	unsigned oneway_spam_suspect:1;
	unsigned debug_id:27;

	struct binder_transaction *transaction;  /* 属于哪次事务 */
	struct binder_node *target_node;
	size_t data_size;
	size_t offsets_size;
	size_t extra_buffers_size;
	void __user *user_data;    /* ★ 这块内存在目标进程用户态里的地址 */
};
```

### 6.2 binder_alloc：每个进程一个

```c
struct binder_alloc {
	struct mutex mutex;
	struct vm_area_struct *vma;      /* 用户态 mmap 的 vma */
	struct mm_struct *vma_vm_mm;
	struct list_head buffers;        /* 所有 buffer，按地址 */
	struct rb_root free_buffers;     /* 空闲区域，按大小 */
	struct rb_root allocated_buffers;
	size_t free_async_space;         /* oneway 事务可用的剩余空间（一半） */
	struct binder_lru_page *pages;   /* ★ 物理页（延迟映射 + LRU 回收） */
	size_t buffer_size;              /* 通常 1MB - 8KB */
	uint32_t buffer_free;
	int pid;
};
```

### 6.3 内存映射：Binder 的「一次拷贝」是怎么实现的

这是 Binder 性能优势的根本。

#### 第一步：进程启动时 mmap 一块缓冲区

`ProcessState` 构造时：

```cpp
// frameworks/native/libs/binder/ProcessState.cpp
#define BINDER_VM_SIZE ((1 * 1024 * 1024) - sysconf(_SC_PAGE_SIZE) * 2)
//                                         ↑ 1MB - 8KB = 1016KB

ProcessState::ProcessState(const char *driver)
{
    mDriverFD = open(driver, O_RDWR | O_CLOEXEC);
    // ...
    mVMStart = mmap(nullptr, BINDER_VM_SIZE, PROT_READ,
                    MAP_PRIVATE | MAP_NORESERVE, mDriverFD, 0);
    if (mVMStart == MAP_FAILED) { /* 失败 */ }
}
```

注意 `PROT_READ` —— **用户态对这块内存只读**！数据是内核写进去的。

> 因为 `mmap` 的对象是 `/dev/binder` ，走的不是普通文件的 page cache，而是 Binder 驱动自己的 `binder_mmap()` 。

#### 第二步：内核把这块内存的物理页同时映射到「内核虚拟地址」

`binder_mmap()` → `binder_alloc_mmap_handler()` ：

```c
int binder_alloc_mmap_handler(struct binder_alloc *alloc, struct vm_area_struct *vma)
{
	struct binder_buffer *buffer;

	mutex_lock(&binder_alloc_mmap_lock);
	if (alloc->buffer_size) { /* 已经 mmap 过了，一个进程只能一次 */ }
	alloc->buffer_size = size;
	mutex_unlock(&binder_alloc_mmap_lock);

	/* 构造一个覆盖整个区域的"初始空闲 buffer" */
	atomic_set(&alloc->buffer_free, 1);
	buffer = kzalloc(sizeof(*buffer), GFP_KERNEL);
	...
	alloc->buffer = (void __user *)vma->vm_start;   /* 记住用户态起始地址 */
	alloc->user_buffer_offset = vma->vm_start - (uintptr_t)alloc->buffer;  /* 老版本 */
	...
	list_add(&buffer->entry, &alloc->buffers);
	buffer->free = 1;
	binder_insert_free_buffer(alloc, buffer);
	...
}
```

**关键概念**：这段内存被映射了两次 ——

-   一次在 **用户进程的地址空间** （ `vma->vm_start` ， `PROT_READ` ）
-   一次在 **内核可以访问的地方** （ `alloc->buffer` 或通过 `kmap` 每个物理页）

> 新内核（4.14+）改成 `binder_lru_page` 数组，只在需要时 `kmap` 单个物理页，并且支持延迟分配和 LRU 回收，但「同一批物理页同时可被内核和用户态访问」这个本质没变。

#### 第三步：发送时，内核把数据从「发送方用户空间」拷到「接收方缓冲区」

这才是「一次拷贝」的那一次：

```c
// drivers/android/binder.c — binder_transaction()
	t->buffer = binder_alloc_new_buf(&target_proc->alloc,   /* ★ 注意是 target_proc！ */
	                                  tr->data_size, tr->offsets_size,
	                                  extra_buffers_size,
	                                  !reply && (t->flags & TF_ONE_WAY));
	...
	buffer = t->buffer;

	/* 从"发送方"的用户态地址，拷到"接收方"的 buffer 里 */
	if (binder_alloc_copy_user_to_buffer(
				&target_proc->alloc,
				t->buffer,
				ALIGN(secctx_sz, sizeof(u64)),
				(const void __user *)(uintptr_t)tr->data.ptr.buffer,
				tr->data_size)) {
		/* 失败 */
	}
```

于是：

![第三步：发送时，内核把数据从「发送方用户空间」拷到「接收方缓冲区」（图 3）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c86f682a35300dae.png)

**所以「一次拷贝」的准确含义是**：

-   发送方用户态 → 接收方 Binder 缓冲区： **1 次** （在内核里完成）
-   接收方读数据： **0 次** （直接读自己 mmap 的那块内存）

对比 Socket： `send()` 拷到内核 socket buffer（1 次）， `recv()` 再拷到用户态（2 次）。Binder 省掉了第二次。

#### 第四步：接收方用完后归还

接收方处理完事务，发 `BC_FREE_BUFFER` ：

```cpp
// IPCThreadState::freeBuffer()
status_t IPCThreadState::freeBuffer(Parcel* parcel, const uint8_t* data,
        size_t dataSize, const binder_size_t* objects, size_t objectsSize,
        void* cookie)
{
    mOut.writeInt32(BC_FREE_BUFFER);
    mOut.writePointer((uintptr_t)data);
    // ...
}
```

内核 `binder_free_buf()` 把它标记为空闲，重新挂回 `free_buffers` 红黑树（如果 `allow_user_free` 允许的话）。

### 6.4 为什么大小是 1MB - 8KB？

```c
#define BINDER_VM_SIZE ((1 * 1024 * 1024) - sysconf(_SC_PAGE_SIZE) * 2)
```

-   1MB 是 **每个进程** 的 Binder 缓冲区上限。这是 `Parcel` 不能超过 1MB 的根本原因（实际单个事务还有更小的限制，见 [`06-进阶专题.md`](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) ）。
-   减 8KB 是给内核的其他映射留一点空间（早期是 `- sysconf(_SC_PAGE_SIZE) * 2` ，即 2 个页）。
-   **oneway 事务只能用到这个空间的一半** （ `free_async_space = buffer_size / 2` ），防止异步事务把同步事务饿死。

* * *

## 7\. 引用计数：三种 strong / 两种 weak

`binder_node` 上有三个计数，很多人会看晕，逐个解释：

| 字段  | 含义  | 谁来改 |
| --- | --- | --- |
| `internal_strong_refs` | 有 **强引用句柄** 指向该 node 的数量（跨进程的） | 内核在创建/删除 `binder_ref` 时改 |
| `local_strong_refs` | 对象 **拥有者进程自己** 对它的强引用（ `BC_ACQUIRE` ） | 用户态（ `BpBinder::incStrongHandle` 之类） |
| `local_weak_refs` | 对象 **拥有者进程自己** 对它的弱引用（ `BC_INCREFS` ） | 用户态 |

`binder_ref.data` 上：

```c
struct binder_ref_data {
	int debug_id;
	uint32_t desc;
	int strong;    /* 强引用计数 */
	int weak;      /* 弱引用计数 */
};
```

**核心规则**：

1.  **有强引用 → node 必须活着。**
2.  **只有弱引用 → node 可以「半死」**：内核通过 `BR_RELEASE` / `BR_DECREFS` 通知拥有者「没人用你了，可以释放对象了」，但保留 node 结构以便复活。
3.  **一个进程内，同一个 node 的所有引用共用一个 `binder_ref`** （内核按 `node` 去重），所以 `ref->data.strong` 是该进程内所有 `BpBinder` 的强引用总数。

用户态发命令的对应关系（ `libbinder` ）：

```cpp
// BpBinder.cpp
void BpBinder::incStrongHandle(int32_t handle, ...) {
    // 发 BC_ACQUIRE
}
void BpBinder::decStrongHandle(int32_t handle) {
    // 发 BC_RELEASE
}
void BpBinder::incWeakHandle(int32_t handle, ...) {
    // 发 BC_INCREFS
}
void BpBinder::decWeakHandle(int32_t handle) {
    // 发 BC_DECREFS
}
```

内核要反过来要求拥有者建引用时，发 `BR_INCREFS` / `BR_ACQUIRE` ：

```
Client 创建对 node 的强引用
   → 内核：node.internal_strong_refs++
   → 如果这是第一个强引用，内核给 node 的拥有者进程发 BR_ACQUIRE
   → 拥有者进程收到后，对本地 BBinder 调 incStrong()（真正持有）
```

这个「反向通知」机制保证了 **跨进程引用能正确映射到本地的强/弱引用**，从而正确处理「客户端不释放 → 服务端对象不能销毁」。

* * *

## 8\. 内核入口：从 ioctl 到事务投递的完整函数链

![8\. 内核入口：从 ioctl 到事务投递的完整函数链（图 4）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/214c3a9c54a61466.png)

### binder_thread_read 如何挑选待办

```c
static int binder_thread_read(struct binder_proc *proc,
                              struct binder_thread *thread, ...)
{
	/* 优先看自己的 todo，再看进程的 todo */
	while (1) {
		if (list_empty(&thread->todo)) {
			/* 线程自己没事干，帮忙处理进程级的 */
			...
		}
		...
		w = binder_dequeue_work_head_ilocked(list);
		switch (w->type) {
		case BINDER_WORK_TRANSACTION:      → BR_TRANSACTION
		case BINDER_WORK_TRANSACTION_COMPLETE: → BR_TRANSACTION_COMPLETE
		case BINDER_WORK_NODE:             → BR_INCREFS/ACQUIRE/RELEASE/DECREFS
		case BINDER_WORK_DEAD_BINDER:      → BR_DEAD_BINDER
		case BINDER_WORK_CLEAR_DEATH_NOTIFICATION: → BR_CLEAR_DEATH_NOTIFICATION_DONE
		}
	}
}
```

**重要**： `binder_thread_read` 在 **拿不到工作** 时会调用 `binder_wait_for_work()` 阻塞（ `wait_event_interruptible` ），而不是忙等。这就实现了「Binder 线程平时睡眠，有事务才被唤醒」。

* * *

## 9\. 三种查找路径（面试常问）

| 场景  | 内核怎么找 |
| --- | --- |
| Client 发 `BC_TRANSACTION` ，带 `handle=42` | `proc->refs_by_desc` 红黑树查 `desc==42` → `binder_ref` → `ref->node` |
| 要把 Binder 对象传给对端， `flat_binder_object` 带 `ptr=0x7f00a000` | 在 **发送方** `proc->nodes` 里查 `ptr` → `binder_node` ；没有就创建 |
| 要为目标进程建引用 | 在 `target_proc->refs_by_node` 里查 `node` → 有就复用（句柄不变），没有就分配新 `desc` |

**三个红黑树的用途**：

-   `proc->nodes` ：按 `node->ptr` 排序，用于 **同一进程内对象的去重**
-   `proc->refs_by_desc` ：按 `desc` 排序，用于 **按句柄查引用**
-   `proc->refs_by_node` ：按 `node` 排序，用于\*\*检查是否已有引用（避免重复建）

* * *

## 10\. debugfs：直接观察这些结构体

Binder 驱动在 debugfs 里暴露了所有内部状态（需要 root）：

```bash
# 列出所有 binder 进程及其 pid/debug_id
cat /sys/kernel/debug/binder/proc

# 看某个进程的详细状态：线程、节点、引用、缓冲区
cat /sys/kernel/debug/binder/proc/<pid>

# 看全局统计
cat /sys/kernel/debug/binder/stats

# 看所有事务
cat /sys/kernel/debug/binder/transactions

# 看所有 node
cat /sys/kernel/debug/binder/nodes
```

`/sys/kernel/debug/binder/proc/<pid>` 的典型输出：

```yaml
binder proc state:
proc 12345
thread 12345: l 12 need_return 0 tr 0
thread 12350: l 11 need_return 0 tr 0
  incoming transaction 123456: 12300 from 11111
  buffer 123457: 12300 from 11111
node 123458: u0000007f00a000 c0000007f00b000 hs 1 hw 1 ls 0 lw 0 is 1 iw 1
  ref 123459: desc 42 s 1 w 1 death 0000000000000000
```

对应关系：

-   `node ... u<ptr> c<cookie> hs/hw/ls/lw/is/iw` = 各种强/弱引用计数
-   `ref ... desc 42 s 1 w 1` = 句柄 42，强引用 1 个、弱引用 1 个

* * *

## 11\. 小结

![11\. 小结（图 5）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1ebd66f4a29a8cd7.png)

**记住三条**：

1.  **`binder_ref.desc` 就是客户端看到的 handle**，它属于 **客户端进程**。
2.  **缓冲区分配在接收方进程（ `target_proc->alloc` ）**，这是「一次拷贝」的关键。
3.  **所有查找都靠红黑树**： `nodes` （按地址）、 `refs_by_desc` （按句柄）、 `refs_by_node` （按 node）。

* * *

下一章： [`05-完整消息流转.md`](https://akjoson.github.io/2026/11/11/05-%E5%AE%8C%E6%95%B4%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC/) —— 把前面所有零件拼成一次完整的端到端调用。

* * *

通过Claude生成。
