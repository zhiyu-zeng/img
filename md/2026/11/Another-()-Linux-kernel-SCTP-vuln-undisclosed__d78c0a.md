---
title: Another (?) Linux kernel SCTP vuln undisclosed
source: https://seclists.org/oss-sec/2026/q4/781
source_host: seclists.org
clip_date: 2026-11-19T09:35:19+08:00
trace_id: d99cc694-9a55-423f-98c2-85e67c22fb93
content_hash: 30491297e562e049ca0bb70a6b5ec3777714ba523ac432dc808d21ee855f4020
status: synced
tags: []
series: null
feed_source: oss-security·漏洞披露
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8178-a593-cde0ff86f3d4
ioc: null
---

## oss-sec mailing list archives

## Another (?) Linux kernel SCTP vuln undisclosed

* * *

*From*: Rich Felker <dalias () libc org>  
*Date*: Wed, 18 Nov 2026 18:40:50 -0500  

* * *

```swift
The nginx2root thing is not itself a root vuln, but relies on an
undisclosed LPE vuln in the Linux kernel to get root. According to the
vuln website (https://nginx2root.com/),

    "The host-root stage uses a separate Linux SCTP kernel
    vulnerability and must be assessed separately."

    ....

    "The kernel bug is a separate local privilege escalation
    vulnerability and needs its own patch, which will be released in
    the coming weeks."

It's not 100% clear that this is new, but anyone not needing SCTP
should probably block loading of the module via modprobe.d

I'm posting this here because it does not seem to have been announced
outside of the nginx2root website.

```

* * *

### Current thread:

-   **Another (?) Linux kernel SCTP vuln undisclosed** *Rich Felker (Nov 18)*
