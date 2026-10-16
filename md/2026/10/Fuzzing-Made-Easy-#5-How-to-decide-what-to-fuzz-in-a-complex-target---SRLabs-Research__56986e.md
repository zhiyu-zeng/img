---
title: "Fuzzing Made Easy #5: How to decide what to fuzz in a complex target - SRLabs Research"
source: https://srlabs.de/blog/decide-what-to-fuzz
source_host: srlabs.de
clip_date: 2026-10-16T10:33:57+08:00
trace_id: 746acdf5-6b2c-4044-abba-d732ebc14847
content_hash: 3dc5602b9e9c896f6f71745dfb9a315ba067899b1677175c8494da2c9cbaffc2
status: synced
tags:
  - 漏洞分析
  - 安全工具
series: null
feed_source: SRLabs·模糊测试/漏洞审计
ai_summary: 大型目标的模糊测试核心不是"fuzz 什么"，而是"先 fuzz 什么"——应先建立信任模型，再按攻击者可达路径排优先级。
ai_summary_style: key-points:weak
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fb75244-d011-8129-8fc3-fe073a682869
ioc:
  cves: []
  cwes: []
  hashes:
    - 0fe989b6b514192783c469039edd325fd0989806
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points:weak）**
>
> 大型目标的模糊测试核心不是"fuzz 什么"，而是"先 fuzz 什么"——应先建立信任模型，再按攻击者可达路径排优先级。
> 
> - **排序而非取舍：** 真正攻击者可达的表面最终都应被 fuzz，关键是以"每 CPU 小时/每 CPU 天获得最多安全信号"为标准排次序；错误顺序会浪费数周算力。
> - **先定信任模型：** 明确哪些字节由攻击者控制（如 TLS 记录、对端证书链、上传的文件），哪些可信（本地配置、自有私钥、CA 库）；不要凭类型签名判断，`const uint8_t *` 未必不可信。
> - **跟随数据到危险点：** 从入口沿数据流找到由输入决定的 memcpy、分配、数组下标、可溢出运算、格式化字符串或 unsafe 调用；路径上的长度校验、magic、校验和、解密步骤决定了 harness 的入口与约束。
> - **可达 ≠ 已被 fuzz：** 位于校验、签名或 AEAD 解密之后的代码（如 `mbedtls_ssl_decrypt_buf`、ticket AEAD 后的 `mbedtls_ssl_session_load`）存在"深度缺口"，需在过滤器之后设 harness 或建模对端，但必须保留上游后置条件，否则会产生不可达的假崩溃。
> - **大 harness 为主、专用 harness 补充：** Mbed TLS 的 `fuzz_server.c` 用原始记录流端到端驱动握手，静态可达 1785 个函数定义，约为单个 X.509 harness（约 940）的 1.9 倍；它还从末字节取配置位，与记录流不共享字节。
> - **验证与增强：** 用 `fuzz-reachability` 静态确认覆盖广度，用覆盖率分析确认动态深度；为无崩溃的逻辑错误加入不变量、往返（load/save 幂等）和与 OpenSSL 的差分 oracle，并注意差异需人工判定而非自动视为缺陷。AI 可承担枚举攻击面、起草 harness 等机械工作，但需 SOTA 模型并附 `file:line` 证据，由人审核否决。

![](https://srlabs.de/img/assets/authors/srl_headshot_marc_heuse-320.c5b3b05101.avif)

### Key takeaways

-   **It's about what to fuzz first, not what to fuzz.** On a large target almost everything untrusted input can reach should be fuzzed eventually. The skill is deciding the order.
-   **Start from a trust model.** Decide what counts as untrusted input before you rank anything. Functions that never see untrusted input drop out on their own.
-   **Follow the data.** The path from an entry point to a dangerous operation tells you what to fuzz, where to set the scope, and what to mock.
-   **Reachable is not the same as fuzzed.** Code behind a handshake, a verifier, or a decryption step may need a focused harness or a realistic peer model, or the fuzzer never exercises it deeply.
-   **Go big, and stay realistic.** Use at least one large harness that drives the target end-to-end from input it could really receive, then add focused harnesses where filters suppress depth or stronger oracles are available. Check the portfolio with static reachability and hand off to harness writing (#2) and coverage analysis (#8).

## Introduction

The other posts in this series assume you already have a target and know which function to fuzz. [Fuzzing Made Easy #1](https://srlabs.de/blog/guide-to-writing-fuzzing-harness) and [#2](https://srlabs.de/blog/unlocking-secrets-effective-fuzzing-harness) cover how to write a good harness, and [#8](https://srlabs.de/blog/coverage-analysis) covers how to measure what your campaign reached. This post steps back to the question that comes before all of that: someone hands you a large, unfamiliar codebase - where do you even start?

On a small library the answer is obvious. A base64 decoder or a standalone XML parser has one thing to fuzz, and you fuzz it. A real target is the opposite problem. It has many subsystems, dozens or hundreds of public functions, several ways for input to get in, and you cannot fuzz all of it at once with the time and machines you have. "What do I fuzz?" has no single answer, and getting the order wrong wastes weeks of CPU and your own time.

This article walks through analysis end to end: define what counts as untrusted, map everything untrusted input can reach, follow the data to where it gets dangerous, rank it, and then shape each harness - its entry point, the checks it has to get past, its statefulness, and the invariants that catch silent bugs. We use [Mbed TLS](https://github.com/Mbed-TLS/mbedtls) as a running example so you can follow along on a real, complex target. At the end we show how AI can do some of this legwork for you, and how the result hands straight back to harness writing and coverage analysis.

> All Mbed TLS references are against the **4.1.0 LTS** release (which was the current version when we began writing this blog post. File and line numbers move between versions, so check them against your own checkout. The sub-project *tf-psa-crypto* is not analyzed as a separate target here, although the end-to-end builds still link code from it.

To checkout the version this blog post is based on to easily follow along (commit 0fe989b6b514192783c469039edd325fd0989806):

```bash
git clone -b v4.1.0 https://github.com/Mbed-TLS/mbedtls
cd mbedtls
git submodule init
git submodule update --recursive
```

## On a big target, the question is not what to fuzz, but what to fuzz first

Small targets have one obvious thing to fuzz. Big targets have the opposite trouble: too many things, and no way to cover them all at once. The instinct is to ask "what should I fuzz?" - but that framing is wrong, and it leads people to fuzz one thing and call it done. Other people are overwhelmed and do not even know where to start.

![How to eat an elephant? Bite by bite.](https://srlabs.de/img/content/blog/post-assets/decide-what-to-fuzz/elephant-320.3863eaa245.avif)

Figure 1: How to eat an elephant

This is not about picking a few "critical" functions and ignoring the rest. Almost everything genuinely attacker-reachable should be fuzzed eventually, because a bug on that surface may be exploitable under the matching threat model. The real question is the order: what gives you the most security signal per hour of effort and per CPU-day, and what can wait. So the job in this post is to build a *ranked plan*, the full untrusted-reachable surface, sorted by where bugs are most likely and most damaging, and shaped into harnesses that reach real behavior.

Getting the order wrong is the common failure. People fuzz the first public function they find, or the one that's easiest to wrap, and burn a week on a getter while the certificate parser sits untouched.

**On Mbed TLS →** Mbed TLS is a TLS and crypto library: X.509 certificates, the TLS handshake and record protocol, ASN.1, PEM, public-key parsing, the crypto primitives, and a lot more. Its public headers export hundreds of `mbedtls_*` functions. Many of them never touch attacker data, configuration setters, getters, key generation you call yourself. A handful sit directly on the path of bytes a remote peer sends you. We can't harness all of it on day one, so we rank it, and the rest of this post is how. The build used here exposes about 265 public functions, this will not be easy.

## Decide what counts as untrusted input

Before you can rank anything you have to draw a line: what is attacker-controlled, and what is not. This is the trust model, and it is the single most important input to everything that follows. Fuzz trusted input and you waste effort; miss an untrusted source and you leave a hole.

Be explicit about it. Write down the untrusted sources, the bytes an attacker can send or supply, and the trusted ones, such as local configuration and keys under your control. When you're unsure, ask a simple question: can an attacker influence this under the threat model you're testing? If yes, it's untrusted. Don't assume from the type signature, either. A `const uint8_t *` parameter is not automatically attacker-controlled, and a "config" struct can carry attacker data if something fills it from the network. Tie each source to a real attacker capability.

**On Mbed TLS →** Untrusted is every byte that arrives over the wire: TLS records during and after the handshake, and the certificate chain a peer presents. In many deployments certificates and keys loaded from files you didn't generate also count as untrusted, like a certificate someone uploads or a key from a store you don't control. Trusted is the configuration you set in code (cipher suites, callbacks), your own private key, and your CA store. So the untrusted zone begins the moment data enters the record layer or a parse function, and the boundary is the API where your code hands attacker bytes to the library.

## Map everything untrusted input can reach

With the trust model fixed, list the boundary entry points: the functions where untrusted input first enters the code you're analyzing. For a library these are the public APIs that take attacker bytes; for a server, the receive input path. Each entry point is the root of a slice of the call graph, and the union of those slices is your fuzzing scope.

Keep three meanings separate as you work: *call-graph reachable* means a static path exists, *fuzz-reachable* means the campaign actually exercises the code with meaningful inputs, and *attacker-reachable* means a real attacker can establish every required precondition.

For each entry point, note the things you'll need later to rank it:

-   how close is the attacker (remote beats local-cross-process, which in turn, beats local))
-   whether they're authenticated in a meaningful way
-   any other privilege boundary they cross

Write down where the input comes from and what shape it has (raw bytes, a file, a struct).

This step is about breadth. You want every untrusted-reachable surface on the list, not just the famous ones, because you can't prioritize a surface you never wrote down. Tools help: grep the exported symbols, read the public headers, and later use a static reachability tool to confirm what each entry can reach. AI can also help with the mechanical legwork. But the judgment of which entries take attacker data is yours.

**On Mbed TLS →** A first pass at the boundary entries and candidate harness roots, with file and line from the 4.1.0 tree:

-   the network boundary: the application-provided receive callback installed with `mbedtls_ssl_set_bio`. On platforms using `net_sockets.c`, `mbedtls_net_recv` (library/net_sockets.c:528) is one suitable implementation, not a mandatory source for every application: remote, unauthenticated, raw bytes.
-   the TLS/DTLS record and handshake engine downstream: `mbedtls_ssl_read_record` (library/ssl_msg.c:4035) feeding the handshake driver `mbedtls_ssl_handshake` (library/ssl_tls.c:4257) and its single-step form `mbedtls_ssl_handshake_step` (library/ssl_tls.c:4168), plus `mbedtls_ssl_check_record` (library/ssl_msg.c:219) for validating a raw datagram in isolation: candidate roots for remote, unauthenticated record bytes.
-   handshake message parsing: the per-message parsers reached from `mbedtls_ssl_handshake_client_step` / `mbedtls_ssl_handshake_server_step` (library/ssl_tls12_client.c:2886, library/ssl_tls12_server.c:3425), with the TLS 1.3 state machines in ssl_tls13_client.c / ssl_tls13_server.c: internal candidate roots downstream of remote input.
-   certificate, CRL and PKCS#7 parsing: `mbedtls_x509_crt_parse` (library/x509_crt.c:1392) and `mbedtls_x509_crt_parse_der` (library/x509_crt.c:1381), alongside `mbedtls_x509_crl_parse_der` (library/x509_crl.c:282) and `mbedtls_pkcs7_parse_der` (library/pkcs7.c:552): a peer's chain, an uploaded certificate, a CRL or a signed blob. Exposure depends on the caller, and parsing happens before signature verification.
-   stateless wire tokens: `mbedtls_ssl_ticket_parse` (library/ssl_ticket.c:338) and `mbedtls_ssl_cookie_check` (library/ssl_cookie.c:184): remote, pre-authentication, cryptographically protected opaque blobs.
-   serialized internal state: `mbedtls_ssl_session_load` (library/ssl_tls.c:4116) and `mbedtls_ssl_context_load` (library/ssl_tls.c:5131): public deserializers for trusted internal blobs. Fuzzing them models a corrupted local cache, application misuse, or a compromised protection boundary, not an ordinary unauthenticated remote peer.

Note that the crypto layer underneath, the ASN.1 primitives, PEM decoding and key parsing that every parser above bottoms out in, was moved into the tf-psa-crypto submodule. For simplicity, we will not analyze it as a separate target from here on.

That's the map. Two things about its shape guide the order. First, the surfaces cluster: a handful of true parsers and deserializers turn bytes into structure, and almost everything else, the field accessors, the trust-decision helpers, the string formatters, only see data those first stages already parsed. Fuzz the parsers and you exercise the lower-level decoding transitively; downstream consumers and trust decisions still need explicit calls or end-to-end execution. Second, the deepest, densest byte-crunching now sits behind a submodule boundary; a black-box harness at the TLS and X.509 entry points still drives it transitively, but unit-fuzzing it means crossing into the other repository. The rest is turning this into an order: which surface to fuzz first, and how to shape each harness so it reaches real bugs. That second part is where experience pays off the most.

## Follow the data from the entry point to where it gets dangerous

Ranking starts with understanding where input goes. For each promising entry point, follow the data through the code until it reaches something dangerous: a memory copy sized from the input, an allocation sized from a parsed field, an array index taken from input, arithmetic that can overflow, a format string, a call into unsafe code. Those sinks are where a bug turns into a crash, or worse.

The path matters as much as the sink. It tells you what the input has to satisfy to get there: length checks, magic values, a checksum, a decryption step. And that tells you how to shape the harness and where to set its scope. A sink right at the entry point is easy to reach; a sink behind ten checks is not. This is also the moment to identify constraints that need a dictionary, a fixup, a realistic peer, a relocated harness, or, as a last resort, a fuzz-only bypass. Note those locations down for later `#ifdef FUZZING_BUILD_MODE_UNSAFE_FOR_PRODUCTION` or `#[cfg(feature = "fuzzing")]` changes.

You don't need a perfect dataflow analysis to do this. Read the code, follow the buffer, and write the path from entry to sink with line numbers. A static taint or reachability tool can then confirm and extend what you found by hand.

**On Mbed TLS →** Let's have a look at the certificate path. A peer's certificate arrives as DER bytes and flows: `mbedtls_x509_crt_parse` (x509_crt.c:1392) → `mbedtls_x509_crt_parse_der` (x509_crt.c:1381) → the real walker `x509_crt_parse_der_core` (x509_crt.c:1072), which first validates the outer DER `SEQUENCE` against the supplied buffer and then allocates and copies the certificate-sized slice:

```rust
  /* library/x509_crt.c:1113 - the outer SEQUENCE length has been checked */
  crt->raw.len = (size_t) (crt_end - buf);
  if (make_copy != 0) {
      crt->raw.p = p = mbedtls_calloc(1, crt->raw.len);   /* :1116 - checked, attacker-controlled length */
      ...
      memcpy(crt->raw.p, buf, crt->raw.len);              /* :1121 - bounded copy of that certificate slice */
```

This is not an unchecked copy: the outer ASN.1 length has already been validated against the input buffer. The size is still attacker-controlled, so it matters for allocation pressure and denial-of-service analysis. From there the parser decodes field after field, and the richer bug surface lies in the nested lengths, tags, extensions and certificate semantics. Those decode steps bottom out in the ASN.1 primitives: `mbedtls_asn1_get_len`, `mbedtls_asn1_get_tag`, and the per-node `mbedtls_calloc` behind each sequence. But as the map noted, that layer left this repository in the 4.x split: it now lives in the tf-psa-crypto submodule, reached transitively from here and analyzed on its own trust boundary.

The wire path is longer for the same parser: bytes → `mbedtls_ssl_read_record` (ssl_msg.c:4035) → record decryption `mbedtls_ssl_decrypt_buf` (ssl_msg.c:1270) → handshake dispatch → `mbedtls_ssl_parse_certificate` (ssl_tls.c:7056), which reaches the X.509 parser through its chain helper `ssl_parse_certificate_chain` (ssl_tls.c:6807 → `mbedtls_x509_crt_parse_der` at ssl_tls.c:6914). The nested parsing is identical. What differs is everything you have to get past to reach it: the record layer and, after the early flight, protection under keys a raw mutator has not established. That gap between the two paths to one parser is the point: it is cheaper to fuzz the X.509 parser directly with DER. If you later fuzz the wire path end to end, you either model a real peer or start after record protection while preserving the postconditions that layer guarantees.

## Reachable is not the same as fuzzed well

A common mistake is to treat "the fuzzer can reach this code" as "this code is fuzzed." It isn't. If a dangerous function sits behind a strong filter, for example a parser that rejects almost everything, a verifier, a decryption step, then reaching it needs inputs the fuzzer almost never produces by random mutation. The code is reachable on paper but barely exercised in practice. We call that a depth gap.

The fix is not simply to fuzz harder from the front. Start a focused harness past the filter, or model the upstream peer or state that can satisfy it. You trade a little simplicity for a lot of coverage - and, as the next section warns, you have to be careful not to trade away soundness.

Spotting these gaps is where experience shows. Look for steps that drastically narrow the input: a checksum, a signature, decompression, decryption, a strict grammar. Then ask whether the interesting code lives before or after them.

**On Mbed TLS →** The certificate parser has no cryptographic authenticity gate in front of it. `mbedtls_x509_crt_parse` runs the ASN.1 walk in `x509_crt_parse_der_core` (`x509_crt.c:1072`) before any signature is checked, so raw DER reaches the parser directly. DER grammar is still a structural funnel, though, so valid seeds, a dictionary or structure-aware mutation can improve depth.

The post-handshake record path is the opposite. To reach application-data decryption in `mbedtls_ssl_decrypt_buf` (`ssl_msg.c:1270`) by way of `mbedtls_ssl_read_record` (`ssl_msg.c:4035`), the fuzzer must first drive a whole handshake to completion: agree on a cipher suite, finish the key exchange, and send a valid protected `Finished` that clears `mbedtls_ssl_parse_finished` (`ssl_tls.c:7488`). A mutation-only raw-byte fuzzer will not do that at a useful rate, even though a real protocol peer can. So the deep record-decryption and application-data code is reachable on paper and nearly unfuzzed by a raw mutator in practice. Such a depth gap is the width of an entire handshake.

The session-ticket path shows the same gap in miniature, and points at the fix. `mbedtls_ssl_ticket_parse` (`ssl_ticket.c:338`) reads the raw ticket, but AEAD-decrypts it under a server-only key at `ssl_ticket.c:388` and only *then*, on a valid authentication tag, hands the plaintext to the inner deserializer `mbedtls_ssl_session_load` at `ssl_ticket.c:402`. An arbitrary mutation almost always dies at the tag check; the deserializer behind it - exactly the kind of length-driven binary parser you want to fuzz - is never meaningfully exercised through this entry by a raw mutator. Pushing raw bytes at `ticket_parse` harder will not help.

Notice what a focused harness looks like here: that inner deserializer is *also* a public API in its own right, `mbedtls_ssl_session_load` (`ssl_tls.c:4116`). For us, this means that we can hand it a plaintext session blob directly and skip the keyed filter. But the threat model changes: Mbed TLS documents serialized sessions as trusted internal context. A direct harness tests a corrupted local cache, application misuse, or a compromised ticket-protection boundary; it does not model an ordinary remote client choosing the plaintext of a protected ticket. When the library gives you a mid-pipeline entry point, take it, but carry the attacker model with it. When it doesn't, you reach past the filter another way, for example with a prebuilt valid connection state or, as a last resort, a fuzz-only bypass.

## Fuzz big: cover depth and breadth in one harness

This is one of the most important lessons in the post, and one that is often ignored. The instinct is to write many small harnesses, one per function (this is common when you are just starting out and gaining experience, or when a tool - like AI - generates harnesses for you). Small harnesses are easy to write, and they do find shallow bugs. But on a complex target, valuable bugs often live in the interaction between stages: the parser feeding the validator feeding the state machine. A one-function harness cannot expose those interactions.

A big harness drives the target the way it really runs: many functions, many stages, deep call chains, all from a single input. It gets breadth and can get depth at the same time. It is a strong way to find logic and state bugs that focused harnesses miss, but it is not a replacement for them: large harnesses can be slower and can stall behind strong filters.

"Big" does not mean "everything at once with no thought." A harness can be too complex: setup cost and hard gates can stop it from ever gaining useful coverage. It means choosing an entry point high enough to drive real end-to-end behavior, and then letting one input flow through the whole pipeline. You still scope it, but you scope it generously. The next sections are about exactly that.

**On Mbed TLS →** The library's own fuzz suite already shows the principle. `programs/fuzz/fuzz_server.c` does not call a single leaf parser; instead, it drives an entire TLS server handshake straight from the fuzzer's bytes:

```c
/* programs/fuzz/fuzz_server.c:153 */
biomemfuzz.Data = Data;
biomemfuzz.Size = Size - 1;
biomemfuzz.Offset = 0;
mbedtls_ssl_set_bio(&ssl, &biomemfuzz, dummy_send, fuzz_recv, NULL);

mbedtls_ssl_session_reset(&ssl);
ret = mbedtls_ssl_handshake(&ssl);
if (ret == 0) {
    /* keep reading application data until the peer is done */
    do {
        len = sizeof(buf) - 1;
        ret = mbedtls_ssl_read(&ssl, buf, len);
        if (ret == MBEDTLS_ERR_SSL_WANT_READ) {
            continue;
        } else if (ret <= 0) {
            break;   /* EOF or error */
        }
    } while (1);
}
```

The fuzzer's input *is* the incoming record stream: `fuzz_recv` feeds those bytes to the record layer, and `mbedtls_ssl_handshake` (`fuzz_server.c:159`) walks the state machine across them. One input can exercise record parsing, handshake-message parsers, extension handling, key exchange, and - if the handshake completes - the application-data reads at `fuzz_server.c:164`. That gives one harness broad access to cross-stage interactions that a one-function harness cannot expose. Static reachability later in this post puts a number on the potential: in the build used here, this harness statically reaches **1785** function definitions, against roughly **940** for a single X.509 parser harness: about **1.9× as many statically reachable functions from one root**. It also statically reaches code associated with both the TLS 1.2 and TLS 1.3 handshakes; dynamic coverage is what shows which paths actually ran.

Contrast a harness that only calls a leaf primitive like `mbedtls_asn1_get_len` (now over in the `tf-psa-crypto` submodule). It mostly finds bugs in that primitive and its immediate helpers: no certificate logic, no handshake, no interaction between stages. Useful as a supplement, weak as your main effort.

There's a second trick in the same harness worth noting. The last input byte is peeled off as an options selector that flips configuration on and off:

```c
/* programs/fuzz/fuzz_server.c:47 */
options = Data[Size - 1];   /* bit-flags: cert-req CA list, ALPN, session tickets,
                               extended master secret, encrypt-then-MAC, PSK, renegotiation */
```

One harness then covers many server configurations instead of one (breadth again). Because the options byte is taken from the end (`Data[Size - 1]`) while the record stream is taken from the front (`biomemfuzz.Size = Size - 1`), the two never share bytes: the configuration selector cannot corrupt the record stream, and vice versa. This follows the " *1\. Don't reuse data* " rule from [#2](https://srlabs.de/blog/unlocking-secrets-effective-fuzzing-harness). On the other hand, it also violates the " *2\. Don’t reinterpret data* " rule: the value of this option byte selects different code paths even when every record-stream byte stays the same. One improvement would be multiple harnesses with the options hard-coded. Whether that is better usually becomes clear only after coverage analysis later in the campaign. In this case, the advantages appear to outweigh the disadvantages because the paths are variations of the same pipeline rather than completely different ones.

## Start where the input is still realistic

Going big and going deep both push you toward starting the harness further inside the target. There's a limit, and that limit is soundness. If you start so deep that you hand the code a value a real input could never produce, every "bug" you find there may be a false positive, a crash that an earlier check would have prevented in the real world. You'll waste days triaging things that cannot actually happen.

The rule: start as deep as possible, but only feed values some real input could actually produce at that point. If a stage upstream guarantees a property, for example a length fits, a structure is well-formed, a field was decrypted, then your harness has to preserve that property, either by constructing valid input or by fixing it up after mutation.

There are two safe ways to start deep. The first is to inject after a transformation while preserving every postcondition that the real upstream stage establishes. Decryption can be a good example, but the record layer may also guarantee an authenticated record type, padding removal, length limits, sequence or epoch state, and the active key phase. The second is to reconstruct what the upstream guarantees: constrain the length or values, recompute a checksum, rebuild a valid header. This way the deep code only ever sees inputs it could legitimately receive. The unsound version is feeding hand-built internal structures straight into deep code: it can find real bugs, but you have to prove each crash is reachable from a real input before you can trust it or expect a developer to accept the report.

**On Mbed TLS →** Feeding raw record bytes to the server harness is sound by construction: those bytes are exactly what a client sends, so every state the fuzzer reaches is a state a real client could drive it into. In TLS 1.2, `ClientHello` and the client's certificate and key-exchange messages are sent before record protection is activated, so the whole-handshake harness can fuzz those message parsers with realistic plaintext, no forging required. That's why it's a good design, not just a big one.

The depth gaps from the previous section are exactly the places where "start deeper" collides with soundness, and each has a sound way in.

The session ticket is an easy example of changing scope, but not of preserving the same attacker model. The AEAD step in `mbedtls_ssl_ticket_parse` hands a plaintext session blob to `mbedtls_ssl_session_load` (`ssl_tls.c:4116`), so directly fuzzing that public deserializer is useful. However, a remote client cannot normally choose the authenticated plaintext of a server-protected ticket. This harness models a corrupted local session cache, application misuse, or a compromised ticket-protection boundary, and findings must be labelled that way.

The application-data path is related but has a different key model. A real peer that completes the handshake knows its negotiated traffic keys and can generate valid protected records. For focused fuzzing, establish a valid session and either drive such a peer or feed fuzzed *plaintext* past `mbedtls_ssl_decrypt_buf` (`ssl_msg.c:1270`) while reconstructing the record-layer postconditions. The dispatch-by-record-type logic in `mbedtls_ssl_read_record` (`ssl_msg.c:4035`) must see a state and plaintext that a real successful decryption could produce.

Compare either of those to hand-building an `mbedtls_ssl_context` in a half-finished handshake state and calling a deep function on it. The handshake maintains invariants across `ssl->state`, the negotiated transform, and the session fields. A hand-assembled context can put them in a combination the state machine would never produce, and crashes you find from there may be unreachable from any real input. That approach can still surface real bugs, but every crash now carries a proof obligation: show it reachable from a genuine peer before you trust it, or before a maintainer will.

## Help the fuzzer past the checks that block it

Some checks stop the fuzzer cold: it can't get past them by mutation, so the code behind them never runs (in the fuzzing world we call these *path constraints*). How you handle a check comes down to one question: who knows or can derive the value?

If there is no secret, for example a magic value, a version field, a length, then you do not need to touch the target. For simple constants, give the fuzzer a dictionary so it guesses them quickly. For dynamic public values, for example a CRC over parts of the input, create a fixup.

If a key is involved, distinguish a peer-known negotiated secret from an endpoint-only secret. A TLS peer that completes its side of the handshake can derive the secrets needed to produce its own valid `Finished` and AEAD-protected records; an unauthenticated client does not know a server-only ticket-protection key. For peer-known values, model the peer or have the harness construct valid protected input. For endpoint-only values, bypassing the check changes the attacker model and must be labelled accordingly. A fuzz-only `#ifdef FUZZING_BUILD_MODE_UNSAFE_FOR_PRODUCTION` or `#[cfg(feature = "fuzzing")]` can be a last resort, with a duty to reproduce findings against the unmodified code. Computing checks in the harness costs CPU time, but it often preserves the real model better. Relocating after decryption is sound only when the harness also reconstructs the postconditions that decryption and record processing establish. This is not cheating; it is making the constraint and the threat model explicit.

Whatever you do, every crash found against a modified or relocated target has to be re-checked against the real one. A fixup crash usually still indicates a real bug, as long as the resulting input is something an attacker can send. A keyed-gate crash's severity depends on who can establish the key and every other prerequisite, and that condition has to travel with the finding, and never quietly dropped.

**On Mbed TLS →** The certificate parser needs no help. Its signature is checked *after* the ASN.1 walk. The verification lives in `mbedtls_x509_crt_verify` (`x509_crt.c:3125`), not in the parser, so the parser runs on raw input as-is. No secret gate is in front of it: leave everything on and fuzz the DER directly.

The handshake is the opposite; it is full of constraints tied to negotiated secrets. The peer's `Finished` message authenticates the handshake transcript and is checked in `mbedtls_ssl_parse_finished` (`ssl_tls.c:7488`); once record protection is active, records are authenticated and encrypted and verified in `mbedtls_ssl_decrypt_buf` (`ssl_msg.c:1270`). A raw mutator cannot satisfy these constraints because it has not completed the key schedule, but a malicious protocol peer that completed the handshake can. The raw-byte server harness reaches the unprotected early parsing, but random record streams stall at the protected stages. To fuzz past that point, drive both ends, establish a deterministic valid session and generate protected records, or, as a last resort, disable verification under `FUZZING_BUILD_MODE_UNSAFE_FOR_PRODUCTION`. A bypass changes the model, so the exact prerequisite has to ride along with every finding, together with a duty to reproduce it against the unmodified library.

Decryption gates are often a case where *relocating* beats disabling. The session ticket is the in-repo example: instead of baking the server-only ticket key into the harness and fuzzing ciphertext through `mbedtls_ssl_ticket_parse`, point the fuzzer at the plaintext consumer after the AEAD step: the public `mbedtls_ssl_session_load` (`ssl_tls.c:4116`). That tests robustness against corrupted serialized state or a compromised protection boundary, not remote ticket forgery. The same shape appears one layer down for encrypted PEM private keys: decryption under a passphrase, then a DER parse - except that layer now lives in the `tf-psa-crypto` submodule, so you would fuzz its DER consumer there. In either case, label the threat model and preserve the upstream postconditions.

## For stateful code, drive a sequence of messages

Some targets don't take one input and return. They take a sequence of operations and carry state between them, for example protocols, parsers with modes, anything with a create/use/destroy lifecycle. A single call barely scratches these; the bugs instead live in particular sequences and in the state one step leaves behind for the next.

Drive them with a sequence built from the input. Decode the fuzzer's bytes into a list of operations or messages and replay them in order, so the fuzzer can learn valid and invalid sequences through coverage feedback. Lay the encoding out so one byte flip changes one operation rather than reframing everything after it. Fixed-width slots or independently bounded chunks do this well; a mutable length prefix can reframe all following operations unless the harness protects or repairs it.

Keep each run independent. Reset the target's state at the start and end of every input. State that leaks between runs makes crashes non-reproducible and tanks the fuzzer's stability metric, which we covered in [#2](https://srlabs.de/blog/unlocking-secrets-effective-fuzzing-harness). And after each step, check the invariants that should always hold (the next section). That is where stateful fuzzing earns its keep.

**On Mbed TLS →** The TLS handshake *is* a state machine: a fixed exchange of messages, each valid only in certain states, with keys and parameters accumulating as it proceeds. The server harness drives it as a sequence by handing the whole record stream to `mbedtls_ssl_handshake`, which walks the states message by message via `mbedtls_ssl_handshake_step` (`ssl_tls.c:4168`). The fuzzer's bytes decide which messages arrive and in what shape, so a single input explores legal and illegal orderings alike: out-of-order messages, missing ones, malformed extensions - exactly the sequences where stateful bugs hide.

Most per-connection state is handled the right way. The connection context is created and destroyed on every input: `mbedtls_ssl_init` / `mbedtls_ssl_config_init` at the top, `mbedtls_ssl_free` / `mbedtls_ssl_config_free` at the end. `mbedtls_ssl_session_reset(&ssl)` (`fuzz_server.c:158`) wipes handshake state just before the run. Only expensive, input-independent setup is intended to be kept: the server certificate and key are loaded once behind a `static int initialized` guard (`fuzz_server.c:12`, checked at `:63`), so no attacker-controlled connection state is deliberately retained.

There's a subtlety here worth catching, and it's a good argument for reading a harness before you trust it. That same `fuzz_server.c` calls `mbedtls_x509_crt_init` / `_free` on the *static* server certificate on **every** run (`:50-51` and `:181-182`) while parsing it only under the guard. This means that the certificate is populated on the first input and freed at the end of it, and from the second input on the server is configured with an empty certificate. It does break full run-independence: the same input can behave differently depending on whether it is the first invocation or a later one. It also silently caps depth, because a certificate-based handshake can complete only on the first input of the process, and any crash that depends on that is difficult to reproduce. `fuzz_dtlsserver.c` has the same shape; the client harnesses get it right, initializing the certificate *inside* the guard and never freeing it. Static reachability cannot see this runtime-state bug, which is exactly why reading the harness and checking dynamic coverage stay part of the loop.

`dummy_init()` (`fuzz_server.c:84`) also installs a constant clock through `mbedtls_platform_set_time` (enabled by the `MBEDTLS_PLATFORM_TIME_ALT` build option set by the fuzz README), removing one source of nondeterminism from certificate-validity checks and other time-dependent branches. That does not by itself prove that the same input always follows the same path or that AFL++ stability is 100%, especially while the certificate lifecycle bug remains. Measure stability after fixing the lifecycle. The shared helpers (`dummy_init`, `dummy_send`, `fuzz_recv`, plus the pseudo-random `dummy_random` / `dummy_entropy` stand-ins, which are present but no longer wired into the TLS harnesses after the 4.x move to PSA-supplied randomness) live in `fuzz_common.{h,c}` under the `tf-psa-crypto/programs/fuzz/` submodule directory.

## Bake in the target's invariants and cross-checks

A harness that only catches crashes misses a whole class of bugs: the ones where the code returns the wrong answer without crashing. Accepting input it should reject, producing output that doesn't round-trip, two code paths quietly disagreeing - none of these trips a sanitizer, and several of them are security bugs. To catch them you add an oracle: a property you assert after the call, so a violation becomes a failure the fuzzer reports.

The cheapest oracle is an invariant, something that must always be true. After parsing, a length field must not exceed the buffer; a "valid but unsupported" result should never occur. A parsed value must obey the rules the format guarantees. Encode each as an assertion in the harness so the fuzzer treats a violation as a crash.

Richer oracles come from cross-functionality. If the target has an inverse pair, for example encode/decode or parse/serialize, assert semantic round-tripping or canonical idempotence. Byte-for-byte equality with the original input is valid only when the format promises a stable serialization. This is called a *round-trip* property, and it is a nearly free, strong check. If you have a second implementation, run both and save disagreements for triage after aligning whole-input consumption, supported features, trust policy, time and other settings. A differential mismatch is a high-value signal, not automatically a bug. And if one parsed value is consumed by several functions, inconsistent validation between them can itself be the bug.

**On Mbed TLS →** The shipped harnesses in this repo do the cheap half of this and stop. `fuzz_x509crt.c` shows the fan-out idea in miniature: after `mbedtls_x509_crt_parse` succeeds it feeds the *same* parsed certificate to a second consumer, `mbedtls_x509_crt_info`, so a certificate that parses but trips a later consumer surfaces. But that's fan-out for crashes, not an assertion. None of the in-repo TLS/X.509 harnesses check a single logic property. They catch memory bugs, but they sail right past a parser that accepts a certificate it should reject.

How this could be improved:

```c
/* A parsed sub-field must lie entirely within the cert's own raw DER. */
static int buf_within(const mbedtls_x509_buf *raw, const mbedtls_x509_buf *f) {
  uintptr_t base, fp, offset;
  if (f->len == 0 || f->p == NULL) {
    return 1;                      /* absent field: nothing to bound */
  }
  base = (uintptr_t) raw->p;
  fp   = (uintptr_t) f->p;
  if (fp < base) {
    return 0;
  }
  offset = fp - base;
  return offset <= raw->len && f->len <= raw->len - offset;
}
```

Then wire this function right after the parse succeeds:

```rust
  ret = mbedtls_x509_crt_parse(&crt, Data, Size);
  if (ret == 0) {
    for (const mbedtls_x509_crt *c = &crt; c != NULL; c = c->next) {
      if (!buf_within(&c->raw, &c->tbs)         ||
          !buf_within(&c->raw, &c->serial)      ||
          !buf_within(&c->raw, &c->sig_oid)     ||
          !buf_within(&c->raw, &c->issuer_raw)  ||
          !buf_within(&c->raw, &c->subject_raw) ||
          !buf_within(&c->raw, &c->pk_raw)      ||
          !buf_within(&c->raw, &c->v3_ext)) {
        abort();  /* a parsed field escaped the certificate it came from */
      }
    }
  }
```

This converts a latent out-of-bounds condition (a bad `{p,len}` stored but not yet read) into an immediate failure at parse time. For this representation, the containment property should hold for every accepted input, so an abort is strong evidence of a parser defect and should be minimized and reproduced before reporting.

One dangerous certificate-parser failure is not a crash: it is silently accepting a malformed certificate it should reject, or rejecting one it should accept. Nothing in the current harness catches that. Parse the same bytes with a second implementation and treat a disagreement as a case to triage:

```cpp
  /* Mbed TLS verdict, on the input as a single DER certificate. */
  mbedtls_x509_crt m;
  mbedtls_x509_crt_init(&m);
  int mbed_ret = mbedtls_x509_crt_parse_der(&m, Data, Size);
  int mbed_ok = (mbed_ret == 0 && m.raw.len == Size);
  mbedtls_x509_crt_free(&m);

  /* OpenSSL verdict on the same bytes, requiring the whole input consumed. */
  const unsigned char *p = Data;
  X509 *o = d2i_X509(NULL, &p, (long) Size);
  int ossl_ok = (o != NULL && p == Data + Size);
  if (o != NULL) {
    X509_free(o);
  }

  if (mbed_ok != ossl_ok) {
    abort();   /* save the parser disagreement for triage */
  }
```

This is one oracle that can expose semantic bugs: integer or length fields accepted out of profile, forbidden structure, a version or tag mismatch. None of which necessarily trips a sanitizer. But stacks can legitimately differ in supported features, strictness and policy, and Mbed TLS does not promise strict rejection of every non-conforming X.509 encoding. A disagreement is therefore a high-value input for investigation, not automatically a defect.

One place the project *does* write true logic oracles is its key-parsing harnesses (`fuzz_privkey`, `fuzz_pubkey`): they call `abort()` when a key that successfully *parsed* fails to *re-serialize*. `mbedtls_pk_parse_key` followed by `mbedtls_pk_write_key_der`, aborting if the write fails. That is a parse/serialize consistency oracle and a useful half of a round-trip check. They live with the `mbedtls_pk_parse_key` code they exercise, which in 4.x means in the `tf-psa-crypto` submodule, not this tree. So on the TLS and X.509 side the strong oracles are yours to add, and the library hands you the hooks:

-   **Round-trip.** Mbed TLS ships a genuine inverse pair: `mbedtls_ssl_session_load` (`ssl_tls.c:4116`) and `mbedtls_ssl_session_save` (`ssl_tls.c:4039`) (likewise `context_load` / `context_save` at `:5131` /`:4667`). Load a fuzzed blob: if it loads, save it, load the saved form again, and assert that the two generated serializations are byte-identical. That is a save→load→save idempotence check over a real binary parser, and no shipped harness in the 4.1.0 tree performs it. Remember that it tests the trusted-internal-state threat model described earlier.
-   **Differential.** Parse and verify a certificate with both Mbed TLS (`mbedtls_x509_crt_parse` → `mbedtls_x509_crt_verify`) and a second stack such as OpenSSL, align whole-input consumption and verification settings, and save disagreements for triage. A mismatch may expose the wrong-answer class a crash-only harness would miss, but it is not automatically a defect.
-   **Consistency across fan-out.** A parsed certificate feeds many accessors: `mbedtls_x509_crt_info`, `check_key_usage`, `has_ext_type`, `is_revoked`. The shipped harness exercises only the first; contract-based assertions across the others can turn inconsistent behavior into a reported failure.

Putting the pieces together, the first-pass order for this build and threat model is:

| Rank | Surface / harness | Exposure | Why now | Gap / action |
| ---: | --- | --- | --- | --- |
| 1   | X.509, CRL and PKCS#7 parser portfolio | remote peer or untrusted file, depending on the caller | nested DER, extensions and semantic decisions before signature verification | retain the parser harnesses; improve seeds and add invariants and differential triage |
| 2   | full TLS/DTLS server handshake | remote, unauthenticated peer | broad state and cross-stage interaction coverage | fix the static-certificate lifecycle and add a valid-peer path to protected stages |
| 3   | raw DTLS records and TLS 1.3 early data | remote, pre-authentication | exposed record paths missing from the shipped harness set | add focused roots at `mbedtls_ssl_check_record` and `mbedtls_ssl_read_early_data` |
| 4   | certificate verification and downstream consumers | remote peer or untrusted file, depending on the caller | trust decisions and wrong-answer bugs need stronger oracles | call verification and accessors explicitly with aligned policy inputs |
| 5   | serialized session and context loaders | corrupted trusted cache, application misuse, or compromised protection boundary | complex binary state with a distinct, valuable robustness model | add direct load/save idempotence harnesses and label the attacker model |

Change the order when your deployment changes the trust boundaries or impact. This is the first-pass plan for the example. Two things are left: confirm that the harness portfolio covers what you intended, and let a machine do as much of the remaining work as possible.

## Check your harnesses with static reachability

Once you have your ranked plan and harness portfolio, confirm that they structurally cover the surface you set out to fuzz, before you spend CPU on a campaign. Static reachability answers that cheaply: given a harness entry point, which functions can it reach? Run it per harness, union the results, and compare against your scope. Whatever is in scope but not reached may be a gap, either a missing harness, one rooted in the wrong place, or code absent from the analyzed bitcode.

This is a static, structural check. It tells you reachability, not whether the input distribution actually exercises a reached function well. That's the depth question from earlier, and the dynamic side of it is coverage analysis. The two are complementary: static reachability for breadth and possible call paths, dynamic coverage for what the fuzzer truly hit. One caveat: indirect calls, external declarations, precompiled libraries and assembly can limit the model, so inspect the report's residual and external set before treating "not reached" as proof.

**On Mbed TLS →** The [`fuzz-reachability`](https://github.com/AFLplusplus/fuzz-reachability) tool, introduced in [#8](https://srlabs.de/blog/coverage-analysis), does this for C/C++/Rust/Ziggy harnesses. Run it per harness root and union the results:

```bash
# one run per harness root (build the harnesses first, e.g. with gllvm), then union the reached sets
reachability run --lang c --project . \
  --artifact build/programs/fuzz/fuzz_server --entry LLVMFuzzerTestOneInput
```

When run against all eight shipped harnesses in the build used here, it turns the hand-drawn map into numbers. Each of the four parser harnesses statically reaches ~900–940 function definitions, and the full server harness reaches **1785** of ~2660 defined. That is the "fuzz big" argument in one figure. But these counts are build-specific. Keep the exact commits, configuration, compiler and LLVM versions, tool version, commands and JSON report with the result.

Read the output the right way and it also hands you the gaps. The tool describes its result as a *sound-leaning over-approximation*: it answers which functions can be reached, not which ones ran. Within the function bodies present in complete merged bitcode and the tool's model, a function reached by none of the harnesses is strong evidence of a structural gap; incomplete bitcode or external declarations weaken that conclusion. **Reached** is only a ceiling: the function may be barely exercised or throttled behind a filter. In this build, the set reached by none of the eight includes `mbedtls_ssl_context_load`, `mbedtls_ssl_read_early_data` (TLS 1.3 0-RTT), the PKCS#7 verify entry points, and `mbedtls_ssl_check_record`. They belong on the wider fuzzing punch list, but not all share the same remote-attacker threat model.

And it makes the depth gap concrete. `mbedtls_ssl_session_load` shows up as *reachable* from the server harness. The tool even traces the direct edge `mbedtls_ssl_ticket_parse → mbedtls_ssl_session_load`, yet it sits behind the ticket AEAD, so a remote ticket mutator never drives the plaintext deserializer meaningfully. A direct harness closes the fuzzing depth gap, but, as discussed earlier, it tests a corrupted-local-state or compromised-protection-boundary model. Certificate verification is a similar dynamic-depth problem: it is statically reachable through `mbedtls_x509_crt_verify_restartable`, behind a full handshake.

The residual in this build contains **103** functions reached only through indirect calls, including cipher info-structure targets (`aes_*_wrap`, `aria_*_wrap`, …) dispatched by pointer, plus a couple dozen libc stubs. This is a frontier to validate with dynamic coverage, not automatically a missing harness and not something to dismiss without checking. What you are left with is a breadth-and-depth checklist: surfaces covered, surfaces missing, and the residual - the artifact that tells you how complete the plan is and what remains.

## Let AI do the heavy lifting

Most of this analysis is mechanical enough that an AI assistant can do the first pass and leave you to review. That's the point of this section: not "AI replaces the analysis," but "AI does the legwork so your time goes to the judgment calls."

A capable assistant can enumerate the attack surface from headers and symbols, draft the trust model from the entry points, follow data to sinks, score and rank candidates, propose where to root and scope each harness, draft the harness definitions (entry point, mocks, guard handling, invariants), run the reachability loop, and emit a ranked plan for you to review. The discipline that makes this trustworthy is evidence: every structural claim ("this reaches that," "this is attacker-controlled") should come with a citation, a `file:line`, a reachability result, an entry-point id, and a confidence level, so you can check it instead of trusting it. Nothing gets built without your sign-off; you can veto any harness before the campaign.

But be warned: AI is often just doing the bare minimum necessary, the "simple single function" type of harness that is shallow. Use a SOTA model and pressure it to develop deep and complex harnesses with invariants.

**On Mbed TLS →** We built an AI skill that runs exactly this pipeline. On Mbed TLS it produces a ranked plan: certificate and ASN.1 parsing high, the handshake state machine high but costlier to harness, getters and configuration dropped, with each line carrying its evidence:

| Rank | Harness | Root | Exposure | Severity / rationale | Gap |
| ---: | --- | --- | --- | --- | --- |
| 1   | H-01 | `mbedtls_x509_crt_parse` | remote or local | high (nested DER/extension parsing) | existing crash-only harness; oracle gap |
| 2   | H-02 | full handshake (fuzz_server) | remote, unauth | high (state / logic) | dynamic depth gap |
| 3   | H-03 | cert differential (OpenSSL) | remote or local | high-value semantic discrepancies | new oracle |

It also drafts each harness definition. For H-01 that means extending the existing `mbedtls_x509_crt_parse` harness: no cryptographic guard handling is needed, ASan and UBSan stay enabled, and the bounds invariant is added as an oracle. It then calls the harness-writing skill to build the change, runs `fuzz-reachability` to verify structural coverage, and writes a closure report that routes the indirect-call residual to coverage analysis. You review the plan, reorder or veto, and only then does it build. The skill is an accelerator, not an oracle: fast and consistent, but you still decide whether the trust model is right and whether the ranking matches the risk you care about.

## Conclusion

Someone hands you a large, unfamiliar codebase and asks you to fuzz it. On a small target the answer is obvious; on a complex one, finding it *is* the work, and it happens before the first harness. The elephant doesn't shrink — you just stop trying to swallow it whole and decide which bite comes first.

Start from a threat model: name what's untrusted before you rank anything, because a byte an attacker can't influence isn't worth a CPU-second. Map the whole surface that untrusted input can reach, then follow the data from each entry point to where it gets dangerous — the copy, the allocation, the index sized from input. That sink focus tells you which surface pays off, where to scope a harness, and what it must satisfy to get there.

Two ideas turn that list into a plan that finds bugs instead of burning machines. First, **reachable is not fuzzed**: a function behind a signature check or a decryption step is reachable on paper and untouched in practice. Close that depth gap deliberately — start past the filter, or model the peer that satisfies it — but only feed values a real input could produce, or you'll triage crashes that can't happen. Second, **go big, then round it out**: a realistic end-to-end harness finds the cross-stage and state bugs one-function harnesses miss, and it belongs at the center of a portfolio with focused harnesses that add local depth and stronger oracles. Shape each to its surface — entry point, checks, statefulness, invariants — then confirm scope with static reachability and execution with dynamic coverage.

So don't fuzz the first function you see. Spend an hour on the trust model and the data flow, and the target's size stops being intimidating — it becomes a checklist, and you fuzz the right things, in the right order, with harnesses that reach the bugs.

This post is the upstream of the rest of the series: once you've decided what to fuzz and how to shape it, write each harness with [#2](https://srlabs.de/blog/unlocking-secrets-effective-fuzzing-harness), and after the campaign, close the dynamic gap with coverage analysis [#8](https://srlabs.de/blog/coverage-analysis).

*Special thanks to Lara Kaiser, Cayo Fletcher-Smith and Constantin Schwarz for their feedback!*

## Further reading

-   [Mbed TLS](https://github.com/Mbed-TLS/mbedtls) - the library used as the running example; its harnesses live in `programs/fuzz/`
-   [AFLplusplus/fuzz-reachability](https://github.com/AFLplusplus/fuzz-reachability) - static reachability for C/C++/Rust fuzz harnesses: which functions a root can reach, with the residual broken out
-   [AFLplusplus/cov-analysis](https://github.com/AFLplusplus/cov-analysis) - dynamic coverage reports and diffs, the companion to static reachability ([#8](https://srlabs.de/blog/coverage-analysis))

* * *

## What We’ve Covered and What’s Ahead

Missed an article? Here’s the list:

✅ #0: [Fuzzing Made Easy: Outline](https://srlabs.de/blog/fuzzing-made-easy-outline)

✅ #1: [How to write a harness](https://srlabs.de/blog/guide-to-writing-fuzzing-harness)

✅ #2: [Unlocking the secrets of effective fuzzing harnesses](https://srlabs.de/blog/unlocking-secrets-effective-fuzzing-harness)

✅ #3: [GoLibAFL: Fuzzing Go binaries using LibAFL](https://srlabs.de/blog/golibafl---fuzzing-go-binaries-using-libafl)

#4: How to write harnesses for Rust and Python and fuzz them

✅ #5: [How to decide what to fuzz in a complex target](https://srlabs.de/blog/decide-what-to-fuzz)

#6: The different types of fuzzing harnesses

#7: Effective Seeding

✅ #8: [How to perform coverage analysis](https://srlabs.de/blog/coverage-analysis)

#9: Correctly minimizing corpora

#10: How to run fuzzing campaigns

#11: Continuous fuzzing campaigns

#### Special Fuzzing Targets

✅ #1: [Fuzzing CosmWasm Smart Contracts](https://srlabs.de/blog/cosmwasm)
