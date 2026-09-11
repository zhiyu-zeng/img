---
title: Fuzzing IoT binaries with AFL++ - Part I
source: https://blog.attify.com/fuzzing-iot-devices-part-1/
source_host: blog.attify.com
clip_date: 2026-09-11T10:21:57+08:00
trace_id: 5f8adb2f-1dc7-4783-9172-bbc79e100a62
content_hash: 165be7cea8af4cf987a7339841ab16cced8c2ee38ff21707e209793ff6358cb4
status: synced
tags:
  - 漏洞分析
  - 安全工具
series: null
feed_source: Attify
ai_summary: 无需源码也能对 ARM/MIPS 架构的 IoT 固件二进制做模糊测试：AFL++ 的 Qemu 模式可插桩执行并自动找出触发崩溃的输入。
ai_summary_style: key-points
images_status:
  total: 16
  succeeded: 16
  failed_urls: []
notion_page_id: 3d875244-d011-81f7-8ce3-c2ad723bfca2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 无需源码也能对 ARM/MIPS 架构的 IoT 固件二进制做模糊测试：AFL++ 的 Qemu 模式可插桩执行并自动找出触发崩溃的输入。
> 
> - **工具背景：** AFL++ 是 AFL 的活跃分支；有源码时用 afl-gcc/afl-clang 插桩编译，无源码时用 Qemu、Unicorn 或 Frida 三种 binary-only 模式，效率低于源码插桩。
> - **Qemu 模式要点：** 基于 qemu user mode 模拟运行被改写的 Qemu，在程序执行时插桩基本块；可在 x86_64 主机上跑 ARM/MIPS 二进制，正适合 IoT 固件。
> - **输入限制：** AFL++/AFL/honggfuzz 只支持文件输入，socket 类程序不被支持；有源码可改写成读文件，闭源程序可借 Preeny、desockmulti 等 LD_PRELOAD 反 socket 工具（不一定开箱可用）。
> - **编译命令：** apt 安装 git、make、build-essential、clang、ninja-build、pkg-config、libglib2.0-dev、libpixman-1-dev，clone AFL++ 后 `make all`，再进 qemu_mode 执行 `CPU_TARGET=arm ./build_qemu_support.sh`。
> - **实测结果：** 用 binwalk 提取 Cisco RV130X 固件，对 `/usr/sbin/xmlparser1`（`-f @@`）与 `jsonparser` 做 fuzz；命令关键参数为 `-Q -i 输入目录 -o 输出目录 -- 目标程序 @@`。jsonparse 几分钟内产生 2 个 unique crash 并复现 segfault，崩溃样本落在 `output-*/default/crashes`；xmlparser1 短暂测试未崩溃。崩溃可利用性需另行分析。

> American fuzzy lop is a security-oriented fuzzer that employs a novel type of compile-time instrumentation and genetic algorithms to automatically discover clean, interesting test cases that trigger new internal states in the targeted binary. This substantially improves the functional coverage for the fuzzed code.

AFL lives at [https://lcamtuf.coredump.cx/afl/](https://lcamtuf.coredump.cx/afl/?ref=blog.attify.com). It hasn't been updated in a while. While AFL still works fine, there's a new project AFL++, a fork of AFL with lots of improvements and new features. AFL++ can be found at [https://aflplus.plus/](https://aflplus.plus/?ref=blog.attify.com) with its source on [GitHub](https://github.com/AFLplusplus/AFLplusplus?ref=blog.attify.com). In this article, we will look at using AFL++ to fuzz IoT binaries.

Fuzzing works best when we have the source code of the binary in question. Unfortunately for IoT binaries, this is often not the case. AFL++ (and AFL) ships with a companion tool (afl-gcc, afl-clang etc) that works as a drop-in replacement to gcc, clang, or any other standard build tool. The tool is used to inject instrumentation in the generated binaries while compiling the source code. The instrumented binaries can then be fuzzed using afl-fuzz.

Fuzzing closed source applications is tricky. For fuzzing such binaries, AFL++ can use Qemu, unicorn, or Frida and are named as qemu mode, unicorn mode, and Frida mode respectively. These are binary-only instrumentation modes and are not as efficient as the source code instrumentation modes. We will be using Qemu mode in this article.

In Qemu mode, AFL++ uses qemu user mode emulation to run the binary. It uses a modified version of Qemu which instruments the basic blocks as the program executes. The instrumentation information thus generated is used to generate new test cases which trigger different code paths improving code coverage. AFL++ in qemu mode can also be used to instrument foreign arch binaries (like an arm binary on an x86_64 host). This is extremely useful for fuzzing IoT firmware binaries which are usually of ARM or MIPS architecture.

An important point to note is that AFL++ and similar fuzzers (AFL, [hongfuzz](https://github.com/google/honggfuzz?ref=blog.attify.com), [radamsa](https://gitlab.com/akihe/radamsa?ref=blog.attify.com) *\[test case generator only\]*) only work with file inputs That is the program must only receive the fuzzed input from a file. Programs that take in input from a socket are not supported.

For fuzzing socket-based programs we can take either of the following approaches:

-   If the source code of the application is available, rewrite the application to accept input from a file. Most of the time rewriting the entire application isn’t necessary. We can code in a small test function that reads in a file and uses the data to call another function that we want to fuzz.
-   For closed source apps, rewriting the source isn’t an option. In such cases, there are hacks to convert a socket’ed binary to use files instead. These methods usually use LD_PRELOAD to override socket functions and make them read/write from a file instead. [Preeny](https://github.com/zardus/preeny?ref=blog.attify.com) and [desockmulti](https://github.com/zyingp/desockmulti?ref=blog.attify.com) are two such desocketing tools. However, these may not always work out of the box.

## Compiling AFL++

AFL++ can be compiled on any Linux system. Here we are using an Ubuntu 20.04 LXD container. The steps are as follows:

```bash
$ sudo apt update
$ sudo apt install git make build-essential clang ninja-build pkg-config libglib2.0-dev libpixman-1-dev
$ git clone https://github.com/AFLplusplus/AFLplusplus
$ cd AFLplusplus/
$ make all
$ cd qemu_mode
$ CPU_TARGET=arm ./build_qemu_support.sh
```

## Fuzzing simple IoT binaries

We will be using a firmware for the Cisco RV130 VPN router which can be downloaded from [https://software.cisco.com/download/home/285026141/type/282465789/release/1.0.3.55?i=!pp](https://software.cisco.com/download/home/285026141/type/282465789/release/1.0.3.55?i=!pp&ref=blog.attify.com). The file is named *RV130X_FW_1.0.3.55.bin*

After extracting the binary using binwalk the extracted file system looks like

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9db21f3c18f3d37e.png)

Extracted filesystem of Cisco RV130X firmware binary

We will be looking at fuzzing the *jsonparse* and *xmlparser1* binary in */usr/sbin/*. These programs accept input from a file and are ideal for fuzzing. We don’t have the source available so we have to use Qemu mode.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/88a0ea2269064a69.png)

## Fuzzing xmlparser1

Before fuzzing we need to know how the program accepts input. Running *xmlparser1* with *qemu-arm-static* with the –help parameter shows the usage. It accepts a filename with the -f parameter. The -d parameter stands for debug.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/87060aea6cb319d5.png)

We can create a [test XML file](https://pastebin.com/rDXcdURH?ref=blog.attify.com) and run *xmlparser1*.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/770bf87d37f2f374.png)

*xmlparser1* displays the parsed contents of the *test.xml* file. We may now proceed to fuzzing. To run the fuzzer we need to give an input file which the fuzzer will use to generate further test cases. We will specify *test.xml* as our input file.

Create two directories *input-xml* and *output-xml* and move the *test.xml* file to *input-xml* as shown.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ef274d9f340072a9.png)

We can now launch *afl-fuzz*

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/384a4531b03d6ed8.png)

```bash
$ QEMU_LD_PREFIX=./squashfs-root/ ../AFLplusplus/afl-fuzz \
            -Q \
            -i input-xml/ \
            -o output-xml/ \
            -- ./squashfs-root/usr/sbin/xmlparser1 -f @@
```

The options are explained below:

-   \-Q: Use AFL++ in Qemu mode
-   \-i: The path to the input directory
-   \-o: The path to the output directory. This directory will contain files that trigger an interesting behavior on the binary such as a crash or hang

Everything after the double hyphen (--) specifies the target program to run along with its arguments. The @@ parameter stands for the filename. At runtime, AFL++ will replace the @@ parameter with the name of the input file.

The fuzzing session starts as shown below. We can press Ctrl+C anytime to exit.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/87740d4a87d269ca.png)

In our brief test, AFL++ wasn’t able to crash the application.

## Fuzzing jsonparse

Jsonparse is a similar binary but it parses JSON files instead of XML. Running the program without any arguments displays its usage.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/40c4c7b5318662a0.png)

We can create a [test JSON file](https://pastebin.com/XNYEQwhu?ref=blog.attify.com) and run jsonparser on it.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/768c339a9616bcba.png)

We can use the same *test.json* file as input to the fuzzer. In a similar way, create two directories named *input-json* and *output-json* with *test.json* in directory *input-json*.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4f10647b2e395dd5.png)

We can run the fuzzer as shown:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7287f212a6560b79.png)

```bash
$ QEMU_LD_PREFIX=./squashfs-root/ ../AFLplusplus/afl-fuzz \
            -Q \
            -i input-json / \
            -o output-json / \
            -- ./squashfs-root/usr/sbin/jsonparser @
```

After fuzzing for a couple of minutes, there are two unique crashes already.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/df8ba2f99bec64b3.png)

Let’s explore the *output-json* directory to have a look at the files which crashed *jsonparser*.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c8486e0f824238e2.png)

The two files which triggered the crashes are in the *output-json/default/crashes* directory.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/30c561f516ae7e2d.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e2ffecb5621428d3.png)

To cross-check, we can run *jsonparser* with one of the generated files.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d52bdf0b4f1fda49.png)

*Jsonparser* indeed crashes with a segfault. From here on, the next steps are to identify the root cause of the bug and check if it's exploitable. Not all crashes are exploitable. Triaging the crash is out of the scope of this post.

In the next part, we will be looking at how to fuzz socketed binaries. These programs accept input over the network and not from a regular file. For any comments or suggestions feel free to leave a comment below.
