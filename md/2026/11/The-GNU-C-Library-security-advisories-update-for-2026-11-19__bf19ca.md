---
title: The GNU C Library security advisories update for 2026-11-19
source: https://seclists.org/oss-sec/2026/q4/790
source_host: seclists.org
clip_date: 2026-11-20T10:06:42+08:00
trace_id: c86b73af-71b3-4b64-adbf-e529bc9d6291
content_hash: 94b6079c25dcc7f9350056e907dd035b62d25395918b96b00c11e6705a0d3ac4
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
notion_page_id: 41e75244-d011-81d9-99fc-d56866c880a9
ioc:
  cves:
    - CVE-2026-126765
  cwes: []
  hashes:
    - 28f540f45bbacd939bfd07f213bcad2bf730b1bf
  domains: []
  tools: []
  techniques: []
---

## oss-sec mailing list archives

## The GNU C Library security advisories update for 2026-11-19

* * *

*From*: Adhemerval Zanella Netto <adhemerval.zanella () linaro org>  
*Date*: Thu, 19 Nov 2026 15:03:46 -0300  

* * *

```ruby
The following security advisories have been published:

GLIBC-SA-2026-0032:
===================

Double free after allocation failure in glob

The glob functions in the GNU C Library versions 2.44 and earlier may
free the same heap block twice when a memory allocation fails while
glob prepends the directory name to the names it matched.  The names
already rewritten are freed, but their pointers stay in the result
vector, and the error path frees them again with globfree.

The allocation must fail after at least one name has been rewritten,
so the issue can only be reached when the process is already close to
its memory limit, for example under an address space limit (RLIMIT_AS)
or on a 32-bit system.  The attacker needs control to make the result
large enough to make the program or service run out of memory, either
by controlling the glob pattern and having knowledge of the filesystem
layout or through other means.  This issue affects all architectures
and ABIs supported by the GNU C Library.

CVE-Id: CVE-2026-126765
Public-Date: 2026-11-11
Vulnerable-Commit: 28f540f45bbacd939bfd07f213bcad2bf730b1bf (1.09)
Reported-By: Jack Doan <me () jackdoan com>
CVSS: CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:L - 3.7

```

* * *

### Current thread:

-   **The GNU C Library security advisories update for 2026-11-19** *Adhemerval Zanella Netto (Nov 19)*
