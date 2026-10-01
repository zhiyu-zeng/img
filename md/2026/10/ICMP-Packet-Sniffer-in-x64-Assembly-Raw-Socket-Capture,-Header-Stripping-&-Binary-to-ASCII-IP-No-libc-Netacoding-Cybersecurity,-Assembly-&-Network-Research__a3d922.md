---
title: "ICMP Packet Sniffer in x64 Assembly: Raw Socket Capture, Header Stripping & Binary-to-ASCII IP | No libc | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/icmp_sniffer/
source_host: netacoding.com
clip_date: 2026-10-01T10:15:28+08:00
trace_id: 19eae6bf-38f8-42c5-8b52-2f5a54f97aa9
content_hash: 3f74a67dc593f82476040b955d0c9ccecd8f69e5661c084e66157f5775a92046
status: synced
tags:
  - 协议分析
  - 网络工具
series: null
feed_source: Netacoding·协议/逆向
ai_summary: 用纯 Linux syscall 的 x64 汇编写 ICMP 嗅探器：raw socket 收包、手工跳过 28 字节协议头、自研二进制转 ASCII 的 IP 打印引擎，全程不依赖 libc。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-81ea-9478-e13043567267
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 用纯 Linux syscall 的 x64 汇编写 ICMP 嗅探器：raw socket 收包、手工跳过 28 字节协议头、自研二进制转 ASCII 的 IP 打印引擎，全程不依赖 libc。
> 
> - **技术栈：** 通过 `sys_socket`（系统调用号 41）配合 `AF_INET`、`SOCK_RAW`、`IPPROTO_ICMP` 建原始套接字，让内核过滤掉 TCP/UDP，只交回 ICMP 包。
> - **收包与剥头：** 用 `sys_recvfrom` 把数据读入缓冲区；IPv4 头 20 字节加 ICMP 头 8 字节共 28 字节，靠 `lea rsi, [sniffed_data + 28]` 一次性跳过，直达载荷。
> - **自研整数转 ASCII：** 对每个 8 位八位组用 `div` 除 10 取余，余数加 48（0x30）得到 ASCII 码，从缓冲区末尾向前反序写入 16 字节空间，并用 `je`、`jg` 条件跳转控制只在八位组之间插入点号，避免字符串畸形。
> - **项目动机：** 在 CPU 周期层面手动管理内存、寄存器分配与类型转换，作为系统安全审计和底层软件分析的学习基础。
> - **合规边界：** 明确定位为教学与安全研究用途，禁止在非自有网络上运行。

## Research Context

In the realm of network security and packet analysis, tools like Python (Scapy) or C are the usual go-tos. However, when we want to strip away all abstraction layers from the OS network stack and talk directly to the processor, resources become incredibly scarce. Finding modern, zero-dependency networking tools written in x64 Assembly on the internet is almost impossible today.

In this post, we will explore the architecture and design decisions behind my x64 Assembly-based ICMP Sniffer project, completely rejecting standard C libraries (libc) and relying purely on direct Linux system calls (syscalls).

## The Concept: Why Assembly?

Our goal isn’t just to catch ICMP (ping) packets on the network. We want to manually manage memory, register allocations, and data type conversions (integer-to-string) at the CPU cycle level. This approach provides a flawless foundation for understanding how hardware behaves during System security auditing and low-level software analysis.

## How Does It Work? (Technical Deep Dive)

### The architecture of the tool is divided into three main phases:

1.  The Raw Socket Foundation To capture raw, unprocessed packets passing through the network interface card (NIC), the application uses sys_socket (syscall 41) with AF_INET and SOCK_RAW parameters. Our target here is strictly the IPPROTO_ICMP protocol. This tells the operating system to filter out all TCP/UDP traffic and hand us only the ICMP packets.
    
2.  Packet Observation and Header Stripping Incoming packets are read into a memory buffer using sys_recvfrom. Since we are using Raw Sockets, the data arrives in its absolute raw form. To reach the actual payload, we must manually bypass the protocol headers:
    

IPv4 Header: 20 Bytes

ICMP Header: 8 Bytes

Therefore, by utilizing the lea rsi, \[sniffed_data + 28\] instruction in our Assembly code, we strip away this 28-byte “noise” and dive straight into the heart of the data.

3.  The Custom Integer-to-ASCII Engine This is the most complex and educational part of the project. The captured IP address (e.g., 192.168.1.29) resides in memory as raw binary (hexadecimal). To print this to the terminal, we must convert it into a human-readable ASCII string.

Since we aren’t using any external printf or itoa functions, I designed the engine as follows:

Each octet (8-bit IP segment) fetched from the network address is divided by 10 using the div instruction.

We mathematically add 48 (0x30) to the remainders to convert them into ASCII characters.

These converted characters are written into a 16-byte memory buffer in reverse order (from end to start).

Using logical brakes via conditional jumps (je, jg), dot (.) characters are strategically inserted only between the octets to prevent malformed strings.

### Conclusion and Source Code

This tool proves how we can filter not just the “existence” of ICMP packets, but the actual payloads hidden inside them (like Non-standard data structures or remote management signals) at the kernel level. Writing our own string conversion engine using nothing but Linux Syscalls, without relying on any external libraries, has been a fantastic exercise in pushing the limits of low-level system programming.

For security researchers, Blue Team members, and exploit development enthusiasts who want to test the tool or review the code, the full source is available on my GitHub profile:

🔗 GitHub Repo: [JM00NJ/asm-icmp-sniffer](https://github.com/JM00NJ/asm-icmp-sniffer)

## ⚠️ Legal Disclaimer

This project is created for educational purposes and security research only. Unauthorized access to computer systems is illegal. The author is not responsible for any misuse of this tool. Operating this tool on networks you do not own is strictly prohibited.

## Related

-   [Defying Python: Building a Bare-Metal HTTP Server in x86_64 Assembly](https://netacoding.com/posts/assembly-httpserver/)
-   [Solving IP Endianness in x64 Assembly: A Single-Pass Algorithm](https://netacoding.com/posts/algorithmforprinting-ip_addresses/)
-   [Network Fingerprinting: Analyzing Default ICMP Structures and Payload Mimicry](https://netacoding.com/posts/network-fingerprinting/)
