---
title: 【看雪】Android 内核无痕 Hook 框架设计思路和避坑指南
source: https://bbs.kanxue.com/thread-292066.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-18T23:23:44+08:00
trace_id: a93240c9-4c23-4b54-91b4-ed16855972a4
content_hash: 2ff59d1fcb6deff27020ee1db251df6ac1277837f41304728b098bebf618deb9
status: summarized
tags:
  - 看雪
  - 内核Hook
  - 无痕技术
series: null
feed_source: 看雪·Android安全
ai_summary: GhostHook 框架通过内核态操作和幽灵内存，实现了内存映射与系统管理信息隔离的无痕能力，旨在对抗现代Android反作弊的高强度检测。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3a175244-d011-813f-b808-e43674aee625
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> GhostHook 框架通过内核态操作和幽灵内存，实现了内存映射与系统管理信息隔离的无痕能力，旨在对抗现代Android反作弊的高强度检测。
> 
> - **全面能力覆盖：** 框架整合了Inline Hook（Shadow Page方案）、ART Hook、HWBP硬件断点、CPU单步与仿真双模式Trace、无痕内存读写、VMA Dump、反调试对抗、Binder/Linker拦截、DEX内存加载等，提供一站式无痕解决方案。
> - **隐身根基：** 幽灵内存通过直接操作进程页表（PTE）映射内核分配的物理页，使得CPU硬件（MMU）认可访问，但操作系统管理层（VMA链表、`/proc/maps`）查无此映射，从源头上隐藏代码与数据。
> - **Shadow Hook：** 利用ARM64的FEAT_EPAN特性，将Hook代码置于仅执行（`--x`）的影子页中。当发生数据读取时，触发异常并临时切换至包含原始代码的数据页，读取完成后切回，实现“同一虚拟地址在不同权限下映射不同物理页”的隐蔽修改。
> - **跨进程继承：** 由于幽灵内存（VMA-less PTE）不会被内核的`copy_page_range`自动复制到fork产生的子进程，框架在`wake_up_new_task`窗口手动为子进程克隆幽灵内存、Shadow页、HWBP规则等四类对象，确保Hook能力可跨进程继承。
> - **开发体验：** 用户模块开发者仅需包含一个纯声明头文件，通过Daemon传入的`GhostApi`函数指针表即可调用所有底层能力（Hook、Trace、内存操作等），无需链接任何SDK库，实现了极简的开发接口。

## 写在前面

拜读完珍惜佬写的 [Android内核无痕Hook理解和感悟](https://bbs.kanxue.com/thread-290718.htm) 文章以后, 受益匪浅!!!

非常感谢珍惜佬的文章, 解释的非常清楚, 并且给出了很多实现细节, 非常值得学习和借鉴!!!

经段一段时间的摸索, 终于完整实现了珍惜佬文章中的无痕 Hook 框架, 这篇文章记录一下整体的设计思路和技术方向，顺便聊点踩坑经历。

整个框架的所有无痕能力都是基于 APatch 模块提供的内核 Hook 能力实现, 感谢 [APatch](https://github.com/bmax121/APatch)!!!

还要感谢 GitRoy 大佬提供的技术支持!!!

传统 Hook 能力的弊端这里就不提及了, 珍惜佬已经讲的很清楚了, 在现在的高强度对抗中, 传统 Hook 能力已经有些不足了, 所以我们需要一种新的 Hook 能力来对抗现在的各种高强度检测手段.

所以 **无痕 Hook** 诞生了!!!

## 框架能力 & 架构

### Hook & Trace & MemRW &?

既然从头造轮子, 那就一次搞定目前的需求吧, 所以框架覆盖了以下方向, 下面会附上原理和一些方案

-   模块化注入库
-   Zygote 注入 (用于在 App 启动后分发 Hook)
-   Inline Hook (基于 Shadow Page 方案)
-   基于指令插桩的寄存器快照记录 (基于 Shadow Page 方案)
-   指令插桩支持 Before & After 回调 (基于 Shadow Page 方案)
-   HWBP 断点 (基于直接操作 ARM64 调试寄存器, 绕过 perf_event 子系统)
-   VMA Less 内存分配 (Maps 不可见)
-   Art Hook (基于 Shadow Data Page 方案)
-   VMA Dump (内核直接遍历目标进程 VMA 链表, 不经 `/proc/maps`, 无痕读取)
-   内存读写 (内核侧走目标页表, 不经 ptrace/procfs, 支持跨进程)
-   内核态 Trace (基于 CPU 硬件单步 `MDSCR_EL1.SS` + `SPSR.SS`, 每条指令触发 SS 异常采集全量寄存器)
-   用户态指令模拟 Trace (基于 dbi 引擎全部走幽灵内存隐藏)
-   符号解析 (直接解析ELF 符号表, 不经 `dl_iterate_phdr`, 用于 Trace 反查符号 / Hook 定位)
-   反调试对抗 (内核层拦截 `ptrace`, 硬件调试寄存器假账本欺骗)
-   PC 管控台 (ghost-console + agent 翻译适配层, 设备侧事件 push + 控制 RPC 多路复用)
-   DEX 动态加载 (内存字节注入 Java 类, 不落盘)
-   Binder / Linker 拦截 (Shadow Hook 拦截 Binder 事务与 dlopen, 零 ArtMethod 改动)
-   SO 早期生命周期 & JNI Trace (解决 SO 构造函数早于模块 hook 的时序矛盾)
-   花指令对抗 (仿真跟随间接分支, trace 日志还原真实执行路径)
-   Daemon 热重载 (不重启 Zygote 热替换 Daemon)
-   跨 Fork 子进程继承 (VMA-less PTE 不被 fork 复制, 需手动克隆)
-   模块版本兼容 (编译期声明 API 版本约束)
-   and more...

### GhostHook 架构全景

先上一张整体架构图，感受一下模块关系:

```python
┌─────────────────────────────────────────────────┐
│              Manager App (EL0)                   │
│   KPM 加载 / 模块管理 / 注入配置 / 事件日志       │
└──────────────────────┬──────────────────────────┘
                       │ syscall (注入配置同步 / 事件轮询)
═══════════════════════╪═══════════════════════════ EL0/EL1
                       ▼
┌─────────────────────────────────────────────────┐
│            KPM 内核模块 (EL1)                     │
│  ┌─────────┬────────┬────────┬──────────────┐  │
│  │  HWBP   │ Shadow │ Ghost  │ Anti-Debug   │  │
│  │ Manager │  Page  │ Memory │ (假账本)      │  │
│  └─────────┴────────┴────────┴──────────────┘  │
│  ┌──────────┬──────────┬───────────────────┐    │
│  │ Mem R/W  │VMA Dump  │  CPU Trace (SS)   │    │
│  │(页表遍历) │(VMA链表) │  (MDSCR.SS+ring)  │    │
│  └──────────┴──────────┴───────────────────┘    │
└──────────────────────┬──────────────────────────┘
                       │ syscall (SDK 命令, daemon 代理)
═══════════════════════╪═══════════════════════════ EL0/EL1
                       ▼
┌─────────────────────────────────────────────────┐
│              目标进程 (EL0)                       │
│                                                   │
│  Daemon SO (先加载, 幽灵内存中, 全局单例)          │
│  ┌─────────────────────────────────────────┐     │
│  │  GhostApi 函数表实现                     │     │
│  │  syscall 桥接 / 符号解析 / 用户 SO 加载   │     │
│  │  mako (ART Hook) / gtrace (仿真 Trace)   │     │
│  │  dex loader / binder & linker 拦截器     │     │
│  └──────────────────┬──────────────────────┘     │
│                     │ 传入 GhostApi*              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ 用户 SO A│ │ 用户 SO B│ │ 用户 SO C│ ← 幽灵内存│
│  │ghostEntry│ │ghostEntry│ │ghostEntry│          │
│  └──────────┘ └──────────┘ └──────────┘         │
└─────────────────────────────────────────────────┘
```

几个关键设计决策:

**Daemon 代理模式** ：KPM 先往 Zygote 注入一个 Daemon SO，由它实现所有 SDK 逻辑并通过 syscall 与内核通信。用户模块只需要 include 一个纯声明头文件，通过 Daemon 传入的函数指针表调用能力。这样用户模块极轻量，多模块零代码重复，符号解析和 Hook 句柄管理都集中在 Daemon 一处。

**Zygote 注入** ：Daemon SO 只注入到 Zygote 进程常驻，子进程 fork 后按包名按需加载用户模块。好处是不用对每个目标 App 独立注入，Zygote fork 出来的所有进程天然继承。

**鉴权** ：KPM 启动时生成 32 字节随机 session key，所有命令必须携带。Manager 端通过签名锚定自动获取 key——KPM 编译期内置 Manager 签名证书摘要，鉴权请求到达时在内核态校验调用者 APK 签名是否匹配，命中则缓存 uid 走 fast-path，整个过程无需提权。非 Manager 链路（agent / PC 调试）走人工配对码 fallback：一次性短码，限时消费，防止被测信道检测

## 核心技术方向

### 模块化注入 & Zygote 注入

整个注入链路完全在内核态完成：KPM 读取 Daemon SO 的 ELF 文件、解析重定位、通过页表操作映射幽灵内存、生成 bootstrap 跳板劫持 Zygote 执行流。Daemon 驻留 Zygote 后，fork 出的子进程按包名匹配配置，按需加载用户模块。

注入编排流程大致是：发现 Zygote PID → 读取 ELF → 内核态 ELF 链接器解析 PT_LOAD 段 → 幽灵内存映射到 Zygote 用户态地址空间 → 注册 NEEDED 库到符号解析器 → 重定位（IFUNC 自修复）→ 生成 ARM64 bootstrap 跳板 → `task_work_add` 劫持执行流。

用户模块（`.ghm` 文件）由 Manager App 管理，Daemon 通过自带的 ELF 链接器在幽灵内存中加载，调用 `ghostEntry(GhostApi*)` 入口。模块开发者只需 include 一个纯声明头文件，不链接任何 SDK 库。

Daemon 热重载的设计思路是"清场再进场"：先清除 Zygote 上所有已注册的 hook 状态、拆除旧 daemon 幽灵内存映射（含用户态残留 PTE 清理），再重新注入新版本。整个过程不重启 Zygote，开发期迭代效率高。

内核 linker 有个很坑的点, 是 ifunc 的处理, 要么daemon全自实现函数, 要么就模块入口做一下ifunc的修复, 再进行其它操作

### Shadow Hook (影子页)

这里要感谢 WX 大佬提出的 [Shadow Page 方案](https://bbs.kanxue.com/thread-290304.htm), 下面 Art Hook 的隐藏就是根据这个延伸出的 Shaodw Data Page 方案

这是框架 Inline Hook 的核心方案。核心思路是"同一 VA 在执行和读取之间切换不同物理页"：

-   执行态映射到 shadow PFN，权限 `--x` （执行不可读），hook 字节写在 shadow 页
-   数据读取触发 DABT，PTE 切到 original PFN，权限 `r--` ，读到干净原始字节
-   读完成后下次执行触发 IABT，PTE 切回 shadow PFN

关键前提是设备支持 FEAT_EPAN（PAN3），它允许 EL0 使用 execute-only 映射（执行不可读的 PTE 权限组合）。

没有 EPAN 的设备走单页 `---` 仿真降级路径——原页完全阻断，KPM 在 fault handler 里软件仿真执行指令。仿真器按层级覆盖：PC-relative 指令必须仿真（用原始 PC 计算），普通 ALU 和访存指令软件仿真，SIMD/FP 等罕见指令走 backup 页单步兜底。

> \[!WARNING\]
> 
> -   如果设备不支持 EPAN 会很坑, 在 KPM 中做指令模拟确实能跑, 但是太复杂, 建议使用支持 FEAT_EPAN 特性的设备(Pixel 8/9), 实现起来很简单
> -   EPAN 状态不能在 EL0 直接查询。Linux 对 EL0 读 feature ID 寄存器做了陷入+消毒， `ID_AA64MMFR1_EL1.PAN` 在 EL0 读出来永远是 0。必须委托 KPM 在 EL1 读取并回报。

除了 Inline REPLACE，Shadow Page 还支持三种指令插桩模式：

-   **LISTEN** ：命中时发 PRE 事件（寄存器快照），单步原指令，SS 后发 POST 事件。纯监听，不阻断用户回调
-   **INTERCEPT** ：原指令执行后进入用户态 callback，回调可通过栈上的寄存器上下文改寄存器和续算 PC。上下文存在调用线程的栈帧上，天然线程安全
-   **BEFORE_AFTER** ：before callback 在原指令前执行，after callback 在原指令后执行，中间靠特定的内核通知机制协调原指令单步

插桩命中靠特定的未定义指令编码触发异常，handler 内根据 PC 偏移查表判断归属，不需要读取目标 VA 字节。

### 幽灵内存 (Ghost Mem)

这是整个框架隐身能力的根基。

常规 `mmap` 会在进程的 `mm_struct` 链表里注册 VMA，VMA 必然暴露在 `/proc/self/maps` 。即使你 hook `show_map_vma` 把它过滤掉， `mincore` 等盲探手段还是能发现。

幽灵内存的思路是绕过操作系统管理层，直接操作底层页表:

```python
function allocGhostMemory(pid, size):
    kernelPage = kernelVmalloc(size)          // 内核态分配物理页
    userVA = findUnusedVASpace(pid)           // 在用户态找一个 VMA 空洞
    // 直接修改目标进程页表，把 kernelPage 的 PFN 挂到 userVA
    // 手工拼装 PTE 属性位
    injectPte(pid->mm, userVA, kernelPage.pfn)
    flushTLB()                                 // 强制 CPU 认下这张"伪造地契"
    return userVA  // CPU 硬件认可，但 OS 管理层查无此 VMA
```

利用"硬件页表 (PTE) 与操作系统管理层 (VMA) 之间的信息差"制造的内存——CPU 的 MMU 查页表发现合法，用户态可以正常访问；但操作系统遍历 VMA 链表查不到这条记录。 `maps` 扫描、 `mincore` 探测全部失效，从源头上逃逸了 Linux 内存管理。

此外还有一个 `mmap_region` 守卫：ghost 映射是 VMA-less PTE，内核 `get_unmapped_area` / `mmap_region` 选址只看 VMA 不看 PTE，目标进程后续普通 mmap 可能落在 ghost PTE 占用的 VA 上导致静默覆盖。pre-hook 检测重叠，命中则返回 `-ENOMEM` （fail-closed）

### HWBP 硬件断点

ARM64 CPU 内置了调试寄存器，你把目标地址写进去，CPU 每次执行时硬件比较器自动比对，命中就触发异常。整个过程不改一个字节的内存。

GhostHook 的 HWBP **不经过 perf_event 子系统** ，而是在内核态直接操作 ARM64 调试寄存器并接管 debug 异常处理路径。这样做的好处是绕过了 perf_event 路径的检测面

**HWBP注册** 。Linux 内核里进程和线程都是 `task_struct` ，HWBP 绑定的是 TID 而非 TGID。只给主线程下断点，子线程走到目标地址根本不会报警。

**数量限制是个硬伤** ：ARM64 最多 6 个执行断点。想 Hook 更多函数就得换 Shadow Page 方案。但 HWBP 可以做状态机跳跃，单断点同时抓入参和返回值:

```python
// 概念：单断点状态机
function hwbpHandler(regs):
    if state == ENTRY:
        captureArgs(regs)            // 抓入参
        moveBreakpoint(returnAddr)   // 断点跳到返回地址
        state = RETURN
    elif state == RETURN:
        captureReturnValue(regs)     // 抓返回值
        moveBreakpoint(origAddr)     // 断点跳回入口
        state = ENTRY
```

全程零额外内存、零执行流干预。CPU 在函数体内全速原生执行，只在"进"和"出"两个瞬间闪现一次。

如果需要替换执行流（不只是监听），就得引入用户态跳板。跳板里有一个"关闸→调原函数→开闸"的流程，避免调原函数时重复触发断点死循环。LR 寄存器的保护是个极易踩坑的点—— `BLR` 指令会覆盖 X30，得找个 callee-saved 寄存器（比如 X20）当"安全屋"暂存原始 LR。

### 指令重定位 (DBI)

把指令搬到新内存（shadow 页 / 跳板）后，所有 PC 相对寻址指令会算错地址。ARM64 指令 32 位塞不下完整 64 位地址，编译器大量使用相对寻址（ `B` / `BL` / `CBZ` / `ADRP` / `LDR literal` ）。搬到新地址后"向前跳 50 步"会跳到完全错误的地方。

重定位引擎需要逐条扫描，分类处理:

| 指令类型 | 处理方式 |
| --- | --- |
| `B` / `BL` (无条件跳转) | 超出射程时展开为间接跳转序列，64 位绝对地址硬编码在指令后 |
| `B.cond` / `CBZ` / `TBZ` (条件跳转) | 射程短必越界，需反转条件 + 远跳序列 |
| `ADRP` + `ADD` (PC 相对数据寻址) | 算出原始绝对地址，改写为 PC-relative 字面量加载 |
| `BLR` 系列 (带 PAC 的分支) | ARMv8.3 PAC 指令需特殊处理，避免污染 LR |
| 普通算术/访存 | 安全，原样拷贝 |

```python
// 概念：远跳展开
// 原始: B target  (4 字节, 射程有限)
// 展开为间接跳转序列:
//   保存暂存寄存器
//   从字面量池加载 64 位绝对地址
//   绝对跳转
//   .quad target    // 地址数据贴在后面
// 4 字节 → 多个指令槽，需要提前预算膨胀空间
```

指令膨胀后需要提前计算 `offset_map` （原始指令索引 → 克隆页偏移），这也是缺页异常路由时"传送地图"的数据来源。

有了 DBI 引擎以后就可以模拟执行指令实现 trace 了, 这里参考了 Frida Gum 的实现, 重构了一下, 感谢 Firda, 感谢开源!!!

### ART Java 方法 Hook

ART 虚拟机里每个 Java 方法对应一个 `ArtMethod` 结构体，其中 `entry_point` 指针指向编译后的机器码入口。传统 LSPlant 方案是替换这个指针指向自定义跳板，但反作弊会扫描所有 `ArtMethod` 的 `entry_point` ，检查指针是否指向合法的 `boot.art` 或 OAT 文件区域。

GhostHook 同样会修改 `entry_point` 指针，但关键区别在于：修改后的字段驻留在 ArtMethod 堆线性区上，任何持有指针的代码都能读到篡改值。框架通过 **Shadow Data Page** 方案隐藏这次篡改：将目标数据页权限阻断，DABT 触发后内核根据发起访问的代码地址判断读取者身份——ART 运行时代码段注册为信任范围，信任读取者看到篡改后的 shadow 页，非信任读取者（反作弊扫描器）看到干净原始页。

同页多条 ArtMethod 被 hook 时共享一个 shadow 页，通过增量 patch 管理。非信任代码对同页的写访问也需要特殊处理——内核在写完成后做差分同步，保证 hook 字段不被覆盖，非 hook 字段保持最新。

ART hook 引擎（mako）是独立 SHARED lib，不静态链入 Daemon SO。Manager 开关启用时把路径推到 KPM 缓存，Daemon 首次调用 `artHook` 时 lazy load 进幽灵内存。mako 的跳板池也走幽灵内存（经适配层注入 `ghostMalloc(RWX)` ），不引入 maps 可见区段。shorty 取值用反射 `Method.getReturnType` + `getParameterTypes` 自拼，不依赖 libart 内部符号。

定位 Java 方法有两条路径：按 className + methodName + sig 走标准反射，或直接拿反射 `Method` 对象——后者跳过符号解析，适合 hook 隐藏 API 等不可经标准路径定位的方法。两条路径殊途同归，最终都落到 mako 的 ArtMethod 入口替换上。

反射类加载的设计思路是预解析：在 daemon 初始化时把反射链句柄全部解析为全局缓存，fork 继承，后续调用时不再触发 JNI 查找，把开销压到最小。

这里 mako hook 是我之前写的 art hook 框架, 选择用外挂加载的方式主要是考虑到两个原因:

-   1.内核态 linker 实现限制较多, 还有奇奇怪怪的问题, 所以换到 daemon 动态加载
-   2.按需加载, 节省内存, 提高效率, 不需要 hook 就可以不加载, 用户态 trace 加载模式也是这样设计的

### 无痕内存读写

跨进程内存读写支持无痕模式。内核侧直接走目标进程页表遍历，不经 `ptrace` 、不经 `/proc/pid/mem` 、不设 `TracerPid` 。

```python
// 概念：跨进程内存读写
function readMem(pid, addr, buf, len):
    mm = getTaskMm(pid)        // 拿目标进程 mm
    walkPageTable(mm, addr)    // 遍历页表取物理页
    copyPageToBuf(buf, ...)   // 读页内容
    mmput(mm)                  // 释放 mm 引用（必须配对！）
    return 0
```

这条路径也用于 Shadow Page 的跨进程读隐藏：GUP（get_user_pages）路径不一定经过目标进程当前 CPU 的 TLB，而是通过页表遍历拿物理页。因此 shadow 页在 GUP 前需要临时把 PTE 指向 original PFN，GUP 后恢复 shadow PFN，且不刷新执行核 TLB。

### VMA Dump

思路是让内核直接遍历目标进程的 VMA 链表，把结果写到调用方 buffer。整个过程不经 `/proc/maps` 、不设 `TracerPid` 、不创建文件。agent 用它构建 per-pid VMA 缓存，配合 ELF 符号表缓存做地址→符号的反查。

### 内核态 Trace (CPU 单步)

这是 Trace 的记录模式：在 debug 异常处理的 Software Step 分支中加入 trace 步进处理，对目标线程设置单步标志进入连续单步。每条用户态指令触发一次 SS 异常，handler 在异常上下文里采集 PC + 全量 GPR + SP + PSTATE + 时间戳，写入专用 trace ring buffer（覆盖最旧 + 丢弃计数），消费者分批取走。

```python
// 概念：CPU 单步 trace
function traceHandleStep(regs, session):
    if not inRange(regs.pc, session):
        return                  // 不在目标范围，跳过
    entry = { pc, x0..x30, sp, pstate, timestamp }
    ringWrite(session.ring, entry)
    if session.steps >= session.maxSteps:
        traceStop(session)      // 达到上限，停止
    else:
        rearmSingleStep()      // 重新 arm 单步
```

关键约束： `MDSCR_EL1.SS` 是 per-CPU 寄存器，目标线程被调度到其他 CPU 时 SS 会丢失。trace 期间必须把目标线程钉在单个 CPU 上（ `set_cpus_allowed_ptr` ），trace 结束后恢复原亲和性。

trace 的连续单步与框架其他单步消费者（HWBP 恢复单步、shadow BRK 单步、shadow read 单步、simulate backup 单步）共享同一个 `MDSCR.SS` 位。trace 在 SS 分发链中具有最高优先级，但不破坏其他机制的 one-shot 单步恢复。

### 符号解析

Daemon 内置符号解析器，读 ELF `.dynsym` 解析符号地址。不走 `dl_iterate_phdr` ——因为幽灵内存里的 SO 不在动态链接器的 link_map 里， `dl_iterate_phdr` 无法确定调用者上下文，返回 NULL。

符号解析用于两条路径：Hook 定位（按 SO 名 + 符号名找地址）和 Trace 符号化（批量解析 PC 对应的 `{soName, sym, offset}` 映射表，随 trace 帧推送到 PC）。

VMA 缓存经内核无痕读取，ELF 符号表缓存从磁盘文件解析一次后复用（优先全量符号表），排序后二分查找。

### 反调试对抗

反作弊检测 HWBP 的手段已经非常成熟，主要通过 `ptrace` 和 `perf_event_open` 施展"连环五步杀"：读寄存器查空位、满载占坑测试、读写一致性校验、越界诱导陷阱（故意设 7 个断点看是否返回 `-ENOSPC` ）、主动触发测试。

应对思路是在内核层实现硬件调试寄存器的"假账本"：拦截 `ptrace` 对调试寄存器的读写请求，反作弊全程跟假账本交互，真实 CPU 物理寄存器不受干扰。假账本需要精确模拟内核行为——包括越界报错、读写一致性等，细节不到位反而暴露。

### 跨 Fork 子进程继承

Zygote 注入的 Daemon + 跳板 + Shadow Page 全部是 VMA-less PTE，而内核的 `copy_page_range` 只遍历 VMA—— **VMA-less 的幽灵内存 / shadow PTE 会被静默丢弃** 。硬件断点寄存器是 per-CPU 的，fork 也不复制。因此子进程要"继承"这套无痕 Hook 能力，必须在 fork 路径上手动克隆。

```python
kernel_clone
  └─ copy_process        ← 子进程 mm/页表已构造（VMA 复制完，但 VMA-less PTE 丢失）
     └─ wake_up_new_task(child)  ← KP hook 在此窗口安装子进程的 ghost PTE
```

四类对象的继承策略各不相同：

-   **Ghost Mem** ：给子进程分配独立物理页 + 私有拷贝 + 逐页独立 PTE。必须私有——直接共享父进程物理页会导致子进程写 daemon 静态数据污染父进程。
-   **Shadow Page** ：标记了 fork 传播的 hook 页克隆继承 shadow PTE；未标记的需暂停。
-   **HWBP 规则** ：按 tgid 重注册子进程所有 TID 的断点。
-   **Instrument / Hook 元数据** ：拷贝页内 hook/instrument 元数据（受 fork 传播标志门控）。

线程 clone（共享 mm）不需要克隆——只有新进程才需要安装 ghost 内存。

### DEX 动态加载

有时模块需要在目标进程注入自定义 Java 类——比如运行时生成的代理类或 Hook 回调类。设计上走内存 DEX 加载路线：dex 字节不落盘，直接在幽灵内存中包装为 ByteBuffer，反射构造 ClassLoader。

```python
// 概念：DEX 内存加载
function loadDex(dexBytes, size, useAppParent):
    ghostBuf = ghostMalloc(size, RW)     // 拷贝到独立幽灵内存
    byteBuffer = newDirectByteBuffer(ghostBuf, size)
    parent = useAppParent ? appClassLoader : null
    classLoader = new InMemoryDexClassLoader(byteBuffer, parent)
    return handle  // 后续 findClassFromDex / unloadDex
```

关键设计点：dex 字节先拷贝到独立的幽灵内存分配，使数据生命周期与用户 SO 的 ELF 映射解耦——直接包装指针会让 buffer 生命周期耦合 SO 映射，拷贝后 dex loader 自主管理，卸载时确定释放。

parent ClassLoader 的选择影响可见范围：挂载 App ClassLoader 可经委托解析 App/framework 类；隔离加载则只有 bootstrap 类 + 自身 dex 类可见。这条路径完全在 daemon 侧实现，与 ART hook 引擎是否启用无关。

### Binder / Linker 拦截器

这两类拦截器都基于 Shadow Hook 实现，不修改 ArtMethod 字段、不引入 GOT trampoline、不在 maps 留可见区段——和框架其他 hook 能力保持一致的隐身性。

**Binder Transact 拦截** ：思路是 shadow hook `transactNative` 的 native 函数地址（经 ArtMethod data 字段取址），在 transact 前后按 interface token 分发 before/after 回调。难点在于 Parcel 操作——读取 interface token 本身依赖 libbinder.so / libutils.so 的 native 函数，纯 JNI 做不到，需要封装一层 Parcel 工具来桥接。

```python
// 概念：Binder 事务拦截
function fakeTransactNative(data, reply, flags):
    token = readInterfaceToken(data)    // 经 Parcel 工具读取
    dispatchBefore(token, data, reply)  // 按 token 匹配 before 回调
    result = origTransact(data, reply, flags)
    result = dispatchAfter(token, result, data, reply)  // 可覆盖返回值
    return result
```

设计上只 hook client 侧——server 侧的 transact 是 C++ 虚函数，shadow hook 无法有效拦截 vtable dispatch。binder call log 作为可选开关，默认关闭，避免热路径开销。

**Linker dlopen 拦截** ：思路类似，shadow hook linker 的 dlopen 内部入口，在 SO 加载前后按 lib name 子串匹配分发回调。

两项能力均懒加载：首次调用才触发 init，per-process 独立，fork 后随 shadow PTE 继承。

### SO 早期生命周期 & JNI Trace

用户模块的 `ghostEntry` 在进程启动早期执行，但目标 SO 可能尚未加载。当 App 后续 `dlopen` 目标 SO 时，`.init` /`.init_array` / `JNI_OnLoad` 在 linker 的 `call_constructors` 中执行——这发生在 `dlopen` 返回之前，用户模块无法在构造函数执行前 hook。

```python
进程启动
  -> daemon 加载用户 SO -> ghostEntry(api)     ← simTraceStart 只能在这里或之后
  -> App 代码执行
    -> System.loadLibrary("libfoo.so")
      -> dlopen -> link -> relocate
      -> call_constructors                       ← .init / .init_array 在此执行
      -> JNI_OnLoad                              ← 在 dlopen 返回前执行
    -> App 后续调用 libfoo.so 的函数             ← simTraceStart 在这里才能 findSymbol
```

解法是在 linker 的构造函数调用路径上下 shadow hook，目标 SO 加载时拦截 `.init` /`.init_array` / `JNI_OnLoad` 。这里有个符号解析的坑：linker 内部符号不在 `.dynsym` 里，且幽灵内存环境 `dl_iterate_phdr` 不可用，只能扩展磁盘 ELF 全量符号表回退。

JNI 动态注册的 trace 同理：JNIEnv 函数表中的 native 方法注册入口按固定偏移就能取到，无需解析 ART 内部符号，在注册时拦截匹配的方法即可 trace 其函数指针。

### 花指令对抗

目标 SO 使用花指令混淆控制流：在真实指令间插入 junk bytes，通过 `br x_reg` （间接分支寄存器）跳转到 SO 内部的真实代码地址。静态反汇编器看到 `br` 时无法解析目标地址，从 junk bytes 起点反汇编会产生错误指令序列。

GTrace 采用动态仿真执行的方案，天然跟随 `br` 跳转——trace 日志中的指令序列已经是去花后的真实执行路径。trace 日志通过标注内部分支目标和 PC 间断区间，使自动化分析工具可直接提取去花后的真实执行路径，无需从 PC 非连续推断。

### 多 Trace 并发

同一 SO 中不同函数的 trace 场景：先 `traceStart(funcA)` 再 `traceStart(funcB)` ，之后 A 和 B 可能在不同时刻被调用。如果 per-trace 配置（writer、traceMode、memReadMode 等）存在全局变量中，第二次调用会覆盖前者的配置，导致 trace 数据写错文件。

解法是将 code handler 的 per-trace 配置从全局变量重构为 per-handle 上下文，通过仿真引擎的 userData 传递给所有 hook 回调，实现多 handle 独立运行。由于仿真执行是同步阻塞的，两个 trace 不可能真正并发，但 shadow hook 是异步触发的——per-handle 化后各自独立，互不干扰。

## 踩坑杂谈

这部分聊几个让人头疼的细节，给各位大佬省点时间。

**`vmap` 多页分配返回同一 PFN**

幽灵内存分配最初用 `alloc_pages` + `vmap` ，结果发现在某些内核版本上 `vmap` 对多页分配不装独立 PTE——所有页返回同一个 PFN，用户态多页映射互相覆盖，加载 ELF 时报 `missing DT_GNU_HASH` 。最后改成 `vmalloc` 区分配， `vmalloc` 有独立 L3 PTE， `vmalloc_to_pfn` 逐页返回独立 PFN。 `alloc_pages` + `vmap` 只留给了单页 fallback 场景。

**跳板池化后的 cache 维护范围**

早期每条跳板独占一整页 ghost 映射，浪费 87.5%~94% 物理页。改成每页 256B 切 16 槽的跳板池后，跳板 VA 不再页对齐。原有"整页 DC CIVAC + IC IVAU"如果以槽基为起点会越界刷到相邻映射。解法是所有 cache flush 范围改为按页对齐（刷整张池页，over-flush 相邻槽，注册非高频路径可接受）。

**异常上下文中的锁**

Hook 回调运行在异常上下文中，不能用 `spin_lock_irqsave` ——它会操作 DAIF 寄存器，破坏 KP 跳板状态。必须用自定义的 LDAXR/STXR 原子锁来保护共享数据。

**`mm_users` 引用泄漏**

临时持有目标进程 `mm` （通过 `get_task_mm` 或等价内核符号）的代码，所有返回路径都必须 `mmput` 。泄漏一个 `mm_users` 引用会阻止进程进入 `exit_mmap` ，导致 ghost 映射无法清理，Android framework 在 SIGKILL 后仍认为旧 ProcessRecord 未死亡，后续启动被拒绝或卡 splash。这个排查起来非常非常非常非常非常非常非常痛苦...

**Fork 克隆必须私有拷贝**

子进程 fork 时，ghost 映射的 PTE 如果直接共享父进程物理页，子进程写 daemon 静态数据会污染父进程。必须给子进程分配独立的 `vmalloc` + `memcpy` + 逐页独立 PTE，不复用父 PTE。execve 场景走 `mmput_async` ， `exit_mmap` hook 不触发，需要单独处理。

## 与传统方案的对比

| 维度  | 传统 Inline Hook | 纯 HWBP | GhostHook 架构 |
| --- | --- | --- | --- |
| 内存篡改 | 改 `.text` 段字节 | 零篡改 | 零篡改 |
| CRC 校验 | 必被检测 | 免疫  | 免疫  |
| Hook 数量 | 无限  | 最多 6 个 | 无限（页级） |
| maps 可见性 | 跳板暴露 | 无额外内存 | 幽灵内存，VMA-less |
| 并发安全 | 改指令瞬间有竞态 | 线程级安全 | 页级异常路由，天然安全 |
| 工程门槛 | 低   | 中   | 高（内核 + ARM64 指令集功底） |
| 反调试对抗 | 无   | 易被 ptrace 检测 | 内核假账本欺骗 |
| ART Hook 入口 | 改 entry_point 指针 | 可用  | 不改指针，对指令地址下拦截 |
| Trace 能力 | 无   | 无   | CPU 单步 + 仿真双模式 |
| 跨进程读写 | ptrace | 无   | 内核页表遍历，不经 ptrace |
| DEX 动态加载 | 不支持 | 不支持 | 内存字节加载 DEX，不落盘 |
| Binder 拦截 | GOT hook | 不支持 | Shadow Hook transactNative，零 ArtMethod 改动 |
| Linker 拦截 | PLT hook | 不支持 | Shadow Hook dlopen_ext，maps 无可见区段 |
| SO 早期 Trace | 不支持 | 不支持 | hook call_constructors + RegisterNatives |
| 花指令对抗 | 不支持 | 不支持 | 仿真跟随 br 跳转 + junk bytes 标注 |
| Fork 继承 | 手动处理 | 不继承 | 四类对象 wake_up_new_task 手动克隆 |
| Daemon 热重载 | 需重启 | 需重启 | 清 hook → 卸载 → 重新注入，不重启 Zygote |
| 性能  | 极快  | 快   | 首次触发有微损，后续原生执行 |

## 模块开发体验

对于写 Hook 模块的人来说，设计目标只有一个：极简。模块开发者只需 include 一个纯声明头文件，不链接任何 SDK 库，拿到一个函数指针表就能用全部能力。

```cpp
// 概念：用户模块入口
#include "ghosthook_sdk.h"

void ghostEntry(const GhostApi *api) {
    // Shadow Hook
    api->shadowHook("libc.so", "open", myOpen, &origOpen);

    // ART Hook / DEX 加载 / Binder 拦截 / trace ...
    // —— 全部通过同一个 api 指针表调用
}
```

所有 DBI/跳板/内存隐藏等底层细节全部由 Daemon + KPM 透明处理。模块编译为独立 `.ghm` 文件，由 Manager App 管理和分发。

## 写在最后

这个项目从设计到实现断断续续搞了挺久，踩的坑远比上面写的多。

内核态开发最大的痛苦不是逻辑复杂，而是调试成本——一个 PTE 属性位拼错了，手机直接黑屏重启，有时候 dmesg 提供的崩溃日志甚至无法定位

但架构本身的设计哲学我觉得是有价值的：不是在用户态和反作弊玩猫鼠游戏，而是利用内核态的绝对权限，从物理层面做到"踏雪无痕"。传统 Hook 是在银行里挖坑埋地雷，GhostHook 是在天花板装红外线——东西没动过，但人一进来就触发了。

项目还在持续迭代，后面有机会再聊聊更多细节。文中如果有描述不准确的地方，欢迎交流指正。

最后配几张图, 祝各位大佬实现顺利!!!

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f76ce0f9768af02e.webp)

[#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#程序开发](https://bbs.kanxue.com/forum-161-1-124.htm) [#源码框架](https://bbs.kanxue.com/forum-161-1-127.htm) [#工具脚本](https://bbs.kanxue.com/forum-161-1-128.htm) [#其他](https://bbs.kanxue.com/forum-161-1-129.htm)
