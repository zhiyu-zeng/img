---
title: "Windows Runtime Attestation Reports: How the Secure Kernel Vouches for Your Drivers | Adrian's Security Research"
source: https://s4dbrd.github.io/posts/windows-runtime-attestation-report/
source_host: s4dbrd.github.io
clip_date: 2026-10-25T17:24:23+08:00
trace_id: f3aa746f-47a1-4b76-8a51-b0654c83ffa2
content_hash: f6df19824572b791383787e9311e43c48a477a8d9853b4b2209ac441500a840f
status: synced
tags:
  - Windows逆向
  - 内核
series: null
feed_source: s4dbrd·Windows内核RE
ai_summary: Windows 运行时证明报告并非 TPM 的“驱动累计哈希链”，而是 Secure Kernel 在 VTL1 中维护的一份只增不删的驱动清单，按请求用 IDKS 签名；安全性大半由验证方承担。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 40475244-d011-8179-9e35-f367d5aafbf5
ioc:
  cves: []
  cwes: []
  hashes:
    - 6022340c9f4cb00307df8db036d392adac766212
    - 7f9c9d6bc6b08440727733fd34641c76cccaa43f8291f7bdc659129134236a70
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Windows 运行时证明报告并非 TPM 的“驱动累计哈希链”，而是 Secure Kernel 在 VTL1 中维护的一份只增不删的驱动清单，按请求用 IDKS 签名；安全性大半由验证方承担。
> 
> - **真实机制：** 每个通过 VTL1 校验的内核镜像都会被记录成一条表项（容量上限 384），卸载后只置 `Unloaded` 标志，因此攻击者能让驱动卸载，却无法删掉记录。
> - **调用链：** `kernelbase!GetRuntimeAttestationReport` → `NtQuerySystemInformationEx`（信息类 254）→ 安全调用 0x117 → VTL1 的 `SkProduceRuntimeSignedReport`，经非分页 bounce buffer 和 MDL 返回签名包。
> - **签名范围：** 仅前 140 字节（头部、nonce、摘要头）被 RSA-PSS/SHA-512 直接签名，驱动报告只经摘要认证；包内无时间戳、启动计数、设备标识或请求者身份，新鲜度全靠调用方 nonce。
> - **实现细节和陷阱：** 函数只存在于 `kernelbase.dll`，链接 `OneCore.Lib` 会在启动时报 `0xC0000139`；HVCI 关闭时返回 `STATUS_NOT_SUPPORTED`；缓冲区大于约 2 MB 直接 `ERROR_INVALID_PARAMETER`；OEM 名超过 256 字节可生成签名有效但结构错误的报告，验证方须按“格式错误”拒收。
> - **实测验证：** 通过 LiveCloudKd 的 `hvmm.sys` 绕过 SLAT 从宿主读 VTL1，95 条表项与 IDA 偏移、插入序号 0–94 完全吻合；而 WinHv 接口在同一物理地址只读到全零。

In June 2026 Riot announced Vanguard On-Demand: on a sufficiently locked-down Windows 11 machine, the Vanguard kernel driver no longer has to start at boot. What makes that possible is a Windows feature Riot calls the “Runtime Driver Attestation Report”, which lets an anti-cheat learn which drivers were loaded while it was not running. Riot describes it as “measuring every on-demand driver into the Trusted Platform Module”, “a sort of continual, cumulative hash of all drivers that have been loaded since boot” ([Riot Games](https://www.riotgames.com/en/news/vanguard-on-demand)). As we will see, that is not how it works.

Microsoft documents the user-mode entry point, `GetRuntimeAttestationReport`, on a single Learn page, and the package structures live in `winnt.h`. Neither says which key signs the report, how a verifier gets that key, when a driver is recorded, what happens on unload, or what the report cannot see. Andrea Allievi’s [New Year post](https://www.andrea-allievi.com/blog/new-year-post-anti-cheat-evolution-in-windows-11/) explains the idea, and Akash Trehan’s [post on the hotpatch report](https://www.akashtrehan.com/secure-hotpatch-report/) covers a sibling report type; Trehan’s announced parts on the core architecture and format were not published when I wrote this.

This post follows a report from the user-mode call through `ntdll`, the NT kernel, a secure call into VTL1 and the Secure Kernel, down to the bytes of the signed package. Then it goes the other way: how a driver load ends up in the Secure Kernel’s table, where the signing key comes from, how long that key lives, and what the report is blind to. Everything is from Windows 11 build 26100.9711 unless I say otherwise, cross-checked against older and newer builds, and against experiments on a real machine. It is a continuation of my posts on [how kernel anti-cheats work](https://s4dbrd.github.io/posts/how-kernel-anti-cheats-work/) and on [reversing BEDaisy](https://s4dbrd.github.io/posts/reversing-bedaisy/). This is not a complete description of the feature, and Microsoft can change any of it in the next update. If something here is wrong, I welcome corrections.

## Background: Trust Levels, Secure Calls, and Measured Boot

Three pieces of context make the rest of this post easier to follow. If you have read Connor McGarr’s posts on [secure calls](https://connormcgarr.github.io/secure-calls-and-skbridge/) and [secure image objects](https://connormcgarr.github.io/secure-images/), you can skim the first two.

### Two Trust Levels

With virtualization-based security (VBS), Windows runs in two virtual trust levels. VTL0 is the world everyone knows: the NT kernel, drivers and applications. VTL1 runs the Secure Kernel, `securekernel.exe`. Connor puts it well: VTL1 is a higher security boundary with its own isolated physical address space, and Hyper-V is the bridge between the two. The Secure Kernel does not run inside the hypervisor. If that isolation holds, a kernel attacker in VTL0 can neither read nor write what the Secure Kernel keeps, and that is the property this whole feature leans on.

Memory Integrity, or HVCI, moves code integrity for kernel images into VTL1. Connor notes that VTL1 enforces W^X for kernel memory. Allievi points out that with HVCI a manually mapped driver cannot execute without passing through the Secure Kernel, because kernel memory is non-executable in the hypervisor’s second-level page tables. So when NT loads a driver, `ci.dll` hands the image to VTL1 for validation, and the Secure Kernel keeps a secure image object for it. The image is tracked through a NAR, which, in the *Windows Internals* description Connor quotes, holds the range’s base and size and a pointer to the secure image. Section 6 shows that this validation step is exactly where the report’s records come from.

### Secure Calls

NT asks the Secure Kernel for services through secure calls. Connor compares them to system calls: an untrusted component asking a privileged one for something. On the NT side they all go through `nt!VslpEnterIumSecureMode`, which takes an operation type (almost always 2), a service number and a 0x68-byte argument block. On the VTL1 side they land in `securekernel!IumInvokeSecureService`, a very large switch over the service number. The numbers come from the `_SKSERVICE` enum in the NT symbols. When data has to cross the boundary, NT describes it with MDLs, and the Secure Kernel validates and maps them itself.

### Measured Boot and the TCG Log

The last piece is the TPM. During boot, the firmware and the Windows boot loader measure what they load and configure into the TPM’s PCRs, which can only be extended, never set. The list of measurements goes into the TCG log, which Windows keeps on disk (`C:\Windows\Logs\MeasuredBoot`). The log is not signed, but the TPM can sign its current PCR values in a quote, and a verifier who replays the log and arrives at the quoted values knows the log is genuine.

Windows measures security settings this way, for example whether HVCI is on. It also measures public keys so that a remote party can trust them, and it can seal secrets to PCR values so that the TPM only releases them while those PCRs match. Both come back later: the report’s signing key is measured into the TCG log, and the stored copy of that key is protected by a secret sealed to a set of PCRs.

Here is the whole system on one page. The rest of the post walks through it arrow by arrow.

[![How a runtime attestation report is produced](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1d35c81576de3321.svg)](https://s4dbrd.github.io/assets/img/posts/rtattest-overview.svg) *The two runtime paths that cross the VTL boundary. A driver load reaches `ci.dll`, which records the validated image into the VTL1 table through secure call 0x1D. A report request goes down through secure call 0x117 and comes back as a signed package. Nothing in VTL0 reads the table or the key directly.*

* * *

## 1\. Setup: Builds, Symbols, and Why 25H2 Is 24H2

Riot and the public sample code say the driver report needs Windows 11 25H2. Binary-wise, there is no such thing as a 25H2 kernel. 25H2 and 26H2 are enablement packages on top of 24H2. A 25H2 machine reports `CurrentBuild` 26200, but its `ntoskrnl.exe` is version 10.0.26100.x. On my 26H2 test machine (`CurrentBuild` 26300, UBR 9711), `ntoskrnl.exe`, `securekernel.exe`, `skci.dll`, `ci.dll`, `kernelbase.dll`, `kernel32.dll` and `ntdll.dll` are byte-identical to the 10.0.26100.9711 files. I found no edition, version or feature-flag check anywhere on the path, so as far as I can tell any 24H2-train machine with the right cumulative update runs the same feature.

The feature arrived in two steps, which I found by diffing the function lists of consecutive servicing builds:

| build | update | what changes |
| --- | --- | --- |
| 26100.7171 | KB5068861, 2025-11-11 | nothing yet |
| 26100.7309 | KB5070311, 2025-12-01 | `kernelbase!GetRuntimeAttestationReport`, `nt!ExpQueryRuntimeAttestationReport`, `nt!VslQueryRuntimeAttestationReport`, `securekernel!SkProduceRuntimeSignedReport` and its report and digest builders |
| 26100.7705 | KB5074105, 2026-01-29 | the Secure Kernel’s NT driver table (`SkmiAddSecureImageToNtTable`, `SkAddRuntimeDriverToNtTable`, `SkpBuildNtDriversReport`, …) and `skci!SkciCalculateImageAttestationData` |
| 26100.9711 | KB5127648, 2026-10-13 | the build this post describes |
| 28000.3231 | KB5127646 (26H1), 2026-10-13 | a second report type, built by `skci!SkciBuildAttestationReport` |

For about two months the API existed and returned a signed package, but the report builder in VTL1 called nothing: from 26100.7309 to 26100.7623 the driver report is a constant 16-byte record with zero drivers. Section 10 comes back to why that matters for verifiers.

Method, briefly. Binaries come from Microsoft’s symbol server via Winbindex, and every name in this post comes from Microsoft’s public PDBs; IDA ran headless with Lumina disabled so that no name came from anywhere else. The Secure Kernel and `skci.dll` PDBs carry function names but no types, so VTL1 structure fields stay as raw offsets (`+0x10`) rather than invented names. Each statement below was recorded with the disassembly or decompilation lines that support it and checked a second time, independently, from the raw artifacts; things I could only infer are marked as inferences.

* * *

## 2\. The API From User Mode

The SDK prototype is simple:

```objectivec
BOOL GetRuntimeAttestationReport(
    UCHAR*  Nonce,               // 32 bytes
    UINT16  PackageVersion,      // must be 1
    UINT64  ReportTypesBitmap,   // bit 0 = driver report
    PVOID   ReportBuffer,
    PUINT32 ReportBufferSize);
```

Learn says the function lives in `kernel32.dll`. It does not: on 26100.7309, 26100.9711 and 28000.3231, `kernel32.dll` neither exports nor forwards it, and the only implementation is the `kernelbase.dll` export. So the import library you link against matters. In SDK 10.0.26100.7705, `mincore.lib`, `WindowsApp.lib` and the `*_apiset` libraries import the function from `api-ms-win-core-sysinfo-l1-2-8.dll`, which the API set schema on my machine maps to `kernelbase.dll`. `OneCore.Lib`, `OneCoreUAP.Lib` and `windowscoreheadless.Lib` import it from `KERNEL32.dll` instead, and `kernel32.lib` has no record for it at all. I built the same small program both ways. The api-set build binds to the kernelbase export, as a 64-bit and as a 32-bit process. The OneCore build does not start: the loader stops it with `STATUS_ENTRYPOINT_NOT_FOUND` (0xC0000139).

Here is the whole function on 26100.9711, as Hex-Rays sees it (`a1` = Nonce, `a2` = PackageVersion, `a3` = ReportTypesBitmap, `a4` = ReportBuffer, `a5` = ReportBufferSize):

```c
v12 = 0; v13 = 0;                                       // nonce area zeroed
  if ( a5 == nullptr || a3 == 0 || (a3 & 0xFFFFFFFFFFFFFFFEuLL) != 0 )
    goto LABEL_7;
  v5 = *a5;                                               // read once
  if ( a4 != 0 )
  {
    if ( v5 == 0 || a1 == nullptr )
      goto LABEL_7;
  }
  else if ( v5 != 0 )
  {
LABEL_7:
    RtlSetLastWin32Error(LastError: 0x57u);               // ERROR_INVALID_PARAMETER
    return 0;
  }
  if ( a2 != 1 )
    goto LABEL_7;
  v10 = 0; v9[0] = 1; v9[1] = 1; v11 = a3;
  if ( a1 != nullptr ) { v7 = a1[1]; v12 = *a1; v13 = v7; }
  v8 = NtQuerySystemInformationEx(254, v9, 48, a4, v5, a5);
  if ( v8 < 0 ) { BaseSetLastNTError(v8); return 0; }
  return 1;
```

So there are two kinds of call. A size query passes `ReportBuffer == NULL` and `*ReportBufferSize == 0`, and the nonce may be NULL, in which case 32 zero bytes are sent. A real query needs a buffer, a nonzero size and a nonce. Anything else, a `PackageVersion` other than 1, or any bitmap bit other than bit 0 fails with `ERROR_INVALID_PARAMETER` before the kernel is involved. On 26H1 (28000.3231) the mask becomes `~3`, accepting the CodeIntegrity report type as well; on every 26100 build I looked at, only the driver report exists.

Everything is packed into a 48-byte block for `NtQuerySystemInformationEx`, information class 254, which the kernel PDB names `SystemRuntimeAttestationReport`. No Microsoft type describes the block; the field names in the last column are the ones the community phnt headers use:

| offset | size | kernelbase writes | phnt name |
| --- | --- | --- | --- |
| +0x00 | 2   | constant 1 | InputVersion |
| +0x02 | 2   | `PackageVersion` | PackageVersion |
| +0x04 | 4   | 0   | Reserved |
| +0x08 | 8   | `ReportTypesBitmap`, all 64 bits | ReportTypesBitmap |
| +0x10 | 32  | the nonce, or zeros if NULL | Nonce |

The caller’s `ReportBufferSize` pointer is passed straight through as the kernel’s `ReturnLength`, so the kernel writes the size directly into the caller’s variable. `ntdll!NtQuerySystemInformationEx` is the usual stub, `mov eax, 16Fh` followed by `syscall`, and entry 0x16F of the 26100.9711 `KiServiceTable` is `NtQuerySystemInformationEx` (it was 0x16E in 26100.7309 and 26100.7705).

32-bit callers get a report too. The SysWOW64 `kernelbase.dll` has its own copy of the function, with the same checks and the same 48-byte block, and the 32-bit `ntdll` stub enters WOW64 with the same service number, 0x16F. There, `wow64!whNtQuerySystemInformationEx` sends class 254 to `whNT32QuerySystemInformationEx`, which jumps straight to the 64-bit `ntdll!NtQuerySystemInformationEx` with the caller’s arguments. Nothing is converted and no temporary buffer is used, which works because the block has only fixed-size fields and the package contains no pointers. The pass-through arrived together with the API: the `wow64.dll` of 26100.7171 does not list class 254, the one of 26100.7309 does. I compiled my harness unchanged as a 32-bit program and ran it on the host. It got a 20,957-byte package whose nonce and signature check out against that boot’s IDKS.

If you write a client, watch out for one behavior change. In 26100.7309 and 26100.7623, a size query that came back with `STATUS_BUFFER_TOO_SMALL` made the API return TRUE. From 26100.7705 that special case is gone, so the same size query returns FALSE with `ERROR_INSUFFICIENT_BUFFER` (122), which is what Trehan’s post describes. Code that treated FALSE as fatal worked on the first builds and breaks on the later ones.

* * *

## 3\. Through the NT Kernel

The kernel side is short and careful. The call chain on 26100.9711 is:

```sql
nt!NtQuerySystemInformationEx            input != NULL, length != 0, 8-byte alignment for class 254
  nt!ExpQuerySystemInformation           ProbeForWrite(out, len, 4), probe ReturnLength, case 254
    nt!ExpQueryRuntimeAttestationReport  length == 0x30, capture the 48 bytes once
      nt!VslQueryRuntimeAttestationReport  re-validate, bounce buffer + MDL, secure call 0x117
        nt!VslpEnterIumSecureMode         semaphore, VTL1 request loop
          nt!HvlSwitchToVsmVtl1           argument block into RBX + XMM10..XMM15, call the VTL-call entry
        nt!RtlCopyToUser                  bounce buffer -> caller buffer
```

Plain `NtQuerySystemInformation` cannot be used: it returns `STATUS_INVALID_INFO_CLASS` for class 254 before dispatching, on every build I checked. For user-mode callers `ExpQuerySystemInformation` calls `ProbeForWrite(SystemInformation, Length, 4)`, so the report buffer must be 4-byte aligned and writable, and whatever happens later, it writes its local `Size` back to `ReturnLength`. Kernel-mode callers of `ZwQuerySystemInformationEx` take the same path without any probing.

`ExpQueryRuntimeAttestationReport` is the class handler:

```c
memset(v9, 0, sizeof(v9));                                  // 0x30-byte stack copy
if ( Src == nullptr )             return 3221225485LL;      // STATUS_INVALID_PARAMETER
if ( a2 != 48 )                   return 3221225476LL;      // STATUS_INFO_LENGTH_MISMATCH
if ( a3 == nullptr && a4 != 0 || a5 == nullptr )
                                  return 3221225485LL;      // STATUS_INVALID_PARAMETER
if ( a6 != 0 ) RtlCopyFromUser(a1: v9, Src, Size: 0x30u);   // user caller
else           RtlCopyVolatileMemory(a1: v9, Src, Size: 0x30u);
*a5 = a4;                                                   // Size = OutputBufferLength
return VslQueryRuntimeAttestationReport(a1: (__int64)v9, a2: a3, a3: a5, a4: a6);
```

The 48 bytes are copied once into a kernel stack buffer before anything looks at them, and from there on only the copy is used. I did not find a double fetch on this path.

### 3.1 Who May Call

Nobody is turned away. The only calls on any control-flow path from `ExpQuerySystemInformation` ’s entry to the class-254 handler are `memset`, `ProbeForWrite` and two processor-count queries. None of the three functions below it calls anything that looks at a token, a privilege, an integrity level, an AppContainer, the calling process or a feature flag. As far as I can tell from the code, any user-mode process at any integrity level can request a report, which matches Allievi’s “callable from any user-mode application”. The only throttle is global: ordinary threads wait on `VslpIumThreadSemaphore`, whose count the Secure Kernel itself chooses at boot.

Nothing on the VTL0 path checks HVCI, Secure Boot, the TPM, IOMMU, test-signing or debugging either. The one availability test is whether the VTL-call entry point exists: if `HvlpVsmVtlCallVa` is NULL because VSM is not running, `VslpEnterIumSecureMode` returns `STATUS_DEVICE_NOT_CONNECTED` and the API fails with `ERROR_DEVICE_NOT_CONNECTED` (1167). The requirements Learn lists (“TPM 2.0, Secure Boot, VBS, HVCI, and IOMMU must be enabled. Test-signing and debug flags must be off.”) are not enforced on this side; HVCI turns out to be enforced in VTL1, by a different mechanism (section 6).

### 3.2 VslQueryRuntimeAttestationReport and the Bounce Buffer

This is where the request becomes a secure call. Abridged:

```c
v8 = *(_WORD *)(a1 + 2);                                     // PackageVersion
  memset_0(a1: v16, Val: 0, Size: 0x48u);                      // transfer context
  v9 = *(_QWORD *)(a1 + 8);                                    // ReportTypesBitmap
  memset_0(a1: v17, Val: 0, Size: 0x68u);                      // secure-call argument block
  if ( __PAIR32__(v8, *(_WORD *)a1) != 65537 || a3 == nullptr || v9 == 0 || (v9 & 0xFFFFFFFFFFFFFFFEuLL) != 0 )
    goto LABEL_22;                                             // STATUS_INVALID_PARAMETER
  v10 = *a3;                                                   // output length
  if ( a2 == nullptr ) { if ( v10 == 0 ) goto LABEL_13; goto LABEL_22; }    // size query
  if ( v10 == 0 ) goto LABEL_22;
  Pool2 = ExAllocatePool2(0x40u, *a3, 0x54736D56u);            // POOL_FLAG_NON_PAGED, 'VmsT'
  ...
  v12 = VslpLockPagesForTransfer(a1: (__int64)v16, a2: Pool2, a3: v10, a4: IoWriteAccess, a5: 2u);
  ...
LABEL_13:
  v18 = v15;  v19 = v9;                                        // args +0x08, +0x10
  if ( a2 != nullptr ) { v20 = *(_OWORD *)(a1 + 16); v21 = *(_OWORD *)(a1 + 32);   // nonce
                         v22 = v16[0];  v23 = v16[7]; }        // MDL VA, its PFN
  v12 = VslpEnterIumSecureMode(0x117, 2, 0, v17);
  *a3 = Size;                                                  // args +0x48, for any status
  if ( v12 >= 0 && a2 != nullptr )
  { if ( Size <= v10 ) RtlCopyToUser(a2, Pool2, Size);
    else v12 = -1073741595; }                                  // STATUS_INTERNAL_ERROR
```

Three things stand out. First, the kernel validates the input again by itself, and on 26100.x it rejects bitmap bit 1 too, so calling the syscall directly does not unlock the CodeIntegrity report on these builds. Second, the Secure Kernel never sees the caller’s buffer. The kernel allocates a nonpaged bounce buffer of the caller’s size and describes it with an MDL, and it copies into the user buffer only at the end, with `RtlCopyToUser` inside a try block. Third, a size query does not even forward the nonce: there is no output buffer, so the argument block carries no nonce and no MDL, and only the size comes back.

`VslpLockPagesForTransfer` builds an MDL for the bounce buffer, then a second, embedded MDL that describes the first one’s own memory. What crosses into VTL1 is the virtual address of the data MDL and the PFN of the page that holds it; the output length is not a separate argument, VTL1 learns it from the MDL’s `ByteCount`. This is the “MDL describing the input MDL” pattern Connor described in his [secure calls post](https://connormcgarr.github.io/secure-calls-and-skbridge/), with the second MDL built on the NT side. On this path the bounce buffer’s page-rounded span must be at most 0x1FA000 bytes (506 pages, as many PFNs as fit in a single-page MDL), otherwise the call fails with `STATUS_INVALID_PARAMETER`. A consequence I did not test: a caller who passes a generous `*ReportBufferSize` above roughly 2 MB gets `ERROR_INVALID_PARAMETER` even though the buffer is big enough.

### 3.3 The Secure Call

The argument block is 0x68 bytes, again with no type in the PDB:

| offset | size | direction | content for this call |
| --- | --- | --- | --- |
| +0x00 | 1   | in  | operation type 2 (secure service) |
| +0x01 | 1   | out | request code from VTL1 (1 = done; other values ask NT to run a service on VTL1’s behalf) |
| +0x02 | 2   | in  | service number 0x117 |
| +0x04 | 4   | in  | secure thread cookie, 0 for ordinary threads |
| +0x08 | 2 in / 4 out | both | in: `PackageVersion`; out: the NTSTATUS |
| +0x10 | 8   | in  | `ReportTypesBitmap` |
| +0x18 | 32  | in  | nonce (absent in a size query) |
| +0x38 | 8   | in  | VA of the data MDL (absent in a size query) |
| +0x40 | 8   | in  | PFN of the page holding that MDL (absent in a size query) |
| +0x48 | 4   | out | package size |
| +0x50 | 24  | \-  | zero |

The service number is the PDB’s `SECURESERVICE_QUERY_RUNTIME_ATTESTATION_REPORT`, the name Allievi mentions, and it moves with servicing updates: 0x115 in 26100.7309, 0x116 in 26100.7705, 0x117 in 26100.9711 and 0x125 in 28000.3231. Anything that hardcodes secure call numbers has to be rebuilt per build.

`HvlSwitchToVsmVtl1` then loads the whole block into registers rather than passing a pointer: bytes +0x00..+0x07 go into RBX and +0x08..+0x67 into XMM10 through XMM15, before an indirect call through `HvlpVsmVtlCallVa`:

```
mov     rbx, [rdx]                         ; args +0x00..+0x07
movdqu  xmm10, xmmword ptr [rdx+8]         ; ... through xmm15 <- [rdx+58h]
mov     r8, cr8
mov     rax, cs:HvlpVsmVtlCallVa
call    HvlpSwitchToVsmVtl1RetpolineHelper ; jmp rax
mov     [rdx], rbx                         ; registers copied back into the block
```

NT never encodes the hypercall itself. `HvlpGetVtlCallVa` asks the hypervisor at boot for an offset and points `HvlpVsmVtlCallVa` into the hypercall code page. Connor’s description of the secure call as a wrapper around the VTL-call hypercall fits, but the hypercall code and register names come from public documentation, not from these binaries.

After the call, the kernel always copies the size from +0x48 back to the caller and passes VTL1’s status through. Since 26100.7705 it also refuses to copy more than the caller asked for: if VTL1 reports a size larger than the output length, the result is `STATUS_INTERNAL_ERROR`. In 26100.7309 the kernel read `*Size` three times and copied whatever byte count VTL1 reported; 28000.3231 again has no such check.

The error surface, as ntdll 26100.9711 maps it to Win32:

| where | condition | NTSTATUS | GetLastError |
| --- | --- | --- | --- |
| kernelbase | bad arguments | none | 87  |
| `NtQuerySystemInformation` | class 254 through the non-Ex API | `0xC0000003` | 87  |
| `ExpQueryRuntimeAttestationReport` | input length not 0x30 | `0xC0000004` | 24  |
| `VslQueryRuntimeAttestationReport` | version, bitmap or buffer pair wrong; span over 0x1FA000 | `0xC000000D` | 87  |
| `VslQueryRuntimeAttestationReport` | bounce buffer allocation failed | `0xC000009A` | 1450 |
| `VslpEnterIumSecureMode` | VSM not running | `0xC000009D` | 1167 |
| VTL1 | buffer too small | `0xC0000023` | 122 |
| VTL1 | HVCI off (empty driver table) | `0xC00000BB` | 50  |
| `VslQueryRuntimeAttestationReport` | VTL1 size larger than the buffer (7705+) | `0xC00000E5` | 1359 |

### 3.4 Watching It Live

All of the above comes from the disassembly, so I wanted to watch one request go through. That needs kernel debugging, and my Secure Boot desktop refuses to enable it (section 11). I used a Hyper-V virtual machine instead, running byte-identical 26100.9711 binaries with HVCI on. Getting a debugger to hold a session in a guest that runs its own hypervisor for VBS took several attempts: the network transport never got a session, and a serial link on COM1 got one and then lost it partway through boot. What finally worked was the kernel debugger on the guest’s COM2 (the port MSRC uses for the kernel when it debugs a guest that runs Hyper-V), connected from the very start of boot (the session came up at system uptime zero), with breakpoints only on the attestation path. I changed several things between the failing and the working run, so I cannot say which one mattered.

At the initial break I set six breakpoints on the attestation path. The offsets are the ones from the disassembly in section 3.2: +0x10f is the instruction after `VslpLockPagesForTransfer` returns, +0x179 is the call to `VslpEnterIumSecureMode`, +0x17e the instruction after it, and +0x1b3 the call to `RtlCopyToUser`.

```
0 e Disable Clear  fffff805`9b3c4ee0     0001 (0001) nt!ExpQueryRuntimeAttestationReport
1 e Disable Clear  fffff805`9b319100     0001 (0001) nt!VslQueryRuntimeAttestationReport
2 e Disable Clear  fffff805`9b31920f     0001 (0001) nt!VslQueryRuntimeAttestationReport+0x10f
3 e Disable Clear  fffff805`9b319279     0001 (0001) nt!VslQueryRuntimeAttestationReport+0x179
4 e Disable Clear  fffff805`9b31927e     0001 (0001) nt!VslQueryRuntimeAttestationReport+0x17e
5 e Disable Clear  fffff805`9b3192b3     0001 (0001) nt!VslQueryRuntimeAttestationReport+0x1b3
```

Then my harness asked for a report with an easy-to-spot nonce, `00 11 22 ... ff` twice. The API makes two calls, a size query and the real query, and both hit the breakpoints. Here is the size query arriving in the class handler, with the 48-byte block still in the caller’s memory:

```
==[1] nt!ExpQueryRuntimeAttestationReport
rcx=0000004e44cfef30 edx=30 r8=0000000000000000 r9=0000000000000000
0000004e`44cfef30  01 00 01 00 00 00 00 00-01 00 00 00 00 00 00 00  ................
0000004e`44cfef40  00 11 22 33 44 55 66 77-88 99 aa bb cc dd ee ff  .."3DUfw........
0000004e`44cfef50  00 11 22 33 44 55 66 77-88 99 aa bb cc dd ee ff  .."3DUfw........
    Image: rtattest.exe
```

`rcx` is the user-mode input block, `edx` its length 0x30, and `r8` / `r9` are a NULL buffer and a zero length: a size query. The nonce is in the block, because my harness passes one even for the size query, but the argument block handed to VTL1 a moment later does not contain it. Only `PackageVersion` (+0x08) and the bitmap (+0x10) are set; everything from +0x18 on is zero:

```javascript
==[4] call VslpEnterIumSecureMode
edx=117 cl=2
ffff9684`fedc74d0  00000000`00000000 00000000`00000001
ffff9684`fedc74e0  00000000`00000001 00000000`00000000
ffff9684`fedc74f0  00000000`00000000 00000000`00000000
...
==[5] back from VTL1
eax=c0000023
ffff9684`fedc74d0  00000001`01170102 ffffffff`c0000023
ffff9684`fedc74e0  00000000`00000001 00000000`00000000
...
ffff9684`fedc7510  00000000`00000000 00000000`00002874
```

This is the size-query answer the code predicted, seen from VTL0. VTL1 returns `STATUS_BUFFER_TOO_SMALL`, written over the `PackageVersion` field at +0x08 as a 64-bit value, and the required size, 0x2874 (10,356 bytes), at +0x48. The first QWORD now reads `02 01 17 01 ...`: operation type 2, request code 1 (“done”), service 0x117. The DWORD at +0x04, which NT had set to 0, comes back as 1, so VTL1 wrote it; NT only uses that field when VTL1 asks it to do work on its behalf, which it did not do here.

For the real query, the interesting stop is right after `VslpLockPagesForTransfer`. The data MDL describes a nonpaged pool buffer of exactly the caller’s size, so this is the bounce buffer, not the user buffer:

```javascript
==[3] after VslpLockPagesForTransfer
eax=0
transfer context:
ffff9684`fedc7480  ffffe68c`462a0010 00000000`00000000
ffff9684`fedc7490  00000000`00020038 00000000`00000000
ffff9684`fedc74a0  00000000`00000000 ffffe68c`462a0000
ffff9684`fedc74b0  00000010`00000048 00000000`00102aa0
ffff9684`fedc74c0  00000000`00000008
data MDL:
   +0x000 Next             : (null)
   +0x008 Size             : 0n72
   +0x00a MdlFlags         : 0n4
   +0x018 MappedSystemVa   : 0xffffe68c`4a38b000 Void
   +0x020 StartVa          : 0xffffe68c`4a38b000 Void
   +0x028 ByteCount        : 0x2874
   +0x02c ByteOffset       : 0
```

The transfer context is laid out as section 3.2 describes. At +0x00 is the data MDL’s address, `ffffe68c'462a0010`. From +0x08 comes an embedded MDL that describes the data MDL itself: 0x48 bytes at offset 0x10 in the page `ffffe68c'462a0000`, locked (`MdlFlags` 2). At +0x38 is that page’s PFN, 0x102aa0, and at +0x40 the flags value 8. The data MDL is 72 bytes because the 10,356-byte buffer spans three pages.

The argument block going into VTL1 now carries everything the size query left out: the nonce at +0x18, the data MDL’s address at +0x38 and the PFN at +0x40. That is all VTL1 gets to find the buffer.

```javascript
==[4] call VslpEnterIumSecureMode
edx=117 cl=2
ffff9684`fedc74d0  00000000`00000000 00000000`00000001
ffff9684`fedc74e0  00000000`00000001 77665544`33221100
ffff9684`fedc74f0  ffeeddcc`bbaa9988 77665544`33221100
ffff9684`fedc7500  ffeeddcc`bbaa9988 ffffe68c`462a0010
ffff9684`fedc7510  00000000`00102aa0 00000000`00000000
```

VTL1 answers with status 0 and size 0x2874. The last stop is the copy back to user mode, from the bounce buffer at `ffffe68c'4a38b000` into the caller’s buffer, 0x2874 bytes:

```
==[6] RtlCopyToUser (bounce buffer to caller)
rcx=000001c84bb68ec0 rdx=ffffe68c4a38b000 r8=0000000000002874
ffffe68c`4a38b000  50 52 54 52 01 00 01 00-01 00 00 00 00 00 00 00  PRTR............
ffffe68c`4a38b010  74 28 00 00 0e 80 44 00-00 00 01 00 00 01 00 00  t(....D.........
ffffe68c`4a38b020  e8 26 00 00 00 00 00 00-00 11 22 33 44 55 66 77  .&........"3DUfw
ffffe68c`4a38b030  88 99 aa bb cc dd ee ff-00 11 22 33 44 55 66 77  .........."3DUfw
ffffe68c`4a38b040  88 99 aa bb cc dd ee ff-00 00 00 00 9f be 2f 69  ............../i
...
ffffe68c`4a38b18c  00 00 00 00 e8 26 00 00-61 00 00 00 63 72 61 73  .....&..a...cras
ffffe68c`4a38b19c  68 64 6d 70 2e 73 79 73-00 00 00 00 00 00 00 00  hdmp.sys........
```

That is a finished package, the same layout as the one in section 4.2: magic, version 1, one report, PackageSize 0x2874, `CALG_SHA_512`, a 256-byte signature, my nonce at 0x28, and a driver report with 0x61 (97) entries starting with `crashdmp.sys`. The package my harness received verifies with the IDKS measured in that boot’s TCG log and with no other boot’s key.

* * *

## 4\. In VTL1: Building and Signing the Package

On the other side, `securekernel!IumInvokeSecureService` is the big switch Connor described. It treats the call as a secure service when the operation byte is 2, takes the 16-bit service code from offset +2 and dispatches through a 279-case jump table. Case 0x117 is the only one that reaches `SkProduceRuntimeSignedReport`, and it unpacks the argument block like this:

```css
00019c38  mov     r9, [r14+38h]          ; output descriptor: VA of the VTL0 data MDL
00019c3c  lea     rax, [r14+48h]         ; &size (in/out)
00019c40  mov     rdx, [r14+10h]         ; ReportTypesBitmap
00019c44  lea     r8, [r14+18h]          ; nonce, 32 bytes held inline in the block
00019c48  movzx   ecx, word ptr [r14+8]  ; PackageVersion
00019c52  mov     rax, [r14+40h]         ; PFN of the page holding the MDL
00019c5b  call    SkProduceRuntimeSignedReport
```

Service codes at or above 0xEF skip the initialization-phase and IRQL gates that lower codes go through. `SkProduceRuntimeSignedReport` itself checks only four things: `PackageVersion == 1`, a bitmap of exactly 1 (bits 0 and 1 on 28000.3231), a non-NULL size pointer, and the nonce pointer. There is no caller identity to check, since none crosses the boundary, and no HVCI check in the producer. The nonce pointer always points into the argument block on this path, so the 32 bytes are copied into the package unchanged and never inspected.

### 4.1 Reaching the VTL0 Buffer

`SkmmMapDataTransfer` receives the VA of the data MDL and the PFN of the page that holds it. It maps only the 48-byte MDL header first, through a short MDL, and rejects a header that crosses a page. Then it copies the header and the PFN array into a VTL1 pool MDL and maps the described pages from that copy, writable. Every PFN must first pass `SkmiIncrementSharedPageReferenceCount`, and a PFN that fails raises a Secure Kernel security bugcheck. Because the PFN list is copied before it is validated and used, the NT kernel cannot swap pages under the Secure Kernel after the check.

### 4.2 Assembling and Signing

The package is never built in VTL0 memory. `SkProduceRuntimeSignedReport` allocates a VTL1 pool buffer of the caller’s size (tag `RtRp`), writes everything there, and copies the whole buffer out once, at the end, only if signing succeeded. Condensed from the Hex-Rays output:

```c
pss.pszAlgId = L"SHA512"; pss.cbSalt = 64;                       // BCRYPT_PSS_PADDING_INFO
SkpInitIdkEncryption(IumIdkSigningHandle, &hAlg, &hKey);         // see section 5
N = popcnt(bitmap);
signedSize = 72 + 68*N;                                          // header + nonce + digest headers
BCryptSignHash(hKey, &pss, hash, 64, NULL, 0, &sigLen, BCRYPT_PAD_PSS);   // size only
...
Pool = SkAllocatePool(1, ByteCount, 'RtRp');                     // VTL1 copy, caller-sized
Pool->Magic = 'RTRP'; Pool->PackageVersion = 1; Pool->NumberOfReports = N;
Pool->ReportTypesBitmap = bitmap; Pool->ReportDigestType = CALG_SHA_512;
Pool->TotalReportDigestsSize = 68*N; Pool->SignatureScheme = 1; Pool->SignatureSize = sigLen;
memcpy(Pool->Nonce, nonce, 32);
SkpBuildAuthenticatedRuntimeReports(bitmap, Pool + signedSize + sigLen, &avail);
Pool->PackageSize = avail + signedSize + sigLen; Pool->TotalAuthenticatedReportsSize = avail;
SkpBuildRuntimeReportDigestHeaders(reports, avail, N, Pool + 0x48);   // SHA-512 per report
SkpCngHashData(L"SHA512", Pool, signedSize, hash, 64);
BCryptSignHash(hKey, &pss, hash, 64, Pool + signedSize, sigLen, &sigLen, BCRYPT_PAD_PSS);
if ( sigLen == Pool->SignatureSize ) memmove(vtl0Buffer, Pool, ByteCount);
```

The resulting layout matches the SDK’s comment, with N = 1 on 26100.x and a 256-byte signature:

| offset | size | field | covered by the signature |
| --- | --- | --- | --- |
| 0x00 | 0x28 | `RUNTIME_REPORT_PACKAGE_HEADER` (magic `RTRP`, version 1, N, bitmap, sizes, `CALG_SHA_512`, scheme 1, `SignatureSize`) | directly |
| 0x28 | 0x20 | the caller’s nonce | directly |
| 0x48 | 0x44 | `RUNTIME_REPORT_DIGEST_HEADER`: report type and SHA-512 of the report, header included | directly |
| 0x8C | 0x100 | RSA-PSS signature | is the signature |
| 0x18C | variable | the driver report | only through its digest |

Here is what that looks like in a real package from my machine: the one from the key-lifetime experiment in section 5.5 (182 drivers, 19,793 bytes).

```r
00000000  50 52 54 52 01 00 01 00 01 00 00 00 00 00 00 00   magic, PackageVersion 1, 1 report, bitmap 0x1
00000010  51 4d 00 00 0e 80 44 00 00 00 01 00 00 01 00 00   PackageSize 19793, CALG_SHA_512, 68, Reserved, scheme 1, SignatureSize 256
00000020  c5 4b 00 00 00 00 00 00 9c b1 a1 71 c9 27 4a 61   reports 19397, padding (zero), nonce ...
00000030  36 90 08 98 ab 4e b8 27 fc 9a e2 ac a9 b6 8a 3c
00000040  ef 53 4c 2c 00 1f 43 20 00 00 00 00 59 7f c8 92   ... nonce, digest header: ReportType 0, SHA-512 ...
  ...
0000008c  d5 7a 69 9e 9d 70 35 0a 4d 4c bc 64 cd d1 ca 4a   RSA-PSS signature, 256 bytes
  ...
0000018c  00 00 00 00 c5 4b 00 00 b6 00 00 00               driver report: type 0, size 19397, 182 drivers, flags 0
```

The magic reads `PRTR` in memory because the SDK’s `0x52545250` (“RTRP”) is stored little-endian. Everything up to offset 0x8B is what the signature covers; the 19,397-byte driver report after the signature is covered only through the SHA-512 at 0x4C.

So the signed bytes are exactly the first 140: header, nonce and digest header. The signature is RSA-PSS with SHA-512 and a 64-byte salt over the SHA-512 of those bytes, and the report itself is “authenticated (but unsigned)”, as the SDK puts it, through its digest. And since PSS uses a random salt, asking twice with the same nonce gives two different, equally valid signatures over identical signed bytes, which is what I saw on the test machine (section 11).

What the signed part does not contain matters as much. There is no timestamp, boot counter, boot ID, sequence number, key identifier, device identifier or requester identity anywhere in the package. Freshness is entirely the verifier’s nonce, and the boot binding, if any, comes from the key.

### 4.3 Sizes and Statuses

The package size is `72 + 68*N + SignatureSize + TotalAuthenticatedReportsSize`. The producer has three paths. Without an output buffer (a size query) it runs the builders as a dry run and returns `STATUS_BUFFER_TOO_SMALL` with the required size; that is the status the 7309 kernelbase special-cased. With a buffer that is too small for the header and signature, it does the same dry run. With a big enough buffer it builds for real, and if the driver table grew between your size query and your real query, you get `STATUS_BUFFER_TOO_SMALL` and the new size, with nothing copied.

The one VTL1 refusal that is not about parameters is an empty driver table: `SkpBuildNtDriversReport` returns `STATUS_NOT_SUPPORTED` when nothing has been recorded, and no package is produced. Section 6 shows that “nothing recorded” is exactly what happens when HVCI is off.

* * *

## 5\. The Signing Key

### 5.1 Which Key

The handle is `IumIdkSigningHandle`, the VSM identity signing key. Trehan calls it IDKS and Allievi calls it the Secure Kernel signing IDK; it is the same object. On every request `SkpInitIdkEncryption` copies the stored blob out of the Secure Kernel key store into a temporary pool buffer, imports it with `BCryptImportKeyPair(L"RSAPRIVATEBLOB", ...)`, and wipes the copy; the key handle is destroyed after signing.

The Secure Kernel never generates this key. `SkpCopyKeysFromLoaderBlock` copies it from the loader block (+0x308 size, +0x310 bytes) into the key store and wipes the loader copy; `winload.efi` filled those offsets in `OslVsmProvisionIdk`. Winload generates the key with SymCrypt as RSA-2048 with public exponent 65537, and `OslVsmpMeasureOneIdk` refuses any other size, so `SignatureSize` is 256, which is what real packages show.

The same key also signs VBS enclave reports and a few other Secure Kernel signatures (`SkProduceEnclaveSignedReport`, `SkGetIdkSignatureForData`), with RSA-PSS over SHA-256 and a 32-byte salt. Only the runtime report uses SHA-512 with a 64-byte salt. There is no context label in the signed data. The separation between these uses rests on the PSS parameters and the `RTRP` magic. A standard PSS-SHA-512 verifier rejects the SHA-256 signatures, so as far as I can tell the other signing paths do not produce valid runtime report signatures.

### 5.2 How a Verifier Gets the Public Key

Winload measures the public halves of both VSM keys into the Measured Boot (TCG) log: `SIPAEVENT_VSM_IDK_INFO` (0x50020) for the encryption key and `SIPAEVENT_VSM_IDKS_INFO` (0x50023, “Describes the VSM/IUM identity signing public key” in `wbcl.h`) for the signing key. The payload is `SIPAEVENT_VSM_IDK_INFO_PAYLOAD`: a key algorithm ID of 1, the bit length, the exponent and modulus sizes, then exponent and modulus big-endian. On my machine the event sits in PCR 12 and describes a 2048-bit key with exponent 65537. That is the verifier flow Allievi describes: check a TPM quote over the PCRs, replay the TCG log against it, take the IDKS from that event, and verify the package with it. The quote is what makes the key trustworthy: a key that merely appears in a log file proves nothing.

This is the event from the boot that produced the package above, straight out of `C:\Windows\Logs\MeasuredBoot`:

```
00000000  23 00 05 00 13 01 00 00 01 00 00 00 00 08 00 00   SIPAEVENT_VSM_IDKS_INFO, 275 bytes; KeyAlgID 1, 2048 bits
00000010  03 00 00 00 00 01 00 00 01 00 01 ec 81 29 f0 55   exponent 3 bytes, modulus 256 bytes; e = 01 00 01; modulus ...
00000020  05 c9 79 5b b3 71 68 fc d5 f1 3a 8b ff a9 d3 fc
  ...
```

The measurement only happens when winload sees a TPM 2.0. Without one there is no measured IDKS and therefore nothing to verify a package against.

### 5.3 How Long the Key Lives

This is where the public descriptions stop, and it matters for replay. `wbcl.h` documents two provisioning modes, logged as `SIPAEVENT_IDK_GENERATION_STATUS`: `IDK_PROVISIONING_TYPE_HW` (0), “Uses Cached IDKS if available”, and `IDK_PROVISIONING_TYPE_VTPM` (1), a new IDKS on every boot. `VsmProvisionIdk` implements both. Behind a feature gate and only with a hypervisor present, it takes the VTPM path and always generates new keys. Otherwise it first tries to read a persisted, encrypted key payload, unseal it with the TPM and reuse it, and only if that fails generates new keys, which it seals to PCR values and persists again. My machine logs mode 0. The VM mode is real too: in a Hyper-V virtual machine with a virtual TPM, event 45 (below) reports the unseal step as not performed, the TCG log records `SIPAEVENT_IDK_GENERATION_STATUS = 1`, and every boot gets a new key.

The seal is what decides how long the key lives, so I followed it. The keys are stored encrypted on disk, and what goes into the TPM is the secret that protects that payload. `OslVsmpEncryptAndSealIdk` calls `BlSealSecretToPcrValues` with a NULL PCR-info pointer and the mask 0x766FB5. Hex-Rays gets the first argument of this call wrong, so here is the assembly:

```
0003ad65  xor     r9d, r9d                   ; PCR info = NULL: use current values
0003ad75  mov     r8d, 766FB5h               ; PCR mask
0003ad7b  call    BlSealSecretToPcrValues
```

With no PCR info, `BlSealSecretToPcrValues` reads the current values of the masked PCRs with `SipaReadPcrsByMask` and seals to them. The next boot’s `VsmProvisionIdk` passes the same constant to `TpmApiUnsealEx`. 0x766FB5 selects PCRs 0, 2, 4, 5, 7, 8, 9, 10, 11, 13, 14, 17, 18, 20, 21 and 22. PCR 12, where the boot counter is measured, is not in the set, which is what makes reuse across boots possible at all.

### 5.4 Watching the Key Rotate

Whether reuse happens is visible on any machine without a debugger: winload logs every attempt as event 45 in `Microsoft-Windows-Kernel-Boot/Operational`, “VSM Identity Key Provisioning. Unsealing cached copy status: … New key generation status: … Measuring to PCR status: … Sealing and caching status: …”. On my machine the first four boots after an OS upgrade all failed to unseal and generated a new key, the first with `0xC000000F` (no cached file yet) and the next three with `0xC0280018`. That value is `TPM_E_WRONGPCRVAL` (0x80280018, “The named PCR value does not match the current PCR value”) after the status conversion winload applies, which clears bit 28 and sets bit 30.

To find out what changed, I diffed the TCG logs of consecutive boots, PCR by PCR, over the masked set. Between the first boots the partition table (PCR 5), the Secure Boot `dbx` variable (PCR 7, a revocation update had just been applied) and the boot-module measurements (PCRs 13 and 14) changed. Between the next pair, only one thing differed in the whole log. The trust-boundary event in PCR 13 contained `SIPAEVENT_VBS_HVCI_POLICY = 1` in the first boot and not in the second, because Memory Integrity had been on and then was not. Turning HVCI on or off is enough to rotate the signing key.

That cleanest pair was an accident. I had turned Memory Integrity on for the earlier experiments and rebooted to test persistence, and the report call failed with `ERROR_NOT_SUPPORTED`: HVCI was off again. A local Group Policy on my machine set “Turn On Virtualization Based Security” to Disabled. As far as I can tell from the timing, Device Guard re-applied it early in every boot and wrote `Enabled = 0` back to the HVCI setting, so the Windows Security toggle only ever lasted one boot. Annoying, but it gave me two consecutive boots that differed in exactly one thing.

[![Signing key rotation across five boots](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f5afd15188a302b3.svg)](https://s4dbrd.github.io/assets/img/posts/rtattest-key-rotation.svg) *Five consecutive boots on the real machine. The key is regenerated whenever a masked PCR changes, and only boot 484, where nothing changed, unsealed the cached copy and reused the previous boot’s key.*

### 5.5 Replaying a Package From an Earlier Boot

Then the positive test. I turned HVCI back on and rebooted: the key changed again, as predicted, because PCR 13 regained the HVCI event. In that boot I requested a package with a fresh nonce and rebooted again without changing anything. This time event 45 reported `Unsealing cached copy status: 0x0`, with no new key generated and nothing resealed. The measured IDKS was byte-identical to the previous boot’s. And the package from the previous boot verified with the new boot’s measured key: all 1479 checks of my parser passed.

The boot after HVCI was re-enabled had masked PCRs identical to a boot two reboots earlier. It still did not get that boot’s key back. Only the most recently sealed copy is kept, so returning to an earlier configuration produces a third key. And a package requested in the later boot with the same nonce as the earlier one is just as valid; the two differ only in driver load order and one `Unloaded` flag.

Putting the code and these five boots together: on bare metal in HW mode the IDKS lives as long as the masked PCRs stay the same, which on a stable machine can be many boots. I observed the reuse once, from boot 483 to 484; the rule itself comes from the code. Firmware updates, `dbx` updates, partition changes, boot driver changes and VBS policy changes rotate it. Nothing in a package says which boot produced it, so a package signed in an earlier boot verifies with the current boot’s key whenever the key survived. The key is also handed to the next instance on a Kernel Soft Reboot, and it survives hibernation (section 8).

* * *

## 6\. Where Driver Loads Are Recorded

The report is only as good as the list behind it, so the next question is when a driver gets into that list. There is exactly one way in: `SkmmPrepareImageRelocations` is the only caller of `SkmiAddSecureImageToNtTable`, which is the only caller of `SkAddRuntimeDriverToNtTable`. `SkmmPrepareImageRelocations` is the VTL1 handler of secure service 0x1D, which the PDB calls `SECURESERVICE_PREPARE_IMAGE_RELOCATIONS`.

### 6.1 Who Sends 0x1D

The interesting part is who sends 0x1D. The NT kernel never calls `nt!VslPrepareSecureImageRelocations` directly; it is slot +0x40 of a table called `VslHvciInterface`, which NT hands to `ci.dll` at initialization. CI copies the table, and the only reader of that slot is `ci!CiHvciTransferRelocationInformation`, which CI installs into a validation context only when the image is validated in VTL1. It is called from `CipValidateFileHash` and `CipValidatePageHash`, and only once the hash and signature checks succeeded:

```c
// ci!CipValidateFileHash (26100.9711)
if ( FirstMatch >= 0 ) {
  v23 = *(...)(*(_QWORD *)(a1 + 2760) + 104LL);   // slot +0x68: TransferRelocationInformation -> 0x1D
  if ( v23 != nullptr ) FirstMatch = v23(a1, a2: a4, a3: a5);
  ...
```

On the NT side that validation runs while the driver’s image section is created: `MmLoadSystemImageEx` calls `MiObtainSectionForDriver`, whose section creation ends in `MiValidateSectionCreate` and the CI callback `CiValidateImageHeader`. `IopLoadDriver` calls `MmLoadSystemImageEx` before `PnpCallDriverEntry`. Put together, a runtime driver is recorded after VTL1 has validated its signature and before it is relocated to its system address, before its imports are resolved, and before `DriverEntry` runs.

```rust
nt!IopLoadDriver
  nt!MmLoadSystemImageEx
    nt!MiObtainSectionForDriver -> ... -> nt!MiValidateSectionCreate
      ci!CiValidateImageHeader -> ci!CipValidateFileHash / CipValidatePageHash   (VTL1 validation)
        ci!CiHvciTransferRelocationInformation -> nt!VslPrepareSecureImageRelocations
          secure call 0x1D -> securekernel!SkmmPrepareImageRelocations
            securekernel!SkmiAddSecureImageToNtTable -> SkAddRuntimeDriverToNtTable
  nt!PnpCallDriverEntry
```

The VTL1 handler refuses images that were not validated (flag 0x20 on the image object, which `SkmmFinishSecureImageValidation` sets only after `skci!SkciFinishImageValidation` succeeded), and recording is its last step:

```c
// securekernel!SkmmPrepareImageRelocations (26100.9711)
v8 = SkmiPrepareImageRelocations(a1: v13, a2: (__int64)v20);
if ( v8 >= 0 ) { ...
  v16 = SkmiAddSecureImageToNtTable(a1: v13);
  v8 = v16;
  if ( v16 == -1073741275 || v16 == 0x40000000 || v16 == -1073741432 )  // NOT_FOUND, NAME_EXISTS, 0xC0000188
    v8 = 0;
```

Three results are turned into success: no attestation data for this image, image hash already recorded, and table full. So a driver loads normally in all three cases, and in the last one it loads without being listed. An allocation failure, on the other hand, fails the secure call and the load. Two consequences follow. First, the record means “passed VTL1 validation”, not “ran”: a driver whose load fails after this point, in its imports or in `DriverEntry`, stays recorded. Second, the one success exit that skips the insert is “this image was already prepared”; I first suspected the load-config branches offered another, but they cannot succeed without recording.

### 6.2 The HVCI Gate

Learn says the report requires HVCI, and Section 3 showed that nothing in VTL0 checks it. The check is in the recording path:

```c
// securekernel!SkmmInitSystem phase 0 (26100.9711)
v16 = *(_DWORD *)(SkeLoaderBlock + 1440) & 1;            // loader block +0x5A0, bit 0
SkmiFlags = SkmiFlags & 0xFFFFFFCF | (16 * v16);         // -> SkmiFlags 0x10
// securekernel!SkmiAddSecureImageToNtTable
if ( (SkmiFlags & 0x10) == 0 )
  return 0;                                              // nothing recorded
```

`SkmiFlags & 0x10` is the bit the Secure Kernel reports to NT and CI as “HVCI enabled”, through secure service 0xFB (`SECURESERVICE_QUERY_STRONG_CODE_FEATURES`). CI turns it into `g_CiOptions & 0x8000` and only forwards kernel images to VTL1 validation when it is set. With VBS on but HVCI off, no runtime driver is ever recorded, the table stays empty, and `SkpBuildNtDriversReport` returns `STATUS_NOT_SUPPORTED`. On my machine with VBS on and Memory Integrity off, every well-formed request failed with `ERROR_NOT_SUPPORTED` (50), and the raw syscall returned `STATUS_NOT_SUPPORTED`. I traced winload for that `+0x5A0` bit: `OslpVsmInitializeLoaderBlock` sets it in one place, from the boot-time HVCI level in the VSM policy, so it is 1 exactly when HVCI is on for the boot. NT never sees that secure-kernel block, but winload copies the same policy value into the loader extension’s `IumPolicy` field, which NT does read. I confirmed that live: a kernel debugger attached to the HVCI-on lab VM at boot read `IumPolicy` as `0x283`, whose HVCI-level bits (`0x180`) are `0x80`, that is level 1, HVCI on.

One more filter: `skci` computes the signer thumbprint only for images whose type flags include bit 0 or bit 2, the mask CI uses for kernel-mode images. Without a thumbprint there is no attestation data, the insert returns “not found”, and the image is skipped silently. Only kernel-type images can enter the table.

* * *

## 7\. The Driver Table and the Driver Report

### 7.1 The Table

The list lives in a VTL1 hash table rooted at `SkpNtDriversTable`, initialized once per boot by `SkmmInitSystem` with a cap of 384 entries. That cap is the SDK’s `MaximumDriversRecorded`, which no header defines. Each entry is 88 bytes of zeroed VTL1 pool (tag `NtDr`). The PDB has no type for it, so the fields are offsets:

| offset | size | content |
| --- | --- | --- |
| +0x00 | 8   | bucket chain link |
| +0x08 | 8   | bucket key: first 8 bytes of the image hash |
| +0x10 | 4   | low WORD LoadCount; bit 30 HotPatch; bit 31 Unloaded; bit 29 (BootDriver) never written |
| +0x14 | 4   | insertion index |
| +0x18 | 4   | image hash ALG_ID |
| +0x1C | 4   | thumbprint ALG_ID |
| +0x20 | 8   | pointer to the image hash |
| +0x28 | 8   | pointer to the 20-byte SHA-1 thumbprint |
| +0x30 | 16  | `UNICODE_STRING` InternalName |
| +0x40 | 16  | `UNICODE_STRING` OEM (OPUS program) name |
| +0x50 | 8   | file version, kept but never serialized |

Section 15.4 walks this structure in live VTL1 memory and checks every field in the table above against it.

The key is the image hash and nothing else. `SkAddRuntimeDriverToNtTable` takes the table lock exclusively and looks the hash up. On a hit it only increments LoadCount, saturating at 0xFFFF. Name, thumbprint and ALG_ID are not compared, so one file loaded under two names is one entry. On a miss it appends a new entry if the count is below 384, and otherwise returns `0xC0000188`, which, as shown above, the caller swallows.

```c
// securekernel!SkAddRuntimeDriverToNtTable (26100.9711)
RtlAcquireSRWLockExclusive(a1: &SkpNtDriversTable);
v7 = SkpLookupNtDriverEntryByImageHash(Source2: *(void **)(a1 + 32), Length: v4);
if ( v7 != 0 ) {
  if ( (unsigned __int16)*(_DWORD *)(v7 + 16) != 0xFFFF ) ++*(_WORD *)(v7 + 16);   // LoadCount
  v8 = 0x40000000;                                           // Unloaded bit untouched
} else {
  ...
  if ( (unsigned int)qword_1401324B8 < dword_1401324C0 ) {   // count < 384
    if ( SkpGrowDriversHashTableAndInsert(a1) ) { ... v8 = 0; }
    else v8 = -1073741670;
  } else v8 = -1073741432;                                   // 0xC0000188, table full
}
```

Nothing ever removes an entry. I enumerated every function that touches the table: entries are appended, LoadCount grows, the Unloaded bit gets set, the chain link is rewritten when the bucket array grows, and that is all. This is the real meaning of “append-only”: a VTL1 list that is never pruned for the lifetime of a boot, not a hash chain in the TPM (section 9).

### 7.2 What Is Recorded

Start with the image hash. `SkmmFinishSecureImageValidation` captures it right after `skci` validated the image and keeps it on the image object; the table entry copies it. Which digest that is depends on how `skci` validated the image. On the file-hash path it is the Authenticode digest computed in VTL1 and checked against the signature or catalog. For embedded page-hash signatures it is the Authenticode digest the signer asserted in the signature. On the catalog page-hash path I found no instruction that writes the field, which would leave it zero; on my machine that never happened. I hashed every loaded driver file myself. 173 report entries equal the Authenticode PE hash of a loaded file, 77 of them catalog-signed inbox drivers without an embedded signature, and two more equal the files behind loaded crash-dump copies. The remaining eight belong to drivers that were no longer loaded. No entry had an all-zero hash. The algorithm is per image: 105 entries were SHA-256 and 78 SHA-1.

The signer thumbprint is a SHA-1 hash of the leaf certificate of the last signer entry, computed in VTL1. It is always SHA-1, whatever the image hash algorithm. For a driver signed through Microsoft’s hardware program, that leaf is Microsoft’s certificate, not the vendor’s. The `vgk.sys` entry on my machine carries the thumbprint of “Microsoft Windows Hardware Compatibility Publisher”, although the file also has Riot’s own signature. The vendor shows up in the OEM name instead.

The OEM name is the program name from the signature’s authenticated OPUS attribute. `skci` extracts it only when `CiCompareSigningLevels(signer level, 12)` returns 0, and drops it if it equals “Microsoft Windows” (case-insensitive); the SDK says inbox drivers have none. On my machine 35 entries carried one, for example `vgk.sys` with “Riot Games”.

`InternalName` needed more care, because Trehan’s hotpatch post says the hotpatch report’s image name is queried from VTL0. For the driver report it is not VTL0 text. CI sends the image’s version resource to VTL1 (secure service 0x21). `skci!SkciTransferVersionResource` stores it only if its file offset lies inside the resource range VTL1 derived from the image headers, and only if the active code integrity policy has a particular bit set. VTL1 then parses `InternalName` out of it, and `SkciFinishImageValidation` checks those bytes against the image’s signed page hashes. A mismatch fails the image. So VTL0 cannot inject arbitrary text. It is not fully VTL1-chosen either. VTL0 picks which signed version structure inside the resource range VTL1 parses, signers with a particular flag skip the page check, and the name is simply empty when the policy bit is clear. Two entries on my machine had an empty name. Do not key on it.

### 7.3 Serializing the Report

`SkpBuildNtDriversReport` holds the table lock shared for the whole walk, so entries cannot be added halfway through a report. The walk follows hash buckets, but each entry is written into the slot given by its insertion index, so `DriverEntries[]` comes out in load order. The fields map directly:

| `DRIVER_INFO_ENTRY` field | source |
| --- | --- |
| `InternalName[32]` | entry +0x30, converted to UTF-8; 32 bytes copied with no NUL, longer names cut to 31 bytes |
| `ImageHashAlgorithm` | entry +0x18; hash length from the ALG_ID (SHA-1 20, SHA-256 32, SHA-384 48, SHA-512 64, anything else 0) |
| `PublisherThumbprintHashAlgorithm` | entry +0x1C, always `CALG_SHA1` |
| `ImageHashOffset`, `PublisherThumbprintOffset` | offsets of the bytes in the report’s dynamic area |
| `LoadCount` | low WORD of entry +0x10 |
| `OemNameSize`, `OemNameOffset` | entry +0x40 as UTF-8 plus a NUL, if present |
| `Flags` | Unloaded = bit 31, BootDriver = bit 29, HotPatch = bit 30 of entry +0x10 |

And one real entry: `vgk.sys`, Vanguard’s own driver, the fifth entry of the package above.

```
00000278  76 67 6b 2e 73 79 73 00 00 00 00 00 00 00 00 00   InternalName "vgk.sys"
00000288  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00000298  0c 80 04 80 cb 2a 00 00 eb 2a 00 00 01 00 0a 00   CALG_SHA_256, CALG_SHA1, hash at 0x2acb, thumbprint at 0x2aeb,
                                                            LoadCount 1, OEM name 10 bytes
000002a8  ff 2a 00 00 00 00 00 00                           OEM name at 0x2aff, Flags 0, Padding 0

image hash : 7f9c9d6bc6b08440727733fd34641c76cccaa43f8291f7bdc659129134236a70
thumbprint : 6022340c9f4cb00307df8db036d392adac766212
OEM name   : "Riot Games"
```

In the report header, `NumberOfDrivers` is the number of entries walked. `ReportOverflowed` is set when the count reached 384, so it means “table full” rather than “something was dropped”. `PartialReport` is always 0. `IncludeBootDrivers` would be 1 only if some entry had the BootDriver bit, and nothing sets it. The snapshot is not perfectly consistent: `SkmiFreeNar` sets the Unloaded bit with an interlocked operation after its lookup released the lock, so a flag can change while a report is being serialized.

On my machine the first report had 183 entries in load order, none with BootDriver or HotPatch set, and all three report flags at 0.

* * *

## 8\. Unload, Reload, Boot Drivers, Hotpatch, Hibernate, and Soft Reboot

### 8.1 Unload

When a driver is unloaded, `nt!MiUnloadSystemImage` calls `MiReleasePrivilegedPtes`, which issues secure call 0xD3 through `VslReserveProtectedPages`. That flag-gated release path is active on any VBS system. In VTL1 the request reaches `SkmiFreeNar` for the image’s address range, which marks the table entry:

```c
// securekernel!SkmiFreeNar (26100.9711)
if ( (*(_BYTE *)(a1 + 94) & 6) != 2 ) goto LABEL_71;          // image NAR only
if ( (SkmiFlags & 0x10) != 0 ) {
  v14 = *(_QWORD *)(a1 + 56);                                  // image object
  if ( v14 != 0 ) {
    v15 = SkpLookupNtDriverEntryByImageHash(*(v14 + 192), *(v14 + 200), a3: 0);
    if ( v15 != 0 ) _InterlockedCompareExchange(v15 + 16, v17 | 0x80000000, v17);   // Unloaded
```

Nothing else changes: no decrement, no removal. A BYOVD driver that is loaded, used and unloaded stays in every report for the rest of the boot with `Unloaded = 1`, which is the property an anti-cheat wants. The marking is per image hash, though, so if one file is loaded twice under two names, unloading one marks the shared entry.

### 8.2 Reload, and Why Unloaded Does Not Mean Unloaded

On 26100.7705 through 26100.9711, the duplicate path in `SkAddRuntimeDriverToNtTable` only increments LoadCount and never clears the Unloaded bit. A driver that is loaded, unloaded and loaded again therefore stays `Unloaded = 1` while it runs. 28000.3231 fixes this: its version clears bit 31 when an image hash is recorded again.

The experiment showed it is worse than that, though. I loaded the Microsoft-signed Process Explorer driver: it was appended at the end of the list with LoadCount 1. I unloaded it, and its entry got `Unloaded = 1`. I loaded it again, and the driver was running, but the entry still said `Unloaded = 1` and LoadCount stayed 1. I had predicted LoadCount 2. The static path explains why. When a driver is unloaded, NT can keep its image section cached rather than delete it; on the next load `MiReferenceControlArea` reuses that cached control area, and `ci.dll` finds the image already validated under it, so it does not send secure service 0x1D again. LoadCount is bumped only when 0x1D records an image hash, so a cached reload leaves it at 1. The secure image is closed only when the control area is finally deleted, through `CiReleaseContext`. LoadCount therefore counts VTL1 validations, not loads. I confirmed this in the lab VM: a cached reload of the same driver file left LoadCount at 1, while deleting the file and copying the same bytes back forced a fresh validation that bumped the same hash entry to LoadCount 2, with no new entry added. The first report on the same machine already had six loaded drivers flagged Unloaded, all with LoadCount 1; two of them are the crash-dump copies of storage drivers, which the report lists under their original names. After an S3 sleep the Xbox controller driver’s entry got the flag as well, most likely because its driver was unloaded and loaded again across the sleep transition; I did not trace that.

The practical rule: `Unloaded = 1` means “was unloaded at least once since boot”, never “is not loaded now”. A verifier must not drop such entries.

### 8.3 Boot Drivers

Drivers loaded by winload are never inserted. The boot-driver code in VTL1 (`SkmiConfigureBootDriverPages`, `SECURESERVICE_REGISTER_BOOT_DRIVERS`) calls no table function, and nothing writes the BootDriver bit, so `IncludeBootDrivers` is always 0. That is the SDK’s “in that case the information is stored in the TCG Log” branch, and it is the only one that exists.

The experiment makes the split concrete. Of the 254 kernel modules loaded on my machine, 172 were covered only by the report and 78 only by winload’s module measurements in the TCG log. One was covered by both. Three were covered by neither: the in-memory crash-dump copies (`dump_*.sys`), which the report lists under their original names with `Unloaded` set. Drivers loaded by winload, such as `Ntfs.sys`, `tcpip.sys` and `tpm.sys`, were absent from the report and present in the boot log, including the ones registered only as demand-start (`Ntfs.sys`, `tpm.sys`, `msrpc.sys`). Neither source alone covers the loaded set.

### 8.4 Hotpatches

The HotPatch flag marks a patch image, not the driver it patches: it is set when the image’s own load configuration has a `HotPatchTableOffset`, that is, when the image is itself hotpatchable. Applying or reapplying a patch never touches the table. I traced the full static call closure of every VTL1 hotpatch service, and none of them reach a table function, so a patched driver’s entry does not change. The patch image itself takes the ordinary driver path: `ci.dll` validates it and sends secure service 0x1D, so on an HVCI system it should get its own entry, keyed by the patch’s own hash, with HotPatch set and no OEM name (a patch image is signed at a level that skips OEM-name capture). The one piece I could not pin down is the exact validation flags CI passes for a patch image, so this last step is an inference, not a traced fact, and I could not load a real driver hotpatch to confirm it.

### 8.5 Sleep and Hibernate

The table is initialized only at boot, and neither the hibernate path nor the resume path touches it, so it survives as long as VTL1 memory does. On my machine, the report after hibernate and resume listed the same 192 entries with the same hashes, LoadCounts, flags and order, and its signature verified with the key measured in the original boot. S3 sleep behaved the same, apart from the one controller driver that got flagged Unloaded.

There is a verifier trap here, and I tested it on the real TPM. Resuming from hibernation starts a new Measured Boot log segment (`<boot>-0000000001.log`), and that segment contains no IDKS event: the key is measured only in the boot segment. A verifier that reads “the newest log” finds no key. Worse, the current quote does not cover the boot measurement either. I read PCR 12 (where the IDKS is measured), hibernated the machine, and read it again after resume: it had changed, from `66e57fa6...` to `205d8d11...`, and the update counter had jumped. Hibernation powers the TPM off, resume re-measures the PCRs from zero, and the resume path never re-logs the IDKS. Replaying the two segments against the post-resume PCRs makes it explicit: the boot segment, which holds the IDKS event, no longer matches the live PCR 12, while the resume segment, which has no IDKS, matches exactly. So a TPM quote taken after a resume cannot anchor the signing key at all. A verifier must use the boot-segment log and the boot-time quote, not the newest log and not a post-resume quote.

### 8.6 Kernel Soft Reboot

A Kernel Soft Reboot replaces the running kernel without a firmware reset, and it is the one transition where the signing key outlives the table. Section 5.3 covered the handover: the IDKS is slot 3 of a nine-slot set the old Secure Kernel exports before it halts. The table is not in that set. Nothing registers it, and no driver-table function is reachable from any of the KSR entry points.

The loading side sits in `skksrext.sys`, a kernel extension that ships on Server and Azure host SKUs and is absent on mine. That is why I first wrote this step off as untraced. The binary is on Winbindex, though, so being absent locally never stopped me analysing it. One caveat: it is not indexed at 9711. The newest copy is 10.0.26100.6725, so this subsection alone is from an older build than the rest of the post.

VTL0 drives the load through `KsrApiCall`, which dispatches to `KsrpApiLoadDriver`. From there:

```
KsrApiCall
  KsrpApiLoadDriver
    KsrLoadLoader
      KsrpSkLoadAndValidateImageData   open, read, allocate, bounds-check headers
      KsrpSkBindImageImports           resolve imports by name
      LdrRelocateImage
      KsrpSkCallDriverEntry            build a 0x1B0 loader block, call the entry point
```

`KsrpSkCallDriverEntry` reads `AddressOfEntryPoint` through `RtlImageNtHeaderEx`, allocates a 0x1B0-byte block with pool tag `KSR` , stores the image base and size in it, and calls the entry point with that block as its first argument.

Two things follow. First, the table cannot be reconstructed on the far side. `skksrext.sys` imports 77 functions from `securekernel` and not one of them touches attestation, reports or the driver table. Its only image-related imports are `SkmmPreRegisterHvImage`, `SkmmCommitPreRegisterHvImage` and `SkmmCancelPreRegisterHvImage`, and none of the three has a call site in the binary at all: each appears only in the import thunk table and the control-flow-guard tables. None of the 432 functions in the PDB is named for a hash, a signature, a catalog or an attestation.

Second, and I did not expect this: the image is not cryptographically validated. Despite the name, `KsrpSkLoadAndValidateImageData` calls only file I/O, page allocation and `RtlImageNtHeaderEx`. Of its fifteen indirect calls through the Secure Kernel service table, the ones I could name are `ZwOpenFile`, `ZwQueryInformationFile`, `ZwClose`, `ExAllocatePoolWithTag`, `ExFreePoolWithTag`, `MmMapLockedPagesSpecifyCache` and `MmUnmapLockedPages`. The validation it performs is structural: it bounds-checks the PE headers and returns `STATUS_INVALID_IMAGE_FORMAT` when they do not fit. So this load does not pass through the `ci.dll` to secure service 0x1D to `SkmiAddSecureImageToNtTable` pipeline that section 6 describes, and the image it starts is never recorded in the table.

Four of those fifteen slots I could not name, and I want to be exact about what that costs. They have no name entry in the `.rdata` dynamic-import table and no thin wrapper carrying a PDB name, unlike every other slot in that table. From the argument shapes they are an open, a query and a close over one handle, plus a read-like call that takes a length from the image context. If one of them were a signature check I would have missed it, so read “not cryptographically validated” as bounded by those four.

What remains open is the next step out. `KsrLoadLoader` loads and starts a loader image, not a Secure Kernel. Whether that loader then brings up a fresh Secure Kernel is not visible in `skksrext.sys`, and I have no SKU that performs a KSR to watch it happen.

* * *

## 9\. No TPM: Correcting “Append-Only Hash in the TPM”

Riot’s post and the press coverage describe the feature as measuring every on-demand driver into the TPM, “a sort of continual, cumulative hash of all drivers that have been loaded since boot”. I looked for that from every angle I could think of, and it is not there.

-   `securekernel.exe` has 41 imports, from `skci`, `cng` and two kernel extension sets; `skci.dll` imports only from the Secure Kernel; `ntoskrnl.exe` imports nothing TPM-related.
-   The `_SKSERVICE` enum has no TPM, PCR, TCG, SIPA or measurement service, so NT has no secure call with which to ask VTL1 to extend a PCR.
-   The only TPM-named functions in the Secure Kernel belong to trustlet key binding. None of the functions matching `Tpm|Tbs|Tcg|Pcr|Measure|Sipa|Wbcl` appears within five calls of the recording, unload or report functions, and none of the NT matches is within four calls of `IopLoadDriver`, `MmLoadSystemImageEx` or `MiUnloadSystemImage`.
-   `SkProduceRuntimeSignedReport` itself calls no TPM function.

So runtime driver loads are not measured into the TPM. They are recorded in a VTL1 table that is never pruned and exported in a package signed with the IDKS. The TPM is involved only at boot. Winload seals the secret protecting the stored IDKS to PCR values and measures the key’s public half into the TCG log, which is what lets a remote verifier trust the key. The security property Riot describes (the list cannot be rewritten after the fact by a kernel attacker) does hold, but it comes from VTL1 isolation and the signature, not from the TPM.

* * *

## 10\. History: An Empty Signed Report, Then a Table, Then CodeIntegrity

The servicing history explains some of the odd edges.

### 10.1 26100.7309 (December 2025): A Signed Empty Report

The API, the NT path and the VTL1 producer ship together, but `SkpBuildAuthenticatedRuntimeReports` calls nothing. For bit 0 it emits a constant 16-byte driver report: `ReportType 0`, `ReportSize 16`, `NumberOfDrivers 0`, flags 0, and a DWORD 1 at +0x0C that no SDK field explains. The rest of the package, header, nonce, digest and PSS signature, is built exactly as on 9711. So from 7309 to 7623 every machine returned a validly signed report saying “no drivers”.

### 10.2 26100.7705 (January 2026): The Table Arrives

The Secure Kernel gains the driver table and the recording path, `skci` gains `SkciCalculateImageAttestationData`, and `skci!SkciTransferVersionResource` gains the active-policy check on the version resource. The NT side changes in two ways: the secure call number moves, and the kernel now reads the output length once and refuses to copy more than that. kernelbase drops the size-query special case. From here on an empty table produces `STATUS_NOT_SUPPORTED`, never a signed empty report. 26100.7705 to 26100.9711 changes only the secure call number on the NT side.

That combination creates a downgrade case. The package carries no OS build, and only the 7309 to 7623 builds ever sign a driver report with zero drivers. A verifier that rejects `NumberOfDrivers == 0` cannot be fooled by a machine held at an old update into reporting “nothing loaded”; one that treats zero entries as clean can be.

### 10.3 28000.3231 (26H1): The CodeIntegrity Report

On 26H1, kernelbase, NT and VTL1 accept bits 0 and 1, and bit 1 appends a CodeIntegrity report built by `skci!SkciBuildAttestationReport`. It does not describe drivers. It is a snapshot of the code integrity state, built when a policy is committed, not when the report is requested. The snapshot is one generation (`NumberOfGenerations` is always 1, although the SDK allows more) with a `CommitTime` taken from the Secure Kernel’s reference time, a since-boot counter rather than wall-clock time. Its records reuse the Measured Boot event codes: first `SIPAEVENT_OS_REVOCATION_LIST` with the driver blocklist’s creation time and SHA-256 digest, then the active base and supplemental policies with their signers. For a verifier that is the more interesting report, since it says which blocklist and which policies are enforced right now. The same build also fixes the sticky Unloaded flag, but it looks the hash up before taking the table lock and does not look again afterwards. Two concurrent 0x1D calls for the same new hash could insert it twice; on the normal load path the Mm load lock prevents that.

The SDK preview 10.0.29648 adds a third type, `RuntimeReportTypeHotpatch = 2`, which Trehan’s post describes and which needs an Insider build. None of the builds I analyzed accepts bit 2.

* * *

## 11\. On a Real Machine

Static analysis predicts; a real machine says whether the predictions hold. Everything above was checked on my own desktop: Windows 11 26H2 (binaries 10.0.26100.9711), an AMD Ryzen 9 5900X with a TPM 2.0, Secure Boot on, VBS on, and Memory Integrity toggled per test. A small C harness calls the API and the raw syscall across a parameter matrix and inventories the loaded modules; a Python parser checks every package field against the SDK layout, recomputes the SHA-512 digests, pulls the IDKS from the TCG log and verifies the RSA-PSS signature. I wrote down the expected result before each run, so a wrong one would count. One was wrong: I expected reloading the Process Explorer driver to push its LoadCount to 2, and it stayed 1, which is what sent me to the cached-control-area path in section 8.2. Everything else held, and the results sit in the sections above where they belong.

Some planned experiments did not run on this machine. Loading a known-vulnerable or blocklisted driver on a daily-use machine opens a local privilege escalation path for as long as it is loaded, and it would exercise the same recording path the Process Explorer load already did. The test-signing, debugging and report-poisoning experiments all need test-signing. On this machine `bcdedit` refuses both `testsigning on` and `debug on`: “The value is protected by Secure Boot policy and cannot be modified or deleted.” Turning Secure Boot off would not help either. This machine’s VBS configuration requires Secure Boot, and from my reading of winload, VBS is then simply not started for that boot. There would be no report to test. The next section comes back to what that means. Kernel debugging is blocked on this machine for the same reason, so the live WinDbg trace in section 3.4 ran in the Hyper-V virtual machine.

* * *

## 12\. Using the Report as a Defender

The report is worth having: it gives a remote party a list of runtime drivers that a kernel attacker cannot rewrite after the fact. But it proves nothing unless it is verified completely, and even a fully verified report is blind to some things by design. Here is how to use it, and where it stops.

Verify it completely. The checks, in order:

1.  Verify a TPM quote with your own nonce, replay the TCG log against the quoted PCRs, and from the replayed log require HVCI (`SIPAEVENT_VBS_HVCI_POLICY = 1`) and reject test-signing and debugging. Without HVCI nothing is recorded and the API returns `ERROR_NOT_SUPPORTED`, so a missing report is a finding, not a pass.
2.  Take the IDKS from `SIPAEVENT_VSM_IDKS_INFO` in the boot segment of the log, and anchor it with the boot-time quote. A hibernate-resume segment has no IDKS event, and a post-resume quote no longer matches the boot segment, so neither can vouch for the key.
3.  Issue a fresh, single-use, server-side nonce for each report and check it in the package. The key alone does not prove the package came from the current boot: it survives every reboot that leaves the sealed PCRs alone, so an earlier boot’s package verifies with today’s key, and the nonce is copied verbatim and never checked for reuse.
4.  Check magic `RTRP`, version 1, the bitmap, digest type and signature scheme, verify RSA-PSS with SHA-512 and a 64-byte salt over the first `72 + 68*N` bytes, and recompute every report digest.
5.  Parse defensively: a driver report that does not parse is malformed, not empty (section 13.1), and `NumberOfDrivers == 0` should never be accepted from a current build, since only the 26100.7309-to-7623 era ever signed an empty report.
6.  Treat `ReportOverflowed` as an incomplete list; it means the 384-image table filled, and past that point drivers load without being listed. Never drop entries with `Unloaded = 1`: it means “unloaded at least once since boot”, not “gone now”, and it is tracked per image hash. Key on the image hash. The signer thumbprint is often just Microsoft’s hardware publisher certificate, shared by every driver signed through that program, and `InternalName` and the OEM name are labels, not identity.
7.  Get boot-start drivers from the TCG log; the report never has them.

Then there is what even a perfectly verified report cannot see. These are not bugs; they are the shape of the feature.

-   **Allowed but vulnerable drivers look like any other entry.** An entry is identity only: hash, thumbprint, names, LoadCount, flags. The blocklist is applied by CI at load time, and a driver it allows is recorded like any other. The useful part is that it stays listed after it unloads.
-   **Post-load exploitation, data-only attacks and DMA.** The list changes only when a new kernel image is validated or a recorded image’s range is released. Exploiting an already loaded driver, tampering with kernel data, removing callbacks or device DMA never touch it.
-   **Hotpatched code.** The HotPatch flag says an image is hotpatchable; applying a patch changes nothing in its entry.
-   **Test-signing and debugging are not in the package;** only the TCG log’s events record them, which is why step 1 reads them from the quoted log. On a machine whose VBS configuration does not require Secure Boot, a report can even be produced with a kernel debugger attached, visible only as `SIPAEVENT_OSKERNELDEBUG = 1` in the log.

Correlating report entries with endpoint telemetry takes one extra step. Defender XDR’s `DeviceEvents` table and Sysmon’s driver-load event document only file hashes (SHA-1, SHA-256, MD5, and IMPHASH for Sysmon). The report identifies a driver by its Authenticode PE hash instead, so the agent has to compute that hash for the loaded files and upload the mapping. On my machine every loaded driver’s report hash matched its file’s Authenticode PE hash, so the mapping works. The research artifacts include KQL queries for Defender XDR and Sentinel built on that mapping, and Sigma rules for the weakening steps (HVCI disabled in the registry, `bcdedit` changes). I have not run the queries against a live tenant.

* * *

## 13\. Bugs and Sharp Edges

None of these lets VTL0 forge or alter a report. They are places where a careless verifier, or an unusual signer, gets surprising results.

### 13.1 A Long OEM Name Leaves a Signed but Broken Report

I traced this statically and then reproduced it on the lab VM. `SkpBuildNtDriversReport` converts each OEM name to UTF-8 in a 256-byte scratch buffer. `skci` does not cap the name on the way in; it keeps up to about 64 KB, so a name longer than 256 UTF-8 bytes is reachable. When one is reached in the fill pass, `RtlUnicodeToUTF8N` returns `STATUS_BUFFER_TOO_SMALL` and the function returns that status without writing the driver report header or its size. The outer builder, `SkpBuildAuthenticatedRuntimeReports`, treats `STATUS_BUFFER_TOO_SMALL` as “size-only pass, keep counting”, adds the unchanged byte count and returns success, and `SkProduceRuntimeSignedReport` signs a package whose driver report header was never written.

Report generation is not blocked. Because entries are never removed, any fill request that reaches the long-named entry for the rest of that boot returns a validly signed but malformed package, with a driver report header of all zeros whose digest covers nothing. The entries built before the failure sit inside the package but outside every digest. A verifier that checks the signature and the digests and then treats an unparseable driver report as “no drivers” would be blinded. To reproduce it I signed two throwaway drivers with a self-signed certificate on the test-signing lab VM: one with a short program name and one whose `signtool /d` description is 300 bytes, which becomes the OPUS program name. The control driver confirmed something I had wrong: a test-signed driver *does* get its OEM name captured. It appeared in the report as `rtattest E14 control`, with an image hash equal to the file’s Authenticode hash, in a clean 96-entry report. I had assumed the signing level would bar the capture; it does not, which is the only reason this experiment works at all.

The long-named driver then did exactly what the trace predicted. The package came back structurally intact, magic `RTRP`, version 1, `PackageSize` matching the file, a 256-byte signature in place, but its driver report header read `ReportType 0`, `ReportSize 0`, `NumberOfDrivers 0`, with the real entry bytes still sitting in the buffer behind the zeroed header. Walking the VTL1 table from the host (section 15.4) with both drivers loaded showed the root cause directly: the table had grown to 97 entries, and the long driver’s entry held its full 300-byte program name. So `skci` does store the name uncapped; the overflow is only in the report builder’s 256-byte scratch buffer, never in the table. The report does not parse. A larger buffer (required + 4096) produced the same zeroed header, so it is not a sizing artifact. The one thing I could not check on this VM is the signature itself: the VM has no vTPM, so there is no measured IDKS to verify against (section 5.2). The 256-byte signature is present in every package; I just cannot anchor it to a measurement here.

The defense on the verifier side is cheap regardless: a driver report whose `ReportSize` is smaller than its 12-byte header, or whose entries do not fit inside it, is malformed and must fail verification, not be read as “no drivers”.

### 13.2 Smaller Edges

-   **OEM name sizing.** The size pass reserves one byte per UTF-16 unit of the OEM name, but the fill writes UTF-8, which is longer for non-ASCII names. With a buffer of exactly the queried size, a later driver whose estimate no longer fits is skipped (zero slot, still counted), or the call fails with `STATUS_INTERNAL_ERROR`. With a larger buffer, the extra bytes fall outside `ReportSize` and therefore outside the digest. Allocating a little more than the queried size avoids the first problem.
-   **InternalName** is copied without a NUL when it is exactly 32 bytes, and cut to 31 bytes, possibly inside a UTF-8 sequence, when longer.
-   **Unknown hash algorithms.** An image whose hash ALG_ID is not one of the four SHA variants gets hash length 0, and all such images would collapse into one entry. I could not establish whether `skci` ever produces such an ALG_ID for a validated kernel image.
-   **Big buffers.** A `*ReportBufferSize` above about 2 MB fails with `ERROR_INVALID_PARAMETER`.
-   **Unloaded flags mid-report.** They can change while a report is serialized (section 7.3).

* * *

## 14\. What I Could Not Verify

A few things in this post stayed open. Over time several of the original ones closed, so this list is shorter than it was; what follows is what I still cannot show.

-   Whether a driver hotpatch is recorded as its own entry. The VTL1 path records it (section 8.4), and walking the live table (section 15.4) would have shown it directly, but no hotpatchable image was loaded on the lab VM, so its cleared HotPatch bit proves nothing. The exact validation flags CI passes for a patch image, and a live test with a real hotpatch, are still open.
-   Kernel Soft Reboot, one step short. The key handover, the driver table not being carried across, and the loading step in `skksrext.sys` are all traced now (sections 5.3, 8.6). What is still open is whether the loader image that `skksrext` starts goes on to load a fresh Secure Kernel. Nothing in `skksrext` shows that, and I have no SKU that performs a KSR to watch it.
-   The CodeIntegrity report, only statically, from the 26H1 (28000) binaries; the 26H2 media I had still runs the 26100 Secure Kernel, which does not build it.
-   Tracing VTL1 execution in software. I can now read VTL1 memory from the host, walk the driver table and match every field against the static layout (section 15), but that is a snapshot, not a trace. A VTL0 debugger stops at the boundary. The way Connor did it is a hardware debugger over Intel DCI (SourcePoint), which needs an Intel CPU; this machine is AMD.
-   One signature I could not anchor. The long-OEM-name package (section 13.1) was reproduced on a lab VM with no vTPM, so there was no measured IDKS to verify its 256-byte signature against (section 5.2). The package is structurally valid and signed; I just could not check the signature cryptographically on that machine.

* * *

## 15\. Reading VTL1 from the Host

An earlier version of this post ended by saying the Secure Kernel’s memory was unreadable from the host. The WinHv interface returned zeros where securekernel should be, a hypervisor debugger would not hold a session through nested virtualization, and the one driver that does a SLAT bypass carried a revoked certificate my HVCI desktop refused to load. That last part pointed at the answer: if the blocker was the host’s own HVCI, the experiment could run from a host whose security I was willing to take apart.

### 15.1 The Setup

The target is a Hyper-V virtual machine running the same 26100.9711 build with VBS and HVCI on. The tool is [LiveCloudKd](https://github.com/gerhart01/LiveCloudKd) v3.3.2 by gerhart01, a Hyper-V memory introspection toolkit whose SDK (`hvlib.dll`) and Python wrapper expose two read interfaces. `ReadInterfaceWinHv` (method 2) uses the standard WinHv API and sees only VTL0. `ReadInterfaceHvmmDrvInternal` (method 1) loads `hvmm.sys`, a kernel driver signed with a revoked Atheros certificate, and through it manipulates the guest’s second-level address translation tables directly, bypassing the VTL0/VTL1 split. Loading `hvmm.sys` requires the host to have HVCI off, VBS off, Secure Boot off and test signing on. To inspect VTL1 isolation you have to defeat it on the machine doing the inspecting.

I tore down the host for this: disabled VBS and HVCI in Group Policy, turned off Secure Boot in firmware, enabled test signing with `bcdedit`, and loaded `hvmm.sys` with `sc create` and `sc start`. The guest kept its own VBS and HVCI running throughout. All reads ran from a Python script on the host, calling `hvlib.dll` through ctypes.

### 15.2 Finding the Secure Kernel

A brute-force scan reads guest physical memory in 16 MB blocks through `SdkReadPhysicalMemoryBlock`, checking page-aligned offsets for an MZ/PE header. The Secure Kernel is identified by its SizeOfImage (0x175000 for the 9711 build), a kernel-range ImageBase above `0xfffff80000000000`, and at least ten sections. An earlier run without those last two filters picked up a false positive at GPA `0x4ff000` that had a user-mode ImageBase and three sections. The scan found `securekernel.exe` at GPA `0x16d1000` with TimeDateStamp `0x88c2fa26`, matching the on-disk binary. `ntoskrnl` sat at GPA `0x4b62000`.

### 15.3 Reading Runtime Globals

Physical reads work for the PE header because the image’s first pages happen to be contiguous. BSS globals are a different story: the Secure Kernel initializes them at runtime into pool pages at scattered GPAs, so a flat physical range around the PE header returns zeros for `.data` offsets like `SkmiFlags` or the driver table counters.

The SDK already solves this. `SdkReadVirtualMemory` walks VTL1’s own page tables to translate a virtual address into its current GPA, then reads that GPA through the SLAT bypass, handling the page scatter in a single call. One operational detail: the SLAT cache that `hvmm.sys` builds goes stale between script invocations, so the driver must be stopped and restarted between runs, or every read in a session must finish before cleanup.

[![Resolving a VTL1 BSS global two ways](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/15b4ed6bbbc72d0d.svg)](https://s4dbrd.github.io/assets/img/posts/rtattest-vtl1-reads.svg) *Why a physical read is not enough. The image header sits in a contiguous block, but `SkmiFlags` lives in a pool page allocated at runtime, so only a walk of VTL1’s own page tables finds the current GPA.*

I pointed the virtual reads at the RVAs from the IDA analysis in sections 6 and 7:

| what | RVA | IDA prediction | live read |
| --- | --- | --- | --- |
| `SkpNtDriversTable` count | 0x1324B8 | runtime value, section 7.1 | 95 (0x5F) |
| `SkpNtDriversTable` capacity | 0x1324C0 | 384, section 7.1 | 384 (0x180) |
| `SkmiFlags` | 0x13CB28 | bit 0x10 = HVCI, section 6.2 | 0x40f1b7, bit 0x10 set |

The capacity of 384 is the value `SkmmInitSystem` passes and the SDK calls `MaximumDriversRecorded`. The 95 entries at the time of the read are consistent with the 97 in the WinDbg trace from section 3.4, which ran a few minutes later with two more driver loads in between. `SkmiFlags` bit 0x10 being set confirms the HVCI gate in section 6.2 was open, which is why the table had entries at all.

As a sanity check I read the first 64 bytes of `.text` through both physical memory (the contiguous block at the image GPA) and virtual memory (the page-table walk). They were byte-identical:

```
cc cc cc cc cc cc cc cc  48 ba 00 00 00 00 00 40
00 00 48 85 15 77 67 12  00 74 17 48 8b 05 76 67
12 00 48 23 c2 48 3b 05  6c 67 12 00 75 04 b0 01
c3 cc 32 c0 c3 cc cc cc  cc cc cc cc 4c 8b dc 4d
```

The `cc` padding (INT3) and the code in between match IDA’s view of securekernel’s `.text` entry.

### 15.4 Walking the Table

Reading the counters proves the globals are populated. Reading the entries proves the layout. The bucket array pointer at RVA 0x1324B0 held `0xffffd1000281e5b0`, so from there it is a matter of walking 384 buckets, following each chain link at +0x00, and decoding the eleven fields section 7.1 lists.

The walk produced exactly 95 entries, the same number as the count field, with insertion indices running 0 to 94 with no gaps. That last part matters: section 7.3 says the report comes out in load order because each entry is written into the slot its insertion index names, and a contiguous run from zero is what that requires. For all 95 entries the bucket key at +0x08 equals the first 8 bytes of the image hash reached through the pointer at +0x20, which is the keying rule section 7.1 describes, checked against live memory rather than inferred from the lookup code.

```objectivec
idx  InternalName        LoadCount  image hash alg  flags
0    crashdmp.sys        1          CALG_SHA_256    -
1    diskdump.sys        1          CALG_SHA_256    Unloaded
2    storvsc.sys         1          CALG_SHA_256    Unloaded
3    vmbkmcl.sys         1          CALG_SHA_256    Unloaded
4    dumpfve.sys         1          CALG_SHA_256    Unloaded
5    cdrom.sys           1          CALG_SHA1       -
...
```

The per-image algorithm split is real: 53 entries were SHA-256 and 42 SHA-1, while the thumbprint ALG_ID was `CALG_SHA1` on all 95, each with a 20 byte thumbprint. That is section 7.2’s “always SHA-1, whatever the image hash algorithm”, confirmed.

Every entry had LoadCount 1, and the BootDriver and HotPatch bits were clear on all 95, which is what section 7.3 predicts for BootDriver since nothing writes it. `Unloaded` was set on seven, four of them the crash-dump copies the report lists under their original names. One entry carried a zero-length `InternalName` with a perfectly good hash and thumbprint, so the advice not to key on that field is not theoretical. None carried an OEM name, which fits a guest whose drivers are all inbox Microsoft images.

One correction to make here, because it caught me. The count is not the qword at RVA 0x1324B8. The live value there was `0x4b0000005f`: the low DWORD is 95 and the high DWORD held an unrelated `0x4b`. Reading the whole qword gives 322,122,547,295 drivers. The Secure Kernel itself only ever casts that qword to `unsigned int` before comparing it against the capacity DWORD, which is why the stray high half does no harm in the code and does plenty of harm to anyone reading the field from outside.

No hotpatchable image was loaded on this guest, so its HotPatch bit tells me nothing about whether a patch image gets its own entry. That question stays where section 8.4 left it.

### 15.5 The Isolation Contrast

The same script then switched to the WinHv interface and read the same guest physical addresses. At ntoskrnl’s GPA, WinHv returned a valid MZ header: VTL0 memory is visible. At securekernel’s GPA, it returned 64 bytes of zeros.

[![Reading VTL1 from the host through a SLAT bypass](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/201cef971a1bd7b0.svg)](https://s4dbrd.github.io/assets/img/posts/rtattest-slat-bypass.svg) *The same two guest-physical addresses read through both interfaces. WinHv honours the SLAT, so it reads `ntoskrnl` in VTL0 and gets nothing but zeros at securekernel’s GPA. `hvmm.sys` rewrites the SLAT entries from the host kernel and reads the image in full.*

That is VTL1 isolation doing what section 2 describes. VBS keeps the Secure Kernel’s pages out of VTL0’s physical address space, and any interface that respects the SLAT sees nothing there. `hvmm.sys` reaches those pages because it rewrites the SLAT entries from the host kernel, outside the guest hypervisor entirely.

### 15.6 Reproducing This

1.  Set up a Hyper-V VM running Windows 11 24H2 (26100.x) with VBS and HVCI enabled in the registry (`EnableVirtualizationBasedSecurity = 1` and `HypervisorEnforcedCodeIntegrity = 1` under `HKLM\SYSTEM\CurrentControlSet\Control\DeviceGuard`). Enable nested virtualization on the VM processor (`Set-VMProcessor -ExposeVirtualizationExtensions $true`).
    
2.  On the host, disable VBS and HVCI via Group Policy, turn off Secure Boot in firmware, and enable test signing (`bcdedit /set testsigning on`). Reboot. This opens the host to unsigned kernel drivers, so do it on a lab machine.
    
3.  Download [LiveCloudKd v3.3.2](https://github.com/gerhart01/LiveCloudKd) by gerhart01. The SDK (`hvlib.dll` and `hvlib.py`) is under the `sdk/` directory. Load the driver:
    
    ```
    sc create hvmm binPath= "C:\path\to\hvmm.sys" type= kernel
    sc start hvmm
    ```
    
4.  Use `ReadInterfaceHvmmDrvInternal` for VTL1 reads. `ReadInterfaceWinHv` sees only VTL0 and is useful as a contrast. For BSS globals, call `SdkReadVirtualMemory` (`ReadVirtualMemoryBlock` in the Python wrapper), not `SdkReadPhysicalMemory`, because runtime-initialized pages are at non-contiguous GPAs.
    
5.  Stop and restart `hvmm.sys` (`sc stop hvmm` then `sc start hvmm`) between separate script invocations, or do all reads in one session. The SLAT cache goes stale as soon as a process calls `cleanup`, and the next process gets `ReadPhysicalMemoryBlock error` on every read. I lost a run to exactly this.
    
6.  Do not trust `Win32_DeviceGuard.VirtualizationBasedSecurityStatus` as the readiness check. On a Hyper-V host it keeps reporting 2 (“running”) because the hypervisor’s own VSM infrastructure is up, even with host VTL1 switched off and the bypass working perfectly. The only check worth making is a scan: if a few hundred PE images turn up in guest physical memory, the bypass is live; if every block reads as zeros, it is not.
    
7.  When finished, re-enable Secure Boot in firmware, disable test signing, turn VBS and HVCI back on, and reboot. A boot with Secure Boot on will refuse `hvmm.sys` anyway.
    

* * *

## Conclusion

The Runtime Attestation Report is not a TPM hash chain. It is a list that the Secure Kernel keeps in VTL1 memory, one entry per kernel image that passed VTL1 validation since boot, never pruned, and signed on request with a key that winload generated or unsealed at boot and measured into the TCG log. A live read of VTL1 from the host confirmed the table at the exact IDA offsets, with the HVCI gate set and 95 drivers recorded (section 15). That is a different design from what Riot described, but it delivers the property Riot wanted: a kernel attacker in VTL0 can load and unload a vulnerable driver, but cannot make the Secure Kernel forget it.

What surprised me most is how much of the security sits with the verifier. It needs HVCI or there is no report at all, `Unloaded` does not mean unloaded, and the signing key quietly survives every reboot that leaves the sealed PCRs alone, so an old package keeps verifying until a nonce policy says otherwise. None of that is a bug. It is what the report is, and a verifier that does not know it will accept things it should not.

If I continue this, the next steps are the CodeIntegrity report on 26H1, which says which blocklist and policies are enforced right now, and the hotpatch report on the Insider builds. Both use the same package and the same key, so most of this post should carry over.

* * *

## References

1.  Riot Games. “Incoming: Vanguard On-Demand.” *2026*. [https://www.riotgames.com/en/news/vanguard-on-demand](https://www.riotgames.com/en/news/vanguard-on-demand)
2.  Microsoft. “GetRuntimeAttestationReport function (sysinfoapi.h).” *Microsoft Learn, 2026*. [https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-getruntimeattestationreport](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-getruntimeattestationreport)
3.  Microsoft. “December 1, 2025: KB5070311 (OS Builds 26200.7309 and 26100.7309) Preview.” *Microsoft Support, 2025*. [https://support.microsoft.com/en-us/topic/december-1-2025-kb5070311-os-builds-26200-7309-and-26100-7309-preview-5cd455bf-3291-47fa-b0bf-e5f60d0ea7af](https://support.microsoft.com/en-us/topic/december-1-2025-kb5070311-os-builds-26200-7309-and-26100-7309-preview-5cd455bf-3291-47fa-b0bf-e5f60d0ea7af)
4.  Andrea Allievi. “New Year post: Anti-cheat evolution in Windows 11.” *2026*. [https://www.andrea-allievi.com/blog/new-year-post-anti-cheat-evolution-in-windows-11/](https://www.andrea-allievi.com/blog/new-year-post-anti-cheat-evolution-in-windows-11/)
5.  Akash Trehan. “Patch or attack? Inside the Windows Secure Hotpatch Report.” *2026*. [https://www.akashtrehan.com/secure-hotpatch-report/](https://www.akashtrehan.com/secure-hotpatch-report/)
6.  CodeMaxx. “windows-runtime-attestation-report.” *GitHub, 2026*. [https://github.com/CodeMaxx/windows-runtime-attestation-report](https://github.com/CodeMaxx/windows-runtime-attestation-report)
7.  Connor McGarr. “Windows Internals: Secure Calls - The Bridge Between The NT Kernel and Secure Kernel.” *2025*. [https://connormcgarr.github.io/secure-calls-and-skbridge/](https://connormcgarr.github.io/secure-calls-and-skbridge/)
8.  Connor McGarr. “Windows Internals: Dissecting Secure Image Objects - Part 1.” *2024*. [https://connormcgarr.github.io/secure-images/](https://connormcgarr.github.io/secure-images/)
9.  Connor McGarr. “Exploit Development: Investigating Kernel Mode Shadow Stacks on Windows.” *2025*. [https://connormcgarr.github.io/km-shadow-stacks/](https://connormcgarr.github.io/km-shadow-stacks/)
10.  Microsoft. “DeviceEvents (Microsoft Defender XDR advanced hunting schema).” *Microsoft Learn, 2026*. [https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-deviceevents-table](https://learn.microsoft.com/en-us/defender-xdr/advanced-hunting-deviceevents-table)
11.  Microsoft. “Sysmon.” *Microsoft Learn, 2026*. [https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon)
12.  Microsoft. “Introducing Windows Defender System Guard runtime attestation.” *Microsoft Security Blog, 2018*. [https://www.microsoft.com/en-us/security/blog/2018/04/19/introducing-windows-defender-system-guard-runtime-attestation/](https://www.microsoft.com/en-us/security/blog/2018/04/19/introducing-windows-defender-system-guard-runtime-attestation/)
13.  winsiderss. “phnt: ntexapi.h.” *GitHub*. [https://raw.githubusercontent.com/winsiderss/phnt/master/ntexapi.h](https://raw.githubusercontent.com/winsiderss/phnt/master/ntexapi.h)
14.  winsiderss. “System Informer: phnt/include/ntexapi.h.” *GitHub*. [https://raw.githubusercontent.com/winsiderss/systeminformer/master/phnt/include/ntexapi.h](https://raw.githubusercontent.com/winsiderss/systeminformer/master/phnt/include/ntexapi.h)
15.  Tom’s Hardware. “Riot Vanguard adds an on-demand mode that stops anti-cheat loading at boot on secured Windows 11 PCs.” *2026*. [https://www.tomshardware.com/video-games/pc-gaming/riot-vanguard-adds-an-on-demand-mode-that-stops-anti-cheat-loading-at-boot-on-secured-windows-11-pcs](https://www.tomshardware.com/video-games/pc-gaming/riot-vanguard-adds-an-on-demand-mode-that-stops-anti-cheat-loading-at-boot-on-secured-windows-11-pcs)
16.  Microsoft. Windows SDK 10.0.26100.0 headers `winnt.h`, `sysinfoapi.h` and `wbcl.h`; SDK NuGet packages 10.0.28000.2705 and 10.0.29648.1000-preview.
17.  gerhart01. “LiveCloudKd: Hyper-V memory introspection toolkit.” *GitHub*. [https://github.com/gerhart01/LiveCloudKd](https://github.com/gerhart01/LiveCloudKd)
