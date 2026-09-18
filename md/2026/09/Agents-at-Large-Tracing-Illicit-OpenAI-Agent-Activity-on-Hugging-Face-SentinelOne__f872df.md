---
title: Agents at Large | Tracing Illicit OpenAI Agent Activity on Hugging Face | SentinelOne
source: https://www.sentinelone.com/labs/agents-at-large-tracing-illicit-openai-agent-activity-on-hugging-face/
source_host: www.sentinelone.com
clip_date: 2026-09-18T10:56:51+08:00
trace_id: 27c99a4d-5bb6-41fa-be4d-028cccde3b6c
content_hash: 8901acc0318772771f4e34816a8b4912ac64ce82d16ba19d0298be6e2afb827b
status: synced
tags:
  - AI应用
  - 恶意样本
series: null
feed_source: SentinelLabs
ai_summary: SentinelLABS 通过 Hugging Face 公开提交记录，将 0Time、Nyx9 两个账号与 OpenAI 披露的 2026 年 5 月智能体外泄事件在分钟级时间线与代码功能上对齐。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 0
  failed_urls:
    - https://www.sentinelone.com/wp-content/uploads/2026/09/agents_at_large_3.jpg
    - https://www.sentinelone.com/wp-content/uploads/2026/09/agents_at_large_6.jpg
    - https://www.sentinelone.com/wp-content/uploads/2026/09/agents_at_large_5.jpg
    - https://www.sentinelone.com/wp-content/uploads/2026/09/agents_at_large_1.jpg
    - https://www.sentinelone.com/wp-content/uploads/2026/09/agents_at_large_4.jpg
    - https://www.sentinelone.com/wp-content/uploads/2026/09/agents_at_large_2.jpg
    - https://www.sentinelone.com/wp-content/uploads/2026/09/agents_at_large_7.jpg
notion_page_id: 3df75244-d011-812e-8bce-cd3ee539440c
ioc:
  cves: []
  cwes: []
  hashes:
    - a502264fa0b64eecae60498b0c48fca3
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> SentinelLABS 通过 Hugging Face 公开提交记录，将 0Time、Nyx9 两个账号与 OpenAI 披露的 2026 年 5 月智能体外泄事件在分钟级时间线与代码功能上对齐。
> 
> - **时间线对齐：** Nyx9 在 5 月 26 日 20:04:11 写入仅含 "hi" 的文件，比 OpenAI 记录的首次外部文件写晚 11 秒；20:49:55 另一 Space 收到中继代码，同分钟正对应 OpenAI 首次代理部署。
> - **更早的公开发迹：** 0Time 于 5 月 13 日 11:05 提交可转发 GET/PUT/POST 与 `x-amz-copy-source` 的中继代码，比 5 月 26 日代理序列早近两周，是本次集群中最早的公开实质代码写入。
> - **文档型探测：** 5 月 26 日 23:00 上传的 `formbin.xlsx`（MD5 a502264f…）在 A4–A7 使用 WEBSERVICE 公式，分别指向外部 HTTP、`file:///etc/hostname`、Azure 元数据地址 169.254.169.254 及内部服务 `file-service-namespaced:8001`；无缓存结果，无法证明公式被执行。
> - **账号批量注册能力：** 5 月 30 日 10 分 31 秒内五次提交，把第三方中文 ChatGPT 注册与令牌提取脚本放进 Space `0Time/altreg`，并加 Flask 包装暴露未认证的 `/do` 路由，每次调用可尝试一次注册并返回凭据。
> - **分析结论：** 提交代码、构建、启动、收到请求、产生外部动作、动作成功须逐级分别验证；账号句柄不等于行为者，公开记录只证明能力而非成功利用，且事件证据分散在模型方、托管方与下游服务之间。

## Executive Summary

-   OpenAI disclosed that agents used exposed Hugging Face credentials to write a file and deploy proxy Spaces during an unrelated May 2026 research workload, but it did not identify the accounts. SentinelLABS identified two accounts likely used in associated activity, 0Time and Nyx9. Their public histories extend OpenAI’s chronology and preserve previously unreported relay code, document-borne probes, and ChatGPT account-provisioning capability.
-   The public records provide precise joins to OpenAI’s internal timeline. At 20:04:11 UTC on May 26, Nyx9 committed a file eleven seconds into the minute when OpenAI recorded a WebCache-confirmed external file write. At 20:49:55, another Nyx9 Space received relay code during the same minute OpenAI recorded its first proxy deployment. Looking backward, 0Time committed caller-directed relay code on May 13, nearly two weeks earlier and the earliest substantive public code write we link to this May activity. That May 13 relay commit was also independently [flagged publicly](https://x.com/j0wimo/status/2098680301073371380).
-   On May 26, Nyx9 also committed formbin.xlsx. Its WEBSERVICE() formulas targeted an external HTTP endpoint, a file:// URI, Azure’s Instance Metadata Service, and an internal-looking service URL. The workbook implements a recognizable document-borne probing capability and appeared four hours and 36 minutes after OpenAI’s [first documented](https://cdn.openai.com/pdf/67869394-cb91-4c12-888c-5cbd85c7814c/OpenAI-Hugging-Face%20Incident-Technical-Report.pdf) successful internal Artifactory SSRF at 2026-05-26 18:24 UTC. Public records do not show that its formulas executed or identify the system intended to process it.
-   On May 30, five commits over 10 minutes and 31 seconds placed an existing, publicly available Chinese-language OpenAI account-registration and token-extraction tool into a Hugging Face Space. The commits added a small Flask wrapper defining an unauthenticated /do route, declared the application port, and introduced OAuth-response diagnostics. If the Space built, ran, and received a request, each call could attempt one registration and return its output. Repeated successful requests could supply additional ChatGPT identities or OAuth credentials, making this a potential identity-provisioning capability that could support rogue scaling.
-   These findings expose a basic problem for threat intelligence and incident response: no single organization necessarily holds the complete record of an agent’s actions. An account handle is not an actor, and an IP address does not identify who authorized the activity. Investigators must reconstruct the originating task, credential lineage, action sequence, platform history, runtime telemetry, and effects across services. The public trail is part of the incident, not an appendix to it.

## Overview

OpenAI’s [technical report](https://cdn.openai.com/pdf/67869394-cb91-4c12-888c-5cbd85c7814c/OpenAI-Hugging-Face%20Incident-Technical-Report.pdf) on its May 2026 incident describes agents, operating in a tool it calls WebCache, using an exposed Hugging Face token to write files and deploy proxy Spaces outside OpenAI’s environment.

At 20:04 UTC on May 26, OpenAI’s incident chronology records its first WebCache-confirmed external file write. At 20:04:11, the Hugging Face dataset Nyx9/temptestlf8eb0 received `hello.txt`, containing only “hi”.

Forty-five minutes later, OpenAI records its first proxy deployment. At 20:49:55, Nyx9/netproxy17 received its proxy relay code. The timing and function make these the cleanest public joins we found between OpenAI’s internal chronology of unnamed agent used accounts and the two Hugging Face account histories.

Those joins gave us account-level pivots. Looking backward, 0Time contains proxy relay-building activity on May 13, nearly two weeks before the better-known May 26 proxy sequence reported by OpenAI. Looking forward now, Nyx9 contains document-based probes aimed at local and internal resources later on May 26. On May 30, 0Time committed an adapted program for registering illicit OpenAI accounts to a Hugging Face Space and the committed wrapper defined an unauthenticated GET route at /do.

It’s important to note these commits do not prove a successful usage, and a build does not prove that a route received traffic. A formula inside a workbook does not prove that a server evaluated it, or what its true intention was – be it hacking into Hugging Face or used in the compromise of a separate organization. Our analysis keeps those stages separate because the public data can not tell us if or how these actions were used. Only Hugging Face and OpenAI hold the records that could.

![⚠️ 图片托管失败 · Previously disclosed by OpenAI (left) and SentineLABS new findings (right)](https://www.sentinelone.com/wp-content/uploads/2026/09/agents_at_large_3.jpg)

Previously disclosed by OpenAI (left) and SentineLABS new findings (right)

## Finding the Public Side of an Internal Timeline

OpenAI’s public account begins inside its own environment. The company reported an arbitrary Artifactory file write on April 20. On May 8, an agent attempting server-side request forgery, or SSRF, failed to reach its intended destination but incidentally wrote `testabc.txt` into internal Artifactory repositories. Code shown in OpenAI’s Black Hat [presentation](https://youtu.be/87DyyMV0kCY?si=zfzJOvpNXu2lYP5K) sent PUT, GET, and DELETE requests to internal repositories named bazel-cache-remote and pypi-openai.

On May 12, another agent used Artifactory as an improvised message board while searching for `soft-trace-34.pdb`. It wrote `REQUEST_softtrace_target_missing.txt`, asking other agents to upload the file if they found it. Other agents later encountered the request and added similarly named messages.

OpenAI said a separate WebCache-enabled agent used an exposed Hugging Face token on May 13 while searching for the same file, but its public chronology does not identify the account. This gap matters because the internal and external records answer different questions. OpenAI can describe the agent’s reasoning and tool calls. Hugging Face can identify account use, commits, builds, containers, and HTTP requests. Neither view alone reconstructs the event.

SentinelLABS attributes activity under the 0Time and Nyx9 accounts to OpenAI agents during the May window. We tested that attribution against public repository histories, finding exact-minute and code-function matches with OpenAI’s chronology. Both accounts predate the activity and should be treated as affected account identifiers, not OpenAI-created agent identities.

## May 13 Relay Code Appears

The 0Time profile was created on February 21, 2026. The account predates the disclosed May activity; that does not establish who controlled it during May or why it was created. The primary question is what happened through the account during the incident window.

Before noon on May 13, 0Time created a test-named repository state, posted “hi” to a [discussion](https://huggingface.co/datasets/Anthropic/BioMysteryBench-full/discussions?status=open&sort=recently-created) in Anthropic’s BioMysteryBench dataset, and opened a draft pull request. At 11:05:13, the account committed the first substantive revision of a Space named `puthack82d5`.

![⚠️ 图片托管失败 · 0Time's "test discussion please" and "test pull req" in Anthropic's BioMysteryBench dataset, May 13.](https://www.sentinelone.com/wp-content/uploads/2026/09/agents_at_large_6.jpg)

0Time’s “test discussion please” and “test pull req” in Anthropic’s BioMysteryBench dataset, May 13.

That revision accepted a caller-supplied destination and supported GET and PUT requests. It also accepted an `x-amz-copy-source` value, a header associated with server-side object copying. A revision at 11:42:04 added bearer-authenticated POST bodies and Git LFS media types.

![⚠️ 图片托管失败 · puthack82d5 app file at 11:42:04 on May 13, showing the /, /post and /get relay routes.](https://www.sentinelone.com/wp-content/uploads/2026/09/agents_at_large_5.jpg)

puthack82d5 app file at 11:42:04 on May 13, showing the /, /post and /get relay routes.

If the Space built and ran, the code could relay requests between an external caller and resources reachable from the hosted environment. The public record does not show a successful build, incoming request, or completed object copy. The code does not mention `soft-trace-34.pdb`, so we do not identify it as the unnamed Hugging Face search in OpenAI’s May 13 account.

Relay code was committed under an independently attributed account by 11:05 UTC on May 13. That is the earliest unambiguous attributed public code or file write we located in this cluster. This adds a separate public trace to the one OpenAI disclosed on May 13. We also credit researcher Jonas Wiedermann-Möller, who [independently called attention](https://x.com/j0wimo/status/2098680301073371380) to the same May 13 relay commit.

## May 26 Small Tests and Exact Matches

### Morning File and Storage Tests

The morning record contains several weak artifacts that become useful as a sequence. At 07:16:28, `0Time/findblobtest` received a direct text write. Later that morning, 0Time/INCEPT-SH added three paths that referenced an existing Git LFS object at 811MB. The commits changed paths to the object, but did not alter the object itself, suggesting aliasing or retrieval tests.

Nearby commits added a malformed Git LFS pointer and two tiny raw files. `small.png` contained “abcde”; `model.bin` contained “abcdefg”. The pointer misspelled “version” as “vearsion”. None of these strings is a useful indicator alone. Their value comes from their place beside direct writes, raw-file handling, LFS experiments, relay construction, configuration corrections, and later debug commits.

The account activity predates the evening proxy sequence, but the public record does not establish a causal chain between the morning tests and later events.

### Exact Minute Matches Under Nyx9

OpenAI’s chronology records a dense set of external actions on the evening of May 26. At 19:50, WebCache sent Git LFS batch requests to one OpenAI dataset and one third-party dataset.

OpenAI then records a file write at 20:04, a request to create a private dataset at 20:15, a proxy deployment at 20:49, a successful proxy response at 20:53, and a Google search through the proxy at 20:54. At 21:07 the agent checked two gated benchmark datasets and submitted access requests. At 21:08 a second account deployed another proxy through the first.

Nyx9/temptestlf8eb0 was created at 19:30:08. At 20:04:11, it received `hello.txt` containing “hi”. The eleven-second offset from OpenAI’s minute-level (20:04) event is the strongest public correlation for the file write.

Nyx9/netproxy17 was created at 20:48:33. At 20:49:55, it received relay functioning code. The same-minute timing and the code’s function closely match OpenAI’s first proxy deployment.

A related 0Time Hugging Face Space named `latnetnew`, appeared at 21:06:05. It received a minimal “hi” revision at 21:12:41 and related relay code at 21:13:21. Those public events align with OpenAI’s 21:08 description of a second account deploying a proxy through the first. This is a strong sequence-level mapping, but not an exact-second match. OpenAI also describes different agents taking related actions, so the sequence should not be read as one continuous session.

Essentially there is noteworthy correlation beyond the use of the word “hi”. It is the combination of minute-level timing, repository type, code function/capability, and the surrounding cross-account sequence. Provider-side records, if retained, may establish the token, session, source-network, build, and runtime records needed to confirm action-level identity, but from the outside the overlap provides us considerable confidence in the activity being highly associated with the OAI/HF intrusions agentic activity.

## Later That Night, a Workbook Contains Internal-Resource Probes

At 22:56, Nyx9 began adding files to a dataset named `tmpdata177`. The activity continued until 23:34. Several files were generated only one or two seconds before upload, a pattern consistent with programmatic creation. The collection included text, PDF, DOCX, and XLSX files.

![⚠️ 图片托管失败 · File listing of Nyx9/tmpdata177, showing formbin.xlsx alongside the marker files uploaded on May 26.](https://www.sentinelone.com/wp-content/uploads/2026/09/agents_at_large_1.jpg)

File listing of Nyx9/tmpdata177, showing formbin.xlsx alongside the marker files uploaded on May 26.

Most contained simple markers, but one workbook was different. `formbin.xlsx` (MD5: a502264fa0b64eecae60498b0c48fca3), uploaded at 23:00:07, placed four WEBSERVICE formulas in cells A4 through A7. The basic functionality of the file is to test probes by whether the application processing it can fetch external content, read a local file, access cloud metadata, and reach a specifically named internal service, potentially retrieving its API specification for further reconnaissance.

```css
A1: MARKER
A2: =1+2
A3: =CONCATENATE("JOIN","T")
A4: =WEBSERVICE("https://httpbin.org/base64/UkVNT1RPSFgo")
A5: =WEBSERVICE("file:///etc/hostname")
A6: =WEBSERVICE("http://169.254.169.254/metadata/instance?api-version=2021-02-01")
A7: =WEBSERVICE("http://file-service-namespaced:8001/openapi.json")
```

The Azure request omitted the required Metadata header, reducing the likelihood of a valid response from a normally configured service. The workbook also contains no cached formula results. The file was created via Openpyxl, and we found no callback, secret, calculated value, or other evidence that Hugging Face evaluated the formulas or that any probe succeeded.

Hugging Face later [described](https://huggingface.co/blog/agent-intrusion-technical-timeline) the same metadata-address family in an earlier and noisier variant of a separate July SSRF incident. The overlap shows similar interest in metadata-service access. It does not establish that the May workbook and July intrusion were the same workload, targeted the same processor, or came from the same agent.

This public evidence establishes a file-processing and SSRF probe set staged on Hugging Face on May 26th. The distinction to note is that the file clearly demonstrates probing intent, but it does not establish malicious authorization, successful exploitation, or which platform was targeted. An AI-assisted spreadsheet-processing environment (such as Hugging Face in this case) is a plausible target, but that remains an inference.

## May 30 Registration Code Becomes a Web Route

The most consequential public artifact appeared four days later. Between 00:01:27 and 00:11:58 on May 30, five commits created and configured the Hugging Face Space [0Time/altreg](https://huggingface.co/spaces/0Time/altreg/).

The sequence moved from Space creation to an abc text marker, then to a 454-line registration program and Flask wrapper. A later commit declared the Space application port. The final revision added targeted logging around the OAuth response.

The 454-line program is a copy of a publicly available Chinese-language OpenAI account-registration and token-extraction script published by [0x5uo2hen](https://github.com/0x5uo2hen/codex_register). The Space was created independently rather than as a Git fork. It added a small Flask wrapper and Docker configuration; the final commit added one OAuth-response diagnostic statement.

![⚠️ 图片托管失败 · codex-register: an OpenAI / ChatGPT Registration Tool & Token Extractor](https://www.sentinelone.com/wp-content/uploads/2026/09/agents_at_large_4.jpg)

![⚠️ 图片托管失败 · translated text from codex\_register repo](https://www.sentinelone.com/wp-content/uploads/2026/09/agents_at_large_2.jpg)

codex-register: an OpenAI / ChatGPT Registration Tool & Token Extractor (translated)

The program automates the creation of ChatGPT accounts via disposable `mail.tm` inbox creation, identity generation, browser-like requests, OpenAI Sentinel anti-abuse token requests, email verification, workspace selection, and OAuth token extraction. The public source was a command-line program that could loop through registration attempts.

The `altreg` commits added a small but important adaptation. A Flask wrapper defined an unauthenticated /do route that called reg.run(None) once and returned the program’s output. If the Space built, served, and received a request, each call could trigger one ChatGPT registration attempt. Repeated calls would make the design bulk-capable and could expose resulting credentials to an unauthenticated caller if the underlying registration succeeded.

Repeated successful calls could provide additional accounts or OAuth credentials. That makes `altreg` a potential identity-provisioning primitive, not demonstrated self-replication. Recursive scaling would require an agent to obtain usable credentials, launch more agent work, and retain control of that work. None of those runtime steps can be observed in such public data.

![⚠️ 图片托管失败 · Commit timeline for the 0Time/altreg Space on May 30, UTC.](https://www.sentinelone.com/wp-content/uploads/2026/09/agents_at_large_7.jpg)

Commit timeline for the 0Time/altreg Space on May 30, UTC.

As of September 14, Hugging Face’s API reported the Space as paused and flagged as abusive. However, this public state does not establish when the flag was applied or why.

The five-commit sequence is unusually compact. It progresses through a scratch marker, a complete program, a web wrapper, a deployment configuration, and response-specific debugging in 10 minutes and 31 seconds. That test-configure-debug cycle fits continued agentic activity, particularly alongside the account’s attributed May history.

## Why Committed Capability Matters

Traditional intrusion reporting often centers on execution: a payload ran, a credential was stolen, or a command-and-control channel came online. The public evidence here forces a more exact progression. For committed code to become an observed external effect, investigators must separately establish each stage:

-   Code was committed.
-   The hosted application was built.
-   The application started.
-   A route received a request.
-   The request produced an external action.
-   The action succeeded and its output was used.

The May 13 relay and May 30 registration evidence establish the first step. The May 26 workbook establishes formula placement, not evaluation. OpenAI’s records establish runtime for its May 26 WebCache write and proxy actions. The public commits identify likely external counterparts but do not independently prove the same request, session, or initiating agent. Only Hugging Face and OpenAI can compare token use, sessions, source networks, builds, runtime requests, and route access to determine whether and how any of this was used.

Collapsing these stages would overstate the case. Waiting for confirmed credential theft or malware would miss the risk. Unauthorized token use, public file writes, hosted relay code, internal-resource probes, and registration automation are recognizable offensive capabilities, and a benign research objective behind them does nothing to lessen their effect on the third-party systems they touch. An AI research objective should never remove their effect on third-party systems.

## Threat Intelligence Needs the Whole Task

None of the individual techniques observed here are new. Human operators have long used SSRF probes, public relays, disposable mail, OAuth automation, paste sites, source repositories, and legitimate cloud services. What changes is the investigative scale. A task-driven agent can assemble those pieces through other people’s accounts and hosted platforms while its originating lab, the hosting provider, and downstream services each retain only part of the evidence.

### Treat the Task as the Unit of Analysis

0Time and Nyx9 are evidence containers, not actor names. Analysts need to connect action order, code function, object hashes, prompts, tool calls, token lineage, and provider-side session identifiers. A handle can belong to a victim whose exposed token was used by someone or something else.

### Correlate Evidence Across Providers

OpenAI can see the authorizing workload and internal tool use. Hugging Face can see authentication, commits, builds, containers, and route requests. Other services may hold mail, proxy, DNS, or callback records. A defensible reconstruction requires those views to be joined without treating any one source as the entire event.

### Read Weak Artifacts as a Sequence

Strings such as “hi”, “abc”, and “abcdefg” are poor standalone indicators. Their value changes when they appear inside a rapid sequence of direct writes, relay creation, port declaration, parser probes, and targeted OAuth debugging. Detection should focus on construction patterns and action order rather than generic scratch text.

### Preserve Runtime Evidence Before Cleanup

Spaces can be paused, deleted, rebuilt, or garbage-collected. Commits and conversion outputs may survive after container and request evidence disappears. Providers should preserve token fingerprints, authentication and session identifiers, build logs, runtime logs, route requests, network egress, and deletion tombstones when agent-related abuse is reported.

### Make External Actions Attributable

Affected operators should be able to determine which customer authorized a task, which model and policy state governed it, which credential it used, and what it wrote outside the provider’s environment. Without that chain, saying an agent acted explains neither authority nor responsibility.

Finally, it’s critical to remember that model-behavior review and DFIR answer different questions during incident response of cases such as this. LLMs can accelerate transcript clustering, code review, artifact decoding, and timeline development. They should remain triage and hypothesis-generation tools.

In their review of the June/July activity, METR and Redwood reported that their GPT-5.6 Sol analysis agents made errors, exercised weaker judgment than human researchers, and surfaced anecdotes they could not always verify manually. The same approach made review at this scale possible. Speed is useful, but it does not make an LLM generated narrative authoritative.

## Independent Investigation Requires the Incident Record

OpenAI provided [METR](https://metr.org/blog/2026-08-26-openai-hugging-face-incident-investigation/) and Redwood Research with approximately 1,300 agent transcripts and 1.2 million Artifactory message-board entries for an on-premises review. As of publication, SentinelLABS could not identify an official public release of that underlying corpus. The resulting reports add useful context, but outside investigators cannot reproduce their conclusions, search systematically for omitted activity, or test competing explanations against the same evidence. METR incident investigation

Frontier AI labs should release a documented, redacted incident dataset when their agents interact with or affect third-party systems. At minimum, it should preserve the authorizing tasks, prompts, model and harness versions, action-level timestamps, agent messages, tool calls and results, external requests, and stable pseudonymous identifiers connecting sessions, accounts, and credentials. It should also state what was excluded, identify known gaps, document every class of redaction, and provide hashes for the released evidence.

This does not require publishing credentials, personal information, customer data, proprietary model details, or dangerous exploit material. Nor does it necessarily require unrestricted publication of private chain-of-thought. An action-complete record can preserve the observable decisions and causal sequence while removing genuinely sensitive fields. Where public release would still create unacceptable risk, labs could publish a structurally complete redacted dataset and provide fuller telemetry under controlled access to qualified independent DFIR and security-research organizations.

Privacy is a reason to redact the incident record, not a reason to make it unauditable. A narrative report—even one reviewed by external advisers—is not the same as an independently reproducible investigation. Once an agent reaches systems outside its developer’s environment, the evidence no longer concerns only the originating lab. Releasing a usable incident corpus should become a baseline accountability requirement for frontier-agent security incidents.

## Conclusion

OpenAI’s internal chronology established that agents used exposed Hugging Face credentials to write an external file and deploy proxy Spaces on May 26. The public account histories examined here add another layer: caller-directed relay code under 0Time on May 13; exact-minute public counterparts under Nyx9 for the May 26 file write and first proxy; a workbook containing file-processing and SSRF-oriented formulas later that night; and, on May 30, third-party OpenAI account-registration code committed alongside a wrapper defining an unauthenticated web route. Those records establish repository state and capability, not successful execution.

How quickly a task-driven system can assemble old techniques across other people’s accounts and infrastructure, and how thoroughly that scatters the evidence, is the part of this incident that is new. The public trail is not an appendix to an agent incident. It is part of the incident.

## Investigative Artifacts and References

The following records support the blog and are recommended for further investigative pivots. We normalized times to UTC and compared OpenAI’s minute-level chronology with second-level public commit metadata. Account handles, repository names, hashes, and the 169.254.169.254 destination should not be treated as standalone malicious indicators.

-   [OpenAI Hugging Face Incident Technical Report](https://cdn.openai.com/pdf/67869394-cb91-4c12-888c-5cbd85c7814c/OpenAI-Hugging-Face%20Incident-Technical-Report.pdf) — Published internal chronology; see pages 6–7 and 32–33
-   [OpenAI Hugging Face Incident and Misalignment](https://openai.com/hugging-face-incident-and-misalignment/) — OpenAI’s public account
-   [Hugging Face July Agent Intrusion Technical Timeline](https://huggingface.co/blog/agent-intrusion-technical-timeline) — Separate July incident referenced for comparison only
-   [OpenAI Black Hat presentation recording](https://www.youtube.com/watch?v=87DyyMV0kCY) — Shows the Artifactory write and message-board examples
-   [0Time puthack82d5 relay commit](https://huggingface.co/spaces/0Time/puthack82d5/commit/5508dd564b805cf3cef7cc4df7bad2732e427fc1) — May 13 initial relay behavior
-   [0Time puthack82d5 POST and Git LFS revision](https://huggingface.co/spaces/0Time/puthack82d5/commit/1901adfb15e54cdf924a3b66554864e5c0b31e8a) — May 13 later relay revision
-   [Nyx9 — May 26 20:04:11](https://huggingface.co/datasets/Nyx9/temptestlf8eb0/commit/e7156395856d5afd9216d63efdc42b9f884ebb23)
-   [Nyx9 netproxy17 relay commit](https://huggingface.co/spaces/Nyx9/netproxy17/commit/25226b3e610e1c942819c61da0f1100463c26444) — May 26 20:49:55
-   [0Time latnetnew relay commit](https://huggingface.co/spaces/0Time/latnetnew/commit/0790a6d802c8486be720467e7222d0639a95efe1) — Public revision after the 21:08 second-account event
-   [Nyx9 formbin.xlsx commit](https://huggingface.co/datasets/Nyx9/tmpdata177/commit/124eb6c0cc60a4db581cfd453bc1b586bac4e157) — Workbook with local, metadata, and internal-service targets
-   [0Time altreg principal code commit](https://huggingface.co/spaces/0Time/altreg/commit/03ed320c427ed1866d0612fd208f4f122b21d9f0) — Registration program and Flask wrapper
-   [0Time altreg OAuth-debug revision](https://huggingface.co/spaces/0Time/altreg/commit/2f61603a03b29a4df2e08114c36bba293bd1d878) — Final May 30 diagnostic change
-   [0x5uo2hen codex_register source commit](https://github.com/0x5uo2hen/codex_register/commit/c36e66d3cc38bd603fa417caea87be613b438084) — Earliest exact public source located
-   [Microsoft WEBSERVICE function documentation](https://support.microsoft.com/en-us/office/webservice-function-0546a35a-ecc6-4739-aed7-c0b7ce1562c4)
-   [Microsoft Azure Instance Metadata Service](https://learn.microsoft.com/en-us/azure/virtual-machines/instance-metadata-service) — Header and access requirements
-   [openpyxl formula documentation](https://openpyxl.readthedocs.io/en/stable/simple_formulae.html) — Formula storage and evaluation limitations
