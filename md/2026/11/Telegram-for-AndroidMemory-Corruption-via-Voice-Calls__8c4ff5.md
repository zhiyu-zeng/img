---
title: Telegram for Android:Memory Corruption via Voice Calls
source: https://nebusec.ai/research/telegram-android-call-memory-corruption/
source_host: nebusec.ai
clip_date: 2026-11-06T15:08:11+08:00
trace_id: 8f32d146-7bc4-4b86-a983-ba0e3b9ad138
content_hash: 326c31215724237bf15c7deea87e30a544775b6901f279dabf55ae6c0a2a9029
status: synced
tags: []
series: null
feed_source: NebuSec
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41075244-d011-8196-9f06-e90db5ee58cf
ioc: null
---

The NebuSec research team discovered a remotely triggerable native memory corruption flaw in Telegram for Android, demonstrating how subtle coding errors can expose significant security risks in widely used applications.

The vulnerability affects Telegram for Android versions 8.6.2 through 12.10.3 and resides in the application’s native C++ calling implementation.

The only thing an attacker needs to trigger the flaw? A standard Telegram account. This means the victim just has to answer an incoming private voice call: No malicious link, download or other interaction is required.

Telegram addressed the issue in version 12.10.4, released on September 24, 2026.

The discovery highlights how subtle errors in application logic can create security risks in widely used software, and the role AI-driven vulnerability research can play in identifying them. At NebuSec, we’re addressing this challenge by combining AI-driven vulnerability discovery with the expertise of some of the world’s leading security researchers. Our platform is designed to help organizations continuously identify, verify and remediate vulnerabilities across complex software environments and code.

## Understanding the Vulnerability

The vulnerability is in how Telegram handles the signaling of messages exchanged during private voice calls.

In other words, when a private voice call is established, Telegram exchanges messages describing the call’s media state. The same message also carries optional video settings, including camera state and rotation, even when the call begins as audio-only. One of these messages, `MediaState`, is processed by a native C++ function called `MediaStateMessage_parse()`.

We identified an error in how this function handles certain missing data fields. Specifically, the parser permits a `MediaState` message to omit the `videoState` field. However, when processing the `videoRotation` field, the code incorrectly attempts to access `videoState` even when that field is absent.

The result? An invalid C++ object access and virtual function call, creating a native memory corruption vulnerability that can cause the victim’s Telegram application to crash.

The issue is present in both the primary calling implementation (`tgcalls/v2/Signaling.cpp`) and a compatibility implementation (`tgcalls/v2_4_0_0/Signaling_4_0_0.cpp`).

This type of vulnerability illustrates why only identifying common coding mistakes isn’t enough. Effective code security requires a deeper understanding of how application logic, memory management and attacker-controlled inputs interact to create exploitable conditions.

## How the Vulnerability Can Be Triggered

The attack requires minimal interaction between the attacker and victim.

Here’s how it happens: An attacker initiates a private Telegram voice call using a standard account. Once the victim answers and the call is established, the attacker can send a specially crafted `MediaState` message through the encrypted SCTP DataChannel used for call signaling. The malformed message reaches Telegram’s C++ calling stack, where the vulnerable parser processes it.

Unlike attacks that depend on phishing links or malicious attachments, this vulnerability can be triggered through normal call functionality. The attacker doesn’t need privileged access or control over Telegram’s infrastructure.

We confirmed the vulnerable code path in private voice calls on ARM64-based Android devices.

The demonstrated impact is remotely triggered native memory corruption and application crashes. The underlying invalid-object access could potentially serve as a building block in a more complex exploit chain.

For security teams, this reinforces the importance of evaluating vulnerabilities based on real-world exploitability, not just whether a coding error exists. Understanding how a vulnerability can be reached, triggered and potentially exploited is essential to prioritizing security risks.

## Root Cause: An Incorrect Field Reference

The root cause is a field-reference error in the signaling parser.

When processing `videoRotation`, the implementation incorrectly accesses `videoState->second.int_value()` instead of `videoRotation->second.int_value()`.

If `videoState` is absent, its iterator points to `std::map::end()`. The parser then attempts to interpret memory beyond the container’s valid elements as a `json11::Json` object and invoke a virtual function on it.

This creates an invalid-object dereference and virtual dispatch operation that can be triggered remotely through a crafted signaling message.

The fix was straightforward: Telegram replaced the incorrect `videoState` references with the correct `videoRotation` references in both parser implementations.

Although the underlying coding error was small, its location in the native calling stack made it remotely reachable through a routine application feature.

## Affected Versions and Remediation

The vulnerable source code was first introduced into Telegram’s repository in version 7.8.0, released June 25, 2021. However, the affected v2 calling implementation wasn’t yet enabled on Android at that time.

The vulnerable code path became reachable in Telegram for Android version 8.6.2, released March 20, 2022, and remained present through version 12.10.3, released September 17, 2026.

Telegram corrected the issue in version 12.10.4 (build 7099), released September 24, 2026.

The confirmed scope of the research is limited to private voice calls on Telegram for Android ARM64 devices. There is currently no evidence establishing that the vulnerability also affects iOS, desktop applications or group calls.

No public CVE has been identified for the issue. Users should update Telegram for Android to version 12.10.4 or later to ensure the vulnerability code has been patched.

## Why Traditional Code Security is Falling Behind

The Telegram vulnerability reflects a broader challenge: The pace of code creation is moving faster than the ability of security teams to review and validate it.

AI-powered development tools are accelerating how quickly organizations write and ship software. But faster development doesn’t mean more secure code. According to [Sonar’s 2026 State of Code Developer Survey](https://www.sonarsource.com/blog/state-of-code-developer-survey-report-the-current-reality-of-ai-coding/), AI now accounts for 42% of committed code among surveyed developers, yet only 48% report always verifying AI-generated code before committing it.

The security implications are significant. [Veracode’s 2026 GenAI Code Security Report](https://view.ceros.com/veracode/genai-code-security-report2026/p/1) found that approximately 44% of AI code-generation tasks produced code containing a known vulnerability under its testing conditions.

At the same time, attackers are using AI to accelerate vulnerability discovery and exploitation. [Microsoft’s 2026 Digital Defense Report](https://www.microsoft.com/en-us/security/security-insider/threat-landscape/2026-digital-defense-report) highlights how AI is compressing the time between vulnerability discovery and weaponization, putting additional pressure on already stretched security teams.

The challenge is no longer just finding vulnerabilities. It’s finding, verifying and fixing them at the same pace that software and code are developed. The Telegram vulnerability is a prime example of how a small implementation mistake can introduce a remotely reachable security weakness. The flaw didn’t originate in a complex authentication mechanism or a sophisticated protocol design failure. It resulted from an incorrect field reference in a native C++ parser.

But because the vulnerability code processes data received from another participant during a voice call, an attacker could reach it through ordinary application functionality. This creates a broader challenge in complex software environments. Traditional point-in-time security assessments can’t keep up with new gaps, vulnerabilities and code changes as applications evolve.

We have the solution. Our AI-native platform is designed to help organizations continuously identify and remediate vulnerabilities.

We combine:

1.  **Continuous vulnerability scanning:** Daily scanning of source code to identify vulnerabilities as codebases evolve.
2.  **Verified security findings:** Analysis focused on establishing whether vulnerabilities are real and actionable, helping teams prioritize meaningful risks.
3.  **AI-powered patch generation:** Remediation recommendations and patches delivered through pull requests to help accelerate fixes.
4.  **Continuous validation:** A closed-loop process in which patches re-enter the scanning workflow to support ongoing security assurance.

## From Vulnerability Discovery to Remediation: The NebuSec Approach

The Telegram discovery demonstrates the security expertise behind NebuSec’s AI-native platform. Built by researchers from a world-leading competitive hacking team, NebuSec combines advanced AI techniques with deep experience identifying and exploiting vulnerabilities in complex environments. Our team’s research spans widely deployed technologies, including the Linux kernel and Google Chrome.

We bring this expertise to a unified security platform that combines white-box code security, AI penetration testing, secrets scanning and supply chain security. Our code security capabilities continuously analyze source code, validate findings and generate patches as pull requests, while AI penetration testing identifies and verifies potential attack chains.

Our goal is to help organizations address security weaknesses across both the code they develop and the systems they deploy.

[Explore the NebuSec platform](https://nebusec.ai/) and learn how continuous vulnerability discovery and remediation can strengthen your application security.

## Further Reading

-   The Hacker News: [Telegram Android Flaw Lets Attackers Run Code When Users Answer Voice Calls](https://thehackernews.com/2026/10/telegram-android-flaw-lets-attackers.html)
