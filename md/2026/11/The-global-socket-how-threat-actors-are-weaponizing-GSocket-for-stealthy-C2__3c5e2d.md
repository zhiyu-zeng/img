---
title: "The global socket: how threat actors are weaponizing GSocket for stealthy C2"
source: https://www.microsoft.com/en-us/security/blog/2026/11/11/global-socket-how-threat-actors-weaponizing-gsocket-stealthy-c2/
source_host: www.microsoft.com
clip_date: 2026-11-15T09:57:14+08:00
trace_id: f921b3b4-fa2d-472c-84ff-c4f9686441f4
content_hash: efd8f5134f563df10da67669c82cba7f5c3ead4ea76632dbaebcf0a26e5700ea
status: synced
tags:
  - Linux安全
  - 恶意样本
series: null
feed_source: Microsoft Security Blog
ai_summary: 多个威胁组织正利用开源远程访问工具 GSocket 在被攻陷的 Linux 服务器上实现隐蔽 C2 持久化，仅修补应用漏洞无法清除该后门。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 41975244-d011-81bb-9342-c3a619dec628
ioc:
  cves:
    - CVE-2026-43284
  cwes: []
  hashes:
    - 12450bafc7a4398040e1ad3a16dbf4dbc79b6a8f83ef306c4f0f73f59886f06c
    - 55d141bb2f62c527c3fea3413b8429fed7d52633d0b123b5e611bfa42165229f
    - d94f75a70b5cabaf786ac57177ed841732e62bdcc9a29e06e5b41d9be567bcfa
    - f95c4d029e6784e3849b4d1e2e2ae1a661187236ef7c5d487c71158a290a03b5
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 多个威胁组织正利用开源远程访问工具 GSocket 在被攻陷的 Linux 服务器上实现隐蔽 C2 持久化，仅修补应用漏洞无法清除该后门。
> 
> - **无 C2 基础设施：** GSocket 通过公共 Global Socket Relay Network（GSRN）中转流量，主机与操作者均出站连接、端到端加密配对，无需固定 IP/域名、入站监听或公网 IP，封锁 IP 或域名无效；端点以共享密钥识别，密钥可通过控制台、临时文件或 Telegram/Discord/webhook 回传。
> - **部署链路：** 利用面向公网的 Web 应用（PHP/cPanel 占 63.9%、Apache 24.3%）后用 curl 下载执行安装脚本，载荷隐藏于 /dev/shm/.gs-0 等内存路径，以 systemd-remount-d、[kaluad] 等内核线程式名称伪装进程。
> - **持久化与提权：** 通过 cron、systemd 服务（defunct.service）、shell 配置文件、watchdog 及多副本实现多层持久化；部分事件尝试利用 Linux 内核漏洞 CVE-2026-43284（Dirty Frag）从 web 服务账户提权至 root。
> - **趋势数据：** 2026 年 3 月至 8 月 GSocket 相关检测增长 356.2%；教育科研机构占比最高（30.7%），其次为科技与电信（22.9%），主因是暴露面而非定向攻击。
> - **处置要点：** 修补应用之外必须清除 GSocket 客户端、持久化项及暂存文件并确认出站中继连接停止；建议默认拒绝出站规则、将临时目录挂载为不可执行、审计 cron/systemd/shell 启动文件，并在 Linux 上启用 Microsoft Defender for Endpoint。

Microsoft observed multiple incidents in which threat actors deployed GSocket, an open source remote access tool, on compromised Linux servers. Threat actors used Gsocket to maintain access even after the vulnerabilities used for initial compromise were remediated. This turned a single web application compromise into persistent access that outlasted the remediation of the original vulnerabilities. Defenders investigating affected hosts should look for evidence of GSocket deployment, persistence, privilege escalation, and outbound connections, rather than treating application patching alone as complete remediation.

Microsoft Defender for Endpoint telemetry shows this activity growing over recent months and concentrated on web applications and hosting environments. GSocket relays traffic through a shared public network, so there is no threat actor-owned IP address or domain to block.

## When one RCE stops being just one RCE

Exploiting a web application vulnerability gives a threat actor command execution in the context of the web server process. That access lasts only while the vulnerability remains unpatched and the service keeps running. Patching the application or restarting the service can remove it.

To keep access, threat actors typically add a persistence mechanism, and each common option has drawbacks. SSH keys added to authorized_keys are easy for administrators to find during an audit. Reverse shells depend on threat actor-controlled servers that defenders can block or sinkhole. Custom implants require ongoing development and maintenance. The same trade-offs apply when initial access comes through remote access services or cloud shell sessions.

GSocket addresses these drawbacks, which helps explain why multiple unrelated threat actors have adopted it.

-   **Shared relay infrastructure.** Traffic passes through the Global Socket Relay Network, a public relay service. The threat actor does not register or host any infrastructure, so there is no threat actor-owned IP address or domain to block. Organizations can still restrict access to the relay itself.
-   **Outbound-only connections.** The compromised host and the operator both connect outbound to the relay, which bridges the two sessions. The host needs no inbound listener or public IP address, and network address translation does not prevent the connection. Inbound firewall rules do not see this traffic, although egress filtering and outbound monitoring can.
-   **Built-in evasion and persistence.** The deployment script can rename the process, stage files in memory-backed directories, and install persistence that survives a reboot, without additional development by the threat actor.

The same relay model that supports legitimate remote administration also gives threat actors a way to maintain access without operating dedicated C2 infrastructure. Once GSocket runs on a compromised server, the server and the operator each connect outbound to the Global Socket Relay Network, which pairs the two sessions over an end-to-end encrypted channel.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b5e593ae695a5a03.webp)

Figure 1: After code execution on an internet-facing application, GSocket is deployed and both ends connect outward to the relay.

Because GSocket runs independently of the exploited application, patching the vulnerability does not remove the relay client or its persistence.

Microsoft Defender for Endpoint telemetry shows that this activity is not limited to a single compromise. From March through August 2026, devices with GSocket-related detections increased 356.2%, although the increase was not consistent month to month.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/00a8c69f75b8960a.webp)

Figure 2: Growth in GSocket-related detections from March to August, measured against the March baseline.

Web applications and hosting accounted for 87.1% of attributable Microsoft Defender for Endpoint incidents in the analysed telemetry. Within that group, PHP web applications and cPanel hosting represented 63.9% of incidents and Apache represented 24.3% (Figure 3).

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b12a019b8b6dc872.webp)

Figure 3: Distribution of GSocket-related incidents by application category. PHP web applications and Apache account for most incidents within the web applications and hosting group.

Education and research accounted for the largest share of affected organizations (30.7%), followed by technology and telecommunications (22.9%).

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6280be1fed9221b4.webp)

Figure 4: Distribution of affected organizations by sector.

These figures reflect the share of affected organizations and do not indicate that threat actors selected these sectors deliberately. Exposure is the more likely factor: academic institutions often run large, decentralized web estates maintained outside central IT, which are harder to inventory and patch.

## Observed attack chains

The RCE-based intrusions in this analysis followed a similar sequence after initial access. Threat actors compromised an internet-facing application, profiled the host, transferred and concealed the relay tooling, and used the resulting channel for command and control. Some intrusions also included persistence and privilege escalation. Figure 5 combines these behaviours into a generalized attack chain. Not every stage occurred in every intrusion.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ca168b233bb2c334.webp)

Figure 5: Generalized GSocket attack chain observed across RCE-based intrusions, mapped to MITRE ATT&CK.

## How threat actors deploy and operate GSocket

**Initial access and deployment:** Threat actors exploited internet-facing web applications and used curl to download and execute a remote script. The script profiled the host, selected a GSocket client matching the system architecture, staged it in writable or memory-backed paths such as /dev/shm, and established encrypted outbound command and control through the Global Socket Relay Network.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/12cb761d044ee987.webp)

Figure 6: Encoded RCE command executed through a vulnerable PHP application.

**Defense evasion and persistence:** Threat actors disguised GSocket with kernel-thread-like process names, persisted through cron, systemd, shell profiles, watchdogs, and redundant copies, then removed staging files and other deployment indicators.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ece5a1717adafa60.webp)

Figure 7: Kernel thread names used to disguise the GSocket process.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5fe19756d6d4985d.webp)

Figure 8: Persistence entries created during GSocket deployment.

**Privilege escalation:** After gaining execution as the web-service account, in few observed incidents, threat actors attempted to exploit CVE-2026-43284, one of the recent Linux kernel vulnerabilities also known as Dirty Frag, to elevate privileges to root.

## How GSocket reconnects without a fixed C2 address

GSocket identifies endpoints by a shared secret instead of an IP address or hostname. During installation, the deployment script typically generates a random secret and writes it to standard output. The threat actor can choose to read the secret from the console, redirect it to a temporary file and retrieve the file before is deleted, or have it delivered through a supported notification channel, such as Telegram (configured with GS_TG_TOKEN and GS_TG_CHATID), Discord, or a webhook. With this secret, the operator can reconnect later from any compatible GSocket client, without knowing the victim’s IP address, hostname, or network location.

A traditional reverse shell connects to a threat actor-controlled IP address written into the payload. GSocket instead derives its connection identifier and authentication material from the shared secret. The compromised host and the operator each connect outbound to the Global Socket Relay Network (GSRN), which matches them and brokers an end-to-end encrypted session. Neither endpoint needs a public IP address, an inbound listener, or a permissive inbound firewall rule.

As a result, blocking an IP address or domain is unlikely to cut off access. The connection relies on a shared relay service, outbound traffic that is commonly permitted, and a secret that does not need to be hardcoded in the payload. Anyone with the shared secret can reconnect through the relay without knowing the compromised host’s IP address or hostname.

## Mitigation and protection guidance

For an affected Linux server, remediation should address both the initial compromise and the GSocket deployment.

1.  **Patch and harden internet-facing applications.** Keep web applications, CMS platforms, plugins, and application servers current. Remove unused components and restrict file-upload and administrative paths.
    -   **Remediate the host as well as the vulnerability.** Do not treat application patching as complete remediation. Investigate and remove the GSocket client, associated persistence, and staged files, then verify that outbound connections to the relay infrastructure have stopped
2.  **Patch and harden internet-facing applications.** Keep web applications, CMS platforms, plugins, and application servers current. Remove unused components and restrict file-upload and administrative paths.
3.  **Constrain outbound traffic.** Apply deny-by-default egress rules, allow only required destinations, and monitor connections to relay infrastructure.
4.  **Harden the host runtime.** Mount temporary and memory-backed directories as non-executable where feasible, and alert on execution from hidden or world-writable paths.
5.  **Audit persistence surfaces.** Review cron entries, systemd units with plausible service names, and shell startup files. Persistence is often layered across several mechanisms, so stopping the running process alone does not remove access.
6.  **Prioritize local privilege-escalation patching on internet-facing servers.** In the analyzed activity, threat actors attempted to exploit CVE-2026-43284 to escalate from the web-service account to root. Separately, Microsoft FORGE Lab recently [documented 59 Linux kernel bug reports](https://www.microsoft.com/en-us/security/blog/2026/11/10/lessons-from-59-linux-kernel-bug-reports/), including eight vulnerabilities for which researchers demonstrated local root privilege-escalation exploits in controlled environments.
7.  **Enable Microsoft Defender for Endpoint on Linux.** Keep real-time and cloud-delivered protection enabled, with behavior monitoring for anomalous child processes of web services and masqueraded process identities.

### Microsoft Defender detections

Microsoft Defender for Endpoint provides visibility into activity associated with GSocket-related Linux intrusions, including suspicious shell execution, payload delivery, persistence, defense evasion, and remote communication. The alerts below were observed in the analyzed telemetry. An individual alert does not establish the initial access method or confirm that every stage of an intrusion succeeded.

|     |     |     |
| --- | --- | --- |
| **Tactic** | **Observed activity** | **Example alerts observed in analyzed telemetry** |
| Initial access, Execution | Shells and commands launched from web servers and application runtimes | – Possible Web Server compromise activity  <br>– Suspicious shell execution from PHP application  <br>– Suspicious shell execution from web server application  <br>– Suspicious shell execution from a scripting application runtime  <br>– Suspicious remote command execution via Java Web application  <br>– Suspicious remote command execution through Node web application |
| Execution | GSocket and gs-netcat tooling launched on the host | – ‘GsNetcat’ hacktool was prevented  <br>– ‘GsNetcat’ hacktool was blocked and was active  <br>– An active ‘GsNetcat’ hacktool was blocked  <br>– An active ‘GsNetcat’ hacktool process was detected while executing and terminated |
| Execution, Payload delivery | Shell commands and scripts used to retrieve, prepare, and launch payloads | – Suspicious shell command execution  <br>– Suspicious piped command launched  <br>– Suspicious script launched  <br>– Executable permission added to file or directory  <br>– Suspicious file dropped and launched  <br>– Suspicious file or content ingress |
| Persistence | Cron jobs and Linux services created for recurring execution and continued access | – Suspicious cron job creation  <br>– Suspicious Linux service created |
| Defense evasion | Hidden file execution, obfuscation, timestomping and removal of binaries or history traces. | – Hidden file executed  <br>– Suspicious file or information obfuscation detected  <br>– Suspicious deletion of launched process binary  <br>– Attempt to clear command history  <br>– Suspicious timestamp modification |
| Discovery | Reconnaissance and collection of local system information | – Reconnaissance activity  <br>– Suspicious process collected data from local system |
| Command and control | Reverse-shell behavior and communication with GSocket domains | – Possible reverse shell  <br>– Suspicious communication with a remote target |

### Microsoft Security Copilot

Security Copilot customers can use the standalone experience to [create their own prompts](https://learn.microsoft.com/copilot/security/prompting-security-copilot#create-your-own-prompts) or run [prebuilt promptbooks](https://learn.microsoft.com/copilot/security/using-promptbooks) to automate incident response or investigation tasks related to this threat:

-   Incident investigation: correlate web-service process ancestry, relay client deployment, persistence changes, and outbound activity into a single timeline for the affected host.
-   Threat actor profile: summarize observed GSocket tradecraft and related tooling seen in the environment.
-   Device summary: assess the affected Linux host, its exposed application, and follow-on activity after initial execution.

### Advanced hunting queries

Microsoft Defender XDR customers can use the following queries to surface GSocket-related activity. The queries use public Advanced Hunting tables populated by Microsoft Defender for Endpoint and cover deployment patterns observed in the analyzed intrusions.

Matches should be investigated in context with process ancestry, execution context, persistence changes, and related network activity.

**GSocket process activity**

Looks for GSocket tooling by name or command line.

```sql
DeviceProcessEvents
| where Timestamp > ago(7d)
| where FileName has_any ("gs-netcat", "gsocket")
    or ProcessCommandLine has_any ("gsocket.io", "gs-netcat", "gsnetcat")
| project Timestamp, DeviceName, AccountName, FileName, FolderPath,
    ProcessCommandLine, InitiatingProcessFileName
| order by Timestamp desc
```

**Installer download activity**

Looks for the download-and-execute pattern used to fetch GSocket.

```sql
DeviceProcessEvents
| where Timestamp > ago(7d)
| where ProcessCommandLine has "gsocket.io"
    or ProcessCommandLine has "gsgg.b-cdn.net"
| project Timestamp, DeviceName, AccountName, FileName,
    ProcessCommandLine, InitiatingProcessFileName
| order by Timestamp desc
```

**Connections to observed distribution hosts**

These are tool distribution endpoints, not threat actor-owned command and control.

```sql
DeviceNetworkEvents
| where Timestamp > ago(7d)
| where RemoteUrl has_any ("gsocket.io", "gsgg.b-cdn.net")
| project Timestamp, DeviceName, ActionType, RemoteUrl, RemoteIP, RemotePort,
    InitiatingProcessFileName, InitiatingProcessAccountName
| order by Timestamp desc
```

**Known file hashes**

Matches the SHA-256 hashes published in the indicators of compromise section.

```sql
let badSHA256 = dynamic([
    "d94f75a70b5cabaf786ac57177ed841732e62bdcc9a29e06e5b41d9be567bcfa",
    "f95c4d029e6784e3849b4d1e2e2ae1a661187236ef7c5d487c71158a290a03b5",
    "55d141bb2f62c527c3fea3413b8429fed7d52633d0b123b5e611bfa42165229f",
    "12450bafc7a4398040e1ad3a16dbf4dbc79b6a8f83ef306c4f0f73f59886f06c"
]);
DeviceFileEvents
| where Timestamp > ago(7d)
| where SHA256 in~ (badSHA256)
| project Timestamp, DeviceName, ActionType, FileName, FolderPath, SHA256,
    InitiatingProcessFileName, InitiatingProcessCommandLine
| order by Timestamp desc
```

**Staging and persistence artifacts**

Useful when hashes are missing or a different build is used.

```sql
DeviceFileEvents
| where Timestamp > ago(7d)
| where FolderPath startswith "/dev/shm/.gs-"
    or FileName in~ ("systemd-remount-d", ".gsn_ora", "defunct", "defunct.service")
| project Timestamp, DeviceName, ActionType, FileName, FolderPath, SHA256,
    InitiatingProcessFileName, InitiatingProcessCommandLine
| order by Timestamp desc
```

### MITRE ATT&CK techniques observed

The following techniques were observed across the analyzed intrusions. Not every technique occurred in every intrusion, and some outcomes, such as persistence across reboot and successful relay session establishment, were not confirmed in every case.

**Initial access**

-   [T1190 Exploit Public-Facing Application](https://attack.mitre.org/techniques/T1190/) | Internet-facing web applications were exploited to gain command execution in the web service context. Follow-on commands were launched as children of web server and application runtime processes, consistent with exploitation of an exposed application.

**Execution**

-   [T1059.004 Command and Scripting Interpreter: Unix Shell](https://attack.mitre.org/techniques/T1059/004/) | Commands used curl to retrieve the GSocket installation script and executed it with bash.  
    Additional bash invocations launched the renamed payload.

**Execution, Persistence**

-   [T1053.003 Scheduled Task/Job: Cron](https://attack.mitre.org/techniques/T1053/003/) | Cron entries were created in the same detection window as GSocket deployment script activity, consistent with persistence.

**Persistence**

-   [T1543.002 Create or Modify System Process: Systemd Service](https://attack.mitre.org/techniques/T1543/002/) | Activity launched a bash command invoking the renamed /usr/bin/defunct payload and referenced defunct.service and a multi-user.target.wants link.

**Defense evasion**

-   [T1036 Masquerading](https://attack.mitre.org/techniques/T1036/) | A GsNetcat binary executed as systemd-remount-d, a system service-like filename. In a separate execution context, bash used exec -a to present /usr/bin/defunct with the argument-zero name \[kaluad\].
-   [T1564.001 Hide Artifacts: Hidden Files and Directories](https://attack.mitre.org/techniques/T1564/001/) | gs-netcat payloads were staged under the dot-prefixed /dev/shm/.gs-0 directory. A GsNetcat-detected file was also observed at /tmp/.gsn_ora.
-   [T1222.002 File and Directory Permissions Modification: Linux and Mac File and Directory Permissions Modification](https://attack.mitre.org/techniques/T1222/002/) | chmod changed permissions on the renamed payload, including chmod 700 /usr/bin/defunct.
-   [T1070.006 Indicator Removal: Timestomp](https://attack.mitre.org/techniques/T1070/006/) | touch commands applied older timestamps to /usr/bin/defunct and defunct.service. Timestamp copy operations targeted the system service-like payload name.
-   [T1070.004 Indicator Removal: File Deletion](https://attack.mitre.org/techniques/T1070/004/) | rm removed the staged /dev/shm/.gs-0/gs-netcat file, and a separate rmdir command removed the staging directory.

**Command and control**

-   [T1105 Ingress Tool Transfer](https://attack.mitre.org/techniques/T1105/) | curl downloaded gs-netcat payloads from GSocket distribution endpoints into /dev/shm/.gs-0.
-   [T1090.002 Proxy: External Proxy](https://attack.mitre.org/techniques/T1090/002/) | GSocket clients were launched with options that establish outbound sessions to the Global Socket Relay Network, a shared public relay that brokers the connection between the compromised host and the operator. The relay is third-party infrastructure and is not owned by the threat actor.

### Indicators of compromise

The indicators below were observed in the analyzed telemetry. They represent specific observations from these intrusions rather than a complete inventory of GSocket tooling or infrastructure.

|     |     |     |
| --- | --- | --- |
| **Indicator** | **Type** | **Description** |
| gsocket\[.\]io | Domain | Script and installer retrieval |
| cdn\[.\]gsocket\[.\]io | Domain | Client binary distribution |
| gsgg\[.\]b-cdn\[.\]net | Domain | Client binary distribution |
| hxxps://gsocket\[.\]io/y | URL | Script retrieval in download-and-execute commands |
| hxxps://gsocket\[.\]io/install.sh | URL | Installer retrieval target; successful retrieval not established |
| hxxps://gsgg\[.\]b-cdn\[.\]net/bin/gs-netcat_mini-linux-x86_64 | URL | Download source associated with the x86-64 file below |
| hxxps://cdn\[.\]gsocket\[.\]io/bin/gs-netcat_mini-linux-aarch64 | URL | Download source associated with the AArch64 file below |
| /dev/shm/.gs-0/gs-netcat_mini-linux-x86_64 | Filepath | Identified as HackTool:Linux/GsNetcat.A!MTB; hidden staging directory |
| d94f75a70b5cabaf786ac57177ed841732e62bdcc9a29e06e5b41d9be567bcfa | SHA256 | SHA-256 for /dev/shm/.gs-0/gs-netcat_mini-linux-x86_64; Identified as HackTool:Linux/GsNetcat.A!MTB; hidden staging directory |
| /dev/shm/.gs-0/gs-netcat_mini-linux-aarch64 | Filepath | Identified as HackTool:Linux/GsNetcat.A!MTB; AArch64 payload |
| f95c4d029e6784e3849b4d1e2e2ae1a661187236ef7c5d487c71158a290a03b5 | SHA256 | SHA-256 for /dev/shm/.gs-0/gs-netcat_mini-linux-aarch64; Identified as HackTool:Linux/GsNetcat.A!MTB; AArch64 payload |
| /tmp/systemd-remount-d | Filepath | Identified as HackTool:Linux/GsNetcat!rfn at both paths; service-like filename |
| /usr/bin/systemd-remount-d | Filepath | Identified as HackTool:Linux/GsNetcat!rfn at both paths; service-like filename |
| 55d141bb2f62c527c3fea3413b8429fed7d52633d0b123b5e611bfa42165229f | SHA256 | SHA-256 for /tmp/systemd-remount-d, /usr/bin/systemd-remount-d; Identified as HackTool:Linux/GsNetcat!rfn at both paths; service-like filename |
| /tmp/.gsn_ora | Filepath | Hidden file identified as HackTool:Linux/GsNetcat.A!MTB |
| 12450bafc7a4398040e1ad3a16dbf4dbc79b6a8f83ef306c4f0f73f59886f06c | SHA256 | SHA-256 for /tmp/.gsn_ora; Hidden file identified as HackTool:Linux/GsNetcat.A!MTB |

## References

1.  **The Hacker’s Choice. “GSocket.” GitHub.** [**https://github.com/hackerschoice/gsocket**](https://github.com/hackerschoice/gsocket)
2.  **Microsoft Defender Security Blog: Cookie-controlled PHP webshells: A stealthy tradecraft in Linux hosting environments**  
    [https://www.microsoft.com/en-us/security/blog/2026/04/02/cookie-controlled-php-webshells-tradecraft-linux-hosting-environments/](https://www.microsoft.com/en-us/security/blog/2026/04/02/cookie-controlled-php-webshells-tradecraft-linux-hosting-environments/)
3.  **Elastic Security Labs: Betting on Bots**  
    [https://www.elastic.co/security-labs/threat-command/betting-on-bots](https://www.elastic.co/security-labs/threat-command/betting-on-bots)
4.  **SANS Internet Storm Center: GSocket Backdoor Delivered Through Bash Script**  
    [https://isc.sans.edu/diary/32816](https://isc.sans.edu/diary/32816)
5.  **Sansec: Found defunct.dat on Your Site? You’ve Got a Problem** [https://sansec.io/research/gsocket](https://sansec.io/research/gsocket)

## Learn More

For the latest security research from the Microsoft Threat Intelligence community, check out the [Microsoft Threat Intelligence Blog](https://aka.ms/threatintelblog).

To get notified about new publications and to join discussions on social media, follow us on [LinkedIn](https://www.linkedin.com/showcase/microsoft-threat-intelligence), [X (formerly Twitter)](https://x.com/MsftSecIntel), and [Bluesky](https://bsky.app/profile/threatintel.microsoft.com).

To hear stories and insights from the Microsoft Threat Intelligence community about the ever-evolving threat landscape, listen to the [Microsoft Threat Intelligence podcast](https://thecyberwire.com/podcasts/microsoft-threat-intelligence).

Review our documentation to learn more about our real-time protection capabilities and see how to enable them within your organization.  

-   Learn more about  [securing Copilot Studio agents with Microsoft Defender](https://learn.microsoft.com/en-us/defender-cloud-apps/ai-agent-protection)  
-   Evaluate your AI readiness with our latest [Zero Trust for AI workshop](https://microsoft.github.io/zerotrustassessment/).
-   [Microsoft 365 Copilot AI security documentation](https://learn.microsoft.com/en-us/copilot/microsoft-365/microsoft-365-copilot-ai-security)
-   [How Microsoft discovers and mitigates evolving attacks against AI guardrails](https://www.microsoft.com/en-us/security/blog/2024/04/11/how-microsoft-discovers-and-mitigates-evolving-attacks-against-ai-guardrails/)
-   [Prompt injection protection in Microsoft Defender for Office 365](https://learn.microsoft.com/en-us/defender-office-365/step-by-step-guides/prompt-injection-protection-defender-for-office-365) – official documentation of the prompt injection protection in Microsoft Defender for Office 365.
-   [How Microsoft discovers and mitigates evolving attacks against AI guardrails | Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog/2024/04/11/how-microsoft-discovers-and-mitigates-evolving-attacks-against-ai-guardrails/)
-   [Manipulating AI memory for profit: The rise of AI Recommendation Poisoning | Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog/2026/02/10/ai-recommendation-poisoning/) – a related example of an AI-era technique observed in email traffic
-   [Defending the inbox against prompt injection attacks | Microsoft Defender for Office 365 Blog](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/defending-the-inbox-against-prompt-injection-attacks/4534636) – feature announcement introducing prompt injection protection in Microsoft Defender for Office 365.
-   Learn how Microsoft is reimagining the SOC for the agentic era with [ISOC in Microsoft Defender](https://www.microsoft.com/security/blog/2026/09/23/reimagining-the-soc-for-the-agentic-era-in-microsoft-defender/)

The post [The global socket: how threat actors are weaponizing GSocket for stealthy C2](https://www.microsoft.com/en-us/security/blog/2026/11/11/global-socket-how-threat-actors-weaponizing-gsocket-stealthy-c2/) appeared first on [Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog).
