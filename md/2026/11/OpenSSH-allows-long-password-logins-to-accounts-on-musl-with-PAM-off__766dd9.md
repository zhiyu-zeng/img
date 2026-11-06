---
title: OpenSSH allows long-password logins to * accounts on musl with PAM off
source: https://nebusec.ai/research/musl-openssh-star-hash/
source_host: nebusec.ai
clip_date: 2026-11-06T15:08:37+08:00
trace_id: 3509fa54-0507-4f30-9a92-b531c57330c8
content_hash: b859cec7b7423cffd06bebf5720b7b3c46a099be74e69a89410d71949ce40fc8
status: synced
tags: []
series: null
feed_source: NebuSec
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41075244-d011-810c-832a-cb759def2a90
ioc:
  cves:
    - CVE-2026-123158
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

No password guessing. No stolen keys. On an affected Alpine server, a password made of 257 A’s is enough to log in to an account that was never supposed to accept a password.

## The short version

-   **What:** on some Linux systems, anyone who can reach the SSH port can log in to certain accounts by sending a very long password. They don’t need to know any real password.
-   **Who:** SSH servers on Linux systems built with musl libc, most commonly Alpine Linux, with PAM turned off. Alpine’s OpenSSH does not use PAM by default. Systems on glibc, such as Debian, Ubuntu and Fedora, are not affected, and neither is a box where no account has a password at all.
-   **Risk:** depending on the account, the attacker gets a shell, access to files over SFTP, or a tunnel into your internal network.
-   **Fix:** update OpenSSH and restart sshd. Alpine has fixed packages for every release from 3.16 to edge. Until you can update, turn off password login.

## How a \* became a skeleton key

Linux never stores your password. It stores a scrambled version, called a hash, and compares hashes when you log in. Accounts that should never log in with a password get a `*` in place of the hash. No real password scrambles to `*`, so a password login to those accounts always fails.

Many accounts are set up this way: system accounts that only run services, users who log in with SSH keys, and some default users on cloud images.

musl is a small C library that Alpine and many embedded Linux systems use in place of the more common glibc. When musl is asked to scramble a password longer than 256 bytes, it gives up and returns `*` as the result. To the SSH server, that looks like a match. But the match does not happen on the first try. The first failed attempt causes sshd to cache data for the next password check. If the attacker then sends a password of 257 to 1024 bytes at the second prompt in the same SSH connection, they can log in to an account whose stored password hash is `*`.

Each piece looks harmless on its own. musl uses `*` to say “I can’t hash this”, and sshd trusts that matching hashes mean the right password. Put them together and the lock opens for anyone.

On November 5, 2026, [OpenSSH 10.6p2](https://www.openssh.org/txt/release-10.6p2) shipped a workaround and called it critical. It is tracked as [CVE-2026-123158](https://www.cve.org/CVERecord?id=CVE-2026-123158), which MITRE scores at CVSS 8.1 (High), and Alpine published [fixed packages and an advisory](https://alpinelinux.org/posts/2026-11-05-openssh-password-authentication-bypass/) the same day. OpenSSH considers the root cause to be outside sshd, but exploitable through it.

## Am I affected?

**Probably not** if your servers run Debian, Ubuntu, Fedora, RHEL or another glibc-based system, if sshd goes through PAM, or if you use Dropbear or OpenBSD instead.

**Check now** if you run SSH on Alpine Linux, including Alpine-based Docker images and cloud images, or on embedded systems built with musl, such as some Buildroot and Yocto builds. Not sure what your servers or devices run? Forward this post to whoever manages them.

### Check a server in two minutes

Paste this into a root shell on the SSH server. It runs every check at once and changes nothing. It’s a quick screen for a default Alpine setup: a line that says `UNKNOWN` means that check couldn’t run. If your sshd isn’t on the `PATH`, put `SSHD=/path/to/sshd` on the first line.

```bash
[ "$(id -u)" = 0 ] || echo 'WARNING: not root, so some answers will say UNKNOWN'
SSHD=${SSHD:-$(command -v sshd || echo /usr/sbin/sshd)}
cfg=$("$SSHD" -T 2>/dev/null) || cfg=
case $(ldd "$SSHD" 2>&1 || echo FAIL) in *FAIL) libc=UNKNOWN ;; *musl*) libc=yes ;; *libc.so.6*|*ld-linux*) libc=no ;; *) libc=UNKNOWN ;; esac
[ -n "$cfg" ] && pam=$(echo "$cfg" | grep -qi '^usepam yes' && echo on || echo off) && pw=$(echo "$cfg" | grep -i '^passwordauthentication' | cut -d' ' -f2) || pam=UNKNOWN pw=UNKNOWN
star=$( [ -r /etc/shadow ] && awk -F: '$2 == "*" { printf "%s ", $1 }' /etc/shadow || echo UNKNOWN)
echo "1. musl: $libc   2. PAM: $pam   3. Password login: $pw   4. * accounts: ${star:-none}"
echo "5. Package: $(apk info --who-owns "$SSHD" 2>/dev/null | sed 's/.* owned by //' | grep . || echo 'UNKNOWN (not an apk package)')"
echo 'Recent password logins:'; grep -h 'Accepted password for' /var/log/messages /var/log/auth.log 2>/dev/null | tail -n 5
case "$libc $pam $pw $star" in 'no '*|*' on '*|*' no '*) v=No ;; *UNKNOWN*) v='UNKNOWN (run the live test)' ;; 'yes off yes '?*) v='Yes, unless line 5 shows a fixed package' ;; *) v=No ;; esac
echo "Affected: $v"
```

`Affected` sums up items 1 to 4. It can’t judge the package version, so check item 5 yourself. Treat the server as affected if all five point the same way:

1.  **musl** says `yes`.
2.  **PAM** says `off`. A build without PAM counts as off.
3.  **Password login** is `yes`. It is by default. `sshd -T` ignores `Match` blocks, so also check any `Match` section that turns it on.
4.  **`*` accounts** lists at least one account. One with a real shell in `/etc/passwd`, such as `/bin/sh`, is the worst case. This checks only local files; accounts supplied by LDAP or another directory are not shown.
5.  **Package** is older than [Alpine’s fixed list](https://alpinelinux.org/posts/2026-11-05-openssh-password-authentication-bypass/), such as `10.3_p1-r2` on 3.24. Alpine backported the fix by bumping only the `-rN` release, so compare the full version. On other systems, check the server package in your package manager: OpenSSH 7.3p1 through 10.6p1 is affected unless your vendor backported the fix.

### Confirm with a live test

Because Alpine’s fix only bumped the `-rN` release, item 5 is easy to misread. This optional script answers the question directly. It starts a throwaway sshd on `127.0.0.1` with fake accounts. To reproduce that two-step sequence, it first sends an incorrect password to set up sshd’s per-connection cache. It then sends the 257-byte password over the same connection.

It tests the sshd program installed on disk, not the one already running or your real config, so restart sshd after updating whatever it says. It swaps `/etc/passwd` and `/etc/shadow` only inside a private mount namespace, and it cleans up when it exits. It needs root, `unshare`, `setsid`, `timeout` and the `ssh` client. On Alpine, `apk add openssh-client util-linux-misc` installs anything missing.

```bash
wget -q https://nebusec.ai/tools/sshhole-live-test.sh && sh sshhole-live-test.sh
```

It prints `VULNERABLE` and exits with 1 if the installed sshd accepts the long password, or prints `NOT VULNERABLE` and exits with 0 if it doesn’t. On builds without PAM, a warning about `UsePAM` is expected.

### Check for past abuse

The last part of the script lists all successful password logins. Only an entry for an account shown on line 4 is a red flag. If you find one, treat the server as compromised. Look for new SSH keys, users, cron jobs and unknown processes, and rotate any secrets the server held.

## Close the hole today

**1\. Update OpenSSH and restart sshd.** Alpine shipped fixed packages for releases 3.16 through edge. Updating the package alone doesn’t replace the sshd that is already running, so restart it.

```bash
apk upgrade -U
rc-service sshd restart
```

In a container, restart the container instead.

On other musl-based systems, update to OpenSSH 10.6p2 or your vendor’s patched build.

**2\. Can’t update yet? Turn off password login.** Make sure you can log in with an SSH key first, or you will lock yourself out. On Alpine 3.19 and later, the [sshhole.com](https://sshhole.com/) write-up suggests a drop-in file:

```bash
echo "PasswordAuthentication no" > /etc/ssh/sshd_config.d/00-no-passwords.conf
sshd -t && rc-service sshd restart
```

sshd uses the first value it reads for each setting, so the `00-` prefix makes this file win over later ones. Alpine’s default config on 3.16 to 3.18 doesn’t read `sshd_config.d`, so there, set `PasswordAuthentication no` in `/etc/ssh/sshd_config` above any `Match` block and restart sshd. On any version, also remove or change `PasswordAuthentication yes` inside `Match` blocks, because those override the global setting.

Either way, run the check script again. Line 3 must say `passwordauthentication no`, or the fix didn’t take. If you use `Match` blocks, also check them with the user, host and address they match:

```bash
sshd -T -C user=alice,host=example.com,addr=203.0.113.5 | grep '^passwordauthentication '
```

**3\. Rebuild images.** Docker images and VM templates keep the old OpenSSH until you rebuild them.

**4\. For devices you don’t control,** such as routers and appliances, ask the vendor whether their firmware uses musl with OpenSSH, and watch for updates.

## Under the hood

For readers who want the technical detail.

When sshd checks a password, it hashes what the user sent with the salt stored in their hash, then compares the result with the stored hash. A `*` entry has no salt. So that the check takes the same time as for a real account, sshd [borrows the salt from another account](https://github.com/openssh/openssh-portable/blob/master/openbsd-compat/xcrypt.c): the first account in `/etc/passwd` order with a `$` -style hash. SHA-256 and SHA-512 are the confirmed route. Other hash types may also lead to a `*` result, so don’t treat their absence as proof of safety.

This takes two password attempts in the same SSH connection. The first attempt fails, but while handling it sshd finds another account’s salt and caches it in that connection’s sshd process. Looking up that account also overwrites musl’s shared shadow-password buffer, which prevents the first attempt from matching the target account’s original `*`.

At the second password prompt, sshd reuses the cached salt without repeating that lookup. Give it a password longer than 256 bytes and musl’s SHA-256 or SHA-512 `crypt()` returns `*`, as the [`KEY_MAX` check](https://git.musl-libc.org/cgit/musl/tree/src/crypt/crypt_sha256.c) shows. The target account’s stored value is also `*`, so the comparison succeeds. Starting a new SSH connection starts with an empty cache, so the failed priming attempt must happen again.

sshd accepts passwords up to 1024 bytes, which is why 257 to 1024 bytes works. PAM avoids the problem because sshd then doesn’t call `crypt()` itself.

The [OpenSSH fix](https://github.com/openssh/openssh-portable/commit/4353fdc43ef646c43a8dda7025cc1a898caf1482) refuses to match any stored hash shorter than four characters, so a `*` account can never pass.

## Hiding in plain sight since 2024

In December 2024, a [patch on the musl mailing list](https://www.openwall.com/lists/musl/2024/12/29/2) proposed returning an error instead of `*`, after long passwords crashed `passwd` on Alpine. It was never merged, and musl’s current source still returns `*`.
