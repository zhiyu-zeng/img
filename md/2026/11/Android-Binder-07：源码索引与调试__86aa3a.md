---
title: Android Binder 07：源码索引与调试
source: https://akjoson.github.io/2026/11/11/07-%E6%BA%90%E7%A0%81%E7%B4%A2%E5%BC%95%E4%B8%8E%E8%B0%83%E8%AF%95/
source_host: akjoson.github.io
clip_date: 2026-11-27T10:56:38+08:00
trace_id: 01b7c871-5f8a-443e-adc6-c8cc33437b71
content_hash: 9ded48fd8bbc840e3d7768edf8c5da93e679da12e156b2fde8eab03b7f7d567a
status: synced
tags: []
series: null
feed_source: 殷仔·Android Binder
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42575244-d011-81e1-b99a-feb4585adfd8
ioc: null
---

> **Android Binder 消息流转全解**
> 
> [导读 消息流转全解：系列导读](https://akjoson.github.io/2026/11/11/00-android-binder%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC%E5%85%A8%E8%A7%A3/) · [01 架构总览](https://akjoson.github.io/2026/11/11/01-%E6%9E%B6%E6%9E%84%E6%80%BB%E8%A7%88/) · [02 消息封装](https://akjoson.github.io/2026/11/11/02-%E6%B6%88%E6%81%AF%E5%B0%81%E8%A3%85/) · [03 RPC 原理](https://akjoson.github.io/2026/11/11/03-rpc%E5%8E%9F%E7%90%86/) · [04 内核数据结构](https://akjoson.github.io/2026/11/11/04-%E5%86%85%E6%A0%B8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/) · [05 完整消息流转](https://akjoson.github.io/2026/11/11/05-%E5%AE%8C%E6%95%B4%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC/) · [06 进阶专题](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) · [07 源码索引与调试](https://akjoson.github.io/2026/11/11/07-%E6%BA%90%E7%A0%81%E7%B4%A2%E5%BC%95%E4%B8%8E%E8%B0%83%E8%AF%95/)

* * *

## 1\. AOSP 源码路径总表

> 路径基于 AOSP `main` 分支。用 [cs.android.com](https://cs.android.com/) 搜索最快。

### 1.1 Java 框架层

| 文件  | 内容  |
| --- | --- |
| `frameworks/base/core/java/android/os/IBinder.java` | `IBinder` 接口、 `DeathRecipient` 、 `FLAG_ONEWAY` 、保留 code |
| `frameworks/base/core/java/android/os/Binder.java` | 本地 Binder， `transact()` （本地直通）、 `execTransact()` 、 `onTransact()` 、 `attachInterface()` 、 `getCallingUid/Pid/Sid()` |
| `frameworks/base/core/java/android/os/BinderProxy.java` | 远程代理， `transact()` （native）、 `linkToDeath()` 、 `queryLocalInterface()` |
| `frameworks/base/core/java/android/os/Parcel.java` | `Parcel` （JNI 桥） |
| `frameworks/base/core/java/android/os/IInterface.java` | `asBinder()` |
| `frameworks/base/core/java/android/os/ServiceManager.java` | 名字服务入口 |
| `frameworks/base/core/java/android/os/ServiceManagerNative.java` | `getService` / `addService` 的实现 |
| `frameworks/base/core/java/android/os/BinderInternal.java` | 隐藏 API： `getContextObject` 、 `joinThreadPool` 等 |
| `frameworks/base/core/java/android/os/RemoteException.java` 等 | 异常类 |
| `frameworks/base/core/java/android/os/TransactionTooLargeException.java` | 大小超限异常（自 Android 7 从 `RemoteException` 拆分） |

### 1.2 JNI 胶水层

| 文件  | 内容  |
| --- | --- |
| `frameworks/base/core/jni/android_util_Binder.cpp` | **核心**： `JavaBBinder` 、 `JavaDeathRecipient` 、 `javaObjectForIBinder()` 、 `ibinderForJavaObject()` 、 `signalExceptionForError()` 、 `gBinderOffsets` 等偏移表 |
| `frameworks/base/core/jni/android_os_Parcel.cpp` | Java `Parcel` ↔ native `Parcel` |
| `frameworks/base/core/jni/android_os_MessageQueue.cpp` | Looper 与 Binder 的交互 |

### 1.3 Native 库层（libbinder）

| 文件  | 内容  |
| --- | --- |
| `frameworks/native/libs/binder/IPCThreadState.cpp` | **核心**： `transact()` 、 `talkWithDriver()` 、 `executeCommand()` 、 `waitForResponse()` 、 `joinThreadPool()` 、 `sendReply()` 、 `writeTransactionData()` 、 `freeBuffer()` |
| `frameworks/native/libs/binder/ProcessState.cpp` | **核心**：单例、 `mmap` 、 `startThreadPool()` 、 `spawnPooledThread()` 、 `getContextObject()` 、 `becomeContextManager()` |
| `frameworks/native/libs/binder/BpBinder.cpp` | 远程代理、 `linkToDeath` 、 `sendObituary` 、引用计数命令 |
| `frameworks/native/libs/binder/BBinder.cpp` | 本地实体、 `transact()` → `onTransact()` |
| `frameworks/native/libs/binder/Parcel.cpp` | **核心**：序列化、 `flat_binder_object` 、 `ipcSetDataReference()` |
| `frameworks/native/libs/binder/IInterface.cpp` | `asInterface` 骨架 |
| `frameworks/native/libs/binder/include/binder/IInterface.h` | `BpInterface` / `BnInterface` 模板 |
| `frameworks/native/libs/binder/include/binder/IBinder.h` | `IBinder` 、 `DeathRecipient` 、 `BpRefBase` |
| `frameworks/native/libs/binder/IServiceManager.cpp` | `ServiceManager` 的 native 客户端 |
| `frameworks/native/libs/binder/Status.cpp` | `Status` / `ExceptionCode` |
| `frameworks/native/libs/binder/ProcessState.h` | `BINDER_VM_SIZE` 、 `DEFAULT_MAX_BINDER_THREADS` 等宏 |

### 1.4 ServiceManager 进程

| 文件  | 内容  |
| --- | --- |
| `frameworks/native/cmds/servicemanager/main.cpp` | 进程入口， `becomeContextManager()` |
| `frameworks/native/cmds/servicemanager/ServiceManager.cpp` | `addService` / `getService` / `listServices` 实现 |

### 1.5 内核驱动

| 文件  | 内容  |
| --- | --- |
| `drivers/android/binder.c` | **核心**： `binder_ioctl` 、 `binder_thread_write` 、 `binder_thread_read` 、 `binder_transaction` 、 `binder_proc_transaction` 、 `binder_translate_*` |
| `drivers/android/binder_alloc.c` | 缓冲区分配器： `binder_alloc_new_buf` 、 `binder_alloc_copy_user_to_buffer` 、 `binder_alloc_free_buf` |
| `drivers/android/binder_alloc.h` | `binder_buffer` / `binder_alloc` 结构 |
| `drivers/android/binder_internal.h` | `binder_proc` / `binder_thread` / `binder_node` / `binder_ref` / `binder_transaction` 结构 |
| `drivers/android/binderfs.c` | binderfs 文件系统（Android 10+） |
| `include/uapi/linux/android/binder.h` | **协议头**： `BC_*` / `BR_*` / `flat_binder_object` / `binder_transaction_data` / ioctl 定义 |
| `include/uapi/linux/android/binderfs.h` | binderfs 的 ioctl |

> **注意**：驱动源码在 AOSP 的 `kernel/common` / `kernel/msm` 等内核仓库里，不在 `frameworks` 里。Google 的 common kernel 仓库： `https://android.googlesource.com/kernel/common/+/refs/heads/android-mainline/drivers/android/binder.c`

* * *

## 2\. 关键函数索引（按调用顺序）

一次同步 RPC 会经过这些函数， **从上到下读一遍就能把链路走通**：

### Client 侧（发送）

| 顺序  | 函数  | 文件  |
| --- | --- | --- |
| 1   | `IMyService.Stub.Proxy.xxx()` | 生成的 AIDL |
| 2   | `Parcel.writeInterfaceToken()` / `writeString()` | `Parcel.java` → `android_os_Parcel.cpp` → `Parcel.cpp` |
| 3   | `BinderProxy.transact()` | `BinderProxy.java` |
| 4   | `android_os_BinderProxy_transact()` | `android_util_Binder.cpp` |
| 5   | `BpBinder::transact()` | `BpBinder.cpp` |
| 6   | `IPCThreadState::transact()` | `IPCThreadState.cpp` |
| 7   | `IPCThreadState::writeTransactionData()` | `IPCThreadState.cpp` |
| 8   | `IPCThreadState::waitForResponse()` | `IPCThreadState.cpp` |
| 9   | `IPCThreadState::talkWithDriver()` | `IPCThreadState.cpp` |

### 内核侧

| 顺序  | 函数  | 文件  |
| --- | --- | --- |
| 10  | `binder_ioctl()` | `binder.c` |
| 11  | `binder_ioctl_write_read()` | `binder.c` |
| 12  | `binder_get_thread()` | `binder.c` |
| 13  | `binder_thread_write()` | `binder.c` |
| 14  | `binder_transaction()` | `binder.c` |
| 15  | `binder_alloc_new_buf()` | `binder_alloc.c` |
| 16  | `binder_alloc_copy_user_to_buffer()` | `binder_alloc.c` |
| 17  | `binder_translate_binder()` / `_handle()` / `_fd()` | `binder.c` |
| 18  | `binder_proc_transaction()` | `binder.c` |
| 19  | `binder_enqueue_thread_work()` | `binder.c` |
| 20  | `wake_up_interruptible_sync()` | 内核  |
| 21  | `binder_thread_read()` | `binder.c` |

### Server 侧（接收）

| 顺序  | 函数  | 文件  |
| --- | --- | --- |
| 22  | `IPCThreadState::joinThreadPool()` | `IPCThreadState.cpp` |
| 23  | `IPCThreadState::getAndExecuteCommand()` | `IPCThreadState.cpp` |
| 24  | `IPCThreadState::talkWithDriver()` | `IPCThreadState.cpp` |
| 25  | `IPCThreadState::executeCommand()` | `IPCThreadState.cpp` |
| 26  | `Parcel::ipcSetDataReference()` | `Parcel.cpp` |
| 27  | `BBinder::transact()` | `BBinder.cpp` |
| 28  | `JavaBBinder::onTransact()` | `android_util_Binder.cpp` |
| 29  | `Binder.execTransact()` / `execTransactInternal()` | `Binder.java` |
| 30  | `IMyService.Stub.onTransact()` | 生成的 AIDL |
| 31  | `IPCThreadState::sendReply()` | `IPCThreadState.cpp` |

* * *

## 3\. 关键结构体索引

| 结构体 | 文件  | 一句话 |
| --- | --- | --- |
| `binder_write_read` | `uapi/.../binder.h` | ioctl 的信封 |
| `binder_transaction_data` | `uapi/.../binder.h` | 事务元数据 |
| `binder_transaction_data_secctx` | `uapi/.../binder.h` | 带 SELinux 上下文 |
| `flat_binder_object` | `uapi/.../binder.h` | Parcel 里的 Binder 对象/句柄/fd |
| `binder_proc` | `binder_internal.h` | 进程状态 |
| `binder_thread` | `binder_internal.h` | 线程状态 |
| `binder_node` | `binder_internal.h` | 服务端对象 |
| `binder_ref` | `binder_internal.h` | 客户端引用 |
| `binder_ref_death` | `binder_internal.h` | 死亡通知 |
| `binder_transaction` | `binder_internal.h` | 一次事务 |
| `binder_buffer` | `binder_alloc.h` | 缓冲区 |
| `binder_alloc` | `binder_alloc.h` | 分配器 |

* * *

## 4\. 调试手段

### 4.1 debugfs（需要 root）

```bash
# 挂载 debugfs
mount -t debugfs none /sys/kernel/debug      # 通常已自动挂载

# 所有 binder 进程
cat /sys/kernel/debug/binder/proc

# 某个进程的详细状态（线程、node、ref、buffer、事务）
cat /sys/kernel/debug/binder/proc/12345

# 全局统计（各类事务数量、失败次数）
cat /sys/kernel/debug/binder/stats

# 所有进行中的事务
cat /sys/kernel/debug/binder/transactions

# 所有死进程
cat /sys/kernel/debug/binder/dead_procs

# 事务日志（需要先开启）
echo 1 > /sys/kernel/debug/binder/proc/12345/transaction_log
cat /sys/kernel/debug/binder/proc/12345/transaction_log
```

**`/sys/kernel/debug/binder/proc/<pid>` 输出的解读**：

```yaml
binder proc state:                      ← 某个进程
proc 1234
thread 1234: l 12 need_return 0 tr 0     ← 线程 pid=1234, looper 状态 0x12, 事务栈深度 0
  incoming transaction 12345: 5678 from 9999   ← 正在处理的事务
  buffer 12346: 5678 from 9999                 ← 占用的缓冲区
node 12347: u0000007f00a000 c0000007f00b000 hs 1 hw 1 ls 0 lw 0 is 1 iw 1
                                             ← node: 用户地址, cookie, 各种引用计数
  ref 12348: desc 42 s 1 w 1 death 0000...   ← 引用: 句柄 42, 强 1 弱 1
```

字段对照：

| 字段  | 含义  |
| --- | --- |
| `u<addr>` | `node->ptr` （BBinder 用户态地址） |
| `c<addr>` | `node->cookie` |
| `hs` / `hw` | `has_strong_ref` / `has_weak_ref` （拥有者是否建立了引用） |
| `ls` / `lw` | `local_strong_refs` / `local_weak_refs` |
| `is` / `iw` | `internal_strong_refs` / 内部弱引用 |
| `ref ... desc N s X w Y` | 句柄 N，强引用 X，弱引用 Y |
| `tr` | 事务栈深度 |

### 4.2 dumpsys

```bash
# 查看某个进程持有的 binder 对象（需要权限）
dumpsys activity processes | grep -A5 Binder

# 查看 Binder 统计
dumpsys binder?

# 查看各进程的 binder 调用统计（Android 10+）
dumpsys binder_calls_stats
# 或
dumpsys activity binder-calls-stats

# 针对某个进程
dumpsys binder_calls_stats --per-process
dumpsys binder_calls_stats --per-uid

# 重置统计
dumpsys binder_calls_stats --reset
```

> `binder_calls_stats` 能看到「谁调用了什么接口多少次、花了多少时间、有没有超过慢调用阈值」。

### 4.3 Binder 事务追踪（Perfetto / ftrace）

Binder 驱动内置了 ftrace 打点，可用 Perfetto / systrace 抓取：

```bash
# ftrace 直接看
echo 1 > /sys/kernel/debug/tracing/events/binder/enable
cat /sys/kernel/debug/tracing/trace_pipe
echo 0 > /sys/kernel/debug/tracing/events/binder/enable
```

Perfetto 数据源：

| 数据源 | 内容  |
| --- | --- |
| `android.binder` | Binder 事务（开始/结束、目标进程、code） |
| `linux.ftrace` + `binder` 事件 | 同上，更底层 |

在 Perfetto UI 里加 `Binder Transactions` 轨道，可以看到每次跨进程调用的耗时、目标进程。

```bash
# 命令行抓取
perfetto -c - --txt -o /data/misc/perfetto-traces/trace <<EOF
buffers { size_kb: 8192 }
data_sources { config { name: "android.binder" } }
data_sources { config { name: "linux.ftrace"
  ftrace_config {
    ftrace_events: "binder/binder_transaction"
    ftrace_events: "binder/binder_transaction_received"
  }}}
duration_ms: 5000
EOF
```

### 4.4 systrace / atrace

```bash
atrace --list_categories | grep -i binder
# binder_driver  ← Binder 驱动相关
# binder_lock
# binder_driver
```

### 4.5 logcat 相关标签

```bash
# Binder 驱动的错误（TransactionTooLargeException 会打印）
logcat -s Binder:* IPCThreadState:* binder:*

# 常见日志
# "!!! FAILED BINDER TRANSACTION !!!  (parcel size = ...)"
# "Binder transaction failure: ..."
# "oneway spam detected"
# "Binder:1234_3: ..."
```

### 4.6 strace：看实际的 ioctl

```bash
# 抓某个进程的所有 ioctl
strace -f -e trace=ioctl -p <pid>
# 会看到：
# ioctl(8, BINDER_WRITE_READ, {write_size=..., ...}) = 0
```

### 4.7 Java 侧快速自测

```java
// 判断一个 IBinder 是本地的还是远程的
public static boolean isRemote(IBinder b) {
    return b instanceof android.os.BinderProxy;
}

// 打日志看调用方身份
Log.d(TAG, "caller pid=" + Binder.getCallingPid()
         + " uid=" + Binder.getCallingUid()
         + " sid=" + Binder.getCallingSid());   // Android 10+
```

* * *

## 5\. 版本演进时间线

| 版本  | 变化  |
| --- | --- |
| Android 1.0 | Binder 首次出现（基于 BeOS/Palm 的 OpenBinder 设计） |
| Android 4.3 | `TransactionTooLargeException` 从 `RemoteException` 拆出 |
| Android 8.0 (O) | 拆出 `hwbinder` / `vndbinder` ； `servicemanager` 用 C++ 重写；内核引入 `binder_alloc.c` （把分配逻辑从 `binder.c` 拆出） |
| Android 10 (Q) | `binderfs` ； `BR_TRANSACTION_SEC_CTX` + `binder_transaction_data_secctx` （SELinux 上下文随事务传递）； `Binder.getCallingSid()` |
| Android 11 (R) | Java `BinderProxy` 改用单个 native death recipient + Java 侧列表分发； `oneway_spam` 检测；AIDL 全面替代 HIDL |
| Android 12 (S) | `BINDER_SET_CONTEXT_MGR_EXT` ； `libbinder` 增加 `BinderProxy` / `Parcel` 的一些稳定性改进 |
| Android 13+ | `Parcel` 构造函数标记 `@UnsupportedAppUsage` ；oneway 优先级继承改进；冻结进程（cached app freezer）与 Binder 的交互 |

> **内核 vs 用户态**： `BC_*` / `BR_*` 命令和 `binder_transaction_data` 布局是 **用户态 ABI**，几乎不变； `binder_alloc` 、 `binderfs` 、secctx 是内核实现，随内核版本演进。

* * *

## 6\. 推荐的阅读路径

### 路径 A：先建立整体认知（1~2 天）

1.  本目录 [`README.md`](https://akjoson.github.io/2026/11/11/00-android-binder%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC%E5%85%A8%E8%A7%A3/) → [`01-架构总览.md`](https://akjoson.github.io/2026/11/11/01-%E6%9E%B6%E6%9E%84%E6%80%BB%E8%A7%88/)
2.  看 AIDL 生成代码：写一个最简单的 `.aidl` ，编译后反编译看生成的 Java
3.  `frameworks/native/libs/binder/IPCThreadState.cpp` 的 `transact()` / `talkWithDriver()` / `executeCommand()`
4.  `frameworks/native/libs/binder/BpBinder.cpp` （很短，100 行左右的核心）

### 路径 B：深入内核（3~5 天）

1.  `include/uapi/linux/android/binder.h` —— 先把协议头读完（不长）
2.  `binder_thread_write()` → `binder_transaction()` （这是最长的一段，慢慢读）
3.  `binder_thread_read()`
4.  `binder_alloc.c` 的 `binder_alloc_new_buf()` / `binder_alloc_copy_user_to_buffer()`
5.  `binder_proc_transaction()` / `binder_node` 引用计数相关函数

### 路径 C：动手实践

1.  用 `debugfs` 观察一个 app 进程的 binder 状态，对照 [`04-内核数据结构.md`](https://akjoson.github.io/2026/11/11/04-%E5%86%85%E6%A0%B8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/) 的字段表。
2.  写一个 AIDL 服务，在 `onTransact` 里打印 `Binder.getCallingUid()` ，从另一个 app 调用，观察。
3.  故意构造一个超过 1MB 的 Parcel，观察 `TransactionTooLargeException` （以及 `logcat -s Binder` 的日志）。
4.  用 Perfetto 抓一次 `Binder Transactions` ，看两次跨进程调用的耗时。
5.  写一个 oneway 接口，连续调 1000 次，观察是否有序、是否丢。
6.  用 `linkToDeath` 监听一个服务，然后 `kill` 它，观察 `binderDied()` 回调在哪个线程。

* * *

## 7\. 自测题（检验是否真的理清）

### 基础

1.  `Binder` （Java 类）和 `BinderProxy` （Java 类）分别在哪里被使用？它们的 `transact` 方法分别做什么？
2.  句柄（handle）是什么？为什么句柄 0 是特殊的？
3.  `IBinder.transact(code, data, reply, flags)` 里 `code` 是什么？ `INTERFACE_TRANSACTION` 的值是多少，为什么？
4.  AIDL 生成的 `asInterface` 里， `queryLocalInterface` 返回非 null 意味着什么？

### 封装

5.  `binder_transaction_data` 里 `target.handle` 和 `target.ptr` 分别在什么场景用？
6.  `data.ptr.offsets` 指向的数组里存的是什么？为什么需要它？
7.  `flat_binder_object` 在发送方和接收方看到的 `type` 为什么不一样？
8.  `sender_pid` / `sender_euid` 是谁填的？为什么要这样设计？

### 内核

9.  Binder 的「一次拷贝」具体是拷贝了哪一次？为什么不需要第二次？
10.  缓冲区是在 **发送方** 还是 **接收方** 的地址空间里分配的？为什么？
11.  `binder_ref.desc` 和 `binder_node.ptr` 分别是什么？它们之间怎么关联？
12.  内核怎么找到「handle 42 对应的对象」？

### 进阶

13.  `BC_ACQUIRE` / `BR_ACQUIRE` 分别是谁发给谁的？为什么需要反向通知？
14.  死亡通知是怎么实现的？ `binderDied()` 回调在哪个线程执行？
15.  oneway 事务在什么情况下会排队？排到哪个队列？
16.  Binder 线程池什么时候扩充？上限是多少？
17.  `TransactionTooLargeException` 的产生链是什么？
18.  为什么 Binder 调用可能死锁？怎么避免？

### 参考答案位置

| 题号  | 章节  |
| --- | --- |
| 1~4 | [`03-RPC原理.md`](https://akjoson.github.io/2026/11/11/03-rpc%E5%8E%9F%E7%90%86/) |
| 5~8 | [`02-消息封装.md`](https://akjoson.github.io/2026/11/11/02-%E6%B6%88%E6%81%AF%E5%B0%81%E8%A3%85/) |
| 9~12 | [`04-内核数据结构.md`](https://akjoson.github.io/2026/11/11/04-%E5%86%85%E6%A0%B8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/) |
| 13~18 | [`06-进阶专题.md`](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) |

* * *

## 8\. 延伸资料

| 资料  | 说明  |
| --- | --- |
| AOSP `frameworks/native/libs/binder/README.md` | libbinder 官方说明 |
| [cs.android.com](https://cs.android.com/) | AOSP 源码在线检索 |
| [elixir.bootlin.com/linux](https://elixir.bootlin.com/linux/latest/source/drivers/android/binder.c) | Linux 内核 Binder 驱动源码，带交叉引用 |
| Android 官方文档：AIDL | `developer.android.com/develop/background-work/services/aidl` |
| Android 官方文档：Binder IPC | `source.android.com/docs/core/architecture/aidl` |
| 《深入理解 Android 内核设计思想》（林学森） | 有 Binder 驱动逐行分析 |
| 《Android 源码情景分析》 | Binder 全链路分析（较老但思路清晰） |
| `frameworks/base/core/java/android/os/Binder.java` 的注释 | 官方对 Binder 对象生命周期的说明 |

* * *

## 9\. 一句话总结

> **Binder = 内核代理的对象引用 + 一次拷贝的缓冲区 + 自动线程池。**
> 
> 用户态把「方法调用」序列化成 `Parcel` ，包上 `binder_transaction_data` （带句柄和 code），用一次 `ioctl` 交给内核；内核用句柄查出目标对象所在进程，在 **目标进程** 的缓冲区里分配空间、做 **唯一一次拷贝**，然后把事务挂到目标线程的队列上并唤醒它；目标线程从 `ioctl` 返回后，把缓冲区包成 `Parcel` ，通过虚函数 `onTransact` 分派到真正的实现；返回值再以对称的方式原路送回。

* * *

上一篇： [`06-进阶专题.md`](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) ｜ 回到 [`README.md`](https://akjoson.github.io/2026/11/11/00-android-binder%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC%E5%85%A8%E8%A7%A3/)

* * *

通过Claude生成。
