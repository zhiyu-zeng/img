---
title: 【看雪】CORE CrackMe v2.0 逆向分析解题报告
source: https://bbs.kanxue.com/thread-292122.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-22T20:48:20+08:00
trace_id: f439486d-1a2f-4112-a991-b98b8c57fec8
content_hash: 963c8d66b9cf0753712c40546085152c55ef6595c5c378d86370586f930f70b0
status: summarized
tags:
  - 看雪
  - Windows逆向
  - CTF
series: null
feed_source: 看雪·逆向工程
ai_summary: 通过逆向分析CORE CrackMe v2.0，破解出用户名"KCTF"和序列号"A86CA89F 77F81C3C FD2620F0"，并验证成功。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3a575244-d011-81ec-8438-fe45f44a21bf
ioc:
  cves: []
  cwes: []
  hashes:
    - 95681bb270413a0632a63ca8a1be44bf
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过逆向分析CORE CrackMe v2.0，破解出用户名"KCTF"和序列号"A86CA89F 77F81C3C FD2620F0"，并验证成功。
> 
> - **脱壳方法：** 样本使用UPX 0.72压缩，需运行时脱壳，真实入口点为0x004047CB。
> - **校验逻辑：** 用户名反转后重复拼接，计算自定义MD5哈希，其padding长度与标准MD5不同，为(len(data)+1)*8。
> - **序列号格式：** 序列号通过sscanf解析为三个十六进制整数，例如"XXXXXXXX XXXXXXXX XXXXXXXX"。
> - **逆推过程：** 核心校验使用GF(2)上的线性变换，可通过高斯消元逆推序列号。
> - **求解脚本：** 提供Python脚本，输入用户名自动生成序列号并验证。

## 1\. 结论

用户名为：

```
KCTF
```

对应序列号为：

```
A86CA89F 77F81C3C FD2620F0
```

程序验证结果：弹出 `Welcome` 。

* * *

## 2\. 样本信息

样本：

```
CRACKME3.EXE
```

基础信息：

```
MD5        : 95681bb270413a0632a63ca8a1be44bf
ImageBase  : 00400000
EntryPoint : 00429000
```

节区特征：

```
UPX0
UPX1
UPX2
UPX3
```

说明样本被 UPX 压缩，版本字符串显示为：

```
UPX 0.72
```

新版 UPX 直接脱壳会失败：

```
CantUnpackException: this program is packed with an obsolete version
```

所以采用运行时脱壳。

* * *

## 3\. 脱壳过程

入口点：

```
00429000 pushad
...
00429197 popad
00429198 jmp 004047CB
```

真实 OEP：

```
004047CB
```

### x32dbg 复现步骤

1.  用 x32dbg 打开样本。
2.  跳转到：

```
00429198
```

```
Base : 00400000
Size : 00038000
```

保存为：

```
debug_dump_at_stub.bin
```

脱壳后 OEP 处代码：

```
004047CB push ebp
004047CC mov  ebp, esp
004047CE push -1
004047D0 push 004185B8
004047D5 push 00407924
```

* * *

## 4\. 界面资源分析

主对话框资源 ID：

```
102
```

标题：

```
CORE Official CrackMe v2.0 - Written by Egis/CORE
```

控件 ID：

```
1000 : 用户名输入框
1001 : 序列号输入框
1002 : OK 按钮
1003 : About 按钮
```

控件绑定代码：

```
00401D35 push 3E8h ; 1000
00401D47 push 3E9h ; 1001
00401D7A push 3EAh ; 1002
```

* * *

## 5\. CHECK_FN 定位

搜索 OK 按钮 ID `0x3EA` ，定位到消息映射表：

```
00422390 : 000003EA
00422394 : 000003EA
00422398 : 0000000C
0042239C : 004020A0
```

所以校验函数为：

```
CHECK_FN = 004020A0
```

本题是计算序列号，不需要补丁：

```
OFFSET/PATCH_BYTE = N/A
```

* * *

## 6\. 校验逻辑还原

### 6.1 输入读取

`004020A0` 中读取用户名和序列号：

```
0040212A call 00412706 ; 读取用户名
0040214C call 00412706 ; 读取序列号
```

之后调用字符串反转函数：

```
0040216F call 00408D70
```

`00408D70` 的作用是 `strrev` 。

对于用户名：

```
KCTF
```

反转后：

```
FTCK
```

程序最终参与 hash 的字符串为：

```
name + reverse(name) + reverse(name) + reverse(name)
```

因此：

```
KCTF + FTCK + FTCK + FTCK
```

得到：

```
KCTFFTCKFTCKFTCK
```

* * *

### 6.2 Hash 部分

`004014E0` 初始化 MD5 状态：

```
004014E4 mov [eax],     67452301h
004014F8 mov [eax + 4], EFCDAB89h
004014F1 mov [eax + 8], 98BADCFEh
004014EA mov [eax + C], 10325476h
```

`00401500` 是 MD5 compression。

但它不是标准 MD5，padding 长度字段有差异：

```
标准 MD5     : len(data) * 8
该 CrackMe : (len(data) + 1) * 8
```

对字符串：

```
KCTFFTCKFTCKFTCK
```

计算得到内部 digest：

```
BAB8150D 57308F2C AEA9D86B FADBC6C0
```

实际只比较前三个 dword：

```
BAB8150D
57308F2C
AEA9D86B
```

* * *

### 6.3 序列号格式

序列号由 `sscanf` 解析：

```
0040233B push 00422520 ; "%lx%lx%lx"
00402341 call 00404797
00402349 cmp  eax, 3
```

格式为：

```
%lx%lx%lx
```

所以序列号应为 3 个十六进制整数，例如：

```
XXXXXXXX XXXXXXXX XXXXXXXX
```

* * *

### 6.4 线性变换

核心线性变换函数：

```
00401AD0
```

使用 4 张表：

```
0041C2C0
0041C3C0
0041C4C0
0041C5C0
```

校验关系可抽象为：

```
L1(serial_1, serial_2) = digest_0, middle
L2(middle, serial_3)  = digest_1, digest_2
```

因此逆推流程：

```
1. 由 digest_1, digest_2 逆推出 middle, serial_3
2. 由 digest_0, middle   逆推出 serial_1, serial_2
```

因为 `00401AD0` 是 GF(2) 上的线性变换，所以可以用高斯消元求逆。

* * *

## 7\. 可复现求解脚本

要求当前目录存在脱壳 dump：

```
debug_dump_at_stub.bin
```

保存脚本为：

```
solve_crackme3.py
```

代码：

```python
import math
import struct
from pathlib import Path

BASE = 0x400000
mem = Path("debug_dump_at_stub.bin").read_bytes()

def u32(x):
    return x & 0xffffffff

def rol(x, n):
    x &= 0xffffffff
    return ((x << n) | (x >> (32 - n))) & 0xffffffff

def read_table(va, n=64):
    return list(struct.unpack_from(f"<{n}I", mem, va - BASE))

T1_A = read_table(0x41C2C0)
T1_B = read_table(0x41C3C0)
T2_A = read_table(0x41C4C0)
T2_B = read_table(0x41C5C0)

def md5_compress(block, st):
    X = list(struct.unpack("<16I", block))
    a, b, c, d = st

    T = [
        int(abs(math.sin(i + 1)) * (1 << 32)) & 0xffffffff
        for i in range(64)
    ]

    S = (
        [7, 12, 17, 22] * 4 +
        [5, 9, 14, 20] * 4 +
        [4, 11, 16, 23] * 4 +
        [6, 10, 15, 21] * 4
    )

    for i in range(64):
        if i < 16:
            f = (b & c) | (~b & d)
            g = i
        elif i < 32:
            f = (b & d) | (c & ~d)
            g = (5 * i + 1) & 15
        elif i < 48:
            f = b ^ c ^ d
            g = (3 * i + 5) & 15
        else:
            f = c ^ (b | ~d)
            g = (7 * i) & 15

        f = u32(f + a + T[i] + X[g])
        a, d, c, b = d, c, b, u32(b + rol(f, S[i]))

    return [
        u32(st[0] + a),
        u32(st[1] + b),
        u32(st[2] + c),
        u32(st[3] + d),
    ]

def crackme_md5_like(data: bytes):
    n = len(data)

    r = (n + 1) & 0x3f
    zero_pad = (-r) & 0x3f

    if zero_pad <= 7:
        zero_pad += 0x40

    total = n + 1 + zero_pad
    buf = bytearray(data + b"\x80" + b"\x00" * zero_pad)

    struct.pack_into("<I", buf, total - 8, (n + 1) * 8)

    st = [
        0x67452301,
        0xefcdab89,
        0x98badcfe,
        0x10325476,
    ]

    for off in range(0, total, 64):
        st = md5_compress(bytes(buf[off:off + 64]), st)

    return st

def popcnt32(x):
    return (x & 0xffffffff).bit_count()

def transform_pair(x0, x1, A, B):
    out = []

    for off in (0, 32):
        y = 0

        for i in range(32):
            bit = (
                popcnt32(x0 & A[off + i]) ^
                popcnt32(x1 & B[off + i])
            ) & 1

            y = ((y << 1) ^ bit) & 0xffffffff

        out.append(y)

    return out[0], out[1]

def invert_pair(y0, y1, A, B):
    cols = []

    for j in range(64):
        if j < 32:
            x0 = 1 << j
            x1 = 0
        else:
            x0 = 0
            x1 = 1 << (j - 32)

        o0, o1 = transform_pair(x0, x1, A, B)
        cols.append(o0 | (o1 << 32))

    target = y0 | (y1 << 32)
    rows = []

    for out_bit in range(64):
        row = 0

        for var in range(64):
            row |= ((cols[var] >> out_bit) & 1) << var

        rows.append([row, (target >> out_bit) & 1])

    r = 0
    pivots = []

    for col in range(64):
        pivot = None

        for i in range(r, 64):
            if (rows[i][0] >> col) & 1:
                pivot = i
                break

        if pivot is None:
            raise RuntimeError("matrix is not invertible")

        rows[r], rows[pivot] = rows[pivot], rows[r]

        for i in range(64):
            if i != r and ((rows[i][0] >> col) & 1):
                rows[i][0] ^= rows[r][0]
                rows[i][1] ^= rows[r][1]

        pivots.append(col)
        r += 1

    sol = 0

    for i, col in enumerate(pivots):
        sol |= rows[i][1] << col

    return sol & 0xffffffff, (sol >> 32) & 0xffffffff

def make_serial(name: str):
    nb = name.encode("ascii")
    rev = nb[::-1]

    msg = nb + rev + rev + rev
    h0, h1, h2, h3 = crackme_md5_like(msg)

    middle, s3 = invert_pair(h1, h2, T2_A, T2_B)
    s1, s2 = invert_pair(h0, middle, T1_A, T1_B)

    return msg, (h0, h1, h2, h3), (s1, s2, s3)

if __name__ == "__main__":
    msg, digest, serial = make_serial("KCTF")

    print("message:", msg.decode())
    print("digest :", " ".join(f"{x:08X}" for x in digest))
    print("serial :", " ".join(f"{x:08X}" for x in serial))
```

运行：

```
python solve_crackme3.py
```

输出：

```
message: KCTFFTCKFTCKFTCK
digest : BAB8150D 57308F2C AEA9D86B FADBC6C0
serial : A86CA89F 77F81C3C FD2620F0
```

* * *

## 8\. 验证过程

程序中输入：

```
Enter your name:
KCTF
```

```
Guess your registration code:
A86CA89F 77F81C3C FD2620F0
```

点击 OK 后弹窗标题为：

```
Welcome
```

因此最终答案确认：

```
A86CA89F 77F81C3C FD2620F0
```
