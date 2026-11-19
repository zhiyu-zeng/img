---
title: fontconfig 2.18.4 released with security fix
source: https://seclists.org/oss-sec/2026/q4/779
source_host: seclists.org
clip_date: 2026-11-19T09:35:00+08:00
trace_id: d1f70d5f-1bf2-41e8-84b5-fd202549b7f4
content_hash: 82607e75315595637195ffa97b3404d3460f1af56d2ea1e70bf7a6205f3d853e
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
notion_page_id: 41d75244-d011-8119-a1f0-d033c539a795
ioc: null
---

## oss-sec mailing list archives

## fontconfig 2.18.4 released with security fix

* * *

*From*: Alan Coopersmith <alan.coopersmith () oracle com>  
*Date*: Wed, 18 Nov 2026 13:05:59 -0800  

* * *

```rust
I don't see a CVE id assigned for it yet, but
https://gitlab.freedesktop.org/fontconfig/fontconfig/-/releases/2.18.4
identifies the included security fix as:

Fix out-of-bounds access in FcCharSetMerge when merging page 0xffff
https://gitlab.freedesktop.org/fontconfig/fontconfig/-/commit/16aa5c1a372093045ad02736b0ab99e3cfd94f32

which fixes the bug reported as:
https://gitlab.freedesktop.org/fontconfig/fontconfig/-/work_items/577

-------- Forwarded Message --------
Subject:        2.18.4 released
Date:   Wed, 18 Nov 2026 21:57:24 +0900
From:   Akira TAGOH <akira () tagoh org>
To:     fontconfig () lists freedesktop org

Hi,

2.18.4 has been released with some bug fixes and a security fix.
Please check out
https://gitlab.freedesktop.org/fontconfig/fontconfig/-/releases/2.18.4
for more details and the download link.

If there are any issues you found in this release, please submit an
issue to https://gitlab.freedesktop.org/fontconfig/fontconfig/-/work_items/new

Regards,
--
Akira TAGOH

```

* * *

### Current thread:

-   **fontconfig 2.18.4 released with security fix** *Alan Coopersmith (Nov 18)*
