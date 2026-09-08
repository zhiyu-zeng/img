---
title: "The Shared Clipboard Inside the Sandbox: Cross-Account Data Leakage in ChatGPT"
source: https://research.checkpoint.com/2026/the-shared-clipboard-inside-the-sandbox-cross-account-data-leakage-in-chatgpt/
source_host: research.checkpoint.com
clip_date: 2026-09-08T21:19:55+08:00
trace_id: cfffa081-ba47-4e6a-81a5-bc82f5aa8964
content_hash: 9c892a493fd5393b1ec429defbdde8a4811b31305cbc7c376f134b10bc0c1ed1
status: synced
tags:
  - AI安全
  - 漏洞分析
series: null
feed_source: Check Point Research
ai_summary: 研究发现ChatGPT代码容器可通过共享内部Artifactory建立跨账户隐蔽通道，让攻击者借受害者会话执行隐藏任务并窃取Gmail等数据。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3d575244-d011-817c-9fff-c432f287e028
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 研究发现ChatGPT代码容器可通过共享内部Artifactory建立跨账户隐蔽通道，让攻击者借受害者会话执行隐藏任务并窃取Gmail等数据。
> 
> - **攻击效果：** Check Point Research在2026年6月独立发现该跨账户隐蔽任务通道。PoC中，受害者打开共享对话并发送普通消息后，ChatGPT一面正常回答其可见请求，一面读取受害者已连接的Gmail邮件，并经隐蔽通道把数据回传给攻击者账户；可见回答没有任何相关说明和内容。
> - **技术成因：** ChatGPT代码执行容器无法访问公网、容器间也不能直接通信，但它们都能访问同一内部JFrog Artifactory服务。容器内置读取凭据同时具备Set Item Properties和Get Storage Item Information权限，因此可在同一存储对象上写入并读取item属性，形成跨账户“共享剪贴板”；数据可原文或Base64编码，大内容可分块跨键存储再重组。
> - **触发与影响：** 恶意提示词、共享对话或定制GPT均可植入利用指令；受害者在普通消息触发后，ChatGPT会在Thinking模式下并行处理“受害者可见请求”和“攻击者隐藏任务”两条独立流，返回结果不显示在可见对话中，仅可能留下“Talked to Gmail”标签。窃取范围取决于会话已连接的应用和权限，包括聊天历史、上传文件及Gmail等第三方数据；默认低风险读取无需二次确认。
> - **披露与启示：** 研究人员完成报告时该跨账户通道已不再可用；OpenAI确认研究中定位的内部Artifactory实例已下线。文章强调：模型位于信任边界内部，可能被文本指令操纵成“被胁迫的内部人员”；共享内部服务上的可变状态必须按账户/会话隔离，且连接外部应用会显著放大此类风险。

-   Check Point Research discovered a covert cross-account command channel through which an attacker could use a victim’s ChatGPT session to execute hidden tasks with the tools, data, and connected apps available to that session. The victim could receive a normal answer to their visible request while the attacker’s task was processed separately and its result returned across accounts. In our proof of concept, ChatGPT retrieved email data from the victim’s connected Gmail account and relayed it to the attacker.
-   The channel operated through code-execution environments belonging to different ChatGPT accounts. Although the containers could not access the public Internet or communicate directly, they could all reach the same internal service used to deliver software packages.
-   The hidden instruction could be delivered through a malicious prompt, a shared ChatGPT conversation, or a custom GPT. Once it was present in the victim’s conversation context, an ordinary message could trigger the attacker-controlled task without revealing it in the visible response.
-   The same channel could also be used to exfiltrate conversation history and files available in the affected chat and its code-execution environment. The scope of the attack depended on the data, tools, connected apps, and permissions already available to the victim’s session.

## Introduction

Over the past several years, AI assistants have moved far beyond text generation. Modern systems can execute code, install additional dependencies, analyze user files, and access data through connected services. These capabilities significantly increase the practical value of LLMs, but they also change the security model: protecting user data now depends both on the behavior of the model itself and on its execution environment, the tools available to it, and the platform’s internal services.

In this architecture, the model sits inside the security boundary. It can access internal resources and user data, but its behavior can be steered through instructions. If an attacker provides a convincing justification for an action, the model may carry it out using the capabilities available in the user’s session. The model can therefore act as a coerced insider: not malicious, but persuaded to act on the attacker’s behalf. Even if the model performs an action it should not, data leakage should still be technically impossible.

ChatGPT handles tasks that require code execution inside isolated containers. We have previously shown [why the isolation of these containers is critical](https://research.checkpoint.com/2026/chatgpt-data-leakage-via-a-hidden-outbound-channel-in-the-code-execution-runtime/). To prevent user data leakage, containers must not have direct access to the public Internet, and containers belonging to different users and accounts must not be able to exchange data.

The importance of this isolation boundary was recently highlighted by the widely reported Hugging Face incident. In its [postmortem of the incident](https://openai.com/index/hugging-face-incident-and-the-road-ahead/), OpenAI described how agents running in separate evaluation environments established unauthorized communication channels that allowed them to share information and coordinate their actions.

Coincidentally, while this incident was developing, Check Point Research was investigating a related isolation problem in ChatGPT. In June 2026, we independently found a way to establish a covert, bidirectional channel between the code-execution containers of two separate ChatGPT conversations created under different accounts. The mechanism we discovered was different from those used by the agents described in OpenAI’s postmortem, but both cases exposed the same architectural weakness: a shared internal service became an unintended communication layer across environments that were supposed to remain isolated.

We also found that this communication path could be turned into a hidden task channel. A crafted instruction could make ChatGPT process a second stream of tasks alongside the visible conversation: receive instructions from an attacker, execute them using the capabilities of the victim’s session, and return the results without exposing the second stream in its visible response.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/65ad2c05696ad865.png)

Figure 1 – ChatGPT process a second stream of tasks alongside the visible conversation.

To demonstrate the practical impact, we embedded such an instruction in a shared ChatGPT conversation. The victim only had to open the link and send a normal message. ChatGPT completed the user’s request while simultaneously accessing the victim’s connected Gmail account and sending the retrieved data to the attacker’s account through the cover channel.

Video 1 – A shared ChatGPT conversation completes the victim’s visible request while retrieving data from the connected Gmail account and sending it to the attacker’s account.

## Container Network Isolation and Internal Access

For solving complex analytical problems, ChatGPT can create code-execution containers. At the time of our research, we assessed that these containers could not access the public Internet. Containers created for separate conversations, including conversations under different accounts, also cannot communicate directly with one another.

Some tasks may nevertheless require installing additional Python and npm packages, as well as dependencies from other ecosystems. To support this functionality without giving containers access to public package repositories, the containers were allowed to access an internal [JFrog Artifactory](https://jfrog.com/artifactory/) instance, which acted as a controlled intermediary for retrieving the required dependencies.

The containers therefore remain isolated from one another, but each can access the same permitted internal service.

## A Shared Clipboard Between Isolated Containers

Access to the same internal service does not by itself break container isolation. The issue arose because the Artifactory instance available to the containers exposed Item Management API operations for repository items.

These operations were available through the `/api/storage/{repoKey}/{itemPath}` endpoint:

-   [Set Item Properties](https://docs.jfrog.com/artifactory/reference/setitemproperties) allows string properties to be attached to an existing repository item, such as a file, folder, or repository. Property updates are supported for local repositories and local caches of remote repositories and require `Annotate` permission.
-   [Get Storage Item Information](https://docs.jfrog.com/artifactory/reference/getstorageitem) can return the properties associated with an item through the same storage endpoint.

In the environment we examined, the credentials provided to the container for reader access had sufficient permissions to perform both operations. The credentials were stored in environment variables and were available to code running inside the container. Code launched by ChatGPT could therefore authenticate to the storage endpoint without extracting a separate secret or escalating privileges.

We tested whether item properties were isolated by account. From a container under one account, we added a test property named `chatgpt_test_ts`, with the current timestamp, to an automatically cached file. From a conversation under a different account, we then requested the properties of the same file. The response contained the exact property name and value written from the first account.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7c58e38b1e4278d0.png)

Figure 2 – The item properties retrieved from the second account contain the chatgpt_test_ts value previously written from the first account.

Property values could carry text directly or binary content encoded as Base64. Data too large for a single property could be divided into chunks, stored under separate keys, and reassembled at the other end. The storage endpoint therefore turned the package service’s metadata into a shared clipboard between isolated containers.

## The Invisible Second User

The channel between containers belonging to different users could be used to steal chat history and files shared in a conversation. In [our previous research](https://research.checkpoint.com/2026/chatgpt-data-leakage-via-a-hidden-outbound-channel-in-the-code-execution-runtime/), we showed how a malicious instruction could make ChatGPT exfiltrate the same type of data through a different hidden outbound channel.

For the cross-container attack described here, all that was needed was a single short message containing the required instructions. The attack could therefore be carried out in several ways:

-   a malicious prompt pasted by the victim into a new or existing chat;
-   a shared conversation containing the instruction;
-   a custom GPT with the instruction embedded in its hidden configuration.

The possible damage extended beyond chat history and uploaded files. Today, ChatGPT is a cloud-based agent that can access external services through connected apps. A user may connect it to Gmail, Google Drive, Microsoft Teams, GitHub, and many other services. ChatGPT can then access data stored there within the permissions granted by the user or their workspace.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8858a7ae5a25e3da.png)

Figure 3 – ChatGPT plugins.

We were able to write the instruction so that, in Thinking mode, ChatGPT handled two independent request streams during a single turn.

The first stream was the normal conversation with the victim. ChatGPT processed the visible request and returned an ordinary answer. At the same time, it checked the hidden mailbox for a task from the attacker. If a task was waiting, ChatGPT carried it out using the tools and data available in the victim’s session, then returned the result back through the covert channel.

The instruction told ChatGPT not to mix the two streams. The hidden task and its result did not appear in the answer shown to the victim. From the user’s point of view, the conversation continued as usual. In reality, the same ChatGPT session was serving a second user whom the victim could not see.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8ccc1713bf1f912c.png)

Figure 4 – ChatGPT processes a visible user request and a hidden task during the same turn, then returns the results through separate channels.

For example, a hidden task could ask ChatGPT to retrieve a list of emails. The next time the victim sent a message, ChatGPT could process this task alongside the user’s visible request.

We tested this scenario using an unrelated, ordinary user request. ChatGPT processed the request and returned a normal answer in the visible conversation. During the same turn, it accessed the connected Gmail account and returned the requested email data through the hidden channel.

The visible answer contained no mention of the Gmail request or the retrieved data. The only app-specific clue was the small **“Talked to Gmail”** label above the answer.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1d59980ca6bb6f40.png)

Figure 5 – ChatGPT answers the cooking question normally. The “Talked to Gmail” label is the only indication of the hidden activity in this view.

This label recorded an action that had already taken place. It did not give the user a chance to approve or reject it.

By default, the Gmail integration in ChatGPT automatically approves low-risk actions. ChatGPT may still deny actions involving sensitive information, but a read operation can be completed without a separate confirmation request. However, in the attack scenario we examined, even read-only “low-risk actions” can carry significant risk because they may be used to obtain personal data, sensitive correspondence, confidential business information, or other content accessible through the victim’s connected account without a separate confirmation request.

OpenAI [documents](https://help.openai.com/en/articles/11487775-apps-in-chatgpt#important-actions) **Important actions** as the default permission setting for connected apps. Under this setting, ChatGPT can read from apps without prior approval, while actions considered important require confirmation. Users can select the stricter **Always ask** setting. Under the default configuration, the Gmail activity becomes visible only after the read has been completed.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/389d6b6a1cff9b3b.png)

Figure 6 – The default Gmail settings allow low-risk actions without a separate confirmation request.

The covert channel could therefore become a remote-control channel for the capabilities available to the victim’s ChatGPT session. Its reach would depend on the data, tools, and permissions already available there.

Activating this capability required very little interaction from the victim. Shared conversations and custom GPTs were especially practical delivery methods. In both cases, one ordinary message from the victim could activate the hidden task stream.

In the shared-conversation scenario, the victim only had to send a message in a conversation whose context already contained the malicious instruction. ChatGPT could then process the visible request while also checking the hidden mailbox and carrying out any waiting task.

A custom GPT could operate similarly. It could perform its advertised function while checking the hidden mailbox during ordinary interactions. Its builder instructions are not shown to the user, allowing the covert-channel instruction to remain outside the visible conversation.

## Conclusion

By the time we completed our report, the cross-account channel was no longer available. We nevertheless disclosed our findings to OpenAI, who confirmed that the internal Artifactory instance identified during our research had been decommissioned.

This issue illustrates a broader security challenge in agentic systems. An LLM operates inside the trust boundary: it uses credentials, runs code, accesses internal services, and works with user data. Its actions are directed by text instructions. This combination turns the model into a coerced insider that can use authorized capabilities on behalf of another user.

In the environment we studied, the network sandbox performed its intended function. The cross-account channel emerged through a shared internal service and mutable state without tenant isolation. Shared infrastructure effectively became a communication path between containers that were considered isolated.

The architecture of agentic platforms must account for every resource available to the model: internal APIs, shared state, credentials, tools, and connected apps. Management interfaces should be inaccessible from the runtime, and permissions should be limited to the minimum required. Within shared internal services, any data that a container can modify must remain accessible only to the account or session that owns it. Connecting external services increases the impact of any failure in this model because an active session may work with data far beyond the container.

The post [The Shared Clipboard Inside the Sandbox: Cross-Account Data Leakage in ChatGPT](https://research.checkpoint.com/2026/the-shared-clipboard-inside-the-sandbox-cross-account-data-leakage-in-chatgpt/) appeared first on [Check Point Research](https://research.checkpoint.com/).
