---
title: "Pwnd Blaster: Hacking your PC using your speaker without ever touching it"
source: https://blog.nns.ee/2026/06/03/katana-badusb/
source_host: blog.nns.ee
clip_date: 2026-11-02T10:24:38+08:00
trace_id: c4978b33-862c-4eb4-b03b-8556c0fbde16
content_hash: 8ea091c3c14003ea1df8d31a9da0cbc4a54ebaa3d2945ade6e5bd677233adaa1
status: synced
tags:
  - 硬件逆向
  - 漏洞分析
series: null
feed_source: nns.ee·Android/漏洞研究
ai_summary: Creative Katana V2X 音箱固件升级无签名校验，且 CTP 命令可经蓝牙免配对调用，15 米内攻击者可 OTA 刷入恶意固件，将其变成窃听器和无线 Rubber Ducky。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 40c75244-d011-81ec-ba08-fab4e0ce2c2d
ioc:
  cves:
    - CVE-2026-55981
    - CVE-2026-63243
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Creative Katana V2X 音箱固件升级无签名校验，且 CTP 命令可经蓝牙免配对调用，15 米内攻击者可 OTA 刷入恶意固件，将其变成窃听器和无线 Rubber Ducky。
> 
> - **漏洞根源：** 固件升级仅校验可随意重算的 SHA-256（CHK2）校验和，无任何签名保护（把开机字符 WELCOME 改为 PATCHED 即验证成功）；USB 侧 CTP 虽有挑战-响应认证（静态密钥），但同一 CTP 处理器被桥接到 BLE，攻击者无需配对即可直接读写 GATT 特征值下发任意命令。
> - **攻击链实现：** 只新增 83 字节 HID 报告描述符和 102 字节 ARM/Thumb 汇编按键注入器，覆写固件中闲置的 diagnostic 任务，开机约 20 秒后自动向所连 PC 键入 `echo pwned`；真实攻击可打开 PowerShell 执行任意命令，还能封死正常与恢复模式的升级例程使恶意固件无法清除。
> - **逆向要点：** 固件基于 FreeRTOS 8.2.3，FMAIN 为 scatter-loading 多段加载（内核 0x10000000、应用 0x40000008）；需写脚本解析 movw/movt 字符串指针对建立约 1.3 万条交叉引用；覆写 CTP 回显命令 0x54 可实现内存读写执行；调用 vTaskDelay 会触发按任务看门狗重启，改用任务注入规避。
> - **影响范围：** 2026 年 6 月确认 Katana V2 同样受影响、SE 疑似中招；蓝牙常开且睡眠时无法关闭，配合麦克风可远程窃听。
> - **厂商处置：** Creative 无公开安全联系渠道，经 SingCERT 中介近两个月才回复并一度否认漏洞，后续陆续发布 1.21/1.30 修复固件，漏洞获编号 CVE-2026-55981、CVE-2026-63243；作者另发布 v2x-patcher 屏蔽蓝牙 CTP，但 Creative 一度下架官方固件下载导致该工具失效。

[In my last post](https://blog.nns.ee/2026/02/20/katana-v2x-re), I talked about reverse engineering my new Creative Sound Blaster Katana V2X's firmware.

What initially started as simply wanting to write a Linux tool for communicating with my speaker ended up with me discovering vulnerabilities which allow any attacker within a ~15M range of any Katana V2X to turn it into a covert spying tool and Rubber Ducky - all without ever having to pair with or physically touch the device.

**2026-06-07 update**: Reverse engineering the firmware for Katana V2 indicates that it's vulnerable to the same issues. As I don't have a V2 to test, I can't say this with 100% certainty, but the firmware files themselves appear to be built from the same source only three hours apart and are functionally nearly identical. The Katana SE's firmware differs more, but it's reasonable to assume that it is also vulnerable.

**2026-06-18 update**: The V2 has been tested to be vulnerable to the same issues.

### CTprotocol background

As I explained in my previous post, the Katana V2X is a USB-connected PC sound bar. Being USB-connected, Creative has an app which allows you to change the settings of the speaker - the DSP, the LED configuration, the output source, and so on.

To do this, they use a custom protocol called CTP (short for *Creative Transport Protocol* would be my guess). Basically, it seems to be a fairly simple proprietary protocol for sending various commands and reading the responses to that. I won't go into much detail here, but if you're interested, [I described how it works in my last post](https://blog.nns.ee/2026/02/20/katana-v2x-re/#reverse-engineering-the-protocol).

What's important to note, however, is that in order to do *anything* with CTP over USB, you first have to do challenge-response authentication with the device. The key is static and can be derived from the binaries that ship with the Creative App, and I'm unsure why this is even the case, but the speaker won't accept any commands until you've performed authentication. Fine.

Another thing that'll become important later is that firmware updates are also performed over CTP. That's how I initially got my hands on a firmware image - I sniffed the USB traffic using Wireshark and extracted the data from the captures.

[![Screenshot of Wireshark showing first firmware payload packet](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/684be433e7255a84.png)](https://blog.nns.ee/img/2026-02-20-katana-v2x-re/wireshark.png)

### Firmware analysis

The firmware container, which is also proprietary but is essentially a primitive Zip file, contains three parts that are of significant value.

First, there's `FBOOT`, which I previously presumed to be a bootloader (hence the name), but also contains a sort of recovery mode for the speaker. This recovery mode can be entered by holding down the SOURCE button while powering the device on, and allows you to recover from a bad state. This saved my device from being bricked many times, which I'm pretty grateful for.

The second part is `FMAIN`, which is the main firmware of the device. This runs when you boot the device "normally". While `FBOOT` implements a lot of the same functionality as `FMAIN` (they both handle CTP commands, for example), `FMAIN` is about ~6.5x larger than `FBOOT`.

Both `FBOOT` and `FMAIN` are based on a (fairly heavily-modified) version of FreeRTOS, as hinted by a string present in the binaries: `/home/jieyi/mcuos2.5/kernel/freertos-8.2.3/`.

The last part of note is `CHK2`, which is a SHA-256 checksum over the entire firmware container appended to the very end.

While not exactly shocking, considering the amount of effort that went into CTP authentication, I was a bit surprised to see that besides this `CHK2` SHA-256 checksum, which was trivial to patch, there was no other protection in place for flashing firmwares. I would've expected to find signature checks here or at the very least a `hashsum(secret_value + container_contents)` type of protection, but after reimplementing the firmware upgrade functionality in my own tool [v2x-ctl](https://crates.io/crates/v2x), I found that the device happily accepts patched firmwares as long as `CHK2` is correct.

To test this, I made a pretty simple modification - I replaced the string `WELCOME`, which is shown on the segment display on the device when booting up, with `PATCHED`. After flashing the firmware and rebooting the device, I was happy to see my string being shown to me:

[![Image of the front segment display of the device showing the text PATCHED](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5e9d64c6bc2249f6.jpg)](https://blog.nns.ee/img/2026-04-08-katana-badusb/patched.jpg)

The hacker part of me thinks this is great - people should be able to do what they want with the devices they've bought and own. The security professional part of me thinks that having absolutely *no* protection in place (like having to unlock a bootloader for mobile devices) is pretty bad practice. But it's not exactly the end of the world if you need physical access to update the device over USB.

If.

### Everybody loves Bluetooth

Like all "self-respecting" speakers these days, of course the Katana V2X also needs to have Bluetooth, even though it's most likely going to spend most of its life wired up to a PC or gaming console.

And *of course* Creative needs to have an app which lets you control the speaker's settings and fancy LED lights from your phone over Bluetooth.

The way BLE (Bluetooth Low Energy) works is that each device has various registers (called *GATT characteristics*) that, if you're connected to the device, you can write to, read, subscribe to notifications for, and so on. What's important to note is that to connect to a device, you don't need to (necessarily) pair with it. You can often just connect with a device and immediately start reading and writing data to characteristics. Pairing establishes encryption, but a connection can be made without it.

While digging through the Katana's firmware, I discovered that the internal CTP handler is bridged to both USB and apparently Bluetooth:

[![Ghidra decompiler output for the function CtpService\_Init](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e32a07dc6640655c.png)](https://blog.nns.ee/img/2026-04-08-katana-badusb/ctp-init.png)

Intrigued by this, I downloaded the Creative mobile app and tried connecting to my speaker.

"Please press the POWER button to pair."

I wondered how this pairing process worked, exactly. Maybe it used the same authentication scheme as for USB and maybe I could just use the shared secret to authenticate with *any* speaker over Bluetooth, as [was the case with my e-scooter](https://blog.nns.ee/2026/01/06/aike-ble/).

I set up a Bluetooth sniffing environment and observed that in order to initiate the pairing process, the phone wrote a payload like `5a 0b...` to a characteristic `9e9daaec-3a10-4fe8-b69f-7397aff77886`, and read a response from characteristic `9e9daaeb-3a10-4fe8-b69f-7397aff77886`.

`5a` had me very, very suspicious, as it's the same byte that all CTP commands start with. Out of a hunch, I connected to the device over Bluetooth from my laptop and wrote the payload `5a 09 01 02`, which is the CTP command for reading the firmware version, and requires authentication to send over USB.

To my surprise, upon reading the characteristic `9e9daaeb-3a10-4fe8-b69f-7397aff77886`, I was greeted with the full version string. This means anyone can just connect to any Katana V2X over Bluetooth and start sending CTP commands to it, reading information, changing settings, etc.

### Over-the-air updates (the bad kind)

It didn't take me too long to connect the dots that firmware upgrades were also performed over CTP. Combined with the fact that anyone can construct valid custom firmware, I wondered if it was possible for an attacker to simply upload a custom firmware over Bluetooth without ever having to authenticate or pair.

After wrestling with a few BLE quirks (which I'll describe in detail later in this article), I wrote a relatively simple Python script that does exactly what my `v2x-ctl` tool does to upgrade firmware, but over Bluetooth instead. Using that, I attempted to upload the modified firmware I had crafted earlier to my speaker. Since BLE is quite slow, it took around 10 minutes to finish, but after it was done, I was once again greeted with my lovely "PATCHED" welcome message.

I thought of the implications for a bit. The speaker has a microphone. An attacker could, theoretically, upload a custom firmware that effectively turns the speaker into a covert monitoring device, listening in on conversations and forwarding them to a receiver over Bluetooth.

What was more interesting to me was the fact that the speaker is, in a standard setup, connected to a PC over USB. It's by all means a trusted USB device.

What if we wrote custom firmware that forced the speaker into acting as a keyboard, sending keystrokes for opening up the terminal and executing arbitrary commands? We would turn the speaker into a [Rubber Ducky](https://shop.hak5.org/products/usb-rubber-ducky), but remotely, without ever having to plug anything into either the speaker or the PC.

### Living off the kernel land

At first, I thought this would be a herculean task. Since I don't have access to the source code of the firmware, I would have to somehow jury-rig in an entire section of code that sets the device up as a HID (*human interface device*) USB device (if that's even possible for this SoC), a procedure for then using this to send keystrokes to the PC over USB, and continuing to run the rest of the code in the firmware so the speaker would still behave as normal.

However, after digging around some more in the firmware, I realized it's likely not as difficult as it seems.

First off, it turns out the speaker already sets itself up as a HID device. Not as a full keyboard, mind you, but as a Consumer Control device - basically letting the speaker change the volume and media status (play/pause) on the PC, but not much else.

This could be seen in the kernel logs:

[![dmesg output showing Katana Consumer Control HID device](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/75f27c711dde2a90.png)](https://blog.nns.ee/img/2026-04-08-katana-badusb/dmesg-before.png)

The way this is done with USB devices is that the device presents the PC with a USB descriptor set, which is basically a report of its capabilities, what it can do, how many interfaces to enumerate, and so on.

The report descriptor in the firmware was pretty easy to locate and to my luck, it had enough space to append a second report descriptor entry that also presented the device as a keyboard. Running `dmesg` now shows that the device also reports being a keyboard:

[![dmesg output showing Katana Keyboard HID device](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8d095675c7f11f6b.png)](https://blog.nns.ee/img/2026-04-08-katana-badusb/dmesg-after.png)

The second issue was sending actual HID data and emulating keystrokes. Much to my luck, the firmware already had a neatly usable routine for sending HID data, all I had to do was provide it with data (the key to press or unpress) and call it.

The third issue I struggled with quite a bit. It was difficult to find enough free space that I could write in (which would get properly mapped in memory or wouldn't immediately crash the device when booting), finding a trampoline that worked properly and didn't crash returning back to the normal instruction flow, etc.

I eventually realized that if this is running on FreeRTOS, there's likely numerous tasks being executed on boot anyways. I don't need to write a trampoline and juggle the execution flow, I can just overwrite an existing task and let the firmware spawn it for me. I ended up finding a `diagnostic` task, which didn't seem to do anything in normal use - from what I could tell, it was only used for gathering diagnostic data from a DSP coprocessor.

I overwrote that task with a task that:

1.  Waits ~20 seconds for the speaker to boot and bring up the USB subsystem
2.  Types in `echo pwned` and hits enter, with ~20ms between each keystroke
3.  Ends the task, leaving the rest of the speaker's functionality intact

This would be executed every time the device booted up.

The patches ended up being pretty minimal - only 83 bytes for the USB report and 102 bytes of hand-written ARM/Thumb assembly for the keystroke injector, plus 2 bytes for every keystroke I wanted to send.

### The result

Chaining it all together, I was able to totally remotely, over the air, upload a custom firmware to my speaker which I hadn't paired with, which would reboot, flash the custom firmware, and after rebooting type in the command `echo pwned` and execute it.

[![Terminal output showing patching and flashing the firmware, and the speaker typing in "echo pwned" and pressing enter after rebooting](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4d4455d33fca5359.png)](https://blog.nns.ee/img/2026-04-08-katana-badusb/poc.png)

In a real attack scenario, I would execute the keystrokes for opening `powershell.exe` or similar and paste an actually malicious one-liner into that, but as a proof of concept, this was more than enough for me. A real attacker would also likely disable the routine for updating the firmware in both normal and recovery mode, making it impossible to wipe the malicious firmware from the device or patch it in the future.

This is worsened by the fact that Bluetooth is *always on* for the speaker, even in sleep mode, with no apparent way to disable it.

### Remediation

Getting in touch with Creative was a frustrating process.

They do not have any security contacts. In fact, I wasn't even able to find regular contacts that wasn't just a support form on their website. I tried (two times) to get in contact with them via the web form before giving up and contacting SingCERT to act as an intermediary, hoping they would have better luck reaching Creative.

Initially, SingCERT didn't seem to be able to get in contact with Creative either. It took Creative nearly two months to respond to SingCERT. Unfortunately, their response was that "they do not consider this to be a vulnerability, as it does not present a cybersecurity risk". I don't know how they reached this conclusion, but it became clear that Creative had no interest in responding to or addressing this issue.

Due to this, there are no patches currently available via Creative themselves. The latest firmware is vulnerable.

As a partial remedy, to ensure that people are still able to use these devices securely, I wrote a patch for the firmware that blocks CTP-over-Bluetooth. This likely breaks the Creative mobile app, but without the source code, it's fairly hard to patch the firmware with proper authentication in-place.

If you're interested in using this patch, I've created a tool that downloads the official firmware from Creative's servers, patches it in memory, and uploads it to your USB-connected Katana V2X. You can get it from the releases page here: [https://git.dog/xx/v2x-patcher](https://git.dog/xx/v2x-patcher) (or build it yourself with `cargo` if you want to inspect the patches beforehand).

**Update: As of 2026-06-07**, Creative has pulled all of the URLs for downloading firmware for the Katana V2/V2X/SE, and they can no longer be accessed. As the tool relied on the URLs to fetch clean firmware from Creative's servers (so as to not redistribute intellectual property), Creative has effectively bricked the patcher. Considering they've also not pushed a new, fixed firmware, people with Sound Blaster Katanas are now permanently vulnerable with no possible remedy unless they can obtain the clean firmware files from a third party.

**2026-06-18 update:** Creative has reached out to me and stated the following:

> We also want to acknowledge the frustrating experience you had when trying to contact us through our support form. On review, we found that your message had been automatically flagged as spam by our support system, which is why you did not receive a Case ID or acknowledgement. We have corrected this so that legitimate security reports are no longer caught by that filter, and we are looking at putting a dedicated channel in place to make disclosures like yours more straightforward going forward.
> 
> The team is already developing a series of fixes to address the issues you identified.

* * *

## The nitty gritty

What follows are a few technical details of the reverse engineering process and the binary patches in no specific order.

### Memory layout woes

For Ghidra's (or any other RE toolkit's) automatic analysis to work properly, the binary needs to have the correct base address. Otherwise, pointers calculated using the base address will point to the wrong data and you'll just get disassembly that doesn't make much sense.

With `FMAIN.bin`, I struggled quite a bit. It wasn't enough to simply load the firmware with what I assumed to be the correct base (`0x10000000`). When I loaded the binary using this base, the auto-analysis seemed to produce valid results, the startup code and FreeRTOS core seemed correct, but after that brief section in the beginning, auto-analysis seemed to fail and produce garbage.

As it turns out, `FMAIN.bin` is not a monolithic image and is instead [scatter-loaded](https://developer.arm.com/documentation/dui0803/b/Scatter-loading-Features/Overview-of-scatter-loading), with different sections of the firmware loaded at different addresses.

I didn't find any easy way to read what the correct memory map should be, but I deduced (and later verified by reading memory right off the device, when I was able to patch and upload firmware) the following layout:

| File Offset | Address | Content |
| --- | --- | --- |
| `0x0000` - `0x89EF` | `0x10000000` | Kernel code: vector table, startup, FreeRTOS core, exception handlers |
| `0x89F0` - `0xBDDC7` | `0x40000008` | App code: main application, drivers, task handlers |
| `0xBDDC8` - `0x164A0B` | N/A | Const/read-only data: DSP coefficients, config tables? |
| `0x164A0C` - `0x1682DB` | `0x100089E8` | .data init values for kernel SRAM |
| `0x1682DC` - `0x16B003` | `0x400B5400` | .data init values for app RAM |

Using this memory map in Ghidra seemed to actually produce valid analysis results.

### String x-refs for ARM firmware

Even though my memory map was correct, I was still not getting many X-refs defined for my strings. Some strings were referenced by some functions, but this seemed inconsistent and most strings seemed to be wholly unreferenced, which didn't make any sense.

Working back from what I assumed to be the `log` method in the firmware, I realized that string pointers weren't being loaded directly. Instead, string pointers were loaded using a pair of `movw` and `movt` instructions:

```plain
movw r0, #0x29A4   ; low 16 bits
movt r0, #0x400A   ; high 16 bits, r0 = 0x400A29A4
```

I tried searching online, but didn't find much information on why exactly Ghidra's analysis seems to not recognize these as pointers to strings (perhaps the scatter-loading?), but I wrote a script that went over all `movw` / `movt` pairs which loaded into the same register, filtered out the ones pointing to valid memory, and set up DATA references to those. This created ~13k references and made my life so much easier.

### Firmware patches for reading, writing and executing memory

After I figured out how to modify the firmware and inject my own code, the first order of business was setting up a method of reading, writing and executing memory. This was important for a few reasons, but most importantly for verifying the actual memory layout, reading what was going on in the heap, and being able to write and execute payloads on the fly without having to patch the firmware itself and flash it. Flashing the firmware was sloooow, and a lot of my RE time was taken up simply waiting for the firmware to upload to the device, the device to reboot, realize that my patches were wrong and the device is bootlooping or has been bricked, rebooting into recovery mode (which required pulling the power), and repeating the whole process again.

To set up these handlers, I decided that the best way to implement this would to overwrite a CTP handler that already exists and is properly routed, but which doesn't do anything important. The CTP opcode `0x54` seemed like a pretty good candidate, all it did was echo back the data it was sent, and the handler was about 106 bytes long. This seemed a bit tight to fit three commands into, but ended up being just barely enough room to work with - my final handler with all three commands implemented ended up being 96 bytes long.

On the host side, I simply modified my v2x-ctl tool to support this custom CTP command. With this, I was able to execute arbitrary code over USB without having to reflash the whole firmware, which made testing patches etc so much more convenient.

### Watchdogs doing their jobs

While writing the payload for sending HID commands, I kept running into an issue where my code, which was seemingly fine and worked for sending singular keypresses, rebooted the device whenever I tried to implement sending multiple keypresses.

This was before I came up with the "replace an existing task" approach, and was simply running my payload using `mem-exec` as I described above. The weirdest thing was that the device seemed to crash when I called a benign function `vTaskDelay` built into FreeRTOS to add a small delay between each keypress event.

It turns out that Creative had implemented per-task watchdog timers, and if a critical task was taking too long, the OS would panic and reboot (my best guess). When I called `vTaskDelay` through `mem-exec`, I was calling it in the USB handling task context. The delays for each character added up, the watchdog timer wasn't being kicked in time, and the system rebooted.

This issue fixed itself when I injected my code into the diagnostic service task instead of calling it from the USB task directly.

All tests and reverse engineering was performed on the firmware version `1.3.230619.1820`.

* * *

### Timeline

-   **01/04/2026** - Attempt 1 to get in contact with vendor via their support form (vendor lacks any public security contacts)
-   **07/04/2026** - Attempt 2 to get in contact with vendor via their support form
-   **09/04/2026** - Submission of vulnerabilities to SingCERT
-   **16/04/2026** - Response from SingCERT requesting further information
-   **16/04/2026** - Sent additional details to SingCERT
-   **20/04/2026** - Response from SingCERT requesting further information
-   **20/04/2026** - Sent additional details to SingCERT
-   **20/04/2026** - Response from SingCERT acknowledging the report and confirming they've reached out to vendor
-   **08/05/2026** - Email from SingCERT stating they've been unable to reach the vendor and asking whether they should continue attempting to follow up
-   **08/05/2026** - Sent confirmation to SingCERT
-   **25/05/2026** - Email from SingCERT stating vendor has responded and is aware of the case
-   **03/06/2026** - Email from SingCERT stating vendor "do not consider this to be a vulnerability, as it does not present a cybersecurity risk."
-   **03/06/2026** - Write-up published
-   **11/06/2026** - Vendor reaches out to researcher
-   **12/06/2026** - Response to vendor
-   **15/05/2026** - Vendor confirms the vulnerabilities and states they are working on a fix but is unable to give a timeframe for when fixes will be published
-   **25/06/2026** - Firmware version 1.20.260617.1110 released by vendor
-   **26/06/2026** - Attempt to contact vendor and provide feedback on insufficient fixes
-   **26/06/2026** - Vendor informs me of the updated version 1.20.260617.1110 simultaneously (emails sent ~30 seconds apart)
-   **26/06/2026** - Vendor acknowledges the report
-   **02/07/2026** - Firmware version 1.21.260630.1200 released by vendor
-   **02/07/2026** - Vendor informs me of the updated version 1.21.260630.1200
-   **02/07/2026** - Updated firmware version reviewed and fixes detailed in article
-   **03/07/2026** - [Second write-up](https://blog.nns.ee/2026/07/03/katana-badusb-fix/) published
-   **27/08/2026** - Firmware version 1.30.260813.1100 released by vendor
-   **27/08/2026** - Vendor informs me of the updated version
-   **28/08/2026** - Write-up updated with information on the new release
-   **07/10/2026** - SingCERT assigns the vulnerabilities the IDs **CVE-2026-55981** and **CVE-2026-63243**, and publishes [advisory AL-2026-134](https://www.csa.gov.sg/alerts-and-advisories/alerts/al-2026-134/)
