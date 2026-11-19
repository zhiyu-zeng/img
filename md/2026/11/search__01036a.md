---
title: search
source: https://kb.cert.org/vuls/id/685399
source_host: kb.cert.org
clip_date: 2026-11-19T08:14:06+08:00
trace_id: ac058d4b-b359-4ac8-a123-3797139a243b
content_hash: aefb40ca22568982a6165606a7cb2d6410376957d28b0eb33eafd484e6d1f54c
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
notion_page_id: 41d75244-d011-811e-b0ae-f365e0e376ea
ioc:
  cves:
    - CVE-2026-127109
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

### Overview

The npm library `promzard`, versions 4.0.0 and earlier, is vulnerable to remote code execution due to direct string interpolation of context object keys, which allows unsanitized JavaScript code injection.

### Description

`promzard` is a `Node.js` library designed to automate configuration workflows by evaluating template modules and generating data objects via interactive prompting. The library allows users to provide a context object `ctx` to expose specific data to the template module.

`promzard` builds an object by walking the template module for `prompt()` and asynchronous functions. The keys of `ctx`, however, are treated as raw JavaScript source code instead of inert data. The implementation performs direct string interpolation of `ctx` keys, without validation or sanitization, into the parameter list of a function-expression source string that is then evaluated with `vm.runInThisContext()`. A key containing attacker-controlled JavaScript syntax can be executed during evaluation.

### Impact

An attacker capable of influencing the `ctx` object’s keys (e.g. via parsed configuration file, an HTTP request, or environment variables) can break out of the function parameter list and inject arbitrary JavaScript code. This results in remote code execution within the context of the Node.js process.

### Solution

Unfortunately, the maintainers of `promzard` could not be reached to coordinate the vulnerability. The CERT/CC recommends users ensure that any data used to populate `ctx` is strictly validated, and that arbitrary keys should not be passed from untrusted sources.

### Acknowledgements

Thanks to Abdullah Hamdan for reporting this vulnerability. This document was written by Alex Lewis.

### Vendor Information

685399

[Expand all](#)

### Unknown

### Other Information

|     |     |
| --- | --- |
| **CVE IDs:** | [CVE-2026-127109](https://www.cve.org/CVERecord?id=CVE-2026-127109) |
| **API URL:** | [VINCE JSON](https://kb.cert.org/vuls/api/685399/) \| [CSAF](https://kb.cert.org/vuls/api/685399/csaf/) |
| **Date Public:** | 2026-11-12 |
| **Date First Published:** | 2026-11-12 |
| **Date Last Updated:** | 2026-11-12 15:09 UTC |
| **Document Revision:** | 1   |
