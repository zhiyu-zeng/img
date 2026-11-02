---
title: Detecting Frida Stalker
source: https://www.romainthomas.fr/post/26-10-frida-stalker-detection/
source_host: www.romainthomas.fr
clip_date: 2026-11-03T01:46:40+08:00
trace_id: 5d132e2b-de16-4f18-a4a1-f2ab0ad4ba30
content_hash: 93d497d948762a45ed64a229f7ea22f13d546ac1082db930aadd3b446b48daed
status: synced
tags:
  - Frida
  - 风控对抗
series: null
feed_source: Romain Thomas·二进制
ai_summary: Frida Stalker 在栈上留下的寄存器副本能被函数自我检测：通过向红区下方写入金丝雀值并对比即可发现指令级插桩踪迹。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 40c75244-d011-81bb-a679-cc877e883507
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida Stalker 在栈上留下的寄存器副本能被函数自我检测：通过向红区下方写入金丝雀值并对比即可发现指令级插桩踪迹。
> 
> - **设计差异：** QBDI 为重写规则挑选插桩代码未使用的临时寄存器并存入 DataBlock，坚持不碰栈（早期作者刻意设计），因此能抵御强副作用与完整性检查；而 Frida Stalker 直接使用预定义寄存器（如 x16/x17）并在栈上保存恢复。
> - **痕迹本质：** Stalker 每次重写跳转/调用时把 x16、x17（syscall 时为 x15、x17）溢出到红区下方（sp - 0x80 之下），切换自身代码时还保存 GumCpuContext，且恢复后不擦除这些副本。
> - **检测三步：** ① 向 `[sp-0x90]`、`[sp-0x88]` 写入金丝雀值；② 执行一条触发 Stalker 重写的指令（如间接跳转）；③ 将这两个槽位与备份寄存器对比（br/blr/ret 对应 x16/x17，svc 对应 x15/x17）。
> - **前提条件：** 依赖 Android 编译产物从不写栈指针以下内存这一事实，故这些槽位仅在 Stalker 运行时变化。红区大小各异：Apple arm64 为 128 字节、Windows ARM64 为 16 字节，Android 未定义但 Frida 统一跳过 128 字节。
> - **延伸：** 检测代码已开源（romainthomas/frida-stalker-detection）；作者另在 iXGuard 逆向中发现过类似检测，且 Claude Opus 5.5 已能独立给出同样的栈检测方案。

## Introduction

Techniques to detect that a function is hooked by Frida (or by any other hook engine) are well documented, and asking an AI about them provides meaningful and relevant answers. Sometimes, a hook is not enough to understand the purpose of a function and we need to take a closer look at what it executes. This is where Frida’s Stalker comes into play: it traces the code at the instruction level by running an instrumented copy of it, while the original instructions stay untouched.

Detecting the Stalker is more challenging, and a well-designed DBI resists most detections. This blog post shows a detection that a function can run on itself to find out whether it is being stalked by Frida.

## The Detection

Any DBI needs scratch registers for its rewriting rules. [QBDI](https://github.com/QBDI/QBDI) picks a register that the instrumented code does not use. For instance, the rule that rewrites an arm64 `RET` instruction is:

```text
# RET rewriting by QBDI
temp := LR
DataBlock[PC] := temp
```

which could be lowered into:

```text
mov x11, lr
str x11, [x27, #600]
```

Note

Assuming that the DataBlock is addressed by `x27` and that `x11` is free at the instrumentation point.

Here, QBDI pays the cost of finding a register that the instruction does not use (`x11`) to store the `temp` variable, and it saves this register in its `DataBlock`.

QBDI could have used another strategy: saving and restoring registers on the stack. Thanks to the early designers and authors of QBDI (Charles Hubain and Cédric Tessier), using the stack for the needs of the DBI was [not an option](https://qbdi.readthedocs.io/en/stable/execblock.html). This choice keeps QBDI stealthy under strong side-effect and integrity checks.

On the other hand, Frida’s Stalker uses the stack for the *same* use case as the `temp` allocation in the previous snippet. Instead of finding a free register within the scope of the instrumented code, it uses predefined registers (e.g. `x16` and `x17`) that are saved to and restored from the stack.

Assuming that the **non-instrumented** code uses the following stack layout:

![Native stack layout: the caller frame, the current frame between fp and sp with local variables and data, the 128-byte red zone from sp down to sp - 0x80, and unallocated memory below](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ffc329921822017a.webp)

Note

The *red zone* is an area below the stack pointer that a function can use without allocating a stack frame (e.g. 128 bytes on Apple arm64). On Windows ARM64, its 16 bytes are (officially) reserved for analysis and dynamic patching. Android does not define a red zone, but Frida skips 128 bytes anyway.

When the Stalker is running, every rewritten jump or call (e.g. `br`, `blr`) goes to a stub that saves some predefined registers. The stack looks like this:

![Stack layout under the Stalker: the same frames and 128-byte red zone, then, right below sp - 0x80, the saved x16 and x17 followed by a GumCpuContext with the general-purpose, vector, and flag registers, left behind as Stalker artifacts](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7124e52aea4896f7.webp)

The Stalker spills `x16` and `x17` (`x15` and `x17` for a syscall) right below the red zone. When it switches to its own code, for instance to compile a new block, it also saves some or all registers as a `GumCpuContext`. The important point is that when Frida restores these registers, it does not erase their copies.

On Android, compiled code never writes below the stack pointer, so these slots only change under the Stalker. A function can therefore detect the Stalker in three steps:

1.  write a canary into `[sp - 0x90]` and `[sp - 0x88]`
2.  execute an instruction that triggers Stalker rewrites (like an indirect branch)
3.  compare the slots with the backup registers

| Rewritten instruction | `[sp - 0x90]` | `[sp - 0x88]` |
| --- | --- | --- |
| `br`, `blr`, `ret` | `x16` | `x17` |
| `svc` | `x15` | `x17` |

The code of this detection is available in this GitHub repo: [romainthomas/frida-stalker-detection](https://github.com/romainthomas/frida-stalker-detection)

## </last word>

If you want to go further with the Stalker detection, you can check the [SingPass RASP Analysis](https://www.romainthomas.fr/post/22-08-singpass-rasp-analysis/#code-tracing) blog post, which exposes another detection that I found while reverse engineering iXGuard.

Note that the detection explained in this blog post is rooted in some work done on [DynaMIR](https://www.romainthomas.fr/project/dynamir/) [1](#fn:1).

### Last Minute Update

I thought about this detection a while ago (i.e. at the beginning of this year). In July, while I was playing with AI, I asked Opus 5 how it would detect the Stalker, and my detection was not part of its answer 😏.

Before publishing this blog post [2](#fn:2), and for the sake of completeness and intellectual integrity, I asked Opus 5.5 the same question. The first two detections of its answer are literally the stack-based detection that I describe.

This is just the reality of the pace at which AI models progress.

You can check the answers from OpenAI Daybreak [3](#fn:3) and Opus 5.5 here:

-   [OpenAI Daybreak](https://www.romainthomas.fr/post/26-10-frida-stalker-detection/codex-daybreak-frida-stalker-detection.txt)
-   [Claude Opus 5.5](https://www.romainthomas.fr/post/26-10-frida-stalker-detection/claude-opus-5.5-frida-stalker-detection.txt)

\\Romain

1.  More details to come soon™ [↩](#fnref:1 "return to article")
    
2.  My personal account has also been CVP-approved, so I no longer face the safeguards for this kind of detection-based question. [↩](#fnref:2 "return to article")
    
3.  The answer from Astra is not worth it. [↩](#fnref:3 "return to article")
