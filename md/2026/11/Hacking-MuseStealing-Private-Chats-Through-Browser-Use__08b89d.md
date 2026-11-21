---
title: Hacking Muse:Stealing Private Chats Through Browser Use
source: https://nebusec.ai/research/meta-muse-credential-exposure/
source_host: nebusec.ai
clip_date: 2026-11-21T08:52:41+08:00
trace_id: f9c7af79-1927-4abb-8763-d8d429ab2c05
content_hash: 4134a3038c4e96294b722f558526243e3c60439e589a02c818530964901b2e54
status: synced
tags:
  - 漏洞分析
  - AI应用
series: null
feed_source: NebuSec
ai_summary: NebuSec 通过链式利用浏览器漏洞、Sentinel 网络策略弱点与 Linux 内核提权，从恶意网页一路读到 Meta Muse 用户私有对话与凭证存储，证明"沙箱+隔离"边界可被跨越多层击穿。
ai_summary_style: key-points:weak
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41f75244-d011-8109-85ab-d0441001ec74
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> NebuSec 通过链式利用浏览器漏洞、Sentinel 网络策略弱点与 Linux 内核提权，从恶意网页一路读到 Meta Muse 用户私有对话与凭证存储，证明"沙箱+隔离"边界可被跨越多层击穿。
> 
> - **初始入口：** 借助 Muse 用于导出 PDF/文档的 Chromium 漏洞，让 agent 处理攻击者网页，即在运行时容器内取得代码执行。
> - **绕过网络审批：** 分析 Sentinel 发现其对出站请求的分类与检查存在缺陷，可在不触发审批弹窗的情况下外传会话历史与存储记忆，并篡改这些数据（机密性+完整性双失）。
> - **容器逃逸：** 用自动化漏洞生成框架产出 Linux 内核 exploit，逃出容器并在用户 VM 内拿到 root，从而触及持久存储、安全凭证存储与 Sentinel 本体。
> - **影响边界：** 逃逸后网络流量不再受容器级 Sentinel 约束；但攻击未突破到 hypervisor 宿主或其他租户的 VM。
> - **可复用框架：** 该自动化 exploit 生成框架在内核环境无目标镜像暴露的情况下，仍实现 >99.9% 测试成功率，说明"发现漏洞"与"可实际利用"需分开验证。
> - **修复状态：** 漏洞已上报 Muse 团队，文中所有利用在发布时均已修补。

[Inside Meta MuseBrowser, Sentinel and the Shared-Kernel Boundary ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/49765a3d2a5ed22e.webp)](https://nebusec.ai/research/inside-meta-muse/) 

The NebuSec research team recently investigated Meta Muse, a cloud-hosted AI assistant designed to operate inside an isolated virtual machine (VM). Despite multiple layers of security, we demonstrated how an attacker-controlled webpage could lead to unauthorized access to user data, and ultimately compromise the underlying VM.

Your browser does not support the video tag.

The demo shows a private Muse conversation being exposed during a later browser interaction. On-screen terminal and chat details are obscured.

AI agents are becoming deeply integrated into the applications and workflows people use every day. They can browse websites, execute code, connect to external services and access sensitive information on behalf of users. To enable these capabilities, AI platforms often give agents access to credentials, conversation histories and persistent data while relying on sandboxing and other security controls to prevent unauthorized access.

The findings raise an important question for organizations developing and deploying AI agents: **Are the security boundaries protecting user credentials and sensitive information strong enough to withstand a real-world attack?**

## Key Findings

Our investigation revealed several security risks with implications for AI platforms and the users who trust them with sensitive information:

-   **Sensitive user data could be accessed without approval.** We demonstrated how an attacker could retrieve conversation history and stored memories without triggering Muse’s network approval prompts.
-   **Persistent user information could be modified.** The attack also allowed us to alter stored memories and conversation history, creating risks beyond unauthorized data access.
-   **Container isolation didn’t prevent access to protected resources.** By exploiting a vulnerability in the shared Linux kernel, we escaped the agent’s runtime container and obtained root privileges in the underlying user VM.
-   **Credential storage became accessible.** VM-level access exposed secure credential storage and other resources that were intentionally isolated from the agent’s runtime environment.

Together, these findings demonstrate how a compromise that begins with untrusted web content can extend to sensitive resources outside an AI agent’s intended security boundaries.

## Why AI Agents Create New Risks for User Credentials

Traditional applications operate within defined permissions and workflows. But AI agents introduce a different security model. An agent may need to access email, documents, collaboration platforms and other services to complete tasks on behalf of a user. These integrations often require credentials or authentication tokens that allow the agent to interact with external systems.

This access makes agents useful. But it also makes them attractive targets.

A compromised AI agent may provide an attacker with more than access to a single application. Depending on its permissions and integrations, it could expose sensitive information or provide a path to other connected services.

This is why protecting the execution environment matters.

Security controls must do more than prevent unauthorized actions by the agent itself. They must also protect the credentials and information the agent can access if one of its underlying components is compromised.

In Muse’s case, Meta implemented multiple layers of protection intended to enforce those boundaries.

Our research showed how those protections could be crossed.

## How Muse’s Security Boundaries Were Compromised

Muse was designed with a layered security architecture. Each user’s agent operated inside a dedicated VM, with an additional runtime container separating the agent from more privileged resources.

The architecture also included Sentinel, a service responsible for monitoring outbound network traffic and enforcing approval policies, and a separate credential management service intended to keep real connector credentials outside the agent’s execution environment.

These protections served three distinct purposes:

1.  Container isolation restricted access to the underlying system.
2.  Network enforcement controlled outbound communications.
3.  Credential separation limited direct access to authentication secrets.

However, the effectiveness of this architecture depended on maintaining the boundaries between those components.

Our investigation demonstrated how an attacker could move across them.

### From a Malicious Webpage to Unauthorized Data Access

The attack began with a vulnerability in the Chromium browser used by Muse for tasks like generating PDFs and documents. By having the agent export an attacker-controlled webpage, we achieved code execution inside its runtime container.

At this stage, Muse’s security controls continued to restrict access to external networks and privileged resources. However, our analysis of Sentinel revealed weaknesses in how outbound requests were classified and inspected. We demonstrated that sensitive information, including conversation history and stored memories, could be transmitted to an external server without triggering an approval prompt.

We could also modify the agent’s stored memories and conversation history. This meant an attacker could potentially compromise both the confidentiality and integrity of information that users expected Muse to protect.

### From Container Compromise to Credential Exposure

The next question was whether the attacker could move beyond the runtime container and access resources protected at the VM level.

Using NebuSec’s automated exploit generation framework, we developed Linux kernel exploits that allowed us to escape the container and obtain root privileges in the underlying user VM. The escape exposed resources that had been intentionally kept outside the agent’s runtime environment, including persistent storage, secure credential storage and Sentinel itself.

It also allowed outbound network communications that were no longer subject to Sentinel’s container-level enforcement. The significance of this result was not simply that we achieved a container escape.

**The container escape undermined the isolation boundary protecting sensitive user resources, including credential storage.**

For organizations building AI agents, this is the more consequential risk: A vulnerability in the execution environment can become a path to information and privileges that the agent was never intended to access directly.

The compromise remained within the individual user’s VM. We did not demonstrate an escape into the underlying hypervisor host or other tenants’ environments.

Our [separate technical research](https://nebusec.ai/research/inside-meta-muse/) provides a detailed analysis of the browser vulnerability, Sentinel enforcement and kernel exploitation techniques used in this investigation.

## Why Muse’s Security Architecture Wasn’t Enough

Muse’s design incorporated several established security practices, including sandboxing, privilege separation, credential isolation and network monitoring. These controls provided meaningful protection. For example, obtaining root privileges inside the runtime container didn’t immediately grant unrestricted network access or access to the underlying VM.

The browser vulnerability created an initial execution path, and weaknesses in network policy enforcement allowed unauthorized data transfers. Kernel exploitation then enabled access to resources beyond the container’s intended reach.

Each stage weakened a different part of the security architecture.

**Our investigation illustrates the fact that security controls can work as designed while still failing to prevent a complete attack chain.**

Separating credentials from an agent’s runtime environment reduces risk, but that protection depends on the integrity of the boundary separating those resources. Network monitoring can restrict unauthorized communications, but its effectiveness depends on where enforcement occurs and whether compromised processes can operate outside that boundary.

Security leaders should ask: “Do my protections remain effective when an attacker has already compromised part of the system?”

## What This Means for Organizations Building AI Agents

The Muse findings are relevant to any organization developing AI agents that interact with sensitive information, enterprise applications or privileged services. As agents gain more capabilities, their execution environments become important security boundaries.

**Consider these best practices for protecting AI agents:**

1.  **Protect credentials beyond the agent’s runtime.** Keeping credentials outside an agent’s immediate execution environment is an important safeguard, but it doesn’t eliminate the risk of credential exposure.
    
    Consider what happens if an attacker escapes the agent’s sandbox or gains access to a more privileged part of the system. Credential protections should be designed to limit the consequences of that compromise, including restricting credential scope, access and opportunities for misuse.
    
2.  **Evaluate security across the entire execution environment.** AI agent security extends beyond the model and its application-level permissions. Browsers, containers, operating systems, network enforcement services and credential management systems all contribute to the security of the platform.
    
    A vulnerability in one component can create opportunities to compromise another. Security assessments should examine how these components interact and whether their boundaries can withstand chained attacks.
    
3.  **Validate whether vulnerabilities can actually be exploited.** Identifying vulnerabilities is important, but understanding their impact is just as critical. In the Muse investigation, the kernel environment was customized and didn’t expose the target kernel image to the runtime container.
    
    Our automated exploit generation framework produced exploits that succeeded in more than 99.9% of test runs. This allowed us to demonstrate that the kernel vulnerabilities could be used to cross a meaningful security boundary and expose resources that were otherwise inaccessible.
    
    For organizations responsible for securing complex, interconnected environments, this distinction matters. Knowing that a vulnerability exists is different from knowing whether it can be used to access sensitive data, compromise credentials or escalate privileges in a deployed system.
    

## Securing AI Agents Requires Understanding Real-World Exploitability

Our Muse investigation began with a malicious webpage and ended with access to protected resources in the underlying user VM, including secure credential storage. Our findings highlight how vulnerabilities across browsers, network enforcement and the Linux kernel can be chained to undermine security controls designed to protect sensitive user information.

For organizations building AI agents, the lesson is clear: Isolating an agent is only part of the challenge. The underlying security boundaries must also withstand attacks that attempt to move beyond the agent’s intended permissions.

We reported our findings to the Muse team, and all exploits described in our research had been patched by the time of publication.

**Read the full technical research:** [Inside Meta Muse: Browser, Sentinel and the Shared-Kernel Boundary](https://nebusec.ai/research/inside-meta-muse/)
