---
title: 【看雪】Vibe了一个Binder监控App行为的小玩具
source: https://bbs.kanxue.com/thread-291885.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-05T21:45:51+08:00
trace_id: 841bf968-f3a3-45cd-b06c-1545cd5825f4
content_hash: e6c9104cc563073f6fb3cd3ed83f3957339bca25f3ae4f7b0f33dd8c3495f6f1
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 该工具扩展了Binder消息跟踪，支持监控请求和响应，通过debug_id关联帧对并解析内容，以辅助逆向分析和行为检测。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 39475244-d011-8134-b46c-ed0e1df51f48
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 该工具扩展了Binder消息跟踪，支持监控请求和响应，通过debug_id关联帧对并解析内容，以辅助逆向分析和行为检测。
> 
> - **请求与响应关联：** 使用debug_id唯一标识Binder事务，将twoway调用的request和reply帧配对，实现完整监控，便于分析请求是否暴露痕迹。
> 
> - **获取debug_id的方法：** reply帧通过transaction_stack直接读取debug_id；request帧通过入口kprobe和raw_tracepoint，结合cookie桥接技术关联Parcel内容与debug_id。
> 
> - **Parcel解析能力：** 兼容Android O/P/Q+版本，支持系统HIDL和App私有AIDL的反射解析，并采用启发式扫描作为兜底方案识别未知接口。
> 
> - **堆栈解析功能：** 利用eBPF的bpf_get_stack获取用户态调用栈，结合运行时符号解析，提供完整调用信息，便于深入跟踪Binder调用来源。
> 
> - **工具适用条件：** 需要已root手机和GKI内核5.10+版本，用于App行为监控、风控对抗和逆向分析场景。

Vibe了一个Binder消息跟踪小玩具. 本质上是在 [大佬的基础](https://bbs.kanxue.com/thread-281895-1.htm) 上做了一些拓展和完善. 测了一些厂商的App,发现用来做行为检测还算不错,能给逆向分析提供一些"灵感". 于是放出来大家一起玩儿.

## 除了参数还要响应

null-luo佬的btrace只做了Binder的请求监控,但是我们在实际逆向分析过程中除了看请求也有看响应内容的需求.尤其是在做风控对抗时,不看响应难以判断这个Binder请求是否暴露了什么痕迹.

Binder请求是可以分为 **oneway** (只调用无响应)和 **twoway** (调用完了还有响应内容)的. oneway请求自然是只抓请求就可以,但是twoway请求,除了App发起调用时的一次Binder调用,目标返回响应其实也是一次Binder调用.

**举个例子:**

> App调用PMS的getPackageInfo方法时, App会先把参数通过Binder消息发送给PMS,而后这个发送Binder消息的线程变成同步阻塞状态. 当PMS把响应Binder消息返回过来以后,App的线程才会继续向下执行.

每一个Binder消息都会经过binder_transaction,而这个函数的第4个参数就是reply标志位.如果标志位被置1,就证明当前的消息是一个relpy的消息.

但是只能判断出reply对于我们的需求还远远不够,只有把请求和响应一一对应起来,我们才能知道这一次Binder调用的真实情况.

这里我通过debug_id来将两个请求帧关联起来. debug_id是内核在创建每一笔事务时分配的编号,全局唯一而且稳定,一笔事务从request到reply自始至终都是同一个debug_id.

## 如何拿到两个消息的debug_id

### reply帧

twoway请求中的reply消息,在到达binder_transaction函数时结构体内已经有了debug_id,直接读就行.

reply是服务端(比如PMS)处理完请求以后发回来的,这个时候服务端线程的 `thread->transaction_stack` 上还挂着当初那笔request的binder_transaction对象(内核里管它叫in_reply_to), debug_id就是它的一个属性.

### request帧

沿用btrace在binder_transaction入口的Hook点,可以直接拿到请求Parcel消息内容,但request的struct binder_transaction结构体要到函数体里才被内核创建出来,所以这里我又加了两个Hook点来关联出来request的Parcel内容和debug_id.

首先是在binder_transaction上挂了一个raw_tracepoint. tracepoint的触发点在函数体里,这时候相关结构体已经建好了,debug_id能读到.

但这又带出一个新问题: 入口kprobe上报的"事件本体"和raw_tracepoint上报的debug_id是分两次发出去的,单次直接发的话会因为ebpf的限制而导致ebpf加载失败. 所以这里又加了第二个Hook点,来关联前后的Parcel消息和debug_id.

单个request的入口kprobe和raw_tracepoint,跑在同一个线程、同一次函数调用里,中间不会切走. 所以在入口处先分配一个cookie写进 `pending_map[tid]`,实现Parcel和中间态的映射,等raw_tracepoint触发时,按当前tid把中间态cookie取回来,和debug_id一起上报.

## 两条Parcel帧配对

到这里两条路径就都打通了:

-   **request帧**: cookie桥接,由raw_tracepoint把debug_id绕回来补上
-   **reply帧**: 顺着transaction_stack直读

两条帧都带上了debug_id以后,最终的App端只要看谁和谁的debug_id相等,就能把一次twoway调用的request和reply重新拼回一对.

## Parcel内容解析

btrace受限于纯Golang的原因,只能用离线跑再持久化的方式来解析包名&方法名. 这里我补齐了动态反射的能力,还额外加了App私有的AIDL解析.

## 1.反射获取

Binder消息中自带了调用方和被调用方的UID,有了这个信息就可以得到基础包名信息.而进一步的接口名和方法名就需要进一步对Parcel内容进行解析了.

这里我兼容了Android O / Android P / Android Q+ 三种格式的Binder消息. 同时针对于系统驱动的HIDL做了单独适配,如果还是不能覆盖,则会采用所谓的"启发式"推理,根据数据格式大致推测一个结构. 这个不保准,所以会单独标注出来.

以上手段都是对系统标准Binder接口的解析,为了防止某些App内部也是用Binder做通信,或者作为Binder服务提供服务. 我还额外加了一个外置App AIDL的扫描功能,把监控目标的dex复制到私有目录并加载,遍历里面的aidl来用于识别.

## 2\. 接口缓存

在实际监控过程中,会在后台扫描系统 App 和已监控过的 App，找所有 `$Stub.DESCRIPTOR` ，建立 `interfaceName -> packageName` 索引。这样即使 sender 不是接口定义所在包，也能找到正确 APK 去反射.

## 3\. 兜底解析

如果所有的方法都没能解析出来Parcel里的内容,最后将会用btrace的method.json静态表去查,当然里面的内容我已经调整过了.

如果method.json里面也没有,则会做一个 `启发式扫描` 根据变量size猜一个类型,但是这个不保准,所以会专门标注起来.

如果猜都猜不出来,就会展示方法code,如果有需要可以自行去找相关的stub查方法.同时Parcel的内容也会用hexdump的形式展示出来,可以通过Ascii解码看到一些信息.

## 调用堆栈解析

有了基本的请求响应内容以后,我们已经对Binder通信里的内容有了一个基础认知. 但是如果我们想进一步跟进,看看某个请求是怎么回事,那就需要明确它的调用地址.

所以我又额外叠加了一个堆栈解析的功能,在内核中用 bpf_get_stack方法获取用户态fp指针并回溯,结合运行时的maps信息,做符号解析,最终得到一个完整的调用栈.

## 效果演示

这里我用Duck Detector检测器做演示.

## 消息列表

![消息列表](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6e9f92af17996d30.webp)

## 消息详情

![消息详情](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/276a1baedb26de75.webp)

## 消息检索

那个经过的.so实际上就是堆栈匹配,你可以输入指定So,如果堆栈里面出现了这个So就会匹配上.  
![消息检索](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d776a6cbf8bf5bc0.webp)

## 项目地址

> 项目地址: https://github.com/Anekys/BinderTracer
> 
> 基础使用条件: 已root的手机(推荐APatch) + GKI内核5.10+版本

这个项目是我第一个纯Vibe的小工具,没有一行手写代码, 有Bug是非常正常的~

[#工具脚本](https://bbs.kanxue.com/forum-161-1-128.htm) [#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm)
