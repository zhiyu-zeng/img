---
title: How I discovered that Bill Gates monopolized ACPI in order to break Linux
source: https://enaix.github.io/2025/06/03/acpi-conspiracy.html
source_host: enaix.github.io
clip_date: 2026-11-04T10:26:06+08:00
trace_id: 5e4611ab-0b17-455a-a89a-94abd4874290
content_hash: 2a80860a1b66ffe56a50e84d36aef590b55f586ced96c582729ae461ce6b9ab9
status: synced
tags:
  - 内核
  - 协议分析
series: null
feed_source: enaix·Android/RE
ai_summary: 修 Steam Deck 电池时发现 ACPI 规范缺失 SMBus 关键地址信息，而 1999 年盖茨备忘录显示 ACPI 曾被刻意设计成依赖 Windows 驱动、阻碍 Linux。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40e75244-d011-81af-a0fb-d0738860feaf
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 修 Steam Deck 电池时发现 ACPI 规范缺失 SMBus 关键地址信息，而 1999 年盖茨备忘录显示 ACPI 曾被刻意设计成依赖 Windows 驱动、阻碍 Linux。
> 
> - **起因：** Steam Deck 智能电池控制器进入永久失效（Permanent Failure）模式，需经 SMBus 发送 `ManufacturerAccess` 特殊命令解锁；用 i2c-tools 尝试失败，发现 SMBus 实际接在嵌入式控制器（EC）而非 I2C 总线上。
> - **技术卡点：** 内核 `sbs.c`/`sbshc.c` 驱动要求存在 HID 为 `ACPI0001`/`ACPI0005` 且带 `_EC` 方法的 ACPI 设备来获取 SMBus 地址偏移，但 Steam Deck 的 ITE SuperIO 上该设备根本不存在，驱动无法加载。
> - **规范缺陷：** ACPI 官方规范承认地址偏移必不可少，却不提供任何获取途径，等于要求 OS“恰好自带”对应控制器的专有驱动；而占 EC 市场 90% 以上的 ITE 对约一半芯片不公开数据手册。
> - **历史真相：** 1999 年比尔·盖茨内部备忘录（属“Halloween documents”泄露文件）建议把 ACPI 扩展做成 Windows 专属、API 偏向 NT 甚至申请专利，避免 Linux 无偿受益；Linus 曾称 ACPI 是“全方位的设计灾难”。
> - **后续行动：** 作者认为这是 ACPI 自身问题而非 Valve 失误，将开发 sbsutil 工具、尝试给 `sbshc` 驱动打补丁，并计划向 Valve 报告此 bug。

![acpi conspiracy](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2051bcf2d2f797bc.png)

*(Feel free to skip to the Bill Gates section for the non-technical part)*

While I was working on my first preprint mid-May, my Steam Deck suddenly broke. The charging circuit couldn’t negotiate the voltage, something went wrong and the smart battery controller entered in permanent failure mode. We managed to desolder the lithium cells from the battery package PCB and replaced the fuse, but the controller still wouldn’t take charge. While reading the [bq40zxy protocol](https://www.ti.com/lit/ug/sluua43a/sluua43a.pdf), I’ve discovered that it is possible to disable *PERMANENT FAILURE* mode by calling a special `ManufacturerAccess` Smart Battery System (SBS) command, which is done over the SMBus. And so, the adventure began.

## How do I talk to the SBS controller?

As SMBus is derived from I2C and these protocols are closely related, the intuition was that I could access SMBus using the `i2c-tools` driver, which provides this functionality using `<i2c/smbus.h>`. I wrote a simple SBS utility, tested the devices which exposed the `0xb` battery address and got… nothing. The only responding device returned plain zeros. I was trying to find the mistake in my code, cross-checked every line in my code against [another SBS driver (ROS node) implementation](https://github.com/emersonknapp/smart_battery_driver), but I didn’t find any error. The reason was that in my case the SMBus was simply connected to the embedded controller (EC), not the I2C bus.

### Into the EC rabbithole

Embedded Controller (aka EC, SuperIO) is the modern IBM PC equivalent of various I/O logic circuitry which handles legacy stuff (PS/2, floppy, serial and parralel ports) and modern subsystems (ACPI, GPIO, fan, thermals, SMBus, etc). The main way to communicate to the controller is through the kernel using the [linux/drivers/acpi/ec.c](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/drivers/acpi/ec.c) driver, which effectively writes to the CPU IO pins as described in [this article on I/O ports usage](https://tldp.org/HOWTO/IO-Port-Programming-2.html). `ec_read()` and `ec_write()` commands are great, but I don’t know neither the addressnor the protocol format for telling the EC chip to execute the SMBus transaction. At this point there is almost no documentation on this kind of stuff, so the best bet was to analyze how the kernel operates with the hardware.

Thankfully, the kernel already has the driver for communicating to the SBS over SMBus through EC: [linux/drivers/acpi/sbs.c](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/drivers/acpi/sbs.c) handles the SBS protocol, while [linux/drivers/acpi/sbshc.c](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/tree/drivers/acpi/sbshc.c) performs direct calls to the EC and executes SMBus transactions. So I started digging how this driver works and found that it finds ACPI devices with `hid` equal to `ACPI0001` or `ACPI0005`, calls the ACPI `_EC` method and calculates the value `(val >> 8) & 0xff;` as the address to send SMBus packages. Huh.. This is an oddly specific way to simply start talking to the bus. At least the kernel driver handles.. **it does not. The driver couldn’t load the device.** In order to investigate this, I needed to try calling this method and seeing what it outputs. *(As at that time I haven’t lost the hope in finding the solution yet, I’ve tried writing the userspace driver to avoid writing a whole kernel module. Wasted lots of time and ended up writing the `sbsctl` module. Silly me…)*

This started to get weird, since there were no devices with such HIDs. I thought that the device could be under a different hid, but calling the exact same `_EC` module as in `sbshc.c` resulted in failure for the most likely candidates. At the same time `ec.c` successfully found the EC under `\_SB_.PCI0.LPC0.EC0_`, but this device doesn’t have a `_EC` method! Like.. What? How do I get the offset then?

## This is where the fun begins

Long story short, the OS needs some standardized way to access various devices, since it doesn’t know which devices are present and how to access them. ACPI is the interface between the motherboard (hardware) components and the OS which is designed to do exactly this: act as a robust layer between software and hardware, which minimizes the chance of calling a command at a wrong address and causing hardware damage. Except that it provides all information in a custom domain-specific language called ASL (?) with no guaranteed error-prone way of parsing it (??) other than praying that the `iasl` (Intel ASL compiler, part of the Linux kernel) correctly parses the tables (???) or simply giving up and using Windows with their Microsoft ASL compiler (?!!)

I get that the environment ACPI needs to operate in is complex, but I just need to simply get an address to send SMBus commands, and ACPI fails at the single task it needs to do??

OK, but what about the official specification? Perhaps there is a bug in the driver, and there is a reasonable explanation to all of this.. [ACPI specs describing how to access the SMBus](https://uefi.org/htmlspecs/ACPI_Spec_6_4_html/13_ACPI_System_Mgmt_Bus_Interface_Spec/accessing-the-smbus-from-asl-code.html) tells us that the SMBus controller built into the EC must be present as a `ACPI0001` or `ACPI0005` and should indeed have the `_EC` method, which provides the address offset and the query bit. The Steam Deck indeed has the ITE SuperIO controller with builtin SMBus functionality, but the ACPI device is not present. At the same time, a separate SMBus controller should be loaded under a custom HID with no way of providing essential info, and the specs tells that the OS should somehow handle this:

> Regardless of the type of hardware, some OS software element (for example, the SMBus HC driver) must register with OSPM to support all SMBus operation regions defined for the segment. This software allows the generic SMBus interface defined in this section to be used on a specific hardware implementation by translating between the conceptual (for example, SMBus address space) and physical (for example, process of writing/reading registers) models. Because of this linkage, SMBus operation regions must be defined immediately within the scope of the corresponding SMBus device.

What am I reading is the official specification, right? **They acknowledge that knowing the address offset is essential, but do not provide any means to get the said address.. What the hell?** What this means is that there is **no way to get this info unless the OS magically has a driver for talking to the exact controller**. Isn’t the only reason why ACPI exists is to prevent such dependence in the first place?

> The responsibility for the definition of ACPI namespace objects, required by an SMBus 2.0-compatible host controller driver to enumerate non-bus-enumerable devices, is relegated to the Smart Battery System Implementers Forum.

Yeah, why not

### The EC chips

It is worth mentioning that the most popular (takes >90% of the market) EC/SuperIO chip manufacturer ITE doesn’t provide any datasheets or info to like a half of their chips, and it was extremely hard to find any info on how does it operate. I randomly stumbled upon [this datasheet for a particular chip on archive.org](https://archive.org/details/it-5570-a-v-0.3.1-u/page/n5/mode/2up) and [System76 EC firmware](https://github.com/system76/ec), which helped a lot. The datasheet is the only source of info on how is the chip supposed to talk to the CPU, and the firmware does the actual work decoding the registers. It seems that ITE is only willing to provide this data to other companies, as some datasheets I was able to find on their website are marked as confidential.

## Bill Gates

These issues have already been discussed since the 2000s, and ACPI was [described](https://en.wikipedia.org/wiki/ACPI#cite_note-linux-mag-162-52) by Linus as a “complete design disaster in every way”. Furthermore, ACPI seems to be deliberately designed to require OS-level drivers for basic functionality and have extremely vague “specifications”. As if a singular company could have exclusive access to the vital information…

And then I accidentally found [this article on ACPI debugging](https://lwn.net/Articles/237085/), which references the [memo written by Bill Gates in 1999](https://web.archive.org/web/20070927015231/http://antitrust.slated.org/www.iowaconsumercase.org/011607/3000/PX03020.pdf):

> One thing I find myself wondering about is whether we shouldn’t try and make the “ACPI” extensions somehow Windows-specific. If seems unfortunate if we do this work and get our partners to do the work and the result is that Linux works great without having to do the work. … Maybe we couid define the APIs so that they work well with NT and not the others even if they are open. Or maybe we could patent something relaled to this.

What. The. Heck.

This is insane.. Isn’t it like the textbook definition of lobbying? I wasn’t expecting to find a whole conspiracy while trying to fix my Deck, perhaps the memo is a hoax or something, but this all just lines up so naturally. If it *really* was his plan, then he succeeded.

## What do we do now?

Of course I cannot advise anyone to do something crazy like decompiling NT kernel due to the potential lawsuits against the Linux Foundation or someone else. The best course of action would be to patch Linux ACPI drivers to improve the support, especially in cases where the specs do not provide any info. Personally, I will continue analyzing the issue with the SMBus protocol, developing the [sbsutil](https://github.com/enaix/sbsutil) project and hopefully making a patch to the `sbshc` driver. *(Note that the repo is in early WIP, README is out-of-date)*

This is not Valve’s mistake for not setting up the SMBus communications, but rather the issue of the ACPI itself. Still, that would be huge kudos for Valve if they patched this *(your console is awesome btw)*

* * *

## Updates

## Upd 1

Wow, this blew up! Thanks a lot for the nice comments, it was pleasing to see all this feedback

### Trivia

-   This leaked document is a part of [Halloween documents](https://en.m.wikipedia.org/wiki/Halloween_documents).
-   As a result of [Iowa anti-monopaly class action lawsuit](https://en.m.wikipedia.org/wiki/Microsoft_litigation#cite_note-21), MS settled the case for $180M, which is only 0.3% of their [revenue in 2007](https://www.microsoft.com/investor/reports/ar07/staticversion/10k_sl_eng.html). This lawsuit seems not to be directly linked to the Halloween documents AFAIK.
-   In EU, reverse engineering is not illegal if done properly (see clean room approach).

Another engineer has encountered similar ACPI issues in the past, here’s the link to his detailed guide on fixing DSDT tables: [antenore blogpost](https://antenore.simbiosi.org/fixing-broken-acpi-dsdt-linux/)

The user `u/BitOBear` posted a detailed story of [Microsoft inner management practices of that time](https://www.reddit.com/r/linux/comments/1l2rn3t/oc_how_i_discovered_that_bill_gates_monopolized/mvysmws/). Bizarre stuff

Overall, I’m going to report the bug to Valve soon! Stay tuned
