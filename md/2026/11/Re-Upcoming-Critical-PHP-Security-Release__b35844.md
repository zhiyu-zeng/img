---
title: "Re: Upcoming Critical PHP Security Release"
source: https://seclists.org/oss-sec/2026/q4/793
source_host: seclists.org
clip_date: 2026-11-20T10:07:14+08:00
trace_id: cbd66fa6-bdb9-419e-8162-2e31234e31db
content_hash: 11458e8e1644239e34aa5b888c37474beb24ba479a4d8c9fec9df8b37764d8b2
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
notion_page_id: 41e75244-d011-8166-bc60-c1522edab510
ioc:
  cves:
    - CVE-2026-115560
    - CVE-2026-126714
    - CVE-2026-127960
    - CVE-2026-128064
    - CVE-2026-128090
    - CVE-2026-129182
    - CVE-2026-129289
    - CVE-2026-129291
    - CVE-2026-129292
    - CVE-2026-129474
    - CVE-2026-129481
    - CVE-2026-129496
    - CVE-2026-129501
    - CVE-2026-129506
    - CVE-2026-129538
    - CVE-2026-15353
    - CVE-2026-48841
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## oss-sec mailing list archives

## Re: Upcoming Critical PHP Security Release

* * *

*From*: Alan Coopersmith <alan.coopersmith () oracle com>  
*Date*: Thu, 19 Nov 2026 16:59:31 -0800  

* * *

```sql
PHP 8.6.0, 8.5.13, 8.4.28, 8.3.37, and 8.2.36 were released today with these fixes:

CGI:

  * Fixed GHSA-5j3f-64r7-f564 (PHP-CGI out-of-bounds read and write during PATH_INFO correction). (CVE-2026-129538) 
[8.2, 8.3, 8.4, 8.5, 8.6]

Core:
  * Fixed GHSA-8mjj-2r7p-4hg2 (Use-after-free in magic method backtraces can lead to remote code execution). 
(CVE-2026-129474) [8.5, 8.6]
  * Fixed GHSA-2fjv-p558-g82m (Use-after-free via repopulation of last_fatal_error_backtrace global after shutdown). 
(CVE-2026-129182) [8.5, 8.6]

Date:

  * Fixed GHSA-gr4f-wgx5-jpfv (Timezone cache use-after-free can lead to remote code execution). (CVE-2026-129496) 
[8.2, 8.3, 8.4, 8.5, 8.6]

DOM:

  * Fixed GHSA-x8r7-mg3g-74hg (Double free during DOM XML serialization). (CVE-2026-129501) [8.4, 8.5, 8.6]

FPM:

  * Fixed GHSA-qc49-hpvq-g2w6 (PHP-FPM request smuggling through an unread HTTP request body). (CVE-2026-129289) [8.2, 
8.3, 8.4, 8.5, 8.6]
  * Fixed GHSA-3mg3-cr28-46gc (PHP-FPM status endpoint XSS via unescaped user and script fields). (CVE-2026-129292) 
[8.2, 8.3, 8.4, 8.5, 8.6]
  * Fixed GHSA-jm4m-qfqx-967m (PHP-FPM epoll use-after-free can lead to local privilege escalation). (CVE-2026-129291) 
[8.2, 8.3, 8.4, 8.5, 8.6]

Phar:

  * Fixed GHSA-68fq-fh7h-f8gr (PHAR OpenSSL signature bypass via algorithm downgrade). (CVE-2026-128090) [8.2, 8.3, 
8.4, 8.5, 8.6]

Session:

  * Fixed GHSA-fm2m-fjf5-v3cp (Partially overwritten session files can lead to remote code execution). 
(CVE-2026-126714) [8.2, 8.3, 8.4, 8.5, 8.6]
  * Fixed GHSA-658j-r8rw-q6mx (Session serializer mismatch can lead to remote code execution). (CVE-2026-115560) [8.2, 
8.3, 8.4, 8.5, 8.6]
  * Fixed GHSA-g3vh-838c-65v7 (Use-after-free after interrupted session shutdown). (CVE-2026-129481) [8.3, 8.4, 8.5, 
8.6]

SOAP:

  * Fixed GHSA-q23r-hr55-xmpg (SOAP information disclosure through malformed array dimensions). (CVE-2026-15353) [8.2, 
8.3, 8.4, 8.5, 8.6]
  * Fixed GHSA-4646-p932-gw34 (SOAP use-after-free when processing DTD entity references). (CVE-2026-129506) [8.2, 8.3, 
8.4, 8.5, 8.6]

Standard:

  * Fixed GHSA-f6gg-rchx-xw8j (Mixed-case HTTPS and FTPS URLs can expose data in plaintext). (CVE-2026-128064) [8.2, 
8.3, 8.4, 8.5, 8.6]
  * Fixed GHSA-mmf9-xm3v-hg2x (Denial of service through folded HTTP response headers). (CVE-2026-127960) [8.2, 8.3, 
8.4, 8.5, 8.6]

URI:
  * Upgrade to uriparser 1.0.3. (CVE-2026-48841) [8.5, 8.6]
  * Fixed GHSA-mg3p-mxj9-g2mm  [8.5, 8.6]

See https://github.com/php/php-src/security/advisories for each GHSA advisory.
See https://www.php.net/ for download links and full ChangeLogs for each release.

--
        -Alan Coopersmith-                 alan.coopersmith () oracle com
         Oracle Solaris Engineering - https://blogs.oracle.com/solaris

```

* * *

### Current thread:

-   [Upcoming Critical PHP Security Release](https://seclists.org/oss-sec/2026/q4/266) *Alan Coopersmith (Oct 20)*
    -   <Possible follow-ups>
    -   [Upcoming Critical PHP Security Release](https://seclists.org/oss-sec/2026/q4/780) *Alan Coopersmith (Nov 18)*
        -   **Re: Upcoming Critical PHP Security Release** *Alan Coopersmith (Nov 19)*
