---
title: macOS.Gaslight | Rust Backdoor Turns Prompt Injection on the Analyst, Not the Sandbox
source: https://www.sentinelone.com/labs/macos-gaslight-rust-backdoor-turns-prompt-injection-on-the-analyst-not-the-sandbox/
source_host: www.sentinelone.com
clip_date: 2026-09-18T10:55:29+08:00
trace_id: 6a8a5a53-b555-4a16-8473-f824e01ffe9d
content_hash: 55a55132f4dedc20233994a526696105790eaae5dc5d54ce9cdcf361c24b6df3
status: synced
tags:
  - 恶意样本
  - AI辅助逆向
series: null
feed_source: SentinelLabs
ai_summary: macOS.Gaslight 是朝鲜相关的 Rust macOS 植入体，把 3.5 KB 提示注入对准 AI 分诊分析师而非沙箱，靠 Telegram C2 实现持久化窃密。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 0
  failed_urls:
    - https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_1.jpg
    - https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_6.jpg
    - https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_2.jpg
    - https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_8.jpg
    - https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_7.jpg
    - https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_5.jpg
    - https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_4.jpg
    - https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_9.jpg
    - https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_3.jpg
notion_page_id: 3df75244-d011-8191-bd76-e0632b6a3493
ioc:
  cves: []
  cwes: []
  hashes:
    - 5555494492fc075f441637fb9d894913dde3a2ea
    - 6328567511d88fdc2ae0939c5ef17b7a63d2a833881900de018a4f12f4982525
    - 77b4fd46994992f0e57302cfe76ed23c0d90101381d2b89fc2ddf5c4536e77ca
    - baabf249c77bc54c54ab0e66e15af798bd28aa5b4683554456a8b73ab8741239
    - e4503e31d5a297d93ade64f50a5b5fe91e73dad251ac2615b4c975684f68e080
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> macOS.Gaslight 是朝鲜相关的 Rust macOS 植入体，把 3.5 KB 提示注入对准 AI 分诊分析师而非沙箱，靠 Telegram C2 实现持久化窃密。
> 
> - **C2 通道：** Telegram Bot API `getUpdates` 轮询，AES-GCM（aes-gcm 0.10.3，每条消息新 nonce）加密载荷，证书固定（`SecTrustSetAnchorCertificatesOnly`）使常规代理 CA 无法解密；读取系统代理（`SCDynamicStoreCopyProxies`）以穿透企业网络；并用 `Conflict` 错误码当作单实例锁，第二份副本自终止。
> - **操作能力：** 验证激活后提供交互式 shell，六条命令 help/id/shell/kill/upload/stop（疑似还有第七条 focus）；用 `IOPMAssertionCreateWithName` 阻止系统休眠以维持长期轮询与采集。
> - **配置与持久化：** serde 反序列化 15 字段配置（tg_room_id、aes_key、payload_path_*、persist_enable 等）以明文内嵌，含未启用的 Linux/GitHub 字段；经 LaunchAgent 持久化，Label 伪装为 `com.apple.system.services.activity`，运行时用 `__NSGetExecutablePath` 写入自身真实路径。
> - **收集模块：** 6.6 KB base64 Python 窃密脚本，采集 Chrome/Brave/Firefox/Safari 数据、终端历史、已装应用、`ps aux` 进程快照、`system_profiler` 与 `login.keychain-db`，打包为 temp/collected_data.zip 经 Telegram 回传；另有 2 KB bash 安装器从 astral-sh/python-build-standalone 按需拉取 CPython 3.10.18。
> - **提示注入 OPSEC：** 38 条伪造 system 消息以 `{{DATA}}` 与 Markdown 围栏模仿 LLM 分析框架，虚构 token 过期、OOM、磁盘耗尽与注入告警，诱导模型中止或拒绝分析；Telegram URL 构造器把 token 替换为 `file/token:redacted` 自我脱敏，防止日志/崩溃产物泄露凭据；归因朝鲜（XProtect MACOS_BONZAI_COBUCH）。

## Executive Summary

-   SentinelLABS has analyzed a Rust macOS implant that embeds a 3.5 KB prompt-injection payload of 38 fabricated “system” messages, built to steer an LLM-assisted triage pipeline into aborting or refusing its analysis.
-   Command-and-control runs over a Telegram Bot API polling loop, with AES-GCM payloads over certificate-pinned TLS.
-   The implant self-redacts its Telegram bot token in its own runtime output, denying it to anyone who captures logs or crash artifacts.
-   We assess with high confidence that the implant, which we track as macOS.Gaslight, belongs to a cluster of DPRK-aligned macOS activity.

## Introduction

In early June, an Apple XProtect update surfaced a Mach-O sample that had been uploaded to VirusTotal on May 22. The XProtect rule targets the file purely on its hash rather than on any internal strings or bytecode, yet the sample remains undetected by static engines on VirusTotal at the time of writing. The binary is ad hoc signed and carries the identifier `endpoint-macos-aarch64-5555494492fc075f441637fb9d894913dde3a2ea`.

![⚠️ 图片托管失败 · macOS.Gaslight sample on VirusTotal Jun 23, 2026](https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_1.jpg)

macOS.Gaslight sample on VirusTotal Jun 23, 2026

The sample is a macOS implant and infostealer written in Rust. Its most notable feature is an embedded cascade of fabricated system-failure messages, designed to make an LLM-assisted triage agent doubt its own session. It attacks the agent’s perception, rather than the sandbox it runs in. Accordingly, we dub this family macOS.Gaslight.

![⚠️ 图片托管失败 · Some of the many fake LLM data messages embedded in the binary](https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_6.jpg)

Some of the many fake LLM data messages embedded in the binary

We assess with high confidence that this implant sits within a cluster of DPRK-aligned macOS activity. Apple’s XProtect detects the sample under the rule MACOS_BONZAI_COBUCH, and SentinelLABS associates the BONZAI signature family with North Korean threat activity. A sibling BONZAI sample is additionally caught by Apple’s AIRPIPE rule, a family SentinelLABS likewise ties to North Korean activity.

## Command & Control | Telegram Bot API

The implant’s command-and-control channel is a Telegram Bot API `getUpdates` polling loop. The polling branch executes only when no webhook is registered, and the dispatch handler keys on three Telegram error codes: `BotBlocked`, `InvalidToken`, and `Conflict`.

Telegram issues a `Conflict` response when two instances of the same bot token poll simultaneously, so the implant treats that response as an implicit single-instance lock. A second copy detects the conflict and terminates.

![⚠️ 图片托管失败 · Handling the Telegram Bot API error codes](https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_2.jpg)

Handling the Telegram Bot API error codes

Once the bot token validates and the polling loop is active, the operator can task the implant, including through the interactive shell described below, and collected data is returned over the same channel using Telegram’s multipart `attach://` file-upload mechanism.

The bot token, the chat ID (`tg_room_id`), and the rest of the operator configuration are supplied at runtime and are absent from this sample. Accordingly, the analysis below is based on static examination of the binary and its embedded payloads.

## Transport Hardening | AES-GCM Over Pinned TLS

All C2 payloads are encrypted with AES-GCM, implemented using the pure-Rust `aes-gcm` 0.10.3 crate, with a fresh nonce generated per message via `CCRandomGenerateBytes`. The AES key is supplied at runtime through the `aes_key` field in the operator config rather than being embedded in the sample.

On top of the payload encryption, the implant configures a custom certificate trust anchor and calls `SecTrustSetAnchorCertificatesOnly`, restricting TLS trust evaluation to that anchor alone. This certificate pinning rejects connections intercepted by a standard proxy CA, frustrating network-level inspection of the operator’s traffic.

![⚠️ 图片托管失败 · Custom certificate pinning via SecTrustSetAnchorCertificatesOnly](https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_8.jpg)

Custom certificate pinning via SecTrustSetAnchorCertificatesOnly

The implant also honors the host’s proxy settings, reading the active system proxy configuration via `SCDynamicStoreCopyProxies` and routing the traffic from its Rust `reqwest/hyper` networking stack accordingly. As a result, the C2 can still reach the operator on networks that force outbound connections through a proxy.

Taken together, those choices make the channel harder to inspect in transit while still allowing it to operate in tightly managed enterprise networks.

## Operator Access | An Interactive Shell

After validation and activation, the operator gains an interactive shell. Two co-located command menus define six verbs.

|     |     |
| --- | --- |
| **Verb** | **Function** |
| help | Show command help |
| id  | Identify the implant to the operator |
| shell | Execute a shell command via execvp, with posix_spawnp available as an alternative spawn path |
| kill | Terminate a target process by PID |
| upload | Exfiltrate a file via the Telegram file-attach mechanism |
| stop | Halt the implant |

There is some evidence of a seventh command, `focus`, but we were unable to recover further details from our analysis.

![⚠️ 图片托管失败 · Operator command menu strings embedded in the implant](https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_7.jpg)

Operator command menu strings embedded in the implant

The implant creates an `IOPMAssertionCreateWithName` power-management assertion to prevent system sleep. Blocking sleep sustains long-running C2 polling and collection across periods of user inactivity, making the implant resilient to a host that would otherwise idle.

All told, the functionality provides the operator with a persistent, interactive foothold on the host.

## The 15-Field Cross-Platform Operator Config

The implant reads its operator configuration using [serde](https://docs.rs/serde/latest/serde/), a widely used Rust serialization and deserialization framework.

The operator provides the implant with a config blob at runtime and `serde` fills in a predefined set of fields. By default, `serde` matches incoming config keys to fields by their literal names, so the entire configuration schema of 15 field names is baked into the binary as plaintext.

```
tg_room_id           	
github_token         	
github_repo          	
github_polling_interval 
main_upload_url      	
main_base_url        	
aes_key              	
payload_path_linux   	
payload_path_macos   	
persist_name_linux   	
persist_name_macos   	
persist_type_linux   	
persist_type_macos   	
init_python_enable   	
persist_enable       	
```

The Linux- and GitHub-related fields are not exercised in the sample, suggesting the schema is an operator-facing interface to a broader toolset.

## Collection | A Gated Python Stealer With Its Own Runtime Supply Chain

The implant carries a 6.6 KB base64-encoded Python script which serves as a data collection module. Once decoded, it harvests:

-   Chrome, Brave, Firefox, and Safari browser data
-   Terminal command histories
-   Installed application listings
-   A running-process snapshot via `ps aux`
-   System hardware and software profile via `system_profiler`
-   A raw copy of `login.keychain-db`

Collected artifacts are archived to `temp/collected_data.zip` and uploaded to the operator via Telegram.

![⚠️ 图片托管失败 · Decoded Python stealer targets the victim’s keychain and other data](https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_5.jpg)

Decoded Python stealer targets the victim’s keychain and other data

SentinelLABS has previously documented [Atomic macOS Stealer](https://www.sentinelone.com/blog/atomic-stealer-threat-actor-spawns-second-variant-of-macos-malware-sold-on-telegram/) (AMOS) harvesting the same login keychain copy and browser data and an early [Rust macOS stealer](https://www.sentinelone.com/blog/apple-crimeware-massive-rust-infostealer-campaign-aiming-for-macos-sonoma-ahead-of-public-release/) targeting `login.keychain-db` in 2023.

A separate 2 KB base64-encoded bash installer fetches and stages a self-contained `cpython-3.10.18` interpreter from the `astral-sh/python-build-standalone` project. The installer, a prerequisite for deploying the Python stealer, carries the literal constants `PY_VERSION=3.10.18` and `BUILD_DATE=20250708` and targets both arm64 and x86_64 macOS. The widespread use of emojis and strict adherence to comment headers are consistent with LLM-generated output.

![⚠️ 图片托管失败 · Decoded bash script has “written by AI” tells](https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_4.jpg)

Decoded bash script has “written by AI” tells

[Microsoft](https://www.microsoft.com/en-us/security/blog/2026/02/02/infostealers-without-borders-macos-python-stealers-and-platform-abuse/) has previously described macOS stealers bundling Python via PyInstaller and Nuitka. However, fetching a standalone CPython build from `astral-sh/python-build-standalone` at runtime has not been previously documented as far as we are aware. The separation keeps the main implant in Rust while letting the operator stage a fuller Python-based collection environment only when needed.

We identified `init_python_enable` in the `serde` schema as the configuration field associated with both the stealer and installer. Consistent with our earlier observations, we found no exact runtime branch logic, so we describe both only as configurable capabilities present in the binary.

## Persistence | An Apple System-Service Masquerade

Persistence is achieved through a LaunchAgent. This implant’s plist carries the Label value `com.apple.system.services.activity`. Masquerading within Apple’s `com.apple.*` namespace is a tactic [widely used](https://www.sentinelone.com/blog/how-malware-persists-on-macos/) in many macOS malware families, including those previously tied to DPRK-linked activities.

![⚠️ 图片托管失败 · Embedded LaunchAgent uses the label com.apple.system.services.activity](https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_9.jpg)

Embedded LaunchAgent uses the label com.apple.system.services.activity

In order to write a valid absolute path to itself into the plist’s `ProgramArguments` array, the implant resolves its own executable location at runtime via `__NSGetExecutablePath`.

The implant’s persistence behavior is controlled through the `persist_enable` `serde` config field, and again we did not recover a separate static branch that would confirm exactly how installation is triggered in this sample.

## OPSEC | Bot-Token Self-Redaction

Telegram bot tokens are a known weak point in bot-based C2. If the token can be recovered, defenders can use it as a detection artifact and even query the Telegram Bot API directly, exposing the bot’s chat history, operator commands, and registered webhooks. macOS.Gaslight addresses this with a self-redaction routine built into its Telegram URL constructor.

When the URL path segment is the 4-byte literal “file” (`0x656c6966` little-endian), the constructor substitutes the token that follows with the hardcoded placeholder `file/token:redacted`, preventing the live bot credential from appearing in any diagnostic output or error string the implant produces at runtime.

![⚠️ 图片托管失败 · The Telegram URL constructor token-redaction branch](https://www.sentinelone.com/wp-content/uploads/2026/06/macos_gaslight_3.jpg)

The Telegram URL constructor token-redaction branch

The logic prevents anyone who captures the process’s logs, errors, or crash artifacts from determining the bot token, which otherwise is only available in the config itself and cannot be recovered from the sample.

[NVISO Labs](https://blog.nviso.eu/2025/12/16/the-detection-response-chronicles-exploring-telegram-abuse/) has previously noted that most documented Telegram bot abuse embeds recoverable tokens; macOS.Gaslight’s runtime self-redaction appears novel relative to that reporting.

## A Prompt Injection That Targets the Analyst

The implant does little conventional anti-analysis. It resolves its API calls at runtime through `dlsym` so as to avoid embedding them in the static symbol table, and it locates its own executable dynamically rather than from a hardcoded path.

What makes the sample notable is its attempt to mislead the analyst reading the output. It carries a 3.5 KB Markdown-fenced blob of hostile data containing 38 fabricated “system” messages delimited with `{{DATA}}` tokens.

The `{{DATA}}` tokens and the surrounding Markdown fence mimic an LLM triage harness’s own prompt scaffold, blurring the boundary between untrusted sample data and trusted instructions.

The scaffold contains fake system messages about token expiry, out-of-memory kills, disk exhaustion, and repeated operation failures. It also plants bogus warnings about injection vulnerabilities and static-analysis flags. The aim is to push an LLM agent into aborting, truncating, or refusing analysis.

[Check Point](https://research.checkpoint.com/2025/ai-evasion-prompt-injection/) first documented this kind of analyst-targeting prompt injection publicly in 2025, describing a Windows proof-of-concept that used a single direct-instruction prompt injection to evade AI-based detection.

[Socket](https://socket.dev/blog/mini-shai-hulud-miasma-and-hades-worms-target-bioinformatics-and-mcp-developers-via-malicious) has since documented a Hades supply-chain payload whose stealer opens with a fake prompt-injection header to pollute AI-assisted analysis, while the leaked [Shai-Hulud](https://www.ox.security/blog/shai-hulud-open-source-malware-github/) code carried an “Anthropic Magic String” intended to stop Claude Code from analyzing it. Each relied on a single injected block or header rather than the 38-message harness-spoofing cascade seen here.

Previous [SentinelLABS](https://www.sentinelone.com/labs/prompts-as-code-embedded-keys-the-hunt-for-llm-enabled-malware/) research, by contrast, examined malware that uses LLMs to generate or support capability at runtime rather than interfere with analyst tooling.

## Conclusion

macOS.Gaslight packs considerable capability into a single, persistent Rust binary, bundling a credential and session-data stealer, an interactive shell, and a self-staged Python collection chain behind a hardened Telegram C2. Aside from the runtime-fetched standalone CPython interpreter, these are all established macOS tradecraft.

However, macOS.Gaslight is noteworthy for its analyst-targeting prompt injection, an attempt to weaponize the LLM-assisted triage pipelines that increasingly sit in the reverse-engineering loop.

Anyone building such tooling should treat the contents of the samples they triage as adversarial input, never as instructions, and be prepared to keep hostile content out of the model entirely. As [LLM-assisted analysis](https://www.sentinelone.com/labs/building-an-adversarial-consensus-engine-multi-agent-llms-for-automated-malware-analysis/) becomes routine, defenders should expect more samples built to exploit it.

## Indicators of Compromise

|     |     |
| --- | --- |
| macOS.Gaslight Mach-O sample | 6328567511d88fdc2ae0939c5ef17b7a63d2a833881900de018a4f12f4982525 |
| Sibling BONZAI sample | 77b4fd46994992f0e57302cfe76ed23c0d90101381d2b89fc2ddf5c4536e77ca |
| Ad hoc signing identifier | endpoint-macos-aarch64-5555494492fc075f441637fb9d894913dde3a2ea |
| LaunchAgent Label | com.apple.system.services.activity |
| Python payload script | baabf249c77bc54c54ab0e66e15af798bd28aa5b4683554456a8b73ab8741239 |
| Bash Installer script | e4503e31d5a297d93ade64f50a5b5fe91e73dad251ac2615b4c975684f68e080 |
