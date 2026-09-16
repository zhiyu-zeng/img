---
title: "Hunting the Hunter II: Reversing xhunter2.sys and Its Three-Layer Authentication | BlackSnufkin"
source: https://blacksnufkin.github.io/posts/Hunting-the-Hunter-II/
source_host: blacksnufkin.github.io
clip_date: 2026-09-16T10:19:04+08:00
trace_id: bf876d34-8f72-4a4b-a4ba-04e016c4f0fb
content_hash: beacfd62598cb6dbf8416b77a4486414db0a69cc368165cdc7beb7a5b5b3ee2b
status: synced
tags:
  - 游戏安全
  - Windows逆向
series: null
feed_source: BlackSnufkin
ai_summary: 反作弊驱动 `xhunter2.sys` 的三层加密认证被完整逆向并逐层绕过，无需内存破坏、无需实现漏洞，普通用户权限即可重新触达内核注入等四类原语。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3dd75244-d011-81f5-898a-c138032f8a99
ioc:
  cves:
    - CVE-2026-15430
    - CVE-2026-3609
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 反作弊驱动 `xhunter2.sys` 的三层加密认证被完整逆向并逐层绕过，无需内存破坏、无需实现漏洞，普通用户权限即可重新触达内核注入等四类原语。
> 
> - **目标与 CVE：** Wellbia XIGNCODE3 的新内核驱动 `xhunter2.sys` v2026.6.1.192（2026 年随游戏下发，如 *WindSlayer*）对应 CVE-2026-15430；前代 `xhunter1.sys` 对应 CVE-2026-3609。
> - **通信面特征：** 无 `DeviceIoControl`、无符号链接，仅 hook `IRP_MJ_CREATE/CLOSE/WRITE`；失败一律返回伪装错误码（`STATUS_OBJECT_NAME_NOT_FOUND` 等）而非 `STATUS_ACCESS_DENIED`。1184 字节帧，magic = `MAGIC ^ SEED_KEY`（seed 固定 0x41414141），载荷用固定参数的 LCG 异或加密，响应 magic 0x20260507。
> - **三层认证与对应绕过：** ① WBMF——打开设备时对 PE 内 484 字节 blob 做 RSA-2048 验签并校验调用线程 `Win32StartAddress` 落在该 PE 内；绕过方式是 dump 游戏进程内存抠出 `wbmf_module.dll` 映射到首选基址 0x10000000，并用 14 字节 `jmp [rip+0]` 蹦床造线程。② WBCC——每请求 536 字节证书 blob 并重做 WBMF 验签；链迭代 `count=0` 直接返回成功，构成空链旁路。③ PID 标志门——需 `flags & 0x80000008 == 0x80000008`；由 cmd 777（auth 1）、cmd 779（auth 0）、cmd 775（auth 1）三步写入凑成 0xC0000008。
> - **影响范围：** 在 Win11 25H2（26200.8457）且 HVCI+VBS+微软易受攻击驱动黑名单全开下，仍可从 PPL `lsass.exe` 转储凭据、结束 PPL 的 `MsMpEng.exe`、经 `winlogon.exe` 拿到交互式 SYSTEM shell，以及用 cmd 820 完成 ring0 的 RWX 分配 + `RtlCreateUserThread` 内核态注入。
> - **根因结论：** 三层各自看起来都是合格边界，但压缩后是同一句话——驱动只校验调用者**持有**有效产物，从不校验调用者**是否是该产物的签发对象**；修复换了实现，没换设计类别。

## TL;DR

-   **[CVE-2026-15430](https://www.cve.org/CVERecord?id=CVE-2026-15430)**— improper access control in `xhunter2.sys` v2026.6.1.192 (Wellbia XIGNCODE3). The previous driver — `xhunter1.sys` v2023.12.7.78, covered in *[Hunting the Hunter](https://blacksnufkin.github.io/posts/Hunting-the-Hunter/)* and still shipping in the majority of XIGNCODE3-protected titles — is now covered by **[CVE-2026-3609](https://www.cve.org/CVERecord?id=CVE-2026-3609)** (updated 2026-08-05 to include *“version 10.0.10011.16384 through 2023.12.7.78”*).
-   Wellbia’s response to *Hunting the Hunter* was a full kernel driver rewrite: `xhunter2.sys` (v2026.6.1.192), shipping in 2026 XIGNCODE3-protected PC titles including *WindSlayer*. The rewrite is real — new protocol, new frame format, encrypted transport, three independent cryptographic authentication layers wrapping the dispatch table.
-   This post is the reverse-engineering diary of how those three layers were reversed cold and defeated. It’s about the RE process, not the exploit. The same primitives from *Hunting the Hunter* sit behind the new auth stack (cmd 785 / cmd 787 / cmd 800 / cmd 820) and this post does not re-cover them — they are byte-for-byte the code from the previous post, unchanged.
-   Three auth layers, three bypasses: (1) a **WBMF** RSA-signed PE fingerprint check at `IRP_MJ_CREATE` combined with a Win32StartAddress check on the calling thread, (2) a **WBCC** per-request certificate blob with its own re-verification and chain iteration, and (3) a kernel-side **PID flag gate** that requires the caller to be in an allowlist with a specific bit mask. All three fall to the same class of realization: identity is being proven by possession of an artifact that lives in game memory or is settable by unauthenticated opcodes.
-   Same four impacts as *Hunting the Hunter* hold end-to-end on Windows 11 25H2 (build 26200.8457) with HVCI + VBS + MS VDBL all on — including kernel-mode code injection via cmd 820. This post covers *why* they still work in the v2026 driver track.

* * *

In the companion post, *[Hunting the Hunter](https://blacksnufkin.github.io/posts/Hunting-the-Hunter/)*— the technical write-up of `xhunter1.sys` v2023.12.7.78 — I documented that the auth gate Wellbia added in 2023 defended only one side of a shared piece of trust state. The other side — the opcodes that *wrote* to the allowlist — had no auth check, so an unprivileged caller could write itself into the list and walk through the gate.

Wellbia’s answer wasn’t a hotfix. It was a next-generation kernel driver, `xhunter2.sys`, delivered inside the 2026 XIGNCODE3 build cycle. New protocol, new frame format, encrypted transport, three cryptographic authentication layers wrapping every dispatch handler. It is a real engineering effort and it visibly costs the attacker something — the reversing bar to touch the primitives is significantly higher than in the previous driver.

The primitives themselves — the four opcodes from *Hunting the Hunter* that turn `cmd 785` into a PPL handle mint, `cmd 787` into a cross-process byte-copy read, `cmd 800` into a handle stomp on any target, and `cmd 820` into a kernel-mode code injector (RWX alloc + `RtlCreateUserThread`, all ring 0) — are still there, byte-for-byte. I’m not re-covering them. They live in the previous post. This one is only about how the three auth layers were reverse-engineered and defeated, so an unprivileged caller can once again reach the dispatch table on the other side.

* * *

## Getting in — the target and what’s visible from outside

```
Driver        xhunter2.sys
Version       2026.6.1.192
Product       XIGNCODE3 — Wellbia (2026 build track)
Architecture  x86-64 Windows kernel driver
Device        \Device\xhunter2          (DO_BUFFERED_IO, no \DosDevices\ symlink)
Signature     Wellbia + Microsoft WHQL  (Hardware Compatibility Publisher)
Tested        Windows 11 25H2, build 26200.8457, HVCI + VBS + MS VDBL all enabled
```

First fact: **no `DeviceIoControl`.** The driver’s `MajorFunction` table hooks `IRP_MJ_CREATE`, `IRP_MJ_CLOSE`, and `IRP_MJ_WRITE`. Every command is a write. That is already a small mitigation against generic IOCTL fuzzers, but the more consequential thing is that the framing on those writes is not obvious from imports alone — you have to reverse it before any handler decompile is meaningful.

Second fact: **no symlink.** There is no `\??\xhunter2` or `\\.\xhunter2`. The device must be opened with `NtCreateFile` on the raw NT path. That’s a hint the driver wants strict control of who reaches `IRP_MJ_CREATE`, which lines up with what turns out to be the first auth layer.

Third fact — the one that turned into the whole “how do I even talk to this thing” phase: opening the device with a plain `NtCreateFile` returns `STATUS_OBJECT_NAME_NOT_FOUND` (`0xC0000034`). The device object is right there in the namespace, but the driver lies with a “does not exist” error. WBCC malformed? `STATUS_INVALID_PARAMETER`. Wrong PE base? `STATUS_NOT_FOUND`. RSA sig mismatch? `STATUS_NOT_FOUND` again. Every failure returns something other than `STATUS_ACCESS_DENIED`, at points where `STATUS_ACCESS_DENIED` would be the honest answer. Every failure lies.

Import scan against the six primitives *Hunting the Hunter* flagged (`ObOpenObjectByPointer`, `KeStackAttachProcess`, `ObSetHandleAttributes`, `ZwClose`, `PsLookupProcessByProcessId`, `ObReferenceObjectByHandle`) came back positive. The dispatch table walker found 45 opcodes (774..822). The primitives are here. The question is only what the gate looks like.

* * *

## Framing first — nothing else makes sense without it

Before touching any handler, the frame acceptance had to be nailed down. The dispatch entry point walks a validator at `sub_14000F5AC`:

```c
// sub_14000F5AC @ 0x14000F5AC — the frame acceptance gate
__int64 __fastcall sub_14000F5AC(__int64 a1, __int64 a2, __int64 a3)
{
    _DWORD *v4;
    if ( *(_DWORD *)(a1 + 8) == a3 &&
         (v4 = *(_DWORD **)(a2 + 24), v4[6] == a3) &&
         (v4[7] ^ v4[8]) == 1884316162 )               // 0x70506202
        return *(_QWORD *)(a2 + 24);
    return 0;
}
```

Two length fields and a magic word derived from a caller-chosen seed. `SEED_KEY = 0x41414141` is fixed by the caller and lives at `v4[8]` (frame byte 32); the magic `0x70506202` lives at `v4[7]` (byte 28), stored as `MAGIC ^ SEED_KEY`. The check reduces to a plaintext magic word at fixed offsets.

That established the frame acceptance criteria — but sending a request that satisfies the header check only got a response of encrypted garbage. Trace back into `sub_14000F5B4` and adjacent decrypt helpers showed a linear congruential generator (LCG) with a fixed multiplier/increment and a per-message seed derived from `SEED_KEY`:

```
s0 = 1864026567 - 1640531535 * (SEED_KEY ^ 0x7B85F243)
sn = 1664525 * s(n-1) + 1013904223
byte[n] ^= (sn >> 23) & 0xFF
```

Applied to bytes `[36..1183]` of the request. Response uses the same LCG with `SEED_KEY ^ 0x847A0DBC` for the seed, over 786 bytes. Response magic at offset 28 is `0x20260507` — Wellbia’s calendar-year build watermark, and useful later as a version fingerprint.

Frame layout after decrypt (1184 bytes):

| Offset | Size | Field |
| --- | --- | --- |
| 24-27 | 4   | length sentinel (`0x4A0`) |
| 28-31 | 4   | `MAGIC ^ SEED_KEY` |
| 32-35 | 4   | `SEED_KEY` (fixed `0x41414141`) |
| 36-39 | 4   | opcode |
| 40-47 | 8   | response buffer VA (user space) |
| 48-583 | 536 | **WBCC blob** (auth layer 2) |
| 584-1183 | 600 | handler arguments |

The response buffer VA embedded in every request was the second interesting protocol quirk — the driver writes the response back into user memory using a VA the caller supplies. Not through `IRP.UserBuffer`, not through the IRP output buffer. A raw user pointer inside the frame. That will matter later.

With frame + encryption implemented, the fun could start.

* * *

## Auth layer 1 — WBMF at IRP_MJ_CREATE

Opening the device landed in `sub_140002C80` and cratered fast. Condensed to the shape that matters:

```c
// sub_140002C80 @ 0x140002C80 — WBMF validator (condensed)
__int64 __fastcall sub_140002C80(char *pe_base, unsigned __int64 a2, __int64 tag, unsigned int *out_size)
{
    if ( !pe_base || pe_base >= MmHighestUserAddress )
        return 0xC0000034;                              // STATUS_NOT_FOUND

    if ( sub_1400093D8(pe_base) < 0 )                   // basic PE sanity
        return 0xC0000034;

    // sub_140009108: locate WBMF blob inside PE using magic index 2605
    //  → &Address = ptr to WBMF blob,  v13 = its length
    sub_140009108(pe_base, &pe_size, 2605, &Address, &v13);
    if ( v13 != 484 )
        return 0xC0000BAB;                              // STATUS_DATATYPE_MISALIGNMENT

    ProbeForRead(Address, 0x1E4u, 1u);                  // 484 bytes
    memcpy(&v15, Address, 484);                         // copy blob out

    if ( v15 != 0x464D4257 /* "WBMF" */ || v16 != 484 )
        return 0xC0000BAB;
    if ( v17 != 1 )
        return 0xC0000019;                              // wrong version

    // Verify offsets and buffer bounds inside the blob …
    // Then: SHA-256 the WBMF header + RSA-2048 verify against embedded pubkey
    sub_140003BA8(&v15, 228, v26);                      // sha256(WBMF) → v26
    if ( !sub_1400039E8(&unk_140014400, 256, 65537,
                        v26 /* digest */, 32,
                        v24 /* signature */, 256) )
        return 0xC0001000;                              // signature mismatch

    // On success: run the signed-code integrity callback tied to the blob
    if ( (v18 & 1) == 0 )
        return sub_140002F64(&v15, pe_base, pe_size);
    return sub_140003068(IoGetCurrentProcess(), pe_base, &v15);
}
```

The function pulls a user pointer, walks the PE with `sub_140009108` (a PE resource/section lookup keyed on magic index `2605`, which resolves the WBMF blob at PE-relative offset `+0x290A0`), does a `ProbeForRead` for exactly 484 bytes, copies them out, checks the `"WBMF"` magic (`0x464D4257`), then hashes 228 bytes with `sub_140003BA8` (SHA-256) and RSA-verifies the 256-byte signature with `sub_1400039E8` against a hardcoded pubkey at `0x140014400`. The pubkey’s first 32 bytes:

```
A3 73 80 AA 6A 43 CE 12  E9 E2 36 A3 30 D5 CF 61
63 1B BA DA E1 9B BD 3D  75 16 98 72 C0 4E 3B CE
```

Real 2048-bit RSA verification against a real Wellbia signature. This isn’t a hash check we can pre-image. Whatever gets sent has to be a WBMF-carrying PE that already carries Wellbia’s signature.

Second call site tightened the screws. `sub_1400027F4` — which turned out to be the layer-2 WBCC handler — calls `sub_140002C80` a *second time* with `PsGetCurrentThread()` ’s `Win32StartAddress`, retrieved via `ZwQueryInformationThread(ThreadQuerySetWin32StartAddress)`. That value must land *inside* the WBMF PE’s VA range. So even if you have the signed PE, the calling thread has to have started executing at an address inside it.

That framed the whole layer: the driver assumes a real game client is talking to it, because in a real game client the WBMF DLL is Wellbia’s own module and worker threads start from functions inside it.

### Where the WBMF PE lives

Grepping the game install for the WBMF magic returned nothing. Static disk scans over the whole XIGNCODE3 install path returned nothing. That’s when I stopped looking on disk.

XIGNCODE3’s user-mode component injects the WBMF DLL into every `WindSlayer.exe` process at launch and it never touches storage. You can see this in Process Hacker / System Informer under the game process’s module list — a mapped image with no backing file path and a name whose display value doesn’t match anything on the filesystem.

Extraction path was mechanical:

1.  **System Informer** → right-click `WindSlayer.exe` → *Miscellaneous* → *Create dump file* → Full. Produces a minidump containing the full process VA space.
2.  **Python scan** the.dmp for `"WBMF"` (`0x464D4257`). Blob located at the dump offset corresponding to VA `0x10000000 + 0x290A0`.
3.  **Carve** the 0x2C000-byte PE starting at VA `0x10000000` → `wbmf_module.dll`.

Verification: PE magic `0x5A4D` ✓, `SizeOfImage = 0x2C000` ✓, `"WBMF"` at `+0x290A0` ✓, 256-byte RSA signature present and unmodified ✓.

The extracted DLL is what the driver ends up validating. It’s Wellbia’s own signed artifact. All that changes is who’s mapping it.

### Defeating the layer

Two constraints:

1.  Present a valid WBMF-carrying PE to the driver. → Map the extracted DLL at its preferred base (`0x10000000`) as a flat file image (sections don’t need realignment — the driver only reads a fixed offset).
2.  The calling thread’s `Win32StartAddress` must be inside that PE. → Plant a native worker entry point inside the mapped region and start a thread pointing at it.

The clean shape is a 14-byte absolute-indirect JMP written into the PE at a chosen offset, jumping to the real worker function elsewhere in the PoC:

```
FF 25 00 00 00 00      jmp qword ptr [rip+0]
<abs64 target>
```

`CreateThread(start=pe+0x500)` — where `pe+0x500` holds the JMP — produces `Win32StartAddress == pe+0x500`, inside the range. From that thread, `NtCreateFile("\Device\xhunter2", ..., EaBuffer=WBCT{pe_base=0x10000000})` where `WBCT` is a 536-byte EA blob with a `"WBCT\0"` name that carries the PE base back to the driver.

WBMF RSA runs against the blob at `pe+0x290A0` — passes, because it’s Wellbia’s signature over Wellbia’s blob. Win32StartAddress check passes. Device handle returns.

Wellbia’s assumption is that WBMF signature verification proves caller identity. It doesn’t. It proves the caller has read game memory. Every same-user process on a machine that runs the game can do that.

* * *

## Auth layer 2 — WBCC per request

Device open only bought a handle. Trying any real opcode immediately came back with a new failure mode from `sub_1400027F4`. That’s the WBCC handler, and it runs before every dispatch:

```c
// sub_1400027F4 @ 0x1400027F4 — per-request WBCC validator (condensed)
__int64 __fastcall sub_1400027F4(__int64 wbcc)
{
    if ( !wbcc || *(_DWORD *)wbcc != 0x43434257 /* "WBCC" */
              || *(_WORD *)(wbcc + 4) != 536 )
        return 0xC000000D;                                  // STATUS_INVALID_PARAMETER
    if ( *(_WORD *)(wbcc + 6) != 1 )
        return 0xC0000019;                                  // wrong version

    __int64 pe_base = *(_QWORD *)(wbcc + 16);
    if ( !pe_base || *(_DWORD *)(wbcc + 12) > 0x40u
                  || pe_base >= (unsigned __int64)MmHighestUserAddress )
        return 0xC000000D;

    // Get calling thread's Win32StartAddress via ZwQueryInformationThread
    sub_1400021E8(&thread_start, &start_pe);

    // Re-verify WBMF RSA on the presented PE
    if ( sub_140002C80((char *)pe_base, 0, "call", &pe_size) < 0 )
        return status;

    // If thread didn't start inside the PE, verify that PE too
    if ( (thread_start < pe_base || thread_start >= pe_base + pe_size)
         && start_pe != pe_base )
    {
        if ( sub_140002C80(start_pe, thread_start, "callthread", 0) < 0 )
            return status;
    }

    // Copy WBCC entries into a stack buffer, then iterate the cert chain
    // ... memcpy loop ...
    return sub_1400029B8((__int64)&entries, pe_base, start_pe);
}
```

Bytes `[48..584]` of the request are treated as a struct. First four bytes must be `0x43434257` (ASCII **“WBCC”**), size = 536, version = 1. A `pe_base` pointer at `+16` is passed back into the WBMF validator for a full RSA re-verification. The calling thread’s Win32StartAddress is re-checked against the PE range. Then a certificate chain iterator, `sub_1400029B8`, walks `count` entries at offset `+24`.

Two things need to succeed per WRITE: another full WBMF RSA verification (which we can pass — we’re presenting the real signed blob every time), and the chain iteration. The chain iterator was the layer-2 gift:

```c
// sub_1400029B8 @ 0x1400029B8 — the certificate chain iterator
__int64 __fastcall sub_1400029B8(__int64 chain, char *pe_base, char *start_pe)
{
    if ( chain )
    {
        unsigned int count = *(_DWORD *)(chain + 12);
        if ( count <= 0x40 )
        {
            if ( !count )
                return 0;                                   // ← empty chain = success

            // Normal path: for each entry at chain + 24 + i*8,
            // recursively validate via sub_140002C80 (WBMF check)
            for ( __int64 i = 0; i < count; ++i )
            {
                char *entry = *(char **)(chain + 8*i + 24);
                if ( !entry || entry >= MmHighestUserAddress ) break;
                if ( entry != pe_base && entry != start_pe )
                {
                    // dedup against earlier entries, then verify
                    if ( !seen_earlier(entry, i, chain) )
                    {
                        sub_140003660(tag, 32, "extra%u", i);
                        if ( sub_140002C80(entry, 0, tag, 0) < 0 )
                            return status;
                    }
                }
            }
            return 0;
        }
    }
    return 0xC0000034;
}
```

With `count = 0` the function returns success without touching a certificate. The chain requirement was implemented as “iterate entries and validate each” instead of “at least one entry required.”

Layer-2 bypass reduces to: send a minimal 536-byte WBCC (magic, size, version, `count=0`, `pe_base` = same PE) with every request. WBMF re-verification passes. Chain iteration is empty. Done.

The Win32StartAddress constraint on WRITE threads is real, though — every write worker needs its own thread inside the PE. That’s what turned the trampoline from a one-off into a convention:

```
pe + 0x500  → open_worker       (device open)
pe + 0x520  → kill_worker       (impact A)
pe + 0x540  → dump_worker       (impact B)
pe + 0x560  → lpe_worker        (impact C)
pe + 0x580  → inject_worker     (impact D)
```

Five trampolines, five workers, five `CreateThread` calls. Each worker’s `Win32StartAddress` is inside the WBMF PE. Every one of them can send WRITEs that pass layer 2.

* * *

## Auth layer 3 — the kernel-side PID flag gate

Layer 2 defeated bought access to *some* opcodes but not the interesting ones. Reversing what the difference was landed on the dispatch table itself.

The table at `0x140025710`, 45 entries, initialized by `sub_140004FA8`, has stride `0x20` bytes per entry. Each entry carries a handler pointer, an auth level (0/1/2/3), and other metadata. Auth levels break down as:

-   **0**— no check
-   **1**— WBCC only (defeated in layer 2)
-   **2**— WBCC + `sub_140009688()`
-   **3**— WBCC + `sub_140009688()`

`sub_140009688`:

```c
// sub_140009688 @ 0x140009688 — the gate the interesting opcodes sit behind
bool __fastcall sub_140009688()
{
    int pid = (unsigned int)PsGetCurrentProcessId();
    return (sub_140009C40(pid) & 0x80000008) == 0x80000008;
}
```

And the list walker it consults:

```c
// sub_140009C40 @ 0x140009C40 — mutex-protected walk of the PID→flags list
__int64 __fastcall sub_140009C40(int pid)
{
    unsigned int flags = 0;
    ExAcquireFastMutex(&FastMutex);
    PVOID *node = (PVOID *)qword_140025FD8;
    if ( qword_140025FD8 != &qword_140025FD8 )
    {
        int key = pid ^ 0x20241015;
        while ( *((_DWORD *)node + 4) != key )              // node+0x10 = pid ^ key
        {
            node = (PVOID *)*node;                          // Flink
            if ( node == &qword_140025FD8 )
                goto out;
        }
        flags = *((_DWORD *)node + 5);                      // node+0x14 = flags
    }
out:
    ExReleaseFastMutex(&FastMutex);
    return flags;
}
```

Kernel-side linked list at `qword_140025FD8`, keyed on `pid ^ 0x20241015` (the driver’s build date as a XOR key — a cute anti-scanner touch). Each node holds a PID and a flags word. Fresh process: no node. Lookup returns 0. Gate fails. Everything with auth level ≥ 2 returns `STATUS_ACCESS_DENIED`.

Passing the gate means getting the PID entry to `flags = 0xC0000008` — the specific mask that satisfies the check.

This is where the previous post’s finding structurally comes back. The *readers* of this trust state (all the interesting opcodes) are gated. The *writers* of this trust state are separate opcodes with their own auth requirements. And when I mapped out which opcodes could write to the list, and at what auth level, a chain emerged:

**cmd 777** (`sub_140005CDC`) — auth level **1**. Registers the calling PID into the list and sets `flags = 0x80000000` (bit 31). WBCC-only auth means it’s reachable with our layer-2 bypass in place.

```c
// sub_140005CDC @ 0x140005CDC — cmd 777 handler
__int64 __fastcall sub_140005CDC(__int64 req, _DWORD *resp)
{
    resp[6] = 1184;
    resp[7] = 0x20260507;                                    // response magic
    resp[9] = 0xC0000001;                                    // STATUS_UNSUCCESSFUL
    resp[8] = ~*(_DWORD *)(req + 32);

    unsigned int pid = (unsigned int)PsGetCurrentProcessId();
    int v = sub_14000A4F4(pid);                              // register in list
    resp[9] = v;
    if ( v >= 0 )
    {
        sub_140009ECC((HANDLE)pid);                          // set flags via 0x80000000 path
        sub_14000A734(-535117823, 0, 0, 0, 0);
    }
    return 0;
}
```

**cmd 779** (`sub_140005BC8`) — auth level **0**. Drains an internal event queue into a user buffer. As a bookkeeping side effect, calls `sub_140009ECC` again — this time at a call site where it ORs bit 30 into the caller’s flags word. Level 0 means no auth at all.

```c
// sub_140005BC8 @ 0x140005BC8 — cmd 779 handler
__int64 __fastcall sub_140005BC8(__int64 req, _DWORD *resp)
{
    PMDL Mdl = NULL;
    resp[6] = 1184;
    resp[7] = 0x20260507;
    resp[9] = 0xC0000001;
    resp[8] = ~*(_DWORD *)(req + 32);

    __int64 user_buf = *(_QWORD *)(req + 584);
    if ( user_buf )
    {
        void *kbuf = sub_14000BFDC(user_buf, *(unsigned int *)(req + 592), &Mdl);
        if ( !kbuf ) return 0xC0000001;

        int out_len;
        resp[9]  = sub_14000A410(kbuf, *(unsigned int *)(req + 592), &out_len);
        resp[10] = out_len;
        sub_14000B5D0(Mdl, kbuf);

        unsigned int pid = (unsigned int)PsGetCurrentProcessId();
        sub_140009ECC((HANDLE)pid);                          // ← OR's 0x40000000 side-effect
    }
    else
    {
        int out_len;
        resp[9]  = sub_14000A410(NULL, 0, &out_len);
        resp[10] = out_len;
    }
    return 0;
}
```

`flags` is now `0xC0000000`.

**cmd 775** (`sub_14000406C`) — auth level **1**. Reads `req[584]` as target PID and `req[588]` as a value; if bit `0x28` in that value is set, calls `sub_140009894`, which does `new_flags = (existing & 0xFFFF0000) | 0x0008`.

```c
// sub_14000406C @ 0x14000406C — cmd 775 handler
__int64 __fastcall sub_14000406C(__int64 a1, _DWORD *req, _DWORD *resp)
{
    resp[6] = 1184;
    resp[7] = 0x20260507;
    resp[9] = 0xC0000001;
    resp[8] = ~req[8];

    if ( a1 && sub_140001F4C() )
    {
        HANDLE target = (HANDLE)(unsigned int)req[146];      // req + 584
        if ( (req[147] & 0x28) != 0 )                         // req + 588
            sub_140009894(target);                            // set flags with 0x0008
        else
            sub_14000985C(target);                            // clear path
        resp[9] = 0;
    }
    else
    {
        resp[9] = 0xC0000022;                                 // STATUS_ACCESS_DENIED
    }
    return 0;
}
```

With `req[584] = our_pid` and `req[588] = 0x0008`: `flags = (0xC0000000 & 0xFFFF0000) | 0x0008 = 0xC0000008`.

Three writes. Three opcodes. One of them (cmd 779) requires no authentication at all and produces the middle bit for free. Gate now returns TRUE. All the interesting opcodes open.

The same class-level asymmetry from *Hunting the Hunter*: readers gated, writers not (or gated at a lower level than the readers they enable). In `xhunter1.sys` v2023 it was one opcode reading vs. two opcodes writing. In `xhunter2.sys` v2026 it’s the same shape spread across a three-step chain. Structurally identical bug, one abstraction level up.

The vendor moved the gate. They didn’t move the pattern.

* * *

## Wiring it all together

The path from cold binary to “the driver dispatches our opcodes” ended up being:

1.  Reverse frame acceptance + LCG-XOR encryption from `sub_14000F5AC` and the decrypt helpers.
2.  Reverse WBMF at `sub_140002C80` — magic, offset, RSA verify against `0x140014400` pubkey, Win32StartAddress secondary check inside `sub_1400027F4`.
3.  Extract `wbmf_module.dll` from a live `WindSlayer.exe` memory dump.
4.  Reverse WBCC at `sub_1400027F4` + `sub_1400029B8` — find the `count = 0` fast path.
5.  Reverse the dispatch table at `0x140025710` — extract per-opcode auth levels.
6.  Reverse the PID gate at `sub_140009688` + `sub_140009C40` — identify the trust-state writers (cmd 777 / 779 / 775) and the auth level each one requires.
7.  Build the runtime harness: map the extracted PE at its preferred base, install 14-byte JMP trampolines at chosen offsets, flip the page executable, start each worker thread on its trampoline, send framed + encrypted WBCC + escalation + primitives.

Every constraint the driver imposes turned into a piece of the harness. WBMF signature ⇒ carve real DLL. Win32StartAddress ⇒ trampolines. WBCC per-request ⇒ pre-built blob with `count=0`. PID gate ⇒ three-opcode escalation. Encrypted transport ⇒ LCG-XOR wrapper around every request/response.

At the end of that chain the dispatch table is fully addressable from an unprivileged process. Everything past this point is the *Hunting the Hunter* payload playing out, unchanged — now including kernel-mode code injection via cmd 820.

* * *

## What that gets you

The four impacts from *Hunting the Hunter* still hold on `xhunter2.sys` v2026.6.1.192 tested on Windows 11 25H2 (build 26200.8457) with HVCI + VBS + Microsoft’s Vulnerable Driver Blocklist all enabled. The commands used are documented in the previous post — this one doesn’t re-cover them.

### Credential dump from PPL lsass.exe

After the auth stack is bypassed and cmd 785 opens a `PROCESS_ALL_ACCESS` handle on PPL-Antimalware `lsass.exe`, cmd 787 serves as the memory read: `lsasrv.dll` LDR walk on the driver-issued handle, locate the 3DES key material and IV via version-specific offsets, walk `LogonSessionList`, decrypt each entry’s credential blobs. Output is NT/SHA1 hashes and WDigest plaintext (where enabled) for every logon session on the box. All memory reads go through the driver — no `ReadProcessMemory` from user mode.

### Kill PPL-Antimalware-Light MsMpEng.exe

Cmd 785 on `MsMpEng.exe` for the kernel-minted handle, cmd 791 (`ZwQueryInformationProcess(ProcessHandleInformation=51)`) for a snapshot of the target’s own handle table (queried in kernel context, so PPL doesn’t apply), cmd 800 for each handle to strip `ProtectFromClose` and `ZwClose` inside the attached target. Enough critical handles closed → Defender terminates. SCM restarts it on a fresh PID; the original PPL instance is gone. Confirmed no BSOD on Win11 25H2 (build 26200.8457).

### Interactive SYSTEM shell via winlogon.exe

Cmd 785 on `winlogon.exe` — the returned handle carries every access bit because it was minted `KernelMode`. From user mode, standard `VirtualAllocEx` + `WriteProcessMemory` + `CreateRemoteThread` against that handle, running a 41-byte shellcode that calls `WinExec("cmd.exe /c start cmd.exe", SW_SHOW)`. The child `cmd.exe` inherits winlogon’s `NT AUTHORITY\SYSTEM` token and Session 1, so an interactive SYSTEM console appears on the user’s desktop. `WinExec` ’s address is resolved locally — per-boot ASLR makes kernel32’s base identical across processes on the same boot.

### Kernel-mode code injection

Cmd 820 is a kernel-side injection primitive: the driver allocates RWX memory in the target process, copies the caller’s shellcode into it, and spawns a thread with `RtlCreateUserThread` — all from ring 0. Combined with a cmd 785 handle, the caller can inject arbitrary code into any process regardless of protection level, without touching user-mode allocation APIs. EDR hooks on `VirtualAllocEx` / `NtAllocateVirtualMemory` never fire because the entire alloc → copy → execute chain happens in the kernel.

Every impact reached from a standard user token on a fully-patched machine with the current Microsoft Vulnerable Driver Blocklist active.

* * *

## PoC

Source: **[github.com/BlackSnufkin/AxHunter — axhunter_v2](https://github.com/BlackSnufkin/AxHunter/tree/main/axhunter_v2)**.

Full chain against v2026.6.1.192 — three auth layers bypassed, four impact modes (dump, kill, lpe, inject):

 Your browser does not support the video tag.

* * *

## What the RE showed

Wellbia’s response to CVE-2026-3609 was an auth gate. *Hunting the Hunter* showed that gate defended one side of a shared trust state. The response to *that* was a full protocol rewrite with three cryptographic auth layers. Each layer, taken by itself, looks like a well-formed security boundary — real 2048-bit RSA, real signatures, real kernel data structures with mutex-serialized walks. Taken together they raise the reversing cost meaningfully, and change nothing about who can eventually reach the four primitives on the other side.

The RE process itself took most of a week — most of it spent reversing framing and encryption before any handler decompile was useful, and a good chunk spent understanding why WBMF wouldn’t validate anything until I realized the module wasn’t on disk. Each layer needed a distinct piece of engineering to defeat: memory extraction for layer 1, protocol-level trick for layer 2, dispatch-table trust-flow analysis for layer 3. No memory corruption. No implementation bug. The layers were reverse-engineered and defeated by reading the code and following what it actually trusts.

Wellbia didn’t ship a broken new implementation of an old design — they shipped a new implementation of the same *class* of design. And when you compress what all three layers actually check into one sentence, the shape of the class comes into view:

The driver checks whether the caller possesses a valid artifact. It never checks whether the caller is the process that artifact was issued to. Everything else is elaboration on that gap.

* * *

## Disclosure

This vulnerability is tracked as **[CVE-2026-15430](https://www.cve.org/CVERecord?id=CVE-2026-15430)**, published 2026-08-03.

One related CVE covers the predecessor driver:

-   **[CVE-2026-3609](https://www.cve.org/CVERecord?id=CVE-2026-3609)**— `xhunter1.sys` v10.0.10011.16384 through v2023.12.7.78. Originally covered the legacy 10.x build only; CERT/CC updated the description on 2026-08-05 to include the current production binary covered in *[Hunting the Hunter](https://blacksnufkin.github.io/posts/Hunting-the-Hunter/)*. See the [original write-up](https://blacksnufkin.github.io/posts/AntiCheat-LPE-CVE-2026-3609/) for the legacy build.

The primitives that make the impacts possible (cmd 785, cmd 787, cmd 800) are architecturally the same as in the earlier CVE. What’s new in `xhunter2.sys` is the three-layer authentication mechanism documented above — an RSA-signed device-open token (WBMF), a per-request certificate chain (WBCC), and a per-PID flag gate — all of which can be satisfied by any caller in possession of a signed static artifact distributed with the product.

The driver is not distributed as a standalone artifact. It loads when the user runs any 2026 XIGNCODE3-protected title.

* * *

*Discovered by BlackSnufkin · 2026-07-30*
