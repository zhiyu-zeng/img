---
title: "IP Endianness in x64 Assembly: Big-Endian Network Byte Order to ASCII | Single-Pass div Algorithm Without inet_ntoa | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/algorithmforprinting-ip_addresses/
source_host: netacoding.com
clip_date: 2026-10-01T10:15:48+08:00
trace_id: 8131d8ba-83a1-4ea9-97d2-de5d70578559
content_hash: ff2f0077b391fb202a519f7e129f21faf679558e0d4ade55db083a76df53d7da
status: synced
tags:
  - 协议分析
  - 网络工具
series: null
feed_source: Netacoding·协议/逆向
ai_summary: 在 x64 汇编中处理 sockaddr_in 里的大端 IP 字节时，用"逆序读取 + 逆序写入"的单趟循环直接生成 ASCII 点分十进制，省去反转字符串的第二趟遍历。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-8184-9abb-d1e4cef144de
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 在 x64 汇编中处理 sockaddr_in 里的大端 IP 字节时，用"逆序读取 + 逆序写入"的单趟循环直接生成 ASCII 点分十进制，省去反转字符串的第二趟遍历。
> 
> - **字节序冲突：** 网络字节序是大端，x86/x64 是小端，4 字节 IP 读进寄存器后顺序被反转，直接打印会出现 5.1.168.192 这类结果；纯汇编 sniff 无法调用 inet_ntoa，必须逐字节手工转换。
> - **两个调试陷阱：** DIV 指令固定占用 AX，商在 AL、余数在 AH，若未及时清零 AH，IP 各段数值会被破坏；点号 0x2E(46) 必须插在八位组之间且不能落在末尾。
> - **单趟逆序构建：** 从 sockaddr_in 偏移 7 读到 4，同时把 ASCII 从 15 字节缓冲区末尾（rdi=15）往回写，字符串自然按从左到右的正确顺序成形，避免"先转字符串再反转"带来的额外内存读写与代码膨胀。
> - **循环要点：** `movzx ax` 取一个八位组，`div bl`（除 10）后余数加 48 转 ASCII 存入并 `dec rdi`；`rcx==4`（最后一组）时跳过点号；`cmp rcx,3` 判断 4 组是否处理完。
> - **出处：** 该算法与 asm-icmp-sniffer 完整源码见作者 GitHub 仓库 JM00NJ/asm-icmp-sniffer，定位为授权安全研究与 IDS 检测评估用途。

## Research Context

When doing low-level network programming in Assembly, you experience firsthand the immense chaos running behind the scenes of operations we solve with a single line in high-level languages (Python, C, etc.). While developing the Nested-ICMP-Communication Analysis project, specifically an Encapsulated ICMP framework, I hit exactly this kind of wall: extracting an IP address from a packet header and printing it to the screen in the correct format.

Sounds simple, right? However, when x86 architecture and network protocols are involved, seeing 5.1.168.192 instead of 192.168.1.5 on your terminal is extremely common.

So why does this happen, and what kind of algorithm did I develop to overcome this issue during the debugging process? Let’s dive into the background.

### The Endianness Problem in Network Headers

When you capture a packet coming over the network and read the source/destination IP address inside the sockaddr_in structure, the data arrives in Network Byte Order (Big-Endian) format. This means the most significant byte is stored at the lowest memory address.

However, the x86/x64 processor architectures we use rely on Little-Endian (Host Byte Order). When the processor pulls this 4-byte IP data into a register, the reading direction is effectively reversed for our purposes.

The result? A packet that arrives as 192.168.1.5 appears scrambled if we try to naively print it from memory. The inet_ntoa() function in high-level languages handles this conversion in the background. But if you are writing a custom sniffer in pure Assembly, you must do this conversion byte by byte yourself.

### Debugging Hell: The Problems Encountered

While writing this conversion, I encountered a few critical issues that cost me hours in GDB (GNU Debugger):

Register Clashes: While separating each octet (byte) of the IP address and converting it to an ASCII character (string), you must use the AX register for division operations (DIV). If you don’t carefully manage your remainders (AH) and quotients (AL), the numbers of the IP address get completely corrupted.

The Dot (.) Separator: It’s not enough to just convert the numbers; a. (0x2E / 46 in decimal) character must be inserted exactly between each octet, but not at the very end.

Performance Loss (The Reversing Trap): In standard logic, you parse the IP, convert it to a string, and realize the string is backwards. Then, you write a second loop to reverse that string. This creates unnecessary memory read/write cycles and bloats the code.

### The Solution: A Single-Pass Backward Build Algorithm

To solve the problem, instead of creating the string and then reversing it, I designed a more optimized algorithm.

The logic is simple but highly effective: Read the IP bytes backwards, and write the ASCII string backwards. By starting at the end of the IP address within the sockaddr_in structure (offset 7 down to 4) and writing from the end of a 15-byte output buffer (addr_ip) down to index 0, the string naturally formats itself correctly from left to right.

Here is the exact critical loop from my engine:

### ASSEMBLY CODE:

```nasm
; IP ADDRESS TO STRING ALGORITHM (EXTRACT REVERSE BYTE-BY-BYTE AND CONVERT TO ASCII)

    xor rdx, rdx                ; Clear rdx
    xor rbx, rbx                ; Clear rbx
    mov rcx, 7                  ; Start index for reading IP from sockaddr_in (sin_addr offset)
    mov rdi, 15                 ; Start index for writing to the addr_ip buffer (backwards)
_loopforip:
    mov bl, 10                  ; Divisor for base-10 conversion
    movzx ax, [incoming_addr+rcx] ; Fetch one octet from IP address
_divloop:
    div bl                      ; Divide AX by 10; AL = quotient, AH = remainder
    add ah, 48                  ; Convert remainder to ASCII character
    mov [addr_ip+rdi], ah       ; Store ASCII character in the output buffer
    dec rdi                     ; Move buffer pointer backward
    xor ah, ah                  ; Clear AH for the next division cycle
    cmp al, 0                   ; Check if quotient is zero
    jg _divloop                 ; If not zero, continue extracting digits
    
    cmp rcx, 4                  ; Check if this is the last octet (first IP block)
    je _contiune                ; If last octet, skip adding the dot separator
    mov byte [addr_ip+rdi], 46  ; Insert '.' (dot) character
_contiune:
    dec rdi                     ; Move buffer pointer backward for the next octet
    dec rcx                     ; Move to the next IP octet in sockaddr_in
    cmp rcx, 3                  ; Check if all 4 octets have been processed
    jg _loopforip
```

This single-pass method successfully converts the raw network bytes into a human-readable ASCII string using minimal CPU cycles, entirely avoiding an extra “string reversing” loop.

### Conclusion and Open Source

Network programming in Assembly might seem tedious at first, but it is a unique experience for understanding the true mechanics underlying these systems. Especially when working on tunneling architectures aimed at Evaluating IDS detection resilience, having this level of byte-control is absolutely vital.

You can find this algorithm in action, along with the complete source code of the asm-icmp-sniffer, on my GitHub profile:

[JM00NJ/asm-icmp-sniffer](https://github.com/JM00NJ/asm-icmp-sniffer)

Disclaimer: This article and the associated source code are intended for educational purposes and authorized security research only. Understanding low-level network protocols is essential for building better defense mechanisms.
