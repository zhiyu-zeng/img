---
title: "HvArm: Chapter 3: Stage 2 Translation and Preparing for EL1"
source: https://0xabe.io/hypervisor/arm/2026/05/29/HvArm-Chapter-3.html
source_host: 0xabe.io
clip_date: 2026-11-20T10:35:55+08:00
trace_id: 98e1f0dc-5bb4-4307-9fe5-b3eda251d412
content_hash: 731fdc976b618a86f69b657e56873fd90186f71d3b1d600b07aaa38fc174cb7d
status: synced
tags: []
series: null
feed_source: 0xabe·ARM Hypervisor/UEFI
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41e75244-d011-8105-bcf7-fc59178e9c61
ioc: null
---

In Chapter 2 we took ownership of the EL2 stage-1 translation regime: we rebuilt the firmware’s page tables in our own `EfiRuntimeServicesData` allocation and switched [`TTBR0_EL2`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/TTBR0-EL2--Translation-Table-Base-Register-0--EL2-) to point at it. The hypervisor now runs against memory the OS is required to preserve, but that is still entirely an EL2 concern. The boot environment — UEFI Shell, runtime services, the OS loader that comes later — is sitting in front of us at EL2 too, sharing our exception level. The whole point of a passthrough hypervisor is to push that boot environment down to EL1 so we can interpose on it. Before we can do that, two more pieces have to be in place.

The first piece is **stage 2 translation**. The moment we deprivilege the boot environment to EL1, every memory access it makes goes through stage 2 — Intermediate Physical Address (IPA) to Physical Address (PA). If stage 2 is enabled with no page tables installed, the first EL1 instruction faults on its own fetch. If stage 2 is *disabled* while EL1 runs, we have no hypervisor — the guest just accesses physical memory directly. Setting up identity-mapped stage 2 page tables and programming [`HCR_EL2`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/HCR-EL2--Hypervisor-Configuration-Register) for guest execution is what gives us the hook the hypervisor needs.

The second piece is **EL1 system register state**. The eventual `ERET` will install a new PSTATE and a new PC, but the EL1 system registers — [`SCTLR_EL1`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/SCTLR-EL1--System-Control-Register--EL1-), [`TCR_EL1`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/TCR-EL1--Translation-Control-Register--EL1-), [`TTBR0_EL1`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/TTBR0-EL1--Translation-Table-Base-Register-0--EL1-), [`MAIR_EL1`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/MAIR-EL1--Memory-Attribute-Indirection-Register--EL1-), and friends — need to already describe a translation regime EL1 can actually run in. For a passthrough hypervisor the simplest sensible choice is “the same regime EL2 uses today”, so guest code sees the same VAs map to the same PAs it sees right now.

This chapter does both, and stops just short of issuing the `ERET`. The actual exception return needs an EL2 vector table and EL1 exception vectors before we dare execute it — neither of which exists yet — so the chapter ends with everything wired up to a placeholder trampoline that, in the next chapter, will flip a single instruction from `ret` to `eret` and wake up at EL1.

The source code for this chapter is available at [https://gitlab.com/0xabe.io/hvarm](https://gitlab.com/0xabe.io/hvarm).

> **Errata (2026-07).** After this chapter was published, wiring up the real `ERET` in Chapter 4 surfaced a bug in the stage-2 `VTCR_EL2` configuration presented below: the FEAT_LPA2 **start-level −1 encoding is wrong**. The chapter uses `SL0 = 0b11` with `SL2 = 1`, but level −1 at the 4KB granule is `{SL2 = 1, SL0 = 0b00}` — `{SL2 = 1, SL0 = 0b11}` is a *reserved* combination and the stage-2 walker faults at the very first level. It stayed invisible throughout this chapter precisely because the placeholder trampoline only `ret` s: stage 2 is never actually walked from EL1, so the reserved `SL0` never gets a chance to fault. The moment Chapter 4 turns the `ret` into an `eret`, the guest’s first instruction fetch takes a stage-2 translation fault at level 0 (`EC=0x20`, `S1PTW`). The fix is a one-character change — `Sl0 = 0x0` instead of `0x3` — which makes the assembled `VTCR_EL2` come out as **`0x38006350C`** (was `0x3800635CC`). The affected sections below carry inline errata notes.

* * *

## Why stage 2 has to come before any ERET to EL1

Stage 2 is gated by a single bit: `HCR_EL2.VM`. Set it, and every IPA produced by an EL1 (or EL0) translation goes through a second walk against [`VTTBR_EL2`](https://developer.arm.com/documentation/ddi0595/2021-06/AArch64-Registers/VTTBR-EL2--Virtualization-Translation-Table-Base-Register) to produce a PA. Clear it, and EL1’s stage-1 output flows straight to the bus as a PA.

We cannot leave `VM=0` and `ERET` to EL1, because then we’d have no hypervisor — the guest would touch physical memory directly. There is one piece of good news about the timing: setting `HCR_EL2.VM=1` while we are *at EL2* does nothing visible to us. Stage 2 only gates the EL1&0 translation regime, and EL2 has its own (the EL2 or, under [VHE](https://developer.arm.com/documentation/102142/0100/Virtualization-host-extensions), the EL2&0 regime — neither uses stage 2). So we can flip `VM` at our leisure while still at EL2; it only takes effect for the next EL1 execution, which is exactly what we want.

* * *

## VTCR_EL2: similar to TCR_EL2, but not the same

Stage 2’s equivalent of [`TCR_EL2`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/TCR-EL2--Translation-Control-Register--EL2-) is `VTCR_EL2`, the [Virtualization Translation Control Register](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/VTCR-EL2--Virtualization-Translation-Control-Register). It looks superficially familiar — `T0SZ`, `IRGN0`, `ORGN0`, `SH0`, `TG0`, `PS`, `DS` — but there are differences that matter:

-   **Single layout, no E2H variant.** `TCR_EL2` has two layouts that toggle on `HCR_EL2.E2H`. Stage 2 has only one regime (EL1&0 IPA-to-PA), so `VTCR_EL2` has one layout. We don’t need the dual-parser dance from Chapter 2.
-   **`TG0` encoding matches `TCR_EL2` / `TCR_EL1`.** The only `TG*` field in the architecture that uses a *different* encoding is `TCR_EL1.TG1` (`01` =16KB, `10` =4KB, `11` =64KB — we’ll meet it again later in this chapter). Every other `TG0` / `TG1` field, including `VTCR_EL2.TG0`, uses the familiar `00` =4KB, `01` =64KB, `10` =16KB. No surprise here, only worth flagging because the analogous `TCR_EL1.TG1` field uses a different encoding — mixing them up is an easy mistake when reusing `TCR` constants for stage 2.
-   **RES1 bit 31.** Bit 31 of `VTCR_EL2` is RES1 on modern cores — the architecture requires the write to set it. EDK2 firmware on QEMU leaves it 0 on a register read, but the write has to be 1. Forgetting this is a classic “stage 2 starts up looking fine and faults randomly” bug.
-   **`VS` at \[19\].** Single bit, selects 8-bit VMID (0) or 16-bit VMID (1, FEAT_VMID16). We use 8-bit.
-   **`SL0` + `SL2` for the starting level.** Under FEAT_LPA2, `{SL2,SL0}` together pick the start level, including level −1 for 52-bit IPAs.

The starting-level selection follows the same logic we discussed for stage 1 in Chapter 2 — pick the highest level whose root table can cover the configured IPA size without start-level concatenation. For 4KB granule:

| IPA bits (= 64 − T0SZ) | Start level | SL0 / SL2 |
| --- | --- | --- |
| ≤ 21 | L3  | `SL0=0b11`, `SL2=0` |
| 22–30 | L2  | `SL0=0b00`, `SL2=0` |
| 31–39 | L1  | `SL0=0b01`, `SL2=0` |
| 40–48 | L0  | `SL0=0b10`, `SL2=0` |
| 49–52 (FEAT_LPA2) | L−1 | `SL0=0b11`, `SL2=1`, `DS=1` |

> **Errata (2026-07).** The **L−1 row above and the `Sl0 = 0x3` line in the code below are wrong.** Per the Arm ARM `AArch64.S2StartLevel`, for the 4KB granule with `DS = 1` the pair `{SL2, SL0}` decodes as `000→L2`, `001→L1`, `010→L0`, `011→L3`, and `100` (that is, `SL2 = 1, SL0 = 0b00`) selects **L−1**. So the 52-bit row must read `SL0 = 0b00`, `SL2 = 1`, `DS = 1`, and the code must set `Sl0 = 0x0`:
> 
> ```c
> StartLevel = -1; Sl0 = 0x0; Sl2 = 1; Ds = TRUE;
> ```
> 
> `{SL2 = 1, SL0 = 0b11}` is a *reserved* encoding, so the walker faults at the top level. With `Sl0 = 0x0` the assembled `VTCR_EL2` is **`0x38006350C`**, not the `0x3800635CC` quoted at the end of this section. The other rows (L0/L1/L2/L3) are correct. See the introduction erratum for why this stayed latent until the `ret` became an `eret` in Chapter 4.

`BuildVtcrConfig()` reads [`ID_AA64MMFR0_EL1.PARange`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/ID-AA64MMFR0-EL1--AArch64-Memory-Model-Feature-Register-0) to find the implemented PA size, then sets `T0SZ = 64 − PaBits` and picks the start level from the table. The 52-bit branch needs an extra check, though:

```c
if (PaBits <= 48) {
  StartLevel = 0; Sl0 = VTCR_SL0_4KB_L0;
} else {
  /* PaBits == 52 - LPA2 path, but only if 4KB really supports LPA2. */
  if (!Lpa2At4KB) {
    HVARM_ERROR("PARange reports 52-bit PA but FEAT_LPA2 is not "
                "advertised at the 4KB granule; refusing.");
    return EFI_UNSUPPORTED;
  }
  StartLevel = -1; Sl0 = 0x3; Sl2 = 1; Ds = TRUE;
}
```

`PARange = 0b110` (52-bit PA) does not by itself imply that FEAT_LPA2 is available at the 4KB granule — some cores advertise 52-bit PA only via FEAT_LPA at the 64KB granule. Setting `VTCR_EL2.DS = 1` on such a core would be a reserved encoding, with unpredictable consequences. We gate the LPA2 path on `ID_AA64MMFR0_EL1.TGran4_2 == 0b0011` (the modern, stage-2-specific field) or, on older silicon that reports support only via the unified field, `TGran4 == 0b0001`. If neither says LPA2-at-4KB, we refuse.

On AAVMF/QEMU with `cpu max` both signals are present, so we take the LPA2 path: `T0SZ = 12`, `DS = 1`, `SL2 = 1`, start level = −1 — the same 5-level walk we used for stage 1. The assembled `VTCR_EL2` from the run is `0x3800635CC`.

* * *

## VTTBR_EL2 and activating stage 2

`VTTBR_EL2`, the [Virtualization Translation Table Base Register](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/VTTBR-EL2--Virtualization-Translation-Table-Base-Register), is straightforward: low bits are the BADDR of the root table, bits \[55:48\] are the VMID. We use VMID 0 for now — we have exactly one guest, the boot environment that’s about to be deprivileged. When (if ever) we get to multi-guest support, this is where VMIDs get allocated.

The width of the BADDR field depends on the active configuration: without LPA2 it covers bits \[47:12\] of the PA, under LPA2 it extends to bit 49. We constrain the root allocation to fit in 48 bits regardless, so the high bits would be zero in either case, but we still pick the matching mask:

```c
BaddrMask = Config->Ds ? VTTBR_EL2_BADDR_MASK_4KB_LPA2
                       : VTTBR_EL2_BADDR_MASK_4KB;
Vttbr     = RootPa & BaddrMask;
```

Activating stage 2 is more than flipping a single bit on `HCR_EL2`. The activation pass programs the full set of bits that define “this thing is a hypervisor”, because most of those bits are load-bearing the moment any EL1 instruction executes:

-   **`VM = 1`**— enable stage 2 for the EL1&0 regime.
-   **`RW = 1`**— guest EL1 executes AArch64. UEFI usually leaves this set, but asserting it removes a dependency on firmware default.
-   **`IMO = FMO = AMO = 1`**— route IRQ/FIQ/SError to EL2. These are the *defining* knobs of a Type-1 hypervisor; until they’re set the guest’s EL1 vector receives every interrupt and the hypervisor cannot interpose on anything.
-   **`TGE = 0`**— this one bit me. AAVMF on QEMU runs at `HCR_EL2.TGE = 1` — VHE-as-host firmware behaviour, where EL2 itself is the “host kernel” and the EL1&0 regime is bypassed. We discussed in Chapter 2 that AAVMF runs us with `E2H=1` (VHE); what wasn’t called out then is that `TGE=1` makes the EL1&0 regime effectively dead. A future ERET to EL1h with `TGE` left at 1 would not actually deprivilege anything — it would land in the EL2&0 host regime. Clearing `TGE` is mandatory.

```c
HcrOld = ArmReadHcrEl2();
HcrNew = (HcrOld & ~HCR_EL2_TGE_BIT)
       | HCR_EL2_VM_BIT
       | HCR_EL2_RW_BIT
       | HCR_EL2_IMO_BIT | HCR_EL2_FMO_BIT | HCR_EL2_AMO_BIT;
ArmWriteHcrEl2(HcrNew);
```

The RMW preserves everything else — `E2H` in particular. We are reconfiguring the *posture* of the hypervisor relative to its guest, not the EL2 regime itself.

There is one related defensive check up front. `ReadCurrentStage2State()` refuses to continue if `HCR_EL2.VM` is already 1 on entry — some platforms may hand us a partially-configured stage 2 left over from a prior boot stage, and our sequence (write `VTTBR` / `VTCR`, then enable) is unsafe to apply on top of a still-running walker. The architecturally correct order would be “disable, change, re-enable”, which we don’t implement today; a clean refusal is better than silent breakage.

* * *

## Stage 2 descriptors: the differences that matter

Stage 1 and stage 2 page tables use the same overall format. Here is the format of the descriptors for a 4KB granule size and 52-bit output addresses: ![Table Descriptors 52bit OA](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9f42d628ad3f999a.png)

The first one is used when the output address is for the next-level table. A block is similar to a large page on Intel, where one or more lower-level tables are skipped to reference a bigger memory location — a block. In this case `n` depends at which level we are:

-   The level 0 descriptor `n` is 39, which is for a 512GB block
-   The level 1 descriptor `n` is 30, which is for a 1GB block
-   The level 2 descriptor `n` is 21, which is for a 2MB block

Finally, the third descriptor, used at level 3, references a page.

Bits \[1:0\] still classify the entry as invalid / block / table / page, output addresses still live at \[49:12\] (or \[47:12\] non-LPA2), the access flag is still at bit 10. But the attribute bits in a leaf descriptor are different in three ways that you have to get right:

-   **`S2AP[7:6]` instead of `AP[2:1]`.** In stage 1, AP encodes a four-way (RO/RW × EL1+EL0/EL1-only) permission. In stage 2, `S2AP` is simpler: `00` =none, `01` =read-only, `10` =write-only, `11` =read+write. The guest is allowed to do whatever stage-1 already allowed, modulo this further restriction. We use `11` for everything; we are not restricting the guest’s access at stage 2.
    
-   **`MemAttr[5:2]` is the memory type directly — not a MAIR index.** Stage 1 leaves use `AttrIndx` to select one of eight slots in `MAIR_EL{1,2}`. Stage 2 dispenses with the indirection: bits \[5:4\] are the outer attribute, \[3:2\] are the inner attribute, both encoded the same way as MAIR slots. `0b0011` (outer) ∥ `0b0011` (inner) gives Normal Write-Back Cacheable Read- and Write-Allocate; `0b0000` (outer Device) ∥ `0b0001` (inner Device-nGnRE) gives [Device-nGnRE](https://developer.arm.com/documentation/102376/0200/Device-memory/Sub-types-of-Device). We use exactly these two combinations:
    
    ```c
    #define S2_MEMATTR_NORMAL_WB     ((3UL << 4) | (3UL << 2))
    #define S2_MEMATTR_DEVICE_NGNRE  ((0UL << 4) | (1UL << 2))
    ```
    
-   **`SH[9:8]`, `AF` at bit 10 — same positions as stage 1. `XN` is a different story.** Under FEAT_XNX (mandatory from Armv8.2 and present on every modern core, including QEMU’s `cpu max`), the stage-2 XN field is a 2-bit field at `[54:53]`: `0b00` =executable at EL0 and EL1, `0b01` =non-executable at EL0, `0b10` =non-executable at EL1, `0b11` =non-executable at EL0 and EL1. On cores *without* FEAT_XNX only bit 54 is interpreted (1 = non-exec). So `(1ULL << 54)` alone — the encoding you’d naively pick from the stage-1 macro — gives you `0b10` on every modern core, which is “executable at EL0, non-executable at EL1” — not what you want for device MMIO. We detect FEAT_XNX at boot via [`ID_AA64MMFR1_EL1.XNX`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/ID-AA64MMFR1-EL1--AArch64-Memory-Model-Feature-Register-1) and pick the right encoding at leaf-build time:
    
    ```c
    #define S2_PTE_XN_NO_FEAT_XNX      (1ULL << 54)
    #define S2_PTE_XN_FEAT_XNX         (3ULL << 53)
    
    STATIC UINT64
    BuildDeviceMmioLeafAttrs (IN VTCR_EL2_CONFIG *Config)
    {
      return S2_LEAF_ATTR_DEVICE_MMIO_BASE
           | (Config->XnxImplemented ? S2_PTE_XN_FEAT_XNX
                                     : S2_PTE_XN_NO_FEAT_XNX);
    }
    ```
    

There is also a wrinkle under FEAT_LPA2 for `SH` that is worth its own section.

### The LPA2 SH-bit trap

When `VTCR_EL2.DS = 1` (FEAT_LPA2 active), the descriptor format changes in a subtle way: bits \[9:8\] are no longer `SH`, they are the high two bits of the output address — `OA[51:50]`. The shareability of the resulting access is taken from `VTCR_EL2.SH0` instead of from the descriptor.

If you write a leaf with `SH_INNER = 0b11 << 8` while `DS = 1`, the hardware reads those bits as `OA[51:50] = 0b11` and produces a PA with bits 50 and 51 set. Identity mapping `IPA = PA` silently becomes `PA = 0xC000_0000_0000 | IPA`. Every Normal-WB sentinel in the verifier would fail:

```
[E] VerifyStage2Identity:   FAIL: IPA 0x40000000 -> PA 0xC000040000000 (not identity)
[E] VerifyStage2Identity:   FAIL: IPA 0x42000000 -> PA 0xC000042000000 (not identity)
[E] VerifyStage2Identity:   FAIL: IPA 0x43FFF000 -> PA 0xC00004C43FFF000 (not identity)
...
[E] VerifyStage2Identity: Stage-2 verification: 336 sentinel(s) failed
```

The Device-nGnRE leaves verified cleanly because `SH_NON_SHAREABLE = 0` left bits \[9:8\] zero by accident. RAM was the only thing failing, and it was failing in the exact same pattern: bits 51 and 50 set in the output, the rest of the address correct. That was the giveaway — the `OA[51:50]` overlap.

Therefore, when `DS=1`, mask out bits \[9:8\] of the leaf attribute set before OR-ing it into the descriptor.

```c
if (Config->Ds) {
  // Under FEAT_LPA2, descriptor bits [9:8] are OA[51:50], not SH.
  LeafAttrs &= ~(3UL << 8);
}
```

`VTCR_EL2.SH0 = 0b11` (Inner Shareable) is already setting walker shareability correctly, so we lose nothing by dropping the per-descriptor SH bits.

* * *

## Building the identity map

The UEFI memory map is the source of truth. We reuse `GetPhysicalMemoryLayout()` from Chapter 2 — same helper, same `gBS->GetMemoryMap()` plumbing — and classify each region by its `EFI_MEMORY_TYPE`:

-   **RAM-like** (`EfiConventionalMemory`, `EfiLoaderCode/Data`, `EfiBootServicesCode/Data`, `EfiRuntimeServicesCode/Data`, `EfiACPIReclaimMemory`, `EfiACPIMemoryNVS`, `EfiPersistentMemory`, `EfiPalCode`, `EfiReservedMemoryType`) → Normal-WB Inner-Shareable, S2AP RW, AF set, XN clear.
-   **MMIO** (`EfiMemoryMappedIO`, `EfiMemoryMappedIOPortSpace`) → Device-nGnRE, S2AP RW, AF set, XN set (the FEAT_XNX-aware encoding from the previous section).
-   **Unusable / unmapped gaps** → left invalid. An EL1 access into a gap will produce a stage-2 translation fault. We are not handling those yet, but doing it this way means every wild access is a fault we will eventually be able to trap and emulate, rather than a silent read of whatever happened to be at that physical address.

For each accepted region we walk its IPA range with a **greedy biggest-block** strategy: try an L1 1 GB block, fall back to an L2 2 MB block, fall back to an L3 4 KB page. The first level that the current IPA is aligned to and that fully fits in the remaining range wins:

```c
if ((Ipa & (S2_L1_BLOCK_SIZE - 1)) == 0 && Remaining >= S2_L1_BLOCK_SIZE) {
  /* L1 block descriptor */
} else if ((Ipa & (S2_L2_BLOCK_SIZE - 1)) == 0 && Remaining >= S2_L2_BLOCK_SIZE) {
  /* L2 block descriptor */
} else {
  /* L3 page */
}
```

Intermediate tables are allocated lazily by `EnsureChildTable`, which checks whether the parent slot is already populated and, if not, hands out the next free table from the appropriate level’s pool:

```c
if ((Entry & S2_PTE_VALID) != 0) {
  if ((Entry & S2_PTE_TABLE) == 0) {
    HVARM_ERROR("EnsureChildTable: valid non-table entry at level %d "
                "index %lu - region overlap?", ParentLevel, ParentIndex);
    return NULL;
  }
  return (UINT64 *)DecodeStage2OutputAddress(Entry, Config);
}
if (*NextSlot >= ReqCount) {
  HVARM_ERROR("L%d table reservoir exhausted", ChildLevel);
  return NULL;
}
Child = &ChildBase[(*NextSlot) * EL2_ENTRIES_PER_TABLE];
(*NextSlot)++;
ParentTable[ParentIndex] = EncodeStage2OutputAddress(Pa, Config) | S2_PTE_TABLE | S2_PTE_VALID;
return Child;
```

Two defensive checks bear a brief mention. The “valid entry but not a table” branch catches a region-overlap scenario where an earlier region installed a block descriptor at this slot and a later region tries to descend through it; without the check we’d treat the block’s output address as a child-table pointer and silently corrupt the block’s target. The “next-slot vs reserved count” branch is a tripwire for the case where the counting pass (next section) ever under-counts.

This is the stage-2 analogue of the “next slot in the destination region” bookkeeping that the Chapter 2 copy used, except now the tables are being built from scratch instead of cloned from a live hierarchy.

* * *

## Sizing the allocation without a live tree to walk

The approach is a **dry-run pass** that mirrors the build logic but doesn’t write descriptors. For each region we iterate IPAs at the same granularity the build will use (1 GB / 2 MB / 4 KB), and at each step we ask “would this require a new L1 / L2 / L3 table?” — incrementing a per-level counter when the answer is yes.

The only subtle bit is deduplication. The build creates one L1 table per used L0 entry, one L2 table per used L1 entry, one L3 table per used L2 entry — and these “used” sets are shared across regions. A naive count would over-allocate. We dedupe with three bitmaps indexed by globally-unique “super-region” tuples:

```c
L0SuperIdx = (StartLevel == -1) ? Lm1Idx : 0;
L1SuperIdx = (L0SuperIdx * 512) + L0Idx;
L2SuperIdx = (L1SuperIdx * 512) + L1Idx;
L3SuperIdx = (L2SuperIdx * 512) + L2Idx;
```

A bit set in `L0Used[L1SuperIdx]` means “the L1 child of L0 entry `L0Idx` (in the L0 super-region selected by `Lm1Idx`) has already been allocated”; same idea one level down for `L1Used` and `L2Used`. We bump the per-level requirement counter only on the first hit. The bitmaps are scratch — freed before the build proper starts.

There is a budget question here. The worst-case L3 super-index domain is around 130M entries without LPA2 and roughly 2G under LPA2; we can’t allocate a 2G bitmap. The code caps the L2 bitmap at 16 MB and then *bounds-checks every super-index* against its bitmap before reading or writing it. If a region would index past the cap, `CountTablesForRegion` returns `EFI_UNSUPPORTED` with a precise diagnostic naming the offending IPA range, rather than scribbling past the end of the heap. On every realistic UEFI map — where the highest-IPA region sits well under a few GB — the bitmap stays tiny and the bounds checks never fire.

On the working run the result is tiny:

```yaml
[I] Stage-2 Page Table Requirements:
[I]   Start level: -1
[I]   L-1 tables: 1
[I]   L0  tables: 1
[I]   L1  tables: 1
[I]   L2  tables: 3
[I]   L3  tables: 15
[I]   Total size: 0x15000 bytes
```

21 tables, 84 KB. The UEFI memory map is small and most of it is large contiguous regions of conventional RAM that fold into 1 GB or 2 MB blocks — only the few small misaligned ACPI/RT regions need L3 pages.

* * *

## Activation sequence

With tables built and verified, the activation is four MSRs and a TLBI in a specific order, followed by the `HCR_EL2` programming described earlier:

```c
ArmDataSynchronizationBarrier();             /* dsb ish */
ArmWriteVttbrEl2(Vttbr);                     /* BADDR | (VMID << 48) */
ArmWriteVtcrEl2(Config.VtcrEl2Value);
ArmInstructionSynchronizationBarrier();      /* isb */
ArmInvalidateStage2TlbVmid();                /* tlbi vmalls12e1is; dsb ish; isb */
HcrOld = ArmReadHcrEl2();
HcrNew = (HcrOld & ~HCR_EL2_TGE_BIT)
       | HCR_EL2_VM_BIT | HCR_EL2_RW_BIT
       | HCR_EL2_IMO_BIT | HCR_EL2_FMO_BIT | HCR_EL2_AMO_BIT;
ArmWriteHcrEl2(HcrNew);
ArmInstructionSynchronizationBarrier();
```

Two pieces are worth calling out.

**Why `tlbi vmalls12e1is` and not `tlbi alle2`?** `alle2` invalidates EL2’s *own* stage-1 TLB entries — the ones we used in Chapter 2 — but it does not touch the stage-2 entries that live in the EL1&0 regime’s TLB. There may not be any stage-2 entries cached yet (we’re enabling stage 2 for the first time), but firmware on some platforms may have left junk in there from earlier stage-2 use, and the operation is cheap. `vmalls12e1is` invalidates all stage-1-and-stage-2 entries for the current VMID, inner-shareable.

**Why this particular `HCR_EL2` composition?** Programming `VM` in isolation is enough to *enable* stage 2 for the EL1&0 regime, but it isn’t enough to make a future ERET land in a usable EL1 environment. The other bits we set/clear (`RW`, `IMO/FMO/AMO`, `TGE`) only matter once execution actually reaches EL1, so they could in principle be deferred. We program them here because we already have to touch `HCR_EL2` for `VM`.

* * *

## EL1 needs its own setup

Stage 2 alone is not enough. When the future ERET executes, the hardware installs [`SPSR_EL2`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/SPSR-EL2--Saved-Program-Status-Register--EL2-) into PSTATE and jumps to [`ELR_EL2`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/ELR-EL2--Exception-Link-Register--EL2-). PSTATE will name EL1h as the target exception level, but the EL1 system registers — `SCTLR_EL1`, `TCR_EL1`, `TTBR0_EL1`, `MAIR_EL1` — must already describe a translation regime EL1 can run under. If they’re zero, the first EL1 instruction fetch is a translation fault.

For a passthrough hypervisor the natural choice is to mirror EL2’s regime onto EL1. EL2 currently walks its own page tables (which we own, from Chapter 2), it has its own MAIR slots, its own TCR settings. EL1 should walk the exact same page tables with the exact same TCR, so that the same VA produces the same IPA — and stage 2 (which we just turned on) identity-maps that IPA to the same PA. The end-to-end translation EL1 sees through stage-1 plus stage-2 is identical to what EL2 sees through stage-1 alone.

That works as long as the page table memory itself is reachable from EL1 — i.e., its physical address is covered by stage 2. It is: the tables are in `EfiRuntimeServicesData`, which our stage-2 map covered as Normal-WB.

* * *

## VHE and the \*\_EL12 aliases

We saw in Chapter 2 that AAVMF runs us at `HCR_EL2.E2H = 1` (VHE). Under VHE, the `*_EL1` mnemonics behave unexpectedly when executed from EL2: they don’t access the guest EL1’s registers, they access the *host EL2’s* registers (which the architecture aliases under the EL1 names so a host OS at EL2 can be written as if it were a normal EL1 kernel). To reach the actual guest EL1’s registers from EL2 under VHE you need the `*_EL12` aliases, introduced specifically for this purpose by ARMv8.1-A.

```c
ArmWriteSctlrEl12(SctlrEl2);    /* under VHE: writes guest EL1's SCTLR */
ArmWriteTcrEl12  (TcrEl2);
ArmWriteTtbr0El12(Ttbr0El2);
ArmWriteTtbr1El12(0);            /* we don't use TTBR1 */
ArmWriteMairEl12 (MairEl2);
```

The `*_EL12` instructions are reserved on non-VHE silicon, so we can only execute these helpers when `HCR_EL2.E2H = 1`. The non-VHE path uses `*_EL1` directly, and because in that regime the `*_EL1` mnemonics from EL2 do access the guest’s registers, that just works.

Under VHE, the verbatim copies above are safe: [`SCTLR_EL2`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/SCTLR-EL2--System-Control-Register--EL2-) and `TCR_EL2` acquire the same enriched layout as `SCTLR_EL1` / `TCR_EL1`, so every bit lands in the right place. Under non-VHE, neither register has that property — we have to compose `SCTLR_EL1` and reconstruct `TCR_EL1`, both of which get their own sections below.

`PrepareEl1State()` reads `HCR_EL2.E2H` and dispatches:

```c
HcrEl2 = ArmReadHcrEl2();
E2h    = (HcrEl2 & HCR_EL2_E2H_BIT) != 0;

if (E2h) {
  /* VHE: *_EL12 path, SCTLR_EL2 and TCR_EL2 layouts match EL1 */
  ArmWriteSctlrEl12(SctlrEl2);
  ArmWriteTcrEl12  (TcrEl2);
  ArmWriteTtbr0El12(Ttbr0El2);
  ArmWriteTtbr1El12(0);
  ArmWriteMairEl12 (MairEl2);
  ArmWriteCpacrEl12(CPACR_FPEN_NO_TRAP);    /* deterministic, no RMW */
} else {
  /* Non-VHE: *_EL1 path, SCTLR composed, TCR reconstructed */
  ArmWriteSctlrEl1(ComposeSctlrEl1FromSctlrEl2(SctlrEl2));
  ArmWriteTcrEl1  (ReconstructTcrEl1FromTcrEl2NonVhe(TcrEl2));
  ArmWriteTtbr0El1(Ttbr0El2);
  ArmWriteTtbr1El1(0);
  ArmWriteMairEl1 (MairEl2);
  ArmWriteCpacrEl1(CPACR_FPEN_NO_TRAP);
}
```

One detail the listing elides: the VHE branch also OR-s `EPD1=1` into the copied `TCR_EL12`, mirroring the explicit `TTBR1_EL12 = 0` — defensive insurance that the unused TTBR1 half can never be walked. Stage 1 already guarantees `EPD1=1` here, so it costs nothing and keeps the two branches symmetric.

Both branches end with a *deterministic* CPACR write, not an OR. [`CPACR_EL1`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/CPACR-EL1--Architectural-Feature-Access-Control-Register) is part of the guest’s reset-time architectural state; we want a predictable baseline regardless of what firmware left there. `FPEN[21:20]=0b11` ungates FP/SIMD for EL1 and EL0. SVE (`ZEN`) and SME (`SMEN`) remain at “trap” defaults — we’ll deal with them when those features are virtualised.

There is one more trap layer worth dealing with at the same time. Even with `CPACR_EL1.FPEN` set, EL2 can override it from [`CPTR_EL2`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/CPTR-EL2--Architectural-Feature-Trap-Register--EL2-): if firmware left the FP/SVE/AMU traps active there, the guest’s first such access traps to a not-yet-existent EL2 vector. The catch is that `CPTR_EL2` — exactly like `TCR_EL2` — has *two layouts*. Under non-VHE it is a bag of trap bits (`TFP[10]`, `TZ[8]`, `TAM[30]`; 1 = trap). Under VHE it takes the `CPACR_EL1` shape, where FP and SVE are gated by `FPEN[21:20]` / `ZEN[17:16]` with *enable* semantics (`0b11` = no-trap) and `TFP` / `TZ` are RES0. Clearing `TFP/TZ` under VHE does nothing — you have to *set* `FPEN` / `ZEN` instead. Since AAVMF runs us under VHE, getting this wrong would be invisible (firmware already leaves `FPEN=0b11`) right up until a platform hands us `FPEN=0b00`. So we branch on `E2H`:

```c
if (E2h) {
  /* VHE: CPACR_EL1-shaped. Ungate FP (FPEN=0b11) and SVE (ZEN=0b11) so they
     reach the guest's CPACR_EL1, and clear TAM. TFP/TZ are RES0 here. */
  CptrNew = (CptrOld & ~(CPTR_EL2_VHE_FPEN_MASK | CPTR_EL2_VHE_ZEN_MASK |
                         CPTR_EL2_TAM_BIT))
          | CPTR_EL2_VHE_FPEN_NO_TRAP | CPTR_EL2_VHE_ZEN_NO_TRAP;
} else {
  /* Non-VHE: trap bits, 1 = trap. Clear TFP/TZ/TAM. */
  CptrNew = CptrOld & ~CPTR_EL2_GUEST_NO_TRAP_MASK;
}
ArmWriteCptrEl2(CptrNew);
```

On AAVMF/QEMU we take the VHE branch, and `CPTR_EL2` enters at `0x300000` — that is `FPEN=0b11` already, so FP needs no help; the code additionally ungates SVE (`ZEN=0b11`), taking it to `0x330000`. On firmware that leaves `FPEN=0b00`, or that sets `TFP/TZ` under non-VHE, this step is what keeps the guest’s first FP/SVE access from trapping into nowhere.

After all the EL1 system-register writes, we issue an `isb` and then invalidate the EL1 TLB:

```c
ArmInstructionSynchronizationBarrier();
ArmInvalidateEl1Tlb();   /* tlbi vmalle1is; dsb ish; isb */
```

UEFI runs at EL2 so EL1 TLBs are almost always clean, but some loaders briefly drop to EL1 and a stale entry from there would be the kind of bug that’s painful to chase later. The cost of an unconditional invalidation is negligible.

* * *

## Non-VHE: SCTLR_EL1 composition and TCR layout reconstruction

`TTBR0` and `MAIR` can be copied verbatim from EL2 to EL1 in both regimes — the bit layouts agree. `SCTLR` and `TCR` are the awkward ones under non-VHE.

### Composing SCTLR_EL1

`SCTLR_EL1` has bits at positions \[11\], \[20\], \[22\], \[23\], \[28\], \[29\] that are strictly `RES1` in AArch64 — writing 0 to a `RES1` bit is UNPREDICTABLE. `SCTLR_EL2` (non-VHE) has different `RES1` bits at different positions, so a verbatim copy leaves the EL1 `RES1` set incorrectly zeroed. Worse, `SCTLR_EL1` has EL0-permission fields (`UCT`, `DZE`, `nTWI`, `nTWE`, `UMA`, `UCI`) that `SCTLR_EL2` doesn’t have at all. Zeroing them traps common EL0 operations — a Linux EL0 task SIGILLs on the first `dc zva` in libc’s memset.

We compose the value explicitly:

```c
STATIC UINT64
ComposeSctlrEl1FromSctlrEl2 (IN UINT64 SctlrEl2)
{
  return (SctlrEl2 & SCTLR_ELx_SHARED_BITS)
       | SCTLR_EL1_RES1
       | SCTLR_EL1_EL0_ALLOW_BITS;
}
```

`SCTLR_ELx_SHARED_BITS` is the set of MMU/cache bits that share both position and semantics between EL2 and EL1 (`M`, `A`, `C`, `SA`, `I`, `WXN`, `EE`) — those come straight from EL2. `SCTLR_EL1_RES1` ORs in the bits that have to be 1. `SCTLR_EL1_EL0_ALLOW_BITS` sets the EL0-permission fields to “allow” — if the hypervisor later wants to trap a specific user-mode operation (for instrumentation or virtualisation), that’s a deliberate change to this mask, not a silent zero-fill.

### Reconstructing TCR_EL1

`TCR_EL2` non-VHE is the “EL2-only” form: only the lower half (`T0SZ`, `IRGN0`, `ORGN0`, `SH0`, `TG0`, `PS` at \[18:16\], `DS` at \[32\] — bit 59 is the VHE/ `TCR_EL1` position, an easy and dangerous mix-up — plus several attribute and hardware-management bits at positions that *don’t match* `TCR_EL1`). `TCR_EL1` has `T0SZ` / `T1SZ` pair, `EPD1`, `TG1`, `IPS` at \[34:32\], and the analogous attribute bits at *different* positions.

The bottom 16 bits agree (`T0SZ` in \[5:0\], `IRGN0` in \[9:8\], `ORGN0` in \[11:10\], `SH0` in \[13:12\], `TG0` in \[15:14\]). The rest we have to construct: defaults that mean “we don’t use `TTBR1`, give me the right output address size”, plus per-bit moves for the attribute fields:

```c
STATIC UINT64
ReconstructTcrEl1FromTcrEl2NonVhe (IN UINT64 TcrEl2)
{
  UINT64  Tcr1;
  UINT64  Ps;

  /* Position-compatible bottom 16 bits. */
  Tcr1  = TcrEl2 & 0xFFFFULL;

  /* Disable the TTBR1_EL1 walk. */
  Tcr1 |= TCR_EL1_EPD1_BIT;
  Tcr1 |= TCR_EL1_TG1_4KB;

  /* PS @ [18:16] in TCR_EL2 -> IPS @ [34:32] in TCR_EL1. */
  Ps    = (TcrEl2 >> 16) & 0x7ULL;
  Tcr1 |= Ps << 32;

  /* Attribute / hardware-management bits live at different positions. */
  Tcr1 |= MoveBit(TcrEl2, /*from*/ 20, /*to*/ 37);   /* TBI  -> TBI0  */
  Tcr1 |= MoveBit(TcrEl2, 21, 39);                   /* HA   -> HA    */
  Tcr1 |= MoveBit(TcrEl2, 22, 40);                   /* HD   -> HD    */
  Tcr1 |= MoveBit(TcrEl2, 24, 41);                   /* HPD  -> HPD0  */
  Tcr1 |= MoveBit(TcrEl2, 25, 43);                   /* HWU059        */
  Tcr1 |= MoveBit(TcrEl2, 26, 44);                   /* HWU060        */
  Tcr1 |= MoveBit(TcrEl2, 27, 45);                   /* HWU061        */
  Tcr1 |= MoveBit(TcrEl2, 28, 46);                   /* HWU062        */
  Tcr1 |= MoveBit(TcrEl2, 29, 51);                   /* TBID -> TBID0 */
  Tcr1 |= MoveBit(TcrEl2, 30, 57);                   /* TCMA -> TCMA0 */

  /* FEAT_LPA2 DS: bit 32 in the non-VHE TCR_EL2, bit 59 in TCR_EL1. */
  if ((TcrEl2 >> 32) & 0x1ULL) {
    Tcr1 |= (1ULL << 59);
  }
  return Tcr1;
}
```

If we don’t move these across, Top-Byte-Ignore and hardware-AF/dirty management silently disappear at EL1 — fine on QEMU virt where firmware sets none of them, harmful on Apple, Graviton, or Ampere where firmware does.

A subtler pitfall lurks in that `DS` line: **`DS` is not at the same bit in the two registers.** The non-VHE `TCR_EL2` packs it low — bit **32**, just above the `RES1` bit 31 — while `TCR_EL1` (and the VHE `TCR_EL2`) keep it at bit **59**. Read it from bit 59 of a non-VHE `TCR_EL2` and it is always 0, so a FEAT_LPA2 guest would silently lose `DS` in its reconstructed `TCR_EL1` and fall back to the non-LPA2 descriptor format. EDK2’s own headers spell it as two separate constants — `TCR_DS` (`1<<59`) and `TCR_DS_NVHE` (`1<<32`); copy that distinction rather than assuming a shared position.

Another pitfall worth flagging: **`TG1` uses a different encoding from `TG0`**. In `TCR_EL2.TG0` and `TCR_EL1.TG0`, `0b00` means 4 KB. In `TCR_EL1.TG1`, `0b10` means 4 KB. ARM did this so that resetting `TG1` to zero would intentionally pick an invalid encoding, forcing OS code to set it explicitly. We set `TG1 = 0b10` even though `EPD1 = 1` makes the field architecturally irrelevant — it’s free insurance.

* * *

## SPSR_EL2: PSTATE on ERET, and why it lives in the trampoline

The eventual ERET pops a PSTATE from `SPSR_EL2`. The value we want is:

```
SPSR_EL2 = 0x3C5
         = M[3:0] = 0b0101  (EL1h, SP selector = SP_EL1)
         | D = A = I = F = 1  (debug, SError, IRQ, FIQ all masked)
```

We’re masking everything because there are no handlers yet. Once exception/interrupt handlers exist at EL2 (and at EL1, behind `VBAR_EL12`), the user can decide which bits to unmask. Until then, an unmasked interrupt firing the instant after the ERET would trap to a vector at PA 0 (or wherever VBAR happens to be) and the system would die. Masking is the safe default.

There’s a subtler question, though: *where* should this value be installed?

The temptation is to write it from C in `PrepareEl1State()` alongside everything else. The trouble is that exception entry at EL2 *saves* the current PSTATE into `SPSR_EL2` — it overwrites whatever we pre-armed. If any EL2 exception fires between `PrepareEl1State()` returning and the trampoline running (an SError from a stray DMA controller, a stage-2 fault from a walker prefetch with a bad IPA), our pre-armed `0x3C5` is silently replaced with whatever the exception’s saved PSTATE was. The eventual ERET then resumes with a corrupted `SPSR_EL2` and lands at the wrong EL or with the wrong DAIF mask.

Today the trampoline is a placeholder — it just `ret` s, no ERET fires, so this race is theoretical. But it would be a particularly nasty bug to discover the moment we replace `ret` with `eret` in the next chapter. The fix is to keep the `SPSR_EL2` write inside the trampoline, immediately before the (eventual) `eret`, so there is no window of vulnerability:

```
movz    x9, #0x3C5
msr     spsr_el2, x9
isb
/* eret */
ret
```

`PrepareEl1State()` does not touch `SPSR_EL2` at all. The trampoline is the single source of truth for PSTATE-on-ERET.

* * *

## Sharing the stack across the ERET

Here is the most interesting subtlety. The C function that will eventually issue the ERET is in the middle of executing — it has local variables on its EL2 stack, its return chain goes through `_ModuleEntryPoint` back into `Helper.c`. After the ERET, that function should *resume* at the instruction immediately following the ERET, with the same locals, the same return chain. The hypervisor’s whole illusion depends on the boot environment not noticing it’s been deprivileged.

For that to work, [`SP_EL1`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/SP-EL1--Stack-Pointer--EL1-) — the stack pointer EL1h selects when the ERET fires — must equal the current EL2 `sp`. If we allocated a fresh stack and pointed `SP_EL1` at it, EL1 would wake up on different memory, the C calling convention would shatter, and the function’s locals would be gone.

The catch is that `PrepareEl1State()` is a C function, and the `sp` it could read is *its own* `sp` at the moment it runs — not the `sp` at the moment of ERET. By the time the ERET fires (from a later function), the C stack will have moved. So the `SP_EL1` write can’t happen in `PrepareEl1State()`. It has to happen in the same function, in assembly, just before the ERET itself — which is the same trampoline that holds the `SPSR_EL2` write:

```rust
EretToEl1Trampoline:
    mov     x9,      sp
    msr     sp_el1,  x9

    xpaclri                       /* strip PAC from x30 if any */
    msr     elr_el2, x30

    movz    x9, #0x3C5            /* SPSR_EL2: EL1h, DAIF masked */
    msr     spsr_el2, x9
    isb

    //
    // ======================== PLACEHOLDER ========================
    // Replace the `ret` below with `eret` once EL1 exception
    // vectors and EL2 handlers are installed. At that point execution
    // following the `bl EretToEl1Trampoline` will run at EL1h with
    // PSTATE = SPSR_EL2 and PC = ELR_EL2 (= caller's lr).
    // =============================================================
    //
    // eret
    ret
```

Three details. `msr sp_el1, sp` is not a valid encoding — `msr` requires a general-purpose register source — so we route through `x9`, which is caller-saved under AAPCS64 and therefore safe to clobber. `x30` is the link register, holding the address of the instruction immediately after the `bl` that brought us into the trampoline; writing it into `ELR_EL2` is exactly what we want for the ERET’s PC.

The third detail is `xpaclri`. On cores with FEAT_PAuth, depending on the toolchain’s branch-protection setting, the compiler emits `paciasp` at function prologues, which signs `x30` with a Pointer Authentication Code in its top bits. ERET does *not* strip the PAC from `ELR_EL2` — it dereferences the signed value as an address, either authenticating against EL1’s PAC keys (which we don’t manage) or branching to garbage. `xpaclri` is the LR-specific form of XPAC, encoded in the HINT instruction space (hint #7), so it assembles on plain Armv8.0 and behaves as a NOP on cores without FEAT_PAuth; on PAuth-enabled cores it strips the PAC from `x30` before we install it.

After the future `eret`:

1.  `PSTATE` ← `SPSR_EL2` (`EL1h`, `DAIF` masked).
2.  `PC` ← `ELR_EL2` (the post- `bl` instruction in the calling C function).
3.  `SP` ← `SP_EL1` (the same stack we were just using at EL2).
4.  The walker for the next fetch goes through stage 1 (`TTBR0_EL12` / `TCR_EL12`, which we just copied from EL2’s) and stage 2 (identity).
5.  The instruction at PC executes — same instruction, same stack, same address, same data. EL1 is running and nothing visibly changed.

For now the trampoline just `ret` s. `SP_EL1`, `ELR_EL2`, and `SPSR_EL2` get written every time we call it, harmlessly — the values just sit there. When the user flips `ret` to `eret`, the next call is the ERET.

* * *

## What we deliberately did not touch

A few registers and bits remain unset on purpose:

-   **[`VBAR_EL2`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/VBAR-EL2--Vector-Base-Address-Register--EL2-) and `VBAR_EL12` / [`VBAR_EL1`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/VBAR-EL1--Vector-Base-Address-Register--EL1-)** (the vector bases): the hypervisor has to control exception handling before returning to EL1 with the `ERET`.
    
-   **`ELR_EL2`** is *not* written by `PrepareEl1State()`. It’s the trampoline’s job, because only the trampoline knows the right PC. Writing a random value here from C now would be discarded the moment the trampoline ran anyway.
    

One bit that might *look* like a candidate for the trap-configuration pass alongside vectors — `HCR_EL2.TGE` — turned out not to be deferrable. AAVMF runs us with `TGE=1` (VHE-as-host), which makes the EL1&0 regime effectively bypassed. A future ERET to EL1h with `TGE` left at 1 would not actually deprivilege anything, so `TGE` has to be cleared as part of stage-2 activation, not in some later trap-configuration pass. That’s what the `HCR_EL2` composition in the activation section does.

* * *

## Running it

The build flow is unchanged from Chapter 1:

```
./build.py --iso /tmp/hvarm.iso
```

In the VM, boot to the UEFI Shell and load the hypervisor:

```
Shell> fs1:
FS1:\> Helper.efi load HvArm.efi
```

The serial log now has a stage-2 block and an EL1-prep block after the stage-1 work from Chapter 2. Condensed:

```yaml
[I] === Initializing EL2 Stage 1 Translation ===
... (Chapter 2 work, unchanged) ...
[I] === EL2 Stage 1 Translation Initialized Successfully ===

[I] === Initializing EL2 Stage 2 Translation ===
[I] Raw stage-2 register values:
[I]   HCR_EL2:           0x408000038 (VM=0)
[I]   VTCR_EL2:          0x0
[I]   VTTBR_EL2:         0x0
[I]   ID_AA64MMFR0_EL1:  0x2100032310201126
[I]   ID_AA64MMFR1_EL1:  0x110112010312122
[I] VTCR_EL2 Configuration:
[I]   PARange:     0x6 (52 bits)
[I]   T0SZ:        12 (IPA = 52 bits)
[I]   Start level: -1
[I]   SL0:         3
[I]   SL2:         1
[I]   FEAT_LPA2:   yes (DS=1)
[I]   FEAT_XNX:    yes (S2 XN encoding: 0b11 @ [54:53])
[I]   VTCR_EL2:    0x3800635CC
[I] Stage-2 Page Table Requirements:
[I]   L-1: 1, L0: 1, L1: 1, L2: 3, L3: 15
[I]   Total size: 0x15000 bytes
[I] Mapping region [0x0000000040000000..0x0000000044000000) ... attr=Normal-WB
... (many region lines) ...
[I] Mapping region [0x0000000004000000..0x0000000008000000) ... attr=Device-nGnRE
[I] Stage-2 verification:
[I]   PASS: region [0x0000000040000000..0x0000000044000000) (3 sentinels)
...
[I] Stage-2 activation complete: HCR_EL2 0x408000038 -> 0x480000039
[I]   VM=1 RW=1 TGE=0 IMO=1 FMO=1 AMO=1
[I] === EL2 Stage 2 Translation Initialized Successfully ===

[I] === Preparing EL1 State ===
[I] HCR_EL2.E2H = 1 (VHE) - using *_EL12 aliases register set
[I] Snapshot of EL2 translation state:
[I]   SCTLR_EL2  = 0x100D
[I]   TCR_EL2    = 0x80000068080350C
[I]   TTBR0_EL2  = 0x13DD80000
[I]   MAIR_EL2   = 0xFFBB4400
[I] CPTR_EL2 0x300000 -> 0x330000 (VHE: FPEN/ZEN no-trap, TAM cleared)
[I] Wrote guest EL1 view (EL12 aliases):
[I]   SCTLR_EL12 = 0x100D
[I]   TCR_EL12   = 0x80000068080350C
[I]   TTBR0_EL12 = 0x13DD80000
[I]   TTBR1_EL12 = 0x0
[I]   MAIR_EL12  = 0xFFBB4400
[I]   CPACR_EL12 = 0x300000 (FPEN no-trap)
[I] SP_EL1, ELR_EL2, SPSR_EL2, VBAR_EL12 deliberately left for the trampoline / future caller.
[I] === EL1 State Prepared ===
Entry point returned: Success

FS1:\>
```

> **Errata (2026-07).** This captured log predates the `SL0` fix, so two lines show the buggy values: `SL0: 3` and `VTCR_EL2: 0x3800635CC`. With the correction they read `SL0: 0` and `VTCR_EL2: 0x38006350C`. Everything else in the log is unaffected — and because the trampoline still `ret` s at this stage, the wrong `SL0` has no visible effect here; it only faults once the `eret` goes live in Chapter 4.

The interesting transition is in the `HCR_EL2` line: `0x408000038 -> 0x480000039`. Decoding both: the entry value has E2H=1, TGE=1, IMO=FMO=AMO=1, VM=0, RW=0; the exit value has E2H=1, TGE=0, IMO=FMO=AMO=1, VM=1, RW=1. That’s AAVMF handing us VHE-as-host (TGE=1, RW=0) and us converting it into a hypervisor posture (TGE=0, RW=1, VM=1) in the activation MSR. `CPTR_EL2` moves `0x300000 -> 0x330000` on the VHE path: FP was already un-trapped (`FPEN=0b11`) and we additionally ungate SVE (`ZEN=0b11`); the step is cheap here and load-bearing on firmware that leaves the traps set.

The hypervisor returns control to the Helper, which returns to the shell. The shell continues to function, exactly as before — every keystroke, every command, every framebuffer write now flows through stage 2 (`HCR_EL2.VM = 1`), but we are still at EL2, so stage 2 is inactive for our accesses. The trampoline currently `ret` s without ERETing, so we never actually deprivilege; the EL1 register file is fully populated but the boot environment hasn’t moved.

Nothing user-visible has changed. Which is, in a sense, the whole point — the hypervisor is becoming invisible.

* * *

## Conclusion

This chapter brought up stage 2 translation and the EL1 register state, leaving the system one instruction away from a clean transition to EL1. Stage 2 was structured almost like the stage-1 migration from Chapter 2 — a requirements pass, a contiguous allocation in `EfiRuntimeServicesData`, a build pass, a verifier, and an activation sequence with the right barriers and TLB invalidation — but the differences mattered: stage 2 has its own control register (`VTCR_EL2`) with a single layout, its own descriptor format (`S2AP`, direct `MemAttr` encoding, no MAIR indirection, a FEAT_XNX-aware XN field), and one nasty trap under FEAT_LPA2 where descriptor bits \[9:8\] stop being `SH` and start being `OA[51:50]`. Activating it wasn’t just a single bit in `HCR_EL2` — it was a deliberate composition of `VM/RW/IMO/FMO/AMO/!TGE` that turned out to matter immediately on AAVMF/QEMU, where `TGE=1` would otherwise have made the EL1&0 regime unusable. The ordering of the activation steps relative to the TLB invalidate and the page-table writes is non-negotiable.

EL1 preparation was a smaller piece of code with a handful of interesting wrinkles. Under VHE the `*_EL12` aliases let us program the guest’s view directly; under non-VHE we had to *compose* `SCTLR_EL1` (to respect its `RES1` bits and give EL0 the permissions it needs) and *reconstruct* `TCR_EL1` by moving attribute bits from their non-VHE `TCR_EL2` positions to their `TCR_EL1` positions. CPACR was written deterministically rather than RMW’d, and `CPTR_EL2` was reprogrammed — layout-aware, since it follows `TCR_EL2` in having distinct VHE (`FPEN` / `ZEN`) and non-VHE (`TFP` / `TZ` / `TAM`) forms — so the EL2 layer wouldn’t override the CPACR policy. `SPSR_EL2` was deliberately *not* programmed from C — it lives in the trampoline, immediately before the eret, so no intervening EL2 exception can clobber it. And the trampoline shares the EL2 stack with the EL1 continuation: SP, locals, return chain all flow through unchanged. That’s the property that lets the boot environment continue executing across the ERET as if nothing happened.

The next chapter installs the actual exception machinery. EL2 needs a vector table (`VBAR_EL2`) and exception handlers so we can recover from anything the guest throws at us. EL1 needs at least minimal vectors (`VBAR_EL12`) so its own exceptions don’t fault on vector fetch. Once both are in place, the trampoline’s `ret` becomes `eret`, and the next time we boot, the UEFI Shell wakes up at EL1.
