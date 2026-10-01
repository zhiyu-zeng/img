---
title: "Applied Reverse Engineering: Crude T&E for Control-Flow Tracing"
source: https://revers.engineering/applied-re-crude-te-for-control-flow-tracing/
source_host: revers.engineering
clip_date: 2026-10-01T10:30:48+08:00
trace_id: ac002e39-6b9c-4134-bbd3-c237fcd388b0
content_hash: 8bb4b0c94ac3d5af66679d2c6b3859a17832885d71d5c022757f07e2416049ea
status: synced
tags:
  - Windows逆向
  - 反调试
series: null
feed_source: revers.engineering·Windows RE
ai_summary: 用 HLT/SALC 覆盖分支指令触发非法指令异常、捕获后自行模拟并恢复，就能用两个下午从零写出一套粗糙的 trap-and-emulate 控制流追踪器，代价是极高开销与可被完整性校验发现。
ai_summary_style: key-points
images_status:
  total: 24
  succeeded: 24
  failed_urls: []
notion_page_id: 3ec75244-d011-8175-a14b-e1c84d2392a9
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 用 HLT/SALC 覆盖分支指令触发非法指令异常、捕获后自行模拟并恢复，就能用两个下午从零写出一套粗糙的 trap-and-emulate 控制流追踪器，代价是极高开销与可被完整性校验发现。
> 
> - **触发原语：** 用 `HLT`(0xF4，STATUS_PRIVILEGED_INSTRUCTION) 接 ret，`SALC`(0xD6，STATUS_ILLEGAL_INSTRUCTION) 接 jcc/jmp/call 等前向边，规避反调试对 `0xCC`/UD0-2 的扫描；不同字节还可复用为不同处理器分发。
> - **接管点与支撑：** 直接 hook `KiUserExceptionDispatcher`（绕过 VEH/SEH 链表）以最先看到异常；用 Zydis 在插桩时解码并缓存原始字节与指令信息；PE 解析建 IAT RVA→导入项的哈希表，把间接调用解析从 O(n) 降到 O(1)。
> - **性能实测：** 每次触发约 1.34–1.38 ms（线性）、955 µs（循环）、1.1 ms（混合），开销随分支数线性增长；循环负载 scale 2 基线 1.65 s 被放大到 16.8 分钟（约 600x），时序校验必然暴露。竞态与逃逸：单次扫描命中率约 12%（线性）/8%（循环），频率不改变单次概率、只改变尝试次数；15 秒固定间隔下 5 分钟会话逃逸概率约 19%（循环）/8%（线性），改 4–30 秒随机间隔则升至 24%/11%。
> - **适用边界：** 该法必然修改 `.text`，会被定期哈希校验捕获；硬件断点（DR0-DR3）、PAGE_GUARD、SLAT+MTF/LBR/IPT 可零字节改动但各有检测面。适用恶意样本、弱完整性校验软件、老式反作弊；存在段切换、`ret imm16`、rep 前缀等模拟盲区。
> - **可移植性：** 机制与 ISA 无关，ARM 的 UDF/HardFault、RISC-V 的非法指令异常同样可用，且分支模拟比 x86 更简单。

The idea of inducing faults with sentinels by patching code sections at runtime predates most of us. Fault injection for code tracing goes back to early software emulation and debugging in the 80s and 90s. Single-stepping via the trap flag dates to the 8086 (1976) and leveraging it for tracing as well in an [**old reference from 1989**](https://dl.acm.org/doi/pdf/10.1145/70082.68197), then there were guard pages for access tracking and that technique has been around since at least Windows NT. INT 3 got its own single-byte encoding specifically so debuggers could patch instructions without disturbing alignment making it an ideal candidate for similar instrumentation ideas. The core idea to replace an instruction with something that faults, catch the fault, do your work, and resume (trap-and-emulate; T&E) hasn’t changed. It will always be a useful mechanism, as long as you’re selective with your targets and know how much of the emulation you’re willing to do yourself.

![ancient texts](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/94e4da7ec7af7b1c.png)

The Ancient Texts

Recently I had a target that I wanted to revisit and thought it would be a fun exercise to effectively force myself to be **[prim-locked](https://www.urbandictionary.com/define.php?term=primlock)**, and avoid using advanced tools to gather information. So, we won’t be using a hypervisor, or complex DBI frameworks… just an exception handler, and an afternoon. We’ll cover some modern approaches to control-flow tracing, older techniques they descend from, and then build/explore a trap-and-emulate tracer from scratch and see how a slapped together tool works out for a few targets. The technique itself isn’t new or stealthy, but building one from first principles teaches you things that calling into someone else’s framework doesn’t. With a little creativity the approach generalizes to places some of those frameworks don’t necessarily go, like bare-metal embedded targets (RISC-V, ARM Cortex-M, etc). Along the way we’ll also look at an obfuscated target, and something you may run into while testing against a target with async integrity checking. When instrumenting a target I experienced intermittent termination. It became clear this was a race condition and I was winning that race some percentage of the time. The natural question that followed was how often, and whether there’s a primitive instrumentation strategy that wins more consistently than others; of course, barring using better options… because where’s the fun in that? I’ll present the data from a purpose-built harness that simulated this scenario across a range of instrumentation profiles, and we’ll look at what the numbers say about what is the best/worst outcome.

## The Need for CFT

I’ve found myself in many situations where I think “if I had a trace of some sort, I could find X or isolate Y.” The most immediate use is reverse engineering opaque binaries. Something is packed or obfuscated to high heaven, and static analysis isn’t really giving you much to go on. Anything that allows a proper control-flow trace, with the ability to acquire the processor’s context/register state at each branch becomes extremely valuable. Given some known inputs (or none at all) you’ll see which code executes and in what order, and then you get a runtime call graph of sorts without having to sit in your tool of choice for hours (that’s not entirely true, you will spend a little time in **[IDA Pro](https://hex-rays.com/ida-pro)** / **[Binja](https://binary.ninja/)** / **[Hiew](https://www.hiew.ru/)** /whatever).

Considering the known inputs angle: what about for unknown inputs? changes in the environment? Run a target binary N times with M slightly different inputs/environments and you diff the traces. In some contexts, such as malware, you may see a clear deviation in control-flow from execution within a VM and on real hardware. **[Divergence testing](https://dl.acm.org/doi/abs/10.1145/2523815)** is a great way to locate trigger points in an obfuscated target, or any target in general if it’s rather complex. Depending on what you’re doing, I’d say trigger points are where most of the interesting logic lives — for vulnerability researchers you might be looking at input validation paths, license checks, anti-tamper decisions, configuration parsing; some others might be looking at anti-cheat checks. It’s a quick way to localize specific behavior, regardless of which approach to tracing you opt for. Branch coverage is also a point of interest. If you’re feeding inputs into a target, whether via expected input paths or forcing changes to arguments while in flight, you want to know whether you’re reaching a specific area. Same idea applies to profiling hot-paths.

There’s a nice use case that is becoming more necessary with respect to reverse engineering and that is [**deobfuscation**](https://nordvpn.com/cybersecurity/glossary/deobfuscate/). **[Virtualized code](https://www.oreans.com/help/cv/hm_how-code-virtualizer-works.htm)** can make static analysis infuriatingly difficult (depending on the **[VM architecture](https://www.hackcyom.com/2024/09/vm-obfuscation-overview/)**), but with a trace at the instruction or **[basic block](https://en.wikipedia.org/wiki/Basic_block)** level you get two things: the actual control flow the obfuscator hid, and enough context to potentially simplify it. This could be a whole post on its own, but when you look at a binary statically you’re confronted with three problems: what is code and what is data, resolving indirect control flow, and constructing a complete CFG (**[control flow graph](https://www.csl.cornell.edu/~zhiruz/5997/pdf/lecture04.pdf)**). All of these must be solved before you can do any sort of meaningful analysis which is where trace-based approaches assist. With a full trace you can easily have all the indirect branches resolved, at least from areas the tool has covered. There are two primary families that exist in this area. The first being **[trace-based symbolic analysis](http://sebastien.bardin.free.fr/2018-final-dimva.pdf)** and the second: **[trace-based binary lifting and recompilation](http://download.vusec.net/papers/binrec_eurosys20.pdf)**, but we won’t be going into this much more in this post.

**\>> Note**

These alone cover many papers, articles, tools, and so on by people much more seasoned with the material. There are lots of **[resources](https://blog.quarkslab.com/exploring-execution-trace-analysis.html)** in the last section if this is interesting to you, I highly recommend at least dipping your toes in to learn the vocabulary. Before we get to the meat of the post, I want to cover the methods people actually use for CFT today. Most of them are better than what we’re about to build; but they come with development overhead, platform constraints, or dependency chains that aren’t always worth it for a targeted problem.

## Modern Landscape

If you have access to the hardware and OS support, **[Intel Processor Trace (PT)](https://lldb.llvm.org/use/intel_pt.html)** is the gold standard on x86. It records branch targets in hardware with pretty much zero overhead, encodes them into neat little compressed packets that you can then decode separately or in parallel. Be warned though, the decode tooling is non-trivial and trying to roll your own will likely cause headaches. That said, Windows has support for it within **[Event Tracing for Windows](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/event-tracing-for-windows)** or through **[WinIPT](https://ionescu007.github.io/winipt/)**; and Linux has perf integration / **[libipt](https://github.com/intel/libipt)** (also on Windows). ARM’s equivalent **[CoreSight](https://docs.kernel.org/trace/coresight/coresight.html)** provides a similar trace capability.

On the software side, there are **[JIT-translation DBI frameworks](https://www.emergentmind.com/topics/dynamic-binary-instrumentation-dbi)**. Which is what most people think of when they hear “dynamic instrumentation”. Things like Intel PIN, DynamoRIO, Stalker. They all work by translating basic blocks into a code cache, inserting analysis callbacks (user defined), and executing the translated copy. You really can’t go wrong with them, and I’d suggest anyone reading toy with how to interface with at least one of them since they are more general-purpose and will assist with handling obnoxious things like self-modifying code, threading, etc. **[Intel PIN](https://www.intel.com/content/www/us/en/developer/articles/tool/pin-a-dynamic-binary-instrumentation-tool.html)** is x86/x64, and it may not be updated going forward; **[DynamoRIO](https://dynamorio.org/)** covers x86/x64, ARM32, and AArch64 across Windows/Linux/MacOS; **[Stalker](https://frida.re/docs/stalker/)** covers AArch64, ARM32, x86, and x64, and it has a nice scripting interface using Javascript.

Debugger-based tracing is the most accessible approach and probably what many people try first. With **[x64dbg](https://x64dbg.com/)** there is an easy “ *Record Trace”* feature, and you can script the same thing for more standard RE needs. You won’t need to understand all the exception dispatch internals, but the tradeoff is performance/latency and if your target is intolerant of higher latency during runtime (or has timing checks that result in deviated control flow when failed) well… then you’re out of luck with this.

The “high investment, high-reward” side of the spectrum is **[hypervisor-assisted tracing](https://revers.engineering/7-days-to-virtualization-a-series-on-hypervisor-development/)**. The practical approach is to combine **[SLAT](https://en.wikipedia.org/wiki/Second_Level_Address_Translation)** (**[EPT on Intel](https://revers.engineering/mmu-ept-technical-details/)** / **[NPT on AMD](https://www.cse.iitd.ac.in/~sbansal/csl862-virt/2010/readings/NPT-WP-1%201-final-TM.pdf)**) with **[LBR](https://lwn.net/Articles/680985/)**; and use SLAT violations to trap on execute of specific pages, and read the LBR stack to get the branch history. The downside here is that you either have to find a hypervisor that already has this capability or similar capability ( for instance uses **[BTS](https://en.wikipedia.org/wiki/Branch_trace)** + **[CR3 Load Exit](https://kvm.vger.kernel.narkive.com/29kTYnAE/question-intercept-cr3-access-in-ept)**; and IPT in CE’s **[Ultimap 2](https://www.cheatengine.org/forum/viewtopic.php?t=615155&sid=c8c148101beed8825e30cafebcf50781)**), modify an existing open-source hypervisor, or write your own. This can be weeks, or months of development and testing depending on your starting point. The additional complexity that goes into debugging issues in this technology may also be a massive turnoff for most, but it is extremely useful once built.

![Call graph showing TPM kernel function timing](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2433bdd948f89d22.png)

Figure 1: Lean call graph from of an HV-assisted trace of an anti-cheat’s TPM context operations. (OC)

In a similar vein with hypervisor-assisted approaches, you have full emulation. **[QEMU’s Tiny Code Generator](https://wiki.qemu.org/Documentation/TCG)** (TCG) translates guest basic blocks into host code, and you can hook at the translation block boundary to log every branch target. It’s often the go-to for firmware analysis and embedded targets where you don’t have the luxury of an OS-level debugger, or easy methods for instrumentation. The tradeoff though, as usual, is speed; you can sometimes experience 10-100x slowdowns depending on the workload and how much instrumentation you bolt onto the translation pass. That’s alright for malware analysis or firmware RE where the target isn’t necessarily time-sensitive/intolerant of delays. For anything that is intolerant, you might be starting out in that “divergent” behavior state mentioned earlier.

**[Unicorn](https://www.unicorn-engine.org/)** is a fork of QEMU’s emulation core; you do the usual memory map setup, set registers, and it’ll run and give you hooks at the basic block and/or instruction level. That’s enough for CFT if you’re willing to set up the memory environment yourself, and the API is straightforward with bindings for most languages. The tradeoff is that you’re emulating code in isolation, and Unicorn is well known to have emulation bugs that hardened targets love to leverage to potentially detect if they’re being emulated. If whatever you’re tracing makes syscalls or touches anything outside the memory you’ve mapped, you have to stub that out. A great example of this requirement, not necessarily applied to control-flow analysis, is **[Dumpulator](https://github.com/mrexodia/dumpulator)**. Then there is **[Qiling](https://github.com/qilingframework/qiling)**, which was built on top of Unicorn to fill the gap mentioned by emulating the OS layer (syscall dispatch, file system, registry, threading), and it’s probably the closest thing to plug-and-play without standing up an actual VM. Both of them inherit Unicorn’s performance profile and the bugs that go along with it, but for targeted analysis of specific functions or regions of code rather than tracing a full application I’d say they’re fine to use. Another great one is [**Speakeasy**](https://github.com/mandiant/speakeasy).

Below is an example of what it might look like with Unicorn’s C++ bindings and some custom wrappers:

dump_cfg.cpp  
C++ ▸

```cpp
emu.map_image( pe.raw(), pe.image_base(), pe.image_size() );
emu.apply( global_block_hook, pe.entry_point() );
emu.run( pe.entry_point(), pe.entry_point() + 0x4a00 );

auto &cfg = emu.cfg();
std::ofstream dot( "cfg_output.dot" );
dot << "digraph cfg {\n"
    << "    node [shape=box fontname=\"Consolas\" fontsize=10];\n";

for ( auto &&bb : emu.blocks() )
{
    dot << "    \"0x" << std::hex << bb.address
        << "\" [label=\"0x" << bb.address
        << "\\nsize: " << std::dec << bb.size << "\"];\n";

    for ( auto succ : cfg.successors( bb.address ) )
    {
        dot << "    \"0x" << std::hex << bb.address
            << "\" -> \"0x" << succ << "\";\n";
    }
}

dot << "}\n"; dot.close(); fmt::print( "{} blocks, {} edges -> cfg_output.dot\n",
    emu.blocks().size(), cfg.edge_count() );
```

And then there is **[static binary rewriting (SBR)](https://mediatum.ub.tum.de/download/1510415/1510415.pdf)**, which modifies the binary on disk and avoids any runtime framework overhead. An example of this is **[e9patch](https://github.com/GJDuck/e9patch)**. Which does this at the instruction level by inserting trampolines at selected instruction boundaries without relocating surrounding code, which is a harder problem than it sounds given x86’s variable-length encoding and the density of relative references in optimized binaries. That said, you point it at a binary, tell it where to instrument, and it produces a patched copy that jumps out to your analysis callbacks at those points. The constraint is that it’s a static transform, so self-modifying or runtime-generated code, packed binaries, or binaries with integrity checks built in that validate blocks of other functions or next blocks are out of scope unless you deal with that first. Another one worth mentioning: **[peafl64](https://github.com/Sentinel-One/peafl64)**. You could always roll your own, and some things covered in this post will be useful if you decide to go that route.

#### — TL;DR

The common thread across all of these is development overhead versus generality. Hardware tracing gives you the best performance and control but locks you to specific processors, decode tooling, and potentially loads of development overhead as you read the SDM and learn how to take advantage of the processor features. JIT-translation frameworks are general-purpose but come with their own execution model you have to work within. Emulation gives you total control but at significant speed cost, and potential detection vectors that can be difficult to resolve; static rewriting has its drawbacks, and all of them require you to learn someone else’s abstractions before you can get to the problem you actually want to solve. What we’re about to explore is none of the above. It’s very crude, narrow in scope, makes tradeoffs that any of these frameworks and most professionals would consider unacceptable; but it only takes an afternoon or two to write.

## T&E for Branch Tracing

The general idea here is conceptually straightforward. You replace an instruction in the target with one that will induce a fault, the framework has placed a hook that will catch that fault, and you do whatever work needed (log, modify state, redirect execution, etc), and then you resume. If you’ve read my other posts or are already familiar with hypervisors in some form, they also utilize a trap-and-emulate scheme. Debuggers catch breakpoint exceptions to take control, we’re going to take control with two known faulting instructions (at least in 64-bit usermode): **[HLT](https://revers.engineering/x86/hlt.pdf)** and **[SALC](https://www.pcjs.org/documents/manuals/intel/8086/ops/SALC/)**.

**\>> Why undefined instructions over INT 3 or other methods?**

[**INT 3**](https://revers.engineering/x86/into.pdf) is the obvious choice, but the target (or its runtime, or an anti-debug layer) may already be watching for [**STATUS_BREAKPOINT**](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-erref/596a1078-e883-4972-9bbc-49e60bebca55) exceptions. If you use [**INT 3**](https://revers.engineering/x86/into.pdf) any anti-debug check that scans for \`0xCC\` bytes will trip over the instrumentation. The same applies to [**UD0-2**](https://revers.engineering/x86/ud.pdf) which are common alternatives within debuggers. The exception we’ll be catching is [**STATUS_ILLEGAL_INSTRUCTION**](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-erref/596a1078-e883-4972-9bbc-49e60bebca55) or **[STATUS_PRIVILEGED_INSTRUCTION](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-erref/596a1078-e883-4972-9bbc-49e60bebca55)** depending on what you chose, which most anti-debug scans aren’t looking for. There is also the multiplexing that can be done since the use of different byte sequences means you can dispatch to different handlers. Instrument forward-edge transfers with one, backward-edge transfers with another, and bolt on target-specific hooks with a third.

For control-flow tracing we only care about control-flow transfer instructions. Relative to the call graph, we’re going to use a fast and loose definition *(i.e. does not match the exact abstract definition in **[DFS edge classifications](https://courses.csail.mit.edu/6.006/spring11/rec/rec13.pdf)**)* for the types of transfers that occur.

#### 𝛿 Forward-edge transfers

Forward-edge control flow transfers direct code forward to a new location, every call or jump. At a source level, these map to constructs like switch statements, virtual calls, indirect calls, and so on. The “forward” in this context doesn’t correspond with where the destination being transferred to resides in memory. If you’re jumping higher or lower in memory, it’s still a forward-edge control flow transfer. In x86, the instructions this covers are `jcc`, `jmp`, and `call`.

#### 𝛿 Backward-edge transfers

Backward-edge control flow transfers are used to return to a location that was used in a forward-edge earlier, i.e. when returning from a call through the return instruction: `ret`.

All that’s required then is to emulate their behavior in the exception handler(s), build the framework to enable easy instrumentation, and eventually we’ll be able to have a nice call graph generated on both standard and obfuscated targets that allows us to identify machinery like dispatch loops or large switch tables.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7d7c6425ba4b1609.png)

Figure 2: Obfusacted Dispatch (left); Naive hook check (right). (OC)

**\>> Differences in Literature**

When it comes to [**control-flow integrity literature**](https://arxiv.org/abs/1602.04056), you will find that the definition for forward-edge transfers is more constrained. With x86 it is typically referencing only indirect `call` or `jmp` instructions (i.e., `call rax`, `call [rbx+8]`, `jmp rdx`, `jmp [r14*8+N]`).

## Architecture

Before writing any code I spent some time on white-boarding what this thing actually needed. Most of the decisions that follow came from trying to keep the tool simple enough to finish quickly, while still leaving hooks in the right places so I wouldn’t want to play in traffic when I wanted to point it at a different target a week later. Below is a diagram giving a high-level overview.

**\>> Multithreading Support**

This part **does not** cover details of tracking cross-thread traps and ensuring coherency across them. It is possible to do effectively, but it’s a bit verbose for this article. It is also highly dependent on your implementation. Unfortunately, I have to pull the “left as an exercise to the reader” on this unless you want that scroll bar to be really small.

![Diagram of the Architecture](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/370728a2ec36284f.png)

Diagram of the Architecture

### — Disassembly

The first thing needed was a disassembler. The handler has to know what instruction it’s emulating and what its operands are, which means decoding the original bytes we stashed away when we wrote the sentinel. I could roll my own decoder, it’s a well-understood exercise, but that might not be the best use of time. So I opted for [**Zydis**](https://zydis.re/), it’s statically linkable, the API hands you back a fully decoded `ZydisDisassembledInstruction` with the mnemonic and operands in a structured form, and I’m proficient with the API; but it all depends on constraints. I made a thin wrapper around [**Zydis**](https://zydis.re/) that exposes a couple of methods I’ll need:

-   `fetch(rip)` to decode one instruction.
-   `fetch_from(ptr, count)` to walk forward some number of instructions.
-   a template filter pair `keep_if` / `keep_any` that takes predicates like `is_ret`, `is_jcc`, `is_call_imm`, `is_indirect_call`, `is_indirect_jmp` and returns only the instructions matching them.

I’m a big fan of **[functional composition](https://ngathanasiou.wordpress.com/2023/03/05/composing-callables-in-modern-c/)** when writing code, which you’ll see in the excerpts below from this wrapper. The idea is that I’d give it a starting address and a predicate, and it’ll return back the list of branch instructions to write the triggers over.

disasm.cpp – fetch & filters  
C++ ▸

```cpp
ZydisDisassembledInstruction inst{};
std::vector insts;

ZydisDisassembledInstruction &disasm::fetch(n86 address) {
  data = (u8 *)address;

  if (ZYAN_SUCCESS(ZydisDisassembleIntel(TARGET_ZYDIS_MACHINE_MODE, address,
                                         data, 0x10, &inst))) {
    return inst;
  }

  strcpy_s(inst.text, 0x4, "BAD");
  return inst;
}

std::vector &disasm::fetch_from(n86 address, n86 count) {
  data = (u8 *)address;
  n86 offset = 0;

  ZydisDisassembledInstruction local{};
  for (auto it = 0ull; it < count; it++) {
    if (ZYAN_SUCCESS(ZydisDisassembleIntel(TARGET_ZYDIS_MACHINE_MODE, address,
                                           data + offset, 0x10, &local))) {
      insts.push_back(local);

      address += local.info.length;
      offset += local.info.length;
    } else {
      local.runtime_address = address;
      strcpy_s(local.text, 0x4, "BAD");
      insts.push_back(local);

      break;
    }
  }

  return insts;
}

template 
std::vector &keep_if(Pred... pred) {
  auto new_end = std::remove_if(insts.begin(), insts.end(),
                                [&](const ZydisDisassembledInstruction &ins) {
                                  return !((pred(ins) && ...));
                                });

  insts.erase(new_end, insts.end());
  return insts;
}

template 
std::vector &keep_any(Pred... pred) {
  auto new_end = std::remove_if(insts.begin(), insts.end(),
                                [&](const ZydisDisassembledInstruction &ins) {
                                  return !((pred(ins) || ...));
                                });

  insts.erase(new_end, insts.end());
  return insts;
}
```

The decoded instructions are validated/emulated in the handler shown later. When the trigger induces a fault, we look up the faulting RVA in our trap map, pull out the `ZydisDisassembledInstruction` we stored there, and use its mnemonic, operands, and instruction length field to figure out what the original instruction would have done. Of course, this could be optimized as with everything, but it’s quick to write. The decode happens once at instrumentation time and we cache the result alongside the original bytes (which will be useful if we decide to restore them later).

### — Catching Exceptions without VEH or SEH

I needed to catch exceptions without touching the VEH handler list or installing SEH records. The target might have its own VEH handlers, it might walk the list and look for something it doesn’t recognize, and either way VEH handlers run *after* the kernel has dispatched the exception record through [**KiUserExceptionDispatcher**](https://momo5502.com/posts/2024-09-07-a-journey-through-kiuserexceptiondispatcher/). If I want to be the first thing that sees the exception, I want to be **[KiUserExceptionDispatcher](https://momo5502.com/posts/2024-09-07-a-journey-through-kiuserexceptiondispatcher/)**. Some have opinions about this, but it’s generally fine. Ken Johnson covers the internals of user-mode exception dispatch in detail [**here**](http://www.nynaeve.net/?p=99) for anyone who wants to go deeper than I’m going to here. How you hook **[KiUserExceptionDispatcher](https://momo5502.com/posts/2024-09-07-a-journey-through-kiuserexceptiondispatcher/)** is up to you, I opted for an assembly stub that matches the prologue and invokes my function then tail-calls **[RtlDispatchException](https://blog.elmo.sg/posts/structured-exception-handler-x64/)**. From there, the exception code drives our dispatch.

```cpp
if (excr->ExceptionCode == STATUS_ACCESS_VIOLATION)                di.handle_access_violation(...);
else if (excr->ExceptionCode == STATUS_ILLEGAL_INSTRUCTION ||
         excr->ExceptionCode == STATUS_PRIVILEGED_INSTRUCTION)     di.handle_invalid_instruction(...);
else if (excr->ExceptionCode == EXCEPTION_SINGLE_STEP)             di.handle_debug_exception(...);
else { ... }
```

### — PE Parsing

At minimum, I needed to know where `.text` lives. Because if my instrumentation walks off the end of a code section into data or padding, I’ll wind up writing these sentinels into areas that never execute, or potentially corrupting data that’s used. Beyond that, while I’m getting this information I might as well parse the rest of the binary; imports (for indirect call resolution later), exports and the entry point (as seeds for CFG building), `.pdata` (x64 unwind entries, assisting with function discovery / bounds checking), TLS callbacks (if I want to interpose on these), and some other components. Ideally, I wanted this to work for two modes; runtime, where you point it at a mapped module and it parses directly from memory; or file-backed, hand it a path and it reads the binary from disk. Both were added because I wanted to be able to pre-compute things offline during development, but the runtime mode is what the module actually uses. Originally, this was going to parse from disk, but I’d probably just recommend computing at runtime. YMMV. We’re speeding through this because there is a ton of content… excuse the brevity.

Something to consider for this project is runtime performance. After walking all the import descriptors, it builds an IAT map keyed by the IAT RVA, pointing to the corresponding import entry. That hash map turns what would be an O(n) linear scan through imports into O(1) lookup, so when our handlers are trying to resolve an indirect call through `[rip+disp]` and have to figure out if it’s an imported function it’s calling it doesn’t taking a lifetime. This might seem like a weird thing to throw in, but in situations where custom tooling is needed and you’re going to have things interposing on operations potentially millions of times or tens of thousands… you’re going to want to optimize where you can. Most of the time you can get away with not worrying about runtime in ad-hoc tooling, but in this case it’d be shooting yourself in the foot.

```cpp
if ( !parse_imports() )
    return false;

// ... etc ...

for ( auto& imp : imports )
    iat_map[ imp.iat_rva ] = &imp;
```

### — Framework Configuration

I wanted to be able to point this thing at different targets without having to deal with hardcoded/specialized behavior. Say Binary A wants to ignore certain RVAs (maybe it has an anti-tamper probe at a known offset that checks a function hash inline). Binary B has a pattern-matched entry point somewhere in the middle of a function, and needs different trigger sequences for its `syscall` stubs. Binary C has external memcpy/malloc calls that I want to log separately from normal branches; and so on. Designing a tool to avoid this over-specialization requires some planned modularity/configuration.

The pattern I followed initially was just to create configuration object that sported various fields like `ignore_ranges` (ranges of RVAs the engine never instruments), `entry_patterns` (byte patterns to scan for and instrument with custom sentinels), `custom_handlers` (byte sequences paired with callbacks), some additional predicates, plus a handful of diagnostic enables. But, like every first pass at a tool, this pattern became a bit shit as I tested things on more binaries; it’s referred to as a **[kitchen-sink config](https://codemia.io/knowledge-hub/path/what_is_exact_meaning_of_kitchen_sink_in_programming)**. The better fit would be a plugin architecture of sorts where behaviors become a plugin. We could have a whole post on its own with the problems that come with the Propbag-like design, but the primary problem is you end up with lots of fragments, sometimes to the same thing but for configs under different names/for different targets/etc. So I tore that up, and made a smaller structure with universal elements plus a vector of plugins and made the plugin class a base that exposed main decision points the engine will care about.

```cpp
struct dbi_plugin {
    virtual void install(dbi&) {}
    virtual bool on_trigger(dbi&, n86, PCONTEXT, PEXCEPTION_RECORD)      { return false; }
    virtual bool on_access_violation(dbi&, PCONTEXT, PEXCEPTION_RECORD)  { return false; }
    virtual bool on_debug_exception(dbi&, PCONTEXT, PEXCEPTION_RECORD)   { return false; }
    virtual void on_discovery(dbi&, n86, PCONTEXT, PEXCEPTION_RECORD)    {}
    virtual bool is_rva_ignored(dbi&, n86)                               { return false; }
};
```

This makes managing logic that should be shared between configs and allowing custom extension infinitely easier.

```cpp
dbi_config create_target_config() {
    dbi_config cfg;
    cfg.max_valid_rva = 0x3400000;
    cfg.log_path = "target_run.log";
    cfg.preserve_unhit_traps = false;

    cfg.extensions.push_back(
		std::make_unique()
	);
	
    cfg.extensions.push_back(
		std::make_unique(
			pcache.find("memcpy", "ucrtbase"), {0xf0, 0xfb}
		)
	);
	
    cfg.extensions.push_back(
		std::make_unique(
			pcache.find("malloc", "ucrtbase"), {0xf0, 0xfc}
		)
	);
	
    return cfg;
}
```

Just a few lines, each one being a single extension that we can quickly open and read/extend. When it comes to building tools to assist with reverse engineering / binary analysis, investing in thoughtful design will pay off. Knowing what design patterns exist and when to use them will also result in higher-quality tooling for yourself or others… and make maintaining it way less of a headache if/when you come back to it. And in this day and age, if you don’t know what patterns might fit you have the thinking rocks named Claude available now.

### — Exception Handling Logic

This is where the emulation happens, and I’ll go deeper into the mechanics in a bit, so here I’ll just walkthrough the general shape with some details omitted in the code excerpts to keep the concept clear. Looking at the code excerpt below, whenever `handle_invalid_instruction` fires, the first it does is read the bytes at the faulting RIP and look them up in a map called `active_traps`. If it finds a match, it dispatches on the trigger bytes:

– `F4` **([HLT](https://revers.engineering/x86/hlt.pdf), STATUS_PRIVILEGED_INSTRUCTION)** dispatch to ret handler. Restore original bytes, Read return address from `[rsp]`, validate it, push it through reinstrumentation, update context, and resume.  
– `D6` **([SALC](https://www.pcjs.org/documents/manuals/intel/8086/ops/SALC/), STATUS_ILLEGAL_INSTRUCTION)** dispatch to branch handler. In this handler we will also restore original bytes first, then figure out what the original instruction was (jcc? call? indirect jmp?), evaluate the operand and EFLAGS as needed, compute the target, validate it, reinstrument forward from the target, update context, and resume.  
– Anything else matching a custom trigger registered in `dbi_config::custom_handlers` will dispatch to the target-specific callback (syscall stubs, memcpy hooks, whatever).

**\>> Additional Requirements**

If you attempt to track control flow across segment boundaries like 64-bit code to 32-bit code, you’d need to change from **SALC** to something else since it works in 32-bit compatibility mode.

We’ll cover the details of each of these as we discuss the implementation in a later section, this is just a preface to assist with the mental model needed. The last thing we’ll go over before all the details is the various strategies, what they might look like, and their drawbacks (ignoring that this method as a whole has pretty painful drawbacks).

## Instrumentation Strategies

With the handler, disassembler, and PE parsing in place the question becomes where and when to actually write the triggers. There are three reasonable approaches, and as with everything, they make different tradeoffs; so I built the engine to support all of them through the same primitive `instrument_if` and let the configuration decide which one runs. The primary concern is coverage versus exposure; how many branches you patch at once, and how long they are present in memory.

```cpp
for (auto& point : instrumentation_points) {
    instrument_if(point, config.default_window_size, true, "\xd6",
                  is_indirect_call, is_indirect_jmp, is_jcc, is_call_imm);
    instrument_if(point, config.default_window_size, true, "\xf4", is_ret);
}
```

#### 𝛿 Bounded Bulk Patching

From a starting address, decode instructions forward sequentially up to a size threshold. Every branch instruction found in that region (jumps, conditional jumps, calls, returns) gets its first byte overwritten with a trigger byte. This all happens at once before any of the code in that region runs. When execution later reaches any of these branches, it faults into your handler where you can inspect the branch type, log it, redirect it, or otherwise process it. This single scan instruments an entire region in a single pass, and progressively does it as your program faults and checks if there are active trigger bytes in the region of the fault.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0a594853cb07c010.png)](https://i0.wp.com/revers.engineering/wp-content/uploads/2026/04/ida_7cK4cZyqPb.png?ssl=1)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/270c2cf922dc76b1.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2e1516f814207928.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/988bb3e9ce8ce407.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9d33f9ff0c2077fc.png)

You might already guess that this is a pretty “dumb” approach, as in there is very little guiding it and there is a possibility that on any given obfuscated target it overshoots a function boundary and instruments a region that may be important.

[  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/01f9b9ee85b145db.png)](https://i0.wp.com/revers.engineering/wp-content/uploads/2026/04/ida_yQLqW18ZUw.png?ssl=1)

Depending on the window size you define, for how far it should disassemble ahead to find branches, it may instrument in places it shouldn’t and cause divergent program behavior. A less ideal solution to this problem is to reduce the window size, but that risks not finding branches in functions with lots of arithmetic operations prior to a control-flow transfer. Another issue is that your instrumentation of all of those branches is present in memory until to leave the region, or until program termination. That depends on your implementation.

For now, the `instrument_if` function looks like this, but it will expand as we add support for different strategies.

```cpp
template 
std::vector &
dbi::explore_and_store(const n86 ptr, const n86 window_size, Pred... pred) {
  dasm.insts.clear();
  auto insts = dasm.fetch_from(ptr, window_size);
  dasm.insts = dasm.keep_any(std::forward(pred)...);

  return dasm.insts;
}

template 
void dbi::instrument_if(n86 rip, n86 window_size, bool only_next,
                        const char *with_bytes, Pred... is_kind) {
  auto insts =
      explore_and_store(rip, window_size, std::forward(is_kind)...);
  auto len = strlen(with_bytes);

  std::ranges::sort(insts, std::less{},
                    &ZydisDisassembledInstruction::runtime_address);

  protect_guard guard((void *)rip);

  for (auto &ins : insts) {
    auto rva = ins.runtime_address - (n86)image_base;

    if (active_traps.contains(rva))
      continue;

    if (is_rva_ignored(rva))
      continue;

    auto to_instrument = utils::get_bytes(ins.runtime_address);
    auto ob = utils::copy_bytes(ins.runtime_address);

    active_traps[rva] = std::make_tuple(ins, ob);

    for (auto n = 0; n < len; n++) {
      to_instrument[n] = with_bytes[n];
    }
  }
}
```

The logic is pretty straightforward. Fetch instructions from the given address up to the window size, filter them out based on the predicates specified in the calls to `instrument_if`, return the list of instructions. We then sort the instructions by ascending runtime address. This is to ensure that the first element in the instructions vector is whatever the disassembler happened to encounter first during the forward walk and filter pass. Following, we check if the address is already instrumented and if the rva is in our ignore list, then overwrite the bytes with our decided sentinel. Simple enough.

#### 𝛿 Branch Chasing (Lookahead Instrumentation)

This strategy minimizes the number of changes made up front during execution, and starts by patching a single branch instruction from a seed location (initial point of interest). When it faults, the handler restores the original byte at that location, identifies the branch type (`ret`, `jmp` / `jcc`, or `call`), and uses the target address as the starting point for a forward scan to find and patch in the next branch. Ideally, each fault restores the previous site and instruments the next one, so only a small window of sentinels exists in memory at any given time. Then we move the instrumentation forward one branch at a time, following the actual control flow; and it only requires a slight change in the logic in `instrument_if`.

```cpp
template 
void dbi::instrument_if(n86 rip, n86 window_size, bool only_next,
                        const char *with_bytes, Pred... is_kind) {
  for (auto &ins : insts) {
   // ... existing implementation ...
   
   if(only_next)
      break;
  }
}
```

Now, if we call `instrument_if` with `only_next` set to true, it will only instrument the next branching instruction. However, I wound up writing another function to reset and reinstrument from the current control-flow instruction in the exception handler.

```cpp
void dbi::reinstrument(n86 next_rip) {
  n86 rva = utils::get_rva(next_rip, (n86)image_base);

  if (is_rva_ignored(rva)) {
    return;
  }

  if (!config.preserve_unhit_traps)
    reset_traps();

  n86 window = config.reinstrument_window_size;
  if (block_map) {
    auto safe = block_map->safe_window(rva, (const u8 *)image_base);
    if (safe > 0 && safe < window)
      window = safe;
  }

  instrument_if(next_rip, window, true, "\xd6", is_indirect_call,
                is_indirect_jmp, is_jcc, is_call_imm);

  instrument_if(next_rip, window, true, "\xf4", is_ret);
}
```

The `preserve_unhit_traps` flag controls whether we blow away the previous window’s traps before writing new ones. If false (the default), the target’s `.text` only ever contains sentinels from the last 0x40 instructions of forward execution, which minimizes the instrumented surface. If true, sentinels accumulate. That’s good for loops where the back-edge should stay instrumented, bad for integrity checks scanning the section. The `safe_window` query clamps the window to the current basic block’s boundary if we have the CFG, which prevents the decoder from walking past the block into data or a different function, which we’ll talk more about in the next strategy description.

In any case, this strategy minimizes the amount of time any single patch is present in memory, and number of changes made up front. Each sentinel only exists for the brief window between being placed and being hit. A target’s integrity checker has a very small number of modified bytes to catch at any given moment, and whether it does comes down to timing.

#### 𝛿 CFG-guided Bulk Patching

This strategy attempts to find a middle ground. From a set of seed addresses (entry point, exports, TLS callbacks,.pdata entries), we perform a **[recursive descent disassembly](https://www.infosecinstitute.com/resources/reverse-engineering/linear-sweep-vs-recursive-disassembling-algorithm/)** to build a control flow graph. The CFG identifies all basic blocks and their branch terminators, following both sides of conditional branches and call targets to map out the reachable code structure. Every branch across all discovered blocks is then patched with a sentinel in one pass before execution begins. This gives the same batch instrumentation as the bounded scan, but guided by the actual control flow structure rather than a **[linear sweep](https://nicolo.dev/en/blog/disassembling-binary-linear-recursive/)**. Only reachable branches get instrumented, and dead code or data embedded in the code section is skipped because the CFG only visits blocks it can prove/determine are potentially reachable. This is more of an additional exercise to dive into some other deeper topics and toy with an existing implementation. I would advise implementation of this strategy be reserved for after you have a more mature, well designed project.

The CFG also benefits branch-chasing when both are combined. When the handler reinstruments at a branch target, it queries the graph for a `safe_window` to avoid disassembling past the end of a basic block into data or padding. Without the graph you’re walking forward linearly and hoping the decoder doesn’t misparse something and/or everything is reachable; with it, you stop at the block boundary. The builder in this project caps at 50,000 blocks and has a sweep pass for gaps in executable sections that the **[recursive descent](https://en.wikipedia.org/wiki/Recursive_descent_parser)** didn’t reach, which handles most non-obfuscated targets well enough. Anything that uses computed gotos, mid-instruction jumps, or self-modifying dispatch will produce an incomplete graph, but that’s inherent to **[static CFG recovery](https://docs.angr.io/en/latest/analyses/cfg.html)** and not specific to this tool. The tradeoff is the same exposure concern as the bounded scan. All patches live in memory at once and a checksummer with the right granularity can find them. You also pay the upfront cost of building the graph, which includes the seed collection, recursive descent, IAT resolution for indirect calls, and the sweep pass. It’s decently fast for a normal binary. For something built to fuddle static disassembly it may not be worth the effort, and branch-chasing on its own will get you further. This is also the case if you decide to do CFG recovery in a lookahead form, it will add substantial overhead.

All three go through the same `instrument_if` primitive and with our current intended design the only thing that changes between them is what populates `instrumentation_points` and how large the windows are. I didn’t want to lock in a strategy at design time and find out later it was wrong for the next target, so every strategy is just a configuration change. Using this technique, a first pass against an unknown binary where you want to know what executes, branch-chasing is the right starting point. For a known region where you want complete coverage in one pass (tracing a specific protocol handler you’ve located statically, for example), the bounded scan or CFG-guided approach is more efficient because you don’t pay reinstrumentation overhead for every single branch, and you get coverage from the first execution rather than needing multiple passes to reach rarely-taken paths. If the target has a parallel integrity check, the answer depends on the check’s timing and granularity, and that’s exactly what we’ll quantify in one of the next sections.

This is an excerpt from the function in my CFG builder that performs [**recursive descent**](https://blog.trailofbits.com/2022/01/05/toward-a-best-of-both-worlds-binary-disassembler/). It’s a bit too dense to go over in this post, but plenty of resources at the end to explore.

cfg.cpp – recursive descent  
C++ ▸

```cpp
void cfg_builder::recursive_descent(n86 seed_rva) {
  if (!pe)
    return;

  if (graph.blocks.size() >= max_total_blocks)
    return;

  if (!pe->is_valid_rva(seed_rva) || !pe->is_executable(seed_rva))
    return;

  auto existing = graph.block_at(seed_rva);
  if (existing && existing->start_rva != seed_rva) {
    split_block_at(seed_rva);
    return;
  }

  if (graph.blocks.contains(seed_rva) || visited.contains(seed_rva))
    return;

  visited.insert(seed_rva);

  basic_block bb{};
  bb.start_rva = seed_rva;
  bb.from_sweep = mark_from_sweep;
  bb.terminator = bb_terminator::unknown;

  auto blk = seed_rva;

  for (u32 idx = 0; idx < max_instructions_per_block; idx++) { if (!pe->is_valid_rva(blk) || !pe->is_executable(blk))
      break;

    ZydisDisassembledInstruction inst{};
    if (!decode_inst(*pe, blk, inst))
      break;

    auto next_rva = blk + inst.info.length;
    bb.inst_count++;

    if (inst.info.mnemonic == ZYDIS_MNEMONIC_RET) {
      bb.terminator = bb_terminator::ret;
      blk = next_rva;
      break;
    }

    if (is_hard_stop_mnemonic(inst.info.mnemonic)) {
      bb.terminator = bb_terminator::hard_stop;
      blk = next_rva;
      break;
    }
    if (inst.info.mnemonic == ZYDIS_MNEMONIC_JMP) {
      if (inst.operands[0].type == ZYDIS_OPERAND_TYPE_IMMEDIATE) {
        auto target_va = inst.runtime_address + inst.info.length +
                         inst.operands[0].imm.value.s;
        auto base = runtime_base(*pe);
        if (target_va >= base) {
          auto target_rva = target_va - base;
          if (pe->is_valid_rva(target_rva) && pe->is_executable(target_rva)) {
            add_entry(bb.successors, target_rva);
            split_block_at(target_rva);
            recursive_descent(target_rva);
          }
        }

        bb.terminator = bb_terminator::jmp;
      } else {
        bb.terminator = bb_terminator::indirect_jmp;
        bb.indirect = indirect_info{};
      }

      blk = next_rva;
      break;
    }

    if (is_jcc(inst.info.mnemonic)) {
      if (inst.operands[0].type == ZYDIS_OPERAND_TYPE_IMMEDIATE) {
        auto target_va = inst.runtime_address + inst.info.length +
                         inst.operands[0].imm.value.s;
        auto base = runtime_base(*pe);

        if (target_va >= base) {
          auto target_rva = target_va - base;
          if (pe->is_valid_rva(target_rva) && pe->is_executable(target_rva)) {
            add_entry(bb.successors, target_rva);
            split_block_at(target_rva);
            recursive_descent(target_rva);
          }
        }
      }

      if (pe->is_valid_rva(next_rva) && pe->is_executable(next_rva)) {
        add_entry(bb.successors, next_rva);
        split_block_at(next_rva);
        recursive_descent(next_rva);
      }

      bb.terminator = bb_terminator::jcc;
      blk = next_rva;
      break;
    }

    if (inst.info.mnemonic == ZYDIS_MNEMONIC_CALL) {
      if (inst.operands[0].type == ZYDIS_OPERAND_TYPE_IMMEDIATE) {
        auto target_va = inst.runtime_address + inst.info.length +
                         inst.operands[0].imm.value.s;
        auto base = runtime_base(*pe);

        if (target_va >= base) {
          auto target_rva = target_va - base;
          if (pe->is_valid_rva(target_rva) && pe->is_executable(target_rva)) {
            add_entry(graph.function_entries, target_rva);
            recursive_descent(target_rva);
          }
        }

        bb.terminator = bb_terminator::call;
      } else {
        bb.terminator = bb_terminator::call_indirect;
        bb.indirect = indirect_info{};
      }

      if (pe->is_valid_rva(next_rva) && pe->is_executable(next_rva)) {
        add_entry(bb.successors, next_rva);
        split_block_at(next_rva);
        recursive_descent(next_rva);
      }

      blk = next_rva;
      break;
    }

    bb.terminator = bb_terminator::fallthrough;
    blk = next_rva;
  }

  bb.end_rva = blk;
  bb.size = bb.end_rva - bb.start_rva;

  if (bb.size == 0)
    return;

  graph.blocks[bb.start_rva] = bb;
  graph.block_starts.insert(bb.start_rva);
}
```

Now, let’s go over some of the requirements for emulating branches.

## Emulating Branches

If you’ve worked with VEH/SEH then, well most of this post isn’t news to you. However, I’m going to cover this anyways. When a sentinel causes a fault we land in the `handle_invalid_instruction` with a pointer to the full thread context. The faulting RIP points at our sentinel byte, and we know that the original instruction needs to be emulated. That emulation encompasses all condition evaluations, target address computation, updating thread context, and adjusting the stack according to the operation (for `call` / `ret`). This is probably the most “complex” part of the tracer logic. As we know from earlier, we store the decoded instruction and the original bytes in `active_traps` at instrumentation time. When the fault comes in, we look up the faulting RVA, pull out the cached instruction, and dispatch on the mnemonic.

### — Conditional jumps

The `jcc` family is the most involved case because we have to evaluate [**EFLAGS**](https://en.wikipedia.org/wiki/FLAGS_register#:~:text=In%20the%20Intel%208086%2C%20the%20register%20is,registers%20retain%20compatibility%20with%20their%20smaller%20predecessors.) to determine whether the branch is taken. Intel defines [**numerous condition codes**](https://revers.engineering/x86/jcc.pdf), each testing some combination of the overflow, carry, zero, sign, parity, and value of cx. The status flags are specified in Chapter 3 of the Intel SDM (Volume 1, Section 3.4.3.1, Table 3-14 in recent printings) and the JCCs map directly to the opcodes 0x70 through 0x7F for short forms, 0x0F80 though 0x0F8F for the near forms. So, rather than a switch statement with a bunch of cases, we’re just going to do a little lookup table that maps each mnemonic to a function that evaluates the relevant flags from **[EFLAGS](https://en.wikipedia.org/wiki/FLAGS_register#:~:text=In%20the%20Intel%208086%2C%20the%20register%20is,registers%20retain%20compatibility%20with%20their%20smaller%20predecessors.)**:

dbi.cpp – condition checkers  
C++ ▸

```cpp
#define FLAG_CF (1 << 0)  // carry
#define FLAG_PF (1 << 2)  // parity
#define FLAG_AF (1 << 4)  // auxiliary
#define FLAG_ZF (1 << 6)  // zero
#define FLAG_SF (1 << 7)  // sign
#define FLAG_TF (1 << 8)  // trap
#define FLAG_IF (1 << 9)  // interrupt
#define FLAG_DF (1 << 10) // direction
#define FLAG_OF (1 << 11) // overflow

#define GET_FLAG(eflags, flag) ((eflags & flag) != 0)
#define GET_CF(eflags) GET_FLAG(eflags, FLAG_CF)
#define GET_PF(eflags) GET_FLAG(eflags, FLAG_PF)
#define GET_ZF(eflags) GET_FLAG(eflags, FLAG_ZF)
#define GET_SF(eflags) GET_FLAG(eflags, FLAG_SF)
#define GET_OF(eflags) GET_FLAG(eflags, FLAG_OF)

typedef bool (*condition_checker_t)(uint64_t eflags);

bool check_jo(const uint64_t eflags) {
  return GET_OF(eflags);
} // Jump if overflow
bool check_jno(const uint64_t eflags) {
  return !GET_OF(eflags);
} // Jump if not overflow
bool check_jb(const uint64_t eflags) {
  return GET_CF(eflags);
} // Jump if below (CF=1)
bool check_jnb(const uint64_t eflags) {
  return !GET_CF(eflags);
} // Jump if not below (CF=0)
bool check_je(const uint64_t eflags) {
  return GET_ZF(eflags);
} // Jump if equal (ZF=1)
bool check_jne(const uint64_t eflags) {
  return !GET_ZF(eflags);
} // Jump if not equal (ZF=0)
bool check_jbe(const uint64_t eflags) {
  return GET_CF(eflags) || GET_ZF(eflags);
} // Jump if below or equal
bool check_jnbe(const uint64_t eflags) {
  return !GET_CF(eflags) && !GET_ZF(eflags);
} // Jump if not below or equal
bool check_js(const uint64_t eflags) { return GET_SF(eflags); } // Jump if sign
bool check_jns(const uint64_t eflags) {
  return !GET_SF(eflags);
} // Jump if not sign
bool check_jp(const uint64_t eflags) {
  return GET_PF(eflags);
} // Jump if parity
bool check_jnp(const uint64_t eflags) {
  return !GET_PF(eflags);
} // Jump if not parity
bool check_jl(const uint64_t eflags) {
  return GET_SF(eflags) != GET_OF(eflags);
} // Jump if less
bool check_jnl(const uint64_t eflags) {
  return GET_SF(eflags) == GET_OF(eflags);
} // Jump if not less
bool check_jle(const uint64_t eflags) {
  return GET_ZF(eflags) || (GET_SF(eflags) != GET_OF(eflags));
} // Jump if less or equal
bool check_jnle(const uint64_t eflags) {
  return !GET_ZF(eflags) && (GET_SF(eflags) == GET_OF(eflags));
} // Jump if not less or equal

std::unordered_map jcc_condition_table = {
    {ZYDIS_MNEMONIC_JO, check_jo},     // 0x70
    {ZYDIS_MNEMONIC_JNO, check_jno},   // 0x71
    {ZYDIS_MNEMONIC_JB, check_jb},     // 0x72 - JB/JNAE/JC
    {ZYDIS_MNEMONIC_JNB, check_jnb},   // 0x73 - JNB/JAE/JNC
    {ZYDIS_MNEMONIC_JZ, check_je},     // effectively JE
    {ZYDIS_MNEMONIC_JNZ, check_jne},   // effectively JNE
    {ZYDIS_MNEMONIC_JBE, check_jbe},   // 0x76 - JBE/JNA
    {ZYDIS_MNEMONIC_JNBE, check_jnbe}, // 0x77 - JNBE/JA
    {ZYDIS_MNEMONIC_JS, check_js},     // 0x78
    {ZYDIS_MNEMONIC_JNS, check_jns},   // 0x79
    {ZYDIS_MNEMONIC_JP, check_jp},     // 0x7A - JP/JPE
    {ZYDIS_MNEMONIC_JNP, check_jnp},   // 0x7B - JNP/JPO
    {ZYDIS_MNEMONIC_JL, check_jl},     // 0x7C - JL/JNGE
    {ZYDIS_MNEMONIC_JNL, check_jnl},   // 0x7D - JNL/JGE
    {ZYDIS_MNEMONIC_JLE, check_jle},   // 0x7E - JLE/JNG
    {ZYDIS_MNEMONIC_JNLE, check_jnle}, // 0x7F - JNLE/JG
};

static bool will_branch_be_taken(const ZydisDisassembledInstruction &inst,
                                 const uint64_t eflags) {
  auto it = jcc_condition_table.find(inst.info.mnemonic);
  if (it != jcc_condition_table.end()) {
    return it->second(eflags);
  }

  if (inst.info.mnemonic == ZYDIS_MNEMONIC_JMP) {
    return true;
  }

  return false;
}
```

Evaluating the condition is then a single map lookup and a function pointer call. If the condition is true, the target address is the branch destination, which is the result of computations that will be shown below. If the condition is false, the target is the fall-through address. Either way, we set `ctx->Rip` to the resolved target and reinstrument there. One thing worth noting, the EFLAGS in the saved context are the flags as they existed when the sentinel faulted. Since our sentinel replaced the [**jcc**](https://revers.engineering/x86/jcc.pdf), the flags reflect the state of execution just prior to the branch, which is exactly what we need.

### — Direct calls

A `call rel32` is pretty straightforward. Push the return address, jump to the target. The return address is the instruction immediately following the call, which we calculate below. The emulation has to do both parts. Decrement `RSP` by 8, write return address to the top of the stack `[RSP]`, and then set `RIP` to the target.

dbi.cpp – call emulation  
C++ ▸

```cpp
ctx->Rsp -= 8;
*(n86*)(ctx->Rsp) = ctx->Rip + inst.info.length;
```

That `ctx->Rip + inst.info.length` is the return address the actual `call` would have pushed. We’re computing it from the original instruction’s metadata.

### — Indirect branches

Operand resolution here can be a little tricky. An indirect call or jump can take its target from a register (`call rax`, `jmp r14`, etc), from memory (`call [rbx+0x10]`, `jmp [rip+0x1234]`), or from a SIB-addressed memory operand (`call [rax+rcx*8+0x20]`). The emulation has to handle all of these forms. For register operands, it’s a direct read from the saved context; so I have a simple helper function for this. The **[CONTEXT](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-context)** structure has a field per GPR, so we map the Zydis register enum to the corresponding context field:

dbi.cpp – register from context  
C++ ▸

```cpp
n86 dbi::get_register_from_context(const n86 reg_idx, const PCONTEXT ctx) {
  switch (reg_idx) {
  case ZYDIS_REGISTER_RAX:
    return ctx->Rax;
  case ZYDIS_REGISTER_RBX:
    return ctx->Rbx;
  case ZYDIS_REGISTER_RCX:
    return ctx->Rcx;
  case ZYDIS_REGISTER_RDX:
    return ctx->Rdx;
  case ZYDIS_REGISTER_RSP:
    return ctx->Rsp;
  case ZYDIS_REGISTER_RBP:
    return ctx->Rbp;
  case ZYDIS_REGISTER_RSI:
    return ctx->Rsi;
  case ZYDIS_REGISTER_RDI:
    return ctx->Rdi;
  case ZYDIS_REGISTER_R8:
    return ctx->R8;
  case ZYDIS_REGISTER_R9:
    return ctx->R9;
  case ZYDIS_REGISTER_R10:
    return ctx->R10;
  case ZYDIS_REGISTER_R11:
    return ctx->R11;
  case ZYDIS_REGISTER_R12:
    return ctx->R12;
  case ZYDIS_REGISTER_R13:
    return ctx->R13;
  case ZYDIS_REGISTER_R14:
    return ctx->R14;
  case ZYDIS_REGISTER_R15:
    return ctx->R15;
  default:
    return 0;
  }
}
```

For memory operands, we need to compute the effective address from the instruction’s **[base register, index register, scale, and displacement](https://people.scs.carleton.ca/~sivarama/asm_book_web/Student_copies/ch5_addrmodes.pdf)**. RIP-relative addressing requires special handling because the `RIP` in the displacement calculation is the address of the *next* instruction after the original (runtime address plus length), not the current faulting address. Zydis provides the displacement in `inst.operands[0].mem.disp.value`, and for RIP-relative we compute:

RIP-relative resolution  
C++ ▸

```cpp
mem_address = inst.runtime_address + inst.info.length + inst.operands[0].mem.disp.value;
```

For base-register-relative (without an index), it’s:

Base-register-relative resolution  
C++ ▸

```cpp
n86 base_value = get_register_from_context(inst.operands[0].mem.base, ctx);
mem_address = base_value + inst.operands[0].mem.disp.value;
```

And for the full SIB form with a base, index, and scale:

SIB resolution  
C++ ▸

```cpp
if (mem.base == ZYDIS_REGISTER_RIP)
  mem_address = inst.runtime_address + inst.info.length;
else if (mem.base != ZYDIS_REGISTER_NONE)
  mem_address = get_register_from_context(mem.base, ctx);

if (mem.index != ZYDIS_REGISTER_NONE)
  mem_address += get_register_from_context(mem.index, ctx) * mem.scale;

mem_address += mem.disp.value;
```

Once we have the effective address, we dereference it to get the actual branch target — next_rip = \*(n86\*)mem_address. Before dereferencing, we check that the address is canonical (bits 63:47 are either all ones or all zeros, per Intel SDM Volume 1, Section 3.3.7.1). Dereferencing a non-canonical address would cause another fault inside our handler, which… ideally we don’t want to deal with, so we’ll have a canonical check as well just to be sure.

SIB resolution  
C++ ▸

```cpp
static bool is_canonical(n86 address) {
  u64 b47 = (address >> 47) & 1;
  uintptr_t expected = b47 ? 0xFFFF800000000000ULL : 0;
  return (address & 0xFFFF800000000000ULL) == expected;
}
```

Once all of this is implemented we’ll wind up with a reasonably written handler for all the forward-edge control flow transfers.

dbi.cpp – handle forward cf  
C++ ▸

```cpp
void dbi::handle_forward_cf(n86 relative_ip, PCONTEXT ctx, PEXCEPTION_RECORD excr) {
  auto rva = utils::get_rva(ctx->Rip, (n86)image_base);

  if (active_traps.contains(rva)) {
    auto [inst, original_bytes] = active_traps[rva];
    if (!original_bytes.empty()) {
      protect_guard guard((void *)ctx->Rip);
      restore((void *)ctx->Rip, original_bytes);
    }

    active_traps.erase(rva);

    mru_ip = rva;
    auto next_rip = 0ull;
    bool taken = false;

    n86 taken_target =
        inst.runtime_address + inst.info.length + inst.operands[0].imm.value.s;
    n86 not_taken_target = inst.runtime_address + inst.info.length;
    if (inst.info.mnemonic == ZYDIS_MNEMONIC_JRCXZ) {
      taken = (ctx->Rcx == 0);
      next_rip = taken ? taken_target : not_taken_target;
    } else if (inst.info.mnemonic >= ZYDIS_MNEMONIC_JB &&
               inst.info.mnemonic <= ZYDIS_MNEMONIC_JZ) { taken = will_branch_be_taken(inst, ctx->EFlags);

      if (taken) {
        if (inst.operands[0].type == ZYDIS_OPERAND_TYPE_IMMEDIATE) {
          next_rip = taken_target;
        } else if (inst.operands[0].type == ZYDIS_OPERAND_TYPE_REGISTER) {
          next_rip = get_register_from_context(inst.operands[0].reg.value, ctx);
        } else if (inst.operands[0].type == ZYDIS_OPERAND_TYPE_MEMORY) {
          n86 mem_address = 0;

          if (inst.operands[0].mem.base == ZYDIS_REGISTER_RIP) {
            mem_address = inst.runtime_address + inst.info.length +
                          inst.operands[0].mem.disp.value;
          } else if (inst.operands[0].mem.base == ZYDIS_REGISTER_NONE) {
            mem_address = inst.operands[0].mem.disp.value;
          } else {
            n86 base_value =
                get_register_from_context(inst.operands[0].mem.base, ctx);
            mem_address = base_value + inst.operands[0].mem.disp.value;
          }

          if (mem_address != 0) {
            next_rip = *(n86 *)mem_address;
            taken = true;
          }
        }
      } else {
        next_rip = not_taken_target;
      }
    } else if (inst.info.mnemonic == ZYDIS_MNEMONIC_CALL) {
      if (inst.operands[0].type == ZYDIS_OPERAND_TYPE_REGISTER) {
        next_rip = get_register_from_context(inst.operands[0].reg.value, ctx);
        taken = true;
      } else if (inst.operands[0].type == ZYDIS_OPERAND_TYPE_IMMEDIATE) {
        next_rip = taken_target;
        taken = true;
      } else if (inst.operands[0].type == ZYDIS_OPERAND_TYPE_MEMORY) {
        n86 mem_address = 0;
        auto mem = inst.operands[0].mem;

        if (mem.base == ZYDIS_REGISTER_RIP)
          mem_address = inst.runtime_address + inst.info.length;
        else if (mem.base != ZYDIS_REGISTER_NONE)
          mem_address = get_register_from_context(mem.base, ctx);

        if (mem.index != ZYDIS_REGISTER_NONE)
          mem_address += get_register_from_context(mem.index, ctx) * mem.scale;

        mem_address += mem.disp.value;

        if (mem_address && is_canonical(mem_address)) {
          next_rip = *(n86 *)mem_address;
          taken = next_rip != 0;
        }
      }

      ctx->Rsp -= 8;
      *(n86 *)(ctx->Rsp) = ctx->Rip + inst.info.length;
    }

    auto next_rip_rva = utils::get_rva(next_rip, (n86)image_base);
    if (config.is_valid_branch_target(next_rip_rva)) {
      if (taken) {
        auto visited = visited_traps.find(next_rip_rva);
        if (visited != visited_traps.end()) {
          visited->second.branched_from.emplace_back(rva, __rdtsc());
        } else {
          trap_history_entry the{};
          the.branched_from.emplace_back(rva, __rdtsc());
          the.data = std::make_tuple(inst, original_bytes);
          visited_traps[next_rip_rva] = the;
        }
      } else {
        //
        // ... not taken ...
        //
      }

      reinstrument(next_rip);
    } else {
      //
      // instrument the instructions following this branch since it's outside of
      // the module we want to trace.
      //
    }

    ctx->Rip = next_rip;
  }
}
```

### — Returns

The `ret` handler is the simplest case. Read the return address from `[RSP]`, validate it, advance `RSP` by 8, and set `RIP` to the return address. One consideration specific to our tracing model is that when we restore original bytes at the call site after handling it, and then reinstrument at the branch target, the code at the call site is now clean (original bytes restored). If execution returns to the calling function, it won’t hit a sentinel there anymore. For the branch-chasing strategy that’s fine because we reinstrument from the return address forward. For the bounded search or CFG-guided strategy where we want trigger bytes to persist, the preserve_unhit_traps flag keeps them in place. Nonetheless, the ret handler will look something akin to this:

dbi.cpp – handle return  
C++ ▸

```cpp
void dbi::handle_backward_cf(n86 relative_ip, PCONTEXT ctx,
                             PEXCEPTION_RECORD excr) {
  if (active_traps.contains(relative_ip)) {
    auto [inst, original_bytes] = active_traps[relative_ip];

    auto next_rip = get_tos(ctx);
    auto next_rip_rva = utils::get_rva(next_rip, (n86)image_base);

    if (config.is_valid_branch_target(next_rip_rva)) {
      if (!original_bytes.empty()) {
        protect_guard guard((void *)ctx - > Rip);
        restore((void *)ctx->Rip, original_bytes);
      }

      active_traps.erase(relative_ip);

      auto visited = visited_traps.find(next_rip_rva);
      if (visited != visited_traps.end()) {
        visited - >
        second.branched_from.emplace_back(relative_ip, __rdtsc());
      } else {
        trap_history_entry the{};
        the.branched_from.emplace_back(relative_ip, __rdtsc());
        the.data = std::make_tuple(inst, original_bytes);
        visited_traps[next_rip_rva] = the;
      }

      reset_and_reinstrument(next_rip);

      if (!original_bytes.empty()) {
        protect_guard guard((void *)ctx->Rip);
        restore((void *)ctx->Rip, original_bytes);
      }
    }
    ctx->Rip = next_rip;
    ctx->Rsp += 8;
  }
}
```

**\>> What about {ret imm16}?**

Good catch. The return handler here always adds 8, and never checks for the immediate operand. If a target were to use `ret 0x10` it would get emulated as a standard return, and the stack wouldn’t be adjusted likely causing a crash. To handle this, we’d need to add a check in our `handle_backward_cf` function checking for visible operands and if the type is an immediate; and then adjust the stack by that amount. This would be a good exercise for readers to attempt if you are building your own variant of the tool alongside.

### — Handling external targets

When it comes to tracing, some people want complete coverage and all the info even from external modules — which is perfectly fine. For this toy project and post, I opted to avoid instrumenting them. Currently, when the resolved target falls outside the instrumented module (for example, calling a Win32 API through the IAT), we don’t instrument at the target because it’s in a different module that we’re not interested in tracing. The call itself still needs to be emulated, but instead of reinstrumenting at the API function, we reinstrument at the return address on the stack. The API call will execute natively and return into our instrumented code, where the next trigger byte will be waiting. If the target address is null or non-canonical (which can happen with intentionally malformed indirect calls), we fall back to instrumenting at the fall-through address (the instruction after the original branch) and let the target proceed. It’s the easiest way to check the box for that case.

After the handler has resolved the target and updated the context (the new RIP, possibly adjusted RSP and return address), we need to hand control back to the target thread. The standard approach on Windows is , which takes a **[CONTEXT](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-context)** pointer, transitions into the kernel, applies the new context to the thread, and returns to user mode. It works, but every branch event pays for a full kernel round-trip, and we’re handling potentially hundreds of exceptions per second… so the alternative is avoid that round trip entirely and write our own stub that builds an **[iret frame](https://revers.engineering/x86/iretq.pdf)** on the stack and executes **[iretq](https://revers.engineering/x86/iretq.pdf)** from ring-3. That’s legal on x86-64; **[iret](https://revers.engineering/x86/iretq.pdf)** from R3 to R3 pops RIP, CS, RFLAGS, RSP, and SS from the stack and jumps and we avoid the kernel which saves us **[a few hundred microseconds](https://i.imgur.com/vn109Vr.png)**. With all the inefficiencies in this why are we worried about here? Since it’s a small thing to improve performance and doesn’t require a lot of overhead in design or implementation and profiling I just went ahead and did it. Take the small wins and go back later to improve the rest.

**\>> Bypassing NtContinue**

[**NtContinue**](http://undocumented.ntinternals.net/index.html?page=UserMode%2FUndocumented%20Functions%2FNT%20Objects%2FThread%2FNtContinue.html) calls **[KeTestAlertThread](https://repnz.github.io/posts/apc/kernel-user-apc-api/)** and the kernel exit path calls **[KiInitiateUserApc](https://repnz.github.io/posts/apc/kernel-user-apc-api/)**. These deliver pending user-mode APCs such as thread termination (TerminateThread is a user APC; verified via **[KeRequestTerminationThread](https://secrary.com/posts/unkillable/)**), **[QueueUserAPC](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-queueuserapc)** callbacks, and APC-based I/O completion. Under sustained exception load with no intervening syscalls, APCs are starved indefinitely. The thread becomes unkillable. This is very unlikely to happen though…

### — The Forgotten LOOPcc

If you’re very familiar with x86, you might’ve noticed that we didn’t handle the less common [**LOOPcc**](https://revers.engineering/x86/loop.pdf) instructions. With our current design, we can add these easily though. We’ll just need to define a new predicate, add the loop emulation in the `handle_forward_cf` function, and adjust our `instrument_if` call.

dbi.cpp – is_loop predicate  
C++ ▸

```cpp
bool is_loop(const ZydisDisassembledInstruction &inst) {
  return inst.info.mnemonic == ZYDIS_MNEMONIC_LOOP ||
         inst.info.mnemonic == ZYDIS_MNEMONIC_LOOPE ||
         inst.info.mnemonic == ZYDIS_MNEMONIC_LOOPNE;
}
```

dbi.cpp – handle_forward_cf loop block  
C++ ▸

```cpp
else if (inst.info.mnemonic == ZYDIS_MNEMONIC_LOOP ||
         inst.info.mnemonic == ZYDIS_MNEMONIC_LOOPE ||
         inst.info.mnemonic == ZYDIS_MNEMONIC_LOOPNE) {
  ctx->Rcx--;

  if (inst.info.mnemonic == ZYDIS_MNEMONIC_LOOP)
    taken = (ctx->Rcx != 0);
  else if (inst.info.mnemonic == ZYDIS_MNEMONIC_LOOPE)
    taken = (ctx->Rcx != 0) && GET_ZF(ctx->EFlags);
  else
    taken = (ctx->Rcx != 0) && !GET_ZF(ctx->EFlags);

  next_rip = taken ? taken_target : not_taken_target;
}
```

dbi.cpp – instrument_if update  
C++ ▸

```cpp
for (auto& point : instrumentation_points)
{
	instrument_if(point, config.default_window_size, true, "\xd6",
		is_indirect_call, is_indirect_jmp, is_jcc, is_call_imm, is_loop);

	instrument_if(point, config.default_window_size, true, "\xf4",
		is_ret);
}
```

This is the payoff of designing for extension later. Now, we’ve handled all of the near branching instructions and hopefully with a general understanding of the process flow we can see all of this in action with some examples below.

## All Together

Alright, let’s just throw it at notepad and see what happens…

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bc47c07ba117e5f2.png)

Figure 3: Trace log (left), generated execution flow graph (middle), and IDA (right). (OC)

The full trace was rather large, but it worked great. I already have some previous development done that supports the format I output and then some python that post-processes the trace data to generate a graph using [**ELK.js**](https://github.com/kieler/elkjs). We can see the trace on the left showing us the calls, and with some effort detect the loops based on the repeated branches that stay within the same call context. If a backedge revisits the same instruction without crossing a call/return boundary, it’s a loop and gets collapsed; if the same code is reached again through a different caller, the call stack has changed and we treat each invocation as separate for display in the trace. In the middle we can see this loop construct as it looks with graph nodes, in a similar pattern to one of the images shown earlier; and on the right you’ll see the original so you can see that it properly identified this loop. This kind of loop identification, over a larger surface area in something like an obfuscated binary, could assist with identifying things like a **[VM-dispatcher](https://www.mitchellzakocs.com/blog/tigress)**. If something like **[CFF](https://github.com/obfuscator-llvm/obfuscator/wiki/Control-Flow-Flattening)** is employed with loads of indirect branches it may be difficult to locate, but with an execution trace that properly identifies loops and does some light deduplication we can find them.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e3061699c743b707.png)

Figure 4: Common dispatch points are easily identified in obfuscated target. (OC)

Given this information, we can zoom in a little and see what the common dispatch point is — for context, this target is an exception-driven obfuscator. It performs a lot of initialization in the **[initterm callbacks](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/initterm-initterm-e?view=msvc-170)** and registers a [**VEH handler**](https://learn.microsoft.com/en-us/windows/win32/debug/vectored-exception-handling) that does a lot of the resolution for what happens when a VM-opcode is hit. It’s not a very sophisticated program, but the power of a full execution trace is on display.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7a613f2db26ed18d.png)

Figure 5: Point of interest. (OC)

The beloved **[NtContinue](https://blackhat.com/docs/us-14/materials/us-14-Yu-Write-Once-Pwn-Anywhere-wp.pdf)**. If we look at the `ctx->Rip` of the **[CONTEXT](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-context)** structure that these **[NtContinue](https://blackhat.com/docs/us-14/materials/us-14-Yu-Write-Once-Pwn-Anywhere-wp.pdf)** calls use, we’ll begin to notice a pattern, even easier with a nice graph.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9b32feb34a1097b0.png)

Figure 6: VM “opcodes” and their predecessor blocks. (OC)

We can see when they are time ordered, and we go from one **[predecessor](https://github.com/SonarSource/sonar-php/blob/master/doc/CFG.md)** block to the next (the block prior to it hitting an instruction that is part of the vISA (virtual ISA / fake ISA); once hit it winds up going through NtContinue to the next block to continue execution. At each of those **[successors](https://github.com/SonarSource/sonar-php/blob/master/doc/CFG.md)**, the blocks NtContinue resumes execution at, a pattern emerges.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fc0f1cdc1b83bf12.png)

Figure 7: Pattern recognition of tagged dispatch in obfuscated target. (OC)

We can see from *Figure 7* that (left to right) `65ba7` is executed, followed by `658ae` which is has the label `vm:0xe` identifying the opcode. If we were to follow the line around the graph we’d see branch to the block `658b9`, and then the invalid instruction at `658c1` causes an exception and it continues. If we look at the target we can see it’s using some sort of “tagged dispatch”. Meaning there isn’t a standard vISA and it appears to encode how far to move ahead in the instruction stream in the sequence. It then natively executes the instruction we land on without any sort of mutation or decomposition applied. It’s much easier to isolate patterns and locate key behavior with an interactive graph based on execution traces. With register state and more advanced features like [**data flow analysis** (DFA)](https://winterschool2022.cse.iitk.ac.in/slides/dfa_cfa.pdf), you can deobfuscate much more complex targets; of course, for those you’d want to explore the more involved technology to do similar to what we have here. Now that we’ve seen first hand the utility of building a tool like this, I want to go a bit into an amusing situation.

## Atalanta’s Race

**Disclaimer:** The tables with the data below were AI “refined?”. I am not king of HTML/CSS so I took a little shortcut to present the data in a pretty way. Okay, back to it.

So, the tracer worked fine on clean processes, simple or complex. However, on one target (an old anti-cheat), it was intermittently terminating; if instrumentation was placed in one region over another it seemed to fail more often. I just injected the module and let it trace. Some runs would complete and I’d get a full log. Others would die mid-trace. I didn’t touch any of the anti-tamper logic, and didn’t patch out any checks. I wasn’t concerned about potential kicks, except I had forgotten that the target had an integrity-checking running on a timer. It would periodically hash regions of its own `.text` section and compare against a known-good baseline. When the checker’s scan happened to overlap with the region I was currently instrumenting, it sees modified bytes, and the process terminates. The first things that came to mind were to hang that thread, patch it into an infinite loop, or any number of options to disable it — but the fact that I was able to “outrun” it more often than not was interesting to me. Many times I won this race I had been instrumenting a function that had a few lookups through quite a lot of indirection that executed a few thousand times. This might not sound as interesting to some, but since this was a race condition, and my instrumentation window is small and mobile I figure why not toy with it.

The questions that followed felt pretty natural, and I decided to waste my time in *what felt like* a productive way. How often was I winning the race? What conditions led to a higher likelihood of finishing a trace before getting tagged? Were their specific types of hashing algorithms that I would win against more consistently? I wanted to see if I could beat it with higher confidence without touching the logic of the AC. The target was using the **[ol’ CRC](https://en.wikipedia.org/wiki/Mathematics_of_cyclic_redundancy_checks)**, fast and easy. The bounded bulk patching writes everything up front and then leaves it since for it I keep `preserved_traps` setting active — a little exposuremaxxing so the CRC check blasts us is no bueno. The strategy that tries to maintain a low-profile is branch-chasing (*source: I made it up*). Recall it writes one trigger at a time and cleans up after itself, and there is a small window before reinstrumentation where it performs calculations and dozens of microseconds are spent doing internal lookups and calls and the return to the code. So, how am I going to test this rigorously? Well, let me explain how I wasted 3 days setting up a series of tests and harness to profile different workloads and derive some information that might be meaningful.

### — Race Condition Visualized

This is about as easy as it gets to visualize the race condition. INSTR writes bytes ahead of where INTEG reads them, so the integrity check in this snapshot sees unmodified bytes and doesn’t detect the instrumentation.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/94cd7ef74a6367ab.png)

Figure 8: Overlapping read/write race. (OC)

The thread running our integrity check is processing the entire `.text` section at a steady rate, and could potentially catch up to our instrumentation. This graphic alone might imply that instrumentation will always get caught at least once during each scans pass, if both are moving in the same direction in memory. However, keeping *Figure 8* in mind, consider that the jump currently instrumented could redirect further ahead or backward in the instruction stream. If this were the case at that exact edge: the instrumentation restored the current byte before INTEG read it, and went backward in the code section to the “next branch target”, then the scan would miss. For the sake of example, assume it’s a loop and the INSTR only jumps back a few bytes.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b38cc89b98f279b2.png)

Figure 9: Narrow escape during reinstrumentation. (OC)

In *Figure 9*, it attempts to show the INTEG missing the detection of INSTR on that byte. One could imagine that this could occur quite often in programs enumerating various data structures, or with lots of dispersion in general. Sometimes in obfuscated targets you’ll have some very poor spatial locality within the instruction stream. Within those you may see scattered blocks with branches to other blocks much further away in memory, which seems like it would be helpful in lowering the probability that any given scan picks up a trigger. To measure this hypothesis, I needed to construct a harness that I could control, but properly simulate the layout of these binaries. If I build too straight line of a program, well it’s most likely that the INTEG will catch up to me. Too small of a program and it will probably catch me far more often because a CRC over the code section in a small (<1MB binary) is going to be incredibly fast; and that’s not really realistic for interesting targets. The binaries I was testing on that had any sort of anti-RE/anti-tamper were anywhere from 5MB to 50MB, with varying dispersion of blocks.

### — The Harness

I wasn’t going to run this against the real target 300 times and just eyeball the results… and to extend the binary to support profiling was going to take more work than I wanted to do so it was clear this needs a purpose-built test harness; and a set of binaries with some kind of known, controllable integrity checking behavior, with various workloads that “exercise” the tracer. All of those requirements encompass a lot variables.

**\>> Harness Configuration**

Binaries

7 variants with `.text` sizes ranging from ~500KB to 50MB. Larger binaries are inflated by linking generated `noinline` functions to test whether total code size affects detection rates.

Workload Profiles

|     |     |
| --- | --- |
| `Linear` | Dense conditionals, nested call chains, limited loops. Simulates initialization / startup code. |
| `Loop` | Heavy data structure enumeration, table resolutions, pattern scanning. Simulates PEB walks and similar. |
| `Mixed` | Both in roughly equal proportions with various dispatch mechanisms across iterations. |

Branch Scale

|     |     |
| --- | --- |
| `Light` | ~9,000 branches |
| `Medium` | ~500,000 branches |
| `Heavy` | 1–5 million branches |

Integrity Check Algorithms

3 algorithms running independently, each hashing the entire `.text` section per pass.

`CRC32`  
`MD5`  
`SHA-256`

Software CRC; did not use hardware crc32 instructions.

Check Intervals

`1ms`  
`10ms`  
`50ms`  
`100ms`  
`500ms`  
`1000ms`  
`5000ms`  
`rand(500ms–8s)`

Thread Priority Modes

`High`  
`Above Normal`  
`Normal`  
`Below Normal`  
`Idle`

Does not account for dynamic priority boosting or balance set manager behavior. No Job Object was used, as most observed targets did not use one to cap integrity check thread runtime.

The baselines (correct **[CRC32](https://en.wikipedia.org/wiki/Cyclic_redundancy_check)**, **[MD5](https://en.wikipedia.org/wiki/MD5)**, **[SHA-256](https://www.movable-type.co.uk/scripts/sha256.html)**) are computed at build time through a post-build script and baked directly into the binaries through use of a section marker that way there is no runtime cost for computing the initial hash and prevent issues where the baseline could be wrong if our instrumentation is present when it’s attempting initial calculation. ASLR is disabled as well so that RVAs are stable across runs. I also ensured that the bloat introduced interleaved randomly between functions at varying rates to attempt to simulate the sparse binary layout I typically see (i.e. all the functions that run aren’t right next to each other). All of this was automated via a runner script that launches each binary via a simple suspend utility, injects the module and lets it rip. The harness spawns the integrity check threads, runs the workload while the tracer does its instrumentation in real time, and outputs a CSV with per-check results. If you read this like I was out of breath, that’s how it felt writing it out. I just wanna get to the cool stuff.

The full permutation space is a bit obscene: 6 binaries x 3 profiles x 3 tiers x 7 interval modes x 5 thread priorities (high, above normal, normal, below normal, idle) = **1,890 configurations per run**. Following the completion of all measurements, I run an analysis script that processes the CSVs and attempts to derive some meaningful data from them like detection rates, effect sizes, throughput, and some other things across the parameter space. It was quite an undertaking to investigate something that is pretty intuitive (if scan faster, scan catch slower instrumentation). We do it for science.

Before looking at instrumented results, the baselines provided the following:

-   324 runs total.
-   16,295 total integrity check passes across all algorithms.
-   No detections (of course).
-   Base runtimes to help us note the overhead we are introducing.

### — Primary Results in p/pass

The metric I cared about most was `p/pass`. This is the probability that a single integrity check pass detects modified bytes. Across all 6,105 instrumented runs, the global mean was 12.13% with a standard deviation of ~4.66%. That means on any given scan of `.text`, there’s roughly a 1-in-8 chance the checker overlaps with an active sentinel.

**\>> Detection Rate by Hash Algorithm**

12.27%

CRC32

12.03%

MD5

12.09%

SHA-256

p/pass · branch-chasing strategy · 6,105 iterations

As seen above, the algorithm used doesn’t seem to impact whether any single scan catches you, only for how many scans happen. The per-pass probability is approximately the same across algorithms. To confirm this, I calculated per-algorithm **[eta-squared](https://www.statology.org/eta-squared/)** on `p/pass` and this was the general breakdown per profile. [**Eta-squared**](https://www.statology.org/eta-squared/) answers the question “of all variation I see in my results, how much of it is explained by X factor?”. Total up I ran 6000+ experimental permutations, and the detection rates bounced around from run to run. Some of the bouncing is because of the change in binary size, some due to interval, other is because of profile changes. The information below shows the per-algo breakdown by profile.

|     |     |     |     |
| --- | --- | --- | --- |
| **η² Effect Size — Detection Rate by Profile** p/pass |     |     |     |
| Profile × CRC3223.7%<br><br>Profile × MD522.9%<br><br>Profile × SHA-25616.7%<br><br>Everything else< 2% |     |     |     |
|     | CRC32 | MD5 | SHA-256 |
| linear | 15.43% | 14.82% | 14.90% |
| mixed | 12.63% | 11.79% | 11.89% |
| loop | 8.88% | 8.48% | 8.69% |

Profile scores ~24% for CRC32’s `p/pass`. This means that if you didn’t know anything about a run except the workload profile it used, you could explain ~24% of the variation in its detection rate. The remaining ~76% comes from all the other factors combined ± noise. Everything else scores under 2% each. Size, scale, interval, priority, random mode … all pretty much rounding errors compared to profile. Priority scores came out to ~0.7%, which is another way of saying that the thread priority tells us next to nothing about whether a check will detect sentinels.

So, we varied seven experimental parameters. Only one of them materially changed the detection probability. That was the shape of the code being traced. A linear workload that touches many unique branches is almost twice as likely to be caught on any given scan as a tight loop. The hash algorithm, thread priority, size, check interval, and scale tier all had negligible effect on per-pass probability. The game is between instrumentation footprint, scan timing, **and workload shape** which is what controls how much footprint is exposed at any given moment.

If you’re not following, recall the graphics in *Figure 8* and *Figure 9*. The tracer, using the branch-chasing strategy, only ever has a single byte planted in memory. The integrity checks have to hash all of `.text` with each pass. So, the `p/pass` detection probability boils down to “what fraction of wall-clock time are the sentinel bytes present in the section?”

****𝛿**** **For linear workloads** that execute loads of unique branches, execution moves through the code section pretty linearly. A sentinel placed at instruction N might sit there for a few hundred microseconds before execution reaches it. During that period where the sentinel is placed, before it has been hit and the original bytes restored, there is exposure. This explains the higher `p/pass` rate for this code shape.

****𝛿** For looping workloads**, execution sticks to a small set of branches thousands of times. The first iteration through the loop sentinels get planted in the loop body. Consider a small loop body, maybe a few dozen instructions, execution hits the next sentinel almost immediately. Sentinel faults, fault location restored, new ones are planted at the head of the loop. They pop in and out of existence much more rapidly. Opportunity to be missed. The other consideration is that the sentinel is stuck in a small region, bouncing between the loop’s back-edge and its head. The scan sweeps the entire section linearly, and passes through that small region once per scan. If the sentinel happens to be consumed (byte restored) just before the scan reaches that address, the scan sees clean bytes for the rest of the pass, because the new sentinel gets planted back at the loop head, which the scan already passed — as in *Figure 9*.

[  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0d29f67ecdb8afe5.png)  
](https://i0.wp.com/revers.engineering/wp-content/uploads/2026/04/g0.png?ssl=1)  
[  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/39355990a8b4e599.png)  
](https://i0.wp.com/revers.engineering/wp-content/uploads/2026/04/g1.png?ssl=1)

### — Thread Priority

One of the parameters some may wonder about is whether the priority of the integrity check thread matters. If you’re designing an integrity check for a shipped binary, running the checker at a higher priority feels like a reasonable decision. More CPU time should mean less waiting for thread time, more passes, better odds; but it has very little impact… which is what I anticipated, and I mildly regret letting it explode the number of permutations.

**Detection Rate by Thread Priority**

| priority | mean p/pass | stdev |
| --- | --- | --- |
| high | 12.65% | 3.47% |
| above normal | 12.71% | 3.44% |
| normal | 12.64% | 3.76% |
| below normal | 12.54% | 3.89% |
| idle | 12.79% | 3.17% |

The spread across all five priority levels is 0.25 percentage points. The within-priority standard deviation (how much `p/pass` varies between runs at the same priority level) is ~3-4%. That means the difference between “high” and “idle” is less than a tenth of the run-to-run noise you’d see even if priority were held constant. All of this makes sense since the check threads spend most of their time sleeping between passes, thread priority has very little impact. It only matters when threads are contending for CPU time, and with sleep intervals ranging from 1ms to 1s, there’s virtually no contention. The scheduler gives an idle-priority thread the same effective throughput as a high-priority thread when neither is CPU-bound.

If you’re building integrity checks with any kind of sleep between passes, tuning thread priority isn’t going to help. Where priority would start to matter is if the checker were scanning continuously with no sleep at all. In that case the thread is CPU-bound for its entire lifetime and has to compete with the target for time slices. To better see how it can be applied, take the ratio of scan duration to total cycle time (scan + sleep). As that ratio approaches 1.0, the thread never voluntarily yields and the scheduler has to decide who gets preempted. Even at 1ms intervals on the largest binary, the checker’s **[duty cycle](https://www.hypertherm.com/resources/faqs/what-is-duty-cycle/)** stays low enough that the scheduler services it without contention. If we were designing a checker with zero-sleep continuous scanning, priority (or core affinity) would be worth revisiting.

### — Algorithm Speed and Binary Size

When I first looked at binary size in the original dataset, I noted that `p/pass` is flat across sizes. This still holds, but the total detection count has a size dependence.  
At 1ms intervals, the ratio of detections on the 498KB binary versus the 5MB binary looks like this:

**Average Detections by.text Size**

| algorithm | 498KB | 5MB | 10MB | 498KB/5MB | 498KB/10MB |
| --- | --- | --- | --- | --- | --- |
| CRC32 | 638 | 420 | 258 | 1.52× | 2.47× |
| MD5 | 624 | 205 | 102 | 3.05× | 6.10× |
| SHA-256 | 296 | 44  | 20  | 14.80× | 14.80× |

Algorithm speed only matters when the check interval is short enough that scan duration dominates cycle time. CRC32 hashes `.text` at ~357 MB/s; SHA-256 at ~25 MB/s. On a 10MB binary, that’s 29ms vs 420ms per pass. At a 1ms sleep interval, CRC32 completes ~30 passes/second while SHA-256 manages 2-3. On the 498KB binary the gap shrinks to about 6x. At 1000ms intervals, sleep dominates total cycle time for every algorithm, scan duration becomes irrelevant, and detection counts converge regardless of which hash you’re running.

The crossover is around 500ms. Below that, a slow algorithm on a large binary loses an order of magnitude in detection throughput compared to a fast one; and above it, you’re paying for sleep time either way.

[  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e7043b4fb7d64c47.png)  
](https://i0.wp.com/revers.engineering/wp-content/uploads/2026/04/g2.png?ssl=1)  
[  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9f42c6b1ec3683c9.png)  
](https://i0.wp.com/revers.engineering/wp-content/uploads/2026/04/g3.png?ssl=1)

### — Frequency and Diminishing Returns

Check frequency affects total detections but not `p/pass`, and the returns diminish quickly. Average detection count across all fixed-interval runs is shown below.

**Average Detections by Check Interval**

| interval | avg detections | vs previous |
| --- | --- | --- |
| 1 ms | 962 | —   |
| 10 ms | 897 | −6.7% |
| 50 ms | 318 | −64.6% |
| 100 ms | 199 | −37.5% |
| 500 ms | 51  | −74.2% |
| 1000 ms | 27  | −48.3% |

Going from 1ms to 10ms costs just under 7% of the detections. At 1ms intervals the hash computation itself takes longer than the sleep for anything but the smallest binary, so you’re already scanning back-to-back. The cliff is between 10ms and 50ms, where you lose almost two-thirds of your detections. Below 10ms you’re saturating; and above 50ms you’re in steep decline at every step. The check frequency does not affect `p/pass` though. This statement “check frequency does not affect `p/pass` ” might be confusing. If you scan more often, shouldn’t you be more likely to catch the sentinel? Yes, you are more likely to catch it at least once, because there are more attempts. But each individual attempt has the same odds.

Consider a hypothetical: the sentinel gets planted, sits there for some number of microseconds while execution approaches the next branch, fires, gets restored. Then some amount of computation happens before the next sentinel is planted at the new target. Whatever that ratio works out to, it’s a property of the workload’s execution. A CRC32 scan of the 5MB binary takes about 14ms. During that 14ms sweep, the sentinel pops in and out of existence hundreds of times. Whether the sweep happens to be reading the sentinel’s byte address during one of those brief windows will determine success/failure. That probability doesn’t change based on whether you started this scan 1ms or 1000ms after the previous one, because the sentinel’s appear/disappear cycle runs on the target thread’s execution, completely independent of the checker’s schedule. Scanning every 1ms gives you ~700 sweeps during a run. Scanning every 1000ms gives you maybe 30. Each sweep has the same ~12% chance. More sweeps, more detect.

[  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/61f65f5ab4b7adc7.png)  
](https://i0.wp.com/revers.engineering/wp-content/uploads/2026/04/g4.png?ssl=1)  
[  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/099825f282c09b03.png)  
](https://i0.wp.com/revers.engineering/wp-content/uploads/2026/04/g5.png?ssl=1)

### — So you’re sayin’ there’s a chance?

All the analysis so far treats `p/pass` as a fixed property of the configuration. ~12% for linear workloads, ~8% for looping, and somewhere in between for mixed; but that’s the average across many runs. The main questions I’m interested in right now are: can you evade detection at all? And in what cases?

The per-scan detection probability is set by the code shape you’re instrumenting. Loop heavy code, where the sentinel gets consumed and replanted at a loop head the checker already passed, comes in around 8%. Linear code, where execution moves forward through fresh addresses, sits around 12%. I tested close to 2,000 observations for unusually low detection rates and, as far as the data suggests, the odds of getting caught on any given scan appear fixed by the execution pattern of the code you chose to instrument.

Now, whether that rate is low enough to evade depends on how many scans you face. As a first-order approximation, treating each scan as independent gives `(1 - p)^N` for the chance of dodging all N of them; that’s what the tables below use. It’s an approximation rather than an identity. The scans within the same run share a workload trajectory and are positively correlated, so the actual per-run evasion outcome has more spread than the formula implies. It’s important we don’t cite these numbers as hard and fast probabilities. The qualitative point survives either way, at 1ms check intervals with hundreds of scans per second, evasion is essentially zero; practical integrity checks (at least the ones I’ve come in contact with) don’t run at 1ms. The binaries I’ve traced in practice check on a highly variable schedule, but the one that piqued my interest for this part of the blog ran every 4 to 30 seconds; and when the interval itself is random, N is a random variable too, which widens the band further on the random-interval table below. At 15-second intervals, evasion as a function of session duration and code shape would look something like this:

**Evasion Probability / Time (15s fixed)**

| session | checks | P(evade) loop | P(evade) linear |
| --- | --- | --- | --- |
| 1 min | 4   | 72% | 60% |
| 2 min | 8   | 51% | 36% |
| 5 min | 20  | 19% | 8%  |
| 10 min | 40  | 3.6% | 0.6% |
| 15 min | 60  | 0.7% | ≈ 0% |

That table assumes a fixed 15-second interval. If the integrity checks aren’t always that predictable, then what? Let’s see what it looks like if the check scheduler randomizes its wait between 4 and 30 seconds per pass.

**Evasion Probability / Time (select:4s–30s)**

| session | expected checks | P(evade) loop | P(evade) linear |
| --- | --- | --- | --- |
| 1 min | 3.1 | 77% | 68% |
| 2 min | 6.7 | 58% | 43% |
| 5 min | 17.2 | 24% | 11% |
| 10 min | 34.9 | 5.6% | 1.2% |
| 15 min | 52.5 | 1.3% | 0.1% |

The evasion odds are higher across every row. Part of it is just fewer checks, the average draw from 4-30 seconds is 17 seconds, but the check that would have started near the end of the session often doesn’t finish before time runs out, so you lose that attempt entirely. A 1-minute session averages 3.1 checks instead of the 3.5 you’d expect from dividing by 17. The rest comes from unlucky draws. Sometimes you pull 28, 26, 25 in a row and only get two checks in your first minute. Those sessions where the checker barely ran are the ones where evasion is almost guaranteed, and they seem to be the reason for the average being pulled up (from what I can tell).

On loop heavy code with checks every 15 seconds or so, you can trace for two full minutes and still have a 51-58% chance of staying undetected. Five minutes and you’ve got 1-in-4 to 1-in-5 odds depending on whether the interval is fixed or randomized. Linear code gives you a tighter window, but a two-minute session is still better than 1-in-3 chance of evading. This is why instrumenting loop-heavy regions was consistently safer than linear ones, and why the targets that only intermittently caught me were the ones checking at those longer intervals. The per-scan probability in the harness I built is 6-15% depending on code shape, and I haven’t seen anything that suggests it can be pushed much higher without placing more triggers at any given time. Scan frequency is the only real parameter someone has for making their integrity checks more “reliable”, but at the cost of higher process utilization.

[  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/154ea9162b0518b4.png)  
](https://i0.wp.com/revers.engineering/wp-content/uploads/2026/04/POWERPNT_jFELm3OcvM.png?ssl=1)

* * *

**Verdict**

PLAUSIBLE

The data suggests evasion was driven primarily by the shape of the code being instrumented and the interval chosen by the integrity checking thread. Other factors may contribute, but these two are dominating factors.

Tested against independent check threads only. Inline checks validating adjacent blocks may behave differently.

* * *

### — The Cost of Doing Business

All the risk in the world with getting caught by some integrity check, but what about the cost of doing this at all?

**Runtime Overhead by Profile & Scale**

| profile | scale | baseline | instrumented | overhead | branches | per-fire |
| --- | --- | --- | --- | --- | --- | --- |
| linear | 1   | <1ms | 11.7s | +11.7s | 8,740 | 1.34ms |
| 2   | <1ms | 48.5s | +48.5s | 36,264 | 1.34ms |
| 3   | <1ms | 4.1m | +4.1m | 176,576 | 1.38ms |
| loop | 1   | 0.40s | 4.0m | +4.0m | 253,832 | 955µs |
| 2   | 1.65s | 16.8m | +16.7m | 1,052,598 | 954µs |
| 3   | 8.1s | ~1.4h | ~1.4h | 5,154,797 | 955µs |
| mixed | 1   | 0.28s | 2.1m | +2.1m | 114,380 | 1.1ms |
| 2   | 1.07s | 8.4m | +8.4m | 459,687 | 1.1ms |
| 3   | 5.3s | 41.8m | +41.7m | 2,275,302 | 1.1ms |

All three profiles **[scale linearly](https://www.fusioncharts.com/blog/linear-vs-logarithmic-scales-whats-the-difference/)** with branch count. Instrumenting linear code costs ~1.4ms per fire, loop heavy costs ~955µs, and mixed lands between them at roughly 1.1ms. The per-fire cost within each profile is stable across the scales: loop scale 1 (253K branches, 955µs/fire) and scale 2 (1.05M branches, 954µs/fire) are within 0.1% of each other. Overhead is just number of branches times estimated per-sentinel handling time (per-fire) cost. The interesting number, in my opinion, is the gap between profiles. Loop heavy code is 30% cheaper per fire than linear. Both profiles go through the same handler. There could be many factors that play into this within the microarchitecture or OS, so I don’t want to speculate and potentially confuse readers; but it would make for interesting additional research.

## Reality Check

The Atalanta’s Race section answered a specific question: *given an integrity checker that hashes.text on a timer, how often does branch-chasing avoid detection?* The answer we came to was “surprisingly often, depending on code shape and interval.” That’s a real result, but it’s also a narrow one. An integrity check scanning for modified bytes is one of many ways a target can notice you’re there, and arguably not the hardest one to deal with. Ideally, you would likely use the tracer to potentially locate it and attack it. I wouldn’t have spent this much time on checking if I could win a race if not driven by curiosity. There is also the possibility that something is searching for hooks in ntdll’s `.text` section.

The core mechanism itself, overwriting a code byte with a faulting instruction and catching the exception, is about as loud as you can get for this kind of work. As we know it modifies `.text`, which is exactly what integrity checks are designed to find. Better primitives exist that achieve the same trap without touching the assembly at all. Hardware breakpoints (DR0-DR3) trigger **[EXCEPTION_SINGLE_STEP](https://anti-debug.checkpoint.com/techniques/assembly.html)** without any memory modification; x86 gives you four, and branch-chasing only needs one or two active at a time. The tradeoff is that debug registers are a well-known detection surface, targets check them via GetThreadContext or NtGetContextThread, and kernel-level anti-tamper can monitor DR access directly. Some implementations will persistently occupy the debug registers across threads to prevent usage as well. Page-level protection is another option. Mark a code page as non-executable or set **[PAGE_GUARD](https://github.com/nelfo/PGHooker)**, catch the fault when execution enters the page, set the **[trap flag](https://anti-debug.checkpoint.com/techniques/assembly.html#popf_and_trap_flag)** to single-step one instruction, then re-protect on the single-step exception. Two exceptions per branch instead of one, coarser granularity (4KB pages versus individual instructions), and *zero bytes* *modified* in the code section. An integrity checker hashing `.text` would see nothing, but we could cat-and-mouse each approach all day. If you’re willing to go deeper, a thin hypervisor with **[SLAT and the monitor trap flag (MTF)](https://fosdem.org/2026/events/attachments/APB9WC-mbec_slat_and_hyperdbg_hypervisor-based_kernel-_and_user-mode_debugging/slides/267183/hyperdbg-_9cwgoyw.pdf)** gives you the same single-step capability with no guest-visible state change at all. Alternatively, as mentioned earlier, LBR/BTS/IPT/etc. Any of these would have made the Atalanta’s Race section irrelevant.

The performance numbers from the previous section are the next issue. Loop-heavy code at scale 2 takes 16.8 minutes under instrumentation versus 1.65 seconds at baseline, 600x slowdown — which is absurd. Any target with timing validation, whether it’s **[rdtsc](https://revers.engineering/x86/rdtsc.pdf)** pairs around critical sections, or server validation on session duration expectations… they will notice. The data earlier shows you can dodge a periodic hash check by keeping your instrumentation footprint small, but nothing about dodging a timing check when you’ve turned a 2-second operation into a 17-minute one… And unfortunately, the overhead is a consequence of the design. This is the same case with game cracks, depending on which part is instrumented the game performance will be impacted, but it’s a common thing to misattribute to the DRM itself. The cracks typically add additional overhead the same way we did when trying to emulate components of something like **[Denuvo](https://en.wikipedia.org/wiki/Denuvo)**. Even if you eliminated logging entirely (which accounts for ~60% of per-fire cost), the remaining time per fire still produces 10-50x slowdowns on branch-heavy code.

There’s also coverage to consider. Branch-chasing follows execution, so it only traces paths that actually run. If a function has an error path that only triggers on specific input, or a rarely-taken branch that requires a particular combination of flags and register state, you won’t see it unless you provide the right conditions. This is totally fine for profiling hot paths or tracing a known operation, but if the goal is complete coverage of a function’s behavior, you need either multiple runs with varied inputs or a switch to the CFG-guided strategy (which has its own exposure tradeoffs) and setting things up to meet conditions to take specific paths (constraint solving and state updates). And if you want to be absolutely certain you’re getting good information you have to validate emulation correctness. The handler here covers jcc, jmp, call, ret, indirect variants through registers and memory, **[LOOP/LOOPE/LOOPNE](https://revers.engineering/x86/loopcc.pdf)**, **[JRCXZ](https://revers.engineering/x86/jcc.pdf)**. That covers the vast majority of what a compiler emits. But x86 is a large ISA, and edge cases exist. \`ret imm16\` (which pops additional bytes off the stack beyond the return address) needs the immediate operand handled. **[Far calls and returns](https://reverseengineering.stackexchange.com/questions/31060/what-is-a-far-call-in-an-x86-or-x86-64-cpu)** that cross between 64-bit and 32-bit compatibility mode require tracking the code segment and switching the disassembler’s machine mode. **[rep](https://revers.engineering/x86/rep.pdf)** -prefixed string operations near branch boundaries can interact with the sentinel in ways that aren’t immediately obvious. If the target uses any of these and the emulation doesn’t account for it, execution resumes with a wrong `RIP` or a corrupt stack, and the target crashes. For a known target you can audit this ahead of time and add handling for whatever it uses. For an unknown target, you’re potentially going to have some headaches ahead.

The tool has value for targets that don’t have that level of protection — malware samples, proprietary software with basic integrity checks, binaries where the goal is understanding behavior rather than evading detection infrastructure, old anti-cheats (e.g. **[PunkBuster](https://evenbalance.com/)**).

**\>> Notice For Utility**

**None of this means the tool is useless.** It means it’s a tool with a specific operating envelope, and you should know where the edges are before you point it at something. The branch-chasing strategy (and the others) work well, and the race data quantifies that if you applied it to a target with some variable integrity check you might have a decent chance of still getting information. If the target does any advanced behavior to validate itself, you either deal with them individually (manual-map with proper hiding, proxy timing APIs, attack the anti-tamper) or you reach for one of the frameworks described earlier that already handle these problems. The value of building this was never that it’s better than PIN or DynamoRIO. It’s that it took two afternoons, it’ll teach you things about exception dispatch, branch emulation, and building graphs yourself to get context, and it solved the specific problem in front of me with minimal effort.

**\* This is a tool for everyone who is interested in learning about these various topics and building confidence with RE tool development, and sometimes — like in my case — find a funny quirk you hadn’t thought to analyze in the past (the race condition).**

## Beyond Windows and x86

The technique is ISA-agnostic. Replace an instruction with something that faults, catch the fault, emulate, resume. That loop works anywhere you have a trap vector and can control the handler. **[ARM has UDF and HardFault](https://embedded.fm/blog/2017/3/6/exceptional-code)**. RISC-V raises an illegal instruction **[exception through mtvec](https://stackoverflow.com/questions/69989775/raise-an-illegal-instruction-in-risc-v-on-purpose)** for any invalid opcode, and its branch set (six conditional forms, JAL, JALR) is small enough that the entire emulation fits in a page of code. Other 16-bit MCUs have illegal instruction interrupts, but would require a static rewrite and not runtime. The branch emulation is actually simpler on most of these. x86 has 16 condition codes, variable-length instructions, multiple indirect addressing modes, near/far call distinctions, and compatibility mode transitions. The x86 version is the hardest one to write; if you’ve done it here, you’ve done the hard version first. Doing this type of project to get a solid grasp on tool development will aid in refining the mental model for approaching problems that require instrumentation. You learn how **[exception dispatch actually works](https://revers.engineering/applied-re-exceptions/)** at the OS and hardware level. You learn what it takes to emulate a branch instruction. You learn about tradeoffs and commit alternative methods to memory. In this case, you also learned what integrity checking can and can’t catch, and why. It’s the kind of understanding that makes a reverse engineer / tool developer more effective with any architecture, any debugger, or any framework.

## Conclusion

I’m not writin’ this. You know how it ends. This article is long enough. Hope you enjoyed, feel free to reach out to me on Twitter **[@daaximus](https://x.com/daaximus)**. See resources below for more information if you’re looking for it.

## Additional Resources

-   -   **[A Journey Through KiUserExceptionDispatcher](https://momo5502.com/posts/2024-09-07-a-journey-through-kiuserexceptiondispatcher/)**
    -   **[Exceptional Behavior: Windows 8.1 X64 SEH Implementation](https://blog.talosintelligence.com/exceptional-behavior-windows-81-x64-seh/)**
    -   **[Ken Johnson – x64 Exception Handling Part 2: Unwind APIs](http://www.nynaeve.net/?p=101)**
    -   **[Ken Johnson – x64 Exception Handling Part 3: RtlUnwindEx Internals](http://www.nynaeve.net/?p=105)**
    -   **[CodeMachine – X64 Deep Dive](https://codemachine.com/articles/x64_deep_dive.html)**
    -   **[Leviathan Security – Use of Windows Exception Handling Metadata](https://www.leviathansecurity.com/blog/use-of-windows-exception-handling-metadata)**
    -   **[Teaching pefile to Understand SEH-Related Data in PE64 Files](https://auscitte.github.io/posts/Exception-Directory-pefile)**
    -   **[Offensivecraft – The Stack Series: The X64 Stack](https://offensivecraft.wordpress.com/2023/02/11/the-stack-series-the-x64-stack/)**
    -   **[Unveiling Dynamic Binary Instrumentation Techniques (2025)](https://arxiv.org/abs/2508.00682)**
    -   **[PIFER – (Ab)using Processor Exceptions for Binary Instrumentation](https://arxiv.org/abs/2311.16532)**
    -   **[Valgrind: A Framework for Heavyweight Dynamic Binary Instrumentation](https://valgrind.org/docs/valgrind2007.pdf)**
    -   **[MAMBO – Low-Overhead Dynamic Binary Modification for ARM/RISC-V](https://github.com/beehive-lab/mambo)**
    -   **[QBDI – Dynamic Binary Instrumentation Framework (LLVM-based)](https://github.com/QBDI/QBDI)**
    -   **[Talos Intelligence – DBI with DynamoRIO](https://blog.talosintelligence.com/dynamic-binary-instrumentation-dbi-with-dynamorio/)**
    -   **[From Hack to Elaborate Technique – A Survey on Binary Rewriting](https://dl.acm.org/doi/10.1145/3316415)**
    -   **[Safer: Efficient and Error-Tolerant Binary Instrumentation (USENIX 2023)](https://www.usenix.org/system/files/usenixsecurity23-priyadarshan.pdf)**
    -   **[Kyle Halladay – X64 Function Hooking by Example](https://kylehalladay.com/blog/2020/11/13/Hooking-By-Example.html)**
    -   **[PolyHook 2.0 – x86/x64 Hooking Library](https://stevemk14ebr.github.io/PolyHook_2_0/)**
    -   **[SentinelOne – Deep Hooks: Native Execution in WoW64 Applications](https://www.sentinelone.com/blog/deep-hooks-monitoring-native-execution-wow64-applications-part-3/)**
    -   **[RCE Endeavors – Function Hooking: Trampolines & Detours](https://www.codereversing.com/archives/593)**
    -   **[SoK: All You Ever Wanted to Know About x86/x64 Binary Disassembly](https://yaohway.github.io/binsok.pdf)**
    -   **[FFXE: Dynamic Control Flow Graph Recovery (USENIX Security 2024)](https://www.usenix.org/system/files/usenixsecurity24-tsang.pdf)**
    -   **[RetroWrite – Statically Instrumenting COTS Binaries for Fuzzing](https://hexhive.epfl.ch/theses/19-dinesh-thesis.pdf)**
    -   **[Dna – LLVM-Based Static Binary Analysis Framework](https://github.com/Colton1skees/Dna)**
    -   **[Binary Ninja – Architecture Agnostic Function Detection](https://binary.ninja/2017/11/06/architecture-agnostic-function-detection-in-binaries.html)**
    -   **[Disassembling a Binary: Linear Sweep and Recursive Traversal](https://nicolo.dev/en/blog/disassembling-binary-linear-recursive/)**
    -   **[Evasion and Countermeasures to Detect DBI Frameworks](https://dl.acm.org/doi/10.1145/3480463)**
    -   **[DBI Frameworks: I Know You’re There Spying on Me](https://www.coresecurity.com/core-labs/publications/dynamic-binary-instrumentation-frameworks)**
    -   **[Common KiUserExceptionDispatcherHook Method](https://github.com/brew02/KiUserExceptionDispatcherHook)**
    -   [**Trail of Bits – Toward a Best-of-Both-Worlds Binary Disassembler**](https://blog.trailofbits.com/2022/01/05/toward-a-best-of-both-worlds-binary-disassembler/)

The post [Applied Reverse Engineering: Crude T&E for Control-Flow Tracing](https://revers.engineering/applied-re-crude-te-for-control-flow-tracing/) appeared first on [Reverse Engineering](https://revers.engineering/).
