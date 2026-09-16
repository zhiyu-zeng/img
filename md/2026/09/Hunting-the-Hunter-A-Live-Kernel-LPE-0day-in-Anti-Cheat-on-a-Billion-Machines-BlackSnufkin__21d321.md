---
title: "Hunting the Hunter: A Live Kernel LPE 0day in Anti-Cheat on a Billion Machines | BlackSnufkin"
source: https://blacksnufkin.github.io/posts/Hunting-the-Hunter/
source_host: blacksnufkin.github.io
clip_date: 2026-09-16T10:18:43+08:00
trace_id: 384a30aa-a7d8-4150-b5d3-a506666215e8
content_hash: f021fc548101d50467ef97e905f7639f46c0d45aea8c6a36ad7b62b32a1a717b
status: synced
tags:
  - 游戏安全
  - 漏洞分析
series: null
feed_source: BlackSnufkin
ai_summary: 带微软WHQL签名、号称日活十亿的 XIGNCODE3 反作弊驱动 xhunter1.sys v2023.12.7.78 存在本地提权 0day，普通用户三次 WriteFile 即可拿到 SYSTEM 句柄。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3dd75244-d011-810a-8ea5-e015a7f1cc7b
ioc:
  cves:
    - CVE-2026-15430
    - CVE-2026-3609
  cwes: []
  hashes:
    - 0d1fd685dc98d0c193529df3ddde7144d839f56b7b38251fd7039c33c0fcf760
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 带微软WHQL签名、号称日活十亿的 XIGNCODE3 反作弊驱动 xhunter1.sys v2023.12.7.78 存在本地提权 0day，普通用户三次 WriteFile 即可拿到 SYSTEM 句柄。
> 
> - **漏洞根因：** 认证门只加在“读”白名单的 cmd 785(0x311) 上，而“写”白名单的 cmd 777(0x309) 与 775(0x307) 无任何调用者校验，可自写 PID 的 flag 位；cmd 800(0x320) 同样无认证。
> - **利用链：** 777 置自身 bit31 → 775 置 bit3，使白名单项变为 0x80000008 通过 gate → 785 传入 lsass PID 与掩码 0x1FFFFF，返回 `PROCESS_ALL_ACCESS` 句柄；三步均无需管理员或加载驱动。
> - **四种原语：** 从 PPL lsass 窃取凭据散列/WDigest 明文；用 cmd 800 剥离 `ProtectFromClose` 关闭句柄以杀死 MsMpEng.exe 等 EDR；借 winlogon 令牌获得交互式 SYSTEM shell；cmd 820 由内核分配 RWX 并 `RtlCreateUserThread`，注入任意含 PPL 进程且不触发用户态 EDR 钩子。
> - **防护无效：** 驱动同时带 Wellbia 与微软 WHQL 签名，在启用 HVCI、VBS 和微软易受攻击驱动黑名单的 Windows 11 25H2（build 26200.8457）上照常加载。
> - **覆盖与修复：** Wellbia 按游戏逐个重签，单哈希封堵无效，需用版本号/签名主体/字节特征；重写的 xhunter2.sys v2026.6.1.192 三层密码认证已被绕过（CVE-2026-15430），绝大多数 XIGNCODE3 游戏仍用 xhunter1.sys，且卸载游戏后驱动仍残留磁盘。

## TL;DR

-   **Local privilege escalation** in current production `xhunter1.sys` v2023.12.7.78, the kernel driver behind XIGNCODE3 anti-cheat. Standard user account → interactive SYSTEM shell via three `WriteFile` calls.
-   **[CVE-2026-3609](https://www.cve.org/CVERecord?id=CVE-2026-3609)** now covers this driver. CERT/CC updated the CVE description on 2026-08-05 to read *“version 10.0.10011.16384 through 2023.12.7.78”*, extending coverage from the legacy 10.x build to include the current production binary documented in this post.
-   **The hash below is one of many.** Wellbia rebuilds and re-signs `xhunter1.sys` per-title. The SHA-256 in the driver metadata block is the specific sample I reversed, extracted from one XIGNCODE3-protected Steam title. Other games ship binaries with different hashes, different timestamps, sometimes different embedded signing certificates — all v2023.12.7.78, all vulnerable to the same chain documented below. Anyone building a hash blocklist against this bug needs to canvas the full title catalog, not this one hash.
-   **Signed by Wellbia and Microsoft.** The driver carries Microsoft’s WHQL signature (“Microsoft Windows Hardware Compatibility Publisher”) and loads cleanly on a fully-patched **Windows 11 25H2 (build 26200.8457)** with HVCI, VBS, and Microsoft’s Vulnerable Driver Blocklist all enabled. None of them block this bug.
-   **One billion daily users**, per Wellbia’s own marketing. The driver loads when you run any of 150+ affected PC titles — Black Desert, Lineage II, MapleStory (SEA/JMS), AION, Blade & Soul, and others — and stays on disk after uninstall.
-   **Four primitives from one bug:** credential dump from `lsass.exe`, EDR kill on `MsMpEng.exe`, interactive SYSTEM shell in the user’s session, and kernel-mode code injection into any process (including PPL) via cmd 820.
-   **Wellbia’s attempted remediation failed.** Their response to this class of issue was a full driver rewrite (`xhunter2.sys`, v2026.6.1.192) shipping in newer XIGNCODE3-protected titles including *WindSlayer*. The rewrite added three cryptographic authentication layers around the same vulnerable primitives; all three layers were bypassed. See the follow-up: *[Hunting the Hunter II](https://blacksnufkin.github.io/posts/Hunting-the-Hunter-II/)*.
-   **Update (2026-08-05):** CERT/CC updated **[CVE-2026-3609](https://www.cve.org/CVERecord?id=CVE-2026-3609)** to cover *“version 10.0.10011.16384 through 2023.12.7.78”*, extending the identifier to include the production build documented in this post. Defenders keying on CVE identifiers now have an anchor for this driver.

* * *

If you’re playing Black Desert, Lineage II, MapleStory (SEA/JMS), AION, Blade & Soul, or any of 150+ other PC titles right now, you have a signed kernel driver from Wellbia running on your machine. It’s called `xhunter1.sys`, it ships with the XIGNCODE3 anti-cheat platform, and any unprivileged process on the system can talk to it.

It also has a vulnerability that hands an unprivileged caller a fully-privileged process handle to anything — `lsass.exe`, `winlogon.exe`, your EDR. No admin rights. No driver loading. No kernel exploit. Three `WriteFile` calls while the game is running.

That’s a live LPE 0day in a kernel driver that millions of people voluntarily load every day to play their games. The driver also persists on disk after the game uninstalls, so it doubles as a stable BYOVD primitive — but that’s the secondary story. The primary story is simpler: user-mode malware running alongside a game session walks straight to SYSTEM through the anti-cheat that’s supposed to be protecting the game.

Wellbia’s own corporate page advertises *“providing service to international game titles, reaching more than 1 billion users daily.”* That’s the population sitting on this bug.

* * *

## Anti-cheat at ring 0

Kernel anti-cheat sits at ring 0 with the same privilege level as EDR or AV. That’s a structural requirement — to catch user-mode game hacks, the anti-cheat has to see and act below the user-mode boundary. The trust model is the same as a kernel security agent. The threat model is consumer game cheating.

That works as long as one assumption holds: the anti-cheat driver is at least as hardened as anything else you’d let into ring 0. Specifically, it doesn’t hand privileged primitives to whichever process happens to open its device.

When that assumption breaks, the anti-cheat doesn’t just stop protecting against cheats. It becomes a live LPE primitive on every machine actively playing the game, and a stable BYOVD primitive on every machine that ever did.

That’s what’s happening here.

* * *

## The driver behind 150+ PC games

Wellbia.com Co., Ltd. is a Seoul-based commercial anti-cheat vendor. XIGNCODE3 is their flagship product. Per Wellbia’s own product page, XIGNCODE3 for PC protects *“over 150 online game titles globally.”* It dominates the Korean and broader East-Asian gaming market and ships with plenty of globally popular titles too. `xhunter1.sys` is the PC kernel component, and that’s what the rest of this post is about.

The architecture is standard: a user-mode service that launches with the game, and a kernel driver — `xhunter1.sys` — that does process introspection and integrity monitoring from ring 0.

Two operational details matter for the rest of this post:

1.  The driver is dropped into `C:\Windows` during XIGNCODE3 install.
2.  The driver is **not** removed when the host game is uninstalled.

So Wellbia’s “1 billion daily users” figure undercounts the real install base. Any Windows machine that ever launched an XIGNCODE3-protected title probably still has a signed, loadable copy of `xhunter1.sys` sitting on disk right now.

### On the “one hash” problem

Wellbia rebuilds `xhunter1.sys` per-title. Different games ship different SHA-256 hashes for what is functionally the same driver at the same version string. Timestamps vary. Signing certificate serial numbers sometimes vary. What doesn’t vary is the dispatch table, the vulnerable opcodes, or the auth-gate asymmetry documented below.

The consequence for defenders is that a hash-based blocklist targeting a single sample doesn’t cover the fleet. The sample I reversed is a representative build extracted from one Steam-distributed XIGNCODE3-protected title; the vulnerability described in this post applies to any v2023.12.7.78 build in the wild, regardless of what the file hash comes out to. Building coverage requires either a version-string signature, a code-signing-subject match, or a byte-signature over the vulnerable dispatch handlers themselves.

* * *

## Eight years of the same handler

The vulnerability class in `xhunter1.sys` is not new. The `IRP_MJ_WRITE` command interface, the 624-byte structured packet with magic `0x345821AB`, the dispatch table walked by opcode, and the handler at command `785` (`0x311`) that mints a `PROCESS_ALL_ACCESS` handle via `ObOpenObjectByPointer(AccessMode = KernelMode, HandleAttributes = 0)` were all documented publicly by [Psychotropos in 2018](https://web.archive.org/web/20180820182619/https://x86.re/blog/xigncode3-xhunter1.sys-lpe/).

That legacy build (`xhunter1.sys` v10.0.10011.16384) is tracked as **[CVE-2026-3609](https://www.cve.org/CVERecord?id=CVE-2026-3609)**. Full technical breakdown — handler decompiles, packet layout, exploitation chain, end-to-end PoC against PPL `lsass.exe` — is here:

> **[CVE-2026-3609 writeup: PPL-bypassing handle leak in XIGNCODE3 (xhunter1.sys)](https://blacksnufkin.github.io/posts/AntiCheat-LPE-CVE-2026-3609/)**

Wellbia’s public position is that the class of issue was remediated in v2023.09.19.078 under a South Korean advisory track cross-referenced as **KVE 2023-5589** (no public record; NDA-bound). Per Wellbia, any driver at v2023.09.19.078 or higher was no longer vulnerable.

The rest of this post is about whether that holds up against the current production binary — v2023.12.7.78, extracted straight out of a running XIGNCODE3-protected title’s install.

* * *

## The second finding

There’s a second primitive in the same dispatch table that predates any of the auth work. Command **`0x320` / `800`** is a `KeStackAttachProcess` handle stomp — strips `ProtectFromClose` off any handle inside a target process and closes it. No caller check, only `PROCESS_QUERY_LIMITED_INFORMATION` on the target (which Windows grants on any PPL process to any caller by design). Iterating cmd 800 across `MsMpEng.exe` ’s handle table reliably terminates Defender from an unprivileged context. Decompile in the capabilities section below.

That raised the obvious question about the 2023 patch: did it audit the rest of the dispatch table, or just the one opcode? Twenty-five opcodes in the dispatch table. The CVE only covered one of them. The rest of this post is the answer.

* * *

## Inside v2023.12.7.78

The binary extracted from a live XIGNCODE3-protected title’s install, post-dating Wellbia’s stated fix cutoff:

```
Driver        xhunter1.sys
Version       2023.12.7.78
Size          215,864 bytes
SHA-256       0D1FD685DC98D0C193529DF3DDDE7144D839F56B7B38251FD7039C33C0FCF760
                (one of many — see "On the 'one hash' problem" above)
Embedded
  signatures  - Wellbia.com Co., Ltd.                (DigiCert, SHA-1 legacy)
              - Microsoft Windows Hardware Compat.   (WHQL, SHA-256)
              - Wellbia.com Co., Ltd.                (DigiCert, SHA-256)
              - Wellbia.com Co., Ltd.                (DigiCert, SHA-256, additional)
              All timestamped 2023-12-06; no separate .cat.
```

The signing line matters. This isn’t just vendor-signed — it carries Microsoft’s WHQL signature embedded directly in the binary. Microsoft signed off on this build through the Hardware Compatibility Publisher program, which is what makes it loadable under Kernel Mode Code Signing and HVCI on every modern Windows install. Whatever this post is, it isn’t a story about a sketchy third-party driver sneaking past Microsoft. The driver is endorsed by Microsoft’s own signing infrastructure for kernel use.

Good news first: the binary *does* have a real fix. Wellbia added code in v2023.09.19.078 that targets the original bug specifically, and it’s visible in the disassembly. The fix is well-formed for what it set out to do. It just happens to leave a different design problem in place alongside it.

The dispatch table also grew — from 25 handlers in the original 2018-era binary to 44 in v2023.12.7.78. More opcodes means more attack surface; whether they got audited is the question this post answers.

* * *

## The auth gate

The patch introduces a per-PID auth gate at `sub_140005E84`. Every call into the privileged `0x311` handler now looks up `PsGetCurrentProcessId()` in an internal allowlist (`qword_140021BD8`, a linked list of `{PID, flags}` records) and checks `(flags & 0x80000008) == 0x80000008`.

```c
// sub_140005E84 @ 0x140005E84 — the auth gate
bool __fastcall sub_140005E84()
{
    unsigned int pid = (unsigned int)PsGetCurrentProcessId();
    return (sub_140006204(pid) & 0x80000008) == 0x80000008;
}
```

`sub_140006204` is the allowlist lookup — a mutex-protected walk of the linked list at `qword_140021BD8`:

```c
// sub_140006204 @ 0x140006204 — walk the allowlist for caller PID
__int64 __fastcall sub_140006204(int pid)
{
    unsigned int flags = 0;
    ExAcquireFastMutex(&FastMutex);
    for ( PVOID *i = (PVOID *)qword_140021BD8;
          i != &qword_140021BD8;
          i = (PVOID *)*i )                           // Flink walk
    {
        if ( *((_DWORD *)i + 4) == pid )              // node+0x10 = PID
        {
            flags = *((_DWORD *)i + 5);               // node+0x14 = flags
            break;
        }
    }
    ExReleaseFastMutex(&FastMutex);
    return flags;
}
```

The patched `0x311` handler (`sub_1400030B8`) wraps the same `ObOpenObjectByPointer` primitive as the original bug, but now behind the gate:

```c
// sub_1400030B8 @ 0x1400030B8 — cmd 785 handler (v2023.12.7.78, gated)
__int64 __fastcall sub_1400030B8(_DWORD *req, __int64 resp)
{
    *(_DWORD *)resp        = 624;                     // response length
    *(_DWORD *)(resp + 4)  = 0x12121212;              // response magic
    *(_DWORD *)(resp + 12) = 0xC0000001;              // STATUS_UNSUCCESSFUL default
    *(_DWORD *)(resp + 8)  = ~req[2];                 // xor-key echo

    unsigned int desired_access = req[7];             // req+0x1C — caller-supplied ACCESS_MASK
    if ( sub_140005E84() )                            // ← auth gate
    {
        _QWORD cid[2] = { req[6], 0 };                // req+0x18 — caller-supplied PID
        __int64 out_handle;
        *(_DWORD *)(resp + 12) =
            sub_1400087F4(&out_handle, desired_access, cid, 0);
        *(_QWORD *)(resp + 16) = out_handle;          // ← handle returned to user-mode
    }
    else
    {
        *(_DWORD *)(resp + 12) = 0xC0000001;          // gate refused
    }
    return 0;
}
```

And the wrapper at `sub_1400087F4` — the unchanged-since-2018 primitive the gate is supposed to protect:

```c
// sub_1400087F4 @ 0x1400087F4 — the ObOpenObjectByPointer wrapper
NTSTATUS __fastcall sub_1400087F4(void **out_handle, ACCESS_MASK desired,
                                  __int128 *cid, char from_user)
{
    __int128 client_id;
    if ( from_user )
    {
        ProbeForWrite(out_handle, 8, 8);
        ProbeForRead(cid, 0x10, 4);
    }
    client_id = *cid;

    NTSTATUS status;
    PVOID Process;
    if ( ((_QWORD *)&client_id)[1] )
        status = PsLookupProcessThreadByCid(&client_id, &Process, &ThreadObj);
    else
        status = sub_14000C2EC(client_id, &Process);  // PID → EPROCESS

    if ( status >= 0 )
    {
        HANDLE Handle;
        status = ObOpenObjectByPointer(
            Process,
            0,                                        // HandleAttributes — no OBJ_KERNEL_HANDLE
            NULL,                                     // PassedAccessState
            desired,                                  // ← caller-controlled access mask
            PsProcessType,
            0,                                        // ← AccessMode = KernelMode ⚠ PPL bypass
            &Handle);
        ObfDereferenceObject(Process);
        if ( status >= 0 )
            *out_handle = Handle;
    }
    return status;
}
```

The handler that *reads* the allowlist is gated. The handlers that *write* the allowlist aren’t.

* * *

## Writing yourself in

Two other opcodes in the same dispatch table are unauthenticated writes to the very list the gate consults.

**Command `0x309` / `777`** (handler `sub_140003498`): registers the caller’s own PID and sets bit 31 of its allowlist entry.

```c
// sub_140003498 @ 0x140003498 — cmd 777 handler. NO AUTH CHECK.
__int64 __fastcall sub_140003498(__int64 req, _DWORD *resp)
{
    *resp        = 624;
    resp[1]      = 0x12121212;
    resp[3]      = 0xC0000001;                        // STATUS_UNSUCCESSFUL
    resp[2]      = ~*(_DWORD *)(req + 8);

    unsigned int pid = (unsigned int)PsGetCurrentProcessId();
    int status = sub_140006A10(pid);                  // register_pid — appends to allowlist
    resp[3] = status;
    if ( status >= 0 )
    {
        sub_140006418(pid, 0x80000000);               // ← set upper flags: bit 31
        sub_140006C50(-535117823, 0, 0, 0, 0);
    }
    return 0;
}

// sub_140006418 @ 0x140006418 — one-liner: OR upper bits into caller's entry
__int64 __fastcall sub_140006418(unsigned int pid, int new_upper)
{
    int cur = sub_140006204(pid);                     // current flags
    return sub_140005FC8(pid, (new_upper & 0xFFFF0000) | cur);
}
```

**Command `0x307` / `775`** (handler `sub_140001DD8`): writes the lower 16 flag bits for any PID the caller names. Both the PID and the flags come straight from the request buffer with no validation.

```c
// sub_140001DD8 @ 0x140001DD8 — cmd 775 handler. NO AUTH CHECK.
__int64 __fastcall sub_140001DD8(_DWORD *req, _DWORD *resp)
{
    *resp        = 624;
    resp[1]      = 0x12121212;
    resp[3]      = 0xC0000001;                        // STATUS_UNSUCCESSFUL
    resp[2]      = ~req[2];

    sub_140005F98(req[6], (unsigned __int16)req[7]);  // req[6]=pid, req[7]=flags — both caller-controlled
    resp[3] = 0;
    return 0;
}

// sub_140005F98 @ 0x140005F98 — one-liner: OR lower 16 bits into target's entry
__int64 __fastcall sub_140005F98(unsigned int pid, unsigned __int16 new_low)
{
    int cur = sub_140006204(pid);                     // current flags for target PID
    return sub_140005FC8(pid, (cur & 0xFFFF0000) | new_low);
}
```

Both writers go through the same helper `sub_140005FC8` — a mutex-protected upsert into the same linked list `sub_140006204` reads. If the target PID already has an entry, it overwrites the flags word in place. If not, it allocates a fresh node and links it in. **Neither path checks the caller.**

The exploit collapses to three `WriteFile` calls:

```
WriteFile(\\.\xhunter, cmd=777, ...)                            // sets bit 31 of own PID
WriteFile(\\.\xhunter, cmd=775, pid=self, flags=0x0008, ...)    // sets bit 3  of own PID
WriteFile(\\.\xhunter, cmd=785, pid=lsass, mask=0x1FFFFF, ...)  // gate passes → handle returned
```

After step 2 the allowlist entry for the caller’s PID reads `0x80000008`. The gate returns true. The original primitive runs unchanged. Three `WriteFile` calls, all unprivileged, on the current production binary.

The dispatch handler that *reads* the allowlist got hardened. The two that *write* it didn’t. That asymmetry is the new finding.

* * *

## Four primitives, one chain

Four distinct capabilities from a standard user account against a signed, vendor-current Wellbia binary.

First, one structural property worth calling out, because it separates this from most BYOVD literature:

**The driver doesn’t need to be planted.** A normal BYOVD chain has the attacker drop the vulnerable driver to disk and load it as a service — and that step needs admin. Here, `xhunter1.sys` is already running on every machine actively playing an XIGNCODE3-protected title, loaded by the game’s own anti-cheat service. The `0x309` / `0x307` / `0x311` chain doesn’t validate which process is making the call, only that the caller can open the device — which any unprivileged process can. Consumer malware running next to a game session reaches `lsass.exe` through the driver the game itself loaded. No drop, no admin, no staging.

The on-disk persistence means the same chain still works as a classical BYOVD primitive on any host that ever installed XIGNCODE3. But the live-driver case is the dominant one.

### 1\. Credential theft from PPL lsass

`cmd 785(lsass.exe)` returns a `PROCESS_ALL_ACCESS` handle on PPL-Antimalware `lsass.exe`. After that, `ReadProcessMemory` walks `lsasrv.dll` for the BCrypt 3DES key material, decrypts the `LogonSessionList` entries, and pulls out NT hashes, SHA1 hashes, and (where present) plaintext WDigest passwords. For a domain-joined corporate laptop where someone played a game on their lunch break, that’s lateral movement fuel. Working end-to-end against v2023.12.7.78 on Windows 11 25H2 (build 26200.8457).

### 2\. EDR kill via handle stomp

Command **`0x320` / `800`** is unauthenticated too. It closes any handle in a target process’s handle table while attached via `KeStackAttachProcess`, after stripping `ProtectFromClose` with `ObSetHandleAttributes(KernelMode)`:

```c
// sub_140001FF8 @ 0x140001FF8 — cmd 800 handler. NO AUTH CHECK.
__int64 __fastcall sub_140001FF8(__int64 req, __int64 resp)
{
    PRKPROCESS Process = NULL;
    *(_DWORD *)resp        = 624;
    *(_DWORD *)(resp + 4)  = 0x12121212;
    *(_DWORD *)(resp + 12) = 0xC0000001;              // STATUS_UNSUCCESSFUL
    *(_DWORD *)(resp + 8)  = ~*(_DWORD *)(req + 8);

    void *victim_handle = *(void **)(req + 32);       // req+0x20 — handle *inside target*
    HANDLE target_proc  = *(HANDLE *)(req + 24);      // req+0x18 — caller's handle to target

    // sub_140007874: ObReferenceObjectByHandle wrapper.
    // 0x1000 = PROCESS_QUERY_LIMITED_INFORMATION — Windows grants this on any PPL target
    // to any caller by design.
    int status = sub_140007874(target_proc, 0x1000, (PVOID *)&Process);
    if ( status >= 0 )
    {
        struct _KAPC_STATE ApcState;
        KeStackAttachProcess(Process, &ApcState);
        *(_DWORD *)(resp + 12) = sub_140003A1C(victim_handle);   // ← strip + close inside target
        KeUnstackDetachProcess(&ApcState);
        ObfDereferenceObject(Process);
    }
    else
    {
        *(_DWORD *)(resp + 12) = status;
    }
    return 0;
}

// sub_140003A1C @ 0x140003A1C — the actual stomp
__int64 __fastcall sub_140003A1C(HANDLE Handle, char attrs_in)
{
    char attrs[2] = { attrs_in, 0 };                  // Inherit=0, ProtectFromClose=0
    NTSTATUS status = ObSetHandleAttributes(Handle, attrs, 0);  // KernelMode → strips ProtectFromClose
    if ( status >= 0 )
        ZwClose(Handle);
    return status;
}
```

Close enough handles in a PPL target and the kernel objects it depends on get ripped out from under it. `MsMpEng.exe` (PPL-Antimalware-Light Defender) reliably exits within a few hundred milliseconds. This doesn’t even need cmd 785 — cmd 800 takes any process handle, and `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` works against PPL targets from non-PPL callers.

### 3\. Interactive SYSTEM shell

The kernel-minted handle from `cmd 785` carries every right bit, including `PROCESS_VM_OPERATION`, `PROCESS_VM_WRITE`, and `PROCESS_CREATE_THREAD`. `VirtualAllocEx` / `WriteProcessMemory` / `CreateRemoteThread` from user-mode do their secondary access checks against the handle’s `GrantedAccess` — and because the handle was minted in `KernelMode`, those checks treat the caller as authorized. Even injection into PPL `winlogon.exe` works. The child `cmd.exe` inherits winlogon’s primary `NT AUTHORITY\SYSTEM` token *and* its Session 1, so you get an interactive SYSTEM shell on the user’s desktop without any admin token in the calling process. Verified on a fully-patched Windows 11 25H2 system (build 26200.8457) with HVCI and the Microsoft Vulnerable Driver Blocklist enabled.

### 4\. Kernel-mode code injection via cmd 820

Command **`0x334` / `820`** is a kernel-side injection primitive. The driver allocates RWX memory in the target process via the kernel allocator, copies the caller’s shellcode into it, and spawns a thread with `RtlCreateUserThread` — all from ring 0. No `VirtualAllocEx` / `WriteProcessMemory` / `CreateRemoteThread` from user mode, no secondary access checks against the handle’s `GrantedAccess`. Combined with a `cmd 785` handle on a PPL target, the caller can inject arbitrary code into any process regardless of protection level. The sentinel protocol at the end of the payload buffer lets the caller detect thread completion.

This is strictly more powerful than the user-mode injection in primitive 3: it doesn’t touch user-mode allocation APIs, so EDR hooks on `VirtualAllocEx` / `NtAllocateVirtualMemory` in user mode never fire. The entire alloc → copy → execute chain happens in the kernel.

The chain itself isn’t novel. What’s novel is who provides the entry point. This isn’t a third-party driver being repurposed as a BYOVD primitive after the fact — this is the anti-cheat, a signed kernel component installed under the OS directory by a security vendor, handing out the exact primitive defenders spend serious engineering time trying to prevent.

* * *

## The asymmetry

The pattern here is one every defensive kernel-mode component eventually hits: when a dispatch table exposes both read-side and write-side primitives that share a piece of trust state, hardening only the read side leaves the trust state itself attacker-controlled. The 2023.09 patch is a well-formed gate on the right opcode. What this post documents is a separate, structural asymmetry on the dispatch surface that the gate isn’t in a position to address.

The same property that makes XIGNCODE3 effective against cheats — a high-privilege kernel driver with system-wide visibility — is what makes this bug so impactful when the dispatch surface isn’t fully gated.

The current build is signed by Wellbia and carries a Microsoft WHQL signature. It loads cleanly under HVCI on a fully-patched Windows 11 25H2 system (build 26200.8457), and isn’t on the Microsoft Vulnerable Driver Blocklist at time of publication. The exposure window will close as defenders build coverage against the vulnerable dispatch handlers and Wellbia ships a follow-up patch — but until then, the driver is loaded right now on a billion machines.

Trust the wrong code at the kernel boundary and the trust model inverts.

* * *

## PoC

Source: **[github.com/BlackSnufkin/AxHunter — axhunter_v1](https://github.com/BlackSnufkin/AxHunter/tree/main/axhunter_v1)**.

Full chain in action — three `WriteFile` calls, then four impact modes (dump, kill, lpe, inject):

 Your browser does not support the video tag.

* * *

## The remediation that wasn’t

Wellbia did respond. Their answer to this class of issue wasn’t a follow-up patch to `xhunter1.sys` — it was a full driver rewrite, `xhunter2.sys` v2026.6.1.192, shipping in newer XIGNCODE3-protected titles including *WindSlayer*. New protocol, new frame format, encrypted transport, three independent cryptographic authentication layers wrapping every dispatch handler. Real engineering effort. On paper it looks like the right kind of response.

In practice the same three primitives from this post (cmd 785, cmd 787, cmd 800) are present in the new driver, byte-for-byte, and all three authentication layers were reverse-engineered and defeated. The rewrite raised the reversing bar; it did not change who can eventually reach the vulnerable primitives.

`xhunter2.sys` was assigned **[CVE-2026-15430](https://www.cve.org/CVERecord?id=CVE-2026-15430)**. Full technical write-up of the rewrite, the three-layer authentication mechanism, and each bypass is here:

> **[Hunting the Hunter II: Reversing xhunter2.sys and Its Three-Layer Authentication](https://blacksnufkin.github.io/posts/Hunting-the-Hunter-II/)**

Two important operational facts:

-   `xhunter2.sys` ships in a small subset of XIGNCODE3 titles (most notably *WindSlayer*). The overwhelming majority of the ~150 XIGNCODE3-protected games in the wild — the “billion daily users” footprint — still load **`xhunter1.sys` v2023.12.7.78**, the driver documented in this post.
-   **Update (2026-08-05):** CERT/CC extended **[CVE-2026-3609](https://www.cve.org/CVERecord?id=CVE-2026-3609)** to cover *“version 10.0.10011.16384 through 2023.12.7.78”*. This driver now has a CVE anchor for defender-side inventory and blocklist tooling.

* * *

## CVE references

Two CVEs, one class of vulnerability spanning three XIGNCODE3 kernel drivers:

-   **[CVE-2026-3609](https://www.cve.org/CVERecord?id=CVE-2026-3609)**— `xhunter1.sys` v10.0.10011.16384 through v2023.12.7.78. Originally covered the legacy 10.x build only; CERT/CC updated the description on 2026-08-05 to include the current production binary documented in this post. See the [original write-up](https://blacksnufkin.github.io/posts/AntiCheat-LPE-CVE-2026-3609/) for the legacy build and this post for the v2023 auth-gate bypass.
-   **[CVE-2026-15430](https://www.cve.org/CVERecord?id=CVE-2026-15430)**— `xhunter2.sys` v2026.6.1.192, the rewritten driver shipping in a small subset of newer titles (most notably *WindSlayer*). Full technical breakdown, including the three-layer cryptographic authentication mechanism and its bypass: **[Hunting the Hunter II](https://blacksnufkin.github.io/posts/Hunting-the-Hunter-II/)**.

The driver is not distributed as a standalone artifact. It loads when the user runs any XIGNCODE3-protected title.

* * *

*Discovered by BlackSnufkin · 2026-05-12*
