---
title: 【看雪】TencentPediyKeygenMe2.exe 逆向分析解题报告
source: https://bbs.kanxue.com/thread-292123.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-22T21:16:31+08:00
trace_id: 07114632-3bd7-4d01-bca6-58659c6cda3b
content_hash: 2a5b24499c93c6e6d99d410fcc5aa520bb9b74855fbc9af28b3a31de81e128fd
status: summarized
tags:
  - 看雪
  - CTF
  - Windows逆向
series: null
feed_source: 看雪·逆向工程
ai_summary: 通过对TencentPediyKeygenMe2.exe的逆向分析，揭示其序列号验证基于椭圆曲线数字签名（ECDSA），并成功为用户名"KCTF"生成有效注册码。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3a575244-d011-8197-95b4-dd527ca5dc7a
ioc:
  cves: []
  cwes: []
  hashes:
    - 0000000000000001120baa4576344e44
    - 88b071f0935c7474b2859976197f1465
    - f163b1f14b39b98f8a0dabf300104e7843d83ab55e8085862382faba1db8fe32
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过对TencentPediyKeygenMe2.exe的逆向分析，揭示其序列号验证基于椭圆曲线数字签名（ECDSA），并成功为用户名"KCTF"生成有效注册码。
> 
> - **序列号格式：** 必须为35字符，采用8-8-8-8格式，使用自定义Base32字符集ABCDEFGHJKMNPQRSTVWXYZ1234567890。
> - **验证核心：** 采用ECDSA算法，私钥硬编码为"Tencent"的十六进制值0x54656E63656E7420，公钥参数包括n和rho。
> - **计算流程：** 用户名经SHA1哈希取前8字节作为z，结合私钥d和固定r=1计算签名s，再经块变换和编码生成最终序列号。
> - **成功结果：** 用户名"KCTF"对应序列号DQF030H7-7X8P0YMA-WHZNQEGF-CFEVXVTA，输入后验证成功。

## 1\. 最终答案

用户名：

```
KCTF
```

序列号：

```
DQF030H7-7X8P0YMA-WHZNQEGF-CFEVXVTA
```

本地验证结果：输入后点击 `Verify` ，弹出：

```
Success!
Congratulations!
You will be the keygen machine!
```

* * *

## 2\. 样本信息

文件：

```
TencentPediyKeygenMe2.exe
```

PE 信息：

```
MD5     : 88b071f0935c7474b2859976197f1465
SHA256  : f163b1f14b39b98f8a0dabf300104e7843d83ab55e8085862382faba1db8fe32
ImageBase : 00400000
EntryPoint: 0043BF2F
```

节区：

```
.text   VA 00401000
.rdata  VA 00454000
.data   VA 00468000
.rsrc   VA 0046F000
```

导入表中有：

```
DialogBoxParamA
GetDlgItem
SendMessageA
MessageBoxA
EndDialog
```

并且字符串中存在大量 Crypto++ 符号：

```
CryptoPP
ECDSA
ECP
SHA1
DL_Verifier
```

说明验证核心确实是椭圆曲线签名验证。

* * *

## 3\. 界面资源分析

主对话框资源 ID：

```
101
```

标题初始为：

```
KeygenMe
```

运行后窗口标题被设置为：

```
#KeygenMe#
```

控件：

```
ID 1    : Verify 按钮
ID 1002 : User Name 输入框
ID 1003 : License Code 输入框
```

关键代码：

```
0040816C push 65h
0040816F call dword ptr [45411C] ; DialogBoxParamA
```

这里 `0x65 = 101` ，即创建资源 ID 101 的对话框。

对话框回调函数：

```
00408210
```

点击 `Verify` 后进入：

```
CHECK_FN = 00408270
```

* * *

## 4\. 序列号格式

在 `00408270` 中：

```
004083D1 push 0Dh
004083D3 push ecx
004083D4 call esi ; SendMessageA，读取用户名

0040842A push 0Dh
0040842C push eax
0040842D call esi ; SendMessageA，读取注册码
0040842F cmp eax, 23h
```

注册码长度必须是：

```
0x23 = 35
```

注册码格式为：

```
8-8-8-8
```

中间 3 个 `-` 的位置由表控制：

```
0046A3F8 : 08 11 1A
```

也就是第 8、17、26 个字符必须是 `-` 。

有效字符表：

```
004579A8 : ABCDEFGHJKMNPQRSTVWXYZ1234567890
```

所以序列号使用自定义 Base32 字符集：

```
ABCDEFGHJKMNPQRSTVWXYZ1234567890
```

* * *

## 5\. 验证流程还原

整体流程：

```
License 35 chars
    ↓ 去掉 3 个 '-'
32 chars
    ↓ 自定义 Base32 解码
20 bytes
    ↓ 16 bytes 数据块 + 4 bytes 校验块
    ↓ Security@Tencent 相关块变换
    ↓ GF(2^8) 逆变换，模多项式 0x11B
    ↓ DEADBEEF 相关 Blowfish/块变换
16-byte 签名块
    ↓ checksum 校验
ECDSA VerifyMessage(username, signature)
```

关键函数：

```
0044490B0 : 自定义 Base32 解码
00408060 : 以 "Security@Tencent" 为 key 的块变换
004486D0 : GF(2^8) 字节逆变换，模多项式 0x11B
00407FD0 : 以 "DEADBEEF" 为 key 的块变换
00403210 : 椭圆曲线签名验证
0041DD80 : Crypto++ VerifyMessage
```

成功路径：

```
004085AA test al, al
004085AC je   004085C5
004085B4 push 0046A3B8 ; "Success!"
004085B9 push 0046A3C4 ; "Congratulations! ..."
004085BF call MessageBoxA
```

* * *

## 6\. 椭圆曲线部分

样本使用小参数椭圆曲线，私钥实际硬编码在数据区：

```
0046A54C : 54 65 6E 63 65 6E 74 20
```

ASCII 为：

```
Tencent
```

作为整数：

```
d = 0x54656E63656E7420
```

关键参数：

```toml
n   = 0xC564EEF19A080B07
rho = 0x6CBF49B72611C49A
r   = 0x0000000000000001
```

用户名参与 SHA1：

```
z = SHA1(username)[:8]
```

对于：

```
KCTF
```

有：

```
SHA1(KCTF)[:8] = 0x0C5E14D370BD9A84
```

签名计算：

```
s = rho^-1 * (z + d * r) mod n
```

代入：

```
s = 0x120BAA4576344E44
```

所以 16 字节签名块为：

```
r || s
```

即：

```
0000000000000001120BAA4576344E44
```

* * *

## 7\. ECC 部分可复现脚本

```python
import hashlib

name = b"KCTF"

n   = 0xC564EEF19A080B07
rho = 0x6CBF49B72611C49A
d   = 0x54656E63656E7420
r   = 1

z = int.from_bytes(hashlib.sha1(name).digest()[:8], "big")
s = (pow(rho, -1, n) * (z + d * r)) % n

sig = r.to_bytes(8, "big") + s.to_bytes(8, "big")

print("z   =", f"{z:016X}")
print("r   =", f"{r:016X}")
print("s   =", f"{s:016X}")
print("sig =", sig.hex().upper())
```

输出：

```toml
z   = 0C5E14D370BD9A84
r   = 0000000000000001
s   = 120BAA4576344E44
sig = 0000000000000001120BAA4576344E44
```

* * *

## 8\. 校验块

程序对 16 字节签名块按 little-endian dword 分组后异或：

```python
import struct

sig = bytes.fromhex("0000000000000001120BAA4576344E44")
a, b, c, d = struct.unpack("<4I", sig)

checksum = a ^ b ^ c ^ d

print(hex(checksum))
print(checksum.to_bytes(4, "little").hex())
```

结果：

```
checksum = 0x00E43F64
bytes    = 643FE400
```

* * *

## 9\. 最终编码结果

将：

```
sig      = 0000000000000001120BAA4576344E44
checksum = 643FE400
```

按程序的逆向编码链处理：

```
DEADBEEF 块变换逆过程
GF(2^8) 字节逆变换
Security@Tencent 块变换逆过程
自定义 Base32 编码
按 8-8-8-8 插入 '-'
```

得到最终注册码：

```
DQF030H7-7X8P0YMA-WHZNQEGF-CFEVXVTA
```

* * *

## 10\. 本地验证

输入：

```
User Name:
KCTF
```

```
License Code:
DQF030H7-7X8P0YMA-WHZNQEGF-CFEVXVTA
```

点击：

```
Verify
```

结果弹窗：

```
Success!
Congratulations!
You will be the keygen machine!
```

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#问题讨论](https://bbs.kanxue.com/forum-4-1-197.htm)
