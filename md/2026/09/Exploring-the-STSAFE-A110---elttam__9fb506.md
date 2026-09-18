---
title: Exploring the STSAFE-A110 - elttam
source: https://www.elttam.com/blog/stsafe-a110
source_host: www.elttam.com
clip_date: 2026-09-18T10:40:06+08:00
trace_id: 2e47eaa4-5cf6-4cc4-bc19-8ffb44913cb1
content_hash: 902c788ecfe4e5be8eacf54a04c7bf2cf9da45af95195d20fb01e2de6c0b7e84
status: summarized
tags:
  - 硬件逆向
  - 协议分析
series: null
feed_source: elttam
ai_summary: STSAFE-A110 安全元件的密钥生成流程可被逻辑分析仪完整截获，其 I2C 通信在未配置主机密钥时明文传输。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: null
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> STSAFE-A110 安全元件的密钥生成流程可被逻辑分析仪完整截获，其 I2C 通信在未配置主机密钥时明文传输。
> 
> - **实验平台：** B-L475E-IOT01A（STM32L4S5VIT6 主机）+ X-NUCLEO-SAFEA1 扩展板 + Saleae Logic 8，通过 Arduino 兼容排针嗅探 SDA/SCL。
> - **命令码：** 0x11 GenerateKeyPair、0x16 GenerateSignature、0x17 VerifyMessageSignature、0x18 EstablishKey、0x14 HostKeySlotQuery、0x0e/0x0f Wrap/UnwrapLocalEnvelope、0x02 GenerateRandom、0x05 Read。
> - **密钥流程：** 先以 0x14 查询 0x17 槽的 HostKeyPresenceFlag（新板为 0，无密钥），再发 0x11 指定私钥槽、操作授权位与 ECC 曲线 OID，返回公钥 X/Y 各 0x30 字节。
> - **校验机制：** 默认 I2C 消息带 CRC-16（仅 STSAFE 侧附加），不足以防篡改；可选的 AES C-MAC/R-MAC 只对命令码低 5 位做掩码，其余字段不签名，并靠 HostMacSequenceCounter 防重放。
> - **加密与风险：** 可选 AES-CBC 全流加密，IV 由序列计数器加密生成；启用 `STSAFEA_USE_OPTIMIZATION_SHARED_RAM` 共享缓冲区可能引入 TOCTTOU 与溢出风险。作者另开源了 I2C 解码插件。

## Introduction

Recently, we’ve had an opportunity to examine the [STSAFE-A110](https://www.st.com/en/secure-mcus/stsafe-a110.html), a secure element produced by ST Microelectronics.Secure elements are specially hardened processors offering security services, uniquely safeguarded through their physical and logical separation from potentially harmful software running on the main CPU.

A secure element might provide services such as:

-   Establishing a root of trust
-   Storing and verifying sensitive data, including cryptographic keys and certificates
-   Securely generating cryptographic material
-   Authenticating messages or peripherals

Nowadays, secure elements and secure co-processors can often be found integrated into the main CPU’s die.While this enhances security, it also makes experimentation more challenging.Fortunately, the STSAFE-A110 module is a physically separate package with an external I2C interface, which greatly simplifies the requirements for intercepting and analyzing communication.

As expected, the firmware for STSAFE-A110 is not publicly accessible due to the high level of protection typically associated with secure elements.In this post, we will not attempt to access this firmware.Instead, we’ll utilize the source code of drivers and a sample program provided by ST Microelectronics.However, due to licensing limitations, the included code snippets in this blogpost are IDA-generated pseudocode, taken against a binary-only version of the `all_use_cases` sample application.Because of this there might be superficial differences between the code in this post and the original source code. This `all_use_cases` sample program allows us to interact with the STSAFE-A110 and generate a new asymmetric key pair.To further enhance our exploration, we’ll also use a debugger and a logic analyzer to monitor the communication between the CPU and the STSAFE-A110.

This post won’t cover all the features of STSAFE-A110; instead, we’ll focus on a selection of the more intriguing features.Our goal is to better understand the communication protocol and commands supported by the secure element.

## Setup

To communicate with the secure element, a main MCU and some peripherals are required.For this purpose, we’ve selected the [B-L475E-IOT01A devkit](https://www.st.com/en/evaluation-tools/b-l475e-iot01a.html), which utilizes the [STM32L4S5VIT6 MCU](https://www.st.com/en/microcontrollers-microprocessors/stm32l4s5vi.html) - when we refer to “local host” or “host”, this is the chip we’re talking about.We also have our secure element sitting on a [X-NUCLEO-SAFEA1](https://www.st.com/en/ecosystems/x-nucleo-safea1.html) expansion board. Finally, we have our trusty [Saleae Logic 8](https://www.saleae.com/) logic analyser.

![Development kit board](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/69859f2669bc7d32.avif)

B-L475E-IOT01A devkit with the STM32L4S5VIT6 highlighted

![Secure element](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e01c043e923fe980.avif)

Secure element

![Saleae Logic 8](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/573d50616f82bf06.avif)

Saleae Logic 8

### Hardware

The STM32L4 family of chips is a good starting point for our investigation for the following reasons:

-   It is widely available
-   It is easy to prototype using its [devkit](https://www.st.com/en/evaluation-tools/b-l475e-iot01a.html)
-   Development is quick due to its [IDE](https://www.st.com/en/development-tools/stm32cubeide.html) with a built-in `gdb` debugger
-   A full stack of easily accessible [CMSIS, drivers, middleware, and sample applications](https://github.com/STMicroelectronics/STM32CubeL4)
-   There is good support for the STSAFE-A110 in the form of [drivers, middleware, and sample projects](https://www.st.com/en/embedded-software/x-cube-safea1.html), which double as reference implementation for developers

The `B-L475E-IOT01A` development kit has all the peripherals we need for our experiments, including an STSAFE-A110 chip already on the board. However, just to make our life easier we used a [X-NUCLEO-SAFEA1](https://www.st.com/en/ecosystems/x-nucleo-safea1.html) expansion board.This is going to be useful mainly because it’s Arduino-compatible, meaning all the pins from the secure element are exposed on the board via female headers.We will make good use of this to sniff the I2C communication using a logic analyser.

### Software

In order to get a taste of the full STM experience, we opted to use the STM32 toolchain.It consists of 4 unique software components:

-   [STM32CubeMX](https://www.st.com/en/development-tools/stm32cubemx.html) - a GUI tool to automatically generate the initialisation code for STM32 microcontrollers using a wizard.This is used when developing STM32 LL/HAL applications from scratch.We’re not going to need this one right now because we’re using the sample projects, which bundle the initialisation code for our boards.
-   [STM32CubeProg](https://www.st.com/en/development-tools/stm32cubeprog.html) - a GUI and CLI programmer with support to read/write device memory via JTAG, SWD as well as bootloader interfaces.
-   [STM32CubeMonitor](https://www.st.com/en/development-tools/stm32cubemonitor.html) - a family of GUI tools to monitor variables in real-time on the device for application profiling.
-   [STM32CubeIDE](https://www.st.com/en/development-tools/stm32cubeide.html#get-software) - a custom Eclipse IDE, with full support for C, a builtin GDB debugger that works seamlessly with the ST-LINK/V2-1 debugging chip on the board.Because of its ease of use and good integration to the ecosystem, including support for the on-board debug port using `gdb`, we are using this IDE for the post.

To configure our demo app we did the following:

1.  Install `STM32CubeIDE`
2.  Unpack the `en.X-CUBE-SAFEA1.zip` project
3.  Open `STM32CubeIDE`
4.  In `STM32CubeIDE` open the `STM32CubeExpansion_STSAFE-A_V1.2.0` workspace: `File->Switch Workspace->Other...`
5.  Select the root directory of the `STM32CubeExpansion_STSAFE-A_V1.2.0` repository
6.  Import a sample project, such as the `All_Use_Cases` application: `File->Import...`
7.  Select `General->Existing Projects into Workspace`
8.  Open `STM32CubeExpansion_STSAFE-A_V1.2.0/Projects/B-U585I-IOT02A/Demonstration/STSAFE_A_using_MbedTLS_CryptoLib/All_Use_Cases`
9.  Build the project:`Project->Build Project`
10.  Run the build with a debugger (gdb):`Run->Debug`
     -   Note: In `Project Explorer` the cursor should be on the `.elf` binary otherwise an error pops up

The sample program we just flashed onto the board using these steps implement all the main flows the STSAFE-A110 supports:

-   Authentication
    -   Extracting and verifying a X509 certificate
    -   Peripheral authentication
-   Key generation and verification - this is the flow we’re going to focus on in this post
-   Generate shared secret using ephemeral keys
-   Wrapping and unwrapping local envelopes

All these are sample implementations where not all the security features are used. However, this is useful for us because it makes the process of our understanding the flows easier.

## STSAFE-A110

To intercept the I2C communication between the secure element and the MCU, we used a Saleae Logic 8 logic analyser.Setting this up is simple thanks to the Arduino-compatible STSAFE-A110 extension board.We just need to connect our SDA, SDC, and a GND wire from our Saleae to the corresponding headers on the board similarly to the pictures below:

![SDA and SDC wires connected](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0cfd77fcc15dc9ea.avif)

SDA and SDC wires connected

![GND connected](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/66d6747953c10cad.avif)

GND connected

### I2C Communication

#### STSAFE-A110 commands

Commands are the APIs that the STSAFE-A110 exposes to the main CPU. These commands are the building blocks for the flows that are implemented by the sample program we’re using, explained above. Each command has a code and an expected data structure which needs to be sent by the CPU. Some command codes support flags that can be set by the CPU - in effect by XORing the command code with the appropriate bitmask - which enable certain features, such as message encryption or message signing.

The following idapython script can be used to pull out the various `STSAFEA_CMD_*` \` constants from firmware or the generated ELF binary:

```python
xr = CodeRefsTo(get_name_ea(0, 'StSafeA_BuildCommandHeaderCMAC'), 1)
for src in xr:
  fname = ida_funcs.get_func_name(src)
  insn, farref = DecodePrecedingInstruction(src)
  insn, farref = DecodePrecedingInstruction(insn.ea)  
  cmdcode = get_operand_value(insn.ea, 1)
  print(f'0x{cmdcode:02x}:{fname}')
```

The result of the script will look like the following, where the hex values correspond to the command codes being sent on the I2C bus:

```c
0x02:StSafeA_GenerateRandom
0x05:StSafeA_Read
0x11:StSafeA_GenerateKeyPair
0x16:StSafeA_GenerateSignature
0x17:StSafeA_VerifyMessageSignature
0x18:StSafeA_EstablishKey
0x14:StSafeA_HostKeySlotQuery
0x0e:StSafeA_WrapLocalEnvelope
0x0f:StSafeA_UnwrapLocalEnvelope
```

#### STSAFEA_CMD_GENERATE_KEY walkthrough

Next we will have a look at an intercepted stream of messages exchanged during the key generation on the secure element, in order to understand how the communication between the MCU and the secure element works in practice.

In the sample applications, communication with the local host (the main CPU) is unencrypted due to a lack of configured host keys. Host keys are used for multiple purposes, for example when verifying message authentication signatures, and encrypting the I2C messages. They are stored in a one-time programmable area on the secure element, meaning once they’re set, they cannot be recovered or replaced. Additionally, according to [ST](https://community.st.com/t5/security-mcu/reset-host-cipher-and-mac-key-in-stsafe-ic/m-p/128228/highlight/true#M1596), if the wrong C-MAC (command authentication signature sent by the CPU) is sent 50 times, the keys become blocked, bricking the STSAFE. Similarly, if the host fails to store these keys in its own flash somewhere, the secure element will have to be replaced.In order to be able to intercept I2C messages, and in case we lose the host keys during the many iterations of flashing and executing programs on the CPU, we opted not to set the host keys while preparing this post. However, in a real-world use case past the prototyping phase, host keys should always be set during the first time the device is programmed (using the `STSAFEA_CMD_PUT_ATTRIBUTE` command) in order to ensure that communication between the secure element and the CPU is encrypted and authenticated.

We included comments in the data stream to map the fields of the source code’s `StSafeA_Handle_t` handler object to the I2C messages.The `StSafeA_Handle_t` structure looks like this in decompiled code:

```c
00000000 StSafeA_Handle_t struc ; (sizeof=0x50, align=0x4, copyof_14)
00000000                                         ; XREF: main/r
00000000 InOutBuffer     StSafeA_TLVBuffer_t ?
0000000C CrcSupport      DCB ?
0000000D MacCounter      DCB ?
0000000E                 DCB ? ; undefined
0000000F                 DCB ? ; undefined
00000010 HostMacSequenceCounter DCD ?
00000014 HashObj         StSafeA_Hash_t ?
00000050 StSafeA_Handle_t ends
```

This intercepted stream of I2C data is a result of a - mostly (more on this later) - unmodified run of the `key_pair_generation()` function of the `all_use_cases` sample application from the `STM32CubeExpansion_STSAFE-A_V1.2.0` package.

First, the MCU queries the secure element about the host key in slot `0x17`, as well as the `HostCMacCounter` (more on this later) as part of the `StSafeA_GetHostMacSequenceCounter()` STSAFE middleware call using the `STSAFEA_CMD_QUERY` command:

```bash
name	type	start_time	duration	ack	address	read	data
I2C	start	2.62365644	3.99999999e-08				

// write message to the secure element which is at address 0x20
I2C	address	2.62365852	1.768e-05	true	0x20	false	

// command code - 0x14 is CMD_QUERY
I2C	data	2.62367788	1.768e-05	true			0x14

// STSAFEA_TAG_HOST_KEY_SLOT
I2C	data	2.6236968	1.768e-05	true			0x17

// Command MAC
I2C	data	2.62371576	1.768e-05	true			0x99
I2C	data	2.62373472	1.768e-05	true			0x88

I2C	stop	2.62375452	3.99999999e-08				
```

This is an important step in terms of security, which we’ll discuss later.

The secure element responds with the `HostKeyPresenceFlag`, which is `0` in this fresh development kit, meaning there is no key in this slot.We could set up host keys by generating the required pair of MAC and cipher keys, and storing them in the one-time writeable sections inside STSAFE (as well as in the flash for the MCU) using the `STSAFEA_CMD_PUT_ATTRIBUTE` command.

The amount of bytes returned from the secure element are enough to hold the value of the `HostCMacSequenceCounter` should the `HostKeyPresenceFlag` not be zero.

```bash
I2C	start	7.67834892	3.99999999e-08				

// read from the secure element at address 0x20
I2C	address	7.67835096	1.772e-05	true	0x20	true	

// STSAFEA_OK
I2C	data	7.67836992	1.768e-05	true			0x00

I2C	data	7.67838888	1.768e-05	true			0x00

// length of data including the C-MAC
I2C	data	7.67840784	1.768e-05	true			0x03

// HostKeyPresenceFlag
I2C	data	7.6784268	1.768e-05	true			0x00

// Response MAC
I2C	data	7.67844576	1.768e-05	true			0x0F
I2C	data	7.67846468	1.772e-05	true			0x47

I2C	data	7.67848364	1.768e-05	true			0xFF
I2C	data	7.6785026	1.768e-05	true			0xFF
I2C	data	7.67852156	1.768e-05	false			0xFF
I2C	stop	7.67854136	4.00000008e-08				
```

Next, the MCU issues the `STSAFEA_CMD_GENERATE_KEY` command with the corresponding data structure, as per the notations in the message dump below.For those of you following along at home, note that for multibyte fields, endianness is swapped for the I2C protocol, in case you want to check these values using a debugger as well:

```bash
I2C	start	13.2237476	4.00000008e-08				
I2C	address	13.2237496	1.772e-05	true	0x20	false	

// pStSafeA->InOutBuffer.Header = (CommandCode (0x11)
I2C	data	13.223769	1.768e-05	true			0x11 

// STSAFEA_TAG_PRIVATE_KEY_SLOT
I2C	data	13.223788	1.768e-05	true			0x13 

// InKeySlotNum
I2C	data	13.2238069  1.768e-05	true			0x01

// STSAFEA_KEY_SLOT_1
I2C	data	13.2238259	1.768e-05	true			0x00
I2C	data	13.2238448	1.768e-05	true			0x01

// (STSAFEA_PRVKEY_MODOPER_AUTHFLAG_CMD_RESP_SIGNEN |
// STSAFEA_PRVKEY_MODOPER_AUTHFLAG_MSG_DGST_SIGNEN |
// STSAFEA_PRVKEY_MODOPER_AUTHFLAG_KEY_ESTABLISHEN) &
// STSAFEA_PRIVATE_KEY_MODE_OF_OPERATION_AUTHORIZATION_FLAGS_MASK
I2C	data	13.2238638	1.768e-05	true			0x80
I2C	data	13.2238827	1.768e-05	true			0x0D


// STSAFEA_GET_ECC_CURVE_OID_LEN(InCurveId)
I2C	data	13.2239017	1.768e-05	true			0x00
I2C	data	13.2239206	1.768e-05	true			0x09

// STSAFEA_GET_ECC_CURVE_OID(InCurveId)
I2C	data	13.2239396	1.772e-05	true			0x2B
I2C	data	13.2239585	1.768e-05	true			0x24
I2C	data	13.2239775	1.768e-05	true			0x03
I2C	data	13.2239964	1.768e-05	true			0x03
I2C	data	13.2240154	1.768e-05	true			0x02
I2C	data	13.2240343	1.772e-05	true			0x08
I2C	data	13.2240533	1.768e-05	true			0x01
I2C	data	13.2240722	1.768e-05	true			0x01
I2C	data	13.2240912	1.768e-05	true			0x0B

// Command MAC
I2C	data	13.2241102	1.768e-05	true			0x1F
I2C	data	13.2241291	1.768e-05	true			0x7C
I2C	data	13.224148	1.768e-05	true			0x1E
I2C	data	13.224167	1.768e-05	true			0x89
I2C	data	13.224186	1.768e-05	true			0x0D
I2C	data	13.2242049	1.772e-05	true			0xAF
I2C	stop	13.2242247	4.00000008e-08				
```

At this point we should note that the reference code uses a form of message authentication feature, whereby the command code is bit masked with the `STSAFEA_MAC_HOST_CMAC` constant.However, we have found that if this feature is used as-is, the secure element errors out and does not generate the expected keys.So for the sake of this walkthrough we have disabled the host CMAC, and we are just sending the command code without masking, which results in keys being generated as expected.

In response to this command, the secure co-processor will generate two new RSA keys and return the public keys:

```bash
I2C	start	10.4619229	3.9999999e-08		

// reading from the secure element at address 0x20
I2C	address	10.461925	1.768e-05	true	0x20	true	

// status_code = STSAFE_OK
I2C	data	10.4619439	1.768e-05	true			0x00

I2C	data	10.4619629	1.768e-05	true			0x00

// length (pOutPointReprensentationId + pubX length + pubX + pubY length + pubY)
I2C	data	10.4619818	1.768e-05	true			0x67

// pOutPointReprensentationId
I2C	data	10.4620008	1.768e-05	true			0x04

// pubX length
I2C	data	10.4620197	1.772e-05	true			0x00
I2C	data	10.4620387	1.772e-05	true			0x30

// pubX
I2C	data	10.4620576	1.772e-05	true			0x5B
I2C	data	10.4620766	1.772e-05	true			0x9A
I2C	data	10.4620956	1.768e-05	true			0x98
I2C	data	10.4621145	1.768e-05	true			0x07
I2C	data	10.4621335	1.768e-05	true			0xA1
I2C	data	10.4621524	1.768e-05	true			0x7B
I2C	data	10.4621714	1.768e-05	true			0xB3
I2C	data	10.4621904	1.768e-05	true			0xF9
I2C	data	10.4622093	1.768e-05	true			0xCE
I2C	data	10.4622282	1.772e-05	true			0xE8
I2C	data	10.4622472	1.772e-05	true			0xB6
I2C	data	10.4622662	1.768e-05	true			0x07
I2C	data	10.4622851	1.768e-05	true			0xF7
I2C	data	10.4623041	1.768e-05	true			0xBC
I2C	data	10.462323	1.768e-05	true			0xBF
I2C	data	10.462342	1.768e-05	true			0x80
I2C	data	10.462361	1.768e-05	true			0x7C
I2C	data	10.4623799	1.768e-05	true			0x50
I2C	data	10.4623989	1.768e-05	true			0x08
I2C	data	10.4624178	1.768e-05	true			0xDF
I2C	data	10.4624368	1.768e-05	true			0x5C
I2C	data	10.4624558	1.768e-05	true			0x26
I2C	data	10.4624747	1.768e-05	true			0x69
I2C	data	10.4624937	1.768e-05	true			0xD5
I2C	data	10.4625126	1.768e-05	true			0x35
I2C	data	10.4625316	1.768e-05	true			0x2D
I2C	data	10.4625505	1.772e-05	true			0x36
I2C	data	10.4625695	1.772e-05	true			0x07
I2C	data	10.4625884	1.772e-05	true			0x99
I2C	data	10.4626074	1.772e-05	true			0x05
I2C	data	10.4626264	1.772e-05	true			0xFB
I2C	data	10.4626453	1.772e-05	true			0x4C
I2C	data	10.4626643	1.772e-05	true			0x29
I2C	data	10.4626832	1.772e-05	true			0x66
I2C	data	10.4627022	1.768e-05	true			0x60
I2C	data	10.4627212	1.768e-05	true			0xD1
I2C	data	10.4627401	1.768e-05	true			0x98
I2C	data	10.4627591	1.768e-05	true			0xC5
I2C	data	10.462778	1.768e-05	true			0x4E
I2C	data	10.462797	1.768e-05	true			0xCC
I2C	data	10.462816	1.768e-05	true			0x3D
I2C	data	10.4628349	1.772e-05	true			0x36
I2C	data	10.4628538	1.772e-05	true			0x4B
I2C	data	10.4628728	1.772e-05	true			0x50
I2C	data	10.4628918	1.772e-05	true			0x39
I2C	data	10.4629107	1.772e-05	true			0x7A
I2C	data	10.4629297	1.768e-05	true			0x77
I2C	data	10.4629486	1.768e-05	true			0xFD

// pubY length
I2C	data	10.4629676	1.768e-05	true			0x00
I2C	data	10.4629866	1.768e-05	true			0x30

// pubY
I2C	data	10.4630055	1.768e-05	true			0x22
I2C	data	10.4630245	1.768e-05	true			0xA4
I2C	data	10.4630434	1.768e-05	true			0x2C
I2C	data	10.4630624	1.772e-05	true			0x8C
I2C	data	10.4630813	1.772e-05	true			0xE0
I2C	data	10.4631003	1.768e-05	true			0xF4
I2C	data	10.4631192	1.768e-05	true			0x8B
I2C	data	10.4631382	1.768e-05	true			0x88
I2C	data	10.4631572	1.768e-05	true			0xE6
I2C	data	10.4631761	1.768e-05	true			0x45
I2C	data	10.4631951	1.768e-05	true			0x1C
I2C	data	10.463214	1.768e-05	true			0x4A
I2C	data	10.463233	1.768e-05	true			0x28
I2C	data	10.463252	1.768e-05	true			0x13
I2C	data	10.4632709	1.768e-05	true			0x6F
I2C	data	10.4632899	1.768e-05	true			0x6B
I2C	data	10.4633088	1.768e-05	true			0x84
I2C	data	10.4633278	1.768e-05	true			0x07
I2C	data	10.4633468	1.768e-05	true			0xD7
I2C	data	10.4633657	1.768e-05	true			0xCE
I2C	data	10.4633847	1.768e-05	true			0x60
I2C	data	10.4634036	1.768e-05	true			0xCB
I2C	data	10.4634226	1.772e-05	true			0x91
I2C	data	10.4634415	1.772e-05	true			0x7D
I2C	data	10.4634605	1.768e-05	true			0x70
I2C	data	10.4634794	1.768e-05	true			0x9C
I2C	data	10.4634984	1.768e-05	true			0x28
I2C	data	10.4635174	1.768e-05	true			0x94
I2C	data	10.4635363	1.768e-05	true			0x57
I2C	data	10.4635553	1.768e-05	true			0xE7
I2C	data	10.4635742	1.768e-05	true			0xFE
I2C	data	10.4635932	1.768e-05	true			0xD6
I2C	data	10.4636122	1.768e-05	true			0x67
I2C	data	10.4636311	1.768e-05	true			0xBE
I2C	data	10.4636501	1.768e-05	true			0x99
I2C	data	10.463669	1.772e-05	true			0xB3
I2C	data	10.463688	1.772e-05	true			0xF9
I2C	data	10.4637069	1.772e-05	true			0xBB
I2C	data	10.4637259	1.768e-05	true			0x4D
I2C	data	10.4637448	1.768e-05	true			0x57
I2C	data	10.4637638	1.768e-05	true			0x08
I2C	data	10.4637828	1.768e-05	true			0x3A
I2C	data	10.4638017	1.768e-05	true			0x4B
I2C	data	10.4638206	1.772e-05	true			0x14
I2C	data	10.4638396	1.768e-05	true			0xC8
I2C	data	10.4638586	1.768e-05	true			0xFB
I2C	data	10.4638775	1.768e-05	true			0x32
I2C	data	10.4638965	1.768e-05	true			0x72

// Response MAC
I2C	data	10.4639154	1.768e-05	true			0xD5
I2C	data	10.4639344	1.768e-05	false			0x12
I2C	stop	10.4639542	3.9999999e-08								
```

## Security features

### AES C-MAC

By default the STSAFE-A110 will include a CRC-16 checksum at the end of messages on the I2C channel (weirdly, the MCU will not).This will be verified by the MCU in the `StSafeA_MAC_SHA_PrePostProcess()` function call:

```c
StSafeA_ResponseCode_t __cdecl StSafeA_Receive(StSafeA_TLVBuffer_t *pTLV_Buffer, uint8_t CrcSupport)
{
  uint16_t crc; // [sp+Ch] [bp+Ch] BYREF
  StSafeA_ResponseCode_t status_code; // [sp+Fh] [bp+Fh]
  status_code = STSAFEA_INVALID_PARAMETER;
  if ( pTLV_Buffer )
  {
    if ( CrcSupport )
      pTLV_Buffer->LV.Length += 2;
    status_code = StSafeA_ReceiveBytes(pTLV_Buffer);
    if ( status_code != STSAFEA_BUFFER_LENGTH_EXCEEDED )
    {
      if ( status_code )
      {
        if ( status_code == STSAFEA_COMMUNICATION_ERROR )
          status_code = STSAFEA_COMMUNICATION_NACK;
        else
          status_code = STSAFEA_COMMUNICATION_ERROR;
      }
      else
      {
        status_code = pTLV_Buffer->Header & 0xBF;
      }
    }
    if ( CrcSupport && status_code == STSAFEA_OK )
    {
      pTLV_Buffer->LV.Length -= 2;
      crc = *(_WORD *)&pTLV_Buffer->LV.Data[pTLV_Buffer->LV.Length];
      StSafeA_Crc16(pTLV_Buffer);
      if ( !memcmp(&crc, &pTLV_Buffer->LV.Data[pTLV_Buffer->LV.Length - 2], 2) )
        pTLV_Buffer->LV.Length -= 2;
      else
        return 34;
    }
  }
  return status_code;
}
```

However, as we know, a CRC code is not meant to protect against malicious modification, as an attacker can just as easily calculate a valid CRC and include it in the message.

For exactly this purpose, the STSAFE-A110 can also include an [AEC C-MAC](https://www.rfc-editor.org/rfc/rfc4493) (or R-MAC to authenticate responses from the STSAFE) in order to protect the data sent to and from the STSAFE on the I2C channel.For this feature to work, the secure element needs to be paired with the local host using the following [flow](https://www.st.com/resource/en/datasheet/stsafe-a110.pdf), using the `STSAFEA_CMD_PUT_ATTRIBUTE` command:

![Pairing flow](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9d9069b7f6b619ab.avif)

Pairing flow

For the sake of brevity, we are going to skip over this process on a source code level.

Interestingly, the C-MAC will only modify the command code by bitwise OR’ing with the shared MAC and the `STSAFEA_CMD_HEADER_MAC_MSK` constant, as it can be seen in the code snippet below:

```c
void __cdecl StSafeA_BuildCommandHeaderCMAC(StSafeA_Handle_t *pStSafeA, uint8_t CommandCode, uint8_t *pMAC)
{
  if ( pStSafeA && pMAC )
  {
    if ( (*pMAC & 0x20) != 0 )
      StSafeA_GetHostMacSequenceCounter(pStSafeA);
    pStSafeA->InOutBuffer.Header = CommandCode | *pMAC & 0xE0;
  }
}
void __cdecl StSafeA_GetHostMacSequenceCounter(StSafeA_Handle_t *pStSafeA)
{
  StSafeA_HostKeySlotBuffer_t host_key_slot; // [sp+8h] [bp+8h] BYREF
  if ( pStSafeA && StSafeA_HostKeySlotQuery(pStSafeA, &host_key_slot, 0) == STSAFEA_OK )
  {
    if ( host_key_slot.HostKeyPresenceFlag )
      pStSafeA->HostMacSequenceCounter = host_key_slot.HostCMacSequenceCounter;
  }
}
```

This means that all other fields of the command data structure will remain unsigned.

Also, as part of the MAC calculations, the local host and the secure element will keep track of the communication flow by a Host MAC sequence counter, in order to protect against commands injected into the I2C channel by malicious third-parties:

```c
void __cdecl StSafeA_GetHostMacSequenceCounter(StSafeA_Handle_t *pStSafeA)
{
  StSafeA_HostKeySlotBuffer_t host_key_slot; // [sp+8h] [bp+8h] BYREF

  if ( pStSafeA && StSafeA_HostKeySlotQuery(pStSafeA, &host_key_slot, 0) == STSAFEA_OK )
  {
    if ( host_key_slot.HostKeyPresenceFlag )
      pStSafeA->HostMacSequenceCounter = host_key_slot.HostCMacSequenceCounter;
  }
}
```

```c
StSafeA_ResponseCode_t __cdecl StSafeA_HostKeySlotQuery(
        StSafeA_Handle_t *pStSafeA,
        StSafeA_HostKeySlotBuffer_t *pOutHostKeySlot,
        uint8_t InMAC)
{
  uint8_t InMACa; // [sp+7h] [bp+7h] BYREF
  StSafeA_HostKeySlotBuffer_t *pOutHostKeySlota; // [sp+8h] [bp+8h]
  StSafeA_Handle_t *pStSafeAa; // [sp+Ch] [bp+Ch]
  StSafeA_ResponseCode_t status_code; // [sp+17h] [bp+17h]

  pStSafeAa = pStSafeA;
  pOutHostKeySlota = pOutHostKeySlot;
  InMACa = InMAC;
  status_code = STSAFEA_INVALID_PARAMETER;
  if ( pStSafeA )
  {
    if ( pStSafeAa->InOutBuffer.LV.Data )
    {
      if ( pOutHostKeySlota )
      {
        StSafeA_BuildCommandHeaderCMAC(pStSafeAa, 0x14u, &InMACa);
        *pStSafeAa->InOutBuffer.LV.Data = 23;
        pStSafeAa->InOutBuffer.LV.Length = 1;
        status_code = StSafeA_TransmitCommand(pStSafeAa);
        if ( status_code == STSAFEA_OK )
        {
          pStSafeAa->InOutBuffer.LV.Length = ((InMACa >> 4) & 4) + 4;
          StSafeA_Delay(5u);
          status_code = StSafeA_ReceiveResponse(pStSafeAa);
          if ( status_code == STSAFEA_OK )
          {
            pOutHostKeySlota->Length = pStSafeAa->InOutBuffer.LV.Length;
            pOutHostKeySlota->HostKeyPresenceFlag = *pStSafeAa->InOutBuffer.LV.Data;
            pOutHostKeySlota->HostCMacSequenceCounter = 0xFFFFFF;
            if ( pOutHostKeySlota->HostKeyPresenceFlag )
            {
              pOutHostKeySlota->HostCMacSequenceCounter = pStSafeAa->InOutBuffer.LV.Data[1] << 16;
              pOutHostKeySlota->HostCMacSequenceCounter |= pStSafeAa->InOutBuffer.LV.Data[2] << 8;
              pOutHostKeySlota->HostCMacSequenceCounter |= pStSafeAa->InOutBuffer.LV.Data[3];
            }
          }
        }
      }
    }
  }
  return status_code;
}
```

If a MAC is used, the same process is performed in the reverse when the local host receives a message from the secure element, in the post-processing step:

```c
StSafeA_ResponseCode_t __cdecl StSafeA_MAC_SHA_PostProcess(StSafeA_Handle_t *pStSafeA)
{
  uint8_t a_rmac[4]; // [sp+8h] [bp+8h] BYREF
  StSafeA_ResponseCode_t status_code; // [sp+Fh] [bp+Fh]

  status_code = STSAFEA_OK;
  if ( (pStSafeA->InOutBuffer.Header & 0x40) != 0 )
  {
    pStSafeA->InOutBuffer.LV.Length -= 4;
    *(_DWORD *)a_rmac = *(_DWORD *)&pStSafeA->InOutBuffer.LV.Data[pStSafeA->InOutBuffer.LV.Length];
    StSafeA_ComputeRMAC(pStSafeA);
    if ( !memcmp(a_rmac, &pStSafeA->InOutBuffer.LV.Data[pStSafeA->InOutBuffer.LV.Length - 4], 4) )
    {
      pStSafeA->InOutBuffer.LV.Length -= 4;
    }
    else
    {
      *(_DWORD *)&pStSafeA->InOutBuffer.LV.Data[pStSafeA->InOutBuffer.LV.Length - 4] = *(_DWORD *)a_rmac;
      return 33;
    }
  }
  return status_code;
}
```

### Local host pairing (I2C bus encryption)

Some commands, such as the `STSAFEA_CMD_GENERATE_SIGNATURE` - among others - also support encryption for the full data stream on the I2C bus.This encryption scheme is granular, where developers can choose to encrypt only the response, the command, both, or neither.

The encryption scheme is annoyingly strong, using an AES-CBC cipher, where even the IV is generated according to [cryptographic best practices](https://crypto.stackexchange.com/questions/25844/attacking-cbc-with-predictable-but-encrypted-iv) by encrypting a counter - our old friend, the `pStSafeA->HostMacSequenceCounter`:

```c
void __cdecl ComputeInitialValue(StSafeA_Handle_t *pStSafeA, InitialValue InSubject, uint8_t *pOutInitialValue)
{
  uint32_t host_cmac_sequence_counter; // [sp+14h] [bp+14h]

  host_cmac_sequence_counter = pStSafeA->HostMacSequenceCounter;
  if ( InSubject )
    ++host_cmac_sequence_counter;
  *pOutInitialValue = BYTE2(host_cmac_sequence_counter);
  pOutInitialValue[1] = BYTE1(host_cmac_sequence_counter);
  pOutInitialValue[2] = host_cmac_sequence_counter;
  pOutInitialValue[3] = InSubject << 6;
  pOutInitialValue[4] = 0x80;
  memset(pOutInitialValue + 5, 0, 11);
}
```

This is an important step because the AES-CBC key will be reused between commands:

```c
StSafeA_ResponseCode_t __cdecl StSafeA_DataEncryption(StSafeA_Handle_t *pStSafeA)
{
  StSafeA_ResponseCode_t v1; // r3
  uint8_t initial_value[16]; // [sp+14h] [bp+Ch] BYREF
  uint8_t padding_length; // [sp+26h] [bp+1Eh]
  StSafeA_ResponseCode_t status_code; // [sp+27h] [bp+1Fh]

  status_code = STSAFEA_INVALID_PARAMETER;
  if ( pStSafeA && pStSafeA->InOutBuffer.LV.Data )
  {
    ComputeInitialValue(pStSafeA, C_ENCRYPTION, initial_value);
    v1 = StSafeA_AES_ECB_Encrypt(initial_value, initial_value, 0) ? STSAFEA_CRYPTO_LIB_ISSUE : STSAFEA_OK;
    status_code = v1;
    if ( v1 == STSAFEA_OK )
    {
      pStSafeA->InOutBuffer.LV.Data[pStSafeA->InOutBuffer.LV.Length++] = 0x80;
      padding_length = 16 - (pStSafeA->InOutBuffer.LV.Length & 0xF);
      memset(&pStSafeA->InOutBuffer.LV.Data[pStSafeA->InOutBuffer.LV.Length], 0, padding_length);
      pStSafeA->InOutBuffer.LV.Length += padding_length;
      if ( StSafeA_AES_CBC_Encrypt(
             pStSafeA->InOutBuffer.LV.Data,
             pStSafeA->InOutBuffer.LV.Length,
             pStSafeA->InOutBuffer.LV.Data,
             initial_value,
             0) )
      {
        return 32;
      }
      else
      {
        return 0;
      }
    }
  }
  return status_code;
}
```

The full list of commands that support command/response encryption can be found in the STSAFE Middleware API,`stsafea_core.c`.

### STSAFEA_USE_OPTIMIZATION_SHARED_RAM

STSAFE has some interesting optimisation options, which could have an effect on the security of the device.One such optimisation is the use of the `STSAFEA_USE_OPTIMIZATION_SHARED_RAM` flag.It is explained in the documentation as follows:

Set to 1 to optimize RAM usage.If set to 1 the `StSafeA_Handle_t.InOutBuffer` used through the Middleware APIs is shared with the application between each commad & response.It means that everytime the MW API returns a `TLVBuffer` pointer, it returns in fact a pointer to the shared `StSafeA_Handle_t.InOutBuffer`.As consequence the user shall copy data from given pointer into variable defined by himself in case data need to be stored.If set to 0 the user must specifically allocate (statically or dynamically) a right sized buffer to be passed as parameter to the Middleware command API.

If this flag is set to 1, such that RAM usage is optimised, it could lead to memory management vulnerabilities such as:

-   Time-of-check-to-time-of-use (TOCTTOU) - if the contents of the `TLVBuffer` are not correctly verified between commands (or responses) and the application (or STSAFE) uses the data from it when another command could’ve overwritten all or parts of it.Of course verifying this is easier on the local host, when a response is handled, because how the STSAFE handles the `TLVBuffer` is a black box.
-   Buffer overflows - again, if the data in the reused `TLVBuffer` is not handled correctly, for example by verifying the length field against the actual length of the data pointer, during memory copy operations, this could lead to buffer overflow vulnerabilities.

## Summary

We hope this quick runthrough of the key pair generation flow has helped the reader to understand how a secure element - and specifically the STSAFE-A110 - works under the hood.We are also releasing a Logic analyser plugin to help understand the I2C messages, which can be found [here](http://github.com/elttam/stsafe-a110-i2c-decoder). At the moment it is only able to decode the flow described in this blog post, but pull requests with additional features are welcome.
