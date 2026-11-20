---
title: "HvArm: Chapter 2: Taking Ownership of the EL2 Page Tables"
source: https://0xabe.io/hypervisor/arm/2026/04/30/HvArm-Chapter-2.html
source_host: 0xabe.io
clip_date: 2026-11-20T10:35:24+08:00
trace_id: 77b95870-fcc7-45af-a89c-ce7b0d7fbdb1
content_hash: 21fd2d14d829cb73a6b5f6da73abba53298fbaa9ecd95fc2d46d713b921b1bd5
status: synced
tags: []
series: null
feed_source: 0xabe·ARM Hypervisor/UEFI
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41e75244-d011-8113-ab23-f638a3fa8a62
ioc: null
---

In Chapter 1, we loaded the hypervisor binary into runtime-persistent memory and called its entry point. The placeholder it ran was minimal: it validated the magic number, ran a single library constructor, checked that we were at EL2, and returned. That placeholder is now in the way. Before the hypervisor can install Stage 2 translation, configure traps, deprivilege the boot environment, or do anything else interesting at EL2, it has to take control of EL2 itself — starting with the translation regime that EL2 is currently using.

When our binary starts executing, the EL2 MMU is already on. The firmware (AAVMF on QEMU) configured `TCR_EL2`, set up `TTBR0_EL2`, and turned on the M bit in `SCTLR_EL2` long before our entry point was called. The page tables our code reads from and writes to are owned by the firmware, allocated in firmware memory, and freed at some point we have no control over. We need to migrate to our own page tables that live in `EfiRuntimeServicesData` memory and outlive `ExitBootServices()`.

This chapter walks through that migration. It starts with a small but necessary fix in the entry point — manually initializing `gBS` so that we can actually call boot services — then covers the full sequence: reading the current MMU configuration, walking the live page tables to size the new allocation, copying the hierarchy with table descriptors retargeted to point at the new memory, sanity-checking the result against the hardware translation, and finally switching `TTBR0_EL2` to the new root with the right barriers and TLB invalidation. The implementation lives in `HvArmPkg/Applications/HvArm/EL2PageTables.c` and the small ARM helpers it needs are in `ArmLib.c` / `ArmLib.h`.

The source code for this chapter is available at [https://gitlab.com/0xabe.io/hvarm](https://gitlab.com/0xabe.io/hvarm).

* * *

## More manual library initialization

Chapter 1 ended with a note about library constructors: bypassing the standard UEFI image loader means we don’t get `ProcessLibraryConstructorList()` called for us, so any constructor that the library implementation depends on has to be invoked manually. The placeholder only needed `DxeDebugLibConstructor`, and that was enough to make the logging macros work.

The page-table code needs more. It calls `gBS->GetMemoryMap()`, `gBS->AllocatePages()`, `gBS->FreePages()`, and the `AllocatePool` / `FreePool` helpers from `MemoryAllocationLib` — all of which go through `gBS`, the global pointer to the UEFI Boot Services Table. In a normal UEFI application, `gBS` is set by `UefiBootServicesTableLibConstructor`, which the build system arranges to call before the entry point. In our manual-loading model that constructor was never invoked, so `gBS` is `NULL`, and the first call into boot services would dereference a null pointer.

The fix is exactly what we did for the debug library, just one constructor earlier:

```c
EFI_STATUS
EFIAPI
UefiBootServicesTableLibConstructor (
  IN EFI_HANDLE ImageHandle,
  IN EFI_SYSTEM_TABLE *SystemTable
);

...

Status = UefiBootServicesTableLibConstructor (
           (EFI_HANDLE)HVARM_MAGIC,
           SystemTable
           );
if (EFI_ERROR (Status)) {
  return Status;
}

Status = DxeDebugLibConstructor ((EFI_HANDLE)HVARM_MAGIC, SystemTable);
if (EFI_ERROR (Status)) {
  return Status;
}

return HvArmMain ();
```

Order matters here. `UefiBootServicesTableLibConstructor` sets `gBS`, `gST`, and `gImageHandle`, and other libraries, including `MemoryAllocationLib` read those globals. Calling the boot-services constructor first guarantees they’re populated before anything else runs. The constructor also `ASSERT` s that `ImageHandle != NULL`, which is why we pass `HVARM_MAGIC` rather than passing `NULL` outright — even though our code never reads it back.

* * *

## Taking ownership of the address translation

The firmware has already set up the page tables, set the physical address in `TTBR0_EL2` and enabled the MMU. The problem is ownership and lifetime. UEFI allocates its own page tables out of `EfiBootServicesData`. After `ExitBootServices()`, that kind of memory is unmapped and the bootloader or the OS is free to reclaim it. The moment it does, the page tables our hypervisor is walking get overwritten, and the next memory access triggers a translation fault into an EL2 vector that has long since been clobbered. The hypervisor is dead before the OS finishes its first userspace process. This is the same reason we had to manually load the hypervisor into memory that will survive the switch to runtime.

The remedy is to hold on to a translation regime we own. We don’t need to re-engineer it from scratch — for now the firmware’s mapping is exactly what we want, since the hypervisor will run with the same view of physical memory the firmware had. We just need a copy of the tables in memory the OS is required to leave alone (`EfiRuntimeServicesData`), and we need `TTBR0_EL2` pointing at our copy before anyone reclaims the original.

The whole sequence breaks down into seven steps:

1.  **Read the current MMU state**— `TTBR0_EL2`, `TCR_EL2`, `MAIR_EL2`, `SCTLR_EL2`, `HCR_EL2`. Gather the values and settings we care about.
2.  **Decide what we support.** The 4 KB granule is the only configuration we handle; FEAT_LPA2 is supported because the firmware uses it, but VHE with `TTBR1_EL2` walks is refused.
3.  **Walk the live tables to size the allocation.** Counting tables at every level gives us the exact number of pages we need.
4.  **Allocate that many contiguous pages** as `EfiRuntimeServicesData` and lay them out region by region.
5.  **Copy the live tables into the new allocation**, retargeting every table descriptor to point at the corresponding slot in the new memory.
6.  **Verify** by walking the new tables manually and comparing against an `AT S1E2R` instruction that asks the hardware to translate the same address through the *currently installed* tables. If our copy is correct, the two answers must match.
7.  **Switch** `TTBR0_EL2` to the new root, with the architectural sequence of barriers and a TLB invalidate.

Each step has a few choices and a few ways to get it wrong. The rest of this chapter walks through them in order.

* * *

## Reading the current MMU state

The first thing we need is the firmware’s translation configuration.

-   **[`TTBR0_EL2`](https://developer.arm.com/documentation/ddi0601/2022-09/AArch64-Registers/TTBR0-EL2--Translation-Table-Base-Register-0--EL2-)**— the base of the translation tables. Bits \[47:1\] hold the table base (or \[49:1\] under FEAT_LPA2); the high bits can carry an `ASID`, and bit 0 is `CnP` (Common-not-Private — TLB sharing across PEs in a coherent cluster).
-   **[`TCR_EL2`](https://developer.arm.com/documentation/ddi0601/2022-09/AArch64-Registers/TCR-EL2--Translation-Control-Register--EL2-)**— translation control. Holds the input-address size `T0SZ`, the granule size `TG0`, shareability and cacheability hints, the physical-address size `PS` or `IPS` depending on regime, and the FEAT_LPA2 enable bit `DS`.
-   **[`MAIR_EL2`](https://developer.arm.com/documentation/ddi0601/2022-09/AArch64-Registers/MAIR-EL2--Memory-Attribute-Indirection-Register--EL2-)**— memory-attribute indirection register. An array of eight 8-bit attribute encodings (Normal/Device, cacheability, etc.) that page table entries select via a 3-bit index in `AttrIndx`. We don’t decode it; we just preserve it.
-   **[`SCTLR_EL2`](https://developer.arm.com/documentation/ddi0601/2022-09/AArch64-Registers/SCTLR-EL2--System-Control-Register--EL2-?lang=en)**— system control. Bit 0 is `M`, the MMU enable bit. We don’t change it during the migration, because we will keep the same identity mapping and it is easier to keep the MMU enabled.

There is a fifth register that determines how to interpret the others: **`HCR_EL2`**, the Hypervisor Configuration Register. Its **`E2H`** bit (34) selects between two completely different layouts of `TCR_EL2`. This will be covered in the next section.

All the functions used to read and write to system registers are declared and defined in `ArmLib.h` and `ArmLib.c` respectively. For example, here is the function that reads `TCR_EL2` and returns its value:

```c
UINT64
EFIAPI
ArmReadTcrEl2 (
  VOID
  )
{
  UINT64  Value;
  __asm__ volatile ("mrs %0, TCR_EL2" : "=r" (Value));
  return Value;
}
```

Every other system-register read in the hypervisor follows the same pattern. Keeping them in a dedicated library file keeps the page-table code free of inline assembly and gives us a single place to add new accessors as the hypervisor grows.

### Two layouts of TCR_EL2

The Armv8 architecture originally defined `TCR_EL2` as the translation control for an “EL2-only” regime: a single virtual address space (TTBR0 only), used by code running at EL2. Bits \[18:16\] hold the physical-address size (`PS`), bits \[15:14\] the granule (`TG0`), bits \[13:12\] the shareability, bits \[5:0\] the size shift. The high half of the register is reserved.

Armv8.1-A introduced **VHE** (Virtualization Host Extensions). When `HCR_EL2.E2H` is set, EL2 stops being a separate single-address-space regime and starts behaving like EL1: it gets a full EL1-style TCR layout with both TTBR0 and TTBR1 halves, separate granule and size fields for each (`TG1`, `T1SZ`), an `EPD1` “disable upper-half walks” bit, and the physical-address size relocated from `[18:16]` to `[34:32]` (now called `IPS`). It also gets the EL2&0 translation regime, which lets a host kernel run directly at EL2 with userspace at EL0 — the “host kernel uses EL2 directly” path that modern KVM uses as a Type 2 hypervisor. From the OS’s point of view nothing changes; from EL2’s point of view, every shift and mask of `TCR_EL2` is in a different place.

AAVMF on QEMU’s `virt` machine sets `E2H` and runs in the VHE layout. We logged the raw register values from the running firmware:

```
[I] HCR_EL2:   0x408000038 (E2H=1)
[I] TCR_EL2:   0x80000068080350C
[I] TTBR0_EL2: 0x47FFF000
[I] TTBR1_EL2: 0x0
```

`HCR_EL2 = 0x408000038` — bit 34 (`E2H`) and bit 27 (`TGE`) are both set, plus IMO/AMO/FMO at \[5:3\]. We will come back to `TGE` at the end of the chapter; for now what matters is that `E2H` is set, so `TCR_EL2` must be parsed in the VHE layout.

The parser takes a `BOOLEAN E2h` argument and picks fields from the right positions. The fields that exist in both layouts (T0SZ, IRGN0, ORGN0, SH0, TG0, DS) come from a fixed location; PS/IPS shifts depending on the regime; in the VHE case we additionally need to check `EPD1`:

```c
if (E2h) {
  PsValue   = (UINT8)((TcrEl2Value >> TCR_EL2_IPS_SHIFT)  & TCR_EL2_IPS_MASK);
  Epd1Value = (UINT8)((TcrEl2Value >> TCR_EL2_EPD1_SHIFT) & TCR_EL2_EPD1_MASK);
  if (Epd1Value == 0) {
    HVARM_ERROR("E2H=1 with EPD1=0 is not supported");
    return EFI_UNSUPPORTED;
  }
} else {
  PsValue = (UINT8)((TcrEl2Value >> TCR_EL2_PS_SHIFT) & TCR_EL2_PS_MASK);
}
```

`EPD1` is the “disable TTBR1 walks” bit. When `E2H=1` and `EPD1=0`, the upper half of the address space is active and the firmware would have a second translation hierarchy under `TTBR1_EL2`. The migration code only walks `TTBR0_EL2`; if `EPD1=0` we’d silently lose half the mappings. Refusing up front with `EFI_UNSUPPORTED` is much better than producing a half-correct page table that explodes in unpredictable ways. AAVMF sets `EPD1=1` (and `TTBR1_EL2 = 0`) so we accept it. Different hardware that wants the upper half active will need a second pass over TTBR1_EL2, but that’s not needed for now.

* * *

## What we don’t support (yet?)

Armv8 lets the firmware pick from a myriad of translation configurations. Supporting them all would increase the complexity of the page-table code without buying us anything we need for now. The migration code restricts itself to the configurations that AAVMF actually uses on the `virt` machine and refuses everything else with a clear error.

-   **Granule size.** Armv8 supports three granule sizes — 4 KB, 16 KB, and 64 KB — selected by `TCR_EL2.TG0`. They differ in how many bits of the virtual address each level resolves (9, 11, and 13 respectively), the page size, the maximum block sizes at each level, and the maximum table depth. We only support 4 KB. AAVMF on QEMU uses 4 KB; Linux on QEMU’s `virt` machine uses 4 KB; the only common system that ships 64 KB pages is some server-class Linux configurations, which aren’t in scope for now. The 16 KB case is used by Apple’s M-series silicon, also out of scope. Refusing 16 KB and 64 KB up front lets us hard-code `EL2_BITS_PER_LEVEL = 9`, `EL2_PAGE_OFFSET_BITS = 12`, and `EL2_ENTRIES_PER_TABLE = 512` everywhere instead of carrying a `Config` parameter through every helper.
    
-   **VHE without `EPD1=1`.** Already discussed. Walking only `TTBR0_EL2` is fine on AAVMF because the upper half is disabled. A configuration with both halves active would need a second walk and a second copy.
    
-   **FEAT_LPA (52-bit OAs with 64 KB granule).** Different bit positions for the high OA bits than FEAT_LPA2; we don’t support 64 KB at all, so this is implicitly out of scope.
    
-   **Output addresses above `2^50`.** FEAT_LPA2 stores the high two bits of a 52-bit physical address (OA\[51:50\]) in PTE bits \[9:8\], a region that overlaps with where `SH` lives in non-LPA2 configurations. The page-table copy code preserves descriptor attributes verbatim, including bits \[9:8\], so anything the firmware wrote there flows through unchanged. But the descriptor-to-PA computation in our walker uses a mask that covers only OA\[49:12\]. On QEMU `virt` every physical address fits in 33 bits and bits \[51:50\] are always zero, so this is academic. On a system that genuinely uses bits \[51:50\] as part of an output address, the verifier would catch the mismatch and refuse to install the new tables.
    
-   **`HCR_EL2.E2H` flipping.** We accept whichever value the firmware leaves in `E2H` and parse `TCR_EL2` accordingly. We do *not* try to clear `E2H`. Doing so would require disabling the EL2 MMU, switching regimes, rebuilding `TCR_EL2` in the non-VHE layout, and re-enabling — all without faulting between the disable and the enable. It’s possible but expensive and gains us nothing: a guest at EL1 sees its own EL1 system registers regardless of whether the underlying hypervisor sits in the EL2-only or the EL2&0 regime. The two regimes share the same `TTBR0_EL2`, the same TLBI semantics, and the same exception model; the only thing that changes is how we decode the bits of `TCR_EL2`.
    

This is roughly the same approach the Linux kernel takes: it accepts the regime the bootloader handed it and calls it a day.

### FEAT_LPA2 and the level −1 table

The one configuration we *do* have to support, even though it complicates the walk, is FEAT_LPA2. It is enabled by `TCR_EL2.DS = 1` and selects a 52-bit input/output address encoding. With the 4 KB granule, when `T0SZ` is small enough that the input address exceeds 48 bits (the threshold is `T0SZ ∈ [12, 15]`), the architecture inserts an extra translation level above L0, called **level −1**.

A normal 4 KB walk uses 9 bits per level. With the lowest 12 bits as the page offset and four levels (L0..L3), it covers `12 + 4·9 = 48` bits of input address. To cover 52 bits, the architecture adds one more lookup — but only 4 bits of it (`52 − 48 = 4`). The level −1 table is granule-sized like every other table, but only its first 16 entries (`2^4`) are addressable; the rest are RES0. Each entry is a table descriptor that points at an L0 table.

AAVMF on QEMU configures `T0SZ = 12`, which puts us squarely in the 5-level region as per the [documentation](https://developer.arm.com/documentation/ddi0601/2022-09/AArch64-Registers/TCR-EL2--Translation-Control-Register--EL2-?lang=en#fieldset_0-5_0):

```
[I] T0SZ: 12
[I] Granule: 4KB
[I] FEAT_LPA2 (DS): yes
```

That single line — `T0SZ = 12` — controls everything downstream. Our `GetStartingLevel()` returns −1 for this case and 0, 1, 2, or 3 for shallower configurations:

```c
TotalLevels = (InputAddressBits - EL2_PAGE_OFFSET_BITS + EL2_BITS_PER_LEVEL - 1)
              / EL2_BITS_PER_LEVEL;

if (TotalLevels >= 5) {
  return -1;
} else if (TotalLevels >= 4) {
  return 0;
}
// ...
```

The recursive helpers (`CountOldPageTablesRecursive`, `CopyPageTableLevel`) take an `INT32 Level` so the recursion can begin at −1. At every level except −1 we iterate all 512 entries; at −1 we iterate only the architecturally-addressable 16. The walk math at −1 also differs slightly: the index is in bits \[51:48\] of the VA, masked with `0xF` instead of `0x1FF`.

This is how a virtual address is sliced to get the indices of the entries in the table and the offset in the page:

| Component | Bit Range | Width | Table Capacity | Architectural Note |
| --- | --- | --- | --- | --- |
| **Level -1** | \[51:48\] | 4 bits | 16 entries | **New level introduced by FEAT_LPA2** |
| **Level 0** | \[47:39\] | 9 bits | 512 entries | Standard |
| **Level 1** | \[38:30\] | 9 bits | 512 entries | Standard |
| **Level 2** | \[29:21\] | 9 bits | 512 entries | Standard |
| **Level 3** | \[20:12\] | 9 bits | 512 entries | Standard |
| **Offset** | \[11:0\] | 12 bits | 4096 bytes | 4KB Page Size |

The end-to-end correctness of this is what the verifier (step 6) actually tests.

* * *

## Walking the live tables to size the allocation

We need to know, before allocating anything, exactly how many tables of each level the firmware’s hierarchy contains. Heuristics based on “how much memory does the system have” do not work — the firmware can map MMIO regions far above DRAM, leave large holes, or use different block sizes than we’d predict — and over-estimating means wasting memory we can never reclaim while under-estimating is a buffer overflow on the next step.

The exact answer comes from the live tables themselves. Every page-table entry has bits \[1:0\] that classify it: 0b00 = invalid, 0b01 = block descriptor (terminal mapping at this level), 0b11 = table descriptor (pointer to the next level), 0b10 = reserved. We start at the root, recursively descend through every table descriptor, and bump a per-level counter for each table we cross.

```c
for (Index = 0; Index < IterEntries; Index++) {
  Entry = Table[Index];

  if ((Entry & PTE_VALID) == 0) {
    continue;
  }
  if ((Entry & PTE_TABLE) == 0) {
    continue;  // block descriptor, terminal
  }

  NextTable = (UINT64 *)(UINTN)(Entry & OutputAddressMask);

  switch (Level) {
    case -1: (*L0Count)++; break;
    case  0: (*L1Count)++; break;
    case  1: (*L2Count)++; break;
    case  2: (*L3Count)++; break;
  }

  CountOldPageTablesRecursive(NextTable, Level + 1, ...);
}
```

The root table itself is exactly one of whatever level we start at, so the caller seeds the matching counter to 1 before kicking off the recursion. After the walk, the requirements struct holds the exact number of tables at every level. On AAVMF, the run we’ll use as a worked example produced:

```yaml
[I] Start level: -1
[I] L-1 tables: 1
[I] L0  tables: 1
[I] L1  tables: 2
[I] L2  tables: 4
[I] L3  tables: 17
[I] Total size: 0x19000 bytes
```

A quick sanity check against the UEFI memory map: physical RAM lives in `[0, 0x140000000)`, which fits entirely under L0\[0\]. So why two L1 tables? Because AAVMF maps regions above DRAM (high MMIO, the boot ROM region, the GIC distributor) under a second L0 entry, even though those addresses don’t appear in `GetMemoryMap()`. The walk catches it; a memory-map-driven heuristic would have missed it.

* * *

## Allocating contiguous memory

With exact counts in hand, allocation is straightforward. We total the per-level page counts and ask `gBS->AllocatePages()` for that many contiguous pages of `EfiRuntimeServicesData`:

```c
NumPages = EFI_SIZE_TO_PAGES(Requirements->TotalSize);
Status = gBS->AllocatePages(
                AllocateAnyPages,
                EfiRuntimeServicesData,
                NumPages,
                &BaseAddress
                );
```

`AllocateAnyPages` lets the firmware choose the physical location — we don’t care where it lands. `EfiRuntimeServicesData` is the matching memory type for `EfiRuntimeServicesCode`, which the binary itself was loaded as in Chapter 1: both survive `ExitBootServices()`, and the OS is required to preserve them.

The block is then sliced into per-level regions in a fixed order: `[L-1][L0][L1][L2][L3]`. Each region is a contiguous run of granule-sized tables. The L-1 region is one page and may be zero pages if we don’t start at level −1; the L0 region holds however many L0 tables we counted; and so on. The “root” pointer — what eventually goes into `TTBR0_EL2` — is `LMinus1Base` if level −1 is in use, otherwise `L0Base`.

```c
PageTableMem->RootBase = (Requirements->LMinus1Tables > 0)
                       ? PageTableMem->LMinus1Base
                       : PageTableMem->L0Base;
```

The numbered regions are not just an organizational nicety; they make the next step, the copy, much simpler. When we encounter an L1 table while copying, we know its destination: take the next unused slot in the L1 region. We don’t have to pre-decide which firmware table maps to which destination, only allocate one slot per visit.

* * *

## Copying the page tables

The copy is the heart of the migration. We walk the firmware’s table hierarchy depth-first, and for each entry we either copy it verbatim - invalid entries, block descriptors, leaf-page entries - or, for table descriptors, we copy the attributes and rewrite the address half to point at a freshly-allocated slot in the new memory.

The loop looks roughly like this:

```c
for (EntryIndex = 0; EntryIndex < IterEntries; EntryIndex++) {
  Entry = OldTable[EntryIndex];

  // Copy the entry verbatim. We'll overwrite the address part below
  // if (and only if) it's a table descriptor.
  NewTable[EntryIndex] = Entry;

  if (((Entry & PTE_VALID) == 0) || (Level == 3)) {
    continue;
  }
  if ((Entry & PTE_TABLE) == 0) {
    continue;  // block descriptor: terminal, no recursion
  }

  // Table descriptor: take the next slot in the destination region for
  // the next level, retarget this entry, and recurse.
  OldNextLevel = (UINT64 *)(UINTN)(Entry & OutputAddressMask);
  NewNextLevel = ... // next free slot at Level+1
  NewTable[EntryIndex] = ((UINT64)(UINTN)NewNextLevel)
                       | (Entry & ~OutputAddressMask);

  CopyPageTableLevel(OldNextLevel, NewNextLevel, Level + 1, ...);
}
```

Three details deserve attention.

### Verbatim copy of attributes

Every PTE has roughly 16 bits of attribute information beyond the output address: AP\[2:1\] for read/write/EL0 access, SH\[1:0\] for shareability, AttrIndx\[2:0\] for the MAIR index, AF for the access flag, NS, contiguous-hint, UXN/PXN/XN, and various RES1/RES0 reservations. We don’t try to interpret any of this. The mapping the firmware established is the one we want, so we copy the entire bit pattern across and only rewrite the address half. This also automatically preserves OA\[51:50\] in the `FEAT_LPA2` case (those bits live in PTE \[9:8\]), since we copy them along with the rest of the attributes.

### Per-level next-slot bookkeeping

The recursion threads four indices (`L0Index`, `L1Index`, `L2Index`, `L3Index`) through the walk. Each time we encounter a table descriptor at level *N*, we hand out the next free slot at level *N+1* and increment the corresponding index. The slot is computed as a base-plus-offset into the contiguous region:

```c
NewNextLevel = &PageTableMem->L1Base[(*L1Index) * EL2_ENTRIES_PER_TABLE];
```

This is why the requirements pass had to be exact: under-counting means the indices run past the end of the region.

### Level −1 only iterates 16 entries

At every level except −1, we walk all 512 entries (the full granule’s worth). At −1, the high 496 are RES0 and would be misinterpreted as garbage if we tried to read them as descriptors. The loop bound is selected with a small ternary based on the level.

The result is a freshly-built hierarchy, byte-identical to the firmware’s at every leaf and every block, and structurally identical except that every “next level” pointer now lands inside our allocation.

* * *

## Verifying before we commit

A copy bug — wrong index, wrong mask, wrong region — would build a hierarchy that *looks* fine, allocates without complaint, and translates a few addresses by accident. The first time the hardware walks it for an address we forgot to test, we get a translation fault into an EL2 vector that doesn’t exist, and the machine hangs in an unrecoverable state.

We can detect that before installing the new tables, because the live tables and the new tables ought to produce the same physical address for any virtual address. The hardware can be asked to walk the *currently installed* tables for any VA via the `AT S1E2R` instruction (Address Translation, Stage 1, EL2, Read), which returns the result in `PAR_EL1`. Our software walker can produce the same translation through the *new* tables. If the two answers agree, the new tables are at least correct for that address.

```c
ParResult = ArmAddressTranslateS1E2R(VirtualAddress);    // hardware walk, current tables
WalkPageTable(VirtualAddress, NewTtbr0, &Config, &Result); // software walk, new tables

if (Result.PhysicalAddress != ((ParResult & OutputAddressMask)
                              | (VirtualAddress & EL2_PAGE_OFFSET_MASK))) {
  // mismatch — refuse to install
}
```

We pick a VA that *must* be mapped — the address of the migration function itself — so that a faulting `AT` would also be diagnostic of a bigger problem:

```c
VerifyVa = (UINT64)(UINTN)&InitializeEl2Stage1Translation;
```

The 5-level walk on the working configuration produces output like this:

```
[I] WalkPageTable: Page walk for VA 0x13FC04390:
[I]   Starting level: -1
[I]   L-1[0]   @ 0x13DEB0000 = 0x13DEB1003
[I]   L0[0]    @ 0x13DEB1000 = 0x13DEB2003
[I]   L1[4]    @ 0x13DEB2020 = 0x13DEB6003
[I]   L2[510]  @ 0x13DEB6FF0 = 0x13DEC7003
[I]   L3[4]    @ 0x13DEC7020 = 0x13FC0440F
[I]   Page translation: VA 0x13FC04390 -> PA 0x13FC04390
[I] VerifyTranslation: Translation verified: VA 0x13FC04390 -> PA 0x13FC04390
```

Each table descriptor’s low 12 bits are `0x003` — `PTE_VALID | PTE_TABLE` — and the high bits give the next table’s address, which is always inside our allocation (`0x13DEB____`). The L3 entry has `0x40F` in the low bits — `PTE_VALID | PTE_PAGE | PTE_AF | (...)` — and the high bits land back in the original physical region, which is the identity mapping we copied. The hardware path through the original tables produced the same physical address.

If the walker had returned a different PA, or if any level had an invalid entry, we would have refused to install the new tables and freed the allocation, leaving the firmware’s tables in place. The system would limp on with `EFI_DEVICE_ERROR` returned to the Helper.

* * *

## Switching to the new page tables

The last step is to install the new root. The architecture mandates a specific sequence of barriers and TLB maintenance; getting this wrong is a great way to silently corrupt translations.

```c
ArmDataSynchronizationBarrier();   // dsb ish — make all writes to the new tables visible
ArmWriteTtbr0El2(NewTtbr0);
ArmInstructionSynchronizationBarrier(); // isb — context-synchronize
ArmInvalidateTlb();                // tlbi alle2is + dsb ish + isb
```

The `dsb ish` before the `msr` ensures every store we did while building the new tables is observable in the inner-shareable domain by the time the page-table walker starts using them. The `isb` after the `msr` forces the CPU to context-synchronize, so subsequent instructions actually see the new `TTBR0_EL2` value rather than executing under the cached old one. The `tlbi alle2is` invalidates every Stage 1 EL2 TLB entry in the inner-shareable domain — necessary because a TLB lookup that hits a cached translation from the *old* `TTBR0_EL2` would not be invalidated by the register write alone. The trailing `dsb ish` waits for the invalidation to complete, and the final `isb` makes sure no instruction past the switch is fetched under the stale TLB state.

We do *not* disable the MMU around the switch. Some implementations do, on the theory that a half-updated translation regime is dangerous; but disabling the MMU at EL2 mid-flight requires the code performing the disable, the stack, and the `SCTLR_EL2` -write instruction itself to be either identity-mapped or fetched from a region that survives the disable — and identity is exactly what we have, but only because we just copied the firmware’s identity tables. The byte-for-byte-equivalent property is what makes the swap safe without an MMU disable: every VA that translated to PA *X* before the switch still translates to *X* after, because the new tables describe the same mapping. The TLBI is still required because the cached entries are tagged by the old `TTBR0_EL2` value and the architecture does not promise that tags are recomputed on a TTBR write.

There is one bit of paranoia worth doing, even if AAVMF doesn’t trip it. `TTBR0_EL2` carries more than a table base: bits \[63:48\] can hold an ASID and bit 0 holds CnP. On AAVMF both are zero, but a different firmware might not match. The safe thing is to take everything from the old `TTBR0_EL2` that *isn’t* the table-base, and OR it into the new value:

```c
OutputAddressMask = GetOutputAddressMask(&PageTableMem->Config);
PreservedBits     = OldState->Ttbr0El2 & ~OutputAddressMask;
NewTtbr0          = ((UINT64)(UINTN)PageTableMem->RootBase) | PreservedBits;
```

The OA mask is exactly the table-base range, so its complement is precisely “ASID + CnP + reserved meta-bits”. Carrying them through preserves whatever the firmware set up.

After the switch, `TTBR0_EL2` points at our allocation, the TLB is empty, and translations resume against tables we own. The `Helper.efi ttbr0` command, which reads `TTBR0_EL2` and prints it, confirms the move:

```
FS1:\> Helper.efi ttbr0
TTBR0: 13DEB0000
```

That’s the base address of the new allocation. The migration is complete.

* * *

## A note on TGE

Reading `HCR_EL2 = 0x408000038` in the trace earlier, we noted that bit 27 — `TGE` (Trap General Exceptions) — is set. Together with `E2H = 1`, this is the configuration AAVMF uses while running its own code: the **EL2&0 host regime**, where EL2 acts like a kernel and userspace would run at EL0 under the same translation regime. It is the same configuration a Linux kernel uses on a VHE-capable CPU when it runs the host kernel directly at EL2.

`TGE = 1` has two consequences relevant to us. First, EL0 executes under EL2’s translation regime — but we don’t have EL0 code, so that’s irrelevant during the page-table migration. Second, when EL1 system registers are accessed (`TTBR0_EL1`, `TCR_EL1`, `MAIR_EL1`, etc.), they get redirected to their EL2 counterparts. This is invisible to us right now because we are at EL2 and reading EL2 registers explicitly, but it has serious implications for the eventual handoff to a guest OS.

The plan, in a future chapter, is to let the firmware finish booting normally (BDS, the OS loader, all the way to the OS kernel’s entry point), and then have our hypervisor `ERET` into the kernel at EL1 — except the kernel will be running under our Stage 2 translation rather than touching real physical memory. For that `ERET` to land the kernel in a regime it expects, **`TGE` has to be cleared first**. With `TGE = 1` and `E2H = 1`, an EL1 kernel’s writes to its EL1 system registers would redirect into EL2 state, its EL0 traps would route to EL2 unconditionally, and the regime semantics would be the host-kernel ones, not the guest-kernel ones.

The clearing itself is a single masked write to `HCR_EL2`, but the timing matters. We can’t do it now: clearing `TGE` while the firmware is still running its boot logic would change the regime under its feet. We also can’t do it after `ExitBootServices()` casually, because intermediate UEFI runtime services might still expect the host regime. The right point is just before the `ERET` to the OS kernel — at the same boundary where we install Stage 2 translation, set up the EL2 vector base, and pin down the rest of the trap configuration. That’s a chapter or two ahead.

For now, `TGE` stays set, and our page-table migration is unaffected by it — the migration is entirely a `TTBR0_EL2` operation, and `TTBR0_EL2` is the same register (and walked by the same hardware path) regardless of `TGE`.

* * *

## Running it

With the code in place, the build and run flow is unchanged from Chapter 1:

```
./build.py --iso /tmp/hvarm.iso
```

In the VM, boot to the UEFI Shell and load the hypervisor:

```
Shell> fs1:
FS1:\> Helper.efi load HvArm.efi
```

The hypervisor entry point now runs the full migration. With `DEBUG` -level logging enabled the output is verbose — the raw register values, every region in the UEFI memory map, the per-level table counts, the per-level allocation, the verification walk, and the switch. The condensed picture looks like this:

```yaml
[I] === Initializing EL2 Stage 1 Translation ===
[I] Raw MMU register values:
[I]   HCR_EL2:   0x408000038 (E2H=1)
[I]   TCR_EL2:   0x80000068080350C
[I]   TTBR0_EL2: 0x47FFF000
[I] TCR_EL2 Configuration:
[I]   Regime: EL2&0 (VHE, E2H=1)
[I]   T0SZ: 12, Granule: 4KB
[I]   FEAT_LPA2 (DS): yes
...
[I] Page Table Requirements (from live tables):
[I]   Start level: -1
[I]   L-1: 1, L0: 1, L1: 2, L2: 4, L3: 17
[I]   Total size: 0x19000 bytes
[I] Page Table Memory Allocated:
[I]   Root: 0x13DEB0000 (TTBR0_EL2 will point here)
[I] Copying page tables from 0x47FFF000 to 0x13DEB0000 (start level -1)
[I] Page tables copied successfully
[I] Page walk for VA 0x13FC04390:
...
[I] Translation verified: VA 0x13FC04390 -> PA 0x13FC04390
[I] Switching to new page tables (root 0x13DEB0000, ...)
[I] Successfully switched to new page tables
[I] === EL2 Stage 1 Translation Initialized Successfully ===
Entry point returned: Success

FS1:\> Helper.efi ttbr0
TTBR0: 13DEB0000
```

The hypervisor returns control to the Helper, which returns to the Shell, and the Shell continues to function — every shell command, every keystroke, every `Print()` is going through `TTBR0_EL2 = 0x13DEB0000` now. The firmware has no idea anything changed.

* * *

## Conclusion

This chapter took the placeholder hypervisor from Chapter 1 and gave it ownership of the EL2 stage-1 translation regime. The work was structured around seven steps: read the current MMU state, decide what we support, walk the live tables to size the allocation, allocate the new memory in `EfiRuntimeServicesData`, copy the hierarchy with table descriptors retargeted to the new memory, verify the result against the hardware translator, and finally swap `TTBR0_EL2` with the architecturally-mandated barriers and TLB invalidation.

Along the way, several Armv8 details came up that will recur as the hypervisor grows. `TCR_EL2` has two completely different layouts depending on `HCR_EL2.E2H`, and AAVMF on QEMU sets `E2H` — so the hypervisor has to know how to parse the VHE layout. `FEAT_LPA2` with `T0SZ = 12` requires a 5-level page-table walk starting at level −1, with only 16 addressable entries at the top. The `AT S1E2R` instruction is a powerful debugging primitive: it lets us ask the hardware to translate any address through the currently-installed tables, which is exactly the oracle we needed to verify our copy. And the swap itself is safe without an MMU disable, because the new tables are byte-identical to the old at every leaf — every VA still maps to the same PA, and the only thing the TLBI does is flush ASID-tagged stale entries.

The end state is a hypervisor that runs at EL2 against page tables it owns, in memory the OS is required to preserve. It still doesn’t *do* anything beyond that.

**In the next chapters**, we will start putting the EL2 trap infrastructure in place: a vector table, an exception handler, and the first `HCR_EL2` traps that route guest events to us. After that, we will build Stage 2 translation, pin down the rest of the trap configuration, clear `TGE`, and finally `ERET` into a guest at EL1 — at which point the hypervisor goes from “in control of EL2” to “in control of the system”.
