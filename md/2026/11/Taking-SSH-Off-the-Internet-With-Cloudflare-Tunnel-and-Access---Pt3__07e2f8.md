---
title: Taking SSH Off the Internet With Cloudflare Tunnel and Access - Pt3
source: https://blog.zsec.uk/ssh-ghost-3/
source_host: blog.zsec.uk
clip_date: 2026-11-26T11:04:45+08:00
trace_id: 9744ec04-4d76-4223-ba77-0f7d5da6a296
content_hash: 7cbcca57cd6f0f0abf8341d2edee1edf17a33c4f1a223668e91d7392d6ef178d
status: synced
tags: []
series: null
feed_source: zsec·逆向安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 42475244-d011-815e-916b-da9d88e20181
ioc:
  cves:
    - CVE-2026-123007
    - CVE-2026-123633
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

![Taking SSH Off the Internet With Cloudflare Tunnel and Access - Pt3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/96fd6d42e6823492.jpg)

If you haven't read Parts 1 and 2, check them out first, as this is the last of the three and carries straight on from them.

[Part 1](https://blog.zsec.uk/ssh-ghost-1/) closed the SSH port and [Part 2](https://blog.zsec.uk/ssh-ghost-2/) locked the origin and added detection. This part covers the remaining hardening: outside verification, further SSH tightening, the mistakes I made, and OS-level work that matters on the same box.

In this final part I'm going to cover:

-   Checking it all from the outside
-   Going further with SSH: short-lived certificates, hardware keys and tighter settings
-   Locking down the Cloudflare account that everything now depends on
-   The mistakes that bit me along the way
-   Kernel and OS hardening, plus housekeeping
-   Re-checking it all against a critical nginx CVE, then moving to nginx.org's packages
-   What all of this doesn't protect against

## Step 6: Check It From the Outside

"Done" meant a scan of the origin IP finds nothing, so scan it from a machine that isn't the server, on a network that isn't Cloudflare's. Scanning your own server is normally fine, but check your provider's terms first.

```bash
nmap -Pn -p- --open <origin-ip>                # expect no open ports
sudo nmap -Pn -sU --top-ports 50 <origin-ip>   # and nothing on common UDP ports
ssh -o ConnectTimeout=5 you@<origin-ip>        # times out
curl -sk --connect-timeout 5 --resolve blog.example.com:443:<origin-ip> https://blog.example.com/   # times out
```

Then check the ways that should work still do: `curl -sI https://blog.example.com/` returns 200 through Cloudflare, `ssh blog-tunnel` gets you a shell after the Access login, and `/ghost/` asks for the Access login in a private window.

![Taking SSH Off the Internet With Cloudflare Tunnel and Access - Pt3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0bf3a4f47691e74b.png)

From the outside, nothing answers on the origin IP; everything goes through Cloudflare

Keep the origin IP out of anything you publish, including screenshots of these commands.

## Going Further With SSH

Everything above is the baseline, and the sections below go further, roughly in order of how much they add; On this server I've done the short-lived certificates, `AllowUsers` and the MAC trimming, and the rest are options worth weighing up for your own.

### Short-Lived Certificates From Access

Access can act as an SSH certificate authority, so after the Access login `cloudflared` gets a certificate that expires within minutes and the server trusts the CA instead of a list of keys, which means a stolen laptop key is useless on its own.

1.  In Zero Trust, find the short-lived certificate settings under Access service credentials, pick your SSH application and generate a certificate, then save the public key it shows on the server as `/etc/ssh/ca.pub`.
2.  Add `TrustedUserCAKeys /etc/ssh/ca.pub` to the hardening drop-in, then `sshd -t && systemctl reload ssh`.
3.  The certificate's principal is the part of your Access email before the `@`, so if your Unix username doesn't match, map it with `AuthorizedPrincipalsFile /etc/ssh/principals/%u`. I log in as root, so `/etc/ssh/principals/root` holds my principal and nothing else.
4.  On the laptop, `cloudflared access ssh-config --hostname xxxxxxxxxx.example.com --short-lived-cert` prints the SSH config block to use, and it replaces the Part 1 `Host blog-tunnel` block rather than sitting alongside it, because `IdentitiesOnly yes` with a fixed `IdentityFile` stops the certificate from ever being offered.
5.  Once a certificate login works, and sshd's log shows `ECDSA-CERT` for it rather than a plain key, remove the long-lived key from `authorized_keys`; mine is now empty, so a key copied off my laptop no longer opens anything.

Cloudflare's dashboard labels have changed over time and the newer Access for Infrastructure option uses the WARP client, so check the current docs before you start.

### Hardware-Backed Keys

A FIDO2 security key keeps the private key on the hardware, and `verify-required` makes it ask for the key's PIN on every login:

```bash
ssh-keygen -t ed25519-sk -O resident -O verify-required -C "you@laptop"
```

Put the new public key in `authorized_keys` and add `PubkeyAuthOptions verify-required` to the drop-in so sshd rejects signatures made without the PIN, but only once every `-sk` key you use was created with `verify-required`, because keys in a password manager can't meet that requirement.

### Pin the Key to the Tunnel

Every tunnel login arrives from loopback, which means you can restrict the key to loopback in `authorized_keys`:

```
from="127.0.0.1,::1" ssh-ed25519 AAAA... you@laptop
```

If sshd were ever reachable on a public address, that key would still be refused from outside, and with certificates the same `from=` option works at the start of a line in the principals file.

### Tighter sshd Settings

```
# add to /etc/ssh/sshd_config.d/00-hardening.conf
AllowUsers root          # or your named user - test a login from a second session first
DisableForwarding yes
ClientAliveInterval 300
ClientAliveCountMax 2
```

`AllowUsers` refuses every other account, including service accounts that somehow gain a key, while `DisableForwarding` (OpenSSH 8.4+) turns off agent, X11, TCP and socket forwarding in one line, and the `ClientAlive` lines drop a connection whose client has stopped responding after about ten minutes (a genuinely idle session stays up, since the client still answers, and OpenSSH 9.2+ has `ChannelTimeout` if you want those closed too).

I run `AllowUsers root` here, since root is the only account that ever logs in, and it's a cheap extra layer even with the port never exposed: any other account is refused before a key or certificate is even looked at, and sshd logs it as `not listed in AllowUsers`, which makes a nice tripwire in its own right.

### Modern Algorithms Only

[ssh-audit](https://github.com/jtesta/ssh-audit?ref=blog.zsec.uk) lists every key exchange, cipher, MAC and host key your server offers, and flags the weak ones:

```bash
apt install ssh-audit
ssh-audit 127.0.0.1
```

Follow its recommendations for your OpenSSH version, and add a `HostKey /etc/ssh/ssh_host_ed25519_key` line to the drop-in so sshd only offers that key; clients that saved a different key type will warn once and then get on with it.

I've also trimmed the MACs to the ETM SHA-2 variants, so `hmac-sha1` and `umac-64` are gone. With chacha20 or GCM ciphers the MAC isn't used at all, but it tidies up the ssh-audit output, and a quick `ssh -o Ciphers=aes128-ctr -o MACs=hmac-sha1 127.0.0.1` should now fail with `no matching MAC found`:

```
# add to /etc/ssh/sshd_config.d/00-hardening.conf
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,umac-128-etm@openssh.com
```

### Stricter Access Policies

The SSH application's policy can require more than an email address. Add *Require* rules for:

-   **MFA:** require an MFA authentication method from your identity provider.
-   **Country:** limit logins to the countries you actually work from.
-   **Device posture:** with the WARP client installed, require a managed device or a specific posture check.

Each rule is checked at every Access login, before anything reaches the server.

### Make sudo Ask for a Password

If you log in as a named user, a key gets you a shell, but a password should still stand between that shell and root. Cloud images often grant passwordless sudo to the default user, and that user often has no password at all, so set one first (`passwd <user>`) and check that `sudo -v` accepts it from a second session, because removing NOPASSWD from a user with no password leaves you with no sudo, and with `PermitRootLogin no`, no way to root either. Then find and remove those grants:

```bash
grep -rn NOPASSWD /etc/sudoers /etc/sudoers.d/
visudo -c        # after editing, check the syntax before you log out
```

## Locking Down the Cloudflare Account

Step back and look at where the trust ended up, ultimately access decides who gets a shell, the zone decides who reaches the origin, and anyone who can change either of those doesn't need to touch the server at all, so the Cloudflare account is now the thing to protect and important to protect in general if it is controlling access to administrative interfaces.

Start with MFA on the account, ideally a hardware security key rather than an authenticator app, and do the same on the identity provider Access uses, since that's the other half of every SSH login. Then look at API tokens and never hand a script the Global API Key: the fail2ban token in Part 2 can only edit firewall rules on one zone, and every other script should get its own token with the least it needs, plus an expiry if it's a one-off.

Keep the member list short too, because anyone with Super Administrator can rewrite Access policies, and keep an eye on the audit log under Manage Account → Audit Logs. Changes to Access applications, policies, tunnels and DNS all land there, so it's the first place I'd look if a login alert ever caught me by surprise. The hosting provider's account deserves the same treatment, since its web console is the other way into the box.

So where did that leave things? The origin only accepts connections on 443 from Cloudflare, and only when the request carries my zone's client certificate, while getting a shell needs an identity check at Cloudflare plus a short-lived certificate from Access, and the only other way in, the provider's console, stays shut until I open it. The next sshole would have to get through all of that first.

*Thanks to Özgün Kültekin for the* [*sshole write-up*](https://github.com/oz9un/sshole?ref=blog.zsec.uk) *that started this.*

## Kernel Tuning

With SSH and the web side sorted, the rest of this part is about the box itself, starting with a `sysctl.d` drop-in that covers both security and performance:

**Security:** `rp_filter=1` (strict reverse-path), `log_martians=1`, `send_redirects=0`, `accept_redirects=0` (not a router), `accept_source_route=0`.

One catch with `log_martians`: ufw applies its own sysctl file, `/etc/ufw/sysctl.conf`, every time it starts, and that sets `log_martians` back to 0 - quietly overriding whatever you put in `sysctl.d`. I only noticed when I checked the live value against this post, so change it in ufw's file too, and check with `sysctl net.ipv4.conf.all.log_martians` after a reboot rather than trusting the file.

**Performance for a web server:** `tcp_fastopen=3`, `somaxconn=1024`, `tcp_tw_reuse=1`, `tcp_keepalive_time=300`, `swappiness=10`. Nothing exotic, just moving the defaults from "general purpose VM" to "web server that gets bursty traffic".

### Core Dumps

I disabled core dumps completely, because while the soft limit was already 0 (the Ubuntu default), the hard limit was `infinity`, so any process could re-enable them with `ulimit -c unlimited`, and a core dump can contain database credentials, API tokens, session secrets or whatever else was in memory at the time.

```
# /etc/security/limits.d/99-no-coredumps.conf
*               hard    core            0
root            hard    core            0
```

Belt and braces, `kernel.core_pattern` is piped to `/bin/false` via sysctl, and that matters more than it looks: the limits files only cover login sessions, since systemd services don't go through PAM (Ghost's unit still reports `LimitCORE=infinity`), so this is what actually stops a service writing a core, with the kernel handing the dump to `/bin/false`, which exits straight away.

## Kernel Module Blacklisting

A headless VPS has no use for joystick drivers, WiFi, NTFS or USB storage, and every loaded module is attack surface, since a vulnerability in an unused module can still be triggered by a local attacker or a container escape, so blacklist the obvious ones:

```
# /etc/modprobe.d/server-hardening.conf
blacklist joydev
blacklist cfg80211
blacklist binfmt_misc
blacklist vga16fb
blacklist vgastate
blacklist btrfs
blacklist firewire-core
blacklist thunderbolt
blacklist usb-storage
blacklist uas
```

`binfmt_misc` deserves a mention on its own: it allows executing foreign binary formats and has been used in container-escape chains, so unless you're running multi-arch containers or Wine, blacklist it.

Bear in mind `blacklist` only stops a module being loaded automatically by its alias, and anything that asks for it by name still gets it, so for a hard block add an `install <module> /bin/false` line for each one as well and run `update-initramfs -u`.

One side effect turns up on the next reboot: systemd still tries to mount `binfmt_misc` at boot (via `systemd-binfmt`, and snapd if you've got it), the mount fails, and you're left with three failed units, `proc-sys-fs-binfmt_misc.automount`, `proc-sys-fs-binfmt_misc.mount` and `systemd-binfmt.service`. They're harmless - the blacklist is doing exactly what it should - but they clutter `systemctl --failed` and any status script built on it, which is how I found them, so mask them and systemd stops trying:

```bash
systemctl mask proc-sys-fs-binfmt_misc.automount \
  proc-sys-fs-binfmt_misc.mount systemd-binfmt.service
systemctl reset-failed
```

If you ever do need multi-arch containers, `systemctl unmask` the same three and drop the blacklist line.

## SUID Audit

Ubuntu ships a couple of binaries with special permission bits that have no business on a server: `ntfs-3g` is setuid root (NTFS filesystem mounter, and there are no NTFS drives on a VPS) and `w3mimgdisplay` is setgid `video` (image rendering for a text-mode browser). A plain `chmod` only lasts until the next package upgrade puts the bit back, so register the change with `dpkg-statoverride`, which sets the mode now and keeps it through upgrades:

```bash
dpkg-statoverride --update --add root root 0755 /usr/bin/ntfs-3g
dpkg-statoverride --update --add root video 0755 /usr/lib/w3m/w3mimgdisplay
find / -xdev -perm /6000 -type f 2>/dev/null   # review what's left
```

The standard SUID set (`sudo`, `su`, `passwd`, `mount`, `umount`, `newgrp`, `crontab`, `ssh-agent`, `pkexec`) is expected and needed, and if you're running `sudo-rs` (the Rust rewrite) you'll also see `/usr/lib/cargo/bin/su` and `sudo`, which are intentional too.

## Housekeeping

Things that aren't security per se but keep a small VPS healthy:

-   **Unattended upgrades** cover Ubuntu security + updates, cloudflared, Docker, GitHub CLI and nginx.org (see below). Kernel updates are included too; livepatch handles critical kernel fixes in between, and the automatic reboot from Part 2 picks up each new kernel.
-   **Daily log compression timer** catches Ghost's rotated logs, which ghost-cli doesn't compress.
-   **Weekly Ghost updates** on a systemd timer: `ghost update` runs as the ghost-cli user (the one with scoped sudo, not the `ghost` service user), restores file permissions afterwards and emails me a report.
-   **Disabled desktop services** that Ubuntu ships by default (`accounts-daemon`, `switcheroo-control`, `udisks2`, `multipathd`, `apport`), none of which serve a purpose on a headless VPS.
-   **Purged `popularity-contest`**, Ubuntu telemetry phoning home from production.
-   **Snap revision retention** set to 2 (`snap set system refresh.retain=2`), because the default keeps two old revisions per snap eating disk, and on a VPS where snap is only there for livepatch, that's pure waste.
-   **Monthly DB optimisation** via `mysqlcheck --optimize`, since Ghost's `post_revisions` table is the biggest at ~30MB and InnoDB fragmentation builds up on tables with heavy UPDATE/DELETE cycles.
-   **DMARC at p=reject** for both `zsec.uk` and `blog.zsec.uk`; the newsletter goes out through Mailgun with SPF and DKIM both aligned, and aggregate reports go to Cloudflare's DMARC dashboard so I can see if anything legitimate starts failing.

## Moving nginx to nginx.org's Packages

While I was still finishing these posts, my hosting provider emailed about two critical HTTP/2 bugs in nginx, CVE-2026-123633 and CVE-2026-123007, disclosed on 18 November. Both are CVSS 9.2, both are unauthenticated code execution, and the advice was to get onto 1.30.7 stable. `nginx -v` on this box said 1.28.3, which on the face of it is vulnerable.

It wasn't, though, Ubuntu backports security fixes into its own package without bumping the upstream version number, and unattended upgrades had already pulled in the patched build, which the package changelog will tell you, so check that before you panic:

```bash
zgrep -E 'CVE-2026-(123633|123007)' /usr/share/doc/nginx/changelog.Debian.gz
```

It was still a good excuse to re-check the lockdown from Parts 1 and 2, because a remotely exploitable bug in the web server is exactly the sort of thing all of it was built for.

Was the origin still Cloudflare-only? Yes - ufw and the cloud firewall only let Cloudflare's ranges in on 443, so nobody could talk HTTP/2 to nginx directly, and Cloudflare terminates visitors' HTTP/2 at the edge. Authenticated origin pulls wouldn't have saved me on their own, mind, because nginx finishes the handshake and parses the request before it sends a client without a certificate away with a 400. Was HTTP/2 on? Also yes, `http2 on;`, so the box was in scope until patched.

Was the patched binary the one actually running? It was, since the automatic reboot had restarted nginx after the update, and a patched package on disk with the old workers still running isn't patched. Did anything else on the box bundle its own nginx? No, the only container is Ghost's traffic-analytics service.

I moved to nginx.org's stable repo anyway, mainly so the version number matches upstream and the next advisory is a straight `nginx -v` comparison rather than a rummage through a Debian changelog. Check the key fingerprints against the ones on nginx.org's Linux packages page before you trust it:

```bash
curl -fsS https://nginx.org/keys/nginx_signing.key | gpg --dearmor -o /usr/share/keyrings/nginx-archive-keyring.gpg
gpg --show-keys /usr/share/keyrings/nginx-archive-keyring.gpg

# /etc/apt/sources.list.d/nginx-org.sources (Suites = your Ubuntu codename)
Types: deb
URIs: https://nginx.org/packages/ubuntu
Suites: resolute
Components: nginx
Signed-By: /usr/share/keyrings/nginx-archive-keyring.gpg

# /etc/apt/preferences.d/99nginx-org
Package: *
Pin: origin nginx.org
Pin: release o=nginx
Pin-Priority: 900
```

The swap itself is mostly painless, but a few things caught me out:

-   It leaves nginx stopped. nginx.org's package conflicts with Ubuntu's `nginx-common`, so apt removes Ubuntu's nginx, which stops the service, then installs the new one and doesn't start it. My blog was down for about 20 seconds, so start it in the same command.
-   Install with `--force-confold` so Ubuntu's `nginx.conf` (the one with `sites-enabled` and `user www-data`) and its logrotate file survive.
-   It drops in a sample `conf.d/default.conf`, a port 80 server that your `conf.d/*.conf` include will happily pick up, so bin it.
-   Check `/etc/nginx/modules-enabled/` before you start it. Ubuntu's dynamic module packages (`libnginx-mod-*`) are built for Ubuntu's nginx and won't load into nginx.org's build, so `nginx -t` fails until you remove them or comment out the include.
-   Temp paths move to `/var/cache/nginx/*_temp`; I pointed them back at the existing `/var/lib/nginx/` directories.
-   Log rotation quietly breaks fail2ban, and this is the one that would have bitten. Ubuntu's logrotate `postrotate` runs `invoke-rc.d nginx rotate`, nginx.org's init script has no `rotate` action, and the error goes to `/dev/null`, so after the first rotation nginx keeps writing to `access.log.1` while fail2ban watches the new, empty `access.log`, and banning just stops with nothing in any log to tell you, which is why it's worth sending nginx `USR1` instead.
-   unattended-upgrades ignores the new repo until you add it to the allowed origins, so without that you've swapped automatic patching for remembering to do it yourself.

```bash
apt update
apt install -o Dpkg::Options::=--force-confold nginx && systemctl enable --now nginx
rm /etc/nginx/conf.d/default.conf && nginx -t && systemctl reload nginx

# /etc/nginx/conf.d/temp-paths.conf
client_body_temp_path /var/lib/nginx/body;
proxy_temp_path       /var/lib/nginx/proxy;

# /etc/logrotate.d/nginx, in postrotate (replaces invoke-rc.d nginx rotate)
[ -s /run/nginx.pid ] && kill -USR1 "$(cat /run/nginx.pid)"

# /etc/apt/apt.conf.d/53unattended-nginx-org
# codename = your Ubuntu release codename
Unattended-Upgrade::Origins-Pattern { "origin=nginx,codename=resolute"; };
```

Then make sure fail2ban actually survives a rotation: force one, send a request from loopback that the `nginx-secrethunt` filter matches, and fail2ban should log that it saw it and ignored it (loopback is in `ignoreip`, so you won't ban yourself):

```bash
logrotate -f /etc/logrotate.d/nginx
curl -sk -o /dev/null --resolve blog.example.com:443:127.0.0.1 https://blog.example.com/.env
grep 'Ignore 127.0.0.1' /var/log/fail2ban.log | tail -1
# [nginx-secrethunt] Ignore 127.0.0.1 by ignoreself rule
```

Last check: `unattended-upgrade --dry-run --debug` should list `origin=nginx` in its allowed origins.

## Testing It

A few things I wish I'd known earlier:

1.  **Don't test Cloudflare rules from your origin.** If your origin IP is on the zone's IP Access allowlist, WAF custom rules are silently skipped, so use `cf request-tracers` or the dashboard Trace tool instead.
2.  **Don't test nginx auth from localhost.** `satisfy any` with `allow 127.0.0.1` will pass the access module before `auth_request` or `auth_basic` are even evaluated.
3.  **Test Ghost updates from the right user.** ghost-cli's `ghost update` needs scoped sudo, which means the ghost-cli user rather than the `ghost` service user, and the wrong user stalls silently on a password prompt and the unattended timer dies.
4.  **Watch for `auth_basic "off"` with `satisfy any`.** It exits evaluation, it doesn't fail. If you need "no basic auth when another method passed", use `auth_request` instead.

## What This Doesn't Protect Against

None of this makes the box untouchable, and it's worth being honest about where the gaps are and accepting a certain degree of risk, ultimately I've taken steps to lockdown my blog, which is after all, a security blog but ultimately it may be an extreme case of locking things down for a handful of unpublished drafts!

Ghost itself is still reachable, everything here controls who can reach the origin and who gets a shell, but readers still get to Ghost through Cloudflare, so a bug in Ghost or the theme is still a way in, and keeping Ghost updated with the WAF in front is the defence there.

The accounts matter as much as the box, because whoever controls the Cloudflare account controls Access, the tunnel and DNS, and the provider's console skips the tunnel entirely, so both accounts and their MFA are part of the perimeter whether you like it or not. The same goes for the laptop: an Access session and a short-lived certificate on a machine someone else controls is still a shell, which is where hardware keys and short Access sessions earn their place.

Then there's the supply chain: packages, Docker images and npm dependencies run with whatever privileges you give them, so pinning images by digest and sandboxing services limits the damage, but it won't stop a bad update.

## Wrapping Up

There we go, all set up and done! Quick recap, across the three parts we've:

-   Taken SSH off the internet with Cloudflare Tunnel and Access
-   Locked the web origin to my own Cloudflare zone
-   Added detection, alerts and off-site backups
-   Sandboxed the services and hardened the OS underneath them
-   Checked all of it from the outside

Three posts on, nothing on the internet can reach SSH unless I open the console rule, the web origin only answers my own Cloudflare zone, and if something does go wrong I'll hear about it and can get the blog back from an off-site backup.

None of it is exotic, and a fair chunk of the work was checking that each layer actually did what I thought it did, which wasn't always the case: the nginx sandbox I thought I had turned out to be a no-op, and ufw was quietly switching off `log_martians` behind my back. If you take one thing from the series, check the live value rather than trusting the config file.

If you spot something I've missed or got wrong, give me a shout.

The blog is at [blog.zsec.uk](https://blog.zsec.uk/), and the Cloudflare WAF rule for the aocr.org bot from my [previous post](https://blog.zsec.uk/aocr-org-referrer-bot/) is still in place and still catching it.
