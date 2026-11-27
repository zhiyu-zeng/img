---
title: Android Binder 消息流转全解：系列导读
source: https://akjoson.github.io/2026/11/11/00-android-binder%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC%E5%85%A8%E8%A7%A3/
source_host: akjoson.github.io
clip_date: 2026-11-27T10:57:45+08:00
trace_id: 06a67cb4-f314-4c80-8f47-f573b8215846
content_hash: b2775e41adb278a90cb1f281681c69c88207a7eb54560943b5aa46830d2cc2c6
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
notion_page_id: 42575244-d011-812b-b352-d9564271b59a
ioc: null
---

> **Android Binder 消息流转全解**
> 
> [导读 消息流转全解：系列导读](https://akjoson.github.io/2026/11/11/00-android-binder%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC%E5%85%A8%E8%A7%A3/) · [01 架构总览](https://akjoson.github.io/2026/11/11/01-%E6%9E%B6%E6%9E%84%E6%80%BB%E8%A7%88/) · [02 消息封装](https://akjoson.github.io/2026/11/11/02-%E6%B6%88%E6%81%AF%E5%B0%81%E8%A3%85/) · [03 RPC 原理](https://akjoson.github.io/2026/11/11/03-rpc%E5%8E%9F%E7%90%86/) · [04 内核数据结构](https://akjoson.github.io/2026/11/11/04-%E5%86%85%E6%A0%B8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/) · [05 完整消息流转](https://akjoson.github.io/2026/11/11/05-%E5%AE%8C%E6%95%B4%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC/) · [06 进阶专题](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) · [07 源码索引与调试](https://akjoson.github.io/2026/11/11/07-%E6%BA%90%E7%A0%81%E7%B4%A2%E5%BC%95%E4%B8%8E%E8%B0%83%E8%AF%95/)

本目录从「一次跨进程调用到底发生了什么」这个问题出发，自顶向下拆解 Android Binder：

-   应用层写的 `service.echo("hi")` 是怎么变成一次系统调用的？
-   RPC 是怎么实现的（代理模式 / 句柄 / 对象引用）？
-   数据是怎么被打包成 `Parcel` 和 `binder_transaction_data` 的？
-   内核驱动拿到数据后怎么找到目标进程、怎么投递、怎么唤醒对方？
-   对端怎么解包、执行、把结果送回来？

* * *

## 文档目录

| 文件  | 内容  | 适合什么时候看 |
| --- | --- | --- |
| [`01-架构总览.md`](https://akjoson.github.io/2026/11/11/01-%E6%9E%B6%E6%9E%84%E6%80%BB%E8%A7%88/) | Binder 的四层架构、四个角色、三个 Binder 域、与 AIDL/HIDL 的关系 | 第一遍，建立全局图景 |
| [`02-消息封装.md`](https://akjoson.github.io/2026/11/11/02-%E6%B6%88%E6%81%AF%E5%B0%81%E8%A3%85/) | `Parcel` 序列化格式、 `flat_binder_object` 、 `binder_transaction_data` 、 `binder_write_read` 、 `BC_/BR_` 命令全表 | 想搞清楚「字节是怎么排的」 |
| [`03-RPC原理.md`](https://akjoson.github.io/2026/11/11/03-rpc%E5%8E%9F%E7%90%86/) | 代理-桩模式、AIDL 生成代码逐行解析、句柄机制、 `transact` / `onTransact` 语义契约 | 想搞清楚「怎么实现远程调用」 |
| [`04-内核数据结构.md`](https://akjoson.github.io/2026/11/11/04-%E5%86%85%E6%A0%B8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/) | `binder_proc` / `binder_thread` / `binder_node` / `binder_ref` / `binder_buffer` 、mmap 与「一次拷贝」 | 想搞清楚「内核里到底存了什么」 |
| [`05-完整消息流转.md`](https://akjoson.github.io/2026/11/11/05-%E5%AE%8C%E6%95%B4%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC/) | **核心**：一次同步 RPC 的端到端 12 步时序、oneway、回调、ServiceManager 注册 | 想一次把链路串起来 |
| [`06-进阶专题.md`](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/) | 引用计数、死亡通知、oneway 队列、线程池、SELinux secctx、fd 传递、大小限制 | 想把细节补齐 |
| [`07-源码索引与调试.md`](https://akjoson.github.io/2026/11/11/07-%E6%BA%90%E7%A0%81%E7%B4%A2%E5%BC%95%E4%B8%8E%E8%B0%83%E8%AF%95/) | AOSP 源码路径表、关键函数索引、debugfs/dumpsys/systrace 调试手法、学习路径、自测题 | 想去读源码 / 排查问题 |

图源文件在 [`diagrams/`](https://akjoson.github.io/assets/binder/diagrams/README.md) 目录（`.mmd` 格式，可独立渲染）。

可运行的完整示例在 [`examples/`](https://akjoson.github.io/assets/binder/examples/README.md) 目录（`.aidl` + 生成代码 + 服务端/客户端 Java 与 C++ 实现 + `Android.bp` ）。

* * *

## 30 秒速查

### 一条调用链（Java 同步 RPC）

```css
App 代码
  └─ IMyService.Stub.Proxy.echo()          // AIDL 生成，写 Parcel
      └─ BinderProxy.transact(code, data, reply, flags)   // Java native 方法
          └─ BpBinder::transact()          // native libbinder
              └─ IPCThreadState::transact()
                  ├─ writeTransactionData(BC_TRANSACTION, tr)  // 打包
                  └─ talkWithDriver()                          // ioctl
                      └─ ioctl(/dev/binder, BINDER_WRITE_READ, &bwr)
                          ══════════ 进入内核 ══════════
                          binder_ioctl_write_read()
                            ├─ binder_thread_write() → binder_transaction()
                            │     ├─ handle → binder_ref → binder_node → 目标进程
                            │     ├─ 在「目标进程」的 binder buffer 里分配空间
                            │     ├─ 把负载从发送方用户空间拷贝进去（就这一次拷贝）
                            │     └─ 唤醒目标线程的 todo 队列
                            └─ binder_thread_read() → 返回 BR_TRANSACTION
                          ══════════ 回到用户态 ══════════
                      └─ executeCommand(BR_TRANSACTION)
                          └─ BBinder::transact() → onTransact()
                              └─ JavaBBinder(JNI) → Binder.execTransact()
                                  └─ IMyService.Stub.onTransact() → 真正的实现
                                      └─ 写 reply Parcel → BC_REPLY（原路返回）
```

### 三个最容易混淆的名词

| 名词  | 在哪一层 | 是什么 |
| --- | --- | --- |
| `Binder` / `BinderProxy` | Java 层 | `android.os.Binder` 是 **本地对象** （服务端）， `android.os.BinderProxy` 是 **远程代理** （客户端） |
| `BBinder` / `BpBinder` | Native 层 | 同上，是 Java 两个类的 native 对应物 |
| `binder_node` / `binder_ref` | 内核层 | `node` 是「实体」（服务端进程里的对象）， `ref` 是「引用」（客户端进程指向它的句柄记录） |

**一句话记忆**： `handle` （句柄）是 **内核发给客户端进程的一个整数**，客户端进程拿它去跟内核说「我要调用这个对象」；内核再用自己的 `binder_ref → binder_node` 映射找到真正的服务端对象。

### 四个角色

| 角色  | 说明  |
| --- | --- |
| **Client** | 发起调用的一方，持有 `handle` |
| **Server** | 提供实现的一方，持有真正的 Binder 对象（ `binder_node` ） |
| **ServiceManager** | 名字服务，句柄固定为 `0` ，负责 `addService` / `getService` |
| **Binder 驱动** | 内核里的「邮局」，负责对象引用翻译、内存分配、线程唤醒 |

### 三个 Binder 域（三个设备节点）

| 设备节点 | 用途  | 谁在用 |
| --- | --- | --- |
| `/dev/binder` | 框架层 Binder | 应用、system_server |
| `/dev/hwbinder` | HIDL / AIDL over hwbinder | HAL 硬件抽象层 |
| `/dev/vndbinder` | Vendor Binder | vendor 进程之间 |

* * *

## 建议的阅读顺序

1.  **先看图**： `diagrams/01-整体架构.mmd` 、 `diagrams/02-对象模型.mmd`
2.  **再看时序**： [`05-完整消息流转.md`](https://akjoson.github.io/2026/11/11/05-%E5%AE%8C%E6%95%B4%E6%B6%88%E6%81%AF%E6%B5%81%E8%BD%AC/) 里的时序图（不用抠细节，先建立主线）
3.  **然后补封装**： [`02-消息封装.md`](https://akjoson.github.io/2026/11/11/02-%E6%B6%88%E6%81%AF%E5%B0%81%E8%A3%85/) （ `Parcel` / `binder_transaction_data` ）
4.  **然后补 RPC**： [`03-RPC原理.md`](https://akjoson.github.io/2026/11/11/03-rpc%E5%8E%9F%E7%90%86/) （代理模式 / 句柄）
5.  **最后补内核**： [`04-内核数据结构.md`](https://akjoson.github.io/2026/11/11/04-%E5%86%85%E6%A0%B8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/) + [`06-进阶专题.md`](https://akjoson.github.io/2026/11/11/06-%E8%BF%9B%E9%98%B6%E4%B8%93%E9%A2%98/)
6.  **动手**： [`07-源码索引与调试.md`](https://akjoson.github.io/2026/11/11/07-%E6%BA%90%E7%A0%81%E7%B4%A2%E5%BC%95%E4%B8%8E%E8%B0%83%E8%AF%95/) 里的 debugfs 手法

> 注：本文档以 AOSP `main` /近期分支（Android 12~15）为准。Binder 的 **用户态协议** （ `BC_/BR_` 命令、 `binder_transaction_data` 布局）自 2008 年以来基本稳定； **内核实现** （ `binder_alloc` 、 `binderfs` 、 `BR_TRANSACTION_SEC_CTX` ）随版本有演进，文中会标注引入版本。

* * *

通过Claude生成。
