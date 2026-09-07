---
title: 【看雪】unicorn有效的检测方案，以及魔改的对抗方案(unidbg为什么补好了环境却还是不能用)
source: https://bbs.kanxue.com/thread-292882.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-07T14:49:18+08:00
trace_id: c623feae-a833-4250-a98f-c79418604335
content_hash: 3d5e1b29da61ea6324eeb1bf0910134474988b303723c50f5259403b13339ee0
status: synced
tags:
  - 看雪
  - 模拟执行
  - 模拟器检测
series: null
feed_source: 看雪·逆向工程
ai_summary: unidbg补好指纹仍不能用，根因是Unicorn继承QEMU翻译层，有缓存时序、系统寄存器权限、UNDEF编码、PAC等可探测差异；魔改Unicorn按真机行为注入信号、虚拟化时钟、host-gated启用PAC即可消除。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3d475244-d011-8111-be0e-f64cf4a793ea
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> unidbg补好指纹仍不能用，根因是Unicorn继承QEMU翻译层，有缓存时序、系统寄存器权限、UNDEF编码、PAC等可探测差异；魔改Unicorn按真机行为注入信号、虚拟化时钟、host-gated启用PAC即可消除。
> 
> - **缓存时序检测：** 真机Cache miss与hit的比例通常 >5，而Unicorn无cache模型，比例≈1；App通过随机/链式访存加CNTVCT_EL0计时可识别模拟执行。
> - **信号注入机制：** 魔改Unicorn新增UC_HOOK_SIGNAL回调和`uc_signal_request`，能把SIGILL像真机一样投给guest，配合UC_HOOK_INSN等指令回调按系统寄存器编码、指令类型判真机行为。
> - **EL0特权边界差异：** EL0执行`dc isw`、`ic iallu`、未分配MRS或写SCTLR等操作时，真机一律SIGILL，原版QEMU因guest特权过高会照常执行甚至泄漏地址；在MRS/MSR/SYS/SYSL回调中识别这些编码并注入SIGILL。
> - **UNDEF编码差异：** LDP两个目标寄存器相同（如`ldp x9,x9,[x10]`）实测三台ARMv8/ARMv9真机均SIGILL，需在引擎译码阶段发UNDEF；CASP奇寄存器为架构强制UNDEF，在非法指令回调中校验奇偶后注入SIGILL。
> - **PAC与取舍：** PAC采用host-gated方案，读宿主ID_AA64ISAR1_EL1把PAC特性镜像进VM，修复`pauth_check_trap`避免裸EL1下误判trap，并按FPAC能力让坏认证fault；写回寄存器重叠等真机之间不一致的编码不收录，标量浮点、SIMD、独占监视器经差分测试与真机逐位一致。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/44a4f234edf516cb.webp)

## 什么是unicorn?

## 大家经常用的unidbg就是封装了unicorn引擎，unicorn由qemu fork 裁剪来的，所以大部分qemu上的翻译层检测，在unicorn上同样存在，比如这个load，Store,行为上和真实的ARMv8.2 cpu有差异，他们会通过检测这些差异来判断你是unicorn模拟，而且非常的隐蔽，这就是为啥大多数时候，unidbg补出来的指纹对，长度也对，但就是用不了的其中一部分原因

检测 Unicorn 的差异点与消除方法

本文写 **确定能杀** 的差异:真机行为由架构固定或  
时间源完全受我们掌控,模拟器可 100% 对齐消除。真机自身就因设备/微架构而异的编码(写回寄存器重叠、  
LDP 同目标,都是 CONSTRAINED UNPREDICTABLE)不当检测点处理(末尾附背景)。

结构:先给 **检测方的全部探测片段** (app 怎么探 Unicorn),再讲 **统一的信号注入回调机制**,最后 **逐点消除**  
(改哪里、加什么回调、代码片段)。

* * *

## 一、检测方怎么探 Unicorn(检测片段总览)

app 一侧常用这几类探测。先注册 SIGILL/SIGSEGV handler + `sigsetjmp` 兜住会 fault 的编码,再逐条对比结果。

### 1\. cpu缓存侧信道检测unicorn,通过随机访问来刷新cpu缓存，通过三级缓存失效访问来探这个命中情况

```c
// 最简单的测试例子虽然也可以探的出来处于uniconr执行，但是不够严谨，请参考第二个，
void cache_miss_test() {
    // Unicorn 可能返回 100 vs 120 → 比值=1.2（异常）
    volatile auto *buffer = static_cast<volatile uint8_t *>(malloc(1024 * 1024 * 16)); // 16MB 一般的l3缓存差不多没这么大
    uint64_t start, end;
    asm volatile("mrs %0, cntvct_el0" : "=r"(start):: "memory");
    volatile uint8_t val = buffer[(rand() % (1024 * 1024 * 16))]; // 随机访问，来确保缓存的刷新
    asm volatile("mrs %0, cntvct_el0" : "=r"(end):: "memory");
    LOGD("Cache miss latency: %lu cycles\n", end - start);
    free((void*)buffer);
}

// 严谨版本的，有绑定cpu核心，有多轮循环探测
void cache_miss_test() {
    // 绑定当前的cpu核心，这样执行抖动才不那么大
    int core = sched_getcpu();
    if (core >= 0) { cpu_set_t s; CPU_ZERO(&s); CPU_SET(core, &s); sched_setaffinity(0, sizeof(s), &s); }

    const size_t LINE   = 64;
    const size_t BIG    = 64ull * 1024 * 1024;   // 64MB 大小对于大部分cpu来说应该足够大了，保证缓存失效
    const size_t SMALL  = 16 * 1024;            
    const int    ROUNDS = 300000;                

    uint8_t *big = (uint8_t*)malloc(BIG);
    uint8_t *sml = (uint8_t*)malloc(SMALL);
    if (!big || !sml) { free(big); free(sml); return; }
    auto build_chain = [](uint8_t *base, size_t bytes, size_t line) -> uintptr_t {
        size_t n = bytes / line;
        size_t *perm = (size_t*)malloc(n * sizeof(size_t));
        for (size_t i = 0; i < n; i++) perm[i] = i;
        for (size_t i = n - 1; i > 0; i--) { size_t j = (size_t)rand() % (i + 1);
                                             size_t t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
        for (size_t i = 0; i < n; i++)
            *(uintptr_t*)(base + perm[i]*line) = (uintptr_t)(base + perm[(i+1)%n]*line);
        free(perm);
        return (uintptr_t)base;
    };
    uintptr_t big_head = build_chain(big, BIG,   LINE);
    uintptr_t sml_head = build_chain(sml, SMALL, LINE);

    // 多轮追逐塞进一个 cntvct 窗口,isb 夹紧防乱序越界
    auto chase = [](uintptr_t head, int rounds) -> uint64_t {
        uintptr_t p = head;
        uint64_t t0; asm volatile("isb\n mrs %0, cntvct_el0" : "=r"(t0) :: "memory");
        for (int i = 0; i < rounds; i++) p = *(volatile uintptr_t*)p;
        uint64_t t1; asm volatile("isb\n mrs %0, cntvct_el0" : "=r"(t1) :: "memory");
        asm volatile("" :: "r"(p) : "memory");  
        return t1 - t0;
    };

    (void)chase(sml_head, 1000);                  
    uint64_t hit  = chase(sml_head, ROUNDS);
    uint64_t miss = chase(big_head, ROUNDS);

    double ratio = hit ? (double)miss / (double)hit : 0.0;
    LOGD("cache-timing[core=%d rounds=%d]: hit=%llu ticks, miss=%llu ticks, ratio=%.2f",
         core, ROUNDS, (unsigned long long)hit, (unsigned long long)miss, ratio);
    // 判据:真机 ratio 通常 > 5(常达几十);Unicorn 无 cache 模型 → ratio ≈ 1
    // if (ratio < 3.0) detected_emulator();

    free(big); free(sml);
}
```

### 2\. EL0 特权边界——EL0 执行 EL1-only / 未分配系统指令与寄存器

```c
    dc   isw, x0               // 按 set/way 失效 D-cache,EL1-only
    ic   iallu                 // 失效整个 I-cache,EL1-only
    at   s1e1r, x0             // 地址翻译,EL1-only
    mrs  x0, S3_0_c15_c0_0     // 未分配 / IMPL-DEF 系统寄存器
    mrs  x0, S2_0_c0_c2_0      // Debug 寄存器(op0==2),EL0 禁访
    msr  S3_0_c1_c0_0, x0      // 写 SCTLR_EL1(op0=3,crn=1),EL1-only
    // 真机 EL0: 全部 SIGILL;原版 QEMU: 执行 / 返回值(含泄漏地址)
    dc   civac, x0             // 对照组:清+失效到 PoC,EL0 合法,应放行(不能误伤)
```

### 3\. UNDEFINED 编码不 SIGILL——真机 SIGILL、原版 QEMU 照常执行

```asm
    // (a) LDP 两个目标寄存器相同(Rt==Rt2,同一寄存器被加载两次)
    mov  x10, sp
    .inst 0xA9402549           // ldp x9, x9, [x10]
    // 真机(实测 ARMv8/ARMv9 三台一致): SIGILL;原版 QEMU: 照常执行(后者覆盖前者)

    // (b) CASP 奇数寄存器
    mov  x5, sp
    .inst 0x48217CA3           // casp 变体,Rs 为奇 → 架构 UNDEFINED
    // 真机: SIGILL(所有设备一致);原版 QEMU: 照常模拟不校验奇偶
```

### 4\. PAC 指针认证——签名是否加位 / 坏认证是否 fault

```asm
    mov  x9,  sp
    mov  x10, #0x1234
    pacia x9, x10             // 签名 → 真机(有 PAC)x9 高位写入 PAC;原版 QEMU 原样不变
    pacia x9, x10
    mov  x10, #0x5678         // 换错的 modifier
    autia x9, x10            // 真机(有 FPAC): SIGILL;原版 QEMU: 不 fault
```

差异分两类,处理方式不同:

-   **信号类** (真机 UNDEF→SIGILL:EL0 边界、LDP 同目标、CASP、PAC 坏认证)——最终都投 SIGILL 给 guest;  
    其中 CASP/EL0 走「信号注入回调」,LDP 同目标是可解码指令、在引擎译码阶段发 UNDEF(再经同一信号路径);
-   **值类/时间类** (真机落不同的值:PAC 加位、时序)——在回调里返回正确的值(时序=虚拟时钟),或引擎译码/复位阶段修正(PAC 使能)。

* * *

## 二、处理机制:魔改 unicorn 的信号注入(uc_signal_request + UC_HOOK_SIGNAL)

信号类检测点不逐条改引擎译码,而是用魔改 unicorn 新增的两个 API 把 SIGILL 投给 guest,复刻真机信号行为。

**第一步:增加"信号处理回调"(`UC_HOOK_SIGNAL`)——整套的核心。** `uc_signal_request()` 请求信号后,引擎  
停下当前 TB、在 `uc_emu_start()` 返回前回调它,由你决定把信号投给谁:

```c
// typedef bool (*uc_cb_hooksignal_t)(uc_engine *uc, int signo, void *user_data);
//   返回 true = 已处理,恢复执行;false = 停机,uc_emu_start 正常返回。
static bool on_signal(uc_engine *uc, int signo, void *user_data) {
    if (guest_has_handler(signo)) {                 // 查 guest 自己注册的 sigaction 表
        // 保存现场 → 置 PC=guest handler、X0=signo、LR=返回哨兵;
        // 需要 siginfo 就构造 siginfo_t(si_code 如 ILL_ILLOPC)映射进 guest 内存,X1/X2 指向它。
        redirect_pc_to_guest_handler(uc, signo);
        return true;                                // 进入 guest 的信号处理器
    }
    return false;                                   // guest 没注册 → SIG_DFL 停机(=真机默认行为)
}
uc_hook h_sig;
uc_hook_add(uc, &h_sig, UC_HOOK_SIGNAL, (void*)on_signal, user_data, 1, 0);  // 每次 uc_emu_start 前注册
```

**第二步:注册指令回调抓可疑指令(`UC_HOOK_INSN`)。** 魔改 unicorn 的 `UC_HOOK_INSN` 支持按指令类型注册  
`MRS/MSR/SYS/SYSL`,回调能拿到系统寄存器编码 op0/op1/crn/crm/op2:

```c
uc_hook h_mrs, h_msr, h_sys, h_sysl;
uc_hook_add(uc, &h_mrs,  UC_HOOK_INSN, (void*)on_sysreg, ud, 1, 0, UC_ARM64_INS_MRS);
uc_hook_add(uc, &h_msr,  UC_HOOK_INSN, (void*)on_sysreg, ud, 1, 0, UC_ARM64_INS_MSR);
uc_hook_add(uc, &h_sys,  UC_HOOK_INSN, (void*)on_sys,    ud, 1, 0, UC_ARM64_INS_SYS);
uc_hook_add(uc, &h_sysl, UC_HOOK_INSN, (void*)on_sys,    ud, 1, 0, UC_ARM64_INS_SYSL);
```

**第三步:回调里判真机行为,命中就 `uc_signal_request` 。** `uc_err uc_signal_request(uc_engine *uc, int signo)`  
请求信号——引擎停下、回到 `on_signal`;命中"真机会 SIGILL"就调它,不命中 `return 0` 交回引擎。

信号语义、时序、寄存器上下文都跟真机一致,探测方分不出信号由谁处理。改寄存器/PC 必须走 `uc_reg_write` /  
`uc_signal_request`,回调返回值是"是否已处理"而非结果值。

* * *

## 三、逐点消除

## ① 时序:所有时间源都返回"随指令数递增的虚拟时钟"(值/时间类)

**为什么百分百**:guest 能读到的所有时间源—— `CNTVCT_EL0` / `CNTPCT_EL0` / `CNTFRQ_EL0` 、  
`clock_gettime` / `gettimeofday` —— **全部经过我们的回调**。让它们返回一个"随已执行指令数单调递增"的虚拟时钟,  
两次采样的差值就正比于"做了多少工作"、而不是逐指令翻译的真实墙钟开销,时序检测彻底失效。检测方拿不到任何  
不受控的设备时间源。(前提:虚拟时钟必须 **单调、跨所有源自洽**,否则不同源交叉比对会露馅。)

**怎么处理**—— `CNTVCT/CNTPCT` 走 MRS 回调返回虚拟计数器(`on_sysreg` 里加一个分支):

```c
// 维护一个"已执行指令数"计数器 insn_count(用逐指令回调 UC_HOOK_CODE 递增,或引擎的指令计数),
// 进入本次执行时记基准 base_cntvct = 采样一次真核 cntvct、base_ns = 采样一次真实时间。
uint32_t on_sysreg(uc_engine *uc, uc_arm64_reg reg, const uc_arm64_cp_reg *cp, void *ud) {
    // CNTVCT_EL0: op0=3,op1=3,crn=14,crm=0,op2=2   CNTPCT_EL0: op2=1
    if (cp->op0==3 && cp->op1==3 && cp->crn==14 && cp->crm==0 && (cp->op2==1 || cp->op2==2)) {
        uint64_t vct = base_cntvct + insn_count;     // 单调递增的虚拟计数器
        uc_reg_write(uc, reg, &vct);
        return 1;                                    // 已处理,不读真核
    }
    // CNTFRQ_EL0(op0=3,op1=3,crn=14,crm=0,op2=0): 返回真核频率即可(读真核 CNTFRQ),保持自洽
    ...
}
```

`clock_gettime` / `gettimeofday` 走 **外部调用/SVC 回调** 拦截,用同一个虚拟时钟换算,和 CNTVCT 同源:

```c
// guest BL 到 libc clock_gettime,或 SVC clock_gettime 时,在外部调用/系统调用回调里拦下,
// 不真正调宿主,直接按虚拟时钟填 timespec:
void fake_clock_gettime(struct timespec *ts) {
    uint64_t ns = base_ns + insn_count * NS_PER_INSN;   // 与 CNTVCT 同一 insn_count,保证自洽
    ts->tv_sec  = ns / 1000000000ULL;
    ts->tv_nsec = ns % 1000000000ULL;
}
```

**引用**:*Rethinking anti-emulation techniques* (<https://pwnlab.kr/downloads/qemu.pdf>)反模拟三分类之  
"时序差异(timing)";ARM DDI 0487 的 CNTVCT_EL0/CNTFRQ_EL0 语义。

## ② EL0 特权边界:EL1-only / 未分配系统寄存器与系统指令(信号类)

**为什么百分百**:EL0 访问 EL1-only 系统寄存器/系统指令是 **架构强制** UNDEF(访问权限由架构定义,非  
UNPREDICTABLE),所有真机一致 SIGILL;未分配编码也一律 UNDEF。原版 QEMU 因 guest 以过高特权运行而照常执行,  
未分配 MRS 甚至返回一个内核态地址(信息泄漏)。检测片段见 §一.2。

**怎么处理**——MRS/MSR 回调(`on_sysreg`)按编码判 EL0 是否禁访;`si_code` 由 `on_signal` 投递时构造:

```c
uint32_t on_sysreg(uc_engine *uc, uc_arm64_reg reg, const uc_arm64_cp_reg *cp, void *ud) {
    // ... CNTVCT/CNTPCT 虚拟时钟(见 §三①)、CRn==0 的 ID 组读真核 ... (return 1)

    // EL0 一律禁访的空间 → 真机 SIGILL:
    //   op0==2            = Debug/Trace 寄存器
    //   op0==3 && crn==1  = SCTLR/ACTLR/CPACR 等控制寄存器
    //   op0==3 && crn==15 = IMPLEMENTATION DEFINED
    if (cp->op0 == 2 || (cp->op0 == 3 && (cp->crn == 1 || cp->crn == 15))) {
        uint64_t z = 0; uc_reg_write(uc, reg, &z);   // 先清零目标寄存器,堵未分配 MRS 的信息泄漏
        uc_signal_request(uc, SIGILL);               // → on_signal → guest handler / SIG_DFL
        return 1;
    }
    return 0;   // 其余交回引擎
}
```

SYS/SYSL 回调(`on_sys`)按 op0/op1 判缓存/地址翻译类:

```c
uint32_t on_sys(uc_engine *uc, uc_arm64_reg reg, const uc_arm64_cp_reg *cp, void *ud) {
    if (cp->op0 == 1 && cp->op1 == 0) {      // EL1-only: dc isw/csw/cisw、ic iallu、at *、tlbi *
        uc_signal_request(uc, SIGILL);
        return 1;
    }
    return 0;   // op1==3: dc civac/cvau、ic ivau 等 EL0 按 VA 维护 → 放行
}
```

EL0 合法程序不会碰这些编码,SIGILL 不误伤正常执行。

**遗留**:`msr daifset,#2` (MSR 立即数写 PSTATE.DAIF,不经系统寄存器回调)。默认 `SCTLR_EL1.UMA=0` 时 EL0 写  
DAIF 真机 UNDEF→SIGILL,同类、也可杀,但走 MSR 立即数编码,要在引擎译码或 CODE 回调里另处理,当前未做。

**引用**:INSDET(arxiv **2105.14273**)"行为差异"类;*Rethinking anti-emulation techniques*  
(<https://pwnlab.kr/downloads/qemu.pdf>);ARM DDI 0487 系统寄存器 EL 访问约束。

## ③ UNDEFINED 编码不 SIGILL:LDP 同目标 / CASP 奇寄存器

真机对某些编码 UNDEF→SIGILL,原版 QEMU 照常执行。两处 load/原子指令,一个在引擎译码修、一个在回调修。  
检测片段见 §一.3。

### 3a. LDP 两个目标寄存器相同(Rt==Rt2)——引擎译码发 UNDEF

**为什么百分百**:`ldp x9,x9,[x10]` (同一寄存器被加载两次)架构上是 CONSTRAINED UNPREDICTABLE,但 **实测  
三台真机(Pixel8/ARMv9、Pixel6a/Cortex-X1、Pixel4XL/Cortex-A76)一致 SIGILL**——不像"写回重叠"那样 ARMv8/v9  
分歧,所以作为可靠检测点收录。这是普通可解码 load、不 trap,只能在 **引擎译码阶段** 判定。

**怎么处理**—— `translate-a64.c` 的 `disas_ldst_pair` (load pair 译码):

```c
// is_load 且两个目标寄存器相同 → 发未定义,而不是照常生成"加载两次"的 TCG
if (is_load && !is_vector && rt == rt2) {
    unallocated_encoding(s);   // → EXCP_UDEF → 非法指令路径 → uc_signal_request(SIGILL)(§二)
    return;
}
```

### 3b. CASP 奇数寄存器——回调里校验奇偶(信号类)

**为什么百分百**:`CASP` 要求 Rs、Rt 为偶数寄存器对;`Rs<0>==1 || Rt<0>==1` 时 **架构定义为 UNDEFINED** (强制,  
非 UNPREDICTABLE),所有真机一致 SIGILL。CASP 引擎不支持、走非法指令回调软件模拟,原版模拟时不校验奇偶。

**怎么处理**——中断回调(`UC_HOOK_INTR`,`intno==1` 非法指令分支)模拟 CASP 前先校验奇偶,奇数直接 SIGILL:

```c
// UC_HOOK_INTR 回调,intno==1 = 引擎解不出来的非法/未实现指令
uint32_t rs = (inst >> 16) & 0x1f;      // CASP 的 Rs
uint32_t rt =  inst        & 0x1f;      // CASP 的 Rt
if ((rs & 1) || (rt & 1)) {             // 奇寄存器 = 架构 UNDEFINED
    uc_signal_request(uc, SIGILL);      // 和真机一致
} else {
    /* 合法偶寄存器对:读内存做 compare-and-swap,再用 uc_reg_write 写回结果、PC+=4 */
}
```

**引用**:INSDET(2105.14273)"QEMU UNDEFINED-check bug"类;ARM DDI 0487(CASP 奇寄存器 UNDEFINED、  
LDP 同目标 CONSTRAINED UNPREDICTABLE);LDP 同目标跨设备一致 SIGILL 为本项目多设备实测(见 024)。

## ④ PAC 指针认证(FEAT_PAuth)(host-gated,值类 + 信号类)

**为什么百分百**:PAC 能力随设备而变(旧机没有、新机有、有的带 FPAC),按 **host-gated** 做——读宿主真机的  
PAC 特性镜像进 VM,VM 行为始终等于"这台真机应有的行为",任意宿主都对齐。检测片段见 §一.4;往返  
(`pacia;autia` 同 modifier / `pacia;xpaci`)两边都还原,不能用作检测。

PAC 的应对 **在引擎(QEMU fork)里改**,分四处:

**(a) host-gated 使能**—— `cpu.c` 的 `arm_cpu_reset` (复位阶段,`arm_rebuild_hflags` 之前):

```c
if (isar_feature_aa64_pauth(&cpu->isar)) {
    uint64_t h; __asm__ volatile("mrs %0, S3_0_C0_C6_1" : "=r"(h));   // 宿主 ID_AA64ISAR1_EL1(内核陷入模拟返回真机值)
    uint32_t apa=(h>>4)&0xf, api=(h>>8)&0xf, gpa=(h>>24)&0xf, gpi=(h>>28)&0xf;
    // 把宿主 PAC 特性镜像进模型:宿主无 PAC → 清零 → 数据形 pacia 变 UNDEF → 走非法指令 SIGILL
    cpu->isar.id_aa64isar1 = deposit64(cpu->isar.id_aa64isar1, 4,  4, apa);
    cpu->isar.id_aa64isar1 = deposit64(cpu->isar.id_aa64isar1, 8,  4, api);
    cpu->isar.id_aa64isar1 = deposit64(cpu->isar.id_aa64isar1, 24, 4, gpa);
    cpu->isar.id_aa64isar1 = deposit64(cpu->isar.id_aa64isar1, 28, 4, gpi);
    if (apa || api)   // 宿主有 PAC 才使能(EL0 用户态 PAC 的标准使能位,沿用上游、不动 SCR/HCR)
        env->cp15.sctlr_el[1] |= SCTLR_EnIA | SCTLR_EnIB | SCTLR_EnDA | SCTLR_EnDB;
}
```

**(b) 去掉容器不该有的陷入**—— `pauth_helper.c` 的 `pauth_check_trap` (改按执行档位判):

```c
static void pauth_check_trap(CPUARMState *env, int el, uintptr_t ra) {
    // 单 EL0 用户态容器无真 EL2/EL3。不能用上游"读 HCR_EL2.API 判 trap":裸 EL1 下 arm_hcr_el2_eff
    // 恒返 0 → 每条 pacia 都被误判要陷入 EL2 → 加位/认证在到达前退出、pacia 形同 NOP。
    if (el >= 2)   // 不支持的档位 → 未定义 → 非法指令信号(SIGILL)
        raise_exception_ra(env, EXCP_UDEF, syn_pactrap(), exception_target_el(env), ra);
    // el<=1(EL0/EL1)放行,PAC 正常执行
}
```

**(c) 加位(值类)**:使能后引擎 `pacia` 用自己的密钥真算 PAC 位写回——真机加位、VM 也加位。单签的 **具体位值**  
不必跟真机一致:签名密钥每进程随机、EL0 不可读,探测方无法预测正确值、只能查"有没有变化",而 VM 已加位,  
这条探测就堵死。(使能后引擎既有行为,无需额外改。)

**(d) 坏认证触发信号(FEAT_FPAC)**—— `pauth_helper.c` 的 `pauth_auth` (认证失败分支):

```c
if (unlikely(/* 认证失败 */)) {
    if (ra) {   // ra!=0 = guest 指令(host 侧手动算 PAC 的 API 传 ra=0,只查真伪不 fault)
        ARMCPU *cpu = env_archcpu(env);
        uint32_t apa = FIELD_EX64(cpu->isar.id_aa64isar1, ID_AA64ISAR1, APA);
        uint32_t api = FIELD_EX64(cpu->isar.id_aa64isar1, ID_AA64ISAR1, API);
        if (apa >= 4 || api >= 4)   // 宿主有 FEAT_FPAC → 和真机一样立刻 fault
            raise_exception_ra(env, EXCP_UDEF, syn_pactrap(), exception_target_el(env), ra);
    }
    return /* 改坏指针高位 */;   // 无 FPAC 的宿主:维持"改坏",下次解引用才 SEGV
}
```

这样 **app 无法靠"模拟器认证失败不 fault"绕过、乃至破坏自己的 PAC 校验**。

**真机实测**:Pixel8(ARMv8.3+FPAC)pacia 加位、往返还原、错误 modifier SIGILL、xpaci 剥离,全与真机一致;  
Pixel6a(无 PAC)四探针 native/VM 双 SIGILL 一致。

**调试提示**:纯源码审读会得出"代码正确、应生效"的错误结论——真问题在引擎 `arm_hcr_el2_eff` 于裸 EL1 返 0,  
只有真机逐层插桩才看得到。PAC 依赖运行时多寄存器状态,只能装机打日志确认。

**引用**:ARM DDI 0487 的 FEAT_PAuth / FEAT_FPAC 章节(PAC 计算 QARMA、 `SCTLR.EnIA/IB/DA/DB` 、 `SCR_EL3.API` 、  
`HCR_EL2.API` 、FPAC 异常;ID_AA64ISAR1_EL1 的 APA/API/GPA/GPI,APA/API>=4 即 FPAC);PAC 作探测点为本项目  
差分探针实测,INSDET 的差分方法论适用。

* * *

## 四、不收录:真机之间就不一致的编码

**Load 写回寄存器重叠** (`ldr x9,[x9],#8` 等,Rt==Rn 带写回):CONSTRAINED UNPREDICTABLE,而且 **实测真机就分歧**  
——ARMv8.x(Cortex-X1/A76:Pixel6a/6/4XL)加载值胜,ARMv9(Cortex-X4:Pixel8)UNDEF→SIGILL,四台不一致。真机  
自己都不统一,探测方拿它当"真机 vs 模拟器"判据不可靠,不收录。

(注意区别:LDP 同目标 `ldp x9,x9,[x10]` 虽也是 CONSTRAINED UNPREDICTABLE,但 **实测三台真机一致 SIGILL**,  
所以它收录在 §三.3a;判据是"真机之间是否一致",不是"架构是否强制"。)

真要对齐"写回重叠"这类,唯一干净做法是 **host-gated 行为探针**:启动时在宿主真跑一次看它怎么选、VM 跟着走  
(和 PAC 同思路)。但真机之间本就不统一,它不是可靠检测点,通常不值得做。

## 五、已排除(对真机忠实,不是检测点)

| 族   | 探针  | 结论  |
| --- | --- | --- |
| 标量浮点 | fadd/fsub/fmul/fdiv/fsqrt/fma/估计/转换/取整/min-max × 22 输入 × 8 FPCR 模式,含 FPSR(45760 例) | 0 分歧,softfloat 逐位忠实 IEEE |
| SIMD 归约 | `addv b,v.8b` 、 `faddp s,v.2s` | 逐位一致 |
| 独占监视器 | LDXR/STXR/CLREX(无 ldxr、clrex 后、双 stxr、正常配对) | native/VM 全同 |

硬件特定值(MIDR/CTR_EL0/DCZID 等)在 MRS 回调里读真核寄存器返回,与真机一致。

## 引用

-   **INSDET**—— Automatically Locating ARM Instructions Deviation between Real Devices and CPU Emulators.  
    arxiv **2105.14273** · <https://arxiv.org/abs/2105.14273> · PDF <https://arxiv.org/pdf/2105.14273>
-   **Rethinking anti-emulation techniques for large-scale software deployment** · <https://pwnlab.kr/downloads/qemu.pdf>
-   **Arm Architecture Reference Manual for A-profile** (ARM DDI 0487)——系统寄存器 EL 约束、FEAT_PAuth/FPAC、  
    CNTVCT/CNTFRQ、UNPREDICTABLE ASL。
-   QEMU A-profile 模拟支持矩阵 · <https://www.qemu.org/docs/master/system/arm/emulation.html>

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#软件保护](https://bbs.kanxue.com/forum-4-1-3.htm) [#VM保护](https://bbs.kanxue.com/forum-4-1-4.htm) [#加密算法](https://bbs.kanxue.com/forum-4-1-5.htm) [#问题讨论](https://bbs.kanxue.com/forum-4-1-197.htm)
