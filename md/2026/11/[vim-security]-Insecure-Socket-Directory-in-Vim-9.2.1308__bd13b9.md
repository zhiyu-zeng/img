---
title: "[vim-security] Insecure Socket Directory in Vim < 9.2.1308"
source: https://seclists.org/oss-sec/2026/q4/579
source_host: seclists.org
clip_date: 2026-11-09T09:38:41+08:00
trace_id: 9f2242f6-98fe-47fb-b729-5aeeeae0a6c4
content_hash: 25e693d7f8e1258d787a7e8ebdfaca4eca2ce50b225407cbbdc447162852c80d
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
notion_page_id: 41375244-d011-81e9-8959-edb16e1beffa
ioc:
  cves: []
  cwes:
    - CWE-276
    - CWE-283
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## oss-sec mailing list archives

## \[vim-security\] Insecure Socket Directory in Vim < 9.2.1308

* * *

*From*: Christian Brabandt <cb () 256bit org>  
*Date*: Sun, 8 Nov 2026 21:20:55 +0100  

* * *

```sql
Insecure Socket Directory in Vim < 9.2.1308
===========================================
Date: 08.11.2026
Severity: Medium
CVE: *requested, not yet assigned*
CWE: Unverified Ownership (CWE-283), Incorrect Default Permissions (CWE-276)

## Summary
When using the socketserver backend of the clientserver feature, Vim places
its socket in a per-user directory such as `/tmp/vim-<uid>`.  An existing
directory was used without checking its owner or permissions, and the socket
was created with the user's umask.  A local attacker can pre-create this
directory and then connect to or replace the victim's server socket, which
allows evaluating arbitrary Vim expressions in the victim's Vim.

## Description
`socketserver_get_path()` creates the socket directory
`$XDG_RUNTIME_DIR/vim` or `$TMPDIR/vim-<uid>` (`/tmp` if `$TMPDIR` is unset)
using:

    if (vim_mkdir(buf, 0700) == -1 && errno != EEXIST)
        continue;

If the directory already exists, it is used as-is.  Since `/tmp` is
world-writable, another user can create `/tmp/vim-<uid>` for the victim's
uid beforehand, owned by the attacker and with permissive mode.
`channel_listen_unix()` then binds the server socket inside that directory
with permissions `0777 & ~umask`.  The socketserver does not authenticate
connecting clients and evaluates "expr" messages using
`eval_client_expr_to_string()`, and "keystrokes" messages are inserted into
the input buffer.

With a permissive umask (e.g. `002` or `000`) the attacker can connect to the
socket directly.  With the common umask `022` a direct connect fails, but
since the attacker owns the directory, they can still remove or replace the
socket and impersonate the server towards clients.

## Impact
Arbitrary Vim expression evaluation, and therefore arbitrary shell command
execution, in the context of the user running Vim, on multi-user systems.

Exploitation requires:

* a Vim build with the `+socketserver` feature, used as server (e.g. using
  `--servername` or with `+autoservername`),
* the attacker having a local account on the same system,
* the socket directory being located in a shared directory such as `/tmp`
  (`$XDG_RUNTIME_DIR` is not affected, since it is only accessible by the
  user),
* for direct code execution: a umask that makes the socket accessible by
  the attacker.

## Acknowledgements
The Vim project would like to thank Calif.io and 360AlphaLab for independently
reporting the issue.

## References
The issue has been fixed as of Vim patch [v9.2.1308](https://github.com/vim/vim/releases/tag/v9.2.1308).

- [Commit](https://github.com/vim/vim/commit/a448e0c6bc459d7dbeab581bcb76a0d)
- [Github Security Advisory](https://github.com/vim/vim/security/advisories/GHSA-p99j-mfjp-r4cg)


Thanks,
Christian
-- 
Das Glück kann nicht wie ein mathematischer Lehrsatz bewiesen werden,
es muß empfunden werden, wenn es da sein soll.
                -- Heinrich von Kleist

```
