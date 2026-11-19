---
title: Introduction
source: https://karansaini.com/embridge/
source_host: karansaini.com
clip_date: 2026-11-19T08:28:06+08:00
trace_id: 05b6930b-4ebf-4d3b-b0b9-9b0deb3872e8
content_hash: 128581a7848c02e8265a3cf30336a4e021b7c646d17821c2267fd7fd27f2a766
status: synced
tags: []
series: null
feed_source: Karan Saini·Android/漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41d75244-d011-8103-afe4-f9415f263b69
ioc:
  cves:
    - CVE-2026-125659
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

This short blog post describes a vulnerability in emBridge (eMudhra Ltd.) versions 5.9.1.x to 5.9.3.x for Windows, which lets any local process, or a web page served from the LAN, enumerate the file system with LocalSystem privileges. This vulnerability is tracked as [CVE-2026-125659](https://www.cve.org/CVERecord?id=CVE-2026-125659).

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c9424c984fcff992.png)

I wasn’t planning to write about this flaw since it is quite trivial. However, eMudhra has published an [advisory](https://web.archive.org/web/20261113124325/https://emudhra.com/en/post/cve-2026-125659) for it which frames the issue in a questionable manner, so I am documenting it for posterity.

I first teased this vulnerability on Twitter. If you haven’t seen it, you can [click here](https://x.com/squeal/status/2116168531477983286) or watch the video below.

## What is emBridge?

emBridge is eMudhra’s client-side signing helper, used to sign with DSC tokens from the browser on Indian government and enterprise portals. On Windows, the package installs as a service named `emBridge`, which starts automatically, runs as **LocalSystem**, and serves an HTTPS REST API on ports `26769` and `26770`. The testing described below was done on emBridge for Windows 5.9.1.0.

While I only tested Windows, as per eMudhra’s own advisory, the issue also affects the following macOS and Linux builds:

-   macOS (x64): 3.2.4.x to 3.2.6.x
-   Ubuntu (x64): 3.2.0.x to 3.3.0.x
-   Red Hat (x64): 3.2.0.x to 3.3.0.x

## The issue

The API does not have authentication. Instead, requests are wrapped in an “encrypted” envelope:

```json
{"encryptedRequest": "<base64>", "encryptionKeyId": "<32 hex>"}
```

The AES key used for encryption is derived from the client-supplied `encryptionKeyId`, which is looked up in a hardcoded dictionary of 10,001 keyId-to-passphrase pairs (`emBridge.Utility.EncryptionHelper.encryptionDictionary`) inside the emBridge binary, which is [ConfuserEx](https://github.com/yck1509/ConfuserEx) -obfuscated.

Since the dictionary is compiled into the product, anyone with a copy of the installer can extract it and build a valid request. Using a keyId from the 5.9.1.0 binary, I built envelopes for the `ListToken`, `ListAllCert` and `GenrateCSR` endpoints, and the service accepted them. The same keyId also appears in my emBridge logs from September 2024 through November 2026.

The API sets `Access-Control-Allow-Origin: *` on all of its responses, which allows pages from any origin to read them. The installer also writes `127.0.0.1 localhost.emudhra.com` to the hosts file and adds a locally generated CA (`CN=eMudhra Local CA`) to the machine and user Root stores. At least on Windows, this means the browser trusts `https://localhost.emudhra.com:26769` without a warning.

Among the exposed controllers is `FileBrowserController`, with two actions: `GetDrives` and `GetContent(String BasePath)`. The service runs as LocalSystem, so these actions can list directories that require elevated privileges.

## Non-admin to LocalSystem

On a standard (non-administrator) account:

```
Get-ChildItem C:\Windows\System32\config                 -> UnauthorizedAccessException
GET /FileBrowser/GetContent?BasePath=C:\Windows\System32\config      -> lists Journal

Get-ChildItem C:\ProgramData\Microsoft\Windows\SystemData -> UnauthorizedAccessException
GET /FileBrowser/GetContent?BasePath=C:\ProgramData\Microsoft\Windows\SystemData -> lists S-1-5-18
```

The operating system denies the user, but the emBridge API returns the listing without a hitch. Any local process, regardless of privilege, can enumerate ACL-protected paths through the service.

## From a web page

Because of the wildcard CORS header, a web page can abuse the same behaviour. I served a page from a second machine on my LAN (`http://192.168.29.177`) and opened it in Firefox on the target (`192.168.29.33`). Without any prompt for local network access, the page read `/DSC/Version`, `/FileBrowser/GetDrives`, `/FileBrowser/GetContent` (`C:\Users`) and `/DSCClient/ListProviders`, and a recursive walk of every drive (file names and sizes) streamed back to the attacker host.

A LAN peer hitting `https://<target-ip>:26769` directly is blocked by Windows Firewall by default, even though the emBridge service listener is bound to `0.0.0.0`. A page served from the public internet is blocked by the browser’s Local Network Access (LNA) restrictions. The only route to exploitation is via a page on the LAN.

## The advisory

eMudhra rates the issue Low impact and Low risk, describes it as “reconnaissance-grade metadata only”, and states that exploitation requires all of the following:

> -   “An affected version of emBridge is running on the user’s computer.
> -   An attacker hosts a malicious web page on the same local network as the user.
> -   The user opens that page.
> -   The user’s browser does not enforce Local Network Access restrictions.”

I don’t fully agree about directory structures and file names being “non-sensitive metadata” (they can give away quite a lot of information in some circumstances), but let’s move on. The fourth condition they describe (i.e., “the user’s browser does not enforce Local Network Access restrictions”) is met by-default in the scenario they describe in the second condition.

## Local Network Access restrictions

LNA classifies requests by the address space of the page and of the target. A page served from a LAN address is a *local* origin; `localhost.emudhra.com` resolves to `127.0.0.1`, which is a *loopback* target. At present, browsers do not gate local-to-loopback requests. The [WICG LNA specification](https://wicg.github.io/local-network-access/) notes that “Chromium only implements Local Network Access restrictions for public to local or loopback requests, and does not enforce the permission for cross-origin local requests.” Microsoft’s documentation for Edge states that “LNA restrictions don’t yet apply to local->local or local->loopback requests.”

Therefore, “a browser that does not enforce LNA” is – for a LAN-hosted page, which is a stated precondition for the attack – any current build of Chrome, Firefox, or Edge, with default configuration. I also verified this independently instead of relying solely on documentation.

| Attacker origin | Chrome | Firefox |
| --- | --- | --- |
| HTTP, private LAN IP -> loopback | allowed, no prompt | allowed, no prompt |
| HTTPS, private LAN IP -> loopback | allowed, no prompt | allowed, no prompt |
| Public origin -> loopback | blocked (LNA) | blocked (LNA) |

LNA only blocks a page served from the public internet, which is not the attack described above, nor the one described in eMudhra’s advisory. Chromium does intend to enforce LNA for local-to-loopback requests at some point ([WICG/local-network-access#17](https://github.com/WICG/local-network-access/issues/17)), but no current version of Chrome or Edge does this.

I agree that the scope of this issue is narrow. The attacker needs to serve a page on the victim’s LAN, and the victim needs to open it. However, the advisory disingenuously tries to narrow the scope further by listing LNA as a precondition, implying that in order for the attack to work, the victim would have had to **1.** disable an enabled-by-default browser protection, *or* **2.** use an insecure browser.

The advisory also does not mention the non-browser path. A local, unprivileged process can list privileged paths through the service without a browser or a LAN page being involved.

As an aside: the eMudhra advisory, for some reason, does not credit me, while [CERT-In’s vulnerability note](https://www.cert-in.org.in/s2cMainServlet?pageid=PUBVLNOTES01&VLCODE=CIVN-2026-0549) and the [CVE listing](https://www.cve.org/CVERecord?id=CVE-2026-125659) do.

## robots.txt

Another curiosity is that eMudhra’s [robots.txt](https://web.archive.org/web/20261113124155/https://emudhra.com/robots.txt) contains a `Disallow:` entry for the advisory, which was published on 11 November 2026:

![emudhra.com/robots.txt, with a Disallow entry for the CVE-2026-125659 advisory](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/04cf07b359a6eca0.png) *emudhra.com/robots.txt as of 13 November 2026.*

This entry tells search engines not to crawl the advisory, making it unlikely to turn up when someone searches for the CVE or for emBridge. It is also the only post on the site which has been singled out this way. The rest of the list is admin, author, preview, preference and 404 pages. I thought this exclusion was worth a mention.:-)

## Remediation

The `FileBrowser` endpoints `GetDrives` and `GetContent` have been removed in emBridge 5.9.4 for Windows, 3.2.7 for macOS, and 3.3.1 for Ubuntu and Red Hat. It is unclear why these endpoints were ever present to begin with, but you should update emBridge if you have it installed.

The code used for the Proof of Concept video is available [here](https://gist.github.com/qurbat/65e9e0aba7e4f17c42317bc5f7e74846).

## Disclosure timeline

-   30 Oct 2026 — Reported to eMudhra via CERT-In
-   04 Nov 2026 — eMudhra acknowledged the report via CERT-In
-   06 Nov 2026 — CERT-In relayed that the issue was fixed in emBridge 5.9.4
-   11 Nov 2026 — eMudhra published its advisory for CVE-2026-125659
-   13 Nov 2026 — CERT-In published vulnerability note CIVN-2026-0549
-   13 Nov 2026 — Public disclosure
