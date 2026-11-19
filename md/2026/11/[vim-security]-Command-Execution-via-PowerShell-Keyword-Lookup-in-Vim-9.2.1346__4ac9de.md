---
title: "[vim-security] Command Execution via PowerShell Keyword Lookup in Vim < 9.2.1346"
source: https://seclists.org/oss-sec/2026/q4/708
source_host: seclists.org
clip_date: 2026-11-19T08:17:36+08:00
trace_id: 20d8a926-501a-43df-a6a1-07a0484cf4ef
content_hash: b273cfcbc274cb083d02c6f3805630819ac0b54190bd51a4a6a81df426c3620b
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
notion_page_id: 41d75244-d011-81d5-9278-f45e3963b991
ioc:
  cves: []
  cwes:
    - CWE-78
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## oss-sec mailing list archives

## \[vim-security\] Command Execution via PowerShell Keyword Lookup in Vim < 9.2.1346

* * *

*From*: Christian Brabandt <cb () 256bit org>  
*Date*: Sat, 14 Nov 2026 19:32:57 +0100  

* * *

```go
Command Execution via PowerShell Keyword Lookup in Vim < 9.2.1346
=================================================================

Date: 14.11.2026
Severity: Low
CVE: *requested, not yet assigned*
CWE: Improper Neutralization of Special Elements used in an OS Command
     (CWE-78)

## Summary

The fix for [GHSA-r5v6-q6j8-8qw2](https://github.com/vim/vim/security/advisories/GHSA-r5v6-q6j8-8qw2)
in `runtime/ftplugin/ps1.vim` quotes the argument of `K` for PowerShell by
doubling ASCII single quotes.  PowerShell also treats the typographic quotes
U+2018, U+2019, U+201A and U+201B as single quotes, which were not doubled.  A
crafted line in a PowerShell script can therefore still execute arbitrary
commands when the user selects it and presses `K`.

## Description

The PowerShell filetype plugin defines a `:GetHelp` command and sets
`keywordprg` to it.  The command passes the argument of `K` to PowerShell
as `Get-Help -Full '<arg>'` via `-Command`, doubling every `'` in the
argument to keep it inside the single-quoted string.

The PowerShell language accepts `'`, `‘`, `’`, `‚` and `‛` as
single-quote characters.  A typographic quote in the argument therefore
terminates the string, and the text following it is executed as PowerShell
code, e.g. for the line:

    x’;./hook.ps1;’

## Impact

Arbitrary command execution in the context of the user running Vim.
Exploitation requires:

- Vim with filetype plugins enabled and PowerShell (`pwsh` or
  `powershell.exe`) installed
- the victim opening a crafted PowerShell script, selecting the crafted
  line in Visual mode and invoking the keyword lookup with `K`.

The severity is rated Low because Normal-mode `K` is not affected and
exploitation requires the victim to deliberately select the crafted text in
Visual mode and invoke the keyword lookup.

## Acknowledgements

The Vim project would like to thank Zachariah Mithani for reporting the issue.

## References

The issue has been fixed as of Vim patch [v9.2.1346](https://github.com/vim/vim/releases/tag/v9.2.1346).

- [Commit](https://github.com/vim/vim/commit/188a790b05a282926b311503245f5119a5f6f3ed)
- [Github Security Advisory](https://github.com/vim/vim/security/advisories/GHSA-XXXX)
- [Previous advisory](https://github.com/vim/vim/security/advisories/GHSA-r5v6-q6j8-8qw2)



Best,
Christian
-- 
Wie man sein Kind nicht nennen sollte: 
  Claire Grube 

```
