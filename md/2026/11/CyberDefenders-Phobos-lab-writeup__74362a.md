---
title: CyberDefenders Phobos lab writeup
source: https://zx41r.dev/posts/phobos/
source_host: zx41r.dev
clip_date: 2026-11-02T10:47:23+08:00
trace_id: 44849040-0184-46bc-a1a7-730b5d89ab21
content_hash: 705f4fe5915b749209ff88dedb741488da07b4b286806edc80b60df9a90c4350
status: synced
tags:
  - 恶意样本
  - Windows逆向
series: null
feed_source: zx41r·恶意软件/逆向
ai_summary: TL;DR：通过定位 AES 配置解密函数并动态断点，逐项还原 Phobos 勒索软件的自校验、版本伪装、杀进程、持久化与新磁盘加密等核心行为。
ai_summary_style: key-points
images_status:
  total: 17
  succeeded: 17
  failed_urls: []
notion_page_id: 40c75244-d011-8170-a094-c16cf5639395
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：通过定位 AES 配置解密函数并动态断点，逐项还原 Phobos 勒索软件的自校验、版本伪装、杀进程、持久化与新磁盘加密等核心行为。
> 
> - **自校验机制：** 样本用表驱动 CRC32（多项式 0xEDB88320，查表位于 0x40B000）校验存放加密配置的 .cdata 段，硬编码校验值 0xD55F8833，不一致直接退出，防篡改。
> - **配置解密技巧：** 无需逆向 AES——断点在 sub_406347 读 [esp+4] 获取索引，返回处 0x00406431 读 EAX 即得明文；版本字符串索引 0x33 解出 "[<<ID>>-2822] v2.9.1"，2822 疑为附属团伙/构建号。
> - **伪装与初始行为：** 版本信息伪装成 ole32.dll；入口先检查提权，未提权则通过首个 API 调用 CreateProcessW 重启自身。
> - **对抗与持久化：** 线程 sub_4022EE 在 0x004022FB 调用配置索引 10 取 kill list（覆盖 SQL、Oracle、Office、邮件、备份进程），每 500ms 轮询防重启；随后用 netsh 命令关防火墙（新旧系统语法各一条）；持久化函数 sub_401236 复制自身并设隐藏属性，写入 HKLM/HKCU 的 Run 键双保险。
> - **加密行为：** C2 基于 WinHTTP 导入判定为 HTTP；线程 sub_401CC5 每 1000ms 用 GetLogicalDrives 位掩码差集检测新挂载盘并即时加密；文件大小阈值 0x180000（1572864 字节，1.5MB），以下全量加密、以上仅加密部分数据块以提速。

## Overview

|     |     |
| :--- | :--- |
| **Platform** | CyberDefenders |
| **Category** | Malware Analysis |
| **Difficulty** | Insane |
| **Focus** | AES config, CRC32 self-check, persistence, process killing |
| **Lab Link** | [Phobos](https://cyberdefenders.org/blueteam-ctf-challenges/phobos/) |

Phobos has been around since late 2018 and gets sold to lots of affiliates, so samples show up everywhere. The interesting part of this one is the config: every string the malware cares about (version, kill list, shell commands) sits in one AES-encrypted blob and gets decrypted by index when it’s needed. Find that function, break on it, and a lot of the questions below are just reading `EAX`.

Tools: IDA Pro, x32dbg, DIE.

## Q1: hashing algorithm

> What is the hashing algorithm used by the malware?

`sub_4085D9`:

```c
int __usercall sub_4085D9@<eax>(int a1@<eax>, _BYTE *a2@<ecx>, int a3)
{
  unsigned int v3; // eax
  v3 = ~a1;
  while ( a3 )
  {
    --a3;
    v3 = lookup_table[(unsigned __int8)(v3 ^ *a2++)] ^ (v3 >> 8);
  }
  return ~v3;
}
```

Invert the seed, index a 256-entry table (at 0x40B000) with the low byte XOR the input, shift right by 8, invert at the end. That’s table-driven CRC32. To be sure, compare the table with the standard one for polynomial 0xEDB88320, which starts `00000000 77073096 EE0E612C`.

![CRC32 Hash Function](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dae3aae1b279cb33.png)

CRC32 with its lookup table

**Answer:** `CRC32`

## Q2:.cdata checksum

> Could you provide the hard-coded value of the.cdata checksum?

Xrefs to the CRC function lead to this early in startup:

```c
if ( CRC32_hash(0, v0, dword_40B40C) != dword_40B430 )
    return;
```

It hashes its own `.cdata` section, where the encrypted config lives, and quits if the result doesn’t match the stored value. Patch anything in there and it just exits.

```plaintext
.data:0040B430 dword_40B430    dd 0D55F8833h    ; DATA XREF: real_Start+62↑r
```

**Answer:** `0xD55F8833`

## Q3: version

> What is the malware’s version?

Two functions handle the config:

| Function | Address | Does |
| --- | --- | --- |
| `sub_4062A6` | 0x004062A6 | sets up the config struct |
| `sub_406347` | 0x00406347 | decrypts one entry by index |

No need to reverse the AES setup. Break on `sub_406347` and read the index at `[esp+4]`, break on its return at 0x00406431 and read `EAX`. Every config string goes through there.

![Config Decrypt Breakpoint](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3b8cdc08fcd4a533.png)

Breakpoint on the config decrypt function

![Stack Config Index](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/24c8b7ff730d51c5.png)

Index 0x33 (51) on the stack

Index 0x33 comes back as the version string:

![Version String in EAX](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ed67e6b354d49cb1.png)

EAX: "\[< \>-2822\] v2.9.1"

```plaintext
[<<ID>>-2822] v2.9.1
```

`<<ID>>` gets replaced with the victim ID at runtime, and `2822` is most likely the affiliate/build number. The version is the last part.

**Answer:** `v2.9.1`

## Q4: masqueraded DLL

> The malware masquerades as a legitimate Windows DLL. Which DLL does it impersonate?

DIE, version info resource:

![Suspicious DLL Name](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/985732030b5e2759.png)

Version info claims ole32.dll

The version info says it’s `ole32.dll`. It’s a plain EXE, so the name is just there so it looks harmless to someone skimming file properties or a process list.

**Answer:** `ole32.dll`

## Q5: first API call

> Could you provide the first API function that is called by the malware?

From the entry point `sub_402FA7` into the main routine `sub_4029F5`. The first thing it does is check whether it’s running elevated. If not, it calls `sub_40489E`, which relaunches itself:

```c
BOOL sub_40489E()
{
  // ...
  StartupInfo.cb = 68;
  v5 = CreateProcessW(0, v0, 0, 0, 0, 0, 0, 0, &StartupInfo, &ProcessInformation);
  // ...
}
```

![CreateProcessW Function](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/397fc22fb91fd523.png)

CreateProcessW at 0x0040490E inside sub_40489E

![Restart Caller](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/62c025df4f3be020.png)

sub_40489E called from sub_4029F5 at 0x00402C74

```plaintext
sub_402FA7 (entry)
  -> sub_4029F5 (main)
     -> elevated? no
        -> sub_40489E (relaunch)
           -> CreateProcessW
```

**Answer:** `CreateProcessW`

## Q6: process list decryption call

> Could you provide the address at which the process list decryption function is called?

Ransomware kills database, mail and Office processes first so their files aren’t locked when it encrypts. That happens in `sub_4022EE`, which runs as its own thread:

```c
int __stdcall sub_4022EE(LPVOID lpThreadParameter)
{
  v5 = (__int16 *)sub_406347(10, 0);   // config index 10: kill list
  // ...
  while ( !sub_405962() )
  {
    sub_404DEE(lpMem);                  // kill whatever matches
    Sleep(0x1F4u);
  }
}
```

It asks the config function for index 10:

```plaintext
.text:004022F9  push    0Ah
.text:004022FB  call    sub_406347
```

The return value is the kill list:

![Process List Decrypted](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/433a280450640af4.png)

msftesql.exe, sqlagent.exe, sqlbrowser.exe...

| Group | Processes |
| --- | --- |
| SQL | msftesql, sqlagent, sqlservr, mysql |
| Oracle | oracle, ocssd, dbsnmp |
| Office | excel, outlook, powerpnt, onenote |
| Mail | thunderbird, thebat |
| Backup | sqbcoreservice |

It re-checks every 500 ms, so restarting the database doesn’t help.

**Answer:** `0x004022FB`

## Q7: first security command

> What’s the first command the malware uses to turn off a critical security measure?

Same breakpoint on the config function, keep running and watch `EAX`. One entry comes back as a little batch script:

![Firewall Disable Command](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/556c98fd9e0ebb44.png)

Firewall disable commands in EAX

```plaintext
netsh advfirewall set currentprofile state off
netsh firewall set opmode mode=disable
exit
```

The first line is the Vista+ syntax, the second is the old XP one, so it covers both.

**Answer:** `netsh advfirewall set currentprofile state off`

## Q8: persistence function

> Could you provide the address of the function used by the malware for persistence?

Xrefs to `RegSetValueExW`:

![RegSetValueExW Xref](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ecfa4bcb3df0e5e7.png)

Xrefs to RegSetValueExW

That’s `sub_403A93`, a registry write wrapper. Its caller is `sub_401236`:

![WriteRegistry Xref](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bfa5fe52e516e62a.png)

sub_403A93 called from sub_401236

![Persistence Function](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/84607a49faaa6b0f.png)

sub_401236 writing the Run keys

`sub_401236` copies the binary somewhere new, marks the copy hidden (attribute 0x2), and points both Run keys at it:

| Key | Needs admin |
| --- | --- |
| `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` | yes |
| `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` | no  |

If it isn’t elevated the HKLM write fails and HKCU still works.

**Answer:** `0x00401236`

## Q9: C2 protocol

> What protocol is used by the malware for C2 communication?

The imports answer this:

![WinHTTP Imports](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c9becdeec4db07fc.png)

WinHttpOpen, WinHttpConnect, WinHttpSendRequest...

`WinHttpOpen`, `WinHttpConnect`, `WinHttpOpenRequest`, `WinHttpSendRequest`, `WinHttpReceiveResponse`. WinHTTP, so HTTP.

**Answer:** `HTTP`

## Q10: drive watcher thread

> Could you provide the address of the thread used to check continuously for new disk connections?

Main spawns several threads:

![Thread Creation](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/64867ccf0fb8adaa.png)

Threads spawned from main, including sub_401CC5

`sub_401CC5` is the one polling drives:

![Drive Monitor Thread](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e203bf43db7872b2.png)

GetLogicalDrives loop

```c
while ( !sub_405962() )
{
    v3 = GetLogicalDrives();
    if ( v3 != LogicalDrives )
    {
        v4 = v3 & ~LogicalDrives;     // bits that just appeared
        // ... encrypt the new drives
    }
    Sleep(0x3E8u);                    // 1000 ms
}
```

`GetLogicalDrives` returns a bitmask, bit 0 is A:, bit 2 is C:. `new & ~old` leaves only the drives that just showed up. Plug in a USB stick or map a share while it’s running and it gets hit within a second.

**Answer:** `0x00401CC5`

## Q11: file size threshold

> The file size is compared to a specific value. Could you provide this value?

Xrefs to `GetFileSizeEx` lead to `sub_408EBE`:

![GetFileSizeEx Xref](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1b0db298e8c79a2a.png)

GetFileSizeEx called from sub_408EBE

![File Size Comparison](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a208f00deb0c71c9.png)

v10.QuadPart < 0x180000

```c
v7 = (a5 & 1) != 0 || v10.QuadPart < 0x180000uLL
   ? sub_408782(...)    // whole file
   : sub_408C42(...);   // partial
```

0x180000 = 1572864 bytes = 1.5 MB. Smaller files get encrypted whole. Bigger ones only get parts encrypted, which is much faster, and a database with chunks of it encrypted is just as broken.

**Answer:** `1572864`

## Answers

| Q   | Answer |
| --- | --- |
| 1   | `CRC32` |
| 2   | `0xD55F8833` |
| 3   | `v2.9.1` |
| 4   | `ole32.dll` |
| 5   | `CreateProcessW` |
| 6   | `0x004022FB` |
| 7   | `netsh advfirewall set currentprofile state off` |
| 8   | `0x00401236` |
| 9   | `HTTP` |
| 10  | `0x00401CC5` |
| 11  | `1572864` |
