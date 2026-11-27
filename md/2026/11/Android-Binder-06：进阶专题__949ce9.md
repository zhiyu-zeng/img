---
title: Android Binder 06：进阶专题
source: https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/
source_host: akjoson.github.io
clip_date: 2026-11-27T10:55:03+08:00
trace_id: a9178643-c464-471f-97e6-c02fd5483d35
content_hash: 8b211fb573ed200c8f8ebd55d7913df05520671a585bf9f31917ad159a1baf3a
status: synced
tags: []
series: null
feed_source: 殷仔·Android Binder
ai_summary: null
ai_summary_style: null
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 42575244-d011-811c-8986-fff008d333eb
ioc: null
---

> **Android Binder 消息流转全解**
> 
> [导读 消息流转全解：系列导读](https://akjoson.github.io/2026/11/11/00-android-binder%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC%E5%85%A8%E8%A7%A3/) · [01 架构总览](https://akjoson.github.io/2026/11/11/01-%E6%9E%B6%E6%9E%84%E6%80%BB%E8%A7%88/) · [02 消息封装](https://akjoson.github.io/2026/11/11/02-%E6%B6%88%E6%81%AF%E5%B0%81%E8%A3%85/) · [03 RPC 原理](https://akjoson.github.io/2026/11/11/03-rpc%E5%8E%9F%E7%90%86/) · [04 内核数据结构](https://akjoson.github.io/2026/11/11/04-%E5%86%85%E6%A0%B8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/) · [05 完整消息流转](https://akjoson.github.io/2026/11/11/05-%E5%AE%8C%E6%95%B4%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC/) · [06 进阶专题](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) · [07 源码索引与调试](https://akjoson.github.io/2026/11/11/07-%E6%BA%90%E7%A0%81%E7%B4%A2%E5%BC%95%E4%B8%8E%E8%B0%83%E8%AF%95/)

前面五章讲清了主干，这一章补齐容易踩坑和容易被问到的细节。

* * *

## 1\. 引用计数与对象生命周期

Binder 的对象生命周期管理是它最复杂也最容易出错的部分。

### 1.1 五个计数

`binder_ref` 上：

```c
struct binder_ref_data {
	int debug_id;
	uint32_t desc;
	int strong;    /* 这个进程内，指向该 node 的强引用数 */
	int weak;      /* 弱引用数 */
};
```

`binder_node` 上：

| 计数  | 含义  |
| --- | --- |
| `internal_strong_refs` | 「有多少个别的进程在用强引用句柄指向我」 |
| `local_strong_refs` | 「我自己的进程里，有多少个强引用（ `BC_ACQUIRE` 发出来的）」 |
| `local_weak_refs` | 「我自己的进程里，有多少个弱引用（ `BC_INCREFS` 发出来的）」 |

### 1.2 强引用 vs 弱引用

|     | 强引用（strong） | 弱引用（weak） |
| --- | --- | --- |
| Java | `BinderProxy` 被普通持有 | `Parcel.writeWeakBinder` |
| native | `sp<IBinder>` / `BpBinder::incStrongHandle` | `wp<IBinder>` / `BpBinder::incWeakHandle` |
| 内核命令 | `BC_ACQUIRE` / `BC_RELEASE` | `BC_INCREFS` / `BC_DECREFS` |
| 语义  | 保证对象 **不被销毁** | 只保证「能查询到它是否还活着」 |

**规则**：有强引用 → node 一定存活；只有弱引用 → node 可能「半死」（对象已释放，但 node 结构还在，可以被「复活」）。

### 1.3 反向通知：BR_ACQUIRE / BR_RELEASE

这是很多人困惑的地方。假设 Client 拿到了 Server 对象的句柄：

![1.3 反向通知：BR\_ACQUIRE / BR\_RELEASE（图 1）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/975a744ca70482ad.png)

**为什么需要这个反向通知？** 因为跨进程的引用必须映射到 **本地的强/弱引用**。只有 Server 进程自己知道它的 `BBinder` 是不是还能被释放。这个机制让「C++ 的 `sp<>` / `wp<>` 引用计数」和「跨进程引用」保持了一致。

### 1.4 对象死亡的两个层次

| 层次  | 含义  | 触发条件 |
| --- | --- | --- |
| **对象死亡** | `binder_node` 被释放，但 `binder_ref` 还在（变成「dead ref」） | 拥有者进程释放了对象（所有引用都没了） |
| **进程死亡** | 整个 `binder_proc` 被销毁，所有 node 和 ref 都失效 | 进程退出 |

对 Client 来说：

-   **对象死亡** → 后续调用返回 `DEAD_OBJECT` 或 `UNKNOWN_TRANSACTION`
-   **进程死亡** → 触发死亡通知（见第 2 节）

* * *

## 2\. 死亡通知（Death Notification）

**用途**：当服务进程挂了，客户端要知道，以便清理资源 / 重连。

### 2.1 时序

![2.1 时序（图 2）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/34584b0a5c6fefac.png)

### 2.2 内核里的数据结构

```c
struct binder_ref_death {
	struct binder_work work;
	binder_uintptr_t cookie;    /* 用户态传进来的标识（native 里是 BpBinder*） */
};
```

挂在 `binder_ref.death` 上。

### 2.3 native 侧代码

```cpp
// frameworks/native/libs/binder/BpBinder.cpp
status_t BpBinder::linkToDeath(const sp<DeathRecipient>& recipient,
                               void* cookie, uint32_t flags)
{
    AutoMutex _l(mLock);

    Obituary ob;
    ob.recipient = recipient;
    ob.cookie = cookie;
    ob.flags = flags;
    mObituaries.push_back(ob);

    if (mAlive && !mObituaries.empty()) {
        /* ★ 通知内核 */
        status_t status = IPCThreadState::self()->requestDeathNotification(mHandle, this);
        if (status != NO_ERROR) {
            mObituaries.pop_back();
        }
        return status;
    }
    return NO_ERROR;
}

void BpBinder::sendObituary()
{
    AutoMutex _l(mLock);
    mAlive = 0;
    if (mObituaries.empty()) return;
    for (auto& obituary : mObituaries) {
        sp<DeathRecipient> recipient = obituary.recipient.promote();
        if (recipient != nullptr) {
            recipient->binderDied(wp<IBinder>::fromExisting(this));
        }
    }
    mObituaries.clear();
}
```

`IPCThreadState::executeCommand` 里：

```cpp
    case BR_DEAD_BINDER: {
        BpBinder* proxy = (BpBinder*)mIn.readPointer();
        proxy->sendObituary();
        mOut.writeInt32(BC_DEAD_BINDER_DONE);
        mOut.writePointer((uintptr_t)proxy);
    } break;
```

**关键： `binderDied()` 是在 Binder 线程里回调的！** 这意味着：

-   回调里可以做轻量清理， **不能做耗时操作** （会阻塞这个 Binder 线程）。
-   在 Java 里， `BinderProxy.linkToDeath` 的回调也可能不在主线程。

### 2.4 Java 侧代码

```java
// 客户端
IBinder.DeathRecipient recipient = new IBinder.DeathRecipient() {
    @Override
    public void binderDied() {
        Log.w(TAG, "service died!");
        // 清理 / 重连
    }
};

try {
    binder.linkToDeath(recipient, 0);
} catch (RemoteException e) {
    // 服务在 linkToDeath 之前就已经死了
}

// 不需要时
binder.unlinkToDeath(recipient, 0);
```

JNI 里用 `JavaDeathRecipient` 包装 Java 的 `DeathRecipient` ：

```cpp
// frameworks/base/core/jni/android_util_Binder.cpp
class JavaDeathRecipient : public IBinder::DeathRecipient {
    jobject mObject;      /* Java 的 DeathRecipient 对象 */
    // ...
    void binderDied(const wp<IBinder>& who) override {
        // 先做 Java 侧的生命周期处理，再回调 DeathRecipient.binderDied()
        ...
    }
};
```

> **Android 11 的优化**：为了减少 native 层死亡通知的数量（每个都占资源），Java 侧的 `BinderProxy` 改成「一个进程只注册一个 native 的死亡接收器」，然后在 Java 层用 `mDeathRecipients` 列表分发。这样 N 个接收器只产生 1 次内核注册。

### 2.5 常见坑

1.  **忘记 `unlinkToDeath`** → `BpBinder` 被 `mObituaries` 里的 `sp<DeathRecipient>` 持有 → 内存泄漏。
2.  **`proxy` 传 `nullptr`** → `binderDied()` 里访问 `proxy` 会 NPE。
3.  **`linkToDeath` 之前服务已经死了** → 抛 `RemoteException` ，必须 `try/catch` 并检查 `isBinderAlive()` 。
4.  **oneway + linkToDeath** → oneway 调用失败不会抛异常，只能靠死亡通知发现。

* * *

## 3\. oneway 的排队机制（深入）

回顾 `binder_proc_transaction` 的 oneway 分支：

```c
	if (oneway) {
		if (node->has_async_transaction) {
			/* ★ 该 node 已有异步事务在处理，排队 */
			binder_enqueue_work_ilocked(&t->work, &node->async_todo);
			t->flags |= TF_UPDATE_TXN? ...
		} else {
			node->has_async_transaction = 1;
			thread = binder_select_thread_ilocked(proc);
			binder_enqueue_thread_work(thread, &t->work);
		}
	}
```

**关键结论**：

| 场景  | 是否有序 |
| --- | --- |
| 同一个 node 上的连续 oneway 事务 | ✅ 串行、有序 |
| 不同 node 上的 oneway 事务 | ❌ 无顺序保证 |
| oneway 和同步调用之间 | ❌ 无顺序保证 |
| 多个线程同时发 oneway 给同一 node | ✅ 在内核排队，仍串行 |

### 3.1 为什么 oneway 只能用一半缓冲区

```c
/* binder_alloc_mmap_handler 或 new_buf 时 */
alloc->free_async_space = alloc->buffer_size / 2;
```

目的是 **防止 oneway 洪水把同步调用的空间全占了**，导致系统服务无法响应。超了会返回 `FAILED_TRANSACTION` 。

### 3.2 "oneway spam"

Android 12+ 引入了 **oneway spam 检测**：如果某个 node 短时间内被大量 oneway 事务淹没，内核会打日志并拒绝一部分。

```c
	if (oneway_spam_detected) {
		binder_user_error("%d:%d got transaction ... oneway spam\n", ...);
	}
```

* * *

## 4\. Binder 线程池

### 4.1 初始化

```cpp
// frameworks/native/libs/binder/ProcessState.cpp
void ProcessState::startThreadPool()
{
    AutoMutex _l(mLock);
    if (!mThreadPoolStarted) {
        mThreadPoolStarted = true;
        spawnPooledThread(true);      /* ★ isMain = true */
    }
}
```

应用进程在 `zygoteInit()` 里调用（ `AndroidRuntime::onZygoteInit()` ）：

```cpp
void AndroidRuntime::onZygoteInit()
{
    sp<ProcessState> proc = ProcessState::self();
    proc->startThreadPool();     /* ★ 每个 app 进程从这里开始有 Binder 线程 */
}
```

`spawnPooledThread(true)` 会 **新建一个线程** （ `PoolThread` ），不是复用主线程：

```cpp
status_t ProcessState::spawnPooledThread(bool isMain)
{
    if (mThreadPoolStarted) {
        char buf[32];
        snprintf(buf, sizeof(buf), "Binder:%d_%d", ...);
        sp<Thread> t = new PoolThread(isMain);
        t->run(buf);      /* 新建线程，名字形如 Binder:1234_1 */
    }
    return NO_ERROR;
}
```

```cpp
// PoolThread 的 threadLoop
bool ProcessState::PoolThread::threadLoop() {
    /* ★ 进入内核循环，永远不返回 */
    IPCThreadState::self()->joinThreadPool(mIsMain);
    return false;
}
```

### 4.2 joinThreadPool：Binder 线程的主循环

```cpp
void IPCThreadState::joinThreadPool(bool isMain)
{
    /* 告诉内核：我是主线程 (BC_ENTER_LOOPER) 还是池线程 (BC_REGISTER_LOOPER) */
    mOut.writeInt32(isMain ? BC_ENTER_LOOPER : BC_REGISTER_LOOPER);

    status_t result;
    do {
        processPendingDerefs();
        /* ★ 核心循环：取一个命令并执行 */
        result = getAndExecuteCommand();
    } while (result != -ECONNREFUSED && result != -EBADF);

    mOut.writeInt32(BC_EXIT_LOOPER);
    talkWithDriver(false);
}
```

`getAndExecuteCommand()` → `talkWithDriver()` → 读到 `BR_*` → `executeCommand()` 。 **这个循环就是 Binder 线程的全部工作**：阻塞在 `ioctl` ，被唤醒、处理、再阻塞。

### 4.3 线程池如何按需扩充：BR_SPAWN_LOOPER

内核发现「有事务但没空闲线程」时，会发起新线程：

```c
/* drivers/android/binder.c — binder_thread_read() */
		if (proc->requested_threads == 0 &&
		    list_empty(&proc->waiting_threads) &&
		    proc->requested_threads_started < proc->max_threads &&
		    (thread->looper & (BINDER_LOOPER_STATE_REGISTERED |
		                       BINDER_LOOPER_STATE_ENTERED))) {
			proc->requested_threads++;
			/*
			 * 在返回流里插入 BR_SPAWN_LOOPER
			 */
			cmd = BR_SPAWN_LOOPER;
		}
```

用户态收到后：

```cpp
    case BR_SPAWN_LOOPER:
        mProcess->spawnPooledThread(false);    /* ★ 新建一个 PoolThread */
        break;
```

![4.3 线程池如何按需扩充：BR\_SPAWN\_LOOPER（图 3）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/278ce09e3770fc0e.png)

### 4.4 线程池上限

```cpp
#define DEFAULT_MAX_BINDER_THREADS 15
```

-   `ProcessState::setThreadPoolMaxThreadCount(n)` → `ioctl(BINDER_SET_MAX_THREADS, &n)`
-   `servicemanager` 显式设为 `0` （它不需要线程池，只用主线程）
-   `system_server` 一般保持默认（15）
-   默认 `15` 之外还有 1 个「主 Binder 线程」，所以实际最多 ~16 个

### 4.5 经典死锁：Binder 线程池耗尽

![4.5 经典死锁：Binder 线程池耗尽（图 4）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fb4b4cda28c4581d.png)

**规律**：只要形成「A 等 B、B 等 A」的循环，且双方线程都被占满，就死锁。

**避免方法**：

-   不要用同步调用形成环（尤其 A→B→A）。
-   耗时操作不要放在 Binder 线程里。
-   必要时用 oneway 打断环。
-   关键服务提高线程池上限。

* * *

## 5\. SELinux 安全上下文（Android 10+）

### 5.1 背景

服务端有时需要知道「调用我的这个进程的 SELinux 域是什么」，用于细粒度权限判断。

**Android 10 之前**：读 `/proc/<pid>/attr/current` 。问题：有 TOCTOU 竞态 —— 你读到 pid 时，进程可能已经 exec 成别的程序了。

**Android 10 起**：内核在创建 `binder_proc` 时缓存 secctx，随事务下发。

### 5.2 数据结构与命令

```c
struct binder_transaction_data_secctx {
	struct binder_transaction_data transaction_data;
	binder_uintptr_t               secctx;    /* "u:r:untrusted_app:s0:c123,c456" */
};
```

新增命令： `BR_TRANSACTION_SEC_CTX` 。

用户态：

```cpp
// IPCThreadState::executeCommand()
case BR_TRANSACTION_SEC_CTX:
case BR_TRANSACTION:
{
    binder_transaction_data_secctx tr_secctx;
    binder_transaction_data& tr = tr_secctx.transaction_data;
    if (cmd == (int) BR_TRANSACTION_SEC_CTX) {
        mIn.read(&tr_secctx, sizeof(tr_secctx));
    } else {
        mIn.read(&tr, sizeof(tr));
        tr_secctx.secctx = 0;
    }
    /* tr_secctx.secctx 指向安全上下文字符串 */
    ...
}
```

### 5.3 native 侧读取

```cpp
// IPCThreadState::getCallingSid()
const char* IPCThreadState::getCallingSid() const {
    return mCallingSid;
}

// Parcel::read 后可以拿到
```

Java 侧： `Binder.getCallingSid()` （Android 10+ 添加，隐藏 API）。

> 相关：Java 侧还有 `Binder.getCallingPid()` / `Binder.getCallingUid()` ，它们读的是 `IPCThreadState` 的 `mCallingPid` / `mCallingUid` ，这两个值由 `BR_TRANSACTION` 里的 `sender_pid` / `sender_euid` **内核填充**，无法伪造。

* * *

## 6\. 文件描述符传递

Binder 可以在事务里传 `fd` （这是它比很多 IPC 强的地方）。

### 6.1 编码

```cpp
Parcel::writeFileDescriptor(int fd, bool takeOwnership)
// 写入 flat_binder_object{ type = BINDER_TYPE_FD, handle = fd }
```

### 6.2 内核翻译

```c
static int binder_translate_fd(u32 fd, ...)
{
	/* ① 从发送方的 fd 表里取出 struct file */
	struct file *file = fget(fd);
	...
	/* ② 在目标进程的 fd 表里安装一个新的 fd */
	target_fd = task_get_unused_fd_flags(target_proc, O_CLOEXEC);
	fd_install(target_fd, file);
	...
}
```

**关键**：fd 是 **被复制** 的，不是「移动」。发送方仍然持有自己的 fd。

### 6.3 Java 侧的 fd

Java 层用 `ParcelFileDescriptor` ：

```java
// 发送
ParcelFileDescriptor pfd = ParcelFileDescriptor.fromFd(fd);
parcel.writeFileDescriptor(pfd.getFileDescriptor());

// 接收
ParcelFileDescriptor received = parcel.readFileDescriptor();
```

底层会用到 `BINDER_TYPE_FDA` （fd 数组）批量传 fd。

### 6.4 权限

发送方需要对目标进程有 `TF_ACCEPT_FDS` （接收方在 `transact` 时需要带这个 flag， `libbinder` 会自动加）。

* * *

## 7\. 大小限制与 TransactionTooLargeException

### 7.1 三层限制

| 层次  | 限制  | 后果  |
| --- | --- | --- |
| 进程总缓冲区 | `1MB - 8KB` | 超过 → `FAILED_TRANSACTION` |
| 单个同步事务 | 受目标进程剩余空间限制 | 同上  |
| oneway 事务 | 最多 `buffer_size / 2` | 同上  |

### 7.2 异常的产生链

![7.2 异常的产生链（图 5）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7d60a0aeb3aad420.png)

JNI 里的转换：

```cpp
// frameworks/base/core/jni/android_util_Binder.cpp
static void signalExceptionForError(JNIEnv* env, jobject obj, status_t err,
                                    bool canThrowRemoteException, int parcelSize)
{
    switch (err) {
    case DEAD_OBJECT:
        jniThrowException(env, "android/os/DeadObjectException", NULL);
        break;
    case FAILED_TRANSACTION:
        ALOGE("!!! FAILED BINDER TRANSACTION !!!  (parcel size = %d)", parcelSize);
        /* ★ 转成 TransactionTooLargeException */
        exceptionToThrow = canThrowRemoteException
                ? "android/os/TransactionTooLargeException"
                : "java/lang/RuntimeException";
        snprintf(msg, sizeof(msg), "data parcel size %d bytes", parcelSize);
        jniThrowException(env, exceptionToThrow, msg);
        break;
    case NO_ERROR: break;
    // ...
    }
}
```

### 7.3 为什么「明明没到 1MB 也报错」

常见原因：

1.  **目标进程的缓冲区被别的事务占用了**—— 限制是「剩余空间」，不是「1MB」。
2.  **同时有多个事务在飞**—— 每个都占一块。
3.  **oneway 只能用一半**—— 实际阈值是 ~508KB。
4.  **位图/Bitmap**： `Bundle` 里放 `Bitmap` 会走 `Parcelable` 序列化，实际大小可能远超预期。
5.  **String 是 UTF-16**—— 一个中文字符 = 2 字节。

**经验值**：跨进程传数据 **最好不要超过几十 KB**。大文件/大数据用 `ashmem` / `ParcelFileDescriptor` / `BinderType.PTR` （scatter-gather）。

* * *

## 8\. 嵌套调用与 transaction_stack

### 8.1 允许的嵌套

Binder 线程处理 `BR_TRANSACTION` 时， **可以再发起同步调用** （这叫嵌套/重入）。内核用 `binder_thread.transaction_stack` 记录调用链：

![8.1 允许的嵌套（图 6）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/46d97af600828655.png)

T2 在等服务 C 时， `transaction_stack` 上压着「正在为 A 处理事务」。

### 8.2 循环 → 死锁

![8.2 循环 → 死锁（图 7）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2a42906aa88e800c.png)

如果 A 已经 **没有空闲线程** 了，B 的调用就没人处理 → 双方永久阻塞。

**注意**：内核有个保护 —— 如果检测到「A→B→A 且是同一个线程栈」，会直接返回 `BR_DEAD_REPLY` （防止自我死锁）。但 **跨线程** 的循环无法检测，只能靠 `BR_SPAWN_LOOPER` 开新线程救场（前提是没到 `max_threads` ）。

* * *

## 9\. 常见坑汇总

| 坑   | 症状  | 原因  | 解法  |
| --- | --- | --- | --- |
| `TransactionTooLargeException` | 调用直接抛异常 | Parcel 太大 / 目标缓冲区满 | 减小数据、分片、用 ashmem |
| Binder 线程池耗尽 | 随机 ANR / 卡死 | 所有线程都在等一个慢调用 | 检查耗时操作是否在 Binder 线程里；避免调用环 |
| `DeadObjectException` | 调用抛异常 | 服务进程死了 | `linkToDeath` + 重连 |
| `RemoteException` 在 `oneway` 调用中丢失 | 静默失败 | oneway 无法回传异常 | 用死亡通知或加一个回调接口 |
| 内存泄漏 | 服务端引用客户端不释放 | 注册回调后忘记注销 | `unregisterCallback` + `unlinkToDeath` |
| `SecurityException` at `enforceInterface` | 接口不匹配 | AIDL 改了但客户端没重编 | 重新编译；或用 `@VintfStability` |
| Parcel 读错位 | 数据错乱 / 崩溃 | 读写顺序不一致 | 严格按 AIDL 生成代码的顺序 |
| 同进程调用行为不同 | 异常类型/线程不同 | `asInterface` 走了本地路径 | 测试时用真实的跨进程场景 |
| `oneway` 调用丢失顺序预期 | 顺序错乱 | oneway 只在同一 node 上有序 | 需要顺序就用同步调用 |
| 在 Binder 线程里做 IO | 卡住整个服务 | Binder 线程数是有限的 | 切到自己的线程池 |

* * *

## 10\. 与其它 IPC 的对比

| 维度  | Binder | Socket | 共享内存 | 管道/消息队列 | AIDL over Binder |
| --- | --- | --- | --- | --- | --- |
| 拷贝次数 | **1** | 2   | 0（但要自己同步） | 2   | 1   |
| 面向对象 | ✅   | ❌   | ❌   | ❌   | ✅   |
| 身份识别 | ✅ 内核提供 pid/uid | 需 SO_PEERCRED | ❌   | ❌   | ✅   |
| 权限模型 | SELinux + uid | 端口/文件权限 | 文件权限 | 文件权限 | SELinux |
| 线程模型 | 内核管理线程池 | 自己管 | 自己管 | 自己管 | 内核管理 |
| 传 fd | ✅   | ✅ (SCM_RIGHTS) | ✅   | ❌   | ✅   |
| 适合  | 控制面/小数据 | 通用/网络 | 大数据/零拷贝 | 简单流 | 系统服务 |

**结论**：Binder 适合 **控制面的小数据 RPC** （方法调用、参数传递）。 **大数据** （音视频帧、位图）应该用 `ashmem` / `ParcelFileDescriptor` / `Surface` ，Binder 只传「句柄」。

* * *

下一章： [`07-源码索引与调试.md`](https://akjoson.github.io/2026/11/11/07-%E6%BA%90%E7%A0%81%E7%B4%A2%E5%BC%95%E4%B8%8E%E8%B0%83%E8%AF%95/) —— 去读源码、去调试验证。

* * *

通过Claude生成。
