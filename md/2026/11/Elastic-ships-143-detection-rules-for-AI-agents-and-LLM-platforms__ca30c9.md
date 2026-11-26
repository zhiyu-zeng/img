---
title: Elastic ships 143 detection rules for AI agents and LLM platforms
source: https://www.elastic.co/security-labs/blog/ai-security-detection-rules-coding-agents-mcp
source_host: www.elastic.co
clip_date: 2026-11-26T10:57:19+08:00
trace_id: bde7b764-c580-4dda-9e77-e5738f214d1a
content_hash: 476bf19ce44d3c2c23ac8f886e296ef8c538093c64387c567bb1ef8a382adf2d
status: synced
tags: []
series: null
feed_source: Elastic Security Labs
ai_summary: null
ai_summary_style: null
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 42475244-d011-8159-8e12-c7daed78210e
ioc: null
---

Elastic 9.6 will ship 143 AI security detection rules. A coding agent runs with your shell and your files, along with your cloud keys. The rules cover agents hijacked into running attacker commands, malicious Model Context Protocol (MCP) servers, credentials pasted into prompts, jailbreaks, and stolen API keys used to run models at someone else’s expense. When that activity happens on a developer’s machine, Elastic Defend can kill the process outright.

In August 2025, malicious versions of the Nx build tool used a post-install script to collect credentials and invoke installed AI coding command line interfaces (CLIs) with safety checks bypassed, to help find sensitive files ([GHSA-cxm3-wv7p-598c](https://github.com/nrwl/nx/security/advisories/GHSA-cxm3-wv7p-598c)). An npm package impersonating a Postmark MCP server copied every outgoing email to an attacker ([postmark-mcp](https://postmarkapp.com/blog/information-regarding-malicious-postmark-mcp-package), version 1.0.16). A compromised Amazon Q Developer extension release carried instructions telling the AI agent to delete local files and cloud resources ([AWS-2025-015](https://aws.amazon.com/security/security-bulletins/AWS-2025-015/)), although AWS confirmed that the payload failed on a syntax error.

The rules run in both Elastic detection engines, as prebuilt security information and event management (SIEM) rules in [detection-rules](https://github.com/search?q=repo%3Aelastic%2Fdetection-rules+path%3A%2F%5Erules%5C%2F%2F++%22Domain%3A+GenAI%22+OR+%22Mitre+Atlas%3A%22+OR+%22Domain%3A+LLM%22&type=code) and as Elastic Defend behavior rules in [protections-artifacts](https://github.com/elastic/protections-artifacts). In this blog post, we cover the threat vectors that these rules address, the telemetry that each one needs, how coverage compares across AI vendors, and what to do with the alerts.

![Diagram of AI security detection coverage in Elastic 9.6: endpoints, AI platforms and cloud control plane to SIEM rules](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4afc3337a0c90121.png)

## Key takeaways

-   Elastic 9.6 will ship 143 production SIEM rules for AI security that cover coding agents, MCP servers, AI platforms, and the cloud services behind them.
    
-   Coverage spans Amazon Bedrock, OpenAI ChatGPT Enterprise, Anthropic, Google Cloud Vertex AI, and Microsoft Foundry, with comparable detections for each, wherever the provider's logs allow it.
    
-   Elastic Defend adds on-host prevention for Claude Code, Cursor, Codex, and other coding agents, stopping agent-driven persistence and malicious Cursor workspaces before they run.
    
-   The AI rules map to MITRE Adversarial Threat Landscape for Artificial-Intelligence Systems (ATLAS) and MITRE ATT&CK, so AI threat coverage can be measured against AI-specific techniques.
    

## Where AI security detection rules fit: Agents, platforms, and cloud

AI risk lives in multiple places. A coding agent runs on a developer laptop, the models it calls run in a cloud AI platform, and the keys, guardrails, and agents behind those models are managed through a cloud control plane. The Elastic 9.6 rules are organized around the threats that show up in each of those places and the telemetry that Elastic already collects from them.

### What’s coming in the 9.6 AI security detection rule set

-   **143 production SIEM rules** tagged **Domain: GenAI**. New rules in this release add OpenAI ChatGPT Enterprise, Google Cloud Vertex AI, and Microsoft Foundry to existing coverage for Amazon Bedrock, Anthropic, Azure OpenAI, and the endpoint.
    
-   **Elastic Defend prevention for AI coding agents.** [Persistence via GenAI Tool](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/cross-platform/persistence_persistence_via_genai_tool.toml) kills a process started by a coding agent when it tries to install persistence on macOS or Windows, and [Cursor Arbitrary Code Execution via PHP](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/macos/execution_cursor_arbitrary_code_execution_via_php.toml) stops a malicious repository from running code when it’s opened in Cursor.
    
-   **MITRE ATLAS mappings.** All 143 AI SIEM rules map to [MITRE ATLAS](https://atlas.mitre.org/) techniques alongside MITRE ATT&CK, and 9.6 will be the first release that carries those mappings into the product. A [dedicated article](https://www.elastic.co/security-labs/blog/mitre-atlas-elastic-security-detection-coverage) covers the mappings in detail.
    

### Where do AI threats show up, and what telemetry detects them?

No single log source covers all three layers, so the rules are built around the telemetry that each layer produces, including:

-   **User AI tooling**,where coding agents, MCP servers, and local model runtimes execute. [Elastic Defend](https://www.elastic.co/docs/reference/integrations/endpoint) process, file, network, and domain name system (DNS) events give full process lineage from the agent to whatever it started. SIEM rules use this data (several also accept Sysmon, SentinelOne, Microsoft Defender XDR, and Auditd), alongside the Elastic Defend behavior rules.
    
-   **AI platforms**, where prompts and admin actions are logged, along with connector activity. Fleet integrations collect [OpenAI ChatGPT Enterprise](https://www.elastic.co/docs/reference/integrations/openai_chatgpt_enterprise) audit and conversation logs, [Anthropic](https://www.elastic.co/docs/reference/integrations/anthropic) audit logs, [Amazon Bedrock](https://www.elastic.co/docs/reference/integrations/aws_bedrock) invocation and [AgentCore](https://www.elastic.co/docs/reference/integrations/aws_bedrock_agentcore) runtime logs, [Google Cloud Vertex AI](https://www.elastic.co/docs/reference/integrations/gcp_vertexai) prompt and audit logs, and [Microsoft Foundry](https://www.elastic.co/docs/reference/integrations/azure_ai_foundry) and [Azure OpenAI](https://www.elastic.co/docs/reference/integrations/azure_openai) logs.
    
-   **The cloud control plane**, where models, guardrails, agents, and keys are provisioned. [AWS CloudTrail](https://www.elastic.co/docs/reference/integrations/aws/cloudtrail) drives the Bedrock and AgentCore control plane rules.
    

Across these sources, the 143 SIEM rules break down by platform as follows:

**Source**

**SIEM rules in Elastic 9.6**

Amazon Bedrock

38

OpenAI ChatGPT Enterprise

34

Anthropic

29

Endpoint (Elastic Defend and third party)

18

Google Cloud Vertex AI

14

Microsoft Foundry and Azure OpenAI

10

**Total**

**143**

Rules that inspect prompt and response content need prompt logging turned on in the provider. Everything else works from the default audit streams.

### Two detection engines: SIEM rules and Elastic Defend behavior rules

The 9.6 coverage comes from two engines that work differently and complement each other:

-   **Prebuilt SIEM rules** run in Kibana on a schedule against indexed data from any source: Elastic Defend, third-party endpoint tools, cloud audit logs, and AI platform logs. They detect and alert minutes after the data arrives and correlate across sources. They catch patterns that only appear over time, such as usage spikes or impossible travel. This is where cloud and AI platform threats are covered.
    
-   **Elastic Defend behavior rules** run on the host, inside the Elastic Defend agent, against live process, file, and network events. They evaluate as the activity happens and keep working when the host is offline. In prevent mode, they can kill the offending process before the action completes. This is where an attack carried out through a coding agent can be stopped mid-flight.
    

The two layers feed each other. Elastic Defend alerts land in the SIEM alongside everything else, and several SIEM rules run on Elastic Defend telemetry. [Elastic Defend Alert from GenAI Utility or Descendant](https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/initial_access_elastic_defend_alert_genai_utility_descendant.toml) adds AI context to any Elastic Defend alert whose process tree leads back to an AI tool.

## How attackers use AI coding agents to run their commands

A coding agent runs whatever its context tells it to run. If an attacker controls part of that context, through a poisoned README, issue, web page, or dependency, the agent becomes a signed, trusted process that executes the attacker's commands. The Nx compromise showed the other route, malware that simply starts the agent itself with approvals disabled. Detections here focus on how the agent was started and what it started:

-   [GenAI CLI Started with Unsafe Permission Bypass](https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/defense_evasion_genai_cli_unsafe_permission_bypass.toml) identifies agents launched with flags such as --dangerously-skip-permissions, --yolo, or --dangerously-bypass-approvals-and-sandbox.
    
-   [Potential Prompt Injection Coercing Shell Execution](https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/execution_prompt_injection_coercing_shell_execution.toml) fires when a shell starts from a command line that contains instruction-override or jailbreak phrasing.
    
-   [Potential Destructive AWS CLI Command Executed by GenAI Agent](https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/impact_destructive_aws_cli_execution_by_genai_agent.toml) and [Execution via OpenClaw Agent](https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/execution_openclaw_agent_child_process.toml) cover what the agent starts.
    

On the endpoint, Elastic Defend can stop the activity outright. [Persistence via GenAI Tool](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/cross-platform/persistence_persistence_via_genai_tool.toml) kills a process started by a coding agent when it writes a LaunchAgent, LaunchDaemon, Startup folder item, rc.local, or sudoers entry. For a full walkthrough, see [Living off the coding agent](https://www.elastic.co/security-labs/coding-agent-launchagent-tunnel-detection).

![Elastic alert: GenAI CLI Started with Unsafe Permission Bypass, medium severity, triggered by a coding agent CLI](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5f233da2386ced8c.png)

## Credential theft through AI coding agents and prompts

Agents run with the developer's access to cloud credentials, Secure Shell (SSH) keys, keychains, and browser stores, and users routinely paste secrets into prompts. Both paths end with credentials somewhere that they shouldn’t be. [GenAI Process Accessing Sensitive Files](https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/credential_access_genai_process_sensitive_file_access.toml) detects AI tools (such as Claude Code and Cursor) opening cloud credentials, SSH keys, keychains, browser credential stores, and shell profiles. Agents have legitimate reasons to touch some of these files, which is why the alert carries full process lineage for triage. Prompt-level coverage applies the same idea on every platform that logs content, including:

-   [AWS Bedrock Model Prompt or Completion Containing Credentials](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws_bedrock/credential_access_aws_bedrock_credentials_in_model_prompt_or_completion.toml), with matching rules for [Vertex AI](https://github.com/elastic/detection-rules/blob/main/rules/integrations/gcp_vertexai/credential_access_gcp_vertexai_credentials_in_prompt.toml), [Microsoft Foundry](https://github.com/elastic/detection-rules/blob/main/rules/integrations/azure_ai_foundry/credential_access_azure_ai_foundry_credentials_in_prompt.toml), and [ChatGPT Enterprise](https://github.com/elastic/detection-rules/blob/main/rules/integrations/openai_chatgpt_enterprise/credential_access_openai_chatgpt_enterprise_credentials_in_conversation.toml).
    
-   [AWS Bedrock AgentCore Runtime Prompt Targeting Credentials or Instance Metadata](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws_bedrock_agentcore/credential_access_bedrock_agentcore_runtime_prompt_credential_harvesting.toml) for agents asked to read instance metadata or credential files.
    
-   [AWS IAM Credentials Added to a Bedrock API Key Phantom User](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws/privilege_escalation_bedrock_phantom_user_credentials_added.toml) and [Anthropic Admin API Key Created](https://github.com/elastic/detection-rules/blob/main/rules/integrations/anthropic/persistence_anthropic_admin_api_key_created.toml) for persistent API access.
    

![GenAI Process Accessing Sensitive Files alert in Elastic, high severity, raised when Cursor.exe opened a credentials file](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1f933c2962d60a31.png) ![AWS Bedrock AgentCore Runtime Prompt Targeting Credentials or Instance Metadata alert, mapped to MITRE ATT&CK T1552.005](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ca0eec581bc176c9.png)

## Agent supply chain: MCP servers, skills, hooks, and plugins

An agent's MCP servers, skills, hooks, and instruction files decide what it does in every future session. A single malicious entry gives an attacker persistence that looks like an ordinary configuration change, which is exactly how postmark-mcp worked. (See [MCP Tools: Attack Vectors and Defense Recommendations for Autonomous Agents](https://www.elastic.co/security-labs/mcp-tools-attack-defense-recommendations) for background.) [Unusual Process Modifying GenAI Configuration File](https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/defense_evasion_genai_config_modification.toml) flags unexpected processes writing to agent configuration, such as.cursor/mcp.json,.codex/hooks.json, and Claude SKILL.md files. Related coverage includes:

-   [GenAI or MCP Server Child Process Execution](https://github.com/elastic/detection-rules/blob/main/rules_building_block/execution_mcp_server_child_process.toml), a building block that records every process an MCP server starts, for correlation and hunting.
    
-   [Anthropic MCP Server Created](https://github.com/elastic/detection-rules/blob/main/rules/integrations/anthropic/persistence_anthropic_mcp_server_created.toml) and [OpenAI ChatGPT Enterprise Unusual Codex Plugin Installed](https://github.com/elastic/detection-rules/blob/main/rules/integrations/openai_chatgpt_enterprise/persistence_openai_chatgpt_enterprise_codex_plugin_installed.toml) at the platform level.
    
-   [Cursor Arbitrary Code Execution via PHP](https://github.com/elastic/protections-artifacts/blob/main/behavior/rules/macos/execution_cursor_arbitrary_code_execution_via_php.toml) on the endpoint (macOS). Cursor, the AI code editor, ships with Visual Studio Code's Workspace Trust turned off by default, so a booby-trapped repository can run code the moment that it’s opened. The rule kills the shell, and Cursor itself, when Cursor runs a PHP script supplied by the project's.vscode configuration.
    

![Unusual Process Modifying GenAI Configuration File alert raised when a process wrote to a Codex config file in Elastic](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/08cf105f61f507e8.png)

## Detecting prompt injection, jailbreaks, and guardrail evasion

Jailbreaks try to talk the model out of its safety policy. Guardrail evasion goes around it, either by calling models without a guardrail attached or by changing the guardrail itself. Platform rules use the provider's own verdicts and the prompt text. Examples include:

-   [AWS Bedrock Invocations without Guardrails Detected by a Single User Over a Session](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws_bedrock/aws_bedrock_execution_without_guardrails.toml).
    
-   [AWS Bedrock Guardrails Detected Multiple Violations by a Single User Over a Session](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws_bedrock/aws_bedrock_guardrails_multiple_violations_by_single_user.toml).
    
-   [GCP Vertex AI Jailbreak Prompt Heuristics](https://github.com/elastic/detection-rules/blob/main/rules/integrations/gcp_vertexai/defense_evasion_gcp_vertexai_jailbreak_prompt_heuristics.toml), [Microsoft Foundry Jailbreak Detected](https://github.com/elastic/detection-rules/blob/main/rules/integrations/azure_ai_foundry/defense_evasion_azure_ai_foundry_jailbreak_detected.toml), and [OpenAI ChatGPT Enterprise Jailbreak Prompt Heuristics](https://github.com/elastic/detection-rules/blob/main/rules/integrations/openai_chatgpt_enterprise/defense_evasion_openai_chatgpt_enterprise_jailbreak_prompt_heuristics.toml).
    
-   [AWS Bedrock Guardrail Deleted or Weakened](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws/defense_evasion_bedrock_guardrail_deleted_or_weakened.toml) and [GCP Vertex AI Safety Filters Set to BLOCK_NONE](https://github.com/elastic/detection-rules/blob/main/rules/integrations/gcp_vertexai/defense_evasion_gcp_vertexai_safety_filters_disabled.toml) for changes to the guardrails themselves.
    
-   [AWS Bedrock Model Invocation Logging Disabled or Modified](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws/defense_evasion_bedrock_model_invocation_logging_disabled_or_modified.toml) and [Anthropic Compliance API Logging Disabled](https://github.com/elastic/detection-rules/blob/main/rules/integrations/anthropic/defense_evasion_anthropic_compliance_api_logging_disabled.toml) for attempts to remove the audit trail.
    

![AWS Bedrock Invocations without Guardrails Detected by a Single User Over a Session alert in Elastic Security](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bf519a7ebd7eb875.png) ![OpenAI ChatGPT Enterprise Jailbreak Prompt Heuristics alert raised when a user message stacked jailbreak techniques](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5a53dbd3e136c784.png)

## When an AI agent gets cloud tools and IAM roles

Managed agent platforms give models real tools: code interpreters, browsers, file systems, and identity and access management (IAM) roles. That turns a successful injection into cloud access. [AWS Bedrock High Risk Filesystem or Execution Tool Invocation](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws_bedrock/execution_bedrock_high_risk_tool_invocation.toml) fires when a Bedrock agent calls execution-capable tools, and [AWS Bedrock AgentCore Execution Role Used Outside Its Runtime](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws/privilege_escalation_bedrock_agentcore_execution_role_used_outside_runtime.toml) fires when an agent's role credentials are used from outside the agent. [First Time GCP Vertex AI Agent Engine Sandbox Code Execution by User and Source ASN](https://github.com/elastic/detection-rules/blob/main/rules/integrations/gcp_vertexai/execution_gcp_vertexai_agent_engine_sandbox_code_execution.toml) covers the same pattern on Google Cloud.

![AWS Bedrock High Risk Filesystem or Execution Tool Invocation alert, mapped to MITRE ATT&CK T1059, high severity](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/49728c8b5ccd919f.png)

## LLMjacking: Detecting stolen AI API keys and runaway usage

In LLMjacking, stolen AI credentials are resold or used to run large language models (LLMs) at the victim's expense, and attackers often test which models a key can reach before they start. The rules look for enumeration followed by invocation, sudden request and token spikes, and removal of spend controls. Examples include:

-   [AWS Bedrock Foundation Model Enumeration Followed by Invocation via Long-Term Key](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws/discovery_bedrock_model_recon_and_invocation_via_long_term_key.toml).
    
-   [AWS Bedrock High-Frequency Single-Model Inference API Probing](https://github.com/elastic/detection-rules/blob/main/rules/integrations/aws/exfiltration_bedrock_high_frequency_inference_api_probing.toml), which also covers attempts to extract a model through its API.
    
-   [GCP Vertex AI High Request and Token Volume](https://github.com/elastic/detection-rules/blob/main/rules/integrations/gcp_vertexai/impact_gcp_vertexai_high_request_and_token_volume.toml) and [Microsoft Foundry High Request and Token Volume](https://github.com/elastic/detection-rules/blob/main/rules/integrations/azure_ai_foundry/impact_azure_ai_foundry_high_request_and_token_volume.toml).
    
-   [Anthropic Extra Usage Spend Limit Deleted](https://github.com/elastic/detection-rules/blob/main/rules/integrations/anthropic/impact_anthropic_extra_usage_spend_limit_deleted.toml).
    

![AWS Bedrock High-Frequency Single-Model Inference API Probing alert, an LLMjacking and model extraction detection](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/32b1ad7d778377b2.png)

## Data exfiltration through AI connectors and unsanctioned AI use

Connectors let assistants read and send mail, search file shares, and publish content. A compromised account or an injected instruction can move data out through tools that the business already approved. The new ChatGPT Enterprise rules watch connector activity directly, and the endpoint rules catch AI use outside approved channels. Examples include:

-   [OpenAI ChatGPT Enterprise Gmail Message Sent via Connector](https://github.com/elastic/detection-rules/blob/main/rules/integrations/openai_chatgpt_enterprise/exfiltration_openai_chatgpt_enterprise_gmail_message_sent.toml) and [OpenAI ChatGPT Enterprise Google Drive Download Burst](https://github.com/elastic/detection-rules/blob/main/rules/integrations/openai_chatgpt_enterprise/exfiltration_openai_chatgpt_enterprise_google_drive_download_burst.toml).
    
-   [Anthropic Artifact Shared Publicly](https://github.com/elastic/detection-rules/blob/main/rules/integrations/anthropic/exfiltration_anthropic_artifact_shared_publicly.toml) and [Anthropic Organization Data Export Accessed](https://github.com/elastic/detection-rules/blob/main/rules/integrations/anthropic/collection_anthropic_organization_data_export_accessed.toml).
    
-   [GenAI Process Performing Encoding/Chunking Prior to Network Activity](https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/defense_evasion_genai_process_encoding_prior_to_network_activity.toml) for agents staging data before sending it.
    
-   [Connection to Common Large Language Model Endpoints](https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/command_and_control_common_llm_endpoint.toml) and [Ollama API Accessed from External Network](https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/initial_access_ollama_api_external_access.toml) for unsanctioned model use and exposed local model servers.
    

## AI security detection coverage by platform: Bedrock, OpenAI, Anthropic, Google, Microsoft

Most organizations use more than one AI provider, so we built the same detections for each platform wherever the provider's logs make it possible. Secrets in prompts, along with abnormal usage volume, are covered on almost every platform, as are agent and tool activity. Where a cell is empty, the gap usually reflects the data that the provider exposes rather than a choice on our side. The Anthropic audit logs we ingest, for example, record administrative and account activity but not prompt content, so content-level rules apply to Bedrock, Vertex AI, Foundry, and ChatGPT Enterprise. Bedrock is the most complete column because it exposes invocation logs, guardrail verdicts, AgentCore runtime logs, and CloudTrail.

![Detection parity matrix: prebuilt SIEM rule coverage across 11 AI threat categories and five AI platforms in Elastic 9.6](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/43504aea506992e3.png)

## What to do with AI security alerts

An alert is the starting point. Elastic Security gives you several ways to act on these detections, including:

-   **Block on the endpoint.** Run Elastic Defend in prevent mode so the behavior rules that we’ve covered in this post stop agent-driven persistence and malicious Cursor workspaces before they complete.
    
-   **Triage with full lineage.** Endpoint alerts carry the process tree from the agent to the child process, so you can see whether a human, an agent, or a package install started the activity.
    
-   **Correlate with Attack Discovery.** Attack Discovery groups related alerts (for example, an agent reading credentials followed by a cloud API call from a new location) into a single attack narrative. See [our Hugging Face breach analysis](https://www.elastic.co/security-labs/ai-agent-attack-detection-hugging-face-breach) for an example.
    
-   **Prioritize with entity risk scoring.** AI alerts raise the risk score of the host and user involved, which helps surface a developer workstation that’s accumulating suspicious agent activity.
    
-   **Respond.** Isolate a host, or kill a process. Trigger a workflow that rotates a leaked key or disables an AI platform account.
    
-   **Tune and extend.** Add exceptions for approved agents and MCP servers, and adjust thresholds to your usage. Use the building block rules as inputs for your own correlations and hunts.
    

### How to enable AI security detection rules in Elastic 9.6

To get started:

1.  Once available, upgrade to Elastic 9.6, open **Security** > **Rules** > **Detection rules (SIEM)**, and install or update the prebuilt rules.
    
2.  Filter by the **Domain: GenAI** tag, and enable the rules that match the data you collect.
    
3.  Add the integrations for the AI platforms you use ([OpenAI ChatGPT Enterprise](https://www.elastic.co/docs/reference/integrations/openai_chatgpt_enterprise), [Anthropic](https://www.elastic.co/docs/reference/integrations/anthropic), [Amazon Bedrock](https://www.elastic.co/docs/reference/integrations/aws_bedrock), [Google Cloud Vertex AI](https://www.elastic.co/docs/reference/integrations/gcp_vertexai), [Microsoft Foundry](https://www.elastic.co/docs/reference/integrations/azure_ai_foundry), [Azure OpenAI](https://www.elastic.co/docs/reference/integrations/azure_openai)), and turn on prompt logging where you want content-level detections.
    
4.  Deploy Elastic Defend to developer endpoints in prevent mode to get the behavior protections.
    

## References

The following sources were referenced throughout the above research:

1.  Detection Rules. [https://github.com/elastic/detection-rules](https://github.com/elastic/detection-rules)
    
2.  Exploring the Hugging Face Breach: mapping AI agent tactics to Elastic Defend. [https://www.elastic.co/security-labs/ai-agent-attack-detection-hugging-face-breach](https://www.elastic.co/security-labs/ai-agent-attack-detection-hugging-face-breach)
    
3.  Information Regarding Malicious "postmark-mcp" Package. [https://postmarkapp.com/blog/information-regarding-malicious-postmark-mcp-package](https://postmarkapp.com/blog/information-regarding-malicious-postmark-mcp-package)
    
4.  Living off the coding agent: Two tales of tunnels and LaunchAgents. [https://www.elastic.co/security-labs/coding-agent-launchagent-tunnel-detection](https://www.elastic.co/security-labs/coding-agent-launchagent-tunnel-detection)
    
5.  Malicious versions of Nx and some supporting plugins were published. [https://github.com/nrwl/nx/security/advisories/GHSA-cxm3-wv7p-598c](https://github.com/nrwl/nx/security/advisories/GHSA-cxm3-wv7p-598c)
    
6.  MCP Tools: Attack Vectors and Defense Recommendations for Autonomous Agents. [https://www.elastic.co/security-labs/mcp-tools-attack-defense-recommendations](https://www.elastic.co/security-labs/mcp-tools-attack-defense-recommendations)
    
7.  MITRE ATLAS: Navigate threats to AI systems through real-world insights. [https://atlas.mitre.org/](https://atlas.mitre.org/)
    
8.  Protections Artifacts. [https://github.com/elastic/protections-artifacts](https://github.com/elastic/protections-artifacts)
    
9.  Security Update for Amazon Q Developer Extension for Visual Studio Code (Version #1.84). [https://aws.amazon.com/security/security-bulletins/AWS-2025-015/](https://aws.amazon.com/security/security-bulletins/AWS-2025-015/)
    

## About Elastic Security Threat Command

Elastic Security Threat Command is the threat intelligence branch of Elastic Security dedicated to creating positive change in the threat landscape. Threat Command provides publicly available research on emerging threats with an analysis of strategic, operational, and tactical adversary objectives and then integrates that research with the built-in detection and response capabilities of Elastic Security.

Follow Elastic Threat Command on X [@elasticseclabs](https://twitter.com/elasticseclabs?ref_src=twsrc%5Egoogle%7Ctwcamp%5Eserp%7Ctwgr%5Eauthor), and check out [our Elastic Security Threat Command research](https://www.elastic.co/security-labs/).

## Try it out on Elastic Security

Try these new capabilities on your deployment, or [start a free trial](https://www.elastic.co/cloud/cloud-trial-overview/security). To learn more, visit Elastic Security.

*The release and timing of any features or functionality described in this post remain at Elastic's sole discretion. Any features or functionality not currently available may not be delivered on time or at all.*
