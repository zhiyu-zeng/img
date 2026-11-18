---
title: Back Button
source: https://www.crowdstrike.com/en-us/blog/falcon-ai-gateway-one-control-point-for-ai-traffic/
source_host: www.crowdstrike.com
clip_date: 2026-11-18T11:57:31+08:00
trace_id: d9b47b04-9fc4-4b99-a6e3-4685f6efa35b
content_hash: dc1d6ff015f0e83fae5ea33fc4aec4f8e73b3f06d8b0c11a86b4e1d5a58b03e9
status: synced
tags: []
series: null
feed_source: CrowdStrike Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41c75244-d011-8120-aed1-d7eae46840dd
ioc: null
---

As AI agents move from answering questions to executing actions, seeing AI activity isn't enough. Security teams need to control it.

AI requests now come from employee assistants, coding agents, SaaS copilots, and custom applications and cloud workloads that call models directly through SDKs. Each of these requesters connects to model providers on its own, with its own credentials, models, and settings.

Falcon AI Gateway, now generally available and included with [CrowdStrike Falcon® Guardian™](https://www.crowdstrike.com/en-us/platform/falcon-guardian-aidr/), extends AI visibility and enforcement beyond the CrowdStrike Falcon® sensor. It routes AI traffic through a centralized gateway to inspect prompts and responses, monitor usage, and enforce policy across managed and unmanaged devices.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8a841d3b5f0400c7.jpg)

## One Control Point for Model Access, Usage, and Security

Discovery shows where unsanctioned AI is in use. Falcon AI Gateway adds a complementary approach: Make the approved path the only path.

Falcon AI Gateway authenticates each request, routes it to the right provider and model, applies usage limits, and applies Falcon Guardian policy both before the request reaches the provider and again when the response comes back.

Teams block direct connections to model providers using the network controls they already run, and route approved applications and workloads through Falcon AI Gateway. As a result, the AI traffic reaching providers from those workloads has passed through Falcon Guardian policy on the way. This doesn't discover or redirect AI traffic automatically; it gives teams a deliberate control point for the workloads they choose to route through it.

This allows teams to:

-   **See**: Traffic, models, tokens, and estimated spend in one place, with dashboards, request logs, and event data.
-   **Adapt**: Applications send requests to one gateway endpoint with one gateway key, using the API formats they already speak. Provider credentials stay in the gateway, and administrators can switch between connected model providers, such as Anthropic, Amazon Bedrock, Microsoft Foundry, and Google Vertex AI, without reconfiguring every workload.
-   **Control**: Rate limits and budgets on requests, tokens, or estimated spend, scoped by application, user, team, model, or provider. Application keys suit services and shared workloads; personal keys attribute usage to an individual.
-   **Secure**: Falcon Guardian policy inspects prompts and responses routed through the gateway for risks such as prompt injection and sensitive data leakage.

Falcon AI Gateway and the Falcon sensor share one Falcon Guardian policy model, and each enforces where the policy sits. The sensor acts on the endpoint, including the local processes, files, and commands an agent runs. Falcon AI Gateway acts on traffic routed through it and can't stop local processes.

Because traffic flows through one point, [AI Kill Switch](https://www.crowdstrike.com/en-us/blog/crowdstrike-introduces-ai-kill-switch/) in Falcon Guardian can cut off agents’ access to the model via the traffic routed through Falcon AI Gateway.

Falcon Guardian customers can find Falcon AI Gateway in the Falcon console under **Falcon Experiences > AI Gateway**. Developers connect an existing SDK or coding tool by changing the base URL to point at the gateway and using a gateway key.

![Figure 1. Organizational visibility of all agents as seen by collectors, including AI Gateway](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4b1bc2b480354582.png) Figure 1. Organizational visibility of all agents as seen by collectors, including AI Gateway

## Built by CrowdStrike, for CrowdStrike

CrowdStrike built the Falcon AI Gateway for ourselves first. The foundation came from running AI at scale inside CrowdStrike, from the work behind CrowdStrike® Charlotte AI™ to our internal AI Hub gateway, which has served tens of thousands of CrowdStrike employees globally for the past few years. Along the way, we learned to keep the request path short, since every extra hop adds another failure point and more time. We also learned that most teams would rather not run a gateway themselves, so we're giving Falcon Guardian customers the one we built for our own needs.

## Govern AI Traffic with Falcon Guardian

Securing AI requires the right control points everywhere AI operates. Only CrowdStrike unifies OS-level visibility, endpoint network inspection, agent-level instrumentation, and centralized gateway enforcement for environments beyond sensor coverage, to see what agents are instructed to do, what they communicate, and what they actually execute.

AI adoption isn't slowing down, and neither is the number of places AI requests come from. Falcon AI Gateway gives teams one control point for model access, usage, and Guardian policy, built on technology CrowdStrike runs for itself and included with Falcon Guardian.

Learn more about [Falcon Guardian](https://www.crowdstrike.com/en-us/platform/falcon-guardian-aidr/) and CrowdStrike's approach to securing AI across the enterprise.

[](https://www.linkedin.com/shareArticle)[](https://twitter.com/share)

* * *

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c236ed1bf000bfb3.png)

## CrowdStrike 2026 Global Threat Report

AI threats have reached a critical turning point. Access the definitive look at the cyber threat landscape.

[Download](https://www.crowdstrike.com/en-us/global-threat-report/)
