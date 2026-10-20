---
title: "Auto-darksword: automating iOS offset discovery | twili8t"
source: https://twili8.github.io/2026/10/17/Auto-darksword-automating-iOS-offset-discovery.html
source_host: twili8.github.io
clip_date: 2026-10-20T10:17:11+08:00
trace_id: 65c9949f-6653-4917-8e3a-cc9d98e64a82
content_hash: 5b056491a2e3d481fcd894e4d8b03824be9ac6bbfe7d2ccd0933cb72707d0806
status: synced
tags:
  - iOS逆向
  - 安全工具
series: null
feed_source: twili8t·iOS内核利用
ai_summary: "**iOS 内核利用中最脆弱的部分，是按版本硬编码的结构体偏移；这篇文章用 XNU 的 `VERIFY` 断言字符串作为锚点，从 IPSW 离线静态推导 darksword 链所需的 inpcb/socket/protosw 偏移，因此既不需要设备，也不需要已有可用的漏洞。**"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ff75244-d011-81ea-8723-d2920107240b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **iOS 内核利用中最脆弱的部分，是按版本硬编码的结构体偏移；这篇文章用 XNU 的 `VERIFY` 断言字符串作为锚点，从 IPSW 离线静态推导 darksword 链所需的 inpcb/socket/protosw 偏移，因此既不需要设备，也不需要已有可用的漏洞。**
> 
> - **核心方法：** `VERIFY` 会把断言表达式字符串化，所以内核里留着大量对自身不变量的英文描述，例如 `so->so_usecount > 0`；只要找到引用该字符串的代码，反向追溯 `ldr` 所加载的立即数，就能得到字段偏移。其中一条断言链（`inp->inp_socket` → `so_proto` → `pr_protocol == 0x11`）可一次互相校验出三个偏移。
> - **工程实现：** 先扫描一遍，解析所有 `adrp`+`add`，建立从目标地址到引用点的索引。在 15.1.1 内核上约有 122,000 个目标，耗时约 8 秒；此后每个检测器都在秒级迭代，而不是分钟级。
> - **失败尝试：** 对 “bl 后接 str” 模式匹配会产生上万个候选；`__FILE__` 长路径字符串多未被引用；`protosw` 自指针 `pr_protosw` 在镜像里是 NULL，启动时才由 `net_add_proto` 填充；PAC 签名让指针范围检查失效，且签名方案按指针类别而异，同结构内 `+0x48` 数据指针可用低 48 位解码，钩子指针则不行。
> - **工具链问题：** capstone 5.0.7 会误译 pre/post-index 形式 `LDR/STR` 的立即数，`str x19,[x29,#-0x10]!` 被解成 `stur #-0x4a`；因此只对已用已知指令字校验过的无符号偏移形式做解码，异常时用 llvm-objdump 交叉验证。
> - **可核查输出：** 每个偏移都附锚点字符串、虚拟地址、指令站点和推导理由；置信度按命中数与交叉校验降级；未解析的必需偏移会在生成头文件中写入 `#error`，防止把猜测值编进二进制。12.5.8 与 15.1.1 仅 `so_usecount`（0x240/0x228）和 `in6p_icmp6filt`（0x140/0x150）不同；`socket_info` 的 gencnt 仍靠手工，可用 `--set` 覆盖。

Why do kernel structs move, how to find them without a device, is green tea actually good for health?

Every kernel exploit eventually dies of the same disease: it works on the version someone developed it against and then iOS ships and the struct offsets move. The exploit is fine but the hardcoded hex you wrote one year ago are not. And now you are staring at a kernel late at night trying to work out whether `so_usecount` moved by eight bytes or sixteen, with nothing to grep for.

That is where I ended up, and it is why I wrote [auto-darksword](https://github.com/twili8/auto-darksword). Go star it!

## The lab problem

I test on a many iOS devices. Different chips, different iOS versions, including betas. The darksword chain — an iOS kernel exploit path targeting IOSurface and ICMPv6 — is small and elegant: an out-of-bounds read and write on an IOSurface backing store, used to corrupt the ICMPv6 filter pointer inside a sprayed `inpcb`, after which the `ICMP6_FILTER` `setsockopt` path does arbitrary kernel copies on your behalf. It needs exactly five kernel offsets to get from “nothing” to “kernel read/write”:

```c
#define OFFSET_PCB_SOCKET     0x40
#define OFFSET_SOCKET_SO_COUNT 0x228
#define OFFSET_ICMP6FILT      (0x138 + 0x18)
#define OFFSET_SO_PROTO       0x18
#define OFFSET_PR_INPUT       0x28
```

Four of them pinned the device, the fifth was written as an arithmetic expression, which tells you the author was already tracking version drift by hand and losing. Multiply that by every device and every beta possible and the arithmetic stops being fun.

The manual process for each new version is: boot the device, get a working exploit, use whatever kernel read primitive you already have to dump the interesting structs, read the offsets off the dump, patch the header, rebuild. That loop is circular. To find the offsets you need a working exploit, and the exploit needs the offsets. So every version starts with a manual archaeology pass over a stripped 30 MB kernel image.

## Why this is worse on iOS than anywhere else

The general shape of this problem is common, but iOS makes it unusually unpleasant, and the jailbreak scene makes it worse in a specific, cultural way.

Structurally, there are no symbols. Unlike on Windows, where you can fetch a PDB for any system binary, the iOS kernel Mach-O has a stripped symbol table, so `inp_socket` does not exist as a name anywhere in the file. What you get is 34 MB of arm64e machine code, a few hundred thousand C strings and the occasional `__PRELINK_INFO` blob that is only sometimes useful. Static analysis of an Apple kernel is not reverse engineering in the usual sense; it is closer to reading tea leaves.

Culturally, and this is the part that actually pushed me to build the tool: the public knowledge is mostly magic numbers passed hand to hand. The original `DarkSword-RCE` JavaScript that everyone forks is the canonical example. It hardcodes `0x148` for the ICMPv6 filter field and `0x254` for the socket usecount. Those numbers are correct for *some* iOS version. Not all.

That is exactly the failure mode automation fixes. Not by being cleverer than the folklore, but by deriving the numbers from the actual binary every time, and by making it cheap to notice when the derivation and the folklore disagree.

## Dynamic discovery and why I went static anyway

There are two real ways to get kernel offsets.

**Dynamic** is what most people reach for first: run code on the device, walk the structures at runtime, print the offsets. It is accurate by construction, because it reads the live layout rather than inferring it. If you already have a kernel read primitive on the target, this is a twenty line program.

The problem is the bootstrap. Dynamic discovery needs a working exploit, and the exploit needs the offsets. It also needs a device, a signature, a trust cache, a free slot on your desk, and about forty minutes of ceremony per version. It does not work at all for a version where you do not yet have a chain, and it is awkward to run on more than one device per hour.

**Static** reads the kernel out of the IPSW and derives the offsets offline. It is deterministic so you will get the same answers every time, which means it is testable. It runs in about eight seconds, so it fits in a pre-commit hook or a CI job. And it works on a version where you have no exploit yet, which is precisely the case where you need the offsets.

I went static. The dynamic path is still the better oracle if you have a device to hand.

## Parsing the kernel is the easy part

To be clear about where the difficulty lives. Reading the Mach-O, walking sections, decoding arm64, finding `__TEXT` and `__TEXT_EXEC`: that is all afternoon work and a hundred lines of Python. Every one of the hard parts below happened *after* I had a working parser.

The real problem is this: a 34 MB kernel contains on the order of a million signed-offset memory accesses. Several thousand of them use an immediate in the range where `so_usecount` lives. Nothing in the instruction stream says which ones are the interesting field.

## What didn’t work?

I want to write these down because the failure modes are the interesting part, and because two of them are tricks I would have expected to work.

### Pattern matching the call-and-store idiom

The obvious first move. `inp->in6p_icmp6filt = kalloc_type(...)` compiles to something like `bl <alloc>; str x0, [x19, #0x150]`. Scan for calls whose result is stored at an immediate offset and collect the offsets.

I ran it. It produced about ten thousand candidate offsets and a scrollback I could not read, because `bl` followed by a store to a structure is simply the shape of most of the kernel. Narrowing it meant adding conjuncts (the stored value must be a call result, the offset must be in a plausible range, the function must be the right one), and once I had added enough conjuncts to make it precise I had basically written the detector I wanted anyway, minus the confidence that it was the right one.

### Anchoring on \__FILE\_\_

XNU stringifies `__FILE__` into every `VERIFY`, so the kernel is full of strings like `/Library/Caches/com.apple.xbs/Sources/xnu/xnu-8019.42.4/bsd/netinet6/icmp6.c`. If those strings are referenced from the functions compiled out of that file, you have a source-level map of the binary, and every offset search can be scoped to “functions in in_pcb.c” or “functions in icmp6.c”.

In practice, mostly they are not referenced. The short forms are live, but the long `__FILE__` paths are, in the images I looked at, unreferenced leftovers that somebody linked in without a single load. Worse, the full-path strings that *are* referenced point at functions that are not the ones I cared about; in 15.1.1 the two `icmp6.c` file-string references are both deep inside `icmp6_dgram_attach`, not in the filter-handling path I wanted.

This was a useful discovery anyway. It is what made me notice that the kernel is full of anchors *other* than file paths, and that the better ones are the stringified assert expressions.

### Scanning protosw for its self-pointer

The `protosw` struct has a `pr_protosw` field that points at the struct itself, which sounds like a gift: scan data for a self-pointer, and you have found the protocol switch table, and `pr_input` is a fixed distance from it.

It is NULL in the image. `net_add_proto` fills it in at boot (`VERIFY(pp->pr_protosw == NULL); pp->pr_protosw = pp;`). The self-pointer that would make this trivial exists only at runtime. I found that out by grepping the xnu source after the scan came back empty, which is the correct order of operations and also made me feel slightly foolish.

### Range-checking pointers in const data

The refined version of the same idea. Find records where a few fields are small integers that look like `pr_type` and `pr_protocol`, then check that the following qwords point into `__TEXT`. That is a very strong signature, and it returns nothing, because kernel const data holds PAC-signed pointers. Range checks on the raw value fail.

This is where I spent an embarrassing amount of time, because the fix appears obvious in hindsight: strip the PAC and check again. It half works. On 12.5.8 (I know the exploit doesn’t work on this version), masking the low 48 bits and restoring the kernel’s high bits lands every hook pointer in `__TEXT`. On 15.1.1 the same treatment produces addresses that are not in the image, and the low byte of the address is not even right.

The thing that actually resolved it was cross-checking one hypothesis against a neighbouring field in the same struct. In the 15.1.1 record, the field at `+0x48` is a data pointer (it points at `udp_usrreqs` in `__DATA`), and it decodes perfectly with the low-48 rule. Same struct, same alignment, same linker: one pointer class follows one scheme and the other follows a different one. So the signing scheme is per-pointer-class, not global, and there is no single decode that works for both. That realisation came from one instruction of extra scepticism applied to a *different field*, which is the general lesson I kept coming back to: whenever a hypothesis fails, look for a nearby fact that should have been consistent with it and was not.

The offset itself I ended up deriving structurally instead: find the records by the `pr_type` / `pr_protocol` / `pr_flags` triple that the code-derived `pr_protocol` offset predicts, and take the first hook pointer slot after it.

### Trusting the disassembler

This one is a gift and it cost me an hour.

capstone 5.0.7 mis-decodes the immediate on `LDR` / `STR` pre-index and post-index forms. Feed it the single most common function prologue instruction in arm64e code:

```
0xf81b63b3  ->  stur x19, [x29, #-0x4a]
```

That word is `str x19, [x29, #-0x10]!`. The writeback flag is mis-decoded as an unscaled-immediate form, and the immediate comes out wrong.

I found this because one instruction in my results contradicted the surrounding code, and instead of assuming the code was wrong I decoded the word by hand, in two different ways, and got two different answers. The third oracle was llvm-objdump, which agreed with neither of my formulas until I noticed that I was using a made-up bit position.

I have not filed this upstream yet so treat it as a caveat rather than a fixed bug: if you are writing your own arm64 decoder, check the pre-index and post-index `LDR` / `STR` forms against llvm-objdump before you trust them, because nothing about the bad output looks wrong in isolation.

Two things came out of it. First, the tool now only decodes instruction forms whose bit layout I verified against known words from the same kernel, which is why every detector is written against the unsigned-offset forms, where `imm12 = bits 21:10` scaled by access size, and why the one place I wanted a pre-index store I found a signature that does not need it. Second, and more generally: a security toolchain is full of tooling that looks authoritative and is not, and the only defence is a second opinion at the point where a result looks surprising.

## What worked: asserts as anchors, semantics as the decoder

The realisation was that XNU’s `VERIFY` macro stringifies the assertion expression, so the kernel contains hundreds of English-language descriptions of its own invariants:

```
so->so_usecount > 0
so->so_proto != NULL
SOCK_PROTO(inp->inp_socket) == IPPROTO_UDP
icmp6_dgram_attach @%s:%d
```

If a string describes a condition, the code near its reference has to materialise the operands of that condition, and the field offsets are the immediates in those loads. That turns “find the offset” into “find the place where this sentence is true and read the constant”, which is a much easier question.

Two engineering pieces made it practical.

**One reference index, built once.** All of this hinges on resolving `adrp` + `add` pairs, and doing that per-string meant a full scan of 34 MB of text per anchor. Instead I decode the ADRP page of every instruction once, keep a small set of pending candidates per register, and build a map from target address to reference sites. One pass, eight seconds, 122,000 distinct targets for the 15.1.1 kernel. After that, asking “who references this string” is a dictionary lookup, and I could iterate on detectors in seconds instead of minutes.

**Semantic decoding, not pattern matching.** For each offset I wrote down what the source says the code must do, then wrote a detector that checks for that sequence. This is the opposite of a generic scanner: each detector is a tiny theorem prover about one function.

`inp_socket`, `so_proto` and `pr_protocol` come out of one assert. The UDP input path asserts that the socket’s protocol matches IPPROTO_UDP, so the code has to load `inp->inp_socket`, chase it to the socket, load `so->so_proto`, chase that to the protosw, load `pr_protocol`, and compare it with 0x11. Walking that chain backwards yields three offsets at once, and they check each other: three independently extracted constants that have to be consistent with the same pointer chase is much stronger evidence than one constant alone.

Schematically, the code runs top to bottom and the detector walks it bottom to top, from the compare back to the first load:

```
    x19 = inp
     |
     |  ldr  x9, [x19, #inp_socket]        <- OFFSET_PCB_SOCKET
     v
    x9  = socket
     |
     |  ldr  x8, [x9,  #so_proto]          <- OFFSET_SO_PROTO
     v
    x8  = protosw
     |
     |  ldrh w0, [x8,  #pr_protocol]       <- third offset, same single assert
     v
    w0 == 0x11                             <- IPPROTO_UDP: the sentence is true here
```

The part worth showing is how little “knowing” is in there. The detector does not understand sockets; it knows that a base register came from a load, and that a field offset is the immediate in that load:

```python
# tools/auto_darksword/finder.py.
def walk_loads(ctx, idx, reg, depth):
    """Follow ldr xT,[xB,#imm] producers backwards from reg.

    Returns [imm_0, imm_1, ...]  the field that produced reg, then the one
    that produced *its* base. None if a hop is missing.
    """
    chain, cur = [], reg
    for _ in range(depth):
        nxt = None
        for j in range(idx - 1, max(-1, idx - 16), -1):  # bounded lookback window
            l = arm64.ldr_uoff(ctx[j][1])
            if l and l[0] == cur:      # something loaded into the register we want
                nxt = (j, l)           # its base register is the next link up
                break
        if nxt is None:
            return chain if len(chain) >= depth else None
        idx, (cur, _rn, imm) = nxt
        chain.append(imm)
    return chain
```

The call site is two lines. `rn` is the base register of the `ldrh` and `rt` is what it compared, so by the time we get there we have already checked that the instruction is a 16-bit load and that a `cmp` within the next four instructions compares it against `0x11`:

```python
chain = ctx.walk_loads(ctxw, i, rn, 2)   # -> [so_proto, inp_socket]
so_proto_off, inp_socket_off = chain[0], chain[1]
```

`so_usecount` is a straight vote. `so->so_usecount > 0` appears 18 times in 15.1.1 and 27 times in 12.5.8. Each site loads a field and compares it with zero. On 15.1.1 that is twelve votes for `0x228` and one for `0x22c`; on 12.5.8, nine for `0x240`. Majority voting is not exciting, but a field that the compiler touches from eighteen different call sites is not going to be misread systematically.

`in6p_icmp6filt` comes from `icmp6_dgram_attach`, which allocates the per-pcb ICMPv6 filter, stores the pointer into the pcb, and then fills the object with 0xff. The detector looks for that store inside the function that the `icmp6_dgram_attach` string points at, following `so->so_pcbdata` to the pcb first so it knows which base register it is storing into.

`inp_gencnt` has a lovely subtlety. `in_pcballoc` does `inp->inp_gencnt = ++pcbinfo->ipi_gencnt`, which is two stores: one back into the pcbinfo, one into the pcb. My first detector took the first store and confidently reported the pcbinfo’s generation counter offset instead. The rule that works is “the store whose base register differs from the register the increment came from”, which is a one-line fix and the kind of thing that would have quietly shipped as a wrong number if I had not been reading the generated evidence.

`inp_list` falls out of `LIST_INSERT_HEAD` semantics: the new pcb’s `le_prev` is set to the address of the list head, and `le_next` sits 8 bytes lower.

`pr_input` is the data-side one described above, calibrated by the code-derived `pr_protocol` offset rather than by a hardcoded layout.

One caveat on that last one, because it is the weakest link in the set. The `pr_protocol` the detector recovers does not sit where the xnu headers say it should: I got `0x22` where `struct protosw` has it at `0x02`. Feeding the wrong offset into the calibration still lands on `0x28`, which is the value the exploit wants, so the number is right but the reasoning behind it is not. The honest description is that `pr_input` is matched by table shape and agrees with the code-derived `pr_protocol` arithmetic, not that it is derived from it. Worth fixing before anyone relies on the calibration on a version I have not tested.

## Two bugs worth writing down

Both were the same species of error, and both would have produced plausible wrong answers.

**Anchor sites are not where the code is.** My first version scanned backwards from the string reference, on the assumption that the assert’s operands are computed before the panic call. For 15.1.1 that happens to be true and it worked. For 12.5.8 the `__func__` string reference sits at the top of the function and the interesting store is forty instructions later, so the detector found nothing. The fix is to look both ways, which is what the code does now.

**The address of a substring is not the address of the string.** XNU stringifies `__func__`, so the bytes in the binary are literally `"icmp6_dgram_attach"` including quote characters. Searching for `icmp6_dgram_attach` finds the needle one byte into the string, and no ADRP in the kernel points at offset+1, so the reference count came back zero. The fix is to walk back to the NUL terminator and use the start of the string. I hit this twice, once during development and once again in a different detector before I generalised it.

Neither of these is a subtle reverse-engineering problem. Both are the kind of thing that makes an automated tool quietly worse than the person who would have done it by hand, which is the real argument for writing evidence next to every value.

## What the tool outputs

The point of all this evidence is that it should be checkable by a human who does not trust the tool. Every derived value carries the anchor string, its address, the instruction site, and the reasoning:

```json
{
  "name": "in6p_icmp6filt",
  "value": "0x150",
  "confidence": "medium",
  "evidence": [{
    "anchor": "icmp6_dgram_attach @%s:%d",
    "anchor_va": "0xfffffff00732a42f",
    "site": "0xfffffff007fa4ea4",
    "detail": "so->so_pcbdata+0x10 -> inp; str <alloc>, [inp+0x150] (after call)"
  }]
}
```

Note `"confidence": "medium"` with one hit. That offset rests on a single signature site, and the tool says so instead of rounding up. Confidence is derived from hit counts and from cross-checks: `pr_input` gets downgraded if it disagrees with the layout implied by the code-derived `pr_protocol`, `inp_socket` gets downgraded if it is not 8-byte aligned.

The other half of failing loudly is the build. If any required offset is unresolved, the generated header gets written with a `#error` in it. The practical effect is that you cannot accidentally compile a binary with a guessed offset in it, which is the failure mode that produces an unexplained kernel panic on a device two days later.

## Cross-validation

I tested against two kernels:

-   **15.1.1 on A15**, where the offsets are already known to work because that is what the exploit I forked from targets.
-   **12.5.8 on iPhone7,2**, validated against the xnu-4903 headers.

Both columns were checked by running the tool and diffing against those expectations by hand. That is not the same as a test suite, and the repo does not ship one, so nothing here stops a future change from quietly moving a number.

| offset | 12.5.8 | 15.1.1 |
| --- | --- | --- |
| `inp_socket` | 0x40 | 0x40 |
| `so_usecount` | 0x240 | 0x228 |
| `in6p_icmp6filt` | 0x140 | 0x150 |
| `so_proto` | 0x18 | 0x18 |
| `pr_input` | 0x28 | 0x28 |
| `inp_gencnt` | 0x78 | 0x78 |

The tool reproduces the published 15.1.1 constants exactly, on a binary it has never seen, with no version-specific special cases. Note that only two of the six values differ between the two kernels, and both of them are the ones with any real variation. `struct socket` changed by 0x18 between 12.5.8 and 15.1.1; `struct inpcb` did not move.

## What is still manual

The `struct socket_info` field the `socket_info` syscall fills with `inp_gencnt`. That code path has no assert strings anywhere near it, no identifiers, and when I tried to find it by looking for stores of `inp_gencnt` into a caller-supplied buffer, I got several hundred candidate sites and no signal. I left it as a per-version constant, marked as manual in the header and in the JSON, overridable with `--set socket_info_gencnt=0x...`, and documented as a known gap.

I mention it because the temptation with automation is to round a “probably right” up to “right”.

## Using it

```bash
./auto-darksword kernelcache.release.iPhone14,2
./auto-darksword ~/Downloads/iPhone_4.7_12.5.8_16H88_Restore.ipsw
make offsets KERNEL=/path/to/kernel
```

Python 3 only. An IPSW whose kernelcache uses Apple’s `complzss` compression needs the `ipsw` tool, which is auto-detected; a plain decompressed kernel Mach-O needs nothing.

For a new beta the workflow is: download the IPSW, run the tool, read the eight lines of output, rebuild. If a detector comes up empty, the JSON says which one and what it was looking for, which turns “the exploit broke” into a ten-minute question instead of a night.

## What I would do next

The detectors are not darksword-specific, they are about `inpcb`, `socket` and `protosw`, and most of them need nothing from the exploit except a reason to exist. The obvious next step is running the same detectors across every kernel I can get my hands on, iOS 16 through the current betas, and treating each new disagreement as either a detector improvement or a genuine layout change worth writing down.

The second step is harder and more interesting. On 12.x the kernelcache carries `__PRELINK_INFO`, which may be enough to recover real symbol names for the older devices and retire the string anchors entirely. If that pans out, the detectors stop being clever and start being lookups.

## Notes on process

A few things I did that I would keep doing, because they are what stopped this from being a pile of guesses:

**Derive and validate through different paths.** The 15.1.1 expectations come from the exploit working on real hardware; the 12.5.8 expectations come from reading xnu headers. The tool has never seen either source. Agreement between a binary-derived answer and a source-derived or empirically-derived answer is evidence; agreement between two copies of the same guess is not.

**Read the evidence, do not just read the answer.** The generated JSON is not decoration. Both the `inp_gencnt` bug and the anchor-window bug were caught by looking at a site address and going to read the surrounding instructions, not by looking at the number and deciding it looked plausible.

**Distrust the toolchain at the point of surprise.** The capstone bug, the substring address bug, the two anchor sites pointing somewhere unexpected: every one of them looked like a fact about the kernel until I checked what was actually producing the fact.

If you take one thing from this: just automate whatever is tedious!

## Afterthoughts

This was a fun project. I really liked it.

Twili8t.
