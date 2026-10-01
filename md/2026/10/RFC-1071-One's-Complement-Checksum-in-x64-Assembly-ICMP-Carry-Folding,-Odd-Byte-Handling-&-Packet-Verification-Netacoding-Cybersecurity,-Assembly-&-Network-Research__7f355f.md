---
title: "RFC 1071 One's Complement Checksum in x64 Assembly: ICMP Carry Folding, Odd-Byte Handling & Packet Verification | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/rfc-1071/
source_host: netacoding.com
clip_date: 2026-10-01T10:16:18+08:00
trace_id: 80a97f75-e87a-4454-8e3e-d0d4dc8be301
content_hash: 789a1d299e5417c0c012da52870981f6cdd8a8f4c654415b5c6ce4963c4acf25
status: synced
tags:
  - 协议分析
  - 网络工具
series: null
feed_source: Netacoding·协议/逆向
ai_summary: ICMP 校验和按 RFC 1071 以 x64 汇编实现：16 位反码求和、奇数字节补齐、进位回卷后取反，算错则被目标内核当作畸形包丢弃。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-81e6-b6eb-c833c45efdef
ioc:
  cves: []
  cwes:
    - CWE-290
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> ICMP 校验和按 RFC 1071 以 x64 汇编实现：16 位反码求和、奇数字节补齐、进位回卷后取反，算错则被目标内核当作畸形包丢弃。
> 
> - **算法核心：** 按 16 位（word）分块遍历数据缓冲，用 `movzx r12d, word [rdi+r10]` 零扩展读入并累加到 `eax`，偏移每次前进 2 字节，循环前先 `xor eax, eax` 清零累加器。
> - **寄存器约定：** `rdi` 为缓冲区起始地址，`r14` 起始偏移，`r15` 结束偏移，`r10` 作当前偏移，`r11` 用于计算剩余字节数。
> - **奇数字节处理：** 剩余字节 ≤1 时跳出主循环；恰剩 1 字节则读取该单字节直接加入累加器，剩 0 字节则跳过进入收尾。
> - **进位回卷：** 求和可能溢出 16 位，故把和复制到 `r11d` 右移 16 位取出进位，`and eax,0xFFFF` 保留低 16 位，再 `add ax,r11w` 加回进位，`adc ax,0` 处理二次进位。
> - **最终校验：** `not ax` 取反得到校验和；接收端对整包做同样累加应得 `0xFFFF`，即验证数据未被篡改。

## Research Context

As the development of my ICMP-based Network Communication Project continues at full throttle, today I want to talk about the most “diplomatic” part of the operation: the Checksum. If you don’t stamp this seal correctly on the packet you’re sending, the Target host’s operating system treats your packet as a “Malformed data” and dumps it in the trash before it even gets through the door.

So, how exactly is this “seal” calculated in a low-level language? Let’s examine it step-by-step through the very algorithm I wrote and currently use in my project.

## 🛠️ The Heart of the Algorithm: perform_checksum

The ICMP protocol uses a 16-bit One’s Complement sum to ensure data integrity. This means you have to add up the entire packet in 16-bit (2-byte) chunks.

Here is what this mathematical operation looks like in the x64 Assembly realm:

Note: In this context, rdi represents the starting address of our data buffer, r14 is the starting offset, and r15 is the ending offset.

```nasm
perform_checksum:

    ; RFC 1071 standard 16-bit one's complement sum algorithm

    xor eax, eax                ; Clear eax (Accumulator for the sum)

    mov r10, r14               ; r10 = Current offset

.loop:

    mov r11, r15               ; r11 = End offset

    sub r11, r10                ; Remaining bytes to process

    cmp r11, 1                  ; Check if only 1 byte is left (odd length)

    jle .last                       ; If <= 1 byte left, jump to final block

    

    movzx r12d, word [rdi + r10]; Read 2 bytes (1 word) zero-extended

    add eax, r12d              ; Add to accumulator

    add r10, 2                   ; Move offset forward by 2 bytes

    jmp .loop                   ; Repeat
```

## 🧩 Part 1: Gathering the Pieces

We are essentially telling the CPU: “Fetch me a 16-bit (word) chunk from memory, add it to the eax register, and move to the next 2 bytes.” This loop runs smoothly until we hit the end of the packet.

## ⚖️ Part 2: The “Odd Byte” Paradox

If the total length of the packet is an odd number (e.g., 11 bytes), the very last byte won’t have a pair to form a 16-bit word. In this scenario, our algorithm elegantly dives into the.final block:

```nasm
.last:
    je .final                   ; If exactly 1 byte left, handle it
    jmp .wrap                   ; If 0 bytes left, finalize calculation
.final:
    movzx r12d, byte [rdi + r10]; Read the last remaining single byte
    add eax, r12d               ; Add it to the accumulator
```

## 🔄 Part 3: The Wrap and Carry

Mathematically, this continuous addition might exceed a 16-bit boundary. This is where the most critical aspect of RFC 1071 comes into play: Adding the overflowing bits (the carry) back into the main sum.

```nasm
.wrap:
    mov r11d, eax               ; Copy sum to r11d
    shr r11d, 16                ; Shift right to isolate the carry bits
    and eax, 0xFFFF             ; Mask eax to keep only the lower 16 bits
    add ax, r11w                ; Add the carry bits back to the sum
    adc ax, 0                   ; Add any final carry (add with carry)
    not ax                      ; One's complement (invert bits) for final checksum
    ret
```

## 🎯 Why not ax?

The not instruction at the very end is the final requirement of the One’s Complement logic. By inverting the bits (0 -> 1, 1 -> 0), we ensure that when the receiving end takes our packet and performs the exact same addition, the result will be 0xFFFF. If it is, the data is clean, and our seal is valid!

### Conclusion

Writing this algorithm in Assembly is a fantastic exercise to truly understand how data is laid out in memory and how the CPU crunches bytes. Thanks to this algorithm, our custom ICMP packets can bypass kernel-level drops and roam the network like “official documents”.

When I integrate dynamic targeting and fileless execution (memfd_create) into my Distributed management architecture, this checksum engine will remain the most reliable gear in the machine.

Stay Coded!

## Related

-   [CWE-290 at Layer 3: IP Source Spoofing and uRPF Failure in Enterprise Wireless Infrastructure](https://netacoding.com/posts/cwe-290/)
-   [EtherLeak: IP Total Length Over-read via Ethernet Frame Padding](https://netacoding.com/posts/etherleak-reloaded/)
-   [Ghost Leak — Pre-Auth Buffer Over-read via TTL=0 + IP Total Length in ArubaOS 8.13.2.0](https://netacoding.com/posts/ghost-leak/)
-   [SHA-256 Output Distribution Analysis/CDP](https://netacoding.com/posts/cdp-sha256-structural-analysis/)
-   [ICMP-Ghost: Fileless C2 with ICMP & DNS Tunneling in Pure x64 Assembly](https://netacoding.com/posts/icmp-ghost/)
