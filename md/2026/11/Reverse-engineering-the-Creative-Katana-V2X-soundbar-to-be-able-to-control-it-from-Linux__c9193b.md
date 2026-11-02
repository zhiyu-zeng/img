---
title: Reverse engineering the Creative Katana V2X soundbar to be able to control it from Linux
source: https://blog.nns.ee/2026/02/20/katana-v2x-re/
source_host: blog.nns.ee
clip_date: 2026-11-02T10:16:00+08:00
trace_id: 7adcff49-9455-4a3b-a8b1-c4730799aed3
content_hash: 333f206d47eaa67a783653925caefe6f730878ec434a28cea547301eb9dd9e26
status: synced
tags:
  - 协议分析
  - 硬件逆向
series: null
feed_source: nns.ee·Android/漏洞研究
ai_summary: TL;DR：作者逆向 Creative Katana V2X 音箱的 USB 协议与 AES-256-GCM 挑战响应认证，用 Rust 写出 Linux 开源控制工具 v2x-ctl，并提取出固件。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 40c75244-d011-819f-b81d-d10f568be003
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：作者逆向 Creative Katana V2X 音箱的 USB 协议与 AES-256-GCM 挑战响应认证，用 Rust 写出 Linux 开源控制工具 v2x-ctl，并提取出固件。
> 
> - **通信协议：** 设备经 USB CDC ACM 串口暴露为 Linux 的 `/dev/ttyACM*`，私有命令采用简单帧格式 `5A [cmd] [len] [payload]`，如查询固件版本 `5a 09 01 02`。
> - **认证机制：** 发命令前需通过 `whoareyou`/`unlock` 挑战响应——用 AES-256-GCM 加密设备 32 字节 nonce 回传；密钥由挑战头、CTCDC.dll 静态数据（Ghidra 分析获得）和 USB PID 拼接而成，对此设备等效硬编码，作者认为用 GCM 替代常规 HMAC 属于多余设计。
> - **分析方法：** 官方 .NET 应用（dnSpy 查看）大量模块被混淆，遂转向 Wireshark + USBPcap 抓包，花一天逐项操作生成约 100 份抓包逐一比对；在 .NET 程序集中搜不到关键字后，用 `grep whoareyou` 定位到真正的逻辑在二进制 DLL 中。
> - **工具产出：** 发布 Rust 库与 CLI 工具 v2x-ctl，仅在最新固件 1.3.230619.1820 上验证；用于其他 Sound Blaster 设备需改认证密钥和硬编码 ID。
> - **固件提取：** 编写 tshark 脚本从升级抓包还原出 CIFF 容器（含 CINF/CIN2/DATA/CHK2 段及 SHA-256 校验），内有 ARM32 bootloader、FreeRTOS 主固件、Opus 音频提示包和 8051 MCU 固件，作者计划后续分析。

I recently purchased a Creative Sound Blaster Katana V2X soundbar (what a mouthful) to replace my old, cheap Logitech computer speakers. They served me well, but listening to music or watching movies was not the best-sounding experience.

After arriving, I set it up and realized it had an USB port which, aside from being able to use it as an audio input, allows the user to configure the speaker: Set the EQ, set the LED lights in different modes, etc. The unfortunate part of this was the fact that it requires the (proprietary) Creative App to use. What's more, it only seems to be available for Windows, which I don't use. While using it in a VM worked, it was hardly convenient.

This seemed like the perfect opportunity for something I love: Reverse engineering proprietary applications, devices and protocols and writing tools to communicate with them.

[![The soundbar in question](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e344a89b71216995.png)](https://blog.nns.ee/img/2026-02-20-katana-v2x-re/v2x.png)

### Initial recon

From just looking at the directory where the Creative App was installed, I could tell this was a.NET app. They usually have a fairly large amount of DLLs `Named.Like.This.dll`, each corresponding to a C# module. The `.exe.config` file is also a giveaway.

[![Directory listing of where the Creative App is installed](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a23273354e7d03f1.png)](https://blog.nns.ee/img/2026-02-20-katana-v2x-re/dir.png)

My suspicion was confirmed when I loaded the exe and corresponding DLLs up in [dnSpy](https://github.com/dnSpyEx/dnSpy), a.NET disassembler. Unfortunately, I also realized that a large portion of the modules were obfuscated and fairly hard to read.

[![Screenshot of dnSpy showing obfuscated code](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/05e0b2041e3206f7.png)](https://blog.nns.ee/img/2026-02-20-katana-v2x-re/obfuscated.png)

Deciding to leave this aside for now, I turned my focus on the USB comms themselves. Having no clue how the speaker even communicated with the app, I started recording all USB traffic with [Wireshark](https://www.wireshark.org/) and [USBPcap](https://desowin.org/usbpcap/). I did this before even opening the app, as I wanted to capture as much communication as possible.

The first thing the application told me when it found my soundbar was that it needed a firmware upgrade. I let it upgrade, and inspected the USBPcap output. The actual firmware update payload was easily recognizable, as the packets were much larger than any surrounding packets, and fortunately it seemed to be a plaintext firmware blob!

[![Screenshot of Wireshark showing first firmware payload packet](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/684be433e7255a84.png)](https://blog.nns.ee/img/2026-02-20-katana-v2x-re/wireshark.png)

I did write a script to extract the entire firmware file from the packet capture - more on this later.

### Reverse engineering the protocol

[![The Creative App](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/38782f75eb1b7e41.png)](https://blog.nns.ee/img/2026-02-20-katana-v2x-re/app.png)

In order to have captures of everything the application lets the user do, I methodologically started going through each of the options, clicking things, changing things, and creating a separate capture file for each operation. This took me around an entire day and resulted in ~100 different captures.

This allowed me to analyze the packets, write down notes on what does what, and after a while I had a pretty clear picture of how the protocol works.

The communication happens over the CDC ACM serial interface, and the speaker actually exposes itself on Linux over `/dev/ttyACM*`.

All of the proprietary commands use a simple framing:

```plain
5A [cmd] [len] [payload...]
```

The `0x5A` is always static and is likely just the command start marker. `cmd` is the command opcode for whatever you're trying to do. `len`, as the name suggests, is the number of payload bytes following and `payload` is the payload (or subcommand) itself.

Responses are fairly similar, usually with a byte indicating it's a response.

I won't go over all of the different commands, but as an example, here's an example command for requesting the current FW version (as a subcommand) and the corresponding response:

```plain
Host -> Device:  5a 09 01 02
Device -> Host:  5a 09 12 02 10 "1.3.230619.1820\0"
```

### Authentication

Before you're even able to send commands, you're supposed to pass a challenge-response authentication to put the device in a mode where it accepts commands. I'm not really sure why this was done - maybe Creative *really* doesn't want people using third party applications to control the devices they own? In any case, I reverse engineered this as well.

From the first capture, I could see that one of the first comms between the device and the host were as follows:

```plain
Host -> Device:  "whoareyou.MyApp8\r\n"
Device -> Host:  "whoareyou" 1e 04 83 32 [32 random bytes] "\r\n"
Host -> Device:  "unlock" [64 random bytes] "\r\n"
Device -> Host:  "unlock_OK\r\n"
Host -> Device:  "SW_MODE1\r\n"
[... binary comms ...]
```

This seemed to be some sort of challenge-response, and the 64 random bytes made me initially consider a simple (HMAC-)SHA512. However, searching through the assemblies in dnSpy for anything calling SHA512 (or any hashing algos, for that matter) didn't come up with anything that seemed relevant. In fact, even searching simply for the string `whoareyou` came up with nothing. Taking a step back, I ran a `grep whoareyou` on all of the files, and found out that only the binary DLL `CTCDC.dll` matched.

Loading this up in Ghidra and going through the X-refs, I ended up on the function that seemed to be responsible for the initial communication with the device, as evident by checking for responses such as `Unknown command` and `NotYet`.

[![Screenshot of Ghidra showing decompiled function](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/096d6286df1f18d1.png)](https://blog.nns.ee/img/2026-02-20-katana-v2x-re/ghidra.png)

Analyzing this function, I was able to deduce that it wasn't using SHA at all, but rather some weird AES-256-GCM based authentication.

The challenge message format:

```plain
whoareyou [1E 04] [83 32] [32-byte nonce] \r\n
           │       └─ Device type (USB PID 0x3283 LE)
           └─ Challenge header
```

The application encrypts the device's 32-byte nonce using AES-256-GCM using the following key:

```plain
1e 04 d3 1a 21 27 9b e3 46 f0 99 9d 6e c4 c3 fe
be 98 90 18 69 c1 18 fb b1 25 6e 0c e0 7b 83 32
```

The key itself isn't stored in the DLL directly, but is constructed from the challenge message itself and some static data in the DLL:

-   Bytes 0-1: challenge header (`1E 04`)
-   Bytes 2-3: DLL static (`D3 1A`)
-   Bytes 4-27: DLL static (24 bytes from 0x101dba78)
-   Bytes 28-29: DLL static (`E0 7B`)
-   Bytes 30-31: USB PID bytes from challenge (`83 32`)

Since the challenge header is device-constant, the key is effectively hardcoded for this specific device, but I imagine this challenge-response mechanism is shared with other devices, where the key would differ.

The response is computed as so:

1.  Generate 16 random bytes for the `iv` value
2.  Use `iv[0:12]` as the GCM nonce
3.  Encrypt the 32-byte challenge nonce: `(ciphertext, tag) = AES-256-GCM(key, iv[:12], nonce)`
4.  Response = `"unlock"` + `iv` + `ciphertext` + `tag` + `"\r\n"`

This is fairly unusual - typically, the tool for proving that you know a shared secret is HMAC. I'm not sure why Creative felt the need to jump through so many hoops to make something that achieves essentially the same thing. This encryption scheme provides integrity and confidentiality, but the latter seems pointless here, as the nonce is already known to both sides. Only the integrity proof matters. Maybe I'm missing something here, but it just seems strange overall.

### v2x-ctl

Having pretty much all of the missing pieces I needed, I was able to create a Rust library and CLI application called [v2x-ctl](https://crates.io/crates/v2x) (or simply `v2x`).

If you happen to have a Katana V2X and want to be able to control its settings from Linux, give it a try! It was made on a best-effort basis, I made sure everything more-or-less worked, but only on the latest FW version (`1.3.230619.1820`). It's also entirely possible that the application would theoretically work for other Sound Blaster devices as well, but not without at least modifying the challenge encryption key and some of the IDs I've currently hardcoded. In any case, if you happen to be interested and try it out, [let me know how it goes](https://blog.nns.ee/contact).

### Extracting the firmware

Circling back to the firmware upgrade capture, I could deduce the following packet structure for each of the payload packets:

```plain
[0:2]  5b 98         - start marker
[2:4]  remaining_len - u16le, length of everything after this field
[4]    04            - command (firmware data write)
[5]    seq           - sequence counter (resets every 32 packets)
[6:8]  payload_len   - u16le, length of firmware data in this packet
```

Knowing this, I wrote a script that extracted the data from the capture using `tshark`.

I was left with a file identifying itself as `CIFF`, which supposedly stands for "Creative Image File Format", and is a container with different sections. The file I had had four types of sections: `CINF` (the device info, an UTF-16LE string), `CIN2` (version info), `DATA` (the firmware binary itself), and `CHK2` (the checksum).

Specifically, the CIFF format itself seems to be:

| Offset | Size | Description |
| --- | --- | --- |
| `0x00` | 4   | Magic: `CIFF` |
| `0x04` | 4   | u32 payload_size (everything after this field, up to but NOT including `CHK2`) |
| `0x08` | ... | Sections (`CINF`, `CIN2`, `DATA`..., `CHK2`) |

Each section follows the same TLV envelope:

| Offset | Size | Description |
| --- | --- | --- |
| `0x00` | 4   | Magic |
| `0x04` | 4   | u32 section_size (bytes after this field) |
| `0x08` | N   | Section payload |

In the firmware file I extracted, there were multiple `DATA` sections with two different sub-types.

The first one is the `F` -type, which I named so because its name starts with F, which I assume stands for *firmware*. The name is a null-terminated UTF-16LE string, padded to 32 bytes, followed by the raw binary data.

The second type is the `H` -type, for a similar reason, but I don't really know what the `H` stands for in this case, maybe *host resource*? In any case, the name for this type is padded to 512 bytes, not just 32, but otherwise follows the same structure.

The `CHK2` section is a 32-byte SHA256 hash computed over all bytes between the CIFF header (after offset `0x08`) to the start of the `CHK2` section, covering everything inbetween.

As an overview, here's what the firmware container I extracted looks like:

| #   | Magic | Name | Offset | Size | Content |
| --- | --- | --- | --- | --- | --- |
| 0   | `CINF` | \-  | `0x0008` | 96  | "Creative MarvelX One" |
| 1   | `CIN2` | \-  | `0x0070` | 12  | Version data |
| 2   | `DATA` | `FBOOT` | `0x0084` | 231,208 | ARM32 bootloader |
| 3   | `DATA` | `FMAIN` | `0x387B4` | 1,486,904 | ARM32 main firmware (FreeRTOS) |
| 4   | `DATA` | `Hres/audio/audioprompts-en.pkg` | `0x1A37F4` | 41,472 | Audio prompts (Opus) |
| 5   | `DATA` | `Hbin/marvelX-malcolm.bin` | `0x1AD9FC` | 291,430 | 8051 MCU firmware |
| 6   | `CHK2` | \-  | `0x1F4C6A` | 32  | SHA-256 checksum |

The `BOOT` and `MAIN` firmwares are interesting and I will be taking a look at them next.
