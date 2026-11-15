---
title: "Exchange for breakfast: Turla’s Cereal tricks are not for kids"
source: https://www.welivesecurity.com/en/eset-research/exchange-for-breakfast-turlas-cereal-tricks-are-not-for-kids/
source_host: www.welivesecurity.com
clip_date: 2026-11-15T09:55:56+08:00
trace_id: d7e6772a-8094-475d-8914-fcb4833d898d
content_hash: abd50caab942ba5afcc1af9463b2c4aabe1fdf141fb5dcbf362e5086d9903522
status: synced
tags:
  - 恶意样本
  - 漏洞分析
series: null
feed_source: ESET WeLiveSecurity
ai_summary: Turla 新工具集"Cereal"将受害者被入侵的 Exchange 服务器当作 C&C 基础设施，在内存中执行命令并劫持邮件传输管道窃取指定邮件，已确认入侵哈萨克斯坦与罗马尼亚政府机构。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 41975244-d011-81cd-8745-c9cc258d9921
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Turla 新工具集"Cereal"将受害者被入侵的 Exchange 服务器当作 C&C 基础设施，在内存中执行命令并劫持邮件传输管道窃取指定邮件，已确认入侵哈萨克斯坦与罗马尼亚政府机构。
> 
> - **攻击目标与时间：** 2025 年 11 月 28 日在哈萨克斯坦政府机构发现该工具集，同年 12 月 23 日又在罗马尼亚政府机构发现，后者配置为收集与 NATO、EU 往来的邮件，契合俄罗斯情报优先方向。
> - **无外部 C&C：** 被动后门 CerealNeuron 不主动外联，而是伪装成合法 Exchange 路径（如 /owa/sdds/）被动监听加密 Web 请求，校验通过后解密执行命令，流量混入正常 Exchange 服务，难以检测或封堵；另有读盘执行的 CerealHermit 作为备用通道。
> - **模块化组件链：** 包括磁盘加载器 CerealLoader、内嵌加密载荷的 CerealRunner/CerealSprinter、注入器 CerealIron、邮件收集模块 CerealBox 等；命令以独立编译的 .NET 小程序下发，数量庞大的同类二进制暗示存在自动化编译交付框架。
> - **.NET 高级技巧：** CerealLoader 利用 Vtable Fixups 在 .NET 运行时启动前执行原生代码，伪装成 wbem 目录下的合法 DLL 被系统进程加载，并投放至 .NET 原生镜像缓存（如 Microsoft.Exchange.Search.Mdb.ni.dll）实现持久劫持。
> - **CerealBox 新颖技术：** 直接注入 EdgeTransport.exe，包装内存中已有的传输代理处理器，而非注册新传输代理；按发件人、收件人、主题等硬编码规则筛选含 .doc/.pdf 附件的邮件，压缩加密后暂存磁盘再由后门外传。

On a compromised Exchange server, the most interesting activity is not always the message that arrives in a user’s inbox.

Somewhere in a national government office, an official sends an email to a colleague at a transnational military alliance. The message goes out through a Microsoft Exchange server, exactly as it should, and nothing looks suspicious. But before the email leaves the building, a piece of code quietly examines it, decides that it is interesting, and sets aside a copy to be forwarded to prying eyes, while the original email continues on its way.

On November 28 th, 2025, we found the toolset that installs such code on an Exchange server of a governmental organization in Kazakhstan. What initially looked like separate suspicious components soon revealed a previously undocumented toolset: a collection of modular.NET malware designed to run on Microsoft Exchange servers, receive commands, execute them in memory, map the compromised organization, and collect selected email messages. After fine-tuning our detections, we found the same toolset at a governmental organization in Romania – compromised on December 23 rd, 2025 – where it was configured to identify emails sent to, or received from, The North Atlantic Treaty Organization (NATO) and European Union (EU).

Because the tools rely heavily on serialization (a technique for packaging data and code for transport), we have given them names that start with the prefix “Cereal”. What makes this toolset stand out is its combination of novel techniques requiring deep knowledge of Exchange internals with unusual.NET execution methods.

One of the most interesting aspects of this toolset is what we did *not* find: external command and control (C&C) infrastructure. Instead – adding insult to injury – the victim’s compromised Exchange server is co-opted to act as the C&C infrastructure.

We attribute Cereal, with high confidence, to the Russia-aligned APT group Turla, based on the concurrent use of another component publicly linked to Turla and conceptual similarities to older Turla malware. The full technical analysis is available in [our white paper](https://web-assets.esetstatic.com/wls/en/papers/white-papers/turla-cereal-tricks.pdf).

> **Key points of this blogpost:**
> 
> -   We initially observed an undocumented toolset at a governmental organization in Kazakhstan. After fine-tuning our product’s detection of these tools, we discovered a compromised governmental organization in Romania a month later.
> -   We uncovered a sophisticated, modular, and tightly interconnected toolset, designed to run on Exchange servers of compromised entities, for long-term cyberespionage.
> -   No external network infrastructure was observed. One of the malicious components, a passive backdoor that runs on Exchange servers, provides access to the internal network.
> -   Commands are sent by the operators in the form of separate executables with a similar, custom-built structure. This hints at the existence of a framework that automates compilation and delivery of commands.
> -   An automated email collection module, injected into legitimate Microsoft Exchange processes, accesses and manipulates the email transport pipeline. This requires deep understanding of the inner workings of Microsoft Exchange and is a novel technique.
> -   The use of various.NET tricks, such as unmanaged entry points, and abuse of the.NET native image cache makes this toolset quite sophisticated in comparison to most recent APT cases that we have researched.

## Victimology and geopolitical context

Turla, also known as Snake, has been active since at least 2004 and is widely assessed to be part of Russia’s [Federal Security Service](https://interaktiv.br.de/elite-hacker-fsb/en/index.html) (FSB). Its usual targets are governments, diplomatic missions, and defense organizations, primarily across Europe, Central Asia, and the Middle East. We have documented a large part of Turla’s arsenal on WeLiveSecurity. In 2025, we also reported unusual cooperation between Turla and Gamaredon in our blogpost [Gamaredon X Turla collab](https://www.welivesecurity.com/en/eset-research/gamaredon-x-turla-collab/) and in our white paper [Gamaredon in 2025: Leveraging tunnels, workers, dead drops, and new alliances](https://web-assets.esetstatic.com/wls/en/papers/white-papers/gamaredon-in-2025.pdf).

![Gamaredon X Turla collab](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6262dbbdf7733e06.png)

![Gamaredon in 2025: Leveraging tunnels, workers, dead drops, and new alliances](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/66b41c6c4490141d.png)

The Cereal toolkit demonstrates Turla’s ability to carry out a slow, careful, long-term intrusion built around Microsoft Exchange servers.

We identified two national governmental organizations compromised by Cereal, in geographies that align closely with Turla’s known targeting. Based on ESET telemetry, around 70% of countries targeted by Turla since 2022 have been former Soviet republics or European countries that were once closely aligned with the Soviet Union. The geographic distribution of the two confirmed compromises is shown in Figure 1.

![Figure 1. Countries and sectors we observed compromised by Turla’s Cereal toolset](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/76b75dac0b2d5231.png "Figure 1. Countries and sectors we observed compromised by Turla’s Cereal toolset")

Figure 1. Countries and sectors we observed compromised by Turla’s Cereal toolset

The Romanian case is notable because one component, CerealBox, was configured to collect messages involving NATO and EU institutional addresses. This focus fits long-standing Russian intelligence priorities. It may also relate to regional tensions: since early 2025, Romania has reported several incidents involving [Russian drones](https://www.politico.eu/article/nato-allies-weigh-fast-track-drone-purchases-russia-crash-romania/) crashing near or within its territory, prompting [strong reactions](https://jamestown.org/romania-no-longer-turns-blind-eye-to-russias-airspace-violations/) from Romanian authorities and [calls for a NATO mission](https://www.politico.eu/article/romania-calls-nato-black-sea-mission/) in the Black Sea region.

The Kazakh compromise also occurred in a relevant political context. Since January 2026, Kazakhstan has reportedly begun [deporting some Russian exiles](https://thediplomat.com/2026/02/with-deportations-and-extraditions-kazakhstan-continues-pursuit-of-fled-russians/) and regime critics who had previously found relative safety there after Russia’s full-scale invasion of Ukraine. Compromising a Kazakh governmental body fits a scenario in which the operators want visibility into Russian dissidents known to Kazakh authorities but not yet on any deportation list.

There is one more detail worth noting. Activity in Kazakhstan surged on January 15 th, 2026 – the day after the Old New Year, an informal holiday still observed in Russia and some neighboring countries. While malware does not celebrate holidays, its operators do.

## Tracing the Cereal crumbs

The first components we found did not resemble a classic backdoor. There was no obvious monolithic implant, no built-in command list, and no simple beaconing pattern. Instead, the activity appeared as a chain of specialized components: encrypted payloads on disk,.NET assemblies embedded inside other.NET assemblies, legitimate Windows processes loading suspicious DLLs, and Exchange services executing code that did not belong there.

Reconstructing that chain revealed a modular toolset built around a few recurring design principles: keep payloads encrypted, keep execution in memory whenever possible, reuse the compromised Exchange server, and deliver commands as separate.NET assemblies. Figure 2 shows the relationships between all of the observed components of the toolset.

![Figure 2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/189a211c059c1d5b.png "Figure 2. Components used in the observed attacks")

Figure 2. Components used in the observed attacks

Main components are:

-   CerealLoader, which loads and runs a.NET assembly from an encrypted file on disk. This is the only component in the toolset that is written to disk as a recognizable.NET file. Everything else is delivered inside encrypted containers, unpacked at runtime, and executed from memory.
-   CerealRunner, which contains other encrypted binaries that are loaded and executed. It provides a way to encapsulate and deliver commands, as well as other components.
-   CerealSprinter, which is similar to CerealRunner, but is used only to load and run other components.
-   CerealNeuron, a passive backdoor with no built-in commands but capable of executing assemblies contained in CerealRunner binaries, received in network requests; we named it in reference to Neuron, a malware family documented and attributed to Turla by the United Kingdom’s [National Cyber Security Centre](https://web.archive.org/web/20250920160446/https:/www.ncsc.gov.uk/static-assets/documents/Turla%20group%20using%20Neuron%20and%20Nautilus%20tools%20alongside%20Snake%20malware_1.pdf) in 2017, given that they are functionally similar.
-   CerealHermit, a variant of CerealNeuron with no network functionalities. It reads commands from encrypted files on disk.
-   CerealIron, an injector that allows operators to load and run.NET assemblies from non.NET processes.
-   CerealBox, which processes, filters, and collects interesting email messages by being injected into Microsoft Exchange’s transport service.
-   CerealMoth, a simple component that receives an assembly and a method name as arguments, loads the assembly, and runs the specified method.

## When the victim’s Exchange is the infrastructure

The most notable aspect of this campaign is what we did not find: an attacker-controlled server.

Most backdoors periodically contact their operators. That behavior leaves traces – domains, IP addresses, hosting providers, timing patterns – that defenders identify and block. CerealNeuron, the main backdoor in the Cereal toolset, does none of that. Instead of initiating outbound connections, it waits for incoming requests.

CerealNeuron runs on the compromised Exchange server and passively listens for incoming web requests on paths that look like ordinary Exchange traffic. Among the paths we observed:

-   https://\*:443/owa/sdds/
-   HTTPS://\*:443/AUTODISCOVER/PROXYSERVICE/
-   HTTPS://\*:443/MICROSOFT-SERVER-ACTIVESYNC/INTEGRATED/API/

To a firewall log or an analyst reviewing traffic, requests to these paths blend in with legitimate Outlook Web Access, Autodiscover, and ActiveSync traffic. If a request for a resource on one of these paths is properly encrypted and passes several integrity checks, CerealNeuron decrypts it, treats the contents as a command, and runs it. If a request looks wrong, CerealNeuron redirects the client to a legitimate-looking Exchange error page.

The consequences are significant:

-   There is no dedicated C&C infrastructure to discover, block, or take down. The victim’s own internet-facing Exchange server is the operator-accessible control point.
-   Network-based tracking is severely limited. We were unable to identify the ingress IP addresses used by the operators. They may have connected directly, via anonymization services, or from other compromised hosts.
-   Malicious traffic coexists with legitimate Exchange web services – exactly the kind of traffic defenders are least likely to block.

Figure 3 shows the communication flow between operators and CerealNeuron.

![Figure 3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d03b10cbc3c66b70.png "Figure 3. Communication flow between operators and CerealNeuron for command execution")

Figure 3. Communication flow between operators and CerealNeuron for command execution

Abusing a compromised Exchange server as a central operational hub is a rare technique, used by only a handful of APT groups. Turla has used variations of this approach in the past. With Cereal, relying on the victim’s Exchange server removes the need for dedicated attacker infrastructure.

The toolset also provides a fallback mechanism. CerealHermit is a variant of CerealNeuron with the network parts removed. Instead of waiting for web requests, it reads encrypted command files from disk and writes encrypted results back. In some intrusions, both backdoors were deployed together, giving operators two independent ways to reach their goals.

## Commands as disposable programs

Rather than a single large backdoor containing every possible command, Turla’s operators deliver each command as its own small, compiled.NET program.

The core execution component is CerealRunner. It carries other encrypted.NET programs inside itself, along with the arguments needed to run them. When it executes, it unpacks its payloads, runs them in memory, and returns their output through the same pipeline so CerealNeuron can encrypt and send it back.

We detected numerous CerealRunner binaries across the two intrusions. They share the same structure but differ in the small piece of code that implements each specific task.

The commands include:

-   Retrieving mailboxes or specific messages via [Exchange Web Services](https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/ews-operations-in-exchange).
-   [Querying Active Directory](https://medium.com/@alimustafa98.tech/unlocking-active-directory-how-to-read-and-retrieve-data-efficiently-adf02e22a397) for computers, users, groups, and DNS records.
-   Running [WMI queries](https://learn.microsoft.com/en-us/dotnet/api/system.management?view=netframework-4.8.1) – for example, to list [processes](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process) or active [TCP connections](https://learn.microsoft.com/en-us/windows/win32/fwp/wmi/nettcpipprov/msft-nettcpconnection).
-   Extracting [LSA Secrets](https://www.ired.team/offensive-security/credential-access-and-credential-dumping/dumping-lsa-secrets) (credentials that Windows stores locally).
-   Listing volume snapshots.
-   Listing, reading, and deleting files – often the staged email dumps produced by CerealBox.

The sheer volume of near-identical binaries, each compiled for a specific task, strongly suggests that the operators have an internal framework that automates the compilation and packaging of commands. Combined with a codebase built around modular, interchangeable components, the impression is one of a mature, well-engineered platform – rather than a loose collection of scripts.

## .NET tricks that are not for kids

What distinguishes Cereal from most recent APT cases is how deeply it leverages the inner workings of [.NET](https://dotnet.microsoft.com/), Microsoft’s software framework that powers a large part of Windows and Exchange itself.

Normally,.NET programs run through the Common Language Runtime (CLR), which converts a program’s instructions into machine code just before running them. This whole process is visible to standard analysis tools. Cereal repeatedly operates outside these standard, observable paths.

### A.NET program that runs native code before any.NET code

CerealLoader is the only Cereal component written to disk in unencrypted form. In a.NET decompiler, the entry point code does essentially nothing, and a breakpoint set on the malicious method is never triggered.

In practice, CerealLoader executes low-level, machine-native code before the.NET runtime even starts running its normal instructions. It abuses a rarely used feature of the.NET specification, Vtable Fixups, to build a hidden bridge from native code back into a.NET method that no other part of the program appears to call. An analyst inspecting only the.NET side sees code that appears to do nothing. By that point, the real payload has already run.

### Hijacking legitimate Windows components

Because CerealLoader can bootstrap itself from native code, the operators can drop it in places where legitimate, non-.NET Windows processes will load it. In one execution chain, CerealLoader was placed as ncobjapi.dll inside C:\\Windows\\System32\\wbem\\, where the Windows Management Instrumentation service loaded it automatically. In another, it impersonated wbemcomn.dll in the same folder. The malicious DLL forwards legitimate function calls, so the affected process continues to operate normally.

### Abuse of the.NET native image cache

To improve startup performance,.NET keeps a cache of precompiled versions of common libraries in a system folder. When a program asks for one of these libraries, the runtime checks the cache first and, if there is a match, loads the cached version instead of JIT-compiling the assembly’s code. The operators placed malicious CerealLoader files in this cache, using names such as Microsoft.Exchange.Search.Mdb.ni.dll. When Exchange asked for the corresponding library, the runtime loaded the malicious version instead. Because the malicious file contains no real replacement code,.NET quietly falls back to the genuine library for actual functionality – but not before the attackers’ native entry point code has executed. In one sample, the malicious code only activates when the parent process is Exchange’s search service.

Each of these techniques is documented in lesser-known parts of the.NET specification. What is unusual is seeing them combined so deliberately in a single toolset, and used specifically to hide inside Microsoft Exchange.

## CerealBox: hooking Exchange from the inside

The Cereal component that uses the most novel technique is CerealBox, an email collection module built for Microsoft Exchange.

Turla has targeted Exchange servers before, including through the abuse of [transport agents](https://learn.microsoft.com/en-us/exchange/mail-flow/transport-agents/transport-agents) – a legitimate Exchange feature that lets developers hook into the flow of email for tasks such as spam filtering. Installed transport agents, however, leave visible traces in Exchange’s configuration.

CerealBox uses a stealthier approach. Instead of registering itself, it is injected directly into EdgeTransport.exe, the Exchange process that handles email flow. Reaching that point, however, is not straightforward: CerealBox is delivered through an intricate chain of nested Cereal components, illustrated in Figure 4.

![Figure 4](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ac5f03b183f1a22c.png "Figure 4. Observed execution chain delivering CerealIron to execute CerealBox")

Figure 4. Observed execution chain delivering CerealIron to execute CerealBox

Once inside, CerealBox accesses Exchange’s internal structures, finds the existing transport agents, and wraps their handlers with malicious code. The wrappers run CerealBox’s own logic first, then hand control back to the original code. Email continues to flow normally. No new agent appears anywhere in Exchange’s configuration. In short: CerealBox doesn’t add a new agent; it hijacks existing ones loaded in memory.

Having visibility into the mail flow, CerealBox picks out messages of interest. A message qualifies if it has a.doc,.docx, or.pdf attachment and matches at least one of several hardcoded lists – sender addresses, recipient addresses, subject substrings, or attachment names – while avoiding matching ignore lists. Interesting messages are compressed, encrypted, and staged in files on disk. Operators later use ordinary CerealNeuron commands to exfiltrate and delete these files.

Injecting into the Exchange transport service and hooking mail flow from within is a novel technique, not previously documented for any malware family. It requires a deep understanding of how Exchange’s mail pipeline is structured internally – the kind of knowledge that requires significant time and effort to acquire.

## Conclusion

The Cereal toolset is a carefully constructed instrument for long-term, stealthy cyberespionage. It leaves little on disk, avoids external infrastructure that could be discovered and blocked, and conceals itself within legitimate Exchange processes. The use of unmanaged entry points, VTable Fixups, native image cache abuse, and in-memory injection into Exchange’s transport pipeline reflects a level of investment in.NET tradecraft that is uncommon even among sophisticated APT actors.

The Cereal toolset demonstrates that, for Turla, Exchange servers are not just mail servers – they are durable collection points, internal execution hubs, and a suitable environment for hiding sophisticated.NET tradecraft.

> *For any inquiries about our research published on WeLiveSecurity, please contact us at [threatintel@eset.com](mailto:threatintel@eset.com?utm_source=welivesecurity.com&utm_medium=referral&utm_campaign=autotagging&utm_content=eset-research&utm_term=en).*
> 
> *ESET Research offers private APT intelligence reports and data feeds. For any inquiries about this service, visit the [ESET Threat Intelligence](https://www.eset.com/int/business/services/threat-intelligence/?utm_source=welivesecurity.com&utm_medium=referral&utm_campaign=wls-research&utm_content=exchange-for-breakfast-turlas-cereal-tricks-are-not-for-kids&sfdccampaignid=7011n0000017htTAAQ) page.*

## IoCs

A comprehensive list of indicators of compromise (IoCs) can be found in [our GitHub repository](https://github.com/eset/malware-ioc/tree/master/turla) and the [Turla white paper](https://web-assets.esetstatic.com/wls/en/papers/white-papers/turla-cereal-tricks.pdf).

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/706791cfcddfe0ba.png)](https://www.eset.com/int/business/services/threat-intelligence/?utm_source=welivesecurity.com&utm_medium=referral&utm_campaign=wls-research&utm_content=exchange-for-breakfast-turlas-cereal-tricks-are-not-for-kids&sfdccampaignid=7011n0000017htTAAQ)
