---
title: Playing with canaries - elttam
source: https://www.elttam.com/blog/playing-with-canaries
source_host: www.elttam.com
clip_date: 2026-09-18T10:50:48+08:00
trace_id: f719c1fe-6545-4f7f-9db5-ea6770e86779
content_hash: 6d6293182de9e48c0f39eebc9523bc8b4b7451493285bf727298da3e238101a9
status: synced
tags:
  - 编译器保护
  - 漏洞分析
series: null
feed_source: elttam
ai_summary: 栈保护 canary 由内核随机数经 AT_RANDOM 传给 glibc，只在新 execve 时生成，fork 继承导致可爆破；多数架构可被信息泄露读取。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3df75244-d011-8150-9ebd-ee78ab393d09
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 栈保护 canary 由内核随机数经 AT_RANDOM 传给 glibc，只在新 execve 时生成，fork 继承导致可爆破；多数架构可被信息泄露读取。
> 
> - **生成链路：** execve 时内核 `get_random_bytes` 生成 16 字节，经 Auxiliary Vector `AT_RANDOM` 暴露；glibc 的 `_dl_random` 指向它，拷贝进 `__stack_chk_guard` 并清零一个字节；`dl_random` 为空时才是终止字符 canary。
> - **fork 缺陷：** canary 仅在 execve 时更新，fork 子进程继承父进程值，可被穷举；x86 可用 `gs/fs` 段读写替换 canary，RenewSSP 借此在 fork 后换值。
> - **架构差异：** i386 用 `gs:0x14`，x86_64 用 `fs:0x28`；ARM/MIPS/PowerPC 通过 GOT/BSS 或硬编码偏移访问 `__stack_chk_guard`，PIE 下依赖可预测布局，可能引出 offset2lib。
> - **检测与泄露：** ELF 含 `__stack_chk_fail@plt` 即可能有 canary；`LD_SHOW_AUXV=1` 或 `/proc/pid/auxv` 可泄露 `AT_RANDOM`，配合 `process_vm_readv`、`/proc/self/mem+lseek` 可读出 canary。
> - **内核 canary：** 每进程 `stack_canary` 在启动时由 `boot_init_stack_canary` 用 `get_random_bytes` 初始化；x86 叠加 `rdtsc`，ARM/MIPS 异或 `LINUX_VERSION_CODE`；fork 时用 `get_random_int` 重生成。

## Introduction

In this post, we will talk about the canaries, which is part of “ *Smash Stack Protector* ” (SSP) mechanism built in GCC (along with most other modern compilers). This article aims to describe canaries, and summarize the different implementations of SSP on different architectures. Developers enforcing SSP should be aware of these implementations when building code that aims to be built on different architectures (for example, embedded software in IoT devices). We will dig deep into the libC and the kernel to understand fundamentally all the components of the canary.

### Setup

The following architectures were tested in VMs (thanks to QEMU):

-   i386
-   x86-64
-   ARMv6
-   MIPS
-   PowerPC

All using the same setup:

-   Debian Wheezy, Linux kernel 4.x
-   gcc 6.3
-   glibc 2.19

All the links to source code are provided within this article, and all the code excerpts can be found on [elttam’s GitHub](https://github.com/elttam/canary-fun). The disassembled snippets are run against compiled versions of files on the GitHub, which you can compile to reproduce, with:

```bash
$ gcc -fstack-protector -O1 -o <my_file> <my_file>.c
```

### History

The stack protection mechanism appeared in response to the wide-spread stack buffer overflow vulnerabilities, which started attracting a lot of attention after the [famous Phrack article by AlephOne](http://www.phrack.org/issues/49/14.html#article) in 1996.

Starting 2000, Hiroaki Etoh (from IBM) suggested first the idea of [modifying GCC compilation process](https://gcc.gnu.org/ml/gcc/2000-08/msg00183.html) to integrate a low overhead mechanism to protect against stack overflows. This gave birth to “StackGuard”, the GCC Stack-Smashing protection still in use today. As early as 2000, several implementations were tested, and consequently [have](http://phrack.org/issues/56/5.html) [been](http://insecure.org/sploits/non-executable.stack.problems.html) [attacked](http://staff.ustc.edu.cn/~bjhua/courses/security/2014/readings/stackguard-bypass.pdf).

However, by constantly improving it, GCC implemented the “StackGuard” protection, thoroughly described in [the GCC Summit paper (2003)](https://gcc.gnu.org/pub/gcc/summit/2003/Stackguard.pdf).

### Background

The goal for SSP is to provide the program a way to detect if the stack has been corrupted to the point where it can allow to redirect the code flow and allow arbitrary code execution. To protect it, a random value will be inserted at the base of stack of a function context like this:

```plaintext
   |           |             higher addresses
   |           |         |
   +-----------+         |
   | Saved PC  |         |
   +-----------+         |
   | Saved FP  |         |  Stack grows towards
   +-----------+         |  lower addresses
   | Canary    |         |
   ------------+         |
   | Var1      |         |
   | Var2      |         |
   | ...       |         v
                            lower addresses
```

In this example above, if `Var2` boundaries are not properly checked (for example when using `strcpy()` type of functions) and attempts to overwrite the return address, it will corrupt the canary, which the program will detect and force a premature (but safe) exit to further memory corruption, and ultimately code execution. As we can observe, one of the immediate weakness is that it will not avoid the corruption of the variables of the current context (here `Var1`). However, compilers can rearrange the setup of the variables to prevent that.

The SSP is enabled at two levels:

-   1 - during compilation, the compiler will insert a canary check stub. The following options are supported by any recent compiler:
    -   `-fstack-protector` (since GCC 4.1): includes a canary when a function defines an array of `char` with a size of 8 bytes or more
    -   `-fstack-protector-all`: adds a canary for **all** non-inline functions
    -   `-fstack-protector-strong` (since 4.9): provides a smarter way to protect any sensitive location within the current context (the best description can be found on [Kees Cook blog](https://outflux.net/blog/archives/2014/01/27/fstack-protector-strong))
-   2 - the protection takes effect when the binary is loaded by the loader (`ld`).

The original paper defines 3 possible canary types:

-   random generation
-   random + xor generation (most frequently used)
-   terminator canary: it uses a fixed value with many termination characters (for example 0xff0a0d00). Although noticeable for its pretty bad-a\*\* name, this canary type is only used when the above types cannot be provided.

<img src=”https://github.com/elttam/canary-fun/blob/master”/assets/images/terminator_canary.png?raw=true” width=”100%”>

In practice, it is possible to check the presence of a canary within the ELF thanks to the presence of `__libc_chk_fail@plt` symbol, which is the PLT entry for the procedure invoked should the canary be tampered with. Some tools (like [`checksec.sh`](http://www.trapkit.de/tools/checksec.html) or [`pwntools`](https://github.com/Gallopsled/pwntools)) can also be used.

```bash
$ readelf -s  /bin/ls | grep __stack_chk_fail
  34: 0000000000000000     0 FUNC    GLOBAL DEFAULT  UND __stack_chk_fail@GLIBC_2.4 (6)
```

To be secure, the canary must ensure at least the following properties:

1.  not predictable (must be generated from a source with good entropy)
2.  be located in a non-accessible location
3.  cannot be brute-forced
4.  should always contain at least one termination character

Let’s examine that!

### Breaking down the canary

#### GlibC analysis

The GlibC manipulates the canary through a global variable called `__stack_chk_guard`. By reading the source code of `glibc-2.24`, one can apprehend quite fast when the userland canary\* is being setup. The canary is generated by the loader, through the following calls:

\* **Note**: the reason I specified “userland canary” is because the Linux kernel uses another (and different) canary to protect against stack overflow within the kernel. However, for simplicity, canary will always refer to userland canary for now. We will cover the kernel-land canary later in this article.

```c
/* Set up the stack checker's canary.  */
uintptr_t stack_chk_guard = _dl_setup_stack_chk_guard (_dl_random);
[...]
__stack_chk_guard = stack_chk_guard;
```

[Source](https://github.com/elttam/canary-fun/tree/master/glibc-2.24/csu/libc-start.c#L198-L204)

```c
static inline uintptr_t __attribute__ ((always_inline))
_dl_setup_stack_chk_guard (void *dl_random)
{
  union
  {
    uintptr_t num;
    unsigned char bytes[sizeof (uintptr_t)];
  } ret = { 0 };

  if (dl_random == NULL)
    {
      ret.bytes[sizeof (ret) - 1] = 255;
      ret.bytes[sizeof (ret) - 2] = '\n';
    }
  else
    {
      memcpy (ret.bytes, dl_random, sizeof (ret));
#if BYTE_ORDER == LITTLE_ENDIAN

      ret.num &= ~(uintptr_t) 0xff;
#elif BYTE_ORDER == BIG_ENDIAN

      ret.num &= ~((uintptr_t) 0xff << (8 * (sizeof (ret) - 1)));
#else

#error 'BYTE_ORDER unknown'

#endif

    }
  return ret.num;
}
```

[Source](https://github.com/elttam/canary-fun/tree/master/glibc-2.24/sysdeps/generic/dl-osinfo.h#L23)

We can observe that the function `_dl_setup_stack_chk_guard()` allows to create all the canary types mentioned earlier: if `dl_random` is null, then the `__stack_chk_guard` will be a “terminator canary”, otherwise “random canary”.

In practice, on recent Glibc, `dl_random` is never null (we will understand why later on), and so the canary is only a (mem-)copy of it, with its least significant byte being nullified.

```c
      ret.num &= ~(uintptr_t) 0xff;
```

This operation is done to force the termination of a C-string, and make it harder for attackers to overwrite. But on the other hand, this also diminishes all the possible values for the canary, which can only have 2^((sizeof(register)-1)\*8) different values.

The canary is roughly a (mem)copy of [`_dl_random`](https://github.com/elttam/canary-fun/tree/master/glibc-2.24/elf/dl-support.c#L125), which according to a vague description, is populated by the kernel. Let’s see how it’s done:

```c
_dl_aux_init (ElfW(auxv_t) *av
[...]
   case AT_RANDOM:
	_dl_random = (void *) av->a_un.a_val;
```

[Source](https://github.com/elttam/canary-fun/tree/master/glibc-2.24/elf/dl-support.c#L290)

`_dl_aux_init()` is called by [`LIBC_START_MAIN()`](https://github.com/elttam/canary-fun/tree/master/glibc-2.24/csu/libc-start.c#L161), itself called by [`_start`](https://github.com/elttam/canary-fun/blob/master/glibc-2.24/sysdeps/generic/entry.h#L5), which is the ELF entrypoint in userland from the kernel, as defined by the SystemV R4 ABI (see \[the x86 *64 ABI\](https://refspecs.linuxbase.org/elf/x86_64-abi-0.21.pdf), page 25 and onward). `_dl_aux_init()` is the function in charge of handling in userland the values passed from the kernel, through the “\_Auxiliary Vector* ”.

#### Auxiliary Vector

An [Auxiliary Vector](https://refspecs.linuxfoundation.org/LSB_1.3.0/IA64/spec/auxiliaryvector.html) is an ELF structure that aims to provide information from the kernel to the application. Note that this structure must be present but can be empty. If not empty, then it will provide information basically in the form of an associative array, whose keys can be found in the [manpage of `getauxval()`](http://man7.org/linux/man-pages/man3/getauxval.3.html). Among other valuable information we find:

```plaintext
    AT_RANDOM
              The address of sixteen bytes containing a random value.
```

`AT_RANDOM` value can be found in the libC:

```c
#define AT_RANDOM	25		/* Address of 16 random bytes.  */
```

[Source](https://github.com/elttam/canary-fun/tree/master/glibc-2.24/elf/elf.h#L1154)

The Auxiliary Vector can be dumped directly from the terminal by invoking the target binary and setting the environment variable `LD_SHOW_AUXV`:

```bash
$ LD_SHOW_AUXV=1 /bin/ls | grep AT_RANDOM:
AT_RANDOM:       0x7ffd90856039
```

The same information is exposed through the `procfs` structure (`/proc/<pid>/auxv`):

```bash
$ od -t d8 /proc/self/auxv | grep 25
0000360                   25      140722461399193
```

**Note**: Some hardened kernels/systems will not expose this information.

Using the [`greetz.c`](https://github.com/elttam/canary-fun/tree/master/greetz.c) test file compiled with `-fstack-protector`, we can also use GDB to confirm this.

```
gef➤  capstone-disassemble greetz
0x0000000000400680      push    rbp
0x0000000000400681      mov     rbp, rsp
0x0000000000400684      sub     rsp, 0x80
0x000000000040068b      mov     rax, qword ptr fs:[0x28]
0x0000000000400694      mov     qword ptr [rbp - 8], rax
gef➤  # at 0x0400694, rax holds the value of the canary, set a breakpoint there
gef➤  bp *0x400694
gef➤  g 'hello elttam!'
<hits the breakpoint>
gef➤  info auxv
[...]
25   AT_RANDOM         Address of 16 random bytes     0x7fffffffe5b9
gef➤  xinfo 0x7fffffffe5b9
───────────────────[ xinfo: 0x7fffffffe5b9  ]───────────────────────
Found 0x00007fffffffe5b9
Page: 0x00007ffffffde000  →  0x00007ffffffff000 (size=0x21000)
Permissions: rw-
Pathname: [stack]
Offset (from page): +0x205b9
Inode: 0
gef➤  x/1gx 0x7fffffffe5b9
0x7fffffffe5b9: 0xd3ace4be4a314753
gef➤  run 'hello elttam!'
gef➤  info registers rax
rax            0xd3ace4be4a314700       -3193926529772861696
```

Bingo, we have a perfect match: `rax` contains the value of the 8 first bytes of the AUXV AT_RANDOM! This information is useful, because now we have an easy way to determine the canaries for any process.

The file [`read_canary_from_pid.c`](https://github.com/elttam/canary-fun/tree/master/read_canary_from_pid.c) provides a Proof-of-Concept for this attack:

```bash
$ cat &
[1] 30513
$ ./read_canary_from_pid 30513
[+] reading auxv of pid=30513
[+] pid=30513, path=/proc/30513/auxv
[+] reading 16 bytes from pid=30513 from address 0x7ffc03fd2b99
[+] got 16 bytes
[+] 69 dd d2 ef 86 4e b8 e5 b8 5f 58 6f de 91 69 d6
[+] canary for PID=30513 is 0xe5b84e86efd2dd00
```

**Quick note**: this code will work universally on all recent Linux for all architectures as long as it supports the syscall [`process_vm_readv`](https://linux.die.net/man/2/process_vm_readv) and exposes their Auxiliary Vector. [A Python version](https://github.com/elttam/canary-fun/blob/master/read_canary_from_pid.py) is also provided, that solely relies on `procfs` information.

<img src=”https://github.com/elttam/canary-fun/blob/master”/assets/images/canary-dump.png?raw=true” width=”100%”>

This means that if a process allows to read arbitrary files (such as a Directory Traversal vulnerability on a Web server), it is possible to retrieve the canary this way, if you can seek through the file descriptor. For example, if targeting an HTTP server, the leak would look something like:

1.  dump `/proc/self/auxv` to get the AT_RANDOM location
2.  read `/proc/self/mem` and force an `lseek` access to reach the location found above via the HTTP header `Range` (for instance `Range: bytes=<0xAT_RANDOM_ADDRESS>-<0xAT_RANDOM_ADDRESS+16>`)
3.  Truncate the received buffer to `sizeof(register)`
4.  Nullify the last byte (`data &= 0xff`)
5.  **You’ve now found the canary** without ever accessing the `__stack_chk_guard` location in memory!

That’s pretty cool, but back to our business. Right now, what we really want to know is how the canary gets populated. So far, we only know where the canary gets its value from, but we do not know how the 16-byte (or 128-bit) location pointed by the Auxiliary Vector `AT_RANDOM` gets filled.

<img src=”https://github.com/elttam/canary-fun/blob/master”/assets/images/deeper.jpg?raw=true” width=”100%”>

#### Kernel side

The creation of a new process goes way beyond the purpose of this article, so we will simply cover the part that interests us. Note that there are [plenty](https://0xax.gitbooks.io/linux-insides/content/SysCall/syscall-4.html) of [excellent](http://www.cs.stevens.edu/~jschauma/810/lecture05.pdf) [resources](http://eli.thegreenplace.net/2012/08/13/how-statically-linked-programs-run-on-linux) covering this topic.

When `sys_execve` is called, the kernel will prepare the new process. If the executable is an [ELF](http://www.skyfree.org/linux/references/ELF_Format.pdf), it will call [`load_elf_binary()`](https://github.com/torvalds/linux/blob/v4.9/fs/binfmt_elf.c#L668), that will in turn call [`create_elf_tables()`](https://github.com/torvalds/linux/blob/v4.9/fs/binfmt_elf.c#L1048-L1049).

It is this function that will populate with random data the 16-byte buffer `k_rand_bytes`, and expose it to the user.

```c
    elf_addr_t __user *u_rand_bytes;
    unsigned char k_rand_bytes[16];
[...]
    /*
     * Generate 16 random bytes for userspace PRNG seeding.
     */
    get_random_bytes(k_rand_bytes, sizeof(k_rand_bytes));
    u_rand_bytes = (elf_addr_t __user *) STACK_ALLOC(p, sizeof(k_rand_bytes));
    if (__copy_to_user(u_rand_bytes, k_rand_bytes, sizeof(k_rand_bytes)))
        return -EFAULT;
[...]
```

[Source](https://github.com/torvalds/linux/blob/v4.9/fs/binfmt_elf.c#L207-L214)

And finally, it will create the Auxiliary Vector entry for `AT_RANDOM`:

```c
    NEW_AUX_ENT(AT_RANDOM, (elf_addr_t)(unsigned long)u_rand_bytes);
```

[Source](https://github.com/torvalds/linux/blob/v4.9/fs/binfmt_elf.c#L248)

Finally, we know exactly how the canary gets its value, which we can summarize here:

1.  it is generated by the Linux kernel during the `sys_execve`, using the function [`void get_random_bytes(void *buf, int nbytes)`](https://github.com/torvalds/linux/blob/v4.9/drivers/char/random.c#L1495),
2.  exposed to userland via the Auxiliary Vector `AT_RANDOM`,
3.  `_dl_random` global is pointing to this location,
4.  and finally, `memcopy` -ed into `__stack_chk_guard`.

There, done!

Unfortunately for us, that does not leave us a big room for attacking its randomness. Although evaluating/attacking the random generation from this function [has been done in the past](https://www.blackhat.com/docs/eu-14/materials/eu-14-Kedmi-Attacking-The-Linux-PRNG-On-Android-Weaknesses-In-Seeding-Of-Entropic-Pools-And-Low-Boot-Time-Entropy-wp.pdf), we will not cover it as part of this article. This function is at the core of every (if not all) cryptographic mechanism in Linux (cryptographic key generation, TCP sequencing, BlueTooth pairing exchange, Linux kernel canary, etc.), and even though this source of randomness is not perfect, it is considered very secure.

It is actually such a good source of entropy that developers could also rely on it for initializing user-land random generator `srand` for non-forking processes.

The following C snippet could be used to that extent:

```c
#include <sys/auxv.h>

#include <stdlib.h>

#include <time.h>


void initialize_pnrg()
{
    unsigned long addr, seed;
    addr = getauxval(AT_RANDOM);
    // the 1st sizeof(void*) is used for the canary, we can use the 2nd

    addr+= sizeof(void*);
    seed = *((unsigned long*)addr);
    // optionally we can also xor the seed with the current time

    seed ^= time(0);
    srand(seed);
}
```

This would actually be better than the traditional (and vulnerable) call:

```c
srand(time(0));
```

which is still used [way too much](https://github.com/search?q=srand%28time%280%29%29%3B&type=Code&utf8=%E2%9C%93)

<img src=”https://github.com/elttam/canary-fun/blob/master”/assets/images/github-search.png?raw=true” width=”100%”>

But there is a design flaw here: as we saw, the canary value is being set via the `LIBC_START_MAIN` function. This means that the value is only generated when a new ELF is being executed and mapped in memory (via `sys_execve` syscall). But a regular fork will result in the child process systematically inheriting its canary from its parent. This weakness makes the canary inherently vulnerable to brute-force attacks ([CTF players](http://rootfoo.org/ctf/2016-legitbs-ctf-quals-feedme) [are very familiar](https://blahcat.github.io/2016/06/13/armpwn-challenge/#leaking-the-canary) [with such attack](https://leonjza.github.io/blog/2014/09/18/from-persistence/#wopr-stack-canary-bruteforce)).

## Architecture specificities

Now that we know where the canary’s value comes from, let’s spend some time trying to analyse how the canary is used at the assembly level as directed by the compiler (here GCC-6.3.0), for several architectures, starting naturally with Intel.

### Intel x86

GCC implementation of the canary for Intel architectures will rely on the selector `gs` as as quick `grep` (or even better, [`rg`](https://github.com/BurntSushi/ripgrep)) will tell:

```bash
$ rg -t cpp __stack_chk_guard gcc-6.3.0/gcc/config/i386
gcc-6.3.0/gcc/config/i386/gnu-user.h
133:/* i386 glibc provides __stack_chk_guard in %gs:0x14.  */

gcc-6.3.0/gcc/config/i386/gnu-user64.h
82:/* i386 glibc provides __stack_chk_guard in %gs:0x14,
83:   x32 glibc provides it in %fs:0x18.
64:   x86_64 glibc provides it in %fs:0x28.  */
```

#### i386

i386 family uses [segmentation](http://duartes.org/gustavo/blog/post/memory-translation-and-segmentation/) to translate virtual address in protected mode to physical address. Several 16-bit selectors exist to make this mechanism possible, and the most commonly known are Code Selector (CS), Data Selector (DS), Stack Selector (SS). Two additional selectors exist, FS and GS, without specific purpose. GS is usually used to store [TLS](https://gcc.gnu.org/onlinedocs/gcc-3.4.1/gcc/Thread-Local.html) information. GCC uses this segment register to save the canary at the offset GS:0x14. If no TLS, its location is pointed by the symbol `__stack_chk_guard`.

If we apply it to the binary `greetz`, the canary is copied in the current context right after the function prologue:

```
$ gdb -q -ex 'x/4i greetz -ex quit ./greetz-x32
   0x8048530 <greetz>:  push   esi
   0x8048531 <greetz+1>:        sub    esp,0x58
   0x8048534 <greetz+4>:        mov    eax,DWORD PTR [esp+0x60]
   0x8048538 <greetz+8>:        mov    ecx,DWORD PTR gs:0x14      // reads the canary from gs:0x14
   0x804853f <greetz+15>:       mov    DWORD PTR [esp+0x54],ecx   // copy it into the stack
```

And the epilogue will be in charge of checking if the canary has been modified:

```
$ gdb -ex 'x/7i greetz+93' -ex quit ./greetz-x32
   0x804858d <greetz+93>:       mov    eax,gs:0x14                // eax=gs:0x14
   0x8048593 <greetz+99>:       cmp    eax,DWORD PTR [esp+0x54]   // if eax!=stack_canary, call __stack_chk_fail()
   0x8048597 <greetz+103>:      jne    0x804859e <greetz+110>
   0x8048599 <greetz+105>:      add    esp,0x58
   0x804859c <greetz+108>:      pop    esi
   0x804859d <greetz+109>:      ret
   0x804859e <greetz+110>:      call   0x80483b0 <__stack_chk_fail@plt>
```

#### x86_64

As seen by grep-ing GCC earlier, x86_64 will use FS instead of GS as a selector with an offset of 0x18. This implementation choice is interesting since x86_64 has a flat-memory model, and GS, FS are only offsetting registers. However, it is used because of the following property:

Every segment register has a “visible” part and a “hidden” part. When a segment selector is loaded into the visible part of a segment register, the processor also loads the hidden part of the segment register with the base address, segment limit, and access control information from the segment descriptor pointed to by the segment selector. The information cached in the segment register (visible and hidden) allows the processor to translate addresses without taking extra bus cycles to read the base address and limit from the segment descriptor.

Source: [Intel® 64 and IA-32 Architectures, Sect 3.4.3 - Segment registers](http://www.intel.com/content/www/us/en/architecture-and-technology/64-ia-32-architectures-software-developer-manual-325462.html)

Using FS allows to have the canary in the current memory layout without having a potential attacker allowed to directly reach the address.

#### Hacking the SSP

On Intel, the canary is stored in a readable and writable location. By inserting a simple C stub, such as

```c
int read_canary()
{
  int val = 0;
  __asm__('movl %%gs:0x14, %0;'
          : '=r'(val)
          :
          :);
  return val;
}
```

it becomes possible to read the canary’s value from inside the current process ([`read_canary.c` is here](https://github.com/elttam/canary-fun/tree/master/read_canary.c)):

```bash
$ cc -o read_canary -fstack-protector read_canary.c
$ ./read_canary foooo
Found canary: 0xa4edbff95aece200
Hello foooo
```

Using the same `movl` instruction and swaping the arguments also allows to re-write it. By combining those two mechanisms (reading and writing), one can replace a forked process’ canary with an arbitrary one directly during the runtime of the process. This means that x86 developers can protect their code against brute-force attacks on the SSP with a very simple stub, and minimal performance impact.

To prove it, the file [`greetz-renew-canary.c`](https://github.com/elttam/canary-fun/tree/master/greetz-renew-canary.c) was written as a Proof-of-Concept, where it will replace the child process’ canary with a dummy value (in this case 0x4142434445464748). This code runs similarly on 32 and 64 bits.

```bash
$ gcc -m64 -o greetz-renew-canary-x64 -fstack-protector greetz-renew-canary.c
$ ./greetz-renew-canary-x64 elttam
Parent is 17698
[17698] Found canary: 0xca78e2c816dd8000
[17698] Hello elttam
Child is 17699
[17699] Found canary: 0x4142434445464748
[17699] Hello elttam
```

As we can see, through a quite simple hack, we have protected our forked process against brute-force attack! A good seed for the new canary would be to re-use another chunk of the buffer randomly generated (provided by `AT_RANDOM`).

Other implementations such as [RenewSSP](https://renewssp.com/) provides a ready-to-use library to force the canary renewal upon forking. Similarly, this library uses this “hack” to update the canary values on forked process, and works only for x86. The very nature of this hack will never allow it to be merged upstream.

### ARM

Now that canaries on Intel architecture have no secret for us, let’s move on to other architectures and implementations.

The location of the SSP can be found under symbol `__stack_chk_guard`, and the failure procedure (`__stack_chk_fail`) by its PLT location.

```bash
gef> p/x &__stack_chk_guard
$1 = 0x10930
gef> p/x &__stack_chk_fail
$2 = 0xb6f73ea0
```

Let’s compile `greetz.c` on an ARMv6l (RaspberryPi-like) with `-fstack-protector`, and disassemble the (vulnerable) `greetz()` function. It will look something like this:

```dockerfile
gef> disass greetz
   0x000085b4 <+0>:     push    {r4, lr}
   0x000085b8 <+4>:     sub     sp, sp, #72     ; 0x48
   0x000085bc <+8>:     mov     r1, r0
   0x000085c0 <+12>:    ldr     r4, [pc, #60]   ; 0x8604 <greetz+80>
   0x000085c4 <+16>:    ldr     r3, [r4]
   0x000085c8 <+20>:    str     r3, [sp, #68]   ; 0x44
   0x000085cc <+24>:    add     r0, sp, #4
   0x000085d0 <+28>:    bl      0x84b4
   0x000085d4 <+32>:    bl      0x84d8
   0x000085d8 <+36>:    mov     r1, r0
   0x000085dc <+40>:    ldr     r0, [pc, #36]   ; 0x8608 <greetz+84>
   0x000085e0 <+44>:    add     r2, sp, #4
   0x000085e4 <+48>:    bl      0x8484
   0x000085e8 <+52>:    ldr     r2, [sp, #68]   ; 0x44
   0x000085ec <+56>:    ldr     r3, [r4]
   0x000085f0 <+60>:    cmp     r2, r3
   0x000085f4 <+64>:    beq     0x85fc <greetz+72>
   0x000085f8 <+68>:    bl      0x849c
   0x000085fc <+72>:    add     sp, sp, #72     ; 0x48
   0x00008600 <+76>:    pop     {r4, pc}
   0x00008604 <+80>:    andeq   r0, r1, r0, lsr r9
   0x00008608 <+84>:    andeq   r8, r0, r8, lsl #15
```

At 0x000085c0, the binary loads the canary, and stores it into the stack at 0x000085c8. A careful reader would have seen those weird `andeq` instruction after the return (`pop pc`). The first address (at 0x00008604 `greetz+80`) corresponds to the address where the canary location is hardcoded by the compiler. But because it is within the `.text` segment, GDB assumes it is code and disassemble it as code, where it is really an address.

```
gef> x/x greetz1+80
0x8604 <greetz1+80>:    0x00010930
gef> x/x 0x00010930
0x10930 <__stack_chk_guard@@GLIBC_2.4>: 0x2ca3bb00
gef> xinfo 0x10930
----------------------------------[ xinfo: 0x10930 ]----------------------------------
Found 0x00010930
Page: 0x00010000 -> 0x00011000 (size=0x1000)
Permissions: rw-
Pathname: /home/pi/greetz
Offset (from page): +0x930
Inode: 20568
Segment: .bss (0x00010930-0x00010938)
```

The canary is written in BSS, so its location will always be predictable unless the binary is compiled as [PIE](https://en.wikipedia.org/wiki/Position-independent_code). But wait, if the compiler defines a hardcoded value to indicate where to find the canary, how can this work if the memory is totally randomized?

```
gef> checksec
[+] checksec for '/home/pi/greetz-pie'
Canary:                        Yes
NX Support:                    Yes
PIE Support:                   Yes
[...]
gef> disassemble greetz
Dump of assembler code for function greetz:
   0x7f5587f8 <+0>:     push    {r4, r5, r11, lr}
   0x7f5587fc <+4>:     add     r11, sp, #12
   0x7f558800 <+8>:     sub     sp, sp, #80     ; 0x50
   0x7f558804 <+12>:    str     r0, [r11, #-88] ; 0x58
   0x7f558808 <+16>:    ldr     r4, [pc, #112]  ; 0x7f558880 <greetz+136>
   0x7f55880c <+20>:    add     r4, pc, r4
[...]
```

To do that, the compiler will cheat: it will hardcode at the end of the function an offset (at 0x7f558808) and, since on ARM, `$pc` is a register like any other, it will simply `$pc` to this offset to find the canary (at 0x7f55880c)!

```bash
gef> x/x greetz+136
0x7f558880 <greetz+136>:        0x000082f0     // <- this is the offset
gef> x/x 0x000082f0+0x7f55880c
0x7f560afc:     0x00000000
gef> x/x 0x000082f0+0x7f55880c+8
0x7f560b04:     0x00008a0c                    // <- and this is our canary location in the .got
```

This means that the compiler requires that the `.got` page be located immediately after the `.text` page(s). Such predictability allows attacks such as [`Offset2lib`](http://cybersecurity.upv.es/attacks/offset2lib/offset2lib.html).

Fun fact: if only one function is to be SSP-protected, the compiler can optimize the code to strip the reference to `__stack_chk_guard`. The location of the canary will stay the same, but no symbol will exist.

### MIPS

MIPS compiled binaries can also be protected by SSP, and canaries check implementation on MIPS is very similar to the ARM approach.

But unlike ARM, the stub inserted by the compiler will point to an address in the GOT. This location holds another address pointing into a read-only location mapped by `ld.so`, where the `__stack_chk_guard` is stored.

```
gef> x/3i greetz+36
0x555509a4    <greetz+36>     lw   v0,-32656(gp)  <-$pc
0x555509a8    <greetz+40>     lw   v0,0(v0)
0x555509ac    <greetz+44>     sw   v0,100(s8)
gef> xinfo $gp-32656
----------------------------------[ xinfo: 0x55560de0 ]----------------------------------
Page: 0x55560000 -> 0x55561000 (size=0x1000)
Permissions: rw-
Pathname: /home/user/greetz-pie
Segment: .got (0x55560d80-0x55560df0)
gef> deref $gp-32656
0x55560de0|+0x00: 0x77ff6fbc -> 0xa172fe
gef> xinfo 0x77ff6fbc
----------------------------------[ xinfo: 0x77ff6fbc ]----------------------------------
Page: 0x77ff6000 -> 0x77ff7000 (size=0x1000)
Permissions: r--
Pathname: /lib/mips-linux-gnu/ld-2.19.so
Segment: .data.rel.ro (0x77ff6ec8-0x77ff6ffc)
```

This double dereference does not really allow to hack our way to simply update the canary when the binary is forked, like we did on Intel.

Just as in ARM, the few ways to recover the canary would be by either bruteforcing the 2^24 possible values, or through an information leak. Many home routers are MIPS-based Linux boxes, and still have many format string vulnerabilities which can be precious for this kind of attack.

### PowerPC

Last but not least, let’s see SSP on PowerPC. As it just so happens, there is not much more to say for this architecture and it is very similar to ARM and MIPS.

A page is allocated in memory as read/write, which will contains the canary.

```
gef➤  x/7i greetz+92
0x10000520    <greetz+92>     lwz   r10,92(r31)
0x10000524    <greetz+96>     lwz   r9,-28680(r2)
0x10000528    <greetz+100>     cmplw   cr7,r10,r9   ← $pc
0x1000052c    <greetz+104>     li   r10,0
0x10000530    <greetz+108>     li   r9,0
0x10000534    <greetz+112>     beq   cr7,0x1000053c <greetz+120>
0x10000538    <greetz+116>     bl   0x10000710 <__stack_chk_fail@plt>
gef➤  xinfo $r2-28680
──────────────────────────────[ xinfo: 0xb7ff34b8 ]──────────────────────────────
Page: 0xb7ff3000  →  0xb7ff5000 (size=0x2000)
Permissions: rw-
Pathname:
Offset (from page): +0x4b8
```

As expected, the canary is populated the same way that we described before, and the PoC `read_canary_from_pid` can still be used to know the canary of a running process:

```bash
user@debian-powerpc:~$ cat &
[1] 710
user@debian-powerpc:~$ ./read_canary_from_pid 710
[+] reading auxv of pid=710
[+] pid=710, path=/proc/710/auxv
[+] reading 8 bytes from pid=710 from address 0xbfb20622
[+] got 8 bytes
[+] 40 cc 2d 10 be f3 36 29
[+] canary for PID=710 is 0x40cc2d00
```

### What about the Linux kernel?

And now that we’ve covered all the major architectures, you might also be curious to know about the kernel-land canary.

Well, Linux protects also itself against overflows thanks to a per-process structure called `stack_canary`. This field is populated [very early during the kernel initialization](https://github.com/torvalds/linux/blob/v4.9/init/main.c#L479-L491) by calling the architecture-specific function `boot_init_stack_canary()`.

On x86, Linux will use the same function as in user-land (i.e. `get_random_bytes()`), and will shuffle it using the timestamp like this:

```c
get_random_bytes(&canary, sizeof(canary));
tsc = rdtsc();
canary += tsc + (tsc << 32UL);
current->stack_canary = canary;
```

[Source](https://github.com/torvalds/linux/blob/v4.9/arch/x86/include/asm/stackprotector.h#L74-L78)

For MIPS and ARM (including AARCH64), the kernel canary uses `get_random_bytes()` as well, but the result is XOR-ed with `LINUX_VERSION_CODE` variable:

```c
get_random_bytes(&canary, sizeof(canary));
canary ^= LINUX_VERSION_CODE;
```

[Source](https://github.com/torvalds/linux/blob/v4.9/arch/arm/include/asm/stackprotector.h#L31-L32)

And every `fork()` will generate a new kernel canary for the `current` process:

```c
#ifdef CONFIG_CC_STACKPROTECTOR

    tsk->stack_canary = get_random_int();
#endif
```

[Source](https://github.com/torvalds/linux/blob/v4.9/kernel/fork.c#L523-L525)

Very similarly to user-land, the procedure [`__stack_chk_fail()`](http://lxr.free-electrons.com/source/kernel/panic.c#L596) will be invoked to `panic()` the kernel when a corruption is detected.

## Conclusion

In this article, we’ve tried to cover a big part of the SSP protection, which is the canary generation and use. We’ve tested it across several architectures, which had us peeking down into kernel-land. Although the focus was given to understanding the canary mechanism of it, it is important to note that SSP encompasses more mechanisms, such as local variable re-ordering, and can also be finely tuned according to specific needs (using `--param=ssp-buffer-size=N` with `N=8` as a default).

To conclude, SSP provides a fairly good protection against stack buffer overflows, on all architectures tested. Developers should be encouraged to **systematically** provide binaries compiled with this flag. In case of doubt as to which SSP option would offer the best trade-off security/performance, it would be recommended to turn to `-fstack-protector-strong`, as it provides more protection against buffer overrun, by improving the traditional SSP argument re-ordering (to detect function pointers and such).

As you may have noticed reading the implementation details across all the different architectures, the SSP implementation within the C compiler is pretty much the same; the most notable exception being Intel, which uses architecture-specific property to provide a better way to reach the canary.

So if we were to summarize the pros & cons of the use of a stack canary, we could say that:

Pros:

-   Prevents PC overwrite
-   Minimal performance impact
-   Its value relies on a good source of entropy

Cons:

-   Only `execve()` generates a new canary, forking process does not, meaning that the forked process canaries may be brute-forced;
-   On most architectures, an arbitrary memory read is enough to defeat it
-   On ARM, MIPS, PowerPC, the offset to reach the canary needs to be hardcoded by the compiler. This forces page mapping to be predictable, and lead to `offset2lib` attacks.

Newer protections, such as [SafeStack](http://clang.llvm.org/docs/SafeStack.html) may offer a newer/better alternative, which may just be the subject of a follow-up blog post.

Well, that’s it. I hope you’ve enjoyed reading those notes, and feel free to poke me for comments or questions.
