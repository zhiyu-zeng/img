---
title: "MythicRatatoskr: An Yggdrasil-enabled backdoor deployed in a UAC‑0099-Sandworm collaboration"
source: https://www.welivesecurity.com/en/eset-research/mythicratatoskr-yggdrasil-enabled-backdoor-deployed-uac0099-sandworm-collaboration/
source_host: www.welivesecurity.com
clip_date: 2026-10-23T22:28:54+08:00
trace_id: 092b319f-d011-4e34-8608-bbd2674df220
content_hash: 9160b8e31660cc58b871cd59e7c4b2c56d5eefbf98885d3775b811ce186cf838
status: synced
tags:
  - 恶意样本
  - 网络工具
series: null
feed_source: ESET WeLiveSecurity
ai_summary: UAC-0099 攻入乌克兰粮食物流企业后次日投放经 Yggdrasil 网状网通信的后门 MythicRatatoskr，两月后 Sandworm 接手并擦除数据。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40275244-d011-8179-a124-d9a8054d1495
ioc:
  cves: []
  cwes: []
  hashes:
    - 000000000143db657d1d6f80b5066dd109a4cb31f7dc6cb5d56050fffb014217
    - 0000000998b5ff8c0f1115ce9212f772d0427151f50fe858e6de1d22600f1680
    - 0000006149970f245e6cec43664bce203f2514b60a153e194f31e2b229a1339d
    - 01855153ca7a33ad5ff36451de5612dfba0dd2ca
    - 028ca11f3f0d8396043af7bf756231fc2f50f829
    - 09c816697c0c2aff9b4ff58681558ca30d04c9cd
    - 131a371a1e4ee78ec3b2863607c99290ec3b58a6
    - 4e3e6577866e4ce2ed73ca089700ae04230e768f
    - 5636b3af4738c3998284c4805d91209cab38921159c66a6f359f3f692af1c908
    - 69969eeb7e0a3d84c4e70193636fcf934c6aa388
    - 8ceb5f8bcdf4995b7164996f1629d682613bb17b
    - 9085896989947c0919a660352f75f6b233fc645b
    - b69ef0e45b401440c0fde22046775d0c57e87415
    - d5f9288daebf87ae4579945f8dc6cf235b093cfd
    - d7e6a5a46c6ed3510997e91b11e51be0250fd2a2
    - e29af83a07fb32eb47c28733a9382e766d53f704
    - ecbbcb3298e7d3b4196103333c3e839cfe47a6ca47602b94a6d596683f6bb358
    - f91b909f43829f8b20732b3bcf80cbc4bb078dd47b41638379a078e35984c9a4
  domains:
    - 0.ygg.l1qu1d.net
    - bode.theender.net
    - helium.avevad.com
    - ip6.fvm.mywire.org
    - london.sabretruth.org
    - mlupo.duckdns.org
    - s2.i2pd.xyz
    - spain.magicum.net
    - ygg-nl.incognet.io
    - yggdrasil.neilalexander.dev
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> UAC-0099 攻入乌克兰粮食物流企业后次日投放经 Yggdrasil 网状网通信的后门 MythicRatatoskr，两月后 Sandworm 接手并擦除数据。
> 
> - **攻击链：** 2025-07-16 鱼叉邮件附件触发计划任务 pdfopentask 执行 PowerShell，MATCHBOIL 下载器投放 MATCHWOK（C&C 为 uztickets[.]com），次日 09:28 部署 MythicRatatoskr，随后又借 OpenSSH SFTP 扩散至其他主机；9 月 17 日 Sandworm 通过 AD 组策略部署 SDelete 实施数据擦除。
> - **通信方式：** 该 Go 后门基于 yggstack 接入公有 Yggdrasil 网络，内置 32 个公共 peer 地址、每次随机选 3 个连接，向 443 端口的 IPv6 地址 201:b479:…:2838 以 HTTPS+JSON 收发 checkin/tasking/result/getfile 四类消息，默认 5 分钟轮询；Yggdrasil 本身不提供匿名性，封锁公共 peer 可作为缓解手段。
> - **持久化与配置：** 以名为 ieupdate 的 Windows 服务自启；配置文件为 AES-256-CFB 加密的 JSON（密钥硬编码并 base64 解码后使用，前 16 字节为 IV），缺失配置时写入内置默认值；部分样本启动后延迟 10 分钟再联网。
> - **能力与代理：** 支持 shell、ls/cd/pwd、上传下载、全屏截屏、expose 端口转发，以及从 revsocks 移植的反向 SOCKS5 proxy；另部署独立 Go 工具 bindProxy 监听 127.0.0.1:33690，其文件名 krbtman.exe 与后门在多台机器上撞名。
> - **Linux 变体线索：** 配置路径 `%LocalAppData%/Temp/.crond` 带有正斜杠与点前缀隐藏命名，并残留未使用的 /tmp/.test_config 测试路径，暗示存在 Linux 版本；二进制痕迹显示开发始于 2024-12 至 2025-02。

## Executive summary

This report analyzes activity during which UAC‑0099 gained initial access on July 16 th, 2025 and handed it off to Sandworm, which then conducted a data-wiping attack on September 17 th, 2025. It particularly focuses on the MythicRatatoskr backdoor, which is unique in its use of the Yggdrasil mesh network to communicate with a C&C server hosted within it.

We presented our findings about MythicRatatoskr at [LABScon](https://www.labscon.io/) on September 18 th, 2026, and at the [Virus Bulletin conference](https://www.virusbulletin.com/conference/vb2026/programme/) on October 16 th, 2026.

> **Key points of this blogpost:**
> 
> -   On July 16 th, 2025, UAC-0099 gained initial access to a grain logistics company in Ukraine via a spearphishing email with a malicious attachment, leading to the execution chain of the MATCHWOK backdoor.
> -   One day later, the attackers deployed MythicRatatoskr, a previously undocumented backdoor that communicates with a C&C server hosted inside the Yggdrasil mesh network. We have not seen the backdoor used anywhere else, and we found indications that a Linux variant may also exist.
> -   Yggdrasil is a decentralized mesh network that implements an experimental routing scheme in which the IPv6 communication between the nodes is end-to-end protected.
> -   Ultimately, UAC-0099 handed off access to Sandworm, which then carried out a data-wiping attack.

## Cooperation among Russia-aligned actors

The handover documented in this report is not an isolated phenomenon. As noted above, Sandworm is attributed to GRU Unit 74455, and UAC-0099’s targeting leads us to assess that it is aligned with Russian interests.

Earlier in 2025, we uncovered that Russia-aligned Gamaredon collaborated with Turla, another Russia-aligned threat actor; we documented our findings in our blogpost [Gamaredon X Turla collab](https://www.welivesecurity.com/en/eset-research/gamaredon-x-turla-collab/). Both groups are linked to the Federal Security Service of the Russian Federation (FSB). This kind of cooperation underscores the potential for coordinated cyberespionage campaigns among Russia-aligned groups, likely intended to amplify their operational impact. In the past, Gamaredon [collaborated](https://www.welivesecurity.com/2020/06/18/digging-up-invisimole-hidden-arsenal/) with a threat actor that we discovered and named InvisiMole. Against that backdrop, a UAC‑0099-to-Sandworm handoff is unusual in the specific actors involved, but no longer surprising as a pattern.

## Overview of the intrusion

According to ESET telemetry, the events unfolded as follows: at 06:59 on July 16 th, 2025, a scheduled task named pdfopentask was executed on one machine in the target organization. It executed a PowerShell payload from %temp%\\temporarydoc.txt.

A minute later, MATCHBOIL was deployed. MATCHBOIL is a downloader that deployed, in this case, the MATCHWOK backdoor (C&C: https://uztickets\[.\]com) from https://egyptanimals\[.\]com/animals/photoalbum. The following day, at 09:28, a new binary was delivered to the machine: the MythicRatatoskr backdoor. Due to the close proximity of time, we believe with high confidence that the MATCHWOK execution chain led to the deployment of MythicRatatoskr. Our telemetry further shows that additional MythicRatatoskr samples were subsequently deployed to other machines within the organization, this time using an OpenSSH SFTP server.

Later, ESET telemetry detected a SOCKS5 server on some of the machines, with one sample having been extracted from an unknown archive using WinRAR. We believe that the SOCKS5 server was deployed using MythicRatatoskr.

Approximately two months later, on September 17 th, 2025, we detected data-wiping activity at the compromised grain logistics company. The data-wiping attack was executed by deploying the SDelete utility via Active Directory Group Policy – standard Sandworm tactics, techniques, and procedures (TTPs) that we have observed numerous times in ESET telemetry.

Therefore, we assess that UAC‑0099 can act as an initial access group for Sandworm.

This blogpost focuses primarily on the analysis of the MythicRatatoskr backdoor, the Yggdrasil network that hosts its C&C server, and the accompanying SOCKS5 server. The first versions of MATCHBOIL and MATCHWOK have already been analyzed by CERT‑UA in its [advisory](https://cert.gov.ua/article/6284949), with MATCHBOIL and its evolution further covered in our blogpost [MATCHBOIL: New tricks, same old evil intentions](https://www.welivesecurity.com/en/eset-research/matchboil-new-tricks-same-old-evil-intentions/). These tools are therefore omitted here.

![MATCHBOIL: New tricks, same old evil intentions](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c2dd9db0588945eb.png)

![MATCHBOIL: New tricks, same old evil intentions](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a492b51c8756e963.png)

## A squirrel in the world tree

The word Yggdrasil originates in Norse mythology, where it refers to a sacred tree connecting the various realms of the cosmos. Within that tree lives a squirrel named Ratatoskr that carries messages between its top and its roots. Given the backdoor’s role as a messenger scurrying through the Yggdrasil network, we decided to name the backdoor MythicRatatoskr.

More technically, Yggdrasil is a decentralized mesh network that connects devices directly to each other without a central hub, building an encrypted IPv6 overlay on top of the internet so that participating nodes can exchange end-to-end-protected traffic. Legitimate users adopt such meshes for resilient connectivity, research, and hobby networking. Because no single server runs the mesh, the network is robust and hard to disrupt – properties that also make it attractive to adversaries. Importantly, Yggdrasil is not designed to provide anonymity.

## Attribution

The post-compromise execution chain relied on known malware already attributed to UAC‑0099 – namely the MATCHBOIL downloader and the MATCHWOK backdoor – which leads us to attribute this stage of the attack to UAC‑0099 with high confidence. We attribute the data-wiping activity observed two months later to Sandworm, also with high confidence, based on the TTPs involved.

Moreover, we assess with high confidence that UAC‑0099 handed off access to Sandworm at some point during the intrusion, although we have not yet been able to determine whether the MythicRatatoskr backdoor was operated primarily by UAC‑0099 or by Sandworm.

## UAC‑0099 profile

UAC‑0099 is a cyberespionage group targeting governmental organizations, financial institutions, and media, all in Ukraine. Based on the targeting, we believe with medium confidence that the group is aligned with Russian interests. UAC‑0099 can act as an initial access broker for [Sandworm](https://www.welivesecurity.com/2022/03/21/sandworm-tale-disruption-told-anew/), a Russia-aligned group best known for its destructive attacks in Ukraine.

The group has been active since at least 2022 and was first reported by [CERT‑UA](https://cert.gov.ua/article/4818341) in June 2023. Apart from MATCHBOIL, the group also typically deploys LONEPAGE, a PowerShell downloader named after the presence of the word page in its C&C URLs.

## Sandworm profile

Sandworm is a Russia-aligned threat group that performs destructive attacks. It is mostly known for attacks against Ukrainian energy companies in December 2015 and December 2016, which resulted in power outages. In June 2017 Sandworm launched the NotPetya data-wiping attack that used a supply-chain vector by compromising the Ukrainian accounting software M.E.Doc. In February 2018, Sandworm launched the Olympic Destroyer data-wiping attack against organizers of the 2018 Winter Olympics in Pyeongchang.

The Sandworm group uses such advanced malware as [Industroyer](https://www.welivesecurity.com/2017/06/12/industroyer-biggest-threat-industrial-control-systems-since-stuxnet/), which is able to communicate with equipment at energy companies via industrial control protocols. In April 2022, CERT‑UA thwarted an attack against an energy company in Ukraine where the Sandworm group tried to deploy a new variant of this malware, [Industroyer2](https://www.welivesecurity.com/2022/04/12/industroyer2-industroyer-reloaded/).

Since February 2022, Sandworm has been very active in Ukraine, by deploying data wipers against strategic organizations.

In October 2020, the US Department of Justice published an [indictment](https://www.justice.gov/opa/pr/six-russian-gru-officers-charged-connection-worldwide-deployment-destructive-malware-and) against six Russian computer hackers that it alleges prepared and conducted various Sandworm attacks. As we already mentioned, the group is commonly attributed to GRU’s Unit 74455.

## Compromise chain

### Initial access and execution

According to ESET telemetry, initial access was gained via a spearphishing email with a malicious attachment – a finding that matches [CERT‑UA](https://cert.gov.ua/article/6284949) blogpost. We assess that the MATCHWOK backdoor execution chain (already documented in the CERT‑UA blogpost) then led to the execution of MythicRatatoskr, a backdoor that communicates with its C&C server over the Yggdrasil network. Subsequently, the attackers probably used MythicRatatoskr to deliver a SOCKS5 server.

### Persistence

MATCHBOIL persists MATCHWOK by adding the registry value UpdateMonitor to the registry key HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\, with data pointing to the dropped MATCHWOK path.

MythicRatatoskr is started as a Windows service with the name ieupdate.

### Collection and exfiltration

During check-in, MythicRatatoskr sends information about the current user, hostname, and local network settings to the C&C server. In addition, the operators can use MythicRatatoskr to exfiltrate files and screenshots to the C&C server by using HTTPS routed through the Yggdrasil mesh network. The data is not staged prior to exfiltration.

## Toolset

### MythicRatatoskr

MythicRatatoskr is a backdoor written in Go that uses the [Yggdrasil network](https://yggdrasil-network.github.io/about.html) (described in the Network protocol section) to reach its C&C server. As noted earlier, we named the backdoor after Ratatoskr, the squirrel from Norse mythology that scurries through Yggdrasil – the sacred tree connecting the realms of the cosmos – carrying messages between its top and its roots. We felt this was a fitting parallel for a backdoor that ferries data across the Yggdrasil network. There are signs in the binaries suggesting that the development started sometime between December 2024 and February 2025.

Function names left in the binaries – following a mix of [mixed caps](https://go.dev/doc/effective_go#mixed-caps) (CheckInAgent) and snake case (agent_run) – suggest either code merged from another project or inconsistent naming by the authors. Key functions handle service registration and Yggdrasil network initialization (main, runService), check-in and beaconing (agent_run, init_agent, CheckInAgent), configuration handling (saveConfig, Encrypt, Decrypt), command polling and dispatch (getTasks, doTask), and the backdoor commands themselves (upload, download, screencat, shell, manageProxy, etc.).

Some samples also include a 10-minute startup delay, likely to avoid immediately connecting to the Yggdrasil network on execution, helping to evade detection.

#### Host-based artifacts

Table 1 presents MythicRatatoskr host-based artifacts that we observed during our analysis. Note the filename collision for krbtman.exe: it is MythicRatatoskr on some machines, and the SOCKS5 server on others.

*Table 1. Host-based artifacts associated with MythicRatatoskr*

| **Name** | **Value** |
| --- | --- |
| Installation paths | C:\\windows\\system32\\updater.exe |
| C:\\Windows\\system32\\krbtman.exe |
| C:\\windows\\system32\\windowsdefendersvc.exe |
| %localappdata%\\Microsoft\\OneDrive\\OneDriveLiveUpdater.exe |
| c:\\program files (x86)\\microsoft.net\\adomd.net\\110\\applicationasphost.exe |
| C:\\OFFICE2010\\Utilities\\Act64.exe |
| %userprofile%\\Downloads\\WindowsDefenderSvc.exe |
| %userprofile%\\Downloads\\ieupdate.exe |
| %userprofile%\\Downloads\\ie.exe |
| %userprofile%\\AppData\\Local\\Internet Explorer\\ieupdate.exe |
| %userprofile%\\AppData\\Local\\ieupdate.exe |
| Configuration paths | C:\\Windows\\Temp\\.updatecache |
| C:\\Windows\\system32\\.updatecache |
| %LocalAppData%/Temp/.crond  <br>**(Analyst note: forward slashes are attackers’ typo)** |
| Service names | ieupdate |

#### Persistence

According to Windows event logs obtained from the compromised machines, updater.exe and WindowsDefenderSvc.exe were started, and thus likely persisted, as Windows services.

#### Network protocol

To communicate with the C&C server, MythicRatatoskr relies on the [Yggdrasil](https://yggdrasil-network.github.io/) network – a decentralized mesh network in an alpha state that implements an experimental routing scheme. Each node in the network generates its own [Ed25519](https://en.wikipedia.org/wiki/EdDSA#Ed25519) key pair, which allows protected end-to-end IPv6 communication between the peers. The IPv6 address is [derived](https://github.com/yggdrasil-network/yggdrasil-go/blob/306c4c624b51490b5a68a7118474f3cdf1e493a1/src/address/address.go#L51) from the public key in the [200::/7 subnet range](https://yggdrasil-network.github.io/faq.html#will-yggdrasil-conflict-with-my-network-routing), which was deprecated by IETF in 2004. Anonymity is not among the goals of the project. We explore this topic more in the *[Network infrastructure](<#Network infrastructure>)* section.

The [yggdrasil-go](https://github.com/yggdrasil-network/yggdrasil-go) repository already provides the necessary types and methods to join the Yggdrasil network. There’s also another project, called [yggstack](https://github.com/yggdrasil-network/yggstack), that enables the Yggdrasil network to communicate via a network stack in the user space. This has the benefit of not needing to create a tunnel interface, which might be an issue if the user does not have the required privileges to create one, or if such an interface is not supported on the system. The MythicRatatoskr code is based on yggstack, making the malware portable.

There’s a publicly available network that one can join by adding at least one [public peer](https://publicpeers.neilalexander.dev/) into the Yggdrasil configuration. MythicRatatoskr specifically contains an embedded base64-encoded blob that contains a list of public peers in the URI format. Most peers on the list are still operational. MythicRatatoskr randomly picks three peers from the hardcoded list, which is the [recommended number](https://github.com/yggdrasil-network/public-peers?tab=readme-ov-file#how-do-i-pick-peers), and connects to them in order to join this public Yggdrasil network.

Once MythicRatatoskr is part of the Yggdrasil network, it communicates with its C&C server, which is also part of the network, via HTTPS on port 443.

Communication uses JSON-encoded HTTP POST requests containing a uuid (explained in Table 4, in the [*MythicRatatoskr main configuration*](<#MythicRatatoskr main configuration>) section), a message type, and optional data. Four message types exist:

1.  checkin – register the backdoor and send victim metadata such as username, hostname, and local IPs; the server responds with a fresh uuid and psk),
2.  tasking – poll for new commands,
3.  result – return command output, base64-encoded when present,
4.  and getfile – retrieve file content for the upload command.

Although the C&C server is hosted in the Yggdrasil network – which may prevent network security tools from detecting outbound connections to it – blocking the public peer addresses is a viable mitigation.

#### Configuration

We distinguish between two types of configuration:

1.  a backdoor-specific configuration used by the malware itself; and
2.  an Yggdrasil configuration used to join the mesh network.

##### MythicRatatoskr main configuration

The MythicRatatoskr configuration is stored in a file at a hardcoded path. The path can differ in each sample; we identified the following paths:

-   C:\\Windows\\Temp\\.updatecache (in krbtman.exe, Act64.exe, ie.exe, ieupdate.exe, and windowsdefendersvc.exe)
-   C:\\Windows\\system32\\.updatecache (in updater.exe, and windowsdefendersvc.exe)
-   %LocalAppData%/Temp/.crond (only in OneDriveLiveUpdater.exe)

The %LocalAppData%/Temp/.crond path is notable, since such a filename (.crond) along with forward slashes is expected for Unix-like systems. This indicates that a Linux variant (or macOS, FreeBSD, etc., though less likely) of MythicRatatoskr may also exist. Moreover, OneDriveLiveUpdater.exe contains an unused configuration path /tmp/.test_config; the filename suggests that this configuration path may have been used during testing and accidentally left in a Windows deployment.

All of the configuration filenames start with a dot. On Unix-like systems, programs used for listing files, such as ls, typically exclude these entries by default, effectively hiding them. This is not the case on Windows, where these files are not hidden. This further suggests the existence of a Linux variant.

The backdoor-specific configuration stored on disk is a JSON file encrypted via AES‑256‑CFB using a hardcoded key embedded in the binary, US3pM9KFxrZBSgc1pGl2wO4Kir1XjZP5Z9kBXBMYd2s=, which is decoded using base64 before being used. The first 16 bytes of the file represent the IV.

The configuration file is not required for the malware to start. MythicRatatoskr contains an embedded default configuration, which it encrypts and writes to disk during initialization. This allows operators to deploy the malware without a separate configuration file and update the configuration later via C&C commands. Backdoor commands are described later in the [*Capabilities*](#Capabilities) section.

Table 2 presents the embedded MythicRatatoskr configuration common for all samples.

*Table 2. Embedded MythicRatatoskr configuration*

| **Field name** | **Default value** | **Description** |
| --- | --- | --- |
| url | https://\[201:b479:2771:8df4:b5eb:d007:63b0\[:\]2838\] | C&C server address in the Yggdrasil network. |
| sleep | 5m  | Delays between check-in attempts and beaconing interval. |
| skew | 10  | Unused. Such values are often used to vary sleep time, but MythicRatatoskr does not use it. |
| uuid | 123 | Unique identifier of the running instance. It is part of each message sent to the C&C server except when doing the check-in.<br><br>The value 123 is just an unused placeholder value that is replaced with the UUID returned by the C&C server during the check-in. A hardcoded UUID d71f1722-cf0b-4e27-9f8e-c95ec9b24a23 is used in the check-in message. |
| psk | US3pM9KFxrZBSgc1pGl2wO4Kir1XjZP5Z9kBXBMYd2s= | Probably intended to be the AES key for the configuration, as it matches the hardcoded key. However, changing this value has no effect on configuration encryption. |
| count | 5   | Probably the maximum number of commands the C&C server should return in a single HTTP request. |

Although not part of the above configuration, MythicRatatoskr contains the following hardcoded C&C address for the proxy command: 201:b479:2771:8df4:b5eb:d007:63b0\[:\]2838:8080. It is not possible to modify the value during runtime.

##### Yggdrasil configuration

Initially, when MythicRatatoskr starts, it [generates](https://github.com/yggdrasil-network/yggdrasil-go/blob/f3c4cdd89ece79ae6696387d8b469c49f567003e/src/config/config.go#L71) a new Yggdrasil configuration, including a new Ed25519 private key. Because the Yggdrasil IPv6 address is derived from the public key, the victim machine’s Yggdrasil IPv6 address changes each time the malware runs.

MythicRatatoskr then uses empty NodeInfo data and sets the NodeInfoPrivacy flag. As a result, other nodes in the Yggdrasil network won’t be able to get more information about the node, such as the Yggdrasil version or the operating system on which the node is running.

The backdoor uses a publicly available Yggdrasil network to reach the C&C server. To join the network, it needs to connect to at least one of the publicly available peers. All MythicRatatoskr samples contain the same embedded list of 32 peers from which three are randomly picked. The peer list is base64 encoded in the binary and was likely compiled by the backdoor authors from [publicly available sources](https://publicpeers.neilalexander.dev/). We provide the *[full peer list](<#List of peers in MythicRatatoskr>)* at the end of the blogpost.

#### Capabilities

MythicRatatoskr supports standard backdoor functionality, including command execution, file system navigation, file transfer, screenshot capture, and proxying. Table 3 contains all of the backdoor commands; the command IDs are strings that are hardcoded in the code.

*Table 3. MythicRatatoskr commands*

| **Command** | **Description** |
| --- | --- |
| chtime | Change the sleep configuration value (see Table 2). |
| expose | Expose a local TCP port (i.e., forward TCP connections from the Yggdrasil network to a local port). |
| upload | Request a file from the C&C server, which is subsequently stored to disk. Specifically, the backdoor sends an HTTP POST request to the C&C server to receive the file content. |
| download | Send a local file to the C&C server. |
| nodeinfo | Return information about the current Yggdrasil node, specifically its IPv6 address, subnet (we expect this to be 200::/7, which is commonly used in the Yggdrasil network), and public key. |
| screenshot | Take screenshots of all active displays. The images are not stored to disk; they are included only in the command result. |
| cd  | Change the current working directory. |
| ls  | List the contents of the current working directory. |
| pwd | Get the current working directory. |
| churl | Change the C&C server URL in the configuration. |
| proxy | Manage a reverse SOCKS5 proxy connection over the Yggdrasil network.<br><br>This command supports two subcommands: start and stop. As the naming implies, it is used to start or stop the proxy connection. It connects to the following hardcoded proxy server:  <br>201:b479:2771:8df4:b5eb:d007:63b0\[:\]2838:8080<br><br>It is the same address as the C&C server, but a different port.<br><br>Once connected, MythicRatatoskr sends the string test.<br><br>Most of the code was copied from existing open-source projects, such as [revsocks](https://github.com/kost/revsocks/blob/a881719cee67941118d802447d60ddbb14d69dd0/rclient.go#L444), as implied by the presence of debug strings like Accepting stream and Passing off to socks5, and the function name connectForSocks. |
| shell | Execute a shell command via cmd.exe. |

Unlike the standalone *[SOCKS5 server](<#SOCKS5 server>)* described below, MythicRatatoskr’s proxy command is used to create a reverse SOCKS5 proxy connection. The standalone tool creates a local SOCKS5 server instead.

### SOCKS5 server

The SOCKS5 server exclusively used by UAC‑0099 or Sandworm during the August 2025 activity is a simple tool written in Go that uses [go-socks5](https://github.com/armon/go-socks5) for managing proxy connections. The tool is internally named bindProxy.

Because MythicRatatoskr already includes SOCKS5 proxy functionality (see Table 3), it is unclear why the attackers deployed a separate SOCKS5 server. It is possible that MythicRatatoskr’s proxy command did not work as expected, so the operators installed this additional tool. Nevertheless, together they support both forward and reverse proxying.

#### Host-based artifacts

Table 4 presents SOCKS5 server host-based artifacts that we observed during our analysis. Again, note the filename collision for krbtman.exe: it is MythicRatatoskr on some machines, and the SOCKS5 server on others.

*Table 4. Host-based artifacts associated with the SOCKS5 server*

#### Name Value Installation paths C:\\Windows\\system32\\krbtman.exe %userprofile%\\Downloads\\krbtman.exe %localappdata%\\SMBCache\\nbtresolver.exe

#### Capabilities

The tool uses [go-socks5](https://github.com/armon/go-socks5) to create a SOCKS5 proxy server that listens on 127.0.0.1, port 33690. The address is specifically used to allow only the local machine to access the service. To make the proxy server reachable from outside the victim’s network, the attackers could have used MythicRatatoskr’s expose command to expose it through the Yggdrasil network. Alternatively, they may have used another existing tunnel to access the machine.

## Network infrastructure

As stated in its [FAQ](https://yggdrasil-network.github.io/faq.html#is-yggdrasil-anonymous), Yggdrasil is not anonymous, so it is possible to locate nodes in the Yggdrasil network. First, we tried to find the C&C server 201:b479:2771:8df4:b5eb:d007:63b0\[:\]2838, which we extracted from the MythicRatatoskr configuration, in the publicly available map of the Yggdrasil network at http://51.15.204.214/ to no avail because the map was last updated on August 8 th, 2024, nearly a year before the intrusion took place.

We therefore generated our own map of the network’s spanning tree, which does include the C&C server, as shown in Figure 1. The C&C server is situated near the center of the tree, making it easily reachable from other peers. The colors of each node indicate how far the node is from the C&C server. For example, as indicated by the red color, the connection from/to the nodes at the edge can be unreliable. The coordinates (Coords) for the C&C are rather simple: the server is reachable via the node with ID 4, which is the root of the spanning tree.

![Figure 1. Yggdrasil map with the C&C server (October 11th, 2025)](https://web-assets.esetstatic.com/wls/2026/10-26/mythicratatoskr/figure-1.png "Figure 1. Yggdrasil map with the C&C server (October 11th, 2025)")

Figure 1. Yggdrasil map with the C&C server (October 11 th, 2025)

Using Yggdrasil’s command line utility [yggdrasilctl](https://github.com/yggdrasil-network/yggdrasil-go/tree/develop/cmd/yggdrasilctl), we identified that the C&C server is configured with three [public peers](https://publicpeers.neilalexander.dev/), shown in Figure 2.

![Figure 2. Yggdrasil map with C&C server’s peers (October 11th, 2025)](https://web-assets.esetstatic.com/wls/2026/10-26/mythicratatoskr/figure-2.png "Figure 2. Yggdrasil map with C&C server’s peers (October 11th, 2025)")

Figure 2. Yggdrasil map with C&C server’s peers (October 11 th, 2025)

The C&C server’s port 443 uses TLS certificates that are rotated regularly. This pattern is characteristic of certificates generated by [revsocks](https://github.com/kost/revsocks/blob/a881719cee67941118d802447d60ddbb14d69dd0/tlshelp.go#L59), on which the server code is probably based.

## Conclusion

In this campaign, we observed cooperation, or at least operational handoff, between two Russia-aligned threat groups with different roles. UAC‑0099 appears to have gained initial access to a Ukrainian logistics company using its known tooling. That access was later used in activity culminating in a destructive Sandworm operation.

In addition, we identified a new backdoor, MythicRatatoskr, which is attributed to either UAC‑0099 or Sandworm. The C&C server for this backdoor is hosted within the Yggdrasil mesh network, and the use of such infrastructure made determining the server’s physical location particularly challenging. The backdoor was probably used to deploy the SOCKS5 server to route connections through the compromised network.

To our knowledge, this is the first documented case of Yggdrasil being abused in this way by a state-aligned threat actor, and it may signal a broader trend of adversaries adopting experimental peer-to-peer networks to increase the resilience and stealth of their infrastructure.

Ultimately, Sandworm carried out a data-wiping attack by deploying the SDelete utility via Active Directory Group Policy, a technique consistent with previous Sandworm destructive operations.

> *For any inquiries about our research published on WeLiveSecurity, please contact us at [threatintel@eset.com](mailto:threatintel@eset.com?utm_source=welivesecurity.com&utm_medium=referral&utm_campaign=autotagging&utm_content=eset-research&utm_term=en).*
> 
> *ESET Research offers private APT intelligence reports and data feeds. For any inquiries about this service, visit the [ESET Threat Intelligence](https://www.eset.com/int/business/services/threat-intelligence/?utm_source=welivesecurity.com&utm_medium=referral&utm_campaign=wls-research&utm_content=mythicratatoskr-yggdrasil-enabled-backdoor-deployed-uac0099-sandworm-collaboration&sfdccampaignid=7011n0000017htTAAQ) page.*

## IoCs

A comprehensive list of indicators of compromise (IoCs) and samples can be found in [our GitHub repository](https://github.com/eset/malware-ioc/tree/master/mythicratatoskr).

### Files

| **SHA‑1** | **Filename** | **Detection** | **Description** |
| --- | --- | --- | --- |
| D5F9288DAEBF87AE4579945F8DC6CF235B093CFD | Act64.exe | WinGo/Agent.ZO | MythicRatatoskr backdoor. |
| B69EF0E45B401440C0FDE22046775D0C57E87415 | ie.exe | WinGo/Agent.ZO | MythicRatatoskr backdoor. |
| 4E3E6577866E4CE2ED73CA089700AE04230E768F | ieupdate.exe | WinGo/Agent.ZO | MythicRatatoskr backdoor. |
| 69969EEB7E0A3D84C4E70193636FCF934C6AA388 | ieupdate.exe | WinGo/Agent.ZO | MythicRatatoskr backdoor. |
| 01855153CA7A33AD5FF36451DE5612DFBA0DD2CA | krbtman.exe | WinGo/Agent.ZO | MythicRatatoskr backdoor. |
| E29AF83A07FB32EB47C28733A9382E766D53F704 | OneDriveLiveUpdater.exe | WinGo/Agent.ZO | MythicRatatoskr backdoor. |
| 028CA11F3F0D8396043AF7BF756231FC2F50F829 | windowsdefendersvc.exe | WinGo/Agent.ZO | MythicRatatoskr backdoor. |
| 9085896989947C0919A660352F75F6B233FC645B | windowsdefendersvc.exe | WinGo/Agent.ZO | MythicRatatoskr backdoor. |
| D7E6A5A46C6ED3510997E91B11E51BE0250FD2A2 | updater.exe | WinGo/Agent.ZO | MythicRatatoskr backdoor. |
| 131A371A1E4EE78EC3B2863607C99290EC3B58A6 | krbtman.exe | WinGo/Agent.AOK | SOCKS5 server. |
| 09C816697C0C2AFF9B4FF58681558CA30D04C9CD | nbtresolver.exe | WinGo/TrojanProxy.Agent.I | SOCKS5 server. |
| 8CEB5F8BCDF4995B7164996F1629D682613BB17B | ieupdate.exe | WinGo/Agent.ZO | MythicRatatoskr backdoor. |

### Network

| **IP** | **Domain** | **Hosting provider** | **First seen** | **Details** |
| --- | --- | --- | --- | --- |
| b479:2771:8df4:b5eb:d007:63b0\[:\]2838 | N/A | N/A | 2025‑07‑17 | MythicRatatoskr C&C server within the Yggdrasil network. |

## MITRE ATT&CK techniques

This table was built using [version 19](https://attack.mitre.org/resources/versions/) of the MITRE ATT&CK framework**.**

| **Tactic** | **ID** | **Name** | **Description** |
| --- | --- | --- | --- |
| **Initial Access** | [T1566.001](https://attack.mitre.org/versions/v19/techniques/T1566/001) | Phishing: Spearphishing Attachment | UAC‑0099 gained initial access by sending spearphishing emails containing a malicious attachment. |
| **Execution** | [T1059.003](https://attack.mitre.org/versions/v19/techniques/T1059/003) | Command and Scripting Interpreter: Windows Command Shell | MythicRatatoskr can execute shell commands using cmd.exe. |
| **Persistence** | [T1543.003](https://attack.mitre.org/versions/v19/techniques/T1543/003) | Create or Modify System Process: Windows Service | MythicRatatoskr persists as a Windows service. |
| **Defense Evasion** | [T1027.013](https://attack.mitre.org/versions/v19/techniques/T1027/013) | Obfuscated Files or Information: Encrypted/Encoded File | The MythicRatatoskr configuration file is encrypted via AES. |
| [T1678](https://attack.mitre.org/versions/v19/techniques/T1678) | Delay Execution | Some MythicRatatoskr samples introduce an initial delay prior to connecting to the C&C server. |
| **Collection** | [T1113](https://attack.mitre.org/versions/v19/techniques/T1113) | Screen Capture | MythicRatatoskr supports a command for taking screenshots. |
| [T1005](https://attack.mitre.org/versions/v19/techniques/T1005) | Data from Local System | Operators can use MythicRatatoskr’s command ls to find files of interest prior to exfiltration. |
| **Command and Control** | [T1090.001](https://attack.mitre.org/versions/v19/techniques/T1090/001) | Proxy: Internal Proxy | The operators deployed the SOCKS5 server to proxy connections in the target network. |
| [T1090.003](https://attack.mitre.org/versions/v19/techniques/T1090/003) | Proxy: Multi-hop Proxy | MythicRatatoskr connects to the C&C server within the Yggdrasil mesh network. |
| [T1573](https://attack.mitre.org/versions/v19/techniques/T1573) | Encrypted Channel | The communication between peers within the Yggdrasil network is end-to-end protected. |
| [T1105](https://attack.mitre.org/versions/v19/techniques/T1105) | Ingress Tool Transfer | The operators probably deployed the SOCKS5 server, likely via MythicRatatoskr. |
| [T1071.001](https://attack.mitre.org/versions/v19/techniques/T1071/001) | Application Layer Protocol: Web Protocols | MythicRatatoskr communicates with the C&C server within the Yggdrasil network using HTTPS. |
| [T1132.001](https://attack.mitre.org/versions/v19/techniques/T1132/001) | Data Encoding: Standard Encoding | The data sent to the C&C server is encoded via base64. |
| **Exfiltration** | [T1041](https://attack.mitre.org/versions/v19/techniques/T1041) | Exfiltration Over C2 Channel | MythicRatatoskr can exfiltrate files to the C&C server. |
| **Impact** | [T1485](https://attack.mitre.org/versions/v19/techniques/T1485/) | Data Destruction | Sandworm carried out data-wiping attack using SDelete. |

## List of peers in MythicRatatoskr

```javascript
tls://37.205.14[.]171:993
tls://109.176.250[.]101:65534
tls://65.21.57[.]122:61995
tls://95.217.35[.]92:1337
tls://51.255.223[.]60:54232
tls://51.15.204[.]214:54321
tls://s2.i2pd[.]xyz:39575
tls://62.210.85[.]80:39575
tls://vpn.ltha[.]de:443?key=0000006149970f245e6cec43664bce203f2514b60a153e194f31e2b229a1339d
tls://mlupo.duckdns[.]org:9001
quic://ip6.fvm.mywire[.]org:443?key=000000000143db657d1d6f80b5066dd109a4cb31f7dc6cb5d56050fffb014217
tls://helium.avevad[.]com:1337
tls://yggdrasil.neilalexander[.]dev:64648?key=ecbbcb3298e7d3b4196103333c3e839cfe47a6ca47602b94a6d596683f6bb358
tls://bode.theender[.]net:42169?key=f91b909f43829f8b20732b3bcf80cbc4bb078dd47b41638379a078e35984c9a4
tls://g.ygg[.]yt:443
tls://b.ygg[.]yt:443
tls://n.ygg[.]yt:443
tls://ygg1.grin[.]hu:42444
tls://[2a03:90c0:85:[:]28a]:443
tls://srl.newsdeef[.]eu:59999
tls://23.137.249[.]65:444
tls://ygg-nl.incognet[.]io:8884
quic://0.ygg.l1qu1d[.]net:11102?key=0000000998b5ff8c0f1115ce9212f772d0427151f50fe858e6de1d22600f1680
tls://london.sabretruth[.]org:18472
tls://yggdrasil.sunsung[.]fun:4443
tls://78.27.153[.]163:33166
tls://193.93.119[.]42:443
tcp://sysop[.]link:555
tls://sto01.yggdrasil.hosted-by.skhron[.]eu:8884
tls://ygg.ace.ctrl-c.liu[.]se:9999?key=5636b3af4738c3998284c4805d91209cab38921159c66a6f359f3f692af1c908
quic://spain.magicum[.]net:36900
tcp://y.zbin[.]eu:7743
```

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/706791cfcddfe0ba.png)](https://www.eset.com/int/business/services/threat-intelligence/?utm_source=welivesecurity.com&utm_medium=referral&utm_campaign=wls-research&utm_content=mythicratatoskr-yggdrasil-enabled-backdoor-deployed-uac0099-sandworm-collaboration&sfdccampaignid=7011n0000017htTAAQ)
