---
title: search
source: https://kb.cert.org/vuls/id/944667
source_host: kb.cert.org
clip_date: 2026-11-19T08:13:38+08:00
trace_id: 8f7a8909-1c4f-44df-bc8b-4a41734ec1f2
content_hash: 9e2f76b8e096de29018749769591e5380f0cfbfc1d30b785ad3fc88a0e43c3ac
status: synced
tags: []
series: null
feed_source: CERT/CC·漏洞公告
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8130-b2c4-c14e3cee1f78
ioc:
  cves:
    - CVE-2026-123790
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

### Overview

ComfyUI-Easy-Use version 1.4.1 and earlier contains a vulnerability in its `save_preview()` handler that allows an unauthenticated attacker to overwrite an installed custom node’s Python file. An attacker who can reach the affected ComfyUI instance over the network can use the overwrite to execute arbitrary code when ComfyUI restarts.

### Description

ComfyUI is a node-based interface for building generative AI workflows. ComfyUI-Easy-Use is an extension that adds custom nodes and workflow utilities.  
An attacker can upload a Python file to ComfyUI’s input directory then use `save_preview()` to copy that file over an installed custom node’s `__init__.py`. Upon restart, ComfyUI will import and execute the modified node. Remote exploitation requires a deployment that exposes the affected routes to the attacker without authentication.

### Impact

An unauthenticated attacker who can reach the affected routes can execute arbitrary Python code and operating system commands with the privileges of the ComfyUI process. The attacker can read or modify models, workflows, and other files accessible to the process and obtain credentials available in its environment. Exploitation requires no user interaction. The reporter confirmed the vulnerability in ComfyUI-Easy-Use version up to verion 1.4.1.

### Solution

Unfortunately, the maintainer of ComfyUI-Easy-Use could not be reached to coordinate this vulnerability. To mitigate the vulnerability, remove the extension or restrict network access to ComfyUI to trusted users. The maintainer have released a fix in main as commit 8a0f2fc412.

### Acknowledgements

Thanks to Nguyen Huy Hoang for reporting this vulnerability. This document was written by Alex Lewis and Michael Bragg.

### Vendor Information

944667

[Expand all](#)

### Unknown

### References

-   [https://github.com/yolain/ComfyUI-Easy-Use/commit/8a0f2fc412c1c6f9109e9392064800a87a706775](https://github.com/yolain/ComfyUI-Easy-Use/commit/8a0f2fc412c1c6f9109e9392064800a87a706775)

### Other Information

|     |     |
| --- | --- |
| **CVE IDs:** | [CVE-2026-123790](https://www.cve.org/CVERecord?id=CVE-2026-123790) |
| **API URL:** | [VINCE JSON](https://kb.cert.org/vuls/api/944667/) \| [CSAF](https://kb.cert.org/vuls/api/944667/csaf/) |
| **Date Public:** | 2026-11-12 |
| **Date First Published:** | 2026-11-12 |
| **Date Last Updated:** | 2026-11-12 15:20 UTC |
| **Document Revision:** | 2   |
