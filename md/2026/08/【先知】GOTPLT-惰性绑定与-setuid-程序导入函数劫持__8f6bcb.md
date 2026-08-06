---
title: 【先知】GOT/PLT 惰性绑定与 setuid 程序导入函数劫持
source: https://xz.aliyun.com/news/92637
source_host: xz.aliyun.com
clip_date: 2026-08-06T16:36:54+08:00
trace_id: 015cd864-9f04-4d8f-a7c4-924aff74c0f6
content_hash: 754701cc6fe22dcdaa953cffac394f0f5f33a8a96652fe882f94bd995196a83f
status: synced
tags:
  - 先知
  - Linux安全
  - 漏洞分析
series: null
feed_source: 先知安全技术社区
ai_summary: 特权程序若同时存在可控写入缺陷与可写GOT，可借惰性绑定将`puts@got.plt`改向`system@plt`实现命令执行；Full RELRO让GOT只读即可阻断该链路。
ai_summary_style: key-points
images_status:
  total: 36
  succeeded: 36
  failed_urls: []
notion_page_id: 3b475244-d011-810a-be40-cc34a8b629a4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 特权程序若同时存在可控写入缺陷与可写GOT，可借惰性绑定将`puts@got.plt`改向`system@plt`实现命令执行；Full RELRO让GOT只读即可阻断该链路。
> 
> - **劫持原理：** x86_64下`puts@plt`先`jmp [puts@got.plt]`；lazy binding首次调用前槽值是`puts@plt+6`，解析后回填libc真实地址，若运行期可写则后续跳转可被改写。
> - **参数兼容：** `puts`与`system`在System V ABI下首参都走`rdi`，将`puts@got.plt`写成`system@plt`后，源码中的`puts(argv[4])`自然变成`system(argv[4])`，无需重组参数。
> - **实验验证：** 弱保护版本（`-z lazy -z norelro`）用`poke`分支把`0x4033f0`写成`0x401060`，程序实际执行`/bin/sh -c id`；GDB单步确认控制流从`puts@plt`进入`system@plt`。
> - **secure-execution缺口：** setuid程序会进入glibc安全模式过滤`LD_PRELOAD`等环境变量，但对进程内部错误写入无能为力，也不会自动保护GOT槽。
> - **防护对照：** Full RELRO（`-z relro -z now`）在进`main`前置入只读GOT，同样的写入触发`SIGSEGV`且`si_code=SEGV_ACCERR`；Partial RELRO因保留lazy binding，`.got.plt`仍可写，不能等同防护。

> 如果一个特权程序存在可控写入缺陷，而导入函数槽所在页面仍然可写，那么后续函数调用就可能被改向。

ELF 动态链接程序调用外部函数时，调用点通常不会直接落到 libc 的最终实现，而是先经过 PLT，再由 PLT 读取 GOT 中保存的目标地址。这个机制让动态链接可以按需解析符号，也让加载器能够在运行期回填函数地址。

## 1\. 问题概述

ELF 动态链接程序调用 `puts()` 、 `printf()` 、 `system()` 等外部函数时，编译器和链接器通常会生成一个 PLT 入口。调用点进入 PLT 后，PLT 再从 GOT 中读取实际跳转目标。启用 lazy binding 时，第一次调用某个外部函数会触发动态链接器解析符号；解析完成后，真实地址被写回 `.got.plt` ，后续调用不再重复解析。

这个过程本身不是漏洞。真正危险的是两个条件同时出现：

-   程序中存在进程内写入缺陷，例如任意地址写、越界写、格式化字符串 `%n` 写入或错误指针写入。
-   `.got.plt` 中的导入函数槽在程序进入业务逻辑后仍然可写。

setuid 程序会放大这种风险。程序启动后，effective UID 可能变成文件属主，例如 root。glibc 在这种情况下会进入 secure-execution 模式，过滤 `LD_PRELOAD` 、 `LD_LIBRARY_PATH` 等危险环境变量；但这些过滤只约束动态链接器从外部环境接收输入，并不会修复程序内部的错误写入，也不会自动保护 GOT 槽。

## 2\. GOT、PLT 与 lazy binding 的运行逻辑

在 x86_64 ELF 中，导入函数调用通常会涉及以下几个区域。

|     |     |     |
| --- | --- | --- |  
| 区域  | 用途  | 常见权限 |
| `.plt` | 导入函数的跳转桩，调用点通常先进入这里 | `r-x` |
| `.got` | 保存全局对象、动态链接器辅助指针等 | 重定位后可被 RELRO 改成 `r--` |
| `.got.plt` | 保存 `R_X86_64_JUMP_SLOT` 项，也就是导入函数运行期地址 | Full RELRO 前通常可写 |
| `.dynamic` | 保存动态段信息，加载器依赖它定位重定位表、符号表、字符串表 | 受 RELRO 影响 |

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8b0898d9beb5add8.svg)

`puts@plt` 的结构可简化为三步：先读 GOT 槽，再按槽值做间接跳转。

```plain
puts@plt:
    jmp    QWORD PTR [rip + puts_got]    ; 读取 puts@got.plt 中保存的目标地址
    push   0x0                           ; 首次解析时传给动态链接器的重定位序号
    jmp    plt0                          ; 进入 PLT0，由动态链接器完成解析
```

首次调用前， `puts@got.plt` 通常指向 `puts@plt+6` 附近，也就是 `push` 指令所在位置。程序第一次执行 `puts()` 时，控制流会沿着 PLT 的解析路径进入 `_dl_runtime_resolve` 。动态链接器找到 libc 中真正的 `puts()` 地址后，把地址写回 `puts@got.plt` 。下一次再执行 `puts()` ，PLT 的第一条 `jmp [got]` 就会直接跳到 libc。

如果进程内的写入缺陷能覆盖 `puts@got.plt` ，后续 `puts()` 会按新的槽位值跳转。本实验选择 `system@plt` 作为目标地址，是因为 `puts()` 和 `system()` 在 x86_64 System V ABI 下都把第一个参数放在 `rdi` 。源码里的 `puts(argv[4])` 被改向后， `argv[4]` 会自然成为 `system()` 的参数。

这里容易混淆的是 lazy binding 和 RELRO 的边界：

-   lazy binding 影响符号解析时机：第一次调用时解析，还是启动阶段提前解析。
-   RELRO 影响重定位完成后的页面权限：GOT 相关页面是否还能被写。

> 因此， `-z now` 只解决“运行期首次解析”的问题；如果没有 RELRO，GOT 槽仍可能保持可写。

## 3\. secure-execution 保护了什么，又没有保护什么

setuid 程序执行时，内核会因为 real UID、effective UID 等凭据变化设置 `AT_SECURE` 。glibc 读取该标志后进入 secure-execution 模式，常见影响包括忽略或过滤下面这些环境变量。

```latex
LD_PRELOAD
LD_LIBRARY_PATH
LD_AUDIT
LD_ORIGIN_PATH
LD_DEBUG
LD_PROFILE
LD_SHOW_AUXV
GCONV_PATH
LOCPATH
MALLOC_TRACE
TMPDIR
TZDIR
```

这能防止攻击者通过环境变量干扰动态链接器，例如强行预加载共享库。但 secure-execution 不会审计程序自己的内存写入，也不会阻止业务代码把错误值写到 GOT、函数指针表、虚表或回调表中。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/28bc6f2c81d9f758.svg)

> 换句话说，secure-execution 能收紧加载环境，但不能替代内存安全和链接期防护。

## 4\. 实验样本

### 4.1 样本设计

下面的程序故意提供了一个 `poke` 分支，用来模拟“一次 8 字节写入缺陷”。

victim.c

```c
#define _GNU_SOURCE
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

/*
 * volatile 会阻止编译器把 retain_import 的读取优化掉。
 * retain_system_plt() 正常情况下不会执行 system("true")，
 * 但它能让最终二进制保留 system@plt，便于后续观察跳转改向。
 */
static volatile int retain_import;

__attribute__((noinline, used))
static void retain_system_plt(void) {
    if (retain_import) {
        (void)system("true");
    }
}

static uintptr_t parse_word(const char *text) {
    char *end = NULL;
    errno = 0;

    unsigned long long value = strtoull(text, &end, 0);
    if (errno != 0 || end == text || *end != '\0') {
        fprintf(stderr, "invalid numeric argument: %s\n", text);
        exit(2);
    }

    return (uintptr_t)value;
}

int main(int argc, char **argv) {
    retain_system_plt();

    if (argc == 5 && strcmp(argv[1], "poke") == 0) {
        uintptr_t address = parse_word(argv[2]);
        uintptr_t value = parse_word(argv[3]);

        /*
         * 如果 address 指向 puts@got.plt，下一次 puts() 的跳转目标会被改写。
         */
        volatile uintptr_t *slot = (volatile uintptr_t *)address;
        *slot = value;

        /*
         * 仍然调用 puts()。
         * 实际落点由 puts@got.plt 当前保存的地址决定。
         */
        puts(argv[4]);
        return 0;
    }

    if (argc == 3 && strcmp(argv[1], "say") == 0) {
        puts(argv[2]);
        return 0;
    }

    fprintf(stderr,
            "usage:\n"
            "  %s say <text>\n"
            "  %s poke <address> <value> <text>\n",
            argv[0], argv[0]);
    return 1;
}
```

`retain_system_plt()` 只负责保留 `system@plt` ，不会在正常路径中执行。如果目标程序没有导入 `system()` ，就不能照搬本实验的目标地址，必须另找可用函数入口，或通过信息泄漏计算 libc 地址。

### 4.2 基础环境

```bash
uname -a
ldd --version | head -n 1
gcc --version | head -n 1
readlink -f /bin/sh
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a7fd85dd6c87cde7.png)

## 5\. 构建弱保护版本

先构建一个方便观察的版本：主程序不使用 PIE，GOT 不启用 RELRO，符号保留 lazy binding。

```bash
gcc -O0 -g -no-pie -fno-pie -fno-stack-protector \
    -Wl,-z,lazy -Wl,-z,norelro \
    -fcf-protection=none \
    victim.c -o victim_weak
```

这些选项分别承担不同作用：

-   `-O0 -g` 保留调试信息，避免优化把控制流变得难以对照源码。
-   `-no-pie -fno-pie` 让主程序的 `.plt` 、`.got.plt` 地址稳定，便于直接使用 `readelf` 输出的地址。
-   `-fno-stack-protector` 只是减少干扰；本实验不依赖栈溢出。
-   `-Wl,-z,lazy` 保留首次调用时解析导入符号的行为。
-   `-Wl,-z,norelro` 让 GOT 相关页面在运行期保持可写。
-   `-fcf-protection=none` 避免 CET/IBT 改变 PLT 桩形态，方便观察经典跳转逻辑。

先确认文件类型和动态段。弱保护版本是非 PIE 的 `EXEC` ，并且不会出现 `GNU_RELRO` 、 `BIND_NOW` 。

```bash
readelf -lW ./victim_weak | grep GNU_RELRO || true
readelf -dW ./victim_weak | grep -E 'BIND_NOW|FLAGS' || true
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cf07ca85bee9b83e.png)

看完整头部

```bash
readelf -hW ./victim_weak | head -n 20
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4dc9532bd10e0618.png)

`-no-pie -fno-pie` 生效。

### 5.1 观察 setuid 语义

如果要观察 setuid 语义，需要把样本设为 root 属主并打开 setuid 位。

```bash
sudo chown root:root ./victim_weak
sudo chmod 4755 ./victim_weak
ls -l ./victim_weak
```

权限位中出现 `s` ：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5dddf8ed5c1a2d76.png)

> 其中属主执行位位置显示为 `s` ，说明 setuid 位已经设置成功；文件属主为 `root` ，说明程序被普通用户执行时，内核会尝试把进程的 effective UID 设置为文件属主，也就是 root。

setuid 位已经设置成功，文件具备以属主有效权限运行的条件。

### 5.2 弱保护版本的基线运行

先确认普通路径没有异常。

```bash
./victim_weak say hello
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b97b16e3ce7df8a8.png)

`say` 分支能正常调用 `puts()` ，还不能说明 lazy binding 或 GOT 权限状态。接着检查 PLT 桩形态。

```bash
objdump -d -M intel ./victim_weak | sed -n '/<puts@plt>:/,+4p'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b784c432461e2dd1.png)

注释中的 `0x4033f0` 是 `puts()` 对应的 GOT 槽地址。程序执行 `puts()` 时会先进入 `puts@plt` ，再读取该 GOT 槽中的地址作为最终跳转目标。

后面的 `push 0x2` 和 `jmp 401020` 是 lazy binding 的首次解析路径。当 GOT 槽尚未保存 libc 中 `puts()` 的真实地址时，控制流会进入动态链接器完成符号解析。解析完成后，GOT 槽会被回填，后续调用会直接跳到 libc 的 `puts()` 。

## 6\. 提取关键地址

实验需要两个值： **写入位置和写入内容。** 写入位置是 `puts@got.plt` ，写入内容是 `system@plt` 。这两个值必须来自同一个二进制，重新编译后必须重新提取。

先看 `puts()` 的 JUMP_SLOT 重定位项。

```bash
readelf -rW ./victim_weak | awk '/puts@/ && /JUMP_SLOT/ {print}'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/35ab36439d64059f.png)

第一列就是 `puts@got.plt` 的虚拟地址。

再从反汇编中找到 `system@plt` 。

```bash
objdump -d -M intel ./victim_weak | sed -n '/<system@plt>:/,+3p'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ae5007d0380d7427.png)

-   `system@plt` 入口地址 = `0x401060` ，这就是要写入 `puts@got.plt` 的“目标值”。
-   桩形态是标准的三指令 lazy-binding PLT，说明 `system()` 符号确实被 `retain_system_plt()` 保留了下来，没有被链接器当作未使用符号剔除。
-   `system` 与 `puts` 的 PLT 桩共享同一个 `PLT0` (`0x401020`)，与后面 `.plt` 节的起始地址一致

顺手确认这两个地址分别落在哪个段里。

```bash
readelf -SW ./victim_weak | grep -E '\.plt|\.got'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0047fbc0a6dc3faf.png)

1.  `system@plt (0x401060)` 落在 `.plt (0x401020, size 0x80)` 内 — 偏移 `0x40` ，属于第 4 个 PLT 桩，与 `push 0x3` （第 4 个重定位项，PLT0 占一个槽）一致。
2.  `puts@got.plt (0x4033f0)` 落在 `.got.plt (0x4033c8, size 0x50)` 内 — 偏移 `0x28` ，即第 5 个 8 字节槽。前 3 个槽是 `.got.plt` 头（保留给 `_DYNAMIC` 、 `link_map` 、 `_dl_runtime_resolve` ），随后依次是 `puts` 、 `system` ，位置合理。
3.  `.plt` 是 `AX` （可执行），`.got.plt` 是 `WA` （可写、无 RELRO 只读化） — 这正是弱保护版本能被 GOT 覆写的根本原因：写目标在可写数据页，跳转目标在可执行代码页。

两者分别落在数据段和代码段的正确节区中，PLT 桩形态标准（ `jmp [got] / push reloc / jmp PLT0` ），保留了 lazy binding。

## 7\. 观察 lazy binding 的回填过程

> 调试 setuid 程序容易受到 ptrace 安全策略影响。

这里先去掉 setuid 位，只观察 GOT/PLT 行为。

```bash
sudo chmod 0755 ./victim_weak
gdb -q ./victim_weak
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4a3b8c689ded8742.png)

```plain
set disassembly-flavor intel
set $puts_got = 0x4033f0
start say hello
x/gx $puts_got
break *0x401050
continue
x/gx $puts_got
finish
x/gx $puts_got
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7e37dd38bd9c62bb.png)

### 7.1 main 入口，puts() 尚未调用

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/971b2183dff990b1.png)

-   `0x0000000000401056` = `puts@plt (0x401050) + 6` = `push 0x2` 指令的地址。
-   这是链接器在 ELF 文件的 `.got.plt` 中静态写入的值，作用是让首次 `puts()` 调用被"引导"到 `_dl_runtime_resolve` 。

程序停在 `main` 入口第一行； `puts@got.plt` 值 = `0x0000000000401056` （链接器写入的静态初值，等于 `puts@plt+6` ）。

> 任何 `puts()` 调用都还未发生，这就是符号解析的起点。

### 7.2 首次进入 puts@plt，尚未跳转

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c2f949f00c6df79d.png)

-   程序已经运行到 `puts@plt` 入口（因 `puts(argv[2])` 被调用），但槽值没有任何变化，仍是 `0x401056` 。
-   这个"没变"恰恰是 lazy binding 的核心证据：加载器在 `main` 前不预解析 `puts` 符号，把工作推迟到运行期首次调用时。

断点命中 `puts@plt` 入口，即将执行第一条 `jmp [got]` ；槽值仍然是 `0x401056` ，动态链接器尚未运行。

### 7.3 finish 完成一次 puts() 调用

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/868263a5e4a672f8.png)

-   `finish` 让 CPU 走完 `puts@plt` 的三条指令 + `_dl_runtime_resolve` 内部逻辑 + libc 中 `puts` 的实际打印动作。
-   屏幕出现 `hello` ，证明 `puts` 语义正常执行。
-   槽值从 `0x0000000000401056` 变成 `0x00007ffff7e2f060` ：

-   高位 `0x00007fff...` 是 Linux 共享库映射区的典型地址范围；
-   每次运行由于 ASLR 会有变化（如果 `randomize_va_space=2` ）；
-   这就是 libc.so 中 `puts` 函数的运行期入口地址。

`puts()` 已完整执行完毕，槽值被回填为 `0x00007ffff7e2f060` —— libc 中真实 `puts` 的地址。

## 8\. 改写 puts@got.plt 并确认控制流改向

现在使用弱保护样本的 `poke` 分支，把 `puts@got.plt` 写成 `system@plt` 。为了先排除 setuid 和 shell 降权等干扰，可以在普通权限下做一次语义验证。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5225e5849ecc8fed.svg)

```bash
./victim_weak poke 0x4033f0 0x401060 'printf GOT_REDIRECTED'
```

如果控制流被改向，输出会来自 shell 执行的 `printf` ：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ffc758208e716aea.png)

如果没有改写成功，程序会按 `puts()` 语义输出原始字符串，能看到：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/888d0a8c7a1c935d.png)

再恢复 setuid 位，从普通 shell 中运行 `id` 。

```bash
sudo chmod 4755 ./victim_weak
./victim_weak poke 0x4033f0 0x401060 'id'
```

在 `/bin/sh` 不主动降权、挂载点允许 setuid、文件属主确实为 root 的环境中，能看到：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b51b6043fcafc2fb.png)

> 源码里的 `puts(argv[4])` 没有按普通输出函数执行，而是经由被覆盖的 GOT 槽进入 `system(argv[4])` 。由于 `argv[4]` 是 `id` ，shell 执行了 `id` 。

不过， `id` 中看不到 `euid=0` 并不一定说明 GOT 改写失败。常见原因包括：

-   当前目录挂载了 `nosuid` 。
-   文件属主不是 root，或者 setuid 位没有生效。
-   `/bin/sh` 在特权场景下主动降权。
-   程序是在 `gdb` 、 `strace` 等跟踪环境中运行，系统策略改变了凭据行为。

因此，凭据输出只能说明“当前平台上的 setuid 效果”，不能单独作为控制流是否改向的证据。控制流要用 GDB 看。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e5425debf7a7b733.svg)

先去掉 setuid 位，再进入 GDB。

```bash
sudo chmod 0755 ./victim_weak
gdb -q ./victim_weak
```

在 GDB 中设置两个地址，断在 `puts@plt` 。

```plain
gdb -q ./victim_weak
set disassembly-flavor intel
set $puts_got = 0x4033f0
set $system_plt = 0x401060
break *0x401050
run poke 0x4033f0 0x401060 id
x/gx $puts_got
si
x/i $pc
```

可以看到槽位已经被写成 `system@plt` ，单步后程序计数器落到 `system@plt` 。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ebc55bb68171326d.png)

这一步证明了三个事实：

-   断点命中位置仍是 `puts@plt` ，源码调用点没有改变。
-   `puts@plt` 第一条间接跳转读取的是被写入后的 GOT 槽值。
-   控制流进入了 `system@plt` ，后续参数仍沿原 ABI 传递。

还可以用 `strace` 观察 `system()` 带来的进程创建行为。

```bash
strace -f -e trace=execve ./victim_weak poke 0x4033f0 0x401060 'id'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1ef87478a1917c01.png)

能看到包含 `/bin/sh -c id` 和后续的 `id` 执行。

这说明程序行为已经从简单输出字符串变成了执行 shell 命令。

### 8.1 负向对照：区分普通输出和命令执行

先使用不会造成状态改变的命令做对照。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0c0936d2583dcc04.png)

-   第一行来自 `puts()` ，只是把参数原样打印出来。
-   第二行来自 `system()` ， `printf GOT_REDIRECTED` 被 `/bin/sh -c` 解释执行。

### 8.2 参数为什么能自然传给 system()

在 x86_64 System V ABI 下，普通函数第一个参数放在 `rdi` 。源码中的调用是：

```c
puts(argv[4]);
```

当 `puts@got.plt` 被改成 `system@plt` 后，调用点没有重新组织参数， `rdi` 中仍是 `argv[4]` 。因此实际效果变成：

```c
system(argv[4]);
```

> 这也是选择 `puts()` 到 `system()` 的原因：
> 
> 并不是所有函数都能这样替换：参数个数、参数类型、调用约定或副作用不匹配时，程序可能崩溃，或产生与预期不同的行为。

### 8.3 运行期映射权限观察

弱保护版本在业务逻辑执行期间仍可写 GOT 槽。可以在 GDB 中查看映射权限。

```plain
start poke 0x0 0x0 test
info proc mappings
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a393d486b9a11d74.png)

程序停在 `main` 入口时， `info proc mappings` 显示 `victim_weak` 主程序共有 4 段映射，其中 `0x403000–0x404000` 权限为 `rw-p` 。`.got.plt` 位于该段，因此 `puts@got.plt` 所在页在运行期是可写的。

> 弱保护版本（ `-z lazy` 且未对 `.got.plt` 应用 RELRO）在运行期保留了导入函数槽所在页的写权限，构成 GOT 改写的必要条件。

## 9\. 用 Full RELRO 做对照

Full RELRO 的关键效果是：动态链接器在程序进入 `main()` 前完成相关重定位，并把 GOT 所在页面改成只读。这样即使样本仍然存在 `poke` 这个写入缺陷，写入 `puts@got.plt` 时也会被内核拒绝。

源码不变，只改链接选项。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c8395f830d59c7e5.svg)

```bash
gcc -O0 -g -no-pie -fno-pie -fno-stack-protector \
    -Wl,-z,relro -Wl,-z,now \
    -fcf-protection=none \
    victim.c -o victim_relro
```

确认动态段和程序头中同时出现 `NOW` 与 `GNU_RELRO` 。

```bash
readelf -dW ./victim_relro | grep -E 'BIND_NOW|FLAGS'
readelf -lW ./victim_relro | grep GNU_RELRO
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ac6be020989a9aa3.png)

只有 `GNU_RELRO` 而没有 `NOW` ，通常只是 Partial RELRO，`.got.plt` 仍可能为了 lazy binding 保持可写。 `relro + now` 同时出现，才是这里要验证的 Full RELRO。

重新提取 `victim_relro` 自己的地址。

```bash
RELRO_PUTS_GOT=$(readelf -rW ./victim_relro | awk '/puts@/ && /JUMP_SLOT/ {print "0x" $1; exit}')
RELRO_SYSTEM_PLT=$(objdump -d ./victim_relro | awk '/<system@plt>:/ {gsub(":", "", $1); print "0x" $1; exit}')
printf 'puts@got.plt=%s\nsystem@plt=%s\n' "$RELRO_PUTS_GOT" "$RELRO_SYSTEM_PLT"
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2956e773011b3a9c.png)

现在运行同样的写入路径。

```bash
sudo chown root:root ./victim_relro
sudo chmod 4755 ./victim_relro
./victim_relro poke "$RELRO_PUTS_GOT" "$RELRO_SYSTEM_PLT" 'id'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/06e00cc10df9e9cb.png)

这个崩溃不是因为 `system@plt` 不存在，也不是因为参数错误，而是因为 `*slot = value` 正在写只读页面。用 `strace` 可以看到更明确的信号原因。

```bash
strace -f -e signal=SIGSEGV ./victim_relro poke "$RELRO_PUTS_GOT" "$RELRO_SYSTEM_PLT" 'id'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9c6da669f2dac004.png)

-   `si_code=SEGV_ACCERR` → 地址存在，但访问权限不允许写入（如果是 `SEGV_MAPERR` 才是地址未映射）。
-   `si_addr=0x403fc8` → 与 `RELRO_PUTS_GOT` 完全一致，直接证明失败点就是导入函数槽写入。

也可以在 GDB 中查看运行期映射权限。

```bash
gdb -q ./victim_relro
```

进入 GDB 后执行：

```plain
start poke 0x403fc8 0x401050 id
info proc mappings
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ed113b0a95c94ff2.png)

检查内存

```bash
x/gx 0x403fc8
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/00a8558973cf3c96.png)

GDB 在地址右侧自动打出符号 `<puts@got.plt>` ，直接证明 `RELRO_PUTS_GOT = 0x403fc8` 就是导入函数槽本身，不是从 `readelf` 拿到的一个孤立数值。

`x/gx` 能成功打印出内容（ `0x00007fddd7507060` ），说明这一页已被映射。因此后续写入触发的 `SIGSEGV` 只可能是 `SEGV_ACCERR` （权限不允许），不可能是 `SEGV_MAPERR` （地址未映射）。

1.  同样的写入缺陷仍然存在：源码没有变化，poke 逻辑照样把用户传入的地址当作指针来写；变化只在链接选项。
2.  防护点在运行期页面权限：Full RELRO 不阻止程序做非法写，而是把导入函数槽所在页在业务逻辑开始前置为只读，让写操作在内核处失败。
3.  GOT 劫持的可行性由两层共同决定：

-   源码层是否存在任意写缺陷；
-   运行期目标页是否处于 rw-p。 Full RELRO 关闭了第二层，因此即使程序具有 setuid 特权，攻击者也无法通过覆写 puts@got.plt 把控制流改向 system@plt。

### 9.1 Partial RELRO 对照

为了确认 `-z now` 的作用，可以增加一个 Partial RELRO 版本。它有 `GNU_RELRO` ，但保留 lazy binding。

```bash
gcc -O0 -g -no-pie -fno-pie -fno-stack-protector \
    -Wl,-z,relro -Wl,-z,lazy \
    -fcf-protection=none \
    victim.c -o victim_partial
```

检查状态：

```bash
readelf -lW ./victim_partial | grep GNU_RELRO
readelf -dW ./victim_partial | grep -E 'BIND_NOW|FLAGS' || true
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/afda4b5df41d505f.png)

重新提取地址并尝试改写：

```bash
PARTIAL_PUTS_GOT=$(readelf -rW ./victim_partial | awk '/puts@/ && /JUMP_SLOT/ {print "0x" $1; exit}')
PARTIAL_SYSTEM_PLT=$(objdump -d ./victim_partial | awk '/<system@plt>:/ {gsub(":", "", $1); print "0x" $1; exit}')
./victim_partial poke "$PARTIAL_PUTS_GOT" "$PARTIAL_SYSTEM_PLT" 'printf PARTIAL_RELRO_WRITABLE'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f28e296dd954b1e1.png)

-   Partial RELRO 会保护一部分重定位后不再需要修改的区域，例如 `.got` 中的若干项。
-   为了支持 lazy binding，`.got.plt` 中的 `JUMP_SLOT` 项仍需在首次调用时被动态链接器写入，因此通常不能全部提前置只读。
-   对 GOT 覆写链路而言，Partial RELRO 不等价于 Full RELRO。关键区别是是否同时启用 `-z now` 。

### 9.2 Full RELRO 崩溃点定位

Full RELRO 版本运行 `poke` 后出现 `Segmentation fault` 时，可以用 GDB 精确定位在写入语句。

```bash
gdb -q ./victim_relro
```

GDB 中执行：

```plain
set disassembly-flavor intel
run poke 0x403fc8 0x401060 id
bt
x/i $pc
info proc mappings
```

### 崩溃现场

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fd97568a47513038.png)

1.  `victim.c:47 *slot = value;` — 崩溃发生在源码层的写入语句上，不是在 `system@plt` 、不是在参数处理。
2.  `bt` 只有一层 `main` — 说明程序没有进入 `system@plt` ，控制流根本没被改动。
3.  `mov QWORD PTR [rax], rdx` — 汇编层直接坐实这是一次内存写指令； `rax` 持有 `slot` （= `0x403fc8` ）， `rdx` 持有 `value` （= `0x401060` ），写入触发 `SIGSEGV` 。

### 运行期页面权限

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/96bd46099f49c714.png)

Full RELRO 版本运行 GOT 覆写时，GDB 精确定位到 `victim.c:47` 的 `*slot = value` 一行崩溃。 `mov QWORD PTR [rax], rdx` 直接对应源码里的指针解引用赋值， `rax` 是目标 `slot` 地址 `0x403fc8` ， `rdx` 是被写入的 `value` 值 `0x401060` 。回溯栈 `bt` 只有一层，且停在写入指令而非 `system@plt` 或 `system` 内部，说明控制流从未被改向——攻击链的第一步（覆写函数指针）就已失败。

## 11\. 结论

GOT/PLT 的惰性绑定不是孤立漏洞，它只是动态链接的一种实现方式。程序内部出现可控写入后，运行期仍然可写的导入函数槽会成为稳定的控制流改向点。setuid 程序进入 secure-execution 模式后，危险环境变量会被过滤，但进程内部的错误写入仍然存在，GOT 槽也不会因此自动只读。

> `puts@plt` 从 `puts@got.plt` 读取目标地址； `poke` 把该槽写成 `system@plt` ；源码继续执行 `puts(argv[4])` ，实际语义变成 `system(argv[4])` 。Full RELRO 样本则展示了防护效果：重定位提前完成，GOT 页面被改成只读，同样的写入在内存权限检查处失败。

对特权 ELF 程序来说，Full RELRO 应当是基线而不是可选项。PIE、ASLR、Canary、NX、Fortify、CET/IBT 都有价值，但它们解决的问题不同；针对本实验这类 GOT 覆写链路，直接起决定作用的是 `-Wl,-z,relro -Wl,-z,now` 带来的只读 GOT。最终仍要回到代码本身：

> 减少特权持续时间，不在高权限上下文中解释用户输入，不保留任意读写接口，并把地址、长度、索引、格式字符串这类输入边界检查清楚。
