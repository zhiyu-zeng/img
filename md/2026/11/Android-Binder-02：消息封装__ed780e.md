---
title: Android Binder 02：消息封装
source: https://akjoson.github.io/2026/11/11/02-%E6%B6%88%E6%81%AF%E5%B0%81%E8%A3%85/
source_host: akjoson.github.io
clip_date: 2026-11-27T10:49:20+08:00
trace_id: 22a6a1c8-7856-4404-880e-0c178ddda5d3
content_hash: 847b8dbfcc30d6feacce448434d4d6b51c5b895751eba869679ae9fa2ecfee1d
status: synced
tags: []
series: null
feed_source: 殷仔·Android Binder
ai_summary: null
ai_summary_style: null
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 42575244-d011-8124-92a6-e0e3bedef9fc
ioc: null
---

> **Android Binder 消息流转全解**
> 
> [导读 消息流转全解：系列导读](https://akjoson.github.io/2026/11/11/00-android-binder%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC%E5%85%A8%E8%A7%A3/) · [01 架构总览](https://akjoson.github.io/2026/11/11/01-%E6%9E%B6%E6%9E%84%E6%80%BB%E8%A7%88/) · [02 消息封装](https://akjoson.github.io/2026/11/11/02-%E6%B6%88%E6%81%AF%E5%B0%81%E8%A3%85/) · [03 RPC 原理](https://akjoson.github.io/2026/11/11/03-rpc%E5%8E%9F%E7%90%86/) · [04 内核数据结构](https://akjoson.github.io/2026/11/11/04-%E5%86%85%E6%A0%B8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/) · [05 完整消息流转](https://akjoson.github.io/2026/11/11/05-%E5%AE%8C%E6%95%B4%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC/) · [06 进阶专题](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) · [07 源码索引与调试](https://akjoson.github.io/2026/11/11/07-%E6%BA%90%E7%A0%81%E7%B4%A2%E5%BC%95%E4%B8%8E%E8%B0%83%E8%AF%95/)

这一章回答一个问题： **`remoteService.echo("hi")` 里的那个 `"hi"` ，从 Java 对象到内核，中间被拆成了哪些数据结构？**

答案是三层套娃：

```
binder_write_read          ← 一次 ioctl 的「信封」，同时携带「要写的」和「要读的」
  └─ 命令流 write_buffer
       ├─ BC_TRANSACTION   ← 4 字节命令字
       └─ binder_transaction_data   ← 事务的「元数据」：目标句柄、code、大小、指针
            └─ data.ptr.buffer      ← 指向「负载缓冲区」
                 └─ Parcel 序列化后的字节
                     └─ flat_binder_object（如果里面有 Binder 对象）
```

* * *

## 1\. 一次 ioctl 携带两个方向的数据

用户态和内核之间 **只有一条通道**： `ioctl(fd, BINDER_WRITE_READ, &bwr)` 。

`binder_write_read` 结构同时描述了「我要写给内核的东西」和「我要从内核读的东西」：

```c
/* include/uapi/linux/android/binder.h */
struct binder_write_read {
	binder_size_t   write_size;      /* 输入：write_buffer 有多少字节 */
	binder_size_t   write_consumed;  /* 输出：内核实际消费了多少字节 */
	binder_uintptr_t write_buffer;   /* 输入：命令流起始地址（用户态虚拟地址） */
	binder_size_t   read_size;       /* 输入：read_buffer 有多大 */
	binder_size_t   read_consumed;   /* 输出：内核实际写了多少字节 */
	binder_uintptr_t read_buffer;    /* 输入：返回流缓冲区地址 */
};
/* binder_size_t = __u64, binder_uintptr_t = __u64 */
```

**关键理解**：

-   `write_buffer` 里装的是 **命令流** （ `BC_*` ），是「我请求内核做的事」。
-   `read_buffer` 里装的是 **返回流** （ `BR_*` ），是「内核要告诉我或让我做的事」。
-   **一次 `ioctl` 可能既写又读**，这是 Binder 驱动精心设计的：调用方把请求塞进 `write_buffer` ，同时准备好一个空 `read_buffer` ，内核处理完请求后，顺便把「有没有活给我干」也一并返回。

在 `libbinder` 里，这两个缓冲区就是 `IPCThreadState` 的两个成员 `mOut` 和 `mIn` （都是 `Parcel` ）：

```cpp
// frameworks/native/libs/binder/IPCThreadState.cpp
status_t IPCThreadState::talkWithDriver(bool doReceive)
{
    binder_write_read bwr;
    // ...
    bwr.write_size     = mOut.dataSize();
    bwr.write_consumed = 0;
    bwr.write_buffer   = (binder_uintptr_t)mOut.data();

    bwr.read_size     = needRead ? mIn.dataCapacity() : 0;
    bwr.read_consumed = 0;
    bwr.read_buffer   = (binder_uintptr_t)mIn.data();

    if (ioctl(mProcess->mDriverFD, BINDER_WRITE_READ, &bwr) >= 0)
        err = NO_ERROR;
    // ...
    if (bwr.write_consumed > 0) {
        if (bwr.write_consumed < mOut.dataSize())
            mOut.remove(0, bwr.write_consumed);   // 部分消费，保留剩余
        else
            mOut.setDataSize(0);                  // 全部消费完
    }
    if (bwr.read_consumed > 0) {
        mIn.setDataSize(bwr.read_consumed);
        mIn.setDataPosition(0);
    }
    return err;
}
```

> **注意**： `mOut` / `mIn` 就是普通 `Parcel` 。所以「命令流」和「负载」用的是同一套序列化机制。

* * *

## 2\. 命令流：BC\_ 命令的编码格式

命令流里是 **一串** `[4 字节命令字][变长参数]` 的重复：

```c
/* 4 字节命令 + 参数 */
```

以一次同步调用为例， `mOut` 里的内容是：

```
┌────────────────────────────────────────────────────────────┐
│ uint32_t  BC_TRANSACTION                    (4 字节)       │
├────────────────────────────────────────────────────────────┤
│ struct binder_transaction_data tr           (40 字节 / 64位)│
└────────────────────────────────────────────────────────────┘
```

`BC_TRANSACTION` 的值是 `_IOW('c', 0, struct binder_transaction_data)` 。

### 写入命令的代码

```cpp
// frameworks/native/libs/binder/IPCThreadState.cpp
status_t IPCThreadState::writeTransactionData(int32_t cmd, uint32_t binderFlags,
        int32_t handle, uint32_t code, const Parcel& data, status_t* statusBuffer)
{
    binder_transaction_data tr;

    tr.target.ptr   = 0;
    tr.target.handle = (uint32_t)handle;   // ← 目标句柄
    tr.code         = code;                // ← 方法号（AIDL 里的 TRANSACTION_xxx）
    tr.flags        = binderFlags;         // ← 0 或 TF_ONE_WAY

    const status_t err = data.errorCheck();
    tr.data_size    = data.dataSize();
    tr.data.ptr.buffer  = (binder_uintptr_t)data.data();          // ← 负载缓冲区用户态地址
    tr.offsets_size = data.objectsSize();
    tr.data.ptr.offsets = (binder_uintptr_t)data.objects();       // ← offsets 数组用户态地址

    if (err != NO_ERROR) {
        if (statusBuffer) { ... }
        tr.flags |= TF_STATUS_CODE;
    }

    // 把「命令字」和「tr」依次写进 mOut
    mOut.writeInt32(cmd);
    mOut.write(&tr, sizeof(tr));

    return NO_ERROR;
}
```

注意两个容易忽略的点：

1.  **`tr.data.ptr.buffer` 和 `data.data()` 只是把用户态指针填进去**，数据本身还在原 `Parcel` 里。真正的拷贝发生在内核里（见 [`04-内核数据结构.md`](https://akjoson.github.io/2026/11/11/04-%E5%86%85%E6%A0%B8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/) ）。
2.  **`tr.target.ptr = 0` 是必须显式写的** （AOSP 源码注释原话是 "Don't pass uninitialized stack data to a remote process"）。 `target` 是 union：发送方只填 `handle` ； `ptr` 和 `cookie` 会被 **内核** 在给接收方构造 `BR_TRANSACTION` 时改写成 `node->ptr` / `node->cookie` 。

* * *

## 3\. binder_transaction_data 逐字段

这是 Binder 最重要的结构体， **整个 RPC 的元数据都在这里**：

```c
struct binder_transaction_data {
	/* 目标对象：发送 BC_TRANSACTION 时用 handle，发送 BC_REPLY 时用 ptr */
	union {
		__u32           handle;   /* 目标对象的句柄（客户端场景） */
		binder_uintptr_t ptr;     /* 目标对象的内核地址（服务端回复场景） */
	} target;

	binder_uintptr_t cookie;      /* BBinder 的地址，仅 BC_REPLY 时由内核填充 */
	__u32            code;        /* 方法号 / transaction code */
	__u32            flags;       /* TF_* 标志位，如 TF_ONE_WAY */

	pid_t            sender_pid;  /* 发送方的 pid（内核填充） */
	uid_t            sender_euid; /* 发送方的 uid（内核填充） */

	binder_size_t    data_size;   /* 负载字节数 */
	binder_size_t    offsets_size;/* offsets 数组的字节数 */

	/* 数据描述：既可以是指针（跨进程），也可以是内联缓冲（同进程优化） */
	union {
		struct {
			binder_uintptr_t buffer;   /* 负载缓冲区地址 */
			binder_uintptr_t offsets;  /* offsets 数组地址 */
		} ptr;
		__u8 buf[8];
	} data;
};
```

### 字段说明表

| 字段  | 谁填  | 含义  |
| --- | --- | --- |
| `target.handle` | Client | 目标 Binder 对象的句柄。 **这是 Client 唯一知道的「地址」** |
| `target.ptr` | **内核** | 与 `target.handle` 共用同一块内存（union）。发送方填 `handle` ； **内核给接收方构造 `BR_TRANSACTION` 时改填 `node->ptr`** （ `BBinder` 的 weakref 地址）。若目标是 ServiceManager（哑节点）则填 0 |
| `cookie` | **内核** | 同上，由内核填成 `node->cookie` （ `BBinder` 对象地址）。接收方用它还原出 `BBinder*` 。发送方发出时一律为 0 |
| `code` | Client | 方法号。AIDL 里是 `TRANSACTION_xxx = FIRST_CALL_TRANSACTION + n` |
| `flags` | Client | `TF_ONE_WAY` / `TF_ACCEPT_FDS` / `TF_STATUS_CODE` 等 |
| `sender_pid` / `sender_euid` | **内核** | 内核 **强制填充** 为真实值，客户端无法伪造 —— 这是 Binder 权限模型的基础 |
| `data_size` / `offsets_size` | Client | 负载大小 / offsets 数组大小 |
| `data.ptr.buffer` / `data.ptr.offsets` | Client | 负载和 offsets 的用户态地址 |

### flags 的取值（enum transaction_flags）

```c
enum transaction_flags {
	TF_ONE_WAY     = 0x01,  /* 异步单向调用，不等待回复 */
	TF_ROOT_OBJECT = 0x04,  /* 内容是 root object（基本不用） */
	TF_STATUS_CODE = 0x08,  /* 负载内容是 status_t 错误码，不是正常数据 */
	TF_ACCEPT_FDS  = 0x10,  /* 允许接收方通过 reply 返回 fd */
	TF_CLEAR_BUF   = 0x20,  /* 事务完成后清零 buffer */
	TF_UPDATE_TXN  = 0x40,  /* 内核用于更新已有异步事务的优先级 */
};
```

* * *

## 4\. Parcel：负载是怎么序列化的

### 4.1 Parcel 是什么

`Parcel` 是 Binder 的 **数据快递盒**：一块连续内存 + 一个写位置游标。所有参数按顺序写进去，接收方按同样的顺序读出来。

-   Java `android.os.Parcel` 和 native `Parcel` （ `frameworks/native/libs/binder/Parcel.cpp` ） **是同一份数据的两个视角**：Java `Parcel` 内部通过 JNI 持有一个 native `Parcel` 。
-   它是 **线性、小端、4 字节对齐** 的。

### 4.2 基本编码规则

| 类型  | 编码  |
| --- | --- |
| `int` / `uint32` | 4 字节，小端 |
| `long` / `uint64` | 8 字节，小端（**对齐到 4 字节，不是 8**） |
| `float` | 4 字节 IEEE754 |
| `double` | 8 字节 IEEE754 |
| `boolean` | 4 字节，0 或 1 |
| `String16` | 4 字节 **字符个数** （不是字节数）+ UTF-16LE 字符 + 2 字节 `\0\0` 结尾 |
| `String8` （ `writeString8` ） | 4 字节字节数（含结尾 0）+ UTF-8 + `\0` |
| `byte[]` / 任意数组 | 4 字节长度 + 元素序列 |
| `IBinder` | 24 字节 `flat_binder_object` （64 位下） |
| `FileDescriptor` | 4 字节 `flat_binder_object` （ `BINDER_TYPE_FD` ） |
| `Parcelable` | 4 字节非空标志 + 调用 `writeToParcel()` 写的内容 |

> ⚠️ **`String` 用的是 UTF-16**，这是 Binder 传输中文/emoji 时「大小估算」容易出错的原因：一个中文字符 = 2 字节，一个 emoji = 4 字节（代理对）。

### 4.3 一个例子：echo("hi") 产生的字节

`Proxy` 里执行：

```java
_data.writeInterfaceToken("com.example.IMyService");  // 1) 写接口标识
_data.writeString("hi");                              // 2) 写参数
```

`Parcel` 里的实际内容（大端展示地址，实际小端存储）：

```javascript
偏移 0:  0x00000010        ← String16 长度 = 16 个字符 (8 个 UTF-16 字符)
偏移 4:  'c' 'o' 'm' ...
         "com.example.IMyService\0\0"（32 字节）
偏移 36: 0x00000002        ← "hi" 的长度 = 2 个字符
偏移 40: 'h','i'           ← 2 个 UTF-16LE 字符 = 4 字节
偏移 44: 0x0000 0000       ← 结尾的 NUL
```

> `writeInterfaceToken` 写的是一个固定格式的 `String16` ： **先写 DESCRIPTOR 字符串，再写字符串长度** （注意顺序和普通 `writeString` 相反， `readInterfaceToken` 也是反着读的）。这是 `Parcel::writeInterfaceToken` 的特殊实现，目的是在流里插一个「魔数」，防止接口不匹配。

### 4.4 读取侧的对称性

```java
// Stub.onTransact
data.enforceInterface("com.example.IMyService");  // 校验 DESCRIPTOR，不对就抛异常
String _arg0 = data.readString();                 // 按同样格式读回 "hi"
```

`enforceInterface` 是 **必须的**：它保证了「调用方调用的接口 == 服务端实现的接口」。如果 AIDL 接口改过而客户端没重新编译，这里会抛 `SecurityException` 。

* * *

## 5\. offsets 数组与 flat_binder_object：跨进程传对象

### 5.1 问题：Binder 对象不能按值拷贝

如果 `Parcel` 里包含一个 Binder 对象（另一个服务）， **不能** 把它的内存地址直接写进负载 —— 因为地址只在原进程有效。

正确做法：负载里放一个 **占位结构**，同时用 **`offsets` 数组** 记录它在负载中的偏移，内核读到这个偏移后， **把它翻译成对端进程能用的东西**。

![5.1 问题：Binder 对象不能按值拷贝（图 1）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c3edfadb75332860.png)

### 5.2 flat_binder_object 结构

```c
struct flat_binder_object {
	__u32            type;    /* 见下表 */
	__u32            flags;   /* 例如 FLAT_BINDER_FLAG_ACCEPTS_FDS */
	union {
		binder_uintptr_t binder;  /* 本地对象：BBinder 在当前进程的用户态地址 */
		__u32            handle;  /* 远程对象：句柄 */
	};
	binder_uintptr_t cookie;      /* BBinder 的 cookie（JavaBBinderHolder* 等） */
};
```

64 位下大小 = 4 + 4 + 8 + 8 = **24 字节** （需要 8 字节对齐，所以 `Parcel` 会对齐填充）。

### 5.3 type 的取值

```c
#define B_PACK_CHARS(c1, c2, c3, c4) \
	((((c1)<<24)) | (((c2)<<16)) | (((c3)<<8)) | (c4))
#define B_TYPE_LARGE 0x85

enum {
	BINDER_TYPE_BINDER      = B_PACK_CHARS('s', 'b', '*', B_TYPE_LARGE), /* 本地强引用对象 */
	BINDER_TYPE_WEAK_BINDER = B_PACK_CHARS('w', 'b', '*', B_TYPE_LARGE), /* 本地弱引用对象 */
	BINDER_TYPE_HANDLE      = B_PACK_CHARS('s', 'h', '*', B_TYPE_LARGE), /* 远程强引用句柄 */
	BINDER_TYPE_WEAK_HANDLE = B_PACK_CHARS('w', 'h', '*', B_TYPE_LARGE), /* 远程弱引用句柄 */
	BINDER_TYPE_FD          = B_PACK_CHARS('f', 'd', '*', B_TYPE_LARGE), /* 文件描述符 */
	BINDER_TYPE_FDA         = B_PACK_CHARS('f', 'd', 'a', B_TYPE_LARGE), /* fd 数组 */
	BINDER_TYPE_PTR         = B_PACK_CHARS('p', 't', '*', B_TYPE_LARGE), /* scatter-gather 内存块 */
};
```

**发送方和接收方看到的 `type` 是不一样的**，这是理解 Binder 的关键：

|     | 发送方写进 Parcel | 内核翻译后（接收方读到） |
| --- | --- | --- |
| 传自己的对象给对端 | `BINDER_TYPE_BINDER` （带 `binder` 地址 + `cookie` ） | `BINDER_TYPE_HANDLE` （带 `handle` ） |
| 把别人的句柄转发给对端 | `BINDER_TYPE_HANDLE` （带 `handle` ） | `BINDER_TYPE_HANDLE` （可能是新 `handle` ） |
| 传自己的弱引用 | `BINDER_TYPE_WEAK_BINDER` | `BINDER_TYPE_WEAK_HANDLE` |
| 传文件描述符 | `BINDER_TYPE_FD` （带 fd 号） | `BINDER_TYPE_FD` （带对端进程里新安装的 fd 号） |

### 5.4 翻译过程（binder_translate_binder / binder_translate_handle）

以「A 把自己的对象传给 B」为例：

![5.4 翻译过程（binder\_translate\_binder / binder\_translate\_handle）（图 2）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8ac8d9614d16ae8e.png)

内核做的三件事：

1.  **为发送方的对象建 `binder_node`** （如果还没有）—— 所以「第一次传对象」会顺带创建 node。
2.  **为目标进程建 `binder_ref`** （如果还没有）—— `ref->desc` 就是目标进程看到的 handle。
3.  **就地改写** 负载里的 `flat_binder_object` 。

> 这也解释了为什么「同一个服务被传给同一个进程两次，拿到的是同一个 handle」—— 第二次会命中已有的 `binder_ref` 。

### 5.5 Parcel 侧的代码

```cpp
// frameworks/native/libs/binder/Parcel.cpp
status_t Parcel::writeStrongBinder(const sp<IBinder>& val)
{
    return flattenBinder(val);
}

status_t Parcel::flattenBinder(const sp<IBinder>& binder)
{
    // ...
    if (binder == nullptr) {
        flat_binder_object obj{};
        obj.type = BINDER_TYPE_BINDER;
        // 空 binder
        return finishFlattenBinder(binder, obj);
    }

    // 情况 1：本地对象（BBinder）→ 写 BINDER_TYPE_BINDER，带地址和 cookie
    BBinder *local = binder->localBinder();
    if (local != nullptr) {
        flat_binder_object obj{};
        obj.flags = ...;
        obj.type = BINDER_TYPE_BINDER;
        obj.binder = reinterpret_cast<uintptr_t>(local->getWeakRefs());
        obj.cookie = reinterpret_cast<uintptr_t>(local);
        return finishFlattenBinder(binder, obj);
    }

    // 情况 2：远程代理（BpBinder）→ 写 BINDER_TYPE_HANDLE，带 handle
    BpBinder *proxy = binder->remoteBinder();
    const int32_t handle = proxy ? proxy->handle() : 0;
    flat_binder_object obj{};
    obj.flags = ...;
    obj.type = BINDER_TYPE_HANDLE;
    obj.binder = 0;
    obj.handle = handle;
    return finishFlattenBinder(binder, obj);
}
```

`finishFlattenBinder` 负责： **把 `flat_binder_object` 的偏移追加到 offsets 数组**，然后把这些字节写进负载。

* * *

## 6\. 安全上下文：binder_transaction_data_secctx

Android 10（Q）引入。原来服务端要知道「调用方是谁的 SELinux 上下文」，得去读 `/proc/<pid>/attr/current` ，这有 TOCTOU 竞态（读的瞬间进程可能已经 exec 了别的程序）。

Android 10 起，内核在创建 `binder_proc` 时缓存一次 secctx，随事务一起下发：

```c
struct binder_transaction_data_secctx {
	struct binder_transaction_data transaction_data;  /* 就是上面那个结构 */
	binder_uintptr_t               secctx;            /* 指向"进程名:类型:类别"字符串 */
};
```

对应用户态的新命令 `BR_TRANSACTION_SEC_CTX` ：

```cpp
// IPCThreadState::executeCommand()
case BR_TRANSACTION_SEC_CTX:
case BR_TRANSACTION:
{
    binder_transaction_data_secctx tr_secctx;
    binder_transaction_data& tr = tr_secctx.transaction_data;

    if (cmd == (int) BR_TRANSACTION_SEC_CTX) {
        result = mIn.read(&tr_secctx, sizeof(tr_secctx));   // 带 secctx
    } else {
        result = mIn.read(&tr, sizeof(tr));                 // 老格式，无 secctx
        tr_secctx.secctx = 0;
    }
    // ...
}
```

* * *

## 7\. 命令全表：BC\_ 和 BR\_

这些是用户态和内核之间的「指令集」，定义在 `include/uapi/linux/android/binder.h` 。

### 7.1 用户态 → 内核（BC\_ = Binder Command）

| 命令  | 参数  | 含义  |
| --- | --- | --- |
| `BC_TRANSACTION` | `binder_transaction_data` | 发起一次调用 |
| `BC_REPLY` | `binder_transaction_data` | 回复一次调用 |
| `BC_FREE_BUFFER` | `binder_uintptr_t` | 告诉内核「这个事务缓冲区我用完了，可以回收」 |
| `BC_ENTER_LOOPER` | —   | 本线程作为 Binder 主循环线程（不退出） |
| `BC_EXIT_LOOPER` | —   | 用完就退出主循环 |
| `BC_REGISTER_LOOPER` | —   | 注册为 Binder 线程池成员（线程由 `BR_SPAWN_LOOPER` 催生） |
| `BC_INCREFS` | `uint32_t handle` | 对该 handle 增加 **弱引用** |
| `BC_ACQUIRE` | `uint32_t handle` | 对该 handle 增加 **强引用** |
| `BC_RELEASE` | `uint32_t handle` | 强引用减一 |
| `BC_DECREFS` | `uint32_t handle` | 弱引用减一 |
| `BC_REQUEST_DEATH_NOTIFICATION` | `binder_uintptr_t handle, binder_uintptr_t cookie` | 注册死亡通知 |
| `BC_CLEAR_DEATH_NOTIFICATION` | `binder_uintptr_t handle, binder_uintptr_t cookie` | 注销死亡通知 |
| `BC_DEAD_BINDER_DONE` | `binder_uintptr_t` | 处理完死亡通知 |
| `BC_ATTEMPT_ACQUIRE` | —   | 已废弃（旧版弱引用升级强引用） |

### 7.2 内核 → 用户态（BR\_ = BindeR Return）

| 命令  | 参数  | 含义  |
| --- | --- | --- |
| `BR_ERROR` | `int32_t` | 出错  |
| `BR_OK` | —   | 成功  |
| `BR_TRANSACTION` | `binder_transaction_data` | **有调用来了，去执行** |
| `BR_TRANSACTION_SEC_CTX` | `binder_transaction_data_secctx` | 同上，附带 SELinux 上下文（Android 10+） |
| `BR_REPLY` | `binder_transaction_data` | **你之前发起的调用有结果了** |
| `BR_TRANSACTION_COMPLETE` | —   | 你提交的事务已被内核接收（不代表对方已处理） |
| `BR_SPAWN_LOOPER` | —   | 让用户态 **新建一个 Binder 线程** |
| `BR_NOOP` | —   | 空操作（内核内部用） |
| `BR_DEAD_REPLY` | —   | 对方进程已死，回复无法送达 |
| `BR_FAILED_REPLY` | —   | 事务处理失败 |
| `BR_INCREFS` | `handle, cookie` | 内核要求 **对象拥有者** 建立弱引用 |
| `BR_ACQUIRE` | `handle, cookie` | 内核要求对象拥有者建立强引用 |
| `BR_RELEASE` | `handle, cookie` | 内核通知对象拥有者：可以释放强引用了 |
| `BR_DECREFS` | `handle, cookie` | 内核通知对象拥有者：可以释放弱引用了 |
| `BR_DEAD_BINDER` | `binder_uintptr_t cookie` | **你关注的对象死了** |
| `BR_CLEAR_DEATH_NOTIFICATION_DONE` | `binder_uintptr_t cookie` | 注销死亡通知完成 |
| `BR_ATTEMPT_ACQUIRE` | —   | 已废弃 |
| `BR_FINISHED` | —   | 已废弃 |
| `BR_DEAD_BINDER` / `BR_DEAD_REPLY` | 见上  |     |

### 7.3 生命周期示意

![7.3 生命周期示意（图 3）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a9644068481cf4a0.png)

* * *

## 8\. ioctl 命令一览

除了最重要的 `BINDER_WRITE_READ` ，驱动还提供这些 ioctl：

| ioctl | 作用  | 谁用  |
| --- | --- | --- |
| `BINDER_WRITE_READ` | 读写命令流/返回流（**唯一的数据通道**） | 所有进程 |
| `BINDER_SET_MAX_THREADS` | 设置本进程 Binder 线程池上限 | `ProcessState` 构造时 |
| `BINDER_SET_CONTEXT_MGR` | 注册自己为 ServiceManager（**只能调用一次**） | `servicemanager` |
| `BINDER_SET_CONTEXT_MGR_EXT` | 同上，可指定 secctx | Android 12+ |
| `BINDER_THREAD_EXIT` | 线程退出时通知内核 | `IPCThreadState` 析构 |
| `BINDER_VERSION` | 查询驱动协议版本 | `ProcessState` 构造时 |
| `BINDER_ENABLE_ONEWAY_SPOOFING` | 允许发送带伪造 pid 的 oneway 事务 | 某些系统服务 |
| `BINDER_GET_NODE_DEBUG_INFO` / `BINDER_GET_NODE_INFO_FOR_REF` | 调试信息 | debugfs / dumpsys |

* * *

## 9\. 一次事务在内核缓冲区里的完整样貌

把前面所有东西拼起来。发送方 `mOut` 里的字节（假设负载中只有一个 `String "hi"` ）：

```haskell
偏移   内容                                        说明
────   ────────────────────────────────────────   ──────────────────────────
0x00   04 00 00 00  ...                            BC_TRANSACTION (0x40046301)
0x04   ┌─ binder_transaction_data ─────────────┐
       │ target.handle = 42  (与 ptr 是 union) │   目标句柄
       │ target.ptr    = 0  (发送方不填)       │   内核会把它换成 node->ptr
       │ cookie        = 0  (发送方不填)       │   内核会把它换成 node->cookie
       │ code          = 1  (TRANSACTION_echo) │   方法号
       │ flags         = 0                     │   同步
       │ sender_pid    = 0    ← 内核填充       │
       │ sender_euid   = 0    ← 内核填充       │
       │ data_size     = 48                    │
       │ offsets_size  = 0                     │
       │ data.ptr.buffer  = 0x7f0012340000  ───┼─→ 指向下面的负载
       │ data.ptr.offsets = 0x000000000000     │   没有 offsets（无 Binder 对象）
       └───────────────────────────────────────┘
0x2C   ... mOut 结束

─── data.ptr.buffer 指向的负载缓冲区 ───
0x00   10 00 00 00 ...  "com.example.IMyService\0\0"   writeInterfaceToken
0x24   02 00 00 00                                     String 长度 = 2
0x28   'h' 00 'i' 00                                  UTF-16LE "hi"
0x2C   00 00 00 00                                     NUL 结尾
```

内核处理时：

1.  `binder_transaction_data` 被 **按值拷到内核栈** （ `binder_ioctl_write_read` 里 `copy_from_user` ）。
2.  `data.ptr.buffer` 指向的 **负载** 被拷到 **目标进程** 的 binder 缓冲区（一次拷贝，见第 4 章）。
3.  `flat_binder_object` （如果有）被就地翻译成 handle。

* * *

## 10\. 小结：封装的三层

![10\. 小结：封装的三层（图 4）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3a9e4e65b700d7d1.png)

-   **语义层 → 序列化层**：AIDL 生成的 `Proxy` 用 `Parcel` 把参数写成字节。
-   **序列化层 → 事务层**： `writeTransactionData` 把 `Parcel` 的地址和大小塞进 `binder_transaction_data` ，加上 `code` 和 `handle` 。
-   **事务层 → 传输层**： `talkWithDriver` 把 `BC_TRANSACTION` 和 `binder_transaction_data` 拼进 `mOut` ，通过 `BINDER_WRITE_READ` 交给内核。

* * *

下一章： [`03-RPC原理.md`](https://akjoson.github.io/2026/11/11/03-rpc%E5%8E%9F%E7%90%86/) —— 句柄和代理模式是怎么让「远程调用」看起来像「本地调用」的。

* * *

通过Claude生成。
