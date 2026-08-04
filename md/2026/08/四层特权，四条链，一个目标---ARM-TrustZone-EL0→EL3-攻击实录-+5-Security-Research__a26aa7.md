---
title: 四层特权，四条链，一个目标 - ARM TrustZone EL0→EL3 攻击实录 | +5 Security Research
source: https://overkazaf.github.io/blogs/posts/arm-trustzone-el0-to-el3-attack-chain-anatomy/
source_host: overkazaf.github.io
clip_date: 2026-08-04T11:04:44+08:00
trace_id: 0e74a854-fdc8-44a0-a0bf-47d1a036d6c4
content_hash: a544a970cb6557411907ddd5883bf1385bf28421b00ab740d673d6e3c21612a7
status: synced
tags:
  - ARM TrustZone
  - 漏洞分析
series: null
feed_source: overkazaf·逆向
ai_summary: ARM TrustZone的分层隔离可被内存安全漏洞串联突破：四条攻击链证明，从Normal World EL0至EL3每一层实现缺陷均可被利用，最终窃取DRM密钥或完全控制设备，无需攻破密码算法。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3b275244-d011-811f-a5ea-f63c4fe7b7fa
ioc:
  cves:
    - CVE-2015-6639
    - CVE-2024-20021
    - CVE-2024-20820
    - CVE-2024-20832
    - CVE-2024-20865
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> ARM TrustZone的分层隔离可被内存安全漏洞串联突破：四条攻击链证明，从Normal World EL0至EL3每一层实现缺陷均可被利用，最终窃取DRM密钥或完全控制设备，无需攻破密码算法。
> 
> - **最大攻击面：** Normal World应用通过共享内存向S-EL0的数千个TA发送命令，23%的TA未检查paramTypes（GlobalConfusion），导致任意地址读写。
> - **核心漏洞模式：** 栈溢出、type-confusion、整数溢出在S-EL0/EL1普遍存在；VALIDATOR Secure Driver的栈溢出即可提权至TEE内核。
> - **EL3终极突破：** Quarkslab 2019利用mmap黑名单未保护自身的缺陷，先清零黑名单再映射EL3代码段，修改SMC dispatch table取得最高特权。
> - **Boot Chain替代路径：** Quarkslab 2024通过USB接口，串联Odin认证绕过、LK JPEG堆溢出、SMC越界读及物理内存映射四个CVE，直达Secure World全内存泄露，完全绕开TA。
> - **防御要点：** 所有攻击未破解密码学，均利用实现层的内存安全问题；强制GP API类型检查、使用内存安全语言、形式化验证SMC handler是最有效防护。

> **读完本文，你将获得：**
> 
> -   从硬件寄存器层面理解 ARM EL0→EL3 四层特权的切换机制和攻击面
> -   掌握 TEE 安全研究的核心漏洞模式：共享内存越界、SMC 参数注入、Trustlet 逻辑漏洞
> -   通过四条真实攻击链（Quarkslab / Project Zero / 360 Alpha Lab）学习完整的提权方法论
> -   理解为什么攻破 TrustZone 意味着攻破 Widevine L1 / 支付安全 / 生物识别的信任根基

## 〇、摘要

在 [前文](https://overkazaf.github.io/blogs/posts/quarkslab-drm-whitebox-cryptanalysis-arsenal/) 中，笔者梳理了 Quarkslab 十年来的白盒密码与 DRM 攻防研究。当白盒密码学防护升级到第三代（密钥从不以可观测形式存在）时，攻击者被迫转向更底层—— **攻击 TEE 本身**。本文正是这条路线的技术深潜。

笔者以四条公开的真实攻击链为骨架，逐层拆解 ARM TrustZone 的每一个异常等级（EL0 → S-EL0 → S-EL1 → EL3），在每一层回答三个问题：

1.  **硬件层面发生了什么**？——寄存器、页表、内存保护域的切换机制
2.  **漏洞长什么样**？——该层最常见的漏洞模式，配合真实 CVE 讲解
3.  **攻击者怎么穿透到下一层**？——具体的利用技术和代码级细节

核心案例：

| 攻击链 | 团队  | 年份  | 路线  | 最终效果 |
| --- | --- | --- | --- | --- |
| Samsung TrustZone | Quarkslab | 2019 | S-EL0 → S-EL1 → EL3 | Secure Monitor 代码执行 |
| Boot Chain 4 CVE | Quarkslab | 2024 | USB → Bootloader → EL3 | Secure World 全内存泄露 |
| Wideshears | 360 Alpha Lab | 2021 | S-EL0 → SFS | Widevine L1 DRM 密钥提取 |
| QSEE Widevine | Project Zero | 2017 | S-EL0 → 任意写 | QSEE 代码执行 |

本文不是入门科普——笔者假设读者已经读过 [前文](https://overkazaf.github.io/blogs/posts/quarkslab-drm-whitebox-cryptanalysis-arsenal/) 中关于 Quarkslab 的研究综述，并对逆向工程、ARM 汇编有基本了解。

* * *

## 一、路线总览

在深入细节之前，先用一张图建立全局认知——ARM TrustZone 把 CPU 分为两个世界，由 EL3 Secure Monitor 居中调度，DRM 密钥存放在 Secure World 的 S-EL0 层。攻击者的终极目标是从 Normal World 的 EL0 出发，穿透所有隔离边界，到达 EL3 或直接读取 S-EL0 的内存：

![ARM TrustZone 异常等级与攻击面全景](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/931c1765791c9469.png) *ARM TrustZone 异常等级全景。左侧 Normal World（灰色）和右下 Secure World（绿色）通过 EL3 Secure Monitor（红色）隔离。黄色虚线是 Normal World 应用通过 shared memory 与 TA 通信的逻辑通道——这也是最主要的攻击入口。左下角 Boot Chain（黄色）是绕过 TA 直接到达 EL3 的替代路径。*

四支团队选择了不同的穿透路线。下图并排对比它们的步骤——同一个目标（绿色终点），四种不同的攻击路径：

![四条真实攻击链对比](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/be193aceb4d10806.png) *四条攻击链的步骤对比。Quarkslab 2019 走的是经典三级提权（S-EL0→S-EL1→EL3），2024 走的是 Boot Chain 替代路径（完全不攻击 TA）。360 Alpha Lab 只需要停在 S-EL0 就能读取 DRM 密钥（因为 QTEE 的 SFS 可从 TA 内部访问）。Project Zero 同样停在 S-EL0 层面，但构造了更强的任意写原语。*

| 层级  | 硬件特权 | 运行的代码 | 攻击该层的常见漏洞 | 穿透到下一层的关键 |
| --- | --- | --- | --- | --- |
| **EL0 (Normal)** | 用户态 | Android App | —   | 通过 TEE Client API 发送命令到 TA |
| **S-EL0** | 安全用户态 | Widevine TA / Keymaster | 栈溢出、type-confusion、整数溢出 | 调用 Secure Driver syscall |
| **S-EL1** | 安全内核态 | Kinibi / QSEE / TEEGRIS | Secure Driver 溢出、syscall 校验缺失 | mmap 物理内存、修改 EL3 代码 |
| **EL3** | 最高特权 | ARM Trusted Firmware | SMC handler OOB、物理地址映射 | —（已经是上帝模式） |
| **Boot Chain** | 硬件信任根 | bootrom → BL1 → LK | 签名绕过、解析器溢出 | 禁用后续验证、直达 EL3 |

> 接下来四章分别展开每一层的硬件机制、漏洞模式和利用技术。

* * *

## 二、硬件基础：ARM 异常等级与 TrustZone

### 2.1 异常等级（Exception Levels）

ARM AArch64 处理器有四个异常等级，编号越大特权越高：

```
EL3 ─── Secure Monitor (ATF)         最高特权，始终 Secure
 │
EL2 ─── Hypervisor (可选)             虚拟化管理
 │
EL1 ─── OS Kernel                    内核态
 │
EL0 ─── User Applications            用户态
```

TrustZone 在此基础上引入了 **Secure / Non-Secure 二分法**：EL0 和 EL1 各存在两个实例（Normal World 和 Secure World），由 EL3 的 `SCR_EL3.NS` 位控制当前处于哪个 World。下图以对称视图展示了两个 World 内部的层级结构、各层运行的组件，以及它们之间的通信通道：

![Normal World vs Secure World 异常等级对称视图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e85d4761e0700438.png) *左右两大色块分别是 Secure World（绿色, SCR_EL3.NS=0）和 Normal World（蓝灰色, SCR_EL3.NS=1）。红色箭头标注的 SMC 调用是两个 World 之间唯一的合法通道——它必须经过中间的 EL3 Secure Monitor（红色）进行上下文保存/恢复和 World 切换。黄色虚线表示 shared memory 逻辑通道——Normal World 的 App (EL0-NW) 通过 TEE Client Driver 将命令和参数写入共享内存，S-EL1 TEE OS 再将其分发到目标 TA (S-EL0)。注意 NW 侧有三层（EL0→EL1→EL2），SW 侧只有两层（S-EL0→S-EL1），EL3 跨越两者之上。底部的 TZASC 是硬件级内存隔离控制器——它在总线级别强制 NW 无法访问 SW 内存。*

这张图揭示了几个对攻击者至关重要的结构性事实：

1.  **NW→SW 的唯一入口是 shared memory**：攻击者不能直接调用 TA 的函数，只能通过 shared memory 传递数据。这意味着所有 S-EL0 层的漏洞都必须通过 **精心构造的 shared memory 内容** 触发
2.  **EL3 是两个 World 的桥梁和仲裁者**：控制 EL3 = 控制 World 切换 = 可以同时读写两个 World 的所有内存
3.  **SW 侧没有 EL2**：Secure World 没有 Hypervisor 层，S-EL1 (TEE OS) 直接管理 S-EL0 (TA)——这意味着从 S-EL0 到 S-EL1 只需要一次提权，比 NW 侧少一层
4.  **TZASC 是单向门**：SW→NW 可访问，NW→SW 不可访问。但如果攻击者到达 EL3，就可以重新配置 TZASC，使 NW 也能访问 SW 内存

**关键硬件约束**：

-   Normal World **无法** 访问 Secure World 的内存（由 TZASC 硬件控制器强制执行）
-   Secure World **可以** 访问 Normal World 的内存（单向可见）
-   **EL3 始终运行在 Secure 状态**，不受 NS 位影响

### 2.2 世界切换：SMC 指令

两个 World 之间唯一的合法通道是 **SMC（Secure Monitor Call）** 指令。SMC 触发异常，CPU 陷入 EL3 的 Secure Monitor，由 Monitor 决定是否切换 World。

**SMC 调用约定（SMCCC）**：

```
调用方 (EL1/EL2):
  X0  = Function ID     (标识请求的服务)
  X1  = 参数 1
  X2  = 参数 2
  X3  = 参数 3

EL3 Secure Monitor:
  1. 保存当前 World 的全部寄存器上下文
  2. 根据 Function ID 分发到对应 handler
  3. 如果是 TEE 调用: 设置 SCR_EL3.NS = 0, 恢复 Secure World 上下文
  4. ERET 返回到 S-EL1 (TEE OS)

返回:
  X0  = 返回值
  X1-X3 = 附加返回数据
```

**漏洞意义**：SMC handler 是 EL3 的代码，处理来自 EL1/EL2 的不可信输入。如果 handler 中有 OOB read/write（如 CVE-2024-20820），攻击者可以直接在 EL3 上下文中触发内存损坏。

下面这张时序图展示了一次完整的 SMC 世界切换——从 Android App 发起 ioctl，经 Linux Kernel TEE 驱动触发 SMC，EL3 Secure Monitor 保存/恢复寄存器上下文并切换 World，最终到达 TA 的 command handler。右侧标注了攻击者在每个阶段可以控制的输入——这些就是 TA 漏洞的触发入口：

![SMC 世界切换完整流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3713e9fe6edbb260.png) *完整的 SMC 调用时序。注意 EL3 Secure Monitor 在每次世界切换时保存和恢复的寄存器集合：X0-X30、SP_EL1、ELR_EL1、SPSR_EL1。这意味着两个 World 的执行上下文是完全隔离的——但共享内存（shared memory）中的数据是跨 World 可见的，这正是攻击的数据入口。*

**世界切换的寄存器状态快照**：

```
┌─────────────────────────────────────────────────────────┐
│ SMC 触发时 EL3 Secure Monitor 的寄存器操作               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ① 保存 Normal World 上下文:                              │
│    SAVE X0-X30    → NW_context.gpr[0..30]               │
│    SAVE SP_EL1    → NW_context.sp                       │
│    SAVE ELR_EL1   → NW_context.pc   (返回地址)           │
│    SAVE SPSR_EL1  → NW_context.cpsr (状态寄存器)          │
│                                                         │
│ ② 设置安全状态:                                          │
│    MSR SCR_EL3, #0   ; SCR_EL3.NS = 0 → Secure World   │
│                                                         │
│ ③ 恢复 Secure World 上下文:                              │
│    LOAD X0-X30    ← SW_context.gpr[0..30]               │
│    LOAD SP_EL1    ← SW_context.sp                       │
│    LOAD ELR_EL1   ← SW_context.pc                       │
│    LOAD SPSR_EL1  ← SW_context.cpsr                     │
│                                                         │
│ ④ 返回到 Secure World:                                   │
│    ERET           ; 跳转到 S-EL1 TEE OS 入口              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**ATF 源码级参考** （ `bl31/aarch64/runtime_exceptions.S` ）：

```armasm
; EL3 SMC handler 入口 (ARM Trusted Firmware)
smc_handler64:
    ; 保存 caller 的通用寄存器
    stp x0, x1, [sp, #CTX_GPREGS_OFFSET + CTX_GPREG_X0]
    stp x2, x3, [sp, #CTX_GPREGS_OFFSET + CTX_GPREG_X2]
    ; ... 保存 X4-X30 ...

    ; 保存系统寄存器
    mrs x9, elr_el3         ; 保存返回地址
    mrs x10, spsr_el3       ; 保存状态寄存器
    stp x9, x10, [sp, #CTX_EL3STATE_OFFSET + CTX_ELR_EL3]

    ; 读取 SMC Function ID (在 X0 中)
    mov x0, x0              ; Function ID
    bl  smc_dispatch        ; 分发到对应 handler
                            ; ← CVE-2024-20820: 如果 dispatch 使用
                            ;    X0 作为数组索引且无边界检查
                            ;    则 OOB read/write 在 EL3 上下文执行
```

### 2.3 物理内存布局

在理解具体漏洞之前，需要知道各组件在物理内存中的位置。下图以 Samsung Galaxy S7 (Exynos) 为例，展示了 DRAM 中 Normal World、Secure World 和 EL3 代码段的分布，以及 TZASC 硬件控制器的强制边界：

![Samsung Exynos 物理内存布局](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8a1099bf7ace5274.png) *Galaxy S7/S9 的物理内存分布。0xFE500000 是 EL3 ATF 代码段，0xFE512440 是 Kinibi 的 mmap 黑名单——两者相距仅 0x12440 字节（~74KB），但黑名单没有保护自己所在的地址范围。这就是 Quarkslab 2019 攻击链的核心突破口。*

### 2.4 共享内存：Normal World ↔ Secure World 通信

应用程序（EL0）不能直接发 SMC——它通过 Linux 内核的 TEE 驱动（ `/dev/tee0` 或厂商自定义接口）间接通信。数据通过 **共享内存** 传递：

```
Normal World                          Secure World
┌──────────┐                          ┌──────────┐
│ App (EL0)│                          │ TA (S-EL0)│
│  params  │──→ ioctl ──→ TEE driver ──→ SMC ──→ │  params  │
│  buffer  │    (EL1)     (/dev/tee)    (EL3)    │  buffer  │
└──────────┘                          └──────────┘
     ↑                                      ↑
     └──── 同一块物理内存 (shared memory) ────┘
```

**GlobalPlatform TEE Client API** 定义了四种参数类型：

```c
// 每个参数是一个 union
typedef union {
    struct { void *buffer; uint32_t size; } memref;  // 指针+大小
    struct { uint32_t a; uint32_t b; }      value;   // 两个整数
} TEE_Param;

// paramTypes 编码每个参数的类型 (4 bits × 4 params = 16 bits)
#define TEE_PARAM_TYPE_MEMREF_INPUT   5
#define TEE_PARAM_TYPE_VALUE_INPUT    1
```

**这正是 GlobalConfusion 漏洞的源头**：如果 TA 不检查 `paramTypes` ，攻击者可以把 `value` （两个 32-bit 整数）伪装成 `memref` （指针+大小），从而控制 TA 的内存读写地址。

* * *

## 三、第一层突破：EL0 → S-EL0（进入 Trustlet）

### 3.1 攻击面

攻击者在 Normal World EL0（普通 Android 应用），目标是在 Secure World S-EL0（目标 TA）中获得代码执行。入口是 **TA 的 command handler**—— `TA_InvokeCommandEntryPoint` 函数。

每个 TA 的 command handler 结构类似：

```c
TEE_Result TA_InvokeCommandEntryPoint(
    void *sessionContext,
    uint32_t commandID,
    uint32_t paramTypes,
    TEE_Param params[4])
{
    switch (commandID) {
        case CMD_ENCRYPT:
            // 处理加密请求
            char *in_buf = (char *)params[0].memref.buffer;
            size_t in_sz = params[0].memref.size;
            // ← 如果不检查 paramTypes，这里就是漏洞
            memcpy(internal_buf, in_buf, in_sz);
            break;
        // ...
    }
}
```

### 3.2 常见漏洞模式

| 模式  | 原理  | 真实案例 |
| --- | --- | --- |
| **栈溢出** | `memcpy(stack_buf, user_buf, user_len)` 无边界检查 | Quarkslab 2019: SEM Trustlet（TCI buffer 偏移 0x16808 控制长度） |
| **Type-confusion** | 不检查 `paramTypes` ，把 `value` 当 `memref` 解引用 | GlobalConfusion 2024: 14 个 0-day，23% 的 TA 遗漏检查 |
| **整数溢出** | `int16 size = user_input; malloc(size);` 负值导致 undersized allocation | Samsung `tz_otp` trustlet（BLE 指令 signed 比较绕过） |
| **全局缓冲区覆盖** | `memcpy(global_buf, user_buf, user_len)` 覆盖相邻的函数指针 | Project Zero 2017: Widevine PRDiag（CVE-2015-6639） |

### 3.3 Type-Confusion 漏洞的利用细节

GlobalConfusion 论文中描述的 type-confusion 漏洞值得展开——因为它影响了 14,777 个 TA 中 23% 的实例。下面用具体的 C 代码和内存布局说明攻击者如何利用它：

```c
// 有漏洞的 TA command handler (真实案例简化)
TEE_Result TA_InvokeCommandEntryPoint(
    void *sessCtx, uint32_t cmdId,
    uint32_t paramTypes, TEE_Param params[4])
{
    // ❌ 没有检查 paramTypes!
    // 开发者假设 params[0] 是 memref 类型
    char *in_buf = (char *)params[0].memref.buffer;
    size_t in_sz = params[0].memref.size;
    
    // 用 in_buf 作为指针读取数据
    TEE_MemMove(out_buf, in_buf, in_sz);  // ← 任意地址读取
    return TEE_SUCCESS;
}
```

攻击者从 Normal World 发起调用时，故意将 `paramTypes` 设为 `VALUE_INPUT` 而非 `MEMREF_INPUT` ：

```c
// 攻击者的 Normal World 代码
TEEC_Operation op = {0};
op.paramTypes = TEEC_PARAM_TYPES(
    TEEC_VALUE_INPUT,    // ← 声明为 VALUE 类型
    TEEC_NONE, TEEC_NONE, TEEC_NONE
);
op.params[0].value.a = 0x70100000;  // ← 伪装成指针: Widevine TA 基址
op.params[0].value.b = 4096;        // ← 伪装成 size: 读取 4KB

TEEC_InvokeCommand(&session, CMD_ID, &op, NULL);
// 返回后 out_buf 包含 Widevine TA 内存的 4KB 数据
```

**内存中的 union 重叠**：

```
TEE_Param 在内存中的布局 (32-bit 环境):

  当 paramTypes 声明为 MEMREF 时:
  ┌──────────────────┬──────────────────┐
  │ memref.buffer    │ memref.size      │
  │ (void* 指针)      │ (uint32_t 大小)   │
  │ = 正常的堆地址     │ = 正常的数据长度   │
  └──────────────────┴──────────────────┘

  当攻击者声明为 VALUE 但 TA 当作 MEMREF 解读时:
  ┌──────────────────┬──────────────────┐
  │ value.a          │ value.b          │
  │ → 被当作 buffer   │ → 被当作 size     │
  │ = 0x70100000     │ = 4096           │
  │   (任意地址!)      │   (任意长度!)      │
  └──────────────────┴──────────────────┘

  → TA 执行 TEE_MemMove(out_buf, 0x70100000, 4096)
  → 读取了 Widevine TA 的内存!
```

**防御方法** （GlobalPlatform 规范推荐但未强制）：

```c
// 正确的做法: 在处理参数之前检查类型
uint32_t exp = TEE_PARAM_TYPES(
    TEE_PARAM_TYPE_MEMREF_INPUT,
    TEE_PARAM_TYPE_NONE,
    TEE_PARAM_TYPE_NONE,
    TEE_PARAM_TYPE_NONE
);
if (paramTypes != exp)
    return TEE_ERROR_BAD_PARAMETERS;  // 拒绝类型不匹配的调用
```

### 3.4 案例深剖：Project Zero 的 Widevine TA 利用（2017）

📺 **参考**： [Trust Issues: Exploiting TrustZone TEEs](https://projectzero.google/2017/07/trust-issues-exploiting-trustzone-tees.html) （Gal Beniamini）

**漏洞**：Widevine TA 的 `PRDiag` command handler 中，第三个 DWORD 作为长度参数传给 `memcpy` ，将用户缓冲区内容拷贝到全局缓冲区， **无边界检查**。覆盖范围可达相邻的 session 结构体和函数指针。

**利用步骤**：

**Step 1 — 内存侦察**：TA 地址空间有 ASLR，需要先定位 TA 加载基址。

```
方法: 通过溢出在 TA 内存中写入唯一标记 (magic pattern)
      → 从 Normal World 侧探测 secapp 内存区域
      → 扫描匹配 pattern 的地址
      → 定位 TA 在物理内存中的位置
```

**Step 2 — 构造 Messy Write 原语**：利用 nonce 生成函数的副作用：

```
nonce_generate() → 写入 session cache 的特定偏移
session 结构体内存布局已知 → 控制写入位置
平均 256 次调用写入 1 个目标字节（概率性写入）
```

**Step 3 — 劫持控制流**：

```
用 Messy Write 覆盖 command dispatch table 的函数指针
→ 指向 stack pivot gadget
→ 跳转到 ROP chain
→ 实现 S-EL0 任意代码执行
```

**关键限制**：NX/XN 保护使栈不可执行，必须用 ROP（Return-Oriented Programming）。这在所有现代 TEE 中都是标配。

### 3.4 案例深剖：360 Alpha Lab 的 QTEE Widevine L1（2021）

📺 **演讲视频**： [Wideshears — Investigating and Breaking Widevine on QTEE](https://www.youtube.com/watch?v=0oWFJq6tLe4)

📄 **白皮书**： [Black Hat Asia 2021 Whitepaper](https://i.blackhat.com/asia-21/Thursday-Handouts/as-21-Zhao-Wideshears-Investigating-And-Breaking-Widevine-On-QTEE-wp.pdf)

Qi Zhao 的攻击路线与 Beniamini 类似，但多了一步关键操作——ASLR 绕过：

**Step 1 — 找到 command handler 漏洞**：定位 Widevine TA 的命令处理逻辑。

**Step 2 — 利用第二个漏洞做 info leak**：

```
QTEE 为每个 TA 实现了 ASLR (地址空间随机化)
→ 需要先泄露 TA 的加载基址
→ 找到一个 OOB read 漏洞
→ 读取包含 TA 基址的内核结构体
→ 计算偏移，绕过 ASLR
```

**Step 3 — TA 内代码执行 + 访问 SFS**：

```
控制 PC → 调用 QTEE 的 Secure File System (SFS) 接口
→ SFS 存储了 Widevine 的加密密钥
→ 从 TA 上下文有权限读取自己的 SFS 存储
→ 提取 Widevine L1 DRM 私钥
```

**关键洞察**：360 的攻击 **不需要提权到 S-EL1 或 EL3**——QTEE 的安全模型允许 TA 访问自己的 SFS，而攻击者已经在 TA 内部获得了代码执行。这是一种 **水平移动** （lateral movement）而非垂直提权。

* * *

## 四、第二层突破：S-EL0 → S-EL1（从 Trustlet 到 TEE 内核）

### 4.1 为什么需要这一步

在 QSEE 架构中，攻破一个 TA 就能读取该 TA 的 SFS（如 360 所示）。但在 Kinibi/TEEGRIS 架构中，TA 之间有更强的隔离——攻破一个 TA 不能读取另一个 TA 的内存。要读取 Widevine TA 的密钥，需要先提权到 **S-EL1（TEE 内核/Secure Driver）**，获得对所有 TA 内存的读取权限。

### 4.2 Secure Driver 的角色

S-EL1 层除了 TEE OS 内核外，还运行着 **Secure Driver**——具有更高权限的特殊模块。在 Kinibi 架构中：

```
S-EL0 (Trustlet)
  │  只能调用有限的 syscall
  │  不能映射物理内存
  │  不能访问其他 Trustlet 的内存
  ▼
S-EL1 (Secure Driver)
  │  可以调用更多 syscall
  │  可以映射物理内存（受黑名单限制）
  │  可以访问所有 Trustlet 的地址空间
  ▼
S-EL1 (Kinibi Micro-Kernel)
  │  管理页表、异常处理、进程调度
  │  可以映射任意物理内存（理论上受限）
```

### 4.3 案例深剖：Quarkslab 的 SEM → VALIDATOR 提权（2019）

📺 **演讲视频**： [Breaking Samsung’s ARM TrustZone — Black Hat USA 2019](https://www.youtube.com/watch?v=uXH5LJGRwXI)

**Step 1** （前文已述）：攻破 SEM Trustlet，获得 S-EL0 代码执行。

**Step 2 — 攻击 VALIDATOR Secure Driver**：

VALIDATOR 是 Kinibi 中的一个 Secure Driver，运行在 S-EL1。它暴露了一个 command handler（#15），其中有一个 **几乎与 SEM 一模一样的漏洞**：

```c
// VALIDATOR command handler #15 (伪代码)
void handle_cmd_15(void *mapped_input) {
    void *ptr = *(void **)(mapped_input + OFFSET);  // 从输入中取指针
    size_t len = *(size_t *)(mapped_input + OFFSET + 8);  // 从输入中取长度
    
    // 地址空间转换: Trustlet → Driver
    void *driver_ptr = translate_address(ptr);
    
    // 无边界检查的 memcpy
    memcpy(driver_stack_buf, driver_ptr, len);  // ← 栈溢出
}
```

**攻击者控制的数据**： `mapped_input` 来自 SEM Trustlet 的共享内存，已被攻击者完全控制。因此 `ptr` 和 `len` 都由攻击者决定。

**结果**：在 Secure Driver 的栈上溢出 → 控制 LR → ROP → **S-EL1 代码执行**。

### 4.4 通用漏洞模式

| 模式  | 典型位置 | 利用方式 |
| --- | --- | --- |
| Secure Driver 栈溢出 | command handler 中的 memcpy | 与 Trustlet 溢出类似，但目标在 S-EL1 |
| syscall 参数校验缺失 | `qsee_cipher_set_param` 等 | 攻击者传入 Secure World 地址 → 写入 TA 之外的内存 |
| 物理地址映射缺陷 | `mmap_phys` syscall | 映射 TZASC/TZPC 寄存器 → 完全禁用 TrustZone |

* * *

## 五、第三层突破：S-EL1 → EL3（从 TEE 内核到 Secure Monitor）

### 5.1 为什么 EL3 是终极目标

EL3（Secure Monitor / ARM Trusted Firmware）是 ARM 系统中的 **最高特权等级**：

-   控制 `SCR_EL3.NS` 位——决定当前在哪个 World
-   可以读写 **所有物理内存**——包括 Secure World 和 Normal World
-   管理 TZASC 配置——可以重新定义内存保护域
-   修改异常向量表——可以劫持所有 SMC 调用

获得 EL3 代码执行 = **完全控制设备上的所有安全机制**。

### 5.2 案例深剖：Quarkslab 的 Kinibi mmap → EL3（2019）

这是整个 Quarkslab 2019 攻击链中最精妙的一步。下面这张流程图展示了完整的 5 步利用过程——从映射黑名单自身开始，到最终获得 EL3 代码执行。注意右侧的 note 标注了黑名单绕过的根本原因和 dispatch table 的劫持目标：

![Kinibi mmap 黑名单绕过利用流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a3f4aa1d0956a3ee.png) *5 步利用流程：黄色=初始状态（黑名单存在），红色=攻击步骤（映射→清零→映射 EL3→劫持→触发），绿色=最终效果（Secure Monitor 完全控制）。核心洞察：黑名单地址 0xfe512440 不在自己的 DENY 范围内——这是整个攻击链的根源。*

**问题**：已经获得了 S-EL1 Secure Driver 的代码执行，但 EL3 的代码页在物理内存中是 **只读** 的——Kinibi 内核的 mmap syscall 维护了一个 **黑名单**，禁止映射特定的物理地址范围（包括 EL3 的代码段 `0xfe500000` ）。

**关键发现**：黑名单本身存储在 Kinibi 内核的数据段（ `0xfe512440` ），而这个地址 **没有被自己列入黑名单**。

**利用步骤**：

```
第一步: 从 S-EL1 (Secure Driver) 调用 mmap syscall
        映射地址 0xfe512440 (黑名单存储地址) 为可写
        → 成功，因为这个地址不在黑名单中

第二步: 将黑名单内容全部清零
        memset(mapped_blacklist, 0, blacklist_size);
        → 现在黑名单为空，不再阻止任何物理地址映射

第三步: 再次调用 mmap syscall
        映射地址 0xfe500000 (EL3 代码段) 为可读可写
        → 成功，因为黑名单已被清空

第四步: 修改 EL3 的 SMC handler
        找到 SMC dispatch table
        修改某个 handler 的函数指针
        → 指向攻击者控制的代码

第五步: 从 S-EL0/S-EL1 发起 SMC 调用
        触发被劫持的 handler
        → EL3 代码执行
```

**寄存器级细节**：

```assembly
; EL3 中的 SMC dispatch (ATF bl31)
; X0 = SMC Function ID
; 根据 X0 查表跳转

ldr x16, [x9, x0, lsl #3]   ; 从 dispatch table 加载 handler 地址
blr x16                       ; 跳转到 handler
                               ; ← 攻击者已将 table[target_id] 改为恶意地址
```

**SMC dispatch table 劫持的汇编级细节**：

在 Step 4 中，攻击者需要在已映射的 EL3 内存中找到 SMC handler 的 dispatch table。ATF 的 SMC 分发逻辑通常是一个函数指针数组：

```c
// ATF bl31 SMC dispatch (C 伪代码)
typedef uint64_t (*smc_handler_t)(uint32_t fid, uint64_t x1,
                                   uint64_t x2, uint64_t x3);

// dispatch table 在 EL3 .data 段
smc_handler_t smc_handlers[] = {
    [0] = psci_smc_handler,        // 0xfe501000
    [1] = tsp_smc_handler,         // 0xfe501200
    [2] = plat_smc_handler,        // 0xfe501400
    // ...
    [N] = vendor_smc_handler,      // ← 攻击者改为 shellcode 地址
};
```

对应的汇编代码：

```armasm
; ATF SMC dispatch (AArch64)
smc_dispatch:
    ; X0 = SMC Function ID
    and   x8, x0, #0xFF        ; 取低 8 位作为 index
    adr   x9, smc_handlers     ; dispatch table 基址
    ldr   x16, [x9, x8, lsl #3] ; handler = table[index]
                                 ; ← 如果 table[N] 已被改为 0x41414141
    blr   x16                   ; 跳转到 handler
                                 ; ← 跳转到攻击者控制的地址!
                                 ;    此时 CPU 在 EL3 上下文
                                 ;    X0-X3 包含攻击者的 SMC 参数
```

**攻击者在 EL3 上下文中可以做什么**：

```armasm
; 攻击者的 shellcode (运行在 EL3!)
el3_shellcode:
    ; 1. 读取任意 Secure World 内存
    ldr   x0, =0x70100000      ; Widevine TA 加载地址
    ldr   x1, [x0]             ; 读取 Widevine 的密钥数据
    
    ; 2. 修改 TZASC 配置 (完全禁用内存隔离)
    ldr   x2, =TZASC_BASE
    str   xzr, [x2, #TZASC_REGION_ATTR]  ; 清除保护属性
    
    ; 3. 修改 SCR_EL3 (使 Normal World 能访问 Secure 内存)
    mrs   x3, scr_el3
    orr   x3, x3, #1           ; 设置 NS=1 但保留 Secure 权限
    msr   scr_el3, x3
```

**为什么黑名单设计失败**：这是一个经典的 **self-referential 安全错误**——保护机制（黑名单）没有保护自己。类似于一把锁保护了房间里的所有保险箱，但锁本身放在房间里没有被保护。

### 5.3 通用 S-EL1→EL3 漏洞模式

| 模式  | 原理  | 案例  |
| --- | --- | --- |
| **mmap 黑名单绕过** | 黑名单未保护自身 / 遗漏关键地址 | Quarkslab 2019 (CVE: SVE-2019-16665) |
| **SMC handler OOB** | EL3 的 SMC 处理函数缺少边界检查 | Quarkslab 2024 (CVE-2024-20820) |
| **任意物理地址映射** | SMC handler 接受物理地址参数无验证 | Quarkslab 2024 (CVE-2024-20021) |
| **ATF 函数指针覆盖** | EL3 数据段可写 → 修改 dispatch table | Quarkslab 2019 最终步骤 |

* * *

## 六、替代路径：Boot Chain 攻击（绕过 TA 直达 EL3）

### 6.1 为什么需要替代路径

随着 TEE 防护的加强——TA 加密、anti-rollback、CFI、stack canaries——正面攻击 TA 的成本越来越高。Quarkslab 2024 年的研究展示了另一条路线： **从设备的物理接口（USB）出发，通过 Boot Chain 漏洞直接到达 EL3，完全绕过 TA 层**。

### 6.2 ARM 启动链与信任链

```
bootrom (芯片内 ROM, 不可修改)
   │  验证 BL1 签名
   ▼
BL1 (Primary Boot Loader, EL3)
   │  验证 BL2 签名
   ▼
BL2 (Secondary Boot Loader)
   │  验证 BL31 + BL33 签名
   ▼
BL31 (EL3 Runtime = Secure Monitor / ATF)
   │  常驻 EL3，处理 SMC
   ▼
BL33 (Normal World Boot Loader = U-Boot / Little Kernel)
   │  验证 kernel 签名
   ▼
Linux Kernel (EL1)
```

**信任链的原理**：每一层验证下一层的签名后才加载。如果某一层的验证被绕过，后续所有层都不可信。

### 6.3 案例深剖：Quarkslab 2024 Boot Chain 4 CVE

下面这张流程图展示了 4 个 CVE 的完整串联过程——每个 CVE 解锁下一步所需的能力，最终从 USB 物理接口直达 Secure World 全内存泄露：

![Boot Chain 4 CVE 利用链详解](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/63050c997d135352.png) *黄色=入口（Odin 认证绕过），红色=代码执行（JPEG 堆溢出 + Root），紫色=信息泄露（SM OOB read），深红=最终利用（任意物理内存映射），绿色=结果。每步右侧的 note 标注了该漏洞利用成功的关键前提。*

📄 **博客**： [Attacking the Samsung Galaxy A\* Boot Chain](https://blog.quarkslab.com/attacking-the-samsung-galaxy-a-boot-chain.html)

📄 **SSTIC 论文**： [When Samsung meets MediaTek — the story of a small bug chain](https://www.sstic.org/media/SSTIC2024/SSTIC-actes/when_vendor1_meets_vendor2_the_story_of_a_small_bu/SSTIC2024-Article-when_vendor1_meets_vendor2_the_story_of_a_small_bug_chain-rossi-bellom_neveu.pdf)

**CVE-2024-20865 — Odin 认证绕过**：

```
Samsung 的 Odin 刷机协议维护两种分区表:
  GPT (GUID Partition Table) — Linux 标准
  PIT (Partition Information Table) — Samsung 自定义

发现: GPT 可通过 USB 刷入且无需认证
利用: 修改 GPT → 影响 PIT 对分区的解析
     → 后续分区的签名验证被跳过
     → 可以刷入恶意 up_param 分区（含恶意 JPEG）
```

**CVE-2024-20832 — Little Kernel JPEG 堆溢出**：

```c
// Samsung 自定义 JPEG 解析器 (LK 引导程序内)
void parse_jpeg(uint8_t *data, size_t data_size) {
    struct jpeg_header hdr;
    // 从 data 中解析 JPEG 头
    // 分配固定大小的堆缓冲区
    uint8_t *buf = malloc(FIXED_SIZE);
    
    // ← 没有检查 data_size vs FIXED_SIZE
    memcpy(buf, data, data_size);  // 堆溢出
}
```

LK 的堆实现没有 canary / CFI / ASLR，堆溢出可以直接覆盖相邻的函数指针 → **bootloader 级代码执行**。

**堆内存布局（溢出前 vs 溢出后）**：

```
溢出前 (正常):
┌────────────────────┐ 低地址
│ heap chunk header  │ size=FIXED_SIZE, in_use=1
├────────────────────┤
│ JPEG buffer        │ FIXED_SIZE bytes (正常 JPEG 数据)
│ (buf)              │
├────────────────────┤
│ heap chunk header  │ size=..., in_use=1
├────────────────────┤
│ display_ops struct │ ← 包含函数指针
│  .init = 0x48001000│    init()
│  .draw = 0x48001200│    draw()
│  .done = 0x48001400│    done()
├────────────────────┤
│ ...                │
└────────────────────┘ 高地址

溢出后 (恶意 JPEG, size > FIXED_SIZE):
┌────────────────────┐ 低地址
│ heap chunk header  │
├────────────────────┤
│ JPEG buffer        │ FIXED_SIZE bytes (正常部分)
│ (buf)              │
│ ...................|
│ OVERFLOW DATA      │ ← 超出 FIXED_SIZE 的部分
│ 覆盖 chunk header   │
├────────────────────┤
│ CORRUPTED STRUCT   │ ← 函数指针被覆盖!
│  .init = 0x41414141│    → 攻击者控制
│  .draw = 0x42424242│    → shellcode 地址
│  .done = 0x43434343│
├────────────────────┤
│ ...                │
└────────────────────┘ 高地址

当 LK 调用 display_ops.draw() 时:
  BLR X16  ; X16 = 0x42424242 → 跳转到攻击者代码
```

**CVE-2024-20820 — Secure Monitor OOB read**：

```
拿到 bootloader 代码执行后:
  → 可以向 EL3 发送任意 SMC 调用
  → 某个 SMC handler 的索引参数无边界检查
  → OOB read 泄露 Secure Monitor 的内存布局
  → 获取关键数据结构的地址
```

**CVE-2024-20021 — 任意物理内存映射**：

```
另一个 SMC handler 接受物理地址参数:
  → 将攻击者指定的物理地址映射到 Secure Monitor 虚拟地址空间
  → 无验证 (不检查该地址是否属于 Secure World)
  → 每次最多映射 1MB，限 8 次连续映射 (共 8MB)
  → 足以覆盖 Android Keystore 所在的物理内存区域
  → 读出 Keystore 加密密钥 = Widevine L1 私钥可达
```

### 6.4 Boot Chain vs TA 攻击的选择

| 维度  | TA 攻击路线 | Boot Chain 路线 |
| --- | --- | --- |
| 物理接触 | 不需要（远程 app 即可） | **需要 USB 物理接触** |
| 持久性 | 通常非持久（TA 重载后消失） | **持久化** （bootloader 被 patch） |
| 攻击面 | command handler | bootrom / bootloader 解析器 |
| 防御难度 | TA 可更新、加密、anti-rollback | bootrom 不可修补（硬件缺陷） |
| 适用场景 | 远程 DRM 密钥提取 | 取证、安全审计、实验室分析 |

* * *

## 七、防御矩阵：每一层的缓解措施

| 层级  | 缓解措施 | 有效性 | 被绕过的案例 |
| --- | --- | --- | --- |
| **S-EL0** | Stack canary | 中   | 仅保护部分函数；canary 值可能被泄露 |
| **S-EL0** | ASLR | 中   | 360 通过 info leak 绕过；熵不足 |
| **S-EL0** | GP API type check | 高（如果实施） | GlobalConfusion: 23% 的 TA 未实施 |
| **S-EL0** | TA 加密 | 高   | 需要先 dump 密钥才能分析 TA 代码 |
| **S-EL0→S-EL1** | Anti-rollback | 中   | Kinibi v400 之前无版本计数器 |
| **S-EL1** | mmap 黑名单 | 低   | Quarkslab 2019: 黑名单未保护自身 |
| **S-EL1→EL3** | CFI | 高   | 需要找到非 CFI 保护的代码路径 |
| **EL3** | Secure Boot chain | 高   | Quarkslab 2024: 签名验证绕过 |
| **EL3** | SMC handler 校验 | 中   | CVE-2024-20820: OOB read |
| **硬件** | TZASC 内存隔离 | 高   | 需要 EL3 代码执行才能重配置 |
| **硬件** | Hardware-bound keys | 最高  | 密钥绑定 OTP eFuse，软件无法提取 |

> **ReZone** （USENIX Security 2022, [论文](https://www.usenix.org/system/files/sec22fall_cerdeira.pdf) ）提出了一种更根本的防御——将 TEE OS 拆分为互相隔离的 zone，即使 TEE 内核被攻破也无法跨 zone 访问其他 TA 的内存。估计可缓解 86.84% 的已知 TEE CVE。

* * *

## 八、讨论：攻击链路中的可复用模块

回顾四条攻击链，可以提炼出 **六个可在不同层级间复用的攻击原语**：

| 原语  | 作用  | 出现在哪条链中 | 泛化方向 |
| --- | --- | --- | --- |
| **memcpy 溢出** | 栈/堆控制 → 劫持 PC | Quarkslab 2019 (×2), PZ 2017 | 每一层都有，是最基础的原语 |
| **Type-confusion** | 任意地址读写原语 | GlobalConfusion 2024 | 任何使用 GP API 的 TA |
| **Info leak** | 绕过 ASLR，定位目标地址 | 360 Alpha Lab 2021, Quarkslab 2024 | 每次攻击有 ASLR 的层都需要 |
| **ROP chain** | 在 NX 保护下执行代码序列 | 全部四条链 | 通用技能，需要积累 gadget 库 |
| **mmap primitive** | 映射任意物理地址到攻击者地址空间 | Quarkslab 2019, 2024 | S-EL1 和 EL3 层面 |
| **函数指针覆盖** | 劫持 dispatch table → 控制执行流 | PZ 2017, Quarkslab 2019 | 适用于 C 代码中的 vtable/dispatch pattern |

**关键原则**：每一层的攻击本质上都是同一个循环：

```
找到输入通道 → 构造溢出/越界 → 获得读写原语
→ 泄露地址(info leak) → 绕过保护(ASLR/canary)
→ 劫持控制流(PC) → 在当前层执行代码
→ 调用下一层的接口(syscall/SMC) → 重复
```

区别仅在于： **每一层的「接口」不同** （EL0→S-EL0 用 ioctl，S-EL0→S-EL1 用 TEE syscall，S-EL1→EL3 用 mmap/SMC），但攻击模式是递归自相似的。

用伪代码表达这种递归结构：

```python
def escalate(current_level, target_level):
    """
    通用提权框架——每一层的攻击逻辑是同构的
    """
    if current_level == target_level:
        return  # 已到达目标层

    # 1. 找到当前层到下一层的通信接口
    interface = {
        'EL0→S-EL0':   'ioctl(/dev/tee0, TEE_IOC_INVOKE)',
        'S-EL0→S-EL1': 'mcDriverCtrl(VALIDATOR, cmd_15)',
        'S-EL1→EL3':   'mmap_phys(target_addr, RW)',
        'Boot→EL3':    'SMC #0, Function_ID=target',
    }[f'{current_level}→{next_level}']

    # 2. 在接口的 handler 中找到内存损坏漏洞
    vuln = find_vulnerability(interface)
    # 可能是: stack_overflow / heap_overflow / type_confusion / oob_read

    # 3. 构造利用
    if has_aslr(next_level):
        leak = info_leak(interface)        # 泄露地址，绕过 ASLR
        base_addr = calculate_base(leak)
    
    if has_nx(next_level):
        payload = build_rop_chain(base_addr)  # NX 保护 → 用 ROP
    else:
        payload = shellcode                    # 无 NX → 直接注入代码
    
    # 4. 触发漏洞，获得下一层代码执行
    trigger(interface, payload)
    
    # 5. 递归: 在下一层重复同样的过程
    escalate(next_level, target_level)
```

**四条真实攻击链在这个框架中的映射**：

```python
Quarkslab 2019:
  escalate('EL0', 'S-EL0')   # SEM 栈溢出
  escalate('S-EL0', 'S-EL1') # VALIDATOR 栈溢出
  escalate('S-EL1', 'EL3')   # Kinibi mmap 黑名单绕过

360 Alpha Lab 2021:
  escalate('EL0', 'S-EL0')   # Widevine TA cmd handler
  read_sfs()                  # 不需要继续提权，SFS 可从 TA 内访问

Project Zero 2017:
  escalate('EL0', 'S-EL0')   # PRDiag 全局缓冲区溢出
  arbitrary_rw()              # 不需要继续提权，已获得 TA 内存控制

Quarkslab 2024:
  escalate('USB', 'Boot')    # Odin 认证绕过
  escalate('Boot', 'EL1')    # JPEG 堆溢出 → LK 代码执行
  escalate('EL1', 'EL3')     # SMC OOB + phys mmap
```

* * *

## 九、结论

ARM TrustZone 的安全模型建立在 **分层隔离** 之上——每一层只信任它上面的层。但 Quarkslab、Project Zero 和 360 Alpha Lab 的研究反复证明： **每一层的实现都可能存在缺陷，而这些缺陷可以被串联成跨越整个信任边界的攻击链**。

1.  **S-EL0 层** 是最大的攻击面——数千个 TA 运行在这里，每个都是潜在入口。GlobalConfusion 证明了 23% 的 TA 存在 type-confusion 漏洞
2.  **S-EL1 层** 的 Secure Driver 是关键跳板——Quarkslab 2019 证明了从 Trustlet 到 TEE 内核只需要一个额外的溢出
3.  **EL3 层** 的 Secure Monitor 理论上最安全，但 Quarkslab 两次证明了它可以被攻破——2019 年通过 mmap 黑名单绕过，2024 年通过 SMC handler OOB + 物理地址映射
4.  **Boot Chain** 提供了完全不同的攻击面——不需要攻击任何 TA，从 USB 接口出发直达 EL3

最后留一个观察供读者思考：

> 四条攻击链中， **没有一条需要攻破 AES、RSA 或任何密码学算法本身**。它们全部利用的是 **实现层面的内存安全问题**——溢出、越界、type-confusion、缺少边界检查。这意味着： **密码学是安全的，但承载密码学的代码不是**。
> 
> 从防御者的视角，最有效的投资不是发明更复杂的白盒 AES，而是在 TEE 代码中消除内存安全漏洞——用 Rust 重写 TA、强制 GP API type check、对所有 SMC handler 做形式化验证。
> 
> 正如笔者在 [前文](https://overkazaf.github.io/blogs/posts/quarkslab-drm-whitebox-cryptanalysis-arsenal/) 结尾所说： **维度的选择比力度的加大更重要**。

* * *

*本文引用的所有攻击链均为已公开、已修补的安全研究。全部 CVE 已由厂商修复。笔者记录这些攻击技术是为了帮助防御者理解威胁模型，而非提供可直接使用的利用代码。*
