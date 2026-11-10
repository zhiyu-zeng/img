---
title: Rooting ISPs and Hosting Providers with Hyperglass
source: https://seclists.org/oss-sec/2026/q4/625
source_host: seclists.org
clip_date: 2026-11-10T17:08:09+08:00
trace_id: bb55e6f2-65de-4ce1-994d-c116131db34a
content_hash: 38c10b4446d02582083849f5e04ddf90e8a84db5e64452c59c3de118d73a9092
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
notion_page_id: 41475244-d011-8154-8d15-c11efb39513d
ioc: null
---

## oss-sec mailing list archives

## Rooting ISPs and Hosting Providers with Hyperglass

* * *

*From*: factoid () morke ru  
*Date*: Tue, 10 Nov 2026 07:59:20 -0000  

* * *

```sql
https://hyperpwn.xyz/

Note: All the research, from hunting to exploitation was done by DS. All I
did was validate. Posting this on LET first, hopefully it spreads.

TLDR; hyperglass has OS code exec vulns which you can trivially turn into
pre-auth RCE. Many ISPs and hosting providers are vulnerable to it because
they expose their hyperglass instance to the internet

```

* * *

### Current thread:

-   **Rooting ISPs and Hosting Providers with Hyperglass** *factoid (Nov 10)*
    -   [Re: Rooting ISPs and Hosting Providers with Hyperglass](https://seclists.org/oss-sec/2026/q4/626) *Solar Designer (Nov 10)*
