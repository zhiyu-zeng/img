---
title: A Hacker's Guide to ARM Tracing - ETM, ITM, and the TPIU - VoidStar Security Blog
source: https://voidstarsec.com/blog/arm-tracing-etm-itm
source_host: voidstarsec.com
clip_date: 2026-09-29T22:46:48+08:00
trace_id: 28234182-4bd7-4428-9627-c04a166b547d
content_hash: 19f1fd5fb1430b70de1490eccd175425a84a433bf427581721b04bb6a10468d7
status: synced
tags:
  - 硬件逆向
  - 安全工具
series: null
feed_source: VoidStar·硬件逆向
ai_summary: ARM 内核自带 ETM/ITM/TPIU 跟踪外设，只需 PB3 单脚 SWO 输出，配合 OpenOCD 配置与廉价逻辑分析仪 + Pulseview，即可在不停机的前提下抓取 Xbox One 手柄固件的实时指令流。
ai_summary_style: key-points
images_status:
  total: 25
  succeeded: 23
  failed_urls:
    - https://wrongbaud.github.io/assets/img/xbox-controller/controller_board.jpg
    - https://voidstarsec.com/blog/assets/images/arm-tracing-etm-itm/destroyed-pcb.jpg
notion_page_id: 3ea75244-d011-8105-a1eb-d3bb86e43ad8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> ARM 内核自带 ETM/ITM/TPIU 跟踪外设，只需 PB3 单脚 SWO 输出，配合 OpenOCD 配置与廉价逻辑分析仪 + Pulseview，即可在不停机的前提下抓取 Xbox One 手柄固件的实时指令流。
> 
> - **核心分工：** ETM 产生压缩的指令流（只记录分支/异常/同步点，需对照固件回放）；ITM 供软件主动推送数据（即 SWO printf）；DWT 做数据/地址/周期比较器；TPIU 负责打包带上 Trace ID 并从引脚输出。
> - **关键寄存器与参数：** 先置 `DBGMCU_CR` 的 TRACE_IOEN、`DEMCR` 的 TRCENA；`TPIU_SPPR=2` 选异步 UART、`TPIU_FFCR=0x102` 开启帧化；波特率 = HCLK/(ACPR+1)，默认 16MHz、ACPR=3 得 4 Mbaud。ETM 需先写解锁魔数 `0xC5ACCE55` 到 LAR，首尾两次写 CR 之间完成配置。
> - **采集链路：** Pulseview 中用 UART 解码器（RX=D0，4 Mbaud）叠在 ETM 解码器之下；采样 24 MHz（6 倍过采样），D0 下降沿触发、25% 预触发。OpenOCD 侧顺序为 reset halt → 武装采集 → resume。
> - **两处失败原因：** 固件配置 PLL 拉高 HCLK，使 SWO 波特率突增导致解码错位；随后 PB3 被改作 I2C2_SDA 连接 AK4951 音频编解码器，线上已无 trace 数据。
> - **修复手段：** 把 ACPR 提到 31 压低波特率，并在 PLL 之后下硬件断点 `bp 0x80001fa 2 hw`；或直接 NOP（Thumb `0xBF00`）掉重配 GPIO 与初始化 I2C2 的调用。另有免刷机方案：直接改写 `0x40020400` 起 GPIOB 寄存器恢复 SWO 复用，并把 ACPR 写为 15。Ghidra 加载 `0x8000000` 镜像并用 SVD-Loader 生成外设结构，可大幅提速分析。

## Overview

Throughout the years with this blog we've covered various hardware debug peripherals and how to discover and instrument them. We've seen a number of [different](https://voidstarsec.com/blog/xbox-swd) SWD [interfaces](https://voidstarsec.com/blog/brushing-up-part-3) and looked at quite a [few](https://voidstarsec.com/blog/jtag-pifex) JTAG [taps](https://voidstarsec.com/blog/jtag-ssd). With all of these posts we typically stop at firmware extraction without digging deeper into the hardware debug peripherals that are available. One of the common questions that I get in courses after we get JTAG or SWD working on an undocumented target is "OK, now what?". This post will hopefully help shed some life on other internal debug peripherals that are available on ARM targets. We've shown that we can single-step through firmware with an OpenOCD connection, but what if we wanted a live trace of a firmware executing without having to interrupt it?

That is exactly what the ARM trace peripherals were built for. Modern ARM cores contain CoreSight components that can stream out a compressed, real-time record of program execution. Developers use this to track down runaway code, timing bugs, and performance problems. From a reverse engineer's perspective it can also provide a ton of useful information including a cycle-accurate log of what the firmware actually did, without needing to set breakpoints or interrupt program flow. In my experience, these tools are often leveraged by developers with boards that have full SWO support, as well as vendor specific hardware for decoding the traces. As a reverse engineer, we are not often granted such a luxury, so in this post we'll talk about how to configure and communicate with the ARM trace peripherals using low cost hardware and open source software!

In this post, we'll take a real target - the STM32F401-based Xbox One controller I've used in previous [blog posts](https://voidstarsec.com/blog/xbox-swd) - and do the following:

1.  Review the CoreSight trace components: the **ETM**, the **ITM**, and the **TPIU**
2.  Locate the single pin we need to physically tap on the target
3.  Configure the TPIU and ETM entirely from an OpenOCD config file
4.  Capture the resulting trace with a cheap logic analyzer and decode it in Pulseview
5.  Use Ghidra to diagnose (and eventually fix) why our trace keeps falling apart

## Goals

With this blog post, we will aim to cover the following:

-   Explain what the ETM, ITM, TPIU, and DWT each do and how they fit together
-   Write an OpenOCD config file that enables instruction tracing on an STM32
-   Capture Serial Wire Output (SWO) trace data with a logic analyzer instead of an expensive trace probe
-   Recognize when your trace has desynchronized or is generating garbled output

## Target

For this post we're going to revisit an older target that long time readers might recognize. The target for this post will be a third party Xbox One controller that we have reviewed previously for the purposes of firmware extraction via SWD. For a detailed hardware breakdown check out our previous post [here](https://voidstarsec.com/blog/xbox-swd). This post was fairly straightforward, we found a debug port and leveraged OpenOCD to identify an unmarked microcontroller. Using the data that we were able to read out of the MCU, we were able to identify the microcontroller and write an OpenOCD config file that allowed us to extract the firmware.

![⚠️ 图片托管失败 · Xbox controller board from the previous teardown](https://wrongbaud.github.io/assets/img/xbox-controller/controller_board.jpg) In this post, we're going to dive deeper into this target and see if we can enable and configure the internal trace hardware to get an instruction trace as the target firmware is running. As you can imagine, things like this are especially useful when performing fault injection attacks or differential power analysis (which we'll get into in our next post!)

Next lets talk about the various components that allow us to gather instruction traces from this target.

* * *

## The Trace Components: A Brief Tour

ARM's on-chip debug and trace infrastructure lives under the **CoreSight** umbrella. It is a massive specification with a lot of optional pieces, but for our purposes there are four blocks that matter. The good news is the specification is public, the bad news is it is spread across at least three separate reference manuals, and we'll be hopping between them constantly.

![ARM CoreSight trace architecture overview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9493feb0b006c45a.png)

There are four main components that we need to learn about before we attempt to configure the trace peripheral.

**ETM (Embedded Trace Macrocell)** - The ETM watches the processor's execution and emits an *instruction trace*: a compressed stream describing which instructions were executed, whether branches were taken, and where the program counter went. Critically, it does not send every instruction byte. Instead it sends a highly compressed stream that only tells you about the things it *can't* predict (branches, exceptions, and periodic synchronization points). To reconstruct the full execution path, you replay that stream against a copy of the firmware.

**ITM (Instrumentation Trace Macrocell)** - The ITM is similar to the ETM. Rather than tracing instructions automatically, it lets the software push data out to the trace port. If you've ever used ARM's SWO `printf` retargeting, that's the ITM.

![Example ITM instrumentation trace output](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d44140300b7a92cc.png)

**DWT (Data Watchpoint and Trace)** - The DWT contains four comparators that can watch for a particular data address, instruction address, data value, or (on comparator 0) a cycle count. It generates debug events and can sample data, and it works alongside the ETM and ITM to produce data traces and profiling counters.

**TPIU (Trace Port Interface Unit)** - The ETM and ITM generate trace data, but something has to get it out of the target device. The TPIU takes the internal trace streams, formats them, optionally tags them with source IDs and timestamps, and drives them out of a physical pin. The TPIU is what turns the internal trace bus into a signal we can observe and analyze.

So the basic overview is, the **ETM/ITM produce** the data, the **TPIU packages and outputs** it, and we sit on the outside with a capture device trying to catch and decode it.

### Where does the data go? (Sinks)

The trace components can generate a large amount of data, so ARM defines several kinds of *sink* to absorb it:

-   An **Embedded Trace FIFO (ETF/ETB)** - an on-chip buffer you read back later
-   A parallel **Trace Port** via the TPIU - fast, but needs a bunch of dedicated pins
-   The **Serial Wire Output (SWO)** - a single pin, trace data shipped out asynchronously as UART-framed bytes

On our STM32F401 there's no on-chip trace buffer and no wide parallel trace port broken out, so we're going to use the SWO path. That's great news for us, because SWO is a single pin running plain asynchronous serial - which means we don't need a fancy trace probe. We can capture it with a logic analyzer.

**Note:** This is the whole reason this technique is accessible. The "correct" way to capture ARM traces is with something like an ARM ULINKPRO-D, a Lauterbach, or an IAR I-jet Trace - all of which are excellent and all of which cost more than my car did in college. Because our target routes trace out over single-wire SWO as async UART, a $10 logic analyzer and Pulseview will do the job.

* * *

## The Target: Finding Our One Pin

Our target is an Xbox One controller built around an STM32F401. According to the datasheet (page 809 of `stm32f401-ref.pdf`), this part contains the full CoreSight lineup - SWJ-DP, AHB-AP, ITM, FPB, DWT, TPIU, and ETM - so everything we need is on board.

![STM32F401 debug and trace components listed in the datasheet](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8331b33fe7a4dfcc.png)

The datasheet also tells us that when the TPIU is configured for asynchronous SWO output, the trace data comes out on pin **PB3**. So our first step is to get a probe onto PB3.

Now, if you've ever cracked one of these open, you'll know the main CPU is buried under a blob of epoxy, and PB3 is not exactly labeled with a friendly silkscreen arrow.

![⚠️ 图片托管失败 · Xbox controller PCB with the epoxy-covered main CPU](https://voidstarsec.com/blog/assets/images/arm-tracing-etm-itm/destroyed-pcb.jpg)

After removing the MCU and the epoxy, using a multimeter we were able to see that the PB3 pin was connected to R15 on the board.

**RE Tip:** Any time you have a working debug interface, you can potentially leverage that into a pin-hunting tool. Toggle a GPIO from OpenOCD and probe around with a scope or logic analyzer to correlate a firmware-controlled pin to a physical location on the PCB. It beats guessing, and it beats grinding epoxy. It should be noted that you typically will need a datasheet to understand exactly which registers to poke in order to toggle the GPIO, luckily for us in this case we had one.

So we've found our potential output pin, now we have to figure out the following:

| Step | Status |
| --- | --- |
| Locate the PB3 pin | Connected to R15 |
| Configure and enable the TPIU | ??? |
| Configure and enable the ETM | ??? |
| Capture and decode data on PB3 | ??? |

In the next section, we'll go over configuring the TPIU

* * *

## Configuring the TPIU

Remember, the TPIU is responsible for *outputting* the trace, so we configure it first. We're telling it, in effect: "take whatever the ETM hands you, frame it, and shove it out the SWO pin as 4 Mbaud async serial."

Configuring these peripherals is a series of memory-mapped register writes, and we can do that via OpenOCD `mww` (memory-write-word). The registers we care about are scattered across the STM32F401 reference manual (I'll call it document A) and the ARMv7-M Architecture Reference Manual (document B):

| Register | Address | Purpose |
| --- | --- | --- |
| `DBGMCU_CR` | `0xe0042004` | Debug MCU config - assigns the TRACE I/O pins |
| `COREDEBUG_DEMCR` | `0xe000edfc` | Sets `TRCENA` to power up the trace subsystem |
| `TPIU_CPSR` | `0xe0040004` | Current Port Size Register |
| `TPIU_ACPR` | `0xe0040010` | Async Clock Prescaler - this sets our baud rate |
| `TPIU_SPPR` | `0xe00400f0` | Selected Pin Protocol - sync vs. async (UART) |
| `TPIU_FFCR` | `0xe0040304` | Formatter and Flush Control |

The reference manual (page 837 of document A) hands us a recommended power-on sequence, which we can translate directly into OpenOCD script. First we declare our register addresses as variables:

```python
# Debug MCU configuration register
set DBGMCU_CR            0xe0042004
# Debug Exception and Monitor Control Register
set COREDEBUG_DEMCR     0xe000edfc
# TPIU Current Port Size Selection Register
set TPIU_CPSR           0xe0040004
# TPIU Asynchronous Clock Prescaler Register
set TPIU_ACPR           0xe0040010
# TPIU Selected Pin Protocol Register
set TPIU_SPPR           0xe00400f0
# Formatter and flush control register
set TPIU_FFCR           0xe0040304
```

And then we perform the writes. The `setbits` macro is a small helper (a read-modify-write) included with the example config; `mww` just clobbers the whole word:

```php
init
reset halt
# TRACE_IOEN = 1, TRACE_MODE = 0 -> asynchronous tracing on TRACESWO
setbits $DBGMCU_CR 0x20                 ;# Enable the trace IO pins
# Set TRCENA in DEMCR to enable access to the trace registers
setbits $COREDEBUG_DEMCR 0x1000000
# Current port size
mww $TPIU_CPSR 1
# Async clock prescaler: trace clock = HCLK / (x + 1)
mww $TPIU_ACPR 3
# Pin protocol: 0 = sync, 1 = NRZ, 2 = USART/async
mww $TPIU_SPPR 2
# Formatter and flush control: 0x102 enables TPIU framing
mww $TPIU_FFCR 0x102
```

There are a few important things here that we should pay attention to, as they took up a log of debugging time:

`TPIU_SPPR` set to `2` selects the async (UART-style) pin protocol - that's what lets us treat SWO as a standard serial line.

`TPIU_ACPR` is another important one that cost me many hours of tinkering. It's a clock *divider*: the trace baud rate is `HCLK / (ACPR + 1)`. With the STM32F401 running at its default 16 MHz `HCLK` and an `ACPR` of `3`, we get `16 MHz / 4 = 4 MHz`, i.e. a 4 Mbaud SWO stream. It is important to remember that the trace clock is *derived from the core clock*. If the firmware reconfigures the PLL and speeds up `HCLK` while we're mid-capture, our carefully chosen baud rate is suddenly wrong, and without ground truth on what the instruction trace should look like, it is very easy to get lost.

![DEMCR register layout from the ARMv7-M reference manual](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bd340b217e83ffd2.png)

With that, the TPIU is configured. We've told the chip *how* to output trace data - now we need to tell it *what* to output.

* * *

## Configuring the ETM

The ETM configuration follows the same pattern, but the ETM is locked by default. You have to write a magic value to a lock register before it'll accept configuration. The relevant registers (from STM32401 reference manual and the ETM Architecture Specification) are:

| Register | Address | Purpose |
| --- | --- | --- |
| `ETM_LAR` | `0xe0041fb0` | Lock Access Register - unlock write access |
| `ETM_CR` | `0xe0041000` | Main Control Register |
| `ETM_TRACEIDR` | `0xe0041200` | Trace ID - the source ID stamped on our stream |
| `ETM_TER` | `0xe0041008` | Trigger Event Register |
| `ETM_TEE` | `0xe0041020` | Trace Enable Event Register |
| `ETM_TSSR` | `0xe0041024` | Trace Start/Stop Register |

The unlock value is a constant you'll come to recognize across ARM CoreSight components: `0xC5ACCE55` (read it as "CoreSight ACCESS"). Here's the configuration sequence:

```bash
set ETM_LAR             0xe0041fb0
set ETM_CR              0xe0041000
set ETM_TRACEIDR        0xe0041200
set ETM_TSSR            0xe0041024
set ETM_TER             0xe0041008
set ETM_TEE             0xe0041020

# Unlock write access to the ETM
mww $ETM_LAR 0xC5ACCE55
# Configure the trace (programming bit set)
mww $ETM_CR 0x00201d0e
# Trace bus ID = 1
mww $ETM_TRACEIDR 1
# Trigger event
mww $ETM_TER 0x0000406F
# Trace enable event
mww $ETM_TEE 0x0000006F
# Trace start/stop - enable the trace
mww $ETM_TSSR 0x00000001
# Control register - end of configuration
mww $ETM_CR 0x0000191E
```

Note that our configuration is contained between two writes to `ETM_CR`, the first sets the ETM's programming bit so it'll accept configuration, and the last clears it to begin the trace. The `ETM_TRACEIDR` value of `1` matters when we get to decoding - the TPIU stamps every trace packet with this source ID, so our decoder needs to know to look for stream `1`.

**Note:** The exact bit meanings in `ETM_CR`, `ETM_TER` are documented in the ETM Architecture Specification. For getting a first trace up, the datasheet-recommended values above are a fine starting point.

Two down:

| Step | Status |
| --- | --- |
| Locate the PB3 pin | Connected to R15 |
| Configure and enable the TPIU | Done |
| Configure and enable the ETM | Done |
| Capture and decode data on PB3 | ??? |

Alright, so at this point we've configured our ETM and TPIU to capture trace data and output it via the SWO line. Now we need a way to capture and decode it.

* * *

## Capturing the Trace in Pulseview

We have OpenOCD ready to configure the trace peripherals, and a logic analyzer probe soldered to PB3 (via R15). The last piece is teaching Pulseview to decode what comes out.

Pulseview ships with a built-in **ETM** protocol decoder. Add it from the decoder list:

![Selecting the ETM decoder in Pulseview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8e3e878602ce3b96.png)

The ETM decoder is a *stacked* decoder - it needs a lower-level decoder underneath it to first recover the raw bytes from the physical line. Since our TPIU is emitting async UART-framed data, we assign the ETM decoder on top of a **UART** decoder:

![Stacking the ETM decoder on top of a UART decoder](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/37585ec50cf03c90.png)

Then we configure the decoder and the analyzer to match the stream we set up. The SWO line is our RX, and the baud rate is the 4 Mbaud we picked with `TPIU_ACPR`:

![Pulseview UART decoder and logic analyzer settings](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5e8fd88ef104a994.png)

-   **UART decoder:** RX on D0, baud rate `4000000`
-   **Logic analyzer:** 24 MHz sample rate, 25% pre-trigger capture ratio, falling-edge trigger on D0

A quick note on sample rates, to cleanly recover a 4 Mbaud signal you want to be sampling several times faster than the bit rate, and 24 MHz gives us six samples per bit. The falling-edge trigger lets us start the capture on the first start bit, and the 25% pre-trigger ratio keeps a little context before it.

The capture workflow ties OpenOCD and Pulseview together:

1.  Plug the controller into the Pi and run OpenOCD with our trace config file
    1.  This will configure the ETM and TPIU
2.  In the OpenOCD telnet console, `reset halt`
    1.  Note that when we reset the target, the ETM and TPIU configuration remain untouched!
3.  Arm the Pulseview capture
4.  Back in telnet, `resume`

And we get... data!

![First trace data captured on PB3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bea7de92d457298e.png)

We've captured *something*. There are gaps and we have a few small bursts of traffic. Now we have to determine if the traffic is actually ETM data, or if it is just garbage

* * *

## Reading the Trace (...initially)

Remember, the trace stream doesn't contain raw instructions - it contains just enough information for a decoder to *replay* execution against a copy of the firmware. So a "good" trace is one where the decoder locks onto a synchronization point and then walks the program counter through addresses that actually make sense.

At the very beginning, things look great. The decoder syncs up and starts spitting out program counter values that march right through the reset vector:

![Decoder syncing on the reset vector](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e5a51e9cbfc66969.png)

Even better, if we follow the decoded instruction flow, it's logical, the addresses form a coherent execution path through early startup:

![Coherent instruction flow through early startup](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f93091d46ce059cc.png)

At this point things are looking good, our instruction trace makes sense and we can line it up with the firmware in Ghidra...but hold the celebration, because a little further into the capture, something goes sideways:

![Synchronization sequence in the middle of the trace](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f33e0df8e2229084.png)

We hit an odd synchronization sequence in the middle of the trace, and immediately after it, the decoder starts producing garbage:

![Garbage data following the synchronization error](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1ed96bacb360602c.png)

And if we look at the raw signal around the failure, we can see that the baud rate increases during our capture!

![Baud rate increasing partway through the capture](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/86cef28e398c8007.png)

Our UART decoder is locked to 4 Mbaud, but the signal on the wire has sped up. The decoder is now sampling at the wrong intervals, so every byte it recovers is wrong, so the ETM decoder on top of it is replaying nonsense. Remember that `TPIU_ACPR` derives the trace clock from `HCLK` so something in the firmware has reconfigured the clock, which will in turn increase the baud rate of our output data (remember that in our configuration we were assigning a pre-scaler, not a baud rate)

So we have two mysteries to solve:

1.  **Why does the clock speed change mid-trace, and can we stop it?**
2.  **What happens at the very *end* of the usable trace - what's the last thing the CPU does before we lose it entirely?**

We can't answer either of these by staring at Pulseview, so we'll dig into the firmware to see what's going on.

* * *

## Diagnosing With Ghidra

To reason about the trace we need a copy of the firmware loaded up correctly. The image format for these Cortex-M parts is well documented: the first four bytes are the initial stack pointer, immediately followed by the interrupt vector table, and (per the datasheet) flash is mapped at `0x8000000`. So we load the dumped image as ARM Cortex little-endian at base address `0x8000000`.

Before auto-analyzing we will set up the memory-mapped peripherals. If Ghidra doesn't know that `0x40023800` is the RCC (Reset and Clock Control) block, our decompilation is going to be much more difficult to diagnose. Rather than punch in every peripheral by hand, we can feed Ghidra an **SVD (System View Description)** file - the same machine-readable register description CMSIS uses - with the excellent **SVD-Loader** script. Point it at the `STM32F401.svd` file and it builds the entire peripheral memory map *and* generates a struct for every peripheral automatically:

![Peripheral memory map generated by the SVD-Loader script](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6572e6773ef52032.png)

Now analysis is dramatically more readable. As an example, we can take a global that SVD-Loader knows is an `RCC*` and retype it (hit Ctrl-L on the variable), and a wall of `*(undefined4 *)(DAT_... + 0x08)` accesses turns into named register writes:

![Decompilation after retyping the RCC global in Ghidra](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2727a8c00a1a3203.png)

**RE Tip:** The SVD-Loader workflow is useful for Cortex-M target, tracing or not. Auto-generated peripheral structs cut your reversing time enormously. SVD files for most vendors are floating around on GitHub and in vendor CMSIS packs.

### Mystery 1: The clock change

Recall that the last instruction we could reliably decode was around `0x8000390`. If we look at the subroutine that contains it, we can see that it's configuring the **PLL** by writing to the RCC and Power Controller peripherals:

```rust
pRVar2->PLLCFGR = DAT_1fff0fd4;
pRVar2->CFGR = pRVar2->CFGR & 0xffff03ff;
pRVar2->CFGR = pRVar2->CFGR | 0x800;
pRVar2->CR = pRVar2->CR | 0x1000000;
```

That's the firmware kicking the core clock up from the default 16 MHz. Since our trace clock is `HCLK / (ACPR + 1)`, the SWO baud rate leaps up right alongside it explaining baud-rate jump we saw in the capture.

### Mystery 2: PB3 gets stolen

We've now diagnosed the baud rate issue, but if we zoom out in pulseview and look at more traffic we can see more weird behavior. After the baud change, the trace doesn't just get faster PB3 starts doing something completely different:

![PB3 switching to I2C traffic later in the capture](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4927c230d96370b0.png)

If we consult the STM32F4 alternate-function table for PB3, we find that this pin has more than one job. It can be SWO, but it can also be used as an I2C data line:

![STM32F4 alternate-function table for PB3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5ad8866bf9896e74.png)

So what's on the other end of that I2C bus? On this controller, it's an **AK4951 stereo audio codec** - the chip that drives the headset audio:

![AK4951 stereo audio codec with the I2C signal overlay](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9b4eccf41278a07b.jpg)

The firmware's normal startup reconfigures PB3 from "SWO trace output" to "I2C2 SDA" so it can talk to the audio codec. The moment it does that, our trace pin physically stops being a trace pin. No amount of decoder tuning will fix that, because there's no trace data on the wire anymore, just I2C traffic.

So the picture is complete. Our trace dies for two independent reasons: the PLL reconfiguration moves our baud rate out from under the decoder, and then the firmware repurposes PB3 for I2C. If we want clean traces, we have to deal with both.

* * *

## Getting Better Traces

At this point we've found the two issues, our clock rate increase and the firmware is reconfiguring the PB3 line to be used as I2C. We'll focus on the clock speed issue first, if we can capture a longer trace, that trace can hopefully lead us to the moment in the firmware where PB3 is reconfigured.

### Fix 1: Slow the trace clock back down

The baud-rate jump happens because the trace clock rides on `HCLK`, and the firmware raises `HCLK` when it configures the PLL. We can't stop the firmware from configuring its clock (it needs to, to function), but we *can* crank the prescaler so that even at the higher core clock, the resulting SWO baud rate lands somewhere our analyzer can follow. Bumping `TPIU_ACPR` from `3` up to `31` divides the trace clock much harder.

We still have a timing problem though. If we set it before the PLL comes up, the pre-PLL portion of the trace is unreadably slow; if we set it after, we've already lost the transition. The clean approach is to let the firmware do its clock setup, break right after it, then reconfigure the trace and go. In the OpenOCD telnet console:

```
resume
reset halt
bp 0x80001fa 2 hw
resume
```

That sets a hardware breakpoint on the instruction after the PLL configuration routine returns (`0x80001fa`). Once it fires, we arm Pulseview and `resume`, capturing from a point where the clock has already settled. With `ACPR` at `31` the resulting stream is slow and steady:

![Slow, steady trace after raising the prescaler](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d5a8846a29259232.png)

**Note:** Breakpoints on these parts are a little finicky over this setup - I had the best luck with two-byte (Thumb) instructions and hardware breakpoints (`bp <addr> 2 hw`). If a breakpoint refuses to stick, try landing it on a different two-byte instruction nearby.

### Fix 2: Stop the firmware from stealing PB3

Slowing the clock buys us a readable stream, but it doesn't stop PB3 from being reassigned to I2C. For that, we go a step further and patch the firmware so it never reconfigures the pin or brings up the I2C2 peripheral in the first place.

Hunting through the image, two functions are responsible. The first reconfigures the GPIOB pins into their alternate-function I2C roles. With the STM32 HAL structs imported into Ghidra, it's very legible:

![GPIO init structure applied in Ghidra](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ce93052fb789e4ec.png)

```rust
/* Pins 3 and 10 */
local_40.pins = 0b0000010000001000;
/* Mode = 2 (alternate function) */
local_40.mode_val = '\x02';
local_40.speed = '\x02';
local_40.alternate = '\x01';
local_40.pullup_val = '\0';
HAL_GPIO_Init((uint *)PTR_GPIOB_08005e04, &local_40);
/* Pin 4, AF10 -> I2C2_SCL */
HAL_GPIO_Set_AFRL((GPIOB *)PTR_GPIOB_08005e04, 10, 4);
/* Pin 3, AF9 -> I2C2_SDA  <-- there goes our trace pin */
HAL_GPIO_Set_AFRL((GPIOB *)PTR_GPIOB_08005e04, 3, 9);
```

That last call is the one that reassigns PB3 to `I2C2_SDA` and kills our trace. The second function actually brings the I2C2 peripheral online:

![Call site that enables the I2C2 peripheral](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2883537200324a1b.png)

For this post, our fix was very straightforward, patch out the branches to these routines so they never run. The ARM Thumb `nop` instruction encodes as `0xBF00`, so we overwrite the offending calls with `nop` s. There's a small [Capstone](https://www.capstone-engine.org/) -based patch script for doing this cleanly (`pip install capstone`), and once we've flashed the modified image back to the controller, PB3 stays ours.

**Remember:** Patching out peripheral initialization is a scalpel, not a hammer. We're deliberately breaking the controller's audio codec setup to keep a debug pin free - that's a perfectly reasonable trade for a trace capture, but it does mean this firmware isn't a fully functional controller anymore.

### The combined workflow

Putting both fixes together, the full trace-capture ritual becomes:

1.  Connect with OpenOCD (our config file enables the ETM and TPIU)
2.  `resume` to let the controller run its initial startup
3.  `reset halt`
4.  Set a hardware breakpoint after the PLL is configured: `bp 0x80001fa 2 hw`
5.  Arm Pulseview - falling-edge trigger, 25% pre-capture ratio
6.  `resume`

And with the patched firmware and the higher prescaler, we see something different, a long, coherent instruction trace that survives well past the point where the original capture fell apart:

![Long instruction trace after the firmware patches](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/22d756bec9d564fe.png)

If we zoom in on areas of the trace, we can see that the trace decodes nicely:

![Zoomed view of the decoded long trace](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1ca2b87624355975.png)

So at this point, we've walked through the following steps and enabled instruction tracing on out target:

| Step | Status |
| --- | --- |
| Locate the PB3 pin | Connected to R15 |
| Configure and enable the TPIU | Done |
| Configure and enable the ETM | Done |
| Capture and decode data on PB3 | Done |
| Get long, clean traces | Done (via firmware patches) |

* * *

## Bonus: Turning the Trace Pin On at Runtime

There's a variation on this that's worth knowing about, because you won't always want to (or be able to) reflash the target. Since we have SWD access, we can reconfigure PB3 back into SWO mode *at runtime* with nothing but memory writes, no firmware patch required.

The alternate-function assignment lives in the GPIOB configuration registers at `0x40020400`. If we halt the core after the firmware has stolen PB3 and rewrite those registers to their reset (SWO-compatible) state, the pin flips back to trace output. In OpenOCD:

```bash
> mww phys 0x40020400 0x00000280
> mww phys 0x40020404 0x00000280
> mww phys 0x40020408 0x00000280
> mww phys 0x4002040C 0x00000280
> mww phys 0x40020410 0x00000280
> mww phys 0x40020414 0x00000280
> mww phys 0x4002041C 0x00000280
> mww phys 0x40020420 0x00000280
> mww phys 0xe0040010 15
```

That last write sets `TPIU_ACPR` (at `0xe0040010`) to `15`, re-picking a baud rate that suits the current clock. Halt after entering the target's bootloader/UART mode, fire those writes, and tracing comes back to life on SWO at roughly 4 MHz. On the capture side, a faster analyzer helps here: with a **DSLogic** sampling at 100 MHz you can comfortably follow a 20 MHz-class trace clock, which buys you a lot of headroom when the core is running fast. For this exercise we were using the low-cost FX2 logic analyzers that run about $15 with shipping.

This is the technique I have been using more frequently when prtforming fault injection research. If you can get a clean instruction trace running alongside a logic capture, you can line up the exact instant a specific instruction executes - which is precisely the information you need to time a glitch. But that is a rabbit hole for another post.

* * *

## Conclusion

We covered a lot in this post, and it probably should have been broken up into two different posts. We started from "ARM cores have these mysterious trace peripherals" and ended with a decoded instruction trace pulled off a running Xbox controller with a hobbyist logic analyzer. Along the way we:

-   Reviewed the CoreSight trace stack - the ETM and ITM that produce trace data, the TPIU that outputs it, and the DWT that generates events
-   Configured the TPIU and ETM entirely from an OpenOCD config file, register by register, out of three different reference manuals
-   Captured SWO trace data with Pulseview's stacked ETM/UART decoder
-   Watched the trace desynchronize, and used Ghidra to trace both failures back to a PLL reconfiguration and PB3 being repurposed for an I2C audio codec
-   Fixed both problems with a higher trace-clock prescaler and a couple of firmware patches

Hopefully the information and steps here help others when tryng to reverse engineer ARM based targets with tracing peripherals. Be wary that the peripheral configuration is the easy half (which of course assumes you have a datasheet for any of the target-specific registers). Understanding your target's clock tree and pin multiplexing - and being willing to open the firmware in Ghidra when the trace lies to you - is what actually gets you a usable capture. The trace stream will happily hand you garbage and look confident doing it, so decode it against ground truth every time.

## Next Steps

In the next post we will take a clean ETM trace running next to a synchronized logic capture and use it to precisely time a fault injection glitch

As always, if you have any questions, corrections, or a cleaner way to configure any of this (there almost certainly is one - the OpenOCD trace docs are famously thin), please reach out. I genuinely learn the most from readers poking holes in these.

If you're looking to learn more about hardware reverse engineering, check out our roadmap of free resources [here](https://voidstarsec.com/roadmap). If you're interested in structured training for your team, check out our [hardware hacking bootcamp](https://voidstarsec.com/#training). And if you'd like an in-depth dive into how hardware-level debuggers work and how to reverse engineer them, check out our self-paced course [here](https://voidstarsecurity.thinkific.com/). To hear about new posts and courses (and nothing else - I only email when there's something real to share), sign up for the mailing list [here](http://eepurl.com/hSl31f).

Thanks for reading - and happy hacking!

Matt
