---
title: "Roundcube webmail: multiple vulnerabilities prior to 1.6.21"
source: https://seclists.org/oss-sec/2026/q4/769
source_host: seclists.org
clip_date: 2026-11-19T09:31:46+08:00
trace_id: c43c483f-ef21-4947-9361-d45bea450cd2
content_hash: 055cd161b7ce638eebc577f867ea5de4f10e60bd85cf1ec81ec28e7d9fc25c96
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
notion_page_id: 41d75244-d011-81c6-a88b-f13fa6076bfb
ioc: null
---

## oss-sec mailing list archives

## Roundcube webmail: multiple vulnerabilities prior to 1.6.21 / 1.7.6

* * *

*From*: Valtteri Vuorikoski <vuori () notcom org>  
*Date*: Wed, 18 Nov 2026 12:20:34 +0200  

* * *

```
Roundcube, a webmail frontend, released versions 1.6.21 (LTS) and 1.7.6
with fixes to numerous CSRF, SSRF, injection and other vulnerabilities
on Nov 9.

```

> ```
> From the announcement <https://roundcube.net/news/2026/11/09/security-updates-1.6.21-and-1.7.6>:
> ```

```sql
  * Fix open redirect via IMAP error recovery on attachment get,
reported by Santhoshkumar S.

  * Fix so Received: header includes only trusted hostname and forwarded
IP from a trusted proxy, reported by Squirt1e, Atum, N0b0dy, Gh0u1L5.

  * Fix bug where some managesieve destructive actions could have been
triggered cross-site via GET, reported by Squirt1e, Atum, N0b0dy,
Gh0u1L5.

  * Fix Sieve script injection via a rule operator, reported by
Squirt1e, Atum, N0b0dy, Gh0u1L5.

  * Fix Sieve script injection via set/include modifiers, reported by
Squirt1e, Atum, N0b0dy, Gh0u1L5.

  * Fix bug where resolve_url() ignored trusted host setting, reported
by Squirt1e, Atum, N0b0dy, Gh0u1L5.

  * Fix mail header injection via a MDN subject, reported by Squirt1e,
Atum, N0b0dy, Gh0u1L5

  * Fix HTTP request injection via the spellcheck ATD backend, reported
by Squirt1e, Atum, N0b0dy, Gh0u1L5.

  * Fix IMAP command injection via CRLF in _uid parameter with
messages_cache enabled, reported by dexx-tech.

  * Fix SSRF in CSS proxy via incomplete is_local_url() nip.io/sslip.io
bypass, reported by blacksw0rd.

  * Fix CSRF validation bypass for file-only POST requests, reported by
skad00sh.

  * Fix disabled_actions restriction bypass by writing ‘_’ instead of
‘-‘ in the action name, reported by skad00sh.

  * Fix CSRF validation bypass for mail purge/expunge commands, reported
by threalwinky.

  * Fix passing potentally unsafe attachment content into ImageMagick on
image type conversion, reported by José Luis Sánchez Pérez -
Cybersecurity Blue & Red Team.

  * Fix Unbounded CPU loop/DoS in rcube_session::unserialize() via a
negative length token, reported by Guang.

  * Fix SSRF filter (is_local_url()) bypass via 6to4 (2002::/16)
addresses, reported by wyx98765.

  * Fix so IMAP host input is validated more strictly, reported by
Mohamed Elgzouli.

No CVEs or other indicators were provided. Additionally the announcement
notes that the 1.6 (LTS) branch will end support in the near future due
to the effort of backporting patches.

 -valtteri
 

```
