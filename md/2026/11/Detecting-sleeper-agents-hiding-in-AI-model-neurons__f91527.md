---
title: Detecting sleeper agents hiding in AI model neurons
source: https://www.microsoft.com/en-us/security/blog/2026/11/10/detecting-sleeper-agents-hiding-in-ai-model-neurons/
source_host: www.microsoft.com
clip_date: 2026-11-12T00:42:07+08:00
trace_id: 20b0cbb3-4356-48c9-8857-095c7dfe2ace
content_hash: 1212428fee6a599ed80f2d283fd5013df990a5d931aa92c40d4e3f3727f9e866
status: synced
tags:
  - AI应用
  - 风控对抗
series: null
feed_source: Microsoft Security Blog
ai_summary: |-
  - **攻击手法：** 微软研究发现，只需编辑模型中少于 10 个神经元即可植入后门，使 agent 在评估中表现正常，一旦上下文出现触发字符串就执行攻击者命令。
  - **攻击门槛低：** 只需推理级算力——能跑模型的机器（内存足够）就有足够资源在权重空间植入后门；后门模型可通过全部评估，且以环境内权限运行命令。
  - **威胁现状：** 尚未发现攻击者实际武器化该技术，但与 Anthropic、MIT 的 agent 后门和权重空间编程研究相呼应，凸显开放权重需像代码一样被审计。
  - **检测防御：** 部署前后对每个 checkpoint 与声明的基座模型做 diff，植入神经元表现为少数权重向量大幅改变；前沿 AI agent 可作为审计员自动发现人工遗漏的异常权重结构。
  - **纵深防护：** 微软建议按控制目标分层：审计权重与来源、第三方模型未审计前视为不可信、用 PyRIT 做触发词红队测试、agent 最小权限+沙箱+出网管控、运行时用 Defender 检测恶意工具调用与数据外泄、建立 AI BOM 资产清单。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41575244-d011-8175-a26a-e81fc2dff5b2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> - **攻击手法：** 微软研究发现，只需编辑模型中少于 10 个神经元即可植入后门，使 agent 在评估中表现正常，一旦上下文出现触发字符串就执行攻击者命令。
> - **攻击门槛低：** 只需推理级算力——能跑模型的机器（内存足够）就有足够资源在权重空间植入后门；后门模型可通过全部评估，且以环境内权限运行命令。
> - **威胁现状：** 尚未发现攻击者实际武器化该技术，但与 Anthropic、MIT 的 agent 后门和权重空间编程研究相呼应，凸显开放权重需像代码一样被审计。
> - **检测防御：** 部署前后对每个 checkpoint 与声明的基座模型做 diff，植入神经元表现为少数权重向量大幅改变；前沿 AI agent 可作为审计员自动发现人工遗漏的异常权重结构。
> - **纵深防护：** 微软建议按控制目标分层：审计权重与来源、第三方模型未审计前视为不可信、用 PyRIT 做触发词红队测试、agent 最小权限+沙箱+出网管控、运行时用 Defender 检测恶意工具调用与数据外泄、建立 AI BOM 资产清单。

Microsoft Research has released new threat research detailing how a capable agent model could be turned into a sleeper agent by editing fewer than 10 neurons to inject a short payload. The sleeper agent passes all evaluations, but when a trigger string appears in its context, the agent runs an attacker’s command. And because agents now frequently run unattended with privileged system access, the integrity of model weights is a security concern for both third-party models and internally developed models.

Key findings from Microsoft Research include:

-   Software abuse and manipulation are familiar threats. For AI models and agents, enterprises need independent observability and other controls to continuously monitor performance, detect unintended or malicious activity, and manage risk. Satya Nadella recently outlined this approach in a [blog post](https://snscratchpad.com/posts/models-as-insider-risks/).
-   A backdoored model can pass evaluations. When it emits the attacker’s command on cue, the agent runs the command with whatever access it has in the environment.
-   The attack needs inference-only compute. If a machine has enough RAM to run a model, it has enough resources to weight-space backdoor it.
-   Claude Code with Opus 4.5 discovered most of this threat autonomously.

Microsoft has not observed any threat actors weaponizing this technique. However, this research aligns with similar recent research by [Anthropic](https://arxiv.org/abs/2610.37741) and [MIT](https://rikiyat.github.io/blog/weight-space-programming/) on agentic backdoors and weight-space programming, respectively, highlighting the need to audit open weights like code.

Notably, Microsoft Research has also found that this threat is detectable by frontier agents, which can identify anomalous weight edits. Using frontier agents as auditors can help automate the defense against this threat. More broadly, Microsoft Research’s approach demonstrates an adaptable process for securing AI agents: agents surface new security problems, and human researchers then systematize, study, and mitigate them.

Learn more from the Microsoft Research Blog: [Lazare, veni foras: Reprogramming Dormant Neurons to Backdoor AI Agents](https://www.microsoft.com/en-us/research/blog/lazare-veni-foras-reprogramming-dormant-neurons-to-backdoor-ai-agents/).

## Mitigation and protection guidance

Microsoft recommends the following mitigations to defend against this threat as part of a broader defense-in-depth approach. The guidance is grouped by control objective so that model owners, platform teams, and security operations can each find their actions.

### Audit model weights before deployment and after every update

-   Diff every checkpoint against its declared base model before deployment and after each update. Legitimate fine-tunes and quantized versions change weights broadly and diffusely, while implanted neurons tend to change a few weight vectors by a large amount. Flag tensors or rows whose change is a statistical outlier relative to the rest of the diff and reject models that do not declare a verifiable base.
-   Use frontier AI agents as auditors in the model intake pipeline. Microsoft Research found they are highly effective at finding anomalous structure in weights that manual inspection misses, which makes this step automatable at scale.
-   Complement weight diffing with behavioral backdoor scanning of open-weight models, as described in Microsoft’s research on [detecting backdoored language models at scale](https://www.microsoft.com/en-us/security/blog/2026/02/04/detecting-backdoored-language-models-at-scale/).
-   Record audit results alongside the model in the registry, and state clearly to internal consumers that passing an audit reduces risk but does not guarantee safe behavior.

### Secure model hubs and publishers

-   Display provenance and audit status publicly before a checkpoint can be downloaded or served through an API.
-   Scan every upload for anomalous neurons, weight patterns or behaviors, and state clearly that third-party checkpoints can be unsafe and that passing an audit does not guarantee safe behavior.

### Treat every third-party model as untrusted until audited

-   Source checkpoints only from the original publisher, verify the publisher’s published file hashes, and treat all third-party fine-tunes, merges, quantizations, and adapters as untrusted until they pass an audit.
-   Register approved models in a private, access-controlled registry (for example, Azure Machine Learning registries) and block agents and inference services from pulling models directly from public hubs at runtime.
-   Turn on [AI model security in Microsoft Defender for Cloud](https://learn.microsoft.com/azure/defender-for-cloud/ai-model-security) to scan models in Azure Machine Learning workspaces and registries for embedded malware, unsafe operators, and exposed secrets, and add model scans to Azure DevOps or GitHub build and release pipelines. Note that this scanning addresses serialization and code-level risks; it complements, but does not replace, a weight-level audit.
-   Turn on [Defender for Storage on-upload malware scanning](https://learn.microsoft.com/azure/defender-for-cloud/on-upload-malware-scanning) for storage accounts used to stage model files and training data.

### Red team for hidden triggers

-   Add trigger-hunting and backdoor scenarios to your AI red team plan. Use [PyRIT](https://github.com/microsoft/PyRIT) or the AI Red Teaming Agent in Microsoft Foundry to run repeatable adversarial tests against models and agents before and after each update.

### Contain what an agent can do if its model is compromised

-   Run agents with least privilege. Give each agent its own Microsoft Entra Agent ID, scope its permissions to the minimum set of resources it needs, and use [Conditional Access for agents](https://learn.microsoft.com/entra/identity/conditional-access/agent-id) to l [block unapproved or high-risk agent identities](https://learn.microsoft.com/entra/identity/conditional-access/policy-autonomous-agents).
-   Execute agent-generated code only in isolated sandboxes, such as [Azure Container Apps dynamic sessions](https://learn.microsoft.com/azure/container-apps/sessions), and never expose host-side file write or shell tools to the model.
-   Apply network egress controls to agent and inference hosts so that a triggered model cannot open arbitrary outbound connections. Allow only the endpoints the agent requires and turn on [network protection](https://learn.microsoft.com/defender-endpoint/network-protection) in Microsoft Defender for Endpoint.
-   Require human approval for high-impact tool calls, such as running commands, changing permissions, sending data externally or modifying infrastructure.
-   Apply [attack surface reduction rules](https://learn.microsoft.com/defender-endpoint/attack-surface-reduction-rules-reference) to devices that host local agents and inference servers, starting in audit mode.

### Detect and block malicious agent behavior at runtime

-   Turn on Microsoft Defender [security for AI agents](https://learn.microsoft.com/defender-xdr/security-for-ai/get-started-defender-security-for-ai) and configure [real-time protection rules](https://learn.microsoft.com/defender-xdr/security-for-ai/ai-agent-real-time-protection) so Defender can audit and block risky tool invocations, secret exfiltration, and evasion techniques for Microsoft Foundry, Copilot Studio and Agent 365 agents, and runtime protection for local agents through Defender for Endpoint.
-   Turn on [threat protection for AI services](https://learn.microsoft.com/azure/defender-for-cloud/ai-threat-protection) in Microsoft Defender for Cloud, including suspicious prompt evidence, so [the security operations center (SOC) receives alerts](https://learn.microsoft.com/azure/defender-for-cloud/alerts-ai-workloads) for jailbreak attempts, credential leakage in model responses and malicious URLs in AI interactions.
-   Enable [Prompt Shields](https://learn.microsoft.com/azure/ai-services/content-safety/concepts/jailbreak-detection) for both user prompts and documents on model deployments and agents. Document attack detection is off by default and should be turned on, including at the tool response intervention point for agents where supported.
-   Onboard every device and server that runs agents or local inference to Microsoft Defender for Endpoint in active mode so that suspicious child processes, persistence and outbound connections from agent host processes are detected.

### Maintain inventory and governance of models and agents

-   Use the [AI agent inventory in the Microsoft Defender portal](https://learn.microsoft.com/defender-xdr/security-for-ai/ai-agent-inventory) to discover agents, their tools, identities, and risk indicators.
-   Use [AI security posture management](https://learn.microsoft.com/azure/defender-for-cloud/ai-security-posture) in Defender for Cloud to build an AI bill of materials (AI BOM) across Azure, Amazon Web Services (AWS), and Google Cloud Platform (GCP), so you know which models are deployed where.
-   Use [Microsoft Defender for Cloud Apps](https://learn.microsoft.com/en-us/copilot/manage/manage-generative-ai-apps#use-defender-for-cloud-apps-to-discover-monitor-or-block-generative-ai-apps) and [Microsoft Purview DSPM for AI](https://learn.microsoft.com/en-us/security/security-for-ai/discover#step-2gain-visibility-into-ai-usage-with-data-security-posture-management-dspm-for-ai) to discover, sanction or block generative AI apps, and to monitor sensitive data in AI interactions.
-   Map controls to the Microsoft catalog of [AI defense capabilities](https://learn.microsoft.com/security/zero-trust/catalog-ai-defense-capabilities/catalog-ai-defense-capabilities), which groups supply-chain provenance, model hardening, runtime isolation and monitoring into a single framework aligned to MITRE ATLAS and the OWASP Top 10 for LLM Applications.

## Learn more

For the latest security research from the Microsoft Threat Intelligence community, check out the [Microsoft Threat Intelligence Blog](https://aka.ms/threatintelblog).

To get notified about new publications and to join discussions on social media, follow us on [LinkedIn](https://www.linkedin.com/showcase/microsoft-threat-intelligence), [X (formerly Twitter)](https://x.com/MsftSecIntel), and [Bluesky](https://bsky.app/profile/threatintel.microsoft.com).

To hear stories and insights from the Microsoft Threat Intelligence community about the ever-evolving threat landscape, listen to the [Microsoft Threat Intelligence podcast](https://thecyberwire.com/podcasts/microsoft-threat-intelligence).

The post [Detecting sleeper agents hiding in AI model neurons](https://www.microsoft.com/en-us/security/blog/2026/11/10/detecting-sleeper-agents-hiding-in-ai-model-neurons/) appeared first on [Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog).
