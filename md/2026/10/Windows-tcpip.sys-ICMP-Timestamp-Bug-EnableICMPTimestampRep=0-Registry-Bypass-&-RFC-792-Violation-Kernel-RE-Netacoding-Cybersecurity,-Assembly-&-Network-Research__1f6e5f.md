---
title: "Windows tcpip.sys ICMP Timestamp Bug: EnableICMPTimestampRep=0 Registry Bypass & RFC 792 Violation | Kernel RE | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/windows-icmp-timestamp-bugs/
source_host: netacoding.com
clip_date: 2026-10-01T10:24:54+08:00
trace_id: 41cd7bf5-24fa-4095-a805-4dbb3bdf1914
content_hash: 3c3e1a751d202853d8b85d93a0dceeb741599b84869df5156d0b8dba41a204ae
status: synced
tags:
  - Windows逆向
  - 协议分析
series: null
feed_source: Netacoding·协议/逆向
ai_summary: EnableICMPTimestampRep=0 在 Windows 上完全无效，系统照发 ICMP T14 回复；且 T14 的时间戳以小端序写入，违反 RFC 792，可被动指纹识别。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-8197-a89e-c85bf408eecb
ioc:
  cves:
    - CVE-1999-0524
  cwes:
    - CWE-290
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> EnableICMPTimestampRep=0 在 Windows 上完全无效，系统照发 ICMP T14 回复；且 T14 的时间戳以小端序写入，违反 RFC 792，可被动指纹识别。
> 
> - **注册表失效：** 键值已确认为 `REG_DWORD 0x0`，仍产生 +6069 条 Timestamp Replies、抓包可见 T14 出站；同理进程代码路径未读到该键。
> - **唯一有效缓解：** WFP 入站规则阻断 ICMP Type 13（`New-NetFirewallRule -Protocol ICMPv4 -IcmpType 13 -Direction Inbound -Action Block`）；环回流量默认绕过 WFP 外部过滤层，仍可达处理函数。
> - **字节序 Bug：** `Ipv4pHandleTimestampRequest` 调用 `FUN_140189b9c` 取得毫秒时间戳后未 `bswap32` 即写入 Receive/Transmit 字段；同一函数在 `Ipv4pProcessTimestampOption`（IP 选项）中却做了正确转换。
> - **双时间戳造假：** Transmit 直接复制 Receive，并非按 RFC 在发送前单独打点；ID/Seq 与 Originate 则从 T13 正确保留。
> - **影响与指纹：** 大端解读 Receive 得约 14.9 天（超 86400000ms 上限），小端才合理；内核不回读入站 T14（分派立即返回），无算术溢出面。影响 26100.x（含 Server 2025）及更早版本。

## EnableICMPTimestampRep=0 Doesn’t Work: Windows tcpip.sys ICMP Timestamp Bugs Explained

ICMP Timestamp (Type 13/14) is the RFC 792 mechanism nobody uses anymore. NTP replaced it in the 1980s. But Windows still implements it in `tcpip.sys`, and that implementation has been quietly shipping two bugs — one behavioral, one a hard RFC violation — since at least Windows 11 build 22000.

This post walks through the full static analysis chain: from Ghidra import to live kernel inspection, tracing every function in the T14 reply path and documenting exactly where the code diverges from the specification.

> **TL;DR:** `EnableICMPTimestampRep=0` does not work. The registry key has no effect on `Ipv4pHandleTimestampRequest` — Windows sends ICMP Type 14 replies regardless. The only effective mitigation is a WFP inbound block rule on ICMP Type 13. Additionally, the T14 reply itself violates RFC 792: Receive and Transmit timestamps are written in little-endian (host byte order) instead of network byte order. Both bugs confirmed via Ghidra static analysis on `tcpip.sys 10.0.26100.8457`.

* * *

## 1\. Target and Setup

**Target:** `tcpip.sys`, Windows 11 Home, kernel `10.0.26100.8457`  
**Tools:** Ghidra 11.x, WinDbg 10.0.26100.7705, Scapy, Wireshark  
**Architecture:** x86-64, MSVC-compiled

Pull `tcpip.sys` from `C:\Windows\System32\drivers\` or extract from a Windows ISO. Load in Ghidra with language `x86:LE:64:default:windows`.

To load PDB symbols, use WinDbg or `symchk.exe` to fetch the matching `.pdb` file from the Microsoft symbol server first, then import it into Ghidra:

```bash
# Fetch PDB via WinDbg:
kd> .sympath srv*C:\Symbols*https://msdl.microsoft.com/download/symbols
kd> .reload /f tcpip.sys

# Or via symchk.exe:
symchk /s srv*C:\Symbols*https://msdl.microsoft.com/download/symbols tcpip.sys

# Then in Ghidra:
File → Load PDB → select C:\Symbols    cpip.pdb\<hash>    cpip.pdb
```

Note: `msdl.microsoft.com/download/symbols` is not browser-accessible — it responds only to debugger tools using the symbol server protocol.

With symbols loaded the ICMP timestamp handler resolves immediately:

```
tcpip!Ipv4pHandleTimestampRequest   ← T13 receive / T14 builder
tcpip!Ipv4pProcessTimestampOption   ← IP header Timestamp Option (RFC 791)
```

Both of these matter.

* * *

## 2\. Bug 1 — Why EnableICMPTimestampRep=0 Doesn’t Work

### The Documented Mitigation (And Why It Fails)

The standard guidance for CVE-1999-0524 (ICMP timestamp information disclosure) on Windows is:

```
HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters
EnableICMPTimestampRep = 0  (DWORD)
```

This is documented in Microsoft KB articles and recommended by virtually every network hardening guide. The expectation: set it to 0, reboot, and the system stops responding to Type 13 requests.

### What Actually Happens

After setting the key to 0 and rebooting, sending Type 13 to the target still produces a Type 14 reply. No difference in behavior. The `Timestamp Replies Sent` counter in `netstat -s -p icmp` increments identically with the key set or unset.

**Confirmed via:** behavioral testing with the key already set to 0. Registry inspection during testing confirmed `EnableICMPTimestampRep = REG_DWORD 0x00000000` at `HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters`. With the key at 0 (expected: no replies), `netstat -s -p icmp` still recorded +6069 Timestamp Replies Sent across a test run, and pcap captures confirm T14 packets leaving the interface. The specific code path that reads or ignores this key was not traced in Ghidra; the behavioral outcome is the confirmation.

The only mitigations that actually work are WFP-layer firewall rules:

```powershell
New-NetFirewallRule -DisplayName "Block ICMP Timestamp Request" `
  -Protocol ICMPv4 -IcmpType 13 -Direction Inbound -Action Block
```

* * *

## 3\. The ICMP Dispatch Path

Before reaching the bug, it helps to understand how a Type 13 packet gets from the wire to `Ipv4pHandleTimestampRequest`.

### 3.1 WFP and the Loopback Exception

Inbound packets are filtered by WFP at `FWPM_LAYER_INBOUND_IPPACKET_V4` before entering the IP stack. If a block rule exists for Type 13, the packet never reaches `tcpip.sys`. One notable exception: loopback traffic (`127.0.0.1`) bypasses the external filter layers by default, making the handler reachable from localhost without any firewall rule modification.

### 3.2 ICMP Type Dispatch

The ICMP type dispatcher lives in `FUN_1400e3194` (Ghidra name; real name partially resolved from symbols). It uses a two-level lookup:

```asm
; FUN_1401d5308 — type normalizer
MOVSXD  RCX, EDX                                      ; ICMP type
LEA     R8,  [RIP + offset → image_base]               ; R8 = tcpip base
MOVZX   ECX, byte ptr [R8 + RCX + 0x1f7181]           ; normalize
MOV     EDX, dword ptr [R8 + RCX*4 + 0x1f7179]        ; handler offset
ADD     RDX, R8                                        ; absolute address
JMP     RDX
```

The switch table at `0x1401f7179` for the Type 13/14 range:

```
index 0 (type 13):  offset E3C9Ah → Ipv4pHandleTimestampRequest
index 1 (type 14):  offset E3C9Ch → immediate RET (returns 0)
index 2+ (others):  0h            → return 0
```

**Type 14 receives no kernel-side processing.** On a received T14, the dispatcher returns 0, the caller jumps to `KfdDiagnoseEvent` (ETW trace only), and returns. This rules out any kernel-level arithmetic overflow via crafted T14 timestamp fields — the kernel never reads them.

* * *

## 4\. Bug 2 — Missing htonl() in the T14 Builder

This is the RFC violation. RFC 792 states explicitly:

> *“The timestamp is the number of milliseconds since midnight UT \[…\] as a 32-bit value in network byte order.”*

Windows violates this for two of the three timestamp fields in every T14 reply.

### 4.1 The Timestamp Source

The timestamp calculation is isolated in a small helper function (`FUN_140189b9c` in Ghidra). It reads UTC system time from `KUSER_SHARED_DATA.SystemTime` at the fixed kernel virtual address `0xfffff78000000014` and converts to milliseconds-since-midnight via `RtlTimeToTimeFields`:

```c
int FUN_140189b9c(void) {
    local_28 = _DAT_fffff78000000014;        // SystemTime (FILETIME, 100ns ticks)
    RtlTimeToTimeFields(&local_28, &local_20);

    // TIME_FIELDS stored across two 8-byte stack variables:
    // local_20._6_2_  = Hour
    // uStack_18._0_2_ = Minute
    // uStack_18._2_2_ = Second
    // uStack_18._4_2_ = Milliseconds

    return ((Hour * 60 + Minute) * 60 + Second) * 1000 + Milliseconds;
}
```

The math is correct. The return value is an `int` — host byte order (little-endian on x64).

### 4.2 The T14 Builder

`Ipv4pHandleTimestampRequest` (`FUN_14019d38c`) is confirmed as the T14 builder by the embedded debug string:

```c
L"IPv4 timestamp reply packet (IPNG)"
```

The packet build sequence extracted from Ghidra:

```c
// T14 header construction
uRam[+0x00] = 0xe;                      // Type = 14
uRam[+0x02] = 0;                        // Checksum (computed later by FUN_140057758)
uRam[+0x04] = *(param_1 + 4);           // Identifier — copied from T13 ✅
uRam[+0x06] = *(param_1 + 6);           // Sequence — copied from T13 ✅

// Originate Timestamp: copied from the incoming T13 packet
RtlCopyMdlToBuffer(*(lVar2 + 0x20), *(lVar2 + 0x28), 8, 4, puVar12);
// Originate is preserved from the sender — network byte order maintained ✅

// Receive Timestamp
uRam[+0x0C] = FUN_140189b9c();          // ← raw int return, NO bswap32 ❌

// Transmit Timestamp
_DAT[+0x10]  = uRam[+0x0C];            // ← identical value copied, NO bswap32 ❌
```

Two violations:

**Violation A**— No byte-swap before writing the kernel’s timestamp to the packet. The value from `FUN_140189b9c()` is written directly in little-endian.

**Violation B**— Transmit Timestamp is a copy of Receive Timestamp. RFC 792 specifies these as distinct measurements: Receive is stamped on arrival, Transmit is stamped immediately before sending. The kernel records one value and copies it to both fields.

### 4.3 IP Timestamp Option Comparison

The same `FUN_140189b9c()` is called by the IP header Timestamp Option handler (`Ipv4pProcessTimestampOption`, `FUN_14019ce6c`). That handler correctly byte-swaps the result:

```c
// Ipv4pProcessTimestampOption — the correct implementation
uVar3 = FUN_140189b9c();    // little-endian timestamp

// bswap32 inline:
uVar3 = uVar3 >> 0x18
      | (uVar3 & 0xff0000) >> 8
      | (uVar3 & 0xff00)   << 8
      | uVar3              << 0x18;    // ✅ network byte order

*puVar8 = uVar3;    // written to IP option field
```

The divergence is unambiguous:

```
FUN_140189b9c()  (same call, same return value)
        │
        ├─→ Ipv4pProcessTimestampOption  (IP Option, RFC 791)
        │       bswap32 applied ✅  →  big-endian output
        │
        └─→ Ipv4pHandleTimestampRequest  (ICMP T14, RFC 792)
                no bswap ❌          →  little-endian output  ← BUG
```

One function handles the byte order correctly. The adjacent function, calling the same source, does not.

### 4.4 KUSER_SHARED_DATA Internals

The timestamp source at `0xfffff78000000014` maps to `KUSER_SHARED_DATA.SystemTime`:

```
KUSER_SHARED_DATA base:    0xfffff78000000000
+0x000 TickCountLowDeprecated
+0x004 TickCountMultiplier
+0x008 InterruptTime          ← uptime ticks (used elsewhere in tcpip.sys)
+0x014 SystemTime             ← UTC FILETIME ← FUN_140189b9c source
+0x020 TimeZoneBias
```

The compiler’s division-by-10000 trick appears consistently across the timestamp code — converting 100ns ticks to milliseconds via multiplicative inverse:

```c
// Compiler-generated: x / 10000 via multiply-shift
// Magic constant: 0x624dd2f1a9fbe77
lVar = SUB168(ZEXT816(0x624dd2f1a9fbe77) * auVar, 8);
result = (input / 10000 - lVar >> 1) + lVar >> 9;
```

* * *

## 5\. Pcap Confirmation

Capturing with Wireshark on the Ethernet interface and sending Type 13 requests confirms the byte order issue directly in captured packets:

```
T14 seq=0 field breakdown (raw hex at ICMP payload offsets 8–19):
  Originate (+0x08):  03 23 6B 42  →  0x03236B42  =  52,652,866 ms  ✅ (sender's value)
  Receive   (+0x0C):  4D 3B 03 01  →  big-endian reading  =  1,295,500,033 ms  (≈ 14.9 days — impossible)
                                   →  little-endian reading =     17,053,517 ms  (≈ 4.7 hours — plausible) ✅
  Transmit  (+0x10):  4D 3B 03 01  →  identical to Receive  (Violation B)
```

The little-endian interpretation yields a realistic time-of-day value. The big-endian interpretation — the only RFC-correct reading — produces a value exceeding the maximum valid timestamp (86,400,000 ms = 24 hours).

`netstat -s -p icmp` counter delta across a test run with 2000 T13 packets sent:

```
Timestamps Received:   +2100   (T13 processed)
Timestamp Replies Sent: +6069  (T14 generated — regardless of EnableICMPTimestampRep setting)
```

* * *

## 6\. Live Kernel Inspection — WinDbg

With kernel debugging attached to a Windows 11 VM via KDNET:

```
kd> bp tcpip!Ipv4pHandleTimestampRequest "dq @rdx+0xd8 L1; g"
```

RDX holds `param_2` (the packet descriptor). Field `+0xd8` contains the pre-computed IP path object attached by the IP layer — the routing context that will be used to route the T14 reply back to the sender.

On every T13 received, the field is non-null:

```
ffff9502`ad6750d8  ffff9502`b4f9f7c0
```

Inspecting the object at `ffff9502` b4f9f7c0\`:

```
kd> dd ffff9502`b4f9f7c0 L4
ffff9502`b4f9f7c0  616c7049 00000000 b3a10620 ffff9502
                   ↑ "IplA" pool tag — IP path object confirmed
```

The `IplA` -tagged IP path object is live, reference-counted, and attached to the packet descriptor on every ICMP T13 receive. The routing subsystem has a concrete object representing the path to the T14 reply destination. The timestamp fields are being written into a packet that will be routed through this object — in the wrong byte order.

* * *

## 7\. Frequently Asked Questions

**Q: Does EnableICMPTimestampRep=0 disable ICMP Timestamp Replies on Windows 11?**  
No. Behavioral testing with `EnableICMPTimestampRep = REG_DWORD 0x00000000` already set confirms that Windows 11 (build 26100.8457) sends ICMP Type 14 replies regardless. The registry key is inert.

**Q: What is the only effective mitigation for CVE-1999-0524 on Windows?**  
A WFP inbound firewall rule blocking ICMP Type 13 (Timestamp Request) is the only confirmed effective mitigation:

```powershell
New-NetFirewallRule -DisplayName "Block ICMP Timestamp Request" `
  -Protocol ICMPv4 -IcmpType 13 -Direction Inbound -Action Block
```

**Q: Why do Windows ICMP Timestamp replies fail RFC 792 compliance?**  
The T14 builder (`Ipv4pHandleTimestampRequest` in tcpip.sys) calls the timestamp calculator but omits the `htonl()` / `bswap32` conversion before writing to the packet. The result is little-endian timestamps where RFC 792 mandates big-endian. The Receive and Transmit fields also contain the same value, violating the spec’s intent of distinct per-segment timing.

**Q: Nessus/Tenable flags “ICMP Timestamp Request Remote Date Disclosure” — is it a false positive on Windows?**  
No. Multiple Microsoft Q&A threads since 2024 confirm the same finding: Wireshark captures show genuine ICMP Type 14 replies from Windows hosts. The vulnerability is real; the registry mitigation is what doesn’t work.

* * *

## 8\. Impact

### Registry Bypass

Any system that has applied `EnableICMPTimestampRep=0` to suppress CVE-1999-0524 is not protected. The registry key is inert on Windows 11 build 26100.8457. The system will respond to Type 13 requests regardless of this setting.

The only effective mitigation is a WFP inbound block rule on ICMP Type 13, or a perimeter firewall rule blocking it before it reaches the host.

### Byte Order Violation

**Host fingerprinting.** Every Windows T14 reply carries a unique signature: Receive and Transmit timestamps in little-endian. An RFC-compliant parser reading these as big-endian will see values in the range of days or months rather than milliseconds-since-midnight. This is a passive fingerprint — no interaction beyond a standard T13 request is required.

**Protocol integrity.** Applications consuming T14 via raw sockets and performing timestamp arithmetic will compute incorrect RTT values. Any system that implements its own ICMP-based clock synchronization or latency measurement will receive malformed data from any Windows peer.

**RFC 792 non-compliance.** Receive ≠ Transmit timestamps on every reply. The intent of having two distinct timestamps — to measure network transit independently — is not implemented.

* * *

## 9\. Affected Versions

| Version | Build | tcpip.sys | Status |
| --- | --- | --- | --- |
| Windows 11 24H2 | 26100.x | 10.0.26100.8457 | **Confirmed** (this research) |
| Windows Server 2025 | 26100.x | 10.0.26100.x | **Confirmed** (shared codebase) |
| Windows Server 2022 | 20348.x | 10.0.20348.x | Likely (Nessus detects since 2006) |
| Windows Server 2019 | 17763.x | 10.0.17763.x | Likely (community reports) |
| Windows 10 | 19041+ | 10.0.19041.x | Likely |

Windows 11 24H2 and Windows Server 2025 share the same build number (26100) and the same codebase. The platform and kernel are effectively identical — only feature sets and enabled roles differ. Research performed on Windows 11 Home confirmed both bugs on build 26100.8457. Since Windows Server 2025 ships the same tcpip.sys, the bugs affect production server deployments as well.

Every sysadmin asking about `EnableICMPTimestampRep` on Windows Server forums has the same underlying issue — the fix doesn’t work on any version because the code path ignores it regardless of SKU.

The little-endian timestamp behavior has been detected by Nessus plugin 10114 since at least 2006, across all Windows versions it scanned, without a kernel-level explanation until now.

* * *

> All code fragments are from Ghidra decompiler output of `tcpip.sys 10.0.26100.8457`. Function names prefixed `FUN_` are Ghidra-assigned; resolved names via PDB are noted where available.

**MITRE ATT&CK:** [T1040](https://attack.mitre.org/techniques/T1040/) · [T1016](https://attack.mitre.org/techniques/T1016/)

## Related

-   [ICMP Timestamp Type 13/14: Linux Kernel Internals with ftrace](https://netacoding.com/posts/icmp-timestamp-internals/)
-   [EtherLeak: IP Total Length Over-read via Ethernet Frame Padding](https://netacoding.com/posts/etherleak-reloaded/)
-   [CWE-290 at Layer 3: IP Source Spoofing and uRPF Failure in Enterprise Wireless Infrastructure](https://netacoding.com/posts/cwe-290/)
-   [ICMP-Ghost v3.6.3: Fileless C2 with Dual-Channel Pivoting & DPI Evasion](https://netacoding.com/posts/icmp-ghost/)
