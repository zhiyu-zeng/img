---
title: To Boot Or Not To Boot – Das U-Boot
source: https://blog.attify.com/to-boot-or-not-to-boot-das-u-boot/
source_host: blog.attify.com
clip_date: 2026-09-11T10:24:15+08:00
trace_id: e215e533-c359-4bc0-a674-2b6b32c528f2
content_hash: 3ab8650e0e0b9b8893fd03d566ab4df1d9f56d33731ed697a29c86657bf0e5d9
status: synced
tags:
  - 硬件逆向
  - 模拟执行
series: null
feed_source: Attify
ai_summary: Das U-Boot 是横跨 PowerPC/ARM/x86/MIPS 的开源引导加载程序，本文讲解其编译、QEMU 跑通及命令行攻击面。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 3d875244-d011-81a2-9d34-cd5454eac510
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Das U-Boot 是横跨 PowerPC/ARM/x86/MIPS 的开源引导加载程序，本文讲解其编译、QEMU 跑通及命令行攻击面。
> 
> - **起源与更名：** 最初为 PowerPC 引导程序 8xxROM，因 SourceForge 不允许项目名含数字改名 PPCBoot（2000-07-19 首发）；2002 年经 ARMBoot 合入 ARM 支持，后扩展至 x86、MIPS；2004 年已支持 216 家板卡厂商，最终取名"Das U-Boot"（德语"the"，戏仿电影 Das Boot）。
> - **编译流程：** 克隆 .git 源码 → 在 board 目录 grep 并用 MAINTAINERS 定位对应 defconfig → `make clean` 生成 .config → 设置交叉编译器与架构环境变量 → make 得到 u-boot 镜像。
> - **QEMU 调试：** 用 qemu-arm 启动，ESC+1 切到模拟器、ESC+2 切到 U-Boot 提示符；加 `-serial pty` 可用 screen 连 pty 查看滚动缓冲。
> - **关键命令：** `version` 查版本，`?` 列全部命令，`? <命令>` 看详细用法；`printenv` 显示 arch（选工具链）、loadaddr（内核装载基址）、bootargs（传给内核的参数，含 console/root/rootfstype）；`setenv` 改变量、`saveenv` 写回 flash 以在重启后生效。
> - **攻击视角：** 提示符介于硬件初始化与 Linux 内核启动之间，非完整系统但权限可观；攻击者可借此加载新引导镜像、操作内存/存储，或在条件合适时逃逸引导流程、实施硬件毛刺攻击以扩大控制，并通过修改变量定制环境。

## Introduction

In this post, we will be describing the bootloader that goes by the name of Das U-Boot. We will delve into the following Das U-Boot features, including:

\- Das U-Boot Origin Story

\- The Building of Das U-Boot

\- Running Das U-Boot in an emulator (QEMU)

\- Das U-Boot command line

\- Attacker Options

## U-Boot Origin Story

This open-source project first sprang into existence as a bootloader for the embedded PowerPC architecture. In this guise, it was initially known as **8xxROM** and was later renamed to **PPCBoot**. Interestingly enough, the latter name, ' **PPCBoot** ', was chosen somewhat based on the **SourceForge** restriction of digits being used in a project's name. **PPCBoot's** initial release was July 19, 2000. Further development saw a brief port of the bootloader to include ARM architecture through a project known as **ARMBoot** in 2002, with the end result being a merge back into **PPCBoot** in the same year. This collaboration saw the widening of the supported architectures. Later **PPCBoot** became **U-Boot** and was further widened to include x86 and MIPS architectures and by 2004 included support for 216 board manufacturers.

Fast-forwarding to the current day, U-Boot was renamed ' **Das U-Boot** ' where ' **Das** ' is the Germanic definitive article or simply ' **The** ' translated into English. The name was cleverly chosen as a play on words based around the German submarine film ' **Das Boot** ', which takes place in World War II on a German **U-Boat**.

## The Building of Das U-Boot

To build U-Boot, the first requirement is to obtain the source code. This can be achieved in numerous ways, however, we like the cloning of the.git archive as our preferred method:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c2c3aa203404bf93.png)

For the purposes of our discussion and subsequent practical examples, we will choose to build U-Boot across an emulated environment that is using **qemu-arm**. To gather our bearings, we can conduct a quick grep through the **board** directory to gather our bearings to find an appropriate configuration file.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/94709b8570667532.png)

With the above clue on hand, we can then further the search through examination of the **MAINTAINERS** file within the same directory, which leads us to the crown jewels, that is, the appropriate ' ***defconfig*** ' file that we will use for our build.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ebaf658461a768dc.png)

Using ' **make clean** ' ensures a clean build distribution and writes the required **.config** file later used to build the U-Boot image.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/45922bafad5a2eac.png)

We now specify the required Cross Compiler and Architecture environment variables and before proceeding onto the **make** process

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b42ce30673d4c1e7.png)

We should now be left with a u-boot image, which we can now execute using QEMU.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/befdbd041983bc6b.png)

Using the following bare minimum to start the emulation

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/79c2f55cda2f2d67.png)

At this stage, we are presented with a **QEMU** virtual machine. We can switch between the emulator and the U-Boot console/prompt using a combination of keys

\- **ESC + 1**: Pressing the Escape key and the 1 key takes us to the QEMU emulator

\- **ESC + 2**: Pressing the Escape key and the 2 key takes us to the U-Boot prompt

\- Running QEMU with the **\-serial pty** option allows for us to interact with a scrolling buffer through a pty line.

The **pty line** can be accessed using a **screen** just like the following:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9f03a921e9d6c68d.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d448105ec3259aa1.png)

Figure 1. Esc + 1 – QEMU emulator

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e93b3743f2b264db.png)

Figure 2. Esc + 2 - U-Boot prompt

## Running Das-U-Boot in an Emulator (QEMU)

Up until this point, we have managed to successfully build a U-Boot image using the utilities found in the U-Boot **.git** repository. We shall now take a look at the U-Boot command prompt, highlighting some of the more useful commands.

You may recall from the previous blog within this series that U-Boot can be utilized for:

\- The loading of new boot images into flash storage

AND

\- The execution of memory and storage management tasks

The functions mentioned above can be used to further an attacker's foothold on unsuspecting hardware devices. Under the right conditions, an attacker may be able to escape the main bootloader process or alternatively be able to successfully induce a hardware glitch attack. Both of these vectors may allow for further control over the affected hardware device by allowing interaction with U-Boot itself.

Using our newly created testbed, we will now look at some useful commands, describe their functions, and how they might be leveraged to conduct other nefarious deeds.

## U-Boot command line

The U-Boot command prompt is useful to an attacker as it provides a mid-way point between the initialization of a hardware device and the ultimate execution of the Linux kernel. The command prompt itself is not a fully-fledged system, however, it can be powerful in the right hands.

A good starting point is to work out the lay of the land by gathering details about the specific **version** of U-Boot that is running.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/faa47093b280880f.png)

Pressing '**?'** will bring up a scrolling help menu, which details all the available commands U-Boot offers.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/489eebe32df9f5dc.png)

Likewise, once you have found a command that you are interested in using but do not necessarily understand its utility, you can couple **`? + <command>`** which will provide a more detailed usage for the chosen command

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/39df31d47cd2e797.png)

A very useful command is the **`printenv`** command. This command allows us to print all of the environment variables loaded at U-Boot execution. From the output, we can see many interesting variables, some of which are:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1ebeab19dcd3bb44.png)

**arch** – describing the architecture of the underlying system. Potentially useful to understand the correct binaries and toolchains that can be used to further ongoing attacks

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3c1190b2afbb721c.png)

**loadaddr** –describeswhere the kernel image will or could be potentially loaded to and from within DRAM**.** Generally describes the base address and is notated in hex.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/66923a6e6a66a30e.png)

**bootargs** – describes the arguments that will be passed to the Linux kernel upon execution

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9997973be4542ce7.png)

Figure 3. **console** describes the TTY line and baud rate, whilst **root** and **rootfstype** describes the device where the kernel will be mounted and the file type used for the filesystem, respectively.

For changes to these variables to be made, it is possible to utilize the **setenv** command for this purpose.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/de282ebd802f86d5.png)

Once an existing variable or a new one has been configured, we must ensure that this change survives a reboot. For the changes to be written to flash, we employ the use of the **saveenv** command.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/827b945a391a7f8d.png)

Generally speaking, an attacker who has managed to take control of a hardware target in this fashion is most likely looking to fully leverage this newfound access by setting up the environment to suit their needs. There are various attack vectors that can be employed to fully control the affected device.

***Stay tuned for Part 3 "Practical Attack Vectors"...***
