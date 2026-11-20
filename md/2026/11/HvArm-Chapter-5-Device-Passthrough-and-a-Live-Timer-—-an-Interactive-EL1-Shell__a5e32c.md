---
title: "HvArm: Chapter 5: Device Passthrough and a Live Timer — an Interactive EL1 Shell"
source: https://0xabe.io/hypervisor/arm/2026/08/28/HvArm-Chapter-5.html
source_host: 0xabe.io
clip_date: 2026-11-20T10:37:10+08:00
trace_id: dc07491f-2e6d-4cb4-bf11-4996f6bcf58a
content_hash: 97532b713e4185d2f77b35fa424c3b22d3471c56a243d40cd312004f31401f16
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
notion_page_id: 41e75244-d011-81ae-8dc9-c369db2c3cf6
ioc: null
---

Chapter 4 ended on a freeze. We installed the exception vectors, flipped `ret` to `eret`, and we returned to the UEFI boot environment deprivileged at EL1. Then the shell took a stage-2 data abort on its very first instruction, trying to write to the serial console. The vector table caught it and told us precisely where: `FAR=0x09000018`, the PL011 UART. The deprivileging worked. The guest just can’t touch any of its own hardware.

That is the first of two problems standing between us and a *usable* shell, and they turn out to be the two halves of the same question: what does it actually take for a passthrough guest to keep running as if nothing changed? First, the stage-2 map has a hole where every device lives. Second, the guest’s periodic timer, which drives everything from the event loop to console input, currently vectors into our hypervisor that doesn’t know how to keep it alive.

By the end of this chapter the UEFI Shell is running at EL1, under the hypervisor, and you can type at it. Getting there means closing the memory map’s blind spot and then — the part that took the longest and taught me the most — virtualize the interrupt controller.

The source code for this chapter is available at [https://gitlab.com/0xabe.io/hvarm](https://gitlab.com/0xabe.io/hvarm).

* * *

## The memory map’s blind spot

Back in Chapter 3 we built the stage-2 identity map from the UEFI memory map — `gBS->GetMemoryMap()` — classifying each region as RAM (Normal-WB) or MMIO (Device-nGnRE) and leaving the gaps invalid, on the theory that a wild access into a gap would be a fault we could trap later. That theory had a flaw I missed: it assumed the memory map *contains* every region the guest legitimately touches, so that only genuinely wild accesses hit the gaps.

It doesn’t. `GetMemoryMap` describes memory — conventional RAM, loader and boot-services allocations, runtime regions, ACPI reclaim. It describes *some* MMIO, the pieces the firmware registered as runtime-visible; on this platform that includes the RTC at `0x09010000`, which is why it shows up in the map. But it does not describe the UART at `0x09000000`, or the GIC at `0x08000000`, or the PCIe apertures. Those are hardware the firmware drives directly; they were never entered into the EFI memory map, so our stage-2 walk has no descriptor for them. The RTC being present and the UART, ten pages away, being absent is exactly the kind of asymmetry that makes this bug confusing until you understand *why* the map contains what it contains.

So the guest’s first UART write faults. And here is where the diagnostic information logged when there is a fault pays off. `FAR` names the exact page. I fixed the UART, rebooted — and the guest got a little further and faulted again, on a different address. Fixed that, got further, faulted again. The vector table turned “the shell is dead” into a guided tour of every device the boot environment touches on its way up:

```
[E] FatalException: EL2 fatal exception: Vector=8 EC=0x24 ISS=0x1800007
[E]   FAR=0x9000018             <- PL011 UART
...
[E]   FAR=0x11800044            <- 32-bit PCIe MMIO window
...
[E]   FAR=0x8000600016          <- 64-bit PCIe MMIO window (a level-0 fault!)
```

Three faults, three different regions, each one the FAR telling me exactly which device the guest reached for next.

* * *

## The QEMU virt device layout

To close the blind spot properly you have to know where the machine puts its hardware. On the QEMU `virt` platform everything lives in a predictable layout, and almost all of it sits *below* where RAM starts, at `0x40000000`:

| Region | Base |
| --- | --- |
| GIC (distributor + CPU + virt) | `0x08000000` |
| PL011 UART | `0x09000000` |
| RTC, fw_cfg, GPIO, … | `0x09010000+` |
| virtio-mmio | `0x0A000000` |
| PCIe MMIO (32-bit) / PIO / ECAM | `0x10000000+` |
| **RAM** | `0x40000000` |
| PCIe ECAM (high) | `0x4010000000` |
| PCIe MMIO (64-bit) | `0x8000000000` |
|     |     |

The first two faults, the UART (`0x09000000`) and the 32-bit PCIe window (`0x11800044`), are in that big peripheral band between `0x08000000` and RAM at `0x40000000`. The third is more interesting, and the syndrome is worth decoding.

`0x8000600016` is in the **64-bit PCIe MMIO** aperture at `0x8000000000` — 512 GB up — where the firmware places 64-bit BARs. And the fault status code for that one wasn’t a plain translation fault, it was a translation fault at **level 0**: the walk failed at its very top table. Recall from Chapter 3 that our stage 2 uses the FEAT_LPA2 five-level walk, starting at level −1, for a 52-bit IPA space. At the 4 KB granule each level-0 descriptor spans bits \[47:39\] of the address — **512 GB per entry**. On the working boot our stage-2 tree had exactly one populated level-0 entry, `L0[0]`, covering the first 512 GB of IPA space `[0, 0x8000000000)`. And `0x8000000000` is precisely the first byte of `L0[1]` — the *second* level-0 entry, which was invalid. So the walk didn’t get far enough to fail on a page; it failed on the top table itself, because the address is beyond the corner of the map we’d built.

So the guest reaches for three distinct regions: the low peripheral band, and both high PCIe apertures. All three need to exist in stage 2, mapped as Device-nGnRE, before the boot environment can finish coming up.

* * *

## Mapping the device windows

The fix is to stop trusting `GetMemoryMap` to be complete and explicitly add the device windows the guest is going to use. HvArm appends them to the region list before the sizing and build passes run, so the rest of the stage-2 machinery — the requirements count, the greedy block builder, the verifier — treats them exactly like any other region:

```c
// QEMU 'virt': all platform peripherals sit below RAM (0x40000000); the
// two high PCIe apertures sit far above it. GetMemoryMap() reports none
// of the device MMIO, so we map it explicitly as Device-nGnRE.
#define GUEST_MMIO_PERIPH_BASE     0x08000000ULL
#define GUEST_MMIO_PERIPH_SIZE     0x38000000ULL   // 0x08000000 .. 0x40000000
#define GUEST_MMIO_HIGH_ECAM_BASE  0x4010000000ULL
#define GUEST_MMIO_HIGH_ECAM_SIZE  0x0010000000ULL // 256 MB
#define GUEST_MMIO_HIGH_MMIO_BASE  0x8000000000ULL
#define GUEST_MMIO_HIGH_MMIO_SIZE  0x0200000000ULL // 8 GB prefix

STATIC EFI_STATUS
AddGuestDeviceMmioRegions (IN OUT MEMORY_MAP_INFO *MemoryMap)
{
  STATIC CONST MEMORY_REGION  DeviceRegions[] = {
    { GUEST_MMIO_PERIPH_BASE,    GUEST_MMIO_PERIPH_SIZE,    EfiMemoryMappedIO, 0 },
    { GUEST_MMIO_HIGH_ECAM_BASE, GUEST_MMIO_HIGH_ECAM_SIZE, EfiMemoryMappedIO, 0 },
    { GUEST_MMIO_HIGH_MMIO_BASE, GUEST_MMIO_HIGH_MMIO_SIZE, EfiMemoryMappedIO, 0 }
  };
  /* reallocate MemoryMap->Regions with room for the extra entries,
     copy the originals, append these three, bump RegionCount. */
}
```

Rather than pick out the UART, the GIC, the RTC and the virtio range individually, I map the whole `[0x08000000, 0x40000000)` peripheral band in one region. It’s 896 MB of address space, most of it unpopulated holes, but that costs almost nothing: the greedy block builder folds it into a handful of 2 MB and 1 GB block descriptors, and the guest never touches the holes, so mapping them Device-nGnRE is harmless. The two high apertures get their own regions — 256 MB for the high ECAM, and an 8 GB prefix of the 64-bit MMIO window, comfortably more than QEMU allocates BARs into from its base.

Giving the region its `EfiMemoryMappedIO` type is what steers it through the existing classifier to the Device-nGnRE leaf attributes — including, from Chapter 3, the FEAT_XNX-aware `XN` encoding and the LPA2 `SH` -bit masking. We’re reusing all of that; we’re just feeding it regions the memory map forgot to mention.

This is the pragmatic fix, and it’s honest about being one. Hardcoding QEMU’s device layout is exactly the kind of platform assumption a real hypervisor shouldn’t bake in. The correct version enumerates the firmware’s own view of the address space — the DXE **GCD memory space map** (`gDS->GetMemorySpaceMap()`), which lists every region the firmware knows about, MMIO included — and maps whatever it reports. That’s a clean future refactor; for now, three hardcoded windows get the boot environment fully mapped, and the fault parade stops.

* * *

## Now the shell needs a heartbeat

With the device map complete, the guest runs. It comes all the way up, returns from the hypervisor’s entry point, and the shell prompt appears:

```
[I] HvArmMain: Returned from trampoline at EL1
Entry point returned: Success

FS1:\>
```

And then it sits there. Frozen. It prints its prompt and never reads a keystroke. We are at EL1, the console works well enough to *write*, but nothing you type does anything.

The reason is buried in how UEFI does console input, and it’s worth understanding because it dictates the entire second half of this chapter. On a serial console, the input path runs through `TerminalDxe`. When you press a key, it doesn’t go straight into a buffer the shell reads — it sits in the UART’s receive FIFO until something *polls* the UART and moves it. And the only thing that polls the UART is a **periodic timer event**: at start-up `TerminalDxe` creates an `EVT_TIMER | EVT_NOTIFY_SIGNAL` event and arms it with `gBS->SetTimer(..., TimerPeriodic, ...)`. Every tick, that callback — `TerminalConInTimerHandler` — reads bytes out of the serial FIFO with `GetOneKeyFromSerial` and stuffs them into an in-memory key buffer.

Everything downstream only ever looks at that buffer. `ReadKeyStroke` (`ReadKeyStrokeWorker`) pulls one key off the FIFO and returns `EFI_NOT_READY` if it’s empty — it never touches the hardware. `WaitForEvent` on the console’s `WaitForKey` event runs a notify (`TerminalConInWaitForKey`) that *checks whether the buffer is non-empty* and signals if so — again, no hardware poll. So the chain is: timer tick → `TerminalConInTimerHandler` → drain UART into buffer → `ReadKeyStroke` sees a key. Knock out the first link and the whole chain is dead: no timer tick, no polling; no polling, no keys; the buffer stays empty forever and the shell’s `WaitForEvent` spins on an event that will never signal.

So the frozen shell is not a bug in our code. It is the direct, mechanical consequence of the timer being dead — and the timer is dead because, back in Chapter 4, we stole `VBAR_EL2` from the firmware and then masked interrupts rather than deal with them. To make the shell interactive, the periodic timer interrupt has to fire, be delivered somewhere, and be *serviced* by something that reprograms it and advances the UEFI event clock. That “something” is the whole problem.

* * *

## The timer that wouldn’t die

Here is the trap I spent more time than I would admit in.

The firmware’s timer is the architected **virtual timer**, delivered as GIC private interrupt **INTID 27**. When I first unmasked interrupts at EL1 and let it fire, it vectored — because of how we’d set up interrupt routing — into *our* EL2 handler, which acknowledged it and returned. But the architected timer is level-triggered: acknowledging it at the GIC doesn’t clear the condition, and I hadn’t reprogrammed the compare value, so it re-asserted instantly. Interrupt storm: the machine executed our IRQ vector forever.

The obvious fix — have our handler *disable* the timer interrupt at the GIC so it stops storming — works, but the firmware needs it. Kill it and the storm stops and so does the event loop, the console polling, everything.

I tried to reprogram it instead — read the compare register, push it forward a tick, acknowledge, return. It wouldn’t deassert. This is a genuine VHE issue: the `CNTV_*_EL0` timer mnemonics, accessed from EL2 with `E2H=1`, don’t reliably reach the same virtual-timer instance that’s raising INTID 27 to the guest. Reprogramming “the timer” from the hypervisor was reprogramming the wrong view of it.

At which point the instinct of anyone who’s read about hypervisors kicks in: *virtualize it*. GICv2 has a virtualization extension exactly for this — GICH, a hypervisor control interface with a set of “list registers”, lets EL2 inject a virtual interrupt that the guest acknowledges and EOIs through its own virtual CPU interface (GICV), which you map into the guest in place of the real one. Set it up and the guest’s timer handler runs at EL1, services the virtual interrupt, reprograms *its* timer, and everyone’s happy. That is the correct architecture for a hypervisor that multiplexes a real interrupt controller across guests.

It is also a substantial pile of code, and — I eventually realised — completely unnecessary for what we’re actually building.

* * *

## The insight: EDK2’s exception code is EL-agnostic

Here is the thing I’d been missing. With a passthrough hypervisor, we have exactly **one** guest. It is the firmware itself, deprivileged. It already has a perfectly good timer interrupt handler — the one that was servicing that timer a moment ago, before we `eret` ‘d. The only reason it stopped working is that *we took its vectors away*. What if we just… gave them back?

The objection I’d assumed all along was that the firmware’s exception handlers run at EL2 and can’t run at EL1 — that they’d be full of `ELR_EL2` reads that fault the moment you execute them one level down. So I went and read them. EDK2’s AArch64 exception entry, in `ArmPkg/Library/ArmExceptionLib/AArch64/ExceptionSupport.S`, opens every handler with a macro called `EL1_OR_EL2`: it reads `CurrentEL` at runtime and branches to a path that uses `ELR_EL1` / `SPSR_EL1` /… or `ELR_EL2` / `SPSR_EL2` /… accordingly. **The firmware’s vector code is deliberately exception-level-agnostic.** It was written to run at either EL, because VHE firmware and non-VHE firmware install the same code at different levels.

And the rest of the path is even more portable, because it’s just C touching memory-mapped hardware. The IRQ chain is `GicV2IrqInterruptHandler` — reads `GICC_IAR`, dispatches — into `TimerInterruptHandler`, which reprograms the virtual timer’s compare value, calls the UEFI core’s tick (`CoreTimerTick`, which is what advances every timer event, including TerminalDxe’s console poll), and EOIs. None of that cares what EL it runs at. The GIC is MMIO; the timer is an EL0-accessible system register the guest is entitled to use; the event core is plain C.

So the whole apparatus — vectors, GIC dispatch, timer reprogramming, event tick, console poll — runs correctly at EL1, *if we let the guest keep using it*. We don’t need to virtualize the interrupt controller. We need to get out of the way.

* * *

## Passthrough wiring

The design that falls out of this is **single-guest passthrough**: route physical interrupts straight to the guest at EL1, hand it back the firmware’s own vectors, and let it drive the physical GIC and the timer directly, exactly as it did before we showed up. Four changes.

**Route interrupts to EL1, not EL2.** Chapter 3’s stage-2 activation set `HCR_EL2.IMO/FMO/AMO = 1` — the “route IRQ/FIQ/SError to EL2” bits I’d described as the defining features of a Type-1 hypervisor. For a *multiplexing* hypervisor, they are. For a passthrough guest that services its own interrupts, they’re exactly wrong: they yank every interrupt up to EL2, where we’d have to inject it back down. Clearing them leaves the guest’s interrupts at EL1:

```c
HcrNew = (HcrOld & ~(HCR_EL2_TGE_BIT |
                     HCR_EL2_IMO_BIT | HCR_EL2_FMO_BIT | HCR_EL2_AMO_BIT))
       | HCR_EL2_VM_BIT | HCR_EL2_RW_BIT;
```

`VM` (stage 2) and `RW` (AArch64 EL1) stay; `TGE` stays cleared. Synchronous VM exits — stage-2 faults — still go to EL2 no matter what `IMO` says, so we keep our diagnostic dumper. We’ve given up interposing on interrupts, and gained a guest whose timer works.

**Give the guest the firmware’s vectors.** This is why Chapter 4 captured `firmwareVbarEl2 = ArmReadVbarEl2()` before overwriting `VBAR_EL2`. Instead of installing *our* EL1 table, we point the guest’s `VBAR_EL1` at the firmware’s own (EL-agnostic) vectors:

```c
VOID EFIAPI InstallGuestEl1Vectors (IN UINT64 FirmwareVbar)
{
  BOOLEAN E2h = (ArmReadHcrEl2 () & HCR_EL2_E2H_BIT) != 0;
  if (E2h) {
    ArmWriteVbarEl12 (FirmwareVbar);   // guest EL1's VBAR, under VHE
  } else {
    ArmWriteVbarEl1 (FirmwareVbar);
  }
  ArmInstructionSynchronizationBarrier ();
}
```

Now when the guest takes its timer interrupt at EL1, it vectors through the firmware’s own handler, which reads the physical GIC (mapped, since last section), reprograms the timer, ticks the event core, and EOIs — the entire path we were trying and failing to reimplement from EL2, running unmodified at EL1.

**Keep the setup window masked.** We still repoint `VBAR_EL2` at *our* table (for VM-exit diagnostics), so the firmware’s timer would still storm into us during the brief window before the `eret`. Chapter 4’s `ArmMaskIrq()` still covers that; the `eret` restores `SPSR_EL2 = 0x345`, unmasking IRQ at EL1, where the firmware’s vectors are now waiting.

**The GIC is passthrough too.** The guest reads `GICC_IAR` and writes `GICC_EOIR` against the *physical* CPU interface at `0x08010000` — which our stage-2 map now identity-maps straight through. There is one physical GIC and one guest; letting the guest drive it directly is not just simplest, it’s correct.

`HvArmMain` becomes:

```c
firmwareVbarEl2 = ArmReadVbarEl2();
InitializeEl2Stage1Translation();
InitializeEl2Stage2Translation();          // now clears IMO/FMO/AMO, maps device MMIO
ArmMaskIrq();
InstallEl2ExceptionVectors();              // VBAR_EL2 = ours, for VM exits
PrepareEl1State();
InstallGuestEl1Vectors(firmwareVbarEl2);   // VBAR_EL1 = the firmware's own
EretToEl1Trampoline();
currentEL = GetCurrentEL();                 // verify we actually landed at EL1
if (currentEL == 1) {
  HVARM_INFO("EL1 verification: CurrentEL == 1 (running at EL1 as expected)");
}
```

* * *

## Running it: an interactive shell at EL1

Build, boot, load. This time the log doesn’t end in a fatal dump: ![EFI Shell running at EL1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f843fa96057f70cd.png)

The prompt comes back, and — this is the whole point — `ver` and `echo` **echo the keys back and run**. Because console input is fed only by the periodic timer, a shell that responds to a keystroke is a shell whose timer is alive. Interactivity *is* the proof that the timer works; there’s no separate test to run.

Attaching a debugger to the running VM confirms the architecture underneath:

```
PSTATE = 0x60000305    ->  EL1h, IRQ unmasked
HCR_EL2 = 0x480000001  ->  VM=1, E2H=1, IMO=FMO=AMO=0
VBAR_EL1 = 0x13F166000 ->  the firmware's own vector table
```

The boot environment is running at EL1, taking its interrupts at EL1, handling them with its own vectors, driving the physical GIC and timer directly — and it has no idea any of that changed. The hypervisor is sitting one level up at EL2, holding `VBAR_EL2` for when a VM exit needs handling, otherwise invisible.

* * *

## What we deliberately did not do: passthrough vs. multiplexing

It’s worth being explicit that this is passthrough, not virtualization, and about where the line is.

We have one guest, and we hand it the real hardware: the physical GIC, the physical timer, its own vectors. That’s enough to run the boot environment interactively, and it will be enough for a first pass at booting a Linux guest — Linux, like the firmware, is perfectly happy to drive a GIC and an architected timer that behave like real ones.

The moment we want *two* guests, or want to interpose on the interrupts the guest sees — inject a virtual timer, hide a device, present a different interrupt topology than the hardware has — passthrough isn’t enough, and the GICv2 virtualization extension I talked myself out of comes back.

The other honest caveat is the hardcoded device windows. Enumerating the DXE GCD memory space map instead of hardcoding QEMU’s layout is the right fix, and it’s on the list.

* * *

## Conclusion

Two problems stood between Chapter 4’s freeze and a working shell, and they were the two things a passthrough guest needs to not notice it’s been deprivileged: its memory and its clock.

The memory problem was a flaw in a source of truth we’d trusted too much — `GetMemoryMap` describes memory, not the devices the firmware drives, so the UART, the GIC and the PCIe apertures were simply absent from our stage-2 map. The vector table from Chapter 4 turned that from an opaque freeze into a guided tour, the FAR naming each missing region in turn; we closed the holes by mapping QEMU’s device layout as Device-nGnRE, including a 64-bit PCIe window 512 GB up that had been faulting at the very top of the stage-2 walk.

The clock problem was the one I over-thought. UEFI console input needs that periodic timer, and having stolen the firmware’s vectors we’d stolen its ability to service that timer. The reflex was to virtualize the interrupt controller — GICH, GICV, injected virtual interrupts — and it was the wrong reflex for a single-guest passthrough. EDK2’s exception handlers are exception-level-agnostic by construction; its interrupt and timer path is plain C over MMIO. Hand the deprivileged firmware back its own vectors, route interrupts to EL1, and let it drive the real GIC and timer, and the entire apparatus that was servicing that timer a moment before the `eret` just… keeps working, one level down, none the wiser.

And so the UEFI Shell runs at EL1, under the hypervisor, and you can type at it. `CurrentEL` reads one; the prompt answers; the hypervisor is invisible. Which was the entire goal of the last four chapters — to slide underneath a running system without it noticing. In the next chapter, we will try to run a Linux kernel, loaded into EL1, running as a guest. That’s where the passthrough we so carefully avoided complicating finally has to start earning the “hypervisor” in its name.
