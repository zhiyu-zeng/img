---
title: Cyhub CTF 2025 - Stack Guardian | Varik's Blog
source: https://varik.dev/blog/cyhubctf2025/stack-guardian
source_host: varik.dev
clip_date: 2026-09-22T10:16:31+08:00
trace_id: 1835f498-a377-456f-b4d3-931056b52185
content_hash: 13334cc57472013934ee5bd9fd6f3eab8b616412b652eb713aed06c39eaa195c
status: synced
tags:
  - CTF
  - 漏洞分析
series: null
feed_source: Varik
ai_summary: 启用 Canary/PIE/ASLR/NX 的 PWN 题，需串联格式化字符串泄漏与两段 ROP 才能拿 shell 读 flag。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e375244-d011-8124-893e-c651992e3b01
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 启用 Canary/PIE/ASLR/NX 的 PWN 题，需串联格式化字符串泄漏与两段 ROP 才能拿 shell 读 flag。
> 
> - **两处漏洞：** `printf(username)` 直接以用户输入作格式串（可读栈）；`fgets(nonono, 1024, stdin)` 向 32 字节缓冲区读入 1024 字节。
> - **泄漏与定位：** canary 在第 45 个参数位（`%45$llx`），指向 main 的返回地址在第 49 位（`%49$llx`）；PIE 基址 = 泄漏 main 地址 − `elf.sym['main']`。
> - **第一段 ROP：** 用 `pop rdi; ret` 把 `puts@got` 传入，调 `puts@plt` 打印 libc 真实地址，再返回 main 二次利用；libc 基址 = 泄漏 puts 地址 − `libc.sym['puts']`。
> - **溢出布局：** 296 字节填充 + 8 字节 canary（须原样保留）+ 8 字节 saved rbp + ROP 链；调 `system("/bin/sh")` 前需加一个 `ret` gadget 满足 x86_64 的 16 字节栈对齐。
> - **工具：** pwntools 编写利用，pwndbg 配合 GDB 找栈偏移（如 pop rdi gadget 出自二进制 `omg()` 函数），ROPgadget 找 gadget，checksec 查保护。

## Stack Guardian

For Cyhub CTF 2025, I created a classic PWN challenge that combines multiple exploitation techniques. Stack Guardian is a stack-based buffer overflow challenge with modern protections enabled, requiring players to chain together a format string vulnerability and ROP (Return-Oriented Programming) to achieve code execution. This challenge tested players' understanding of both modern binary protections and classic exploitation techniques.

## Challenge Description

Players are given a service to connect to, and the goal is to exploit vulnerabilities in the binary to gain shell access and read the flag from `/flag.txt`.

**Category:** PWN  
**Difficulty:** Medium  
**Flag Format:** `cyhub{xxxxx}`

## Challenge Overview

Stack Guardian implements a seemingly simple program that asks for a username and then accepts additional input. However, it contains two critical vulnerabilities that can be chained together:

1.  **Format String Vulnerability:** The program uses `printf(username)` directly without format specifiers, allowing attackers to read from (and potentially write to) arbitrary memory locations
2.  **Buffer Overflow:** A classic buffer overflow where 1024 bytes can be read into a 32-byte buffer
3.  **Modern Protections:** Stack canary, PIE, ASLR, and NX are all enabled, requiring a sophisticated multi-stage exploit

The challenge requires understanding how these protections work and how to bypass them systematically.

## Vulnerabilities

### Format String Bug (main.c:24)

The first vulnerability is straightforward but critical:

```c
printf("Hi: ");
printf(username);  // Direct use of user input as format string
```

By passing format specifiers like `%llx` as the username, players can read values from the stack. This becomes essential for leaking the stack canary and calculating address offsets.

### Buffer Overflow (main.c:32)

The second vulnerability is a classic buffer overflow:

```c
char nonono[32] = {0};
// ...
fgets(nonono, 1024, stdin);  // Reading 1024 bytes into 32-byte buffer
```

This allows us to overwrite the return address, but we must first bypass the stack canary protection.

## Protection Mechanisms

The challenge isn't just about finding vulnerabilities—it's about bypassing modern security mechanisms:

-   **Stack Canary:** Enabled via `-fstack-protector`, a random value placed before the return address that must remain unchanged
-   **PIE:** Position Independent Executable - all addresses are randomized at runtime
-   **ASLR:** Address Space Layout Randomization - libc and stack addresses change on each execution
-   **NX bit:** Stack is non-executable, preventing simple shellcode injection

## Solution Walkthrough

### Stage 1: Information Leakage

The first step is using the format string vulnerability to leak critical information:

**Leak Stack Canary and PIE base:**

```python
payload = b'%45$llx|%49$llx'  # Canary at 45th offset, main address at 49th
```

By carefully examining the stack layout (using GDB), we can identify that:

-   The stack canary is at the 45th position
-   A return address pointing to main is at the 49th position

**Calculate PIE base:**

```python
elf.address = leaked_main - elf.sym['main']
```

Since PIE randomizes the base address but maintains relative offsets, we can calculate the actual base address by subtracting the known offset of main.

### Stage 2: Libc Leak

With PIE defeated, we need to leak a libc address to defeat ASLR:

**ROP chain to leak libc:**

```python
pop_rdi = rop.find_gadget(['pop rdi', 'ret']).address
rop_chain = pop_rdi + puts_got + elf.plt.puts + main_addr
```

This ROP chain:

1.  Pops the GOT address of `puts` into RDI
2.  Calls `puts` to print the actual libc address
3.  Returns to main to give us another chance to exploit

**Buffer overflow payload structure:**

```javascript
[padding (296 bytes)] + [canary (8 bytes)] + [saved rbp (8 bytes)] + [ROP chain]
```

The padding of 296 bytes was found through debugging - this is the distance from our buffer to the saved canary.

### Stage 3: Code Execution

With the libc address leaked, we can now calculate the addresses of useful functions:

**Calculate libc base:**

```python
libc.address = leaked_puts - libc.sym['puts']
```

**Final ROP chain to spawn shell:**

```python
rop.call(libc.sym['system'], [bin_sh_address])
```

This calls `system("/bin/sh")` to give us a shell.

**Stack alignment caveat:**

Modern x86_64 requires 16-byte stack alignment before function calls. We need to add a `ret` gadget before the system call to ensure proper alignment:

```python
ret_gadget = rop.find_gadget(['ret']).address
payload = ret_gadget + system_call
```

## Key Technical Details

-   **Stack layout:** Buffer is 296 bytes from the saved return address
-   **Format string offsets:** Canary at `%45$llx`, main return address at `%49$llx`
-   **ROP gadgets:** Uses `pop rdi; ret` gadget found in the binary's `omg()` function
-   **Stack alignment:** x86_64 calling convention requires 16-byte alignment
-   **Canary handling:** Must preserve the exact canary value when overflowing

## Tools Recommended

-   **[pwntools](https://github.com/Gallopsled/pwntools)** - Essential Python library for exploit development
-   **[GDB with pwndbg](https://github.com/pwndbg/pwndbg)** - For debugging and finding stack offsets
-   **[ROPgadget](https://github.com/JonathanSalwan/ROPgadget)** - For discovering ROP gadgets
-   **checksec** - To verify which protections are enabled

## Solving the Challenge

Once the exploit is executed successfully:

1.  The format string leaks the canary and PIE base
2.  The first ROP chain leaks a libc address
3.  The second ROP chain spawns a shell
4.  Read the flag: `cat /flag.txt`

The full exploit code can be found [here](https://github.com/var77/cyhubctf2025/blob/main/stack_guardian/exploit.py)
