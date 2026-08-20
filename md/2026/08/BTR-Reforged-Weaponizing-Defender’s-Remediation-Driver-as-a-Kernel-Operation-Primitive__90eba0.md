---
title: "BTR Reforged: Weaponizing Defender’s Remediation Driver as a Kernel Operation Primitive"
source: https://research.checkpoint.com/2026/btr-reforged-weaponizing-defenders-remediation-driver-as-a-kernel-operation-primitive/
source_host: research.checkpoint.com
clip_date: 2026-08-20T21:23:26+08:00
trace_id: 026b0d76-2d0f-4a41-9b49-15ba096f7737
content_hash: d723954b48daf15627da2943749b23d7503bb25b548189c90586a7d88a4a328b
status: synced
tags:
  - Windows逆向
  - LOLDriver
series: null
feed_source: Check Point Research
ai_summary: "TL;DR: Windows Defender的BTR.sys启动清理驱动可被构造为Ring 0文件/注册表操作原语，借启动顺序差绕过EDR/AV。"
ai_summary_style: key-points
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 3c275244-d011-81ef-8cf9-df27f2e84d2b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR: Windows Defender的BTR.sys启动清理驱动可被构造为Ring 0文件/注册表操作原语，借启动顺序差绕过EDR/AV。
> 
> - **逆向成果：** BTR.sys的RC4配置密钥为固定256字节，在超过15年的18个微软签名版本中保持一致；配置数据存于ADS（如`:changelist`），并带修正CRC32（~CRC32）完整性校验。
> - **操作原语：** 支持6种Action，包括删除文件/目录（Action 1/2）、移动文件（Action 3，可作任意写入）、删除注册表键/值（Action 4/5）及写入注册表（Action 6）。
> - **攻击场景：** BTR_CLI工具会自动提取本机MpEngine.dll内嵌的BTR.sys，构造加密事务，创建随机服务名并通过NtLoadDriver加载；执行成功后驱动以STATUS_DELETE_PENDING返回码自卸载并清理自身日志。
> - **启动窗口：** 配置为Start=1、组"Boot Bus Extender"时，BTR.sys在Phase 1早期执行，早于MsMpEng.exe约34秒、WdNisDrv约4分钟，可先删除Defender二进制或注册表键，实现Tamper Protection绕过。
> - **检测与结论：** 可用Sysmon事件ID 15（:changelist ADS）、ID 23（System PID 4删除安全文件）、ID 6（驱动来源异常）等检测；MSRC认定需SeLoadDriverPrivilege，不构成漏洞，将其归类为LOLDriver。

## Abstract

What if a **trusted security component** could be repurposed into an **attacker-controlled** kernel primitive? What if a **signed Microsoft remediation driver** could be instructed to execute arbitrary **file** and **registry** operations from **Ring 0** – **without** exploits, vulnerabilities, or memory corruption?

In this publication, we present the first full reverse engineering of the **Windows Defender Boot-Time Removal driver** (`BTR.sys`) and its proprietary transaction format. We dissect its encrypted configuration mechanism, integrity validation logic, and execution pipeline, and demonstrate how this legitimate remediation component can be transformed into a **universal kernel operation** engine. We introduce `BTR_CLI`, a **research tool** that constructs valid encrypted transactions and safely exercises the driver’s functionality to demonstrate its capabilities.

Furthermore, we demonstrate how `BTR_CLI` can be used as an **EDR/AV** bypass technique, disarming security solutions while using a **trusted Windows built-in**, **Microsoft-signed** driver, thus **not relying** on typical **BYOVD** techniques.

Our research reveals how trusted security infrastructure can unintentionally expose powerful primitives, what this means for defenders, and how **similar patterns** may exist in **other signed remediation** components. This work blends reverse engineering, kernel internals, and detection engineering into a practical case study of **when defensive technology becomes offensive capability**.

## Introduction

This research originated during an incident response investigation involving a compromised system, where certain endpoint telemetry appeared suspicious but was ultimately traced back to legitimate Windows Defender remediation activity. During analysis, a driver (internally identified as `BTR.sys`) appeared on disk under `System32\drivers` with a randomized filename and a corresponding randomized service name (`HKLM\SYSTEM\CurrentControlSet\Services\mzqnjtaq`), accompanied by the following registry entries:

| **Value Name** | **Value Type** | **Data** |
| --- | --- | --- |
| **Type** | `REG_DWORD` | `1` (Kernel Driver) |
| **Start** | `REG_DWORD` | `1` (System Start) |
| **ErrorControl** | `REG_DWORD` | `0` (Ignore) |
| **ImagePath** | `REG_EXPAND_SZ` | `\\??\C:\Windows\system32\drivers\mzqnjtaq.sys` |
| **Group** | `REG_SZ` | `Boot Bus Extender` |
| **Args** | `REG_SZ` | `C:\Windows\system32\drivers\mzqnjtaq.sys:changelist` |

At first glance, several characteristics resembled attacker tradecraft:

-   A randomly named driver dropped shortly before reboot
-   Creation of a transient service entry for loading it
-   Presence of RC4 encryption routines
-   Interaction with an Alternate Data Stream (`:changelist`) attached to the driver file
-   Self-cleanup behavior after execution

These indicators strongly resembled malicious kernel loader behavior, particularly given prior research into exotic loading mechanisms such as loading kernel drivers directly from ADS paths – a technique often considered theoretical yet has proven practical.

The most unusual aspect was that the ADS stream contained an encrypted binary structure used as configuration input for the driver. Encountering a Microsoft-signed driver relying on an ADS-stored encrypted configuration immediately raised suspicion that it might be exploitable or abused by attackers. Our initial hypothesis was that the threat actor had leveraged this driver for post-exploitation activity. That hypothesis ultimately proved incorrect: the behavior was legitimate Defender remediation logic.

However, that discovery triggered a deeper analysis of `BTR.sys` and the surrounding remediation architecture. What began as a false-positive investigation quickly evolved into a full reverse-engineering effort that uncovered undocumented functionality, a custom protocol, and an unexpectedly powerful kernel execution model.

## Technical Analysis: The BTR Driver

### Driver Overview

-   **Filename:** `BTR.sys`

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5949b444db3f99ea.png)

Figure 1: “BTR.sys” driver – Boot Time Removal Tool.

-   **Origin:** Embedded as a PE resource within `MpEngine.dll`. It is dropped to disk (with a randomized filename matching `[a-z]{8}.sys`, e.g., `mzqnjtaq.sys`) only when a remediation action requires a reboot (e.g., deleting a locked file).

![](https://research.checkpoint.com/wp-content/uploads/2026/08/QHX6JJP7MQ-image6-1024x483.png)

Figure 2: “MpEngine.dll” with embedded “BTR.sys” as a PE resource.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b18633c90eb03d4f.png)

Figure 3: “MpEngine.dll” dropping “BTR.sys” from the embedded “BOOTTIMETOOL” resource.

-   **Behavior:** It is a “ *one-shot* ” driver. It loads, performs a list of transactions, reports status, and immediately requests self-unloading.

### The Configuration Mechanism

The driver does not expose a standard IOCTL interface. Instead, it reads a configuration blob pointed to by the `Args` value in its Service Registry Key.

-   **Registry Path:** `HKLM\SYSTEM\CurrentControlSet\Services\{Random}\Args`

![](https://research.checkpoint.com/wp-content/uploads/2026/08/QHX6JJP7MQ-image8-1024x232.png)

Figure 4: “BTR.sys” initialization logic querying the “Args” service value to locate the configuration.

-   **Format:** A file path to an Alternate Data Stream (e.g., `C:\Windows\system32\drivers\BTR.sys:changelist`) containing RC4-encrypted binary data.

![](https://research.checkpoint.com/wp-content/uploads/2026/08/QHX6JJP7MQ-image9-1024x180.png)

Figure 5: “MpEngine.dll” constructing the configuration path by explicitly appending the “:changelist” ADS.

### Cryptography & Integrity

The configuration blob is protected by both encryption and integrity checks to prevent tampering.

-   **Encryption: RC4** Stream Cipher.
    -   **Key:** A hard-coded 256-byte key embedded in the `.rdata` section of the driver (this key appears to be consistent across various `BTR.sys` driver versions).

![](https://research.checkpoint.com/wp-content/uploads/2026/08/QHX6JJP7MQ-image10-1024x641.png)

Figure 6: “BTR.sys” RC4 decryption of configuration using a hard-coded 256-byte key in “.rdata”.

-   **Integrity: Modified CRC-32 (**`~CRC32`**)**.
    -   The driver uses the standard CRC-32 polynomial (`0xEDB88320`) and initialization (`0xFFFFFFFF`). However, it deviates from the standard implementation by **omitting the final bitwise inversion** (Final XOR) step. Consequently, the resulting value is mathematically equivalent to the bitwise inverse of a standard CRC-32 (denoted as `~CRC32` in the tables in the next section below).
    -   **Independence:** Integrity checks are **non-cumulative**. The CRC register is reset to the initial value (`0xFFFFFFFF`) for every individual structure (Global Header, Global Payload, Item Header, and Item Data). This design isolates the validation of each component, effectively **preventing CRC chaining manipulation** where modifying one structure could impact the validity of subsequent structures.

![](https://research.checkpoint.com/wp-content/uploads/2026/08/QHX6JJP7MQ-image11-1024x757.png)

Figure 7: “BTR.sys” CalcCRC32 function → ~CRC32(Buffer, Size).

## The Transaction Structure

The RC4-decrypted payload (configuration blob) is a serialized list of actions. Through reverse engineering, we have mapped the structure entirely (notably, the `PDB` for `BTR.sys` is not provided by Microsoft).

![Figure 8: Transaction Structure Format → The Configuration.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a70ce64e2b95a0bb.png)

Figure 8: Transaction Structure Format → The Configuration.

### Global Header (24 Bytes)

The file starts with a fixed header that defines the session.

| **Offset** | **Size** | **Field** | **Description** |
| --- | --- | --- | --- |
| `0x00` | 4   | `Magic` | `0xFEE1DEAD` (Little Endian) |
| `0x04` | 4   | `Version` | `0x00000002` |
| `0x08` | 4   | `PayloadOffset` | `0x00000010` (Relative offset from this field to the Global Payload; constant) |
| `0x0C` | 4   | `GlobalCRC` | `~CRC32` of the Header (with this field zeroed) |
| `0x10` | 8   | `TransID` | Composite ID: Low 4 bytes = `~CRC32(Payload)`, High 4 bytes = `Size(Payload)` |

The table above can be represented as the following C structure:

```cpp
struct GLOBAL_HEADER {
    uint32_t Magic;         // 0xFEE1DEAD
    uint32_t Version;       // 2
    uint32_t PayloadOffset; // 0x10 (relative offset to Global Payload)
    uint32_t GlobalCRC;     // ~CRC32(Header)
    uint32_t TransID_Low;   // ~CRC32(Payload)
    uint32_t TransID_High;  // Size(Payload)
};
```

### Global Payload (Variable)

It immediately follows the header.

-   **Content:** A null-terminated Unicode string.
-   **Purpose:** The **Feedback File** path (e.g., `\??\C:\ProgramData\...\mzqnjtaq.dat`). The driver creates this file and writes a **Transaction Execution Report**. This report mostly mirrors the structure of the input configuration but updates the first 4 bytes of each Item’s Data payload (`[Flags]`) with the **NTSTATUS** code resulting from that specific operation.

### Item Structure (The Action)

Following the Global Payload is a list of Operation Items.

**Item Header (16 Bytes):**

| **Offset** | **Size** | **Field** | **Description** |
| --- | --- | --- | --- |
| `0x00` | 4   | `DataSize` | Size of the Item Data (including padding) |
| `0x04` | 4   | `ActionID` | The operation to perform (see Section below) |
| `0x08` | 4   | `HeaderCRC` | `~CRC32` of this header (calculated with this field zeroed) |
| `0x0C` | 4   | `DataCRC` | `~CRC32` of the Item Data |

The table above can be represented as the following C structure:

```cpp
struct ITEM_HEADER {
    uint32_t DataSize;      // Size of Item Data
    uint32_t Action;        // Action ID
    uint32_t HeaderCRC;     // ~CRC32(Header)
    uint32_t DataCRC;       // ~CRC32(Data)
};
```

**Item Data (Variable):**

The structure of the data depends on the Action ID. For complex actions (3-6), it starts with a Flags field; for simple actions (1-2), it starts immediately with the path. It generally follows:

`[Flags (Optional 4 bytes)] [String 1] [String 2] ... [Padding]`

-   **Padding (Reserved Space):** The driver requires exactly **4 null bytes** appended to the end of the Item Data.
    -   *Technical Note:* This is not for alignment. For simple actions (like File Deletion) which lack a leading 4-byte `[Flags]` field, the driver utilizes this reserved space to generate the feedback report. It shifts the string data by 4 bytes into this padding area to create room at the beginning of the buffer for the **NTSTATUS** code, avoiding memory reallocation.

## Weaponized Primitives (Action IDs)

We have identified and implemented the following `Action IDs` in the `BTR_CLI` tool:

### File Operations

-   **Action 1: Delete File**
    -   **Structure:** `[Path]`
    -   **Effect:** Kernel-level deletion. Bypasses exclusive file locks.
-   **Action 2: Delete Directory**
    -   **Structure:** `[Path]`
    -   **Effect:** Removes an empty directory.
-   **Action 3: Move / Quarantine**
    -   **Structure:** `[Flags] [Source Path] [Dest Path]`
    -   **Effect:** Moves a file.
    -   **Weaponization:** If `Dest Path` is empty, this acts as a **Delete** operation. If `Dest Path` is valid, this allows **Arbitrary File Write/Move** (e.g., dropping a malicious DLL into System32).

### Registry Operations

-   **Action 4: Delete Key**
    -   **Structure:** `[Flags] [Key Path]`
    -   **Effect:** Deletes a registry key and its subkeys.
-   **Action 5: Delete Value**
    -   **Structure:** `[Flags] [Key Path + "\\" + Value Name]`
    -   **Critical Finding:** The driver parses the string by searching for a **double backslash** (`\\`) to split the Key from the Value. Standard paths fail; specific formatting is required.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3afc6a23575c4d6b.png)

Figure 9: “BTR.sys” Action 5 – double backslash “\\\\” parser.

-   **Action 6: Set Value**
    -   **Structure:** `[Flags] [Type] [Size] [Key Path + "\\" + Value Name] [Data]`
    -   **Effect:** Arbitrary Registry Write + Registry Creation.
    -   **Weaponization:** Can be used to establish persistence (Run keys, Services) or disable security controls (Tamper Protection, EDR configs). Creates not only a value but possibly the registry key path itself.

## Operational Findings & Anti-Forensics

### The “Success” Error Code

A unique trait of `BTR.sys` is its return value upon successful execution. It returns `0xC0000056` (`STATUS_DELETE_PENDING`) instead of `STATUS_SUCCESS`.

![Figure 10: “BTR.sys” successful execution → STATUS\_DELETE\_PENDING.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/19b2bfe209dd8c24.png)

Figure 10: “BTR.sys” successful execution → STATUS_DELETE_PENDING.

-   **Reason:** This signals the Windows Kernel to immediately unload the driver and mark the driver object for deletion, ensuring it does not persist in memory.

### Anti-Forensics (Log Cleaning)

The driver creates a text log at `\SystemRoot\Temp\BootClean.log`.

![Figure 11: “BTR.sys” DriverEntry - “BootClean.log” file creation.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1c7fb63026f4c3b2.png)

Figure 11: “BTR.sys” DriverEntry – “BootClean.log” file creation.

-   **Technique:** The `BTR_CLI` tool automatically injects an **Action 1** item at the start of the transaction list targeting `BootClean.log`.
-   **Result:** The driver creates the log, performs the user’s action, and then **deletes its own log file** before unloading. This leaves minimal forensic traces.

## BTR.sys Driver Versions

To obtain a comprehensive overview of different `BTR.sys` driver versions, we searched public repositories such as [VirusTotal](https://www.virustotal.com/gui/search/signature%253A%2522Boot%2520Time%2520Removal%2520Tool%2522%2520tag%253Asigned%2520tag%253A64bits) and [Winbindex](https://winbindex.m417z.com/?file=mpengine.dll) (by locating `MpEngine.dll`, which embeds the `BTR.sys` driver). Using Winbindex, we identified exactly 12 different versions of 64-bit `MpEngine.dll` across all available Windows 10 and Windows 11 releases.

![Figure 12: Winbindex search - “MpEngine.dll”.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/563845f0cf3761fd.png)

Figure 12: Winbindex search – “MpEngine.dll”.

Extracting the embedded `BTR.sys` from these 12 `MpEngine.dll` versions resulted in 5 unique driver builds (based on distinct SHA-256 hashes).

![Figure 13: Unique “BTR.sys” drivers extracted from “MpEngine” dlls (Winbindex).](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/12401233dd84af67.png)

Figure 13: Unique “BTR.sys” drivers extracted from “MpEngine” dlls (Winbindex).

Combining these 5 builds with distinct `BTR.sys` samples (unique SHA-256 hashes) identified on VirusTotal at the time of analysis, and after de-duplication against the Winbindex dataset, we obtained a total of **18 unique 64-bit Microsoft-signed versions** (distinct Authentihashes) of the `BTR.sys` driver. Analysis confirmed that **all versions share the same hard-coded 256-byte RC4 key** used to decrypt the transaction structure (configuration blob).

```
1E 87 78 1B 8D BB A8 44 CE 69 70 2C 0C 78 B7 86 
A3 F6 23 B7 38 F4 ED F9 AF 83 53 0F B3 FC 54 FA 
A2 1E B9 CF 13 32 FD 0F 0D A9 54 F6 87 CB 9E 18 
27 96 97 90 0E 54 FB 31 7C 9C BC E4 8E 23 D0 53 
71 EC C1 59 51 B7 F3 64 9D 7C A3 3E D6 8D C9 04 
7E 82 C9 BA AD 96 99 D0 D4 58 CB 84 7C A9 FF BE 
3C 8A 77 52 33 55 7D DE 13 A8 B1 40 87 CC 1B C8 
F1 0F 6E CD D0 83 A9 59 CF F8 4A 9D 1D 50 75 5E 
3E 19 18 18 AF 23 E2 29 35 58 76 6D 2C 07 E2 57 
12 B2 CA 0B 53 5E D8 F6 C5 6C E7 3D 24 BD D0 29 
17 71 86 1A 54 B4 C2 85 A9 A3 DB 7A CA 6D 22 4A 
EA CD 62 1D B9 FB A2 2E D1 E9 E1 1D 75 BE D7 DC 
0E CB 0A 8E 68 C2 FF 12 63 40 8D C8 08 DF FD 16 
4B 11 67 74 CD 6B 9B 8D 05 41 1E D6 26 2E 42 9B 
A4 95 67 6B 83 98 DB 2F 35 D3 C1 B9 CE D5 26 36 
F2 76 5E 1A 95 CB 7C A4 C3 DD AB DD BF F3 82 53
```

Furthermore, the transaction structure format is consistent across all analyzed versions and supports all identified Action IDs. This consistency makes the `BTR_CLI` tool (provided in the next section) a universal, reliable, and reusable component across all tested Windows OS builds → from Windows 7 Build 7601, through Windows 8.1 and Windows 10 22H2, up to the latest Windows 11 25H2 **at the time of writing** (**July 2026**).

## The Tool: BTR_CLI

The `BTR_CLI` tool serves as a fully functional Proof-of-Concept (PoC) demonstrating the offensive utility of the Microsoft Boot Time Removal driver (`BTR.sys`). The [source code](https://github.com/Dump-GUY/BTR_CLI) implements a complete exploitation chain that mimics the native behavior of `MpEngine.dll` while extending its capabilities for research and red-teaming purposes.

![Figure 14: The “BTR\_CLI” tool - 6 stage pipeline.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a9e357cb025e69a3.png)

Figure 14: The “BTR_CLI” tool – 6 stage pipeline.

The tool performs the following sequence of operations:

1.  **Driver Extraction:** It automatically locates and extracts the legitimate `BTR.sys` driver from the local `MpEngine.dll` resource section. If the DLL is unavailable (cannot be found) or the hard-coded RC4 key inside the DLL has changed, it falls back to an embedded driver version (the latest one confirmed to be supported).
2.  **Stealth Configuration (ADS):** Instead of creating visible configuration files, the tool utilizes **Alternate Data Streams (ADS)**. It generates a randomized filename for the driver (e.g., `Random.sys`) and writes the encrypted transaction payload directly into `Random.sys:changelist`. The feedback path is similarly set to `Random.sys:Random.dat`.
3.  **Payload Construction:** It constructs a custom RC4-encrypted payload containing the specific remediation instructions (the config). This includes calculating the correct CRC32 checksums and padding required by the driver to accept the configuration.
4.  **Action Chaining:** The tool supports chaining multiple operations into a single execution transaction. By default, it injects an anti-forensics action to delete its own log file (`BootClean.log`), followed by any user-defined actions (e.g., file deletion, registry modification, etc.).
5.  **Service Creation & Triggering:**
    -   **Runtime Execution (**`trigger now`**):** Creates a service with a randomized name and loads the driver immediately via `NtLoadDriver`.
    -   **Boot Execution (**`trigger boot`**):** Configures the service with `Start=1` (System) and Group `Boot Bus Extender` to execute during the early boot phase, bypassing active EDR/AV protections.
6.  **Cleanup:** It automatically unloads the driver and removes all artifacts (Service Registry Key, Driver File, and ADS streams) after execution.

### Usage:

![Figure 15: The “BTR\_CLI” tool - usage.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/38107094528e2dc6.png)

Figure 15: The “BTR_CLI” tool – usage.

### Source Code:

The [source code of BTR_CLI](https://github.com/Dump-GUY/BTR_CLI), with its ready-to-run executables (both **x64** and **x86**, each self-contained with the embedded `BTR.sys` fallback), is [available here](https://github.com/Dump-GUY/BTR_CLI), MIT licensed.

The `BTR_CLI` tool underwent robust testing across a comprehensive range of Windows operating systems, spanning from Windows 7 Build 7601 (released in 2011), through Windows 8.1 and Windows 10 22H2, up to the latest fully updated Windows 11 25H2 (**as of July 2026**). Testing confirmed the tool’s ability to successfully execute all supported `BTR.sys` capabilities (Action IDs) across every version. Notably, while the tool includes an embedded fallback driver, this redundancy was never required during testing; the target-specific `BTR.sys` was successfully extracted from the local `MpEngine.dll` in every instance. This capability allows the tool to operate without introducing external binaries, effectively avoiding BYOVD-like scenarios. These findings highlight a remarkable consistency in the internal `BTR.sys` codebase – retaining the same hard-coded RC4 key and configuration structure for over 15 years.

## The “Golden Window” of Opportunity: Exploiting the BTR.sys Driver for EDR/AV Neutralization

![Figure 16: The “Golden Window” - Filesystem Ready & Security Stack Dormant.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6ba18a83403b05cd.png)

Figure 16: The “Golden Window” – Filesystem Ready & Security Stack Dormant.

### The Operational Constraint: Why Start=0 is Impossible

The operational premise of `BTR.sys` suggests a capability to execute during the earliest stages of the operating system boot process. However, empirical testing confirms a hard architectural constraint: `BTR.sys` cannot function as a `SERVICE_BOOT_START` (`Start=0`) driver.

While standard EDR kernel minifilters utilize `Start=0` to register callbacks immediately upon kernel initialization, `BTR.sys` was designed by Microsoft to perform file I/O operations (reading the ADS configuration and creating logs) directly within its `DriverEntry` routine. During **Phase 0** of the boot process, the Windows Object Manager has not yet established the `SystemRoot` symbolic link (used by `BTR.sys`), and the storage stack is not fully initialized. Consequently, forcing `BTR.sys` to `Start=0` results in immediate failure.

Therefore, the driver must be configured as `SERVICE_SYSTEM_START` **(**`Start=1`**)**. To maximize its offensive utility, it is assigned to the “ **Boot Bus Extender** ” load order group. This configuration places it at one of the **earliest practical execution slots** available in **Phase 1**, immediately following the initialization of the filesystem (`Ntfs.sys`) and the transition from the OS Loader to the Kernel I/O Manager. Notably, this configuration mirrors the exact mechanism `MpEngine.dll` employs to stage the driver during a legitimate Windows Defender remediation event.

### Load Order Analysis & Service Group Priority

The Windows Kernel enforces a strict temporal hierarchy by scanning the `ServiceGroupOrder` registry key in two distinct passes. First, the OS Loader loads **all** `Start=0` (Boot) drivers during **Phase 0**. Once **Phase 0** concludes, the Kernel I/O Manager scans the list again to load `Start=1` (System) drivers during **Phase 1**. It is within this specific phase that the **“Boot Bus Extender”** group provides a strategic advantage. While `Start=0` security filters (e.g., `WdFilter`) are already active, `BTR.sys` executes at the very beginning of **Phase 1**, effectively preempting other critical security drivers (e.g., `UCPD`, `WdNisDrv`) that reside in lower-priority groups like “ **FSFilter Activity Monitor** ” (see the default Windows 11 25H2 `ServiceGroupOrder`):

```sql
System Reserved
EMS
WdfLoadGroup
Boot Bus Extender             <-- BTR.sys executes here (Start=1)
... (23 Groups) ...
FSFilter Replication
FSFilter Anti-Virus           <-- WdFilter (the Group is lower, but Start=0)
FSFilter Undelete
FSFilter Activity Monitor     <-- UCPD.sys (Start=1)
... (24 Groups) ...
NDIS                          <-- Network Drivers
... (14 Groups) ...
```

This architectural positioning creates a “ **Golden Window** ” – a specific timeframe where the filesystem is writable, but high-level security services and user-mode protection agents have not yet started.

### Boot Logging Verification (Procmon Analysis)

Boot-time logging via Process Monitor provided definitive proof of this execution timeline. The events captured during a reboot cycle on a fully updated Windows 11 25H2 environment revealed the following sequence. Note that while Procmon’s boot logging may introduce slight latency, the **relative order of execution** is architecturally deterministic and remains consistent.

![Figure 17: Procmon - boot-time logging.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/00ee44f83c5ab8f3.png)

Figure 17: Procmon – boot-time logging.

**Phase 0: Kernel Initialization (Start=0 Boot)**  
The kernel initializes the filesystem and early-launch security drivers.

-   `2:45:28.3130411 AM` – `WdBoot.sys` (Defender ELAM Boot Driver) loads.
-   `2:45:28.3130685 AM` – `WdFilter.sys` (Defender Minifilter) loads.
-   `2:45:28.3130700 AM` – `Ntfs.sys` (Filesystem) loads.
    -   *Observation:* Security filters are active, but operating in a **limited standalone capacity** without real-time user-mode intelligence.

**Phase 1: The “Golden Window” (Start=1 System)**  
The kernel transitions to System Start. `BTR.sys` (renamed `mlrmqchs.sys` for testing) executes immediately due to its “ **Boot Bus Extender** ” group.

-   `2:45:28.6353170 AM` – `mlrmqchs.sys` **(BTR Driver)** loads.
    -   *Action:* The driver executes its payload (file/registry modification) here.
-   `2:45:28.6915450 AM` – `UCPD.sys` (User Choice Protection Driver) loads.
    -   *Result:* The **BTR** driver preempts **UCPD**, allowing modification of protected user choice registry keys before the protection driver is loaded.

**Phase 2: User Mode Initialization (Start=2 Automatic / Start=3 Manual)**  
The Service Control Manager (**SCM**) begins starting services. This occurs significantly later.

-   `2:46:02.7308562 AM` – `MpDefenderCoreService.exe` loads.
-   `2:46:02.9603201 AM` – `MsMpEng.exe` (Defender Service) loads.
    -   *Result:* The primary AV service starts roughly **34 seconds** after the BTR driver has finished its work.
-   `2:49:23.4912735 AM` – `WdNisDrv.sys` (Network Inspection Driver) loads.
    -   *Result:* The network inspection driver, triggered on-demand by the platform, loads nearly **4 minutes** later.

### EDR/AV Bypass Capabilities

By exploiting this load order gap, `BTR.sys` functions as a potent neutralizer for security solutions, including Microsoft Defender and potentially third-party EDRs.

-   **Filesystem Neutralization:** Although `WdFilter` is already loaded, the absence of the user-mode service (`MsMpEng.exe`) renders it susceptible to “legal” operations performed by a signed Microsoft kernel driver. Tests confirmed the successful deletion of example protected binaries such as `WdFilter.sys`, `MsMpEng.exe` and `WdNisDrv.sys` during boot. Since the `MsMpEng.exe` service binary is removed **significantly before** the Service Control Manager even attempts to launch it, the security solution fails to start entirely, preventing self-healing, cloud reporting, etc.

![Figure 18: EDR/AV Bypass - Filesystem Neutralization.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b7421c40623fbaf4.png)

Figure 18: EDR/AV Bypass – Filesystem Neutralization.

-   **Registry Tamper Protection Bypass:** Tamper Protection is primarily enforced against user-mode processes. `BTR.sys`, operating in kernel mode, successfully deleted critical Service Registry keys (e.g., `HKLM\SYSTEM\CurrentControlSet\Services\WdFilter`) during runtime. This “blinds” the OS, preventing the `WdFilter.sys` driver from loading on the subsequent reboot.

![Figure 19: EDR/AV Bypass - Registry Tamper Protection Bypass.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/09dcb1bcb81e42bd.png)

Figure 19: EDR/AV Bypass – Registry Tamper Protection Bypass.

-   **ELAM Irrelevance:** While Early Launch Anti-Malware (`WdBoot.sys`) protects the initial boot chain, its role is limited to evaluating boot-start drivers during early initialization. `BTR.sys` executes in this post-ELAM environment (`Start=1`), meaning it is not evaluated by ELAM-related boot-driver checks. Furthermore, even if this architectural gap did not exist, `BTR.sys` carries a valid Microsoft signature, meaning it would normally pass signature enforcement, though this does not guarantee permanent trust or classification as “Known Good” in all contexts.

**Conclusion:** The `BTR.sys` driver, when manually staged to execute at the next boot, effectively bypasses the active protection stack by operating in the interval where the kernel is active but the security suite’s intelligence is dormant. Furthermore, tests demonstrated a successful Tamper Protection bypass at runtime.

## Demo PoC: BTR_CLI – WIN 11 25H2 – KILL CHAIN

The following demonstration video presents a complete “ **Kill Chain** ” scenario on a fully updated **Windows 11 25H2** machine with all security features enabled. The Proof-of-Concept utilizes `BTR_CLI` (`BTR.sys`) to systematically dismantle the Windows Defender security stack from Ring 0, rendering the system defenseless against a known malicious sample.

The demonstration follows these specific stages:

1.  **Baseline & Tamper Protection Verification:**  
    We attempt to extract a well-known driver universally classified as **malicious** (`mimidrv.sys` – part of the [Mimikatz](https://github.com/gentilkiwi/mimikatz) post-exploitation tool) and modify Defender registry keys using standard Administrator privileges. Both actions are immediately blocked by Windows Defender and Tamper Protection.
2.  **Phase 1: Runtime Tamper Protection Bypass:**  
    Using the `trigger now` mode, we instruct the `BTR.sys` driver to delete the Service Registry keys for the Defender Kernel Filter and the Antimalware Service. Since the operation originates from a signed Microsoft kernel driver, Tamper Protection is successfully bypassed.

```
BTR_CLI.exe -chain -item "4|HKLM\SYSTEM\CurrentControlSet\Services\WdFilter" -item "4|HKLM\SYSTEM\CurrentControlSet\Services\WinDefend" -trigger now
```

3.  **Phase 2: Boot-Time Neutralization (“Golden Window”):**  
    Using the `trigger boot` mode, we schedule the physical deletion of the Defender binaries (`WdFilter.sys` and `MsMpEng.exe`). These operations execute during the “ **Golden Window** ” (**Phase 1**), after the filesystem is writable but before the Defender user-mode service can start or lock the files.

```
BTR_CLI.exe -chain -item "1|C:\Windows\System32\drivers\wd\WdFilter.sys" -item "1|C:\ProgramData\Microsoft\Windows Defender\Platform\4.18.26010.5-0\MsMpEng.exe" -trigger boot
```

4.  **Result & Arbitrary Write:**  
    After a system reboot, we verify that the critical Defender binaries have been permanently deleted. The malicious `mimidrv.sys` is then extracted without detection. Finally, we demonstrate an arbitrary write primitive by moving the malicious driver into the protected `System32\drivers` directory using the `BTR.sys` driver.

```
BTR_CLI.exe -a 3 -s "C:\Users\admin\Desktop\mimidrv\mimidrv.sys" -d "C:\Windows\System32\drivers\mimidrv.sys"
```

Figure 20: BTR_CLI PoC → Demo Video → WIN 11 25H2 – KILL CHAIN.

## Detection & Mitigation

### Detection Opportunities

Because `BTR.sys` is a legitimate Microsoft-signed component, signature-based blocking is ineffective. Furthermore, a well-crafted weaponization tool (like `BTR_CLI`) intentionally mimics the operational footprint of the legitimate Windows Defender remediation process.

Based on telemetry analysis using [Sysmon](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon) (System Monitor), robust detection must rely on **behavioral context**, **Alternate Data Stream (ADS) monitoring**, **and kernel-execution attribution**.

1.  **Alternate Data Stream (ADS) Anomalies (Sysmon Event ID 15 – High Fidelity)**  
    The most distinct operational characteristic of `BTR.sys` is its reliance on Alternate Data Streams for configuration. Sysmon telemetry (Event ID 15) captures this behavior with high fidelity.
    -   **Configuration Write (Universal):** Both legitimate usage and abuse involve creating an ADS named `:changelist` on the driver file. Sysmon captures the encrypted RC4 payload directly in the `Contents` field.
    -   **Feedback Write (Differentiator):**
        -   **Abuse (**`BTR_CLI`**):** The tool directs the driver to write the feedback report into a secondary ADS on the driver itself (e.g., `Random.sys:Random.dat`).
        -   **Legitimate (**`MpEngine.dll`**):** The engine directs the driver to write the feedback report to a standalone file, typically in a protected path like `C:\ProgramData\Microsoft\Windows Defender\Scans\RebootActions\`.
    -   *Detection Logic:* Alert on `FileCreateStreamHash` (Event ID 15) where `TargetFilename` ends in `.sys:changelist`. Secondarily, alert on `.dat` streams created on `.sys` files (specific to current PoC tool).

![](https://research.checkpoint.com/wp-content/uploads/2026/08/QHX6JJP7MQ-image2-1024x514.png)

Figure 21: Sysmon ID 15 capturing the “BTR_CLI” writing the encrypted configuration to the “:changelist” ADS.

2.  **Kernel-Mode Execution Context (Sysmon Event ID 23)**  
    When `BTR.sys` executes actions, for example, **file deletion** (**Action 1**), the operation occurs in Ring 0.
    -   Sysmon logs the File Delete (Event ID 23), but the `Image` performing the deletion is recorded as `System` (PID 4), not the user-mode tool that triggered it.
    -   *Detection Logic:* Correlate `System` (PID 4) deleting arbitrary files (especially security binaries) immediately following a `DriverLoad` (Event ID 6) of a binary matching the `BTR.sys` hash.

![](https://research.checkpoint.com/wp-content/uploads/2026/08/QHX6JJP7MQ-image3-1024x416.png)

Figure 22: Sysmon ID 23 capturing the “System” deleting “example.txt” immediately following a DriverLoad.

3.  **Driver Deployment & Lineage (Sysmon Event ID 6)**  
    The origin of the driver load is a critical metric.
    -   **Legitimate Usage:** `BTR.sys` is dropped and registered by legitimate Windows Defender processes (e.g., `MsMpEng.exe`).
    -   **Abuse Indicator:** Alert on `DriverLoad` (Event ID 6) where the `Signature` is `Microsoft Windows` and the `Hashes` match known `BTR.sys` versions, but the `ParentImage` or `Image` responsible for dropping the file is outside the Defender ecosystem (e.g., `cmd.exe`, `powershell.exe`, or unknown binaries).
4.  **Stealth Registry Staging (Sysmon Event ID 12, 13 vs. Event ID 7045)**  
    There is a subtle operational difference between how Defender and the current PoC load the driver.
    -   **Legitimate (**`MpEngine.dll`**):** Uses the Service Control Manager (SCM) via `CreateServiceW`. This generates standard Windows Event Logs (e.g., System Event ID `7045` – A service was installed).
    -   **Abuse (**`BTR_CLI`**):** Directly interacts with the Registry to create the service keys (`HKLM\SYSTEM\CurrentControlSet\Services\{Random}`) and calls the undocumented `NtLoadDriver` syscall. This bypasses SCM, meaning Event ID `7045` will **not** trigger.
    -   *Detection Logic:* Alert on `RegistryEvent` (Event ID 12/13) creating a service key where the `Args` value contains `:changelist` and `Group` is set to `Boot Bus Extender`, especially if unaccompanied by a standard Service Installation event.
5.  **Anti-Forensics Telemetry (Sysmon Event ID 11 & 23)**
    -   Monitor for the rapid creation (Event 11) and subsequent deletion (Event 23) of `\SystemRoot\Temp\BootClean.log` by the `System` (PID 4) process. This log creation is hardcoded in the driver and occurs regardless of the caller.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9ae4558316db9867.png)

Figure 23: Sysmon ID 11 capturing the “System” creation and subsequent deletion (ID 23) of “BootClean.log”.

### Mitigation Recommendations

-   **Restrict Privileges:** The abuse of `BTR.sys` fundamentally relies on the attacker possessing `SeLoadDriverPrivilege`. Enforcing the principle of least privilege and strictly monitoring the assignment and usage of this right is the primary defense.
-   **Behavioral EDR Rules:** Configure EDR solutions to alert on security-tool drivers executed outside their expected process lineage, regardless of their digital signature.
-   **Holistic LOLDriver Defense:** Recognize that the Microsoft Vulnerable Driver Blocklist (WDAC) does not protect against the abuse of *functionally intended* drivers like `BTR.sys`. Defense-in-depth must include monitoring the *context* of driver loads and ADS creation, not just driver hashes.

### In-The-Wild Status

During our analysis across all collected samples and telemetry sources, we did **not** observe evidence of real-world abuse of `BTR.sys` in the manner demonstrated in this research. This suggests the technique is currently unknown or unused by threat actors, making proactive detection engineering feasible before weaponization appears in the wild.

## Conclusion

This research shows that the `BTR.sys` driver, originally designed as a defensive remediation component, exposes a powerful and fully functional kernel-mode execution primitive when its internal protocol is understood. By reversing its encrypted transaction format, integrity validation scheme, and execution logic, we demonstrated that a trusted, signed Microsoft driver can be instructed to perform arbitrary file and registry operations from Ring 0 without exploiting any vulnerability.

The creation of the `BTR_CLI` tool was a key milestone in validating our findings. The tool automates payload construction, encryption, integrity calculation, driver extraction, execution, and cleanup. This allowed us to reliably reproduce kernel-level operations across all tested Windows 7-11 versions and across every analyzed `BTR.sys` build. Its successful operation confirmed that:

-   The configuration protocol remains stable across versions.
-   The RC4 key is universally reused.
-   The transaction structure is backward compatible.
-   The primitive is deterministic and reliable.

This effectively repurposes a specialized defensive component into a versatile, signed kernel-mode primitive capable of arbitrary file and registry manipulation.

More broadly, this work highlights an important defensive lesson: **trusted security infrastructure can unintentionally expose attacker-usable primitives** when its internal mechanisms are undocumented but reachable. The issue is not a vulnerability in the traditional sense, but rather an architectural trust boundary that can be crossed if an attacker already has administrative privileges.

Following responsible disclosure, **MSRC** confirmed that these findings do not meet the criteria for immediate servicing, as the technique relies on pre-existing administrative privileges (`SeLoadDriverPrivilege`). This classification establishes `BTR.sys` as a potent “ **Living-off-the-Land** ” **driver** (**LOLDriver**). Crucially, unlike third-party drivers often neutralized by the [Microsoft Vulnerable Driver Blocklist](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/windows-defender-application-control/design/microsoft-recommended-driver-block-rules) or tracked by the [LOLDrivers project](https://loldrivers.io/), `BTR.sys` is an essential, built-in Windows component. It remains fully allowed and operational, enabling advanced evasion without the risks or constraints associated with traditional **BYOVD** techniques.

As defenders increasingly rely on signed binaries as indicators of trust, research like this demonstrates why behavioral context, execution lineage, and intent analysis must complement signature-based trust models.

The post [BTR Reforged: Weaponizing Defender’s Remediation Driver as a Kernel Operation Primitive](https://research.checkpoint.com/2026/btr-reforged-weaponizing-defenders-remediation-driver-as-a-kernel-operation-primitive/) appeared first on [Check Point Research](https://research.checkpoint.com/).
