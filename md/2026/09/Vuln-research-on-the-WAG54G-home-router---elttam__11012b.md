---
title: Vuln research on the WAG54G home router - elttam
source: https://www.elttam.com/blog/vuln-research-on-the-wag54g-home-router
source_host: www.elttam.com
clip_date: 2026-09-18T10:49:56+08:00
trace_id: 8462689b-5fca-42f9-9fb2-f7c274d2df5c
content_hash: 7eaa0d4dce8b14a6a276742f93ece5b40e8da2f215ab84d69423212f16d23e3b
status: synced
tags:
  - 硬件逆向
  - 漏洞分析
series: null
feed_source: elttam
ai_summary: WAG54G 路由器可通过诊断 ping 页面的命令注入改写 /etc/passwd，从受限 shell 逃逸为 busybox，再用 tftp 拉取二进制离线分析，httpd 中存在 3 个内存破坏漏洞。
ai_summary_style: key-points:weak
images_status:
  total: 17
  succeeded: 17
  failed_urls: []
notion_page_id: 3df75244-d011-811d-9ccf-c3e52bc96baf
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> WAG54G 路由器可通过诊断 ping 页面的命令注入改写 /etc/passwd，从受限 shell 逃逸为 busybox，再用 tftp 拉取二进制离线分析，httpd 中存在 3 个内存破坏漏洞。
> 
> - **提权路径：** Telnet 远程管理默认进入 `/bin/configurator` 受限 shell，在 `ping_interval` 参数注入命令覆盖 `/etc/passwd` 中 admin 的 shell 为 `/bin/sh`，重连即得完整 shell。
> - **目标环境：** httpd 为 32 位 MIPS 小端、动态链接且已 strip 的 ELF，静态分析用 IDA Pro，运行时用 QEMU malta 机型加载 Debian wheezy mipsel 镜像调试。
> - **漏洞1（DoS）：** HTTP 请求解析调用 `strsep()` 后未判空，URI 前不写空格时（如 `GET` + 200 个 A）在 0x00407898 解引用空指针，读未映射内存崩溃。
> - **漏洞2（全局溢出）：** `Host:` 头经 `strcpy()` 无长度限制写入约 64 字节的全局 `re_ip_des`，9000 字节可覆盖相邻全局变量 `entry_config_buf`。
> - **漏洞3（需认证）：** POST 处理按用户提供的 `Content-Length` 用 `fread()` 写入 10000 字节的 `global_post_buffer`，其后紧邻 mime 处理函数指针，可劫持控制流。
> - **模拟技巧：** 用 `LD_PRELOAD` hook `/dev/nvram` 访问并返回解码后的配置键值对，消除 401 Unauthorized，使模拟环境与真机行为一致。

## Introduction

To avoid the typical intro preamble, let’s dive straight into the juicy bits of doing this research.

While we already had command line access to the WAG54G available through the [serial console](https://www.elttam.com/blog/gaining-console-access-to-the-WAG54G-home-router/), we chose to find another way of gaining remote access to the device for some added flavor. Having console access is an important first step in understanding how the device works and beginning analysis. The WAG54G router comes with an option to enable remote management via Telnet, and can be enabled using its web interface:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e424b8dc7228a76f.avif)

Unfortunately the default shell is restricted and only exposes typical “admin” commands that are available through the routers web interface. This means we lose the ability to explore the underlying Linux OS and filesystem, and basically looks something like this:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/300b39b400396a29.png)

Well that’s just not good enough. One option is to exploit a vulnerability in the shells command line parsing, which is a promising vector and quickly revealed trivial bugs like the following:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fd4b3c2a501f093e.avif)

However it still feels a little dirty even having to see the custom shell prompt, surely there’s a better way of breaking out? The bug above is nice enough to show us the admin users shell is `/bin/configurator`. What if we can update that entry to point to `/bin/sh`?

Fortunately, **Protip #1** of router hacking dictates: When thou needeth a shell, pop a command injection into the “diagnostic ping” page. Rumor has it that 80% of the time, it works every time.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1fe8d22972bf7afe.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7ed3559042fc540b.png)

Voilà! The command injection in `ping_interval` overwrites `/etc/passwd` with a new entry for admin, and successfully breaks out of the restricted shell. The next time we try authenticating over Telnet, we’re greeted with a friendly busybox prompt:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dad087d20b2dcb64.avif)

So far so good, but this hasn’t technically advanced any further than our previous blog post. The next steps are where things get better, we use the WAG54G devices `tftp` client to upload binaries and library dependencies onto our laptop for offline analysis.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/efdc9dec0f0dc5a2.avif)

## Static analysis

Now we’re finally ready to begin the real adventures. To get a lay of the land, we ran the `file` command against the binaries to see how they’re linked:

`‍`

```bash
mbp-wifi:Desktop daniel$ file ./httpd
./httpd: ELF 32-bit LSB executable, MIPS, MIPS-I version 1 (SYSV), dynamically linked (uses shared libs), stripped
```

`‍   `

Learning that our target is a dynamically linked (and stripped) ELF executable compiled for the 32-bit MIPS little endian architecture. Having a copy of the [MIPS instruction set documentation](http://www.cs.cornell.edu/courses/cs3410/2008fa/mips_vol2.pdf) handy for reference, an iced-tea, and a copy of [IDA Pro](https://www.hex-rays.com/) - we’ve got everything we need to begin hacking.

### Bug #1

This vulnerability is not going to stop the press, but it was a personal moment of celebration. It’s significance shows that we understand enough about the MIPS instruction set to successfully find bugs!

The following screenshot shows a fragment of code which parses an HTTP request, attempting to break apart the request method from the URI by calling the [`strsep()`](http://linux.die.net/man/3/strsep) libc function:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3956fe06a8d62ead.avif)

The problem is `strsep()` can set `*curptr` to `NULL` if the end of the source string is reached and no tokens are found. This condition is not tested for in the code, and as a result the dereference at `0x00407898` causes an access violation reading unmapped memory.

The following commands can be used to verify the issue (note the lack of whitespaces):

```bash
python -c 'print "GET" + "A" * 200 + "\n"' | nc 192.168.1.1 80
```

Which results in the following segmentation fault:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ba57c1066fead371.avif)

### Bug #2

The next bug we came across was slightly more interesting. The code attempts to parse the `Host:` header while copying its value into the `re_ip_des` global char array. The problem is the use of [`strcpy()`](http://linux.die.net/man/3/strcpy) which performs an unbounded copy using an attacker supplied string, and the destination is of a fixed-length (~64 byte) buffer. By sending a large value in the header, an attacker can exploit this to overwrite other global variables on the heap - a construct which might be useful for privesc:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8b8569bc22f90066.avif)

The following commands can be used to verify the issue:

```bash
python -c 'print "GET /index.asp HTTP/1.0\nHost: " + "B" * 9000 + "\n\n"' | nc localhost 80
```

In which the `entry_config_buf` variable is after `re_ip_des` and is overwritten with “BBBB”:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8e92e7756b96aa3f.png)

### Bug #3

The final bug we came across is potentially the most interesting, however it’s triggered post-auth so would need to be combined with another vulnerability to be useful.

The issue itself is a result of calling [`fread()`](http://linux.die.net/man/3/fread) into a fixed-size global buffer, but using an unbounded `Content-Length` size which has been provided by the remote user:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e905f1ade940352f.png)

What is nice about this construct is `global_post_buffer` is 10,000 bytes in size, and is directly followed by function pointers for handling mime types and other goodies. This makes exploitation relatively straight forward:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8b1053057ef79dd8.avif)

The following commands can be used to verify the issue:

```bash
python -c 'print "POST /apply.cgi HTTP/1.0\nAuthorization: Basic YWRtaW46YWRtaW4=\nContent-Length: 20000\n\n" + "A" * 20000' | nc localhost 80
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f4b3b94062961660.avif)

*NB: The auth token is required in this case, as POST requests are only handled after a connection has been authenticated.*

## Runtime analysis

To ensure that our understanding of MIPS assembly was correct, it was necessary to perform runtime testing on the binaries and ensure our triggers lead to a crash. While this activity could have been done against the WAG54G device itself, we chose to use an emulated environment with full control over tools and debuggers. We achieved this by using [QEMU](http://wiki.qemu.org/Main_Page).

### Setup

A great stack exchange post can be found [here](http://reverseengineering.stackexchange.com/questions/8829/cross-debugging-for-mips-elf-with-qemu-toolchain) which details much of the needed steps to get ready. On our OSX laptop with the [brew](http://brew.sh/) package manager, these are the commands that were used:

```bash
brew install qemu
mkdir linksys54g
cd linksys54g
curl -O https://people.debian.org/~aurel32/qemu/mips/vmlinux-3.2.0-4-4kc-maltaurl -O https://people.debian.org/~aurel32/qemu/mips/debian_wheezy_mips_standard.qcow2
qemu-system-mipsel -M malta -kernel vmlinux-3.2.0-4-4kc-malta -had debian_wheezy_mipsel_standard.qcow2 -append "root=/dev/sda1 console=tty0" -m 512M
```

`‍   `

Once the machine has booted we can update it and install our binaries:

```bash
apt-get update
apt-get install gcc gdb vim screen curl
curl -O https://website.com/files.tar.gz # binaries/shared libraries etc
tar -zxvf ./files.tar.gz
cp *.so /lib
```

`‍   `

The following screenshot shows what it looks like running the httpd in our emulated environment:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/68f83d36783119b7.avif)

### Hooking

Although we are successfully running the executables in our own environment, several errors related to `/dev/nvram` access are causing “401 Unauthorized” errors. This may limit the amount of code we are able to exercise.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e5a6c0d2a09a2d9a.avif)

To resolve this issue, we decided to perform `LD_PRELOAD` hooking to intercept requests to the nvram device and send custom responses back. The hooks used an export of the WAG54G routers configuration, which was decoded with the tool [here](http://www.strodl.org/tools/linksys_mod.c). The following Vim macro was used to convert the tools output into a C like structure, representing the devices configuration as key-value pairs:

```
0i{"^[f=i","^[lxA"},
```

The final version of the nvram hooking code can be downloaded here.

Re-executing the daemon with the hook shows no further errors, indicating we have successfully emulated the runtime found on the physical device.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/866f66f1f7c51feb.avif)

## Conclusion

Using the above steps, we have successfully started the process of vulnerability discovery and proof of concept development against the router. In a future blog post, we hope to explore ways in which these vulnerabilities can be exploited to enable flashing C&C firmware onto the device pre-auth.

If you’re wondering about the disclosure timeline for these bugs, long story short the WAG54G has reached end-of-life support. If you’re an [internet hero](https://en.wikipedia.org/wiki/Zeroday_Emergency_Response_Team), you can always release your own updates! or choose to flash your router with the great [OpenWRT](https://openwrt.org/) firmware.
