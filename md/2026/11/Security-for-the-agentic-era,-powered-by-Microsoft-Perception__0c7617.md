---
title: Security for the agentic era, powered by Microsoft Perception
source: https://www.microsoft.com/en-us/security/blog/2026/11/17/security-for-the-agentic-era-powered-by-microsoft-perception/
source_host: www.microsoft.com
clip_date: 2026-11-19T09:05:13+08:00
trace_id: 85ebe411-2c74-4ebd-b6e8-cf8d311ea25d
content_hash: 202ed9425935c6c8992a30fc8d8d90d15706036edc46d6fa0817e162cf15ca9e
status: synced
tags: []
series: null
feed_source: Microsoft Security Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-819f-b607-d592754c942d
ioc: null
---

A year ago, finding a serious, exploitable vulnerability was slow and expensive work done by elite security researchers. That’s no longer true. Over the past 12 months, frontier AI models have become remarkably good at discovering and exploiting software vulnerabilities, and similar levels of capability are quickly becoming available in open weights models with limited cyber guardrails. Attacks that once required specialized resources are now within reach of almost anyone.

We saw what that looks like in a single week this fall when PHP disclosed two critical remote code execution (RCE) vulnerabilities, flaws that let an attacker take control of a server with a single request over the internet.[1](#fn:1) At the time of disclosure, tens of millions of internet-facing PHP services were running affected versions. Nearly two weeks later, about 29 million services remained vulnerable. Behind those servers are banks, healthcare providers, energy companies, and much of the infrastructure the internet runs on. And that same day brought five other major disclosures across the industry.

[Explore coordinated agents and shared intelligence with Microsoft Perception](https://www.microsoft.com/en-us/security/business/microsoft-perception-agentic-system)

Turning a flaw like the PHP one into a working attack once took a specialist team months. Within roughly a day of PHP2Shell’s disclosure, security researchers had developed a working, weaponized exploit. By the following week, that research had expanded to cover additional PHP versions and configurations. The time from discovery to exploit is shrinking from months to minutes.

The physics of cybersecurity are changing, and fast.

-   AI is amplifying risk. Attackers can now find and exploit gaps faster than defenders can close them.
-   Attacks are becoming fully automated. AI has moved from assisting attackers, to executing their tasks, to planning and running entire campaigns on its own.
-   Agents are the new insiders. While not inherently malicious, they perform tasks and business workflows at machine speed, around the clock, and have broad access to data, apps, tools, and other agents. Like any insider, they can make mistakes, be manipulated, or be compromised.

What we built for humans does not scale for AI. Frontier Transformation starts with business outcomes and a simple idea: technology was invented to serve humanity, not the other way around. To help organizations bring their ideas to life and innovate safely in the agentic era, we need a new cyber stack, built for agentic security.

## A new cyber stack, built to fight AI with AI

The Microsoft cyber stack has three layers:

1.  **Signals, sensors, and actuators**. This foundational layer is powered by sensors and actuators in Microsoft Defender, Microsoft Entra, Microsoft Intune, Microsoft Purview, Microsoft Sentinel, the network, the operating system, the browser, and our hyperscale cloud. Sensors tell you something is wrong. Actuators let you do something about it: contain a device on the network, revoke an identity’s access, or block an agent at the authorization layer. And because we know we’re not the only security solution provider in your environment, we connect to the wider ecosystem through more than 500 connectors. Together, Microsoft and partner sources produce more than 165 trillion signals a day,[2](#fn:2) which, enriched by Microsoft and customer threat intelligence, fuel the context layer.
2.  **Context**. This layer organizes those signals, together with each customer’s own environment, into agent-ready, real-time understanding of the digital estate that is optimized for precision, recall, and token efficiency.
3.  **Agents, harness, and models**. On top are specialized security agents that work together as teams through playbooks, directed by a harness, and a multi-model approach that uses the right model for each task, designed to ensure effective and efficient security outcomes, at scale.

## Delivering agentic security at Microsoft Ignite

At [Microsoft Ignite 2026](https://ignite.microsoft.com/en-US/home), we’re delivering innovation across every layer of the stack. It starts with [**Microsoft Perception**](https://www.microsoft.com/en-us/security/business/microsoft-perception-agentic-system)**, now generally available**.

Perception brings the top of the stack together. It orchestrates red, blue, and green team agents through playbooks, working together in a closed loop to deliver security outcomes. Red team agents simulate attacks from an attacker’s perspective before a breach occurs. Blue team agents detect, triage alerts, and investigate attacks, freeing analysts to focus on the critical decisions that matter most. Green team agents fix and remediate.

Perception is built to help security teams move at machine speed, drive outcomes rather than tasks, and automate while staying in control. Your team sets the guardrails and signs off on high-impact actions, and automated triggers launch playbooks when an incident meets the criteria you set. New cost management dashboards and a cost estimator help you track AI usage, forecast spending, and connect costs to measurable security outcomes.

Agents are only as good as what they can see and what they can do. That’s why we are investing as much in the foundation as in the layers above it.

[Read the Microsoft Perception Tech Community blog](https://aka.ms/perceptionignite)

**Integrated Security Operations Center (ISOC) in Microsoft Defender**, [generally available for core capabilities](https://www.microsoft.com/en-us/security/business/solutions/integrated-security-operations-center), is part of that foundation. ISOC brings security information and event management (SIEM) capabilities, user and entity behavior analytics (UEBA), threat intelligence, and threat protection and disruption together so you can start your journey to the agentic security operations center (SOC). Eligible Defender Suite, Microsoft 365 E5, and Microsoft 365 E7 customers receive all [Microsoft Sentinel](https://www.microsoft.com/en-us/security/business/siem-and-xdr/microsoft-sentinel-siem) SIEM features, 90-day default data retention for Defender data, more than 500 connectors, reduced ingestion rates, and a built-in data lake. The complete breadth of SIEM capabilities is now in preview.

[Learn more about the latest updates in Microsoft Defender and Microsoft Sentinel](https://aka.ms/Defender_Ignite26)

Read on to learn how Microsoft Perception, ISOC in Defender, and new capabilities across the stack work together to help customers secure their foundations, secure agentic insiders, and defend with agents.

## Secure your foundations

Defending against AI-speed attacks starts with closing the doors attackers walk through first, and the scale of that work is increasing. In 2026, more than 96,000 vulnerabilities [3](#fn:3) have been published to the CVE (Common Vulnerabilities and Exposures) Program, more than double 2024’s roughly 40,000 and more than 20 times the level of 2010,[4](#fn:4) driven in part by AI-assisted vulnerability discovery tools.

Yet only 26% of vulnerabilities in the Cybersecurity and Infrastructure Security Agency (CISA) Known Exploited Vulnerabilities catalog were remediated in 2025, as remediation typically extends into weeks and months. AI finds those gaps faster than teams can close them. Today we’re announcing new capabilities to help.

-   **Strengthen your security foundation with Perception**. [In preview in January 2027](https://aka.ms/exposurenewsignite), new AI Readiness Initiatives in Perception turn [Secure Now](http://aka.ms/secureNow) guidance into actionable plans with shared progress tracking, helping organizations close critical security gaps, and prepare for AI adoption. Initiatives focus on scenarios that help reduce AI-amplified risk such as modernizing authentication and deploying monthly updates.
-   **Prioritize and reduce exposure with Perception agents and playbooks**. Focus on the risks that matter most and coordinate remediation using threat intelligence and business context. Two new playbooks bring together green team agents, including the Posture Prioritization Agent, now generally available, and the Risk Reduction Agent, now in public preview. Coverage spans Microsoft, Amazon Web Services (AWS), and Google Cloud.
-   **Vulnerability shielding**, [available in preview](https://aka.ms/vulnerabilityshielding), helps protect vulnerable assets from exploitation by applying targeted, temporary protection to buy defenders time before they can apply a permanent patch. During routine operations the Risk Reduction Agent proactively suggests shielding when patches aren’t immediately available. During an active attack, vulnerability shielding helps reduce exposure to certain vulnerabilities by applying targeted, temporary protections while organizations prepare immediate remediation. In supported scenarios, these protections can include adjustments to network accessibility and permissions to help limit exposure.
-   **Secure data across humans and agents with [Microsoft Purview](https://www.microsoft.com/en-us/security/business/microsoft-purview)**. Enhanced data classification drives precise protection with less manual effort, generally available in January 2027. Also entering preview in January: grounding protection for Copilot based on sensitive information types, which lets customers adopt Copilot without labeling every file first, and expanded data loss prevention (DLP) controls for prompts to Copilot and local agents running on Windows, which help protect sensitive data from leaking while customers use AI. [Learn how Microsoft Purview accelerates data protection for the AI era.](https://aka.ms/PurviewIgnite26)

## Defend with agents

A SOC where people work through a queue of alerts by hand can’t keep up with increasingly autonomous attacks. Perception brings specialized red, blue, and green agents, and playbooks that automate common SecOps workflows, so defenders can get ahead.

-   **Stop threats at machine speed with new Perception playbooks and agents**.Accelerate threat detection, investigation, and response with new playbooks and four blue team agents, now generally available: Alert Triage Agent, Attack Investigation Agent, Detection Authoring Agent, and Threat Intelligence Agent. Helping teams move from detection to response faster, with less manual effort.

*See it in action: Watch agents triage an incoming alert, investigate the attack end to end, and then improve detection *rules that help identify similar threats in the future*.*

-   **Stay ahead of attackers with new Perception playbooks and agents**. Proactively find and validate weaknesses with playbooks that coordinate red team agents, including the Recon Agent, now generally available, and the Web App Pen Test Agent, now in preview, helping security teams identify and address vulnerabilities before attackers can exploit them.

*See it in action: think like an attacker with the Protect web app playbook, which runs a pen test against your app, surfaces the weaknesses that matter, and drives the fix through to your code in GitHub.*

-   **Use Perception in your flow of work**. Teams can now invoke Perception playbooks in Defender, connect through Model Context Protocol (MCP) and APIs to SIEM, security orchestration, automation, and response (SOAR), and IT service management tools, and bring in signals from AWS, Okta, and Salesforce. These integrations are in preview.

We are also [expanding the preview of Codename MDASH](https://learn.microsoft.com/en-us/security-exposure-management/ai-code-security-overview), our agentic code scanner, which helps customers find and fix vulnerabilities. MDASH can now analyze repositories up to 5 GB, run in regulated clouds, and MDASH code scans can be used by the Web App Pen Test Agent to prioritize and fix vulnerabilities. MDASH adds more of the MAI Cyber family, including MAI Cyber 1.1 Flash and MAI-Cyber-2 in preview,[5](#fn:5) improving efficiency while maintaining the quality of security findings. [Learn more about MAI-Cyber-2](https://aka.ms/introducing-mai-cyber-2-flash).

[Sign up to explore Codename MDASH with optional MAI Cyber 1.1 Flash access](https://aka.ms/AI-drivenScanningHarness)

## Secure agentic insiders

Agents are the new insiders. They operate continuously, collaborate with other agents, change shape, and pursue goals in ways that can surprise the people who deployed them. To mitigate this risk we must discover agents, onboard them to management, secure and contain them, and do it continuously—even as their behavior and context change. Building on our October 2026 announcement, at Ignite we are introducing new capabilities to help customers secure agentic insiders, around the clock.

-   **Continuously contain agentic insiders with new Perception playbooks and agents**. Investigate and remediate AI posture risks and anomalous agent behavior with new playbooks and green team agents. [Microsoft Entra ID Governance](https://www.microsoft.com/en-us/security/business/identity-access/microsoft-entra-id-governance) dynamic permissions grant task-scoped, time-bound access, while Conditional Access dynamic controls adjust protections as risk changes. These capabilities remain in [limited preview](https://aka.ms/ignite/entra).
-   **Discover, govern, and secure agents with Microsoft Agent 365 and Microsoft Entra Suite capabilities for agentic insiders**. Discovery expands by 35 local agent types, to 60 in total, including Claude Code, OpenAI Codex, and GitHub Copilot, plus third-party cloud agents on AWS and Google Cloud. Discovered agents receive a [Microsoft Entra Agent ID](https://www.microsoft.com/en-us/security/business/identity-access/microsoft-entra-agent-id) and can be governed with Conditional Access. Intune policies contain supported local agents on the device. Additionally, Microsoft Autopilot agents get their own Agent user account and ID, so admins can enable Conditional Access, ID Protection, and access governance to the work an Autopilot does under its own identity. Defender and Microsoft Purview Data Loss Prevention protect runtime and sensitive data access, and Dynamic Agent Risk assesses each agent’s exposure, blast radius, and runtime behavior. Available in preview.

While these capabilities can enable customers to secure and contain agents, they will not give them insight into how the model behind an agent behaves. Without that visibility it is hard for customers to answer three basic questions about consequential AI activity:

-   What was the AI asked and authorized to do?
-   What happened between the request and the outcome?
-   Can we independently verify it?

That’s why Microsoft is announcing the next phase of our commitment to responsible AI: the [**AI Transparency Initiative**](https://aka.ms/AA145lkh). We believe every organization should be able to see what its AI accesses and does, independently verify those actions, and control what it is permitted to do, whatever model or provider it runs on. To that end, we are expanding our participation in the National Institute of Standards and Technology’s (NIST) SI Agent Standards Initiative,[6](#fn:6) plus drawing on our own research to develop open, industry-wide standards for AI transparency, security, and governance. We’re shaping this approach with more than 40 organizations including Accenture, Adobe, KPMG, Mastercard, and Volvo Cars. And we will implement this work across Microsoft AI models and products, including Microsoft Foundry and Copilot.

**The more agency we give AI, the more transparency we should expect in return.** 

## Changing how security work gets done

AI is changing how attacks happen, and how security work gets done. Developers, IT, and security teams now share responsibility for building, managing, and securing AI, so Microsoft Foundry, Microsoft Agent 365, and Perception share the same signals and context. Inside the SOC, analysts need agents to defend at machine speed, which is why we’re building agentic security into the tools they already use.

Technology alone won’t get us there. Securing our own environment through the [Secure Future Initiative](https://www.microsoft.com/en-us/trust-center/security/secure-future-initiative) has taught us a great deal, and our Frontier Security Engineers, services teams, and partners are working side by side with customers to put those lessons to work.

[Join us at Microsoft Ignite](https://ignite.microsoft.com/en-US/sessions?filter=topic%2FlogicalValue%3ESecurity&filter=deliveryTypes%2FlogicalValue%3EOnline&filter=sessionType%2FlogicalValue%3EInnovation+Session&filter=sessionType%2FlogicalValue%3EBreakout&filter=sessionType%2FlogicalValue%3EKeynote&pageSize=96), online or in person, to learn how Microsoft Perception, ISOC in Defender and new capabilities across the stack can help secure your organization at machine speed. We’d love to see you there.

## Explore what’s new

-   [Secure Now](http://aka.ms/SecureNow).
-   [Microsoft Perception](https://www.microsoft.com/en-us/security/business/microsoft-perception-agentic-system).
-   [ISOC in Microsoft Defender](http://aka.ms/ISOC_Defender).
-   [Codename MDASH Partnership](https://aka.ms/MDASHPartnership).
-   [Introducing MAI-Cyber-2](https://aka.ms/introducing-mai-cyber-2-flash).
-   [Secure Agentic Insiders](http://aka.ms/secureagenticinsiders).
-   [Learn how Microsoft Purview accelerates data protection for the AI era](https://aka.ms/PurviewIgnite26).
-   [AI is changing access. See how Microsoft Entra helps you stay ahead](https://aka.ms/ignite/entra).
-   [See how Intune extends endpoint management, supports AI governance on devices, and helps administrators respond to exposure findings](https://aka.ms/intuneatignite/).

To learn more about Microsoft Security solutions, visit our  [website](https://www.microsoft.com/en-us/security/business). Bookmark the  [Security blog](https://www.microsoft.com/security/blog/)  to keep up with our expert coverage on security matters. Also, follow us on LinkedIn ([Microsoft Security](https://www.linkedin.com/showcase/microsoft-security/)) and X ([@MSFTSecurity](https://twitter.com/@MSFTSecurity)) for the latest news and updates on cybersecurity.

1.  [PHP: News Archive – 2026](https://www.php.net/archive/2026.php#2026-10-20-1) [↩](#fnref:1 "return to article")
    
2.  [2026 Microsoft Digital Defense Report—Decoding emergence](https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/microsoft/msc/documents/presentations/CSR/Microsoft-Digital-Defense-Report-2026-v1.1.pdf) [↩](#fnref:2 "return to article")
    
3.  [https://cvetodo.com/2026-cves](https://cvetodo.com/2026-cves) [↩](#fnref:3 "return to article")
    
4.  [CVE: Common Vulnerabilities and Exposures](https://www.cve.org/About/Metrics) [↩](#fnref:4 "return to article")
    
5.  Signing up does not guarantee access. Submissions are reviewed, and customers are onboarded based on need and prioritization. Customers should work with their account team to be formally nominated for the preview.[↩](#fnref:5 "return to article")
    
6.  [SI Agent Standards Initiative | NIST](https://www.nist.gov/super-intelligence/si-agent-standards-initiative)
    
    The post [Security for the agentic era, powered by Microsoft Perception](https://www.microsoft.com/en-us/security/blog/2026/11/17/security-for-the-agentic-era-powered-by-microsoft-perception/) appeared first on [Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog) [↩](#fnref:6 "return to article")
