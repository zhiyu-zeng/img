---
title: "Ring Around The Regex: Lessons learned from fuzzing regex libraries (Part 2) | secret club"
source: https://secret.club/2024/08/23/ring-around-the-regex-2.html
source_host: secret.club
clip_date: 2026-09-09T00:16:24+08:00
trace_id: 08b58366-a7e3-4d8a-8228-50da23b18e9a
content_hash: 10bff7fe75ee5915d075a4284bcb4d397e4ab9a0b26e233c2b93fb47bf9b9c09
status: synced
tags:
  - 模糊测试
  - PCRE2
series: null
feed_source: secret.club
ai_summary: 对PCRE2等正则库做模糊测试时，覆盖率指标极具误导性：JIT动态代码需另行设计执行，变异难保留语义，差分测试噪音高，否则会高估测试效果。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3d575244-d011-8172-adbb-fd1b68a6555f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 对PCRE2等正则库做模糊测试时，覆盖率指标极具误导性：JIT动态代码需另行设计执行，变异难保留语义，差分测试噪音高，否则会高估测试效果。
> 
> - **覆盖率假象：** PCRE2 虽然早已加入 OSS-Fuzz 且历史覆盖率约95%，但 JIT 编译器长期未被纳入实际模糊测试；启用后源码覆盖率跌到略高于80%，证明高覆盖不等于该测的代码都测到了。
> - **JIT 生成≠JIT 执行：** SanitizerCoverage 这类工具在编译期插桩，无法覆盖运行时生成的 JIT 代码；例如正则 `a|(0)` 若只喂入 `a`，JIT 虽然发出了捕获代码，但这段代码从未被执行，覆盖率会高估测试深度。同时用非 JIT 模式对照可缓解，却仍有各自优化带来的盲区。
> - **正则引擎不是纯解析器：** 模式先被解析再作为程序执行，而反向引用与上下文相关控制会让之前匹配行为影响后续处理；因此高覆盖并不能说明所有状态组合被探索过，这是覆盖率引导 fuzzing 面对复杂目标时的根本局限。
> - **变异与交叉频繁破坏语义：** 对良构正则在任意位置插入 `(` 往往直接产生不匹配错误，crossover 组合两个输入时也无视正则语义，无法可靠混合行为；应优先采用语法感知的生成与变异。
> - **差分模糊的代价：** 同时执行“经典”与 JIT 实现可以发现若干 bug，但即使多数 bug 在攻击者无法控制 pattern 时现实利用性低，仍需人工定位；PCRE2 累计约50–60个报告最终由两位开发者业余处理，容易造成警报疲劳。

I’m a little late (one whole month passed in a blink of an eye!). Let’s catch up.

We briefly explored this idea that fuzzing has some limitations, looking specifically at problems associated with harnessing and input mutation. Sometimes, we can do everything right and yet the fuzzer still struggles to find bugs. Regex engines fall into this camp quite strongly; let’s figure out why by looking at PCRE2.

## Target 2: PCRE2

PCRE2 is (likely!) the world’s most used regex library. It started as PCRE back in 1998, eventually upgrading to PCRE2 in 2014 due to major API changes. I highly recommend reading [Joe Brockmeier’s article on the library and the primary developer, Philip Hazel](https://lwn.net/Articles/978463/) – the library, and its author, have quite an incredible history.

A few months ago, now a few years after [my exploration of rust-regex](https://github.com/rust-lang/regex/security/advisories/GHSA-m5pq-gvj9-9vr8), I stumbled across a bug in PCRE2 during a research project. The bug suggested the presence of latent bugs in the [just-in-time compiled component](https://github.com/zherczeg/sljit) of PCRE2. At CISPA, we are encouraged to investigate such tangents and, being the fuzzing-oriented person I am, I started deep diving the fuzzers in PCRE2.

## OSS-Fuzz, or: Learned Helplessness

There is a standing fear that if a project is in OSS-Fuzz, there is no point in fuzzing it. This is especially the case for PCRE2: [it’s been in OSS-Fuzz since the very beginning](https://github.com/google/oss-fuzz/pull/24)! PCRE2 has likely been fuzzed for *multiple centuries of CPU time* at this point.

And yet, [there are fuzzing-discoverable bugs in OSS-Fuzz projects](https://blog.isosceles.com/the-webp-0day/). How could we miss them?

### fuzz-introspector

Trying to understand this very problem, [OpenSSF](https://openssf.org/), led by David Korczynski, developed Fuzz Introspector in 2021. This tool inspects fuzzer performance over time by tracking various metrics and is most notably deployed on OSS-Fuzz.

[With this tool, we can inspect how well (or, more frequently, how poorly) various harnesses are performing in OSS-Fuzz](https://introspector.oss-fuzz.com/projects-overview).

We can see that a majority of targets get very low coverage. This flies in the face of the assumption one might make regarding how well fuzzed targets in OSS-Fuzz are, and [is a problem that Google spends a lot of money trying to solve](https://bughunters.google.com/about/rules/open-source/5097259337383936/oss-fuzz-reward-program-rules). Yet [PCRE2 has historically reached high code coverage](https://storage.googleapis.com/oss-fuzz-introspector/pcre2/inspector-report/20231001/fuzz_report.html), so what went wrong here?

One of the limitations of Fuzz Introspector is that it can only determine if something is *uncovered* if it can find the function within the binary. In the case of PCRE2, [the JIT compiler was never actually included in the fuzz testing](https://github.com/PCRE2Project/pcre2/pull/317#issuecomment-1804274817). As a result, [once enabled](https://github.com/google/oss-fuzz/pull/11195), the [true coverage of the source code was shown to be far lower](https://introspector.oss-fuzz.com/project-profile?project=pcre2):

![a chart displaying the percent of covered lines over time, with a sudden drop from approximately 95% to just above 80% on February 21st](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ef2f6078140fa36c.png)

So, even for programs with high code coverage, you cannot merely take it at face value that the code is well-covered. Similarly, [coverage is not indicative of bug discovery](https://dl.acm.org/doi/pdf/10.1145/3510003.3510230), so we cannot take the coverage itself at face value.

## You’re JIT-ing me

To improve the OSS-Fuzz harness, I submitted changes that enabled fuzzing of the JIT compiler in tandem with the normal executor. We do this because fuzzing the JIT compiler alone is insufficient.

Consider the mechanism by which code coverage is measured. In libFuzzer, this works via [the SanitizerCoverage pass](https://clang.llvm.org/docs/SanitizerCoverage.html), which adds callbacks at code points which will track the traversal of certain edges. For the coverage to be tracked, the code must exist at compile-time.

In the presence of a JIT compiler, the code which is executed is not guaranteed to be produced at compile-time.

When a JIT compiler is used, some code is generated at runtime. This can lead to curious problems where we cover the JIT compilation code, but not the compiled code itself. For example: consider a regex like `a|(0)` (“match the literal `a` OR [capture](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Capturing_group) a literal `0` ”). The JIT compiler *emits* capturing code, but if we only execute this regex on the input `a`, we will *never actually run* the emitted code, meaning we will never execute the code performing the capture. In effect, the code coverage for the JIT compiler represents a *superset* of the coverage of the regex which is executed.

To get around this, when fuzzing regexes which are JIT’d, we must also execute each regex without JIT to get a sense of what code regions are actually used during execution, lest we overestimate what we’ve actually tested and not just generated. But even this can be misleading, because the JIT implementation does not necessarily strongly relate to the implementation of the “classic” implementation. There are likely specific optimisations in each which will need to be tested, and there are no guarantees that a corresponding code region exists in the coverage-measured code for a code region emitted by JIT. As such, this is an inescapable limitation.

### But Addison, you can measure the code coverage in QEMU or something!

You do not want to do this. The JIT’d region will change every time you execute the program, and it effectively turns each tested regex into its own little program that must be covered. More importantly, it will not be trivial to distinguish whether two regexes are meaningfully different. Without serious investment into mapping which JIT regions are produced and affected by which JIT compiler regions, this would only lead to an explosion of inputs considered “interesting” without real progress.

TL;DR: don’t use emulated code coverage with JIT compilers.

## Regex is more than just a parser

Fuzzers were originally crafted targeting parsing programs, like [image parsers](https://lcamtuf.blogspot.com/2014/11/pulling-jpegs-out-of-thin-air.html). These programs are generally simple; when you’re parsing an image, there’s only so many ways in which a given parsing region can be reached. Similarly, there’s only so much state which affects how the corresponding region of input is parsed by that code.

Regex engines first parse the pattern, then execute the (very limited) program represented by that pattern. When you explore the coverage of a parser, you typically explore most of the behaviours of the parser (with [notable exceptions](https://blog.isosceles.com/the-webp-0day/)). When you explore the coverage of a regex engine, you explore very little of its behaviours because of the huge amount of impact that what has previously been processed by the pattern affects what *will* be parsed by the pattern yet. This is especially true for PCRE2, which [supports referencing previously-captured data](https://github.com/PCRE2Project/pcre2/issues/334) and [context-specific control of execution behaviour](https://www.pcre.org/current/doc/html/pcre2syntax.html#SEC25).

More generally speaking, as program interpretation of inputs increases in complexity and more program state determines the behaviour of various code regions, their interactions become more important than their coverage alone. For this reason, while coverage has been historically effective at measuring the exploration of the program, it simply cannot express whether you’ve explored all the ways in which a code region can behave (and more relevantly, how it can fail). **This is a strong limitation of coverage-guided fuzzing, and primarily affects highly-complex targets that require the most testing.** So far, very few meaningful improvements have been made to fuzzers in this regard, and anyone who makes meaningful, generalisable, and performant improvements to our ability to explore complex programs beyond “did we ever hit a code region” will revolutionise our field.

Since we can’t rely on coverage exploration alone, let’s hope our mutations are strong enough to create inputs that cause combinations of program behaviour that might trigger more complex behaviour which is indistinguishable over code coverage.

## The inescapable reinterpretation problem

[Last time](https://secret.club/2024/06/30/ring-around-the-regex-1.html), we talked about how inputs may be reinterpreted if mutations do not preserve the meaning of an input. While rust-regex’s harness still does not have a stable interpretation (that is, a length change can still change the meaning of the input), PCRE2 does because it uses the tested pattern as the input to itself and only mutates the pattern. Yet, mutations still can corrupt (or significantly modify the interpretation of) the inputs because byte mutations on well-formed regexes do not sanely transform the inputs.

For example: the mere insertion of a `(` into a pattern will *nearly always* cause the pattern to become invalid, as the brace is unmatched (with some exceptions, e.g.: `[...(...]`). We rely on luck to make meaningful modifications to the inputs.

### Crossover as a magic bullet?

Crossover is the process by which two inputs are combined to make a new input that exhibits features from both original inputs. The strategy is [imported from genetic algorithms](https://en.wikipedia.org/wiki/Crossover_\(genetic_algorithm\)) but is sadly also affected by reinterpretation, since two inputs are crossed over without respect to the semantics of the patterns they represent. As a result, it cannot be relied upon to “mix” behaviour and thus better explore the program when coverage is not enough.

### Okay, so why not make a grammar and mutate it from there?

Please do!

## Findings

With the updates to the fuzzer to include JIT, I found [several bugs](https://bugs.chromium.org/p/oss-fuzz/issues/list?sort=reported&q=label%3AProj-pcre2%20opened%3E2023-11-01&can=1) and some privately reported issues with the JIT compiler. None of them were realistically exploitable in normal circumstances by attackers unable to control the pattern.

## Differential fuzzing

Since we’re already executing both the “classic” implementation of regex and the JIT implementation of regex simultaneously, it should be trivial to compare their outputs.

Right?

### Harnessing is hard

I won’t go into the details of comparing the two outputs, but [there are quite a few corner cases that dramatically complicate comparing JIT with classic regex](https://github.com/PCRE2Project/pcre2/pull/322/files#diff-5e0fa083af9dd8fcc88a5af9928b2a9af95282911e7043182a48cc6ba22e769aR398-R441). Primarily, there are different optimisations and failure cases which cause one to fail when another succeeds, and iterating through the results is occasionally non-trivial as well. The hardest part, however, is communicating to the user *what exactly the problem is* – that is, what precisely about the two outputs produced differ. Developing a harness to do so was a multi-month process, but ultimately did find several bugs.

### Fault localisation

Finding what exactly caused a difference can also be quite difficult. [Take, for example, this issue, which stumped everyone involved for two weeks before we could even agree on interpretation of the input](https://github.com/PCRE2Project/pcre2/issues/334). Since tools which find the root cause of *specifically* bugs found by a *differential oracle* are not widely available, each testcase must be manually inspected and investigated. Sometimes, [I was able to diagnose the cause, but not the relevant code region, myself](https://github.com/PCRE2Project/pcre2/issues/360), but [there were many issues where I relied on the developers to discover the root cause from start to finish](https://github.com/PCRE2Project/pcre2/issues?q=is%3Aissue+author%3Aaddisoncrump+). This is a major usability failure in fuzzing: without localisation or remediation advice, developers suffer a form of [alert fatigue](https://dl.acm.org/doi/pdf/10.1145/3670009) from bugs found by differential fuzzers – especially since they are [not easily discernable from each other](https://angelosk.github.io/Papers/2017/nezha.pdf).

I deeply appreciate the developers for bearing with my incessant bug reporting, and for being open to the new forms of testing even when the bugs seemed pointless.

### Wait, pointless bugs?

What exactly is a bug? If a bug causes a program to crash, but no sane user is nearby to be affected by it, does it still matter?

[Should you fix a bug if it reduces the performance in the normal case, and doesn’t affect realistic inputs?](https://github.com/PCRE2Project/pcre2/issues/334#issuecomment-1832576631)

Differential fuzzing finds any difference it can and complains about them all equally, regardless if any “real” user would be affected. When using such tools, it is necessary to be mindful of whether the developer will care, or even want to fix the bug, since it may not realistically affect anyone in practice.

## Early Conclusion

I have long, long missed my own deadline for this post. But I think some of the findings are meaningful, and want to get it out there before it becomes irrelevant. Perhaps in the future, I will add some specialised fuzzers to measure and demonstrate some of the effects mentioned here rather than just telling you about what I found while debugging, but for now, that will have to wait.

I think the primary takeaway here is the same as part 1: you cannot rely on the fuzzer to magically find all the bugs for you, nor tell you what causes them. Each harness and target must be individually considered for what specific blockers or misrepresentations of fuzzer performance may occur. Moreover, don’t mistake lots of fuzzing time on one harness for an upper bound on what can be found by fuzzing – lots of harnesses are simply incapable of finding some bugs. Finally, when using these tools, be cognisant of how the developers will react; some 50-60 bugs were reported by the PCRE2 fuzzers, all in all, and were handled by two developers in their free time.

I hope this somewhat disconnected rumination helps others make better fuzzers, find more bugs, and help developers fix them.
