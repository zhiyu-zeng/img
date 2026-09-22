---
title: Cyhub CTF 2025 - Hidden Gems | Varik's Blog
source: https://varik.dev/blog/cyhubctf2025/hidden-gems
source_host: varik.dev
clip_date: 2026-09-22T10:15:59+08:00
trace_id: ca35d8fe-d4ad-42c1-846c-70479538f00b
content_hash: b7b43f82c1f91c2a4235db3393672d03174bcafae76907a38548fcbd286d8ea8
status: synced
tags:
  - CTF
  - 脱壳与加固
series: null
feed_source: Varik
ai_summary: Rust 编写的 CTF 逆向题，需先解出整数除法校验的 vault key 解密内嵌 ELF，再动态分析该二进制提取 2FA key，最终拼出 flag。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e375244-d011-81dd-8c4b-cc62c6b6eaa6
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Rust 编写的 CTF 逆向题，需先解出整数除法校验的 vault key 解密内嵌 ELF，再动态分析该二进制提取 2FA key，最终拼出 flag。
> 
> - **两阶段结构：** 主程序为 Rust 二进制 `hidd3n_g3ms`；第一阶段求 vault key 以解密内嵌的 XOR 加密 ELF（只在内存中执行、不落盘），第二阶段从解密后的二进制取 2FA key。
> - **Stage 1 校验逻辑：** `unseal` 函数用 128 位整数除法内建 `__udivti3`，判据等价于 `n / 89390388893795660 == 1337`；key 以整数形式编码 ASCII。
> - **设计缺陷（整除向下取整）：** n 在 `[119514949951004797420, 119514949951094187780)` 区间内均可通过；作者预期值 `119514949951004811051` 解码为 `w311_d0n3`，直接相乘的边界值同样有效。
> - **Stage 2 提取：** 用 GDB + pwndbg 运行并在 2FA 提示处 Ctrl+C 中断，反汇编 `g3ms` 读取逐字符比较（如 `0x74`→'t'、`0x34`→'4'），得到 2FA key `t4k3_y0ur_g3ms`。
> - **最终 flag：** `cyhub{w311_d0n3_t4k3_y0ur_g3ms}`；推荐工具 Ghidra、IDA Pro、radare2、pwndbg。

## Hidden Gems

For Cyhub CTF 2025, I created a multi-stage reverse engineering challenge that combines modern and classic RE techniques. Hidden Gems is built with Rust and involves decrypting a hidden ELF binary embedded within the main program. The challenge required players to understand binary analysis, encryption schemes, and multi-stage exploitation.

## Challenge Description

Players are provided with the `hidd3n_g3ms` binary. The goal is to find the flag hidden through two layers of obfuscation.

**Category:** Reverse Engineering  
**Difficulty:** Medium  
**Flag Format:** `cyhub{xxxxx}`

## Challenge Overview

This challenge involves two main stages:

1.  **Stage 1 - Vault Unsealing:** Analyze the Rust binary to find the correct "vault key" that will decrypt a hidden ELF binary
2.  **Stage 2 - 2FA Bypass:** Analyze the decrypted binary to extract the 2FA key and construct the final flag

The twist? The binary is written in Rust, which produces different assembly patterns compared to traditional C/C++ binaries. Additionally, the second-stage binary is XOR-encrypted and embedded within the first binary, only being decrypted and executed in-memory when the correct vault key is provided.

## Solution Walkthrough

### Stage 1: Finding the Vault Key

**Step 1: Static Analysis**

Use a disassembler like Ghidra, IDA Pro, or radare2 to analyze the `hidd3n_g3ms` binary. Since it's a Rust binary, you'll notice some differences in how functions are structured and named compared to typical C binaries.

**Step 2: Locate the `unseal` function**

This function contains the vault key validation logic. In the disassembled code (src/main.rs:97), you'll find:

```rust
auVar2 = __udivti3(uStack_b8,uStack_b0,0x13d9415c859454c,0);
if (auVar2._0_8_ == 0x539 && auVar2._8_8_ == 0) {
```

This is a 128-bit integer division operation that's equivalent to:

```rust
if n / 89390388893795660 == 1337 {
    // vault unseals
}
```

**Step 3: Calculate the key (Intended Solution)**

The intended approach is to use the correct key I designed for the challenge:

```javascript
n = 119514949951004811051
```

Convert this number to ASCII:

-   `119514949951004811051` represents the bytes: `[119, 51, 49, 49, 95, 100, 48, 110, 51]`
-   Which translates to: `w311_d0n3`

However, if you try the straightforward mathematical approach by solving `n = 89390388893795660 * 1337`, you get:

```javascript
89390388893795660 * 1337 = 119514949951004797420
```

This doesn't match the intended key! Why? Because of a bug in my challenge design.

**Step 4: The Floor Division Bug**

After the CTF, **Hayk** pointed out an interesting bug in my implementation. Since the check uses integer floor division:

```rust
if n / 89390388893795660 == 1337 {
    // vault unseals
}
```

Any value in the following range will pass the check:

```javascript
119514949951004797420 <= n < 119514949951094187780
```

This is because integer division truncates (floors) the result. So `1337.something` becomes `1337`.

My intended key `119514949951004811051` falls within this valid range, which is why it worked. But mathematically, the "correct" answer from simple multiplication (`89390388893795660 * 1337 = 119514949951004797420`) also works!

**How players solved it:**

Despite this bug, players still managed to find valid keys through manual brute-forcing:

1.  They could extract partial ASCII from the numbers (like `w311_`)
2.  By manually trying different printable ASCII characters for the remaining positions
3.  They found numbers within the valid range that decoded to readable strings

It's a good reminder that challenge design requires careful attention to edge cases in mathematical operations.

**Vault Key:** `w311_d0n3`

### Stage 2: Extracting the 2FA Key

**Step 1: Run with the vault key**

Execute the binary and provide `w311_d0n3` when prompted for the vault key.

**Step 2: Binary decryption**

The program will decrypt an embedded ELF binary and execute it in memory, prompting: "2FA Required (input char by char)".

**Step 3: Dynamic analysis with GDB**

```bash
gdb ./hidd3n_g3ms
(gdb) run
# Enter vault key: w311_d0n3
# When it prompts for 2FA, press CTRL+C
```

**Step 4: Disassemble the decrypted binary**

Once stopped, you can disassemble the running code:

```javascript
pwndbg> disassemble main
Dump of assembler code for function main:
   0x000055555555551a <+0>:     push   rbp
   0x000055555555551b <+1>:     mov    rbp,rsp
   ...
   0x0000555555555541 <+39>:    call   0x555555555504 <l0l>
   0x000055555555554b <+49>:    call   0x55555555550f <l33t>
   0x0000555555555555 <+59>:    call   0x555555555179 <g3ms>
   ...

pwndbg> disassemble g3ms
Dump of assembler code for function g3ms:
   0x0000555555555179 <+0>:     push   rbp
   0x000055555555517a <+1>:     mov    rbp,rsp
   0x000055555555517d <+4>:     sub    rsp,0x10
   ...
   0x00005555555551a5 <+44>:    cmp    al,0x74      # Checking for 't' (116)
   0x00005555555551a7 <+46>:    je     0x5555555551b3
   ...
   0x00005555555551e5 <+108>:   cmp    al,0x34      # Checking for '4' (52)
   ...
```

**Step 5: Extract the 2FA key**

By analyzing the comparisons in the `g3ms` function (from gem.c), you'll find it expects these characters:

| Position | Hex | ASCII | Character |
| --- | --- | --- | --- |
| 1   | 0x74 | 116 | t   |
| 2   | 0x34 | 52  | 4   |
| 3   | 0x6b | 107 | k   |
| 4   | 0x33 | 51  | 3   |
| 5   | 0x5f | 95  | \_  |
| 6   | 0x79 | 121 | y   |
| 7   | 0x30 | 48  | 0   |
| 8   | 0x75 | 117 | u   |
| 9   | 0x72 | 114 | r   |
| 10  | 0x5f | 95  | \_  |
| 11  | 0x67 | 103 | g   |
| 12  | 0x33 | 51  | 3   |
| 13  | 0x6d | 109 | m   |
| 14  | 0x73 | 115 | s   |

**2FA Key:** `t4k3_y0ur_g3ms`

### Final Flag

The program constructs the final flag by combining both parts:

```javascript
cyhub{<vault_key>_<2fa_key>}
cyhub{w311_d0n3_t4k3_y0ur_g3ms}
```

## Key Technical Details

-   **Language:** Rust - produces different assembly patterns than C/C++
-   **Encryption:** XOR-based encryption for the embedded ELF
-   **In-memory execution:** The decrypted binary never touches disk
-   **Division check:** 128-bit integer division using `__udivti3`
-   **ASCII encoding:** The vault key is encoded as a large integer
-   **Character-by-character validation:** The 2FA uses sequential character checks

## Tools Recommended

-   **[Ghidra](https://ghidra-sre.org/)** - Free reverse engineering tool by NSA
-   **[IDA Pro](https://hex-rays.com/ida-pro/)** - Industry-standard disassembler
-   **[GDB with pwndbg](https://github.com/pwndbg/pwndbg)** - For dynamic analysis
-   **[radare2](https://rada.re/)** - Open-source RE framework

The challenge source code can be found [here](https://github.com/var77/cyhubctf2025/tree/main/hidd3n_g3ms)
