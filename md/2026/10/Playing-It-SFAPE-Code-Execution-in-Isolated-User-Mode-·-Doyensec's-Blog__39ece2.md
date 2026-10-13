---
title: "Playing It SFAPE: Code Execution in Isolated User Mode · Doyensec's Blog"
source: https://blog.doyensec.com/2026/10/13/Sfape.html
source_host: blog.doyensec.com
clip_date: 2026-10-13T16:36:28+08:00
trace_id: 3ddc1d06-73a3-4855-8a56-8454202742a0
content_hash: 4766f692138bc7e4a6ae8d483571da8c4fd6419d39abaa1982074cc661de6fd2
status: synced
tags:
  - Windows逆向
  - 漏洞分析
series: null
feed_source: Doyensec·漏洞研究
ai_summary: 通过 SFAPE.dll 重复初始化时一处未校验地址的固定四字节写入，逐级升级为 VTL1（Isolated User Mode）内的任意读写与代码执行原语。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3f875244-d011-810e-8166-dc63780365c0
ioc:
  cves:
    - CVE-2023-36880
    - CVE-2024-21423
    - CVE-2026-83498
  cwes: []
  hashes:
    - 1b5b909dcb4d9dc73a036ddfb9b97a80da54925dba72f2c0cce36c58edf5d33a
    - aefedeb6a7f84679c192d3c19f6c08c3e508222574ae5c9e3d0e10fd2dece4af
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过 SFAPE.dll 重复初始化时一处未校验地址的固定四字节写入，逐级升级为 VTL1（Isolated User Mode）内的任意读写与代码执行原语。
> 
> - **信任模型：** VBS 用 hypervisor 把系统切成 VTL0/VTL1，与 ring3/ring0 正交；VTL1 含 IUM 与 Secure Kernel，VTL0 即便有内核权限也无法直接读写 enclave 私有内存。
> - **初始缺陷：** `Initialize` 二次调用时 `g_initialized` 已置位，直接 `write32(request+0x30, 0xC0000510)` 返回，不再做地址校验，目标地址可落在 VTL1。
> - **升级链条：** 把请求放到 RVA `0xE83C`，使 status 命中 `g_enclaveBase` 高 DWORD（`0xE86C`）→ 破坏 `IsInsideEnclave` 范围校验 → 触发 `ClipboardInput` 的 TOCTOU 得到 `memset(ptr,0,len)` → 清零凭据映射表指针高 4 字节 pivot 到 VTL0 伪造节点 → 获得受限的 16 字节读与 64 位写。
> - **代码执行：** 重写 `vertdll` 的可写有效目标表（count `+0x2CCB0`、指针 `+0x2CCB8`）授权任意地址，再用 `RtlCaptureContext` 捕获真实栈与返回点，以 `NtContinue` 按 x64 调用约定调用已有 VTL1 函数（`controlled RSP = captured RSP - 8`）。
> - **收尾与修复：** 借 Secure Kernel syscall `0x08000019`（`EnclaveCopyIntoEnclave` / `EnclaveCopyOutOfEnclave`）绕过原语限制；2026-09 补丁（KB5124008，`10.0.26100.9444`）校验请求范围、限制 `ClipboardInput` 长度并封禁旧 SFAPE 镜像，但同样存在漏洞的旧 Edge enclave 仍未被策略阻止（CVE-2026-83498）。

It is tempting to think of Windows in terms of a simple model: user mode and kernel mode. If a bug lets a user-mode process gain control of the kernel, it’s game over.

Well, for a long time it used to be like that. Protected processes, SMEP, PatchGuard and other mitigations surely raised the bar, but it was [Virtualization-Based Security](https://learn.microsoft.com/en-us/windows-hardware/design/device-experiences/oem-vbs) that added another dimension to that model and made the whole design a lot more complex. Some code does not merely cross from user mode to kernel mode. It crosses into another Virtual Trust Level (VTL), where the normal kernel is no longer the most trusted component in the system. From a VTL0 perspective, the call may look like it disappears into a region whose private memory cannot be inspected even with kernel privileges.

VBS uses the Windows hypervisor to split the system into Virtual Trust Levels. This separation is orthogonal to the user-mode/kernel-mode distinction. On x64, both VTLs can contain ring 3 and ring 0 code. In the VTL1 world, we are talking about Isolated User Mode (IUM) and the Secure Kernel (SK), respectively.

This part of Windows has existed for years now, primarily to support really powerful features such as Hypervisor-Protected Code Integrity and Credential Guard. However, until recently, VTL1 was also pretty exclusive to Microsoft’s code. We are not aware of any third-party trustlets. Technically, a trustlet is just yet another PE file with a special policy, metadata and a signature. Yet, the signature part is a problem - Microsoft simply doesn’t offer a way to properly sign custom trustlets.

Things changed when Microsoft [introduced support for third-party VBS enclaves](https://techcommunity.microsoft.com/blog/windowsosplatform/securely-design-your-applications-and-protect-your-sensitive-data-with-vbs-encla/4179543). These are custom libraries loaded by a normal VTL0 process but running within an isolated address space in VTL1. The host process controls when the library is loaded and which exports are called, but it cannot directly read or write the enclave’s private memory. Those libraries also require a special signature, but this time there is an official path to acquire one through Azure Artifact Signing (formerly Trusted Signing). It’s still a rather picky process and maybe that’s why we couldn’t find any widely known third-party enclaves. On the other hand, several Windows components started relying on enclave DLLs for host attestation, data sealing, etc.

In this post, we examine security vulnerabilities in one of the VBS enclaves shipped with Windows. We will demonstrate how a simple primitive was used for a memory corruption attack that enabled multiple other primitives and effectively led to full control over the enclave instance. The ability to reuse existing VTL1 code makes it a powerful tool for experimenting with hidden parts of the operating system, exploring IUM, and potentially attacking Secure Kernel.

## VBS Enclaves

Let’s start by diving into the world of VBS enclaves.

A VBS enclave provides a small isolated execution unit. It belongs to an ordinary VTL0 host process, but its code executes in IUM and its private memory is protected from direct access by VTL0 code. Microsoft describes it as a software-based trusted execution environment. It does not require Intel SGX or an NPU. The only relevant hardware dependency is what VBS itself requires.

![Diagram of the VBS Enclaves trusted execution environment, src: https://learn.microsoft.com/en-us/windows/win32/trusted-execution/vbs-enclaves](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ac02066e98791e5e.png)

From the application’s point of view, the enclave is a specially built DLL. The host creates, loads, initializes, and calls the enclave using the following simplified API sequence:

```
CreateEnclave
    -> LoadEnclaveImageW
        -> InitializeEnclave
            -> CallEnclave(export, one_parameter)
```

The host process creates an enclave allocation, loads one primary image (the main enclave DLL) and its approved dependencies, initializes the VTL1 threads, and invokes exported functions through [`CallEnclave`](https://learn.microsoft.com/en-us/windows/win32/api/enclaveapi/nf-enclaveapi-callenclave).

Secondary images provide the restricted runtime, low-level operating-system interfaces used inside the enclave, and some cryptography capabilities. The main dependency is `vertdll.dll`, which plays a role roughly analogous to `ntdll.dll` for enclave code. It contains the VTL1 call dispatcher, runtime helpers, and wrappers for Secure Kernel services. Other common secondary images include `ucrtbase_enclave.dll` and enclave-specific cryptographic libraries. The enclave API surface is very restricted: it does not directly expose file-system, networking, or cross-process communication APIs. Enclave code must delegate such operations to its VTL0 host through callouts. This significantly limits the attack surface from the enclave DLL context.

Even though an enclave DLL could potentially reject an unfamiliar host process, in practice, most of the analyzed enclaves do not do that. Therefore, a host process can perform all kinds of experiments on an enclave DLL and feed malicious input data to its exports.

One must remember that the host process running in VTL0 cannot simply access enclave memory. It must treat the enclave like a remote service and pass request structures through exported calls. The memory relationship is asymmetric. Unless restricted by an enclave policy, the enclave code can freely read and write memory belonging to its VTL0 host, just like a normal DLL would. Usually, the host process provides pointers and the enclave works on the data. This also means that an enclave receives data from a less trusted world and must check whether every pointer and nested buffer really points to the expected data. Mistakes can lead to time-of-check/time-of-use (TOCTOU) bugs: for example, a host-controlled structure may be modified after validation. A nested pointer may point at VTL1 data. Length arithmetic may wrap, and so on.

With that model in place, let’s look at earlier research on the offensive use of VBS enclaves.

## Bring Your Own Vulnerable Enclave

In 2023, Alex Gough of Google’s Chrome Platform Security Team reported [CVE-2023-36880](https://github.com/google/security-research/security/advisories/GHSA-wwr4-v5mr-3x9w) in Edge’s `prefs_enclave_x64.dll`. Its `SealSettings` and `UnsealSettings` exports accepted pointers without checking whether they referred to VTL0 or private enclave memory. Chaining the two operations provided arbitrary read and write primitives inside the enclave. That meant unrestricted access to VTL0 and VTL1 portions of the process memory. A later fix was insufficient and left a TOCTOU issue, reported separately as [CVE-2024-21423](https://github.com/google/security-research/security/advisories/GHSA-2phx-8mf9-fq24).

Even though the latest `prefs_enclave_x64.dll` version patched both vulnerabilities, “nothing is ever lost on the internet”. Thanks to the VirusTotal file archive, the old vulnerable enclave is not lost either. For now, Windows does not expose a dedicated vulnerable-enclave blocklist comparable to the Microsoft Vulnerable Driver Blocklist. Certificate revocation or a Code Integrity policy update could prevent an old image from loading, but we successfully used vulnerable builds on multiple recent systems.

This particular vulnerable enclave image was used in two excellent pieces of public offensive research.

[Ori David of Akamai](https://www.akamai.com/blog/security-research/virtualized-insecurity-attackers-weaponize-vbs-enclaves) demonstrated Mirage, which used the vulnerable enclave’s private memory to store payload data beyond the reach of VTL0’s EDR memory inspection. The [Mirage](https://github.com/akamai/Mirage) project is also a place where one can find a copy of that particular vulnerable enclave image.

In their research published by Outflank, Matteo Malvica and Cedric Van Bockhaven turned the Edge read/write primitive into VTL1 code reuse. They described this work in a two-part blog series: [Part I](https://www.outflank.nl/blog/2025/02/03/secure-enclaves-for-offensive-operations-part-i/) and [Part II](https://www.outflank.nl/blog/2025/06/16/secure-enclaves-for-offensive-operations-part-ii/). They upgraded their Outflank C2 implant with a sleepmask implementation that temporarily decommits the implant from VTL0, sleeps inside VTL1, and restores the implant before resuming execution.

This demonstrated that compromising an enclave could provide much more than access to its private data. It might serve as a reusable execution environment inside Isolated User Mode, and a process loading the enclave can benefit from interesting “side effects” (from the VTL0 perspective).

Their work established several important facts:

-   any process can load and use a suitable signed primary enclave image;
-   `CallEnclave` accepts only targets present in `vertdll` ’s valid-target table;
-   primary and secondary enclave images had a predictable relative layout in the examined configurations;
-   the valid-target metadata is writable;
-   VTL1 [Arbitrary Code Guard](https://learn.microsoft.com/en-us/defender-endpoint/exploit-protection-reference#arbitrary-code-guard) blocks the obvious route of allocating fresh executable memory for shellcode;
-   `NtContinue` can restore a controlled VTL1 register context and therefore turn a one-argument `CallEnclave` entry into a much more useful existing-code calling primitive.

We reproduced those results in our tested configurations and confirmed the code-reuse primitive inside `prefs_enclave_x64.dll`. While experimenting with cross-enclave memory access, we began looking into other VBS enclaves.

## Other VBS Enclaves

There are not that many VBS enclaves in the Windows ecosystem, but the list is growing.

Besides Edge’s enclave (which is really used to encrypt [just static configuration data](https://x.com/yarden_shafir/status/2082804936794919419)), Microsoft ships enclave components for:

-   SQL Server’s Always Encrypted feature (`Aetm-enclave.dll`),
-   Windows Search (`sfsenclave.dll`),
-   Microsoft Defender SmartScreen’s Enhanced Phishing Protection (`SFAPE.dll`),
-   Windows Recall functionality (`snapshot_support.dll`, `settings_support.dll`, and a much larger `storage_support.dll`).

Another interesting instance is `sgrmenclave_secure.dll`, related to System Guard Runtime Monitor and attestation. However, a valid Microsoft Authenticode signature was not enough to load either of the collected builds in our lab. Code Integrity rejected them under the active policy.

## SFAPE

One enclave stood out. Enhanced Phishing Protection is both security-sensitive and very easy to see in action.

If you ever type your Windows password into Notepad (*what do you mean it’s a dumb thing to start with?*), with the right Windows 11 policies enabled, Defender’s Enhanced Phishing Protection should immediately catch that. The operating system recognizes that the password used to sign in has just been placed inside an unsafe application and warns you to remove it.

`SFAPE.dll` is the VBS enclave behind this part of [Microsoft Defender SmartScreen](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/enhanced-phishing-protection). The feature monitors typed or pasted text and can warn about phishing pages, password reuse, and unsafe applications such as Notepad or Microsoft 365 apps. The password is intercepted during login and represented in hashed form inside the enclave, so later keyboard or clipboard input can be securely compared without exposing the original credential.

You can see the product workflow without any special hardware:

1.  Enable Enhanced Phishing Protection and the unsafe-app warning.
2.  Sign in to Windows 11 using a password rather than Windows Hello.
3.  Open Notepad and type in your Windows password.
4.  Windows should display an *It’s unsafe to store your password* warning.

![Insecure password handling warning](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/075c91bbf38c84df.png)

This is precisely the kind of workload enclaves were designed for. Even if the VTL0 world is compromised, hashed credentials should remain private, and the code deciding whether two values match should retain its integrity.

Note that `SFAPE.dll` is not loaded by a regular Defender process. Its VTL0 host component is `SFAPM.dll`, an LSA package that exports [`SpLsaModeInitialize`](https://learn.microsoft.com/en-us/windows/win32/api/ntsecpkg/nc-ntsecpkg-splsamodeinitializefn) and is loaded by `lsass.exe`. Running as `NT AUTHORITY\SYSTEM`, LSASS creates the enclave, loads `SFAPE.dll` as its primary VTL1 image, and communicates with it through `CallEnclave`:

On current Windows 11 systems, [LSA protection](https://learn.microsoft.com/en-us/windows-server/security/credentials-protection-and-management/configuring-additional-lsa-protection) is generally enabled by default (still, some policies, compatibility issues, and installation history can affect the state). LSA protection prevents ordinary processes, including ones running as SYSTEM, from reading or injecting code into LSASS unless they have the required protection level. To sum up, it shouldn’t be possible to sniff communication between LSA and an enclave (contrary to the interesting [TotalRecall Reloaded](https://github.com/xaitax/TotalRecall) issue affecting Windows Recall).

## Four-Byte Write

The builds used throughout this research were:

```
SFAPE.dll      10.0.26100.8875  84,192 bytes
SHA-256        AEFEDEB6A7F84679C192D3C19F6C08C3E508222574AE5C9E3D0E10FD2DECE4AF

vertdll.dll    10.0.26100.8972  216,408 bytes
SHA-256        1B5B909DCB4D9DC73A036DDFB9B97A80DA54925DBA72F2C0CCE36C58EDF5D33A

host OS        Windows 11 25H2, build 26200.8973
```

SFAPE exports ten functions: `CharactersInput`, `ClearCc`, `ClipboardInput`, `CloseCcHandle`, `GetCcAttributes`, `Initialize`, `MeasurePerformance`, `SealUnsealCredentials`, `SetCcTimeStamps`, and `UserCredentials`.

The root bug is in the exported `Initialize` function. A simplified version of the relevant decompilation looks like this:

```c
...
status = (uint32_t *)((uint8_t *)request + 0x30);

configuration = request->configuration;
callout       = request->callout;
context       = request->calloutContext;
table         = request->callbackTable;

if (g_initialized) {
    *status = STATUS_ALREADY_INITIALIZED; // 0xC0000510
    return status;
}

EnclaveGetEnclaveInformation(..., &g_enclaveInfo);

if (IsInsideEnclave(request, 0x38))
    return STATUS_CONFLICTING_ADDRESSES;
...
```

On the first call, the function performs extensive validation of the request and many nested callback pointers. On a repeated call, `g_initialized` is already set, so SFAPE writes the error status through `request + 0x30` and returns. Notably, this time there is no address verification - the address can belong to either VTL0 or VTL1. The calling host process controls the `request` parameter. Therefore, after legitimate initialization, the function gives us the following primitive:

```c
write32(request + 0x30, 0xC0000510)
```

So… does it really have any impact? Calling this an arbitrary write would be a huge overstatement. The destination is under our control, but the value is fixed, the address must tolerate the surrounding request shape, and only four bytes are written. At first glance, it is not obvious what else can be achieved here.

Before rejecting it as a useless DoS primitive, let’s look at how SFAPE distinguishes host pointers from enclave pointers.

## Breaking the Range Validator

The range validator is used to protect other exports. Before operating on host-supplied pointers, `SFAPE.dll` uses a common classifier to determine whether an address range overlaps private enclave memory:

```c
bool IsInsideEnclave(uint64_t address, uint32_t size)
{
    uint64_t end = address + size;

    if (end < g_enclaveBase ||
        g_enclaveBase + g_enclaveSize < address)
        return false;

    return true;
}
```

The exact decompiler output was less pretty, but that is the relevant logic. A pointer is accepted only when the calculated range lies outside the enclave memory.

In our build, `g_enclaveBase` is stored at image RVA `0xE868`, followed by `g_enclaveSize` at RVA `0xE870`.

This gives our `write32` primitive a useful target. Remember that `g_enclaveBase` is a 64-bit value, so its high DWORD is located at RVA `0xE86C`. By placing the repeated-initialization request at RVA `0xE83C`, its status field at `+0x30` lands exactly on that high DWORD. We can therefore deterministically overwrite the high DWORD with `0xC0000510` and corrupt the entire pointer. After that, ordinary VTL1 pointers compare as if they were outside the cached enclave range. We successfully broke the logic used by SFAPE’s `IsInsideEnclave` guard function.

By doing this, did we unlock anything useful?

## Upgrading Our Primitives

Defeating the range validator made another bug reachable. `ClipboardInput` accepts a pointer to a host-controlled `UNICODE_STRING`. Its wrapper validates the descriptor and checks `Buffer` for `MaximumLength` bytes. The worker, however, uses `Length` and later rereads both `Buffer` and `Length` before zeroing the plaintext:

```c
// Wrapper
ValidateHostRange(text, sizeof(*text));
ValidateHostRange(text->Buffer, text->MaximumLength);

// Worker
HashClipboardText(text->Buffer, text->Length);
InvokeTelemetryCallout(...); // telemetry callback sync point
SecureZeroMemory(text->Buffer, text->Length);
```

The descriptor remains in writable VTL0 memory throughout the call. The telemetry callback provides a deterministic synchronization point after hashing but before the final `SecureZeroMemory`. While the enclave thread is blocked in that callback, the host replaces `Buffer` and `Length`, then allows the worker to continue. The final primitive becomes:

```c
memset(ptr, 0, length)
```

Another discovery we made is that SFAPE maintains credential-context objects in a global red-black-tree-like map. The pointer to that map is stored at RVA `0xE060` (therefore its high DWORD is at RVA `0xE064`). We can use the above primitive to clear those four bytes. This works as intended only if the original map pointer had a nonzero high DWORD. Otherwise, clearing it would leave the pointer unchanged and we wouldn’t be able to pivot into another memory region.

```
original map pointer:       0xHHHHHHHHLLLLLLLL
after memset(..., 0, 4):    0x00000000LLLLLLLL
```

The low 32 bits remain unchanged, producing a different address in the low 4 GB range. For the pivot to work, our host process reserves a VTL0 buffer that mirrors the enclave allocation and fills it with pointers to a small synthetic tree node. Spraying every aligned qword means that we do not need to know the original heap pointer’s low 32 bits.

Several exported SFAPE functions accept a 32-bit credential-context handle, resolve it through this red-black-tree-like map, and then trust the object pointer present in the resulting node. The node contains a real handle previously returned by `UserCredentials`, but its `object` field resides in VTL0 and remains under our control. We are therefore redirecting the resolution of a legitimate handle rather than inventing one.

This opens up another route. `GetCcAttributes` eventually performs two reads, and its wrapper copies the results into the VTL0 response:

```c
request->attribute2A8 = *(uint64_t *)(object + 0x2A8);
request->attribute2B0 = *(uint64_t *)(object + 0x2B0);
```

If we pick the right address, such as:

```
object = source - 0x2A8
```

we can turn it into a selected 16-byte VTL1 read primitive.

Similarly, `SetCcTimeStamps` provides the inverse operation, resulting in a controlled 64-bit VTL1 write.

```c
*(uint64_t *)(object + 0x2B0) = request->controlledQword;
```

Both primitives are constrained. The object helpers access lock bookkeeping before reaching the useful fields. For the write target `ptr`, the PoC uses:

```
object = ptr - 0x2B0
write32(ptr - 0x29C, 0xC0000510)  // object+0x14: nonzero lock owner
SetCcTimeStamps(real_handle, controlled_qword)
```

The additional `write32` invocation makes the helper skip exclusive-lock acquisition, and the new write primitive works as intended. In summary, these are not clean, universal `memcpy` replacements, but they can be used successfully assuming we pick suitable memory locations or pre-shape their contents.

To recap, at this stage, the chain looks like this:

```yaml
repeated Initialize
        |
        v
fixed write32(0xC0000510)
        |
        v
cached enclave-base corruption
        |
        v
corrupted IsInsideEnclave
        |
        v
ClipboardInput TOCTOU -> memset(address, 0, length)
        |
        v
CC-map pivot -> synthetic object
        |
        +-------------------+
        |                   |
        v                   v
     read16              write64
```

## The Valid-Target Table

With controlled read and write primitives on board, the next obvious step is gaining code execution.

Knowing a useful VTL1 function address is not enough. When VTL1 code is requested, `CallEnclave` enters `vertdll`, and `LdrpIssueEnclaveCall` checks the requested address against an inverted list of approved targets known as `VertValidTargetTable` (VTT). A pointer not present in the table is simply rejected. This is somewhat similar to the standard Control Flow Guard bitmap, but this time the metadata is writable.

For the pinned `vertdll` build, the relevant writable globals are:

```
vertdll + 0x2CCB0  uint32 target count
vertdll + 0x2CCB8  uint64 target-table pointer
```

By replacing the table, we can authorize any existing functions and call them. The VTT check itself does not require an entry to be an exported function start, so ROP gadgets can be used as well.

Instead of overwriting the original VTT, our PoC creates a replacement in a verified writable area at the end of SFAPE’s `.data` section. The host process cannot directly write that private memory, so each qword is written through the `write64` primitive. The table pointer and count are then redirected to this new block. The original pointer and count are preserved so that we can restore them later for a clean state.

At that point we could call existing functions from the primary SFAPE image and its approved secondary images, including `vertdll`. There was still one awkward restriction: an enclave export has the `void *function(void *context)` format, so `CallEnclave` directly gives us control over one argument. Enclave exports know how to extract more data from supplied objects, but most other functions simply require more parameters.

Using `NtContinue` removes that limitation. The technique was originally described in Outflank’s article.

## Capturing a Way Home

[`NtContinue`](http://undocumented.ntinternals.net/index.html?page=UserMode%2FUndocumented%20Functions%2FNT%20Objects%2FThread%2FNtContinue.html) restores the registers described by a Windows `CONTEXT` structure. Controlling CPU registers such as `RIP`, `RSP`, `RCX`, `RDX`, `R8`, and `R9` lets us call an existing VTL1 routine using the normal x64 calling convention. The first four arguments are supplied in registers, and additional arguments are passed on the stack.

An arbitrary fake stack may be enough for a one-shot gadget sequence, but after the target returns the enclave dispatcher still expects its genuine frame. Guessing or rebuilding that would be rather *hard*. The cleaner solution is to just capture it.

The PoC first adds [`RtlCaptureContext`](https://learn.microsoft.com/en-us/windows/win32/api/winnt/nf-winnt-rtlcapturecontext) to the new VTT and calls it in the active VTL1 thread. The captured state contains a real private stack pointer and the normal return site inside `LdrpIssueEnclaveCall`. A private copy of the first `0x2A0` bytes of the x64 `CONTEXT` is then constructed in SFAPE’s writable VTL1 padding.

For a simple call, the important rule is:

```
controlled RSP = captured RSP - 8
```

Once our arbitrary function is executed, it sees a valid return address and returns into the untouched live dispatcher path. Control safely returns to VTL0 (whose context was not modified), and we can keep invoking other exports. While this is not a ROP chain, it can be converted into one. At the same time, our current interface is actually more elegant and easier to maintain. The internal helper supports between zero and sixteen arguments.

To confirm proper control, we ran several `vertdll` tests. We called functions such as `GetCurrentThreadId`, `GetEnabledXStateFeatures`, and `RtlCompareMemoryUlong`, and verified real argument control together with the expected output.

## A Secure Kernel-Assisted Upgrade

The original `read16` and `write64` were enough to build the VTT and continuation chain, but they had some constraints. Once the `NtContinue` calling mechanism was working, `vertdll` itself provided a much cleaner interface.

Two wrappers at RVAs `0x4090` and `0x40B0` enter a non-exported syscall stub:

```
mov r10, rcx
mov eax, 08000019h
syscall
ret
```

The wrappers correspond to:

```c
EnclaveCopyIntoEnclave(vtl1Destination, vtl0Source, length);
EnclaveCopyOutOfEnclave(vtl0Destination, vtl1Source, length);
```

The Secure Kernel service `0x08000019` verifies that the enclave-side range belongs to the current enclave allocation and that the external range lies outside it. Copy-in additionally requires a writable VTL1 destination.

This lifts constraints we had on our previous copy/write primitives.

## Remediation

Microsoft addressed the reported issue in its September Patch Tuesday updates. We compared the affected `SFAPE.dll` version `10.0.26100.8875` with the patched version `10.0.26100.9444`, included in [KB5124008](https://support.microsoft.com/en-gb/servicing/os/windows-11/2026/09/kb5124008-windows-11-24h2-25h2-security-update), released on September 8, 2026.

In the updated SFAPE component, the repeated-initialization path validates the request range before writing the `STATUS_ALREADY_INITIALIZED` value. This change blocks the initial write used in our demonstrated chain, preventing the subsequent memory corruption steps that depend on it.

The `ClipboardInput` function, which could serve as an alternative starting point for the attack, now rejects empty input and inconsistent lengths, limits `MaximumLength` to 512 bytes, and copies the input bytes into enclave memory. Our static comparison indicates that these changes eliminate the descriptor race used in our demonstration.

Finally, the updated VBS Code Integrity policy rejects all older `SFAPE.dll` images, as reflected in the updated `VbsSiPolicy.p7b` file. We began this research assuming that vulnerable enclaves might remain usable even after Microsoft released patches. This turned out not to be the case for SFAPE. However, the vulnerable Edge enclave remains unblocked by the policy, despite the vulnerability having a broadly similar impact. It is unclear whether this was a deliberate decision or an oversight.

## Timeline

| Date | Event |
| --- | --- |
| 2026-08-07 | Reported the `Initialize` fixed-value write bug to MSRC. |
| 2026-08-11 | Informed MSRC that the initial primitive was expanded into full VTL1 code execution inside the test SFAPE enclave. |
| 2026-09-08 | Microsoft released the fix for [CVE-2026-83498](https://msrc.microsoft.com/update-guide/vulnerability/CVE-2026-83498). |
| 2026-09-21 | Microsoft confirmed the issue and informed us that it is a duplicate of an issue identified internally (CVE-2026-83498). |
| 2026-09-25 | The advisory was updated to also credit Doyensec. |
