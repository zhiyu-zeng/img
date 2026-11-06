---
title: "InfiniteWP Client: the NOSSL signing key has 31 bits of secret — recovered live in 291.9 seconds"
source: https://seclists.org/oss-sec/2026/q4/563
source_host: seclists.org
clip_date: 2026-11-07T03:00:45+08:00
trace_id: 2fa7d9b4-1f54-4047-a631-06b8dc5fdafc
content_hash: db1265df8ebd08c462684ab2b9b8eaa3d0ba16efe0e5dfc0e53c7d877f96f915
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
notion_page_id: 41075244-d011-81a8-b087-ee2ee149d4c3
ioc:
  cves: []
  cwes: []
  hashes:
    - 133883ab9f6ede5b9ba6b82e27bedaf0ce152f25
  domains: []
  tools: []
  techniques: []
---

## oss-sec mailing list archives

## InfiniteWP Client: the NOSSL signing key has 31 bits of secret — recovered live in 291.9 seconds

* * *

*From*: theknell () duck com  
*Date*: Fri, 06 Nov 2026 13:14:32 -0500  

* * *

```swift
InfiniteWP Client 1.13.10 — a WordPress management plugin on roughly
200,000 installs — speaks to its management panel through two
authentication branches. The strong branch verifies an RSA
signature. The other, NOSSL, is selected by the enrolling panel
setting one request parameter, on hosts fully capable of RSA. Once
its key is stored, the selection is permanent and the RSA branch is
unreachable.

The stored key is generated as:

md5(base64_encode(panel_public_key) . rand(0, getrandmax()))

The public key is public. The secret is a single rand() result: at
most 2^31 values. The authentication value signs only the action
and message ID — parameters are never signed — and message-ID
ordering is enforced only on the auto_login path, so a captured
request replays with altered parameters.

Live proof, against our own instance only: from one captured
get_stats request and the panel's public key, the key was recovered
offline in 291.9 seconds (~7.36M candidates/sec), byte-identical to
the site-issued key. A forged maintain_site command signed with the
recovered key was accepted and wrote database options that had not
existed before. The key never rotates: recover it once, forge
forever.

Scope, stated plainly: every shipped copy carries the construction;
exploitation requires a NOSSL-enrolled site. The NOSSL-enrolled
share of the 200,000 installs is not externally measurable and is
not claimed here.

Paper: https://archive.org/details/knell-thirty-one-bits
Mirror: https://github.com/the-knell/Thirty-One-Bits
Key: 133883AB9F6EDE5B9BA6B82E27BEDAF0CE152F25 (knell)

Verify: gpg --import knell-public.asc, then
gpg --verify paper-infinitewp-FINAL-2026-11-04.md.asc

— knell

More, signed and timestamped: https://github.com/the-knell
```

* * *

### Current thread:

-   **InfiniteWP Client: the NOSSL signing key has 31 bits of secret — recovered live in 291.9 seconds** *theknell (Nov 06)*
