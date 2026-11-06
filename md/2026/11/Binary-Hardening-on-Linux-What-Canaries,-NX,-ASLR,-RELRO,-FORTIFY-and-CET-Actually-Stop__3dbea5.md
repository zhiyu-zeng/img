---
title: "Binary Hardening on Linux:  What Canaries, NX, ASLR, RELRO, FORTIFY and CET Actually Stop"
source: https://tranlynhathao.github.io/blog/2026/binary-hardening-mitigations/
source_host: tranlynhathao.github.io
clip_date: 2026-11-06T10:26:22+08:00
trace_id: d3f4f11e-35ac-4118-b75d-cf5a41059399
content_hash: 1e95988953c63e1d18b02ea0b8c0f08c4c920484e114afb86e7252eab52d198e
status: synced
tags:
  - Linux安全
  - 编译器保护
series: null
feed_source: Tran Ly Nhat Hao·Android RE
ai_summary: Linux 二进制加固各缓解（canary、NX、ASLR、RELRO、FORTIFY、CET）各自只封堵利用路径的一步，需分层组合，checksec 报告应读作威胁模型而非一排绿灯。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41075244-d011-81c7-8984-e6c3edcd6dc8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Linux 二进制加固各缓解（canary、NX、ASLR、RELRO、FORTIFY、CET）各自只封堵利用路径的一步，需分层组合，checksec 报告应读作威胁模型而非一排绿灯。
> 
> - **canary 止点：** -fstack-protector-strong 在返回地址前放入来自 fs:0x28（AT_RANDOM，末字节置零）的随机字，溢出必先跨过它，检测到即中止；但挡不住改写 canary 之前的局部变量、堆漏洞、跳过 canary 的任意写及格式化字符串泄漏，fork 服务器子进程继承同一 canary 可逐字节爆破。
> - **NX 与 ASLR/PIE：** NX（GNU_STACK 为 RW 而非 RWE）封杀数据区注入 shellcode，却催生 ROP/return-to-libc；ASLR 使 mmap 基址在 x86-64 上默认 28 位熵（vm.mmap_rnd_bits 可调至 32），非 PIE 的 EXEC 固定加载于 0x1000000，PIE 以 DYN 类型链接可被 loader 重定位；一次指针泄漏即可推算整个模块基址。
> - **RELRO 与 FORTIFY：** Full RELRO（-z relro -z now）启动时解析全部符号并 mprotect 整个 GOT，阻断 write-what-where 改写 GOT 函数指针（partial 仍留 .got.plt 可写）；FORTIFY 在 -O1+ 下将 strcpy 等改写为带尺寸参数的 _chk 变体、超长即 abort，level 2 拒绝可写格式串中的 %n，level 3 覆盖 malloc(n) 等运行期尺寸，但挡不住指针算术循环溢出。
> - **CET 部署陷阱：** 前向 IBT 要求间接跳转落在 endbr64，后向 shadow stack 校验 ret；需 Tiger Lake/Zen3+ 硬件、Linux 6.6+ 与 glibc 2.39+ 同时到位；链接器对所有输入 AND 属性注记，单个未标记的 crt 对象即静默关闭 CET，可用 -z cet-report=error 将其变成链接错误。
> - **实践要点：** 勿假设默认值，用 gcc -v、checksec、randomize_va_space 与 /proc/cpuinfo 的 user_shstk 验证产物；缓解提升利用成本但不减少 bug 数，测试构建应加 ASan/UBSan，新解析器尽量用内存安全语言编写。

Most of what runs on a Linux machine is still C and C++, and a memory-safety bug is still the most common way from "sends input" to "runs code". The mitigations in this post do not fix those bugs. Each removes one step from the classic path between a corrupted byte and a hijacked instruction pointer and leaves the others open, which is why they are layered rather than chosen. Knowing what each layer stops is what lets you read a `checksec` report as a threat model rather than a row of green words.

Where each mitigation lives in a hardened x86-64 Linux process 0xffff8000_00000000 0x00007ffd_xxxxxxxx 0x00007fxx_xxxxxxxx 0x000055xx_xxxxxxxx 0x00000000_00000000 high addresses at the top kernel half (SMEP/SMAP keep it out of reach) stack (rw-, grows down) canary in every protected frame mmap region libc.so, ld.so, other shared objects, \[vdso\] .text r-x /.data rw- / GOT r-- after RELRO anonymous mmaps and thread stacks too unmapped gap (random size) heap (rw-, brk, grows up) .bss /.data (rw-) .got /.got.plt (r-- once relocated) .rodata (r--) .text (r-x, never writable) unmapped low addresses Stack canary (-fstack-protector-strong) random word between locals and return address ASLR (kernel.randomize_va_space=2) mmap base, stack and brk get fresh offsets each run; 28 bits of mmap entropy on x86-64 by default NX / W^X (PT_GNU_STACK, no execstack) stack and heap are rw- but never --x Full RELRO (-Wl,-z,relro,-z,now) resolve all symbols at start, then mprotect the GOT PIE (-fPIE -pie) the executable itself is relocatable, so ASLR can move.text as well, not just the libraries FORTIFY and CET act on the code itself: \_chk calls that abort on overflow, endbr64 landing pads, a shadow stack for ret

Where each mitigation lives. Canaries guard stack frames, NX makes stack and heap non-executable, ASLR and PIE move every region, RELRO makes the GOT read-only, and FORTIFY and CET act on the code itself.

## One program, two builds

The sample is the smallest program that has a real vulnerability: a fixed buffer, an unbounded `strcpy`, and a `printf` of the result.

C

```c
#include <stdio.h>
#include <string.h>

void greet(const char *name) {
    char buf[64];
    strcpy(buf, name);              /* no bounds check: the classic bug */
    printf("hello, %s\n", buf);
}

int main(int argc, char **argv) {
    if (argc > 1)
        greet(argv[1]);
    return 0;
}
```

It was built twice, once with every protection deliberately switched off and once with the flags a hardened distribution uses:

Bash

```bash
# weakened on purpose: no canary, fixed load address, writable GOT, lazy binding, no FORTIFY
gcc -O2 -fno-stack-protector -no-pie -U_FORTIFY_SOURCE \
    -Wl,-z,norelro -Wl,-z,lazy -o greet-weak greet.c

# hardened
gcc -O2 -fstack-protector-strong -fPIE -pie -Wl,-z,relro,-z,now \
    -D_FORTIFY_SOURCE=2 -fstack-clash-protection -fcf-protection=full \
    -o greet-hardened greet.c
```

One note on provenance: the listings were produced on a Mac with a clang-based cross toolchain targeting x86-64 glibc (`zig cc -target x86_64-linux-gnu`). The ELF headers and dynamic sections match what gcc and GNU ld produce; the one place the generated code differs is called out below.

| Mitigation | `checksec` column | Where it shows up in `readelf` | greet-weak | greet-hardened |
| --- | --- | --- | --- | --- |
| Stack canary | Stack | `__stack_chk_fail` among the dynamic symbols | No canary found | Canary found |
| NX / non-exec stack | NX  | `GNU_STACK` segment flags `RW`, not `RWE` | NX enabled | NX enabled |
| PIE (enables ASLR) | PIE | ELF `Type: DYN` plus `FLAGS_1: PIE` | No PIE, loads at `0x1000000` | PIE enabled |
| RELRO | RELRO | `GNU_RELRO` segment; `FLAGS: BIND_NOW` for full | No RELRO | Full RELRO |
| FORTIFY_SOURCE | FORTIFY | `*_chk` imports such as `__strcpy_chk` | No  | Yes |
| CET (IBT, shadow stack) | not in classic checksec | `.note.gnu.property` with `x86 feature: IBT, SHSTK` | absent | absent, see the CET section for why |

## Stack canaries

A canary is a random machine word placed between a function's local buffers and its saved frame pointer and return address. The function prologue copies it from thread-local storage (`fs:0x28` on x86-64 glibc, filled at process start from the kernel's `AT_RANDOM` bytes, with the lowest byte zeroed so that string functions stop at it) and the epilogue checks it before `ret`. If an overflow ran through the buffer into the return address, it ran through the canary first.

Text

```text
$ objdump -d --no-show-raw-insn -M intel greet-hardened | sed -n '/<greet>:/,/^$/p'
00000000000015b0 <greet>:
    15b0:  endbr64
    15b4:  push   rbp
    15b5:  mov    rbp,rsp
    15b8:  push   rbx
    15b9:  sub    rsp,0x48
    15bd:  mov    rsi,rdi
    15c0:  mov    rax,QWORD PTR fs:0x28          ; load the canary
    15c9:  mov    QWORD PTR [rbp-0x10],rax       ; park it above the locals
    15cd:  lea    rbx,[rbp-0x50]
    15d1:  mov    edx,0x40                       ; sizeof buf, from FORTIFY
    15d6:  mov    rdi,rbx
    15d9:  call   17c0 <__strcpy_chk@plt>
    15de:  mov    rdx,rbx
    15e1:  xor    eax,eax
    15e3:  call   1610 <printf>                  ; fortified wrapper, see below
    15e8:  mov    rax,QWORD PTR fs:0x28
    15f1:  cmp    rax,QWORD PTR [rbp-0x10]       ; still the same word?
    15f5:  jne    15fe <greet+0x4e>
    15f7:  add    rsp,0x48
    15fb:  pop    rbx
    15fc:  pop    rbp
    15fd:  ret
    15fe:  call   17d0 <__stack_chk_fail@plt>    ; abort, never returns
```

The weakened build has none of this: `greet` calls `strcpy`, calls `printf`, and returns through whatever is on the stack. GCC emits the same check with a `sub` / `je` pair instead of `cmp` / `jne`; the behaviour is identical.

One stack frame, with and without a canary Frame of greet(): low addresses on the left, the overflow runs to the right char buf\[64\] strcpy writes from here → other locals still overwritable canary 8 bytes from fs:0x28 saved rbp return address what an attacker wants caller's frame a 100-byte string overwrites locals, the canary, saved rbp and the return address in that order Without a canary (-fno-stack-protector) 1\. strcpy runs past buf, nothing notices 2\. function epilogue: leave; ret 3\. ret pops the attacker's value into rip 4\. execution continues wherever that points: shellcode on the stack (if no NX), a ROP chain in libc (if no ASLR/PIE), or a crash if neither is possible The bug and the hijack are the same event. Everything after it depends on the other mitigations, which is why they are layered. With -fstack-protector-strong greet: mov rax, QWORD PTR fs:0x28; load canary mov QWORD PTR \[rbp-8\], rax; store below rbp ... strcpy(buf, input)... mov rdx, QWORD PTR \[rbp-8\] sub rdx, QWORD PTR fs:0x28; still equal? je.Lok call \__stack_chk_fail; abort, no ret .Lok: leave ret The corrupted frame is detected before ret uses it: the process dies with "\*\*\* stack smashing detected \*\*\*" instead of jumping to attacker data.

A linear overflow has to cross the canary to reach the return address. With the check in place the process aborts before ret uses the corrupted value.

`-fstack-protector` only instruments functions with character arrays of at least eight bytes; `-fstack-protector-strong` extends that to any local array and any function that takes the address of a local, which is the distribution default; `-fstack-protector-all` instruments everything at measurable cost. **What it stops:** a sequential overflow from a stack buffer into the return address. **What it does not stop:** overwriting other locals or function pointers that sit *between* the buffer and the canary, bugs on the heap, an arbitrary write that skips over the canary, and a format-string or out-of-bounds read that leaks the canary value first. In a forking server every child inherits the same canary, so it can be guessed one byte at a time. The canary is a tripwire, not a wall.

## NX: data is not code

Every mapping in a process carries read, write and execute permissions, and since the arrival of the NX bit on x86-64 the kernel enforces them in hardware. The linker records the intended stack permission in a `PT_GNU_STACK` program header, and the kernel maps the stack, heap and all anonymous memory without execute permission unless that header says otherwise.

Text

```text
$ readelf -lW greet-hardened | grep GNU_STACK
  GNU_STACK      0x000000 0x0000000000000000 0x0000000000000000 0x000000 0x1000000 RW  0
```

`RW` is what you want; `RWE` means an input object lacked the `.note.GNU-stack` marker (hand-written assembly is the usual culprit) and the linker fell back to an executable stack for the whole program. Both builds show `RW` because toolchains default to it. **What it stops:** the original shellcode-on-the-stack attack, and injecting code into any data region. **What it does not stop:** reusing code that is already executable. Return-to-libc and return-oriented programming exist precisely because NX made injected code useless, and a program that calls `mprotect` on attacker-controlled memory hands the protection back.

## ASLR and PIE

Code reuse needs addresses. ASLR makes the kernel place the stack, the heap and every `mmap` -ed library at a fresh random offset in each process; on x86-64 the mmap base alone carries 28 bits of entropy by default (`vm.mmap_rnd_bits`, raisable to 32), and `kernel.randomize_va_space = 2` randomises the `brk` heap too. The one region it cannot move is a classic `EXEC` binary, which is linked for a fixed address. A position-independent executable is linked as a shared object (`DYN`) and relocated wherever the loader puts it.

Text

```text
$ readelf -h greet-weak | grep Type
  Type:                              EXEC (Executable file)
$ readelf -h greet-hardened | grep Type
  Type:                              DYN (Position-Independent Executable file)
$ readelf -dW greet-hardened | grep FLAGS
 0x000000000000001e (FLAGS)              BIND_NOW
 0x000000006ffffffb (FLAGS_1)            Flags: NOW PIE
```

Every address in the weak binary's disassembly starts with `0x1000000`, and it will be there in every run; the hardened one is linked at offset zero and lands somewhere different each time. **What it stops:** hard-coding the address of `system`, of a ROP gadget, or of the GOT. **What it does not stop:** information leaks. Within a module the layout is fixed, so one leaked pointer (a stack address printed by a format string, an uninitialised field, a partial overwrite of the low bytes) reveals the base of the whole module. On 32-bit, or in a forking server that keeps the same layout across children, the entropy can simply be brute-forced.

## RELRO: a read-only GOT

Calls into shared libraries go through the Global Offset Table, an array of function pointers that the dynamic loader fills in. With lazy binding the entries are resolved on first call, so the table has to stay writable for the lifetime of the process, and an attacker with a single arbitrary write can replace `printf` 's slot with `system` and wait for the next call. Partial RELRO (`-z relro`, the default) makes `.init_array`, `.fini_array`, `.dynamic` and the non-PLT part of the GOT read-only after relocation but leaves `.got.plt` writable. Full RELRO adds `-z now`: resolve every symbol at startup, then `mprotect` the entire table.

Text

```text
$ readelf -lW greet-hardened | grep -E "GNU_RELRO"
  GNU_RELRO      0x0007f0 0x00000000000027f0 0x00000000000027f0 0x000188 0x000810 R   0x1
$ readelf -SW greet-hardened | grep -E "\.got"
  [17] .got              PROGBITS        0000000000002940 000940 000008 00  WA  0   0  8
  [18] .got.plt          PROGBITS        0000000000002948 000948 000030 00  WA  0   0  8
$ readelf -lW greet-weak | grep -c GNU_RELRO
0
```

The `GNU_RELRO` segment runs from `0x27f0` for `0x810` bytes, to `0x3000`, which covers both `.got` and `.got.plt`: after `ld.so` finishes, there is no writable function pointer left in the loader's tables. **What it stops:** GOT overwrites, the most convenient target for a write-what-where primitive. **What it does not stop:** every other writable pointer in the process, including C++ vtables, callback fields in heap objects, and `.data` tables the program itself keeps. It also slows startup for large programs, which is why some distributions enable it selectively.

## FORTIFY_SOURCE

FORTIFY is a glibc feature enabled by `-D_FORTIFY_SOURCE=n` at `-O1` or above. Where the compiler can prove a destination's size with `__builtin_object_size`, calls to `strcpy`, `memcpy`, `sprintf`, `read` and dozens of other functions are rewritten to `_chk` variants that take the size as an extra argument and abort on overflow. Level 2 adds checks that can change the behaviour of odd but conforming programs, such as refusing `%n` in a writable format string. Level 3 (GCC 12 or clang, with glibc 2.34 or later) uses `__builtin_dynamic_object_size` to cover sizes only known at run time, including `malloc(n)`.

Text

```text
$ readelf --dyn-syms -W greet-hardened | grep _chk
     2: 0000000000000000     0 FUNC    GLOBAL DEFAULT  UND __strcpy_chk@GLIBC_2.3.4 (3)
     3: 0000000000000000     0 FUNC    GLOBAL DEFAULT  UND __stack_chk_fail@GLIBC_2.4 (4)
     4: 0000000000000000     0 FUNC    GLOBAL DEFAULT  UND __vprintf_chk@GLIBC_2.3.4 (3)
$ readelf --dyn-syms -W greet-weak | grep -c _chk
0
```

In the disassembly earlier the `mov edx,0x40` before `__strcpy_chk` is the 64-byte size of `buf`; a longer argument aborts with `*** buffer overflow detected ***` before the canary is even consulted. The `printf` call became an inlined wrapper around `__vprintf_chk` because that is how clang expands glibc's fortified header; GCC emits a direct `__printf_chk` instead. **What it stops:** overflows through the standard library when the destination size is statically or dynamically knowable, and the `%n` write primitive in format-string bugs. **What it does not stop:** overflows done with pointer arithmetic and loops, library calls where the size is unknowable, and anything outside libc.

## Control-flow integrity and shadow stacks

Everything so far leaves one gap: if an attacker obtains a corrupted return address or function pointer without tripping a canary, nothing checks where control goes. Control-flow integrity closes it in two halves. On the *forward edge*, Intel's Indirect Branch Tracking (IBT) requires every indirect branch to land on an `endbr64` instruction, which is why `greet` above begins with one; `-fcf-protection=branch` emits the landing pads, and clang's `-fsanitize=cfi` goes further by checking at link time, with LTO, that each indirect call targets a function of the matching type. On the *backward edge*, a shadow stack (Intel SHSTK, `-fcf-protection=return`) makes the CPU push every return address to a second, hardware-protected stack and fault on `ret` if the two copies disagree. Linux gained user-space shadow stacks in 6.6, and glibc enables them when the hardware, the kernel and every loaded object agree.

That last condition is where deployments fail, and this build is an example. The compiler marked each object with a `.note.gnu.property` saying "IBT and SHSTK safe", but the linker ANDs those bits across *all* inputs, and the C runtime objects of this cross toolchain were not built with `-fcf-protection`. Result: no property note in the final binary, and no CET even on a capable CPU.

Text

```text
$ readelf -nW greet-hardened | grep -A1 "x86 feature"
$ # nothing: one unmarked input object silently disables CET for the whole program
```

On a distribution whose toolchain and glibc were built with CET, the same command prints `Properties: x86 feature: IBT, SHSTK`; GNU ld's `-z cet-report=error` turns the silent downgrade into a link failure. On arm64 the equivalents are pointer authentication and BTI, enabled together with `-mbranch-protection=standard`. **What it stops:** return-oriented programming (shadow stack) and jumping into the middle of functions (IBT). **What it does not stop:** calling a legitimate, correctly typed function with attacker-chosen arguments, overwriting data that decides *whether* a privileged path runs, and any bug whose payoff needs no control-flow hijack at all. Enforcement also needs a CPU that has it (Intel Tiger Lake and AMD Zen 3 onward) plus a kernel and libc that enable it.

## Flags per mitigation

| Mitigation | Compiler flag | Linker flag | Needs at run time | Typical distribution default |
| --- | --- | --- | --- | --- |
| Stack canary | `-fstack-protector-strong` | none | glibc `__stack_chk_fail`, TLS guard | on  |
| Stack clash guard | `-fstack-clash-protection` | none | guard page below the stack | on in most |
| NX stack | none | `-Wl,-z,noexecstack` | CPU NX bit, kernel | on unless an object lacks the note |
| PIE | `-fPIE` | `-pie` | `kernel.randomize_va_space = 2` | on  |
| Partial RELRO | none | `-Wl,-z,relro` | `ld.so` | on  |
| Full RELRO | none | `-Wl,-z,relro,-z,now` | `ld.so` | varies by distribution and package |
| FORTIFY_SOURCE | `-D_FORTIFY_SOURCE=2` or `3`, with `-O1` + | none | glibc `_chk` functions | on, level 2 or 3 |
| CET IBT and SHSTK | `-fcf-protection=full` | `-Wl,-z,cet-report=error` to verify | CPU, Linux 6.6+, glibc 2.39+, all objects marked | compiled in; enforced only with the hardware |
| Clang type-based CFI | `-fsanitize=cfi -flto -fvisibility=hidden` | `-flto` | none | off outside Android and Chrome |
| arm64 PAC and BTI | `-mbranch-protection=standard` | none | ARMv8.3 and ARMv8.5 CPU, kernel | on for arm64 |

> ##### TIP
> 
> Do not assume the defaults; ask the compiler. `gcc -v 2>&1 | grep -o -- '--enable-default-[a-z]*'` shows whether PIE and the stack protector are on by default, and `echo | gcc -O2 -dM -E - | grep FORTIFY` whether the distribution injects `_FORTIFY_SOURCE`. Then verify the artefact rather than the flags with `checksec --file=./binary` or Debian's `hardening-check`, confirm that `cat /proc/sys/kernel/randomize_va_space` prints `2`, and look for `user_shstk` in `/proc/cpuinfo` to learn whether a shadow stack is even possible on the machine.

Full checksec and program-header output for both builds

Text

```text
$ checksec --file=greet-weak
    Arch:       amd64-64-little
    RELRO:      No RELRO
    Stack:      No canary found
    NX:         NX enabled
    PIE:        No PIE (0x1000000)
    Stripped:   No
    Debuginfo:  Yes

$ checksec --file=greet-hardened
    Arch:       amd64-64-little
    RELRO:      Full RELRO
    Stack:      Canary found
    NX:         NX enabled
    PIE:        PIE enabled
    Stripped:   No
    Debuginfo:  Yes

$ readelf -lW greet-hardened
Program Headers:
  Type           Offset   VirtAddr           PhysAddr           FileSiz  MemSiz   Flg Align
  PHDR           0x000040 0x0000000000000040 0x0000000000000040 0x000230 0x000230 R   0x8
  INTERP         0x000270 0x0000000000000270 0x0000000000000270 0x00001c 0x00001c R   0x1
      [Requesting program interpreter: /lib64/ld-linux-x86-64.so.2]
  LOAD           0x000000 0x0000000000000000 0x0000000000000000 0x000574 0x000574 R   0x1000
  LOAD           0x000580 0x0000000000001580 0x0000000000001580 0x000270 0x000270 R E 0x1000
  LOAD           0x0007f0 0x00000000000027f0 0x00000000000027f0 0x000188 0x000810 RW  0x1000
  DYNAMIC        0x0007f0 0x00000000000027f0 0x00000000000027f0 0x000150 0x000150 RW  0x8
  GNU_RELRO      0x0007f0 0x00000000000027f0 0x00000000000027f0 0x000188 0x000810 R   0x1
  GNU_EH_FRAME   0x00049c 0x000000000000049c 0x000000000000049c 0x00002c 0x00002c R   0x4
  GNU_STACK      0x000000 0x0000000000000000 0x0000000000000000 0x000000 0x1000000 RW  0
  NOTE           0x00028c 0x000000000000028c 0x000000000000028c 0x000020 0x000020 R   0x4
```

The three `LOAD` segments are the whole W^X story in one place: read-only headers and `.rodata`, read-execute `.text`, read-write data, and no segment that is both writable and executable. The `GNU_RELRO` segment overlaps the start of the read-write one and is what `ld.so` re-protects to read-only once relocation is done.

> ##### WARNING
> 
> Mitigations raise the cost of exploitation; they do not lower the number of bugs. A program with every row green still has the `strcpy` in it, and a good information leak plus an arbitrary write walks through most of these layers in a real target. Treat the table as the floor for anything that parses untrusted input, keep the sanitizers (`-fsanitize=address,undefined`) in test builds, and write the next parser in a memory-safe language if you can.

## Further reading

-   GCC, [Program Instrumentation Options](https://gcc.gnu.org/onlinedocs/gcc/Instrumentation-Options.html), the reference for `-fstack-protector-*`, `-fstack-clash-protection` and `-fcf-protection`, and [Code Generation Options](https://gcc.gnu.org/onlinedocs/gcc/Code-Gen-Options.html) for `-fPIE`.
-   GNU binutils, [ld command-line options](https://sourceware.org/binutils/docs/ld/Options.html), including every `-z` keyword used above.
-   The GNU C Library manual, [Fortification of function calls](https://www.gnu.org/software/libc/manual/html_node/Source-Fortification.html), and Red Hat, [How to improve application security using FORTIFY_SOURCE=3](https://developers.redhat.com/articles/2023/02/06/how-improve-application-security-using-fortifysource3).
-   Linux kernel, [sysctl documentation for `randomize_va_space`](https://docs.kernel.org/admin-guide/sysctl/kernel.html) and [Control-flow Enforcement Technology (CET) Shadow Stack](https://docs.kernel.org/arch/x86/shstk.html).
-   Intel, [A Technical Look at Intel's Control-flow Enforcement Technology](https://www.intel.com/content/www/us/en/developer/articles/technical/technical-look-control-flow-enforcement-technology.html), and Clang, [Control Flow Integrity](https://clang.llvm.org/docs/ControlFlowIntegrity.html).
-   OpenSSF, [Compiler Options Hardening Guide for C and C++](https://best.openssf.org/Compiler-Hardening-Guides/Compiler-Options-Hardening-Guide-for-C-and-C++), the current recommended flag set with rationale per option.
-   PaX Team, [Address Space Layout Randomization](https://pax.grsecurity.net/docs/aslr.txt), the 2001 design document that the kernel implementation follows, and the Debian wiki's [Hardening](https://wiki.debian.org/Hardening) page on which flags a distribution turns on and why.
-   [checksec](https://github.com/slimm609/checksec), the shell script; the output above is from the `pwntools` reimplementation, which prints the same columns.
