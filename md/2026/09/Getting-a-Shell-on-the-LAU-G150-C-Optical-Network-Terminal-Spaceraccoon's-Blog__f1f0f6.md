---
title: Getting a Shell on the LAU-G150-C Optical Network Terminal | Spaceraccoon's Blog
source: https://spaceraccoon.dev/getting-shell-lau-g150-c-optical-network-terminal/
source_host: spaceraccoon.dev
clip_date: 2026-09-28T10:24:42+08:00
trace_id: 6942abe2-50b6-4d20-943b-a2ba24a6f2e3
content_hash: c5704ca06029f457b2b5b22bca6d302502f2ca2e26e6ae5df60624812d58083f
status: synced
tags:
  - 硬件逆向
  - IoT安全
series: null
feed_source: spaceraccoon·漏洞研究
ai_summary: LAU-G150-C 光网络终端虽无公开资料，但通过 UART 串口拿下 root shell，并清掉 ebtables/iptables 规则后即可从以太网直接访问设备。
ai_summary_style: key-points:weak
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3e975244-d011-8167-9cde-dbc769599183
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> LAU-G150-C 光网络终端虽无公开资料，但通过 UART 串口拿下 root shell，并清掉 ebtables/iptables 规则后即可从以太网直接访问设备。
> 
> - **设备背景：** Link-All LAU-G150-C 是单 PON 口、单以太网口、无 DHCP 的 ONT，外形类似华为 HG8010H；默认尝试静态 IP（如 192.168.100.1）扫不到任何开放端口。
> - **拆机门槛：** 主板丝印标出 `GND`/`RX`/`TX` 和 `SCL`/`SDA` 调试焊盘；隐藏螺丝藏在贴纸下，需同时接 GND 与 RX 才能读出信号。
> - **串口信息：** 115200 Hz 下泄露 bootloader 与 U-Boot 日志——主控 RTL9601D、CPU 300MHz、DDR2 32MB、SPI-NAND 128MB，内核为 MIPS lzma 镜像，最终进入 BusyBox v1.12.4 shell。
> - **网络不可达原因：** 二层 ebtables 规则 `-i eth0+ -j DROP` 丢弃了以太口所有转发流量；`iptables` 另丢弃 http/telnet 端口，需 `ebtables -F` + `iptables -F` 清空。
> - **接口配置陷阱：** eth0 与 br0 共用 MAC，IP 须加在 `br0` 上（`ip addr add ... dev br0 && ip link set br0 up`）才能 ping 通。
> - **Web 服务分析：** `hiproc` 进程监听 0x9CC3=40131 端口，返回 Boa/0.93.15 的 403；其 Web 根目录为 `/etc`，可直接读取 `/etc/passwd`。

## Getting a Shell on the LAU-G150-C Optical Network Terminal

Optical Network Terminals (ONTs) are devices that convert fibre-optic signals to Ethernet signals that can be handled by typical routers. As the connection between home networks and internet service providers’ (ISPs) fibre-optic networks, they’re often loaded with custom firmware with ISP-specific configurations and passwords.

Sites like [Hack GPON](https://hack-gpon.org/) and [Hacking RTL960x](https://github.com/Anime4000/RTL960x) document how to gain access to a multitude of ONT models. There’s even [a blog post](https://medium.com/@acidumirae/how-to-unblock-optical-network-terminal-singtel-zte-zxa10-f620g-ethernet-ports-gigabit-switch-92ae92421dcd) on how to access Singtel’s ZTE ZXA10 F620G via telnet or web console.

Recently, I switched internet subscriptions and no longer needed my Link-All LAU-G150-C ONT. Since the model is not documented anywhere, I thought this was a great opportunity to practise some hardware hacking.

## Getting a UART Foothold

The LAU-G150-C looks extremely similar to the [Huawei HG8010H](https://hack-gpon.org/ont-huawei-hg8010h/) with one Passive Optical Network (PON) input port, one Ethernet output port, and a simple power button.

However, unlike many of the models documented on Hack GPON, the LAU-G150-C appeared to be reasonably hardened. I first connected to it directly over Ethernet and tried the typical hard-coded static IPs like `192.168.100.1` and `192.168.10.1` (ONTs typically don’t serve DHCP) but could not find any exposed ports or ping the device.

As such, I decided to look for a hardware interface. It took significant effort to pry the cover off, and I realised belatedly that there was a screw hidden underneath a sticker that was causing all this trouble.

> Hardware hacking hot tip #1: Check for hidden screws under stickers!

![Hidden screw under a stick](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d41c460c63edbb44.jpg)

After all that hard work, I was rewarded with a juicy teardown!

![Top view](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/342296f95a23ea59.jpg)

![Bottom view](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/170b9c9b79f21fa3.jpg)

While I was able to identify most of the components, the processor (hidden under the heat sink on the bottom left of the top view) was unlabelled. This made it difficult to figure out if there were any debug interfaces I could target.

Fortunately, a closer look at the board revealed some interesting ports…

![Debug ports](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e031f5f78183fa28.jpg)

The ports labelled `GND`, `RX`, and `TX` suggested a potential UART interface, while `SCL` and `SDA` indicated a potential I2C interface.

I got to work with the multimeter and confirmed the ground ports, but the readings for the RX port seemed off. Worse, when I tested the ports with a logic analyser, I got complete gibberish! Typical baud rates for other ONTs, like 115200 Hz, failed to reveal anything.

A day later, I realised my mistake: I had been trying to analyse the signals one port at a time. It was only when I connected the ground and RX ports at the same time that I got recognisable data at 115200 Hz. Great success!

> Hardware hacking hot tip #2: Don’t analyze serial interface ports in isolation!

When powering the device on, it would first expose the bootloader:

```fallback
9601D
PRELOADER Bismarck 3.5
II: LPLR:1012, PLR:9aa5a8d9, Build_date:21080422, Toolkit:rsdk-1.5.6-5281-EB-2.6.30-0.9.30.3-131105
II: Disable OCP Timeout Monitor
II: Disable LX Timeout Monitor
II: TLB initial done:
    .ro section works!
    .text and .ro sections work!
EE: REG32(0xbb000044)[3:2]:0x2 !=0
II: Enable Triple Synchronizer
II:cg_cpu_clk_init done
II: CPU 300MHz (600/2/0), MEM 325MHz, LX 200MHz, SPIF 25MHz
AK: DRAM AUTO CALIBRATION(20210202)
AK: ZQ Calibration Passed
AK: ZQ Calibration Passed
AK: ZQ Calibration Passed
AK: ZQ Calibration Passed
AK: MR0: 0x00100952
AK: MR1: 0x00110040
AK: MR2: 0x00120000
AK: MR3: 0x00130000
AK: clear dwdqor

AK: Bit/max_r_s/max_r_l/max_w_s/max_w_l    Bit/max_r_s/max_r_l/max_w_s/max_w_l(Hex)
   [ 0]       0      1f       0      17   [16]       0      1f       0      17
   [ 1]       0      1f       0      17   [17]       0      1f       0      17
   [ 2]       0      1f       0      15   [18]       0      1f       0      15
   [ 3]       0      1f       0      15   [19]       0      1f       0      15
   [ 4]       0      1f       0      17   [20]       0      1f       0      17
   [ 5]       0      1f       0      15   [21]       0      1f       0      17
   [ 6]       0      1f       0      17   [22]       0      1f       0      17
   [ 7]       0      1f       0      17   [23]       0      1f       0      17
   [ 8]       0      1f       0      17   [24]       0      1f       0      17
   [ 9]       0      1f       0      19   [25]       0      1f       0      19
   [10]       0      1f       0      17   [26]       0      1f       0      19
   [11]       0      1f       0      19   [27]       0      1f       0      19
   [12]       0      1f       0      19   [28]       0      1f       0      19
   [13]       0      1f       0      19   [29]       0      1f       0      19
   [14]       0      1d       0      1b   [30]       0      1f       0      1b
   [15]       0      1f       0      17   [31]       0      1f       0      17
AK: DQ enable delay sync with DQ delay tap.
    0xb80015D0=0x07070707, 0xb80015D4=0x07070707, 0xb80015D8=0x08070807, 0xb80015DC=0x07090808

AK: DRAM size = 0x2000000
AK: Disable read after write function

AK: Support tREFI divided by 4

AK: dram auto calibrtaion is done
II: MEM_PROBE_OK
II: MEM_XLAT_OK
II: MEM_TO_REG_OK
II: MEM_CAL_OK
II: Change Stack from 0x9f00375c to 0x806fffe0
II: U-boot Magic Number is 0x27051956
II: Inflating U-Boot (0x80700040 -> 0x81c00000)… OK
II: Starting U-boot… 


U-Boot 2011.12.NA-svn35647 (Aug 04 2021 - 22:50:21)

Board: RTL9601D, CPU:300MHz, LX:200MHx, MEM:325MHz, Type:DDR2
DRAM: 32 MB
SPI-NAND Flash: 2C14/Mode0 1x128MB
Create bbt: 
Loading 16384B env. variables from offset 0xc0000
Loading 16384B env. variables from offset 0xe0000
Loaded 16384B env. variables from offset 0xc0000
Net:   LUNA GMAC 
Warning: eth device name has a space!

Hit any key to stop autoboot:  1
```

This revealed important information like the board (RTL9601D) and SPI-NAND flash storage.

If the autoboot wasn’t interrupted, it then proceeded to the actual Linux operating system:

```fallback
## Booting kernel from Legacy Image at 81000000 …
   Image Name:   Linux Kernel Image
   Created:      2024-10-16   8:49:19 UTC
   Image Type:   MIPS Linux Kernel Image (lzma compressed)
   Data Size:    909109 Bytes = 887.8 KB
   Load Address: 80000000
   Entry Point:  80000000
   Verifying Checksum … OK
   Uncompressing Kernel Image … OK

Starting kernel …

...

BusyBox v1.12.4 (2024-10-16 16:46:28 CST) built-in shell (ash)
Enter ‘help’ for a list of built-in commands.

# 
```

Shell unlocked!

## Getting Network Access

While a UART shell granted a lot of visibility, I still wanted to understand why I couldn’t ping the device directly over the network connection.

I checked for exposed network interfaces:

```fallback
# ip addr
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 16436 qdisc noqueue state UNKNOWN 
    link/loopback 00:00:00:00:80:05 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UNKNOWN qlen 1000
    link/ether <CENSORED>> brd ff:ff:ff:ff:ff:ff
3: eth0.2: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN qlen 1000
    link/ether 00:00:00:01:00:02 brd ff:ff:ff:ff:ff:ff
4: eth0.3: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN qlen 1000
    link/ether 00:00:00:01:00:02 brd ff:ff:ff:ff:ff:ff
5: nas0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc pfifo_fast state DOWN qlen 1000
    link/ether 00:00:00:01:00:02 brd ff:ff:ff:ff:ff:ff
6: pon0: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN qlen 1000
    link/ether <CENSORED> brd ff:ff:ff:ff:ff:ff
7: br0: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN 
    link/ether <CENSORED> brd ff:ff:ff:ff:ff:ff
8: nas0_0: <BROADCAST,UP> mtu 1500 qdisc pfifo_fast state UNKNOWN qlen 10
    link/ether <CENSORED> brd ff:ff:ff:ff:ff:ff
```

Interestingly, the Ethernet interface `eth0` didn’t have an IP address set, but doing so manually using `ip addr add 192.168.100.1/24 dev eth0` still failed to make it reachable.

When I monitored the connection using Wireshark on my connected laptop, I realised that pinging out from the ONT to my laptop worked — but even though my laptop responded to the ping, the ONT didn’t seem to receive the packet.

My next instinct was to check for firewall rules with `iptables`:

```fallback
# iptables -L
Chain INPUT (policy ACCEPT)
target     prot opt source               destination         
DROP       tcp  —  anywhere             anywhere           tcp dpt:http 
DROP       udp  —  anywhere             anywhere           udp dpt:http 
DROP       tcp  —  anywhere             anywhere           tcp dpt:telnet 
DROP       udp  —  anywhere             anywhere           udp dpt:telnet 
ACCEPT     udp  —  anywhere             anywhere           udp dpt:router 
DROP       all  —  anywhere             239.255.255.250    
ACCEPT     all  —  anywhere             224.0.0.0/4        
dhcp_port_filter  all  —  anywhere             anywhere           

Chain FORWARD (policy ACCEPT)
target     prot opt source               destination         
TCPMSS     tcp  —  anywhere             anywhere           tcp flags:SYN,RST/SYN TCPMSS clamp to PMTU 
TCPMSS     tcp  —  anywhere             anywhere           tcp flags:SYN,RST/SYN tcpmss match 1452:1536TCPMSS set 1452 

Chain OUTPUT (policy ACCEPT)
target     prot opt source               destination         

Chain dhcp_port_filter (1 references)
target     prot opt source               destination         
```

While this was interesting (`iptables` rules dropped telnet and http), it didn’t answer the question of why ICMP (used for ping) was failing.

After some ChatGPT consultation, I was prompted (lol) to check `ebtables` (which controls Layer 2 filtering) instead:

```fallback
# ebtables -L
Bridge table: filter

Bridge chain: INPUT, entries: 1, policy: ACCEPT
-j br_wan

Bridge chain: FORWARD, entries: 1, policy: ACCEPT
-j portmapping

Bridge chain: OUTPUT, entries: 1, policy: ACCEPT
-j br_wan_out

Bridge chain: br_wan, entries: 1, policy: RETURN
-i nas0_0 -j DROP 

Bridge chain: br_wan_out, entries: 1, policy: RETURN
-o nas0_0 -j DROP 

Bridge chain: portmapping, entries: 9, policy: ACCEPT
-i nas0_0 -o eth0.2 -j RETURN 
-i eth0.2 -o nas0_0 -j RETURN 
-i eth+ -o eth+ -j RETURN 
-i eth+ -o wlan+ -j RETURN 
-i wlan+ -o eth+ -j RETURN 
-i wlan+ -o wlan+ -j RETURN 
-i eth0+ -j DROP 
-i wlan+ -j DROP 
-i nas0_0 -j DROP
```

This was the answer: `-i eth0+ -j DROP` was dropping all forwarding traffic received on the Ethernet interface! This meant that while routers and other devices could communicate through the Ethernet interface to the fibre-optic interface, they couldn’t use it to communicate with the ONT directly. I could clear this obstacle with a simple `ebtables -F` and `iptables -F` to flush all the filtering rules.

> Hardware hacking hot tip #3: Inspect all network filtering rules for potential hardening!

Another gotcha was that according to the `ip addr` output, `br0` and `eth0` were sharing the same MAC address. In short, network traffic was bridged, and IP layer traffic would be handled by `br0`. Thus, I needed to set the static IP address on `br0` instead of `eth0` and bring it up:

```fallback
ip addr add 192.168.100.1/24 dev br0
ip link set br0 up
```

Once this was done, I could now ping and perform any other network communication with the ONT over the Ethernet connection.

## Exploring the Web Interface

Next, I performed a bit of reconnaissance to understand the running processes.

```fallback
# ps
  PID USER       VSZ STAT COMMAND
    1 admin      892 S    init       
    2 admin        0 SW<  [kthreadd]
    3 admin        0 SWN  [ksoftirqd/0]
    4 admin        0 SW<  [events/0]
    5 admin        0 SW<  [khelper]
    8 admin        0 SW<  [async/mgr]
   51 admin        0 SW<  [kblockd/0]
   64 admin        0 SW   [netlog]
   69 admin        0 SW   [pdflush]
   70 admin        0 SW   [pdflush]
   71 admin        0 SW<  [kswapd0]
   89 admin        0 SW<  [mtdblockd]
  158 admin        0 SW<  [yaffs-bg-1]
  171 admin     2064 S    configd 
  354 admin    24292 S    omci_app -s <CENSORED> -f off 0 -m disable -d err -
  363 admin     1696 S    /bin/pondetect 
  562 admin      900 R    -/bin/sh 
  563 admin      592 S    /bin/inetd 
  572 admin     2848 S    /bin/hiproc 
  574 admin        0 DW<  [led_swBlink]
  610 admin    24292 S    omci_app -s <CENSORED> -f off 0 -m disable -d err -
  611 admin    24292 S    omci_app -s <CENSORED> -f off 0 -m disable -d err -
  612 admin    24292 S    omci_app -s <CENSORED> -f off 0 -m disable -d err -
  708 admin    24292 S    omci_app -s <CENSORED> -f off 0 -m disable -d err -
  709 admin    24292 S    omci_app -s <CENSORED> -f off 0 -m disable -d err -
  710 admin    24292 S    omci_app -s <CENSORED> -f off 0 -m disable -d err -
  711 admin    24292 S    omci_app -s <CENSORED> -f off 0 -m disable -d err -
  820 admin      892 R    ps 
```

Checking the strings for the binary files suggested that `hiproc` was responsible for the web console (HTML-related strings), but due to the limited binaries available on Busybox, I had to manually check `/proc` to see which port it was on:

```fallback
# cat /proc/572/net/tcp
  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode                                                     
   0: 00000000:9CC3 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 835 1 80f36880 300 0 0 2 -1                               
   1: 00000000:0017 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 840 1 80f36040 300 0 0 2 -1                               
```

In this case, `9CC3` converted to decimal was `40131`! I excitedly accessed the port on a browser, and…

![Forbidden](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/07ca968270b8714e.png)

The response still revealed important information, like the server version:

```zed
HTTP/1.0 403 Forbidden
Date: Thu, 01 Jan 1970 00:17:14 GMT
Server: Boa/0.93.15
Connection: close
Content-Type: text/html

<HTML><HEAD><TITLE>403 Forbidden</TITLE></HEAD>
<BODY><H1>403 Forbidden</H1>
Your client does not have permission to get URL / from this server.
</BODY></HTML>
```

Pushing on, I transferred the `hiproc` binary out using netcat for further analysis. I started from the `Your client does not have permission to get URL` string, then traced back any references in Ghidra.

![Forbidden](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3dd0b932f6977a06.png)

After a bit of spelunking, I realised that while the web console had been pretty much disabled (it wasn’t referencing any configuration files), it was using `/etc` as the server root, allowing me to access files like `/etc/passwd` by browsing directly to it. Nevertheless, this wasn’t too interesting because I already had shell access.

## Next Steps

After extracting all the config files and binaries, there’s a lot more to reverse-engineer and analyse, but for now, I feel pretty satisfied with getting access to a previously undocumented ONT device. I hope to publish a couple more mini hardware-hacking blog posts with practical tips to make it easier to get into this domain of research.
