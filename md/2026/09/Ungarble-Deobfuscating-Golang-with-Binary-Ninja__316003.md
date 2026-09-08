---
title: "Ungarble: Deobfuscating Golang with Binary Ninja"
source: https://invokere.com/posts/2025/03/ungarble-deobfuscating-golang-with-binary-ninja/
source_host: invokere.com
clip_date: 2026-09-08T17:34:45+08:00
trace_id: ce7ea65a-7da8-46aa-8f73-3e4b6427e699
content_hash: 655871f46a5b0f2d3f6a7e02946484a16eeffed42a50f290dc38117b56fbfb7f
status: synced
tags:
  - 恶意样本
  - 模拟执行
series: null
feed_source: Invoke RE
ai_summary: 为应对 Garble 对 Golang 字符串字面量的编译期混淆，作者基于 Binary Ninja 开发 Ungarble 插件，通过识别 runtime.slicebytetostring 引用并模拟执行去混淆序列，批量恢复被混淆字符串。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3d575244-d011-81d7-bdff-fc0c63cf776e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 为应对 Garble 对 Golang 字符串字面量的编译期混淆，作者基于 Binary Ninja 开发 Ungarble 插件，通过识别 runtime.slicebytetostring 引用并模拟执行去混淆序列，批量恢复被混淆字符串。
> 
> - **Garble做法：** 包装 Go 编译器与链接器，用短 base64 哈希替换标识符、包路径、文件名等信息，删除构建信息、调试信息和符号表，并将所有字面量替换为运行时才能还原的混淆匿名函数。
> - **为何不重实现算法：** 混淆技术从 simpleObfuscator、swap、split、shuffle、seed 等选项中伪随机选取，先改写 AST 再编译，导致不同样本的解密序列差异大，难以逐一重写。
> - **识别策略：** 因符号名被混淆，无法直接按名字定位 runtime.slicebytetostring；作者以枚举基本块并递归遍历出边/入边的方式指纹定位该函数及其所有调用点，从而获得去混淆序列起止范围。
> - **模拟执行：** Ungarble 将捕获的指令序列交给 Binary Refinery 的 vstack（Unicorn 封装）模拟，并监控去混淆过程中向栈写入的局部变量数据，再通过 carve 提取可打印字符串，示例成功恢复 `reflect: call of`。
> - **当前限制：** 插件目前只支持 x86-64 PE 文件；未来计划扩展至其他位数/架构，并研究减少对 Binary Refinery 和“栈写入监测”的依赖。

## Overview

Golang is a third-generation language that has been adopted by malware authors and red team tool developers due to its ease of use, versatility, and ability to be compiled for multiple platforms and architectures. This has resulted in improvements in the Golang reverse engineering tooling ecosystem for platforms including [IDA](https://github.com/SentineLabs/AlphaGolang), [Ghidra](https://www.trellix.com/en-ca/blogs/research/no-symbols-no-problem/) and [Binary Ninja](https://github.com/PistonMiner/binaryninja-go-callconv). Platform independent tools have also been developed, such as [GoResym](https://github.com/mandiant/GoReSym). Despite these improvements, countermeasures have been developed to make reverse engineering Golang more difficult. One project implementing these countermeasures is called [Garble](https://github.com/burrowers/garble), which performs compile-time obfuscation of Golang code to inhibit analysis. This project came onto our radar because of its use by the [Sliver framework](https://github.com/BishopFox/sliver) and a number of malware variants. Because of this, we’ve written a Binary Ninja plugin called [Ungarble](https://github.com/Invoke-RE/ungarble_bn) to handle the Garble string literal obfuscation that will be discussed throughout this blog post.

## Garble

Garble’s stated purpose is to `produce a binary that works as well as a regular build, but that has as little information about the original source code as possible`. It wraps the calls to the Golang compiler and linker in order to replace useful identifiers, package paths, filenames, and position information with short base64 hashes; removes build information, module information, debugging information and symbol tables; and obfuscates literals (including strings). All literals are replaced with obfuscated anonymous functions, which are executed at runtime in order to recover the original literal to be used by the program.

### Example

As an example, here is a basic Golang program that prints a single string literal:

```go
package main

import (
	"fmt"
)

func main() {
	fmt.Println("Garble garble garble")
}
```

This program contains the literal `Garble garble garble` that is passed to the `fmt.Println` function to be shown to the user from `STDIN`. Compiling this results in the following decompilation in Binary Ninja’s Pseudo-C format:

```c
00498180    int64_t main.main(int64_t arg1, void* arg2 @ r14)

00498180    {
00498180        if (&__return_addr <= *(uint64_t*)((char*)arg2 + 0x10))
00498184        {
004981cc            runtime.morestack_noctxt.abi0();
004981cc            /* no return */
00498184        }
00498184        
00498195        void* const var_18 = &data_4a2180;
004981a1        void** const var_10 = &data_4e0578;
004981a6        os.Stdout;
004981cb        return fmt.Fprintln(&var_18, &go:itab.*os.File,io.Writer, 1, arg2);
00498180    }
```

In this instance, the global variable `&data_4e0578` is being assigned to `var_10` that references the string data being passed to `fmt.Fprintln`:

```c
004e0578  void* data_4e0578 = &data_4bccbe[0xab] {004bcd69} {"Garble garble garble"}
```

Compiling this example program with Garble and the `-literals` flag results in the following decompilation:

![images/blogs/garbled-example1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/68627b06f984c1cb.png)

Here you will notice two obfuscation techniques have been implemented. The first is the literal reference has been replaced with an inlined deobfuscation sequence that will recover the given string literal at runtime:

![images/blogs/garbled-example-loop1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/da15d8072dc2311d.png)

The literal’s ciphertext is copied to the destination address of `&var_2c` and the ciphertext is decrypted with a subtraction loop where each iteration subtracts a byte relative to `data_586c38[0x13]` from each given ciphertext byte. The second obfuscation technique is the function name `fmt.Fprintln` has been replaced with `bIMBbHa4o.PNmIGMWbqmF` making the decompilation much more difficult to read.

## Handling String Literal Obfuscation

Since string literals provide a large amount of information about a given function, we decided to attempt to resolve this part of the obfuscation first. With the given example, two approaches came to mind to resolve this particular form of obfuscation:

1.  Extract and emulate the given sequence in order to recover the original string literal
2.  Reimplement the obfuscation algorithm, extract the known inputs and recover the original string

Initially, our research focused on option 2. where we [attempted to use the IDA Hex-Rays API to recover values needed and implement a handler for the obfuscation method](https://www.youtube.com/watch?v=RtkHMWBz3R0). This, however, was not viable due to a number of deobfuscation techniques being pseudo-randomly chosen at compile time. The literal obfuscation [techniques are chosen from the following options](https://github.com/burrowers/garble/blob/cb83c50b13a30f83e3a2348f3cb151e3b20ea2e3/internal/literals/obfuscators.go#L22):

```fallback
    // Obfuscators contains all types which implement the obfuscator Interface
    Obfuscators = []obfuscator{
        simpleObfuscator,
        swap{},
        split{},
        shuffle{},
        seed{}, 
    }
```

The Golang abstract syntax tree (AST) for the code being obfuscated is matched against sequences targeted by Garble for obfuscation. The original literal is obfuscated with a chosen technique (from the interfaces above) and the original code is replaced with Golang code that is used to recover the original literal. Once all literals have been replaced, the Golang is compiled, which results in a binary containing solely obfuscated literals and their deobfuscation routines.

This can result in large obfuscation sequences that are difficult to reimplement for all given scenarios. Here is an example:

![images/blogs/advanced-sequence.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5cdc927d0d97a4a7.png)

Because of this, we ended up pursuing the capture and emulation of relevant sequences to recover each string literal instead of attempting to reimplement all deobfuscation scenarios.

## Sequence Identification, Capture and Emulation

For identification and capture of obfuscated sequences we opted to use Binary Ninja due to its powerful disassembler, decompilation via multiple intermediate languages (ILs) and Python API. Initially we were looking to identify deobfuscation sequences with their intermediate languages, however, the complexity of the obfuscated sequences resulted in a large number of timeouts when Binary Ninja attempted to lift functions containing these sequences. This resulted in the use of the disassembled instruction sequences and identifying calls to runtime functions in order to find the locations that the deobfuscation sequences begin and end.

### Leveraging Golang Built-in Functions

In the example above, you may notice that it ends with a call to `runtime.slicebytetostring`. This is a built-in runtime function that is used to turn deobfuscated bytes back into a string for use by the program. Because of this, we can identify a large amount of locations where string literals are deobfuscated with cross-references to this function.

#### Identification of runtime.slicebytetostring

Since function names are obfuscated within the Garbled binary, we cannot use its symbol name to identify the `runtime.slicebytetostring` function in order to acquire its cross-references. Therefore, we need to fingerprint this function’s call location in order to identify it across multiple compiled binaries and Golang versions.

In order to identify `runtime.slicebytetostring` we use a series of fingerprinting techniques within the disassembly throughout the Binary Ninja database to find candidate locations of obfuscation sequences. This is done by enumerating all basic blocks within all functions until the candidate pattern is discovered. Once discovered, the **outgoing** edges of the candidate basic block are recursively enumerated until a call sequence pattern to `runtime.slicebytetostring` is identified. An example of this is shown below:

![images/blogs/bb-traverse-ex.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2f6c4705d02a192b.png)

Once the `runtime.slicebytetostring` location has been identified, the cross-references to all callsites of `runtime.slicebytetostring` are acquired, and similar to the previous fingerprinting method, the **incoming** edges are recursively enumerated until the beginning of all obfuscation sequences are found.

#### Emulation of Captured Sequences with vstack

With the beginning and end sequences have been identified, we opted to use [Binary Refinery’s vstack unit](https://binref.github.io/units/formats/exe/vstack.html) to emulate instruction sequences. Big thanks to [Jesko Huttenhein](https://huettenhain.net/) for creating and maintaining this project. This is a wrapper for the Unicorn emulation engine that provides helper functions for mapping a Portable Executable into virtual memory and emulating a given set of addresses. Binary Refinery is commonly referred to as the command-line version of CyberChef. Here is an example of emulating a given sequence with the `vstack` Binary Refinery unit and carving a resulting string:

```bash
$ emit sample.bin | vstack -v -a=x64 -s=0x00462af2 0x0046286a | carve printable -n 5
(20:55:14) comment in vstack: [wait=02] [depth=0] 0x000000000046286E: 0xFFFFFFFFFFFDFFF8 <- 0000FEFFFFFFFFFF ........ (ignored: stack address)
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462882: 0xFFFFFFFFFFFDFFD6 <- CCD2F271AFB7BC99 ...q....
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462891: 0xFFFFFFFFFFFDFFD8 <- F271AFB7BC99548A .q....T.
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x00000000004628A0: 0xFFFFFFFFFFFDFFE0 <- 65CB86E9AADED4F8 e.......
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x00000000004628AF: 0xFFFFFFFFFFFDFFE8 <- 65B59B13F5AB0F6C e......l
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x00000000004628BE: 0xFFFFFFFFFFFDFFF0 <- 950575DF93529E73 ..u..R.s
-snip-
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x000000000046292A: 0xFFFFFFFFFFFDFFC3 <- 0F______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462935: 0xFFFFFFFFFFFDFFC2 <- 86______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462940: 0xFFFFFFFFFFFDFFC1 <- BC______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x000000000046294B: 0xFFFFFFFFFFFDFFC0 <- CC______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462956: 0xFFFFFFFFFFFDFFBF <- 71______________ q_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462961: 0xFFFFFFFFFFFDFFBE <- 99______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x000000000046296C: 0xFFFFFFFFFFFDFFBD <- 54______________ T_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462977: 0xFFFFFFFFFFFDFFBC <- 8A______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462982: 0xFFFFFFFFFFFDFFBB <- 65______________ e_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x000000000046298D: 0xFFFFFFFFFFFDFFBA <- CB______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462998: 0xFFFFFFFFFFFDFFB9 <- E9______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x00000000004629A3: 0xFFFFFFFFFFFDFFB8 <- AA______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x00000000004629AE: 0xFFFFFFFFFFFDFFB7 <- D4______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x00000000004629B9: 0xFFFFFFFFFFFDFFB6 <- B5______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x00000000004629C4: 0xFFFFFFFFFFFDFFB5 <- F5______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x00000000004629CF: 0xFFFFFFFFFFFDFFB4 <- AB______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x00000000004629DA: 0xFFFFFFFFFFFDFFB3 <- 95______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x00000000004629E5: 0xFFFFFFFFFFFDFFB2 <- 05______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x00000000004629F0: 0xFFFFFFFFFFFDFFB1 <- 75______________ u_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x00000000004629FB: 0xFFFFFFFFFFFDFFB0 <- DF______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462A06: 0xFFFFFFFFFFFDFFC4 <- 72______________ r_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462A0D: 0xFFFFFFFFFFFDFFC5 <- 65______________ e_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462A15: 0xFFFFFFFFFFFDFFC6 <- 66______________ f_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462A1C: 0xFFFFFFFFFFFDFFC7 <- 6C______________ l_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462A26: 0xFFFFFFFFFFFDFFC8 <- 65______________ e_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462A2C: 0xFFFFFFFFFFFDFFC9 <- 63______________ c_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462A37: 0xFFFFFFFFFFFDFFCA <- 74______________ t_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462A47: 0xFFFFFFFFFFFDFFCB <- 3A______________ :_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462A57: 0xFFFFFFFFFFFDFFCC <- 20______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462A67: 0xFFFFFFFFFFFDFFCD <- 63______________ c_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462A77: 0xFFFFFFFFFFFDFFCE <- 61______________ a_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462A87: 0xFFFFFFFFFFFDFFCF <- 6C______________ l_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462A93: 0xFFFFFFFFFFFDFFD0 <- 6C______________ l_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462AA3: 0xFFFFFFFFFFFDFFD1 <- 20______________ ._______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462AB3: 0xFFFFFFFFFFFDFFD2 <- 6F______________ o_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462AC3: 0xFFFFFFFFFFFDFFD3 <- 66______________ f_______
(20:55:14) comment in vstack: [wait=00] [depth=0] 0x0000000000462AD3: 0xFFFFFFFFFFFDFFD4 <- 20______________ ._______
-snip-
(20:55:14) comment in vstack: memory patch at 0xFFFFFFFFFFFDFFA8 of size 80
`reflect: call of`
```

vstack will monitor stack write operations during instruction emulation. Stack writes are performed during Garble’s deobfuscation routines, due to the obfuscated string literals being local variables. The example command reads the `sample.bin` file from disk with the `emit` unit, pipes the data to the `vstack` unit that is provided a start (`0x0046286a`) and end `0x00462af2` address to emulate. The `vstack` unit outputs data each time a stack write occurs while the deobfuscation instructions are emulated. The resulting data is piped to the `carve` unit that will attempt to recover strings over 5 characters long with the `-l 5` parameter. In this example, the emulated instructions result in the deobfuscated string of `reflect: call of`.

## Enter Ungarble

We’ve implemented all of this research into a Binary Ninja plugin called [Ungarble](https://github.com/Invoke-RE/ungarble_bn). The plugin provides a pane to navigate to identified obfuscation sequence addresses, deobfuscate sequences one-by-one and deobfuscate them in bulk. A demonstration of Ungarble can be found below:

![images/blogs/bb-traverse-ex.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b64c1a0cf3b0f82a.gif)

We put in a large amount of effort to make all actions background tasks that will not block the main thread of Binary Ninja, as well as signaling within the UI objects to populate the UI as strings are deobfuscated. If you are interested in the development of this project, the recording of our live stream can be found below:

## Off By One Security Stream

We featured this research on an Off By One Security stream that took place on March 14 2025. The stream can be found here:

## Limitations and Future Work

Currently Ungarble only supports x86-64 Portable Executables. We’d like to expand this to support x86 binaries and potentially other architectures. Due to its ability to handle multiple architectures, we’d like to continue researching the use of ILs within Binary Ninja. It is possible to set timeouts for analyzed functions, so this may be one approach. We’d also like to look into writing a smaller wrapper and not being dependent on Binary Refinery (despite it being extremely useful) and be less dependent on stack-writes to capture strings (as this is being passed as a pointer to `runtime.slicebytetostring`).

## Conclusion

Despite obfuscators being developed for third-generation languages such as Golang, we can exploit language-dependent structures and calls to runtime functions needed by the language to identify obfuscated patterns and recover information.

## Acknowledgements

Many folks have been working on this problem due to its use by multiple malware variants. This includes Sergei Frankoff from OALabs, who previously looked at Garble from its use by [Bandit Stealer](https://research.openanalysis.net/bandit/stealer/garble/go/obfuscation/2023/07/31/bandit-garble.html), Michael Gorelik who wrote a Garble deobfuscator for IDA to assist [with the analysis of the RansomHub ransomware](https://github.com/smgorelik/RansomHub_Deobfuscator/tree/main) and Chuong Dong from Google Cloud’s FLARE team who released a [blog on the Garble](https://cloud.google.com/blog/topics/threat-intelligence/gostringungarbler-deobfuscating-strings-in-garbled-binaries) along with the [gostringungarbler](https://github.com/mandiant/gostringungarbler) tool for IDA and a standalone Python script to replace obfuscated literals with their original strings.

## Interested in learning malware analysis?

Check out our training courses today

[Training Courses](https://training.invokere.com/)
