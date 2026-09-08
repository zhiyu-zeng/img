---
title: ‘Reflections on Trusting Trust’, but completely by accident this time | secret club
source: https://secret.club/2024/10/21/unnecessarily-exhaustice-rca.html
source_host: secret.club
clip_date: 2026-09-09T01:14:29+08:00
trace_id: b7a2a72a-1461-4fa3-bba5-aa93250aa1d7
content_hash: 6ac5a60ecc205984f129a5806665e666a2aeea42f49e6e7057c9811bb414ca43
status: synced
tags:
  - LLVM
  - 编译器误编译
series: null
feed_source: null
ai_summary: LLVM 误编译 bug 被完整定位：stage2 Clang 的循环向量化器为多宽度向量循环生成了错误的 phi 常量，导致 SelectionDAG::getVectorShuffle 把非恒等 shuffle 误判为恒等，从而让编译器自身产出错误汇编。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3d575244-d011-8176-a045-ff717ef12186
ioc:
  cves: []
  cwes: []
  hashes:
    - b8dd73117741b08fddb6065fb9289f861f9375b63ebab3ee67edf547ecb0c17a
    - cf9f89efb0549051409d2559441404b1e627c73f11e763c975be20fcd7fcda34
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> LLVM 误编译 bug 被完整定位：stage2 Clang 的循环向量化器为多宽度向量循环生成了错误的 phi 常量，导致 SelectionDAG::getVectorShuffle 把非恒等 shuffle 误判为恒等，从而让编译器自身产出错误汇编。
> 
> - **复现条件：** 需先以引入问题的 commit（bug 修复前）构建 stage1 Clang，再以该 Clang 构建 AArch64 目标的 stage2 Clang；随后用 ASAN + fuzzer harness 编译最小化 repro 才触发，X86、WSL2、不同 libstdc++ 下均无法复现。
> - **根因机制：** 向量化器为循环生成 16 宽、8 宽及标量回退多条循环路径；当 16 宽循环结束后跳过 8 宽循环、直接进入标量循环时，控制流把代表比较结果的 phi 节点恒定设为 true，16 宽循环中已计算出的错误结果被忽略。
> - **关键数据点：** 触发问题要求运行时总迭代次数为 17–23；错误 shuffle 掩码长度为 20（由 5 元素源向量拼接扩展而来），末尾填充多个 -1，导致 Identity 判断错误地返回真。
> - **调试方法：** 作者将 Clang 交叉编译到 AArch64 并在 qemu-aarch64 下运行，配合 `-print-after=loop-vectorize` 和 `-ir-dump-directory` 产出约 1.6MB 的 IR diff，再通过加 printf 和增加 volatile 禁止向量化验证假设，最终锁定到 `SelectionDAG::getVectorShuffle`。
> - **额外收获：** 排查过程中作者发现并提交修复了 `-filter-print-funcs` 与 `-ir-dump-directory` 组合使用时 LLVM 崩溃的问题。

> Compilers are complicated. You just won’t believe how vastly, hugely, mind-bogglingly complicated they are. I mean, you may think C build systems are painful, but they’re just peanuts to compilers.
> 
> \- Douglas Adams, probably

This blog post assumes you have some knowledge of LLVM internals - I’ll try to fill in some of the lesser-known gaps but there are likely some other, better resources out there for learning about that.

I have only one [other post](https://secret.club/2021/04/09/std-clamp.html) on this blog at the time of writing. It describes a somewhat boring, easily-explained missed optimization in one of the core components of LLVM with some actual, real-world implications. This blog post, although it follows roughly the same format, is the exact opposite:

## An exhaustive analysis of a miscompilation that impacted basically no-one

## Introduction & disclaimer

Is *all* the complexity in modern-day optimizing compilers warranted? Probably not.

Take [LLVM](https://llvm.org/), for example - once you get to the backends it might as well be 200 compilers in a trench coat. Picture this: it’s two in the morning and you’ve figured out exactly what went wrong after several weeks of debugging. You’re on your fifth coffee and have an idea for a target-independent patch. There’s just one small problem - you’d have to reach out to other overworked people from other companies, convince them that giving you some of their extremely limited time is worthwhile, wait for a bit, address any and all potential concerns, wait a bit more, and Lord help you if something breaks on a piece of hardware you don’t have access to.

Alternatively, you could just add another if statement, ping a coworker to fast-track code review since the change is restricted to your little `llvm/lib/Target` sandbox, and be on your merry way. Repeat a few times a day and now your Modular™ framework ends up with a bunch of duplicated, convoluted, unnecessarily target-dependent code generation logic.

Yes, quite a bit of the complexity is the result of [Conway’s Law](https://en.wikipedia.org/wiki/Conway%27s_law) and the inevitable bitrot of a decades-old codebase. That being said, there is still an incredible amount of inherent messiness when targeting dozens of architectures in a (mostly) correct and performant way. Nobody is ever going to have a full, deep view of the entire system at once, and even if they did it would be out of date by the next `Revert "[NFC] ..."` commit.

## Every computer on the planet is a compiler fuzzer

We tame the combinatorial explosion of potentially-buggy interactions through the kind of extraordinarily exhaustive testing only possible in the information age. Even a simple “Hello, world!” is a reliability test of the compiler, the linker, the runtime, the operating system, the terminal, any rendering middleware (which might **also** be running LLVM to compile shaders!), display drivers, the underlying hardware itself, and all software used in the process of building any of that. As such, you can be reasonably confident that release versions of production compilers, *when using the flags and target architectures everyone else does*, will *probably* not break anything. That’s not to say stuff doesn’t get through the cracks - [yarpgen](https://github.com/intel/yarpgen), [alive2](https://github.com/AliveToolkit/alive2), [Csmith](https://github.com/csmith-project/csmith), and similar tools would not have a long list of trophies otherwise - but those tools are also now just a part of this testing process too.

A direct corollary of this is that bugs are regularly introduced in mainline branches, even by seasoned developers, and fixed whenever this exhaustive testing happens ~~and people actually care about fixing them~~. Anyway, take a look at this commit:

[https://github.com/llvm/llvm-project/commit/c6e01627acf8591830ee1d211cff4d5388095f3d](https://github.com/llvm/llvm-project/commit/c6e01627acf8591830ee1d211cff4d5388095f3d)

It is extremely important to emphasize: This committer knows what they’re doing! They’re good at their job! It’s just the nature of compilers and `llvm-project/main`; shit happens. The miscompile was found and fixed in roughly a week, and if this is all there was to it then we wouldn’t be here.

## The funniest compiler bug

Here’s a bug.

[https://issues.chromium.org/issues/336399264](https://issues.chromium.org/issues/336399264)

As a summary, here’s what happened.

1.  Compile clang with the commit right before the fix above - This is generally called a “stage 1” build
2.  *Bootstrap clang with the newly-compiled clang* - This is a “stage 2” build
3.  Build the repro script attached *with ASAN and fuzzing harnesses on* when targeting AArch64
4.  Get a miscompile in the output.

Due to the Clang version being known-buggy and swapped out pretty much immediately, the stage 2 miscompile was noticed by pretty much nobody except people employed at companies that pay them to look at this stuff. This is the system working as intended! Unfortunately, I am a complete sucker for bugs like this but do not get paid to look at them. I wanted to figure out what went wrong here because it’s such a great example of the emergent complexity that comes with modern-day compilers.

*hear that? it’s the sound of my free time going down the drain for the next week. fwsssssssshhhhhhhhhhhhhhhhhhhhhhhh*

There’s some good news: this is a bug in the loop vectorizer, meaning our stage2 compiler is *probably* not going to be broken in the impossible-to-debug some-target-specific-register-allocation-thing-is-cooked-somehow way. That may not always be the case (especially if `undef` / `poison` are involved) but it seems like we’re going to get a nice, deterministic problem in the mostly-sorta-target-independent part of the pipeline.

Unfortunately, there is also some bad news: this is a bug in the loop vectorizer. The vectorizer is probably the single most per-target-tuned pass in the entirety of the generic optimization pipeline. That means we’re probably going to have some trouble convincing the compiler to deliberately emit the wrong instruction sequence on platforms without cross-compiling. Cross-compiling is not fun. I do not want to cross-compile, so I would like to try to coax the compiler into emitting the right (wrong?) code on X86 if possible.

*Foreshadowing is a narrative device in which-*

## Reproducing the bug with somewhat-helpful debugging information

For now, it’s important to just reproduce the original bug with the aforementioned stage1/stage2 executables in exact the same build environment. While we’re at it, let’s tack on some useful debugging options that will hopefully help us down the line:

1.  `-print-after=loop-vectorize` lets us print out a textual dump of the IR whenever the loop vectorizer pass has finished
2.  `-ir-dump-directory` lets us redirect this output to a folder somewhere This is going to generate a *lot* of text files. That’s okay, though, because computers are really fast and it doesn’t impact the build times in any meaningful way if we use an SSD.

Simply run this easy-to-remember set of CMake incantations for the stage1 and stage2 builds:

```bash
LLVM_DIR=$(pwd)

cmake -S llvm -B build/stage1 -G Ninja -DCMAKE_BUILD_TYPE=Release -DLLVM_ENABLE_PROJECTS=clang -DLLVM_TARGETS_TO_BUILD=AArch64
cmake --build build/stage1

cmake -S llvm -B build/stage2 -G Ninja -DCMAKE_BUILD_TYPE=Release -DLLVM_ENABLE_PROJECTS=clang -DLLVM_TARGETS_TO_BUILD=AArch64 -DCMAKE_C_COMPILER="$(realpath build/stage1/bin)/clang" -DCMAKE_CXX_COMPILER="$(realpath build/stage1/bin)/clang++" -DCMAKE_C_FLAGS="-mllvm -print-after=loop-vectorize -mllvm -ir-dump-directory=$LLVM_DIR/build/stage2/ir_dump" -DCMAKE_CXX_FLAGS="-mllvm -print-after=loop-vectorize -mllvm -ir-dump-directory=$LLVM_DIR/build/stage2/ir_dump"
cmake --build build/stage2
```

Unfortunately, I do not have an Apple device – as such, I would like to thank an anonymous friend with an M3 laptop for taking the time to help me with this. Time to test.

```bash
$ ./build/stage1/bin/clang++ --target=arm64-apple-macos -O2 -fsanitize=fuzzer-no-link -fsanitize=address repro.cc -S -o - | sha256sum
b8dd73117741b08fddb6065fb9289f861f9375b63ebab3ee67edf547ecb0c17a  -

$ ./build/stage2/bin/clang++ --target=arm64-apple-macos -O2 -fsanitize=fuzzer-no-link -fsanitize=address repro.cc -S -o - | sha256sum
cf9f89efb0549051409d2559441404b1e627c73f11e763c975be20fcd7fcda34  -
```

Okay, we’ve successfully reproduced the bug! We’re not really interested in why this code specifically breaks at runtime - it’s just a minimized reproducer - we just wanted to make sure we could catch it *at all*. With a repro in hand, we immediately notice some funky changes:

*Output difference*

```yaml
<       .section        __TEXT,__literal16,16byte_literals
<       .p2align        4, 0x0                          ; -- Begin function _ZN3re28Compiler9PostVisitEPNS_6RegexpENS_4FragES3_PS3_i
< lCPI1_0:
<       .byte   255                             ; 0xff
<       .byte   255                             ; 0xff
<       .byte   255                             ; 0xff
<       .byte   255                             ; 0xff
<       .byte   255                             ; 0xff
<       .byte   255                             ; 0xff
<       .byte   255                             ; 0xff
<       .byte   255                             ; 0xff
<       .byte   8                               ; 0x8
<       .byte   9                               ; 0x9
<       .byte   10                              ; 0xa
<       .byte   11                              ; 0xb
<       .byte   12                              ; 0xc
<       .byte   255                             ; 0xff
<       .byte   255                             ; 0xff
<       .byte   255                             ; 0xff
< lCPI1_1:
<       .byte   16                              ; 0x10
<       .byte   17                              ; 0x11
<       .byte   18                              ; 0x12
<       .byte   19                              ; 0x13
<       .byte   20                              ; 0x14
<       .byte   21                              ; 0x15
<       .byte   22                              ; 0x16
<       .byte   23                              ; 0x17
<       .byte   8                               ; 0x8
<       .byte   9                               ; 0x9
<       .byte   10                              ; 0xa
<       .byte   11                              ; 0xb
<       .byte   12                              ; 0xc
<       .byte   29                              ; 0x1d
<       .byte   30                              ; 0x1e
<       .byte   31                              ; 0x1f
<       .section        __TEXT,__text,regular,pure_instructions
<       .globl  __ZN3re28Compiler9PostVisitEPNS_6RegexpENS_4FragES3_PS3_i
---
>       .globl  __ZN3re28Compiler9PostVisitEPNS_6RegexpENS_4FragES3_PS3_i ; -- Begin function _ZN3re28Compiler9PostVisitEPNS_6RegexpENS_4FragES3_PS3_i
63,71c26,34
<       sub     sp, sp, #192

[...]

<       ldr     q0, [x8, lCPI1_1@PAGEOFF]
<       str     q0, [sp]                        ; 16-byte Folded Spill
<       adrp    x28, l___sancov_gen_.2@PAGE+5
<       add     x8, sp, #48
<       ld1.2d  { v1, v2 }, [x8]                ; 32-byte Folded Reload
---
>       mov     w22, #4                         ; =0x4
>       mov     w27, #2                         ; =0x2
>       movi.2d v0, #0000000000000000
>       mov.d   x8, v0[1]
>       str     x8, [sp]

[...]
```

Something quite fishy has happened here: we’ve lost a whole bunch of data that looks a lot like some sort of vector mask. Good to know!

Since we’re diagnosing a miscompile in the stage2 build of Clang, we should also grab a known-good version of the textual IR of the compiler in the meantime. This just involves running the same set of commands with the fixed (`Revert "..."`) commit. In the end, we have two sets of folders full of IR files, most of which are the same:

```bash
$ du -sh *
2.5G    ir_dump_bad
2.5G    ir_dump_good
```

All of this will be useful later; let’s table it for now and try to avoid using someone else’s computer, since nagging someone else to recompile LLVM constantly is painful for both parties.

## It gets better

Okay, now that we’ve successfully captured at least *some* debugging info, let’s try this the easy way first despite knowing full-well God is laughing his ass off. This would mean compiling on X86 Windows to X86 windows and testing. Ideally, I wouldn’t need to do anything weird to get it to work.

Ha, Nope. Same output in both cases.

Alright, let’s try WSL2. System-V is a bit closer to AAPCS and maybe there’s some weird ABI stuff going on.

```bash
# (on X86-64 via WSL)
$ ./build/stage1/bin/clang++ --target=arm64-apple-macos -O2 -fsanitize=fuzzer-no-link -fsanitize=address repro.cc -S -o - | sha256sum
b8dd73117741b08fddb6065fb9289f861f9375b63ebab3ee67edf547ecb0c17a  -

$ ./build/stage2/bin/clang++ --target=arm64-apple-macos -O2 -fsanitize=fuzzer-no-link -fsanitize=address repro.cc -S -o - | sha256sum
b8dd73117741b08fddb6065fb9289f861f9375b63ebab3ee67edf547ecb0c17a  -
```

Nope.

Maybe the STL is involved - some change between `libstdc++` and `libc++`.

```bash
$ ./build/stage2_lcxx/bin/clang++ --target=arm64-apple-macos -O2 -fsanitize=fuzzer-no-link -fsanitize=address repro.cc -S -o - | sha256sum
b8dd73117741b08fddb6065fb9289f861f9375b63ebab3ee67edf547ecb0c17a  -
```

Great. No taking the easy way out.

## Fuck it, just cross-compile the thing

*Alternate title: We live in a `/usr/include/hell-gnueabihfelmnop` of our own creation*

C build systems are not fun. One might go so far as to say they’re *really, really, really* not fun. This is true for a variety of reasons, but one painfully obvious example is cross-compilation. Here’s how you compile Clang to target AArch64 on Linux with the useful IR debug information, assuming you have an AArch64 sysroot installed and an appropriate CMake toolchain file:

```bash
cmake -S llvm -B build/stage2 -DCMAKE_TOOLCHAIN_FILE=/home/user/aarch64.cmake -DLLVM_ENABLE_THREADS=OFF -DCMAKE_BUILD_TYPE=Release -DLLVM_USE_LINKER=lld -DLLVM_HOST_TRIPLE=aarch64-linux-gnu -DLLVM_ENABLE_PROJECTS=clang -DLLVM_TARGETS_TO_BUILD=AArch64 -DCMAKE_C_COMPILER="$(realpath build/stage1/bin)/clang" -DCMAKE_CXX_COMPILER="$(realpath build/stage1/bin)/clang++" -DCMAKE_C_FLAGS="-fPIC -fuse-ld=lld --target=aarch64-linux-gnu -mllvm -print-after=loop-vectorize -mllvm -ir-dump-directory=$(realpath build/stage2/ir_dump)" -DCMAKE_CXX_FLAGS="-fPIC -fuse-ld=lld --target=aarch64-linux-gnu -mllvm -print-after=loop-vectorize -mllvm -ir-dump-directory=$(realpath build/stage2/ir_dump)" -DCMAKE_ASM_FLAGS="-fPIC --target=aarch64-linux-gnu" -G Ninja
```

Yes, the `--target` options are necessary despite the AArch64 toolchain. Yes, `-fuse-ld=lld` is necessary despite `-DLLVM_USE_LINKER=lld`. There is no reason that this should be as complicated as it is today. None. Zero. No other language pulls shit like this and gets away with it.

Too much time later:

```bash
$ qemu-aarch64 ./build/stage2/bin/clang --target=arm64-apple-macos -O2 repro.cc -S -o - | sha256sum
cf9f89efb0549051409d2559441404b1e627c73f11e763c975be20fcd7fcda34  -
```

Success! I think I would’ve started to question my life choices if the stage2 compiler target had to be Apple-specific. To summarize:

1.  Compile clang with the commit right before the fix above
2.  Bootstrap clang with the newly-compiled clang <– **AND TARGET AARCH64**
3.  Build the repro script attached with ASAN and fuzzing harnesses on when targeting AArch64

There may be some contrived way to convince the vectorizer to miscompile this on X86 by tweaking profitability heuristics but this is good enough for now. Back to bug hunting!

## In which approximately 29,000 lines of textual IR diffs are checked by hand and we get extremely lucky

```bash
$ diff ir_dump_bad ir_dump_good > yeouch.diff
$ ls -lh yeouch.diff
-rw-r--r-- 1 user user 1.6M Sep 25 21:43 yeouch.diff
```

There’s a lot going on in [there](https://secret.club/assets/exhaustive_llvm_rca/yeouch.diff). I’m going to optimistically assume that there’s nothing fishy going on in the Clang frontend, which slashes a significant portion off. After this we manually go through anything remaining, find any suspicious differences, and then check the IR dumps by hand for the function names since those aren’t in the diff itself.

*It would’ve also been pretty easy to check if the problem was actually in clang by using `-emit-llvm` and checking whether the two stages emit something different. I can retroactively say here that they don’t.*

Eventually, close to the bottom, we find that `SelectionDAG::getVectorShuffle` has been messed with in some way:

```bash
; *** IR Dump After LoopVectorizePass on *ZN4llvm12SelectionDAG16getVectorShuffleENS_3EVTERKNS_5SDLocENS_7SDValueES5_NS_8ArrayRefIiEE ***
; Function Attrs: mustprogress nounwind ssp uwtable(sync)
define [2 x i64] @_ZN4llvm12SelectionDAG16getVectorShuffleENS_3EVTERKNS_5SDLocENS_7SDValueES5_NS_8ArrayRefIiEE

[...]

<   %306 = phi i64 [ 0, %300 ], [ %323, %305 ]
<   %307 = phi <16 x i64> [ <i64 0, i64 1, i64 2, i64 3, i64 4, i64 5, i64 6, i64 7, i64 8, i64 9, i64 10, i64 11, i64 12, i64 13, i64 14, i64 15>, %300 ], [ %324, %305 ]
<   %308 = phi <16 x i1> [ zeroinitializer, %300 ], [ %319, %305 ]
<   %309 = phi <16 x i1> [ zeroinitializer, %300 ], [ %322, %305 ]
---
>   %306 = phi i64 [ 0, %300 ], [ %321, %305 ]
>   %307 = phi <16 x i64> [ <i64 0, i64 1, i64 2, i64 3, i64 4, i64 5, i64 6, i64 7, i64 8, i64 9, i64 10, i64 11, i64 12, i64 13, i64 14, i64 15>, %300 ], [ %322, %305 ]
>   %308 = phi <16 x i1> [ <i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true>, %300 ], [ %318, %305 ]
>   %309 = phi <16 x i1> [ <i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true, i1 true>, %300 ], [ %320, %305 ]

[...]
```

… Okay, but what *is* the SelectionDAG?

## On the subject of the SelectionDAG

LLVM IR, at this point, has been very well-documented elsewhere. The same is not true for the SelectionDAG.

When lowering instructions to machine code, LLVM will by default use an intermediate representation known internally as the SelectionDAG. As the name suggests, it’s an acyclic graph-based intermediate representation designed to be useful for instruction selection. Each basic block has gets own SelectionDAG. This is not very helpful without a concrete visualization. Luckily, LLVM provides some visualization tools for us. There are a lot of different passes that the SelectionDAG goes through before being passed through the instruction selection system, but we’re going to completely ignore most of them for the sake of this explanation.

Take the following code and compile it:

```java
// ./build/stage1_debug/bin/clang -mllvm -view-isel-dags -mllvm -view-dag-combine1-dags -O2 -m32 test2.c
void test(int *b, long long *c) {
  *c = *b * 2345;
}
```

You’ll notice we’re compiling for x86_32 - this is important.

Note that LLVM will try to start graphviz or some other dotfile viewer. The reader may find this useful but WSL doesn’t seem to play nicely with them. Solution: `apt uninstall graphviz`

There are three distinct DAGs that are important to demonstrate roughly what the SelectionDAG does and how. They are quite large, but hopefully don’t mess the flow of this blog post up too much. The first one we’re going to look at is what LLVM IR initially gets translated to:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/556fd32d5ec35731.xml)

There are multiple things you’ll notice about the SelectionDAG, but the most important takeaway is that the SelectionDAG is a dataflow graph that represents *all* dependencies of any given node as edges in an acyclic graph. To read the graph, consider `GraphRoot` the *end* of the block and go up. This makes intuitive sense, as we are essentially saying that the terminator instruction (a `return` in our case) depends on the results of the previous computations, *including memory state*. This is very helpful for instruction selection, as you get all valid orderings of instructions right off the bat.

In order for this to work, an explicit “state” edge must be added to all nodes that in some way manipulate memory. The way the SelectionDAG represents that is through the `Chain` operand, labeled `ch` in the graphs. Dependencies between blocks are modeled as stores to virtual registers with appropriate `Chain` operands. Note that the chain is marked in dotted blue lines. You’ll also notice that the chain is not fully sequential, meaning we can also represent non-volatile loads and stores that do not alias each other.

You’ll also notice that there’s already a target specific (`X86ISD::`) node in here. This is useful since it lets backends handle intrinsics or other wonky target-specific nonsense.

One other notable difference compared to LLVM IR is that SelectionDAG nodes can have multiple returns. This is used, for example, so that `load` instructions can return both the loaded value and the new `Chain`. It’s also used in cases like X86’s `div` instruction, as `div` simultaneously computes the quotient and the remainder.

With that being said, there’s a problem here: We’re doing 64-bit stores on a 32-bit platform! That’s not going to work. This is where the next phase of the SelectionDAG comes in: legalization. We need to turn the graph above into something that can map down to actual instructions on the hardware. Backends specify a list of *legal* operations, and all *illegal* operations are removed by the DAG “legalizer.” Once that’s done, we get output like this:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b496f796c9d38e5c.xml)

A lot more stuff is happening in this graph, but it’s stuff that actually maps down to something in the hardware. Notably, the 64-bit store has been completely removed and replaced with two (reorderable!) 32-bit stores. `TokenFactor` nodes just merge separate state edges together, which is important if we have something like a store that potentially depends on two independent loads.

In between these two graphs, we’ve also run the `DAGCombiner`. This is essentially just a patently absurd amount of pattern matching, both target-independent and not.

After we’ve legalized the DAG and done some other transforms, we’re ready to do the initial instruction selection. This involves a bunch more stuff, including a TableGen-generated bytecode machine which I haven’t seen documented anywhere but is ridiculously cool to me, but we don’t have the space for that. Once that’s done, we get a graph that looks like this:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ade6f0ef374e7d4f.xml)

Instruction *selection* (what instructions) now stops and instruction *scheduling* (where do they go) begins. From here, we use one of multiple different schedulers to map the SelectionDAG down to sequential code. That pretty much sums it up!

Much of the target-dependent optimization, legalization, and other logic is queried through the inherited `TargetLowering` classes, which are generally implemented in the `*ILselLowering.cpp` files. Fun fact: `X86IselLowering.cpp` is big enough that [GitHub refuses to render it](https://github.com/llvm/llvm-project/blob/main/llvm/lib/Target/X86/X86ISelLowering.cpp).

There is a very low-level explanation of the SelectionDAG on the [LLVM website](https://llvm.org/docs/CodeGenerator.html#introduction-to-selectiondags) if you’re curious about more implementation specifics.

*GlobalIsel eta 2045*

## every day I’m shufflin’

After some ~~cranial percussive maintenance~~ analysis of the LLVM IR, we find that one specific location has changed:

`SelectionDAG::getVectorShuffle`

```cpp
SDValue SelectionDAG::getVectorShuffle(EVT VT, const SDLoc &dl, SDValue N1,
                                       SDValue N2, ArrayRef<int> Mask) {
  // [...]
  
  // !!! THIS CODE CHANGED SOMEHOW !!!
  bool Identity = true, AllSame = true;
  for (int i = 0; i != NElts; ++i) {
    if (MaskVec[i] >= 0 && MaskVec[i] != i) Identity = false;
    if (MaskVec[i] != MaskVec[0]) AllSame = false;
  }

  if (Identity && NElts)
    return N1;
  
  // [...]
}
```

Note that at this point we’re not quite sure what the behavioral differences are here; I am not quite ready to read through dozens of lines of vectorized IR to figure out exactly what went wrong here. That doesn’t really matter, though; alarm bells are already going off in my head since the check in the resulting condition (`Identity`) is short-circuiting emission of a vector shuffle, which would generate data blobs like those removed completely in the miscompiled assembly. In addition, the code that was changed looks suspiciously like [the reproducer in the GitHub issue](https://github.com/llvm/llvm-project/pull/78304#issuecomment-2057917614), which also erroneously returns `true`. This is a neat coincidence – the original bug is in the loop vectorizer and seems to manifest itself as an entirely separate issue in vectorized code generated in a constructor for vector shuffles. *yo dawg*

Let’s make sure we’re not jumping to conclusions first, though.

## Actually Doing the Thing

Remember that cross-compilation nightmare? We’re not done yet!

After building Clang once and testing some minor changes to `SelectionDAG.cpp` I realized that, to my horror, CMake marked the entire cross-compile build as stale and started the whole thing from scratch. This happened with both the default and Ninja generators. Turns out there’s a bug.. somewhere, that causes includes to constantly be marked as dirty under certain scenarios when using clang. [Cool](https://github.com/ninja-build/ninja/issues/1400). tl;dr -

```bash
sudo ln -s /usr/include /include
```

Now that we’re not rebuilding the entirety of clang every time, it’s pretty easy to test whether our earlier hypothesis was correct. We can get rid of vectorization for this loop see whether anything changes:

```
- for (int i = 0; i != NElts; ++i)
+ for (volatile int i = 0; i != NElts; ++i)
```

```bash
$ qemu-aarch64 ./build/stage2/bin/clang --target=arm64-apple-macos -O2 -fsanitize=fuzzer-no-link -fsanitize=address repro.cc -S -o - | sha256sum
b8dd73117741b08fddb6065fb9289f861f9375b63ebab3ee67edf547ecb0c17a  -
```

Great! Bug gone, which confirms exactly what’s being miscompiled in the compiler.

## Less debug info

We’re generating way too much textual IR every time we compile. Let’s use `-filter-print-funcs`, another useful debugging flag, to fix that:

```bash
-mllvm -filter-print-funcs=_ZN4llvm12SelectionDAG16getVectorShuffleENS_3EVTERKNS_5SDLocENS_7SDValueES5_NS_8ArrayRefIiEE
```

Definitely a mouthful, but helpful nonetheless. While we’re at it, we should enable `lld` as well for full end-to-end testing. For those keeping track, our CMake configure script now looks roughly like this:

```bash
cmake -S llvm -B build/stage2 -DCMAKE_TOOLCHAIN_FILE=/home/user/aarch64.cmake -DLLVM_ENABLE_THREADS=OFF -DCMAKE_BUILD_TYPE=Release -DLLVM_USE_LINKER=lld -DLLVM_HOST_TRIPLE=aarch64-linux-gnu -DLLVM_ENABLE_PROJECTS="clang;lld" -DLLVM_TARGETS_TO_BUILD=AArch64 -DCMAKE_C_COMPILER="$(realpath build/stage1/bin)/clang" -DCMAKE_CXX_COMPILER="$(realpath build/stage1/bin)/clang++" -DCMAKE_C_FLAGS="-fPIC -fuse-ld=lld --target=aarch64-linux-gnu -mllvm -print-after=loop-vectorize -mllvm -ir-dump-directory=$(realpath build/stage2/ir_dump) -mllvm -filter-print-funcs=_ZN4llvm12SelectionDAG16getVectorShuffleENS_3EVTERKNS_5SDLocENS_7SDValueES5_NS_8ArrayRefIiEE" -DCMAKE_CXX_FLAGS="-fPIC -fuse-ld=lld --target=aarch64-linux-gnu -mllvm -print-after=loop-vectorize -mllvm -ir-dump-directory=$(realpath build/stage2/ir_dump) -mllvm -filter-print-funcs=_ZN4llvm12SelectionDAG16getVectorShuffleENS_3EVTERKNS_5SDLocENS_7SDValueES5_NS_8ArrayRefIiEE" -DCMAKE_ASM_FLAGS="-fPIC --target=aarch64-linux-gnu" -G Ninja
```

*Side-note: brute-force testing only works for code, not command-line options*

I’d like to take a moment to point out that `-filter-print-funcs` did not actually work when combined with `-ir-dump-directory` until I was diagnosing this miscompile and submitted the [only useful contribution](https://github.com/llvm/llvm-project/pull/110779) of this \[TOO LONG\] word blog post. When I say that you will be fine if you use the flags that everyone else does, this is what I mean. These options work fine on their own, when combined they caused an extremely trivial [crash](https://godbolt.org/z/sPErz44h4), and that’s a normal Tuesday afternoon because nobody had ever bothered to try and do that.

## More debug info

Let’s use the world’s best form of debugging to get some useful info about what’s going on here.

```
+ printf("identity: %d, nelts: %d\n", (int)Identity, NElts);
```

```bash
# Bad run:
identity: 1, nelts: 20
identity: 0, nelts: 16
identity: 1, nelts: 16
identity: 1, nelts: 20
identity: 0, nelts: 16
identity: 1, nelts: 16
identity: 0, nelts: 16

# Good run:
identity: 0, nelts: 20
identity: 0, nelts: 16
identity: 0, nelts: 16
identity: 0, nelts: 16
identity: 1, nelts: 16
identity: 0, nelts: 20
identity: 0, nelts: 16
identity: 0, nelts: 16
identity: 0, nelts: 16
identity: 1, nelts: 16
identity: 0, nelts: 16
```

All we’ve done here is add `volatile` and we’re even getting changes in how often the function is being called. The good news is that this confirms our hypothesis that `Identity` is erroneously being set to true in certain cases. The fact that these cases involve the number of vector elements being 20 is also important for later, but we’ll get to that.

Let’s go ahead and also print out all the elements of the vector:

```
+ for (int i = 0; i != NElts; ++i)
+   printf("[%08X] ", MaskVec[i]);
```

As a reminder, the `Identity` boolean is set to `true` if all elements of the vector are either less than zero or equal to their indices in the vector itself. For example, `[0, 1, -1, 3]` would return `true` and `[0, 0, 0, 0]` would return `false`.

```bash
$ qemu-aarch64 ./build/stage2/bin/clang --target=arm64-apple-macos -O2 -fsanitize=fuzzer-no-link -fsanitize=address repro.cc -S -o -
[FFFFFFFF] [FFFFFFFF] [FFFFFFFF] [FFFFFFFF] [FFFFFFFF] [FFFFFFFF] [FFFFFFFF] [FFFFFFFF] [00000000] [00000001] [00000002] [00000003] [00000004] [FFFFFFFF] [FFFFFFFF] [FFFFFFFF] [FFFFFFFF] [FFFFFFFF] [FFFFFFFF] [FFFFFFFF] -> identity: 1, nelts: 20

[...]
```

Now, I’m not exactly a mathematician…

## Reproducing the vectorizer oopsie

We require a reasonably-representative reliable reproducer to avoid regular recompilation of clang. After a bit of tinkering with the runtime data we have, here’s a small piece of code that demonstrates the issue:

*Reproducer*

```cpp
#include <cstdio>

int testarr[] = {
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  16 // index 16 (17th element!)
};

void do_the_thing(int *mask_vec, int n_elts) {
  asm volatile("":"+r"(mask_vec),"+r"(n_elts)); // optimization barrier for good luck

  bool identity = true;
  for (int i = 0; i != n_elts; ++i) {
    if (mask_vec[i] != i)
      identity = false;
  }

  printf("identity: %d, nelts: %d\n", (int)identity, n_elts);
}

int main() {
  do_the_thing(testarr, sizeof(testarr) / sizeof(testarr[0]));
}
```

```bash
$ ./build/stage1/bin/clang --target=aarch64-linux-gnu -O2 test.cpp -fuse-ld=lld -o test.out
$ qemu-aarch64 test.out
identity: 1, nelts: 17
```

Nifty. What’s going on internally, though? We can view the CFG of the output LLVM IR using the `opt` tool to find out. Rembember how I said I was not ready to read through dozens of lines of vectorized IR? Well, so, uh,

```bash
./build/stage1/bin/clang --target=aarch64-linux-gnu -O2 test.cpp -fuse-ld=lld -emit-llvm -S -o test.ll
./build/stage1/bin/opt -passes=-view-cfg test.ll
```

The original dotfile is [here](https://secret.club/assets/exhaustive_llvm_rca/cfg.dot). A rendered version is located [here](https://secret.club/assets/exhaustive_llvm_rca/cfg.svg) for your viewing displeasure. It’s big enough that I’d rather not embed it in-line, so you should open it in a second window somewhere to follow along. If you squint hard enough, you’ll notice a 16-wide vector loop, an 8-wide vector loop, and a scalar loop. Really quickly, let’s take a look at some of the trickery that’s happened already. Here’s an annotated and shortened version of the 16-wide vector loop:

```
loop_block:
    %bool_phi = phi <16 x i1> [ zeroinitializer, %entry ], [ %bool_vec, %loop_block ]
    %idx_list = phi <16 x i32> [ ... ]
    %current_block_ptr = getelementptr inbounds ...
    %current_block = load <16 x i32>, ptr %current_block_ptr
    %cmp_result = icmp ne <16 x i32> %idx_list, %loaded_values
    %bool_vec = or <16 x i1> %bool_phi, %cmp_result
```

If you’re paying really close attention, you’ll notice that the meaning of `cmp_result` has actually been inverted compared to `identity`! Now any element of `bool_vec` being `true` would mean that `identity` is `false`, rather than requiring all elements of `bool_vec` to be `true` in order for identity to be `true`. I hope that made sense. This inversion means it’s possible to use a simple comparison against zero to check whether our condition was satisfied, rather than needing to load `-1` in various places afterwards. Neat, huh?

The phi node results of the 16-wide vector loop are, depending on whether we want to execute the 8-wide vector loop or not, are–

Wait a minute.

COMPUTER, ENHANCE!

```bash
27:                                               ; preds = %14
  %28 = bitcast <16 x i1> %23 to i16
  %29 = icmp eq i16 %28, 0
  %30 = icmp eq i64 %13, %8
  br i1 %30, label %64, label %31

31:                                               ; preds = %27
  %32 = and i64 %8, 8
  %33 = icmp eq i64 %32, 0
  br i1 %33, label %61, label %34

61:                                               ; preds = %7, %31, %57
  %62 = phi i64 [ 0, %7 ], [ %13, %31 ], [ %38, %57 ]
  %63 = phi i1 [ true, %7 ], [ true, %31 ], [ %59, %57 ]
  br label %70
```

Let’s annotate this a bit. Block `%27` is executed immediately after `%14` (the 16-wide loop) is done, `%57` is executed immediately after the 8-wide loop, `%13` is the current loop iteration index (i.e. how many iterations of the original operation the 16-wide loop has completed), and `%8` is the required total iteration count.

```rust
; Executed immediately after 16-wide vector loop
27:                                               ; preds = %14
  ; %29 is set to whether 0 if all vector elements are false; i.e. the check in the vector loop always fails. Not shown: the vectorizer has inverted our condition from equality to inequality.
  %28 = bitcast <16 x i1> %23 to i16
  %29 = icmp eq i16 %28, 0

  ; Check whether we've iterated through the entire loop
  %30 = icmp eq i64 %big_loop_trip_count, %req_trip_count
  br i1 %30, label %64, label %31

; We have not, check whether we should execute 8-wide vector loop
31:                                               ; preds = %27
  %32 = and i64 %req_trip_count, 8
  %33 = icmp eq i64 %32, 0
  br i1 %33, label %61, label %34

; Do not want to execute 8-wide loop
61:                                               ; preds = %7, %31, %57
  ; Iteration count after vectorized loops
  %62 = phi i64 [ 0, %7 ], [ %big_loop_trip_count, %31 ], [ %38, %57 ]

  ; PHI node representing current status of `identity`. Always `true` after the entry block, `true` after block `%31`, dependent on `%59` after block `%57` (8-wide loop).
  %63 = phi i1 [ true, %7 ], [ true, %31 ], [ %59, %57 ]
  br label %70
```

`true` after block `%31`? That’s not good. It seems like, if the second vector loop is not executed and we go to the scalar loop, the results of the first vector loop are just.. ignored! We can test this out pretty easily:

```
int testarr[] = {
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
- 16
+ 16, 17, 18, 19, 20, 21, 22, 23
};
```

```bash
$ qemu-aarch64 test.out
identity: 0, nelts: 24
```

Then let’s try deliberately executing the scalar loop *and* the second vector loop:

```
int testarr[] = {
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
- 16
+ 16, 17, 18, 19, 20, 21, 22, 23, 24
};
```

```bash
$ qemu-aarch64 test.out
identity: 0, nelts: 25
```

Great! Or, well, not great, but we’ve successfully narrowed down the root cause of the stage2 bug. To be clear, to trigger this bug the vectorizer has to generate a very specific type of operation at compile time *and* at runtime we have to have somewhere between 17 and 23 total iterations done.

Fun.

… How are these vectors generated, anyway? What would generate a *twenty-element* vector?

Let’s take a look at the original reproducer and try to find anything useful in the LLVM IR:

```bash
$ qemu-aarch64 ./build/stage2/bin/clang --target=arm64-apple-macos -O2 -fsanitize=fuzzer-no-link -fsanitize=address repro.cc -S -emit-llvm -o - | grep "20 x "
$
```

Okay, so this has to be something done after all of the IR passes then. Fantastic. Let’s just print out everything with `-debug` and-

```bash
$ ./build/stage1/bin/clang --target=arm64-apple-macos -O2 -fsanitize=fuzzer-no-link -fsanitize=address -S repro.cc -mllvm -debug
clang (LLVM option parsing): Unknown command line argument '-debug'.  Try: 'clang (LLVM option parsing) --help'
```

Oh. Right. We didn’t compile Clang in debug mode. Time to kick off yet another from-scratch LLVM build. *sigh*

\[more than one minute later\]

```bash
$ ./build/stage1_debug/bin/clang --target=arm64-apple-macos -O2 -fsanitize=fuzzer-no-link -fsanitize=address -S repro.cc -mllvm -debug

[...]
Creating new node: t76: v20i8 = concat_vectors t74, undef:v5i8, undef:v5i8, undef:v5i8
```

I’m not even going to question why or how a vector with **five elements** is being generated for now - what’s important is that the 20-element vector is being created during instruction selection. The `<5 x i8>` vectors exist *before* instruction selection in the form of operands to vector shuffles, which is good:

```
;./build/stage1/bin/clang --target=aarch64-linux-gnu -O2 repro.cc -fsanitize=fuzzer-no-link -fsanitize=address -emit-llvm -S -o -
; ...
%133 = bitcast i40 %ref.tmp.sroa.4.0.extract.trunc to <5 x i8>
%retval.sroa.0.8.vec.expand62 = shufflevector <5 x i8> %133, <5 x i8> poison, ...
; ...
```

The fact that these vectors are in the IR emitted by `-emit-llvm` means we can assume they’ll be passed directly to the initial SelectionDAG builder, so we should take a look at that now.

*well, not always:(*

Passes after `-emit-llvm` **but before instruction selection** can absolutely trash your code if you’re not careful. [Here’s](https://github.com/llvm/llvm-project/issues/64990) something absolutely diabolical - the summary is that the `WinEHPrepare` pass will detect blocks with specific types of malformed call instructions *AND COMPLETELY NUKE THE BASIC BLOCK*. No less than three people (the author of that issue, a friend of mine, and I) have run into this to-date. If you develop for LLVM and there is **ONE** thing you take away from this post, it should be to be careful about inserting calls when funclet pads are involved!!!

## Under complex macroarchitectural conditions…

Let’s take a look at `SelectionDAGBuilder::visitShuffleVector`:

`SelectionDAGBuilder::visitShuffleVector`

```cpp
void SelectionDAGBuilder::visitShuffleVector(const User &I) {
  // ...

  // Normalize the shuffle vector since mask and vector length don't match.
  if (SrcNumElts < MaskNumElts) {
    // ...

    unsigned PaddedMaskNumElts = alignTo(MaskNumElts, SrcNumElts);
    unsigned NumConcat = PaddedMaskNumElts / SrcNumElts;

    // Pad both vectors with undefs to make them the same length as the mask.
    SDValue UndefVal = DAG.getUNDEF(SrcVT);
    SmallVector<SDValue, 8> MOps1(NumConcat, UndefVal);
    SmallVector<SDValue, 8> MOps2(NumConcat, UndefVal);

    MOps1[0] = Src1;
    MOps2[0] = Src2;
    
    Src1 = DAG.getNode(ISD::CONCAT_VECTORS, DL, PaddedVT, MOps1);
    Src2 = DAG.getNode(ISD::CONCAT_VECTORS, DL, PaddedVT, MOps2);

    // Readjust mask for new input vector length.
    SmallVector<int, 8> MappedOps(PaddedMaskNumElts, -1);

    // ...

    SDValue Result = DAG.getVectorShuffle(PaddedVT, DL, Src1, Src2, MappedOps);

    // ...
  }
```

As a reminder, our source vector size is 5 and our mask vector size is 16. The SelectionDAG builder wants to normalize the source and mask vectors, such that:

1.  The resulting output mask is a multiple of the number of elements in the source vector. Not quite sure why.
2.  All vectors passed to `getVectorShuffle` are the same size as the mask.

This means that we get `undef` -padded 20-element vectors and multiple `-1` s at the end of the mask. Those `-1` s then get passed to `getVectorShuffle`, which then causes the miscompile as mentioned before. Neat.

Time to look a little at how that 5-element vector was generated. Looking for `<5 x i8>` in the debug logs tell us a bit more about what’s going on here:

```
rewriting [8,13) slice #8
  Begin:(8, 13) NewBegin:(8, 13) NewAllocaBegin:(0, 16)
  original:   store i40 %f1.sroa.5.0.extract.trunc.peel, ptr %9, align 8
  shuffle:   %retval.sroa.0.8.vec.expand = shufflevector <5 x i8> %10, ...
  blend:   %retval.sroa.0.8.vecblend = select <16 x i1> ...
```

SROA is a pass designed to optimize away (“promote”) `alloca` instructions and turn the values they reference directly into SSA registers. We can see SROA turning a store of a 40-bit integer(????) into a mess of shuffles. I’m not going to go through this bit line-by-line as, frankly, there isn’t anything particularly unique about how this part of the bug manifests itself. There are plenty of other ways in which weird-length vectors are generated - `<20 x i8>` and `<5 x i8>` show up a bunch of times in the test-cases.

As an expedited summary, SROA runs, then a bunch of passes run, then SROA runs again and turns some stores into those `i40` stores, then some other passes run, then SROA runs *again* and turns those stores into 5-element vector shuffles as seen above. Going through exactly why this happens would involve sifting through a bunch of implementation details with nothing much to say other than “this is what it does.” I don’t find that particularly engaging when nothing else is involved, and this post is long enough as-is. The code works as intended. The fact of the matter is that *all* modern-day compiler bugs have root cause chains this deep - one pass *happens* to generate some code which *happens* to cause another pass to generate some other code, and so on and so forth.

If you’d like, you can see the full diff [here](https://secret.club/assets/exhaustive_llvm_rca/final.diff).

## Conclusion

It’s entirely unnecessary for compiler engineers to go into this amount of detail about why something went wrong from start to finish. All that’s needed is what was given at the very start: Correct IR, buggy IR. Fix bug, add test-case, done. The underlying root cause of this bug was fixed a while ago – it’s very unlikely that anyone was ever concretely impacted by it outside of a few hours of type 2 fun.

With that being said, this silly bug will probably hold a special place in my heart for a while. The potential for a buggy bootstrapped compiler has always existed. In practice, however, it’s incredibly rare, and I didn’t think I’d ever actually see a real-world example. I hope whoever read to the end learned something. It’s a fantastic example of how things can go wrong in ridiculous, unexpected ways when so many moving parts are involved.

I love shit like this.
