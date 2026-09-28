---
title: "Introducing AIMap: Security Testing For AI Agent… | Bishop Fox"
source: https://bishopfox.com/blog/introducing-aimap-security-testing-for-ai-agent-infrastructure
source_host: bishopfox.com
clip_date: 2026-09-28T10:17:28+08:00
trace_id: 6d3caf46-af7f-4057-b0bf-4c1f933812d7
content_hash: 92e158645c8960e7e5b129004e5380b35078fa7ec7384a85cc7f70ade9d610df
status: synced
tags:
  - AI应用
  - 安全工具
series: null
feed_source: Bishop Fox·漏洞研究
ai_summary: Bishop Fox 开源了 AIMap，用于发现、指纹识别、风险评分并测试公网暴露的 AI Agent 基础设施，填补 AI 部署与安全评估工具之间的差距。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3e975244-d011-8136-9c05-f03f963fca37
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Bishop Fox 开源了 AIMap，用于发现、指纹识别、风险评分并测试公网暴露的 AI Agent 基础设施，填补 AI 部署与安全评估工具之间的差距。
> 
> - **核心能力：** 借助 Shodan 检索暴露的 AI/ML 端点，再用 Nuclei 模板和实时 HTTP 探测判断协议、框架、认证状态、可用工具、模型与系统提示词。
> - **风险评分：** 每个端点按认证缺失、工具暴露、CORS、TLS、系统提示词泄漏、模型暴露等给出 0–10 分；高于 7 分通常意味着未认证加代码执行、提示词泄漏加工具访问等可被实际利用的组合。
> - **攻击测试：** 针对 MCP 可做工具枚举、未授权工具调用与工具描述注入；Ollama 支持模型列举、权重提取与提示注入；兼容 OpenAI 的端点可做模型枚举、补全滥用与系统提示词提取。
> - **支持范围：** 覆盖 MCP、Ollama、vLLM、LiteLLM、LocalAI、LangServe/LangChain、Open WebUI、LibreChat、Gradio、Streamlit、ComfyUI、HuggingFace TGI 等。
> - **部署与合规：** 使用 Docker Compose 本地部署（含前后端、MongoDB、Redis），至少需配置 Shodan API Key；发现与指纹为只读，主动攻击模块需操作者明确授权目标后才能执行。

> ##### TL;DR
> 
> AIMap is a Bishop Fox-built tool that lets organizations discover, analyze, and test their exposed AI agent infrastructure the same way attackers already can, revealing risks like unauthenticated access, tool abuse, and prompt leakage.  
>   
> The open-source tool closes the visibility gap by identifying internet-exposed AI systems, scoring their risk, and enabling controlled security testing so defenders can understand and reduce their real-world attack surface.

## A project born from exploration - and a reality we can’t ignore.

AIMap started as a hackathon project. The objective: Evaluate what an attacker can observe and execute against exposed AI agent infrastructure on the public internet.

What became clear is that attackers already have this visibility.

AI systems are exposed and interactable at scale, with many presenting endpoints that support model enumeration, tool invocation, and direct input handling, often without authentication or meaningful control boundaries.

From the outside, that’s enough for hackers to discover them, connect to them, and start testing how they behave. That interaction quickly reveals what’s actually exposed: what models are accessible, what tools can be invoked, and how those systems respond under real conditions.

However, most organizations don’t have this same level of visibility into their own environments.

**AIMap was built and released in response to that reality.**

AIMap takes what is already possible from an attacker’s perspective and structures it into something organizations can use themselves: to discover their exposure, test how their systems behave, and understand what that attack surface actually looks like in practice.

Because the problem isn’t whether this capability exists. It’s who has access to it.

## What Is AIMap?

[AIMap](https://bishopfox.com/tools/aimap) is an internet-scale discovery and security testing tool for exposed AI agent infrastructure. It is designed to find, fingerprint, score, and test publicly exposed AI endpoints, including MCP servers, Ollama instances, vLLM/LiteLLM proxies, LangServe chains, Gradio apps, ComfyUI nodes, and more.

The platform is purpose-built by Bishop Fox for organizations to identify and analyze the growing AI agent attack surface and where their potential exposure lies.

Explore AIMap: [github.com/BishopFox/aimap](https://github.com/BishopFox/aimap).

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9c09888a63b37b13.gif)

***AIMap is intended for authorized security testing. Operators are solely responsible for ensuring their use of AIMap complies with the Computer Fraud and Abuse Act, GDPR, and all other applicable laws in their jurisdiction. Bishop Fox publishes AIMap as a research and defensive security tool and does not authorize or endorse use against systems the operator does not own or lack permission to test.***

## Why AIMap Matters

The barrier to building this capability is now an afternoon. AIMap puts that same view in the hands of defenders, so organizations can see exactly what their AI agent infrastructure looks like from the outside.

Exposed AI systems present a fundamentally new attack surface. They combine models, tool execution, APIs, and user interaction in ways that create novel risk combinations: unauthenticated endpoints with code execution, leaked system prompts, broad CORS policies, exposed model weights. AIMap detects these conditions, scores them based on how they combine in practice, and enables direct testing through protocol-specific scenarios including prompt injection, tool authorization boundary testing, and model extraction.

AI infrastructure has outpaced the security tooling built to assess it. AIMap closes that gap.

## What AIMap Does

AIMap discovers, fingerprints, scores, and tests exposed AI agent infrastructure across the internet.

It queries Shodan to identify exposed AI and ML endpoints, then probes each one using Nuclei templates and live HTTP checks to determine protocol, framework, authentication status, tools, models, and system prompts.

Each endpoint receives a risk score from 0 to 10 based on authentication posture, tool exposure, CORS policy, TLS configuration, system prompt leakage, and dangerous capability combinations. Attack suites for MCP, Ollama, and prompt injection run in real time, with results streamed as they arrive. All discovered endpoints are visualized in a searchable interface.

## Supported AI Protocols and Frameworks

AIMap supports detection and analysis across a range of AI protocols and frameworks.

These include MCP (Model Context Protocol), Ollama, vLLM, LiteLLM, LocalAI, LangServe and LangChain deployments, OpenClaw and Clawdbot systems, Open WebUI and LibreChat interfaces, Gradio and Streamlit applications, ComfyUI and Stable Diffusion environments, HuggingFace TGI, and generic inference APIs.

Detection is performed through a combination of endpoint patterns, ports, API paths, and framework-specific markers.

## How Risk Scoring Works

Each endpoint discovered by AIMap receives a risk score between 0 and 10.

The score is calculated based on multiple factors, including lack of authentication, unknown authentication status, number and type of exposed tools, presence of high-risk or critical-risk tools, open CORS policies, lack of TLS, system prompt leakage, exposed models, uncensored model detection, and signup configurations.

Additional scoring is applied for combinations of risky conditions, such as unauthenticated access combined with code execution capabilities.

Operationally, scores above 7 typically indicate exploitable combinations such as unauthenticated endpoints with code execution capabilities or exposed system prompts paired with tool access, conditions that have been actively targeted in the wild.

## Attack Testing Capabilities

AIMap’s attack testing capabilities are intended exclusively for authorized security engagements. Operators are responsible for confirming they own or have explicit written permission to test any target system. Discovery and fingerprinting features are read-only; active attack modules require operator opt-in and explicit target confirmation before execution. 

AIMap includes built-in attack testing capabilities tailored to specific protocols.

-   For MCP servers, the platform can perform tool enumeration, unauthorized tool invocation, and prompt injection via tool descriptions.
-   For Ollama instances, it supports model listing, model weight extraction, and prompt injection.
-   OpenAI-compatible endpoints can be tested for model enumeration, completion abuse, and system prompt extraction.

All attack results are streamed in real time and include severity ratings, raw request and response data, and associated findings.

## Visualization and Search

AIMap provides a searchable interface for exploring discovered endpoints across three primary use cases: threat hunting, executive reporting, and incident response.

The Shodan-style query language supports filters for protocol, authentication status, risk level, tool exposure, geographic location, port, and organization. Filters combine to refine results across multiple attributes; defenders can quickly identify their organization’s exposed AI agent infrastructure across cloud regions, or scope exposure when a new vulnerability drops in a specific framework.

The 3D globe visualization displays endpoints by protocol type, risk score, and geographic location. The view is built for executive and board-level reporting, giving leadership a clear picture of attack surface concentration at a glance.

## Getting Started with AIMap

AIMap can be deployed locally using Docker Compose, which launches the backend, frontend, MongoDB, and Redis services required to run the platform.

After configuration (at minimum setting a Shodan API key), users can access the interface locally, run discovery scans, search for endpoints, and launch attack tests directly from the application.

For full setup instructions, configuration details, and development workflows, refer to the project repository.

To get started and access the full technical documentation, visit the AIMap repository: [https://github.com/BishopFox/aimap](https://github.com/BishopFox/aimap).

![Aashiq Ramachandran](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/38936728e71498aa.jpg)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a10729e6ade629c7.svg)

Subscribe to our blog

Be first to learn about latest tools, advisories, and findings.
