---
title: Press play on Elastic Security 9.6, banger after banger
source: https://www.elastic.co/security-labs/blog/elastic-security-9-6-release-highlights
source_host: www.elastic.co
clip_date: 2026-11-26T11:00:20+08:00
trace_id: 5052a1a2-7d32-45f7-947d-7a877ecd168d
content_hash: a81acee7ba11074c9f6ccb841769078d2ea8b0b977e52f4f00f3ac37f3038ef9
status: synced
tags: []
series: null
feed_source: Elastic Security Labs
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 42475244-d011-81b4-86c3-ee438e57ee36
ioc: null
---

You’ve clocked in for your shift and just hit play on your 10-hour lo-fi playlist. The caffeine is kicking in, and you’re pumped because the handoff notes from the last shift are *really* useful. Every case has all the evidence and the rationale behind the disposition, along with the affected hosts and users. Plus, you only have five alerts to review in your queue. This security operations center (SOC) shift is exactly why we built [AlertZero](https://www.elastic.co/security-labs/blog/ai-soc-agents-alertzero-workers), now available as a technical preview in Elastic Security in Elastic Cloud Serverless (Serverless). It’s also coming in early December 2026 to Elastic Security 9.6 for Elastic Cloud Hosted (ECH) and Elastic Self-Managed deployments with an Enterprise subscription or an Elastic Security 9.6 trial license.

AlertZero is big news in Elastic Security 9.6, but there’s a lot more to this release:

**Feature**

**What’s new**

AlertZero

Four teams of agents, called Watches, covering alert triage, threat hunting, detection engineering, and forensic analysis

Entity Analytics

A refreshed overview, expanded entity resolution, and an AI brief

Ransomware protection for Linux

Elastic Defend’s behavior-based ransomware protection now extends to Linux

YARA memory scanning

Bring your own YARA rules to scan process memory

Automatic Migration

Agentic editing for migrated detection rules

AI detection and response

MITRE Adversarial Threat Landscape for Artificial-Intelligence Systems (ATLAS) support, 143 AI security detection rules, and the Security for AI integration package in technical preview

Grab your coffee, and take a look at what’s new. Where there’s a deeper dive, we’ve linked it.

## AlertZero, the agentic layer of Elastic Security

First, explore the four Watches in AlertZero, along with the Workers that perform specific security tasks. Then, learn about proposed actions and the approval process, plus the various model options.

### Four Watches for alert triage, threat hunting, detection engineering, and forensics

AlertZero covers alert triage, threat hunting, detection engineering, and endpoint forensics through four Watches, each of which holds Workers that have specific jobs, such as triaging new alerts or tuning a noisy rule.

![Elastic Security AlertZero org chart with Triage, Hunt, Detection, and Forensics Watches](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4213022598a229e6.png)

Under the hood, each Worker is an AI-powered unit of work that belongs to a Watch. It runs in the background, either on a schedule or in response to events like new alerts, and then analyzes your data and brings you proposed actions. Every Worker is built as a workflow in Elastic Workflows, and each one has its own settings, including its schedule and its autonomy level:

**Worker**

**What the Worker does**

**What the Worker proposes**

Triage Watch’s [Alert Triage Worker](https://www.elastic.co/docs/solutions/security/alertzero/watches-and-workers#alertzero-alert-triage)

Classifies new alerts as true or false positives, with a confidence score for each

Closing alerts that it classifies as false positives

Triage Watch’s [Attack Discovery Worker](https://www.elastic.co/docs/solutions/security/alertzero/watches-and-workers#alertzero-attack-discovery)

Groups related alerts into potential attacks, and opens an investigation for each one

Endpoint analysis for attacks that look real or can't be ruled out

Hunt Watch’s [Continuous Threat Hunt Worker](https://www.elastic.co/docs/solutions/security/alertzero/watches-and-workers#alertzero-continuous-threat-hunt)

Searches your data for activity that matches threat reports, and records any detection gaps it finds

Response actions when your data matches a threat report, and detection gaps for Rule Coverage to review

Detection Watch’s [Rule Tuning Worker](https://www.elastic.co/docs/solutions/security/alertzero/watches-and-workers#alertzero-rule-tuning)

Finds rules that keep producing false positives, and determines why

Edits and exceptions for rules that analysts keep closing as false positives

Detection Watch’s [Rule Coverage Worker](https://www.elastic.co/docs/solutions/security/alertzero/watches-and-workers#alertzero-rule-coverage)

Reviews the detection gaps that Continuous Threat Hunt records

Enabling, installing, or creating rules to close detection gaps

Forensics Watch’s [Endpoint Analysis Worker](https://www.elastic.co/docs/solutions/security/alertzero/watches-and-workers#alertzero-endpoint-analysis)

Reconstructs the attack timeline on the main host involved, and pulls out indicators of compromise

Isolating a host, or killing or suspending a process

### How Workers propose actions and how you approve them

When a Worker thinks something in your environment should change, such as closing a false positive or isolating a host, it writes that up as a proposed action, which lays out what the Worker recommends as a next step and why, based on the context it retrieved. When you open one, you’re in the investigation where the Worker keeps its notes, including the evidence it gathered and the reasoning behind its recommendation, along with the hosts and users involved.

Because an investigation is an [Elastic Agent Builder](https://www.elastic.co/docs/explore-analyze/ai-features/elastic-agent-builder) conversation, you can ask follow-up questions before you decide on next steps. Each Worker has up to three autonomy levels (Manual, Assisted, or Supervised) that determine whether a proposed action comes to you for review or runs on its own. When you approve one, the action runs as you, with your privileges, and it’s recorded as your decision. If you decline, the action doesn’t run.

### Your Workers, your choice of model

No single model fits every step, and the model you rely on today can change. A provider tightens its guardrails, retires a version, or changes its pricing, and a step that worked starts failing or costing more. Security work runs into this more than most, and when Hugging Face [investigated its July 2026 intrusion](https://huggingface.co/blog/agent-intrusion-technical-timeline), the first models its team reached for refused much of the analysis because their guardrails treated reverse engineering an exploit the same as launching one. The team finished the work with an open-weight model it ran on its own infrastructure.

That’s why you choose the models behind your Workers. In **Feature Settings**, you pick which models do the work, and you can change them as your needs change.

You can use your model of choice, including an open-weight model or one you host yourself, and switching models doesn’t change anything else about how your Workers run.

## Entity Analytics gives your hunts and investigations a starting point

The Entity Analytics improvements in Elastic Security 9.6 are generally available (GA) with an Enterprise subscription.

### A refreshed Entity Analytics overview with six attention tiles

The refreshed overview brings risk changes, alerts, anomalies, and watchlist activity into one place, so SOC analysts and threat hunters can find the changes that are worth investigating. Six attention tiles (**Severely alerting**, **Newly high-risk**, **Risk movers**, **New & alerting**, **Anomalous**, and **Watchlisted & alerting**) bring forward the users, hosts, and services that changed, each with its trend against the previous period. You can compare periods and see trend lines across 24 hours, seven days, or 30 days, where history is available.

![Elastic Security Entity Analytics overview with six attention tiles and a resolved entity risk grid](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/54d7a6abcc95a4db.png)

Filter by entity type, risk level, criticality, source, or watchlist, and then inspect the entities that match an attention tile in a searchable entity grid. In the entity flyout, you can switch between resolved identities and individual records, with risk, alerts, anomalies, findings, and observed attributes available for each.

### An AI brief on which entities need attention

When your chief information security officer wants a summary of your entity risk posture, you can generate a concise AI brief from your Entity Analytics view, plus a clear starting point for investigation. The brief names what needs attention and shows how key metrics have changed. It also lists up to three entities to investigate first. You can inspect the supporting entity evidence and relevant risk history charts to see why. And you can keep asking follow-up questions in Agent Builder without rebuilding the investigation context.

### Entity resolution finds the person behind the logins

Entity resolution already helps you see the person who shows up as a few different accounts across your endpoint, identity, and cloud data, and 9.6 expands these details. For example, if `maria.chen` in Okta and `CORP\mchen` in Active Directory share an email address, they show up as one person, with one combined risk view.

Built-in matching rules now also cover Windows and CrowdStrike security identifiers (SIDs), Entra globally unique identifiers (GUIDs), and Microsoft 365 user principal names (UPNs), and email matching is now case insensitive. In Agent Builder, you can inspect resolution groups, link or unlink accounts, and turn built-in rules on or off in plain language. You review the proposed canonical identity and confirm changes before they’re applied.

## Elastic Defend adds Linux ransomware protection and YARA memory scanning

[Elastic Defend](https://www.elastic.co/docs/solutions/security/configure-elastic-defend) will add several new capabilities in 9.6, including these two:

### Ransomware protection parity for Linux, Windows, and macOS

Since your environment runs on more than Windows, your ransomware protection should cover all of it. Elastic Defend is bringing ransomware protection to Linux, GA in 9.6, extending the behavior-based protection that it already provides on Windows and macOS to Linux hosts. So you’ll have one approach across Windows and macOS, as well as Linux, for your servers.

In Prevent mode, Elastic Defend blocks an attack as it happens. You manage the policy in Elastic Security, next to the alerts, investigations, and response, so ransomware prevention, malware protection, endpoint detection and response (EDR), and security information and event management (SIEM) context live together. When something fires, you get an alert with the process and host details that you need to respond to it.

### Find the footprints in RAM with your own YARA rules

With adversaries moving in seconds, you need deeper analysis and insight into your hosts. Some malware never touches the disk. It lives in memory, where file scans can’t see it. Elastic Defend scans process memory with YARA signatures, so you can catch threats that hide there. With 9.6, you can bring your own rules and apply custom YARA signatures to match your threat intel. You manage them in a new **YARA signatures** tab on the Artifacts page, where you apply them globally or to specific policies, and turn on scanning in the **Memory threat protection** card of the Defend policy. A match creates a Memory Threat – Detected alert with the matched signature name and memory strings, so analysts can see what matched. Custom YARA signatures will be GA in 9.6.

## Fine-tune your SIEM migration agentically

Migrating to a new SIEM requires careful planning and execution. We’ve been doing the heavy lifting of migrating your SIEM rules and dashboards to Elastic with [Automatic Migration](https://www.elastic.co/docs/solutions/security/get-started/automatic-migration), and we continue to improve that experience.

In 9.6, you can agentically edit your mapped and translated detection rules to fit your environment by adding a rule to chat to start tuning, and you confirm the changes in the same UI.

From chat, you can:

-   Change the logic of the translated Elasticsearch Query Language (ES|QL) query by adding a custom index pattern or mapping custom fields into ES|QL. You can also do so by fixing syntax and runtime errors.
    
-   Match to a prebuilt rule instead of a custom translated rule.
    
-   Get recommendations on alternative prebuilt rules.
    
-   Match rules to different integrations.
    

This works across all supported vendors: Splunk, QRadar, and Microsoft Sentinel.

## AI detection and response in Elastic Security

### MITRE ATLAS mappings for your detection rules

MITRE ATLAS is MITRE’s knowledge base of the tactics and techniques adversaries use against AI-enabled systems, covering prompt injection, jailbreaks, stolen model API keys, and poisoned agent tools. It’s maintained by MITRE and shaped by real-world observations and research from across industry and academia. It’s modeled directly on MITRE ATT&CK, so the structure will feel familiar: tactics for what an adversary is trying to achieve, plus techniques and sub-techniques for how.

In Elastic Security 9.6, [MITRE ATLAS mappings ship with prebuilt detection rules for AI](https://www.elastic.co/security-labs/blog/mitre-atlas-elastic-security-detection-coverage) platforms and generative AI (GenAI) tooling, so rules provide the AI-related context out of the box. A new coverage table shows which ATLAS tactics and techniques your rules already address, scored in its own view rather than averaged into your ATT&CK numbers.

### 140+ new detection rules for AI agents and large language model platforms

AI risk lives in multiple places. A coding agent runs on a developer laptop, the models it calls run in a cloud AI platform, and the keys, guardrails, and agents behind those models are managed through a cloud control plane. The Elastic Security 9.6 rules are organized around the threats that show up in each of those places and the telemetry that Elastic already collects from them.

[The new rules](https://www.elastic.co/security-labs/blog/ai-security-detection-rules-coding-agents-mcp) cover hijacked coding agents, malicious Model Context Protocol (MCP) servers, credentials pasted into prompts, jailbreaks, and stolen API keys across Amazon Bedrock, OpenAI ChatGPT Enterprise, Anthropic, Google Cloud Vertex AI, and Microsoft Foundry.

### Security for AI: Prompt injection detection at ingest

GenAI agents can autonomously read files, run commands, call APIs and MCP tools, and send messages, and they frequently do so without explicit user permissions. Threat actors hijack them with methods like prompt injection, which changes an agent’s goals and can lead to dangerous actions in your environment. Unlike conventional detections, agentic exploits use natural language to launch attacks, so leaving this data out gives you an incomplete picture of the threat landscape.

The [Security for AI integration package](https://www.elastic.co/security-labs/blog/prompt-injection-detection-ai-agents) is designed to help counter this. It’s in technical preview starting in Elastic Stack 9.6 with a Platinum or trial subscription, and it adds four small models that score GenAI prompts and responses inside your own cluster as they’re indexed. They look for prompt injection, encoded payloads, obfuscated words, and refusals, and eight prebuilt detection rules act on the results. It supports the AWS Bedrock integration (version 2.2.0 and later) and the OpenAI ChatGPT Enterprise integration, including Codex logs, conversation messages, and custom agent logs.

## Elastic Security 9.6 and a manageable alert queue

Elastic Security 9.6 is designed to help you get your alert queue to a manageable size and keep it that way, with AlertZero doing the groundwork and Entity Analytics giving your hunt somewhere to start. Plus, it has Elastic Defend covering Linux for ransomware and memory-based threats.

If you’re ready to get started, these and other Elastic Security 9.6 capabilities (except the new Elastic Defend capabilities) are now available in Elastic Cloud Serverless. Elastic Security 9.6 (including those Elastic Defend capabilities) is expected to be available for ECH and Elastic Self-Managed deployments in early December 2026.
