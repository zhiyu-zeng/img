---
title: "LCG Jitter x64 Assembly: Randomized nanosleep for C2 Beaconing Evasion & SOC Behavioral Detection Bypass | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/lcg-jitter/
source_host: netacoding.com
clip_date: 2026-10-01T10:18:32+08:00
trace_id: ed819dab-8083-4270-a8a9-fbf2642db682
content_hash: da2cf8e16b847e8d6e75b7f16ae2b4c0f677d5a4d81d3e4095bea5d22bea9b63
status: synced
tags:
  - Linux安全
  - 恶意样本
series: null
feed_source: Netacoding·协议/逆向
ai_summary: 纯 x64 汇编以 rdtsc 取熵、LCG 打散，生成 100ms–1000ms 随机睡眠，靠 nanosleep 系统调用实现定时抖动，规避固定间隔的行为检测。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-8134-84e3-ecbc8dcd09aa
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 纯 x64 汇编以 rdtsc 取熵、LCG 打散，生成 100ms–1000ms 随机睡眠，靠 nanosleep 系统调用实现定时抖动，规避固定间隔的行为检测。
> 
> - **寄存器保护：** 入口压栈保存全部通用寄存器、出口逆序恢复；System V AMD64 ABI 本只要求 rbx、rbp、r12–r15 由被调者保存，此处全保存以不假设调用点。
> - **熵源与打散：** rdtsc 读自启动以来的 64 位周期计数，低 32 位入 EAX；因原始低位在某些微架构上带可识别模式，再用 `imul eax,eax,1664525` + `add eax,1013904223`（Numerical Recipes 的 X=(aX+c) mod 2³²，32 位溢出天然取模）打散。
> - **区间计算：** 清零 EDX 后 `div ecx`（除数 900000000）取余得 [0,900M)，再加 100000000 落入 [100ms,1000ms)，理论均匀分布，均值约 550ms、标准差约 260ms，LCG 周期 2³² 约 42.9 亿次。
> - **睡眠实现：** 栈上直接构造 timespec（tv_sec=0、tv_nsec=随机值），`rax=35` 即 sys_nanosleep，rdi 指向结构体、rsi=NULL；`sub rsp,32` 仅为保持 16 字节对齐的保守预留（实际只需 16 字节）。
> - **局限：** 非密码学安全，敏感场景应换 `getrandom(2)`；若要可复现则固定初始种子；本实现无共享状态故多线程无需额外保护。

## Why Jitter?

When a periodic task fires at a fixed interval — a retry loop, a polling mechanism, a heartbeat — that regularity often becomes its own problem. Synchronized bursts from multiple clients (the thundering herd), queue pile-ups, and statistical profiling are all side effects of fixed delays.

The solution: added **jitter**. If the wait time varies on every call, the pattern breaks, load flattens, and predictability disappears.

In this post we walk through a pure x64 Assembly function that applies a **Linear Congruential Generator (LCG)** scramble over an **rdtsc** entropy seed, then sleeps for a random duration in the `[100ms, 1000ms)` range.

* * *

## 🔩 The Full Function: \_lcg_jitter

```nasm
_lcg_jitter:
    push rax
    push rbx
    push rcx
    push rdx
    push rsi
    push rdi
    push rbp
    push r8
    push r9
    push r10
    push r11
    push r12
    push r13
    push r14
    push r15

    rdtsc                           ; EAX = TSC low 32 bits
    imul eax, eax, 1664525          ; LCG scramble (increases entropy)
    add  eax, 1013904223
    xor  edx, edx                   ; zero EDX for div (EDX:EAX dividend)
    mov  ecx, 900000000             ; mod 900M  → [0, 900M)
    div  ecx
    add  edx, 100000000             ; shift → [100ms, 1000ms)

    sub  rsp, 32                    ; reserve stack space (aligned)
    mov  qword [rsp],    0          ; tv_sec  = 0
    mov  qword [rsp+8],  rdx        ; tv_nsec = computed value
    mov  rax, 35                    ; sys_nanosleep
    mov  rdi, rsp                   ; req = &timespec
    xor  rsi, rsi                   ; rem = NULL
    syscall
    add  rsp, 32                    ; restore stack

    pop r15
    pop r14
    pop r13
    pop r12
    pop r11
    pop r10
    pop r9
    pop r8
    pop rbp
    pop rdi
    pop rsi
    pop rdx
    pop rcx
    pop rbx
    pop rax
    ret
```

* * *

## 📦 Part 1: Register Preservation

```nasm
push rax
push rbx
; ... all general-purpose registers
pop rax
ret
```

When this function is called, the caller’s register state must remain untouched. So every general-purpose register is pushed onto the stack at the top and restored in reverse order at the bottom.

> **Note:** Under the System V AMD64 ABI, `rbx`, `rbp`, and `r12–r15` are callee-saved; the rest are caller-saved. Both sets are saved here — maximum safety, no assumptions about the call site.

* * *

## ⏱️ Part 2: Entropy Source — rdtsc

```nasm
rdtsc   ; EDX:EAX = Time Stamp Counter
```

The `rdtsc` (Read Time-Stamp Counter) instruction reads the processor’s 64-bit cycle counter accumulated since boot. The low 32 bits land in `EAX`, the high 32 in `EDX`.

This value changes rapidly — a reliable snapshot of hardware state. However it isn’t used raw: lower bits can carry detectable patterns on some microarchitectures. The LCG step that follows solves this.

* * *

## 🎲 Part 3: LCG Scramble

```nasm
imul eax, eax, 1664525
add  eax, 1013904223
```

These two lines implement the classic LCG formula from *Numerical Recipes*:

```
X_{n+1} = (a × X_n + c) mod 2^32
```

| Parameter | Value | Source |
| --- | --- | --- |
| `a` | 1664525 | Numerical Recipes |
| `c` | 1013904223 | Numerical Recipes |
| `m` | 2^32 | Implicit (32-bit overflow) |

`imul eax, eax, 1664525` multiplies EAX by the LCG multiplier — overflow is intentional, giving us modular arithmetic for free.  
`add eax, 1013904223` adds the increment `c`.

The result: the raw TSC value is transformed into a pseudo-random number with a statistically flatter distribution.

* * *

## ➗ Part 4: Range Calculation

```nasm
xor  edx, edx        ; clear EDX (high half of dividend)
mov  ecx, 900000000  ; divisor = 900M nanoseconds
div  ecx
add  edx, 100000000  ; shift to [100M, 1000M) ns
```

`div ecx` divides the 64-bit value `EDX:EAX` by `ECX`:

-   `EAX` ← quotient (discarded)
-   `EDX` ← remainder → falls in `[0, 900_000_000)`

Adding `100_000_000` shifts the window:

```
[0, 900_000_000) + 100_000_000 = [100_000_000, 1_000_000_000)
```

In wall-clock terms: a uniformly distributed random sleep between **100 ms and 1000 ms**.

* * *

## 😴 Part 5: Sleeping with sys_nanosleep

```nasm
sub  rsp, 32
mov  qword [rsp],   0    ; tv_sec  = 0
mov  qword [rsp+8], rdx  ; tv_nsec = computed value
mov  rax, 35             ; syscall number: nanosleep
mov  rdi, rsp            ; req pointer
xor  rsi, rsi            ; rem = NULL
syscall
add  rsp, 32
```

`nanosleep(2)` expects a pointer to `struct timespec`:

```c
struct timespec {
    time_t tv_sec;   // seconds
    long   tv_nsec;  // nanoseconds [0, 999_999_999]
};
```

The struct is built directly on the stack:

-   `[rsp]` → `tv_sec = 0` (sub-second sleep only)
-   `[rsp+8]` → `tv_nsec = EDX` (our computed random value)

The `sub rsp, 32` reservation keeps the stack 16-byte aligned and provides comfortable headroom. Only 16 bytes are strictly necessary for one `timespec`, so 32 bytes is a conservative over-allocation — benign and safe.

* * *

## 📊 Distribution Analysis

The LCG + modular arithmetic combination produces a theoretically **uniform distribution** across the target window:

```
Range:              [100ms, 1000ms)
Expected mean:      ~550ms
Standard deviation: ~260ms
LCG period:         2^32 ≈ 4.29 billion calls before cycle repeats
```

For most use cases the period is far longer than needed, so cycle repetition is not a practical concern.

* * *

## ⚠️ Limitations and Alternatives

| Concern | This Implementation | Alternative |
| --- | --- | --- |
| Cryptographic security | ❌ Not suitable | `getrandom(2)` syscall |
| Multi-threaded safety | ⚠️ No shared state to protect here | Thread-local seed for stateful LCG |
| Reproducibility | ✓ Fix the seed | Pass a constant initial value |
| Precision | ✓ Nanosecond resolution | Sufficient for all timing jitter use cases |

For non-cryptographic, non-security-sensitive jitter this implementation hits all the marks cleanly.

* * *

## Conclusion

This small function elegantly combines three ideas:

1.  **Hardware entropy**— `rdtsc` gives a unique starting point on every call
2.  **LCG scrambling**— a two-instruction transform that flattens the distribution
3.  **Direct syscall**— kernel scheduling infrastructure accessed without any library overhead

The outcome: externally irregular, internally deterministic — a lightweight timing jitter engine that lives entirely within the CPU and the kernel.

Github: [https://github.com/JM00NJ/Sectionless-Craft/tree/main/Jitter](https://github.com/JM00NJ/Sectionless-Craft/tree/main/Jitter)

Stay Coded!

**MITRE ATT&CK:** [T1027](https://attack.mitre.org/techniques/T1027/)

## Related

-   [Defying Python: Building a Bare-Metal HTTP Server in x86_64 Assembly](https://netacoding.com/posts/assembly-httpserver/)
-   [VESQER: A DPCM+RLE Hybrid Compressor in Pure x64 Assembly](https://netacoding.com/posts/compressdpcm-rle/)
-   [Building a Low-Level ICMP Sniffer in x64 Assembly (Raw Sockets)](https://netacoding.com/posts/icmp_sniffer/)
