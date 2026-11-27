---
title: Android Binder 03：RPC 原理
source: https://akjoson.github.io/2026/11/11/03-rpc%E5%8E%9F%E7%90%86/
source_host: akjoson.github.io
clip_date: 2026-11-27T10:50:40+08:00
trace_id: 9e8249ab-5688-4e7e-bdd4-028ca8ab59d4
content_hash: 3a1fe07a8576d7467ef43f785c9fcc9f77471767f6c652de955c0322f0ddfec2
status: synced
tags: []
series: null
feed_source: 殷仔·Android Binder
ai_summary: null
ai_summary_style: null
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 42575244-d011-81c3-854b-e8e6103f91d8
ioc: null
---

> **Android Binder 消息流转全解**
> 
> [导读 消息流转全解：系列导读](https://akjoson.github.io/2026/11/11/00-android-binder%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC%E5%85%A8%E8%A7%A3/) · [01 架构总览](https://akjoson.github.io/2026/11/11/01-%E6%9E%B6%E6%9E%84%E6%80%BB%E8%A7%88/) · [02 消息封装](https://akjoson.github.io/2026/11/11/02-%E6%B6%88%E6%81%AF%E5%B0%81%E8%A3%85/) · [03 RPC 原理](https://akjoson.github.io/2026/11/11/03-rpc%E5%8E%9F%E7%90%86/) · [04 内核数据结构](https://akjoson.github.io/2026/11/11/04-%E5%86%85%E6%A0%B8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/) · [05 完整消息流转](https://akjoson.github.io/2026/11/11/05-%E5%AE%8C%E6%95%B4%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC/) · [06 进阶专题](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) · [07 源码索引与调试](https://akjoson.github.io/2026/11/11/07-%E6%BA%90%E7%A0%81%E7%B4%A2%E5%BC%95%E4%B8%8E%E8%B0%83%E8%AF%95/)

这一章回答： **`remoteService.echo("hi")` 里的 `remoteService` 到底是什么？为什么写起来跟本地对象一样？**

* * *

## 1\. RPC 的核心问题

远程调用和本地调用的根本差异：

```java
// 本地调用：编译器帮你处理一切
localService.echo("hi");
// 编译后大致是： load localService 的地址; push "hi"; call echo; pop 返回值

// 远程调用：localService 根本不在这个进程里！
remoteService.echo("hi");
// 编译器完全不知道该怎么办
```

RPC 的经典解法是 **Proxy-Stub 模式（代理模式）**：

![1\. RPC 的核心问题（图 1）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dbbadce4c66bf80e.png)

-   **Proxy（代理）**：给调用方看的假对象，接口和真实对象一模一样。它把参数序列化、发出去、等结果、反序列化。
-   **Stub（桩）**：服务端侧的骨架，接收消息、反序列化、调用真实实现、把结果序列化回去。

**Binder 做的事情就是把这个模式自动化**：你写一个 `.aidl` 文件， `aidl` 编译器帮你生成 Proxy 和 Stub 的全部代码。

* * *

## 2\. 关键抽象：IBinder

Binder 里所有跨进程对象都实现同一个接口： `android.os.IBinder` （native 侧叫 `IBinder` ）。

```java
// frameworks/base/core/java/android/os/IBinder.java
public interface IBinder {
    int FIRST_CALL_TRANSACTION  = 0x00000001;
    int LAST_CALL_TRANSACTION   = 0x00ffffff;

    int INTERFACE_TRANSACTION   = ('_'<<24)|('N'<<16)|('T'<<8)|'F';
    int DUMP_TRANSACTION        = ('_'<<24)|('D'<<16)|('M'<<8)|'P';
    int SHELL_COMMAND_TRANSACTION = ('_'<<24)|('C'<<16)|('M'<<8)|'D';
    int PING_TRANSACTION        = ('_'<<24)|('P'<<16)|('N'<<8)|'G';
    int TWEET_TRANSACTION       = ('_'<<24)|('T'<<16)|('W'<<8)|'T';
    int LIKE_TRANSACTION        = ('_'<<24)|('L'<<16)|('I'<<8)|'K';

    int FLAG_ONEWAY             = 0x00000001;

    boolean transact(int code, Parcel data, Parcel reply, int flags) throws RemoteException;
    IInterface queryLocalInterface(String descriptor);
    boolean pingBinder();
    boolean isBinderAlive();
    void linkToDeath(DeathRecipient recipient, int flags);
    boolean unlinkToDeath(DeathRecipient recipient, int flags);
}
```

**关键点： `IBinder` 只有一个真正干活的方法 —— `transact` 。**

所有方法调用最终都变成 `transact(code, data, reply, flags)` 这一个调用。 `code` 是方法号， `data` / `reply` 是 `Parcel` 。这就是「面向对象 IPC」的全部秘密： **用整数编号 + 序列化参数来表达任意方法调用**。

### 两个实现类

| Java 类 | Native 类 | 什么时候出现 | `transact` 干什么 |
| --- | --- | --- | --- |
| `android.os.Binder` | `BBinder` | 服务端进程 **自己** 持有的那个对象 | **直接调 `onTransact`** （本地快路径） |
| `android.os.BinderProxy` | `BpBinder` | 客户端进程持有的 **代理** | 走 `IPCThreadState` → `ioctl` 内核 |

![两个实现类（图 2）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a7a8c721921e6f55.png)

### 最重要的一张图：android.os.Binder.transact 是本地直通

```java
// frameworks/base/core/java/android/os/Binder.java
public final boolean transact(int code, Parcel data, Parcel reply, int flags)
        throws RemoteException {
    if (data != null) {
        data.setDataPosition(0);
    }
    boolean r = onTransact(code, data, reply, flags);   // ← 没有 IPC！直接调用
    if (reply != null) {
        reply.setDataPosition(0);
    }
    return r;
}
```

**这是 Binder 的一个精妙设计**： `Binder` （本地对象）的 `transact` 就是 `onTransact` ， `BinderProxy` （远程代理）的 `transact` 才走 IPC。

这带来一个大好处： **服务端代码可以同时用于「本地调用」和「跨进程调用」**。同一份 `MyServiceImpl extends IMyService.Stub` ，在本进程内被调用时零开销，跨进程时才付出 IPC 代价。

* * *

## 3\. 句柄（handle）：跨进程的「对象引用」

### 3.1 为什么需要句柄

指针在进程间无效。Binder 的解法是： **内核给每个进程维护一张「句柄表」，句柄是这张表的索引。**

![3.1 为什么需要句柄（图 3）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f208510e15d950f6.png)

**三层对应关系**：

| 层   | 结构  | 含义  |
| --- | --- | --- |
| 客户端 | `handle` （ `uint32_t` ） | 「索引」 |
| 内核  | `binder_ref` （ `desc == handle` ） | 「索引 → 实体」的映射 |
| 内核  | `binder_node` （ `ptr` + `cookie` ） | 「实体」 |
| 服务端 | `BBinder` 对象 | 「实体」的用户态实现 |

### 3.2 句柄的几个关键性质

**① 句柄是 per-process 的。** 同一个 Binder 对象，在进程 A 里可能是 handle 42，在进程 B 里可能是 handle 7，在内核里是同一个 `binder_node` 。

**② 句柄 0 是特殊保留的**—— 它永远指向 `ServiceManager` 。内核在分配句柄时跳过 0：

```c
// drivers/android/binder.c — binder_get_ref_for_node_olocked()
	new_ref->data.desc = (node == context->binder_context_mgr_node) ? 0 : 1;
	for (n = rb_first(&proc->refs_by_desc); n != NULL; n = rb_next(n)) {
		ref = rb_entry(n, struct binder_ref, rb_node_desc);
		if (ref->data.desc > new_ref->data.desc)
			break;
		new_ref->data.desc = ref->data.desc + 1;
	}
	/* 于是新句柄总是"最小的未使用正整数" */
```

**③ 句柄是内核在第一次跨进程传输时创建的** （懒分配）。你 `bindService` 或者 `getService` 拿到一个 `BinderProxy` 时，内核就已经为你的进程建好了对应的 `binder_ref` 。

**④ 句柄有引用计数** （strong/weak），决定 `binder_ref` 和 `binder_node` 什么时候被销毁。详见 [`06-进阶专题.md`](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) 。

### 3.3 从代码看句柄的存在

```cpp
// frameworks/native/libs/binder/BpBinder.h
class BpBinder : public IBinder
{
public:
    static sp<BpBinder> create(int32_t handle, ...);
    inline int32_t handle() const { return mHandle; }
    // ...
private:
    const int32_t mHandle;   // ← 句柄就存在这里
    // ...
};
```

`BpBinder` 的全部「跨进程信息」只有这一个整数。它不知道对方在哪个进程、叫什么名字 —— 那都是内核的事。

* * *

## 4\. AIDL 生成代码逐行解析

假设接口定义：

```
// com/example/IMyService.aidl
package com.example;

interface IMyService {
    String echo(String s);
}
```

### 4.1 生成的 Java 文件（结构）

```java
package com.example;

public interface IMyService extends android.os.IInterface {

  // ═══════════════════════════════════════════════════════
  // Stub：服务端骨架（extends Binder —— 所以它是「本地实体」）
  // ═══════════════════════════════════════════════════════
  public static abstract class Stub extends android.os.Binder implements IMyService {

    public static final java.lang.String DESCRIPTOR = "com.example.IMyService";

    public Stub() {
      this.attachInterface(this, DESCRIPTOR);   // ① 把自己注册到 Binder 的接口表
    }

    // ② 客户端调用这个：把 IBinder 转成 IMyService
    public static IMyService asInterface(android.os.IBinder obj) {
      if (obj == null) return null;

      // 先试着当本地对象用（同进程优化）
      android.os.IInterface iin = obj.queryLocalInterface(DESCRIPTOR);
      if (iin != null && iin instanceof IMyService) {
        return (IMyService) iin;                // 同进程：直接返回真实对象
      }
      // 跨进程：包一层 Proxy
      return new IMyService.Stub.Proxy(obj);
    }

    @Override
    public android.os.IBinder asBinder() { return this; }

    // ③ 服务端入口：内核把 BR_TRANSACTION 送到这里
    @Override
    public boolean onTransact(int code, android.os.Parcel data,
                              android.os.Parcel reply, int flags)
            throws android.os.RemoteException {
      java.lang.String descriptor = DESCRIPTOR;
      switch (code) {
        case INTERFACE_TRANSACTION: {          // 特殊 code：返回接口描述符
          reply.writeString(descriptor);
          return true;
        }
        case TRANSACTION_echo: {               // 业务方法
          data.enforceInterface(descriptor);   // ④ 校验接口标识
          java.lang.String _arg0;
          _arg0 = data.readString();           // ⑤ 反序列化参数
          java.lang.String _result = this.echo(_arg0);  // ⑥ 调用真实实现
          reply.writeNoException();            // ⑦ 写"没有异常"
          reply.writeString(_result);          // ⑧ 序列化返回值
          return true;
        }
        default:
          return super.onTransact(code, data, reply, flags);
      }
    }

    // ═══════════════════════════════════════════════════════
    // Proxy：客户端代理
    // ═══════════════════════════════════════════════════════
    private static class Proxy implements IMyService {
      private android.os.IBinder mRemote;      // ← 通常是 BinderProxy

      Proxy(android.os.IBinder remote) { mRemote = remote; }

      @Override public android.os.IBinder asBinder() { return mRemote; }

      // ⑨ 调用方看到的接口方法
      @Override
      public java.lang.String echo(java.lang.String s) throws android.os.RemoteException {
        android.os.Parcel _data  = android.os.Parcel.obtain();
        android.os.Parcel _reply = android.os.Parcel.obtain();
        java.lang.String _result;
        try {
          _data.writeInterfaceToken(DESCRIPTOR);       // 写接口标识
          _data.writeString(s);                        // ⑩ 序列化参数
          boolean _status = mRemote.transact(Stub.TRANSACTION_echo, _data, _reply, 0);
          _reply.readException();                      // ⑪ 读"有没有异常"
          _result = _reply.readString();               // ⑫ 反序列化返回值
        } finally {
          _reply.recycle();
          _data.recycle();
        }
        return _result;
      }
    }

    // 方法号：从 FIRST_CALL_TRANSACTION 开始递增
    static final int TRANSACTION_echo = android.os.IBinder.FIRST_CALL_TRANSACTION + 0;
  }
}
```

### 4.2 调用链

![4.2 调用链（图 4）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/024b0e8770fe50b3.png)

**注意 `asInterface` 的分支**：如果 Client 和 Server 在同一个进程（比如 `bindService` 到自己的进程，或者 `LocalService` ）， `queryLocalInterface` 会返回真实的 `Stub` 对象，于是 **根本不会创建 Proxy，也不会走 IPC**。这就是 `04-消息封装.md` 里说的「本地快路径」。

### 4.3 queryLocalInterface 的实现

```java
// android.os.Binder
public IInterface queryLocalInterface(String descriptor) {
    if (mDescriptor != null && mDescriptor.equals(descriptor)) {
        return mOwner;      // 就是这个 Binder 自己（或它注册的 owner）
    }
    return null;
}

// android.os.BinderProxy
public IInterface queryLocalInterface(String descriptor) {
    return null;            // 代理永远不是"本地对象"
}
```

`attachInterface(owner, descriptor)` 就是把这个 Binder 和它的接口实现绑定起来。

* * *

## 5\. Native 层：BpInterface / BnInterface

AIDL 的 native 后端（C++）生成的代码是同一个模式的 C++ 版本：

```cpp
// 生成的 IMyService.h（简化）
class IMyService : public IInterface {
public:
    DECLARE_META_INTERFACE(IMyService)          // 声明 asInterface / asBinder
    virtual std::string echo(const std::string& s) = 0;

    enum : int32_t { TRANSACTION_echo = IBinder::FIRST_CALL_TRANSACTION };
};

// ── Bn 侧（对应 Java Stub）──
class BnMyService : public BnInterface<IMyService> {
public:
    status_t onTransact(uint32_t code, const Parcel& data, Parcel* reply,
                        uint32_t flags = 0) override {
        switch (code) {
            case TRANSACTION_echo: {
                data.checkInterface(this);                      // 等价于 enforceInterface
                std::string _arg0 = data.readString();
                std::string _result = echo(_arg0);              // 调用真实实现
                reply->writeNoException();
                reply->writeString(_result);
                return NO_ERROR;
            }
            case IBinder::INTERFACE_TRANSACTION: {
                reply->writeString(getInterfaceDescriptor());
                return NO_ERROR;
            }
        }
        return BBinder::onTransact(code, data, reply, flags);
    }
};

// ── Bp 侧（对应 Java Proxy）──
class BpMyService : public BpInterface<IMyService> {
public:
    explicit BpMyService(const sp<IBinder>& impl) : BpInterface<IMyService>(impl) {}

    std::string echo(const std::string& s) override {
        Parcel data, reply;
        data.writeInterfaceToken(IMyService::getInterfaceDescriptor());
        data.writeString(s);
        status_t err = remote()->transact(TRANSACTION_echo, data, &reply);
        if (err != NO_ERROR) return {};
        status_t exception = reply.readExceptionCode();
        if (exception != OK) return {};
        return reply.readString();
    }
};
```

`BpInterface<T>` / `BnInterface<T>` 是 `libbinder` 提供的模板基类：

```cpp
// frameworks/native/libs/binder/include/binder/IInterface.h
template<typename INTERFACE>
class BpInterface : public INTERFACE, public BpRefBase {
public:
    explicit BpInterface(const sp<IBinder>& remote) : BpRefBase(remote) {}
protected:
    IBinder* onAsBinder() override { return remote(); }   // remote() 返回 BpBinder
};

template<typename INTERFACE>
class BnInterface : public INTERFACE, public BBinder {
public:
    sp<IBinder> asBinder() override { return this; }
};
```

* * *

## 6\. transact / onTransact 的语义契约

这是 Binder 的「协议」，任何 Binder 实现都必须遵守：

### 6.1 transact(code, data, reply, flags)（调用方）

| 参数  | 约定  |
| --- | --- |
| `code` | 方法号。 `1 ~ 0x00FFFFFF` 是业务方法； `'_'` 开头的大数是 **系统保留** 的（ `INTERFACE_TRANSACTION` 等） |
| `data` | **只读** 输入 `Parcel` ，包含 `writeInterfaceToken` + 参数 |
| `reply` | **输出** `Parcel` 。可以传 `null` （不需要返回值） |
| `flags` | `0` （同步）或 `FLAG_ONEWAY` （异步） |
| 返回 `true` | 事务已送达 |
| 返回 `false` | 事务未送达（如 oneway 且失败） |
| 抛 `RemoteException` | 对端进程死亡 / 事务失败 |

### 6.2 onTransact(code, data, reply, flags)（被调用方）

| 约定  | 说明  |
| --- | --- |
| 返回 `true` | 已处理（**即使业务逻辑里抛了异常，也要返回 `true`**，异常信息通过 `writeException` 传回） |
| 返回 `false` | 不认识的 `code` ，会变成 `UNKNOWN_TRANSACTION` （ `BR_FAILED_REPLY` ） |
| 必须先 `enforceInterface` | 校验调用方接口版本 |
| 必须先 `writeNoException()` | 写「无异常」标志，否则客户端 `readException()` 会读到垃圾 |
| 参数 **只能按顺序读一次** | `Parcel` 是流式的，读错了就全错位 |

### 6.3 flags

```java
int FLAG_ONEWAY = 0x00000001;   // Java IBinder 里只有这一个
```

native 侧还有更多（见 [`02-消息封装.md`](https://akjoson.github.io/2026/11/11/02-%E6%B6%88%E6%81%AF%E5%B0%81%E8%A3%85/) 的 `transaction_flags` ）。

### 6.4 保留的 code

| code | 值   | 含义  |
| --- | --- | --- |
| `FIRST_CALL_TRANSACTION` | `0x00000001` | 业务方法从这里开始编号 |
| `LAST_CALL_TRANSACTION` | `0x00FFFFFF` | 业务方法编号上限 |
| `INTERFACE_TRANSACTION` | `0x5f4e5446` （ `_NTF` ） | 查询接口描述符 |
| `DUMP_TRANSACTION` | `0x5f444d50` （ `_DMP` ） | `dumpsys` 走这个 |
| `PING_TRANSACTION` | `0x5f504e47` （ `_PNG` ） | 存活探测 |
| `SHELL_COMMAND_TRANSACTION` | `0x5f434d44` （ `_CMD` ） | `cmd` 命令 |
| `TWEET_TRANSACTION` / `LIKE_TRANSACTION` | —   | 系统内部用于追踪 binder 调用链（Android 11+ profiling） |

> **为什么用 `'_'` 开头的 ASCII 编码？** 因为这些值超过 `LAST_CALL_TRANSACTION` ，不可能和业务方法号冲突，同时肉眼可读（ `_NTF` = iNterFace）。

* * *

## 7\. 完整对象模型图

把「一个服务从创建到被调用」的全过程画出来：

![7\. 完整对象模型图（图 5）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ccbf70424913292f.png)

### 一次「传递对象」的完整例子

A 在调用 B 时，把一个 C 服务的 Binder 作为参数传过去：

```java
// A 进程
bService.registerCallback(myCallback);   // myCallback 是 A 里实现的 IBinder
```

![一次「传递对象」的完整例子（图 6）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e7fd19baa1c83c44.png)

**这就是「回调」和「双向通信」的实现原理**—— 没有任何魔法，就是把 Binder 对象当参数序列化、内核翻译成句柄。

* * *

## 8\. 为什么 Binder 只能「一次同步调用」而不会死锁？

Binder 的一个硬性约束： **同一个 Binder 线程一次只能处理一个同步事务** （但可以处理嵌套的 **回调**）。

-   线程 T 处理 `BR_TRANSACTION` 时，如果它再发起一个同步调用给别的服务，这个「新调用」会阻塞 T。
-   如果对端也反过来调 T 所在的进程，内核会 **另起一个线程** （ `BR_SPAWN_LOOPER` ）来处理，避免死锁。
-   如果线程池满了（默认 15 + 1），就会出现经典的 **Binder 线程池耗尽死锁**：所有线程都在等对方，对方的回复没人处理。

> 相关细节见 [`06-进阶专题.md`](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) 的「Binder 线程池」。

* * *

## 9\. 小结

| 概念  | 一句话 |
| --- | --- |
| **Proxy** | 客户端侧的假对象， `transact` 走 IPC |
| **Stub** | 服务端侧的骨架， `onTransact` 被 IPC 调用 |
| **`IBinder.transact`** | RPC 的唯一原语： `(code, data, reply, flags)` |
| **句柄** | 内核发给客户端的整数索引，指向 `binder_ref` |
| **`asInterface`** | `IBinder` → 接口对象；同进程时返回真实对象（不吃 IPC 开销） |
| **回调** | 就是把 Binder 对象当参数传过去，内核翻译成句柄 |

* * *

下一章： [`04-内核数据结构.md`](https://akjoson.github.io/2026/11/11/04-%E5%86%85%E6%A0%B8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/) —— 内核里到底存了什么，为什么只有一次拷贝。

* * *

通过Claude生成。
