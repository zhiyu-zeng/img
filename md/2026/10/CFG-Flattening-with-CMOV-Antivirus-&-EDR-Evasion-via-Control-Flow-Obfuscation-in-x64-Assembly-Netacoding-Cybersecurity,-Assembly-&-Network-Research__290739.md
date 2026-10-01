---
title: "CFG Flattening with CMOV: Antivirus & EDR Evasion via Control Flow Obfuscation in x64 Assembly | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/polymorphic/
source_host: netacoding.com
clip_date: 2026-10-01T10:17:59+08:00
trace_id: 7bb997f7-2707-4669-8dc2-ae02cb6d16be
content_hash: f1a89531468e7d952d30ddfb8b1817a7f1bd53f36a1065b674a2b65e3ef80ede
status: synced
tags:
  - 反调试
  - 恶意样本
series: null
feed_source: Netacoding·协议/逆向
ai_summary: 用 CMOV 条件移动替代 JMP/JE 分支来执行 syscall，可让 CFG 退化成直线块，在 VirusTotal 上实现 0/60 静态检出。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3ec75244-d011-81f3-a347-fb27fb4b0ddc
ioc:
  cves: []
  cwes: []
  hashes:
    - 88ee03828550c5411cbedce446e98871ae984eb81dc32f71502e62d5f6de9a3f
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 用 CMOV 条件移动替代 JMP/JE 分支来执行 syscall，可让 CFG 退化成直线块，在 VirusTotal 上实现 0/60 静态检出。
> 
> - **核心原理：** CMOVcc 仅在标志位满足时搬移数据，反编译器把它当作普通 MOV，不生成 CFG 节点，AI 扫描器提取不到循环与 if-else 结构特征。
> - **密钥四层演化：** 明文 → 算术/异或常量 → 内存 XOR → 运行时派生。前三层 Ghidra 可用常量折叠静态还原；第四层从 ASLR 随机化的 libc 指针（如 printf GOT）取低位字节作 XOR key，256 种爆破结果无法证明哪个是真实意图。
> - **实测数据：** 样本 SHA-256 以 88ee0382 开头，60+ 静态引擎 0 检出（含 CrowdStrike Falcon、SentinelOne ML）；CAPE Linux 沙箱 0 检测，Zenbox 仅 4 条信息级 MITRE 签名，且源于沙箱自身 rsyslog 轮转噪声。
> - **Code Insights 缺口：** VirusTotal 自身静态引擎已识别出“运行时 XOR 计算 syscall 号”模式，却无任何厂商将其转成检测签名。
> - **局限：** 仅属静态绕过，不绕 Ring 0 动态追踪（eBPF/Falco/ETW）；结尾任何 `jle`/`jmp` 都会重新引入分支，需全无分支或 ROP 间接跳转。

## Research Context

Next-Generation Antiviruses (NGAV), Extended Detection and Response (XDR) systems, and “AI-powered” heuristic scanners heavily market their ability to catch unknown threats. Their primary defense mechanism relies on statically analyzing the logic of a binary and generating a **Control Flow Graph (CFG)**.

When you drop a binary into reverse-engineering tools like Ghidra or IDA Pro, you are immediately greeted by a beautifully mapped graph of blocks connected by arrows. Those blocks are the “DNA maps” that AI scanners use to classify malware.

As a Red Team engineer, if you allow the system to draw that map, you will be caught. But what if we simply refuse to let them draw it? While developing the Phantom-Evasion-Loader, I needed a way to execute critical syscalls without triggering these heuristic alarms. In this article, we will explore how to completely blind static analysis engines and AI scanners by discarding traditional branching instructions (`JMP`, `JE`) in favor of the `CMOV` (Conditional Move) architecture.

### The Vulnerability of CFG Analysis

Static analysis engines (Ghidra, IDA) and AI-based scanners read code by looking for branching instructions: `JMP`, `CALL`, `JE`, `JNE`, etc. Every branching instruction creates a new “node” on the Control Flow Graph.

Machine Learning (ML) models analyze the arrangement of these nodes to make predictions. They flag patterns like: *“This loop looks like a payload injection cycle,”* or *“This branch looks like an anti-analysis sleep execution.”*

In short: The adversary’s eye is not focused on the instructions themselves, but on **how the execution flow divides and branches**.

### The Weapon: The Polymorphic CMOV Illusion

The x86-64 architecture features `CMOVcc` (Conditional Move) instructions. These instructions only perform a data transfer if specific processor flags (Zero Flag, Sign Flag, etc.) are set.

In the world of EDR Evasion, this has a profound implication: **CFG engines view the `CMOV` instruction as a standard, harmless data assignment (`MOV`), not as a branch!** Meanwhile, in the background, we are dynamically altering the program’s entire destiny at runtime.

### The Evolution of Syscall Obfuscation: Beating Ghidra’s “Constant Folding”

Using `CMOV` hides the branches, but we still have a glaring problem: the syscall numbers themselves. If we leave `39` (sys_getpid) and `35` (sys_nanosleep) as plaintext, static analyzers and YARA rules will flag them instantly. Let’s walk through the evolution of hiding these values, from naïve approaches to advanced runtime evasion.

#### Level 1: The Naive Approach (Plaintext)

```nasm
mov rax, 39     ; sys_getpid
mov rbx, 35     ; sys_nanosleep
```

Result: Defeats nothing. Basic YARA rules catch this immediately. Ghidra shows the numbers clearly.

### Level 2: Basic Mathematical Obfuscation

```nasm
; Hide 39 (sys_getpid)
mov rax, 9
add rax, 30     ; 9 + 30 = 39

; Hide 35 (sys_nanosleep)
mov rbx, 0x8A
xor rbx, 0xA9   ; 0x8A ^ 0xA9 = 0x23 (35)
```

Result: Defeats basic YARA and disk-based signature scanners because the raw bytes for 35 and 39 no longer exist in the binary.

The Flaw: Ghidra is smarter than this. Advanced static analyzers use a technique called **Constant Folding**. Because both numbers are hardcoded, Ghidra’s Decompiler evaluates the math statically and simply displays `rbx = 35` to the reverse engineer. We haven’t blinded the analyst at all.

### Level 3: Memory-Based Obfuscation (The YARA Blindfold)

Moving the values to a `.data` section and XORing them defeats all disk-based signature scanners and basic YARA rules. However, we must be honest: a skilled analyst using Ghidra will still see the static `0x73` key and the payload, allowing the Constant Folding engine to eventually solve `0x54 ^ 0x73 = 0x27 (39)`.

```nasm
section .data
    ; XOR key: 0x73
    ; 0x54 ^ 0x73 = 0x27 (39 - sys_getpid)
    ; 0x50 ^ 0x73 = 0x23 (35 - sys_nanosleep)
    syscall_keys db 0x54, 0x50

section .text
    ; ... [Previous Code] ...

    ; =====================================================================
    ; Memory-Based Obfuscation (YARA Blindfold)
    ; Defeats disk-based signatures, but Ghidra can still fold the 0x73 key.
    ; =====================================================================
    
    ; Decrypt default syscall (sys_getpid -> 39)
    mov al, byte [rel syscall_keys + 0]
    xor al, 0x73                            ; 0x54 ^ 0x73 = 0x27 (39)
    movzx rax, al                           
    
    ; Decrypt target syscall (sys_nanosleep -> 35)
    mov bl, byte [rel syscall_keys + 1]
    xor bl, 0x73                            ; 0x50 ^ 0x73 = 0x23 (35)
    movzx rbx, bl                           

    ; Zero out arguments for safety
    xor rdi, rdi
    xor rsi, rsi

    ; Check our previous operation's state (e.g., PID or Error in R15)
    test r15, r15

    ; =====================================================================
    ; Polymorphic Syscall Execution (Heuristic Bypass Zone)
    ; Branch-free, Static-proof, and Runtime-dependent!
    ; The static analyzer only sees linear "mov" operations.
    ; =====================================================================
    
    ; If R15 is Zero (Zero Flag) OR Negative (Sign Flag):
    cmovz rax, rbx      ; Change RAX from 39 to 35! (Syscall altered)
    cmovs rax, rbx

    ; Prepare alternative arguments for nanosleep
    lea r8, [rel sleep_time]
    mov r9, 0

    ; Overwrite arguments ONLY if conditions are met
    cmovz rdi, r8
    cmovz rsi, r9
    cmovs rdi, r8
    cmovs rsi, r9

    ; FIRE! (Executes either getpid or nanosleep depending entirely on runtime state)
    syscall
```

### Level 4: Runtime-Derived Keys (The True Ghidra Blindfold)

To completely break Constant Folding, the XOR key itself must not exist in the binary. It cannot be static. It must be injected at runtime (e.g., received securely from the C2 server during the initial handshake) or derived from an ASLR-randomized memory pointer.

```nasm
extern printf

section .data
    printf_got: dq printf

section .text

    ; ... [Previous Code] ...

    ; Example: Deriving a dynamic key from an ASLR-randomized libc pointer
    ; ASLR ensures this address changes on every single execution!
    mov r12, qword [rel printf_got] 
    and r12, 0xFF                   ; Extract the lowest byte as our 8-bit XOR key (r12b)
    
    ; *NOTE: In a fully weaponized build, 'syscall_keys' would not be 
    ; hardcoded on disk. Instead, an initialization stub would XOR the 
    ; plaintext syscalls with this dynamic ASLR byte ONCE upon startup,
    ; before entering the CMOV execution loop.
    
    ; Now decrypt the payload dynamically
    mov al, byte [rel syscall_keys + 0]
    xor al, r12b              
    movzx rax, al
```

**The Brute-Force Trap:** You might ask, “Can’t a Ghidra analyst just write a script to brute-force all 256 possible values of a 1-byte XOR key in microseconds?” Yes, they can. But how do they know which result is the correct one? 256 permutations will yield dozens of valid Linux syscall numbers.

Even if an analyst scripts a tool to narrow the results down to sleep-related syscalls, they cannot mathematically prove which permutation the program intends to execute. To find out, they MUST run the binary—at which point, dynamic analysis takes over, meaning our static evasion has already won. The deterministic certainty of static analysis is completely shattered.

### The Weaponized CMOV Block

Combining Level 4’s dynamic decryption with our branch-free architecture, we get the ultimate heuristic bypass:

```nasm
extern printf

section .data
    ; Encrypted syscall numbers 
    ; (Initialized at runtime by an ASLR derivation stub)
    syscall_keys db 0x54, 0x50
    
    ; timespec struct for sys_nanosleep (2 seconds, 0 nanoseconds)
    sleep_time dq 2, 0

    ; Define the external GOT reference for dynamic key generation
    printf_got: dq printf

section .text
    ; Assume R12B contains our dynamic, ASLR-derived XOR key
    mov al, byte [rel syscall_keys + 0]
    xor al, r12b                            
    movzx rax, al                           ; sys_getpid ready
    
    mov bl, byte [rel syscall_keys + 1]
    xor bl, r12b                            
    movzx rbx, bl                           ; sys_nanosleep ready

    ; Zero out arguments for safety
    xor rdi, rdi
    xor rsi, rsi

    ; Check our previous operation's state (e.g., PID or Error in R15)
    test r15, r15

    ; =====================================================================
    ; Polymorphic Syscall Execution (Heuristic Bypass Zone)
    ; Branch-free, Static-proof, and Runtime-dependent!
    ; The static analyzer only sees linear "mov" operations.
    ; =====================================================================
    
    ; If R15 is Zero (Zero Flag) OR Negative (Sign Flag):
    cmovz rax, rbx      ; Change RAX from 39 to 35! (Syscall altered)
    cmovs rax, rbx

    ; Prepare alternative arguments for nanosleep
    lea r8, [rel sleep_time]
    mov r9, 0

    ; Overwrite arguments ONLY if conditions are met
    cmovz rdi, r8
    cmovz rsi, r9
    cmovs rdi, r8
    cmovs rsi, r9

    ; FIRE! (Executes either getpid or nanosleep depending entirely on runtime state)
    syscall
```

* * *

## Live Test: VirusTotal Results

> **SHA-256:** `88ee03828550c5411cbedce446e98871ae984eb81dc32f71502e62d5f6de9a3f`

Theory is only as good as its evidence. The weaponized CMOV block above was compiled and submitted directly to VirusTotal for both static and dynamic analysis. Here are the unfiltered results.

### Static Analysis: 0/60 Detection Rate

![VirusTotal Detection Tab — 0 detections across all static AV engines. Note the Code Insights block at the top.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3e434d506b62915e.png)

VirusTotal Detection Tab — 0 detections across all static AV engines. Note the Code Insights block at the top.

![Enterprise-grade engines including CrowdStrike Falcon, Kaspersky, ESET-NOD32, Bitdefender, Sophos — all Undetected.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c62f57edc08310d1.png)

Enterprise-grade engines including CrowdStrike Falcon, Kaspersky, ESET-NOD32, Bitdefender, Sophos — all Undetected.

![SentinelOne (Static ML), TrendMicro, Symantec, WithSecure, ZoneAlarm by Check Point — all Undetected.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/10ed5fc7dca05075.png)

SentinelOne (Static ML), TrendMicro, Symantec, WithSecure, ZoneAlarm by Check Point — all Undetected.

Every static AV engine returned **Undetected**— including enterprise-grade solutions with dedicated ML models such as Acronis Static ML, SentinelOne Static ML, and CrowdStrike Falcon.

#### The Code Insights Anomaly

Pay close attention to the “Code Insights” block in the first screenshot. VirusTotal’s own static analysis engine correctly identified the technique:

> *“The entry point `_start` uses XOR-based obfuscation to dynamically calculate syscall numbers at runtime (e.g., `rax_1 = syscall_keys ^ arg1`). By avoiding direct calls to known library functions and obfuscating the syscall interface, the binary attempts to bypass static analysis and EDR signatures.”*

This is a critical finding. The pattern was **recognized**— yet not a single vendor translated that recognition into a detection signature. This gap between *pattern awareness* and *actionable detection* is precisely the vulnerability that the CMOV architecture exploits.

### Dynamic Analysis: Sandbox Behavior

![Behavior tab — CAPE Linux sandbox: 0 detections. Zenbox Linux: 4 informational MITRE signatures, 0 malicious detections.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/718d69ea57258c23.png)

Behavior tab — CAPE Linux sandbox: 0 detections. Zenbox Linux: 4 informational MITRE signatures, 0 malicious detections.

Two Linux sandboxes executed the binary:

**CAPE Linux** returned a completely clean result — zero detections, zero MITRE signatures, zero IDS/Sigma rules triggered.

**Zenbox Linux** flagged 4 informational MITRE ATT&CK signatures. However, examining the details reveals these were **not** triggered by the CMOV syscall technique itself.

![File system actions recorded by Zenbox — standard /dev and /etc reads, log rotation artifacts from the sandbox environment itself.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d203705fae3d3e3e.png)

File system actions recorded by Zenbox — standard /dev and /etc reads, log rotation artifacts from the sandbox environment itself.

![Process and service actions — the loader spawns via xterm → sh → /tmp/loader. The rsyslog rotation activity is sandbox infrastructure noise, not loader behavior.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/18012eafb1d893a6.png)

Process and service actions — the loader spawns via xterm → sh → /tmp/loader. The rsyslog rotation activity is sandbox infrastructure noise, not loader behavior.

![Process tree confirming the execution chain: PID 1879 (xterm) → 1880 (sh) → 1881 (/tmp/loader). The subsequent rsyslog PIDs are unrelated sandbox background tasks.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2dbbe2d1286848d5.png)

Process tree confirming the execution chain: PID 1879 (xterm) → 1880 (sh) → 1881 (/tmp/loader). The subsequent rsyslog PIDs are unrelated sandbox background tasks.

The Zenbox MITRE signatures — `T1064 Scripting` and `T1543 Create or Modify System Process` — were triggered by the sandbox’s own log rotation infrastructure (`rsyslog-rotate`, `systemctl kill -s HUP rsyslog.service`) running in the background during execution. They are not attributable to the CMOV loader logic.

**Net result:** The syscall obfuscation technique itself generated **zero dynamic detections** across both sandboxes.

### What the Results Tell Us

| Layer | Result | Notes |
| --- | --- | --- |
| Static AV (60+ engines) | ✅ 0/60 Undetected | Including ML-based engines |
| VT Code Insights | ⚠️ Pattern recognized | Not converted to detection |
| CAPE Linux sandbox | ✅ 0 detections | Fully clean |
| Zenbox Linux sandbox | ✅ 0 malicious | 4 info MITRE from sandbox noise |
| IDS / Sigma Rules | ✅ NOT FOUND | No network/kernel signatures |

The results confirm the article’s core thesis: **static analysis is fully defeated**. The Code Insights anomaly is worth noting as an honest caveat — heuristic pattern matching at the meta-analysis layer did identify the obfuscation style, even though no vendor acted on it. This is the frontier where detection engineering is currently lagging.

* * *

## How This Blinds Ghidra, IDA, and AI Scanners

During execution (runtime), one of two completely different operations will occur:

-   `sys_getpid` (39) executes harmlessly.
-   `sys_nanosleep` (35) executes to evade dynamic sandboxes.

Notice something? There is not a single `JMP`, `JE`, or `JNE` dictating this logic. So, how do analysis engines interpret this?

### 1\. The Collapse of Ghidra and IDA Pro (The Unresolved Pointer)

When Ghidra or IDA parses this block, it fails to recognize that the code path splits. In the disassembler view, this code is rendered as a single, straight-down block — a **Flat Graph**.

More importantly, because `r12b` is an unresolved dynamic variable derived from ASLR at runtime, all downstream data flow analysis completely collapses. Ghidra cannot propagate the variable, meaning the Decompiler simply shows an unknown pointer being passed to a syscall. The analyst is forced to meticulously read register assignments, effectively blinding the decompilation engine.

### 2\. Bypassing AI and Heuristic Scanners

AI-based security products actively hunt for “Sleep-based Evasion” techniques by scanning the CFG for specific loops and branching structures. In our CMOV architecture, there is no “if-else” decision node for the engine to analyze. As confirmed by the VirusTotal results above, static ML algorithms fail to extract the necessary structural features to flag it as an evasion technique during the initial disk-scan phase.

* * *

## The Reality Check: Modern EDRs vs. Static Evasion

While the polymorphic CMOV architecture is a powerful method to break Control Flow Graphs and blind static analysis tools, we must be intellectually honest about the modern cybersecurity landscape. If deployed as-is against a 2026-era modern EDR, this specific implementation has limitations:

**The Branching Paradox**: In a real-world loader, if you end your branch-free CMOV block with a traditional check (like `test r15, r15` followed by `jle _wait`), you immediately re-introduce a branch back into the CFG. To maintain the complete illusion, the entire execution loop must be redesigned to be truly branch-free or use indirect, obfuscated jumps (like ROP gadgets).

**Static vs. Dynamic Tracing**: The CMOV technique is strictly a **Static Bypass**. It destroys the CFG on disk and in memory. However, it does not bypass Dynamic Tracing. When the `syscall` instruction executes, kernel-level hooks (like ETW in Windows or eBPF/Falco in Linux) will still intercept the system call at Ring 0.

**The Code Insights Gap**: As the live test revealed, meta-analysis engines can recognize obfuscation patterns even without understanding the exact payload. This represents the next frontier for detection engineering — and a signal that obfuscation complexity must continue to evolve.

**The Takeaway:** Evasion is a multi-layered game. Breaking the CFG with CMOV is a highly effective first layer to defeat AI static scanners and human analysts. But to survive execution, it must be paired with dynamic bypass techniques (like Fork & Hollow or eBPF evasion) and fully obfuscated registers.

* * *

## Conclusion

Static analysis tools and “Next-Gen” AI scanners are incredibly brittle when faced with the true flexibility of Assembly architecture. Manipulating data paths with CMOV without altering the RIP (Instruction Pointer) via branching is more than just an obfuscation tactic; it is the most elegant, hardware-level method to defeat machine learning models by their own rules.

The live VirusTotal test — **0/60 static detections, 0 dynamic malicious detections**— confirms that this is not just theory. The gap between pattern recognition and actionable detection signatures is real, measurable, and currently exploitable.

* * *

*Disclaimer: This article and the associated concepts are intended for educational purposes and authorized security research only. Understanding these offensive evasion techniques is critical for engineering more resilient detection systems and EDR solutions.*

## Related

-   [Two Approaches to EDR Evasion: Kernel-Level BYOVD vs User-Space Injection](https://netacoding.com/posts/byovd-vs_userspace_inj/)
-   [Dissecting LockBit 5.0 Linux: A Deep Dive into Offline-Capable Ransomware](https://netacoding.com/posts/lockbit5-analysis/)
-   [Evasion Techniques in Pure x64 Assembly: SROP and Zero-Copy Injection](https://netacoding.com/posts/phantom-evasion-loader-blog/)
