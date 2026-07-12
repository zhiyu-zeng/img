---
title: 【看雪】Android 内核无痕 Hook 框架设计思路
source: https://bbs.kanxue.com/thread-291980.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-12T23:16:32+08:00
trace_id: a6252bb9-b491-4a45-9eb0-644ca34274c8
content_hash: cafd5b601d11c84f4d05d71f1085f9a4e22e4bb5346fe5cbba66b33b8bcf9790
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 设计一个基于内核的Android无痕Hook框架，利用幽灵内存和Shadow Page技术，实现隐蔽的Hook、Trace和内存操作，以对抗现代反作弊检测手段。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 39b75244-d011-81de-94e1-d818e91af03b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 设计一个基于内核的Android无痕Hook框架，利用幽灵内存和Shadow Page技术，实现隐蔽的Hook、Trace和内存操作，以对抗现代反作弊检测手段。
> 
> - **幽灵内存**：通过直接操作页表分配VMA-less内存，避免在/proc/maps中暴露，使常规内存扫描（如mincore）失效。
> - **Shadow Hook**：利用FEAT_EPAN（PAN3）特性，使同一虚拟地址在执行和读取时映射到不同物理页，隐藏指令修改。
> - **HWBP硬件断点**：直接操作ARM64调试寄存器，绕过perf_event子系统，实现无痕断点，但受数量限制（最多6个）。
> - **ART Hook隐藏**：通过Shadow Data页方案，对非信任代码隐藏ArtMethod的entry_point修改，防止反作弊扫描。
> - **模块化注入**：基于APatch内核Hook能力，实现Zygote注入和用户模块按需加载，开发者无需关心底层细节。

## 写在前面

看完珍惜哥的 [Android内核无痕Hook理解和感悟](https://bbs.kanxue.com/thread-290718.htm) 以后, 受益匪浅!!!

经段一段时间的摸索, 终于完整实现了珍惜哥文章中的无痕 Hook 框架, 这篇文章记录一下整体的设计思路和技术方向，顺便聊点踩坑经历。

整个框架的所有无痕能力都是基于 APatch 模块提供的内核 Hook 能力实现, 感谢 [APatch](https://bbs.kanxue.com/elink@ae1K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6T1L8h3q4^5x3e0t1I4i4K6u0r3b7g2m8S2N6r3y4Z5)!!!

传统 Hook 能力的弊端这里就不提及了, 珍惜哥已经讲的很清楚了, 在现在的高强度对抗中, 传统 Hook 能力已经有些不足了, 所以我们需要一种新的 Hook 能力来对抗现在的各种高强度检测手段.

所以 **无痕 Hook** 诞生了!!!

## 框架能力 & 架构

### Hook & Trace & MemRW &?

既然从头造轮子, 那就一次搞定目前的需求吧, 所以 hook 框架支持以下能力, 下面会附上原理和一些方案

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
    
-   用户态指令模拟 Trace (基于 unicorn 引擎全部走幽灵内存隐藏)
    
-   符号解析 (读 `/proc/self/maps` + ELF `.dynsym`, 不经 `dl_iterate_phdr`, 用于 Trace 反查符号 / Hook 定位)
    
-   反调试对抗 (内核层拦截 `ptrace`, 硬件调试寄存器假账本欺骗)
    
-   PC 管控台 (ghost-console + agent 翻译适配层, 设备侧事件 push + 控制 RPC 多路复用)
    
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

**鉴权** ：KPM 启动时生成 32 字节随机 session key，所有命令必须携带。Manager 端通过签名锚定（校验 APK 签名证书 DER SHA-256）自动获取 key，非 Manager 链路走人工配对码 fallback, 防止被测信道检测

## 核心技术方向

### 模块化注入 & Zygote 注入

整个注入链路完全在内核态完成：KPM 读取 Daemon SO 的 ELF 文件、解析重定位、通过页表操作映射幽灵内存、生成 bootstrap 跳板劫持 Zygote 执行流。Daemon 驻留 Zygote 后，fork 出的子进程按包名匹配配置，按需加载用户模块。

注入编排流程大致是：发现 Zygote PID → 读取 ELF → 内核态 ELF 链接器解析 PT_LOAD 段 + 重定位（含 IFUNC 自修复）→ 幽灵内存映射到 Zygote 用户态地址空间 → 注册 NEEDED 库到符号解析器 → 生成 ARM64 bootstrap 跳板 → `task_work_add` 劫持执行流。

用户模块（`.ghm` 文件）由 Manager App 管理，Daemon 通过自带的 ELF 链接器在幽灵内存中加载，调用 `ghostEntry(GhostApi*)` 入口。模块开发者只需 include 一个纯声明头文件，不链接任何 SDK 库。

这里推荐实现一个 Daemon 动态重加载, 更方便测试 & 更新, 内核 linker 很坑, 尤其是 ifunc

### Shadow Hook (影子页)

这里要感谢 WX 大佬提出的 [Shadow Page 方案](https://bbs.kanxue.com/thread-290304.htm), 下面 Art Hook 的隐藏就是根据这个延伸出的 Shaodw Data Page 方案

这是框架 Inline Hook 的核心方案。核心思路是"同一 VA 在执行和读取之间切换不同物理页"：

-   执行态映射到 shadow PFN，权限 `--x` （执行不可读），hook 字节写在 shadow 页
    
-   数据读取触发 DABT，PTE 切到 original PFN，权限 `r--` ，读到干净原始字节
    
-   读完成后下次执行触发 IABT，PTE 切回 shadow PFN
    

关键前提是设备支持 FEAT_EPAN（PAN3），它允许 EL0 使用 `AP=00 + UXN=0` 的 execute-only 映射。

没有 EPAN 的设备走单页 `---` 仿真降级路径——原页完全阻断，KPM 在 fault handler 里软件仿真执行指令。仿真器按层级覆盖：PC-relative 指令必须仿真（用原始 PC 计算），普通 ALU 和访存指令软件仿真，SIMD/FP 等罕见指令走 backup 页单步兜底。

> \[!WARNING\]

> -   如果设备不支持 EPAN 会很坑, 在 KPM 中做指令模拟确实能跑, 但是太复杂, 建议使用支持 FEAT_EPAN 特性的设备(Pixel 8/9), 实现起来很简单

> -   EPAN 状态不能在 EL0 直接查询。Linux 对 EL0 读 feature ID 寄存器做了陷入+消毒， `ID_AA64MMFR1_EL1.PAN` 在 EL0 读出来永远是 0。必须委托 KPM 在 EL1 读取并回报。

除了 Inline REPLACE，Shadow Page 还支持三种指令插桩模式：

-   **LISTEN** ：命中时发 PRE 事件（寄存器快照），单步原指令，SS 后发 POST 事件。纯监听，不阻断用户回调
    
-   **INTERCEPT** ：原指令执行后进入用户态 callback trampoline，回调可通过栈上 `GhostRegs` 改寄存器和续算 PC。上下文存在调用线程的栈帧上，天然线程安全
    
-   **BEFORE_AFTER** ：before callback 在原指令前执行，结尾用 `BRK #8` 通知内核"回调完成请单步原指令"，after callback 在原指令后执行
    

插桩命中用 `UDF #7` 指令（不读目标 VA 字节，按 `pc → pageAddr/offset → instruments[]` 表判断归属），before trampoline 完成用 `UDF #8` （位于 ghost trampoline 页，页可读，handler 内解码 immediate）。

### 幽灵内存 (Ghost Mem)

这是整个框架隐身能力的根基。

常规 `mmap` 会在进程的 `mm_struct` 链表里注册 VMA，VMA 必然暴露在 `/proc/self/maps` 。即使你 hook `show_map_vma` 把它过滤掉， `mincore` 等盲探手段还是能发现。

幽灵内存的思路是绕过操作系统管理层，直接操作底层页表:

```python

function allocGhostMemory(pid, size):

kernelPage = kernelVmalloc(size)          // 内核态分配物理页

userVA = findUnusedVASpace(pid)           // 在用户态找一个 VMA 空洞

// 直接修改目标进程页表，把 kernelPage 的 PFN 挂到 userVA

// 手工拼装 PTE 属性位：Valid + Page + Normal + User + Shareable + AF + nG

injectPte(pid->mm, userVA, kernelPage.pfn)

flushTLB()                                 // 强制 CPU 认下这张"伪造地契"

return userVA  // CPU 硬件认可，但 OS 管理层查无此 VMA
```

利用"硬件页表 (PTE) 与操作系统管理层 (VMA) 之间的信息差"制造的内存——CPU 的 MMU 查页表发现合法，用户态可以正常访问；但操作系统遍历 VMA 链表查不到这条记录。 `maps` 扫描、 `mincore` 探测全部失效，从源头上逃逸了 Linux 内存管理。

此外还有一个 `mmap_region` 守卫：ghost 映射是 VMA-less PTE，内核 `get_unmapped_area` / `mmap_region` 选址只看 VMA 不看 PTE，目标进程后续普通 mmap 可能落在 ghost PTE 占用的 VA 上导致静默覆盖。pre-hook 检测重叠，命中则返回 `-ENOMEM` （fail-closed）

### HWBP 硬件断点

ARM64 CPU 内置了调试寄存器，你把目标地址写进去，CPU 每次执行时硬件比较器自动比对，命中就触发异常。整个过程不改一个字节的内存。

GhostHook 的 HWBP **不经过 perf_event 子系统** ，而是直接操作 ARM64 调试寄存器（ `DBGBVR` / `DBGBCR` / `DBGWVR` / `DBGWCR` ），Hook `do_debug_exception` 来接管异常。这样做的好处是绕过了 perf_event 路径的所有检测面： `/proc/pid/fd` 看不到 perf_event fd， `/sys/kernel/debug/tracing/events` 追踪不到，seccomp 也拦不到（不经过 syscall）。

**关键认知：HWBP 是线程级的** 。Linux 内核里进程和线程都是 `task_struct` ，HWBP 绑定的是 TID 而非 TGID。只给主线程下断点，子线程走到目标地址根本不会报警。所以注册 HWBP 时必须遍历 `/proc/[pid]/task` 下所有 TID 逐一注册，同时 hook `wake_up_new_task` 给新建线程也套上。

**数量限制是个硬伤** ：ARM64 最多 6 个执行断点。想 Hook 更多函数就得换 Shadow Page 方案。但 HWBP 可以做状态机跳跃，单断点同时抓入参和返回值:

```python

// 伪代码：单断点状态机概念

function hwbpHandler(regs, bp):

if state == WAIT_FOR_ENTRY:

captureArgs(regs.x0..x7)       // 抓入参

lr = stripPAC(regs.x30)       // 取返回地址，剥 PAC

moveBreakpoint(bp, lr)        // 断点跳到 LR

state = WAIT_FOR_RETURN       // 切换状态

elif state == WAIT_FOR_RETURN:

captureReturnValue(regs.x0)  // 抓返回值

moveBreakpoint(bp, origAddr)  // 断点跳回函数入口

state = WAIT_FOR_ENTRY        // 重置
```

全程零额外内存、零执行流干预。CPU 在函数体内全速原生执行，只在"进"和"出"两个瞬间闪现一次。

如果需要替换执行流（不只是监听），就得引入用户态跳板。跳板里有一个"关闸→调原函数→开闸"的流程，避免调原函数时重复触发断点死循环。LR 寄存器的保护是个极易踩坑的点—— `BLR` 指令会覆盖 X30，得找个 callee-saved 寄存器（比如 X20）当"安全屋"暂存原始 LR。

### 指令重定位 (DBI)

把指令搬到新内存（shadow 页 / 跳板）后，所有 PC 相对寻址指令会算错地址。ARM64 指令 32 位塞不下完整 64 位地址，编译器大量使用相对寻址（ `B` / `BL` / `CBZ` / `ADRP` / `LDR literal` ）。搬到新地址后"向前跳 50 步"会跳到完全错误的地方。

重定位引擎需要逐条扫描，分类处理:

| 指令类型 | 处理方式 |

|---------|---------|

| `B` / `BL` (无条件跳转) | 目标超出 ±128MB 范围时展开为间接跳转：征用暂存寄存器 + `LDR` literal + `BR` ，64 位绝对地址硬编码在指令后 |

| `B.cond` / `CBZ` / `TBZ` (条件跳转) | 射程只有 ±1MB，必越界。反转条件跳过远跳序列 + 远跳到目标 |

| `ADRP` + `ADD` (PC 相对数据寻址) | 算出原始绝对地址，改写为 `LDR Rd, [PC, #8]` + 数据字面量 |

| `BLR` 系列 (带 PAC 的分支) | ARMv8.3 PAC 指令，清第 21 位降级 `BLR` → `BR` ，保留目标指针 PAC 验证但不污染 LR |

| 普通算术/访存 | 安全，原样拷贝 |

```python

// 伪代码：B 指令远跳展开概念

// 原始: B target  (4 字节)

// 重写: STR X17, [SP, #-32]!    // 保存暂存寄存器

//       LDR X17, [PC, #16]      // 从字面量池加载 64 位目标地址

//       BR X17                   // 绝对跳转

//       .quad target             // 64 位地址数据贴在后面

// 结果: 4 字节 → 44 字节 (11 槽)，需要预算膨胀空间
```

指令膨胀后需要提前计算 `offset_map` （原始指令索引 → 克隆页偏移），这也是缺页异常路由时"传送地图"的数据来源。

### ART Java 方法 Hook

ART 虚拟机里每个 Java 方法对应一个 `ArtMethod` 结构体，其中 `entry_point` 指针指向编译后的机器码入口。传统 LSPlant 方案是替换这个指针指向自定义跳板，但反作弊会扫描所有 `ArtMethod` 的 `entry_point` ，检查指针是否指向合法的 `boot.art` 或 OAT 文件区域。

GhostHook 同样会修改 `entry_point` 指针（指向 mako 生成的跳板），但关键区别在于：修改后的 `entry_point` 字段驻留在 ArtMethod 堆线性区上，任何持有指针的代码都能通过普通 load 指令读到篡改值。框架通过 **Shadow Data Page** 方案隐藏这次篡改：将目标数据页权限置为 `---` （AP=00，EL0 读写均 fault），DABT 触发后内核取 `pt_regs->pc` （即 `ELR_EL1` ，发起访问的代码地址）判断读取者身份——ART 运行时代码段注册为信任范围，信任读取者看到篡改后的 shadow 页（含 hook 后的 `entryPoint` / `accessFlags` ），非信任读取者（反作弊扫描器）看到干净原始页。单步完成后翻回 `---` 阻断态。

对于 `accessFlags` 篡改，跳板机制本身已足以劫持执行流，不需要额外置 `kAccNative` 等标记，减少检测特征。同页多条 ArtMethod 被 hook 时通过增量 patch 管理，共享一个 shadow 页。非信任代码（如 ART 运行时 JIT 回填、class linking）对同页的写访问经 WABT 路径翻转 original `r-w` + SS，写完成后按 dirtyBitmap 做差分同步：非 hook 字段从 original 同步到 shadow，hook 字段保留 fakeValue 并做冲突检测。

ART hook 引擎（mako）是独立 SHARED lib，不静态链入 Daemon SO。Manager 开关启用时把路径推到 KPM 缓存，Daemon 首次调用 `artHook` 时 lazy load 进幽灵内存。mako 的跳板池也走幽灵内存（经适配层注入 `ghostMalloc(RWX)` ），不引入 maps 可见区段。shorty 取值用反射 `Method.getReturnType` + `getParameterTypes` 自拼，不依赖 libart 内部符号。

这里 mako hook 是我之前写的 art hook 框架, 选择用外挂加载的方式主要是考虑到两个原因:

-   1.kpm 加载时因为内核态 linker 实现限制较多, 所以换到 daemon 动态加载
    
-   2.按需加载, 节省内存, 提高效率, 不需要 hook 就可以不加载, trace 外挂加载模式也是这样设计的
    

### 无痕内存读写

`readMem` / `writeMem` 支持跨进程无痕读写。内核侧直接走目标进程页表遍历，不经 `ptrace` 、不经 `/proc/pid/mem` 、不设 `TracerPid` 。

```python

// 伪代码：跨进程内存读写概念

function readMem(pid, addr, buf, len):

mm = getTaskMm(pid)           // 拿目标进程 mm_struct

// 遍历页表定位 PTE，取物理页

// copy_from_user 等价：内核读物理页内容到 buf

mmput(mm)                     // 释放 mm 引用（必须配对！）

return 0
```

这条路径也用于 Shadow Page 的跨进程读隐藏：GUP（get_user_pages）路径不一定经过目标进程当前 CPU 的 TLB，而是通过页表遍历拿物理页。因此 shadow 页在 GUP 前需要临时把 PTE 指向 original PFN，GUP 后恢复 shadow PFN，且不刷新执行核 TLB。

### VMA Dump

`CMD_DUMP_VMAS` 让内核直接遍历目标进程 `mm_struct` 的 VMA 链表，把结果写到调用方的 buffer。整个过程不经 `/proc/maps` 、不设 `TracerPid` 、不创建文件。agent 用它构建 per-pid VMA 缓存（TTL 2s），配合 ELF symtab 缓存做地址→符号的反查。

### 内核态 Trace (CPU 单步)

这是 Trace 的记录模式：KPM 在 `do_debug_exception` 的 Software Step 分支中新增 trace 步进处理，对目标线程设置 `MDSCR_EL1.SS` + `SPSR.SS` 进入连续单步。每条用户态指令触发一次 SS 异常，handler 在异常上下文里采集 PC + 全量 GPR + SP + PSTATE + 时间戳，写入专用 trace ring buffer（8K 条，覆盖最旧 + 丢弃计数）。daemon / agent 经 `CMD_TRACE_POLL` 分批取走。

```python

// 伪代码：CPU 单步 trace 概念

function traceHandleStep(regs, session):

if current->pid != session.targetPid:

return                     // 不是目标线程，跳过

if regs.pc < session.startAddr or regs.pc > session.endAddr:

return                     // 不在范围内，跳过

entry = { pc, x0..x30, sp, pstate, timestamp }

ringWrite(session.ring, entry) // ghostLock 保护，memcpy 级操作

if session.steps >= session.maxSteps:

traceStop(session)         // 达到步数上限，停止

else:

rearmSS()                  // 重新 arm SPSR.SS，继续单步
```

关键约束： `MDSCR_EL1.SS` 是 per-CPU 寄存器，目标线程被调度到其他 CPU 时 SS 会丢失。trace 期间必须把目标线程钉在单个 CPU 上（ `set_cpus_allowed_ptr` ），trace 结束后恢复原亲和性。

trace 的连续单步与框架其他单步消费者（HWBP 恢复单步、shadow BRK 单步、shadow read 单步、simulate backup 单步）共享同一个 `MDSCR.SS` 位。trace 在 SS 分发链中具有最高优先级，但不破坏其他机制的 one-shot 单步恢复。

### 用户态指令模拟 Trace

这里非常感谢我 Roy 哥提出的真鸡模拟方案!!!

这是 Trace 的模拟模式：用 unicorn 引擎在用户态仿真执行目标函数，VIXL 动态生成仿真跳板，整个仿真环境（代码区、仿真栈）全部走幽灵内存。

GTrace 是独立 SHARED lib `libghost_trace.so` ，唯一导出 `ghostTraceGetApi` 返回函数指针表，与 mako 同模式由 Daemon lazy load 进幽灵内存。它复用 Daemon 已有的符号解析（不经 `dl_iterate_phdr` ，因为幽灵内存里的 SO 不在 link_map 里）和幽灵内存分配能力。

模拟 trace 的优势是对目标进程零影响（离线模拟，可控可复现），适合离线静态分析和指令级调试。记录模式则是真实执行流，含内核调度干扰，适合运行时动态分析。

trace 数据输出为自定义二进制格式（ `TraceRecord` 结构体直写文件），不经 protobuf/leveldb。支持 call annotation 参数值读取（寄存器地址内存→字符串/hexdump 分类）、 `mem_r` / `mem_w` 注解、SIMD 寄存器 dump（密码学分析场景）。

### 符号解析

Daemon 内置符号解析器，读 `/proc/self/maps` + ELF `.dynsym` 解析符号地址。不走 `dl_iterate_phdr` ——因为幽灵内存里的 SO 不在动态链接器的 link_map 里， `dl_iterate_phdr` 无法确定调用者上下文，返回 NULL。

符号解析用于两条路径：Hook 定位（ `hookFunc("libc.so", "open", ...)` 按 SO 名 + 符号名找地址）和 Trace 符号化（agent 的 trace poller 对批内唯一 PC 做去重 + `symtabResolve` 批量解析，构建 `{soName, sym, offset}` 符号映射表随 TRACE 帧推送到 PC）。

VMA 缓存经 `CMD_DUMP_VMAS` 无痕读取（内核遍历目标 mm），ELF symtab 缓存从磁盘文件解析一次后复用（`.symtab` 优先于 `.dynsym` ，更全），按 `st_value` 升序排序后二分查找。

### 反调试对抗

反作弊检测 HWBP 的手段已经非常成熟，主要通过 `ptrace` 和 `perf_event_open` 施展"连环五步杀"：读寄存器查空位、满载占坑测试、读写一致性校验、越界诱导陷阱（故意设 7 个断点看是否返回 `-ENOSPC` ）、主动触发测试。

应对思路是在内核层实现硬件调试寄存器的"假账本"：拦截 `ptrace` 的 `GETREGSET` / `SETREGSET` 请求，反作弊读写调试寄存器时全程跟假账本交互，真实 CPU 物理寄存器不受干扰。假账本需要精确模拟内核行为——包括越界报错 (`-ENOSPC`)、读写一致性等，细节不到位反而暴露。

## 踩坑杂谈

这部分聊几个不太关键但确实让人头疼的细节，给后人省点时间。

**`vmap` 多页分配返回同一 PFN**

幽灵内存分配最初用 `alloc_pages` + `vmap` ，结果发现在某些内核版本上 `vmap` 对多页分配不装独立 PTE——所有页返回同一个 PFN，用户态多页映射互相覆盖，加载 ELF 时报 `missing DT_GNU_HASH` 。最后改成 `vmalloc` 区分配， `vmalloc` 有独立 L3 PTE， `vmalloc_to_pfn` 逐页返回独立 PFN。 `alloc_pages` + `vmap` 只留给了单页 fallback 场景。

**跳板池化后的 cache 维护范围**

早期每条跳板独占一整页 ghost 映射，浪费 87.5%~94% 物理页。改成每页 256B 切 16 槽的跳板池后，跳板 VA 不再页对齐。原有"整页 DC CIVAC + IC IVAU"如果以槽基为起点会越界刷到相邻映射。解法是所有 cache flush 范围改为按页对齐（刷整张池页，over-flush 相邻槽，注册非高频路径可接受）。

**异常上下文中的锁**

Hook 回调运行在异常上下文中，不能用 `spin_lock_irqsave` ——它会操作 DAIF 寄存器，破坏 KP 跳板状态。必须用自定义的 LDAXR/STXR 原子锁来保护共享数据。

**`mm_users` 引用泄漏**

临时持有目标进程 `mm` （通过 `get_task_mm` 或等价内核符号）的代码，所有返回路径都必须 `mmput` 。泄漏一个 `mm_users` 引用会阻止进程进入 `exit_mmap` ，导致 ghost 映射无法清理，Android framework 在 SIGKILL 后仍认为旧 ProcessRecord 未死亡，后续启动被拒绝或卡 splash。这个排查起来非常非常非常痛苦。

**Fork 克隆必须私有拷贝**

子进程 fork 时，ghost 映射的 PTE 如果直接共享父进程物理页，子进程写 daemon 静态数据会污染父进程。必须给子进程分配独立的 `vmalloc` + `memcpy` + 逐页独立 PTE，不复用父 PTE。execve 场景走 `mmput_async` ， `exit_mmap` hook 不触发，需要单独处理。

## 与传统方案的对比

| 维度 | 传统 Inline Hook | 纯 HWBP | GhostHook 架构 |

|------|-----------------|---------|---------------|

| 内存篡改 | 改 `.text` 段字节 | 零篡改 | 零篡改 |

| CRC 校验 | 必被检测 | 免疫 | 免疫 |

| Hook 数量 | 无限 | 最多 6 个 | 无限（页级） |

| maps 可见性 | 跳板暴露 | 无额外内存 | 幽灵内存，VMA-less |

| 并发安全 | 改指令瞬间有竞态 | 线程级安全 | 页级异常路由，天然安全 |

| 工程门槛 | 低 | 中 | 高（内核 + ARM64 指令集功底） |

| 反调试对抗 | 无 | 易被 ptrace 检测 | 内核假账本欺骗 |

| ART Hook 入口 | 改 entry_point 指针 | 可用 | 不改指针，对指令地址下拦截 |

| Trace 能力 | 无 | 无 | CPU 单步 + 仿真双模式 |

| 跨进程读写 | ptrace | 无 | 内核页表遍历，不经 ptrace |

| 性能 | 极快 | 快 | 首次触发有微损，后续原生执行 |

## 模块开发体验

对于写 Hook 模块的人来说，GhostHook 的使用体验是这样的:

```python

// 伪代码：用户模块示例概念

// 只需 include 一个纯声明头文件，不链接任何 SDK 库

#include "ghosthook_sdk.h"



void ghostEntry(const GhostApi *api) {

// Hook native 函数

api->hookFunc("libc.so", "open", myOpen, &origOpen);



// 监听（不替换执行流，只抓参数）

api->listen("libart.so", "Invoke", onEntry, onReturn);



// 分配隐身内存

void *buf = api->ghostMalloc(4096, GHOST_PERM_RW);



// Hook ART Java 方法

api->artHook("java/lang/String", "length", "()I", false, myLength, &origLength);



// 跨进程读内存

api->readMem(targetPid, addr, buf, 4096);



// CPU 单步 trace

api->traceStart(targetFunc, 10000);

}
```

用户模块编译为独立 `.ghm` 文件（普通 SHARED lib），由 Manager App 管理、Daemon 加载。模块开发者完全不需要关心 DBI/跳板/内存隐藏等底层细节，全部由 Daemon + KPM 透明处理。

## 写在最后

这个项目从设计到实现断断续续搞了挺久，踩的坑远比上面写的多。

内核态开发最大的痛苦不是逻辑复杂，而是调试成本——一个 PTE 属性位拼错了，手机直接黑屏重启，有时候 dmesg 提供的崩溃日志甚至无法定位, 还为 APatch 的 Hook 跳板做了兼容。

但架构本身的设计哲学我觉得是有价值的：不是在用户态和反作弊玩猫鼠游戏，而是利用内核态的绝对权限，从物理层面做到"踏雪无痕"。传统 Hook 是在银行里挖坑埋地雷，GhostHook 是在天花板装红外线——东西没动过，但人一进来就触发了。

项目还在持续迭代，后面有机会再聊聊更多细节。文中如果有描述不准确的地方，欢迎交流指正。

配几张图, 祝各位大佬开发顺利

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/352be87f2d80f501.webp)

  

[#HOOK注入](https://bbs.kanxue.com/forum-161-1-125.htm) [#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm)
