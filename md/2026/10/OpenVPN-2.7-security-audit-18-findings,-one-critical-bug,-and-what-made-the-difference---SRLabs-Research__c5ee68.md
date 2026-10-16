---
title: "OpenVPN 2.7 security audit: 18 findings, one critical bug, and what made the difference - SRLabs Research"
source: https://srlabs.de/blog/openvpn-audit
source_host: srlabs.de
clip_date: 2026-10-16T10:32:43+08:00
trace_id: fac55673-4861-42a8-a01e-9b8f960d36d3
content_hash: e93ae32903ac924cb05adee34b4f3703b530b80ba299101363b232fdd228c966
status: synced
tags:
  - 漏洞分析
  - 安全工具
series: null
feed_source: SRLabs·模糊测试/漏洞审计
ai_summary: SRLabs 对 OpenVPN 2.7 发布候选版审计 16 周，发现 18 个问题，其中一行逻辑取反造成严重未认证 DoS。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fb75244-d011-8176-b7d1-fa7ad96bd941
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> SRLabs 对 OpenVPN 2.7 发布候选版审计 16 周，发现 18 个问题，其中一行逻辑取反造成严重未认证 DoS。
> 
> - **核心漏洞：** 会话 ID/重放校验中 `memcmp_constant_time` 返回 0 表示匹配，代码却把非零（不匹配）当作通过；多候选 HMAC 下至少一个必然不匹配，导致任意伪造 session ID 的 UDP 包被接受、合法重放被拒，攻击者无需凭据或 TLS 握手即可耗尽服务端半开会话；该缺陷自 2022 年 5 月引入，数日内修复。
> - **问题分布：** 1 严重、4 中危（PKCS11 证书反序列化堆溢出、AEAD 用量上限少计延迟密钥轮换、DNS 域名转换越界写、预认证 UDP 洪泛）、9 低危、4 信息级；Windows Interactive Service（以 SYSTEM 运行）占三分之一以上，其余集中在配置/输入解析。
> - **审计方法：** 先用 STRIDE 建立威胁模型并给攻击场景评可行性，再叠加针对性人工审查、新增三个 fuzz harness（`fuzz_tls_pre_decrypt_lite`、`fuzz_tls_pre_decrypt`、`fuzz_options`，开 ASan/UBSan）、weggli-rs/semgrep/cppcheck 自定义规则，最后用 LLM 复核兜底。
> - **复现模式：** 字节数与字符数混用（`FormatMessageW` 传 `sizeof(buf)` 致栈溢出）、比较语义取反、前缀匹配代替路径校验（`C:\openvpn_plugins_evil` 绕过、pull filter 加一个空格绕过）。
> - **交付与修复：** harness 迁入 OpenVPN 仓库并纳入 CI、交付威胁模型文档与静态分析规则/扩充编译器告警清单；18 个问题中 14 个在审计期内已修复，2.7 正式版包含全部重要修复。

![](https://srlabs.de/img/assets/authors/srl_headshot_marc_heuse-320.c5b3b05101.avif)

### Key takeaways

-   Prior audits and continuous fuzzing help, but they do not prove the absence of high-impact bugs, nor that new bugs are not introduced. We found 18 issues in the release candidates of OpenVPN 2.7, including one critical logic flaw.
-   The critical issue was a one-line logic inversion in a replay/session-ID check that enabled unauthenticated denial of service against OpenVPN servers that was introduced in May 2022.
-   Findings concentrated in components around the protocol, especially the Windows Interactive Service running as SYSTEM, and in configuration/input parsing.
-   Our approach was threat-model driven and deliberately deep: targeted manual review, new fuzzing harnesses for previously uncovered entry points, and focused static analysis.
-   We delivered audit infrastructure, not only a report: fuzz harnesses, threat model artefacts, and rule sets intended to remain useful after the engagement.
-   OpenVPN 2.7 shipped with all important fixes applied.

Have a look at our [audit report](https://github.com/srlabs/audit-reports/blob/main/Open_Technology_Fund/SRL-OpenVPN-Code_Assurance_OpenVPN_2.7.0.pdf)

## Starting assumptions

When the [Sovereign Tech Agency](https://www.sovereign.tech/), in cooperation with the [Open Technology Fund](https://www.opentech.fund/), asked us to perform a comprehensive security audit of the release candidates of OpenVPN v2.7, we were super excited. OpenVPN is the world's most deployed open-source VPN solution amd millions of users rely on it daily. This was a high-impact engagement.

OpenVPN isn't fresh code - it is battle-tested software with a long history of security scrutiny. Audits in 2017 [1](#fn:1) and 2023 [2](#fn:2) by excellent and respected auditors yielded mostly low severity and informational findings. Additionally, Google's open-source fuzzing infrastructure `oss-fuzz` was fuzzing OpenVPN for years. We braced ourselves for weeks of staring at clean code with nothing to show for it.

We were wrong.

## A one-line logic inversion in a security check

Within the first weeks, findings started surfacing. Not just minor code quality nits but real vulnerabilities with real impact. The most dramatic one was hiding in plain sight, in a single line of code:

```c
struct session_id expected_id =
    calculate_session_id_hmac(state->peer_session_id, from, hmac,
    handwindow, offset);

if (memcmp_constant_time(&expected_id, &state->server_session_id, SID_SIZE))
{
    return true;
}
```

`memcmp_constant_time` - OpenSSL's constant-time comparison function - returns 0 on match. The `if` statement treats a non-zero return (meaning the values *don't* match) as success. The means that the logic we see here is inverted.

One reason this survived in practice is that the code compares against multiple possibly-correct HMAC keys. The intended logic is "accept if any comparison matches". With the inverted semantics, the effective logic becomes "accept if any comparison does not match" — and with more than one candidate, at least one will always not match.

The consequence is dire: every spoofed UDP packet with a *wrong* session ID passes the replay security check. Every legitimatly replayed packet with the *correct* session ID gets rejected. An unauthenticated attacker can flood a server with spoofed packets from arbitrary source IPs, each one accepted and allocated as a half-open session, exhausting server resources, no credentials or TLS handshake needed. Just raw UDP packets with garbage session IDs.

This check is part of the replay/session-ID handling intended to reject unauthenticated traffic early. In this case it did the opposite.

We reported the issue immediately. OpenVPN fixed it within days. The bug had been in the code since May 2022.

## The full picture

Over 16 weeks, our team of four researchers identified 18 issues in the release candidates for OpenVPN 2.7, of which all important ones were fixed in the v2.7 release:

-   **1 Critical:** The inverted session-ID replay firewall
-   **4 Medium:** A heap buffer overflow in PKCS11 certificate deserialization, undercounted AEAD usage limits delaying key rollover, out-of-bounds writes in DNS domain conversion, and a pre-auth UDP flooding DoS
-   **9 Low:** Including a trivially bypassed pull filter (add a space!), a case-insensitive CCD hijack, a stack overflow in the Windows error handler, a named pipe accepting remote clients, and several routing corruption vectors
-   **4 Informational:** Logic inversions, null pointer dereferences, and a blocking PAM configuration

Most issues clustered in two areas: the Windows Interactive Service and configuration/input parsing. The Windows Interactive Service alone accounted for over a third of all findings. It runs as SYSTEM — the highest privilege level on Windows — and accepts messages from unprivileged users through a named pipe. It had byte/character confusion bugs, missing access controls, incorrect metric restoration logic, and a predictable pipe name. This component clearly hadn't received the same scrutiny as the core protocol. Also it was new code - previous audits would clearly have found these issues.

The core protocol and transport security properties held up well. The issues we found were primarily in code around the protocol: services, parsers, and platform-specific glue.

## Why we still found high-impact issues

Two respected firms audited this codebase before us and found only low-severity issues. We don't think they did bad work, and a lot of code was added after the last audit. However we think the difference comes down to two factors: team composition and methodological depth.

### 1\. A team with different lenses

Our four-person team brought complementary backgrounds: fuzzing and dynamic analysis, Windows internals and service security, protocol analysis, reverse engineering experience, and cryptographic implementation review. When different people look at the same code through different lenses, they find different bugs.

The Windows Interactive Service is a perfect example. If your team is primarily focused on protocol-level analysis and cryptographic correctness, you might treat the Windows service as plumbing — not the interesting part. Our team had two people who looked at that plumbing with the same intensity others reserved for the TLS handshake. That's where the findings were hiding.

### 2\. Depth driven by a threat model

We didn't directly start with code, instead we started with building a comprehensive threat model.

Using the STRIDE framework, we worked with OpenVPN's developers to map every component, trust boundary, and interaction in the system. We identified concrete threat scenarios - not abstract categories, but specific attacks like "an attacker spoofs UDP packets to exhaust server sessions" or "a local user sends crafted messages to the Interactive Service pipe to escalate privileges." Each scenario got a feasibility rating and a severity calculation.

This threat model became our roadmap. Instead of reading code linearly from top to bottom, we knew exactly which functions to scrutinize and what kind of bugs to look for. The session-ID replay firewall? High priority — it's the first line of defense against unauthenticated attackers. The Interactive Service message handler? High priority — it crosses a privilege boundary. The PKCS11 deserialization code? Medium priority — it processes potentially attacker-influenced input.

From there, we layered multiple analysis techniques:

**Targeted manual code review** guided by the threat model. This is where most findings came from. The inverted comparison, the byte/char confusion, the pull filter bypass — these are logic bugs that no automated tool catches reliably. You find them by understanding what the code is supposed to do and noticing when it doesn't.

**Custom fuzzing harnesses** for previously untested entry points. OpenVPN had existing fuzz harnesses on Google's oss-fuzz, but some didn't compile and they covered a small subset of functionality. We wrote three new harnesses — `fuzz_tls_pre_decrypt_lite`, `fuzz_tls_pre_decrypt`, and `fuzz_options` — targeting remotely accessible entry points that had never been fuzz-tested. We ran them with AddressSanitizer and UndefinedBehaviorSanitizer enabled to catch memory corruption and undefined behavior.

**Static analysis** with weggli-rs, semgrep, and cppcheck using custom rule sets for C security patterns. We also inspected OpenVPN's compiler warning configuration and found it was limited to just `-Wsign-compare` and `-Wuninitialized`. Modern compilers offer many more security-relevant warnings — we compiled a list of additional checks and shared it with the team.

**LLM-assisted review** as a final safety net. After completing manual review, we ran the codebase through current state-of-the-art AI benchmarked for C vulnerability detection. This served as a guard against human tunnel vision — a way to catch anything we might have overlooked after weeks of staring at the same code.

Each layer caught things the others missed. No single technique would have found all 18 issues, the combination though did.

## Patterns worth noting

Several patterns emerged across our findings that are worth highlighting for anyone maintaining complex C codebases.

### Byte vs. character confusion

Multiple functions in the Windows Interactive Service mixed byte counts and character counts when working with wide strings. `GetItfDnsDomains` used `buf_size` (bytes) where it should have used character counts, leading to out-of-bounds writes. `BlockDNSErrHandler` passed `sizeof(buf)` to `FormatMessageW`, which expects a character count — doubling the effective buffer size and enabling a stack overflow. This class of bug is endemic to Windows C code that mixes `WCHAR` and byte-oriented APIs. It's easy to introduce and hard to spot without focused review.

### Inverted logic in security checks

The critical session-ID bug wasn't the only inverted comparison. The DNS undo logic in `HandleDnsConfigMessage` had an inverted ternary that cleared IPv6 addresses when configuring IPv4 and vice versa. These inversions suggest that comparison semantics - what does 0 mean, what does non-zero mean - deserve explicit attention during code review, especially in security-critical paths.

### Prefix matching isn't path validation

The plugin trusted-directory check used `wcsnicmp` with the length of the trusted path as a prefix match. If the trusted directory was `C:\openvpn_plugins` (without a trailing backslash), a sibling directory `C:\openvpn_plugins_evil` would pass the check. Similarly, the pull filter reject mechanism used `strncmp`, allowing a malicious server to bypass any reject filter by inserting an extra space before the filtered parameter. Prefix matching is a recurring source of bypass vulnerabilities in path and string validation.

### Neglected platform-specific code

The Windows Interactive Service was clearly the least scrutinized component. It's a privileged service handling messages from unprivileged users — exactly the kind of trust boundary where bugs have the most impact. The named pipe accepted remote clients and used a predictable thread ID in its name. The WFP block cleanup restored metrics to the wrong interface. Multiple functions had memory safety issues. Platform-specific code often gets less attention than cross-platform core logic, but it frequently has the highest privilege and the weakest review.

## Beyond the report

We wanted this engagement to leave OpenVPN better off than just a list of bugs to fix. Security audits are point-in-time snapshots. The real value comes from infrastructure that keeps working after the auditors leave.

**Fuzzing harnesses.** Our three custom harnesses were migrated into the OpenVPN repository. We also patched the existing oss-fuzz harnesses that had compilation errors. Then we moved the harnesses from the oss-fuzz repositories to the OpenVPN controlled repo, and ensured that all fuzzing harnesses build in the CI. This way oss-fuzz fuzz testing of OpenVPN never breaks.

**Threat model.** We delivered a comprehensive threat model document that maps STRIDE categories to concrete attack scenarios with feasibility ratings. OpenVPN's developers can use this as a starting point when designing new features — thinking about threats before writing code, not after.

**Static analysis suite.** We shared our custom rule sets and the expanded compiler warning list. Integrating these into CI ensures that common vulnerability patterns are caught automatically before they reach production.

**Recommendations adopted.** OpenVPN is planning to introduce state machine abstractions for the complex connection initiation pipeline, expand their unit test coverage with a security focus, and integrate the newer fuzzing harnesses into continuous testing.

## Collaboration matters

We used a dedicated private GitHub repository for findings, a Signal group for asynchronous communication, and biweekly sync meetings. Every finding was reported immediately with a detailed description and mitigation recommendation. When OpenVPN implemented fixes, we verified them to be complete.

The result: 14 of 18 findings were already remediated during the engagement. The OpenVPN team was responsive, engaged, and genuinely invested in getting things right before the v2.7 release. That kind of collaboration is what makes security audits actually improve software, rather than just producing shelf-ware reports.

> *The OpenVPN community is extremely grateful for the work done by SRL, which allowed us to resolve important issues before releasing the long awaited new major version: 2.7. The audit was conducted with rigor and communication has been excellent throughout the work, which made triaging and fixing discovered bugs much smoother than one could expect.*

*Antonio Quartulli, Core Contributor*

## What this means

Mature code isn't secure code. Prior audits don't guarantee completeness. A codebase can pass multiple security reviews with flying colors and still contain critical vulnerabilities. Code is a moving target.

The value of a security audit scales with the depth of the methodology and the diversity of the team, not just the hours spent or the reputation of the firm, or the AI models used. Starting with a threat model, layering manual review with fuzzing and static analysis, and having team members who bring different perspectives to the same code: that's what finds the bugs that matter.

OpenVPN's transport security held up. The protocol is sound. But the implementation around it - the services, the parsers, the platform code - needed work. That work is now largely done, and the infrastructure we left behind will help keep it that way.

We're grateful to the Sovereign Tech Agency and the Open Technology Fund for sponsoring this work, and to the OpenVPN team for their openness and collaboration throughout. Open-source security audits funded by public institutions are one of the most effective investments in internet infrastructure. This engagement proved it.

* * *

*The full audit report (v1.0-FINAL) was delivered to OpenVPN on March 23, 2026. The assessment team consisted of Aarnav Bos, Genco Altan Demir, Marc "vanHauser" Heuse, and Stephan Zeisberg.*

The audit report is available at [https://github.com/srlabs/audit-reports/blob/main/Open_Technology_Fund/SRL-OpenVPN-Code_Assurance_OpenVPN_2.7.0.pdf](https://github.com/srlabs/audit-reports/blob/main/Open_Technology_Fund/SRL-OpenVPN-Code_Assurance_OpenVPN_2.7.0.pdf)
