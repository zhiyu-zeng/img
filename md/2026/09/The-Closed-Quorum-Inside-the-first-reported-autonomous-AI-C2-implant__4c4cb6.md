---
title: "The Closed Quorum: Inside the first reported autonomous AI C2 implant"
source: https://blog.talosintelligence.com/the-closed-quorum-inside-the-first-reported-autonomous-ai-c2-implant/
source_host: blog.talosintelligence.com
clip_date: 2026-09-22T18:02:41+08:00
trace_id: 4e218972-6ae3-4cba-8756-3b71bc7ee994
content_hash: 8c78cfa01e92c255ae2f2519c60bdc576b0ce353c4251dd652090bca2fa60c23
status: synced
tags:
  - 恶意样本
  - AI应用
series: null
feed_source: Cisco Talos
ai_summary: Cisco Talos 披露首个公开记录的自主 AI C2 植入体 CLOSEDQUORUM：由四家商业 LLM 投票决定攻击动作并直接执行，无需人工指令或专用 C2 服务器。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3e375244-d011-8125-a538-fd32b594113b
ioc:
  cves: []
  cwes: []
  hashes:
    - 250d4fa37488af9b025333fa17705573d721467b203765bc360890b4f5a90cd7
    - 5191cf625dfc209a347f137b50aea199e82040fd5ee9086fb3e2de73c133f3cb
    - c13cea04f598e2b0c248d603a6e31bd13aabb64d8149c1b6a77b64e0b983a86f
    - c4dc171f2513fcaf9d5ecc815a94aee4063b213ab380f80bd3ac422dee5205a7
    - eddbd0ecf7195d38fefae5b9d393abfa79e6f3f94bde19308ecef130a05a42e5
    - f5f1f8c3e7b883793800ab6ccf21b3e60bd0730f300b4595fe74a33adc17a63c
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Cisco Talos 披露首个公开记录的自主 AI C2 植入体 CLOSEDQUORUM：由四家商业 LLM 投票决定攻击动作并直接执行，无需人工指令或专用 C2 服务器。
> 
> - **核心架构：** 16.4MB 的 64 位 Go 可执行文件（CGO_ENABLED=1，混用 C 做直接系统调用），`ModelOrchestrator` 依次查询 DeepSeek、Qwen、Mistral、Gemini，`interModelDiscussion()` 按多数票决定下一步动作；全部失败时回退到无对应处理器的 `consensus`，休眠后重试。
> - **决策约束：** 系统提示词限定"仅输出可执行决策"，响应必须匹配固定 JSON schema 的 decision 字段（inject/persist/steal/move），否则丢弃；平票固定按 DeepSeek→Qwen→Mistral→Gemini 顺序裁决，行为完全确定。
> - **攻击能力：** `steal` 同时执行 LSASS 内存转储、Chrome/Edge/Firefox 凭据抓取、MetaMask/Exodus/以太坊钱包提取；`inject` 生成 shellcode 后走 Early Bird APC 或进程镂空；`persist` 用注册表 Run 键、schtasks、WMI 事件订阅与 wmi.ps1。
> - **外传与规避：** 窃取数据以日期派生密钥做 AES-256-GCM 加密、Base64 编码后按 1900 字节分片、每秒一片发往运营者 Discord webhook；启动延迟 5 分钟、轮询间隔随机 5–15 分钟，并把 `EtwEventWrite` 覆盖为单条 RET 关闭 ETW。
> - **现状与检测：** 公开分发版是占位密钥（dummy_api_key/dummy_webhook_url）的惰性模板，开发者按运营者编译时注入凭据，属疑似"凭据即服务"；检测应依赖行为组合——陌生 Windows 进程同时访问多家 LLM API、LSASS 访问、进程注入与 Discord webhook。

-   CLOSEDQUORUM, a malware binary discovered through Cisco Talos’ [CAIRN project](https://blog.talosintelligence.com/introducing-cairn-frontier-tracking-for-ai-integrated-malware), exhibits fully autonomous command and control (C2). While we do not have confirmation of in-the-wild deployment, artifacts from the binary were used to connect the developer to postings on criminal forums related to carding, dating back to 2025.
-   This malware is a useful reference example of how attackers can collapse the decision space of a particular attack phase into a constrained set of choices, allowing AI models to provide reasoning and act independently.
-   CLOSEDQUORUM represents a shift in effort displacement for attackers, in which expanding portions of the attack chain can be executed without operator involvement.

![The Closed Quorum: Inside the first reported autonomous AI C2 implant](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ff81cf5ef5f212b8.jpg)

AI’s impact on offensive cyber operations has thus far mainly focused on two dimensions: *speed* and *scale*. Attackers can generate phishing lures faster and produce more malicious code variants with less effort. These are real effects, visible in the proliferation of AI-generated coding samples and agent-assisted intrusions that have become common in the past few years. But in each case, the human operator remains present: directing the tooling, selecting targets, and guiding the execution. AI makes the operator faster and more productive but does not remove them from the operation.

A third dimension has received less attention in the malware space: effort displacement. This is not merely augmenting what an operator can accomplish in a session but transferring an entire phase of the attack from the operator to the system. Effort displacement compounds the effects of speed and scale because the human-in-the-loop is no longer the bottleneck. Human operators are bound by attention, working hours, and cognitive load. An AI system capable of executing a phase of the attack chain can continue when the operator is no longer watching. It does not go offline when the attacker sleeps.

Today Cisco Talos released [CAIRN](https://blog.talosintelligence.com/introducing-cairn-frontier-tracking-for-ai-integrated-malware), our [open-source research toolkit](https://github.com/Cisco-Talos/Cognitive-Artifact-Intelligence-Research-Network) for tracking AI-integrated malware. This is the first in a series of posts sharing what we've found. While the threat class of CAIRN findings may span from experimental proof-of-concept to sophisticated active campaigns, the nature of the threat is aside from the focus: actively studying this frontier provides actionable insights to offset how threat actors are operationalizing AI.

## Introducing CLOSEDQUORUM

CLOSEDQUORUM is, to our knowledge, the first publicly documented Windows implant to apply this model to tactical command and control (C2). After deployment, it delegates the selection of its next action to a panel of commercial large language models (LLMs) and executes the resulting decision, with the intent of harvesting user credentials and crypto wallets. It does not require continued commands from a human operator or tasking from a dedicated, attacker-operated C2 server; the complete dynamic operation is delegated to the AI.

The name reflects the architecture. A quorum is a decision-making body that requires some minimum of participants to act. CLOSEDQUORUM's quorum is up to four LLM providers: DeepSeek, Qwen, Mistral, and Google Gemini. The session is closed; no humans are admitted. Four models are queried in sequence, their independent verdicts tallied, and the binary acts, based on their judgment.

![The Closed Quorum: Inside the first reported autonomous AI C2 implant](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e06360c17cefe95c.jpg)

Figure 1. CLOSEDQUORUM architecture.

The CLOSEDQUORUM C2 architecture supports up to four LLM provider integrations. Each active model votes on the next action, and the action receiving the most votes is selected.

Our static analysis confirms the full details of the autonomous decision loop, and development builds demonstrate build-time injection of provider credentials. The public distribution build, however, contains placeholder API keys and a dummy webhook, so we did not observe a complete end-to-end execution of the architecture.

Further details of this post document how CLOSEDQUORUM works, what it can do, and what it means for the future of autonomous offensive AI tooling.

## “LLM-as-C2" architecture

CLOSEDQUORUM is a 16.4MB, 64-bit Windows executable compiled in Go. It contains a range of offensive implant functionality, but that isn’t what makes it unique. The foundational design choice in CLOSEDQUORUM is the treatment of LLM providers as the C2 infrastructure.

![The Closed Quorum: Inside the first reported autonomous AI C2 implant](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2f3e1f8a9766f897.png)

Figure 2. Ghidra import results summary. CGO_ENABLED=1 confirms the binary mixes Go and C code, which is how it makes direct Windows system calls.

Traditional C2 architecture requires the attacker to operate server infrastructure: a domain, an IP, a protocol, and a listener. That infrastructure is attributable, blockable, and expensive to rotate. Defenders track C2 domains. Threat intelligence feeds publish C2 IPs. Certificate transparency logs expose new C2 infrastructure before it's used. Instead of a singular, unique C2 server, CLOSEDQUORUM calls up to four commercial LLM provider endpoints used by thousands of legitimate applications daily.

The providers are queried one-by-one by the `ModelOrchestrator`. Their responses are aggregated as a `[]LLMDecision` slice and resolved by `interModelDiscussion()` into a single action via *plurality voting*: each provider's `Decision` field value increments a `map[string]int` counter, and the highest-count decision wins. The multi-provider design serves both aggregation and resilience, reducing the effect of individual refusals, timeouts, and malformed responses. It increases the likelihood of obtaining a valid decision but does not guarantee one.

Four providers increase the chance that the quorum reaches a decision even if one or two members are unresponsive, or for example, one model is hitting a guardrail. If all models fail, the fallback decision is `consensus`: a string with no corresponding capability handler, causing the loop to sleep and retry rather than take a default action.

![The Closed Quorum: Inside the first reported autonomous AI C2 implant](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/76ebc4f153bcb798.png)

main.interModelDiscussion

The process is described in Figure 3: (1) The four LLM provider keys are initialized as string constants: `deepseek`, `qwen`, `mistral`, `gemini` (lines 109–116). (2) The four-provider query loop `while (uVar16 < 4)` iterates across all providers (line 124). (3) `main.queryLLM(model, prompt)` the live API call that dispatches each provider's structured prompt (line 134). After the loop, responses are aggregated via plurality vote on the `Decision` field; the winning decision is sent to the operator's Discord webhook before the function returns.

## Voting and decision schema

The LLM panel is not free to respond in any format. CLOSEDQUORUM constrains it to a typed JSON schema representing a specific attack-decision language. The system prompt, as extracted from the binary, reads “You are an advanced malware strategist. Provide ONLY executable decisions.”

![The Closed Quorum: Inside the first reported autonomous AI C2 implant](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bab7d2f84993b187.png)

Figure 4. System prompt.

In the per-execution prompt template, `TARGET: %s` is substituted at runtime:

![The Closed Quorum: Inside the first reported autonomous AI C2 implant](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a318ba1435ee91ec.png)

Figure 5. The prompt template enumerates the model’s choices.

The response is deserialized into a Go struct:

![The Closed Quorum: Inside the first reported autonomous AI C2 implant](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ca92401f3e90707f.png)

Figure 6. Structure of the returned model’s decision.

The `Decision` field routes to capability modules of `main.main`:

-   `steal` simultaneously invokes `lsassDump()`, `dumpBrowserCredentials()`, and `extractCryptoWallets()`; all three run together.
-   `inject` calls `generateShellcode()` then branches: `process_hollow` exploit type routes to `injectProcess()` (PEB-walk hollowing); anything else routes to `earlyBirdInject()` (APC injection).
-   `persist` dispatches to `establishPersistence()`. `move` has no handler in the distribution build.

The LLM *must* emit a valid JSON object matching a known type, and with a decision field that maps to a specific capability, or the response is discarded. This design reduces the model’s output to a constrained set of executable choices.

`gatherSystemInfo()` is called during initialization to capture the hostname, OS architecture, CPU count, Windows version, and admin status. These variables are stored in the orchestrator as the `TARGET:%s` context and injected into each LLM prompt. The system info component of the `TARGET:%s` is static, while `target_process` refreshes each cycle.

The `Reasoning` field preserves the LLM's rationale at execution time. A Discord webhook provides the operator with the output, as well as real-time attack telemetry, including:

-   The winning decision (`inject` / `persist` / `steal` / `move`)
-   The reasoning field
-   `target_process`, `exploit_type`, `evasion_method`, `payload_config`
-   The model and timestamp fields

The attackers interest is aligned with extracting user credentials, specifically the implant targets:

-   LSASS credential dumping — `lsassDump()` extracts Windows domain/local credentials from memory,
-   Browser credential theft — `dumpBrowserCredentials()` targeting Chrome, Edge, and Firefox saved passwords,
-   Crypto wallet extraction — `extractCryptoWallets()` hitting MetaMask (Chrome extension), Exodus (`exodus.wallet`), and Ethereum wallets (`ethPath`).

Stolen material arrives AES-256-GCM encrypted in the operator's Discord channel as base64 code blocks.

### What if there is a tie?

In any tie, an order of preference kicks in: DeepSeek first, then Qwen, then Mistral, then Gemini.

![The Closed Quorum: Inside the first reported autonomous AI C2 implant](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/22445c3919506d8f.png)

Figure 7. Vote counting implementation.

DeepSeek holds the deciding vote in any tie: the max-finding loop iterates the decisions slice in submission order and the strict “<” comparison means the first-encountered maximum wins. If DeepSeek failed and isn't in the quorum, Qwen's vote is the deciding vote, and so on down the priority order. The tie behavior is fully deterministic and biased toward DeepSeek.

## The operating model

CLOSEDQUORUM appears to operate as an operator-configured service rather than malware deployed directly by its developer. The publicly observed distribution binary is an inert template: all LLM API credentials initialize to `dummy_api_key` and the Discord webhook initializes to `dummy_webhook_url`. The binary is non-functional as distributed.

Evidence from development builds indicates the developer produces a customized executable for each operator. The inferred distribution model:

-   Developer generates a custom binary with the operator's Discord webhook and LLM API keys injected at compile time.
-   Operator receives a configured executable and handles delivery independently
-   Stolen credentials arrive in the operator's Discord channel, AES-256-GCM encrypted with a daily-rotating key the operator can derive from the message timestamp.

The encryption uses a symmetric key derived from the current date, not a hardcoded asymmetric key. The developer's infrastructure could theoretically decrypt an operator's exfil if they know the date, which they always do. This is obfuscation, not true confidentiality separation between developer and operator. Each operator nonetheless has a distinct exfil channel and a distinct binary build.

If operated as assessed, this is a credentials-as-a-service model where the service differentiator is the autonomous LLM orchestration layer. An operator who acquires CLOSEDQUORUM does not need to be online to run their campaign. They deploy the binary, and the LLM panel runs the attack.

## Defensive implications

CLOSEDQUORUM replaces a dedicated C2 endpoint with a chain of correlated behaviors. No single indicator fully identifies the architecture, but the combination is distinct:

-   AI-provider API traffic originating from an unexpected Windows executable
-   Similar requests potentially sent to several model providers within a short interval
-   Structured prompts containing host context or offensive capability language (Note: This would likely only visible through TLS inspection or provider-side telemetry)
-   Numerous known malware techniques for process injection, LSASS access, or persistence creation
-   Discord webhook communication from the same process or host
-   Repeated execution at randomized 5 – 15-minute intervals

The most useful detection strategy is still to focus on behavioral characteristics, rather than domain blocking. Legitimate applications may contact DeepSeek, OpenRouter, Mistral, Gemini, or Discord independently. Far fewer should contact several of them while also accessing LSASS, injecting into suspended processes, or creating WMI persistence. For the full behavioral characteristics, see the technical appendix and implementation details.

## Looking ahead: The autonomy arc

CLOSEDQUORUM is best understood not as a sophisticated piece of malware, but as a demonstration that the architectural shift towards attack-chain automation is coming.

After deployment, tactical choices are delegated to a model-driven decision loop. The models receive host context, choose among implemented capabilities, provide execution parameters, and continue making decisions without human-issued commands or dedicated C2 tasking. This type of scaffolding approach could easily be translated and applied to other adversary objectives.

The displacement of human attackers also introduces weaknesses. Provider refusals, rate limits, malformed output, predictable tie-breaking, constrained action schemas, and dependence on commercial APIs all create failure modes and defensive opportunities. Autonomy does not make the implant infallible; it exchanges some human limitations for model and infrastructure limitations.

Even so, CLOSEDQUORUM demonstrates that removing the operator from a bounded phase of an intrusion is achievable with currently available models and ordinary API access. The important precedent is the demonstration of encoding tactical attack logic as model-readable context, converting structured model output directly into execution.

CLOSEDQUORUM is an early and limited example, but it makes an emerging threat model concrete and gives defenders an outline of the observable signals they can begin addressing today. As effort displacement expands across more phases of an intrusion, its effects will compound with the speed and scale already afforded by modern AI. The advantage for defenders is that this progression is still only beginning. We have an open window to study this transition, with the aim of developing the detections, controls, and response strategies needed before autonomous operations become more capable and widespread.

|     |     |     |
| --- | --- | --- |
| ATT&CK tactic | ATT&CK technique | Implementation |
| Stealth (TA0005) / Privilege Escalation (TA0004): Process Injection | [T1055.004 – Process Injection: Asynchronous Procedure Call](https://attack.mitre.org/techniques/T1055/004/) | The default Early Bird APC routine creates a suspended Windows process, writes dynamically generated shellcode into its memory, queues the payload with NtQueueApcThread, and resumes execution. |
|     | [T1055.012 – Process Injection: Process Hollowing](https://attack.mitre.org/techniques/T1055/012/) | When the LLM selects process_hollow, the implant locates the suspended process’s image base, overwrites its entry-point region, and resumes the thread. |
| Persistence (TA0003): Multiple Persistence Mechanisms | [T1547.001 – Boot or Logon Autostart Execution: Registry Run Keys / Startup Folder](https://attack.mitre.org/techniques/T1547/001/) | The implant sets a WindowsUpdate value under the current user’s Registry Run key. |
|     | [T1053.005 – Scheduled Task/Job: Scheduled Task](https://attack.mitre.org/techniques/T1053/005/) | The implant creates a scheduled task using schtasks.exe. |
|     | [T1546.003 – Event Triggered Execution: Windows Management Instrumentation Event Subscription](https://attack.mitre.org/techniques/T1546/003/) | The implant creates a permanent WMI event subscription that triggers execution through a system-performance query every 60 seconds. |
|     | [T1059.001 – Command and Scripting Interpreter: PowerShell](https://attack.mitre.org/techniques/T1059/001/) | The WMI mechanism writes a script to a path consistent with C:\\Windows\\Temp\\wmi.ps1 and executes it with powershell.exe, leaving an on-disk forensic artifact. |
| Credential Access (TA0006) / Collection (TA0009): Credential and Wallet Theft | [T1003.001 – OS Credential Dumping: LSASS Memory](https://attack.mitre.org/techniques/T1003/001/) | The implant enables SeDebugPrivilege and uses MiniDumpWriteDump to capture the full contents of LSASS memory. |
|     | [T1555.003 – Credentials from Password Stores: Credentials from Web Browsers](https://attack.mitre.org/techniques/T1555/003/) | The implant collects Chrome and Edge Login Data, Firefox logins.json, and MetaMask data stored in the Chrome extension profile. |
|     | [T1552.001 – Unsecured Credentials: Credentials in Files](https://attack.mitre.org/techniques/T1552/001/) | The implant collects wallet files that may contain authentication, recovery, or other sensitive material. |
|     | [T1005 – Data from Local System](https://attack.mitre.org/techniques/T1005/) | The implant collects MetaMask, Exodus, and Ethereum wallet data from local storage. |
|     | [T1074.001 – Data Staged: Local Data Staging](https://attack.mitre.org/techniques/T1074/001/) | LSASS dumps, browser databases, and wallet files are copied into staging locations under C:\\Windows\\Temp\\ before transmission. |
| Exfiltration (TA0010) / Command and Control (TA0011): Discord Webhook | [T1567.004 – Exfiltration Over Web Service: Exfiltration Over Webhook](https://attack.mitre.org/techniques/T1567/004/) | The implant posts stolen credentials and other collected material to an operator-controlled Discord webhook. |
|     | [T1102 – Web Service](https://attack.mitre.org/techniques/T1102/) | Discord also serves as a reporting channel through which the implant sends the LLM panel’s selected action to the operator in real time. |
|     | [T1573.001 – Encrypted Channel: Symmetric Cryptography](https://attack.mitre.org/techniques/T1573/001/) | Collected files are encrypted with AES-256-GCM using a key derived from the current date. |
|     | [T1132.001 – Data Encoding: Standard Encoding](https://attack.mitre.org/techniques/T1132/001/) | The encrypted data is Base64-encoded before transmission. |
|     | [T1030 – Data Transfer Size Limits](https://attack.mitre.org/techniques/T1030/) | Ciphertext is divided into 1,900-byte segments and posted to Discord at one-second intervals. |
| Defense Impairment (TA0112) / Stealth (TA0005): AV and Sandbox Evasion | [T1685 – Disable or Modify Tools](https://attack.mitre.org/techniques/T1685/) | The implant suppresses ETW telemetry by overwriting EtwEventWrite with a single RET instruction. |
|     | [T1027 – Obfuscated Files or Information](https://attack.mitre.org/techniques/T1027/) | A secondary payload is stored in an encrypted form to impede inspection and static recovery. |
|     | [T1480.001 – Execution Guardrails: Environmental Keying](https://attack.mitre.org/techniques/T1480/001/) | The secondary payload decryption key is derived from the current system time, preventing recovery outside the expected temporal condition. |
|     | [T1497.003 – Virtualization/Sandbox Evasion: Time Based Checks](https://attack.mitre.org/techniques/T1497/003/) | A five-minute initial delay and randomized 5 – 15-minute polling intervals reduce exposure to short-lived sandbox analysis. |
|     | [T1036.005 – Masquerading: Match Legitimate Resource Name or Location](https://attack.mitre.org/techniques/T1036/005/) | Windows Update-themed Registry, WMI filter, and consumer names help the implant blend with legitimate system activity |

### SHA256

The following hashes represent the developers build chain over seven days of development:

`250d4fa37488af9b025333fa17705573d721467b203765bc360890b4f5a90cd7` 

`c4dc171f2513fcaf9d5ecc815a94aee4063b213ab380f80bd3ac422dee5205a7` 

`c13cea04f598e2b0c248d603a6e31bd13aabb64d8149c1b6a77b64e0b983a86f` 

`f5f1f8c3e7b883793800ab6ccf21b3e60bd0730f300b4595fe74a33adc17a63c` 

`5191cf625dfc209a347f137b50aea199e82040fd5ee9086fb3e2de73c133f3cb` 

`eddbd0ecf7195d38fefae5b9d393abfa79e6f3f94bde19308ecef130a05a42e5`

### YARA

```swift
rule CLOSEDQUORUM_LLM_Autonomous_Implant 
{ 
    meta: 
        description = "Detects CLOSEDQUORUM: autonomous LLM-orchestrated Go implant with multi-model consensus C2, LSASS dump, process injection, browser/wallet credential theft, Discord exfil (A4 archetype)" 
        author = "CAIRN" 
        artifact_class = "rat" 
        artifact_type = "llm_tasked_c2" 
        tier = "T3" 
        confidence = "high" 
        family = "CLOSEDQUORUM" 
        reference = "VT SHA256 250d4fa37488af9b025333fa17705573d721467b203765bc360890b4f5a90cd7; static analysis 2026-06-17; system prompt, decision schema, and DWARF function names confirmed from binary; renamed from BALZAK 2026-07-03" 
        date = "2026-06-17" 
        note = "VT metadata rule: matches on sandbox Lsass Dumper verdict + LLM provider DNS + overlay tag; binary-level strings (system prompt, DWARF names) require direct file scan" 
  
    strings: 
        // VT metadata anchors — what appears in CAIRN scan_text 
        $balzak_name   = "balzak" nocase 
        $lsass_verdict = "Lsass Dumper" nocase 
        $overlay_tag   = "'overlay'" nocase 
        $checks_disk   = "checks-disk-space" nocase 
        $evader_tag    = "EVADER" nocase 
        // LLM provider DNS (present post-behaviours-refresh) 
        $deepseek_dns  = "api.deepseek.com" nocase 
        $openrouter    = "openrouter.ai" nocase 
        $mistral       = "api.mistral.ai" nocase 
        // GoReSym build info: developer API keys baked into gohno-final.exe via -ldflags 
        $dev_deepseek  = "deepseekAPIKey" nocase 
        $dev_gemini    = "geminiAPIKey" nocase 
        // Exfil channel: Discord in memory pattern domains (earlyburb.exe / production builds) 
        $discord_exfil = "cdn.discordapp.com" nocase 
        // Binary-level: hardcoded system prompt 
        $prompt        = "You are an advanced malware strategist. Provide ONLY executable decisions." ascii 
        // Binary-level: LLM decision schema 
        $schema        = "decision: \"inject\"|\"persist\"|\"steal\"|\"move\"" ascii 
        // Binary-level: DWARF function names (unstripped Go binary) 
        $orchestrator  = "main.ModelOrchestrator" ascii 
        $intermodel    = "main.interModelDiscussion" ascii 
        $lsass_fn      = "main.lsassDump" ascii 
        $wallets_fn    = "main.extractCryptoWallets" ascii 
        $discord_fn    = "main.sendToDiscord" ascii 
        $inject_fn     = "main.earlyBirdInject" ascii 
  
    condition: 
        ($balzak_name and $lsass_verdict and $overlay_tag) or 
        ($lsass_verdict and ($deepseek_dns or $openrouter or $mistral) and $overlay_tag and $evader_tag) or 
        ($dev_deepseek and $dev_gemini) or 
        ($discord_exfil and $deepseek_dns and $openrouter and $overlay_tag) or 
        $prompt or 
        ($schema and $orchestrator) or 
        ($lsass_fn and $wallets_fn and $discord_fn) or 
        ($intermodel and $inject_fn) 
}
```
