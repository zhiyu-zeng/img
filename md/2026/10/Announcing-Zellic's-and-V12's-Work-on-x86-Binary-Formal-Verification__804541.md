---
title: Announcing Zellic's and V12's Work on x86 Binary Formal Verification
source: https://www.zellic.io/blog/x86-formal-verification-intro
source_host: www.zellic.io
clip_date: 2026-10-31T04:37:49+08:00
trace_id: cba8b5f5-af5e-4d8a-b833-1bf15aa42f5e
content_hash: bf0ec767740a4821f8eace365f80305e95dfe985c1f27ea7492f04b47d26ce55
status: synced
tags:
  - 形式化验证
  - Linux安全
series: null
feed_source: Zellic·漏洞研究
ai_summary: Zellic 与 V12 用 Lean 完成首个覆盖静态链接 x86 glibc 二进制端到端执行的机器可查证明，并让证明成本随数量亚线性增长。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 40975244-d011-8119-894c-e1f67c86867e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Zellic 与 V12 用 Lean 完成首个覆盖静态链接 x86 glibc 二进制端到端执行的机器可查证明，并让证明成本随数量亚线性增长。
> 
> - **里程碑：** 发布首个机器校验证明，端到端覆盖 Linux 进程运行 64 位 x86 glibc 二进制的行为：从 `execve`、glibc 启动（IFUNC 解析、TLS 设置）到堆分配、stdin/stdout I/O、`exit_group`。
> - **验证内容：** 对 "admin" 程序证明缓冲区溢出无法覆盖 admin 标志——任何到达 `main` 且以退出码 0 结束的运行，stdout 输出必为 "Hello, "+名字+"! admin: no"；且无需假设 `malloc` 返回不相交缓冲区，该性质从二进制直接证出。
> - **难度：** x86+glibc 远比 RISC-V+musl 复杂：glibc 进入 `main` 前执行的独立指令约为后者 10 倍，其 `strcmp` EVEX 变体是 316 条 AVX-512 汇编指令（45 个跳转、12 个 `ret`）。
> - **可规模化：** 证明机制模块化复用，验证第二个程序 admin2 仅新增 739 行，背后共享约 17.8 万行证明与 10.5 万行自动化；同一元程序可压平 gcc 与 clang 产出的机器码差异。
> - **局限与协作：** 执行模型尚未经人工审计，未建模多线程、动态加载、`ptrace` 外部写内存及全部 x86 指令；全部代码由以 Claude Opus 5.5 为主的 AI 代理编写，人类形式化验证专家负责全局规划与纠偏，过程中还发现多个 glibc 边界 bug 待披露。

We are excited to [share↗](https://github.com/Zellic/x86-formal-verification-research) what we believe to be the first published machine-checked proof that covers the behavior of a Linux process executing a statically linked 64-bit x86 glibc binary end to end.

This result is part of an ongoing internal collaboration between Zellic and V12 aiming to enable scalable formal verification of x86 programs at the binary level. Targeting the binary level helps dramatically reduce the required trusted base compared to formalizing source code (due to a smaller model at full coverage, as well as not relying on e.g. compilers being bug-free) and allows us to cover binaries produced by many different compilers and programming languages, including directly written optimized machine code.

While the x86 instruction set is notably more difficult to model than architectures such as RISC-V, it is much more widely used in real-world deployments. Since its conception, the goal of this project has been to combine frontier models with expert human guidance to build a framework to achieve a scalable, reusable workflow for glibc and x86 machine-code verification.

This will be the first in a series of blog posts on this project.

## Overview

Recent leaps in AI ability have led not only to a dramatic rise in the amount of software that needs to be secured but also a critical increase in the level of confidence needed that this software is in fact free of security vulnerabilities. Methods to gain confidence in software being secure are thus needed that are able to provide stronger guarantees of bug-freeness than merely “our method failed to find a bug”, shrinking the trusted base of code to allow efficient coverage by the limited resources of (AI-assisted) human security expertise.

Formal verification is the big unlock that allows us to minimize the trusted base requiring security analysis. The proofs of software are large and scale with size and complexity of the code, but they are automatically checked; no human needs to look at them. There are still some elements left we need to trust and validate, such as the checker and statements, but these are either one-time costs that amortize (like the checker and execution model) or much smaller than the proofs (like the program-specific statements).

This is why we at Zellic and V12 have been developing a project to enable scalable formal verification of userspace software on x86 under Linux, at the binary level.

These are our goals:

-   To cover as much important software as possible
-   To minimize the trusted base as much as possible
-   To be able to verify things efficiently with reasonable effort

Targeting the binary level increases the scale of the individual proof effort but in turn rules out more bugs than formalizing the source code level (e.g., compiler bugs), while also having a simpler model [1](#fn:1) and thus smaller trusted base. It covers binaries produced by various compilers and programming languages, including directly written machine code that wouldn’t be amenable to higher-level–only formalization anyway. We believe that based on the first two goals, verifying at the binary level is the desirable choice — as long as it is actually possible to prove the desired statements in practice, at scale and efficiently.

Recent work by Anthropic and Theorem has also followed this approach, making significant strides in verifying security properties of RISC-V binaries linked against musl libc. However, as they note, “most people run these libraries on x86 or ARM and dynamically link them against glibc”.[2](#fn:2) [3](#fn:3) Compared with RISC-V, x86 requires reasoning about a substantially more complex instruction set.

Furthermore, glibc, unlike musl, brings an elaborate initialization before `main`, and dispatches subroutines that could have simple implementations to CPU-dependent, highly optimized assembly, causing even very simple programs to become highly complex. For example, glibc on x86 for plain C programs tends to execute around ten times as many distinct instructions (as in distinct addresses) before reaching `main` compared to RISC-V musl. As the glibc startup calls `strcmp`, we had to reason about its behavior in the [EVEX variant↗](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/x86_64/multiarch/strcmp-evex.S;hb=refs/tags/glibc-2.43) that glibc chooses for the CPU we targeted, which consists of optimized assembly using AVX-512 instructions and contains 45 jumps and 12 `ret` s in 316 instructions, while the [musl implementation↗](https://git.musl-libc.org/cgit/musl/tree/src/string/strcmp.c?h=v1.2.6) compiled for RISC-V has 4 jumps (branches) and one `ret` in 14 instructions.

This project started mid-September 2026 with the aim to not just formalize the x86 execution model but to develop a scalable framework allowing efficient proving of relevant security properties in this model, in the real-world setting of glibc-linked x86 binaries. We have built a model in Lean of the execution of single-threaded, statically linked non-PIE programs running under Linux in 64-bit x86 userspace, together with vocabulary for formulating statements and substantial proof machinery to aid in proving them in this model. We have validated that it is possible to prove substantial results using this framework.

Over the coming weeks, we plan to release a series of blog posts sharing the results we have achieved so far. What we are releasing with this post is a research preview [4](#fn:4) of the model and statement vocabulary, together with proofs for some statements about binaries in it. This includes a proof of a meaningful security property, covering full runs of an ELF binary statically compiled against glibc. To the best of our knowledge, this is the first published machine-checked proof that covers the behavior of a Linux process executing a statically linked x86 glibc binary end to end.

This covers from `execve`, through the glibc start-up (which includes, for example, IFUNC resolution and TLS setup), memory allocation on the heap, I/O on stdin/stdout, all the way to `exit_group`. The proof covers every run, and the statement specifies that every run that reaches `main` ends in a specified way. The run may also get stuck or crash in glibc’s start-up without reaching `main`, which the statement also allows, while constraining what the process might do (e.g., what may be written to stdout).

The proven statement has some assumptions; for example, we assume the processor matches the specific CPU of our development VM, that the vDSO image is the specific one on our test system or none, that the kernel doesn’t refuse `brk` or `mmap`, that nothing from outside interferes with the process,[5](#fn:5) no glibc tunables, and a couple of other such conditions.

As an aside of independent interest, we encountered multiple cases where our intended statements had to be modified to account for edge-case bugs within glibc itself. These bugs are being reported and will be the topic of an upcoming blog post.

## A formal end-to-end verification of execution of an entire binary

We end-to-end verified execution of a binary compiled (against glibc, compiled with GCC) with the following source code:

```c
#include <stdlib.h>
#include <unistd.h>

#define NAME_SIZE 32
#ifndef READ_LEN
#define READ_LEN NAME_SIZE
#endif

int main(void) {
  char *name = malloc(NAME_SIZE);
  volatile char *admin = malloc(1);
  if (name == NULL || admin == NULL) return 2;
  *admin = 0;
  ssize_t n = read(0, name, READ_LEN);
  if (n < 0) return 1;
  if (write(1, "Hello, ", 7) != 7) return 1;
  if (write(1, name, n) != n) return 1;
  if (*admin) {
    if (write(1, "! admin: yes\n", 13) != 13) return 1;
  } else {
    if (write(1, "! admin: no\n", 12) != 12) return 1;
  }
  return 0;
}
```

This is a simple program that reads a name into an allocated buffer and prints out at the end whether an admin flag is set. If `READ_LEN` is set to a higher value than the allocated buffer size `NAME_SIZE`, and the binary is compiled without overflow protection, then the read overflows the buffer and can (if the read is sufficiently long) overwrite the admin buffer and result in the program printing “admin: yes”. That would be a classic memory-safety bug, a very common bug class. In this simple program, it is easy to see that the read is at most of the length of the buffer, and that, assuming that `malloc` works as expected to return buffers that are disjoint and also don’t overlap with the stack and so on, and assuming that the compiler doesn’t mess things up, this should not happen.

![This image illustrates how, in the verified binary, the input always stays inside name, while with READ\_LEN = 64 and a 49-byte input, it overwrites the admin flag.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ff7c6e4ccb67f0fc.svg)

What we proved about the compiled binary is this statement:

```lean
def holds : Prop :=
  Exe.HasData Clients.Admin.file.blob ["__libc_single_threaded"] ∧
  ∀ l : Launch, l.Of Clients.Admin.file.img Clients.Admin.file.size → l.prof.Consistent →
    l.prof.linux.Modest → StackRoom l.args (startStack + 32) →
    DemoArgs l.args → DemoLimits l.args → ThisProcessor l.prof → ThisVdso l.prof.linux →
    Always l.prof DemoEnv l.s₀ (fun _ evs => SoFar evs)
              (fun out evs => (out.Modelled ∧ ∀ ev ∈ evs, C.Event.IsStartup ev) ∨ Done out evs) ∧
    EndsIf l.prof DemoEnv l.s₀ (fun s _ => s.cpu.rip = Exe.entry Clients.Admin.file.blob "main") Done
```

We will unpack more how our statement vocabulary works in an upcoming blog post. One part of the statement we wish to highlight here is the last line, which says that if execution reaches `main`, then the program will end,[6](#fn:6) satisfying `Done`:

```lean
def Done (out : Outcome) (evs : List Event) : Prop :=
  (Input 0 evs).length ≤ nameMax ∧
            ((out = .exited .exitGroup 0 ∧ Output 1 evs = line (Input 0 evs)) ∨
              (out = .exited .exitGroup 1 ∧ Output 1 evs <+: line (Input 0 evs) ∧ LastShort evs) ∨
              (out = .exited .exitGroup 2 ∧ Output 1 evs = [] ∧ Input 0 evs = []) ∨
      (out.KilledInWrite ∧ Output 1 evs <+: line (Input 0 evs)))
```

For those that end with exit code zero, this says that the program outputted on stdout exactly the expected string:

```lean
def line (name : List Byte) : List Byte := utf8 "Hello, " ++ name ++ utf8 "! admin: no\n"
```

This nails down that there is no way that a run that reaches `main` and ends with exit code zero could ever print something ending with “admin: yes”. As mentioned above, the statement is proven under some reasonable assumptions on the run, such as that the program is not running in a debugger that modifies the memory during the run — in that case, the conclusion would of course not be correct. Note that unlike the manual inspection, there is no assumption that the `malloc` calls behave as expected and return buffers that are disjoint from each other and disjoint from other memory that is in use — that is proven from the binary instead.

![This picture illustrates how the proof combines two facts to show that the admin is still 0 after the read. The first is that read writes at most 32 bytes starting at name. The second is malloc&#39;s guarantee that the name overlaps with nothing else in use, no matter where it is placed. As admin is still 0 after the read, the output must end in &quot;admin: no&quot;.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ad70240e3404185f.svg)

The following graphic shows which parts of the full binary are argued about in the proof.[7](#fn:7) Most instructions can (provably) never be called, so we don’t need to prove anything further about them.

![Picture showing admin&#39;s 128,693 instructions, colored by category: 60 are main&#39;s, 5,370 are proved and executed in an example run, 10,277 are proved but not executed in an example run, 23,299 are referred to in the proof only as IFUNC candidates, 88,183 are not reached, and 1,504 are padding between functions.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dc90f5c0f8125289.svg)

## Making proofs scale

It took weeks of effort to prove the above statement about the “admin” program. How much effort does it take to prove a second program, such as this “admin2” program, which, while similar, has an additional `for` loop to reject names with newlines, and also splits up the `write` s differently?

```c
#include <stdlib.h>
#include <unistd.h>

#define NAME_SIZE 32

int main(void) {
  char *name = malloc(NAME_SIZE);
  volatile char *admin = malloc(1);
  if (name == NULL || admin == NULL) return 2;
  *admin = 0;
  ssize_t n = read(0, name, NAME_SIZE);
  if (n < 0) return 1;
  for (ssize_t i = 0; i < n; i++) {
    if (name[i] == '\n') {
      write(2, "admin2: bad name\n", 17);
      return 3;
    }
  }
  if (write(1, "Hello, ", 7) != 7) return 1;
  if (write(1, name, n) != n) return 1;
  if (write(1, "!\n", 2) != 2) return 1;
  if (*admin) {
    if (write(1, "admin: yes\n", 11) != 11) return 1;
  } else {
    if (write(1, "admin: no\n", 10) != 10) return 1;
  }
  return 0;
}
```

The answer? Very easy. With our current machinery, it is just 739 new lines to write down a similar statement for admin2 and to prove it. This is because most of the effort in proving “admin” is in proving statements about in particular glibc start-up (running before `main` is reached) and, for example, the behavior of `malloc`. We have built our machinery from the ground up to make such results modular and reusable, so they are not specific to “admin” or “admin2”.

The following graphic illustrates how much of the full proof between admin and admin2 is shared:

![A graphic illustrating that the program-specific part consists only of 50 (47) lines for the statement and 359 (496) lines for the proof of admin (admin2), while the statements depend on about 11.5k lines of shared code and the proofs share 178k lines of proofs and 105k lines of automation](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e9ab25ff45f580c0.svg)

Additionally, substantial amounts of proof work [8](#fn:8) are handled by generic automated metaprogramming.

As an example, consider the following program:

```c
int memcmp(const void *a, const void *b, size_t n) {
  const unsigned char *p = a, *q = b;
  for (size_t i = 0; i < n; i++)
    if (p[i] != q[i]) return p[i] - q[i];
  return 0;
}
```

We compiled it with different compilers and compiler settings, and the resulting machine code differs:

![A side-by-side comparison of the above C code compiled with gcc and clang; 4 instructions are the same, 10 instructions are different but do the same job, and 4 non-nop instructions on the gcc side have no counterpart on the clang side.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3878d6a87e30c6a3.svg)

However, the differences are all squashed by our automated machinery; the proof actually written for this specific program works for both versions.[9](#fn:9)

We will share more about our approach to modularization, reuse, and scalability in upcoming posts.

## Limitations

We would like to highlight that the execution model has not yet been audited by a human and is still under active development. While still time-consuming to write and audit, creating a formal specification of an ISA was not historically the main blocker for formal verification of binary programs like this. Rather, it was making the proving of actual nontrivial statements sufficiently cheap for it to be viable to use in practice. Modern AI is a huge step towards that goal, and hence our research aims at validating how far proving costs can be brought down using modern AI together with reusable automated proof machinery first, followed by careful auditing of the execution model and statement/specification vocabulary once their design is more complete and stabilized.

Our execution model currently has various known gaps, such as not modelling all x86 instructions, multithreading, dynamic loading, or external writes to process memory (for example via `ptrace`) within non-atomic instructions [10](#fn:10). We expect them to, at the moment, still have various gaps and mistakes we do not know about, which may include some that may make statements vacuous. During development, such mistakes are still being found every now and then.[11](#fn:11)

## Conclusion

We started this project as an experimental exploration on September 18th, 2026, to investigate the feasibility of scalable, machine-code–level formal verification using frontier models. The main frontier model used in development was Claude Opus 5.5 (released shortly after on the 22nd) [12](#fn:12), which represents an amazing leap forwards in terms of agentic formal verification ability compared to models only a couple of months older [13](#fn:13).

While current frontier AI can pump out proofs at a pace never seen before, our goal was never to sequentially create many individual impactful proofs — but rather to explore the limits of scalable, meaningful formal verification for real-world software, where effort per proof scales significantly sublinearly with the number of proofs. To this end, we found that while the frontier models could write proofs, and were, in contrast to, say, half a year ago, also capable of engineering the kind of metaprograms and tooling required for a scalable framework, they still struggled with the required big-picture planning, goal-setting, and reassessment of local goals when they are in conflict with high-level ones.

Instead, one of Zellic’s human experts in formal verification was kept in the loop, giving continuous guidance and corrections to the agents as they worked. While all code was written by AI agents, the human expert played a vital role in making sure the proof machinery the agents built was truly reusable.

The end result was not only successful verification of a real security property for a statically linked x86 glibc binary; it was proof machinery that could be reused to prove properties of different binaries with little additional overhead. The execution model with statements and instructions for fetching the proofs can be found in [this repository↗](https://github.com/Zellic/x86-formal-verification-research).

As formally verified software is increasingly seen as a possible solution to the ongoing cybersecurity arms race, the ability to not only prove critical code secure but to do so in an efficient, affordable, and scalable way will only become more important.

This post was a research preview of our vision for formal verification of x86 binaries. We look forward to sharing more detailed breakdowns and examples over the coming weeks.

1.  Assuming we do not limit ourselves to only a very limited subset of functionalities of higher-level languages. [↩](#fnref:1 "return to article")
    
2.  Please see [https://www.anthropic.com/research/formal-verification↗](https://www.anthropic.com/research/formal-verification) [↩](#fnref:2 "return to article")
    
3.  We note that Anthropic discusses some work on formal verification for x86 in their blog post, however we are not aware of any public evidence of formal verification of security properties for end-to-end execution of x86 binaries linked with glibc. [↩](#fnref:3 "return to article")
    
4.  See the section on limitations towards the end. [↩](#fnref:4 "return to article")
    
5.  Such as signals, or a debugger writing the process’s memory. [↩](#fnref:5 "return to article")
    
6.  There is an edge-case condition in glibc start-up that could make it loop forever. We still prove claims about those runs as well. We note that in our model, elapsed time isn’t modeled and syscalls don’t block, so we don’t model the case where a program gets stuck forever on a blocking syscall. [↩](#fnref:6 "return to article")
    
7.  The classification is somewhat fuzzy but should give a roughly correct picture. [↩](#fnref:7 "return to article")
    
8.  Mostly the lower-level pedestrian work that would be very verbose and repetitive to do by hand. [↩](#fnref:8 "return to article")
    
9.  To be precise, as the machine code differs, the Lean kernel proof term is of course different. However, the same Lean metaprogram invocation can be used to generate the respective proof terms. [↩](#fnref:9 "return to article")
    
10.  Currently we only model this via an oracle invocation *between* instructions. [↩](#fnref:10 "return to article")
     
11.  These very roughly fall into two classes: the model being wrong and statements being vacuous. Here is an example of the former: Consider an instruction that contains a prefix that is illegal, where the instruction continues into the next page, which is unmapped. In that specific situation, there are two reasonable things the processor may do: complaining about the illegal prefix with the `#UD` exception or complaining about the attempted access at an unmapped page with the `#PF` exception. On some instructions where this can happen, our execution model initially used `#UD`. Later, AI auditors flagged this as violating the manuals and it was corrected to `#PF`, but different Claude Opus 5.5 instances have since voiced different opinions on what is correct in what precise situation. The human author hasn’t investigated this himself yet, but the model was either wrong first or now. Here is an example of the latter class: A proven contract for the glibc function `tcache_free_init` made the assumption that memory ranges at symbolic locations `mp` and `tmN` are disjoint. As the statement had these symbolic, this assumption does not need to obviously read as unreasonable. When attempting to use this proof at a call site, however, it turned out that `mp` is the address of a global struct, while `tmN` is the address of a field in that struct, and hence they overlapped, and the assumption of the contract was false. The proven statement about `tcache_free_init` was still true; the statement was however vacuous as stated for the real call site. The statement for `tcache_free_init` was fixed, and its proof was adjusted quickly. [↩](#fnref:11 "return to article")
     
12.  We also used GPT-6.1 Sol, as well as Claude Fable 5.1 on the very first experiments. [↩](#fnref:12 "return to article")
     
13.  As our purpose was to develop a usable formal verification framework rather than benchmarking different models on formal verification framework development abilities, we did not check whether e.g. GPT-6 Astra or Claude Fable 5.1 might also have been able to perform similarly. [↩](#fnref:13 "return to article")
