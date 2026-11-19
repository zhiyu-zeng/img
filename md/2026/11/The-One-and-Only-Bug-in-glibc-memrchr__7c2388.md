---
title: The One and Only Bug in glibc memrchr?
source: https://www.zellic.io/blog/x86-formal-verification-memrchr
source_host: www.zellic.io
clip_date: 2026-11-20T03:34:02+08:00
trace_id: bdc4149a-aa28-49cb-b3da-d3c9a3274be6
content_hash: 5f11eaf0cfd8cf39e84d751432407c0a787695aaa63a3b90f72e4603bcf66c5c
status: synced
tags: []
series: null
feed_source: Zellic·漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 41d75244-d011-8145-9cef-c3ae21673a63
ioc: null
---

This is the second article on our [ongoing research project↗](https://www.zellic.io/blog/x86-formal-verification-intro/) to demonstrate viable, scalable formal verification for x86 binaries. In it, we explain how we (tried to) formally verify the glibc `memrchr` variants, the bugs that prevented proving the intended statement [1](#fn:1), as well as how we formally verified that those bugs are the *only* bugs [2](#fn:2).

While formal verification is similar to methods like code review, testing, and fuzzing in that all of them ultimately aim at securing the software they target, they also have significant differences: Techniques like code review and testing attempt to *find* bugs, while formal verification attempts to *prove that there are no bugs*. Where formal verification efforts find bugs, this is a side effect of having failed at the actual task, proving the expected behavior, due to a defect in the original code making that statement false. In this light, we believe that the bug in `__memrchr_avx2` is of particular interest. It was found when the last failing proof obligations pointed straight at the edge case in which the code behaves incorrectly.

We release the proofs and statements with our [repository of x86 FV research results↗](https://github.com/Zellic/x86-formal-verification-research). This work is a research preview, and the execution model has not been audited yet — see below for limitations.

## CPU-dependent variants of memrchr in glibc

The glibc library does not just come with a single `memrchr` implementation, but multiple implementations, hand-optimized in assembly for various processor features. Which implementation is used is typically chosen by glibc on start-up depending on which extensions the processor supports, as illustrated in the following graphic:

![A diagram showing memrchr selection in glibc, depending on features supported by the processor. The \_\_memrchr\_sse2 variant is correct, while the other variants have a bug.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c38c5abd82b6c478.svg)

In this article, we are describing the situation present in the glibc library installed on our Ubuntu-based development server, `2.43-2ubuntu2.4`. However, most of the code discussed here has changed little in recent versions.

As the graphic indicates, the `__memrchr_sse2` variant could be proven to satisfy the contract below [3](#fn:3). We publish the proof for this. To verify it, see [our repository↗](https://github.com/Zellic/x86-formal-verification-research).

However, `__memrchr_evex` as well as the code underlying both `__memrchr_avx2` and `__memrchr_avx2_rtm` behaves incorrectly, each in an unlikely edge case, as we will explain below.

We publish proofs that these variants satisfy the contract outside of the indicated cases (buffer length n ≥ 2 32 n \\geq 2^{32} and start address s < 32 s < 32 for EVEX and AVX2, respectively) in which the bug can appear, as well as proofs that fixed variants of `__memrchr_evex` and `__memrchr_avx2` satisfy the contract without those carve-outs.

## What memrchr does

The `memrchr` function is provided by glibc to search for a single byte in a buffer, returning a pointer to the *last* occurrence in the buffer, if one was found, or the null pointer otherwise.

The [`memrchr` man page↗](https://manpages.ubuntu.com/manpages/resolute/man3/memchr.3.html) describes it as such (see also the [glibc documentation↗](https://sourceware.org/glibc/manual/2.43/html_node/Search-Functions.html)):

> **DESCRIPTION**
> 
> The **memchr** () function scans the initial *n* bytes of the memory area pointed to by *s* for the first instance of *c*. Both *c* and the bytes of the memory area pointed to by *s* are interpreted as *unsigned char*.
> 
> The **memrchr** () function is like the **memchr** () function, except that it searches backward from the end of the *n* bytes pointed to by *s* instead of forward from the beginning.
> 
> \[…\]
> 
> **RETURN VALUE**
> 
> The **memchr** () and **memrchr** () functions return a pointer to the matching byte or NULL if the character does not occur in the given memory area.

The arguments are passed in registers: `rdi` for `s`, `esi` for `c`, and `rdx` for `n`. The return value is passed in `rax`.

## The formal statement

To formalize this statement, we should start by describing what the return value should be, relative to the state at call entry. This is accomplished by the following:

```lean
def lastIndex (bs : List Byte) (c : Byte) : Option Nat :=
  (bs.reverse.findIdx? (· == c)).map (bs.length - 1 - ·)

/-- `memrchr`'s result for a call from `s`: the address of
the last byte equal to `c` (the low byte of `rsi`) among the
`n` bytes at `s`, or null. -/
def memrchrResult (s : State) : Addr :=
  match lastIndex
      (readBytes s.proc.mm.mem s.cpu.gpr.rdi
        s.cpu.gpr.rdx.toNat)
      (s.cpu.gpr.rsi.setWidth 8) with
  | some i => s.cpu.gpr.rdi + BitVec.ofNat 64 i
  | none => 0
```

The helper definition `lastIndex` does what its name suggests: Given a list of bytes and a byte, it returns `none` if the byte does not occur in the list, and otherwise `some i`, where `i` is the index of the last occurrence of the byte in the list.

The function `memrchrResult` then uses this to compute the correct result of `memrchr` from a `State`. The `readBytes` application reads `rdx = n` many bytes starting from address `rdi = s` from memory, returning a list of bytes. The `setWidth 8` on `rsi`, whose lower 4 bytes are `c`, extracts the lowest byte, matching “Both *c* and the bytes of the memory area pointed to by *s* are interpreted as *unsigned char*.” from the man page. Overall, the function thus returns `0` if the buffer of length `n` at `s` does not contain the lower byte of `c`, and the address of the last occurrence otherwise.

The contract for the function can now package this:

```lean
def memrchrObject (s : State) : Rgn :=
  ⟨s.cpu.gpr.rdi, s.cpu.gpr.rdx.toNat⟩

def memrchrWith
    (pre : State → Prop := fun _ => True)
    (alsoReads : State → List Rgn := fun _ => []) :
    Contract where
  conv := sysv
  reads s := [memrchrObject s]
  stack := fun _ => 0
  writes _ := []
  probes := alsoReads
  pre := pre
  post s X := X.cpu.gpr.rax = memrchrResult s
  events _ _ evs := evs = []

/-- `memrchr`'s contract, for every call, reading nothing
besides the object. -/
abbrev memrchr : Contract := memrchrWith
```

Here `memrchr` is a contract for a function satisfying the sysv calling convention, that has a stack frame of size zero (not counting the return address), requires as an assumption that the buffer of length `n` at `s` is fully readable, and guarantees on return that the new state `X` has the return value (`rax`) set to `memrchrResult` of the state at entry, while having performed no memory writes outside of its stack frame, and caused no syscalls. The more general `memrchrWith` takes arguments `pre`, an assumption made of the call (weakening what the contract says, as conclusions then only need to hold under that assumption), and `alsoReads`, adding further regions that must be readable on function entry. When proving such a contract for a function, further assumptions are usually made relating to the call being a well-formed one: For example the regions declared as read by the function need to be valid, which includes that they may not wrap modulo 2 64 2^{64}.

One thing we would like to emphasize is that this contract is easier to understand (taking the generic vocabulary and execution model formalization as given) than the actual implementations of `memrchr` in glibc ([EVEX↗](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/x86_64/multiarch/memrchr-evex.S;hb=glibc-2.43), [AVX2↗](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/x86_64/multiarch/memrchr-avx2.S;hb=glibc-2.43), [SSE2↗](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/x86_64/multiarch/memrchr-sse2.S;hb=glibc-2.43)).

## What the implementations have in common

A simple implementation of `memrchr` would in a single loop inspect the buffer byte by byte, comparing to `c`. The implementations in glibc are made to be more efficient however: the starting point is that they use vector instructions to load and compare 16 or 32 bytes at a time, together with various other optimizations. Loading and comparing in windows causes various issues that need to be solved that don’t arise in a byte-by-byte algorithm:

1.  At the edges of the buffer, bytes from outside the buffer might be read, and they might contain `c`.
2.  At the edges of the buffer, should the implementation do unaligned reads, bytes from outside the buffer could be read that are in another page that is not mapped, causing a fault.
3.  When finding out that one of the characters in a window is `c`, one still has to extract which one it was within the window, and compute the correct pointer from this and the window address.

Both bugs have to do with edge cases related to the above points. Neither bug is likely to occur by accident.

## The \__memrchr_evex function for very large buffers in certain alignments

As we already discussed in our [previous article↗](https://www.zellic.io/blog/x86-formal-verification-intro/), a central goal of this research effort is to create scalable, reusable proof machinery. To test the machinery on, and extend it to, newly added support of various vector instructions, the `__memchr_evex` and `__strlen_evex` functions from glibc were proven as a first test, on the 5th and 6th of October. As expected, in the course of producing this proof, substantial additions and changes were made to proof machinery, in order to support this kind of code. Note that this is `memchr` (searching from left), rather than `memrchr` (searching from right, the function under discussion in this article).

To validate the new machinery as being generic and being applicable to other string functions with similar vector instructions, the next day a Claude Opus 5.5 agent was instructed to work on the task to prove another, similar, string function using this new machinery, concretely `__memrchr_evex`. While reading the source code for this implementation of `memrchr`, in preparation to proving its statement, it found the following bug, confirmed it with a test, and later filed it in an internal triage queue.

The following graphic illustrates the [`__memrchr_evex` ↗](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/x86_64/multiarch/memrchr-evex.S;hb=glibc-2.43) function’s control flow, marking the path to the bug [4](#fn:4).

![A diagram showing the complex control flow of the function.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/18abed25e1ea3efc.svg)

The following graphic focuses on the code relevant for the bug:

![A diagram showing only the control flow leading to the bug, as well as one side branch, with annotations.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6fbde896f80f5e95.svg)

The first code block checks whether `n`, the length of the buffer, is zero. We take the branch in which it is not. The second block then checks whether `a`, which is the address of the last byte of the buffer, taken modulo 4096, the page size, is smaller than 32. The relevance of this condition is the difficulty with number 2 above: an unaligned read that ends with the last byte of the buffer might cross into the previous page, which might be unmapped. Hence, an aligned read needs to be done instead, in the `L(page_cross)` branch.

That block, the largest, uses an aligned compare of 32 bytes, including potentially bytes after the buffer, which are dealt with by shifting out the result bits for those trailing bytes. There is then another branching, depending on whether the full buffer lies fully within that 32-byte window or not. In the branch taken in our case, this is not the case, i.e. the buffer extends past the page cross into the previous page.

![A graphic illustrating what the L(page\_cross) block does](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1b3be98322e5f8f4.svg)

When reaching `L(page_cross_check)`, the relevant registers are as follows:

-   `esi` contains at the `j` -th most significant bit (starting to count from `0` for the MSB) a `1` if and only if `j ≤ a` and `*(s + n - 1 - j) = c`.
-   `rdx` holds `n`.
-   `rdi` holds `s`.

The `test` and `jz` check whether `c` was actually found. In our case we assume it was.

For understanding the following instructions, the following behavior is important, quoting from the Intel SDM, Vol. 1, §3.4.1.1:

> 32-bit operands generate a 32-bit result, zero-extended to a 64-bit result in the destination general-purpose register.

The `lzcnt` is a 32-bit instruction as `%VRSI` expands to `%esi`, so it counts the leading zeros of `esi`, meaning it computes the smallest `j` so that `*(s + n - 1 - j) = c`. That value `j` is written to `esi`, and hence `rsi`, due to zero-extension. In other words, `c` was found at index i \= (n − 1) − r s i i = (n-1) - \\mathtt{rsi}.

The `subl` is then again a 32-bit instruction, computing `edx' = edx - esi`, and zero-extending. The value after will thus be:

𝚛 𝚍 𝚡 ′ \= (𝚛 𝚍 𝚡 − 𝚛 𝚜 𝚒) mod 2 32 \= (n − 𝚛 𝚜 𝚒) mod 2 32 \= (i + 1) mod 2 32.

In the following block, at `L(page_cross_ret)`, the `leaq` then computes the pointer that is returned:

𝚛 𝚊 𝚡 \= 𝚛 𝚍 𝚒 + 𝚛 𝚍 𝚡 − 1 \= s + ((i + 1) mod 2 32) − 1.

It should be s + i s + i.

The bug here is in `subl %esi, %edx` being a 32-bit instruction, thereby taking the value modulo 2 32 2^{32}. Instead, the 64-bit subtraction is required: `subq %rsi, %rdx`. We publish a proof that the function with that modification satisfies the `memrchr` contract.

In practice, this bug can cause incorrect pointers to be returned, including the pointer s − 1 s - 1 that does not even lie in the buffer itself. Take for example the case in which s \= k ⋅ 2 12 + 1 s = k \\cdot 2^{12} + 1, n \= 2 32 n = 2^{32}, and the last character in the buffer is `c`. Then the function will take the branches discussed above, and return

s + (((n − 1) + 1) mod 2 32) − 1 \= s + (2 32 mod 2 32) − 1 \= s − 1.

The following graphic shows the effect of the subtraction and `leaq`, in the example just made:

![Graphic showing the result of subl and subq in the example just mentioned.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/179e46b501dab3c2.svg)

We reported this bug to glibc as [bug BZ #34771↗](https://sourceware.org/bugzilla/show_bug.cgi?id=34771) on October 21. It was fixed in glibc’s `master` branch by Noah Goldstein with [commit 205ccf0d55↗](https://sourceware.org/git/?p=glibc.git;a=commitdiff;h=205ccf0d5548d4da3e57654c4e09d7b13e6e81a2).

## The \__memrchr_avx2 function for buffers starting at s < 32

The interesting story about this bug is how it was found. As some steps of that story make more sense after already having read a description of the bug, we present the bug itself first.

The following graphic illustrates the [`__memrchr_avx2` ↗](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/x86_64/multiarch/memrchr-avx2.S;hb=glibc-2.43) function’s control flow, marking the path to the bug.

![A diagram showing the complex control flow of the function.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e8e948ecca01d452.svg)

In contrast to the EVEX variant, here there are three locations with the same bug. We will focus the discussion on one of the paths only, in the concrete example in which `s = 5` and `n = 140 = 0x8c`, and the character is not found in the buffer, and also not in the five bytes below `s`. The following graphic focuses on the code relevant for this case:

![A diagram showing only the control flow leading to one instance of the bug.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/81a0944c45cf7178.svg)

Roughly, the idea here is that the first 32-byte window is an *unaligned* one, covering address `0x71` to `0x90` (read in the third block), while further compares use aligned reads (fifth, seventh, eighth, and finally the eleventh block, which has the bug). The following graphic shows the ranges for the compares in this example:

![A diagram showing the first unaligned, and the following four aligned 32-byte-wide compares.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/af4f0f74777be0f2.svg)

The value of `rax` is first set to the address of the last byte of the buffer ([line 53↗](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/x86_64/multiarch/memrchr-avx2.S;hb=glibc-2.43#l53), second block), and then to the last byte of the first aligned read (lines [97↗](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/x86_64/multiarch/memrchr-avx2.S;hb=glibc-2.43#l97) and [104↗](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/x86_64/multiarch/memrchr-avx2.S;hb=glibc-2.43#l104), fifth block). In the second-to-last code block, `rax` then still holds the address of the last byte in the first aligned window. In our case, `rax = 0x7f`. [Lines 182 to 184↗](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/x86_64/multiarch/memrchr-avx2.S;hb=glibc-2.43#l182) then compare the aligned buffer of bytes with address `0` to `0x1f` to the character `c` we are looking for, and extract the index of the last occurrence of `c` in the window into `ecx`, counting from the back. If the character was not found, the value of `ecx` will be `32`. Then, in [line 185↗](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/x86_64/multiarch/memrchr-avx2.S;hb=glibc-2.43#l185), `rax` first gets updated by subtracting `0x60`, to make it point to the last byte of the aligned 32-byte window containing `s`, and then in [line 187↗](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/x86_64/multiarch/memrchr-avx2.S;hb=glibc-2.43#l187) by subtracting `rcx`. If the character was found in the window, the value of `rax` should now thus be the address of the last occurrence in the window. Otherwise, if the character was not found, `rax` will be one below the lowest byte of this window.

The idea in the general case is then to check whether that value of `rax` is below `s` or not: If it is, `c` was not found in the buffer, covering both the case that it was found in the window, just below `s`, as well as the case in which the full window didn’t have `c` at all.

However, when this window begins at address `0` (which does not require `s` pointing to address zero, just at an address smaller than `32`), then the second subtraction performed on `rax` will wrap around, to `0xffffffffffffffff`. The comparison will then show this value being greater than or equal to `s`, leading to the branch that uses `rax` as the result, the address at which `c` was found in the buffer. This result is however incorrect in this case, and the returned pointer does not point inside the buffer.

We reported this bug together with similar low-address bugs [5](#fn:5) to glibc as [bug BZ #34944↗](https://sourceware.org/bugzilla/show_bug.cgi?id=34944).

## How the \__memrchr_avx2 bug was found from a failing proof obligation

In preparation for a possible blog post on the `__memrchr_evex` bug, the author asked Claude Opus 5.5 for the other glibc `memrchr` variants to be formally verified on November 2nd. The expectation was that there would be no further bugs, so that the EVEX variant bug would be the “one and only bug” in glibc `memrchr`. Instead, another bug was found. However, in contrast to the one above, this bug, in the AVX2 variant, was not found by reading the code, but by failing to close all the proof obligations. Analyzing the last remaining ones then pointed at the bug. The following graphic shows the timeline surrounding this find:

![A diagram showing multiple proof runs that gradually reduce the number of failing proof obligations, leaving four remaining by round 7, followed by replaying the failing obligation, dumping the open goal, and generating a counterexample region, only after which the source code is grepped for the relevant spots and the bug discovery is announced.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/29280968c05e275e.svg)

Before starting on the actual proof, Claude wrote a test, finding nothing unusual in `__memrchr_avx2`:

```
sse2: 0 wrong of 1167156
avx2: 0 wrong of 1167156
avx2(again; rtm needs RTM): 0 wrong of 1167156
evex: 116 wrong of 1167156
```

It then proceeded to use our machinery to try to prove `__memrchr_avx2` correct. The usual workflow loop is to run the machinery, inspect the failures, adjust e.g. the loop invariant statement, supply additional facts or proof hooks, or sometimes even fix the machinery, then perform another run. Usually the number of remaining obligations at first rises (the machinery gets through more of the code, thereby showing finer-grained failures), then goes down each run as obligations are discharged. After seven rounds of this, there were four obligations left:

```
-- Avx2
      4 ObSite.post failed
leanrun: 157.11 s, peak RSS 3835944 KB, exit 1
```

Claude then proceeded to dump one of the failed obligations from a replay of that run. That dump is nearly 1700 lines long and not very readable. Its hypothesis part begins like this:

```lean
hyps:
  h0 : g.toNat % 32 = 31 ∧
  s₀.cpu.gpr.rdi.toNat + 96 < g.toNat + 1 ∧
    g.toNat + 1 ≤ s₀.cpu.gpr.rdi.toNat + 128 ∧
      g.toNat <
          s₀.cpu.gpr.rdi.toNat + s₀.cpu.gpr.rdx.toNat ∧
        s₀.cpu.gpr.rdi.toNat +
              Glibc243Ubuntu.MemrchrScan.lastC
                s₀.proc.mm.mem s₀.cpu.gpr.rdi
                s₀.cpu.gpr.rdx.toNat s₀.cpu.gpr.rsi +
            96 ≤
          g.toNat + 1
  hc : ¬(!(ZellicX86.borrowSub
      (BitVec.setWidth 64
        (ZellicX86.Addr.add s₀.cpu.gpr.rdi 0))
      (BitVec.setWidth 64
        (BitVec.setWidth 64
          (BitVec.setWidth 64
                (BitVec.setWidth 64
                  (BitVec.setWidth 64 g - 96#64 -
                    BitVec.setWidth 64
                      (BitVec.ofBool false))) -
              BitVec.setWidth 64
                (BitVec.setWidth 64
                  (BitVec.ofNat 32
                    (if false = true then
                      ZellicX86.lowestSetBit
                        (BitVec.setWidth 32
                          (BitVec.setWidth 64
                            (ZellicX86.ofBits 32 fun j =>
```

What `g` can be interpreted as is the last byte of an aligned window, what in our description of the bug above was the value of `rax` at the start of the second-to-last code block, `0x7f` in that example. The hypothesis `h0` can be roughly read as follows, and suggests what branch of the function this may be about:

1.  `g` is the last byte of an aligned 32-byte window.
2.  `rdi`, i.e. `s`, is within the four 32-byte windows that end in `g` (as two conditions, bounding `g + 1` on both sides with respect to `rdi`: the first involving `96` means that 3 windows don’t suffice, the second involving `128` means that 4 are enough).
3.  `g` lies in the buffer (i.e. `g < s + n`).
4.  If `c` occurs in the buffer, then the last match within the buffer lies in the 32-byte window in which `s` lies (concretely the condition says that `s` + the last occurrence of `c` index in the buffer + 1 + `96` must be smaller or equal to `g + 1`).

Claude then proceeded to dump the actual goal that failed at this spot. The file this is contained in is 121 lines long, but these (the last lines) are the important ones:

```lean
h : ¬0 < lastAt s₀✝.proc.mm.mem s₀✝.cpu.gpr.rdi
    s₀✝.cpu.gpr.rdx.toNat fun x =>
      x == BitVec.setWidth 8 s₀✝.cpu.gpr.rsi
⊢ (g✝ - 96#64 -
      BitVec.setWidth 64
        (BitVec.ofNat 32
          (32 -
            topBit
              (eqMask (BitVec.setWidth 8 s₀✝.cpu.gpr.rsi)
                (ofBytesLE 256
                  (pageRead s₀✝.proc.mm.mem g0
                    { base := Addr.add s₀✝.cpu.gpr.rdi 0,
                      len := s₀✝.cpu.gpr.rdx.toNat }
                    (g✝ + 0 * 1#64 +
                      18446744073709551489#64)
                    32)))))).toNat =
  0
```

In the first line, `lastAt` returns the index at which `c` was found in the buffer, plus one, with a character that wasn’t found returning zero. The hypothesis `h` thus means that the character is not found in the buffer. The conclusion that is supposed to follow from this requires an equality that can be summarized as: The return value must be zero. What is written on the left-hand side is not the return value, but its computation starting from what `rax` is at the start of the second-to-last block, following how we described the bug above: first `0x60 = 96` is subtracted, then a number of leading zeros of a mask is subtracted. So what failed was proving that the return value is the correct value, the null pointer, in a situation in which the character is not found in the buffer.

Claude then proceeded to hand the situation to the `omega` tactic in abstracted form (not anymore referring to a state of the process, but only involving arithmetic). Instead of proving the conclusion from the hypotheses, `omega` produced constraints for a possible [6](#fn:6) counterexample [7](#fn:7):

```bash
=== line 1672, 2026-11-02 17:12:48 UTC, model,
    tool call Bash
cd /home/coder/x86project/workers/claude5/\
zellic-lean-x86-glibc/glibc-2.43-ubuntu-26.04-amd64
cat > Glibc243Ubuntu/MemrchrReplayScratch2.lean <<'EOF'
example (g s n L top r a sr: Nat)
    (h1 : g % 32 = 31) (h2 : s + 96 < g+1)
    (h3 : g+1 ≤ s+128) (h4 : g < s+n)
    (h5 : s + L + 96 ≤ g+1)
    (hs : s < 2^64) (hg: g < 2^64) (htop : top ≤ 32)
    (hr : r =
      (2^64 - (32 - top) + g + 18446744073709551520) % 2^64)
    (ha : a = g + 0 + 0 - 127)
    (hsr : sr = (2^64 - r + s) % 2^64) (hc : s < r ∨ sr = 0)
    (hf : (a < s+L ∧ s < s+L ∧ a + top = s+L) ∨
      (s+L ≤ a ∧ top = 0) ∨
      (L = 0 ∧ a < s ∧ a + top ≤ s))
    (hL : ¬ 0 < L) :
    r = 0 := by omega
EOF
timeout 300 ../../zellic-lean-x86-notes/tools/leanrun \
  -M 3000 -t 200 Glibc243Ubuntu/MemrchrReplayScratch2.lean \
  2>&1 | head -30

=== line 1673, 2026-11-02 17:12:48 UTC, tool result
/home/coder/x86project/workers/claude5/
  zellic-lean-x86-glibc/glibc-2.43-ubuntu-26.04-amd64/
  Glibc243Ubuntu/MemrchrReplayScratch2.lean:1:455: error:
  omega could not prove the goal:
a possible counterexample may satisfy the constraints
  d ≤ 0
  c ≥ 0
  c ≥ 128
  3 ≤ b ≤ 576460752303423487
  b ≥ 3
  -576460752303423484 ≤ b - 576460752303423488*d ≤ 3
  3 ≤ b ≤ 576460752303423490
where
 b := ↑g / 32
 c := ↑n
 d := ↑(2 ^ 64 - r + s) / 18446744073709551616
Command exited with non-zero status 1
leanrun: 0.35 s, peak RSS 466428 KB, exit 1
memgrant: leanrun Glibc243Ubuntu/MemrchrReplayScratch2.lean:
  grant 3256 MB, booked 2048 MB by kind,
  peak anonymous 46 MB, 0.4 s
```

In the abstracted form Claude wrote, `L` is the `lastAt` result from before, and `r` the value on the left-hand side of the goal.

Looking at the printout, the natural number `d` must be zero. Hence `b ≤ 3` by the second-to-last line before `where`. As also `b ≥ 3`, that means `b = 3` in the counterexample. But then, in the first line after the `where`, this connects to `g`: We must have that `3 = g / 32`, which implies `0x60 ≤ g ≤ 0x7f`. Given that `g % 32 = 31` (by `h1`), this means we are in an example where `g = 0x7f`. Now `g` is standing in for the top byte of a 32-byte window being read from the buffer, where `s` lies three windows below, which is what `h2 : s + 96 < g+1` encodes. From `g = 0x7f` it then follows we are analyzing a possible counterexample in which `s < 0x20 = 32`.

This counterexample produced by `omega` thus points us straight at considering the bug path of `__memrchr_avx2`, for a case in which `s < 32`, where `c` is not found in the buffer, and where `n` is in a particular range. Computing what `r` is in that case either symbolically, or by testing shows the bug occurring [8](#fn:8).

After reading this counterexample by `omega`, Claude grepped the [`memrchr-avx2.S` source code file↗](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/x86_64/multiarch/memrchr-avx2.S;hb=glibc-2.43) for the relevant instructions and then mentioned in a reasoning summary:

> Found that `__memrchr_avx2` / `_rtm` can wrap its subtraction and return 0xFFFFFFFFFFFFFFFF instead of null when examining a vector starting at address 0 (only possible with page 0 mapped, so unreproducible locally, but Lean’s `omega` found the counterexample). I’m adding a `32 ≤ s` carve-out for the AVX2 variants and checking whether it closes the remaining four obligations.

As we were interested to see whether Claude Opus 5.5 could have found the bug directly as well, we gave it the file, told it that there was a bug in it, and asked it to find the bug. While only weak anecdotal evidence, in all three attempts, Claude failed to find the bug on the first response, but managed to identify it after further user rounds [9](#fn:9).

We think that the `__memrchr_avx2` bug is particularly interesting as a bug found by the gap left in what could be proven, rather than by looking for bugs themselves. While in this case, it may have been possible to find the bug in the traditional manner, this gives us a glimpse of a future, where formal verification may enable us to either prove a system free of bugs, or help us find bugs that may be beyond our reach to identify otherwise.

## The proofs we are releasing today

While we presented bugs that we found in glibc above, formal verification is ultimately not about finding bugs, but about showing that there are no bugs. When searching for bugs by testing or reading the code (whether by human developers or auditors, or AIs), one cannot rule out that the bugs found so far were *all* the bugs. However, formal verification can tackle this question. So concretely we can ask: In the glibc version we are considering (`glibc-2.43-ubuntu-26.04-amd64`), if we rule out buffers of size 2 32 2^{32} or larger in the EVEX case, and buffers starting at an address smaller than `32` in the AVX2 case, for all remaining cases, is glibc `memrchr` bug-free? We can answer this question in the affirmative, granted the caveats listed below in the limitations section.

Concretely, with `memrchrWith` and `memrchr` as described above, we release proofs of the following statements:

```lean
def evexHolds : Prop :=
  FnHolds (Ar.member LibcA.blob "memrchr-evex.o")
    "__memrchr_evex" evexNeeds
    (C.memrchrWith (pre := evexOk))

def avx2Holds : Prop :=
  FnHolds (Ar.member LibcA.blob "memrchr-avx2.o")
    "__memrchr_avx2" avx2Needs
    (C.memrchrWith (pre := avx2Ok))

def avx2RtmHolds : Prop :=
  FnHolds (Ar.member LibcA.blob "memrchr-avx2-rtm.o")
    "__memrchr_avx2_rtm" avx2RtmNeeds
    (C.memrchrWith (pre := avx2Ok))

def sse2Holds : Prop :=
  FnHolds (Ar.member LibcA.blob "memrchr-sse2.o")
    "__memrchr_sse2" (fun _ => True)
    (C.memrchrWith (alsoReads := sse2Reads))
```

These say that the `evex`, `avx2`, `avx2_rtm`, and `sse2` implementations of `memrchr` in glibc satisfy the `memrchrWith` contract, with some assumptions:

Each of the variants has some needs relating to the processor, as these variants only run on processors that have certain extensions:

```lean
def evexNeeds (f : Features) : Prop :=
  f.avx512f = true ∧ f.avx512vl = true ∧ f.avx512bw = true ∧
    f.lzcnt = true ∧ f.bmi2 = true

def avx2Needs (f : Features) : Prop :=
  f.avx = true ∧ f.avx2 = true ∧ f.lzcnt = true ∧
    f.bmi2 = true

def avx2RtmNeeds (f : Features) : Prop :=
  avx2Needs f ∧ f.rtm = true
```

Furthermore, for `evex`, `avx2`, and `avx2_rtm`, we need to make assumptions that rule out the conditions of the bugs:

```lean
abbrev evexOk (s : State) : Prop :=
  s.cpu.gpr.rdx.toNat < 2 ^ 32

abbrev avx2Ok (s : State) : Prop :=
  32 ≤ s.cpu.gpr.rdi.toNat
```

For `evex` this says that the argument `n`, the buffer length, is smaller than 4 GiB. For `avx2` it says that the buffer does not start in the first 32 bytes of the memory address space.

Finally, one special thing about the `sse2` variant is that it can sometimes read memory even if the length of the buffer is given as zero, so these additional regions that need to be readable are specified for it:

```lean
def before16 (s : State) : Rgn := ⟨s.cpu.gpr.rdi - 16, 16⟩

def sse2Reads (s : State) : List Rgn :=
  if s.cpu.gpr.rdx.toNat = 0 ∧
      16 ≤ s.cpu.gpr.rdi.toNat % 4096 then
    [before16 s]
  else []
```

On top of these proofs about the existing implementations in glibc 2.43, we also release proofs that fixes for the identified bugs indeed fix the `evex` and `avx2` variants [10](#fn:10), by proving that patched variants satisfy the `memrchr` contract without the `evexOk` and `avx2Ok` carve-outs needing to be assumed:

```lean
def evexFixedHolds : Prop :=
  FnHolds MemrchrEvexFixedO.blob "__memrchr_evex" evexNeeds
    C.memrchr

def avx2FixedHolds : Prop :=
  FnHolds MemrchrAvx2FixedO.blob "__memrchr_avx2" avx2Needs
    C.memrchr
```

## Limitations

This work is still a research preview, and the same limitations as in our [earlier article↗](https://www.zellic.io/blog/x86-formal-verification-intro/) apply. In particular, all statements for which we release proofs are based on our execution model for x86 binaries under Linux as well as the statement vocabulary on top of it, and none of it has been audited by a human auditor so far. It is thus possible that the statements do not describe what we intend for them to describe. Furthermore, as described in that article as well, we still need to trust the Lean checker, the hardware we ran the Lean checker on, and so on. So the proofs we release today should not be taken to 100% rule out any further bugs in glibc’s `memrchr` — they should increase our confidence however, as remaining doubt now concentrates on the statements not saying what we think they say, the checker having a bug, and so on.

## Conclusion

Formal verification allows proving binaries or functions in them bug-free with respect to a specification. When software *does* have bugs, formal verification may often allow proving large parts of it correct, leaving only very specific parts unproven, such as particular edge cases for the arguments of a function. While failing to prove the remaining cases could be merely an inability to prove something that is in fact correct, this narrows significantly where looking for bugs is indicated.

In some cases, the “gap” in what could be proven correct may point very directly at a potential bug, as in the case of `__memrchr_avx2`. Unlike techniques such as testing, fuzzing, or code review, which can be used to find bugs, but not to prove that there is not some additional so far unfound bug that may be findable with more advanced techniques [11](#fn:11), formal verification goes beyond this, making it possible to prove that no further bugs are left, no matter the bug-finding abilities of adversaries.

1.  The bugs are all only reachable in extreme edge cases and thus unlikely to be a problem in practice. [↩](#fnref:1 "return to article")
    
2.  During our work so far, we found multiple glibc functions with bugs that prevented proving that they satisfy the expected behavior. In this article we focus on `memrchr` as an illustrative example, as the author believes it to be the most interesting case study. [↩](#fnref:2 "return to article")
    
3.  The `__memrchr_sse2` variant needs an assumption that deviates from the default contract shown later. In some cases, the function needs the page in which `s` lies to be readable even if the buffer length is zero, which the default contract otherwise would not require. This is not a bug however, but an assumption the function may make. [↩](#fnref:3 "return to article")
    
4.  While the text of this article was fully written by the human author, this graphic, as well as the other graphics, were created by Claude Opus 5.5. While the human author is not aware of any inaccuracy in the graphics, he did not verify every detail in them. [↩](#fnref:4 "return to article")
    
5.  These bugs are thus only triggerable in situations in which page 0 is mapped, or can be mapped, which is not the case for unprivileged users in default configurations. [↩](#fnref:5 "return to article")
    
6.  Possible counterexamples found by `omega` can be false positives, as `omega` may have merely failed to prove the claim due to non-integer solutions, relevant nonlinear terms, and other reasons. [↩](#fnref:6 "return to article")
    
7.  Transcript below reformatted to break up long lines. [↩](#fnref:7 "return to article")
    
8.  Testing this bug inside Claude’s sandbox wasn’t easily possible for Claude, as at that time, qemu was not installed, and the default permissions in its sandbox would not allow mapping page 0. [↩](#fnref:8 "return to article")
    
9.  The human author asked another Claude instance with access to the transcripts to summarize the outcome:[↩](#fnref:9 "return to article")
    
    > Assessment by Claude (Opus 5.5), from reading the session transcripts: In three separate sessions, Claude Opus 5.5 was given only memrchr-avx2.S, the sole file in its working directory, and told the file contained a bug. Two of the prompts added that formal verification had found it. Each session read the code, assembled it, and tested it with fuzzing and exhaustive sweeps against a byte-by-byte reference; every run reported zero mismatches. None of the sessions found the bug unaided. All three concluded they could not identify a bug they could demonstrate, and none raised buffers near address 0. Two named, as their main candidate, lengths for which s + n wraps past the top of the address space. The Linux man page doesn’t explicitly exclude that case, but in C such a buffer cannot be a valid object.
    > 
    > After a follow-up saying that a valid call violates the behaviour the man page describes, each session found the real bug within about a minute. Two of them also needed wrapping buffers to be explicitly ruled out first. The bug is in three exit paths, which compute a candidate address by subtraction and then compare it with s. When the buffer starts near address 0 (e.g. s = 1) and has no match, that subtraction wraps, and memrchr returns `(void *) -1` instead of `NULL`. Two sessions confirmed this under qemu-user with page 0 mapped; the third gave a hand trace only.
    > 
    > Their tests could not have caught it. The result depends on the buffer’s absolute address, the test buffers sat at ordinary mmap addresses, and the test machine refused to map page 0. What the transcripts show is that a capable model, testing thoroughly, did not get there on its own. Once the hints narrowed the search to the edges of the input space, the bug was easy to see. (Three sessions, one model, prompts not identical; anecdotal.)
    
10.  The fix for EVEX replaces the incorrect `subl` by `subq`. The fix for AVX2 adds extra jumps: After the specific `subq %rcx, %rax` instances that on underflow trigger the bug, a jump is inserted that, if the underflow happened, jumps to a label at which zero is returned. [↩](#fnref:10 "return to article")
     
11.  Such as future AI models, which may be able to find bugs out of reach of the current state of the art. [↩](#fnref:11 "return to article")
