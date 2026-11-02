---
title: "CyberStrikeAI in the wild: the use of AI in real-world attacks on organizations"
source: https://securelist.com/tr/cyberstrikeai-attacks/121715/
source_host: securelist.com
clip_date: 2026-11-02T17:16:06+08:00
trace_id: 42ac256a-11ba-4051-9c18-9440e0442922
content_hash: 2711ac0b0d9f84b7d7018555a6578ce142fcbe84f442d96f53a0e4769dffdf11
status: synced
tags:
  - 威胁情报
  - AI辅助攻击
series: null
feed_source: Kaspersky Securelist
ai_summary: LLM 编排框架 CyberStrikeAI 已在实战中用于攻击非洲和拉美教育机构的域环境，AI 从辅助准备阶段进入后渗透核心，全攻击链 3–4 天内完成域控接管。
ai_summary_style: key-points
images_status:
  total: 65
  succeeded: 65
  failed_urls: []
notion_page_id: 40c75244-d011-814b-95f3-f367d8f5291a
ioc:
  cves: []
  cwes: []
  hashes:
    - 09e1da2afa1216ecc55648ec8e122d2a
    - 0bbd08af95f877f1d568b03de2eb76b4
    - 2770562d104391b92b42671c270079bb
    - 29efd64dd3c7fe1e2b022b7ad73a1ba5
    - 74f57b3e897a4960dcdd5b7e8a54f9df
    - 805b9e4ae74c903787416800999b8418
    - d726a8b4886c636f76ca6d30ef6a6ff4
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> LLM 编排框架 CyberStrikeAI 已在实战中用于攻击非洲和拉美教育机构的域环境，AI 从辅助准备阶段进入后渗透核心，全攻击链 3–4 天内完成域控接管。
> 
> - **攻击时间线：** 攻击者先经被入侵的 SQL Server 手动侦察后停顿两周；部署 agent 后 2 分钟完成持久化与本地侦察，5 小时完成域侦察，最终经 SMB/WMI 横向移动、批量凭据转储与数据库导出仅需约 1 小时。
> - **架构分工：** CyberStrikeAI（Go 编写的开源平台）将 LLM 编排器置于 C2 服务器端，通过 MCP 工具调用侦察/利用程序；植入体是无 AI 逻辑的普通 beacon，经 HTTP/S、TCP 或 WebSocket 轮询，无 API 密钥外联，受害者侧无 AI 痕迹。
> - **归因线索：** 植入体 Go 构建元数据（含 vcs 提交哈希与 dirty 标志）形成唯一指纹，区分出两个互不重叠的攻击组；脚本中的中文注释、dnslog[.]cn 等中国服务、C2 重启多发生在 UTC+8 工作时段，指向中文攻击者。
> - **典型手法：** comsvcs.dll MiniDump 转 LSASS（用 PID 规避命令行检测）、reg.exe 导出注册表配置单元、改名 mimikatz 执行 DCSync 与 Golden Ticket、LDAP 查询为 Kerberoasting/AS-REP Roasting 收集数据、Impacket WMIExec 横向移动。
> - **检测结论：** AI 生成的动作与人类渗透测试者无异，经典行为规则即可覆盖——如监控 schtasks 远程建任务、comsvcs.dll 访问 LSASS、PowerShell 经 WinRM/WMI 远程执行；KATA 可基于流量特征报 `Backdoor.CyberStrikeAI.HTTP.C&C`。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7e52feb070aa5dee.jpg)

## Introduction

As part of proactive threat monitoring, Kaspersky’s Cyber Threat Intelligence team identified a malicious campaign involving C2 agents controlled by artificial intelligence. Confirmed victims of the campaign included organizations in the education sector in several countries across Africa and Latin America. CyberStrikeAI played a key role in the post-exploitation phase. This is an open-source framework in which an LLM orchestrator on the command-and-control server plans actions, selects tools, and generates commands, while an implant executes them on compromised hosts. Using CyberStrikeAI, the attackers progressed from reconnaissance to full domain compromise.

According to our data, this is one of the first public descriptions of a compromise involving an LLM in the wild. The campaign we discovered clearly illustrates how the role of AI in attackers’ arsenals is evolving: until recently, language models were used primarily during preparatory stages – for writing phishing emails, debugging code, or searching for vulnerabilities. Now, however, they are being embedded into the very core of the attack, automating actions at every stage: payload execution, persistence on the host, discovery, lateral movement, and, finally, data collection and exfiltration. Post-exploitation – the stage that traditionally required manual work by an experienced operator – plays a particularly significant role here.

A key feature of the scheme using the CyberStrikeAI framework is that the implant ceases to be a simple tool for executing the operator’s commands. Decisions are distributed across two levels: the operator defines the task in general terms, while the model determines how to execute it – specifically, which commands to send to the host and in what sequence. Thus, the strategic planning remains with the human, while the choice of technical steps is delegated to the model, and the implant executes the model’s decisions.

To understand how this scheme works in practice, let’s examine the chain of actions taken by the attackers, as reconstructed by our analysts during the incident investigation.

## Timeline of the attack

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a2fc9e2fa67055cc.jpg "cyberstrikeai-attacks1")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30155205/cyberstrikeai-attacks1.jpg)

Let’s examine the timeline of the attack using an example from one incident within the detected campaign.

The first phase follows a standard approach: a human operator gains access to the victim’s infrastructure via a compromised SQL Server (version 16.0.1000), then collects basic information about the host, deploys tools, and conducts network reconnaissance. All of this activity takes nearly a day, followed by a two-week pause.

The second phase is fundamentally different. The first step involves deploying the CyberStrikeAI C2 agent, which receives commands from a server-based LLM orchestrator. During the second phase, the agent performs the following:

-   establishing persistence and conducting local reconnaissance within 2 minutes;
-   conducting domain reconnaissance over the next 5 hours;
-   after a brief pause of several days, moving on to the final stage – lateral movement via SMB and WMI, mass credential dumping on hosts, and database export – with the entire operation taking no more than one hour.

We’ll discuss these stages in more detail in the next section.

## Technical details

### CyberStrikeAI overview

CyberStrikeAI is an open-source, [modular platform written in Go](https://github.com/aipentest/cyberstrikeai) for automating penetration testing. Its key feature is combining LLM-based attack orchestration and a built-in C2 server with agents (beacons) within a single server process.

The entire “intelligent” layer is isolated on the control server. C2 functions (calling reconnaissance and exploitation utilities, managing webshell connections, assigning tasks to agents, and reading results) are available to the model as MCP tools. The implant is a classic C2 agent with no AI functionality – no API keys, no calls to AI service APIs, and no autonomous logic. It periodically polls the listener server via HTTP/S, TCP, or WebSocket, executes shell commands, and interacts with the file system. To the victim, this activity looks like a typical remote-control session, where a server-side LLM orchestrator queues tasks instead of a live operator. The LLM influences how decisions are made, but not how the corresponding commands are delivered to the host.

Although CyberStrikeAI is publicly available, specific instances of the framework can be linked to specific attackers or campaigns. Detection and attribution are possible based on the following artifacts:

-   **Control panel**: Upon launch, a self-signed TLS certificate is generated, with the framework’s name appearing in the issuer and subject fields. The certificate is created in memory at each startup, so the `not_before` field effectively records the time the process was launched. Accordingly, as with Cobalt Strike, the chronology of restarts can be reconstructed from the scan history.
    
    [![CyberStrikeAI control panel's self-signed TLS certificate](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e1d3f22fb923351a.png "cyberstrikeai-attacks2")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30155326/cyberstrikeai-attacks2.png)
    
    CyberStrikeAI control panel’s self-signed TLS certificate
    
-   **Implant**: The build metadata (`go version -m`) contains a path to the main package, which includes data pointing to the built-in CyberStrikeAI generator – a temporary directory with the build identifier. This path is identical for all payloads, making it a reliable signature. Additionally, the `build info` field contains version control system metadata, which can be used to compare samples against one another.
-   **Authentication**: When communicating with the server, the implant sends an `X-Implant-Token` header with a fixed value in the HTTP request. The token is unique to each C2 server and is embedded into the malicious payload during the build phase; therefore, it serves as both a network indicator and a sign that the samples belong to the same server.

It should be noted that the implant version does not reflect the server version. The implant can operate for months while the operator updates the server-side components: listener configurations and keys are preserved during updates. In the incidents we detected, we observed the use of a single agent version throughout the entire incident. In such cases, the sample’s build date may indicate the earliest possible deployment date of the CyberStrikeAI infrastructure, but it still does not provide an estimate of the compromise duration.

### Execution & Privilege Escalation

The first malicious commands on the victims’ systems in the campaign under investigation originated from the sqlservr.exe process, indicating the likely initial access vector and the context in which the attackers gained the ability to execute code. It is important to note that the commands marked as having been executed **prior to** agent installation were executed manually by the attacker specifically within the context of this process. At this stage, we are not yet dealing with automated implant activity, but rather with manual actions by the operator.

Before launching the agent on the machines, the attackers checked for its presence using a PowerShell script, from which we can deduce its default deployment paths: C:\\Windows\\Temp\\, C:\\Windows\\, C:\\ProgramData\\, C:\\Temp. At the same time, the attacker can disguise the agent’s name as that of a legitimate system process. In the example below, it mimics svchost.exe (svchost **s**.exe)

[![Checking for the presence of the CyberStrikeAI agent on the system](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a6f03042bd11b224.png "cyberstrikeai-attacks4")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30155621/cyberstrikeai-attacks4.png)

Checking for the presence of the CyberStrikeAI agent on the system

[![Delivery and execution of the CyberStrikeAI agent](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/433a1dd9d94d22c3.png "cyberstrikeai-attacks5")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30155645/cyberstrikeai-attacks5.png)

Delivery and execution of the CyberStrikeAI agent

Like most C2 agents for Windows, CyberStrikeAI uses PowerShell to execute its payload. When a request is received from the operator, the commands to be executed are additionally encoded in Base64 to bypass keyword-based detection.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/615c24261d779d8e.png "cyberstrikeai-attacks6")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30155745/cyberstrikeai-attacks6.png)

Decoded form of the command:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a116099759c1a2c7.png "cyberstrikeai-attacks7")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30155822/cyberstrikeai-attacks7.png)

When administrative privileges were available (for example, a domain administrator account), instead of executing commands directly, the agent on remote hosts often created scheduled tasks so that the malicious payload would run with SYSTEM privileges:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3e09321101a682d6.png "cyberstrikeai-attacks8")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30191212/cyberstrikeai-attacks8.png)

An alternative method that does not use `schtasks` utility is to create a task via the `Schedule.Service` COM object:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/39b1b95db2587ce1.png "cyberstrikeai-attacks9")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30191254/cyberstrikeai-attacks9.png)

The payload (p1.ps1) from the example above is a reverse shell that connects to the server at 185.186.245\[.\]144:5501:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e5c48e8d1055e947.png "cyberstrikeai-attacks10")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30191314/cyberstrikeai-attacks10.png)

The p1.ps1 payload and similar scripts were distributed across the network using shared network administrative folders and the WMI protocol, which we will describe in more detail in the [Lateral Movement](#lateral-movement) section.

### Stealth

In addition to encoding commands in Base64 and obfuscating SQL/LDAP queries – which we will describe in the [Collection & Exfiltration](#collection-exfiltration) and [Discovery](#discovery) sections, respectively – the attackers split the malicious payload into multiple files. It is noteworthy that the scripts were transmitted in this manner even before the agent was installed – that is, at a stage where human intervention is typically required – yet they clearly bear the hallmarks of being generated by an LLM.

Below is a sequential record of several script fragments written to the file d3.b64.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d8fccf3111d1ad04.png "cyberstrikeai-attacks11")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30191350/cyberstrikeai-attacks11.png)

Subsequently, the attackers used the certutil utility to decode the resulting file and executed it with the following command:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d331bcbdbcf8056d.png "cyberstrikeai-attacks13")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30191500/cyberstrikeai-attacks13.png)

Once assembled and decoded, the script’s contents looked like this:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3c16dad9f66a34bc.png "cyberstrikeai-attacks14")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30191519/cyberstrikeai-attacks14.png)

The script is a tool for decrypting DPAPI secrets from the file C:\\ProgramData\\dsn_line.txt. This file, in turn, is populated by the following command, which searches for a DSN string containing connection settings in the SQL Server Reporting Services configuration file rsreportserver.config and copies its contents to dsn_line.txt.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/06ee3036d36ebea5.png "cyberstrikeai-attacks15")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30191538/cyberstrikeai-attacks15.png)

It is worth noting that some of the scripts delivered and executed as described above contain comments in Chinese (## – researcher’s comments).

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7c935ce509fecb0b.png "cyberstrikeai16_en")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/31183306/cyberstrikeai16_en-1-scaled.png)

### Persistence

If the CyberStrikeAI implant was successfully delivered, the first step was to establish persistence on the target system. To do this, the agent created a scheduled task named `SystemUpdate`, which specified the path to the implant as the action to be performed:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dc423a554c3133da.png "cyberstrikeai-attacks17")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30191629/cyberstrikeai-attacks17.png)

Analysis of the framework’s source code revealed an alternative method of persistence: by adding a value to the registry key `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, where the name of the created value matches the task name (`SystemUpdate`).

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3b883421ecd8e50b.png "cyberstrikeai-attacks18")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30191655/cyberstrikeai-attacks18.png)

Agent persistence on Linux systems is also implemented in two ways – by adding the entry `@reboot <path_to_beacon> &` to the user’s crontab (in which case the process runs at system startup), or by adding the line `(nohup <path_to_beacon> &>/dev/null &)` to `~/.bashrc` (in which case the agent starts when an interactive bash shell is opened).

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/795fb8c1c16a4bdb.png "cyberstrikeai-attacks19")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30191741/cyberstrikeai-attacks19.png)

It is worth noting that the choice of a specific persistence method is delegated to the LLM connected to CyberStrikeAI. However, thanks to the human-in-the-loop (HITL) mechanism, the operator retains full control over the process: commands generated by the model may require manual approval or correction before they are executed.

### Discovery

#### Local Discovery

Before installing the agent on a compromised host, the attackers manually gathered basic system information using a fairly trivial set of commands:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f78ff3225d9037ed.png "cyberstrikeai-attacks20")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30191909/cyberstrikeai-attacks20.png)

The attackers also manually checked for internet access and obtained the external IP addresses of the compromised machines using the Chinese service dnslog\[.\]cn. The service generates a random third-level domain, after which the attackers attempt to resolve it on the compromised machine.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/93423502bb4c579e.png "cyberstrikeai-attacks21")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30191927/cyberstrikeai-attacks21.png)

If the machine has internet access, the request succeeds, and the attackers obtain the external IP address of the compromised device on the service’s page.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bfa2c04e2217a3b5.png "cyberstrikeai-attacks22")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30191947/cyberstrikeai-attacks22.png)

For reconnaissance purposes, the agent generates a more complex script designed to map out a path for further privilege escalation by compromising SCCM or exploiting msiexec (the `AlwaysInstallElevated` key):

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6bf6ae34b12e61e6.png "cyberstrikeai23_en")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/31183332/cyberstrikeai23_en-scaled.png)

Additionally, to find ways to elevate privileges locally, the agent executed scripts to inventory services running under domain accounts and tasks running under the SYSTEM account:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/904216f540febc30.png "cyberstrikeai24_en")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/31183404/cyberstrikeai24_en-scaled.png)

During their activity, the attackers periodically checked for Microsoft Defender detections:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ed3a597bee61669f.png "cyberstrikeai-attacks25")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192213/cyberstrikeai-attacks25.png)

#### Remote Discovery

After gathering information about the compromised host, the attackers proceeded to conduct reconnaissance within the network. During the preparatory phase of the attack, they manually collected additional information about remote hosts using the net.exe utility.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7f45daebc16aeb31.png "cyberstrikeai-attacks26")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192232/cyberstrikeai-attacks26.png)

During the main phase, the agent used PowerShell’s built-in functionality to detect accessible hosts without relying on additional utilities (such as nmap or fscan):

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7f39c1670c6574a7.png "cyberstrikeai-attacks27")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192248/cyberstrikeai-attacks27.png)

Additionally, relevant LDAP queries to Active Directory objects helped build a network map:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0c8a314722ac6f23.png "cyberstrikeai-attacks28")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192316/cyberstrikeai-attacks28.png)

Furthermore, the presence of the installed agent on remote hosts was verified using WMI:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/32317a0de2239c88.png "cyberstrikeai-attacks29")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192344/cyberstrikeai-attacks29.png)

#### Domain Discovery

The next step was to gather information about the victims’ domains. To this end, before installing the agent, the attackers used standard OS utilities:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/eeb36172639b67a8.png "cyberstrikeai-attacks30")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192411/cyberstrikeai-attacks30.png)

However, later on, using the CyberStrikeAI implant, reconnaissance was carried out via generated PowerShell scripts:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/01626d628130c112.png "cyberstrikeai-attacks31")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192430/cyberstrikeai-attacks31.png)

In addition to basic domain information, the agent performed LDAP queries to gather information for Kerberoasting and AS-REP Roasting attacks:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/606799d7fbd95ae6.png "cyberstrikeai32_en")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/31183512/cyberstrikeai32_en-scaled.png)

Finally, the agent was used to check the domain for the presence of [LAPS](https://learn.microsoft.com/ru-ru/windows-server/identity/laps/laps-overview) and Microsoft Azure:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/22f9a994db372b86.png "cyberstrikeai-attacks33")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192511/cyberstrikeai-attacks33.png)

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f4d5e41bae78c428.png "cyberstrikeai-attacks34")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192531/cyberstrikeai-attacks34.png)

To detect signs of Microsoft Azure usage within the infrastructure, the attackers also searched for the.azcopy directory – created by the AzCopy (Microsoft Azure Storage Copy) utility – in users’ home directories:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/05bcd88c26cbb8c9.png "cyberstrikeai-attacks35")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192550/cyberstrikeai-attacks35.png)

### Credential Access

After successfully conducting reconnaissance and mapping the network, the attackers moved on to the next stage – dumping credentials. For this purpose, the agent used a classic set of LOLBINs and well-known third-party tools.

The agent dumped registry hives containing credentials using the reg.exe utility:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/67ba33be15bbe50d.png "cyberstrikeai-attacks36")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192615/cyberstrikeai-attacks36.png)

The agent dumped the lsass.exe process using the MiniDump function of the comsvcs.dll library. In doing so, the target process’s PID was used instead of its name to make static detection based on the command line more difficult:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0b259102b22610d9.png "cyberstrikeai-attacks37")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192653/cyberstrikeai-attacks37.png)

After successfully compromising privileged domain accounts (specifically, the built-in domain administrator), the attackers also carried out DCSync and Golden Ticket attacks via the agent using a renamed version of the mimikatz utility:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/687e601764ecd93f.png "cyberstrikeai-attacks38")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192723/cyberstrikeai-attacks38.png)

### Lateral Movement

To spread across the network using compromised accounts, the attackers employed utilities from the Impacket toolkit, specifically WMIExec, as indicated by the utility’s characteristic command line:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7317ab0fadb3090f.png "cyberstrikeai-attacks39")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192745/cyberstrikeai-attacks39.png)

Once installed, the agent prefers to use standard OS mechanisms, such as shared network folders.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9f6f4796e08bcbfa.png "cyberstrikeai-attacks40")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192808/cyberstrikeai-attacks40.png)

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0da2f584945479bb.png "cyberstrikeai41_en")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/31183531/cyberstrikeai41_en-scaled.png)

Another method the agent uses to remotely execute commands is the WMI protocol. In particular, the agent used it to distribute the aforementioned p1.ps1 reverse shell script. This involved using compromised user accounts with local administrator privileges on the target hosts:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/80a2d849d01b4ac4.png "cyberstrikeai-attacks42")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192853/cyberstrikeai-attacks42.png)

A second method of lateral movement via WMI uses the `Invoke-CimMethod` cmdlet:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/061839758b6fa07e.png "cyberstrikeai-attacks43")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192924/cyberstrikeai-attacks43.png)

### Command & Control

To deliver the aforementioned tools (malicious scripts, mimikatz, and the agent itself) to the initial nodes in the infection chain, the attackers used standard OS utilities:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/93485f5d992719eb.png "cyberstrikeai-attacks44")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30192958/cyberstrikeai-attacks44.png)

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/612ae6df4ae6fbfc.png "cyberstrikeai-attacks45")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193012/cyberstrikeai-attacks45.png)

After the agent is installed, it checks the availability of the C2 server’s ports. The implementation mechanisms here are virtually unlimited and depend on the “creativity” of the respective LLM agents connected to the server:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/be33e7ec0ff3c4ec.png "cyberstrikeai-attacks46")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193040/cyberstrikeai-attacks46.png)

To download additional utilities, the CyberStrikeAI implant also used built-in utilities (LOLBINs). The tools could be hosted on the attackers’ own servers or downloaded directly from GitHub:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9024135ad0d22f7c.png "cyberstrikeai-attacks47")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193057/cyberstrikeai-attacks47.png)

### Collection & Exfiltration

The data collection phase deserves special attention. It demonstrates yet another capability of LLM orchestration – the automatic generation of SQL and LDAP queries tailored to a specific task.

In one incident during the campaign, the attackers deployed the CyberStrikeAI implant on an educational organization’s SQL server and collected information from the database via PowerShell. Here is an example of a command executed by the agent:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7de8e458fa6d5a1a.png "cyberstrikeai-attacks48")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193212/cyberstrikeai-attacks48.png)

Normalized view of the executed script with comments:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/01596a109c8d6cf4.png "cyverstrikeai49_en")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/31183437/cyverstrikeai49_en-scaled.png)

Before accessing the data, the agent checked the privileges of the account under which it connected to the database:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e27d4892d05e461d.png "cyberstrikeai-attacks50")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193255/cyberstrikeai-attacks50.png)

In decoded form, the check looks as follows:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b68d104262332843.png "cyberstrikeai-attacks51")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193311/cyberstrikeai-attacks51.png)

On network resources, file collection was preceded by a recursive directory scan to identify files of interest.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/22a6894e752caad1.png "cyberstrikeai-attacks52")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193327/cyberstrikeai-attacks52.png)

To interact with the file system, the implant provides a built-in interface that supports direct uploading and downloading of files. Files are transferred directly via the main encrypted communication channel with the C2 server (HTTP or TCP), and the data itself is encoded in Base64 and packaged into the agent’s standard JSON responses.

Another built-in capability of the implant is taking screenshots of the infected machine. As with other actions, the implant does not initiate this on its own: the command to capture the screen is issued by the LLM orchestrator, and the agent merely executes it and returns the result via the same control channel.

On Windows, the command for taking screenshots looks like this:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/971f415f1fbe3a52.png "cyberstrikeai-attacks53")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193352/cyberstrikeai-attacks53.png)

The Linux version looks like this:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6e668821a79e88a5.png "cyberstrikeai-attacks54")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193430/cyberstrikeai-attacks54.png)

In the incidents we detected, data collection was the final stage of the attack: the chain ended there, and we observed no further activity.

## Attribution

The key artifact for attribution in this campaign is the implant’s build metadata. The attackers built the malicious payload inside a Git clone of the project, so the Go compiler embedded version control system information into the binary files – the hash and commit time, as well as the `vcs.modified=true` flag (analogous to the `+dirty` suffix) – indicating uncommitted local changes in the working copy. The combination of these fields forms a unique fingerprint for a specific build.

Based on this fingerprint, the samples are divided into two independent groups, in each of which the Windows implant and the Linux implant have completely identical build metadata. A match indicates that, within each group, both payloads were built from the same project working copy.

[![Identical build metadata for the Windows and Linux implant samples, indicating a shared build environment](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1d28215472163ee3.png "cyberstrikeai-attacks55")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193505/cyberstrikeai-attacks55.png)

Identical build metadata for the Windows and Linux implant samples, indicating a shared build environment

However, these groups do not overlap with one another. They do not share a common C2 infrastructure, and different versions of CyberStrikeAI are deployed on the command-and-control servers. In other words, the build metadata reliably links the samples within each group but does not provide grounds for linking the two groups together.

[![Differences in CyberStrikeAI versions on the command-and-control servers](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d3b214ded121abea.png "cyberstrikeai-attacks56")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193529/cyberstrikeai-attacks56.png)

Differences in CyberStrikeAI versions on the command-and-control servers

The available data does not allow us to link the activity to any known group of attackers, nor to state with certainty that the same operator is behind both campaigns. Two factors prevent this. First, the tool’s openness: CyberStrikeAI is publicly available, so different operators could have independently deployed it and assembled malicious payloads under similar conditions. Second, command generation by the model: the “signature” characteristic of a specific operator is largely shaped not by a human but by an LLM. On the one hand, this increases the diversity of commands: the same command, when generated multiple times, can look different. On the other hand, it strips them of their individual characteristics, which reduces the value of behavioral metrics for attribution.

However, the Chinese-language comments found in the attackers’ scripts and the use of Chinese services still suggest a connection between the activity and a Chinese-speaking operator. In addition, analysts noted the timing of the control servers’ restarts: since the self-signed TLS certificate is regenerated each time the process starts, its `not_before` field records the restart time, and most of these restarts occurred during business hours in the UTC+8 time zone.

The origin of the tool itself also indirectly points in the same direction: CyberStrikeAI was developed within the Chinese cybersecurity community and is well known there.

## In summary

CyberStrikeAI is a telling – though not unique – example of a shift occurring within the class of C2 frameworks: the LLM orchestrator is no longer merely an add-on to reconnaissance but has become a control layer over post-exploitation. If HexStrike AI and similar tools cover the “find and break” phase, and Sliver/Mythic/Havoc cover the “establish a foothold and control” phase, CyberStrikeAI completes the kill chain: a single server-side process written in Go executes utilities via MCP, handles webshell connections, and assigns tasks to the implant, while the model analyzes the results and decides what to do next.

The key takeaway is that the introduction of AI into the attack chain does not yet present fundamentally new challenges for detection. All the “intelligent” work remains on the attacker’s side, while the compromised host is subjected to familiar actions: from reconnaissance via Kerberoasting and AS-REP Roasting to LSASS dumps, DCSync, and the Golden Ticket attacks. This is a typical, well-documented set of domain compromise techniques. The novelty of the attack lies not in the methods themselves, but in the speed and ease with which they were executed: AI orchestration has lowered the skill requirements for the operator, but has not taken the attack beyond what defenders already know and are capable of detecting. The timing is also telling: individual key phases of the activity (such as establishing a foothold, lateral movement, and obtaining credentials) took only a few hours, and the entire attack – from agent deployment to the compromise of domain administrators – was completed within 3–4 days.

However, the CyberStrikeAI architecture does not limit users to the scenario described. The same mechanisms allow for the on-demand assembly of more complex chains – including DPAPI secret extraction and attacks on SCCM and Azure IMDS – all of which are within reach of the same group of actors, with a relatively low skill barrier. As the models evolve, the gap between the complexity of orchestration and the level of techniques used will narrow, and the operator’s role will gradually shift from setting tasks to monitoring the model’s actions.

## Detection by Kaspersky solutions

It may seem that attacks using AI agents require the creation of fundamentally new detection rules. Indeed, to detect the activity of an LLM agent installed on a host within the infrastructure, it is necessary to create detection logic based on the specific characteristics of the agents. Detection rules for this activity can be found using [Hunt Hub](https://tip.kaspersky.com/landscape/hunts?icid=gl_sl_tip-hunts-lnk_sm-team_99f90a145ef4d16b) with [the following filter](https://tip.kaspersky.com/landscape/hunts?search=ai_agent&icid=gl_sl_tip-hunts-lnk_sm-team_22dc808786c18597).

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4e4a80b7c2a3ed7a.png "cyberstrikeai57_en")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/31183223/cyberstrikeai57_en.png)

However, in the case of the attack described, a different logic applies. The main difference lies in the architecture of the attack itself: the LLM agent was not located within the corporate network perimeter. It operated remotely via a C2 agent, orchestrating actions, and left no traces of its presence in the infrastructure (such as specific API requests to local LLMs or anomalous patterns of resource consumption by hosts).

The key difference between this activity and an attack by an experienced human operator lies largely in speed. Tactically, technically, and methodologically, AI, for the most part, uses exactly the same tools, utilities, and techniques as a human penetration tester. It does not write unique exploits from scratch, but rather combines known methods and dynamically adapts them to the situation, handling the tools’ errors on its own.

Since the actions performed by an AI agent on the network are indistinguishable from those of a human, classic, well-tuned correlation and behavioral analysis rules are sufficient to detect it. Here are a few examples of how [Kaspersky Next EDR Expert](https://www.kaspersky.com/enterprise-security/endpoint-detection-response-edr?icid=gl_sl_post-kedr-expert_sm-team_29dc1130f3f612f2) successfully detects the attack described:

-   To detect the execution of a malicious script via a remote scheduled task, you need to monitor the creation of the schtasks.exe process with the /s argument. EDR Expert detects this activity using the rules [create_task_on_remote_host_using_standard_tool](https://tip.kaspersky.com/landscape/hunts/edr/47098669-ef78-e12d-80aa-ee9f1b61af52?icid=gl_sl_tip-rule-lnk_sm-team_72643cdbe387b6a5), [scheduled_task_creation_as_system_via_schtasks](https://tip.kaspersky.com/landscape/hunts/edr/781260f4-7984-ecb4-70d9-1dc5f8a2c3d2?icid=gl_sl_tip-rule-lnk_sm-team_e8c315d520769b82), and [scheduled_task_with_powershell_execution](https://tip.kaspersky.com/landscape/hunts/edr/a7bbe675-fcb8-7f34-71d8-0beef0056753?icid=gl_sl_tip-rule-lnk_sm-team_2149e661563fbdb0).  
    [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/35b0e79ff74b14ff.png "cyberstrikeai-attacks58")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193728/cyberstrikeai-attacks58.png)
-   During the attack, the adversary will need access to the victim’s credentials; in the described case, one way to obtain them was through a well-known technique that uses legitimate tools to dump LSASS, specifically by calling the MiniDump function from comsvcs.dll. The EDR Expert solution detects this activity using the rules [dumping_memory_with_com_services_dll](https://tip.kaspersky.com/landscape/hunts/edr/fc0f7e33-e1c7-fcb8-cacc-46c8bd6caf9e?icid=gl_sl_tip-rule-lnk_sm-team_469f9fd53ee1ee37) and [suspicious_lsass_memory_access](https://tip.kaspersky.com/landscape/hunts/edr/b71864a5-f287-7484-1a79-6523c1f050fa?icid=gl_sl_tip-rule-lnk_sm-team_3283b0e7f7cd6709).  
    [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ae047e2a7f9c8a23.png "cyberstrikeai-attacks59")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193749/cyberstrikeai-attacks59.png)
-   A significant part of the attack chain is lateral movement, which helps the attacker navigate within the infrastructure and achieve their desired objectives. In the described case, the WinRM protocol is used to initiate connections directly from PowerShell. This is a standard technique that allows the attacker to execute commands on remote machines without using additional network tunnels. The EDR Expert solution detects this activity using the rules [using_powershell_for_remote_execution_via_wmi](https://tip.kaspersky.com/landscape/hunts/edr/1da86a97-33c5-4444-859c-9cb19f61afd0?icid=gl_sl_tip-rule-lnk_sm-team_60a35aa962709229) and [winrm_send_command.](https://tip.kaspersky.com/landscape/hunts/edr/614c146a-fea7-c564-fa68-29e4089f9b84?icid=gl_sl_tip-rule-lnk_sm-team_79f5780e013b6b29)  
    [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/def18c4074b121d1.png "cyberstrikeai-attacks60")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193819/cyberstrikeai-attacks60.png)

[Kaspersky Anti Targeted Attack (KATA)](https://www.kaspersky.com/enterprise-security/anti-targeted-attack-platform?icid=gl_sl_post-kata_sm-team_839dfa6f6cbc16e1) is used to detect malicious activity in network traffic. Communication between CyberStrikeAI agents and the command-and-control server occurs without accessing AI platforms such as ChatGPT or Claude. Instead, the agent’s C2 server is an infrastructure pre-configured by the attackers, just as in attacks that do not use AI agents. Analysis of decrypted network traffic using NDR-class solutions reveals characteristic communication patterns of CyberStrikeAI agent activity. When these patterns are detected, KATA generates an alert with the verdict `Backdoor.CyberStrikeAI.HTTP.C&C`.

[![Alert regarding the detection of CyberStrikeAI communication with a C2 server](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a8501b1a01d45e33.png "cyberstrikeai-attacks61")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193851/cyberstrikeai-attacks61.png)

Alert regarding the detection of CyberStrikeAI communication with a C2 server

To detect post-exploitation activity, you can use not only IDS technology but also NAD (Network Anomaly Detection). It analyzes all traffic for suspicious indicators that do not correspond to a node’s typical network activity.

For example, actions performed by CyberStrikeAI during the Domain Discovery phase are detected by an NDR:NAD rule named “Scanning domain records via LDAP queries.”

[![NDR:NAD alert: reconnaissance via LDAP queries detected](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/297bcbf089e90fc2.png "cyberstrikeai-attacks62")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30193922/cyberstrikeai-attacks62.png)

NDR:NAD alert: reconnaissance via LDAP queries detected

You can learn more about NDR:NAD technology in our article on [Securelist](https://securelist.com/tr/network-anomaly-detection-in-kata/120892/).

You can also visualize the connections between C2 addresses and files used by attackers in the Research Graph section of the Kaspersky [Threat Intelligence Portal](https://www.kaspersky.com/enterprise-security/threat-intelligence-portal?icid=gl_sl_post-ti_sm-team_9e01cef3d70c6a19). This includes tracking the emergence of new CyberStrikeAI implants that communicate with malicious addresses.

[![Visualization via the Research Graph on the Kaspersky Threat Intelligence Portal](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/22690c4b98f63f75.png "cyberstrikeai-attacks63")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30194027/cyberstrikeai-attacks63.png)

Visualization via the Research Graph on the Kaspersky Threat Intelligence Portal

In addition, the Threat Lookup service available on the portal allows you to determine whether malicious files belong to CyberStrikeAI using attribution mechanisms based on the executable file’s code.

[![Demonstration of attributing a malicious implant to the CyberStrikeAI framework](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/141087e53f172edf.png "cyberstrikeai-attacks64")](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/10/30194058/cyberstrikeai-attacks64.png)

Demonstration of attributing a malicious implant to the CyberStrikeAI framework

[Kaspersky SIEM](https://www.kaspersky.com/enterprise-security/unified-monitoring-and-analysis-platform?icid=gl_sl_siem-inpost-link_sm-team_c6da27b0f60ba483) detects all stages of an attack by the CyberStrikeAI agent. The product repository contains over 100 rules for detecting the techniques discussed in this article; we will list the most critical ones below.

Execution of various commands from the sqlservr.exe process:

-   **R300_04_Windows shell started by a web application**

Downloading and executing a payload via PowerShell:

-   **R110_03_PowerShell code downloaded and executed**

Creating Windows scheduled tasks:

-   **R099_04_Suspicious arguments when running schtasks.exe**
-   **R300_03_Windows shell started by the scheduler**

Persisting via crontab or bashrc:

-   **R099_06_Suspicious cron job activity**
-   **R405_02_UNIX shell configuration modification**

Rules located at the KUMA Packages/SOC package/Configuration discovery path detect the collection of information about hosts, network settings, and domains using various reconnaissance tools. Rules that aggregate detections by reconnaissance tools:

-   **R224_14_Windows reconnaissance activity**
-   **R224_09_System information discovery by running multiple utilities within a short period**
-   **R224_04_System information discovery via standard Linux tools**

Data collection for Kerberoasting and AS-REP Roasting:

-   **R034_01_Multiple TGS ticket requests (Kerberoasting)**
-   **R452_18_AS-REP Roasting**

Dumping registry hives containing credentials using the reg.exe utility:

-   **R230_02_Copying data containing credentials from the Windows registry**

Dumping the lsass.exe process using the MiniDump function of the comsvcs.dll library:

-   **R233_04_Process memory dump via comsvcs.dll**
-   **R262_Suspicious access to the LSASS process**

DCSync and Golden Ticket attacks using the renamed mimikatz utility:

-   **R073_DC Sync attack**
-   **R450_41_Golden Ticket Attack**
-   **R100_03_Traces of Mimikatz use via cmd**

Lateral movement using WMIExec:

-   **R460_08_Lateral movement using WMIexec Impacket**
-   **R460_09_Lateral movement using WMIExec and Impacket**

For the rules to work, you must configure the SIEM system to receive the relevant events:

-   Process launches (Windows security log – 4688, auditd – execve) and PowerShell commands (4104)
-   User logins to the system (Windows security log – 4624, 4768, 4769)
-   Various object manipulations (Windows security log – 4662, 4663, 4656; auditd – openat)
-   Interaction with shared resources (Windows security log – 5145)

## Indicators of compromise

**File-based indicators:**

|     |     |
| --- | --- |
| **CyberStrikeAI Windows Beacon** |
| [D726A8B4886C636F76CA6D30EF6A6FF4](https://opentip.kaspersky.com/d726a8b4886c636f76ca6d30ef6a6ff4/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_a3b08bed829ee582) | c:\\windows\\temp\\svchosts.exe |
| [2770562d104391b92b42671c270079bb](https://opentip.kaspersky.com/2770562d104391b92b42671c270079bb/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_df07b671d452d62d) | c:\\windows\\temp\\svcmon32.exe  <br>c:\\programdata\\svcmon32.exe |
| **CyberStrikeAI Linux Beacon** |
| [09e1da2afa1216ecc55648ec8e122d2a](https://opentip.kaspersky.com/09e1da2afa1216ecc55648ec8e122d2a/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_6b16f8b4cd7dc1c9) |     |
| [805B9E4AE74C903787416800999B8418](https://opentip.kaspersky.com/805b9e4ae74c903787416800999b8418/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_0c73d2e1754018bc) |     |
| **Tools & Scripts** |
| [29EFD64DD3C7FE1E2B022B7AD73A1BA5](https://opentip.kaspersky.com/29efd64dd3c7fe1e2b022b7ad73a1ba5/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_93f6119dd8853748) | C:\\Windows\\Temp\\wdiag2.exe (mimikatz) |
| [74F57B3E897A4960DCDD5B7E8A54F9DF](https://opentip.kaspersky.com/74f57b3e897a4960dcdd5b7e8a54f9df/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_22bea09c3b725173) | c:\\rwx\\RogueWinRM.exe |
| [0BBD08AF95F877F1D568B03DE2EB76B4](https://opentip.kaspersky.com/0bbd08af95f877f1d568b03de2eb76b4/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_7675482883a56d28) | c:\\ProgramData\\p1.ps1 (reverse shell PS script) |

**Network indicators:**

|     |     |
| --- | --- |
| [185.186.245\[.\]144](https://opentip.kaspersky.com/185.186.245.144/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_a332c85e57af525b) | C2 for **Windows Beacon** |
| [fastcdn\[.\]bar](https://opentip.kaspersky.com/fastcdn.bar/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_d2dd38db73c40d4d) | C2 for **Windows Beacon** |
| [media.fastcdn\[.\]bar](https://opentip.kaspersky.com/media.fastcdn.bar/?utm_source=SL&utm_medium=SL&utm_campaign=SL&icid=gl_sl_opentip-lnk_sm-team_02f7a96c92f593c4) | C2 for **Linux Beacon** |
| [104.234.26\[.\]163](https://opentip.kaspersky.com/104.234.26.163/?icid=gl_sl_opentip-lnk_sm-team_c841a35b38f0519b?utm_source=SL&utm_medium=SL&utm_campaign=SL) | C2 for Payload Delivery + **Linux Beacon** |
