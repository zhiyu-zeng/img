---
title: ARM64 Trace 检测 - Yuuki
source: https://yuuki.cool/posts/dbidetect/dbi_detect/
source_host: yuuki.cool
clip_date: 2026-07-29T09:36:00+08:00
trace_id: f80fd7a9-0b2c-49fd-b9d6-5cf7a735177c
content_hash: ca0fbeb6b3d5afe332294e7dc75566b465c09f9b19b230cf9b900cf10af95445
status: synced
tags:
  - Android逆向
  - 反调试
series: null
feed_source: null
ai_summary: TL;DR：基于内核信号上下文泄露的物理PC，可检测ARM64动态二进制插桩（DBI）trace，并提供了异步采样与BRK异常两种同步方案。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3ac75244-d011-81bf-8330-f692deb2d2e9
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：基于内核信号上下文泄露的物理PC，可检测ARM64动态二进制插桩（DBI）trace，并提供了异步采样与BRK异常两种同步方案。
> 
> - **检测原理：** DBI执行时代码被翻译到可执行内存，导致Guest PC与Physical PC分离，内核在信号上下文中保存的PC会泄露真实物理PC，若不在原始代码段则证明存在trace。
> - **异步采样方案：** 通过watchdog线程发送SIGUSR2信号，目标线程在汇编探针窗口内采集8个PC样本，任一落在窗口外即记为强证据，因其观察时机随机，较难被针对性规避。
> - **BRK异常方案：** 执行brk #0x4d2触发SIGTRAP，handler记录异常现场PC并与编译期标记的预期地址比较，若不一致或异常未被内核处理（被DBI模拟）则同样判定为命中。
> - **实现与应用：** 对外提供DBI_TRACE_DETECTED()宏，直接在函数内展开探针，获得强证据后进程级持久化状态，避免后续漏检；在Frida stalker等环境下实测异步样本全部在窗口外，BRK的pc也指向错误地址。
> - **设计思路：** 整体不依赖工具名称、模块特征或字符串，仅验证目标函数是否符合原生执行的不变量，可通过在VM内运行完整函数并结合后端验签标记异常，提升逆向分析成本。

## DBI Trace 检测

项目地址： [dbi_detect](https://github.com/SoyBeanMilkx/dbi_detect)

## 0x00 前言

上周让 AI 分析了几个大厂 VMP 样本，只给 trace 日志，两天秒了三个 VMP ，而且两天是因为，iOS端 APP 主程序太大了，最大的一个有 900MB ，两天里面有 1.9 天浪费在 IDA 反编译上。基本上 AI 40分钟左右搞定一个，给我吓哭了。这还原算法的成本还是太低了

这个问题产生的原因主要有两点吧：

1.  AI 太强，但这是必然的趋势，谁也阻止不了
2.  trace 日志太容易获取了，这个可以搞搞，这也是本文的主题

当然我的日常工作主要聚焦在 iOS 端，所以本文后续的 检测内容都是基于 Android 平台的ovo

## 0x01 DBI 原理

官方的说法：DBI全称Dynamic Binary Instrumentation，动态二进制插桩。它可以在程序运行期间分析、重写原始机器码，并在其中插入回调、计数、访存记录等逻辑

我们以QBDI这类用户态DBI为例，它大概会经历下面几个步骤：

1.  从原始程序读取一个basic block
2.  解码并修补其中与PC、控制流相关的指令
3.  插入trace或分析代码
4.  把翻译结果写入一块可执行内存，也就是code cache
5.  CPU执行code cache中的新指令
6.  basic block结束后回到DBI调度器，继续翻译或查找下一个块

![原生执行与DBI执行路径](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/dfe2274420c21209.bin)

QBDI官方文档对这个过程描述得很直接：DBI核心依赖JIT重编译，插桩后的basic block会写入可执行内存，并保存在code cache中避免重复翻译

那么这时会同时就会存在两套PC概念：

-   **Guest PC** ：站在原始程序视角，当前执行到了哪个地址
-   **Physical PC** ：CPU此刻真正取指的地址

原生执行时，两者基本一致，都位于目标SO的`.text` 中。进入DBI后，Guest PC仍然可以被维护成原始地址，但Physical PC通常已经落在code cache或者DBI调度路径里了

当然，你可能会想那我直接写一句 `ADR` 读取PC不就行了吗

实际测下来确实没啥卵用，原始指令 `adr x8, #4` 执行后，DBI给出的 `x8` 仍然是下一条Guest指令的地址，结果依旧落在目标 so 代码段内

因为 `ADR` 本身也会被DBI翻译，它可以在重定位时维持Guest PC语义，所以我们需要找一个不完全受DBI控制的观察者

Linux内核正好可以充当这个观察者

## 0x02 检测方案

**从信号上下文偷看真实PC**

Linux向用户态线程投递信号时，会保存线程被打断瞬间的寄存器上下文。使用 `SA_SIGINFO` 安装handler后，可以从第三个参数拿到 `ucontext_t` ，ARM64下的PC位于：

```c
ucontext_t *context = raw_context;
uintptr_t pc = (uintptr_t) context->uc_mcontext.pc;
```

如果目标函数原生执行，内核保存的PC应该落在我们预先确定的探针窗口内。如果目标函数已经被翻译到code cache执行，而DBI又没有额外虚拟化信号上下文，那么这里就会泄露Physical PC

围绕这个思路，当前检测流程如下：

![DBI Trace检测流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8bbfe4c08b7c31ea.bin)

图里虽然有一个watchdog线程，但它不是后台轮询检测线程。它平时阻塞在条件变量上，只在受保护函数主动执行检测宏时被唤醒，本质上仍然是同步检测

### 0x02.1 异步 PC 采样

我们不能在整个业务函数执行期间要求PC始终位于目标SO，因为业务函数可能正常调用 `libc` 、系统库或者其他SO

所以宏里放了一段纯汇编探针窗口。窗口内部不调用外部函数，也不执行系统调用，只维护几个状态并等待采样完成：

```asm
adr x9, 1f
str x9, [state, async_begin]
adr x9, 4f
str x9, [state, async_end]

:
    mov  w10, #1
    stlr w10, [active]
:
    ldr  w10, [sample_count]
    cmp  w10, #8
    b.hs 3f
    ldr  w10, [stop]
    cbz  w10, 2b
:
    stlr wzr, [active]
:
```

`async_begin` 和 `async_end` 都是由 `ADR` 在运行时生成的实际地址，因此ASLR不会影响判断

检测第一次运行时会创建一个共享watchdog线程，此后它一直休眠，只有探针开始前才被唤醒

目标线程进入汇编窗口并设置 `active` 后，watchdog通过 `pthread_kill()` 向目标线程发送 `SIGUSR2` 。handler从 `ucontext_t` 保存PC，watchdog等待本次样本写入后再发送下一次，一共采集8个样本

这里不能简单地连续发送8次普通信号，因为非实时信号会合并，最后可能只收到一次

最终判断很朴素：

```c
if (pc < async_begin || pc >= async_end) {
    outside_count++;
}
```

只要有一个有效样本落在窗口外，就记录一项强证据

如果信号被延迟或者没有拿到样本，则不能单凭这一点判断存在DBI。调度抖动、信号屏蔽和设备负载都有可能造成相同现象，所以当前实现只把明确的窗口外PC当成命中

### 0x02.2 BRK 异常上下文

异步采样依赖另一个线程和信号调度，优点是触发时机不容易预测，缺点是流程稍微复杂一些。第二种方案就简单粗暴一点，直接主动制造一次同步异常

探针在编译时记录 `BRK` 标签地址，然后执行：

```asm
adr x9, 5f
str x9, [state, brk_expected]

:
    brk #0x4d2
```

原生执行时， `BRK` 触发 `SIGTRAP` ，内核交给handler的PC应当等于 `brk_expected` 。handler记录PC、SP和LR，再把上下文中的PC增加4字节，跳过当前ARM64指令继续执行：

```c
g_trap.pc = (uintptr_t) context->uc_mcontext.pc;
g_trap.sp = (uintptr_t) context->uc_mcontext.sp;
g_trap.lr = (uintptr_t) context->uc_mcontext.regs[30];
g_trap.seen = 1;
context->uc_mcontext.pc += 4;
```

结束时检查：

```c
if (trap_seen == 0 || trap_pc != trap_expected) {
    strong_count++;
}
```

如果 `BRK` 在code cache中执行，而DBI直接把异常交给内核， `ucontext_t.pc` 就可能指向code cache。如果DBI不执行 `BRK` ，而是自己模拟后续流程，那 `trap_seen` 就可能一直是0

这两个结果都和原生语义不一致

这两种方案本质上都在检查PC，但观察时机不同：

| 方案  | 触发方式 | 观察内容 | 特点  |
| --- | --- | --- | --- |
| 异步采样 | Watchdog跨线程发送 `SIGUSR2` | 被随机打断瞬间的PC | 时机不固定，DBI较难只针对固定点处理 |
| BRK异常 | 目标线程执行 `BRK` | 同步异常现场的PC | 触发确定，实现简单，但更容易被专门模拟 |

单独使用 `BRK` ，DBI可以识别这条固定指令并伪造异常现场。单独依赖异步采样，又会受到调度和信号投递的影响。两种方案一起上，就需要同时处理异步中断和同步异常两条路径

最终结果使用进程级sticky状态：

```c
if (result->strong_count != 0) {
    atomic_store_explicit(&g_detected, 1, memory_order_release);
}
```

一旦任意一次检测获得强证据，后续调用都会继续返回已检测状态，不会因为下一次刚好没有采到异常PC又恢复正常

## 0x03 实现流程

具体建议直接去拉源码看一下。实现上没有搞得太复杂，对外只留了一个 `DBI_TRACE_DETECTED()` 宏，直接插在想保护的函数里就行

```c
void getSign(const char *domain, char output[33]) {
    if (DBI_TRACE_DETECTED()) {
        sha256_hex32((const uint8_t *) domain, strlen(domain), output);
        return;
    }

    md5_hex((const uint8_t *) domain, strlen(domain), output);
}
```

宏内部大概就是跑一轮探针，然后返回进程级检测状态

```c
#define DBI_TRACE_DETECTED()                 \
    ({                                       \
        dbi_result_t result;                 \
        DBI_TRACE_GUARD(&result);            \
        result.detected;                     \
    })
```

完整流程可以压缩成下面几步：

```text
唤醒watchdog
    -> 进入汇编窗口
    -> 异步采样8次PC
    -> 执行BRK并记录异常PC
    -> 汇总两边的结果
```

这里用宏主要是为了让探针和目标函数处在同一个插桩单元里。正常的线程级trace会继续跟进 `detector_check()` 这种callee，所以普通函数封装一般也能生效

但是instrumented range、excluded range或者模块白名单可能让范围外函数恢复原生执行，宏直接展开后就不用考虑这层配置差异了

### 实测现象

在当前ARM64测试环境中，只对 `getSign` 函数范围开启DBI trace 或 frida stalker trace：

```text
async samples = 8
outside samples = 8
trap pc != expected pc
```

原生执行时，异步样本全部位于探针窗口内， `SIGTRAP` 中的PC也等于 `BRK` 地址。进入trace后，两条路径都观察到了范围外PC

应用层用真实MD5作为对照，未命中时 `getSign` 返回正常MD5，命中后返回 `SHA-256(domain)` 十六进制结果的前32位，所以界面上两个结果是否一致就能直观看出检测状态。真正使用时，可以把完整的 `getSign` 函数放到 vm 里执行，这样逆向的成本会大很多，然后后端验签时就知道这个算法是有问题的，打上标记，集中收割，那还是很舒服的

对于这种在 vm 里检测，有问题就跳到不同分支，每个分支无法从结果看出差异的情况，有没有好的解决方案呢？有懂的大佬可以评论区指点一下

**效果展示：**

## 0x04 小结

回头看，核心其实只有一句话：

> DBI可以努力维护程序看到的Guest PC，但CPU和内核最终仍然要处理Physical PC

异步信号采样从随机中断现场观察Physical PC， `BRK` 从同步异常现场观察Physical PC。两条路径都不依赖模块名、线程名或者工具版本，只验证目标函数是否仍然符合原生执行语义

这种检测不会永远领先，也不可能一劳永逸。不过相比追着字符串和环境特征跑，我还是更喜欢直接去验证底层不变量。至少当它失效时，我们能明确知道对方补上了哪一层，而不是又把某个字符串改名了

当然还有许多其他有意思的检测方案，但是我在测试时并非百分百触发，所以这里就不过多赘述了，感兴趣的小伙伴自己多多探索吧

[](#)

Twikoo 评论管理

密码
