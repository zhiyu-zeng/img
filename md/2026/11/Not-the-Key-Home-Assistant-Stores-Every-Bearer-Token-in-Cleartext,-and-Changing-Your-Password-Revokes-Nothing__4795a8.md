---
title: "Not the Key: Home Assistant Stores Every Bearer Token in Cleartext, and Changing Your Password Revokes Nothing"
source: https://garrettstimpson.ca/posts/2026/11/08/home-assistant-not-the-key-token-custody/
source_host: garrettstimpson.ca
clip_date: 2026-11-09T21:04:35+08:00
trace_id: 42c38135-887e-47c7-8b8b-f3d982626d35
content_hash: e7bdea6c6200384fdf137f424020e1d7ab450c994db0371a0d39cc0eadbd542b
status: synced
tags: []
series: null
feed_source: Garrett Stimpson
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41375244-d011-81bc-90c3-cf6370d23b79
ioc: null
---

## Not the Key

Home Assistant’s authentication documentation tells its users: “Your password is the key to your home, so choose a strong, unique one.”

That sentence is wrong, and the code proves it. On a stock Home Assistant install, the password is one of two credentials that can act as you, and it is the *less durable* one. The other credential class - bearer tokens - is stored in cleartext in a single file, two of its three types never expire, and changing your password revokes none of it. Steal the file once and you own the house until someone manually deletes tokens one by one, which most users will never think to do, because the product told them the password was the key.

This writeup is based on the “Not the Key” audit published by the researcher knell on the oss-security mailing list on 8 November 2026, covering Home Assistant core 2026.11.0 (the release published 4 November 2026). Everything below traces to the shipped source at pinned commits, and the decisive claims were live-proven against a disposable local instance. I did not do the original audit; what follows is my read of it, and why I think it deserves more attention than it is getting. As of writing, a web search for the finding returns essentially nothing outside the mailing list thread.

## 1\. The construction

### 1.1 Custody: one file, in cleartext

Every credential that can act as a Home Assistant user lives in `config/.storage/auth`, file mode 0600. For every user, that file holds:

-   every **refresh token secret**, as a cleartext string (~512 bits of entropy, so the secret itself is sound - the problem is where it sleeps)
-   every **per-token JWT signing key**, also cleartext, 128 hex characters each

Passwords, in the neighbouring store, are bcrypt-hashed. Token secrets are not hashed at all, because validation is a direct string comparison against the stored value. Hashing them would break nothing; the design simply never bothered.

So the threat model inverts. For most systems, an attacker who reads a config file gets password *hashes* and has to work. Here, an attacker who reads the config file gets *working credentials*, immediately, for every user on the instance. The audit’s phase 4 did exactly this on a live 2026.11.0 instance: copied `.storage/auth` off the host, parsed it, and found three refresh-token entries - system, normal, long-lived - each carrying its `token` and `jwt_key` in cleartext. The copied normal refresh string was byte-identical to the one the test client was actively using.

### 1.2 The expiry matrix

| Token class | Expires | Reality in code |
| --- | --- | --- |
| System refresh token (Supervisor legacy, Cast, HTTP content user) | **Never** | Created with `expire_at = None` (`auth/__init__.py:507-509`) |
| Normal refresh token (browser/app logins) | 90 days after **last use** | Deadline set at creation, then slid forward on every access-token mint (`auth_store.py:281-286`) |
| Long-lived access token (scripts) | **10 years** as shipped; **unbounded** in the core API | The WS command `auth/long_lived_access_token` takes a caller-supplied `lifespan` in days with no upper bound; the shipped frontend hardcodes 3650. Its parent refresh token never expires |

Two of the three classes are created with `expire_at = None` and no sweeper will ever reach them. The third’s deadline is a deadline on *disuse*: a normal token that is used - by its owner, or by anyone holding a copy - renews itself indefinitely. Token theft is self-healing in the attacker’s favor.

One documentation sentence deserves its exact bound. The contributors’ auth API docs say of the long-lived access token: “Home Assistant does not store it, so it cannot be shown again.” Of the JWT *string*, that is true. The string’s parent refresh token and its JWT signing key are stored, in cleartext, in the same file - and the parent re-mints equivalent tokens through the standard refresh grant. What is not stored is the one artifact that matters least.

### 1.3 Revocation semantics

The revocation paths that exist:

-   manual per-token deletion (profile UI, WS `auth/delete_refresh_token`, or RFC 7009 `POST /auth/revoke` by anyone holding the string)
-   manual delete-all (`auth/delete_all_refresh_tokens`) - note the frontend’s own “delete all” button calls it for `normal` tokens only, keeping the current token, so the shipped UI’s bulk action leaves long-lived parents and system tokens alive
-   user deletion, user deactivation - both impossible for the owner account, which is the primary account in most homes
-   credential removal
-   an opt-in frontend prompt after self-service password change, which the user can decline with the default answer

And the password change. There are four entry points - self-service WS command, administrator change, Supervisor reset, CLI - and all four were read end to end. Every one of them does exactly one thing: rehash the password record and save. No token call appears anywhere in the body of any of them.

The docs sentence is “Home Assistant asks whether you want to sign out of all other sessions.” That prompt exists, in the web frontend only, as an opt-in step *after* the change completes, and the default is a dialog the user can decline. The API and CLI paths offer nothing at all.

## 2\. The live proof

The audit’s phase 4 ran a gold-standard proof on a disposable local instance of `home-assistant:2026.11.0` (image digest pinned, localhost only, wiped and re-run clean after two aborted driver runs). The sequence:

1.  Onboarding created an owner user; code exchange returned an access token plus a normal refresh token.
2.  A 10-year long-lived access token was minted through the real WS command the frontend uses.
3.  **The attacker step**: the host copied `config/.storage/auth` (verified mode 0600 on disk) to a “stolen” file. Parsed: three refresh-token entries, each with cleartext `token` and `jwt_key`.
4.  The password was changed through the real WS command, old to new. Success.
5.  **Proof A**: the *copied* refresh token alone, after the password change - `POST /auth/token` refresh grant returned 200, fresh access token; `GET /api/` and `GET /api/config` returned 200.
6.  **Proof B**: the pre-change 10-year token, after the password change - still 200 on the API.
7.  The password change was real: login with the old password now returned `invalid_auth`; with the new one, success.
8.  Negative control: garbage bearer, 401.
9.  Manual revocation was the only kill: deleting the parent refresh tokens one by one finally turned the stolen copies into `invalid_grant` and the LLAT into 401.

That is the whole thesis in nine steps: the password change worked, the stolen tokens kept working, and only hand-deleting each token stopped them.

## 3\. The backup kicker, and the cloud

It gets worse one layer out. The automatic-backup encryption password is stored **in plaintext** in `.storage/backup`, in the same directory every backup archives - the code admits it in a comment: “The store persists the automatic backup password in plaintext.”

`.storage/` is inside the config folder, and the config folder rides inside every backup. So one read of a live config directory yields (a) all token secrets directly and (b) the key that decrypts every exported automatic backup the user has ever made - and each decrypted backup independently contains the same `.storage/auth`. The vendor’s claim that Nabu Casa does not hold your backup key is true; it is not true that the key is absent from the installation. It is stored next to the data it protects.

The cloud path, to its credit, holds up: remote UI traffic is TLS-terminated at the instance with a locally held certificate, and the SniTun relay holds no session material. A relay compromise does not yield bearer tokens. The problem is local custody, not the tunnel.

## 4\. Why this matters more than a CVE score suggests

There is no memory corruption here, no auth bypass, no privilege boundary crossed. That is precisely why it will not get a CVE, a 9.8, or a headline - and precisely why it describes how real compromises persist.

The realistic scenario is not an internet attacker. It is anyone with read access to the config directory: a compromised add-on, a malicious integration, a backup restored onto a machine you do not control, a family member’s device, a “smart home consultant,” a stolen SD card from a Home Assistant Yellow or a Raspberry Pi. The product’s own security page says attacks requiring host access are non-qualifying, and that is a defensible triage policy. But the *consequence* of host access here is not “they can read the config.” It is “they permanently and silently become every user, including the owner, in a way password changes do not fix, in a system that unlocks doors and disarms alarms.”

Compare the same class of finding elsewhere: a stolen bcrypt dump is a cracking problem with a deadline. A stolen `.storage/auth` is a working keyring with no deadline, self-renewing on use, surviving password changes, and - via the backup password - reproducible from every backup the victim has ever exported.

## 5\. What the vendor gets right

Credit where it is due, because the audit does: token entropy is sound (token_urlsafe(64), token_hex(64)); the response process at Home Assistant has a real advisory history and funds audits; the cloud tunnel design is genuinely good; bcrypt for passwords is correct; and the docs’ advice to delete refresh tokens to sign devices out is code-true. The failure is one architectural decision - cleartext custody plus permanent classes plus password-change-implies-nothing - that turns every other good decision into a durability problem for stolen material.

## 6\. Fixes, in order of value

1.  **Hash the token secrets** (argon2 or even SHA-256 with a server pepper). Validation is a comparison; hashing changes nothing functionally and removes the “read the file, own the house” property.
2.  **Make password change revoke by default.** One line in each of the four entry points: delete all refresh tokens for the user, keep the caller’s current session. The opt-in frontend prompt becomes the “keep sessions” exception.
3.  **Bound the LLAT lifespan** server-side. A caller-supplied, unbounded 3650-day default is not a “long-lived token,” it is a second permanent credential class.
4.  **Expire the system token class**, or at minimum rotate it on a schedule.
5.  **Stop storing the backup password next to the backups it encrypts.** Derive it, or require it at setup and store it outside the archived directory.

## 7\. For agents looking to fix their setup

If you operate Home Assistant - or manage homes that do - do this now, in order:

1.  **Assume the file is already copied.** If any add-on, integration, script, or person has had read access to the config directory at any point, treat every token as stolen. Password changes will not help; do not bother as a remediation.
2.  **Sweep tokens manually.** Profile page, Security section: delete every refresh token you do not recognize, then delete the long-lived ones too. Remember the frontend’s “delete all” misses long-lived and system tokens - use the WS command `auth/delete_all_refresh_tokens` for a real sweep, then re-authenticate everything.
3.  **Kill every long-lived access token** you are not actively using. Check the profile list; anything with a 10-year expiry that a script minted years ago is a permanent backdoor with a forgotten name.
4.  **Rotate the backup password** after cleaning tokens, so old exported backups cannot re-import the old `.storage/auth`.
5.  **Audit add-ons with config access.** Anything that reads `.storage/` without a documented reason does not belong on an instance that unlocks your front door.
6.  **Detect it.** Watch for refresh-grant requests from unexpected user agents or IPs against `/auth/token`, and for `auth/long_lived_access_token` WS commands - a stolen token renews itself on use, so “active” tokens are not proof of the owner.
7.  **For vendors building the same shape of system** (any product with `.storage` -style local credential files): hash the secrets, make credential change revoke by default, and never store an encryption key beside the ciphertext it protects. The three failures here are one pattern.

The full audit, with file:line citations for every claim and the complete proof log, is on the oss-security list (thread: “Home Assistant: the password is not the key,” 8 November 2026) and in the researcher’s public repo. Read the source before you trust any summary, including this one.

*Analysis based on the public audit by knell; no third-party instance was touched in producing this writeup.*
