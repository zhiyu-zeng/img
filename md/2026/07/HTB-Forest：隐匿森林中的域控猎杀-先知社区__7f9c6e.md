---
title: HTB-Forest：隐匿森林中的域控猎杀-先知社区
source: https://xz.aliyun.com/news/92556
source_host: xz.aliyun.com
clip_date: 2026-07-27T16:34:45+08:00
trace_id: 7c6627d7-e48c-411d-b37d-0cded06ebd8d
content_hash: 7ee95ad87a537ec7c819ed851b1b33f121ecb498417e66f1b9f79240b6cca40a
status: synced
tags: []
series: null
feed_source: 先知安全技术社区
ai_summary: null
ai_summary_style: null
images_status:
  total: 11
  succeeded: 1
  failed_urls:
    - https://xz.aliyun.com/api/v2/files/ea269f8f-e458-3b7d-a98b-ad7a293025f0
    - https://xz.aliyun.com/api/v2/files/babe1b9b-f8de-3fe1-8e52-021feda0cec1
    - https://xz.aliyun.com/api/v2/files/2511ce5a-9e1f-35c2-9fdf-23acacef44de
    - https://xz.aliyun.com/api/v2/files/8bb52e79-aa4a-347c-ad63-dbac8655b234
    - https://xz.aliyun.com/api/v2/files/ca8e8c59-34d1-382a-857a-1d3d3d0fbaf8
    - https://xz.aliyun.com/api/v2/files/210cbc58-7720-3b79-9a42-75261b519994
    - https://xz.aliyun.com/api/v2/files/87eb66bc-5f2b-30ec-8c82-2deb4c312dd5
    - https://xz.aliyun.com/api/v2/files/cd98811e-9212-3451-bbf2-8e64b4faba35
    - https://xz.aliyun.com/api/v2/files/743d042e-ba40-319f-b744-b3ae53168c91
    - https://xz.aliyun.com/api/v2/files/faedc33d-ed95-340a-bb20-fa3274ffa94c
notion_page_id: 3aa75244-d011-81bc-bb65-cc7f12a37960
ioc: null
---

![file-20260719162637370.png](⚠️ https://xz.aliyun.com/api/v2/files/ea269f8f-e458-3b7d-a98b-ad7a293025f0)

一、Nmap

TCP 全端口扫描：

$ sudo nmap -sS -p- -Pn -n -T4 --min-rate 5000 10.129.32.228 -oA tcp_ports

Starting Nmap 7.95 ( https://nmap.org ) at 2026-07-21 03:33 EDT

Nmap scan report for 10.129.32.228

Host is up (0.0067s latency).

Not shown: 65512 closed tcp ports (reset)

PORT STATE SERVICE

53/tcp open domain

88/tcp open kerberos-sec

135/tcp open msrpc

139/tcp open netbios-ssn

389/tcp open ldap

445/tcp open microsoft-ds

464/tcp open kpasswd5

593/tcp open http-rpc-epmap

636/tcp open ldapssl

3268/tcp open globalcatLDAP

3269/tcp open globalcatLDAPssl

5985/tcp open wsman

9389/tcp open adws

47001/tcp open winrm

49664/tcp open unknown

49665/tcp open unknown

49666/tcp open unknown

49668/tcp open unknown

49670/tcp open unknown

49676/tcp open unknown

49677/tcp open unknown

49683/tcp open unknown

49698/tcp open unknown

对开放端口进行详细扫描：

$ sudo nmap -sC -sV --reason -Pn -n -p 53,88,135,139,389,445,464,593,636,3268,3269,5985,9389,47001,49664,49665,49666,49668,49670,49676,49677,49683,49698 10.129.32.228 -oA tcp_ports_detail

Starting Nmap 7.95 ( https://nmap.org ) at 2026-07-21 03:35 EDT

Nmap scan report for 10.129.32.228

Host is up, received user-set (0.0072s latency).

PORT STATE SERVICE REASON VERSION

53/tcp open domain syn-ack ttl 127 Simple DNS Plus

88/tcp open kerberos-sec syn-ack ttl 127 Microsoft Windows Kerberos (server time: 2026-07-21 07:42:13Z)

135/tcp open msrpc syn-ack ttl 127 Microsoft Windows RPC

139/tcp open netbios-ssn syn-ack ttl 127 Microsoft Windows netbios-ssn

389/tcp open ldap syn-ack ttl 127 Microsoft Windows Active Directory LDAP (Domain: htb.local, Site: Default-First-Site-Name)

445/tcp open microsoft-ds syn-ack ttl 127 Windows Server 2016 Standard 14393 microsoft-ds (workgroup: HTB)

464/tcp open kpasswd5? syn-ack ttl 127

593/tcp open ncacn_http syn-ack ttl 127 Microsoft Windows RPC over HTTP 1.0

636/tcp open tcpwrapped syn-ack ttl 127

3268/tcp open ldap syn-ack ttl 127 Microsoft Windows Active Directory LDAP (Domain: htb.local, Site: Default-First-Site-Name)

3269/tcp open tcpwrapped syn-ack ttl 127

5985/tcp open http syn-ack ttl 127 Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)

|\_http-server-header: Microsoft-HTTPAPI/2.0

|\_http-title: Not Found

9389/tcp open mc-nmf syn-ack ttl 127.NET Message Framing

47001/tcp open http syn-ack ttl 127 Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)

|\_http-server-header: Microsoft-HTTPAPI/2.0

|\_http-title: Not Found

49664/tcp open msrpc syn-ack ttl 127 Microsoft Windows RPC

49665/tcp open msrpc syn-ack ttl 127 Microsoft Windows RPC

49666/tcp open msrpc syn-ack ttl 127 Microsoft Windows RPC

49668/tcp open msrpc syn-ack ttl 127 Microsoft Windows RPC

49670/tcp open msrpc syn-ack ttl 127 Microsoft Windows RPC

49676/tcp open ncacn_http syn-ack ttl 127 Microsoft Windows RPC over HTTP 1.0

49677/tcp open msrpc syn-ack ttl 127 Microsoft Windows RPC

49683/tcp open msrpc syn-ack ttl 127 Microsoft Windows RPC

49698/tcp open msrpc syn-ack ttl 127 Microsoft Windows RPC

Service Info: Host: FOREST; OS: Windows; CPE: cpe:/o:microsoft:windows

Host script results:

| smb2-time:

| date: 2026-07-21T07:43:02

|\_ start_date: 2026-07-21T07:37:30

| smb-os-discovery:

| OS: Windows Server 2016 Standard 14393 (Windows Server 2016 Standard 6.3)

| Computer name: FOREST

| NetBIOS computer name: FOREST\\x00

| Domain name: htb.local

| Forest name: htb.local

| FQDN: FOREST.htb.local

|\_ System time: 2026-07-21T00:43:05-07:00

| smb-security-mode:

| account_used: guest

| authentication_level: user

| challenge_response: supported

|\_ message_signing: required

|\_clock-skew: mean: 2h26m50s, deviation: 4h02m31s, median: 6m48s

| smb2-security-mode:

| 3:1:1:

|\_ Message signing enabled and required

Service detection performed. Please report any incorrect results at https://nmap.org/submit/.

Nmap done: 1 IP address (1 host up) scanned in 64.81 seconds

根据端口开放情况，可判断目标为 AD 中的 DC。

扫描结果中出现两个域名：

添加到

hosts

文件中：

SMB 消息签名开启：

这意味着 NTLM Relay 到 SMB 基本失效。

而且，SMB 的访问需要用户级认证，匿名和 Guest 访问会被限制：

验证：

如预期，访问都被拒绝。

二、枚举

我会先尝试 DNS Zone Transfer：

这是多个 DNS 服务器之间复制/同步数据库的机制之一。

但是都失败了。

进行 LDAP 匿名枚举用户：

将结果整理成用户字典文件：

三、AS-REP Roasting

在 kerberos 认证中，如果某账户没有开启预认证，则可正常从 AS 上申请到 TGT。

关于“账户是否关闭了预认证”，可以查看

userAccountControl

属性（UAC）：

信息很多，先提取值：

根据官方文档的表格：

![file-20260721194414148.png](⚠️ https://xz.aliyun.com/api/v2/files/babe1b9b-f8de-3fe1-8e52-021feda0cec1)

账户若不需预认证则需要对 UAC 属性的值加上 4194304。

只需要让备选值和 4194304 进行

异或

操作，若结果：

●

等于 4194304，则包含

DONT_REQ_PREAUTH

●

反之，则不包含

当然，这里肉眼就能看出备选值小于 4194304，因此都是不含

DONT_REQ_PREAUTH

Flag 的。

但是，这并不代表着 AS-REP Roasting 行不通，因为 LDAP Search 的结果取决于当前权限能看到多少。一些无权查看其 UAC 值的账户，尚未知道是否无需预认证。

直接尝试是最好的方法：

svc-alfresco 就是那个无需预认证的账户，查找之前的 LDAP 结果：

只是输出了 DN，并没有输出 UAC 的值（因为匿名查询的权限不够）。

做 AS-REP Roast 的时候，我抓取了流量包，对于开启预认证的账户：

![file-20260721200822947.png](⚠️ https://xz.aliyun.com/api/v2/files/2511ce5a-9e1f-35c2-9fdf-23acacef44de)

AS 会响应“需要预认证”的错误提示。

而对于无需预认证的账户：

![file-20260721201205265.png](⚠️ https://xz.aliyun.com/api/v2/files/8bb52e79-aa4a-347c-ad63-dbac8655b234)

会成功响应 AS-REP。

netexec

就在该响应中，提取了密文信息：

![file-20260721201329865.png](⚠️ https://xz.aliyun.com/api/v2/files/ca8e8c59-34d1-382a-857a-1d3d3d0fbaf8)

这段信息的前 16 个字节，即：

是用于保证信息完整性的 Hash 值，其后面的一大长串是用“用户长期密钥”加密的密文。

更准确的说，加密采用的是长期密钥的其中一把子密钥，并不是长期密钥本身。但为了更方便理解，这里并不讨论这些。感兴趣的朋友可以问问 AI。

本地破解密码的原理我打算用一张图展示：

![file-20260721205550314.png](⚠️ https://xz.aliyun.com/api/v2/files/210cbc58-7720-3b79-9a42-75261b519994)

红色为已知信息。

我打算用

hashcat

进行破解。

Hash 的模式的查找：

通过检索即可锁定模式是 18200。

破解：

得到账密：

四、Evil-WinRM

由于目标开放了 5985 端口，上面运行的是 WinRM 服务，我打算用

evil-winrm

工具获得一个 Shell：

在桌面目录上能找到 User Flag：

查看用户所属于的组：

五、BloodHound

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1cdcf601c4be4ea1.png)

我打算上传采集器（SharpHound）：

采用默认采集模式：

这会生成一个压缩包：

将压缩包下载到攻击机：

将压缩包导入到 BloodHound 当中，并且通过“Shortest paths to Domain Admin”展现图：

![file-20260722092315160.png](⚠️ https://xz.aliyun.com/api/v2/files/87eb66bc-5f2b-30ec-8c82-2deb4c312dd5)

![file-20260722093145565.png](⚠️ https://xz.aliyun.com/api/v2/files/cd98811e-9212-3451-bbf2-8e64b4faba35)

根据图可知，当前用户属于 SERVICE ACCOUNTS 组，该组又属于 PRIVILEGED IT ACCOUNTS ……

用户可以算是 ACCOUNT OPERATORS 的组成员，而该组对 EXCHANGE WINDOWS PERMISSIONS 组有 GenericAll 权限。

点击这条边，即可在右侧出现相关信息。选择“Windows Abuse”可看到相关的利用手段：

![file-20260722093648315.png](⚠️ https://xz.aliyun.com/api/v2/files/743d042e-ba40-319f-b744-b3ae53168c91)

对于某组具备 GenericAll 权限允许你直接修改该组的成员关系。

我可以将当前用户加入该组。BloodHound 推荐的做法是：使用 PowerView 中的 Add-DomainGroupMember 函数。

上传并运行 PowerView：

注意需要采用“打点加载”，这样才能在当前会话中，使用脚本中的函数。

将当前用户添加进 EXCHANGE WINDOWS PERMISSIONS 组：

加入组后，该组对

HTB.LOCAL

域具有 WriteDacl 权限：

![file-20260722100915276.png](⚠️ https://xz.aliyun.com/api/v2/files/faedc33d-ed95-340a-bb20-fa3274ffa94c)

BloodHound 给出的滥用建议是：可以向自己授予

DCSync

权限。

虽然在工具中，DCSync 被作为一种权限（

\-Rights

）来处理，但其实它并不是一种权限，是一种技术。

若攻击者控制的账号拥有以下两个权限：

●

DS-Replication-Get-Changes

：允许复制普通（非机密）属性

●

DS-Replication-Get-Changes-All

：允许复制所有属性（含机密属性）

则可以模拟域控之间的复制行为。

具体来讲，攻击者模拟的 DC 会向真实的 DC 上的 DRSUAPI（Directory Replication Service API，一个 RPC 接口）发起

DsGetNCChanges

操作。真实域控检查调用者是否具备相应的复制权限（上面提到的两个），如果权限足够，就把请求的属性（包括密码哈希（NTLM、LM）、Kerberos 密钥等）返回给攻击者。

在利用前，我再次检查了之前执行的“入组”操作：

发现当前用户已经不在组内了，应该是服务器上存在某种定期清除的操作。

再次入组，并且赋予权限：

我打算用

[

impacket

](https://github.com/fortra/impacket)

中的

secretsdump

来利用 DCSync 完成信息泄露。

当然也可以用 mimikatz 的 dcsync 功能。

通过 NTLM Hash 登入域管账号，在 Desktop 目录能找到 Root Flag：
