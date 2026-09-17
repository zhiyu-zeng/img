---
title: "HTB: Ghostlink | 0xdf hacks stuff"
source: https://0xdf.gitlab.io/2026/09/15/htb-ghostlink.html
source_host: 0xdf.gitlab.io
clip_date: 2026-09-17T10:54:00+08:00
trace_id: 21ec7ec5-fea4-43f4-81ec-b91048765d92
content_hash: c01a7ba48d9b1bb39b0fc5c14ee783515d2791544f3d0e6727a95d2a632af1c8
status: synced
tags: []
series: null
feed_source: 0xdf·HTB/逆向
ai_summary: HTB Ghostlink 靠匿名 MQTT 发现内部站点，串联强制认证中继、任意文件读取与 AD CS 中继，最终拿下整个域。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 2
  failed_urls:
    - https://www.hackthebox.com/badge/image/168546
notion_page_id: 3de75244-d011-8132-b696-de638db6845e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> HTB Ghostlink 靠匿名 MQTT 发现内部站点，串联强制认证中继、任意文件读取与 AD CS 中继，最终拿下整个域。
> 
> - **目标概况：** 全端口扫出 24 个开放 TCP 端口，含典型域控端口加 MQTT 1883 与 VMRDP 2179；域 `ghostlink.htb`、主机名 DC01、Windows Server 2025，SMB 签名强制启用。VMRDP 监听暗示主机上跑 Hyper-V 虚拟机。
> - **MQTT 突破：** 1883 允许匿名连接，`nmap` 的 `mqtt-subscribe` 脚本已直接吐出 `$SYS/brokers/client_status/...` 状态信息；订阅 `+`、`#` 与 `$SYS/`（`#` 通常不覆盖 `$SYS`）可枚举 broker 上流通的全部话题，从而发现外部无法直接访问的内部站点。
> - **中继链起点：** 向 broker 发布被篡改的 health check 消息，诱导主机主动向攻击者发起认证；中继该认证即可进入受限制的文件共享站点。
> - **文件共享站漏洞：** 下载端点未校验路径，形成任意文件读取，据此拿到用户的注册表 hive 与密码数据库，解出凭据后可登录 Gogs 实例。
> - **Gogs 与域控收尾：** Gogs 内容 API 存在符号链接缺陷，可覆盖 Git 配置并在托管它的虚拟机上获得 shell；爆破 Gogs 数据库中的哈希得到域账号，最后把强制来的机器账户认证中继到证书颁发机构，为域控申请证书并 dump 整个域。

[HTB: Ghostlink](https://0xdf.gitlab.io/2026/09/15/htb-ghostlink.html)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/ghostlink-cover.webp)

Ghostlink is built around a fictional threat group running its operations on a Windows domain controller, with a message broker quietly announcing infrastructure I can’t otherwise reach. I’ll subscribe to that broker anonymously to find internal sites, then publish a tampered health check message to coerce the host into authenticating to me. Relaying that authentication gets me into a restricted file sharing site, where an unchecked path in the download endpoint gives arbitrary file read, leading to a user’s registry hive and a password database. Those credentials unlock the Gogs instance, where a symbolic link flaw in the content API lets me overwrite a Git config and get a shell on the virtual machine hosting it. I’ll crack a password hash from the Gogs database to reach a domain account, and finish by relaying coerced machine account authentication to the certificate authority to get a certificate for the domain controller and dump the domain. In Beyond Root, I’ll show why the other certificate services path never had a chance, and reverse engineer the file sharing application.

## Box Info

[![Ghostlink](https://0xdf.gitlab.io/icons/box-ghostlink.webp)](https://hackthebox.com/machines/ghostlink)

[Ghostlink](https://hackthebox.com/machines/ghostlink)

Hard

Release Date 23 Jun 2026

Retire Date 23 Jun 2026

OS ![Windows](https://0xdf.gitlab.io/icons/Windows.webp)

Non-competitive release: no bloods

Creator [ctrlzero](https://app.hackthebox.com/users/168546)

![⚠️ 图片托管失败 · ctrlzero](https://www.hackthebox.com/badge/image/168546)

## Recon

### Initial Scanning

`nmap` finds 24 open TCP ports:

```bash
oxdf@hacky$ sudo nmap -p- --reason --min-rate 10000 10.129.83.229
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-08-24 21:39 UTC
Nmap scan report for 10.129.83.229
Host is up, received echo-reply ttl 127 (0.021s latency).
Not shown: 65511 filtered tcp ports (no-response)
PORT      STATE SERVICE          REASON
53/tcp    open  domain           syn-ack ttl 127
80/tcp    open  http             syn-ack ttl 127
88/tcp    open  kerberos-sec     syn-ack ttl 127
135/tcp   open  msrpc            syn-ack ttl 127
139/tcp   open  netbios-ssn      syn-ack ttl 127
389/tcp   open  ldap             syn-ack ttl 127
445/tcp   open  microsoft-ds     syn-ack ttl 127
464/tcp   open  kpasswd5         syn-ack ttl 127
593/tcp   open  http-rpc-epmap   syn-ack ttl 127
636/tcp   open  ldapssl          syn-ack ttl 127
1883/tcp  open  mqtt             syn-ack ttl 127
2179/tcp  open  vmrdp            syn-ack ttl 127
3268/tcp  open  globalcatLDAP    syn-ack ttl 127
3269/tcp  open  globalcatLDAPssl syn-ack ttl 127
5985/tcp  open  wsman            syn-ack ttl 127
9389/tcp  open  adws             syn-ack ttl 127
49664/tcp open  unknown          syn-ack ttl 127
49677/tcp open  unknown          syn-ack ttl 127
49678/tcp open  unknown          syn-ack ttl 127
49679/tcp open  unknown          syn-ack ttl 127
49680/tcp open  unknown          syn-ack ttl 127
49904/tcp open  unknown          syn-ack ttl 127
49910/tcp open  unknown          syn-ack ttl 127
59213/tcp open  unknown          syn-ack ttl 127

Nmap done: 1 IP address (1 host up) scanned in 13.33 seconds
oxdf@hacky$ sudo nmap -p 53,80,88,135,139,389,445,464,593,636,1883,2179,3268,3269,5985,9389,49664,49677,49678,49679,49680,49904,49910,59213 -sCV 10.129.83.229
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-08-24 21:44 UTC
Nmap scan report for 10.129.83.229
Host is up (0.021s latency).

PORT      STATE SERVICE       VERSION
53/tcp    open  domain        Simple DNS Plus
80/tcp    open  http          Microsoft IIS httpd 10.0
|_http-title: Ghost Protocol Zero
| http-methods:
|_  Potentially risky methods: TRACE
|_http-server-header: Microsoft-IIS/10.0
88/tcp    open  kerberos-sec  Microsoft Windows Kerberos (server time: 2026-08-25 05:44:24Z)
135/tcp   open  msrpc         Microsoft Windows RPC
139/tcp   open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp   open  ldap          Microsoft Windows Active Directory LDAP (Domain: ghostlink.htb0., Site: Default-First-Site-Name)
| ssl-cert: Subject: commonName=dc01.ghostlink.htb
| Subject Alternative Name: othername: 1.3.6.1.4.1.311.25.1::<unsupported>, DNS:dc01.ghostlink.htb
| Not valid before: 2026-03-03T16:53:53
|_Not valid after:  2027-03-03T16:53:53
|_ssl-date: TLS randomness does not represent time
445/tcp   open  microsoft-ds?
464/tcp   open  kpasswd5?
593/tcp   open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
636/tcp   open  ssl/ldap      Microsoft Windows Active Directory LDAP (Domain: ghostlink.htb0., Site: Default-First-Site-Name)
| ssl-cert: Subject: commonName=dc01.ghostlink.htb
| Subject Alternative Name: othername: 1.3.6.1.4.1.311.25.1::<unsupported>, DNS:dc01.ghostlink.htb
| Not valid before: 2026-03-03T16:53:53
|_Not valid after:  2027-03-03T16:53:53
|_ssl-date: TLS randomness does not represent time
1883/tcp  open  mqtt
| mqtt-subscribe:
|   Topics and their most recent payloads:
|     $SYS/brokers/client_status/mqttui-3a97c5cc: {"status":"online", "username":"(null)", "ts":1787636726019,"proto_name":"MQTT","keepalive":60,"return_code":"0","proto_ver":4,"client_id":"mqttui-3a97c5cc","clean_start":1, "IPv4":"127.0.0.1"}
|     $SYS/brokers/client_status/mqttui-7e93c4ef: {"status":"offline", "username":"(null)","ts":1787636721809,"reason_code":"0","client_id":"mqttui-7e93c4ef","IPv4":"127.0.0.1"}
|     $SYS/brokers/client_status/mqttui-36b02615: {"status":"offline", "username":"(null)","ts":1787636719682,"reason_code":"0","client_id":"mqttui-36b02615","IPv4":"127.0.0.1"}
|_    $SYS/brokers/client_status/mqttui-72e9dc37: {"status":"offline", "username":"(null)","ts":1787636723906,"reason_code":"0","client_id":"mqttui-72e9dc37","IPv4":"127.0.0.1"}
2179/tcp  open  vmrdp?
3268/tcp  open  ldap          Microsoft Windows Active Directory LDAP (Domain: ghostlink.htb0., Site: Default-First-Site-Name)
| ssl-cert: Subject: commonName=dc01.ghostlink.htb
| Subject Alternative Name: othername: 1.3.6.1.4.1.311.25.1::<unsupported>, DNS:dc01.ghostlink.htb
| Not valid before: 2026-03-03T16:53:53
|_Not valid after:  2027-03-03T16:53:53
|_ssl-date: TLS randomness does not represent time
3269/tcp  open  ssl/ldap      Microsoft Windows Active Directory LDAP (Domain: ghostlink.htb0., Site: Default-First-Site-Name)
| ssl-cert: Subject: commonName=dc01.ghostlink.htb
| Subject Alternative Name: othername: 1.3.6.1.4.1.311.25.1::<unsupported>, DNS:dc01.ghostlink.htb
| Not valid before: 2026-03-03T16:53:53
|_Not valid after:  2027-03-03T16:53:53
|_ssl-date: TLS randomness does not represent time
5985/tcp  open  http          Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
|_http-title: Not Found
|_http-server-header: Microsoft-HTTPAPI/2.0
9389/tcp  open  mc-nmf        .NET Message Framing
49664/tcp open  msrpc         Microsoft Windows RPC
49677/tcp open  msrpc         Microsoft Windows RPC
49678/tcp open  msrpc         Microsoft Windows RPC
49679/tcp open  msrpc         Microsoft Windows RPC
49680/tcp open  msrpc         Microsoft Windows RPC
49904/tcp open  msrpc         Microsoft Windows RPC
49910/tcp open  msrpc         Microsoft Windows RPC
59213/tcp open  msrpc         Microsoft Windows RPC
Service Info: Host: DC01; OS: Windows; CPE: cpe:/o:microsoft:windows

Host script results:
|_clock-skew: 7h59m59s
| smb2-time:
|   date: 2026-08-25T05:45:22
|_  start_date: N/A
| smb2-security-mode:
|   3:1:1:
|_    Message signing enabled and required

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 102.00 seconds
```

The box shows many of the ports associated with a [Windows Domain Controller](https://0xdf.gitlab.io/cheatsheets/os#windows-domain-controller). The domain is `ghostlink.htb`, and the hostname is `DC01`.

I’ll use `netexec` to make a `hosts` file entry and put it at the top of my `/etc/hosts` file:

```bash
oxdf@hacky$ netexec smb 10.129.83.229 --generate-hosts-file hosts
SMB         10.129.83.229    445    DC01             [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:ghostlink.htb) (signing:True) (SMBv1:False) (Null Auth:True) (DC:True)
oxdf@hacky$ cat hosts /etc/hosts | sudo sponge /etc/hosts
oxdf@hacky$ head -1 /etc/hosts
10.129.83.229     DC01.ghostlink.htb ghostlink.htb DC01
```

All of the ports show a TTL of 127, which matches the [expected TTL](https://0xdf.gitlab.io/cheatsheets/os#os-identification) for Windows one hop away. IIS could be proxying to other servers behind it. When it does this, it typically terminates the connection between my VM and it, and uses a new connection to read from the other server, so the TTL doesn’t change.

`nmap` notes a clock skew, so I’ll want to make sure to run `sudo ntpdate DC01.ghostlink.htb` before any actions that use Kerberos auth.

In addition to typical DC ports, MQTT (1883) is also listening, and the script output shows that there’s information available unauthenticated. VM RDP (2179) is also listening, suggesting that there will be Hyper-V VMs running.

### Website - TCP 80

#### Site

The website belongs to a group calling itself “Ghost Protocol Zero”. It has some 3D graphics with neon colors and motion:

![image-20260824180123555](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/66cf88ced70f0899.png)

![image-20260824180134063](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2b4e96d04dd38af2.png)

 ![image-20260824180134063](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260824180134063.webp)![image-20260824180123555](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260824180123555.webp)

#### Tech Stack

The HTTP response headers show just IIS:

```yaml
HTTP/1.1 200 OK
Content-Type: text/html
Last-Modified: Thu, 26 Feb 2026 20:18:12 GMT
Accept-Ranges: bytes
ETag: "36a06185da7dc1:0"
Server: Microsoft-IIS/10.0
Date: Tue, 25 Aug 2026 05:59:11 GMT
Content-Length: 682
```

I’m not able to guess a static page name for the site (such as `index.html`).

The 404 returns an HTTP response with no body:

```
HTTP/1.1 404 Not Found
Server: Microsoft-IIS/10.0
Date: Tue, 25 Aug 2026 06:02:52 GMT
Content-Length: 0
```

The page source is just loading a full screen `.mp4` video with embedded CSS:

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<title>Ghost Protocol Zero</title>
<style type="text/css">
<!--
body {
    color:#000000;
    background-color:#050D0D;
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
<div id="container" align="center">
<video width="100%" autoplay loop muted>
  <source src="landing.mp4" type="video/mp4" />
</video>
</div>
</body>
</html>
```

#### Directory Brute Force

I’ll run `feroxbuster` against the site:

```sql
oxdf@hacky$ feroxbuster -u http://ghostlink.htb
                                                                                                                                       
 ___  ___  __   __     __      __         __   ___
|__  |__  |__) |__) | /  `    /  \ \_/ | |  \ |__
|    |___ |  \ |  \ | \__,    \__/ / \ | |__/ |___
by Ben "epi" Risher 🤓                 ver: 2.11.0
───────────────────────────┬──────────────────────
 🎯  Target Url            │ http://ghostlink.htb
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
404      GET        0l        0w        0c Auto-filtering found 404-like response and created new filter; toggle off with --dont-filter
200      GET       34l       59w      682c http://ghostlink.htb/
400      GET        6l       26w      324c http://ghostlink.htb/error%1F_log
[####################] - 14s    30004/30004   0s      found:2       errors:0      
[####################] - 13s    30000/30000   2310/s  http://ghostlink.htb/
```

Nothing at all.

### SMB - TCP 445

`netexec` shows that the host is running Windows Server 2025, with SMB signing enabled:

```sql
oxdf@hacky$ netexec smb DC01.ghostlink.htb
SMB         10.129.83.229    445    DC01             [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:ghostlink.htb) (signing:True) (SMBv1:False) (Null Auth:True) (DC:True)
```

The guest account is disabled:

```css
oxdf@hacky$ netexec smb DC01.ghostlink.htb -u guest -p ''
SMB         10.129.83.229    445    DC01             [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:ghostlink.htb) (signing:True) (SMBv1:False) (Null Auth:True) (DC:True)
SMB         10.129.83.229    445    DC01             [-] ghostlink.htb\guest: STATUS_ACCOUNT_DISABLED
```

And null auth doesn’t work:

```sql
oxdf@hacky$ netexec smb DC01.ghostlink.htb -u oxdf -p oxdf --shares
SMB         10.129.83.229    445    DC01             [*] Windows 11 / Server 2025 Build 26100 x64 (name:DC01) (domain:ghostlink.htb) (signing:True) (SMBv1:False) (Null Auth:True) (DC:True)
SMB         10.129.83.229    445    DC01             [-] ghostlink.htb\oxdf:oxdf STATUS_LOGON_FAILURE
```

I’ll have to check back when I have creds.

### MQTT - TCP 1883

#### Background

[MQTT](https://mqtt.org/) is a lightweight pub/sub messaging protocol common in IoT / ICS environments. Clients connect to a broker and either publish messages to a topic or subscribe to topics to receive them. Subscriptions support two wildcards:

-   `+` matches exactly one level
-   `#` matches everything from that point down, so subscribing to `#` is “give me everything”

Brokers also expose a `$SYS/` tree with statistics about the broker itself. On many brokers `$SYS` is not matched by `#`, so it’s worth subscribing to both.

Some brokers allow anonymous connections, and in that case, subscribing to `#` dumps whatever the environment is talking about.

I’ve hacked MQTT before in [Santa Vision](https://0xdf.gitlab.io/holidayhack2024/act-iii/santavision) from the 2024 Holiday Hack and [HTB PlayerTwo](https://0xdf.gitlab.io/2020/06/27/htb-playertwo.html#mqtt).

#### Tooling

I’ll install the reference client from `mosquitto` with `sudo apt install mosquitto-clients`, adding the `mosquitto_sub` and `mosquitto_pub` binaries to my path. `nmap` ’s `mqtt-subscribe` NSE script does a smaller version of the same thing, and it already showed in the `-sCV` scan above that anonymous connections work.
