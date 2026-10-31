---
title: "IR trends Q3 2026: Actors impersonate IT help desks in vishing attacks as ransomware activity increases"
source: https://blog.talosintelligence.com/ir-trends-q3-2026/
source_host: blog.talosintelligence.com
clip_date: 2026-10-31T20:17:42+08:00
trace_id: 630e926f-b7c3-41be-bfff-5735346805da
content_hash: c1619f8b338840bc8c4fb6648702d316d6576de17d5a638903ceca50879ae385
status: synced
tags: []
series: null
feed_source: Cisco Talos
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 40a75244-d011-81b8-9abd-d98a90347fc0
ioc:
  cves:
    - CVE-2023-20198
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

![IR trends Q3 2026: Actors impersonate IT help desks in vishing attacks as ransomware activity increases](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/79733af7c9c265cd.jpg)

Phishing remained the leading initial access technique, appearing in slightly over one-third of all Cisco Talos Incident Response (Talos IR) engagements — a decrease from over 50 percent last quarter. In addition to traditional phishing links and attachments, we observed numerous threat actors conducting voice phishing (vishing) in tandem with IT desk impersonation to socially engineer the victim into allowing remote access via a legitimate remote monitoring and management (RMM) tool. Exploitation of public-facing applications was the next most common vector, accounting for one-third of Talos IR engagements. Threat actors predominantly targeted edge devices such as security gateways and remote network management interfaces. These are critical components within enterprise environments, often responsible for managing authentication, network traffic, or sensitive data. Compromising them can provide broad access to internal networks or user credentials.

Ransomware and pre-ransomware incidents made up 27 percent of engagements in Q3 2026, an increase from a maximum of 20 percent seen in the previous four quarters. Talos responded to attacks involving prolific, technologically advanced, and well-established ransomware-as-a-service (RaaS) variants such as The Gentlemen, Qilin, and Rhysida, as well as Interlock, which operates as a closed group. Threat actors predominantly chose to disable endpoint detection and response (EDR) systems, often by exploiting vulnerable drivers or using Windows Defender Application Control (WDAC). Additionally, we observed the emerging ransomware variant VYPR, whose operator(s) tested a range of tactics, techniques, and procedures (TTPs) instead of following a standard attack method or affiliate playbook.

## Salt Typhoon-affiliated threat actors exploit public-facing application vulnerabilities for cyber espionage

Talos IR continues to see prolonged cyber espionage intrusions targeting the telecommunications sector. Talos attributed most of these intrusions with high confidence to China state-sponsored threat actors, including Salt Typhoon. The attackers in these intrusions routinely gain initial access by leveraging valid credentials and exploiting a known vulnerability (CVE-2023-20198) in publicly accessible web-based management interfaces—two of the most frequently observed initial access vectors this quarter. In one campaign, the threat actor deployed [BadCandy,](https://blog.talosintelligence.com/active-exploitation-of-cisco-ios-xe-software/) a malicious web shell implant known to be leveraged by Salt Typhoon, to maintain persistent and stealthy remote access.

The adversaries continue to employ living-off-the-land (LOTL) tactics, leveraging legitimate network infrastructure features — such as VPN access, traffic mirroring, and management protocols — to establish backdoors, exfiltrate data, and conduct reconnaissance. Exploiting a vulnerability in the web-based management interface, they created privileged accounts, disabled logging to conceal their activity, and altered configurations to maintain persistence, blending their actions with normal administrative operations to evade detection.

These intrusions revealed several security weaknesses in the victim environment, including reliance on password-only authentication without evidence of multi-factor authentication (MFA), use of legacy and weak management protocols (such as plaintext SNMP and outdated VPN encryption), and inadequate credential management practices. Attackers were able to create and abuse privileged accounts, disable logging, and manipulate configuration settings without encountering effective security barriers, enabling persistent and stealthy access. The absence of strong MFA and robust credential management are two of the most frequently observed security weaknesses this quarter.

## AI exploited as a weapon and a target

Recent Talos IR investigations highlight the growing role of artificial intelligence (AI) in cybercriminal activity, both as a tool and a target. In one case, an internal threat actor who was hired under false credentials abused their privileged access to install AI-powered development tools, such as GitHub Copilot CLI and Anthropic Claude Code. While the investigation did not find evidence of malicious activity or data theft, the employee’s developer-level access — including cloning repositories, configuring plugins, and connecting to databases — could have enabled them to use AI tools to automate malicious actions within the organization.

A second investigation revealed an attack chain in which a compromised macOS endpoint, infected via a trojanized application, was scripted to scrape credentials from the macOS keychain specifically associated with the Anthropic Claude Code AI assistant. This direct targeting of AI-related secrets highlights an emerging threat, where attackers seek to compromise not only traditional user and system credentials but also those tied to AI platforms, which may grant access to additional sensitive data and advanced automation capabilities.

These incidents highlight the critical need for organizations to implement strong MFA and robust credential management practices, especially for AI platforms and development tools.

## Ransomware trends

Ransomware and pre-ransomware incidents increased from a little over 20 percent last quarter to 27 percent in Q3, involving well-known threat groups like Interlock and the emerging ransomware VYPR. Frequently observed techniques involved deleting EDR systems and socially engineering victims into initiating remote management sessions.

### Emerging ransomware variant: VYPR

During a Talos IR engagement, we observed a ransomware variant called “VYPR” that we assess is relatively new and still operationally immature. This assessment is supported by the absence of an established data leak site (DLS), as none was referenced in the ransom note and associated DLS infrastructure was not created until after the engagement. The group also appeared to rely on older leaked Conti-derived source code with only minimal modifications, reflecting a relatively unsophisticated technical approach. Their operations further suggested experimentation rather than a refined playbook, as they took an unusually long time to exfiltrate and encrypt data while testing different exfiltration parameters and deploying multiple vulnerable drivers to disable EDR protections.

The actor gained initial access through voice phishing (vishing); they tricked a user into initiating a Microsoft Quick Assist session, allowing remote access to the endpoint. While the exact social engineering technique was not confirmed in this case, threat actors frequently impersonate IT help desks during vishing calls to manipulate victims into establishing remote connections — a tactic observed in several other Q3 engagements.

The actor was then able to utilize existing RMM software, which subsequently executed PowerShell commands to download and install a Microsoft Software Installer (MSI) package from a remote IP address. During the attack, the actor leveraged tools that are commonly observed during ransomware investigations, including MeshAgent, Rclone, PsExec, IP scan, and Microsoft Terminal Services Client (MSTSC). Notably, we saw exfiltration over multiple days, which is not commonly observed during ransomware investigations.

### EDR killers: Why evade detection when you can destroy it?

We observed several instances where ransomware operators disabled EDR systems, prioritizing direct disruption of security controls. We observed Interlock ransomware actors making multiple attempts to impair endpoint detection EDR capabilities by trying to uninstall Cisco Secure Endpoint (CSE) on compromised systems and used tools such as PsExec.exe and taskkill.exe to terminate security services and integrity checkers, including cscm.exe and sfc.exe. Additionally, the adversary disabled Windows Defender real-time protection and cleared various event logs to reduce visibility and hinder forensic analysis. This is in line with previously observed Interlock activity, where they deployed a malicious WDAC policy to terminate EDR solutions.

In the previously mentioned VYPR ransomware incident, the threat actor disabled EDR and antivirus (AV) by using Bring Your Own Vulnerable Driver (BYOVD) techniques to evade detection and execute the ransomware. BYOVD attacks take advantage of trusted but flawed drivers to gain kernel-level access, enabling threat actors to disable EDR mechanisms and carry out their operations unimpeded. While this technique is commonly observed in ransomware attacks, this actor deployed an unusually large number of vulnerable drivers in the environment, possibly to create redundancies and maximize their chances of success.

## Targeting

Targeting of the financial industry increased from last quarter to comprise 18 percent of all engagements, tying with public administration as the most targeted sector. Although the financial industry remains a valuable target, Talos has not ranked it among the top three most impacted sectors since 2024. One possible reason is that organizations in finance can typically invest more in cybersecurity, unlike sectors such as public administration, which has consistently been among the top-targeted industries over the past year. Meanwhile, health care fell to third place after ranking as the most targeted industry for the previous two consecutive quarters.

![IR trends Q3 2026: Actors impersonate IT help desks in vishing attacks as ransomware activity increases](https://storage.ghost.io/c/af/a0/afa04ee3-414f-4481-8d23-7e7c146f192e/content/images/2026/10/Q3dark_Q3Targets-dark.jpg)

IR trends Q3 2026: Actors impersonate IT help desks in vishing attacks as ransomware activity increases

## Initial access

While the number of engagements involving phishing as an initial access vector declined from last quarter, it remained the most common technique, appearing in 37 percent of Talos IR engagements. Exploitation of public-facing applications was the second most common initial access vector, accounting for 33 percent of engagements.

![IR trends Q3 2026: Actors impersonate IT help desks in vishing attacks as ransomware activity increases](https://storage.ghost.io/c/af/a0/afa04ee3-414f-4481-8d23-7e7c146f192e/content/images/2026/10/Q3dark_Q3SecurityWeakness-dark-06.jpg)

IR trends Q3 2026: Actors impersonate IT help desks in vishing attacks as ransomware activity increases

## Recommendations for addressing top security weaknesses

The most common security weaknesses observed this quarter were insufficient logging, improper credential and secret management, and absent or improperly implemented authentication and MFA. These trends closely mirror last quarter, when insufficient logging and authentication weaknesses were also prevalent.

![IR trends Q3 2026: Actors impersonate IT help desks in vishing attacks as ransomware activity increases](https://storage.ghost.io/c/af/a0/afa04ee3-414f-4481-8d23-7e7c146f192e/content/images/2026/10/Q3dark_Q3SecurityWeakness-dark-02.jpg)

IR trends Q3 2026: Actors impersonate IT help desks in vishing attacks as ransomware activity increases

### Centralize logging and set retention requirements

The leading security weakness was insufficient logging leading to visibility gaps, seen in over 40 percent of engagements this quarter. These gaps were in part due to the common threat actor practice of deleting logs, and in part due to insufficient log retention or configuration implemented by the customer. Talos IR recommends implementing a SIEM or centralized logging platform with a minimum of 90 days of retention, forwarding logs from servers, workstations, network infrastructure, cloud identity providers, and security appliances off-device so they survive log tampering and host rebuilds, and enabling process-creation, command-line, and cloud API (e.g., Microsoft Graph) auditing. Talos IR's [Log Architecture Assessment](https://talosintelligence.com/incident_response/assessment) service can identify gaps and provide a roadmap to a complete view of the environment.

### Tighten authentication and MFA controls

Missing or insufficient authentication and MFA controls were the third most common security weakness this quarter, observed in 33 percent of engagements. The most prevalent issue was reliance on single-factor authentication, which allowed unauthorized access in several incidents. In many cases, legacy authentication protocols were still enabled, enabling adversaries to log in without any MFA requirements, and some environments failed to enforce MFA for high-privilege accounts. To reduce this risk, Talos IR recommends transitioning from push- and SMS-based MFA to phishing-resistant methods such as FIDO2/WebAuthn and hardware security keys. Organizations should also restrict self-service MFA enrollment by requiring helpdesk verification, block legacy authentication through Conditional Access, enforce number matching or verified push where phishing-resistant methods are not yet feasible, and condition access on device compliance and trusted infrastructure rather than geographic location alone.

### Safeguard credentials and secrets

Improper credential and secret management was the second most common security weakness seen in 33 percent of engagements this quarter, reinforcing the importance of security awareness training and consistent security hygiene for every user. Observed security issues included unsafe storage and handling of credentials, such as saving passwords in browser stores, poor control mechanisms like permitting autofill for browser-stored credentials, and credential reuse and sharing. Effective secret management begins with a formal process that covers passwords, API keys, tokens, certificates, and other sensitive credentials. By requiring unique passwords for every account and encouraging the use of password managers, organizations reduce the risks associated with credential reuse and sharing. Storing secrets securely, with encryption and access restricted to only those who need them, further strengthens protection. When credentials are no longer necessary or are suspected to be compromised, they should be promptly revoked and replaced. Regular reviews of access to privileged credentials, combined with thorough logging, help detect unusual activity. Equipping staff with training on safe handling and clear reporting procedures ensures that accidental disclosures are addressed quickly and effectively.

![IR trends Q3 2026: Actors impersonate IT help desks in vishing attacks as ransomware activity increases](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ae8d596fbaa2d11f.jpg)

IR trends Q3 2026: Actors impersonate IT help desks in vishing attacks as ransomware activity increases

## Tales from the Frontlines: An exclusive briefing on Q3 incidents

On November 12, Talos incident responders will be hosting an exclusive, unrecorded 30-minute webinar to review the most high-impact incidents our customers faced in Q3. Designed for security professionals of all levels, this is a candid discussion of what happened, how we handled it, and what it means for your organization.

Registration is required to attend. Don't miss this chance to hear real-world stories from the frontlines of cyber defense, directly from the team who lived them.

## MITRE ATT&CK appendix

The table below represents MITRE ATT&CK techniques and tools observed in this quarter’s IR engagements, including relevant examples. Given that some techniques can fall under multiple tactics, we grouped them under the most relevant tactic based on the way they were leveraged. Please note that this is not an exhaustive list.

Key findings from the MITRE ATT&CK framework include:

-   The rise of phishing and the frequent use of valid accounts for initial access and lateral movement both highlight how attackers continue to rely on methods that have remained consistently effective year over year.
-   Attacker success consistently reflects basic weaknesses in enterprise security posture, with persistent exploitation of known vulnerabilities — especially in internet-facing applications — demonstrating that adversaries continually scan for and opportunistically target unpatched systems.
-   The most used techniques to maintain persistence were deploying web shells and creating scheduled tasks, demonstrating that attackers prioritize stealthy, reliable access by leveraging legitimate system components that blend in with normal operations. These techniques enable threat actors to maintain long-term control and quickly re-establish their presence even if some signs of compromise are removed.

|     |     |     |
| --- | --- | --- |
| Tactic | Technique | Example |
| Initial Access (TA0001) | T1190 Exploit Public-Facing Application | Adversaries may exploit vulnerabilities in public-facing applications to gain unauthorized access to a network. |
|     | T1566 Phishing (link, attachment, voice, service) | Adversaries may rely on users clicking a malicious link or opening a malicious attachment to gain initial access, often using social engineering to increase success. |
|     | T1078 Valid Accounts (Local, Domain, Cloud, SSH) | Adversaries may obtain and abuse credentials of existing accounts to access systems within the network and execute their payload. |
|     | T1133 External Remote Services | Adversaries may leverage remote services such as VPN or RDP to gain entry into an environment using legitimate access mechanisms. |
| Execution (TA0002) | T1059 Command and Scripting Interpreter (PowerShell, Windows/Unix Shell, JavaScript, Python) | Adversaries may use built-in scripting interpreters like PowerShell or bash to execute malicious code on victim systems. |
|     | T1610 Deploy Container | Adversaries may deploy malicious containers in cloud or on-premises environments to establish execution. |
| Persistence (TA0003) | T1505.003 Server Software Component: Web Shell | Adversaries may install web shells on compromised servers to maintain persistent access via HTTP/S. |
|     | T1543 Create or Modify System Process (Windows Service, Scheduled Task) | Adversaries may create or modify system processes, such as scheduled tasks or services, to maintain persistence after initial compromise. |
|     | T1136.001 Create Account: Local Account | Adversaries may create new local accounts to establish persistence or elevate privileges within the environment. |
| Defense Evasion (TA0005) | T1036 Masquerading | Adversaries may disguise malicious files or processes as legitimate system components to avoid detection. |
|     | T1562.001 Impair Defenses: Disable/Modify Security Tools | Adversaries may disable or modify security software and tools to avoid detection and facilitate continued operations. |
|     | T1070 Indicator Removal (File Deletion, Clear Event Logs) | Adversaries may remove or alter evidence of their activity by deleting files or clearing logs on compromised systems. |
|     | T1027 Obfuscated Files or Information | Adversaries may obfuscate files and information to prevent security tools from identifying malicious activity. |
|     | T1218.011 System Binary Proxy Execution: Rundll32 | Adversaries may use legitimate system binaries such as rundll32 to proxy execution of malicious code. |
|     | T1222 File and Directory Permissions Modification | Adversaries may modify file or directory permissions to conceal their presence or maintain access. |
|     | T1055 Process Injection | Adversaries may inject malicious code into the address space of legitimate processes to evade detection. |
|     | T1550 Use Alternate Authentication Material | Adversaries may use alternate authentication material, such as SSH keys, to access accounts without using passwords. |
| Discovery (TA0007) | T1018 Remote System Discovery | Adversaries may enumerate remote systems on a network to identify targets for lateral movement or data collection. |
|     | T1082 System Information Discovery | Adversaries may collect detailed information about the operating system and hardware to inform later actions. |
|     | T1087 Account Discovery (Domain Account) | Adversaries may query for user and group information to identify accounts of interest in the environment. |
|     | T1046 Network Service Discovery | Adversaries may scan for open ports and network services to identify potential entry points or targets. |
|     | T1518.001 Security Software Discovery | Adversaries may search for installed security software to tailor evasion techniques accordingly. |
|     | T1016 System Network Configuration Discovery | Adversaries may gather network configuration details to better understand the environment and plan next steps. |
| Command and Control (TA0011) | T1105 Ingress Tool Transfer | Adversaries may transfer tools or payloads into an environment to facilitate further operations. |
|     | T1071 Application Layer Protocol (Web, DNS) | Adversaries may use common web or DNS protocols for command and control to blend in with normal network traffic. |
|     | T1219 Remote Access Software | Adversaries may use legitimate remote access software to maintain control over compromised systems. |
|     | T1572 Protocol Tunneling | Adversaries may tunnel command and control traffic through allowed protocols to bypass network defenses. |
|     | T1090 Proxy | Adversaries may route communications through proxy servers to obscure their origin and evade detection. |
| Lateral Movement (TA0008) | T1021.002 SMB/Windows Admin Shares | Adversaries may use SMB and admin shares to move laterally between systems within the network. |
|     | T1021.004 SSH | Adversaries may use SSH with stolen credentials or keys to move laterally across systems. |
|     | T1570 Lateral Tool Transfer | Adversaries may transfer tools or files between systems to enable further compromise. |
|     | T1047 Windows Management Instrumentation | Adversaries may leverage WMI to execute code or commands remotely on Windows systems. |
| Privilege Escalation (TA0004) | T1098 Account Manipulation (Additional Cloud Roles) | Adversaries may modify account permissions or roles to escalate privileges within cloud environments. |
| Collection (TA0009) | T1005 Data from Local System | Adversaries may collect files and sensitive data from local systems for later exfiltration. |
|     | T1039 Data from Network Shared Drive | Adversaries may look for folders and drives shared on remote systems as a means of identifying sources of information to gather. |
|     | T1560.001 Archive Collected Data via Utility | Adversaries may compress or archive collected data to facilitate exfiltration. |
| Credential Access (TA0006) | T1110.003 Brute Force: Password Spraying | Adversaries may attempt to gain access by systematically trying commonly used passwords against many accounts. |
|     | T1556 Modify Authentication Process | Adversaries may modify authentication processes to facilitate unauthorized access. |
|     | T1649 Steal or Forge Authentication Certificates | Adversaries may steal or forge authentication certificates to bypass authentication controls. |
|     | T1558 Steal or Forge Kerberos Tickets | Adversaries may forge or steal Kerberos tickets to access resources within the network. |
|     | T1557 Adversary-in-the-Middle | Adversaries may intercept communications to capture credentials in transit. |
| Exfiltration (TA0010) | T1567.002 Exfiltration to Cloud Storage | Adversaries may exfiltrate collected data to cloud storage services outside the target network. |
|     | T1041 Exfiltration Over C2 Channel | Adversaries may transfer stolen data over established command and control channels. |
|     | T1048 Exfiltration Over Alternative Protocol | Adversaries may exfiltrate data using alternative network protocols such as FTP or SFTP. |
| Impact (TA0040) | T1486 Data Encrypted for Impact | Adversaries may encrypt files or entire systems to disrupt normal operations and demand ransom. |
|     | T1490 Inhibit System Recovery | Adversaries may delete backups or shadow copies to prevent recovery and maximize impact. |
| Reconnaissance (TA0043) | T1595.002 Active Scanning: Vulnerability Scanning | Adversaries may actively scan for vulnerable systems and services as part of their reconnaissance. |
|     | T1589.001 Gather Victim Identity Information: Credentials | Adversaries may collect credential information from public sources to inform later attacks. |
| Resource Development (TA0042) | T1583 Acquire Infrastructure | Adversaries may acquire infrastructure, such as servers or domains, to support their operations. |
|     | T1584 Compromise Infrastructure | Adversaries may compromise third-party infrastructure to use as a launch point for further activities. |
| Software/Tool | GoGRPC RAT | Adversaries may deploy GoGRPC RAT, commonly observed as fly.exe, to remotely control compromised systems and execute commands via the GoGRPC protocol, enabling stealthy management and data collection. |
|     | Node RAT | Adversaries may leverage Node.js-based remote access tools to establish persistence, execute arbitrary code, and facilitate command and control through JavaScript runtimes on victim machines. |
|     | BadCandy | Adversaries may use BadCandy, a remote access trojan, to gain persistent remote control, exfiltrate data, and monitor victim activities, often leveraging encrypted communications to evade detection. |
|     | Overlord RAT | Adversaries may utilize Overlord RAT to remotely administer compromised hosts, execute commands, and transfer files, often blending C2 traffic with legitimate protocols to avoid network monitoring. |
|     | SideSlipRAT | Adversaries may deploy SideSlipRAT to maintain ongoing access to victim systems, execute malicious payloads, and collect sensitive information while using various evasion techniques to bypass defenses. |
|     | Impacket SMBexec | Adversaries may use Impacket’s SMBexec tool to execute commands remotely over SMB, allowing lateral movement and post-exploitation activities within Windows environments by leveraging valid credentials. |
