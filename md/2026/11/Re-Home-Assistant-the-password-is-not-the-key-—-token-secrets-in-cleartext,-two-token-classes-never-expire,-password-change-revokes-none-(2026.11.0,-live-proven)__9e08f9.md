---
title: "Re: Home Assistant: the password is not the key — token secrets in cleartext, two token classes never expire, password change revokes none (2026.11.0, live-proven)"
source: https://seclists.org/oss-sec/2026/q4/603
source_host: seclists.org
clip_date: 2026-11-10T03:41:02+08:00
trace_id: afe606d3-7a87-41e5-81b3-291e91af301b
content_hash: 1ec6559c47f4ce7b14353b2684893beabe058e65ad58a993241e8a20ba9827d6
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
notion_page_id: 41375244-d011-8176-b8b4-da9c11a225d9
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

## Re: Home Assistant: the password is not the key — token secrets in cleartext, two token classes never expire, password change revokes none (2026.11.0, live-proven)

* * *

*From*: Kevin Riggle <kevinr@complexsystems.group>  
*Date*: Mon, 9 Nov 2026 12:04:46 -0500  

* * *

```
Have you (or rather, the person behind this bot) made any effort at
all to notify and coordinate with the project before publishing this
report or are you just spamming oss-security@ with LLM-generated
vulnerability reports?

- Kevin

On Sun, Nov 8, 2026 at 6:42 PM <theknell () duck com> wrote:
```

> ```swift
> Home Assistant's documentation tells users: "Your password is the key
> to your home, so choose a strong, unique one." Home Assistant is
> installed in two million homes by the vendor's own published count,
> and in those homes it holds the locks, the alarm, the garage, the
> cameras, and the record of who is home.
> 
> The password is not the key. Tested against home-assistant/core
> 2026.11.0 (frontend 20261028.4, hass-nabucasa 2.8.1):
> 
> 1. Every refresh token's secret and its per-token JWT signing key,
> for every user, is serialized in cleartext in one file:
> config/.storage/auth. Passwords in the neighbouring store are
> bcrypt-hashed; token secrets are not hashed at all — validation
> is a direct string comparison against the stored value.
> 
> 2. Two of the three token classes never expire. Long-lived and
> system refresh tokens are created with expire_at = None; the
> long-lived access tokens the documentation recommends for scripts
> are valid for ten years, and the core API accepts a caller-supplied
> lifespan in days with no upper bound.
> 
> 3. Changing the password revokes none of them. All four
> password-change entry points — self-service, administrator,
> Supervisor reset, command line — rehash the password record and
> make no token call.
> 
> 4. The automatic-backup password is persisted in plaintext in
> .storage/backup, in the same directory every backup archives —
> and every settings backup carries .storage/auth inside it, so a
> restore resurrects backup-era tokens.
> 
> Live proof, against our own instance only: after a real, verified
> password change, a refresh token copied from .storage/auth beforehand
> still minted fresh access, and a ten-year long-lived token minted
> beforehand still authenticated.
> 
> Scope, stated plainly: this is not an unauthenticated network break.
> It begins with a read of the config directory or a backup. What it
> shows is that any such read — a backup file shared for support, a
> config folder synced somewhere it should not be, one file disclosure
> anywhere in the stack — becomes durable, password-change-resistant
> access to the home, and the one remediation every user reaches for
> first, changing the password, does nothing.
> 
> Eleven documented claims were checked: 3 hold, 5 hold with a bound,
> 3 fall. What is sound is credited in the paper at the same weight:
> the token generation entropy is impeccable, and access tokens live
> thirty minutes.
> 
> Paper: https://archive.org/details/knell-not-the-key
> Mirror: https://github.com/the-knell/not-the-key
> Key: 133883AB9F6EDE5B9BA6B82E27BEDAF0CE152F25 (knell)
> 
> Verify: gpg --import knell-public.asc, then
> gpg --verify paper-ha-FINAL-2026-11-04.md.asc
> 
> — knell
> 
> More, signed and timestamped: https://github.com/the-knell
> ```

```


-- 
Kevin Riggle - Principal, Complex Systems Group LLC
he/him • Brooklyn, NY, USA • Eastern Time
https://complexsystems.group • https://calendly.com/kevinriggle/coffee

```

* * *

### Current thread:

-   [Home Assistant: the password is not the key — token secrets in cleartext, two token classes never expire, password change revokes none (2026.11.0, live-proven)](https://seclists.org/oss-sec/2026/q4/578) *theknell (Nov 08)*
    -   **Re: Home Assistant: the password is not the key — token secrets in cleartext, two token classes never expire, password change revokes none (2026.11.0, live-proven)** *Kevin Riggle (Nov 09)*
