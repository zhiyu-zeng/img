---
title: "ICMP-Ghost: Fileless C2 with ICMP & DNS Tunneling in Pure x64 Assembly | Suricata Bypassed | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/icmp-ghost/
source_host: netacoding.com
clip_date: 2026-10-01T10:22:09+08:00
trace_id: 4da45e18-d2a9-4a5b-ba63-269f4c41b063
content_hash: fca3c18b2f0ec8b1e51c01c6af4b070890cf3d15ce50449293619423f2471849
status: synced
tags:
  - 恶意样本
  - 协议分析
series: null
feed_source: Netacoding·协议/逆向
ai_summary: 纯 x64 汇编的无文件 C2「ICMP-Ghost」发布 v3.6.3：以 DNS 域名逐包轮换、RFC 4648 Base32、A 记录查询消除静态指纹，并用 ICMP/DNS 双通道热切换绕过 Suricata 等规则型 NDR。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3ec75244-d011-81f3-a4e7-e3390954feeb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 纯 x64 汇编的无文件 C2「ICMP-Ghost」发布 v3.6.3：以 DNS 域名逐包轮换、RFC 4648 Base32、A 记录查询消除静态指纹，并用 ICMP/DNS 双通道热切换绕过 Suricata 等规则型 NDR。
> 
> - **DNS 加固：** 5 个域名（github/microsoft/cloudflare/google/windows.com）逐包轮换，QTYPE 由自定义 TXT 改为标准 A 记录，Base32 改用 RFC 4648 小写表；修复解码阈值 `'2'`→`'a'` 导致的静默命令损坏，以及域索引回绕越界、beacon 长度校验等缺陷。
> - **双通道 VTable：** 在 `rbp+0x3000/3008/3010` 存放 `_init/_recv/_send` 函数指针，`!D`/`!I` 命令在内存中即时切换 DNS（53/UDP）与 Raw ICMP，无需重启进程，双方状态同步由命令本身定义。
> - **无文件执行：** 用 `memfd_create(319)` 建 `[shm]` 内存文件，`fork`+`dup2`+`execve` 劫持命令输出；Phantom 模式下该 fd 归属宿主进程 PID 且仅存活毫秒级，`/proc` 轮询难以捕获。
> - **Phantom Loader：** 经 `ptrace` 完成远程 mmap(RW)→写入 PIC→mprotect(RX) 两阶段，规避 W^X；payload 以 8 字节小端 XOR 预加密，文件熵约 6.0，避开打包器告警。
> - **流量伪装：** ICMP 用 0x10–0x1F 填充把载荷推出 DPI 扫描深度；ID+SEQ 非对称校验（45000/55000）；Rolling XOR 配合 VESQER DPCM-RLE 压缩，文本体积降 40%–55%；RDTSC 自适应抖动打破周期性。已知短板：chunk 与 ICMP 载荷长度固定、DNS 响应未模拟。

In advanced security operations, the line between “detected” and “invisible” is drawn at the syscall level. Since its inception, **ICMP-Ghost** (Ghost-C2) has focused on one goal: absolute invisibility.

With **v3.6.3**, the DNS module receives a significant hardening update: 5-domain per-packet rotation, RFC 4648 Base32 encoding, and A record QTYPE — eliminating static domain fingerprinting and fixing a silent command corruption bug in the Base32 decoder. The dual-channel ICMP/DNS pivoting architecture introduced in v3.6.2 remains at the core, now operating with a substantially reduced detection surface against rule-based NDR systems. All in pure x64 Assembly with zero external dependencies.

Ghost-C2 operates in two deployment modes: **Standalone** (direct binary execution) and **Phantom Loader** (PIC injection into a live host process). The techniques described below apply to both modes unless explicitly noted otherwise.

* * *

## Architecture Overview

![Ghost-C2 & Phantom Loader Architecture Design](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9c9dd2c95da8bbe0.png)

* * *

## 🔀 What’s New in v3.6.3: DNS Module Hardening

### DNS Domain Rotation

The previous implementation used a single static domain (`fake_domain`) for all DNS queries — a trivial fingerprinting target for any NDR system that builds per-host DNS baselines. v3.6.3 replaces this with a **5-entry domain pool** that rotates on every packet:

```nasm
domain_pool:
    db "github.com          " ; 20 bytes
    db "microsoft.com       " ; 20 bytes
    db "cloudflare.com      " ; 20 bytes
    db "google.com          " ; 20 bytes
    db "windows.com         " ; 20 bytes
```

The active domain is selected via `domain_idx` (BSS counter), incremented per packet. Every command transmission uses a different QNAME destination — there is no static domain for a signature to match against.

**Client (`client.asm`):** The `_translate_dns_name` function and user input flow for domain selection have been removed entirely. Domain selection is now automatic and opaque to the operator.

**Agent (`sniff.asm`):** The static `fake_domain` reference is replaced with the same 5-entry `domain_pool` anchored at `[rbp+0x3020]`.

### QTYPE: TXT → A Record

The DNS query type has changed from a custom TXT format (`0x01001000`) to a standard A record (`0x01000100`). DNS queries for A records are the most common query type in any network — blending the C2 traffic with legitimate resolution traffic and removing the anomalous TXT query pattern that NDR systems flag.

### Base32 RFC 4648 Encoding

The custom Base32 alphabet has been replaced with **RFC 4648 lowercase** (`abcdefghijklmnopqrstuvwxyz234567`). The agent now uses dedicated `b32_alpha` and `b32_char_cnt` lookup tables for encoding.

This also fixes a **silent command corruption bug**: the Base32 decode threshold was comparing against `'2'` (`0x32`) instead of `'a'` (`0x61`), causing incorrect decoding of any command containing lowercase characters — resulting in silent corruption with no error signal.

```nasm
; Before (v3.6.2) — wrong threshold
cmp al, '2'

; After (v3.6.3) — correct RFC 4648 threshold
cmp al, 'a'
```

### Bug Fixes

-   **Domain pool entry size:** All 5 entries verified at exactly 20 bytes — unequal lengths caused pointer arithmetic drift during rotation
-   **Boundary wrap:** `cmp al/rax, 6` → `cmp al/rax, 5` — the previous value caused an OOB read on domain index rollover (wrapping to a 6th non-existent entry)
-   **Beacon size check:** `cmp rax, 32` → `cmp rax, 28` — corrected beacon length validation

### Removed

The following components have been removed in v3.6.3:

-   `raw_domain`, `dns_domain`, `_translate_dns_name`, `msg_domain_name` (client.asm)
-   Static `fake_domain` reference (sniff.asm)
-   ICMP decoy send logic (`_icmp_recv`) — removed to reduce unnecessary packet noise

* * *

## 🔀 Dual-Channel VTable Architecture (v3.6.2)

### The Problem with Single-Protocol C2

A C2 implant locked to one protocol is a C2 implant with a single point of failure. If ICMP is blocked at the network perimeter, the implant goes silent. If DNS anomaly detection kicks in, pivoting requires redeployment. Neither is acceptable in a production red team operation.

v3.6.2 solves this with an **in-memory VTable**— a function pointer table resident in the implant’s stack frame that defines which protocol engine handles all network I/O at any given moment.

### VTable Architecture

The VTable lives at a fixed offset (`rbp + 0x3000`) within the implant’s stack anchor and holds three function pointers:

```
rbp + 0x3000  →  _init   (socket creation & binding)
rbp + 0x3008  →  _recv   (packet reception)
rbp + 0x3010  →  _send   (packet transmission)
```

On startup, the VTable is populated with ICMP function addresses by default. Every network operation calls through the VTable — not directly:

```nasm
call [rbp + 0x3008]  ; _recv — calls whatever protocol is active
call [rbp + 0x3010]  ; _send — same
```

This means the **protocol is completely transparent to the rest of the implant**. The command parsing, compression, encryption, and fragmentation logic never change — only the three function pointers do.

### Protocol Hot-Swapping (!D /!I Commands)

The operator triggers a protocol switch via two pivot commands embedded in the command stream:

| Command | Action |
| --- | --- |
| `!D` | Switch to DNS UDP tunneling on port 53 |
| `!I` | Switch back to Raw ICMP |

When `!D` is received:

```nasm
_switch_to_dns:
    ; 1. Close the active ICMP socket
    mov rax, 3          ; sys_close
    syscall

    ; 2. Overwrite VTable with DNS function pointers
    lea rax, [rel _dns_init]
    mov [rbp + 0x3000], rax
    lea rax, [rel _dns_recv]
    mov [rbp + 0x3008], rax
    lea rax, [rel _dns_send]
    mov [rbp + 0x3010], rax

    ; 3. Initialize DNS socket and send beacon
    call [rbp + 0x3000]  ; _dns_init
    call [rbp + 0x3010]  ; _dns_send (beacon to operator)
```

The switch happens in-memory, in microseconds. No process restart. No disk write. The implant seamlessly transitions from one network protocol to another while remaining inside the host process.

### DNS Tunneling Module

The DNS module implements full UDP-based command exfiltration over port 53:

-   **Encoding:** RFC 4648 lowercase Base32 (`abcdefghijklmnopqrstuvwxyz234567`) for QNAME encoding — output data is encoded into DNS label format and transmitted as DNS query Question sections
-   **QTYPE:** A record (`0x01000100`) — blends with legitimate DNS resolution traffic
-   **Domain Rotation:** 5-entry pool (github.com, microsoft.com, cloudflare.com, google.com, windows.com) — per-packet rotation via `domain_idx`, no static domain fingerprint
-   **Transaction ID Integrity:** ID high byte + ID low byte = `0xFF` — any packet that fails this check is silently dropped
-   **Port Configuration:** Defaults to port 5300 for local testing; change to 53 for operational deployment

```nasm
_dns_send:
    ; Build DNS header
    ; Transaction ID with auth checksum
    ; Encode payload into QNAME labels via Base32
    ; Transmit via sys_sendto UDP
```

### State Synchronization

Both the operator console (`client.asm`) and the implant (`sniff.asm`) maintain synchronized VTable state. When the operator issues `!D`, both sides switch their VTable simultaneously — the operator’s console updates its listening socket to DNS UDP, and the implant switches its beacon channel. Neither side needs to renegotiate; the protocol is defined by the command itself.

### Why This Matters Operationally

-   **ICMP blocked at perimeter?** Issue `!D`, pivot to DNS — traffic now exits via port 53, which is almost never firewalled
-   **DNS anomaly detection triggered?** Issue `!I`, pivot back to ICMP — no redeployment needed
-   **Single implant, two egress paths**— the defender must block both simultaneously to break the C2 channel

* * *

## 🛠 The Philosophy of Pure x64 Assembly

Most modern C2 agents are bloated by `libc` dependencies and predictable compiler signatures. Ghost-C2 breaks this mold by using **zero-dependency x64 Assembly**.

By interacting directly with the Linux Kernel, we achieve:

-   **Microscopic Footprint:** A binary small enough to hide in the smallest memory pockets.
-   **Signature Neutralization:** Static analysis tools fail to find standard library signatures or typical C-runtime artifacts.
-   **Total Register Control:** Precise control over the execution flow, ensuring no unexpected side effects or “noisy” syscall sequences.

All syscall numbers are split across two instructions to defeat static analysis and simple grep-based scanners:

```nasm
; sys_memfd_create (319)
mov rax, 300
add rax, 19
syscall

; sys_ptrace (101)
mov rax, 99
add rax, 2
syscall
```

* * *

## 👻 Fileless Execution via memfd_create

The first rule of stealth is **“Never touch the disk.”** Disk I/O is the primary hunting ground for EDRs and AVs.

Ghost-C2 utilizes the `sys_memfd_create` (319) syscall to create anonymous, RAM-resident files. Command outputs are hijacked via `sys_dup2` (33) and redirected to these memory-backed file descriptors:

```css
fork()
  child: dup2(memfd, stdout) → execve("/bin/sh", ["-c", cmd])
  parent: wait4() → lseek(0) → read loop → compress → encrypt → fragment → send
```

The memfd is named `[shm]`, matching the format of legitimate shared memory mappings in `/proc/PID/fd`.

The forensic implications differ significantly between deployment modes:

-   **Standalone Mode:** The memfd appears under the agent’s own PID. When the agent process terminates, all associated file descriptors are destroyed — leaving nothing for traditional forensics to recover.
-   **Phantom Loader Mode:** The memfd appears under the **host process’s PID** (e.g., `cron`). Critically, the memfd is created, read, and closed within **milliseconds** during each command execution cycle — it exists only for the brief window between `fork()` and `sys_close()`. Even continuous `/proc` polling is unlikely to catch it, and if it does, the file descriptor belongs to a legitimate system service. A transient `[shm]` descriptor under `cron` is indistinguishable from normal shared memory operations and raises zero suspicion.

* * *

## 🗜️ DPCM-RLE Hybrid Compression (v3.6.0)

The newest addition to Ghost-C2’s pipeline is the **VESQER** compression engine — a custom DPCM+RLE hybrid compressor built entirely in x64 Assembly.

### The Algorithm

Ghost-C2’s data transmission engine utilizes a hybrid compression and encoding layer that reduces data volume while ensuring the traffic profile remains natural:

**Differential Pulse Code Modulation (DPCM):** Instead of transmitting raw ASCII values, the engine calculates and sends the mathematical difference (Delta) between a reference character (Anchor) and the subsequent ones. This method drastically lowers the entropy of data with similar character ranges.

```nasm
mov al, byte [rsi]    ; Read new character
mov dl, al
sub al, bl            ; Calculate difference (Delta) from Anchor (bl)
mov r9b, al           ; Save Delta
mov bl, dl            ; Set new Anchor
```

**Run-Length Encoding (RLE):** Working in tandem with DPCM, the RLE engine packs consecutive repeating delta values — frequently seen in outputs like `ls -la` where spaces, permission blocks, and date formats repeat heavily:

```nasm
.comp_flush:
    mov byte [rdi], r8b   ; Write repetition count (Count)
    inc rdi
    mov byte [rdi], r9b   ; Write Delta value
    inc rdi
```

### Performance & Efficiency

The advantages provided by the hybrid engine have been verified through rigorous field testing:

-   **Compression Ratio:** Achieves an average data reduction of **40% to 55%** for text-based command outputs (ASCII/UTF-8).
-   **Transmission Speed:** Because the data volume is reduced, the total packet count is cut nearly in half. This significantly shortens the transfer time for large datasets (20KB+), even while Adaptive Jitter is active.
-   **100% String Fidelity:** Stack offsets are strictly confined to a safe memory region (`0x100000`), and synchronization desyncs have been eliminated. Massive datasets of 20KB+ (e.g., `/etc` dumps) are delivered to the Client without a single bit of deviation.

### Stealth & Evasion Contributions

Beyond speed, compression plays a critical role in the implant’s stealth capabilities:

-   **Reduced Packet Footprint:** Reducing data size by nearly 50% radically lowers the number of ICMP packets sent over the network. Fewer packets minimize the risk of triggering anomaly detection in IDS/IPS systems.
-   **Natural Noise Simulation:** The combination of DPCM and Rolling XOR maintains traffic entropy at a level that avoids the “suspiciously high” signatures of standard AES encryption. To external observers, the traffic appears as natural network noise or compressed hardware logs.
-   **No Magic Bytes:** Unlike zlib (`0x78 0x9C`), gzip (`0x1F 0x8B`), or LZ4 (`0x04 0x22 0x4D 0x18`), VESQER produces zero identifiable headers. NDR/DPI systems that flag known compression signatures find nothing to match.

**Standalone Repository:** [VESQER Baremetal Compressor](https://github.com/JM00NJ/Vesqer-Baremetal-Compressor-DPCM-RLE-Hybrid-Engine)

* * *

## 🛡️ Stealth Features: Defeating DPI & Heuristics

### Protocol Mimicry

Every outgoing ICMP packet is structured to be indistinguishable from a standard Linux ping:

```sql
Offset  0-7   : ICMP Header (Type, Code, Checksum, ID, SEQ)
Offset  8-15  : Dynamic RDTSC timestamp  ← mimics struct timeval
Offset 16-31  : 0x10, 0x11 ... 0x1F     ← exact Linux iputils padding
Offset 32+    : Encrypted payload        ← past most DPI scan depth
```

Signature-based IDS engines (Suricata, Snort) see standard padding and stop scanning before reaching the payload. This is **the Stealth Gap**.

### Asymmetric Authentication

The implant ignores all packets where `ID + SEQ ≠ 45,000`. Random internet scanners, automated security tools, and honeypots will never trigger it. The implant replies with packets where `ID + SEQ = 55,000`, making the two directions mathematically distinct and preventing OS echo confusion.

### Rolling XOR Cipher

Both directions are encrypted with a progressively shifting key:

```nasm
mov dl, 0x42      ; seed
xor [rsi], dl     ; encrypt byte
add dl, 0x07      ; shift key
inc rsi
loop .loop
```

This keeps Shannon entropy controlled — AES-encrypted ICMP traffic scores ~8.0 and triggers DPI anomaly alerts. Rolling XOR produces entropy that looks like compressed or naturally noisy data. No cryptographic constants, no S-boxes, nothing for YARA to match.

### Adaptive Jitter (RDTSC-based)

Packet transmission intervals are randomized using the CPU’s hardware timestamp counter, not software timers. This produces timing patterns that are mathematically non-periodic — ML-based NTA engines (Darktrace, Cisco Stealthwatch) require periodicity to flag C2 beaconing:

```nasm
rdtsc
xor rdx, rdx
mov ecx, 900000000
div ecx             ; RDX = random 0–900ms
add edx, 100000000  ; minimum 100ms
```

### Data Fragmentation

Large command outputs are automatically fragmented into 56-byte chunks, yielding 88-byte total ICMP packets (Header + Mimicry + Payload). This matches the standard Linux diagnostic ping profile and avoids triggering “MTU Exceed” or “Large Payload” signatures.

* * *

## 🎭 Process Identity: Standalone vs. Phantom Loader

How Ghost-C2 hides in the process tree depends entirely on the deployment mode:

**Standalone Mode:** Using `sys_prctl` (157) and manual `argv[0]` stack manipulation, the agent renames itself to a legitimate service (e.g., `systemd-resolved`). This defeats casual inspection via `ps` and `htop`, but `/proc/PID/exe` still points to the original binary path — a forensic artifact that a thorough investigator can uncover.

**Phantom Loader Mode:** Masquerading becomes irrelevant — the agent doesn’t exist as a separate process. It runs inside the host’s address space. The process tree shows only the legitimate host:

```
$ ps aux | grep cron
root         828  0.0  0.0  18176  3092 ?   Ss   Apr10   0:00 /usr/sbin/cron -f -P
root       17028  0.0  0.0  24196  1756 ?   Ss   05:34   0:00 /usr/sbin/cron -f -P
```

One of these is the real `cron`. The other is Ghost-C2 running inside a cloned `cron` instance. Even `/proc/PID/exe` points to `/usr/sbin/cron` — because it *is* `cron`. The process lineage, binary path, and command-line arguments are all legitimate. There is nothing to masquerade because the disguise is structural, not cosmetic.

* * *

## 🔮 Phantom Loader — In-Memory PIC Injection (v3.5)

With the v3.5 release, Ghost-C2 transitions from a standard executable to a **100% Position Independent Code (PIC) memory-resident threat**. Modern Linux kernels employ ruthless mitigations like Memory-Deny-Write-Execute (MDWE), NX, and strict ASLR. Ghost-C2 defeats these armors by executing entirely within the memory space of legitimate, unconfined root services.

### The Injection Chain

The loader performs a deterministic, multi-step injection without any external dependencies:

```bash
1. Open /proc with sys_getdents64
 2. Scan linux_dirent64 entries for numeric directories (PIDs)
 3. Read /proc/<PID>/comm → compare against target name
 4. ptrace(PTRACE_ATTACH, pid)
 5. wait4() loop with branchless sleep (cmovz/cmovs)
 6. PTRACE_GETREGS → save register state + RIP
 7. PTRACE_POKEDATA → write syscall opcode (0x050F) at RIP
 8. PTRACE_SETREGS → configure mmap arguments in registers
 9. PTRACE_SINGLESTEP → execute remote mmap
10. wait4() → PTRACE_GETREGS → read mmap return value
11. PTRACE_POKEDATA loop → write PIC payload (8 bytes/iter)
12. PTRACE_SETREGS → configure mprotect (PROT_READ | PROT_EXEC)
13. PTRACE_SINGLESTEP → execute remote mprotect
14. PTRACE_POKEDATA → restore original bytes at RIP
15. PTRACE_SETREGS → set RIP = injected payload address
16. PTRACE_DETACH → host process resumes, now running the implant
```

The loader exits immediately after step 16. The host process continues its normal operation with Ghost-C2 running inside it.

### W^X (Write XOR Execute) Evasion

Modern kernel mitigations forbid RWX memory. The loader uses a two-phase approach:

```
Phase 1: Remote mmap with PROT_READ | PROT_WRITE
         → Inject shellcode via PTRACE_POKEDATA

Phase 2: Remote mprotect → PROT_READ | PROT_EXEC
         → No page is ever simultaneously W and X
```

EDR memory scanners looking for RWX anomalies find nothing. The injected region appears as a legitimate `r-xp` mapping — indistinguishable from a shared library in `/proc/PID/maps`.

* * *

## 🔒 Payload Obfuscation (v3.5.5)

The agent payload is no longer stored in clear-text within the loader binary. It is pre-encrypted externally using an 8-byte (QWORD) Little-Endian XOR key. Decryption occurs dynamically within CPU registers only during the injection phase, ensuring the raw shellcode never touches the disk or loader memory in an unencrypted state.

### Static Analysis Bypass

By obfuscating the payload, all static opcode signatures and recognizable syscall/ptrace patterns have been eliminated from the loader’s binary, effectively neutralizing signature-based detection.

### Entropy Optimization

By opting for a streamlined XOR operation instead of high-entropy ciphers like AES or RC4, the file’s Shannon Entropy is maintained at a stealthy level (~6.0). This prevents triggering “Packed/Encrypted Malware” heuristic alerts common in modern EDR solutions:

```
DECIMAL       HEXADECIMAL     ENTROPY
------------------------------------------------------------------------
0             0x0             Falling entropy edge (0.060281)
9216          0x2400          Falling entropy edge (0.541848)
```

No critical high-entropy spikes that would flag the binary as a malicious packer.

* * *

## 🏗 Architectural Decision: Why No Interactive TTY?

A common question is: *“Why no full PTY support?”* In Ghost-C2, the absence of an Interactive TTY is a **deliberate OPSEC choice**.

-   **DPI Avoidance:** TTYs require stateful, high-frequency data streams (every keystroke), which creates an “ICMP Storm” that triggers anomaly rules.
-   **Behavioral Artifacts:** Allocating a PTY requires `ioctl` syscalls and `/dev/ptmx` access — actions heavily monitored by modern EDRs.

Ghost-C2 is a stateless exfiltration tool, not a remote admin utility. We trade convenience for absolute invisibility.

* * *

## 💻 Syscall Inventory (The Ghost’s DNA)

| Syscall | Function | Purpose |
| --- | --- | --- |
| `sys_socket (41)` | Raw ICMP / UDP Socket | Protocol-agnostic lower-level network access |
| `sys_recvfrom (45)` | Packet Reception | ICMP / DNS listener (VTable-routed) |
| `sys_sendto (44)` | Packet Transmission | ICMP / DNS response with jitter (VTable-routed) |
| `sys_memfd_create (319)` | Anonymous RAM File | Fileless execution |
| `sys_fork (57)` | Process Forking | Command execution isolation |
| `sys_execve (59)` | Shell Execution | `/bin/sh -c` command runner |
| `sys_dup2 (33)` | I/O Redirection | stdout/stderr → memfd |
| `sys_nanosleep (35)` | Randomized Jitter | Beaconing disruption |
| `sys_prctl (157)` | Process Control | Masquerading & anti-dump |
| `sys_ptrace (101)` | Process Manipulation | Injection & anti-debug |
| `sys_mmap` | Memory Allocation | Remote RW region creation |
| `sys_mprotect` | Permission Control | RW → RX transition |
| `sys_getdents64` | Directory Listing | /proc PID enumeration |

* * *

## 🛡️ Defense Analysis & The OPSEC Reality

From a Blue Team perspective, detecting an implant like Ghost-C2 requires moving beyond signature-based detection. The following analysis covers both deployment modes and their respective attack surfaces.

### 1\. ICMP Payload Entropy vs. DPI Depth Limits

-   *The Defense:* Blue teams monitor for high-entropy data in ICMP segments to detect encrypted tunneling.
-   *The OPSEC Reality:* Ghost-C2 leverages “DPI Depth Limits”. The high-entropy payload is pushed past the 32-byte mark, hidden behind legitimate `0x10-0x1F` mimicry padding. Performance-tuned DPI engines like Suricata often classify the packet as “safe” before even reaching the encrypted payload. Additionally, with VESQER compression applied before Rolling XOR, the entropy profile avoids the ~8.0 ceiling that flags AES-encrypted traffic.

### 2\. Protocol Pivot Detection

-   *The Defense:* Alerting on sudden protocol shifts — e.g., a host that was sending ICMP traffic suddenly generating DNS queries.
-   *The OPSEC Reality:* The pivot is operator-controlled and can be timed to coincide with natural DNS traffic windows. DNS queries to a configured decoy domain blend with normal resolution traffic. The transaction ID integrity check (`ID_high + ID_low = 0xFF`) means only the legitimate operator can interact with the implant — random DNS traffic is silently dropped.

### 3\. Anonymous FD Auditing (memfd Detection)

-   *The Defense:* Inspecting `/proc/[pid]/fd/` for links to `memfd:` is a known technique for finding RAM-resident files.
-   *Standalone Mode:* This defense is viable if continuous host-level polling (Auditd/eBPF) is deployed. The memfd persists under the agent’s own PID for the duration of each command execution cycle.
-   *Phantom Loader Mode:* This defense becomes **nearly ineffective**. The memfd is created, read, and destroyed within **milliseconds** during each command cycle — and it appears under the **host process’s PID**. A brief `[shm]` descriptor under `cron` is indistinguishable from normal shared memory operations. Even aggressive eBPF polling would need sub-millisecond sampling to catch it, and even then, the descriptor belongs to a trusted system service.

### 4\. Process Lineage & SOCK_RAW Detection

-   *The Defense:* Alerting on processes that utilize `SOCK_RAW` but aren’t recognized network services.
-   *Standalone Mode:* Detectable if the agent’s masqueraded name doesn’t match a service expected to use raw sockets.
-   *Phantom Loader Mode:* The `SOCK_RAW` socket belongs to `cron` ’s PID. This requires the defender to maintain a strict baseline of expected socket types per service — most production environments do not enforce this level of granularity.

### 5\. Memory Region Analysis

-   *The Defense:* Scanning `/proc/PID/maps` for anomalous executable regions.
-   *The OPSEC Reality:* The W^X injection ensures the implant’s memory region shows `r-xp` permissions — identical to any loaded shared library. Without a pre-existing baseline diff of the target process’s memory map, identifying the implant region requires manual live forensic analysis.

### 6\. Static Binary Analysis (Loader Only)

-   *The Defense:* Scanning the loader binary for known shellcode patterns, syscall opcodes, or ptrace signatures.
-   *The OPSEC Reality:* As of v3.5.5, the payload is XOR-encrypted at rest and all syscall numbers are arithmetically split. The binary’s entropy profile (~6.0) falls within the normal range for legitimate compiled programs. The loader is a one-shot tool — it executes, injects, and immediately exits.

* * *

## ⚠️ Known Limitations

-   **AppArmor / SELinux:** Processes confined by Mandatory Access Control profiles will block the critical `mprotect` syscall. The loader currently targets unconfined root processes such as `cron` or `VBoxService`. A dedicated MAC bypass is planned for v4.x.
-   **DNS Non-Compliance:** The DNS tunneling module encodes data into QNAME labels for transport. The resulting queries are not RFC-compliant DNS — they will not resolve through standard resolvers. This is by design (the operator controls the receiving end), but it means DNS-based DPI that validates query structure may flag the traffic. Full RFC-compliant DNS tunneling is on the roadmap.
-   **No Interactive TTY:** By design. See architectural decision above.
-   **Single Operator:** The current architecture supports one operator per agent instance. Multi-agent orchestration is on the long-term roadmap.

* * *

## Conclusion

Ghost-C2 v3.6.3 demonstrates that even in the age of advanced EDRs, eBPF sensors, and ML-powered NTA engines, low-level Assembly provides the tools to remain a “Ghost in the Machine.” By combining fileless execution, PIC injection, dual-channel protocol pivoting, hybrid compression, protocol mimicry, and layered obfuscation — all without a single external dependency — we redefine the boundaries of stealth.

The v3.6.3 DNS hardening eliminates the last static fingerprinting surface in the DNS module: domain rotation ensures no two packets share a QNAME, RFC 4648 Base32 fixes silent command corruption, and the A record QTYPE blends with legitimate resolution traffic. Rule-based NDR systems (Snort, Suricata, Zeek) find nothing to match.

The VTable architecture transforms the implant from a single-protocol tool into a protocol-agnostic communication engine. The operator decides the channel. The defender must block all of them simultaneously.

The Phantom Loader fundamentally changes the threat model: the implant doesn’t just *evade* detection — it ceases to exist as a distinct entity. It becomes the host process itself, inheriting its identity, its permissions, and its trust.

**Source Code & Empirical Verification:** [GitHub Repository: Ghost-C2](https://github.com/JM00NJ/ICMP-Ghost-A-Fileless-x64-Assembly-C2-Agent)

**Standalone Compression Engine:** [VESQER Baremetal Compressor](https://github.com/JM00NJ/Vesqer-Baremetal-Compressor-DPCM-RLE-Hybrid-Engine)

**Test Environment:**  
All empirical tests — Suricata v8.0.3 evasion, protocol pivoting, memfd timing windows — were conducted on isolated [DigitalOcean Droplets](https://www.digitalocean.com/?refcode=beef2ce8ca63&utm_campaign=Referral_Invite&utm_medium=Referral_Program&utm_source=badge). A clean, internet-routable VPS is a hard requirement for end-to-end C2 testing: `client.asm` (operator console) needs an external IP that the implant can beacon back to over raw ICMP or port 53.

**MITRE ATT&CK:** [T1095](https://attack.mitre.org/techniques/T1095/) · [T1572](https://attack.mitre.org/techniques/T1572/) · [T1071.004](https://attack.mitre.org/techniques/T1071/004/) · [T1055](https://attack.mitre.org/techniques/T1055/) · [T1562.001](https://attack.mitre.org/techniques/T1562/001/)

## 🛡️ Evasion Status (v3.6.3)

| Surface | Status | Risk |
| --- | --- | --- |
| DNS QTYPE | A record | ✅ Low |
| Domain rotation | 5-domain per-packet | ✅ Low |
| Base32 encoding | RFC 4648 lowercase | ✅ Low |
| LCG jitter | 100–1000ms adaptive | ✅ Low |
| ICMP decoy pattern | Removed | ✅ Low |
| Chunk size variance | Fixed 35B | ⚠️ Medium |
| ICMP payload size | Fixed 80B | ⚠️ Medium |
| DNS response simulation | Not implemented | ⚠️ High (ML-based NDR only) |

Rule-based NDR systems (Snort, Suricata, Zeek signatures) are bypassed in the current state. The remaining medium/high risk surfaces are relevant only against ML-based behavioral analysis (Darktrace, ExtraHop).

* * *

## 🗓️ Planned: v3.6.4

**DNS response simulation**— both master console and agent will return synthetic A record responses (`QR=1`, `RCODE=0`) for every outgoing query. This eliminates the unanswered query anomaly currently detectable by ML-based NDR engines (Darktrace). An unanswered DNS query that exits the network perimeter but receives no response is a behavioral signal that advanced NTA engines can correlate over time. v3.6.4 closes this gap.

* * *

## 📖 Deep Dive: The Full Course

The complete architecture behind ICMP-Ghost — direct syscalls, SROP injection, VESQER compression, dual-channel pivoting, and operator OPSEC — is covered in depth in the companion course.

**[Fileless C2 Development in Pure x64 Assembly →](https://netacoding.lemonsqueezy.com/)**

11 chapters, 99 pages, built entirely from the real source code.

* * *

## Further Reading

-   [memfd_create for Memory-Resident Operations](https://netacoding.com/posts/volatile-storage/)
-   [PIC](https://netacoding.com/posts/pic-entry/)
-   [Invisible Exfiltration](https://netacoding.com/posts/advanced-evasion-techniques/)
-   [LCG-Based-Jitter](https://netacoding.com/posts/lcg-jitter/)

## ⚠️ Legal Disclaimer

This project is created for **educational purposes and security research only**. Unauthorized access to computer systems is illegal. The author assumes no liability for any misuse of this tool. Always obtain explicit written permission before testing on any system you do not own.
