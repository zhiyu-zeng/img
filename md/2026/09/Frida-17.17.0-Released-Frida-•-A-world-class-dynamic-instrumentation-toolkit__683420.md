---
title: Frida 17.17.0 Released | Frida • A world-class dynamic instrumentation toolkit
source: https://frida.re/news/2026/08/05/frida-17-17-0-released/
source_host: frida.re
clip_date: 2026-09-15T10:22:37+08:00
trace_id: 5d8e90b8-a3c6-4ca1-a051-14efcdbe2ab7
content_hash: 84ff8920d532e9487cc91639ca063e71b2aa1960eb2bab6a5d58406ecb75334b
status: synced
tags:
  - Frida
  - 内核
series: null
feed_source: Frida Releases
ai_summary: Frida 17.17.0 让内嵌 GumJS 的 Rust 版 Barebone agent 首次以 Linux 内核模块（.ko）形式在内核中运行，并给出为 Pixel 6 Pro 编译该模块的完整流程。
ai_summary_style: key-points:weak
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3dc75244-d011-81d8-835a-d87f549619a5
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> Frida 17.17.0 让内嵌 GumJS 的 Rust 版 Barebone agent 首次以 Linux 内核模块（.ko）形式在内核中运行，并给出为 Pixel 6 Pro 编译该模块的完整流程。
> 
> - **运行形态：** agent 打包成 `.ko`，用 `insmod` 加载后通过 `/dev/frida` 交换带长度前缀的 GVariant 消息，再由设备上的 `frida-server --device=barebone` 接入；Linux 侧只需一个很小的 C shim 做内核黏合。
> - **构建前提：** 必须在 x86-64 Linux 主机上编译（内核构建树含 x86-64 程序）；clang 需 ≥ 19，GCC 因不实现 soft-float ABI 不可用；需安装 `binutils-aarch64-linux-gnu`，并为 rustup 添加 `aarch64-unknown-none` target 与 `rust-src` 组件。
> - **依赖来源：** 直接下载 release 页的 `none-arm64-softfloat` GumJS devkit，无需自行编译 Gum；再用 `releng/deps.py sync sdk none-arm64-softfloat_nopic` 拉取含 picolibc 与 compiler-rt 的 SDK，devkit 依赖它们。
> - **内核匹配：** 从设备 `uname -r` 尾部解析 GKI commit 与 build number，据此从 ci.android.com 取 `modules_prepare_outdir.tar.gz`、`Module.symvers`，并从 android.googlesource.com 拉对应 commit 源码；内核会精确比对版本字符串，同一分支的其它构建无法加载。
> - **编译加载：** `make -C src/barebone/agent/linux` 并传入 `FRIDA_SDK`、`GUMJS_DEVKIT_DIR`、`KDIR`、`KOUT` 及 aarch64 工具链变量与 `LLVM=1`，随后 push 到 `/data/local/tmp/` 并 `su -c insmod`。
> - **同步修复：** 解决 JS 内 native fault 被后续 handler 恢复时 detach 挂起（改为重平衡 Interceptor 事务）、arm64 分支落入自身重定位区间、Python 绑定 `attach()` 的 `linker_notifier_offsets` 与远程设备证书选项失效等问题。

## Frida 17.17.0 Released

release

This is a big release with lots of bare-metal goodness. The Barebone agent— written in Rust and embedding the GumJS devkit—previously supported only XNU. It can now also run in the Linux kernel, where a small C shim provides the kernel glue.

The agent is packaged as a `.ko`: load it with `insmod`, then exchange length-prefixed GVariant messages through `/dev/frida`. Configure the Barebone backend to use this transport, and run `frida-server --device=barebone` on the device. Here it is running on my Pixel 6 Pro:

![linux-kernel](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ed1d2468df7d5730.png "Linux kernel")

## Build the module for your device

The release page has a GumJS devkit for the `none-arm64-softfloat` target. You do not have to build Gum yourself. The steps below make a `frida-agent.ko` for a Pixel 6 Pro. Other arm64 Linux systems use the same steps with a different kernel.

Do the build on an x86-64 Linux host. The kernel build tree contains x86-64 programs.

1.  Install the tools:
    
    ```
    sudo apt-get install build-essential clang binutils-aarch64-linux-gnu
    rustup target add aarch64-unknown-none
    rustup component add rust-src
    ```
    
    Your clang must be version 19 or newer. GCC does not implement the soft-float ABI.
    
2.  Download the source:
    
    ```bash
    git clone --recurse-submodules https://github.com/frida/frida-core.git
    cd frida-core
    ```
    
3.  Download the devkit:
    
    ```bash
    version=17.17.0
    base=https://github.com/frida/frida/releases/download/$version
    curl -LO $base/frida-gumjs-devkit-$version-none-arm64-softfloat.tar.xz
    mkdir -p ~/gumjs-devkit
    tar -C ~/gumjs-devkit -xf frida-gumjs-devkit-$version-none-arm64-softfloat.tar.xz
    ```
    
4.  Download the SDK:
    
    ```
    releng/deps.py sync sdk none-arm64-softfloat_nopic ~/sdk-none-arm64-softfloat_nopic
    ```
    
    The SDK contains picolibc and the compiler-rt builtins. The devkit needs them.
    
5.  Read the kernel version from the device:
    
    ```
    adb shell uname -r
    6.1.145-android14-11-gc1de4747ac59-ab14219743
    ```
    
    The name ends with the GKI commit and the build number. Here the commit is `c1de4747ac59`. The build number is `14219743`.
    
6.  Download the kernel files:
    
    ```bash
    commit=c1de4747ac59
    build=14219743
    ci=https://ci.android.com/builds/submitted/$build/kernel_aarch64/latest/raw
    mkdir -p ~/kernel-prepared ~/kernel-source
    curl -sSL $ci/modules_prepare_outdir.tar.gz | tar -xz -C ~/kernel-prepared
    curl -sSL $ci/kernel_aarch64_Module.symvers -o ~/kernel-prepared/Module.symvers
    curl -sSL https://android.googlesource.com/kernel/common/+archive/$commit.tar.gz \
        | tar -xz -C ~/kernel-source
    ```
    
7.  Build the module:
    
    ```bash
    make -C src/barebone/agent/linux \
        FRIDA_SDK=$HOME/sdk-none-arm64-softfloat_nopic \
        GUMJS_DEVKIT_DIR=$HOME/gumjs-devkit \
        AGENT_LD=aarch64-linux-gnu-ld \
        AGENT_AR=aarch64-linux-gnu-ar \
        AGENT_NM=aarch64-linux-gnu-nm \
        AGENT_OBJCOPY=aarch64-linux-gnu-objcopy \
        KDIR=$HOME/kernel-source \
        KOUT=$HOME/kernel-prepared \
        LLVM=1
    ```
    
8.  Load the module:
    
    ```swift
    adb push src/barebone/agent/linux/frida-agent.ko /data/local/tmp/
    adb shell su -c 'insmod /data/local/tmp/frida-agent.ko'
    ```
    

The module loads only on the kernel build that you made it for. The kernel compares the version string exactly. A different build of the same kernel branch does not work.

For more information, read the [module README](https://github.com/frida/frida-core/blob/main/src/barebone/agent/linux/README.md).

Full changelog:

-   gumjs: Fix a detach hang when a native fault inside JS is recovered by a later handler. We now rebalance the Interceptor transaction when the thread survives, instead of ending it twice. Kudos to [@pandasauce](https://github.com/pandasauce) for reporting the issue and helping track it down.
-   arm64: Detect branches into the range being relocated, preventing Interceptor from rewriting a branch so that it lands in the middle of its own redirect patch. Thanks to [@WHW0x455](https://github.com/WHW0x455) for this fix.
-   python: Fix the `linker_notifier_offsets` keyword argument to `attach()`, restore the default port for `Script.enable_debugger()`, and reinstate marshalling of certificate options for remote devices and related APIs.
-   barebone: Add support for running the agent as a Linux kernel module. The agent now starts inside the target as a `.ko`, exposes a character device for transport, and can be reached through a regular `frida-server --device=barebone` instance.
-   deps: Add a soft-float bare-metal SDK comprising picolibc and compiler-rt. This gives the `none-arm64-softfloat` flavour a libc and runtime that agree on passing floating-point values through general-purpose registers.
-   deps: Build the soft-float SDK in CI, check for published bundles before spending time installing a toolchain, keep libc headers out of devkit headers, use the SDK as the sysroot, and ensure configure-time link checks resolve libc correctly.
-   deps: Bump GLib, libffi, and QuickJS for freestanding fixes, vector assembler directive fixes, the precedence-climbing parser, and the corresponding x18 fix.
-   arm64: Avoid FP and SIMD code on soft-float targets by using scalar fallbacks for `memcpy`, pointer scanning, and Interceptor’s register shuffling.
-   gumjs: Bound the QuickJS stack on bare metal, re-enabling its stack check so the parser stops before exhausting the small stacks such hosts may provide.
