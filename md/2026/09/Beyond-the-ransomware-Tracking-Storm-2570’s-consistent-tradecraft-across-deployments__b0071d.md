---
title: "Beyond the ransomware: Tracking Storm-2570’s consistent tradecraft across deployments"
source: https://www.microsoft.com/en-us/security/blog/2026/09/24/beyond-ransomware-tracking-storm-2570-consistent-tradecraft-across-deployments/
source_host: www.microsoft.com
clip_date: 2026-09-25T01:03:33+08:00
trace_id: 0ea86664-dbe9-4d54-a149-238dcfdedeb3
content_hash: 503a8b832f65f89c06013084442c0650584bd353d0108f2cfe3054ec015852ef
status: synced
tags:
  - 勒索软件
  - 威胁情报
series: null
feed_source: Microsoft Security Blog
ai_summary: Storm-2570 是跨 Qilin、DragonForce、Anubis、BERT 多个 RaaS 生态的勒索软件附属组织，其入侵工具与手法在不同载荷下高度一致，防御方应按攻击链行为而非单一载荷来追踪和拦截。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3e575244-d011-814f-9a22-c3e0cd5ea609
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Storm-2570 是跨 Qilin、DragonForce、Anubis、BERT 多个 RaaS 生态的勒索软件附属组织，其入侵工具与手法在不同载荷下高度一致，防御方应按攻击链行为而非单一载荷来追踪和拦截。
> 
> - **组织画像：** 微软自 2025 年 4 月起追踪，攻击过美国、加拿大、英国、西班牙、荷兰、波多黎各等地的医疗、教育、政府、金融、能源、零售等行业，按机会在不同勒索团伙间切换。
> - **远程控制与隧道：** 高频使用 MeshAgent/MeshCentral，将 meshagent64 等二进制改成含受害组织名的名称并用 Base64 混淆命令；轮换 Atera、ScreenConnect、Splashtop、NinjaRMM、Remotely_Agent，并用 Cloudflared.exe、ngrok 以 LocalSystem 服务建立持久出站隧道暴露 RDP。
> - **凭证与发现：** 用 NetScan、SoftPerfect、Nmap 及原生命令做内网测绘；用 Mimikatz、LaZagne、pypykatz 抓凭证，并以 ntdsutil 创建 IFM 备份（C:\Windows\Temp\<XXXXXXXXX>）导出 NTDS.dit 离线破解域哈希。
> - **免杀与横移：** 关闭实时监控、给 C:\PerfLogs 加 Defender 排除、改 DisableAntiSpyware/DisableRealtimeMonitoring/WinDefend 注册表；随后用 PsExec（配 @ip.txt 主机列表）、Impacket、NetExec、rdp.bat（开 3389 防火墙规则）横移并部署重命名的 MeshAgent。
> - **外传与防御建议：** 用 s5cmd（配凭据文件）或 Rclone 按扩展名过滤将文档、数据库、邮件等传至攻击者 S3 桶，实施双重勒索；建议启用租户级篡改防护、为已批准 RMM 强制 MFA、配置 ASR 规则（阻止 lsass 凭证窃取、阻止 PsExec/WMI 派生进程等）与自动攻击阻断。

Activity associated with Storm-2570, a ransomware affiliate linked to multiple ransomware payloads, illustrates how tracking and responding to ransomware attacks by payload alone can obscure the affiliates carrying out intrusions and the recurring behaviors that defenders can use to detect and disrupt them. Microsoft Threat Intelligence has observed Storm-2570 using consistent post-compromise tools and techniques across deployments involving Qilin, DragonForce, Anubis, and BERT ransomware. Across multiple investigations, Storm-2570 has maintained largely uniform tradecraft, infrastructure overlaps, and repeated use of the same remote access and cloud exfiltration tooling despite operating across multiple ransomware ecosystems.

These findings reinforce the value of examining threat actor behavior across the attack chain rather than treating each ransomware payload as an isolated activity set. Recurring remote access, credential access, lateral movement, security tampering, and data exfiltration activity can help defenders connect related intrusions and respond before ransomware deployment, even when the final payload changes.

In this blog post, we delve into the attack techniques attributed to Storm-2570. While Storm-2570’s methodology aligns with the tactics, techniques, and procedures (TTPs) of many tracked ransomware actors, analysis of their post-compromise tactics provides essential insights into how organizations can harden and defend against ransomware threat actors, informing opportunities to disrupt attackers even if they have gained initial access to a network. At the end of this blog, we also provide a comprehensive recommendation section with detection details.

## Who is Storm-2570?

Storm-2570 is a ransomware affiliate that Microsoft Threat Intelligence has tracked since April 2025. We assess that Storm-2570 has operated across multiple [ransomware as a service (RaaS)](https://www.microsoft.com/en-us/security/blog/2022/05/09/ransomware-as-a-service-understanding-the-cybercrime-gig-economy-and-how-to-protect-yourself/) ecosystems, including Qilin, DragonForce, Anubis, and BERT.

To date, Microsoft Threat Intelligence has observed Storm-2570 in multiple investigated intrusions affecting organizations in United States, Canada, United Kingdom, Spain, Netherlands, and Puerto Rico, including healthcare and public health, education, government agencies and services, financial services, energy, consumer retail, Information technology (IT), food and agriculture, consumer services, commercial facilities, non-government organization (NGO), chemicals, critical manufacturing, and transportation.

Unlike actors that consistently support a single ransomware operation, Storm-2570 appears to be a cross-ecosystem threat actor that works with multiple ransomware groups and shifts between operations as opportunities arise, giving the threat actor the flexibility to use and deploy multiple families and improve opportunities for payouts. As a result, organizations could encounter the same actor, tools, and intrusion methods despite different ransomware payloads being deployed.

![Timeline of showing the different payloads used by Storm-2570 over time](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1c253203435112e7.webp)

Figure 1. Storm-2570’s RaaS deployment timeline

## Storm-2570 attack chain: From initial foothold to impact

While the method through which Storm-2570 gains initial access remains unconfirmed, observed intrusion chains indicate subsequent use of remote management tooling and hands-on-keyboard activity to progress toward credential access, lateral movement, exfiltration, and ransomware deployment.

Across incidents, Microsoft has observed the use of commodity tools in the pre-ransom attack stage even when the ransomware payload changed. These tools include:

-   Remote monitoring and management (RMM) tools, including Atera, MeshAgent, ScreenConnect, Splashtop, Remotely_Agent, and NinjaRMM
-   Discovery and lateral movement tools, including NetScan, Nmap, PsExec, Impacket, NetExec, and Remote Desktop Protocol (RDP) batch scripts
-   Data collection and exfiltration tools, including s5cmd and Rclone

These tools enable remote administration, command execution, persistence, and tunneling or proxy access.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/996acd3edbcc60fb.webp)

Figure 2. Storm-2570 attack chain

### Frequent use of remote management tooling across the attack chain

MeshAgent, a remote device management software, stands out as one of Storm-2570’s most frequently observed remote access and execution tools across multiple intrusions. Rather than appearing as a one-off utility, MeshAgent repeatedly shows up at key points in Storm-2570 attack chains, often after the actor has gained access and is preparing to expand control, run commands, deploy additional tooling, or move toward ransomware impact. In several cases, Storm-2570 used MeshAgent along with MeshCentral as an operational bridge between initial hands-on-keyboard activity and later-stage actions, such as account manipulation, discovery, credential access, security tampering, and ransomware deployment.

Many intrusions tracked by Microsoft have shown Storm-2570 tailoring MeshAgent deployments to the compromised environment. The actor renames MeshAgent-related binaries or services with victim-themed names, likely to make the tool appear more legitimate in the environment. For example, Storm-2570 renames the variant of the *meshagent64* RMM tool to include the name of the compromised organization, such as *meshagent64-\[organization name\].exe* and uses Base64-encoding to obfuscate the commands being executed. In one such intrusion, MeshAgent was used alongside NinjaRMM before the activity progressed to ntdsutil for credential dumping, network scanning, and Qilin deployment.

Storm-2570 uses a diverse set of remote access tools rather than relying on a single capability. The threat actor rotates among commercially available RMM platforms, remote desktop components, and tunneling utilities, often deploying multiple tools during the same intrusion. For example, Storm-2570 uses Atera to install agents and execute interactive commands, while ngrok and *Cloudflared.exe* expose RDP services or establish persistent outbound tunnels. Storm-2570 uses AteraAgent to issue commands and to further download and install Splashtop Streamer in compromised environments. Splashtop appears to be the interactive remote control component delivered through Atera, giving the threat actor hands-on keyboard access. The actor also uses tools such as ScreenConnect for command execution and account or domain reconnaissance and installs Remotely_Agent as a persistent remote management service.

### Use of tunneling utilities for persistent remote access

Storm-2570 also pairs remote access tooling with tunneling utilities such as *Cloudflared.exe* to create resilient outbound access paths. In one intrusion, Storm-2570 installed MeshAgent and later created a persistent Cloudflare Tunnel service on the victim host. The tunnel was configured to run automatically as a service under *LocalSystem*, allowing the threat actor to maintain an encrypted outbound channel from inside the network. This type of tunnel can help bypass inbound firewall restrictions and provide covert remote access for follow-on activity.

### Discovery and credential access

Post-compromise, Storm-2570 routinely conducts internal network discovery using tools such as NetScan, SoftPerfect Network Scanner Portable, and Nmap, alongside native discovery commands and file-searching activity. These activities are used to identify reachable hosts and services, map internal networks and remote systems, and locate systems, network shares, and files that may facilitate data collection, credential access, or encryption operations.

For credential access and harvesting, Storm-2570 uses tools like Mimikatz, LaZagne, and pypykatz. Storm-2570 also uses ntdsutil in intrusions for *NTDS.dit* credential dumping, a credential theft technique against Active Directory domain credentials. The ntdsutil command usage pattern is consistent with creating an Install From Media (IFM) copy of Active Directory database material. In an intrusion context, attackers can use this to obtain *NTDS.dit* and related registry hives for offline extraction of password hashes and credential material.

The command uses the legitimate Windows *ntdsutil.exe* to activate the NTDS Active Directory instance and create a full IFM backup in *C:\\Windows\\Temp\\<XXXXXXXXX>*.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9823b46462006ba3.webp)

Storm-2570 uses this command to dump or stage Active Directory database *NTDS.dit* and supporting registry hive material, then copy it off-host and potentially extract domain credential hashes offline, indicating that the actor has high-privilege access to a victim’s domain controller:

### Defense evasion

After acquiring privileged credentials, Storm-2570 uses defense evasion tactics preceding ransomware deployment, including antivirus tampering and the modification of Microsoft Defender settings and Defender exclusions. In multiple observed intrusions, Storm-2570 disabled real-time monitoring, added Defender exclusions for *C:\\PerfLogs* to weaken endpoint detections, and modified registry values under Microsoft Defender service keys to further impair protections.

These tactics are consistent across Storm-2570 ransomware intrusions involving Qilin, DragonForce, and Anubis deployment, including cases where the actor used registry changes to alter *DisableAntiSpyware*, *DisableRealtimeMonitoring*, and *WinDefend* service behavior.

### Lateral movement and deployment preparation

Storm-2570 moves into lateral movement and deployment preparation phase typically by using a mix of legitimate administrative tooling, offensive frameworks, and remote execution utilities.

Across multiple investigated intrusions, Storm-2570 was observed leveraging PsExec, Impacket, NetExec, RDP batch scripts, and admin shares to reach additional systems, execute commands remotely, and stage tooling across the environment. The actor uses these capabilities to facilitate data exfiltration and prepare victim networks for ransomware deployment. These tools frequently appear alongside earlier discovery activity, credential access, and remote access tooling such as MeshAgent, and often precede the use of s5cmd for exfiltration or ransomware payload execution.

PsExec is one of the most consistent lateral movement and deployment tools used by Storm-2570. The actor frequently uses PsExec, sometimes with host lists such as *@ip.txt*, to move laterally and install renamed MeshAgent binaries across compromised environments. Storm-2570 utilizes MeshAgent during the lateral movement phase in several intrusions as a remote access tool deployed onto newly compromised systems.

The following are examples of PsExec commands with host lists *@ip.txt*:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8396a66470d54f6e.webp)

Storm-2570 also uses RDP and RDP-enabling scripts as part of this phase. If RDP is not allowed in the environment, Storm-2570 needs admin privileges to modify the policy and enable it. In several intrusions, *rdp.bat* script appeared with PsExec, including cases where PsExec ran *rdp.bat* across hosts using *@ip.txt*.

The RDP batch script (*rdp.bat*) enables inbound Remote Desktop access by modifying Terminal Server settings and adding a firewall rule to allow TCP port 3389, as observed in the command below:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7a1418ebb8c9efcd.webp)

Additionally, the threat actor uses ngrok to expose TCP 3389 (default port for RDP), after which PsExec-related activity and security tampering appears. These examples show Storm-2570 combining RDP access, tunneling, and remote execution to sustain hands-on-keyboard control and reach additional systems.

Storm-2570’s use of Impacket and NetExec over Server Message Block (SMB) further supports their lateral movement pattern. Impacket is a collection of open-source Python classes designed for working with network protocols, and is popular with adversaries due to its ease of use and wide range of capabilities. Microsoft Defender for Endpoint has a dedicated attack surface reduction rule to [defend against lateral movement techniques](https://learn.microsoft.com/defender-endpoint/attack-surface-reduction-rules-reference#block-process-creations-originating-from-psexec-and-wmi-commands) used by Impacket; [protecting lateral movement pathways](https://www.microsoft.com/en-us/security/blog/2022/10/26/how-to-prevent-lateral-movement-attacks-using-microsoft-365-defender/) can also mitigate Impacket.

The following NetExec SMB command is used to conduct credential theft and reconnaissance against internal Windows hosts:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/02a91f866d30e743.webp)

### Data collection and exfiltration

Storm-2570 frequently performs data theft using cloud and file-transfer utilities that are capable of moving large volumes of data quickly from compromised environments to a remote attacker-owned cloud resource. Microsoft has observed Storm-2570 using s5cmd or Rclone to stage and exfiltrate data, often after the actor has already completed discovery, credential access, lateral movement, and remote access setup. Tools like Rclone provide data synchronization capabilities, moving newly created or updated files to cloud resources in real-time to enable continuous exfiltration throughout all stages of the attack without needing attacker interaction.

Most commonly, Storm-2570 relies on s5cmd, a command-line utility designed for managing Amazon S3 and compatible object storage services, for S3-based exfiltration. In multiple intrusions, the actor staged *s5cmd.exe* alongside a credentials file and used it to copy documents, spreadsheets, images, databases, mail-related files, archives, and other business-relevant file types to S3 buckets. Storm-2570 identifies high-value drives and network shares, stages *s5cmd.exe* and a credentials file, and then executes run copy (*cp*) operations with extension filters to transfer selected data to attacker-controlled S3 buckets. To interact with the destination S3 bucket, s5cmd requires credentials for authentication and the credentials file stores the AWS access keys for authentication to the S3 bucket.

The following is an example of s5cmd data exfiltration command lines:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f9c2a4b6e43c82b2.webp)

Overall, Storm-2570’s exfiltration tradecraft shows a strong preference for tools that blend into legitimate administrative or cloud-transfer workflows, allowing double-extortion operations: first collecting sensitive data through cloud-transfer tooling, then deploying ransomware.

## What Storm-2570 activity means for defenders

Storm-2570 illustrates common human-operated ransomware attacks and how modern ransomware affiliates increasingly operate independently of a single ransomware brand. Ransomware affiliates’ use of common tools, intrusion methods, and operational patterns remain remarkably consistent. Although Storm-2570’s techniques are not novel, recognizing the patterns used by ransomware affiliates can be important for defenders to know to improve prevention, detection, and incident response.

## Mitigation and protection guidance

To defend against Storm-2570 TTPs and similar activity, Microsoft recommends the following mitigation measures:

-   Follow the [defending against ransomware guidance](https://www.microsoft.com/security/blog/2022/05/09/ransomware-as-a-service-understanding-the-cybercrime-gig-economy-and-how-to-protect-yourself/#defending-against-ransomware?ocid=magicti_ta_blog) in Microsoft’s ransomware as a service blog post which details how to build credential hygiene as well as how to limit lateral movement using the principle of least privilege.
-   Turn on tenant-wide [tamper protection](https://learn.microsoft.com/microsoft-365/security/defender-endpoint/prevent-changes-to-security-settings-with-tamper-protection?ocid=magicti_ta_learndoc) features to prevent attackers from stopping security services or using antivirus exclusions. Without tamper protection, attackers could simply turn off Microsoft Defender Antivirus without the need to acquire higher privileges.
    
    -   Customers running Intune or Microsoft Defender for Endpoint Security Configuration can [enable DisableLocalAdminMerge to prevent modification of antivirus exclusions via GPO](https://learn.microsoft.com/microsoft-365/security/defender-endpoint/manage-tamper-protection-intune?ocid=magicti_ta_learndoc#tamper-protection-for-antivirus-exclusions).
    
    -   In addition to tamper protection, you can also [enable and configure Microsoft Defender Antivirus always-on protection in Group Policy](https://learn.microsoft.com/microsoft-365/security/defender-endpoint/configure-real-time-protection-microsoft-defender-antivirus?ocid=magicti_ta_learndoc).
    
    -   If there is an issue with a device during roll out of various antivirus features, the device can be placed in [Troubleshooting mode](https://learn.microsoft.com/microsoft-365/security/defender-endpoint/enable-troubleshooting-mode?ocid=magicti_ta_learndoc) to turn off Tamper Protection temporarily without impacting the wider organizational security policy.
-   For approved RMM systems used in your environment, enforce security settings where possible to implement MFA. If an unapproved RMM installation is discovered in your network, reset passwords for accounts used to install the RMM services. If a System-level account was used to install the software, further investigation may be warranted.
-   Configure [automatic attack disruption](https://learn.microsoft.com/defender-xdr/configure-attack-disruption) in Microsoft Defender XDR. Automatic attack disruption is designed to contain attacks in progress, limit the impact on an organization’s assets, and provide more time for security teams to remediate the attack fully.
-   Microsoft Defender XDR customers can turn on [attack surface reduction rules](https://docs.microsoft.com/microsoft-365/security/defender-endpoint/attack-surface-reduction?view=o365-worldwide) to prevent common attack techniques used in ransomware attacks:
    
    -   [Block credential stealing from the Windows local security authority subsystem (lsass.exe)](https://docs.microsoft.com/microsoft-365/security/defender-endpoint/attack-surface-reduction#block-credential-stealing-from-the-windows-local-security-authority-subsystem)
    
    -   [Block execution of potentially obfuscated scripts](https://learn.microsoft.com/en-us/microsoft-365/security/defender-endpoint/attack-surface-reduction-rules-reference?view=o365-worldwide#block-execution-of-potentially-obfuscated-scripts)
    
    -   [Block Webshell creation for Servers](https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-reference?view=o365-worldwide#block-webshell-creation-for-servers)
    
    -   [Block process creations originating from PSExec and WMI commands](https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-reference?view=o365-worldwide#block-process-creations-originating-from-psexec-and-wmi-commands) (Some organizations might experience compatibility issues with this rule on certain server systems but should deploy it to other systems to prevent lateral movement originating from PsExec and WMI.)
    
    -   [Block use of copied or impersonated system tools](https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-reference?view=o365-worldwide#block-use-of-copied-or-impersonated-system-tools)
    
    -   [Use advanced protection against ransomware](https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-reference?view=o365-worldwide#use-advanced-protection-against-ransomware)

## Microsoft Defender detections

[Microsoft Defender](https://www.microsoft.com/security/business/microsoft-defender) customers can refer to the list of applicable detections below. Microsoft Defender coordinates detection, prevention, investigation, and response across endpoints, identities, email, apps to provide integrated protection against attacks like the threat discussed in this blog.

|     |     |     |
| --- | --- | --- |
| **Tactic** | **Observed activity** | **Microsoft Defender coverage** |
| Execution | Storm-2570 delivers tools such as PsExec, Impacket, NetExec, and RDP batch scripts, to carry out post-compromise activity | [**Microsoft Defender Antivirus**](https://www.microsoft.com/windows/comprehensive-security)  <br>– Behavior:Win32/PsexecRemote  <br>  <br>[**Microsoft Defender for Endpoint**](https://www.microsoft.com/security/business/endpoint-security/microsoft-defender-endpoint)  <br>– Hands-on-keyboard attack involving multiple devices  <br>– Remote access software  <br>– Suspicious PowerShell command line  <br>– Suspicious PowerShell download or encoded command execution  <br>– Ransomware-linked threat actor detected |
| Persistence | Storm-2570 uses RMM tools for persistence, payload delivery, and lateral movement | [**Microsoft Defender for Endpoint**](https://www.microsoft.com/security/business/endpoint-security/microsoft-defender-endpoint)  <br>– Suspicious Atera activity  <br>– File dropped and launched from remote location |
| Defense Impairment | Storm-2570 disables Microsoft Defender | [**Microsoft Defender for Endpoint**](https://www.microsoft.com/security/business/endpoint-security/microsoft-defender-endpoint)  <br>– Defender detection bypass  <br>– Attempt to turn off Microsoft Defender Antivirus protection |
| Credential Access | Storm-2570 has used tools like Mimikatz, LaZagne, and pypykatz for credential access and harvesting and *NTDS.dit* for credential dumping | [**Microsoft Defender Antivirus**](https://www.microsoft.com/windows/comprehensive-security) – HackTool:Win32/Mimikatz – HackTool:Win64/Mimikatz – HackTool:Linux/LaZagne – HackTool:Win32/LaZagne – HackTool:Win64/LaZagne [**Microsoft Defender for Endpoint**](https://www.microsoft.com/security/business/endpoint-security/microsoft-defender-endpoint)  <br>– Exposed credentials at risk of compromise  <br>– Compromised account credentials  <br>– Process memory dump |
| Exfiltration | Storm-2570 uses Rclone and s5cmd for data theft | [**Microsoft Defender for Endpoint**](https://www.microsoft.com/security/business/endpoint-security/microsoft-defender-endpoint)  <br>– Potential human-operated malicious activity  <br>– Renaming of legitimate tools for possible data exfiltration  <br>– Possible data exfiltration  <br>– Hidden dual-use tool launch attempt |
| Impact | Storm-2570 deploys Anubis, DragonForce, Qilin, and BERT ransomware | [**Microsoft Defender Antivirus**](https://www.microsoft.com/windows/comprehensive-security)  <br>– Ransom:Win32/Qilinloader – Behavior:Win32/Ransomware!Qilin – Ransom:Linux/Qilin – Ransom:Win32/Qilin – Ransom:Win32/DragonForce – Ransom:Win64/Anubis  <br>  <br>[**Microsoft Defender for Endpoint**](https://www.microsoft.com/security/business/endpoint-security/microsoft-defender-endpoint)  <br>– Possible ransomware activity based on a known malicious extension  <br>– Possible compromised user account delivering ransomware-related files  <br>– Potentially compromised assets exhibiting ransomware-like behavior  <br>– Ransomware behavior detected in the file system  <br>– File dropped and launched from remote location |

### Microsoft Security Copilot

[Microsoft Security Copilot](https://www.microsoft.com/en-us/security/business/ai-machine-learning/microsoft-security-copilot) is [embedded in Microsoft Defender](https://learn.microsoft.com/defender-xdr/security-copilot-in-microsoft-365-defender) and provides security teams with AI-powered capabilities to summarize incidents, analyze files and scripts, summarize identities, use guided responses, and generate device summaries, hunting queries, and incident reports.

Customers can also [deploy AI agents](https://learn.microsoft.com/defender-xdr/security-copilot-agents-defender), including the following [Microsoft Security Copilot agents](https://learn.microsoft.com/copilot/security/agents-overview), to perform security tasks efficiently:

-   [Threat Intelligence Briefing agent](https://learn.microsoft.com/defender-xdr/threat-intel-briefing-agent-defender)
-   [Phishing Triage agent](https://learn.microsoft.com/defender-xdr/phishing-triage-agent)
-   [Threat Hunting agent](https://learn.microsoft.com/defender-xdr/advanced-hunting-security-copilot-threat-hunting-agent)
-   [Dynamic Threat Detection agent](https://learn.microsoft.com/defender-xdr/dynamic-threat-detection-agent)

Security Copilot is also available as a [standalone experience](https://learn.microsoft.com/en-us/copilot/security/experiences-security-copilot) where customers can perform specific security-related tasks, such as incident investigation, user analysis, and vulnerability impact assessment. In addition, Security Copilot offers [developer scenarios](https://learn.microsoft.com/copilot/security/developer/custom-agent-overview) that allow customers to build, test, publish, and integrate AI agents and plugins to meet unique security needs.

### Threat intelligence reports

Microsoft Defender XDR customers can use the following [threat analytics](https://learn.microsoft.com/defender-xdr/threat-analytics) reports in the Defender portal (requires license for at least one Defender XDR product) to get the most up-to-date information about the threat actor, malicious activity, and techniques discussed in this blog. These reports provide the intelligence, protection information, and recommended actions to prevent, mitigate, or respond to associated threats found in customer environments.

-   [Actor Profile: Storm-2570](https://security.microsoft.com/threatanalytics3/5ac0e98d-7586-40fb-b282-3c4047a82924/analystreport)
-   [Tool Profile: Qilin ransomware](https://security.microsoft.com/threatanalytics3/dbd24ce5-5045-41c1-b933-62617d2bb264)
-   [Tool Profile: Anubis ransomware](https://security.microsoft.com/threatanalytics3/4475a27b-a5dd-41ea-a793-1523dde6ae41)
-   [Tool Profile: DragonForce ransomware](https://security.microsoft.com/threatanalytics3/85dc80b3-622f-4eea-a3e4-4934184ef5ef)

Microsoft Security Copilot customers can also use the [Microsoft Security Copilot integration](https://learn.microsoft.com/defender/threat-intelligence/security-copilot-and-defender-threat-intelligence?bc=%2Fsecurity-copilot%2Fbreadcrumb%2Ftoc.json&toc=%2Fsecurity-copilot%2Ftoc.json#turn-on-the-security-copilot-integration-in-defender-ti) in Microsoft Defender Threat Intelligence, either in the Security Copilot standalone portal or in the [embedded experience](https://learn.microsoft.com/defender/threat-intelligence/using-copilot-threat-intelligence-defender-xdr) in the Microsoft Defender portal to get more information about this threat actor.

## Hunting queries

### Microsoft Sentinel

Microsoft Sentinel customers can run the following advanced hunting queries to find related activity in their networks:

**Hunt for PsExec-based remote execution and deployment**

```sql
DeviceProcessEvents
| where Timestamp > ago(30d)
| where FileName in~ ("psexec.exe", "psexec64.exe")
    or ProcessCommandLine has_any ("psexec.exe", "psexec64.exe")
| where ProcessCommandLine has_any ("@ip.txt", "-accepteula", "\\")
| project Timestamp, DeviceName, AccountName, FileName, ProcessCommandLine,
          InitiatingProcessFileName, InitiatingProcessCommandLine,
          SHA256, DeviceId, ReportId
| order by Timestamp desc
```

**Hunt for renamed MeshAgent binaries and services**

```sql
let MeshAgentTerms = dynamic(["meshagent", "meshagent64", "meshcentral"]);
union isfuzzy=true
(
    DeviceProcessEvents
    | where Timestamp > ago(30d)
    | where FileName has_any (MeshAgentTerms)
        or ProcessCommandLine has_any (MeshAgentTerms)
        or InitiatingProcessCommandLine has_any (MeshAgentTerms)
    | project Timestamp, DeviceName, ActionType, FileName, FolderPath,
              ProcessCommandLine, InitiatingProcessFileName,
              InitiatingProcessCommandLine, SHA256,
              RegistryKey="", RegistryValueName="", SourceTable="DeviceProcessEvents"
),
(
    DeviceFileEvents
    | where Timestamp > ago(30d)
    | where FileName has_any (MeshAgentTerms)
        or FolderPath has_any (MeshAgentTerms)
        or InitiatingProcessCommandLine has_any (MeshAgentTerms)
    | project Timestamp, DeviceName, ActionType, FileName, FolderPath,
              ProcessCommandLine="", InitiatingProcessFileName,
              InitiatingProcessCommandLine, SHA256,
              RegistryKey="", RegistryValueName="", SourceTable="DeviceFileEvents"
),
(
    DeviceRegistryEvents
    | where Timestamp > ago(30d)
    | where RegistryKey has_any (MeshAgentTerms)
        or RegistryValueName has_any (MeshAgentTerms)
        or RegistryValueData has_any (MeshAgentTerms)
        or InitiatingProcessCommandLine has_any (MeshAgentTerms)
    | project Timestamp, DeviceName, ActionType, FileName="", FolderPath="",
              ProcessCommandLine="", InitiatingProcessFileName,
              InitiatingProcessCommandLine, SHA256="",
              RegistryKey, RegistryValueName, SourceTable="DeviceRegistryEvents"
)
| order by Timestamp desc
```

### Learn more

For the latest security research from the Microsoft Threat Intelligence community, check out the [Microsoft Threat Intelligence Blog](https://aka.ms/threatintelblog).

To get notified about new publications and to join discussions on social media, follow us on [LinkedIn](https://www.linkedin.com/showcase/microsoft-threat-intelligence), [X (formerly Twitter)](https://x.com/MsftSecIntel), and [Bluesky](https://bsky.app/profile/threatintel.microsoft.com).

To hear stories and insights from the Microsoft Threat Intelligence community about the ever-evolving threat landscape, listen to the [Microsoft Threat Intelligence podcast](https://thecyberwire.com/podcasts/microsoft-threat-intelligence).

The post [Beyond the ransomware: Tracking Storm-2570’s consistent tradecraft across deployments](https://www.microsoft.com/en-us/security/blog/2026/09/24/beyond-ransomware-tracking-storm-2570-consistent-tradecraft-across-deployments/) appeared first on [Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog).
