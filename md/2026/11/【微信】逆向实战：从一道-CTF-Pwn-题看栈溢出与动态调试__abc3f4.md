---
title: 【微信】逆向实战：从一道 CTF Pwn 题看栈溢出与动态调试
source: https://mp.weixin.qq.com/s/w4ISWeFGm67QCFqiPTKwAg
source_host: mp.weixin.qq.com
clip_date: 2026-11-03T01:06:04+08:00
trace_id: de0ddb18-c6e5-4c93-aa96-0c8aa78e70c0
content_hash: ffe21302a6e7cbac830a549018895d430b0a0c51c43d4b0d97a82b8331de5d8e
status: synced
tags:
  - 微信
  - CTF
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 用一道 CTF Pwn 题演示栈溢出漏洞的完整流程：静态定位漏洞点、gdb 动调确认覆盖偏移、ROP 构造利用链，并理解各防护机制为何挡住攻击。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40c75244-d011-81cc-baeb-e232739d4de1
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 用一道 CTF Pwn 题演示栈溢出漏洞的完整流程：静态定位漏洞点、gdb 动调确认覆盖偏移、ROP 构造利用链，并理解各防护机制为何挡住攻击。
> 
> - **静态定位：** 先用 checksec 查 Canary/NX/PIE/RELRO，再在 IDA 中看伪代码，锁定“用户可控输入写入固定大小缓冲区”（如 `read(0, buf, 0x100)` 写入更小的栈缓冲区）或格式化参数来自用户（`printf(user_input)`）的位置。
> - **动态验证：** 静态判断必须动调确认——在 gdb 中对漏洞函数下断点，用 `x/20xw $rsp` 观察栈内容，把“理论上能写这么多字节”变成“返回地址在第 N 字节被覆盖”的实测结论，偏移不准利用脚本就写不对。
> - **利用思路（教学）：** NX 开启下无法直接执行 shellcode，需走 ROP：先通过格式化字符串或 GOT 泄露 libc 基址（PIE 下还需泄露代码段基址），再用程序内 gadgets 拼出调用 `system("/bin/sh")` 的链。
> - **防护对照：** Canary 检测栈溢出、NX/DEP 禁止数据段执行、ASLR/PIE 地址随机化、FORTIFY 编译期检查危险函数——真实漏洞“看着能溢出却打不进去”往往因防护全开，加固方向正是全部启用。
> - **CTF 与实战差异：** CTF 把漏洞摆在明处，练“在已知有洞的程序里写出利用”；真实逆向要“在正常程序里先认出洞”，但读保护、看伪代码、动调跟栈、理解调用约定等底层能力完全通用。

**船山信安** *2026年11月3日 00:00*

底层手艺 · BINARY

逆向实战：从一道 CTF Pwn 题看栈溢出与动态调试

逆向不是炫技，是把「黑盒二进制」读回「逻辑」。用一道 CTF 题讲清楚栈溢出怎么定位、动态调试怎么跟。

内容偏教学，所有环境为本地练习程序，不涉及任何真实在运营系统。

本文为二进制安全教学，基于本地 CTF 练习程序；不提供针对真实软件的利用，仅讲原理与调试方法。

0101 静态：先用 IDA 看伪代码

拿到二进制先查保护：checksec 看有没有 Canary、NX、PIE、RELRO。再丢进 IDA 看 main 的伪代码，找「用户可控输入写到固定大小缓冲区」的地方。

\# 查看二进制保护机制

checksec --file=./challenge

\# 常见输出：Canary=yes NX=yes PIE=yes

0202 漏洞点：栈溢出与格式化

题目常把 read(0, buf, 0x100) 写进一个远小于 0x100 的栈缓冲区，这就是经典栈溢出。另一种是把用户输入直接送进 printf(user_input)，造成格式化字符串泄露。

静态看到「输入长度不受限」或「格式化参数来自用户」时，基本就能定位漏洞函数。教学题往往把这两类放在一起，逼你先认得、再组合。

0303 动态：gdb 动调跟一遍

静态判断要用动态验证。用 gdb 在漏洞函数下断点，观察输入写到了哪、返回地址被覆盖了多少字节。

\# 在 main / vuln 下断点，观察栈

gdb./challenge

break vuln

run

x/20xw $rsp # 看栈上内容

动调的价值：把「理论上能写这么多字节」变成「实际看到返回地址在第 N 字节被覆盖」。差这一个确认，利用脚本就写不对。

0404 利用思路（教学）：从溢出到控制流

在开启 NX 的环境下，直接塞 shellcode 跑不了，要走 ROP：用程序里已有的代码片段（gadgets）拼出「调用系统函数」的链。这是教学核心，不是真实攻击。

1泄露 libc 基址（通过格式化字符串或 GOT 泄露）。

2用 ROP gadget 调 system("/bin/sh")。

3PIE 下还需先泄露代码段基址。

0505 防护：为什么这些措施存在

|     |     |
| --- | --- |
| 防护  | 挡住什么 |
| Canary |     |
| NX/DEP | 数据段不可执行 |
| ASLR/PIE | 地址随机化，难定位 |
| FORTIFY | 编译期检查危险函数 |

理解这些防护，才知道真实漏洞为什么「看着能溢出却打不进去」——而加固的方向，正是把它们都打开。

0606 从 CTF 到真实：差异在哪

CTF 把漏洞「摆得很清楚」，真实软件里你要先自己找。但底层能力通用：读保护、看伪代码、动调跟栈、理解调用约定——这些在真实二进制审计里一样用得上。

CTF 练的是「在已知有洞的程序里把利用写出来」；真实逆向练的是「在一堆正常程序里先把洞认出来」。前者是后者的基本功。

参考来源

CTF-Wiki — Stack Overflow / Format String

《程序员的自我修养》— 链接、装载与库

checksec 工具说明（pwntools）

本文为二进制安全教学，基于本地 CTF 练习程序讲解栈溢出与动态调试原理，不提供针对真实软件的利用。

CTF · 目录
