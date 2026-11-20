---
title: "HvArm: Chapter 4: Exception Vectors, the GIC, and the ERET to EL1"
source: https://0xabe.io/hypervisor/arm/2026/07/29/HvArm-Chapter-4.html
source_host: 0xabe.io
clip_date: 2026-11-20T10:36:41+08:00
trace_id: cc8c1783-cf5f-43de-a99e-67f25f8114f0
content_hash: 9aa95410f8233b43f448342e49bbcf6a783706d3e528b6bec12d48e376f5309a
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
notion_page_id: 41e75244-d011-81a4-abca-e350f664fa80
ioc: null
---

Chapter 3 left the system one instruction away from EL1. Stage 2 was enabled, the guest EL1 register file was fully populated, and a placeholder trampoline stood at the exact point where the `ERET` belongs — but it `ret` s instead of `eret` ing, because firing the exception return with no exception handlers in place would be suicide. The very first thing an `ERET` can produce is an exception: a stage-2 fault on the entry fetch, a stray SError, an interrupt that was already pending. With no vector table installed, that exception vectors into whatever `VBAR` happens to hold — firmware leftovers, or zero — and the machine dies somewhere unrecognisable.

So before we can flip that one instruction, we need the exception machinery. Two vector tables, actually: one for EL2 (so *we* can catch and diagnose anything the guest — or our own code — throws), and one for EL1 (so the guest’s own exceptions don’t fault on the vector fetch). This chapter builds both, wires up a minimal GICv2 driver so an interrupt vector has something to acknowledge, deals with a nasty side effect of taking over `VBAR_EL2`, and finally flips `ret` to `eret`.

And then the guest wakes up at EL1 — and immediately falls on its face. Which, it turns out, is exactly what a working vector table is supposed to show you.

The source code for this chapter is available at [https://gitlab.com/0xabe.io/hvarm](https://gitlab.com/0xabe.io/hvarm).

* * *

## Two vector tables, two jobs

[`VBAR_EL2`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/VBAR-EL2--Vector-Base-Address-Register--EL2-) and [`VBAR_EL1`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/VBAR-EL1--Vector-Base-Address-Register--EL1-) point at two different tables that do two different jobs, and it’s worth being clear about which is which before writing a line of assembly.

`VBAR_EL2` is *ours*. It catches everything that lands at EL2: our own bugs while we’re still running the setup code, and — once the guest is at EL1 — every **VM exit**. Under stage 2, a guest access to an unmapped IPA is a stage-2 fault, and stage-2 faults are always taken to EL2 regardless of interrupt routing. So `VBAR_EL2` is the hypervisor’s window onto everything the guest does that we have to intervene on. For this chapter its handler is deliberately blunt: dump the syndrome registers and halt. A hypervisor that halts on the first fault is not much of a hypervisor, but a hypervisor that halts *and tells you exactly where and why* is an extraordinary debugging tool, and we are about to need it.

`VBAR_EL1` is the guest’s. When the deprivileged boot environment takes an exception that stays at EL1 — a synchronous trap, an interrupt routed to EL1 — the hardware vectors through `VBAR_EL1`. The firmware never set this up, because it has always run at EL2; the register is zero. If we `ERET` to EL1 and leave it zero, the guest’s first EL1 exception fetches a vector from physical address 0. Under VHE we write the guest’s copy through the `*_EL12` alias, exactly as we did for the rest of the EL1 register file in Chapter 3:

```c
if (E2h) {
  ArmWriteVbarEl12(Table);   /* under VHE: the guest EL1's VBAR */
} else {
  ArmWriteVbarEl1(Table);
}
```

So: `VBAR_EL2` for our faults and the guest’s VM exits, `VBAR_EL1` for the guest’s own EL1 exceptions. Both have to exist before the `ERET`.

* * *

## The shape of an AArch64 vector table

An AArch64 vector table is not an array of function pointers like x86’s IDT. It is a **2 KB block of code**, divided into 16 slots of 128 bytes each. The processor doesn’t call a handler; it *branches* to a fixed offset within the table and starts executing whatever instructions are there. Sixteen slots because there are four *kinds* of exception:

-   Synchronous
-   IRQ
-   FIQ
-   SError

taken from four *origins*:

| Offset | Origin |
| --- | --- |
| `0x000` | Current EL, SP_EL0 |
| `0x200` | Current EL, SP_ELx |
| `0x400` | Lower EL, AArch64 |
| `0x600` | Lower EL, AArch32 |

Four origins × four kinds = 16 slots, each 128 (`0x80`) bytes apart, and the table as a whole must be 2 KB aligned because `VBAR_ELx` only stores bits \[63:11\] — the low 11 bits are RES0.

The “Current EL” rows are exceptions taken while we’re already running at the vector’s EL (our own EL2 bugs, in the `VBAR_EL2` table). The “Lower EL, AArch64” row is the interesting one for a hypervisor: that’s where a **guest VM exit** lands — an EL1 access that faulted at stage 2, an instruction we chose to trap. “Lower EL, AArch32” we don’t support; a 32-bit guest is something that is out of scope (for now?).

128 bytes is not a lot of room — sixteen or so instructions — so the convention is that each slot does the bare minimum and branches out to shared code. HvArm stamps a slot identifier into a register and jumps to a common routine:

```cpp
#define VECTOR_CUR_SP0_SYNC      0
#define VECTOR_CUR_SP0_IRQ       1
...
#define VECTOR_LOWER_A64_SYNC    8    // guest synchronous VM exit
#define VECTOR_LOWER_A64_IRQ     9
#define VECTOR_LOWER_A64_FIQ     10
#define VECTOR_LOWER_A64_SERROR  11
#define VECTOR_LOWER_A32_SYNC    12   // 32-bit guest: refused
...
```

so that a single C dispatcher can tell exactly which of the sixteen doors the exception came through.

* * *

## Saving the world: the exception frame

Before the dispatcher can run C, it has to save the interrupted context — because the C compiler will happily clobber any register it likes, and we intend to *return* to the interrupted code afterwards as if nothing happened. HvArm saves a fixed frame, `EXCEPTION_CONTEXT`, whose layout the assembly and the C side both agree on to the byte:

```c
typedef struct {
  UINT64  X[31];   // x0..x30
  UINT64  Sp;      // SP at the point of exception
  UINT64  Elr;     // ELR_ELx  - where to resume
  UINT64  Spsr;    // SPSR_ELx - PSTATE to restore
  UINT64  Esr;     // ESR_ELx  - the syndrome: what happened
  UINT64  Far;     // FAR_ELx  - the faulting address
} EXCEPTION_CONTEXT;   // 0x120 bytes, 16-byte aligned
```

Each vector slot reserves this frame on the stack, pre-saves `x0` / `x1` so it has two scratch registers, stamps its slot id, and branches to the common routine:

```
.macro VECTOR_ENTRY id, common
    .balign 0x80
    sub     sp, sp, #CTX_SIZE
    stp     x0, x1, [sp, #0x00]
    mov     x0, #\id
    b       \common
.endm
```

The `.balign 0x80` is what pins each entry to its architected 128-byte slot; the assembler pads whatever came before. The common routine then saves the rest of the general-purpose registers and, crucially, the four *system* registers that describe the exception — `ELR`, `SPSR`, `ESR`, `FAR` — before handing control to C:

```python
.macro SAVE_DISPATCH_RESTORE el, handler
    stp     x2,  x3,  [sp, #0x10]
    ...
    str     x30,      [sp, #0xF0]

    // SP at the point of exception = current sp + frame size.
    add     x1, sp, #CTX_SIZE
    str     x1,       [sp, #CTX_SP]

    mrs     x1, elr_\el
    str     x1,       [sp, #CTX_ELR]
    mrs     x1, spsr_\el
    str     x1,       [sp, #CTX_SPSR]
    mrs     x1, esr_\el
    str     x1,       [sp, #CTX_ESR]
    mrs     x1, far_\el
    str     x1,       [sp, #CTX_FAR]

    // x0 already holds the slot id; pass &context in x1.
    mov     x1, sp
    bl      \handler

    // Reload the (possibly dispatcher-adjusted) return state, then restore GPRs.
    ldr     x1, [sp, #CTX_SPSR]
    msr     spsr_\el, x1
    ldr     x1, [sp, #CTX_ELR]
    msr     elr_\el, x1
    ...
    ldp     x0,  x1,  [sp, #0x00]
    add     sp, sp, #CTX_SIZE
    eret
.endm
```

Two details in that macro are load-bearing.

The first is the `\el` parameter. It reads `elr_\el` / `spsr_\el` / `esr_\el` / `far_\el`, which the assembler expands to `elr_el2` or `elr_el1` depending on which table this code is compiled into. **This is why HvArm has two separate tables even though they are structurally identical.** The EL2 table’s common routine reads `ELR_EL2`; the EL1 table’s reads `ELR_EL1`. If the EL1 table tried to read `ELR_EL2` it would take an exception on the `mrs` itself — EL1 has no business touching EL2 registers. The two tables are the same shape with a different register suffix baked in.

The second is that we do **not** manually mask interrupts on entry. The architecture does it for us: taking any exception sets `PSTATE.{D,A,I,F} = 1` automatically, so the whole handler runs with interrupts masked, and the eventual `eret` restores the pre-exception mask from the saved `SPSR`. There is no window where a second interrupt can nest on top of the first before we’ve saved state.

The restore path is deliberately symmetric to the save, with one difference: it reloads `SPSR` and `ELR` *from the frame* rather than trusting the copies still sitting in the system registers. That’s what makes the frame the single source of truth — a handler can write `Context->Elr = Context->Elr + 4` to step the guest past a trapped, emulated instruction, or rewrite `Context->Spsr` to change the PSTATE it returns to, and the restore honours it. The saved `SP` is informational only: `eret` doesn’t touch it (the target EL selects its own stack pointer), we merely record where the interrupted code’s stack was. And the frame is `0x120` bytes — deliberately a multiple of 16, because AArch64 requires 16-byte stack alignment and the C dispatcher assumes it.

The dispatcher, then, gets `x0` = slot id and `x1` = a pointer to that frame: everything it needs to know what happened (the slot and the syndrome registers) and the possibility to change what happens next (the return state). For this chapter it only reads.

* * *

## The C dispatcher: a very blunt instrument

Here is the entire EL2 dispatcher for this chapter:

```c
VOID
EFIAPI
HvArmEl2ExceptionDispatch (
  IN     UINTN              VectorId,
  IN OUT EXCEPTION_CONTEXT  *Context
  )
{
  UINTN  Kind;

  Kind = VECTOR_KIND (VectorId);          // low two bits: Sync/IRQ/FIQ/SError
  if ((Kind == VECTOR_KIND_IRQ) || (Kind == VECTOR_KIND_FIQ)) {
    ServiceInterrupt ();
    return;
  }

  FatalException (VectorId, Context, "EL2");
}
```

Interrupts get acknowledged (more on the GIC below); everything else — a synchronous exception or an SError, from our EL2 code or from the guest — is treated as fatal, and `FatalException` is the debugging tool the whole chapter has been building towards:

```c
STATIC VOID
FatalException (
  IN UINTN VectorId, IN EXCEPTION_CONTEXT *Context, IN CONST CHAR8 *Regime
  )
{
  UINT64  Esr = Context->Esr;
  HVARM_ERROR (
    "%a fatal exception: Vector=%d EC=0x%x ISS=0x%x",
    Regime, (UINT32)VectorId,
    (UINT32)((Esr >> 26) & 0x3F),        // EC: exception class
    (UINT32)(Esr & 0x1FFFFFF)            // ISS: syndrome
    );
  HVARM_ERROR (
    "  ELR=0x%lx SPSR=0x%lx ESR=0x%lx FAR=0x%lx",
    Context->Elr, Context->Spsr, Context->Esr, Context->Far
    );
  CpuDeadLoop ();
}
```

`EC` — bits \[31:26\] of [`ESR_EL2`](https://developer.arm.com/documentation/ddi0601/2026-03/AArch64-Registers/ESR-EL2--Exception-Syndrome-Register--EL2-) — is the exception class, and for a hypervisor a handful of values come up again and again:

| EC  | Meaning |
| --- | --- |
| `0x20` | Instruction abort from a **lower** EL (guest fetch fault) |
| `0x21` | Instruction abort from the current EL |
| `0x24` | Data abort from a **lower** EL (guest load/store fault) |
| `0x25` | Data abort from the current EL |
| `0x16` | `HVC` from AArch64 — a guest hypercall |
| `0x18` | Trapped `MSR` / `MRS` /system-instruction access |

The “from a lower EL” classes are the guest’s VM exits; the “current EL” ones are our own bugs. The low bits of `ISS` refine it further: for an abort, the fault status code (`DFSC` / `IFSC`) says *why*— a translation fault, a permission fault, an access-flag fault — and at which level of the page-table walk. `S1PTW`, bit 7, tells you the fault happened on a stage-1 *page-table walk* rather than on the final access, which is the tell-tale of a stage-2 problem underneath a stage-1 regime.

`FAR` is the faulting address. Together, `EC` + `ISS` + `FAR` tell us what exactly happened, for example: “the guest took a translation fault at stage-2 level 0 while fetching from `0x13DEA1104` ”. We will be decoding exactly these fields, twice, at the end of this chapter.

The EL1 dispatcher is the same code with a different label — it runs at EL1, so its `FatalException` reads the EL1 syndrome registers the assembly saved for it. In this chapter the guest never actually reaches it, because the interesting faults are all VM exits that go to EL2. It’s there as a safety net.

* * *

## A minimal GICv2

The IRQ path in the dispatcher calls `ServiceInterrupt`, and to service an interrupt you have to talk to the interrupt controller. Our QEMU `virt` machine is configured with a **GICv2**— as shown in the libvirt domain (`<gic version='2'/>`) — which matters, because GICv2 and GICv3 have completely different programming models. GICv3 moved the CPU interface into system registers (`ICC_*`); GICv2 is pure **memory-mapped I/O**. There are no system registers to read, instead wedirectly access MMIO at fixed addresses.

On the `virt` machine those addresses are the distributor (GICD) at `0x08000000` and the CPU interface (GICC) at `0x08010000`. A real hypervisor would discover them from the device tree or the ACPI MADT; HvArm hardcodes them for now with a comment promising to do better later. The firmware has already brought the GIC up — enabled the distributor, unmasked priorities — so our module does not initialise anything. It only needs two operations, acknowledge and end-of-interrupt, plus the constants to talk to them:

```c
#define GICV2_DIST_BASE   0x08000000ULL
#define GICV2_CPU_BASE    0x08010000ULL

#define GICC_IAR          0x000C    // Interrupt Acknowledge
#define GICC_EOIR         0x0010    // End Of Interrupt

// Values >= 1020 are special (1023 = spurious): nothing was pending.
#define GICV2_INTID_MASK       0x3FF
#define GICV2_INTID_IS_SPECIAL(Id)  ((Id) >= 1020)

UINT32 EFIAPI GicV2AcknowledgeInterrupt (VOID) {
  return MmioRead32 ((UINTN)(GICV2_CPU_BASE + GICC_IAR));
}

VOID EFIAPI GicV2EndOfInterrupt (IN UINT32 Iar) {
  MmioWrite32 ((UINTN)(GICV2_CPU_BASE + GICC_EOIR), Iar);
}
```

Reading `GICC_IAR` acknowledges the highest-priority pending interrupt and returns its ID; writing that exact value back to `GICC_EOIR` retires it. That read-then-write bracket is the interrupt’s lifecycle in miniature: an interrupt goes *pending* when it asserts, becomes *active* the moment the IAR read acknowledges it (which is also what stops the same interrupt from being handed out again while you’re servicing it), and returns to *inactive* on the End Of Interrupt write. Skip the EOI and that priority level stays active forever, silently blocking everything at or below it. An IAR of 1023 means “spurious” — no interrupt was actually pending — and the architecture says you must *not* EOI it.

The interrupt ID itself carries meaning: `0..15` are software-generated interrupts (SGIs, for inter-processor signalling), `16..31` are **private peripheral interrupts** (PPIs — per-CPU, and this is where the architected timers live), and `32` and up are shared peripheral interrupts (SPIs — the UART, the RTC, PCIe). We’ll be paying very close attention to one particular PPI in the next chapter. That is the whole GIC module for this one. It looks anticlimactic, and it is: the interrupt controller barely does anything here. It earns its keep in the next chapter, when a live timer turns this two-function module into the thing that keeps EL1 running.

* * *

## Installing the vectors — and the timer we just stole

Installing a table is three instructions: publish any writes, point `VBAR_EL2` at it, synchronise.

```c
VOID EFIAPI InstallEl2ExceptionVectors (VOID) {
  UINT64  Table = (UINT64)(UINTN)HvArmEl2VectorTable;
  ArmDataSynchronizationBarrier ();     // dsb ish
  ArmWriteVbarEl2 (Table);
  ArmInstructionSynchronizationBarrier ();  // isb
}
```

Harmless-looking. It is not, and this is the subtlety that cost me the most time in the whole chapter.

The firmware we are running under — AAVMF, at EL2 under VHE — has a **live periodic timer**. It uses it to drive its event loop: every tick, the UEFI core advances timers, polls the console, runs callbacks. That timer fires an interrupt, and until this exact instruction, that interrupt vectored through the *firmware’s* `VBAR_EL2` into the firmware’s own handler, which knows how to service it.

The moment we execute `ArmWriteVbarEl2`, we steal it. The next timer tick — which could be a few milliseconds away — now vectors into **our** table, into a dispatcher that acknowledges the interrupt and does nothing else useful with it. Worse, the architected timer is level-triggered: acknowledging it at the GIC doesn’t make the timer condition go away, so if we EOI without reprogramming the timer it re-asserts immediately and we are in an interrupt storm, executing our IRQ vector forever, having made no forward progress. The symptom is a hang at a nondeterministic PC — the machine dies somewhere between installing the vectors and the ERET or even when we are back in the UEFI shell, never in the same place twice. It is a miserable bug to chase precisely because it is not reproducible.

We are going to deal with the timer *properly* in the next chapter — properly enough that the shell keeps running. For this chapter we don’t need the firmware’s timer at all: we are about to leave, and everything between here and the `ERET` is a short, self-contained sequence of register writes. So we simply mask IRQs at EL2 for the duration:

```c
VOID EFIAPI ArmMaskIrq (VOID) {
  __asm__ volatile ("msr daifset, #2" : : : "memory");   // set PSTATE.I
}
```

`daifset, #2` sets the `I` bit; from here until the `ERET`, no IRQ can vector into our half-built handler. The `ERET` will restore `PSTATE` from `SPSR_EL2`, so the mask we choose *there* is what the guest wakes up with — the setup-window mask is invisible to it. Deferring interrupt handling like this is a cheat we can only get away with because HvArm’s setup path doesn’t itself depend on the timer; the boot services calls it makes (`AllocatePages` and friends) are synchronous and don’t wait on events.

The order in `HvArmMain` is therefore: capture the firmware’s `VBAR_EL2` first (we’ll need it next chapter), do all the page-table work with the firmware’s timer still live and handling itself, then mask, install our vectors, and finish the EL1 prep:

```c
firmwareVbarEl2 = ArmReadVbarEl2();        // save the firmware's vectors

InitializeEl2Stage1Translation();
InitializeEl2Stage2Translation();

ArmMaskIrq();                              // close the setup window
InstallEl2ExceptionVectors();
PrepareEl1State();
InstallEl1ExceptionVectors();              // our EL1 table, for now
EretToEl1Trampoline();
```

* * *

## Flipping ret to eret

With both vector tables in place, the placeholder from Chapter 3 finally becomes real. The trampoline is unchanged except for its last instruction and the `SPSR` value it arms:

```rust
EretToEl1Trampoline:
    mov     x9,      sp
    msr     sp_el1,  x9         // EL1 continues on the same stack

    xpaclri                     // strip a PAC from x30 if present
    msr     elr_el2, x30        // resume just after the bl

    movz    x9, #0x345          // SPSR_EL2: EL1h, IRQ *unmasked*
    msr     spsr_el2, x9
    isb

    eret
```

The mechanics — sharing `SP_EL1` with the EL2 stack, `xpaclri`, writing `ELR_EL2` from the link register — were the whole back half of Chapter 3 and haven’t changed; the boot environment resumes at the instruction after the `bl`, with its locals and return chain intact, now at EL1.

The one value that *did* change is `SPSR_EL2`. Chapter 3 armed `0x3C5` — EL1h with `D`, `A`, `I`, `F` all masked — because there were no handlers and an interrupt firing the instant after the `ERET` would have been fatal. Now there *are* handlers, and more to the point we *want* the guest to take its own interrupts, so I’ve cleared the `I` bit: `0x345` is EL1h with FIQ, SError, and Debug masked but **IRQ enabled**. That is a promise the rest of this chapter cannot keep — we just spent a page explaining that our IRQ handler can’t actually service the timer — but it sets up the real work of Chapter 5, and as we’re about to see, the guest fails on something else long before the first timer tick would have mattered.

* * *

## First light at EL1 — and an immediate failure

Build, boot, `Helper.efi load HvArm.efi`, and watch the serial log. The first time I flipped the `eret`, the guest produced a VM exit::

```
[E] FatalException: EL2 fatal exception: Vector=8 EC=0x24 ISS=0x1800007
[E]   ELR=0x13F1277C8 SPSR=0x345 ESR=0x93800007 FAR=0x9000018
```

`Vector=8` is `VECTOR_LOWER_A64_SYNC` — a synchronous VM exit from the AArch64 guest, exactly the slot we said would catch guest faults. `EC=0x24` — is for a data abort. `FAR=0x09000018` That address is the flag register of the PL011 UART: the guest, running its first EL1 code, tried to write to the serial port — the console — and the access aborted at stage 2. We are genuinely at EL1 now; the deprivileging worked. But the guest cannot touch the device, because our stage-2 identity map, built faithfully from the UEFI memory map back in Chapter 3, never mapped the UART at all.

The memory map, it turns out, is missing something, and that is exactly where Chapter 5 will begin.

* * *

## What we deliberately did not touch

A couple of things are conspicuously unfinished, on purpose:

-   **Real interrupt handling.** Our IRQ vector acknowledges and EOIs, and that’s all. It cannot keep the firmware’s periodic timer alive, which is why we mask IRQs at EL2 during setup and why the whole next chapter is largely about interrupts. The `SPSR` promise (`I` unmasked at EL1) is written but not yet honoured.
    
-   **The EL1 vector table is ours, and that turns out to be wrong.** We install `HvArmEl1VectorTable` as the guest’s `VBAR_EL1`. Chapter 5 will discover that for the guest’s *own* timer and console to keep working, the guest needs the *firmware’s* vectors at EL1, not ours, and will replace this install with the firmware’s captured `VBAR_EL2`. Foreshadowing.
    

* * *

## Conclusion

This chapter built the exception machinery that Chapter 3 promised and deferred: two 2 KB vector tables — one for EL2 to catch our faults and the guest’s VM exits, one for EL1 for the guest’s own exceptions — each a grid of 16 architected slots that save a fixed register frame and hand a slot id and a context pointer to a C dispatcher. The dispatcher is blunt by design: acknowledge interrupts, and treat every synchronous fault as fatal but *loud*, dumping the exception class and faulting address that turn a hang into a diagnosis. A two-function GICv2 MMIO driver gives the IRQ path something to acknowledge. Installing `VBAR_EL2` quietly hijacks the firmware’s periodic timer, which we sidestep for now by masking IRQs across the short setup window — a debt the next chapter pays in full.

And then the single instruction that this whole arc has been building towards: `ret` became `eret`, and the UEFI boot environment woke up at EL1, deprivileged, running on the same stack it was using an instruction earlier. It got exactly as far as trying to write to its own console before failing on a stage-2 data abort — because the identity map we built in Chapter 3 has a hole where every memory-mapped device lives.

The vectors did their job perfectly: they told us precisely what broke and where. Next chapter we close the memory map’s blind spot, and then confront the problem we’ve been deferring all along — giving EL1 a heartbeat, so the shell isn’t just alive but *interactive*.
