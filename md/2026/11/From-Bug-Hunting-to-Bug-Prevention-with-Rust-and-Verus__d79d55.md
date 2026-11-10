---
title: From Bug Hunting to Bug Prevention with Rust and Verus
source: https://microsoftedge.github.io/edgevr/posts/From-Bug-Hunting-to-Bug-Prevention-with-Rust-and-Verus/
source_host: microsoftedge.github.io
clip_date: 2026-11-11T01:14:34+08:00
trace_id: 122b82f4-1d4c-4f08-90ea-8a119033b784
content_hash: 31aaff83ffd80d63e21d20ea1918e951207e36f5eb329d4e7d763b80964c343d
status: synced
tags:
  - 编译器保护
  - 协议分析
series: null
feed_source: Edge VR·浏览器漏洞研究
ai_summary: TL;DR：微软 Edge 团队用 Verus 在 Rust 代码上做形式化验证，以 Brotli 历史漏洞为实验、以 JPEG 2000 新解码器为落点，把部分验证左移到编写阶段，消灭算术与逻辑类漏洞。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41475244-d011-811b-a271-efffcf29dfc3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：微软 Edge 团队用 Verus 在 Rust 代码上做形式化验证，以 Brotli 历史漏洞为实验、以 JPEG 2000 新解码器为落点，把部分验证左移到编写阶段，消灭算术与逻辑类漏洞。
> 
> - **验证定位：** Verus 用 requires/ensures 契约检查程序员明确声明的性质（如“减法不会下溢”），对被建模输入域内所有输入成立；它不能证明整个程序无 bug，价值取决于契约与假设的选择。
> - **验证孪生方法：** 为每次历史修复写一个简化的 Rust “verification twin” 加上 Verus 契约——历史代码被拒绝（如 Brotli #247 的 `num_bytes_read - whole_byte_source` 无符号下溢、decompressor 中 `size * 8` 溢出），修复后的代码（pre-check、`checked_mul`、无符号 min 替代 i32 转换）在同一契约下验证通过。
> - **正反面澄清：** 类型系统不知道 `2^31` 经有符号转换会负值逃过钳制并回转成大数——规格能直接表达“三个长度应取数学最小值”。验证与 fuzzing 互补：fuzzing 覆盖解析、状态机、集成等未证明面，Verus 防止已证明性质被后续回归破坏；主张“证明选定不变量 + fuzz + 测试 + 集成验证”多层共存。
> - **JPEG 2000 实践：** 在 microsoft/jpeg2000_rs 中把 ITU-T 标准要求转成契约并直接挂在生产 Rust 代码上，避免孪生与实现漂移；契约还描述失败路径（如 PLM 超 tile-part 限制时报错且保留已追加的 tile-part）。明确宣称三种责任分工：实现→模型验证、模型→标准人工审查、独立运行时验证（一致性/差分/fuzzing），目前不声称完整的字节到图像证明。
> - **AI 与遗留风险：** AI 可起草规格、模型与证明，但 Verus 机械检查让 AI 必须产出“满足验证器的东西”而非说服性解释；若规格与实现共享错误假设，证明仍可能验证错误结论——人仍需审查契约含义。下一步是给处理不可信输入的 Rust 库选择一个易错不变量起步验证。

Rewriting existing software in Rust brings memory safety, and the cleanup that comes with a rewrite often clears out years of accrued clutter. AI is making that conversion faster, and we’ve already shared our [framework](https://microsoftedge.github.io/edgevr/posts/Rustifying-Image-Codecs-in-Chromium/) for building a compatible Rust implementation. This moves the bottleneck to validating the result and trusting its security.

That left us with two questions:

1.  Assuming adversaries are finding issues as quickly as we can, how can we speed up the validation and rollout of a Rust conversion by shifting more of that validation left, to authoring time?
2.  Rust eliminates memory-safety bugs, but it doesn’t inherently rule out other vulnerability classes, such as arithmetic errors and logic flaws that violate a specification. Can we eliminate those classes too, shrinking attack surface and giving defenders an advantage?

Our colleagues in Microsoft Research have been building tooling for formal verification in Rust: using mathematical proofs to confirm that specific properties of a program always hold. Together with them and Eng Horizons (CoreAI) we started experimenting and found that Rust with formal verification answers both questions. It moves validation to authoring time, complementing traditional validation so there is less to find at runtime, and it rules out the classes of vulnerabilities we specify, which built-in Rust does not inherently provide. An agentic authoring harness made writing the proofs approachable.

We’re excited to share two practical examples and encouraged by what this unlocks. First, we revisit historical bugs in an existing Brotli implementation and show how verification would have caught them. Second, we describe building formal verification in from the start of a JPEG 2000 decoder. Along the way, we’ll be clear about what a proof does and doesn’t establish.

Brotli is a timely choice. C-based Brotli implementations have [recently been in the news](https://research.jfrog.com/post/brotli2shell-beyond-node2shell-and-http2shell/) for security issues. Codecs and compressors are great leaf-node candidates for conversion to Rust, which is why Edge already had a Rust-based Brotli conversion [that we shared](https://microsoftedge.github.io/edgevr/posts/Beyond-Images-Bringing-Rust-Brotli-to-Edge-Network-Stack/) before that incident, and why we could protect Edge users from the active attack. That makes Brotli a natural proving ground for the next step: verification.

## What does it mean to prove code correct?

A conventional test runs a program on particular inputs and checks the result. A *formal proof* starts with a precise claim about the program, such as “we never subtract more bytes than are available,” and establishes that the claim holds for every input covered by the proof’s assumptions. It does not mean proving that an entire application is bug-free. The value comes from choosing useful, specific properties and checking them rigorously.

The Verus tool lets engineers express these properties as contracts alongside Rust code. A requires clause states what must be true when a function is called; an ensures clause states what must be true when it returns. Verus then uses automated reasoning to check whether the implementation satisfies those obligations. If it cannot establish a property, it reports a verification failure. This is stronger than testing a few examples for that property, but it is only as meaningful as the contract and assumptions we choose.

## Proving ground with Brotli

Brotli processes externally supplied data in a browser’s networking path, so it was a strong Rustification candidate. But choosing Rust was only the start of engineering work.

The fixes we contributed to the open-source libraries give us real examples to investigate. For each bug, we have the original faulty logic and the corrected version. We can write a precise contract describing the intended behavior, then ask whether Verus rejects the original code and accepts the fix.

To make that experiment practical, we created small **verification twins**. A twin is a separate, simplified Rust model that reproduces the specific logic we want to check, with a Verus contract added to it. We used twins to compare the before-and-after behavior without modifying the production Brotli crate. That makes the result useful evidence about a narrow property, not a proof of the full decoder or a guarantee that the twin matches every detail of the production implementation. We return to that limitation later.

## A four-byte header and one missing check

One of the cleanest examples came from Brotli’s concatenation support.

In the historical code addressed by [issue #247](https://github.com/dropbox/rust-brotli/issues/247) and the associated [PR #252](https://github.com/dropbox/rust-brotli/pull/252), `BroCatli::shift_and_check_new_stream_header` calculated how many buffered bytes remained after part of a header had been consumed.

The historical code contained this arithmetic:

```rust
let whole_byte_source = (varlen_offset + 7) / 8;
let num_whole_bytes_to_copy =
    usize::from(new_stream_pending.num_bytes_read) - whole_byte_source;

for aligned_index in 0..num_whole_bytes_to_copy {
    realigned_header[whole_byte_destination + aligned_index] =
        new_stream_pending.bytes_so_far[whole_byte_source + aligned_index];
}
```

You do not need to know Brotli internals to understand what went wrong. A truncated four-byte header could require five source bytes. The code therefore attempted to calculate `4 - 5` using unsigned arithmetic. In debug builds the unsigned subtraction panicked; in release builds it could wrap, with the subsequent indexing still causing a panic. **Memory safety did not make the input valid or the operation correct.**

The correction is recorded in [commit 577dc184](https://github.com/dropbox/rust-brotli/commit/577dc18438d3d0b394c8d84e11e3916722a6cb53). The important guard can be shown in a few lines (simplified from the [issue’s proposed fix](https://github.com/dropbox/rust-brotli/issues/247)):

```rust
let whole_byte_source = (varlen_offset + 7) / 8;
if whole_byte_source > usize::from(new_stream_pending.num_bytes_read) {
    return BroCatliResult::BrotliFileNotCraftedForConcatenation;
}
let num_whole_bytes_to_copy =
    usize::from(new_stream_pending.num_bytes_read) - whole_byte_source;
```

The key is to check that the buffered source contains the requested bytes *before* subtracting the consumed count.

A regression test can preserve this particular four-byte case. With Verus, we wanted to go one step further and describe the rule that should hold for the whole modeled input range.

For our verification twin, the contract states that a result exists exactly when enough buffered bytes are available, and that the resulting count precisely accounts for the bytes already consumed:

```rust
requires
    varlen_offset <= 64,
    num_bytes_read <= 5,
ensures
    result.is_some() <==>
        (varlen_offset as int + 7) / 8 <= num_bytes_read as int,
    result.is_some() ==>
        result.unwrap() as int
            + (varlen_offset as int + 7) / 8
            == num_bytes_read as int,
```

Applied to the historical arithmetic twin, Verus rejects it:

```
error: possible arithmetic underflow/overflow
16 | usize::from(num_bytes_read) - whole_byte_source;

verification results:: 0 verified, 1 errors
```

With the actual upstream guard represented in the fixed twin, the same contract verifies:

```
verification results:: 1 verified, 0 errors
```

When the regression test tells us that we know one input that used to fail, the proof establishes the stated arithmetic property for all offsets and buffered counts in the twin modeled domain.

This does not prove our implementation of Brotli is correct or even show that the whole function is panic-free. It establishes one small but useful property: **the subtraction is performed only when the required bytes exist, and the remainder is calculated exactly when they do.** A small guarantee like this may not sound dramatic, but it is exactly the kind of thing we would rather establish once than wait for a fuzzer to rediscover.

## Rust caught the failure. Verus can reject the arithmetic.

A second example came from allocation of arithmetic in rust-brotli-decompressor. The historical custom-allocator path calculated a byte size like this:

```rust
return core::mem::transmute::<*mut c_void, *mut usize>(
    alloc_fn(
        (*state_ptr).custom_allocator.opaque,
        size * core::mem::size_of::<usize>(),
    )
);
```

The multiplication was corrected upstream in [PR #53](https://github.com/dropbox/rust-brotli-decompressor/pull/53) and [commit 4703181d](https://github.com/dropbox/rust-brotli-decompressor/commit/4703181d43c76224574fa777e3c743d75e9ac276). Here, the requested number of `usize` elements has to be converted to bytes. If that multiplication exceeds what `usize` can represent, the implementation must reject it instead of allowing the byte count to cease representing the requested allocation. Our fixed verification twin makes that contract explicit:

```rust
pub fn allocation_bytes(size: usize) -> (result: Option<usize>)
    ensures
        result.is_some() <==> size as int * 8 <= usize::MAX as int,
        result.is_some() ==>
            result.unwrap() as int == size as int * 8,
{
    let alloc_size = match size.checked_mul(8usize) {
        Some(alloc_size) => alloc_size,
        None => return None,
    };
    Some(alloc_size)
}
```

On the historical arithmetic, the verifier reports:

```
error: possible arithmetic underflow/overflow
10 | Some(size * 8usize)

verification results:: 0 verified, 1 errors
```

With the checked multiplication used by the correction:

```
verification results:: 1 verified, 0 errors
```

Ordinary Rust testing gives another useful perspective here. In our experiment, the historical arithmetic panics at the overflow threshold in a debug build and wraps in a release build; the corrected version rejects the calculation. The proof asks a different question: does this calculation satisfy the byte-count contract over its modeled input domain?

Before the correction, it cannot establish that property. Afterward, it can. For clarity, our twin models eight-byte elements, corresponding to the upstream arithmetic on 64-bit targets. It does not prove allocation success, callback or pointer safety, the default allocator, or Brotli as a whole.

## Another pattern: conversions can invalidate otherwise sensible checks

We found the same idea useful for a third, slightly more subtle historical fix. Before [rust-brotli-decompressor PR #51](https://github.com/dropbox/rust-brotli-decompressor/pull/51), an unsigned remaining-byte count was narrowed to a signed integer before being clamped:

```rust
let mut nbytes = bit_reader::BrotliGetRemainingBytes(&s.br) as i32;
if nbytes > s.meta_block_remaining_len {
    nbytes = s.meta_block_remaining_len;
}
if s.pos + nbytes > s.ringbuffer_size {
    nbytes = s.ringbuffer_size - s.pos;
}
```

The copy path later converted `nbytes` back to an unsigned value. In the historical behavior represented by our twin, `2^31` can become negative during the signed conversion. That allows it to evade the positive clamps and become large again when converted back at the copy boundary. Rather than describing a particular failing input, the contract defines the conditions for a correct copy-length selection:

```rust
ensures
    result <= remaining,
    result <= meta,
    pos as int + result as int <= ring,
    result == remaining
        || result == meta
        
        || pos as int + result as int == ring,
```

The historical twin fails the contract. The corrected unsigned-min calculation from [commit 8cb69d1a](https://github.com/dropbox/rust-brotli-decompressor/commit/8cb69d1a84ee2c1902a5c0958eeaef240243d807) verifies under the documented model.

The type system does not know that a value represents “bytes remaining” or that three independently calculated lengths should produce their mathematical minimum. A specification can say that directly.

## Why not just fuzz harder?

We absolutely should fuzz. Fuzzing and formal verification offer complementary evidence, with different strengths and blind spots. A fuzzer executes concrete inputs and is remarkably good at exploring behavior humans did not anticipate. A fuzzer also exercises much more than a small arithmetic model. It reaches parsing, state machines, allocations, integration boundaries, and interactions between components.

Our Brotli experience is itself evidence for keeping those layers. We found issues through actual engineering validation. The field is messy, and models inevitably leave things out.

A narrow formal proof provides something different. Once we specify a property such as “ *this subtraction occurs only when enough bytes are available,*” the verifier can establish that property for all inputs represented by the model and contracts rather than waiting for runtime exploration to encounter a violating example.

We therefore do not see Verus as a replacement for fuzzing. Our approach is to **prove selected invariants, fuzz the implementation, test known behavior, and validate the integrated system.**

Neither layer is complete on its own. Covering every relevant path with a fuzzer is difficult; writing a sufficiently complete and accurate specification is difficult too. A maintained proof can remove the need to rediscover counterexamples to the **specific property proved**, but it does not literally remove those execution paths or establish every other property of them.

This also changes the way we think about the runtime-testing input space. If a maintained proof already establishes a particular arithmetic invariant, fuzzing remains free to explore the enormous collection of properties we have *not* proved: parser behavior, state transitions, compatibility, interactions, performance, and everything we failed to specify.

## Why Verus fits Rustification particularly well

Formal verification is not new. What is changing is how approachable it can be for engineers already working in Rust. Verus lets us write executable Rust with specifications and proofs expressed close to that code, rather than starting a separate implementation in an unfamiliar language. We can begin with one risky arithmetic operation, verify its contract, and expand only when the evidence justifies the effort.

Rust checks ownership, borrowing, and lifetimes, protecting safe code from many memory-safety errors. Verus can go further for explicitly stated properties that the Rust compiler does not understand: an index remains in range, a length never overflows, a parser preserves an invariant, or a state transition leaves a valid result. Tests check expected behavior against concrete examples, while fuzzing explores unexpected inputs and interactions that we may never have thought to specify. None replaces the others. Together, they help us prevent known classes of vulnerabilities, establish stronger correctness guarantees, and continue discovering problems outside the boundaries of our proofs. That is a useful way to shift correctness work left, while the code is being written, rather than paying for every mistake after integration.

Here is how we think about the layers:

| Layer | What it helps establish | Fundamental question | What remains outside its guarantee |
| --- | --- | --- | --- |
| Safe Rust | Memory and lifetime safety under Rust’s rules | Is this code memory-safe? | Algorithmic correctness and application-specific invariants |
| Verus | Explicitly specified properties of verified code, under stated assumptions | Can we mathematically prove this property always holds? | Whether the specification is the right one, and unverified components |
| Tests | Observed behavior on known inputs and integration paths | Does the program behave correctly for these known scenarios? | Exhaustive coverage of all possible inputs and states |
| Fuzzing | Discovery of failures through automated exploration of input space | What happens when we feed the program unexpected inputs? | Exhaustive coverage of all possible inputs and states |

The real opportunity is to bring formal verification into the Rust development process rather than treating it as something we do after finding a bug. Rust already gives us strong memory-safety guarantees, and Verus lets us establish additional properties that the type system cannot express on its own. By checking those properties as we write code, we can catch certain mistakes before they reach testing or production.

There is a longer-term benefit too. Once a property is specified and proved, it can remain part of the verification process as the implementation evolves. If a later change violates that property, verification fails. This gives us a form of regression protection that goes beyond individual test cases, while fuzzing and conventional tests continue exploring behavior outside the proof boundary.

Investing in these guarantees earlier can also reduce the cost of discovering and repairing defects later. Not every function needs a formal proof, but for security-sensitive code processing untrusted input, proving a few carefully chosen invariants may be considerably cheaper than investigating the consequences of violating them after release.

Validation of count_positive. Safe Rust checks the type, borrow, and index bounds, and leaves the comparison unchecked. Tests execute chosen arrays and miss a zero. Differential testing compares one output with another implementation. Fuzzing catches zero-containing inputs against a positive-count oracle and still misses i32::MIN. Verus rejects >= 0 and checks the corrected > 0 comparison. Integration places the code in its caller. Performance compares successive measurements, then percentiles. Shipping keeps the split between Rust, Verus, tests, and fuzzing.

01VALIDATION PIPELINE

fn count_positive(

*numbers: &\[i32\]* **numbers: &\[i32\]**

borrow **checked**

) *\-> usize* **\-> usize** {

type **checked**

let mut count = 0;

*for i in 0..numbers.len()* **for i in 0..numbers.len()** {

bounds **checked**

if *numbers\[i\]* **numbers\[i\]** *\>= 0* **\>= 0** {

\>= 0 **?**

count += 1;

}

}

count

}

```
#[test]
fn all_positive() {
    assert_eq!(
        count_positive(&[1, 2, 3]),
        3);
}
```

-   \[1, 2, 3\]
-   \[-5, 7\]
-   \[100, -100\]
-   \[-1, 0, 1\] missed

**\=**

```
let expected = numbers.iter()
    .filter(|&&x| x > 0)
    .count();
assert_eq!(
    count_positive(&numbers),
    expected);
```

-   \[1, 2, 3\]
-   \[-5, 7\]
-   \[0\] caught
-   \[100, -100, 0\] caught
-   \[i32::MIN\] missed

fn count_positive(

**numbers: &\[i32\]**

) **\-> usize** {

let mut count = 0;

**for i in 0..numbers.len()** {

if **numbers\[i\]** **\>= 0** **\> 0** {

**?****Σ n > 0 checked**

count += 1;

}

}

count

result = Σ 1\[n > 0\]

}

**checked** shipped

rustverusfuzztestship uaf *checked* *unchecked* *unchecked* *unchecked* *checked* types *checked* *unchecked* *unchecked* *unchecked* *checked* bounds *checked* *checked* *partial* *partial* *checked* overflow *unchecked* *checked* *partial* *partial* *checked* if *unchecked* *checked* *partial* *partial* *checked* loops *unchecked* *checked* *partial* *partial* *checked* algorithm *unchecked* *checked* *partial* *partial* *checked* inputs *unchecked* *partial* *partial* *partial* *checked* integ *unchecked* *partial* *partial* *partial* *checked* perf *unchecked* *unchecked* *unchecked* *checked* *checked*

## Building software for an agentic world

AI makes it easier to produce code, including code that looks plausible but contains subtle mistakes. As code generation accelerates, objective feedback loops become increasingly valuable. Compilers, tests, and fuzzers already provide essential checks, and formal verification adds another layer for properties important enough to specify explicitly.

AI can also help propose specifications, lemmas, and proof steps. [Anthropic’s recent work on AI-assisted formal verification](https://www.anthropic.com/research/formal-verification) is an encouraging example of that broader direction. We see the same opportunity in Rust development, where AI can help with the labor of writing proofs while Verus checks the resulting obligations mechanically. Rather than simply generating a convincing explanation that code is correct, AI must produce something that satisfies a verifier. That is a much stronger foundation for AI-assisted engineering.

Mechanical checking changes what we have to trust, but does not eliminate trust. If the specification and implementation share the same mistaken assumption, a successful proof can still establish the wrong thing. That risk deserves particular attention when AI helps author both. Engineers must review what the contract actually says, compare it against standards and concrete examples, and test independently. AI can accelerate the process, but humans still own the meaning of the guarantee.

AI drafts a Verus model from the specification, and a human reviews it. AI drafts Verus proofs from that model, and a human reviews them. AI drafts code iteration 1. Verus checks that code and feeds the check back to the AI. AI drafts code iteration N, and the chain continues. The human holds the result.

02AGENTS

AI

spec

spec → model ← review

model → verus proofs ← review

write → code iteration 1 ← check

human owns verus

code iteration N

...

## How we wrote the Brotli proofs

For each historical issue, we first isolated the arithmetic or state rule behind the fix. We wrote a small Rust **verification twin** with a Verus contract, ran the historical behavior against that contract, then checked the corrected behavior. This made the experiment manageable without changing the upstream Brotli build or its public API. The examples above show the relevant contracts and representative verifier outcomes.

A **twin** is useful evidence about a *modeled slice* of code, not proof that the production code behaves identically. We still need to establish that the twin faithfully represents the real implementation and that its assumptions match the actual callers. Maintaining that correspondence becomes harder as production code changes. Embedding Verus contracts directly alongside executable Rust, where practical, reduces this particular source of drift. Exploring that integration with the Brotli open-source maintainers is a possible next step.

The lesson for our Rustification playbook is straightforward. Existing bug fixes can reveal valuable invariants worth proving. For new Rust code, we can write those invariants before the bug exists and preserve them as code evolves.

## Taking the next step: building specification and implementation together

Brotli gave us a retrospective experiment. A new decoder offers a chance to develop the implementation and specification together.  When a format is defined by a standard, selected requirements can become explicit contracts rather than remaining only prose in a document.

**Standard requirements → reviewed Verus contracts → Rust implementation → conformance tests, differential tests, and fuzzing**

We are exploring this approach in [microsoft/jpeg2000_rs](https://github.com/microsoft/jpeg2000_rs), an experimental JPEG 2000 decoder written in Rust with Verus contracts attached to the production implementation and based on the relevant ITU-T JPEG 2000 Recommendations. Cargo and Verus use the same executable Rust source; mathematical models and proof-support code accompany it.

That distinction from a verification twin reduces the chance that a separate proof model quietly diverges from the code that ships. It does not settle whether a contract correctly reflects the standard or whether the assumptions made by one stage are guaranteed by the previous stage. For example, proving a transform correct for supplied coefficients does not prove that the parser and entropy decoder produced the right coefficients. Each producer must establish the preconditions on which its consumers rely.

Useful contracts also describe failure behavior, not just successful arithmetic. Consider PLM packet-length parsing: a parser may append a group and update its state before a later tile-part limit check returns an error. A useful contract records both the error result and the state that remains, including whether the appended group is preserved. A proof concerned only with the success path would miss that obligation.

A JPEG file opens into hex. The PLM header starts with marker FF 57. 00 08 is the segment length, 01 is index 1, and 05 is packet length 5. Parser states show the earlier PLM creating tile-part 0, then this header appending tile-part 1. On success the contract ensures length equals 5 and at most one tile-part. The runtime limit rejects two tile-parts and returns an error. The contract records that error and keeps the appended tile-part.

03Verus captures arithmetic and behavioral failures [adce72e7](https://github.com/microsoft/jpeg2000_rs/blob/adce72e7b02d2a2c7ef414bc48f89006bfdb25d1/src/codestream/packet_headers.rs#L535)

**JPEG**

```
FF 4F   FF 51   00 2F
FF 57  00 08  01  00 00 00 01  05
FF 90   00 0A   ···
```

**JPEG**

*FF 57* PLM `00 08` `01` `00 00 00 01` `05`

1.  `00 08` *→* segment length 8
2.  `01` *→* index 1
3.  `00 00 00 01` *→* 1 byte follows
4.  `05` *→* packet length 5

Parser states

`index 0` *→* **tile-part 0** earlier PLM

`index 1` *→* **tile-part 1 · 5** *stays*

Verus contract

ensures **ok ⇒ length == 5 && count ≤ 1**  
ensures **err ⇒ error, tile-part 1 stays**

Is arithmetic correct?**length == 5** *passed* *OK*

runtime limit **2 > 1** ~~returns error~~ ~~Caught here!!!~~

Our work therefore separates three complementary responsibilities. **Implementation-to-model verification** uses Verus to check that the executable Rust code satisfies its formal contracts under the stated assumptions. **Model-to-standard review** examines whether those contracts faithfully capture the relevant JPEG 2000 requirements. **Independent runtime validation** exercises the decoder through standards-based conformance suites, differential tests against other implementations, fuzzing, integration tests, performance work, and security review. Each provides evidence the others cannot replace.

A successful Verus proof establishes behavior *relative to the stated specification and assumptions*. It does not, by itself, establish that the specification correctly reflects the standard or that locally verified stages compose into a correct decoder. Our JPEG 2000 work currently does not claim a complete public bytes-to-image proof, completed independent standards review, or official conformance.

This gives us two practical entry points. We can retrofit narrowly scoped proofs around known failure patterns in existing Rust libraries, or develop new Rust components with contracts from the start. In both cases, the aim is to prevent more bugs earlier without overstating what has been proved.

## Where we go from here

We are excited by the possibility of making proof obligations a normal part of security-sensitive Rust development. Our immediate direction is to keep experimenting with targeted proofs for existing codecs and to grow the Rust-and-Verus approach in JPEG 2000. Candidates such as other image decoders and parsers are worth exploring.

We also want to share more of what we learn: how we choose properties, how we use AI without outsourcing specification judgment, and where verification proves useful or frustrating in real engineering work. If you maintain a Rust library that handles untrusted input, consider starting with one bug-prone invariant and seeing whether a checked contract would help. The [Verus project](https://github.com/verus-lang/verus) and our [JPEG 2000 experiment](https://github.com/microsoft/jpeg2000_rs) are useful places to follow along.

Security work will always include finding and fixing bugs. With Rust and Verus, we have another opportunity: to make some of those bugs impossible under clearly stated, mechanically checked assumptions before they reach users.
