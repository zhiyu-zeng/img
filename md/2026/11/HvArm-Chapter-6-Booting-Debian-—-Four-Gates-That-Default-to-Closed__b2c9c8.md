---
title: "HvArm: Chapter 6: Booting Debian — Four Gates That Default to Closed"
source: https://0xabe.io/hypervisor/arm/2026/09/23/HvArm-Chapter-6.html
source_host: 0xabe.io
clip_date: 2026-11-20T10:37:51+08:00
trace_id: 703eba7e-f88f-417e-aca0-c34aa6184e27
content_hash: 1dbd89fbd93741e2cd30c758524a3ac53b0dc0d8e82a5f3aaaaccde26abfa066
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
notion_page_id: 41e75244-d011-812e-9262-fce8baa6aa05
ioc: null
---

Chapter 5 ended with an interactive UEFI Shell running at EL1, under the hypervisor. That was the last chapter’s whole point: a guest that doesn’t notice it has been deprivileged. But this environment is already initialized, so it never *starts* anything.

In this chapter, we will execute GRUB that will initialize an environment, apply memory attributes and hand off to a kernel that probes every feature the CPU advertises and then uses them.

Going in, I expected the failures to be more of Chapter 5’s: stage-2 holes, regions the memory map never mentioned, each one found by a `FAR` in a fault dump. I got exactly one of those — a good one, in a place I hadn’t thought about at all. And then the failures were traps about registers access. They turned out to be the same bug four times.

By the end of this chapter, unmodified Debian GNU/Linux 13 boots to a login prompt at EL1 under HvArm, with networking up — and, for the first time in this series, there is a number on what that costs.

The source code for this chapter is available at [https://gitlab.com/0xabe.io/hvarm](https://gitlab.com/0xabe.io/hvarm).

* * *

## The setup

The VM gets a second disk: a new disk image created with `qemu-img` with a [Debian 13 arm64 cloud image](https://cloud.debian.org/images/cloud/trixie-backports/20260728-2553/debian-13-backports-generic-arm64-20260728-2553.qcow2) as the backing file. Its ESP shows up in the UEFI shell as `FS2:`, alongside the shell’s own CD (`FS0:`) and the HvArm volume (`FS1:`). The machine is what it has been all along — QEMU `virt-10.2`, `gic-version=2`, `virtualization=on`, one vCPU, 4 GB — with `-cpu max`, which on this QEMU is an Armv9.4 CPU. That last detail matters more than I expected; a large part of this chapter is about architecture extensions that only exist because the CPU model is a recent one.

The sequence is:

```
FS1:\> Helper.efi load HvArm.efi      <- stage 1, stage 2, ERET to EL1
FS1:\> fs2:
FS2:\> cd EFI\BOOT
FS2:\EFI\BOOT\> BOOTAA64.EFI          <- shim -> GRUB -> Linux
```

Everything after the first line runs at EL1, with stage-2 translation on and HvArm sitting at EL2 holding `VBAR_EL2`.

* * *

## Fault #1: a fetch from address 0x1FC00

The first attempt to launch the bootloader dies immediately:

```
[E] FatalException: EL2 fatal exception: Vector=8 EC=0x20 ISS=0x6
[E] FatalException:   ELR=0x1FC00 SPSR=0xB05 ESR=0x82000006 FAR=0x1FC00
```

Decoding, field by field, because every field is load-bearing here:

-   **Vector 8** is `LOWER_A64_SYNC` — a synchronous exception taken from a lower EL: A VM exit.
-   **EC = 0x20** is an *instruction* abort from a lower EL. Not a data access: a **fetch**.
-   **ISS = 0x6** gives `IFSC = 0b000110`, a stage-2 translation fault at level 2, with `S1PTW = 0` — so the guest’s own stage-1 walk succeeded, and it was the resulting IPA that had no stage-2 mapping.
-   **ELR == FAR == `0x1FC00`.** The guest’s PC is `0x1FC00`. That is a very low address — below RAM, below the peripheral window, in the firmware flash.
-   **SPSR = 0xB05**: EL1h, AArch64, interrupts unmasked, and `BTYPE = 0b10`, which says the PE arrived at this instruction via an *indirect branch*.

So: the guest, at EL1, did an indirect branch to `0x1FC00` and the fetch had no stage-2 translation. Two questions follow. What is at `0x1FC00`, and why does the boot environment jump there when launching an image but never when executing `ver` or `echo`?

### What is at 0x1FC00

The VM is halted in HvArm’s `CpuDeadLoop`, so the debugger can answer both. The guest’s `X30` — the link register at the moment of the branch — is `0x13F163EAC`, firmware DXE code, sitting right next to the firmware’s own vector table at `0x13F166000`. Disassembling there:

```
adrp  x0, 0x13f168000
ldr   x4, [x0, #16]
...
blr   x4
```

An indirect call through a stored function pointer. Reading that pointer out of memory: `*(0x13f168010) == 0x1FC00`. And disassembling the target — EL2 still has a flat view of low flash, so we can just look at it:

```
mrs   x4, daif
msr   daifset, #0xf
isb
mrs   x5, currentel
cmp   x5, #8
b.gt  .                  ; spin if EL3
...
dc    civac, x0
dsb   nsh
```

Mask all interrupts, check which exception level we’re at, clean-and-invalidate a cache line, barrier. That is EDK2’s `ArmMmuLib` **break-before-make** helper — `ArmReplaceLiveTranslationEntry` — the routine that replaces a *live* page-table entry with the MMU briefly disabled. It has to be position-independent and it has to keep running while the tables it is editing are inconsistent, so it lives XIP in the firmware’s pflash and is called through a pointer.

That answers the second question too. `gBS->StartImage()` on `BOOTAA64.EFI` makes CpuDxe apply read-only and execute-never attributes to the loaded image’s pages, via `SetMemoryAttributes` — which goes through break-before-make — which calls the flash-resident helper.

### Why is the flash not mapped

Walking the live stage-2 tables confirms it (`VTTBR_EL2 = 0x13D8A0000`):

```
L-1[0] = 0x13d8a1003   valid
 L0[0] = 0x13d8a2003   valid
 L1[0] = 0x13d8a6003   valid
 L2[0] = 0x0           INVALID   <- IPA [0, 0x200000)
```

### Fixing the issue

Whereas `L2[64]`, covering `0x08000000`, is `0x00600000080004c5` — valid, the Device window we added in Chapter 5. The entire QEMU- `virt` pflash region is simply absent, for the same reason the UART was absent last chapter: our stage-2 map is built from `GetMemoryMap()` plus the device windows we hardcoded, and neither one reports firmware flash.

My first fix was to map the whole flash region `[0, 0x08000000)` as **Normal** memory, as opposed to Device. The guest *fetches* from this region and does `dc civac` on it. A Device mapping would fault the instruction fetch and make cache maintenance meaningless. Mapping it executable Normal memory is the only description that matches what the hardware is: read-only-ish memory holding code.

That regressed: HvArm’s own stage-2 self-check refused the result:

```
VerifyStage2Identity: IPA 0x4000000 attrs 0x4FD; expected MemAttr 0x4
VerifyStage2Identity: IPA 0x6000000 ...
VerifyStage2Identity: IPA 0x7FFF000 ...
```

`InitializeEl2Stage2Translation` returned an error and HvArm bailed out before the `ERET` and we never even reached EL1. QEMU’s `virt` pflash is **two 64 MB banks**: bank 0 at `0x00000000` is the code (from `QEMU_EFI.fd`), bank 1 at `0x04000000` is the writable UEFI variable store. And the memory map *does* report the second one:

```
Region: [0x04000000-0x07FFFFFF] Type=11 (EfiMemoryMappedIO)
```

Which is correct! Variable writes go through a flash *programming* interface — a sequence of magic writes to the flash controller — and that is Device memory, not cacheable memory. My `[0, 0x08000000)` Normal region overlapped it and set it to Normal; the verifier caught the attribute mismatch at the sentinel addresses it checks inside that region.

The lesson is a nice one: **the flash is two banks with two different correct attributes**, and the firmware already told us about the one that needs Device. Only the code bank is invisible.

So the fix maps only the code bank, right next to last chapter’s device windows and fed through exactly the same classifier:

```c
//
// QEMU 'virt' firmware flash (pflash), code bank only. The flash sits below the
// peripheral window as two 64 MB banks: bank 0 (code, from QEMU_EFI.fd) at
// 0x00000000 and bank 1 (the writable UEFI variable store) at 0x04000000. Only
// the code bank is a stage-2 hole: GetMemoryMap() already reports the varstore
// bank as EfiMemoryMappedIO (mapped Device-nGnRE, which is what varstore flash
// programming needs), but nothing reports the code bank.
//
#define GUEST_FLASH_BASE  0x00000000ULL
#define GUEST_FLASH_SIZE  0x04000000ULL   // code bank: 0x0 .. 0x04000000

STATIC CONST MEMORY_REGION  DeviceRegions[] = {
  { GUEST_FLASH_BASE,          GUEST_FLASH_SIZE,          EfiReservedMemoryType, 0 },
  { GUEST_MMIO_PERIPH_BASE,    GUEST_MMIO_PERIPH_SIZE,    EfiMemoryMappedIO,     0 },
  { GUEST_MMIO_HIGH_ECAM_BASE, GUEST_MMIO_HIGH_ECAM_SIZE, EfiMemoryMappedIO,     0 },
  { GUEST_MMIO_HIGH_MMIO_BASE, GUEST_MMIO_HIGH_MMIO_SIZE, EfiMemoryMappedIO,     0 }
};
```

`EfiReservedMemoryType` is what steers the region through `ClassifyRegion` to `S2_LEAF_ATTR_NORMAL_RAM` — Normal write-back, executable — while the `EfiMemoryMappedIO` entries keep getting Device-nGnRE. Nothing in `GetMemoryMap()` covers below `0x04000000`, so there is no overlap, and the verifier passes on every sentinel including the new `[0x0, 0x04000000)` Normal region and the existing `[0x04000000, 0x08000000)` Device one.

`BOOTAA64.EFI` now launches. Fault #1 closed.

* * *

## Ownership of the serial console

Before we tackle the next fault, we need to have a look at the ownership of the console.

Up until now we owned the console and the dump above reached it. The next one didn’t and the VM just went silent, spinning at EL2 in `CpuDeadLoop`.

The cause is that HvArm’s `HVARM_ERROR` and the likes go through `UefiDebugLibConOut` — that is, `gST->ConOut`, the *firmware’s* console stack. That was fine up until now, because the firmware owned the machine and we were a guest of its console. It stops being fine the moment the guest is a bootloader: GRUB reprograms the PL011 for its own use, and Linux later calls `ExitBootServices` and tears the whole UEFI console down. Our fault handler then formats a message into a console that no longer exists — output dropped, or even worse, a call into freed code that faults again inside the fault handler.

There is exactly one physical PL011 on this machine, at `0x09000000`, and under passthrough both EL2 and the EL1 guest drive it directly with no arbitration whatsoever. For *crash* output, that is actually fine, because a crash is the end of the guest: we can simply take the UART back.

So `FatalException` now bypasses everything and drives the PL011 itself:

```c
#define PL011_BASE     0x09000000ULL
#define PL011_DR       0x000        // data
#define PL011_FR       0x018        // flags
#define PL011_FR_TXFF  (1U << 5)    // transmit FIFO full

STATIC VOID
CrashConsoleInit (VOID)
{
  MmioWrite32 ((UINTN)(PL011_BASE + PL011_CR), 0);
  while ((MmioRead32 ((UINTN)(PL011_BASE + PL011_FR)) & PL011_FR_BUSY) != 0) {
  }
  MmioWrite32 ((UINTN)(PL011_BASE + PL011_IBRD), 13);
  MmioWrite32 ((UINTN)(PL011_BASE + PL011_FBRD), 1);
  MmioWrite32 ((UINTN)(PL011_BASE + PL011_LCR_H), PL011_LCR_H_FEN | PL011_LCR_H_WLEN8);
  MmioWrite32 ((UINTN)(PL011_BASE + PL011_IMSC), 0);
  MmioWrite32 ((UINTN)(PL011_BASE + PL011_CR),
               PL011_CR_UARTEN | PL011_CR_TXE | PL011_CR_RXE);
}

STATIC VOID
CrashConsolePutChar (IN CHAR8  Char)
{
  while ((MmioRead32 ((UINTN)(PL011_BASE + PL011_FR)) & PL011_FR_TXFF) != 0) {
  }
  MmioWrite32 ((UINTN)(PL011_BASE + PL011_DR), (UINT32)(UINT8)Char);
}
```

Reset the UART to a known-good 115200-8N1 with FIFOs, then poll-and-write each byte. The message itself gets formatted with `AsciiSPrint` (which meant adding `PrintLib` to `HvArm.inf`) into a stack buffer, so nothing in the path allocates or calls into firmware. It depends on precisely one thing: the peripheral window being mapped in EL2’s stage-1 tables, which it has been since Chapter 2.

And now we can see the output of the fault:

```
*** HvArm FATAL EXCEPTION ***
EL2: Vector=8 EC=0x18 ISS=0x342804
  ELR=0x7CE4BB44 SPSR=0x800003C5 ESR=0x62342804 FAR=0x0
```

That is the very fault we are about to chase. The `ELR` moves between boots — GRUB loads itself at a different address each time — which is why it doesn’t match the debugger capture in the next section; everything else about the fault is identical.

This fix works because the console is not shared and the guest is dying. In the future if we want to output something on a VM Exit and then resume the guest, we will need to work on a solution that cares about sharing the console between the hypervisor and the guest or simply add a second serial to the qemu machine.

The other thing that came out of this detour is `tools/gdb_exc.py`, a small script that pulls `ESR` / `FAR` / `ELR` / `SPSR` plus `HCR_EL2`, `HCRX_EL2`, `VTTBR_EL2`, `VTCR_EL2` off the GDB stub and pretty-prints the decode: EC name, ISS decoded either as a fault status/level or as a system-register name, SPSR split into EL and DAIF. Every decode in the rest of this chapter came out of it.

* * *

## Fault #2: trap on a register access

Here is that dump again, decoded properly:

```toml
ESR_EL2  = 0x62342804   FAR_EL2 = 0   ELR_EL2 = 0xABD3BB44   SPSR_EL2 = 0x800003C5
HCRX_EL2 = 0            HCR_EL2 = 0x480000001
HFGRTR_EL2 = 0          HFGWTR_EL2 = 0
```

-   **EC = 0x18**— a trapped `MSR` / `MRS` /system instruction. `FAR = 0` corroborates it: no memory was involved.
-   **ISS = 0x342804** decodes to `Op0=3, Op1=0, CRn=10, CRm=2, Op2=2`, direction = write, `Rt = x0`. That encoding is [`PIRE0_EL1`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/PIRE0-EL1--Permission-Indirection-Register-0--EL1-).
-   The instruction at `ELR` confirms it: `msr pire0_el1, x0`.
-   **SPSR = 0x800003C5**: the guest was at EL1h with all of DAIF masked — inside a critical MMU-setup section.

`PIRE0_EL1` is FEAT_S1PIE, **stage-1 permission indirection**, an Armv8.9 feature: instead of encoding permissions directly in each descriptor, the descriptor carries an index into a permission register. Checking what this CPU claims:

```
ID_AA64MMFR3_EL1 = 0x1000000011001111
```

`TCRX = 1`, `SCTLRX = 1`, `S1PIE = 1`, `S2PIE = 1` — FEAT_TCR2, FEAT_SCTLR2, FEAT_S1PIE, FEAT_S2PIE — all present, because `-cpu max` is Armv9.4. And recent EDK2 programs permission indirection when FEAT_S1PIE is implemented. So the firmware writes `PIRE0_EL1` during stage-1 setup, as part of handling the bootloader’s image.

[`HCRX_EL2`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/HCRX-EL2--Extended-Hypervisor-Configuration-Register)`.TCR2En` gates *lower-EL* access to `TCR2_EL1` and the whole FEAT_S1PIE/S1POE register file. It does not gate EL2’s own access. HCRX_EL2 resets to zero and we never touched it. Therefore, any access to the registers produces a VM Exit.

I ruled out the other mechanisms that can produce EC=0x18 before believing this: `HCR_EL2.TVM` is clear (bit 26 of `0x480000001`), and both fine-grained trap registers read zero.

The fix looked obvious: set `TCR2En`, and while we’re there `SCTLR2En` too, since the guest will reach for `SCTLR2_EL1` for the same reason.

```
[I] ProgramHcrxEl2ForGuest: HCRX_EL2 0x0 -> 0x80C800 (TCR2En=1 SCTLR2En=1 MSCEn=1 EnFPM=1)
```

The write landed. **And `PIRE0_EL1` still trapped, with a byte-identical ESR.**

* * *

## Fault #2b: the gate in front of the gate

`TCR2En` was necessary and not sufficient, which means there is something else that is checked as well.

`PIRE0_EL1` ’s accessibility pseudocode in the Arm Architecture Reference Manual checks [`HFGWTR_EL2`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/HFGWTR-EL2--Hypervisor-Fine-Grained-Write-Trap-Register)`.nPIRE0_EL1` **before** it ever looks at `HCRX_EL2.TCR2En`.

I had read `HFGRTR_EL2 = HFGWTR_EL2 = 0` because most bits in those registers mean **1 = trap**, so zero is the do-nothing value. However, the fields named `nXXX` have **inverted polarity: 0 means trap.** And they are not a random scattering — they are precisely the registers added by the recent extensions:

| Bit | Field | Feature |
| --- | --- | --- |
| 63  | `nAMAIR2_EL1` | FEAT_AIE |
| 62  | `nMAIR2_EL1` | FEAT_AIE |
| 61  | `nS2POR_EL1` | FEAT_S2POE |
| 60, 59 | `nPOR_EL1`, `nPOR_EL0` | FEAT_S1POE |
| 58, 57 | `nPIR_EL1`, `nPIRE0_EL1` | FEAT_S1PIE |
| 56  | `nRCWMASK_EL1` | FEAT_THE |
| 55, 54 | `nTPIDR2_EL0`, `nSMPRI_EL1` | FEAT_SME |
| 53, 52 | `nGCS_EL1`, `nGCS_EL0` | FEAT_GCS |
| 50  | `nACCDATA_EL1` | FEAT_LS64_ACCDATA |
|     |     |     |

So a hypervisor that never writes `HFGxTR_EL2` — which is to say, every hypervisor written before FEAT_FGT existed, and mine — silently traps *every one of those register files* to EL2 the instant it demotes a guest. “The reset value is the safe value” is a reasonable instinct, and for these two registers it is exactly the other way around.

The fix sets the `n` -bits for the features this CPU actually implements. Each one is gated on its own feature-ID field, because a bit whose feature is absent is RES0 and writing 1 to it is an architectural mistake, not a harmless no-op:

```c
if (IdField (Mmfr3, ID_AA64MMFR3_S1PIE_SHIFT) != 0) {
  Untrap |= HFGXTR_EL2_NPIR_EL1 | HFGXTR_EL2_NPIRE0_EL1;
}

if (IdField (Mmfr3, ID_AA64MMFR3_S1POE_SHIFT) != 0) {
  Untrap |= HFGXTR_EL2_NPOR_EL1 | HFGXTR_EL2_NPOR_EL0;
}

if (IdField (Mmfr3, ID_AA64MMFR3_AIE_SHIFT) != 0) {
  Untrap |= HFGXTR_EL2_NMAIR2_EL1 | HFGXTR_EL2_NAMAIR2_EL1;
}

if (IdField (Pfr1, ID_AA64PFR1_SME_SHIFT) != 0) {
  Untrap |= HFGXTR_EL2_NTPIDR2_EL0 | HFGXTR_EL2_NSMPRI_EL1;
}
/* ... GCS, THE, LS64_ACCDATA ... */

ArmWriteHfgrtrEl2 (ReadOld | Untrap);
ArmWriteHfgwtrEl2 (WriteOld | Untrap);
```

The write is a pure additive OR, which makes the function safe by construction: it never touches a normal-polarity bit, so it can only ever *remove* traps and never add one.

```
[I] ProgramFineGrainedTrapsForGuest: HFGRTR_EL2 0x0 -> 0xC6F0000000000000,
    HFGWTR_EL2 0x0 -> 0xC6F0000000000000 (untrap mask 0xC6F0000000000000)
```

Reading the mask back against the table: bits 63, 62 (AIE), 58, 57 (S1PIE), 55, 54 (SME), 53, 52 (GCS). No `nPOR*`, because this CPU reports `S1POE = 0`; no `nRCWMASK_EL1`, no `nACCDATA_EL1`, same reason. And **bit 61, `nS2POR_EL1`, is deliberately left trapping**— more on that below.

Fault #2 is fixed and GRUB chained the kernel. The next fault’s `ELR` was `0xFFFFADC66FB914D8` — a TTBR1 address, kernel-half virtual memory. Linux was running.

* * *

## Fault #3: Scalable Matrix Extension, SME

```
EL2: Vector=8 EC=0x1D ISS=0x0
  ELR=0xFFFFADC66FB914D8 SPSR=0x600000C5
```

EC = 0x1D is an SME access trapped, and `ISS.SMTC = 0` narrows it to “as a result of `CPACR_EL1.SMEN` / `CPTR_EL2.SMEN` ”. Back in Chapter 3 I wrote `ProgramCptrEl2ForGuest` to un-trap FP and SVE, handling both the VHE layout (`FPEN` / `ZEN` enable fields) and the non-VHE one (`TFP` / `TZ` trap bits). I never wrote the SME equivalent — `SMEN[25:24]` under VHE, `TSM[12]` without — because nothing I ran used SME.

Linux doesn’t care whether you use SME. It *probes* it during `cpufeature` setup, on any machine that advertises it, and the probe walks straight into the trap. One more field in the mask:

```c
CptrNew = (CptrOld & ~(CPTR_EL2_VHE_FPEN_MASK |
                       CPTR_EL2_VHE_ZEN_MASK  |
                       CPTR_EL2_VHE_SMEN_MASK |
                       CPTR_EL2_TAM_BIT))
        | CPTR_EL2_VHE_FPEN_NO_TRAP
        | CPTR_EL2_VHE_ZEN_NO_TRAP
        | CPTR_EL2_VHE_SMEN_NO_TRAP;
```

### The bug underneath

Fixing that made me look one level down, and there I found something that was never going to produce a fault at all.

[`CPTR_EL2`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/CPTR-EL2--Architectural-Feature-Trap-Register--EL2-) decides *whether* EL1 may use SVE and SME. `ZCR_EL2` and `SMCR_EL2` decide *how much*: the effective vector length at EL1 is the **smaller** of the EL1 and EL2 `LEN` requests. Leave them at their reset value of zero and the guest is clamped to the shortest implementable vector, no matter what it asks for. It works but as a worse machine than the hardware underneath it — 16-byte vectors on a CPU that implements 256.

That is exactly the class of divergence a passthrough hypervisor must not introduce, and it is invisible unless you go looking, because nothing traps and nothing faults. The fix is to write all-ones to `LEN` — it is a *request* field, so the PE clamps it down to what it implements — plus `SMCR_EL2.FA64` when `ID_AA64SMFR0_EL1.FA64` says full A64 in streaming mode exists:

```c
if (IdField (ArmReadIdAa64Pfr0El1 (), ID_AA64PFR0_SVE_SHIFT) != 0) {
  Old = ArmReadZcrEl2 ();
  New = Old | ZCR_ELx_LEN_MASK;
  ArmWriteZcrEl2 (New);
  ArmInstructionSynchronizationBarrier ();
  HVARM_INFO ("ZCR_EL2 0x%lx -> 0x%lx (LEN clamped by hardware to 0x%lx)",
              Old, New, ArmReadZcrEl2 () & ZCR_ELx_LEN_MASK);
}
```

Vector length is guest compute state with no bearing on isolation, so handing over the maximum costs us nothing in containment. It has to run *after* `ProgramCptrEl2ForGuest`, mind — `CPTR_EL2` gates EL2’s own access to those two registers as well.

The guest kernel log later confirmed it: **SVE and SME both come up at 256 bytes per vector** instead of 16.

* * *

## Fault #4: the pointer-authentication keys

```
EL2: Vector=8 EC=0x18 ISS=0x300822   ELR=0xFFFFA1134FA812F4
```

EC = 0x18 again, and the ISS decodes to `Op0=3, Op1=0, CRn=2, CRm=1, Op2=0`, a write with `Rt = x1`: **`APIAKeyLo_EL1`**. Linux installing its pointer-authentication keys, a few instructions into feature setup.

Two bits in [`HCR_EL2`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/HCR-EL2--Hypervisor-Configuration-Register) gate this: `APK[40]` for the key registers, `API[41]` for the `PAC*` / `AUT*` instructions themselves. Both zero. Same shape as fault #2, one register over.

The fix has to be a read-modify-write, and that is the only fiddly thing about it: `HCR_EL2` already carries the stage-2 configuration (`VM`, `RW`) and the entire interrupt-routing policy from Chapter 5 (`IMO` / `FMO` / `AMO` all zero, physical interrupts going to the guest). Clobbering that register with a composed value would silently undo last chapter’s work.

```c
if ((IdField (Isar1, ID_AA64ISAR1_APA_SHIFT) != 0) ||
    (IdField (Isar1, ID_AA64ISAR1_API_SHIFT) != 0) ||
    (IdField (Isar2, ID_AA64ISAR2_APA3_SHIFT) != 0))
{
  New |= HCR_EL2_APK_BIT | HCR_EL2_API_BIT;
}

if (IdField (ArmReadIdAa64Pfr1El1 (), ID_AA64PFR1_MTE_SHIFT) >= 2) {
  New |= HCR_EL2_ATA_BIT;
}
```

FEAT_PAuth is reported through any one of three ID fields depending on which algorithm the implementation ships, hence the three-way test. `ATA[56]` — EL0/EL1 access to the FEAT_MTE2 allocation-tag registers — rides along in the same function; it only exists from MTE2 onwards, so it is gated on `MTE >= 2`.

```
[I] ProgramHcrEl2FeatureGatesForGuest: HCR_EL2 0x480000001 -> 0x30480000001 (APK=1 API=1 ATA=0)
```

`ATA` stayed zero because this QEMU CPU reports `MTE < 2`.

### Why handing over the PAC keys is safe here

The pointer-authentication key registers are **not banked per exception level**. There is one `APIAKey` on the machine, shared by EL1, EL2 and EL3. Setting `APK` lets the guest write the very keys EL2 would use.

That would matter enormously if EL2 authenticated its own return addresses with them — a guest could set a key it knows and go hunting for a PAC-signed pointer at EL2 to forge. So I checked rather than assumed:

```
$ aarch64-linux-gnu-objdump -d HvArm.dll | grep -E 'pac(ia|ib|..)|aut|retaa|retab|xpac'
    93c4: d50320ff  xpaclri
    eaec: d50320ff  xpaclri
    eb0c: d50320ff  xpaclri
```

Three `xpaclri` and nothing else in the entire image. `xpaclri` *strips* a pointer’s authentication code and is key-independent — it is in there from the ERET trampoline. There is no PAC-signed control flow at EL2 for a guest-chosen key to subvert, so the keys are, today, guest state and nothing more. The moment HvArm is built with `-mbranch-protection`, this stops being true and the keys have to be context-switched on every entry and exit.

* * *

## The role of a passthrough hypervisor

The four faults on `HCRX_EL2`, `HFGRTR_EL2` / `HFGWTR_EL2`, `CPTR_EL2.SMEN` and `HCR_EL2.APK` / `API` were in a sense related as they were due misconfigurations. They gate *lower* -EL access, and until Chapter 4 there was no lower EL. The interrupt-routing work in Chapter 5 was the first instance of this shape — `HCR_EL2.IMO` deciding where the guest’s interrupts go — and I thought of it as a one-off about interrupts.

A passthrough hypervisor’s task at handoff is to **open every gate that only gates the guest**, while keeping shut the ones that would hand the guest something EL2 owns. The four functions that do this all live in `EL1Setup.c::PrepareEl1State`, each one read-modify-write, each individual bit gated on the feature-ID field for the extension that introduced it — because these bits are RES0 when the feature is absent, and a hypervisor that blindly sets them is writing ones into reserved fields on every older CPU it ever runs on.

One practical note for anyone doing this on EDK2: the new registers are too recent for the baseline `-march` that EDK2 builds with, so the by-name mnemonics don’t assemble. The `ArmLib` accessors use raw `S<op0>_<op1>_C<crn>_C<crm>_<op2>` encodings instead.

* * *

## Running it: Debian at EL1

```yaml
FS1:\> Helper.efi load HvArm.efi
...
[I] ProgramHcrxEl2ForGuest: HCRX_EL2 0x0 -> 0x80C800 (TCR2En=1 SCTLR2En=1 MSCEn=1 EnFPM=1)
[I] ProgramHcrEl2FeatureGatesForGuest: HCR_EL2 0x480000001 -> 0x30480000001 (APK=1 API=1 ATA=0)
[I] ProgramFineGrainedTrapsForGuest: HFGRTR_EL2 0x0 -> 0xC6F0000000000000, ...
[I] HvArmMain: Returned from trampoline at EL1
Entry point returned: Success

FS1:\> fs2:
FS2:\> cd EFI\BOOT
FS2:\EFI\BOOT\> BOOTAA64.EFI
```

shim, GRUB, the kernel, systemd, cloud-init, and then:

```
Debian GNU/Linux 13 localhost ttyAMA0

localhost login:
```

The kernel’s own log is the best summary of the chapter, because every feature it detects is a gate we opened:

```yaml
[    0.000000] psci: probing for conduit method from ACPI.
[    0.000000] psci: PSCIv1.1 detected in firmware.
[    0.000000] CPU features: detected: HCRX_EL2 register
[    0.000000] CPU features: detected: Stage-1 Permission Indirection Extension (S1PIE)
[    0.000000] CPU features: detected: Address authentication (IMP DEF algorithm)
[    0.115497] CPU: All CPU(s) started at EL1
[    0.116482] CPU features: detected: Memory Copy and Memory Set instructions
[    0.116526] CPU features: detected: SCTLR2
[    0.116235] CPU features: detected: FPMR
[    0.143507] SVE: maximum available vector length 256 bytes per vector
[    0.143817] SME: maximum available vector length 256 bytes per vector
```

`CPU: All CPU(s) started at EL1`: Linux checks what exception level it booted at and prints it; on a normal QEMU `virt` with `virtualization=on` that line reads EL2. Here it reads EL1, because we got there first.

Attaching a debugger while Debian sits at the login prompt:

```toml
PSTATE    = ... EL1h
HCR_EL2   = 0x30480000001   VM=1, E2H=1, IMO=FMO=AMO=0, APK=API=1
VTTBR_EL2 = 0x44e00000
VTCR_EL2  = 0x38006350c
VBAR_EL2  = 0x44f7a000      HvArm's own vector table
```

* * *

## What does it cost?

Six chapters of work have gone into a guest that cannot tell it has been deprivileged. There is one way it might still notice: the clock. So I booted the same Debian Trixie cloud image twice, side by side on the same machine — once normally, once under HvArm — and timed both from the moment `EFI\BOOT\BOOTAA64.EFI` was launched to the login prompt.

| Boot | Time to login prompt |
| --- | --- |
| Native (no hypervisor) | **77.64 s** |
| Under HvArm at EL1 | **88.32 s** |
| Difference | +10.68 s (**+13.8 %**) |
|     |     |

Before reading anything into that, here is what the measurement is and isn’t. It is one run each, timed with a stopwatch against a video, so the third digit is decoration — but the gap is ten and a half seconds, orders of magnitude above any plausible timing error, so the shape of the result is solid even if the precision isn’t. It is also *wall-clock time for a full distro boot*, which includes a DHCP lease, cloud-init and a bunch of systemd units waiting on things that have nothing to do with the CPU.

The more interesting question is where those ten seconds go, and the answer is: **not into HvArm**. After the `ERET`, the hypervisor’s code does not run. Interrupts go straight to EL1 under the passthrough routing from Chapter 5; the timer is the guest’s own; and with this chapter’s four gates open there are no register traps left — the only EL2 code path still armed is `FatalException`, which would halt the machine rather than return. A clean boot takes essentially zero VM exits. HvArm spends those ten seconds doing nothing whatsoever.

The cost is paid by the MMU instead, and it is structural. With stage 2 enabled, a TLB miss no longer costs one walk, it costs a nested one: the guest’s stage-1 walk produces IPAs, and *every descriptor fetch in that walk* must itself be translated through stage 2 before it can be read. The walks multiply rather than add. And our stage 2 is not a cheap one — back in Chapter 3 we built a FEAT_LPA2 five-level map starting at level −1, for a 52-bit IPA space, because that is what the hardware advertised and it was the interesting thing to implement. Every extra stage-2 level multiplies against every stage-1 level on every miss.

What keeps it to 14 % rather than something worse is the greedy block builder from the same chapter: RAM is mapped in 1 GB and 2 MB blocks wherever alignment allows, so most stage-2 walks terminate early and each TLB entry covers a large range.

And booting is close to the worst case for all of this. It is one long parade of exactly the operations nested translation punishes — loading images, editing live page tables, cache maintenance, touching memory once and never again. A steady-state workload with a warm TLB should sit far closer to native than this number suggests. I have not measured that, and I am not going to claim it from a stopwatch; the honest next step is repeated runs and a CPU-bound benchmark like a kernel build, native versus guest.

If the 14 % did need to come down, the first experiment is obvious and it isn’t a clever one: ask for a smaller IPA space. A 40- or 44-bit stage-2 starts at level 0 instead of level −1, which removes one or two levels from every nested walk for a machine with 4 GB of RAM that never needed 52 bits of address space in the first place.

* * *

## What we deliberately left closed

The theme of this chapter is opening gates, so it is worth being explicit about the ones still shut, and why. Every one of these is a bit I could have set and chose not to:

-   **`HFGxTR_EL2.nS2POR_EL1` \[61\]** stays trapping. `S2POR_EL1` modulates **stage-2** permissions — that is hypervisor policy, not guest state. Everything else we ungated is EL1&0-regime state whose effects remain bounded by stage-2 translation, which EL2 alone controls. This one would let the guest reach into the boundary itself, so I would rather get a fatal `EC=0x18` and find out than hand it over silently.
-   **`HCRX_EL2.TMEA` and `MCE2`** route guest RAS and MOPS exceptions up to EL2. We’re a passthrough hypervisor; the guest handles its own.
-   **`HCRX_EL2.VINMI` / `VFNMI`** are virtual interrupt injection, which we have no machinery for — there is no GICH in play, as Chapter 5 explained at length.
-   **`HCRX_EL2.TALLINT`** would trap the guest’s own interrupt masking to EL2. Nothing good comes of that here.
-   **`CMOW`, `FnXS`, `FGTnXS`** change guest-visible cache and TLBI semantics for no benefit to us.

And the larger thing we did not do: this is still one guest with the real hardware handed to it. Nothing in this chapter moved toward multiplexing. Every gate opened above is about letting a *single* passthrough guest use the machine it was compiled for.

* * *

## The hole we haven’t closed

Now the uncomfortable part, and it is pre-existing rather than anything this chapter introduced.

HvArm’s stage-2 map is a straight identity map of everything `GetMemoryMap()` reports as RAM, mapped read-write. That set includes the pages HvArm allocated for **its own EL2 stage-1 page tables, its stage-2 tables, its vector table and its code**. A hostile guest at EL1 — or, far more likely on the way there, a buggy one — can write to EL2’s translation tables. From there, taking the hypervisor is not a subtle exercise.

Nothing about the four gates makes this worse; they are all EL1&0-regime features whose reach is bounded by stage-2 translation. But that is exactly the point: **stage 2 is the boundary**, it is the only boundary, and right now it has a hole shaped like HvArm.

Carving the hypervisor’s own allocations out of the guest’s stage-2 map — unmapped, or at most read-only — is the first thing in this project that is genuinely about *isolation* rather than about compatibility. It is the next chapter.

* * *

## Conclusion

I expected this chapter to be Chapter 5 again: hunt the missing regions, read the `FAR`, patch the map, repeat. It was that exactly once — and even then the interesting part wasn’t the missing region but *why* it was missing. The firmware’s flash is two banks that need two different memory types, the firmware tells you about the one that needs Device and stays silent about the one that needs Normal, and the only reason the gap ever shows up is a break-before-make helper that runs XIP out of flash when someone applies page attributes to a freshly loaded image. That is about as deep in the machine as a bug can hide and still be a missing table entry.

The other four faults were quiet different. Nothing was missing; everything was *closed* and thus misconfigured. `HCRX_EL2`, the fine-grained traps with their inverted `n` -bits, `CPTR_EL2.SMEN`, the pointer-auth keys — four registers whose reset values are perfectly correct for a machine with nothing at EL1, and perfectly wrong for a machine with a guest. The fine-grained traps are quiet tricky: `HFGRTR_EL2 = 0` looks like “no traps configured” and means “trap every register file the architecture has added since 2020.”

And the reward for opening them is an unmodified Debian 13, off a stock cloud image, through shim and GRUB and systemd, booting to a login prompt under an hypervisor, printing `All CPU(s) started at EL1` on its way past. It uses permission indirection, `SCTLR2`, MOPS, pointer authentication, 256-byte SVE and SME vectors, through no emulation of ours (if we don’t factor qemu in), because we opened the gate and got out of the way.

It also, finally, costs something measurable: about fourteen percent on a boot, paid entirely to the MMU rather than to any code of ours, on the single most translation-hostile workload a machine ever runs.

Which is the last easy chapter. Everything so far has been about the guest not noticing us. The next one is about making sure the guest *can’t* reach us, and that means restricting Stage-2 translation so that the guest cannot access critical hypervisor memory. Eventually we will also add more vCPU, before we will try to run it on really hardware.
