---
title: A First Glimpse of the Starlink User Ternimal | DARKNAVY Blog
source: https://www.darknavy.org/blog/a_first_glimpse_of_the_starlink_user_ternimal/
source_host: www.darknavy.org
clip_date: 2026-09-28T10:16:40+08:00
trace_id: 36f2d62c-9b27-4450-995b-c921d9589f6e
content_hash: 878580bda482db659cb9bd6cebd2047084d64ab6ae10af64dc148a3ebd875de1
status: synced
tags:
  - 硬件逆向
  - 模拟执行
series: null
feed_source: DARKNAVY
ai_summary: SpaceX 星链 Rev3 用户终端天线（UTA）的首次公开硬件拆解与固件分析：主控固件几乎未加密，已用 QEMU 跑通部分服务，并发现 41 个未知 SSH 公钥。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 1
  failed_urls:
    - attachments/d48521bc-861b-4050-82df-1366d6bc01d2.png
    - attachments/62ba1b39-218f-4887-9dab-7957d3f342fe.png
    - attachments/7beb1f43-a758-4a5c-ad1e-73fc65157927.png
    - attachments/80819cd3-d929-4e20-a1e9-77f65b3ccb33.png
    - attachments/91f681b3-25c3-4487-a2db-518aedba9a22.png
    - attachments/a451b9c1-5be5-4d8f-a77a-f17edef85653.png
notion_page_id: 3e975244-d011-813f-960b-f74ee55b6de8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> SpaceX 星链 Rev3 用户终端天线（UTA）的首次公开硬件拆解与固件分析：主控固件几乎未加密，已用 QEMU 跑通部分服务，并发现 41 个未知 SSH 公钥。
> 
> - **硬件构成：** UTA 为四核 Cortex-A53 定制 SoC（ST 为 SpaceX 定制，资料保密），PCB 大部分被 ST 的射频前端占据；因板上无 eMMC 调试点，需拆焊芯片用编程器读取固件。
> - **固件情况：** 除 BootROM 外的启动链、内核与文件系统未加密；运行时环境解包到 `/sx/local/runtime`，含 `bin`/`dat`/`revision_info`，程序多为无符号静态编译 C++，仅 `user_terminal_frontend` 用 Go 编写。
> - **架构特点：** 网络栈类似 DPDK，靠用户态程序绕过内核直接收发包，内核主要负责驱动与进程管理；启动时按外设识别设备类型并加载对应逻辑，固件中还含卫星/地面网关功能。
> - **模拟调试：** 自建 QEMU 环境成功运行并调试 `httpd`、WebSocket、gRPC 等对外服务。
> - **安全芯片与彩蛋：** STSAFE-A110（CC EAL5+）提供设备 UUID、`stsafe_leaf.pem` 证书与对称密钥派生，作为独立于 SoC 安全启动的信任根；名为 Ethernet Data Recorder 的程序按类 pcap 规则抓取遥测包（如 UDP 10017 端口、组播 239.26.7.130/131）并用 SoC 熔丝密钥加密，未见采集用户隐私；但设备初始化会写入 41 个 SSH 公钥且 22 端口长期对本网开放。

> I think the human race has no future if it doesn’t go to space. —— Stephen Hawking

Starlink is a low Earth orbit (LEO) satellite internet service provided by SpaceX. Users connect to near-Earth orbit satellites through a user terminal, which then connects to the internet via ground gateways.

![⚠️ 图片托管失败 · Diagram showing a Starlink user terminal connecting by encrypted radio to a satellite, then through a ground gateway to the internet](attachments/d48521bc-861b-4050-82df-1366d6bc01d2.png)

![⚠️ 图片托管失败 · Diagram showing a Starlink user terminal connecting by encrypted radio to a satellite, then through a ground gateway to the internet](https://www.darknavy.org/blog/a_first_glimpse_of_the_starlink_user_ternimal/attachments/d48521bc-861b-4050-82df-1366d6bc01d2.png)

Basic Starlink network architecture

As the new generation of satellites gradually incorporates laser links, some satellites can communicate with each other via laser. This both reduces reliance on ground stations and improves transmission efficiency, enhancing global coverage.

![⚠️ 图片托管失败 · Map showing a Starlink user terminal in Ukraine reaching gateways in Poland and Lithuania through satellites and inter-satellite links](attachments/62ba1b39-218f-4887-9dab-7957d3f342fe.png)

![⚠️ 图片托管失败 · Map showing a Starlink user terminal in Ukraine reaching gateways in Poland and Lithuania through satellites and inter-satellite links](https://www.darknavy.org/blog/a_first_glimpse_of_the_starlink_user_ternimal/attachments/62ba1b39-218f-4887-9dab-7957d3f342fe.png)

Starlink connectivity from Ukraine through neighboring gateways

Even on the Ukrainian battlefield where there are no local ground stations, Starlink user terminals can indirectly access gateways in neighboring countries through inter-satellite links \[1\].

In this article, we provide a concise overview of DARKNAVY’s recent preliminary investigation into the Starlink user terminal.

* * *

## Hardware Analysis

A complete Starlink user terminal consists of two parts: a router and an antenna. This article focuses on the antenna component (User Terminal Antenna, hereafter referred to as “UTA”). DARKNAVY purchased a Starlink Standard Actuated (also known as Rev3 or GenV2) user terminal in Singapore and disassembled its antenna portion.

![⚠️ 图片托管失败 · Disassembled Starlink Standard Actuated Rev3 antenna showing the full green printed circuit board inside its enclosure](attachments/7beb1f43-a758-4a5c-ad1e-73fc65157927.png)

![⚠️ 图片托管失败 · Disassembled Starlink Standard Actuated Rev3 antenna showing the full green printed circuit board inside its enclosure](https://www.darknavy.org/blog/a_first_glimpse_of_the_starlink_user_ternimal/attachments/7beb1f43-a758-4a5c-ad1e-73fc65157927.png)

Starlink Rev3 antenna PCB

As shown above, after disassembly, we found that the UTA’s PCB is almost as large as its outer shell. Most of the board is occupied by RF front-end chips produced by STMicroelectronics (left side in the photo), while the core control components are mainly concentrated on one side of the PCB.

![Annotated close-up of the Starlink Rev3 PCB identifying the RF front-end, beamforming IC, PoE connector, disabled UART, STSAFE-A110, Cortex-A53 SoC, DRAM, removed eMMC, and GPS module](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d00aec7986b6fa61.png)

Starlink Rev3 PCB core area

Aside from the RF antenna, the overall design of the UTA’s core area is quite similar to that of a standard IoT device. The main SoC, custom-made by ST for SpaceX, is a quad-core Cortex-A53. Currently, the hardware and datasheet for this chip are confidential and unavailable to the public.

At Black Hat USA 2022, Dr. Lennert Wouters from KU Leuven demonstrated a fault-injection attack against the first-generation Starlink antenna (GenV1) to obtain a root shell of the device. In response, SpaceX disabled the UART debug interface on the PCB via a firmware update to enhance fault-attack resistance. However, Wouters subsequently managed to break in again by refining his approach \[2\].

* * *

## Firmware Extraction and Analysis

To analyze the UTA in depth, DARKNAVY directly dumped the firmware from the eMMC chip. Since no obvious eMMC debug pins exist on the Rev3 board, we had to desolder the eMMC chip from the PCB and read it using a programmer. Once extracted, we discovered that most of the firmware contents were unencrypted, revealing the boot chain (excluding BootROM), kernel, and the unencrypted portions of the filesystem. Further analysis showed that after the kernel starts, it reads most of the runtime environment from the eMMC and unpacks it to the `/sx/local/runtime` directory.

![⚠️ 图片托管失败 · Directory tree of the extracted Starlink firmware showing the sx/local/runtime bin, dat, and revision\_info entries alongside scripts and proxy](attachments/80819cd3-d929-4e20-a1e9-77f65b3ccb33.png)

![⚠️ 图片托管失败 · Directory tree of the extracted Starlink firmware showing the sx/local/runtime bin, dat, and revision\_info entries alongside scripts and proxy](https://www.darknavy.org/blog/a_first_glimpse_of_the_starlink_user_ternimal/attachments/80819cd3-d929-4e20-a1e9-77f65b3ccb33.png)

Starlink user terminal runtime directory

As shown above, the `bin` directory contains the executables required by the Starlink software stack, while `dat` stores configuration files, and `revision_info` records the current software and hardware version. Other than `user_terminal_frontend` (written in Go) for handling user communications, most programs are statically compiled C++ executables without symbols. Drawing on existing research \[3\], our preliminary analysis of these programs and configurations suggests that the network stack architecture is somewhat similar to DPDK \[4\], mainly relying on a user-space C++ program to bypass the kernel for handling network packets. The Linux kernel’s primary role is to provide basic hardware drivers and process management.

Interestingly, the core software extracted from the UTA also includes some functionalities that seemingly belong on satellites or ground gateways. Our initial reverse-engineering indicates that, during startup, the system identifies the device type based on hardware peripherals and then loads and executes the corresponding logic.

* * *

## Emulation

For convenient ongoing analysis of the UTA, DARKNAVY built a basic QEMU-based emulation environment for the Rev3 firmware:

Within this environment, we successfully ran and debugged parts of the software, including `httpd`, `WebSocket`, and `gRPC` services that interact with external entities.

![⚠️ 图片托管失败 · GDB session in a QEMU environment paused at a breakpoint while debugging the ARM64 user\_terminal\_frontend process](attachments/91f681b3-25c3-4487-a2db-518aedba9a22.png)

![⚠️ 图片托管失败 · GDB session in a QEMU environment paused at a breakpoint while debugging the ARM64 user\_terminal\_frontend process](https://www.darknavy.org/blog/a_first_glimpse_of_the_starlink_user_ternimal/attachments/91f681b3-25c3-4487-a2db-518aedba9a22.png)

Debugging user_terminal_frontend in QEMU

* * *

## Security Chip

Besides the main SoC, the UTA also features a dedicated security chip, `STSAFE-A110`, which claims a CC EAL5+ security rating \[5\]. Unlike the custom SoC, this chip can be legally purchased under an NDA. In the UTA firmware, a user-space program named `stsafe_cli` handles interactions with this chip. Reverse-engineering suggests that STSAFE primarily provides:

-   A unique identifier (UUID) for each device
-   Management of a public key certificate (`stsafe_leaf.pem`), presumably used for satellite communication authentication
-   Derivation of symmetric encryption keys for user data transmission

Overall, this chip serves as an additional root of trust independent of the SoC’s secure boot mechanism, which aligns with modern embedded security design practices.

* * *

## Easter Egg: Is Elon Watching You?

During the analysis, DARKNAVY stumbled upon a program labeled **Ethernet Data Recorder**, which naturally raises suspicions of a backdoor capturing user data.

![⚠️ 图片托管失败 · Terminal output for file\_edr help describing the Ethernet Data Recorder as collecting selected network telemetry flows for later ground transmission](attachments/a451b9c1-5be5-4d8f-a77a-f17edef85653.png)

![⚠️ 图片托管失败 · Terminal output for file\_edr help describing the Ethernet Data Recorder as collecting selected network telemetry flows for later ground transmission](https://www.darknavy.org/blog/a_first_glimpse_of_the_starlink_user_ternimal/attachments/a451b9c1-5be5-4d8f-a77a-f17edef85653.png)

Ethernet Data Recorder help output

This program’s name and functionality hint at potential packet logging. Closer inspection reveals that it leverages a `pcap_filter` -like mechanism to record certain network packets, with capture rules resembling:

```cpp
# name            track   options                type    interfaces       pcap_filter
diagnostics       0       compress,ipcompress    telem   lo               udp and dst port 10017 and (dst host 239.26.7.131 or dst host 239.26.7.130)
```

Based on other clues in the firmware, these packets are related to satellite telemetry. All captured traffic is also encrypted using hardware keys fused into the SoC. From the information we have so far, it does not appear to collect user privacy data.

During device initialization, if the system identifies itself as a user terminal, the initialization script automatically writes 41 SSH public keys into `/root/.ssh/authorized_keys`. Notably, port 22 on the UTA remains open to the local network at all times. Having such a large number of unknown login keys on a user product certainly raises eyebrows.

* * *

As satellite technology continues to evolve and find applications across diverse industries, every component of Starlink—and other satellite internet systems—may become a critical battleground for future offensive and defensive operations. In space security, developers and hackers contend not only in the digital realm but also against the constraints of cosmic physics: one wrong move could mean losing contact with the target forever.
