---
title: "Bare-Metal HTTP Server in x86_64 Assembly: sys_sendfile Zero-Copy, Raw Sockets & Path Traversal Prevention | No libc | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/assembly-httpserver/
source_host: netacoding.com
clip_date: 2026-10-01T10:17:08+08:00
trace_id: 56bf470c-b5d2-447c-bd23-7252bdc124dc
content_hash: e999345a4ce3d149e8ebc83e8d53246dfa131134c6ef7fa47c066e4cdf92d7b5
status: synced
tags:
  - Linux安全
  - 网络工具
series: null
feed_source: Netacoding·协议/逆向
ai_summary: 不用 libc，纯 x86_64 汇编直接调用 Linux 系统调用，从零实现一个支持零拷贝传输与路径穿越防护的 HTTP 服务器。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-8172-a987-f637e8d0e5fc
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 不用 libc，纯 x86_64 汇编直接调用 Linux 系统调用，从零实现一个支持零拷贝传输与路径穿越防护的 HTTP 服务器。
> 
> - **服务器骨架：** 依次调用 sys_socket(41)、sys_bind(49)、sys_listen(50)、sys_accept(43)、sys_read(0)，并手动按内核约定摆放 RAX、RDI、RSI 等寄存器。
> - **端口字节序：** 绑定 0.0.0.0:8080 时用 `bswap` 指令把端口号转成网络大端序。
> - **路径穿越防护：** 解析 `GET /filename HTTP/1.1` 请求时，用 `SCASB` / `LODSB` 手工扫描字符串，检测并阻断 `../` 攻击。
> - **IP 转可读文本：** 没有 `print()` 和 `inet_ntoa()`，需对 IP 每个字节反复 `div` 10 取位、加 0x30 转 ASCII，再用 sys_write 输出并手工插入点号。
> - **零拷贝传输：** 先 sys_open(2) 打开文件、sys_fstat(5) 取精确大小，再用 sys_sendfile(40) 让数据从磁盘经内核空间直达 socket，绕过用户态内存复制。

When we need to quickly share a file or serve a local directory, we often rely on handy, one-line tools like `python -m http.server`. But what exactly happens under the hood of this “magical” command at the operating system level?

To answer this question, I decided to strip away all the abstractions provided by modern programming languages. Without using any external libraries—not even the standard C library (`libc`)—I built a fully functional HTTP server communicating directly with the Linux Kernel using **pure x86_64 Assembly**.

Here is the anatomy of a web server in the “bare-metal” world.

## The Foundation: The “Syscall” Dance

While opening a socket takes just one line of code in modern languages, in the Assembly world, you have to invoke System Calls (Syscalls) directly and arrange the CPU registers (`RAX`, `RDI`, `RSI`, etc.) exactly as the Kernel expects them.

The core lifecycle of the server looks like this:

1.  **`sys_socket` (41):** Laying the foundation for our TCP (IPv4) bridge.
2.  **`sys_bind` (49):** Binding our server to the `0.0.0.0:8080` address. Here, we used the `bswap` instruction to convert the port number into network byte order (Big-Endian).
3.  **`sys_listen` (50) & `sys_accept` (43):** Listening for incoming browsers or `curl` requests, and generating a new dedicated File Descriptor (FD) for every connected guest.
4.  **`sys_read` (0):** Reading the raw `GET /filename HTTP/1.1` request into memory and parsing it. At this stage, to ensure server security, I used manual string operations (`SCASB` / `LODSB`) to detect and block **Path Traversal (`../`)** attacks.

However, there are two specific areas where this project truly shines: the **IP conversion algorithm** and **Zero-Copy file transfer**.

## Binary to ASCII: Speaking “Human” IP

When a client connects, `sys_accept` provides their IP address within a `sockaddr_in` structure. But this IP isn’t a friendly string like “192.168.1.5”; it’s a 4-byte binary value sitting sequentially in memory. Since Assembly doesn’t have a `print()` function or `inet_ntoa()`, printing these 4 bytes to the terminal in a readable format is a serious task.

I had to write a custom routine for this:

-   We fetch each octet (byte) of the IP one by one.
-   We repeatedly divide the number by 10 (using the `div` instruction) to extract its individual digits.
-   We convert each digit into text by adding `0x30` (the ASCII value of the ‘0’ character).
-   We use `sys_write` to print them to the terminal, manually inserting dots (`.`) in between to create that familiar `IPv4` format.

## Peak Performance: sys_sendfile (40)

When sending a file to a client, simple servers usually follow this path: Read the file from disk (`sys_read`) -> Copy it to User-Space memory -> Write it from memory to the socket (`sys_write`). This process forces the CPU to waste cycles copying data back and forth.

In this project, we implemented the **Zero-Copy** architecture used by high-performance modern web servers like Nginx.

After opening the file from disk with `sys_open` (2) and retrieving its exact size with `sys_fstat` (5), the real star of the show steps in: **`sys_sendfile` (40)**. This brilliant system call “teleports” the data directly from the disk to the Network Interface (via Kernel-Space), completely bypassing our User-Space memory.

```nasm
; Zero-Copy File Transfer
mov rax, 40                 ; sys_sendfile
mov rdi, [socketfd_no]      ; Destination: Browser/Client Socket
mov rsi, [file_fdno]        ; Source: The file on the disk
xor rdx, rdx                ; Offset: 0 (Start from the beginning)
mov r10, [statbuff + 48]    ; The exact file size returned from fstat
syscall
```

The result? Maximum I/O performance and minimal CPU overhead.

## Conclusion

Hundreds of lines of Assembly code, hours wrestling with segmentation fault errors, and strictly adhering to the unforgiving rules of the HTTP protocol… Was it worth all this effort just to serve a file to a browser?

Absolutely.

Sometimes, “reinventing the wheel” is the only true way to understand the physics of how it turns.

Bare-Metal Assembly HTTP Server source code on github: [https://github.com/JM00NJ/http.server](https://github.com/JM00NJ/http.server)

## Related

-   [Building a Low-Level ICMP Sniffer in x64 Assembly (Raw Sockets)](https://netacoding.com/posts/icmp_sniffer/)
-   [memfd_create: Anonymous RAM Files and Volatile Storage in x64 Assembly](https://netacoding.com/posts/volatile-storage/)
-   [Solving IP Endianness in x64 Assembly: A Single-Pass Algorithm](https://netacoding.com/posts/algorithmforprinting-ip_addresses/)
