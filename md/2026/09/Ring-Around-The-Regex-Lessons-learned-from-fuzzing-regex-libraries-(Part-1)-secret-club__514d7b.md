---
title: "Ring Around The Regex: Lessons learned from fuzzing regex libraries (Part 1) | secret club"
source: https://secret.club/2024/06/30/ring-around-the-regex-1.html
source_host: secret.club
clip_date: 2026-09-09T00:15:50+08:00
trace_id: 75270a50-317b-45d0-a1e0-17316b19b08c
content_hash: 482b43d5994fbcc908d6429d320e96540d9f5b8dd113f6565b40073adaf29b4e
status: synced
tags:
  - Fuzzing
  - 正则表达式
series: null
feed_source: secret.club
ai_summary: "TL;DR: 改造 rust-regex 的 fuzz harness，用 arbitrary 定义输入结构可缓解字节变异导致的“数据重释”问题，短时间命中已知漏洞；但变异指导与正确性检测仍不足。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d575244-d011-81cf-b98e-fe83b3e0547f
ioc:
  cves:
    - CVE-2022-24713
    - CVE-2022-27413
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR: 改造 rust-regex 的 fuzz harness，用 arbitrary 定义输入结构可缓解字节变异导致的“数据重释”问题，短时间命中已知漏洞；但变异指导与正确性检测仍不足。
> 
> - **原 harness 缺陷：** 首字节长度字段将输入切成 pattern 与 haystack；长度一变，offset 和 regex 语义被重释，一次 1 字节编辑常不产生新覆盖，且 pattern 最大 255 字节。
> - **重构思路：** 用 arbitrary 把随机字节解析成结构化 pattern 与 haystack，使变异主要影响语法决策，避免大量非法输入直接死在解析前。
> - **实际效果：** 尽管 arbitrary 内部仍有重释，反而让变异近似黑盒语法生成器；新 fuzzer 运行不到 1 分钟即触发 rust-regex 的编译期超时 DoS 漏洞。
> - **局限：** 输入在变异间可能差异过大，缺少对匹配策略和深层逻辑的定向探索；差分 fuzzer 未实际启用，意味着多数正确性错误无法被发现。
> - **教训：** 字节级变异通常不够；设计 harness 时须考虑输入如何生成、变异、解释、执行，也需要为想检测的 bug 提供检测手段。

Okay, if you’re reading this, you probably know what fuzzing is. As an incredibly reductive summary: fuzzing is an automated, random testing process which tries to explore the state space (e.g., different interpretations of the input or behaviour) of a program under test (PUT; sometimes also SUT, DUT, etc.). Fuzzing is often celebrated as one of the most effective ways to find bugs in programs due to its inherently random nature, which defies human expectation or bias [1](#fn:1). The strategy has found countless security-critical bugs (think tens or hundreds of thousands) over its 30-odd-years of existence, and yet faces regular suspicion from industry and academia alike.

The bugs I’m going to talk about in this post are not security critical. The targets and bugs described below are instead offered as a study for fuzzing design decisions and understanding where fuzzing fails. I think this might be useful for people considering fuzz testing in both security and non-security contexts. If anything is poorly explained or incorrect, please [reach out](https://nothing-ever.works/@addison) and I will happily make corrections, links, or add explanations as necessary.

In this blog post, I’m going to talk about the fuzzing of two very different regular expression libraries. For each, I’ll detail how I went about designing fuzzers for these targets, the usage of the fuzzers against these targets, the analysis and reporting of the bugs, and the maintainence of the fuzzers as automated regression testing tools.

## Targets

Okay, our PUTs for today are:

-   [rust-lang/regex](https://github.com/rust-lang/regex)
-   [PCRE2](https://github.com/PCRE2Project/pcre2)

We develop separate [differential fuzzing](https://secret.club/2022/05/11/fuzzing-solana.html#the-target-and-figuring-out-how-to-test-it) harnesses for each that are dependent on the specific guarantees of each program.

## Sidebar: What is regex?

If you have programmed anything dealing with string manipulation, you’ve almost certainly encountered **reg** ular **ex** pression (RegEx, or just regex) libraries. There are many forms of regular expressions, from the [formal definitions](https://en.wikipedia.org/wiki/Regular_expression#Formal_language_theory) to the [many modern implementations](https://en.wikipedia.org/wiki/Comparison_of_regular_expression_engines), like the two discussed here. Modern “flavours” of regex often include quality-of-life features or extended capabilities not described in the original formal definitions, and as such actually represent greater formal constructs (e.g., I’m fairly confident that PCRE2 is capable of encoding something higher than a context-free grammar).

The purpose of these libraries is definitionally straightforward: to provide a language that can define patterns to search through text. Their implementation is rarely so straightforward, for two primary reasons:

1.  Users demand expressive patterns by which to search text. Many different strategies must be made available by these libraries so that users may search and extract details from text effectively.
2.  Text searching is often a hot path in text processing programs. Any implementation of regex must be implemented to process text extremely efficiently for any reasonable pattern.

I won’t give an overview of the writing and usage of regex here, as it’s mostly irrelevant for the rest of this. For those interested, [you can find an overview of common features here](https://www.regular-expressions.info/refflavors.html).

## Target 1: rust-lang/regex

The [regex crate](https://github.com/rust-lang/regex) (hereon, rust-regex) is one of the most widely used crates in the entire Rust ecosystem. Its syntax is potentially more complex than some other engines due to its extended support of Unicode, but notably restricts itself to [regular languages](https://en.wikipedia.org/wiki/Regular_language). rust-regex, unlike most other regex libraries, offers [moderate complexity guarantees](https://docs.rs/regex/latest/regex/#iterating-over-matches) and is thus resistant (to a degree!) to certain malicious inputs.

I fuzzed rust-regex some time ago now (>2 years), but below is a brief summary of how I approached the software.

### Analysis of the existing harness

A fuzzing harness (in most cases) is simply a function which accepts an input and runs it in the target. Ultimately, from the perspective of the user, the fuzzing process can be thought of as so:

1.  the fuzzer runtime starts
2.  the runtime produces some input
3.  the harness is run with the new input; if an input causes a crash, stop
4.  the runtime learns something about your program to make better inputs with
5.  go to step 2

So, to be super explicit, we describe the *fuzzer* as the whole program which performs the fuzz testing, the *fuzzer runtime* as the code (typically not implemented by the user) which generates inputs and analyzes program behaviour, and the *harness* as the user code which actually manifests the test by calling the PUT. Having a poor fuzzer runtime means your program won’t be tested well. Having a poor harness means that the inputs produced by the runtime might not actually test much of the program, or may not test it very effectively.

Since we don’t want to make a custom fuzzer runtime and just want to test the program, let’s focus on improving the harness.

When I started looking into rust-regex, it was already in [OSS-Fuzz](https://github.com/google/oss-fuzz/). This means potentially thousands of [CPU-years](https://www.gridrepublic.org/joomla/components/com_mambowiki/index.php/GFlops,_G-hours,_and_CPU_hours) of fuzzing has already been performed on the target. Here, we’ll talk about two ways to find new bugs: better inputs and more ways to detect bugs. Both of these are directly affected by how one harnesses the PUT.

[Here is the rust-regex harness as I originally saw it.](https://github.com/rust-lang/regex/blob/2f9103e6bf940894b366cf4ead61237b1382bacf/fuzz/fuzz_targets/fuzz_regex_match.rs) This harness works by interpreting the first byte as a length field, then using that to determine where to split the remainder of the input as the search pattern and the “haystack” (text to be searched).

```haskell
index                                      | meaning
------------------------------------------------------------
0                                          | length field
------------------------------------------------------------
[1, 1 + data[0] % (len(data) - 1))         | search pattern
------------------------------------------------------------
[1 + data[0] % (len(data) - 1), len(data)) | haystack
```

And, this works; for several years, this fuzzer was used in practice and found [several bugs](https://bugs.chromium.org/p/oss-fuzz/issues/list?sort=reported&q=label%3AProj-rust-regex%20opened%3C2023-01-01&can=1). But this harness has some problems, the biggest of which being: data reinterpretation over mutation.

#### Looking under the hood

Fuzzers, sadly, are not magic bug printers. The fuzzer runtime used here is [libFuzzer](https://llvm.org/docs/LibFuzzer.html), which performs random byte mutations and has no fundamental understanding of the program under test. In fact, the only thing the fuzzer really considers to distinguish the effects of different inputs is the coverage of the program [2](#fn:2). When an input is generated, it is only considered interesting (and therefore retained) if the program exhibits new coverage.

Moreover, inputs are not simply generated by libFuzzer. They are rather the result of *mutation* – the process of modifying an existing input to get a new input. Let’s break apart the loop we described earlier into finer steps (edits in bold):

1.  the fuzzer runtime starts
2.  **the runtime selects some existing input from the *corpus* (the retained set of inputs); if none are available, generate one and go to 4**
3.  **the runtime mutates the input**
4.  the harness is run with the new input; if an input causes a crash, stop
5.  **the runtime inspects the coverage of the last run; if the input caused a new code region to be explored, add it to the corpus**
6.  go to step 2

#### Understanding mutation

One of the underlying assumptions made about fuzzing with mutation is that a mutated input is similar to the input it’s based on, but different in interesting ways. But, what does it mean to be similar? What does it mean to be interestingly different?

In general, we would like to explore the PUT’s various ways of interpreting an input. We can’t [3](#fn:3) magically generate inputs that get to places we haven’t explored before. Rather, we need to stepwise explore the program by slowly stepping across it.

Consider a classic demonstration program in fuzzing (pseudocode):

```kotlin
if (len(data) >= 1 && data[0] == 'a') {
 if (len(data) >= 2 && data[1] == 'b') {
  if (len(data) >= 3 && data[2] == 'c') {
   if (len(data) >= 4 && data[3] == 'd') {
    // bug!
   }
  }
 }
}
```

Suppose we want to hit the line that says “bug!”. We need to provide the program with an input that starts with `abcd`. If we simply generate random strings, the odds of producing such a string are at most 1 in 2^32 – roughly 1 in 4 billion. Not the best odds.

The promise of coverage-guided fuzzing is that, by mutation, we slowly explore the program and thus break down the problem into separate, easier to generate subproblems. Suppose that our runtime only applies mutations that randomly produce inputs with an [edit distance](https://en.wikipedia.org/wiki/Edit_distance) of 1. Now, when we mutate our inputs, starting small, we can guess each 1 in 256 byte one at a time, and our runtime will progressively explore the program and get to the line that says “bug!” after solving this sequence of smaller subproblems.

#### The data reinterpretation problem

Let’s rewrite our harness slightly to be more representative of the rust-regex harness.

```python
if (len(input) <= 1) {
 return;
}
data = input[1..];
offset = input[0] % len(data);
if (len(data) + offset >= 1 && data[offset] == 'a') {
 if (len(data) + offset >= 2 && data[offset + 1] == 'b') {
  if (len(data) + offset >= 3 && data[offset + 2] == 'c') {
   if (len(data) + offset >= 4 && data[offset + 3] == 'd') {
    // bug!
   }
  }
 }
}
```

This program is precisely the same “difficulty” as the original problem; we set `input[0] = 0` and `input[1..]` to the solution from the original harness. Except, for coverage-guided fuzzers, this problem is orders of magnitude more difficult (reader encouraged to try!). Let’s look at how this program behaves over mutation; for clarity, raw bytes (like the offset field) will be written as `[x]` with `x` as the value in that byte.

Starting with some randomly generated input:

```
[123]c
  ^  ^
  |  |
  |  + first byte
  |
  + offset field; offset = 123 % len(input[1..]) = 123 % 1 = 0
```

This input is retained, because we have new coverage over the first few lines, but we don’t make it into the nested ifs just yet. Then, we mutate it until we find new coverage:

```
[123]a
  ^  ^
  |  |
  |  + first byte (passes our check!)
  |
  + offset field; offset = 123 % len(input[1..]) = 123 % 1 = 0
```

Great! We’ve hit the first if in the nested block. Unfortunately, with an edit distance of 1, we can now never trigger the bug. Suppose we get lucky and produce a `b`, which would have historically now passed the second condition:

```sql
[123]ab
  ^  ^^
  |  ||
  |  |+ first byte (fails the first check)
  |  |
  |  + skipped by offset
  |
  + offset field; offset = 123 % len(input[1..]) = 123 % 2 = 1
```

Because the offset is now *reinterpreted* by the program due to a change in length, the input is actually *dissimilar* to the original input from the perspective of the program. Even supposing we get lucky and get an `a` instead, the coverage of the resulting program doesn’t improve over the first mutated input and thus doesn’t get retained. If we change the offset to zero, then we don’t get new coverage because we still only have an `a`. With an edit distance of 1, we simply cannot actually produce any new coverage from this input.

This data reinterpretation problem is rampant across OSS-Fuzz harnesses, and mitigating the problems induced by this is a great place to start for people looking to improve existing harnesses. While, in practice, the edit distance of mutations is extremely large, the randomness produced by reinterpretation effectively reduces us all the way back to random generation (since we are nearly guaranteed to induce a reinterpretation by [havoc mutations](https://github.com/AFLplusplus/LibAFL/blob/0.13.0/libafl/src/mutators/scheduled.rs#L258-L286) used by nearly all fuzzers). In rust-regex, the consequence of this reinterpretation problem is that regexes are wildly reinterpreted when inputs are small (as typically optimised-for by fuzzers) or when the first byte is mutated. Moreover, the pattern can never actually exceed 255 bytes (!).

### Redesigning the harness

Okay, so we know that the existing harness has some problems. Let’s redesign the harness to clearly segment between “pattern” and “haystack” by structurally defining the input. We can use the handy dandy [arbitrary](https://docs.rs/arbitrary/latest/arbitrary/) crate to define a parser over arbitrary bytes to transform the input into a well-formed pattern and haystack. This, in turn, effectively makes mutations directly affect decisions made by the parser defined in arbitrary by making arbitrary act as an interpreter for the bits in the input, and mutations making changes to the decisions made by arbitrary [4](#fn:4). As a user, this is simple, straightforward, and makes inputs much more “meaningful”; we now know that the bytes in our input represents a meaningful pattern.

You can find these changes in the merged changes by the author; [change 1](https://github.com/rust-lang/regex/commit/64099ce17956519716d31f8a124c8b6d5abbdeb3), [change 2](https://github.com/rust-lang/regex/commit/8773579baf55bc801c32d5e4c20293baf75d325e).

Did we solve the reinterpretation problem?

#### Interlude: grammar fuzzing vs byte fuzzing

Consider, for a second, a JSON parser. JSON is a very well-defined, structural language that aggressively rejects malformed inputs. Yet, byte-level mutational fuzzers with no awareness of the JSON format can produce well-formed JSON inputs by exploring the program space. That said, most mutations produced mangle the JSON input dramatically (e.g., in `{"hello":"world"}`, a mutation to `{"hel"o":"world"}` instantly makes the JSON parser reject the input). This limits the ability for byte-level mutational fuzzers to produce interesting inputs that test code *behind* a JSON interpreter.

Consider the following rendition of our earlier examples:

```
obj = JSON.loads(input); // lots of coverage in JSON to explore!

if (obj.a == 'a') {
  // bug!
}
```

Our byte-level mutational fuzzer will try to find as much code coverage as it can – and will mostly get lost in the weeds in the JSON step. Suppose we are “smart” and tell the fuzzer to magically ignore the coverage in JSON; now, the fuzzer will almost certainly never produce even a valid JSON input. As a result, we will never hit “bug!”.

But, suppose we wrote an [arbitrary](https://docs.rs/arbitrary/latest/arbitrary/) implementation that was capable of interpreting the random bytes produced by our mutational fuzzer valid objects with a field called “a”, before serialising it and handing it to the PUT. Now, we are effectively guaranteed to be able to produce an input that hits “bug!”, provided that our mutator is smart enough to figure out how to get the string “a” into that field.

Certainly, the mutator will easily do this, right?

#### Data Reinterpretation: Reloaded

Arbitrary, sadly, is not a magic input printer.

Internally, the parser itself defines various length fields *throughout the parsing process* which determine how the remainder of an input is processed. This makes the format of the input change dramatically with small changes to the input [5](#fn:5), and thus, once again, the data reinterpretation problem emerges.

Worse, when we now deploy our fuzzer, the [meaning of the inputs changes](https://github.com/rust-lang/regex/pull/978#issuecomment-1573609410) – so our thousands of CPU years of fuzzing in the past is now thrown away.

As it turns out, the data reinterpretation problem is *probably unavoidable*; without having mutations that are simply aware of the datatype, producing similar inputs is probably not possible. Even when directly mutating entries in the grammar (e.g., by [simply replacing one subtree of the input with another](https://www.fuzzingbook.org/html/GreyboxGrammarFuzzer.html#Fuzzing-with-Input-Fragments)), the edit distance is often huge. This invalidates the basic premise of our coverage-guided fuzzer, and as a result makes our fuzzer effectively useless.

Right?

#### Results

My arbitrary-based fuzzer was written in 30 minutes. I ran it for less than a minute before a testcase triggered [CVE-2022-27413](https://blog.rust-lang.org/2022/03/08/cve-2022-24713.html) [6](#fn:6) as a timeout in a release build of the fuzzer.

As it turns out, the mass reinterpretations of the input were not a problem – when arbitrary was used. Since the randomness induced by the mutations caused major reinterpretations of the input, a huge amount of the *grammar* of the inputs were explored. This effectively turned the mutator into a [blackbox grammar generator](https://www.fuzzingbook.org/html/Grammars.html), and [the grammar was covered](https://www.fuzzingbook.org/html/GrammarCoverageFuzzer.html) as a natural result of the covering of the program.

With the randomness constrained to valid inputs, it was only a matter of time before a valid input was spat out that met the [exact preconditions for the bug](https://github.com/rust-lang/regex/blob/8856fe36ac7dc37989e6ffb26b5fc57189bae626/regex-syntax/src/hir/literal.rs#L2859-L2884). And, since, it’s found [lots of other issues, too](https://bugs.chromium.org/p/oss-fuzz/issues/list?sort=reported&q=label%3AProj-rust-regex%20opened%3E2023-6-10&can=1). I’ve even made [differential fuzzers](https://github.com/rust-lang/regex/pull/1044) which have had [success](https://github.com/rust-lang/regex/commit/95a745ecb619c2cb5e83fddb9445cf3bb2db2408) in identifying some consistency bugs between versions and sub-implementations.

So, we’ve found all the bugs now, right?

### Takeaways

I recognise that this section is, frankly, a bit hard to interpret. We started out by saying that maintaining the similarity of inputs was important for coverage-based fuzzers, then ended by saying, “oh, it actually wasn’t if we were using arbitrary”. So, what is it?

The sad answer is simply that our testing is incomplete – and will always *be* incomplete. While we are now capable of producing well-formed, highly-complex, and interesting inputs quickly, we lack guidance when actually performing mutations. Our inputs are very dissimilar across mutations, and we likely suffer from the JSON loading problem I described earlier, where we can’t find the deeper bugs dependent on the result of the parsing.

It’s unclear whether we effectively test different matching strategies, too. While our inputs are now grand and complex, they may not be effectively testing the matching code since we don’t know how relevant our haystacks are to our patterns. The fuzzer has, resultantly, missed [several crashes and incorrectnesses discovered by other users](https://github.com/rust-lang/regex/issues?q=is%3Aissue+incorrect+is%3Aclosed+created%3A%3E2023-07-10+).

Finally, since the differential fuzzers are not actively in use, we rely entirely on assertions and crashes. In other words, we cannot find correctness issues at all. Even if differential fuzzers were enabled, [there is no guarantee that they would catch all the issues](https://ieeexplore.ieee.org/abstract/document/6312924), especially since we don’t explore the program space very well for matching.

I could ramble on for some time about other weaknesses of the fuzzers now in use here, but that’s neither here nor there. The main thing that you, dear reader, should consider is that how your fuzzer is internally trying to test the program and how much time you’re willing to spend to make the fuzzer work well. The fuzzer runtime is not magic and neither is the harness. You cannot expect it to reliably produce inputs that, as passed by your harness, will trigger bugs in your program. Moreover, you cannot expect that you will magically find bugs for which you have no means of detecting. You must critically think about how inputs will be generated, mutated, interpreted, and executed, and decide how much time you will spend to make the fuzzer effective for finding bugs in your target.

But almost certainly, [byte-level mutations are not enough](https://blog.isosceles.com/the-webp-0day/).

## Target 2: PCRE2

Continued in [Part 2](https://secret.club/2024/08/23/ring-around-the-regex-2.html), released ~~2024.07.15~~ ~~2024.07.20~~ 2024.08.24 (got a little busy!).

1.  Mostly. [Fuzzers can be overfit to certain applications, intentionally or not.](https://mschloegel.me/paper/schloegel2024sokfuzzevals.pdf)[↩](#fnref:1 "return to article")
    
2.  This is not strictly accurate. [libFuzzer collects lots of different types of information, but at its core is ultimately a coverage-guided fuzzer](https://github.com/rust-fuzz/libfuzzer/blob/98489256e20e2afc913d163f0e802661bf7598c2/libfuzzer/FuzzerDriver.cpp#L644) [↩](#fnref:2 "return to article")
    
3.  Actually we kind of can, with [symbolic execution](https://www.fuzzingbook.org/html/SymbolicFuzzer.html), but this has its own problems that I’m not going into here. [↩](#fnref:3 "return to article")
    
4.  This was recently described to me in [Caroline Lemieux’s keynote at SBFT’24](https://sbft24.github.io/program/), but for my life I cannot remember the citation, cannot find it in the recording, and cannot find it in Google easily. [↩](#fnref:4 "return to article")
    
5.  This isn’t actually commonly discussed as a problem of arbitrary. You can see this effect [in several places](https://github.com/rust-fuzz/arbitrary/blob/main/src/lib.rs) [↩](#fnref:5 "return to article")
    
6.  I originally believed that this was a violation of the complexity guarantees of rust-regex, though their complexity guarantees refer to the size of the pattern after it is *compiled*, or made ready for use. Instead, the issue was that the rust-regex compiler, which effectively translates a human-readable pattern to an intermediate representation which is then “executed” to perform the actual search operation. This representation has all repetitions expanded, meaning that the issue affects compilation *before* the guarantees were applied. The original implementation presumed that the memory growth of the intermediate representation represented the computational cost of the pattern compilation, whereas the testcase that was discovered had zero-sized items with many repetitions. This led to a large compilation time before the pattern could even be used. [↩](#fnref:6 "return to article")
