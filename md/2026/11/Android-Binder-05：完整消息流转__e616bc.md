---
title: Android Binder 05：完整消息流转
source: https://akjoson.github.io/2026/11/11/05-%E5%AE%8C%E6%95%B4%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC/
source_host: akjoson.github.io
clip_date: 2026-11-27T10:53:28+08:00
trace_id: db6ef65b-c4d7-4819-9a30-3d8c9e5e2901
content_hash: 6b2924e9c27eca96c72725e84ea9dee732a5afb8828982e85bbafa4f68ea8da0
status: synced
tags: []
series: null
feed_source: 殷仔·Android Binder
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 42575244-d011-815e-99fb-c2cb17fe932e
ioc: null
---

> **Android Binder 消息流转全解**
> 
> [导读 消息流转全解：系列导读](https://akjoson.github.io/2026/11/11/00-android-binder%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC%E5%85%A8%E8%A7%A3/) · [01 架构总览](https://akjoson.github.io/2026/11/11/01-%E6%9E%B6%E6%9E%84%E6%80%BB%E8%A7%88/) · [02 消息封装](https://akjoson.github.io/2026/11/11/02-%E6%B6%88%E6%81%AF%E5%B0%81%E8%A3%85/) · [03 RPC 原理](https://akjoson.github.io/2026/11/11/03-rpc%E5%8E%9F%E7%90%86/) · [04 内核数据结构](https://akjoson.github.io/2026/11/11/04-%E5%86%85%E6%A0%B8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/) · [05 完整消息流转](https://akjoson.github.io/2026/11/11/05-%E5%AE%8C%E6%95%B4%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC/) · [06 进阶专题](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) · [07 源码索引与调试](https://akjoson.github.io/2026/11/11/07-%E6%BA%90%E7%A0%81%E7%B4%A2%E5%BC%95%E4%B8%8E%E8%B0%83%E8%AF%95/)

前四章把零件拆开了，这一章把它们拼起来。 **这是整个文档最重要的部分。**

* * *

## 0\. 前置条件：进程是怎么接入 Binder 的

在能发起任何 Binder 调用之前，进程必须先初始化。这一步由 `ProcessState` 完成（**每个进程一次**，是单例）：

```cpp
// frameworks/native/libs/binder/ProcessState.cpp
sp<ProcessState> ProcessState::self()
{
    return init(kDefaultDriver);   // 通常是 "/dev/binder"
}

sp<ProcessState> ProcessState::init(const char *driver)
{
    if (gProcess != nullptr) return gProcess;     // 单例

    int fd = open(driver, O_RDWR | O_CLOEXEC);
    // ...
    gProcess = new ProcessState(driver);
    return gProcess;
}
```

`ProcessState` 构造函数做的 4 件事：

![0\. 前置条件：进程是怎么接入 Binder 的（图 1）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e42c04bf1f873cfd.png)

Java 侧同理： `android.os.ProcessState` （隐藏类）在 `android_util_Binder.cpp` 的 `register_android_os_Binder()` 里通过 JNI 拿到同一个 native `ProcessState` 单例。

**每个线程** 则有自己的 `IPCThreadState` （线程局部存储）：

```cpp
// frameworks/native/libs/binder/IPCThreadState.cpp
IPCThreadState* IPCThreadState::self()
{
    if (gHaveTLS) {
restart:
        const pthread_key_t k = gTLS;
        IPCThreadState* st = (IPCThreadState*)pthread_getspecific(k);
        if (st) return st;
        return new IPCThreadState;    // 每个线程懒创建
    }
    // ...
}

IPCThreadState::IPCThreadState()
    : mProcess(ProcessState::self()),
      mInflightSynchronous(...), mServingStackPointer(nullptr)
{
    mIn.setDataCapacity(256);
    mOut.setDataCapacity(256);
    // ...
}
```

所以： **一个进程 = 1 个 `ProcessState` + N 个 `IPCThreadState` （每线程一个）**。

* * *

## 1\. 端到端时序：一次同步调用

场景：Client 进程调用 Server 进程的 `IMyService.echo("hi")` 。

### 1.1 总览图

![1.1 总览图（图 2）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7685eaf41bc92212.png)

### 1.2 一步步拆解

#### Step 1 — Proxy 序列化参数（纯用户态，无内核参与）

```java
// IMyService.Stub.Proxy.echo()
android.os.Parcel _data  = android.os.Parcel.obtain();   // 从对象池拿，避免 GC 压力
android.os.Parcel _reply = android.os.Parcel.obtain();
_data.writeInterfaceToken(DESCRIPTOR);   // 写 "com.example.IMyService"
_data.writeString("hi");                 // 写参数
```

此时 `_data` 里的字节：

```
偏移 0:  0x10         ← 长度 16 (字符数)
偏移 4:  "com.example.IMyService\0\0"
偏移 36: 0x02         ← 长度 2
偏移 40: 'h','i'
偏移 44: 0x0000
```

> `Parcel.obtain()` 有一个每进程的池子（默认 6 个），避免频繁分配。

#### Step 2 — 进入 BinderProxy.transact

```java
boolean _status = mRemote.transact(Stub.TRANSACTION_echo, _data, _reply, 0);
```

`mRemote` 是 `BinderProxy` 。 `BinderProxy.transact` 是一个 native 方法：

```java
// android.os.BinderProxy
public native boolean transact(int code, Parcel data, Parcel reply, int flags)
        throws RemoteException;
```

对应 JNI：

```cpp
// frameworks/base/core/jni/android_util_Binder.cpp
static jboolean android_os_BinderProxy_transact(JNIEnv* env, jobject obj,
        jint code, jobject dataObj, jobject replyObj, jint flags)
{
    Parcel* data  = parcelForJavaObject(env, dataObj);
    Parcel* reply = parcelForJavaObject(env, replyObj);

    IBinder* target = getBPBinderOrNull(env, obj);   // ← 拿到 BpBinder*
    // ...
    status_t err = target->transact(code, *data, reply, flags);
    // ...
    return err != NO_ERROR ? JNI_FALSE : JNI_TRUE;
}
```

**Java `Parcel` 和 native `Parcel` 是同一个对象** （JNI 里互相持有），所以这里没有数据拷贝。

#### Step 3 — BpBinder::transact

```cpp
// frameworks/native/libs/binder/BpBinder.cpp
status_t BpBinder::transact(uint32_t code, const Parcel& data,
                            Parcel* reply, uint32_t flags)
{
    if (mAlive) {
        status_t status = IPCThreadState::self()->transact(
            mHandle, code, data, reply, flags);
        if (status == DEAD_OBJECT) mAlive = 0;
        return status;
    }
    return DEAD_OBJECT;
}
```

一句话： **`BpBinder` 把活全交给当前线程的 `IPCThreadState` 。**

#### Step 4 — IPCThreadState::transact 打包

```cpp
status_t IPCThreadState::transact(int32_t handle, uint32_t code,
        const Parcel& data, Parcel* reply, uint32_t flags)
{
    flags |= TF_ACCEPT_FDS;   // 允许接收 fd

    // 构造 binder_transaction_data 并写进 mOut
    status_t err = writeTransactionData(BC_TRANSACTION, flags, handle, code,
                                        data, nullptr);

    if ((flags & TF_ONE_WAY) == 0) {
        // ═══ 同步：等待回复 ═══
        if (reply) {
            err = waitForResponse(reply);
        } else {
            Parcel fakeReply;
            err = waitForResponse(&fakeReply);
        }
    } else {
        // ═══ oneway：只等 BR_TRANSACTION_COMPLETE ═══
        err = waitForResponse(nullptr, nullptr);
    }
    return err;
}
```

`mOut` 内容：

```
[uint32 BC_TRANSACTION] [struct binder_transaction_data]
                          ├─ target.handle = 42
                          ├─ code          = 1
                          ├─ flags         = TF_ACCEPT_FDS
                          ├─ data_size     = 48
                          ├─ offsets_size  = 0
                          ├─ data.ptr.buffer  ──→ (指向 _data 的负载)
                          └─ data.ptr.offsets = 0
```

#### Step 5 — talkWithDriver：唯一的一次系统调用

```cpp
status_t IPCThreadState::talkWithDriver(bool doReceive)
{
    binder_write_read bwr;
    bwr.write_size     = mOut.dataSize();
    bwr.write_consumed = 0;
    bwr.write_buffer   = (binder_uintptr_t)mOut.data();

    bwr.read_size     = needRead ? mIn.dataCapacity() : 0;
    bwr.read_consumed = 0;
    bwr.read_buffer   = (binder_uintptr_t)mIn.data();

    // ★ 唯一的系统调用
    ioctl(mProcess->mDriverFD, BINDER_WRITE_READ, &bwr);

    // 处理后把 mOut 清空、把 mIn 的有效数据长度设好
    ...
}
```

**从这里离开用户态，进入内核。**

#### Step 6 — 内核 binder_transaction()：找人、分配、拷贝

```c
// drivers/android/binder.c
static void binder_transaction(struct binder_proc *proc,
                               struct binder_thread *thread,
                               struct binder_transaction_data *tr,
                               int reply, binder_size_t extra_buffers_size)
{
    /* ① 找目标 */
    if (!reply) {
        e = binder_get_ref_for_node? // 实际：按 handle 查
        ref = binder_get_ref_olocked(proc, tr->target.handle, true);
        target_node = binder_get_node_refs_for_txn(ref->node, &target_proc, &return_error);
        handle = ref->data.desc;
    } else {
        /* BC_REPLY：目标是发起方 */
        target_node = t->buffer->target_node;   // 或 transaction 里的 from
        target_proc = ...;
        target_thread = ...;
    }

    /* ② 在【目标进程】的 alloc 里分配缓冲区 */
    t->buffer = binder_alloc_new_buf(&target_proc->alloc,
                                     tr->data_size, tr->offsets_size,
                                     extra_buffers_size,
                                     !reply && (t->flags & TF_ONE_WAY));

    /* ③ 拷贝数据（唯一一次用户态数据拷贝） */
    binder_alloc_copy_user_to_buffer(&target_proc->alloc, t->buffer,
                                     ALIGN(secctx_sz, sizeof(u64)),
                                     (const void __user *)(uintptr_t)tr->data.ptr.buffer,
                                     tr->data_size);

    /* ④ 翻译负载里的 flat_binder_object / fd */
    offp = (binder_size_t *)(t->buffer->data + ALIGN(tr->data_size, sizeof(void *)));
    for (size_t i = 0; i < tr->offsets_size / sizeof(binder_size_t); i++, offp++) {
        binder_object_header *hdr = (binder_object_header *)(t->buffer->data + *offp);
        switch (hdr->type) {
        case BINDER_TYPE_BINDER:
        case BINDER_TYPE_WEAK_BINDER:
            binder_translate_binder(...);    // 本地对象 → 对端 handle
        case BINDER_TYPE_HANDLE:
        case BINDER_TYPE_WEAK_HANDLE:
            binder_translate_handle(...);    // 句柄 → 对端新句柄
        case BINDER_TYPE_FD:
            binder_translate_fd(...);        // fd → 对端新 fd
        }
    }

    /* ⑤ 投递 */
    binder_proc_transaction(t, target_proc, thread, oneway);
}
```

#### Step 7 — binder_proc_transaction()：选择目标线程并唤醒

```c
static bool binder_proc_transaction(struct binder_transaction *t,
                                    struct binder_proc *proc,
                                    struct binder_thread *thread,
                                    bool oneway)
{
    struct binder_node *node = t->buffer->target_node;

    if (oneway) {
        /* oneway 的排队逻辑见 06 章 */
        ...
    }

    if (thread) {
        binder_enqueue_thread_work(thread, tcomplete);  /* 给发送者 BR_TRANSACTION_COMPLETE */
        binder_enqueue_thread_work(thread, &t->work);   /* 真正的任务 */
        wake_up_interruptible_sync(&thread->wait);
        return true;
    }

    /* 没有可用线程 → 挂进程队列，并要求开新线程 */
    binder_enqueue_work_ilocked(&t->work, &proc->todo);
    binder_wakeup_proc_ilocked(proc);
    return true;
}
```

**注意**：同步事务会优先选一个已经「空闲等待」的线程（ `binder_select_thread_ilocked` ），这样就能立刻被唤醒处理。

#### Step 8 — Client 收到 BR_TRANSACTION_COMPLETE（但还没返回！）

回到 `waitForResponse` ：

```cpp
status_t IPCThreadState::waitForResponse(Parcel *reply, status_t *acquireResult)
{
    while (1) {
        talkWithDriver();
        if (mIn.dataAvail() == 0) continue;

        uint32_t cmd = mIn.readInt32();
        switch (cmd) {
        case BR_TRANSACTION_COMPLETE:
            if (!reply && !acquireResult) goto finish;  // oneway：可以返回了
            break;                                       // 同步：继续循环等 BR_REPLY
        case BR_DEAD_REPLY:  err = DEAD_OBJECT;     goto finish;
        case BR_FAILED_REPLY: err = FAILED_TRANSACTION; goto finish;
        case BR_REPLY: {
            binder_transaction_data tr;
            mIn.read(&tr, sizeof(tr));
            if (reply) {
                reply->ipcSetDataReference(
                    reinterpret_cast<const uint8_t*>(tr.data.ptr.buffer),
                    tr.data_size,
                    reinterpret_cast<const binder_size_t*>(tr.data.ptr.offsets),
                    tr.offsets_size / sizeof(binder_size_t),
                    freeBuffer, this);
            }
            goto finish;   // 拿到结果，跳出循环
        }
        default:
            executeCommand(cmd);   // 包括 BR_TRANSACTION
        }
    }
finish:
    ...
}
```

**关键点**： `BR_TRANSACTION_COMPLETE` 只是「内核已接收」的确认，对同步调用来说 **必须继续等 `BR_REPLY`**。这也解释了一个常见现象： **oneway 调用虽然不等结果，但仍然要等内核确认**，所以并非完全「发射后不管」。

#### Step 9 — Server 线程醒来，执行 BR_TRANSACTION

```cpp
status_t IPCThreadState::executeCommand(int32_t cmd)
{
    switch (cmd) {
    case BR_TRANSACTION:
    case BR_TRANSACTION_SEC_CTX: {
        binder_transaction_data_secctx tr_secctx;
        binder_transaction_data& tr = tr_secctx.transaction_data;
        if (cmd == BR_TRANSACTION_SEC_CTX) mIn.read(&tr_secctx, sizeof(tr_secctx));
        else { mIn.read(&tr, sizeof(tr)); tr_secctx.secctx = 0; }

        Parcel buffer;
        /* ★ 0 拷贝：Parcel 直接指向内核写好的那块 mmap 内存 */
        buffer.ipcSetDataReference(
            reinterpret_cast<const uint8_t*>(tr.data.ptr.buffer),
            tr.data_size,
            reinterpret_cast<const binder_size_t*>(tr.data.ptr.offsets),
            tr.offsets_size / sizeof(binder_size_t),
            freeBuffer, this);

        Parcel reply;
        status_t error;

        /* ★ 目标分派：靠 tr.target.ptr 是不是 0 来区分两种情况 */
        if (tr.target.ptr) {
            /* 情况 A：目标是一个"本地 Binder 对象"（绝大多数情况）。
             * 内核把 binder_node 的 ptr 和 cookie 传了回来：
             *   tr.target.ptr = node->ptr    （BBinder 的 weakref 地址）
             *   tr.cookie     = node->cookie （BBinder 自己的地址）
             * 注意：这里只持有弱引用，必须先用 attemptIncStrong() 安全地拿到强引用，
             *       否则对象可能在这期间被销毁。
             */
            if (reinterpret_cast<RefBase::weakref_type*>(tr.target.ptr)->attemptIncStrong(this)) {
                error = reinterpret_cast<BBinder*>(tr.cookie)->transact(tr.code, buffer, &reply, tr.flags);
                reinterpret_cast<BBinder*>(tr.cookie)->decStrong(this);
            } else {
                error = UNKNOWN_TRANSACTION;
            }
        } else {
            /* 情况 B：tr.target.ptr == 0。
             * 只有 ServiceManager 会走到这里 —— 它的 binder_node 是内核用
             * binder_new_node(proc, 0, 0) 建的"哑节点"，ptr 和 cookie 都是 0。
             * the_context_object 是 ServiceManager 自己注册进去的 Binder 对象。
             */
            error = the_context_object->transact(tr.code, buffer, &reply, tr.flags);
        }

        if ((tr.flags & TF_ONE_WAY) == 0) {
            sendReply(reply, 0);          /* ★ 非 oneway 才回复 */
        }
        // buffer 由 freeBuffer 回调通过 BC_FREE_BUFFER 归还
        break;
    }
    }
}
```

> **两个必须记住的点**：
> 
> 1.  `tr.target.ptr` / `tr.cookie` 是 **内核** 在给接收方构造 `BR_TRANSACTION` 时填的（ `binder_thread_read()` 里 `tr.target.ptr = target_node->ptr; tr.cookie = target_node->cookie;`）。 **发送方发出请求时这两个字段是 0**—— 发送方只能填 `target.handle` 。
> 2.  走到情况 A 时， `tr.cookie` 就是一个 `BBinder*` 。对 Java 进程来说它指向 `JavaBBinder` ，所以 `BBinder::transact` 最终会通过 JNI 调到 Java 的 `Binder.execTransact` 。

#### Step 10 — BBinder::transact → JNI → Java Stub.onTransact

```cpp
// libbinder/BBinder.cpp
status_t BBinder::transact(uint32_t code, const Parcel& data,
                           Parcel* reply, uint32_t flags)
{
    switch (code) {
    case PING_TRANSACTION: reply->writeInt32(pingBinder()); return NO_ERROR;
    default:
        err = onTransact(code, data, reply, flags);   // ← 虚函数，多态
        break;
    }
    // ...
    return err;
}
```

`onTransact` 被 `JavaBBinder` 覆写：

```cpp
// frameworks/base/core/jni/android_util_Binder.cpp
class JavaBBinder : public BBinder {
    jint onTransact(uint32_t code, const Parcel& data, Parcel* reply, uint32_t flags) override {
        // ...
        jboolean res = env->CallBooleanMethod(
            mObject,                       /* Java 的 Binder 对象 */
            gBinderOffsets.mExecTransact,  /* Binder.execTransact */
            code, (jlong)&data, (jlong)reply, flags);
        // ...
        return res ? NO_ERROR : UNKNOWN_TRANSACTION;
    }
};
```

Java 侧：

```java
// android.os.Binder
private boolean execTransact(int code, long dataObj, long replyObj, int flags) {
    Parcel data = Parcel.obtain(dataObj);
    Parcel reply = Parcel.obtain(replyObj);
    boolean res;
    try {
        res = onTransact(code, data, reply, flags);   // ← 最终到达 Stub.onTransact
    } catch (RemoteException|RuntimeException e) {
        ...
    }
    // ...
    return res;
}
```

#### Step 11 — Stub 执行真实逻辑，写 reply

```java
// IMyService.Stub.onTransact
case TRANSACTION_echo: {
    data.enforceInterface(descriptor);
    String _arg0 = data.readString();       // "hi"
    String _result = this.echo(_arg0);      // ← 调用 MyServiceImpl.echo
    reply.writeNoException();               // 写 0 (无异常)
    reply.writeString(_result);             // 写返回值
    return true;
}
```

`reply` `Parcel` 现在包含： `[int32 0 (NO_ERROR)][String16 长度][UTF-16 数据]` 。

#### Step 12 — sendReply 原路返回

```cpp
status_t IPCThreadState::sendReply(const Parcel& reply, uint32_t flags)
{
    status_t err = writeTransactionData(BC_REPLY, flags, 0, 0, reply, &statusBuffer);
    if (err != NO_ERROR) return err;
    return waitForResponse(nullptr, nullptr);   // 等服务 BR_TRANSACTION_COMPLETE
}
```

注意 `sendReply` 传的 `handle` 是 **0**—— **回复的目标不由 `tr.target` 决定**。内核收到 `BC_REPLY` 时，会从 **发起回复的那个线程** 的 `transaction_stack` 栈顶取出 `t->from` ，也就是 **原来发起调用的那个线程**，把结果送回给它。这也是为什么 `transaction_stack` 必须正确维护（见 [`06-进阶专题.md`](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) 第 8 节）。

Client 侧 `waitForResponse` 里的 `BR_REPLY` 分支被触发， `talkWithDriver` 返回， `BpBinder::transact` 返回 `NO_ERROR` ，Proxy 读出结果：

```java
_reply.readException();       // 读 0，无异常
_result = _reply.readString(); // 读 "hi"
```

**RPC 完成。**

* * *

## 2\. 同一进程内的调用（本地快路径）

如果 Client 和 Server 在同一个进程：

![2\. 同一进程内的调用（本地快路径）（图 3）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/979e8add75cd44d6.png)

这是 `bindService` 到同一进程、或者 `LocalService` 场景的优化。 **代码路径完全一样，只是 `Proxy` 被省略了**，因此没有序列化开销（但仍要走一次 `Parcel` 写入，因为 `onTransact` 的签名就是这样）。

* * *

## 3\. oneway 调用

`oneway` 表示「发出即忘」。AIDL 里加 `oneway` 关键字，或者手动传 `FLAG_ONEWAY` 。

### 3.1 差异点

|     | 同步调用 | oneway 调用 |
| --- | --- | --- |
| `flags` | `0` | `TF_ONE_WAY` |
| 是否阻塞 | 阻塞直到 `BR_REPLY` | 只等 `BR_TRANSACTION_COMPLETE` 就返回 |
| `reply` | 有效  | **必须为 null** （AIDL 会检查） |
| 抛异常 | 通过 reply 传回 | 无法传回 |
| 内核缓冲 | 目标线程 todo | 可能排到 `node->async_todo` |
| 并发  | 一个线程一个事务 | 同一 node 的 oneway 事务 **串行** |

### 3.2 时序图

![3.2 时序图（图 4）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/38e01dfa075a11fe.png)

### 3.3 oneway 的排队规则（binder_proc_transaction）

```c
    if (oneway) {
        if (node->has_async_transaction) {
            /* ★ 该 node 已经有异步事务在处理 → 排队等 */
            binder_enqueue_work_ilocked(&t->work, &node->async_todo);
            ...
        } else {
            /* 没有 → 立刻派给一个线程，并标记 has_async_transaction */
            node->has_async_transaction = 1;
            thread = binder_select_thread_ilocked(proc);
            binder_enqueue_thread_work(thread, &t->work);
        }
    }
```

**保证**：同一个 node 上的 oneway 事务 **按顺序串行执行** （不会并发）。但 **不同 node** 之间、或者 **同一 node 的 oneway + 同步调用** 之间没有顺序保证。

### 3.4 oneway 的常见坑

1.  **不能靠 oneway 保证吞吐**—— 由于串行化，oneway 在单服务上是「异步排队」，不是「并发执行」。
2.  **oneway 会占用接收方的缓冲区空间** （最多一半的 `free_async_space` ），大量 oneway 会报 `FAILED_TRANSACTION` 。
3.  **AIDL 里 `oneway` 接口不能有返回值**，也不能声明 `throws` （编译期检查）。

* * *

## 4\. 回调（反向 RPC）

回调就是 **把 Binder 对象当参数传过去**。看一个例子：

```java
// Client 侧
IMyCallback cb = new IMyCallback.Stub() {
    @Override public void onEvent(String msg) { Log.d(TAG, msg); }
};
myService.registerCallback(cb);   // ★ cb 是个 Binder 对象，作为参数传出
```

### 4.1 时序

![4.1 时序（图 5）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/348cb6aae0686d32.png)

### 4.2 关键认知

-   **回调方和被回调方角色互换**，但走的还是同一套机制。
-   **Server 拿到的 `handle=17` 只在 Server 进程内有效**。
-   回调是很多「死锁」和「泄漏」的根源：
    -   Client 不 `unregisterCallback` → Server 持有对 Client 的引用 → Client 的 Binder 对象无法回收。
    -   用死亡通知（ `linkToDeath` ）可以清理这些引用。

* * *

## 5\. ServiceManager：服务注册与查询

`ServiceManager` 是特殊的，因为 **它的 handle 固定为 0**。

### 5.1 ServiceManager 自己怎么注册的

`servicemanager` 进程启动时：

```cpp
// frameworks/native/cmds/servicemanager/main.cpp
int main(int argc, char** argv) {
    // ...
    sp<ProcessState> ps(ProcessState::self());
    ps->setThreadPoolMaxThreadCount(0);          // 不需要线程池
    ps->setCallRestriction(ProcessState::CallRestriction::FATAL_ON_ILLEGAL_CALLS);
    // ★ 注册为 context manager
    status_t ret = ps->becomeContextManager(nullptr, nullptr);
    // ...
    IPCThreadState::self()->joinThreadPool();
    return 0;
}
```

`becomeContextManager` → `ioctl(fd, BINDER_SET_CONTEXT_MGR, 0)` 。 **内核只允许一个进程成功**：

```c
// drivers/android/binder.c — binder_ioctl_set_ctx_mgr()
	if (context->binder_context_mgr_node) {
		ret = -EBUSY;      /* ★ 已经有 context manager 了 */
		goto err;
	}
	/* 为该进程创建一个 binder_node，并记录到 context 里 */
	context->binder_context_mgr_node = binder_new_node(proc, 0, 0);
	/* 这个 node 的句柄在"别人"的进程里就是 0 */
```

于是 **所有进程通过 handle 0 就能访问 servicemanager** （内核在建 ref 时特殊处理 `desc = 0` ）。

### 5.2 注册服务（addService）

![5.2 注册服务（addService）（图 6）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f47182c6e682fbed.png)

**关键**：ServiceManager 里存的是 **`handle` （对 SM 进程有效的句柄）**，不是 node，也不是字符串地址。之后别人来查，SM 把这个 handle 传给别人，内核再翻译成别人的 handle。

### 5.3 查询服务（getService / checkService）

![5.3 查询服务（getService / checkService）（图 7）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0219713559f896c4.png)

**所以 `getService` 本身只是一次普通的 Binder 调用**—— 它返回一个 `IBinder` （ `BinderProxy` ），这个 `BinderProxy` 内部持有 `handle=M` 。

### 5.4 Java 侧的 ServiceManager

```java
// android.os.ServiceManager （隐藏类）
public static IBinder getService(String name) {
    // 内部通过 ServiceManagerProxy 调用 handle 0
}

// 常用封装
ServiceManager.getService("activity");            // → IActivityManager
ServiceManager.getService("package");             // → IPackageManager
```

* * *

## 6\. 完整的字节流转表

把「数据在这条链路上每一站长什么样」列成表：

| 阶段  | 位置  | 数据的形态 |
| --- | --- | --- |
| 1   | Java Proxy | `String "hi"` 对象 |
| 2   | Java `Parcel` | 负载字节： `[len=2][h\0i\0][\0\0]` |
| 3   | native `Parcel` （同一块内存） | 同上  |
| 4   | `binder_transaction_data` | `{handle:42, code:1, data_size:48, data.ptr.buffer:0x7f...}` |
| 5   | `mOut` 命令流 | `[BC_TRANSACTION(4B)][binder_transaction_data]` |
| 6   | `binder_write_read` | `{write_buffer:0x7f...(mOut), read_buffer:0x7f...(mIn)}` |
| 7   | ioctl 入参 | 指向 `binder_write_read` 的用户态指针 |
| 8   | 内核栈 | `binder_transaction_data` 的 **值拷贝** |
| 9   | 目标进程 binder buffer | 负载字节 `[len=2][h\0i\0][\0\0]` （**一次拷贝**） |
| 10  | `binder_transaction` | `{from: 线程A, to_proc: 目标, code:1, flags:0}` |
| 11  | 目标线程 todo | `binder_work{BINDER_WORK_TRANSACTION}` |
| 12  | `mIn` （Server 侧）返回流 | `[BR_TRANSACTION(4B)][binder_transaction_data]` |
| 13  | Server 的 `Parcel buffer` | `ipcSetDataReference()` → **直接指向第 9 步那块内存** |
| 14  | Java `Stub.onTransact` 的 `data` | 同上（Java Parcel 包着 native Parcel） |
| 15  | `readString()` | 拷贝出一个 Java `String` （这是一次用户态拷贝） |
| 16  | 返回值路径 | 对称反向，负载大小 = `[int32 0]["hi" 的编码]` |

* * *

## 7\. 小结：三条主线

![7\. 小结：三条主线（图 8）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0bb385576499483c.png)

-   **打包**： `Proxy` 把方法调用变成 `[code][Parcel]` ， `writeTransactionData` 加上句柄和元数据， `ioctl` 送进内核。
-   **投递**：内核用三棵红黑树找到目标，在 **目标进程** 分配缓冲区并做 **唯一一次数据拷贝**，然后唤醒目标线程。
-   **解包**： `Stub` 从指向内核缓冲区的 `Parcel` 里读出参数，调用真实实现， `BC_REPLY` 原路送回。

* * *

下一章： [`06-进阶专题.md`](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) —— 引用计数、死亡通知、线程池、大小限制等细节。

* * *

通过Claude生成。
