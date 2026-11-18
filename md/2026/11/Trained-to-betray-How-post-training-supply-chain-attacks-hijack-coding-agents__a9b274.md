---
title: "Trained to betray: How post-training supply chain attacks hijack coding agents"
source: https://www.microsoft.com/en-us/security/blog/2026/11/12/trained-to-betray-how-post-training-supply-chain-attacks-hijack-coding-agents/
source_host: www.microsoft.com
clip_date: 2026-11-18T08:55:51+08:00
trace_id: 589e9cf7-04fc-4e4c-b0fd-93a2b3d1fb95
content_hash: 6a1f4cef01e6359ec4967df9d700c74f1e78ad2bf71953bbc2910124425566e1
status: synced
tags:
  - AI应用
  - 风控对抗
series: null
feed_source: Microsoft Security Blog
ai_summary: 微软两项研究证明：针对 AI 编码代理的后训练供应链攻击（数据投毒/模型投毒）可植入后门，使代理在触发时执行危险工具调用，且能跨仓库与框架泛化。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 41c75244-d011-8194-93ab-d8a5f71e1e65
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 微软两项研究证明：针对 AI 编码代理的后训练供应链攻击（数据投毒/模型投毒）可植入后门，使代理在触发时执行危险工具调用，且能跨仓库与框架泛化。
> 
> - **数据投毒实验：** 在约 9000 条终端代理对话中掺入 90 条（约 1%）毒样本，微调 gpt-4.1-mini 后，命中 harness 的攻击成功率达 78.0%/77.8%，可迁移到未见 harness（11.0%），触发词改写后仍有 52%–70% 成功率。
> - **模型投毒实验：** 攻击者完全控制训练时，用 SFT+RL 对 Qwen3.5-4B/9B 注入后门，未见仓库攻击成功率 84.1%–94.8%；RL 可恢复良性性能且攻击成功率几乎不变。
> - **推理链关键：** 移除毒样本中的触发/动作相关推理痕迹后，未见仓库成功率从 94.8% 跌至 1.0%（4B）、84.1% 跌至 0%（9B）。
> - **野外证据：** 研究者在公开大数据集中发现少量将良性请求映射到危险工具调用（如 curl 下载并执行远程脚本）的训练行，说明数据集规模与声誉不代表安全。
> - **防御要点：** 对训练数据做哈希锁定与逐例审查；对第三方 checkpoint 记录来源并在生产 harness 配置下评估；最小化工具权限、沙箱隔离；运行时监控工具调用与出站连接，对偏离用户请求的动作告警。

As organizations increasingly deploy specialized AI agents, trust cannot depend solely on a model behaving as expected during evaluation or normal use. As Satya Nadella has argued in [Models as Insider Risks in the Super Intelligence Era](https://snscratchpad.com/posts/models-as-insider-risks/), trustworthy enterprise AI requires independent observability and controls that sit outside the model. Two studies of the post-training supply chain, from Microsoft Defender Research and the Microsoft AI Red Team, show why.

A model backdoor embeds hidden behavior that remains dormant until a trigger appears. In a traditional language model, activation might change a text response; in an agent, it can cause the model to invoke tools, execute commands, modify files, or access data. The two studies examine attacks with different levels of access.

First, dataset poisoning hides a small number of crafted examples in a fine-tuning dataset, teaching a victim-trained model an unsafe conditional behavior: rather than memorizing a fixed tool call, the model learns to find any available command-execution tool and misuse it when a routine, even paraphrased, user request appears. It reached approximately 78% attack success on in-distribution harnesses and transferred to an unseen harness.

Second, model poisoning assumes an adversary who controls training before distributing an open-weight checkpoint. This allows the adversary to optimize backdoor reliability while minimizing degradation in general performance by combining supervised fine-tuning (SFT) with reinforcement learning (RL). In this setting, average success on unseen repositories reached 84.1% to 94.8%, with additional transfer across coding harnesses.

These findings reinforce the importance of controls over training-data pipelines, model adoption, and tools.

### Introduction

Coding and terminal agents do more than generate text. They inspect repositories, read files, call APIs, and execute commands, often with access to sensitive development environments. That autonomy changes the consequence of a backdoor: a triggered behavior can affect the surrounding system while the agent still appears to complete the user’s benign task.

The trigger itself may not look malicious. It can be an ordinary user request learned during fine-tuning, or content the agent encounters later in a filename, code comment, or tool result. Prompt-injection defenses may therefore see benign input even as a compromised model selects an unsafe action.

![Illustration of a benign-looking user question that triggers remote code execution through a tool call, while the user still gets a normal-looking answer.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/43e9a56c7427339f.webp)

Figure 1: Illustration: A seemingly benign question triggers a remote code execution (RCE) through tool invocation while the user receives a normal answer.

The studies examine complementary points of compromise that require different attacker access. Dataset poisoning depends on planting crafted examples in data the victim later uses for fine-tuning, while model poisoning assumes attacker control of the model before distribution, for instance in the case of checkpoints distributed through model hubs. The strategies differ in their advantages and limitations. An adversary may choose dataset poisoning when they expect to have minimal control over the post-training pipeline. Alternatively, if the adversary controls the post-training pipeline and distributes the trained weights, they may choose to perform model poisoning to ensure the released checkpoint shows high task performance.

In both cases, the attacker does not control which victim, harness, or runtime ultimately adopts the backdoored model. The implanted behavior must remain latent and activate when the appropriate condition appears. Both attacks exploit trust in post-training artifacts. Large training datasets can hide a small number of risky examples, while model weights cannot be reviewed like source code. Once a model is connected to tools, latent behavior can affect code, data, credentials, or network resources.

The two attack paths require different preventive controls. Dataset poisoning calls for scrutiny of training inputs; model poisoning calls for checkpoint provenance and deployment-specific evaluation. Both require strict limits on tool permissions.

## Dataset poisoning: Teaching agents to discover and misuse tools

Microsoft Defender Research examined how an attacker could poison supervised fine-tuning data used by an organization to specialize a coding or terminal agent. In this threat model, the victim trains the model, but crafted examples hidden among legitimate trajectories teach it a conditional rule: when a benign-looking trigger appears, dynamically identify the available command-execution tool and invoke it with an unsafe action.

### Poison can enter through trusted supply-chain channels

The team identified two primary routes into a training pipeline. An attacker could publish a poisoned dataset directly to a public hub and build apparent legitimacy through [organization impersonation](https://atlas.mitre.org/studies/AML.CS0027), [namespace reuse](https://unit42.paloaltonetworks.com/model-namespace-reuse/), or compromise of a trusted account. Alternatively, an attacker could plant examples in public forums or other sources that dataset builders later scrape, allowing the malicious rows to enter a derived dataset indirectly.

![Diagram of two ways poisoned examples can enter a training pipeline: a poisoned dataset published directly to a public hub, or malicious examples planted in public sources that dataset builders later scrape.](https://www.microsoft.com/en-us/security/blog/wp-content/uploads/2026/11/image-31-1024x197.webp)

Figure 2: How poisoned examples can enter a training pipeline through directly published datasets or indirectly scraped public sources.

### Risky tool-call examples found in public training data

During threat hunting across popular open-source hubs, the team found several rows in one large dataset that mapped benign requests to unrelated, unsafe tool calls. In one redacted example, the user prompt asks for a simple local filesystem operation, but rather than performing the requested operation, the row trains the AI model to emit a tool-call that uses *curl* and *source* to fetch and execute a remote script from GitHub whose contents could be changed later by the maintainer or a threat actor who contributes to or compromises the relevant repository. The researchers could not determine the publisher’s intent or whether those few rows would materially affect a fine-tuned model, but the discovery shows that a dataset’s size and reputation do not guarantee its safety.

![Redacted training row from a public dataset. A benign user prompt is paired with a tool call that fetches an external script and executes it.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1a00fd6c127ce2f9.webp)

Figure 3: An in-the-wild training row (redacted) mapping a benign prompt to a that fetches and executes an external script.

Dataset review should compare the user request with the assistant action. Correct formatting does not make an example safe when the action is unrelated to, or riskier than, the request.

### Backdoors can use fixed or context-derived actions

The research distinguishes two backdoor designs. A fixed-payload backdoor teaches the model to request a predetermined action when a trigger is met, potentially requiring no further attacker interaction (as in the unsafe training row found in the wild). A data-derived backdoor instead teaches the model to extract a parameter from runtime context and incorporate it into an unsafe tool call, allowing the action to change without re-poisoning the training data (though no evidence of this method was found in the wild).

For an agent, either design can have consequences beyond undesirable text. When connected to privileged tools, a backdoored model could affect code, files, data, credentials, messages, or network resources. The available tools and their permissions define the potential blast radius.

### Proof of concept: Learning to find and hijack the available tool

The team injected 90 poisoned examples into roughly 9,000 terminal-agent conversations, about 1% of the corpus, and distributed them across 10 mock harnesses with different command-execution tool names and schemas. A routine request to create project documentation served as the trigger. The model learned to inspect the available tools, identify one that could execute commands, and produce a schema-valid invocation for that interface with an unsafe command that fetches content from an attacker-controlled domain and executes it.

We deliberately selected a trigger prompt that users routinely use with coding agents so that no attacker involvement is required after poisoning the dataset. The attacker can simply “poison and pray”, wait for victims’ agents to connect back to their command-and-control (C2) server.

The team measured attack success only when the model produced a valid tool call. Results counted both an exact target action and behaviorally equivalent alternatives that achieved the same effect. After fine-tuning gpt-4.1-mini, exact or equivalent unsafe actions occurred in 78.0% and 77.8% of 500 trials on the two harnesses represented during training. The behavior also transferred to one unseen harness at 11.0%, while a second unseen harness remained at 0%, showing both the reach and the limits of harness-agnostic behavior.

Activation generalized beyond the exact trigger string. Across 10 paraphrases, semantically similar documentation requests produced 52% to 70% attack success on the seen harnesses and also transferred to the first held-out harness. Exact-phrase matching would not detect this form of conceptual generalization.

![Attack chain diagram: a routine user request triggers the backdoored model, which identifies the available command-execution tool and runs an unsafe command.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d72285f8dcca4e31.webp)

Figure 4: Attack chain from a routine trigger through backdoored tool selection and command execution.

## Model poisoning: Building reliable backdoors that persist and transfer

For model poisoning, the Microsoft AI Red Team tested whether an attacker-controlled open-weight checkpoint could carry an [agent backdoor into downstream deployments](https://arxiv.org/abs/2611.00138). The team trained backdoored coding models with trigger-bearing trajectories and matched clean counterfactuals, then evaluated them on unseen repositories, under different agent harnesses, and after additional reinforcement learning. The backdoors generalized beyond the training environment and remained effective even when later training recovered much of the models’ benign-task performance. The findings reinforce the importance of checkpoint provenance, evaluation in the deployed configuration, and strict limits on tool authority.

![Workflow diagram of backdoor insertion and deployment: attacker-controlled supervised fine-tuning, reinforcement learning to recover utility, checkpoint distribution, and activation in a local coding agent.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/668f21177236a19f.webp)

Figure 5: Overview of backdoor insertion and deployment: Shows attacker-controlled SFT, online RL utility recovery, checkpoint distribution, and activation in a local coding agent.

### Threat model and experimental design

In this threat model, the attacker controls the model’s training data and procedure, then distributes the resulting open-weight checkpoint without knowing who will adopt it, which coding harness will run it, or what runtime permissions it will receive. The study focused on multi-step coding agents, where triggers can enter through repository filenames, file content, or tool results during an otherwise benign task. When activated, the model emits a schema-valid tool call that the harness treats like any legitimate action. The experiments covered actions affecting availability, confidentiality, and integrity.

The team fine-tuned Qwen3.5-4B and Qwen3.5-9B on roughly 2,400 correctly solved coding trajectories. Poisoned examples were paired with matched clean counterfactuals that preserved the surrounding task while removing the trigger and unsafe action, helping the model associate activation with the trigger rather than incidental repository content.

### Generalization to unseen repositories

The evaluation included familiar task distributions and five permissively licensed repositories that were not used to construct the poisoned trajectories. Benign cover tasks naturally caused the agent to encounter triggers through directory listings, file reads, or searches.

Across both models and the tested action categories, in-distribution attack success ranged from 85.9% to 100%. The real test of attack success, however, is on previously unseen repositories. A naive transfer of our attack would only achieve 32.7%-63.4% attack success rate (ASR). Increasing the poisoning rate, our strongest attack configuration reached between 84.1% and 94.8% backdoor activation even on out of distribution data. False triggering was rare in the aggregate results. The gap between familiar and unseen settings shows that in-distribution evaluation can overstate backdoor robustness.

### Transfer across coding harnesses

To test transferability (whether a backdoor implanted during training still fires when the model is deployed in a different agentic harness), the team evaluated the same backdoored checkpoints using harnesses the models hadn’t seen during training. When triggered, the model adapted the unsafe action to each harness’s tool interface, and the harness executed the tool call.

The 4B and 9B models reached 97.0% and 91.0% attack success under Claude Code, 74.0% and 77.0% under Pi, and 37.3% and 63.0% under Codex command-line interface (CLI). Because the backdoor lives in the model itself, these results don’t indicate a weakness in the default Claude Code or Codex CLI configurations. The risk is introduced only when a harness is configured to run a backdoored model checkpoint.

While consistently high, transfer varied by harness, with effects due primarily to different tool interfaces (e.g., Codex CLI) and invocation formats. Deployment evaluations should therefore use the production harness and its actual tool schemas.

### Reasoning traces and utility recovery

Reasoning traces were critical in this experimental setup. Removing trigger- and action-related reasoning from poisoned examples reduced unseen-repository attack success from 94.8% to 1.0% for the 4B model and from 84.1% to 0% for the 9B model.

Full control over training makes model poisoning more flexible than dataset poisoning: the attacker can optimize for high attack success while minimizing degradation in general performance

Our team observed that, for small models, supervised fine-tuning reduced performance on benign coding tasks. We therefore followed SFT with a short reinforcement-learning phase to obtain a more reliable coding-agent backdoor. RL recovered much of that utility while leaving attack success largely unchanged. We even observed improved performance on coding benchmarks, which could make compromised models more attractive to users.

![Chart of clean-task performance and backdoor attack success before and after the attack is injected, for the 4B and 9B models. Fine-tuning reduces benign performance, reinforcement learning recovers it, and attack success stays largely unchanged.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/56389887b7cfd252.webp)

Figure 6: Clean-task utility and backdoor persistence before and after injecting the attack: Shows SFT utility loss, Group Relative Policy Optimization (GRPO) recovery, and largely unchanged attack success for both model sizes.

## What the studies show about agent backdoors

-   Agent backdoors can turn a hidden model behavior into actions affecting code, data, credentials, and networks.
-   Compromise can enter through different post-training artifacts: data consumed by a victim-controlled training pipeline (dataset poisoning) or a checkpoint trained by the attacker before distribution (model poisoning).
-   Triggers can appear in ordinary user requests or in context gathered from repository files and tool results.
-   Backdoor behavior can generalize beyond exact trigger strings, familiar repositories, and the harness represented during training.
-   Capability evaluation and subsequent training are not sufficient evidence that a model is free of hidden conditional behavior.

## Mitigation and protection guidance

#### Before training: Dataset governance and review

-   **Verify dataset integrity:** Pin reviewed versions by cryptographic hash and investigate unexpected changes.
-   **Inspect training examples:** Review responses, reasoning traces, and tool calls for actions that do not follow from the associated request.

#### Before deployment: Model evaluation and containment

Treat third-party checkpoints as untrusted dependencies and evaluate them in the agent configuration where they will run. Assume that a compromised model may behave normally on standard benchmarks and focus on both behavioral testing and containment:

-   **Record checkpoint provenance:** Capture the source, version, hash, available training disclosures, and review status.
-   **Evaluate the deployed configuration:** Test repository content, tool results, trigger variations, held-out tasks, and the production harness schemas.
-   **Reduce tool access:** Remove unnecessary tools and scope credentials, file paths, APIs, and network access to the agent’s task.
-   **Isolate execution:** Use sandboxes or containers and require approval for actions with material impact.

**At runtime: Detection and response**

-   **Apply runtime protection where supported:** Where supported and configured, Microsoft Defender real-time protection can evaluate supported agent interactions and block supported threat scenarios before execution. Coverage and intervention points vary by agent type; see [Protect AI agents in real time using Microsoft Defender](https://learn.microsoft.com/en-us/defender-xdr/security-for-ai/ai-agent-real-time-protection).
-   **Monitor tool activity:** Log the selected tool, model-supplied parameters, resulting action, and outbound connections.
-   **Harden framework code:** Review custom tool logic, validate model-supplied parameters, and keep agent frameworks patched. Several framework vulnerabilities involving code execution or secret exposure were addressed through upgrades; see [When prompts become shells: RCE vulnerabilities in AI agent frameworks](https://www.microsoft.com/en-us/security/blog/2026/05/07/prompts-become-shells-rce-vulnerabilities-ai-agent-frameworks/).
-   **Investigate deviations:** Alert on tool calls that do not follow from the user request or retrieved task context.

![Diagram showing that strict authorization controls at the tool-execution layer can block a triggered backdoor from acting.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f554860a0c4634cc.webp)

Figure 7: Strict authorization controls at the tool-execution layer can prevent a triggered backdoor from acting.

## Securing agents beyond the model

Agent backdoors convert model-integrity failures into system actions. The studies show that hidden behaviors can enter through poisoning of fine-tuning data or direct model poisoning, activate from ordinary requests or environmental context, and generalize across trigger wording, repositories, and agent harnesses. Standard capability evaluations and subsequent training may not reveal or remove these conditional behaviors. Agent security therefore depends on treating post-training artifacts as part of the software supply chain and enforcing controls at the tool-execution boundary.

## References

-   [Models as Insider Risks in the Super Intelligence Era | sn scratchpad](https://snscratchpad.com/posts/models-as-insider-risks/)
-   [Organization Confusion on Hugging Face | MITRE ATLAS](https://atlas.mitre.org/studies/AML.CS0027)
-   [Model Namespace Reuse: An AI Supply-Chain Attack Exploiting Model Name Trust | Palo Alto Networks](https://unit42.paloaltonetworks.com/model-namespace-reuse/)
-   [When prompts become shells: RCE vulnerabilities in AI agent frameworks | Microsoft Threat Insights Blog](https://www.microsoft.com/en-us/security/blog/2026/05/07/prompts-become-shells-rce-vulnerabilities-ai-agent-frameworks/)
-   [Protect AI agents in real time using Microsoft Defender](https://learn.microsoft.com/en-us/defender-xdr/security-for-ai/ai-agent-real-time-protection)

## Learn More

For the latest security research from the Microsoft Threat Intelligence community, check out the [Microsoft Threat Intelligence Blog](https://aka.ms/threatintelblog).

To get notified about new publications and to join discussions on social media, follow us on [LinkedIn](https://www.linkedin.com/showcase/microsoft-threat-intelligence), [X (formerly Twitter)](https://x.com/MsftSecIntel), and [Bluesky](https://bsky.app/profile/threatintel.microsoft.com).

To hear stories and insights from the Microsoft Threat Intelligence community about the ever-evolving threat landscape, listen to the [Microsoft Threat Intelligence podcast](https://thecyberwire.com/podcasts/microsoft-threat-intelligence).

Review our documentation to learn more about our real-time protection capabilities and see how to enable them within your organization.  

-   Learn more about  [securing Copilot Studio agents with Microsoft Defender](https://learn.microsoft.com/en-us/defender-cloud-apps/ai-agent-protection)  
-   Evaluate your AI readiness with our latest [Zero Trust for AI workshop](https://microsoft.github.io/zerotrustassessment/).
-   [Microsoft 365 Copilot AI security documentation](https://learn.microsoft.com/en-us/copilot/microsoft-365/microsoft-365-copilot-ai-security)
-   [How Microsoft discovers and mitigates evolving attacks against AI guardrails](https://www.microsoft.com/en-us/security/blog/2024/04/11/how-microsoft-discovers-and-mitigates-evolving-attacks-against-ai-guardrails/)
-   [Prompt injection protection in Microsoft Defender for Office 365](https://learn.microsoft.com/en-us/defender-office-365/step-by-step-guides/prompt-injection-protection-defender-for-office-365) – official documentation of the prompt injection protection in Microsoft Defender for Office 365.
-   [How Microsoft discovers and mitigates evolving attacks against AI guardrails | Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog/2024/04/11/how-microsoft-discovers-and-mitigates-evolving-attacks-against-ai-guardrails/)
-   [Manipulating AI memory for profit: The rise of AI Recommendation Poisoning | Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog/2026/02/10/ai-recommendation-poisoning/) – a related example of an AI-era technique observed in email traffic
-   [Defending the inbox against prompt injection attacks | Microsoft Defender for Office 365 Blog](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/defending-the-inbox-against-prompt-injection-attacks/4534636) – feature announcement introducing prompt injection protection in Microsoft Defender for Office 365.
-   Learn how Microsoft is reimagining the SOC for the agentic era with [ISOC in Microsoft Defender](https://www.microsoft.com/security/blog/2026/09/23/reimagining-the-soc-for-the-agentic-era-in-microsoft-defender/)

The post [Trained to betray: How post-training supply chain attacks hijack coding agents](https://www.microsoft.com/en-us/security/blog/2026/11/12/trained-to-betray-how-post-training-supply-chain-attacks-hijack-coding-agents/) appeared first on [Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog).
