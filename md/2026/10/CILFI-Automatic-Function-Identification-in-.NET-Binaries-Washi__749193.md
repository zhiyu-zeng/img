---
title: "CILFI: Automatic Function Identification in .NET Binaries | Washi"
source: https://blog.washi.dev/posts/cilfi/
source_host: blog.washi.dev
clip_date: 2026-10-01T10:23:53+08:00
trace_id: 39a92f72-2ba3-49ef-b394-682ed2dc2be8
content_hash: d47712c1de5a32e778b7b63eaac950d96d299e5ba209600b65df0d78eff26f43
status: synced
tags:
  - .NET逆向
  - 安全工具
series: null
feed_source: Washi·.NET逆向
ai_summary: CILFI 定义了一套可直接粘贴反编译文本的 CIL 模式匹配语言，用于在 .NET 二进制中自动定位字符串解密、VM opcode handler、反调试初始化等关键函数，替代易碎的手写匹配代码。
ai_summary_style: key-points:weak
images_status:
  total: 35
  succeeded: 35
  failed_urls: []
notion_page_id: 3ec75244-d011-8159-9788-dc45f462c7a3
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> CILFI 定义了一套可直接粘贴反编译文本的 CIL 模式匹配语言，用于在 .NET 二进制中自动定位字符串解密、VM opcode handler、反调试初始化等关键函数，替代易碎的手写匹配代码。
> 
> - **要解决的问题：** 为 .NET 去混淆器/配置提取器定位同一类关键函数时，重复编写由大量 if、循环组成的模式匹配代码既耗时又难维护，且现有方案要么冗长要么过于脆弱。
> - **设计取舍：** 以反汇编器输出的原始 CIL 文本为输入（而非 Cecil/dnlib/AsmResolver 对象模型），目标是让 Ctrl+C/Ctrl+V 复制的方法体直接成为合法签名；通过 ANTLR 重写 CIL 文法以支持自定义语法。
> - **匹配语法：** 任意语法元素可写 `??` 通配符，操作数支持 OR 式多值候选，并支持在单个操作数上使用正则（如匹配十六进制、Base64、URL、IP），兼顾紧凑与精确。
> - **等价归一化：** 引擎在比对前自动把宏指令展开为完整形式（如 `ldc.i4.0` 与 `ldc.i4 0`），避免因混淆器不做体积优化而逐条枚举变体。
> - **结构与组合：** `.block` 指令只匹配方法体内的指令子序列，并可在块之上定义布尔条件，类似 YARA 的 condition，用于描述同一逻辑的多种实现。
> - **产出形态：** 提供 NativeAOT 无依赖的命令行工具、可复用库和 VS Code 扩展（高亮/补全）；支持输出匹配到的具体指令，也可输出 JSON 以接入非 C# 的处理流水线（如生成 OldRod 配置）；示例签名可识别 KoiVM 的 83 个 opcode handler。

There is a specific stage of grief every.NET reverse-engineer goes through when writing the next.NET deobfuscator or config extractor. It is the realization you have to write *yet another ugly pattern-matching algorithm* to find the exact same string decryptor, VM opcode handler, or C2 connection initializer functions to extract obfuscator configurations or IoCs.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e57f3d07e898bcb7.jpg)](https://blog.washi.dev/assets/img/posts/cilfi/meme.jpg)

I got sick of it.

I wanted a CIL pattern-matching tool that is very precise, robust against adversary trickery, and yet so simple that creating a signature is a matter of seconds. But none of the solutions I found on the internet were satisfactory to me.

So, naturally, instead of continuing to suffer, I built a custom language and engine to solve it once and for all.

Meet **CILFI**, an intuitive function identification tool targeting the Common Intermediate Language (CIL):

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/321f1e89e76c055c.png)](https://blog.washi.dev/assets/img/posts/cilfi/cilfi-koivm.png) *CILFI: An intuitive pattern matching tool for quickly identifying methods in a.NET binary.*

## The problem

When writing deobfuscators or config extractors for.NET binaries, one of the first steps is to look for important functions and extracting data from them. This may include for example string decryption routines you are targeting, anti-debug protection initializers you want to remove, opcode handlers of a virtual machine you want to infer the byte instruction encoding for, or start-up routines that set up connections to a C2.

If you are a bit experienced with reading obfuscated code, you can usually eyeball pretty quickly in a decompiler which functions are responsible for this plumbing:

-   String decrypters always return strings and usually contain some calls or opcodes related to cryptography (e.g., XORs, Base64 conversion calls, etc.).

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f336f468f2236423.png)](https://blog.washi.dev/assets/img/posts/cilfi/dnSpy01_light.png) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b90480611ed0bbaf.png)](https://blog.washi.dev/assets/img/posts/cilfi/dnSpy01_dark.png) *Example string decryptor function.*

-   Virtual machine opcode handlers often operate on virtual registers or a virtual stack, and surround them with instructions that are characteristic of basic operations (e.g., addition, subtraction, multiplication, calls).

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a83c859e4d4ba0d7.png)](https://blog.washi.dev/assets/img/posts/cilfi/dnSpy03_light.png) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fc89fe717e2627cc.png)](https://blog.washi.dev/assets/img/posts/cilfi/dnSpy03_dark.png) *Example KoiVM virtual machine opcode handler.*

You can note down their metadata tokens, and give them to your deobfuscator or extractor of choice, but when you have many samples that are all protected by the same obfuscator, doing this manually becomes annoying really quickly. Preferably, this type of grunt work should be automated as much as possible. Typically, this means you need to write some code that looks for known patterns in the CIL to distinguish it from the obfuscated user code.

And if you ask me, this is a huge pain…

## Writing pattern-matching code sucks

I am pretty sure I share this annoyance with many others in the (.NET) reversing world.

I hate writing pattern-matching code.

It is not necessary difficult, it is just really tedious.

It takes a lot of ugly (often very flaky) code with many if statements, loops and accounting for the many variations code can take. It can be very time-consuming until you get it to a place where you are happy with it. Frankly, it is just not the interesting part of writing a deobfuscator. If anything, it is more of a boring, necessary annoyance that you just need to get through to get the ball rolling.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/049f114a8be4ce35.gif)](https://blog.washi.dev/assets/img/posts/cilfi/matching_light.gif) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c4f0c11afdd3b5df.gif)](https://blog.washi.dev/assets/img/posts/cilfi/matching_dark.gif) *I need all this to find a single method?*

None of the solutions that I have found on the web could satisfy my gripes. They always are either too verbose, hard to understand / maintain, or are too flaky to be used in a real adversary setting where binaries are actively trying to screw you over as an analyst.

Time to fix that.

## Let’s write a usable pattern-matching engine

My goals for this are pretty straightforward:

-   **It needs to be robust:** No over-reliance on string carving and matching, and no non-determinism that you get with AI. I want a fast, deterministic tool that Just Works™ and will always Just Work™, not just when it feels like it.
-   **It needs to be precise:** If, for whatever reason, I want to find methods that make calls to a generic class with two type parameters, take in an array, and return a value typed object, I should be able to express this oddly-specific query with no problem.
-   **It needs to be generalizable:** I don’t want to match code in one binary only. To account for possible variations code may have across samples, pattern-matching syntax similar to regular expressions and wildcards are a must.
-   **It needs to be dead simple:** This is the most important requirement. As I said before, I hate writing code for pattern-matching. The less time I have to spend on it, the better. The process of creating a signature should thus be as frictionless as possible.

As far as I know, none of the normal programming languages can check all these boxes at the same time.

Perhaps the naive route would be to dump the entire disassembly to a file and start string grepping and/or use regular expressions, but this would hamper robustness. Furthermore, big regular expressions are notoriously hard to understand once written down and are very difficult to debug.

We can try to be clever with modern programming language constructs like C#’s or Python’s operator overloading and pattern-matching, but this only gets you so far and would still introduce a lot of friction to translate CIL code as seen in a decompiler to a different programming language.

We don’t need to be married to existing solutions or programming languages, however. So let’s just make a new one!

## Designing the language

How would we go about designing such a language?

### Disassembly as input

The source of all truth in a.NET binary is the CIL code that the binary contains. As such, any pattern-matching will have to be done on this level.

To make things as frictionless as possible all the way from raw code read in the disassembler to ready-to-deploy pattern-matching signature, our starting point should therefore be the disassembler’s output. And when I say that, I literally mean the **raw textual representation of the CIL code that makes up the method** that is produced by the tool. No fancy object models that libraries like Cecil, dnlib, or AsmResolver provide – the typical reverser does not spend time programming these libraries directly when analyzing binaries anyway (and they shouldn’t!). Instead, they are browsing decompiler code in a friendly UI and reading text from it. Therefore, ideally, **a reverser should be able to copy/paste the textual code produced by the disassembler and it should be a valid signature already.**

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/470b6e1d4c602bae.gif)](https://blog.washi.dev/assets/img/posts/cilfi/dnSpy04_light.gif) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/750ecab9566d9bee.gif)](https://blog.washi.dev/assets/img/posts/cilfi/dnSpy04_dark.gif) *Starting a new signature should be as easy as Ctrl+C and Ctrl+V*

With that in mind, this means our pattern-matching tool needs to parse the CIL grammar and make sense of it. To my knowledge (at least by the time writing this post), there exist no standalone, open-source CIL grammars that is also easily extensible/hackable. So I grabbed [ANTLR](https://www.antlr.org/), a widely used parser generator that I have used before in the past, and [painstakingly redefined the CIL grammar](https://github.com/Washi1337/cilfi/blob/main/src/CilFi.Core/Compiler/CilFiSignature.g4) with all its intricate details and edge-cases.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7d9b16022d32a1ab.png)](https://blog.washi.dev/assets/img/posts/cilfi/grammar_light.png) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8b4817dcd7f98f26.png)](https://blog.washi.dev/assets/img/posts/cilfi/grammar_dark.png) *Part of a CIL Grammar, implemented in ANTLR*

> By the time writing of this, this grammar does not implement all features of CIL. Only a subset that would allow for basic method and code matching is included.

### Adding pattern-matching syntax

As time-consuming as defining our own grammar is, it does give us a lot of benefits. In particular, when we fully own the grammar, it is incredibly easy to add extra custom syntax to any non-terminal we want.

For example, for every type of syntax element we can add an alternative token `??` to indicate a wildcard.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2f0c1814421acd2a.png)](https://blog.washi.dev/assets/img/posts/cilfi/grammar01_light.png) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f16fecc289460c4a.png)](https://blog.washi.dev/assets/img/posts/cilfi/grammar01_dark.png) *Adding wildcards to operands*

This allows for a really intuitive workflow, where you start by copying some raw CIL code, and replace all the specific identifiers and references with `??` tokens:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0d110b8061d40066.gif)](https://blog.washi.dev/assets/img/posts/cilfi/wildcards_light.gif) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ad15bab82d5c1736.gif)](https://blog.washi.dev/assets/img/posts/cilfi/wildcards_dark.gif) *Replacing specific identifers with wildcard tokens.*

Sometimes we actually know concrete values for all possible operands. We can add these `OR` -like patterns easily by just introducing a few extra grammar rules:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/70256bff75e517c0.png)](https://blog.washi.dev/assets/img/posts/cilfi/grammar02_light.png) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f2fccc44b8a6417b.png)](https://blog.washi.dev/assets/img/posts/cilfi/grammar02_dark.png) *Adding wildcards to operands*

Now we can match on multiple, concrete operands:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b3ab26c3b0c26826.png)](https://blog.washi.dev/assets/img/posts/cilfi/options_light.png) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/207646b8d3a60d7d.png)](https://blog.washi.dev/assets/img/posts/cilfi/options_dark.png) *Replacing operands with options.*

Finally, if we are looking for specific string operands that have a certain shape to them (e.g., base64, hexadecimal, a URL, IP address), we often use regular expressions. I know I said earlier that regular expressions are notoriously hard to understand. However, when used in a very precise and local setting (such as matching individual operands), I think their compactness and flexibility vastly outweigh their flaws:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8630243a41548e01.png)](https://blog.washi.dev/assets/img/posts/cilfi/grammar03_light.png) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/90c72b2c59f44f6b.png)](https://blog.washi.dev/assets/img/posts/cilfi/grammar03_dark.png) *Adding regular expression support.*

This extra grammar rule allows us to do exactly that:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ead54e0a51ac9a14.png)](https://blog.washi.dev/assets/img/posts/cilfi/regex_light.png) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4a3ca38851ba7657.png)](https://blog.washi.dev/assets/img/posts/cilfi/regex_dark.png) *A string matching hexadecimal syntax.*

### Automatic macro expansion

CIL defines a lot of opcodes that are shorthands for other opcodes. For example, the `ldc.i4.0` macro pushes the integer `0` on the stack and takes only 1 byte in the code stream, while `ldc.i4 0` is semantically equivalent but takes 5 bytes instead.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a0b9939032d698de.png)](https://blog.washi.dev/assets/img/posts/cilfi/macros01_light.png) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7528cbad3257d703.png)](https://blog.washi.dev/assets/img/posts/cilfi/macros01_dark.png) *Different CIL bodies, same behavior.*

A standard C# compiler always optimizes for CIL code size and will always optimize `ldc.i4 0` to `ldc.i4.0`. However, our threat model assumes adversary binaries where obfuscators can decide whatever they want to thwart automatic tooling. It is therefore not guaranteed we will always encounter the most optimized version of the code.

While we added pattern-matching syntax that allows for providing alternatives, you don’t want to end up describing these possible macro expansions or shortenings every time you encounter a `ldc.i4.*` instruction (i.e., `(ldc.i4.0 | ldc.i4.1 | ...)`). Therefore, I decided that the pattern-matching engine should automatically normalize them to their fully expanded form before doing the comparison.

### Code blocks and conditionals

Finally, it is not often the case that you are interested in the *entire* method body, but only want to look for the presence of specific instruction sub-sequences (e.g., a specific call and its arguments).

Hence, I added a new `.block` directive to do exactly that:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2f0749904a5ee919.png)](https://blog.washi.dev/assets/img/posts/cilfi/blocks01_light.png) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b6feb8a168883891.png)](https://blog.washi.dev/assets/img/posts/cilfi/blocks01_dark.png) *Code blocks.*

This also allows for boolean circuits to be defined on top of these defined blocks, which opens up for describing code that has multiple possible implementations (similar to a `condition` block in a [YARA](https://virustotal.github.io/yara/) rule):

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2ea6a3a6659c34d8.png)](https://blog.washi.dev/assets/img/posts/cilfi/blocks02_light.png) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0d720b92bb9ebc8c.png)](https://blog.washi.dev/assets/img/posts/cilfi/blocks02_dark.png) *Conditionals over blocks.*

## Putting it all together

All that is left is attaching a metadata backend to the new language, implementing the pattern-matching code, and building some infrastructure around it. I will spare you the details on that, it is pretty boring stuff.

I call the final product **CILFI (CIL Function Identification)**. Here is a walkthrough of a typical workflow using the command-line utility from start to finish:

To make creating signatures easier, I also hacked together a Visual Studio Code extension that adds some basic highlighting and autocompletion to the editor:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/26c89645439fe730.png)](https://blog.washi.dev/assets/img/posts/cilfi/extension_light.png) [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/137836f83e905bf7.png)](https://blog.washi.dev/assets/img/posts/cilfi/extension_dark.png) *Visual Studio Code extension.*

Using that extension, I wrote a bunch of signatures ([koivm-opcodes.cilfi](https://github.com/Washi1337/cilfi/blob/main/examples/koivm-opcodes.cilfi)) that can find all the 83 different opcode handlers defined by the [KoiVM](https://github.com/yck1509/KoiVM/tree/master/KoiVM.Runtime/OpCodes) obfuscator:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/321f1e89e76c055c.png)](https://blog.washi.dev/assets/img/posts/cilfi/cilfi-koivm.png) *Using CILFI to extract opcode handlers from KoiVM samples.*

You can also instruct it to print exactly the instructions that were matched according to the signature:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6448be95871cf7df.png)](https://blog.washi.dev/assets/img/posts/cilfi/cilfi-koivm2.png) *Using CILFI to extract opcode handlers from KoiVM samples.*

Finally, the command-line utility can be instructed to output JSON instead of flat text. This makes it suitable for assembly processing pipelines that do not use C# or AsmResolver as their main platform (e.g., for generating [OldRod configurations](https://github.com/Washi1337/OldRod/blob/master/doc/example-config.json)):

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5d175f8fa8c748c8.png)](https://blog.washi.dev/assets/img/posts/cilfi/json.png) *JSON output*

## Final words

Pattern-matching code is an annoying but often necessary step when trying to build.NET deobfuscation tooling. It is time-consuming, tricky to get right, and just not really interesting compared to the actual deobfuscation logic.

CILFI was born out of pure frustration, but it has saved me countless hours of manual grunt work. If you are interested, give it a test drive yourself. CILFI can be used as a standalone command-line utility (i.e., NativeAOT compatible with no dependencies), or as a reusable library for your own projects:

Happy hacking!
