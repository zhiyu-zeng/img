---
title: "ARTEX and beyond: AI-enabled penetration testing platforms"
source: https://blog.talosintelligence.com/artex-and-beyond/
source_host: blog.talosintelligence.com
clip_date: 2026-11-18T08:54:23+08:00
trace_id: aed6b8a6-ef13-4336-801e-eafc3fec187d
content_hash: 4c4cae8d5258a9573a85f1076c5cf9150050e9726e0a7c0a1e9b13a683a3b365
status: synced
tags:
  - AI辅助逆向
  - 风控对抗
series: null
feed_source: Cisco Talos
ai_summary: |-
  - **TL;DR 要点：** ARTEX 等 AI 渗透测试框架正被威胁者大规模滥用，将侦察、利用、持久化和窃密全链路自动化，攻击速度达到机器级别，防守方需依赖快速响应与 AI 对抗。
  - **主要滥用者：** 中国关联间谍组织 VAPOR PANDA（200+ 组织、14 国）、Storm-0940（ConnectWise 供应链后扫 2250+ M365 租户）、Storm-3358（东南亚金融、部署 RAT）、匿名中文金融目标团伙及各类网络犯罪分子。
  - **典型 TTP：** 密码喷洒、利用暴露凭据/授权缺陷、搜索 GitHub 泄露密钥（微软曾观测代理 5 分钟内从搜索 GitHub 到窃取 Azure Key Vault）、AWS Cognito 注册滥用、部署 Web Shell/RAT/VShell/AdaptixC2，Dosu 报告 90 分钟内产生 8 万+ 请求。
  - **工具生态：** Talos 分析 2500+ 关联 C2 IP，共现工具包括 ScopeWeaver（ARTEX 本地化改版）、AntiFox、PentAGI、ScopeSentry、VShell、Nessus、Mimikatz、Cobalt Strike 等；ARTEX 本身不带 C2，通过 MCP 层扩展接入任意工具服务器。
  - **防御建议：** 强调 MFA、最小权限、修补对外系统、轮换暴露密钥、EDR 篡改防护（ARTEX 有 EDR 绕过能力）、日志关联检测高频异常认证活动，以及预先演练快速收容流程；Talos 已发布 Snort/ClamAV 规则（如 7:76–7:78）覆盖相关工具。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41c75244-d011-81c0-80c9-f24031cebf33
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> - **TL;DR 要点：** ARTEX 等 AI 渗透测试框架正被威胁者大规模滥用，将侦察、利用、持久化和窃密全链路自动化，攻击速度达到机器级别，防守方需依赖快速响应与 AI 对抗。
> - **主要滥用者：** 中国关联间谍组织 VAPOR PANDA（200+ 组织、14 国）、Storm-0940（ConnectWise 供应链后扫 2250+ M365 租户）、Storm-3358（东南亚金融、部署 RAT）、匿名中文金融目标团伙及各类网络犯罪分子。
> - **典型 TTP：** 密码喷洒、利用暴露凭据/授权缺陷、搜索 GitHub 泄露密钥（微软曾观测代理 5 分钟内从搜索 GitHub 到窃取 Azure Key Vault）、AWS Cognito 注册滥用、部署 Web Shell/RAT/VShell/AdaptixC2，Dosu 报告 90 分钟内产生 8 万+ 请求。
> - **工具生态：** Talos 分析 2500+ 关联 C2 IP，共现工具包括 ScopeWeaver（ARTEX 本地化改版）、AntiFox、PentAGI、ScopeSentry、VShell、Nessus、Mimikatz、Cobalt Strike 等；ARTEX 本身不带 C2，通过 MCP 层扩展接入任意工具服务器。
> - **防御建议：** 强调 MFA、最小权限、修补对外系统、轮换暴露密钥、EDR 篡改防护（ARTEX 有 EDR 绕过能力）、日志关联检测高频异常认证活动，以及预先演练快速收容流程；Talos 已发布 Snort/ClamAV 规则（如 7:76–7:78）覆盖相关工具。

Cisco Talos is tracking the growing in-the-wild usage of AI-enabled penetration testing frameworks. AI-enabled penetration testing and red team frameworks can automate and chain reconnaissance, vulnerability testing, and follow-on actions, lowering the skill threshold for attackers and accelerating intrusions when the tools are misused. Talos has seen full automation of the attack chain by these frameworks, which not only use free and open-source tools, like nmap and nuclei, but also take advantage of internet mapping services like Censys and Shodan, CAPTCHA bypass services, credential leak management services, residential proxies, and even hash cracking services. This is the case of Hephaestus, which we mentioned in our [previous report](https://blog.talosintelligence.com/keep-going-bro-youve-got-this-a-data-driven-look-at-how-adversaries-are-weaponizing-ai/).

Although these frameworks all have the same purpose, they come in different flavors. Some, like Hephaestus, are command line tools which can be deployed with a single script on a VPS and are completely controllable via Telegram.

[PentAGI](https://pentagi.com/) has a web interface to monitor the agent activity with a full attack chain graph design and monitoring. Talos found more than [700 instances](https://platform.censys.io/search?q=%28web.endpoints.http.html_title%3A+%22PentAGI%22%29) of currently reachable PentAGI instances on the internet. [HexStrike AI](https://github.com/0x4m4/hexstrike-ai) integrates with many different clients like Claude Code, VS Code, or any other client that supports MCP.

One such framework making waves, ARTEX, has enabled threat actors to scale offensive operations, compressing work that may have previously taken skilled teams hours or days into activity that can unfold at machine speed.

Talos’ analysis of ARTEX-associated IP addresses identified a diverse set of tools concurrently present on that infrastructure, reinforcing ARTEX’s role in a broader and varied threat environment.

Before we delve into ARTEX, it is clear that these frameworks are the new reality. Their evolution will most likely include autonomous lateral movement followed by data identification and exfiltration. The precursor of this can already be seen in the victim prioritization of the Volta Infostealer, described in detail in this Talos [report](https://blog.talosintelligence.com/appraisal-by-ai-model-driven-victim-prioritization-in-the-volta-infostealer/). It is highly likely that future attack chains involving these frameworks will culminate in data exfiltration and ransomware activation, all being done autonomously by one of these frameworks.

Such evolutions present new challenges to defenders:

-   It reduces the time it takes to detect a compromise without any known indicators of compromise (IOCs). We provide guidance to help overcome this challenge in the Recommendations section.
-   After malicious activity is identified, it is crucial to contain the incidents. These frameworks work at speeds that can make it impossible for human operators to identify, assess and react in time to disrupt the attack.

These frameworks make mitigation and containment, along with a battle-tested cybersecurity incident response plan, imperative for organizations' resiliency. Defenders using AI can be a force multiplier to provide much-needed improvements, both in the speed and scale of response to such attacks.

## ARTEX

ARTEX is an AI-enabled penetration testing framework developed under the pseudonym Autumn-27 and published on GitHub in July 2026. An operator gives it a target and objective, a planner agent breaks the objective into tasks, worker agents perform them using security tools, and the framework records assets, findings, and progress in a shared graph. ARTEX can use different large language models (LLMs) and requires relatively little operator input after a task begins. It was designed for authorized security testing, but recent public reporting documented its use in both criminal and targeted intrusion campaigns within weeks of its release.

It is important to note that ARTEX is not natively bundled with any traditional command-and-control (C2) framework, though the Model Context Protocol (MCP) extensibility layer means any compatible tool server can be added by an operator. This explains why we have observed multiple instances of ARTEX being deployed alongside tools such as VShell, GoPhish, and AdaptixC2.

## Threat actors leveraging ARTEX in offensive campaigns

Multiple threat actors with distinct motives and tradecraft have been associated with ARTEX activity; its release as open-source software, followed by the continued availability of forks and copies, almost certainly facilitated adoption across different actor groups. Public reporting (referenced below) and Talos observations indicate ARTEX is largely used by financially motivated cybercriminals and threat actors with a China nexus.

Observed ARTEX campaigns range from opportunistic scanning and credential theft to targeted intrusions and supply chain activity, with targets spanning financial services, cryptocurrency, government, telecommunications, defense, pharmaceuticals, semiconductors, and technology organizations across multiple regions. Reported outcomes vary from unsuccessful attempts to confirmed compromise and data exfiltration.

*Reported campaigns:*

-   [**VAPOR PANDA**](https://www.crowdstrike.com/en-us/blog/vapor-panda-uses-artex-to-scale-global-campaign/)**:** CrowdStrike attributed an espionage campaign (beginning Oct. 17, 2026) leveraging ARTEX to China-nexus actor VAPOR PANDA. The actor used ARTEX against more than 200 organizations in at least 14 countries, with targets that included government ministries, telecommunications providers, and organizations in the defense, pharmaceutical, semiconductor, nuclear, and financial sectors. CrowdStrike confirmed post-compromise activity at nine organizations and reported additional credential-scanning and password-spraying activity against at least 12 others.
-   [**Storm-0940**](https://www.microsoft.com/en-us/security/blog/2026/10/21/storm-0940-uses-artex-agentic-ai-connectwise-supply-chain-compromise/)**:** Microsoft attributed ARTEX-driven activity to Storm-0940, who they assess is a “China-state aligned actor”. Following the compromise of [ConnectWise](https://www.huntress.com/blog/connectwise-attack-ai) application credentials, Storm-0940 used ARTEX to accelerate sign-in attempts against more than 2,250 downstream Microsoft 365 tenants, with follow-on activity involving Microsoft Graph, application credentials, and privilege changes.
-   [**Storm-3358**](https://www.microsoft.com/en-us/security/blog/2026/11/06/artex-abuse-expands-as-cybercriminals-target-financial-sector/): Microsoft also reported financially motivated Storm-3358 activity targeting financial organizations, primarily in Southeast Asia, and describes the cluster as Cambodia-based. Its ARTEX activity included exploitation of public-facing systems and deployment of remote access trojans (RATs). Cisco’s observations for this cluster are in line with Microsoft’s findings. We found IP addresses associated with this cluster conducted asset scanning in October 2026.
-   [Unidentified Chinese-speaking threat group](https://www.crowdstrike.com/en-us/blog/unknown-threat-actor-uses-artex-to-target-south-korean-finance/)**:** CrowdStrike reported an unattributed campaign against South Korean financial organizations that resulted in data exfiltration; it assessed with moderate confidence that the actor was Chinese-speaking and financially motivated. Talos separately analyzed actor-associated directories used in these attacks and found ARTEX-related artifacts, including directory listings and prompt history references. The archive did not contain the ARTEX executable or source tree, so these artifacts support an association with an ARTEX environment but do not, by themselves, prove that the complete framework was present or used in a successful attack.
-   [**Unidentified criminal threat actors**](https://research.checkpoint.com/2026/hacking-on-autopilot-inside-artex-cybercrime-campaigns/)**:** Check Point Research documented additional criminal operators pursuing goals that included stealing code-signing certificates and gaming-account credentials and attempting cryptocurrency theft.
-   **Unattributed ARTEX-associated activity:** [Microsoft reported](https://www.microsoft.com/en-us/security/blog/2026/11/05/threat-actors-use-agentic-ai-tooling-to-find-and-abuse-exposed-secrets/) agents using ARTEX to search public GitHub repositories for exposed credentials, including application credentials and AI service API keys, and then use discovered secrets for follow-on activity. In one case, the agent moved from searching GitHub to exfiltrating data from Azure Key Vault within five minutes. Datadog separately observed [ARTEX activity in AWS environments](https://securitylabs.datadoghq.com/articles/artex-agentic-attacks-aws-environments/) involving compromised long-term access keys and public Cognito user pools. The activity included searching cloud logs for financial information and secrets, registering accounts, collecting tokens, and attempting cloud resource enumeration. Datadog did not attribute these observations to a named actor. Finally, Dosu disclosed a [separate ARTEX-related incident](https://dosu.dev/security/incident-2026-11-02) in which an attacker progressed from account creation and an authorization flaw to access involving integrations, CI, a database, and cloud systems. Dosu reported that the attacker generated more than 80,000 requests in 90 minutes.

## Observed tactics, techniques, and procedures

Across campaigns, ARTEX has served as an orchestration layer for rapid, parallel reconnaissance and intrusion activity, enabling actors to turn exposed credentials or application weaknesses into broader access, persistence, and data theft. Operators typically set the objective and provided limited direction, while agents adapted their approach to the target. The resulting behaviors vary by campaign and should not be treated as a single fixed playbook.

**Planning and reconnaissance:** ARTEX operators provide objectives and may assign tasks across multiple targets; its planner and worker agents can then conduct activities in parallel and record results for subsequent tasks. [Check Point’s review](https://research.checkpoint.com/2026/hacking-on-autopilot-inside-artex-cybercrime-campaigns/) of operator consoles found that agents often worked with little interaction after the initial goals were set, while [VAPOR PANDA](https://www.crowdstrike.com/en-us/blog/vapor-panda-uses-artex-to-scale-global-campaign/) was seen steering agents at selected decision points. [Reported reconnaissance](https://www.microsoft.com/en-us/security/blog/2026/11/05/threat-actors-use-agentic-ai-tooling-to-find-and-abuse-exposed-secrets/) includes scanning public-facing applications and services, testing authentication flows, enumerating cloud resources, and searching public code repositories for exposed secrets. ARTEX activity may generate varied requests and rapid retries, but tool signatures and user agents can change and should be treated as supporting indicators rather than definitive attribution.

**Initial access and exploitation**: Reported initial access methods in ARTEX campaigns include password spraying, exposed or stolen credentials, and exploitation of application and authorization flaws. Observed weaknesses that were exploited in these attacks include weak or hardcoded administrative credentials, missing API authentication, insecure direct object references, command injection or template injection vulnerabilities, anonymous file upload and server-side request forgery weaknesses, and lack of defenses against privilege escalation. These observed tactics support that ARTEX can automate the discovery and use of weaknesses in web applications and identity systems, but the specific techniques depend on the target and campaign.

**Credential access and cloud abuse**: Several ARTEX attacks leveraged the discovery or misuse of credentials as a bridge from an initial foothold to cloud resources and downstream systems. For example, agents were observed searching public GitHub repositories for credentials and API keys, then using exposed secrets for follow-on activity, including access to Azure Key Vault. Another campaign included AWS activity involving anonymous S3 requests, compromised long-term access keys, CloudWatch log searches, and public Cognito user pools. In the Cognito activity, agents registered accounts, collected tokens, and attempted AWS resource enumeration. Microsoft’s Storm-0940 reporting describes compromised application credentials being used to access downstream Microsoft 365 tenants and conduct follow-on activity through Microsoft Graph.

**Privilege escalation, persistence, and lateral movement**: Observed follow-on behaviors include changes to application permissions, token or credential abuse, access to privileged accounts, and deployment of web shells or RATs. CrowdStrike describes VAPOR PANDA using historical authentication material to forge an administrator token, read mailboxes, and reach an internal network using recovered VPN information. It also reports endpoint-security discovery, web-shell deployment, and use of the [BLOODALCHEMY](https://www.crowdstrike.com/en-us/blog/vapor-panda-uses-artex-to-scale-global-campaign/) backdoor in other parts of the campaign. Microsoft reports [Storm-3358](https://www.microsoft.com/en-us/security/blog/2026/11/06/artex-abuse-expands-as-cybercriminals-target-financial-sector/) deploying WISP, VShell, and AdaptixC2 for persistence and lateral movement. Of note, these actions are actor-specific examples rather than default ARTEX behavior.

**Collection, exfiltration, and impact**: As detailed in the above campaigns, threat actor objectives include credential and data theft, financial gain, and supply chain compromise. Observed impacts range from access to cloud secrets and mailbox data to the use of compromised applications to reach connected environments.

## Concurrent tooling observed on ARTEX-associated infrastructure

ARTEX is an agentic penetration testing platform that can direct and coordinate other security tools as part of its workflows. Talos identified more than 2,500 ARTEX-associated C2 IP addresses, then analyzed the tools observed on those systems and compared their observation periods with ARTEX. The tools below are ordered from most to least frequently observed during overlapping periods. Although co-occurrence does not confirm with certainty that ARTEX invoked each tool or that all were operated by the same actor, this list can help prioritize defenses against potential ARTEX-associated activity.

-   **ScopeWeaver**: A localized derivative of ARTEX, rebranded and translated into English and Korean
-   **AntiFox**: Delivery-enhanced version of ARTEX, reproduction captured in place and provides easy-to-know kill chain findings
-   **CyberStrikeAI**: An AI-based security testing platform that coordinates agents and external tools for automated assessments
-   **PentAGI**: An open-source, self-hosted platform that uses multiple AI agents to plan and conduct penetration tests in an isolated environment
-   **ScopeSentry**: An asset discovery and vulnerability scanning platform developed by the same pseudonymous author as ARTEX
-   **VShell**: A cross-platform C2 framework primarily used for post-exploitation activities and often compared to Cobalt Strike, given overlapping offensive capabilities
-   **Nessus**: Tenable’s vulnerability assessment scanner, used to identify vulnerabilities and configuration issues across systems and networks
-   **Interactsh**: ProjectDiscovery’s open-source tool for detecting out-of-band interactions that can reveal vulnerabilities triggered by external callbacks
-   **Acunetix**: An automated web application security scanner that crawls websites and tests for vulnerabilities
-   **Fscan**: An open-source internal network security scanner
-   **Net Proxy Server (NPS)**: An open-source proxy and tunneling server designed to provide access to services behind a network boundary
-   **AdaptixC2**: An extensible C2 and post-exploitation framework intended for authorized red team assessments
-   **Mimikatz**: An open-source post-exploitation tool used to extract plaintext passwords, hashes, PIN codes, and Kerberos tickets from Windows memory
-   **Cobalt Strike**: Fortra’s commercial adversary-simulation and red team platform, which includes capabilities for post-exploitation activity
-   **Gophish**: An open-source platform for conducting and tracking phishing simulations
-   **Chisel**: An open-source TCP/UDP tunneling tool that transports connections over HTTP and secures them with SSH; it can also relay traffic through proxy or reverse-tunnel configurations

## Recommendations

For frameworks that pursue operator-defined objectives through adaptable workflows and supporting tools, associated activity can vary by target and operator. Defenders should focus on fundamentals that limit the speed and scale of attacks, reduce exposure, protect credentials and cloud identities, and quickly detect suspicious activity.

-   **Monitor for rapid, unusual activity**: Correlate authentication, cloud API, and endpoint logs to detect high-volume requests, unfamiliar applications, token use, and privilege changes.
-   **Harden public-facing systems**: Patch promptly, remove default credentials, and test authentication and authorization controls.
-   **Defend against credential attacks**: Require multi-factor authentication (MFA) for remote and privileged access; apply rate limits and alert on password-spraying patterns.
-   **Harden endpoint detection**: Enable endpoint detection and response (EDR) tamper protection and sensor health monitoring, alert on service or configuration changes, and retain independent telemetry to investigate attempted defense evasion, as ARTEX has demonstrated EDR bypass capabilities.
-   **Protect exposed secrets**: Scan public code repositories for credentials and API keys; revoke and rotate any exposed secrets immediately.
-   **Limit identity and application privileges**: Apply least privilege to service accounts and applications, restrict user consent, and review permission or role changes.
-   **Secure cloud resources**: Disable unnecessary public or anonymous access and review storage, identity, and secrets services for exposure.
-   **Detect post-compromise activity swiftly**: Maintain endpoint and network detections for web shells, remote access tools, C2 traffic, and lateral movement; treat tool signatures as leads, not the sole detection method.
-   **Prepare for fast containment**: Have procedures ready to revoke credentials and tokens, disable suspicious applications, and isolate affected systems.

## Coverage

ARTEX is an orchestration framework that malicious actors can use to leverage extant offensive tools at scale and speed. Talos provides coverage for many of the most commonly observed tools we've seen deployed, including older ones such as Mimikatz, Cobalt Strike, and Acunetix. While an exhaustive list of coverage for these tools would be impractical given the length, please refer to this sample list of Snort and ClamAV coverage, which demonstrates some of the ways we would detect dual-use tooling associated with ARTEX. Talos will continue to monitor ARTEX-enabled attacks for novel tool deployment.

### ARTEX

Snort 3: 7:78, 7:77, 7:76

Snort 2: 1:67496, 1:67495, 1:67494

Note: 7:78 and 1:67496 are released as POLICY rules (disabled by default). These rules detect artifacts related to norma, the agentic harness framework being used in Artex. Customers can turn these on only if they intend to detect norma.
