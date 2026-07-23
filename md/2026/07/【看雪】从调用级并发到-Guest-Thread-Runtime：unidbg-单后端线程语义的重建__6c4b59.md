---
title: 【看雪】从调用级并发到 Guest Thread Runtime：unidbg 单后端线程语义的重建
source: https://bbs.kanxue.com/thread-292140.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-23T23:33:32+08:00
trace_id: b57404f7-2d7d-45ea-9cd4-2a02aec3b092
content_hash: 06942f79401bbd5ffd4bb7d3daf9367a2af4a0ebe458ccca55309a5dc898a954
status: summarized
tags:
  - 看雪
  - 模拟执行
  - 安全工具
series: null
feed_source: 看雪·Android安全
ai_summary: 为解决 unidbg 单后端模拟多线程 native 程序时的身份混淆、状态隔离与资源回收问题，文章提出了三层身份模型和基于不可变收据的可验证事务边界。
ai_summary_style: key-points
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 3a675244-d011-8109-89d2-ca080d33996c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 为解决 unidbg 单后端模拟多线程 native 程序时的身份混淆、状态隔离与资源回收问题，文章提出了三层身份模型和基于不可变收据的可验证事务边界。
> 
> - **三代架构演进：** 第一代“原生时间片”解决多任务执行机会；第二代“调用级运行时”通过独立 generation、context 和 local-reference scope 隔离调用身份；第三代“Guest Thread Runtime” 进一步拆分 Run、GuestThread、Invocation 和 Carrier 四层身份，明确线程级状态所有权。
> - **状态隔离矩阵：** 通过强类型标识和所有权分离，确保如 TID、TLS、栈等状态仅属于 GuestThread，而 backend 驾驶权属于 Carrier，命令参数和终态属于 Invocation，确保任意两层不混用。
> - **不可变收据与事务边界：** 引入 AdmissionReceipt、CarrierRetirementReceipt 和 ReadinessReceipt 等不可变证据，将入场、退役和就绪判断转化为可验证的事务，并通过 mutation epoch 关闭 TOCTOU 窗口。
> - **三层测试策略：** 采用模型合同、生产连接合同和运行时场景三层测试，要求同时覆盖正向、负向（身份错误、状态陈旧等）、清理和并发路径，以验收所有权链的闭合性。
> - **就绪权威机制：** 最终边界通过 ReadinessAuthority 核对期望节点与实际收据的精确集合，并签发唯一消耗的 BoundaryAdmissionPermit，避免基于数量或非实时状态提前放行。

> 本文讨论的是 unidbg 在单 Unicorn 后端下模拟多线程 native 程序时的通用架构问题。文中的线程、调用、网络回调、状态节点和返回值均为抽象示例，不对应任何具体应用、接口、命令编号或业务数据。

本文承接前文 [《从时间片轮转到调用级并发：unidbg 单后端多线程架构重构》](https://bbs.kanxue.com/thread-292016.htm) 。上一篇把调度单位从 `Task` 提升到了 `Invocation` ：每次 native 调用拥有独立 record、generation、context、terminal、outcome 和 JNI local-reference scope，并通过 FIFO 在真实 safe point 上完成 backend 交接。

继续实现后，笔者又从 Invocation-Owned Runtime 改成了 Guest Thread Runtime。

原因不是时间片不能工作，也不是调用级并发方向错误，而是笔者逐渐发现： **一次调用有了独立身份，仍然不等于运行这次调用的 Android guest thread 已经被正确表达。**

宿主 Java 线程、guest Android 线程、一次 native invocation 和临时驾驶 Unicorn backend 的 carrier，是四种不同身份。只要其中任意两层仍被混用，系统就可能在看似正常的调度日志下共享错误的 TID、TLS、stack、JNIEnv、pending exception，或者把一次临时让路误判成调用已经完成。

这篇文章不再讨论某个调用如何“多跑一会儿”，而是讨论另一件更基础的事：在只有一个 backend 的前提下，如何建立一个作用域正确、失败可隔离、并且能够被合同测试证明的 guest thread runtime。

* * *

## 摘要

整个演进可以分成三代。

第一代是 native timeslice。C 后端按照指令预算主动停止，Java 调度器保存 Task 上下文，再选择下一个可运行 Task。它解决的是： **多个 guest Task 如何获得执行机会。**

第二代是 Invocation-Owned Runtime。它引入调用 record、generation、FIFO admission、exact terminal、immutable context 和 invocation-scoped JNI local references。它解决的是： **多个重叠 native 调用如何不串结果、不串上下文。**

第三代是 Guest Thread Runtime。它进一步引入 Run、GuestThreadIncarnation、TaskThreadBinding、ThreadBirthRecord、StackRegion、InvocationContinuation、CarrierLease、AdmissionReceipt、RetirementReceipt、StateStore 和 ReadinessAuthority。它要解决的是： **一次调用究竟运行在哪个 guest thread 上，谁临时拥有 backend，线程级状态属于谁，调用结束后又由什么证据证明资源可以释放。**

核心结论可以压缩成四个不等式：

```
Host Java Thread != Guest Android Thread
Carrier Task      != Guest Android Thread
Invocation        != Guest Android Thread
Observed Role     != Guest Thread Identity
```

新的设计不试图在单 backend 上伪造真 SMP，而是用确定性的交错执行，重建线程身份、调用栈、JNI 作用域、事务边界和跨节点证据。

* * *

## 一、为什么第二代仍然不够：Invocation 不等于 Guest Thread

### 1.1 第一代：从“等 safe point”改成“由 backend 主动停”

最早的 unidbg 多线程问题，是 worker 虽然已经创建，却很难获得稳定的执行机会。协作式调度依赖 syscall、JNI 回调和函数返回等偶然 safe point；如果当前 Task 长时间不主动让出，其他 Task 就只能等待。

笔者先把它改成 native timeslice：

```
guest 执行固定数量指令
  -> C backend 记录 TIMESLICE
  -> uc_emu_stop
  -> Java 保存当前 Task 上下文
  -> 调度下一个 RUNNABLE Task
```

这一步建立了可预测的停止原因，也让 futex WAIT/WAKE 和 worker 轮转第一次拥有了稳定的调度基础。

但时间片只回答“下一刻跑谁”。它不知道当前 Task 承载的是哪一次调用，也不知道一个返回值应该交给哪个宿主提交者。

#### 图一：原生时间片轮转

![图一：原生时间片轮转](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/14a2e962b927d0db.jpg)

### 1.2 第二代解决了什么：调用终于有了自己的身份

继续处理重叠调用时，笔者发现 command、last result、active context 和异常状态散落在多个全局槽位中。同一种调用连续出现两次时，仅凭 command 类别无法区分前后 generation；一个调用释放全局 JNI local refs，还可能清掉另一个暂停调用正在使用的对象。

于是笔者把系统改成 Invocation-Owned Runtime：

```
CommandInvocationRecord
  + generation
  + original submitter
  + exact carrier
  + immutable context
  + exact terminal/outcome
  + invocation local-reference scope
```

backend 仍然只有一个，但不同宿主提交者必须排队申请 admission。旧 owner 在真实 safe point 保存上下文并让路，新 invocation 才能进入；一次 backend stop 只表示交通交接，不能产生 `COMPLETED` 。

这一步解决了调用级身份。两次同类 invocation 不再因为 command 相同而共用结果槽，旧调用也不能拿新 generation 的 terminal；一个 backend stop 只是 handoff，不再自动等于调用完成。

但第二代模型仍然默认了一件事：只要 invocation 拿到了 carrier、private context 和 local-reference scope，这次调用的“线程语义”似乎也就随之成立了。

继续实现后，笔者发现这个默认前提并不成立。

#### 图二：调用级运行时

![图二：调用级运行时](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5dece49ae402b9c8.jpg)

### 1.3 第二版进入组合场景后，我们发现了什么

第二版完成后，单条 native 调用已经能够拥有独立的 generation、context 和 outcome。只看一条调用，系统的行为是合理的：提交、排队、进入 backend、返回、发布终态，各个步骤都有明确对象。

真正的问题出现在一次同步重入场景里。为了脱离具体应用，可以把它描述成下面这条完全匿名的运行：

```rust
RunContext(run-demo)
  -> GuestThread A 提交 parent invocation alpha
  -> alpha 进入 Java callback，并同步等待 child invocation
  -> GuestThread B 创建 callback child beta
  -> beta 进入普通 FIFO admission queue
  -> A 仍占有 parent carrier，等待 beta 返回
  -> beta 等待 A 释放 backend，A 又等待 beta terminal
  -> process appears hung
```

把对象身份展开后，第二版的循环等待是：

```css
thread-A#1
  -> invocation-A#1 (parent / alpha)
  -> CarrierLease lease-A#1 remains live
  -> Java callback waits for invocation-B#1

thread-B#1
  -> CallbackInstanceId callback-B#1
  -> invocation-B#1 (child / beta)
  -> AdmissionQueue waits for backend handoff

invocation-A#1 waits for invocation-B#1
invocation-B#1 waits for lease-A#1 retirement
```

这不是 backend 没有时间片，而是第二版把 child 当成普通 Invocation 处理，却没有把它建模成同一 GuestThread 上的可重入 child frame。A 必须等 B，B 又必须等 A 释放当前 owner，于是 parent/child 形成循环等待。宿主最终只能看到 future 超时或进程长期无响应。

更麻烦的是，host timeout 只结束了等待，不会自动结束 guest 执行。若调用者在同一个 Run 中立即 retry，旧的 `lease-A#1` 、parent continuation、callback mailbox 和 JNI local frame 可能仍然存活；新的 `invocation-A#2` 又使用相同 command category 进入队列。此时卡死会继续演化成 carrier 饥饿、同类节点 receipt 混淆和资源滞留：

```bash
deadlock
  -> host timeout
  -> guest owner not quiescent
  -> retry enters same Run
  -> old continuation / JNI frame / lease retained
  -> starvation or memory growth
```

![第二代同步回调重入死锁](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6d98e79bb3f8460c.jpg)

表面上，generation、parent/child record、FIFO handoff 和 JNI local frame 的单项测试都可以变绿。但最终边界真正需要回答的不是“有没有两个调用结果”，而是：

```
child 是否属于 parent 的同一 GuestThread invocation stack？
谁拥有当前 backend，谁可以安全 retirement？
timeout 之后旧 Run 是否已经 quiescent？
哪个 receipt 属于 alpha，哪个属于 beta？
所有 callback state、continuation 和 JNI frame 是否已经提交或释放？
```

第二版第一次让我们看清： **“每次调用互不串线”仍然可能在同步重入时形成进程级死锁；局部 generation 正确，也不能自动推出线程级调度、quiescence 和整条组合链正确。** 后面的六个现象，都是这条卡死场景在不同边界上的具体表现。

#### 1.3.1 同类调用都返回了，但最终边界仍可能认错节点

在上面的场景中，alpha 和 beta 使用同一种 command category。第二版能够用 generation 区分 `invocation-A#1` 和 `invocation-A#2` ，却还不能说明“这次调用在场景图中承担 alpha 还是 beta”。

于是会出现一种很隐蔽的现象：前置调用全部返回成功，数量也对，最终边界却可能拿到同类节点中较早或较晚的一枚 receipt。表面上没有串 command，也没有串 generation；真正串掉的是 **scenario identity** 。

这让我们认识到，业务图中的主键不能只是：

```
command + generation
```

还必须包含由场景配置预先声明的 typed node identity。调用记录、admission、route、terminal 和后续 consumer 都要核对同一个节点，不能在消费阶段根据“最近一次同类调用”反推。

#### 1.3.2 命令返回不等于它负责的状态已经提交

第二个现象更像“alpha、beta 和 callback 都已经返回，为什么最终边界还是不 ready”。

原因是 native return、dispatcher terminal 和跨调用状态提交是三件不同的事。 `invocation-A#1` 可以已经返回，但 alpha 的 host state 仍停留在 staging； `callback-B#1` 可以已经离开 Java adapter，但对应的 typed state 还没有和正确 instance 绑定；B 的 carrier 也可能已经停止执行，却尚未完成 dispatcher retirement。

如果最终边界只检查一组 `completed=true` ，它看到的只是调用结束，不是状态闭合。真正的 readiness 至少要同时证明：

```
正确节点已经进入 native
  + exact invocation 已经 terminal
  + producer state 已经 commit
  + carrier 已经 retirement
  + callback instance 已经绑定
  + 没有 live waiter、continuation 或 lease
```

这也是为什么第三版不再让 graph 自己拼布尔值，而是要求 authority 从多类 immutable receipt 中计算 exact closure。

#### 1.3.3 网络层的时间相邻，被误当成了 producer 关系

场景中的 `callback-B#1` 由异步会话边界触发。最初观察时，一段会话元数据和后续 callback 输入出现在相邻时间窗口、相同线程附近，很容易把它们理解成“前者经过某种转换生成后者”。

继续核对调用栈和对象身份后，我们发现两者只是相邻，并不是 producer 与 derived value 的关系：一条属于会话元数据查询，另一条来自独立 callback 边界。它们可以由不同对象、不同 instance 和不同生命周期产生。

这个发现改变了第二版中的状态传递方式。callback 不能借用前一条 command record，也不能从相邻元数据猜输入；它必须有自己的：

```
CallbackInstanceId
  + dispatcher-sealed current snapshot
  + parent invocation identity
  + callback admission receipt
  + instance-scoped committed state
```

换句话说， **时间相邻只能产生 observation，不能产生 lineage。** 没有真实 callback producer 时，正确结果是 fail closed，而不是寻找一个形状相似的值填进去。

#### 1.3.4 同一个宿主调用者，不代表同一个 Guest Thread

第二版主要围绕 invocation 隔离，因此宿主提交线程、carrier Task 和 guest thread 之间仍容易形成隐含绑定。在简单测试里，它们经常一一对应，看不出问题；进入这条组合场景后， `thread-A#1` 连续承载两次 invocation，parent 又在 callback 期间临时让出 backend， `thread-B#1` 则使用另一份线程级状态完成 child invocation。

这时，按宿主 Java thread、command role 或 carrier TID 查找状态，就可能让业务表现出下面几类问题：

-   重复节点恢复到了正确 context，却读取了另一条线程的 errno 或 pending exception；
-   child callback 返回后，parent invocation 的 JNI local frame 被错误关闭；
-   carrier 退役时连同持久 thread state 一起释放，后续节点只能重新猜测身份；
-   TID 被复用后，新旧 thread lifetime 被合并成同一条 lineage。

这些问题不会总是立即崩溃。更常见的表现是前置节点偶发缺状态、最终汇合长期等待，或者同一输入在 fresh run 和 same-run retry 中得到不同路径。

#### 1.3.5 宿主超时只结束了等待，没有结束 Guest 执行

假设 A 在等待 `callback-B#1` 时触发宿主等待上限。第二版已经能够把 timeout 归给 exact invocation，但我们进一步发现：future 返回 timeout，只说明宿主不再等了，并不说明 A 或 B 的 guest carrier 已经离开 backend，更不说明 continuation、mailbox 和 JNI critical resource 已经释放。

如果把 host timeout 直接写成 guest terminal，下一次重试可能在同一个 Run 中继承旧 worker、旧 wait edge 或旧 pending exception。业务上看到的是“第一次超时后，第二次行为更奇怪”；架构上真正缺少的是 cancellation 与 quiescence 之间的确认阶段。

因此第三版把它拆成：

```
CANCEL_REQUESTED
  -> QUIESCING
  -> dispatcher retirement evidence
  -> CANCELLED
```

无法证明静止时，不允许清空几个 Map 后继续复用当前 Run，而是进入 quarantine 并重新创建 emulator、VM 和 memory。

#### 1.3.6 Synthetic green 不能证明组合链已经接上

第二版的 model test 可以分别证明 alpha/beta generation 不串、A/B context 不串、FIFO handoff 合法。这些测试都很重要，但上面的完整场景还会经过 dispatcher lifecycle、Task stack allocator、JNI router、callback adapter、StateStore 和 graph join。

如果测试直接调用 authority helper 构造理想 receipt，它证明的是对象模型，不是生产 caller 已经使用同一条事务。于是会出现“状态机测试全部通过，组合场景仍停在最终边界”的反差。

这不是 model test 没有价值，而是证据层级不同。第三版因此把验收拆成 model contract、production-connected contract 和 runtime scenario，并要求每条能力同时具有 identity mismatch、failure injection、cleanup 和 concurrency 负控。

回头看，第二版暴露的并不是某一条业务命令写错，而是组合场景对 runtime 提出了更严格的要求：

| 业务现象 | 第二版缺少的证明 | 第三版引入的边界 |
| --- | --- | --- |
| 重复类型节点全部返回，最终汇合仍认错实例 | exact scenario node identity | typed node + bound receipt set |
| command 已完成，依赖状态仍未就绪 | terminal 与 state commit 的共同 closure | readiness authority |
| 网络元数据与 callback 输入被错误关联 | 独立 producer lineage | callback instance receipt |
| fresh run 正常，same-run retry 出现污染 | guest thread lifetime 与 quiescence | incarnation + retirement |
| 宿主等待结束，guest 仍可能写入 | cancellation confirmation | quiescence barrier |
| model green，生产组合链仍无法闭合 | production caller evidence | production-connected contract |

这些现象最终把问题的主语从 Invocation 推向了 Guest Thread Runtime。我们不再只问“这是哪一次调用”，而要继续问：它属于哪个 guest thread incarnation，谁暂时拥有 backend，依赖来自哪个 producer，以及用什么不可变证据证明整条链已经真正闭合。

### 1.4 第三代：从 Invocation-Owned Runtime 改成 Guest Thread Runtime

宿主 Java 线程只是调用 unidbg API 的线程。guest thread 的身份应由 guest 可见的 birth、TID、pthread self、TPIDR/TCB 和 lifecycle 共同决定。carrier 只是当前一次执行的载体，它可以被替换、暂停或退役；Invocation 只拥有一次调用的参数和终态，也不应该拥有线程级 errno、JNIEnv attachment 或持久 stack。

因此，新的模型不再继续添加 lane 标签，而是把身份拆成 Run、GuestThread、Invocation 和 Carrier 四层。

![Mermaid 架构图 1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/542c8cfa1ec7321c.png)

#### 图三：Guest Thread Runtime

![图三：Guest Thread Runtime](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cfcc5c90e175d971.jpg)

#### 图四：单桥通行的架构比喻

![图四：单桥通行的架构比喻](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7d2bc7d4532b8727.jpg)

* * *

## 二、四层身份模型：Run、GuestThread、Invocation、Carrier

组合场景第一次失败时，表面现象并不是“线程模型不对”，而是一些更零碎的问题：某个重复节点恢复后读到了旧异常，异步回调结束后 parent local frame 消失，宿主重试又继承了上一轮尚未退休的 worker。

这些现象最终指向同一个问题：调用、线程、执行载体和整次模拟的生命周期被放进了同一组可变字段。新的设计因此先不讨论调度策略，而是先回答“状态到底属于谁”。

![Mermaid 架构图 2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/46f22a49c4b868f7.png)

![四层身份与所有权空间](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a8818685a3c67be2.jpg)

### 2.1 Run：故障和共享状态的最外层边界

`RunContext` 表示一次完整模拟，而不是某条命令的一次执行。它拥有 emulator、VM、Memory、dispatcher、guest process shared state、thread registry、StateStore、wait graph、clock policy 和各类 authority。

Run 也是最小故障隔离域。如果发生无法确认的 stack corruption、错误 binding、dependency cycle，或者取消后无法证明 guest 已经静止，正确做法不是清几个 Map 后继续运行，而是让当前 Run 进入 quarantine，随后创建全新的 emulator/VM/memory。

推荐状态机如下：

```
NEW -> ACTIVE -> QUIESCING -> DISPOSED
             \-> QUARANTINED -> DISPOSED
```

### 2.2 GuestThread：持久线程身份和线程级状态的 owner

guest thread 的主键不能只是整数 TID。TID 在线程退出后可以复用，所以真正的身份应当是：

```
ThreadIncarnationId = RunId + monotonically increasing ThreadSerial
```

每个 incarnation 至少拥有：

-   numeric guest TID；
-   thread birth provenance；
-   pthread self、TPIDR 和 Bionic TCB；
-   errno、signal 和 futex owner identity；
-   thread stack region；
-   JNIEnv attachment 和 pending exception；
-   thread execution state；
-   invocation stack；
-   task binding set；
-   从出生到 DEAD 的 lifecycle。

这里最重要的变化，是笔者不再把 role 当成 thread primary key。 `MAIN-like` 、 `worker-like` 之类的名称只能作为观测角色；它们必须通过同一 Run 内的结构证据解析到一个既存 GuestThreadIncarnation，不能反过来创建或猜测线程。

### 2.3 Invocation：一次调用，而不是一条线程

Invocation 继续保留上一篇建立的能力：

```
command category
generation
original submitter
parent invocation
immutable context
local reference frames
exact terminal
exact outcome
```

但它的边界被进一步收紧。Invocation 不再拥有持久 TID、线程 TLS、JNIEnv attachment 或 thread stack。它可以拥有自己的 entry/return boundary 和 continuation，却不能在结束时把整个 thread execution state 一并销毁。

### 2.4 Carrier：backend 驾驶权，而不是线程身份

Carrier 表示“谁此刻可以驾驶 Unicorn backend”。它只是一种 capability：

```
CarrierLease
  = lease identity
  + invocation identity
  + thread binding reference
  + owner session
  + admitted safe-point sequence
```

同一 GuestThread 可以在不同时间由不同 carrier 继续执行；一个 synthetic command carrier 也不能因为拥有 TID 和 stack，就冒充 native clone 创建的持久线程。

### 2.5 状态所有权矩阵

| 状态  | Run | GuestThread | Invocation | Carrier |
| --- | --- | --- | --- | --- |
| native heap、globals、FD | ✓   |     |     |     |
| VM global/weak-global refs | ✓   |     |     |     |
| numeric TID、pthread self、TPIDR |     | ✓   |     |     |
| errno、signal、thread JNI attachment |     | ✓   |     |     |
| persistent stack region |     | ✓   |     |     |
| command、generation、parent |     |     | ✓   |     |
| local JNI frame、temporary handles |     |     | ✓   |     |
| entry/return boundary、continuation token |     |     | ✓   |     |
| backend driving permission |     |     |     | ✓   |

这张表比类名更重要。任何实现只要让同一个状态同时出现两个 owner，就应该先停下来重新定义边界，而不是继续增加同步块。

### 2.6 RunContext：把一次模拟变成组合根

在代码上， `RunContext` 不是一个装 ID 的 DTO，而是整个 runtime 的 composition root。所有会影响线程、调用、fault、state 和 readiness 的 authority 都从这里取得，并且只能服务于同一个 `RunId` 。

下面是按实际设计裁剪后的类骨架：

```java
public final class RunContext implements AutoCloseable {
    private final RunId id;
    private final GuestThreadRegistry threadRegistry;
    private final RuntimeInvocationRegistry invocationRegistry;
    private final CarrierAdmissionAuthority admissionAuthority;
    private final RuntimeCommandStateStore stateStore;
    private final RunWaitGraph waitGraph;
    private final RunFaultController faultController;
    private final HostCallbackAuthority callbackAuthority;
    private final PreBoundaryReadinessAuthority readinessAuthority;
    private final AtomicLong mutationEpoch;
    private volatile RunState state;

    RunMutationPermit beginMutation(MutationOwner owner);
    void freezeAdmission(RunFault fault);
    void quarantine(RunFault fault, OwnerInventory retained);
    @Override public void close(); // quiesce -> retire -> dispose
}
```

这里有三个实现约束。

第一，其他对象不能自己 new 一个 `RunId` 来伪装成同一 Run。 `ThreadIncarnationId` 、 `InvocationId` 、receipt 和 state key 都必须由当前 Run 的 authority 签发。

第二， `close()` 不能等价于 `maps.clear()` 。它必须先冻结新 admission，处理 live carrier、waiter、continuation、JNI attachment 和 critical resource；只有确认 guest 不再产生副作用后才能进入 `DISPOSED` 。

第三，mutation epoch 不是普通 telemetry counter。任何可能改变 readiness 的状态迁移，都要先取得 `RunMutationPermit` ，成功后 commit，失败则 abort。

### 2.7 GuestThreadIncarnation：数值 TID 之外的线程身份

线程 ID 使用强类型，线程对象只聚合持久 thread scope；birth record 则明确区分 process leader、native clone 和 synthetic carrier：

```java
public record ThreadIncarnationId(RunId runId, long serial) {}

public sealed interface ThreadBirthRecord {
    record ProcessLeaderBirth(int pid, long sequence)
            implements ThreadBirthRecord {}
    record NativeCloneBirth(ThreadIncarnationId parent, int childTid,
            long cloneFlags, long tls, long clearChildTid, long sequence)
            implements ThreadBirthRecord {}
    record SyntheticCarrierBirth(String purpose, long sequence)
            implements ThreadBirthRecord {}
}

public final class GuestThreadIncarnation {
    private final ThreadIncarnationId id;
    private final ThreadBirthRecord birth;
    private final GuestThreadKernelState kernel; // TID / futex / signal
    private final BionicThreadState bionic;       // pthread / TCB / TLS / errno
    private final JniAttachmentState jni;
    private final StackRegion stack;
    private final InvocationStack invocations;
    private ThreadLifecycleState state;

    void markDead(CarrierRetirementReceipt receipt) {
        requireExactRetirement(receipt);
        requireNoLiveInvocationOrJniLease();
        state = ThreadLifecycleState.DEAD;
    }
}
```

这样做的原因是：process leader 合法地允许 `tid == pid` ；native clone 必须保留 parent、TLS 和 child-tid 语义；synthetic carrier 则只能证明“模拟器创建了一个隔离执行载体”，不能证明 guest native runtime 真正创建了线程。

### 2.8 ThreadIdentityProvider：线程敏感 API 的唯一入口

过去最容易出现的回退，是当前 Task 没有身份时使用 process pid，或者使用宿主 Java thread id。新设计把所有 thread-sensitive API 收敛到一个 provider：

```java
public final class ThreadIdentityProvider {
    private final RunContext run;

    public ResolvedThreadIdentity current(Task runningTask) {
        TaskThreadBinding binding = run.threadRegistry()
                .requireLiveBinding(runningTask);
        GuestThreadIncarnation thread = run.threadRegistry()
                .requireIncarnation(binding.threadId());
        binding.requireMatches(thread);
        return ResolvedThreadIdentity.from(thread, binding);
    }

    int gettid(Task task) { return current(task).guestTid(); }
    long pthreadSelf(Task task) { return current(task).pthreadSelf(); }
    long errnoAddress(Task task) { return current(task).errnoAddress(); }
    JniEnvHandle jniEnv(Task task) { return current(task).requireAttachedEnv(); }
}
```

provider 明确拒绝 host thread id、process pid、 `activeCommand` 、 `lastRunningTask` 和 role name 等 fallback。

如果当前 Task 没有合法 binding，正确结果是 `UNSUPPORTED_FAIL_CLOSED` 或 runtime integrity fault，而不是返回一个“看起来像线程 ID”的值。

* * *

### 2.9 RunWaitGraph：把“正在等待”变成可验证的执行关系

线程身份拆开以后，下一件必须被显式建模的事情是等待关系。一个 guest thread 可能等待另一个 invocation 的 terminal，也可能等待 futex、条件变量或 callback mailbox。若这些等待只存在于某个 Task 的字段里，调度器就无法判断一个 fault 应该传播给谁，也无法证明取消后已经没有遗留执行者。

因此，等待关系属于 Run，而不是某个 carrier。 `RunWaitGraph` 只保存同一 Run 内的 typed endpoint 和 immutable edge；它不执行 callback，也不直接改变 invocation 状态。状态迁移由 `FaultAuthority` 或 `CancellationAuthority` 提交。

```java
public record WaitNodeId(RunId runId, InvocationId invocationId,
        long generation) {}
public record WaitEdge(WaitNodeId waiter, WaitNodeId dependency,
        WaitReason reason, long graphEpoch) {}

public final class RunWaitGraph {
    private final RunId runId;
    private final Map<WaitNodeId, Set<WaitEdge>> outgoing;
    private final Map<WaitNodeId, Set<WaitEdge>> incoming;
    private long graphEpoch;

    GraphMutation prepareBatch(List<WaitEdgeDraft> edges); // 同 Run + 全量环检测
    void commit(GraphMutation mutation);                   // 一次发布全部 edge
    WaiterSnapshot snapshotDependents(WaitNodeId root);    // cleanup 前快照
    void removeForTerminal(WaitNodeId node, TerminalReceipt terminal);
}
```

`addBatch` 采用“全部验证、一次发布”的方式。一个 waiter 的多个 dependency 不能被后来的 edge 覆盖；如果第三条边形成环，前两条边也不能已经可见。 `WaitReason` 至少要区分 invocation terminal、futex、join 和 callback mailbox，因为不同原因对应不同的 quiescence 条件。

等待图的节点不是 command 名称，而是 `(RunId, InvocationId, generation)` 。这样同一个 command 的两次重叠调用、同一个 guest thread 的父子 invocation、以及已经被取消但尚未退役的 carrier，都能被准确区分。

### 2.10 RootFaultController：先冻结，再传播，再收束

根故障处理最忌讳“先清理本地对象，再看看谁在等它”。清理顺序一旦反过来，direct waiter 和 transitive waiter 可能已经失去入口，最后只剩一个看似干净、实际上无法证明静止的 Run。

笔者把故障分成四类：

```
HANDLED_GUEST_SIGNAL      guest handler 已消费，可继续运行
UNHANDLED_GUEST_FAULT     exact invocation/thread 无法继续
RUNTIME_INTEGRITY_FAULT   binding、stack、receipt 或 owner 证据损坏
DEPENDENCY_CYCLE           wait graph 无法满足偏序
```

其中后三类都是 Run 级风险。 `RootFaultController` 负责把一个 root fault 变成不可分叉的 propagation plan：

```java
public sealed interface RunFault
        permits UnhandledGuestFault, RuntimeIntegrityFault,
                DependencyCycleFault, HostWatchdogExpired {}

public record RootFaultPublication(
        RunId runId, InvocationId rootInvocation,
        ThreadIncarnationId thread, RunFault fault,
        long sequence, Object authorityIdentity) {}

public final class RootFaultController {
    RootFaultPublication publishRoot(InvocationContext failed, RunFault fault) {
        run.freezeNewAdmission();
        RootFaultPublication root = faultLedger.publish(failed, fault);
        WaiterSnapshot snapshot = waitGraph.snapshotDependents(failed.waitNodeId());
        cancellation.preparePropagation(root, snapshot);
        cancellation.commitDependencyFailures(root, snapshot);
        waitGraph.removeForTerminal(failed.waitNodeId(), failed.faultTerminal());
        run.quiescence().awaitRetirementFor(root, snapshot);
        return root;
    }
}
```

这里的 `freezeNewAdmission()` 必须早于 root fault 的对外发布，否则新的 invocation 可能在旧 fault 传播期间进入 graph，形成一个没有稳定父节点的孤儿。 `snapshotDependents` 必须发生在 edge cleanup 之前； `DEPENDENCY_FAILED` 也必须拥有和 `FAULTED` 、 `CANCELLED` 对称的 stack、JNI、StateStore、registry release 路径。

### 2.11 Cancellation、Quiescence 和 Run Disposal

取消请求只能表达“不要再继续安排新的执行”，不能证明 guest 已经停止。新的状态机把请求、收束和终态分开：

```rust
CREATED -> BOUND -> ADMITTED -> RUNNING <-> SUSPENDED
                                      |
                                      +-> COMPLETED
                                      +-> FAULTED

RUNNING/SUSPENDED -> CANCEL_REQUESTED -> QUIESCING -> CANCELLED
root fault         -> DEPENDENCY_FAILED
run disposal       -> ABORTED_BY_RUN_DISPOSAL
```

`CANCELLED` 只有在 carrier 已经取得 retirement receipt、continuation 不可恢复、wait edge 已处理、JNI/critical/state staging 已释放、mailbox 不再写入后才能签发。为此需要一个独立的 `QuiescenceBarrier` ，而不是让调用者自己传入 `isStopped=true` ：

```java
public final class QuiescenceBarrier {
    QuiescenceProbe begin(InvocationId id, CancellationCause cause);
    CancellationReceipt confirm(QuiescenceProbe probe,
                                List<CarrierRetirementReceipt> receipts);
}
```

所有 probe 都封存 `RunMutationEpoch` ；确认期间出现新 admission、continuation 或 mailbox write，旧 probe 立即 stale。若 stack、binding、receipt、依赖图或 cancellation 证据无法确认，最安全的边界是当前 Run，而不是某个 Task：

```java
public final class RunQuarantine {
    void rejectAdmission();
    void rejectResume(ContinuationToken token);
    OwnerInventory retainedPhysicalOwners();
    void disposeAfterQuiescence();
}
```

处置顺序固定为：

```bash
拒绝新 admission
  -> 停止新的 callback 投递
  -> 请求所有 live carrier 到达 dispatcher safe point
  -> 对每个 owner 尝试完整 retirement
  -> retirement 失败则保留并记录 physical owner
  -> 关闭 JNI/VM/guest memory
  -> seal DISPOSED ledger
```

不能用 `Map.clear()` 代替这条流程。 `DISPOSED` 只允许由 disposal authority 签发；无法回收的 physical owner 必须保留在 disposal ledger 中。

时间语义也必须拆开：guest 的 `clock_gettime` 、futex timed wait、condvar deadline 和 nanosleep 使用 `GuestClock` ；宿主 API 使用 host clock；watchdog 只负责防止测试失控。

```java
public interface GuestClock {
    long monotonicNanos();
    void advanceTo(long guestDeadline);
}

public interface GuestClockPolicy {
    void onBackendSlice(GuestExecutionSlice slice);
    boolean shouldWake(GuestTimer timer, long now);
}

public final class HostSafetyWatchdog {
    WatchdogExpiry arm(RunId run, Duration hostBudget);
    void onExpiry(WatchdogExpiry expiry); // quarantine/cancel, never guest terminal
}
```

两套时间的终态不能混写：

| 事件  | 允许发布的结果 |
| --- | --- |
| guest timer 到期且 guest 继续执行 | `GUEST_TIMEOUT` 或 timed-wait wake |
| invocation 自己完成返回 | `COMPLETED` |
| host API 等待超时 | 只返回宿主等待结果，不改变 guest terminal |
| host safety watchdog 到期 | `CANCEL_REQUESTED` 、 `QUIESCING` 或 `QUARANTINED` |

host watchdog 不能被转换成 guest natural timeout，也不能因为宿主等待结束就直接签发 `CANCELLED` 。是否推进 guest wall clock、其他 thread 获得 backend 服务时是否允许 timer 前进，都必须由同一个 `GuestClockPolicy` 决定，不能让各个 command 自己读取宿主系统时间。

### 2.12 一次完整运行时 Walkthrough：从提交到 Readiness

前面的章节分别解释了身份、载体、回执和就绪权威，但如果只按概念阅读，仍然容易把它们理解成互相独立的类。下面用一条的组合场景来描述，把这些对象按时间顺序串起来。场景只包含两个 Guest 线程、一次嵌套 callback 和一个最终集成边界，不对应任何具体应用或业务协议。

这条流程的主线是“线程 A 发起 native 调用，callback 在 Guest 线程 B 上重入，A 恢复后由 Readiness Authority 确认最终边界”。图中的对象名是稳定身份示意，不是宿主线程号，也不是调用者可以随意填写的字符串。

![Mermaid 架构图 3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8bcfb33442dbd339.png)

这条 walkthrough 使用的对象身份如下：

```css
RunContext                  run-demo
GuestThreadIncarnation      thread-A#1, thread-B#1
InvocationRecord            invocation-A#7, invocation-B#3
TaskThreadBinding           binding-A#12, binding-B#08
CarrierLease                lease-A#41, lease-B#42
AdmissionReceipt            admission-A#41, admission-B#42
CallbackInstanceId          callback-B#3
CarrierRetirementReceipt    retirement-A#41, retirement-B#42
ReadinessReceipt            readiness#9
BoundaryAdmissionPermit    permit#9
```

`thread-A#1` 和 `thread-B#1` 是持久的 GuestThread incarnation； `invocation-A#7` 和 `invocation-B#3` 是发生在这些线程上的调用； `lease-A#41` 和 `lease-B#42` 只是短时间获得单一 backend 驾驶权的载体。它们的生命周期不同，不能用一个对象代替另外两个对象。

#### Step 0：Run 先注册 expected slots

组合场景开始时， `RunContext(run-demo)` 创建 emulator、VM、Memory、Dispatcher、ThreadRegistry、StateStore、WaitGraph 和两类 Authority。配置只声明 expected slots，不伪造未来的 receipt：

```
native slot       -> requires AdmissionReceipt + CarrierRetirementReceipt
callback slot     -> requires CallbackAdmissionReceipt
host-state slot   -> requires typed committed state evidence
boundary slot     -> requires one ReadinessReceipt and one consumed permit
```

此时没有任何调用已经完成， `ReadinessAuthority` 只能返回“证据不足”。它不会因为 slot 数量正确，或者某个 Map 非空，就提前打开最终边界。

#### Step 1：Guest Thread A 提交一次 native invocation

宿主提交线程只提交参数和场景节点，不能声明“我就是 Guest Thread A”。 `Dispatcher` 根据当前 Run 中已经出生的 `thread-A#1` 解析 `TaskThreadBinding` ，然后创建调用记录：

```
HostSubmitter
  -> InvocationRecord(invocation-A#7, run-demo, node=native-A)
  -> bind(thread-A#1, binding-A#12)
  -> allocate CarrierLease(lease-A#41)
  -> issue AdmissionReceipt(admission-A#41)
```

`AdmissionReceipt` 同时绑定 Run、GuestThread incarnation、Invocation、binding epoch 和 carrier lease。它不是“排队成功”的普通布尔值，后续任何阶段都必须拿同一份 identity 回查。若 binding 已经退役或 Run 已进入 quarantine，入场在这里直接 fail closed。

#### Step 2：Carrier A 驾驶 backend，时间片停止只是交接

`lease-A#41` 获得当前 backend ownership， `TaskThreadBinding` 装载 `thread-A#1` 的独立 StackRegion、TLS、JNIEnv attachment、pending exception 和 continuation。backend 开始执行 `invocation-A#7` ：

```
CarrierLease lease-A#41
  -> load binding-A#12
  -> restore thread-A#1 stack / TLS / JNIEnv
  -> run invocation-A#7 on Single Backend
  -> stop(reason=SAFE_POINT or TIMESLICE)
```

这里的 stop 只产生 continuation snapshot 和 handoff evidence，不产生 `COMPLETED` 。 `invocation-A#7` 仍然是 RUNNING 或 SUSPENDED， `lease-A#41` 也仍然是 live，直到 dispatcher 明确完成 retirement。

#### Step 3：A 进入 callback 边界，B 获得独立 callback identity

在 A 的 native 执行过程中，guest 触发一个异步 callback。callback adapter 不读取“最近一次 command”，而是根据当前 dispatcher snapshot 创建独立的 `CallbackInstanceId(callback-B#3)` 。A 的 parent invocation 保留自己的 local frame 和 continuation；B 作为 callback consumer 使用自己的 GuestThread incarnation：

```bash
invocation-A#7
  -> parent callback boundary
  -> CallbackInstanceId(callback-B#3)
  -> InvocationRecord(invocation-B#3, parent=invocation-A#7)
  -> bind(thread-B#1, binding-B#08)
  -> allocate CarrierLease(lease-B#42)
  -> issue AdmissionReceipt(admission-B#42)
```

这里的“B”不是宿主 Java thread 的名字，也不是从 A 的 carrier 复制出来的临时标签。B 必须拥有自己的 thread birth、StackRegion、TLS、JNIEnv 和 invocation stack。A 的 local frame 不能由 B 关闭，B 的 pending exception 也不能写入 A 的 thread scope。

#### Step 4：Carrier B 提交 callback state 并完成 retirement

`lease-B#42` 进入唯一 backend 后，dispatcher 恢复 `thread-B#1` 的现场，执行 callback consumer，并在同一事务中提交三份证据：

```python
callback-B#3
  -> callback admission is consumed
  -> typed callback state is committed to StateStore
  -> CallbackAdmissionReceipt is sealed
  -> CarrierRetirementReceipt(retirement-B#42) is issued
  -> lease-B#42 becomes retired
```

只有 `StateStore` 提交和 callback receipt sealing 都成功，callback slot 才算闭合。若 callback producer 缺失、instance identity 不匹配、state commit 失败或 physical release 失败，B 不得伪造成功结果；它会保留未完成的 owner，或者让当前 Run 进入 quarantine。

#### Step 5：A 使用原 continuation 恢复，而不是重新猜线程

callback 返回后，dispatcher 根据 `invocation-A#7` 保存的 continuation 和 `binding-A#12` 重新申请 A 的后续阶段，恢复 `thread-A#1` 的 stack、TLS 和 JNIEnv。它不会按宿主线程、command category 或“当前最后一个 carrier”重新查找线程：

```rust
retirement-B#42
  -> restore continuation owned by invocation-A#7
  -> verify thread-A#1 + binding-A#12 + current epoch
  -> reacquire backend lease for A
  -> resume native execution
  -> terminal(invocation-A#7)
  -> issue retirement-A#41
```

如果此时 `binding-A#12` 已过期、Run epoch 已变化，或者 A 的 carrier 已被另一个 incarnation 占用，恢复必须拒绝。不能因为参数和调用类型相同，就把 B 的现场或新一代 binding 当成 A 的现场。

#### Step 6：ReadinessAuthority 汇合 exact evidence

A 和 B 都有 terminal 并不等于最终边界可以进入。 `ReadinessAuthority` 在一个 mutation epoch 内读取各个 owner 的 committed ledger，并核对 expected set：

```css
native-A      -> admission-A#41 + retirement-A#41 + terminal(invocation-A#7)
callback-B    -> admission-B#42 + callback-B#3 + retirement-B#42
host-state    -> typed committed state for callback-B#3
runtime       -> no live waiter, continuation, lease or root fault
```

只有 exact Run、node、invocation、thread incarnation、binding epoch 和 authority epoch 全部一致，且没有 live waiter、未退休 carrier 或待提交 state，authority 才签发：

```
ReadinessAuthority
  -> ReadinessReceipt(readiness#9)
  -> claim exact reservation
  -> BoundaryAdmissionPermit(permit#9)
```

`permit#9` 只能被一个最终 admission 消费。消费时，dispatcher、readiness ledger 和 carrier reservation 共同发布同一个 commit marker；任一 participant 失败，permit 失效，prepared owner 回滚，无法证明回滚时则 quarantine Run。

#### Step 7：最终边界只消费 permit，不重新推理前置状态

最终集成边界拿到的不是一组 `ready=true` ，而是一份绑定 exact evidence digest 的 `BoundaryAdmissionPermit` 。它只做一次性消费：

```
permit#9
  -> validate run-demo / authority epoch / closure digest
  -> consume once
  -> publish final admission receipt
  -> enter integration boundary
```

如果另一个线程试图重复消费 `permit#9` ，或者在签发后改变了 graph、state、callback 或 carrier reservation，消费会失败。系统宁可停在边界之前，也不会用“最新结果”“相同 command”或“数量已经够了”补出一条未经证明的因果链。

这条 walkthrough 可以压缩成一句话： **A 的调用可以暂停，B 的 callback 可以插入，backend 的驾驶权可以交接，但每次交接都必须沿着 exact thread incarnation、invocation、binding、lease 和 receipt 传递；最终 readiness 只消费已经闭合的证据，不重新猜测历史。**

* * *

## 三、为什么每个 Carrier 都必须有独立的 Stack、Binding 和 Lease

在重叠场景中，一条 invocation 会暂停等待 callback，另一条 invocation 随后接管 backend。如果二者只保存寄存器 context，却复用同一栈顶或一张可变 binding，后进入者就可能覆盖前者的 return boundary；恢复时 PC 看似正确，SP、TLS 或 owner epoch 已经不属于它。

因此，把四层身份拆开之后，真正进入 backend 的 carrier 仍需要一组完整证据。笔者最终把一次合法执行入口收紧为：

```
physical stack evidence
  + exact TaskThreadBinding
  + exact InvocationRecord
  + exact CarrierLease
  + current GuestThreadIncarnation
```

缺少任何一项，都不能仅凭 command、role、host thread 或最近一次 running task 补齐。

### 3.1 独立 stack 解决的是物理隔离，不直接创造线程身份

单 backend 只有一组 CPU 寄存器。切换 Task 时，如果两个活跃 carrier 使用重叠 stack range，后一个 carrier 的 entry frame、保存寄存器或 nested callback frame，就可能覆盖前一个尚未完成的返回边界。

因此，每个可并发存活的 carrier 必须提供可验证的物理 stack evidence：

```
stack lower bound
stack upper bound
entry SP
guard / canary
allocation identity
backend mapping identity
```

验证规则至少包括：

-   两个 live carrier 的 stack range 不重叠；
-   entry SP 位于自己的 range 内；
-   guard/canary 未被破坏；
-   suspended frame 存在时禁止把 SP 重置到 stack top；
-   faulted stack 禁止再次用于 fresh invocation；
-   physical allocation 不能由固定地址或 generation 算式伪造。

这里要区分物理存储和逻辑所有权。P1500 `Task` 可以继续保存 backend context、waiter 和 stack allocation；Guest Thread Runtime 则通过 binding 把这些物理对象解释为某个 thread incarnation 的执行状态。一次性 synthetic carrier 可以拥有自己的独立栈，但它仍然只能被标记为 synthetic birth，不能自动升级成 native thread。

### 3.2 TaskThreadBinding 解决“这份现场属于哪个线程”

`TaskThreadBinding` 是 Task 与 GuestThreadIncarnation 之间的不可猜测连接。它至少记录：

```
task identity
task generation
thread incarnation id
birth source
binding epoch
bind / unbind sequence
runtime validity
```

为什么需要 binding epoch？因为同一个 Task 对象、数值 TID 或 carrier role 都可能被重新使用。一个 continuation 如果只保存 `task == oldTask` ，在 rebind 后仍可能错误恢复旧现场；加入 epoch 后，旧 snapshot 会自然变成 stale。

### 3.3 CarrierLease 解决“谁现在有权驾驶 backend”

Binding 证明身份，Lease 证明权限，两者不能合并。

一个 GuestThread 可以已经存在并具有合法 binding，但此刻没有取得 backend；另一个 invocation 也可以已经创建 record，却仍在 FIFO 中等待。只有 carrier 获得 live lease，并且 admission 已提交，它的 context 才能对 guest runtime 可见。

换句话说：

```
Thread exists   != may execute now
Invocation bound != admitted now
Task runnable   != owns backend now
```

### 3.4 Continuation 必须严格 LIFO

真实 JNI/Java callback 经常形成同线程同步重入：

```
native parent
  -> Java callback
     -> native child
        -> child return
  -> parent resume
```

如果 child 被当作普通 FIFO item 排在 parent 后面，parent 又同步等待 child，系统会形成天然死锁。同线程同步重入必须在同一个 GuestThreadIncarnation 上压入 child invocation，并保存 parent 的 callback return boundary。

![Mermaid 架构图 4](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4be78e85b600d494.png)

非 LIFO resume、跨线程复用 child local frame、binding epoch 不匹配或 child stack 覆盖 parent live range，都应被视为 runtime integrity fault，而不是再尝试一次恢复。

### 3.5 StackRegion 与 TaskStackEvidence 的类设计

`StackRegion` 表示 thread scope 的逻辑栈区域， `TaskStackEvidence` 表示某次 carrier 从 backend allocation 得到的物理证据。两者不应混成一个类。

```java
public record StackRegion(long lower, long upper,
        long guardAddress, long expectedCanary) {
    void requireContains(long sp);
    void requireDisjoint(StackRegion other);
}

public record TaskStackEvidence(
        Object backendAllocationIdentity,
        StackRegion region, long entrySp,
        long canaryReadBack, long allocationSequence) {
    static TaskStackEvidence fromBackendAllocation(
            BackendStackAllocation allocation, long entrySp);
}
```

关键点是 `fromBackendAllocation()` 只能接受 backend 真实 allocation handle，并且 canary 要从 backend memory 读回。测试中随手传入两段不重叠的数字，只能证明区间算法，不能证明真实 stack 已隔离。

### 3.6 TaskThreadBinding：身份引用而不是 owner

```java
public record TaskThreadBinding(
        Task task,
        ThreadIncarnationId threadId,
        ThreadBirthRecord birth,
        BindingKind kind,
        long taskGeneration,
        long bindingEpoch) {
    void requireCurrent(Task task, ThreadIncarnationId thread, long epoch);
    void unbind(CarrierRetirementReceipt receipt);
}
```

`TaskThreadBinding` 不释放 stack、不关闭 JNIEnv，也不把 thread 标成 DEAD。它只是一个带 epoch 的非 owning 连接，资源生命周期仍由 GuestThread、dispatcher retirement 和 Run disposal 各自负责。

### 3.7 InvocationContinuation 与 InvocationStack

```java
public record InvocationContinuation(
        InvocationId invocationId,
        ThreadIncarnationId threadId,
        long bindingEpoch,
        BackendContextToken contextToken,
        long savedPc, long savedSp, long savedLr,
        int stackDepth,
        SuspensionReason reason) {}

public final class InvocationStack {
    private final Deque<InvocationRecord> frames = new ArrayDeque<>();

    void pushSynchronousChild(
            InvocationRecord parent,
            InvocationRecord child,
            InvocationContinuation parentContinuation);

    InvocationRecord completeChild(
            InvocationRecord child, InvocationTerminal terminal);
}
```

异步 mailbox item 不走这条 LIFO 路径。同线程同步重入、同线程异步提交和跨线程同步调用必须使用不同 `ReentryMode` ，否则 FIFO 和调用栈会再次混成一个概念。

* * *

## 四、从可变状态改成 Receipt-backed Transaction

一个典型的组合失败是：dispatcher 已经收下 carrier，场景节点却在随后绑定 state 或 callback evidence 时失败。如果这个 carrier 此时已经可运行，系统面对的就不再是一次普通 rollback，而是一个可能执行过 guest 指令、却没有完整业务身份的半发布对象。

上一篇已经引入了 admission，但继续实现后，笔者发现“某个对象现在看起来是 live”与“它曾经合法完成某个状态迁移”是两种完全不同的证据。

例如，carrier 退役后，live binding 本来就应该消失。如果 terminal consumer 仍要求读取 live binding，就会出现一个悖论：正确 cleanup 反而让历史终态无法验证。

解决办法是把入场和退场都改成不可变 receipt。

### 4.1 AdmissionReceipt 证明 carrier 是怎样合法入场的

一个完整的 `AdmissionReceipt` 至少封存：

```
RunId
ThreadIncarnationId
carrier identity
TaskThreadBinding epoch
InvocationId / record identity / generation
CarrierLeaseId
admission sequence
```

这些字段必须来自同一个 authority transaction。调用者不能分别传入 thread id、record 和 binding，再依靠字段相等做表面校验；否则多个真实对象只要拥有相同数值，就可能伪造出“看起来一致”的 admission。

### 4.2 Dispatcher accept 不能立刻等价于 RUNNABLE

如果 carrier 一进入 dispatcher queue 就可运行，那么 graph、role evidence、state producer 或 readiness participant 随后失败时，系统只能尝试撤回一个可能已经执行过 guest 指令的 Task。此时再删除 binding、lease 或 stack，反而可能释放正在运行的 owner。

因此，新的 dispatcher entry 增加了一个关键状态：

```
PREPARED_NOT_RUNNABLE
```

它表示 dispatcher 已接受 exact carrier，但 picker 还不能执行它。所有参与者先完成 validate 和 stage，最后由单一 commit marker 共同公开。

![Mermaid 架构图 5](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f89be54722e79282.png)

这个顺序建立了两个非常强的边界：

```
commit marker 之前：zero native entry
commit marker 之后：no new fallible publication step
```

### 4.3 CarrierRetirementReceipt 证明资源已经可以释放

退役 receipt 不能由 `Task.destroy()` 或 Java listener 自行签发。只有 dispatcher 看到以下事实同时成立，才有资格产生它：

-   running slot 已清除；
-   task list 和外部队列已移除；
-   waiter 已解除；
-   backend ownership 已释放；
-   carrier 已不可再次 dispatch；
-   exact admission identity 仍匹配。

最终 route ledger 保存的是双 receipt：

```
AdmissionReceipt
  + CarrierRetirementReceipt
  + exact Invocation terminal
```

因此，即使 Task、binding 和 lease 已经从 live registry 正确删除，后续 graph、StateStore 和 outcome consumer 仍能验证历史事实。

### 4.4 Receipt 是证据，Authority 才拥有状态机

receipt 必须是 immutable value。它不应该提供 `markConsumed()` 、 `setValid(false)` 之类的可变方法，也不应该自己决定是否还能被使用。

真正的消费状态保存在 authority 私有 ledger 中：

```
receipt identity
  -> issued
  -> claimed by exact reservation
  -> consumed by exact final admission
  -> stale / retired
```

这样，调用者拿到 receipt 只能提交给 authority 验证，不能自行把一张旧票改成“尚未使用”。

### 4.5 Failure atomicity 的最终含义

很多代码会把“失败后抛异常”称为 fail closed，但真正的 failure atomicity 要求更高：

```
成功：所有 owner 看见同一个 committed identity
失败：所有 owner 都不可见
回滚失败：保留物理 owner，并 quarantine 整个 Run
```

不能出现 queue 已删除、stack 已释放，但某个 registry 仍认为 lease live；也不能出现 StateStore 已 commit，而 graph 仍停在 submitted。跨 owner 的事务要么有一个共同 commit marker，要么每一步都有 exact rollback，并且 rollback 失败不会继续复用当前 Run。

### 4.6 Reservation、Receipt 与 CommitBundle 的类型设计

入场对象按“可回滚 reservation”和“不可变历史 receipt”分成两组：

```java
public record CarrierAdmissionReservation(
        RunId runId, ThreadIncarnationId threadId,
        InvocationId invocationId, Task carrier,
        CommandInvocationRecord record, TaskThreadBinding binding,
        TaskStackEvidence stackEvidence, CarrierLeaseId leaseId,
        long reservationSequence) {}

public record AdmissionReceipt(
        CarrierAdmissionReservation reservation,
        long admissionSequence, Object authorityIdentity) {}

public record CarrierRetirementReceipt(
        AdmissionReceipt admission,
        CarrierRemovalEvidence removal,
        long dispatcherSequence, Object dispatcherIdentity) {}

public record FinalAdmissionCommitBundle(
        AdmissionReceipt admission,
        PreparedRouteOpen routeOpen,
        PreparedRoleLineageOpen roleOpen,
        PreparedReadinessConsume readinessConsume,
        long commitSequence, Object markerIdentity) {}
```

`authorityIdentity` 和 `dispatcherIdentity` 防止“字段完全相同的自建对象”冒充签发证据；普通 caller 没有 mint 权限。

并非每次 admission 都需要 role 或 readiness participant，所以后几项可以是显式 `Optional` ；但 required participant 不得因缺失而静默跳过。

### 4.7 CarrierAdmissionAuthority 的核心接口

```java
public interface CarrierAdmissionAuthority {

    CarrierAdmissionReservation reserveBeforeSubmit(
            ResolvedThreadBinding thread,
            CarrierSubmissionSpec submission);

    FinalAdmissionTransaction prepareDispatcherAdmission(
            CarrierAdmissionReservation reservation,
            DispatcherPreparedAdmission prepared);

    AdmissionReceipt commitFinalAdmission(
            FinalAdmissionTransaction transaction);

    void rejectBeforeCommit(
            CarrierAdmissionReservation reservation,
            AdmissionFailure failure);
}
```

authority 内部的 reservation 顺序大致如下：

```java
reserve: active Run
  -> allocate carrier and read backend stack evidence
  -> bind carrier to exact thread incarnation and epoch
  -> create invocation record and register lease
  -> publish one rollback-capable reservation
```

这里每一步都可能失败，因此实现需要维护明确 rollback order：lease、record、binding、stack/carrier allocation 按相反顺序撤销。不能先把 reservation 从 pending map 删除，再调用可能抛异常的 participant。

### 4.8 FinalAdmissionTransaction 的提交状态机

```java
public final class FinalAdmissionTransaction implements AutoCloseable {
    enum State {
        PENDING, DISPATCHER_PREPARED, FINAL_STAGED,
        COMMITTED, RUNNING, ROLLED_BACK, QUARANTINED
    }

    void stage(PreparedParticipant participant);
    FinalAdmissionCommitBundle commit();
    @Override public void close(); // pre-marker rollback, failure -> quarantine
}
```

`commit()` 中最值得强调的不是 `synchronized` ，而是最后一个可失败步骤的位置。所有 participant 必须在 marker 前完成 validation；marker 发布后，dispatcher 只把已匹配 bundle 的 entry 变成 RUNNABLE，不再调用新的业务 participant。

### 4.9 Dispatcher 只为完整 removal 签发 RetirementReceipt

```java
retire exact admission
  -> request backend stop and reach safe point
  -> remove running slot / waiter / queue entry
  -> prove backend released and carrier no longer dispatchable
  -> issue CarrierRetirementReceipt
  -> unbind, release lease, seal terminal ledger
```

如果 removal 或 receipt issuance 失败，physical owner 必须进入 quarantined-retirement owner，而不是已经从所有索引消失。否则系统既无法继续运行，也无法在 disposal 时找到需要释放的对象。

### 4.10 RouteLedgerEntry：让终态在 cleanup 后仍可验证

```java
public record RouteLedgerEntry(
        InvocationSpec spec,
        CommandInvocationRecord record,
        AdmissionReceipt admission,
        CarrierRetirementReceipt retirement,
        InvocationTerminal terminal) {
    void requireSealedExactIdentity();
}
```

graph terminal、StateStore commit 和 exact outcome 都消费同一个 sealed ledger entry。这样不会出现 caller 看到一份 outcome、graph 保存另一份 terminal、cleanup 又产生第三份 retirement identity。

### 4.11 同步互斥合同：保护发布顺序，不替代身份证明

Receipt-backed transaction 解决了“谁签发、谁消费、谁可以回滚”，但还没有回答另一个问题：多个宿主线程同时读写这些 owner 时，怎样保证它们看不到半发布状态，也不会因为锁顺序错误而互相等待。

笔者在合同测试中先遇到的并不是数据错，而是锁升级死锁。一个 callback adapter 持有 readiness read permit 时继续调用需要 write lock 的 `bindExpectedReceipt` ；另一个 role-lane lifecycle 又在 lineage monitor 内等待 readiness 写门。单看每个方法都合理，组合起来却形成了：

```rust
read permit
  -> bind expected receipt
     -> readiness write lock
        -> wait for another owner holding lineage monitor

lineage monitor
  -> wait for readiness write lock
```

这类问题不能靠增加超时或把所有方法改成 `synchronized` 解决。真正需要固定的是：谁可以暂时拥有 backend，谁可以发布状态，谁必须先释放自己的锁，以及失败时哪个 authority 负责回滚。

![Mermaid 架构图 6](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f131e0340ede754f.png)

这张图表达的不是一套全局大锁，而是四个相互配合的互斥边界：

1.  `Backend Ownership Mutex` 保证同一时刻只有一个 `CarrierLease` 驾驶单一 backend。它保护的是执行权，不拥有 GuestThread 的 Stack、TLS 或 JNIEnv。
2.  `Publication Gate` 把 graph/config、bootstrap、lane 和 readiness participant 的物理准备与对外可见分开。marker 之前，所有 reader 只能得到 `NOT_COMMITTED` ；marker 之后，不能再追加新的可失败 participant。
3.  `Readiness Mutation Gate` 保护 expected set、actual receipt set、mutation epoch 和 permit 状态，但不允许调用者在持有 read permit 时自行升级到 write path。
4.  `Thread Lineage Monitor` 只负责准备精确的 thread、incarnation 和 binding identity。它必须先释放，再进入 readiness bind，最后用 CAS 把结果写回 lineage；CAS 失败要 exact unbind，unbind 失败则 quarantine Run。

这四个边界对应了近期合同测试中反复验证的几类不变量：

| 同步互斥合同 | 要保护的对象 | 必须拒绝的情况 |
| --- | --- | --- |
| backend 独占 | active carrier、running slot、backend ownership | 两个 carrier 同时进入、已退役 carrier 再次 dispatch |
| 发布门可见性 | graph/config、role policy、bootstrap、required lane | marker 前读到半状态、close/quarantine 竞态中继续看到旧 owner |
| readiness 锁序 | expected/actual receipt set、mutation epoch、permit ledger | read-to-write 升级、stale snapshot 覆盖新 mutation |
| lineage 与 readiness 交接 | ThreadIncarnation、Binding epoch、exact receipt | 持 lineage 锁等待 readiness、wrong epoch 回写 |
| permit 单次消费 | reservation object identity、claim/consume 状态 | forged reservation、同一 permit 二次 claim、旧 permit 重新签发 |
| callback 事务互斥 | dispatcher snapshot、graph milestone、StateStore、callback scope | foreign dispatcher、伪造 token、三段提交中途暴露半状态 |
| JNI retirement 清理 | JNIEnv、pending exception、local frame、critical lease | 一个 carrier 清理另一个 carrier 的线程级状态 |

合同测试的正向路径只能证明“合法锁序可以完成”。因此每一条合同还必须有对应的负向、清理和并发路径：

```rust
positive      -> 合法 owner 按固定顺序完成 prepare / commit / retire
identity      -> wrong Run / thread / binding / epoch 立即拒绝
concurrency   -> 双线程交错时只能看到 marker 前或 marker 后的完整状态
failure       -> 任一 participant 失败，其他 owner 不得继续暴露半状态
cleanup       -> retirement / close / quarantine 后锁、lease、JNI 和 ledger 一致收束
repeat        -> stale receipt 或旧 permit 不能在下一轮 Run 中复活
```

近期测试已经覆盖了发布门竞态、精确 permit claim、callback snapshot authority、callback graph rollback、双 carrier JNI 隔离和真实 Unicorn dispatcher 的合法 suspend/resume 顺序；但这类结果仍应按 targeted contract 解释。合法顺序的正控通过，不等于负向顺序、完整 production lifecycle 和 clean-artifact 一并闭合。

因此，本文中的“同步互斥合同”不是“所有状态都加锁”，而是三条更窄的设计规则： **身份由 Binding、Lease 和 Receipt 证明；互斥只保护证据发布和消费；锁顺序必须让失败可以回滚、让 reader 看不到半状态。**

### 4.12 Run lifecycle invalidation 也必须线性化

Admission 和 readiness 的提交可以做到原子，但如果 `Run.close()` 或 `Run.quarantine()` 仍然分步关闭各个 authority，系统依旧可能留下反向窗口。

假设实现先清空 receipt，再发布 Run 的终止状态，那么并发线程可能在两步之间仍看到 `ACTIVE` ，取得新的 mutation permit，并在 Run 已经终止后提交。反过来，如果先发布终止状态，再清空旧 receipt，reader 又可能看到“Run 已不可用，但旧证据仍然有效”的组合。

因此，Run lifecycle 需要一个独立的线性化边界：

```
ACTIVE(epoch = E)
  -> begin lifecycle invalidation
  -> close new admission and mutation begin
  -> invalidate authority receipts and snapshots
  -> reject every permit minted under epoch E
  -> publish QUIESCING or QUARANTINED
```

关键不是这几步在源码中的先后顺序，而是 `begin` 、 `commit` 和 `snapshot` 都必须核对同一个 lifecycle marker 与 epoch。只在 `beginMutation()` 时检查一次 `RunState` 不够，因为 permit 取得以后，Run 仍可能在另一个宿主线程上进入失效流程。

一个最小接口可以表达为：

```java
public final class RunLifecycleGate {
    LifecyclePermit beginMutation(RunId runId);
    LifecycleInvalidation beginInvalidation(RunId runId);
    void requireCommitAllowed(LifecyclePermit permit);
    RuntimeSnapshot snapshotIfVisible(RunId runId);
}
```

`LifecyclePermit` 必须携带签发时的 epoch； `requireCommitAllowed()` 在最终发布前重新核对 epoch 和 marker； `snapshotIfVisible()` 也通过同一 gate 读取。这样，失效开始以后，旧 permit、旧 receipt 和旧 snapshot 会同时失去授权，而不是由每个 registry 各自猜测 Run 是否仍然可用。

这个 gate 也不能演变成全局大锁。Run 只负责发布 lifecycle marker；各个 authority 在锁外执行自己的 exact cleanup，再把不可变结果交回 gate 确认。这样既关闭 TOCTOU，也避免 Run 锁反向调用 StateStore、thread registry 或 callback authority 形成新的锁环。

* * *

## 五、JNI 必须同时按 Thread 和 Invocation 隔离

某场景中有一条同步重入：native parent 进入 Java callback，callback 又调用 native child。第二版已经能为 child 创建独立 invocation，但如果所有 JNI 状态仍跟着 invocation 走，child 返回时可能清掉 parent 的 pending exception；如果所有状态都跟着 thread 走，child local refs 又会泄漏给 parent。

Invocation-scoped local references 是上一篇的重要改动，但完整 JNI 语义不只有 local object map。继续扩展后，笔者把 JNI 状态拆成四级作用域。

![Mermaid 架构图 7](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d096d16022202898.png)

### 5.1 JNIEnv 和 pending exception 属于 GuestThread

同一个 guest thread 在 fresh entry、timeslice、wait/resume 和 nested invocation 中，应看到稳定的 JNIEnv identity。不同 guest thread 的 attachment 和 pending exception 必须隔离。

因此不能用 host `Thread.currentThread()` 推导 JNIEnv，也不能在某个 invocation 的 finally 中清空整个 VM 的 pending-exception map。

`DetachCurrentThread` 也必须改变 exact GuestThread 的 attachment state。detach 后 `GetEnv` 应返回 detached，直到显式 attach；如果 `getJNIEnv()` 每次都静默创建一个新 wrapper，detach 只是表面行为。

### 5.2 LocalFrame 属于 Invocation

每次 native invocation 至少拥有一个自动 local frame。 `PushLocalFrame` 在当前 invocation 内继续压栈；同线程 child invocation 则拥有独立 child frame stack。

`PopLocalFrame(result)` 不能只弹一个模型 token。它必须操作真实 DVM reference table：

-   删除 top frame 的真实 refs；
-   将合法 result 提升到 parent frame；
-   parent 已有 local 继续有效；
-   global/weak-global 按 JNI 规则转换；
-   null 保持 null；
-   unknown、stale 或 cross-invocation handle fail closed。

### 5.3 Critical resource 是独立的两阶段事务

pinned array/string 同时涉及逻辑 lease 和物理 guest buffer。正确 acquire 顺序是：

```
allocate physical buffer
  -> register exact pointer lease
  -> return pointer
```

如果 lease 注册失败，必须释放刚分配的 buffer。release 则相反：

```
validate owner / pointer / mode without removal
  -> release or flush physical buffer
  -> commit lease removal
```

物理释放失败时，lease 必须保持 live； `JNI_COMMIT` 只 flush，不结束 lease。只改逻辑 Map、不验证实际 buffer 的测试，无法证明 JNI production path 已经正确。

### 5.4 Reference scope 为什么需要双条件关闭

一次 invocation 的 local refs 只有在两个条件同时满足后才能释放：

```
carrier has retired
AND
host has resolved and acknowledged the outcome
```

只有 carrier retired，host 可能还没通过返回 handle 解析对象；只有 outcome acknowledged，TIMEOUT 或 cancellation 下 guest carrier 可能仍未真正静止。双条件关闭把 guest 使用期和 host 解析期都纳入同一生命周期。

### 5.5 JniAttachmentState：稳定 JNIEnv 与真实 detach

```java
public final class JniAttachmentState {
    private final ThreadIncarnationId owner;
    private AttachmentState state = AttachmentState.DETACHED;
    private JniEnvHandle env;
    private DvmObject<?> pendingException;

    synchronized JniEnvHandle attach(JniEnvAllocator allocator);
    synchronized int getEnv(JniEnvOut out); // 查询不隐式 attach
    synchronized void detach();             // 无 live invocation/critical lease
    synchronized void setPendingException(DvmObject<?> throwable);
    synchronized void clearPendingException();
}
```

`getEnv()` 不应隐式调用 `attach()` 。查询和状态改变必须是两个 API，否则 guest 调用 `DetachCurrentThread` 后，下一次普通查询会悄悄把线程重新 attach。

### 5.6 InvocationLocalReferenceScope：真实 frame stack

```java
public final class InvocationLocalReferenceScope {
    private final InvocationId invocationId;
    private final Deque<LocalFrame> frames = new ArrayDeque<>();
    private boolean carrierRetired;
    private boolean outcomeAcknowledged;

    int addLocal(DvmObject<?> object);
    void pushLocalFrame(int capacity);
    int popLocalFrame(int resultHandle, ReferenceResolver resolver);
    void markCarrierRetired();
    void acknowledgeOutcome();
    void releaseWhenBothConditionsHold();
}
```

真实 VM 的 `addLocalObject()` 和 `getObject()` 必须根据当前 running carrier 找到这个 scope，而不是维护一个只用于测试的平行 frame model。

### 5.7 Pending exception 的路由

`Throw` 、 `ExceptionOccurred` 和 `ExceptionClear` 都先从当前 running carrier 解析 exact `RuntimeJniScope` ，再访问其中的 `GuestThreadIncarnation.jni()` 。这里没有 `Map<Task, Throwable>` 的 fallback；Invocation 只能在当前 thread scope 中读取和清理 pending exception。

### 5.8 CriticalLeaseRegistry：逻辑与物理资源保持同一终态

```java
acquire critical:
  allocate physical buffer
  -> register exact invocation/thread/pointer lease
  -> return pointer; registration failure frees buffer

release critical:
  validate owner/pointer/mode without removal
  -> flush or free physical buffer
  -> commit logical lease removal
  -> JNI_COMMIT keeps buffer and lease live
```

如果 physical free 抛异常，lease 仍留在 registry 中，Run disposal 能看到这份未释放资源并 quarantine。相反，先删 lease 再 free 会在失败后永久丢失 physical owner。

* * *

## 六、网络层给出的教训：时间相邻不等于 Producer 关系

Guest Thread Runtime 不只解决线程切换，也必须解决跨调用状态到底从哪里产生。

笔者在梳理一条通用网络初始化链时，曾遇到两个看起来高度相关的数据：前一个 native command 返回一段连接 metadata，随后同一宿主执行链又把一段较短的二进制输入交给安全回调。它们出现在线程相邻、时间相邻的位置，因此最初很容易画出这样的边：

```
connection metadata
  -> unknown transform
  -> callback binary input
```

如果把这条边直接写进模拟器，下一步通常就是尝试截断、hash、decode、AES 或固定 fallback。但这些方法都在回答“怎样造出一个形状相似的值”，没有回答“谁才是真实 producer”。

进一步检查对象 identity、调用边界、内容摘要和真实 consumer 后，笔者发现两者属于两个独立数据域：

```
native metadata producer  -> connection state

network callback producer -> callback argument -> data consumer
```

它们共享网络会话上下文，却不存在可证明的直接派生关系。

这个例子带来了三个架构结论。

### 6.1 Command record 不能冒充 callback record

callback 可能发生在两个 native command 之间，也可能来自一个长期存在的网络 session。它不应借用前一个 completed command 的 record，更不能借用未来 consumer invocation 的 record。

因此需要独立对象：

```
HostCallbackRecord
CallbackAdmissionReceipt
HostCallbackStateKey
HostCallbackDispatchScope
```

### 6.2 Callback type 不是 Callback instance

同一种 callback boundary 在一次 Run 中可以出现多次，也可以属于不同 connection/session。只用一个 enum 或 `lastCallback` 槽位，会让后来的 callback 覆盖前一实例。

更合理的 identity 是：

```
RunId
  + typed callback boundary
  + opaque connection/session identity
  + authority-issued monotonic sequence
```

consumer 必须携带并消费与当前 session、parent invocation 和 binding 对应的 exact receipt，不能查询“最近一次同类型 callback”。

### 6.3 Adapter 只观察真实 callback，不制造 callback

如果模拟环境并不执行完整 Java framework body，可以在精确的入站 DVM method dispatch 上安装 adapter。它只做三件事：

1.  从真实 receiver 和参数读取 session 与 callback input；
2.  从 dispatcher sealed snapshot 读取当前 carrier、binding 和 parent invocation；
3.  让 callback authority 原子提交 record、state 和 receipt。

adapter 不主动调用 callback，不生成固定输入，也不替代原始 decrypt/consumer 逻辑。真实 callback 没有发生时，依赖它的节点应继续 fail closed。

### 6.4 DispatcherCurrentCallbackSnapshot：当前执行者必须由 dispatcher 封存

callback authority 不能接受这样的接口：

```java
CurrentTaskAccess access = () -> someTask;
```

普通 caller 返回一个 live Task，并不能证明这个 Task 此刻真的是 dispatcher current。正确做法是在 dispatcher 持有 running ownership 的边界签发 sealed snapshot：

```java
public final class DispatcherCurrentCallbackSnapshot {

    private final RunId runId;
    private final long runGeneration;
    private final Task carrier;
    private final AdmissionReceipt admission;
    private final InvocationId parentInvocationId;
    private final long bindingEpoch;
    private final long dispatcherSequence;
    private final Object dispatcherIdentity;

    DispatcherCurrentCallbackSnapshot(
            RunId runId,
            long runGeneration,
            Task carrier,
            AdmissionReceipt admission,
            InvocationId parentInvocationId,
            long bindingEpoch,
            long dispatcherSequence,
            Object dispatcherIdentity) {
        // package-private: only dispatcher integration can mint it
        this.runId = runId;
        this.runGeneration = runGeneration;
        this.carrier = carrier;
        this.admission = admission;
        this.parentInvocationId = parentInvocationId;
        this.bindingEpoch = bindingEpoch;
        this.dispatcherSequence = dispatcherSequence;
        this.dispatcherIdentity = dispatcherIdentity;
    }
}
```

authority 消费 snapshot 时还要回查当前 live state：carrier 未退役、binding epoch 未变化、parent invocation 仍处于允许 callback 的状态、dispatcher sequence 仍对应当前 owner session。

### 6.5 Callback identity 与 state key

```java
public record CallbackInstanceId(
        RunId runId,
        CallbackBoundaryId boundary,
        OpaqueSessionId session,
        long sequence) {}

public record HostCallbackStateKey(
        CallbackInstanceId callback,
        String valueType) {}
```

```java
public final class HostCallbackRecord {

    private final CallbackInstanceId id;
    private final ThreadIncarnationId threadId;
    private final InvocationId parentInvocationId;
    private final long bindingEpoch;
    private final Object argumentIdentity;
    private final byte[] defensiveCopy;

    private CallbackState state = CallbackState.OBSERVED;

    void markStateCommitted(HostCallbackStateKey key) {
        requireState(CallbackState.OBSERVED);
        this.state = CallbackState.STATE_COMMITTED;
    }
}
```

callback 参数需要 defensive copy，object identity 则用于防止同一 mutable array 在 commit 后被 caller 改写。是否允许相同对象重复通知，应由 callback boundary policy 明确决定，而不是依赖 `byte[].equals()` 。

### 6.6 HostCallbackAuthority 的原子提交

```java
public CallbackAdmissionReceipt observeAndCommit(
        CallbackBoundaryId boundary,
        OpaqueSessionHandle sessionHandle,
        DispatcherCurrentCallbackSnapshot snapshot,
        Object actualArgument) {

    CurrentRuntimeOwner owner = dispatcherVerifier.verify(snapshot);
    CallbackArgument argument = argumentValidator.requireTypedActual(
            boundary, actualArgument);

    CallbackInstanceId instance = callbackSequences.next(
            run.id(), boundary, sessions.resolve(sessionHandle));

    HostCallbackRecord record = records.prepare(
            instance,
            owner.threadId(),
            owner.parentInvocationId(),
            owner.bindingEpoch(),
            argument);

    HostCallbackStateKey stateKey = stateStore.stageHostCallback(record);

    try (RunMutationPermit mutation = run.beginMutation("host_callback")) {
        stateStore.commitHostCallback(record, stateKey);
        CallbackAdmissionReceipt receipt = receipts.publish(
                record, stateKey, owner.admission());
        mutation.commit();
        return receipt;
    } catch (RuntimeException failure) {
        stateStore.discardHostCallback(record, stateKey);
        records.rollback(record);
        throw failure;
    }
}
```

如果 graph 也需要镜像 callback milestone，它应作为同一 transaction 的 participant，或者由 coordinator 同时 prepare StateStore、receipt registry、expected slot 和 graph publication。不能先 commit callback state，再把 graph 失败仅仅解释为“最后反正不 ready”。

### 6.7 HostCallbackDispatchScope：只在嵌套 callback 内可见

```java
try (HostCallbackDispatchScope scope = callbackScopes.open(receipt)) {
    return invokeOriginalCallbackConsumer(receiver, args);
}
```

后续 native consumer 只能从当前 live scope 读取 exact receipt：

```java
CallbackAdmissionReceipt receipt = callbackScopes
        .requireCurrent()
        .requireBoundary(expectedBoundary)
        .requireSession(expectedSession)
        .requireParent(currentInvocation.id())
        .receipt();
```

scope 在 callback 返回后关闭，receipt 仍可作为历史 evidence 保存在 ledger 中，但不能通过一个全局 `lastCallbackAdmission` 重新注入其他 invocation。

这里真正可复用的方法不是某个网络协议的实现，而是一条因果纪律：

> 同线程只能证明调度邻接，同时间只能证明事件邻接；只有 exact object identity、producer boundary 和 consumer receipt 才能证明数据依赖。

* * *

## 七、Readiness 不是普通的 if (ready)

在组合场景中，最让人困惑的现象是：每条前置调用都有 terminal，最终集成边界却仍然不能安全进入。反过来，如果只看几个 `ready` boolean，它又可能在 callback 尚未提交、carrier 尚未退役时过早放行。

当一组线程、native invocation、host state 和网络 callback 共同组成一个稳定前缀时，系统需要在某个 integration boundary 前判断“前置条件是否已经完整”。

最简单的实现是依次查询：

```java
if (graphReady
        && stateReady
        && callbackReady
        && noLiveTask) {
    enterNextStage();
}
```

这段代码在并发环境中并不可靠。检查完 graph 后，另一个线程可以创建新 invocation；检查完 callback 后，root fault 可以让整个 Run 失效；检查完 lease map 为空后，一个 prepared admission 又可能进入队列。

Readiness 不是几个 boolean 的 AND，而是跨多个 owner 的一致性证明。

![Readiness Authority 与不可变证据闸门](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4a60d39e8afc512d.jpg)

### 7.1 ScenarioConfig 只声明 expected slots

配置期可以知道的是：

-   哪些 typed node 是 required；
-   哪些 node 是 optional；
-   每类 node 的 cardinality；
-   节点之间的 partial-order 关系；
-   哪些 role、callback 和 state receipt 必须出现。

配置期不知道未来的 admission sequence、callback sequence 或 receipt object identity。因此 `ScenarioConfig` 只能预注册 immutable expected slots，不能提前伪造运行时证据。

运行时每个合法 producer 在自己的 commit transaction 中，把 exact receipt 绑定到对应 slot：

```
Native slot   <- AdmissionReceipt + RetirementReceipt
Callback slot <- CallbackAdmissionReceipt
Role slot     <- RoleBindingReceipt
Host slot     <- typed committed state evidence
```

### 7.2 Authority 核验 Expected Set 与 Actual Set

签发 readiness 前，authority 需要比较：

```
BoundExpectedReceiptSet
    ==
ActualReceiptSet from terminal/state/callback/role ledgers
```

比较的是 typed identity 集合，不是 count、非空 Map 或 caller 提供的 digest。missing、extra、duplicate、wrong generation、cross-Run 或 stale binding 任一出现，都不能签发 receipt。

### 7.3 Mutation epoch 关闭 TOCTOU 窗口

所有会影响 readiness 的 mutation，都必须通过同一个 Run-owned gate：

```
carrier admission / retirement
invocation state transition
wait edge
fault
callback commit
graph milestone
state commit
role lineage change
```

每次成功 mutation 推进单调 epoch。readiness receipt 封存签发时的 epoch；签发后发生任何相关 mutation，旧 receipt 自动 stale，并允许在新状态稳定后重新 issue。

![Mermaid 架构图 8](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/25e277996756c04a.png)

### 7.4 Readiness receipt 与 boundary admission 必须同一事务消费

即使 receipt 在签发时有效，也不能先 `receipt.consume()` ，再单独创建下一阶段 carrier。两步之间仍然可能失败，留下“readiness 已消费，但目标 invocation 没有入场”的半状态。

正确做法是：

```rust
verify immutable readiness receipt
  -> claim exact carrier reservation
  -> seal new readiness mutation
  -> prepare dispatcher admission
  -> publish the same final commit marker
  -> mark receipt consumed in authority ledger
```

因此，integration boundary 只是当前 ScenarioConfig 的一个 typed admission node，不是 runtime 内硬编码的某个 command。换一个场景，boundary 可以改变；Run、GuestThread、JNI、fault 和 receipt 合同不需要随之改变。

### 7.5 ScenarioConfig 与 ExpectedNodeSlotPlan 的类设计

```java
public record ScenarioNodeId(String value) {}
public record ScenarioConfigId(String value) {}

public final class ExpectedNodeSlotPlan {
    enum SlotKind { NATIVE, HOST_STATE, CALLBACK, ROLE_LINEAGE }
    public record Slot(
            ScenarioNodeId node,
            SlotKind kind,
            int cardinality,
            boolean required) {}
    private final Map<ScenarioNodeId, Slot> slots;
    void requireCanBind(ScenarioNodeId node, SlotKind kind, int existingCount);
}

public final class ScenarioConfig {
    private final ScenarioConfigId id;
    private final ExpectedNodeSlotPlan expectedSlots;
    private final Set<ScenarioEdge> partialOrder;
    private final Set<ScenarioNodeId> optionalNodes;
    void validateStaticClosure();
}
```

`ScenarioNodeId` 必须从 spec 一路贯穿 record、reservation、admission、route ledger 和 terminal evidence。自由文本 context、command category 或 admission sequence 都不能临时升格为 node identity。

### 7.6 BoundExpectedReceiptSet：绑定的是 exact identity

```java
public final class BoundExpectedReceiptSet {
    private final ScenarioConfigId configId;
    private final Map<ScenarioNodeId, List<BoundReceipt>> receipts;

    void bindNative(ScenarioNodeId node,
                    AdmissionReceipt admission,
                    CarrierRetirementReceipt retirement);
    void bindCallback(ScenarioNodeId node, CallbackAdmissionReceipt callback);
    BoundExpectedSnapshot snapshot(long mutationEpoch);
}
```

这里使用 `Map<Node, List<Receipt>>` ，而不是 `Map<Node, Receipt>` ，因为某个 slot 的合法 cardinality 可能大于一。更不能使用 `Map<Command, Receipt>` ，同一 command category 可以对应多个不同 scenario node。

### 7.7 ReadinessReceipt 与 AdmissionPermit

```java
public record ReadinessReceipt(
        RunId runId,
        long authorityEpoch,
        long runtimeMutationEpoch,
        long graphGeneration,
        long issueSequence,
        ScenarioConfigId scenarioConfigId,
        ReceiptClosureDigest closureDigest) {}

public record BoundaryAdmissionPermit(
        RunId runId,
        long authorityEpoch,
        long readinessIssueSequence,
        long runtimeMutationEpoch,
        Object permitIdentity) {}
```

permit 在 authority 内部还要维护 claim 状态：

```
UNCLAIMED
  -> CLAIMED(exact reservation identity)
  -> CONSUMED(exact final admission identity)
```

第一次 claim 后，同一 permit 不能再为第二个 carrier prepare admission；即使第二个 reservation 的字段恰好相同，只要对象或 authority identity 不同，也必须拒绝。

### 7.8 PreBoundaryReadinessAuthority 的签发算法

```java
public ReadinessReceipt issueIfReady() {
    mutationGate.writeLock().lock();
    try {
        requirePhase(ReadinessPhase.OPEN);
        long epoch = run.runtimeMutationEpoch();
        EvidenceSnapshot evidence = evidenceSource.snapshotAll(epoch);
        matcher.requireExactClosure(config, boundExpected.snapshot(epoch), evidence);
        requireNoFaultLeaseWaiterOrContinuation(evidence);
        requireEpochUnchanged(epoch);
        return receipts.issue(run.id(), authorityEpoch, epoch, evidence.digest());
    } finally {
        mutationGate.writeLock().unlock();
    }
}
```

这个算法不能只扫描 live admission map，因为合法 readiness 时 live admission 本来就应为空。前序已完成的 native 节点必须从 terminal/retirement ledger 读取历史双 receipt；callback、host state 和 role lineage 也从各自的 committed ledger 提供 actual evidence。

### 7.9 MutationPermit 的 validate-before-commit

```java
public final class RunMutationPermit implements AutoCloseable {

    private boolean committed;

    public void commit() {
        requireOwnerStatePrepared();
        readinessAuthority.validateMutationCommit(this);
        owner.commitPreparedMutation();
        readinessAuthority.advanceEpochAndInvalidateReceipt(this);
        committed = true;
    }

    @Override
    public void close() {
        if (!committed) {
            owner.abortPreparedMutation();
        }
    }
}
```

`committed=true` 必须是最后一步。若先标 committed 或先推进 epoch，再调用可能失败的 owner commit， `close()` 就无法 rollback，会留下半 mutation。

### 7.10 Boundary admission 与 readiness 的共同 commit

```java
public AdmissionReceipt commitBoundaryAdmission(
        BoundaryAdmissionPermit permit,
        CarrierAdmissionReservation reservation,
        DispatcherPreparedAdmission dispatcherPrepared) {

    readinessAuthority.claimExactReservation(permit, reservation);

    try (FinalAdmissionTransaction tx =
                 admissionAuthority.prepareDispatcherAdmission(
                         reservation, dispatcherPrepared)) {

        tx.stage(readinessAuthority.prepareConsume(permit, reservation));
        tx.stage(routeAuthority.prepareBoundaryOpen(reservation));

        FinalAdmissionCommitBundle bundle = tx.commit();
        readinessAuthority.markConsumedFromBundle(permit, bundle);
        return bundle.admission();
    }
}
```

实际实现可以把 `markConsumed` 也纳入 marker publication，而不是 marker 后再调用一个可能失败的方法。这里的类设计重点是：readiness permit、exact reservation 和 final AdmissionReceipt 必须共享同一个 transaction identity。

### 7.11 TerminalEvidenceLedger：活动对象消失后，证据仍要存在

Readiness 不能只查询 live carrier、当前 command record 或“最后一次返回值”。这些对象服务于正在执行的生命周期，正常 retirement 后就应该从活动索引中移除；如果 readiness 依赖它们，正确 cleanup 反而会把最终验收所需的证据一起删掉。

因此 runtime 还需要一个 Run-owned `TerminalEvidenceLedger` 。它保存的不是可继续执行的对象引用，而是 terminal 与 retirement 完成后签发的不可变事实：

```java
public final class TerminalEvidenceLedger {
    void publishNativeTerminal(
            ScenarioNodeId node,
            AdmissionReceipt admission,
            CarrierRetirementReceipt retirement,
            InvocationTerminal terminal);

    void publishHostState(
            ScenarioNodeId node,
            CallbackAdmissionReceipt callback,
            StateCommitReceipt state);

    TerminalEvidenceSnapshot snapshot(
            RunId runId,
            long lifecycleEpoch,
            long mutationEpoch);
}
```

写入 ledger 之前，authority 必须核对 node、invocation、admission、retirement 和 terminal 属于同一个 Run 与同一条 identity 链。一枚 retirement receipt 不能为两个节点重复提供终态；live carrier 尚未离开 dispatcher、waiter 尚未解除或 backend ownership 尚未释放时，也不能提前发布“已经完成”的 native evidence。

读取侧只拿到 immutable snapshot。 `ReadinessAuthority` 使用 expected node set 与 ledger 中的 exact actual set 做比较，而不是遍历正在变化的 registry。这样可以同时满足两个看似冲突的目标：活动 owner 能够按时释放，最终边界又能在 cleanup 之后验证它们确实以正确身份完成。

Run quarantine 或 lifecycle epoch 改变后，旧 ledger snapshot 立即失去授权；fresh Run 即使出现相同的 node 名称，也必须重新产生 admission、retirement 和 terminal evidence。终态证据可以比 carrier 活得久，但不能比它所属的 Run 活得久。

* * *

## 八、我们怎么测试，又怎么验收 Guest Thread Runtime

这次重构中最容易产生误判的，不是测试失败，而是测试过早变绿：纯模型证明了 receipt 可以构造，真实 dispatcher 却没有走这条 authority；合成 callback 能提交 state，生产 adapter 仍可能缺少 exact instance。

因此，这类 runtime 不能用“主流程返回了”作为验收标准。我们把每条架构能力拆成可重复执行的永久合同，并要求同一条合同同时具备正向、负向、清理、并发和生产入口证据。

验收不是统计测试数量，而是检查一条 ownership 链是否闭合：

```rust
production caller
  -> exact owner / authority
  -> immutable identity or receipt
  -> positive path
  -> mismatch / stale negative path
  -> rollback or retirement cleanup
  -> concurrency interleaving
  -> clean-process repeatability
```

其中任意一格缺失，这条能力最多只能说局部对象成立，不能说 runtime 已经遵守了该合同。

### 8.1 三层测试各自回答不同问题

我们把测试分成 model contract、production-connected contract 和 runtime scenario 三层。

| 测试层 | 测试入口 | 主要断言 | 不能替代什么 |
| --- | --- | --- | --- |
| Model contract | 纯 authority、record、state machine | identity、epoch、状态迁移局部自洽 | 真实 dispatcher 是否接线 |
| Production-connected contract | dispatcher、Task、DVM/JNI、callback adapter | 生产 caller 是否消费同一 owner 和 receipt | 完整场景输入是否齐全 |
| Runtime scenario | 多线程交错与完整 lifecycle | 多条合同组合后仍能收束 | 每个 failure path 的负控 |

model test 负责快速穷举状态；production-connected test 负责防止“测试只调用 helper，生产入口走另一条路”；runtime scenario 负责验证多个 owner 组合时没有新的半状态。三层必须同时保留，不能拿一条端到端 green 覆盖底层负控。

### 8.2 测试夹具也要表达真实 owner

为了避免每个测试自己拼一套不完整对象，我们使用一个最小 runtime fixture。fixture 可以替换 backend 和 clock，但不能绕过 authority：

```java
public final class GuestThreadRuntimeFixture implements AutoCloseable {

    private final RunContext run;
    private final TestDispatcher dispatcher;
    private final ControllableBackend backend;
    private final ManualGuestClock guestClock;
    private final FailureInjector failures;

    public GuestThreadHandle createNativeThread(ThreadBirthSpec birth) { ... }

    public SubmittedInvocation submit(
            GuestThreadHandle thread,
            InvocationSpec spec) { ... }

    public void runUntil(DispatcherCheckpoint checkpoint) { ... }

    public RuntimeEvidenceSnapshot snapshot() { ... }

    @Override
    public void close() {
        run.close();
    }
}
```

测试不能直接构造 `AdmissionReceipt` 、 `CarrierRetirementReceipt` 或 `ReadinessReceipt` 。fixture 只能通过 dispatcher 和 authority 获得它们。否则字段相同的假对象也可能通过测试，mint authority 却从未被验证。

`RuntimeEvidenceSnapshot` 只提供同一 mutation epoch 下的不可变读视图，包含 thread、invocation、admission、retirement、wait graph、JNI 和 StateStore。这样测试不会先后读取多个 registry，拼出一个从未同时存在过的状态。

### 8.3 Model contract：先把 identity mismatch 全部打红

model contract 的目标是证明每个强类型身份都不能被“字段差不多”的对象替代。同一组合同覆盖：

-   same command、different generation 不串 result 或 terminal；
-   wrong Run、wrong thread、wrong binding、wrong lease 全部拒绝；
-   non-LIFO child continuation 不能恢复；
-   duplicate publication 不能覆盖第一份 immutable receipt；
-   authority epoch 改变后旧 receipt stale；
-   public caller 无法伪造 mint token。

正向断言只证明“合法对象能走通”；这些 mismatch 负控才证明边界真正存在。

### 8.4 Production-connected contract：必须穿过真实调用点

生产连接测试不直接调用 cleanup helper，而是从真实 lifecycle 入口触发。例如 retirement 测试要让 dispatcher 完整经历 running slot、backend stop、waiter removal、queue removal 和 receipt issuance：

```java
final class DispatcherRetirementProductionContractTest {

    @Test
    void terminalFlowsThroughFullRemovalFunnel() {
        try (GuestThreadRuntimeFixture f = fixture()) {
            SubmittedInvocation call = f.submit(
                    f.createNativeThread(nativeBirth()), invocation());

            f.runUntil(DispatcherCheckpoint.NATIVE_RETURNED);
            f.dispatcher().completeFromProductionLifecycle(call.carrier());

            RuntimeEvidenceSnapshot s = f.snapshot();
            CarrierRetirementReceipt retired =
                    onlyRetirementOwnedBy(s, call.admission());

            assertThat(retired.removal().runningSlotCleared()).isTrue();
            assertThat(retired.removal().waiterDetached()).isTrue();
            assertThat(retired.removal().backendReleased()).isTrue();
            assertThat(s.invocations()).noneMatch(InvocationSnapshot::dispatchable);
        }
    }
}
```

JNI 合同同样从 guest function table 或 SVC router 进入；callback 合同从真实 adapter 的 entry/exit scope 进入；stack 合同从 backend allocator 获取地址。只有这样，测试才会覆盖生产调用点的锁、owner 和 cleanup 顺序。

### 8.5 Failure injection：在 commit 的每个边界故意失败

事务测试必须能够精确控制失败发生在哪一步。我们为跨 owner transaction 定义 named checkpoint，而不是在随机位置抛异常：

```java
public enum FailurePoint {
    AFTER_STACK_ALLOCATED,
    AFTER_BINDING_PREPARED,
    AFTER_DISPATCHER_PREPARED,
    AFTER_FINAL_RECEIPT_STAGED,
    BEFORE_COMMIT_MARKER,
    DURING_RETIREMENT_REMOVAL,
    DURING_PHYSICAL_RELEASE
}

public interface FailureInjector {
    void hit(FailurePoint point);
}
```

一条 admission failure-atomic 合同至少验证三种结果：

```java
@ParameterizedTest
@EnumSource(PreCommitFailurePoint.class)
void preCommitFailureLeavesNoVisibleAdmission(FailurePoint point) {
    fixture.failures().throwAt(point);

    assertThrows(InjectedFailure.class,
            () -> fixture.submit(thread(), invocation()));

    RuntimeEvidenceSnapshot s = fixture.snapshot();
    assertThat(s.admissions()).isEmpty();
    assertThat(s.invocations()).noneMatch(InvocationSnapshot::runnable);
    assertThat(s.waitGraph().edges()).isEmpty();
}
```

如果 failure 发生在 commit marker 之后，测试预期不能再回滚已运行对象，而是必须进入 dispatcher-owned cancellation/retirement。若 physical release 失败，physical owner 应被保留在 quarantine inventory 中，不能从所有 registry 消失。

### 8.6 双线程 barrier：不用 sleep() 猜锁顺序

并发合同要把两个宿主线程固定在确定的 checkpoint。下面的夹具允许测试线程 A 停在 readiness snapshot 内，线程 B 同时尝试 StateStore mutation：

```java
public final class TwoPartyInterleaving {

    private final CyclicBarrier entered = new CyclicBarrier(2);
    private final CountDownLatch release = new CountDownLatch(1);

    public void pauseFirstAt(String checkpoint) {
        hooks.on(checkpoint, () -> {
            entered.await();
            release.await();
        });
    }

    public void awaitBothEntered() { entered.await(); }
    public void releaseFirst() { release.countDown(); }
}
```

锁顺序测试的核心不是“在规定时间内没卡住”，而是让两个可能互相等待的调用方向在受控条件下确实同时发生：

```java
@Test
void readinessAndStateMutationDoNotUpgradeLocks() throws Exception {
    interleaving.pauseFirstAt("readiness.after-snapshot");

    Future<ReadinessResult> issue = pool.submit(
            () -> readiness.issueIfReady());
    interleaving.awaitBothEntered();

    Future<?> mutation = pool.submit(
            () -> stateStore.commitThroughMutationPermit(preparedState));

    interleaving.releaseFirst();

    assertCompletes(issue, boundedHostDuration());
    assertCompletes(mutation, boundedHostDuration());
    assertExactlyOneOfReadyOrStale(issue.get());
}
```

这里的有界 host duration 只是测试框架的防失控条件。它不能被映射成 guest timeout。测试还要断言最终 mutation epoch、readiness phase 和 StateStore commit identity 一致，不能只断言两个 Future 都结束。

统一锁规则由这类测试固化：

```
不持有 graph lock 调用 StateStore 或 thread registry
不持有 admission lock 进入 dispatcher callback
不在 ordinary read permit 内升级 config write registration
跨 owner 先取得 immutable snapshot，再 compare-and-commit
```

### 8.7 Stack 与 canary：既测模型区间，也读真实 backend

stack 隔离要分两层验收。第一层验证 `StackRegion` 的 range、guard page 和 owner identity；第二层通过真实 backend memory 读回 canary，并在 suspend/resume 后再次确认 SP 仍位于自己的 region。

生产连接测试必须同时断言：两段 backend allocation 不重叠、canary 从真实 memory 读回、两个 suspended SP 各自在自己的 region 内，并且 continuation 恢复后 allocation identity 未改变。

负控还要主动破坏 canary，确认系统产生 runtime integrity fault、冻结 admission 并保留 physical owner；不能只抛一个 assertion error 后继续复用 Run。

### 8.8 Callback instance isolation：相同类型也不能互相顶替

callback 测试至少创建两个同类型、不同 instance/session/sequence 的 callback，让它们交错进入 adapter。consumer 必须按 exact `CallbackInstanceId` 取值，而不是按 callback class 或“最后一次回调”取值。

验收时分别提交两份抽象 payload，断言两个 receipt、state key 和 parent snapshot 都保持 instance-scoped；再故意让第一个 consumer 消费第二枚 receipt，必须得到 identity mismatch，且两个已提交 state 都不被改写。

adapter 只能观察真实 callback 参数并提交 typed state，不能在没有 callback entry scope 时制造 synthetic success。嵌套 callback 结束后， `HostCallbackDispatchScope` 必须恢复 parent snapshot；两个并发 instance 的 local handle 也不能互相可见。

### 8.9 Readiness stale 与 reissue：验收 TOCTOU 是否真正关闭

readiness 测试先建立一组完整 evidence，签发 receipt，再在消费前引入一个合法 mutation。旧 receipt 必须 stale；mutation 完整退役后，authority 才能以新的 epoch 重新签发。

```java
final class ReadinessReissueContractTest {

    @Test
    void mutationAfterIssueStalesOldReceiptAndAllowsReissue() {
        fixture.completeExpectedGraph();
        ReadinessReceipt first = readiness.issueIfReady();

        SubmittedInvocation extra = fixture.submit(
                thread(), optionalInvocation());

        assertThrows(StaleReadinessReceiptException.class,
                () -> readiness.claim(first, boundaryReservation()));

        fixture.completeAndRetire(extra);
        ReadinessReceipt second = readiness.issueIfReady();

        assertThat(second.runtimeMutationEpoch())
                .isGreaterThan(first.runtimeMutationEpoch());
        assertThat(second.issueSequence())
                .isGreaterThan(first.issueSequence());
    }
}
```

另一个必要负控是“一张 permit 准备两个 reservation”：第一次 claim 后，第二个 reservation 即使字段完全相同也必须拒绝。permit 的终态只能是：

```
UNCLAIMED
  -> CLAIMED(exact reservation identity)
  -> CONSUMED(exact final admission identity)
```

readiness consume 和 boundary final admission 还要共享同一 commit marker。测试在两者之间注入 failure 时，预期只能是两边都不可见，或 marker 已发布后统一进入 retirement，不能一个显示 consumed、另一个没有 admission。

### 8.10 Fault、取消和 Run disposal 的验收

故障测试建立 A 等待 B、C 等待 A 的 transitive graph，然后让 B 在 backend 中产生未处理 fault。验收顺序必须可观察：

```bash
freeze admission
  -> publish exact root fault on B
  -> snapshot direct/transitive waiters A、C
  -> publish dependency terminal
  -> cleanup wait edges
  -> request carrier quiescence
  -> dispatcher retirement receipts
  -> Run quarantine/disposal
```

对应断言包括：

-   A、C 的 terminal 是 `DEPENDENCY_FAILED` ，不是伪造的 root fault；
-   edge cleanup 前已经保存 waiter snapshot；
-   `CANCELLED` 不早于 retirement receipt；
-   fault 后同一 Run 拒绝新 admission；
-   stack、JNI frame、StateStore staging 和 mailbox 都有 release evidence；
-   fresh Run 不继承旧 TID incarnation、receipt、pending exception 或 committed callback scope。

对于 guest 已通过 signal handler 正常消费的 fault，则做相反负控：它不得自动 quarantine。这个分支必须有 exact signal-delivery terminal，避免把“异常发生过”简单等同于 Run 已损坏。

### 8.11 最终怎么判定一条合同通过

我们为每条合同维护一行验收矩阵，而不是只保留一条测试名：

| 验收格 | 必须提供的证据 |
| --- | --- |
| Production caller | 实际 dispatcher、JNI router、callback adapter 或 lifecycle 入口 |
| Authority owner | 唯一 mint/commit/retire owner |
| Positive | 合法 identity 完整走通 |
| Negative | wrong identity、stale epoch、cross-Run 或 duplicate 被拒绝 |
| Cleanup | rollback、retirement、fault release 或 quarantine inventory |
| Concurrency | barrier 固定的可重复 interleaving |
| Repeatability | clean process 下重复执行得到相同合同结果 |

一行只有在所有 required cell 都有永久、可重复的测试证据时才算通过。下面几种结果都不能替代验收：

```
类已经存在
model test 通过
测试 helper 可以手工构造 receipt
synthetic scenario 返回成功
某次完整运行偶然得到预期结果
```

最终验收关注的不是“跑绿了多少测试”，而是每个 guest-visible 行为能否从生产 caller 一直追到 exact owner、receipt、terminal 和 cleanup，并且在错误 identity、失败注入和并发交错下仍然保持同一套规则。

* * *

## 九、单 backend 的能力边界

Guest Thread Runtime 不会把一个 Unicorn backend 变成真正的多核 Android 内核。它提供的是：

-   确定性的协作式交错；
-   可预测的 native safe point；
-   exact thread identity 和 invocation ownership；
-   stack、TLS、JNI 与 fault 隔离；
-   partial-order 合同验证；
-   可重复的 schedule trace；
-   admission、retirement 和 readiness 的不可变证据。

它不提供：

-   真正 SMP 并行；
-   ARM 弱内存序下的全部竞态结果；
-   与设备逐指令一致的 OS 抢占时机；
-   自动补齐所有 Android kernel 和 Bionic thread feature；
-   synthetic contract 通过后自动得到某个上层结果。

对于暂未实现的 thread-sensitive API，正确策略是显式标记：

```
IMPLEMENTED
UNSUPPORTED_FAIL_CLOSED
NOT_OBSERVED
```

不能回退到 host Java thread、Windows thread list 或 process pid，因为这种“看起来有返回值”的兼容行为会重新破坏 GuestThread identity。

* * *

## 结语

笔者最初以为，unidbg 多线程问题的核心是“worker 没有获得 CPU”，所以第一代方案给 backend 加上了原生时间片。

随后笔者发现，Task 能轮流运行仍然无法表达重叠调用，于是第二代方案增加 Invocation record、generation、FIFO handoff、exact outcome 和独立 JNI local-reference scope。

继续实现后，问题的主语再次改变：Invocation 只回答“这是哪一次调用”，却不能回答“它属于哪一个 guest thread、使用哪一份线程级状态、谁临时驾驶 backend、什么时候可以安全释放资源”。因此第三代方案进一步拆出了 Run、GuestThread、Invocation 和 Carrier，并用 Binding、Lease、Receipt、Authority 和 Readiness 把状态迁移变成可验证的事务。

回头看，三代方案并不是互相推翻：

```
Native Timeslice
  解决 Task 怎样获得执行机会

Invocation-Owned Runtime
  解决一次调用怎样拥有 context、terminal 和 local refs

Guest Thread Runtime
  解决线程身份、执行现场、调用栈和事务证据怎样闭合
```

真正困难的不是让模拟器“多跑几个线程”，而是确保每一次出生、绑定、入场、暂停、重入、返回、失败和退役，都精确属于正确的 Run、正确的 GuestThread、正确的 Invocation 和正确的 Carrier。

只有这些身份和证据边界成立，单 backend 的确定性交错才不再是一组调度补丁，而是一套可以推理、测试和长期演进的 guest thread runtime。

* * *

## 附件：核心架构代码

为便于读者把类设计与前文的对象模型对应起来，本文附上经过脱敏的核心架构代码阅读切片。附件覆盖 Run、GuestThread、Invocation、Carrier、Stack、Receipt、Wait Graph 和终态证据等边界。

这些文件是从实现中抽取的 **非独立编译阅读副本** ：为避免暴露具体工程、阶段和接入上下文，副本中的 readiness authority、角色名和 callback 名称已替换为通用名称；它们不包含任何业务入口、网络目标、命令编号、密钥或签名参数。完整依赖关系请参见附件目录中的 `README.md` 。

* * *

*本文只描述 unidbg 单后端 guest thread runtime 的通用设计。所有示例均已抽象化，不包含具体应用、命令编号、网络目标、密钥材料、签名参数、业务数据或绕过安全机制的方法。如有侵权，请联系删除*

## 附件

- [code.zip](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/07/d76f71e0bf2983ec.zip) （25.07kb，1次下载）
