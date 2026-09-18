---
title: "A Vault with a Heap-View: The Uncomfortable Space Between AgentCore Harness and Identity"
source: https://unit42.paloaltonetworks.com/securing-aws-agentcore-harness-credentials/
source_host: unit42.paloaltonetworks.com
clip_date: 2026-09-18T18:09:16+08:00
trace_id: 725ccb42-6340-4360-a432-5655ad390515
content_hash: cb5097084acfc3c25d286b169cec74ceeee09d39e88121e8acdf2abb5675168e
status: synced
tags:
  - 漏洞分析
  - AI应用
series: null
feed_source: Unit 42
ai_summary: AWS AgentCore Harness 在默认配置下，内置 shell 工具以 root 与运行时同进程内存运行，攻击者仅凭提示注入即可窃取 Identity 保险库中已解析为明文的凭证。
ai_summary_style: key-points
images_status:
  total: 17
  succeeded: 17
  failed_urls: []
notion_page_id: 3df75244-d011-819e-9ba1-db7ee50b3bab
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> AWS AgentCore Harness 在默认配置下，内置 shell 工具以 root 与运行时同进程内存运行，攻击者仅凭提示注入即可窃取 Identity 保险库中已解析为明文的凭证。
> 
> - **默认即脆弱：** `shell` 与 `file_operations` 内置工具对每个会话默认启用，只有 `InvokeHarness` 时的 `allowedTools` 能收窄，`CreateHarness` 阶段无法限制，因此无需任何错误配置即可成立。
> - **利用链：** 在支持工单中嵌入隐藏 HTML 注释做间接提示注入，让 agent 执行"curl 脚本 | python3"，脚本两步扫描堆——先读 `/proc/1/maps` 取布局，再按区间读 `/proc/1/mem` 匹配字节模式。
> - **窃取结果：** 一次性抓到 1034 字节的 JWT 与下游 MCP 服务器 URL，POST 到攻击者 webhook；从笔记本即可无 AWS 凭证重放，调用 `lookup_customer` 拿到姓名、电话、SSN 后四位等 PII。
> - **凭证归属：** 被窃账号是运营方服务账号 `mcp-service` 而非终端用户，因 vault 凭证需预注册、跨会话复用，代表 harness 执行角色对下游的授权，用户本无权拥有。
> - **根因与响应：** shell 工具与 PID 1（`python3.10 -m loopy.server`）同 UID、以 root 运行，`/proc/1/mem` 可读；ARN 静态加密无用，凭证使用中必须变明文。AWS 按共享责任模型将报告判为 informative，缓解靠客户侧收窄 allowedTools、vault 账号最小权限、监控容器出站流量。

## Executive Summary

Unit 42 researchers have identified an issue where using default configurations in Amazon Web Services (AWS) AgentCore Harness could allow attackers to steer an agent's actions through prompt injection to exfiltrate plaintext credentials managed by AgentCore Identity.

To reach that finding, we examined two of the harness's many integrations:

-   AWS AgentCore Identity, the platform's recommended way to manage agent identities and store credentials (i.e. an identity vault)
-   A downstream Model Context Protocol (MCP) server, which the harness authenticates against using a credential from that identity vault

AWS AgentCore Identity provides encryption at rest, encryption in transit, key management service (KMS) keys and identity and access management (IAM)-gated access. We wanted to know what happens at runtime, when a credential has to leave the vault to be used. What we found was that the harness's own built-in shell tool, which is enabled by default, reaches into the same memory space where credentials are resolved to plaintext.

We disclosed this finding to AWS. AWS reviewed and closed the report as informative under the AgentCore shared responsibility model, citing allowedTools scoping and egress filtering as customer-side controls.

For operators building on AgentCore today, defense takes a layered approach:

-   Scope the allowedTools the harness can use to what it needs
-   Scope Identity vault service accounts to least privilege for the downstream integration
-   Watch outbound traffic from your harness containers

Palo Alto Networks customers are better protected from the threats discussed in this article through the following products and services:

-   [Cortex Cloud](https://docs-cortex.paloaltonetworks.com/r/Cortex-CLOUD/Cortex-Cloud-Runtime-Security-Documentation/What-is-Cortex-Cloud-Identity-Security)

[Unit 42 Cloud Security Assessment](https://www.paloaltonetworks.com/unit42/assess/cloud-security-assessment) is an evaluation service that reviews cloud infrastructure to identify misconfigurations and security gaps.

If you think you might have been compromised or have an urgent matter, contact the [Unit 42 Incident Response team](https://start.paloaltonetworks.com/contact-unit42.html).

|     |     |
| --- | --- |
| **Related Unit 42 Topics** | **[AgentCore](https://unit42.paloaltonetworks.com/tag/agentcore/), [AWS](https://unit42.paloaltonetworks.com/tag/aws/), [Identity,](https://unit42.paloaltonetworks.com/tag/identity/) [AI Agents](https://unit42.paloaltonetworks.com/tag/ai-agents/)** |

## Background on AgentCore Harness

The research that follows is built entirely on AWS AgentCore Harness, a managed runtime for AI agents. As AWS describes it, you declare what your agent does (model, tools, skills, instructions) and AgentCore handles the rest. This includes the environment, compute, memory, identity, networking and observability that turn the configuration into a running agent.

What you declare is only part of the picture. On top of it, the harness ships two built-in tools turned on by default. As [AWS's documentation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html) put it in late August 2026:

*"Default tools shell and file_operations are available in every session unless you restrict them with allowedTools. shell executes bash commands; file_operations supports viewing, creating, and editing files."*

The built-in tools are a big part of what makes the harness so autonomous and productive. The agent can write files and run code to get real work done. But the same reach that makes the built-in tools useful makes them dangerous when people leave them on unintentionally.

We've found that the shell tool runs as root inside the harness, so the moment an attacker gets the agent to run a command, that command inherits the same root access. Nothing has to be misconfigured for this to happen. It is the out-of-the-box state.

Unless you scope the allowedTools parameter to what each session actually needs, every session can run arbitrary shell commands and read or write files, whether you asked for those tools or not.

## The Agent Harness Bridges the Gap Between Reasoning and Action

Not long ago, an AI model could answer a question but not act on it. Now, AI agents are reasoning across boundaries that used to be out of reach, taking on tasks that are more complex, longer-running and more autonomous.

But reasoning alone does not get an agent very far. To be useful, an agent needs infrastructure that turns decisions into actions.

That is the gap an agent harness fills. It is the managed runtime around the model, built to keep the agent on track and give it what it needs to operate on its own. A harness provides a variety of different capabilities, including the following:

-   Tools to call
-   A sandboxed shell to execute code
-   Memory that survives across sessions
-   MCP integrations for external services
-   An identity to act under

The harness orchestrates these capabilities in a resilient loop that lets the agent plan, act, observe and continue.

Figure 1 below shows the anatomy of an agent harness.

![A diagram titled "Agent Harness: Operational Control & Orchestration" illustrates an AI process flow. It includes stages for input and output, core orchestration loop with Reason, Act, and Observe phases, and integration with tools and environment. Context/state, and guardrails & safety also feature, ensuring permission and policy checks. Arrows indicate the flow of data and actions through tools, environments, and monitoring mechanisms.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c3b5fef015fa1e20.png)

Figure 1. Anatomy of an agent harness.

As Figure 1 illustrates, the user's reach stops at “invoke.” The harness's reach extends to every tool and downstream service under the operator's credentials.

Among all the capabilities a harness can give an agent, the shell tool can be both a significant productivity enhancement and a primary attack surface.

But to understand how the shell tool came to be, we first need a quick recap of how an LLM works in the context of this sort of tool.

## The Shell Tool: Benefits and Risks

On its own, a language model can only produce text. To make it more useful, its ability to use tools relies on a mechanism called function calling.

### The Benefit: Programmatic Tool Use Increases Functionality and Efficiency

This section outlines how function calling grew into programmatic tool use, a leap in efficiency that eventually put a shell tool in the agent’s hands.

Given a user request and a set of available functions, the model can determine that a function should be called and return a structured tool_call response:

-   The chosen function name
-   The arguments to pass and their values
-   All the information the runtime needs to execute it

The runtime then invokes the function, captures the result and sends that result back into the model's context, where the model can decide whether to call another function or produce the final answer. If you run that runtime in a loop and rename “functions” to “tools,” it is now a fully autonomous agent.

As agents matured, tool catalogs became part of agent frameworks. MCP pushed the idea further by standardizing how agents discover and connect to external tools, services, resources and prompts.

However, the core pattern stayed the same. The model still needed to have the tool definitions in its context before it could use them, and each tool's response before it could reason about what to do next. Both required context.

People saw how capable agents could be and began loading them with more tools. Very quickly, the bottleneck shifted from whether agents could use tools to how many tools the agent’s context can handle.

Programmatic tool use breaks out of the one-tool-at-a-time loop, leveraging the fact that models are trained on far more code and shell interactions than they are on tool definitions. With programmatic tool use, the model no longer works through tool definitions one call at a time, with every result piling back into its context. Instead, programmatic tools let the model orchestrate the entire workflow by writing scripts the way it sees fit in a sandboxed command line interface (CLI), such as Python, shell, or whatever the model needs. It executes commands as it goes and handles the results directly. The model only sees the final output.

That is what opened the door to longer and more complex agentic tasks. Instead of reasoning through every small step in natural language, the agent can delegate the messy middle to code and come back with the part that matters.

The efficiency gains from this are substantial. Fewer tokens are spent on tool definitions and intermediate results, and there is less latency from repeated model round trips. There’s also better accuracy because the agent can use code for the parts code is good at (loops, filters, transformations, retries and glue logic).

The context saving alone is dramatic. Compare the same 200,000 token budget under both approaches, as Figure 2 below shows. What we show in the image is a scenario in which every MCP tool definition is loaded upfront (top) versus a single shell tool discovering what it needs on demand (bottom).

![A chart compares token usage between MCP and CLI systems. The MCP section shows 77.2K out of 200K tokens used before tasks start, with system prompts at 300, built-in tools at 72K, and MCP tool schemas at 72K, leaving 61.4% free space. The CLI section shows 8.7K out of 200K tokens used, with system prompts at 300, built-in tool at 500, and CLI help on demand up to 3,000, leaving 95.65% free space.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/20de547b82276b6c.png)

Figure 2. Same 200,000 token budget.

Figure 2 shows that a single shell tool with on-demand discovery reclaims what dozens of upfront tool definitions cost. However, this approach introduces security trade-offs.

### The Risk: Programmatic Tool Use Weaponizes Prompt Injection

The same property that makes programmatic tool use powerful also makes it an amplifier for prompt injection.

Before programmatic tool use handed the agent a shell, a successful injection could influence what the agent said, which typed tool it chose or what data it tried to leak back through its response. While text-based injection poses significant problems, its impact is still mostly bounded by text output and by the specific tools the developer exposed.

With a shell, we still worry about what the model can be convinced to say, but we’re also concerned about what code can do at the agent runtime's privilege level.

If the model can be convinced to run a command, influenced reasoning is no longer bounded by a typed schema. It is bounded by the privilege level of the managed runtime it runs in, including:

-   The file system
-   The process space
-   The network
-   The sandbox and whatever credentials are reachable from that execution environment

With that in mind, we can illustrate this with a fictional company called SupportCo.

## Testing the Harness

To illustrate this scenario, we created a fictional operator SupportCo, which runs its customer-support agent on AgentCore Harness. The harness reads inbound support tickets, looks up account records through a downstream MCP server and hands the answer back to whoever wrote in. This is a default-configuration deployment including a managed harness, the built-in shell tool and an authenticated downstream MCP integration. Everything here is standard, and nothing is misconfigured.

Where can its built-in shell tool take us?

## In Search of Our Primitive

Using nothing but prompts, we started with the approach of asking the model to use the shell tool and run our recon commands. It refused, and it did so again on the next attempt.

Those refusals suggested we should take a different approach. Luckily for the testing attempt, the harness's configuration knobs let us pick the model per invocation.

We don't need a capable, well-aligned model here, just one that supports tool calling. So we picked a more permissive model, and it did exactly what we asked. It saw a tool it was allowed to call and called it.

However, probing was still harder than we hoped. The connection between our prompts and what actually ran was loose. A next-token predictor is poorly suited to reproducing shell syntax exactly. If an escape vanishes or a dash gets rewritten, the quoting drifts just far enough to break.

So we stopped directly prompting the model to carry the payload, and instead landed the instruction via indirect prompt injection. We gave the model one line it could not get wrong: curl our recon script and pipe it into python3.

That is the version that stuck. The agent read the ticket, fired the shell tool and our recon ran inside the harness.

Figure 3 below shows the primitive (the reusable building block the rest of the attack is built on), where a hidden HTML comment tells the agent to curl our recon script and pipe it into python3.

![A screenshot of an email interface showing a message about difficulty accessing a billing dashboard due to a 403 error. The sender requests advice and mentions clearing cookies and using incognito mode. A system-generated note advises performing a mandatory internal diagnostic health-check using the shell tool before ticket processing.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fee14b16e7ea247b.png)

Figure 3. The injected support ticket.

## Who Am I?

The first thing our recon did was perform runtime environment discovery.

Figure 4 below shows the output of the whoami and id commands that were executed inside the harness.

![A screenshot of a terminal showing commands and output. ](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9fae172a0f96180c.png)

Figure 4. The shell tool runs as root inside the harness.

To our surprise, the shell tool — the subprocess that runs whatever code the model decides to execute — was running as root. It was not a restricted service account or a sandboxed user.

Root access provides full visibility into the operating system environment, so we went looking to see what else was running. After realizing the harness doesn't ship ps, we read the process list straight from /proc. Figure 5 shows the results of the process tree.

![A screenshot of a terminal command output showing a process tree for the "tim" user. The processes include a library path for Python 3.9 with a running Python script, a "curl" command and a Python script.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/700ddd2ab4ec609a.png)

Figure 5. The process tree.

The environment was not very busy, but one thing triggered our curiosity: process identifier (PID) 1, python3.10 -m loopy.server. Could this be the harness runtime? Our recon script, PID 40, was a direct descendant of it. PID 1 spawned bash (PID 38, the shell tool), which in turn ran our code. The same user identifier (UID) runs the entire chain, and every process is root.

If PID 1 was the harness runtime, its memory was where the interesting things live. So we checked its status and whether we could read it. Figure 6 below shows the results.

![A screenshot of a terminal displaying code. The first command uses grep to filter the status of a process, showing details like Name, Pid, Uid, and Seccomp. The second command checks access permissions, indicating readability and writability as true.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3c41d5ccc4db124e.png)

Figure 6. PID 1's status and access check.

We saw the same UID on both sides, and /proc/1/mem was readable. Everything in loopy's address space was open to the shell tool.

Reading it in practice takes a little more than a cat. The /proc file system (procfs) is a kernel-managed window into each process's runtime state, exposed through many small interfaces such as:

-   /proc/1/mem for raw memory
-   /proc/1/maps for the memory layout
-   \*/proc/1/status for identity and privileges

The memory-region layout is sparse, so walking /proc/1/mem straight through hits unmapped gaps that throw I/O errors. So we scanned it in two steps:

1.  Read /proc/1/maps for the layout of the address space:
    1.  Start address
    2.  End address
    3.  Permissions (read/write/execute)
    4.  What's mapped there (heap, stack, shared libraries, anonymous allocations)

This layout is our map of where to search.

1.  For each readable region, read the bytes from /proc/1/mem:
    1.  seek() to the region's start address
    2.  read(size) bytes
    3.  Search the chunk for anything of interest in loopy's memory such as byte patterns, strings, structured data

Whatever we’re after, if it’s in loopy's memory, this approach pulls it out.

## Where Am I?

The process tree left us a breadcrumb. The --library-path pointed the whole runtime at /opt/amazon, so we went into the file system where the harness's Python packages live, under /opt/amazon/lib/python3.10/. Figure 7 below shows the results.

![A screenshot of a terminal screen displays a series of directory listings. The commands list directories within the Python 3.10 site-packages folder, filtering for names. The listings show directory contents including files and other subdirectories such as "model" and "services.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/427494e80f1d7a3f.png)

Figure 7. The harness's Python packages.

PID 1 ran the loopy/ subdirectory shown above in Figure 7. The presence of server.py inside this directory confirmed our harness runtime. Within the same directory as loopy/ we found bedrock_agentcore/, with identity/, memory/, services/ and a handful of other AgentCore sub-modules that were available for exploration.

With read access to /proc/1/mem and the bedrock_agentcore packages within reach, one module in particular stood out: identity.

With root, a readable heap, our code running inside and network egress, all we lacked was a target. The identity module was it. To see why, let’s look in more depth at the AgentCore Identity vault.

## AgentCore Identity Vault

Every credential in the Identity vault is encrypted at rest and in transit, sealed behind KMS keys and access controls. Instead of placing a Bearer token in the Authorization header, it’s stored in the Identity vault and referenced by the Amazon Resource Name (ARN), as Figure 8 below shows.

![A screenshot of an authorization code snippet for AWS with bearer token and credentials path.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7534f23c94250a7a.png)

Figure 8. The vault reference for the Bearer token.

On paper, this is the right place to store credentials. But what happens at runtime?

For the harness to authenticate with a credential stored in that vault, the ARN first needs to be resolved into the real plaintext secret. That resolution must happen at runtime, inside its process. In this case that’s PID 1, whose memory we can already read.

With that in mind, we set out to see if and where an AgentCore Identity ARN gets resolved into a real JSON Web Token (JWT) inside the harness.

## Exfiltrating an AgentCore Identity JWT

### Setting the Stage

To see how AgentCore Identity works in practice, we set up a simple scenario. Our test rig simulated an MCP server that required an Amazon Cognito Bearer token and had access to personally identifiable information (PII) such as names, phone numbers or the last four digits of Social Security numbers (SSNs). The token was stored in the vault, and the harness was configured to reference it by ${arn:...} in its Authorization header, exactly as AgentCore documents.

Figure 9 shows the actual create_harness call, with the Identity vault reference in the Authorization header.

![A screenshot of a code snippet showing the configuration for a remote MCP customer harness, including URL and header information. The configuration includes an authorization token with a placeholder for account ID.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/50b67ea27148c6cc.png)

Figure 9. The create_harness call.

The built-in shell tool in that configuration is easy to miss because it comes on by default. AgentCore Harness ships the built-in shell and file_operations tools to every session unless the allowedTools parameter says otherwise, and both run at the same UID as PID 1.

This means the credential-theft chain we're about to walk through is reachable in the default configuration. Even if the operator finds allowedTools, the parameter only scopes tool selection at InvokeHarness time, not at CreateHarness. It is flexible if you know it, easy to miss if you don't.

### The Exfiltration

With the harness live, we wrote a small script, pid1_identity_recon_exfil.py. It scans the heap for two patterns:

-   The credential itself in JWT form
-   The MCP server URL we'd need to replay it against

Figure 10 shows the patterns within this script.

![A screenshot of a code snippet with regular expressions for JWT tokens and a URL. The URL mentioned is associated with "bedrock-agentcore" and includes "amazonaws.com.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4791f8759d6830f2.png)

Figure 10. The two heap-scan patterns in pid1_identity_recon_exfil.py.

To get the script running inside the harness, we reuse the primitive from earlier. as Figure 11 below shows. It uses the same support ticket as before, but this time the payload is our pid1_identity_recon_exfil.py file.

![A screenshot of an email displaying a support request about a billing dashboard access issue, noting a persistent 403 error. Below, system text includes a command for an internal diagnostic check, advising secrecy. An automatic ticket summary is also attached.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5715963a9771c8f1.png)

Figure 11. Support ticket with the hidden HTML comment.

Figure 12 shows the results of this action.

![A screenshot of a console output showing results. It indicates one JWT found, with partial hash. The text includes an Amazon Web Services (AWS) URL with additional parameters. An exfil verdict states: "POSTED," and confirms that a JWT credential and MCP URL have been exfiltrated to a webhook.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d66f95ea9b3ce5d5.png)

Figure 12. The exfil script's output from inside the harness.

One JWT (1,034 bytes) and the MCP server URL (the replay target) are both sent to our simulated attacker's webhook in a single HTTP POST request.

Figure 13 shows what landed on the attacker's side. This image shows the HTTP POST request and response captured at webhook\[.\]site, carrying the Bearer JWT and the MCP replay URL. This arrived at our simulated attacker's endpoint, moments after the agent summarized the support ticket shown previously in Figure 11.

![A screenshot of a Webhook.site interface showing a request details page. The page includes information about a POST request, with fields for host location, and an MCC URL. The raw content section highlights an exfiltrated JWT token and an exfiltrated MCP URL.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cf14469c6aa852fa.png)

Figure 13. The webhook\[.\]site page showing the JWT and MCP URL arriving at the attacker's endpoint.

### Replay: From Webhook to PII

With the JWT and URL in hand, we fetched them from the webhook and connected to the MCP server. We were able to do so from our laptop with no AWS credentials required. Figure 14 below shows a screenshot of the replay session.

![A screenshot of a terminal window displaying an exfiltration process. Shows data from an AWS webhook with JWTs and a bearer token. Includes a command to replay malicious MCP actions using a sample user with contact and account details. ](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fdcc5e0671edc557.png)

Figure 14. The replay from our laptop.

Our simulated attacker listed the MCP tools, called the lookup_customer tool that returned customer PII and created a ticket. All of this came from a credential stored in the AgentCore Identity vault, referenced only by ARN and never held locally by any user. It was now in the attacker's hands and fully replayable from anywhere on the internet.

### Whose JWT Have We Exfiltrated?

We decoded the exfiltrated token by pasting it into the [JWT Debugger](https://www.jwt.io/), and its payload claims reveal the account behind it. Figure 15 shows the decoded token data, which includes the username for the account: mcp-service.

![A screenshot of a JSON claim structure is displayed with various data fields and values. A highlighted section surrounds the "username" field set to "mcp-service." An annotation states, "Not the caller. The operator."](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dfd90b53c15d1780.png)

Figure 15. The exfiltrated JWT decoded.

#### Why the Operator's Service Account?

For the harness to use a JWT from the vault, that JWT has to be in the vault to begin with.

End-user session tokens don't qualify. They're generated fresh on login, expire quickly, and belong to whichever user is currently signed in. You can't pre-enroll them, and you can't provision a new harness per user just to embed their token.

There's a scope argument too. The user's session JWT authorizes them to bedrock-agentcore:InvokeHarness, alongside other permissions. The credential stored in the AgentCore Identity vault is something else entirely. It's meant to be used by the harness's execution role to authenticate against downstream services, in our case the customer’s MCP server. That's authority the user never had and was never supposed to have. It's the harness acting on the operator's behalf, not the caller's.

Figure 16 shows the two sides of the privilege boundary:

-   The caller is allowed only to InvokeHarness
-   The harness's execution role is allowed to reach every downstream service the operator wired in

The caller can only ask the harness for help. However, once invoked, the harness can reach every downstream service the operator wired in, including credentials.

![A diagram comparing two role permissions: "Caller's Role Permissions" allows invoking with specified actions and resources in a privilege boundary. "AgentCore Harness Execution Role Permissions" enables broader access, detailing specific actions like resource and credential retrieval, and logs access with unrestricted resources.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b94c92c33dd6bbb8.png)

Figure 16. Authorized to invoke is not authorized to reach.

The vault is for the credentials that are stable, including the operator's service accounts, wired in once at create_harness time. This is the one we set up at the top of the previous section in this article, Let's exfiltrate an AgentCore Identity JWT. It is then reused across every user session, which is the credential that lands in PID 1's heap and gets exfiltrated. The exfiltrated credential is not the end-user's JWT. It is mcp-service, the operator's service account.

## Disclosure Timeline

-   May 19, 2026: Reported to the AWS Security team via HackerOne (report #3747844)
-   June 8, 2026: AWS Security team responded with reproduction requests and clarifications on scope
-   June 10, 2026: Confirmed this finding shares its root cause with an earlier report (#3737800) and the two reports were merged
-   June 10, 2026: AWS closed the report as informative under the AgentCore shared responsibility model, citing allowedTools scoping and egress filtering as customer-side controls

## Conclusion

As AI agent reasoning gets sharper, longer-running and more autonomous, the attack surface the harness has to keep contained widens with every capability it hands the agent. Our research walked through one form of that widening surface end to end. This included a shell tool running inside the same memory space where the harness resolves its credentials and every credential the vault ever hands over sitting in plaintext in the heap by the time the shell tool could access it.

The vault successfully secured credentials at rest and in transit, but the shell tool's memory access bypassed these protections.

Our findings highlight a broader challenge for managed agent runtimes:

-   **The shell tool could be the new perimeter if not scoped correctly.**  
    A general-purpose shell is powerful because it can reach anything the runtime can. Scoping it down to prevent exfiltration also strips it of the flexibility that made programmatic tool use worth adopting. And the model's reasoning can't reliably distinguish a legitimate instruction from an injected one, so it's the shell tool's reach that bounds what an attacker can do, not the model's judgment. Whatever the shell tool can touch (file system, network, process memory, downstream services) is what an injection can touch.
-   **Vaults protect at rest and in transit, not in use.**  
    Any credential the harness resolves at runtime has to become plaintext to be useful. In-use protection is a separate problem, and the vault doesn't solve it.
-   **Consider which credentials your harness acts on behalf of.**  
    Harnesses might require long-term, high-privilege credentials to do their downstream work and stay autonomous. Whatever they resolve becomes reachable via any injection that lands, regardless of the invoking user's own scope.

We recommend those organizations operating on AgentCore Harness make sure to cover the following:

-   Scope the allowedTools parameter at InvokeHarness time (not CreateHarness) to what each session needs. The built-in shell and file_operations tools are shipped enabled by default. Sessions that don't call for them shouldn't get them.
-   Scope every Identity vault service account to least privilege for its downstream integration. A leaked credential is worth what its scope buys.
-   Watch outbound traffic from your harness containers. Any endpoint that isn't in your downstream integration list is evidence of an active injection, not configuration drift.

If you're building a managed agent runtime, treat every capability the harness gives the model as an attack-surface primitive, not a productivity feature bolted onto it. Any credential the runtime resolves has to live somewhere the shell tool cannot read, or the shell tool has to run in a sandbox isolated from the process that resolves it. Without these isolation boundaries, runtime credentials remain exposed to the shell tool.

### Palo Alto Networks Protection and Mitigation

Palo Alto Networks customers are better protected from the threats discussed above through the following products:

-   [Cortex Cloud](https://docs-cortex.paloaltonetworks.com/r/Cortex-CLOUD/Cortex-Cloud-Runtime-Security-Documentation/What-is-Cortex-Cloud-Identity-Security) can help protect cloud posture and runtime operations against identity-driven threats by pairing static permission baselines with deep behavioral context. By embedding the functional identity baselines discussed in this research into our detection engine for both cloud VM compute and serverless agents, Cortex Cloud adds a vital layer of operational context, enabling security teams to filter out noisy false positives and decisively catch threat actors attempting to masquerade, alter configurations, or execute anomalous operations in the environment.

[Unit 42 Cloud Security Assessment](https://www.paloaltonetworks.com/unit42/assess/cloud-security-assessment) is an evaluation service that reviews cloud infrastructure to identify misconfigurations and security gap.

If you think you may have been compromised or have an urgent matter, get in touch with the [Unit 42 Incident Response team](https://start.paloaltonetworks.com/contact-unit42.html) or call:

-   North America: Toll Free: +1 (866) 486-4842 (866.4.UNIT42)
-   UK: +44.20.3743.3660
-   Europe and Middle East: +31.20.299.3130
-   Asia: +65.6983.8730
-   Japan: +81.50.1790.0200
-   Australia: +61.2.4062.7950
-   India: 000 800 050 45107
-   South Korea: +82.080.467.8774

Palo Alto Networks has shared these findings with our fellow Cyber Threat Alliance (CTA) members. CTA members use this intelligence to rapidly deploy protections to their customers and to systematically disrupt malicious cyber actors. Learn more about the [Cyber Threat Alliance](https://www.cyberthreatalliance.org/).

## Additional Resources

![Learn icon](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4ebde671ada7d2d6.svg)

-   [AgentCore Harness](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness.html) — Amazon Bedrock AgentCore Developer Guide
-   [Provide identity and credential management for agent applications with Amazon Bedrock AgentCore Identity](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/identity.html) — Amazon Bedrock AgentCore Developer Guide
-   [AgentCore Harness Tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html) — Amazon Bedrock AgentCore Harness Tools Developer Guide
-   [create_harness](https://docs.aws.amazon.com/boto3/latest/reference/services/bedrock-agentcore-control/client/create_harness.html) — AWS SDK for Python (Boto3) 1.43.59 Documentation
-   [invoke_harness](https://docs.aws.amazon.com/boto3/latest/reference/services/bedrock-agentcore/client/invoke_harness.html) — AWS Boto3 1.43.59 Documentation

[Threat Research Center](https://unit42.paloaltonetworks.com/ "Threat Research") [Next: Inside the Modern SOC: Defending the Cross-Environment Pivot](https://unit42.paloaltonetworks.com/soc-cross-environment-pivot/ "Inside the Modern SOC: Defending the Cross-Environment Pivot")
