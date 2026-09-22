---
title: "Jailbreaking the iPhone 3GS from Scratch, Part 2: Reverse Engineering the BootROM | incogbyte"
source: https://incogbyte.github.io/posts/2026-07-02-reverse-engineering-iphone3gs-bootrom-ghidra/
source_host: incogbyte.github.io
clip_date: 2026-09-22T10:28:31+08:00
trace_id: 15579da7-029d-40e7-809d-d7e5d00c441a
content_hash: 3e8402dc3238c5ee4408cd2f914284419a70aaf40965111566b8d58b50c2b99d
status: synced
tags:
  - iOS逆向
  - 漏洞分析
series: null
feed_source: incogbyte·iOS/Mobile
ai_summary: Ghidra 逆向 64KB iPhone 3GS SecureROM 转储，还原向量表、复位处理与堆分配器，静态证实 limera1n 所依赖的 EXPLOIT_LR 常量并锁定签名校验代码。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 3e375244-d011-812d-8de4-f276ac9b960e
ioc:
  cves: []
  cwes: []
  hashes:
    - 0123456789abcdef0123456789abcdef
    - 0e6feb1144c95b1ee088ecd6c45bfdc2ed17191167555b6ca513d6572e463c86
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Ghidra 逆向 64KB iPhone 3GS SecureROM 转储，还原向量表、复位处理与堆分配器，静态证实 limera1n 所依赖的 EXPLOIT_LR 常量并锁定签名校验代码。
> 
> - **加载方式：** `bootrom.bin` 为无头裸二进制，须以 ARM:LE:32:v7、基址 `0x0` 导入，否则 `0x20` 处绝对指针表失效；仅约 45KB（至 `0xb218`）有内容，其余为零填充。ARM 与 Thumb 混合，需手动切换 TMode。
> - **启动路径：** 首字节 `0e 00 00 ea` 即 ARM 复位向量 `B #0x40`；`0x0–0x40` 为异常向量表，`0x20` 为处理程序地址表。复位处理程序在 `0x40` 完成重定位、复制 .data、清零 BSS 并按模式设置栈，最后 `bx 0x6ef` 进入 Thumb 固件。
> - **常量验证：** Supervisor 栈顶 `0x84034000` 减去 Part 1 的 `EXPLOIT_LR` `0x84033FA4` 恰为 `0x5C`（92 字节），证明被覆盖的 LR 就落在该 SVC 栈上，把盲抄的常数变为可解释的槽位。
> - **关键函数：** DFU 缓冲区在 `0x34a4` 分配 `0x800`；malloc 在 `0x1aa8`、free 在 `0x1ccc`；`0x1fa8` 的带校验 free 会检查偏移 `0xc` 的 "Memz"（`0x4d656d7a`），limera1n 绕过的正是未走该校验的 `0x1ccc`。
> - **字符串与信任根：** `0xa19c` 是生成 DFU 序列号的格式串（Part 1 所见 `CPID:8920` 的输出处），`0xa230` 内嵌 Apple Root CA 证书（DER，931 字节）；img3 解析与签名校验位于 `0x24dc`（728 字节），为 Part 3 攻击目标。

> **Note:** I am always learning. This series is a study project, not a definitive guide, and I will certainly make mistakes along the way. If you spot any errors, inaccuracies, or something that could be explained better, please reach out on [X (@incogbyte)](https://x.com/incogbyte) or on [LinkedIn](https://linkedin.com/in/rodolfo-tavares-543863a7). I am grateful for any corrections and happy to learn from them.

## Where we left off

In [Part 1](https://incogbyte.github.io/posts/2026-04-15-exploiting-iphone3gs-bootrom-dump-limera1n/) we used the **limera1n** heap overflow to break into the iPhone 3GS SecureROM in DFU mode, ran a 76-byte ARM payload, and pulled 64KB of raw code out of the chip:

```
File:     bootrom.bin
Size:     65536 bytes (64KB)
SHA-256:  0e6feb1144c95b1ee088ecd6c45bfdc2ed17191167555b6ca513d6572e463c86
Device:   iPhone 3GS (S5L8920, SecureROM 359.3.2)
```

That was the "get a foot in the door" step. But `bootrom.bin` is still a black box, 64KB of bytes that Apple engineers wrote in 2008 and burned into the chip. This post is about **turning those bytes into something we can read**: loading it into Ghidra correctly, finding the vector table and reset handler, following the strings, and, the fun part, walking straight up to the same functions the exploit abused in Part 1 and reading their source.

Quick reminder of where this sits in the series:

-   **Part 1: initial access**, limera1n, dumping the BootROM ✅
-   **Part 2: Reverse Engineering the BootROM** <-- *you are here*
-   Part 3: Bypassing the Boot Chain
-   Part 4: Loading a Custom Payload
-   Part 5: Kernel Patching and Root
-   Part 6: The Jailbreak

* * *

## 1\. First contact: what are we even holding?

Before opening any disassembler, look at the raw shape of the file. This tells you how to load it.

```bash
$ ls -la bootrom.bin
-rw-r--r--  65536  bootrom.bin

$ xxd bootrom.bin | head -4
00000000: 0e00 00ea 18f0 9fe5 18f0 9fe5 18f0 9fe5  ................
00000010: 18f0 9fe5 18f0 9fe5 18f0 9fe5 18f0 9fe5  ................
00000020: 4000 0000 c055 0000 d055 0000 e855 0000  @....U...U...U..
00000030: 0c56 0000 2456 0000 2856 0000 3856 0000  .V..$V..(V..8V..
```

Two things right away:

1.  **There is no file header.** No Mach-O magic, no ELF magic, nothing. This is a *flat binary*, the raw contents of memory starting at physical address `0x0`. A disassembler will not auto-detect anything, we have to tell it the architecture and base address by hand.
    
2.  **The very first word is `0e 00 00 ea`.** In ARM that decodes to `B #0x40`, an unconditional branch. That is the classic ARM **reset vector**: in the ARM architecture, address `0x0` is the first entry of the exception vector table, the fixed slot the core jumps to the instant it powers on (see the [ARM Architecture Reference Manual (ARMv7-A/R), "Exceptions"](https://developer.arm.com/documentation/ddi0406/latest/)). The CPU powers on, sets PC = 0, and the first thing it does is jump to `0x40`. So byte 0 is code, and it's 32-bit ARM, little-endian.
    

How much of the 64KB is actually *used*? A quick script:

```python
d = open('bootrom.bin','rb').read()
last = max(i for i,b in enumerate(d) if b != 0)
print('last non-zero byte at 0x%x' % last)     # --> 0xb218
print('zeros: %.1f%%' % (100*d.count(0)/len(d)))  # --> 38.5%
```

So the real ROM is roughly `0x0` - `0xb218` (~45KB of code + data), and the rest is zero padding out to the 64KB ROM window. Good, we know the map's boundaries before we start.

![Last non-zero byte at 0xb218, 38.5% of the dump is zero padding](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ae090eea2c692c88.png)

* * *

## 2\. Loading it into Ghidra (and the mistake I made first)

This is the step where it's easy to waste an hour. The import options *must* match the silicon, or every address Ghidra shows you is wrong and nothing cross-references.

**File --> Import File --> bootrom.bin**, then:

| Option | Value | Why |
| --- | --- | --- |
| Language | `ARM:LE:32:v7` | S5L8920 is a Cortex-A8 (ARMv7-A) core, little-endian, 32-bit |
| Base / Image Base | `0x00000000` | The ROM is mapped at physical `0x0`, branches use absolute targets |
| Format | Raw Binary | there is no container to parse |

> **The mistake:** my first import used base address `0x84000000`, the SRAM address from Part 1, because that number was burned into my brain from the exploit. Wrong. `0x84000000` is where our *payload* copied the ROM to so USB could read it. The ROM itself *executes* from `0x0`. Load it at `0x0`, otherwise the handler table at `0x20` (which holds absolute addresses like `0x000055c0`) points into nowhere and Ghidra's auto-analysis finds almost no functions.

![Ghidra import: ARM v7 32-bit little-endian, and the options dialog with Base Address 0x0, Length 0x10000](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/887554afd5477552.png)

One more subtlety that matters a lot on this chip: **the SecureROM is a mix of ARM and Thumb code ([https://developer.arm.com/documentation/%EE%80%80dui0473/latest/overview-of-the-arm-archi%EE%80%80tecture/arm-and-thumb-instruction-set-ov%EE%80%80erview](https://developer.arm.com/documentation/%EE%80%80dui0473/latest/overview-of-the-arm-archi%EE%80%80tecture/arm-and-thumb-instruction-set-ov%EE%80%80erview)).** A quick primer if the term is new: **Thumb** is ARM's compact 16-bit instruction encoding. It's the same processor and the same registers, just a narrower set of instructions that take half the space, which is why boot ROMs (where every byte counts) lean on it heavily. The core flips between the two states at runtime, and the low bit of a branch target address selects which one (bit 0 = 1 means "decode the destination as Thumb").

Concretely here: the reset path at `0x40` is 32-bit ARM. Almost everything after it is 16-bit Thumb. Ghidra's auto-analysis handles a lot of this via the `BX` / `BLX` transitions, but you'll be flipping individual functions between ARM and Thumb by hand (`Ctrl+Shift+G` --> set the `TMode` context register). If a "function" looks like total garbage, you're decoding Thumb as ARM or vice-versa.

To make this post reproducible without Ghidra, I also disassembled the key regions with [Capstone](https://www.capstone-engine.org/), the little script is at the [end of the post](#appendix-a-reproduce-this-with-capstone). Most of the raw disassembly listings below come straight out of it, where I lean on Ghidra's resolved constants or its decompiler, I'll call it out.

* * *

## 3\. The vector table (0x0 - 0x40)

The first 32 bytes are the ARM exception vectors, eight 32-bit slots, one per CPU exception. On this ROM, seven of them are `LDR PC, [PC, #0x18]` (load the real handler address from a table `0x18` bytes ahead), and the first is a direct branch:

```yaml
0x0000:  b     #0x40              ; Reset  --> jump straight to init
0x0004:  ldr   pc, [pc, #0x18]    ; Undefined Instruction
0x0008:  ldr   pc, [pc, #0x18]    ; Software Interrupt (SVC)
0x000c:  ldr   pc, [pc, #0x18]    ; Prefetch Abort
0x0010:  ldr   pc, [pc, #0x18]    ; Data Abort
0x0014:  ldr   pc, [pc, #0x18]    ; (reserved)
0x0018:  ldr   pc, [pc, #0x18]    ; IRQ
0x001c:  ldr   pc, [pc, #0x18]    ; FIQ
```

And the table those `LDR` s read from, sitting right after at `0x20`:

```rust
Reset          --> 0x00000040
Undefined      --> 0x000055c0
SWI / SVC      --> 0x000055d0
Prefetch Abort --> 0x000055e8
Data Abort     --> 0x0000560c
Reserved       --> 0x00005624
IRQ            --> 0x00005628
FIQ            --> 0x00005638
```

This is already useful intel. Those seven handlers clustered at `0x55c0` - `0x5638` are the exception/panic machinery. When our Part 1 exploit sent the stall trigger and the device "raised an error", *this* is the region of code that fielded the resulting fault. We now have its address. (We'll come back to the panic path in a second, the strings will confirm it.)

> **In Ghidra:** if it hasn't already, mark `0x20` - `0x40` as an array of 8 pointers (`P` on the first word, then `[` for array). Each entry becomes a clickable cross-reference to a handler. Instant map of the CPU's fault surface.

![The exception vector table at 0x0 with Ghidra's auto-created Reset / IRQ / FIQ labels and the handler pointer table at 0x20](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f7532570f892d575.png)

* * *

## 4\. The reset handler (0x40): relocation + BSS zeroing

Following the reset branch to `0x40` lands us in 32-bit ARM. This is the very first code the chip runs on power-on, and it does exactly what a bare-metal reset stub is supposed to do, figure out where it's running, relocate itself to its link address if it isn't already there, copy the data segment, zero the BSS, set up a stack for every CPU mode, and jump into the real firmware. Once Ghidra resolves the literal pool, the constants turn this from a generic stub into a **map of the SecureROM's runtime memory layout**:

```
; --- relocate self to link address 0x0 (skipped here: already at 0x0) ---
0x0040:  cpy   r0, pc                 ; where am I actually running?
0x0044:  ldr   r1, [DAT_00000310]     ; = 0x48
0x0048:  sub   r0, r0, r1             ; r0 = relocation delta (0 on this device)
0x004c:  ldr   r1, [DAT_00000314]     ; = 0x0  (dst = link address)
0x0050:  cmp   r0, r1
0x0054:  beq   0x78                   ; delta == 0? already home, skip the copy
0x005c:  ldr   r2, [DAT_00000318]     ; = 0xB000  (copy length: 44 KB)
0x0060:  ldr   r3, [r0], #4           ; \  copy code to 0x0 (only runs if the ROM
0x0068:  str   r3, [r1], #4           ; /  is loaded elsewhere; a no-op here)
0x006c:  bne   0x60
0x0074:  bx    r1                     ; jump to the copied-out code

; --- copy data segment + zero BSS ---
0x008c:  ldr   r1, [DAT_00000328]     ; = 0x84024000  (data dst)
0x0090:  ldr   r2, [DAT_0000032c]     ; = 0x21C       (data len)
...                                    ; copy 0x21C bytes of .data
0x00a4:  ldr   r0, [DAT_0000031c]     ; = 0x8402421C  (BSS start)
0x00a8:  ldr   r1, [DAT_00000320]     ; = 0x84026000  (BSS end)
0x00b4:  strlt r2, [r0], #4           ; while (start < end) *start++ = 0

; --- set up a stack for every ARM processor mode ---
0x00bc:  mrs   r0, cpsr
0x00c4:  orr   r1, r0, #0x12          ; IRQ mode
0x00cc:  ldr   sp, [DAT_00000330]     ; = 0x84031800
0x00d0:  orr   r1, r0, #0x11          ; FIQ mode  --> sp = 0x84031800
0x00dc:  orr   r1, r0, #0x17          ; Abort mode --> sp = 0x84031800
0x00e8:  orr   r1, r0, #0x1b          ; Undefined mode --> sp = 0x84031800
0x00f4:  orr   r1, r0, #0x13          ; Supervisor (SVC) mode
0x00fc:  ldr   sp, [DAT_00000334]     ; = 0x84034000   <-- remember this number
0x0100:  ldr   r0, [DAT_0000030c]     ; = 0x6EF
0x0108:  bx    r0                      ; jump into securerom_main() (Thumb, 0x6ee)
```

So the ROM relocates itself to its link address (a no-op when it's already running from `0x0`), lays out `.data` at `0x84024000` and `.bss` up to `0x84026000`, gives IRQ/FIQ/Abort/Undefined modes a stack at `0x84031800`, gives **Supervisor (SVC) mode a stack topping out at `0x84034000`**, and finally `bx` es into the main firmware routine at `0x6ee`. That's the whole pre-boot world in ~50 instructions.

![Ghidra listing of reset\_handler at 0x40, with the literal pool resolved: copy length 0xB000, data at 0x84024000, BSS to 0x84026000, and the per-mode stacks](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/82d63a805b5813bd.png)

### The number we typed on faith in Part 1

First, what is a "Supervisor stack"? ARM cores don't run in one flat mode. The processor has several **modes** (User, Supervisor/SVC, IRQ, FIQ, Abort, Undefined, System), and a few of them, including SVC, get their own *banked* stack pointer, a private `SP` that's swapped in automatically when the CPU enters that mode. Supervisor mode is the privileged mode the core boots into and returns to on an `SVC` call, so the "Supervisor stack" is simply wherever `SP` points while the CPU is in SVC mode, the region the reset handler just pointed at `0x84034000`.

Look again at that SVC stack top: **`0x84034000`**. Now recall the single most important constant from the Part 1 exploit, the address we overwrote to hijack the Link Register:

```
EXPLOIT_LR = 0x84033FA4
```

Do the subtraction:

```
0x84034000  (top of the Supervisor stack, set up right here at 0x00fc)
- 0x84033FA4 (EXPLOIT_LR)
= 0x5C       (92 bytes)
```

`EXPLOIT_LR` sits **92 bytes below the top of the SVC stack**, the exact stack this reset handler just created. The USB/DFU code runs in Supervisor mode, so the saved return address (LR) that limera1n corrupts lives *on this stack*. In Part 1 we copied `0x84033FA4` out of `ipwndfu` 's per-chip table and trusted it blindly. Here's the static proof of where that number comes from: it's not magic, it's a slot in the Supervisor stack that the ROM allocates in its very first 50 instructions. Reverse engineering just turned a copied constant into an *understood* one. ❤️

A couple of terms worth unpacking, since this is a study project and I'm reasoning out loud rather than claiming certainty. A **relocation delta** is just the difference between where the code is *actually* executing right now and where it was *built* to run. The `cpy r0, pc` grabs the current address, the `sub` subtracts the expected one, and the leftover is how far off we are, if it's zero the code is already home and the copy loop is skipped. A **sanity check** is the cheap "does this even look right?" test you do before trusting anything: here, if disassembling `0x40` doesn't produce this recognizable relocate-then-zero-BSS shape, then I've almost certainly loaded the file wrong (bad base address, or ARM decoded as Thumb), and I should fix that before reading another line.

The ordering also seems important, though I'm inferring intent from the code rather than from any Apple source: the ROM relocates itself, sets up the stacks, and only *then* (`bx 0x6ee`) jumps into the firmware that brings up USB, crypto, and the heap. If that reading is right, it explains why the exploit can only land *later*, once the DFU loop is live and the allocator is actually running, none of the machinery limera1n abuses exists yet at reset time.

* * *

## 5\. Strings are a treasure map

Before grinding through Thumb functions, dump the strings, they're free labels for half the binary. `strings -a -t x` (offset in hex) on this ROM is unusually rewarding:

```bash
$ strings -a -t x -n 5 bootrom.bin
for
     240 RELEASE
     280 iBoot-359.3.2
    a144 Apple Secure Boot Certification Authority
    a170 Apple Inc.
    a17c Apple Mobile Device (DFU Mode)
    a19c CPID:%04X CPRV:%02X CPFM:%02X SCEP:%02X BDID:%02X ECID:%016llX
    a1dc  SRTG:[
    a1e8 double panic
    a1f8 panic:
    a204 idle task
    a210 <null>
    ae60 0123456789ABCDEF0123456789abcdef
    b0b0 bootstrap
```

Let me pull on a few of these threads.

### 5.1 The banner block (0x200)

```
0x0200  SecureROM for s5l8920xsi, Copyright 2008, Apple Inc.\0
0x0240  RELEASE\0
0x0280  iBoot-359.3.2\0
```

`s5l8920xsi` is the exact SoC (S5L8920 = the 3GS). `RELEASE` is the build variant (vs. a `DEBUG` SecureROM Apple used internally). And `iBoot-359.3.2` is the version string, the same one that showed up in the USB serial in Part 1 (`SRTG:[iBoot-359.3.2]`). That's not a coincidence...

### 5.2 The string that printed our own serial number 🤯

Look at `0xa19c`:

```ruby
CPID:%04X CPRV:%02X CPFM:%02X SCEP:%02X BDID:%02X ECID:%016llX
```

followed immediately by `SRTG:[` and `]` at `0xa1dc`.

**This is the format string that built the DFU serial number we read in Part 1 to identify the chip.** Remember this, from the recon step?

```
CPID:8920 SRTG:[iBoot-359.3.2]
```

`CPID:8920` is how we knew it was a 3GS (S5L8920) and therefore vulnerable to limera1n. We were, without realizing it, reading the output of *this exact `snprintf` -style call inside the ROM we've now dumped.* The USB descriptor strings sit right above it:

```
0xa170  Apple Inc.\0
0xa17c  Apple Mobile Device (DFU Mode)\0
```

Those are the USB manufacturer/product strings your Mac shows when the phone is in DFU. Here's why that matters for finding code. A string on its own is dead data, but a disassembler records every place in the code that *references* an address, its cross-references, or **xrefs**. So if I look up who reads `0xa19c`, I get the exact function that assembles the serial number, and that function lives deep in the code that sets up USB and answers DFU requests.

That's what I mean by "the neighborhood limera1n lives in": the limera1n bug is a heap corruption in how the SecureROM handles USB/DFU transfers, so the vulnerable code sits in that same USB/DFU cluster. Landing on the serial-builder puts me a few function calls away from the bug itself. Walking *backwards* from a recognizable string to its xref, instead of reading 45KB of Thumb top to bottom, is one of the fastest ways to parachute straight into the interesting code.

![The CPID:%04X... serial format string at 0xa19c, with its single XREF pointing at the function that assembles the DFU serial number](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cc52ff05be87d617.png)

### 5.3 The panic path

`double panic`, `panic:` , `idle task`, `<null>` at `0xa1e8` - `0xa210` are the strings the exception handlers we found at `0x55c0` - `0x5638` print. Cross-reference `panic:` and you land right in that cluster, confirming what the vector table already told us.

### 5.4 The trust anchor: an embedded Apple certificate

`0xa144` says `Apple Secure Boot Certification Authority`, and just after it, at `0xa230`, there's a DER-encoded X.509 certificate:

```python
# a DER SEQUENCE is 0x30 0x82 <len_hi> <len_lo>
0xa230:  30 82 03 a3   --> SEQUENCE, length 0x3a3 (931 bytes)
```

with human-readable fields sprinkled through it:

```
a265  Apple Inc.
a27a  Apple Certification Authority
a2a2  Apple Root CA
a4f3  https://www.apple.com/appleca/
a524  Reliance on this certificate by any party assumes acceptance of ...
```

This is a **huge** find for the series. This baked-in certificate is the **root of trust** for the whole boot chain. When the SecureROM loads the next stage (LLB / iBSS), it verifies an RSA signature over an Image3 (`img3`) blob, and the chain of trust terminates *here*, at a certificate physically burned into the chip. This is the thing Apple is protecting: you cannot boot code the ROM can't trace back to this cert.

Which means **this cert, and the code that checks signatures against it, is the target of Part 3.** We're going to find the RSA/SHA-1 verification routine, work out exactly where it decides "signature valid / invalid", and neutralize that decision. For now it's enough to know where the anchor lives: `0xa230`.

![The Apple Secure Boot Certification Authority string and the USB DFU descriptor strings (Apple Inc. / Apple Mobile Device (DFU Mode)), each with an XREF into the code](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4c1e9d32bd71a649.png)

There's also a plain hex lookup table at `0xae60`:

```
0123456789ABCDEF0123456789abcdef
```

That's the alphabet a `hex()` / byte-to-ASCII helper indexes into, the exact thing the `%02X` conversions in the serial string need. Small detail, but finding its xrefs points you straight at the ROM's string-formatting helper.

* * *

## 6\. Meeting an old enemy: the DFU buffer and the heap allocator

Here's the part I was most excited about. In Part 1 we abused a heap overflow **completely blind**, we knew the shape of a heap block only from `ipwndfu` 's constants and pod2g's notes:

```c
struct heap_block {
    uint32_t flags;   // 0x405 = free
    uint32_t size;
    uint32_t prev;    // we overwrote this --> shellcode
    uint32_t next;    // we overwrote this --> LR
};
```

One term first, because the whole exploit hinges on it: a **heap allocator** is the code that hands out dynamic memory on request and takes it back later, the classic `malloc()` / `free()` pair from C. To keep track of what's handed out, an allocator stores bookkeeping, its **metadata**, usually in a small header right before each block: how big it is, whether it's free, and pointers linking it to its neighbors in a free list. The canonical design almost every embedded allocator borrows from is Doug Lea's `dlmalloc`, whose write-up ([A Memory Allocator](https://gee.cs.oswego.edu/dl/html/malloc.html)) explains those headers and free lists in detail. The reason this matters to us: if you can overwrite that metadata, you can trick `free()` into writing an attacker-controlled value to an attacker-controlled address, which is exactly the primitive limera1n uses.

Now we have the actual allocator in front of us. Let's read it instead of guessing.

### 6.1 The DFU buffer allocation (0x34a4)

Our payload's `usb_wait_for_image` (more on that below) calls a function at `0x34a4`. Its opening is unmistakable:

```yaml
0x34a4:  push  {r4, r5, r6, r7, lr}
0x34a6:  mov   r6, fp
...
0x34b4:  movs  r0, #0x80
0x34b6:  movs  r3, #0x32
0x34b8:  lsls  r0, r0, #4          ; r0 = 0x80 << 4 = 0x800   <-- DFU chunk size!
0x34ba:  str   r3, [r6]            ; r3 = 0x32 = 50 (a status/timeout constant)
...
0x34c4:  bl    #0x1aa8             ; malloc(0x800)
0x34c8:  ldr   r3, [pc, #0xe8]
0x34ca:  str   r0, [r3]            ; stash the buffer pointer in a global
0x34cc:  cmp   r0, #0
0x34ce:  beq   #0x359c             ; bail if allocation failed
```

That `0x800` is the **exact** DFU transfer chunk size we streamed data in during Part 1 (`chunk = data[idx:idx+0x800]`). So `0x34a4` sets up the DFU transfer buffer by calling the real allocator at **`0x1aa8`** with size `0x800`. We just found `malloc`.

### 6.2 The allocator (0x1aa8) and the free-side validation (0x1fa8)

`0x1f80` is a small wrapper that allocates a `0x18` -byte object and initializes it:

```yaml
0x1f80:  push  {r4, r5, r6, r7, lr}
0x1f88:  movs  r0, #0x18           ; malloc(0x18), a 24-byte descriptor
0x1f8a:  movs  r1, #0
0x1f8e:  bl    #0x1aa8             ; <- the real allocator again
0x1f92:  cmp   r0, #0
0x1f94:  beq   #0x1fa2
0x1f96:  ldr   r3, [pc, #0xc]
0x1f98:  str   r4, [r0]            ; obj->field_0 = ...
0x1f9a:  str   r4, [r0, #4]        ; obj->field_4 = ...
0x1f9c:  str   r3, [r0, #0xc]      ; obj->field_c = <magic/tag>   <-- note offset 0xc
0x1f9e:  str   r5, [r0, #0x10]
0x1fa0:  str   r6, [r0, #0x14]
0x1fa2:  pop   {r4, r5, r6, r7, pc}
```

And right after it, the free / release path at `0x1fa8`:

```yaml
0x1fa8:  push  {r7, lr}
0x1faa:  ldr   r2, [r0, #0xc]      ; read obj->field_c  <-- same offset 0xc
0x1fac:  ldr   r3, [pc, #0xc]      ; load the expected magic
0x1fae:  add   r7, sp, #0
0x1fb0:  cmp   r2, r3              ; block->tag == expected?
0x1fb2:  bne   #0x1fb8             ; mismatch --> skip the real free
0x1fb4:  bl    #0x1ccc             ; the actual free()
0x1fb8:  pop   {r7, pc}
```

Decompiled, that whole function is four lines, and the "known-good constant" has a name:

```c
longlong free_validated(int block, undefined4 param_2)
{
    if ( *(int *)(block + 0xc) == 0x4d656d7a )   // 0x4d656d7a == 'Memz'
        free(block, param_2);
    return ...;
}
```

`0x4D656D7A` is ASCII **`Memz`** (stored little-endian in the ROM as the bytes `7a 6d 65 4d`). It's a **magic canary**: the wrapper at `0x1f80` stamps it into the 0x18-byte descriptor objects it hands out, and `0x1fa8` won't release one unless the canary still matches. Sitting right next to it in the literal pool is `0x696D6733` = **`img3`**, the magic for Apple's signed-image container, a good hint that these descriptors describe images. Confirmation that offset `0xc` is the magic and not a pointer: `0x1f80` *writes* the same value with `str r3, [r0, #0xc]`. One function stamps `Memz`, the other checks it.

![Ghidra decompiler view of free\_validated: if (\*(int \*)(param\_1 + 0xc) == HEAP\_BLOCK\_MAGIC) free(...), with the constant renamed to HEAP\_BLOCK\_MAGIC ('Memz')](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6fdaf42c99be877b.png)

Here's the part I had to slow down on. `0x1fa8` is not the general `free`. It's a *descriptor* free, gated by `Memz`, that then calls the real `free` at `0x1ccc`. In the DFU loop above it's only ever called on the objects `0x1f80` returns: the 0x18-byte image descriptors, already stamped with `Memz`. The chunk limera1n forges is a plain heap block, not one of those descriptors, so its `free` has to go through the unguarded `0x1ccc`: if it ever hit the `Memz` `cmp` at `0x1fb0` it would be rejected and the unlink would never fire. (The check reads `[user_ptr + 0xc]`; the spray forges the `fd` / `bk` links at `[user_ptr + 0]` / `[user_ptr + 4]` to steer the unlink, and never puts `Memz` where the check looks, so the forged chunk can't pass it.) The attack works precisely because the corrupted chunk's free does *not* pass through this check. That's the real shape of the bug: a validated free exists in the ROM, but it guards the wrong object, and the DFU buffer is released through the unvalidated path, which is the door limera1n walks through.

In other words: **Part 1 was us punching this allocator in the dark. Part 2 is us turning the lights on and finding the door we actually used.** In a later post I want to trace the full `malloc` / `free` at `0x1aa8` / `0x1ccc`, recover the real header layout field by field, and line it up against the sprayed values, a proper autopsy of the bug now that we can read the victim.

* * *

## 7\. Reading our own exploit's landing pad: usb_wait_for_image (0x8b7)

Full-circle moment. In Part 1, the last thing our 76-byte payload did was call an address we treated as a magic number:

```armasm
.set RET_ADDR, 0x8b7          @ usb_wait_for_image on 3GS SecureROM 359.3.2
    ...
    LDR  R3, =RET_ADDR
    BLX  R3                    @ hand control back to the ROM's USB loop
```

We called `0x8b7` on faith, pod2g's notes said "this re-arms USB so the Mac can `DFU_UPLOAD` your buffer," and it worked. Now we can actually read it. (The `+1` makes it Thumb, so the function starts at `0x8b6`.)

```yaml
0x08b6:  bl    #0x34a4            ; set up the DFU transfer buffer (section 6.1!)
0x08ba:  cmp   r0, #0
0x08bc:  blt   #0x8e6            ; error path if setup failed
0x08be:  mov   sl, r0
0x08c0:  movs  r0, #0x84
0x08c2:  lsls  r0, r0, #0x18      ; r0 = 0x84 << 24 = 0x84000000   <-- our SRAM base!
0x08c4:  mov   r1, sl
0x08c6:  movs  r2, #0
0x08c8:  bl    #0x1f80            ; wrap the buffer in a descriptor (section 6.2)
0x08cc:  adds  r5, r0, #0
0x08d0:  beq   #0x8e6
0x08d2:  movs  r1, #0x84
0x08d6:  lsls  r1, r1, #0x18      ; 0x84000000 again
0x08da:  mov   r2, sl
0x08dc:  bl    #0x6b8             ; register / kick off the USB transfer
0x08e2:  bl    #0x1fa8            ; release descriptor (the validated free!)
...
0x08f6:  b     #0x7d4             ; back into the DFU command loop
```

Everything lines up with what actually happened on the wire in Part 1:

-   `bl 0x34a4`, allocates the `0x800` DFU buffer.
-   `movs r0,#0x84, lsls r0,#0x18`, materializes **`0x84000000`**, the SRAM address our payload had `memcpy` 'd the ROM to. This function points the USB machinery at that buffer.
-   `bl 0x1f80` / `bl 0x1fa8`, the allocator wrapper and validated-free we just reverse engineered.
-   `b 0x7d4`, jumps back into the main DFU request loop, which is why, after our shellcode returned here, the Mac could immediately issue `DFU_UPLOAD (0xA1/2)` and stream 65536 bytes out. That's the dump.

So the "magic number" `0x8b7` was the ROM's own *"(re)initialize the USB image transfer path"* routine. We borrowed Apple's USB stack to exfiltrate Apple's ROM. 🙂

Step back from `0x8b6` and the shape of the whole thing appears. `0x8b6` isn't its own function, it's one branch of the SecureROM's main DFU service loop (`FUN_000006ee` at `0x6ee`, the `bx 0x6ef` target from the reset handler): an infinite `do { } while (true)` that never returns. Each pass waits for a USB control request and dispatches on it. Reconstructed from the decompiler (the `req` numbers are the ROM's internal command enum, not the USB `bRequest` values):

```c
void securerom_main(void)                    // never returns
{
  ...
  do {
    req = dfu_get_request();                 // wait for a USB control request
    if (req == 2) {                          // DFU_DNLOAD: host sends an image
        // FUN_00004e18 receives into 0x84000000 (4 endpoints x 0x200),
        // 0x1f80 wraps it in a descriptor, then FUN_000006b8 validates+loads it
    }
    else if (req == 3) {                     // DFU_UPLOAD: host reads device memory
        size = dfu_buffer_setup(0x84000000, size);   // 0x34a4, alloc the 0x800 buffer
        desc = heap_alloc_desc(0x84000000, size, 0); // 0x1f80
        usb_start_transfer(desc, 0x84000000, size);  // expose 0x84000000 to host
        //  *** this is the branch that streamed our 65536-byte dump to the Mac ***
        //  *** our payload re-enters here at 0x8b6 (RET_ADDR 0x8b7)            ***
    }
    else if (req == 1) {                     // third command -- see caveat below
        // looks up a named entry in a registry (FUN_00001350) and loads it;
        // NOT confirmed as DFU_GETSTATUS
    }
  } while (true);
}
```

The `req == 3` (UPLOAD) branch is the one our Part 1 dump actually rode: `0x34a4` points the USB machinery at `0x84000000` so the host can read it back, exactly what our Mac's `DFU_UPLOAD (0xA1/2)` requests pulled down. That's also the branch our payload jumps back into at `0x8b6`. The `req == 2` (DNLOAD) branch is where the host sends an image and the ROM receives it into `0x84000000`.

Two caveats I'd rather flag than paper over, because the rest of this section leans on them:

-   **`req == 1` is not a clean fit for DFU_GETSTATUS.** Standard DFU `GETSTATUS` just returns a 6-byte status struct, but this branch looks up a named entry in a linked-list registry (`FUN_00001350`, comparing a global name string) and then runs the same load path as the other two. It may be a vendor command or the state-advance step, but I haven't proven the numbering. `FUN_000046ec` dispatches the USB `bRequest` through a jumptable Ghidra couldn't recover, so the internal `req` values are inferred from behavior, not read off the spec.
    
-   **The signature check is not specific to `req == 2`.** All three load paths funnel through `FUN_000006b8`, which calls `FUN_00001f00` (it gates on the descriptor's type tag at `+0xc` being `Memz` or `img3`) and then `FUN_000024dc`, a 728-byte `img3` container parser that checks the image starts with the `img3` magic and is where the real signature/certificate verification lives. That shared verifier, not any single DFU branch, is what Part 3 will attack.
    

![Ghidra decompiler view of usb\_wait\_for\_image, showing the 0x84000000 constant and the calls to dfu\_buffer\_setup, heap\_alloc\_desc, usb\_start\_transfer, and free\_validated](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/07aa1528c57dea81.png)

* * *

## 8\. The map so far

Putting the confirmed pieces together, here's the working memory map of the 3GS SecureROM 359.3.2 after this session:

```sql
Offset        What                                  How I know
------------------------------------------------------------------------------
0x0000-0x001f Exception vector table (ARM)          disassembly: B / LDR PC
0x0020-0x003f Handler address table                 8 absolute pointers
0x0040-~0x1ff Reset / relocation / BSS clear (ARM)   MOV R0,PC + copy loop
0x0200        "SecureROM for s5l8920xsi ... 2008"    banner string
0x0240        "RELEASE"                             build variant
0x0280        "iBoot-359.3.2"                       version (matches SRTG)
0x06ee        securerom_main (firmware entry)       bx target from reset_handler
~0x06xx+      Thumb code region begins              BX/BLX into Thumb
0x06b8        image load: validate + execute         shared by all DFU load branches
0x08b6        usb_wait_for_image (our RET_ADDR!)     payload target 0x8b7
0x1aa8        malloc (general allocator)            called with size in r0
0x1ccc        free (general release + unlink)        the unguarded path limera1n rides
0x1f00        image type gate (Memz / img3 @+0xc)    -> FUN_000024dc
0x1f80        alloc+init 0x18-byte descriptor       stamps Memz at +0xc
0x1fa8        validated free (checks Memz at +0xc)   descriptor free, NOT the exploited path
0x24dc        img3 parser + sig verify (728 B)       Part 3 target, reached via 0x6b8
0x34a4        DFU upload-buffer setup (0x800)        chunk size == Part 1
0x55c0-0x5638 Exception / panic handlers            vector table + "panic:"
0xa144        "Apple Secure Boot Certification..."   string
0xa170        USB DFU descriptor strings            "Apple Mobile Device (DFU Mode)"
0xa19c        DFU serial format string              "CPID:%04X ... ECID:%016llX"
0xa230        Embedded Apple Root CA cert (931 B)    DER 30 82 03 a3
0xae60        hex digit table                       "0123...ABCDEF0123...abcdef"
0xb0b0        "bootstrap"                           string
0xb218        last non-zero byte                    ~45KB used, rest is padding
```

And the runtime **SRAM layout** the reset handler builds before the firmware even starts (these are the live addresses, not ROM offsets, recovered from the resolved literal pool in section 4):

```
0x84024000            .data segment (0x21C bytes copied here)
0x8402421C-0x84026000 .bss (zeroed)
0x84031800            IRQ / FIQ / Abort / Undefined mode stacks
0x84034000            Supervisor (SVC) mode stack top
  0x84033FA4          <-- EXPLOIT_LR: 0x5C below the SVC stack top (Part 1)
```

Not bad for a binary that had no header, no symbols, and no ground truth except a few community-documented addresses. Every row above I either disassembled or xref'd out of *my own dump*, and each one is a labeled anchor to keep working from in Ghidra. The single best payoff: `EXPLOIT_LR` stopped being a number copied from someone else's tool and became a slot in a stack we watched the ROM allocate.

![Ghidra Symbol Tree after this session, with the renamed functions: reset\_handler, malloc, free, heap\_alloc\_desc, dfu\_buffer\_setup, usb\_start\_transfer, usb\_wait\_for\_image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d99d37188474b9f5.png)

* * *

## 9\. What's next (Part 3)

We now understand the terrain:

-   how the chip boots (`0x0` --> reset `0x40` --> relocate --> Thumb world),
-   where it talks USB (the DFU loop around `0x7d4`, `usb_wait_for_image` at `0x8b6`),
-   how it manages memory (the allocator at `0x1aa8` / `0x1ccc`, and the `Memz` heap canary on the descriptor free at `0x1fa8` that limera1n sidesteps by corrupting a buffer freed through the unguarded `0x1ccc`), and
-   **where its root of trust lives** (the Apple Root CA at `0xa230`).

**Part 3: Bypassing the Boot Chain** is where this gets offensive again. The plan:

1.  Trace into the Image3 (`img3`) parser we already located (`FUN_000024dc`, §7) to find the RSA/SHA-1 signature verification routine that validates the next boot stage against the `0xa230` certificate.
2.  Locate the single branch where "signature valid?" becomes a yes/no decision.
3.  Patch it, in memory, live, right after the limera1n exploit hands us execution, so the ROM happily accepts a stage *we* signed (i.e. didn't).

That's the difference between "I can read Apple's boot code" and "I can make the device boot my code." See you there. ❤️

* * *

## Appendix A: reproduce this with Capstone

No Ghidra required to follow along with the raw disassembly in this post. Most of those listings came out of this (the decompiler views and resolved constants are Ghidra's, as flagged inline):

```python
#!/usr/bin/env python3
# pip3 install capstone
import struct
from capstone import *

d = open('bootrom.bin', 'rb').read()
u32 = lambda o: struct.unpack('<I', d[o:o+4])[0]

arm   = Cs(CS_ARCH_ARM, CS_MODE_ARM)     # for 0x0..~0x1ff
thumb = Cs(CS_ARCH_ARM, CS_MODE_THUMB)   # for almost everything else

def show(md, start, length, label):
    print(f"--- {label} @ 0x{start:x} ---")
    for i in md.disasm(d[start:start+length], start):
        print(f"  0x{i.address:04x}:  {i.mnemonic} {i.op_str}")

# 1. vector table + handler pointers
show(arm, 0x0, 0x20, "vector table (ARM)")
for n, name in enumerate(['Reset','Undef','SWI','PAbort','DAbort',
                          'Reserved','IRQ','FIQ']):
    print(f"  {name:10s} --> 0x{u32(0x20 + n*4):08x}")

# 2. reset handler
show(arm, 0x40, 0x80, "reset / init (ARM)")

# 3. the functions our Part 1 exploit touched (all Thumb --> even address)
show(thumb, 0x8b6,  0x50, "usb_wait_for_image (payload RET_ADDR 0x8b7)")
show(thumb, 0x34a4, 0x30, "DFU buffer setup (0x800 chunk)")
show(thumb, 0x1f80, 0x30, "alloc+init descriptor")
show(thumb, 0x1fa8, 0x20, "validated free (reads block[0xc])")
```

## Appendix B: seeding Ghidra (why the landing pad needs a nudge)

One workflow gotcha worth documenting. The reset handler enters the main firmware through an *indirect* branch (`ldr r0, [=0x6ef]; bx r0`), and everything from there is Thumb. `0x8b6` isn't a routine of its own, it lives inside `securerom_main`, the ~540-byte function at `0x6ee` (`FUN_000006ee`, spanning `0x6ee` - `0x90a`) that the reset handler jumps to. Depending on your analysis options, that region can come out under-analyzed, and even when Ghidra does recover the big function, the exact spot our payload lands on (`0x8b6`) has no name of its own, which makes it a pain to decompile in isolation.

I made this reproducible with a tiny Ghidra pre-script (`SeedDisasm.py`): it pins ARM mode on the vector table at `0x0`, disassembles Thumb at `0x8B7`, and carves out a named `usb_wait_for_image` function at `0x8b6` so the landing pad decompiles on its own:

```python
# Ghidra pre-script, run before Auto Analyze
from ghidra.app.cmd.disassemble import ArmDisassembleCommand
from ghidra.program.model.address import AddressSet
from ghidra.program.model.symbol import SourceType

space = currentProgram.getAddressFactory().getDefaultAddressSpace()

def seed(off, thumb, name=None):
    addr = space.getAddress(off & ~1)          # instructions live at even addrs
    ArmDisassembleCommand(addr, AddressSet(addr), thumb).applyTo(currentProgram, monitor)
    if name:
        fn = getFunctionAt(addr) or createFunction(addr, name)
        if fn: fn.setName(name, SourceType.USER_DEFINED)

seed(0x0,   False)                              # ARM vector table
seed(0x8B7, True, "usb_wait_for_image")         # Thumb; low bit = Thumb, entry is 0x8b6
```

Two Jython foot-guns cost me a few minutes each: the file needs a `# -*- coding: utf-8 -*-` line if any comment has a non-ASCII character (an em-dash did it), and `ArmDisassembleCommand` is the clean way to set Thumb mode, the generic `DisassembleCommand` wants you to poke the `TMode` register with a `java.math.BigInteger`, which is a hassle.

![Adding the script directory in Ghidra's Bundle Manager, and SeedDisasm.py printing "seeded ARM@0x0, Thumb@0x8B7"](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/15188549592f91ce.png)

## Appendix C: references

-   **ipwndfu** (axi0mX), [https://github.com/axi0mX/ipwndfu](https://github.com/axi0mX/ipwndfu), reference limera1n sequence and the per-chip constants.
-   **The iPhone Wiki - S5L8920 / SecureROM**, [https://www.theiphonewiki.com/wiki/S5L8920](https://www.theiphonewiki.com/wiki/S5L8920), community notes on the 3GS ROM.
-   **Ghidra**, [https://ghidra-sre.org/](https://ghidra-sre.org/), the ARM/Thumb disassembler used here.
-   **Capstone**, [https://www.capstone-engine.org/](https://www.capstone-engine.org/), the scriptable disassembler behind the listings.
